import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { it } from 'vitest';
import { bimDrawingSvg, bimSchedule, bimScheduleCsv, deriveBim, validateBim } from '@editor-platform/bim-core';
import { readIfc, writeIfc } from '@editor-platform/bim-ifc';
import { cadKernelBuild } from '../../../scripts/cad-kernel/build.mjs';
import { bimDirectKernel, BimEvaluator } from '../../packages/bim/src/evaluate';
import { drawBim } from '../../packages/bim/src/drawing';
import { sky8 as sky3 } from './sky8';
const out = '/mnt/project-files/skytree-bim/ls8';
const L: string[] = [];
const log = (...a: unknown[]) => { L.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); writeFileSync('/tmp/claude-0/k9.log', L.join('\n') + '\n'); };
it('ls8', { timeout: 1_800_000 }, async () => {
  mkdirSync(out, { recursive: true });
  const doc = sky3();
  writeFileSync(`${out}/sky-tower-bim.json`, JSON.stringify(doc));
  const kinds: Record<string, number> = {};
  for (const el of doc.elements) kinds[el.kind] = (kinds[el.kind] ?? 0) + 1;
  log('elements', doc.elements.length, kinds, 'levels', doc.levels.length);
  log('validate errors', validateBim(doc).filter((d) => d.severity === 'error'));
  const d = deriveBim(doc);
  log('derive diagnostics', d.diagnostics);
  const dist = process.env.CAD_OCCT_DIST!;
  globalThis.require ??= createRequire(import.meta.url);
  const { default: factory } = await import(pathToFileURL(`${dist}/${cadKernelBuild.js}`).href);
  const oc = await factory({ wasmBinary: readFileSync(`${dist}/${cadKernelBuild.wasm}`) });
  const kernel = bimDirectKernel(oc);
  let t0 = performance.now();
  const e = await new BimEvaluator(kernel).evaluate(doc);
  log('evaluate', e.status, `${((performance.now() - t0) / 1000).toFixed(1)} s`);
  const kq = new Map<string, Record<string, number>>();
  if (e.status === 'ok') {
    let worst = 0, worstId = '', errors = 0;
    for (const [id, r] of e.elements) {
      if (r.status !== 'ok') { errors++; log('element error', id, r); continue; }
      const q = d.quantities.get(id);
      if (q?.source === 'kernel') kq.set(id, { netVolume: r.measure.volumeMm3, grossVolume: r.measure.volumeMm3 });
      const v = q?.values.netVolume;
      if (q?.source !== 'analytic' || !v) continue;
      const rel = Math.abs(r.measure.volumeMm3 - v) / v;
      if (rel > worst) { worst = rel; worstId = id; }
    }
    log('element errors', errors, 'kernel vs analytic volume, worst relative', worst.toExponential(2), worstId);
    for (const [id, v] of e.kernelQuantities) kq.set(id, v);
  }
  log('windows', doc.elements.filter((x) => x.kind === 'window').length, 'deck window errors', e.status === 'ok' ? [...e.elements].filter(([id, r]) => id.includes('-win-') && r.status !== 'ok').length : '-', 'd1-cw-1-1 net volume', d.quantities.get('d1-cw-1-1')?.values.netVolume, 'kernel', e.status === 'ok' && e.elements.get('d1-cw-1-1')?.status === 'ok' ? (e.elements.get('d1-cw-1-1') as { measure: { volumeMm3: number } }).measure.volumeMm3 : '-');
  log('galleria', d.quantities.get('d2-galleria'), 'deck wall', d.quantities.get('d1-cw-1-1')?.values, (d.shapes.get('d1-cw-1-1') as {lean?: number})?.lean);
  const s = bimSchedule(doc, d, e.status === 'ok' ? e.kernelQuantities : undefined);
  const csv = bimScheduleCsv(s);
  writeFileSync(`${out}/sky-tower-schedule.csv`, csv);
  log('schedule subtotals', s.subtotals.map((t) => [t.category, t.count, ((t.volumeMm3 ?? 0) / 1e9).toFixed(1) + ' m3']));
  for (const r of s.rows.filter((r) => r.kind === 'member' || r.typeName.startsWith('Leg') || r.kind === 'column' && r.typeName.includes('pipe') || r.kind === 'slab' && r.typeName.startsWith('Ramp') || r.kind === 'ramp' || r.kind === 'wall' && r.typeName.includes('urtain')))
    log('  row', r.kind, r.typeName, r.levelName, r.count, ((r.lengthMm ?? 0) / 1000).toFixed(1) + ' m', ((r.volumeMm3 ?? 0) / 1e9).toFixed(2) + ' m3');
  t0 = performance.now();
  const ifc = writeIfc(doc, { artifactId: "k4", timeStamp: '2026-11-08T13:00:00', kernelQuantities: e.status === 'ok' ? e.kernelQuantities : undefined });
  writeFileSync(`${out}/sky-tower-bim.ifc`, ifc.bytes);
  const count = (re: RegExp) => (ifc.text.match(re) ?? []).length;
  log('ifc', `${((performance.now() - t0) / 1000).toFixed(1)} s`, (ifc.bytes.length / 1e6).toFixed(2) + ' MB', 'IFCMEMBER', count(/^#\d+=IFCMEMBER\(/gm), 'IFCCOLUMN', count(/^#\d+=IFCCOLUMN\(/gm), 'TAPERED', count(/=IFCEXTRUDEDAREASOLIDTAPERED\(/g), 'proxy', count(/IFCBUILDINGELEMENTPROXY\(/g), 'Clipping', count(/'Body','Clipping'/g), 'CSG', count(/'Body','CSG'/g), 'IFCRAMP', count(/^#\d+=IFCRAMP\(/gm), 'Lean', count(/'Lean'/g), 'REVOLVED', count(/=IFCREVOLVEDAREASOLID\(/g));
  t0 = performance.now();
  const r = readIfc(ifc.bytes);
  log('reimport', r.status, `${((performance.now() - t0) / 1000).toFixed(1)} s`, 'report' in r ? { restored: r.report.restored, losses: r.report.losses.length } : '');
  if (r.status === 'imported') {
    const again = writeIfc(r.document, { artifactId: "k4", timeStamp: '2026-11-08T13:00:00', kernelQuantities: e.status === 'ok' ? e.kernelQuantities : undefined });
    log('rewrite same bytes', Buffer.from(again.bytes).equals(Buffer.from(ifc.bytes)));
  }
  for (const id of ['d2-galleria', 'd2-galleria-rail', 'd1-stair-1', 'd1-stair-2']) log('q', id, d.quantities.get(id)?.source, d.quantities.get(id)?.values);
  log('ifc stairs', count(/^#\d+=IFCSTAIR\(/gm), 'railings', count(/^#\d+=IFCRAILING\(/gm), 'Pset_StairCommon', count(/'Pset_StairCommon'/g));
  {
    const t1 = performance.now();
    const f56 = readIfc(readFileSync(new URL('../../packages/bim-ifc/fixtures/f56-foreign-stairs.ifc', import.meta.url)), { acceptLoss: true });
    log('f56', f56.status, `${((performance.now() - t1) / 1000).toFixed(2)} s`, 'report' in f56 ? f56.report.summary : '', f56.status === 'imported' ? f56.document.elements.filter((x) => x.kind === 'stair').map((x) => ({ name: x.name, ...(x.kind === 'stair' ? { risers: x.risers, tread: x.treadMm, width: x.widthMm, dir: (x.directionRad * 180) / Math.PI } : {}) })) : '');
  }
  for (const id of ['d2-galleria', 'd2-galleria-rail', 'd1-stair-1', 'd1-stair-2', 'd1-entrance-n', 'd1-cw-3-3']) {
    const r = e.status === 'ok' ? e.elements.get(id) : undefined;
    log('ls', id, d.quantities.get(id)?.source, r?.status === 'ok' ? { volume: (r.measure.volumeMm3 / 1e9).toFixed(3) + ' m3', top: r.measure.bounds[1][2].toFixed(1) } : r);
  }
  const roof = d.shapes.get('d1-roof');
  log('roof', roof);
  for (const v of process.env.DRAW ? doc.views : []) {
    t0 = performance.now();
    const dr = await drawBim(doc, v, kernel);
    if (dr.status !== 'ok') { log('drawing', v.name, dr.status, 'code' in dr ? dr.code : ''); continue; }
    writeFileSync(`${out}/${v.id}.svg`, bimDrawingSvg(dr.drawing));
    log('drawing', v.name, `${((performance.now() - t0) / 1000).toFixed(1)} s`, 'items', dr.drawing.items.length, 'failed', dr.drawing.failed);
  }
});
