/** LS3: FU7's tower with the Tembo deck roof sloped (3° south) cutting the top glass, and an
 * upright recessed entrance set into the first floor's leaning glass on the east. */
import type { BimDocument, BimElement, BimWall } from '@editor-platform/bim-core';
import { deck1R } from './sky';
import { sky6 } from './sky6';
export const frameHalf = 2_400; // half the entrance's opening in the glass (mm)
export function sky7(): BimDocument {
  const doc = sky6();
  doc.project.name = 'Sky tower (glass under the roof, entrance frame)';
  const R = deck1R - 400;
  for (const e of doc.elements) {
    if (e.kind === 'roof' && e.id === 'd1-roof') e.shape = { form: 'mono', slopeRad: (3 * Math.PI) / 180, directionRad: Math.PI / 2 };
    // The top floor's glass rises 2 m past the roof's eaves level and the roof cuts it.
    if (e.kind === 'wall' && /^d1-cw-3-/.test(e.id)) {
      e.top = { level: e.top && 'level' in e.top ? e.top.level : 'l-355', offsetMm: 2000 };
      e.clipBy = 'd1-roof';
    }
  }
  // The east quarter of the first floor (d1-cw-1-1 from (R, 0) to (0, R)) starts past the frame.
  const a = Math.asin(frameHalf / R);
  const east = doc.elements.find((e) => e.id === 'd1-cw-1-1') as BimWall;
  const south = doc.elements.find((e) => e.id === 'd1-cw-1-4') as BimWall;
  const p: [number, number] = [R * Math.cos(a), R * Math.sin(a)];
  const m: [number, number] = [R * Math.cos(a), -R * Math.sin(a)];
  east.start = { xy: p };
  east.bulge = Math.tan((Math.PI / 2 - a) / 4);
  south.end = { xy: m };
  south.bulge = Math.tan((Math.PI / 2 - a) / 4);
  // Windows on the shortened arcs keep their place from the frame's side less the cut.
  doc.elements = doc.elements.filter((e) => !(e.kind === 'window' && (e.hostId === 'd1-cw-1-1' || e.hostId === 'd1-cw-1-4')));
  // A recessed entrance: two upright radial walls 3 m in from the glass's ends, and an upright
  // front between them. The glass leans out past the radial walls, its ends following them.
  const inward = (q: [number, number]): [number, number] => [q[0] * (1 - 3000 / R), q[1] * (1 - 3000 / R)];
  const wall = (id: string, s: [number, number], t: [number, number], name: string): BimElement => ({ id, name, kind: 'wall', typeId: 't-shaft', start: { xy: s }, end: { xy: t }, location: 'center', base: east.base, top: east.top });
  doc.elements.push(
    wall('d1-entrance-n', p, inward(p), 'Entrance side N'),
    wall('d1-entrance', inward(m), inward(p), 'Entrance front'),
    wall('d1-entrance-s', inward(m), m, 'Entrance side S'),
  );
  doc.joins.push(
    { id: 'j-d1-ent-1', walls: ['d1-cw-1-1', 'd1-entrance-n'], kind: 'butt', through: 'd1-entrance-n' },
    { id: 'j-d1-ent-2', walls: ['d1-entrance-n', 'd1-entrance'], kind: 'butt', through: 'd1-entrance-n' },
    { id: 'j-d1-ent-3', walls: ['d1-entrance', 'd1-entrance-s'], kind: 'butt', through: 'd1-entrance-s' },
    { id: 'j-d1-ent-4', walls: ['d1-entrance-s', 'd1-cw-1-4'], kind: 'butt', through: 'd1-entrance-s' },
  );
  return doc;
}
