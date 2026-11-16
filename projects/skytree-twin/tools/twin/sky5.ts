/** LR4: the pipe tower with the Tembo deck's glass leaning out and the Galleria as a spiral ramp. */
import type { BimDocument, BimElement } from '@editor-platform/bim-core';
import { circle, deck2R } from './sky';
import { sky4 } from './sky4';
export const deckLean = 0.1; // ≈ 5.7° outward
export const galleriaInner = 13_500;
export function sky5(): BimDocument {
  const doc = sky4();
  // The spiral replaces the K3 quarter-turn sloped slab.
  doc.elements = doc.elements.filter((e) => e.id !== 'ramp-g');
  doc.project.name = 'Sky tower (leaning glass, spiral Galleria)';
  for (const e of doc.elements) {
    // Tembo deck's curtain walls lean outward (each quarter arc runs counter-clockwise).
    if (e.kind === 'wall' && /^d1-cw-/.test(e.id)) e.lean = deckLean;
    // The Galleria's floors keep their middle; the ramp runs round its rim.
    if (e.kind === 'slab' && /^d2-slab-/.test(e.id)) e.boundary = circle(galleriaInner);
  }
  const ramp: BimElement = {
    id: 'd2-galleria',
    name: 'Tembo Galleria',
    kind: 'ramp',
    typeId: 't-deck-slab',
    center: { xy: [0, 0] },
    innerRadiusMm: galleriaInner,
    outerRadiusMm: deck2R - 600,
    startAngleRad: -Math.PI / 2,
    sweepRad: 2 * Math.PI - 0.2,
    base: { level: 'l-g445', offsetMm: 0 },
    top: { level: 'l-g450', offsetMm: 0 },
  };
  doc.elements.push(ramp);
  return doc;
}
