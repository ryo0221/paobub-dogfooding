/**
 * The sky tower with the K1 fixes (TW0+TW1): no unused belt levels (TW0d), deck rooms round the
 * core and the lift shafts (TW1), tower axes with their bubble at the outer end only (TW0e),
 * and a Deck 340 plan and a tower section at 1:500 (TW0c).
 */
import type { BimDocument, BimLoop, Vec2 } from '@editor-platform/bim-core';
import { circle, sky } from './sky';

const rect = (x0: number, y0: number, x1: number, y1: number): BimLoop => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
export function sky2(): BimDocument {
  const doc = sky();
  doc.levels = doc.levels.filter((l) => !['l-100', 'l-200', 'l-300'].includes(l.id));
  for (const e of doc.elements)
    if (e.kind === 'space' && /^d[12]-sp-/.test(e.id))
      e.holes = [circle(5200), rect(6050, -2250, 10550, 2250), rect(-10550, -2250, -6050, 2250)];
  for (const g of doc.grids) if (/^g-t/.test(g.id)) g.bubbles = 'end';
  doc.views = [
    { id: 'v-d340', kind: 'plan', name: 'Deck 340 plan', level: 'l-d340', cutHeightMm: 1200, depthMm: 1200, scale: 200 },
    { id: 'v-gl', kind: 'plan', name: 'GL plan', level: 'l-gl', cutHeightMm: 1200, depthMm: 1200, scale: 500 },
    {
      id: 'v-tower', kind: 'section', name: 'Tower section', scale: 500,
      line: [[-60000, 0], [130000, 0]] as [Vec2, Vec2], direction: 'left', depthMm: 60000,
    },
  ];
  return doc;
}
