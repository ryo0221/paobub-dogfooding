// 放課後ぐだぐだ部 第1話 ネームの舞台（デジタルツイン）。editor-platform の tests/demo に写して動かす（editor-platform には commit しない）。
// 手本：gulliver-manga part1/name/src/gulliver-ep01-stage.demo.ts。
// 人物は4頭身の箱の体（骨と skin つき）、部屋（生徒会室・部室と廊下）は箱を焼いた mesh の part。
// コマ1つが動作（action）の1時点：人物の位置・向き・姿勢とカメラをその時点に key し、カメラから見た絵を書き出す。
// 座標：部屋の地図と同じ m（x は東、y は南）を mm にし、3D では y を北向きに取る（R()）。
import { boxMesh, encodeEpm, epmSha256, type EpmMesh } from '@editor-platform/geometry-mesh';
import {
  axisAngleQuat,
  characterAssetMediaTypes,
  emptyCharacter,
  identityTransform,
  multiplyQuat,
  type CharacterDocument,
  type CharacterTrack,
  type Quat,
} from '@editor-platform/character-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { addBoxFigure, inverseQuat, rotateVec, rotationBetween, type BoxBodyPlan, type PlacedFigure } from '../../scripts/fixtures/gulliver-people';
import { create, expect, nativeArtifact, test } from '../e2e/fixtures';

type V3 = [number, number, number];
const OUT = process.env.STAGE_OUT ?? '/tmp/claude-0/gudaguda-stage';
const ONLY = process.env.STAGE_SETS?.split(',');
const TPS = 240_000;
const STEP = TPS / 2;
const hold = { type: 'hold' } as const;
const deg = Math.PI / 180;
/** 部屋の地図の座標（m、x 東・y 南・z 上）を 3D の mm（y 北）へ。 */
const R = (x: number, y: number, z = 0): V3 => [Math.round(x * 1000), Math.round(-y * 1000), Math.round(z * 1000)];
/** 向き：facing 0 は北（+y）。向く先の点から求める。 */
const face = (from: [number, number], to: [number, number]) => Math.atan2(-(to[0] - from[0]), -(to[1] - from[1]));
const N = 0, W = Math.PI / 2, S = Math.PI, E = -Math.PI / 2;

// ---------------------------------------------------------------- 4頭身の体（高さ H に対する割合。正面 +y、左 −x）
type Slot = 'top' | 'bottom' | 'legs' | 'shoes' | 'skin' | 'hair' | 'tie' | 'eye';
const SLOTS: Slot[] = ['top', 'bottom', 'legs', 'shoes', 'skin', 'hair', 'tie', 'eye'];
type Hair = 'bob' | 'twin' | 'long' | 'fringe' | 'messy';
type Side = 'L' | 'R';
const JOINTS: [string, string | null, V3][] = [
  ['hip', null, [0, 0, 0.38]],
  ['spine', 'hip', [0, 0, 0.44]],
  ['head', 'spine', [0, 0, 0.72]],
  ...(['L', 'R'] as Side[]).flatMap((s): [string, string | null, V3][] => {
    const x = s === 'L' ? -1 : 1;
    return [
      [`arm.${s}`, 'spine', [0.125 * x, 0, 0.68]],
      [`forearm.${s}`, `arm.${s}`, [0.135 * x, 0, 0.56]],
      [`hand.${s}`, `forearm.${s}`, [0.14 * x, 0, 0.45]],
      [`thigh.${s}`, 'hip', [0.06 * x, 0, 0.37]],
      [`shin.${s}`, `thigh.${s}`, [0.06 * x, 0, 0.2]],
      [`foot.${s}`, `shin.${s}`, [0.06 * x, 0, 0.035]],
    ];
  }),
];
function plan(hair: Hair, opts: { skirt: boolean; slim?: number }): BoxBodyPlan<Slot> {
  const k = opts.slim ?? 1;
  const boxes: [string, V3, V3, Slot][] = [
    ['hip', [0.21 * k, 0.15, 0.1], [0, 0, 0.4], 'bottom'],
    ['spine', [0.235 * k, 0.15, 0.25], [0, 0, 0.58], 'top'],
    ['spine', [0.04, 0.012, 0.09], [0, 0.077, 0.63], 'tie'],
    ['head', [0.05, 0.05, 0.04], [0, 0, 0.735], 'skin'],
    ['head', [0.22, 0.2, 0.21], [0, 0.005, 0.855], 'skin'],
    ['head', [0.235, 0.215, 0.07], [0, -0.004, 0.955], 'hair'],
    ['head', [0.235, 0.06, 0.2], [0, -0.085, 0.86], 'hair'],
    ['head', [0.035, 0.012, 0.045], [-0.05, 0.108, 0.86], 'eye'],
    ['head', [0.035, 0.012, 0.045], [0.05, 0.108, 0.86], 'eye'],
    ['head', [0.05, 0.012, 0.012], [0, 0.108, 0.795], 'eye'],
    ...(['L', 'R'] as Side[]).flatMap((s): [string, V3, V3, Slot][] => {
      const x = s === 'L' ? -1 : 1;
      return [
        [`arm.${s}`, [0.055, 0.06, 0.13], [0.13 * x, 0, 0.62], 'top'],
        [`forearm.${s}`, [0.05, 0.055, 0.12], [0.137 * x, 0, 0.5], 'top'],
        [`hand.${s}`, [0.04, 0.05, 0.05], [0.14 * x, 0, 0.425], 'skin'],
        [`thigh.${s}`, [0.075, 0.08, 0.17], [0.06 * x, 0, 0.285], opts.skirt ? 'legs' : 'bottom'],
        [`shin.${s}`, [0.06, 0.065, 0.17], [0.06 * x, 0, 0.12], opts.skirt ? 'legs' : 'bottom'],
        [`foot.${s}`, [0.06, 0.11, 0.035], [0.06 * x, 0.025, 0.0175], 'shoes'],
      ];
    }),
  ];
  if (opts.skirt) boxes.push(['hip', [0.25 * k, 0.19, 0.11], [0, 0, 0.32], 'bottom']);
  if (hair === 'bob') boxes.push(['head', [0.27, 0.2, 0.13], [0, -0.01, 0.8], 'hair'], ['head', [0.015, 0.015, 0.07], [0.01, 0, 1.02], 'hair']);
  if (hair === 'twin') boxes.push(['head', [0.09, 0.08, 0.24], [-0.17, -0.03, 0.86], 'hair'], ['head', [0.09, 0.08, 0.24], [0.17, -0.03, 0.86], 'hair'], ['head', [0.22, 0.02, 0.05], [0, 0.105, 0.92], 'hair']);
  if (hair === 'long') boxes.push(['head', [0.25, 0.05, 0.42], [0, -0.1, 0.7], 'hair'], ['head', [0.22, 0.02, 0.04], [0, 0.105, 0.925], 'hair']);
  if (hair === 'fringe') boxes.push(['head', [0.23, 0.025, 0.1], [0, 0.11, 0.885], 'hair']);
  if (hair === 'messy') boxes.push(['head', [0.05, 0.05, 0.05], [-0.08, 0.02, 0.99], 'hair'], ['head', [0.05, 0.05, 0.05], [0.09, -0.05, 0.99], 'hair']);
  return { joints: JOINTS, boxes, slots: SLOTS, roughness: () => 0.85 };
}

// ---------------------------------------------------------------- 姿勢（体の向きの枠で骨の向きを書く）
type Pose =
  | 'stand' | 'walk' | 'slump' | 'hand-up' | 'point-up' | 'fist-up' | 'hold-front' | 'reach' | 'wave' | 'look-back'
  | 'lean-desk' | 'chair' | 'chair-hands' | 'chair-paper'
  | 'kotatsu' | 'kotatsu-chin' | 'kotatsu-point' | 'kotatsu-drink' | 'kotatsu-pour' | 'kotatsu-hug' | 'kotatsu-raise'
  | 'seiza' | 'seiza-lean' | 'seiza-point' | 'seiza-offer' | 'seiza-drink' | 'seiza-slump' | 'seiza-reach';
type PoseDef = { hip: number | ((H: number) => number); spine?: number; head?: Quat; dirs?: Partial<Record<string, V3>> };
const sitFloor = (H: number) => 0.06 * H + 60; // 座布団の上
const sitChair = (_H: number) => 470;
const KOTATSU_LEGS = { 'thigh.L': [-0.1, 1, 0.05] as V3, 'thigh.R': [0.1, 1, 0.05] as V3, 'shin.L': [-0.05, 1, -0.1] as V3, 'shin.R': [0.05, 1, -0.1] as V3 };
const SEIZA_LEGS = { 'thigh.L': [-0.12, 1, -0.05] as V3, 'thigh.R': [0.12, 1, -0.05] as V3, 'shin.L': [0, -1, -0.05] as V3, 'shin.R': [0, -1, -0.05] as V3 };
const CHAIR_LEGS = { 'thigh.L': [-0.08, 1, 0] as V3, 'thigh.R': [0.08, 1, 0] as V3, 'shin.L': [0, 0.1, -1] as V3, 'shin.R': [0, 0.1, -1] as V3 };
const ARMS_TABLE = { 'arm.L': [-0.15, 0.7, -0.6] as V3, 'arm.R': [0.15, 0.7, -0.6] as V3, 'forearm.L': [0.4, 1, 0] as V3, 'forearm.R': [-0.4, 1, 0] as V3 };
const ARMS_CUP = { 'arm.L': [-0.1, 0.5, -0.8] as V3, 'arm.R': [0.1, 0.5, -0.8] as V3, 'forearm.L': [0.45, 0.6, 0.65] as V3, 'forearm.R': [-0.45, 0.6, 0.65] as V3 };
const POSES: Record<Pose, PoseDef> = {
  stand: { hip: 0.38 },
  walk: { hip: 0.375, dirs: { 'thigh.L': [0, 0.35, -1], 'thigh.R': [0, -0.3, -1], 'arm.L': [0, -0.3, -1], 'arm.R': [0, 0.3, -1] } },
  slump: { hip: 0.375, spine: 12, head: axisAngleQuat([1, 0, 0], -0.25), dirs: { 'arm.L': [-0.1, 0.1, -1], 'arm.R': [0.1, 0.1, -1] } },
  'hand-up': { hip: 0.38, dirs: { 'arm.R': [0.3, 0.6, -0.3], 'forearm.R': [0.1, 0.4, 1] } },
  'point-up': { hip: 0.38, spine: -6, dirs: { 'arm.R': [0.25, 0.7, 0.2], 'forearm.R': [0, 0.2, 1], 'arm.L': [-0.3, 0, -1] } },
  'fist-up': { hip: 0.37, spine: 15, dirs: { 'arm.R': [0.3, 0.5, 0.8], 'forearm.R': [0, 0.3, 1], 'arm.L': [-0.2, 0.4, -0.8], 'forearm.L': [0.3, 1, 0.2] } },
  'hold-front': { hip: 0.38, dirs: { 'arm.L': [-0.1, 0.4, -0.9], 'arm.R': [0.1, 0.4, -0.9], 'forearm.L': [0.5, 0.8, 0.4], 'forearm.R': [-0.5, 0.8, 0.4] } },
  reach: { hip: 0.38, spine: 8, dirs: { 'arm.R': [0.2, 1, -0.1], 'forearm.R': [0, 1, 0], 'arm.L': [-0.1, 0.4, -0.9], 'forearm.L': [0.5, 0.8, 0.4] } },
  wave: { hip: 0.38, dirs: { 'arm.R': [0.7, 0.2, 0.5], 'forearm.R': [0.3, 0, 1] } },
  'look-back': { hip: 0.38, head: axisAngleQuat([0, 0, 1], 1.4), dirs: { 'arm.L': [-0.1, 0, -1], 'arm.R': [0.1, 0, -1] } },
  'lean-desk': { hip: 0.38, spine: 28, head: axisAngleQuat([1, 0, 0], 0.3), dirs: { 'arm.L': [-0.25, 0.75, -0.6], 'arm.R': [0.25, 0.75, -0.6], 'forearm.L': [0, 0.3, -1], 'forearm.R': [0, 0.3, -1] } },
  chair: { hip: sitChair, dirs: { ...CHAIR_LEGS, 'arm.L': [-0.1, 0.3, -1], 'arm.R': [0.1, 0.3, -1], 'forearm.L': [0.1, 1, 0], 'forearm.R': [-0.1, 1, 0] } },
  'chair-hands': { hip: sitChair, spine: 10, dirs: { ...CHAIR_LEGS, 'arm.L': [-0.2, 0.8, -0.45], 'arm.R': [0.2, 0.8, -0.45], 'forearm.L': [0.6, 0.4, 0.7], 'forearm.R': [-0.6, 0.4, 0.7] } },
  'chair-paper': { hip: sitChair, dirs: { ...CHAIR_LEGS, 'arm.R': [0.2, 0.6, -0.5], 'forearm.R': [0, 0.6, 0.8], 'arm.L': [-0.15, 0.7, -0.6], 'forearm.L': [0.3, 1, 0] } },
  kotatsu: { hip: sitFloor, dirs: { ...KOTATSU_LEGS, ...ARMS_TABLE } },
  'kotatsu-chin': { hip: sitFloor, spine: 38, head: axisAngleQuat([1, 0, 0], 0.45), dirs: { ...KOTATSU_LEGS, 'arm.L': [-0.3, 1, -0.25], 'arm.R': [0.3, 1, -0.25], 'forearm.L': [0.8, 0.6, 0], 'forearm.R': [-0.8, 0.6, 0] } },
  'kotatsu-point': { hip: sitFloor, spine: -5, dirs: { ...KOTATSU_LEGS, 'arm.R': [0.25, 0.7, 0.2], 'forearm.R': [0, 0.2, 1], 'arm.L': [-0.15, 0.7, -0.6], 'forearm.L': [0.4, 1, 0] } },
  'kotatsu-drink': { hip: sitFloor, spine: 10, head: axisAngleQuat([1, 0, 0], 0.2), dirs: { ...KOTATSU_LEGS, ...ARMS_CUP } },
  'kotatsu-pour': { hip: sitFloor, spine: 15, dirs: { ...KOTATSU_LEGS, 'arm.R': [0.2, 0.8, -0.3], 'forearm.R': [-0.2, 1, 0.1], 'arm.L': [-0.1, 0.8, -0.3], 'forearm.L': [0.3, 1, 0.3] } },
  'kotatsu-hug': { hip: sitFloor, spine: 22, head: axisAngleQuat([1, 0, 0], 0.15), dirs: { 'thigh.L': [-0.1, 0.8, 0.6], 'thigh.R': [0.1, 0.8, 0.6], 'shin.L': [0, 0.1, -1], 'shin.R': [0, 0.1, -1], 'arm.L': [-0.1, 0.9, -0.2], 'arm.R': [0.1, 0.9, -0.2], 'forearm.L': [0.7, 0.7, 0], 'forearm.R': [-0.7, 0.7, 0] } },
  'kotatsu-raise': { hip: sitFloor, spine: 20, dirs: { 'thigh.L': [-0.1, 0.8, 0.6], 'thigh.R': [0.1, 0.8, 0.6], 'shin.L': [0, 0.1, -1], 'shin.R': [0, 0.1, -1], 'arm.R': [0.6, 0.3, 0.2], 'forearm.R': [0.1, 0, 1], 'arm.L': [-0.1, 0.9, -0.2], 'forearm.L': [0.7, 0.7, 0] } },
  seiza: { hip: (H) => 0.16 * H + 60, dirs: { ...SEIZA_LEGS, 'arm.L': [-0.1, 0.3, -1], 'arm.R': [0.1, 0.3, -1], 'forearm.L': [0.1, 1, -0.2], 'forearm.R': [-0.1, 1, -0.2] } },
  'seiza-lean': { hip: (H) => 0.16 * H + 60, spine: 25, dirs: { ...SEIZA_LEGS, 'arm.L': [-0.15, 0.9, -0.4], 'arm.R': [0.15, 0.9, -0.4], 'forearm.L': [0.2, 1, -0.3], 'forearm.R': [-0.2, 1, -0.3] } },
  'seiza-point': { hip: (H) => 0.16 * H + 60, spine: 20, dirs: { ...SEIZA_LEGS, 'arm.R': [0.1, 1, 0.15], 'forearm.R': [0, 1, 0.1], 'arm.L': [-0.15, 0.7, -0.6], 'forearm.L': [0.4, 1, 0] } },
  'seiza-offer': { hip: (H) => 0.16 * H + 60, spine: 12, dirs: { ...SEIZA_LEGS, 'arm.L': [-0.1, 0.9, -0.3], 'arm.R': [0.1, 0.9, -0.3], 'forearm.L': [0.15, 1, 0.1], 'forearm.R': [-0.15, 1, 0.1] } },
  'seiza-drink': { hip: (H) => 0.16 * H + 60, spine: 5, dirs: { ...SEIZA_LEGS, ...ARMS_CUP } },
  'seiza-slump': { hip: (H) => 0.15 * H + 60, spine: 15, head: axisAngleQuat([1, 0, 0], 0.35), dirs: { ...SEIZA_LEGS, 'arm.R': [0.3, 0.6, 0.2], 'forearm.R': [-0.3, 0.2, 1], 'arm.L': [-0.1, 0.3, -1], 'forearm.L': [0.2, 1, -0.2] } },
  'seiza-reach': { hip: (H) => 0.2 * H + 60, spine: 25, dirs: { 'thigh.L': [-0.12, 1, -0.05], 'shin.L': [0, -1, -0.05], 'thigh.R': [0.12, 0.6, 0.6], 'shin.R': [0, 0.1, -1], 'arm.R': [0.1, 1, -0.2], 'forearm.R': [0, 1, 0], 'arm.L': [-0.1, 0.5, -0.8], 'forearm.L': [0.2, 1, 0] } },
};
const PARENT: Record<string, string> = { 'forearm.L': 'arm.L', 'forearm.R': 'arm.R', 'shin.L': 'thigh.L', 'shin.R': 'thigh.R', 'arm.L': 'spine', 'arm.R': 'spine' };
const LIMBS = ['arm.L', 'arm.R', 'forearm.L', 'forearm.R', 'thigh.L', 'thigh.R', 'shin.L', 'shin.R'];
const norm = (v: V3): V3 => {
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
};
function poseRotations(pose: Pose) {
  const p = POSES[pose];
  const spine = axisAngleQuat([1, 0, 0], -(p.spine ?? 0) * deg);
  const world = new Map<string, Quat>([['spine', spine]]);
  const local: Record<string, Quat> = { spine, head: p.head ?? [0, 0, 0, 1] };
  for (const b of LIMBS) {
    const d = p.dirs?.[b];
    const parentWorld = PARENT[b] ? (world.get(PARENT[b]!) ?? [0, 0, 0, 1]) : ([0, 0, 0, 1] as Quat);
    if (!d) {
      local[b] = [0, 0, 0, 1];
      world.set(b, parentWorld);
      continue;
    }
    const q = rotationBetween([0, 0, -1], rotateVec(inverseQuat(parentWorld), norm(d)) as V3);
    local[b] = q;
    world.set(b, multiplyQuat(parentWorld, q));
  }
  return local;
}

// ---------------------------------------------------------------- 人物（人物表 CH-01〜05、変えない外見）
type Who = 'CH-01' | 'CH-02' | 'CH-03' | 'CH-04' | 'CH-05';
type Actor = { id: string; who: Who; name: string; height: number; hair: Hair; skirt: boolean; slim?: number; colors: Record<Slot, string> };
const uniform = (hair: string, extra: Partial<Record<Slot, string>> = {}): Record<Slot, string> => ({ top: '#3b4660', bottom: '#5d6273', legs: '#e9d6c4', shoes: '#4a3a30', skin: '#f2d9c4', hair, tie: '#b0485a', eye: '#2a2a2a', ...extra });
/** 頭の高さの目安（人物表）×4 を背にする。頭 100 = 380 mm。 */
const ACTORS: Actor[] = [
  { id: 'nemu', who: 'CH-01', name: '朝比奈ねむ', height: 1520, hair: 'bob', skirt: true, colors: uniform('#1c1c1c') },
  { id: 'suzu', who: 'CH-02', name: '小鳥遊すず', height: 1370, hair: 'twin', skirt: true, slim: 0.92, colors: uniform('#1c1c1c') },
  { id: 'takeshi', who: 'CH-03', name: '権田原たけし', height: 1750, hair: 'fringe', skirt: false, slim: 0.82, colors: uniform('#6a6a6a', { bottom: '#3b4660', tie: '#2f3a52' }) },
  { id: 'reika', who: 'CH-04', name: '西園寺れいか', height: 1640, hair: 'long', skirt: true, slim: 1.05, colors: uniform('#111111') },
  { id: 'tanahashi', who: 'CH-05', name: '棚橋先生', height: 1600, hair: 'messy', skirt: false, slim: 1.12, colors: uniform('#2a2a2a', { top: '#e6e6e0', bottom: '#4b4b4b', legs: '#4b4b4b', shoes: '#7b6a55', tie: '#6b6f8c' }) },
];

// ---------------------------------------------------------------- 部屋（箱の一覧を1つの mesh に焼く）
type Box = { name: string; color: string; c: V3; s: V3 }; // c: 中心（mm、3D）、s: 大きさ（mm）
/** 地図の座標（m）の範囲 x0..x1・y0..y1・z0..z1 の箱。 */
const B = (name: string, color: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Box => ({
  name, color, c: R((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), s: [Math.abs(x1 - x0) * 1000, Math.abs(y1 - y0) * 1000, Math.abs(z1 - z0) * 1000],
});
const WALL = '#e8e4da', FLOOR = '#b9a27f', CEIL = '#f2f0ea', GLASS = '#cfe3ee', FRAME = '#8d8f93', WOOD = '#9a7650', STEEL = '#9aa1a8', DESK = '#c9b48f', CHAIR = '#6d6f75';
/** 窓のある壁：開口の外は壁、開口にガラスと枠。 */
function wallWithWindows(axis: 'x' | 'y', at: number, from: number, to: number, holes: [number, number][], opts: { sill: number; top: number; h: number; t?: number; door?: [number, number][] }) {
  const t = opts.t ?? 0.15, out: Box[] = [];
  const seg = (a: number, b: number, z0: number, z1: number, color = WALL, name = '壁') =>
    out.push(axis === 'x' ? B(name, color, a, b, at - t / 2, at + t / 2, z0, z1) : B(name, color, at - t / 2, at + t / 2, a, b, z0, z1));
  const cuts = [...holes.map(([a, b]) => ({ a, b, z0: opts.sill, z1: opts.top, glass: true })), ...(opts.door ?? []).map(([a, b]) => ({ a, b, z0: 0, z1: 2.1, glass: false }))].sort((p, q) => p.a - q.a);
  let x = from;
  for (const c of cuts) {
    if (c.a > x) seg(x, c.a, 0, opts.h);
    seg(c.a, c.b, c.z1, opts.h);
    if (c.z0 > 0) seg(c.a, c.b, 0, c.z0);
    if (c.glass) {
      out.push(axis === 'x' ? B('窓ガラス', GLASS, c.a, c.b, at - 0.01, at + 0.01, c.z0, c.z1) : B('窓ガラス', GLASS, at - 0.01, at + 0.01, c.a, c.b, c.z0, c.z1));
      const mid = (c.a + c.b) / 2;
      out.push(axis === 'x' ? B('窓枠', FRAME, mid - 0.03, mid + 0.03, at - 0.04, at + 0.04, c.z0, c.z1) : B('窓枠', FRAME, at - 0.04, at + 0.04, mid - 0.03, mid + 0.03, c.z0, c.z1));
    }
    x = c.b;
  }
  if (x < to) seg(x, to, 0, opts.h);
  return out;
}
const H_ROOM = 3.0;
/** LO-03 生徒会室（新校舎2階の西端の角部屋。東西8m×南北6m。戸口は北壁の東寄り、窓は西と南）。 */
function councilRoom(): Box[] {
  const b: Box[] = [
    B('床', FLOOR, 0, 8, 0, 6, -0.05, 0),
    B('天井', CEIL, 0, 8, 0, 6, H_ROOM, H_ROOM + 0.05),
    ...wallWithWindows('x', 0, 0, 8, [], { sill: 0.9, top: 2.4, h: H_ROOM, door: [[6.5, 7.5]] }),
    ...wallWithWindows('x', 6, 0, 8, [[1.0, 3.4], [4.2, 6.8]], { sill: 0.9, top: 2.4, h: H_ROOM }),
    ...wallWithWindows('y', 0, 0, 6, [[1.2, 4.8]], { sill: 0.9, top: 2.4, h: H_ROOM }),
    ...wallWithWindows('y', 8, 0, 6, [], { sill: 0.9, top: 2.4, h: H_ROOM }),
    // コの字の会議机（開きは東、戸口の側）
    B('会議机（西・会長席）', DESK, 1.3, 1.9, 1.5, 4.5, 0.68, 0.72),
    B('会議机（北）', DESK, 1.9, 5.2, 1.2, 1.8, 0.68, 0.72),
    B('会議机（南）', DESK, 1.9, 5.2, 4.2, 4.8, 0.68, 0.72),
    ...[[1.35, 1.55], [1.35, 4.45], [5.15, 1.25], [5.15, 4.75], [1.85, 1.25], [1.85, 4.75]].map(([x, y]) => B('机の脚', STEEL, x! - 0.02, x! + 0.02, y! - 0.02, y! + 0.02, 0, 0.68)),
    B('会長の椅子', CHAIR, 0.55, 1.05, 2.75, 3.25, 0.4, 0.46), B('会長の椅子の背', CHAIR, 0.5, 0.56, 2.75, 3.25, 0.46, 1.0),
    ...[2.4, 3.4, 4.4].flatMap((x) => [B('椅子', CHAIR, x - 0.22, x + 0.22, 0.7, 1.1, 0.4, 0.45), B('椅子', CHAIR, x - 0.22, x + 0.22, 4.9, 5.3, 0.4, 0.45)]),
    // 壁際の棚（部活の書類のファイル）
    B('書類棚', STEEL, 2.0, 5.6, 0.08, 0.45, 0, 1.8),
    ...[0.4, 0.95, 1.5].map((z) => B('ファイル', '#5c7090', 2.1, 5.5, 0.12, 0.42, z, z + 0.3)),
    B('ホワイトボード', '#f7f7f5', 7.88, 7.95, 1.5, 4.5, 0.9, 2.1),
    B('机の上の書類', '#fbfbf8', 1.45, 1.75, 2.85, 3.15, 0.72, 0.73),
    // 戸口の外の廊下（戸の向こうが抜けないように）
    B('廊下の床', '#a8a39a', 4.0, 10.0, -2.5, 0, -0.05, 0), B('廊下の壁', WALL, 4.0, 10.0, -2.6, -2.5, 0, H_ROOM),
  ];
  return b;
}
/** LO-01 部室（旧校舎3階・元理科準備室。東西8m×南北6m。戸口は北壁の西寄り、窓は南に2枚）と LO-02 廊下。 */
function clubRoom(): Box[] {
  const kx = 4.0, ky = 3.0;
  return [
    B('床', FLOOR, 0, 8, 0, 6, -0.05, 0),
    B('天井', CEIL, -30, 40, -2.6, 6, H_ROOM, H_ROOM + 0.05),
    ...wallWithWindows('x', 0, -30, 40, [], { sill: 0.9, top: 2.4, h: H_ROOM, door: [[0.6, 1.8], [-6.6, -5.4], [-14.6, -13.4], [10.4, 11.6], [18.4, 19.6], [26.4, 27.6]] }),
    ...wallWithWindows('x', 6, 0, 8, [[0.8, 2.6], [5.4, 7.2]], { sill: 0.9, top: 2.4, h: H_ROOM }),
    ...wallWithWindows('y', 0, 0, 6, [], { sill: 0.9, top: 2.4, h: H_ROOM }),
    ...wallWithWindows('y', 8, 0, 6, [], { sill: 0.9, top: 2.4, h: H_ROOM }),
    // 引き戸（細く開けた）
    B('引き戸', '#b8a17d', 1.65, 2.85, -0.06, -0.02, 0, 2.05),
    B('貼り紙「生徒会室。すぐ戻る（たぶん）」', '#fffdf2', 2.0, 2.35, -0.075, -0.065, 1.2, 1.45),
    // こたつ（中央、四辺に座布団）
    B('こたつ布団', '#c9b9a0', kx - 0.8, kx + 0.8, ky - 0.8, ky + 0.8, 0.0, 0.36),
    B('こたつの天板', '#a07c52', kx - 0.45, kx + 0.45, ky - 0.45, ky + 0.45, 0.36, 0.4),
    ...[[kx, ky - 1.0], [kx, ky + 1.0], [kx + 1.25, ky], [kx - 1.0, ky]].map(([x, y]) => B('座布団', '#8a6d7a', x! - 0.27, x! + 0.27, y! - 0.27, y! + 0.27, 0, 0.06)),
    B('盆', '#6b4a2e', kx - 0.15, kx + 0.15, ky - 0.1, ky + 0.1, 0.4, 0.415),
    B('急須', '#5b6f63', kx - 0.05, kx + 0.05, ky - 0.05, ky + 0.05, 0.415, 0.5),
    // 西壁の流し台、東壁のスチール棚、北壁の掲示（申請書と廃部の通知）
    B('流し台', '#c8cdd2', 0.08, 0.7, 2.0, 4.0, 0, 0.85), B('流し台の水栓', STEEL, 0.1, 0.18, 2.95, 3.05, 0.85, 1.15),
    B('スチール棚', STEEL, 7.45, 7.9, 1.6, 4.4, 0, 1.8),
    ...[0.45, 0.9, 1.35].map((z) => B('棚の段', '#7d858d', 7.45, 7.9, 1.6, 4.4, z, z + 0.03)),
    ...[0.5, 0.95].map((z) => B('棚の箱', '#b5a88f', 7.5, 7.85, 1.8, 4.2, z, z + 0.3)),
    B('掲示板', '#9b7b55', 2.1, 3.3, 0.075, 0.1, 1.0, 1.8),
    B('部活申請書', '#fbfbf8', 2.2, 2.65, 0.06, 0.075, 1.15, 1.7), B('廃部の通知', '#fff3f0', 2.75, 3.2, 0.06, 0.075, 1.15, 1.7),
    // 廊下（北に窓、南は部室の並び）
    B('廊下の床', '#a8a39a', -30, 40, -2.6, 0, -0.05, 0),
    ...wallWithWindows('x', -2.6, -30, 40, [[-28, -24], [-22, -18], [-16, -12], [-10, -6], [-4, 0], [2, 6], [8, 12], [14, 18], [20, 24], [26, 30], [32, 36]], { sill: 0.9, top: 2.4, h: H_ROOM }),
    B('廊下の東の突き当たり', WALL, 39.9, 40, -2.6, 0, 0, H_ROOM), B('廊下の西の突き当たり', WALL, -30, -29.9, -2.6, 0, 0, H_ROOM),
    // となりの部屋（廊下の南の壁の向こうを閉じる）
    B('となりの部屋の床', '#bdb6a8', -30, 0, 0, 6, -0.05, 0), B('となりの部屋の床', '#bdb6a8', 8, 40, 0, 6, -0.05, 0),
  ];
}

// ---------------------------------------------------------------- コマ（人物の位置・向き・姿勢とカメラ）
type Place = { fig: string; at: V3; facing: number; pose: Pose };
type Shot = { panel: string; cam: V3; look: V3; places: Place[]; cups?: number; note?: string };
type SetDef = { id: string; name: string; scenes: string[]; place: string; boxes: () => Box[]; shots: Shot[] };
const nemu = (x: number, y: number, facing: number, pose: Pose): Place => ({ fig: 'nemu', at: R(x, y), facing, pose });
const suzu = (x: number, y: number, facing: number, pose: Pose): Place => ({ fig: 'suzu', at: R(x, y), facing, pose });
const takeshi = (x: number, y: number, facing: number, pose: Pose): Place => ({ fig: 'takeshi', at: R(x, y), facing, pose });
const reika = (x: number, y: number, facing: number, pose: Pose): Place => ({ fig: 'reika', at: R(x, y), facing, pose });
const tana = (x: number, y: number, facing: number, pose: Pose): Place => ({ fig: 'tanahashi', at: R(x, y), facing, pose });
// こたつの四辺（北・南・東・西）。座る人物の足の付け根の真下。
const KN: [number, number] = [4.0, 2.0], KS: [number, number] = [4.0, 4.05], KE: [number, number] = [5.25, 3.0];
const SETS: SetDef[] = [
  {
    id: 'council', name: '生徒会室', scenes: ['SC-001'], place: 'LO-03', boxes: councilRoom,
    shots: [
      { panel: 'PN-001', cam: R(7.6, 0.35, 1.5), look: R(1.0, 3.0, 1.0), places: [reika(0.8, 3.0, E, 'chair-hands'), nemu(5.7, 1.5, face([5.7, 1.5], [0.8, 3.0]), 'slump')] },
      { panel: 'PN-002', cam: R(3.3, 3.0, 0.8), look: R(0.8, 3.0, 1.15), places: [reika(0.8, 3.0, E, 'chair-paper')] },
      { panel: 'PN-003', cam: R(1.5, 2.0, 1.4), look: R(4.0, 3.0, 1.15), places: [nemu(4.0, 3.0, W, 'hand-up'), reika(0.8, 3.0, E, 'chair-paper')] },
      { panel: 'PN-004', cam: R(4.2, 3.0, 0.8), look: R(0.8, 3.0, 1.3), places: [reika(1.0, 3.0, E, 'lean-desk')] },
      { panel: 'PN-005', cam: R(2.35, 0.25, 1.35), look: R(2.3, 3.0, 1.0), places: [nemu(3.7, 3.0, W, 'point-up'), reika(0.8, 3.0, E, 'chair')] },
      { panel: 'PN-006', cam: R(7.7, 0.3, 1.5), look: R(1.0, 3.0, 1.0), places: [nemu(6.2, 1.2, face([6.2, 1.2], [7.0, 0.0]), 'look-back'), reika(0.8, 3.0, E, 'chair')] },
      { panel: 'PN-007', cam: R(1.95, 3.0, 1.38), look: R(0.8, 3.0, 1.38), places: [reika(0.8, 3.0, E, 'hold-front')] },
      { panel: 'PN-008', cam: R(2.6, 3.0, 1.0), look: R(0.8, 3.0, 1.05), places: [reika(0.8, 3.0, E, 'chair-hands')] },
    ],
  },
  {
    id: 'club', name: '部室と旧校舎3階の廊下', scenes: ['SC-002', 'SC-003', 'SC-004', 'SC-005'], place: 'LO-01・LO-02', boxes: clubRoom,
    shots: [
      { panel: 'PN-009', cam: R(2.45, -0.95, 1.35), look: R(2.15, -0.07, 1.3), places: [suzu(1.3, -0.45, face([1.3, -0.45], [2.2, 0]), 'reach')], note: '貼り紙の寄り。すずの手が戸に掛かる' },
      { panel: 'PN-010', cam: R(2.7, -0.55, 1.25), look: R(1.2, -0.4, 0.95), places: [suzu(1.1, -0.5, S, 'reach')], note: '戸口の東から、戸を引くすずを横から' },
      { panel: 'PN-011', cam: R(-1.1, -1.65, 1.65), look: R(4.6, 3.0, 0.5), places: [suzu(1.45, -0.35, S, 'reach'), takeshi(KE[0], KE[1], W, 'kotatsu-hug')], note: '戸口の外、すずの肩ごしに部屋へ' },
      { panel: 'PN-012', cam: R(1.25, -0.05, 1.05), look: R(1.2, -1.0, 1.1), places: [suzu(1.2, -1.0, S, 'fist-up')], note: '崩し顔の寄り：戸の前から廊下側へ振り返る形で撮る（すずが戸に向いたままでは顔が写らないため、すずを戸口の北1mに置いた）' },
      { panel: 'PN-013', cam: R(1.6, -0.15, 1.1), look: R(1.2, -1.0, 0.95), places: [suzu(1.2, -1.0, S, 'hold-front')] },
      { panel: 'PN-014', cam: R(-2.5, -1.9, 1.35), look: R(2.0, -1.2, 0.95), places: [suzu(1.2, -0.8, face([1.2, -0.8], [3.0, -1.6]), 'hold-front'), tana(3.0, -1.6, W, 'walk')], note: '廊下の西から。歩いてくる先生の正面と、すずの背中' },
      { panel: 'PN-015', cam: R(3.6, -0.3, 1.25), look: R(1.6, -1.2, 0.95), places: [suzu(1.2, -1.0, E, 'fist-up'), tana(2.2, -1.5, E, 'wave')] },
      { panel: 'PN-016', cam: R(-6.0, -2.3, 1.5), look: R(8.0, -1.0, 1.0), places: [suzu(1.2, -1.0, E, 'reach'), tana(11.2, -1.4, E, 'walk')] },
      { panel: 'PN-017', cam: R(1.7, -0.1, 1.05), look: R(1.2, -1.0, 1.15), places: [suzu(1.2, -1.0, S, 'hold-front')] },
      { panel: 'PN-018', cam: R(-1.1, -1.65, 1.65), look: R(4.8, 3.0, 0.5), places: [suzu(1.5, -0.4, N, 'hold-front'), takeshi(KE[0], KE[1], W, 'kotatsu-raise')], note: '戸口の外から、すずの背中と戸の奥のたけし' },
      { panel: 'PN-019', cam: R(3.2, -2.2, 1.3), look: R(0.8, -0.6, 1.0), places: [nemu(1.1, -0.35, face([1.1, -0.35], [0.6, -1.6]), 'wave'), suzu(0.4, -0.95, E, 'hold-front')], note: 'ねむが戸口から顔を出す。廊下の東から' },
      { panel: 'PN-020', cam: R(1.0, 5.6, 1.15), look: R(4.0, 3.0, 0.55), places: [suzu(KS[0], KS[1], N, 'seiza-offer'), nemu(KN[0], KN[1], S, 'kotatsu-chin'), takeshi(KE[0], KE[1], W, 'kotatsu-hug')] },
      { panel: 'PN-021', cam: R(1.0, 4.4, 1.2), look: R(3.3, 1.4, 0.9), places: [suzu(2.7, 0.8, face([2.7, 0.8], [3.0, 0.0]), 'point-up'), nemu(KN[0], KN[1], S, 'kotatsu-chin')], note: '貼り紙の前のすずと、こたつのねむ。南西から' },
      { panel: 'PN-022', cam: R(1.0, 3.0, 1.0), look: R(4.0, 3.6, 0.6), places: [suzu(KS[0], KS[1], N, 'seiza-lean'), nemu(KN[0], KN[1], S, 'kotatsu-chin'), takeshi(KE[0], KE[1], W, 'kotatsu-hug')] },
      { panel: 'PN-023', cam: R(1.0, 3.0, 1.0), look: R(4.3, 3.0, 0.6), places: [nemu(KN[0], KN[1], S, 'kotatsu-point'), suzu(KS[0], KS[1], N, 'seiza'), takeshi(KE[0], KE[1], W, 'kotatsu-hug')] },
      { panel: 'PN-024', cam: R(4.0, 2.7, 0.95), look: R(4.0, 4.05, 0.8), places: [suzu(KS[0], KS[1], N, 'seiza-point'), nemu(KN[0], KN[1], S, 'kotatsu-chin')], note: 'すずの崩し顔の寄り。ねむの頭の上から' },
      { panel: 'PN-025', cam: R(1.0, 3.0, 1.0), look: R(4.0, 3.0, 0.55), places: [nemu(KN[0], KN[1], S, 'kotatsu-chin'), suzu(KS[0], KS[1], N, 'seiza'), takeshi(KE[0], KE[1], W, 'kotatsu-hug')] },
      { panel: 'PN-026', cam: R(0.4, 0.4, 2.2), look: R(4.6, 3.3, 0.4), places: [nemu(KN[0], KN[1], S, 'kotatsu-chin'), suzu(KS[0], KS[1], N, 'seiza'), takeshi(KE[0], KE[1], W, 'kotatsu-raise')], note: '部室の大きな引き。北西の角の上から' },
      { panel: 'PN-027', cam: R(4.0, 2.75, 0.95), look: R(4.0, 4.05, 0.75), places: [suzu(KS[0], KS[1], N, 'seiza-slump'), nemu(KN[0], KN[1], S, 'kotatsu-chin')] },
      { panel: 'PN-028', cam: R(4.0, 3.2, 0.7), look: R(4.0, 2.0, 0.6), places: [nemu(KN[0], KN[1], S, 'kotatsu-chin'), suzu(KS[0], KS[1], N, 'seiza')], note: 'ねむの顔の寄り。こたつの南から（掲示の下からではねむの後頭部になるため）' },
      { panel: 'PN-029', cam: R(6.0, 5.4, 1.3), look: R(4.0, 3.0, 0.45), places: [nemu(KN[0], KN[1], S, 'kotatsu-chin')], note: '南の窓の前から、夕日を背に' },
      { panel: 'PN-030', cam: R(1.0, 3.0, 1.0), look: R(4.0, 2.4, 0.6), places: [nemu(KN[0], KN[1], S, 'kotatsu-pour'), suzu(KS[0], KS[1], N, 'seiza'), takeshi(KE[0], KE[1], W, 'kotatsu-hug')] },
      { panel: 'PN-031', cam: R(1.6, 3.6, 1.3), look: R(4.0, 3.2, 0.5), places: [suzu(KS[0], KS[1], N, 'seiza-reach'), nemu(KN[0], KN[1], S, 'kotatsu-chin'), takeshi(KE[0], KE[1], W, 'kotatsu-hug')] },
      { panel: 'PN-032', cam: R(1.3, 1.0, 1.7), look: R(4.3, 3.4, 0.55), places: [suzu(KS[0], KS[1], N, 'seiza'), takeshi(KE[0], KE[1], W, 'kotatsu-hug'), nemu(KN[0], KN[1], S, 'kotatsu')], cups: 3, note: 'こたつの上の湯のみ3つの寄り。見下ろし' },
      { panel: 'PN-033', cam: R(4.0, 3.9, 0.9), look: R(4.0, 2.6, 0.6), places: [nemu(KN[0], KN[1], S, 'kotatsu-drink')], cups: 3 },
      { panel: 'PN-034', cam: R(3.5, 3.4, 0.95), look: R(5.25, 3.0, 0.8), places: [takeshi(KE[0], KE[1], W, 'kotatsu-drink')], cups: 3, note: 'たけしの寄り。こたつの西から（棚の脇ではたけしの背中になるため）' },
      { panel: 'PN-035', cam: R(0.4, 0.4, 2.2), look: R(4.4, 3.2, 0.5), places: [nemu(KN[0], KN[1], S, 'kotatsu-drink'), suzu(KS[0], KS[1], N, 'seiza-drink'), takeshi(KE[0], KE[1], W, 'kotatsu-drink')], cups: 3 },
      { panel: 'PN-036', cam: R(1.2, 5.5, 1.6), look: R(4.4, 2.8, 0.5), places: [nemu(KN[0], KN[1], S, 'kotatsu-drink'), suzu(KS[0], KS[1], N, 'seiza-drink'), takeshi(KE[0], KE[1], W, 'kotatsu-drink')], cups: 3, note: '最後のコマ。南西の窓の前から、こたつを囲む3人と戸口' },
    ],
  },
  {
    id: 'sheet', name: '設定画の下絵', scenes: [], place: '（舞台なし：設定画）', boxes: () => [B('床', '#f4f4f4', -6, 6, -3, 6, -0.05, 0)],
    shots: [
      ...(['nemu', 'suzu', 'takeshi', 'reika', 'tanahashi'] as const).flatMap((id): Shot[] => [
        { panel: `${id}-front`, cam: R(0, 3.3, 0.85), look: R(0, 0, 0.85), places: [{ fig: id, at: R(0, 0), facing: S, pose: 'stand' }] },
        { panel: `${id}-side`, cam: R(0, 3.3, 0.85), look: R(0, 0, 0.85), places: [{ fig: id, at: R(0, 0), facing: E, pose: 'stand' }] },
        { panel: `${id}-back`, cam: R(0, 3.3, 0.85), look: R(0, 0, 0.85), places: [{ fig: id, at: R(0, 0), facing: N, pose: 'stand' }] },
      ]),
      { panel: 'lineup', cam: R(0, 5.2, 0.85), look: R(0, 0, 0.85), places: [['takeshi', -2.4], ['reika', -1.2], ['tanahashi', 0], ['nemu', 1.2], ['suzu', 2.4]].map(([id, x]) => ({ fig: id as string, at: R(x as number, 0), facing: S, pose: 'stand' as Pose })) },
    ],
  },
];

// ---------------------------------------------------------------- 文書を組む
function bake(doc: CharacterDocument, assets: Map<string, Uint8Array>, id: string, name: string, boxes: Box[]) {
  const colors: string[] = [];
  const slot = (c: string) => (colors.includes(c) ? colors.indexOf(c) : colors.push(c) - 1);
  const pos: number[] = [], sizes: number[] = [], idx: number[] = [], mats: number[] = [];
  for (const b of boxes) {
    const m = boxMesh(b.s, b.c);
    const base = pos.length / 3;
    pos.push(...m.positions);
    sizes.push(...m.faceSizes);
    idx.push(...[...m.faceIndices].map((i) => i + base));
    const k = slot(b.color);
    mats.push(...[...m.faceMaterials].map(() => k));
  }
  const mesh: EpmMesh = { positions: new Float32Array(pos), faceSizes: new Uint32Array(sizes), faceIndices: new Uint32Array(idx), faceMaterials: new Uint16Array(mats), boneIds: [], morphs: [] };
  const bytes = encodeEpm(mesh);
  doc.assets.push({ id: `${id}/mesh`, kind: 'mesh-epm', sha256: epmSha256(bytes), byteLength: bytes.length, mediaType: characterAssetMediaTypes['mesh-epm'] });
  assets.set(`${id}/mesh`, bytes);
  colors.forEach((color, i) => doc.materials.push({ id: `${id}/mat-${i}`, name: `${name} ${i}`, color, opacity: 1, roughness: 0.9, metalness: 0, maps: {}, doubleSided: true }));
  doc.parts.push({ id, name, parentId: null, transform: identityTransform(), mesh: `${id}/mesh`, materials: colors.map((_, i) => `${id}/mat-${i}`), visible: true });
  return id;
}
const HIDDEN: V3 = [0, 0, -60_000];
function cupBoxes(): Box[] {
  return [[3.75, 2.85], [4.2, 3.2], [4.25, 2.8]].map(([x, y]) => B('湯のみ', '#efe9dc', x! - 0.04, x! + 0.04, y! - 0.04, y! + 0.04, 0.4, 0.49));
}
function buildSet(set: SetDef) {
  const doc = emptyCharacter(`第1話 舞台：${set.name}`);
  const assets = new Map<string, Uint8Array>();
  bake(doc, assets, `room-${set.id}`, `舞台 ${set.name}`, set.boxes());
  const cups = set.shots.some((s) => s.cups) ? bake(doc, assets, `cups-${set.id}`, '湯のみ3つ', cupBoxes()) : null;
  const used = ACTORS.filter((a) => set.shots.some((s) => s.places.some((p) => p.fig === a.id)));
  const figs = new Map<string, PlacedFigure>();
  for (const a of used) figs.set(a.id, addBoxFigure(doc, assets, plan(a.hair, { skirt: a.skirt, slim: a.slim }), { prefix: a.id, name: a.name, scaleMm: a.height, colors: a.colors }));
  const tracks = new Map<string, CharacterTrack>();
  const key = (id: string, target: CharacterTrack['target'], tick: number, value: V3 | Quat) => {
    const t = tracks.get(id) ?? tracks.set(id, { id, target, keys: [] }).get(id)!;
    t.keys.push({ id: `${id}-${t.keys.length}`, tick, value, easing: hold });
  };
  set.shots.forEach((s, i) => {
    const tick = i * STEP;
    key('cam-pos', { kind: 'camera', property: 'position' }, tick, s.cam);
    key('cam-look', { kind: 'camera', property: 'target' }, tick, s.look);
    if (cups) key(`${cups}-t`, { kind: 'part', id: cups, property: 'translation' }, tick, s.cups ? [0, 0, 0] : HIDDEN);
    for (const a of used) {
      const f = figs.get(a.id)!;
      const place = s.places.find((p) => p.fig === a.id);
      if (!place) {
        key(`${a.id}-hip-t`, { kind: 'bone', id: f.bone('hip'), property: 'translation' }, tick, HIDDEN);
        continue;
      }
      const p = POSES[place.pose];
      const hipZ = typeof p.hip === 'function' ? p.hip(a.height) : p.hip * a.height;
      key(`${a.id}-hip-t`, { kind: 'bone', id: f.bone('hip'), property: 'translation' }, tick, [place.at[0], place.at[1], place.at[2] + hipZ]);
      key(`${a.id}-hip-r`, { kind: 'bone', id: f.bone('hip'), property: 'rotation' }, tick, axisAngleQuat([0, 0, 1], place.facing));
      for (const [b, q] of Object.entries(poseRotations(place.pose))) key(`${a.id}-${b}`, { kind: 'bone', id: f.bone(b), property: 'rotation' }, tick, q);
    }
  });
  doc.actions.push({ id: `stage-${set.id}`, name: `舞台 ${set.name}`, duration: Math.max(1, set.shots.length) * STEP, frameRate: { numerator: 2, denominator: 1 }, tracks: [...tracks.values()] });
  return { doc, assets, used };
}

async function importArtifact(page: Page, name: string, value: unknown) {
  const input = page.getByLabel('Import artifact', { exact: true });
  if (!(await input.isVisible())) await page.getByRole('button', { name: 'Toggle library', exact: true }).click();
  await input.setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
}
async function panel(page: Page, name: 'Parts' | 'Inspector') {
  const region = page.getByRole('complementary', { name, exact: true });
  if (!(await region.isVisible())) await page.getByRole('button', { name: `Toggle ${name}`, exact: true }).click();
  return region;
}

for (const set of SETS.filter((s) => !ONLY || ONLY.includes(s.id))) {
  test(`stage ${set.id}`, async ({ page }) => {
    test.setTimeout(2 * 3_600_000);
    mkdirSync(`${OUT}/${set.id}`, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 1300 });
    await page.goto('/');
    await create(page, 'character');
    await expect(page.getByTestId('character-view-state')).toHaveText('Ready');
    const empty = await nativeArtifact(page);
    const { doc, assets, used } = buildSet(set);
    const resources = doc.assets.map((ref) => ({ kind: ref.kind, sha256: ref.sha256, byteLength: ref.byteLength, mediaType: ref.mediaType, encoding: 'base64', bytes: Buffer.from(assets.get(ref.id)!).toString('base64') }));
    const characterJson = { ...empty, name: doc.name, draft: { ...empty.draft, content: doc }, cadResources: resources };
    writeFileSync(`${OUT}/${set.id}/character.json`, JSON.stringify(characterJson));
    await importArtifact(page, 'stage.json', characterJson);
    await expect(page.getByLabel('Artifact name')).toHaveValue(doc.name);
    await expect(page.getByTestId('character-view-state')).toHaveText('Ready', { timeout: 1_800_000 });
    await page.getByRole('combobox', { name: 'Action', exact: true }).selectOption({ label: doc.actions[0]!.name });
    const inspector = await panel(page, 'Inspector');
    await inspector.getByRole('group', { name: 'Action camera' }).getByLabel('Look through the action’s camera').check();
    await page.addStyleTag({ content: '.character-bone-overlay, .character-ik-overlay, .character-canvas button { display: none !important; } [data-tooltip]::before, [data-tooltip]::after { display: none !important; }' });
    for (const name of ['Parts', 'Inspector'] as const) {
      const region = page.getByRole('complementary', { name, exact: true });
      if (await region.isVisible()) await page.getByRole('button', { name: `Toggle ${name}`, exact: true }).click();
    }
    await page.mouse.move(2, 600);
    const time = page.getByRole('group', { name: 'Playback', exact: true }).getByLabel('Time');
    const canvas = page.locator('.character-canvas');
    const box = await canvas.boundingBox();
    for (const [i, s] of set.shots.entries()) {
      await time.fill(String(i * STEP));
      await time.press('Enter');
      await page.waitForTimeout(2500);
      await canvas.screenshot({ path: `${OUT}/${set.id}/${s.panel}.png` });
    }
    const saved = await nativeArtifact(page);
    writeFileSync(`${OUT}/${set.id}/stage.json`, JSON.stringify({
      set: { id: set.id, name: set.name, place: set.place, scenes: set.scenes, boxes: set.boxes().map((b) => ({ name: b.name, c: b.c, s: b.s })) },
      model: { artifactId: saved.id, name: doc.name, assets: doc.assets.map((a) => ({ id: a.id, sha256: a.sha256 })) },
      canvas: { width: box!.width, height: box!.height, verticalFovDeg: 35 },
      actors: used.map((a) => ({ id: a.id, who: a.who, name: a.name, heightMm: a.height, hair: a.hair })),
      shots: set.shots,
    }));
  });
}
