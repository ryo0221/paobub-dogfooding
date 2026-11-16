/**
 * Skytree twin TT5: the tower's construction planned with the TT1–TT3 features so the checks come
 * out clean (only the intended notices). Dates follow the public record (ground-breaking
 * 2008-07-14, lattice 497 m on 2010-10-23, 634 m on 2011-03-18, completion 2012-02-29); cranes,
 * charts, loads, routes and the yard are assumptions. Not the real project's plan.
 *
 * - 0–~100 m: three crawler cranes outside the three faces of the triangular foot, each erecting
 *   its own face; trucks bring the pieces to a stop between the crane and the face.
 * - ~100–497 m: four tower cranes in the central shaft (5 m off the axis) climbing with the steel,
 *   standing on the rings below; trucks drive into the foot and the pieces go up the shaft.
 * - Gain tower: assembled top first in the bottom of the shaft by its own gantry (no crane lifts),
 *   jacked up a section at a time, then raised 495 m in five steps (lift-up, `raise`).
 * - Core column by slip form, and the decks' floors, after the tower cranes are down.
 */
import type { BimDocument } from '@editor-platform/bim-core';
import {
  liftClock,
  liftTimes,
  newConstruction,
  scheduleConstruction,
  workingDaysBetween,
  type ConstructionDocument,
  type ConstructionTask,
  type Crane,
  type CraneClimb,
  type Lift,
  type Plan,
  type SiteRoute,
} from '@editor-platform/construction-core';
import { bands, coreLifts, mastBase, mastSections, mastTop, twinBim } from './twin-bim';
import { boxBodies } from './boxes';

const M = 1000;
const rect = (x0: number, y0: number, x1: number, y1: number): Plan[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const disc = (r: number, c: Plan = [0, 0], n = 24): Plan[] =>
  Array.from({ length: n }, (_, i) => [Math.round(c[0] + r * Math.cos((2 * Math.PI * i) / n)), Math.round(c[1] + r * Math.sin((2 * Math.PI * i) / n))] as Plan);
const polar = (r: number, deg: number): Plan => [Math.round(r * M * Math.cos((deg * Math.PI) / 180)), Math.round(r * M * Math.sin((deg * Math.PI) / 180))];

/** Height (m) the steel reached on each date (public record), for fitting band durations. */
export const reached: [string, number][] = [
  ['2009-04-07', 0], ['2009-08-07', 100], ['2009-11-10', 200], ['2010-02-16', 300], ['2010-03-29', 338],
  ['2010-07-30', 413], ['2010-09-11', 461], ['2010-10-23', 497],
];
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

/** Climbing tower crane, JCC-V720 class (assumed chart). */
export const towerChart = [
  { radius: 16 * M, capacityKg: 32_000 }, { radius: 25 * M, capacityKg: 24_000 }, { radius: 30 * M, capacityKg: 20_000 },
  { radius: 40 * M, capacityKg: 15_000 }, { radius: 50 * M, capacityKg: 12_000 }, { radius: 55 * M, capacityKg: 11_000 },
];
/** 1,350 t class crawler crane with a 190 m boom and superlift (assumed chart). */
export const crawlerChart = [
  { radius: 20 * M, capacityKg: 150_000 }, { radius: 30 * M, capacityKg: 110_000 }, { radius: 40 * M, capacityKg: 80_000 },
  { radius: 50 * M, capacityKg: 60_000 },
];
/** The faces of the triangular foot: the directions (°) of their middles. */
export const faces = [270, 30, 150];
/** Tower cranes in the shaft: 5 m off the axis. */
export const towerCraneBases: Plan[] = [0, 90, 180, 270].map((a) => polar(5, a));
export const gate: Plan = [250 * M, -77650];
/** Where the trucks for the tower cranes stop: in the shaft, under the axis. */
export const shaftStop: Plan = [0, -3 * M];

export interface Tt5Options {
  /** Height of a tower crane's jib above its base (m). */
  towerHeight?: number;
  /** Jib above the highest top the climb serves (m). */
  jibAbove?: number;
}

export function tt5Construction(bim: BimDocument = twinBim(), o: Tt5Options = {}): ConstructionDocument {
  const towerHeight = o.towerHeight ?? 70;
  const jibAbove = o.jibAbove ?? 16;
  const bodies = boxBodies(bim);
  const top = (id: string) => (bodies.get(id)?.bounds[1][2] ?? 0) / M;
  const doc = newConstruction('スカイツリーの近似のデジタルツイン 施工計画', { artifactId: 'bim-skytree', versionId: 'v1', contentHash: 'a'.repeat(64) }, '2008-07-14');
  doc.calendar.holidays = [];
  const wd = (a: string, b: string) => Math.max(1, workingDaysBetween(doc, a, b).length);
  const lagTo = (from: string, to: string) => Math.max(0, workingDaysBetween(doc, from, to).length - 1);
  const ids = (re: RegExp) => bim.elements.filter((e) => re.test(e.id)).map((e) => e.id);
  const tasks: ConstructionTask[] = [];
  const add = (id: string, name: string, durationDays: number, after: [string, number][], elementIds: string[] = [], extra: Partial<ConstructionTask> = {}) => {
    const t: ConstructionTask = { id, name, durationDays, predecessors: after.map(([taskId, lagDays]) => ({ taskId, lagDays })), action: 'construct', elementIds, ...extra };
    tasks.push(t);
    return t;
  };

  add('site', '準備工事', wd('2008-07-14', '2008-08-30'), []);
  add('found', '脚と心柱の基礎', wd('2008-09-01', '2009-04-06'), [['site', 0]], ids(/^found-/));
  // Lattice: one task per two bands, fitted to the record's heights. Braces after legs, rings last.
  const B = bands();
  let prev = 'found';
  let prevFinish = '2009-04-06';
  const bandTasks: string[] = [];
  const order = (id: string) => (/-leg-/.test(id) ? 0 : /-brace-/.test(id) ? 1 : 2);
  // The decks' steel in the lattice's gaps, before the bands above: columns up to the ring, the
  // ring, then the columns' upper pieces.
  const deckOrder = (id: string) => (id.endsWith('-lo') ? 0 : id.includes('-ring-') ? 1 : id.endsWith('-mid') ? 2 : 3);
  const decks: [number, string, string, number, RegExp][] = [
    [335, 'deck1-steel', '350 m の展望台の柱と環', 20, /^(dc-d1-|d1-ring-)/],
    [440, 'deck2-steel', '450 m の展望台の柱と環', 15, /^(dc-d2-|d2-ring-)/],
  ];
  let carry = 0;
  for (let i = 0; i < B.length; i += 2) {
    const z1 = B[Math.min(i + 1, B.length - 1)]![1];
    const finish = dateAt(Math.min(z1, 497));
    const id = `steel-${String(i + 1).padStart(2, '0')}`;
    const els = [i, i + 1].filter((k) => k < B.length).flatMap((k) => {
      const tag = `b${String(k + 1).padStart(2, '0')}-`;
      return ids(new RegExp(`^${tag}`)).sort((a, b) => order(a) - order(b));
    });
    add(id, `鉄骨 ${B[i]![0].toFixed(0)}–${z1.toFixed(0)} m`, Math.max(3, wd(prevFinish, finish) - 1 - carry), [[prev, 0]], els);
    bandTasks.push(id);
    prev = id;
    prevFinish = finish;
    carry = 0;
    const deck = decks.find(([z]) => Math.abs(z1 - z) < 6);
    if (deck) {
      const [, did, name, days, re] = deck;
      add(did, name, days, [[prev, 0]], ids(re).sort((a, b) => deckOrder(a) - deckOrder(b)));
      prev = did;
      carry = days;
    }
  }
  const under = (z: number) => tasks.find((t) => t.id.startsWith('steel-') && Math.abs(Math.max(...t.elementIds.map(top)) - z) < 6)!.id;
  add('steel-top', '塔体の鉄骨 497 m', 0, [[prev, 0]]);

  // Gain tower: the top section first, jacked up one section's height before the next is set
  // under it; then all of it raised 495 m in five steps.
  const h = Math.round(((mastTop - mastBase) / mastSections) * M);
  let g = 'steel-top';
  const up: string[] = [];
  for (let s = mastSections; s >= 1; s--) {
    const id = `mast-${s}`;
    add(`set-${id}`, `ゲイン塔 第${s}節を吹き抜けの底に据える`, 6, [[g, 0]], [id]);
    up.push(id);
    g = `set-${id}`;
    if (s > 1) {
      add(`jack-${id}`, `ゲイン塔を ${(h / M).toFixed(1)} m 押し上げる`, 2, [[g, 0]], [...up], { action: 'raise', raiseMm: h });
      g = `jack-${id}`;
    }
  }
  const lift = Math.round(mastBase * M) / 5;
  // The five lifts fill the time to 634 m on the record (2011-03-18).
  const assembly = mastSections * 6 + (mastSections - 1) * 2;
  const raiseAll = wd('2010-10-19', '2011-03-18') - assembly;
  const raiseDays = Math.floor(raiseAll / 5);
  for (let k = 1; k <= 5; k++) {
    const days = k < 5 ? raiseDays : raiseAll - 4 * raiseDays;
    add(`raise-${k}`, `ゲイン塔を ${(lift / M).toFixed(0)} m 引き上げる（${k}/5）`, days, [[g, 0]], [...up], { action: 'raise', raiseMm: lift });
    g = `raise-${k}`;
  }
  add('top', '634 m 到達', 0, [[g, 0]]);
  add('cranes-down', 'タワークレーンの解体', wd('2011-03-22', '2011-05-20'), [['top', 1]]);
  // Core column by slip form after the cranes leave the shaft: 25 m per task.
  let c = 'cranes-down';
  for (let i = 0; i < coreLifts; i++) {
    const id = `core-${String(i + 1).padStart(2, '0')}`;
    add(`pour-${id}`, `心柱 ${i * 25}–${(i + 1) * 25} m（スリップフォーム）`, 9, [[c, 0]], [id]);
    c = `pour-${id}`;
  }
  add('deck1-fit', '350 m の展望台の床・ガラス・屋根', wd('2011-05-23', '2012-02-10'), [['cranes-down', 0]], ids(/^d1-(?!ring-)/));
  add('deck2-fit', '450 m の展望台の床・斜路・ガラス', wd('2011-06-01', '2012-02-10'), [['cranes-down', 7]], ids(/^d2-(?!ring-)/));
  add('podium', '足元の建物', wd('2009-06-01', '2012-02-27'), [['found', lagTo('2009-04-06', '2009-06-01')]], bim.elements.filter((e) => /^(c-|b-|bs-|bw|bd-|bwin-|bsp-)/.test(e.id) || e.id === 'b-roof').map((e) => e.id));
  add('finish', '竣工', 0, [['podium', 0], ['deck1-fit', 0], ['deck2-fit', 0], [c, 0]]);
  const used = new Set(tasks.flatMap((t) => t.elementIds));
  const rest = bim.elements.filter((e) => !used.has(e.id) && !['opening', 'space', 'door', 'window', 'railing'].includes(e.kind)).map((e) => e.id);
  if (rest.length) tasks.find((t) => t.id === 'deck1-fit')!.elementIds.push(...rest);
  doc.tasks = tasks;

  // ---- Site ----
  const terrain: [number, number, number][] = [];
  for (let x = -100; x <= 320; x += 20) for (let y = -80; y <= 80; y += 20) terrain.push([x * M, y * M, 0]);
  doc.site = {
    boundary: rect(-90 * M, -78 * M, 310 * M, 70 * M),
    terrain,
    earthworks: [0, 1, 2].map((k) => {
      const f = bim.elements.find((e) => e.id === `found-${k + 1}`);
      const p = f && f.kind === 'slab' ? f.boundary : [[0, 0]];
      const cx = p.reduce((s, v) => s + v[0]!, 0) / p.length, cy = p.reduce((s, v) => s + v[1]!, 0) / p.length;
      return { id: `pit-${k + 1}`, name: `脚 T${k + 1} の掘削`, kind: 'cut' as const, outline: disc(13 * M, [cx, cy]), levelZ: -6000, slope: 0.5, taskId: 'found' };
    }),
    temporaries: [
      { id: 'hoarding-s', name: '南の仮囲い', kind: 'hoarding', outline: rect(-89 * M, -77.8 * M, 309 * M, -77.5 * M), height: 3000, fromTaskId: 'site', untilTaskId: 'finish' },
      { id: 'gate', name: 'ゲート', kind: 'gate', outline: rect(gate[0] - 6 * M, -77.9 * M, gate[0] + 6 * M, -77.4 * M), height: 4000, fromTaskId: 'site', untilTaskId: 'finish' },
      { id: 'office', name: '現場事務所', kind: 'office', outline: rect(260 * M, 40 * M, 300 * M, 60 * M), height: 9000, fromTaskId: 'site', untilTaskId: 'finish' },
    ],
  };
  const site = doc.site;
  site.hours = { start: '08:00', end: '17:00' };

  // Which tasks the crawlers serve: the bands below 100 m.
  const lowTasks = bandTasks.filter((id) => Math.max(...tasks.find((t) => t.id === id)!.elementIds.map(top)) <= 170);
  const highTasks = [...bandTasks.filter((id) => !lowTasks.includes(id)), 'deck1-steel', 'deck2-steel'];
  const task = (id: string) => tasks.find((t) => t.id === id)!;
  const cranes: Crane[] = [];
  const routes: SiteRoute[] = [];
  const pickR = 34;
  faces.forEach((a, k) => {
    cranes.push({ id: `cc-${k + 1}`, name: `クローラークレーン ${k + 1}`, kind: 'mobile', base: polar(54, a), height: 4000, jibLength: 190 * M, minRadius: 12 * M, loadChart: crawlerChart, massKg: 1_250_000, fromTaskId: lowTasks[0]!, untilTaskId: lowTasks.at(-1)! });
    const stop = polar(pickR, a);
    // From the gate along the south, round the outside to the stop beside the crane.
    const out = polar(70, a);
    const path: Plan[] = [gate, [gate[0], -74 * M], [Math.max(-80 * M, Math.min(gate[0], out[0])), -74 * M]];
    if (a !== 270) path.push([out[0], -74 * M], out);
    path.push(polar(pickR + 6, a), stop);
    routes.push({ id: `truck-cc-${k + 1}`, name: `クローラー ${k + 1} へのトレーラー`, kind: 'truck', path: dedupe(path), speedKmh: 10, taskId: lowTasks[0]!, departures: [], returns: true, delivers: { perTrip: 2, leadMinutes: 30 } });
  });
  routes.push({
    id: 'truck-shaft', name: '吹き抜けへのトレーラー', kind: 'truck',
    path: [gate, [gate[0], -74 * M], [-6 * M, -74 * M], [-6 * M, -24 * M], [shaftStop[0], -12 * M], shaftStop],
    speedKmh: 8, taskId: highTasks[0]!, departures: [], returns: true, delivers: { perTrip: 2, leadMinutes: 30 },
  });
  // Tower cranes: climbs every two tasks; each climb's jib above the tallest piece it sets.
  const chunks: string[][] = [];
  const chain = highTasks.filter((id) => id.startsWith('steel-'));
  for (let i = 0; i < chain.length; i += 2) chunks.push(chain.slice(i, i + 2));
  const ringsTopBelow = (z: number) => {
    let best: number | undefined;
    for (const [i, [, z1]] of B.entries()) if (z1 <= z) best = i;
    return best === undefined ? [] : ids(new RegExp(`^b${String(best + 1).padStart(2, '0')}-ring-`));
  };
  const tallest = (ts: string[]) => Math.max(...ts.flatMap((id) => task(id).elementIds.map(top)));
  const standingTop = (ch: string[]) => {
    const before = highTasks.slice(0, highTasks.indexOf(ch[0]!));
    return before.length ? tallest(before.filter((id) => id.startsWith('steel-'))) : tallest(lowTasks);
  };
  towerCraneBases.forEach((base, k) => {
    const stagger = 3 * k;
    const climbs: CraneClimb[] = chunks.map((ch) => {
      const extra = ch.flatMap((id) => (id === under(335) ? ['deck1-steel'] : id === under(440) ? ['deck2-steel'] : []));
      const jib = tallest([...ch, ...extra]) + jibAbove + stagger;
      const baseZ = jib - towerHeight;
      return { taskId: ch[0]!, baseZ: Math.round(baseZ * M), height: towerHeight * M, supportIds: ringsTopBelow(Math.min(baseZ, standingTop(ch))) };
    });
    cranes.push({ id: `tc-${k + 1}`, name: `タワークレーン ${k + 1}`, kind: 'tower', base, baseZ: climbs[0]!.baseZ, height: towerHeight * M, jibLength: 55 * M, minRadius: 4 * M, loadChart: towerChart, massKg: 150_000, fromTaskId: highTasks[0]!, untilTaskId: 'cranes-down', climbs });
  });
  site.cranes = cranes;
  site.routes = routes;
  // Lifts.
  const centre = (id: string): Plan => {
    const b = bodies.get(id)!.bounds;
    return [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2];
  };
  const angleOf = (p: Plan) => ((Math.atan2(p[1], p[0]) * 180) / Math.PI + 360) % 360;
  const faceOf = (id: string) => {
    const a = angleOf(centre(id));
    let best = 0;
    let d = 1e9;
    faces.forEach((f, k) => {
      const dd = Math.abs(((a - f + 540) % 360) - 180);
      if (dd < d - 1e-6) [best, d] = [k, dd];
    });
    return best;
  };
  const lifts: Lift[] = [];
  let n = 0;
  for (const id of lowTasks)
    for (const elementId of task(id).elementIds) {
      const f = faceOf(elementId);
      const stop = polar(pickR, faces[f]!);
      lifts.push({ id: `lift-${elementId}`, craneId: `cc-${f + 1}`, taskId: id, elementId, pick: [stop[0], stop[1], 1200], routeId: `truck-cc-${f + 1}` });
    }
  for (const id of highTasks)
    for (const elementId of task(id).elementIds) {
      // The tower crane nearest the piece, no closer than 6 m (the trolley's inner limit).
      const p = centre(elementId);
      let k = 0;
      let best = Infinity;
      towerCraneBases.forEach((b, j) => {
        const r = Math.hypot(p[0] - b[0], p[1] - b[1]);
        if (r >= 6 * M && r < best) [k, best] = [j, r];
      });
      lifts.push({ id: `lift-${elementId}`, craneId: `tc-${k + 1}`, taskId: id, elementId, pick: [0, 0, 1200], routeId: 'truck-shaft' });
      n++;
    }
  site.lifts = lifts;
  // The first lifts of each day come from the stock left overnight: no truck can be there before
  // the day starts.
  const schedule = scheduleConstruction(doc);
  const times = liftTimes(doc, schedule);
  const routeOf = new Map(routes.map((r) => [r.id, r]));
  for (const day of new Set([...times.values()].map((t) => t.day))) {
    const clock = liftClock(doc, schedule, day, times);
    for (const l of lifts) {
      const at = clock.get(l.id);
      const r = l.routeId ? routeOf.get(l.routeId) : undefined;
      if (at !== undefined && r?.delivers && at - r.delivers.leadMinutes < 8 * 60) delete l.routeId;
    }
  }
  return doc;
}

function dedupe(p: Plan[]): Plan[] {
  return p.filter((q, i) => i === 0 || q[0] !== p[i - 1]![0] || q[1] !== p[i - 1]![1]);
}
