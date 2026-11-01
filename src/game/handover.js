/* Presentation only: the authoritative payment has already happened in checkArrival.
   One queue item protects the entire handover, including the SAME cash pile flying to the HUD.
   All clocks are game-frame clocks; cancellation invalidates flight/scene callbacks. */
import * as NQ from './notifyq.js';

let A, current = null, seq = 0;
const seen = new WeakSet();
const ST = { started: 0, paid: 0, cancelled: 0, events: [] };
const event = (j, phase) => { j.phase = phase; j.t = 0; ST.events.push({ id: j.id, phase }); if (ST.events.length > 80) ST.events.shift(); };
export function init (api) { A = api; }
export function begin (o) {
  if (!A || seen.has(o.stop)) return null;
  cancel(); seen.add(o.stop);
  const j = current = { ...o, id: ++seq, live: true, phase: '', t: 0, shown: false, payStarted: false, item: null };
  j.cash = A.reserve(o.amount); ST.started++; event(j, 'pin');
  j.item = NQ.push({ kind: 'pay', manual: true, cut: true, once: false, fresh: 1000, wait: 120,
    key: 'handover:' + j.id, text: '', stale: () => !j.live,
    show: () => { j.shown = true; }, hide: () => { j.shown = false; j.payStarted = false; A.hidePay(); },
    drop: () => { if (j.live) cancel(); } });
  return j;
}
export function valid (j) { return !!(j && j.live && current === j); }
export function caught (j, q) { if (!valid(j) || q.done) return false; q.done = true; q.giveNow(); return true; }
export function payment (j, show) { if (valid(j)) j.showPay = show; }
/* Independent completion bonus already exists in the ledger: merge its VISUAL delta,
   never charge/grant it again, and never create a second pile for zero/negative deltas. */
export function addPayment (j, amount) {
  if (!valid(j) || !(amount > 0)) return false;
  A.extend(j.cash, amount); j.amount += amount; return true;
}
export function step (dt) {
  const j = current;
  if (!j) return;
  if (!A.alive()) { cancel(); return; }
  NQ.touch(j.item);
  if (j.phase === 'pin' && !j.shown) return;       // wait for the old brief/overlay to leave before starting the visible chain
  j.t += dt;
  if (j.phase === 'pin' && j.t >= 0.28) {
    event(j, 'trunk');
    if (j.list.some(q => !q.pre && !q.external)) A.trunk(true);
  } else if (j.phase === 'trunk') {
    if (j.t >= 0.15) for (const q of j.list) if (!q.done && !q.pre && !q.external) A.reach(q.ped);
    if (j.t >= 0.4) event(j, 'flight');
  } else if (j.phase === 'flight') {
    j.list.forEach((q, i) => {
      if (q.done || q.external || q.fired || j.t < i * 0.22) return;
      q.fired = true;
      if (q.ped.dead || !q.ped.grp?.parent) { q.done = true; A.lower(q.ped); return; }
      if (q.pre) caught(j, q);
      else q.flight = A.fly(q.ped, j.stop, () => caught(j, q));
    });
    if (j.list.every(q => q.done)) { A.trunk(false); event(j, 'lower'); }
  } else if (j.phase === 'lower' && j.t >= 0.65 && !A.sceneBusy()) event(j, 'pay');
  if (j.phase === 'pay' && !j.payStarted && j.showPay && j.shown && NQ.showing() === 'pay' && !A.sceneBusy()) {
    j.payStarted = true;
    j.showPay(() => {
      if (!valid(j)) return;
      A.settle(j.cash, true); j.cash = null;
      j.live = false; current = null; event(j, 'settled'); ST.paid++;
      A.hidePay(); NQ.done(j.item);
      if (j.onPaid) j.onPaid();
    });
  }
}
export function cancel () {
  const j = current;
  if (!j) return;
  current = null; j.live = false; ST.cancelled++;
  if (A.cancelScene) A.cancelScene(j.list);
  for (const q of j.list) { if (q.flight) q.flight(); A.lower(q.ped); }
  A.trunk(false); if (j.shown) A.hidePay(); A.settle(j.cash, false);
  // Cancel only this owned item; do not pump an old manager callback during a lifecycle transition.
  NQ.cancel(j.item);
}
export const busy = () => !!current;
export const handling = () => !!current;          // do not open the next order's brief over the still-flying cash
export const cargo = () => {
  if (!current) return 0;
  const waiting = current.list.filter(q => !q.done && !q.fired && !q.external && !q.pre).length;
  return waiting ? current.stop.boxes > 1 ? current.stop.boxes : waiting : 0;
};
export const pin = () => current ? { ...current.pin, alpha: current.phase === 'pin' ? Math.max(0, 1 - current.t / 0.28) : 0 } : null;
export const DEBUG = {
  ST, cancel, get current () { const j = current; return j ? { id: j.id, phase: j.phase, t: j.t, n: j.list.length, caught: j.list.filter(q => q.done).length, shown: j.shown } : null; },
  get flights () { return current ? current.list.filter(q => q.flight?.data && !q.done).map(q => {
    const f = q.flight.data;
    return { from: f.from, target: f.aim, position: { x: f.g.position.x, y: f.g.position.y, z: f.g.position.z }, t: f.t };
  }) : []; },
};
