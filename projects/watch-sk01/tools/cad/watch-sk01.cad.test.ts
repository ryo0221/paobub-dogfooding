/**
 * paobub-dogfooding watch-sk01 v2: write the P3 layout model and the P4 detail models of SK-01 as
 * cad-core documents with the product-design features of editor-platform (PD1–PD7: design
 * targets, BOM values, tolerance stacks, standard parts, springs, motion coverage, sight checks),
 * and check them with the pinned kernel.
 * OUT=<project folder> CAD_OCCT_DIST=work/cad-kernel npx vitest run <this file>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { setImmediate } from 'node:timers';
import {
  applyCadOperation,
  assertCad,
  bomJson,
  bomReport,
  cadBuilder,
  cadContentHash,
  cadMass,
  cadToleranceStacks,
  checkCadInterference,
  checkCadInterferenceAlong,
  checkCadMotionCoverage,
  checkGearMesh,
  designTargetReport,
  emptyCad,
  expandAssembly,
  identityQuaternion,
  measureDesignTargets,
  measureSightChecks,
  oRingGroove,
  position,
  resolveSpring,
  rotateVector,
  sightCheckReport,
  sk01Case,
  sk01Gears,
  sk01Layout,
  sk01ScrewPoints,
  sk01Watch,
  solveJoints,
  springEstimate,
  standardPart,
  toleranceStackReport,
  trainHoursPerTurn,
  parameterValues,
  type CadBuilder,
  type CadDocument,
  type CadInterferenceMesh,
  type CadResolvedJointValues,
} from '@editor-platform/cad-core';
import { describe, expect, it } from 'vitest';
import { createKernelHost } from './host';
import type { CadWorkerRequest, CadWorkerResponse } from './protocol';
import { cadKernelBuild } from '../../../scripts/cad-kernel/build.mjs';

const dist = process.env.CAD_OCCT_DIST;
const out = process.env.OUT ?? 'work/watch-sk01';
type Kernel = { id: string; buildHash: string };
type V3 = [number, number, number];

/** Body id → [BD id, Japanese name, density kg/m³]. */
const brass = 8500, steel = 7900, ruby = 3980, sapphire = 3980, caseSteel = 8000, nbr = 1000;
const names: Record<string, [string, number]> = {
  'main-plate': ['地板', brass], 'jewel-third': ['三番受け石（地板）', ruby], 'jewel-fourth': ['四番受け石（地板）', ruby],
  'jewel-escape': ['がんぎ受け石（地板）', ruby], 'jewel-pallet': ['アンクル受け石（地板）', ruby], 'jewel-balance': ['てんぷ受け石（地板）', ruby],
  'jewel-barrel': ['香箱受け石（地板）', ruby],
  'train-bridge': ['輪列受け', brass], 'train-bridge-jewel-1': ['輪列受けの石 1', ruby], 'train-bridge-jewel-2': ['輪列受けの石 2', ruby],
  'train-bridge-jewel-3': ['輪列受けの石 3', ruby], 'train-bridge-jewel-4': ['輪列受けの石 4', ruby],
  'train-bridge-screw-1': ['輪列受けのねじ 1', steel], 'train-bridge-screw-1-slot': ['輪列受けのねじ 1 のすり割り', steel],
  'train-bridge-screw-2': ['輪列受けのねじ 2', steel], 'train-bridge-screw-2-slot': ['輪列受けのねじ 2 のすり割り', steel],
  'barrel-bridge': ['香箱受け', brass], 'barrel-bridge-screw-1': ['香箱受けのねじ 1', steel], 'barrel-bridge-screw-1-slot': ['香箱受けのねじ 1 のすり割り', steel],
  'barrel-bridge-screw-2': ['香箱受けのねじ 2', steel], 'barrel-bridge-screw-2-slot': ['香箱受けのねじ 2 のすり割り', steel],
  'balance-cock': ['てんぷ受け', brass], 'balance-cock-jewel-1': ['てんぷ受けの石', ruby], 'balance-cock-screw-1': ['てんぷ受けのねじ', steel],
  'balance-cock-screw-1-slot': ['てんぷ受けのねじのすり割り', steel],
  'barrel-drum': ['香箱のドラム', brass], 'barrel-gear': ['香箱の歯車', brass], 'barrel-arbor': ['香箱真', steel], 'barrel-ratchet': ['角穴車', steel],
  'centre-arbor': ['二番真', steel], 'minute-hand': ['分針', steel], 'minute-hand-boss': ['分針のパイプ', steel], 'centre-pinion': ['二番かな', steel],
  'centre-wheel': ['二番車', brass], 'cannon-pinion': ['筒かな', steel],
  'third-arbor': ['三番真', steel], 'third-pinion': ['三番かな', steel], 'third-wheel': ['三番車', brass],
  'fourth-arbor': ['四番真', steel], 'seconds-hand': ['秒針', steel], 'seconds-hand-boss': ['秒針のパイプ', steel], 'fourth-pinion': ['四番かな', steel], 'fourth-wheel': ['四番車', brass],
  'escape-arbor': ['がんぎ真', steel], 'escape-pinion': ['がんぎかな', steel], 'escape-wheel': ['がんぎ車', steel],
  'pallet-arbor': ['アンクル真', steel], 'entry-stone': ['入り爪石', ruby], 'exit-stone': ['出爪石', ruby], fork: ['アンクル', steel],
  'balance-staff': ['てん真', steel], roller: ['振り座', steel], 'impulse-pin': ['振り石', ruby], collet: ['ひげ玉', steel], hairspring: ['ひげぜんまい', steel],
  'balance-rim': ['てん輪', brass], 'balance-arm-1': ['てん輪のアーム 1', brass], 'balance-arm-2': ['てん輪のアーム 2', brass], 'balance-arm-3': ['てん輪のアーム 3', brass], 'balance-hub': ['てん輪のハブ', brass],
  'minute-arbor': ['日の裏車の真', steel], 'minute-wheel': ['日の裏車', brass], 'minute-pinion': ['日の裏かな', steel],
  'hour-wheel': ['筒車', brass], 'hour-pipe': ['筒車のパイプ', brass], 'hour-hand': ['時針', steel], 'hour-hand-boss': ['時針のパイプ', steel],
  'case-middle': ['胴', caseSteel], 'lug-1': ['ラグ 1', caseSteel], 'lug-2': ['ラグ 2', caseSteel], 'lug-3': ['ラグ 3', caseSteel], 'lug-4': ['ラグ 4', caseSteel],
  'crown-stem': ['巻真', steel], crown: ['リューズ', caseSteel],
  bezel: ['ベゼル', caseSteel], 'front-crystal': ['風防', sapphire],
  'case-back': ['裏ぶた', caseSteel], 'back-crystal': ['裏ぶたのガラス', sapphire],
  'chapter-ring': ['見返しリング', brass],
  // v2 (PD4・PD5): ぜんまいと香箱の芯とふた、規格品のねじ・パッキン・ばね棒。
  'barrel-arbor-core': ['香箱真の芯', steel], mainspring: ['ぜんまい', 8300], 'barrel-cover': ['香箱のふた', brass],
  'slotted-watch-screw-m0-8-2': ['裏ぶたのねじ', steel], 'slotted-watch-screw-m0-8-2-slot': ['裏ぶたのねじのすり割り', steel],
  'o-ring-31-3-0-6-custom-size': ['裏ぶたのパッキン', nbr], 'spring-bar-for-16-mm-lugs-body-1-8': ['ばね棒', steel],
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`index-${i === 0 ? 12 : i}`, [`インデックス ${i === 0 ? 12 : i}`, steel]])),
};

/** HP-05: lugs with 16 mm between them (the F72 lugs left 11.2 mm). */
const lugX = { left: -10.8, right: 8.0 }, lugY = { top: 13.4, bottom: -21.6 }, lugLen = 8.2;

/** v1's body IDs (`cad/check-report.json` of v1, `V1_MAP`): the bodies v1 had keep them, new ones follow. */
const v1Map: Record<string, string> = process.env.V1_MAP ? JSON.parse(readFileSync(process.env.V1_MAP, 'utf8')) : {};
function renameAll(parts: { key: string; content: CadDocument }[]) {
  const map = new Map<string, string>();
  let n = Math.max(0, ...Object.values(v1Map).map((v) => Number(v.slice(3))));
  const outParts = parts.map((p) => {
    const doc = structuredClone(p.content);
    for (const b of doc.bodies) {
      // A Boolean's tool (v2's holes and cavities) is consumed: it keeps its ID, out of the parts list.
      if (b.state !== 'active') continue;
      const [jp, density] = names[b.id] ?? (() => { throw new Error(`no name for ${b.id}`); })();
      const id = v1Map[b.id] ?? `BD-${String(++n).padStart(3, '0')}`;
      map.set(b.id, id);
      b.id = id;
      b.name = jp;
      (b as { mass?: unknown }).mass = { densityKgM3: density };
    }
    if (p.key === 'case')
      for (const f of doc.features) {
        const m = /^Lug (\d)$/.exec(f.name);
        if (!m || f.type !== 'box') continue;
        const i = Number(m[1]);
        const x = i % 2 === 1 ? lugX.left : lugX.right;
        const y = i <= 2 ? lugY.top : lugY.bottom;
        (f.args as { size: unknown; origin: unknown }).size = [{ literalMm: 2.8 }, { literalMm: lugLen }, { literalMm: 3.2 }];
        (f.args as { origin: unknown }).origin = position(x, y, -0.4);
      }
    assertCad(doc);
    return { key: p.key, content: doc };
  });
  return { map, parts: outParts };
}

/** P3: the layout model (named sizes from the hard points, an envelope per subsystem). */
function layoutModel(kernel: { id: string; buildHash: string }): CadDocument {
  const A = sk01Layout.arbors, Z = sk01Layout.z, g = sk01Gears;
  const pr = (id: string, name: string, value: number) => ({ id, name, type: 'length' as const, value });
  const parameters = [
    pr('PR-01', 'ケースの外径', 2 * sk01Case.outer),
    pr('PR-02', 'ケースの厚み', sk01Case.back[1] - sk01Case.bezel[0]),
    pr('PR-03', 'ムーブメントの径', 2 * sk01Layout.plate.radius),
    pr('PR-04', 'ムーブメントの高さ', Z.cock[1]),
    pr('PR-05', 'ラグの内幅', 16),
    pr('PR-06', '風防の径', 2 * sk01Case.front.r),
    pr('PR-07', 'リューズの高さ', sk01Case.crown.z),
  ];
  const half = (id: string) => ({ affine: { parameterId: id, scale: 0.5, offsetMm: 0 } });
  const cyl = (id: string, name: string, radius: unknown, height: unknown, origin: unknown, color: string, opacity = 0.35) => ({
    feature: { id: `${id}-f`, name, type: 'cylinder', inputFeatureIds: [], args: { radius, height, origin, orientation: identityQuaternion() } },
    body: { id, name, sourceFeatureId: `${id}-f`, placementFeatureId: `${id}-p`, appearance: { color, opacity } },
  });
  const box = (id: string, name: string, size: unknown, origin: unknown, color: string) => ({
    feature: { id: `${id}-f`, name, type: 'box', inputFeatureIds: [], args: { size, origin, orientation: identityQuaternion() } },
    body: { id, name, sourceFeatureId: `${id}-f`, placementFeatureId: `${id}-p`, appearance: { color, opacity: 0.5 } },
  });
  const pitch = (p: { module: number; driven: number }) => (p.module * p.driven) / 2;
  const L = (mm: number) => ({ literalMm: mm });
  const items = [
    cyl('EN-001', '外装の空間（胴・ベゼル・裏ぶた）', half('PR-01'), { parameterId: 'PR-02' }, [L(0), L(0), L(sk01Case.bezel[0])], '#8a8f98', 0.15),
    cyl('EN-002', 'ムーブメントの空間', half('PR-03'), { parameterId: 'PR-04' }, position(0, 0, 0), '#c9a85c', 0.2),
    cyl('EN-003', '香箱（動力）', L(pitch(g.centreBarrel)), L(Z.barrel.drum[1] - Z.barrel.drum[0]), position(A.barrel[0], A.barrel[1], Z.barrel.drum[0]), '#d8b46a'),
    cyl('EN-004', '二番車（輪列）', L(pitch(g.thirdCentre)), L(Z.centre.wheel[1] - Z.centre.wheel[0]), position(0, 0, Z.centre.wheel[0]), '#d8b46a'),
    cyl('EN-005', '三番車（輪列）', L(pitch(g.fourthThird)), L(Z.third.wheel[1] - Z.third.wheel[0]), position(A.third[0], A.third[1], Z.third.wheel[0]), '#d8b46a'),
    cyl('EN-006', '四番車（輪列）', L(pitch(g.escapeFourth)), L(Z.fourth.wheel[1] - Z.fourth.wheel[0]), position(A.fourth[0], A.fourth[1], Z.fourth.wheel[0]), '#d8b46a'),
    cyl('EN-007', 'がんぎ車（脱進機）', L(1.95), L(Z.escape.wheel[1] - Z.escape.wheel[0]), position(A.escape[0], A.escape[1], Z.escape.wheel[0]), '#c9ccd2'),
    cyl('EN-008', 'てんぷの回る空間（調速機）', L(4.05), L(Z.balance.rim[1] - Z.balance.rim[0]), position(A.balance[0], A.balance[1], Z.balance.rim[0]), '#c9ccd2'),
    cyl('EN-009', '針の回る空間（表示）', L(11.0), L(Z.hands.seconds[1] - Z.hands.minute[0]), position(0, 0, Z.hands.minute[0]), '#24306e'),
    cyl('EN-010', '風防の見える範囲', half('PR-06'), L(sk01Case.front.z[1] - sk01Case.front.z[0]), position(0, 0, sk01Case.front.z[0]), '#9fc3e0'),
    box('EN-011', 'ラグとベルト（12時側）', [{ affine: { parameterId: 'PR-05', scale: 1, offsetMm: 5.6 } }, L(lugLen), L(3.2)], [{ affine: { parameterId: 'PR-05', scale: -0.5, offsetMm: -2.8 } }, L(lugY.top), L(-0.4)], '#8a8f98'),
    box('EN-012', 'ラグとベルト（6時側）', [{ affine: { parameterId: 'PR-05', scale: 1, offsetMm: 5.6 } }, L(lugLen), L(3.2)], [{ affine: { parameterId: 'PR-05', scale: -0.5, offsetMm: -2.8 } }, L(lugY.bottom), L(-0.4)], '#8a8f98'),
    cyl('EN-013', 'リューズと巻上げ（巻上げ機構）', L(sk01Case.crown.r), L(sk01Case.crown.length + 0.7), [L(17.0), L(0), { parameterId: 'PR-07' }], '#8a8f98'),
  ];
  // The crown lies along +X.
  (items.at(-1)!.feature.args as { orientation: unknown }).orientation = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
  const doc = applyCadOperation(emptyCad(kernel), {
    type: 'insertFeatures',
    parameters,
    profiles: [],
    features: items.map((i) => i.feature),
    bodies: items.map((i) => i.body),
  } as never);
  assertCad(doc);
  return doc;
}


const L = (mm: number) => ({ literalMm: mm });
const toX: [number, number, number, number] = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
const caseLook = { color: '#d7d9dd', metalness: 1, roughness: 0.18 };
const crystalLook = { color: '#f4f8ff', opacity: 0.18, metalness: 0, roughness: 0.02, transmission: 1, ior: 1.77 };

/** Applies a fresh builder's steps onto `doc` (its names must not clash with the document's). */
function addWith(doc: CadDocument, kernel: Kernel, make: (b: CadBuilder) => void): CadDocument {
  const b = cadBuilder(kernel);
  make(b);
  let d = doc;
  for (const op of b.build().operations) d = applyCadOperation(d, op);
  return d;
}
const cut = (doc: CadDocument, target: string, tools: string[], id: string) =>
  applyCadOperation(doc, { type: 'booleanBodies', targetId: target, toolIds: tools, mode: 'cut', booleanFeatureId: id, placementFeatureId: `${id}-placement` } as never);

/** v2 sizes (mm). */
const v2 = Object.freeze({
  // The mainspring in a hollow barrel (PD5): drum 5.1 inside, arbor core 1.6, 13 turns of 0.1 × 0.5.
  barrel: { cavity: 5.1, floor: 0.95, core: 1.6, cover: 0.1 },
  mainspring: { thickness: 0.1, height: 0.5, innerRadius: 1.8, pitch: 0.24, turns: 13, z: 0.97 },
  // The hairspring as a spring feature, on the v1 ribbon's footprint (0.52 → 1.9 mm in 7 turns).
  hairspring: { thickness: 0.03, innerRadius: 0.52, pitch: (1.9 - 0.52) / 7, turns: 7, amplitudeDeg: 300 },
  // The screwed back (PD4): six M0.8×2 watch screws at r 16.8, a face gasket 31.3 × 0.6 in a groove
  // 32.5 across on the back's underside, sealing on the middle's top face.
  screws: { r: 16.8, anglesDeg: [30, 90, 150, 210, 270, 330], clearance: 0.9, tap: 0.82, spec: { family: 'screw', standard: 'watch', size: 'M0.8', length: 2 } as const },
  gasket: { innerDiameter: 31.3, section: 0.6, custom: true, grooveOuter: 32.5 },
  // The strap's spring bars (PD4) in 1.0 holes, 1.15 deep into the lugs, 2 mm from the lugs' ends.
  springBar: { spec: { family: 'spring-bar', length: 16, diameter: 1.8 } as const, y: 19.6, z: 1.2, hole: 1.0, depth: 1.15 },
  // DM-02: the indices 0.2 thick (v1 0.05).
  index: 0.2,
});

/** The v2 edits of the sk01 parts, before the bodies are renamed. */
function editParts(parts: { key: string; content: CadDocument }[], kernel: Kernel, hoursPerTurn: number) {
  const C = sk01Case;
  const Z = sk01Layout.z;
  const edit: Record<string, (d: CadDocument) => CadDocument> = {
    barrel: (d) => {
      const { cavity, floor, core, cover } = v2.barrel;
      const top = Z.barrel.drum[1];
      d = addWith(d, kernel, (b) => {
        b.cylinder('Barrel cavity', { radius: cavity, height: top - floor + 0.1, origin: [0, 0, floor] });
        b.cylinder('Barrel gear cavity', { radius: cavity, height: top - floor + 0.1, origin: [0, 0, floor] });
        b.cylinder('Barrel arbor core', { radius: core, height: top - floor, origin: [0, 0, floor] }, { color: '#c9ccd2', metalness: 1, roughness: 0.25 });
        const m = v2.mainspring;
        b.spiralSpring('Mainspring', {
          use: 'mainspring', thickness: m.thickness, height: m.height, innerRadius: m.innerRadius, pitch: m.pitch, turns: m.turns,
          material: { youngsModulusMpa: 206_000 },
          barrel: { innerRadius: cavity, arborRadius: core, hoursPerTurn },
          origin: [0, 0, m.z],
        }, { color: '#4a5a8a', metalness: 1, roughness: 0.35 });
        b.cylinder('Barrel cover', { radius: 5.6, height: cover, origin: [0, 0, top] }, { color: '#d8b46a', metalness: 1, roughness: 0.3 });
      });
      d = cut(d, 'barrel-drum', ['barrel-cavity'], 'barrel-drum-hollow');
      return cut(d, 'barrel-gear', ['barrel-gear-cavity'], 'barrel-gear-hollow');
    },
    balance: (d) => {
      d = applyCadOperation(d, { type: 'deleteClosure', ids: ['hairspring'], cascade: true } as never);
      const h = v2.hairspring;
      return addWith(d, kernel, (b) =>
        b.spiralSpring('Hairspring', {
          use: 'hairspring', thickness: h.thickness, height: Z.balance.spring[1] - Z.balance.spring[0], innerRadius: h.innerRadius, pitch: h.pitch, turns: h.turns,
          material: { youngsModulusMpa: 190_000 },
          angle: (h.amplitudeDeg * Math.PI) / 180,
          origin: [0, 0, Z.balance.spring[0]],
        }, { color: '#24306e', metalness: 1, roughness: 0.3 }),
      );
    },
    case: (d) => {
      const s = v2.springBar;
      const lugs: [string, number, number][] = [['lug-1', -8.0, s.y], ['lug-2', 8.0, s.y], ['lug-3', -8.0, -s.y], ['lug-4', 8.0, -s.y]];
      d = addWith(d, kernel, (b) => {
        for (const [id, x, y] of lugs) {
          const from = x < 0 ? x - s.depth : x - 0.1;
          b.cylinder(`${id} bar hole`, { radius: s.hole / 2, height: s.depth + 0.1, origin: [from, y, s.z], orientation: toX });
        }
        for (const [i, a] of v2.screws.anglesDeg.entries()) {
          const t = (a * Math.PI) / 180;
          b.cylinder(`Back screw hole ${i + 1}`, { radius: v2.screws.tap / 2, height: C.middle[1] - 2.8 + 0.1, origin: [v2.screws.r * Math.cos(t), v2.screws.r * Math.sin(t), 2.8] });
        }
      });
      for (const [id] of lugs) d = cut(d, id, [`${id}-bar-hole`], `${id}-bar-hole-cut`);
      return cut(d, 'case-middle', v2.screws.anglesDeg.map((_, i) => `back-screw-hole-${i + 1}`), 'back-screw-holes');
    },
    'chapter-ring': (d) => {
      for (const f of d.features) if (/^Index \d+$/.test(f.name)) (f.args as { distance: unknown }).distance = L(v2.index);
      assertCad(d);
      return d;
    },
  };
  for (const p of parts) if (edit[p.key]) p.content = edit[p.key]!(structuredClone(p.content));
  // The back, made again with its gasket groove and screw holes (v1: a plain ring).
  const b = cadBuilder(kernel);
  const back = b.cylinder('Case back', { radius: C.outer, height: C.back[1] - C.back[0], origin: [0, 0, C.back[0]] }, caseLook);
  const bore = b.cylinder('Case back bore', { radius: C.inner, height: C.back[1] - C.back[0] + 0.2, origin: [0, 0, C.back[0] - 0.1] });
  b.boolean(back, [bore], 'cut', 'Case back bore cut');
  // A face groove on the underside: the axis turned to −Z, so `z` (the face) is −back[0].
  const gland = oRingGroove(b, back, { kind: 'axial', ring: v2.gasket, diameter: v2.gasket.grooveOuter, z: -C.back[0], orientation: [1, 0, 0, 0], name: 'Gasket groove' });
  const holes = v2.screws.anglesDeg.map((a, i) => {
    const t = (a * Math.PI) / 180;
    return b.cylinder(`Back screw clearance ${i + 1}`, { radius: v2.screws.clearance / 2, height: C.back[1] - C.back[0] + 0.2, origin: [v2.screws.r * Math.cos(t), v2.screws.r * Math.sin(t), C.back[0] - 0.1] });
  });
  b.boolean(back, holes, 'cut', 'Back screw clearances');
  b.cylinder('Back crystal', { radius: C.backCrystal.r, height: C.backCrystal.z[1] - C.backCrystal.z[0], origin: [0, 0, C.backCrystal.z[0]] }, crystalLook);
  const backDoc = b.build().document;
  // PD3: the gasket's squeeze, from the section, the groove's depth and the seat's gap (BG-02's 0.02).
  const pr = (id: string, name: string, value: number) => ({ id, name, type: 'length' as const, value });
  backDoc.parameters.push(pr('gasket-section', 'パッキンの太さ', v2.gasket.section), pr('groove-depth', 'パッキン溝の深さ', gland.depth), pr('seat-gap', '裏ぶたと胴のすき間', C.back[0] - C.middle[1]));
  backDoc.toleranceStacks = [{
    id: 'TS-01', name: 'パッキンのつぶし代', requirement: 'RQ-06',
    contributors: [
      { id: 'c-section', name: 'パッキンの太さ', source: { kind: 'parameter', parameterId: 'gasket-section', lower: -0.03, upper: 0.03 }, sign: 1, distribution: 'normal' },
      { id: 'c-depth', name: '溝の深さ', source: { kind: 'parameter', parameterId: 'groove-depth', lower: -0.02, upper: 0.02 }, sign: -1, distribution: 'normal' },
      { id: 'c-gap', name: 'すき間', source: { kind: 'parameter', parameterId: 'seat-gap', lower: -0.01, upper: 0.01 }, sign: -1, distribution: 'uniform' },
    ],
    // 15–30 % of the 0.6 section.
    min: 0.09, max: 0.18, runs: 100_000, seed: 6,
  }];
  assertCad(backDoc);
  const backPart = parts.find((p) => p.key === 'case-back')!;
  backPart.content = backDoc;
  // PD3 on the plate: BG-04's centre distance of the escape pinion and the fourth wheel (KC-01 ±0.004).
  const plate = parts.find((p) => p.key === 'plate')!.content;
  const A = sk01Layout.arbors;
  const a = Math.hypot(A.escape[0] - A.fourth[0], A.escape[1] - A.fourth[1]);
  plate.parameters.push(pr('cd-fourth-escape', '四番とがんぎの中心距離', a), pr('hole-fourth', '四番の穴の位置のずれ', 0), pr('hole-escape', 'がんぎの穴の位置のずれ', 0), pr('pivot-fourth', '四番のほぞのすきま（片側）', 0), pr('pivot-escape', 'がんぎのほぞのすきま（片側）', 0));
  plate.toleranceStacks = [{
    id: 'TS-02', name: '四番車とがんぎかなの中心距離', requirement: 'RQ-14',
    contributors: [
      { id: 'c-nominal', name: '図面の中心距離', source: { kind: 'parameter', parameterId: 'cd-fourth-escape', lower: 0, upper: 0 }, sign: 1, distribution: 'normal' },
      { id: 'c-hole-4', name: '四番の穴の位置', source: { kind: 'parameter', parameterId: 'hole-fourth', lower: -0.004, upper: 0.004 }, sign: 1, distribution: 'normal' },
      { id: 'c-hole-e', name: 'がんぎの穴の位置', source: { kind: 'parameter', parameterId: 'hole-escape', lower: -0.004, upper: 0.004 }, sign: -1, distribution: 'normal' },
      { id: 'c-pivot-4', name: '四番のほぞのすきま', source: { kind: 'parameter', parameterId: 'pivot-fourth', lower: -0.005, upper: 0.005 }, sign: 1, distribution: 'uniform' },
      { id: 'c-pivot-e', name: 'がんぎのほぞのすきま', source: { kind: 'parameter', parameterId: 'pivot-escape', lower: -0.005, upper: 0.005 }, sign: 1, distribution: 'uniform' },
    ],
    // BG-04: the play within 10 % of the 0.18 mm tooth height.
    min: a - 0.018, max: a + 0.018, runs: 100_000, seed: 4,
  }];
  assertCad(plate);
  return { gland };
}

/** PD2: each part's BOM values (PT ids of docs/ebom.json; costs wait for the quotes, PD-U3). */
const bom: Record<string, { pt: string; jp: string; material: [string, number]; sourcing: 'make' | 'outsource' | 'buy' | 'standard'; supplier?: string }> = {
  plate: { pt: 'PT-001', jp: '地板', material: ['真鍮 C3604、ロジウムめっき', brass], sourcing: 'make' },
  'train-bridge': { pt: 'PT-003', jp: '輪列受け', material: ['真鍮 C3604', brass], sourcing: 'make' },
  'barrel-bridge': { pt: 'PT-005', jp: '香箱受け', material: ['真鍮 C3604', brass], sourcing: 'make' },
  'balance-cock': { pt: 'PT-006', jp: 'てんぷ受け', material: ['真鍮 C3604', brass], sourcing: 'make' },
  barrel: { pt: 'PT-007', jp: '香箱（ドラム・歯車・真・角穴車・ぜんまい）', material: ['真鍮', brass], sourcing: 'outsource', supplier: 'SS-01 の外注先（未決）' },
  centre: { pt: 'PT-011', jp: '二番車と二番かな・筒かな・分針', material: ['真鍮・焼入れ鋼', brass], sourcing: 'outsource' },
  third: { pt: 'PT-014', jp: '三番車', material: ['真鍮・焼入れ鋼', brass], sourcing: 'outsource' },
  fourth: { pt: 'PT-015', jp: '四番車と秒針', material: ['真鍮・焼入れ鋼', brass], sourcing: 'outsource' },
  escape: { pt: 'PT-017', jp: 'がんぎ車', material: ['焼入れ鋼', steel], sourcing: 'outsource' },
  pallet: { pt: 'PT-018', jp: 'アンクル', material: ['焼入れ鋼', steel], sourcing: 'outsource' },
  balance: { pt: 'PT-020', jp: 'てんぷ（てん輪・てん真・振り座・ひげぜんまい）', material: ['ベリリウム銅・焼入れ鋼', brass], sourcing: 'outsource' },
  minute: { pt: 'PT-023', jp: '日の裏車', material: ['真鍮・鋼', brass], sourcing: 'outsource' },
  hour: { pt: 'PT-024', jp: '筒車と時針', material: ['真鍮', brass], sourcing: 'outsource' },
  case: { pt: 'PT-026', jp: '胴（ラグ一体）と巻真・リューズ', material: ['ステンレス鋼 316L', caseSteel], sourcing: 'outsource' },
  bezel: { pt: 'PT-029', jp: 'ベゼルと風防', material: ['ステンレス鋼 316L', caseSteel], sourcing: 'outsource' },
  'case-back': { pt: 'PT-031', jp: '裏ぶたと裏ぶたのガラス', material: ['ステンレス鋼 316L', caseSteel], sourcing: 'outsource' },
  'chapter-ring': { pt: 'PT-033', jp: '見返しリングとインデックス', material: ['真鍮、塗装', brass], sourcing: 'outsource' },
  'case-screw': { pt: 'PT-039', jp: '裏ぶたのねじ', material: ['ステンレス鋼', steel], sourcing: 'standard' },
  gasket: { pt: 'PT-035', jp: '裏ぶたのパッキン', material: ['ニトリルゴム', nbr], sourcing: 'standard' },
  'spring-bar': { pt: 'PT-038', jp: 'ばね棒', material: ['ステンレス鋼', steel], sourcing: 'standard' },
};

describe.skipIf(!dist)('watch-sk01 CAD v2', () => {
  it('writes and checks the layout and detail models', async () => {
    const wasm = readFileSync(`${dist}/${cadKernelBuild.wasm}`);
    const sha = createHash('sha256').update(wasm).digest('hex');
    expect(sha).toBe(cadKernelBuild.wasmSha256);
    const kernel = { id: 'occt', buildHash: `sha256:${sha}` };
    globalThis.require ??= createRequire(import.meta.url);
    const posted: CadWorkerResponse[] = [];
    const handle = createKernelHost({
      load: async () => {
        const { default: factory } = await import(pathToFileURL(`${dist}/${cadKernelBuild.js}`).href);
        return factory({ wasmBinary: wasm });
      },
      post: (m) => void posted.push(m),
      yieldTask: () => new Promise((resolve) => setImmediate(resolve)),
    });
    await handle({ type: 'init', build: { buildHash: kernel.buildHash, moduleUrl: '', wasmUrl: '' } });
    const evaluate = async (key: string, doc: CadDocument) => {
      await handle({ type: 'evaluate', requestId: key, generation: 1, baseHash: '', candidateHash: cadContentHash(doc), document: doc } as CadWorkerRequest);
      const m = posted.find((x) => 'requestId' in x && x.requestId === key && x.type !== 'progress');
      if (m?.type !== 'result' || m.evaluation.status !== 'ok') throw new Error(`${key}: ${JSON.stringify(m).slice(0, 600)}`);
      return m;
    };

    mkdirSync(`${out}/cad/detail`, { recursive: true });
    const report: Record<string, unknown> = { version: 2, kernel: kernel.buildHash };
    const t0 = performance.now();
    const phase = (name: string) => process.env.PHASE_LOG && writeFileSync(process.env.PHASE_LOG, `${Math.round((performance.now() - t0) / 1000)} s ${name}\n`, { flag: 'a' });

    // P3 layout
    const layout = layoutModel(kernel);
    const lm = await evaluate('layout', layout);
    writeFileSync(`${out}/cad/layout-model.cad.json`, `${JSON.stringify(layout, null, 1)}\n`);
    report.layout = { contentHash: cadContentHash(layout), bodies: Object.fromEntries(Object.entries(lm.evaluation.bodies ?? {}).map(([k, v]) => [k, { volumeMm3: (v as { volumeMm3?: number }).volumeMm3 }])) };

    // P4 detail: the sk01 parts with the v2 edits, and the standard parts.
    const w = sk01Watch(kernel);
    // PD5: one barrel turn from the train (centre pinion 10 → barrel 80, the centre wheel 1 h a turn).
    const hoursPerTurn = trainHoursPerTurn(w.assembly, 'j-barrel', 'j-centre')!;
    const src = w.parts.map((p) => ({ key: p.key, content: structuredClone(p.content) }));
    const { gland } = editParts(src, kernel, hoursPerTurn);
    const std = {
      'case-screw': standardPart(v2.screws.spec, kernel),
      gasket: standardPart({ family: 'o-ring', innerDiameter: v2.gasket.innerDiameter, section: v2.gasket.section, custom: true }, kernel),
      'spring-bar': standardPart(v2.springBar.spec, kernel),
    };
    for (const [key, s] of Object.entries(std)) src.push({ key, content: s.content });
    const { map, parts } = renameAll(src);
    for (const p of parts) {
      const v = bom[p.key]!;
      const s = std[p.key as keyof typeof std];
      p.content.partProperties = {
        partNumber: v.pt,
        description: s ? `${v.jp}（${s.designation}）` : v.jp,
        material: { name: v.material[0], densityKgM3: v.material[1] },
        sourcing: v.sourcing,
        ...(v.supplier ? { supplier: v.supplier } : {}),
      };
    }
    const byKey = (k: string) => parts.find((p) => p.key === k)!.content;
    const bd = (old: string) => map.get(old)!;
    // PD1: the targets each part answers for.
    byKey('case').designTargets = [
      { id: 'TG-01', name: 'ラグの内幅（12 時側）', requirement: 'RQ-10', measure: { kind: 'distance', a: [bd('lug-1')], b: [bd('lug-2')] }, min: 16.0, max: 16.1 },
      { id: 'TG-02', name: 'ラグの内幅（6 時側）', requirement: 'RQ-10', measure: { kind: 'distance', a: [bd('lug-3')], b: [bd('lug-4')] }, min: 16.0, max: 16.1 },
      { id: 'TG-03', name: 'ケースの径', requirement: 'RQ-04', measure: { kind: 'extent', bodyIds: [bd('case-middle')], axis: 'x' }, min: 35, max: 36 },
    ];
    const barrelDoc = byKey('barrel');
    const mainspring = barrelDoc.features.find((f) => f.type === 'spring')!.id;
    barrelDoc.designTargets = [
      { id: 'TG-04', name: 'パワーリザーブ', requirement: 'RQ-02', measure: { kind: 'spring', featureId: mainspring, quantity: 'runHours' }, min: 40 },
      { id: 'TG-05', name: 'ぜんまいの曲げ応力（巻き上げたとき）', measure: { kind: 'spring', featureId: mainspring, quantity: 'fullStress' }, max: 2000 },
    ];
    byKey('case-back').designTargets = [
      { id: 'TG-06', name: 'パッキンのつぶし代（RSS の下限）', requirement: 'RQ-06', measure: { kind: 'tolerance-stack', stackId: 'TS-01', value: 'rss-min' }, min: 0.09 },
      { id: 'TG-07', name: 'パッキンのつぶし代（RSS の上限）', requirement: 'RQ-06', measure: { kind: 'tolerance-stack', stackId: 'TS-01', value: 'rss-max' }, max: 0.18 },
    ];
    for (const p of parts) assertCad(p.content);

    const newVersions = new Map<string, { hash: string; content: CadDocument; path: string }>();
    const evals = new Map<string, Awaited<ReturnType<typeof evaluate>>>();
    const mass: { part: string; body: string; name: string; g: number }[] = [];
    const meshes = new Map<string, CadInterferenceMesh[]>();
    const worldMeshes = (m: Awaited<ReturnType<typeof evaluate>>) =>
      m.meshes.filter((x) => !(x as { lod?: unknown }).lod).map((x) => ({ bodyId: x.bodyId, indices: [...x.indices], points: Array.from(x.positions, (v, i) => v + x.origin[i % 3]!) }));
    const partTargets: Record<string, unknown> = {};
    const springs: Record<string, unknown> = {};
    for (const p of parts) {
      const path = `cad/detail/${p.key}.cad.json`;
      writeFileSync(`${out}/${path}`, `${JSON.stringify(p.content, null, 1)}\n`);
      const hash = cadContentHash(p.content);
      newVersions.set(p.key, { hash, content: p.content, path });
      const m = await evaluate(p.key, p.content);
      evals.set(hash, m);
      meshes.set(hash, m.meshes.map((x) => ({ bodyId: x.bodyId, origin: [...x.origin] as V3, positions: [...x.positions], indices: [...x.indices] })));
      for (const b of p.content.bodies) {
        if (b.state !== 'active') continue;
        const e = (m.evaluation.bodies ?? {})[b.id] as { volumeMm3?: number } | undefined;
        const d = (b as { mass?: { densityKgM3: number } }).mass!.densityKgM3;
        mass.push({ part: p.key, body: b.id, name: b.name, g: e?.volumeMm3 ? e.volumeMm3 * d * 1e-6 : NaN });
      }
      if (p.content.designTargets?.length) {
        const r = measureDesignTargets(p.content, { bodies: m.evaluation.bodies, meshes: worldMeshes(m) });
        partTargets[p.key] = designTargetReport(p.content, r, p.key);
      }
      for (const f of p.content.features)
        if (f.type === 'spring') {
          const s = resolveSpring(f.args as never, parameterValues(p.content));
          springs[`${p.key}/${f.name}`] = springEstimate(s, (f.args as { barrel?: { hoursPerTurn?: number } }).barrel?.hoursPerTurn);
        }
    }
    report.mass = mass;
    report.bodyMap = Object.fromEntries(map);
    report.springs = springs;
    report.gasketGland = gland;
    report.stacks = Object.fromEntries(['case-back', 'plate'].map((k) => [k, toleranceStackReport(byKey(k), cadToleranceStacks(byKey(k)), k)]));

    // The assembly, pointing at the renamed versions, with the standard parts placed.
    const asm = structuredClone(w.assembly);
    const oldToKey = new Map([...w.versions.entries()].map(([k, v]) => [v.contentHash, k]));
    for (const part of asm.parts) {
      const src = part.source as { kind: string; contentHash: string; artifactId: string; versionId: string };
      const key = oldToKey.get(src.contentHash)!;
      const v = newVersions.get(key)!;
      src.contentHash = v.hash;
      src.artifactId = v.path;
      src.versionId = 'p4';
    }
    const C = sk01Case;
    for (const key of Object.keys(std)) {
      const v = newVersions.get(key)!;
      asm.parts.push({ id: `part-${key}`, name: bom[key]!.jp, source: { kind: 'version', artifactId: v.path, versionId: 'p4', contentHash: v.hash }, hint: { boundsMm: [[-20, -22, -2.6], [20, 22, 5.6]] } } as never);
    }
    const lift = asm.joints.find((j) => j.id === 'j-lift-case-back')!;
    const follower = (id: string, name: string, componentId: string, at: V3) => {
      const j = structuredClone(lift);
      j.id = id;
      j.name = name;
      j.child.componentId = componentId;
      j.parent.offset.translation = [L(at[0]), L(at[1]), L(at[2])] as never;
      j.values = {};
      j.limits = [];
      (j as { couplings?: unknown }).couplings = [{ of: 'distance', from: { joint: 'j-lift-case-back', of: 'distance' }, ratio: 1, offset: 0 }];
      return j;
    };
    // The screws and the gasket lift with the back (in the exploded form too).
    for (const [i, a] of v2.screws.anglesDeg.entries()) {
      const t = (a * Math.PI) / 180;
      asm.components.push({ id: `c-case-screw-${i + 1}`, name: `裏ぶたのねじ ${i + 1}`, partId: 'part-case-screw', placement: null, bom: 'include' } as never);
      asm.joints.push(follower(`j-case-screw-${i + 1}`, `裏ぶたのねじ ${i + 1}`, `c-case-screw-${i + 1}`, [v2.screws.r * Math.cos(t), v2.screws.r * Math.sin(t), C.back[1]]));
    }
    // The ring (its section from z 0 up to the section) with its top on the groove's floor: drawn
    // free, it reaches into the middle by the squeeze (TS-01), the one contact meant to be there.
    const gasketZ = C.back[0] + gland.depth - v2.gasket.section;
    asm.components.push({ id: 'c-gasket', name: '裏ぶたのパッキン', partId: 'part-gasket', placement: null, bom: 'include' } as never);
    asm.joints.push(follower('j-gasket', '裏ぶたのパッキン', 'c-gasket', [0, 0, gasketZ]));
    const bar = std['spring-bar'];
    const barLen = (bar.dimensions as { extended: number }).extended;
    for (const [i, y] of [v2.springBar.y, -v2.springBar.y].entries())
      asm.components.push({ id: `c-spring-bar-${i + 1}`, name: `ばね棒 ${i ? '6' : '12'} 時側`, partId: 'part-spring-bar', placement: { translation: [L(-barLen / 2), L(y), L(v2.springBar.z)], rotation: toX }, bom: 'include' } as never);
    const closure = new Map([...newVersions.values()].map((v) => [v.hash, v.content] as const));
    const lookup = (h: string) => closure.get(h);
    const solve = (d: CadDocument) => solveJoints(d, parameterValues(d), lookup, () => undefined, () => true);
    asm.solvedPoses = solve(asm).poses;
    const versionsEval = Object.fromEntries([...evals].map(([h, m]) => [h, { state: 'available', bodies: m.evaluation.bodies }]));
    asm.partProperties = { partNumber: 'SK-01', description: 'SK-01 スケルトン手巻き腕時計', currency: 'JPY' } as never;
    asm.designTargets = [{ id: 'TG-08', name: '質量（ベルト除く）', requirement: 'RQ-11', measure: { kind: 'mass' }, max: 0.045 }];
    assertCad(asm);
    writeFileSync(`${out}/cad/detail/sk01-watch.assembly.cad.json`, `${JSON.stringify(asm, null, 1)}\n`);
    const totalMass = cadMass(asm, undefined, lookup, versionsEval);
    partTargets.assembly = designTargetReport(asm, measureDesignTargets(asm, { mass: totalMass }), 'sk01-watch');
    report.designTargets = partTargets;
    const bomFlat = bomReport(asm, lookup, 'flat', { versions: versionsEval });
    writeFileSync(`${out}/cad/bom.json`, bomJson(bomFlat, { name: 'SK-01', contentHash: cadContentHash(asm) }));

    phase('parts and assembly written');
    const clear = (doc: CadDocument) => {
      const r = checkCadInterference({ doc, lookup, meshesOf: (h) => meshes.get(h), joints: solve(doc).joints });
      return r.status === 'ok' ? { findings: r.findings.map((x) => `${x.a.join('/')}–${x.b.join('/')}`), unchecked: r.unchecked } : { status: r.status };
    };
    const exploded = structuredClone(asm);
    for (const [id, values] of Object.entries(asm.configurations!.find((c) => c.id === 'form-exploded')!.values))
      exploded.joints.find((j) => j.id === id)!.values = structuredClone(values);
    exploded.solvedPoses = solve(exploded).poses;
    const { joints } = solve(asm);
    const input = { doc: asm, lookup, meshesOf: (h: string) => meshes.get(h), joints };
    // v1's 97 samples over 12 h (each hand at 97 different angles), kept for comparison.
    const N = 97;
    const samples = Array.from({ length: N }, (_, i) => ({ tick: i, values: new Map([['j-escape', { angle: -(i / N) * 8640 * 2 * Math.PI }]]) }));
    phase('assembled and exploded set up');
    const along = checkCadInterferenceAlong(input, samples as { tick: number; values: Map<string, CadResolvedJointValues> }[]);
    phase('97 samples done');
    // PD6: one minute of the whole train with every part within 0.5 mm and 5° a step.
    const turn = 2 * Math.PI;
    const minute = checkCadMotionCoverage(input, { joint: 'j-escape', of: 'angle', from: 0, to: -12 * turn }, { stepMm: 0.5, stepRad: Math.PI / 36 });
    phase('one minute coverage done');
    // PD6: 12 h of the motion works (centre, minute and hour wheels with their hands, and the barrel)
    // with the escapement side held: the centre wheel freed from the third wheel for this check only.
    const works = structuredClone(asm);
    const centre = works.joints.find((j) => j.id === 'j-centre')!;
    delete (centre as { couplings?: unknown }).couplings;
    works.gearMeshes = (works.gearMeshes ?? []).filter((g) => g.id !== 'mesh-third-centre');
    works.solvedPoses = solve(works).poses;
    const hours = checkCadMotionCoverage({ doc: works, lookup, meshesOf: (h: string) => meshes.get(h), joints: solve(works).joints }, { joint: 'j-centre', of: 'angle', from: 0, to: 12 * turn }, { stepMm: 0.5, stepRad: Math.PI / 36 });
    // Pairs every pose shows on purpose: the gasket drawn free against the middle (its squeeze) and
    // seated in its groove on the back (on the floor, and against the outer wall: its outside 32.5 is
    // the groove's, as a face seal under inside pressure is drawn), and, in the 12 h run only, the
    // centre wheel against the held third pinion (the mesh that run frees; it is checked by the
    // gear-mesh check and the one-minute run).
    const meantPairs = ['c-case–c-gasket', 'c-case-back–c-gasket'];
    const meant = new Set([...meantPairs, ...meantPairs.map((k) => k.split('–').reverse().join('–'))]);
    const pairs = (r: { hits: { tick: number; findings: { a: string[]; b: string[] }[] }[] }, extra: string[] = []) => {
      const all = r.hits.flatMap((h) => h.findings.map((x) => `${x.a.join('/')}–${x.b.join('/')}`));
      const counts: Record<string, number> = {};
      for (const k of all) counts[k] = (counts[k] ?? 0) + 1;
      return { counts, unexpected: Object.keys(counts).filter((k) => !meant.has(k) && !extra.includes(k)) };
    };
    const coverage = (r: ReturnType<typeof checkCadMotionCoverage>, extra: string[] = []) =>
      r.status === 'ok'
        ? { steps: r.steps, worstPartStepMm: Math.max(...r.parts.map((p) => p.stepMm ?? 0)), unmeasured: r.unmeasured, pairs: pairs(r, extra), jumps: r.jumps.length, unchecked: r.unchecked }
        : r;
    phase('12 h coverage done');
    const sol = solve(asm);
    report.interference = {
      assembled: clear(asm),
      exploded: clear(exploded),
      meantContacts: meantPairs,
      handsOver12h: along.status === 'ok' ? { samples: along.samples, pairs: pairs(along), unchecked: along.unchecked } : { status: along.status },
      coverageOneMinute: coverage(minute),
      coverageMotionWorks12h: coverage(hours, ['c-centre–c-third', 'c-third–c-centre']),
    };
    report.gearMeshes = (asm.gearMeshes ?? []).map((g) => ({ id: g.id, name: g.name, check: checkGearMesh(asm, g, sol, lookup) }));

    phase('gear meshes done');
    // PD7: the balance seen through each crystal, on the whole watch's meshes in place.
    const flat: { bodyId: string; points: number[]; indices: number[] }[] = [];
    for (const o of expandAssembly(asm, lookup).occurrences) {
      for (const m of meshes.get(o.part.source.contentHash) ?? []) {
        const points: number[] = [];
        for (let i = 0; i < m.positions.length; i += 3) {
          const p = rotateVector(o.pose.rotation, [m.positions[i]! + m.origin[0], m.positions[i + 1]! + m.origin[1], m.positions[i + 2]! + m.origin[2]]);
          points.push(p[0] + o.pose.translationMm[0], p[1] + o.pose.translationMm[1], p[2] + o.pose.translationMm[2]);
        }
        flat.push({ bodyId: `${o.path.join('/')}:${m.bodyId}`, points, indices: [...m.indices] });
      }
    }
    const idsOf = (component: string, pred: (name: string) => boolean) => {
      const part = asm.parts.find((p) => p.id === asm.components.find((c) => c.id === component)!.partId)!;
      return closure.get(part.source.contentHash)!.bodies.filter((b) => pred(b.name)).map((b) => `${component}:${b.id}`);
    };
    const balance = idsOf('c-balance', (n) => n.startsWith('てん輪'));
    const [bx, by] = sk01Layout.arbors.balance;
    const sightDoc = { ...asm, sightChecks: [
      { id: 'SC-01', name: 'てんぷが裏ぶたのガラスから見える', requirement: 'RQ-09', measure: { kind: 'visibleFraction', eyes: [[bx, by, 250]], targetIds: balance, clearIds: idsOf('c-case-back', (n) => n === '裏ぶたのガラス') }, min: 0.4 },
      { id: 'SC-02', name: 'てんぷが風防から見える', requirement: 'RQ-09', measure: { kind: 'visibleFraction', eyes: [[bx, by, -250]], targetIds: balance, clearIds: idsOf('c-bezel', (n) => n === '風防') }, min: 0.4 },
    ] } as CadDocument;
    report.sight = sightCheckReport(sightDoc, measureSightChecks(sightDoc, { meshes: flat }), 'sk01-watch');
    phase('sight done');
    report.bom = { totals: (bomFlat as { totals?: unknown }).totals, leftOut: (bomFlat as { leftOut?: unknown }).leftOut };
    writeFileSync(`${out}/cad/check-report.json`, `${JSON.stringify(report, null, 1)}\n`);
    console.log(JSON.stringify({ i: report.interference, total: mass.reduce((t, m) => t + m.g, 0), targets: partTargets, sight: report.sight, stacks: report.stacks, springs }).slice(0, 20000));
  }, 3_600_000);
});
