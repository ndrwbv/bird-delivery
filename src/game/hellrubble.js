/* Обломки взрывов: мелочь разлетается от шин, глыбы работают как препятствия. */
import * as THREE from '../vendor/three.module.min.js';

const batches = [];
const pose = new THREE.Object3D();
const clamp = THREE.MathUtils.clamp;
const GRAVITY = 16, SOLID_SIZE = 1.13;
let world, rock, block, floor, exit, random, pale, dark;

export function start (group, geometry, height, rubbleExit, rand) {
  world = group; rock = geometry; floor = height; exit = rubbleExit; random = rand;
  pale = new THREE.MeshLambertMaterial({ color: '#887474', flatShading: true });
  dark = new THREE.MeshLambertMaterial({ color: '#75423a', flatShading: true });
  block = new THREE.BoxGeometry(2, 2, 2);
}

export function burst (origin, house, crater, angle) {
  const big = !!(house || crater), count = house ? 46 : big ? 28 : 12;
  const meshes = [rock, ...(house ? [block] : [])].map(geo => {
    const mesh = new THREE.InstancedMesh(geo, big ? pale : dark, count);
    mesh.name = 'hell-rubble'; mesh.frustumCulled = false; mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    world.add(mesh);
    return mesh;
  });
  const slots = [0, 0];
  const pieces = [];
  for (let i = 0; i < count; i++) {
    const type = house ? i % 4 : 0, kind = type ? 1 : 0, slot = slots[kind]++;
    const size = random(0.18, big ? 2.2 : 0.81);
    const sx = type === 2 ? 0.22 : type === 3 ? 0.55 : 1;
    const sy = type === 1 ? 0.18 : type === 2 ? 0.22 : type === 3 ? 0.32 : 0.57;
    const sz = type === 2 ? 1.7 : type === 3 ? 0.4 : 1.15;
    const hw = size * sx * 0.9, hd = size * sz * 0.9, reach = Math.max(hw, hd);
    const solid = reach >= SOLID_SIZE;
    let x = origin.x, y = origin.y, z = origin.z;
    if (house) {
      let a = random(-1, 1) * house.hx, b = random(-1, 1) * house.hz;
      if (i % 2) a = Math.sign(a) * house.hx; else b = Math.sign(b) * house.hz;
      x = house.ox + a * house.ux - b * house.uz;
      z = house.oz + a * house.uz + b * house.ux;
      y = random(house.cut + 0.2, house.top);
    }
    const yaw = random(0, 6.28), vy = random(big ? 1 : 5, big ? 12 : 16);
    let vx = random(-13, 13), vz = random(-13, 13);
    if (crater && solid) {
      const a = angle + (i % 2 ? 1 : -1) * random(0.9, 2.8), reach = crater + random(1, 8);
      const flight = Math.max(0.45, 2 * vy / GRAVITY);
      vx = Math.cos(a) * Math.min(22, reach / flight);
      vz = Math.sin(a) * Math.min(22, reach / flight);
    }
    meshes[kind].setColorAt(slot, new THREE.Color(type === 3 ? '#a45b41' : type === 2 ? '#504745' : i % 3 ? '#b4a19a' : '#7d7774'));
    pieces.push({ x, y, z, vx, vy, vz, size: Math.max(size, reach), sx: size * sx, sy: size * sy, sz: size * sz, kind, slot,
      solid, hw, hd, yaw, rx: 0, rz: 0, spin: random(-7, 7),
      rest: false, cool: 0, lift: size * sy * 0.9,
      box: solid ? { cx: x, cz: z, hw, hd, cs: Math.cos(yaw), sn: Math.sin(yaw), mat: 'wall' } : null });
  }
  meshes.forEach((mesh, i) => { mesh.count = slots[i]; });
  batches.push({ meshes, pieces, age: 0, fade: 1, x: origin.x, z: origin.z });
}

export function solids (list, x, z, y) {
  let out = list;
  for (const b of batches) {
    if (b.fade < 0.58) continue;
    for (const q of b.pieces) {
      if (!q.solid || Math.abs(x - q.x) > q.size + 1.6 || Math.abs(z - q.z) > q.size + 1.6 ||
          y > q.y + q.lift * 0.95 || y + 1.35 < q.y - q.lift) continue;
      if (out === list) out = list.slice();
      out.push(q.box);
    }
  }
  return out;
}

export function kick (car, fromX, fromZ, fx, fz, length, width) {
  const speed = Math.hypot(car.vx, car.vz);
  if (speed < 1.1) return;
  const dx = car.x - fromX, dz = car.z - fromZ, ds = dx * dx + dz * dz || 1;
  for (const b of batches) for (const q of b.pieces) {
    if (q.solid || q.cool > 0 || q.y < car.y - 0.48 || q.y > car.y + 1.15) continue;
    const reach = width + q.size * 0.7;
    for (const k of [-0.55, 0.55]) {
      const x = fromX + fx * length * k, z = fromZ + fz * length * k;
      const t = clamp(((q.x - x) * dx + (q.z - z) * dz) / ds, 0, 1);
      const ox = q.x - x - dx * t, oz = q.z - z - dz * t, d = Math.hypot(ox, oz);
      if (d >= reach) continue;
      const force = clamp(speed * 0.27, 1.4, 8);
      q.vx = car.vx / speed * force + ox / (d || 1) * force * 0.62;
      q.vz = car.vz / speed * force + oz / (d || 1) * force * 0.62;
      q.vy = 1.2 + force * 0.32;
      q.spin = random(-13, 13);
      q.rest = false;
      q.cool = 0.45;
      break;
    }
  }
}

function remove (b) {
  for (const mesh of b.meshes) { world.remove(mesh); mesh.dispose(); }
}

export function step (dt, x, z) {
  for (let i = 0; i < batches.length;) {
    const b = batches[i], d = Math.hypot(b.x - x, b.z - z);
    b.age += dt;
    if (d > 185 || (b.age > 28 && d > 24) || (i < batches.length - 13 && (d > 14 || b.age > 40))) b.fade -= dt * 1.05;
    if (b.fade <= 0) { remove(b); batches.splice(i, 1); continue; }
    i++;
    if (b.age > 6 && b.fade === 1 && b.pieces.every(q => q.rest && q.cool <= 0)) continue;
    for (let j = 0; j < b.pieces.length; j++) {
      const q = b.pieces[j];
      q.cool = Math.max(0, q.cool - dt);
      if (!q.rest) {
        q.x += q.vx * dt; q.z += q.vz * dt; q.y += q.vy * dt;
        q.vy -= GRAVITY * dt;
        q.rx += q.spin * dt; q.rz += q.spin * 0.65 * dt;
        const y = floor(q.x, q.z) + q.lift;
        if (q.y <= y && q.vy <= 0) {
          q.y = y;
          const off = q.solid && exit(q.x, q.z, q.hd);
          if (off) {
            q.vx = off.x * 5.2; q.vz = off.z * 5.2; q.vy = 1.55; q.spin *= 0.75;
          } else if (!q.solid && (q.vy < -3 || Math.hypot(q.vx, q.vz) > 3)) {
            q.vy *= -0.22; q.vx *= 0.57; q.vz *= 0.57; q.spin *= 0.62;
          } else {
            q.rest = true;
            if (q.solid) { q.rx = 0; q.rz = 0; }
          }
        }
        if (q.box) { q.box.cx = q.x; q.box.cz = q.z; }
      }
      pose.position.set(q.x, q.y, q.z);
      pose.rotation.set(q.rx, q.yaw, q.rz);
      pose.scale.set(q.sx * b.fade, q.sy * b.fade, q.sz * b.fade);
      pose.updateMatrix();
      b.meshes[q.kind].setMatrixAt(q.slot, pose.matrix);
    }
    for (const mesh of b.meshes) mesh.instanceMatrix.needsUpdate = true;
  }
}

export function clearEntrance () {
  for (const b of batches) for (const q of b.pieces) {
    if (!q.solid || !q.rest) continue;
    const off = exit(q.x, q.z, q.hd);
    if (!off) continue;
    q.vx = off.x * 5.2; q.vz = off.z * 5.2; q.vy = 2.3;
    q.rest = false;
  }
}

export function stop () {
  for (const b of batches) remove(b);
  batches.length = 0;
  pale.dispose(); dark.dispose(); block.dispose();
}
