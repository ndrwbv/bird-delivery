/* Перекрытие на обратном пути (автор 12.10.2026, docs/CAREER.md «Перекрытие на обратном пути»).
   «Чтобы игрок не возвращался по одному и тому же пути — периодически загораживать проезды, где он проезжал».

   Помним куски улиц, по которым игрок ехал (последние BB.KEEP м). Вручил заказ (цель сменилась, машина у прежнего
   адреса) — после перекрытия пропускаем BB.GAP вручений (не два подряд, ~1 из 3—4), — ищем кусок его прошлого пути, по которому навигатор ведёт
   теперь (назад в пиццерию или к следующему адресу), в BB.MIN…BB.MAX м впереди по пути (охотнее ~BB.PREF), не ближе
   BB.MIN_D м по прямой, не у пиццерии и не у цели, не на глазах. Нашли — перекрываем: ремонт (щиты, яма — как ремонт
   roadlife.js), фура поперёк, ДТП (машины поперёк). Ставит roadlife.js closeBack — правила ремонта (объезд ≤ 1,4 км мимо
   других перекрытий и закрытых районов, не мост, не единственный выезд из тупика, не на месте видимой машины), трафик
   разворачивается, навигатор (полоса, радар, карта) объезжает — game.js roadPath по RL.NAVX, на радаре — красная черта.
   Держится BB.LIFE с; уехал дальше BB.FAR — срок вышел сразу; убирается, когда не на глазах (дальше 200 м и не в кадре).
   ?nobackblock — выключено. Отладка — __dlv.BACKB (ST — счётчики, LOG — где и что, force() — поставить сейчас). */
import * as RL from './roadlife.js';
import * as TEL from './telemetry.js';          // анонимная статистика: сколько перекрытий за смену (telemetry.js)

export const BB = {
  GAP: [2, 3],        // после перекрытия столько вручений подряд — без него (не два подряд: ~1 из 3—4 заказов)
  GAP0: [1, 2],       // в начале захода — столько вручений без перекрытия (дальше счёт идёт через смены)
  KEEP: 2000,         // сколько метров прошлого пути помним
  MIN: 85, MAX: 900, PREF: 260,    // где по пути навигатора, м от машины
  MIN_D: 75,          // и не ближе по прямой
  SEEN_D: 200,        // ближе — только не в кадре (дальше 200 м ремонт и так не рисуется, roadlife.js)
  PIZZA_R: 65,        // не ближе к пиццерии и к цели (и не сама улица пиццерии — выезд)
  WIN: 40,            // сколько секунд после вручения ищем место
  FAR: 650,           // уехал дальше — перекрытие доживает (уберётся, когда не на глазах)
  LIFE: [180, 240],   // сколько держится, с
  TRUCK_W: 14.6, CRASH_W: 11.2,    // фура и ДТП — только на улицах не шире (иначе ремонт)
  ROOM_WORKS: 17, ROOM: 12,        // сколько метров куска между перекрёстками нужно ремонту (щиты, яма) и фуре / ДТП
};
const OFF = typeof location !== 'undefined' && new URLSearchParams(location.search).has('nobackblock');
const ST = { orders: 0, calm: 0, gap: 0, tries: 0, none: 0, put: 0, works: 0, truck: 0, crash: 0, gone: 0 };
const WHY = { node: 0, notPast: 0, close: 0, pizza: 0, target: 0, seen: 0, room: 0, edge: 0 };   // почему кусок не подошёл (отладка)
const LOG = [];                                  // последние перекрытия: вид, где, на прошлом ли пути
const NONE = [];                                 // не нашлось места: сколько кусков помнили, сколько из них попалось на пути (отладка)
const BAD = new Set();                           // куски, где перекрытие не встало, — в этот поиск больше не пробуем
const PATH = [];                                 // { k, o } — кусок улицы (ребро без направления) и одометр въезда
const OWN = [];                                  // наши перекрытия (ремонты roadlife.js с bb)
let odo = 0, lx = NaN, lz = NaN, recT = 0, lastK = -1, prevT = null, gap = -1, pend = null, lastKind = '', forceKind = '', XAPI = null;

const ukey = (a, b) => (a < b ? a * 100000 + b : b * 100000 + a);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const irand = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));

function reset () {
  PZ_EDGES = null;
  PATH.length = 0; OWN.length = 0; odo = 0; lx = lz = NaN; lastK = -1; prevT = null; pend = null;   // gap — через смены: счёт заказов общий
}

/* кусок улицы под машиной — в память пути (ребро графа улиц, как у навигатора) */
function record (X) {
  const V = X.A.V, k = X.edgeAt(V.x, V.z);
  if (k < 0 || k === lastK) return;
  lastK = k;
  PATH.push({ k, o: odo });
  while (PATH.length && odo - PATH[0].o > BB.KEEP + 400) PATH.shift();
}

/* цель — клиент (не пиццерия) */
const isClient = (A, T) => !!T && !(A.PIZZA && T.x === A.PIZZA.x && T.z === A.PIZZA.z);

function delivered (A) {
  ST.orders++;
  if (A.calmStart && A.calmStart()) { ST.calm++; return; }            // учебная смена — без подлостей
  if (gap < 0) gap = irand(BB.GAP0);                                  // первое вручение смены
  if (gap > 0) { gap--; ST.gap++; return; }                           // не два заказа подряд, ~1 из 3—4
  const past = new Set();
  for (const p of PATH) if (odo - p.o <= BB.KEEP) past.add(p.k);
  pend = { t: 0, next: 1.2, past, ov: 0, tries: 0 };
  BAD.clear();
}

function nearPizza (X, x, z) {
  for (const P of X.PIZZERIAS) if (P && Math.hypot(P.x - x, P.z - z) < BB.PIZZA_R) return true;
  return false;
}
/* улица у пиццерии (выезд) — куски улиц, ближайшие к каждой пиццерии; считается раз */
let PZ_EDGES = null;
function pizzaEdge (A, X, k) {
  if (!PZ_EDGES) {
    PZ_EDGES = new Set();
    for (const P of X.PIZZERIAS) {
      if (!P) continue;
      const k = X.edgeAt(P.x, P.z, 60);
      if (k >= 0) PZ_EDGES.add(k);
    }
  }
  return PZ_EDGES.has(k);
}

/* вид перекрытия по ширине улицы; тот же, что в прошлый раз, — реже */
function kindFor (e) {
  const room = e.len - e.tA - e.tB, ok = [];
  if (room >= BB.ROOM_WORKS) ok.push('works');
  if (room >= BB.ROOM && e.w + 0.4 <= BB.TRUCK_W) ok.push('truck');
  if (room >= BB.ROOM && e.w + 0.4 <= BB.CRASH_W) ok.push('crash');
  if (forceKind) return ok.includes(forceKind) ? forceKind : '';
  if (!ok.length) return '';
  const fresh = ok.filter(k => k !== lastKind);
  return pick(fresh.length ? fresh : ok);
}

/* ищем кусок прошлого пути на пути навигатора впереди */
function tryPut (A, X, force) {
  const S = A.S, V = A.V, T = S.target, R = X.route;
  if (!T || !R || R.length < 3) return false;
  const end = R[R.length - 1];
  if (Math.hypot(end[0] - T.x, end[1] - T.z) > 40) return false;      // путь ещё к прежней цели
  ST.tries++;
  let pastSet = pend && pend.past;
  if (!pastSet) { pastSet = new Set(); for (const p of PATH) if (odo - p.o <= BB.KEEP) pastSet.add(p.k); }
  const cands = [];
  let acc = 0;
  for (let i = 0; i + 1 < R.length; i++) {
    const P = R[i], Q = R[i + 1], a0 = acc;
    acc += Math.hypot(Q[0] - P[0], Q[1] - P[1]);
    if (a0 > BB.MAX) break;
    if (a0 < BB.MIN) continue;
    const ia = A.NODE_IDX.get(P[0] + ',' + P[1]), ib = A.NODE_IDX.get(Q[0] + ',' + Q[1]);
    if (ia === undefined || ib === undefined) { WHY.node++; continue; }
    const past = pastSet.has(ukey(ia, ib));
    if (past && pend) pend.ov++;
    if (BAD.has(ukey(ia, ib))) continue;                              // уже не встало в этот раз
    if (!past && !force) { WHY.notPast++; continue; }
    const mx = (P[0] + Q[0]) / 2, mz = (P[1] + Q[1]) / 2, d = Math.hypot(mx - V.x, mz - V.z);
    if (d < BB.MIN_D) { WHY.close++; continue; }
    if (nearPizza(X, mx, mz) || pizzaEdge(A, X, ukey(ia, ib))) { WHY.pizza++; continue; }
    if (Math.hypot(mx - T.x, mz - T.z) < BB.PIZZA_R) { WHY.target++; continue; }
    if (d < BB.SEEN_D && X.inView(mx, mz)) { WHY.seen++; continue; }    // на глазах (ближе 200 м и в кадре) не появляется
    cands.push({ ia, ib, a0, d, past, pref: Math.abs(a0 - BB.PREF) + (past ? 0 : 1000) });
  }
  cands.sort((p, q) => p.pref - q.pref);
  for (const c of cands.slice(0, 6)) {
    const e = A.edgeOf(c.ia, c.ib);
    if (!e) continue;
    const kind = kindFor(e);
    if (!kind) { WHY.room++; BAD.add(ukey(c.ia, c.ib)); continue; }
    const W8 = RL.closeBack(A, c.ia, c.ib, { kind, room: kind === 'works' ? BB.ROOM_WORKS : BB.ROOM, t: rand(BB.LIFE[0], BB.LIFE[1]), nav: 1, build: kind === 'works' ? null : kind === 'truck' ? buildTruck : (ctx => buildCrash(ctx, X)) });
    if (!W8) { WHY.edge++; BAD.add(ukey(c.ia, c.ib)); continue; }
    OWN.push(W8);
    gap = irand(BB.GAP); lastKind = kind; pend = null;
    ST.put++; ST[kind]++;
    const r = e.road;
    TEL.count('block');
    LOG.push({ kind, ord: ST.orders, a0: Math.round(c.a0), d: Math.round(c.d), past: c.past, x: Math.round(W8.x), z: Math.round(W8.z), road: r ? (typeof r === 'string' ? r : r.n || '') : '', w: +e.w.toFixed(1) });
    if (LOG.length > 30) LOG.shift();
    X.reroute();
    return true;
  }
  return false;
}

export function step (dt, X) {
  const A = X.A;
  XAPI = X;
  if (OFF || !A) return;
  const S = A.S, V = A.V, st = S.state;
  if (st === 'title' || st === 'over') { CARQ.length = 0; if (PATH.length || OWN.length || prevT) reset(); return; }
  if (S.ride) { prevT = S.target; return; }                          // просто катаемся — без заказов
  // одометр (прыжки — воскрес, перенесло — не считаем)
  if (lx === lx) { const dx = V.x - lx, dz = V.z - lz, d = Math.sqrt(dx * dx + dz * dz); if (d < 60) odo += d; }
  lx = V.x; lz = V.z;
  const live = st === 'drive' || st === 'back' || st === 'side' || st === 'handover';
  if (live && (recT -= dt) <= 0) { recT = 0.25; record(X); }
  // вручил: цель сменилась, машина у прежнего адреса
  const T = S.target;
  if (T !== prevT) {
    if (prevT && T && isClient(A, prevT) && (st === 'back' || st === 'drive') && Math.hypot(V.x - prevT.x, V.z - prevT.z) < 90) delivered(A);
    prevT = T;
  }
  if (CARQ.length) crashCar(A, X);                                    // машины ДТП — по одной за кадр
  if (pend) {
    pend.t += dt;
    if (pend.t > BB.WIN || !T || !live) { ST.none++; NONE.push({ ord: ST.orders, past: pend.past.size, ov: pend.ov, tries: pend.tries }); if (NONE.length > 20) NONE.shift(); pend = null; }
    else if ((pend.next -= dt) <= 0) { pend.next = 1; pend.tries++; tryPut(A, X, false); }
  }
  // наши перекрытия: уехал далеко — срок вышел (roadlife.js уберёт, когда не на глазах)
  for (let i = OWN.length - 1; i >= 0; i--) {
    const W8 = OWN[i];
    if (!RL.DEBUG.WORKS.includes(W8)) { OWN.splice(i, 1); ST.gone++; continue; }
    if (W8.t > 0 && Math.hypot(W8.x - V.x, W8.z - V.z) > BB.FAR) W8.t = 0;
  }
}

/* ── виды ──
   ctx (roadlife.js spawnWorks): P(a, o) — точка в a м вдоль улицы от середины перекрытия и o м поперёк; W — ширина
   полотна; L — склейка (box(L, поперёк, высота, вдоль, цвет, x, y, z, ryA)), FL — мигалки, solids — твёрдое,
   reach(0, s) — докуда тротуар в сторону s (до дома или чужой улицы), men — люди (still — стоят), cone(x, z) — конус. */

/* лента «не проходить» на тротуарах — от края перекрытия до дома: проехать по тротуару нельзя */
function tapeSides (ctx, from) {
  const { A, P, nx, nz, ryA, L, solids, reach } = ctx;
  for (const s of [-1, 1]) {
    const o1 = reach(0, s);
    if (o1 <= from + 0.4) continue;
    const len = o1 - from, np = Math.max(1, Math.round(len / 2));
    for (let i = 0; i <= np; i++) {
      const [x, z] = P(0, (from + i * len / np) * s), y = A.groundH(x, z) + A.curbAt(x, z);
      A.box(L, 0.09, 1.05, 0.09, i % 2 ? '#f2eee6' : '#d9342c', x, y + 0.52, z, ryA);
    }
    const ns = Math.max(2, Math.round(len / 0.9));
    for (let i = 0; i < ns; i++) {
      const [x, z] = P(0, (from + (i + 0.5) * len / ns) * s), y = A.groundH(x, z) + A.curbAt(x, z);
      A.box(L, len / ns, 0.08, 0.03, i % 2 ? '#f2eee6' : '#d9342c', x, y + 0.95, z, ryA);
    }
    const [mx, mz] = P(0, (from + len / 2) * s);
    solids.push(A.obb(mx, mz, len / 2 + 0.2, 0.3, Math.atan2(nz, nx)));
  }
}

/* человек стоит у перекрытия лицом к (fx, fz) */
function stand (ctx, x, z, fx, fz, o) {
  const { A, men } = ctx;
  const grp = A.makeHuman(null, o);
  grp.rotation.y = Math.atan2(fx - x, fz - z);
  grp.position.set(x, A.groundH(x, z) + A.curbAt(x, z), z);
  A.scene.add(grp);
  men.push({ grp, x, z, ph: 0, dead: 0, still: 1 });
}

const TRUCK_HEX = ['#2f6db5', '#c8322b', '#e8e4dc', '#2f7d4a', '#e0a526'];
const TRAILER_HEX = ['#dcd8cf', '#9aa3ad', '#2f6db5', '#e8e4dc'];
/* фура встала поперёк: тягач и полуприцеп на всё полотно, аварийка, конусы, водитель у кабины, лента на тротуарах */
function buildTruck (ctx) {
  const { A, P, W, nx, nz, ryA, L, FL, solids, HL } = ctx;
  const T = W + 0.6, cab = 2.6, TL = T - cab - 0.3, side = Math.random() < 0.5 ? 1 : -1;
  const oc = side * (T / 2 - cab / 2), ot = -side * (cab + 0.3) / 2;
  const [cx0, cz0] = P(0, 0), y0 = A.groundH(cx0, cz0);
  const at = (a, o, y, w, h, d, hex, list = L) => { const [x, z] = P(a, o); A.box(list, w, h, d, hex, x, y0 + y, z, ryA); };
  const cabHex = pick(TRUCK_HEX), trHex = pick(TRAILER_HEX);
  // полуприцеп
  at(0, ot, 2.55, TL, 2.7, 2.5, trHex);
  at(0, ot, 2.0, TL - 0.8, 0.42, 2.54, cabHex);                     // полоса по борту
  at(0, ot, 1.05, TL, 0.32, 2.1, '#2b2a30');                         // рама
  for (const k of [1.2, 2.5]) for (const a of [-1.02, 1.02]) at(a, -side * (T / 2 - k), 0.52, 1.04, 1.04, 0.42, '#1b1b1f');
  at(0, ot + side * (TL / 2 - 1.6), 0.6, 0.12, 1.0, 1.6, '#585460');  // опоры полуприцепа
  // тягач
  at(0, oc, 1.65, cab - 0.25, 2.1, 2.45, cabHex);
  at(0, oc - side * 0.45, 2.95, 1.1, 0.55, 2.3, cabHex);              // обтекатель на крыше
  at(0, oc + side * (cab / 2 - 0.12), 2.05, 0.06, 0.85, 2.15, '#22303c');   // лобовое
  at(0, oc + side * (cab / 2 - 0.12), 1.0, 0.06, 0.7, 1.6, '#2b2a30');      // решётка
  at(0, oc + side * (cab / 2), 0.5, 0.26, 0.32, 2.5, '#3a3a40');           // бампер
  for (const a of [-1.02, 1.02]) at(a, oc - side * 0.2, 0.52, 1.04, 1.04, 0.42, '#1b1b1f');
  for (const a of [-1.24, 1.24]) at(a, oc + side * 0.6, 2.0, 0.3, 0.4, 0.06, '#2b2a30');   // зеркала
  // аварийка: углы тягача и полуприцепа (мигают)
  for (const a of [-0.95, 0.95]) at(a, oc + side * (cab / 2 + 0.02), 0.82, 0.06, 0.18, 0.32, '#ffb020', FL);
  for (const a of [-1.1, 1.1]) at(a, -side * (T / 2 + 0.02), 1.15, 0.06, 0.16, 0.22, '#ff8a00', FL);
  solids.push(A.obb(cx0, cz0, T / 2, 1.32, Math.atan2(nz, nx)));
  tapeSides(ctx, T / 2);
  for (const k of [-1, 1]) for (const o of [-0.25, 0.25]) ctx.cone(...P((HL + 1.5) * k, o * W));
  // водитель у кабины, смотрит на фуру
  const [dx, dz] = P(side > 0 ? 2.4 : -2.4, oc + side * 0.6);
  stand(ctx, dx, dz, cx0, cz0, { cap: '#3a3a40', shirt: '#4a6b8a', pants: '#2f3540' });
}

/* ДТП поперёк: две-три машины потока боком на всё полотно, побитые, капоты подняты, аварийка; водители стоят у
   тротуара; лента на тротуарах. Машины — настоящие (TRAFFIC: можно растолкать, поджечь), уходят вместе с перекрытием */
function buildCrash (ctx, X) {
  const { A, P, W, nx, nz, HL, W8 } = ctx;
  const n = W > 8.4 ? 3 : 2, cars = [];
  // машины — по одной за кадр (полная модель с мятинами — 1—3 мс на машину, на Деке втрое дольше; как авария в game.js)
  for (let i = 0; i < n; i++) {
    const o = -W / 2 + (i + 0.5) * W / n, a = (i % 2 ? 0.9 : -0.9) + rand(-0.3, 0.3), [x, z] = P(a, o);
    const flip = Math.random() < 0.5 ? 1 : -1, jit = rand(0.15, 0.4) * (i % 2 ? 1 : -1);
    CARQ.push({ W8, cars, i, x, z, h: Math.atan2(nx * flip, nz * flip) + jit });
  }
  W8.onGone = () => {
    for (let k = CARQ.length - 1; k >= 0; k--) if (CARQ[k].W8 === W8) CARQ.splice(k, 1);
    for (const t of cars) if (!t.gone && A.TRAFFIC.includes(t)) X.svcGone(t);
  };
  tapeSides(ctx, W / 2);
  for (const k of [-1, 1]) for (const o of [-0.3, 0.3]) ctx.cone(...P((HL + 1.5) * k, o * W));
  // водители — у тротуара, друг напротив друга
  const [fx, fz] = P(rand(-2, 2), W / 2 + 1.6);
  for (const s of [-1, 1]) { const [x, z] = P(s * 0.8, W / 2 + 1.6); stand(ctx, x + (fx - x) * 0.1, z + (fz - z) * 0.1, fx, fz); }
}
/* одна машина ДТП из очереди — за кадр */
const CARQ = [];
function crashCar (A, X) {
  const q = CARQ.shift(), t = X.newCar(false);
  t.taxi = false; t.parked = true; t.accident = 1;
  t.x = q.x; t.z = q.z; t.h = q.h;
  t.gy = undefined;
  A.scene.add(t.mesh);
  X.poseOnSlope(t);
  X.fullCar(t);                                     // полная модель — мнётся
  const hx = Math.sin(t.h), hz = Math.cos(t.h);
  X.dentCar(t.mesh, t.x + hx * 2, t.z + hz * 2, 22);
  if (q.i) X.dentCar(t.mesh, t.x - hz * 1, t.z + hx * 1, 18);
  const h = t.mesh.userData.hood;
  if (h && q.i !== 1) { const k = rand(0.7, 1.05); h.m.rotation.x = -k; h.m.position.y = h.y + Math.sin(k) * h.len / 2; h.m.position.z = h.z - h.len / 2 + Math.cos(k) * h.len / 2; }
  for (const m of t.mesh.userData.hazard || []) m.visible = true;
  t.hp = 70;
  A.TRAFFIC.push(t);
  q.cars.push(t);
}

/* для отладки: __dlv.BACKB — force(вид) ставит перекрытие на пути навигатора сейчас (можно и не на прошлом пути) */
export const DEBUG = {
  BB, ST, LOG, PATH, OWN, WHY, NONE,
  get odo () { return odo; }, get pend () { return pend; },
  pastHas: (a, b) => PATH.some(p => p.k === ukey(a, b)),
  force: kind => { if (!XAPI || !XAPI.A) return false; forceKind = kind || ''; BAD.clear(); const ok = tryPut(XAPI.A, XAPI, true); forceKind = ''; return ok; },
};
