/** D1: the Skytree twin with today's features — validate, schedule, crane and traffic checks (box bodies, no kernel). */
import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { bimElementMass, deriveBim, validateBim, type BimDocument } from '@editor-platform/bim-core';
import {
  checkCranes, checkSite, gateCounts, hazardsOnDay, scheduleConstruction, siteTerrain, validateConstruction,
  type Box, type CraneWorld, type LiftBody,
} from '@editor-platform/construction-core';
import { twinBim } from './twin-bim';
import { twinConstruction } from './twin-construction';

const out = process.env.OUT ?? '/mnt/project-files/skytree-twin/d1';
const L: string[] = [];
const log = (...a: unknown[]) => { L.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); writeFileSync(`${out}/d1.log`, L.join('\n') + '\n'); };

export function boxBodies(bim: BimDocument): Map<string, LiftBody> {
  const d = deriveBim(bim);
  const o = new Map<string, LiftBody>();
  const r = (p: { shape: string; diameterMm?: number; widthMm?: number; depthMm?: number }) => (p.diameterMm ?? Math.max(p.widthMm ?? 0, p.depthMm ?? 0)) / 2;
  const seg = (a: number[], b: number[], rad: number): Box => [
    [Math.min(a[0]!, b[0]!) - rad, Math.min(a[1]!, b[1]!) - rad, Math.min(a[2]!, b[2]!) - rad],
    [Math.max(a[0]!, b[0]!) + rad, Math.max(a[1]!, b[1]!) + rad, Math.max(a[2]!, b[2]!) + rad],
  ];
  for (const [id, s] of d.shapes) {
    if (s.kind === 'column') {
      const top = s.topAt ?? s.at;
      const b = seg([s.at[0], s.at[1], s.zBase], [top[0], top[1], s.zTop], r(s.profile as never));
      b[0][2] = s.zBase; b[1][2] = s.zTop;
      o.set(id, { bounds: b });
    } else if (s.kind === 'member') o.set(id, { bounds: seg(s.start, s.end, r(s.profile as never)) });
    else if (s.kind === 'beam') o.set(id, { bounds: seg([...s.start, s.zTop - 500], [...s.end, s.zTop], r(s.profile as never)) });
    else if (s.kind === 'slab') {
      const xs = s.boundary.map((p) => p[0]), ys = s.boundary.map((p) => p[1]);
      o.set(id, { bounds: [[Math.min(...xs), Math.min(...ys), s.zBottom], [Math.max(...xs), Math.max(...ys), s.zTop]] });
    }
  }
  return o;
}

it('D1 baseline', { timeout: 1_800_000 }, () => {
  mkdirSync(out, { recursive: true });
  const bim = twinBim();
  const kinds: Record<string, number> = {};
  for (const e of bim.elements) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
  log('BIM elements', bim.elements.length, kinds);
  log('BIM errors', validateBim(bim).filter((x) => x.severity === 'error').slice(0, 10));
  const derived = deriveBim(bim);
  let steel = 0;
  const heavy: [string, number][] = [];
  for (const e of bim.elements) {
    const m = bimElementMass(bim, derived, e.id);
    if (m.status === 'ok' && /^(b\d|mast|dc-|d\d-ring|core)/.test(e.id)) { if (!e.id.startsWith('core')) steel += m.kg; heavy.push([e.id, Math.round(m.kg)]); }
  }
  heavy.sort((a, b) => b[1] - a[1]);
  log('steel t', Math.round(steel / 1000), 'heaviest', heavy.slice(0, 8));
  const doc = twinConstruction(bim);
  writeFileSync(`${out}/twin-bim.json`, JSON.stringify(bim));
  writeFileSync(`${out}/twin-construction.json`, JSON.stringify(doc));
  const v = validateConstruction(doc);
  log('construction validation', v.length, v.slice(0, 15));
  if (v.length) return;
  const plan = scheduleConstruction(doc);
  log('schedule diagnostics', plan.diagnostics?.slice(0, 5));
  const at = (id: string) => { const p = plan.byId.get(id); return p ? `${p.start}..${p.finish}${p.critical ? ' *' : ''}` : '?'; };
  for (const id of ['site', 'found', 'steel-01', 'steel-11', 'steel-21', 'deck1-steel', 'steel-top', 'mast', 'top', 'pour-core-15', 'cranes-down', 'podium', 'finish']) log(id, at(id));
  const terrain = siteTerrain(doc.site);
  const world: CraneWorld = {
    bodies: boxBodies(bim),
    mass: (id) => { const m = bimElementMass(bim, derived, id); return m.status === 'ok' ? { kg: m.kg } : { reason: m.status }; },
    ground: (p) => terrain.heightAt(p),
  };
  log('site checks', checkSite(doc, plan).slice(0, 10));
  let t = performance.now();
  const crane = checkCranes(doc, plan, world);
  log('crane check ms', Math.round(performance.now() - t), 'problems', crane.length);
  const byCode: Record<string, number> = {};
  for (const p of crane) byCode[p.code] = (byCode[p.code] ?? 0) + 1;
  log('by code', byCode);
  const seen = new Set<string>();
  for (const p of crane) if (!seen.has(p.code)) { seen.add(p.code); log(' e.g.', p.code, p.message); }
  for (const p of crane.filter((x) => x.code === 'overload').slice(0, 5)) log(' overload', p.message);
  t = performance.now();
  const day = plan.byId.get('steel-21')!.start;
  const hz = hazardsOnDay(doc, plan, world as never, day);
  log('hazards on', day, Array.isArray(hz) ? hz.length : hz, 'ms', Math.round(performance.now() - t));
  log('gate counts', JSON.stringify(gateCounts(doc, plan, day)).slice(0, 300));
});
