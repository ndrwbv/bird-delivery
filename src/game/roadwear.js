/* ──────────────────────────────────────────────────────────────────────────
   Асфальт улиц разный (Д6, docs/CAREER.md → «Город: как выглядит» → «Асфальт»).

   Пять видов полотна — у каждой улицы свой, по имени улицы и куску города
   (клетка SECT м): длинная улица меняется кусками, но от запуска к запуску
   та же. Без имени (дворовые проезды) — по месту.
     fresh   — свежий: тёмный, ровный, почти без зерна;
     smooth  — ровный серый (отремонтированный давно);
     patched — в заплатках: серый, по нему тёмные прямоугольники заплат,
               поперечные траншеи и отремонтированные полосы;
     old     — старый выцветший: светлый, пятнами, редкие трещины;
     broken  — разбитый: светлый, сетка трещин («крокодил»), много широких
               глубоких ям (ямы — cars.js, их тут только взвешиваем).
   Доли — по классу улицы (проспекты чаще свежие и ровные, дворовые проезды —
   старые и разбитые) и по району (частный сектор, гаражи, промка — хуже,
   особняки — лучше).

   Дёшево: новых объектов нет. Вид полотна — цвет-метка вершин (как плитка в
   world.js); заплатки и ямы разбитого — плоские многоугольники в той же
   склейке (LITM). Мелкий узор (пятна, зерно, трещины, «крокодил») — в шейдере
   статики по мировым x/z, только вблизи камеры (до 35—50 м) и только у
   заплатанного, старого и разбитого; шум — из маленькой текстуры. Дно ямы
   (цвет-метка, общий с cars.js) шейдер тоже узнаёт: в дождь вблизи там лужа.

     RW.init({ CITY, MAP, ENV })       — до osmRoads
     RW.roadHex(r)                     — цвет-метка полотна улицы
     RW.decorate(LITM, r, w, y, junc)  — заплатки на полотне (после ленты улицы)
     RW.wearMat(m)                     — материал статики: поверх сезонного
     RW.drawPots(LITM)                 — ямы разбитого (cars.js, при сборке города)
     RW.potAt(x, z)                    — колесо в яме разбитого? (cars.js: тряска)
     RW.potW(r), RW.kindOf(r)          — вес ям (cars.js), вид улицы
   ?nowear — как было (одинаковый асфальт, без заплаток).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import * as GFX from './gfx.js';

export const KINDS = ['fresh', 'smooth', 'patched', 'old', 'broken'];
export const WEAR = {
  // цвет-метка вершин = цвет полотна без шейдера (шейдер узнаёт улицу по нему)
  HEX: { fresh: '#575b62', smooth: '#8d929a', patched: '#9a9da2', old: '#b5b4af', broken: '#aba8a1' },
  PATCH: ['#6b6f75', '#878b91'],                 // заплатки: свежая тёмная и постарше (свои метки)
  // доли видов (fresh, smooth, patched, old, broken) по классу улицы
  P: {
    0: [42, 40, 13, 5, 0], 1: [40, 40, 14, 6, 0], 2: [30, 36, 20, 12, 2], 3: [18, 30, 25, 20, 7],
    4: [12, 25, 26, 25, 12], 5: [8, 18, 24, 30, 20], 7: [4, 10, 20, 34, 32],
  },
  // множители долей по району
  ZONE: {
    rich: [2.2, 1.5, 0.6, 0.35, 0.1], poor: [0.35, 0.6, 1.1, 1.4, 2.0], garage: [0.25, 0.5, 1.0, 1.4, 2.4],
    ind: [0.4, 0.7, 1.2, 1.3, 1.8], gang: [0.6, 0.8, 1.0, 1.2, 1.6], normal: [1, 1, 1, 1, 1],
  },
  SECT: 300,                                       // м: кусок улицы одного вида
  // заплаток на 100 м полотна
  PATCHES: { fresh: 0, smooth: 0.4, patched: 7, old: 1.5, broken: 2.5 },
  // вес ям-многоугольников (cars.js) по виду: на свежем нет, на ровном редко; на разбитом — свои (POTS)
  POT: { fresh: 0, smooth: 0.06, patched: 0.8, old: 1, broken: 1.2 },
  // ямы разбитого — многоугольники (drawPots): клетка CELL м, в доле P клеток (× F по куску SUPER клеток: чистый / обычный /
  // весь в ямах) яма радиусом R[0]…R[0]+R[1] м; от 0,75 м — глубокая (сильнее трясёт, роняет и подкидывает)
  POTS: { CELL: 6, SUPER: 5, P: 0.12, F: [0.35, 1, 1.9], R: [0.5, 0.8] },
};
export const DEBUG = { on: true, roads: {}, km: {}, patches: 0, ms: 0 };

const OFF = typeof location !== 'undefined' && new URLSearchParams(location.search).has('nowear');
if (OFF) DEBUG.on = false;

const strHash = (s, k = 0) => { let h = 2166136261 ^ k; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); h = Math.imul(h ^ (h >>> 15), 2246822507); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };
const rng = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let q = Math.imul(seed ^ (seed >>> 15), 1 | seed); q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q; return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };

let A = null, ZC = null;
const ZCELL = 120;

/* район клетки по домам вокруг (как zones.js, но до его init и без доната): частный сектор,
   гаражи, промка — по большинству домов в клетке и соседних; особняки и бандиты — круги из карты */
function zoneMap () {
  ZC = new Map();
  const add = (x, z, k) => {
    const ci = Math.floor(x / ZCELL), cj = Math.floor(z / ZCELL);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const key = i + ',' + j;
      let c = ZC.get(key);
      if (!c) ZC.set(key, c = { normal: 0, poor: 0, garage: 0, ind: 0 });
      c[k] += i === ci && j === cj ? 2 : 1;
    }
  };
  for (const b of A.CITY.buildings || []) {
    let cx = 0, cz = 0;
    for (const q of b.p) { cx += q[0] / b.p.length; cz += q[1] / b.p.length; }
    add(cx, cz, b.k === 'gar' ? 'garage' : b.k === 'ind' ? 'ind' : b.k === 'priv' || b.st === 'priv' ? 'poor' : 'normal');
  }
  for (const g of A.CITY.garlots || []) for (const q of g.p || []) add(q[0], q[1], 'garage');
}
function zoneAt (x, z) {
  const car = (A.MAP && A.MAP.career) || {};
  const inR = c => c && (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r || 300) ** 2;
  if (inR(car.rich)) return 'rich';
  for (const g of car.gang || []) if (inR(g)) return 'gang';
  const c = ZC.get(Math.floor(x / ZCELL) + ',' + Math.floor(z / ZCELL));
  if (!c) return 'normal';
  let best = 'normal', n = 0;
  for (const k in c) if (c[k] > n) { n = c[k]; best = k; }
  return best;
}

export function init (api) {
  A = api;
  if (OFF) return;
  zoneMap();
}

/* вид улицы: по имени и куску города (без имени — по месту), класс и район — доли */
export function kindOf (r) {
  if (r._wear !== undefined) return r._wear;
  let k = 'smooth';
  if (!OFF && A && !r.b && r.c !== 6 && WEAR.P[r.c]) {
    const m = r.p[(r.p.length / 2) | 0] || r.p[0];
    const sx = Math.floor(m[0] / WEAR.SECT), sz = Math.floor(m[1] / WEAR.SECT);
    const key = r.n ? r.n + '#' + sx + ',' + sz : Math.round(m[0]) + ',' + Math.round(m[1]);
    const zone = zoneAt(m[0], m[1]);
    const P = WEAR.P[r.c], Z = WEAR.ZONE[zone] || WEAR.ZONE.normal;
    let tot = 0;
    for (let i = 0; i < 5; i++) tot += P[i] * Z[i];
    let h = strHash(key, 11 + r.c) * tot;
    for (let i = 0; i < 5; i++) { h -= P[i] * Z[i]; if (h < 0) { k = KINDS[i]; break; } }
    let L = 0;
    for (let i = 1; i < r.p.length; i++) L += Math.hypot(r.p[i][0] - r.p[i - 1][0], r.p[i][1] - r.p[i - 1][1]);
    DEBUG.roads[k] = (DEBUG.roads[k] || 0) + 1;
    DEBUG.km[k] = Math.round(((DEBUG.km[k] || 0) + L / 1000) * 10) / 10;
  }
  r._wear = k;
  if (!OFF) for (let i = 1; i < r.p.length; i++) SEGR.set(segKey(r.p[i - 1][0], r.p[i - 1][1], r.p[i][0], r.p[i][1]), r);
  return k;
}
/* отрезок улицы (nearestRoad → seg) → улица: клин на стыке ширин (mapworks.js) — в цвет своей улицы */
const SEGR = new Map();
const segKey = (x1, z1, x2, z2) => ((x1 + x2) / 2).toFixed(1) + ',' + ((z1 + z2) / 2).toFixed(1);
export const segHex = (seg, fallback) => { const r = seg && SEGR.get(segKey(seg.x1, seg.z1, seg.x2, seg.z2)); return r ? roadHex(r, fallback) : fallback; };
export const roadHex = (r, fallback) => (OFF || r.b || r.c === 6 || !WEAR.P[r.c] ? fallback : WEAR.HEX[kindOf(r)]);
export const potW = r => (OFF ? 1 : WEAR.POT[kindOf(r)] ?? 1);

/* ── высоты внутри класса улицы (м над полотном класса; следующий класс — на 4 мм выше) ──
   Два полотна одного класса разного вида на одной высоте мерцали на стыке (кто сверху — решала
   точность глубины, кадр за кадром по-разному). Теперь у каждого вида своя ступенька RANK × номер
   вида (0—2,4 мм) + подступенька SLOT (0—0,45 мм, ниже), выше — клин на стыке ширин (mapworks.js, 3,2 мм) и
   заплатки (3,5 и 3,7 мм — по цвету) */
export const WEAR_Y = { RANK: 0.0006, SLOT: 0.00015, WEDGE: 0.0032, PATCH: 0.0035 };
const KRANK = { fresh: 0, smooth: 1, patched: 2, old: 3, broken: 4 };
export const rankY = r => (OFF ? 0 : (KRANK[kindOf(r)] ?? 1) * WEAR_Y.RANK + (SLOT.get(r) || 0) * WEAR_Y.SLOT);
/* Две улицы одного класса и вида, сходящиеся в узле, у которых конец перекрашен плавно (jointGrad), лежали на одной
   высоте, а цвет у каждой тянется вдоль своей оси — внахлёст за краем узла цвета расходились, и стык мерцал (О3,
   09.10.2026). Таким улицам — разные подступеньки SLOT (0; 0,15; 0,3; 0,45 мм — ниже ступеньки вида 0,6 мм):
   раскраска графа «внахлёст у перекрашенного конца» жадно, в четыре цвета */
const SLOT = new Map();
function slotJoints (widthOf) {
  SLOT.clear();
  if (!JOINT.size) return;
  // отрезки улиц того же класса и вида — по клеткам 20 м
  const key = r => r.c + ':' + kindOf(r), CS = 20, G = new Map();
  for (const r of A.CITY.roads) {
    if (r.b || r.c === 6 || !WEAR.P[r.c]) continue;
    for (let i = 1; i < r.p.length; i++) {
      const a = r.p[i - 1], b = r.p[i];
      for (let gx = Math.floor(Math.min(a[0], b[0]) / CS); gx <= Math.floor(Math.max(a[0], b[0]) / CS); gx++)
        for (let gz = Math.floor(Math.min(a[1], b[1]) / CS); gz <= Math.floor(Math.max(a[1], b[1]) / CS); gz++) {
          const k = gx + ',' + gz; let L = G.get(k); if (!L) G.set(k, L = []); L.push([r, a, b]);
        }
    }
  }
  // соседи: улица того же класса и вида проходит ближе (переход + полуширины) к узлу, где у одной из них
  // конец перекрашен, — их полотна там внахлёст (и в общем узле, и на развязках, где узлы разные)
  const NB = new Map(), link = (a, b) => { if (!NB.has(a)) NB.set(a, new Set()); NB.get(a).add(b); };
  for (const [r, J] of JOINT) for (const j of J) {
    const k0 = key(r);
    for (let gx = Math.floor((j.N[0] - 40) / CS); gx <= Math.floor((j.N[0] + 40) / CS); gx++)
      for (let gz = Math.floor((j.N[1] - 40) / CS); gz <= Math.floor((j.N[1] + 40) / CS); gz++)
        for (const [o, a, b] of G.get(gx + ',' + gz) || []) {
          if (o === r || key(o) !== k0 || (NB.get(r) && NB.get(r).has(o))) continue;
          if (segD(j.N[0], j.N[1], a, b) < j.d1 + j.hw + widthOf(o) / 2 + 1) { link(r, o); link(o, r); }
        }
  }
  for (const [r, nb] of NB) {
    const used = new Set();
    for (const o of nb) if (SLOT.has(o)) used.add(SLOT.get(o));
    let s = 0; while (used.has(s) && s < 3) s++;
    SLOT.set(r, s);
  }
  DEBUG.slots = [...SLOT.values()].filter(v => v > 0).length;
}
/* отладка (probe): улицы у точки — класс, вид, высота внутри класса, переходы на концах */
DEBUG.at = (x, z, R = 15) => (A ? A.CITY.roads : []).filter(r => r.p.some((q, i) => i && segD(x, z, r.p[i - 1], q) < R)).map(r => ({
  c: r.c, kind: kindOf(r), slot: SLOT.get(r) || 0, rank: +(rankY(r) * 1000).toFixed(2), hex: roadHex(r), n: r.p.length,
  ends: [r.p[0], r.p[r.p.length - 1]].map(q => q.map(Math.round)), joints: (JOINT.get(r) || []).map(j => ({ N: j.N.map(Math.round), d0: +j.d0.toFixed(1), d1: +j.d1.toFixed(1) })) }));
const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)); return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z); };

/* ── заплатки ──
   Прямоугольники свежего асфальта вдоль полотна (в колее), поперечные траншеи во
   всю ширину и длинные отремонтированные полосы в полосу шириной. Не ближе 10 м к
   перекрёстку (там чужое полотно выше) и к концам улицы. y — высота ленты улицы */
export function decorate (M, r, w, y, junc) {
  if (OFF || r.b || r.c === 6 || !WEAR.P[r.c]) return;
  const kind = kindOf(r), dens = WEAR.PATCHES[kind];
  if (!dens) return;
  const t0 = performance.now();
  const p = r.p, m = p[(p.length / 2) | 0];
  const R = rng(Math.round(m[0] * 13.1 + m[1] * 7.7) ^ 0x5bd1);
  // расстояния вдоль улицы: концы и перекрёстки — запретные
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const L = cum[cum.length - 1];
  if (L < 24) return;
  const bad = [0, L];
  for (let i = 1; i < p.length - 1; i++) if (junc(p[i][0], p[i][1])) bad.push(cum[i]);
  const free = d => bad.every(b => Math.abs(d - b) > 10 + w / 2);
  const at = d => {
    let i = 1;
    while (i < p.length - 1 && cum[i] < d) i++;
    const l = cum[i] - cum[i - 1] || 1, t = (d - cum[i - 1]) / l;
    const ux = (p[i][0] - p[i - 1][0]) / l, uz = (p[i][1] - p[i - 1][1]) / l;
    return { x: p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, z: p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t, ux, uz, i };
  };
  const lift = y - rankY(r) + WEAR_Y.PATCH, hw = w / 2 - 0.35;
  const n = Math.round(L / 100 * dens * (0.6 + R() * 0.8));
  for (let q = 0; q < n; q++) {
    const d = 10 + R() * (L - 20);
    const v = R();
    // вид: 0 — прямоугольник в колее, 1 — траншея поперёк, 2 — длинная полоса
    const sort = kind === 'patched' ? (v < 0.66 ? 0 : v < 0.9 ? 1 : 2) : (v < 0.8 ? 0 : 1);
    let len = sort === 0 ? 1.4 + R() * 4.5 : sort === 1 ? 0.6 + R() * 0.8 : 9 + R() * 22;
    if (!free(d) || !free(d + len) || d + len > L - 10) continue;
    const a = at(d), b = at(d + len);
    if (a.i !== b.i) continue;                              // через излом не кладём: прямоугольник ляжет мимо
    const nx = -a.uz, nz = a.ux;
    let o0, o1;
    if (sort === 1) { o0 = -hw; o1 = hw; }
    else {
      const ww = sort === 0 ? Math.min(hw * 2, 0.9 + R() * 1.8) : Math.min(hw, 2.6 + R() * 0.8);
      const c = (R() * 2 - 1) * (hw - ww / 2);
      o0 = c - ww / 2; o1 = c + ww / 2;
    }
    const j = () => (R() - 0.5) * 0.12;
    const P = [[a.x + nx * o0 + j(), a.z + nz * o0 + j()], [b.x + nx * o0 + j(), b.z + nz * o0 + j()],
               [b.x + nx * o1 + j(), b.z + nz * o1 + j()], [a.x + nx * o1 + j(), a.z + nz * o1 + j()]];
    // высота — по цвету заплатки (0,2 мм): две заплатки одного цвета внахлёст — одно пятно, разного — на разной
    // высоте. До 09.10.2026 высота шла по номеру (q % 3), и заплатки разного цвета на одной высоте мерцали (О3)
    const pc = R() < (kind === 'patched' ? 0.55 : 0.35) ? 0 : 1;
    M.color(WEAR.PATCH[pc]);
    M.poly(P, lift + pc * 0.0002);
    DEBUG.patches++;
  }
  DEBUG.ms += performance.now() - t0;
}

/* ── плавный стык разных видов асфальта ──
   Где улица кончается в узле, а там другая улица того же или старшего класса другого вида, конец
   улицы перекрашивается плавно: от цвета «главного» полотна в узле к своему на BLEND_M м, начиная от
   края узла (у младшей улицы — от края старшей). Главный цвет: сквозная улица старшего класса, иначе —
   среднее всех, кто кончается в узле на этом классе (два конца встык — оба тянутся к среднему, стык
   ~5 м). Перекрашивается само полотно (цвет вершин, Mesher.grad; в полотно добавлены точки на краю
   перехода) — второго слоя нет, а в узле, где полотна лежат друг на друге, у всех один цвет:
   перекрытие не видно, даже когда вдали точности глубины не хватает */
const BLEND_M = 2.5;
const CLIN = new THREE.Color();
const linB = hex => { CLIN.set(hex); return [Math.round(CLIN.r * 255), Math.round(CLIN.g * 255), Math.round(CLIN.b * 255)]; };   // как Mesher кладёт цвет
const JOINT = new Map();                              // улица → концы с переходом: { N, ux, uz, d0, d1, dom }
/* до полотна (game.js): найти концы улиц, которым нужен переход */
export function prepJoints (widthOf) {
  JOINT.clear();
  if (OFF || !A) return 0;
  const t0 = performance.now();
  const ok = r => !r.b && r.c !== 6 && WEAR.P[r.c];
  const at = new Map();
  for (const r of A.CITY.roads) {
    if (!ok(r)) continue;
    const L = r.p.length;
    for (let i = 0; i < L; i++) {
      const k = r.p[i][0] + ',' + r.p[i][1];
      let a = at.get(k);
      if (!a) at.set(k, a = []);
      a.push({ r, i, end: i === 0 || i === L - 1 });
    }
  }
  let n = 0;
  for (const a of at.values()) {
    if (a.length < 2) continue;
    for (const e of a) {
      if (!e.end) continue;
      const r = e.r, own = linB(roadHex(r));
      const others = a.filter(o => o.r !== r && o.r.c <= r.c);
      if (!others.length) continue;
      const cMin = Math.min(...others.map(o => o.r.c));
      const top = others.filter(o => o.r.c === cMin), thru = top.find(o => !o.end);
      let dom;
      if (thru) dom = linB(roadHex(thru.r));
      else {
        const all = top.map(o => linB(roadHex(o.r)));
        if (r.c === cMin) all.push(own);
        dom = [0, 1, 2].map(c => Math.round(all.reduce((q, v) => q + v[c], 0) / all.length));
      }
      if (dom[0] === own[0] && dom[1] === own[1] && dom[2] === own[2]) continue;
      const p = r.p, N = p[e.i], Q = p[e.i === 0 ? 1 : p.length - 2];
      const Ls = Math.hypot(Q[0] - N[0], Q[1] - N[1]);
      if (Ls < 1) continue;
      const w = widthOf(r);
      const d0 = Math.min(Math.max(0, Math.max(r.c === cMin ? w : 0, ...top.map(o => widthOf(o.r))) / 2 - 0.3), Ls * 0.3);
      const d1 = Math.min(d0 + BLEND_M, Ls * 0.48);
      if (d1 < d0 + 0.3) continue;
      let J = JOINT.get(r);
      if (!J) JOINT.set(r, J = []);
      J.push({ N, ux: (Q[0] - N[0]) / Ls, uz: (Q[1] - N[1]) / Ls, d0, d1, dom, own, first: e.i === 0, hw: w / 2 });
      n++;
    }
  }
  DEBUG.joints = n;
  slotJoints(widthOf);
  DEBUG.ms += performance.now() - t0;
  return n;
}
/* точки полотна с добавленными краями перехода: [[x, z, исходная?]…] (null — переходов нет) */
export function jointPts (r) {
  const J = JOINT.get(r);
  if (!J) return null;
  const out = r.p.map(q => [q[0], q[1], 1]);
  const ins = (j, idx, dir) => {                      // dir 1 — от начала, -1 — от конца
    const add = [j.d0, j.d1].filter(d => d > 0.05).map(d => [j.N[0] + j.ux * d, j.N[1] + j.uz * d, 0]);
    if (dir > 0) out.splice(idx + 1, 0, ...add); else out.splice(idx, 0, ...add.reverse());
  };
  const last = J.find(j => !j.first), first = J.find(j => j.first);
  if (last) ins(last, out.length - 1, -1);
  if (first) ins(first, 0, 1);
  return out;
}
/* цвет вершины по месту (Mesher.grad): у конца с переходом — от главного к своему */
export function jointGrad (r) {
  const J = JOINT.get(r);
  if (!J) return null;
  const own = J[0].own;
  return (x, z, c, i) => {
    let R = own[0], G = own[1], B = own[2];
    for (const j of J) {
      const d = (x - j.N[0]) * j.ux + (z - j.N[1]) * j.uz;
      if (d >= j.d1) continue;
      // только у самого узла: на изогнутой улице точка далеко позади узла тоже давала d < d1 и красилась
      // в цвет узла посреди улицы — пятно чужого цвета внахлёст с соседней улицей мерцало (О3)
      if (Math.hypot(x - j.N[0], z - j.N[1]) > j.d1 + j.hw + 0.5) continue;
      const t = Math.max(0, (d - j.d0) / (j.d1 - j.d0));
      R = Math.round(j.dom[0] + (own[0] - j.dom[0]) * t); G = Math.round(j.dom[1] + (own[1] - j.dom[1]) * t); B = Math.round(j.dom[2] + (own[2] - j.dom[2]) * t);
    }
    c[i] = R; c[i + 1] = G; c[i + 2] = B;
  };
}

/* ── ямы разбитого асфальта: плоские многоугольники в статике города (drawPots — один раз при
   сборке, видеокарте почти бесплатно); раскладка — целочисленный хеш по клеткам, по той же
   раскладке трясёт машину (potAt → cars.js): где нарисована яма — там и трясёт ── */
const PC = WEAR.POTS.CELL, PS = WEAR.POTS.SUPER, PP = WEAR.POTS.P, PF = WEAR.POTS.F, PR = WEAR.POTS.R;
const PH = (cx, cz, s) => { let h = Math.imul(cx + 100000, 0x8da6b343) ^ Math.imul(cz + 100000, 0xd8163841) ^ Math.imul(s, 0xcb1ab31f); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return h >>> 0; };
const PF01 = h => (h & 0xffffff) / 16777216;
const fl = v => Number(v).toFixed(4);                // число в GLSL — всегда с точкой
const POTC = new Map();
/* яма клетки (cx, cz) или null: центр, радиус */
function potCell (cx, cz) {
  let sf = PF01(PH(Math.floor(cx / PS), Math.floor(cz / PS), 7));
  sf = sf < 0.3 ? PF[0] : sf < 0.8 ? PF[1] : PF[2];
  if (PF01(PH(cx, cz, 3)) >= PP * sf) return null;
  const r = PR[0] + PF01(PH(cx, cz, 5)) * PR[1], span = PC - 2 * r - 0.6;
  return { x: (cx + 0.5) * PC + (PF01(PH(cx, cz, 11)) - 0.5) * span, z: (cz + 0.5) * PC + (PF01(PH(cx, cz, 13)) - 0.5) * span, r };
}
/* разбитая улица под точкой (не ближе 0,2 м к краю полотна) или null */
const brokenAt = (x, z) => {
  const q = A.nearestRoad(x, z, 7, 1);
  if (!q || q.d >= q.seg.w / 2 - 0.2) return null;
  const r = SEGR.get(segKey(q.seg.x1, q.seg.z1, q.seg.x2, q.seg.z2));
  return r && r._wear === 'broken' ? r : null;
};
/* колесо в яме разбитого асфальта? → { key, x, z, r, deep } или null (cars.js: трясёт, роняет, подкидывает) */
export function potAt (x, z) {
  if (OFF || !A || !A.nearestRoad) return null;
  const cx = Math.floor(x / PC), cz = Math.floor(z / PC), p = potCell(cx, cz);
  if (!p || (x - p.x) ** 2 + (z - p.z) ** 2 > (p.r * 0.9) ** 2) return null;
  const key = cx * 131071 + cz;
  let ok = POTC.get(key);
  if (ok === undefined) POTC.set(key, ok = !!brokenAt(p.x, p.z));
  return ok ? { key, x: p.x, z: p.z, r: p.r, deep: p.r > 0.75 ? 1 : 0 } : null;
}
/* все ямы разбитых улиц: обход полотна шагом 2 м вдоль (и 6 м за концы) и 1,5 м поперёк (±6 м) —
   ни одна клетка, где potAt найдёт яму, не пропущена */
function brokenPots () {
  const seen = new Set(), out = [];
  for (const r of A.CITY.roads) {
    if (r._wear !== 'broken') continue;
    for (let i = 1; i < r.p.length; i++) {
      const [x1, z1] = r.p[i - 1], [x2, z2] = r.p[i], L = Math.hypot(x2 - x1, z2 - z1) || 1, ux = (x2 - x1) / L, uz = (z2 - z1) / L;
      for (let t = -6; t <= L + 6; t += 2) for (let o = -6; o <= 6; o += 1.5) {
        const x = x1 + ux * t - uz * o, z = z1 + uz * t + ux * o;
        const cx = Math.floor(x / PC), cz = Math.floor(z / PC), k = cx * 131071 + cz;
        if (seen.has(k)) continue;
        seen.add(k);
        const p = potCell(cx, cz);
        if (!p) continue;
        const rr = brokenAt(p.x, p.z);
        POTC.set(k, !!rr);
        if (rr) out.push({ ...p, c: rr.c });
      }
    }
  }
  return out;
}
/* цвета ямы: выкрошенный край светлее полотна, стенка (со стороны света светлее), тёмное дно —
   цвет-метка дна, как у ям cars.js: в дождь вблизи шейдер кладёт туда лужу */
const POTHEX = { rim: '#cdc9c1', lit: '#8c8a84', wall: '#55534e', bottom: '#323339' };
/* ямы разбитого асфальта — в статику (cars.js buildPotholes, вместе со своими ямами) */
export function drawPots (M) {
  if (OFF || !A || !A.nearestRoad) return 0;
  const t0 = performance.now(), K = 9, j = new Array(K);
  const pots = brokenPots();
  for (const p of pots) {
    const R = rng((Math.round(p.x * 31.7) * 7919) ^ Math.round(p.z * 17.3) ^ 0x7a3);
    const a0 = R() * Math.PI * 2, lift = 0.206 + (7 - p.c) * 0.001;
    for (let i = 0; i < K; i++) j[i] = 0.9 + R() * 0.2;    // рваный край: у всех колец одна форма — вложены друг в друга
    const ring = (s, ox, oz) => j.map((v, i) => { const a = a0 + i / K * Math.PI * 2; return [p.x + ox * p.r + Math.cos(a) * p.r * s * v, p.z + oz * p.r + Math.sin(a) * p.r * s * v]; });
    M.color(POTHEX.rim); M.poly(ring(1.22, 0, 0), lift);                    // выкрошенный край
    M.color(POTHEX.lit); M.poly(ring(1, -0.048, -0.064), lift + 0.006);     // стенка на свету (свет — с (-0,6, -0,8))
    M.color(POTHEX.wall); M.poly(ring(0.94, 0.024, 0.032), lift + 0.012);   // стенка в тени
    M.color(POTHEX.bottom); M.poly(ring(0.66, 0.02, 0.03), lift + 0.018);   // дно, в дождь — лужа
  }
  DEBUG.pots = pots.length; DEBUG.potsDeep = pots.filter(p => p.r > 0.75).length;
  DEBUG.ms += performance.now() - t0;
  return pots.length;
}
/* сколько ям на разбитых улицах (для проверки) */
export function countPots () {
  const P = brokenPots();
  return { n: P.length, deep: P.filter(p => p.r > 0.75).length, perKm: Math.round(P.length / Math.max(1, DEBUG.km.broken || 1)) };
}

DEBUG.potAt = (x, z) => potAt(x, z); DEBUG.potCell = potCell; DEBUG.countPots = () => countPots();

/* ── текстуры для шейдера (считаются один раз, при сборке шейдера) ──
   Шум: NT×NT точек, NC×NC клеток гладкого шума (как sNoise сезонов, но без синусов в кадре —
   видеокарта просто читает текстуру), 4 независимых шума в r, g, b, a; повторяется через NC клеток.
   «Крокодил»: расстояние до края ячейки Вороного, N×N ячеек по CELL м, по T точек на ячейку,
   повтор через N·CELL = 25,6 м (сдвиг трещин его прячет), 0…MAXE м в байт. Между точками
   видеокарта смешивает линейно и на самом краю до нуля не доходит (до полточки) — FIX.
   Раньше ячейки считались циклом 3×3 прямо в шейдере: видеокарте это стоило ~+5 мс со
   сглаживанием даже там, где крокодила нет, — шейдер статики общий для всего города */
const NZ = { NT: 256, NC: 32 };
const CROC = { CELL: 0.8, N: 32, T: 32, MAXE: 0.25, FIX: 0.01 };
let NZ_TEX = null, CROC_TEX = null;
const dataTex = (data, S, fmt) => {
  const t = new THREE.DataTexture(data, S, S, fmt, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
};
function noiseTex () {
  if (NZ_TEX) return NZ_TEX;
  const { NT, NC } = NZ, R = rng(0x5e1d), lat = new Float32Array(NC * NC * 4), data = new Uint8Array(NT * NT * 4);
  for (let i = 0; i < lat.length; i++) lat[i] = R();
  const sm = f => f * f * (3 - 2 * f), L = (x, y, c) => lat[(((y + NC) % NC) * NC + (x + NC) % NC) * 4 + c];
  for (let ty = 0; ty < NT; ty++) for (let tx = 0; tx < NT; tx++) {
    const vx = tx * NC / NT, vy = ty * NC / NT, ix = Math.floor(vx), iy = Math.floor(vy), fx = sm(vx - ix), fy = sm(vy - iy);
    for (let c = 0; c < 4; c++) {
      const a = L(ix, iy, c) + (L(ix + 1, iy, c) - L(ix, iy, c)) * fx, b = L(ix, iy + 1, c) + (L(ix + 1, iy + 1, c) - L(ix, iy + 1, c)) * fx;
      data[(ty * NT + tx) * 4 + c] = Math.round((a + (b - a) * fy) * 255);
    }
  }
  return (NZ_TEX = dataTex(data, NT, THREE.RGBAFormat));
}
function crocTex () {
  if (CROC_TEX) return CROC_TEX;
  const { N, T, MAXE } = CROC, S = N * T, R = rng(0x21c0c);
  const ox = new Float32Array(N * N), oz = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) { ox[i] = R() * 0.8 + 0.1; oz[i] = R() * 0.8 + 0.1; }
  const data = new Uint8Array(S * S);
  for (let ty = 0; ty < S; ty++) {
    const vy = (ty + 0.5) / T, cy = Math.floor(vy), fy = vy - cy;
    for (let tx = 0; tx < S; tx++) {
      const vx = (tx + 0.5) / T, cx = Math.floor(vx), fx = vx - cx;
      let d1 = 9, d2 = 9;
      for (let y = -1; y <= 1; y++) {
        const row = ((cy + y + N) % N) * N;
        for (let x = -1; x <= 1; x++) {
          const k = row + (cx + x + N) % N, dx = x + ox[k] - fx, dz = y + oz[k] - fy, dd = dx * dx + dz * dz;   // квадраты: корень — только двум ближним
          if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
        }
      }
      data[ty * S + tx] = Math.min(255, Math.round((Math.sqrt(d2) - Math.sqrt(d1)) * CROC.CELL * 0.5 / MAXE * 255));
    }
  }
  return (CROC_TEX = dataTex(data, S, THREE.RedFormat));
}

/* ── шейдер: мелкие детали полотна — только вблизи (до NEAR[0] м полностью, к NEAR[1] гаснут, дальше —
   ранний выход, только цвет вершин). Свежий, ровный и заплатки — сразу только цвет. В заплатках,
   старом и разбитом: пятна выцветания и зерно щебня; в старом и разбитом — трещины местами, в разбитом
   на высокой — сетка «крокодил». Лужи на дне ям — только в дождь и вблизи ── */
const NEAR = [35, 50];
const CB = new THREE.Color();
const lin = hex => { CB.set(hex); return new THREE.Vector3(Math.round(CB.r * 255) / 255, Math.round(CB.g * 255) / 255, Math.round(CB.b * 255) / 255); };
const nz = k => fl(k / NZ.NC);                          // частота шума (клеток на метр) → координата текстуры
const RW_GLSL = `
{
  vec3 wc = vColor.rgb, wd;
  float wk = -1.0;
  wd = abs(wc - uRwT[0]); if (max(wd.r, max(wd.g, wd.b)) < 0.0022) wk = 2.0;   // в заплатках
  wd = abs(wc - uRwT[1]); if (max(wd.r, max(wd.g, wd.b)) < 0.0022) wk = 3.0;   // старый
  wd = abs(wc - uRwT[2]); if (max(wd.r, max(wd.g, wd.b)) < 0.0022) wk = 4.0;   // разбитый
  wd = abs(wc - uRwT[3]); if (max(wd.r, max(wd.g, wd.b)) < 0.0022) wk = 9.0;   // дно ямы
  if (wk >= 0.0) {
    vec2 q = vSW.xz;
    float near = 1.0 - smoothstep(${fl(NEAR[0])}, ${fl(NEAR[1])}, distance(q, cameraPosition.xz));
    if (wk > 8.0) {
      // дно ямы: в дождь вблизи — лужа, светлая от неба
      if (uRwRain > 0.0 && near > 0.0) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.38, 0.45), uRwRain * near);
    } else if (near > 0.0) {
      float fw = max(fwidth(q.x), fwidth(q.y));                 // метров на точку экрана
      vec4 n0 = textureLod(uRwN, q * ${nz(0.05)} + wk * 0.31, 0.0);   // r — пятна 10—30 м, g — где трещины (~20—40 м)
      float amp = wk < 2.5 ? 0.08 : wk < 3.5 ? 0.13 : 0.05;
      float grain = (sHash(floor(q * 6.0)) - 0.5) * 0.09 * (1.0 - smoothstep(0.05, 0.13, fw));   // зерно щебня ~17 см
      vec3 c = diffuseColor.rgb * (1.0 + ((n0.r - 0.5) * amp * 2.0 + grain) * near);
      if (wk > 2.5 && uRwLo < 0.5) {
        float mk = smoothstep(wk > 3.5 ? 0.3 : 0.52, wk > 3.5 ? 0.45 : 0.7, n0.g);
        if (mk > 0.0) {
          // трещины: линия уровня шума, извилистая от сдвига qw, с разрывами
          vec4 n1 = textureLod(uRwN, q * ${nz(0.7)}, 0.0);
          vec2 qw = q + (n1.rg - 0.5) * 0.7;
          float nc = textureLod(uRwN, qw * ${nz(0.3)}, 0.0).b;
          float f1 = fwidth(nc), w1 = 0.007;
          float cr = (1.0 - smoothstep(w1, w1 + f1, abs(nc - 0.5))) * (1.0 - smoothstep(w1, w1 * 5.0, f1)) * mk;
          cr *= smoothstep(0.28, 0.45, n1.b);
          float ak = wk > 3.5 ? smoothstep(0.55, 0.75, mk) : 0.0;
          if (ak > 0.0 && uRwQ > 0.5 && fw < 0.06) {
            // разбитый, высокая графика: сетка «крокодил» ~${fl(CROC.CELL)} м пятнами (текстура crocTex)
            float edge = textureLod(uRwCroc, qw * ${fl(1 / (CROC.CELL * CROC.N))}, 0.0).r * ${fl(CROC.MAXE)} - ${fl(CROC.FIX)};
            float al = (1.0 - smoothstep(0.012, 0.012 + fw, edge)) * (1.0 - smoothstep(0.025, 0.06, fw));
            cr = max(cr, al * ak);
            c *= 1.0 - 0.06 * ak;                                         // в сетке трещин асфальт темнее и грязнее
          }
          c *= 1.0 - 0.3 * cr * near;
        }
      }
      diffuseColor.rgb = c;
    }
  }
}`;
/* низкая чёткость — без трещин; «крокодил» — только на высокой (как краска газона, gfx.js DETAIL.lawn) */
const uRwLo = { get value () { try { return GFX.pixelShort() < 480 ? 1 : 0; } catch (e) { return 0; } } };
const uRwQ = { get value () { try { return GFX.detail().lawn ? 1 : 0; } catch (e) { return 1; } } };
const uRwRain = { get value () { try { return Math.min(1, ((A && A.ENV && A.ENV.rain) || 0) * 1.3); } catch (e) { return 0; } } };   // ENV в игре объявлен после сборки города

export function wearMat (m) {
  if (OFF) return m;
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
  const uRwT = { value: [lin(WEAR.HEX.patched), lin(WEAR.HEX.old), lin(WEAR.HEX.broken), lin(POTHEX.bottom)] };
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    if (!/sHash/.test(sh.fragmentShader) || !/vSW/.test(sh.fragmentShader)) return;   // без сезонного шейдера — как было
    Object.assign(sh.uniforms, { uRwT, uRwLo, uRwQ, uRwRain, uRwN: { value: noiseTex() }, uRwCroc: { value: crocTex() } });
    sh.fragmentShader = 'uniform vec3 uRwT[4];\nuniform float uRwLo, uRwQ, uRwRain;\nuniform sampler2D uRwN, uRwCroc;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + RW_GLSL);
  };
  m.customProgramCacheKey = () => key + 'wear';
  return m;
}
