/* Contact emitters know vehicle dimensions, not the city renderer. Keeping
   wheel history by entity prevents a car change/teleport drawing a long trench. */
import { SNOW, clamp01 } from './config.js';

const wheelState = () => ({ x: 0, z: 0, surfaceId: null, on: false, carry: 0 });

export function createSnowContacts ({ field, resolveSurface }) {
  const vehicles = new Map(), feet = new Map();
  const surface = {}, sample = {}, bodySample = {};
  const from = { x: 0, z: 0 }, to = { x: 0, z: 0 };
  const contact = { surfaceId: null, from, to, width: SNOW.TIRE_WIDTH, length: SNOW.TIRE_LENGTH,
    heading: 0, load01: 1, slipLong: 0, slipSide: 0, dt: 0, kind: 'wheel', pickupCapacity: 0, depositMass: 0 };
  const result = { soft: 0, sand: 0, rut: 0, compaction: 0, snow: 0, changed: false, sprays: 0, supportY: 0, contacts: 0 };
  const event = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0.18, mass: 0 };
  let clock = 0;

  function state (id) {
    let value = vehicles.get(id);
    if (!value) {
      // Only emitters close to the player belong here. Forget distant NPC
      // history, but never delete the snow field or the player's tyre store.
      if (vehicles.size >= 48) {
        let oldest = null;
        for (const entry of vehicles.values()) if (entry.id !== 'player' && (!oldest || entry.last < oldest.last)) oldest = entry;
        if (oldest) vehicles.delete(oldest.id);
      }
      value = { id, wheels: [wheelState(), wheelState(), wheelState(), wheelState()], last: 0, spray: 0,
        x: 0, z: 0, h: 0, model: null, valid: false, bodySurfaceId: null };
      vehicles.set(id, value);
    }
    value.last = ++clock;
    return value;
  }

  function resolve (x, z, y, previous) {
    surface.valid = false; surface.surfaceId = undefined; surface.baseY = 0;
    const returned = resolveSurface(x, z, y, previous, surface);
    return returned || surface;
  }

  function vehicle (V, car, dt, options = {}) {
    result.soft = result.sand = result.rut = result.compaction = result.snow = result.supportY = result.contacts = result.sprays = 0;
    result.changed = false;
    if (!V || !Number.isFinite(V.x) || !Number.isFinite(V.z)) return result;
    const e = state(options.id ?? 'player');
    if (field.stats.season <= 0.0001) for (const wheel of e.wheels) wheel.carry = 0;
    const grounded = options.grounded !== false && !options.air && !V.air && !V.wade && V.sink === undefined;
    dt = Math.max(0, Math.min(0.15, dt || 0));
    if (!grounded || !dt) { e.valid = false; for (const wheel of e.wheels) wheel.on = false; return result; }
    const fx = Math.sin(V.h), fz = Math.cos(V.h), sx = fz, sz = -fx;
    const speed = Math.hypot(V.vx || 0, V.vz || 0), sideSpeed = (V.vx || 0) * sx + (V.vz || 0) * sz;
    const forwardSpeed = (V.vx || 0) * fx + (V.vz || 0) * fz;
    const wheels = car?.userData?.wheels;
    const modelChanged = e.model !== car;
    if (modelChanged) { e.model = car; e.valid = false; for (const wheel of e.wheels) wheel.on = false; }
    const teleported = e.valid && Math.hypot(V.x - e.x, V.z - e.z) > SNOW.MAX_CONTACT_DISTANCE;
    if (teleported) { e.valid = false; for (const wheel of e.wheels) wheel.on = false; }
    let eventMass = 0, eventX = V.x, eventZ = V.z, eventY = V.y || 0;
    for (let i = 0; i < 4; i++) {
      const wheel = e.wheels[i], model = wheels?.[i];
      let wx = (i & 1 ? 1 : -1) * SNOW.WHEEL_X, wz = i < 2 ? SNOW.WHEEL_FRONT : SNOW.WHEEL_REAR;
      const p = model?.parent?.position || model?.position;
      if (p && Number.isFinite(p.x) && Number.isFinite(p.z) && Math.abs(p.x) <= 3 && Math.abs(p.z) <= 5 && Math.abs(p.x) > 0.2) { wx = p.x; wz = p.z; }
      const x = V.x + sx * wx + fx * wz, z = V.z + sz * wx + fz * wz;
      const receiver = resolve(x, z, V.y, wheel.surfaceId);
      if (!receiver.valid || receiver.surfaceId === undefined) { wheel.on = false; continue; }
      field.sample(receiver.surfaceId, x, z, sample);
      if (!sample.valid) { wheel.on = false; continue; }
      result.contacts++;
      result.soft += sample.contactResistance || 0;
      result.sand += sample.sand || 0;
      result.rut += (sample.rut || 0) * (1 - (sample.ice || 0));
      result.compaction += sample.compaction || 0;
      result.snow += sample.thickness || 0;
      result.supportY += sample.supportY ?? sample.baseY;
      const continuing = wheel.on && wheel.surfaceId === receiver.surfaceId && !teleported;
      from.x = continuing ? wheel.x : x; from.z = continuing ? wheel.z : z;
      to.x = x; to.z = z;
      const travelled = Math.hypot(to.x - from.x, to.z - from.z);
      contact.surfaceId = receiver.surfaceId;
      contact.width = model?.userData?.tireWidth || car?.userData?.tireWidth || SNOW.TIRE_WIDTH;
      contact.length = SNOW.TIRE_LENGTH; contact.heading = V.h + (i < 2 ? (V.steer || 0) * 0.45 : 0);
      contact.dt = dt; contact.load01 = clamp01(options.load01 ?? 1); contact.kind = 'wheel';
      contact.slipSide = Math.min(3, sideSpeed * 0.25);
      contact.slipLong = options.gas ? Math.max(0, 1 - speed / 5) * 2 : options.brake || options.hand ? Math.min(2, speed / 6) : 0;
      contact.pickupCapacity = Math.max(0, SNOW.TIRE_CARRY - wheel.carry);
      contact.depositMass = sample.thickness < 0.025 && travelled > 0 ? wheel.carry * (1 - Math.exp(-travelled / SNOW.TIRE_DROP_DISTANCE)) : 0;
      const changed = field.stamp(contact);
      wheel.carry = Math.max(0, Math.min(SNOW.TIRE_CARRY, wheel.carry + changed.pickedUp - changed.deposited));
      if (changed.changed) result.changed = true;
      if (changed.movedMass > eventMass) { eventMass = changed.movedMass; eventX = x; eventZ = z; eventY = sample.topY; }
      wheel.x = x; wheel.z = z; wheel.surfaceId = receiver.surfaceId; wheel.on = true;
    }
    if (result.contacts) {
      const count = result.contacts;
      result.soft /= count; result.sand /= count; result.rut /= count;
      result.compaction /= count; result.snow /= count; result.supportY /= count;
    }
    // The bumper can open a LOCAL channel in deep loose snow. It does not
    // flatten a whole mound, nor move the car to the top of a high snowbank.
    const front = forwardSpeed < -0.5 ? -1.8 : 1.9;
    const bx = V.x + fx * front, bz = V.z + fz * front;
    const receiver = resolve(bx, bz, V.y, e.wheels[0].surfaceId);
    if (receiver.valid) {
      field.sample(receiver.surfaceId, bx, bz, bodySample);
      if (bodySample.valid && bodySample.thickness > 0.35 && speed > 0.3) {
        to.x = bx; to.z = bz;
        const sameSurface = e.valid && e.bodySurfaceId === receiver.surfaceId;
        from.x = sameSurface ? e.x + Math.sin(e.h) * front : bx;
        from.z = sameSurface ? e.z + Math.cos(e.h) * front : bz;
        contact.surfaceId = receiver.surfaceId; contact.width = car?.userData?.bodyWidth || 1.65;
        contact.length = 0.4; contact.heading = V.h; contact.kind = 'body'; contact.dt = dt;
        contact.load01 = Math.min(1, 0.25 + speed / 14); contact.slipLong = Math.min(2, speed / 8); contact.slipSide = sideSpeed * 0.2;
        contact.pickupCapacity = contact.depositMass = 0;
        contact.soleY = bodySample.baseY + 0.26;
        const changed = field.stamp(contact);
        if (changed.changed) result.changed = true;
        delete contact.soleY;
      }
    }
    e.bodySurfaceId = receiver.valid ? receiver.surfaceId : null;
    e.spray -= dt;
    if (options.onSpray && eventMass > 0.001 && (speed > 1 || options.gas) && e.spray <= 0) {
      e.spray = 0.12;
      event.x = eventX; event.y = eventY + 0.08; event.z = eventZ;
      event.vx = -fx * (1 + speed * 0.06) + sx * sideSpeed * 0.2;
      event.vz = -fz * (1 + speed * 0.06) + sz * sideSpeed * 0.2;
      event.vy = 0.6 + Math.min(0.6, speed * 0.025);
      event.size = 0.12 + Math.min(0.16, eventMass * 4); event.mass = eventMass;
      options.onSpray(event); result.sprays++;
    }
    e.x = V.x; e.z = V.z; e.h = V.h; e.valid = true;
    return result;
  }

  function foot (step) {
    if (!step || !Number.isFinite(step.x) || !Number.isFinite(step.z)) return null;
    const id = step.id ?? 'foot';
    const prev = feet.get(id);
    // Event-based step adapter: repeated coordinates are not a new footfall.
    if (prev && Math.hypot(prev.x - step.x, prev.z - step.z) < 0.12 && !step.force) return null;
    if (feet.size > 256) feet.delete(feet.keys().next().value);
    if (prev) { prev.x = step.x; prev.z = step.z; } else feet.set(id, { x: step.x, z: step.z });
    const receiver = step.surfaceId === undefined ? resolve(step.x, step.z, step.y, prev?.surfaceId) : { valid: true, surfaceId: step.surfaceId };
    if (!receiver.valid) return null;
    from.x = to.x = step.x; from.z = to.z = step.z;
    contact.surfaceId = receiver.surfaceId; contact.width = step.width || 0.14; contact.length = step.length || 0.28;
    contact.heading = step.heading || 0; contact.kind = 'foot'; contact.load01 = step.load01 ?? 0.7;
    contact.dt = step.dt || 0.15; contact.slipLong = contact.slipSide = contact.pickupCapacity = contact.depositMass = 0;
    delete contact.soleY;
    return field.stamp(contact);
  }

  function body (impact) {
    return field.stamp({ ...impact, kind: 'body', width: impact.width || 0.5, length: impact.length || 1.3,
      load01: impact.load01 ?? 1, dt: impact.dt || 0.15 });
  }

  return { vehicle, foot, body,
    clearEntity (id) { vehicles.delete(id); feet.delete(id); },
    reset () { vehicles.clear(); feet.clear(); },
    stats: () => ({ vehicles: vehicles.size, feet: feet.size,
      tyreMass: [...vehicles.values()].reduce((sum, e) => sum + e.wheels.reduce((s, w) => s + w.carry, 0), 0) }),
  };
}
