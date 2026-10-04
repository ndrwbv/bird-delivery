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
   world.js), узор — в шейдере статики по мировым x/z; заплатки — плоские
   многоугольники в той же склейке (LITM). Дно ямы (цвет из cars.js) шейдер
   тоже узнаёт: в дождь и в сырой сезон там лужа.

     RW.init({ CITY, MAP, ENV })       — до osmRoads
     RW.roadHex(r)                     — цвет-метка полотна улицы
     RW.decorate(LITM, r, w, y, junc)  — заплатки на полотне (после ленты улицы)
     RW.wearMat(m)                     — материал статики: поверх сезонного
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
  // ямы разбитого — в шейдере: клетка CELL м, в доле P клеток (× F по куску SUPER клеток: чистый / обычный /
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
  const lift = y + 0.004, hw = w / 2 - 0.35;
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
    M.color(WEAR.PATCH[R() < (kind === 'patched' ? 0.55 : 0.35) ? 0 : 1]);
    M.poly(P, lift + q * 0.00002);
    DEBUG.patches++;
  }
  DEBUG.ms += performance.now() - t0;
}

/* ── ямы разбитого асфальта: рисует шейдер, раскладка — целочисленный хеш, одинаковый в JS и GLSL ── */
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
const onBroken = (x, z) => {
  const q = A.nearestRoad(x, z, 7, 1);
  return !!q && q.d < q.seg.w / 2 - 0.2 && SEGR.has(segKey(q.seg.x1, q.seg.z1, q.seg.x2, q.seg.z2)) && SEGR.get(segKey(q.seg.x1, q.seg.z1, q.seg.x2, q.seg.z2))._wear === 'broken';
};
/* колесо в яме разбитого асфальта? → { key, x, z, r, deep } или null (cars.js: трясёт, роняет, подкидывает) */
export function potAt (x, z) {
  if (OFF || !A || !A.nearestRoad) return null;
  const cx = Math.floor(x / PC), cz = Math.floor(z / PC), p = potCell(cx, cz);
  if (!p || (x - p.x) ** 2 + (z - p.z) ** 2 > (p.r * 0.9) ** 2) return null;
  const key = cx * 131071 + cz;
  let ok = POTC.get(key);
  if (ok === undefined) POTC.set(key, ok = onBroken(p.x, p.z));
  return ok ? { key, x: p.x, z: p.z, r: p.r, deep: p.r > 0.75 ? 1 : 0 } : null;
}
/* сколько ям на разбитых улицах (для проверки, медленно — не в кадре) */
export function countPots () {
  const seen = new Set();
  let n = 0, deep = 0;
  for (const r of A.CITY.roads) {
    if (r._wear !== 'broken') continue;
    for (let i = 1; i < r.p.length; i++) {
      const [x1, z1] = r.p[i - 1], [x2, z2] = r.p[i], L = Math.hypot(x2 - x1, z2 - z1);
      for (let t = 0; t <= L; t += 2) for (const o of [-2, 0, 2]) {
        const x = x1 + (x2 - x1) * t / L - (z2 - z1) / L * o, z = z1 + (z2 - z1) * t / L + (x2 - x1) / L * o;
        const cx = Math.floor(x / PC), cz = Math.floor(z / PC), k = cx * 131071 + cz;
        if (seen.has(k)) continue;
        seen.add(k);
        const p = potCell(cx, cz);
        if (p && onBroken(p.x, p.z)) { n++; if (p.r > 0.75) deep++; }
      }
    }
  }
  return { n, deep, perKm: Math.round(n / Math.max(1, DEBUG.km.broken || 1)) };
}

DEBUG.potAt = (x, z) => potAt(x, z); DEBUG.potCell = potCell; DEBUG.countPots = () => countPots();

/* ── шейдер: узор по виду полотна ── */
const CB = new THREE.Color();
const lin = hex => { CB.set(hex); return new THREE.Vector3(Math.round(CB.r * 255) / 255, Math.round(CB.g * 255) / 255, Math.round(CB.b * 255) / 255); };
const RW_FN = `
uint rwH (ivec2 c, uint s) { uint h = (uint(c.x + 100000) * 0x8da6b343u) ^ (uint(c.y + 100000) * 0xd8163841u) ^ (s * 0xcb1ab31fu); h ^= h >> 13; h *= 0x5bd1e995u; h ^= h >> 15; return h; }
float rwF (uint h) { return float(h & 0xffffffu) / 16777216.0; }
`;
const RW_GLSL = `
{
  vec3 wc = vColor.rgb;
  float wk = -1.0;
  vec3 wd;
  wd = abs(wc - uRwT[0]); if (max(wd.r, max(wd.g, wd.b)) < 0.0022) wk = 0.0;
  wd = abs(wc - uRwT[1]); if (max(wd.r, max(wd.g, wd.b)) < 0.0022) wk = 1.0;
  wd = abs(wc - uRwT[2]); if (max(wd.r, max(wd.g, wd.b)) < 0.0022) wk = 2.0;
  wd = abs(wc - uRwT[3]); if (max(wd.r, max(wd.g, wd.b)) < 0.0022) wk = 3.0;
  wd = abs(wc - uRwT[4]); if (max(wd.r, max(wd.g, wd.b)) < 0.0022) wk = 4.0;
  wd = abs(wc - uRwT[5]); if (max(wd.r, max(wd.g, wd.b)) < 0.0022) wk = 5.0;
  wd = abs(wc - uRwT[6]); if (max(wd.r, max(wd.g, wd.b)) < 0.0022) wk = 9.0;
  wd = abs(wc - uRwT[7]); if (max(wd.r, max(wd.g, wd.b)) < 0.0022) wk = 0.0;   // свежая заплатка — как свежий асфальт
  if (wk >= 0.0) {
    vec2 q = vSW.xz;
    float fw = max(fwidth(q.x), fwidth(q.y));                 // метров на точку экрана
    float wet = clamp(max(uRwRain * 1.3, uWet * 0.9), 0.0, 1.0);
    float rip = 0.5 + 0.5 * sin(dot(q, vec2(7.0, 5.0)) * 2.0 + uTime * 4.0 * uRwRain) * sin(q.x * 9.0 - q.y * 6.0 - uTime * 3.0 * uRwRain);
    vec3 pud = vec3(0.34, 0.38, 0.45) * (0.92 + 0.12 * rip * (1.0 - smoothstep(0.03, 0.08, fw)));
    if (wk > 8.0) {
      // дно ямы-многоугольника (cars.js): в дождь и в сырой сезон — лужа, светлая от неба, с рябью
      diffuseColor.rgb = mix(diffuseColor.rgb, pud, wet);
    } else {
      // тон: крупные пятна 10—30 м (у старого — сильнее), зерно щебня клетками ~17 см (вдали гаснет)
      float amp = wk < 0.5 ? 0.035 : wk < 1.5 ? 0.06 : wk < 2.5 ? 0.08 : wk < 4.5 ? 0.13 : 0.05;
      float big = sNoise(q * 0.055 + wk * 3.1) - 0.5;
      float grain = (sHash(floor(q * 6.0)) - 0.5) * (wk < 0.5 ? 0.05 : 0.09) * (1.0 - smoothstep(0.05, 0.13, fw));
      vec3 c = diffuseColor.rgb * (1.0 + big * amp * 2.0 + grain);
      // яма разбитого: клетка ${fl(PC)} м, в части клеток — яма (та же раскладка — potAt в JS: по ней
      // трясёт машину). Кучки: кусок из ${fl(PS)}×${fl(PS)} клеток бывает почти чистым, бывает весь в ямах
      float pe = 9.0, pr = 1.0;
      vec2 pdv = vec2(0.0);
      if (wk > 3.5 && wk < 4.5) {
        ivec2 pc = ivec2(floor(q / ${fl(PC)}));
        float sf = rwF(rwH(ivec2(floor(vec2(pc) / ${fl(PS)})), 7u));
        sf = sf < 0.3 ? ${fl(PF[0])} : sf < 0.8 ? ${fl(PF[1])} : ${fl(PF[2])};
        if (rwF(rwH(pc, 3u)) < ${fl(PP)} * sf) {
          pr = ${fl(PR[0])} + rwF(rwH(pc, 5u)) * ${fl(PR[1])};
          vec2 cen = (vec2(pc) + 0.5) * ${fl(PC)} + (vec2(rwF(rwH(pc, 11u)), rwF(rwH(pc, 13u))) - 0.5) * (${fl(PC)} - 2.0 * pr - 0.6);
          pdv = q - cen;
          pe = length(pdv) / pr;
          if (pe < 1.6) pe += (sNoise(q * 3.2 + cen) - 0.5) * 0.22 + (sNoise(q * 0.9 + cen) - 0.5) * 0.2;   // рваный край
        }
      }
      if (wk > 2.5 && wk < 4.5 && uRwLo < 0.5) {
        // трещины старого и разбитого: длинные извилистые (линии уровня шума с изломом, с разрывами),
        // только местами (маска ~20—40 м)
        float mk = smoothstep(wk > 3.5 ? 0.3 : 0.52, wk > 3.5 ? 0.45 : 0.7, sNoise(q * 0.045 + 17.0));
        float ak = wk > 3.5 ? max(smoothstep(0.55, 0.75, mk), 1.0 - smoothstep(1.4, 2.8, pe)) : 0.0;   // «крокодил»: пятнами и вокруг ям
        if (mk > 0.0 || ak > 0.0) {
          vec2 qw = q + (vec2(sNoise(q * 0.9 + 2.0), sNoise(q * 0.9 + 9.0)) - 0.5) * 0.7;
          float n1 = sNoise(qw * 0.3 + 5.0) * 0.82 + sNoise(qw * 1.7 + 13.0) * 0.18;
          float f1 = fwidth(n1), w1 = 0.007;
          float cr = (1.0 - smoothstep(w1, w1 + f1, abs(n1 - 0.5))) * (1.0 - smoothstep(w1, w1 * 5.0, f1)) * mk;
          cr *= smoothstep(0.28, 0.45, sNoise(q * 0.6 + 21.0));         // разрывы: трещина не сплошная
          if (ak > 0.0 && uRwQ > 0.5 && fw < 0.06) {
            // разбитый: сетка «крокодил» — края ячеек Вороного ~0,8 м, кривые от сдвига qw
            vec2 vp = qw / 0.8, vi = floor(vp), vf = fract(vp);
            float d1 = 9.0, d2 = 9.0;
            for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
              vec2 g = vec2(float(x), float(y));
              uint hh = rwH(ivec2(vi + g), 21u);
              vec2 o = vec2(float(hh & 0xffffu), float(hh >> 16)) / 65535.0 * 0.8 + 0.1;
              float dd = length(g + o - vf);
              if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
            }
            float edge = (d2 - d1) * 0.4;                                 // ~метры до края ячейки
            float al = (1.0 - smoothstep(0.012, 0.012 + fw, edge)) * (1.0 - smoothstep(0.025, 0.06, fw));
            cr = max(cr, al * ak);
            c *= 1.0 - 0.06 * ak;                                         // в сетке трещин асфальт темнее и грязнее
          }
          c *= 1.0 - 0.3 * cr;
        }
      }
      if (pe < 1.6) {
        // яма: светлая выкрошенная кромка, тёмная стенка (с одной стороны светлее — свет), тёмное дно с щебнем
        float aa = fw / pr * 0.8 + 0.01, lit = dot(pdv, vec2(-0.6, -0.8)) / max(length(pdv), 0.001);
        vec3 c0 = c;
        c = mix(c, c0 * 1.2, 1.0 - smoothstep(1.18 - aa, 1.18 + aa, pe));                                    // выкрошенный край — светлее
        c = mix(c, c0 * mix(0.5, 0.82, smoothstep(0.0, 0.9, lit) * smoothstep(0.6, 0.98, pe)), 1.0 - smoothstep(1.0 - aa, 1.0 + aa, pe));   // стенка
        float gr = sHash(floor(q * 9.0)) * (1.0 - smoothstep(0.03, 0.08, fw));
        c = mix(c, c0 * (0.36 + 0.12 * gr), 1.0 - smoothstep(0.7 - aa, 0.7 + aa, pe));                      // дно, щебень
        c = mix(c, pud, wet * (1.0 - smoothstep(0.85 - aa, 0.85 + aa, pe)));                                 // в дождь и в сырой сезон — лужа
      }
      diffuseColor.rgb = c;
    }
  }
}`;
/* низкая чёткость — без трещин; «крокодил» — только на высокой (как краска газона, gfx.js DETAIL.lawn) */
const uRwLo = { get value () { try { return GFX.pixelShort() < 480 ? 1 : 0; } catch (e) { return 0; } } };
const uRwQ = { get value () { try { return GFX.detail().lawn ? 1 : 0; } catch (e) { return 1; } } };
const uRwRain = { get value () { try { return (A && A.ENV && A.ENV.rain) || 0; } catch (e) { return 0; } } };   // ENV в игре объявлен после сборки города

export function wearMat (m) {
  if (OFF) return m;
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
  const uRwT = { value: [...KINDS.map(k => lin(WEAR.HEX[k])), lin(WEAR.PATCH[1]), lin('#323339'), lin(WEAR.PATCH[0])] };
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    if (!/sNoise/.test(sh.fragmentShader) || !/vSW/.test(sh.fragmentShader) || !/uWet/.test(sh.fragmentShader)) return;   // без сезонного шейдера — как было
    Object.assign(sh.uniforms, { uRwT, uRwLo, uRwQ, uRwRain });
    sh.fragmentShader = 'uniform vec3 uRwT[8];\nuniform float uRwLo, uRwQ, uRwRain;\n' + RW_FN + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + RW_GLSL);
  };
  m.customProgramCacheKey = () => key + 'wear';
  return m;
}
