/**
 * paobub-dogfooding car-sho: the P3 layout model (F82 package with its hard points as named sizes)
 * and the P4 detail model (F142 skin and floor) of 「翔」, evaluated with the pinned kernel.
 * OUT=<project folder> CAD_OCCT_DIST=work/cad-kernel npx vitest run <this file>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { setImmediate } from 'node:timers';
import { assertCad, cadContentHash, f142Package, f82Package, f82Rules, type CadDocument } from '@editor-platform/cad-core';
import { describe, expect, it } from 'vitest';
import { createKernelHost } from './host';
import type { CadWorkerRequest, CadWorkerResponse } from './protocol';
import { cadKernelBuild } from '../../../scripts/cad-kernel/build.mjs';

const dist = process.env.CAD_OCCT_DIST;
const out = process.env.OUT ?? 'work/car-sho';

const layoutNames: Record<string, string> = {
  'front-right-body': '右前輪（タイヤとホイール）', 'front-left-body': '左前輪（タイヤとホイール）',
  'rear-right-body': '右後輪（タイヤとホイール）', 'rear-left-body': '左後輪（タイヤとホイール）',
  'driver-torso-body': '運転者の胴', 'driver-head-body': '運転者の頭', 'driver-thighs-body': '運転者の腿', 'driver-shins-body': '運転者の脛',
  'passenger-torso-body': '同乗者の胴', 'passenger-head-body': '同乗者の頭', 'passenger-thighs-body': '同乗者の腿', 'passenger-shins-body': '同乗者の脛',
  'engine-body': 'エンジン', 'gearbox-body': '変速機', 'fuel-body': '燃料タンク', 'radiator-right-body': '右ラジエーター',
  'radiator-left-body': '左ラジエーター', 'luggage-body': '前の荷室',
};
/** Detail bodies: [name, kind of mass]. 'skin' = CFRP sheet 2.0 mm; 'glass' = 4 mm; undefined = not weighed here. */
const detailNames: Record<string, [string, 'skin' | 'glass' | 'floor' | undefined]> = {
  ...Object.fromEntries(Object.entries(layoutNames).map(([k, v]) => [k, [v, undefined]])),
  'glass-C-body': ['窓ガラス（キャノピー）', 'glass'],
  'skin-body-body': ['ボディ外板（右）', 'skin'], 'skin-canopy-body': ['キャノピー外板（右）', 'skin'],
  'skin-intake-duct-right-body': ['側面吸気ダクト（右）', 'skin'], 'skin-intake-duct-left-body': ['側面吸気ダクト（左）', 'skin'],
  'skin-body-left-body': ['ボディ外板（左）', 'skin'], 'skin-canopy-left-body': ['キャノピー外板（左）', 'skin'],
  'skin-nose-body': ['ノーズの面', 'skin'], 'skin-tail-body': ['テールの面', 'skin'],
  'aero-floor-body': ['フラットフロア', 'floor'], 'aero-tunnel-right-body': ['ディフューザーのトンネル（右）', 'floor'], 'aero-tunnel-left-body': ['ディフューザーのトンネル（左）', 'floor'],
};
const sheet = { skin: { densityKgM3: 1550, thicknessMm: 2.0 }, glass: { densityKgM3: 2500, thicknessMm: 4.0 }, floor: { densityKgM3: 1550, thicknessMm: 3.0 } };

type Len = { literalMm: number } | { parameterId: string } | { affine: { parameterId: string; scale: number; offsetMm: number } };
const aff = (parameterId: string, scale: number, offsetMm: number): Len => ({ affine: { parameterId, scale, offsetMm } });

function layoutModel(kernel: { id: string; buildHash: string }) {
  const r = f82Rules;
  const doc = structuredClone(f82Package(kernel)) as CadDocument;
  const fd = r.tyre.front.diameter, rd = r.tyre.rear.diameter;
  doc.parameters.push(
    { id: 'PR-01', name: '全長', type: 'length', value: r.length },
    { id: 'PR-02', name: '全幅', type: 'length', value: r.width },
    { id: 'PR-03', name: '全高', type: 'length', value: r.height },
    { id: 'PR-04', name: 'ホイールベース', type: 'length', value: r.wheelbase },
    { id: 'PR-05', name: 'トレッド（前）', type: 'length', value: r.track.front },
    { id: 'PR-06', name: 'トレッド（後）', type: 'length', value: r.track.rear },
    { id: 'PR-07', name: '前タイヤの外径', type: 'length', value: fd },
    { id: 'PR-08', name: '後タイヤの外径', type: 'length', value: rd },
    { id: 'PR-09', name: 'Hポイントの前後位置', type: 'length', value: r.hPoint.x },
    { id: 'PR-10', name: 'Hポイントの横位置', type: 'length', value: r.hPoint.y },
    { id: 'PR-11', name: 'Hポイントの高さ', type: 'length', value: r.hPoint.z },
    { id: 'PR-12', name: 'ファイアウォールの位置', type: 'length', value: r.firewall },
    { id: 'PR-13', name: '最低地上高', type: 'length', value: r.clearance },
  );
  const f = (id: string) => doc.features.find((x) => x.id === id)!.args as { radius?: Len; origin: Len[]; size?: Len[] };
  // Wheels: radius from the diameter, the rear axle at the wheelbase, each wheel's inner face at the track.
  for (const [id, dia, track, x, side, w] of [
    ['front-right', 'PR-07', 'PR-05', null, 1, r.tyre.front.width], ['front-left', 'PR-07', 'PR-05', null, -1, r.tyre.front.width],
    ['rear-right', 'PR-08', 'PR-06', 'PR-04', 1, r.tyre.rear.width], ['rear-left', 'PR-08', 'PR-06', 'PR-04', -1, r.tyre.rear.width],
  ] as const) {
    const a = f(id);
    a.radius = aff(dia, 0.5, 0);
    a.origin = [x ? { parameterId: x } : { literalMm: 0 }, aff(track, 0.5 * side, (-side * w) / 2), aff(dia, 0.5, 0)];
  }
  // Occupants follow the H-point (driver +y, passenger −y).
  for (const who of ['driver', 'passenger'] as const)
    for (const part of ['torso', 'head', 'thighs', 'shins']) {
      const a = f(`${who}-${part}`);
      const [x, y, z] = a.origin.map((l) => (l as { literalMm: number }).literalMm) as [number, number, number];
      const sy = who === 'driver' ? 1 : -1;
      a.origin = [aff('PR-09', 1, x - r.hPoint.x), aff('PR-10', sy, y - sy * r.hPoint.y), aff('PR-11', 1, z - r.hPoint.z)];
    }
  // The machinery behind the firewall moves with it.
  for (const id of ['engine', 'radiator-right', 'radiator-left']) {
    const a = f(id);
    a.origin[0] = aff('PR-12', 1, (a.origin[0] as { literalMm: number }).literalMm - r.firewall);
  }
  let n = 0;
  for (const b of doc.bodies) {
    b.name = layoutNames[b.id]!;
    b.id = `EN-${String(++n).padStart(3, '0')}`;
  }
  assertCad(doc);
  return doc;
}

function detailModel(kernel: { id: string; buildHash: string }) {
  const doc = structuredClone(f142Package(kernel)) as CadDocument;
  // The CL4 massing block is a reference of the look process, not a part of the car.
  doc.bodies = doc.bodies.filter((b) => b.id !== 'block-C-body');
  // The look process's sketch notes and line colours (CL4, CLF9–10) are annotations a released cad-core does not read yet.
  for (const s of doc.sketches) {
    delete (s as { notes?: unknown }).notes;
    for (const e of s.entities) delete (e as { color?: unknown }).color;
  }
  const pr = (doc as { proportions?: Record<string, unknown> }).proportions;
  if (pr) for (const [k, v] of Object.entries(pr)) if (Array.isArray(v)) pr[k] = v.flatMap((x) => (x === 'block-C-body' ? doc.bodies.filter((b) => b.id.startsWith('skin-body') || b.id.startsWith('skin-canopy') || b.id === 'skin-nose-body' || b.id === 'skin-tail-body').map((b) => b.id) : [x]));
  const map: Record<string, string> = {};
  let n = 0;
  for (const b of doc.bodies) {
    const [name, kind] = detailNames[b.id]!;
    const id = `BD-${String(++n).padStart(3, '0')}`;
    map[b.id] = id;
    b.id = id;
    b.name = name;
  }
  // References to body ids elsewhere (proportions etc.)
  const text = JSON.stringify(doc).replace(/"([a-zA-Z-]+-body)"/g, (m, id) => (map[id] ? `"${map[id]}"` : m));
  const out = JSON.parse(text) as CadDocument;
  assertCad(out);
  const kinds = Object.fromEntries(Object.entries(detailNames).filter(([k]) => map[k]).map(([k, v]) => [map[k], v[1]]));
  return { doc: out, map, kinds };
}

describe.skipIf(!dist)('car-sho CAD', () => {
  it('writes and evaluates the layout and detail models', async () => {
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
      const t0 = performance.now();
      await handle({ type: 'evaluate', requestId: key, generation: 1, baseHash: '', candidateHash: cadContentHash(doc), document: doc } as CadWorkerRequest);
      const m = posted.find((x) => 'requestId' in x && x.requestId === key && x.type !== 'progress');
      if (m?.type !== 'result' || m.evaluation.status !== 'ok') throw new Error(`${key}: ${JSON.stringify(m).slice(0, 900)}`);
      return { m, ms: Math.round(performance.now() - t0) };
    };
    mkdirSync(`${out}/cad`, { recursive: true });
    const layout = layoutModel(kernel);
    const l = await evaluate('layout', layout);
    writeFileSync(`${out}/cad/layout-model.cad.json`, `${JSON.stringify(layout, null, 1)}\n`);
    const { doc: bare, map, kinds } = detailModel(kernel);
    const d0 = await evaluate('detail0', bare);
    const doc = structuredClone(bare);
    for (const b of doc.bodies) {
      const k = kinds[b.id];
      const e = (d0.m.evaluation.bodies ?? {})[b.id] as { kind?: string } | undefined;
      if (k && e?.kind === 'sheet') (b as { mass?: unknown }).mass = sheet[k];
    }
    assertCad(doc);
    const d = await evaluate('detail', doc);
    writeFileSync(`${out}/cad/detail-model.cad.json`, `${JSON.stringify(doc, null, 1)}\n`);
    const bodies = (m: typeof l.m, docx: CadDocument) =>
      docx.bodies.map((b) => {
        const e = (m.evaluation.bodies ?? {})[b.id] as { kind?: string; volumeMm3?: number; areaMm2?: number; centroidMm?: number[]; boundsMm?: unknown } | undefined;
        const mass = (b as { mass?: { densityKgM3: number; thicknessMm?: number } }).mass;
        const kg = mass && e ? (e.kind === 'sheet' ? (e.areaMm2 ?? 0) * (mass.thicknessMm ?? 0) : (e.volumeMm3 ?? 0)) * mass.densityKgM3 * 1e-9 : undefined;
        return { id: b.id, name: b.name, kind: e?.kind, volumeMm3: e?.volumeMm3, areaMm2: e?.areaMm2, centroidMm: e?.centroidMm, kg };
      });
    const report = {
      kernel: kernel.buildHash,
      layout: { contentHash: cadContentHash(layout), ms: l.ms, bodies: bodies(l.m, layout) },
      detail: { contentHash: cadContentHash(doc), ms: d.ms, bodies: bodies(d.m, doc), bodyMap: map },
    };
    writeFileSync(`${out}/cad/check-report.json`, `${JSON.stringify(report, null, 1)}\n`);
  }, 1_800_000);
});
