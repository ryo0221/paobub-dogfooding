/**
 * Skytree twin (2026-11-16 dogfooding): the LS8 sky tower (sky8) cut into the pieces a builder
 * erects. Sizes are approximate, from public sources; not the real building's drawings.
 *
 * - Lattice: node bands of about 10 m (0–335 m: 32 bands, 355–440 m: 8, 460–495 m: 4), each
 *   band = 12 leg pieces + 12 ring pieces at its top + 24 braces. Leg pipe walls assumed.
 * - Core column (shinbashira) Ø8 m, 0–375 m, in 15 lifts of 25 m (slip form).
 * - Gain tower (antenna mast) 495–634 m in 7 sections, assembled low in the shaft and lifted up.
 * - The decks' 20 m columns in three pieces (a tower crane lifts 32 t at most).
 * - Densities on the materials (for crane loads).
 */
import type { BimDocument, BimElement, BimType } from '@editor-platform/bim-core';
import { legAt, LEGS } from './lattice';
import { sky8 } from './sky8';

const M = 1000;
/** Node heights (m) of the lattice bands: [bottom, top] per band. */
export function bands(): [number, number][] {
  const out: [number, number][] = [];
  const split = (z0: number, z1: number, n: number) => {
    for (let i = 0; i < n; i++)
      out.push([+(z0 + ((z1 - z0) * i) / n).toFixed(3), +(z0 + ((z1 - z0) * (i + 1)) / n).toFixed(3)]);
  };
  split(0, 335, 32);
  split(355, 440, 8);
  split(460, 495, 4);
  return out;
}
/** Leg/ring/brace pipe sizes (diameter, wall) by band bottom height (m). */
const pipes = (z: number) =>
  z < 150
    ? { leg: [2300, 70], ring: [1200, 32], brace: [900, 25] }
    : z < 335
      ? { leg: [1900, 50], ring: [1100, 28], brace: [800, 22] }
      : { leg: [1600, 40], ring: [900, 25], brace: [600, 19] };
export const coreLifts = 15;
export const mastSections = 7;
export const mastBase = 495;
export const mastTop = 634;

export function twinBim(): BimDocument {
  const doc = sky8();
  doc.project.name = 'Skytree twin';
  const dens: Record<string, number> = { 'm-concrete': 2400, 'm-steel': 7850, 'm-glass': 2500, 'm-finish': 1800, 'm-alu': 2700 };
  for (const m of doc.materials) if (dens[m.id]) m.densityKgM3 = dens[m.id];
  for (const m of doc.materials) if (m.id === 'm-concrete') { m.youngsModulusMPa = 33000; m.poissonsRatio = 0.2; }
  for (const m of doc.materials) if (m.id === 'm-steel') { m.youngsModulusMPa = 205000; m.poissonsRatio = 0.3; }
  doc.elements = doc.elements.filter((e) => !/^s\d+-/.test(e.id) && e.id !== 'core' && e.id !== 'mast');
  doc.types = doc.types.filter((t) => !/^t-(leg|ring-tube|brace)/.test(t.id));
  const types = new Map<string, BimType>();
  const pipeType = (kind: 'column' | 'member', name: string, [d, w]: number[]) => {
    const id = `t-${name}-${d}x${w}`;
    if (!types.has(id))
      types.set(id, { id, kind, name: `${name[0]!.toUpperCase()}${name.slice(1)} pipe ${d}x${w}`, profile: { shape: 'pipe', diameterMm: d!, wallMm: w! }, materialId: 'm-steel' });
    return id;
  };
  const at = (k: number, z: number) => {
    const [x, y] = legAt(((k % LEGS) + LEGS) % LEGS, z);
    return { xy: [Math.round(x), Math.round(y)] as [number, number] };
  };
  const h = (z: number) => ({ level: 'l-gl', offsetMm: Math.round(z * M) });
  const E: BimElement[] = [];
  for (const [i, [z0, z1]] of bands().entries()) {
    const B = `b${String(i + 1).padStart(2, '0')}`;
    const p = pipes(z0);
    const leg = pipeType('column', 'leg', p.leg), ring = pipeType('member', 'ring', p.ring), brace = pipeType('member', 'brace', p.brace);
    for (let k = 0; k < LEGS; k++)
      E.push({ id: `${B}-leg-${k + 1}`, kind: 'column', typeId: leg, at: at(k, z0), topAt: at(k, z1), rotationRad: 0, base: h(z0), top: h(z1) });
    for (let k = 0; k < LEGS; k++)
      E.push({ id: `${B}-ring-${k + 1}`, kind: 'member', typeId: ring, start: { at: at(k, z1), height: h(z1) }, end: { at: at(k + 1, z1), height: h(z1) }, rotationRad: 0 });
    for (let k = 0; k < LEGS; k++) {
      E.push({ id: `${B}-brace-${k + 1}a`, kind: 'member', typeId: brace, start: { at: at(k, z0), height: h(z0) }, end: { at: at(k + 1, z1), height: h(z1) }, rotationRad: 0 });
      E.push({ id: `${B}-brace-${k + 1}b`, kind: 'member', typeId: brace, start: { at: at(k + 1, z0), height: h(z0) }, end: { at: at(k, z1), height: h(z1) }, rotationRad: 0 });
    }
  }
  // Core column: 15 pours of 25 m.
  const core = doc.types.find((t) => t.id === 't-core')!;
  void core;
  for (let i = 0; i < coreLifts; i++)
    E.push({ id: `core-${String(i + 1).padStart(2, '0')}`, name: `Core column ${i * 25}–${(i + 1) * 25} m`, kind: 'column', typeId: 't-core', at: { xy: [0, 0] }, rotationRad: 0, base: h(i * 25), top: h((i + 1) * 25) });
  // Gain tower: 7 sections tapering Ø6 m → Ø3 m (each its own pipe type, scaled at its top).
  const dia = (s: number) => 6000 - (3000 * s) / mastSections;
  for (let s = 0; s < mastSections; s++) {
    const z0 = mastBase + ((mastTop - mastBase) * s) / mastSections;
    const z1 = mastBase + ((mastTop - mastBase) * (s + 1)) / mastSections;
    const d = Math.round(dia(s));
    const id = `t-mast-${s + 1}`;
    types.set(id, { id, kind: 'column', name: `Gain tower pipe ${d}x60`, profile: { shape: 'pipe', diameterMm: d, wallMm: 60 }, materialId: 'm-steel' });
    E.push({ id: `mast-${s + 1}`, name: `Gain tower section ${s + 1}`, kind: 'column', typeId: id, at: { xy: [0, 0] }, rotationRad: 0, base: h(z0), top: h(z1), topScale: dia(s + 1) / dia(s) });
  }
  // The decks' columns (20 m box columns, 43 t) are set in three pieces: up to the deck's ring
  // (4.7 m), then two of about 7.7 m (a tower crane lifts 32 t at most).
  const cols = doc.elements.filter((e) => /^dc-d[12]-\d+$/.test(e.id));
  for (const c of cols) {
    if (c.kind !== 'column') continue;
    doc.elements.splice(doc.elements.indexOf(c), 1);
    const at = (mm: number) => ({ level: c.base.level, offsetMm: (c.base.offsetMm ?? 0) + mm });
    E.push(
      { ...c, id: `${c.id}-lo`, top: at(4_700) },
      { ...c, id: `${c.id}-mid`, base: at(4_700), top: at(12_350) },
      { ...c, id: `${c.id}-hi`, base: at(12_350) },
    );
  }
  doc.types.push(...types.values());
  doc.elements.push(...E);
  return doc;
}
