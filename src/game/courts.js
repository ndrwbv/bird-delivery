/* ──────────────────────────────────────────────────────────────────────────
   Теннисные и падел-корты (автор 11.10.2026: «падел- и теннисные корты — в дворах и у спорткомплексов:
   сетка-ограда, разметка, иногда играют люди (мяч летает); сбиваемая сетка; в духе контраста — новенький
   падел-корт у особняков рядом с облезлой коробкой»). Правила словами — docs/CAREER.md «Город: как выглядит» →
   «Теннисные и падел-корты».

   Где (жребий по месту — каждый запуск те же):
     • теннисные корты из карты (площадки с «теннис» в названии — у спортшколы) — на их месте;
     • у спорткомплексов, спортшкол, школ, гимназий и стадиона — облезлый теннисный корт рядом (до CT.N.sport);
     • во дворах многоэтажек — облезлый корт на большом газоне (до CT.N.yard, не ближе CT.GAP.yard м друг к другу);
     • у особняков — новенькие падел-корты (до CT.N.padel): синий пол, стеклянные стенки, чёрные столбы,
       прожекторы, баннер-пародия; ближе к облезлой футбольной коробке — лучше (контраст).
   Место корта — прямоугольник с запасом: не дом, не дорога и не проезд (до края полотна CT.FREE.ROAD м), не тротуар,
   дорожка и аллея, не карман парковки, не площадка, стоянка, вода, лес, не дерево и не мелочь двора, не клумба и
   лесочек лабиринта, не ближе CT.FREE.DOOR м к подъезду, не у пиццерии, точки конкурента, стройки; почти ровно.

   Ограда — столбы твёрдые (SOLIDS, как столб), полотно сетки и стёкла падела — сбиваемые секции (smashMesh: пробил —
   дыра, летят прутья / осколки). У облезлых — рваные секции с дырой внизу, пропавшие, покосившиеся; разметка выцвела
   и местами стёрлась, сетки посередине может не быть. Пол облезлых — в общей статике (LITM): зимой его заметает снег
   (шейдер сезона); у части пол сине-серый — зимой «залит», выглядит льдом. Пол падела — без снега (FLATM): чистят.

   Люди — только рядом с курьером, днём: подъехал ближе CT.ACT.WANT м — жребий занятия (CT.P): играют 2—4 (мяч летает
   дугами с отскоком, ракетки), зимой — кто-то чистит снег лопатой, на «залитых» катаются на коньках. Уехал дальше
   CT.ACT.DROP м — уходят. Сбиваются, как прохожие (hits.js).

   Кадр: пол, линии, столбы, рамы — в общих склейках статики; сетка всех кортов — один меш (текстура-рабица), стёкла —
   один прозрачный меш, таблички — один меш: +3 вызова на город. Люди — из запаса (humanpool.js), по одному за кадр.

     COURTS.build(api)      — LATE-шаг (после горок дворов, до smashBuild)
     COURTS.blocks(x, z, r) — точка в корте (мелочь газона, ельник, сцены жизни дворов туда не встают)
     COURTS.step(dt)        — каждый кадр (CL.step)
   ?nocourts — без кортов (сравнить). Отладка — __dlv.COURTS (LIST, ST, force('play'|'shovel'|'skate')).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t, N_ } from '../i18n/index.js';
import { holdFixed } from './people.js';
import * as SEAS from './seasons.js';
import * as HITS from './hits.js';
import * as YMAZE from './yardmaze.js';
import { wet } from './streams.js';
import { inView } from './cull.js';

export const CT = {
  TEN: { PL: 23.77, PW: 10.97, SGL: 8.23, SVC: 6.40, YARD: [32, 16], SPORT: [34, 17.5], H: 3, H_LOW: 2.4, PANEL: 2.6, NET_H: 0.95 },
  PAD: { L: 20, W: 10, SVC: 6.95, PANEL: 2.5, GLASS: 3, TOP: 4, NET_H: 0.9, M: 1.2 },
  N: { yard: 9, sport: 5, padel: 3 },
  GAP: { yard: 280, sport: 110, padel: 24, any: 36 },
  FREE: { HOUSE: 2.5, VILLA: 4, ROAD: 2.5, PAVE: 0.8, DOOR: 10, SLOPE: 1.5, STEP: 2.5, M: 1.5 },
  SHABBY: { MISS: 0.06, HOLE: 0.2, LEAN: 0.1, LINE_GONE: 0.25, NO_NET: 0.3, ICE: 0.35 },
  FLOOR: 0.08, PATCH: 0.095, LINE: 0.11,          // высота пола, заплат и линий над землёй, м
  ACT: { WANT: 150, DROP: 210, MAX: 2, SCAN: 1, ANIM: 60, BALL: 0.11 },
  /* шансы занятия, когда курьер подъехал: [игра, лопата, коньки]; зимой — снег лежит */
  P: {
    sum: { tennis: [0.55, 0, 0], ice: [0.5, 0, 0], padel: [0.75, 0, 0] },
    win: { tennis: [0.12, 0.35, 0], ice: [0.05, 0.15, 0.5], padel: [0.45, 0.2, 0] },
  },
};
export const ST = { ms: 0, tried: 0, osm: 0, sport: 0, yard: 0, padel: 0, panels: 0, holes: 0, gone: 0, glass: 0, acts: 0, people: 0, hits: 0, falls: 0, rej: {} };
export const LIST = [];                           // корты: { kind, where, x, z, ux, uz, L, W, shabby, ice, gy, act }

const LINES = {
  tennis: [N_('аут!'), N_('было в линию!'), N_('подача!'), N_('пятнадцать — ноль'), N_('гейм!'), N_('сетка!')],
  padel: [N_('в стекло его!'), N_('мой мяч!'), N_('отличный удар, Аркадий!'), N_('после — в барбершоп'), N_('гейм, сет, яхта')],
  shovel: [N_('весной сыграем'), N_('кто тут ездит?!'), N_('опять намело')],
  skate: [N_('держи меня!'), N_('лёд — огонь'), N_('и-и-и!')],
};
const SIGNS = [
  { h: N_('PADEL «ЭЛИТ-ПРЕСТИЖ-ЛЮКС»'), s: N_('аренда корта — по записи у охраны'), bg: '#0d1b2e', fg: '#f2d680', ac: '#2f6fd3' },
  { h: N_('ТЕННИСНЫЙ КОРТ'), s: N_('ремонт с 1994 г.'), bg: '#5f6d5a', fg: '#efe9da', ac: '#a8452f' },
  { h: N_('С СОБАКАМИ НЕ ВХОДИТЬ'), s: N_('и на машинах тоже'), bg: '#7a3b2a', fg: '#f4ead6', ac: '#f4ead6' },
];

let A = null, OFF = false;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const chance = p => Math.random() < p;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const gk = (i, j) => (i + 8192) * 16384 + j + 8192;
function hsh (x, z, k) {
  let h = Math.imul(Math.round(x * 4) ^ 0x51ed27, 0x9E3779B1) ^ Math.imul(Math.round(z * 4) + k * 1013904223, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function rng (x, z, k) {
  let a = (hsh(x, z, k) * 4294967296) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let q = a; q = Math.imul(q ^ (q >>> 15), q | 1); q ^= q + Math.imul(q ^ (q >>> 7), q | 61); return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
}
const rej = k => { ST.rej[k] = (ST.rej[k] || 0) + 1; return false; };
const segD = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
  return Math.hypot(ax + dx * k - x, az + dz * k - z);
};

/* ── занято кортом: точка внутри прямоугольника (с запасом r) ── */
const CG = new Map(), CGC = 40;
export function blocks (x, z, r = 0) {
  const a = CG.get(gk(Math.floor(x / CGC), Math.floor(z / CGC)));
  if (!a) return false;
  for (const c of a) {
    const dx = x - c.x, dz = z - c.z, u = dx * c.ux + dz * c.uz, v = -dx * c.uz + dz * c.ux;
    if (Math.abs(u) < c.L / 2 + 0.6 + r && Math.abs(v) < c.W / 2 + 0.6 + r) return true;
  }
  return false;
}
function index (c) {
  const R = Math.hypot(c.L, c.W) / 2 + 12;
  for (let i = Math.floor((c.x - R) / CGC); i <= Math.floor((c.x + R) / CGC); i++)
    for (let j = Math.floor((c.z - R) / CGC); j <= Math.floor((c.z + R) / CGC); j++) {
      const k = gk(i, j);
      let a = CG.get(k);
      if (!a) CG.set(k, a = []);
      a.push(c);
    }
}

/* ── сетки на время сборки (как yardmaze.js) ── */
let SG = null, SMG = null, ALLG = null, LOTG = null, RAILG = null, CLG = null, FUEL = [];
function idx (Gr, C, x0, z0, x1, z1, v) {
  for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++)
    for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) {
      const k = gk(i, j);
      let a = Gr.get(k);
      if (!a) Gr.set(k, a = []);
      a.push(v);
    }
}
function near (Gr, C, x, z, r, fn) {
  for (let i = Math.floor((x - r) / C); i <= Math.floor((x + r) / C); i++)
    for (let j = Math.floor((z - r) / C); j <= Math.floor((z + r) / C); j++) {
      const a = Gr.get(gk(i, j));
      if (a) for (let k = 0; k < a.length; k++) if (fn(a[k])) return true;
    }
  return false;
}
const solidNear = (x, z, r) => near(SG, 30, x, z, r + 12, s => {
  if (s.deckY !== undefined) return false;
  const dx = x - s.cx, dz = z - s.cz, lx = dx * s.cs + dz * s.sn, lz = -dx * s.sn + dz * s.cs;
  return Math.abs(lx) < s.hw + r && Math.abs(lz) < s.hd + r;
});
const smashNear = (x, z, r) => near(SMG, 20, x, z, r + 2, it => !it.down && Math.hypot(it.x - x, it.z - z) < r + Math.min(it.r || 1, 1.6));
const entNear = (x, z, r) => near(ALLG, 20, x, z, r, e => Math.abs(e[0] - x) < r && Math.abs(e[1] - z) < r && Math.hypot(e[0] - x, e[1] - z) < r);
const inBox = (b, x, z, m) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m;
const inArea = (x, z) => near(LOTG, 40, x, z, 0, b => inBox(b, x, z, 0) && A.inPoly(x, z, b.p));
const railNear = (x, z, r) => near(RAILG, 20, x, z, 0, q => segD(x, z, q[0], q[1], q[2], q[3]) < r);
function taken (x, z) {
  if (A.pzBlocks(x, z, 3) || A.rivBlocks(x, z, 4) || A.startClear(x, z)) return true;
  for (const P of A.pizzerias()) if (P && Math.hypot(P.x - x, P.z - z) < 45) return true;
  if (near(CLG, 40, x, z, 0, c => Math.hypot(c.x - x, c.z - z) < c.r + 4)) return true;
  for (const p of FUEL) if (inBox(p, x, z, 8)) return true;
  return false;
}

/* свободен ли прямоугольник L × W (середина cx, cz, ось ux, uz) под корт; o.house — запас от домов, o.loose — корт из карты */
function rectFree (cx, cz, ux, uz, L, W, o = {}) {
  const F = CT.FREE, m = F.M, nx = -uz, nz = ux;
  ST.tried++;
  if (o.loose) { if (blocks(cx, cz, 3)) return rej('корт'); }
  else for (const c of LIST) if (Math.hypot(c.x - cx, c.z - cz) < (Math.hypot(c.L, c.W) + Math.hypot(L, W)) / 2 + 3) return rej('корт');
  const nu = Math.max(2, Math.ceil((L + 2 * m) / F.STEP)), nv = Math.max(2, Math.ceil((W + 2 * m) / F.STEP));
  let h0 = Infinity, h1 = -Infinity;
  // сначала дешёвое по всем точкам, потом дорогое
  const pts = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const a = -L / 2 - m + (L + 2 * m) * i / nu, b = -W / 2 - m + (W + 2 * m) * j / nv;
    const x = cx + ux * a + nx * b, z = cz + uz * a + nz * b;
    if (!A.inBounds(x, z, -30)) return rej('край');
    const h = A.groundH(x, z);
    if (h < 0.3) return rej('вода');
    if (h < h0) h0 = h; if (h > h1) h1 = h;
    pts.push(x, z);
  }
  if (h1 - h0 > (o.loose ? 2.5 : F.SLOPE)) return rej('склон');
  if (wet(cx, cz, Math.hypot(L, W) / 2 + 2)) return rej('вода');
  for (let k = 0; k < pts.length; k += 2) {
    const x = pts[k], z = pts[k + 1];
    if (A.inHouse(x, z, o.house || F.HOUSE)) return rej('дом');
    const nr = A.nearestRoad(x, z, 7, 2);
    if (nr && nr.d < nr.seg.w / 2 + F.ROAD) return rej('дорога');
    if (A.onPave(x, z, F.PAVE)) return rej('дорожка');
    if (o.loose) continue;
    if (A.onAlley(x, z, 1)) return rej('аллея');
    if (entNear(x, z, F.DOOR)) return rej('подъезд');
    if (A.ycBlocks(x, z, 1) || A.yardBlocks(x, z, 0.8)) return rej('карман');
    if (YMAZE.blocks(x, z, 0.8)) return rej('лабиринт');
    if (solidNear(x, z, 0.9)) return rej('твёрдое');
    if (smashNear(x, z, 0.8)) return rej('мелочь');
    if (inArea(x, z)) return rej('площадка');
    if (railNear(x, z, 5)) return rej('рельсы');
    if (taken(x, z)) return rej('занято');
  }
  if (!o.loose) for (const p of A.PITCHES) if (Math.hypot(p.cx - cx, p.cz - cz) < Math.hypot(p.L || 0, p.W || 0) / 2 + Math.hypot(L, W) / 2 + 2) return rej('поле');
  return { h0, h1 };
}

/* ── геометрия ── */
let LIT = null;
const NET = { P: [], N: [], U: [], C: [], I: [], items: [] };      // сетка всех кортов — один меш
const GLS = { P: [], N: [], I: [], items: [] };                    // стёкла падела — один меш
const SGN = { P: [], N: [], U: [], I: [] };                        // таблички и баннеры — один меш
const ICE = { P: [], I: [] };                                      // лёд «залитых» кортов — один меш, виден, когда лежит снег
let ICE_M = null;
const tmpC = new THREE.Color();
/* вертикальный четырёхугольник сетки: низ (x1, y1, z1)—(x2, y2, z2), высота h; lean — наклон верха наружу (nx, nz), м; uv — по метрам */
function netQuad (x1, y1, z1, x2, y2, z2, ya, yb, hex, lean = 0, tile = 0.5, u0 = 0) {
  const P = NET.P, vi = P.length / 3, dx = x2 - x1, dz = z2 - z1, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
  const la = lean * ya / Math.max(0.01, yb), lb = lean;
  P.push(x1 + nx * la, y1 + ya, z1 + nz * la, x2 + nx * la, y2 + ya, z2 + nz * la, x2 + nx * lb, y2 + yb, z2 + nz * lb, x1 + nx * lb, y1 + yb, z1 + nz * lb);
  for (let k = 0; k < 4; k++) NET.N.push(nx, 0, nz);
  const ua = u0 / tile, ub = (u0 + l) / tile;
  NET.U.push(ua, ya / tile, ub, ya / tile, ub, yb / tile, ua, yb / tile);
  tmpC.set(hex);
  for (let k = 0; k < 4; k++) NET.C.push(tmpC.r, tmpC.g, tmpC.b);
  NET.I.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
  return vi;
}
function glassQuad (x1, y1, z1, x2, y2, z2, ya, yb) {
  const P = GLS.P, vi = P.length / 3, dx = x2 - x1, dz = z2 - z1, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
  P.push(x1, y1 + ya, z1, x2, y2 + ya, z2, x2, y2 + yb, z2, x1, y1 + yb, z1);
  for (let k = 0; k < 4; k++) GLS.N.push(nx, 0, nz);
  GLS.I.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
  return vi;
}
/* табличка: середина (x, y, z), смотрит по (fx, fz), w × h, клетка атласа cell (0…SIGNS.length-1); с двух сторон */
function signQuad (x, y, z, fx, fz, w, h, cell) {
  const tx = fz, tz = -fx, v0 = 1 - (cell + 1) / SIGNS.length, v1 = 1 - cell / SIGNS.length;
  for (const sd of [1, -1]) {
    const P = SGN.P, vi = P.length / 3, ox = fx * 0.03 * sd, oz = fz * 0.03 * sd, s = sd;
    P.push(x - tx * w / 2 * s + ox, y - h / 2, z - tz * w / 2 * s + oz, x + tx * w / 2 * s + ox, y - h / 2, z + tz * w / 2 * s + oz,
      x + tx * w / 2 * s + ox, y + h / 2, z + tz * w / 2 * s + oz, x - tx * w / 2 * s + ox, y + h / 2, z - tz * w / 2 * s + oz);
    for (let k = 0; k < 4; k++) SGN.N.push(fx * sd, 0, fz * sd);
    SGN.U.push(0, v0, 1, v0, 1, v1, 0, v1);
    SGN.I.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
  }
}
function netTex () {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 64, 64);
  x.strokeStyle = '#ffffff'; x.lineWidth = 3.2; x.lineCap = 'square';
  for (const o of [-64, -32, 0, 32, 64]) {
    x.beginPath(); x.moveTo(o, 0); x.lineTo(o + 64, 64); x.stroke();
    x.beginPath(); x.moveTo(o + 64, 0); x.lineTo(o, 64); x.stroke();
  }
  const tx = new THREE.CanvasTexture(c);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 4;
  return tx;
}
function signTex () {
  const W = 512, H = 128, c = document.createElement('canvas');
  c.width = W; c.height = H * SIGNS.length;
  const x = c.getContext('2d');
  SIGNS.forEach((s, i) => {
    const y = i * H;
    x.fillStyle = s.bg; x.fillRect(0, y, W, H);
    x.fillStyle = s.ac; x.fillRect(0, y, W, 10); x.fillRect(0, y + H - 10, W, 10);
    x.fillStyle = s.fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    const fit = (txt, px, yy, bold) => { let p = px; do { x.font = (bold ? '900 ' : '600 ') + p + 'px sans-serif'; p -= 2; } while (x.measureText(txt).width > W - 30 && p > 10); x.fillText(txt, W / 2, yy); };
    fit(t(s.h), 50, y + 48, true);
    fit(t(s.s), 28, y + 96, false);
    if (i) {                                      // облезлая: ржавые потёки
      x.fillStyle = 'rgba(120,60,30,0.45)';
      for (let k = 0; k < 9; k++) { const px = (k * 61 + 17) % W; x.fillRect(px, y + 10, 4 + (k % 3) * 2, 20 + (k * 13) % 50); }
    }
  });
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

/* столб: коробка в статике и твёрдое (как столб) */
function post (x, z, h, hex, s = 0.1) {
  A.box(LIT, s, h, s, hex, x, A.groundH(x, z) + h / 2, z);
  A.obb(x, z, s / 2 + 0.03, s / 2 + 0.03, 0);
}
/* балка: коробка от (ax, ay, az) до (bx, by, bz), толщина s */
function beam (ax, ay, az, bx, by, bz, s, hex) {
  const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
  if (l < 0.05) return;
  A.box(LIT, l + s, s, s, hex, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, Math.atan2(-dz, dx));
}

/* разметка: линия от (a0, b0) до (a1, b1) в осях корта; gone — доля стёртых кусков (облезлые) */
function line (c, M, a0, b0, a1, b1, w, hex, gone, r) {
  const P = (a, b) => [c.x + c.ux * a - c.uz * b, c.z + c.uz * a + c.ux * b];
  const L = Math.hypot(a1 - a0, b1 - b0), n = gone ? Math.max(1, Math.round(L / 1.6)) : 1;
  M.color(hex);
  for (let k = 0; k < n; k++) {
    if (gone && r() < gone) continue;
    const q0 = k / n, q1 = (k + 1) / n;
    const [x1, z1] = P(a0 + (a1 - a0) * q0, b0 + (b1 - b0) * q0), [x2, z2] = P(a0 + (a1 - a0) * q1, b0 + (b1 - b0) * q1);
    M.ribbon(x1, z1, x2, z2, w, CT.LINE);
  }
}

/* ══════════ теннисный корт (облезлый) ══════════ */
const OLD_FLOOR = ['#557d70', '#a5684f', '#707274', '#6b7d5e'];
const ICE_FLOOR = '#7d93a8';                       // сине-серый: зимой шейдер сезона кладёт лёд, а не снег
const POST_HEX = ['#2f4a3a', '#3a3d42', '#5a4a3a', '#33503f'];
const MESH_HEX = ['#9aa39a', '#8c948d', '#a3a08f', '#7f8a86'];
function tennis (c) {
  const T = CT.TEN, S = CT.SHABBY, r = rng(c.x, c.z, 3), M = A.LITM;
  const nx = -c.uz, nz = c.ux, P = (a, b) => [c.x + c.ux * a + nx * b, c.z + c.uz * a + nz * b];
  const L = c.L, W = c.W;
  c.ice = r() < S.ICE;
  // пол — по рельефу, на CT.FLOOR над землёй
  M.color(c.ice ? ICE_FLOOR : OLD_FLOOR[(r() * OLD_FLOOR.length) | 0]);
  M.poly([P(-L / 2, -W / 2), P(L / 2, -W / 2), P(L / 2, W / 2), P(-L / 2, W / 2)], CT.FLOOR);
  if (c.ice) iceRect(c, L - 0.6, W - 0.6);
  // заплаты и трещины: асфальт латали кусками
  const np = 3 + ((r() * 5) | 0);
  for (let k = 0; k < np; k++) {
    const a = (r() - 0.5) * (L - 3), b = (r() - 0.5) * (W - 3), w = 0.8 + r() * 2.6, d = 0.6 + r() * 1.8, ang = r() * 3;
    const ca = Math.cos(ang), sa = Math.sin(ang), Q = (p, q) => P(a + p * ca - q * sa, b + p * sa + q * ca);
    M.color(r() < 0.5 ? '#4b4d4f' : '#5c5a55');
    M.poly([Q(-w / 2, -d / 2), Q(w / 2, -d / 2), Q(w / 2, d / 2), Q(-w / 2, d / 2)], CT.PATCH);
  }
  for (let k = 0; k < 3; k++) {                   // трещины — тёмные кривые полоски
    M.color('#3a3b3d');
    let a = (r() - 0.5) * L * 0.8, b = (r() - 0.5) * W * 0.8, ang = r() * 6.28;
    for (let s = 0; s < 4; s++) {
      const a2 = a + Math.cos(ang) * 1.6, b2 = b + Math.sin(ang) * 1.6;
      if (Math.abs(a2) > L / 2 - 0.5 || Math.abs(b2) > W / 2 - 0.5) break;
      const [x1, z1] = P(a, b), [x2, z2] = P(a2, b2);
      M.ribbon(x1, z1, x2, z2, 0.07, CT.PATCH);
      a = a2; b = b2; ang += (r() - 0.5) * 1.4;
    }
  }
  // разметка: выцветшая, местами стёрлась
  const lh = r() < 0.3 ? '#d8cf9e' : '#dedbd0', gone = S.LINE_GONE * (0.5 + r()), pl = T.PL / 2, pw = T.PW / 2, sg = T.SGL / 2, sv = T.SVC;
  for (const s of [-1, 1]) {
    line(c, M, s * pl, -pw, s * pl, pw, 0.1, lh, gone, r);             // задняя
    line(c, M, -pl, s * pw, pl, s * pw, 0.06, lh, gone, r);            // боковые парные
    line(c, M, -pl, s * sg, pl, s * sg, 0.06, lh, gone, r);            // одиночные
    line(c, M, s * sv, -sg, s * sv, sg, 0.06, lh, gone, r);            // линии подачи
    line(c, M, s * pl, -0.0, s * (pl - 0.3), 0, 0.06, lh, 0, r);       // метка середины
  }
  line(c, M, -sv, 0, sv, 0, 0.06, lh, gone, r);                        // средняя линия подачи
  // сетка посередине (у трети нет — одни столбики)
  const ph = '#3d4a44';
  const [ax, az] = P(0, -pw - 0.9), [bx, bz] = P(0, pw + 0.9);
  for (const [x, z] of [[ax, az], [bx, bz]]) post(x, z, 1.1, ph, 0.09);
  if (r() >= S.NO_NET) {
    const gy = c.gy, sag = r() < 0.3, [mx, mz] = P(0, 0);
    for (const [x1, z1, x2, z2] of [[ax, az, mx, mz], [mx, mz, bx, bz]]) {
      const half = r() < 0.12;                    // половина сетки свисла до земли
      const vi = netQuad(x1, gy, z1, x2, gy, z2, half ? 0.02 : 0.12, half ? 0.35 : (sag ? 0.72 : CT.TEN.NET_H), '#2a2d30', 0, 0.16);
      NET.items.push(['bigfence', (x1 + x2) / 2, (z1 + z2) / 2, 2.6, vi, 4, '#2a2d30']);
    }
    if (!sag) beam(ax, gy + T.NET_H, az, bx, gy + T.NET_H, bz, 0.05, '#e8e4da');   // белая лента поверху
  }
  // ограда: столбы, верхняя труба, полотно сетки секциями
  const H = r() < 0.3 ? T.H_LOW : T.H, phex = POST_HEX[(r() * POST_HEX.length) | 0], mhex = MESH_HEX[(r() * MESH_HEX.length) | 0];
  const gate = { side: (r() * 4) | 0, at: r() < 0.5 ? 1 : -1 };
  fenceRect(c, L, W, H, T.PANEL, phex, mhex, true, gate, r);
  // табличка у калитки, лавка, вышка судьи (ржавая) — у части
  const fx = gate.side < 2 ? (gate.side ? 1 : -1) : 0, fz2 = gate.side >= 2 ? (gate.side === 3 ? 1 : -1) : 0;
  {
    const a = fx ? fx * (L / 2 + 0.06) : gate.at * (L / 2 - 4.5), b = fz2 ? fz2 * (W / 2 + 0.06) : gate.at * (W / 2 - 3.5);
    const [sx, sz] = P(a, b), fwx = c.ux * fx + nx * fz2, fwz = c.uz * fx + nz * fz2;
    signQuad(sx, A.groundH(sx, sz) + 1.6, sz, fwx, fwz, 1.5, 0.38, r() < 0.6 ? 1 : 2);
  }
  if (r() < 0.6) {                                // лавка у сетки внутри
    const [x, z] = P((r() - 0.5) * L * 0.4, -(W / 2 - 0.8)), gy = A.groundH(x, z) + CT.FLOOR, ry = Math.atan2(-c.uz, c.ux);
    A.box(LIT, 2.2, 0.08, 0.42, '#7a5a3a', x, gy + 0.45, z, ry);
    for (const o of [-0.9, 0.9]) A.box(LIT, 0.08, 0.45, 0.38, '#3a3d42', x + c.ux * o, gy + 0.22, z + c.uz * o, ry);
  }
  if (r() < 0.45) {                               // вышка судьи
    const [x, z] = P(0, pw + 2), gy = A.groundH(x, z) + CT.FLOOR, ry = Math.atan2(-c.uz, c.ux);
    for (const [o, q] of [[-0.35, -0.3], [0.35, -0.3], [-0.35, 0.3], [0.35, 0.3]]) A.box(LIT, 0.06, 1.7, 0.06, '#6b4a3a', x + c.ux * o + nx * q, gy + 0.85, z + c.uz * o + nz * q, ry);
    A.box(LIT, 0.8, 0.07, 0.7, '#6b4a3a', x, gy + 1.7, z, ry);
    A.box(LIT, 0.8, 0.5, 0.06, '#6b4a3a', x + nx * 0.33, gy + 1.95, z + nz * 0.33, ry);
  }
}

/* ограда прямоугольником L × W (по оси корта): столбы через panel м, полотно секциями; shabby — рваное;
   gate — калитка: сторона 0…3 (u−, u+, v−, v+), с какого конца */
function fenceRect (c, L, W, H, panel, phex, mhex, shabby, gate, r) {
  const S = CT.SHABBY, nx = -c.uz, nz = c.ux, P = (a, b) => [c.x + c.ux * a + nx * b, c.z + c.uz * a + nz * b];
  const sides = [[-L / 2, W / 2, -L / 2, -W / 2], [L / 2, -W / 2, L / 2, W / 2], [L / 2, -W / 2, -L / 2, -W / 2], [-L / 2, W / 2, L / 2, W / 2]];
  sides.forEach(([a0, b0, a1, b1], si) => {
    const len = Math.hypot(a1 - a0, b1 - b0), n = Math.max(1, Math.round(len / panel));
    const gk2 = gate.side === si ? (gate.at > 0 ? n - 2 : 1) : -1;
    let prevTop = null;
    for (let k = 0; k <= n; k++) {
      const [x, z] = P(a0 + (a1 - a0) * k / n, b0 + (b1 - b0) * k / n);
      if (si < 2 || (k > 0 && k < n)) post(x, z, H + 0.08, phex);          // угловые столбы — один раз
      const top = A.groundH(x, z) + H;
      if (prevTop) beam(prevTop[0], prevTop[1], prevTop[2], x, top, z, 0.06, phex);
      prevTop = [x, top, z];
      if (k === n) break;
      if (k === gk2) continue;                    // калитка — проём
      const [x2, z2] = P(a0 + (a1 - a0) * (k + 1) / n, b0 + (b1 - b0) * (k + 1) / n);
      const y1 = A.groundH(x, z), y2 = A.groundH(x2, z2), mx = (x + x2) / 2, mz = (z + z2) / 2, pl = len / n;
      if (shabby && r() < S.MISS) { ST.gone++; continue; }              // секции нет
      const lean = shabby && r() < S.LEAN ? (r() - 0.3) * 0.7 : 0;
      if (shabby && r() < S.HOLE) {               // дыра внизу: полотно — верх и два бока
        const h = 1.0 + r() * 0.9, w0 = 0.08 + r() * 0.25, w1 = 0.62 + r() * 0.3, ux = (x2 - x) / pl, uz = (z2 - z) / pl;
        const v0 = netQuad(x, y1, z, x2, y2, z2, h, H, mhex, lean);
        const xa = x + ux * pl * w0, za = z + uz * pl * w0, xb = x + ux * pl * w1, zb = z + uz * pl * w1, ya = A.groundH(xa, za), yb = A.groundH(xb, zb);
        netQuad(x, y1, z, xa, ya, za, 0.05, h, mhex, lean * h / H);
        netQuad(xb, yb, zb, x2, y2, z2, 0.05, h, mhex, lean * h / H, 0.5, pl * w1);
        NET.items.push(['bigfence', mx, mz, pl / 2 * 0.8, v0, 12, mhex]);
        ST.holes++;
      } else {
        const v0 = netQuad(x, y1, z, x2, y2, z2, 0.05, H - (shabby && r() < 0.15 ? r() * 0.6 : 0), mhex, lean);
        NET.items.push(['bigfence', mx, mz, pl / 2 * 0.8, v0, 4, mhex]);
      }
      ST.panels++;
    }
  });
}

/* лёд поверх пола (зимой «залит»): сетка по 4 м по рельефу */
function iceRect (c, L, W) {
  const nu = Math.ceil(L / 4), nv = Math.ceil(W / 4), v0 = ICE.P.length / 3;
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const [x, z] = W2(c, -L / 2 + L * i / nu, -W / 2 + W * j / nv);
    ICE.P.push(x, A.groundH(x, z) + CT.LINE + 0.012, z);
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = v0 + i * (nv + 1) + j, b = a + nv + 1;
    ICE.I.push(a, a + 1, b, b, a + 1, b + 1);
  }
}

/* ══════════ падел-корт (новенький) ══════════ */
function padel (c) {
  const Pd = CT.PAD, M = A.FLATM, nx = -c.uz, nz = c.ux, P = (a, b) => [c.x + c.ux * a + nx * b, c.z + c.uz * a + nz * b];
  const L = Pd.L, W = Pd.W, hl = L / 2, hw = W / 2;
  // пол: синий корт, вокруг — тёмная дорожка
  M.color('#26292f');                             // дорожка вокруг — рамкой, не под синим (не мерцает)
  const e = Pd.M;
  for (const [a0, b0, a1, b1] of [[-hl - e, -hw - e, hl + e, -hw], [-hl - e, hw, hl + e, hw + e], [-hl - e, -hw, -hl, hw], [hl, -hw, hl + e, hw]])
    M.poly([P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1)], CT.FLOOR);
  M.color('#2a63cf');
  M.poly([P(-hl, -hw), P(hl, -hw), P(hl, hw), P(-hl, hw)], CT.FLOOR);
  for (const s of [-1, 1]) line(c, M, s * Pd.SVC, -hw, s * Pd.SVC, hw, 0.05, '#f4f4f0', 0);
  line(c, M, -Pd.SVC, 0, Pd.SVC, 0, 0.05, '#f4f4f0', 0);
  // сетка
  const [ax, az] = P(0, -hw), [bx, bz] = P(0, hw), [mx, mz] = P(0, 0), gy = c.gy;
  for (const [x1, z1, x2, z2] of [[ax, az, mx, mz], [mx, mz, bx, bz]]) {
    const vi = netQuad(x1, gy, z1, x2, gy, z2, 0.1, Pd.NET_H, '#1c1e22', 0, 0.12);
    NET.items.push(['bigfence', (x1 + x2) / 2, (z1 + z2) / 2, 2.2, vi, 4, '#1c1e22']);
  }
  beam(ax, gy + Pd.NET_H, az, bx, gy + Pd.NET_H, bz, 0.05, '#f4f4f0');
  for (const [x, z] of [[ax, az], [bx, bz]]) post(x, z, 1.0, '#1c1e22', 0.08);
  // стенки: торцы — стекло 3 м + сетка до 4 м; бока — стекло у торцов, посередине сетка, проёмы-входы
  const blk = '#17181c', mhex = '#2b2e33';
  const wallSeg = (a0, b0, a1, b1, glassH, topH) => {
    const [x1, z1] = P(a0, b0), [x2, z2] = P(a1, b1), y1 = A.groundH(x1, z1), y2 = A.groundH(x2, z2), mx2 = (x1 + x2) / 2, mz2 = (z1 + z2) / 2;
    if (glassH > 0) {
      const vi = glassQuad(x1, y1, z1, x2, y2, z2, 0.04, glassH);
      GLS.items.push(['glass', mx2, mz2, 1.1, vi, 4, '#bfe6f2']); ST.glass++;
      beam(x1, y1 + glassH, z1, x2, y2 + glassH, z2, 0.07, blk);        // рама стекла
    }
    if (topH > glassH) {
      const vi = netQuad(x1, y1, z1, x2, y2, z2, glassH > 0 ? glassH : 0.04, topH, mhex, 0, 0.3);
      NET.items.push(['bigfence', mx2, mz2, 1.0, vi, 4, mhex]); ST.panels++;
    }
    beam(x1, y1 + topH, z1, x2, y2 + topH, z2, 0.08, blk);
  };
  const n = L / Pd.PANEL;
  for (const s of [-1, 1]) {
    // торец
    for (let k = 0; k < W / Pd.PANEL; k++) wallSeg(s * hl, -hw + k * Pd.PANEL, s * hl, -hw + (k + 1) * Pd.PANEL, Pd.GLASS, Pd.TOP);
    for (let k = 0; k <= W / Pd.PANEL; k++) { const [x, z] = P(s * hl, -hw + k * Pd.PANEL); post(x, z, Pd.TOP, blk, 0.12); }
    // бок
    for (let k = 0; k < n; k++) {
      const end = k === 0 || k === n - 1, near2 = k === 1 || k === n - 2, door = k === (s > 0 ? 3 : 4);
      if (door) continue;
      wallSeg(-hl + k * Pd.PANEL, s * hw, -hl + (k + 1) * Pd.PANEL, s * hw, end ? Pd.GLASS : near2 ? 2 : 0, end ? Pd.TOP : 3);
    }
    for (let k = 1; k < n; k++) { const [x, z] = P(-hl + k * Pd.PANEL, s * hw); post(x, z, k === 1 || k === n - 1 ? Pd.TOP : 3, blk, 0.1); }
  }
  // прожекторы по углам и посередине боков
  for (const [a, b] of [[-hl - 0.6, -hw - 0.6], [hl + 0.6, -hw - 0.6], [-hl - 0.6, hw + 0.6], [hl + 0.6, hw + 0.6], [0, -hw - 0.6], [0, hw + 0.6]]) {
    const [x, z] = P(a, b), y = A.groundH(x, z);
    post(x, z, 6.2, blk, 0.12);
    const [hx, hz] = P(a * 0.93, b * 0.85);
    A.box(LIT, 0.7, 0.12, 0.35, '#f4f4f0', hx, y + 6.15, hz, Math.atan2(-c.uz, c.ux));
  }
  // баннеры-пародии на торцах (снаружи и внутри — с двух сторон)
  for (const s of [-1, 1]) {
    const [x, z] = P(s * (hl + 0.05), 0);
    signQuad(x, A.groundH(x, z) + 0.75, z, c.ux * s, c.uz * s, 4.4, 1.1, 0);
  }
  // лавка с полотенцами у входа
  const [lx, lz] = P(-hl + 3.5 * Pd.PANEL + 1.25, -(hw + Pd.M - 0.4)), ly = A.groundH(lx, lz), ry = Math.atan2(-c.uz, c.ux);
  A.box(LIT, 1.8, 0.07, 0.4, '#f4f1ea', lx, ly + 0.46, lz, ry);
  A.box(LIT, 0.1, 0.44, 0.36, blk, lx - c.ux * 0.8, ly + 0.22, lz - c.uz * 0.8, ry);
  A.box(LIT, 0.1, 0.44, 0.36, blk, lx + c.ux * 0.8, ly + 0.22, lz + c.uz * 0.8, ry);
  A.box(LIT, 0.45, 0.06, 0.3, '#d9a43a', lx + c.ux * 0.4, ly + 0.52, lz + c.uz * 0.4, ry);
}

/* ══════════ где: кандидаты ══════════ */
function mainAxis (p) {
  let best = 0, ux = 1, uz = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > best) { best = l; ux = (b[0] - a[0]) / l; uz = (b[1] - a[1]) / l; }
  }
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (const q of p) { const a = q[0] * ux + q[1] * uz, b = -q[0] * uz + q[1] * ux; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
  const am = (a0 + a1) / 2, bm = (b0 + b1) / 2;
  return { x: am * ux - bm * uz, z: am * uz + bm * ux, ux, uz, len: a1 - a0, wid: b1 - b0 };
}
function add (kind, where, x, z, ux, uz, L, W, f) {
  if (uz < 0 || (uz === 0 && ux < 0)) { ux = -ux; uz = -uz; }
  const c = { kind, where, x, z, ux, uz, L, W, iL: kind === 'padel' ? CT.PAD.L : L, iW: kind === 'padel' ? CT.PAD.W : W, gy: f ? (f.h0 + f.h1) / 2 : A.groundH(x, z), shabby: kind === 'tennis', ice: false, act: null, near: 0, id: LIST.length };
  LIST.push(c);
  index(c);
  if (kind === 'tennis') tennis(c); else padel(c);
  ST[where]++;
  return c;
}
const farFrom = (x, z, gap, where) => LIST.every(c => (where && c.where !== where) || Math.hypot(c.x - x, c.z - z) >= gap);

/* 1) корты из карты: площадка с «теннис» в названии (бывает — целый комплекс: кладём кортов, сколько влезет) */
function overlaps (cx, cz, ux, uz, L, W) {
  const nx = -uz, nz = ux;
  for (const a of [-0.5, 0, 0.5]) for (const b of [-0.5, 0, 0.5]) if (blocks(cx + ux * a * L + nx * b * W, cz + uz * a * L + nz * b * W, 0.5)) return true;
  return false;
}
function osmCourts () {
  const polys = A.CITY.green.filter(g => g.k === 'pitch' && g.n && /теннис|tennis/i.test(g.n) && g.p && g.p.length > 2).map(g => ({ g, o: mainAxis(g.p) }));
  polys.sort((p, q) => p.o.len * p.o.wid - q.o.len * q.o.wid);
  const [L0, W0] = CT.TEN.SPORT;
  for (const { o } of polys) {
    if (o.len < CT.TEN.PL + 3 || o.wid < CT.TEN.PW + 2) continue;
    const na = Math.max(1, Math.floor(o.len / L0)), nb = Math.max(1, Math.floor(o.wid / W0));
    const L = Math.min(o.len / na, L0), W = Math.min(o.wid / nb, W0);
    for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) {
      const a = -o.len / 2 + o.len / na * (i + 0.5), b = -o.wid / 2 + o.wid / nb * (j + 0.5);
      const x = o.x + o.ux * a - o.uz * b, z = o.z + o.uz * a + o.ux * b;
      if (overlaps(x, z, o.ux, o.uz, L, W)) continue;
      const f = rectFree(x, z, o.ux, o.uz, L - 1, W - 1, { loose: true });
      if (f) add('tennis', 'osm', x, z, o.ux, o.uz, L - 0.6, W - 0.6, f);
    }
  }
}
/* 2) у спорткомплексов, спортшкол, школ, стадиона */
const SPORTY = /спорт|стадион|олимп|школ|гимнази|лице/i;
function* sportCourts () {
  const anchors = [];
  for (const b of A.CITY.buildings) {
    if (!b.n || !b.p || !SPORTY.test(b.n) || /искусств|музык|интернат/i.test(b.n)) continue;
    anchors.push({ p: b.p, sport: /спорт|олимп/i.test(b.n) ? 1 : 0 });
  }
  for (const g of A.CITY.green) if (g.n && g.p && /стадион|спорт-парк/i.test(g.n)) anchors.push({ p: g.p, sport: 1 });
  anchors.sort((a, b) => b.sport - a.sport || hsh(a.p[0][0], a.p[0][1], 5) - hsh(b.p[0][0], b.p[0][1], 5));
  const [L, W] = CT.TEN.SPORT;
  let n = 0;
  for (const an of anchors) {
    if (ST.sport >= CT.N.sport) break;
    const o = mainAxis(an.p), R0 = Math.hypot(o.len, o.wid) / 2;
    if (!farFrom(o.x, o.z, CT.GAP.sport)) continue;
    const r = rng(o.x, o.z, 41);
    let done = false;
    for (let d = R0 + 14; d < R0 + 70 && !done; d += 9) {
      for (let k = 0; k < 12 && !done; k++) {
        if (++n % 25 === 0) yield 'спорт';
        const a = (k / 12 + r() * 0.08) * Math.PI * 2, x = o.x + Math.cos(a) * d, z = o.z + Math.sin(a) * d;
        if (!farFrom(x, z, CT.GAP.sport)) continue;
        for (const [ux, uz] of [[o.ux, o.uz], [-o.uz, o.ux]]) {
          const f = rectFree(x, z, ux, uz, L, W);
          if (f) { add('tennis', 'sport', x, z, ux, uz, L, W, f); done = true; break; }
        }
      }
    }
  }
}
/* 3а) контраст: облезлый корт рядом с падел-клубом (если коробки рядом нет) */
function* contrastCourt () {
  const pads = LIST.filter(c => c.kind === 'padel');
  if (!pads.length) return;
  const cx = pads.reduce((s, c) => s + c.x, 0) / pads.length, cz = pads.reduce((s, c) => s + c.z, 0) / pads.length;
  for (const p of A.PITCHES) if (Math.hypot(p.cx - cx, p.cz - cz) < 160) return;            // облезлая коробка и так рядом
  for (const c of LIST) if (c.kind === 'tennis' && Math.hypot(c.x - cx, c.z - cz) < 160) return;
  const [L, W] = CT.TEN.YARD, r = rng(cx, cz, 71);
  let n = 0;
  for (let d = 45; d < 170; d += 10) for (let k = 0; k < 16; k++) {
    if (++n % 20 === 0) yield 'контраст';
    const a = (k / 16 + r() * 0.05) * Math.PI * 2, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    for (const [ux, uz] of [[pads[0].ux, pads[0].uz], [-pads[0].uz, pads[0].ux]]) {
      const f = rectFree(x, z, ux, uz, L, W);
      if (f) { add('tennis', 'yard', x, z, ux, uz, L, W, f).contrast = 1; return; }
    }
  }
}
/* 3) дворы многоэтажек: большой газон перед подъездом */
function resDoor (e) {
  const ix = e[0] - e[2] * 0.6, iz = e[1] - e[3] * 0.6;
  for (const b of A.HOUSE_GRID.get(Math.floor(ix / 40) + ',' + Math.floor(iz / 40)) || []) {
    if (!A.inPoly(ix, iz, b.p)) continue;
    if ((b.k && b.k !== 'res') || b.st === 'villa' || b.st === 'priv') return false;
    return (b.lvY !== undefined ? b.lvY : b.lv || 1) >= 3;
  }
  return false;
}
function* yardCourts () {
  const RES = [];
  for (const e of A.CITY.entrances) if (hsh(e[0], e[1], 51) < 0.35 && resDoor(e)) RES.push(e);
  RES.sort((a, b) => hsh(a[0], a[1], 52) - hsh(b[0], b[1], 52));
  const [L, W] = CT.TEN.YARD;
  let n = 0;
  for (const e of RES) {
    if (ST.yard >= CT.N.yard) break;
    if (++n % 6 === 0) yield 'дворы';
    const [ex, ez, nx, nz] = e, tx = -nz, tz = nx;
    if (!farFrom(ex, ez, CT.GAP.yard - 40, 'yard') || !farFrom(ex, ez, CT.GAP.any + 30)) continue;
    const r = rng(ex, ez, 53);
    for (let k = 0; k < 6; k++) {
      const d = 24 + r() * 26, s = (r() * 2 - 1) * 22, x = ex + nx * d + tx * s, z = ez + nz * d + tz * s;
      if (!farFrom(x, z, CT.GAP.yard, 'yard') || !farFrom(x, z, CT.GAP.any)) continue;
      const along = r() < 0.6, ux = along ? tx : nx, uz = along ? tz : nz;
      const f = rectFree(x, z, ux, uz, L, W);
      if (f) { add('tennis', 'yard', x, z, ux, uz, L, W, f); break; }
    }
  }
}
/* 4) падел у особняков: ближе к облезлой коробке — лучше */
function* padelCourts () {
  const R = A.rich;
  if (!R) return;
  const Pd = CT.PAD, L = Pd.L + 2 * Pd.M + 1.5, W = Pd.W + 2 * Pd.M + 1.5;
  const villas = A.CITY.buildings.filter(b => b.rich || b.st === 'villa');
  const cand = [];
  let n = 0;
  for (let gx = R.x - R.r - 60; gx <= R.x + R.r + 60; gx += 9) {
    for (let gz = R.z - R.r - 60; gz <= R.z + R.r + 60; gz += 9) {
      const x = gx + (hsh(gx, gz, 61) - 0.5) * 6, z = gz + (hsh(gx, gz, 62) - 0.5) * 6;
      if (Math.hypot(x - R.x, z - R.z) > R.r + 60) continue;
      // у особняка: ближайший ближе 70 м; ось — по его стене
      let bv = null, bd = 70;
      for (const v of villas) { const q = v.p[0], d = Math.hypot(q[0] - x, q[1] - z); if (d < bd) { bd = d; bv = v; } }
      if (!bv) continue;
      let pitch = 400;
      for (const p of A.PITCHES) pitch = Math.min(pitch, Math.hypot(p.cx - x, p.cz - z));
      for (const c of LIST) if (c.where !== 'padel') pitch = Math.min(pitch, Math.hypot(c.x - x, c.z - z) + 30);
      const o = mainAxis(bv.p);
      cand.push({ x, z, ux: o.ux, uz: o.uz, sc: pitch + bd * 0.5 + hsh(x, z, 63) * 30 });
    }
  }
  cand.sort((a, b) => a.sc - b.sc);
  yield 'падел';
  for (const q of cand) {
    if (ST.padel >= CT.N.padel) break;
    if (++n % 20 === 0) yield 'падел';
    if (!farFrom(q.x, q.z, CT.GAP.padel)) continue;
    for (const [ux, uz] of [[q.ux, q.uz], [-q.uz, q.ux]]) {
      const f = rectFree(q.x, q.z, ux, uz, L, W, { house: CT.FREE.VILLA });
      if (f) { add('padel', 'padel', q.x, q.z, ux, uz, L, W, f); break; }
    }
  }
}

function finish () {
  // сетка — один меш (рабица текстурой), стёкла — один прозрачный, таблички — один
  if (NET.P.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(NET.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(NET.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(NET.U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(NET.C, 3));
    g.setIndex(NET.I);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: netTex(), vertexColors: true, alphaTest: 0.32, side: THREE.DoubleSide }));
    m.name = 'courts-net';
    A.scene.add(m);
    for (const [k, x, z, r, v0, nv, hex] of NET.items) A.smashMesh(k, x, z, r, m, v0, nv, hex);
  }
  if (GLS.P.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(GLS.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(GLS.N, 3));
    g.setIndex(GLS.I);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0xbfe6f2, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }));
    m.name = 'courts-glass'; m.renderOrder = 2;
    A.scene.add(m);
    for (const [k, x, z, r, v0, nv, hex] of GLS.items) A.smashMesh(k, x, z, r, m, v0, nv, hex);
  }
  if (SGN.P.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(SGN.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(SGN.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(SGN.U, 2));
    g.setIndex(SGN.I);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: signTex() }));
    m.name = 'courts-signs';
    A.scene.add(m);
  }
  if (ICE.P.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(ICE.P, 3));
    g.setIndex(ICE.I);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    ICE_M = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0xb4d8ee, emissive: 0x15303f, side: THREE.DoubleSide }));
    ICE_M.name = 'courts-ice';
    ICE_M.visible = SEAS.snowy();
    A.scene.add(ICE_M);
  }
  ICE.P = ICE.I = null;
  NET.P = NET.N = NET.U = NET.C = NET.I = NET.items = GLS.P = GLS.N = GLS.I = GLS.items = SGN.P = SGN.N = SGN.U = SGN.I = null;
}

export function* build (api) {
  const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  OFF = !!(QS && QS.has('nocourts'));
  A = api;
  if (OFF) return ST;
  const t0 = performance.now();
  LIT = api.LIT;
  SG = new Map(); for (const s of A.SOLIDS) idx(SG, 30, s.cx - s.ex, s.cz - s.ez, s.cx + s.ex, s.cz + s.ez, s);
  SMG = new Map(); for (const it of A.SMASH) if (Number.isFinite(it.x)) idx(SMG, 20, it.x, it.z, it.x, it.z, it);
  ALLG = new Map(); for (const e of A.CITY.entrances) idx(ALLG, 20, e[0], e[1], e[0], e[1], e);
  RAILG = new Map();
  for (const r of A.CITY.rails || []) for (let i = 1; i < r.p.length; i++) {
    const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
    idx(RAILG, 20, Math.min(ax, bx) - 5, Math.min(az, bz) - 5, Math.max(ax, bx) + 5, Math.max(az, bz) + 5, [ax, az, bx, bz]);
  }
  LOTG = new Map();
  const box = p => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); } return { p, x0, x1, z0, z1 }; };
  const area = b => idx(LOTG, 40, b.x0, b.z0, b.x1, b.z1, b);
  for (const l of A.CITY.lots || []) if (l.p && l.p.length > 2) area(box(l.p));
  for (const g of A.CITY.green || []) if (g.p && (g.k === 'water' || g.k === 'pitch' || g.k === 'play' || g.k === 'cem' || A.isForest(g))) area(box(g.p));
  for (const p of (A.forests && A.forests()) || []) area(box(p));
  CLG = new Map(); for (const c of A.claims()) idx(CLG, 40, c.x - c.r - 12, c.z - c.r - 12, c.x + c.r + 12, c.z + c.r + 12, c);
  FUEL = (A.fuelPads || []).map(box);
  yield 'сетки';
  osmCourts();
  yield 'карта';
  yield* sportCourts();
  yield* padelCourts();
  yield* contrastCourt();
  yield* yardCourts();
  finish();
  A.indexSolids();
  SG = SMG = ALLG = LOTG = RAILG = CLG = null;
  ST.ms = Math.round(performance.now() - t0);
  return ST;
}

/* ═════════════ люди: играют, чистят снег, катаются ═════════════ */
const MATS = new Map();
function mat (hex) {
  let m = MATS.get(hex);
  if (!m) { m = new THREE.MeshLambertMaterial({ color: hex }); m.userData.keep = true; MATS.set(hex, m); }
  return m;
}
function racket (grp, padelR) {
  const g = new THREE.Group();
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.26, 0.035), mat(0x2b2a30)); h.position.set(0, -0.62, 0.08);
  const head = new THREE.Mesh(new THREE.BoxGeometry(padelR ? 0.24 : 0.27, padelR ? 0.26 : 0.32, 0.025), mat(padelR ? 0x1f2328 : pick([0xd9342c, 0x3f7fd6, 0xe0b13f, 0xf4f1ea])));
  head.position.set(0, padelR ? -0.88 : -0.92, 0.08);
  g.add(h, head);
  holdFixed(grp.userData.armR, g);
}
function shovel (grp) {
  const g = new THREE.Group();
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.15, 0.04), mat(0x8a6b4e)); h.position.set(0, -0.95, 0.1);
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.4), mat(pick([0xd9342c, 0x3f7fd6, 0x6b6f75]))); b.position.set(0, -1.52, 0.28);
  g.add(h, b);
  holdFixed(grp.userData.armR, g);
}
function skates (grp) {
  const u = grp.userData;
  for (const leg of [u.legL, u.legR]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.36), mat(0xc9ccd2));
    m.position.set(0, -leg.position.y + 0.02, 0.04);
    holdFixed(leg, m);
  }
}
const W2 = (c, a, b) => [c.x + c.ux * a - c.uz * b, c.z + c.uz * a + c.ux * b];
const floorY = (x, z) => A.groundH(x, z) + CT.FLOOR;
const dV = (x, z) => Math.hypot(x - A.V.x, z - A.V.z);

function mode () {
  const ENV = A.ENV || {}, snowy = SEAS.snowy();
  return { snowy, night: (ENV.night || 0) > 0.45, rain: !snowy && (ENV.rain || 0) > 0.5 };
}
/* курьер подъехал — жребий занятия */
function decide (c, M, force) {
  if (force) return force;
  if (M.night || M.rain) return null;
  const P = CT.P[M.snowy ? 'win' : 'sum'][c.kind === 'padel' ? 'padel' : c.ice ? 'ice' : 'tennis'];
  const v = Math.random();
  return v < P[0] ? 'play' : v < P[0] + P[1] ? 'shovel' : v < P[0] + P[1] + P[2] ? 'skate' : null;
}
let QUEUE = [];
function startAct (c, kind) {
  const act = { kind, c, ppl: [], ball: null, rally: null, say: null, sayT: 0, t: 0, talkT: rand(4, 9) };
  c.act = act;
  ST.acts++;
  const pad = c.kind === 'padel', rich = pad;
  const o = () => (rich ? { shirt: pick(['#f4f4ee', '#f4f4ee', '#e8e4da', '#1f2328']), pants: '#f4f4ee' } : { fat: chance(0.2) });
  if (kind === 'play') {
    const four = pad || chance(0.4), hl = pad ? 7.5 : CT.TEN.PL / 2 - 0.5;
    const spots = four ? [[-hl, -2.6], [-hl + (pad ? 2 : 0), 2.6], [hl, 2.6], [hl - (pad ? 2 : 0), -2.6]] : [[-hl - 1, 0], [hl + 1, 0]];
    spots.forEach(([a, b], i) => QUEUE.push({ act, role: 'play', a, b, side: a < 0 ? -1 : 1, o: o(), item: 'racket', i }));
  } else if (kind === 'shovel') {
    const n = c.kind === 'padel' ? 1 : chance(0.3) ? 2 : 1;
    for (let i = 0; i < n; i++) QUEUE.push({ act, role: 'shovel', a: -c.iL / 2 + 2, b: -c.iW / 2 + 2 + i * 3, lane: i, o: { fat: chance(0.3) }, item: 'shovel' });
  } else {
    const n = 2 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) QUEUE.push({ act, role: 'skate', th: i / n * Math.PI * 2, o: {}, item: 'skates' });
  }
}
function endAct (c) {
  const act = c.act;
  if (!act) return;
  QUEUE = QUEUE.filter(q => q.act !== act);
  for (const p of act.ppl) if (!p.dead) { A.dropMesh(p.grp); p.dead = 1; ST.people--; }
  if (act.ball) { A.scene.remove(act.ball); act.ball = null; }
  unsay(act);
  c.act = null;
}
function unsay (act) { if (act.say) { if (act.say.parent) act.say.parent.remove(act.say); act.say.material.dispose(); act.say = null; } }
function say (act, p, list, col) {
  if (!p || p.dead || !A.sayBubble) return;
  unsay(act);
  act.say = A.sayBubble(p.grp, t(pick(list)), col, 2.6);
  act.sayT = 2.2;
}
let BALL_G = null, BALL_M = null;
function spawn (q) {
  const act = q.act, c = act.c;
  const grp = chance(0.35) ? A.freshHuman(q.o, {}) : A.makeHuman(null, q.o);
  if (q.item === 'racket') racket(grp, c.kind === 'padel');
  else if (q.item === 'shovel') shovel(grp);
  else if (q.item === 'skates') skates(grp);
  let a = q.a || 0, b = q.b || 0;
  if (q.role === 'skate') { a = Math.cos(q.th) * (c.iL / 2 - 3.5); b = Math.sin(q.th) * (c.iW / 2 - 2.5); }
  const [x, z] = W2(c, a, b);
  const p = { grp, u: grp.userData, role: q.role, a, b, a0: a, b0: b, side: q.side || 1, th: q.th || 0, x, z, ph: rand(0, 6), dead: 0, fall: null,
    swing: -1, lane: q.lane || 0, dir: 1, puffT: rand(0.5, 1.2), tb: b, spd: rand(2.4, 3.4) };
  grp.position.set(x, floorY(x, z), z);
  A.scene.add(grp);
  if (dV(x, z) < 140 && inView(x, 1, z, 2)) { p.grow = 0.02; p.sc0 = grp.scale.clone(); grp.scale.multiplyScalar(0.02); }
  act.ppl.push(p);
  ST.people++;
  if (q.role === 'play' && !act.ball) {
    if (!BALL_G) { BALL_G = new THREE.IcosahedronGeometry(CT.ACT.BALL, 1); BALL_M = new THREE.MeshBasicMaterial({ color: 0xd8f23a }); }
    act.ball = new THREE.Mesh(BALL_G, BALL_M);
    act.ball.visible = false;
    A.scene.add(act.ball);
  }
}

/* машина задела: медленно — упал и встал, быстрее — сбит (как yardlife.js) */
function carHit (p, sp, fx, fz, kmh) {
  if (sp < 3 || p.fall) return false;
  const dx = p.x - A.V.x, dz = p.z - A.V.z;
  if (Math.abs(dx * fx + dz * fz) >= A.CAR_L + 0.5 || Math.abs(dx * fz - dz * fx) >= A.CAR_W + 0.35) return false;
  if ((HITS.isFall(kmh) || HITS.survive(p, kmh))) { p.grp.rotation.z = 0; HITS.fall(p, A.V.vx, A.V.vz); ST.falls++; return true; }
  A.dropMesh(p.grp); p.dead = 1; ST.people--; ST.hits++;
  A.gibHuman(p, A.V.vx, A.V.vz, kmh);
  if (A.runOver) A.runOver();
  return true;
}

/* ── игра: розыгрыш — мяч дугой с отскоком от игрока к игроку ── */
function newShot (act, from, serve) {
  const c = act.c, pl = act.ppl.filter(p => !p.dead && !p.fall);
  const opp = pl.filter(p => p.side !== from.side);
  if (!opp.length) { act.rally = null; return; }
  const to = pick(opp), pad = c.kind === 'padel';
  const hw = pad ? CT.PAD.W / 2 - 0.8 : CT.TEN.PW / 2 - 0.4;
  to.tb = clamp(to.b0 + rand(-2.2, 2.2), -hw, hw);
  const ub = -from.side * rand(pad ? 2 : 3.5, pad ? 8 : CT.TEN.PL / 2 - 1.5), vb = clamp(to.tb + rand(-1.2, 1.2), -hw, hw);
  const T = serve ? rand(1.1, 1.4) : pad ? rand(0.9, 1.3) : rand(1.0, 1.6);
  act.rally.shot = { from, to, a0: from.a, b0: from.b, ub, vb, T, t: 0, H1: pad ? rand(0.6, 1.4) : rand(0.8, 2.2), H2: rand(0.5, 1.2) };
  from.swing = 0;
}
function playStep (act, dt, far) {
  const c = act.c, R = act.rally, ball = act.ball;
  const alive = act.ppl.filter(p => !p.dead);
  if (!ball || alive.length < 2) return;
  if (!R) {                                       // пауза между розыгрышами — подача
    act.wait = (act.wait || 0) - dt;
    if (act.wait > 0) return;
    const server = pick(alive.filter(p => !p.fall));
    if (!server) return;
    act.rally = { left: 3 + ((Math.random() * 11) | 0), shot: null };
    ball.visible = true;
    newShot(act, server, true);
    return;
  }
  const S = R.shot;
  if (!S) { act.rally = null; act.wait = rand(1.5, 3); ball.visible = false; return; }
  S.t += dt;
  const k = S.t / S.T, k1 = 0.66;
  let a, b, y;
  if (S.end === 'net') {
    // в сетку: долетел до середины и упал
    const q = Math.min(1, S.t / (S.T * 0.5));
    a = S.a0 + (0 - S.a0) * q; b = S.b0 + (S.vb - S.b0) * q; y = 1.1 + (0.5 - 1.1) * q + 1.2 * q * (1 - q);
    if (q >= 1) { y = Math.max(0.1, 0.5 - (S.t - S.T * 0.5) * 3); if (S.t > S.T * 0.5 + 0.5) { act.rally = null; act.wait = rand(1.8, 3.2); ball.visible = false; if (chance(0.5)) say(act, S.from, LINES[c.kind === 'padel' ? 'padel' : 'tennis'], c.kind === 'padel' ? '#2a63cf' : '#5a7a2a'); } }
  } else if (k < k1) {
    const q = k / k1;
    a = S.a0 + (S.ub - S.a0) * q; b = S.b0 + (S.vb - S.b0) * q; y = 1.0 + (0.08 - 1.0) * q + 4 * S.H1 * q * (1 - q);
  } else {
    const q = Math.min(1, (k - k1) / (1 - k1));
    a = S.ub + (S.to.a - S.ub) * q; b = S.vb + (S.to.b - S.vb) * q; y = 0.08 + (0.95 - 0.08) * q + 4 * S.H2 * q * (1 - q);
    if (q > 0.8 && S.to.swing < 0) S.to.swing = 0;
    if (q >= 1) {
      if (--R.left <= 0 || S.to.dead || S.to.fall) {
        const from = S.to;
        if (from.dead || from.fall) { act.rally = null; act.wait = 2; ball.visible = false; return; }
        R.shot = { from, a0: from.a, b0: from.b, vb: clamp(from.b + rand(-2, 2), -4, 4), T: 1.2, t: 0, end: 'net' };
        from.swing = 0;
      } else newShot(act, S.to);
    }
  }
  const [x, z] = W2(c, a, b);
  ball.position.set(x, floorY(x, z) + y, z);
  // принимающий бежит к точке приёма
  for (const p of alive) {
    if (p.fall) continue;
    const tb = S && S.to === p && !S.end ? p.tb : p.b0 + Math.sin(act.t * 0.7 + p.ph) * 0.4;
    const db = tb - p.b, mv = Math.min(Math.abs(db), (S && S.to === p ? 4 : 1.2) * dt) * Math.sign(db);
    p.b += mv; p.run = Math.abs(mv) / Math.max(dt, 1e-3);
  }
}
/* поза игрока: стойка, бег вбок, замах */
function poseStep (act, p, dt, anim) {
  const u = p.u, c = act.c;
  const [x, z] = W2(c, p.a, p.b);
  p.x = x; p.z = z;
  if (p.role === 'play') {
    p.ph += dt * (p.run > 0.3 ? 12 : 3);
    p.grp.position.set(x, floorY(x, z) + (p.run > 0.3 ? Math.abs(Math.sin(p.ph)) * 0.06 : 0), z);
    p.grp.rotation.y = Math.atan2(-c.ux * p.side, -c.uz * p.side);
    if (!anim) return;
    const sw = p.run > 0.3 ? Math.sin(p.ph) * 0.7 : 0;
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
    u.legL.rotation.z = 0.14; u.legR.rotation.z = -0.14;
    if (p.swing >= 0) {
      p.swing += dt / 0.45;
      const q = Math.min(1, p.swing);
      u.armR.rotation.x = -0.4 - Math.sin(q * Math.PI) * 1.7;
      u.armR.rotation.z = 0.6 - q * 1.2;
      if (p.swing >= 1) p.swing = -1;
    } else { u.armR.rotation.x = damp(u.armR.rotation.x, -0.55, 6, dt); u.armR.rotation.z = damp(u.armR.rotation.z, 0.25, 6, dt); }
    u.armL.rotation.x = damp(u.armL.rotation.x, -0.35, 6, dt);
  } else if (p.role === 'shovel') {
    // ходит полосами вдоль корта, толкает снег; в конце полосы — сбрасывает
    const lim = c.iL / 2 - 1.6, step = 1.0 * dt;
    p.a += p.dir * step;
    if (Math.abs(p.a) > lim) {
      p.a = Math.sign(p.a) * lim; p.dir = -p.dir;
      p.b += 1.2 * (p.lane % 2 ? -1 : 1);
      if (Math.abs(p.b) > c.iW / 2 - 1.5) { p.lane++; p.b = clamp(p.b, -(c.iW / 2 - 1.5), c.iW / 2 - 1.5); }
      if (A.puff && anim) A.puff(x + c.ux * p.dir * -0.8, 0.3, z + c.uz * p.dir * -0.8, false, 0.8);
    }
    if ((p.puffT -= dt) <= 0 && A.puff && anim) { p.puffT = rand(0.7, 1.3); A.puff(x + c.ux * p.dir * 0.9, 0.1, z + c.uz * p.dir * 0.9, false, 0.35); }
    p.ph += dt * 5;
    p.grp.position.set(x, floorY(x, z) + Math.abs(Math.sin(p.ph)) * 0.03, z);
    p.grp.rotation.y = Math.atan2(c.ux * p.dir, c.uz * p.dir);
    if (!anim) return;
    const sw = Math.sin(p.ph) * 0.5;
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
    u.armL.rotation.x = u.armR.rotation.x = -0.75;
    u.armL.rotation.z = u.armR.rotation.z = 0;
  } else {
    // коньки: по кругу, ноги — толчками
    p.th += dt * p.spd / ((c.iL + c.iW) / 4 - 3);
    const ra = c.iL / 2 - 3.5, rb = c.iW / 2 - 2.5;
    p.a = Math.cos(p.th) * ra; p.b = Math.sin(p.th) * rb;
    const [x2, z2] = W2(c, p.a, p.b);
    p.x = x2; p.z = z2;
    const ta = -Math.sin(p.th) * ra, tb = Math.cos(p.th) * rb;
    p.grp.position.set(x2, floorY(x2, z2), z2);
    p.grp.rotation.y = Math.atan2(c.ux * ta - c.uz * tb, c.uz * ta + c.ux * tb);
    if (!anim) return;
    p.ph += dt * 3;
    const s = Math.sin(p.ph);
    u.legL.rotation.z = Math.max(0, s) * 0.35; u.legR.rotation.z = -Math.max(0, -s) * 0.35;
    u.legL.rotation.x = u.legR.rotation.x = 0;
    u.armL.rotation.x = -0.3 - s * 0.3; u.armR.rotation.x = -0.3 + s * 0.3;
  }
}

let scanT = 0, FORCE = null;
export function step (dt) {
  if (OFF || !A || !LIST.length || !A.V) return;
  if (A.intro && A.intro()) return;
  const M = mode();
  if ((scanT -= dt) <= 0) {
    scanT = CT.ACT.SCAN;
    if (ICE_M) ICE_M.visible = M.snowy;            // лёд — только когда лежит снег
    let active = LIST.filter(c => c.act).length;
    for (const c of LIST) {
      const d = dV(c.x, c.z);
      if (c.act && (d > CT.ACT.DROP || (M.night && !FORCE) || (M.rain && c.act.kind === 'play'))) endAct(c);
      if (d > CT.ACT.DROP) c.near = 0;
      if (!c.near && d < CT.ACT.WANT) {
        c.near = 1;
        if (active < CT.ACT.MAX || FORCE) {
          const k = decide(c, M, FORCE);
          if (k) { startAct(c, k); active++; }
        }
      }
    }
    FORCE = null;
  }
  if (QUEUE.length) spawn(QUEUE.shift());          // по одному человеку за кадр
  const sp = Math.hypot(A.V.vx, A.V.vz), kmh = sp * 3.6, fx = sp > 0.01 ? A.V.vx / sp : 0, fz = sp > 0.01 ? A.V.vz / sp : 0;
  for (const c of LIST) {
    const act = c.act;
    if (!act) continue;
    act.t += dt;
    const d = dV(c.x, c.z), anim = d < CT.ACT.ANIM && inView(c.x, 1, c.z, Math.hypot(c.L, c.W) / 2);
    if (act.kind === 'play') playStep(act, dt, !anim);
    for (const p of act.ppl) {
      if (p.dead) continue;
      if (p.grow) { p.grow = Math.min(1, p.grow + dt * 2); p.grp.scale.copy(p.sc0).multiplyScalar(p.grow); if (p.grow >= 1) p.grow = 0; }
      if (p.fall) { if (HITS.fallStep(p, dt)) continue; p.fall = null; }
      if (sp > 3 && d < 40 && carHit(p, sp, fx, fz, kmh)) continue;
      poseStep(act, p, dt, anim);
    }
    if (act.sayT > 0 && (act.sayT -= dt) <= 0) unsay(act);
    if ((act.talkT -= dt) <= 0) {
      act.talkT = rand(6, 12);
      if (d < 45 && act.kind !== 'play') say(act, pick(act.ppl), LINES[act.kind], act.kind === 'skate' ? '#3f7fd6' : '#6b5a3a');
    }
  }
}

export const DEBUG = {
  CT, ST, LIST, blocks,
  force (k = 'play') { FORCE = k; for (const c of LIST) { endAct(c); c.near = 0; } scanT = 0; },
  count () { return { courts: LIST.length, tennis: LIST.filter(c => c.kind === 'tennis').length, padel: LIST.filter(c => c.kind === 'padel').length, acts: LIST.filter(c => c.act).length, people: ST.people }; },
  nearest (x, z) { let b = null, bd = Infinity; for (const c of LIST) { const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; b = c; } } return b; },
};
