/* ──────────────────────────────────────────────────────────────────────────
   Мелочь на газоне (docs/IDEAS.md, трек «Наполнение мира», шаг 4; правила словами —
   docs/CAREER.md «Город: как выглядит» → «Мелочь на газоне»).

   Только рядом с камерой, как ельник (forest.js): город режется на клетки CELL (40 м),
   клетка собирается, когда камера ближе R, выбрасывается дальше R + DROP. Всё
   детерминированно от координат: одно место — всегда одна и та же вещь.

   Что бывает:
     • пучки высокой травы и одуванчики (весной и летом) — пятнами по газону;
     • бурьян и лопухи у стен домов и у дворовых заборчиков;
     • заросли на пустырях — бурьян, камыш, борщевик 2—2,5 м, плотной группой 10—40 м;
     • оградки из гнутых труб вдоль улиц, со стороны газона;
     • клумбы из покрышек (белёные или крашеные, с цветами) у стен домов;
     • выбивалки для ковров, бельевые столбы с верёвками (иногда с бельём), кучи песка,
       гаражи-ракушки рядами по 2—5 — во дворах, 8—35 м от домов;
     • мусор у мусорных баков; мелкий мусор на газоне (бутылки, бычки, пакеты, фантики)
       — пятнами, чаще у лавочек, остановок, гаражей и баков.
   Не ставится: на дороги и проезды, дорожки и тропинки, аллеи, в дома и у стен, на
   парковки и площадки (спорт, детские), в воду и ельник, на стройки, точки конкурентов
   и костры (construction.js claimed), у подъездов (там пин и машина). Рядом с пином
   текущего заказа и с клиентом вещи прячутся (PIN_HIDE).

   Машина: трава, цветы, заросли и мелкий мусор — насквозь (трава гнётся от машины —
   шейдер); оградки, покрышки, выбивалки, столбы, песок, мусор у баков — сбиваются на
   ходу быстрее 9 км/ч (как дворовая мелочь: летят куски, машину чуть тормозит) и
   лежат до новой смены; ракушки — твёрдые, как стена.

   Сезоны: зимой трава, цветы, лопухи и мелкий мусор под снегом; бурьян и заросли —
   сухие бурые стебли. Осенью трава желтеет. Графика «низкая» — меньше радиус и вдвое
   реже мелочь.

   Перф: 15 общих InstancedMesh на всё (у каждого вида — свой), один материал на
   твёрдое и один на гнущееся. Сборка клетки — не больше BUDGET мс за кадр.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { snowAmt, seasonValue, heatAmt } from './seasons.js';
import * as GFX from './gfx.js';
import { onPave, walkHalf } from './pave.js';
import { wet } from './streams.js';             // речки и пруды — не газон (streams.js)
import * as FADEJS from './fade.js';
import * as EDL from './editlayer.js';          // редактор города: убранная мелочь (edits.json, вид lawn; ключ — место вещи)

export const LAWN = {
  CELL: 40, STEP: 4, DROP: 120,
  // радиус клеток, трава ближе, доля мелочи — по графике: gfx.js DETAIL
  BUDGET: 2, WARM: 80,
  ENT: 7, ENT_BIG: 12,                       // от двери подъезда: мелочь / большое
  PIN_HIDE: 6, PIN_HIDE_BIG: 9,
  GRASS: 0.55, DAND: 0.5, LITTER: 0.035, LITTER_HOT: 0.4, HOT_R: 9,
  WALL_WEED: 0.25, TIRES: 0.07,
  THICKET: 0.78, THICKET_S: 26, THICK_N: 2,  // порог шума, его масштаб (м), стеблей в точке сетки (+ до 3 по густоте)
  YARD_R: 40,                                // заросли, бельё, ракушки, выбивалки — дальше от большой улицы или за домом, м
  BIG: { beater: 0.16, line: 0.18, garage: 0.12, sand: 0.1 },
  RAIL: 0.3, RAIL_YARD: 0.1,
  SLOW: 2.5, SNOW: 0.35,
  FADE: 22, FADE_S: 14, FADE_LAG: 6,         // рост из земли у края дальности: полоса крупного / мелкого, запас, м (fade.js)
  CAPS: { grass: 7000, dand: 3000, weed: 2500, burdock: 1500, tall: 5000, reed: 5000, hog: 2500,
    rail: 1500, tire: 1200, flower: 1200, shell: 300, sand: 200, cube: 5000, lit: 4000, bottle: 2000 },
};
const SMALL = { grass: 1, dand: 1, lit: 1, bottle: 1 };                          // ближе R_SMALL
const BEND = { grass: 1, dand: 1, weed: 1, burdock: 1, tall: 1, reed: 1, hog: 1, flower: 1 };
const WINTER_OFF = { grass: 1, dand: 1, burdock: 1, flower: 1, lit: 1, bottle: 1 };
const DRY = { weed: 1, tall: 1, reed: 1, hog: 1 };                               // зимой — бурые
const THIN = { grass: 1, dand: 1, lit: 1, bottle: 1, tall: 1, reed: 1, hog: 1, weed: 1 };   // на «низкой» — вдвое реже

let A = null;
const CELLS = new Map();
const MESH = {};
const DOWN = new Set();
const U = { uCar: { value: new THREE.Vector4(0, 0, 0, 0) }, uTime: { value: 0 } };
const ST = { built: 0, dropped: 0, ms: 0, msMax: 0, refresh: 0, refMs: 0, shown: {}, items: 0, down: 0, n: {} };
let LAST = { x: 1e9, z: 1e9, yaw: 0, frame: 0, n: 0, sweep: 0, sig: '', rustle: 0 };
let PATHS = null, POLYS = null, PARKS = null, ENTS = null, HOT = null, ROADS = null;

/* ── зерно по точке (как в forest.js) ── */
function hsh (x, z, k) {
  let h = Math.imul(Math.round(x * 8) ^ 0x27d4eb2d, 0x9E3779B1) ^ Math.imul(Math.round(z * 8) + k * 1013904223, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function rng (x, z, k = 3) {
  let a = (hsh(x, z, k) * 4294967296) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let q = a; q = Math.imul(q ^ (q >>> 15), q | 1); q ^= q + Math.imul(q ^ (q >>> 7), q | 61); return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
}
/* гладкий шум 0…1 с шагом s м — пятна */
function vn (x, z, s, k) {
  const fx = x / s, fz = z / s, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const a = hsh(i, j, k), b = hsh(i + 1, j, k), c = hsh(i, j + 1, k), d = hsh(i + 1, j + 1, k);
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
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
const segD = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
};

/* ── сетки: тропинки, запретные многоугольники, подъезды, «горячие» точки мусора, улицы ── */
function gridPut (G, s, x0, z0, x1, z1, v) {
  for (let i = Math.floor(x0 / s); i <= Math.floor(x1 / s); i++)
    for (let j = Math.floor(z0 / s); j <= Math.floor(z1 / s); j++) {
      const k = key(i, j);
      let a = G.get(k);
      if (!a) G.set(k, a = []);
      a.push(v);
    }
}
function indexAll () {
  const C = A.CITY, L = LAWN.CELL;
  PATHS = new Map();
  for (const q of C.paths || []) for (let i = 1; i < q.length; i++) {
    const [ax, az] = q[i - 1], [bx, bz] = q[i];
    gridPut(PATHS, 10, Math.min(ax, bx) - 2, Math.min(az, bz) - 2, Math.max(ax, bx) + 2, Math.max(az, bz) + 2, [ax, az, bx, bz]);
  }
  POLYS = new Map(); PARKS = new Map();
  const box = p => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); } return { p, x0, x1, z0, z1 }; };
  for (const l of C.lots || []) { const b = box(l.p); gridPut(POLYS, L, b.x0, b.z0, b.x1, b.z1, b); }
  for (const g of C.green || []) {
    if (g.k === 'water' || g.k === 'pitch' || g.k === 'play' || A.isForest(g)) { const b = box(g.p); gridPut(POLYS, L, b.x0, b.z0, b.x1, b.z1, b); }
    else if (g.k === 'park') { const b = box(g.p); gridPut(PARKS, L, b.x0, b.z0, b.x1, b.z1, b); }
  }
  for (const p of (A.forests && A.forests()) || []) { const b = box(p); gridPut(POLYS, L, b.x0, b.z0, b.x1, b.z1, b); }   // свой лес (лес у Ленина, leninwood.js) — как ельник
  ENTS = new Map();
  for (const e of C.entrances || []) gridPut(ENTS, 20, e[0], e[1], e[0], e[1], e);
  HOT = new Map();
  const hot = (x, z) => gridPut(HOT, 20, x, z, x, z, [x, z]);
  for (const b of A.benches || []) hot(b.x, b.z);
  for (const s of A.stops || []) hot(s.x, s.z);
  for (const c of A.cans || []) hot(c.x0, c.z0);
  ROADS = new Map();
  (C.roads || []).forEach((r, ri) => {
    if (r.b || r.x || !(r.c >= 1 && r.c <= 4)) return;
    for (let i = 1; i < r.p.length; i++) {
      const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
      gridPut(ROADS, L, Math.min(ax, bx) - 16, Math.min(az, bz) - 16, Math.max(ax, bx) + 16, Math.max(az, bz) + 16, [ri, i]);
    }
  });
}
const near = (G, s, x, z) => G.get(key(Math.floor(x / s), Math.floor(z / s)));
function nearEnt (x, z, r) {
  for (let i = Math.floor((x - r) / 20); i <= Math.floor((x + r) / 20); i++)
    for (let j = Math.floor((z - r) / 20); j <= Math.floor((z + r) / 20); j++)
      for (const e of ENTS.get(key(i, j)) || []) if (Math.hypot(e[0] - x, e[1] - z) < r) return true;
  return false;
}
function hotAt (x, z, r) {
  let best = 99;
  for (let i = Math.floor((x - r) / 20); i <= Math.floor((x + r) / 20); i++)
    for (let j = Math.floor((z - r) / 20); j <= Math.floor((z + r) / 20); j++)
      for (const h of HOT.get(key(i, j)) || []) best = Math.min(best, Math.hypot(h[0] - x, h[1] - z));
  return best;
}
function onPath (x, z, m) {
  for (const s of near(PATHS, 10, x, z) || []) if (segD(x, z, s[0], s[1], s[2], s[3]) < m) return true;
  return false;
}
function inPolys (G, x, z) {
  for (const b of near(G, LAWN.CELL, x, z) || []) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && inP(x, z, b.p)) return true;
  return false;
}
let CLAIMS = null;
function claimed (x, z, m) {
  if (!CLAIMS) CLAIMS = A.claims() || [];
  for (const c of CLAIMS) if (Math.hypot(c.x - x, c.z - z) < c.r + m) return true;
  return false;
}

/* можно ли тут что-то поставить: null — нельзя; иначе { y, edge — до края дороги, wall — у стены } */
function spot (x, z, m = 0) {
  if (!A.inBounds(x, z, -20)) return null;
  const y = A.groundH(x, z);
  if (y < 0.3) return null;
  if (A.inHouse(x, z, 1.2 + m)) return null;
  const nr = A.nearestRoad(x, z, 9, 1);
  let edge = 99;
  if (nr) { edge = nr.d - nr.seg.w / 2; if (edge < (nr.seg.c > 5 ? 0.8 : 1.0) + m) return null; }
  if (onPath(x, z, 1.1 + m) || A.onAlley(x, z, 0.8 + m) || A.yardBlocks(x, z, 0.8 + m) || A.pzBlocks(x, z, 1 + m)) return null;
  if (inPolys(POLYS, x, z) || claimed(x, z, 4 + m)) return null;
  if (onPave(x, z, 0.3 + m)) return null;              // тротуары, пешеходки, дорожки, аллеи (pave.js)
  if (wet(x, z, 0.5 + m)) return null;                 // речка с берегом, пруд (streams.js)
  return { y, edge, wall: A.inHouse(x, z, 4.2) };
}

/* во дворе: с большой улицы (класс ≤ 4) не видно — до неё дальше YARD_R или между ними дом */
function inYard (x, z) {
  const nr = A.nearestRoad(x, z, 4, 2);
  if (!nr || nr.d > LAWN.YARD_R) return true;
  const dx = nr.x - x, dz = nr.z - z, n = Math.ceil(nr.d / 2);
  for (let k = 1; k < n; k++) if (A.inHouse(x + dx * k / n, z + dz * k / n, 0)) return true;
  return false;
}

/* ── модели: единичные, цвет в вершинах ── */
function paint (geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo, n = g.attributes.position.count, c = new THREE.Color(hex), a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g;
}
function merge (parts) {
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), C = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) { P.set(g.attributes.position.array, o * 3); C.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  g.computeVertexNormals();
  return g;
}
const Bx = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const blade = (r, h, x, z, tx, tz, hex, seg = 3) => paint(new THREE.ConeGeometry(r, h, seg, 1, true).translate(0, h / 2, 0).rotateX(tx).rotateZ(tz).translate(x, 0, z), hex);
const stalk = (w, h, x, z, tx, tz, hex) => paint(Bx(w, h, w).translate(0, h / 2, 0).rotateX(tx).rotateZ(tz).translate(x, 0, z), hex);
const blob = (sx, sy, sz, x, y, z, hex, ry = 0, rx = 0) => paint(new THREE.IcosahedronGeometry(1, 0).scale(sx, sy, sz).rotateX(rx).rotateY(ry).translate(x, y, z), hex);
function geos () {
  const r = rng(1, 2, 9), G = {};
  // пучок травы ~0,7 м
  { const P = []; for (let i = 0; i < 6; i++) { const a = i * 1.1; P.push(blade(0.05, 0.45 + r() * 0.35, Math.cos(a) * 0.08, Math.sin(a) * 0.08, Math.sin(a) * 0.3, -Math.cos(a) * 0.3, ['#5f9a3e', '#6faa48', '#4f8a35', '#80b050'][i & 3])); } G.grass = merge(P); }
  // одуванчики
  { const P = [];
    for (let i = 0; i < 4; i++) P.push(paint(Bx(0.28, 0.015, 0.07).translate(0.13, 0.02, 0).rotateY(i * 1.6), '#4f8a35'));
    [[0.04, 0.02, '#f5d020'], [-0.06, 0.05, '#f5d020'], [0.02, -0.07, '#f4f4ee']].forEach(([x, z, hex], i) => {
      const h = 0.18 + i * 0.05;
      P.push(stalk(0.015, h, x, z, 0, 0, '#5a8a38'));
      P.push(paint(new THREE.OctahedronGeometry(i === 2 ? 0.06 : 0.045, 0).translate(x, h + 0.02, z), hex));
    });
    G.dand = merge(P); }
  // бурьян у забора ~1,2 м
  { const P = []; for (let i = 0; i < 5; i++) { const a = i * 1.3, x = Math.cos(a) * 0.15, z = Math.sin(a) * 0.15, h = 0.8 + r() * 0.5;
    P.push(stalk(0.03, h, x, z, Math.sin(a) * 0.12, -Math.cos(a) * 0.12, '#6a8a40'));
    P.push(paint(new THREE.ConeGeometry(0.07, 0.22, 4).translate(x * 1.1, h + 0.05, z * 1.1), '#9a8a5a'));
    P.push(paint(Bx(0.2, 0.02, 0.07).translate(x + 0.06, h * 0.5, z), '#5a7f38')); }
    G.weed = merge(P); }
  // лопух
  { const P = []; for (let i = 0; i < 5; i++) { const a = i * 1.26; P.push(blob(0.36, 0.05, 0.22, Math.cos(a) * 0.3, 0.18, Math.sin(a) * 0.3, i & 1 ? '#3f7a32' : '#47853a', -a, 0)); }
    P.push(stalk(0.04, 0.85, 0, 0, 0, 0, '#5a6a38'));
    for (let i = 0; i < 4; i++) P.push(blob(0.06, 0.06, 0.06, Math.cos(i * 1.6) * 0.08, 0.75 + i * 0.04, Math.sin(i * 1.6) * 0.08, '#7a4a7a'));
    G.burdock = merge(P); }
  // заросли пустыря: бурьян 2—2,5 м
  { const P = []; for (let i = 0; i < 7; i++) { const a = i * 0.9, d = 0.12 + r() * 0.25, x = Math.cos(a) * d, z = Math.sin(a) * d, h = 1.9 + r() * 0.5, tx = Math.sin(a) * 0.1, tz = -Math.cos(a) * 0.1;
    P.push(stalk(0.045, h, x, z, tx, tz, '#748a46'));
    P.push(paint(new THREE.ConeGeometry(0.13, 0.5, 4).translate(0, h + 0.1, 0).rotateX(tx).rotateZ(tz).translate(x, 0, z), '#8a7c52'));
    P.push(paint(Bx(0.32, 0.025, 0.09).translate(0.16, h * (0.35 + r() * 0.3), 0).rotateY(a).translate(x, 0, z), '#5f7f3a')); }
    G.tall = merge(P); }
  // камыш
  { const P = []; for (let i = 0; i < 11; i++) { const a = i * 0.57, d = 0.1 + r() * 0.3; P.push(blade(0.04, 1.9 + r() * 0.5, Math.cos(a) * d, Math.sin(a) * d, Math.sin(a) * 0.12, -Math.cos(a) * 0.12, i & 1 ? '#7f9a50' : '#6f8c46')); }
    for (let i = 0; i < 3; i++) { const x = (r() - 0.5) * 0.4, z = (r() - 0.5) * 0.4, h = 1.8 + r() * 0.4;
      P.push(stalk(0.015, h, x, z, 0, 0, '#7a8a50'));
      P.push(paint(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 5).translate(x, h + 0.12, z), '#6a4428')); }
    G.reed = merge(P); }
  // борщевик
  { const P = [paint(new THREE.CylinderGeometry(0.045, 0.07, 2.3, 5).translate(0, 1.15, 0), '#7a9a50')];
    for (let i = 0; i < 3; i++) P.push(blob(0.6, 0.06, 0.3, Math.cos(i * 2.1) * 0.45, 0.45 + i * 0.15, Math.sin(i * 2.1) * 0.45, '#4f8a38', -i * 2.1, 0));
    P.push(paint(new THREE.CylinderGeometry(0.5, 0.12, 0.14, 8).translate(0, 2.35, 0), '#efecd6'));
    for (const [x, z, h] of [[0.4, 0.1, 1.95], [-0.3, -0.3, 1.8]]) { P.push(stalk(0.025, h, x * 0.5, z * 0.5, z * 0.4, -x * 0.4, '#7a9a50')); P.push(paint(new THREE.CylinderGeometry(0.26, 0.07, 0.1, 7).translate(x, h + 0.02, z), '#f2efdc')); }
    G.hog = merge(P); }
  // оградка из гнутых труб: 2,44 м вдоль x, три дуги
  { const P = [];
    for (const cx of [-0.8, 0, 0.8]) {
      let px = cx + 0.42, py = -0.1;
      for (let k = 1; k <= 7; k++) {
        const t = k / 7 * Math.PI, nx = cx + Math.cos(t) * 0.42, ny = k === 7 ? -0.1 : Math.sin(t) * 0.5 + 0.05;
        const L = Math.hypot(nx - px, ny - py);
        P.push(paint(Bx(L + 0.03, 0.045, 0.045).rotateZ(Math.atan2(ny - py, nx - px)).translate((px + nx) / 2, (py + ny) / 2, 0), '#ffffff'));
        px = nx; py = ny;
      }
    }
    G.rail = merge(P); }
  G.tire = merge([paint(new THREE.TorusGeometry(0.34, 0.12, 5, 12).rotateX(Math.PI / 2).translate(0, 0.07, 0), '#f2f2ec')]);
  { const P = [paint(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 8).translate(0, 0.1, 0), '#5a4030')];
    ['#e04848', '#f2c230', '#b05ad0', '#f08a30', '#ffffff', '#e04848', '#f2c230'].forEach((hex, i) => {
      const a = i * 0.9, d = i ? 0.13 : 0, x = Math.cos(a) * d, z = Math.sin(a) * d, h = 0.22 + (i % 3) * 0.05;
      P.push(stalk(0.02, h, x, z, 0, 0, '#3f8a3a'));
      P.push(paint(Bx(0.08, 0.05, 0.08).translate(x, h + 0.02, z), hex));
    });
    G.flower = merge(P); }
  // ракушка: полуцилиндр радиуса 1 (ширина 2, высота 1), длина 1 вдоль z, дверь на +z
  { const P = [paint(new THREE.CylinderGeometry(1, 1, 1, 10, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), '#d2d5d8')];
    P.push(paint(Bx(0.62, 0.72, 0.02).translate(0, 0.36, 0.505), '#55585c'));
    P.push(paint(Bx(0.05, 0.08, 0.03).translate(0.05, 0.42, 0.52), '#2a2a2a'));
    G.shell = merge(P); }
  { const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, Math.max(0, p.getY(i)) * 0.55 - 0.02);
    G.sand = merge([paint(g, '#e2b26c')]); }
  G.cube = merge([paint(Bx(1, 1, 1), '#ffffff')]);
  G.lit = G.cube;
  G.bottle = merge([paint(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 6).translate(0, 0.1, 0), '#ffffff'),
    paint(new THREE.CylinderGeometry(0.013, 0.03, 0.09, 5).translate(0, 0.245, 0), '#ffffff')]);
  return G;
}

/* материал: твёрдое — как есть; гнущееся — машина раздвигает, ветер чуть качает */
/* материал: твёрдое — как есть; гнущееся — машина раздвигает, ветер чуть качает.
   small — трава, одуванчики, мелкий мусор (своя дальность DETAIL.small). У каждого из четырёх —
   свой uFade: вещь растёт из земли в полосе FADE м до края своей дальности (fade.js), а не
   выскакивает целой клеткой */
const FADE_U = { small: [], big: [] };
function material (bend, small) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const uFade = FADEJS.uniform(THREE, 1e4, 1e4 + 1);
  FADE_U[small ? 'small' : 'big'].push(uFade);
  m.onBeforeCompile = sh => {
    sh.uniforms.uFade = uFade;
    sh.vertexShader = 'uniform vec2 uFade;\n' + FADEJS.FADE_FN + '\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>' + FADEJS.BASE_DIST + FADEJS.GROW_BEGIN);
    if (!bend) return;
    sh.uniforms.uCar = U.uCar; sh.uniforms.uTime = U.uTime;
    sh.vertexShader = 'uniform vec4 uCar;\nuniform float uTime;\n' + sh.vertexShader.replace('#include <project_vertex>', `
      vec4 wq = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
      vec3 b0 = fadeB0;
      float hk = max(wq.y - b0.y, 0.0);
      vec2 dd = b0.xz - uCar.xy; float dl = max(length(dd), 0.001);
      float bend = (1.0 - smoothstep(0.8, 3.2, dl)) * uCar.z;
      wq.xz += dd / dl * bend * hk * 0.7;
      wq.y -= bend * hk * hk * 0.12;
      wq.xz += vec2(sin(uTime * 1.7 + b0.x * 0.37), cos(uTime * 1.3 + b0.z * 0.41)) * 0.035 * hk;
      vec4 mvPosition = viewMatrix * wq;
      gl_Position = projectionMatrix * mvPosition;`);
  };
  m.customProgramCacheKey = () => (bend ? 'lawnBendF' : 'lawnSolidF');
  return m;
}
/* полоса роста: кончается FADE_LAG м до края (камера уходит до 5 м между пересборками) */
function setFade (R, RS) {
  const e = LAWN.FADE_LAG;
  for (const u of FADE_U.small) u.value.set(Math.max(0, RS - e - LAWN.FADE_S), RS - e);
  for (const u of FADE_U.big) u.value.set(Math.max(0, R - e - LAWN.FADE), R - e);
}
function makeMeshes () {
  const G = geos(), mats = { sb: material(true, true), bb: material(true, false), ss: material(false, true), bs: material(false, false) };
  for (const k in LAWN.CAPS) {
    const cap = LAWN.CAPS[k], M = new THREE.InstancedMesh(G[k], mats[(SMALL[k] ? 's' : 'b') + (BEND[k] ? 'b' : 's')], cap);
    M.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    M.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    M.instanceColor.setUsage(THREE.DynamicDrawUsage);
    M.count = 0; M.frustumCulled = false; M.visible = false;
    A.scene.add(M);
    MESH[k] = M;
  }
}

/* ── клетка ── */
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P3 = new THREE.Vector3(), S3 = new THREE.Vector3(), CC = new THREE.Color();
function Cell (i, j) {
  const C = LAWN.CELL;
  return { i, j, x0: i * C, z0: j * C, cx: (i + 0.5) * C, cz: (j + 0.5) * C, L: {}, items: [], sol: [], thick: [], down: 0 };
}
/* экземпляр: вид, место, поворот (ry; rx, rz — наклон), размер, цвет, чей (номер вещи или -1), жребий */
function inst (cell, k, x, y, z, ry, sx, sy, sz, hex, own = -1, rk = Math.random(), rx = 0, rz = 0) {
  let L = cell.L[k];
  if (!L) cell.L[k] = L = [];
  CC.set(hex);
  L.push([x, y, z, ry, sx, sy, sz, CC.r, CC.g, CC.b, own, rk, rx, rz]);
}
function item (cell, kind, pts, hex, o = {}) {
  const it = { kind, pts, hex, key: kind + ':' + Math.round(pts[0][0] * 10) + ':' + Math.round(pts[0][1] * 10), down: 0, hid: 0, ...o };
  it.x = pts[0][0]; it.z = pts[0][1];
  if (EDL.gone('lawn', it.x, it.z)) it.ed = 1;           // убрана в редакторе города — не видна и не мешает, всегда
  if (it.ed || DOWN.has(it.key)) { it.down = 1; cell.down++; }
  cell.items.push(it);
  return cell.items.length - 1;
}
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];

/* сборка клетки — кусками: после каждой точки сетки, если время кадра вышло (DEADLINE), —
   yield, дальше в следующем кадре. Клетка попадает в CELLS только целой. */
let DEADLINE = Infinity, BUILDING = null;
const late = () => performance.now() > DEADLINE;
function * buildCell (i, j) {
  const F = LAWN, S = F.STEP;
  const cell = Cell(i, j);
  const { x0, z0 } = cell, x1 = x0 + F.CELL, z1 = z0 + F.CELL;
  const inCell = (x, z) => x >= x0 && x < x1 && z >= z0 && z < z1;
  const kids = !A.ADULT;
  const taken = [];                                     // большие вещи клетки: [x, z, r]
  const free = (x, z, r) => taken.every(t => Math.hypot(t[0] - x, t[1] - z) > t[2] + r);
  const tires = [];
  // 1) точки сетки
  for (let gx = x0 + S / 2; gx < x1; gx += S)
    for (let gz = z0 + S / 2; gz < z1; gz += S) {
      if (late()) yield;
      const r = rng(gx, gz);
      const x = gx + (r() - 0.5) * S * 0.8, z = gz + (r() - 0.5) * S * 0.8;
      const sp = spot(x, z);
      if (!sp) continue;
      const entNear = nearEnt(x, z, F.ENT);
      // заросли на пустыре
      const thick = vn(x, z, F.THICKET_S, 21);
      if (thick > F.THICKET && sp.edge > 6 && !sp.wall && !entNear && !A.inHouse(x, z, 13) && !nearEnt(x, z, 14) && !inPolys(PARKS, x, z) && inYard(x, z)) {
        const kind = (() => { const h = hsh(Math.floor(x / 30), Math.floor(z / 30), 22); return h < 0.55 ? 'tall' : h < 0.75 ? 'reed' : 'hog'; })();
        const dens = Math.min(1, (thick - F.THICKET) / 0.1);
        const n = F.THICK_N + Math.floor(dens * 3.99);
        for (let k = 0; k < n; k++) {
          const px = x + (r() - 0.5) * S, pz = z + (r() - 0.5) * S;
          if (!inCell(px, pz) || !spot(px, pz, 0.4)) continue;
          const kk = kind === 'hog' && r() < 0.45 ? 'tall' : kind;
          const s = 0.85 + r() * 0.3, sh = (0.75 + 0.25 * dens) * (0.9 + r() * 0.2);
          inst(cell, kk, px, A.groundH(px, pz) - 0.05, pz, r() * 6.3, s, sh, s, '#ffffff', -1, r(), 0, 0);
        }
        cell.thick.push(x, z);
        continue;
      }
      // бурьян и лопухи у стен и у дворовых заборчиков
      if (!entNear && (sp.wall || A.yardBlocks(x, z, 2.4)) && r() < F.WALL_WEED) {
        const k = r() < 0.6 ? 'weed' : 'burdock', s = 0.8 + r() * 0.5;
        inst(cell, k, x, sp.y - 0.03, z, r() * 6.3, s, s * (0.85 + r() * 0.3), s, '#ffffff', -1, r());
        if (r() < 0.5) { const px = x + (r() - 0.5) * 1.5, pz = z + (r() - 0.5) * 1.5; if (spot(px, pz)) inst(cell, 'weed', px, A.groundH(px, pz) - 0.03, pz, r() * 6.3, s, s, s, '#ffffff', -1, r()); }
      }
      // клумбы из покрышек — у стен дома, не у двери
      if (sp.wall && !A.inHouse(x, z, 2.6) && !nearEnt(x, z, 6) && r() < F.TIRES && free(x, z, 4) && tires.every(t => Math.hypot(t[0] - x, t[1] - z) > 9)) {
        const n = 2 + Math.floor(r() * 3), a = r() * 6.3, ux = Math.cos(a), uz = Math.sin(a);
        const paintHex = r() < 0.55 ? '#ffffff' : pick(r, ['#e05a4a', '#f2c230', '#4f8fd6', '#59b06a', '#f08a30']);
        const pts = [];
        for (let k = 0; k < n; k++) {
          const px = x + ux * (k - (n - 1) / 2) * 0.82, pz = z + uz * (k - (n - 1) / 2) * 0.82;
          if (!spot(px, pz)) continue;
          pts.push([px, pz, 0.45]);
        }
        if (pts.length) {
          const own = item(cell, 'tire', pts, paintHex);
          for (const [px, pz] of pts) {
            const y = A.groundH(px, pz);
            inst(cell, 'tire', px, y - 0.02, pz, r() * 6.3, 1, 1, 1, paintHex, own, r());
            inst(cell, 'flower', px, y - 0.02, pz, r() * 6.3, 1, 0.9 + r() * 0.3, 1, '#ffffff', own, r());
          }
          tires.push([x, z]); taken.push([x, z, 2]);
        }
      }
      // трава и одуванчики — пятнами
      const gd = vn(x, z, 14, 23);
      const ng = Math.floor((gd * 1.6 - 0.25 + r() * 0.6) * 3 * F.GRASS);
      const scatter = sp.edge > 2.4 && !sp.wall;
      for (let k = 0; k < ng; k++) {
        const px = scatter ? x + (r() - 0.5) * 3 : x, pz = scatter ? z + (r() - 0.5) * 3 : z;
        if (scatter && onPath(px, pz, 1.0)) continue;
        const s = 0.7 + r() * 0.7;
        inst(cell, 'grass', px, A.groundH(px, pz) - 0.03, pz, r() * 6.3, s, s * (0.8 + r() * 0.5), s, '#ffffff', -1, r());
      }
      if (vn(x, z, 11, 24) > 1 - F.DAND * 0.6) {
        const nd = 1 + Math.floor(r() * 3);
        for (let k = 0; k < nd; k++) {
          const px = scatter ? x + (r() - 0.5) * 3 : x, pz = scatter ? z + (r() - 0.5) * 3 : z;
          const s = 0.9 + r() * 0.5;
          inst(cell, 'dand', px, A.groundH(px, pz), pz, r() * 6.3, s, s, s, '#ffffff', -1, r());
        }
      }
      // мелкий мусор: редко пятнами, у лавочек, остановок, баков — чаще
      const hot = hotAt(x, z, F.HOT_R) < F.HOT_R ? F.LITTER_HOT : 0;
      const pl = F.LITTER * (vn(x, z, 18, 25) > 0.6 ? 3 : 0.5) + hot;
      if (r() < pl) {
        const n = 1 + Math.floor(r() * 3);
        for (let k = 0; k < n; k++) litter(cell, x + (r() - 0.5) * 2.4, z + (r() - 0.5) * 2.4, r, kids);
      }
      // большое во дворе: выбивалка, бельё, песок, ракушки — по одной на кусок 20×20
      if (!entNear && !nearEnt(x, z, F.ENT_BIG) && sp.edge > 4 && !A.inHouse(x, z, 8) && A.inHouse(x, z, 35) && free(x, z, 6) && inYard(x, z)) {
        const h = hsh(Math.floor(x / 20), Math.floor(z / 20), 31);
        const b = F.BIG;
        const claimKey = Math.floor(x / 20) + ',' + Math.floor(z / 20);
        if (cell['big' + claimKey]) continue;
        let kind = null;
        if (h < b.beater) kind = 'beater';
        else if (h < b.beater + b.line) kind = 'line';
        else if (h < b.beater + b.line + b.garage) kind = 'garage';
        else if (h < b.beater + b.line + b.garage + b.sand) kind = 'sand';
        if (!kind) { cell['big' + claimKey] = 1; continue; }
        if (r() > 0.35) continue;                       // не первая же точка куска — место гуляет
        if (bigThing(cell, kind, x, z, r, taken, kids)) cell['big' + claimKey] = 1;
      }
      if (late()) yield;
    }
  // 2) оградки вдоль улиц, со стороны газона
  rails(cell, inCell);
  if (late()) yield;
  // 3) мусор у баков
  for (const c of A.cans || []) {
    if (!inCell(c.x0, c.z0) || hsh(c.x0, c.z0, 41) > 0.5) continue;
    const r = rng(c.x0, c.z0, 42), a = r() * 6.3, d = 1.6 + r() * 0.8;
    const px = c.x0 + Math.cos(a) * d, pz = c.z0 + Math.sin(a) * d;
    const nr = A.nearestRoad(px, pz, 9, 1);
    if ((nr && nr.d - nr.seg.w / 2 < 0.6) || A.inHouse(px, pz, 0.5)) continue;
    const own = item(cell, 'trash', [[px, pz, 1.2]], '#2a2a2a', { slow: 0.97 });
    const y = A.groundH(px, pz);
    for (let k = 0, n = 2 + Math.floor(r() * 4); k < n; k++) {
      const s = 0.4 + r() * 0.25, bx = px + (r() - 0.5) * 1.4, bz = pz + (r() - 0.5) * 1.4;
      inst(cell, 'cube', bx, y + s * 0.35, bz, r() * 6.3, s, s * 0.7, s * 0.9, pick(r, ['#262626', '#1d2a3a', '#3a3a30', '#2f5a2f']), own, r(), (r() - 0.5) * 0.3, (r() - 0.5) * 0.3);
    }
    if (r() < 0.6) { const s = 0.4 + r() * 0.3; inst(cell, 'cube', px + 0.6, y + s * 0.4, pz - 0.4, r() * 6.3, s, s * 0.8, s * 0.8, '#b08850', own, r()); }
    if (r() < 0.3) inst(cell, 'cube', px - 0.4, y + 0.12, pz + 0.7, a, 1.9, 0.2, 0.9, pick(r, ['#d9cdb0', '#c8b8d8', '#b8c8a8']), own, r(), 0.15, 0);
  }
  // упаковать: по жребию (на «низкой» берём первые — разреживание равномерное)
  for (const k in cell.L) {
    const list = cell.L[k];
    list.sort((a, b) => a[11] - b[11]);
    const n = list.length, m = new Float32Array(n * 16), c = new Float32Array(n * 3), own = new Int32Array(n);
    list.forEach((t, q) => {
      M4.compose(P3.set(t[0], t[1], t[2]), Q.setFromEuler(E.set(t[12], t[3], t[13], 'YXZ')), S3.set(t[4], t[5], t[6]));
      M4.toArray(m, q * 16);
      c[q * 3] = t[7]; c[q * 3 + 1] = t[8]; c[q * 3 + 2] = t[9];
      own[q] = t[10];
    });
    cell.L[k] = { m, c, own, n };
    ST.n[k] = (ST.n[k] || 0) + n;
    if (late()) yield;
  }
  ST.items += cell.items.length;
  ST.built++;
  CELLS.set(key(i, j), cell);
  return cell;
}

/* мелкий мусор: бутылка, бычки, пакет, фантик. В детской — бутылки от лимонада и фантики */
function litter (cell, x, z, r, kids) {
  if (!spot(x, z)) return;
  const y = A.groundH(x, z), h = r();
  if (h < 0.4) {
    const hex = kids ? pick(r, ['#59c26a', '#f08a30', '#e8e4d0', '#e05a4a']) : pick(r, ['#2f7a3a', '#6a3a1a', '#7a4a20', '#cfe4ee', '#9ec8e0']);
    inst(cell, 'bottle', x, y + 0.035, z, r() * 6.3, 1, 1, 1, hex, -1, r(), 0, Math.PI / 2);
  } else if (h < 0.62 && !kids) {
    for (let k = 0, n = 2 + Math.floor(r() * 3); k < n; k++)
      inst(cell, 'lit', x + (r() - 0.5) * 0.6, y + 0.015, z + (r() - 0.5) * 0.6, r() * 6.3, 0.07, 0.025, 0.025, k & 1 ? '#f2efe6' : '#d9a050', -1, r());
  } else if (h < 0.8) {
    inst(cell, 'lit', x, y + 0.04, z, r() * 6.3, 0.35, 0.08, 0.28, kids ? '#f2f2f2' : pick(r, ['#f2f2f2', '#2a2a2a', '#3a6ad0']), -1, r(), (r() - 0.5) * 0.4, (r() - 0.5) * 0.4);
  } else {
    inst(cell, 'lit', x, y + 0.01, z, r() * 6.3, 0.12, 0.012, 0.08, pick(r, ['#e05a4a', '#f2c230', '#4f8fd6', '#b05ad0', '#f2f2f2']), -1, r());
  }
}

/* выбивалка, бельевые столбы, песок, ракушки */
function bigThing (cell, kind, x, z, r, taken, kids) {
  const a = r() * Math.PI, ux = Math.cos(a), uz = Math.sin(a), y0 = A.groundH(x, z);
  const ry = Math.atan2(-uz, ux);                          // локальная x — вдоль (ux, uz)
  const C = (hexes) => pick(r, hexes);
  if (kind === 'beater') {
    const W = 2.6, ends = [[x - ux * W / 2, z - uz * W / 2], [x + ux * W / 2, z + uz * W / 2]];
    if (!ends.every(([px, pz]) => spot(px, pz, 0.3))) return false;
    const hex = C(['#a8463a', '#3f6fa8', '#3f7a4a', '#c9803a', '#7a7a80']);
    const own = item(cell, 'beater', ends.map(([px, pz]) => [px, pz, 0.4]), hex);
    for (const [px, pz] of ends) inst(cell, 'cube', px, A.groundH(px, pz) + 0.9, pz, ry, 0.08, 2.0, 0.08, hex, own, r());
    inst(cell, 'cube', x, y0 + 1.88, z, ry, W + 0.1, 0.07, 0.07, hex, own, r());
    inst(cell, 'cube', x, y0 + 1.25, z, ry, W, 0.06, 0.06, hex, own, r());
    if (r() < 0.25) inst(cell, 'cube', x, y0 + 1.35, z, ry, 1.6, 1.1, 0.04, C(['#9a2a2a', '#7a2a5a', '#2a4a7a']), own, r());   // ковёр
    taken.push([x, z, 2.5]);
  } else if (kind === 'line') {
    const W = 6 + r() * 2, ends = [[x - ux * W / 2, z - uz * W / 2], [x + ux * W / 2, z + uz * W / 2]];
    if (!ends.every(([px, pz]) => spot(px, pz, 0.3)) || !free(taken, x, z, W / 2 + 1)) return false;
    const hex = C(['#7a7a80', '#3f6fa8', '#a8463a', '#3f7a4a']);
    const own = item(cell, 'line', ends.map(([px, pz]) => [px, pz, 0.4]), hex);
    for (const [px, pz] of ends) {
      const y = A.groundH(px, pz);
      inst(cell, 'cube', px, y + 1.05, pz, ry, 0.08, 2.3, 0.08, hex, own, r());
      inst(cell, 'cube', px, y + 2.15, pz, ry, 0.06, 0.06, 1.1, hex, own, r());
    }
    for (const o of [-0.45, 0, 0.45]) inst(cell, 'cube', x - uz * o, y0 + 2.1, z + ux * o, ry, W, 0.02, 0.02, '#e8e4d8', own, r());
    if (r() < 0.55) {
      for (let k = 0, n = 2 + Math.floor(r() * 5); k < n; k++) {
        const t = (r() - 0.5) * (W - 1.4), o = pick(r, [-0.45, 0, 0.45]), w = 0.45 + r() * 0.5, h = 0.4 + r() * 0.5;
        inst(cell, 'cube', x + ux * t - uz * o, y0 + 2.1 - h / 2, z + uz * t + ux * o, ry, w, h, 0.02,
          C(['#f2f2f2', '#e05a4a', '#4f8fd6', '#f2c230', '#59b06a', '#d0a0d8', '#f2f2f2']), own, r());
      }
    }
    taken.push([x, z, W / 2 + 0.5]);
  } else if (kind === 'sand') {
    if (!spot(x, z, 1)) return false;
    const own = item(cell, 'sand', [[x, z, 1.3]], '#e2b26c', { slow: 0.9 });
    inst(cell, 'sand', x, y0, z, r() * 6.3, 1.2 + r() * 0.5, 1 + r() * 0.4, 1 + r() * 0.4, '#ffffff', own, r());
    if (r() < 0.4) inst(cell, 'cube', x + 0.8, y0 + 0.5, z, r() * 6.3, 0.05, 1.1, 0.05, '#8a6b4e', own, r(), 0.4, 0.2);   // лопата
    taken.push([x, z, 2]);
  } else {
    // ракушки рядом, дверью к ближайшему проезду
    const nr = A.nearestRoad(x, z, 5, 2);
    if (!nr) return false;
    let dx = nr.x - x, dz = nr.z - z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const tx = dz, tz = -dx, n = 2 + Math.floor(r() * 4), rot = Math.atan2(-tz, tx);
    const list = [];
    for (let k = 0; k < n; k++) {
      const o = (k - (n - 1) / 2) * 3.3, gx = x + tx * o, gz = z + tz * o;
      const ok = [[0, 0], [1.5, 2.7], [-1.5, 2.7], [1.5, -2.7], [-1.5, -2.7]].every(([a, b]) => spot(gx + tx * a + dx * b, gz + tz * a + dz * b, 0.4));
      if (!ok || !free(taken, gx, gz, 3)) { if (list.length) break; continue; }
      list.push([gx, gz]);
    }
    if (!list.length) return false;
    for (const [gx, gz] of list) {
      const own = item(cell, 'garage', [[gx, gz, 0]], '#888', { solid: 1 });
      inst(cell, 'shell', gx, A.groundH(gx, gz) - 0.05, gz, rot, 1.5, 1.95, 5.4, C(['#7fa07a', '#7f95b8', '#c0c0b8', '#b07a5a', '#e8e8e0', '#6f8f9f']), own, r());
      const cs = tx, sn = tz, hw = 1.5, hd = 2.7;
      cell.sol.push({ cx: gx, cz: gz, hw, hd, cs, sn, ex: Math.abs(cs) * hw + Math.abs(sn) * hd, ez: Math.abs(sn) * hw + Math.abs(cs) * hd, own, mat: 'bin' });   // mat — удар звучит пустым железом (impact.js)
      taken.push([gx, gz, 3]);
      gridHot(gx, gz);
    }
  }
  return true;
}
const free = (taken, x, z, r) => taken.every(t => Math.hypot(t[0] - x, t[1] - z) > t[2] + r);
function gridHot (x, z) { gridPut(HOT, 20, x, z, x, z, [x, z]); }

/* оградки: у улиц (и редких дворовых проездов) с одной стороны, кусками по 2,44 м */
function rails (cell, inCell) {
  const seen = new Set(), C = A.CITY.roads;
  for (const [ri, si] of ROADS.get(key(cell.i, cell.j)) || []) {
    const id = ri * 4096 + si;
    if (seen.has(id)) continue;
    seen.add(id);
    const rd = C[ri];
    for (const sd of [-1, 1]) {
      if (hsh(ri, sd, 51) > (rd.c === 4 ? LAWN.RAIL_YARD : LAWN.RAIL)) continue;
      const hex = ['#3f7a4a', '#4f6fa8', '#e8e4d8', '#c9803a', '#a8463a'][Math.floor(hsh(ri, sd, 52) * 5)];
      const [ax, az] = rd.p[si - 1], [bx, bz] = rd.p[si], len = Math.hypot(bx - ax, bz - az);
      if (len < 14) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len, nx = -uz * sd, nz = ux * sd, off = walkHalf({ w: A.roadWidth(rd), c: rd.c, g: rd.g }) + 0.5;   // за тротуаром, по краю газона
      const ry = Math.atan2(-uz, ux);
      for (let d = 7; d + 2.44 < len - 7; d += 2.44) {
        // у края газона, сразу за тротуаром (или чуть дальше, если там занято)
        let x = 0, z = 0, sp = null;
        for (const o of [off, off + 1.2, off + 2.4]) {
          x = ax + ux * (d + 1.22) + nx * o; z = az + uz * (d + 1.22) + nz * o;
          sp = spot(x, z);
          if (sp && sp.edge >= 1.0 && spot(x - ux * 1.2, z - uz * 1.2) && spot(x + ux * 1.2, z + uz * 1.2)) break;
          sp = null;
        }
        if (!sp || !inCell(x, z) || nearEnt(x, z, 5)) continue;
        const own = item(cell, 'rail', [[x - ux * 0.8, z - uz * 0.8, 0.5], [x + ux * 0.8, z + uz * 0.8, 0.5]], hex);
        inst(cell, 'rail', x, sp.y, z, ry, 1, 1, 1, hex, own, hsh(x, z, 53));
      }
    }
  }
}

function dropCell (k, c) {
  for (const n in c.L) ST.n[n] -= c.L[n].n;
  ST.items -= c.items.length;
  CELLS.delete(k); ST.dropped++;
}
function ensure (x, z, R, budget) {
  const C = LAWN.CELL, ci = Math.floor(x / C), cj = Math.floor(z / C), n = Math.ceil(R / C);
  const todo = [];
  for (let i = ci - n; i <= ci + n; i++)
    for (let j = cj - n; j <= cj + n; j++) {
      if (CELLS.has(key(i, j)) || (BUILDING && BUILDING.k === key(i, j))) continue;
      const d = Math.hypot((i + 0.5) * C - x, (j + 0.5) * C - z);
      if (d > R + C * 0.71) continue;
      todo.push([d, i, j]);
    }
  if (!todo.length && !BUILDING) return false;
  todo.sort((a, b) => a[0] - b[0]);
  const t0 = performance.now();
  DEADLINE = t0 + budget;
  let done = false;
  const slice = g => { const s = performance.now(), r = g.next(), dt = performance.now() - s; ST.ms += dt; ST.msMax = Math.max(ST.msMax, dt); return r.done; };
  try {
    if (BUILDING) { if (!slice(BUILDING.g)) return false; BUILDING = null; done = true; }
    for (const [, i, j] of todo) {
      if (performance.now() > DEADLINE) break;
      const g = buildCell(i, j);
      if (!slice(g)) { BUILDING = { k: key(i, j), g }; break; }
      done = true;
    }
  } finally { DEADLINE = Infinity; }
  return done;                                         // true — есть новые целые клетки
}

/* ── сезон: что видно и каким цветом ── */
function season () {
  const snow = snowAmt(), s = ((seasonValue() % 4) + 4) % 4;
  const winter = snow > LAWN.SNOW;
  const dand = !winter && (s >= 3.2 || s < 0.95);
  const autumn = winter ? 0 : s < 0.9 ? 0 : s < 1.4 ? (s - 0.9) / 0.5 : s < 2.2 ? 1 : 0;
  const heat = winter ? 0 : heatAmt();                 // жара: трава и бурьян выжжены, одуванчиков нет
  return { winter, dand: dand && heat < 0.5, autumn, heat, sig: (winter ? 'w' : '') + (dand ? 'd' : '') + Math.round(autumn * 10) + 'h' + Math.round(heat * 10) };
}

/* ── в меши: что рядом и в кадре ── */
const FR = new THREE.Frustum(), PM = new THREE.Matrix4(), SPH = new THREE.Sphere();
let PINS = null;
const low = () => !!(A.low && A.low());
const DET = () => GFX.detail();
function radius (cam) { return Math.min(DET().R, (cam.far || 490) - 20); }
function hideNear (x, z, big) {
  if (!PINS) return false;
  const r = big ? LAWN.PIN_HIDE_BIG : LAWN.PIN_HIDE;
  for (let k = 0; k < PINS.length; k += 2) if (Math.abs(PINS[k] - x) < r && Math.abs(PINS[k + 1] - z) < r && Math.hypot(PINS[k] - x, PINS[k + 1] - z) < r) return true;
  return false;
}
function refresh (cam) {
  const t0 = performance.now(), F = LAWN, x = cam.position.x, z = cam.position.z, R = radius(cam), RS = Math.min(R, DET().small);
  const SEA = season(), thin = DET().thin;
  setFade(R, RS);
  PM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  FR.setFromProjectionMatrix(PM);
  const vis = [];
  for (const c of CELLS.values()) {
    // спрятать у пина: вещи клетки (и в тех, что не в кадре, — для столкновений)
    let pinNear = false;
    if (PINS) for (let k = 0; k < PINS.length; k += 2) if (PINS[k] > c.x0 - 10 && PINS[k] < c.x0 + F.CELL + 10 && PINS[k + 1] > c.z0 - 10 && PINS[k + 1] < c.z0 + F.CELL + 10) pinNear = true;
    if (pinNear || c.pinNear) for (const it of c.items) it.hid = pinNear && hideNear(it.x, it.z, it.kind === 'garage' || it.kind === 'line') ? 1 : 0;
    c.pinNear = pinNear;
    const d = Math.hypot(c.cx - x, c.cz - z);
    if (d > R + F.CELL * 0.71) continue;
    if (c.gy === undefined) c.gy = A.groundH(c.cx, c.cz);
    SPH.center.set(c.cx, c.gy + 2, c.cz); SPH.radius = F.CELL * 0.71 + 4;
    if (d > F.CELL * 1.2 && !FR.intersectsSphere(SPH)) continue;
    vis.push([d, c]);
  }
  vis.sort((a, b) => a[0] - b[0]);
  const n = {};
  for (const k in MESH) n[k] = 0;
  for (const [d, c] of vis) {
    for (const k in c.L) {
      if (SEA.winter && WINTER_OFF[k]) continue;
      if (k === 'dand' && !SEA.dand) continue;
      if (SMALL[k] && d > RS + F.CELL * 0.71) continue;
      const src = c.L[k], M = MESH[k], cap = M.instanceMatrix.count;
      const want = thin < 1 && THIN[k] ? Math.ceil(src.n * thin) : src.n;
      const ma = M.instanceMatrix.array, ca = M.instanceColor.array;
      if (!c.down && !c.pinNear) {
        const q = Math.min(want, cap - n[k]);
        if (q <= 0) continue;
        ma.set(q === src.n ? src.m : src.m.subarray(0, q * 16), n[k] * 16);
        ca.set(q === src.n ? src.c : src.c.subarray(0, q * 3), n[k] * 3);
        n[k] += q;
        continue;
      }
      const thick = k === 'tall' || k === 'reed' || k === 'hog';
      for (let q = 0; q < want && n[k] < cap; q++) {
        const o = src.own[q];
        if (o >= 0 && (c.items[o].down || c.items[o].hid)) continue;
        if (o < 0 && thick && c.pinNear && hideNear(src.m[q * 16 + 12], src.m[q * 16 + 14], false)) continue;
        ma.set(src.m.subarray(q * 16, q * 16 + 16), n[k] * 16);
        ca.set(src.c.subarray(q * 3, q * 3 + 3), n[k] * 3);
        n[k]++;
      }
    }
  }
  // краски сезона: осенью трава желтеет, зимой бурьян и заросли — бурые
  const tint = (k, r, g, b) => { const a = MESH[k].instanceColor.array; for (let q = 0; q < n[k] * 3; q += 3) { a[q] *= r; a[q + 1] *= g; a[q + 2] *= b; } };
  if (SEA.autumn > 0) { const t = SEA.autumn; tint('grass', 1 + 0.35 * t, 1 - 0.05 * t, 1 - 0.5 * t); tint('weed', 1 + 0.3 * t, 1 - 0.1 * t, 1 - 0.4 * t); tint('burdock', 1 + 0.2 * t, 1 - 0.1 * t, 1 - 0.3 * t); }
  if (SEA.heat > 0) { const t = SEA.heat; tint('grass', 1 + 0.45 * t, 1 - 0.02 * t, 1 - 0.6 * t); tint('weed', 1 + 0.35 * t, 1 - 0.05 * t, 1 - 0.5 * t); tint('burdock', 1 + 0.25 * t, 1 - 0.05 * t, 1 - 0.4 * t); for (const k of ['tall', 'reed', 'hog']) tint(k, 1 + 0.3 * t, 1 - 0.04 * t, 1 - 0.45 * t); }
  if (SEA.winter) for (const k in DRY) tint(k, 1.25, 0.82, 0.55);
  else if (SEA.autumn > 0) for (const k of ['tall', 'reed', 'hog']) tint(k, 1 + 0.25 * SEA.autumn, 1 - 0.08 * SEA.autumn, 1 - 0.35 * SEA.autumn);
  for (const k in MESH) {
    const M = MESH[k];
    M.count = n[k]; M.visible = n[k] > 0;
    if (!n[k]) continue;
    M.instanceMatrix.clearUpdateRanges && M.instanceMatrix.clearUpdateRanges();
    M.instanceColor.clearUpdateRanges && M.instanceColor.clearUpdateRanges();
    if (M.instanceMatrix.addUpdateRange) { M.instanceMatrix.addUpdateRange(0, n[k] * 16); M.instanceColor.addUpdateRange(0, n[k] * 3); }
    M.instanceMatrix.needsUpdate = true; M.instanceColor.needsUpdate = true;
  }
  ST.shown = n; ST.refresh++;
  ST.refMs = Math.round((performance.now() - t0) * 100) / 100;
}

/* ── подключение ──
   api (game.js): THREE-сцена, камера, CITY, ADULT, groundH, inHouse, inBounds, nearestRoad, roadWidth,
   onAlley, yardBlocks, pzBlocks, isForest, claims() — занятые места [{x, z, r}], benches, stops, cans,
   car — машина игрока (x, z, vx, vz), pins() — [x, z, …] пины и клиенты заказа, low() — графика «низкая»,
   debris(x, z, nx, nz, force, hex, n) — разлёт кусков, Snd */
let DIRTY = true, T = 0;
export function init (api) {
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('noprops')) return api;   // ?noprops — без мелочи на газоне (сравнить)
  A = api;
  EDL.provide('lawn', EDP);
  indexAll();
  makeMeshes();
  return api;
}

export function step (dt) {
  if (!A) return;
  T += dt; U.uTime.value = T;
  const V = A.car;
  U.uCar.value.set(V.x, V.z, 1, 0);
  const cam = A.cam, x = cam.position.x, z = cam.position.z, F = LAWN;
  LAST.frame++;
  const jump = Math.hypot(x - LAST.x, z - LAST.z), R = radius(cam);
  let built = jump > 150 ? ensure(x, z, F.WARM, 60) : false;
  built = ensure(x, z, R, F.BUDGET) || built;
  // пины заказа: рядом с ними вещи прячутся
  const P = A.pins();
  PINS = P && P.length ? P : null;
  let sig = season().sig + DET().R;
  if (PINS) for (let k = 0; k < PINS.length; k++) sig += ',' + Math.round(PINS[k]);
  const fx = -cam.matrixWorld.elements[8], fz = -cam.matrixWorld.elements[10], yaw = Math.atan2(fx, fz);
  let dy = Math.abs(yaw - LAST.yaw); if (dy > Math.PI) dy = 2 * Math.PI - dy;
  if (built || DIRTY || jump > 5 || dy > 0.12 || sig !== LAST.sig || LAST.frame - LAST.n > 40) {
    DIRTY = false; LAST.sig = sig;
    refresh(cam);
    LAST.x = x; LAST.z = z; LAST.yaw = yaw; LAST.n = LAST.frame;
  }
  if ((LAST.sweep += dt) > 3) {
    LAST.sweep = 0;
    for (const [k, c] of CELLS) if (Math.hypot(c.cx - x, c.cz - z) > R + F.DROP) dropCell(k, c);
  }
  // шорох в зарослях
  if ((LAST.rustle -= dt) < 0 && Math.hypot(V.vx, V.vz) > 3 && inThicket(V.x, V.z)) {
    LAST.rustle = 0.3;
    A.Snd && A.Snd.fx('rustle', s => s.noise(0.14, 0.05));
  }
}
function inThicket (x, z) {
  const c = CELLS.get(key(Math.floor(x / LAWN.CELL), Math.floor(z / LAWN.CELL)));
  if (!c || !c.thick.length) return false;
  for (let k = 0; k < c.thick.length; k += 2) if (Math.abs(c.thick[k] - x) < 2.6 && Math.abs(c.thick[k + 1] - z) < 2.6) return true;
  return false;
}

function cellsNear (x, z, r, fn) {
  const C = LAWN.CELL;
  for (let i = Math.floor((x - r) / C); i <= Math.floor((x + r) / C); i++)
    for (let j = Math.floor((z - r) / C); j <= Math.floor((z + r) / C); j++) {
      const c = CELLS.get(key(i, j));
      if (c) fn(c);
    }
}
function knock (c, it, nx, nz, force, quiet) {
  it.down = 1; c.down++; DOWN.add(it.key); ST.down++; DIRTY = true;
  const lo = low();
  for (const [px, pz] of it.pts) A.debris(px, pz, nx, nz, force, it.hex, lo ? 2 : 4, it.kind);
  if (!quiet && A.Snd) A.Snd.fx('smash', s => s.noise(0.15, it.kind === 'sand' || it.kind === 'trash' ? 0.12 : 0.2), null, it.kind === 'sand' || it.kind === 'trash' ? 0.6 : 1);
}

/* машина: сносит мелочь быстрее 9 км/ч (game.js — рядом с дворовой мелочью). → во сколько скорость */
export function car (noseX, noseZ, tailX, tailZ, rc, vf, vx, vz) {
  if (!A || Math.abs(vf) <= LAWN.SLOW) return 1;
  let k = 1;
  const l = Math.hypot(vx, vz) || 1;
  cellsNear((noseX + tailX) / 2, (noseZ + tailZ) / 2, 6, c => {
    for (const it of c.items) {
      if (it.down || it.hid || it.solid) continue;
      if (Math.abs(it.x - noseX) > 10 || Math.abs(it.z - noseZ) > 10) continue;
      for (const [px, pz, pr] of it.pts) {
        if (Math.hypot(px - noseX, pz - noseZ) < pr + rc || Math.hypot(px - tailX, pz - tailZ) < pr + rc) {
          knock(c, it, vx / l, vz / l, Math.abs(vf));
          k *= it.slow || 0.96;
          break;
        }
      }
    }
  });
  return k;
}
/* взрыв рядом — сносит всё, кроме ракушек */
export function boom (x, z, r) {
  if (!A) return;
  cellsNear(x, z, r, c => {
    for (const it of c.items) {
      if (it.down || it.solid) continue;
      const d = Math.hypot(it.x - x, it.z - z);
      if (d < r) knock(c, it, (it.x - x) / (d || 1), (it.z - z) / (d || 1), 20, true);
    }
  });
}
/* новая смена — всё стоит снова */
export function reset () {
  DOWN.clear(); ST.down = 0; DIRTY = true; CLAIMS = null;
  for (const c of CELLS.values()) { c.down = 0; for (const it of c.items) { it.down = it.ed ? 1 : 0; c.down += it.down; } }
}
/* ракушки — твёрдые, как стена (game.js: столкновения кузова; формат — как obb) */
const S_LIST = [];
export function withSolids (list, x, z) {
  if (!A) return list;
  S_LIST.length = 0;
  cellsNear(x, z, 4, c => {
    for (const s of c.sol) {
      if (c.items[s.own].hid || c.items[s.own].ed || Math.abs(s.cx - x) > 6 || Math.abs(s.cz - z) > 6) continue;
      S_LIST.push(s);
    }
  });
  return S_LIST.length ? list.concat(S_LIST) : list;
}

/* ── редактор города (editlayer.js): что стоит у точки; список «убрать» поменялся — пометить заново ── */
const EDP = {
  list (x, z, r) {
    const out = [];
    cellsNear(x, z, r, c => { for (const it of c.items) if (!it.ed && Math.hypot(it.x - x, it.z - z) <= r) out.push({ sub: it.kind, x: it.x, z: it.z }); });
    return out;
  },
  refresh (x, z, r = 1) {
    if (!A) return;
    const redo = c => {
      c.down = 0;
      for (const it of c.items) { it.ed = EDL.gone('lawn', it.x, it.z) ? 1 : 0; it.down = it.ed || DOWN.has(it.key) ? 1 : 0; c.down += it.down; }
    };
    if (x === undefined) for (const c of CELLS.values()) redo(c);
    else cellsNear(x, z, r + 1, redo);
    DIRTY = true;
  },
  /* клетка у точки собрана (npm run check) */
  warm (x, z) {
    if (!A) return;
    const i = Math.floor(x / LAWN.CELL), j = Math.floor(z / LAWN.CELL);
    if (CELLS.has(key(i, j)) || (BUILDING && BUILDING.k === key(i, j))) return;
    const g = buildCell(i, j);
    while (!g.next().done);
  },
  has (x, z, r) {
    EDP.warm(x, z);
    let n = 0;
    cellsNear(x, z, r, c => { for (const it of c.items) if (!it.ed && Math.hypot(it.x - x, it.z - z) <= r) n++; });
    return n;
  },
};

export const DEBUG = {
  LAWN, CELLS, MESH, DOWN,
  get stats () {
    const kinds = {};
    for (const c of CELLS.values()) for (const it of c.items) kinds[it.kind] = (kinds[it.kind] || 0) + 1;
    return { cells: CELLS.size, built: ST.built, dropped: ST.dropped, inst: { ...ST.n }, items: kinds, shown: { ...ST.shown }, down: ST.down,
      refresh: ST.refresh, refMs: ST.refMs, msTotal: Math.round(ST.ms), msMax: Math.round(ST.msMax * 10) / 10, avgMs: ST.built ? Math.round(ST.ms / ST.built * 100) / 100 : 0, season: season() };
  },
  warm: (x, z, R = 120) => { while (ensure(x, z, R, 1000)); return CELLS.size; },
  /* ближайшая вещь вида kind к точке: { x, z, d } */
  nearest (kind, x, z) {
    let best = null;
    for (const c of CELLS.values()) for (const it of c.items) if (it.kind === kind && !it.down) { const d = Math.hypot(it.x - x, it.z - z); if (!best || d < best.d) best = { x: it.x, z: it.z, d: Math.round(d) }; }
    return best;
  },
  reset, car, withSolids,
};
