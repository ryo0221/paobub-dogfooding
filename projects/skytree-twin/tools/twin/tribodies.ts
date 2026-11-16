/** Bodies with triangles, close to the kernel's: pipes as 12-sided prisms, the rest as boxes. */
import { deriveBim, type BimDocument } from '@editor-platform/bim-core';
import type { Box, LiftBody } from '@editor-platform/construction-core';
import { boxBodies } from './boxes';
type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V): V => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function prism(a: V, b: V, ra: number, rb: number, n = 12): LiftBody {
  const d = norm(sub(b, a));
  const u = norm(Math.abs(d[2]) < 0.9 ? cross(d, [0, 0, 1]) : cross(d, [1, 0, 0]));
  const v = cross(d, u);
  const ring = (c: V, r: number) => Array.from({ length: n }, (_, k) => {
    const t = (2 * Math.PI * k) / n;
    return [0, 1, 2].map((i) => c[i]! + r * (Math.cos(t) * u[i]! + Math.sin(t) * v[i]!)) as V;
  });
  const A = ring(a, ra), Bq = ring(b, rb);
  const tri: number[] = [];
  const push = (...p: V[]) => p.forEach((q) => tri.push(...q));
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    push(A[k]!, A[k1]!, Bq[k1]!); push(A[k]!, Bq[k1]!, Bq[k]!);
    push(a, A[k1]!, A[k]!); push(b, Bq[k]!, Bq[k1]!);
  }
  const lo: V = [Infinity, Infinity, Infinity], hi: V = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tri.length; i += 3) for (let j = 0; j < 3; j++) { lo[j] = Math.min(lo[j]!, tri[i + j]!); hi[j] = Math.max(hi[j]!, tri[i + j]!); }
  return { bounds: [lo, hi] as Box, triangles: new Float64Array(tri) } as LiftBody;
}
function boxTris(b: Box): LiftBody {
  const [l, h] = b;
  const c = (i: number): V => [i & 1 ? h[0] : l[0], i & 2 ? h[1] : l[1], i & 4 ? h[2] : l[2]];
  const f = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
  const tri: number[] = [];
  for (const [a, b2, cc, d] of f) tri.push(...c(a!), ...c(b2!), ...c(cc!), ...c(a!), ...c(cc!), ...c(d!));
  return { bounds: b, triangles: new Float64Array(tri) } as LiftBody;
}
export function triBodies(bim: BimDocument): Map<string, LiftBody> {
  const d = deriveBim(bim);
  const boxes = boxBodies(bim);
  const out = new Map<string, LiftBody>();
  for (const [id, s] of d.shapes) {
    const p = (s as { profile?: { diameterMm?: number } }).profile;
    if (s.kind === 'column' && p?.diameterMm) {
      const top = s.topAt ?? s.at;
      const r = p.diameterMm / 2;
      out.set(id, prism([s.at[0], s.at[1], s.zBase], [top[0], top[1], s.zTop], r, r * ((s as { topScale?: number }).topScale ?? 1)));
    } else if (s.kind === 'member' && p?.diameterMm) out.set(id, prism(s.start as V, s.end as V, p.diameterMm / 2, p.diameterMm / 2));
    else { const b = boxes.get(id); if (b) out.set(id, boxTris(b.bounds)); }
  }
  return out;
}
