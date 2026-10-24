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
/* ── этап 2: мелочь дворов и улиц (формы — propvar.js). На вещь (или на подъезд, сторону улицы, коробку) — форма и краска
   по району; на секцию — износ. F — формы, W — доли форм по району, PLAIN — какая форма на телефоне (CLEAN.fencePlain:
   без мелких узоров), PAINT — краска формы по району ([короб, крышка] у контейнеров), K — номер жребия ── */
const MET = { old: ['#2f5a3a', '#e8e4d8', '#3f7a4a', '#4f6fa8'], mid: ['#5aa860', '#6a9ad8', '#ece6da', '#c45a48', '#e0943e'],
  rim: ['#5aa860', '#6a9ad8', '#c45a48', '#e0943e', '#8a9096'] };
const WOOD = { old: ['#f4f1e8', '#a8dc90', '#e3c48e', '#f2eee4'], mid: ['#e3c48e', '#f4f1e8', '#a8dc90', '#a8d0ee'], rim: ['#b8ad98', '#a8a294', '#e3c48e', '#a8dc90'] };
const IRON = { old: ['#232528', '#2f4a36', '#2a2d30'], mid: ['#232528', '#2f4a36'], rim: ['#3a3530'] };
const IRON_L = { old: ['#f2eee4', '#cfe8c8', '#e8e4d8'], mid: ['#f2eee4', '#cfe8c8'], rim: ['#d8d4c8'] };   // у тротуаров — светлая «ковка»: сбиваемое светлое
const XF = { old: ['#6a9ad8', '#5aa860'], mid: ['#5aa860', '#6a9ad8', '#8a9096', '#e0943e'], rim: ['#7a6a52', '#8a9096', '#5f8a5a', '#9a5a36'] };
const BOARD = { old: ['#f2eee4', '#cfe3ee'], mid: ['#f2eee4', '#a8d0ee', '#a8dc90', '#f0c63c'], rim: ['#c9c2b0', '#a8d0ee', '#d8c48e'] };
const OLDW = { old: ['#b8ad98'], mid: ['#b8ad98', '#a89c86', '#c4b8a0'], rim: ['#a8a294', '#9a9284', '#b8ad98', '#8e8878'] };
const ofZone = t => ({ old: t, mid: t, rim: t });
FV.ITEM = {
  // палисадники у подъездов (yarddecor.js) и заборчики по бокам тропинок (yards.js): на подъезд
  low: { K: 101, F: ['pipes', 'picket', 'hoops', 'forged', 'xframe'],
    W: { old: [0.25, 0.25, 0.1, 0.4, 0], mid: [0.35, 0.3, 0.2, 0.05, 0.1], rim: [0.3, 0.2, 0.1, 0, 0.4] },
    PLAIN: ['pipes', 'pipes', 'pipes', 'pipes', 'pipes'], PAINT: { pipes: MET, picket: WOOD, hoops: MET, forged: IRON, xframe: XF } },
  // дворовые заборчики вдоль жилых улиц (game.js): на сторону улицы
  street: { K: 111, F: ['pipes', 'picket', 'hoops', 'forged', 'xframe', 'planks'],
    W: { old: [0.25, 0.25, 0.1, 0.4, 0, 0], mid: [0.3, 0.3, 0.15, 0.05, 0.1, 0.1], rim: [0.25, 0.15, 0.05, 0, 0.3, 0.25] },
    PLAIN: ['pipes', 'pipes', 'pipes', 'pipes', 'pipes', 'pipes'], PAINT: { pipes: MET, picket: WOOD, hoops: MET, forged: IRON, xframe: XF, planks: OLDW } },
  // сбиваемые заборы у тротуаров (yardmaze.js), трубы: на кусок стороны
  softp: { K: 121, F: ['pipes', 'hoops', 'forged', 'xframe'],
    W: { old: [0.35, 0.2, 0.45, 0], mid: [0.5, 0.2, 0.1, 0.2], rim: [0.45, 0, 0, 0.55] },
    PLAIN: ['pipes', 'pipes', 'pipes', 'pipes'], PAINT: { forged: IRON_L, xframe: XF } },      // трубы и дуги — краска куска (как было)
  // они же, штакетник
  softk: { K: 131, F: ['planks4', 'picket', 'planks'],
    W: { old: [0.3, 0.7, 0], mid: [0.5, 0.35, 0.15], rim: [0.35, 0.15, 0.5] },
    PLAIN: ['planks4', 'planks4', 'planks4'], PAINT: { planks: OLDW } },
  // бортики футбольных коробок (game.js pitchAt): на коробку
  pitch: { K: 141, F: ['pipes', 'board', 'bars'],
    W: { old: [0.35, 0.35, 0.3], mid: [0.4, 0.35, 0.25], rim: [0.5, 0.25, 0.25] },
    PLAIN: ['pipes', 'board', 'pipes'], PAINT: { pipes: { old: ['#3f6fa8', '#2f5a3a', '#e8e4d8'], mid: ['#3f6fa8', '#5aa860', '#c45a48', '#f0c63c'], rim: ['#3f6fa8', '#5aa860', '#8a9096'] },
      board: BOARD, bars: { old: ['#2f5a3a', '#3f6fa8'], mid: ['#3f6fa8', '#5aa860', '#8a9096'], rim: ['#8a9096', '#5f8a5a'] } } },
  // лавочки (yards.js, world.js, game.js bench): на лавочку
  bench: { K: 151, F: ['classic', 'slats', 'plain', 'park', 'broken'],
    W: { old: [0.25, 0.2, 0, 0.55, 0], mid: [0.35, 0.3, 0.15, 0.15, 0.05], rim: [0.2, 0.25, 0.25, 0, 0.3] },
    PLAIN: ['classic', 'classic', 'plain', 'classic', 'plain'],
    PAINT: { classic: { old: ['#7a5236', '#3f6a40', '#8a6b4e'], mid: ['#8a6b4e', '#3f7a4a', '#4f6fa8', '#a8463a', '#c9803a'], rim: ['#8a6b4e', '#7a6a58'] },
      slats: { old: ['#8a6b4e', '#3f6a40'], mid: ['#8a6b4e', '#3f7a4a', '#4f6fa8', '#c9803a', '#a8463a'], rim: ['#8a6b4e', '#9a8a70'] },
      plain: { old: ['#8a6b4e'], mid: ['#8a6b4e', '#3f7a4a', '#c9803a'], rim: ['#8e8a80', '#8a6b4e', '#7a6a58'] },
      park: { old: ['#7a5236', '#3f6a40', '#6a4a30'], mid: ['#7a5236', '#3f6a40'], rim: ['#7a5236'] },
      broken: ofZone(['#8e8a80', '#9a9284', '#7a7468']) } },
  // урны (game.js у подъездов, editlayer.js): на урну
  urn: { K: 161, F: ['cup', 'vase', 'tilt', 'iron', 'rusty'],
    W: { old: [0.3, 0.2, 0, 0.5, 0], mid: [0.4, 0.3, 0.2, 0.05, 0.05], rim: [0.25, 0.25, 0.2, 0, 0.3] },
    PLAIN: ['cup', 'vase', 'cup', 'cup', 'cup'],
    PAINT: { cup: { old: ['#2f5a3a', '#2a2d30'], mid: ['#4e5a4a', '#3f6fa8', '#4e5a4a', '#5a6a50'], rim: ['#4e5a4a', '#6c7378'] },
      vase: { old: ['#e8e4d8', '#c8c4ba'], mid: ['#b8b4aa', '#e8e4d8', '#a9a69e'], rim: ['#9a968b', '#a9a69e'] },
      tilt: ofZone(['#3f7a4a', '#4f6fa8', '#c9803a', '#6c7378']), iron: ofZone(['#1e2022']), rusty: ofZone(['#8a4a2a', '#7a5236']) } },
  // мусорные контейнеры (junk.js): на контейнер, краска [короб, крышка]
  can: { K: 171, F: ['metal', 'euro', 'open', 'cage'],
    W: { old: [0.3, 0.5, 0, 0.2], mid: [0.45, 0.35, 0.1, 0.1], rim: [0.45, 0.15, 0.4, 0] },
    PLAIN: ['metal', 'euro', 'metal', 'euro'],
    PAINT: { metal: ofZone([['#3f7a4a', '#2f5a38'], ['#2f5f9a', '#244a78'], ['#6c7378', '#4e5559'], ['#3f7a4a', '#2f5a38']]),
      euro: { old: [['#3f7a4a', '#2f5a38'], ['#4e5559', '#3a3f42'], ['#2f5f9a', '#244a78']], mid: [['#3f7a4a', '#2f5a38'], ['#4e5559', '#3a3f42'], ['#2f5f9a', '#244a78'], ['#4e5559', '#e0b028'], ['#c0622e', '#8a4422']], rim: [['#4e5559', '#3a3f42'], ['#3f7a4a', '#2f5a38']] },
      open: ofZone([['#8a4a2a', '#6a3a22'], ['#6c5a48', '#5a3322']]), cage: { old: [['#2f5f9a'], ['#3f7a4a']], mid: [['#e0b028'], ['#2f5f9a'], ['#3f7a4a']], rim: [['#e0b028']] } } },
  // заборы строек (construction.js): на стройку — шифер (как было) или бетонные плиты ПО-2 с ромбами
  cons: { K: 181, F: ['slate', 'plate'], W: { old: [0.8, 0.2], mid: [0.6, 0.4], rim: [0.35, 0.65] }, PLAIN: ['slate', 'plate0'],
    PAINT: { plate: ofZone(['#a8a49a', '#9c988e', '#b0ab9f']), plate0: ofZone(['#a8a49a', '#9c988e', '#b0ab9f']) } },
};
/* износ секции (заборчики) и вещи: доля ржавых, облупленных, с выпавшими планками / прутьями; выцветшая краска — на сторону */
/* OLD — доля старых вещей (на подъезд, сторону, коробку — целиком): у старой секции ржавая RUST, облупленная PEEL, планки и
   прутья выпали MISS; у новой — только редкие рыжие пятна NEW_PEEL */
FV.WEAR2 = { OLD: { old: 0.03, mid: 0.22, rim: 0.6 }, RUST: 0.3, PEEL: 0.55, MISS: 0.3, NEW_PEEL: 0.05, FADE: { old: 0.1, mid: 0.3, rim: 0.55 },
  GOLD: 0.5 };                                          // кованые пики Старого города — золочёные у половины
export const ST = { rail: [0, 0, 0, 0], railWear: { rust: 0, peel: 0, lean: 0, fade: 0 }, solid: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], tall: [0, 0, 0, 0, 0, 0], zone: { old: 0, mid: 0, rim: 0 },
  items: {}, wear2: { rust: 0, peel: 0, miss: 0 } };
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

/* этап 2 — вид вещи: kind — ключ FV.ITEM, (x, z) — место (жребий и район), hex0 — краска, что была (форме без своей
   палитры). → { kind, form, hex, hex2, hex3, tips, zone, seed } или null (?nofvar — строить как было) */
const METAL_F = { pipes: 1, hoops: 1, forged: 1, xframe: 1, bars: 1 };
export function item (kind, x, z, hex0) {
  if (OFF) return null;
  const T = FV.ITEM[kind], zn = zone(x, z), k = T.K, fi = byW(hsh(x, z, k), T.W[zn]);
  const form = PLAIN ? T.PLAIN[fi] : T.F[fi], pal = T.PAINT[form] && T.PAINT[form][zn];
  let hex = pal ? pal[Math.floor(hsh(x, z, k + 1) * pal.length)] : hex0, hex2 = null, hex3 = null, tips = false;
  if (Array.isArray(hex)) { hex2 = hex[1] || null; hex = hex[0]; }
  const a = hsh(x, z, k + 3);
  if (form === 'forged') { if (zn === 'old' && a < FV.WEAR2.GOLD) hex2 = '#c9a23a'; tips = zn === 'old'; }
  else if (!PLAIN && kind !== 'can' && kind !== 'urn' && hsh(x, z, k + 2) < FV.WEAR2.FADE[zn] && hex) hex = mix(hex, '#c9c6bd', 0.4);   // выцвела
  if (form === 'picket') { tips = zn !== 'rim' && a < 0.7; if (tips) hex2 = hex; }
  if (form === 'board') hex2 = ['#c8352e', '#3f6fa8', '#f2eee4', '#2f5a3a'][Math.floor(a * 4)];
  if (form === 'vase') hex2 = ['#3f6fa8', '#c45a48', hex, hex][Math.floor(a * 4)];
  if (kind === 'bench') {
    hex2 = form === 'park' ? '#1e2022' : form === 'slats' || form === 'broken' ? (zn === 'old' ? '#c9c5bb' : '#9a968b') : a < 0.5 ? '#3b3f46' : '#5c5560';
    if (form === 'park' && zn === 'old' && a < 0.5) hex3 = '#c9a23a';
  }
  if (kind === 'can' && form === 'metal' && !PLAIN && hsh(x, z, k + 2) < FV.WEAR2.RUST[zn] * 1.5) hex = mix(hex, '#8a4a2a', 0.55);   // ржавый
  const S = ST.items[kind] || (ST.items[kind] = {});
  S[form] = (S[form] || 0) + 1;
  const aged = !PLAIN && hsh(x, z, k + 5) < FV.WEAR2.OLD[zn];
  return { kind, form, hex, hex2, hex3, tips, zone: zn, seed: hsh(x, z, k + 4), metal: !!METAL_F[form], aged };
}
/* износ секции заборчика: { rust, peel, miss, seed } — на телефоне нет */
export function wear2 (x, z, sv) {
  const W = FV.WEAR2, zn = sv.zone, h = hsh(x, z, 191), seed = hsh(x, z, 192);
  if (PLAIN) return { seed };
  const metal = sv.metal, wood = sv.form === 'picket' || sv.form === 'planks4' || sv.form === 'planks' || sv.form === 'bars' || sv.form === 'forged';
  const aged = sv.aged, rust = aged && metal && h < W.RUST, peel = !rust && (metal || sv.form === 'board') && h < (aged ? W.RUST + W.PEEL : W.NEW_PEEL);
  const miss = aged && wood && hsh(x, z, 193) < W.MISS ? 0.12 + hsh(x, z, 194) * 0.2 : 0;
  if (rust) ST.wear2.rust++; if (peel) ST.wear2.peel++; if (miss) ST.wear2.miss++;
  return { rust, peel, miss, seed };
}

export const DEBUG = { FV, ST, TALL: TALL_LIST, zone, OFF, PLAIN, item, wear2 };
