/**
 * K3 / TW6: the sky tower rebuilt in BIM only. The lattice's 10 segments as native members
 * (12 leaning leg columns, 12 rings and 24 braces each, TW2), the antenna mast tapered to half
 * (TW5a), and a ramp in the Galleria rising from 445 to 450 m over a quarter of the ring (TW5b).
 */
import type { BimDocument, BimElement, BimLoop } from '@editor-platform/bim-core';
import { legAt, LEGS, segments } from './lattice';
import { sky2 } from './sky2';

const q = Math.tan(Math.PI / 8);
export function sky3(): BimDocument {
  const doc = sky2();
  doc.project.name = 'Sky tower (BIM members)';
  doc.types.push(
    { id: 't-leg', kind: 'column', name: 'Leg tube 2300', profile: { shape: 'circle', diameterMm: 2300 }, materialId: 'm-steel' },
    { id: 't-leg-hi', kind: 'column', name: 'Leg tube 1600', profile: { shape: 'circle', diameterMm: 1600 }, materialId: 'm-steel' },
    { id: 't-ring-tube', kind: 'member', name: 'Ring tube 1200', profile: { shape: 'circle', diameterMm: 1200 }, materialId: 'm-steel' },
    { id: 't-ring-tube-hi', kind: 'member', name: 'Ring tube 900', profile: { shape: 'circle', diameterMm: 900 }, materialId: 'm-steel' },
    { id: 't-brace', kind: 'member', name: 'Brace tube 900', profile: { shape: 'circle', diameterMm: 900 }, materialId: 'm-steel' },
    { id: 't-brace-hi', kind: 'member', name: 'Brace tube 600', profile: { shape: 'circle', diameterMm: 600 }, materialId: 'm-steel' },
    { id: 't-ramp', kind: 'slab', name: 'Ramp slab 250', layers: [{ materialId: 'm-concrete', thicknessMm: 250 }] },
  );
  const at = (k: number, z: number) => {
    const [x, y] = legAt(((k % LEGS) + LEGS) % LEGS, z);
    return { xy: [Math.round(x), Math.round(y)] as [number, number] };
  };
  const h = (z: number) => ({ level: 'l-gl', offsetMm: z * 1000 });
  const E: BimElement[] = [];
  for (const [i, [z0, z1]] of segments.entries()) {
    const S = `s${i + 1}`;
    const hi = z0 >= 355;
    for (let k = 0; k < LEGS; k++)
      E.push({ id: `${S}-leg-${k + 1}`, kind: 'column', typeId: hi ? 't-leg-hi' : 't-leg', at: at(k, z0), topAt: at(k, z1), rotationRad: 0, base: h(z0), top: h(z1) });
    for (let k = 0; k < LEGS; k++)
      E.push({ id: `${S}-ring-${k + 1}`, kind: 'member', typeId: hi ? 't-ring-tube-hi' : 't-ring-tube', start: { at: at(k, z1), height: h(z1) }, end: { at: at(k + 1, z1), height: h(z1) }, rotationRad: 0 });
    for (let k = 0; k < LEGS; k++) {
      const t = hi ? 't-brace-hi' : 't-brace';
      E.push({ id: `${S}-brace-${k + 1}a`, kind: 'member', typeId: t, start: { at: at(k, z0), height: h(z0) }, end: { at: at(k + 1, z1), height: h(z1) }, rotationRad: 0 });
      E.push({ id: `${S}-brace-${k + 1}b`, kind: 'member', typeId: t, start: { at: at(k + 1, z0), height: h(z0) }, end: { at: at(k, z1), height: h(z1) }, rotationRad: 0 });
    }
  }
  // The Galleria ramp: a quarter ring 13–16.5 m from the axis, rising square to its radial
  // edge on +x up to Galleria 450 at the far side (the +y end).
  const R0 = 13_000, R1 = 16_500;
  const ramp: BimLoop = [[R0, 0], [R1, 0, q], [0, R1], [0, R0, -q]];
  E.push({ id: 'ramp-g', name: 'Galleria ramp', kind: 'slab', typeId: 't-ramp', top: { level: 'l-g445', offsetMm: 0 }, boundary: ramp, holes: [], slope: { edge: 0, endTop: { level: 'l-g450', offsetMm: 0 } } });
  const mast = doc.elements.find((e) => e.id === 'mast');
  if (mast?.kind === 'column') mast.topScale = 0.5;
  doc.elements.push(...E);
  return doc;
}
