/** TT5: build the tower plan and run every check (node, prism bodies). */
import { mkdirSync, writeFileSync } from 'node:fs';
import { bimElementMass, deriveBim, validateBim } from '@editor-platform/bim-core';
import { checkCranes, checkDeliveries, checkRaises, checkSite, gateCounts, liftTimes, liftsPastDayEnd, scheduleConstruction, siteTerrain, validateConstruction } from '@editor-platform/construction-core';
import { twinBim } from './twin-bim';
import { tt5Construction } from './tt5-construction';
import { triBodies } from './tribodies';
const out = process.env.OUT ?? '/mnt/project-files/skytree-twin/tt5';
mkdirSync(out, { recursive: true });
const bim = twinBim();
const derived = deriveBim(bim);
const doc = tt5Construction(bim);
writeFileSync(`${out}/tt5-bim.json`, JSON.stringify(bim));
writeFileSync(`${out}/tt5-construction.json`, JSON.stringify(doc));
const v = validateConstruction(doc);
console.log('validation', v.length, JSON.stringify(v.slice(0, 5)));
const plan = scheduleConstruction(doc);
console.log('schedule diagnostics', plan.diagnostics?.length ?? 0, JSON.stringify(plan.diagnostics?.slice(0, 3)));
for (const id of ['found', 'steel-01', 'steel-11', 'steel-43', 'deck1-steel', 'steel-top', 'set-mast-7', 'raise-5', 'top', 'cranes-down', 'pour-core-15', 'deck1-fit', 'podium', 'finish']) {
  const p = plan.byId.get(id);
  console.log(' ', id, p?.start, p?.finish);
}
const terrain = siteTerrain(doc.site);
const world = { bodies: triBodies(bim), mass: (id: string) => { const m = bimElementMass(bim, derived, id); return m.status === 'ok' ? { kg: m.kg } : { reason: m.status }; }, ground: (p: [number, number]) => terrain.heightAt(p) };
const site = [...checkSite(doc, plan), ...checkRaises(doc, plan), ...checkDeliveries(doc, plan)];
const past = liftsPastDayEnd(doc, plan);
const liftDays = [...new Set([...liftTimes(doc, plan).values()].map((t) => t.day))].sort();
const gateNotes = new Map<string, unknown>();
let trucks = 0;
for (const d of liftDays) { const g = gateCounts(doc, plan, d); for (const n of g.notes) gateNotes.set(n.message, n); trucks = Math.max(trucks, ...g.counts.map((c) => c.trucks)); }
site.push(...(gateNotes.values() as never));
console.log('lift days', liftDays.length, 'most trucks through the gate in a day', trucks);
const t = performance.now();
const cr = checkCranes(doc, plan, world as never);
const ms = performance.now() - t;
const all = [...site, ...cr];
const by: Record<string, number> = {};
for (const p of all) by[p.code] = (by[p.code] ?? 0) + 1;
console.log('lifts', doc.site!.lifts!.length, 'crane check ms', Math.round(ms), 'problems', all.length, JSON.stringify(by), 'past day end', past.length);
const seen: Record<string, number> = {};
for (const p of all) if ((seen[p.code] = (seen[p.code] ?? 0) + 1) <= +(process.env.EX ?? 4)) console.log(' ', p.code, p.message);
writeFileSync(`${out}/tt5-checks.json`, JSON.stringify(all, null, 1));
