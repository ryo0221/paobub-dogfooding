/**
 * 形の作り方（#308）。依存を読み込まない：Runner がこのファイルを作業の場所に kit.mjs として書き出し、作業役の生成のコードが import して使う。
 *
 * 単位は m（形の点は mm で返す）。z が上、正面が −y、+x が左（右の部品は sx = −1 で x を反転して作る）。
 * 作り方（白羽の dogfooding で確かめた順）：
 *   1. 部品図を下絵にし、下地の面を少ない点で決めた線（正面の幅 w・側面の前 F と後ろ B）でつなぐ：lines()
 *   2. 装甲の板を一枚ずつ、下地の面に沿って曲がった厚みのある部品として切り出し、重ねて貼る：plate()・rplate()（金の縁）
 *   3. 丸い飾り・関節の円板：disc()。細部の筒・爪・レンズ：lz()・ly()
 *   4. 部品（component）を関節でつなぎ、形態（form）ごとに関節の値を決める（組立は cad_build に渡す JSON に書く）
 */
                                            
const deg = Math.PI / 180, K = 1000;
/** m → mm */
export const mm = K;
                                  
                                       
                                                                        
/** 形（mm）。box：箱、plane+pts+span：押し出し、loft：断面をつなぐ（断面は閉じた点列。点を通る閉じた 3 次スプラインにする）。cuts：押し出しで切り抜く */
                                                                     
                         
                                                       
                                                                       
  

// ---------------------------------------------------------------- 形の作り方（m で受ける）

/** 超楕円（a, b：半径、n：2 で楕円・大きいほど四角、r：回す角度 °）を N 点で */
export const ring = (a        , b        , n = 2.2, N = 16, r = 0)       =>
  Array.from({ length: N }, (_, i) => {
    const t = (2 * Math.PI * i) / N, c = Math.cos(t), s = Math.sin(t);
    const u = a * Math.sign(c) * Math.abs(c) ** (2 / n), v = b * Math.sign(s) * Math.abs(s) ** (2 / n), q = r * deg;
    return [u * Math.cos(q) - v * Math.sin(q), u * Math.sin(q) + v * Math.cos(q)];
  });
export const lerp = (a        , c        , t        ) => a + (c - a) * t;
/** 箱（m）。sx = −1 で x を反転 */
export const box = (id        , color        , lo      , hi      , sx = 1)        => {
  const [a, c] = sx > 0 ? [lo, hi] : [[-hi[0], lo[1], lo[2]]        , [-lo[0], hi[1], hi[2]]        ];
  return { id, color, box: [a.map((x) => x * K)        , c.map((x) => x * K)        ] };
};
/** 高さ z ごとの断面（中心 x, y、半径 a, b、指数 n、回す角度 r）を z 方向に積む */
                                                                                                        
export const lz = (id        , color        , secs        , sx = 1)        => ({
  id, color,
  loft: secs.map((s) => { let pts = ring(s.a, s.b ?? s.a, s.n, 16, s.r).map(([u, v]) => [((s.x ?? 0) + u) * sx * K, ((s.y ?? 0) + v) * K]      ); if (sx < 0) pts = pts.reverse(); return { plane: 'xy'         , w: s.z * K, pts }; }),
});
/** 前後 y ごとの断面（中心 x, z）を y 方向に積む：くちばし・爪・指先・レンズ */
                                                                                                      
export const ly = (id        , color        , secs        , sx = 1)        => ({
  id, color,
  loft: secs.map((s) => { let pts = ring(s.a, s.b, s.n, 16, s.r ?? 0).map(([u, v]) => [((s.x ?? 0) + u) * sx * K, (s.z + v) * K]      ); if (sx < 0) pts = pts.reverse(); return { plane: 'xz'         , w: s.y * K, pts }; }),
});
/** x 方向の円板（肩・肘・ひざ・耳の丸い飾り）：x0 → x1（左側の値）、中心 (y, z)、半径 r */
export const disc = (id        , color        , x0        , x1        , y        , z        , r        , sx = 1)        => ({
  id, color, ruled: true,
  loft: [x0, x1].map((x) => ({ plane: 'yz'         , w: x * sx * K, pts: ring(r, r, 2, 16).map(([u, v]) => [(y + u) * K, (z + v) * K]      ) })),
});

/**
 * 線で決める下地：高さ z の並びに、正面の幅の半分 w、側面の前 F（−y）と後ろ B、中心の x、前の指数 nf と後ろの指数 nb を与える。
 * 断面は前がとがり後ろが丸い涙形。点は少なく（5〜13 点）、部品図の輪郭を読んで決める（ピクセルの輪郭は写さない：面がでこぼこになる）。
 */
                                                                                                                       
/** Catmull-Rom（範囲の外は端の値） */
export const cr = (zs          , vs          , z        ) => {
  let i = 0; while (i < zs.length - 2 && z > zs[i + 1] ) i++;
  const t = Math.min(1, Math.max(0, (z - zs[i] ) / (zs[i + 1]  - zs[i] ))), p0 = vs[Math.max(0, i - 1)] , p1 = vs[i] , p2 = vs[i + 1] , p3 = vs[Math.min(vs.length - 1, i + 2)] ;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
};
const tear = (w        , F        , B        , nf        , nb        , cx = 0, N = 24)       => {
  const c = (F + B) / 2, h = (B - F) / 2;
  return Array.from({ length: N }, (_, i) => {
    const t = (2 * Math.PI * i) / N, u = Math.cos(t), v = Math.sin(t), n = v < 0 ? nf : nb;
    return [cx + w * Math.sign(u) * Math.abs(u) ** (2 / n), c + h * Math.sign(v) * Math.abs(v) ** (2 / n)];
  });
};
const at = (L       , z        ) => { const f = (a                      , d        ) => (a ? cr(L.z, a, z) : d); return { w: Math.max(0.01, f(L.w, 0)), F: f(L.F, 0), B: f(L.B, 0), x: f(L.x, 0), nf: f(L.nf, 2), nb: f(L.nb, 2.2) }; };
/** 線から下地の部品を作る（断面 M 枚、24 まで）。cuts は mm の押し出しで切り抜く（首の穴など） */
export const lines = (id        , color        , L       , sx = 1, M = 14, cuts          )        => ({
  id, color, ...(cuts ? { cuts } : {}),
  loft: Array.from({ length: Math.min(24, M) }, (_, k) => {
    const z = lerp(L.z[0] , L.z[L.z.length - 1] , k / (Math.min(24, M) - 1)), q = at(L, z);
    let pts = tear(q.w, q.F, q.B, q.nf, q.nb, q.x).map(([u, v]) => [u * sx * K, v * K]      );
    if (sx < 0) pts = pts.reverse();
    return { plane: 'xy'         , w: z * K, pts };
  }),
});
/** 線で決めた下地の面の上の点（高さ z、断面の角度 θ：0 = 左の横、−90 = 正面、90 = 背中）。lift で面から浮かす */
export const onLines = (L       , z        , th        , lift = 0)                           => {
  const q = at(L, z), c = (q.F + q.B) / 2, h = (q.B - q.F) / 2, u = Math.cos(th * deg), v = Math.sin(th * deg), n = v < 0 ? q.nf : q.nb;
  return { x: q.x + (q.w + lift) * Math.sign(u) * Math.abs(u) ** (2 / n), y: c + (h + lift) * Math.sign(v) * Math.abs(v) ** (2 / n) };
};
/**
 * 面に沿った板：各断面で、面の上の角度 range(t) = [θ0, θ1] の弧を、浮き lift と lift + thick の 2 本で取り、端を丸めて閉じる。
 * plane 'xy' は高さ st ごと、'xz' は前後 st ごとの断面。surf(st, θ, lift) が面の上の点 [u, v] を返す。
 * 板の外形（角度の範囲が t でどう変わるか）は部品図の分け目の線に合わせる。θ0 < θ1 を守る（逆になると断面が自分と交わる）。
 */
export const surfPlate = (id        , color        , plane             , st0        , st1        , surf                                              ,
  range                                 , lift        , thick        , sx = 1, M = 7, N = 9)        => ({
  id, color,
  loft: Array.from({ length: M }, (_, k) => {
    const t = k / (M - 1), st = lerp(st0, st1, t), [a0, a1] = range(t);
    if (!(a1 > a0)) throw new Error(`${id}：板の角度の範囲が逆です（t = ${t.toFixed(2)}：${a0.toFixed(1)}° → ${a1.toFixed(1)}°）`);
    const arc = (lf        , rev         ) => Array.from({ length: N }, (_, i) => { const q = rev ? 1 - i / (N - 1) : i / (N - 1); return surf(st, lerp(a0, a1, q), lf); });
    const d = Math.max(0.6, ((a1 - a0) / (N - 1)) * 0.45);
    let pts = [surf(st, a0 - d, lift + thick / 2), ...arc(lift + thick, false), surf(st, a1 + d, lift + thick / 2), ...arc(lift, true)].map(([u, v]) => [u * sx * K, v * K]      );
    if (sx < 0) pts = pts.reverse();
    return { plane, w: st * K, pts };
  }),
});
/** 線の下地に沿った板（高さ z0 → z1） */
export const plate = (id        , color        , L       , z0        , z1        , range                                 , lift = 0, thick = 0.08, sx = 1, M = 7) =>
  surfPlate(id, color, 'xy', z0, z1, (z, th, lf) => { const p = onLines(L, z, th, lf); return [p.x, p.y]; }, range, lift, thick, sx, M);
/** 縁取りのある板：一回り大きい縁の色の板（rim°広く、少し下）の上に板を重ねる */
export const rplate = (id        , color        , rimColor        , L       , z0        , z1        , range                                 , sx = 1, rim = 3, thick = 0.08)          => [
  plate(`${id}-rim`, rimColor, L, z0 - 0.06, z1 + 0.06, (t) => { const [a, b] = range(t); return [a - rim, b + rim]; }, -0.005, thick * 0.7, sx),
  plate(id, color, L, z0, z1, range, 0, thick, sx),
];
/** 葉形の角度の範囲：中心 c°、いちばん広いところの半分の幅 h°、端の幅 e° */
export const leaf = (c        , h        , e        ) => (t        )                   => { const w = e + h * Math.sin(Math.PI * t) ** 0.7; return [c - w, c + w]; };
