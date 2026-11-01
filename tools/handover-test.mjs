/* №0п120: presentation ordering, duplicate delivery, pause and invalidated callbacks. */
import assert from 'node:assert/strict';
let now = 1000, seq = 0;
const timers = new Map();
globalThis.performance = { now: () => now };
globalThis.setTimeout = (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: now + ms }); return id; };
globalThis.clearTimeout = id => timers.delete(id);
const H = await import('../src/game/handover.js');
const Q = await import('../src/game/notifyq.js');
let alive = true, scene = false, paused = false, paid = 0, reserved = 0, landed = 0, given = 0, launched = 0, trunk = false;
let flights = [];
Q.init({ phase: () => paused || scene ? 'wait' : 'ride' });
H.init({ alive: () => alive, sceneBusy: () => scene,
  reserve: amount => { reserved += amount; return { amount, live: true }; },
  extend: (ticket, amount) => { ticket.amount += amount; reserved += amount; },
  settle: (ticket, visual) => { if (!ticket?.live) return; ticket.live = false; reserved -= ticket.amount; if (visual) landed += ticket.amount; },
  trunk: open => { trunk = open; }, reach: p => { p.reaching = true; }, lower: p => { p.reaching = false; }, hidePay: () => {},
  fly: (p, st, done) => { launched++; const f = { t: 0, done, cancelled: false }; flights.push(f); return () => { f.cancelled = true; }; },
});
function tick (duration, step = true) {
  for (let i = 0; i < Math.round(duration * 100); i++) {
    now += 10;
    for (const [id, tm] of [...timers]) if (tm.at <= now) { timers.delete(id); tm.fn(); }
    if (step && !paused) {
      for (const f of flights) if (!f.cancelled) { f.t += .01; if (f.t >= .6) { f.cancelled = true; f.done(); } }
      H.step(.01);
    }
  }
}
function begin (n = 1, pre = false) {
  let job;
  const list = Array.from({ length: n }, () => ({ ped: { grp: { parent: {} } }, pre, done: false, giveNow: () => { given++; } }));
  const stop = { list };
  job = H.begin({ stop, pin: { x: 12, z: 25 }, list, amount: 100, onPaid: () => { paid++; } });
  H.payment(job, done => { job.completePayment = done; });
  return { job, stop, list };
}
function reset () { H.cancel(); Q.clear(); tick(2); flights = []; alive = true; scene = false; }
const normal = begin(3);
assert.equal(H.pin().alpha, 1); assert.equal(trunk, false); assert.equal(H.cargo(), 3);
assert.equal(H.addPayment(normal.job, 0), false); assert.equal(H.addPayment(normal.job, -30), false);
assert.equal(H.addPayment(normal.job, 50), true);
tick(.2); assert.equal(trunk, false); assert(H.pin().alpha < 1);
tick(.1); assert.equal(trunk, true); assert.equal(launched, 0);
tick(.2); assert(normal.list.every(q => q.ped.reaching)); assert.equal(launched, 0);
tick(.3); assert(launched > 0); assert.equal(given, 0);
paused = true; const frozen = H.DEBUG.current.t; tick(3); assert.equal(H.DEBUG.current.t, frozen); assert.equal(given, 0);
paused = false; tick(2);
assert.equal(given, 3); assert.equal(trunk, false); assert.equal(H.DEBUG.current.phase, 'pay');
assert.equal(paid, 0); assert.equal(landed, 0); assert.equal(reserved, 150);
assert.equal(H.begin({ stop: normal.stop }), null);
normal.job.completePayment(); normal.job.completePayment();
assert.equal(paid, 1); assert.equal(landed, 150); assert.equal(reserved, 0);
assert.deepEqual(H.DEBUG.ST.events.filter(e => e.id === normal.job.id).map(e => e.phase), ['pin', 'trunk', 'flight', 'lower', 'pay', 'settled']);
reset();
const interrupted = begin(); H.addPayment(interrupted.job, 30); tick(.9); const old = flights.at(-1); assert(old);
alive = false; tick(.01); assert.equal(H.busy(), false); assert.equal(reserved, 0); assert.equal(trunk, false);
old.done(); assert.equal(given, 3); assert.equal(paid, 1); assert.equal(interrupted.list[0].ped.reaching, false);
reset();
const atDoor = begin(1, true); tick(2); assert.equal(given, 4); atDoor.job.completePayment(); assert.equal(paid, 2);
reset();
const closeup = begin(); closeup.list[0].external = true; scene = true; tick(1.5);
assert.equal(H.DEBUG.current.phase, 'flight');
H.caught(closeup.job, closeup.list[0]); tick(1); assert.equal(H.DEBUG.current.phase, 'lower');
scene = false; tick(.5); assert.equal(H.DEBUG.current.phase, 'pay'); assert(closeup.job.completePayment);
closeup.job.completePayment(); assert.equal(paid, 3);
reset();
const noStreetPed = begin(0); tick(2); assert(noStreetPed.job.completePayment); noStreetPed.job.completePayment(); assert.equal(paid, 4);
reset();
const urgent = begin(); tick(2.2); assert(urgent.job.completePayment);
let bossShown = 0;
Q.push({ kind: 'boss', ms: 100, show: () => { bossShown++; } });
Q.push({ kind: 'urgent', urgent: true, ms: 500, show: () => {} });
assert.equal(urgent.job.payStarted, false); assert.equal(bossShown, 0);
tick(1.2); assert.equal(urgent.job.payStarted, true); assert.equal(bossShown, 0);
urgent.job.completePayment(); tick(1); assert.equal(paid, 5); assert.equal(bossShown, 1);
reset();
const slow = begin();
for (let i = 0; i < 45; i++) { tick(1, false); H.step(.001); }
assert.equal(Q.showing(), 'pay'); assert(H.valid(slow.job));
H.cancel(); tick(.2); assert.equal(reserved, 0); assert.equal(paid, 5);
reset();
for (const resumeFirst of [false, true]) {
  const sleep = begin(); tick(.1); paused = true; tick(.2);
  now += 45000;
  if (resumeFirst) paused = false;
  for (const [id, tm] of [...timers]) if (tm.at <= now) { timers.delete(id); tm.fn(); }
  assert.equal(Q.showing(), 'pay', `sleep preserves slot: resumeFirst=${resumeFirst}`);
  paused = false; tick(2.5); assert(sleep.job.completePayment); sleep.job.completePayment();
  reset();
}
console.log(JSON.stringify({ ok: true, cases: 9, paid, given, launched, phases: H.DEBUG.ST.events }));
