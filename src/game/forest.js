/* ──────────────────────────────────────────────────────────────────────────
   Ельник в больших лесах (docs/IDEAS.md, блок 6; правила — docs/CAREER.md
   «Город: как выглядит» → «Ельник»).

   Лес — зелёная зона карты (OSM «green») от FOREST.MIN (3 га), как у зверей
   (fauna.js). Земля в таком лесу темнее (FLOOR), на ней — густой ельник:
     • сетка через SPACE (5 м) со сдвигом каждого дерева, одно и то же место —
       одно и то же дерево (зерно по точке);
     • в глубине: ели (70 %) 10—17 м и сосны (30 %) 14—20 м;
     • опушка — полоса EDGE (16 м) у края леса и у дорог сквозь него: деревья
       реже и ниже (у самого края — треть высоты), больше кустов и молодых ёлок;
     • подлесок: кусты и ёлочки 1,5—3,5 м;
     • не растут: в домах и ближе HOUSE (9 м) к ним, на дороге и ближе ROAD
       (3,5 м) к полотну (у пешеходной дорожки — PATH, 1,6 м), в заборах и
       стенах, на аллеях, дворовых тропинках и лавочках, на парковках, в воде,
       на спорт- и детских площадках, у пиццерии-шара.
   Зимой ели в снегу: снег лежит на верхушках ярусов, больше снега — ниже
   опускается (общий сезон, seasons.js snowAmt). Ель и сосна зелёные всегда.

   Твёрдость: деревья выше SOLID_H (6 м) — препятствие для машины, как
   городские деревья (ствол TRUNK = 0,45 м в обе стороны); кусты и молодые
   ёлки — нет. Между стволами в среднем 5 м — машина (ширина ~2 м)
   протискивается медленно, задним ходом выезжает всегда. Дороги и дорожки
   сквозь лес свободны (ROAD/PATH от края полотна).

   Перф: ничего не склеено заранее (лесов ~3000 га — это миллион деревьев).
   Лес режется на клетки CELL (48 м); клетка собирается, только когда камера
   ближе FAR (470 м — дальше туман; туман ближе по настройке графики — и FAR ближе, farOf), не больше BUDGET мс за кадр; дальше
   FAR + 150 м — выбрасывается. Рисуют 5 общих InstancedMesh (ель, ель-даль,
   сосна, сосна-даль, куст): раз в несколько кадров (или когда камера
   сдвинулась/повернулась) в них копируются клетки, что в кадре: ближе NEAR
   (220 м) — подробные деревья (38—50 треугольников), дальше — простые (6—14),
   и чем дальше, тем реже (до THIN на краю тумана). Кусты — ближе BUSH_R.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { snowAmt, leafAmt, yellowAmt } from './seasons.js';
import { WOOD_ON, WOOD } from './treeform.js';      // лес «как в глубинке» (2г7): выше, сосны с голыми стволами, березняк, опушка светлее; ?oldwood — по-старому
import * as FADEJS from './fade.js';
import { SEE_U, SEE_FN } from './seethru.js';    // ёлки между камерой и машиной тают (seethru.js, 0п47)
import { wet } from './streams.js';             // речки и пруды — без ёлок (streams.js)
import * as EDL from './editlayer.js';          // редактор города: убранные ели, сосны и кусты (edits.json, вид forest)

export const FOREST = {
  MIN: 30000, CELL: 48, SPACE: 5, JIT: 0.8,
  EDGE: 16, HOUSE: 9, ROAD: 3.5, PATH: 1.6,
  NEAR: 220, FAR: 470, THIN: 0.4, BUSH_R: 170,
  BAND: 30, BUSH_FADE: 26, LAG: 7,            // растворение подробных елей перед NEAR, рост кустов у BUSH_R, запас на сдвиг камеры, м (fade.js)
  CAP: 16000, BUSH_CAP: 9000,
  SOLID_H: 6, TRUNK: 0.45,
  BUDGET: 2.5, WARM: 160,
  FLOOR: WOOD_ON ? '#6c9055' : '#86ab6a',     // земля леса темнее (2г7)
};
/* 2г7 (25.10.2026, автор: «хвойный лес — тёмная глубина, стволы-колонны, светлая опушка»): высоты, березняк, свет по глубине */
export const WOOD2 = {
  PINE: [19, 9], SPRUCE: [13, 9], BIRCH: [13, 7],   // высота в глубине: от, + до (м); у опушки — ниже (grow)
  PINE_P: [0.42, 0.2],                              // доля сосен: в глубине / ближе к краю
  BIRCH_EDGE: 0.42, BIRCH_PATCH: [0.64, 0.55],      // березы у опушки (доля у самого края); пятна березняка: порог шума и доля в пятне
  PATCH_S: 46,                                      // размер пятен березняка, м
  UNDER: 0.18,                                      // + доля подлеска (кусты, молодые ёлки 2—5,5 м) в глубине
  LIGHT: [1.14, 0.74],                              // яркость дерева у края / в глубине (в глубине — темнее)
};

let A = null;
let FORESTS = null;                     // [{ p, x0, x1, z0, z1, segs }]
let LOTS = null;
const CELLS = new Map();                // клетка → { i, j, cx, cz, gy, sp, pi, bu, sol }
const MESH = {};                         // sp0, sp1, pi0, pi1, bu
const U = { uSnow: { value: 0 }, uLeaf: { value: 1 }, uYellow: { value: 0 } };
const ST = { built: 0, dropped: 0, ms: 0, msMax: 0, trees: 0, sp: 0, pi: 0, bu: 0, bi: 0, sol: 0, shown: {}, refresh: 0 };
const AREA = new WeakMap();
let LAST = { x: 1e9, z: 1e9, yaw: 0, n: 0, dirty: true, frame: 0, sweep: 0 };

/* ── какая зелёная зона — лес ── */
function area (p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; }
  return Math.abs(a / 2);
}
export function isForest (g) {
  if (!g || g.k !== 'green') return false;
  let a = AREA.get(g);
  if (a === undefined) { a = area(g.p); AREA.set(g, a); }
  return a >= FOREST.MIN;
}
function forests () {
  if (FORESTS) return FORESTS;
  FORESTS = [];
  for (const g of A.CITY.green || []) {
    if (!isForest(g)) continue;
    const p = g.p;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    FORESTS.push({ p, x0, x1, z0, z1 });
  }
  LOTS = [];
  const take = p => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    LOTS.push({ p, x0, x1, z0, z1 });
  };
  for (const l of A.CITY.lots || []) take(l.p);
  for (const g of A.CITY.green || []) if (g.k === 'water' || g.k === 'pitch' || g.k === 'play') take(g.p);
  return FORESTS;
}

/* ── модели: единичной высоты, цвет вершин и «снежность» (1 — верх яруса) ── */
function part (geo, hex, snow) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count, col = new THREE.Color(hex);
  const c = new Float32Array(n * 3), s = new Float32Array(n);
  const pos = g.attributes.position;
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; s[i] = snow(pos.getY(i)); }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setAttribute('aSnow', new THREE.BufferAttribute(s, 1));
  return g;
}
function merge (parts) {
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), C = new Float32Array(n * 3), S = new Float32Array(n);
  let o = 0;
  for (const g of parts) {
    const k = g.attributes.position.count;
    P.set(g.attributes.position.array, o * 3); C.set(g.attributes.color.array, o * 3); S.set(g.attributes.aSnow.array, o);
    o += k;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  g.setAttribute('aSnow', new THREE.BufferAttribute(S, 1));
  if (!WOOD_ON) { g.computeVertexNormals(); return g; }
  // 2г6: у листвы и хвои — свои плавные нормали (part2 fol), у стволов — грани (как было)
  const N = new Float32Array(n * 3), F = new Float32Array(n);
  o = 0;
  for (const q of parts) {
    const k = q.attributes.position.count;
    if (!q.attributes.normal || !q.attributes.aFol) { q.deleteAttribute('normal'); q.computeVertexNormals(); }
    N.set(q.attributes.normal.array, o * 3);
    if (q.attributes.aFol) F.set(q.attributes.aFol.array, o);
    o += k;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('aFol', new THREE.BufferAttribute(F, 1));
  return g;
}
const cone = (r, h, seg, y0, rot) => new THREE.ConeGeometry(r, h, seg, 1, true).rotateY(rot || 0).translate(0, y0 + h / 2, 0);
const tier = (y0, h) => y => 0.12 + 0.88 * Math.max(0, Math.min(1, (y - y0) / h));
function spruceGeo () {
  const P = [part(new THREE.CylinderGeometry(0.018, 0.03, 0.2, 5, 1, true).translate(0, 0.1, 0), '#5a4030', () => 0)];
  const T = [[0.12, 0.34, 0.22, '#2a5f35'], [0.32, 0.32, 0.175, '#2f6a3a'], [0.52, 0.3, 0.13, '#357341'], [0.72, 0.28, 0.085, '#3a7a45']];
  T.forEach(([y0, h, r, hex], i) => P.push(part(cone(r, h, 7, y0, i * 0.45), hex, tier(y0, h))));
  return merge(P);
}
function spruceFar () { return merge([part(cone(0.2, 0.92, 6, 0.08), '#2f6a3a', tier(0.08, 0.92))]); }
function pineGeo () {
  const P = [part(new THREE.CylinderGeometry(0.016, 0.026, 0.8, 5, 1, true).translate(0, 0.4, 0), '#a0603a', () => 0)];
  const cr = (sx, sy, x, y, z, hex) => part(new THREE.IcosahedronGeometry(1, 0).scale(sx, sy, sx).translate(x, y, z), hex, yy => (yy > y ? 0.3 + 0.7 * (yy - y) / sy : 0.05));
  P.push(cr(0.15, 0.08, 0, 0.86, 0, '#3f7a3f'), cr(0.11, 0.065, 0.07, 0.76, 0.04, '#467f44'));
  return merge(P);
}
function pineFar () {
  return merge([
    part(new THREE.CylinderGeometry(0.02, 0.026, 0.8, 3, 1, true).translate(0, 0.4, 0), '#a0603a', () => 0),
    part(new THREE.OctahedronGeometry(1, 0).scale(0.16, 0.09, 0.16).translate(0, 0.85, 0), '#3f7a3f', y => (y > 0.85 ? 1 : 0.1)),
  ]);
}
function bushGeo () {
  // низ куста — тёмный и зимой в сугробе (было: яркое лаймовое кольцо по земле под снежной шапкой)
  if (WOOD_ON) return merge([part2(new THREE.IcosahedronGeometry(1, 0).scale(1, 0.62, 1).translate(0, 0.38, 0), y => (y > 0.45 ? '#3f7434' : '#22401e'),
    y => (y > 0.5 ? 0.4 + (y - 0.5) * 2 : y < 0.2 ? 0.9 : 0.1), { c: [0, 0.2, 0], w: 0.5 })]);
  return merge([part(new THREE.IcosahedronGeometry(1, 0).scale(1, 0.62, 1).translate(0, 0.38, 0), '#4f8a40', y => (y > 0.5 ? 0.4 + (y - 0.5) * 2 : 0.05))]);
}

/* ── модели 2г7: ель ярусами «полка + бахрома», сосна — голый рыжий ствол и лапы зонтиком, берёза ──
   цвет вершины — функцией высоты; aSnow: 1 — верх (зимой белый), −1 — листва берёзы (облетает, желтеет) */
function part2 (geo, colFn, snow, fol) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count, pos = g.attributes.position, col = new THREE.Color();
  const c = new Float32Array(n * 3), s = new Float32Array(n);
  for (let i = 0; i < n; i++) { col.set(colFn(pos.getY(i), Math.floor(i / 3), pos.getX(i), pos.getZ(i))); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; s[i] = snow(pos.getY(i), Math.floor(i / 3)); }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setAttribute('aSnow', new THREE.BufferAttribute(s, 1));
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.normal) g.deleteAttribute('normal');
  // мягкая хвоя и листва (второй круг 2г6): нормаль — от середины лапы / яруса (lc) и от центра кроны (c, доля w), признак aFol
  if (fol) {
    let lc = fol.lc;
    if (!lc) { lc = [0, 0, 0]; for (let i = 0; i < n; i++) { lc[0] += pos.getX(i) / n; lc[1] += pos.getY(i) / n; lc[2] += pos.getZ(i) / n; } }
    const N = new Float32Array(n * 3), w = fol.w;
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      let ax = x - lc[0], ay = y - lc[1], az = z - lc[2], l = Math.hypot(ax, ay, az) || 1;
      let bx = x - fol.c[0], by = y - fol.c[1], bz = z - fol.c[2], m = Math.hypot(bx, by, bz) || 1;
      ax = ax / l * (1 - w) + bx / m * w; ay = ay / l * (1 - w) + by / m * w; az = az / l * (1 - w) + bz / m * w;
      l = Math.hypot(ax, ay, az) || 1; N[i * 3] = ax / l; N[i * 3 + 1] = ay / l; N[i * 3 + 2] = az / l;
    }
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('aFol', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
  }
  return g;
}
/* ярус ели: полка (пологая, на ней снег) и бахрома (крутая, рваная, зелёная и зимой); радиус r, высота h, низ — y0 */
function skirtGeo (r, h, y0, rot, n = 6) {
  const P = [], top = [0, 1, 0], mid = [], bot = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + rot, b = a + Math.PI / n, rr = i % 2 ? 0.84 : 0.97;
    mid.push([Math.cos(a) * 0.8, 0.5, Math.sin(a) * 0.8]); bot.push([Math.cos(b) * rr, i % 2 ? 0.12 : 0, Math.sin(b) * rr]);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    P.push(...top, ...mid[j], ...mid[i], ...mid[i], ...mid[j], ...bot[i], ...mid[j], ...bot[j], ...bot[i]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
  return g.scale(r, h, r).translate(0, y0, 0);
}
const lerpHex = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t))).getHexString();
function spruceGeo2 () {
  const P = [part2(new THREE.CylinderGeometry(0.014, 0.026, 0.2, 5, 1, true).translate(0, 0.1, 0), () => '#4a3628', () => 0)];
  const T = [[0.06, 0.3, 0.24], [0.27, 0.27, 0.19], [0.47, 0.25, 0.14], [0.66, 0.22, 0.095], [0.82, 0.18, 0.05]];
  T.forEach(([y0, h, r], i) => {
    const hex = lerpHex('#0e2418', '#2e5a38', 0.15 + i * 0.18);
    // снег: полка (верх яруса, выше 0,42 его высоты) — 1, бахрома — 0,12
    P.push(part2(skirtGeo(r, h, y0, i * 0.7), y => (y > y0 + h * 0.45 ? hex : lerpHex(hex, '#08180e', 0.35)), y => (y > y0 + h * 0.45 ? 0.5 + 0.5 * (y - y0) / h : 0.12),
      { lc: [0, y0, 0], c: [0, 0.45, 0], w: 0.25 }));
  });
  return merge(P);
}
function spruceFar2 () {
  return merge([part(cone(0.22, 0.55, 6, 0.06), '#16321f', tier(0.06, 0.55)), part(cone(0.14, 0.45, 6, 0.5, 0.5), '#24482c', tier(0.5, 0.45))]);
}
function pineGeo2 () {
  // ствол — голый до 0,62 высоты, комель тёмный, выше рыжий; лапы — плоские комки ярусами, со смещением в стороны
  const P = [part2(new THREE.CylinderGeometry(0.011, 0.022, 0.96, 5, 1, true).translate(0, 0.48, 0), y => lerpHex('#5e3a2a', '#c87a44', y * 1.4), () => 0)];
  for (const [y, a] of [[0.34, 0.6], [0.46, 3.4]]) P.push(part2(new THREE.CylinderGeometry(0.003, 0.005, 0.07, 3, 1, true).rotateZ(1.25).rotateY(a).translate(Math.cos(a) * 0.03, y, -Math.sin(a) * 0.03), () => '#4e3a2c', () => 0));
  // лапы: разного размера, вразнобой по сторонам, верхняя — крупная (крона «зонтиком», не стопка тарелок)
  const pads = [[0.68, 0.0, 0.09, 0.08, 0.62, 0.25], [0.76, 2.3, 0.08, 0.1, 0.55, -0.2], [0.83, 4.4, 0.06, 0.105, 0.6, 0.15], [0.9, 1.2, 0.045, 0.09, 0.65, -0.1], [0.96, 3.4, 0.015, 0.06, 0.85, 0]];
  pads.forEach(([y, a, d, R, fl, tilt], i) => {
    const x = Math.cos(a) * d, z = Math.sin(a) * d, hex = lerpHex('#11281a', '#46703a', 0.2 + i * 0.16 + 0.15 * Math.sin(a));
    P.push(part2(new THREE.IcosahedronGeometry(1, 0).scale(R, R * fl, R * 0.8).rotateZ(tilt).rotateY(a).translate(x, y, z), yy => (yy > y ? hex : lerpHex(hex, '#08160c', 0.4)),
      yy => (yy > y ? 0.4 + 0.6 * (yy - y) / (R * fl) : 0.05), { c: [0, 0.82, 0], w: 0.35 }));
  });
  return merge(P);
}
function pineFar2 () {
  return merge([
    part(new THREE.CylinderGeometry(0.014, 0.022, 0.9, 3, 1, true).translate(0, 0.45, 0), '#a8603a', () => 0),
    part(new THREE.OctahedronGeometry(1, 0).scale(0.13, 0.06, 0.13).translate(0.03, 0.78, 0), '#1c3a24', y => (y > 0.78 ? 1 : 0.1)),
    part(new THREE.OctahedronGeometry(1, 0).scale(0.09, 0.05, 0.09).translate(-0.02, 0.9, 0.02), '#2c5030', y => (y > 0.9 ? 1 : 0.1)),
  ]);
}
function birchGeo () {
  // белый ствол с чёрными чёрточками (грани через жребий), два тонких сука, крона — светлые комки (aSnow −1: листва)
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const marks = new Map();
  const P = [part2(new THREE.CylinderGeometry(0.009, 0.016, 0.9, 5, 5, true).translate(0, 0.45, 0),
    (y, f) => { if (!marks.has(f >> 1)) marks.set(f >> 1, rnd() < 0.24); return y < 0.03 ? '#3a3632' : marks.get(f >> 1) ? '#2a2a2e' : '#e8e4da'; }, () => 0)];
  for (const [y, a] of [[0.5, 0.4], [0.58, 2.6], [0.66, 4.6]]) P.push(part2(new THREE.CylinderGeometry(0.003, 0.005, 0.16, 3, 1, true).translate(0, 0.08, 0).rotateZ(0.7).rotateY(a).translate(0, y, 0), () => '#d8d2c6', yy => (yy > y + 0.05 ? 1 : 0)));
  const L = [[0, 0.8, 0, 0.11, 1.5], [0.07, 0.68, 0.03, 0.08, 1.6], [-0.06, 0.7, -0.04, 0.08, 1.7], [0.02, 0.6, -0.07, 0.07, 1.9], [-0.03, 0.92, 0.02, 0.07, 1.4]];
  L.forEach(([x, y, z, R, sy], i) => {
    const hex = lerpHex('#2e5a2a', '#a8c456', 0.25 + 0.6 * (y - 0.6) / 0.32 + 0.2 * z / 0.07);
    P.push(part2(new THREE.IcosahedronGeometry(1, 0).scale(R, R * sy, R).translate(x, y, z), yy => (yy > y ? hex : lerpHex(hex, '#1a3a1c', 0.35)), () => -1, { c: [0, 0.76, 0], w: 0.55 }));
  });
  return merge(P);
}
function birchFar () {
  return merge([
    part(new THREE.CylinderGeometry(0.012, 0.016, 0.8, 3, 1, true).translate(0, 0.4, 0), '#e0dcd2', () => 0),
    part2(new THREE.OctahedronGeometry(1, 0).scale(0.12, 0.2, 0.12).translate(0, 0.76, 0), y => (y > 0.76 ? '#94b450' : '#3e6a30'), () => -1),
  ]);
}

/* kind: 'near' — подробные ели и сосны, 'far' — простые, 'bush' — кусты.
   Смена подробной модели на простую — растворением в полосе BAND м перед NEAR (fade.js):
   подробная тает точка за точкой, простая на её месте проявляется (узор у них взаимно
   дополняющий — ни дыр, ни двойных). Кусты у края BUSH_R растут из земли */
const FADE_LOD = { value: null }, FADE_BUSH = { value: null };
function material (kind) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: !WOOD_ON || kind === 'far' });   // 2г6: ближняя хвоя и листва — плавные нормали
  m.defines = { MAT_LEAF: '' };                   // 2г11: листва и хвоя на просвет (materials.js; тёмная хвоя — почти нет)
  const bush = kind === 'bush';
  m.onBeforeCompile = sh => {
    sh.uniforms.uSnow = U.uSnow; sh.uniforms.uLeaf = U.uLeaf; sh.uniforms.uYellow = U.uYellow;
    sh.uniforms.uFade = bush ? FADE_BUSH : FADE_LOD;
    if (kind !== 'far') sh.uniforms.uSeeP = SEE_U;
    sh.vertexShader = (WOOD_ON ? 'attribute float aFol;\nvarying float vFol;\n' : '') + 'attribute float aSnow;\nvarying float vSnow;\nvarying vec3 vFW;\nvarying float vFadeK;\nvarying float vLeafH;\nuniform vec2 uFade;\nuniform float uLeaf;\n' + FADEJS.FADE_FN + '\n' +
      sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>' + FADEJS.BASE_DIST + (bush ? FADEJS.GROW_BEGIN : '') + '\n  vFadeK = fadeK(fadeD, uFade);' +
        // листва берёзы (aSnow −1): облетает по зерну дерева (место экземпляра) — как кроны города (seasons.js uLeaf)
        '\n  vLeafH = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);\n  if (aSnow < -0.5 && vLeafH >= uLeaf) transformed = vec3(0.0, -3000.0, 0.0);' +
        (WOOD_ON ? '\n  vFol = aFol;' : ''))
        .replace('#include <project_vertex>', `#include <project_vertex>
      vSnow = aSnow;
      vFW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;`);
    const cut = kind === 'near' ? 'if (vFadeK <= bayer4(gl_FragCoord.xy)) discard;' : kind === 'far' ? 'if (vFadeK > bayer4(gl_FragCoord.xy)) discard;' : '';
    sh.fragmentShader = (WOOD_ON ? 'varying float vFol;\n' : '') + 'uniform float uSnow, uYellow;\nvarying float vSnow;\nvarying vec3 vFW;\nvarying float vFadeK;\nvarying float vLeafH;\n' + FADEJS.BAYER_FN + '\n' + (kind !== 'far' ? SEE_FN + '\n' : '') +
      sh.fragmentShader.replace('void main() {', 'void main() {\n  ' + cut + (kind !== 'far' ? '\n  seeCut(vFW);' : '')).replace('#include <color_fragment>', `#include <color_fragment>
      float fn = fract(sin(dot(floor(vFW.xz * 1.7 + vFW.y * 0.9), vec2(12.9898, 78.233))) * 43758.5453);
      float cov = smoothstep(${WOOD_ON ? '0.92 - uSnow * 0.74, 1.02 - uSnow * 0.74' : '0.98 - uSnow * 0.62, 1.1 - uSnow * 0.62'}, vSnow + (fn - 0.5) * 0.22) * step(0.02, uSnow);
      if (vSnow < -0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.58, 0.06) * (0.85 + 0.3 * fract(vLeafH * 13.7)), clamp(uYellow * 1.7 - vLeafH * 0.7, 0.0, 1.0));   // берёза осенью — золотая
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 0.98), cov * 0.95);`);
  };
  if (WOOD_ON && kind !== 'far') {
    // рваный край ближней хвои и листвы (как у крон города, seasons.js pileMat): у края силуэта — гроздьями, между ними просвет
    const prev = m.onBeforeCompile, E = WOOD.EDGE;
    m.onBeforeCompile = (sh, r) => {
      prev(sh, r);
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if (vFol > 0.5) {
        float fFr = 1.0 - abs(dot(normal, normalize(vViewPosition)));
        float fD = length(vFW - cameraPosition);
        vec3 fQ = fract(floor(vFW * 2.6) * 0.1031); fQ += dot(fQ, fQ.yzx + 33.33);
        vec3 fQ2 = fract(floor(vFW * 5.2 + 0.5) * 0.1031); fQ2 += dot(fQ2, fQ2.yzx + 33.33);
        float fH = fract((fQ.x + fQ.y) * fQ.z) * 0.65 + fract((fQ2.x + fQ2.y) * fQ2.z) * 0.35;
        if (fH < smoothstep(${E[0].toFixed(2)}, ${E[1].toFixed(2)}, fFr) * ${E[2].toFixed(2)} * (1.0 - smoothstep(${E[3]}.0, ${E[4]}.0, fD))) discard;
      }`);
    };
  }
  m.customProgramCacheKey = () => 'forestSnow' + kind + (WOOD_ON ? 'w' : '');
  return m;
}

function makeMeshes () {
  FADE_LOD.value = FADEJS.uniform(THREE, 1e4, 1e4 + 1).value;
  FADE_BUSH.value = FADEJS.uniform(THREE, 1e4, 1e4 + 1).value;
  const mats = { near: material('near'), far: material('far'), bush: material('bush') };
  const mk = (geo, cap, kind) => {
    const m = new THREE.InstancedMesh(geo, mats[kind], cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.count = 0; m.frustumCulled = false;
    A.scene.add(m);
    return m;
  };
  MESH.sp0 = mk(WOOD_ON ? spruceGeo2() : spruceGeo(), FOREST.CAP, 'near'); MESH.sp1 = mk(WOOD_ON ? spruceFar2() : spruceFar(), FOREST.CAP, 'far');
  MESH.pi0 = mk(WOOD_ON ? pineGeo2() : pineGeo(), FOREST.CAP >> 1, 'near'); MESH.pi1 = mk(WOOD_ON ? pineFar2() : pineFar(), FOREST.CAP >> 1, 'far');
  if (WOOD_ON) { MESH.bi0 = mk(birchGeo(), FOREST.CAP >> 2, 'near'); MESH.bi1 = mk(birchFar(), FOREST.CAP >> 2, 'far'); }   // березняк (2г7)
  MESH.bu = mk(bushGeo(), FOREST.BUSH_CAP, 'bush');
}

/* ── зерно по точке ── */
function hsh (x, z, k) {
  let h = Math.imul(Math.round(x * 8) ^ 0x27d4eb2d, 0x9E3779B1) ^ Math.imul(Math.round(z * 8) + k * 1013904223, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/* гладкий шум 0…1 с шагом sc м — пятна березняка (как в lawnprops.js) */
function vnoise (x, z, sc, k) {
  const fx = x / sc, fz = z / sc, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const a = hsh(i, j, k), b = hsh(i + 1, j, k), c = hsh(i, j + 1, k), d = hsh(i + 1, j + 1, k);
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}
function rng (x, z) {
  let a = (hsh(x, z, 3) * 4294967296) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let q = a; q = Math.imul(q ^ (q >>> 15), q | 1); q ^= q + Math.imul(q ^ (q >>> 7), q | 61); return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
}
const key = (i, j) => (i + 4096) * 8192 + j + 4096;
const inP = (x, z, p) => {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
};

/* ── клетка: какие деревья где ── */
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P3 = new THREE.Vector3(), S3 = new THREE.Vector3();
function buildCell (i, j) {
  const t0 = performance.now(), F = FOREST, C = F.CELL;
  const x0 = i * C, z0 = j * C, x1 = x0 + C, z1 = z0 + C;
  const cell = { i, j, cx: x0 + C / 2, cz: z0 + C / 2, gy: 0, sp: null, pi: null, bu: null, sol: [] };
  CELLS.set(key(i, j), cell);
  const polys = forests().filter(f => f.x1 > x0 && f.x0 < x1 && f.z1 > z0 && f.z0 < z1);
  if (!polys.length) { cell.empty = true; return cell; }
  // края лесов рядом с клеткой: для «опушки»
  const segs = [];
  for (const f of polys) {
    const p = f.p;
    for (let k = 0; k < p.length; k++) {
      const a = p[k], b = p[(k + 1) % p.length];
      if (Math.max(a[0], b[0]) < x0 - F.EDGE || Math.min(a[0], b[0]) > x1 + F.EDGE || Math.max(a[1], b[1]) < z0 - F.EDGE || Math.min(a[1], b[1]) > z1 + F.EDGE) continue;
      segs.push(a[0], a[1], b[0], b[1]);
    }
  }
  const lots = LOTS.filter(l => l.x1 > x0 && l.x0 < x1 && l.z1 > z0 && l.z0 < z1);
  const sp = [], pi = [], bu = [], bi = [];
  // в клетку — если автор не убрал (редактор: ещё и список «что стоит» — для выбора и «убрать в круге»)
  const keepT = (list, sub, t) => {
    if (EDL.gone('forest', t[0], t[2])) return false;
    list.push(t);
    if (EDL.ED.on) (cell.ed || (cell.ed = [])).push({ sub, x: t[0], z: t[2], h: t[5] });
    return true;
  };
  const edgeD = (x, z) => {
    let e = F.EDGE;
    for (let k = 0; k < segs.length; k += 4) {
      const ax = segs[k], az = segs[k + 1], dx = segs[k + 2] - ax, dz = segs[k + 3] - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < e) e = d;
    }
    return e;
  };
  const okAt = (x, z, r) => {
    const y = A.groundH(x, z);
    if (y < 0.3 || !A.inBounds(x, z, -200) || wet(x, z, r)) return -1;
    if (A.inHouse(x, z, 4) || A.inHouse(x, z, F.HOUSE)) return -1;
    const nr = A.nearestRoad(x, z, 9, 1);
    let dR = 99;
    if (nr) { dR = nr.d - nr.seg.w / 2 - (nr.seg.c > 5 ? F.PATH : F.ROAD); if (dR < 0) return -1; }
    if (A.solidAt(x, z, r) || A.onAlley(x, z, 1) || A.yardBlocks(x, z, 1.2) || A.pzBlocks(x, z, 1)) return -1;
    for (const l of lots) if (x > l.x0 && x < l.x1 && z > l.z0 && z < l.z1 && inP(x, z, l.p)) return -1;
    return dR;
  };
  let gs = 0, gn = 0;
  const S = F.SPACE;
  for (let gx = x0 + S / 2; gx < x1; gx += S)
    for (let gz = z0 + S / 2; gz < z1; gz += S) {
      const r = rng(gx, gz);
      const x = gx + (r() - 0.5) * S * F.JIT, z = gz + (r() - 0.5) * S * F.JIT;
      let f = null;
      for (const q of polys) if (x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1 && inP(x, z, q.p)) { f = q; break; }
      if (!f || (f.hole && f.hole(x, z, 1.2))) continue;              // проплешины и тропы своего леса (addArea)
      const dR = okAt(x, z, 1.2);
      if (dR < 0) continue;
      const k = Math.min(1, Math.min(edgeD(x, z), dR) / F.EDGE);   // 0 — край, 1 — глубина
      const y = A.groundH(x, z);
      gs += y; gn++;
      const rank = r();
      // опушка: реже, ниже, больше кустов и молодых ёлок
      // убранное в редакторе (EDL.gone, вид forest) — жребий тянем тот же, а в клетку не кладём: соседи те же
      if (r() < 0.38 * (1 - k)) { if (r() < 0.6) keepT(bu, 'bush', [x, y, z, r() * 6.3, 0.9 + r() * 1.1, 0.6 + r() * 0.7, 0.8 + r() * 0.4, rank]); continue; }
      const grow = 0.34 + 0.66 * k, W2 = WOOD2;
      if (WOOD_ON) {
        // 2г7: сосны выше домов, ели ярусами, у опушки и пятнами — березняк; в глубине темнее, у края светлее
        const lit = W2.LIGHT[0] + (W2.LIGHT[1] - W2.LIGHT[0]) * k, patch = vnoise(x, z, W2.PATCH_S, 23) > W2.BIRCH_PATCH[0];
        const pB = Math.min(0.85, W2.BIRCH_EDGE * (1 - k) + (patch ? W2.BIRCH_PATCH[1] : 0)), pick = hsh(x, z, 21);
        if (pick < pB) {
          const H = (W2.BIRCH[0] + r() * W2.BIRCH[1]) * (0.5 + 0.5 * k);
          if (keepT(bi, 'birch', [x, y, z, r() * 6.3, H, H, (0.9 + r() * 0.25) * Math.min(1.1, lit + 0.12), rank]) && H > F.SOLID_H) cell.sol.push(x, z);
        } else if (r() < (k > 0.7 ? W2.PINE_P[0] : W2.PINE_P[1])) {
          const H = (W2.PINE[0] + r() * W2.PINE[1]) * grow;
          if (keepT(pi, 'pine', [x, y, z, r() * 6.3, H, H, (0.85 + r() * 0.3) * lit, rank]) && H > F.SOLID_H) cell.sol.push(x, z);
        } else {
          const H = (W2.SPRUCE[0] + r() * W2.SPRUCE[1]) * grow, w = H * (0.8 + r() * 0.3);
          if (keepT(sp, 'spruce', [x, y, z, r() * 6.3, w, H, (0.82 + r() * 0.36) * lit, rank]) && H > F.SOLID_H) cell.sol.push(x, z);
        }
      } else if (r() < (k > 0.7 ? 0.3 : 0.12)) {
        const H = (14 + r() * 6) * grow;
        if (keepT(pi, 'pine', [x, y, z, r() * 6.3, H, H, 0.85 + r() * 0.3, rank]) && H > F.SOLID_H) cell.sol.push(x, z);
      } else {
        const H = (10 + r() * 7) * grow, w = H * (0.85 + r() * 0.35);
        if (keepT(sp, 'spruce', [x, y, z, r() * 6.3, w, H, 0.82 + r() * 0.36, rank]) && H > F.SOLID_H) cell.sol.push(x, z);
      }
      // подлесок: куст или молодая ёлка рядом
      if (r() < 0.12 + 0.5 * (1 - k) + (WOOD_ON ? WOOD2.UNDER * k : 0)) {   // 2г7: в глубине подлесок гуще — темнее между стволами
        const a = r() * 6.3, d = 1.6 + r() * 1.2, bx = x + Math.cos(a) * d, bz = z + Math.sin(a) * d;
        if (okAt(bx, bz, 0.6) >= 0 && !(f.hole && f.hole(bx, bz, 0.8))) {
          const by = A.groundH(bx, bz);
          if (r() < 0.55) keepT(bu, 'bush', [bx, by, bz, r() * 6.3, 0.8 + r() * 1.0, 0.5 + r() * 0.7, (0.75 + r() * 0.45) * (WOOD_ON ? WOOD2.LIGHT[0] + (WOOD2.LIGHT[1] - WOOD2.LIGHT[0]) * k : 1), r()]);
          else { const H = WOOD_ON ? 2 + r() * 3.5 : 1.5 + r() * 2; keepT(sp, 'spruce', [bx, by, bz, r() * 6.3, H, H, (0.95 + r() * 0.3) * (WOOD_ON ? WOOD2.LIGHT[0] + (WOOD2.LIGHT[1] - 0.12 - WOOD2.LIGHT[0]) * k : 1), r()]); }
        }
      }
    }
  cell.gy = gn ? gs / gn : 0;
  const pack = list => {
    if (!list.length) return null;
    list.sort((a, b) => a[7] - b[7]);
    const m = new Float32Array(list.length * 16), c = new Float32Array(list.length * 3);
    list.forEach((t, n) => {
      M4.compose(P3.set(t[0], t[1] - 0.15, t[2]), Q.setFromEuler(E.set(0, t[3], 0)), S3.set(t[4], t[5], t[4]));
      M4.toArray(m, n * 16);
      c[n * 3] = t[6] * 0.97; c[n * 3 + 1] = t[6]; c[n * 3 + 2] = t[6] * 0.95;
    });
    return { m, c, n: list.length };
  };
  cell.sp = pack(sp); cell.pi = pack(pi); cell.bu = pack(bu); cell.bi = pack(bi);
  ST.sp += sp.length; ST.pi += pi.length; ST.bu += bu.length; ST.bi += bi.length; ST.trees += sp.length + pi.length + bi.length; ST.sol += cell.sol.length / 2;
  ST.built++;
  const dt = performance.now() - t0;
  ST.ms += dt; ST.msMax = Math.max(ST.msMax, dt);
  return cell;
}
function dropCell (k, c) {
  if (!c.empty) {
    ST.sp -= c.sp ? c.sp.n : 0; ST.pi -= c.pi ? c.pi.n : 0; ST.bu -= c.bu ? c.bu.n : 0; ST.bi -= c.bi ? c.bi.n : 0;
    ST.trees -= (c.sp ? c.sp.n : 0) + (c.pi ? c.pi.n : 0) + (c.bi ? c.bi.n : 0); ST.sol -= c.sol.length / 2;
  }
  CELLS.delete(k); ST.dropped++; ENS.gone++;
}

/* ── есть ли вообще лес рядом с клеткой (по рамкам лесов) ── */
function hasForest (i, j) {
  const C = FOREST.CELL, x0 = i * C, z0 = j * C;
  for (const f of FORESTS) if (f.x1 > x0 && f.x0 < x0 + C && f.z1 > z0 && f.z0 < z0 + C) return true;
  return false;
}

/* собрать недостающие клетки ближе R, пока не кончится бюджет (мс).
   Перебор клеток — только когда что-то могло измениться (11.10.2026): после полного прохода, где всё
   уже собрано, запоминаем, где стояли (ENS), и «зазор» — насколько ближайшая несобранная клетка рамки
   дальше радиуса. Пока та же клетка, тот же радиус, ничего не выбросили и отъехали меньше зазора —
   новых клеток в радиусе быть не может, проход не нужен (раньше — 441 клетка каждый кадр). */
const ENS = { ci: NaN, cj: NaN, R: -1, x: 0, z: 0, gap: 0, gone: 0, at: -1, skip: 0, scan: 0 };
function ensure (x, z, R, budget) {
  const C = FOREST.CELL, ci = Math.floor(x / C), cj = Math.floor(z / C), n = Math.ceil(R / C);
  if (ci === ENS.ci && cj === ENS.cj && R === ENS.R && ENS.gone === ENS.at) {
    const dx = x - ENS.x, dz = z - ENS.z;
    if (dx * dx + dz * dz < ENS.gap * ENS.gap) { ENS.skip++; return false; }
  }
  ENS.scan++;
  // без массива и Math.hypot, пока всё собрано (09.10.2026, мусор в кадре на Деке)
  const lim = R + C * 0.71, lim2 = lim * lim;
  let todo = null, gap = Infinity;
  for (let i = ci - n; i <= ci + n; i++)
    for (let j = cj - n; j <= cj + n; j++) {
      const dx = (i + 0.5) * C - x, dz = (j + 0.5) * C - z, d2 = dx * dx + dz * dz;
      if (d2 > lim2) { if (!todo && Math.sqrt(d2) - lim < gap && !CELLS.has(key(i, j))) gap = Math.sqrt(d2) - lim; continue; }
      if (CELLS.has(key(i, j))) continue;
      if (!hasForest(i, j)) { CELLS.set(key(i, j), { i, j, empty: true }); continue; }
      (todo || (todo = [])).push([Math.sqrt(d2), i, j]);
    }
  if (!todo) { ENS.ci = ci; ENS.cj = cj; ENS.R = R; ENS.x = x; ENS.z = z; ENS.gap = gap; ENS.at = ENS.gone; return false; }
  ENS.R = -1;
  todo.sort((a, b) => a[0] - b[0]);
  const t0 = performance.now();
  let any = false;
  for (const [, i, j] of todo) {
    buildCell(i, j); any = true;
    if (performance.now() - t0 > budget) break;
  }
  return any;
}

/* ── в меши: что в кадре ── */
const FR = new THREE.Frustum(), PM = new THREE.Matrix4(), SPH = new THREE.Sphere(), V3 = new THREE.Vector3();
/* дальность леса — не дальше края камеры: туман ближе (настройка графики gfx.js, страховка cull.js) —
   и ельник ближе, дальше тумана не строим и не рисуем. Твёрдые стволы нужны только у машины — рядом */
const farOf = cam => Math.max(120, Math.min(FOREST.FAR, (cam.far || 490) - 20));
const nearOf = far => Math.min(FOREST.NEAR, far * 0.47);
function refresh (cam) {
  const F = FOREST, x = cam.position.x, z = cam.position.z, FAR = farOf(cam), NEAR = nearOf(FAR);
  PM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  FR.setFromProjectionMatrix(PM);
  const vis = [];
  for (const c of CELLS.values()) {
    if (c.empty) continue;
    const d = Math.hypot(c.cx - x, c.cz - z);
    if (d > FAR + F.CELL * 0.71) continue;
    SPH.center.set(c.cx, c.gy + 9, c.cz); SPH.radius = F.CELL * 0.71 + 22;
    if (d > F.CELL * 1.5 && !FR.intersectsSphere(SPH)) continue;
    vis.push([d, c]);
  }
  vis.sort((a, b) => a[0] - b[0]);
  const n = { sp0: 0, sp1: 0, pi0: 0, pi1: 0, bu: 0, bi0: 0, bi1: 0 };
  const put = (mk, src, cnt) => {
    const M = MESH[mk], cap = M.instanceMatrix.count;
    const k = Math.min(cnt, cap - n[mk]);
    if (k <= 0) return;
    M.instanceMatrix.array.set(k === src.n ? src.m : src.m.subarray(0, k * 16), n[mk] * 16);
    M.instanceColor.array.set(k === src.n ? src.c : src.c.subarray(0, k * 3), n[mk] * 3);
    n[mk] += k;
  };
  // полоса смены моделей — по каждому дереву в шейдере: клетка у полосы — в обоих мешах
  const half = F.CELL * 0.71 + F.LAG, n0 = NEAR - F.BAND;
  FADE_LOD.value.set(n0, NEAR - F.LAG);
  FADE_BUSH.value.set(F.BUSH_R - F.LAG - F.BUSH_FADE, F.BUSH_R - F.LAG);
  for (const [d, c] of vis) {
    const keep = d < NEAR ? 1 : 1 - (1 - F.THIN) * Math.min(1, (d - NEAR) / Math.max(1, FAR - NEAR));
    if (d < NEAR + half) { if (c.sp) put('sp0', c.sp, c.sp.n); if (c.pi) put('pi0', c.pi, c.pi.n); if (c.bi) put('bi0', c.bi, c.bi.n); }
    if (d > n0 - half) { if (c.sp) put('sp1', c.sp, Math.ceil(c.sp.n * keep)); if (c.pi) put('pi1', c.pi, Math.ceil(c.pi.n * keep)); if (c.bi) put('bi1', c.bi, Math.ceil(c.bi.n * keep)); }
    if (c.bu && d < F.BUSH_R + half) put('bu', c.bu, c.bu.n);
  }
  for (const k in MESH) {
    const M = MESH[k];
    M.count = n[k];
    M.instanceMatrix.clearUpdateRanges && M.instanceMatrix.clearUpdateRanges();
    M.instanceColor.clearUpdateRanges && M.instanceColor.clearUpdateRanges();
    if (n[k]) {
      if (M.instanceMatrix.addUpdateRange) { M.instanceMatrix.addUpdateRange(0, n[k] * 16); M.instanceColor.addUpdateRange(0, n[k] * 3); }
      M.instanceMatrix.needsUpdate = true; M.instanceColor.needsUpdate = true;
    }
  }
  ST.shown = n; ST.refresh++;
}

/* ── подключение ──
   api (game.js): THREE-сцена и камера, CITY, groundH, inHouse, inBounds, nearestRoad,
   solidAt(x, z, r), onAlley(x, z, m), yardBlocks(x, z, r), pzBlocks(x, z, m) */
export function init (api) {
  A = api;
  EDL.provide('forest', EDP);
  forests();
  if (!FORESTS.length) return api;
  makeMeshes();
  return api;
}

/* свой лес (не из карты): полоса вдоль улицы Ленина (leninwood.js). p — контур, hole(x, z, r) → true —
   здесь дерева нет (проплешина, тропа). Клетки рядом, уже собранные пустыми, — заново */
export function addArea (p, hole) {
  if (!A || !p || p.length < 3) return false;
  forests();
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
  FORESTS.push({ p, x0, x1, z0, z1, hole: hole || null, own: true });
  if (!MESH.sp0) makeMeshes();
  const C = FOREST.CELL;
  for (const [k, c] of CELLS) {
    const cx0 = c.i * C, cz0 = c.j * C;
    if (cx0 + C > x0 && cx0 < x1 && cz0 + C > z0 && cz0 < z1) { if (c.empty) { CELLS.delete(k); ENS.gone++; } else dropCell(k, c); }
  }
  LAST.dirty = true;
  return true;
}

export function step (dt, api) {
  if (!A || !FORESTS || !FORESTS.length) return;
  U.uSnow.value = snowAmt(); U.uLeaf.value = leafAmt(); U.uYellow.value = yellowAmt();
  const cam = A.cam, x = cam.position.x, z = cam.position.z, F = FOREST;
  LAST.frame++;
  const jump = Math.hypot(x - LAST.x, z - LAST.z);
  // первый кадр или прыжок (телепорт, другая пиццерия): ближнее — сразу
  let built = jump > 150 ? ensure(x, z, F.WARM, 140) : false;
  const FAR = farOf(cam);
  built = ensure(x, z, FAR, F.BUDGET) || built;
  const fx = -cam.matrixWorld.elements[8], fz = -cam.matrixWorld.elements[10], yaw = Math.atan2(fx, fz);
  let dy = Math.abs(yaw - LAST.yaw); if (dy > Math.PI) dy = 2 * Math.PI - dy;
  if (built || jump > 6 || dy > 0.1 || LAST.frame - LAST.n > 30 || FAR !== LAST.far) {
    LAST.far = FAR;
    refresh(cam);
    LAST.x = x; LAST.z = z; LAST.yaw = yaw; LAST.n = LAST.frame;
  }
  // дальние клетки — из памяти
  if ((LAST.sweep += dt) > 3) {
    LAST.sweep = 0;
    const R = FAR + 150;
    for (const [k, c] of CELLS) {
      const cx = c.empty ? (c.i + 0.5) * F.CELL : c.cx, cz = c.empty ? (c.j + 0.5) * F.CELL : c.cz;
      if (Math.hypot(cx - x, cz - z) > R) { if (c.empty) { CELLS.delete(k); ENS.gone++; } else dropCell(k, c); }
    }
  }
}

/* ── редактор города (editlayer.js): что стоит у точки, пересобрать клетки с новым списком «убрать» ── */
const cellsAround = (x, z, r, fn) => {
  const C = FOREST.CELL;
  for (let i = Math.floor((x - r) / C); i <= Math.floor((x + r) / C); i++)
    for (let j = Math.floor((z - r) / C); j <= Math.floor((z + r) / C); j++) fn(i, j, CELLS.get(key(i, j)));
};
const EDP = {
  list (x, z, r) {
    const out = [];
    cellsAround(x, z, r, (i, j, c) => { for (const t of (c && c.ed) || []) if (Math.hypot(t.x - x, t.z - z) <= r) out.push(t); });
    return out;
  },
  refresh (x, z, r = 1) {
    if (!A || !FORESTS || !FORESTS.length) return;
    const redo = (k, c) => { dropCell(k, c); buildCell(c.i, c.j); };
    if (x === undefined) { for (const [k, c] of [...CELLS]) if (!c.empty) redo(k, c); }
    else cellsAround(x, z, r, (i, j, c) => { if (c && !c.empty) redo(key(i, j), c); });
    LAST.n = -1e9;                                       // в меши — в следующем кадре
  },
  /* клетка у точки собрана (для npm run check: убранное ищут в собранной клетке) */
  warm (x, z) {
    if (!A || !FORESTS || !FORESTS.length) return;
    const C = FOREST.CELL, i = Math.floor(x / C), j = Math.floor(z / C);
    if (!CELLS.has(key(i, j))) buildCell(i, j);
  },
  /* стоит ли тут дерево ельника (r — радиус) — клетку собирает, если надо */
  has (x, z, r) {
    EDP.warm(x, z);
    let n = 0;
    cellsAround(x, z, r, (i, j, c) => {
      if (!c || c.empty) return;
      for (const P of [c.sp, c.pi, c.bu, c.bi]) if (P) for (let q = 0; q < P.n; q++) if (Math.hypot(P.m[q * 16 + 12] - x, P.m[q * 16 + 14] - z) <= r) n++;
    });
    return n;
  },
};

/* стволы рядом с точкой — машина в них упирается (game.js: столкновения кузова) */
const T_LIST = [], T_POOL = [];   // стволы у точки (withTrees) — живут до следующего вызова: езда перебирает их сразу
export function withTrees (list, x, z) {
  if (!FORESTS || !FORESTS.length) return list;
  const C = FOREST.CELL, T = FOREST.TRUNK, R = 3.5;
  T_LIST.length = 0;
  for (let i = Math.floor((x - R) / C); i <= Math.floor((x + R) / C); i++)
    for (let j = Math.floor((z - R) / C); j <= Math.floor((z + R) / C); j++) {
      const c = CELLS.get(key(i, j));
      if (!c || c.empty || !c.sol.length) continue;
      const s = c.sol;
      for (let k = 0; k < s.length; k += 2) {
        if (Math.abs(s[k] - x) > R || Math.abs(s[k + 1] - z) > R) continue;
        // ствол — из запаса (11.10.2026: раньше новый объект на каждый ствол у машины на каждом шаге езды)
        const n = T_LIST.length, o = T_POOL[n] || (T_POOL[n] = { cx: 0.5, cz: 0.5, hw: 0.5, hd: 0.5, cs: 1, sn: 0, ex: 0.5, ez: 0.5, tree: 1 });
        o.cx = s[k]; o.cz = s[k + 1]; o.hw = o.hd = o.ex = o.ez = T;
        T_LIST.push(o);
      }
    }
  return T_LIST.length ? list.concat(T_LIST) : list;
}

/* опушка: расстояние до края леса (для зверей; < 0 — снаружи), null — не у леса */
export function edgeAt (x, z, R = 40) {
  if (!FORESTS) return null;
  let best = null;
  for (const f of FORESTS) {
    if (x < f.x0 - R || x > f.x1 + R || z < f.z0 - R || z > f.z1 + R) continue;
    const p = f.p;
    let e = R;
    for (let k = 0; k < p.length; k++) {
      const a = p[k], b = p[(k + 1) % p.length], dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
      if (d < e) e = d;
    }
    if (e >= R) continue;
    const v = inP(x, z, p) ? e : -e;
    if (best === null || Math.abs(v) < Math.abs(best)) best = v;
  }
  return best;
}

export const DEBUG = {
  FOREST, CELLS, MESH, edgeAt, ENS,
  get stats () {
    return { forests: FORESTS ? FORESTS.length : 0, cells: [...CELLS.values()].filter(c => !c.empty).length, built: ST.built, dropped: ST.dropped,
      spruce: ST.sp, pine: ST.pi, bush: ST.bu, birch: ST.bi, trees: ST.trees, solid: ST.sol, shown: ST.shown, refresh: ST.refresh,
      msTotal: Math.round(ST.ms), msMax: Math.round(ST.msMax * 10) / 10, snow: U.uSnow.value };
  },
  warm: (x, z, R = 470) => { while (ensure(x, z, R, 1000)); return CELLS.size; },
};
