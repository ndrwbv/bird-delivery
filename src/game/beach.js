/* ──────────────────────────────────────────────────────────────────────────
   Пляж на Томи (Л3, 09.10.2026). Правила словами — docs/CAREER.md «Город: как
   выглядит» → «Пляж на Томи» и docs/ORDERS.md «Заказ на пляж».

   Где: место задаёт карта (MAP.beach: точка на урезе воды и направление
   вдоль берега). В Солнечном — правый берег Томи в районе «Кольцо», ниже
   улицы вдоль берега: склон там самый пологий (≈ 12 %), а дорога в 100—140 м.
   Весь берег Томи в Солнечном — за забором закрытого города (забор идёт по
   бровке в 60—110 м от воды), поэтому пляж — «карман»: забор обходит его
   с двух сторон и спускается к воде (prepare), к воде вдоль пляжа забора нет.

   Насыпь (shape): рельеф берега — сетка 12 м, склон для пляжа крутой. Песок
   намыт в реку на SHAPE.OUT м: от уреза к берегу пляж поднимается на 4,5 см
   на метр (от 0 у воды до ~1,5 м там, где был урез, дальше — свой склон
   берега), под водой дно уходит на 5 см на метр: по колено — в 8 м от
   воды, по пояс — в 18 м. Только насыпаем (не срезаем); к концам насыпь
   сходит на нет за SHAPE.TAPER м. Делается до сборки земли, поэтому вода,
   пена, дороги и всё остальное видят уже новый берег.

   Что стоит (build): песок полосой вдоль воды (у воды мокрый, темнее), летом —
   зонтики и деревянные «грибки», лежаки, полотенца, волейбольная сетка, щит
   со спасательным кругом, буйки на воде; всегда — ларёк «Квас · мороженое»
   (твёрдый, как стена; не сезон и ночью — ставни закрыты) и кабинка для
   переодевания. Зонтики, лежаки, сетку и щит машина сносит (как дворовую
   мелочь); сбитое встаёт обратно, когда уехал от пляжа дальше 250 м.

   Люди (step): летом днём без дождя — загорают на полотенцах и лежаках
   (машина ближе 9 м — садятся и смотрят), сидят, купаются (стоят по колено и
   по пояс, плещутся, плавают), гуляют у воды, продавец в ларьке и покупатель.
   Только пока машина ближе PEOPLE.R; сбиваются как прохожие (hits.js: взрослая —
   как обычно, детская — падают и встают).

   Машина (sandAt, wade): на песке вязнет — разгон ×(1 − SAND.ACC), сопротивление
   +SAND.DRAG (у стартовой машины потолок ≈ 45 км/ч вместо 155), снос гаснет медленнее
   (сильнее заносит) — game.js driveStep; из-под колёс летит песок. В воде у
   пляжа не тонет, пока глубина меньше WADE м (по колено проехать можно), там
   вязнет вдвое сильнее.

   Заказ (orders.js): летом днём, если пляж в районе, где работаешь, — в среднем
   1 из ORDER.EVERY заказов; клиент лежит на полотенце (lieDown / lieStep), курьер
   подъехал — садится и машет; вручение как обычно.

   Из game.js: prepare(MAP, CITY) — до BORDER; shape(TH, TER) — после RELIEF;
   build(api) — поздняя сборка после пустырей; step(dt) — каждый кадр
   (CL.step); sandAt / wade — в driveStep; dress / lieDown / lieStep — клиент.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t, N_ } from '../i18n/index.js';
import * as SEAS from './seasons.js';
import * as HITS from './hits.js';
import * as CONSTR from './construction.js';

export const SHAPE = {
  HALF: 70,          // пляж вдоль воды: ±HALF м от середины (забор по краям)
  TAPER: 35,         // за краем насыпь сходит на нет, м
  TOP: 1.5,          // высота песка там, где был урез воды, м
  SLOPE: 0.045,      // уклон пляжа: м на м
  UNDER: 0.05,       // уклон дна под водой: м на м
  SAND_IN: 22,       // песок вглубь берега от прежнего уреза, м (край — неровный)
  IN: 150,           // «карман» в заборе: вглубь до стольких м (за прежний забор)
  FENCE_B: -30,      // забор по краям спускается до стольких м (≈ у воды)
  WATER_B: -62,      // граница езды в воде (машина утонет раньше)
};
SHAPE.OUT = SHAPE.TOP / SHAPE.SLOPE;  // на сколько м пляж намыт в реку (≈ 33 м)
export const SAND = { ACC: 0.5, DRAG: 0.8, SIDE: 0.55, WATER: 1.8, DUST: 0.25, WADE: 0.6 };
export const PEOPLE = { R: 170, DROP: 240, SUN: 7, SIT: 2, SWIM: 5, WALK: 2, NEAR: 9, RESET: 250 };
export const ORDER = { EVERY: 15, GAP: 4, MAX: 3, H0: 10, H1: 20 };

let SITE = null;           // { cx, cz, ux, uz, nx, nz } — середина на прежнем урезе, вдоль берега, вглубь
let A = null;
const STATS = { ok: false, why: '', fence: 0, cells: 0, props: 0, smash: 0, spots: 0, live: 0, orders: 0, ms: 0 };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const hash = (x, z, k = 0) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
const sm = x => { const q = clamp(x, 0, 1); return q * q * (3 - 2 * q); };

/* мировые ↔ свои оси: a — вдоль воды, b — вглубь берега (0 — прежний урез) */
const locA = (x, z) => (x - SITE.cx) * SITE.ux + (z - SITE.cz) * SITE.uz;
const locB = (x, z) => (x - SITE.cx) * SITE.nx + (z - SITE.cz) * SITE.nz;
const W = (a, b) => [SITE.cx + SITE.ux * a + SITE.nx * b, SITE.cz + SITE.uz * a + SITE.nz * b];
/* новая высота пляжа по b (без естественного склона): урез воды — b = −OUT */
const prof = b => (b >= -SHAPE.OUT ? SHAPE.TOP + SHAPE.SLOPE * b : SHAPE.UNDER * (b + SHAPE.OUT));
/* край песка вглубь: неровный, к концам закруглён */
function sandEdge (a) {
  const n = (hash(Math.floor(a / 9), 3, 7) - 0.5) * 4 + Math.sin(a * 0.11) * 1.5;
  let e = SHAPE.SAND_IN + n;
  const r = 16, aa = Math.abs(a) - (SHAPE.HALF - 1 - r);
  if (aa > 0) e -= r * (1 - Math.sqrt(Math.max(0, 1 - (aa / r) ** 2))) * 2.2;
  return e;
}

/* ═════════════ 1. забор: «карман» до воды ═════════════ */
/* Многоугольник Q в своих осях: вглубь за прежний забор, по краям — до воды, в воде — граница езды */
function qPoly () {
  const H = SHAPE.HALF;
  return [[-H, SHAPE.IN], [-H, SHAPE.FENCE_B], [-H, SHAPE.WATER_B], [H, SHAPE.WATER_B], [H, SHAPE.FENCE_B], [H, SHAPE.IN]];
}
const inQ = (a, b) => Math.abs(a) < SHAPE.HALF && b > SHAPE.WATER_B && b < SHAPE.IN;
/* пересечение отрезков p→q и r→s: t по p→q и u по r→s, или null */
function cross (px, pz, qx, qz, rx, rz, sx, sz) {
  const dx = qx - px, dz = qz - pz, ex = sx - rx, ez = sz - rz, den = dx * ez - dz * ex;
  if (Math.abs(den) < 1e-9) return null;
  const t0 = ((rx - px) * ez - (rz - pz) * ex) / den, u = ((rx - px) * dz - (rz - pz) * dx) / den;
  return t0 >= 0 && t0 < 1 && u >= 0 && u <= 1 ? { t: t0, u } : null;
}
/* где линия pts (замкнутая или нет) пересекает границу Q: [{ e — ребро линии, t, k — ребро Q, x, z }] */
function hits (pts, closed) {
  const Q = qPoly().map(([a, b]) => W(a, b)), out = [], n = pts.length, m = closed ? n : n - 1;
  for (let e = 0; e < m; e++) {
    const [px, pz] = pts[e], [qx, qz] = pts[(e + 1) % n];
    for (let k = 0; k < Q.length; k++) {
      const [rx, rz] = Q[k], [sx, sz] = Q[(k + 1) % Q.length];
      const c = cross(px, pz, qx, qz, rx, rz, sx, sz);
      if (c) out.push({ e, t: c.t, k, x: px + (qx - px) * c.t, z: pz + (qz - pz) * c.t });
    }
  }
  return out.sort((p, q) => p.e - q.e || p.t - q.t);
}
/* путь по границе Q от точки на ребре k1 до точки на ребре k2 — через угол в воде (2) */
function qPath (k1, k2) {
  const Q = qPoly().map(([a, b]) => W(a, b)), N = Q.length;
  const fwd = [], bwd = [];
  for (let k = (k1 + 1) % N; ; k = (k + 1) % N) { fwd.push(k); if (k === k2) break; if (fwd.length > N) break; }
  for (let k = k1; ; k = (k - 1 + N) % N) { if (k === k2) break; bwd.push(k); if (bwd.length > N) break; }
  const pick = fwd.includes(2) ? fwd : bwd;
  return pick.map(k => Q[k]);
}
/* вставить «карман» в линию: [начало … вход, по Q, выход … конец]; null — пересечений не два */
function splice (pts, closed) {
  const h = hits(pts, closed);
  if (h.length !== 2) return null;
  let [E, X] = h;
  const firstIn = inQ(locA(...pts[0]), locB(...pts[0]));
  if (closed && firstIn) {                         // начало линии внутри Q: вход — второе пересечение
    const n = pts.length, s = (X.e + 1) % n;
    const rot = pts.slice(s).concat(pts.slice(0, s));
    return splice(rot, true);
  }
  const path = qPath(E.k, X.k);
  return [...pts.slice(0, E.e + 1), [E.x, E.z], ...path, [X.x, X.z], ...pts.slice(X.e + 1)];
}
/* забор рисуется по линии, но не в воде: куски с обоими концами ниже FENCE_B — разрыв */
function splitWet (pl) {
  const out = [];
  let cur = [];
  const wet = p => { const a = locA(p[0], p[1]), b = locB(p[0], p[1]); return Math.abs(a) <= SHAPE.HALF + 0.5 && b <= SHAPE.FENCE_B + 0.01; };
  for (let i = 0; i < pl.length; i++) {
    if (i && wet(pl[i - 1]) && wet(pl[i])) { if (cur.length > 1) out.push(cur); cur = [pl[i]]; continue; }
    cur.push(pl[i]);
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

/* до BORDER в game.js: место из карты, «карман» в границе и заборе */
export function prepare (MAP, CITY) {
  const cfg = MAP && MAP.beach;
  if (!cfg || !cfg.at || !cfg.u) { STATS.why = 'нет MAP.beach'; return; }
  const l = Math.hypot(cfg.u[0], cfg.u[1]) || 1, ux = cfg.u[0] / l, uz = cfg.u[1] / l;
  SITE = { cx: cfg.at[0], cz: cfg.at[1], ux, uz, nx: uz, nz: -ux };
  if (cfg.flip) { SITE.nx = -SITE.nx; SITE.nz = -SITE.nz; }
  if (CITY.__beach) { STATS.ok = true; return; }   // уже вставлен (модуль карты общий)
  const border = MAP.border || CITY.border;
  if (border) {
    const nb = splice(border, true);
    if (!nb) { STATS.why = 'граница не пересекает пляж дважды'; SITE = null; return; }
    border.splice(0, border.length, ...nb);
    if (CITY.border && CITY.border !== border) { const cb = splice(CITY.border, true); if (cb) CITY.border.splice(0, CITY.border.length, ...cb); }
    if (Array.isArray(CITY.fence)) {
      for (let i = 0; i < CITY.fence.length; i++) {
        const nf = splice(CITY.fence[i], false);
        if (!nf) continue;
        const parts = splitWet(nf);
        CITY.fence.splice(i, 1, ...parts);
        STATS.fence++;
        break;
      }
    }
  }
  CITY.__beach = true;
  STATS.ok = true;
}

/* ═════════════ 2. насыпь: рельеф до сборки земли ═════════════ */
export function shape (TH, TER) {
  if (!SITE) return;
  const H = SHAPE.HALF, T = SHAPE.TAPER;
  for (let j = 0; j < TER.nz; j++) {
    const z = TER.z0 + j * TER.g;
    for (let i = 0; i < TER.nx; i++) {
      const x = TER.x0 + i * TER.g, a = locA(x, z), b = locB(x, z);
      if (Math.abs(a) > H + T || b < -120 || b > 40) continue;
      const w = Math.abs(a) <= H ? 1 : 1 - sm((Math.abs(a) - H) / T);
      const k = j * TER.nx + i, h = TH[k], p = prof(b);
      if (p > h) { TH[k] = h + (p - h) * w; STATS.cells++; }
    }
  }
}

/* ═════════════ 3. сборка: песок, ларёк, летнее ═════════════ */
// песок тёплый, рыжевато-золотой (09.10.2026, автор: «песочек красивый рыжий»). Склейка хранит цвет вершины
// линейным (Mesher.color переводит из sRGB), поэтому цвета — обычные hex, переводим так же. Было
// dry 226,200,140 байтами «как есть» — на экране бледно-кремовый, почти серый
const linB = h => { const c = new THREE.Color(h); return [c.r * 255, c.g * 255, c.b * 255]; };
const SANDC = { dry: linB('#f6bc74'), wet: linB('#bf8448'), under: linB('#cc9c62'), edge: linB('#d8ac68') };
const SPOTS = [];          // места под полотенце клиента: { x, z, ry }
const NPC_TOWELS = [];     // полотенца загорающих (в летнем меше): { x, z, ry, lounger }
const PROPS = [];          // зонтики, лежаки…: { x, z, r } — от них клиента не кладём
const ITEMS = [];          // сбиваемое летнее: smashMesh
let SUMMER_MESH = null, SHUT_MESH = null, SUMMER_POS = null, KIOSK = null;
let SUMMER_ON = null;
const MOBS = [];

function sandGrad (x, z, c, i) {
  const a = locA(x, z), b = locB(x, z), e = sandEdge(a);
  let col;
  const bw = -SHAPE.OUT;
  if (b < bw - 0.5) col = SANDC.under;
  else {
    const wk = 1 - sm((b - bw - 0.5) / 5.5);           // мокрая полоса у воды
    col = [0, 1, 2].map(q => SANDC.dry[q] + (SANDC.wet[q] - SANDC.dry[q]) * wk);
    const ek = sm((b - (e - 3)) / 3);                   // у края — чуть темнее, с травой
    for (let q = 0; q < 3; q++) col[q] += (SANDC.edge[q] - col[q]) * ek * 0.7;
  }
  const nn = 1 + (hash(Math.round(x * 2), Math.round(z * 2), 5) - 0.5) * 0.08;
  c[i] = clamp(Math.round(col[0] * nn), 0, 255); c[i + 1] = clamp(Math.round(col[1] * nn), 0, 255); c[i + 2] = clamp(Math.round(col[2] * nn), 0, 255);
}
function buildSand () {
  const M = A.LITM, H = SHAPE.HALF - 1, step = 3, rows = 22, b0 = -SHAPE.OUT - 9;
  M.grad(sandGrad);
  for (let a = -H; a < H - 1e-6; a += step) {
    const a1 = Math.min(H, a + step), e0 = sandEdge(a), e1 = sandEdge(a1);
    for (let k = 0; k < rows; k++) {
      const s0 = k / rows, s1 = (k + 1) / rows;
      const p00 = W(a, b0 + (e0 - b0) * s0), p01 = W(a, b0 + (e0 - b0) * s1), p10 = W(a1, b0 + (e1 - b0) * s0), p11 = W(a1, b0 + (e1 - b0) * s1);
      M.dtri(p00[0], p00[1], p10[0], p10[1], p11[0], p11[1], 0.05);
      M.dtri(p00[0], p00[1], p11[0], p11[1], p01[0], p01[1], 0.05);
    }
  }
  M.grad(null);
}

/* летнее — одним мешем; сбиваемое — куски вершин в нём (smashMesh) */
function summerBuild () {
  const g = [], items = [];
  const gh = A.groundH, ry0 = Math.atan2(SITE.ux, SITE.uz);      // поворот «вдоль берега»
  const toWater = Math.atan2(-SITE.nx, -SITE.nz);                  // лицом к воде
  let vn = 0;
  const begin = () => g.length;
  const end = (kind, x, z, r, hex, from) => {
    let nv = 0;
    for (let i = from; i < g.length; i++) nv += g[i].attributes.position.count;
    items.push({ kind, x, z, r, hex, v0: vn, nv }); vn += nv;
  };
  const still = from => { for (let i = from; i < g.length; i++) vn += g[i].attributes.position.count; };
  const box = (w, h, d, hex, x, y, z, ry = 0, rx = 0, rz = 0) => A.put(g, A.boxGeo(w, h, d), hex, x, y, z, rx, ry, rz);
  // зонтик: шест и купол из восьми долей в два цвета
  const umbrella = (x, z, c1, c2, tilt) => {
    const y0 = gh(x, z), f = begin();
    box(0.06, 2.3, 0.06, '#e8e4dc', x, y0 + 1.15, z, 0, tilt, 0);
    const R = 1.35, Hc = 0.45, top = y0 + 2.35;
    for (let i = 0; i < 8; i++) {
      const a0 = i / 8 * Math.PI * 2, a1 = (i + 1) / 8 * Math.PI * 2;
      const geo = new THREE.BufferGeometry();
      const P = [x, top + Hc, z, x + Math.cos(a0) * R, top, z + Math.sin(a0) * R, x + Math.cos(a1) * R, top, z + Math.sin(a1) * R];
      const P2 = [P[0], P[1] - 0.02, P[2], P[6], P[7] - 0.02, P[8], P[3], P[4] - 0.02, P[5]];
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...P, ...P2]), 3));
      geo.setIndex([0, 2, 1, 3, 5, 4]);
      geo.computeVertexNormals();
      A.put(g, geo, i % 2 ? c1 : c2, 0, 0, 0);
    }
    end('umbrella', x, z, 0.5, c1, f);
    PROPS.push({ x, z, r: 1.6 });
  };
  // «грибок»: деревянный столб и шестигранная крыша
  const mush = (x, z) => {
    const y0 = gh(x, z), f = begin();
    box(0.16, 2.4, 0.16, '#7a5532', x, y0 + 1.2, z);
    const roof = new THREE.ConeGeometry(1.7, 0.7, 6);
    A.put(g, roof, '#c8483a', x, y0 + 2.65, z);
    box(0.5, 0.12, 0.5, '#e8e0cf', x, y0 + 3.05, z);
    end('umbrella', x, z, 0.5, '#c8483a', f);
    PROPS.push({ x, z, r: 2 });
  };
  // лежак: рама и спинка
  const lounger = (x, z, ry, hex) => {
    const y0 = gh(x, z), f = begin();
    const fx = Math.sin(ry), fz = Math.cos(ry);
    box(0.62, 0.06, 1.3, hex, x, y0 + 0.32, z, ry);
    box(0.62, 0.06, 0.7, hex, x - fx * 0.95, y0 + 0.55, z - fz * 0.95, ry, -0.75);
    for (const [s, t0] of [[-1, -0.5], [1, -0.5], [-1, 0.55], [1, 0.55]]) {
      const ox = Math.cos(ry) * s * 0.26 + fx * t0, oz = -Math.sin(ry) * s * 0.26 + fz * t0;
      box(0.05, 0.3, 0.05, '#9a9a9a', x + ox, y0 + 0.15, z + oz);
    }
    end('beach', x, z, 0.8, hex, f);
    PROPS.push({ x, z, r: 1.2 });
  };
  const towel = (x, z, ry, hex) => { const f = begin(); box(0.85, 0.02, 1.85, hex, x, gh(x, z) + 0.065, z, ry); still(f); };
  const TOWEL = ['#e0503c', '#3c8fe0', '#f2c230', '#5fbf6a', '#f08ab0', '#ffffff', '#8e6fd0', '#2fb5b0'];
  const UMB = [['#e0503c', '#ffffff'], ['#3c8fe0', '#ffffff'], ['#f2c230', '#e0503c'], ['#5fbf6a', '#f7f2e0'], ['#8e6fd0', '#f2c230']];
  // ряды зонтиков и грибков с лежаками и полотенцами
  let n = 0;
  for (let a = -56; a <= 56; a += 13) for (const b of [-14, 1]) {
    const aa = a + (hash(a, b, 1) - 0.5) * 5, bb = b + (hash(a, b, 2) - 0.5) * 4;
    if (Math.abs(aa - 40) < 9 && bb > -2) continue;      // место у ларька
    if (Math.abs(aa + 40) < 6 && bb > -2) continue;      // у кабинки
    if (Math.abs(aa + 14) < 9 && Math.abs(bb + 3) < 7) continue;   // волейбол
    const [x, z] = W(aa, bb);
    if ((n++ % 3) === 2) mush(x, z);
    else { const c = UMB[(hash(aa, bb, 3) * UMB.length) | 0]; umbrella(x, z, c[0], c[1], (hash(aa, bb, 4) - 0.5) * 0.12); }
    // под ним: лежак или полотенце (на нём — загорающий, когда люди есть)
    for (const side of [-1, 1]) {
      if (hash(aa, bb, 5 + side) < 0.25) continue;
      const ta = aa + side * 1.6, tb = bb - 1.4;
      const [tx, tz] = W(ta, tb), ry = toWater + (hash(ta, tb, 6) - 0.5) * 0.3;    // головой от воды, ногами к воде
      const lng = hash(ta, tb, 7) < 0.4;
      if (lng) lounger(tx, tz, ry, hash(ta, tb, 8) < 0.5 ? '#f4f1ea' : '#4f8fd6');
      else towel(tx, tz, ry, TOWEL[(hash(ta, tb, 9) * TOWEL.length) | 0]);
      NPC_TOWELS.push({ x: tx, z: tz, ry, lounger: lng });
      PROPS.push({ x: tx, z: tz, r: 1.3 });
    }
  }
  // волейбольная сетка
  {
    const [x1, z1] = W(-14 - 4.5, -3), [x2, z2] = W(-14 + 4.5, -3), f = begin();
    for (const [x, z] of [[x1, z1], [x2, z2]]) box(0.08, 2.5, 0.08, '#e8e4dc', x, gh(x, z) + 1.25, z);
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
    for (const y of [1.62, 1.85, 2.08, 2.3]) box(9, 0.025, 0.02, '#3a3c42', mx, gh(mx, mz) + y, mz, ry0 + Math.PI / 2);   // сетка: шнуры
    for (let k = -4; k <= 4; k++) { const ox = SITE.ux * k, oz = SITE.uz * k; box(0.02, 0.8, 0.02, '#3a3c42', mx + ox, gh(mx, mz) + 1.95, mz + oz); }
    box(9, 0.08, 0.04, '#f4f1ea', mx, gh(mx, mz) + 2.4, mz, ry0 + Math.PI / 2);
    end('beach', mx, mz, 2.2, '#f4f1ea', f);
    PROPS.push({ x: mx, z: mz, r: 5 });
  }
  // щит со спасательным кругом у воды
  {
    const [x, z] = W(6, -SHAPE.OUT + 9), y0 = gh(x, z), f = begin();
    box(0.1, 1.9, 0.1, '#f4f1ea', x, y0 + 0.95, z);
    box(0.9, 0.9, 0.05, '#2e6fb8', x, y0 + 1.5, z, toWater);
    const ring = new THREE.TorusGeometry(0.3, 0.08, 5, 10);
    A.put(g, ring, '#ff5a2a', x - SITE.nx * 0.05, y0 + 1.5, z - SITE.nz * 0.05, 0, toWater, 0);
    end('beach', x, z, 0.6, '#ff5a2a', f);
    PROPS.push({ x, z, r: 1.2 });
  }
  // буйки: граница заплыва
  {
    const f = begin();
    for (let a = -54; a <= 54; a += 6) {
      const [x, z] = W(a, -SHAPE.OUT - 26);
      const geo = new THREE.SphereGeometry(0.22, 6, 4);
      A.put(g, geo, (Math.round(a / 6) % 2) ? '#ff4a2a' : '#f4f1ea', x, 0.08, z);
    }
    still(f);
  }
  if (!g.length) return;
  const geo = A.mergeGeos(g);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  SUMMER_MESH = new THREE.Mesh(geo, mat);
  SUMMER_MESH.name = 'beach-summer';
  A.scene.add(SUMMER_MESH);
  SUMMER_POS = geo.attributes.position.array.slice();
  for (const it of items) { ITEMS.push(A.smashMesh(it.kind, it.x, it.z, it.r, SUMMER_MESH, it.v0, it.nv, it.hex)); STATS.smash++; }
  STATS.props = items.length;
}

/* ларёк «Квас · мороженое» и кабинка — круглый год */
function kioskBuild () {
  const [x, z] = W(40, 15), ry = Math.atan2(-SITE.nx, -SITE.nz), y0 = A.groundH(x, z);
  const fx = -SITE.nx, fz = -SITE.nz;                 // лицом к воде
  const P = (s, f) => [x + Math.cos(ry) * s + fx * f, z - Math.sin(ry) * s + fz * f];
  const L = A.LIT, bx = (w, h, d, hex, s, y, f) => { const [px, pz] = P(s, f); A.put(L, A.boxGeo(w, h, d), hex, px, y0 + y, pz, 0, ry, 0); };
  bx(3.2, 0.25, 2.4, '#8a8a86', 0, 0.12, 0);         // цоколь
  bx(3.2, 0.95, 2.3, '#3a8fd0', 0, 0.72, 0);          // низ
  bx(3.2, 0.12, 0.6, '#e8e0cf', 0, 1.25, 1.35);       // прилавок
  bx(0.2, 1.05, 2.3, '#3a8fd0', -1.5, 1.72, 0);       // стойки окна
  bx(0.2, 1.05, 2.3, '#3a8fd0', 1.5, 1.72, 0);
  bx(3.2, 1.05, 0.12, '#3a8fd0', 0, 1.72, -1.1);      // задняя стенка
  bx(3.4, 0.55, 2.5, '#f4f1ea', 0, 2.5, 0);           // верх под вывеску
  bx(3.6, 0.1, 3.2, '#e0503c', 0, 2.82, 0.25);        // козырёк
  bx(0.7, 1.0, 0.6, '#d8d8d8', 1.1, 0.5, 1.6);        // холодильник с мороженым
  bx(0.9, 0.8, 0.9, '#c8a050', -1.0, 0.65, 1.7);      // бочка кваса
  A.obb(x + fx * 0.3, z + fz * 0.3, 1.7, 1.5, -ry);
  // вывеска
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const q = c.getContext('2d');
  q.fillStyle = '#f4f1ea'; q.fillRect(0, 0, 512, 96);
  q.strokeStyle = '#e0503c'; q.lineWidth = 8; q.strokeRect(4, 4, 504, 88);
  const txt = t('КВАС · МОРОЖЕНОЕ');
  let fs = 60;
  q.font = `900 ${fs}px Arial, sans-serif`;
  while (fs > 20 && q.measureText(txt).width > 480) { fs -= 2; q.font = `900 ${fs}px Arial, sans-serif`; }
  q.fillStyle = '#2e6fb8'; q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillText(txt, 256, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.6), new THREE.MeshLambertMaterial({ map: tex }));
  const [sx, sz] = P(0, 1.27);
  sign.position.set(sx, y0 + 2.5, sz); sign.rotation.y = ry;
  A.scene.add(sign);
  // ставни: не сезон и ночью окно закрыто
  const sg = [];
  { const [px, pz] = P(0, 1.16); A.put(sg, A.boxGeo(2.9, 1.0, 0.06), '#7f8a90', px, y0 + 1.75, pz, 0, ry, 0); }
  SHUT_MESH = new THREE.Mesh(A.mergeGeos(sg), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  A.scene.add(SHUT_MESH);
  KIOSK = { x, z, ry, fx, fz, P };
  PROPS.push({ x, z, r: 4.5 });
  // кабинка для переодевания
  {
    const [kx, kz] = W(-40, 14), ky = A.groundH(kx, kz);
    for (const [s, f, w, d] of [[0, -0.6, 1.3, 0.06], [-0.62, 0, 0.06, 1.2], [0.62, 0, 0.06, 1.2], [0.35, 0.6, 0.6, 0.06]]) {
      const px = kx + Math.cos(ry) * s + fx * f, pz = kz - Math.sin(ry) * s + fz * f;
      A.put(L, A.boxGeo(w, 1.7, d), '#e0a030', px, ky + 1.05, pz, 0, ry, 0);
    }
    for (const [s, f] of [[-0.62, -0.6], [0.62, -0.6], [-0.62, 0.6], [0.62, 0.6]]) {
      const px = kx + Math.cos(ry) * s + fx * f, pz = kz - Math.sin(ry) * s + fz * f;
      A.put(L, A.boxGeo(0.06, 2.0, 0.06), '#4a5560', px, ky + 1.0, pz, 0, ry, 0);
    }
    A.obb(kx, kz, 0.7, 0.7, -ry);
    PROPS.push({ x: kx, z: kz, r: 1.8 });
  }
}

/* места под полотенце клиента: сухой песок, не у вещей и не у чужих полотенец */
function spotsBuild () {
  const toWater = Math.atan2(-SITE.nx, -SITE.nz);
  for (let a = -58; a <= 58; a += 3.5) for (let b = -24; b <= 10; b += 3.5) {
    const aa = a + (hash(a, b, 11) - 0.5) * 2, bb = b + (hash(a, b, 12) - 0.5) * 2;
    const [x, z] = W(aa, bb);
    if (PROPS.some(p => Math.hypot(p.x - x, p.z - z) < p.r + 1.6)) continue;
    if (A.groundH(x, z) < 0.4 || !A.inBounds(x, z, 6)) continue;
    SPOTS.push({ x, z, ry: toWater + (hash(aa, bb, 13) - 0.5) * 0.5 });
  }
  STATS.spots = SPOTS.length;
}

export function build (api) {
  if (!SITE) return;
  const t0 = performance.now();
  A = api;
  // лес, заросли, мусор и пустыри — не на пляж
  for (let a = -SHAPE.HALF + 10; a <= SHAPE.HALF - 10; a += 20) for (const b of [-30, -5, 18]) { const [x, z] = W(a, b); CONSTR.claim(x, z, 16); }
  buildSand();
  summerBuild();
  kioskBuild();
  spotsBuild();
  STATS.ms = Math.round(performance.now() - t0);
}

/* ═════════════ 4. машина на песке ═════════════ */
/* 0 — не песок; 1 — песок; больше — в воде у пляжа */
export function sandAt (x, z) {
  if (!SITE) return 0;
  const dx = x - SITE.cx, dz = z - SITE.cz;
  if (dx * dx + dz * dz > 110 * 110) return 0;
  const a = dx * SITE.ux + dz * SITE.uz, b = dx * SITE.nx + dz * SITE.nz;
  if (Math.abs(a) > SHAPE.HALF || b < SHAPE.WATER_B) return 0;
  const e = sandEdge(a);
  if (b > e + 1) return 0;
  let k = b > e - 2 ? (e + 1 - b) / 3 : 1;
  if (b < -SHAPE.OUT) k = SAND.WATER;
  return k * (1 - 0.5 * SEAS.snowAmt());
}
/* на сколько м глубже обычного можно заехать в воду (у пляжа — по колено) */
export function wade (x, z) {
  if (!SITE) return 0;
  const a = locA(x, z), b = locB(x, z);
  return Math.abs(a) <= SHAPE.HALF && b > SHAPE.WATER_B && b < 0 ? SAND.WADE : 0;
}
let dustT = 0;
function dust (dt) {
  const V = A.V, sp = Math.hypot(V.vx, V.vz);
  if (sp < 6 || V.air) return;
  const k = sandAt(V.x, V.z);
  if (!k || k > 1.01 || SEAS.snowAmt() > 0.3) return;
  if ((dustT -= dt) > 0) return;
  dustT = SAND.DUST;
  const fx = Math.sin(V.h), fz = Math.cos(V.h);
  if (A.puff) A.puff(V.x - fx * 1.6, 0.25, V.z - fz * 1.6, false, 0.5 + Math.min(0.6, sp / 30));
}

/* ═════════════ 5. люди ═════════════ */
const SWIM = ['#e0503c', '#2e6fb8', '#1d1d1b', '#f2c230', '#5fbf6a', '#f08ab0', '#8e6fd0', '#2fb5b0'];
const LINES = [N_('эй, тут люди загорают!'), N_('куда по пляжу на машине?!'), N_('песком всех засыпал!'), N_('купаться будешь?'), N_('а пицца с чем?')];
/* пляжный вид: босиком, мужчины — в плавках-шортах, женщины — в купальнике */
function beachPerson (fem) {
  const person = A.makePerson({ fem, fat: Math.random() < 0.3 });
  const L = person.look;
  const sw = SWIM[(Math.random() * SWIM.length) | 0];
  Object.assign(L, { top: 'tee', bottom: 'shorts', shirt: fem ? sw : L.skin, pants: sw, shoes: L.skin, pack: null });
  if (L.head === 'beanie' || L.head === 'hood' || L.head === 'ushanka') L.head = 'none';
  return person;
}
function makeBeachHuman (person) {
  const grp = A.makeHuman(person, { summer: true });
  const u = grp.userData;
  if (person.look.f || u.fem) {                    // руки купальщицы — без рукавов
    const c = new THREE.Color(person.look.skin);
    for (const m of [u.armL, u.armR]) {
      const ca = m.geometry.attributes.color;
      for (let i = 0; i < ca.count; i++) ca.setXYZ(i, c.r, c.g, c.b);
      ca.needsUpdate = true;
    }
  }
  return grp;
}

/* поза: лежит на спине (lie 1) / на животе (−1) центром на (x, z), головой по ry; сидит (sit) */
function poseLie (grp, x, z, ry, y, belly) {
  const u = grp.userData, s = grp.scale.x;
  grp.rotation.order = 'YXZ';
  grp.rotation.set(belly ? Math.PI / 2 : -Math.PI / 2, ry, 0);
  const fx = Math.sin(ry), fz = Math.cos(ry), off = 0.82 * s;
  grp.position.set(x + fx * off, y + 0.14 * s, z + fz * off);
  u.legL.rotation.x = 0; u.legR.rotation.x = 0;
  u.armL.rotation.x = belly ? -2.9 : 0; u.armR.rotation.x = belly ? -2.9 : 0;
  u.armL.rotation.z = belly ? 0 : 0.25; u.armR.rotation.z = belly ? 0 : -0.25;
}
function poseSit (grp, x, z, ry, y) {
  const u = grp.userData, s = grp.scale.x;
  grp.rotation.order = 'YXZ';
  grp.rotation.set(0, ry, 0);
  grp.position.set(x, y - 0.6 * s, z);
  u.legL.rotation.x = -1.5; u.legR.rotation.x = -1.5;
  u.armL.rotation.x = -0.4; u.armR.rotation.x = -0.4;
  u.armL.rotation.z = 0; u.armR.rotation.z = 0;
}
function poseStand (grp) {
  const u = grp.userData;
  grp.rotation.x = 0; grp.rotation.z = 0; grp.rotation.order = 'XYZ';
  u.legL.rotation.x = u.legR.rotation.x = 0; u.armL.rotation.x = u.armR.rotation.x = 0; u.armL.rotation.z = u.armR.rotation.z = 0;
}

/* люди — очередью: не больше SPAWN_N за кадр (человек собирается ~2—3 мс — разом был рывок кадра) */
const QUEUE = [];
const SPAWN_N = 2;
function spawnPeople () {
  const free = NPC_TOWELS.slice().sort(() => Math.random() - 0.5);
  const add = (t0, grp, x, z, h, o = {}) => QUEUE.push(() => {
    const g = grp();
    A.scene.add(g);
    MOBS.push({ t: t0, grp: g, u: g.userData, x, z, h, ph: rand(0, 6), dead: 0, fall: null, say: null, sayT: 0, sayCd: rand(3, 8), ...o });
    if (t0 === 'sun' || t0 === 'sit') { if (t0 === 'sun') poseLie(g, x, z, h, A.groundH(x, z) + (o.tw.lounger ? 0.33 : 0.06), o.belly); else poseSit(g, x, z, h, A.groundH(x, z) + 0.06); }
    else g.position.set(x, A.groundH(x, z), z);
  });
  for (let i = 0; i < PEOPLE.SUN && free.length; i++) {
    const tw = free.pop(), fem = Math.random() < 0.55;
    add('sun', () => makeBeachHuman(beachPerson(fem)), tw.x, tw.z, tw.ry, { tw, belly: Math.random() < 0.35 });
  }
  for (let i = 0; i < PEOPLE.SIT && free.length; i++) {
    const tw = free.pop(), fem = Math.random() < 0.5;
    add('sit', () => makeBeachHuman(beachPerson(fem)), tw.x, tw.z, tw.ry + Math.PI, { tw });
  }
  for (let i = 0; i < PEOPLE.SWIM; i++) {
    const a = rand(-45, 45), b = -SHAPE.OUT - rand(3, 17), [x, z] = W(a, b);
    const fem = Math.random() < 0.5;
    add('swim', () => makeBeachHuman(beachPerson(fem)), x, z, rand(0, 6.28), { swim: Math.random() < 0.35, a, b, ta: a, tb: b });
  }
  for (let i = 0; i < PEOPLE.WALK; i++) {
    const a = rand(-40, 40), b = -SHAPE.OUT + rand(1.5, 3.5), [x, z] = W(a, b);
    const fem = Math.random() < 0.5;
    add('walk', () => makeBeachHuman(beachPerson(fem)), x, z, 0, { a, b, dir: Math.random() < 0.5 ? 1 : -1 });
  }
  if (KIOSK) {
    const [sx, sz] = KIOSK.P(0, 0.2), [bx, bz] = KIOSK.P(rand(-0.6, 0.6), 2.3);
    add('seller', () => A.makeHuman(A.makePerson({ fem: true, fat: true }), { summer: true }), sx, sz, Math.atan2(KIOSK.fx, KIOSK.fz));
    const fem = Math.random() < 0.5;
    add('buyer', () => makeBeachHuman(beachPerson(fem)), bx, bz, Math.atan2(-KIOSK.fx, -KIOSK.fz));
  }
}
function dropPeople () {
  QUEUE.length = 0;
  for (const o of MOBS) {
    if (o.say && o.say.parent) { o.say.parent.remove(o.say); o.say.material.dispose(); }
    if (!o.dead) A.dropMesh(o.grp);
  }
  MOBS.length = 0;
  STATS.live = 0;
}
function carHits (x, z, r) {
  const V = A.V, fx = Math.sin(V.h), fz = Math.cos(V.h), dx = x - V.x, dz = z - V.z;
  return Math.abs(dx * fx + dz * fz) < A.CAR_L + r && Math.abs(dx * fz - dz * fx) < A.CAR_W + r;
}
function mobStep (o, dt, sp) {
  const V = A.V;
  if (o.dead) return;
  if (o.fall) { if (HITS.fallStep(o, dt)) return; o.fall = null; }
  const lying = o.t === 'sun' && !o.up;
  if (sp > 3 && carHits(o.x, o.z, lying ? 0.8 : 0.35)) {
    const kmh = sp * 3.6;
    poseStand(o.grp);
    o.grp.position.set(o.x, A.groundH(o.x, o.z), o.z);
    if (HITS.isFall(kmh)) { if (!o.fall) HITS.fall(o, V.vx, V.vz); o.t = 'stand'; o.h = Math.atan2(V.x - o.x, V.z - o.z); return; }   // упал и встал — стоит, грозит
    o.dead = 1;
    A.dropMesh(o.grp);
    A.gibHuman(o, V.vx, V.vz, kmh);
    if (A.runOver) A.runOver();
    return;
  }
  const u = o.u, d = Math.hypot(o.x - V.x, o.z - V.z), gy = A.groundH(o.x, o.z);
  o.ph += dt;
  if (o.say && (o.sayT -= dt) <= 0) { if (o.say.parent) o.say.parent.remove(o.say); o.say.material.dispose(); o.say = null; }
  const look = Math.atan2(V.x - o.x, V.z - o.z);
  if (o.t === 'sun') {
    const tw = o.tw, y = gy + (tw.lounger ? 0.33 : 0.06);
    o.up = d < PEOPLE.NEAR && sp > 0.5 ? 1 : d > PEOPLE.NEAR + 4 ? 0 : o.up;
    if (o.up) { poseSit(o.grp, o.x, o.z, look, y); u.head.rotation.y = 0; }
    else { poseLie(o.grp, o.x, o.z, o.h, y, o.belly); u.head.rotation.y = Math.sin(o.ph * 0.3) * 0.4; }
    return;
  }
  if (o.t === 'sit') {
    poseSit(o.grp, o.x, o.z, d < 12 ? look : o.h, gy + 0.06);
    u.armR.rotation.x = -0.4 + Math.max(0, Math.sin(o.ph * 0.8)) * 0.5;
  } else if (o.t === 'swim') {
    const dep = Math.max(0, -gy);
    if (o.swim) {                                       // плывёт: лицом вниз у поверхности, руки — мельницей
      if (Math.hypot(o.ta - o.a, o.tb - o.b) < 1) { o.ta = clamp(o.a + rand(-12, 12), -50, 50); o.tb = -SHAPE.OUT - rand(8, 20); }
      const da = o.ta - o.a, db = o.tb - o.b, dl = Math.hypot(da, db) || 1;
      o.a += da / dl * 0.9 * dt; o.b += db / dl * 0.9 * dt;
      [o.x, o.z] = W(o.a, o.b);
      const dir = Math.atan2(SITE.ux * da + SITE.nx * db, SITE.uz * da + SITE.nz * db);
      o.grp.rotation.order = 'YXZ'; o.grp.rotation.set(Math.PI / 2 - 0.1, dir, 0);
      o.grp.position.set(o.x - Math.sin(dir) * 0.8, -0.32 + Math.sin(o.ph * 3) * 0.03, o.z - Math.cos(dir) * 0.8);
      u.armL.rotation.x = o.ph * 5; u.armR.rotation.x = o.ph * 5 + Math.PI;
      u.legL.rotation.x = Math.sin(o.ph * 8) * 0.3; u.legR.rotation.x = -Math.sin(o.ph * 8) * 0.3;
      if (dep < 0.5) o.swim = false;
    } else {                                            // стоит в воде, плещется
      o.grp.rotation.order = 'XYZ'; o.grp.rotation.set(0, o.h + Math.sin(o.ph * 0.4) * 0.5, 0);
      o.grp.position.set(o.x, gy + Math.sin(o.ph * 1.7) * 0.04, o.z);
      const sw = Math.sin(o.ph * 3);
      u.armL.rotation.x = -0.6 + sw * 0.6; u.armR.rotation.x = -0.6 - sw * 0.6;
      u.legL.rotation.x = u.legR.rotation.x = 0;
      if (dep > 0.7 && Math.random() < dt * 0.05) o.swim = true;
    }
  } else if (o.t === 'walk') {
    o.a += o.dir * 1.1 * dt;
    if (Math.abs(o.a) > 50) o.dir = -Math.sign(o.a);
    [o.x, o.z] = W(o.a, o.b);
    const dir = Math.atan2(SITE.ux * o.dir, SITE.uz * o.dir);
    o.grp.rotation.order = 'XYZ'; o.grp.rotation.set(0, dir, 0);
    o.grp.position.set(o.x, A.groundH(o.x, o.z), o.z);
    const sw = Math.sin(o.ph * 6) * 0.7;
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw; u.armL.rotation.x = -sw * 0.6; u.armR.rotation.x = sw * 0.6;
  } else {                                              // ларёк: продавец и покупатель; сбитый и вставший — стоит
    o.grp.rotation.order = 'XYZ'; o.grp.rotation.set(0, d < 14 ? look : o.h, 0);
    o.grp.position.set(o.x, gy + (o.t === 'seller' ? 0.25 : 0), o.z);
    if (o.t !== 'stand') u.armR.rotation.x = o.t === 'buyer' ? -1.3 + Math.sin(o.ph * 1.1) * 0.25 : -0.9 + Math.sin(o.ph * 0.9) * 0.4;
  }
  if (d < 14 && sp > 4 && !o.say && (o.sayCd -= dt) <= 0 && A.sayBubble) {
    o.say = A.sayBubble(o.grp, t(LINES[(Math.random() * LINES.length) | 0]), '#2e6fb8'); o.sayT = 2.4; o.sayCd = rand(8, 14);
  }
}

/* ═════════════ 6. клиент заказа ═════════════ */
const CLIENTS = new Set();
/* место под полотенце клиента: свободное, не у загорающих и не у другого клиента */
export function orderSpot () {
  if (!SITE || !SPOTS.length) return null;
  const busy = [...CLIENTS].map(p => p.towel).filter(Boolean);
  const ok = SPOTS.filter(s => !busy.some(b => Math.hypot(b.x - s.x, b.z - s.z) < 5));
  return ok.length ? ok[(Math.random() * ok.length) | 0] : null;
}
/* переодеть клиента в пляжное (до вручения: портрет и имя — уже пляжные) */
export function dress (p) {
  if (!A || !p || p.dead) return;
  const fem = !!(p.person && p.person.look && p.person.look.f);
  A.dropMesh(p.grp);
  p.person = beachPerson(fem);
  p.grp = makeBeachHuman(p.person);
  if (p.base) p.speed = p.base * p.grp.userData.pace;
  A.scene.add(p.grp);
}
/* лечь на полотенце: оно — своим мешем под ним */
export function lieDown (p) {
  if (!A || !p) return;
  const s = SPOTS.reduce((m, q) => (Math.hypot(q.x - p.x, q.z - p.z) < Math.hypot(m.x - p.x, m.z - p.z) ? q : m), SPOTS[0] || { x: p.x, z: p.z, ry: 0 });
  const ry = Math.hypot(s.x - p.x, s.z - p.z) < 1 ? s.ry : Math.random() * 6.28;
  const towel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 1.9), new THREE.MeshLambertMaterial({ color: ['#e0503c', '#3c8fe0', '#f2c230', '#f08ab0'][(Math.random() * 4) | 0] }));
  towel.position.set(p.x, A.groundH(p.x, p.z) + 0.07, p.z); towel.rotation.y = ry;
  A.scene.add(towel);
  p.lie = 1; p.towel = { x: p.x, z: p.z, ry, mesh: towel };
  p.sitting = 0; p.sitAt = null;
  CLIENTS.add(p);
  STATS.orders++;
}
function standUp (p) {
  if (p.lie) { poseStand(p.grp); p.grp.rotation.y = Math.atan2(A.V.x - p.x, A.V.z - p.z); }
  p.lie = 0;
}
/* из guestStep: true — шаг сделан тут (лежит или сидит), дальше не идти */
export function lieStep (p, dt) {
  if (!p.lie || !p.towel) return false;
  if (p.served || p.dead) { standUp(p); return false; }
  const V = A.V, d = Math.hypot(V.x - p.x, V.z - p.z), y = A.groundH(p.x, p.z) + 0.07, u = p.grp.userData;
  p.ph = (p.ph || 0) + dt;
  if (d < 14) {                                     // курьер рядом — сидит и машет
    poseSit(p.grp, p.x, p.z, Math.atan2(V.x - p.x, V.z - p.z), y);
    u.armR.rotation.x = -2.6 + Math.sin(p.ph * 9) * 0.35; u.armR.rotation.z = -0.3;
  } else poseLie(p.grp, p.x, p.z, p.towel.ry, y, false);
  return true;
}
function clientsStep () {
  for (const p of CLIENTS) {
    if (p.guest && !p.dead && p.towel) continue;
    if (p.lie && !p.dead) standUp(p);
    p.lie = 0;
    if (p.towel && p.towel.mesh) { A.scene.remove(p.towel.mesh); p.towel.mesh.geometry.dispose(); p.towel.mesh.material.dispose(); }
    p.towel = null;
    CLIENTS.delete(p);
  }
}

/* ═════════════ 7. каждый кадр ═════════════ */
/* летнее стоит: тепло и без снега (поздняя весна — конец лета) */
export const summer = () => !!SITE && SEAS.warmth() < 0.02 && SEAS.snowAmt() < 0.01;
/* люди на пляже: летнее + день + без дождя */
export function open () {
  if (!summer() || !A) return false;
  const E = A.ENV || {};
  return (E.night || 0) < 0.45 && (E.rain || 0) < 0.35;
}
/* можно ли сейчас заказ на пляж: лето по календарю (сезон 0…1) и люди на пляже; sim — прогон смен без езды */
export function orderOk (sim) {
  if (!SITE || !SPOTS.length) return false;
  const s = ((SEAS.seasonValue() % 4) + 4) % 4;
  if (s >= 1) return false;
  return sim ? summer() : open();
}
export const center = () => (SITE ? { x: SITE.cx, z: SITE.cz } : null);

let scanT = 0;
export function step (dt) {
  if (!A || !SITE) return;
  clientsStep();
  const V = A.V, dc = Math.hypot(V.x - SITE.cx, V.z - SITE.cz);
  if ((scanT -= dt) <= 0) {
    scanT = 0.5;
    const on = summer();
    if (on !== SUMMER_ON) {
      SUMMER_ON = on;
      if (SUMMER_MESH) SUMMER_MESH.visible = on;
      for (const it of ITEMS) it.down = on ? 0 : 1;      // зимой сносить нечего
      if (on) restore();
    }
    if (SHUT_MESH) SHUT_MESH.visible = !open();
    // сбитое встаёт, пока тебя нет
    if (on && dc > PEOPLE.RESET && ITEMS.some(it => it.down)) restore();
    const want = open() && dc < PEOPLE.R;
    if (want && !MOBS.length && !QUEUE.length) spawnPeople();
    else if ((MOBS.length || QUEUE.length) && (!open() || dc > PEOPLE.DROP)) dropPeople();
  }
  for (let k = 0; k < SPAWN_N && QUEUE.length; k++) { QUEUE.shift()(); STATS.live = MOBS.length; }
  if (MOBS.length) {
    const sp = Math.hypot(V.vx, V.vz);
    for (const o of MOBS) mobStep(o, dt, sp);
  }
  dust(dt);
}
function restore () {
  if (!SUMMER_MESH || !SUMMER_POS) return;
  const pos = SUMMER_MESH.geometry.attributes.position;
  pos.array.set(SUMMER_POS);
  pos.needsUpdate = true;
  for (const it of ITEMS) it.down = 0;
}

export const DEBUG = {
  SHAPE, SAND, PEOPLE, ORDER, STATS, SPOTS, PROPS, NPC_TOWELS, MOBS, CLIENTS,
  get site () { return SITE; },
  /* участок для проверки «постройки не на дороге»: середина, ось вдоль воды, W × D (песок с ларьком и кабинкой) */
  get rect () { if (!SITE) return null; const b0 = -SHAPE.OUT, b1 = SHAPE.SAND_IN + 3, [x, z] = W(0, (b0 + b1) / 2); return { x, z, ux: SITE.ux, uz: SITE.uz, W: SHAPE.HALF * 2, D: b1 - b0 }; }, loc: (x, z) => (SITE ? { a: +locA(x, z).toFixed(1), b: +locB(x, z).toFixed(1) } : null), at: (a, b) => (SITE ? W(a, b) : null),
  sandAt, wade, open, summer, orderOk, orderSpot,
  /* куда встать, чтобы увидеть пляж: на берегу выше песка, лицом к воде */
  view: (a = 0, b = 40) => { if (!SITE) return null; const [x, z] = W(a, b); return { x, z, h: Math.atan2(-SITE.nx, -SITE.nz) }; },
  live: () => MOBS.map(o => ({ t: o.t, x: +o.x.toFixed(1), z: +o.z.toFixed(1), dead: o.dead })),
};
