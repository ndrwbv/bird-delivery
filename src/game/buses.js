/* ──────────────────────────────────────────────────────────────────────────
   Автобусы (Л1, 09.10.2026): советские ЛиАЗ и ПАЗ ходят по маршрутам по главным
   улицам, встают на остановках (CITY.stops — те же будки, что строит game.js),
   люди выходят и заходят; иногда кто-то бежит к остановке и машет рукой — успел
   или двери закрылись перед носом. Правила словами — docs/CAREER.md «Автобусы».

   Как устроено:
   • Маршруты строятся в поздней сборке (LATE 'buses', по шагам) и заново, когда открылся район: граф —
     рёбра улиц классов 1—5 (как у потока, без дворов) в открытых районах, путь — по рёбрам, без
     разворотов посреди улицы (только в тупике и у закрытого района), главные улицы дешевле. Маршрут —
     цепочка остановок от ближней к пиццерии: каждый раз ближайшая по дороге ещё не охваченная, пока
     путь не длиннее LOOP_M, и назад к первой; его остановки — все будки по правую руку на пути.
   • Автобус — машина потока (TRAFFIC, все поля — carObj в game.js, своё — в поле
     bus, заведённом сразу при рождении): светофоры, пропуск, очередь, пешеходы —
     как у всех. Свой здесь только выбор поворота (nextEdge — по маршруту, сбился —
     объезд к ближайшему ребру маршрута), стоянка на остановке (drive) и удар (hit):
     автобус не сдвинуть, он как стена, которая едет.
   • Автобусов N_DAY днём и N_NIGHT ночью; живут только рядом с курьером: дальше
     HIDE м — переезжают на свой или другой маршрут в кольце PLACE м вне кадра;
     маршрута рядом нет — «спят» (не в TRAFFIC, не рисуются, не считаются).
   • Люди на остановках — только на ближних к курьеру (WAIT_R м), не больше
     WAIT_MAX; вне кадра не рисуются.
   Переменных game.js модуль не видит — всё нужное приходит в api (busApi).
   ────────────────────────────────────────────────────────────────────────── */
import { t as $t } from '../i18n/index.js';
import { makePerson } from './people.js';

/* числа автобусов — здесь (docs/CAREER.md «Автобусы») */
export const BUS = {
  N_DAY: 6, N_NIGHT: 4,          // сколько автобусов возле курьера днём / ночью (часы потока, econ.js TRAFFIC.NIGHT)
  ROUTES: 7,                     // маршрутов на город (не больше 7: строки таблички в атласе)
  ROUTE_M: [800, 14000],         // длина маршрута по кругу, м (короче и длиннее — не берём)
  PER_M: 1300,                   // не больше одного автобуса на столько метров маршрута
  LOOP_M: 3500,                  // набираем остановки в маршрут, пока путь по ним не длиннее, м
  CRUISE: [8.5, 11],             // крейсерская, м/с (31—40 км/ч)
  ACC: 0.7,                      // разгон мягче, чем у легковых: цель скорости — не выше нынешней + ACC м/с
  DWELL: [4, 8],                 // стоит на остановке, с (плюс пока выходят и заходят)
  DOOR_T: 0.7,                   // двери открываются / закрываются, с
  ALIGHT: [0.25, 0.35, 0.25, 0.15],   // сколько выходит: 0 / 1 / 2 / 3 — доли
  WAIT: [0.2, 0.35, 0.3, 0.15],       // сколько ждёт на остановке: 0 / 1 / 2 / 3 — доли
  WAIT_R: 110, WAIT_DROP: 170,   // люди на остановке появляются ближе WAIT_R м к курьеру, уходят дальше WAIT_DROP
  WAIT_MAX: 6,                   // ждущих на всех остановках разом (человек — 8 отрисовок вблизи)
  RUN_P: 0.35,                   // на остановке рядом с курьером (RUN_R м) кто-то бежит к автобусу
  RUN_R: 110,
  RUN_OK: 0.55,                  // …и успевает (иначе двери закрываются перед носом)
  RUN_V: 4.3,                    // бежит, м/с
  HIDE: 470,                     // дальше — переезжает (поток перерождает с 520)
  PLACE: [150, 380],             // где появляется: кольцо вокруг курьера, вне кадра
  SOLID: { BOUNCE: 0.15, HURT: 5 },   // удар: отскок от борта (доля скорости сближения), с какой скорости мнёт и бьёт сердца (м/с)
};

/* модели: длина, ширина, высота, оси, двери (центр и ширина по длине), цвета */
const MODELS = [
  { id: 'liaz', L: 10.5, W: 2.5, H: 2.95, axles: [2.55, -2.75], doors: [[3.95, 1.2], [-1.25, 1.2]], body: '#f2c64a', top: '#f3efe2', stripe: '#d9542b' },
  { id: 'liaz', L: 10.5, W: 2.5, H: 2.95, axles: [2.55, -2.75], doors: [[3.95, 1.2], [-1.25, 1.2]], body: '#ee8a2e', top: '#f1ece0', stripe: '#b8402a' },
  { id: 'paz', L: 7.2, W: 2.4, H: 2.85, axles: [1.75, -1.85], doors: [[2.75, 0.95], [-2.95, 0.95]], body: '#e9762a', top: '#f4f1e6', stripe: '#f4f1e6' },
  { id: 'paz', L: 7.2, W: 2.4, H: 2.85, axles: [1.75, -1.85], doors: [[2.75, 0.95], [-2.95, 0.95]], body: '#f0cf4e', top: '#f4f1e6', stripe: '#c9542c' },
];
const ROUTE_NO = ['2', '5', '8', '11', '12', '16', '19', '23', '27'];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const chance = p => Math.random() < p;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const share = w => { let r = Math.random(); for (let i = 0; i < w.length; i++) if ((r -= w[i]) <= 0) return i; return w.length - 1; };

let A = null, THREE = null, READY = false, CLOCK = 0;
const ROUTES = [], STOPS = [], BUSES = [], PEOPLE = [];
const ST = { routes: 0, stops: 0, graph: 0, ms: 0, relocate: 0, sleep: 0, detours: 0, dwells: 0, skips: 0, builds: 0, locked: -1, why: null, runners: 0, runOk: 0, runLate: 0, alight: 0, board: 0, hits: 0, waiting: 0 };
let BODY_MAT = null, GLOW_MAT = null, WIN_MAT = null, BLINK_MAT = null;
const WIN_DAY = { r: 0, g: 0, b: 0 }, WIN_NIGHT = { r: 0, g: 0, b: 0 };

/* ═════════════ граф рёбер и путь ═════════════ */
let EL = [], EIDX = new Map(), SUCC = [], BACK = [], DIST = null, PREV = null, HEAP_D = [], HEAP_I = [];
function graph () {
  EL = []; EIDX = new Map();
  const N = A.NODES;
  for (const e of A.EDGES.values()) {
    if (!e.ok || e.c > 5 || N[e.a].out || N[e.b].out || !A.flowOk(e)) continue;
    EIDX.set(e, EL.length); EL.push(e);
  }
  SUCC = EL.map(e => succOf(e));
  BACK = EL.map(e => { const bk = A.edgeOf(e.b, e.a), j = bk && EIDX.get(bk); return j === undefined ? -1 : j; });
  DIST = new Float64Array(EL.length); PREV = new Int32Array(EL.length);
  ST.graph = EL.length;
}
function succOf (e) {
  const out = [];
  for (const c of A.NODES[e.b].nb) {
    if (c === e.a) continue;
    const n = A.edgeOf(e.b, c), j = n && EIDX.get(n);
    if (j !== undefined) out.push(j);
  }
  if (!out.length) { const bk = A.edgeOf(e.b, e.a), j = bk && EIDX.get(bk); if (j !== undefined) out.push(j); }   // тупик — разворот
  return out;
}
/* цена шага с e на n: главные улицы дешевле, поворот — штраф, разворот — большой */
function cost (e, n) {
  const k = n.c <= 2 ? 1 : n.c === 3 ? 1.3 : n.c === 4 ? 2.4 : 5, dot = e.ux * n.ux + e.uz * n.uz;
  return n.len * k + (dot < 0.5 ? (dot < -0.7 ? 120 : 22) : 0);
}
function hpush (d, i) {
  const D = HEAP_D, I = HEAP_I;
  let k = D.length; D.push(d); I.push(i);
  while (k > 0) { const p = (k - 1) >> 1; if (D[p] <= d) break; D[k] = D[p]; I[k] = I[p]; k = p; }
  D[k] = d; I[k] = i;
}
function hpop () {
  const D = HEAP_D, I = HEAP_I, top = I[0], ld = D.pop(), li = I.pop(), n = D.length;
  if (n) {
    let k = 0;
    for (;;) {
      let c = 2 * k + 1;
      if (c >= n) break;
      if (c + 1 < n && D[c + 1] < D[c]) c++;
      if (D[c] >= ld) break;
      D[k] = D[c]; I[k] = I[c]; k = c;
    }
    D[k] = ld; I[k] = li;
  }
  return top;
}
/* Дейкстра по рёбрам от seeds ([индекс, цена]). dist/prev — куда писать; target(i) — стоп
   на первой цели (вернёт индекс), block(e) — ребро нельзя; max — сколько снять с кучи */
function search (seeds, dist, prev, target, block, max = 1e9) {
  dist.fill(Infinity); prev.fill(-1);
  HEAP_D.length = 0; HEAP_I.length = 0;
  for (const [i, d] of seeds) { if (d < dist[i]) { dist[i] = d; hpush(d, i); } }
  let n = 0;
  while (HEAP_D.length && n++ < max) {
    const dd = HEAP_D[0], i = hpop();
    if (dd > dist[i]) continue;
    if (target && target(i)) return i;
    const e = EL[i];
    let any = false;
    for (const j of SUCC[i]) {
      const f = EL[j];
      if (block && block(f)) continue;
      any = true;
      const nd = dd + cost(e, f);
      if (nd < dist[j]) { dist[j] = nd; prev[j] = i; hpush(nd, j); }
    }
    // дальше закрыто (район, ремонт) — разворот на перекрёстке, как в тупике
    const bj = BACK[i];
    if (!any && bj >= 0 && !(block && block(EL[bj]))) { const nd = dd + cost(e, EL[bj]); if (nd < dist[bj]) { dist[bj] = nd; prev[bj] = i; hpush(nd, bj); } }
  }
  return -1;
}
function pathTo (prev, to) {
  const P = [];
  for (let k = to; k !== -1; k = prev[k]) { P.push(EL[k]); if (P.length > 5000) break; }
  return P.reverse();
}
const usable = e => e && e.ok && !e.closed && !e.lock;

/* ═════════════ остановки и маршруты ═════════════ */
/* будка — на тротуаре у ближайшей дороги (как в game.js): автобус, у которого она по правую руку, встаёт */
function findStops () {
  STOPS.length = 0;
  const C = A.CITY;
  for (let i = 0; i < C.stops.length; i++) {
    const s = C.stops[i];
    const road = A.nearestRoad(s.p[0], s.p[1], A.DRIVE_MAX, 1);
    if (!road || road.d > 26 || road.seg.b || road.seg.na === undefined) continue;
    const dx = s.p[0] - road.x, dz = s.p[1] - road.z;
    let e = A.edgeOf(road.seg.na, road.seg.nb);
    if (!e) continue;
    if (dx * e.rx + dz * e.rz < 0) e = A.edgeOf(road.seg.nb, road.seg.na);
    if (!e || !EIDX.has(e)) continue;
    const N = A.NODES[e.a];
    const sb = (road.x - N.x) * e.ux + (road.z - N.z) * e.uz - e.tA;   // будка — сколько от начала полосы
    const run = A.edgeRun(e), line = e.sig ? e.len - e.stopAt - e.tA : run;   // светофор: встать до стоп-линии
    if (Math.min(run, line) < 14) continue;
    const o = e.w / 2 + 2;
    STOPS.push({ i, n: s.n || '', e, ei: EIDX.get(e), sb: clamp(sb, 3, Math.min(run, line) - 3), lim: Math.min(run, line), bx: road.x + e.rx * o, bz: road.z + e.rz * o,
      wait: [], filled: 0, used: 0 });
  }
  ST.stops = STOPS.length;
}
/* Маршруты — по открытым районам: закрытые (e.lock) и вечный ремонт в путь не берём. Открылся район —
   строим заново (step следит за числом закрытых рёбер), по шагу за кадр; автобусы пересаживаются
   на маршрут, по которому стоят, или едут к ближайшему. Шаги — yield (latebuild.js STEPS) */
const lockedE = e => !!e.lock || !e.ok;           // !ok — разворот в тупике, который закрылся вместе с районом (deadends.js)
function* routesGen () {
  const out = [];
  const open = STOPS.filter(s => !s.e.lock);
  ST.why = { open: open.length, loops: 0, short: 0 };
  if (open.length < 2) { swapRoutes(out); return; }
  const byE = new Map();
  for (const s of open) { if (!byE.has(s.ei)) byE.set(s.ei, []); byE.get(s.ei).push(s); }
  for (const a of byE.values()) a.sort((p, q) => p.sb - q.sb);
  // пути от остановки — по запросу (одна Дейкстра на остановку, шаг поздней сборки)
  const DS = new Map(), PS = new Map();
  const from = function* (S) {
    if (DS.has(S)) return;
    const d = new Float64Array(EL.length), p = new Int32Array(EL.length);
    search([[S.ei, 0]], d, p, null, lockedE);
    DS.set(S, d); PS.set(S, p);
    yield 'paths';
  };
  const home = A.home || [0, 0], covered = new Set();
  while (out.length < Math.min(BUS.ROUTES, ATLAS_ROWS - 1)) {
    // начало — непокрытая остановка ближе всех к пиццерии (маршруты расходятся от центра)
    let start = null, bd = Infinity;
    for (const S of open) { if (covered.has(S)) continue; const d = (S.bx - home[0]) ** 2 + (S.bz - home[1]) ** 2; if (d < bd) { bd = d; start = S; } }
    if (!start) break;
    yield* from(start);
    // цепочка: каждый раз — ближайшая по дороге непокрытая остановка, от которой есть путь назад к началу
    const seq = [start], skip = new Set();
    let cur = start, len = 0;
    while (len < BUS.LOOP_M && seq.length < 12) {
      const dc = DS.get(cur);
      let nx = null, nd = Infinity;
      for (const S of open) {
        if (covered.has(S) || skip.has(S) || seq.includes(S) || !Number.isFinite(dc[S.ei]) || dc[S.ei] >= nd) continue;
        nx = S; nd = dc[S.ei];
      }
      if (!nx) break;
      yield* from(nx);
      if (!Number.isFinite(DS.get(nx)[start.ei])) { skip.add(nx); continue; }   // оттуда не вернуться (односторонние) — не в эту цепочку
      for (const e of pathTo(PS.get(cur), nx.ei)) len += e.len;
      seq.push(nx); cur = nx;
    }
    covered.add(start);
    if (seq.length < 2) { ST.why.short++; continue; }
    const edges = [];
    for (let i = 0; i < seq.length; i++) {
      const P = pathTo(PS.get(seq[i]), seq[(i + 1) % seq.length].ei);
      for (let k = i ? 1 : 0; k < P.length; k++) edges.push(P[k]);
    }
    if (edges.length > 1 && edges[edges.length - 1] === edges[0]) edges.pop();   // петля замкнулась на первом ребре
    let L = 0;
    for (const e of edges) L += e.len;
    if (L > BUS.ROUTE_M[1] || L < BUS.ROUTE_M[0]) { ST.why.short++; for (const S of seq) covered.add(S); continue; }
    const stops = [];
    for (let k = 0; k < edges.length; k++) { const Ls = byE.get(EIDX.get(edges[k])); if (Ls) for (const S of Ls) { stops.push({ k, st: S }); covered.add(S); } }
    // на табличке: начало — самая дальняя от него остановка цепочки
    let far = seq[1], fd = -1;
    for (const S of seq) { const d = (S.bx - start.bx) ** 2 + (S.bz - start.bz) ** 2; if (d > fd) { fd = d; far = S; } }
    const idx = new Map();
    edges.forEach((e, k) => { if (!idx.has(e)) idx.set(e, k); });
    out.push({ no: ROUTE_NO[out.length % ROUTE_NO.length], a: safeName(start.n), b: far.n === start.n ? '' : safeName(far.n), edges, idx, stops, len: L, row: out.length, buses: 0 });
    ST.why.loops++;
    yield 'route';
  }
  swapRoutes(out);
}
/* новые маршруты вместо старых: таблички, остановки, автобусы — на маршрут, где стоят, или к ближайшему */
function swapRoutes (list) {
  ROUTES.length = 0;
  for (const S of STOPS) S.used = 0;
  for (const R of list) { ROUTES.push(R); plateDraw(R, R.row); for (const q of R.stops) q.st.used = 1; }
  ST.routes = ROUTES.length; ST.builds++;
  for (const t of BUSES) {
    const b = t.bus;
    b.r = null; b.det = null;
    if (b.sleep) continue;
    let R = null, k = -1, bd = Infinity;
    for (const Q of ROUTES) if (t.e && Q.idx.has(t.e)) { R = Q; k = Q.idx.get(t.e); break; }
    if (!R) for (const Q of ROUTES) for (const e of Q.edges) { const N = A.NODES[e.a], d = (N.x - t.x) ** 2 + (N.z - t.z) ** 2; if (d < bd) { bd = d; R = Q; } }
    if (!R) { sleep(t); continue; }
    b.r = R; b.k = k >= 0 ? k : 0; R.buses++;
    b.gm.geometry = glowFor(b.M, R.row);
    if (b.st === 'go') syncStop(b, b.k, k >= 0 ? t.s : 1e9);
    if (k < 0) b.k = -1;                          // не на маршруте — на перекрёстке объезд к нему (nextEdge → detour)
  }
}

/* конечная на табличке: город игроку — «Солнечный»; вывески настоящих сетей и магазинов не пишем
   (docs/STEAM-COMPLIANCE.md) — такая конечная просто без названия */
const BRANDS = /^(Магнит|Газпромнефть|Avi|Прайд|ТомКнига|Мелодия здоровья|Недорогой|Подарки|Антонов Двор|Мегаполис|ТЦ Витим|Василек)$/;
const safeName = n => (!n || BRANDS.test(n) ? '' : n.replace(/Северск(ий|ая|ое|ого)?/g, 'Солнечный'));
/* таблички всех маршрутов — один холст-атлас: строка на маршрут (256 × 64), последняя строка — белая
   (по ней красятся фары и фонари). Табличка — часть меша фар: у автобуса одна отрисовка на всё светлое */
const ATLAS_ROWS = 8;
let ATLAS = null, ATLAS_TEX = null;
const rowV = (r, y) => 1 - (r * 64 + y) / (64 * ATLAS_ROWS);   // v текстуры по строке и пикселю сверху
function atlas () {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64 * ATLAS_ROWS;
  const x = cv.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, cv.height);
  ATLAS = x;
  ATLAS_TEX = new THREE.CanvasTexture(cv);
  if (THREE.SRGBColorSpace) ATLAS_TEX.colorSpace = THREE.SRGBColorSpace;
}
/* табличка: номер крупно, конечные мелко (названия улиц не переводятся — docs/I18N.md) */
function plateDraw (R, row) {
  const x = ATLAS, y0 = row * 64 + 8;
  x.fillStyle = '#f4f1e6'; x.fillRect(0, y0, 256, 48);
  x.strokeStyle = '#1b1a1f'; x.lineWidth = 4; x.strokeRect(2, y0 + 2, 252, 44);
  x.fillStyle = '#1b1a1f'; x.font = 'bold 36px sans-serif'; x.textBaseline = 'middle';
  x.fillText(R.no, 10, y0 + 26);
  const w0 = x.measureText(R.no).width + 20;
  x.fillRect(w0 - 8, y0 + 6, 3, 36);
  const name = [R.a, R.b].filter(Boolean).join(' — ');
  let fs = 17;
  x.font = 'bold ' + fs + 'px sans-serif';
  while (fs > 9 && x.measureText(name).width > 256 - w0 - 8) { fs--; x.font = 'bold ' + fs + 'px sans-serif'; }
  x.fillText(name, w0, y0 + 25);
  ATLAS_TEX.needsUpdate = true;
}

/* ═════════════ модель ═════════════
   Три отрисовки на автобус: кузов (с закрытыми дверями), светлое (фары, фонари, табличка), окна
   (вечером светятся). Открытые двери — четвёртая, только пока открыты; поворотник — пятая, пока мигает */
const TPL = new Map();
function template (M) {
  if (TPL.has(M)) return TPL.get(M);
  const { L, W } = M, put = A.put, B = THREE.BoxGeometry, hl = L / 2, hw = W / 2;
  const lit = [], glow = [], win = [], open = [];
  const box = (list, w, h, d, hex, x, y, z) => put(list, new B(w, h, d), hex, x, y, z);
  box(lit, W, 1.05, L, M.body, 0, 0.95, 0);                                 // низ кузова
  box(lit, W + 0.02, 0.16, L + 0.02, M.stripe, 0, 1.36, 0);                 // полоса
  box(lit, W, 0.34, L, M.top, 0, 2.62, 0);                                   // над окнами
  box(lit, W - 0.14, 0.16, L - 0.3, M.top, 0, 2.86, 0);                     // крыша
  box(lit, 0.9, 0.12, 1.1, '#d6d0c0', 0, 2.97, hl * 0.35);                  // люки
  box(lit, 0.9, 0.12, 1.1, '#d6d0c0', 0, 2.97, -hl * 0.4);
  box(win, W + 0.01, 0.98, L - 0.5, '#ffffff', 0, 1.96, -0.05);            // окна — лента по бортам
  for (let z = -hl + 0.3; z <= hl - 0.25; z += 1.3) box(lit, W + 0.04, 0.98, 0.13, M.top, 0, 1.96, z);   // стойки
  box(lit, W + 0.04, 0.98, 0.25, M.top, 0, 1.96, hl - 0.15);
  box(win, W - 0.25, 1.1, 0.05, '#ffffff', 0, 1.9, hl + 0.01);             // лобовое
  box(lit, 0.08, 1.12, 0.06, '#2b2a30', 0, 1.9, hl + 0.03);                 // стойка лобового
  box(win, W - 0.7, 0.62, 0.05, '#ffffff', 0, 2.05, -hl - 0.01);            // заднее
  box(lit, W * 0.55, 0.2, 0.05, '#3a3940', 0, 0.78, hl + 0.01);             // решётка
  box(lit, W * 0.7, 0.5, 0.05, '#4a4950', 0, 0.95, -hl - 0.01);            // мотор сзади
  box(lit, W + 0.06, 0.24, 0.22, '#35353b', 0, 0.46, hl + 0.06);            // бамперы
  box(lit, W + 0.06, 0.24, 0.22, '#35353b', 0, 0.46, -hl - 0.06);
  for (const s of [1, -1]) box(lit, 0.08, 0.32, 0.22, '#2b2a30', s * (hw + 0.28), 2.0, hl - 0.15);   // зеркала
  for (const s of [1, -1]) box(lit, 0.34, 0.05, 0.05, '#2b2a30', s * (hw + 0.13), 2.15, hl - 0.15);
  for (const az of M.axles) {
    box(lit, W + 0.01, 0.72, 1.3, '#2a2a30', 0, 0.76, az);                   // арки
    for (const s of [1, -1]) {
      put(lit, new THREE.CylinderGeometry(0.5, 0.5, 0.3, 10), '#1d1d22', s * (hw - 0.11), 0.5, az, 0, 0, Math.PI / 2);   // колесо чуть наружу из арки
      put(lit, new THREE.CylinderGeometry(0.22, 0.22, 0.05, 8), '#9a9ca2', s * (hw + 0.05), 0.5, az, 0, 0, Math.PI / 2);
    }
  }
  // двери справа: закрытые створки (низ — кузов, верх — стекло, щель посередине) — в кузове;
  // открытые — тёмный проём со ступенькой и поручнем поверх, отдельным мешем
  for (const [dz, dw] of M.doors) {
    for (const s of [1, -1]) {
      const cz = dz + s * dw / 4, lw = dw / 2 - 0.04;
      box(lit, 0.05, 1.0, lw, M.body, -hw - 0.03, 0.92, cz);
      box(lit, 0.06, 0.95, lw - 0.1, '#3d4a57', -hw - 0.03, 1.92, cz);
      box(lit, 0.055, 0.08, lw, M.top, -hw - 0.03, 2.42, cz);
    }
    box(open, 0.02, 2.05, dw, '#1f1f24', -hw - 0.07, 1.42, dz);
    box(open, 0.03, 0.08, dw - 0.06, '#8a8a90', -hw - 0.085, 0.5, dz);       // ступенька
    box(open, 0.04, 1.6, 0.04, '#c9ccd2', -hw - 0.1, 1.35, dz);              // поручень
  }
  for (const s of [1, -1]) {
    box(glow, 0.34, 0.22, 0.05, '#fff4d0', s * (hw - 0.42), 0.86, hl + 0.03);   // фары
    box(glow, 0.22, 0.3, 0.05, '#d0261e', s * (hw - 0.3), 0.95, -hl - 0.03);    // фонари
  }
  // поворотники: правые и левые (углы + повторитель на борту)
  const bl = (s) => { const L2 = []; box(L2, 0.14, 0.12, 0.06, '#ffffff', s * (hw - 0.1), 0.86, hl + 0.04); box(L2, 0.14, 0.12, 0.06, '#ffffff', s * (hw - 0.1), 1.2, -hl - 0.04); box(L2, 0.03, 0.1, 0.2, '#ffffff', s * (hw + 0.02), 1.22, hl - 0.7); return A.mergeGeos(L2); };
  const T = { lit: A.mergeGeos(lit), glow: A.mergeGeos(glow), win: A.mergeGeos(win), open: A.mergeGeos(open), blinkR: bl(-1), blinkL: bl(1), gl: [] };
  TPL.set(M, T);
  return T;
}
/* фары + табличка маршрута row (спереди над лобовым и справа у передней двери) — одна геометрия */
function glowFor (M, row) {
  const T = template(M);
  if (T.gl[row]) return T.gl[row];
  const g = T.glow, bp = g.attributes.position.array, bn = g.attributes.normal.array, bc = g.attributes.color.array, bi = g.index.array;
  const nv = bp.length / 3, hl = M.L / 2, hw = M.W / 2;
  const fz = hl + 0.035, py = 2.62, sx = -hw - 0.025, sz = M.doors[0][0] - M.doors[0][1] / 2 - 0.95;
  const PP = [-0.85, py - 0.15, fz, 0.85, py - 0.15, fz, 0.85, py + 0.15, fz, -0.85, py + 0.15, fz,          // спереди (смотрит в +z)
    sx, py - 0.14, sz + 0.75, sx, py - 0.14, sz - 0.75, sx, py + 0.14, sz - 0.75, sx, py + 0.14, sz + 0.75];   // справа (в −x)
  const PN = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0];
  const v0 = rowV(row, 56), v1 = rowV(row, 8), wv = rowV(ATLAS_ROWS - 1, 32);
  const PU = [0, v0, 1, v0, 1, v1, 0, v1, 0, v0, 1, v0, 1, v1, 0, v1];
  const pos = new Float32Array((nv + 8) * 3), nor = new Float32Array((nv + 8) * 3), col = new Float32Array((nv + 8) * 3), uv = new Float32Array((nv + 8) * 2);
  pos.set(bp); nor.set(bn); col.set(bc); pos.set(PP, nv * 3); nor.set(PN, nv * 3); col.fill(1, nv * 3);
  for (let i = 0; i < nv; i++) { uv[i * 2] = 0.5; uv[i * 2 + 1] = wv; }
  uv.set(PU, nv * 2);
  const idx = new Uint16Array(bi.length + 12);
  idx.set(bi);
  const q = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7];
  for (let i = 0; i < 12; i++) idx[bi.length + i] = q[i] + nv;
  const G = new THREE.BufferGeometry();
  G.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  G.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  G.setAttribute('color', new THREE.BufferAttribute(col, 3));
  G.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  G.setIndex(new THREE.BufferAttribute(idx, 1));
  G.computeBoundingSphere();
  return (T.gl[row] = G);
}
function makeBus (M) {
  const T = template(M), g = new THREE.Group();
  g.rotation.order = 'YXZ';
  g.add(new THREE.Mesh(T.lit, BODY_MAT));
  const gm = new THREE.Mesh(glowFor(M, 0), GLOW_MAT);
  g.add(gm);
  g.add(new THREE.Mesh(T.win, WIN_MAT));
  const openM = new THREE.Mesh(T.open, BODY_MAT);
  openM.visible = false;
  g.add(openM);
  const bR = new THREE.Mesh(T.blinkR, BLINK_MAT), bL = new THREE.Mesh(T.blinkL, BLINK_MAT);
  bR.visible = bL.visible = false;
  g.add(bR); g.add(bL);
  // без lite и panels: fullCar и dentCar (game.js) автобус не трогают
  g.userData = { hl: M.L / 2, wheels: [], steer: [], hazard: [], bus: true, model: 'bus' };
  return { g, gm, openM, bR, bL };
}

/* ═════════════ автобус ═════════════ */
function newBus (i) {
  const M = MODELS[i % MODELS.length], mk = makeBus(M);
  const t = A.carObj(mk.g, 'bus', false, false, rand(...BUS.CRUISE), 1e6, 1e9);
  t.hbRoll = 1; t.cnRoll = 1; t.rvRoll = 1;        // ни коневозкой, ни самосвалом, ни бургер-машиной не станет
  t.gone = 1;                                     // спит, пока не поставим
  t.bus = { M, hl: M.L / 2, W2: M.W / 2, r: null, k: 0, si: 0, det: null, di: 0, detK: 0, st: 'go', T: 0, dwell: 0,
    door: 0, doorTo: 0, blink: 0, stop: null, alight: 0, alT: 0, boardN: 0, runner: null, sleep: 1, inT: false,
    gm: mk.gm, openM: mk.openM, bR: mk.bR, bL: mk.bL, id: i };
  return t;
}
/* где встать на остановке: передняя дверь — у будки */
const stopS = (b, s) => clamp(s.st.sb - b.hl + 2.45, b.hl + 0.5, s.st.lim - b.hl - 0.5);
function syncStop (b, k, s) {
  const R = b.r;
  if (!R || !R.stops.length) { b.si = 0; return; }
  for (let i = 0; i < R.stops.length; i++) {
    const q = R.stops[i];
    if (q.k > k || (q.k === k && stopS(b, q) > s - 0.3)) { b.si = i; return; }
  }
  b.si = 0;
}
function nextStop (b) { if (b.r && b.r.stops.length) b.si = (b.si + 1) % b.r.stops.length; }

/* поворот на перекрёстке — по маршруту (startTurn в game.js); null — как все */
export function nextEdge (t, e) {
  const b = t.bus, R = b && b.r;
  if (!R) return null;
  if (b.det) {
    const n = b.det[b.di];
    if (n && n.a === e.b && usable(n)) {
      b.di++;
      if (b.di >= b.det.length) { b.det = null; b.k = b.detK; syncStop(b, b.k, -1); }
      return n;
    }
    b.det = null;
  }
  let k = R.edges[b.k] === e ? b.k : R.idx.has(e) ? R.idx.get(e) : -1;
  if (k >= 0) {
    const k2 = (k + 1) % R.edges.length, n = R.edges[k2];
    if (n.a === e.b && usable(n)) { b.k = k2; syncStop(b, k2, -1); return n; }
  }
  return detour(b, e, k);
}
/* сбился с маршрута (ремонт, закрытый район, поставили на чужую улицу) — к ближайшему ребру маршрута,
   кроме нескольких только что пройденных */
function detour (b, e, k) {
  const R = b.r, L = R.edges.length, seeds = [];
  for (const c of A.NODES[e.b].nb) {
    if (c === e.a) continue;
    const n = A.edgeOf(e.b, c), j = n && EIDX.get(n);
    if (j !== undefined && usable(n)) seeds.push([j, cost(e, n)]);
  }
  if (!seeds.length) return null;
  ST.detours++;
  const behind = i => k >= 0 && ((k - i + L) % L) <= 4;
  const hit = search(seeds, DIST, PREV, i => { const ri = R.idx.get(EL[i]); return ri !== undefined && !behind(ri) && usable(EL[i]); }, f => !usable(f), 8000);
  if (hit < 0) return null;
  const P = pathTo(PREV, hit);
  b.detK = R.idx.get(EL[hit]);
  if (P.length <= 1) { b.det = null; b.k = b.detK; syncStop(b, b.k, -1); return P[0] || null; }
  b.det = P; b.di = 1;
  return P[0];
}

/* стоянка на остановке, поворотники, двери, мягкий разгон — из updateTraffic; вернёт долю скорости */
export function drive (t, dt) {
  const b = t.bus, e = t.e;
  b.T += dt;
  if (!t.turn && t.lane !== 0) { t.pull += A.laneOff(e, t.lane) - A.laneOff(e, 0); t.lane = 0; }   // только в правом ряду: перестраивается плавно
  const R = b.r, onRoute = R && !b.det && !t.turn && R.edges[b.k] === e;
  const q = onRoute && R.stops.length ? R.stops[b.si] : null;
  const curb = t.turn ? 0 : Math.max(0, e.w / 2 - b.W2 - 0.2 - A.laneOff(e, 0));
  let slow = 1;
  if (b.st === 'go') {
    let want = 0;
    if (q && q.k === b.k) {
      const to = stopS(b, q) - t.s;
      if (to < -1.5) { nextStop(b); b.blink = 0; ST.skips++; }   // проскочил (поставили за ней)
      else if (to < 45) {
        b.blink = to < 40 ? 1 : 0;
        slow = to < 0.4 ? 0 : clamp(to / 16, 0.12, 1);
        if (to < 30) want = curb;
        if (to < 0.8 && t.speed < 0.8) dwellStart(t, b, q.st);
      }
    } else if (b.blink === 1) b.blink = 0;
    if (!t.turn) t.pull = damp(t.pull, want, 1.6, dt);
  } else if (b.st === 'dwell') {
    slow = 0;
    t.pull = damp(t.pull, curb, 2, dt);
    dwellStep(t, b, dt);
  } else {                                         // 'out': двери закрылись — левый поворотник, отъезжает
    slow = b.T < 0.9 ? 0 : 1;
    if (b.T > 0.9 && !t.turn) t.pull = damp(t.pull, 0, 1.2, dt);
    if (b.T > 0.9 && (t.pull < 0.25 || t.turn)) { b.st = 'go'; b.blink = 0; }
  }
  // двери
  if (b.door !== b.doorTo) {
    b.door = b.doorTo > b.door ? Math.min(1, b.door + dt / BUS.DOOR_T) : Math.max(0, b.door - dt / BUS.DOOR_T);
    b.openM.visible = b.door > 0.5;               // открылись наполовину — виден проём
  }
  // поворотник: вправо — к остановке, влево — от неё
  const on = Math.floor(CLOCK * 2.6) % 2 === 0;
  b.bR.visible = b.blink === 1 && on; b.bL.visible = b.blink === -1 && on;
  return Math.min(slow, Math.max(0.05, (t.speed + BUS.ACC) / t.cruise));
}
function dwellStart (t, b, stop) {
  b.st = 'dwell'; b.T = 0; b.dwell = rand(...BUS.DWELL); b.stop = stop; b.doorTo = 1; b.blink = 1;
  b.alight = 0; b.alT = BUS.DOOR_T; b.boardN = 0; b.runner = null;
  ST.dwells++;
  const d = Math.hypot(t.x - A.V.x, t.z - A.V.z);
  if (d < 140) {
    A.Snd.fx('bus-door', s => s.noise(0.45, 0.07), { x: t.x, z: t.z, far: 60 });
    b.alight = share(BUS.ALIGHT);
    for (const p of stop.wait) if (!p.dead && p.st === 'wait') { p.st = 'board'; p.bus = t; b.boardN++; }
    stop.wait.length = 0;
    if (d < BUS.RUN_R && (DEBUG.force.run > 0 ? DEBUG.force.run-- > 0 : chance(BUS.RUN_P))) runner(t, b, stop);
  }
}
function dwellStep (t, b, dt) {
  if (b.T > BUS.DOOR_T && b.alight > 0 && (b.alT -= dt) <= 0) { b.alight--; b.alT = rand(0.5, 0.9); alightOne(t, b); }
  const R = b.runner, waitRun = R && !R.dead && R.ok && R.st === 'run' && b.T < b.dwell + 8;
  if (b.T >= b.dwell && b.alight <= 0 && (b.boardN <= 0 || b.T > b.dwell + 6) && !waitRun) {
    b.doorTo = 0; b.st = 'out'; b.T = 0; b.blink = -1; b.stop = null; b.boardN = 0;
    for (const p of PEOPLE) if (p.bus === t && p.st === 'board') { p.st = 'late'; p.T = 0; p.bus = null; }   // не успел дойти — остаётся
    nextStop(b);
    if (Math.hypot(t.x - A.V.x, t.z - A.V.z) < 140) A.Snd.fx('bus-door', s => s.noise(0.35, 0.06), { x: t.x, z: t.z, far: 60 });
  }
}

/* ═════════════ удар: автобус не сдвинуть ═════════════
   Коробка кузова против двух кругов своей машины (нос и корма, как с чужими машинами в driveStep):
   выталкиваем, гасим скорость сближения с отскоком BOUNCE; быстрее SOLID.HURT м/с — мятина,
   удар слоями и сердца (hurtCar), как от стоящей машины; автобус не отлетает и не горит. */
export function hit (t, nx0, nz0, tx0, tz0) {
  const V = A.V, b = t.bus, dx0 = V.x - t.x, dz0 = V.z - t.z, R = b.hl + 4;
  if (dx0 * dx0 + dz0 * dz0 > R * R) return;
  const fx = Math.sin(t.h), fz = Math.cos(t.h), rx = -fz, rz = fx, r = A.CAR_W, hw = b.W2, hl = b.hl;
  for (let c = 0; c < 2; c++) {
    const cx = c ? tx0 : nx0, cz = c ? tz0 : nz0;
    const dx = cx - t.x, dz = cz - t.z, a = dx * fx + dz * fz, s = dx * rx + dz * rz;
    const ca = clamp(a, -hl, hl), cs = clamp(s, -hw, hw);
    let nx, nz, pen;
    if (ca === a && cs === s) {
      const pa = hl - Math.abs(a), ps = hw - Math.abs(s);
      if (pa < ps) { const sg = a < 0 ? -1 : 1; nx = fx * sg; nz = fz * sg; pen = pa + r; }
      else { const sg = s < 0 ? -1 : 1; nx = rx * sg; nz = rz * sg; pen = ps + r; }
    } else {
      const ea = a - ca, es = s - cs, d = Math.sqrt(ea * ea + es * es);
      if (d >= r) continue;
      nx = (fx * ea + rx * es) / d; nz = (fz * ea + rz * es) / d; pen = r - d;
    }
    V.x += nx * pen; V.z += nz * pen;
    const bvx = fx * t.speed, bvz = fz * t.speed, vn = (V.vx - bvx) * nx + (V.vz - bvz) * nz;
    if (vn >= 0) continue;
    const hv = -vn, hx = t.x + fx * ca + rx * cs, hz = t.z + fz * ca + rz * cs;
    V.vx -= vn * nx * (1 + BUS.SOLID.BOUNCE); V.vz -= vn * nz * (1 + BUS.SOLID.BOUNCE);
    const vt = Math.abs((V.vx - bvx) * -nz + (V.vz - bvz) * nx);
    if (vt > A.IMPACT.IMP.RUB_MIN) A.IMPACT.rub(A.IMPACT.rubK(vt), 'car');   // бортом о борт — скрежет
    if (t.hitT > 0 || hv < 2) continue;
    t.hitT = 0.4;
    ST.hits++;
    A.sparks(hx, 0.8, hz, hv > 10 ? 12 : 4, -nx, -nz);
    A.Snd.impact(hv, 'car', { x: hx, z: hz });
    A.S.shake = Math.max(A.S.shake, Math.min(0.6, hv * 0.035));
    if (hv > BUS.SOLID.HURT) {
      A.hurtCar(A.carDmg(hv), hv, hx, hz, 'car');   // мятина своей (dentCar) и удар; слабый — без сердец
      A.Snd.fx('honk', s => s.blip(250, 0.45, 'square', 0.07), { x: t.x, z: t.z, far: 90 });   // водитель автобуса гудит
    }
  }
}

/* ═════════════ где автобусу быть ═════════════ */
function place (t) {
  const b = t.bus, V = A.V, [r0, r1] = BUS.PLACE, cands = [];
  for (const R of ROUTES) {
    if (R !== b.r && R.buses >= Math.ceil(R.len / BUS.PER_M)) continue;   // на короткий маршрут — не толпой
    for (let k = 0; k < R.edges.length; k++) {
      const e = R.edges[k];
      if (!usable(e)) continue;
      const N = A.NODES[e.a], run = A.edgeRun(e);
      if (run < 2 * b.hl + 6) continue;
      const mx = N.x + e.ux * (e.tA + run / 2), mz = N.z + e.uz * (e.tA + run / 2);
      const d = Math.hypot(mx - V.x, mz - V.z);
      if (d < r0 || d > r1 || !A.inBounds(mx, mz, 20)) continue;
      if (d < 260 && A.inView(mx, 2, mz, 10)) continue;   // на глазах не появляется
      let busy = false;
      for (const o of BUSES) if (o !== t && !o.bus.sleep && Math.abs(o.x - mx) < 70 && Math.abs(o.z - mz) < 70) { busy = true; break; }
      if (busy) continue;
      cands.push(R, k);
    }
  }
  if (!cands.length) return false;
  // маршрут, где автобусов меньше
  let bi = -1, bn = Infinity;
  for (let i = 0; i < cands.length; i += 2) { const n = cands[i].buses + Math.random() * 0.9; if (n < bn) { bn = n; bi = i; } }
  const R = cands[bi], same = [];
  for (let i = 0; i < cands.length; i += 2) if (cands[i] === R) same.push(cands[i + 1]);
  const k = pick(same), e = R.edges[k], run = A.edgeRun(e);
  for (let tries = 0; tries < 4; tries++) {
    const s = rand(b.hl + 1, run - b.hl - 1);
    const [x, z] = lanePt(e, 0, s);
    if (A.TRAFFIC.some(o => o !== t && !o.gone && Math.abs(o.x - x) < 9 && Math.abs(o.z - z) < 9)) continue;
    if (b.r) b.r.buses--;
    b.r = R; R.buses++;
    b.gm.geometry = glowFor(b.M, R.row);
    b.k = k; b.det = null; b.st = 'go'; b.T = 0; b.door = 0; b.doorTo = 0; b.blink = 0; b.stop = null; b.runner = null; b.boardN = 0; b.alight = 0;
    b.openM.visible = false;
    t.e = e; t.s = s; t.lane = 0; t.turn = null; t.pull = 0; t.nar = 0; t.rejoin = 0; t.stopT = 0; t.ghost = 0; t.waitT = 0;
    t.knock = 0; t.wreck = 0; t.hitT = 0; t.speed = t.cruise * 0.5; t.gy = undefined;
    syncStop(b, k, s);
    A.poseTraffic(t, 0);
    ST.relocate++;
    return true;
  }
  return false;
}
function lanePt (e, lane, s) {
  const N = A.NODES[e.a], o = A.laneOff(e, lane), d = e.tA + s;
  return [N.x + e.ux * d + e.rx * o, N.z + e.uz * d + e.rz * o];
}
function wake (t) {
  if (!place(t)) return false;
  const b = t.bus;
  b.sleep = 0; t.gone = 0;
  if (!A.TRAFFIC.includes(t)) A.TRAFFIC.push(t);
  if (!t.mesh.parent) A.scene.add(t.mesh);
  return true;
}
function sleep (t) {
  const b = t.bus;
  b.sleep = 1; t.gone = 1;
  if (b.r) { b.r.buses--; b.r = null; }
  b.bR.visible = b.bL.visible = false;
  if (t.mesh.parent) t.mesh.parent.remove(t.mesh);
  ST.sleep++;
}
/* укатился далеко (поток перерождает дальше 520 м — respawnTraffic в game.js) */
export function relocate (t) {
  if (!wake(t)) sleep(t);
}

/* ═════════════ люди ═════════════ */
const gyAt = (x, z) => A.groundH(x, z) + A.curbAt(x, z);
function human (st, x, z) {
  const grp = A.makeHuman(makePerson());
  A.scene.add(grp);
  const p = { grp, u: grp.userData, st, x, z, h: 0, tx: x, tz: z, sp: 1.3 * grp.userData.pace, T: 0, ph: rand(0, 9),
    stop: null, bus: null, ok: 0, door: 0, say: null, sayT: 0, dead: 0, lx: 0, lz: 0 };
  grp.position.set(x, gyAt(x, z), z);
  PEOPLE.push(p);
  return p;
}
function unsay (p) { if (p.say) { if (p.say.parent) p.say.parent.remove(p.say); p.say.material.dispose(); p.say = null; } }
function say (p, text, col, dur = 2.4) { unsay(p); p.say = A.sayBubble(p.grp, text, col || '#5a4a9a', 2.7); p.sayT = dur; }
function drop (p) {
  if (p.dead) return;
  unsay(p); p.dead = 1;
  A.dropMesh(p.grp);
  if (p.stop) { const i = p.stop.wait.indexOf(p); if (i >= 0) p.stop.wait.splice(i, 1); }
}
/* точка у остановки: s — вдоль полосы ребра, o — от оси улицы вправо (к будке) */
function edgePt (e, s, o) {
  const N = A.NODES[e.a], d = e.tA + s;
  return [N.x + e.ux * d + e.rx * o, N.z + e.uz * d + e.rz * o];
}
/* дверь автобуса снаружи: i — передняя (0) / задняя (1), out — сколько от борта */
function doorPt (t, i, out) {
  const b = t.bus, dz = b.M.doors[i][0], fx = Math.sin(t.h), fz = Math.cos(t.h), o = b.W2 + out;
  return [t.x + fx * dz - fz * o, t.z + fz * dz + fx * o];
}
function fillStop (S) {
  const n = share(BUS.WAIT);
  for (let k = 0; k < n && ST.waiting < BUS.WAIT_MAX; k++) {
    const [x, z] = edgePt(S.e, S.sb + rand(-2.4, 2.4), S.e.w / 2 + rand(0.7, 1.15));
    const p = human('wait', x, z);
    ST.waiting++;
    p.stop = S; p.h = Math.atan2(-S.e.rx, -S.e.rz) + rand(-0.5, 0.5);   // лицом к дороге
    S.wait.push(p);
  }
}
function alightOne (t, b) {
  if (!b.stop) return;
  const i = b.M.doors.length > 1 && chance(0.5) ? 1 : 0;
  const [x, z] = doorPt(t, i, -0.2);
  const p = human('alight', x, z);
  const [sx, sz] = doorPt(t, i, 1.4 + rand(0, 0.8));
  p.tx = sx; p.tz = sz; p.stop = null;
  ST.alight++;
}
function runner (t, b, S) {
  const e = S.e, [dx, dz] = doorPt(t, 0, 0.45);
  const rem = b.dwell - BUS.DOOR_T, ok = chance(BUS.RUN_OK);
  const want = ok ? BUS.RUN_V * Math.max(2, rem - 1) : BUS.RUN_V * (rem + 1.6);
  // откуда бежит: сзади по тротуару, нет места — спереди
  const sDoor = (dx - A.NODES[e.a].x) * e.ux + (dz - A.NODES[e.a].z) * e.uz - e.tA;
  const back = sDoor - 1, fwd = A.edgeRun(e) - sDoor - 1, need = Math.min(want, 12);
  let s0;
  if (back >= need) s0 = sDoor - Math.min(want, back);
  else if (fwd >= need) s0 = sDoor + Math.min(want, fwd);
  else return;
  const d = Math.abs(sDoor - s0);
  if (d < 8) return;
  const [x, z] = edgePt(e, s0, e.w / 2 + 0.9);
  const p = human('run', x, z);
  p.ok = ok ? 1 : 0; p.bus = t; p.tx = dx; p.tz = dz;
  const [lx, lz] = edgePt(e, sDoor, e.w / 2 + 0.9); p.lx = lx; p.lz = lz;   // сначала по тротуару, потом к двери
  p.sp = ok ? d / Math.max(2, rem - 1) : d / (rem + 1.6);
  p.sp = clamp(p.sp, 2.6, 5.5);
  if (!ok && d / p.sp < rem) p.ok = 1;           // медленнее не побежит — значит, успеет
  b.runner = p;
  say(p, pick([$t('Подождите!'), $t('Стойте! Стойте!'), $t('Эй, водитель!')]), '#2a6db0', 2.6);
  ST.runners++;
}
function lateReact (p) {
  p.st = 'late'; p.T = 0;
  say(p, pick([$t('Ну вот…'), $t('Эй! Откройте!'), $t('Да что ж такое!'), $t('А следующий через час…')]), '#c23a4a', 2.6);
  ST.runLate++;
}
function carHits (x, z) {
  const V = A.V;
  if (V.vx * V.vx + V.vz * V.vz < 9) return false;
  const fx = Math.sin(V.h), fz = Math.cos(V.h), dx = x - V.x, dz = z - V.z;
  return Math.abs(dx * fx + dz * fz) < A.CAR_L + 0.5 && Math.abs(dx * fz - dz * fx) < A.CAR_W + 0.35;
}
function moveTo (p, tx, tz, v, dt) {
  const dx = tx - p.x, dz = tz - p.z, d = Math.sqrt(dx * dx + dz * dz);
  if (d < 0.05) return true;
  const st = Math.min(d, v * dt);
  p.x += dx / d * st; p.z += dz / d * st;
  p.h = Math.atan2(dx, dz);
  return d - st < 0.15;
}
function walkPose (u, ph, k) {
  const sw = Math.sin(ph) * k;
  u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
  u.armL.rotation.x = -sw * 0.7; u.armR.rotation.x = sw * 0.7;
  u.armL.rotation.z = 0; u.armR.rotation.z = 0;
}
function stand (u, dt) {
  for (const m of [u.legL, u.legR, u.armL, u.armR]) { m.rotation.x = damp(m.rotation.x, 0, 6, dt); m.rotation.z = damp(m.rotation.z, 0, 6, dt); }
}
function stepPeople (dt) {
  const V = A.V, R = A.hideR().people;
  let waiting = 0;
  for (let i = PEOPLE.length - 1; i >= 0; i--) {
    const p = PEOPLE[i];
    if (p.dead) { PEOPLE.splice(i, 1); continue; }
    const u = p.u;
    p.T += dt;
    if (p.say && (p.sayT -= dt) <= 0) unsay(p);
    let moving = false;
    if (p.st === 'wait') {
      waiting++;
      stand(u, dt);
      u.head.rotation.y = Math.sin(p.ph + p.T * 0.4) * 0.5;
    } else if (p.st === 'board') {
      const t = p.bus;
      if (!t || t.gone || t.bus.st !== 'dwell') { p.st = 'late'; p.T = 0; p.bus = null; }
      else if (t.bus.door > 0.6) {
        const [dx, dz] = doorPt(t, p.door, 0.35);
        moving = true;
        if (moveTo(p, dx, dz, p.sp, dt)) { t.bus.boardN--; ST.board++; drop(p); continue; }   // зашёл
      } else { stand(u, dt); p.door = chance(0.5) && t.bus.M.doors.length > 1 ? 1 : 0; }
    } else if (p.st === 'alight') {
      moving = true;
      if (moveTo(p, p.tx, p.tz, p.sp, dt)) {
        p.st = 'leave'; p.T = 0;
        const fx = Math.sin(p.h), fz = Math.cos(p.h), sg = chance(0.5) ? 1 : -1;   // вдоль тротуара в одну из сторон
        p.tx = p.x - fz * sg * rand(14, 24); p.tz = p.z + fx * sg * rand(14, 24);
      }
    } else if (p.st === 'leave') {
      moving = !moveTo(p, p.tx, p.tz, p.sp, dt);
      if (!moving) stand(u, dt);
      if ((p.T > 8 && !p.grp.visible) || p.T > 30) { drop(p); continue; }
    } else if (p.st === 'run') {
      const t = p.bus, tb = t && t.bus;
      const toLane = Math.hypot(p.lx - p.x, p.lz - p.z) > 0.4;
      moving = true;
      if (moveTo(p, toLane ? p.lx : p.tx, toLane ? p.lz : p.tz, p.sp, dt) && !toLane) {
        if (tb && !t.gone && tb.st === 'dwell' && tb.door > 0.5) { ST.runOk++; ST.board++; if (tb.runner === p) tb.runner = null; drop(p); continue; }   // успел
        lateReact(p); moving = false;
      } else if (!toLane && (!tb || t.gone || tb.st !== 'dwell') && Math.hypot(p.tx - p.x, p.tz - p.z) < 6) { lateReact(p); moving = false; }   // перед носом закрылись
    } else if (p.st === 'late') {
      // руки к небу, потом — к будке ждать следующий
      const sh = Math.sin(p.T * 14) * 0.15;
      if (p.T < 2.6) { u.armL.rotation.x = -2.6 + sh; u.armR.rotation.x = -2.6 - sh; u.legL.rotation.x = u.legR.rotation.x = 0; }
      else {
        const S = nearStop(p.x, p.z);
        if (S && S.wait.length < 4) { const [x, z] = edgePt(S.e, S.sb + rand(-2, 2), S.e.w / 2 + rand(0.7, 1.15)); p.st = 'back'; p.tx = x; p.tz = z; p.stop = S; S.wait.push(p); }
        else { p.st = 'leave'; p.T = 0; p.tx = p.x + rand(-15, 15); p.tz = p.z + rand(-15, 15); }
      }
    } else if (p.st === 'back') {
      moving = !moveTo(p, p.tx, p.tz, 1.2, dt);
      if (!moving) { p.st = 'wait'; p.h = Math.atan2(-p.stop.e.rx, -p.stop.e.rz); }
    }
    if (moving) {
      const run = p.st === 'run';
      p.ph += dt * p.sp * (run ? 2.4 : 3.4);
      walkPose(u, p.ph, run ? 1.1 : 0.75);
      if (run) { u.armR.rotation.x = -2.75; u.armR.rotation.z = Math.sin(p.T * 9) * 0.4; }   // машет рукой
    }
    const d = Math.hypot(p.x - V.x, p.z - V.z), g = p.grp;
    if (d > BUS.WAIT_DROP + 30) { if (p.bus && p.st === 'board') p.bus.bus.boardN--; drop(p); continue; }   // курьер уехал — люди остаются в своём квартале
    g.visible = d < R && A.inView(p.x, g.position.y + 0.9, p.z, 2.5);
    if (g.visible) {
      g.position.set(p.x, gyAt(p.x, p.z) + (p.st === 'run' ? Math.abs(Math.sin(p.ph)) * 0.08 : 0), p.z);
      g.rotation.y = p.h;
    }
    if (d < 6 && carHits(p.x, p.z)) {
      if (p.bus && p.st === 'board') p.bus.bus.boardN--;
      drop(p);
      A.gibHuman(p, V.vx, V.vz);
      A.onKill();
    }
  }
  ST.waiting = waiting;
}
function nearStop (x, z) {
  let best = null, bd = 30 * 30;
  for (const S of STOPS) { if (!S.used) continue; const d = (S.bx - x) ** 2 + (S.bz - z) ** 2; if (d < bd) { bd = d; best = S; } }
  return best;
}
function stepStops () {
  const V = A.V, r0 = BUS.WAIT_R * BUS.WAIT_R, r1 = BUS.WAIT_DROP * BUS.WAIT_DROP;
  for (const S of STOPS) {
    if (!S.used) continue;
    const d = (S.bx - V.x) ** 2 + (S.bz - V.z) ** 2;
    if (!S.filled && d < r0) { S.filled = 1; fillStop(S); }
    else if (S.filled && d > r1) {
      S.filled = 0;
      for (const p of S.wait.slice()) if (p.st === 'wait' || p.st === 'back') drop(p);
    }
  }
}

/* ═════════════ сборка, кадр ═════════════ */
export function* build (api) {
  A = api; THREE = api.THREE;
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('nobus')) return;   // ?nobus — без автобусов (сравнить кадр)
  const t0 = performance.now();
  BODY_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  atlas();
  GLOW_MAT = new THREE.MeshBasicMaterial({ vertexColors: true, map: ATLAS_TEX });
  WIN_MAT = new THREE.MeshBasicMaterial({ color: '#3b4a58' });
  BLINK_MAT = new THREE.MeshBasicMaterial({ color: '#ffa21a' });
  const c0 = new THREE.Color('#3b4a58'), c1 = new THREE.Color('#f0d48c');
  Object.assign(WIN_DAY, { r: c0.r, g: c0.g, b: c0.b }); Object.assign(WIN_NIGHT, { r: c1.r, g: c1.g, b: c1.b });
  graph();
  yield 'graph';
  findStops();
  ST.locked = lockedCount();
  yield 'stops';
  yield* routesGen();
  if (STOPS.length >= 2) for (let i = 0; i < Math.max(BUS.N_DAY, BUS.N_NIGHT); i++) BUSES.push(newBus(i));
  ST.ms = Math.round(performance.now() - t0);
  READY = true;
}
function lockedCount () { let n = 0; for (let i = 0; i < EL.length; i++) if (EL[i].lock) n++; return n; }
let REBUILD = null, LOCK_T = 0;
let WAKE_T = 0, STOP_T = 0;
export function step (dt) {
  if (!READY || !BUSES.length) return;
  CLOCK += dt;
  // открылся (закрылся) район — маршруты заново, по шагу за кадр
  if (REBUILD) { if (REBUILD.next().done) REBUILD = null; }
  else if ((LOCK_T -= dt) <= 0) { LOCK_T = 2; const n = lockedCount(); if (n !== ST.locked) { ST.locked = n; REBUILD = routesGen(); } }
  const V = A.V;
  // окна вечером светятся
  const n = clamp((A.night() - 0.25) * 1.6, 0, 1);
  WIN_MAT.color.setRGB(WIN_DAY.r + (WIN_NIGHT.r - WIN_DAY.r) * n, WIN_DAY.g + (WIN_NIGHT.g - WIN_DAY.g) * n, WIN_DAY.b + (WIN_NIGHT.b - WIN_DAY.b) * n);
  // сколько автобусов возле курьера: будим и усыпляем по одному в секунду
  if ((WAKE_T -= dt) <= 0) {
    WAKE_T = 1;
    const want = A.isNight() ? BUS.N_NIGHT : BUS.N_DAY;
    let awake = 0;
    for (const t of BUSES) if (!t.bus.sleep) awake++;
    if (awake < want) { for (const t of BUSES) if (t.bus.sleep) { wake(t); break; } }
    else if (awake > want) {
      for (const t of BUSES) {
        if (t.bus.sleep || t.bus.st === 'dwell') continue;
        if (Math.hypot(t.x - V.x, t.z - V.z) > 150 && !A.inView(t.x, 2, t.z, 8)) { sleep(t); break; }
      }
    }
  }
  // уехал далеко — переезжает (не больше одного за кадр)
  for (const t of BUSES) {
    if (t.bus.sleep || t.knock) continue;
    const dx = t.x - V.x, dz = t.z - V.z;
    if (dx * dx + dz * dz > BUS.HIDE * BUS.HIDE) { relocate(t); break; }
  }
  if ((STOP_T -= dt) <= 0) { STOP_T = 0.5; stepStops(); }
  stepPeople(dt);
}

export const DEBUG = {
  BUS, ST, ROUTES, STOPS, BUSES, PEOPLE,
  routes: () => ROUTES.map(R => ({ no: R.no, name: [R.a, R.b].filter(Boolean).join(' — '), km: +(R.len / 1000).toFixed(1), edges: R.edges.length, stops: R.stops.length, buses: R.buses })),
  buses: () => BUSES.map(t => ({ id: t.bus.id, model: t.bus.M.id, route: t.bus.r ? t.bus.r.no : null, sleep: t.bus.sleep, st: t.bus.st, x: Math.round(t.x), z: Math.round(t.z),
    sp: +(t.speed || 0).toFixed(1), k: t.bus.k, si: t.bus.si, det: !!t.bus.det, door: +t.bus.door.toFixed(2), blink: t.bus.blink, d: Math.round(Math.hypot(t.x - A.V.x, t.z - A.V.z)), vis: t.mesh.visible })),
  people: () => PEOPLE.map(p => ({ st: p.st, x: Math.round(p.x), z: Math.round(p.z), vis: p.grp.visible })),
  /* следующая остановка автобуса i: где встать (для проверок и кадров) */
  nextStop: i => { const t = BUSES[i], b = t && t.bus, q = b && b.r && b.r.stops[b.si]; if (!q) return null; const [x, z] = edgePt(q.st.e, stopS(b, q), 0); return { x, z, bx: q.st.bx, bz: q.st.bz, n: q.st.n, k: q.k }; },
  force: { run: 0 },
  /* сколько рёбер открытой части достижимо от остановки i (проверка связности маршрутов) */
  reach: i => { const S = STOPS[i]; search([[S.ei, 0]], DIST, PREV, null, lockedE); let n = 0; for (let k = 0; k < EL.length; k++) if (Number.isFinite(DIST[k])) n++; return { n, open: EL.filter(e => !e.lock).length, name: S.n, lock: S.e.lock }; },
};
