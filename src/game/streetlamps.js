/* ──────────────────────────────────────────────────────────────────────────
   Фонари: все сбиваются. Правила словами и числами — docs/CAREER.md
   «Город: что сбивается» → «Фонари — сбиваются все» и «Фонари: виды и провода».

   • Столб (основание, гранёный ствол, изогнутый кронштейн, корпус плафона, траверсы, изоляторы, щиток, растяжка)
     и провода, которые от него идут, — в склейке сбиваемого (smashAdd, вид 'lamp'): одна отрисовка на клетку, как
     заборчики и знаки. Вид собирается один раз шаблоном (форма — по виду и жребию места, без Math.random), каждому
     фонарю — только свои вершины (цвет и индекс — общие у шаблона). Сбил — столб схлопывается, вместо него падает
     целый фонарь (свой меш, только пока лежит, LIE секунд), плафон гаснет, пятно света под ним пропадает, провода
     у его пролётов рвутся и свисают до земли.
   • Плафон (стекло, шар, фонарь-«ящик») — в склейке LAMPH (горит ночью), пятно света — в LAMP_SPOTS.
     Чьи вершины в склейках — запоминает game.js (mergeChunked, buildNight) по метке track: сбил — эти вершины уходят
     под землю. Источников света нет: и плафон, и пятно — просто яркие меши.
   • Виды (STYLES ниже): 'cobra' — советская консоль над дорогой (плоский ЖКУ или колокол РКУ), 'double' — двойная
     консоль на разделительной проспекта, 'torch' — торшер с цилиндрическим плафоном, 'cast' — чугунный с литыми
     завитками (Старый город и у площадей), 'ball' / 'twin' — шар и два шара, 'park' — шар у аллей (у трети — три
     шара), 'wood' — деревянный столб частного сектора с фонарём на кронштейне (колпак, малая консоль или шар),
     'conc' — бетонный столб с траверсами и изоляторами, 'mast' — прожекторная мачта (каток, стоянки), 'yard' —
     фонарь над парковкой пиццерии. 'woodball' — старое имя деревянного с шаром.
   • Провода — тонкими трёхгранными лентами в той же склейке: между соседними столбами одной стороны улицы
     (провисают дугой), у деревянных и бетонных — ещё к домам. В мобильном режиме проводов нет (память).
   • ?oldlamps — прежние коробки (сравнить «до/после»), ?nowires — без проводов.

   Переменных игры модуль не видит: всё приходит объектом A (put, smashAdd,
   groundH, LAMPH, LAMP_SPOTS…). streets(A) — из osmStreetLife,
   lamp(A, o) — из world.js / pizzeria.js / landmarks.js, step(dt) — каждый кадр.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { blocks as ringIsland, circles as ringCircles } from './rings.js';   // остров малого круга: там ни фонарей, ни знаков (rings.js)
import * as MOBM from './mobile.js';

/* числа — здесь; в docs/CAREER.md — они же словами */
export const LAMP = {
  STEP: 36,          // м между фонарями вдоль большой улицы (через раз по сторонам)
  STEP_PRIV: 40,     // м в частном секторе (по одной стороне улицы)
  R: 0.45,           // радиус столба для удара
  SLOW: 0.9,         // машина сохраняет 90 % скорости, снеся фонарь
  LIE: 25,           // с лежит упавший фонарь, потом уходит в землю
  FALL_CAP: 10,      // столько падающих/лежащих одновременно, старые убираем
  SPAN_BIG: 80,      // м — длиннее пролёт между столбами одной стороны большой улицы — без провода
  SPAN_PRIV: 47,     // м — то же в частном секторе
  DROP_MIN: 5,       // м — провод к дому: от столба до стены не ближе
  DROP_MAX: 26,      //   и не дальше
  DROPS: 2,          // проводов к домам с одного столба, не больше
  SQUARE_R: 230,     // м от центра площади (ровного малого круга) — чугунные фонари
  MED_MIN: 2.0,      // м — разделительная проспекта уже — двойной консоли нет
  MED_MAX: 14,       //   шире — тоже нет (там бульвар: обычные столбы)
  MED_GAP: 22,       // м — двойные консоли на разделительной не чаще
  LOT_AREA: 800,     // м² — стоянка больше — прожекторная мачта у её края
};

const Q = typeof location !== 'undefined' ? location.search : '';
const OLD = /[?&]oldlamps(&|$)/.test(Q);
const MOB = MOBM.ON;
const WIRES = !OLD && !MOB && !/[?&]nowires(&|$)/.test(Q);
const SIDES = MOB ? 6 : 8;                          // граней у ствола и плафона

const GREY = '#585460', DARK = '#3b3f46', WOOD = '#6e5a45', HEAD = '#fff3c4', WARM = '#ffe2a6';
const COL = {
  steel: '#80858c', steelD: '#62676e', dark: '#3b3f46', iron: '#24282b', ironG: '#2c3732', wood: '#6b5641', woodD: '#4f3f2e',
  conc: '#a29e94', concD: '#7e7b74', porc: '#ece6d6', glass: '#6fa595', box: '#71806c', boxD: '#4f5a4b', wire: '#222327',
  enamel: '#e4e8ea', park: '#2f3338', hood: '#5d6168', mast: '#8b9097',
};
export const STATS = { city: 0, ball: 0, twin: 0, priv: 0, poorOld: 0, down: 0, skip: { road: 0, house: 0, zebra: 0 }, kinds: {}, wires: 0, drops: 0, spans: 0, verts: 0, wireVerts: 0, tpl: 0 };
const LAMPS = [];
const FALL = [];
let SCENE = null;

/* ── прежние коробки (?oldlamps) ── */
function oldParts (style) {
  const P = [];
  const B = (w, h, d, hex, x, y, z, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    P.push({ g, hex });
  };
  const Lit = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z); P.push({ g, hex: HEAD, glow: 1 }); };
  const Ball = (r, x, y, z, hex = HEAD) => { const g = new THREE.SphereGeometry(r, 8, 6).translate(x, y, z); P.push({ g, hex, glow: 1 }); };
  let head = [0, 0];
  switch (style) {
    case 'cobra':
      B(0.26, 7.0, 0.26, GREY, 0, 3.2, 0);
      B(2.2, 0.22, 0.22, GREY, 1.0, 6.6, 0);
      Lit(0.9, 0.16, 0.5, 1.9, 6.45, 0);
      head = [1.9, 0]; break;
    case 'ball':
      B(0.42, 0.7, 0.42, DARK, 0, 0.35, 0);
      B(0.18, 4.4, 0.18, DARK, 0, 2.6, 0);
      B(0.36, 0.14, 0.36, DARK, 0, 4.82, 0);
      Ball(0.42, 0, 5.25, 0);
      head = [0.8, 0]; break;
    case 'twin':
      B(0.42, 0.7, 0.42, DARK, 0, 0.35, 0);
      B(0.18, 4.5, 0.18, DARK, 0, 2.6, 0);
      B(0.16, 0.14, 1.7, DARK, 0, 4.7, 0);
      Ball(0.34, 0, 5.05, 0.78); Ball(0.34, 0, 5.05, -0.78);
      head = [0.8, 0]; break;
    case 'wood':
    case 'woodball':
      B(0.26, 6.6, 0.26, WOOD, 0, 3.0, 0);
      B(1.5, 0.12, 0.12, GREY, 0.7, 5.9, 0, 0.18);
      if (style === 'wood') Lit(0.5, 0.13, 0.3, 1.45, 5.95, 0);
      else { B(0.04, 0.3, 0.04, GREY, 1.4, 5.92, 0); Ball(0.24, 1.4, 5.62, 0, WARM); }
      head = [1.4, 0]; break;
    case 'park':
      B(0.34, 0.5, 0.34, '#2f3338', 0, 0.2, 0);
      B(0.14, 3.9, 0.14, DARK, 0, 2.2, 0);
      B(0.5, 0.12, 0.5, '#2f3338', 0, 4.2, 0);
      Ball(0.3, 0, 4.5, 0);
      break;
    case 'yard':
      B(0.22, 5.5, 0.22, GREY, 0, 2.75, 0);
      B(1.0, 0.12, 0.12, GREY, 0.45, 5.5, 0);
      Lit(0.5, 0.2, 0.7, 0.8, 5.4, 0);
      head = [0.8, 0]; break;
    default:                                         // 'mast' и всё новое — мачта
      B(0.3, 9, 0.3, GREY, 0, 4.5, 0);
      Lit(0.6, 0.3, 1.2, 0.35, 8.8, 0);
      head = [0.35, 0]; break;
  }
  return { P, head };
}

/* ── шаблоны: вершины одного вида в координатах фонаря (низ столба — 0, вынос консоли — по +X, улица — вдоль Z) ── */
const RGB = new Map();
function rgb (hex) {
  let c = RGB.get(hex);
  if (!c) { const k = new THREE.Color(hex); c = [k.r, k.g, k.b]; RGB.set(hex, c); }
  return c;
}
function kit () { return { p: [], c: [], i: [] }; }
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/* труба по ломаной pts с радиусами rs: кольцо из n граней в плоскости (u, u × t); ref — «верх» кольца (по умолчанию
   Z для кривых в плоскости XY, Y — если ось почти вдоль Z). su, sv — сплющить кольцо. cap0/cap1 — донышки.
   Обход граней — наружу (FrontSide у склейки): e1 × e2 = −t, тогда (a, b, d), (b, c, d) смотрят наружу */
function sweep (K, pts, rs, n, hex, o = {}) {
  const col = rgb(hex), base = K.p.length / 3, m = pts.length;
  const su = o.su || 1, sv = o.sv || 1, ph = o.ph || 0;
  for (let j = 0; j < m; j++) {
    const a = pts[Math.max(0, j - 1)], b = pts[Math.min(m - 1, j + 1)];
    const t = norm(sub(b, a));
    let ref = o.ref || (Math.abs(t[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1]);
    if (Math.abs(dot(ref, t)) > 0.95) ref = Math.abs(t[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const k = dot(ref, t), u = norm([ref[0] - t[0] * k, ref[1] - t[1] * k, ref[2] - t[2] * k]), v = cross(u, t);
    const r = rs[j], P = pts[j];
    for (let q = 0; q < n; q++) {
      const ang = ph + q / n * Math.PI * 2, cu = Math.cos(ang) * r * su, sn = Math.sin(ang) * r * sv;
      K.p.push(P[0] + u[0] * cu + v[0] * sn, P[1] + u[1] * cu + v[1] * sn, P[2] + u[2] * cu + v[2] * sn);
      K.c.push(col[0], col[1], col[2]);
    }
  }
  for (let j = 0; j < m - 1; j++)
    for (let q = 0; q < n; q++) {
      const a = base + j * n + q, b = base + (j + 1) * n + q, c = base + (j + 1) * n + (q + 1) % n, d = base + j * n + (q + 1) % n;
      K.i.push(a, b, d, b, c, d);
    }
  const cap = (j, top) => {
    const P = pts[j], ci = K.p.length / 3;
    K.p.push(P[0], P[1], P[2]); K.c.push(col[0], col[1], col[2]);
    for (let q = 0; q < n; q++) {
      const a = base + j * n + q, d = base + j * n + (q + 1) % n;
      if (top) K.i.push(ci, d, a); else K.i.push(ci, a, d);
    }
  };
  if (o.cap0) cap(0, false);
  if (o.cap1) cap(m - 1, true);
}
/* вертикальная ось: профиль [[r, y], …] снизу вверх в точке (x, z) */
function lathe (K, x, z, prof, n, hex, o = {}) {
  sweep(K, prof.map(q => [x, q[1], z]), prof.map(q => q[0]), n, hex, { ref: [1, 0, 0], ...o });
}
/* коробка w × h × d с центром (x, y, z), повороты rz (вокруг Z), ry (вокруг Y) */
function box (K, w, h, d, hex, x, y, z, rz = 0, ry = 0) {
  const col = rgb(hex), base = K.p.length / 3;
  const cz = Math.cos(rz), sz = Math.sin(rz), cy = Math.cos(ry), sy = Math.sin(ry);
  for (let k = 0; k < 8; k++) {
    let px = (k & 1 ? 0.5 : -0.5) * w, py = (k & 2 ? 0.5 : -0.5) * h, pz = (k & 4 ? 0.5 : -0.5) * d;
    const qx = px * cz - py * sz, qy = px * sz + py * cz;
    px = qx * cy + pz * sy; pz = -qx * sy + pz * cy;
    K.p.push(x + px, y + qy, z + pz); K.c.push(col[0], col[1], col[2]);
  }
  // грани: −X, +X, −Y, +Y, −Z, +Z (обход наружу)
  const F = [[0, 4, 6, 2], [1, 3, 7, 5], [0, 1, 5, 4], [2, 6, 7, 3], [0, 2, 3, 1], [4, 5, 7, 6]];
  for (const f of F) K.i.push(base + f[0], base + f[1], base + f[2], base + f[0], base + f[2], base + f[3]);
}
/* стержень между двумя точками (тонкий, n граней) */
const rod = (K, a, b, r, hex, n = 4) => sweep(K, [a, b], [r, r], n, hex, { ref: Math.abs(norm(sub(b, a))[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0] });
/* кривая Безье a → c через b, m точек */
function bez (a, b, c, m) {
  const out = [];
  for (let k = 0; k < m; k++) {
    const t = k / (m - 1), s = 1 - t;
    out.push([s * s * a[0] + 2 * s * t * b[0] + t * t * c[0], s * s * a[1] + 2 * s * t * b[1] + t * t * c[1], s * s * a[2] + 2 * s * t * b[2] + t * t * c[2]]);
  }
  return out;
}
/* завиток (спираль) в плоскости XY: центр (cx, cy), радиус r0 → r1, углы a0 → a1, z — смещение */
function curl (cx, cy, z, r0, r1, a0, a1, m) {
  const out = [];
  for (let k = 0; k < m; k++) {
    const t = k / (m - 1), r = r0 + (r1 - r0) * t, a = a0 + (a1 - a0) * t;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]);
  }
  return out;
}
/* шар (плафон): по вертикали, n граней, m поясов */
function ball (K, x, y, z, r, n, m = 6, hex = HEAD) {
  const prof = [];
  for (let k = 0; k <= m; k++) { const f = k / m * Math.PI; prof.push([Math.max(0.001, Math.sin(f) * r), y - Math.cos(f) * r]); }
  lathe(K, x, z, prof, n, hex);
}

/* консоль-«кобра»: корпус и стекло на конце кронштейна. hx, hy — где кронштейн входит в корпус, s — по ±X, sc — размер,
   kind 0 — плоский ЖКУ (длинная капля), 1 — колокол РКУ (купол и чаша). → x середины стекла */
function cobraHead (K, G, hx, hy, s, sc, kind, hex = COL.hood) {
  if (kind === 1) {
    const cx = hx + s * 0.22 * sc;
    lathe(K, cx, 0, [[0.05 * sc, hy + 0.2 * sc], [0.2 * sc, hy + 0.13 * sc], [0.27 * sc, hy - 0.01 * sc], [0.27 * sc, hy - 0.06 * sc]], SIDES, hex, { cap0: 1 });
    lathe(G, cx, 0, [[0.26 * sc, hy - 0.06 * sc], [0.21 * sc, hy - 0.24 * sc], [0.05 * sc, hy - 0.34 * sc]], SIDES, HEAD, { cap0: 1, cap1: 1 });
    return cx;
  }
  const L = 0.82 * sc, xs = [0, 0.1, 0.32, 0.62, 1].map(f => hx + s * f * L), tilt = 0.08;
  const pts = xs.map(x => [x, hy + Math.abs(x - hx) * tilt, 0]);
  sweep(K, pts, [0.05, 0.13, 0.17, 0.15, 0.05].map(r => r * sc), SIDES, hex, { ref: [0, 1, 0], su: 0.55, cap0: 1, cap1: 1 });
  const gp = [0.12, 0.3, 0.6, 0.86].map(f => { const x = hx + s * f * L; return [x, hy - 0.06 * sc + Math.abs(x - hx) * tilt, 0]; });
  sweep(G, gp, [0.05, 0.12, 0.11, 0.04].map(r => r * sc), SIDES, HEAD, { ref: [0, 1, 0], su: 0.45, sv: 0.85, cap0: 1, cap1: 1 });
  return hx + s * 0.5 * L;
}
/* гранёный конический стальной столб с фланцем; → верх */
function steelPole (K, H, r0 = 0.155, r1 = 0.075, hex = COL.steel) {
  lathe(K, 0, 0, [[0.24, 0], [0.24, 0.07], [r0 + 0.01, 0.09], [r0, 0.6], [r1, H]], SIDES, hex, { cap1: 1 });
  if (!MOB) lathe(K, 0, 0, [[r0 + 0.025, 2.1], [r0 + 0.025, 2.2]], SIDES, COL.steelD);   // стык секций
  return H;
}
/* изогнутый кронштейн от ствола (x 0) на высоте y0 вверх и в сторону s до (s·L, y1); с подкосом — brace */
function bracket (K, y0, y1, L, s, r, hex, brace) {
  const pts = bez([0, y0, 0], [s * L * 0.05, y1 + 0.25, 0], [s * L, y1, 0], MOB ? 4 : 6);
  sweep(K, pts, pts.map(() => r), 5, hex);
  if (brace && !MOB) rod(K, [0, y0 - 0.55, 0], [s * L * 0.55, y1 + 0.02, 0], r * 0.5, hex);
}
/* щиток на столбе (с улицы не видно — с обратной стороны) */
function eBox (K, y, back = -1) { box(K, 0.3, 0.46, 0.16, COL.box, back * 0.2, y, 0); box(K, 0.34, 0.05, 0.2, COL.boxD, back * 0.2, y + 0.25, 0); }
/* растяжка: от столба на высоте y до земли в 2,8 м по направлению (gx, gz) — и бетонный якорь */
function guy (K, y, gx, gz) {
  const l = Math.hypot(gx, gz) || 1, ax = gx / l * 2.8, az = gz / l * 2.8;
  rod(K, [0, y, 0], [ax, 0.05, az], 0.018, COL.wire, 3);
  box(K, 0.3, 0.12, 0.3, COL.concD, ax, 0.06, az);
}
/* изолятор на штыре; → точка, где лежит провод */
function insul (K, x, y, z, glass) {
  lathe(K, x, z, [[0.015, y], [0.065, y + 0.07], [0.025, y + 0.15]], 4, glass ? COL.glass : COL.porc, { cap1: 1 });
  return [x, y + 0.14, z];
}

/* все виды. v — жребий места (числа 0…1): ниже по ним выбирается форма. → { K, G, head: [x…], top, rad, wa: точки проводов } */
function build (style, v) {
  const K = kit(), G = kit();
  let head = [0], top = 6, rad = 0.18, wa = [];
  const wb = v.w ? 1 : 0;                                         // этот столб держит провода
  switch (style) {
    case 'cobra': {                                               // советская консоль над дорогой
      const H = 8.4 + v.hh * 0.5, L = 1.5 + v.ll * 0.3, kind = v.kind;
      steelPole(K, H);
      bracket(K, H - 0.65, H + 0.1, L, 1, 0.05, COL.steel, v.br);
      head = [cobraHead(K, G, L - 0.02, H + 0.1, 1, 1, kind)];
      if (v.bx) eBox(K, 1.9);
      if (wb) for (const y of [H - 1.0, H - 1.35]) { box(K, 0.2, 0.05, 0.05, COL.steelD, -0.12, y - 0.02, 0); wa.push(insul(K, -0.22, y, 0, 0)); }
      top = H - 0.9; rad = 0.14; break;
    }
    case 'double': {                                              // двойная консоль на разделительной
      const H = 9.4 + v.hh * 0.5, L = 1.6 + v.ll * 0.3, kind = v.kind;
      steelPole(K, H, 0.17, 0.085);
      for (const s of [-1, 1]) { bracket(K, H - 0.7, H + 0.12, L, s, 0.05, COL.steel, v.br); head.push(cobraHead(K, G, s * (L - 0.02), H + 0.12, s, 1, kind)); }
      head.shift();
      lathe(K, 0, 0, [[0.11, H - 0.05], [0.07, H + 0.25], [0.01, H + 0.35]], SIDES, COL.steelD);   // макушка
      top = H - 1; rad = 0.15; break;
    }
    case 'torch': {                                               // торшер: цилиндрический плафон на макушке
      const H = 4.3 + v.hh * 0.35, hex = v.col ? COL.dark : COL.ironG;
      lathe(K, 0, 0, [[0.27, 0], [0.27, 0.12], [0.2, 0.2], [0.15, 0.75], [0.12, 0.85], [0.1, H], [0.13, H + 0.02], [0.13, H + 0.12]], SIDES, hex, { cap1: 1 });
      const tall = v.kind ? 0.85 : 0.6, rr = v.kind ? 0.2 : 0.26;
      lathe(G, 0, 0, [[0.1, H + 0.12], [rr, H + 0.16], [rr * 1.08, H + 0.12 + tall * 0.6], [rr, H + 0.12 + tall]], 10, HEAD, { cap1: 1 });
      lathe(K, 0, 0, [[rr * 1.2, H + 0.12 + tall], [rr * 1.25, H + 0.18 + tall], [0.06, H + 0.36 + tall], [0.03, H + 0.5 + tall]], 10, hex, { cap0: 1, cap1: 1 });
      head = [0.6]; top = H - 0.2; rad = 0.12; break;
    }
    case 'cast': {                                                // чугунный с литыми завитками
      const H = 4.2 + v.hh * 0.3, hex = v.col ? COL.iron : COL.ironG, n = MOB ? 6 : 8;
      lathe(K, 0, 0, [[0.36, 0], [0.36, 0.18], [0.28, 0.24], [0.25, 0.55], [0.31, 0.62], [0.31, 0.72], [0.18, 0.86], [0.13, 1.02]], n, hex);
      lathe(K, 0, 0, [[0.13, 1.02], [0.12, 2.0], [0.15, 2.04], [0.15, 2.12], [0.11, 2.16], [0.095, H - 0.1], [0.14, H], [0.16, H + 0.12], [0.07, H + 0.16]], n, hex);
      lathe(K, 0, 0, [[0.07, H + 0.16], [0.05, H + 0.32], [0.07, H + 0.4], [0.005, H + 0.62]], 6, hex, { cap1: 1 });   // пика
      // узор на стволе: два завитка-«лиры» над основанием
      if (!MOB) for (const s of [-1, 1]) {
        sweep(K, curl(s * 0.2, 1.42, 0, 0.17, 0.04, s > 0 ? -1.9 : -1.24, s > 0 ? 3.3 : -6.44, 12), Array(12).fill(0.024), 4, hex);
      }
      const arms = v.kind ? [-1, 1] : [1];
      head = [];
      for (const s of arms) {
        const ay = H - 0.35, end = [s * 1.0, ay + 0.28, 0];
        sweep(K, bez([0, ay - 0.15, 0], [s * 0.6, ay + 0.55, 0], end, MOB ? 5 : 8), Array(MOB ? 5 : 8).fill(0.035), 4, hex);
        // большой завиток под рукой и малый у конца
        const c1 = curl(s * 0.34, ay - 0.12, 0, 0.24, 0.05, s > 0 ? 2.6 : 0.54, s > 0 ? 2.6 - 6.0 : 0.54 + 6.0, MOB ? 8 : 14);
        sweep(K, c1, c1.map((_, k) => 0.03 - k * 0.001), 4, hex);
        if (!MOB) { const c2 = curl(s * 0.78, ay + 0.12, 0, 0.12, 0.03, s > 0 ? 0.3 : 2.84, s > 0 ? 0.3 + 5.2 : 2.84 - 5.2, 10); sweep(K, c2, c2.map(() => 0.022), 4, hex); }
        // фонарь-«ящик»: крюк, шапка-пирамида, стекло, донце с шишечкой
        const lx = end[0], ly = end[1];
        rod(K, [lx, ly + 0.02, 0], [lx, ly - 0.14, 0], 0.025, hex, 4);
        lathe(K, lx, 0, [[0.21, ly - 0.36], [0.22, ly - 0.32], [0.08, ly - 0.16], [0.03, ly - 0.12]], 4, hex, { ph: Math.PI / 4, cap0: 1, cap1: 1 });
        lathe(G, lx, 0, [[0.18, ly - 0.36], [0.17, ly - 0.62], [0.12, ly - 0.84]], 4, WARM, { ph: Math.PI / 4, cap0: 1, cap1: 1 });
        lathe(K, lx, 0, [[0.13, ly - 0.84], [0.1, ly - 0.9], [0.03, ly - 1.02], [0.005, ly - 1.06]], 4, hex, { ph: Math.PI / 4, cap0: 1, cap1: 1 });
        head.push(lx);
      }
      if (arms.length > 1) head = [0.6];
      top = 3.6; rad = 0.12; break;
    }
    case 'ball': {                                                // шар-плафон на макушке
      const hex = v.col ? COL.dark : COL.ironG, H = 4.6 + v.hh * 0.3;
      lathe(K, 0, 0, [[0.26, 0], [0.26, 0.5], [0.21, 0.62], [0.17, 0.7], [0.11, 0.8], [0.085, H], [0.15, H + 0.08], [0.2, H + 0.18], [0.12, H + 0.22]], SIDES, hex);
      ball(G, 0, H + 0.58, 0, 0.42, MOB ? 8 : 10, 6);
      head = [0.8]; top = H - 0.2; rad = 0.11; break;
    }
    case 'twin': {                                                // два шара на изогнутых рожках
      const hex = v.col ? COL.dark : COL.ironG, H = 4.5;
      lathe(K, 0, 0, [[0.26, 0], [0.26, 0.5], [0.21, 0.62], [0.17, 0.7], [0.11, 0.8], [0.085, H], [0.11, H + 0.1]], SIDES, hex, { cap1: 1 });
      for (const s of [-1, 1]) {
        const pts = bez([0, H - 0.05, 0], [0, H + 0.05, s * 0.7], [0, H + 0.45, s * 0.82], MOB ? 4 : 6);
        sweep(K, pts, pts.map(() => 0.04), 5, hex, { ref: [1, 0, 0] });
        lathe(K, 0, s * 0.82, [[0.03, H + 0.43], [0.12, H + 0.5], [0.12, H + 0.56]], SIDES, hex);
        ball(G, 0, H + 0.86, s * 0.82, 0.32, MOB ? 8 : 10, 6);
      }
      head = [0.8]; top = H - 0.2; rad = 0.11; break;
    }
    case 'park': {                                                // аллея: тонкий столбик и шар (у трети — три шара)
      const three = v.kind, H = three ? 3.7 : 3.9;
      lathe(K, 0, 0, [[0.2, 0], [0.2, 0.42], [0.13, 0.5], [0.07, 0.62], [0.065, H], [0.12, H + 0.06], [0.12, H + 0.12]], SIDES, COL.park, { cap1: 1 });
      if (three) {
        for (let k = 0; k < 3; k++) {
          const a = v.hh * 1.047 + k * 2.094, cx = Math.cos(a) * 0.55, cz = Math.sin(a) * 0.55;
          const pts = bez([0, H + 0.05, 0], [cx * 0.7, H + 0.05, cz * 0.7], [cx, H + 0.35, cz], MOB ? 3 : 5);
          sweep(K, pts, pts.map(() => 0.03), 4, COL.park);
          ball(G, cx, H + 0.6, cz, 0.24, MOB ? 6 : 8, 5);
        }
      } else ball(G, 0, H + 0.42, 0, 0.3, MOB ? 8 : 10, 6);
      head = [0]; top = H - 0.3; rad = 0.09; break;
    }
    case 'wood':                                                  // деревянный столб частного сектора
    case 'woodball': {
      const H = 7.0 + v.hh * 0.3, stub = v.stub;
      const lean = v.lean * 0.035;                            // чуть кривой
      sweep(K, [[0, 0, 0], [lean * 0.5, H * 0.5, 0], [lean, H, 0]], [0.14, 0.125, 0.11], 6, v.col ? COL.wood : COL.woodD, { ref: [1, 0, 0], cap1: 1 });
      if (stub) {                                                 // бетонная приставка и хомуты
        box(K, 0.2, 2.0, 0.17, COL.conc, -0.2, 1.0, 0);
        for (const y of [0.6, 1.7]) box(K, 0.46, 0.04, 0.3, COL.wire, -0.1, y, 0);
      }
      // траверса поперёк улицы с изоляторами (провода вдоль улицы)
      box(K, 1.3, 0.1, 0.1, COL.woodD, lean, H - 0.32, 0);
      for (const x of [-0.55, -0.2, 0.2, 0.55]) { const p = insul(K, lean + x, H - 0.27, 0, v.glass); if (wb) wa.push(p); }
      // фонарь на изогнутом кронштейне
      const by = H - 1.2, L = 1.25;
      const pts = bez([0.1, by, 0], [0.6, by + 0.45, 0], [L, by + 0.35, 0], MOB ? 4 : 6);
      sweep(K, pts, pts.map(() => 0.03), 5, COL.steelD);
      rod(K, [0.1, by - 0.2, 0], [0.1, by + 0.25, 0], 0.04, COL.steelD, 4);   // хомут
      const kind = style === 'woodball' ? 2 : v.kind;
      if (kind === 0) {                                           // эмалированный колпак с лампочкой
        rod(K, [L, by + 0.35, 0], [L, by + 0.12, 0], 0.02, COL.steelD, 4);
        lathe(K, L, 0, [[0.28, by - 0.12], [0.26, by - 0.08], [0.1, by + 0.08], [0.04, by + 0.14]], SIDES, COL.enamel, { cap1: 1 });
        ball(G, L, by - 0.06, 0, 0.09, 6, 4, WARM);
        head = [L];
      } else if (kind === 1) head = [cobraHead(K, G, L, by + 0.35, 1, 0.68, 0, COL.steelD)];
      else { rod(K, [L, by + 0.35, 0], [L, by + 0.05, 0], 0.02, COL.steelD, 4); ball(G, L, by - 0.18, 0, 0.23, MOB ? 6 : 8, 5, WARM); head = [L]; }
      if (v.bx) eBox(K, 1.7, stub ? 1 : -1);
      if (v.gz) guy(K, H - 0.6, 0, v.gz);
      else if (v.gout) guy(K, H - 0.6, -1, 0);
      top = H - 1.4; rad = 0.15; break;
    }
    case 'conc': {                                                // бетонный столб: траверсы, изоляторы, консоль
      const H = 8.8 + v.hh * 0.4;
      lathe(K, 0, 0, [[0.21, 0], [0.12, H]], 4, COL.conc, { ph: Math.PI / 4, cap1: 1 });
      if (!MOB) for (let k = 0; k < 3; k++) box(K, 0.07, 0.07, 0.36 - k * 0.04, COL.concD, 0, 2.2 + k * 1.9, 0);   // отверстия-«ступени» (тёмные пятна)
      const top3 = H - 0.35;
      box(K, 1.6, 0.07, 0.07, COL.steelD, 0, top3, 0);            // верхняя траверса
      const xs = v.three ? [-0.7, -0.25, 0.7] : [-0.7, 0.7];
      for (const x of xs) { const p = insul(K, x, top3 + 0.04, 0, v.glass); if (wb) wa.push(p); }
      { const p = insul(K, 0, H, 0, v.glass); if (wb) wa.push(p); }   // на макушке
      if (v.low) {                                           // нижняя траверса — ещё два провода
        box(K, 1.0, 0.06, 0.06, COL.steelD, 0, H - 1.3, 0);
        for (const x of [-0.42, 0.42]) { const p = insul(K, x, H - 1.26, 0, v.glass); if (wb) wa.push(p); }
      }
      const by = H - 2.3, L = 1.45;
      bracket(K, by - 0.1, by + 0.45, L, 1, 0.04, COL.steelD, false);
      head = [cobraHead(K, G, L, by + 0.45, 1, 0.8, v.kind)];
      if (v.bx) eBox(K, 1.8);
      if (v.gz) guy(K, H - 0.6, 0, v.gz);
      else if (v.gout) guy(K, H - 0.6, -1, 0);
      top = H - 2.6; rad = 0.17; break;
    }
    case 'yard': {                                                // фонарь над парковкой пиццерии
      steelPole(K, 5.6, 0.12, 0.065);
      bracket(K, 5.2, 5.75, 0.8, 1, 0.04, COL.steel, false);
      head = [cobraHead(K, G, 0.8, 5.75, 1, 0.75, 0)];
      top = 5; rad = 0.12; break;
    }
    default: {                                                    // 'mast': прожекторная мачта
      const H = v.tall ? 13 : 10;
      lathe(K, 0, 0, [[0.36, 0], [0.36, 0.1], [0.27, 0.14], [0.13, H]], 6, COL.mast, { cap1: 1 });
      if (!MOB) for (let y = 1.2; y < H - 1; y += 1.1) box(K, 0.36, 0.03, 0.03, COL.steelD, -0.2, y, 0);   // скобы-лесенка
      box(K, 0.9, 0.06, 1.6, COL.steelD, 0.25, H - 0.05, 0);       // площадка
      box(K, 0.06, 0.9, 1.9, COL.steelD, 0.55, H + 0.4, 0);        // рама прожекторов
      for (const [zz, yy] of [[-0.6, H + 0.15], [0, H + 0.15], [0.6, H + 0.15], [-0.6, H + 0.65], [0, H + 0.65], [0.6, H + 0.65]]) {
        box(K, 0.16, 0.4, 0.5, COL.hood, 0.68, yy, zz, -0.35);
        box(G, 0.02, 0.34, 0.44, HEAD, 0.78, yy - 0.04, zz, -0.35);
      }
      head = [0.6]; top = H - 1.5; rad = 0.2; break;
    }
  }
  return { K, G, head, top, rad, wa };
}
const TPL = new Map();
/* шаблон вида: позиции, цвета, индекс — Float32 / Uint16; стёкла — отдельно (каждое — свой кусок LAMPH) */
function tpl (style, v0) {
  const v = dec(style, v0);
  const key = style + '|' + Object.keys(v).sort().map(k => k + ':' + v[k]).join(',');
  let T = TPL.get(key);
  if (T) return T;
  const b = build(style, v), K = b.K, G = b.G;
  STATS.tplV = (STATS.tplV || 0) + K.p.length / 3;
  (STATS.vby || (STATS.vby = {}))[style] = K.p.length / 3 + '/' + G.p.length / 3;
  T = {
    p: new Float32Array(K.p), c: new Float32Array(K.c), i: K.p.length / 3 > 65535 ? new Uint32Array(K.i) : new Uint16Array(K.i),
    g: G.p.length ? { p: new Float32Array(G.p), i: new Uint16Array(G.i) } : null,
    head: b.head, top: b.top, rad: b.rad, wa: b.wa, fall: null,
  };
  T.n = T.p.length / 3;
  TPL.set(key, T);
  STATS.tpl++;
  return T;
}
const vq = h => h;
/* жребий места (числа 0…1: a—d — общие у улицы, e—h — свои у столба) → решения формы маленькими числами: из них ключ
   шаблона (вид не размножается на тысячи шаблонов) */
function dec (style, v) {
  const F = (h, n) => Math.min(n - 1, Math.floor((h || 0) * n)), B = (h, t) => (h || 0) < t ? 1 : 0;
  const w = v.w ? 1 : 0, gz = v.gz || 0;
  switch (style) {
    case 'cobra': return { hh: F(v.a, 3), ll: F(v.b, 3), kind: B(v.c, 0.62) ? 0 : 1, br: B(v.d, 0.5), bx: B(v.e, 0.22), w };
    case 'double': return { hh: F(v.a, 2), ll: F(v.b, 2), kind: B(v.c, 0.7) ? 0 : 1, br: B(v.d, 0.5) };
    case 'torch': return { hh: F(v.a, 3), col: B(v.b, 0.5), kind: B(v.c, 0.5) };
    case 'cast': return { hh: F(v.a, 2), col: B(v.b, 0.6), kind: B(v.c, 0.55) ? 0 : 1 };
    case 'ball': return { hh: F(v.a, 2), col: B(v.b, 0.5) };
    case 'twin': return { col: B(v.b, 0.5) };
    case 'park': return { kind: B(v.c, 0.33), hh: F(v.a, 6) };
    case 'wood': case 'woodball': return { hh: F(v.a, 3), stub: B(v.b, 0.55), lean: F(v.f, 3) - 1, col: B(v.g, 0.5), glass: B(v.h, 0.4),
      kind: B(v.c, 0.45) ? 0 : B(v.c, 0.8) ? 1 : 2, bx: B(v.e, 0.18), gz, gout: gz ? 0 : (v.e || 0) > 0.85 ? 1 : 0, w };
    case 'conc': return { hh: F(v.a, 3), three: B(v.c, 0.5) ? 0 : 1, glass: B(v.h, 0.5), low: B(v.d, 0.55), kind: B(v.b, 0.7) ? 0 : 1,
      bx: B(v.e, 0.25), gz, gout: gz ? 0 : (v.e || 0) > 0.85 ? 1 : 0, w };
    case 'mast': return { tall: v.tall ? 1 : 0 };
    default: return {};
  }
}

/* ── провода: трёхгранная лента из WSEG кусков, вершины — по 3 на точку ── */
const WSEG = 8, WR = 0.032, WV = (WSEG + 1) * 3;
let WIRE_C = null, WIRE_I = null;
function wireShared (n) {
  if (!WIRE_C || WIRE_C.length < n * WV * 3) {
    const m = Math.max(n, 16), col = rgb(COL.wire);
    WIRE_C = new Float32Array(m * WV * 3);
    for (let k = 0; k < m * WV; k++) { WIRE_C[k * 3] = col[0]; WIRE_C[k * 3 + 1] = col[1]; WIRE_C[k * 3 + 2] = col[2]; }
    const I = [];
    for (let w = 0; w < m; w++)
      for (let j = 0; j < WSEG; j++)
        for (let q = 0; q < 3; q++) {
          const b0 = w * WV, a = b0 + j * 3 + q, b = b0 + (j + 1) * 3 + q, c = b0 + (j + 1) * 3 + (q + 1) % 3, d = b0 + j * 3 + (q + 1) % 3;
          I.push(a, b, d, b, c, d);
        }
    WIRE_I = new Uint32Array(I);
  }
}
/* точки провода от a до b: провисает на sag посередине; floor — ниже не опускается (свисший лежит на земле) */
function wirePts (a, b, sag, floor = -1e9) {
  const out = [];
  for (let j = 0; j <= WSEG; j++) {
    const t = j / WSEG;
    out.push([a[0] + (b[0] - a[0]) * t, Math.max(floor, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t)), a[2] + (b[2] - a[2]) * t]);
  }
  return out;
}
/* вершины провода — в массив arr с вершины o (тот же обход, что у sweep: наружу) */
function wireWrite (arr, o, pts) {
  for (let j = 0; j <= WSEG; j++) {
    const a = pts[Math.max(0, j - 1)], b = pts[Math.min(WSEG, j + 1)];
    const t = norm(sub(b, a));
    const ref = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], k = dot(ref, t);
    const u = norm([ref[0] - t[0] * k, ref[1] - t[1] * k, ref[2] - t[2] * k]), v = cross(u, t), P = pts[j];
    for (let q = 0; q < 3; q++) {
      const ang = q / 3 * Math.PI * 2, cu = Math.cos(ang) * WR, sn = Math.sin(ang) * WR, i = (o + j * 3 + q) * 3;
      arr[i] = P[0] + u[0] * cu + v[0] * sn; arr[i + 1] = P[1] + u[1] * cu + v[1] * sn; arr[i + 2] = P[2] + u[2] * cu + v[2] * sn;
    }
  }
}

/* ── random: three.js берёт из Math.random uuid каждой геометрии (4 числа), а стройка города — с зерном (EDL.buildStart,
   поздняя сборка — своё зерно на кусок). Фонарь из world.js / pizzeria.js / landmarks.js / правок редактора тянет из
   зерна ровно столько, сколько тянули прежние коробки его вида (OLD_PAR штук × 4), — город вокруг тот же; свои
   геометрии — на своём счётчике ── */
const OLD_PAR = { cobra: 3, ball: 4, twin: 5, wood: 3, woodball: 4, park: 4, yard: 3, mast: 2 };
let LR = 0x2545f491;
const localRnd = () => { LR = (LR + 0x6D2B79F5) | 0; let t = LR; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function quiet (par, fn) {
  const R = Math.random;
  for (let k = 0; k < par * 4; k++) R();
  Math.random = localRnd;
  try { return fn(); } finally { Math.random = R; }
}
const hp = (x, z, s) => { const v = Math.sin(x * 12.9898 + z * 78.233 + s * 37.719) * 43758.5453; return v - Math.floor(v); };

/* поставить фонарь. o: { x, z, style, dx, dz — куда смотрит консоль (к дороге),
   y — низ столба (по умолчанию земля), spot — [x, z] пятна света (по умолчанию
   под плафоном), noSpot — без пятна, v — жребий формы (по умолчанию — по месту), wires — [{ a, b, sag, other }]
   провода от этого столба (мировые точки; other — фонарь на том конце), par — сколько коробок тянули прежде } */
export function lamp (A, o) {
  if (!SCENE) SCENE = A.scene;
  const { x, z, style = 'cobra' } = o;
  const l = Math.hypot(o.dx || 0, o.dz || 0);
  const dx = l ? o.dx / l : 1, dz = l ? o.dz / l : 0;
  const ry = Math.atan2(-dz, dx);                  // +X фонаря → (dx, dz)
  const y = o.y !== undefined ? o.y : A.groundH(x, z) + (A.curbAt ? A.curbAt(x, z) : 0);
  const rec = { x, z, y, ry, dx, dz, style, down: 0, heads: [], pools: [], it: null, lh: [], spot: null, spots: [], LH: A.LAMPH,   // lh — номера плафонов в LAMPH до склейки (unlamp)
    wires: [], spansIn: [], geo: null, poleNv: 0, top: 0, rad: 0, SP: A.LAMP_SPOTS };
  if (OLD) return oldLamp(A, o, rec);
  const par = o.par !== undefined ? o.par : OLD_PAR[style] || 0;
  return quiet(par, () => {
    const v = o.v || { a: vq(hp(x, z, 1)), b: vq(hp(x, z, 2)), c: vq(hp(x, z, 3)), d: vq(hp(x, z, 4)), e: vq(hp(x, z, 5)), f: vq(hp(x, z, 6)), g: vq(hp(x, z, 7)), h: vq(hp(x, z, 8)) };
    const T = tpl(style, v);
    rec.top = T.top; rec.rad = T.rad; rec.T = T;
    const c = Math.cos(ry), s = Math.sin(ry), P = T.p, pos = new Float32Array(P.length);
    for (let i = 0; i < P.length; i += 3) { pos[i] = x + P[i] * c + P[i + 2] * s; pos[i + 1] = y + P[i + 1]; pos[i + 2] = z - P[i] * s + P[i + 2] * c; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(T.c, 3));
    g.setIndex(new THREE.BufferAttribute(T.i, 1));
    const L = [g];
    rec.poleNv = T.n;
    STATS.verts += T.n;
    // провода от этого столба
    const W = WIRES && o.wires ? o.wires.slice(0, 24) : [];
    if (W.length) {
      wireShared(W.length);
      const wp = new Float32Array(W.length * WV * 3);
      W.forEach((w, k) => { wireWrite(wp, k * WV, wirePts(w.a, w.b, w.sag)); rec.wires.push({ k, a: w.a, b: w.b, sag: w.sag, other: w.other || null, dead: 0 }); });
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.BufferAttribute(wp, 3));
      wg.setAttribute('color', new THREE.BufferAttribute(WIRE_C.subarray(0, W.length * WV * 3), 3));
      wg.setIndex(new THREE.BufferAttribute(WIRE_I.subarray(0, W.length * WSEG * 18), 1));
      L.push(wg);
      rec.geo = wg;
      for (const w of rec.wires) if (w.other) w.other.spansIn.push({ own: rec, w });
      STATS.wires += W.length;
      STATS.wireVerts += W.length * WV;
    }
    if (T.g) {
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.BufferAttribute(T.g.p.slice(), 3));
      gg.setIndex(new THREE.BufferAttribute(T.g.i, 1));
      const lit = A.put(A.LAMPH, gg, style === 'cast' || style === 'wood' || style === 'woodball' ? WARM : HEAD, x, y, z, 0, ry, 0);
      rec.lh.push(A.LAMPH.length - 1);
      (lit.userData || (lit.userData = {})).track = (m, v0, nv) => rec.heads.push([m, v0, nv]);
    }
    const it = A.smashAdd('lamp', x, z, LAMP.R, L, style === 'wood' || style === 'woodball' ? WOOD : style === 'conc' ? COL.conc : GREY);
    rec.it = it;
    it.slow = LAMP.SLOW;
    it.onDown = (_, nx, nz, force) => knock(rec, nx, nz, force);
    if (!o.noSpot) {
      const hs = o.spot ? [null] : T.head;
      for (const h of hs) {
        const sp = o.spot ? [o.spot[0], o.spot[1]] : [x + dx * h, z + dz * h];
        sp.track = (m, v0, nv) => rec.pools.push([m, v0, nv]);
        A.LAMP_SPOTS.push(sp);
        rec.spots.push(sp);
      }
      rec.spot = rec.spots[0] || null;
    }
    STATS.kinds[style] = (STATS.kinds[style] || 0) + 1;
    LAMPS.push(rec);
    return rec;
  });
}
/* прежний фонарь из коробок (?oldlamps) */
function oldLamp (A, o, rec) {
  const { x, z } = o, { P, head } = oldParts(rec.style), y = rec.y;
  const L = [];
  for (const p of P) {
    if (p.glow) {
      const g = A.put(A.LAMPH, p.g, p.hex, x, y, z, 0, rec.ry, 0);
      rec.lh.push(A.LAMPH.length - 1);
      g.userData.track = (m, v0, nv) => rec.heads.push([m, v0, nv]);
    } else A.put(L, p.g, p.hex, x, y, z, 0, rec.ry, 0);
  }
  const it = A.smashAdd('lamp', x, z, LAMP.R, L, rec.style === 'wood' || rec.style === 'woodball' ? WOOD : GREY);
  rec.it = it; rec.old = 1;
  it.slow = LAMP.SLOW;
  it.onDown = (_, nx, nz, force) => knock(rec, nx, nz, force);
  if (!o.noSpot) {
    const s = o.spot ? [o.spot[0], o.spot[1]] : [x + rec.dx * head[0], z + rec.dz * head[0]];
    s.track = (m, v0, nv) => rec.pools.push([m, v0, nv]);
    A.LAMP_SPOTS.push(s);
    rec.spot = s; rec.spots.push(s);
  }
  STATS.kinds[rec.style] = (STATS.kinds[rec.style] || 0) + 1;
  LAMPS.push(rec);
  return rec;
}

/* вершины проводов фонаря: массив и первая вершина его проводов (после склейки — в склейке клетки, до — свои) */
function wireArr (rec) {
  const it = rec.it;
  if (it && it.mesh) { const pa = it.mesh.geometry.attributes.position; return pa.array ? { pa, a: pa.array, o: it.v0 + rec.poleNv } : null; }
  if (rec.geo) { const pa = rec.geo.attributes.position; return { pa, a: pa.array, o: 0 }; }
  return null;
}
/* провод w фонаря rec: заново по точкам (или в точку под землёй — dead) */
function wireSet (rec, w, pts) {
  const W = wireArr(rec);
  if (!W) return;
  const o = W.o + w.k * WV;
  if (!pts) { for (let v = o; v < o + WV; v++) { W.a[v * 3] = rec.x; W.a[v * 3 + 1] = rec.y - 1; W.a[v * 3 + 2] = rec.z; } }
  else wireWrite(W.a, o, pts);
  W.pa.needsUpdate = true;
}
/* свисший провод: от точки, что держится, до земли у сбитого столба (лежит на земле последние метры) */
function hang (from, gx, gz, gy) {
  const L = Math.hypot(from[0] - gx, from[2] - gz);
  const tx = gx + (from[0] - gx) * Math.min(0.5, 1.2 / (L || 1)), tz = gz + (from[2] - gz) * Math.min(0.5, 1.2 / (L || 1));
  return wirePts(from, [tx, gy + 0.04, tz], Math.max(0.3, (from[1] - gy) * 0.3), gy + 0.04);   // дугой вниз, последние метры — на земле
}
/* сбит фонарь rec: его провода свисают от дальнего конца, чужие провода к нему — от своего столба; если сбит и тот
   конец — провод пропадает */
function wiresDown (rec) {
  for (const w of rec.wires) {
    if (w.dead) continue;
    if (w.other && w.other.down) { w.dead = 1; wireSet(rec, w, null); continue; }
    wireSet(rec, w, hang(w.b, rec.x, rec.z, rec.y));
  }
  for (const { own, w } of rec.spansIn) {
    if (w.dead) continue;
    if (own.down) { w.dead = 1; wireSet(own, w, null); continue; }
    wireSet(own, w, hang(w.a, rec.x, rec.z, rec.y));
  }
}

/* убрать фонарь до склейки (правки редактора, editlayer.js): из списка фонарей; → { lh — номера его плафонов
   в LAMPH, spot — его пятно в LAMP_SPOTS } — их вынимает вызывающий. Столб (сбиваемое) вынимает он же.
   Чужие провода к нему — в точку (их столбы остаются) */
export function unlamp (it) {
  const i = LAMPS.findIndex(r => r.it === it);
  if (i < 0) return null;
  const rec = LAMPS[i];
  LAMPS.splice(i, 1);
  for (const { own, w } of rec.spansIn) { w.dead = 1; wireSet(own, w, null); }
  for (const w of rec.wires) if (w.other) w.other.spansIn = w.other.spansIn.filter(q => q.w !== w);
  for (let k = 1; k < rec.spots.length; k++) { const j = rec.SP ? rec.SP.indexOf(rec.spots[k]) : -1; if (j >= 0) rec.SP.splice(j, 1); }   // второе пятно двойной консоли
  return { lh: rec.lh, spot: rec.spot, LH: rec.LH };
}

/* редактор города (editlayer.js hideNow): плафон, пятно света и чужие провода к убранному фонарю — под землю и назад
   (столб и его провода прячет сам редактор). on — спрятать */
export function edHide (it, on) {
  const rec = LAMPS.find(r => r.it === it);
  if (!rec) return;
  for (const h of [...rec.heads, ...rec.pools]) {
    const [m, v0, nv] = h, pos = m.geometry.attributes.position, a = pos.array;
    if (!a) continue;
    if (on) { if (!h.orig) h.orig = a.slice(v0 * 3, (v0 + nv) * 3); for (let v = v0; v < v0 + nv; v++) a[v * 3 + 1] = -60; }
    else if (h.orig) { a.set(h.orig, v0 * 3); h.orig = null; }
    pos.needsUpdate = true;
  }
  for (const { own, w } of rec.spansIn) {
    const W = wireArr(own);
    if (!W) continue;
    const o = (W.o + w.k * WV) * 3;
    if (on) { if (!w.orig) w.orig = W.a.slice(o, o + WV * 3); for (let v = 0; v < WV; v++) W.a[o + v * 3 + 1] = -60; }
    else if (w.orig) { W.a.set(w.orig, o); w.orig = null; }
    W.pa.needsUpdate = true;
  }
}

/* вершины куска склейки — под землю (как знаки в roadlife.js). Плафоны в клетках FLATM (game.js, 17.10.2026) позиций в памяти
   не держат (отпущены после загрузки в видеокарту): тогда массив — временный, только до конца этого куска (плафоны лежат в
   начале клетки — он короткий), с прежним byteLength (three.js сверяет), кусок — в одну точку (треугольники пропадают), в
   видеокарту — только диапазоном (addUpdateRange); после заливки массив снова отпускается (onUpload склейки) */
function hide ([m, v0, nv]) {
  const pos = m.geometry.attributes.position;
  let a = pos.array;
  if (a && !a.part && a.length === pos.count * 3) {
    for (let v = v0; v < v0 + nv; v++) a[v * 3 + 1] = -60;
    pos.needsUpdate = true;
    return;
  }
  const len = (v0 + nv) * 3;
  if (!a || a.length < len) {
    const b = new Float32Array(len);
    if (a) b.set(a);
    Object.defineProperty(b, 'byteLength', { value: pos.count * 3 * 4 });
    b.part = 1;                                   // временный: остальное в нём — нули, целиком не заливать
    a = pos.array = b;
  }
  for (let v = v0; v < v0 + nv; v++) { a[v * 3] = 0; a[v * 3 + 1] = -60; a[v * 3 + 2] = 0; }
  pos.addUpdateRange(v0 * 3, nv * 3);
  pos.needsUpdate = true;
}

const MATS = new Map();
const mat = (hex, glow, vc) => {
  const k = hex + (glow ? 'g' : '') + (vc ? 'v' : '');
  if (!MATS.has(k)) MATS.set(k, glow ? new THREE.MeshBasicMaterial({ color: hex }) : new THREE.MeshLambertMaterial({ color: vc ? '#ffffff' : hex, vertexColors: !!vc, flatShading: true }));
  return MATS.get(k);
};
const AX = new THREE.Vector3();

/* снесли: плафон гаснет, пятно пропадает, провода свисают, целый фонарь валится по ходу удара */
function knock (rec, nx, nz) {
  if (rec.down) return;
  rec.down = 1;
  STATS.down++;
  rec.heads.forEach(hide);
  rec.pools.forEach(hide);
  if (rec.it && rec.poleNv && rec.wires.length) rec.it.nv = rec.poleNv;   // свои провода не схлопывать вместе со столбом — свисают (wiresDown)
  wiresDown(rec);
  if (!SCENE) return;
  const pivot = new THREE.Group(), inner = new THREE.Group();
  pivot.position.set(rec.x, rec.y, rec.z);
  inner.rotation.y = rec.ry;
  if (rec.old) for (const p of oldParts(rec.style).P) inner.add(new THREE.Mesh(p.g, p.glow ? mat('#c9c2a8', 1) : mat(p.hex)));   // плафон уже не горит
  else {
    const T = rec.T;
    if (!T.fall) {                                 // общий на вид: столб и погасшее стекло (не освобождаются)
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(T.p, 3));
      g.setAttribute('color', new THREE.BufferAttribute(T.c, 3));
      g.setIndex(new THREE.BufferAttribute(T.i, 1));
      g.computeBoundingSphere();
      let gg = null;
      if (T.g) { gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(T.g.p, 3)); gg.setIndex(new THREE.BufferAttribute(T.g.i, 1)); gg.computeBoundingSphere(); }
      T.fall = [g, gg];
    }
    const m = new THREE.Mesh(T.fall[0], mat('#fff', 0, 1)); m.userData.shared = 1; inner.add(m);
    if (T.fall[1]) { const m2 = new THREE.Mesh(T.fall[1], mat('#c9c2a8', 1)); m2.userData.shared = 1; inner.add(m2); }
  }
  pivot.add(inner);
  SCENE.add(pivot);
  const l = Math.hypot(nx, nz) || 1;
  // ось — поперёк удара: верх уходит туда, куда толкнули
  const ax = new THREE.Vector3(nz / l, 0, -nx / l);
  FALL.push({ pivot, ax, a: 0, w: 0.6, life: LAMP.LIE, y0: rec.y });
  while (FALL.length > LAMP.FALL_CAP) drop(0);
}

function drop (i) {
  const f = FALL[i];
  f.pivot.parent && f.pivot.parent.remove(f.pivot);
  f.pivot.traverse(o => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); });
  FALL.splice(i, 1);
}

const MAX_A = 1.5;                                  // лёг: почти плашмя, плафон в асфальт
export function step (dt) {
  for (let i = FALL.length - 1; i >= 0; i--) {
    const f = FALL[i];
    if (f.a < MAX_A || f.w) {
      f.w += (1.5 + 10 * Math.sin(f.a)) * dt;       // как палка: чем ниже, тем быстрее
      f.a += f.w * dt;
      if (f.a >= MAX_A) { f.a = MAX_A; f.w = f.w > 1.5 ? -f.w * 0.22 : 0; }   // стукнулся — чуть подпрыгнул
      f.pivot.quaternion.setFromAxisAngle(AX.copy(f.ax), f.a);
    }
    f.life -= dt;
    if (f.life < 3) f.pivot.position.y = f.y0 - (3 - f.life) * 0.4;
    if (f.life <= 0) drop(i);
  }
}

/* ── вдоль улиц ── */
const CELL = 60;
function poorCells (CITY) {
  const cells = new Map();
  for (const b of CITY.buildings || []) {
    let cx = 0, cz = 0;
    for (const q of b.p) { cx += q[0] / b.p.length; cz += q[1] / b.p.length; }
    const k = b.k === 'gar' ? 'g' : b.k === 'ind' ? 'i' : b.k === 'priv' || b.st === 'priv' ? 'p' : 'n';
    const key = Math.floor(cx / CELL) + ',' + Math.floor(cz / CELL);
    let c = cells.get(key);
    if (!c) cells.set(key, c = { p: 0, n: 0, g: 0, i: 0 });
    c[k]++;
  }
  // частный сектор — где в клетке и восьми соседних частных домов больше, чем любых
  // других: дома стоят вдоль улиц, и в клетке самой улицы их может не оказаться
  const out = new Set();
  for (const key of cells.keys()) {
    const [i, j] = key.split(',').map(Number);
    for (let a = i - 1; a <= i + 1; a++)
      for (let b = j - 1; b <= j + 1; b++) {
        const k2 = a + ',' + b;
        if (out.has(k2)) continue;
        const t = { p: 0, n: 0, g: 0, i: 0 };
        for (let u = a - 1; u <= a + 1; u++)
          for (let w = b - 1; w <= b + 1; w++) { const c = cells.get(u + ',' + w); if (c) { t.p += c.p; t.n += c.n; t.g += c.g; t.i += c.i; } }
        if (t.p >= 3 && t.p >= t.n && t.p >= t.g && t.p >= t.i) out.add(k2);
      }
  }
  return (x, z) => out.has(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
}
/* частные и маленькие дома сеткой 30 м: к ним с деревянных и бетонных столбов идут провода */
function privHouses (CITY) {
  const G = new Map(), C = 30;
  for (const b of CITY.buildings || []) {
    if (!b.p || b.p.length < 3 || b.k === 'gar' || b.k === 'ind') continue;
    let cx = 0, cz = 0, ar = 0;
    for (let i = 0; i < b.p.length; i++) { const q = b.p[i], w = b.p[(i + 1) % b.p.length]; cx += q[0] / b.p.length; cz += q[1] / b.p.length; ar += q[0] * w[1] - w[0] * q[1]; }
    if (!(b.k === 'priv' || b.st === 'priv' || b.st === 'villa' || (Math.abs(ar) / 2 < 260 && (b.lv || 1) <= 2))) continue;   // свой дом: частный, особняк или маленький
    const k = Math.floor(cx / C) + ',' + Math.floor(cz / C);
    if (!G.has(k)) G.set(k, []);
    G.get(k).push({ b, cx, cz });
  }
  return (x, z, r) => {
    const out = [];
    for (let i = Math.floor((x - r) / C); i <= Math.floor((x + r) / C); i++)
      for (let j = Math.floor((z - r) / C); j <= Math.floor((z + r) / C); j++) for (const h of G.get(i + ',' + j) || []) out.push(h);
    return out;
  };
}
/* ближайшая к (x, z) точка контура */
function nearEdge (p, x, z) {
  let bd = Infinity, bx = 0, bz = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / l2)), qx = a[0] + ex * t, qz = a[1] + ez * t, d = Math.hypot(x - qx, z - qz);
    if (d < bd) { bd = d; bx = qx; bz = qz; }
  }
  return [bx, bz, bd];
}

const hash = i => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
/* точки проводов фонаря rec (из шаблона) — в мир */
const worldWa = (wa, x, y, z, ry) => { const c = Math.cos(ry), s = Math.sin(ry); return wa.map(p => [x + p[0] * c + p[2] * s, y + p[1], z - p[0] * s + p[2] * c]); };

/* A: CITY, roadWidth, nearestRoad, inHouse, introClear, ZEBRAS + то, что нужно lamp().
   Шагами (function*, latebuild.js): на Деке ~0,28 с одним куском — шаг через каждые STEP_W проверенных мест столба
   (по счёту, не по времени: город с ?nolate и без одинаковый). Новых шагов (yield) нет — зерно следующих кусков то же */
const STEP_W = 500;
export function* streets (A) {
  const cells = poorCells(A.CITY), sector = A.MAP && A.MAP.privSector;
  const poor = sector ? (x, z) => sector(x, z) || cells(x, z) : cells;   // район частного сектора из карты + клетки с частными домами
  const zebra = (px, pz) => A.ZEBRAS.some(q => Math.abs(q.x - px) < 6 && Math.abs(q.z - pz) < 6);
  const D = A.MAP && A.MAP.career && A.MAP.career.districts, oldIdx = D && D.list ? D.list.findIndex(d => d.id === 'old') : -1;
  const oldTown = (x, z) => oldIdx >= 0 && D.at(x, z) === oldIdx;
  const squares = (ringCircles ? ringCircles() : []).filter(o => o.R > 6);
  const nearSquare = (x, z) => squares.some(o => Math.hypot(x - o.c[0], z - o.c[1]) < LAMP.SQUARE_R);
  const houses = WIRES ? privHouses(A.CITY) : null;
  const MED = [];                                   // двойные консоли: не чаще MED_GAP
  yield 'poor';
  let work = 0;
  const roads = A.CITY.roads;
  for (let ri = 0; ri < roads.length; ri++) {
    if (work >= STEP_W) { work = 0; yield 'lamps'; }
    const r = roads[ri];
    if (r.b || r.x) continue;                      // на мосту свои перила, фонарям там не место
    const big = r.c <= 3, small = r.c === 4;
    if (!big && !small) continue;
    // Столб — на внешнем краю тротуара, консоль — над дорогой. У разделённого
    // проспекта тротуар одной половины — это асфальт другой, поэтому столб,
    // попавший на чужое полотно или в дом, не ставим.
    const hr = hash(ri), hr2 = hash(ri + 7777);
    const oldStyle = big ? (r.c <= 2 || hr < 0.45 ? 'cobra' : hr < 0.75 ? 'ball' : 'twin') : hr < 0.5 ? 'wood' : 'woodball';
    const hw = A.roadWidth(r) / 2, w = hw + (big ? 2.4 : 1.7);
    const step = big ? LAMP.STEP : LAMP.STEP_PRIV;
    const p = r.p;
    const p0 = p[0], pm = r.mid0 ? r.mid0[1] : p[Math.floor(p.length / 2)];   // r.mid0 — середина до скругления (roadsmooth.js): с ?smooth вид тот же
    // вид улицы: Старый город и площади — чугунные; проспект — консоли; улица потише — по жребию улицы
    const cast = big && (oldTown(pm[0], pm[1]) || nearSquare(pm[0], pm[1]) || nearSquare(p0[0], p0[1])) && hr2 < 0.8;
    const style = OLD ? oldStyle
      : !big ? (hr < 0.5 ? 'wood' : 'conc')
      : cast ? 'cast'
      : r.c <= 2 ? 'cobra'
      : hr2 < 0.3 ? 'cobra' : hr2 < 0.46 ? 'torch' : hr2 < 0.6 ? 'conc' : hr2 < 0.8 ? 'ball' : 'twin';
    const wired = WIRES && (style === 'wood' || style === 'conc' || (style === 'cobra' && (r.c === 3 || hr2 < 0.4)));
    const rv = { a: vq(hash(ri + 11)), b: vq(hash(ri + 12)), c: vq(hash(ri + 13)), d: vq(hash(ri + 14)) };   // форма — общая у улицы
    const chain = { 1: null, '-1': null };
    let acc = big ? 20 : 12, side = big ? 1 : hr < 0.25 || (hr > 0.5 && hr < 0.75) ? 1 : -1;
    for (let i = 1; i < p.length; i++) {
      const x1 = p[i - 1][0], z1 = p[i - 1][1], x2 = p[i][0], z2 = p[i][1];
      const len = Math.hypot(x2 - x1, z2 - z1) || 1;
      const ux = (x2 - x1) / len, uz = (z2 - z1) / len;
      for (let d = 0; d < len; d += 1) {
        acc += 1;
        if (acc < step) continue;
        acc = 0;
        if (big) side = -side;                     // большие — через раз по сторонам, частный сектор — по одной
        const nx = -uz * side, nz = ux * side;     // от осевой к тротуару
        const cx = x1 + ux * d, cz = z1 + uz * d;
        if (small && !poor(cx, cz)) continue;      // улочки 4 класса — только в частном секторе
        work++;
        let px = cx + nx * w, pz = cz + nz * w, st = style;
        // разделительная проспекта: по эту сторону в 2—14 м — встречная половина того же направления → двойная консоль посередине
        if (!OLD && r.o && r.c <= 2 && st === 'cobra') {
          let gap = 0;
          for (let t = hw + 0.5; t <= hw + LAMP.MED_MAX; t += 0.5) {
            const q = A.nearestRoad(cx + nx * t, cz + nz * t, 7, 1);
            if (q && q.d < q.seg.w / 2) {
              const sx = q.seg.x2 - q.seg.x1, sz = q.seg.z2 - q.seg.z1, sl = Math.hypot(sx, sz) || 1;
              if (q.seg.c <= 2 && Math.abs((sx * ux + sz * uz) / sl) > 0.85) gap = t - hw;
              break;
            }
          }
          if (gap >= LAMP.MED_MIN) {
            const mx = cx + nx * (hw + gap / 2), mz = cz + nz * (hw + gap / 2);
            if (MED.some(q => Math.hypot(q[0] - mx, q[1] - mz) < LAMP.MED_GAP)) continue;
            px = mx; pz = mz; st = 'double';
          }
        }
        const near = A.nearestRoad(px, pz, 7, 1);
        if (near && near.d < near.seg.w / 2 + (st === 'double' ? 0.7 : big ? 1.2 : 0.9)) { if (small) STATS.skip.road++; continue; }
        if (A.inHouse(px, pz, 1) || A.introClear(px, pz, 9)) { if (small) STATS.skip.house++; continue; }
        if (A.startClear && A.startClear(px, pz)) { STATS.skip.start = (STATS.skip.start || 0) + 1; continue; }   // выезд со стоянки курьеров свободен (game.js START_CLEAR)
        if (zebra(px, pz)) { if (small) STATS.skip.zebra++; continue; }
        if (ringIsland(px, pz, 1)) { STATS.skip.ring = (STATS.skip.ring || 0) + 1; continue; }   // на острове круга — газон и деревья, без столбов
        if (st === 'double') MED.push([px, pz]);
        // жребий формы: общее у улицы + своё у столба (щиток, растяжка)
        const v = { ...rv, e: vq(hp(px, pz, 5)) };
        if (st === 'wood' || st === 'conc') { v.f = vq(hp(px, pz, 6)); v.g = vq(hp(px, pz, 7)); v.h = rv.d; }
        const w2 = wired && st !== 'double';
        if (w2) v.w = 1;
        const prev = w2 ? chain[side] : null;
        if (!prev && w2 && (st === 'wood' || st === 'conc')) v.gz = -side;   // начало линии — растяжка назад вдоль улицы (Z фонаря)
        // провода: от предыдущего столба этой стороны (не дальше SPAN, не сквозь дом) и к домам
        const wires = [];
        let wa = [];
        if (w2) {
          wa = worldWa(tpl(st, v).wa, px, A.groundH(px, pz), pz, Math.atan2(nz, -nx));
          if (prev && prev.wa.length) {
            const L = Math.hypot(prev.x - px, prev.z - pz), mxs = big ? LAMP.SPAN_BIG : LAMP.SPAN_PRIV;
            let ok = L < mxs && L > 4;
            for (const f of [0.25, 0.5, 0.75]) if (ok && A.inHouse(prev.x + (px - prev.x) * f, prev.z + (pz - prev.z) * f, 0)) ok = false;
            if (ok) {
              const n = Math.min(prev.wa.length, wa.length), sag = 0.2 + L * 0.013;
              for (let k = 0; k < n; k++) wires.push({ a: wa[k], b: prev.wa[k], sag, other: prev.rec });
              STATS.spans++;
            }
          }
          if (houses && (st === 'wood' || st === 'conc') && wa.length) {          // к домам: с ближнего к дому изолятора
            const cand = [];
            for (const h of houses(px, pz, LAMP.DROP_MAX + 12)) {
              const [ex, ez, ed] = nearEdge(h.b.p, px, pz);
              if (ed < LAMP.DROP_MIN || ed > LAMP.DROP_MAX) continue;
              cand.push({ h, ex, ez, ed });
            }
            cand.sort((q1, q2) => q1.ed - q2.ed);
            let nd = 0;
            for (const c of cand) {
              if (nd >= LAMP.DROPS || hp(c.h.cx, c.h.cz, 9) > 0.8) continue;
              const l = c.ed || 1, ax = c.ex + (px - c.ex) / l * 0.15, az = c.ez + (pz - c.ez) / l * 0.15;
              if (A.inHouse(px + (ax - px) * 0.5, pz + (az - pz) * 0.5, 0)) continue;
              let best = wa[0], bd = Infinity;
              for (const q of wa) { const dd = Math.hypot(q[0] - ax, q[2] - az); if (dd < bd) { bd = dd; best = q; } }
              wires.push({ a: best, b: [ax, A.groundH(ax, az) + 2.7, az], sag: 0.15 + c.ed * 0.01, other: null });
              nd++; STATS.drops++;
            }
          }
        }
        const rec = lamp(A, { x: px, z: pz, y: A.groundH(px, pz), style: st, dx: -nx, dz: -nz, v, par: 0, wires });
        if (w2) chain[side] = { x: px, z: pz, wa, rec };
        if (big) {
          STATS.city++;
          if (st === 'ball' || st === 'twin') STATS[st]++;
          if (poor(px, pz)) STATS.poorOld++;     // такие стояли в частном секторе и раньше
        } else STATS.priv++;
      }
    }
  }
  if (!OLD) lotMasts(A);
}

/* прожекторные мачты у больших стоянок: у середины длинного края, на 1,5 м наружу, светят на стоянку */
function lotMasts (A) {
  let n = 0;
  for (const lot of A.CITY.lots || []) {
    if (lot.k !== 'park' || !lot.p || lot.p.length < 3) continue;
    let s = 0, cx = 0, cz = 0;
    for (let i = 0; i < lot.p.length; i++) { const a = lot.p[i], b = lot.p[(i + 1) % lot.p.length]; s += a[0] * b[1] - b[0] * a[1]; cx += a[0] / lot.p.length; cz += a[1] / lot.p.length; }
    if (Math.abs(s / 2) < LAMP.LOT_AREA) continue;
    const E = [];
    for (let i = 0; i < lot.p.length; i++) { const a = lot.p[i], b = lot.p[(i + 1) % lot.p.length]; E.push({ a, b, l: Math.hypot(b[0] - a[0], b[1] - a[1]) }); }
    E.sort((q, w) => w.l - q.l);
    for (const e of E.slice(0, 3)) {
      const mx = (e.a[0] + e.b[0]) / 2, mz = (e.a[1] + e.b[1]) / 2;
      let ox = mx - cx, oz = mz - cz; const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
      const px = mx + ox * 1.5, pz = mz + oz * 1.5;
      const near = A.nearestRoad(px, pz, 7, 1);
      if (near && near.d < near.seg.w / 2 + 1.6) continue;
      if (A.inHouse(px, pz, 1.5) || A.introClear(px, pz, 9) || (A.startClear && A.startClear(px, pz)) || ringIsland(px, pz, 1)) continue;
      lamp(A, { x: px, z: pz, y: A.groundH(px, pz), style: 'mast', dx: cx - px, dz: cz - pz, spot: [px + (cx - px) * 0.4, pz + (cz - pz) * 0.4], v: { tall: 1 }, par: 0 });
      n++;
      break;
    }
  }
  STATS.lotMasts = n;
}

export const DEBUG = { LAMPS, FALL, STATS, LAMP, TPL, OLD, WIRES };
