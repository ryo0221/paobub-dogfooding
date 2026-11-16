import { deriveBim, type BimDocument } from '@editor-platform/bim-core';
import type { Box, LiftBody } from '@editor-platform/construction-core';
export function boxBodies(bim: BimDocument): Map<string, LiftBody> {
  const d = deriveBim(bim);
  const o = new Map<string, LiftBody>();
  const r = (p: { shape: string; diameterMm?: number; widthMm?: number; depthMm?: number }) => (p.diameterMm ?? Math.max(p.widthMm ?? 0, p.depthMm ?? 0)) / 2;
  const seg = (a: number[], b: number[], rad: number): Box => [
    [Math.min(a[0]!, b[0]!) - rad, Math.min(a[1]!, b[1]!) - rad, Math.min(a[2]!, b[2]!) - rad],
    [Math.max(a[0]!, b[0]!) + rad, Math.max(a[1]!, b[1]!) + rad, Math.max(a[2]!, b[2]!) + rad],
  ];
  for (const [id, s] of d.shapes) {
    if (s.kind === 'column') {
      const top = s.topAt ?? s.at;
      const b = seg([s.at[0], s.at[1], s.zBase], [top[0], top[1], s.zTop], r(s.profile as never));
      b[0][2] = s.zBase; b[1][2] = s.zTop;
      o.set(id, { bounds: b });
    } else if (s.kind === 'member') o.set(id, { bounds: seg(s.start, s.end, r(s.profile as never)) });
    else if (s.kind === 'beam') o.set(id, { bounds: seg([...s.start, s.zTop - 500], [...s.end, s.zTop], r(s.profile as never)) });
    else if (s.kind === 'slab') {
      const xs = s.boundary.map((p) => p[0]), ys = s.boundary.map((p) => p[1]);
      o.set(id, { bounds: [[Math.min(...xs), Math.min(...ys), s.zBottom], [Math.max(...xs), Math.max(...ys), s.zTop]] });
    }
  }
  return o;
}
