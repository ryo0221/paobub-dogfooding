/**
 * FT7: the numbers the PaoBub Project quotes (validation, scenarios, control, timing), written to
 * $OUT/results.json. Demo source: not part of the repository.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { expect, it } from 'vitest';
import { checkFactoryBuilding, runFactory, validateFactory, type FactoryDocument } from '@editor-platform/factory-core';
import { plantBuilding, plantFactory, type PlantOptions } from './plant';

const out = (process.env.OUT ?? '/mnt/project-files/factory-twin/ft7') + '/results.json';
const sum = (r: ReturnType<typeof runFactory>, ms: number) => {
  const pct = (o: string) => {
    const x = r.objects.find((y) => y.id === o)!;
    const t = Object.values(x.states).reduce((a, b) => a + b, 0);
    return Object.fromEntries(Object.entries(x.states).filter(([, v]) => v > 0).map(([k, v]) => [k, +(v / t * 100).toFixed(1)]));
  };
  return {
    ms: Math.round(ms),
    events: r.events,
    produced: r.produced,
    perHour: +r.throughputPerHour.toFixed(2),
    leadMeanMin: +(r.leadTime.meanMs / 60000).toFixed(1),
    leadP95Min: +(r.leadTime.p95Ms / 60000).toFixed(1),
    wipMean: +r.wip.mean.toFixed(1),
    bottlenecks: r.bottlenecks.slice(0, 3).map((b) => ({ id: b.id, share: +(b.share * 100).toFixed(1) })),
    states: Object.fromEntries(['machining', 'wash', 'assembly-1', 'assembly-2', 'test', 'pack'].map((o) => [o, pct(o)])),
    fleet: r.fleets[0] && { trips: r.fleets[0].trips, shares: Object.fromEntries(Object.entries(r.fleets[0].shares).map(([k, v]) => [k, +(v * 100).toFixed(1)])), callWaitS: +(r.fleets[0].meanCallWaitMs / 1000).toFixed(0) },
    workers: r.workers.map((w) => ({ id: w.poolId, count: w.count, busy: +(w.busyShare * 100).toFixed(1), walk: +(w.walkShare * 100).toFixed(1), waitS: +(w.meanWaitMs / 1000).toFixed(1) })),
    deadlock: !!r.deadlock,
    control: r.control && { scans: r.control.scans, lastMoveMs: r.control.lastMoveMs, stalls: r.control.stalls },
  };
};
const run = (o: PlantOptions, edit?: (d: FactoryDocument) => void) => {
  const doc = plantFactory(o);
  edit?.(doc);
  expect(validateFactory(doc)).toEqual([]);
  const t = performance.now();
  const r = runFactory(doc);
  return sum(r, performance.now() - t);
};

it('FT7 facts', { timeout: 1_800_000 }, () => {
  const hall = checkFactoryBuilding(plantFactory(), plantBuilding());
  const planned = run({});
  const again = run({});
  const adopted = run({ agvs: 6, assemblers: 4 });
  const facts = {
    hallIssues: hall,
    planned,
    repeatSame: JSON.stringify({ ...planned, ms: 0 }) === JSON.stringify({ ...again, ms: 0 }),
    adopted,
    agv4: run({ agvs: 4 }),
    agv6a3: run({ agvs: 6 }),
    agv20: run({ agvs: 20, assemblers: 4 }),
    assemblers1: run({ agvs: 6, assemblers: 1 }),
    machines2: run({ agvs: 6, assemblers: 4, machines: 2 }),
    buffer2: run({ agvs: 6, assemblers: 4, bufferAfterWash: 2 }),
    noFailures: run({ agvs: 6, assemblers: 4 }, (d) => d.objects.forEach((o) => delete (o as { failures?: unknown }).failures)),
    adopted30: run({ agvs: 6, assemblers: 4 }, (d) => (d.run = { ...d.run, durationMs: 30 * 86_400_000 })),
    adopted90: run({ agvs: 6, assemblers: 4 }, (d) => (d.run = { ...d.run, durationMs: 90 * 86_400_000 })),
    control: Object.fromEntries((['none', 'ok', 'bug'] as const).map((p) => [p, run({ agvs: 6, assemblers: 4, plc: p === 'none' ? undefined : p }, (d) => (d.run = { warmupMs: 0, durationMs: 2 * 86_400_000, seed: 1 }))])),
    node: process.version,
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(facts, null, 1));
  console.log(JSON.stringify(facts).slice(0, 3000));
});
