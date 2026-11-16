/**
 * Skytree twin: the construction of the tower as a construction document (CS1–CS5 features as
 * they are on main). Dates follow the public record (ground-breaking 2008-07-14, 634 m on
 * 2011-03-18, completion 2012-02-29); durations are fitted to them. Cranes, loads and the yard
 * are assumptions.
 *
 * Baseline (D1): what the editor has today. A climbing crane is written as one crane per climb
 * (each up while its band of the tower is built), the gain tower is built in place (no lift-up).
 */
import type { BimDocument } from '@editor-platform/bim-core';
import {
  newConstruction,
  workingDaysBetween,
  type ConstructionDocument,
  type ConstructionTask,
  type Crane,
  type Plan,
} from '@editor-platform/construction-core';
import { bands, coreLifts, mastSections, twinBim } from './twin-bim';

const M = 1000;
const rect = (x0: number, y0: number, x1: number, y1: number): Plan[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const disc = (r: number, c: Plan = [0, 0], n = 24): Plan[] =>
  Array.from({ length: n }, (_, i) => [Math.round(c[0] + r * Math.cos((2 * Math.PI * i) / n)), Math.round(c[1] + r * Math.sin((2 * Math.PI * i) / n))] as Plan);

/** Height (m) the steel reached on each date (public record), for fitting band durations. */
export const reached: [string, number][] = [
  ['2009-04-07', 0], ['2009-08-07', 100], ['2009-11-10', 200], ['2010-02-16', 300], ['2010-03-29', 338],
  ['2010-07-30', 413], ['2010-09-11', 461], ['2010-10-23', 497],
];
/** The date the steel reached height z (m), interpolated. */
function dateAt(z: number): string {
  for (let i = 1; i < reached.length; i++) {
    const [d0, z0] = reached[i - 1]!, [d1, z1] = reached[i]!;
    if (z <= z1) {
      const t0 = Date.parse(d0), t1 = Date.parse(d1);
      return new Date(t0 + ((t1 - t0) * (z - z0)) / (z1 - z0)).toISOString().slice(0, 10);
    }
  }
  return reached.at(-1)![0];
}

/** JCC-V720 class climbing tower crane (assumed chart). */
export const towerChart = [
  { radius: 16 * M, capacityKg: 32_000 }, { radius: 25 * M, capacityKg: 24_000 }, { radius: 30 * M, capacityKg: 20_000 },
  { radius: 40 * M, capacityKg: 15_000 }, { radius: 50 * M, capacityKg: 12_000 }, { radius: 55 * M, capacityKg: 11_000 },
];
/** 650 t class crawler crane with a long boom (assumed chart). */
export const crawlerChart = [
  { radius: 20 * M, capacityKg: 80_000 }, { radius: 30 * M, capacityKg: 60_000 }, { radius: 40 * M, capacityKg: 42_000 },
  { radius: 50 * M, capacityKg: 32_000 }, { radius: 60 * M, capacityKg: 25_000 },
];
/** Tower cranes: four round the core, 9 m out. */
export const towerCraneBases: Plan[] = [[9 * M, 0], [0, 9 * M], [-9 * M, 0], [0, -9 * M]];
/** The yard under the tower where trucks unload and the tower cranes pick. */
export const yard: Plan = [-20 * M, -6 * M];
export const gate: Plan = [250 * M, -60 * M];

export function twinConstruction(bim: BimDocument = twinBim()): ConstructionDocument {
  const doc = newConstruction('Skytree twin construction', { artifactId: 'bim-skytree', versionId: 'v1', contentHash: 'a'.repeat(64) }, '2008-07-14');
  doc.calendar.holidays = [];
  const wd = (a: string, b: string) => Math.max(1, workingDaysBetween(doc, a, b).length);
  const lagTo = (from: string, to: string) => Math.max(0, workingDaysBetween(doc, from, to).length - 1);
  const ids = (re: RegExp) => bim.elements.filter((e) => re.test(e.id)).map((e) => e.id);
  const tasks: ConstructionTask[] = [];
  const add = (id: string, name: string, durationDays: number, after: [string, number][], elementIds: string[] = [], action: ConstructionTask['action'] = 'construct') =>
    tasks.push({ id, name, durationDays, predecessors: after.map(([taskId, lagDays]) => ({ taskId, lagDays })), action, elementIds });

  add('site', 'Site preparation', wd('2008-07-14', '2008-08-30'), []);
  add('found', 'Leg and core foundations', wd('2008-09-01', '2009-04-06'), [['site', 0]], ids(/^found-/));
  // Lattice: one task per two bands; the steel's height on the record gives each its dates.
  const B = bands();
  let prev = 'found';
  let prevFinish = '2009-04-06';
  const bandTask: string[] = [];
  for (let i = 0; i < B.length; i += 2) {
    const z1 = B[Math.min(i + 1, B.length - 1)]![1];
    const finish = dateAt(Math.min(z1, 497));
    const tag = `${String(i + 1).padStart(2, '0')}`;
    const id = `steel-${tag}`;
    const els = [i, i + 1].filter((k) => k < B.length).flatMap((k) => ids(new RegExp(`^b${String(k + 1).padStart(2, '0')}-`)));
    add(id, `Steel ${B[i]![0].toFixed(0)}–${z1.toFixed(0)} m`, Math.max(3, wd(prevFinish, finish) - 1), [[prev, 0]], els);
    bandTask[i] = bandTask[i + 1] = id;
    // The decks between the lattice's gaps follow the band under them.
    if (B[i + 1]?.[1] === 335 || B[i]![1] === 335) {
      add('deck1-steel', 'Tembo deck columns and ring', 20, [[id, 0]], ids(/^(dc-d1-|d1-ring-)/));
      prev = 'deck1-steel';
    } else if (B[i + 1]?.[1] === 440 || B[i]![1] === 440) {
      add('deck2-steel', 'Galleria columns and ring', 15, [[id, 0]], ids(/^(dc-d2-|d2-ring-)/));
      prev = 'deck2-steel';
    } else prev = id;
    prevFinish = finish;
  }
  add('steel-top', 'Lattice topped out (497 m)', 0, [[prev, 0]]);
  // Decks' floors and glass after their steel.
  add('deck1-fit', 'Tembo deck floors, glass and roof', wd('2010-05-01', '2011-06-30'), [['deck1-steel', 25]], ids(/^d1-(?!ring-)/));
  add('deck2-fit', 'Galleria floors, ramp and glass', wd('2010-10-01', '2011-08-31'), [['deck2-steel', 10]], ids(/^d2-(?!ring-)/));
  // Gain tower: in place on the lattice top (baseline: the editor has no lift-up).
  add('mast', 'Gain tower (antenna mast) 497–634 m', wd('2010-12-01', '2011-03-18'), [['steel-top', 30]], ids(/^mast-/));
  add('top', '634 m reached', 0, [['mast', 0]]);
  // Core column by slip form after the mast leaves the shaft: 25 m per task.
  let c = 'top';
  for (let i = 0; i < coreLifts; i++) {
    const id = `core-${String(i + 1).padStart(2, '0')}`;
    add(`pour-${id}`, `Core column ${i * 25}–${(i + 1) * 25} m (slip form)`, 9, [[c, i ? 0 : 5]], [id]);
    c = `pour-${id}`;
  }
  add('cranes-down', 'Tower cranes dismantled', wd('2011-05-23', '2011-07-15'), [['top', lagTo('2011-03-18', '2011-05-23')]]);
  // The podium (base building) beside the tower.
  add('podium', 'Base building', wd('2009-06-01', '2011-12-28'), [['found', lagTo('2009-04-06', '2009-06-01')]], bim.elements.filter((e) => /^(c-|b-|bs-|bw|bd-|bwin-|bsp-)/.test(e.id) || e.id === 'b-roof').map((e) => e.id));
  add('finish', 'Completion', 0, [['podium', 0], ['deck1-fit', 0], ['deck2-fit', 0], [c, 0], ['cranes-down', 0]]);
  // Everything else standing at the end belongs to the fit-out.
  const used = new Set(tasks.flatMap((t) => t.elementIds));
  const rest = bim.elements.filter((e) => !used.has(e.id) && !['opening', 'space', 'door', 'window', 'railing'].includes(e.kind)).map((e) => e.id);
  if (rest.length) tasks.find((t) => t.id === 'deck1-fit')!.elementIds.push(...rest.filter((id) => !id.startsWith('d2-')));
  doc.tasks = tasks;

  // ---- Site ----
  const terrain: [number, number, number][] = [];
  for (let x = -100; x <= 320; x += 20) for (let y = -80; y <= 80; y += 20) terrain.push([x * M, y * M, 0]);
  doc.site = {
    boundary: rect(-90 * M, -70 * M, 310 * M, 70 * M),
    terrain,
    earthworks: [
      ...[0, 1, 2].map((k) => {
        const f = bim.elements.find((e) => e.id === `found-${k + 1}`);
        const p = f && f.kind === 'slab' ? f.boundary : [[0, 0]];
        const cx = p.reduce((s, v) => s + v[0]!, 0) / p.length, cy = p.reduce((s, v) => s + v[1]!, 0) / p.length;
        return { id: `pit-${k + 1}`, name: `Leg pit T${k + 1}`, kind: 'cut' as const, outline: disc(13 * M, [cx, cy]), levelZ: -6000, slope: 0.5, taskId: 'found' };
      }),
    ],
    temporaries: [
      { id: 'hoarding-s', name: 'Hoarding south', kind: 'hoarding', outline: rect(-89 * M, -69.8 * M, 309 * M, -69.5 * M), height: 3000, fromTaskId: 'site', untilTaskId: 'finish' },
      { id: 'gate', name: 'Gate', kind: 'gate', outline: rect(gate[0] - 6 * M, -69.9 * M, gate[0] + 6 * M, -69.4 * M), height: 4000, fromTaskId: 'site', untilTaskId: 'finish' },
      { id: 'yard', name: 'Steel yard under the tower', kind: 'yard', outline: rect(yard[0] - 8 * M, yard[1] - 8 * M, yard[0] + 8 * M, yard[1] + 8 * M), height: 100, fromTaskId: 'found', untilTaskId: 'steel-top' },
      { id: 'office', name: 'Site office', kind: 'office', outline: rect(260 * M, 40 * M, 300 * M, 60 * M), height: 9000, fromTaskId: 'site', untilTaskId: 'finish' },
    ],
  };
  const site = doc.site;
  // Baseline cranes: crawler cranes for the first 100 m, then each tower crane as one record per
  // 100 m climb (the editor's crane has one fixed height).
  const cranes: Crane[] = [];
  const firstHigh = bandTask.find((_, i) => B[i]![0] >= 100)!;
  const crawlerUntil = bandTask[B.findIndex((b) => b[1] >= 100)]!;
  [[60, 0], [-30, 52], [-30, -52]].forEach(([r, a], k) => {
    void a;
    const ang = (Math.PI / 2) + (k * 2 * Math.PI) / 3 + Math.PI / 3;
    const base: Plan = [Math.round(60 * M * Math.cos(ang)), Math.round(60 * M * Math.sin(ang))];
    void r;
    cranes.push({ id: `cc-${k + 1}`, name: `Crawler crane ${k + 1}`, kind: 'mobile', base, height: 4000, jibLength: 120 * M, minRadius: 12 * M, loadChart: crawlerChart, massKg: 650_000, fromTaskId: 'found', untilTaskId: crawlerUntil });
  });
  const climbs = process.env.CLIMBS ? JSON.parse(process.env.CLIMBS) : [125, 250, 375, 500];
  towerCraneBases.forEach((base, k) => {
    climbs.forEach((top, s) => {
      const fromTask = s === 0 ? firstHigh : bandTask[B.findIndex((b) => b[0] >= climbs[s - 1]!)] ?? 'steel-top';
      const nextIdx = B.findIndex((b) => b[0] >= top);
      const until = s === climbs.length - 1 ? 'cranes-down' : bandTask[nextIdx - 1] ?? 'steel-top';
      cranes.push({ id: `tc-${k + 1}-${top}`, name: `Tower crane ${k + 1} (jib at ${top + 20} m)`, kind: 'tower', base, baseZ: (s ? climbs[s - 1]! - 20 : 0) * M, height: (top + 20 - (s ? climbs[s - 1]! - 20 : 0)) * M, jibLength: 55 * M, minRadius: 4 * M, loadChart: towerChart, massKg: 150_000, fromTaskId: fromTask, untilTaskId: until });
    });
  });
  site.cranes = cranes;
  // Lifts: every lattice piece, deck column/ring and gain tower section from the yard.
  const craneFor = (taskId: string, n: number, z: number): string => {
    if (z < 100) return `cc-${(n % 3) + 1}`;
    const top = climbs.find((t: number) => z < t) ?? 500;
    return `tc-${(n % 4) + 1}-${top}`;
  };
  const zOf = (id: string) => {
    const m = /^b(\d+)-/.exec(id);
    if (m) return B[+m[1]! - 1]![0];
    if (id.startsWith('dc-d1') || id.startsWith('d1-ring')) return 335;
    if (id.startsWith('dc-d2') || id.startsWith('d2-ring')) return 440;
    if (id.startsWith('mast')) return 495;
    return 0;
  };
  let n = 0;
  site.lifts = tasks
    .filter((t) => t.id.startsWith('steel-') || t.id.endsWith('-steel') || t.id === 'mast')
    .flatMap((t) =>
      t.elementIds.map((elementId) => {
        const z = zOf(elementId);
        const k = n++;
        const pick: [number, number, number] = z < 100 ? [Math.round(70 * M * Math.cos(k)), Math.round(70 * M * Math.sin(k)), 1000] : [yard[0], yard[1], 1000];
        return { id: `lift-${elementId}`, craneId: craneFor(t.id, k, z), taskId: t.id, elementId, pick };
      }),
    );
  site.hours = { start: '08:00', end: '17:00' };
  site.routes = [
    {
      id: 'truck-steel', name: 'Steel trailer', kind: 'truck',
      path: [gate, [gate[0], -40 * M], [yard[0] + 30 * M, -40 * M], [yard[0] + 30 * M, yard[1]], [yard[0] + 8 * M, yard[1]]],
      speedKmh: 10, taskId: 'steel-21', departures: ['07:30', '09:00', '10:30', '13:00', '14:30'], returns: true,
    },
  ];
  return doc;
}
