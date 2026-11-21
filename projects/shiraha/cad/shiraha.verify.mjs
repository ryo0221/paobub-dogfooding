// PaoBub の tsx で実行する。引数は PaoBub のルートと、生成した検査用組立の道筋。
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {gzipSync, gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const [runner, ...paths] = process.argv.slice(2);
if (!runner || !paths.length) throw new Error('PaoBub のルートと検査する組立を指定してください');
const packages = createRequire(resolve(runner, 'package.json'));
const load = path => import(pathToFileURL(path).href);
const {checkInterference} = await load(packages.resolve('@editor-platform/geometry-core/interference'));
const {assertCad, cadContentHash, composePoses, identityPose, invertPose, parameterValues, solveJoints} =
  await load(packages.resolve('@editor-platform/cad-core'));
const {readAssembly, evaluateParts} = await load(resolve(runner, 'packages/runner/src/cad/check.ts'));
const {assembly, closure, files} = readAssembly(process.cwd(), 'cad/shiraha.cad.json');
assertCad(assembly);
const cache = '.paobub/cad/evaluated';
mkdirSync(cache, {recursive:true});
for (const [path, part] of files) {
  const hash = cadContentHash(part), file = cache + '/' + hash + '.json.gz';
  if (existsSync(file)) continue;
  const evaluated = await evaluateParts(new Map([[path, part]]));
  if (evaluated.failures.length) throw new Error(JSON.stringify(evaluated.failures));
  writeFileSync(file, gzipSync(JSON.stringify(evaluated.meshes.get(hash))));
}

function bounds(points) {
  const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (let i = 0; i < 3; i++) {
    low[i] = Math.min(low[i], p[i]);
    high[i] = Math.max(high[i], p[i]);
  }
  return [low, high];
}

function corners([a, b]) {
  return [a[0], b[0]].flatMap(x => [a[1], b[1]].flatMap(y => [a[2], b[2]].map(z => [x, y, z])));
}

const origin = identityPose();
const transform = (pose, point) => composePoses(pose, {...origin, translationMm: point}).translationMm;
const parts = assembly.components.map(component => {
  const {source} = assembly.parts.find(p => p.id === component.partId);
  const doc = files.get(source.artifactId), hash = cadContentHash(doc);
  if (hash !== source.contentHash) throw new Error(source.artifactId);
  const raw = JSON.parse(gunzipSync(readFileSync(cache + '/' + hash + '.json.gz')));
  if (doc.bodies.some(b => !raw.some(m => m.bodyId === b.id))) throw new Error('曲面がありません: ' + component.name);
  const boxes = [];
  const bodies = doc.bodies.map(body => {
    const meshes = raw.filter(m => m.bodyId === body.id).map(m => {
      const positions = Float64Array.from(m.positions, (v, i) => v + m.origin[i % 3]);
      const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < positions.length; i++) {
        low[i % 3] = Math.min(low[i % 3], positions[i]);
        high[i % 3] = Math.max(high[i % 3], positions[i]);
      }
      boxes.push(low, high);
      return {positions, indices: Uint32Array.from(m.indices)};
    });
    return {id: component.id + '/' + body.id, group: component.id, meshes};
  });
  return {id: component.id, bodies, corners: corners(bounds(boxes))};
});
const pairKey = (a,b) => [a,b].sort().join('/');
const regions = new Map(assembly.interferenceAllowances.map(r => [pairKey(r.a[0], r.b[0]), r.region]));
const pairs = [];
for (const [i, a] of parts.entries()) for (const b of parts.slice(i+1)) {
  const region = regions.get(pairKey(a.id, b.id));
  if (region?.kind === 'pair') continue;
  let mount;
  if (region) {
    if (region.kind !== 'joint-sphere') throw new Error(region.kind);
    const j = assembly.joints.find(j => j.id === region.joint);
    mount = {parent: j.parent.componentPath[0], pivot: j.parent.offset.translation.map(v => v.literalMm),
      radiusMm: region.radiusMm};
  }
  pairs.push({a,b,mount,memo:new Set()});
}

// 部品対に分けても、交差・包含・判定不能と許容球の判定は CAD 本体と共通。
const setup = d => JSON.stringify({...d, configurations: []});
const base = setup(assembly);
for (const path of paths) {
  const doc = JSON.parse(readFileSync(path,'utf8'));
  if (setup(doc) !== base) throw new Error(path + ': 部品・関節・許容領域が全身組立と異なります');
  if (!doc.configurations?.length) throw new Error(path + ': 検査する姿勢がありません');
  let minHeightMm = Infinity;
  for (const form of doc.configurations) {
    const joints = doc.joints.map(j => {
      const values = form.values[j.id];
      if (!values || Object.keys(j.values).some(axis => !(axis in values))) {
        throw new Error(form.name + ': 関節値がありません: ' + j.id);
      }
      for (const {of, min, max} of j.limits) {
        const [value] = Object.values(values[of]);
        if (!Number.isFinite(value) || value < min - 1e-8 || value > max + 1e-8) {
          throw new Error(form.name + ': 可動域外: ' + j.id + '/' + of);
        }
      }
      return {...j, values};
    });
    const solved = solveJoints({...doc, joints}, parameterValues(doc), h => closure.get(h), () => undefined, () => true);
    if (Object.keys(solved.poses).length !== parts.length ||
        Object.values(solved.joints).some(j => !['solved','ok'].includes(j.status))) throw new Error(form.name);
    const boxes = new Map();
    for (const p of parts) {
      const pose = solved.poses[p.id];
      const box = bounds(p.corners.map(v => transform(pose,v)));
      boxes.set(p.id, box);
      if (p.id === 'c-ground' || box[0][2] >= minHeightMm) continue;
      const [x,y,z,w] = pose.rotation;
      const nx = 2*(x*z-w*y), ny = 2*(y*z+w*x), nz = 1-2*(x*x+y*y);
      for (const body of p.bodies) for (const {positions:v} of body.meshes) {
        for (let i=0; i<v.length; i+=3) {
          minHeightMm = Math.min(minHeightMm, nx*v[i] + ny*v[i+1] + nz*v[i+2] + pose.translationMm[2]);
        }
      }
    }
    for (const {a,b,mount,memo} of pairs) {
      const [al,ah] = boxes.get(a.id), [bl,bh] = boxes.get(b.id);
      if (al.some((v,k) => v > bh[k] || bl[k] > ah[k])) continue;
      const relative = composePoses(invertPose(solved.poses[a.id]), solved.poses[b.id]);
      const key = [...relative.rotation,...relative.translationMm].map(n => n.toFixed(11)).join(',');
      if (memo.has(key)) continue;
      const room = mount ? [{a:a.id, b:b.id, region:{kind:'sphere', radiusMm:mount.radiusMm,
        centerMm:mount.parent === a.id ? mount.pivot : transform(relative,mount.pivot)}}] : [];
      const result = checkInterference([
        ...a.bodies.map(s => ({...s,pose:origin})), ...b.bodies.map(s => ({...s,pose:relative})),
      ], room);
      if (result.status !== 'ok' || result.findings.length) {
        throw new Error(JSON.stringify({form:form.name, a:a.id, b:b.id, result}));
      }
      memo.add(key);
    }
  }
  if (!Number.isFinite(minHeightMm) || minHeightMm < 0) throw new Error(path + ': 地面より下 ' + minHeightMm + ' mm');
  console.log(JSON.stringify({path, poses:doc.configurations.length, minHeightMm, interferences:0, unknown:0}));
}
