import * as K from '../.paobub/cad/kit.mjs';
import {writeFileSync} from 'node:fs';
const W='#f4f5f7', P='#e6e2da', G='#c9a96a', D='#4d535c';
const components=[], joints=[], allow=[];
const add=(id,shapes)=>components.push({id,name:id,shapes});
const ankleX = 1.24;
const foot = {
  z: [.29, .40, .57, .76, .99, 1.28, 1.65, 2],
  w: [.26, .40, .43, .34, .255, .228, .224, .24],
  F: [-.65, -.82, -.82, -.73, -.58, -.503, -.421, -.3285],
  B: [.22, .23, .24, .22, .21, .234, .263, .2885],
  x: Array(8).fill(ankleX)
};
// 甲の各板は足の曲面に接する閉じた楕円断面で積み、左右反転でも同じ面を保つ。
function footPlate(id, color, z0, z1, range, lift, thickness, count) {
  const rows = Array.from({length: count}, (_, i) => {
    const t = i / (count - 1), z = K.lerp(z0, z1, t);
    const [lo, hi] = range(t), angle = (lo + hi) / 2;
    const left = K.onLines(foot, z, lo, lift);
    const right = K.onLines(foot, z, hi, lift);
    const crest = K.onLines(foot, z, angle, lift + thickness);
    const base = {x: (left.x + right.x) / 2, y: (left.y + right.y) / 2};
    return {z, x: (crest.x + base.x) / 2, y: (crest.y + base.y) / 2,
      a: Math.hypot(right.x - left.x, right.y - left.y) / 2,
      b: Math.hypot(crest.x - base.x, crest.y - base.y) / 2,
      r: Math.atan2(right.y - left.y, right.x - left.x) * 180 / Math.PI};
  });
  return K.lz(id, color, rows);
}
function ankleCap(id, color, height, width, lift) {
  const loft = Array.from({length: 15}, (_, i) => {
    const angle = K.lerp(-1.52, 1.52, i / 14);
    const z = .64 + height * Math.sin(angle), centerY = -.016 + .095 * (z - .64);
    const front = K.cr(foot.z, foot.F, z), back = K.cr(foot.z, foot.B, z);
    const pts = K.ring(1, 1, 2, 16).map(([u, v]) => {
      const y = centerY + width * Math.cos(angle) * v;
      const normalized = (2 * y - front - back) / (back - front);
      const outer = K.cr(foot.z, foot.w, z) * Math.sqrt(1 - normalized ** 2);
      return [(ankleX + outer + lift + .014 * u) * K.mm, y * K.mm];
    });
    return {plane: 'xy', w: z * K.mm, pts};
  });
  return {id, color, loft, ruled: true};
}
add('foot', [
  K.lines('foot-core',W,foot),
  footPlate('foot-trim', G, .43, 1.31, K.leaf(-90, 32, 3), -.008, .045, 7),
  K.lz('foot-upper', P, [
    [.445, .025], [.55, .115], [.69, .173], [.85, .165],
    [1.01, .129], [1.16, .077], [1.252, .014],
  ].map(([z, a]) => {
    const front = K.cr(foot.z, foot.F, z), back = K.cr(foot.z, foot.B, z);
    const width = K.cr(foot.z, foot.w, z);
    const sag = (back - front) * (1 - Math.sqrt(1 - (a / width) ** 2)) / 2;
    return {z, x: ankleX, y: front + sag / 2 - .034, a, b: sag / 2 + .034};
  })),
  ...[-1, 1].map(side => footPlate(`foot-seam-${side}`, G, .82, .97, t => {
    const center = -90 + side * (28 + t * 32);
    const halfWidth = 3 + 10 * Math.sin(Math.PI * t);
    return [center - halfWidth, center + halfWidth];
  }, -.008, .03, 7)),
  K.lz('shin-rear-plate', P, [
    [.65, .028], [.84, .063], [1.12, .078], [1.46, .075], [1.78, .068], [1.99, .038],
  ].map(([z, a]) => ({z, x: ankleX, y: K.cr(foot.z, foot.B, z) - .012, a, b: .022}))),
  footPlate('heel-rim', G, .49, 1.23, K.leaf(90, 26, 4), -.010, .043, 7),
  footPlate('heel-plate', P, .50, 1.16, K.leaf(90, 23, 3), .017, .030, 7),
  ankleCap('ankle-oval', G, .297, .150, .027),
  ankleCap('ankle-inset', W, .178, .096, .052),
]);
for (let i=0;i<3;i++) {
  const side = i - 1, middle = side === 0, root = ankleX + side * .14, id = 'toe-' + i;
  const tipY = middle ? -2.35 : -2.03;
  const section = (y, spread, z, a, b) => ({ y, x: ankleX + side * spread, z, a, b });
  const toe = [
    section(middle ? -1.66 : -1.55, .63, .28, .10, middle ? .148 : .132),
    section(middle ? -1.48 : -1.35, .583, .351, .114, .166),
    section(middle ? -1.16 : -1.10, .492, .413, .115, middle ? .196 : .222),
    section(-.87, .34, .481, .102, .196),
    section(middle ? -.60 : -.57, .14, .49, .055, .14)
  ];
  const claw = [
    section(tipY, .835, middle ? .045 : .062, .012, .012),
    section(tipY + .078, .817, middle ? .119 : .146, middle ? .031 : .036, .037),
    section(tipY + .247, .753, .246, middle ? .068 : .074, middle ? .106 : .094)
  ];
  if (middle) {
    claw.push(
      section(-1.84, 0, .272, .098, .140), section(-1.67, 0, .315, .101, .154),
      section(-1.52, 0, .412, .076, .099), section(-1.32, 0, .481, .022, .021)
    );
  } else {
    claw.push(
      {...toe[0], y: toe[0].y + .045, a: .106, b: toe[0].b + .012},
      section(-1.425, .604, .360, .075, .072),
      section(-1.345, .578, .394, .022, .019)
    );
  }
  add(id, [
    K.ly(id+'-body',W,toe),
    K.ly(id+'-armor', P, toe.map((s, j) => {
      const atRoot = j === toe.length - 1;
      const width = middle ? (atRoot ? .073 : s.a * .91) : s.a * (j === 0 || atRoot ? .51 : .69);
      return { y: s.y, x: s.x, z: s.z + s.b + (middle && atRoot ? .027 : -.014), a: width, b: .03 };
    })),
    K.ly(id+'-claw', G, claw)
  ]);
  joints.push({id:'bend-'+i,name:id,type:'revolute',parent:'foot',child:id,at:[root,-.70,.39],axis:'x',limits:{angle:[0,35]}});
  allow.push(['foot',id]);
}
const rearClaw = K.ly('rear-claw', G, [
  {y:.608,x:ankleX,z:.369,a:.070,b:.079}, {y:.666,x:ankleX,z:.351,a:.080,b:.110},
  {y:.717,x:ankleX,z:.318,a:.070,b:.122},
  {y:.755,x:ankleX,z:.273,a:.057,b:.111}, {y:.813,x:ankleX,z:.155,a:.034,b:.072},
  {y:.842,x:ankleX,z:.078,a:.018,b:.036}, {y:.85,x:ankleX,z:.061,a:.008,b:.011}
]);
rearClaw.loft = rearClaw.loft.map(section => ({
  ...section, pts: section.pts.map(([x, z]) => {
    const medial = Math.max(0, (ankleX * K.mm - x) / 65);
    const hooked = Math.max(0, 1 - ((section.w - 795) / 57) ** 2);
    return [x, z + 86 * medial * hooked];
  }),
}));
add('rear-toe',[
  K.ly('rear-body', W, [
    {y:.12,x:ankleX,z:.41,a:.13,b:.215}, {y:.24,x:ankleX,z:.424,a:.125,b:.210},
    {y:.34,x:ankleX,z:.363,a:.118,b:.170}, {y:.47,x:ankleX,z:.308,a:.103,b:.132},
    {y:.58,x:ankleX,z:.346,a:.093,b:.109}, {y:.65,x:ankleX,z:.357,a:.079,b:.107},
    {y:.682,x:ankleX,z:.342,a:.063,b:.093}
  ]),
  rearClaw
]);
joints.push({id:'bend-rear',name:'rear',type:'revolute',parent:'foot',child:'rear-toe',at:[1.24,.15,.34],axis:'-x',limits:{angle:[0,35]}});
allow.push(['foot','rear-toe']);
add('foot-mount',[K.box('foot-mount',D,[1.20,-.34,1.96],[1.28,-.26,2.04])]);
joints.push({id:'foot-lift',name:'foot-lift',type:'slider',parent:'foot-mount',child:'foot',at:[1.24,-.30,2],axis:'z'});
allow.push(['foot-mount','foot']);
const hand = {
  z: [15.75, 15.92, 16.26, 16.56, 16.79, 16.93, 17.04, 17.15],
  w: [.170, .203, .204, .176, .115, .086, .103, .132],
  F: [-.762, -.787, -.764, -.665, -.554, -.52, -.522, -.535],
  B: [-.017, -.024, -.039, -.086, -.175, -.255, -.279, -.266],
  x: [2.449, 2.465, 2.485, 2.49, 2.482, 2.476, 2.476, 2.48],
};
const wrist = { y: -.4, z: 17, radius: .22 };
const dorsal = K.plate('dorsal-plate', P, hand, 15.77, 16.944, t => {
  const halfWidth = K.cr([0, .27, .66, 1], [58, 68, 51, 13], t);
  return [-halfWidth, halfWidth];
}, -.014, .038, 1, 12);
const hs = [
  K.lines('palm', W, hand, 1, 18),
  {...dorsal, ruled: true, loft: dorsal.loft.map(({pts, ...section}) => ({
    ...section, pts: [...pts.slice(3), ...pts.slice(0, 3)],
  }))},
  K.lz('palmar-plate', P, [
    {z: 15.78, x: 2.306, y: -.39, a: .031, b: .108},
    {z: 15.98, x: 2.291, y: -.40, a: .048, b: .213},
    {z: 16.27, x: 2.306, y: -.40, a: .050, b: .221},
    {z: 16.57, x: 2.337, y: -.38, a: .038, b: .162},
    {z: 16.83, x: 2.374, y: -.40, a: .026, b: .079},
  ]),
  {...K.lz('wrist-yoke', G, [
    {z: 16.71, x: 2.509, y: wrist.y, a: .035, b: .049, n: 2.5},
    {z: 16.83, x: 2.516, y: wrist.y, a: .068, b: .103, n: 2.6},
    {z: 16.95, x: 2.535, y: wrist.y, a: .096, b: .199, n: 2.7},
    {z: 17.01, x: 2.541, y: wrist.y, a: .104, b: .244, n: 2.7},
    {z: 17.12, x: 2.521, y: wrist.y, a: .081, b: .162, n: 2.6},
    {z: 17.21, x: 2.504, y: wrist.y, a: .055, b: .103, n: 2.4},
  ]),ruled:true},
  K.disc('wrist-disc', G, 2.595, 2.654, wrist.y, wrist.z, wrist.radius),
  K.disc('wrist-recess', D, 2.648, 2.658, wrist.y, wrist.z, .174),
  {id: 'wrist-cap', color: W, ruled: true, loft: [
    [2.654, .164], [2.665, .162], [2.674, .142],
  ].map(([x, r]) => ({plane: 'yz', w: x * K.mm, pts: K.ring(r, r, 2, 24).map(([u,v]) =>
    [(wrist.y + u) * K.mm, (wrist.z + v) * K.mm])}))},
];
const knuckleCap = (id, color, fromX, toX, y, z, radius) => {
  const cap = K.disc(id, color, fromX, toX, y, z, radius);
  cap.loft.forEach(section => {
    section.pts = section.pts.map(([u, v]) => [u, z * K.mm + (v - z * K.mm) * .75]);
  });
  return cap;
};
for (let i = 0; i < 4; i++) {
  const y = -.139 - i * .162, x = 2.483 + i * .019;
  const tipz = [15.13, 14.89, 14.86, 14.99][i];
  const curl = [.155, .209, .298, .349][i];
  const firstBendZ = [15.46, 15.38, 15.39, 15.42][i];
  const bendZ = [15.25, 15.105, 15.13, 15.21][i];
  const firstCurl = .029 + .005 * i;
  const knuckleZ = [15.798, 15.779, 15.774, 15.79][i];
  const spread = [.064, .019, -.023, -.058][i];
  const point = (z, dx, dy, a, b) => ({z, x: x - dx, y: y - dy, a, b});
  const tip = (t, a, b) => point(K.lerp(tipz, bendZ - .018, t),
    K.lerp(curl, .132, t), K.lerp(spread, spread * .55, t), a, b);
  hs.push(K.lz('finger-base-' + i, W, [
    point(firstBendZ, firstCurl, spread * .26, .047, .063),
    point(15.61, .014, spread * .11, .054, .065),
    point(15.81, 0, 0, .051, .068),
  ]));
  hs.push(K.lz('finger-middle-' + i, W, [
    point(bendZ, .129, spread * .55, .045, .055),
    point((bendZ + firstBendZ) / 2, .082, spread * .41, .050, .060),
    point(firstBendZ - .019, firstCurl + .006, spread * .27, .046, .060),
  ]));
  hs.push(K.lz('finger-tip-' + i, W, [
    tip(0, .025, .037), tip(.12, .039, .051), tip(.32, .043, .054), tip(.51, .044, .055),
    tip(.71, .043, .052), tip(1, .045, .054),
  ]));
  hs.push(K.lz('finger-joint-' + i, D, [
    point(firstBendZ - .024, firstCurl + .007, spread * .27, .040, .053),
    point(firstBendZ + .005, firstCurl, spread * .25, .041, .054),
  ]));
  hs.push(K.lz('finger-tip-joint-' + i, D, [
    point(bendZ - .023, .133, spread * .56, .039, .048),
    point(bendZ + .004, .128, spread * .54, .041, .049),
  ]));
  hs.push(knuckleCap('knuckle-bearing-' + i, W, x + .032, 2.657, y, knuckleZ, .052));
  hs.push(knuckleCap('knuckle-' + i, G, 2.644, 2.674, y, knuckleZ, .065));
  hs.push(knuckleCap('knuckle-inset-' + i, W, 2.665, 2.682, y, knuckleZ + .002, .041));
}
hs.push(K.lz('thumb', W, [
  {z: 16.10, x: 2.347, y: -.816, a: .057, b: .051},
  {z: 16.30, x: 2.370, y: -.763, a: .076, b: .080},
  {z: 16.51, x: 2.407, y: -.677, a: .088, b: .102},
  {z: 16.73, x: 2.452, y: -.538, a: .091, b: .093},
  {z: 16.94, x: 2.456, y: -.448, a: .071, b: .067},
]));
hs.push(K.lz('thumb-joint', G, [
  {z: 16.050, x: 2.343, y: -.823, a: .049, b: .047},
  {z: 16.121, x: 2.349, y: -.812, a: .060, b: .051},
]));
hs.push(K.lz('thumb-middle', W, [
  {z: 15.82, x: 2.331, y: -.821, a: .043, b: .043},
  {z: 15.93, x: 2.337, y: -.843, a: .050, b: .047},
  {z: 16.076, x: 2.345, y: -.819, a: .052, b: .048},
]));
hs.push(K.lz('thumb-tip-joint', D, [
  {z: 15.799, x: 2.330, y: -.821, a: .039, b: .039},
  {z: 15.825, x: 2.332, y: -.821, a: .041, b: .041},
]));
hs.push(K.lz('thumb-tip', W, [
  {z: 15.615, x: 2.306, y: -.796, a: .012, b: .017},
  {z: 15.65, x: 2.310, y: -.809, a: .032, b: .032},
  {z: 15.80, x: 2.330, y: -.822, a: .043, b: .041},
]));
add('hand',hs);
const tail = {
  z: [7.3, 8.4, 10, 11, 12, 12.85, 13.5, 14.05, 14.35, 14.50, 14.55, 14.57, 14.59, 14.6],
  w: [.008, .126, .251, .317, .348, .41, .366, .362, .234, .130, .118, .083, .042, .020],
  front: [.810, .719, .632, .626, .627, .630, .644, .712, .827, .966, 1.004, 1.018, 1.035, 1.041],
  back: [.829, .842, .869, .902, .934, .986, 1.023, 1.045, 1.061, 1.064, 1.065, 1.062, 1.060, 1.058]
};
const tailAt = z => ({
  width: K.cr(tail.z, tail.w, z),
  front: K.cr(tail.z, tail.front, z),
  back: K.cr(tail.z, tail.back, z)
});
const symmetric = side => [...side, ...side.slice(1, -1).reverse().map(([x, depth]) => [-x, depth])];
const tailFront = [[0, 0], [.16, .18], [.31, .37], [.56, .57], [.83, .748], [1, .805]];
const tailSeam = [[.059, .065], [.074, .22], [.101, .46], [.148, .72], [.191, .902], [.202, .994]];
const tailSide = [tailSeam[0], ...tailFront.slice(1), [.91, .902], [.69, .946], [.35, .981], ...tailSeam.slice(1).reverse()];
const frontWidths = tailFront.map(([x]) => x);
const frontDepths = tailFront.map(([, depth]) => depth);
const seamDepths = tailSeam.map(([, depth]) => depth);
const seamWidths = tailSeam.map(([x]) => x);
const stripeZ = [7.3, 13.78, 14.06, 14.31, 14.40, 14.47, 14.53, 14.6];
const stripeHalfWidths = [.012, .012, .014, .019, .025, .032, .049, .035];
const stripeWidth = (width, z, depth = 0) => {
  const halfWidth = Math.max(.009, K.cr(stripeZ, stripeHalfWidths, z));
  const rear = Math.max(0, Math.min(1, depth));
  const root = Math.max(0, Math.min(1, (z - 14.06) / .32));
  const rootEdge = Math.max(0, 1 - ((z - 14.36) / .20) ** 2) * rear ** 5;
  const stripe = halfWidth * (1 + .17 * rear - root * (.32 - .37 * rear ** 1.8)) + .032 * rootEdge;
  const crown = Math.max(0, Math.min(1, (z - 14.41) / .15));
  const capStripe = crown * (.028 + .036 * rear ** .62);
  return Math.min(.86, Math.max(stripe, capStripe) / width);
};
const tailPointX = (width, z, x, depth) => {
  const seam = K.cr(seamDepths, seamWidths, depth);
  const stripe = stripeWidth(width, z, depth);
  const absX = Math.abs(x);
  const fraction = absX <= seam ? absX / seam * stripe : K.lerp(stripe, 1, (absX - seam) / (1 - seam));
  return Math.sign(x) * fraction * width;
};
const tailSections = [
  ...Array.from({length: 21}, (_, i) => K.lerp(7.3, 13.78, i / 20)),
  13.90, 14.06, 14.20, 14.31, 14.40, 14.47, 14.53, 14.55, 14.57, 14.59, 14.6
];
const tailLoft = (id, color, control) => ({
  id, color, ruled: true, loft: tailSections.map(z => {
    const {width, front, back} = tailAt(z);
    return {
      plane: 'xy', w: z * K.mm,
      pts: control.map(([x, depth]) => [tailPointX(width, z, x, depth) * K.mm, K.lerp(front, back, depth) * K.mm])
    };
  })
});
const tailPanelInnerAngle = 11.5;
const tailPanel = (id, color, side, z0, z1, lengths, widths, lift, thickness) => ({
  ...K.surfPlate(`${id}-${side}`, color, 'xy', z0, z1,
    (z, angle, offset) => {
      const {width, front, back} = tailAt(z);
      const fraction = angle / 90;
      const depth = K.cr(frontWidths, frontDepths, Math.abs(fraction));
      const clearance = Math.max(0, Math.abs(angle) - tailPanelInnerAngle);
      const edgeRelief = .27 + .73 * Math.min(1, clearance / 15);
      const relief = offset > 0 ? offset * edgeRelief : offset;
      return [tailPointX(width, z, fraction, depth), K.lerp(front, back, depth) - relief];
    },
    t => {
      const halfAngle = K.cr(lengths, widths, t);
      const start = tailPanelInnerAngle;
      const end = Math.max(start + 2, halfAngle);
      return side > 0 ? [start, end] : [-end, -start];
    }, lift, thickness, 1, 20),
  ruled: true
});
const tailGold = symmetric([
  [0, -.036], [.069, -.036],
  ...tailSeam.map(([width, depth]) => [width + .022, depth]),
  [0, 1.014]
]);
add('tail', [
  tailLoft('tail-core-left', P, tailSide),
  tailLoft('tail-core-right', P, tailSide.map(([x, depth]) => [-x, depth]).reverse()),
  ...[-1, 1].map(side => tailPanel('tail-middle-plate', W, side, 10.80, 13.97, [0, .23, .56, .85, 1], [10, 38, 77, 80, 36], -.012, .045)),
  ...[-1, 1].map(side => tailPanel('tail-upper-plate', P, side, 12.72, 14.53, [0, .22, .52, .81, 1], [10, 40, 73, 80, 32], -.009, .058)),
  tailLoft('tail-gold', G, tailGold),
  {...K.ly('tail-root-band', G, [
    {y: 1.010, x: 0, z: 14.547, a: .035, b: .015, n: 6},
    {y: 1.023, x: 0, z: 14.565, a: .041, b: .014, n: 6},
    {y: 1.036, x: 0, z: 14.576, a: .049, b: .017, n: 6},
    {y: 1.041, x: 0, z: 14.580, a: .053, b: .020, n: 6},
    {y: 1.045, x: 0, z: 14.581, a: .064, b: .019, n: 6},
    {y: 1.0595, x: 0, z: 14.575, a: .062, b: .020, n: 6},
    {y: 1.064, x: 0, z: 14.551, a: .047, b: .013, n: 6},
    {y: 1.0654, x: 0, z: 14.541, a: .015, b: .008, n: 6},
  ]), ruled: true},
]);
writeFileSync('cad/extremities.model.json',JSON.stringify({dir:'cad/extremities',components,joints,forms:Array.from({length:8},(_,i)=>({name:i===0?'立つ':i===7?'つかむ':`途中 ${i*5}度`,pose:{...Object.fromEntries(['bend-0','bend-1','bend-2','bend-rear'].map(id=>[id,i*5])),'foot-lift':i*.14}})),allow},null,2));
