/* Разные маршруты (17.10.2026, автор: «маршруты по заказам одни и те же практически… каждый маршрут не должен повторяться»).

   Адрес заказа выбирает orders.js (pickSpot: район, кольцо дальности, без повторов адреса). Здесь — из подходящих
   адресов оставить те, что ведут не туда же, куда недавние заказы:
   - сторона от пиццерии (сектор, ROUTEMIX.SEC по 45°) — не та, куда вели последние SEC_MEM заказов;
   - улица адреса (как в накладной: «улица Мира») — не из последних ST_MEM заказов;
   - улица, на которую выезжаешь к адресу (ближайшая дорога), — не из последних ROAD_MEM.
   Это штраф адресу (чем свежее повтор, тем больше, веса W): берётся адрес с самым маленьким штрафом. Нет адресов без
   повтора (в районе бывает всего 5—6 улиц в адресах) — тот, где повтор давнее всех.
   Сборный: так выбирается первый адрес; остальные — кучкой у первого, как выпало (они и так в разные стороны от него).
   Память — последние MEM заказов, и между сменами (сохранение dlv-route-mem), своя у каждой пиццерии.
   Числа — ROUTEMIX в econ.js, правила словами — docs/ORDERS.md «Разные маршруты». */
import { ROUTEMIX as M } from './econ.js';

const KEY = 'dlv-route-mem';
let A = null, MEM = [], SHIFT = [];

export function init (api) {
  A = api;
  const v = A.Store.get(KEY, []);
  MEM = Array.isArray(v) ? v.filter(e => e && typeof e === 'object').slice(-M.MEM) : [];
}
/* новая смена: журнал смены — заново (память между сменами остаётся) */
export function beginShift () { SHIFT = []; }

const pzKey = P => (P ? Math.round(P.x / 25) + ',' + Math.round(P.z / 25) : '');
/* сторона точки от центра c: 0…n−1, равные углы (пробовали «поровну адресов в каждой стороне» — повторов направления
   вдвое-втрое больше, а путь не короче) */
export function sectorOf (c, x, z, n = M.SEC) {
  const a = Math.atan2(z - c.z, x - c.x);
  return ((Math.floor((a + Math.PI) / (2 * Math.PI) * n)) % n + n) % n;
}
/* улица адреса (без номера дома) и улица ближайшей дороги — считаем раз на адрес пула */
const ST = new Map(), RS = new Map();
const ck = q => Math.round(q.x) + ',' + Math.round(q.z);
function street (q) {
  const k = ck(q);
  let v = ST.get(k);
  if (v === undefined) {
    const a = String((A.realAddress && A.realAddress(q.x, q.z)) || '');
    const i = a.lastIndexOf(',');
    v = (i > 0 ? a.slice(0, i) : a).trim();
    ST.set(k, v);
  }
  return v;
}
function road (q) {
  const k = ck(q);
  let v = RS.get(k);
  if (v === undefined) {
    const r = A.nearestRoad ? A.nearestRoad(q.x, q.z) : null;
    v = r ? r.seg.name || ('·' + Math.round((r.seg.x1 + r.seg.x2) / 60) + ',' + Math.round((r.seg.z1 + r.seg.z2) / 60)) : '';
    RS.set(k, v);
  }
  return v;
}

/* недавние заказы этой пиццерии: сначала память прошлых смен, потом эта смена (свежие — в конце) */
function recent (P) {
  const pk = pzKey(P);
  return MEM.filter(e => e.p === pk);
}

/* из подходящих адресов — те, что ведут в другую сторону и на другие улицы.
   o.P — пиццерия */
export function prefer (list, o = {}) {
  if (!list.length || !A || DEBUG.off) return list;
  const P = o.P || A.PIZZA;
  if (!P) return list;
  // берём адреса с самым маленьким штрафом (± 0,3), среди них — случайный
  const H = hist(recent(P));
  let lo = Infinity;
  const sc = list.map(q => { const p = score(q, P, H); if (p < lo) lo = p; return p; });
  return list.filter((q, i) => sc[i] <= lo + 0.3);
}

/* штраф адреса: сторона недавнего заказа, улица недавнего, выезд на улицу недавнего — чем свежее повтор, тем больше (W):
   повтор прошлого заказа — весь вес, давностью mem — 1/mem веса, давнее — 0 */
const hist = R => ({ sec: R.filter(e => e.s >= 0).map(e => e.s), sts: R.map(e => e.a), rds: R.map(e => e.r) });
const pen = (h, v, mem, w) => { const i = h.lastIndexOf(v); if (i < 0) return 0; const a = h.length - i; return a > mem ? 0 : w * (mem + 1 - a) / mem; };
const score = (q, P, H) => pen(H.sec, sectorOf(P, q.x, q.z), M.SEC_MEM, M.W.SEC) + pen(H.sts, street(q), M.ST_MEM, M.W.ST) + pen(H.rds, road(q), M.ROAD_MEM, M.W.ROAD);
/* штраф одного адреса (orders.js arcSpot: дальность «по дуге» и разнообразие — вместе) */
export function penalty (q, P) {
  if (!A || DEBUG.off) return 0;
  P = P || A.PIZZA;
  return P ? score(q, P, hist(recent(P))) : 0;
}

/* заказ выдан: запомнить, куда вёл (первый адрес — сторона; улицы — всех адресов) */
export function note (stops, P) {
  if (!A || !stops || !stops.length) return;
  P = P || A.PIZZA;
  if (!P) return;
  const pk = pzKey(P);
  stops.forEach((st, i) => {
    const e = { p: pk, s: i ? -1 : sectorOf(P, st.x, st.z), a: street(st), r: road(st) };
    MEM.push(e); SHIFT.push(e);
  });
  if (MEM.length > M.MEM) MEM.splice(0, MEM.length - M.MEM);
  A.Store.set(KEY, MEM);
}

/* отладка: __dlv.ORD.MIX; off = true — выбор как до 17.10.2026 (для замера «до / после») */
export const DEBUG = { off: false, get MEM () { return MEM; }, get SHIFT () { return SHIFT; }, sectorOf, prefer, penalty, street, road, clear () { MEM = []; SHIFT = []; if (A) A.Store.set(KEY, MEM); } };
