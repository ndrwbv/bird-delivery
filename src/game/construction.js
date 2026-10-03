/* ──────────────────────────────────────────────────────────────────────────
   Стройки на пустырях (docs/IDEAS.md № 10; правила — docs/CAREER.md
   «Город: стройки на пустырях»).

   • Где: пустырь у улицы — участок 34—46 × 26—34 м, в котором и рядом
     (6 м) нет домов, нет ни одной дороги и дорожки, не парк, не лес, не
     газон, не площадка и не парковка из карты, не вода, перепад высот
     меньше SLOPE; от подъездов — не ближе ENTR м (там пины заказов), от
     пиццерий — PIZZA м. Рядом должен быть жилой квартал (NEAR подъездов в
     300 м). Жребий — по месту (хэш), карта та же — стройки те же. Не ближе
     GAP м друг к другу, сначала по одной на район, потом до MAX.
   • Что: шиферный забор по периметру (секции 2,5 м, ворота к улице), внутри —
     каркас недостроя (колонны и плиты, 2—4 этажа) или фундамент с торчащими
     сваями, башенный кран (стрела крутится), бытовка (1—2), кучи щебня и
     песка, поддоны кирпича, экскаватор (у фундамента) или бетономешалка
     (у каркаса). У ворот — стенд «паспорт объекта»: что строят, заказчик,
     подрядчик, сроки — 15 вариантов (2 — только во взрослой), на языке игры.
   • Что ломается: секция забора на ходу быстрее 9 км/ч падает плашмя по
     ходу удара (машину чуть тормозит); куча разлетается камнями (−15 %
     скорости) и через PILE_BACK с снова собирается, если ты не рядом;
     поддоны, стенд, ворота — сносятся как дворовая мелочь. Бытовка и
     техника — тяжёлые: упираются, толкаются (бытовка — как полторы машины,
     экскаватор — как четыре), крутятся от удара сбоку, на ударе быстрее
     DENT мнутся там, куда въехал; быстрее HURT — полсердца, HURT2 — сердце.
     Колонны каркаса, стенки фундамента и башня крана — стены.
     На новой смене всё стоит на местах.
   • Самосвалы: машина потока, родившаяся ближе DUMP_R м к стройке, с шансом
     DUMP_P — самосвал со щебнем (одновременно не больше DUMP_MAX). Едет к
     ближайшей стройке (на перекрёстках сворачивает к ней), доехал — к
     следующей. Сбивается, мнётся и горит как машина; отбросило — щебень из
     кузова рассыпается.
   Перф: всё стоящее — в склейках (LIT, LITM, мелочь дворов smashAdd): новых
   отрисовок нет, кроме стрел кранов (по мешу на кран, общая геометрия) и
   одного меша со всеми стендами. Свой меш — только у тронутого.

   Из game.js: build(api) — при сборке города (до smashBuild), step(dt) —
   каждый кадр, car(...) — каждый шаг машины, nextEdge(t, e) — поворот
   самосвала, onRespawn(t), reset() — новая смена.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t, N_ } from '../i18n/index.js';

export const CONS = {
  MAX: 13, GAP: 380, PER_DIST: 2,   // строек — не больше; не ближе друг к другу, м; в одном районе
  W: [34, 46], D: [26, 34],         // участок: вдоль улицы и вглубь, м
  SET: 4.5,                         // забор — в стольких м от края проезжей части
  HOUSE: 6, ENTR: 22, PIZZA: 120, POI: 20, NEAR: 12, SLOPE: 1.8,
  STEP: 30,                         // шаг поиска вдоль улиц, м
  FENCE_H: 2.0, SEC: 2.5, GATE: 7,  // забор: высота, секция, ворота
  PILE_BACK: 75,                    // с: куча снова собирается (если ты дальше 25 м)
  FALL_LIE: 40, FALL_MAX: 40,       // упавшая секция лежит, с; лежащих не больше
  DUMP_P: 0.16, DUMP_R: 450, DUMP_MAX: 3,
  MASS: { cabin: 1.5, digger: 4, mixer: 3.5 },   // в массах машины игрока
  FRICT: { cabin: 9, digger: 14, mixer: 10 },    // трение, м/с²
  DENT: 6, HURT: 50 / 3.6, HURT2: 80 / 3.6,      // м/с: мнётся; полсердца; сердце
};

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hash = (x, z, k = 0) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };

let A = null;
const SITES = [];          // { x, z, ux, uz, W, D, kind: 'frame'|'pit', pass, dist, crane }
const BODIES = [], DYN = [], BGRID = new Map(), BG = 20;   // бытовки и техника
const ITEMS = [];          // сбиваемое стройки (забор, кучи, поддоны, стенд): для reset
const FALL = [];           // упавшие секции забора
const CRANES = [];         // { grp, ang, to, wait, x, z }
const ST = { tried: 0, tested: 0, ms: 0, sections: 0, piles: 0, bodies: 0, hits: 0, fell: 0, pileHits: 0, dumps: 0, spilled: 0, dents: 0, why: {} };
const bgKey = (x, z) => Math.floor(x / BG) + ',' + Math.floor(z / BG);

/* ═════════════ паспорт объекта ═════════════
   o — объект, c — заказчик, p — подрядчик, s — начало, e — сдача */
const PASS = [
  { o: N_('ТЦ «Почти центр»'), c: N_('ООО «Вот-вот»'), p: N_('ИП Стёпа и болгарка'), s: N_('2009 год'), e: N_('вчера') },
  { o: N_('Бассейн «Лягушатник»'), c: N_('администрация города'), p: N_('«Копай-Строй»'), s: N_('1987 год'), e: N_('после дождя') },
  { o: N_('Парковка на 3 машины'), c: N_('Жека'), p: N_('Жека'), s: N_('в пятницу'), e: N_('как батя скажет') },
  { o: N_('ЖК «Лосиный остров»'), c: N_('«ЛосьИнвест»'), p: N_('«Рога и копыта»'), s: N_('2014 год'), e: N_('весной (какой — не сказано)') },
  { o: N_('Пиццерия «Птица Пицца» № 2'), c: N_('Толик управляющий'), p: N_('курьеры в обед'), s: N_('сегодня'), e: N_('до конца смены') },
  { o: N_('Детская площадка'), c: N_('жильцы дома 5'), p: N_('«Горка-Сервис»'), s: N_('2011 год'), e: N_('когда дети вырастут') },
  { o: N_('Кальянная «У Стёпы» — 2'), c: N_('Стёпа'), p: N_('Стёпа'), s: N_('после обеда'), e: N_('дымится'), adult: 1 },
  { o: N_('Ремонт дороги'), c: N_('дорожники'), p: N_('те же дорожники'), s: N_('каждую весну'), e: N_('никогда') },
  { o: N_('Дата-центр нейросети'), c: N_('Андрюша'), p: N_('нейросеть'), s: N_('три дня назад'), e: N_('после релиза') },
  { o: N_('Фонтан «Мирный атом»'), c: N_('комбинат'), p: N_('«Светим-Строй»'), s: N_('1949 год'), e: N_('уже светится') },
  { o: N_('Гараж на 200 машин'), c: N_('дядя Женя'), p: N_('шиномонтаж «Круглый»'), s: N_('2016 год'), e: N_('когда кончатся колёса') },
  { o: N_('Теннисный корт со ставками'), c: N_('Игорёк'), p: N_('Лёха Арбуз'), s: N_('как депнул'), e: N_('если повезёт'), adult: 1 },
  { o: N_('Небоскрёб, 2 этажа'), c: N_('ЖСК «Выше всех»'), p: N_('«Кирпич-Кирпич»'), s: N_('2012 год'), e: N_('вчера') },
  { o: N_('Подземный переход'), c: N_('пешеходы'), p: N_('экскаватор Вася'), s: N_('2019 год'), e: N_('копаем') },
  { o: N_('Лосиный мост через дорогу'), c: N_('лоси'), p: N_('бобры (по договору)'), s: N_('прошлой осенью'), e: N_('по сезону') },
];
const LBL = { o: N_('Объект'), c: N_('Заказчик'), p: N_('Подрядчик'), s: N_('Начало работ'), e: N_('Сдача') };
const BAND = ['#1f4f8a', '#2f6e3a', '#a8322a', '#1f4f8a', '#5a4a8a'];

const CW = 384, CH = 288, COLS = 4, ROWS = 4, AW = CW * COLS, AH = CH * ROWS;
const FONT = (w, fs) => `${w} ${fs}px Arial, "Helvetica Neue", sans-serif`;
function fit (x, text, maxW, fs0, fsMin, w) {
  let fs = fs0;
  x.font = FONT(w, fs);
  while (fs > fsMin && x.measureText(text).width > maxW) { fs -= 1; x.font = FONT(w, fs); }
  return fs;
}
function drawPass (x, ps, i) {
  x.fillStyle = '#f4f2ec'; x.fillRect(0, 0, CW, CH);
  const band = BAND[i % BAND.length];
  x.fillStyle = band; x.fillRect(0, 0, CW, 46);
  x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  fit(x, t('ПАСПОРТ ОБЪЕКТА'), CW - 20, 28, 14, 900);
  x.fillText(t('ПАСПОРТ ОБЪЕКТА'), CW / 2, 24);
  x.textAlign = 'left';
  let y = 66;
  for (const k of ['o', 'c', 'p', 's', 'e']) {
    const lab = t(LBL[k]) + ':';
    x.fillStyle = '#5a5a5a';
    fit(x, lab, 130, 17, 10, 700);
    x.fillText(lab, 14, y);
    x.fillStyle = k === 'e' ? '#b8261e' : '#1d1d1b';
    fit(x, t(ps[k]), CW - 160, k === 'o' ? 21 : 18, 9, 800);
    x.fillText(t(ps[k]), 150, y);
    x.fillStyle = '#d6d2c8'; x.fillRect(14, y + 18, CW - 28, 2);
    y += 40;
  }
  x.fillStyle = band; x.fillRect(0, CH - 34, CW, 34);
  x.fillStyle = '#ffffff'; x.textAlign = 'center';
  fit(x, t('Приносим извинения за временные неудобства'), CW - 20, 15, 9, 700);
  x.fillText(t('Приносим извинения за временные неудобства'), CW / 2, CH - 17);
  x.strokeStyle = '#3a3a3a'; x.lineWidth = 6; x.strokeRect(3, 3, CW - 6, CH - 6);
}
let PLIST = null;
function passAtlas () {
  PLIST = PASS.filter(p => A.ADULT || !p.adult);
  const c = document.createElement('canvas');
  c.width = AW; c.height = AH;
  const x = c.getContext('2d');
  PLIST.slice(0, COLS * ROWS).forEach((ps, i) => {
    x.save(); x.translate((i % COLS) * CW, ((i / COLS) | 0) * CH);
    x.beginPath(); x.rect(0, 0, CW, CH); x.clip();
    drawPass(x, ps, i);
    x.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
function passCell (i) {
  const c = i % COLS, r = (i / COLS) | 0, e = 1.5;
  return [(c * CW + e) / AW, 1 - ((r + 1) * CH - e) / AH, ((c + 1) * CW - e) / AW, 1 - (r * CH + e) / AH];
}

/* ═════════════ модели: коробки в своих осях (x — вдоль, y — вверх, z — вглубь) ═════════════ */
const B = (g, w, h, d, hex, x, y, z, rx = 0, ry = 0, rz = 0) => A.put(g, A.boxGeo(w, h, d), hex, x, y, z, rx, ry, rz);
const CYL = (g, r, l, hex, x, y, z, rx = 0, ry = 0, rz = 0, n = 10) => A.put(g, new THREE.CylinderGeometry(r, r, l, n), hex, x, y, z, rx, ry, rz);

/* бытовка 6 × 2,4 м */
function cabinParts (g, v) {
  const body = v ? '#e9e5dc' : '#3f6fb0', trim = v ? '#3f6fb0' : '#e9e5dc';
  for (const a of [-2.4, 2.4]) B(g, 0.5, 0.4, 2.2, '#9a958c', a, 0.2, 0);      // на блоках
  B(g, 6, 2.3, 2.4, body, 0, 1.55, 0);
  B(g, 6.12, 0.12, 2.52, '#8e9399', 0, 2.76, 0);                                 // крыша
  B(g, 6.04, 0.16, 2.44, trim, 0, 2.3, 0);                                       // полоса
  B(g, 0.9, 1.9, 0.06, '#5a4e44', -1.6, 1.35, -1.23);                            // дверь — к воротам (−z)
  for (const a of [0.4, 1.9]) { B(g, 1.0, 0.8, 0.06, '#9fc2dc', a, 1.75, -1.23); B(g, 1.0, 0.06, 0.08, '#ececec', a, 1.75, -1.24); }
  B(g, 1.0, 0.8, 0.06, '#9fc2dc', 0.6, 1.75, 1.23);
  B(g, 1.0, 0.3, 0.7, '#7a7a7a', -1.6, 0.2, -1.6);                               // ступенька
}
/* экскаватор: гусеницы вдоль x, стрела — вперёд (+x) */
function diggerParts (g) {
  const Y = '#f2b21c', D = '#2b2a2e';
  for (const s of [-1.05, 1.05]) { B(g, 4.0, 0.8, 0.75, D, 0, 0.42, s); B(g, 3.4, 0.2, 0.8, '#55545a', 0, 0.86, s); }
  B(g, 2.2, 0.5, 1.6, '#4a4a50', 0, 1.05, 0);
  B(g, 3.0, 1.0, 2.5, Y, -0.3, 1.75, 0);                                          // поворотная платформа
  B(g, 1.0, 1.0, 2.4, '#3a3a40', -1.9, 1.75, 0);                                  // противовес
  B(g, 1.2, 1.6, 1.0, Y, 0.7, 3.0, -0.65);                                         // кабина
  B(g, 0.06, 1.1, 0.9, '#9fc2dc', 1.31, 3.15, -0.65);
  B(g, 1.1, 1.0, 0.06, '#9fc2dc', 0.7, 3.15, -1.16);
  B(g, 3.6, 0.45, 0.45, Y, 2.4, 3.4, 0.3, 0, 0, 0.55);                             // стрела вверх
  B(g, 2.6, 0.4, 0.4, Y, 4.6, 3.3, 0.3, 0, 0, -0.75);                              // рукоять вниз
  B(g, 0.9, 0.8, 1.2, '#55545a', 5.3, 2.1, 0.3, 0, 0, 0.3);                        // ковш
  for (const z of [-0.1, 0.7]) B(g, 0.1, 0.1, 0.1, '#bbbbbb', 5.6, 1.7, z);
}
/* бетономешалка: кабина спереди (+x) */
function mixerParts (g) {
  const W = '#e8e8e4', O = '#e8892e', D = '#2b2a2e';
  B(g, 7.6, 0.35, 1.2, D, 0, 0.85, 0);                                             // рама
  for (const a of [2.6, -1.4, -2.7]) for (const s of [-1, 1]) CYL(g, 0.52, 0.4, '#1d1c20', a, 0.52, s * 1.05, Math.PI / 2, 0, 0);
  B(g, 1.9, 2.0, 2.4, W, 3.0, 2.0, 0);                                              // кабина
  B(g, 0.06, 0.9, 2.1, '#5b7ea3', 3.96, 2.4, 0);
  B(g, 0.3, 0.3, 2.4, '#b8b8b8', 4.0, 1.1, 0);
  // барабан — наклонная бочка из трёх кусков
  CYL(g, 1.15, 2.4, O, -0.4, 2.5, 0, 0, 0, Math.PI / 2 - 0.18, 12);
  CYL(g, 0.85, 1.2, W, -2.1, 2.85, 0, 0, 0, Math.PI / 2 - 0.18, 12);
  CYL(g, 0.9, 0.8, W, 1.2, 2.2, 0, 0, 0, Math.PI / 2 - 0.18, 12);
  B(g, 0.6, 0.15, 0.6, '#55545a', -3.1, 2.9, 0, 0, 0, -0.5);                       // лоток
}
/* самосвал потока: вдоль z, нос — +z (как машины потока) */
function dumpParts (g, lights, hex) {
  const D = '#2b2a2e', T = '#1d1c20';
  B(g, 1.3, 0.4, 7.0, D, 0, 0.75, -0.2);                                           // рама
  B(g, 2.4, 2.0, 1.9, hex, 0, 2.0, 2.4);                                           // кабина
  B(g, 2.42, 0.4, 0.4, '#3a3a40', 0, 0.95, 3.35);                                  // бампер
  B(g, 2.1, 0.8, 0.06, '#4b6a8a', 0, 2.45, 3.36);                                  // лобовое
  for (const s of [-1, 1]) B(g, 0.06, 0.7, 1.0, '#4b6a8a', s * 1.21, 2.4, 2.6);
  B(g, 2.5, 1.2, 4.4, '#7a7d82', 0, 1.75, -1.15);                                  // кузов
  B(g, 2.5, 0.2, 0.5, '#7a7d82', 0, 2.45, 1.2);                                    // козырёк над кабиной
  B(g, 2.2, 0.5, 3.8, '#8e8a80', 0, 2.5, -1.2);                                    // щебень горкой
  B(g, 1.6, 0.35, 2.6, '#9a958a', 0, 2.85, -1.1);
  for (const z of [2.4, -0.9, -2.3]) for (const s of [-1, 1]) {
    CYL(g, 0.55, 0.45, T, s * 1.0, 0.55, z, 0, 0, Math.PI / 2);
    CYL(g, 0.22, 0.47, '#9aa0a8', s * 1.0, 0.55, z, 0, 0, Math.PI / 2, 8);
  }
  for (const s of [-1, 1]) {
    B(lights, 0.4, 0.22, 0.05, '#fff6d8', s * 0.85, 1.05, 3.57);
    B(lights, 0.3, 0.16, 0.05, '#e0262a', s * 0.95, 1.0, -3.72);
  }
}

/* ═════════════ поиск пустырей ═════════════ */
function bboxOf (p) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
  return { p, x0, z0, x1, z1 };
}
function inPoly (x, z, p) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0], zi = p[i][1], xj = p[j][0], zj = p[j][1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function grid (cell) {
  const m = new Map();
  return {
    add (x0, z0, x1, z1, v) {
      for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++)
        for (let j = Math.floor(z0 / cell); j <= Math.floor(z1 / cell); j++) {
          const k = i + ',' + j;
          let a = m.get(k);
          if (!a) m.set(k, a = []);
          a.push(v);
        }
    },
    at: (x, z) => m.get(Math.floor(x / cell) + ',' + Math.floor(z / cell)),
  };
}
function segD (x, z, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1;
  const q = clamp(((x - x1) * dx + (z - z1) * dz) / l2, 0, 1);
  return Math.hypot(x - x1 - dx * q, z - z1 - dz * q);
}

function finder () {
  const C = A.CITY;
  const POLY = grid(100);
  const addP = p => { if (!p || p.length < 3) return; const b = bboxOf(p); POLY.add(b.x0, b.z0, b.x1, b.z1, b); };
  for (const g of C.green) addP(g.p);
  for (const l of C.lots || []) addP(l.p);
  for (const l of C.garlots || []) addP(l);
  for (const m of C.malls || []) addP(m.p);
  const LINE = grid(32);
  const addL = pts => { for (let i = 1; i < pts.length; i++) { const [x1, z1] = pts[i - 1], [x2, z2] = pts[i]; LINE.add(Math.min(x1, x2) - 3, Math.min(z1, z2) - 3, Math.max(x1, x2) + 3, Math.max(z1, z2) + 3, [x1, z1, x2, z2]); } };
  for (const p of C.paths || []) addL(p);
  for (const r of C.rails || []) addL(r.p);
  for (const s of C.streams || []) addL(s.p);
  const SOL = grid(30);
  for (const s of A.SOLIDS) SOL.add(s.cx - s.ex, s.cz - s.ez, s.cx + s.ex, s.cz + s.ez, s);
  const ENT = grid(50);
  for (const e of C.entrances.concat(A.GEN_ENTR || [])) ENT.add(e[0], e[1], e[0], e[1], e);   // свои подъезды попадут в CITY.entrances позже
  const pois = (C.pois || []).map(p => p.p).concat((C.kpp || []).map(k => k.p)).concat((C.stops || []).map(s => s.p));
  const piz = (A.PIZZERIAS || []).map(p => [p.bx || p.x || 0, p.bz || p.z || 0]);

  const inPolys = (x, z) => { const a = POLY.at(x, z); if (a) for (const b of a) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && inPoly(x, z, b.p)) return true; return false; };
  const nearLine = (x, z, m) => { const a = LINE.at(x, z); if (a) for (const s of a) if (segD(x, z, s[0], s[1], s[2], s[3]) < m) return true; return false; };
  const inSolid = (x, z, r) => {
    const a = SOL.at(x, z);
    if (a) for (const s of a) {
      const dx = x - s.cx, dz = z - s.cz, lx = dx * s.cs + dz * s.sn, lz = -dx * s.sn + dz * s.cs;
      if (Math.abs(lx) < s.hw + r && Math.abs(lz) < s.hd + r) return true;
    }
    return false;
  };
  const entrNear = (x, z, R) => {
    let n = 0;
    for (let i = Math.floor((x - R) / 50); i <= Math.floor((x + R) / 50); i++)
      for (let j = Math.floor((z - R) / 50); j <= Math.floor((z + R) / 50); j++) {
        const a = ENT.at(i * 50 + 1, j * 50 + 1);
        if (a) for (const e of a) if (Math.hypot(e[0] - x, e[1] - z) < R) n++;
      }
    return n;
  };

  const no = k => { ST.why[k] = (ST.why[k] || 0) + 1; return false; };
  /* участок: центр, ось вдоль улицы (ux, uz), вглубь — (−uz, ux) */
  function test (s) {
    const { x, z, ux, uz, W, D } = s, nx = -uz, nz = ux;
    const P = (a, b) => [x + ux * a + nx * b, z + uz * a + nz * b];
    let h0 = Infinity, h1 = -Infinity;
    // дешёвое — сначала: центр и углы
    const pts = [[0, 0], [-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]];
    for (let a = -W / 2 - 2; a <= W / 2 + 2.01; a += 4) for (let b = -D / 2 - 2; b <= D / 2 + 2.01; b += 4) pts.push([a, b]);
    for (const [a, b] of pts) {
      const [px, pz] = P(a, b);
      if (!A.inBounds(px, pz, 60)) return no('bounds');
      if (A.inHouse(px, pz, CONS.HOUSE)) return no('house');
      const gy = A.groundH(px, pz);
      if (gy < 0.5) return no('water');
      h0 = Math.min(h0, gy); h1 = Math.max(h1, gy);
      if (h1 - h0 > CONS.SLOPE) return no('slope');
      if (inPolys(px, pz)) return no('poly');
      if (nearLine(px, pz, 2.5)) return no('path');
      if (inSolid(px, pz, 1.2)) return no('solid');
      const r = A.nearestRoad(px, pz, 7, 1);
      if (r && r.d < r.seg.w / 2 + 1.5) return no('road');
    }
    // улица у ворот — та самая и прямая: передний край в SET м от полотна по всей длине
    for (const a of [-W / 2, 0, W / 2]) {
      const [px, pz] = P(a, -D / 2), r = A.nearestRoad(px, pz, 5, 1);
      if (!r || r.d > r.seg.w / 2 + CONS.SET + 2.5) return no('curve');
    }
    // подъезды (пины заказов) — не ближе ENTR от участка; жилой квартал рядом
    const R = Math.hypot(W, D) / 2;
    let near = 0;
    for (let i = Math.floor((x - R - CONS.ENTR) / 50); i <= Math.floor((x + R + CONS.ENTR) / 50); i++)
      for (let j = Math.floor((z - R - CONS.ENTR) / 50); j <= Math.floor((z + R + CONS.ENTR) / 50); j++) {
        const a = ENT.at(i * 50 + 1, j * 50 + 1);
        if (a) for (const e of a) {
          const dx = e[0] - x, dz = e[1] - z, la = Math.abs(dx * ux + dz * uz) - W / 2, lb = Math.abs(dx * nx + dz * nz) - D / 2;
          if (Math.hypot(Math.max(0, la), Math.max(0, lb)) < CONS.ENTR) return no('entr');
        }
      }
    near = entrNear(x, z, 300);
    if (near < CONS.NEAR) return no('lonely');
    for (const p of pois) if (p && Math.hypot(p[0] - x, p[1] - z) < R + CONS.POI) return no('poi');
    for (const p of piz) if (Math.hypot(p[0] - x, p[1] - z) < CONS.PIZZA) return no('pizza');
    s.gy = (h0 + h1) / 2;
    return true;
  }
  return { test };
}

function findSites () {
  const F = finder();
  const cands = [];
  for (const r of A.CITY.roads) {
    if (r.c < 2 || r.c > 4 || r.b || r.x) continue;
    const w = A.roadWidth(r);
    let acc = CONS.STEP / 2;
    for (let i = 1; i < r.p.length; i++) {
      const [x1, z1] = r.p[i - 1], [x2, z2] = r.p[i];
      const L = Math.hypot(x2 - x1, z2 - z1);
      if (L < 1) continue;
      const ux = (x2 - x1) / L, uz = (z2 - z1) / L;
      for (; acc < L; acc += CONS.STEP) {
        const cx = x1 + ux * acc, cz = z1 + uz * acc;
        for (const sd of [1, -1]) {
          const h = hash(cx, cz, sd > 0 ? 3 : 5);
          const W = CONS.W[0] + (CONS.W[1] - CONS.W[0]) * hash(cx, cz, 7), D = CONS.D[0] + (CONS.D[1] - CONS.D[0]) * hash(cx, cz, 9);
          const vx = ux * sd, vz = uz * sd, nx = -vz, nz = vx, off = w / 2 + CONS.SET + D / 2;
          cands.push({ x: cx + nx * off, z: cz + nz * off, ux: vx, uz: vz, W, D, pr: h });
        }
      }
      acc -= L;
    }
  }
  ST.tried = cands.length;
  cands.sort((a, b) => a.pr - b.pr);
  const per = new Map();
  const far = (c, m) => SITES.every(s => Math.hypot(s.x - c.x, s.z - c.z) > m);
  for (let round = 0; round < 2 && SITES.length < CONS.MAX; round++) {
    const cap = !A.distAt ? Infinity : round === 0 ? 1 : CONS.PER_DIST;
    for (const c of cands) {
      if (SITES.length >= CONS.MAX) break;
      if (c.used || !far(c, CONS.GAP)) continue;
      const di = A.distAt ? A.distAt(c.x, c.z) : 0;
      if ((per.get(di) || 0) >= cap) continue;
      if (c.bad) continue;
      ST.tested++;
      if (!F.test(c)) { c.bad = 1; continue; }
      c.used = 1; c.dist = di;
      per.set(di, (per.get(di) || 0) + 1);
      SITES.push(c);
    }
  }
}

/* ═════════════ постройка одной стройки ═════════════ */
let PMESH_P = [], PMESH_UV = [], PMESH_I = [], STANDS = [];
let DIG_TPL = null, MIX_TPL = null, CAB_TPL = [null, null], PANEL_GEO = null, MAT = null;
const JIB_TPL = new Map();

function mats () {
  if (MAT) return;
  MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
}
function tplGeo (fn, ...args) { const g = []; fn(g, ...args); return A.mergeGeos(g); }
/* шаблон, повёрнутый и поставленный в мир — для склейки мелочи */
const MX = new THREE.Matrix4(), MY = new THREE.Matrix4();
function placed (tpl, x, y, z, ry) {
  const g = tpl.clone();
  MY.makeRotationY(ry); MX.makeTranslation(x, y, z);
  g.applyMatrix4(MX.multiply(MY));
  return g;
}

function slatePanelGeo () {
  if (PANEL_GEO) return PANEL_GEO;
  const g = [];
  slateParts(g, 0, 0, 0, 0, 0);
  PANEL_GEO = A.mergeGeos(g);
  return PANEL_GEO;
}
/* секция шифера в своих осях: x вдоль забора, низ на y; v — вариант оттенка */
function slateParts (g, x, y, z, ry, v) {
  const c = ['#9aa0a2', '#8d9496', '#a5a8a6'][v % 3], dk = '#7d8486';
  const H = CONS.FENCE_H;
  const P = (w, h, d, hex, lx, ly, lz) => { const cs = Math.cos(ry), sn = Math.sin(ry); A.put(g, A.boxGeo(w, h, d), hex, x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs, 0, ry, 0); };
  P(CONS.SEC - 0.04, H, 0.05, c, 0, H / 2 + 0.05, 0);
  for (const a of [-0.9, -0.3, 0.3, 0.9]) P(0.12, H, 0.08, dk, a, H / 2 + 0.05, 0);     // волна шифера — тёмными полосами
  P(0.1, H + 0.25, 0.1, '#6b5a44', -CONS.SEC / 2, (H + 0.25) / 2, 0.08);                // столб
  P(CONS.SEC, 0.08, 0.06, '#6b5a44', 0, H - 0.3, 0.09);                                  // прожилина
}

function build1 (s, idx) {
  const { x, z, ux, uz, W, D } = s, nx = -uz, nz = ux;
  const ry = Math.atan2(-uz, ux);                      // поворот three.js: локальный x → (ux, uz), z → (nx, nz)
  const oy = Math.atan2(uz, ux);                       // поворот obb (game.js obb: x → (cos, sin))
  const P = (a, b) => [x + ux * a + nx * b, z + uz * a + nz * b];
  const gy = (a, b) => { const [px, pz] = P(a, b); return A.groundH(px, pz); };
  const h = k => hash(x, z, k);
  const LIT = A.LIT;
  const Bw = (w, hh, d, hex, a, y, b, r = 0) => { const [px, pz] = P(a, b); A.box(LIT, w, hh, d, hex, px, gy(a, b) + y, pz, ry + r); };
  s.kind = h(21) < 0.55 ? 'frame' : 'pit';
  s.pass = -1;
  // земля участка — укатанный грунт
  {
    const [ax, az] = P(-W / 2, -D / 2), [bx, bz] = P(W / 2, -D / 2), [cx, cz] = P(W / 2, D / 2), [dx, dz] = P(-W / 2, D / 2);
    A.LITM.color('#8a7a62');
    A.LITM.dtri(ax, az, bx, bz, cx, cz, 0.06);
    A.LITM.dtri(ax, az, cx, cz, dx, dz, 0.06);
    // колея от ворот
    const [ex, ez] = P(-2.4, -D / 2 - 2), [fx, fz] = P(2.4, -D / 2 - 2), [gx, gz] = P(2.4, 0), [hx, hz] = P(-2.4, 0);
    A.LITM.color('#6e6150');
    A.LITM.dtri(ex, ez, fx, fz, gx, gz, 0.08);
    A.LITM.dtri(ex, ez, gx, gz, hx, hz, 0.08);
  }
  // ── забор: секции по периметру, ворота к улице ──
  const sec = (a, b, r, v) => {
    const [px, pz] = P(a, b), g = [];
    slateParts(g, px, A.groundH(px, pz), pz, ry + r, v);
    const it = A.smashAdd('bigfence', px, pz, 1.3, g, '#9aa0a2');
    it.cons = 'fence'; it.ry = ry + r; it.v = v;
    it.onDown = onFenceDown;
    ITEMS.push(it);
    ST.sections++;
  };
  const S2 = CONS.SEC;
  for (const side of [0, 1, 2, 3]) {
    const L = side % 2 === 0 ? W : D, n = Math.max(1, Math.round(L / S2)), st = L / n;
    for (let i = 0; i < n; i++) {
      const q = -L / 2 + st * (i + 0.5);
      if (side === 0 && Math.abs(q) < CONS.GATE / 2) continue;                          // ворота
      const v = ((i * 7 + side * 3 + idx) % 5) === 0 ? 1 : (i + side) % 3;
      if (side === 0) sec(q, -D / 2, 0, v);
      else if (side === 2) sec(q, D / 2, Math.PI, v);
      else if (side === 1) sec(W / 2, q, -Math.PI / 2, v);
      else sec(-W / 2, q, Math.PI / 2, v);
    }
  }
  // ворота: столбы и распахнутые створки из сетки
  for (const sd of [-1, 1]) {
    Bw(0.25, 2.6, 0.25, '#3d6a3f', sd * CONS.GATE / 2, 1.3, -D / 2);
    const a = sd * (CONS.GATE / 2 - 1.15), b = -D / 2 + 1.2;
    const [px, pz] = P(a, b), g = [], gyy = A.groundH(px, pz), rr = ry + sd * 1.2;
    A.put(g, A.boxGeo(2.6, 1.9, 0.05), '#4f7a52', px, gyy + 1.1, pz, 0, rr, 0);
    A.put(g, A.boxGeo(2.6, 0.08, 0.1), '#2f4a32', px, gyy + 2.05, pz, 0, rr, 0);
    const it = A.smashAdd('fence', px, pz, 1.2, g, '#4f7a52');
    it.onDown = saveOrig; ITEMS.push(it);
  }
  // ── стенд «паспорт объекта»: справа от ворот, снаружи, лицом к улице ──
  {
    const a = CONS.GATE / 2 + 2.4, b = -D / 2 - 1.0, [px, pz] = P(a, b), g0 = A.groundH(px, pz);
    const g = [];
    for (const o of [-1.4, 1.4]) { const [qx, qz] = P(a + o, b + 0.05); A.put(g, A.boxGeo(0.12, 3.4, 0.12), '#4a4a50', qx, g0 + 1.7, qz, 0, ry, 0); }
    { const [qx, qz] = P(a, b + 0.08); A.put(g, A.boxGeo(3.3, 2.5, 0.08), '#5a5a60', qx, g0 + 2.1, qz, 0, ry, 0); }
    const it = A.smashAdd('sign', px, pz, 1.4, g, '#5a5a60');
    it.onDown = saveOrig; ITEMS.push(it);
    // лицо — в общий меш стендов (вершины v0…v0+4)
    const fx = -nx, fz = -nz, ox = px + fx * 0.02, oz = pz + fz * 0.02;      // чуть перед доской
    const hw = 1.56, y0 = g0 + 0.95, y1 = g0 + 3.25;
    const v0 = PMESH_P.length / 3;
    // смотрим с улицы (−n): правая рука — (−ux, −uz)
    PMESH_P.push(ox + ux * hw, y0, oz + uz * hw, ox - ux * hw, y0, oz - uz * hw, ox - ux * hw, y1, oz - uz * hw, ox + ux * hw, y1, oz + uz * hw);
    PMESH_I.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
    s.pass = (idx * 7 + 3) % PLIST.length;                                 // 7 и длина списка (15, в детской 13) взаимно просты — все стенды разные
    const [u0, vv0, u1, vv1] = passCell(s.pass);
    PMESH_UV.push(u0, vv0, u1, vv0, u1, vv1, u0, vv1);
    STANDS.push({ x: px, z: pz, v0, it });
  }
  // ── основное: каркас или фундамент — в дальнем правом углу ──
  const fw = s.kind === 'frame' ? 15 : 16, fd = s.kind === 'frame' ? 10 : 11;
  const sa = W / 2 - 3 - fw / 2, sb = D / 2 - 3 - fd / 2, base = gy(sa, sb);
  const Bs = (w, hh, d, hex, a, y, b, r = 0) => { const [px, pz] = P(a, b); A.box(LIT, w, hh, d, hex, px, base + y, pz, ry + r); };
  const CON = '#b9b5ad', CON2 = '#a8a49c', RB = '#5b3a2a';
  if (s.kind === 'frame') {
    const fl = 2 + ((h(23) * 3) | 0), FH = 3.2;
    s.floors = fl;
    const cols = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) cols.push([sa - fw / 2 + 0.3 + i * (fw - 0.6) / 3, sb - fd / 2 + 0.3 + j * (fd - 0.6) / 2]);
    for (let f = 0; f < fl; f++) {
      const top = f === fl - 1;
      for (const [a, b] of cols) {
        if (top && hash(a, b, f) < 0.35) continue;                                      // верхний этаж — не все колонны
        Bs(0.5, FH, 0.5, CON, a, f * FH + FH / 2, b);
        if (top) for (const o of [-0.15, 0.15]) Bs(0.05, 1.2, 0.05, RB, a + o, f * FH + FH + 0.6, b + o);   // арматура торчит
      }
      // плита перекрытия; на последнем — половина
      if (!top) Bs(fw, 0.3, fd, f % 2 ? CON2 : CON, sa, (f + 1) * FH, sb);
      else Bs(fw / 2, 0.3, fd, CON2, sa - fw / 4, (f + 1) * FH, sb);
      // кирпичная кладка — местами
      if (f < fl - 1 && hash(sa, f, 3) < 0.7) Bs(fw * 0.66, FH - 0.3, 0.38, '#a8503a', sa - fw * 0.17, f * FH + (FH - 0.3) / 2, sb + fd / 2 - 0.3);
      if (f === 0) Bs(0.38, FH - 0.3, fd * 0.6, '#a8503a', sa + fw / 2 - 0.3, (FH - 0.3) / 2, sb + fd * 0.2);
    }
    // лестница-марш снаружи (просто наклонная плита)
    Bs(1.2, 0.25, 5.2, CON2, sa - fw / 2 - 0.9, FH / 2, sb, 0);
    for (const [a, b] of cols) { const [px, pz] = P(a, b); A.obb(px, pz, 0.3, 0.3, oy); }
    { const [px, pz] = P(sa + fw / 2 - 0.3, sb + fd * 0.2); A.obb(px, pz, fd * 0.3, 0.25, oy + Math.PI / 2); }
  } else {
    // фундамент: стенки из блоков ФБС, внутри — тёмный грунт, сетка арматуры, сваи
    const WH = 0.9;
    { const [ax, az] = P(sa - fw / 2, sb - fd / 2), [bx, bz] = P(sa + fw / 2, sb - fd / 2), [cx, cz] = P(sa + fw / 2, sb + fd / 2), [dx, dz] = P(sa - fw / 2, sb + fd / 2);
      A.LITM.color('#4e4234'); A.LITM.dtri(ax, az, bx, bz, cx, cz, 0.1); A.LITM.dtri(ax, az, cx, cz, dx, dz, 0.1); }
    const wall = (a, b, len, along) => {
      for (let q = -len / 2 + 1.2; q < len / 2; q += 2.4) {
        const aa = along ? a + q : a, bb = along ? b : b + q;
        Bs(along ? 2.36 : 0.6, WH, along ? 0.6 : 2.36, (Math.round(q) & 1) ? CON : CON2, aa, WH / 2, bb);
      }
      const [px, pz] = P(a, b);
      A.obb(px, pz, len / 2, 0.3, along ? oy : oy + Math.PI / 2);
    };
    wall(sa, sb - fd / 2, fw, true); wall(sa, sb + fd / 2, fw, true);
    wall(sa - fw / 2, sb, fd, false); wall(sa + fw / 2, sb, fd, false);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
      const a = sa - fw / 2 + 2 + i * (fw - 4) / 4, b = sb - fd / 2 + 2 + j * (fd - 4) / 2;
      Bs(0.35, 1.1 + hash(a, b, 1) * 0.6, 0.35, CON, a, 0.6, b);                        // сваи
    }
    for (let i = 0; i < 6; i++) Bs(0.04, 0.04, fd - 1.2, RB, sa - fw / 2 + 1 + i * (fw - 2) / 5, 0.35, sb);   // арматура
    for (let j = 0; j < 4; j++) Bs(fw - 1.2, 0.04, 0.04, RB, sa, 0.36, sb - fd / 2 + 1 + j * (fd - 2) / 3);
  }
  // ── башенный кран: перед стройкой слева ──
  {
    const ca = sa - fw / 2 - 2.6, cb = sb - fd / 2 - 2.6;
    const [px, pz] = P(ca, cb), cg = A.groundH(px, pz);
    const H = (s.floors ? s.floors * 3.2 + 14 : 20) + h(25) * 6;
    const col = ['#f2b21c', '#e8892e', '#c8323a'][(h(27) * 3) | 0];
    const Bc = (w, hh, d, hex, la, y, lb, r = 0) => A.box(LIT, w, hh, d, hex, px + ux * la + nx * lb, cg + y, pz + uz * la + nz * lb, ry + r);
    Bc(4, 0.9, 4, '#9a968e', 0, 0.45, 0);                                           // балласт
    for (const [a, b] of [[-0.75, -0.75], [0.75, -0.75], [0.75, 0.75], [-0.75, 0.75]]) Bc(0.18, H, 0.18, col, a, H / 2 + 0.9, b);
    for (let y = 2; y < H; y += 2.2) { Bc(1.6, 0.1, 0.1, col, 0, y, -0.75); Bc(1.6, 0.1, 0.1, col, 0, y + 1.1, 0.75); Bc(0.1, 0.1, 1.6, col, -0.75, y + 0.55, 0); Bc(0.1, 0.1, 1.6, col, 0.75, y + 1.65, 0); }
    A.obb(px, pz, 2, 2, oy);
    mats();
    const jt = jibTpl(col);
    const grp = new THREE.Mesh(jt, MAT);
    grp.position.set(px, cg + H + 0.9, pz);
    const ang = h(29) * Math.PI * 2;
    grp.rotation.y = ang;
    grp.matrixAutoUpdate = false; grp.updateMatrix();
    A.scene.add(grp);
    CRANES.push({ grp, ang, base: ang, to: ang, wait: rand(2, 6), x: px, z: pz });
    s.crane = [Math.round(px), Math.round(pz), Math.round(H)];
  }
  // ── бытовки: у ворот слева ──
  const nCab = 1 + (h(33) < 0.45 ? 1 : 0);
  for (let i = 0; i < nCab; i++) addBody('cabin', P(-W / 2 + 4.2, -D / 2 + 2.3 + i * 2.9), ry, (i + idx) & 1);
  // ── кучи щебня и песка: вдоль левого забора ──
  const piles = [['#8e8a80', 2.4, 1.7], ['#d9b36a', 2.2, 1.5], ['#8e8a80', 1.8, 1.3]];
  const np = 2 + (h(35) < 0.4 ? 1 : 0);
  for (let i = 0; i < np; i++) {
    const [hex, r, hh] = piles[i];
    const [px, pz] = P(-W / 2 + 3.6 + (i & 1) * 0.6, D / 2 - 4.0 - i * 5.0);
    addPile(px, pz, r, hh, hex);
  }
  // ── поддоны кирпича и плиты: у фасада ──
  for (let i = 0; i < 3; i++) {
    const a = -W / 2 + 11 + i * 2.0, b = -D / 2 + 2.0, [px, pz] = P(a, b), g0 = A.groundH(px, pz), g = [];
    A.put(g, A.boxGeo(1.2, 0.15, 1.0), '#a8865a', px, g0 + 0.08, pz, 0, ry, 0);
    A.put(g, A.boxGeo(1.1, 0.9, 0.95), i === 2 ? '#d8d0c0' : '#b0533c', px, g0 + 0.6, pz, 0, ry, 0);
    const it = A.smashAdd('bricks', px, pz, 0.9, g, i === 2 ? '#d8d0c0' : '#b0533c');
    it.onDown = saveOrig; it.slow = 0.9; ITEMS.push(it);
  }
  // ── техника ──
  if (s.kind === 'pit') addBody('digger', P(sa - fw / 2 - 3.6, sb + 1.5), ry + (h(37) - 0.5) * 0.4, 0);   // ковшом к фундаменту
  else addBody('mixer', P(3.5, -D / 2 + 4.6), ry + (h(39) < 0.5 ? 0 : Math.PI), 0);
  // участок — как дом: деревья, лавочки, мусор и прочее, что ставится позже, его обходят
  if (A.addFoot) A.addFoot([P(-W / 2 - 0.8, -D / 2 - 0.8), P(W / 2 + 0.8, -D / 2 - 0.8), P(W / 2 + 0.8, D / 2 + 0.8), P(-W / 2 + -0.8, D / 2 + 0.8)], 'site');
}

/* стрела крана: в своих осях, поворот вокруг верха башни */
function jibTpl (col) {
  if (JIB_TPL.has(col)) return JIB_TPL.get(col);
  const g = [], L = 26, CJ = 8;
  B(g, 2.2, 1.2, 2.2, col, 0, 0.6, 0);                                              // поворотная часть
  B(g, 1.5, 1.5, 1.7, '#e9e5dc', 1.3, 0.9, -1.2);                                   // кабина
  B(g, 0.06, 1.0, 1.5, '#9fc2dc', 2.06, 1.0, -1.2);
  for (const s of [-1, 1]) B(g, 0.2, 5.0, 0.2, col, s * 0.6, 3.6, 0, 0, 0, s * 0.12);   // оголовок
  // стрела: нижние пояса, верхний, раскосы
  for (const s of [-0.55, 0.55]) B(g, L, 0.16, 0.16, col, L / 2 + 1, 1.2, s);
  B(g, L, 0.16, 0.16, col, L / 2 + 1, 2.3, 0);
  for (let a = 2; a < L; a += 2) { B(g, 0.1, 1.3, 0.1, col, a, 1.75, 0.28, 0.4, 0, 0.6); B(g, 0.1, 1.3, 0.1, col, a + 1, 1.75, -0.28, -0.4, 0, -0.6); }
  // противовесная консоль и грузы
  for (const s of [-0.6, 0.6]) B(g, CJ, 0.2, 0.2, col, -CJ / 2, 1.2, s);
  B(g, 2.2, 2.0, 1.6, '#8e8a84', -CJ + 1.4, 0.4, 0);
  // ванты от оголовка
  B(g, Math.hypot(L * 0.6, 4.5), 0.06, 0.06, '#3a3a3a', L * 0.3, 3.8, 0, 0, 0, -Math.atan(4.5 / (L * 0.6)));
  B(g, Math.hypot(CJ, 4.5), 0.06, 0.06, '#3a3a3a', -CJ / 2, 3.8, 0, 0, 0, Math.atan(4.5 / CJ));
  // каретка, трос, крюк и груз — поддон кирпича
  const ta = L * 0.62;
  B(g, 1.0, 0.4, 1.0, '#3a3a40', ta, 1.0, 0);
  B(g, 0.05, 12, 0.05, '#2a2a2a', ta, -5.2, 0);
  B(g, 0.4, 0.5, 0.3, '#f2b21c', ta, -11.3, 0);
  B(g, 1.3, 1.0, 1.1, '#b0533c', ta, -12.3, 0);
  const geo = A.mergeGeos(g);
  geo.computeBoundingSphere();
  JIB_TPL.set(col, geo);
  return geo;
}

/* ═════════════ сбиваемое ═════════════ */
function saveOrig (it) {
  const a = it.mesh.geometry.attributes.position.array;
  if (!it.orig) it.orig = a.slice(it.v0 * 3, (it.v0 + it.nv) * 3);
  ST.hits++;
}
function unhide (it) {
  if (!it.orig || !it.mesh) return;
  const pos = it.mesh.geometry.attributes.position;
  pos.array.set(it.orig, it.v0 * 3);
  pos.needsUpdate = true;
  it.down = 0;
}
/* секция шифера падает плашмя по ходу удара */
function onFenceDown (it, nx, nz, force) {
  saveOrig(it);
  ST.fell++;
  mats();
  const m = new THREE.Mesh(slatePanelGeo(), MAT);
  const gy = A.groundH(it.x, it.z);
  m.rotation.order = 'YXZ';
  m.position.set(it.x, gy, it.z);
  m.rotation.y = it.ry;
  // в какую сторону от плоскости секции толкнули: нормаль секции — (sin ry, cos ry)
  const s = Math.sin(it.ry) * nx + Math.cos(it.ry) * nz >= 0 ? 1 : -1;
  A.scene.add(m);
  FALL.push({ m, a: 0, va: 1.5 + Math.min(force, 25) * 0.12, dir: s, t: CONS.FALL_LIE, slide: Math.min(force, 20) * 0.04, nx, nz });
  if (FALL.length > CONS.FALL_MAX) { const o = FALL.shift(); A.scene.remove(o.m); }
  if (A.Snd && A.Snd.blip) A.Snd.blip(140, 0.12, 'square', 0.05);
}
function addPile (x, z, r, h, hex) {
  const g = [], gy = A.groundH(x, z);
  A.put(g, new THREE.ConeGeometry(r, h, 9, 1), hex, x, gy + h / 2 - 0.05, z, 0, hash(x, z) * 3, 0);
  A.put(g, new THREE.ConeGeometry(r * 0.7, h * 0.7, 7, 1), hex, x + r * 0.5, gy + h * 0.35 - 0.05, z + r * 0.3, 0, 1, 0);
  const it = A.smashAdd('pile', x, z, r * 0.85, g, hex);
  it.cons = 'pile'; it.slow = 0.85;
  it.onDown = onPileDown;
  ITEMS.push(it);
  ST.piles++;
}
const PILES_DOWN = [];
function onPileDown (it, nx, nz, force) {
  saveOrig(it);
  ST.pileHits++;
  it.back = CONS.PILE_BACK;
  PILES_DOWN.push(it);
  const gy = A.groundH(it.x, it.z);
  for (let i = 0; i < 12; i++) {
    const s = rand(0.15, 0.32);
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), new THREE.MeshLambertMaterial({ color: it.hex, flatShading: true }));
    m.position.set(it.x + rand(-0.8, 0.8), gy + rand(0.3, 1.2), it.z + rand(-0.8, 0.8));
    A.scene.add(m);
    A.GORE.push({ m, vx: nx * rand(3, 7) * (0.4 + force / 30) + rand(-2.5, 2.5), vy: rand(2.5, 6), vz: nz * rand(3, 7) * (0.4 + force / 30) + rand(-2.5, 2.5),
      spin: rand(-8, 8), life: rand(5, 9), bleed: 1e9, rest: 0 });
  }
  if (A.puff) { A.puff(it.x, 0.6, it.z, false, 1.4); A.puff(it.x + nx, 0.4, it.z + nz, false, 1.0); }
  if (A.Snd && A.Snd.noise) A.Snd.noise(0.35, 0.3);
}

/* ═════════════ бытовки и техника: толкаются, мнутся ═════════════ */
const SIZE = { cabin: [3.0, 1.2], digger: [2.4, 1.45], mixer: [3.9, 1.3] };   // полуразмеры: вдоль, поперёк
function tplOf (kind, v) {
  if (kind === 'cabin') return CAB_TPL[v] || (CAB_TPL[v] = tplGeo(cabinParts, v));
  if (kind === 'digger') return DIG_TPL || (DIG_TPL = tplGeo(diggerParts));
  return MIX_TPL || (MIX_TPL = tplGeo(mixerParts));
}
function addBody (kind, [x, z], ry, v) {
  const gy = A.groundH(x, z), tpl = tplOf(kind, v);
  A.smashAdd('cons_' + kind, x, z, 2.5, [placed(tpl, x, gy, z, ry)], kind === 'cabin' ? '#3f6fb0' : '#f2b21c');
  const it = A.SMASH[A.SMASH.length - 1];
  const [hw, hd] = SIZE[kind];
  const o = { kind, v, it, x, z, ry, x0: x, z0: z, ry0: ry, vx: 0, vz: 0, w: 0, hw, hd, m: CONS.MASS[kind], dyn: null, geo: null, rest: 1, dent: 0 };
  it.heavy = 1;
  it.junk = (q, nx, nz, force) => { detach(o); o.vx += nx * force * 0.6 / o.m; o.vz += nz * force * 0.6 / o.m; o.w += rand(-1, 1) * 0.6; o.rest = 0; };   // взрыв рядом
  BODIES.push(o);
  const k = bgKey(x, z);
  if (!BGRID.has(k)) BGRID.set(k, []);
  BGRID.get(k).push(o);
  ST.bodies++;
}
function hide (it) {
  saveOrig(it); ST.hits--;
  const pos = it.mesh.geometry.attributes.position, a = pos.array, gy = A.groundH(it.x, it.z) - 1;
  for (let i = it.v0; i < it.v0 + it.nv; i++) { a[i * 3] = it.x; a[i * 3 + 1] = gy; a[i * 3 + 2] = it.z; }
  pos.needsUpdate = true;
  it.down = 1;
}
function detach (o) {
  if (o.dyn) return;
  hide(o.it);
  mats();
  o.dyn = new THREE.Mesh(o.geo || tplOf(o.kind, o.v), MAT);
  A.scene.add(o.dyn);
  DYN.push(o);
  pose(o);
}
function pose (o) {
  o.dyn.position.set(o.x, A.groundH(o.x, o.z), o.z);
  o.dyn.rotation.y = o.ry;
}
/* вмятина: вершины у места удара — внутрь, по нормали удара */
function dent (o, wx, wz, nx, nz, f) {
  if (o.dent > 1.6) return;
  if (!o.geo) { o.geo = tplOf(o.kind, o.v).clone(); o.dyn.geometry = o.geo; }
  const cs = Math.cos(o.ry), sn = Math.sin(o.ry);
  const dx = wx - o.x, dz = wz - o.z;
  const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;          // в оси модели (three.js rotateY)
  const lnx = nx * cs - nz * sn, lnz = nx * sn + nz * cs;        // нормаль удара — наружу, к машине
  const a = o.geo.attributes.position.array, R = 1.5, k = 0.35 * f;
  for (let i = 0; i < a.length; i += 3) {
    const d = Math.hypot(a[i] - lx, a[i + 2] - lz);
    if (d > R || a[i + 1] > 2.6) continue;
    const w = (1 - d / R) * k * (0.6 + 0.4 * hash(a[i], a[i + 2], i));
    a[i] -= lnx * w; a[i + 2] -= lnz * w; a[i + 1] -= w * 0.15;
  }
  o.geo.attributes.position.needsUpdate = true;
  o.dent += f;
  ST.dents++;
}

const NEAR = [];
export function car (noseX, noseZ, tailX, tailZ, rc) {
  if (!A || !BODIES.length) return;
  const V = A.V;
  NEAR.length = 0;
  const ci = Math.floor(V.x / BG), cj = Math.floor(V.z / BG);
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (const o of BGRID.get(i + ',' + j) || []) NEAR.push(o);
  for (const o of DYN) if (Math.abs(o.x - V.x) < 12 && Math.abs(o.z - V.z) < 12 && NEAR.indexOf(o) < 0) NEAR.push(o);
  for (const o of NEAR) {
    if (Math.abs(o.x - V.x) > 9 || Math.abs(o.z - V.z) > 9) continue;
    const cs = Math.cos(o.ry), sn = Math.sin(o.ry);
    for (let c = 0; c < 2; c++) {
      const px = c ? tailX : noseX, pz = c ? tailZ : noseZ;
      const dx = px - o.x, dz = pz - o.z;
      const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;      // локальные: x → (cs, −sn), z → (sn, cs)
      const qx = clamp(lx, -o.hw, o.hw), qz = clamp(lz, -o.hd, o.hd);
      let ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez), pen;
      if (d >= rc) continue;
      if (d < 1e-4) {                                             // центр круга внутри — наружу по ближней стороне
        const px2 = o.hw - Math.abs(lx), pz2 = o.hd - Math.abs(lz);
        if (px2 < pz2) { ex = lx < 0 ? -1 : 1; ez = 0; pen = px2 + rc; } else { ex = 0; ez = lz < 0 ? -1 : 1; pen = pz2 + rc; }
      } else { ex /= d; ez /= d; pen = rc - d; }
      const nx = ex * cs + ez * sn, nz = -ex * sn + ez * cs;   // от тела к машине, в мире
      const hx = o.x + qx * cs + qz * sn, hz = o.z - qx * sn + qz * cs;
      detach(o);
      const kc = o.m / (1 + o.m);
      V.x += nx * pen * kc; V.z += nz * pen * kc;
      o.x -= nx * pen * (1 - kc); o.z -= nz * pen * (1 - kc);
      const rel = -((V.vx - o.vx) * nx + (V.vz - o.vz) * nz);
      if (rel <= 0) continue;
      const j = 1.15 * rel / (1 + 1 / o.m);
      V.vx += nx * j; V.vz += nz * j;
      o.vx -= nx * j / o.m; o.vz -= nz * j / o.m;
      const rx = hx - o.x, rz = hz - o.z, I = (o.hw * o.hw + o.hd * o.hd) / 3;
      o.w += ((-nx * j / o.m) * rz - (-nz * j / o.m) * rx) / I * 0.7;
      o.rest = 0;
      if (rel > 3) {
        A.sparks(hx, 0.9, hz, rel > 9 ? 8 : 3, -nx, -nz);
        A.Snd.noise(0.15, Math.min(0.32, rel * 0.03));
        A.S.shake = Math.max(A.S.shake, Math.min(0.4, rel * 0.035));
      }
      if (rel > CONS.DENT) dent(o, hx, hz, nx, nz, clamp((rel - CONS.DENT) / 14, 0.25, 1));
      if (rel >= CONS.HURT) A.hurt(rel >= CONS.HURT2 ? 1 : 0.5, rel, hx, hz);
    }
  }
}

function stepBodies (dt) {
  for (let i = DYN.length - 1; i >= 0; i--) {
    const o = DYN[i];
    if (o.rest) continue;
    const sp = Math.hypot(o.vx, o.vz), fr = CONS.FRICT[o.kind];
    if (sp > 0) {
      const k = Math.max(0, sp - fr * dt) / sp;
      o.vx *= k; o.vz *= k;
      o.x += o.vx * dt; o.z += o.vz * dt;
      const bx = o.x, bz = o.z;
      A.pushOut(o, Math.min(o.hw, o.hd));
      if (bx !== o.x || bz !== o.z) { o.vx *= 0.3; o.vz *= 0.3; }
    }
    o.ry += o.w * dt; o.w *= Math.exp(-4 * dt);
    pose(o);
    if (sp < 0.05 && Math.abs(o.w) < 0.03) { o.vx = o.vz = 0; o.w = 0; o.rest = 1; }
  }
}

/* ═════════════ самосвалы ═════════════ */
const DUMP_HEX = ['#e8892e', '#2f6fa8', '#d8382f', '#e8e4da'];
let DUMP_TPL = null;
function dumpTpl () {
  if (DUMP_TPL) return DUMP_TPL;
  DUMP_TPL = DUMP_HEX.map(hex => { const g = [], l = []; dumpParts(g, l, hex); return { lit: A.mergeGeos(g), flat: A.mergeGeos(l) }; });
  return DUMP_TPL;
}
function makeDump () {
  const k = (Math.random() * DUMP_HEX.length) | 0, T = dumpTpl()[k];
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  g.add(new THREE.Mesh(T.lit.clone(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  g.add(new THREE.Mesh(T.flat.clone(), new THREE.MeshBasicMaterial({ vertexColors: true })));
  g.userData = { lite: false, hl: 3.7, wheels: [], steer: [], panels: [], glass: [], hazard: [], dmg: 0, bodyHex: DUMP_HEX[k], model: 'dump' };
  return g;
}
function nearestSite (x, z, not) {
  let best = null, bd = Infinity;
  for (const s of SITES) { if (s === not) continue; const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
  return [best, bd];
}
const okDump = t => !t.parked && !t.svc && !t.chase && !t.taxi && !t.gone && !t.accident && !t.rival && !t.knock && !t.wreck && !t.hb && t.model !== 'moped' && t.mesh && t.mesh.userData.lite;
function stepDumps (dt) {
  const TR = A.TRAFFIC;
  let n = 0;
  for (const t of TR) if (t.dump && !t.gone) n++;
  ST.dumps = n;
  for (const t of TR) {
    if (!t.cnRoll) {
      t.cnRoll = 1;
      if (n < CONS.DUMP_MAX && okDump(t)) {
        const [s, d] = nearestSite(t.x, t.z);
        if (s && d < CONS.DUMP_R && (Math.random() < CONS.DUMP_P || DEBUG.force > 0)) {
          if (DEBUG.force > 0) DEBUG.force--;
          const old = t.mesh, m = makeDump();
          m.position.copy(old.position); m.rotation.copy(old.rotation);
          A.scene.remove(old);
          old.children[0].geometry.dispose();
          A.scene.add(m);
          t.mesh = m; t.model = 'dump'; t.hl = 3.7; t.cruise = rand(8, 11);
          t.hbRoll = 1;                                              // коневозкой не станет
          t.dump = { goal: d < 60 ? nearestSite(t.x, t.z, s)[0] : s, spilled: 0 };
          n++;
        }
      }
    }
    const D = t.dump;
    if (!D) continue;
    if (D.goal && Math.hypot(D.goal.x - t.x, D.goal.z - t.z) < 60) D.goal = nearestSite(t.x, t.z, D.goal)[0];   // приехал — к следующей
    if (!D.spilled && ((t.knock && Math.hypot(t.kvx, t.kvz) > 5) || t.wreck)) {
      D.spilled = 1; ST.spilled++;
      const gy = A.groundH(t.x, t.z);
      for (let i = 0; i < 14; i++) {
        const s = rand(0.15, 0.35);
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), new THREE.MeshLambertMaterial({ color: '#8e8a80', flatShading: true }));
        m.position.set(t.x + rand(-1, 1), gy + rand(2.2, 3), t.z + rand(-1.5, 1.5));
        A.scene.add(m);
        A.GORE.push({ m, vx: (t.kvx || 0) * 0.5 + rand(-3, 3), vy: rand(1.5, 4.5), vz: (t.kvz || 0) * 0.5 + rand(-3, 3), spin: rand(-6, 6), life: rand(8, 14), bleed: 1e9, rest: 0 });
      }
      if (A.puff) A.puff(t.x, 2.5, t.z, false, 1.6);
    }
  }
}
/* поворот самосвала на перекрёстке — к своей стройке; null — как все */
export function nextEdge (t, e) {
  const g = t.dump && t.dump.goal;
  if (!g || !A) return null;
  const N = A.NODES, b = N[e.b];
  const dx = g.x - b.x, dz = g.z - b.z, l = Math.hypot(dx, dz) || 1;
  let best = null, bs = -Infinity;
  for (const c of b.nb) {
    if (c === e.a) continue;
    const n = A.edgeOf(e.b, c);
    if (!n.ok || n.c > 5 || n.closed || n.lock) continue;
    if (!A.inBounds(N[c].x, N[c].z, -40)) continue;
    const s = (n.ux * dx + n.uz * dz) / l + Math.random() * 0.6 + (n.c <= 3 ? 0.1 : 0);
    if (s > bs) { bs = s; best = n; }
  }
  return best;
}
export function onRespawn (t) { t.dump = null; t.cnRoll = 0; }

/* ═════════════ сборка, кадр, новая смена ═════════════ */
export function build (api) {
  A = api;
  const t0 = performance.now();
  PLIST = PASS.filter(p => A.ADULT || !p.adult);
  findSites();
  SITES.forEach((s, i) => build1(s, i));
  if (STANDS.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(PMESH_P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(PMESH_UV, 2));
    g.setIndex(PMESH_I);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: passAtlas() }));
    m.matrixAutoUpdate = false;
    m.name = 'construction-pass';
    A.scene.add(m);
    for (const s of STANDS) {
      const it = A.smashMesh('sign', s.x, s.z, 1.4, m, s.v0, 4, '#f4f2ec');
      it.onDown = saveOrig; ITEMS.push(it);
    }
    PMESH_P = PMESH_UV = PMESH_I = null;
  }
  ST.ms = Math.round(performance.now() - t0);
  DEBUG.list = SITES.map(s => ({ x: Math.round(s.x), z: Math.round(s.z), W: Math.round(s.W), D: Math.round(s.D), kind: s.kind, dist: s.dist, pass: s.pass >= 0 ? PLIST[s.pass].o : '', crane: s.crane, floors: s.floors || 0 }));
  if (typeof window !== 'undefined' && window.__dlv) window.__dlv.CONS = DEBUG;
}

export function step (dt) {
  if (!A) return;
  // краны: стрела поворачивается к новой точке, стоит, снова
  const V = A.V;
  for (const c of CRANES) {
    if (Math.abs(c.x - V.x) > 700 || Math.abs(c.z - V.z) > 700) continue;
    if (c.wait > 0) { c.wait -= dt; continue; }
    const d = c.to - c.ang;
    if (Math.abs(d) < 0.01) { c.wait = rand(4, 9); c.to = c.base + rand(-1.6, 1.6); continue; }
    c.ang += Math.sign(d) * Math.min(Math.abs(d), 0.13 * dt);
    c.grp.rotation.y = c.ang; c.grp.updateMatrix();
  }
  if (DYN.length) stepBodies(dt);
  // упавшие секции: доваливаются, лежат, уходят в землю
  for (let i = FALL.length - 1; i >= 0; i--) {
    const f = FALL[i];
    if (f.a < Math.PI / 2 - 0.05) {
      f.va += 9 * dt;
      f.a = Math.min(Math.PI / 2 - 0.05, f.a + f.va * dt);
      f.m.rotation.x = f.a * f.dir;
      if (f.slide > 0) { f.m.position.x += f.nx * f.slide * dt * 4; f.m.position.z += f.nz * f.slide * dt * 4; f.slide = Math.max(0, f.slide - dt); }
      if (f.a >= Math.PI / 2 - 0.05 && A.puff) A.puff(f.m.position.x, 0.2, f.m.position.z, false, 0.8);
    } else if ((f.t -= dt) < 0) {
      f.m.position.y -= dt * 0.3;
      if (f.t < -3) { A.scene.remove(f.m); FALL.splice(i, 1); }
    }
  }
  // кучи собираются снова, если ты не рядом
  for (let i = PILES_DOWN.length - 1; i >= 0; i--) {
    const it = PILES_DOWN[i];
    if ((it.back -= dt) > 0) continue;
    if (Math.hypot(it.x - V.x, it.z - V.z) < 25) { it.back = 3; continue; }
    unhide(it); PILES_DOWN.splice(i, 1);
  }
  if (A.TRAFFIC) stepDumps(dt);
}

/* новая смена: забор, кучи, стенды — на месте, бытовки и техника — где стояли */
export function reset () {
  if (!A) return;
  for (const it of ITEMS) if (it.down) unhide(it);
  PILES_DOWN.length = 0;
  for (const f of FALL) A.scene.remove(f.m);
  FALL.length = 0;
  for (const o of DYN) {
    A.scene.remove(o.dyn); o.dyn = null;
    if (o.geo) { o.geo.dispose(); o.geo = null; }
    Object.assign(o, { x: o.x0, z: o.z0, ry: o.ry0, vx: 0, vz: 0, w: 0, rest: 1, dent: 0 });
    unhide(o.it);
  }
  DYN.length = 0;
}

/* для probe: d.CONS.list — стройки; force = 2 — следующие две машины потока у строек станут самосвалами */
export const DEBUG = {
  CONS, ST, SITES, BODIES, DYN, ITEMS, FALL, CRANES, force: 0, list: [],
  dumps: () => (A && A.TRAFFIC ? A.TRAFFIC.filter(t => t.dump).map(t => ({ x: Math.round(t.x), z: Math.round(t.z), goal: t.dump.goal ? [Math.round(t.dump.goal.x), Math.round(t.dump.goal.z)] : null, sp: +t.speed.toFixed(1), knock: t.knock, spilled: t.dump.spilled })) : []),
  reset: () => reset(),
};
