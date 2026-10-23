/* Сколько поручений за смену (docs/ORDERS.md «Поручения», 24.10.2026, автор: «ездить за чем-то в магазины надо чаще»):
   смены на автопилоте, через ntp с езды машину переносит к цели (вручений больше). Автопилот от поручений отказывается —
   «что нравится игроку» (likes.js) после каждой просьбы сбрасываем, чтобы отказы не делали просьбы реже (как у игрока,
   который соглашается через раз).
   --q=esecs=420&eshift=6&ewarp=3&ntp=25 (etrace=1 — счёт по заказам) → { shifts: [{ orders, asks, at: [номера заказов с просьбой], miss }], total } */
const q = new URLSearchParams(location.search);
const SECS = +(q.get('esecs') || 300), NSHIFT = +(q.get('eshift') || 6), WARP = +(q.get('ewarp') || 3), NTP = +(q.get('ntp') || 8);
if (d.Store) d.Store.set('dlv-shifts', NSHIFT);
const ERR = d.ORD.ERR;
const shifts = [];
let cur = null;
{ const mp = ERR.miss.push.bind(ERR.miss); ERR.miss.push = (...a) => { if (cur) cur.miss.push(String(a[0]).slice(0, 60)); return mp(...a); }; }   // почему не попросили — по сменам
const begin = async () => {
  await onShift(); autopilot(true); window.__warp = WARP;
  cur = { orders: 0, asks: 0, at: [], miss: [], log0: ERR.log.length };
};
const close = () => {
  if (!cur) return;
  cur.orders = d.ORD.SH.done || cur.orders;
  shifts.push({ orders: cur.orders, asks: cur.asks, at: cur.at, miss: cur.miss });
  cur = null;
};
await begin();
let tpKey = '', tpT = 0, apOff = 0, lastDone = -1;
const trace = [];
const t0 = Date.now();
while (Date.now() - t0 < SECS * 1000) {
  await wait(100);
  if (d.S.state === 'over' || d.S.state === 'title') { close(); await wait(1500); await begin(); continue; }
  if (cur && d.ORD.SH.done !== lastDone) { lastDone = d.ORD.SH.done; if (trace.length < 120) trace.push([shifts.length + 1, lastDone, ERR.since, ERR.due ? 1 : 0, ERR.gap, d.S.ride ? 'ride' : d.S.state]); }
  if (cur) {
    cur.orders = Math.max(cur.orders, d.ORD.SH.done || 0);
    const n = ERR.log.length - cur.log0;
    if (n > cur.asks) { cur.asks = n; cur.at.push(cur.orders); if (d.LIKES && d.LIKES.reset) d.LIKES.reset(); }
  }
  if (apOff && Date.now() > apOff) { apOff = 0; autopilot(true); }
  if (NTP && ['drive', 'back'].includes(d.S.state) && d.S.target) {
    const key = d.S.state + (d.S.order ? d.S.order.idx : '') + (d.S.delivered || 0);
    if (key !== tpKey) { tpKey = key; tpT = Date.now(); }
    else if (Date.now() - tpT > NTP * 1000 / WARP) {
      const V = d.V, x = d.S.target.x + 1.5, z = d.S.target.z + 1.5;
      V.x = x; V.z = z; V.vx = V.vz = 0; V.y = d.surfaceAt(x, z); V.camX = x - Math.sin(V.h) * 11; V.camZ = z - Math.cos(V.h) * 11; V.camY = V.y + 6;
      if (d.car) d.car.position.set(x, V.y, z);
      autopilot(false); apOff = Date.now() + 2000 / WARP; tpT = Date.now() + 4000 / WARP;
    }
  }
}
const part = cur ? { orders: cur.orders, asks: cur.asks, at: cur.at, miss: cur.miss, unfinished: true } : null;   // смена не кончилась — отдельно
autopilot(false); window.__warp = 1;
const full = shifts.filter(s => s.orders > 0).concat(part && part.orders >= 3 ? [part] : []);
const O = full.reduce((a, s) => a + s.orders, 0), N = full.reduce((a, s) => a + s.asks, 0);
return { shifts: full, part, total: { shifts: full.length, orders: O, asks: N, perOrder: O ? +(N / O).toFixed(2) : 0 }, dir: (d.DIRECTOR.log || []).filter(s => /errand/.test(s)).slice(-12), gap: ERR.gap, since: ERR.since, trace: q.get('etrace') ? trace : undefined };
