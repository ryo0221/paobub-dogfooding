/** TT4: crane check time on the D1 tower plan, every standing body vs the grid index (node). */
import { writeFileSync, mkdirSync } from 'node:fs';
import { it, expect } from 'vitest';
import { bimElementMass, deriveBim } from '@editor-platform/bim-core';
import { checkCranes, scheduleConstruction, siteTerrain, type CraneWorld } from '@editor-platform/construction-core';
import { twinBim } from './twin-bim';
import { twinConstruction } from './twin-construction';
import { boxBodies } from './boxes';

const out = process.env.OUT ?? '/mnt/project-files/skytree-twin/tt4';
it('TT4 crane check speed', { timeout: 3_600_000 }, () => {
  mkdirSync(out, { recursive: true });
  const bim = twinBim();
  const derived = deriveBim(bim);
  const doc = twinConstruction(bim);
  const plan = scheduleConstruction(doc);
  const terrain = siteTerrain(doc.site);
  const world: CraneWorld = {
    bodies: boxBodies(bim),
    mass: (id) => { const m = bimElementMass(bim, derived, id); return m.status === 'ok' ? { kg: m.kg } : { reason: m.status }; },
    ground: (p) => terrain.heightAt(p),
  };
  const time = (index: boolean) => { const t = performance.now(); const r = checkCranes(doc, plan, world, { index }); return [performance.now() - t, r] as const; };
  const [fast, a] = time(true);
  const [slow, b] = time(false);
  const [fast2] = time(true);
  const lines = [
    `node ${process.version}, ${process.arch}, lifts ${doc.site!.lifts!.length}, bodies ${world.bodies.size}, box bodies (no triangles)`,
    `every standing body: ${Math.round(slow)} ms, ${b.length} problems`,
    `grid index: ${Math.round(fast)} ms (again ${Math.round(fast2)} ms), ${a.length} problems`,
    `same result: ${JSON.stringify(a) === JSON.stringify(b)}`,
  ];
  writeFileSync(`${out}/tt4-node.txt`, lines.join('\n') + '\n');
  process.stderr.write(lines.join('\n') + '\n');
  expect(a).toEqual(b);
});
