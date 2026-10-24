/* ──────────────────────────────────────────────────────────────────────────
   Дворы без пустых мест (М3, автор 23.10.2026: «во дворах редко бывают прям пустые места — деревья, детские горки,
   площадки, трансформаторные будки; проверь всё пространство и заполни»). Правила словами — docs/CAREER.md
   «Город: как выглядит» → «Дворы без пустых мест».

   1. Поиск (scan). Двор — газон ближе ZONE м к двери многоэтажки. Город режется на клетки TILE м, в клетке — сетка
      GRID м: занято (дом; дорога с тротуаром, проезд, пешеходка; дорожка; площадка, поле, корт, стоянка, карман, вода,
      лес, парк; стройка, точка конкурента; у двери подъезда — DOOR м; твёрдое; мелочь; лавочка, фонарь; вещь лабиринта
      и двора; дерево — по кроне) или газон. **Пустой кусок** — круг радиусом R м газона, где ничего нет (точное
      расстояние до ближайшего занятого — EDT по сетке). Соседние такие круги — один кусок.
   2. Заполнение (build, поздняя сборка): в каждой клетке — самое глубокое пустое место, по виду места вещь, её место
      занято — и снова, пока пустых нет (не больше CAP вещей на клетку). Вид места:
        • у стены дома — кусты или дерево;
        • большое и далеко от стены — детская площадка (песочница, горка, качели), группа деревьев или сушилка;
        • среднее — деревья (1—4), кусты, сушилка для белья, у проезда — трансформаторная будка (редко).
      Жребий — по месту (каждый запуск то же, город не сдвигается).
   Всё это рисует мелочь газона (lawnprops.js fills) — только рядом с камерой, общими InstancedMesh: деревья и кусты —
   двумя своими (ствол, крона), площадки, сушилки и будки — кубиками газона. Здесь — только места и жребий (памяти —
   записи по ~50 байт). Стволы деревьев и будки — твёрдые для всей игры (SOLIDS: машина, люди, навигатор), кусты,
   площадки и сушилки сбиваются. Всё — в сетку лабиринта (YMAZE.addObj): мелочь газона и сцены дворов их обходят.

     YFILL.build(api)         — LATE-шаг (после кортов и трамплинов, до smashBuild и сугробов)
     YFILL.scan(api?)         — пустые куски сейчас: { pieces, area, sample } (npm run check, yard-empty.js)
     YFILL.cellFills(i, j)    — что ставит мелочь газона в клетке LAWN.CELL (lawnprops.js)
   ?nofill — без заполнения (сравнить, «было»); ?filloff=trees,shrubs,play,dryer,booth — без этих видов.
   ?filldt — сверка быстрых расстояний (markCircleDT, edt) с прежним edt после каждой вещи: ST.dtBad / ST.dhBad — расхождений (0).
   ────────────────────────────────────────────────────────────────────────── */
import { wet } from './streams.js';
import { CLEAN } from './mobile.js';

export const FILL = {
  R: 4.5,                      // пустой кусок — круг такого радиуса (Ø 9 м, ~64 м²)
  GRID: 2,                     // шаг сетки, м
  TILE: 64,                    // клетка обработки, м (кратна GRID)
  ZONE: 50,                    // двор — ближе к двери многоэтажки, м
  DOOR: 7,                     // у двери подъезда — место пина и машины
  CAP: 40,                     // вещей на клетку, не больше
  GAP: 1.2,                    // вещь — не ближе к занятому, м (между вещами проедет машина)
  TREE: { CROWN: 2.6, SHRUB: 1.3, STEP: 3.6, GROUP: 7.5, N: 6, S: [1.15, 1.6], MIX: { birch: 34, maple: 18, lime: 14, poplar: 14, rowan: 20 } },   // крона до CROWN м от ствола
  PLAY: { D: 6.7, R: 5.5, WALL: 8, FAR: 70, SHARE: 0.45 },   // песочница, горка, качели: свободно от середины D м, занимает R м
  DRYER: { D: 5.0, R: 3.8, WALL: [5, 32], SHARE: 0.18 },     // сушилка 6—7 м: у дома (WALL м от стены)
  BOOTH: { R: 1.9, HW: 1.05, HD: 1.45, ROAD: 14, FAR: 230, SHARE: 0.3 },   // будка 2,1 × 2,9 м у проезда, не ближе FAR м к другой
  GARAGE: { ROAD: [4, 22], WALL: 6, SHARE: 0.2 },         // ракушки рядами по 2—5 у проезда (как мелочь газона), дверью к нему
  BEATER: { WALL: [8, 35], SHARE: 0.1 },                   // выбивалка
  SAND: { SHARE: 0.05 },                                   // куча песка
  SHRUB: { WALL: 6, NEAR_WALL: 0.55, OPEN: 0.25 },          // доля кустов (остальное — деревья): у стены / на открытом
  LAWN_CELL: 40,               // клетка мелочи газона (lawnprops.js LAWN.CELL)
};
/* телефон (mobile.js CLEAN, 11бз): дворы проще — заполняем только большие пустые куски (Ø 13 м) и не больше 14 вещей на клетку */
if (CLEAN) { FILL.R = CLEAN.fillR; FILL.CAP = CLEAN.fillCap; }
export const ST = { ms: 0, tiles: 0, before: 0, placed: {}, trees: 0, bushes: 0, fail: 0, capped: 0, near: 0 };

let A = null, OFF = new Set();
const NEAR = new Map();                   // клетка газона → Float32Array по 6 чисел на вещь: вид, x, z, угол, v1, v2 (память: ~24 байта на вещь)
const KINDS = ['tree', 'shrub', 'play', 'dryer', 'booth', 'beater', 'sand', 'garage'], KI = Object.fromEntries(KINDS.map((k, i) => [k, i]));
const PLAYS = [], BOOTHS = [];
const gk = (i, j) => (i + 8192) * 16384 + j + 8192;

/* зерно по месту: одно место — всегда одна и та же вещь */
function hsh (x, z, k) {
  let h = Math.imul(Math.round(x * 4) ^ 0x5bd1e995, 0x9E3779B1) ^ Math.imul(Math.round(z * 4) + k * 1013904223, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function rng (x, z, k) {
  let a = (hsh(x, z, k) * 4294967296) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let q = a; q = Math.imul(q ^ (q >>> 15), q | 1); q ^= q + Math.imul(q ^ (q >>> 7), q | 61); return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
}
function weighted (r, o) {
  let s = 0; for (const k in o) s += o[k];
  let v = r() * s; for (const k in o) if ((v -= o[k]) < 0) return k;
  return Object.keys(o)[0];
}
const inPoly = (x, z, p) => {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
};

/* ── сетки того, что занято (раз на сборку / проверку) ──
   Плоско, числами (память: поздняя сборка на телефоне у порога — без объекта и массива на каждую вещь): отрезки
   SEG [ax, az, bx, bz, полуширина], круги CIR [x, z, r], прямоугольники RCT [x, z, ux, uz, полудлина, полуширина];
   клетки IC м — номера. Многоугольники (дома, площадки, парки, стоянки) — свои коробки, метка «уже в этой клетке» — st */
let IX = null;
const IC = 64;
function resDoor (e) {
  const ix = e[0] - e[2] * 0.6, iz = e[1] - e[3] * 0.6;
  for (const b of A.HOUSE_GRID.get(Math.floor(ix / 40) + ',' + Math.floor(iz / 40)) || []) {
    if (!inPoly(ix, iz, b.p)) continue;
    if ((b.k && b.k !== 'res') || b.st === 'villa' || b.st === 'priv') return false;
    return (b.lvY !== undefined ? b.lvY : b.lv || 1) >= 3;
  }
  return false;
}
function gput (G, x0, z0, x1, z1, v) {
  for (let i = Math.floor(x0 / IC); i <= Math.floor(x1 / IC); i++)
    for (let j = Math.floor(z0 / IC); j <= Math.floor(z1 / IC); j++) {
      const k = gk(i, j);
      const a = G.get(k);
      if (a) a.push(v); else G.set(k, [v]);
    }
}
function addSeg (ax, az, bx, bz, h) { const S = IX.S, n = S.length / 5; S.push(ax, az, bx, bz, h); gput(IX.gs, Math.min(ax, bx) - h, Math.min(az, bz) - h, Math.max(ax, bx) + h, Math.max(az, bz) + h, n); }
function addCir (x, z, r) { const C = IX.C, n = C.length / 3; C.push(x, z, r); gput(IX.gc, x - r, z - r, x + r, z + r, n); }
function addRct (x, z, ux, uz, hl, hw) { const R = IX.R, n = R.length / 6, e = hl + hw; R.push(x, z, ux, uz, hl, hw); gput(IX.gr, x - e, z - e, x + e, z + e, n); }
function addObj (o) {
  if (o.seg) addSeg(o.ax, o.az, o.bx, o.bz, (o.th || 0.2) + 0.3);
  else if (o.pts) for (const p of o.pts) addCir(p[0], p[1], 1.0);
  else addCir(o.x, o.z, (o.r || 0.5) + 0.2);
}
function index () {
  const C = A.CITY;
  IX = { S: [], C: [], R: [], P: [], gs: new Map(), gc: new Map(), gr: new Map(), gp: new Map(), gh: new Map(), E: [], ge: new Map() };
  const box = p => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); } return { p, x0, x1, z0, z1, st: -1 }; };
  // дороги, тротуары, проезды, пешеходки и дорожки — сеткой pave.js (paveEach), твёрдое и мелочь — сетками game.js (solidsIn, smashIn)
  // площадки, поля, вода, лес, парки, стоянки — не двор; дома — своей сеткой
  const area = (G, b) => { if (b.x1 - b.x0 < 4000 && b.z1 - b.z0 < 4000) { IX.P.push(b); gput(G, b.x0, b.z0, b.x1, b.z1, IX.P.length - 1); } };
  for (const l of C.lots || []) if (l.p && l.p.length > 2) area(IX.gp, box(l.p));
  for (const g of C.green || []) if (g.p && g.p.length > 2 && (g.k !== 'green' || (A.isForest && A.isForest(g)))) area(IX.gp, box(g.p));
  for (const p of (A.forests && A.forests()) || []) if (p && p.length > 2) area(IX.gp, box(p));
  const seen = new Set();
  for (const a of A.HOUSE_GRID.values()) for (const b of a) { if (!seen.has(b)) { seen.add(b); area(IX.gh, box(b.p)); } }
  for (const b of A.BENCHES || []) addCir(b.x, b.z, 1.4);
  for (const p of A.PROPS || []) if (p.kind !== 'bench') addCir(p.x, p.z, Math.max(0.6, p.r || 0.6));
  for (const c of A.cans || []) addCir(c.x0, c.z0, 1.6);
  for (const s of A.stops || []) addCir(s.x, s.z, 3);
  for (const c of A.claims() || []) addCir(c.x, c.z, c.r + 2);
  for (const e of C.entrances) {
    addCir(e[0], e[1], FILL.DOOR);
    if (resDoor(e)) { IX.E.push(e[0], e[1]); gput(IX.ge, e[0] - FILL.ZONE, e[1] - FILL.ZONE, e[0] + FILL.ZONE, e[1] + FILL.ZONE, IX.E.length / 2 - 1); }
  }
  for (const p of A.PITCHES || []) addRct(p.cx, p.cz, p.ux, p.uz, (p.L || 0) / 2 + 1.8, (p.W || 0) / 2 + 1.8);
  for (const o of A.mazeObj()) addObj(o);
}
/* номера из сетки G в прямоугольнике (повторы не страшны: метить занятое дважды — то же) */
function each (G, x0, z0, x1, z1, fn) {
  for (let i = Math.floor(x0 / IC); i <= Math.floor(x1 / IC); i++)
    for (let j = Math.floor(z0 / IC); j <= Math.floor(z1 / IC); j++) {
      const a = G.get(gk(i, j));
      if (a) for (let q = 0; q < a.length; q++) fn(a[q]);
    }
}

/* ── клетка обработки: сетка занятого и расстояния ── */
const MG = Math.ceil((Math.max(FILL.R, 8) + 3) / FILL.GRID) * FILL.GRID;      // запас вокруг клетки, м: круги у края считаются целиком (проверка с ?fillr= до 8 м)
const NC = Math.round((FILL.TILE + 2 * MG) / FILL.GRID);
const BLK = new Uint8Array(NC * NC), ZON = new Uint8Array(NC * NC), HOUSE = new Uint8Array(NC * NC);
const D2 = new Float64Array(NC * NC), DH = new Float64Array(NC * NC);
const T = { ox: 0, oz: 0 };
const cx = i => T.ox + (i + 0.5) * FILL.GRID, cz = j => T.oz + (j + 0.5) * FILL.GRID;
function markCircle (M, x, z, r) {
  const g = FILL.GRID, i0 = Math.max(0, Math.floor((x - r - T.ox) / g)), i1 = Math.min(NC - 1, Math.floor((x + r - T.ox) / g));
  const j0 = Math.max(0, Math.floor((z - r - T.oz) / g)), j1 = Math.min(NC - 1, Math.floor((z + r - T.oz) / g)), r2 = r * r;
  for (let j = j0; j <= j1; j++) { const dz = cz(j) - z; for (let i = i0; i <= i1; i++) { const dx = cx(i) - x; if (dx * dx + dz * dz <= r2) M[j * NC + i] = 1; } }
}
function markSeg (M, ax, az, bx, bz, h) {
  const g = FILL.GRID, i0 = Math.max(0, Math.floor((Math.min(ax, bx) - h - T.ox) / g)), i1 = Math.min(NC - 1, Math.floor((Math.max(ax, bx) + h - T.ox) / g));
  const j0 = Math.max(0, Math.floor((Math.min(az, bz) - h - T.oz) / g)), j1 = Math.min(NC - 1, Math.floor((Math.max(az, bz) + h - T.oz) / g));
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9, h2 = h * h;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const px = cx(i) - ax, pz = cz(j) - az, t = Math.max(0, Math.min(1, (px * dx + pz * dz) / l2)), qx = px - dx * t, qz = pz - dz * t;
    if (qx * qx + qz * qz <= h2) M[j * NC + i] = 1;
  }
}
function markRect (M, rx, rz, ux, uz, hl, hw) {      // середина, ось (ux, uz), полудлина и полуширина
  const R = hl + hw, g = FILL.GRID;
  const i0 = Math.max(0, Math.floor((rx - R - T.ox) / g)), i1 = Math.min(NC - 1, Math.floor((rx + R - T.ox) / g));
  const j0 = Math.max(0, Math.floor((rz - R - T.oz) / g)), j1 = Math.min(NC - 1, Math.floor((rz + R - T.oz) / g));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const dx = cx(i) - rx, dz = cz(j) - rz, u = dx * ux + dz * uz, v = -dx * uz + dz * ux;
    if (Math.abs(u) <= hl && Math.abs(v) <= hw) M[j * NC + i] = 1;
  }
}
/* многоугольник — строками (23.10.2026, было: inPoly на каждую клетку рамки — лес и парк в сотни вершин, ~1/4 всего куска):
   в строке — где рёбра пересекают её (та же формула, что в inPoly, до бита), клетка внутри, если правее неё нечётно пересечений */
let XS = new Float64Array(256);
function markPoly (M, b) {
  const g = FILL.GRID, i0 = Math.max(0, Math.floor((b.x0 - T.ox) / g)), i1 = Math.min(NC - 1, Math.floor((b.x1 - T.ox) / g));
  const j0 = Math.max(0, Math.floor((b.z0 - T.oz) / g)), j1 = Math.min(NC - 1, Math.floor((b.z1 - T.oz) / g));
  if (i0 > i1 || j0 > j1) return;
  const p = b.p, n = p.length;
  if (XS.length < n) XS = new Float64Array(n * 2);
  for (let j = j0; j <= j1; j++) {
    const z = cz(j);
    let m = 0;
    for (let q = 0, w = n - 1; q < n; w = q++) {
      const a = p[q], c = p[w];
      if ((a[1] > z) !== (c[1] > z)) XS[m++] = (c[0] - a[0]) * (z - a[1]) / (c[1] - a[1]) + a[0];
    }
    if (!m) continue;
    const xs = XS.subarray(0, m);
    xs.sort();
    let t = 0;                                      // сколько пересечений не правее клетки
    for (let i = i0, k = j * NC + i0; i <= i1; i++, k++) {
      const x = cx(i);
      while (t < m && xs[t] <= x) t++;
      if ((m - t) & 1) M[k] = 1;
    }
  }
}
/* расстояние до ближайшего занятого, в клетках² (Felzenszwalb: точно, за два прохода) */
const F1 = new Float64Array(NC), D1 = new Float64Array(NC), V1 = new Int32Array(NC), Z1 = new Float64Array(NC + 1);
function dt1 (n) {
  let k = 0; V1[0] = 0; Z1[0] = -1e20; Z1[1] = 1e20;
  for (let q = 1; q < n; q++) {
    let s = ((F1[q] + q * q) - (F1[V1[k]] + V1[k] * V1[k])) / (2 * q - 2 * V1[k]);
    while (s <= Z1[k]) { k--; s = ((F1[q] + q * q) - (F1[V1[k]] + V1[k] * V1[k])) / (2 * q - 2 * V1[k]); }
    k++; V1[k] = q; Z1[k] = s; Z1[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (Z1[k + 1] < q) k++; D1[q] = (q - V1[k]) * (q - V1[k]) + F1[V1[k]]; }
}
function edt (M, out) {
  const BIG = 1e9;
  // столбцы: занятое 0/1 — до ближайшего занятого в столбце двумя проходами (то же, что dt1 с 0 / BIG, до бита: BIG, если в
  // столбце пусто), строки — dt1
  for (let i = 0; i < NC; i++) {
    let last = -1;
    for (let j = 0, k = i; j < NC; j++, k += NC) {
      if (M[k]) last = j;
      out[k] = last < 0 ? -1 : j - last;
    }
    if (last < 0) { for (let k = i; k < NC * NC; k += NC) out[k] = BIG; continue; }
    last = -1;
    for (let j = NC - 1, k = i + (NC - 1) * NC; j >= 0; j--, k -= NC) {
      if (M[k]) last = j;
      const a = out[k], b = last < 0 ? -1 : last - j, d = a < 0 ? b : b < 0 ? a : a < b ? a : b;
      out[k] = d * d;
    }
  }
  for (let j = 0; j < NC; j++) {
    for (let i = 0; i < NC; i++) F1[i] = out[j * NC + i];
    dt1(NC);
    for (let i = 0; i < NC; i++) out[j * NC + i] = D1[i];
  }
}
/* занят ещё круг (markCircle с теми же x, z, r) — расстояния без пересчёта всей клетки (23.10.2026; было: edt заново после
   каждой вещи, ~1/3 куска). Новое расстояние — меньшее из старого и до ближайшей клетки круга; круг — строками [j, от i, до i].
   Числа те же до бита (целые клетки²), что и у edt заново */
const CIRW = new Int32Array(NC * 3);
let DBG_DT = false; const DBG_A = new Float64Array(NC * NC);   // ?filldt — сверка с edt заново после каждой вещи (ST.dtBad — расхождений)
function markCircleDT (x, z, r) {
  markCircle(BLK, x, z, r);
  const g = FILL.GRID, i0 = Math.max(0, Math.floor((x - r - T.ox) / g)), i1 = Math.min(NC - 1, Math.floor((x + r - T.ox) / g));
  const j0 = Math.max(0, Math.floor((z - r - T.oz) / g)), j1 = Math.min(NC - 1, Math.floor((z + r - T.oz) / g)), r2 = r * r;
  let nr = 0, iA = NC, iB = -1, jA = NC, jB = -1;
  for (let j = j0; j <= j1; j++) {
    const dz = cz(j) - z;
    let lo = -1, hi = -1;
    for (let i = i0; i <= i1; i++) { const dx = cx(i) - x; if (dx * dx + dz * dz <= r2) { if (lo < 0) lo = i; hi = i; } }
    if (lo < 0) continue;
    CIRW[nr * 3] = j; CIRW[nr * 3 + 1] = lo; CIRW[nr * 3 + 2] = hi; nr++;
    if (lo < iA) iA = lo; if (hi > iB) iB = hi; if (j < jA) jA = j; if (j > jB) jB = j;
  }
  if (!nr) return;
  for (let j = 0; j < NC; j++) {
    const dJ = j < jA ? jA - j : j > jB ? j - jB : 0, dJ2 = dJ * dJ;
    for (let i = 0, k = j * NC; i < NC; i++, k++) {
      const dI = i < iA ? iA - i : i > iB ? i - iB : 0;
      if (dI * dI + dJ2 >= D2[k]) continue;        // до рамки круга не ближе, чем уже есть
      let best = D2[k];
      for (let q = 0; q < nr * 3; q += 3) {
        const dj = j - CIRW[q], di = i < CIRW[q + 1] ? CIRW[q + 1] - i : i > CIRW[q + 2] ? i - CIRW[q + 2] : 0, d = di * di + dj * dj;
        if (d < best) best = d;
      }
      D2[k] = best;
    }
  }
}
/* прежний edt (Felzenszwalb по столбцам и строкам) — только для сверки ?filldt */
function edtOld (M, out) { const BIG = 1e9; for (let i = 0; i < NC; i++) { for (let j = 0; j < NC; j++) F1[j] = M[j * NC + i] ? 0 : BIG; dt1(NC); for (let j = 0; j < NC; j++) out[j * NC + i] = D1[j]; } for (let j = 0; j < NC; j++) { for (let i = 0; i < NC; i++) F1[i] = out[j * NC + i]; dt1(NC); for (let i = 0; i < NC; i++) out[j * NC + i] = D1[i]; } }
/* свободный газон до края, м (у края сетки — до занятого внутри неё) */
const clear = (k, A2 = D2) => Math.sqrt(A2[k]) * FILL.GRID - FILL.GRID / 2;

/* сетка клетки (tx, tz): что занято, где двор */
let TILE_N = 0;
const RES_T = [];
function raster (tx, tz) {
  const g = FILL.GRID, x0 = tx * FILL.TILE, z0 = tz * FILL.TILE;
  T.ox = x0 - MG; T.oz = z0 - MG;
  const X0 = T.ox, Z0 = T.oz, X1 = T.ox + NC * g, Z1 = T.oz + NC * g;
  BLK.fill(0); ZON.fill(0); HOUSE.fill(0);
  // двор: ближе ZONE к двери многоэтажки
  RES_T.length = 0;
  each(IX.ge, X0, Z0, X1, Z1, n => { if (!RES_T.includes(n)) RES_T.push(n); });
  if (!RES_T.length) return false;
  const Z2 = FILL.ZONE * FILL.ZONE, E = IX.E;
  let any = 0;
  for (let j = 0; j < NC; j++) for (let i = 0; i < NC; i++) {
    const x = cx(i), z = cz(j);
    for (let q = 0; q < RES_T.length; q++) { const dx = E[RES_T[q] * 2] - x, dz = E[RES_T[q] * 2 + 1] - z; if (dx * dx + dz * dz < Z2) { ZON[j * NC + i] = 1; any = 1; break; } }
  }
  if (!any) return false;
  const stamp = ++TILE_N, P = IX.P, S = IX.S, C = IX.C, R = IX.R;
  each(IX.gh, X0, Z0, X1, Z1, n => { const b = P[n]; if (b.st !== stamp) { b.st = stamp; markPoly(HOUSE, b); } });
  BLK.set(HOUSE);
  each(IX.gp, X0, Z0, X1, Z1, n => { const b = P[n]; if (b.st !== stamp) { b.st = stamp; markPoly(BLK, b); } });
  A.paveEach(X0, Z0, X1, Z1, (ax, az, bx, bz, h) => markSeg(BLK, ax, az, bx, bz, h));
  each(IX.gs, X0, Z0, X1, Z1, n => markSeg(BLK, S[n * 5], S[n * 5 + 1], S[n * 5 + 2], S[n * 5 + 3], S[n * 5 + 4]));
  each(IX.gr, X0, Z0, X1, Z1, n => markRect(BLK, R[n * 6], R[n * 6 + 1], R[n * 6 + 2], R[n * 6 + 3], R[n * 6 + 4], R[n * 6 + 5]));
  each(IX.gc, X0, Z0, X1, Z1, n => markCircle(BLK, C[n * 3], C[n * 3 + 1], C[n * 3 + 2]));
  // твёрдое: дерево — по кроне, остальное — коробкой с запасом 0,3 м; мелочь — кругом
  const CR = FILL.TREE.CROWN, SR = FILL.TREE.SHRUB;
  A.solidsIn(X0 - CR, Z0 - CR, X1 + CR, Z1 + CR, q => {
    if (q.edGone) return;
    if (q.tree) markCircle(BLK, q.cx, q.cz, q.shrub ? SR : CR);
    else markRect(BLK, q.cx, q.cz, q.cs, q.sn, q.hw + 0.3, q.hd + 0.3);
  });
  A.smashIn(X0 - 3, Z0 - 3, X1 + 3, Z1 + 3, it => markCircle(BLK, it.x, it.z, Math.max(0.6, it.r || 0.6) + 0.2));
  // остальное — вопросом на клетку (только где ещё газон)
  for (let j = 0; j < NC; j++) for (let i = 0; i < NC; i++) {
    const k = j * NC + i;
    if (BLK[k]) continue;
    const x = cx(i), z = cz(j);
    if (!A.inBounds(x, z, -20) || wet(x, z, 0.3) || A.busy(x, z, 0.3)) BLK[k] = 1;
  }
  return true;
}
/* пустые места клетки сейчас: [k, свободно м] (ядро клетки, во дворе) */
function empties (out) {
  out.length = 0;
  const c0 = MG / FILL.GRID, c1 = NC - c0;
  for (let j = c0; j < c1; j++) for (let i = c0; i < c1; i++) {
    const k = j * NC + i;
    if (!ZON[k] || BLK[k]) continue;
    const d = clear(k);
    if (d >= FILL.R) out.push(k, d);
  }
  return out;
}

/* ── проверка: сколько пустых кусков (npm run check) ── */
export function scan (api, opts = {}) {
  if (api) A = api;
  if (!A) return null;
  const t0 = performance.now(), R0 = FILL.R;
  if (opts.R) FILL.R = opts.R;
  index();
  const tiles = tileList(), E = [], cells = new Set();
  for (const [tx, tz] of tiles) {
    if (!raster(tx, tz)) continue;
    edt(BLK, D2);
    empties(E);
    for (let q = 0; q < E.length; q += 2) {
      const k = E[q], i = k % NC, j = (k / NC) | 0;
      cells.add(gk(Math.floor(cx(i) / FILL.GRID), Math.floor(cz(j) / FILL.GRID)));
    }
  }
  // куски: соседние (8 сторон) пустые места — один кусок
  const left = new Set(cells), pieces = [];
  for (const k0 of cells) {
    if (!left.has(k0)) continue;
    left.delete(k0);
    const st = [k0], P = { n: 0, x: 0, z: 0 };
    while (st.length) {
      const k = st.pop(), i = Math.floor(k / 16384) - 8192, j = (k % 16384) - 8192;
      P.n++; P.x += (i + 0.5) * FILL.GRID; P.z += (j + 0.5) * FILL.GRID;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const q = gk(i + di, j + dj);
        if (left.has(q)) { left.delete(q); st.push(q); }
      }
    }
    pieces.push({ x: Math.round(P.x / P.n), z: Math.round(P.z / P.n), m2: P.n * FILL.GRID * FILL.GRID });
  }
  pieces.sort((a, b) => b.m2 - a.m2);
  if (!opts.keep) IX = null;
  FILL.R = R0;
  return { pieces: pieces.length, centers: cells.size, m2: cells.size * FILL.GRID * FILL.GRID, tiles: tiles.length, ms: Math.round(performance.now() - t0),
    list: opts.all ? pieces : pieces.slice(0, opts.n || 12) };
}
function tileList () {
  const S = new Set(), out = [], E = IX.E, r = FILL.ZONE;
  for (let q = 0; q < E.length; q += 2) {
    for (let tx = Math.floor((E[q] - r) / FILL.TILE); tx <= Math.floor((E[q] + r) / FILL.TILE); tx++)
      for (let tz = Math.floor((E[q + 1] - r) / FILL.TILE); tz <= Math.floor((E[q + 1] + r) / FILL.TILE); tz++) {
        const k = gk(tx, tz);
        if (!S.has(k)) { S.add(k); out.push([tx, tz]); }
      }
  }
  out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);   // порядок — всегда тот же (заполнение клетки видит соседние)
  return out;
}

/* ── заполнение ── */
function near (list, x, z, r) { for (const p of list) if (Math.abs(p[0] - x) < r && Math.abs(p[1] - z) < r && Math.hypot(p[0] - x, p[1] - z) < r) return true; return false; }
const TT = () => Object.keys(FILL.TREE.MIX);
function toLawn (f) {
  const k = gk(Math.floor(f.x / FILL.LAWN_CELL), Math.floor(f.z / FILL.LAWN_CELL));
  let a = NEAR.get(k);
  if (!a) NEAR.set(k, a = []);
  a.push(KI[f.k], f.x, f.z, f.a || 0, f.k === 'garage' ? f.n : f.s || 0, f.k === 'tree' ? TT().indexOf(f.t) : f.c || 0);
  ST.near++;
}
const count = k => { ST.placed[k] = (ST.placed[k] || 0) + 1; };
/* своя вещь: в сетку лабиринта (мелочь газона, сцены дворов) и в свою сетку занятого — следующие клетки её видят */
function own (o) { A.mazeAdd(o); addObj(o); }
/* твёрдое: в SOLIDS и сразу в сетку стен (без пересборки всей сетки — мусор на поздней сборке) */
function solid (x, z, hw, hd, a) { return A.addSolid(x, z, hw, hd, a); }
/* куда «смотрит» место: от ближайшей дороги (дверь будки — к ней) */
function faceRoad (x, z) {
  const nr = A.nearestRoad(x, z, 7, 2);
  if (!nr) return hsh(x, z, 5) * 6.283;
  return Math.atan2(nr.z - z, nr.x - x);
}

/* деревья группой: стволы — твёрдые для всей игры (SOLIDS, как у деревьев города), сами деревья — у камеры (lawnprops.js) */
function plantTrees (x, z, D, r) {
  const T0 = FILL.TREE, room = D - FILL.GAP - T0.CROWN;   // как далеко от середины может стоять ствол
  // группа: чем больше места, тем больше деревьев (рощица до T0.N), между стволами — T0.STEP
  const Rg = Math.min(room, T0.GROUP), want = Rg < T0.STEP ? 1 : Math.max(2, Math.min(T0.N, Math.round(Math.PI * Rg * Rg / (T0.STEP * T0.STEP * 1.6))));
  const kind = weighted(r, T0.MIX), pts = [];
  for (let q = 0; q < want * 6 && pts.length < want; q++) {
    const a = r() * 6.283, d = q ? Math.sqrt(r()) * Rg : 0, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (pts.some(p => Math.hypot(p[0] - px, p[1] - pz) < T0.STEP)) continue;
    if (A.onPave(px, pz, 1.0) || A.ycBlocks(px, pz, 1)) continue;
    pts.push([px, pz]);
  }
  let far = -1;
  for (const [px, pz] of pts) {
    const k = r() < 0.75 ? kind : weighted(r, T0.MIX);
    const so = A.addSolid(px, pz, 0.4, 0.4, 0);
    so.tree = 1; so.yf = 1;                         // удар звучит деревом (impact.js)
    toLawn({ k: 'tree', x: px, z: pz, t: k, s: T0.S[0] + r() * (T0.S[1] - T0.S[0]), a: r() * 6.283 });
    far = Math.max(far, Math.hypot(px - x, pz - z));
    ST.trees++;
  }
  if (far < 0) return 0;
  own({ x, z, r: far + T0.CROWN, solid: 0, kind: 'ftrees' });   // мелочь газона и сцены дворов — не под кроной
  return far + T0.CROWN + 0.2;
}
/* кусты кучкой — у камеры, сбиваются, как кусты дворов */
function plantShrubs (x, z, D, r) {
  const n = 3 + Math.floor(r() * 4), pts = [], R0 = Math.max(0.9, Math.min(1.9, D - FILL.GAP - 0.9));
  for (let k = 0; k < n * 4 && pts.length < n; k++) {
    const a = r() * 6.283, d = k ? 0.9 + r() * (R0 - 0.9) : 0, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (pts.some(p => Math.hypot(p[0] - px, p[1] - pz) < 1.1) || A.onPave(px, pz, 0.8)) continue;
    pts.push([px, pz]);
  }
  if (!pts.length) return 0;
  let far = 0;
  for (const [px, pz] of pts) { toLawn({ k: 'shrub', x: px, z: pz, s: 0.85 + r() * 0.4, c: Math.floor(r() * 3), a: r() * 6.283 }); far = Math.max(far, Math.hypot(px - x, pz - z)); }
  ST.bushes += pts.length;
  own({ x, z, r: far + 1.0, solid: 0, kind: 'fshrubs' });
  return far + 1.2;
}
/* площадка, сушилка, будка — у камеры (lawnprops.js): здесь только место и жребий */
function nearThing (k, x, z, a, R) {
  toLawn({ k, x, z, a });
  own({ x, z, r: R, solid: 0, kind: 'f' + k });
  return R + 0.2;
}
/* трансформаторная будка: стены — твёрдые для всей игры (SOLIDS), дверью к дороге */
function booth (x, z, a) {
  const B = FILL.BOOTH, s = solid(x, z, B.HW + 0.05, B.HD + 0.05, a);
  s.mat = 'wall'; s.yf = 1;
  return nearThing('booth', x, z, a, B.R);
}

/* ракушки рядом, дверью к проезду: сколько влезает в круг D */
function garageN (D) { const q = (D - FILL.GAP - 0.3) ** 2 - 2.7 * 2.7; return q > 0 ? Math.min(5, Math.floor(2 * Math.sqrt(q) / 3.3)) : 0; }
function choose (x, z, D, wall, road) {
  const h = hsh(x, z, 11), F = FILL;
  if (!OFF.has('play') && D >= F.PLAY.D && wall >= F.PLAY.WALL && h < F.PLAY.SHARE && !near(PLAYS, x, z, F.PLAY.FAR)) return 'play';
  const h2 = hsh(x, z, 12);
  if (!OFF.has('booth') && road <= F.BOOTH.ROAD && wall >= 3 && h2 < F.BOOTH.SHARE && !near(BOOTHS, x, z, F.BOOTH.FAR)) return 'booth';
  if (!OFF.has('garage') && road >= F.GARAGE.ROAD[0] && road <= F.GARAGE.ROAD[1] && wall >= F.GARAGE.WALL && garageN(D) >= 2 && h2 > 0.5 && h2 < 0.5 + F.GARAGE.SHARE) return 'garage';
  if (!OFF.has('dryer') && D >= F.DRYER.D && wall >= F.DRYER.WALL[0] && wall <= F.DRYER.WALL[1] && h2 > 1 - F.DRYER.SHARE) return 'dryer';
  const h4 = hsh(x, z, 16);
  if (!OFF.has('beater') && wall >= F.BEATER.WALL[0] && wall <= F.BEATER.WALL[1] && h4 < F.BEATER.SHARE) return 'beater';
  if (!OFF.has('sand') && wall >= 6 && h4 > 1 - F.SAND.SHARE) return 'sand';
  const h3 = hsh(x, z, 13);
  let shrub = wall < F.SHRUB.WALL ? h3 < F.SHRUB.NEAR_WALL : h3 < F.SHRUB.OPEN;
  if (shrub ? OFF.has('shrubs') : OFF.has('trees')) shrub = !shrub;
  if (OFF.has('shrubs') && OFF.has('trees')) return null;
  return shrub ? 'shrubs' : 'trees';
}
function place (k, x, z, D, r) {
  const F = FILL;
  if (k === 'play') { PLAYS.push([x, z]); count(k); return nearThing('play', x, z, faceRoad(x, z) + Math.PI / 2, F.PLAY.R); }
  if (k === 'booth') { BOOTHS.push([x, z]); count(k); return booth(x, z, faceRoad(x, z)); }
  if (k === 'dryer') { count(k); return nearThing('dryer', x, z, hsh(x, z, 15) * Math.PI, F.DRYER.R); }
  if (k === 'beater') { count(k); return nearThing('beater', x, z, hsh(x, z, 15) * Math.PI, 1.8); }
  if (k === 'sand') { count(k); return nearThing('sand', x, z, hsh(x, z, 15) * 6.283, 1.7); }
  if (k === 'garage') {
    const n = garageN(D), a = faceRoad(x, z);
    toLawn({ k: 'garage', x, z, a, n });
    const R = Math.hypot(n * 3.3 / 2, 2.7) + 0.3;
    own({ x, z, r: R, solid: 0, kind: 'fgarage' });
    count(k); ST.garages = (ST.garages || 0) + n;
    return R + 0.2;
  }
  const R = k === 'trees' ? plantTrees(x, z, D, r) : plantShrubs(x, z, D, r);
  if (R) count(k);
  return R;
}

export function* build (api) {
  const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  A = api;
  if (QS && QS.has('nofill')) return ST;
  OFF = new Set(((QS && QS.get('filloff')) || '').split(','));
  DBG_DT = !!(QS && QS.has('filldt'));
  const t0 = performance.now();
  index();
  // площадки из карты — тоже площадки: новую не ставим ближе PLAY.FAR
  for (const g of A.CITY.green || []) if (g.k === 'play' && g.p && g.p.length) { let x = 0, z = 0; for (const q of g.p) { x += q[0] / g.p.length; z += q[1] / g.p.length; } PLAYS.push([x, z]); }
  const tiles = tileList(), E = [];
  zoneCells();
  yield 'сетки';
  let n = 0;
  for (const [tx, tz] of tiles) {
    if (++n % 3 === 0) yield 'дворы';
    if (!raster(tx, tz)) continue;
    ST.tiles++;
    edt(HOUSE, DH);
    if (DBG_DT) { DBG_A.set(DH); edtOld(HOUSE, DH); for (let k = 0; k < DH.length; k++) if (DBG_A[k] !== DH[k]) { ST.dhBad = (ST.dhBad || 0) + 1; break; } }
    let placed = 0;
    edt(BLK, D2);                                   // дальше — без пересчёта: markCircleDT
    for (;;) {
      if (DBG_DT) { DBG_A.set(D2); edtOld(BLK, D2); for (let k = 0; k < D2.length; k++) if (DBG_A[k] !== D2[k]) { ST.dtBad = (ST.dtBad || 0) + 1; break; } ST.dtChk = (ST.dtChk || 0) + 1; }
      empties(E);
      if (!E.length) break;
      if (placed >= FILL.CAP) { ST.capped++; break; }
      if (!placed) ST.before += E.length / 2;
      // самое глубокое пустое место (при равных — первое по сетке: всегда то же)
      let bq = 0;
      for (let q = 2; q < E.length; q += 2) if (E[q + 1] > E[bq + 1] + 1e-6) bq = q;
      const k = E[bq], D = E[bq + 1], i = k % NC, j = (k / NC) | 0, x = cx(i), z = cz(j);
      const nr = A.nearestRoad(x, z, 7, 1), wall = clear(k, DH), road = nr ? Math.max(0, nr.d - nr.seg.w / 2) : 99;
      const kind = choose(x, z, D, wall, road), r = rng(x, z, 17);
      const R = kind ? place(kind, x, z, D, r) : 0;
      if (R) { markCircleDT(x, z, R); placed++; }
      else { markCircleDT(x, z, FILL.R); ST.fail++; }
    }
  }
  for (const [k, a] of NEAR) NEAR.set(k, Float32Array.from(a));
  IX = null;
  ST.ms = Math.round(performance.now() - t0);
  return ST;
}

export function cellFills (i, j) {
  const a = NEAR.get(gk(i, j));
  if (!a) return null;
  const out = [], tt = TT();
  for (let q = 0; q < a.length; q += 6) {
    const k = KINDS[a[q]], f = { k, x: a[q + 1], z: a[q + 2], a: a[q + 3] };
    if (k === 'garage') f.n = a[q + 4]; else f.s = a[q + 4];
    if (k === 'tree') f.t = tt[a[q + 5]]; else f.c = a[q + 5];
    out.push(f);
  }
  return out;
}
/* во дворе, который заполняет этот модуль (клетка 16 м целиком ближе ZONE к двери многоэтажки): крупное мелочи газона здесь
   ставит yardfill (ракушки, сушилки, выбивалки, песок), а не lawnprops — иначе они легли бы на наши деревья */
const ZC = 16, ZSET = new Set();
export function inZone (x, z) { return ZSET.has(gk(Math.floor(x / ZC), Math.floor(z / ZC))); }
function zoneCells () {
  const R = FILL.ZONE - ZC * 0.71, E = IX.E;
  for (let q = 0; q < E.length; q += 2)
    for (let i = Math.floor((E[q] - R) / ZC); i <= Math.floor((E[q] + R) / ZC); i++)
      for (let j = Math.floor((E[q + 1] - R) / ZC); j <= Math.floor((E[q + 1] + R) / ZC); j++)
        if (Math.hypot((i + 0.5) * ZC - E[q], (j + 0.5) * ZC - E[q + 1]) < R) ZSET.add(gk(i, j));
}

/* ── ракушки для навигатора (0п50, 24.10.2026) ──
   Ракушки рисует и делает твёрдыми lawnprops.js — только у камеры, их нет в SOLID_GRID, а в лабиринте они мягкие (solid: 0).
   Навигатор (routeyard.js) вёл линию прямо сквозь ряд ракушек (Ленинградская, 2957,2377): машина упиралась в гараж.
   Здесь — те же коробки, что у lawnprops.js (по 3,3 м в ряд, 1,5 × 2,7 от середины), по всему городу. */
const G_HW = 1.5, G_HD = 2.7, G_STEP = 3.3;
/** ракушки в прямоугольнике: fn(cx, cz, cs, sn, hw, hd) — как obb (cs, sn — ось ширины) */
export function garagesEach (x0, z0, x1, z1, fn) {
  const C = FILL.LAWN_CELL, g = KI.garage;
  for (let i = Math.floor((x0 - 10) / C); i <= Math.floor((x1 + 10) / C); i++)
    for (let j = Math.floor((z0 - 10) / C); j <= Math.floor((z1 + 10) / C); j++) {
      const a = NEAR.get(gk(i, j));
      if (!a) continue;
      for (let q = 0; q < a.length; q += 6) {
        if (a[q] !== g) continue;
        const x = a[q + 1], z = a[q + 2], ang = a[q + 3], n = a[q + 4], tx = Math.sin(ang), tz = -Math.cos(ang);
        if (x < x0 - 10 || x > x1 + 10 || z < z0 - 10 || z > z1 + 10) continue;
        for (let k = 0; k < n; k++) { const o = (k - (n - 1) / 2) * G_STEP; fn(x + tx * o, z + tz * o, tx, tz, G_HW, G_HD); }
      }
    }
}
/** отрезок задевает ракушку (запас m; концы по 1 м не в счёт — как yardmaze.js segHits) */
export function segGarage (ax, az, bx, bz, m = 0.3) {
  const L = Math.hypot(bx - ax, bz - az);
  if (L < 2.5) return false;
  let hit = false;
  garagesEach(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), (cx, cz, cs, sn, hw, hd) => {
    if (hit) return;
    for (let f = 1; f <= L - 1; f += 0.5) {
      const x = ax + (bx - ax) * f / L, z = az + (bz - az) * f / L, dx = x - cx, dz = z - cz;
      if (Math.abs(dx * cs + dz * sn) < hw + m && Math.abs(-dx * sn + dz * cs) < hd + m) { hit = true; return; }
    }
  });
  return hit;
}

export const DEBUG = { FILL, ST, NEAR, PLAYS, BOOTHS, scan: opts => scan(null, opts), garagesEach, segGarage };
