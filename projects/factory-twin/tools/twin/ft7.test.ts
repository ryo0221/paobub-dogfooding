import { describe, expect, it } from 'vitest';
import { checkFactoryBuilding, runFactory, validateFactory } from '@editor-platform/factory-core';
import { plantBuilding, plantFactory, type PlantOptions } from './plant';

const brief = (o: PlantOptions) => {
  const doc = plantFactory(o);
  expect(validateFactory(doc)).toEqual([]);
  const r = runFactory(doc);
  const a2 = r.objects.find((x) => x.id === 'assembly-2')!;
  const total = Object.values(a2.states).reduce((a, b) => a + b, 0);
  return `${JSON.stringify(o)} -> ${r.throughputPerHour.toFixed(1)}/h lead ${(r.leadTime.meanMs / 60000).toFixed(0)} min, top ${r.bottlenecks
    .slice(0, 3)
    .map((b) => `${b.id} ${(b.share * 100).toFixed(0)}%`)
    .join(', ')}; A2 waiting ${((a2.states.waiting / total) * 100).toFixed(0)}% unstaffed ${((a2.states.unstaffed / total) * 100).toFixed(0)}%; agv blocked ${((r.fleets[0]!.shares.blocked) * 100).toFixed(0)}% wait ${(r.fleets[0]!.meanCallWaitMs / 1000).toFixed(0)} s${r.deadlock ? ' DEADLOCK' : ''}`;
};

describe('FT7 plant', () => {
  it('fits its hall', () => {
    expect(checkFactoryBuilding(plantFactory(), plantBuilding())).toEqual([]);
  });
  it('control', () => {
    for (const plc of [undefined, 'ok', 'bug'] as const) {
      const doc = plantFactory({ agvs: 6, assemblers: 4, plc });
      doc.run = { warmupMs: 0, durationMs: 2 * 86_400_000, seed: 1 };
      expect(validateFactory(doc)).toEqual([]);
      const r = runFactory(doc);
      console.log('PLC ->', plc, r.produced, r.throughputPerHour.toFixed(1), JSON.stringify(r.control && { scans: r.control.scans, last: r.control.lastMoveMs, stalls: r.control.stalls }));
    }
  });
});
