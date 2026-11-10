/* Integration only. The field owns snow; the game continues to own vehicles,
   terrain, collision and weather. No snow height is fed back into groundH. */
import { createSnowSurfaces } from './surfaces.js';
import { createSnowField } from './field.js';
import { createSnowContacts } from './contacts.js';
import { createSnowSuspension } from './suspension.js';
import { createSnowRenderer } from './render.js';
import { createSnowObjects, captureBenches as captureBenchReceivers } from './objects.js';

export const enabled = typeof location !== 'undefined' && new URLSearchParams(location.search).get('snowv2') !== '0';
export function captureBenches(benches) { if (enabled) captureBenchReceivers(benches); }
let A, surfaces, field, contacts, view, objects;
const resolved = {}, sampled = {}, gripSample = {}, playerOptions = { id: 'player', gas: false, brake: false, hand: false, grounded: true };
const weather = {}, draw = {}, objectDraw = {}, npcV = {}, npcOptions = { id: '', grounded: true, gas: false, load01: 0.8 };
const gripOut = { soft: 0, sand: 0, rut: 0, snow: 0 };
const feet = new WeakMap(), identities = new WeakMap();
let identity = 0, npcClock = 0, npcContacts = null, ready = false, snowAmount = 0, profile;
const courier = { x: NaN, z: NaN, side: -1 };
const suspension = createSnowSuspension((x, z, y) => {
  surfaces.resolve(x, z, y, undefined, resolved);
  if (!resolved.valid) return 0;
  field.sample(resolved.surfaceId, x, z, sampled);
  return sampled.valid ? sampled.supportY - sampled.baseY : 0;
});
export function vehicleSupport(V, car, dt, active = true) {
  return suspension(V, car, dt, active && ready && snowAmount > 0.01);
}
const idOf = p => { let id = identities.get(p); if (!id) { id = `npc-${++identity}`; identities.set(p, id); } return id; };
export const ST = { on: enabled, ready: false, surfaceId: 0, playerContacts: 0, hullContacts: 0, objectContacts: 0, npcContacts: 0, steps: 0, ms: 0,
  cpuBytes: 0, gpuBytes: 0, triangles: 0, uploadBytes: 0 };

export function init(api) {
  if (!enabled || A) return;
  A = api;
  surfaces = createSnowSurfaces(api);
  field = createSnowField({ initial: surfaces.initial });
  contacts = createSnowContacts({ field, resolveSurface: surfaces.resolve });
  view = createSnowRenderer({ scene: api.scene, field, surfaces });
  field.setProtection?.((id, tx, tz) => view.hasNearTile(id, tx, tz));
  objects = createSnowObjects({ scene: api.scene, onShed: api.onShed });
  for (const material of view.materials) api.material?.(material);
}
function refreshProfile () {
  const next = A.profile();
  if (profile !== undefined && next !== profile) {
    // The authored profile can replace the drift geometry. Snowfall and
    // thaw within the same profile keep the existing snowpack.
    field.reset(); contacts.reset(); npcContacts = null; npcClock = 0;
    surfaces.invalidate(); view.invalidate();
  }
  profile = next;
}
// Build the starting footprint while the city is still or behind a curtain.
export function* prepare() {
  if (!A || A.snowAmount() <= 0.015) return;
  snowAmount = A.snowAmount(); refreshProfile();
  surfaces.refresh(); surfaces.setFocus(A.V.x,A.V.z);
  field.setWeather({snowAmount, snowfall:A.snowfall(), thaw:A.thaw(), wetness:A.wetness(), wind:A.wind()});
  surfaces.resolve(A.V.x,A.V.z,A.V.y,undefined,resolved);
  const state = {x:A.V.x,z:A.V.z,surfaceId:resolved.surfaceId,snowAmount,dt:0,preparing:true};
  do { view.update(state); yield 'снег перед выездом'; } while (view.stats.pending);
}
export function hit(root, strength) { if (ready && snowAmount > 0.01) objects.hit(root, strength); }
export function press(object, x, z, amount = 1) { if (ready && snowAmount > 0.01) objects.press?.(object, x, z, amount); }
export function body(x, z, y, heading = 0) {
  if (!ownsSurface(x, z, y)) return;
  surfaces.resolve(x, z, y, undefined, resolved);
  if (!resolved.valid) return;
  contacts.body({ surfaceId: resolved.surfaceId, from: { x, z }, to: { x, z }, heading });
}
// A moving prop presses once at the actual point of contact. Falling pieces
// can rest on the resulting dent, including on an elevated receiver.
export function objectImpact(x, z, y, heading, width, length, force) {
  if (!ready || !snowAmount || !A.live() || Math.abs(x - A.V.x) > 56 || Math.abs(z - A.V.z) > 56) return y;
  surfaces.resolve(x, z, y, undefined, resolved);
  if (!resolved.valid) return y;
  const id = resolved.surfaceId;
  field.sample(id, x, z, sampled);
  if (!sampled.valid || !sampled.deformable || sampled.thickness < 0.014
    || y > sampled.topY + 0.12 || y < sampled.baseY - 0.4) return y;
  const drop = contacts.body({ kind: 'object', surfaceId: id, from: { x, z }, to: { x, z }, heading, width, length,
    load01: Math.min(1, 0.28 + Math.max(0, force) * 0.09), dt: 0.15 });
  if (!drop.changed) return y;
  ST.objectContacts++;
  field.sample(id, x, z, sampled);
  return Math.max(sampled.baseY, sampled.topY);
}

// Called by the existing on-foot delivery animation. A footfall is distance
// based, so a standing courier and a paused animation never dig a pit.
export function foot(x, z, y) {
  if (!ready || !snowAmount) return;
  const dx = x - courier.x, dz = z - courier.z, d = Math.hypot(dx, dz);
  if (!Number.isFinite(d) || d > 3) { courier.x = x; courier.z = z; return; }
  if (d < 0.48) return;
  courier.x = x; courier.z = z;
  if (!ownsSurface(x, z, y)) return;
  const heading = Math.atan2(dx, dz), side = courier.side = -courier.side;
  contacts.foot({ id: 'courier', x: x + Math.cos(heading) * side * 0.1,
    z: z - Math.sin(heading) * side * 0.1, y, heading, dt: 0.15 });
  ST.steps++;
}
export function owns(x, z, y) { return !!(ready && snowAmount > 0.01 && view.contains(x, z, y)); }
export function ownsSurface(x, z, previousY) {
  if (!ready || !snowAmount) return false;
  surfaces.resolve(x, z, previousY, undefined, resolved);
  return resolved.valid && snowAmount > 0.01;
}
export function support(x, z, previousY, bare) {
  if (!ready) return bare;
  surfaces.resolve(x, z, previousY, undefined, resolved);
  if (!resolved.valid || !owns(x, z, resolved.baseY)) return bare;
  field.sample(resolved.surfaceId, x, z, sampled);
  // Bearing depth is capped so a soft multi-metre snowbank is not a ramp.
  return sampled.valid ? Math.max(bare, Math.min(sampled.supportY, bare + 0.16)) : bare;
}
export function top(x, z, previousY, fallback = -Infinity) {
  if (!ready) return fallback;
  surfaces.resolve(x, z, previousY, undefined, resolved);
  if (!resolved.valid || !owns(x, z, resolved.baseY)) return fallback;
  field.sample(resolved.surfaceId, x, z, sampled);
  return sampled.valid ? sampled.topY : fallback;
}
export function grip(V, car) {
  gripOut.soft = gripOut.sand = gripOut.rut = gripOut.snow = 0;
  if (!ready || V.air || V.wade || V.sink !== undefined || !snowAmount) return gripOut;
  const fx = Math.sin(V.h), fz = Math.cos(V.h);
  const wheels = car?.userData?.wheels;
  for (let i = 0; i < 4; i++) {
    const p = wheels?.[i]?.parent?.position || wheels?.[i]?.position;
    const local = p && Number.isFinite(p.x) && Number.isFinite(p.z) && Math.abs(p.x) > 0.2 && Math.abs(p.x) <= 3 && Math.abs(p.z) <= 5;
    const side = local ? p.x : (i % 2 ? 0.89 : -0.89), fore = local ? p.z : (i < 2 ? 1.4 : -1.45);
    const x = V.x + fz * side + fx * fore, z = V.z - fx * side + fz * fore;
    surfaces.resolve(x, z, V.y, undefined, resolved);
    if (!resolved.valid) continue;
    field.sample(resolved.surfaceId, x, z, gripSample);
    if (!gripSample.valid) continue;
    gripOut.soft += Math.min(1, (gripSample.looseDepth || 0) / 0.18) * (1 - gripSample.compaction) * 0.25;
    gripOut.sand += (gripSample.sand || 0) * 0.25;
    gripOut.snow += Math.min(1, gripSample.thickness / 0.025) * 0.25;
    const align = Math.abs(Math.cos(V.h - (gripSample.heading || 0)));
    gripOut.rut += (gripSample.rut || 0) * Math.max(0, (align - 0.8) * 5) * (1 - (gripSample.ice || 0)) * 0.25;
  }
  return gripOut;
}
function nearbyContacts(dt) {
  npcClock += dt;
  if (!npcContacts) {
    if (npcClock < 0.1) return;
    npcContacts = nearbyContactBatch(Math.min(0.25, npcClock));
    npcClock = 0;
  }
  const until = performance.now() + 1.2;
  do {
    if (npcContacts.next().done) { npcContacts = null; return; }
  } while (performance.now() < until);
}

function* nearbyContactBatch(elapsed) {
  const V = A.V;
  let cars = 0;
  for (const t of A.traffic()) {
    if (cars >= 12) break;
    if (t.gone || !t.mesh || Math.abs(t.x - V.x) > 16 || Math.abs(t.z - V.z) > 16 || Math.abs(t.speed || 0) < 0.1) continue;
    if (!ownsSurface(t.x, t.z, t.y)) continue;
    npcV.x = t.x; npcV.z = t.z; npcV.y = t.y; npcV.h = t.h;
    npcV.vx = Math.sin(t.h) * t.speed; npcV.vz = Math.cos(t.h) * t.speed;
    npcV.air = false; npcV.wade = false; npcV.sink = undefined;
    npcOptions.id = idOf(t); npcOptions.halfLength = t.hl;
    contacts.vehicle(npcV, t.mesh, elapsed, npcOptions); cars++; ST.npcContacts++;
    yield;
  }
  let people = 0;
  for (const list of A.walkers()) for (const p of list) {
    if (people >= 24) break;
    const group = p.grp || p.mesh;
    if (!group || !group.visible || p.fall || p.dead || !Number.isFinite(p.x) || !Number.isFinite(p.z)
      || Math.abs(p.x - V.x) > 16 || Math.abs(p.z - V.z) > 16) continue;
    const y = group.position.y;
    if (!ownsSurface(p.x, p.z, y)) continue;
    let last = feet.get(p);
    if (!last) { last = { x: p.x, z: p.z, side: -1 }; feet.set(p, last); continue; }
    const d = Math.hypot(p.x - last.x, p.z - last.z);
    if (d < 0.48) continue;
    if (d > 3) { last.x = p.x; last.z = p.z; continue; }
    const heading = Math.atan2(p.x - last.x, p.z - last.z), side = last.side = -last.side;
    const x = p.x + Math.cos(heading) * side * 0.1, z = p.z - Math.sin(heading) * side * 0.1;
    surfaces.resolve(x, z, y, undefined, resolved);
    if (resolved.valid) {
      contacts.foot({ id: idOf(p), surfaceId: resolved.surfaceId, x, z, y, heading, dt: 0.15, load01: 0.45 });
      ST.steps++; people++;
    }
    last.x = p.x; last.z = p.z;
    if (resolved.valid) yield;
  }
}
export function step(dt, visualDeadline = Infinity) {
  if (!A || !A.ready()) return;
  const started = performance.now();
  ready = ST.ready = true;
  refreshProfile();
  snowAmount = A.snowAmount();
  weather.snowAmount = snowAmount; weather.snowfall = A.snowfall();
  weather.thaw = A.thaw(); weather.wetness = A.wetness(); weather.wind = A.wind();
  field.setWeather(weather); field.setFocus(A.V.x, A.V.z); surfaces.setFocus(A.V.x, A.V.z);
  surfaces.refresh();
  surfaces.resolve(A.V.x, A.V.z, A.V.y, ST.surfaceId, resolved);
  ST.surfaceId = resolved.surfaceId;
  const contactStarted = performance.now();
  if (A.live() && snowAmount > 0.01) {
    const V = A.V;
    playerOptions.gas = !!A.IN.gas; playerOptions.brake = !!A.IN.brake; playerOptions.hand = !!A.IN.hand;
    playerOptions.grounded = !V.air && !V.wade && V.sink === undefined && !A.flying() && resolved.valid;
    playerOptions.onSpray = A.spray;
    const contact = contacts.vehicle(V, A.car(), dt, playerOptions);
    if (playerOptions.grounded) ST.playerContacts++;
    if (contact.hullChanged) ST.hullContacts++;
    if (contact.bankDrag > 0) {
      const keep = 1 - contact.bankDrag;
      V.vx = V.vx * keep + Math.cos(V.h) * contact.bankPush;
      V.vz = V.vz * keep - Math.sin(V.h) * contact.bankPush;
    }
    nearbyContacts(dt);
  } else { contacts.clearEntity('player'); npcContacts = null; npcClock = 0; }
  field.step(dt);
  const viewStarted = performance.now();
  draw.vx = A.V.vx; draw.vz = A.V.vz; draw.visualDeadline = visualDeadline;
  draw.x = A.V.x; draw.z = A.V.z; draw.surfaceId = ST.surfaceId; draw.snowAmount = snowAmount; draw.dt = dt;
  view.update(draw);
  const objectsStarted = performance.now();
  objectDraw.player = A.car(); objectDraw.vehicles = A.traffic();
  objectDraw.benches = A.benches; objectDraw.canopies = A.canopies;
  objectDraw.x = A.V.x; objectDraw.z = A.V.z; objectDraw.snowAmount = snowAmount;
  objectDraw.playerSnow = A.carSnow(); objectDraw.wetness = weather.wetness; objectDraw.dt = dt;
  objects.update(objectDraw);
  ST.cpuBytes = field.stats.bytes + surfaces.stats.cacheBytes + view.stats.cpuBytes + (objects.stats.cpuBytes || objects.stats.bytes);
  ST.gpuBytes = view.stats.gpuBytes + (objects.stats.gpuBytes || 0);
  ST.triangles = view.stats.triangles + objects.stats.triangles;
  ST.uploadBytes = view.stats.uploadBytes + objects.stats.uploadBytes;
  const end = performance.now();
  ST.ms = end - started;
  ST.contactMs = viewStarted - contactStarted;
  ST.viewMs = objectsStarted - viewStarted;
  ST.objectsMs = end - objectsStarted;
}
export const DEBUG = {
  ST, get field() { return field; }, get render() { return view?.stats; }, get objects() { return objects?.stats; }, get surfaces() { return surfaces; },
  sample(x, z, y) {
    if (!surfaces) return null;
    surfaces.resolve(x, z, y, undefined, resolved);
    return field.sample(resolved.surfaceId, x, z, {});
  },
  reset() { field?.reset(); contacts?.reset(); npcContacts = null; npcClock = 0; view?.invalidate(); surfaces?.invalidate(); },
};
