/**
 * paobub-dogfooding watch-sk01: write the P3 layout model and the P4 detail models of SK-01 as
 * cad-core documents, and check them with the pinned kernel (volumes and mass, interference).
 * OUT=<project folder> CAD_OCCT_DIST=work/cad-kernel npx vitest run <this file>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { setImmediate } from 'node:timers';
import {
  applyCadOperation,
  assertCad,
  cadContentHash,
  checkCadInterference,
  checkCadInterferenceAlong,
  checkGearMesh,
  emptyCad,
  identityQuaternion,
  position,
  sk01Case,
  sk01Gears,
  sk01Layout,
  sk01Watch,
  solveJoints,
  parameterValues,
  type CadDocument,
  type CadInterferenceMesh,
  type CadResolvedJointValues,
} from '@editor-platform/cad-core';
import { describe, expect, it } from 'vitest';
import { createKernelHost } from './host';
import type { CadWorkerRequest, CadWorkerResponse } from './protocol';
import { cadKernelBuild } from '../../../scripts/cad-kernel/build.mjs';

const dist = process.env.CAD_OCCT_DIST;
const out = process.env.OUT ?? 'work/watch-sk01';

/** Body id → [BD id, Japanese name, density kg/m³]. */
const brass = 8500, steel = 7900, ruby = 3980, sapphire = 3980, caseSteel = 8000;
const names: Record<string, [string, number]> = {
  'main-plate': ['地板', brass], 'jewel-third': ['三番受け石（地板）', ruby], 'jewel-fourth': ['四番受け石（地板）', ruby],
  'jewel-escape': ['がんぎ受け石（地板）', ruby], 'jewel-pallet': ['アンクル受け石（地板）', ruby], 'jewel-balance': ['てんぷ受け石（地板）', ruby],
  'jewel-barrel': ['香箱受け石（地板）', ruby],
  'train-bridge': ['輪列受け', brass], 'train-bridge-jewel-1': ['輪列受けの石 1', ruby], 'train-bridge-jewel-2': ['輪列受けの石 2', ruby],
  'train-bridge-jewel-3': ['輪列受けの石 3', ruby], 'train-bridge-jewel-4': ['輪列受けの石 4', ruby],
  'train-bridge-screw-1': ['輪列受けのねじ 1', steel], 'train-bridge-screw-1-slot': ['輪列受けのねじ 1 のすり割り', steel],
  'train-bridge-screw-2': ['輪列受けのねじ 2', steel], 'train-bridge-screw-2-slot': ['輪列受けのねじ 2 のすり割り', steel],
  'barrel-bridge': ['香箱受け', brass], 'barrel-bridge-screw-1': ['香箱受けのねじ 1', steel], 'barrel-bridge-screw-1-slot': ['香箱受けのねじ 1 のすり割り', steel],
  'barrel-bridge-screw-2': ['香箱受けのねじ 2', steel], 'barrel-bridge-screw-2-slot': ['香箱受けのねじ 2 のすり割り', steel],
  'balance-cock': ['てんぷ受け', brass], 'balance-cock-jewel-1': ['てんぷ受けの石', ruby], 'balance-cock-screw-1': ['てんぷ受けのねじ', steel],
  'balance-cock-screw-1-slot': ['てんぷ受けのねじのすり割り', steel],
  'barrel-drum': ['香箱のドラム', brass], 'barrel-gear': ['香箱の歯車', brass], 'barrel-arbor': ['香箱真', steel], 'barrel-ratchet': ['角穴車', steel],
  'centre-arbor': ['二番真', steel], 'minute-hand': ['分針', steel], 'minute-hand-boss': ['分針のパイプ', steel], 'centre-pinion': ['二番かな', steel],
  'centre-wheel': ['二番車', brass], 'cannon-pinion': ['筒かな', steel],
  'third-arbor': ['三番真', steel], 'third-pinion': ['三番かな', steel], 'third-wheel': ['三番車', brass],
  'fourth-arbor': ['四番真', steel], 'seconds-hand': ['秒針', steel], 'seconds-hand-boss': ['秒針のパイプ', steel], 'fourth-pinion': ['四番かな', steel], 'fourth-wheel': ['四番車', brass],
  'escape-arbor': ['がんぎ真', steel], 'escape-pinion': ['がんぎかな', steel], 'escape-wheel': ['がんぎ車', steel],
  'pallet-arbor': ['アンクル真', steel], 'entry-stone': ['入り爪石', ruby], 'exit-stone': ['出爪石', ruby], fork: ['アンクル', steel],
  'balance-staff': ['てん真', steel], roller: ['振り座', steel], 'impulse-pin': ['振り石', ruby], collet: ['ひげ玉', steel], hairspring: ['ひげぜんまい', steel],
  'balance-rim': ['てん輪', brass], 'balance-arm-1': ['てん輪のアーム 1', brass], 'balance-arm-2': ['てん輪のアーム 2', brass], 'balance-arm-3': ['てん輪のアーム 3', brass], 'balance-hub': ['てん輪のハブ', brass],
  'minute-arbor': ['日の裏車の真', steel], 'minute-wheel': ['日の裏車', brass], 'minute-pinion': ['日の裏かな', steel],
  'hour-wheel': ['筒車', brass], 'hour-pipe': ['筒車のパイプ', brass], 'hour-hand': ['時針', steel], 'hour-hand-boss': ['時針のパイプ', steel],
  'case-middle': ['胴', caseSteel], 'lug-1': ['ラグ 1', caseSteel], 'lug-2': ['ラグ 2', caseSteel], 'lug-3': ['ラグ 3', caseSteel], 'lug-4': ['ラグ 4', caseSteel],
  'crown-stem': ['巻真', steel], crown: ['リューズ', caseSteel],
  bezel: ['ベゼル', caseSteel], 'front-crystal': ['風防', sapphire],
  'case-back': ['裏ぶた', caseSteel], 'back-crystal': ['裏ぶたのガラス', sapphire],
  'chapter-ring': ['見返しリング', brass],
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`index-${i === 0 ? 12 : i}`, [`インデックス ${i === 0 ? 12 : i}`, steel]])),
};

/** HP-05: lugs with 16 mm between them (the F72 lugs left 11.2 mm). */
const lugX = { left: -10.8, right: 8.0 }, lugY = { top: 13.4, bottom: -21.6 }, lugLen = 8.2;

function renameAll(parts: { key: string; content: CadDocument }[]) {
  const map = new Map<string, string>();
  let n = 0;
  const outParts = parts.map((p) => {
    const doc = structuredClone(p.content);
    for (const b of doc.bodies) {
      const [jp, density] = names[b.id] ?? (() => { throw new Error(`no name for ${b.id}`); })();
      const id = `BD-${String(++n).padStart(3, '0')}`;
      map.set(b.id, id);
      b.id = id;
      b.name = jp;
      (b as { mass?: unknown }).mass = { densityKgM3: density };
    }
    if (p.key === 'case')
      for (const f of doc.features) {
        const m = /^Lug (\d)$/.exec(f.name);
        if (!m || f.type !== 'box') continue;
        const i = Number(m[1]);
        const x = i % 2 === 1 ? lugX.left : lugX.right;
        const y = i <= 2 ? lugY.top : lugY.bottom;
        (f.args as { size: unknown; origin: unknown }).size = [{ literalMm: 2.8 }, { literalMm: lugLen }, { literalMm: 3.2 }];
        (f.args as { origin: unknown }).origin = position(x, y, -0.4);
      }
    assertCad(doc);
    return { key: p.key, content: doc };
  });
  return { map, parts: outParts };
}

/** P3: the layout model (named sizes from the hard points, an envelope per subsystem). */
function layoutModel(kernel: { id: string; buildHash: string }): CadDocument {
  const A = sk01Layout.arbors, Z = sk01Layout.z, g = sk01Gears;
  const pr = (id: string, name: string, value: number) => ({ id, name, type: 'length' as const, value });
  const parameters = [
    pr('PR-01', 'ケースの外径', 2 * sk01Case.outer),
    pr('PR-02', 'ケースの厚み', sk01Case.back[1] - sk01Case.bezel[0]),
    pr('PR-03', 'ムーブメントの径', 2 * sk01Layout.plate.radius),
    pr('PR-04', 'ムーブメントの高さ', Z.cock[1]),
    pr('PR-05', 'ラグの内幅', 16),
    pr('PR-06', '風防の径', 2 * sk01Case.front.r),
    pr('PR-07', 'リューズの高さ', sk01Case.crown.z),
  ];
  const half = (id: string) => ({ affine: { parameterId: id, scale: 0.5, offsetMm: 0 } });
  const cyl = (id: string, name: string, radius: unknown, height: unknown, origin: unknown, color: string, opacity = 0.35) => ({
    feature: { id: `${id}-f`, name, type: 'cylinder', inputFeatureIds: [], args: { radius, height, origin, orientation: identityQuaternion() } },
    body: { id, name, sourceFeatureId: `${id}-f`, placementFeatureId: `${id}-p`, appearance: { color, opacity } },
  });
  const box = (id: string, name: string, size: unknown, origin: unknown, color: string) => ({
    feature: { id: `${id}-f`, name, type: 'box', inputFeatureIds: [], args: { size, origin, orientation: identityQuaternion() } },
    body: { id, name, sourceFeatureId: `${id}-f`, placementFeatureId: `${id}-p`, appearance: { color, opacity: 0.5 } },
  });
  const pitch = (p: { module: number; driven: number }) => (p.module * p.driven) / 2;
  const L = (mm: number) => ({ literalMm: mm });
  const items = [
    cyl('EN-001', '外装の空間（胴・ベゼル・裏ぶた）', half('PR-01'), { parameterId: 'PR-02' }, [L(0), L(0), L(sk01Case.bezel[0])], '#8a8f98', 0.15),
    cyl('EN-002', 'ムーブメントの空間', half('PR-03'), { parameterId: 'PR-04' }, position(0, 0, 0), '#c9a85c', 0.2),
    cyl('EN-003', '香箱（動力）', L(pitch(g.centreBarrel)), L(Z.barrel.drum[1] - Z.barrel.drum[0]), position(A.barrel[0], A.barrel[1], Z.barrel.drum[0]), '#d8b46a'),
    cyl('EN-004', '二番車（輪列）', L(pitch(g.thirdCentre)), L(Z.centre.wheel[1] - Z.centre.wheel[0]), position(0, 0, Z.centre.wheel[0]), '#d8b46a'),
    cyl('EN-005', '三番車（輪列）', L(pitch(g.fourthThird)), L(Z.third.wheel[1] - Z.third.wheel[0]), position(A.third[0], A.third[1], Z.third.wheel[0]), '#d8b46a'),
    cyl('EN-006', '四番車（輪列）', L(pitch(g.escapeFourth)), L(Z.fourth.wheel[1] - Z.fourth.wheel[0]), position(A.fourth[0], A.fourth[1], Z.fourth.wheel[0]), '#d8b46a'),
    cyl('EN-007', 'がんぎ車（脱進機）', L(1.95), L(Z.escape.wheel[1] - Z.escape.wheel[0]), position(A.escape[0], A.escape[1], Z.escape.wheel[0]), '#c9ccd2'),
    cyl('EN-008', 'てんぷの回る空間（調速機）', L(4.05), L(Z.balance.rim[1] - Z.balance.rim[0]), position(A.balance[0], A.balance[1], Z.balance.rim[0]), '#c9ccd2'),
    cyl('EN-009', '針の回る空間（表示）', L(11.0), L(Z.hands.seconds[1] - Z.hands.minute[0]), position(0, 0, Z.hands.minute[0]), '#24306e'),
    cyl('EN-010', '風防の見える範囲', half('PR-06'), L(sk01Case.front.z[1] - sk01Case.front.z[0]), position(0, 0, sk01Case.front.z[0]), '#9fc3e0'),
    box('EN-011', 'ラグとベルト（12時側）', [{ affine: { parameterId: 'PR-05', scale: 1, offsetMm: 5.6 } }, L(lugLen), L(3.2)], [{ affine: { parameterId: 'PR-05', scale: -0.5, offsetMm: -2.8 } }, L(lugY.top), L(-0.4)], '#8a8f98'),
    box('EN-012', 'ラグとベルト（6時側）', [{ affine: { parameterId: 'PR-05', scale: 1, offsetMm: 5.6 } }, L(lugLen), L(3.2)], [{ affine: { parameterId: 'PR-05', scale: -0.5, offsetMm: -2.8 } }, L(lugY.bottom), L(-0.4)], '#8a8f98'),
    cyl('EN-013', 'リューズと巻上げ（巻上げ機構）', L(sk01Case.crown.r), L(sk01Case.crown.length + 0.7), [L(17.0), L(0), { parameterId: 'PR-07' }], '#8a8f98'),
  ];
  // The crown lies along +X.
  (items.at(-1)!.feature.args as { orientation: unknown }).orientation = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
  const doc = applyCadOperation(emptyCad(kernel), {
    type: 'insertFeatures',
    parameters,
    profiles: [],
    features: items.map((i) => i.feature),
    bodies: items.map((i) => i.body),
  } as never);
  assertCad(doc);
  return doc;
}

describe.skipIf(!dist)('watch-sk01 CAD', () => {
  it('writes and checks the layout and detail models', async () => {
    const wasm = readFileSync(`${dist}/${cadKernelBuild.wasm}`);
    const sha = createHash('sha256').update(wasm).digest('hex');
    expect(sha).toBe(cadKernelBuild.wasmSha256);
    const kernel = { id: 'occt', buildHash: `sha256:${sha}` };
    globalThis.require ??= createRequire(import.meta.url);
    const posted: CadWorkerResponse[] = [];
    const handle = createKernelHost({
      load: async () => {
        const { default: factory } = await import(pathToFileURL(`${dist}/${cadKernelBuild.js}`).href);
        return factory({ wasmBinary: wasm });
      },
      post: (m) => void posted.push(m),
      yieldTask: () => new Promise((resolve) => setImmediate(resolve)),
    });
    await handle({ type: 'init', build: { buildHash: kernel.buildHash, moduleUrl: '', wasmUrl: '' } });
    const evaluate = async (key: string, doc: CadDocument) => {
      await handle({ type: 'evaluate', requestId: key, generation: 1, baseHash: '', candidateHash: cadContentHash(doc), document: doc } as CadWorkerRequest);
      const m = posted.find((x) => 'requestId' in x && x.requestId === key && x.type !== 'progress');
      if (m?.type !== 'result' || m.evaluation.status !== 'ok') throw new Error(`${key}: ${JSON.stringify(m).slice(0, 600)}`);
      return m;
    };

    mkdirSync(`${out}/cad/detail`, { recursive: true });
    const report: Record<string, unknown> = { kernel: kernel.buildHash };

    // P3 layout
    const layout = layoutModel(kernel);
    const lm = await evaluate('layout', layout);
    writeFileSync(`${out}/cad/layout-model.cad.json`, `${JSON.stringify(layout, null, 1)}\n`);
    report.layout = { contentHash: cadContentHash(layout), bodies: Object.fromEntries(Object.entries(lm.evaluation.bodies ?? {}).map(([k, v]) => [k, { volumeMm3: (v as { volumeMm3?: number }).volumeMm3 }])) };

    // P4 detail
    const w = sk01Watch(kernel);
    const { map, parts } = renameAll(w.parts);
    const newVersions = new Map<string, { hash: string; content: CadDocument; path: string }>();
    const mass: { part: string; body: string; name: string; g: number }[] = [];
    const meshes = new Map<string, CadInterferenceMesh[]>();
    for (const p of parts) {
      const path = `cad/detail/${p.key}.cad.json`;
      writeFileSync(`${out}/${path}`, `${JSON.stringify(p.content, null, 1)}\n`);
      const hash = cadContentHash(p.content);
      newVersions.set(p.key, { hash, content: p.content, path });
      const m = await evaluate(p.key, p.content);
      meshes.set(hash, m.meshes.map((x) => ({ bodyId: x.bodyId, origin: [...x.origin] as [number, number, number], positions: [...x.positions], indices: [...x.indices] })));
      for (const b of p.content.bodies) {
        const e = (m.evaluation.bodies ?? {})[b.id] as { volumeMm3?: number } | undefined;
        const d = (b as { mass?: { densityKgM3: number } }).mass!.densityKgM3;
        mass.push({ part: p.key, body: b.id, name: b.name, g: e?.volumeMm3 ? e.volumeMm3 * d * 1e-6 : NaN });
      }
    }
    report.mass = mass;
    report.bodyMap = Object.fromEntries(map);

    // The assembly, pointing at the renamed versions.
    const asm = structuredClone(w.assembly);
    const oldToKey = new Map([...w.versions.entries()].map(([k, v]) => [v.contentHash, k]));
    for (const part of asm.parts) {
      const src = part.source as { kind: string; contentHash: string; artifactId: string; versionId: string };
      const key = oldToKey.get(src.contentHash)!;
      const v = newVersions.get(key)!;
      src.contentHash = v.hash;
      src.artifactId = v.path;
      src.versionId = 'p4';
    }
    const closure = new Map([...newVersions.values()].map((v) => [v.hash, v.content] as const));
    const lookup = (h: string) => closure.get(h);
    const solve = (d: CadDocument) => solveJoints(d, parameterValues(d), lookup, () => undefined, () => true);
    asm.solvedPoses = solve(asm).poses;
    assertCad(asm);
    writeFileSync(`${out}/cad/detail/sk01-watch.assembly.cad.json`, `${JSON.stringify(asm, null, 1)}\n`);

    const clear = (doc: CadDocument) => {
      const r = checkCadInterference({ doc, lookup, meshesOf: (h) => meshes.get(h), joints: solve(doc).joints });
      return r.status === 'ok' ? { findings: r.findings.map((x) => `${x.a.join('/')}–${x.b.join('/')}`), unchecked: r.unchecked } : { status: r.status };
    };
    const exploded = structuredClone(asm);
    for (const [id, values] of Object.entries(asm.configurations!.find((c) => c.id === 'form-exploded')!.values))
      exploded.joints.find((j) => j.id === id)!.values = structuredClone(values);
    const { joints } = solve(asm);
    // 12 h is 8640 escape-wheel turns, 720 seconds-hand turns, 12 minute-hand turns. 97 samples (a prime, so
    // no hand repeats an angle): each step moves the seconds hand 720/97 turns, so all three hands visit 97
    // different angles. Evenly spaced samples that divide 720 (e.g. every 15 min) would show one seconds-hand angle.
    const N = 97;
    const samples = Array.from({ length: N }, (_, i) => ({ tick: i, values: new Map([['j-escape', { angle: -(i / N) * 8640 * 2 * Math.PI }]]) }));
    const along = checkCadInterferenceAlong({ doc: asm, lookup, meshesOf: (h) => meshes.get(h), joints }, samples as { tick: number; values: Map<string, CadResolvedJointValues> }[]);
    const sol = solve(asm);
    report.interference = {
      assembled: clear(asm),
      exploded: clear(exploded),
      handsOver12h: along.status === 'ok' ? { samples: along.samples, hits: along.hits.flatMap((h) => h.findings.map((x) => `${h.tick}: ${x.a.join('/')}–${x.b.join('/')}`)), unchecked: along.unchecked } : { status: along.status },
    };
    report.gearMeshes = (asm.gearMeshes ?? []).map((g) => ({ id: g.id, name: g.name, check: checkGearMesh(asm, g, sol, lookup) }));
    writeFileSync(`${out}/cad/check-report.json`, `${JSON.stringify(report, null, 1)}\n`);
    console.log(JSON.stringify({ i: report.interference, total: mass.reduce((t, m) => t + m.g, 0) }));
  }, 1_800_000);
});
