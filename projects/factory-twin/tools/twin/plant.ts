/**
 * FT7: the fictional e-Axle plant "Minato e-Drive Plant No. 2" (FT-U1). A single-storey hall,
 * 72 x 36 m, with a 12 m column grid, and an assembly line for one e-Axle model:
 * housing machining -> wash -> buffer -> transfer conveyor -> gear-unit assembly ->
 * final assembly (motor and inverter brought by AGVs from the kitting area) -> conveyor ->
 * end-of-line test -> packing -> shipping. Two shifts (06:00-14:30, 14:30-23:00).
 * Demo source: not part of the repository.
 */
import { bimStarter, type BimDocument, type BimElement } from '@editor-platform/bim-core';
import {
  f174PlcLine,
  f175PlcLineBug,
  newFactory,
  type FactoryDocument,
} from '@editor-platform/factory-core';

const s = (sec: number) => sec * 1000;
const min = (m: number) => m * 60_000;
const h = (hours: number) => hours * 3_600_000;

export const hall = { x: 72_000, y: 36_000, heightMm: 8000 };

export function plantBuilding(): BimDocument {
  const doc = bimStarter();
  doc.project.name = 'Minato e-Drive Plant No. 2';
  doc.levels = [
    { id: 'l-1f', name: '1F', elevationMm: 0 },
    { id: 'l-rf', name: 'RF', elevationMm: hall.heightMm },
  ];
  doc.types.push(
    { id: 't-dock-4000', kind: 'door', name: 'Dock door 4000', widthMm: 4000, heightMm: 4500 },
    { id: 't-door-1000', kind: 'door', name: 'Door 1000', widthMm: 1000, heightMm: 2100 },
  );
  const wall = (id: string, a: [number, number], b: [number, number]): BimElement => ({
    id,
    kind: 'wall',
    typeId: 't-wall-200',
    start: { xy: a },
    end: { xy: b },
    location: 'center',
    base: { level: 'l-1f', offsetMm: 0 },
    top: { level: 'l-rf', offsetMm: 0 },
  });
  const els: BimElement[] = [
    wall('w-south', [0, 0], [hall.x, 0]),
    wall('w-east', [hall.x, 0], [hall.x, hall.y]),
    wall('w-north', [hall.x, hall.y], [0, hall.y]),
    wall('w-west', [0, hall.y], [0, 0]),
  ];
  // Interior columns on the 12 m grid.
  for (let x = 12_000; x < hall.x; x += 12_000)
    for (const y of [12_000, 24_000])
      els.push({
        id: `c-${x / 1000}-${y / 1000}`,
        kind: 'column',
        typeId: 't-column-600',
        at: { xy: [x, y] },
        rotationRad: 0,
        base: { level: 'l-1f', offsetMm: 0 },
        top: { level: 'l-rf', offsetMm: 0 },
      });
  const door = (id: string, hostId: string, alongMm: number, typeId: string): BimElement => ({
    id,
    kind: 'door',
    typeId,
    hostId,
    alongMm,
    flipFacing: false,
    flipHand: false,
  });
  // Receiving dock (south-west), shipping dock (north-east, the north wall runs east to west),
  // kitting dock (north-west) and personnel doors.
  els.push(
    door('d-receiving', 'w-south', 4000, 't-dock-4000'),
    door('d-shipping', 'w-north', 6000, 't-dock-4000'),
    door('d-kitting', 'w-north', 56_000, 't-dock-4000'),
    door('d-staff-s', 'w-south', 40_000, 't-door-1000'),
    door('d-staff-e', 'w-east', 18_000, 't-door-1000'),
  );
  doc.elements = els;
  return doc;
}

/**
 * The AGV lanes: a one-way loop (east along y = 17 m, back west along y = 19.5 m) with two-way
 * spurs to the kit racks and to final assembly. Lanes are cut into blocks of at most 6 m, one
 * vehicle per block, so vehicles can follow each other.
 */
function plantPaths() {
  const nodes: { id: string; x: number; y: number }[] = [];
  const segments: { id: string; from: string; to: string; twoWay?: boolean }[] = [];
  const node = (id: string, x: number, y: number) => {
    if (!nodes.some((n) => n.id === id)) nodes.push({ id, x, y });
    return id;
  };
  const lane = (name: string, from: string, to: string, twoWay = false) => {
    const a = nodes.find((n) => n.id === from)!;
    const b = nodes.find((n) => n.id === to)!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6000));
    let prev = from;
    for (let i = 1; i <= n; i++) {
      const id = i === n ? to : node(`${name}-${i}`, a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n);
      segments.push({ id: `${name}-s${i}`, from: prev, to: id, ...(twoWay ? { twoWay } : {}) });
      prev = id;
    }
  };
  // A one-way rectangle: east along y = 17 m, down to final assembly, up the east bay, west
  // along y = 28 m past the kit racks, and down the west side.
  node('a', 4000, 17_000);
  node('b', 61_000, 17_000);
  node('drop', 61_000, 9000);
  node('d', 62_800, 9000);
  node('e', 62_800, 28_000);
  node('k-inverter', 20_000, 28_000);
  node('k-motor', 8000, 28_000);
  node('f', 4000, 28_000);
  lane('east', 'a', 'b');
  lane('down', 'b', 'drop');
  lane('out', 'drop', 'd');
  lane('up', 'd', 'e');
  lane('north-1', 'e', 'k-inverter');
  lane('north-2', 'k-inverter', 'k-motor');
  lane('north-3', 'k-motor', 'f');
  lane('west', 'f', 'a');
  return { nodes, segments };
}

export interface PlantOptions {
  machines?: number;
  agvs?: number;
  assemblers?: number;
  bufferAfterWash?: number;
  /** FT6 on the test conveyor: the F174 ladder (`ok`) or F175's, whose hold is never reset (`bug`). */
  plc?: 'ok' | 'bug';
}

export function plantFactory(o: PlantOptions = {}): FactoryDocument {
  const doc = newFactory('Minato e-Drive Plant No. 2');
  doc.products = [
    { id: 'housing', name: 'Housing' },
    { id: 'gearset', name: 'Gear set' },
    { id: 'gear-unit', name: 'Gear unit' },
    { id: 'motor', name: 'Motor' },
    { id: 'inverter', name: 'Inverter' },
    { id: 'eaxle', name: 'e-Axle' },
  ];
  doc.calendars = [
    {
      id: 'two-shift',
      name: 'Two shifts',
      cycleMs: h(24),
      shifts: [
        { name: 'Early', startMs: h(6), endMs: h(14.5) },
        { name: 'Late', startMs: h(14.5), endMs: h(23) },
      ],
    },
  ];
  const cal = 'two-shift';
  doc.workerPools = [
    {
      id: 'assemblers',
      name: 'Assemblers',
      count: o.assemblers ?? 3,
      skills: ['assembly', 'pack'],
      walkSpeedMmS: 1200,
      home: { x: 63_000, y: 14_000 },
    },
    {
      id: 'testers',
      name: 'Test operators',
      count: 1,
      skills: ['test'],
      walkSpeedMmS: 1200,
      home: { x: 63_000, y: 22_000 },
    },
  ];
  doc.paths = plantPaths();
  doc.fleets = [
    {
      id: 'agv',
      name: 'Kitting AGVs',
      count: o.agvs ?? 2,
      speedMmS: 1000,
      loadMs: s(15),
      unloadMs: s(15),
      homeNodeId: 'a',
      widthMm: 1000,
    },
  ];
  doc.objects = [
    {
      id: 'in-housing',
      name: 'Housing receiving',
      kind: 'source',
      interval: { type: 'const', value: s(66) },
      mix: [{ productId: 'housing', weight: 1 }],
      calendarId: cal,
      at: { x: 4000, y: 4000 },
      size: { widthMm: 3000, depthMm: 2400, heightMm: 1500 },
    },
    {
      id: 'machining',
      name: 'Housing machining cell',
      kind: 'parallel',
      count: o.machines ?? 3,
      processTime: { type: 'triangular', min: s(170), mode: s(185), max: s(215) },
      failures: {
        uptime: { type: 'exponential', mean: h(3) },
        repair: { type: 'triangular', min: min(8), mode: min(15), max: min(40) },
      },
      calendarId: cal,
      at: { x: 14_000, y: 5000 },
      size: { widthMm: 10_000, depthMm: 5000, heightMm: 2800 },
    },
    {
      id: 'wash',
      name: 'Washer',
      kind: 'station',
      processTime: { type: 'const', value: s(48) },
      calendarId: cal,
      at: { x: 24_500, y: 5000 },
      size: { widthMm: 4500, depthMm: 2500, heightMm: 2500 },
    },
    {
      id: 'buffer-wash',
      name: 'Washed housing rack',
      kind: 'buffer',
      capacity: o.bufferAfterWash ?? 6,
      at: { x: 30_000, y: 5000 },
      size: { widthMm: 3000, depthMm: 1600, heightMm: 1800 },
    },
    {
      id: 'conveyor-1',
      name: 'Transfer conveyor',
      kind: 'conveyor',
      lengthMm: 16_000,
      speedMmS: 250,
      partLengthMm: 600,
      accumulating: true,
      at: { x: 41_000, y: 5000 },
    },
    {
      id: 'in-gearset',
      name: 'Gear set supply',
      kind: 'source',
      interval: { type: 'const', value: s(60) },
      mix: [{ productId: 'gearset', weight: 1 }],
      startMs: s(30),
      calendarId: cal,
      at: { x: 52_000, y: 9500 },
    },
    { id: 'buffer-gear', name: 'Gear set rack', kind: 'buffer', capacity: 10, at: { x: 54_500, y: 9500 } },
    {
      id: 'assembly-1',
      name: 'Gear unit assembly',
      kind: 'assembly',
      mainProductId: 'housing',
      components: [{ productId: 'gearset', count: 1 }],
      processTime: { type: 'normal', mean: s(62), sd: s(6), min: s(45) },
      outputProductId: 'gear-unit',
      workers: { count: 1, skill: 'assembly' },
      calendarId: cal,
      at: { x: 55_000, y: 5000 },
    },
    {
      id: 'in-motor',
      name: 'Motor kitting',
      kind: 'source',
      interval: { type: 'const', value: s(40) },
      mix: [{ productId: 'motor', weight: 1 }],
      at: { x: 8000, y: 33_000 },
    },
    {
      id: 'store-motor',
      name: 'Motor kit rack',
      kind: 'buffer',
      capacity: 12,
      pathNodeId: 'k-motor',
      at: { x: 8000, y: 30_200 },
    },
    {
      id: 'in-inverter',
      name: 'Inverter kitting',
      kind: 'source',
      interval: { type: 'const', value: s(40) },
      mix: [{ productId: 'inverter', weight: 1 }],
      at: { x: 20_000, y: 33_000 },
    },
    {
      id: 'store-inverter',
      name: 'Inverter kit rack',
      kind: 'buffer',
      capacity: 12,
      pathNodeId: 'k-inverter',
      at: { x: 20_000, y: 30_200 },
    },
    {
      id: 'assembly-2',
      name: 'Final assembly',
      kind: 'assembly',
      mainProductId: 'gear-unit',
      components: [
        { productId: 'motor', count: 1 },
        { productId: 'inverter', count: 1 },
      ],
      processTime: { type: 'normal', mean: s(68), sd: s(7), min: s(50) },
      outputProductId: 'eaxle',
      workers: { count: 2, skill: 'assembly' },
      calendarId: cal,
      pathNodeId: 'drop',
      at: { x: 66_000, y: 6000 },
      size: { widthMm: 5000, depthMm: 3000, heightMm: 2200 },
    },
    {
      id: 'conveyor-2',
      name: 'Test conveyor',
      kind: 'conveyor',
      lengthMm: 8000,
      speedMmS: 250,
      partLengthMm: 600,
      accumulating: true,
      at: { x: 66_000, y: 12_500, angle: 90 },
    },
    {
      id: 'test',
      name: 'End-of-line test bench',
      kind: 'station',
      processTime: { type: 'lognormal', mean: s(64), sd: s(9) },
      failures: {
        uptime: { type: 'exponential', mean: h(6) },
        repair: { type: 'triangular', min: min(5), mode: min(10), max: min(30) },
      },
      workers: { count: 1, skill: 'test' },
      calendarId: cal,
      at: { x: 66_000, y: 20_000 },
      size: { widthMm: 4000, depthMm: 3000, heightMm: 2400 },
    },
    {
      id: 'pack',
      name: 'Packing',
      kind: 'station',
      processTime: { type: 'normal', mean: s(40), sd: s(4), min: s(30) },
      workers: { count: 1, skill: 'pack' },
      calendarId: cal,
      at: { x: 66_000, y: 26_500 },
      size: { widthMm: 3000, depthMm: 2400, heightMm: 2000 },
    },
    { id: 'ship', name: 'Shipping dock', kind: 'drain', at: { x: 66_000, y: 33_000 } },
  ];
  const link = (from: string, to: string, fleet?: string) => ({
    id: `${from}>${to}`,
    from,
    to,
    ...(fleet ? { transport: { fleetId: fleet } } : {}),
  });
  doc.links = [
    link('in-housing', 'machining'),
    link('machining', 'wash'),
    link('wash', 'buffer-wash'),
    link('buffer-wash', 'conveyor-1'),
    link('conveyor-1', 'assembly-1'),
    link('in-gearset', 'buffer-gear'),
    link('buffer-gear', 'assembly-1'),
    link('assembly-1', 'assembly-2'),
    link('in-motor', 'store-motor'),
    link('store-motor', 'assembly-2', 'agv'),
    link('in-inverter', 'store-inverter'),
    link('store-inverter', 'assembly-2', 'agv'),
    link('assembly-2', 'conveyor-2'),
    link('conveyor-2', 'test'),
    link('test', 'pack'),
    link('pack', 'ship'),
  ];
  if (o.plc) {
    const control = (o.plc === 'ok' ? f174PlcLine() : f175PlcLineBug()).control!;
    doc.control = {
      program: control.program,
      sensors: [
        { id: 'sn-c2-end', objectId: 'conveyor-2', signal: 'ready', variable: 'C1_AT_END' },
        { id: 'sn-test-busy', objectId: 'test', signal: 'occupied', variable: 'ST2_BUSY' },
      ],
      actuators: [
        { id: 'ac-c2-run', objectId: 'conveyor-2', signal: 'run', variable: 'C1_RUN' },
        { id: 'ac-c2-gate', objectId: 'conveyor-2', signal: 'release', variable: 'C1_GATE' },
      ],
    };
  }
  // A week of two-shift work after a day's warm-up.
  doc.run = { warmupMs: h(24), durationMs: h(24 * 8), seed: 1 };
  return doc;
}
