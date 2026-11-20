// shiraha.verify.mjs と同じ PaoBub ルートを渡す。検査に使った CAD の曲面と保存姿勢を描く。
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {gunzipSync, gzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const runner = process.argv[2];
if (!runner) throw new Error('PaoBub のルートを指定してください');
const packages = createRequire(resolve(runner, 'package.json'));
const load = path => import(pathToFileURL(path).href);
const {readAssembly, evaluateParts} = await load(resolve(runner, 'packages/runner/src/cad/check.ts'));
const {boundsOf, renderPng, sideBySide, viewCamera} = await load(resolve(runner, 'packages/runner/src/cad/raster.ts'));
const {cadContentHash, parameterValues, solveJoints} = await load(packages.resolve('@editor-platform/cad-core'));
const {assembly, closure, files} = readAssembly(process.cwd(), 'cad/shiraha.cad.json');
const cache = '.paobub/cad/evaluated';
mkdirSync(cache, {recursive: true});
const geometry = new Map();
for (const {id, source} of assembly.parts) {
  if (id === 'p-ground') continue;
  const doc = files.get(source.artifactId);
  const hash = cadContentHash(doc);
  if (hash !== source.contentHash) throw new Error(source.artifactId);
  const path = cache + '/' + hash + '.json.gz';
  if (!existsSync(path)) {
    const evaluated = await evaluateParts(new Map([[source.artifactId, doc]]));
    if (evaluated.failures.length) throw new Error(JSON.stringify(evaluated.failures));
    writeFileSync(path, gzipSync(JSON.stringify(evaluated.meshes.get(hash))));
  }
  geometry.set(id, JSON.parse(gunzipSync(readFileSync(path))));
}

function placed(name) {
  const form = assembly.configurations.find(f => f.name === name);
  const joints = assembly.joints.map(j => ({...j, values: form.values[j.id]}));
  const result = solveJoints({...assembly, joints}, parameterValues(assembly), h => closure.get(h), () => undefined, () => true);
  if (Object.values(result.joints).some(j => !['ok', 'solved'].includes(j.status))) throw new Error(name);
  return assembly.components.filter(c => geometry.has(c.partId)).flatMap(c =>
    geometry.get(c.partId).map(mesh => ({id: c.id, pose: result.poses[c.id], mesh})));
}

const root = 'review/model/';
const frames = [placed('FM-02 人の形'), ...[25, 50, 75, 100].map(p => placed('SP-04 兜を外す ' + p + '%'))];
const bare = placed('FM-04 人の形（素顔）');
const headParts = new Set(['c-neck3', 'c-helmet-arm', 'c-helmet']);
const heads = frames.flatMap(items => items.filter(p => headParts.has(p.id)));
// 組立を左斜め前から同一倍率で撮る。全段階の可動範囲に合わせて注視点を固定する。
const [lo, hi] = boundsOf(heads);
const center = lo.map((v, i) => (v + hi[i]) / 2);
center[2] -= 160;
const direction = [.680, -.732, .036];
const aspect = 1.36;
const halfHeight = Math.max((hi[2] - lo[2] + 900) / 2,
  ((hi[1] - lo[1]) * direction[0] + (hi[0] - lo[0]) * -direction[1] + 450) / (2 * aspect));
const distance = 55000;
const camera = {
  at: center, eye: center.map((v, i) => v + direction[i] * distance),
  fov: 2 * Math.atan(halfHeight / distance) * 180 / Math.PI,
};
frames.forEach((items, i) => writeFileSync(root + 'helmet-open-' + i + '.png', renderPng(items, camera, 1190, 875)));

const profileBounds = boundsOf(bare.filter(p => headParts.has(p.id)));
profileBounds[0][2] -= 420;
profileBounds[1][2] += 80;
const collar = new Set([...headParts, 'c-torso', 'c-neck1', 'c-neck2']);
const profile = bare.filter(p => collar.has(p.id));
writeFileSync(root + 'face-side.png', renderPng(profile, viewCamera('left', profileBounds, 5), 1100, 880));
const side = renderPng(bare, viewCamera('left', boundsOf(bare), 3), 1600, 1280);
writeFileSync(root + 'full-side.png', sideBySide(side, readFileSync('docs/ref/three-view.png'), [.418,.018,.574,.981]));
