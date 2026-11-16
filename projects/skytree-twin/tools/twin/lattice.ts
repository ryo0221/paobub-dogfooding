/**
 * The steel lattice of a Skytree-like tower, as CAD documents (generic, approximate sizes).
 * Tower axis = local Z through (0, 0); z = 0 at GL. 12 legs whose plan shape blends from an
 * equilateral triangle at the foot (circumradius 40 m, side ≈ 69 m) to a circle higher up.
 * Each segment (between two belt heights) = 12 inclined legs + a ring at its top + X braces
 * on each of the 12 faces. BIM has no inclined members, so the lattice is a CAD part.
 */
import { cadBuilder, type CadBuilder, type CadDocument, type CadKernelProfile, type Quaternion } from '@editor-platform/cad-core';

type Kernel = Pick<CadKernelProfile, 'id' | 'buildHash'>;
type V3 = [number, number, number];
const M = 1000;

/** Lattice segments (m): bottom, top. Gaps 335–355 and 440–460 hold the observation decks. */
export const segments: [number, number][] = [
  [0, 50], [50, 100], [100, 150], [150, 200], [200, 250], [250, 300], [300, 335],
  [355, 400], [400, 440],
  [460, 495],
];
/** Circle radius (m) of the lattice at height z (m), before blending with the triangle. */
const circleR = (z: number) => {
  const pts: [number, number][] = [[0, 40], [335, 19], [355, 18], [440, 15], [460, 12], [495, 8]];
  for (let i = 1; i < pts.length; i++) {
    const [z0, r0] = pts[i - 1]!, [z1, r1] = pts[i]!;
    if (z <= z1) return r0 + ((r1 - r0) * (z - z0)) / (z1 - z0);
  }
  return pts.at(-1)![1];
};
const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const LEGS = 12;
/** Plan position (mm) of leg k at height z (m): triangle at the foot → circle from ~300 m. */
export function legAt(k: number, z: number): [number, number] {
  const th = Math.PI / 2 + (k * 2 * Math.PI) / LEGS; // k = 0, 4, 8 at the triangle's corners
  const R = circleR(z);
  // Polar radius of the equilateral triangle with circumradius R whose corner is at 90°.
  const rel = ((th - Math.PI / 2) % ((2 * Math.PI) / 3) + (2 * Math.PI) / 3) % ((2 * Math.PI) / 3);
  const rTri = (R * Math.cos(Math.PI / 3)) / Math.cos(rel - Math.PI / 3);
  const s = smooth(z / 300);
  const r = (1 - s) * rTri + s * R;
  return [r * Math.cos(th) * M, r * Math.sin(th) * M];
}

/** Rotation taking +Z onto the unit vector d. */
function zTo(d: V3): Quaternion {
  const [x, y, z] = d;
  const c = Math.max(-1, Math.min(1, z));
  const ax: V3 = [-y, x, 0];
  const n = Math.hypot(ax[0], ax[1]);
  if (n < 1e-12) return c > 0 ? [0, 0, 0, 1] : [1, 0, 0, 0];
  const a = Math.acos(c), s = Math.sin(a / 2) / n;
  return [ax[0] * s, ax[1] * s, 0, Math.cos(a / 2)];
}
const round = (v: number) => Math.round(v * 10) / 10;
function tube(b: CadBuilder, name: string, p: V3, q: V3, dia: number, color: string) {
  const d: V3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
  const len = Math.hypot(...d);
  return b.cylinder(name, {
    radius: dia / 2,
    height: round(len),
    origin: [round(p[0]), round(p[1]), round(p[2])],
    orientation: zTo([d[0] / len, d[1] / len, d[2] / len]),
  }, { color });
}

export interface LatticeOptions {
  /** Segment indexes to build (default all). */
  only?: number[];
  /** Join each segment's members into one body (else one body per member). */
  union?: boolean;
  braces?: boolean;
}
export const latticeWhite = '#e8edf2';
export function lattice(kernel: Kernel, o: LatticeOptions = {}): CadDocument {
  const b = cadBuilder(kernel);
  const at = (k: number, z: number): V3 => [...legAt(((k % LEGS) + LEGS) % LEGS, z), z * M];
  for (const [i, [z0, z1]] of segments.entries()) {
    if (o.only && !o.only.includes(i)) continue;
    const high = z0 >= 355;
    const leg = high ? 1600 : 2300, ring = high ? 900 : 1200, brace = high ? 600 : 900;
    const ids: string[] = [];
    const S = `S${i + 1}`;
    for (let k = 0; k < LEGS; k++) ids.push(tube(b, `${S} leg ${k + 1}`, at(k, z0), at(k, z1), leg, latticeWhite));
    for (let k = 0; k < LEGS; k++) ids.push(tube(b, `${S} ring ${k + 1}`, at(k, z1), at(k + 1, z1), ring, latticeWhite));
    if (o.braces !== false)
      for (let k = 0; k < LEGS; k++) {
        ids.push(tube(b, `${S} brace ${k + 1}a`, at(k, z0), at(k + 1, z1), brace, latticeWhite));
        ids.push(tube(b, `${S} brace ${k + 1}b`, at(k + 1, z0), at(k, z1), brace, latticeWhite));
      }
    if (o.union) b.boolean(ids[0]!, ids.slice(1), 'union', `Lattice ${S} ${z0}–${z1} m`);
  }
  return b.build().document;
}
