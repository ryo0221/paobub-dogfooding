/**
 * A Skytree-like tall tower as a BIM document (generic, approximate sizes; a verification
 * model, not the real building). Tower axis at (0, 0). Native BIM elements:
 * - the RC core column (shinbashira) Ø 8 m from GL to 375 m,
 * - leg foundations at the three triangle corners,
 * - observation deck 1 (340 / 345 / 350 m, Ø 48 m) and deck 2 (445 / 450 m, Ø 36 m): circular
 *   slabs with shaft holes, arc glass curtain walls, roofs, spaces, the steel columns that carry
 *   them between the lattice segments,
 * - the antenna mast (gain tower) 495–634 m,
 * - a 4-storey base building (commercial podium) east of the tower on a 9 m grid.
 * The steel lattice itself (inclined legs and braces) is not expressible in BIM and is placed as
 * CAD parts (lattice.ts) by the demo.
 */
import { emptyBim, type BimDocument, type BimElement, type BimLoop, type BimType, type BimWallJoin, type Vec2 } from '@editor-platform/bim-core';
import { legAt, LEGS } from './lattice';

const M = 1000;
const q = Math.tan(Math.PI / 8); // bulge of a quarter circle
/** A circle of radius r (mm) as four quarter arcs, counter-clockwise. */
export const circle = (r: number, c: Vec2 = [0, 0]): BimLoop => [
  [c[0] + r, c[1], q], [c[0], c[1] + r, q], [c[0] - r, c[1], q], [c[0], c[1] - r, q],
];
const rect = (x0: number, y0: number, x1: number, y1: number): BimLoop => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

export const levels = [
  ['l-gl', 'GL', 0], ['l-2f', '2F', 6], ['l-3f', '3F', 12], ['l-4f', '4F', 18], ['l-rf', 'Podium RF', 24],
  ['l-100', 'Belt 100', 100], ['l-200', 'Belt 200', 200], ['l-300', 'Belt 300', 300], ['l-335', 'Belt 335', 335],
  ['l-d340', 'Deck 340', 340], ['l-d345', 'Deck 345', 345], ['l-d350', 'Deck 350', 350], ['l-355', 'Deck roof 355', 355],
  ['l-400', 'Belt 400', 400], ['l-440', 'Belt 440', 440],
  ['l-g445', 'Galleria 445', 445], ['l-g450', 'Galleria 450', 450], ['l-460', 'Galleria roof 460', 460],
  ['l-495', 'Lattice top 495', 495], ['l-565', 'Mast 565', 565], ['l-634', 'Top 634', 634],
] as const;

export const deck1R = 24 * M, deck2R = 18 * M;
/** Base building: x 45–117 m, y −18–18 m, 9 m bays, 4 storeys of 6 m. */
const BX = 45 * M, BAY = 9 * M, NX = 8, NY = 4, BY = -18 * M;

export function sky(o: { drawDeckWall?: boolean } = {}): BimDocument {
  const doc = emptyBim();
  doc.project = { name: 'Sky tower (Skytree-like)', trueNorthRad: 0, siteElevationMm: 2000 };
  doc.levels = levels.map(([id, name, m]) => ({ id, name, elevationMm: m * M }));
  doc.materials = [
    { id: 'm-concrete', name: 'Concrete', category: 'concrete' },
    { id: 'm-steel', name: 'Steel', category: 'metal', appearance: { color: '#e8edf2', opacity: 1, roughness: 0.45, metalness: 0.6 } },
    { id: 'm-glass', name: 'Glass', category: 'glass', appearance: { color: '#8fb8d8', opacity: 0.45, roughness: 0.05, metalness: 0 } },
    { id: 'm-finish', name: 'Panel finish', category: 'finish' },
    { id: 'm-alu', name: 'Aluminium panel', category: 'metal', appearance: { color: '#b9c2cc', opacity: 1, roughness: 0.4, metalness: 0.7 } },
  ];
  const types: BimType[] = [
    { id: 't-core', kind: 'column', name: 'RC core Ø8000', profile: { shape: 'circle', diameterMm: 8000 }, materialId: 'm-concrete' },
    { id: 't-mast', kind: 'column', name: 'Steel mast Ø6000', profile: { shape: 'circle', diameterMm: 6000 }, materialId: 'm-steel' },
    { id: 't-deck-col', kind: 'column', name: 'Steel box 1200', profile: { shape: 'box', depthMm: 1200, widthMm: 1200, wallMm: 60 }, materialId: 'm-steel' },
    { id: 't-col', kind: 'column', name: 'RC column 900', profile: { shape: 'rect', widthMm: 900, depthMm: 900 }, materialId: 'm-concrete' },
    { id: 't-beam', kind: 'beam', name: 'Steel H 800×300', profile: { shape: 'h', depthMm: 800, widthMm: 300, webMm: 16, flangeMm: 28 }, materialId: 'm-steel' },
    { id: 't-ring', kind: 'beam', name: 'Deck ring box 1000×600', profile: { shape: 'box', depthMm: 1000, widthMm: 600, wallMm: 40 }, materialId: 'm-steel' },
    { id: 't-deck-slab', kind: 'slab', name: 'Deck slab 300', layers: [{ materialId: 'm-concrete', thicknessMm: 250 }, { materialId: 'm-finish', thicknessMm: 50 }] },
    { id: 't-slab', kind: 'slab', name: 'RC slab 250', layers: [{ materialId: 'm-concrete', thicknessMm: 250 }] },
    { id: 't-found', kind: 'slab', name: 'Foundation 4000', layers: [{ materialId: 'm-concrete', thicknessMm: 4000 }] },
    { id: 't-roof', kind: 'roof', name: 'Metal roof 400', layers: [{ materialId: 'm-concrete', thicknessMm: 200 }, { materialId: 'm-alu', thicknessMm: 200 }] },
    { id: 't-curtain', kind: 'wall', name: 'Glass curtain wall 80', layers: [{ materialId: 'm-glass', thicknessMm: 80 }], common: { isExternal: true, loadBearing: false } },
    { id: 't-ext', kind: 'wall', name: 'Exterior panel wall 250', layers: [{ materialId: 'm-concrete', thicknessMm: 200 }, { materialId: 'm-alu', thicknessMm: 50 }], common: { isExternal: true, loadBearing: false } },
    { id: 't-shaft', kind: 'wall', name: 'Shaft wall RC 300', layers: [{ materialId: 'm-concrete', thicknessMm: 300 }], common: { isExternal: false, loadBearing: true, fireRating: '2h' } },
    { id: 't-window', kind: 'window', name: 'Shop window 3600×4000', widthMm: 3600, heightMm: 4000 },
    { id: 't-door', kind: 'door', name: 'Entrance 3000', widthMm: 3000, heightMm: 3000 },
  ];
  doc.types = types;
  // Grids: base building X1..X9 / Y1..Y5, and the three tower axes through the corners.
  const xs = Array.from({ length: NX + 1 }, (_, i) => BX + i * BAY);
  const ys = Array.from({ length: NY + 1 }, (_, j) => BY + j * BAY);
  doc.grids = [
    ...xs.map((x, i) => ({ id: `g-x${i + 1}`, label: `X${i + 1}`, start: [x, BY - 6000] as Vec2, end: [x, BY + NY * BAY + 6000] as Vec2 })),
    ...ys.map((y, j) => ({ id: `g-y${j + 1}`, label: `Y${j + 1}`, start: [BX - 6000, y] as Vec2, end: [xs[NX]! + 6000, y] as Vec2 })),
    ...[0, 4, 8].map((k, i) => {
      const [x, y] = legAt(k, 0);
      const f = 1.25;
      return { id: `g-t${i + 1}`, label: `T${i + 1}`, start: [0, 0] as Vec2, end: [x * f, y * f] as Vec2 };
    }),
  ];
  const E: BimElement[] = [];
  const joins: BimWallJoin[] = [];
  const lv = (id: string, offsetMm = 0) => ({ level: id, offsetMm });
  const xy = (p: [number, number]) => ({ xy: [Math.round(p[0]), Math.round(p[1])] as Vec2 });

  // ---------- Tower ----------
  E.push({ id: 'core', name: 'Core column (shinbashira)', kind: 'column', typeId: 't-core', at: { xy: [0, 0] }, rotationRad: 0, base: lv('l-gl'), top: { heightMm: 375 * M } });
  for (const [i, k] of [0, 4, 8].entries()) {
    const [x, y] = legAt(k, 0);
    const r = 9000;
    const c: Vec2 = [x, y];
    E.push({ id: `found-${i + 1}`, name: `Leg foundation T${i + 1}`, kind: 'slab', typeId: 't-found', top: lv('l-gl'), boundary: circle(r, c).map((v) => [Math.round(v[0]), Math.round(v[1]), ...(v.length > 2 ? [v[2]!] : [])] as BimLoop[number]), holes: [] });
  }
  E.push({ id: 'found-core', name: 'Core foundation', kind: 'slab', typeId: 't-found', top: lv('l-gl'), boundary: circle(12000), holes: [] });
  E.push({ id: 'mast', name: 'Antenna mast (gain tower)', kind: 'column', typeId: 't-mast', at: { xy: [0, 0] }, rotationRad: 0, base: lv('l-495'), top: lv('l-634') });

  // Steel columns carrying the decks between lattice segments, on the leg lines.
  const legCols = (from: string, to: string, z: number, tag: string) => {
    for (let k = 0; k < LEGS; k++)
      E.push({ id: `dc-${tag}-${k + 1}`, kind: 'column', typeId: 't-deck-col', at: xy(legAt(k, z)), rotationRad: (k * 2 * Math.PI) / LEGS, base: lv(from), top: lv(to) });
  };
  legCols('l-335', 'l-355', 345, 'd1');
  legCols('l-440', 'l-460', 450, 'd2');

  // Decks: slab + ring beam + curtain walls (four quarter arcs, mitred) + space, per floor.
  const shaftHoles = (): BimLoop[] => [circle(5200), rect(6500, -1800, 10100, 1800), rect(-10100, -1800, -6500, 1800)];
  const deck = (tag: string, R: number, floors: string[], roof: string, label: string) => {
    for (const [f, l] of floors.entries()) {
      E.push({ id: `${tag}-slab-${f + 1}`, name: `${label} floor ${f + 1}`, kind: 'slab', typeId: 't-deck-slab', top: lv(l), boundary: circle(R), holes: shaftHoles() });
      const next = floors[f + 1] ?? roof;
      if (!o.drawDeckWall || tag !== 'd1' || f !== 0) {
        const pts = [[R - 400, 0], [0, R - 400], [-(R - 400), 0], [0, -(R - 400)]] as Vec2[];
        for (let w = 0; w < 4; w++)
          E.push({ id: `${tag}-cw-${f + 1}-${w + 1}`, kind: 'wall', typeId: 't-curtain', start: { xy: pts[w]! }, end: { xy: pts[(w + 1) % 4]! }, bulge: q, location: 'center', base: lv(l), top: lv(next) });
        // Tangent-continuous arcs continue each other: no join applies (proposeJoins).
      }
      E.push({ id: `${tag}-sp-${f + 1}`, kind: 'space', name: `${label} ${f + 1}`, number: `${tag.toUpperCase()}-${f + 1}`, base: lv(l), boundary: circle(R - 1000) });
      // Lift shafts (two) in RC walls.
      for (const [s, x0] of [[1, 6200], [2, -10400]] as const) {
        const r = rect(x0, -2100, x0 + 4200, 2100) as Vec2[];
        for (let w = 0; w < 4; w++)
          E.push({ id: `${tag}-sh${s}-${f + 1}-${w + 1}`, kind: 'wall', typeId: 't-shaft', start: { xy: r[w]! }, end: { xy: r[(w + 1) % 4]! }, location: 'center', base: lv(l), top: lv(next) });
        for (let w = 0; w < 4; w++)
          joins.push({ id: `j-${tag}-sh${s}-${f + 1}-${w + 1}`, walls: [`${tag}-sh${s}-${f + 1}-${w + 1}`, `${tag}-sh${s}-${f + 1}-${((w + 1) % 4) + 1}`], kind: 'miter' });
      }
    }
    // Ring beam under the lowest floor, on the deck columns.
    for (let k = 0; k < LEGS; k++) {
      const z = tag === 'd1' ? 345 : 450;
      E.push({ id: `${tag}-ring-${k + 1}`, kind: 'beam', typeId: 't-ring', start: xy(legAt(k, z)), end: xy(legAt((k + 1) % LEGS, z)), top: lv(floors[0]!, -300) });
    }
    E.push({ id: `${tag}-roof`, name: `${label} roof`, kind: 'roof', typeId: 't-roof', base: lv(roof), boundary: circle(R + 500), shape: { form: 'flat' } });
  };
  deck('d1', deck1R, ['l-d340', 'l-d345', 'l-d350'], 'l-355', 'Tembo deck');
  deck('d2', deck2R, ['l-g445', 'l-g450'], 'l-460', 'Galleria');

  // ---------- Base building ----------
  const storeys = ['l-gl', 'l-2f', 'l-3f', 'l-4f', 'l-rf'];
  const gp = (i: number, j: number) => ({ grid: [`g-x${i + 1}`, `g-y${j + 1}`] as [string, string] });
  const outline = rect(BX - 500, BY - 500, xs[NX]! + 500, ys[NY]! + 500);
  for (let s = 0; s < 4; s++) {
    const n = s + 1, l = storeys[s]!, up = storeys[s + 1]!;
    for (let i = 0; i <= NX; i++)
      for (let j = 0; j <= NY; j++) {
        E.push({ id: `c-${n}-${i + 1}-${j + 1}`, kind: 'column', typeId: 't-col', at: gp(i, j), rotationRad: 0, base: lv(l), top: lv(up) });
        if (i < NX) E.push({ id: `b-${n}-x${i + 1}-${j + 1}`, kind: 'beam', typeId: 't-beam', start: gp(i, j), end: gp(i + 1, j), top: lv(up, -250) });
        if (j < NY) E.push({ id: `b-${n}-y${i + 1}-${j + 1}`, kind: 'beam', typeId: 't-beam', start: gp(i, j), end: gp(i, j + 1), top: lv(up, -250) });
      }
    E.push({ id: `bs-${n}`, kind: 'slab', typeId: 't-slab', top: lv(l), boundary: outline, holes: [] });
    const w = (id: string, a: [number, number], b: [number, number]) =>
      E.push({ id: `${id}-${n}`, kind: 'wall', typeId: 't-ext', start: gp(...a), end: gp(...b), location: 'center', base: lv(l), top: lv(up) });
    w('bw-s', [0, 0], [NX, 0]);
    w('bw-e', [NX, 0], [NX, NY]);
    w('bw-n', [NX, NY], [0, NY]);
    w('bw-w', [0, NY], [0, 0]);
    joins.push(
      { id: `j-bse-${n}`, walls: [`bw-s-${n}`, `bw-e-${n}`], kind: 'butt', through: `bw-s-${n}` },
      { id: `j-bne-${n}`, walls: [`bw-e-${n}`, `bw-n-${n}`], kind: 'butt', through: `bw-n-${n}` },
      { id: `j-bnw-${n}`, walls: [`bw-n-${n}`, `bw-w-${n}`], kind: 'butt', through: `bw-n-${n}` },
      { id: `j-bsw-${n}`, walls: [`bw-w-${n}`, `bw-s-${n}`], kind: 'butt', through: `bw-s-${n}` },
    );
    for (const side of ['s', 'n'] as const)
      for (let k = 0; k < NX; k++) {
        if (s === 0 && side === 's' && k % 3 === 1)
          E.push({ id: `bd-${side}-${n}-${k + 1}`, kind: 'door', typeId: 't-door', hostId: `bw-${side}-${n}`, alongMm: k * BAY + BAY / 2 - 1500, flipFacing: false, flipHand: false });
        else
          E.push({ id: `bwin-${side}-${n}-${k + 1}`, kind: 'window', typeId: 't-window', hostId: `bw-${side}-${n}`, alongMm: k * BAY + BAY / 2 - 1800, sillMm: 800, flipFacing: false });
      }
    E.push({ id: `bsp-${n}`, kind: 'space', name: `Shops ${n}F`, number: `B${n}01`, base: lv(l), boundary: rect(BX + 200, BY + 200, xs[NX]! - 200, ys[NY]! - 200) });
  }
  E.push({ id: 'b-roof', name: 'Podium roof', kind: 'roof', typeId: 't-roof', base: lv('l-rf'), boundary: outline, shape: { form: 'flat' } });
  doc.elements = E;
  doc.joins = joins;
  doc.views = [];
  return doc;
}
