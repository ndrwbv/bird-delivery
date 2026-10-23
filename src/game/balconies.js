/* ──────────────────────────────────────────────────────────────────────────
   Балконы (М1, 24.10.2026; автор 23.10: «балконы сейчас просто прямоугольники»). Правила словами —
   docs/CAREER.md «Город: как выглядит» → «Балконы».

   Было: на длинных стенах жилых домов — коробка 2,2 × 0,9 × 1 м шахматкой (через колонку, на каждом этаже свой ряд).
   Стало: балконы стоят столбиками, как в настоящих домах (колонка окон через одну, у части колонок балконов нет),
   и у каждого — плита пола, ограждение и место внутри:
     • ограждение — у дома одно на все балконы: сплошная плита, профлист с рёбрами или решётка (прутья);
     • часть балконов жильцы остеклили (у каждого дома своя доля): снизу обшивка своего цвета, по бокам — щёки до
       потолка, спереди — рама со створками (белая, деревянная, серая), иногда створка открыта. Стекло и всё, что за
       ним (вагонка или краска, окно и дверь квартиры, бельё, лыжи, коробки, цветы, сушилка), рисует шейдер окон
       (windows.js, вид окна 128+) — ни вершин, ни вызовов;
     • у открытых — дверь на балкон рядом с окном (окно windows.js с филёнкой внизу, вид рамы 5), внутри — ящик с
       цветами снаружи на перилах, бельё на верёвке, лыжи, коробки, велосипед;
     • рядом с курьером на открытых балконах иногда люди: курят (дымок — общий пул частиц fxpool.js) или смотрят
       на улицу — голова за машиной, иногда машут. Выходят из двери и уходят в неё.

   Цена (замер 24.10.2026, docs/CAREER.md «Балконы»): в Солнечном ~75 тыс. балконов, в кадре — ~27 ближе 60 м, ~240 ближе
   150 м, ~630 ближе 250 м. Всё подробное на всех сразу — 3,8 млн треугольников (как весь город): так нельзя. Поэтому:
     • в склейке статики LITM (вызовов не прибавляет) — только каркас: плита, ограждение, у решётки — поручни,
       у остеклённого — обшивка и щёки (~12 треугольников на балкон, как прежняя коробка);
     • прутья решётки, рёбра профлиста и вся мелочь — «набор» одним InstancedMesh (+1 вызов на всё) на открытые балконы
       ближе KIT_R м к камере: какие части набора у балкона — по маске экземпляра (лишние вершины шейдер сжимает в точку),
       цвет ограждения — экземпляра; набор пересобирается, когда камера сдвинулась на KIT_MOVE м. На телефоне в наборе —
       только прутья и рёбра (без мелочи).
   Всё без случайного (зерно сборки города, docs/AGENTS.md «Город строится на зерне»): где балкон, какой и что на нём —
   от места (hsh). Прежние броски коробки (chance + uuid геометрии) game.js тянет как раньше — город не сдвигается.

   setup(api) — game.js до стройки (LITM, WINS — без вещей three.js); wall(w, o) — из facade (F0, когда известны
   подъезды; та же стена второй раз — перестройка дома: прежние места стены убираются, не задваиваются); forget(x0, z0, x1, z1) —
   убрать открытые балконы в рамке; init(api) — после стройки; step(dt) — каждый кадр (CL.step: набор и люди). ?nobalc — по-старому (коробки,
   сравнить); ?balcbare — без мелочи (как на телефоне); ?nobkit — без набора. Отладка: __dlv.BALC (ST, near(r), force()).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { MOB, CLEAN } from './mobile.js';
import { inView } from './cull.js';
import { holdFixed } from './people.js';
import * as FXP from './fxpool.js';

const QS = typeof location !== 'undefined' ? location.search : '';
export const OLD = /[?&]nobalc(&|$)/.test(QS);
const BARE = MOB.on || /[?&]balcbare(&|$)/.test(QS);   // телефон — без мелочи
const NOKIT = /[?&]nobkit(&|$)/.test(QS);
const SIMPLE = MOB.on;                             // телефон: каркас проще (без торца плиты, поручня-крышки и отлива) — видео и куча

export const BALC = {
  W: 2.65, D: 1.0, SLAB: 0.16, RAIL: 1.0,       // м: ширина (окно + дверь и по 0,25 м), глубина, плита, высота перил
  COL: 0.78,                                     // доля колонок (через одну) с балконами
  FROM2: 0.3,                                    // у стольких домов (от 5 этажей) балконы — со 2-го жилого этажа
  GLAZE: [0.15, 0.65],                           // доля остеклённых — у дома своя, от и до
  RAIL_K: { panel: 0.4, ribs: 0.25, grate: 0.35 },   // ограждение дома: плита, профлист, решётка
  ITEM: { flowers: 0.3, laundry: 0.28, skis: 0.12, boxes: 0.3, bike: 0.12 },   // открытый балкон: что там (каждое — своим жребием места)
  KIT_R: 95, KIT_MOVE: 8, KIT_MAX: 900, KIT_MAX_MOB: 400,   // набор: ближе KIT_R м к камере, пересборка через KIT_MOVE м
  /* люди: на открытых балконах ближе NEAR м к машине (не ближе MIN), в кадре; сразу не больше MAX (телефон — MAX_MOB, ночью
     и в дождь — на одного меньше); после каждого — пауза COOL с (ближний человек — 2—3 вызова отрисовки: в среднем в кадре
     ~1 человек); у балкона «жилец выходит» — доля OCC; курит SMOKE (детская — никто), остальные смотрят; машут — машина ближе WAVE м */
  NEAR: 50, MIN: 10, DROP: 70, MAX: 2, MAX_MOB: 1, COOL: [10, 25], OCC: 0.22, SMOKE: 0.5, WAVE: 26, SCAN: 0.6, STAY: [12, 30],
};
if (CLEAN) BALC.KIT_R = CLEAN.balcKitR;           // телефон: прутья и рёбра — только ближе 40 м (дальше — рябь; mobile.js CLEAN, 11бз)
const SIDING = ['#e9e6dc', '#d8d2c2', '#9fb6c9', '#c9b08a', '#7d6a5a', '#b9c7b0', '#d9c8a8', '#a8afb8'];   // обшивка остеклённых
const RAILC = ['#7f93a8', '#a8574c', '#7f9a6e', '#c9bfa0', '#8a8f96', '#5f7f9a'];                        // плиты и профлист
const GRATEC = ['#2a2a2e', '#3b4a3a', '#5a3a2e', '#e2e2dc', '#2f3f5a'];                                  // решётки

export const ST = { walls: 0, balc: 0, glazed: 0, open: 0, panel: 0, ribs: 0, grate: 0, items: 0, tris: 0, doors: 0, skipped: 0,
  kit: 0, kitBuilds: 0, kitMs: 0, people: 0, spawned: 0, waves: 0, puffs: 0, scanMs: 0, redo: 0, gone: 0 };
const hsh = (x, z, k) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
const pk = (a, h) => a[Math.min(a.length - 1, (h * a.length) | 0)];
const hexN = hex => (typeof hex === 'string' ? parseInt(hex.slice(1), 16) : hex | 0);
function shadeHex (hex, k) {
  const v = hexN(hex);
  const r = Math.min(255, Math.round(((v >> 16) & 255) * k)), g = Math.min(255, Math.round(((v >> 8) & 255) * k)), b = Math.min(255, Math.round((v & 255) * k));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/* ── стройка (в facade, внутри buildCity): только числа в склейку и окна, без three.js и Math.random ── */
let LITM = null, WINS = null;
export function setup (api) { LITM = api.LITM; WINS = api.WINS; }

/* открытые балконы — числами (на телефоне куча JS дорога): середина у стены x, z; пол y; наружу ox, oz; дверь — в сторону
   sd·(oz, −ox); маска частей набора; цвет ограждения; жребий места h */
const PER = 9;
let OB = new Float32Array(PER * 4096), ON = 0;
const CELL = 64, GRID = new Map();
const ALL = /[?&]balcall(&|$)/.test(QS) ? [] : null;   // отладка (?balcall): середины всех балконов (x, y, z) — сколько в кадре
/* части набора (биты маски): 0 — прутья решётки, 1 — рёбра профлиста, 2 — цветы, 3 — бельё, 4 — лыжи, 5 — коробки, 6 — велосипед */
const K = { GRATE: 1, RIBS: 2, FLOW: 4, LAUN: 8, SKIS: 16, BOX: 32, BIKE: 64 };

/* стена w (a, ux/uz, ox/oz, len) жилого дома: o — { base, floors, FH, cols, pad, step, seed, st, wallHex, wsty, wy0, wy1,
   inArch(m, half, y), shopHit(w, from, to, y0, y1), gaps } */
export function wall (w, o) {
  ST.walls++;
  const wk = wallKey(w), was = WALLS.get(wk);
  if (was !== undefined) { forgetRange(Math.floor(was / 65536), was % 65536); ST.redo++; }   // стену строят второй раз (перестройка дома): прежние места — долой
  const from = ON;
  wallIn(w, o);
  if (ON > from || was !== undefined) WALLS.set(wk, from * 65536 + (ON - from));
}
function wallIn (w, o) {
  const B = BALC;
  const P0 = o.seed % 2;                            // колонки с балконами — через одну (у дома свой сдвиг)
  const hr = hsh(o.seed, 7, 2), hg = hsh(o.seed, 0, 3);
  const rail = hr < B.RAIL_K.panel ? 'panel' : hr < B.RAIL_K.panel + B.RAIL_K.ribs ? 'ribs' : 'grate';
  const railHex = rail === 'grate' ? pk(GRATEC, hsh(o.seed, 1, 4)) : hsh(o.seed, 2, 5) < 0.35 ? shadeHex(o.wallHex, 0.9) : pk(RAILC, hsh(o.seed, 3, 6));
  const glaze = B.GLAZE[0] + (B.GLAZE[1] - B.GLAZE[0]) * hg;
  const f0 = hsh(o.seed, 4, 7) < B.FROM2 && o.floors > 4 ? 2 : 1;
  const tAlong = w.ux * w.oz - w.uz * w.ox > 0;    // касательная окна (oz, −ox) смотрит вдоль +u стены
  for (let j = P0; j < o.cols; j += 2) {
    const m = o.pad + (j + 0.5) * o.step, cx0 = w.a[0] + w.ux * m, cz0 = w.a[1] + w.uz * m;
    if (hsh(cx0, cz0, 8) > B.COL) continue;
    const side = hsh(cx0, cz0, 9) < 0.5 ? 1 : -1;  // дверь — справа или слева от окна (вдоль стены)
    const c = m + side * 0.425, s0 = c - B.W / 2, s1 = c + B.W / 2;
    if (s0 < 0.3 || s1 > w.len - 0.3) { ST.skipped++; continue; }
    if (o.gaps && o.gaps.some(g => s1 > g[0] - 0.2 && s0 < g[1] + 0.2)) { ST.skipped++; continue; }   // над подъездом — лестница
    const fl = [];
    for (let f = f0; f < o.floors; f++) {
      const Y = o.base + f * o.FH;
      fl[f] = !o.inArch(c, B.W / 2 + 0.1, Y) && !o.shopHit(w, s0 - 0.1, s1 + 0.1, Y - 0.3, Y + 3);
    }
    for (let f = f0; f < o.floors; f++) {
      if (!fl[f]) { ST.skipped++; continue; }
      const Y = o.base + f * o.FH, h = hsh(cx0 + f * 3.1, cz0 - f * 1.7, 10);
      one(w, o, { c, s0, s1, side, Y, f, above: !!fl[f + 1], rail, railHex, glazed: h < glaze, tAlong, h, cx0, cz0 });
    }
  }
}

/* Перестройка дома (0п37, 24.10.2026): если стену того же дома строят ещё раз (редактор: этажи, цвет, мурал), её открытые
   балконы не дописываются вторым набором — прежние места стены убираются (из сетки, набора и у людей), потом пишутся новые
   (другое число этажей — без лишних мест сверху). Стена — по началу и направлению (дм, тысячные радиана). WALLS: ключ →
   первое место × 65536 + сколько. forget(x0, z0, x1, z1) — убрать открытые балконы в рамке (дом убрали совсем) */
const WALLS = new Map();
const wallKey = w => ((Math.round(w.a[0] * 10) + 65536) * 131072 + Math.round(w.a[1] * 10) + 65536) * 8192 + Math.round(Math.atan2(w.uz, w.ux) * 1000) + 4096;
function unGrid (k) {
  const b = k * PER, ck = Math.floor(OB[b] / CELL) * 100003 + Math.floor(OB[b + 2] / CELL), arr = GRID.get(ck);
  if (arr) { const i = arr.indexOf(k); if (i >= 0) arr.splice(i, 1); if (!arr.length) GRID.delete(ck); }
  OB[b + 6] = 0;                                   // и в наборе пусто
}
function forgetRange (from, n) {
  if (!n) return;
  for (let k = from; k < from + n; k++) unGrid(k);
  for (let i = MEN.length - 1; i >= 0; i--) { const m = MEN[i]; if (m.sp.k >= from && m.sp.k < from + n) { drop(m); MEN.splice(i, 1); } }
  ST.open -= n; ST.gone += n;
  kitX = 1e9;                                       // набор — пересобрать
}
export function forget (x0, z0, x1, z1) {
  const ks = [];
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++)
    for (const k of GRID.get(i * 100003 + j) || []) { const b = k * PER; if (OB[b] >= x0 && OB[b] <= x1 && OB[b + 2] >= z0 && OB[b + 2] <= z1) ks.push(k); }
  for (const k of ks) forgetRange(k, 1);
  return ks.length;
}

/* локальные оси стены: s — вдоль, q — наружу */
let W_ = null;
const PX = (s, q) => W_.a[0] + W_.ux * s + W_.ox * q, PZ = (s, q) => W_.a[1] + W_.uz * s + W_.oz * q;
function vq (sa, qa, sb, qb, y0, y1) { LITM.wall(PX(sa, qa), PZ(sa, qa), PX(sb, qb), PZ(sb, qb), y0, y1); ST.tris += 2; }
function hq (sa, sb, qa, qb, y) {                   // горизонталь
  LITM.up(PX(sa, qa), y, PZ(sa, qa), PX(sb, qa), y, PZ(sb, qa), PX(sb, qb), y, PZ(sb, qb));
  LITM.up(PX(sa, qa), y, PZ(sa, qa), PX(sb, qb), y, PZ(sb, qb), PX(sa, qb), y, PZ(sa, qb));
  ST.tris += 2;
}

function one (w, o, b) {
  const B = BALC, D = B.D, { s0, s1, Y } = b, R = Y + 0.02 + B.RAIL, sc = (s0 + s1) / 2;
  W_ = w;
  ST.balc++;
  if (ALL) ALL.push(PX(sc, 0.5), Y + 1, PZ(sc, 0.5));
  // плита пола: верх (с двух сторон — виден и снизу) и торец
  LITM.color(shadeHex(o.wallHex, 0.82));
  hq(s0 - 0.05, s1 + 0.05, 0, D + 0.05, Y + 0.02);
  if (!SIMPLE) vq(s0 - 0.05, D + 0.05, s1 + 0.05, D + 0.05, Y - B.SLAB, Y + 0.02);
  if (b.glazed) { glazedBalc(w, o, b, R); return; }
  ST.open++;
  ST[b.rail]++;
  LITM.color(b.railHex);
  if (b.rail === 'grate') {
    // поручни спереди и по бокам; прутья, низ и стойки — в наборе (рядом с камерой)
    if (!SIMPLE) hq(s0, s1, D - 0.05, D + 0.01, R);
    vq(s0, D + 0.01, s1, D + 0.01, R - 0.07, R);
    hq(s0 - 0.03, s0 + 0.03, 0, D, R); hq(s1 - 0.03, s1 + 0.03, 0, D, R);
  } else {
    vq(s0, D, s1, D, Y + 0.02, R); vq(s0, 0, s0, D, Y + 0.02, R); vq(s1, 0, s1, D, Y + 0.02, R);
    if (!SIMPLE) { LITM.color(shadeHex(b.railHex, 0.75)); hq(s0, s1, D - 0.04, D + 0.03, R + 0.01); }   // поручень сверху
  }
  // дверь на балкон рядом с окном: окно windows.js до пола, внизу филёнка (вид рамы 5 — дверь)
  const dm = sc + b.side * 0.6;
  WINS.add(w, dm - 0.36, dm + 0.36, Y + 0.03, Y + o.wy1, 0.08, (o.wsty & 24) + 5);
  ST.doors++;
  // запись для набора и людей
  const I = B.ITEM, x = b.cx0 + b.f * 0.7, z = b.cz0 - b.f * 0.3;
  let mask = b.rail === 'grate' ? K.GRATE : b.rail === 'ribs' ? K.RIBS : 0;
  if (!BARE) {
    if (hsh(x, z, 20) < I.flowers) mask |= K.FLOW;
    if (hsh(x, z, 30) < I.laundry) mask |= K.LAUN;
    if (hsh(x, z, 40) < I.skis) mask |= K.SKIS;
    if (hsh(x, z, 50) < I.boxes) mask |= K.BOX;
    else if (hsh(x, z, 60) < I.bike) mask |= K.BIKE;
    for (let k = 4; k < 128; k *= 2) if (mask & k) ST.items++;
  }
  // дверь — в сторону sd·(oz, −ox): side вдоль u стены, а u = ±(oz, −ox)
  const sd = b.side * Math.sign(w.ux * w.oz - w.uz * w.ox || 1);
  if (ON * PER >= OB.length) { const a = new Float32Array(OB.length * 2); a.set(OB); OB = a; }
  const j = ON * PER, cx = PX(sc, 0), cz = PZ(sc, 0);
  OB[j] = cx; OB[j + 1] = Y + 0.02; OB[j + 2] = cz; OB[j + 3] = w.ox; OB[j + 4] = w.oz; OB[j + 5] = sd; OB[j + 6] = mask;
  OB[j + 7] = hexN(b.railHex); OB[j + 8] = b.h;
  const ck = Math.floor(cx / CELL) * 100003 + Math.floor(cz / CELL), arr = GRID.get(ck);
  if (arr) arr.push(ON); else GRID.set(ck, [ON]);
  ON++;
}

/* остеклённый: обшивка снизу, щёки до потолка, рама и стекло — окно windows.js (вид 128+), над стеклом — карниз; сверху
   (последний этаж или над ним балкона нет) — крыша-козырёк */
function glazedBalc (w, o, b, R) {
  const D = BALC.D, { s0, s1, Y } = b, top = Y + o.FH - BALC.SLAB - 0.01, h2 = hsh(b.cx0 + b.f, b.cz0, 11);
  ST.glazed++;
  const sid = pk(SIDING, h2);
  LITM.color(sid);
  vq(s0, D, s1, D, Y + 0.02, R); vq(s0, 0, s0, D, Y + 0.02, top); vq(s1, 0, s1, D, Y + 0.02, top);
  const g1 = top - 0.14;
  vq(s0, D, s1, D, g1, top);                        // над стеклом
  if (!SIMPLE) { LITM.color(shadeHex(sid, 0.8)); hq(s0, s1, D, D + 0.06, R + 0.01); }   // отлив под рамой
  if (!b.above) { LITM.color(shadeHex(o.wallHex, 0.7)); hq(s0 - 0.08, s1 + 0.08, 0, D + 0.1, top + 0.02); vq(s0 - 0.08, D + 0.1, s1 + 0.08, D + 0.1, top - 0.06, top + 0.02); }
  // стекло: вид 128 + рама (0 — белая, 1 — дерево, 2 — серая) + 4 × «дверь квартиры у большего u окна»
  const fc = h2 < 0.6 ? 0 : h2 < 0.82 ? 1 : 2, doorHi = (b.side > 0) === b.tAlong;
  WINS.add(w, s0 + 0.02, s1 - 0.02, R + 0.02, g1, D + 0.005, 128 + fc + (doorHi ? 4 : 0));
}

/* ── набор мелочи (после стройки): одна геометрия на все части, экземпляр — открытый балкон рядом с камерой ──
   Локальные оси: x — вдоль стены к двери, y — вверх от пола, z — наружу. Вершина: часть (бит маски) и как красить
   (0 — свой цвет, 1 — цвет ограждения экземпляра, 2 — из палитры по зерну экземпляра) */
let KIT = null, KM = null, KG = null, kitX = 1e9, kitZ = 1e9, kitT = 0;
function kitGeo () {
  const B = BALC, W = B.W, D = B.D, R = 0.02 + B.RAIL, hw = W / 2;
  const pos = [], col = [], kk = [];
  const C = new THREE.Color();
  let part = 0, mode = 0, pal = 0, hex = 0x888888;
  const v = (x, y, z) => { pos.push(x, y, z); C.set(hex); col.push(C.r, C.g, C.b); kk.push(part, mode, pal); };
  const quad = (a, b2, c, d) => { v(...a); v(...b2); v(...c); v(...a); v(...c); v(...d); };
  const qz = (x0, x1, y0, y1, z) => quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]);   // лицом наружу
  const qx = (x, z0, z1, y0, y1) => quad([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0]);   // лицом вбок
  const qy = (x0, x1, z0, z1, y) => quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]);   // горизонталь
  const box = (x0, x1, y0, y1, z0, z1) => { qy(x0, x1, z0, z1, y1); qz(x0, x1, y0, y1, z1); qz(x0, x1, y0, y1, z0); qx(x0, z0, z1, y0, y1); qx(x1, z0, z1, y0, y1); };
  // 0 — решётка: прутья через 0,13 м, низ, стойки по углам (цвет ограждения)
  part = 0; mode = 1;
  for (let i = 1, n = Math.round(W / 0.13); i < n; i++) { const x = -hw + W * i / n; qz(x - 0.012, x + 0.012, 0.1, R - 0.06, D - 0.01); }
  for (let i = 1, n = Math.round(D / 0.13); i < n; i++) { const z = D * i / n; for (const x of [-hw, hw]) qx(x, z - 0.012, z + 0.012, 0.02, R - 0.06); }
  qz(-hw, hw, 0.02, 0.1, D - 0.01);
  for (const x of [-hw, hw]) { qz(x - 0.025, x + 0.025, 0.02, R, D); qx(x, D - 0.05, D, 0.02, R); }
  // 1 — профлист: рёбра через 0,2 м (цвет ограждения — шейдер темнит на 20 %)
  part = 1; mode = 1;
  for (let x = -hw + 0.2; x < hw - 0.1; x += 0.2) qz(x - 0.025, x + 0.025, 0.05, R - 0.03, D + 0.02);
  // 2 — ящик с цветами снаружи на перилах
  part = 2; mode = 2; pal = 0.1;
  box(-0.6, 0.4, R - 0.2, R - 0.02, D + 0.02, D + 0.22);
  mode = 0; hex = 0x3f8a3c;
  qy(-0.57, 0.37, D + 0.05, D + 0.19, R + 0.06); qz(-0.57, 0.37, R - 0.03, R + 0.06, D + 0.2);
  mode = 2;
  for (let i = 0; i < 5; i++) { const x = -0.5 + i * 0.2; pal = 0.31 + i * 0.17; qz(x - 0.045, x + 0.045, R + 0.04, R + 0.13, D + 0.215); }
  // 3 — бельё на верёвке поперёк балкона
  part = 3; mode = 0; hex = 0xd8d8d0;
  const zl = D * 0.55, yl = 2.05;
  qz(-hw, hw, yl - 0.012, yl, zl);
  mode = 2;
  for (let i = 0, x = -hw + 0.15; i < 6; i++) { const ww = [0.3, 0.42, 0.24, 0.36, 0.28, 0.4][i], hh = [0.55, 0.35, 0.65, 0.3, 0.5, 0.42][i]; pal = 0.53 + i * 0.13; qz(x, x + ww, yl - hh, yl, zl); x += ww + 0.08; if (x > hw - 0.3) break; }
  // 4 — лыжи и палки в углу у двери, прислонены к стене
  part = 4; mode = 2; pal = 0.77;
  const xs = hw - 0.2;
  quad([xs - 0.1, 0.02, 0.2], [xs - 0.02, 0.02, 0.2], [xs - 0.02, 1.8, 0.1], [xs - 0.1, 1.8, 0.1]);
  quad([xs + 0.02, 0.02, 0.2], [xs + 0.1, 0.02, 0.2], [xs + 0.1, 1.78, 0.1], [xs + 0.02, 1.78, 0.1]);
  mode = 0; hex = 0x2b2a30;
  qz(xs + 0.13, xs + 0.16, 0.02, 1.3, 0.16);
  // 5 — коробки стопкой в дальнем от двери углу
  part = 5; mode = 0;
  let y = 0.02;
  for (const [sz, hh, c] of [[0.6, 0.42, 0xb08a5a], [0.5, 0.36, 0xc49a64], [0.42, 0.3, 0xd8c8a8]]) { hex = c; box(-hw + 0.06, -hw + 0.06 + sz, y, y + hh, 0.05, 0.05 + sz * 0.85); y += hh; }
  // 6 — велосипед вдоль стены
  part = 6; mode = 0; hex = 0x1e1e22;
  const zb = 0.32, yw = 0.36;
  for (const xc of [-hw + 0.45, -hw + 1.45]) for (let k = 0; k < 8; k++) {
    const t0 = k / 8 * Math.PI * 2, t1 = (k + 1) / 8 * Math.PI * 2;
    v(xc, yw, zb); v(xc + Math.cos(t0) * 0.33, yw + Math.sin(t0) * 0.33, zb); v(xc + Math.cos(t1) * 0.33, yw + Math.sin(t1) * 0.33, zb);
  }
  mode = 2; pal = 0.91;
  const m0 = -hw + 0.9, ym = 0.78;
  qz(-hw + 0.45, m0, ym - 0.04, ym, zb + 0.01); qz(m0, -hw + 1.45, yw - 0.02, yw + 0.02, zb + 0.01); qz(m0 - 0.02, m0 + 0.02, yw, ym + 0.1, zb + 0.01);
  mode = 0;
  qz(m0 - 0.12, m0 + 0.12, ym + 0.1, ym + 0.15, zb + 0.01); qz(-hw + 1.37, -hw + 1.41, yw, ym + 0.2, zb + 0.01);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aK', new THREE.Float32BufferAttribute(kk, 3));
  return g;
}
function kitMat () {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  m.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute vec3 aK;\nattribute vec2 iB;\nattribute vec3 iC;\n' + sh.vertexShader
      .replace('#include <color_vertex>', `#include <color_vertex>
  if (aK.y > 1.5) {                                 // из палитры по зерну экземпляра: бельё, цветы, ящик, лыжи, рама велосипеда
    float h = fract(aK.z + iB.y);
    vec3 pc = h < 0.17 ? vec3(0.9, 0.2, 0.15) : h < 0.33 ? vec3(0.95, 0.93, 0.9) : h < 0.5 ? vec3(0.2, 0.45, 0.85) : h < 0.67 ? vec3(0.95, 0.78, 0.15) : h < 0.83 ? vec3(0.3, 0.7, 0.35) : vec3(0.9, 0.55, 0.7);
    vColor.rgb = pc * pc;
  } else if (aK.y > 0.5) vColor.rgb = iC * (aK.x > 0.5 && aK.x < 1.5 ? 0.8 : 1.0);   // ограждение; рёбра профлиста темнее`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  if (mod(floor(iB.x / exp2(aK.x) + 0.001), 2.0) < 0.5) transformed = vec3(0.0);');
  };
  m.customProgramCacheKey = () => 'balcKit';
  return m;
}
const CT = new THREE.Color();
function kitBuild (cx, cz) {
  if (!KIT) {
    KG = kitGeo(); KM = kitMat();
    const max = MOB.on ? BALC.KIT_MAX_MOB : BALC.KIT_MAX;
    KIT = new THREE.InstancedMesh(KG, KM, max);
    KIT.userData.iB = new Float32Array(max * 2); KIT.userData.iC = new Float32Array(max * 3);
    KG.setAttribute('iB', new THREE.InstancedBufferAttribute(KIT.userData.iB, 2));
    KG.setAttribute('iC', new THREE.InstancedBufferAttribute(KIT.userData.iC, 3));
    KIT.frustumCulled = false; KIT.name = 'balconyKit';
    KIT.count = 0;
    A.scene.add(KIT);
  }
  const t0 = performance.now(), R = BALC.KIT_R, max = KIT.instanceMatrix.count, M = KIT.instanceMatrix.array, IB = KIT.userData.iB, IC = KIT.userData.iC;
  let n = 0;
  const i0 = Math.floor((cx - R) / CELL), i1 = Math.floor((cx + R) / CELL), j0 = Math.floor((cz - R) / CELL), j1 = Math.floor((cz + R) / CELL);
  for (let i = i0; i <= i1 && n < max; i++) for (let j = j0; j <= j1 && n < max; j++) {
    const L = GRID.get(i * 100003 + j);
    if (!L) continue;
    for (const k of L) {
      const b = k * PER, x = OB[b], z = OB[b + 2], mask = OB[b + 6];
      if (!mask || (x - cx) * (x - cx) + (z - cz) * (z - cz) > R * R) continue;
      const ox = OB[b + 3], oz = OB[b + 4], sd = OB[b + 5], e = n * 16;
      // столбцы матрицы: x — к двери sd·(oz, −ox), y — вверх, z — наружу, место — середина у стены на полу
      M[e] = sd * oz; M[e + 1] = 0; M[e + 2] = -sd * ox; M[e + 3] = 0;
      M[e + 4] = 0; M[e + 5] = 1; M[e + 6] = 0; M[e + 7] = 0;
      M[e + 8] = ox; M[e + 9] = 0; M[e + 10] = oz; M[e + 11] = 0;
      M[e + 12] = x; M[e + 13] = OB[b + 1] - 0.02; M[e + 14] = z; M[e + 15] = 1;
      CT.setHex(OB[b + 7]);
      IB[n * 2] = mask; IB[n * 2 + 1] = OB[b + 8]; IC[n * 3] = CT.r; IC[n * 3 + 1] = CT.g; IC[n * 3 + 2] = CT.b;
      n++;
      if (n >= max) break;
    }
  }
  KIT.count = n;
  KIT.instanceMatrix.needsUpdate = true;
  KG.attributes.iB.needsUpdate = true; KG.attributes.iC.needsUpdate = true;
  kitX = cx; kitZ = cz;
  ST.kit = n; ST.kitBuilds++;
  ST.kitMs = Math.max(ST.kitMs, performance.now() - t0);
}

/* ── люди на балконах (после стройки) ── */
let A = null, scanT = 0, FORCE = 0, FSMOKE = 0, coolT = 0, OFFR = false;
const MEN = [];
let CIG_G = null, CIG_M = null;
export function init (api) {
  A = api;
  if (typeof window !== 'undefined') window.setTimeout(() => { if (window.__dlv) window.__dlv.BALC = DEBUG; }, 0);
}
const dist = (x, z) => Math.hypot(x - A.V.x, z - A.V.z);
const rnd = (a, b) => a + Math.random() * (b - a);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const BUSY = new Set();

function nearIdx (x, z, r) {
  const out = [], i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL), j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const k of GRID.get(i * 100003 + j) || []) out.push(k);
  return out;
}
/* место балкона k: где стоит человек (у перил, между окном и дверью) и дверь */
function spot (k) {
  const b = k * PER, x = OB[b], z = OB[b + 2], ox = OB[b + 3], oz = OB[b + 4], sd = OB[b + 5], tx = sd * oz, tz = -sd * ox;
  return { k, x: x + ox * 0.62 + tx * 0.25, z: z + oz * 0.62 + tz * 0.25, y: OB[b + 1], dx: x + ox * 0.15 + tx * 0.6, dz: z + oz * 0.15 + tz * 0.6, ox, oz, h: OB[b + 8] };
}
function spawn (sp) {
  const smoke = A.ADULT && (FSMOKE || hsh(sp.x, sp.z, 70) < BALC.SMOKE);
  const grp = Math.random() < 0.4 ? A.freshHuman({}, {}) : A.makeHuman(null, { fat: Math.random() < 0.25 });
  if (smoke) {
    if (!CIG_G) { CIG_G = new THREE.BoxGeometry(0.016, 0.09, 0.016); CIG_M = new THREE.MeshLambertMaterial({ color: 0xf4f1ea }); CIG_M.userData.keep = true; }
    const m = new THREE.Mesh(CIG_G, CIG_M); m.position.set(0, -0.6, 0.06); holdFixed(grp.userData.armR, m);
  }
  const face = Math.atan2(sp.ox, sp.oz);
  grp.rotation.y = face;
  grp.position.set(sp.dx, sp.y, sp.dz);
  A.scene.add(grp);
  const man = { sp, grp, u: grp.userData, face, smoke, st: 'out', t: 0, ph: Math.random() * 6, puff: rnd(2, 5), wave: 0, waved: 0,
    stay: rnd(BALC.STAY[0], BALC.STAY[1]), x: sp.dx, z: sp.dz };
  BUSY.add(sp.k);
  MEN.push(man);
  ST.people++; ST.spawned++;
}
function drop (m) { A.dropMesh(m.grp); BUSY.delete(m.sp.k); ST.people--; }
function walk (m, tx, tz, dt) {
  const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
  if (d < 0.05) return true;
  const k = Math.min(1, 0.8 * dt / d);
  m.x += dx * k; m.z += dz * k; m.ph += dt * 6;
  m.grp.rotation.y = damp(m.grp.rotation.y, Math.atan2(dx, dz), 8, dt);
  const sw = Math.sin(m.ph) * 0.45, u = m.u;
  u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
  m.grp.position.set(m.x, m.sp.y, m.z);
  return false;
}
function act (m, dt, near) {
  const u = m.u, V = A.V;
  m.ph += dt;
  u.legL.rotation.x = damp(u.legL.rotation.x, 0, 8, dt); u.legR.rotation.x = damp(u.legR.rotation.x, 0, 8, dt);
  m.grp.rotation.y = damp(m.grp.rotation.y, m.face, 4, dt);
  const d = dist(m.x, m.z);
  // голова — за машиной, если близко; иначе смотрит вдоль улицы
  const want = d < 40 ? Math.max(-1.1, Math.min(1.1, wrap(Math.atan2(V.x - m.x, V.z - m.z) - m.face))) : Math.sin(m.ph * 0.3) * 0.5;
  u.head.rotation.y = damp(u.head.rotation.y, want, 3, dt);
  u.head.rotation.x = damp(u.head.rotation.x, d < 40 ? 0.3 : 0.12, 3, dt);   // с высоты — вниз, на улицу
  if (m.wave > 0) {                                 // машет курьеру
    m.wave -= dt;
    u.armR.rotation.x = damp(u.armR.rotation.x, -2.8, 12, dt);
    u.armR.rotation.z = 0.25 + Math.sin(m.ph * 11) * 0.35;
    if (m.wave <= 0) u.armR.rotation.z = 0;
    return;
  }
  if (!m.waved && !m.smoke && d < BALC.WAVE && hsh(m.sp.x, m.sp.z, 71) < 0.6) { m.waved = 1; m.wave = rnd(1.6, 2.6); ST.waves++; return; }
  if (m.smoke) {
    m.puff -= dt;
    const up = m.puff < 0 && m.puff > -1.3;
    if (m.puff < -1.3) {
      m.puff = rnd(4, 8);
      if (near) {
        const fx = Math.sin(m.grp.rotation.y), fz = Math.cos(m.grp.rotation.y);
        FXP.part('puff', m.x + fx * 0.3, m.sp.y + 1.65, m.z + fz * 0.3, 0xcfcfcf, 0.22, 0.5, { vy: 0.5, vx: fx * 0.7, vz: fz * 0.7, life: 1.6, max: 1.6, grow: 2.4 });
        ST.puffs++;
      }
    }
    u.armR.rotation.x = damp(u.armR.rotation.x, up ? -2.1 : -0.35, 7, dt);
    u.armR.rotation.z = damp(u.armR.rotation.z, up ? 0.45 : 0.1, 7, dt);
    u.armL.rotation.x = damp(u.armL.rotation.x, -0.8, 4, dt);              // локоть на перилах
  } else {
    u.armL.rotation.x = damp(u.armL.rotation.x, -0.85, 4, dt); u.armR.rotation.x = damp(u.armR.rotation.x, -0.85, 4, dt);   // облокотился
    u.armR.rotation.z = damp(u.armR.rotation.z, 0, 4, dt);
  }
}

export function step (dt) {
  if (!A || OLD || !ON || OFFR || A.intro()) return;
  const V = A.V, cam = A.cam;
  // набор — когда камера сдвинулась
  if (!NOKIT && (Math.hypot(cam.position.x - kitX, cam.position.z - kitZ) > BALC.KIT_MOVE || (kitT -= dt) < -5)) { kitT = 0; kitBuild(cam.position.x, cam.position.z); }
  const cap = MOB.on ? BALC.MAX_MOB : BALC.MAX;
  if ((scanT -= dt) <= 0) {
    scanT = BALC.SCAN;
    const t0 = performance.now();
    for (let i = MEN.length - 1; i >= 0; i--) {
      const m = MEN[i];
      if (dist(m.x, m.z) > BALC.DROP || m.st === 'gone') { drop(m); MEN.splice(i, 1); }
    }
    const night = (A.ENV.night || 0) > 0.55, rain = (A.ENV.rain || 0) > 0.5;
    const want = Math.max(0, cap - (rain ? 1 : 0) - (night ? 1 : 0)) + (FORCE ? 1 : 0);
    coolT -= BALC.SCAN;
    if (MEN.length < want && (coolT <= 0 || FORCE)) {
      let best = null, bd = 1e9;
      for (const k of nearIdx(V.x, V.z, BALC.NEAR)) {
        const b = k * PER;
        if (BUSY.has(k) || (!FORCE && (OB[b + 8] * 7.3) % 1 > BALC.OCC)) continue;
        const d = dist(OB[b], OB[b + 2]);
        if (d > BALC.NEAR || d < BALC.MIN || !inView(OB[b], OB[b + 1] + 1, OB[b + 2], 1.5)) continue;
        const sc = d + Math.random() * 25;
        if (sc < bd) { bd = sc; best = k; }
      }
      if (best !== null) { spawn(spot(best)); FORCE = 0; coolT = rnd(BALC.COOL[0], BALC.COOL[1]); }
    }
    ST.scanMs = Math.max(ST.scanMs, performance.now() - t0);
  }
  for (const m of MEN) {
    const d = dist(m.x, m.z), seen = inView(m.x, m.sp.y + 1, m.z, 1.5), near = seen && d < 50;
    m.t += dt;
    if (m.st === 'out') { if (walk(m, m.sp.x, m.sp.z, dt)) m.st = 'act'; continue; }
    if (m.st === 'in') { if (walk(m, m.sp.dx, m.sp.dz, dt)) { m.st = 'gone'; m.grp.visible = false; } continue; }
    if (m.st === 'act') {
      if (near || m.wave > 0) act(m, dt, near);
      if (m.t > m.stay && (!seen || d > 30)) { m.st = 'in'; m.u.armR.rotation.x = 0; m.u.armL.rotation.x = 0; m.u.armR.rotation.z = 0; }
    }
  }
}

const DEBUG = {
  BALC, ST, MEN, ALL, get open () { return ON; }, get kit () { return KIT; },
  /* открытые балконы ближе r к машине (места людей) */
  near (r = 60) { return A ? nearIdx(A.V.x, A.V.z, r).map(spot).filter(s => dist(s.x, s.z) < r) : []; },
  spot: k => spot(k),
  force (smoke) { FORCE = 1; FSMOKE = smoke ? 1 : 0; scanT = 0; },
  /* выключить набор и людей на ходу (сравнить кадр в одном запуске) */
  get off () { return OFFR; }, set off (v) { OFFR = !!v; if (KIT) KIT.visible = !OFFR; if (OFFR) { for (const m of MEN) drop(m); MEN.length = 0; } },
  rebuild () { kitX = 1e9; },
  /* проверка перестройки (0п37): wall / forget / места стены; api — склейка и окна, что сейчас у стройки (подменить заглушкой) */
  wall, forget, setup, get api () { return { LITM, WINS }; }, get grid () { let n = 0; for (const a of GRID.values()) n += a.length; return n; },
};
