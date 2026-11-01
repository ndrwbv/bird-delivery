/* №15а: removing destruction conversations must preserve daily-task counters. */
import assert from 'node:assert/strict';
import * as HAV from '../src/game/havoc.js';
const S = { people: 2, scoots: 1, stops: 3 };
HAV.init({ S, adult: true });
for (const kind of ['bench', 'lamp', 'light', 'sign', 'fence', 'bigfence', 'bin', 'sandbox']) HAV.smash(kind);
const car = {};
HAV.carHit(car, 8); HAV.carHit(car, 8.01); HAV.carHit(car, 30);
assert.deepEqual(HAV.counts(), { people: 3, car: 1, stop: 3, bench: 1, post: 3, fence: 2, bin: 1, other: 1 });
S.people++; S.stops++;
assert.equal(HAV.counts().people, 4); assert.equal(HAV.counts().stop, 4);
HAV.reset();
assert.equal(HAV.counts().car, 0); assert.equal(HAV.counts().bench, 0); assert.equal(HAV.counts().other, 0);
HAV.carHit(car, 12);
assert.equal(HAV.counts().car, 1, 'same car counts again in a new shift');
assert.equal(HAV.deliver, undefined); assert.equal(HAV.line, undefined);
console.log(JSON.stringify({ ok: true, counters: HAV.counts(), dialogue: false }));
