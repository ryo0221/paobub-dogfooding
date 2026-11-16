/** LS8: LS3's tower (sky7) with the Galleria ramp's outer railing and an inspection hatch near
 * its inner edge (LS4, LS5), and an emergency stair in two side-by-side flights east of the east lift shaft of
 * the Tembo deck, Deck 340 → 345 → 350 (LS6), each under a hole in the floor above. */
import type { BimDocument, BimElement, BimLoop } from '@editor-platform/bim-core';
import { sky7 } from './sky7';
const rect = (x0: number, y0: number, x1: number, y1: number): BimLoop => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
export const stairRun = 27 * 250;
export function sky8(): BimDocument {
  const doc = sky7();
  doc.project.name = 'Sky tower (ramp railing and hatch, emergency stairs)';
  doc.types.push(
    { id: 't-rail-steel', kind: 'wall', name: 'Steel railing 50', layers: [{ materialId: 'm-steel', thicknessMm: 50 }] },
    { id: 't-stair-180', kind: 'slab', name: 'Stair waist RC 180', layers: [{ materialId: 'm-concrete', thicknessMm: 180 }] },
  );
  const E: BimElement[] = [
    { id: 'd2-galleria-rail', name: 'Galleria railing', kind: 'railing', typeId: 't-rail-steel', hostId: 'd2-galleria', side: 'outer', heightMm: 1100 },
    // An 800 mm inspection hatch near the inner edge, to the north.
    { id: 'd2-galleria-hatch', name: 'Galleria hatch', kind: 'opening', hostId: 'd2-galleria', slab: { boundary: rect(-400, 13800, 400, 14600) } },
    { id: 'd1-stair-1', name: 'Emergency stair 340-345', kind: 'stair', typeId: 't-stair-180', start: { xy: [11600, -stairRun / 2] }, directionRad: Math.PI / 2, widthMm: 1200, risers: 28, treadMm: 250, base: { level: 'l-d340', offsetMm: 0 }, top: { level: 'l-d345', offsetMm: 0 } },
    { id: 'd1-stair-2', name: 'Emergency stair 345-350', kind: 'stair', typeId: 't-stair-180', start: { xy: [13200, stairRun / 2] }, directionRad: -Math.PI / 2, widthMm: 1200, risers: 28, treadMm: 250, base: { level: 'l-d345', offsetMm: 0 }, top: { level: 'l-d350', offsetMm: 0 } },
  ];
  doc.elements.push(...E);
  for (const e of doc.elements) {
    if (e.kind !== 'slab') continue;
    if (e.id === 'd1-slab-2') e.holes = [...(e.holes ?? []), rect(10900, -stairRun / 2 - 200, 12300, stairRun / 2 + 200)];
    if (e.id === 'd1-slab-3') e.holes = [...(e.holes ?? []), rect(12500, -stairRun / 2 - 200, 13900, stairRun / 2 + 200)];
  }
  return doc;
}
