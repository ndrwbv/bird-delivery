/* ──────────────────────────────────────────────────────────────────────────
   Варианты заборов и препятствий (М5, этап 1; автор 24.10.2026: «в целом все заборчики и препятствия должны быть
   в нескольких вариациях»). Правила словами и таблица — docs/CAREER.md «Варианты заборов и препятствий».

   Здесь — только выбор: какой вид, цвет и износ у вещи в этом месте. Вещь строят её модули:
     • оградки газона из гнутых труб — lawnprops.js (rails): FV.rail(kx, kz, x, z) — вид и краска на сторону улицы,
       FV.railSec(x, z, side) — износ секции;
     • твёрдые заборы у тротуаров — yardmaze.js (solidRun): FV.solidSty(x, z, w) — вид по району из того же жребия w,
       FV.solidWear(x, z) — износ куска;
     • высокие заборы домов — roadlife.js (buildFences): FV.tall(b, cx, cz, kids) — вид (плитка атласа) и оттенок.
   Район — по карте (districts.js at): Старый город и Центр — аккуратное, кованое; окраины (Восток, Гаражи, Частный
   сектор) — рабица, бетон, ржавое; остальное — вперемешку. Жребий — только по месту (хеш), Math.random не трогаем:
   город строится на зерне (docs/AGENTS.md «Город строится на зерне»), и одно место — всегда одна и та же вещь.
   ────────────────────────────────────────────────────────────────────────── */
import { at as distAt, has as distHas } from './districts.js';
import { CLEAN } from './mobile.js';

/* телефон (mobile.js CLEAN.fencePlain, 11бз): оградки газона — только дуги и рамка (колечки внахлёст и зигзаг на маленьком
   экране — рябь), без ржавчины, облупленной краски и завала набок; твёрдые заборы — «обычные» (без сколов, подтёков, пик).
   На компьютере — как выше (город бит в бит) */
const PLAIN = !!(CLEAN && CLEAN.fencePlain);

/* ?nofvar — как до 24.10.2026: одна форма оградки газона (краска как была), твёрдые заборы прежними долями и без износа,
   высокие заборы — только чёрные пики (сравнить кадры, вызовы и память) */
export const OFF = typeof location !== 'undefined' && /[?&]nofvar(&|$)/.test(location.search);

/* район → характер: 'old' — Старый город (4), Центр (3); 'rim' — Восток (5), Гаражи (6), Частный сектор (7); 'mid' — прочее */
const ZONE_OF = ['mid', 'mid', 'mid', 'old', 'old', 'rim', 'rim', 'rim'];
export function zone (x, z) {
  if (!distHas()) return 'mid';
  return ZONE_OF[distAt(x, z)] || 'mid';
}
function hsh (x, z, k) {
  let h = Math.imul(Math.round(x * 4) ^ 0x5bd1e995, 0x9E3779B1) ^ Math.imul(Math.round(z * 4) + k * 1013904223, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/* по долям: w — 0…1, W — [доля, …] (сумма 1) → номер */
const byW = (w, W) => { let s = 0; for (let i = 0; i < W.length; i++) { s += W[i]; if (w < s) return i; } return W.length - 1; };
const mix = (hex, to, k) => {
  const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16), c = s => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
};

export const FV = {
  /* оградки газона (lawnprops.js): вид секции — 0 дуги (как было), 1 колечки внахлёст, 2 рамка из трубы, 3 зигзаг;
     доли видов по району; краска — на сторону улицы; износ — на секцию */
  RAIL: {
    SHAPE: { old: [0.4, 0.45, 0.15, 0], mid: [0.35, 0.25, 0.2, 0.2], rim: [0.25, 0, 0.35, 0.4] },
    PAINT: { old: ['#2a2d30', '#2f5a3a', '#e8e4d8', '#3f7a4a', '#4f6fa8'], mid: ['#3f7a4a', '#4f6fa8', '#e8e4d8', '#c9803a', '#a8463a'],
      rim: ['#3f7a4a', '#4f6fa8', '#c9803a', '#a8463a', '#8a9096'] },
    FADE: { old: 0.15, mid: 0.35, rim: 0.6 },       // доля сторон с выцветшей краской
    // на секцию: ржавая (вся рыжая, с пятнами), облупленная (краска с рыжими пятнами), погнутая (завалена набок)
    RUST: { old: 0, mid: 0.08, rim: 0.32 },
    PEEL: { old: 0.04, mid: 0.16, rim: 0.3 },
    LEAN: { old: 0, mid: 0.04, rim: 0.14 },
    RUST_HEX: '#8a4a2a', LEAN_RAD: [0.22, 0.42],
  },
  /* твёрдые заборы у тротуаров (yardmaze.js): доли видов — парапет, столбы с трубой, кирпич с решёткой; износ куска —
     0 аккуратный, 1 обычный (как было до 24.10), 2 старый */
  SOLID: {
    STY: { old: [0.2, 0.2, 0.6], mid: [0.35, 0.4, 0.25], rim: [0.45, 0.47, 0.08] },
    WEAR: { old: [0.7, 0.3, 0], mid: [0.15, 0.6, 0.25], rim: [0, 0.4, 0.6] },
  },
  /* высокие заборы домов (roadlife.js): плитки атласа — 0 кованые пики (как было), 1 ржавые пики, 2 профлист,
     3 старый профлист (подтёки ржавчины, вмятина), 4 доски, 5 рабица на трубах; доли — по району и дому */
  TALL: {
    W: {
      rich: [0.8, 0, 0.2, 0, 0, 0],
      kids: [0.55, 0, 0, 0, 0, 0.45],
      old: { home: [0.7, 0, 0.3, 0, 0, 0], priv: [0.4, 0, 0.3, 0, 0.3, 0] },
      mid: { home: [0.45, 0, 0.35, 0, 0, 0.2], priv: [0.15, 0, 0.35, 0.1, 0.3, 0.1] },
      rim: { home: [0, 0.2, 0.35, 0.15, 0, 0.3], priv: [0, 0.15, 0.2, 0.15, 0.35, 0.15] },
    },
    // оттенок (цвет вершин × плитка): профлист — крашеный; доски — свежие или серые; рабица — оцинковка, зелёная, ржавая
    TINT: [['#ffffff'], ['#ffffff'], ['#4f8a52', '#8a5a3a', '#4f78b0', '#8a3a3a', '#9aa0a6'], ['#9ab89c', '#c4a284', '#a8b8cc', '#d2d2ce'],
      ['#ffffff', '#ffffff', '#a8a6a0'], ['#ffffff', '#7fb08a', '#c08a62']],
    DEBRIS: ['#17181c', '#5a3322', null, null, '#8a6b4e', '#9aa3a8'],   // цвет обломков (null — оттенок плитки)
  },
};
export const ST = { rail: [0, 0, 0, 0], railWear: { rust: 0, peel: 0, lean: 0, fade: 0 }, solid: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], tall: [0, 0, 0, 0, 0, 0], zone: { old: 0, mid: 0, rim: 0 } };
const TALL_LIST = [];

/* оградка газона на сторону улицы: kx, kz — точка-ключ стороны (начало улицы, сдвиг по стороне), x, z — где кусок
   (район): { shape, hex, zone } */
export function rail (kx, kz, x, z, oldHex) {
  if (OFF) return { shape: 0, hex: oldHex, zone: 'mid', fade: false, off: 1 };
  const R = FV.RAIL, zn = zone(x, z), shape0 = byW(hsh(kx, kz, 71), R.SHAPE[zn]), shape = PLAIN ? [0, 0, 2, 2][shape0] : shape0;
  const pal = R.PAINT[zn];
  let hex = pal[Math.floor(hsh(kx, kz, 72) * pal.length)];
  const fade = hsh(kx, kz, 73) < R.FADE[zn];
  if (fade) hex = mix(hex, '#c9c6bd', 0.45);
  return { shape, hex, zone: zn, fade };
}
/* износ секции оградки: { hex — краска секции, wear — рыжие пятна, lean — наклон набок, рад } */
export function railSec (x, z, side) {
  if (side.off || PLAIN) { ST.rail[side.shape || 0]++; return { hex: side.hex, wear: 0, lean: 0 }; }
  const R = FV.RAIL, zn = side.zone, h = hsh(x, z, 74);
  let hex = side.hex, wear = 0, lean = 0;
  if (h < R.RUST[zn]) { hex = mix(R.RUST_HEX, side.hex, 0.15); wear = 1; ST.railWear.rust++; }
  else if (h < R.RUST[zn] + R.PEEL[zn]) { wear = 1; ST.railWear.peel++; }
  if (hsh(x, z, 75) < R.LEAN[zn]) { lean = (hsh(x, z, 76) < 0.5 ? -1 : 1) * (R.LEAN_RAD[0] + (R.LEAN_RAD[1] - R.LEAN_RAD[0]) * hsh(x, z, 80)); ST.railWear.lean++; }
  ST.rail[side.shape]++;
  if (side.fade) ST.railWear.fade++;
  return { hex, wear, lean };
}

/* твёрдый забор: вид из того же жребия w (0…1), что был (порядок жребиев куска не меняется), доли — по району */
export function solidSty (x, z, w) {
  return byW(w, FV.SOLID.STY[OFF ? 'mid' : zone(x, z)]);
}
export function solidWear (x, z, sty) {
  const zn = zone(x, z), wear = OFF || PLAIN ? 1 : byW(hsh(x, z, 77), FV.SOLID.WEAR[zn]);
  ST.solid[sty][wear]++; ST.zone[zn]++;
  return wear;
}
export const wearH = hsh;                          // жребий по месту для мелочи износа (какая секция без крышки, где сколы)

/* высокий забор дома: { tile, tint, debris } — один вид на дом */
export function tall (b, cx, cz, kids) {
  const T = FV.TALL, zn = zone(cx, cz);
  const W = b.rich ? T.W.rich : kids ? T.W.kids : T.W[zn][b.k === 'priv' ? 'priv' : 'home'];
  const tile = OFF ? 0 : byW(hsh(cx, cz, 78), W), tints = T.TINT[tile], tint = tints[Math.floor(hsh(cx, cz, 79) * tints.length)];
  ST.tall[tile]++; TALL_LIST.push(tile);
  return { tile, tint, debris: T.DEBRIS[tile] || tint };
}

export const DEBUG = { FV, ST, TALL: TALL_LIST, zone, OFF, PLAIN };
