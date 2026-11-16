/**
 * paobub-dogfooding car-sho v2: the P3 layout model (F82 package with its hard points as named
 * sizes) and the P4 detail model (F142 skin and floor) of 「翔」, with the product-design features
 * of editor-platform (PD1 design targets, PD2 BOM values, PD7 sight checks) and the intake ducts
 * as 2 mm walls, evaluated with the pinned kernel.
 * OUT=<project folder> CAD_OCCT_DIST=work/cad-kernel npx vitest run <this file>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { setImmediate } from 'node:timers';
import { assertCad, bomJson, bomReport, cadContentHash, designTargetReport, f142Package, f82Package, f82Rules, measureDesignTargets, measureSightChecks, sightCheckReport, type CadDocument } from '@editor-platform/cad-core';
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
const detailNames: Record<string, [string, 'skin' | 'glass' | 'floor' | 'duct' | undefined]> = {
  ...Object.fromEntries(Object.entries(layoutNames).map(([k, v]) => [k, [v, undefined]])),
  'glass-C-body': ['窓ガラス（キャノピー）', 'glass'],
  'skin-body-body': ['ボディ外板（右）', 'skin'], 'skin-canopy-body': ['キャノピー外板（右）', 'skin'],
  'skin-intake-duct-right-body': ['側面吸気ダクト（右）', 'duct'], 'skin-intake-duct-left-body': ['側面吸気ダクト（左）', 'duct'],
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
  // v2 (DM-03): each intake duct a 2 mm CFRP wall instead of a solid block: a shell of its box
  // (440 × 240 × 240 from (1690, ±600/−840, 330)) with the inlet open on the side intake (the outer
  // face) and the outlet open to the engine bay and the radiator behind (the rear face, +x).
  for (const side of ['right', 'left']) {
    const box = out.features.find((f) => f.id === `skin-intake-duct-${side}`)!;
    const shellId = `skin-intake-duct-${side}-wall`;
    const y = side === 'right' ? 1 : -1;
    const face = (name: string, centroid: [number, number, number], size: number) => ({ kind: 'face', featureId: box.id, name: [[name]], hint: { centroid, size } });
    const openFaces = [face(y > 0 ? '+y' : '-y', [1910, 840 * y, 450], 440 * 240), face('+x', [2130, 720 * y, 450], 240 * 240)];
    out.features.splice(out.features.indexOf(box) + 1, 0, { id: shellId, name: `側面吸気ダクトの壁（${side === 'right' ? '右' : '左'}）`, type: 'shell', inputFeatureIds: [box.id], args: { openFaces, thickness: { literalMm: 2 }, side: 'inside' } } as never);
    out.features.find((f) => f.id === `skin-intake-duct-${side}-placement`)!.inputFeatureIds = [shellId] as never;
  }
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
      if (k && e?.kind === 'sheet' && k !== 'duct') (b as { mass?: unknown }).mass = sheet[k];
      if (k === 'duct' && e?.kind === 'solid') (b as { mass?: unknown }).mass = { densityKgM3: sheet.skin.densityKgM3 };
    }
    // PD2: the BOM values (the skin's CFRP; made here; costs wait for the quotes).
    // No part material: the layout boxes (wheels, occupants, machinery) are references and stay unweighed.
    doc.partProperties = { partNumber: 'SH-P4', description: '「翔」の外板・床（炭素繊維の板）と配置の確認用の形', sourcing: 'make' };
    const id = (old: string) => map[old]!;
    const skins = ['skin-body-body', 'skin-canopy-body', 'skin-body-left-body', 'skin-canopy-left-body', 'skin-nose-body', 'skin-tail-body'].map(id);
    const wheels = ['front-right-body', 'front-left-body', 'rear-right-body', 'rear-left-body'].map(id);
    const glass = id('glass-C-body');
    // PD1: the requirements the detail model answers for.
    doc.designTargets = [
      { id: 'TG-01', name: '全長', requirement: 'RQ-01', measure: { kind: 'extent', bodyIds: skins, axis: 'x' }, max: 4350 },
      { id: 'TG-02', name: '全幅（車輪を含む）', requirement: 'RQ-02', measure: { kind: 'extent', bodyIds: [...skins, ...wheels], axis: 'y' }, max: 1950 },
      { id: 'TG-03', name: '全高（地面から）', requirement: 'RQ-03', measure: { kind: 'extent', bodyIds: [...skins, glass, ...wheels], axis: 'z' }, max: 1130 },
      { id: 'TG-04', name: 'ホイールベースと全長の比', requirement: 'RQ-04', measure: { kind: 'proportion', metric: 'wheelbaseToLength' }, min: 0.58, max: 0.62 },
      { id: 'TG-05', name: '運転者の頭上のすき間', requirement: 'RQ-05', measure: { kind: 'distance', a: [id('driver-head-body')], b: [id('skin-canopy-body')] }, min: 50 },
      { id: 'TG-06', name: '外板と床の質量', requirement: 'RQ-14', measure: { kind: 'mass', bodyIds: [...skins, ...['aero-floor-body', 'aero-tunnel-right-body', 'aero-tunnel-left-body', 'skin-intake-duct-right-body', 'skin-intake-duct-left-body'].map(id)] }, max: 80 },
      { id: 'TG-07', name: 'タイヤとフェンダーのすき間', requirement: 'RQ-15', measure: { kind: 'proportion', metric: 'wheelToFender' }, min: 0, max: 20 },
    ];
    assertCad(doc);
    const d = await evaluate('detail', doc);
    const world = d.m.meshes.filter((x) => !(x as { lod?: unknown }).lod).map((x) => ({ bodyId: x.bodyId, indices: [...x.indices], points: Array.from(x.positions, (v, i) => v + x.origin[i % 3]!) }));
    const targets = designTargetReport(doc, measureDesignTargets(doc, { bodies: d.m.evaluation.bodies, meshes: world }), 'car-sho');
    // PD7: what the canopy's pillars hide from the driver's eyes (65 mm apart, at the head's front),
    // on a level arc each side of straight ahead (−x).
    const head = ((d0.m.evaluation.bodies ?? {})[id('driver-head-body')] as { centroidMm: number[] }).centroidMm;
    const eyes: [number, number, number][] = [[head[0] - 90, head[1] + 32, head[2] + 20], [head[0] - 90, head[1] - 32, head[2] + 20]];
    // Not stored: the canopy is one sheet, its glass and pillars not split (DM-01), so the check
    // measures the whole canopy; kept in the report to show why the split is needed.
    const sightChecks = [
      { id: 'SC-01', name: 'A ピラー（運転席側）が両眼から隠す角度', requirement: 'RQ-07', measure: { kind: 'obstruction', eyes, forward: [-1, 0, 0], up: [0, 0, 1], fromDeg: -90, toDeg: 0, bodyIds: [id('skin-canopy-body')] }, max: 6 },
      { id: 'SC-02', name: 'A ピラー（助手席側）が両眼から隠す角度', requirement: 'RQ-07', measure: { kind: 'obstruction', eyes, forward: [-1, 0, 0], up: [0, 0, 1], fromDeg: 0, toDeg: 90, bodyIds: [id('skin-canopy-left-body')] }, max: 6 },
    ];
    const sightDoc = { ...doc, sightChecks } as CadDocument;
    const sight = sightCheckReport(sightDoc, measureSightChecks(sightDoc, { meshes: world }), 'car-sho');
    const bom = bomReport(doc, () => undefined, 'flat', { own: d.m.evaluation.bodies });
    writeFileSync(`${out}/cad/bom.json`, bomJson(bom, { name: '「翔」', contentHash: cadContentHash(doc) }));
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
      designTargets: targets,
      // TG-05's reading: the head box and the canopy's points over it (within its plan).
      headCheck: (() => {
        const pts = (b: string) => world.filter((m) => m.bodyId === b).flatMap((m) => Array.from({ length: m.points.length / 3 }, (_, i) => [m.points[3 * i]!, m.points[3 * i + 1]!, m.points[3 * i + 2]!]));
        const h = pts(id('driver-head-body'));
        const lo = [0, 1, 2].map((k) => Math.min(...h.map((p) => p[k]!)));
        const hi = [0, 1, 2].map((k) => Math.max(...h.map((p) => p[k]!)));
        const over = pts(id('skin-canopy-body')).filter((p) => p[0]! >= lo[0]! && p[0]! <= hi[0]! && p[1]! >= lo[1]! && p[1]! <= hi[1]!);
        const inside = pts(id('skin-canopy-body')).filter((p) => p.every((v, k) => v >= lo[k]! && v <= hi[k]!));
        const r1 = (p: number[]) => p.map((v) => Math.round(v * 10) / 10);
        return { headMin: lo, headMax: hi, canopyOverHeadMinZ: Math.min(...over.map((p) => p[2]!)), canopyOverHeadMaxZ: Math.max(...over.map((p) => p[2]!)), canopyPointsInsideHead: inside.length, inside: inside.map(r1) };
      })(),
      sight,
      bom: { totals: (bom as { totals?: unknown }).totals, leftOut: (bom as { leftOut?: unknown }).leftOut },
    };
    writeFileSync(`${out}/cad/check-report.json`, `${JSON.stringify(report, null, 1)}\n`);
  }, 1_800_000);
});
