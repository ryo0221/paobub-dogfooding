import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import * as K from '../.paobub/cad/kit.mjs';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 1) + '\n');
const motion = read('cad/shiraha.motion.json');
const extremities = read('cad/extremities.model.json');
const white = '#f4f5f7', pearl = '#e6e2da', gold = '#c9a96a';
const grey = '#7d838c', frame = '#4d535c', lens = '#273e49';
const landingSurface = .033;
const maximumAngleStep = 2.5;
const maximumTravelStep = .25;
const configurationsPerDocument = 32;
const featherMountRadiusMm = 250;

const components = [];
// 閉断面の始点をそろえ、板の細い端を通るロフトの継ぎ目を避ける。
const sectionSeams = {
  neck3: Object.fromEntries([-1,1].flatMap(sx => [0,1,2].map(i => ['occipital-plume-'+sx+'-'+i,[1,true]]))),
  'helmet-arm': { 'poll-lamella-1': [1, true] },
  helmet: { 'vault--1': [3, true], 'forehead-shield-1': [5, true], 'forehead-shield--1': [4, true], 'vault-1': [4, true], 'temple-plate-1': [4, true] },
  torso: {
    'chest-shell-90': [5, false], 'chest-shell-270': [0, true], 'pelvis-rim': [15, true], 'hip-shell-1': [5, true],
    'spinal-keel': [7, true], 'spinal-keel-rim': [7, true], 'back--1': [7, true],
  },
  'wing-l': { 'covert-1': [5, false], 'covert-2': [5, false] },
  'wing-r': { 'leading-edge-upper-cover': [7, false], 'mantle-cover-7': [3, true] },
  'feather-vane-11-l': { 'secondary-tip': [1, true] },
  'feather-vane-12-l': { 'secondary-tip': [1, true] },
  'feather-vane-18-r': { 'primary-tip': [4, true] },
  'feather-vane-19-r': { 'primary-tip': [4, true] },
  'thigh-l': { 'thigh-guard': [0, true] },
  'thigh-r': { 'thigh-guard': [6, true] },
  'hand-r': { 'dorsal-plate': [6, true] },
};
const add = (id, name, shapes) => components.push({
  id, name,
  shapes: shapes.flat().map(shape => {
    const section = sectionSeams[id]?.[shape.id];
    return section ? seamAt({...shape, ruled: section[1]}, section[0]) : shape;
  }),
});
const line = (z, w, F, B, x) => ({ z, w, F, B, x });
const horizontal = rows => rows.map(([z, x, y, a, b, r]) => ({ z, x, y, a, b, r, n: 2 }));
const longitudinal = rows => rows.map(([y, x, z, a, b, r]) => ({ y, x, z, a, b, r, n: 2 }));
const sweep = (c0, c1, span, end) => t => K.leaf(K.lerp(c0, c1, t), span, end)(t);

function ruledPlate(id, color, contour, z0, z1, angles, lift, thick, sx = 1) {
  return {...K.plate(id, color, contour, z0, z1, angles, lift, thick, sx, 7), ruled: true};
}
function contourTrim(id, contour, rows, sx) {
  const sections = rows.map(([z, angle, lift, a, b]) => {
    const {x, y} = K.onLines(contour, z, angle, lift);
    return {z, x, y, a, b, n: 2};
  });
  return K.lz(id, gold, sections, sx);
}

function contourOverlay(id, color, contour, rows, sx) {
  const sections = rows.map(([z, angle, lift, width, depth]) => {
    const {x, y} = K.onLines(contour, z, angle, lift);
    const tangentBefore = K.onLines(contour, z, angle - .25, lift);
    const tangentAfter = K.onLines(contour, z, angle + .25, lift);
    const r = 180 * Math.atan2(
      tangentAfter.y - tangentBefore.y, tangentAfter.x - tangentBefore.x,
    ) / Math.PI;
    return {z, x, y, a: width, b: depth, n: 2, r};
  });
  return K.lz(id, color, sections, sx);
}

function edgedPlate(id, color, contour, z0, z1, angles, sx, border, thick, ruled = true, rimColor = gold) {
  const rim = t => {
    const [a, b] = angles(t);
    return [a - border, b + border];
  };
  return [
    ruledPlate(id + '-rim', rimColor, contour, z0 - .04, z1 + .04, rim, .013, thick * .8, sx),
    {...ruledPlate(id, color, contour, z0, z1, angles, .066, thick, sx), ruled},
  ];
}

const torso = line(
  [13.05, 14.2, 15.4, 16.7, 18.1, 19.5, 21.0, 22.4, 23.6, 24.18, 24.47],
  [.22, .47, .69, .91, 1.26, .86, 1.22, 1.68, 1.74, 1.24, .88],
  [-.52, -.68, -.91, -1.64, -1.93, -1.20, -1.40, -1.86, -1.43, -.87, -.67],
  [.45, .68, .72, .83, .69, .64, .96, .98, .99, .97, .94],
);
// 胸の羽板と胸殻の間を、左右の雨覆の案内溝にする。
const coverDepth = z => -1.0 - .085 * (z - 21.5);
const slotBlend = z => Math.max(0, Math.min(1, (z - 20.96) / .46));
// 各断面の下縁を前面図の山形に取り、腹から上へ板を重ねる。
function breastPanel(id, color, rows, lift, thickness) {
  const across = [...rows.slice(1).reverse().map(([x, lo, hi]) => [-x, lo, hi]), ...rows];
  const loft = across.map(([x, lo, hi]) => {
    const face = (z, offset) => {
      const width = K.cr(torso.z, torso.w, z);
      const angle = -Math.acos(Math.min(.998, Math.abs(x) / width)) * 180 / Math.PI;
      const base = K.onLines(torso, z, angle).y;
      const lip = coverDepth(z) - .095;
      const front = (base + lip - Math.hypot(base - lip, .075)) / 2;
      return (K.lerp(base, front, slotBlend(z)) - offset) * K.mm;
    };
    const pts = K.ring(1, 1, 2.6, 16).map(([u, v]) => {
      const t = (v + 1) / 2;
      const z = K.lerp(lo, hi, t);
      return [face(z, lift + thickness * (1 + u) / 2 + .018 * Math.sin(Math.PI * t)), z * K.mm];
    });
    return {plane: 'yz', w: x * K.mm, pts};
  });
  return {id, color, ruled: true, loft};
}
const upperChest = [
  [0, 22.03, 24.30], [.22, 22.49, 24.36], [.56, 22.95, 24.37],
  [.94, 23.24, 24.32], [1.24, 23.40, 24.10], [1.48, 23.60, 23.84],
  [1.52, 23.72, 23.75],
];
const middleChest = [
  [0, 21.08, 22.34], [.27, 21.63, 22.97], [.63, 22.00, 23.43],
  [1.02, 22.14, 23.62], [1.41, 22.41, 23.85], [1.58, 22.82, 23.66],
  [1.66, 23.18, 23.33],
];
const lowerChest = [
  [0, 20.19, 21.57], [.21, 20.73, 21.97], [.48, 21.20, 22.20],
  [.80, 21.53, 22.45], [1.10, 21.80, 22.58], [1.40, 22.07, 22.74],
  [1.51, 22.40, 22.52],
];

const belowNeck = { z: torso.z.slice(0, 6).concat(20.98) };
for (const key of ['w', 'F', 'B']) {
  belowNeck[key] = belowNeck.z.map(z => K.cr(torso.z, torso[key], z));
}
function chestAroundWell(z, angle, blend) {
  const t = angle * Math.PI / 180;
  const {x, y} = K.onLines(torso, z, angle);
  const innerY = .20 + .62 * Math.sin(t);
  const minimum = K.cr(torso.z, torso.F, z);
  const frontScale = Math.min(1, (coverDepth(z) + .245 + .43) / (minimum + .43));
  const recessed = y < -.43 ? -.43 + (y + .43) * K.lerp(1,frontScale,slotBlend(z)) : y;
  return [K.lerp(.72 * Math.cos(t), x, blend), K.lerp(innerY, recessed, blend)];
}
const shoulderCoverStations = [
    [21.38,1.34,1.37], [21.48,1.34,1.40], [21.78,1.21,1.59],
    [22.20,1.12,1.79], [22.62,1.08,2.11],
    [23.06,1.06,2.43], [23.40,1.10,2.65],
    [23.68,1.19,2.77], [23.94,1.39,2.78],
    [24.13,1.63,2.73], [24.27,1.88,2.55],
    [24.36,2.12,2.22],
];
add('ground', '地面', [K.box('ground', '#6b6f73', [-12, -12, landingSurface - .001], [12, 12, landingSurface])]);
add('torso', '胴（胸と腰）', [
  K.lines('lower-body-shell', pearl, belowNeck, 1, 11),
  ...[0, 90, 180, 270].map(angle => K.surfPlate(
    'chest-shell-' + angle, pearl, 'xy', 20.96, 24.47, chestAroundWell,
    () => [angle - 46, angle + 46], 0, 1, 1, 10, 9,
  )),
  K.lz('breastplate-spine', pearl, [20.9,21.58,22.03,22.75,23.55,24.13,24.31].map(z => {
    const front = K.cr(torso.z,torso.F,z) - .18;
    return {z,x:0,y:(front-.38)/2,a:.019,b:(-.38-front)/2,n:2.7};
  })),
  breastPanel('abdomen', pearl, lowerChest, .055, .067),
  breastPanel('under-breastplate', white, middleChest, .106, .085),
  breastPanel('breast-gilding', gold,
    upperChest.map(([x, lo, hi]) => [x, lo - .067, Math.min(hi, lo + .13)]), .169, .063),
  breastPanel('breastbone', white, upperChest, .199, .084),
  edgedPlate('pelvis', white, torso, 16.22, 19.50, t => {
    const width = 2 + 27 * t ** .72;
    return [-90 - width, -90 + width];
  }, 1, 3.2, .103, false),
  edgedPlate('spinal-keel', white, torso, 16.74, 23.68, K.leaf(90, 10, 2), 1, 3, .104, true, pearl),
  contourTrim('spinal-keel-top', torso, [
    [22.86, 90, .128, .018, .025], [23.12, 90, .131, .114, .047],
    [23.30, 90, .092, .073, .038], [23.43, 90, .069, .020, .025],
  ], 1),
  contourTrim('spinal-keel-waist', torso, [
    [19.80, 90, .142, .024, .022], [20.24, 90, .159, .137, .037],
    [20.67, 90, .153, .212, .044], [21.10, 90, .139, .104, .036],
    [21.46, 90, .129, .018, .023],
  ], 1),
  ...[-1, 1].flatMap(sx => [
    ruledPlate(`waist-${sx}`, pearl, torso, 18.32, 21.35,
      sweep(-80, -37, 13, 3), .048, .075, sx),
    contourTrim(`waist-gilding-${sx}`, torso, [
      [18.42, -89.5, .170, .012, .021], [18.90, -79, .158, .037, .033],
      [19.52, -60, .137, .051, .041], [20.12, -47, .120, .093, .058],
      [20.76, -50, .110, .111, .059], [21.35, -56, .093, .080, .037],
      [21.75, -53, .078, .019, .019],
    ], sx),
    ruledPlate(`hip-shell-${sx}`, white, torso, 15.35, 18.53, sweep(-66, -17, 22, 4), .036, .098, sx),
    ruledPlate(`back-${sx}`, white, torso, 20.91, 24.38, sweep(85, 37, 22, 4), .040, .112, sx),
    edgedPlate(`lower-back-${sx}`, pearl, torso, 18.10, 21.44, sweep(84, 54, 16, 4), sx, 2.8, .084),
    K.lz(`hip-support-${sx}`, pearl, horizontal([
      [13.07, 1.04, -.30, .102, .106],
      [13.27, 1.04, -.30, .142, .140],
      [13.76, .91, -.27, .159, .156],
      [14.24, .65, -.22, .177, .173],
      [14.89, .53, -.20, .186, .175],
    ]), sx),
  ]),
]);

const neck1 = line([21.0, 21.31, 22.22, 23.88, 24.45], [.44, .45, .39, .44, .44],
  [-.22, -.25, -.20, -.24, -.23], [.62, .65, .60, .64, .63]);
const neck2 = line([21.1, 21.42, 22.60, 24.24, 24.53], [.33, .35, .31, .34, .35],
  [-.15, -.17, -.14, -.16, -.16], [.55, .57, .54, .56, .56]);
const neck = line([24.47, 24.81, 25.15, 25.50, 25.92, 26.36, 26.90, 27.27],
  [.65, .53, .43, .46, .63, .71, .67, .39],
  [-.29, -.36, -.39, -.39, -.53, -.77, -.76, -.47], [.74, .66, .56, .59, .61, .65, .63, .47]);
const bore = [{
  plane: 'xy', span: [20980, 24470],
  pts: K.ring(365, 385, 2, 24).map(([x, y]) => [x, y + 200]),
}];
add('neck1', '首の外筒', [
  K.lines('outer-tube', frame, neck1, 1, 10, bore),
  K.plate('neck-collar', pearl, neck1, 24.10, 24.43, K.leaf(-90, 48, 29), -.006, .043),
]);
add('neck2', '首の内筒', [
  K.lines('inner-tube', grey, neck2, 1, 9),
  K.plate('inner-collar', pearl, neck2, 24.21, 24.52, K.leaf(90, 42, 24), 0, .022),
]);
// 頬骨、眼窩、口輪筋と顎を同じ顔面の断面に彫り込む。
const faceRows = [
  [25.60,.12,-.47,.11],[25.67,.193,-.66,.21],[25.77,.295,-.78,.28],
  [25.91,.405,-.80,.37],[26.06,.482,-.84,.45],[26.18,.54,-.84,.50],
  [26.32,.61,-.82,.55],[26.46,.64,-.80,.57],[26.59,.66,-.77,.59],
  [26.71,.66,-.81,.59],[26.87,.65,-.84,.58],[27.06,.60,-.77,.55],
  [27.22,.50,-.61,.46],[27.32,.32,-.38,.32],[27.36,.11,-.16,.12],
];
const faceSurface = (x,z,width,front,rear) => {
  const u = Math.min(1,Math.abs(x)/width);
  const fall = (a,b) => Math.exp(-a*a-b*b);
  const depth = (rear-front)/2;
  const nose = (.128*fall(x/.092,(z-26.44)/.26) + .108*fall(x/.103,(z-26.275)/.092)
    + .085*fall((Math.abs(x)-.097)/.045,(z-26.247)/.046));
  const brow = .029*fall((u-.44)/.37,(z-26.70-.023*u)/.066);
  const lip = .042*fall(x/.19,(z-26.045)/.030) + .046*fall(x/.18,(z-25.991)/.031);
  return front - nose - brow - lip + depth * (1-Math.sqrt(1-u**2.65))
    + .067*fall((u-.49)/.26,(z-26.56)/.10)
    - .053*fall((u-.64)/.28,(z-26.37)/.14)
    + .037*fall((u-.69)/.27,(z-26.11)/.13);
};
const surfaceY = (x,z) => {
  const columns = [1,2,3].map(i => K.cr(faceRows.map(r=>r[0]),faceRows.map(r=>r[i]),z));
  return faceSurface(x,z,...columns);
};
const visage = {id:'carved-visage',color:'#faf8ef',ruled:false,loft:[25.60,25.66,25.73,25.80,25.88,25.95,25.99,26.015,26.048,26.08,26.13,26.18,26.215,26.245,26.275,26.31,26.36,26.43,26.50,26.55,26.60,26.65,26.70,26.76,26.84,26.94,27.06,27.17,27.25,27.32,27.36].map(z=>{
  const [w,front,rear]=[1,2,3].map(i=>K.cr(faceRows.map(r=>r[0]),faceRows.map(r=>r[i]),z));
  const pts = Array.from({length:72},(_,i)=>{
    const angle = 2*Math.PI*i/72, x = w*Math.cos(angle);
    const y = i<=36 ? .5*(front+rear)+.5*(rear-front)*Math.sin(angle) : faceSurface(x,z,w,front,rear);
    return [x*K.mm,y*K.mm];
  });
  return {plane:'xy',w:z*K.mm,pts};
})};
function faceBand(id,color,rows,sx=1) {
  return {id,color,ruled:true,loft:rows.map(([x,z,projection,height,depth])=>({
    plane:'yz',w:sx*x*K.mm,pts:K.ring(depth,height,2,12).map(([a,b])=>[
      (surfaceY(x,z)-projection+a)*K.mm,(z+b)*K.mm]),
  }))};
}
// 額で合う冠板は耳の上で三層に分かれ、後頭の羽板へ続く。
function crownPlates(sx) {
  const rows = [
    [-.861,.047,26.722,.037,.059,-27],
    [-.812,.110,26.923,.115,.094,-35],
    [-.686,.227,27.100,.187,.103,-30],
    [-.488,.306,27.235,.218,.090,-23],
    [-.202,.351,27.331,.211,.087,-21],
    [.465,.305,27.326,.106,.050,-19],
    [.739,.299,27.274,.023,.014,-18],
  ];
  const crest = K.ly('frontal-crown-'+sx,white,longitudinal(rows),sx);
  const gilding = K.ly('frontal-crown-inlay-'+sx,gold,longitudinal([
    [-.866,.045,26.749,.013,.039,-27],[-.820,.105,26.957,.026,.075,-33],
    [-.702,.213,27.126,.028,.070,-33],[-.525,.297,27.252,.012,.037,-26],
  ]),sx);
  const temple = [0,1,2].map(i=>K.ly('temple-feather-'+sx+'-'+i,i===1?pearl:white,longitudinal([
    [-.796+i*.036,.24+i*.073,26.836-i*.061,.039,.018,-30],
    [-.65+i*.038,.388+i*.060,26.99-i*.098,.177,.042,-42],
    [-.40+i*.04,.499+i*.037,27.12-i*.124,.195,.040,-47],
    [.032+i*.04,.556+i*.036,27.19-i*.157,.169,.041,-50],
    [.598+i*.05,.479+i*.035,27.06-i*.255,.014,.010,-56],
  ]),sx));
  const cheek = K.lz('cheek-feather-'+sx,pearl,horizontal([
    [25.86,.403,-.557,.017,.031,-32],[26.00,.514,-.464,.041,.125,-31],
    [26.22,.605,-.312,.059,.207,-25],[26.43,.636,-.170,.067,.206,-22],
    [26.65,.648,-.092,.055,.124,-18],[26.79,.625,-.085,.023,.039,-18],
  ]),sx);
  const napeRows = horizontal([
    [25.76,.354,.51,.031,.037,-23],[25.91,.461,.554,.117,.250,-19],
    [26.22,.518,.465,.148,.407,-17],[26.60,.518,.490,.150,.413,-15],
    [26.91,.519,.515,.134,.262,-11],[27.15,.465,.424,.107,.149,-9],
    [27.30,.345,.385,.044,.056,-8],
  ]);
  const napeSections = napeRows.filter((_,i) => i !== 5);
  const nape = K.lz('nape-feather-'+sx, pearl, napeSections, sx);
  // 後頭の同じ断面をなぞり、耳の後ろから襟まで切れ目のない上板を重ねる。
  const napeLayer = {id:'nape-lamella-'+sx, color:white,
    loft:napeSections.map(({x,y,z,a,b,r}, i) => {
      const center = [-48,-35,-6,21,36,45][i], half = [3,28,34,32,25,4][i];
      const roll = r * Math.PI / 180;
      const pts = K.ring(1,1,2,16).map(([u,v]) => {
        const angle = (center + half*u) * Math.PI/180;
        const lift = .025 + .011*v;
        const dx = (a+lift)*Math.cos(angle), dy = (b+lift)*Math.sin(angle);
        return [sx*(x+dx*Math.cos(roll)-dy*Math.sin(roll))*K.mm,
          (y+dx*Math.sin(roll)+dy*Math.cos(roll))*K.mm];
      });
      return {plane:'xy',w:z*K.mm,pts:sx<0?pts.reverse():pts};
    })};
  const earBand = K.lz('ear-to-collar-'+sx,gold,horizontal([
    [25.43,.361,-.23,.026,.041,-22],[25.58,.465,-.123,.056,.098,-25],
    [25.73,.627,.016,.077,.122,-24],[25.85,.802,.161,.071,.102,-18],
    [25.94,.949,.272,.053,.065,-12],
  ]),sx);
  return [crest,gilding,...temple,cheek,nape,napeLayer,earBand,
    {id:'auricular-shell-'+sx,color:pearl,ruled:true,loft:[
      [.43,.24,26.12,.41,.425],[.98,.30,26.00,.163,.17],
    ].map(([x,y,z,ry,rz])=>({plane:'yz',w:sx*x*K.mm,
      pts:K.ring(ry,rz,2.2,20).map(([u,v])=>[(y+u-.24*v)*K.mm,(z+v)*K.mm])}))},
    axle('auricular-ring-'+sx,gold,.966,.999,earPivot,.164,sx),
    axle('auricular-pin-'+sx,pearl,.992,1.018,earPivot,.127,sx)];
}

function sculptedFace() {
  const marble = '#f9f7f0';
  const eyes = [[.105,26.545,.018],[.17,26.55,.042],[.26,26.56,.057],[.36,26.58,.051],[.46,26.605,.028],[.52,26.62,.008]];
  const poll = {
    id:'central-nape-feather',color:white,ruled:true,
    loft:[
      // 高さ、幅の半分、後ろへの張出し、両脇の反り
      [25.75,.024,.63,.010],[26.35,.400,.817,.108],
      [27.17,.622,.829,.224],
      [27.43,.536,.595,.231],
      [27.585,.075,.347,.024],
    ].map(([z,width,rear,roll])=>{
      const us=[-1,-.75,-.48,-.24,0,.24,.48,.75,1];
      const shell=us.map(u=>[u*width*K.mm,(rear-roll*u*u)*K.mm]);
      const inside=shell.toReversed().map(([x,y])=>[x,y-.093*K.mm]);
      return {plane:'xy',w:z*K.mm,pts:[...shell,...inside]};
    }),
  };
  return [visage,poll,
    ...[-1,1].flatMap(sx=>[
      ...crownPlates(sx),
      faceBand('eye-socket-'+sx,'#43535c',eyes.map(([x,z,h])=>[x,z,.013,h*.92,.012]),sx),
      faceBand('eye-light-'+sx,'#a7efff',eyes.map(([x,z,h])=>[x,z+.003,.038,h*.30,.007]),sx),
      faceBand('orbital-rim-'+sx,marble,eyes.map(([x,z,h])=>[x,z+h*.61+.011,.005,h*.38,.018]),sx),
      ...[0,1,2].map(i=>K.ly('occipital-plume-'+sx+'-'+i,i%2?pearl:white,longitudinal([
        [-.43,.30+i*.084,27.15-i*.20,.063,.046],[-.13,.34+i*.081,27.32-i*.20,.155,.078],
        [.43,.24+i*.119,27.45-i*.18,.163,.068],
        [.89+i*.046,.21+i*.064,27.36-i*.142,.024,.018],
      ]),sx)),
    ]),
    faceBand('lip-line','#aa9590',[-1,-.68,-.30,0,.30,.68,1].map(t=>{
      const u=Math.abs(t), h=1-u*.97;
      return [t*.218,26.014+.013*u,.003+.002*h,.005*h,.005+.002*h];
    })),
  ];
}

function hingeYZ(id) {
  const joint = motion.joints.find(joint => joint.id === id);
  return joint.parent.offset.translation.slice(1).map(v => v.literalMm / K.mm);
}
const earPivot = hingeYZ('j-helmet-arm');
const visorPivot = hingeYZ('j-helmet');
function axle(id,color,near,far,[y,z],radius,sx) {
  return {id,color,plane:'yz',
    pts:K.ring(radius,radius,2,40).map(([u,v])=>[(y+u)*K.mm,(z+v)*K.mm]),
    span:(sx>0?[near,far]:[-far,-near]).map(x=>x*K.mm)};
}
// 頬の内側の幅を保ち、耳より外を軸方向に詰める。穴と軸、覆い板に同じ寸法を使う。
function seatTemple(shape) {
  const cheekHalfWidthMm = .72*K.mm;
  const width = x => Math.sign(x)*(Math.min(Math.abs(x),cheekHalfWidthMm)
    + .45*Math.max(0,Math.abs(x)-cheekHalfWidthMm));
  const section = row => {
    if (row.plane === 'yz') return row.span ? {...row,span:row.span.map(width)} : {...row,w:width(row.w)};
    return {...row,pts:row.pts.map(([x,other])=>[width(x),other])};
  };
  const solid = shape.loft ? {...shape,loft:shape.loft.map(section)} : section(shape);
  return shape.cuts ? {...solid,cuts:shape.cuts.map(section)} : solid;
}
const neckStem = K.lines('neck', pearl, neck, 1, 15);
neckStem.loft = neckStem.loft.slice(0, 8);
add('neck3', '首の先と素顔', [
  neckStem,
  contourOverlay('throat', white, neck, [
    [24.47,-90,.018,.015,.019],
    [24.95,-90,.042,.225,.042],[25.20,-90,.049,.258,.044],
    [25.48,-90,.041,.192,.039],[25.70,-90,.028,.093,.030],
    [25.81,-90,.013,.019,.018],
  ], 1),
  ...[-1, 1].flatMap(sx => [
    K.plate('neck-flank-' + sx, pearl, neck,
      24.48, 25.79, sweep(-64, -13, 23, 4), .007, .040, sx),
    contourTrim('neck-flank-gold-' + sx, neck, [
      [24.74, -68, .023, .010, .017], [24.99, -61, .029, .019, .021], [25.15, -49, .038, .025, .027],
      [25.36, -30, .048, .044, .033], [25.55, -6, .041, .050, .031],
      [25.68, 17, .022, .018, .026],
    ], sx),
  ]),
  K.plate('neck-nape', white, neck, 24.49, 25.74, t => {
    const width = K.cr([0, .27, .68, 1], [21, 26, 16, 5], t);
    return [90 - width, 90 + width];
  }, .022, .039),
  ...[-1,1].flatMap(sx=>[
    axle('ear-spindle-'+sx,gold,.40,1.025,earPivot,.121,sx),
    axle('ear-journal-'+sx,frame,1.020,1.198,earPivot,.062,sx),
  ]),
  ...sculptedFace(),
].map(shape=>/^(ear-|auricular-)/.test(shape.id) ? seatTemple(shape) : shape));

const bill = longitudinal([
  [-2.74, 0, 24.66, .021, .020],
  [-2.46, 0, 24.88, .139, .085],
  [-2.12, 0, 25.14, .279, .163],
  [-1.77, 0, 25.41, .433, .245],
  [-1.41, 0, 25.68, .573, .327],
]);
const billUnderside = K.ly('bill-underside', gold, bill);
billUnderside.loft = billUnderside.loft.map(({plane, w}, i) => {
  const {z, a, b} = bill[i];
  return {plane, w, pts: K.ring(a + .008, b * .56 + .014, 2, 16).map(([x, h]) =>
    [x * K.mm, (z - b * .44 + h) * K.mm])};
});
// 嘴の中央を一枚の金板にし、白い額当ての下へ差し込む。
const billTip = K.ly('bill-tip', gold, longitudinal([
  [-2.742, 0, 24.66, .019, .019], [-2.45, 0, 24.912, .123, .096],
  [-2.12, 0, 25.199, .206, .148], [-1.78, 0, 25.50, .267, .187],
  [-1.53, 0, 25.71, .278, .219], [-1.36, 0, 25.84, .211, .187],
]));
function billFlank(sx) {
  return {...K.ly('bill-flank-'+sx,gold,longitudinal([
    [-2.70,.006,24.700,.013,.012],[-2.42,.094,24.982,.050,.034],
    [-2.12,.147,25.299,.087,.060],[-1.88,.205,25.527,.102,.069],
    [-1.68,.267,25.704,.111,.084],[-1.51,.317,25.867,.052,.054],
    [-1.45,.328,25.935,.008,.009],
  ]),sx),ruled:true};
}
// 額当ては嘴の金板の上に重なり、正面では中央だけが低い山形に切れる。
const billShield = {
  id:'bill-shield',color:white,ruled:true,
  loft:[
    // 奥行き、中央の高さ、半幅、縁の落差、板厚
    [-2.41,25.016,.012,.005,.038],[-2.12,25.395,.092,.042,.074],
    [-1.90,25.619,.176,.060,.116],[-1.73,25.824,.245,.100,.121],
    [-1.54,26.029,.294,.143,.112],[-1.39,26.202,.282,.151,.113],
    [-1.26,26.336,.219,.125,.106],
  ].map(([y,z,width,drop,thickness])=>{
    const edge=[-1,-.76,-.46,0,.46,.76,1];
    const face=edge.map(u=>[u*width*K.mm,(z-drop*u*u)*K.mm]);
    const underside=face.toReversed().map(([x,h])=>[x,h-thickness*K.mm]);
    return {plane:'xz',w:y*K.mm,pts:[...face,...underside]};
  }),
};
// 頬の下から抜ける兜。前後の各断面を、耳の両側に下がる二枚の曲板でつなぐ。
const canopyStations = [
  // y, 半幅, 頂部, 下縁
  [-1.84,.32,25.68,25.48],[-1.52,.61,26.08,25.61],[-1.27,.77,26.54,25.78],
  [-1.08,.86,26.95,25.93],[-.82,.93,27.32,26.01],[-.60,.98,27.58,26.14],
  [-.30,1.02,27.73,26.25],[0,1.055,27.79,26.33],[.34,1.06,27.82,26.35],
  [.69,1.04,27.74,26.30],[.99,.94,27.55,26.27],[1.18,.78,27.39,26.34],
  [1.31,.57,27.16,26.56],[1.36,.23,26.99,26.79],
];
const visorY = canopyStations.map(row=>row[0]);
function visorSurface(y, angle, lift) {
  const sample = i => K.cr(visorY,canopyStations.map(row=>row[i]),y);
  const width=sample(1), top=sample(2), hem=sample(3);
  const rad=angle*Math.PI/180;
  return [(width+lift)*Math.sin(rad), hem+(top-hem+lift)*Math.cos(rad)];
}
function visorPlate(id,color,sx,rows,lift,thickness) {
  const stations=[];
  const ys=rows.map(row=>row[0]);
  // 開いたときの前殻の端は、素顔の後頭から首へ下がる曲線に沿う。
  const rimY=[-1.42,-1.10,-.89,-.70,-.54,-.43,-.36];
  const rimZ=[27.69,27.49,27.32,27.12,26.88,26.62,26.29];
  const yEnd=Math.min(rimY.at(-1),ys.at(-1));
  const ysRoof=[-1.18,-.96,-.81,-.64,-.42,-.15,.10,.36];
  const lower=[-5,-4,0,28,51,67,74,77];
  const upper=[90,90,89,88,87,85,81,79];
  for(const y of [...new Set([...ys,...ysRoof,...rimY,-.76,-.48,-.39])].sort((a,b)=>a-b)) {
    if(y<ys[0] || y>yEnd) continue;
    const hem=K.cr(visorY,canopyStations.map(r=>r[3]),y);
    const rise=K.cr(visorY,canopyStations.map(r=>r[2]),y)-hem+lift+thickness;
    const fraction=(K.cr(rimY,rimZ,y)-hem)/rise;
    const rimAngle=fraction>=1 ? -90 : Math.acos(Math.max(-1,fraction))*180/Math.PI;
    const a=Math.max(K.cr(ys,rows.map(r=>r[1]),y),K.cr(ysRoof,lower,y),rimAngle);
    const b=Math.min(K.cr(ys,rows.map(r=>r[2]),y),K.cr(ysRoof,upper,y));
    if(b-a>.65) stations.push([y,a,b]);
  }
  const loft=stations.map(([y,from,to])=>{
    const angles=Array.from({length:10},(_,i)=>K.lerp(from,to,i/9));
    const side=(a,h)=>{
      const [x,z]=visorSurface(y,a,h);
      return [sx*x*K.mm,z*K.mm];
    };
    const end = Math.min(.8,(to-from)/12);
    const pts=[side(from-end,lift+thickness/2),...angles.map(a=>side(a,lift+thickness)),
      side(to+end,lift+thickness/2),...angles.reverse().map(a=>side(a,lift))];
    return {plane:'xz',w:y*K.mm,pts:sx<0?pts.reverse():pts};
  });
  if (loft.length < 2) throw new Error(id + ' の前殻の断面が足りません');
  return {id, color, ruled: true, loft};
}
function visorCheek(sx) {
  const blade = (id,color,rows,lift,thick)=>visorPlate(id+'-'+sx,color,sx,rows,lift,thick);
  return [
    blade('vault',pearl,canopyStations.map(([y])=>[y,-1,88]),-.038,.038),
    blade('forehead-shield',white,[[-1.84,-2,6],[-1.60,-2,21],[-1.27,-2,35],
      [-.82,-2,42],[-.64,-2,37],[-.49,2,38],[-.30,4,35],[.34,-2,26],[.69,-2,16],[.99,-2,3]],.002,.042),
    blade('temple-plate',white,[[-1.62,50,79],[-1.39,48,87],[-1.08,44,86],
      [-.82,41,85],[-.30,43,82],[.34,53,81],[.69,57,82],[1.18,70,86]],.001,.031),
    blade('eye',lens,[[-1.70,36,37],[-1.51,41,48],[-1.34,49,61],
      [-1.14,56,68],[-.94,58,68],[-.76,61,66],[-.53,65,66]],.033,.018),
    blade('eye-glint','#7290a0',[[-1.43,51,52],[-1.27,56,59],[-1.04,60,63],
      [-.85,63,65],[-.72,65,66]],.052,.008),
    blade('crest-side',white,[[-1.12,23,24],[-.93,14,31],[-.80,13,32],[-.73,24,29]],.040,.044),
    {...K.ly('hinge-cheek-'+sx,white,longitudinal([
      [-1.14,.67,26.57,.040,.048],[-1.02,.76,26.76,.095,.105],
      [-.86,.81,26.96,.105,.136],[-.72,.84,27.02,.085,.124],
      [-.61,.86,27.04,.041,.061],
    ]),sx),ruled:true},
    {...K.ly('lower-cheek-'+sx,white,longitudinal([
      [-2.39,.104,24.944,.038,.045],[-1.86,.352,25.305,.110,.121],
      [-1.47,.464,25.574,.144,.210],[-1.28,.584,25.73,.131,.214],
      [-1.04,.754,25.93,.082,.186],[-.79,.854,26.15,.067,.129],
      [-.52,.922,26.32,.045,.061],[-.39,.958,26.39,.015,.021],
    ]),sx),ruled:true},
    K.disc('visor-trunnion-'+sx,pearl,.77,1.06,...visorPivot,.146,sx),
    axle('visor-journal-'+sx,frame,1.055,1.258,visorPivot,.052,sx),
    K.disc('pivot-cover-'+sx,pearl,1.220,1.304,...visorPivot,.120,sx),
  ];
}
function sideLink(sx) {
  // 両軸の外側を通る浅い弓形。端は軸受けに入り、中央は白い側板の上に出る。
  const strut = {...K.ly('link-web-'+sx, grey, longitudinal([
    [visorPivot[0]+.101,1.135,visorPivot[1]-.077,.040,.061],
    [-.78,1.207,26.79,.048,.060],[-.66,1.327,26.70,.084,.082],
    [-.49,1.354,26.55,.088,.093],[-.26,1.358,26.38,.084,.100],
    [-.04,1.341,26.24,.078,.108],[.11,1.295,26.16,.078,.106],
    [earPivot[0]-.115,1.140,earPivot[1]+.073,.050,.076],
  ]),sx),ruled:true};
  const bore=(pivot,radius)=> {
    const {plane,pts,span}=axle('','',.72,1.23,pivot,radius,sx);
    return {plane,pts,span};
  };
  const earBore=bore(earPivot,.070), wristBore=bore(visorPivot,.060);
  return [strut,
    {...K.disc('ear-bearing-'+sx,grey,1.056,1.212,...earPivot,.226,sx),cuts:[earBore]},
    {...K.disc('ear-gold-ring-'+sx,gold,1.201,1.244,...earPivot,.220,sx),cuts:[earBore]},
    K.disc('ear-retainer-'+sx,frame,1.241,1.255,...earPivot,.153,sx),
    K.disc('ear-button-'+sx,pearl,1.252,1.267,...earPivot,.134,sx),
    {...K.disc('wrist-bearing-'+sx,grey,1.069,1.209,...visorPivot,.139,sx),cuts:[wristBore]}];
}
// 耳の後ろの覆いはアームが支え、嘴を含む前の殻はその内側へ回る。
function napeLeaves(sx) {
  // 後ろへ行くほど側板を低くし、中央の冠板を頂点にする。
  const rim = (x,y,z) => {
    const aft = Math.min(1,Math.max(0,(y+.78)/1.13));
    const flank = Math.min(1,Math.max(0,(x-.29)/.36));
    // 側面の冠板は耳の後ろでいちばん高く、細い先は外板からわずかに反る。
    const arch = K.cr([-.86,-.61,-.34,-.07,.24,.50,.70,.91,1.08,1.22,1.36,1.48],
      [0,.025,.090,.197,.288,.285,.245,.165,.060,-.025,-.092,-.084],y);
    const top = Math.max(0,Math.min(1,(z-26.58)/.75));
    return z - Math.max(0,z-26.58)*aft*(.22+.16*flank) + top*arch;
  };
  const rows = [
    // y, 側板の中心 x, 下縁, 上縁, 板厚の半分
    [-.86,1.14,26.91,26.95,.017],[-.61,1.15,26.66,27.28,.040],
    [-.34,1.15,26.34,27.34,.045],[-.07,1.15,26.13,27.39,.051],
    [.24,1.16,26.125,27.44,.055],[.46,1.15,26.12,27.46,.060],
    [.70,1.12,26.14,27.46,.075],[.91,1.00,26.39,27.44,.086],
    [1.08,.87,26.70,27.41,.094],[1.22,.74,27.02,27.40,.070],
    [1.34,.66,27.33,27.39,.015],
  ].map(([y,x,lo,hi,w])=>[y,x,rim(x,y,lo),rim(x,y,hi),w]);
  const panel=(id,color,u0,u1,offset,thick,stations=rows)=>({id:id+'-'+sx,color,ruled:true,
    loft:stations.map(([y,x,low,high,width])=>{
      const roll=K.cr([-.43,.22,.70,.88,1.04,1.34],[.010,.072,.20,.255,.24,.135],y);
      const from=typeof u0==='function' ? u0(y) : u0;
      const to=typeof u1==='function' ? u1(y) : u1;
      const pts=K.ring(1,1,2.3,16).map(([a,b])=>{
        const u=K.lerp(from,to,(1+b)/2);
        return [sx*(x-roll*u*u + .050*Math.sin(Math.PI*u)+offset+width*thick*a)*K.mm,
          K.lerp(low,high,u)*K.mm];
      });
      return {plane:'xz',w:y*K.mm,pts:sx<0?pts.reverse():pts};
    })});
  const trailingScale = {
    id:'occipital-overlap-'+sx,color:white,ruled:true,
    loft:[
      // x、前縁、後縁、前縁の高さ、後縁の高さ、板の丸み
      [.289,1.33,1.37,27.43,27.46,.015],[.37,1.12,1.42,27.38,27.47,.065],
      [.48,.94,1.40,27.32,27.49,.093],[.60,.88,1.35,27.23,27.43,.107],
      [.72,.81,1.27,27.13,27.34,.112],[.86,.58,1.12,27.02,27.22,.100],
      [1.01,.45,.94,26.98,27.12,.078],[1.15,.55,.78,27.00,27.07,.044],
      [1.18,.62,.67,27.025,27.04,.012],
    ].map(([x,fore,aft,low,high,depth])=>{
      const pts=K.ring(1,1,2,20).map(([u,v])=>{
        const t=(u+1)/2;
        const y=K.lerp(fore,aft,t);
        return [y*K.mm,rim(x,y,K.lerp(low,high,t)+depth*(.55*(1-u*u)+v))*K.mm];
      });
      return {plane:'yz',w:sx*x*K.mm,pts};
    }),
  };
  return [
    trailingScale,
    panel('poll-guard',pearl,0,1,0,1),
    panel('poll-lamella',white,
      y=>K.cr([-.61,-.34,-.07,.24,.46,.70,.91,1.08,1.22,1.34],
        [.29,.35,.46,.57,.66,.71,.73,.74,.77,.80],y),.99,.044,.55,rows.slice(1)),
    {...K.ly('ear-cheek-'+sx,pearl,longitudinal([
      [-.91,1.14,25.96,.017,.026],[-.72,1.17,26.03,.039,.078],
      [-.47,1.18,26.16,.056,.140],[-.20,1.18,26.23,.065,.182],
      [.02,1.18,26.21,.065,.154],[.18,1.19,26.14,.051,.104],
      [.28,1.19,26.11,.031,.039],
    ]),sx),ruled:true},
    {id:'temporal-shingle-'+sx,color:white,ruled:true,loft:[
      // 前の細い縁から耳の上を覆い、後ろへ跳ねる。軸穴の前では輪郭を落とす。
      [-1.05,26.03,26.06],[-.91,26.04,26.18],[-.75,26.08,26.31],
      [-.60,26.12,26.42],[-.35,26.16,26.58],[-.06,26.18,26.82],
      [.21,26.21,27.13],[.46,26.39,27.17],[.69,26.72,27.18],
      [.88,26.99,27.16],[.96,27.10,27.13],
    ].map(([y,low,high])=>{
      const pts=K.ring(1,1,2.3,20).map(([u,v])=>{
        const t=(v+1)/2;
        return [sx*(1.231+.012*Math.sin(Math.PI*t)+.019*u)*K.mm,
          K.lerp(low,high,t)*K.mm];
      });
      return {plane:'xz',w:y*K.mm,pts:sx<0?pts.reverse():pts};
    })},
    panel('poll-inlay',gold,
      y=>K.cr([.24,.46,.70,.91,1.08,1.22,1.34],[.012,.17,.37,.51,.60,.68,.75],y),
      y=>K.cr([.24,.46,.70,.91,1.08,1.22,1.34],[.14,.35,.56,.71,.79,.85,.88],y),
      .076,.62,rows.slice(4)),
    {...K.ly('poll-crest-'+sx,white,longitudinal([
      [-.82,1.16,26.99,.022,.018],[-.46,1.13,27.24,.075,.047],
      [-.10,1.11,27.34,.086,.042],[.24,1.06,27.43,.105,.045],
      [.53,.97,27.47,.143,.068],[.84,.81,27.50,.133,.058],
      [1.07,.72,27.49,.114,.052],[1.28,.60,27.52,.071,.036],
      [1.45,.55,27.65,.011,.009],
    ].map(([y,x,z,a,b])=>[y,x,rim(x,y,z),a,b])),sx),ruled:true},
  ];
}
add('helmet-arm','耳の持上げアームと後頭の覆い',[-1,1].flatMap(sx=>[...sideLink(sx),...napeLeaves(sx)].map(seatTemple)));
// 嘴の上から軸側へ反る薄い額殻。中央を高くし、左右の裾は既存の頬板に重ねる。
function browShell() {
  // 中央の額板は嘴の根元でV字に絞る。両脇に頬板と細長い目が見える幅を取る。
  const sections = [
    [-2.47,24.94,.014,.009],[-2.31,25.10,.083,.038],[-2.09,25.51,.184,.090],
    [-1.86,25.92,.296,.145],[-1.64,26.28,.395,.176],[-1.44,26.57,.455,.227],
    [-1.27,26.80,.482,.274],[-1.12,26.95,.455,.258],[-1.00,27.12,.375,.195],
    [-.91,27.24,.250,.116],[-.85,27.30,.100,.044],
  ];
  return {id:'brow-shell',color:white,ruled:true,loft:sections.map(([y,z,width,drop])=>{
    const arc = [-1,-.94,-.80,-.62,-.42,-.2,0,.2,.42,.62,.80,.94,1].map(u =>
      [width*u*K.mm,(z-drop*u*u)*K.mm]);
    const back = arc.toReversed().map(([x,h])=>[x,h-.037*K.mm]);
    const pts = [...arc,...back];
    return {plane:'xz',w:y*K.mm,pts};
  })};
}

// 額殻の軸寄りを嘴の側へ滑らかに絞り、持上げ中に素顔の冠板が通るくぼみを作る。
function relieveBrow(shape) {
  if (!/^(vault-|forehead-shield|temple-plate|eye-|crest-|brow-shell)/.test(shape.id)) return shape;
  return {...shape,loft:shape.loft.map(section => {
    const u = Math.max(0,Math.min(1,(section.w/K.mm + 1.72)/.92));
    const blend = u*u*(3-2*u);
    return {...section,w:section.w-.18*K.mm*blend,
      pts:section.pts.map(([x,z])=>[x,z-.24*K.mm*blend])};
  })};
}
add('helmet','兜（白鳥の頭）',[
  billUnderside, billTip, ...[-1,1].map(billFlank), billShield, K.ly('bill', white, bill),
  ...[-1,1].flatMap(visorCheek), browShell(),
  {...K.ly('crest-center',white,longitudinal([
    [-1.14,0,26.84,.028,.033],[-1.055,0,27.00,.077,.051],
    [-.97,0,27.16,.114,.057],[-.91,0,27.25,.085,.051],[-.86,0,27.29,.020,.019],
  ])),ruled:true},
].map(relieveBrow).map(seatTemple));
const upper = line([19.39, 19.84, 20.65, 21.8, 22.8, 23.68, 24.15],
  [.253, .283, .347, .386, .41, .42, .24], [-.46, -.53, -.57, -.64, -.66, -.62, -.44],
  [.084, .096, .108, .13, .12, .085, .05], [2.29, 2.29, 2.20, 2.07, 2.00, 2.02, 2.09]);
const fore = line([16.94, 17.21, 17.70, 18.33, 18.93, 19.4, 19.84],
  [.164, .165, .188, .247, .299, .26, .15], [-.53, -.61, -.618, -.641, -.630, -.55, -.39],
  [-.16, -.063, -.012, .020, .069, .09, -.02], [2.49, 2.48, 2.43, 2.37, 2.32, 2.32, 2.29]);
const thigh = line([9.38, 9.96, 11.2, 12.55, 14.1, 15.55, 16.8, 17.85, 18.45],
  [.25, .34, .43, .48, .58, .65, .60, .39, .21],
  [-.42, -.60, -.77, -1.03, -1.27, -1.42, -1.49, -1.27, -.90],
  [.17, .24, .37, .47, .57, .60, .44, .23, -.10],
  [1.16, 1.13, 1.11, 1.11, 1.16, 1.18, 1.18, 1.12, 1.06]);
const shin = line([1.88, 2.00, 2.34, 2.91, 3.44, 4.77, 6.03, 7.72, 8.64, 9.39],
  [.235, .24, .242, .29, .231, .282, .355, .54, .44, .29],
  [-.327, -.30, -.335, -.62, -.54, -.52, -.66, -.84, -.56, -.42],
  [.255, .26, .227, .16, .185, .24, .44, .81, .54, .15],
  [1.24, 1.24, 1.24, 1.26, 1.28, 1.29, 1.29, 1.24, 1.18, 1.16]);

const thighGuardStations = [
      [11.33, -109, .031, .012, .025], [12.97, -100, .065, .211, .063],
      [14.40, -86, .079, .396, .066], [15.62, -72, .077, .451, .071],
      [16.71, -54, .065, .383, .073], [17.56, -40, .056, .242, .058],
      [18.31, -28, .026, .039, .042],
    ];
const thighGuardHeights = thighGuardStations.map(row => row[0]);
const thighGuardSections = Array.from({length: 21}, (_, i) => {
  const z = K.lerp(thighGuardHeights[0], thighGuardHeights.at(-1), i/20);
  return [z, ...[1,2,3,4].map(column => K.cr(thighGuardHeights,
    thighGuardStations.map(row => row[column]), z))];
});

const greaveZ = [5.73, 6.06, 6.52, 7.10, 7.72, 8.18, 8.65, 9.16];
const greaveWidth = [2, 12, 24, 38, 55, 66, 48, 18];
function greavePanel(sx, edge = 0) {
  const end = edge ? 7.94 : greaveZ.at(-1);
  const loft = Array.from({length: 22}, (_, i) => {
    const z = K.lerp(greaveZ[0], end, i / 21);
    const width = K.cr(greaveZ, greaveWidth, z);
    const rim = edge ? 1.2 + 4.6 * Math.sin(Math.PI * i / 21) ** .72 : width;
    const center = -90 + edge * (width + rim * .56);
    const pts = K.ring(1, 1, 2, 20).map(([u, v]) => {
      const p = K.onLines(shin, z, center + rim * u, edge ? .052 + .020 * v : .046 + .024 * v);
      return [sx * p.x * K.mm, p.y * K.mm];
    });
    return {plane: 'xy', w: z * K.mm, pts: sx < 0 ? pts.reverse() : pts};
  });
  return {id: edge ? 'greave-front-trim-' + edge : 'greave', color: edge ? gold : white, loft, ruled: true};
}

const leadingEdge = line(
  [10.52, 11.35, 13.25, 15.7, 18.1, 20.15, 22.2, 22.93, 23.28, 23.56, 24.34, 24.69],
  [.033, .13, .27, .36, .43, .48, .42, .33, .28, .27, .32, .19],
  [1.25, 1.16, .95, .68, .44, .35, .44, .44, .44, .40, .40, .61],
  [1.37, 1.53, 1.54, 1.61, 1.61, 1.72, 1.84, 1.79, 1.76, 1.67, 1.39, 1.05],
  [2.93, 3.04, 3.20, 3.25, 3.16, 2.98, 2.80, 2.92, 2.87, 2.62, 2.13, 1.97],
);
const coverts = [
  [22.69, 24.56, -104, -108], [21.17, 24.04, -87, -82], [18.94, 22.96, -71, -29],
  [16.22, 21.39, -54, -18], [13.19, 19.34, -54, -12], [10.54, 16.67, -65, -24],
];

const wingRootHeight = 24.23;
const secondaryCount = 12;
// 腹側の穴をふさぐ内側の次列は、飛行時だけ胴の縁へ深く差し掛ける。
const flightRootSweep = [17.5, 14.2, 10.7, 7.4, 4.4, 1.9, .6];
const tuckBlend = z => Math.min(1, Math.max(0, (14.6 - z) / (14.6 - 9.45))) ** 1.5;
const feathers = Array.from({length: secondaryCount + 10}, (_, i) => {
  const primary = i >= secondaryCount;
  const k = primary ? i - secondaryCount : i;
  const root = primary ? 4.3 + .36 * k : 1.40 + .81 * k;
  const open = primary ? 75 - 4.6 * k : 86 - .98 * k;
  const length = primary
    ? 10.4 + .82 * k
    : 8.55 + 1.05 * Math.sin((k + 1) * Math.PI / 13) + .42 * Math.cos(k * Math.PI / 2);
  const mantleReach = primary
    ? 13.3 + 1.6 * k / 9 - root
    : Math.min(8.7, 14.0 + .7 * Math.cos(k * .9) - root);
  const folded = Math.min(length, Math.max(.40 * length, mantleReach));
  const lift = primary ? 1.12 * (1 - k / 9) : 1.25 + .325 * (k % 3);
  // 次列9・11は手根寄りで隣の羽弁にかぶせる差し込み代を残す。
  const overlap = !primary && k === 8 ? .75 : !primary && k === 10 ? .50 : 1;
  const tipLift = lift * tuckBlend(wingRootHeight - root - folded) * overlap;
  return {primary, root, open, length, folded, lift, tipLift, x: 3.18 - .088 * i,
    y: 1.62 - .004 * i, width: primary ? .88 : 1.18};
});

function fitWingOutline(shape, sx) {
  const depthAt = (yMm, zMm) => {
    const y = yMm / K.mm;
    const t = Math.max(0, Math.min(1, (zMm / K.mm - 21.2) / 2.0));
    const bend = t * t * (3 - 2 * t);
    const rootLift = .48 * bend * Math.max(0, Math.min(1, (1.25 - y) / .9));
    const trailingEdge = .19 * Math.max(0, y - 1.25) ** 1.6;
    const trailingRelief = .036 * Math.max(0, y - 1.75) ** 1.6;
    const depth = y + rootLift - trailingEdge + trailingRelief;
    const height = zMm / K.mm;
    const upperFan = Math.max(0, 1 - Math.abs(height - 20.5) / 4);
    const lowerFan = Math.max(0, 1 - Math.abs(height - 12.6) / 2.7);
    const opening = Math.max(0, Math.min(1, (depth - 1.4) / 1.2));
    const sweepDepth = depth + (.49 * upperFan + .45 * lowerFan) * opening * Math.max(0, 2.82 - depth);
    return K.mm * (sweepDepth - .56 * Math.max(0, sweepDepth - 3.43));
  };

  return {...shape, loft: shape.loft.map(section => {
    if (section.plane !== 'xy') {
      return {...section, pts: section.pts.map(([u, v]) => [depthAt(u, v), v])};
    }
    const distalBlend = start => Math.max(0, Math.min(1, (start - section.w) / (start - 9760)));
    const z = section.w + 800 * distalBlend(13600) ** 1.8;
    const waist = Math.max(0, 1 - ((z / K.mm - 16) / 2.35) ** 2);
    const belowWaist = Math.max(0, 1 - ((z / K.mm - 12) / 1.85) ** 2);
    const inset = sx * 170 * distalBlend(15500) ** 1.4;
    const fitWidth = x => {
      const outer = Math.max(0, Math.min(1, (Math.abs(x) - 2750) / 620));
      return x - sx * (sx === 1 ? outer * (100 * waist + 155 * belowWaist) : 40 * outer * Math.max(0, 1 - Math.abs(z / K.mm - 18) / 2.6));
    };
    return {...section, w: z,
      pts: section.pts.map(([u, v]) => [fitWidth(u - inset), depthAt(v, section.w)])};
  })};
}

function featherPlate(id, color, sections, sx) {
  const rows = sections.map(([radius, x, y, thickness, halfWidth]) => [
    wingRootHeight - radius, x, y, thickness, halfWidth,
  ]).reverse();
  return {...K.lz(id, color, horizontal(rows), sx), ruled: true};
}

// 風切の羽弁を羽軸の両側へ張り出し、軸と先羽は隣り合う薄い層に収める。
function fanBlade(i, sx) {
  const f = feathers[i];
  const center = f.y + .47;
  const reach = f.folded - .12;
  const section = (t, offset, depth, width) =>
    [f.root + t * reach, f.x, center + offset, depth, width];
  const blade = featherPlate('quill', i % 3 === 0 ? pearl : white, [
    section(0, -.47, .014, .046), section(.07, -.23, .014, .41),
    section(.19, -.04, .016, .70), section(.42, .02, .016, f.width * .85),
    section(.71, .05, .016, f.width), section(.89, .055, .013, f.width * .88),
    section(.96, .080, .011, f.width * .48),
    section(1, .105, .008, f.width * (f.primary ? .055 : .18)),
  ], sx);
  const scales = Array.from({length: 3}, (_, row) => {
    const start = .006 + row * .085, extent = .20 + row * .060;
    // 最内列の根元は肩の外板の下を通る短く細い雨覆にする。
    const rootScale = i === 0 && row === 0;
    const scaleCenter = rootScale ? f.y + .13 : center;
    return featherPlate('covert-row-' + (row + 1), ['#e8e3d6', '#f4f2ec', '#dedfdc'][row], [
      [0, .07, -.36], [.24, .34, -.18], [.58, .52, 0], [.84, .38, .10], [1, .042, .17],
    ].map(([t, width, offset]) => [f.root + (start + t * extent) * reach,
      f.x + .018 + (2 - row) * .002, scaleCenter + offset * (rootScale ? .25 : 1),
      .006, width * (rootScale ? .30 : 1.32)]), sx);
  });
  return [blade, ...scales].map(shape => tuckFeather(shape, sx, i, i !== secondaryCount - 1));
}

function slidingVane(i, sx) {
  const f = feathers[i];
  const stations = f.primary
    ? [[0,.33,.00],[.18,.84,.04],[.43,1,.06],[.61,.94,.04],[.78,.72,-.05],[.90,.42,-.19],[1,.016,-.48]]
    : [[0,.38,.00],[.20,.85,.04],[.48,1,.11],[.77,.99,.16],[.93,.89,.18],[.98,.55,.20],[1,.10,.21]];
  // 外端の羽だけ先の長さを詰め、収納時に太ももの下端をわずかに越す。
  const tip = f.folded - (i === feathers.length - 1 ? .040 : 0);
  // 収納時も先端が一列に揃わないよう、先羽の後縁は外へ順に反らせる。
  const distalSweep = f.primary ? .29 + .045 * (i - secondaryCount) : .075;
  const root = .25;
  return tuckFeather(featherPlate(f.primary ? 'primary-tip' : 'secondary-tip', i % 3 === 1 ? '#ebe8e1' : white,
    stations.map(([t,width,offset]) => [f.root + K.lerp(root,tip,t), f.x - .044,
      f.y + .49 + offset + distalSweep * t ** 4, .008, f.width * width]), sx),sx,i);
}

function tuckFeather(shape, sx, index, taperTip = true) {
  const f = feathers[index];
  const front = sx > 0 ? 1.57 : 1.55;
  const back = sx > 0 ? 3.02 : 2.65;
  const loft = shape.loft.map(section => {
    const depths = section.pts.map(([, y]) => y / K.mm);
    const near = Math.min(...depths), far = Math.max(...depths);
    const low = Math.max(front, near), high = Math.min(back, far);
    // 外套の先では中羽と先羽が前・中・後ろの三列に収まる。
    // 次列の最外側の羽軸をまっすぐに通し、伸びた手根の通り道を残す。
    const blend = taperTip ? tuckBlend(section.w / K.mm) : 0;
    const track = [.94, .17, .54][index % 3];
    const target = K.lerp(front, back, track);
    const taper = blend * (f.primary ? .94 : .55);
    const z = section.w / K.mm;
    const lowerEdge = sx > 0 ? .112 * Math.max(0, 1 - Math.abs(z - 12.0) / 2.2) : 0;
    const pts = section.pts.map(([x, y]) => {
      const depth = K.lerp(low, high, (y / K.mm - near) / (far - near));
      const foldedDepth = K.lerp(depth, target, taper);
      const aft = Math.max(0, Math.min(1, (foldedDepth - 2.70) / .30));
      return [x, K.mm * (foldedDepth + lowerEdge * aft)];
    });
    return {...section, w: section.w + f.lift * blend * K.mm, pts};
  });
  return {...shape, loft};
}

const carpalTravel = 6.45;
function spar(sx, primary) {
  const group = feathers.filter(feather => feather.primary === primary);
  const rod = (name, sections) => featherPlate(name, white, sections, sx);
  const center = primary ? 1.395 : .98;
  // 手根は前腕の後面に沿って通し、外側の次列の軸受けを避ける。
  const stations = group.map(f => [f.root, primary ? f.x - .19 : f.x, center,
    primary ? .25 : .33, primary ? .080 : .30]);
  const [root, x, y, depth, width] = stations[0];
  const rods = primary ? [
    rod('carpometacarpus', [
      [root - 3.7, x + depth * .81, y, depth * .17, width * .39],
      [root - 3.48, x + depth * .54, y, depth * .46, width * .78],
      [root - 3.06, x + depth * .23, y, depth * .77, width * .95],
      [root - 2.65, x, y, depth, width], ...stations,
    ]),
  ] : [
    rod('humerus', [[0, 2.1, 1.10, .38, .40], stations[0], stations[3]]),
    rod('ulna', [stations[3], stations[7], stations.at(-1)]),
  ];
  // 手根の直線部に滑り子を設け、前腕側のコの字溝で両縁を抱く。
  // 全開でも、滑り子の根元が溝の末端を通り抜けない。
  if (primary) {
    rods.push(K.box('carpal-shoe', grey, [2.173, 1.343, 19.98], [2.196, 1.447, 23.60], sx));
  } else {
    const channel = [
      [2.155,1.327],[2.222,1.327],[2.222,1.463],[2.155,1.463],
      [2.155,1.442],[2.167,1.442],[2.167,1.452],[2.211,1.452],
      [2.211,1.338],[2.167,1.338],[2.167,1.348],[2.155,1.348],
    ];
    rods.push({id:'carpal-channel', color:grey, plane:'xy', span:[16750,22200],
      pts:channel.map(([x,y]) => [sx*x*K.mm,y*K.mm])});
    for (const [i, z] of [17,21.2].entries()) {
      const radius = wingRootHeight - z;
      const shaftX = K.cr(group.map(f => f.root), group.map(f => f.x), radius);
      rods.push(K.box('carpal-bracket-' + (i+1), pearl, [2.215,.98,z-.055], [shaftX,1.352,z+.055], sx));
    }
  }
  const sockets = group.map((f,i)=>K.ly('socket-'+(i+1),gold,longitudinal([
    [center-.01,f.x-.001,wingRootHeight-f.root,.011,.040],[f.y,f.x-.001,wingRootHeight-f.root,.009,.029],
  ]),sx));
  const pins = group.map((f,i)=>K.disc('axle-'+(i+1),gold,f.x-.008,f.x+.012,f.y,wingRootHeight-f.root,.034,sx));
  const lining = primary ? [] : [0,1,2].map(i => featherPlate('axillary-covert-'+(i+1),
    i === 1 ? pearl : white, [
      [.04+i*.31,2.64+i*.09,1.21,.043,.16],
      [1.1+i*.61,3.55+i*.11,1.69,.053,.46],
      [2.4+i*.72,3.61+i*.09,1.83,.055,.58],
      [2.83+i*.70,3.54+i*.09,1.97,.034,.31],
      [3.25+i*.68,3.53+i*.09,2.10,.011,.032],
    ],sx));
  return [...rods,...sockets,...pins,...lining];
}

function shoulderMantle(sx) {
  const rear = sx > 0 ? .16 : 0;
  const mantle = [
    [-.12, 2.74, 1.61, .042, .119],
    [.36, 3.03, 1.70, .044, .32],
    [1.06, 3.66, 1.71, .045, .56],
    [2.15, 4.15, 1.77, .043, .78],
    [3.55, 4.24, 1.77 + rear, .046, .87],
    [5.6, 4.24, 1.78 + rear + (sx > 0 ? .052 : 0), .047, sx > 0 ? .972 : .92],
    [7.7, 4.23, 1.91 + rear, .046, .89],
    [8.23, 4.208, 1.935 + rear, .045, .84],
    [9.4, 4.16, 1.99 + rear, .042, .73],
    [10.8, 3.92, 1.94 + rear, .040, .63],
    [12.15, 3.74, 1.83 + rear, .033, .31],
    [13.1, 3.57, 1.94, .020, .038],
  ].map(([r, x, y, a, b]) => {
    const inset = .39 * Math.max(0, Math.min(1, (r - .80) / 2.75));
    // 左右が畳む途中ですれ違うよう、左の後縁を出した分だけ右の後縁を逃がす。
    const rearOffset = sx > 0
      ? K.cr([0, 5.60, 7.70, 9.40, 10.80, 13.10], [0, .15, .49, .50, .26, 0], r)
      : K.cr([0, 5.60, 7.70, 9.40, 10.80, 13.10], [0, -.13, -.46, -.34, -.13, 0], r);
    const contourInset = K.cr([0, 1.06, 2.15, 5.60, 8.23, 10.80, 12.15, 13.10],
      [0, .015, .028, .034, .034, .066, .122, .127], r);
    const rearLip = sx > 0 ? K.cr([0, 5.60, 7.70, 8.23, 9.40, 10.80, 12.15, 13.10],
      [0, .012, .097, -.060, -.028, .061, .113, .045], r)
      : K.cr([0, 5.60, 7.70, 8.23, 9.40, 13.10], [0, -.092, -.170, -.140, -.060, 0], r);
    const sweep = (rearOffset + rearLip) / 2;
    return [r, x - inset - contourInset, y + sweep, a, b + sweep];
  });
  const contour = [...mantle, [14.18, 3.22, 2.30, .014, .22]];
  const atRadius = r => {
    const i = contour.findIndex(row => row[0] >= r);
    const hi = contour[i], lo = contour[Math.max(0, i - 1)];
    const t = hi === lo ? 0 : (r - lo[0]) / (hi[0] - lo[0]);
    return hi.slice(1).map((value, col) => K.lerp(lo[col + 1], value, t));
  };
  // 肩側の短い板を上に、ももへ届く長い板を下に差す。
  const panels = [
    [.68, 2.22], [.86, 3.78], [1.02, 5.70], [1.42, 8.15],
    [2.04, 10.59], [3.70, 12.78], [5.65, 14.18],
  ];
  const backing = mantle.map(([r, x, y, a, b]) => {
    const bevel = Math.min(1, Math.max(0, (r - 1.2) / 2.2)) * .20 * b;
    return [r, x - .46 * a, y - bevel, .54 * a, b - bevel];
  });
  const plates = panels.map(([root, tip], i) => {
    const knots = [
      [1.06, 1.37, 1.70, 1.96], [1.06, 1.68, 2.15, 3.04, 3.55],
      [1.42, 2.15, 2.84, 3.55, 4.90], [2.15, 3.55, 4.60, 5.60, 7.70],
      [2.84, 3.55, 5.60, 7.70, 9.40], [4.60, 5.60, 7.70, 9.40, 10.80, 12.15],
      [7.70, 9.40, 10.80, 12.15, 13.10],
    ][i];
    const loft = [root, ...knots, tip].reverse().map(r => {
      const t = (r - root) / (tip - root);
      const [x, y, a, b] = atRadius(r);
      const center = K.lerp(-.86, 1.015, t ** .88);
      const width = .012 + .62 * Math.sin(Math.PI * t) ** .90;
      const waist = K.cr([0, 4.0, 6.75, 7.70, 9.40, 10.80, 12.15, 14.18],
        [0, 0, .70, 1, 1, .65, .15, 0], r);
      const shoulder = Math.max(0, 1 - Math.abs(r - 2.15) / 1.0);
      const surface = [];
      for (let k = 0; k < 20; k++) {
        const theta = k * 2 * Math.PI / 20;
        const u = center + width * Math.cos(theta);
        const shell = a * Math.sqrt(Math.max(0, 1 - u * u));
        const ridge = .018 + (6 - i) * .014 + .009 * Math.sin(theta);
        // 外套を畳む途中で向かい合う二枚の後縁に逃げを設ける。
        const setback = Math.max(0, waist) * (sx > 0 ? .083 : .18) * Math.max(0, Math.min(1, u));
        // 後ろ寄りの長羽は外縁を背中側へ巻き、背面にも羽板の面を見せる。
        const rolled = i >= 4 ? Math.max(0, u) ** 1.7 *
          Math.sin(Math.PI * t) * (.12 + .052 * (i - 4)) : 0;
        surface.push([sx * (x + shell + ridge - .021 * shoulder - rolled) * K.mm,
          (y + b * u - setback) * K.mm]);
      }
      return {plane: 'xy', w: (wingRootHeight - r) * K.mm,
        pts: sx > 0 ? surface.reverse() : surface};
    });
    return {id: 'mantle-cover-' + (i + 1), color: i % 2 ? '#ebe9e3' : white, ruled: true, loft};
  });
  return [featherPlate('shoulder-mantle', pearl, backing, sx), ...plates];
}

function clearFeatherSpine(shape) {
  return {...shape, loft: shape.loft.map(section => {
    const front = Math.min(...section.pts.map(([, y]) => y));
    const back = Math.max(...section.pts.map(([, y]) => y));
    const blend = Math.max(0, Math.min(1, (section.w - 21500) / 1800));
    const rear = K.lerp(1125, 1460, blend);
    const rearLimit = Math.max(front + 90, rear);
    return {...section, pts: section.pts.map(([x, y]) =>
      [x, K.lerp(front, Math.min(back, rearLimit), (y - front) / (back - front))])};
  })};
}

function seamAt(shape, offset) {
  if (offset === 0) return shape;
  return { ...shape, loft: shape.loft.map(section => {
    const {pts} = section;
    return { ...section, pts: [...pts.slice(offset), ...pts.slice(0, offset)] };
  }) };
}

function jointCap(id, sx, x0, x1, y, z, r, inset = .72) {
  return [
    K.disc(id + '-seat', frame, x0, x1, y, z, r * 1.06, sx),
    K.disc(id + '-rim', gold, x1 - .015, x1 + .055, y, z, r, sx),
    K.disc(id + '-inset', pearl, x1 + .045, x1 + .09, y, z, r * inset, sx),
  ];
}
function faceCap(id, sx, x, y, z, width, height = width, facing = -1, roundness = 2) {
  const section = (offset, scale) => [y + facing * offset, x, z, width * scale, height * scale];
  const band = (name, color, start, end, scale) => K.ly(id + '-' + name, color,
    longitudinal([section(start, scale), section(end, scale)]).map(row => ({...row, n: roundness})), sx);
  return [
    band('rim', gold, -.093, .039, 1),
    band('ring', frame, .035, .056, .771),
    band('inset', pearl, .050, .075, .706),
  ];
}

function shoulderCap(sx, lateral) {
  const r = lateral ? .365 : .372;
  const prefix = lateral ? 'shoulder-side-' : 'shoulder-front-';
  const stack = [
    ['base', frame, -.10, .013, 1],
    ['silver-rim', pearl, .007, .032, .965],
    ['gold-band', gold, .025, .051, .790],
    ['inset', frame, .045, .062, .550],
    ['inner-ring', '#a9a6a5', .057, .071, .471],
    ['hub', frame, .067, .080, .293],
    ['center', '#dcdbd9', .075, .090, .240],
  ];
  return stack.map(([name, color, back, front, radius]) => {
    const size = r * radius;
    const bevel = Math.min(.009, (front - back) * .43);
    const bevelWidth = Math.min(.014, size * .075);
    const sections = [[back, size], [front - bevel, size], [front, size - bevelWidth]];
    return {
      id: prefix + name, color, ruled: true,
      loft: sections.map(([offset, radius]) => ({
        plane: lateral ? 'yz' : 'xz',
        w: (lateral ? sx * (2.43 + offset) : -.69 - offset) * K.mm,
        pts: K.ring(radius, radius, 2, 24).map(([u, v]) => [
          (lateral ? -.32 + u : sx * (2.02 + u)) * K.mm,
          ((lateral ? 23.87 : 23.88) + v) * K.mm,
        ]),
      })),
    };
  });
}

function jointFairing(id, sx, x, y, z, width, height, facing, roundness) {
  return K.ly(id, white, [
    {y: y - facing * .093, x, z, a: width, b: height, n: roundness},
    {y: y + facing * .032, x, z, a: width * .94, b: height * .94, n: roundness},
  ], sx);
}

const standardJoints = motion.joints.map(j => {
  const at = j.parent.offset.translation.map(n => n.literalMm / 1000);
  const axis = j.parent.offset.rotation[1] > .5 ? 'x' : 'z';
  const wideLimit = j.type === 'planar' || ['j-tail', 'j-neck3'].includes(j.id) ||
    j.id.startsWith('j-wing-') || j.id.startsWith('j-hip-');
  const eps = j.id.startsWith('j-helmet') ? 0 : (wideLimit ? 1.5 : .5);
  const limits = Object.fromEntries(j.limits.map(({of, min, max}) => [of,
    of.startsWith('angle') ? [min * 180 / Math.PI + eps, max * 180 / Math.PI - eps] : [(min + 1) / 1000, (max - 1) / 1000],
  ]));
  return { id: j.id, name: j.name, type: j.type, parent: j.parent.componentPath[0].slice(2), child: j.child.componentId.slice(2), at, axis, limits };
});
const poseValue = (type, values) => {
  const deg = angle => angle.literalRad * 180 / Math.PI;
  if (type === 'planar') return [values.u.literalMm / 1000, values.v.literalMm / 1000, deg(values.angle)];
  if (type === 'slider') return values.distance.literalMm / 1000;
  if (type === 'spherical') return [deg(values.angle), deg(values.angle2), deg(values.angle3)];
  return deg(values.angle);
};
const forms = motion.configurations.map(({name, values}) => ({
  name,
  pose: Object.fromEntries(standardJoints.map(j => [j.id, poseValue(j.type, values[j.id])])),
}));
const attachments = [];
const fanJoints = [];
const fanSlides = [];
const fanCarpi = [];
const tailJoints = [];
const flightForm = forms.find(({name}) => name === 'FM-01 飛ぶ形');
const standingForm = forms.find(({name}) => name === 'FM-02 人の形');
const shoulderSlide = 1.29;
const shoulderCoverJoints = [];
function shoulderCover(sx) {
  // 展開時の胸脇から肩先までの輪郭。収納時は左右の胸板の内側へ通す。
  const loft = shoulderCoverStations.map(([z, left, right]) => {
    const pts = K.ring(1, 1, 2.5, 20).map(([u,v]) => {
      const x = K.lerp(Math.max(shoulderSlide + .035, left), right, (1+u)/2) - shoulderSlide;
      const surface = coverDepth(z) + .105 * u*u;
      return [sx * x * K.mm, (surface + .046*v) * K.mm];
    });
    return {plane:'xy', w:z*K.mm, pts:sx<0?pts.reverse():pts};
  });
  return {id:'pectoral-covert',color:white,ruled:true,loft};
}
const reused = new Map();
const fixed = (child, parent, name, at) => attachments.push({
  id: 'j-' + child, type: 'revolute', name, parent, child, at, axis: 'x', limits: {angle: [0, 0]},
});
function reuse(id, name, source, sx) {
  const original = extremities.components.find(c => c.id === source);
  const shapes = sx === 1 ? original.shapes : original.shapes.map(shape => ({
    ...shape,
    loft: shape.loft.map(section => section.plane === 'yz' ? { ...section, w: -section.w } : {
      ...section, pts: section.pts.map(([x, v]) => [-x, v]).reverse(),
    }),
  }));
  add(id, name, shapes);
  if (sx === 1) reused.set(id, source);
}
reuse('tail', '尾羽', 'tail', 1);
add('tail-comb', '尾羽の受け金', [
  K.lz('tail-rail', pearl, horizontal([
    [13.92,0,1.03,.10,.105], [14.12,0,1.08,.11,.11], [15.2,0,1.13,.14,.10],
    [17.25,0,1.15,.21,.11], [19.35,0,1.16,.19,.11],
  ])),
  K.ly('socket',gold,longitudinal([
    [1.08,0,19.34,.16,.085],[1.15,0,19.32,.22,.138],[1.51,0,19.27,.22,.15],
  ])),
]);
fixed('tail-comb','tail','尾羽の取付',[0,.99,14.04]);

for (const [side, jp, sx] of [['l', '左', 1], ['r', '右', -1]]) {
  const wing = [
    K.lines('leading-edge', pearl, leadingEdge, sx, 18),
    K.plate('leading-edge-upper-cover', white, leadingEdge, 16.78, 24.57,
      sweep(-69, -100, 28, 5), .008, .079, sx, 11),
    K.plate('leading-edge-lower-cover', pearl, leadingEdge, 10.72, 18.59,
      sweep(-67, -56, 20, 4), .008, .071, sx, 11),
    ...coverts.map(([tip, root, c0, c1], i) => {
      const covert = K.plate('covert-' + (i + 1), i % 2 ? white : pearl, leadingEdge, tip, root,
        sweep(c0, c1, 36, 3), .071 + i * .006, .067, sx, i === 2 || i === 3 ? 12 : 7);
      if (i === 2) return seamAt(covert, sx === 1 ? 0 : 10);
      return i === 3 ? {...covert, ruled: true} : covert;
    }),
    // 外套の内側の長羽。横断面を前へ反らせ、収納した羽軸の前に重ねる。
    {...K.lz('under-covert', white, horizontal([
      [9.23, 1.97, 1.10, .011, .013, -6],
      [9.47, 2.032, 1.084, .100, .046, -7],
      [9.98, 2.16, 1.06, .253, .090, -8],
      [11.40, 2.32, 1.01, .551, .106, -11],
      [12.33, 2.38, .902, .681, .120, -10],
      [13.43, 2.43, .770, .761, .128, -10],
      [15.55, 2.52, .616, .822, .125, -8],
      [17.48, 2.60, .590, .745, .116, -7],
      [19.47, 2.59, .633, .563, .109, -7],
      [21.18, 2.55, .854, .301, .101, -9],
      [22.27, 2.55, 1.00, .120, .096, -14],
    ]), sx), ruled:true},
    K.lz('front-covert-upper', white, horizontal([
      [19.91, 3.79, .17, .024, .036, -24],
      [20.50, 3.63, .23, .244, .152, -25],
      [21.60, 3.46, .30, .464, .203, -26],
      [22.67, 3.15, .53, .485, .205, -25],
      [23.63, 2.73, .80, .350, .216, -24],
      [24.22, 2.19, .99, .101, .129, -21],
    ]), sx),
    K.lz('front-covert-lower', pearl, horizontal([
      [16.50, 3.94, .16, .026, .040, -32],
      [17.35, 3.83, .21, .156, .171, -31],
      [18.80, 3.69, .27, .233, .198, -30],
      [20.19, 3.42, .37, .267, .209, -30],
      [21.87, 2.93, .72, .163, .170, -29],
    ]), sx),
    ...jointCap('wing-root', sx, 1.85, 2.26, .89, 24.19, .34, .78),
    ...faceCap('wing-root-back', sx, 2.12, 1.55, 24.05, .335, .335, 1),
  ];
  const wingShell = wing.map(shape => fitWingOutline(shape, sx));
  wingShell[0] = clearFeatherSpine(wingShell[0]);
  // 前縁の内部に手根の鞘を通す。後縁側の摺動面を前に逃がす。
  for (const shape of wingShell) {
    if (shape.loft.some(section => section.plane !== 'xy')) continue;
    shape.loft = shape.loft.map(section => {
      const back = Math.max(...section.pts.map(([, y]) => y));
      const setback = Math.max(0, back - 1235);
      return {...section, pts: section.pts.map(([x, y]) => [x, y - setback])};
    });
  }
  wingShell.push(...shoulderMantle(sx), ...spar(sx,false));
  add('wing-' + side, jp + 'の翼／外套', wingShell);
  const carpus = 'carpus-' + side;
  add(carpus,jp+'の翼の手根と指骨',spar(sx,true));
  fanCarpi.push({id:'j-'+carpus,parent:'wing-'+side,child:carpus,name:jp+'翼の手根の引出し',
    type:'slider',axis:'-z',at:[sx*2.68,1.51,20],limits:{distance:[0,carpalTravel]},travel:carpalTravel});
  for (const [i, f] of feathers.entries()) {
    const n = i + 1;
    const name = jp + (f.primary ? 'の初列風切 ' + (n-secondaryCount) : 'の次列風切 ' + n);
    const child = 'flight-feather-' + n + '-' + side;
    const vane = 'feather-vane-' + n + '-' + side;
    const at = [sx * f.x, f.y, wingRootHeight - f.root];
    const split = f.length - f.folded > f.folded * .56;
    const travel = f.length - f.folded + f.tipLift;
    const guide = 'feather-guide-' + n + '-' + side;
    if (split) {
      const sections = [[.04,.38],[.22,.87],[.51,1],[.83,.90],[.99,.46]];
      add(guide,name+'の中羽',[tuckFeather(featherPlate('middle-web', pearl,
        sections.map(([t,w])=>[f.root+t*f.folded,f.x-.026,f.y+.49,.003,f.width*w]),sx),sx,i)]);
    }
    add(child, name, fanBlade(i, sx));
    add(vane, name + 'の先羽', [slidingVane(i, sx)]);
    fanJoints.push({id:'j-'+child, name, type:'revolute',parent:f.primary ? carpus : 'wing-'+side,child,at,axis:'x',
      limits:{angle:[0,f.open + (flightRootSweep[i] ?? 0)]},open:f.open});
    if(split) fanSlides.push({id:'j-'+guide,name:name+'の中段伸縮',type:'slider',parent:child,
      child:guide,at,axis:'-z',limits:{distance:[0,travel/2]},travel:travel/2});
    const tipTravel = split ? travel/2 : travel;
    fanSlides.push({id:'j-'+vane,name:name+'の伸縮',type:'slider',parent:split?guide:child,child:vane,
      at:[sx*(f.x-.044),f.y+.64,at[2]-.25],axis:'-z',limits:{distance:[0,tipTravel]},travel:tipTravel});
  }
  // 尾筒の背側で薄い舵羽を重ね、飛行時だけ左右へ扇開する。
  for(let i=1;i<=6;i++){
    const rectrix='rectrix-'+i+'-'+side, x=sx*(.035+.025*i), y=1.14+.054*i+(sx<0?.026:0);
    const z=19.40-.028*i, length=12.06-.065*i;
    const rows=[[0,.035],[.20,.14],[.55,.21],[.82,.24],[.95,.20],[1,.062]];
    add(rectrix,jp+'の舵羽 '+i,[{...K.lz('web',i%2?pearl:white,horizontal(rows.map(([t,w])=>
      [z-length*t,Math.abs(x),y,w*2.42,.010]).reverse()),sx),ruled:true}]);
    tailJoints.push({id:'j-'+rectrix,parent:'tail-comb',child:rectrix,name:jp+'尾羽 '+i,
      type:'revolute',axis:'y',at:[x,y,z],limits:{angle:[0,-sx*i*4.4]}});
  }
  add('upper-' + side, jp + 'の上腕', [
    K.lines('upper-arm', pearl, upper, sx, 12),
    contourOverlay('biceps', white, upper, [
      [21.36, -100, .026, .013, .022], [22.17, -89, .041, .207, .042],
      [22.96, -73, .044, .277, .052], [23.48, -58, .039, .207, .047],
      [23.98, -58, .027, .071, .037],
    ], sx),
    K.plate('triceps', white, upper, 20.65, 23.95, sweep(84, 57, 24, 3), .013, .062, sx),
    jointFairing('shoulder-front-fairing', sx, 2.02, -.63, 23.74, .372, .49, -1, 1.7),
    ...shoulderCap(sx, false),
    ...shoulderCap(sx, true),
  ]);
  add('fore-' + side, jp + 'の前腕', [
    K.lines('forearm', pearl, fore, sx, 11),
    contourOverlay('forearm-front', white, fore, [
      [17.02, -92, .009, .020, .019], [17.53, -90, .024, .123, .033],
      [18.32, -82, .041, .192, .047], [18.94, -65, .039, .165, .044],
      [19.51, -61, .024, .039, .032],
    ], sx),
    K.plate('forearm-rear', white, fore, 17.29, 19.49,
      t => K.leaf(74 - 29 * Math.sin(Math.PI * t) - 12 * t, 16, 2)(t), .017, .055, sx),
    jointFairing('elbow-front-fairing', sx, 2.28, -.57, 19.57, .212, .300, -1, 1.65),
    jointFairing('elbow-back-fairing', sx, 2.29, .072, 19.57, .205, .266, 1, 1.65),
    ...faceCap('elbow-front', sx, 2.28, -.57, 19.57, .190, .198),
    ...faceCap('elbow-back', sx, 2.29, .072, 19.57, .180, .188, 1),
    ...jointCap('elbow-side', sx, 2.43, 2.561, -.20, 19.57, .225, .80),
  ]);
  add('thigh-' + side, jp + 'のもも', [
    K.lines('thigh', pearl, thigh, sx, 16),
    contourOverlay('thigh-guard', white, thigh, thighGuardSections, sx),
    contourTrim('thigh-guard-rim', thigh, [
      [16.94, -90, .036, .019, .027], [17.22, -78, .078, .036, .040],
      [17.55, -56, .105, .043, .044], [17.93, -38, .089, .035, .039],
      [18.20, -26, .051, .018, .027],
    ], sx),
    K.plate('quadriceps', white, thigh, 9.62, 16.14, sweep(-92, -29, 30, 3), .029, .077, sx),
    K.plate('hamstring', white, thigh, 9.66, 17.92, sweep(91, 51, 34, 4), .021, .076, sx),
    jointFairing('knee-front-fairing', sx, 1.15, -.78, 10.03, .32, .741, -1, 1.36),
    jointFairing('knee-back-fairing', sx, 1.15, .337, 10.01, .298, .399, 1, 1.65),
    ...faceCap('knee-front', sx, 1.15, -.78, 10.03, .279, .510, -1, 1.58),
    ...faceCap('knee-back', sx, 1.15, .337, 10.01, .266, .296, 1),
    ...jointCap('knee-side', sx, 1.33, 1.54, -.17, 10.04, .344),
  ]);
  add('shin-' + side, jp + 'のすね', [
    K.lines('shin', pearl, shin, sx, 16),
    greavePanel(sx),
    ruledPlate('instep', white, shin, 2.06, 5.68, K.leaf(-90, 19, 3), .005, .032, sx),
    ruledPlate('calf', white, shin, 3.26, 9.16, K.leaf(88, 28, 4), .018, .069, sx),
    ...[-1, 1].flatMap(edge => [
      greavePanel(sx, edge),
      contourTrim('greave-back-trim-' + edge, shin, [
        [5.94, 90, .110, .018, .027],
        [6.46, 90 - 21 * edge, .102, .026, .030],
        [6.90, 90 - 29 * edge, .100, .029, .029],
        [7.52, 90 - 47 * edge, .083, .026, .024],
        [8.17, 90 - 60 * edge, .067, .016, .017],
      ], sx),
    ]),
    ...faceCap('ankle-front', sx, 1.25, -.69, 2.92, .216, .352, -1, 1.40),
    ...faceCap('ankle-back', sx, 1.25, .157, 2.91, .209, .313, 1),
    ...jointCap('ankle-side', sx, 1.31, 1.55, -.22, 2.92, .236),
  ]);

  const cover = 'shoulder-covert-' + side;
  add(cover, jp + 'の胸脇の雨覆', [shoulderCover(sx)]);
  shoulderCoverJoints.push({id:'j-' + cover, name:jp + 'の胸脇の雨覆の引出し',
    parent:'torso',child:cover,type:'slider',axis:sx>0?'x':'-x',
    at:[sx*.72,-1.07,23.08],limits:{distance:[0,shoulderSlide]}});
  reuse('hand-' + side, jp + 'の手', 'hand', sx);
  reuse('foot-' + side, jp + 'の足', 'foot', sx);
  fixed('hand-' + side, 'fore-' + side, jp + '手首取付', [sx * 2.48, -.40, 17.0]);
  fixed('foot-' + side, 'shin-' + side, jp + '足首取付', [sx * 1.24, -.30, 1.65]);
  for (const joint of extremities.joints.filter(j => j.parent === 'foot')) {
    reuse(joint.child + '-' + side, jp + 'の爪', joint.child, sx);
    attachments.push({ ...joint, id: joint.id + '-' + side, parent: joint.parent + '-' + side,
      child: joint.child + '-' + side, at: [sx * joint.at[0], ...joint.at.slice(1)] });
  }
}

for (const f of forms) {
  for (const j of shoulderCoverJoints) f.pose[j.id] = f === flightForm ? shoulderSlide : 0;
}

function fanPose(fraction, flying = false) {
  return Object.fromEntries([
    ...fanJoints.map(({id, open, limits}) => [id, fraction * (flying ? limits.angle[1] : open)]),
    ...[...fanSlides,...fanCarpi].map(({id, travel}) => [id, fraction * travel]),
  ]);
}
const fanBases = [
  {key: 'flight', id: 'f-17', name: 'FM-01 飛ぶ形（扇）', pose: flightForm.pose},
  {
    key: 'kime', id: 'f-18',
    name: '決めのポーズ（扇）',
    pose: {
      ...standingForm.pose,
      'j-wing-l': [90, 0, -120], 'j-wing-r': [-90, 0, -120],
      'j-arm-l': [0, -15, 0], 'j-arm-r': [0, 15, 0],
      'j-elbow-l': 15, 'j-elbow-r': 15,
    },
  },
];
function flightTail(fraction) {
  return Object.fromEntries(tailJoints.map(j=>[j.id,fraction*j.limits.angle[1]]));
}
Object.assign(flightForm.pose, {
  'j-knee-l': -140, 'j-knee-r': -140,
  'j-hip-l': [0, -6, 10], 'j-hip-r': [0, 6, 10],
  'j-arm-l': [24, 16, 33], 'j-arm-r': [-24, -16, 33],
  'j-elbow-l': 130, 'j-elbow-r': 130,
});
fanBases[0].pose = {...flightForm.pose, ...flightTail(1)};
const fanForms = fanBases.map(({key, id, name, pose}) => ({
  id, name, pose: {...pose, ...fanPose(1, key === 'flight')},
}));
function scopeFeatherMounts(doc) {
  for (const {id, parent, child} of fanJoints) {
    const allowance = doc.interferenceAllowances.find(item => item.id === `allow-${parent}-${child}`);
    if (!allowance) throw new Error(`風切羽の取付がありません: ${id}`);
    allowance.region = {kind: 'joint-sphere', joint: id, radiusMm: featherMountRadiusMm};
  }
}

// 検査経路は保存した組立の関節値から作り、各姿勢で同じ部品・軸・取付球を使う。
function saveMotionChecks(dir, fan, step) {
  const assembly = read('cad/shiraha.cad.json');
  const byName = new Map(assembly.configurations.map(form => [form.name, form]));
  const get = name => {
    const form = byName.get(name);
    if (!form) throw new Error('形態がありません: ' + name);
    return form;
  };
  for (const j of fanJoints) {
    const pair = assembly.interferenceAllowances.filter(a =>
      [a.a[0], a.b[0]].sort().join('/') === ['c-' + j.parent, 'c-' + j.child].sort().join('/'));
    if (pair.length !== 1 || pair[0].region.kind !== 'joint-sphere' ||
        pair[0].region.joint !== j.id || pair[0].region.radiusMm !== featherMountRadiusMm) {
      throw new Error('風切羽の取付範囲が一致しません: ' + j.id);
    }
  }
  for (const {parent, child} of [...fanSlides, ...fanCarpi]) {
    const pair = ['c-' + parent, 'c-' + child].sort().join('/');
    if (assembly.interferenceAllowances.some(a => [a.a[0], a.b[0]].sort().join('/') === pair)) {
      throw new Error('摺動する部品が干渉検査から除かれています: ' + child);
    }
  }
  const samplePath = (key, waypoints, minIntervals = 1) => {
    const frames = [waypoints[0]];
    for (let i = 1; i < waypoints.length; i++) {
      const start = waypoints[i - 1], end = waypoints[i];
      const moves = [];
      let intervals = minIntervals;
      for (const {id} of assembly.joints) {
        for (const [axis, term] of Object.entries(start.values[id])) {
          const unit = Object.keys(term)[0];
          const a = term[unit], b = end.values[id][axis][unit];
          if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error(id + '/' + axis);
          if (a === b) continue;
          const limit = unit === 'literalRad' ? maximumAngleStep * Math.PI / 180 : maximumTravelStep * K.mm;
          intervals = Math.max(intervals, Math.ceil(Math.abs(b - a) / limit - 1e-12));
          moves.push({id, axis, unit, a, b});
        }
      }
      for (let k = 1; k < intervals; k++) {
        const values = {...start.values};
        for (const {id, axis, unit, a, b} of moves) {
          values[id] = {...values[id], [axis]: {[unit]: K.lerp(a, b, k / intervals)}};
        }
        frames.push({name: `${start.name} → ${end.name} (${k}/${intervals})`, values});
      }
      frames.push(end);
    }
    for (let i = 0; i < frames.length; i += configurationsPerDocument) {
      const configurations = frames.slice(i, i + configurationsPerDocument)
        .map(({name, values}, k) => ({id: 'f-' + (i + k), name, values}));
      write(`${dir}-${key}-${1 + i / configurationsPerDocument}.cad.json`, {...assembly, configurations});
    }
  };
  const standing = get(standingForm.name);
  if (fan) {
    const flight = get(fanBases[0].name), kime = get(fanBases[1].name);
    const closedKime = {name: '両腕を構える（風切羽収納）', values: {...standing.values}};
    const wingIds = ['j-wing-l', 'j-wing-r'];
    for (const id of [...wingIds, 'j-arm-l', 'j-arm-r', 'j-elbow-l', 'j-elbow-r']) {
      closedKime.values[id] = kime.values[id];
    }
    const wingWaypoints = [
      'SP-03 翼を外套に 75%', 'SP-03 翼を外套に 50%', 'SP-03 翼を外套に 25%',
      'SP-02 首を胸に縮める 100%', kime.name,
    ].map((name, i) => ({name: '両翼を上げる ' + (i + 1), values: {
      ...standing.values, ...Object.fromEntries(wingIds.map(id => [id, get(name).values[id]])),
    }}));
    const intervals = Math.ceil(Math.max(...fanJoints.map(j => j.limits.angle[1])) / maximumAngleStep);
    samplePath('flight', [flight, get(flightForm.name)], intervals);
    samplePath('approach', [standing, ...wingWaypoints, closedKime]);
    samplePath('kime', [closedKime, kime], intervals);
  } else {
    const sequences = {
      'SP-01': [flightForm.name, ...forms.filter(f => f.name.startsWith('SP-01')).map(f => f.name)],
      'SP-02': ['SP-01 降りながら体を起こす 90°', ...forms.filter(f => f.name.startsWith('SP-02')).map(f => f.name)],
      'SP-03': ['SP-02 首を胸に縮める 100%', ...forms.filter(f => f.name.startsWith('SP-03')).map(f => f.name), standing.name],
      'SP-04': [standing.name, ...forms.filter(f => f.name.startsWith('SP-04')).map(f => f.name), 'FM-04 人の形（素顔）'],
    };
    for (const key of step ? [step] : Object.keys(sequences)) {
      if (!sequences[key]) throw new Error('検査する手順がありません: ' + key);
      samplePath(key, sequences[key].map(get));
    }
  }
}
// kit の組立入力には部品対を渡す。最終化で羽軸を取付球に限定し、全経路はその組立を読む。
const buildAllowances = joints => joints
  .filter(j => !['j-helmet-arm','j-helmet'].includes(j.id))
  .filter(j => j.parent !== 'ground' && !/^j-(feather-(vane|guide)|carpus|shoulder-covert)-/.test(j.id))
  .map(j => [j.parent, j.child]);

// cad_build の平面関節は軸を固定しているため、検査用では平面内の移動と回転を分けて解く。
function buildSpec(sampleForms, dir) {
  const [body, ...rest] = standardJoints;
  const carrier = { id: 'body-slide', name: '体の移動', shapes: [
    K.box('carrier', frame, [-.0005, -.0005, 18.4995], [.0005, .0005, 18.5005]),
  ] };
  const xTurn = { ...body, parent: carrier.id, type: 'revolute', limits: {angle: body.limits.angle} };
  const joints = [
    { id: 'j-body-u', name: '体の高さ', type: 'slider', parent: 'ground', child: carrier.id,
      at: body.at, axis: '-z', limits: { distance: body.limits.u } },
    xTurn, ...rest, ...attachments, ...shoulderCoverJoints, ...tailJoints, ...fanCarpi.map(({travel,...j})=>j), ...fanJoints.map(({open, ...joint}) => joint), ...fanSlides.map(({travel, ...joint}) => joint),
  ];
  const frames = sampleForms.map(({name, pose}) => {
    const [u, v, angle] = pose[body.id];
    if (v !== 0) throw new Error('体の横移動を検査用の組立に追加してください');
    return { name, pose: {...fanPose(0), ...pose, [body.id]: angle, 'j-body-u': u} };
  });
  return {dir, components: [...components, carrier], joints, forms: frames, allow: buildAllowances(joints)};
}

// 手首と爪の取付はこの変形では相対角度が変わらない。
// 部品の形をそのまま配置し、取付領域を引いた側だけで干渉を検査する。
function connectionModel(dir) {
  const byId = new Map(components.map(part => [part.id, part]));
  const parts = [];
  for (const [side, sx] of [['l', 1], ['r', -1]]) {
    const cut = (part, plane, low, high, span, names) => {
      const [a, b] = [sx * low[0], sx * high[0]].sort((x, y) => x - y);
      const window = {plane, span, pts: [[a, low[1]], [b, low[1]], [b, high[1]], [a, high[1]]]};
      return {...part, shapes: part.shapes.map(shape => names.includes(shape.id)
        ? {...shape, cuts: [...(shape.cuts ?? []), window]} : shape)};
    };
    parts.push(byId.get(`hand-${side}`), byId.get(`foot-${side}`));
    parts.push(cut(byId.get(`fore-${side}`), 'xy', [2150, -830], [2780, 150], [16900, 17240], ['forearm', 'forearm-front']));
    for (const digit of ['toe-0', 'toe-1', 'toe-2', 'rear-toe']) {
      const part = byId.get(`${digit}-${side}`);
      if (digit === 'rear-toe') {
        parts.push(cut(part, 'xz', [350, 0], [2150, 750], [100, 320], ['rear-body']));
        continue;
      }
      // 前爪の根元は取付領域に収まる。指の筒と甲板を境界断面で閉じ直す。
      const y = -940;
      const outside = part.shapes.map(shape => {
        if (shape.id.endsWith('-claw')) return shape;
        const loft = shape.loft;
        const next = loft.findIndex(section => section.w > y);
        if (next < 0) return shape;
        const [before, after] = loft.slice(next - 1, next + 1);
        const sections = loft.slice(0, next);
        if (before.w < y) {
          const t = (y - before.w) / (after.w - before.w);
          sections.push({ plane: 'xz', w: y, pts: before.pts.map((p, i) =>
            p.map((v, j) => K.lerp(v, after.pts[i][j], t))) });
        }
        return {...shape, loft: sections};
      });
      parts.push({...part, shapes: outside});
    }
  }
  return {dir, components: parts, joints: [], forms: [{name: '手首と爪の取付領域外', pose: {}}], allow: []};
}

function finalize(path, linkParts) {
  const doc = read(path);
  const obsolete = [];
  const carrierId = 'c-body-slide';
  const checked = new Map(doc.configurations.map(config => [config.name, config]));
  const inheritedIds = new Set(motion.joints.map(j => j.id));
  const featherJointIds = new Set(fanJoints.map(({id}) => id));
  const fullyOpen = checked.get(fanForms[0].name).values;
  const tailJointIds = new Set(tailJoints.map(j => j.id));
  const slidingJointIds = new Set([...fanSlides,...fanCarpi].map(j => j.id));
  const newJoints = doc.joints.filter(j => j.id !== 'j-body-u' && !inheritedIds.has(j.id));
  doc.joints = [
    ...motion.joints,
    ...newJoints.map(joint => {
      if (joint.id.startsWith('j-foot-') || joint.id.startsWith('j-hand-')) {
        return {...joint, limits: [{of: 'angle', min: 0, max: 0}]};
      }
      if (tailJointIds.has(joint.id)) {
        const open = fullyOpen[joint.id].angle.literalRad;
        return {...joint, limits: [{of: 'angle', min: Math.min(0, open), max: Math.max(0, open)}]};
      }
      if (featherJointIds.has(joint.id)) {
        const open = fullyOpen[joint.id].angle.literalRad;
        return {...joint, limits: [{of: 'angle', min: Math.min(0, open), max: Math.max(0, open)}]};
      }
      if (slidingJointIds.has(joint.id)) {
        return {...joint, limits: [{of: 'distance', min: 0, max: fullyOpen[joint.id].distance.literalMm}]};
      }
      return joint;
    }),
  ];
  const configs = [...motion.configurations, ...fanForms.map(({id, name, pose}) => {
    const config = checked.get(name);
    const [u, v, angle] = pose['j-body'];
    const values = Object.fromEntries(standardJoints.map(({id}) => [id, config.values[id]]));
    values['j-body'] = {u: {literalMm: u * K.mm}, v: {literalMm: v * K.mm}, angle: {literalRad: angle * Math.PI / 180}};
    return {...config, id, values};
  })];
  doc.configurations = configs.map(config => {
    const values = checked.get(config.name).values;
    return { ...config, values: {
      ...config.values,
      ...Object.fromEntries(standardJoints.filter(j => j.type !== 'planar').map(({id}) => [id, values[id]])),
      ...Object.fromEntries(newJoints.map(j => [j.id, values[j.id]])),
    } };
  });
  scopeFeatherMounts(doc);
  const carrier = doc.parts.find(p => p.id === 'p-body-slide');
  if (carrier) {
    doc.parts = doc.parts.filter(p => p !== carrier);
    doc.components = doc.components.filter(c => c.id !== carrierId);
    doc.interferenceAllowances = doc.interferenceAllowances.filter(
      a => !a.a.includes(carrierId) && !a.b.includes(carrierId),
    );
    delete doc.solvedPoses[carrierId];
    const torsoJoint = motion.joints.find(j => j.id === 'j-body');
    doc.components.find(c => c.id === torsoJoint.child.componentId).placement = null;
    if (linkParts && carrier.source.artifactId === 'cad/shiraha/body-slide.cad.json') {
      obsolete.push(carrier.source.artifactId);
    }
  }
  if (linkParts) {
    const parts = read('cad/extremities.cad.json').parts;
    for (const part of doc.parts) {
      const original = reused.get(part.id.slice(2));
      if (!original) continue;
      const source = parts.find(p => p.id === 'p-' + original).source;
      const copy = part.source.artifactId;
      if (copy === source.artifactId) continue;
      if (copy !== `cad/shiraha/${part.id.slice(2)}.cad.json`) {
        throw new Error(`Unexpected part location: ${copy}`);
      }
      const current = read(source.artifactId);
      const built = read(copy);
      for (const key of ['profiles', 'sketches', 'features', 'bodies']) {
        if (JSON.stringify(built[key]) !== JSON.stringify(current[key])) {
          throw new Error(`${copy}: ${key} differs from ${source.artifactId}`);
        }
      }
      part.source = source;
      obsolete.push(copy);
    }
  }
  write(path, doc);
  for (const copy of obsolete) unlinkSync(copy);
}

const [mode, path, step] = process.argv.slice(2);
if (mode === '--finalize') {
  finalize(path ?? 'cad/shiraha.cad.json', !path);
} else if (mode === '--contacts') {
  write('.paobub/cad/shiraha-contacts.model.json', connectionModel(path ?? '.paobub/cad/shiraha-contacts'));
} else if (mode === '--fan-sweep') {
  saveMotionChecks(path ?? '.paobub/cad/shiraha-fan-sweep', true);
} else if (mode === '--sweep') {
  saveMotionChecks(path ?? '.paobub/cad/shiraha-sweep', false, step);
} else {
  write('.paobub/cad/shiraha.model.json', buildSpec([...forms, ...fanForms], mode ?? 'cad/shiraha'));
}
