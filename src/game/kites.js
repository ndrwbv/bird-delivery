/* ──────────────────────────────────────────────────────────────────────────
   Воздушные змеи и дроны (docs/CAREER.md «Город: как выглядит» → «Змеи и дроны»).

   Где: в парках (самые большие, от KT.PARK_MIN м², не больше KT.PARKS) и на газоне вдоль
   улицы Ленина (через KT.LENIN_GAP м, KT.LENIN_OFF м от края асфальта) — место на всю игру,
   не на дорожке, не в доме, не у дороги и не в твёрдом. В каждом месте — змей (KT.KITE_SHARE)
   или дрон.

   Когда: днём, без дождя, только на KT.ACTIVE ближайших местах ближе KT.NEAR м от камеры
   (дальше KT.DROP — убираем). Змей: человек держит нитку, змей на 18—28 м, в 14—22 м по ветру,
   покачивается и водит хвостом. Дрон: человек с пультом смотрит вверх, дрон висит на 6—14 м и
   плавает восьмёркой в 10 м от него, винты крутятся. Наезд — как на прохожего (hits.js): медленнее
   HITS.TIER.FALL — упал и встал, быстрее — сбит, змей/дрон пропадает, место отдыхает KT.REST с
   (до 09.10.2026 человек исчезал, когда машина подъезжала ближе 3,5 м).

   Перф: геометрии и материалы общие, людей — не больше 2 × KT.ACTIVE.

   init(api) — game.js, после сборки: { THREE, scene, CITY, V, ENV, groundH, inHouse, nearestRoad,
     solidAt, onPave, makeHuman, dropMesh, CAR_L, CAR_W, gibHuman, runOver }
   step(dt)  — каждый кадр
   отладка: __dlv.KITES
   ────────────────────────────────────────────────────────────────────────── */
import { makePerson } from './people.js';
import * as HITS from './hits.js';

export const KT = {
  PARK_MIN: 6000, PARKS: 14,
  LENIN: 'улица Ленина', LENIN_GAP: 450, LENIN_OFF: 8,
  KITE_SHARE: 0.6,
  NEAR: 260, DROP: 320, ACTIVE: 4,
  REST: 90,
};

let A = null, GEO = null;
const SPOTS = [];
const ST = { parks: 0, lenin: 0, kites: 0, drones: 0, active: 0, falls: 0, hit: 0 };
const hsh = (x, z, k = 0) => { let h = Math.imul(Math.round(x) ^ 0x6a09e667, 0x9E3779B1) ^ Math.imul(Math.round(z) + k * 0x3c6ef372, 0x85ebca6b); h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const inP = (x, z, p) => {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; }
  return c;
};
const area = p => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(a / 2); };

function free (x, z) {
  if (A.groundH(x, z) < 0.3 || A.inHouse(x, z, 6) || A.onPave(x, z, 1.5) || A.solidAt(x, z, 1.5)) return false;
  const r = A.nearestRoad(x, z, 7, 1);
  if (r && r.d < r.seg.w / 2 + 4) return false;
  return !SPOTS.some(s => Math.hypot(s.x - x, s.z - z) < 60);
}

function findSpots () {
  // парки: самые большие, точка внутри — от середины к краям
  const parks = (A.CITY.green || []).filter(g => g.k === 'park').map(g => ({ g, a: area(g.p) })).filter(q => q.a >= KT.PARK_MIN).sort((a, b) => b.a - a.a);
  for (const { g } of parks) {
    if (ST.parks >= KT.PARKS) break;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of g.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    for (let k = 0; k < 24; k++) {
      const x = x0 + (x1 - x0) * (0.2 + 0.6 * hsh(x0, z0, k)), z = z0 + (z1 - z0) * (0.2 + 0.6 * hsh(z1, x1, k));
      if (!inP(x, z, g.p) || !free(x, z)) continue;
      SPOTS.push({ x, z, where: 'park' }); ST.parks++;
      break;
    }
  }
  // Ленина: газон за тротуаром, через LENIN_GAP м по очереди с обеих сторон
  let acc = KT.LENIN_GAP * 0.5, side = 1;
  for (const r of (A.CITY.roads || []).filter(q => q.n === KT.LENIN && q.c <= 5 && q.p && q.p.length > 1)) {
    for (let i = 1; i < r.p.length; i++) {
      const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i], l = Math.hypot(bx - ax, bz - az);
      if (l < 1) continue;
      const ux = (bx - ax) / l, uz = (bz - az) / l;
      for (let s = 0; s < l; s += 10) {
        if ((acc += 10) < KT.LENIN_GAP) continue;
        for (const sd of [side, -side]) {
          const o = r.w / 2 + KT.LENIN_OFF, x = ax + ux * s - uz * sd * o, z = az + uz * s + ux * sd * o;
          if (!free(x, z)) continue;
          SPOTS.push({ x, z, where: 'lenin' }); ST.lenin++; acc = 0; side = -side;
          break;
        }
      }
    }
  }
  for (const s of SPOTS) {
    s.kite = hsh(s.x, s.z, 7) < KT.KITE_SHARE;
    s.wind = hsh(s.z, s.x, 3) * Math.PI * 2;           // куда тянет змея
    s.hex = ['#e8423a', '#f2c230', '#3a8fd8', '#7a4fd0', '#2fae6a', '#ff7a2f'][(hsh(s.x, s.z, 9) * 6) | 0];
    s.on = null; s.rest = 0;
    if (s.kite) ST.kites++; else ST.drones++;
  }
}

/* ── общие геометрии ── */
function geo () {
  if (GEO) return GEO;
  const T = A.THREE;
  const kite = new T.BufferGeometry();
  kite.setAttribute('position', new T.Float32BufferAttribute([0, 0.9, 0, -0.6, 0.1, 0, 0, -0.8, 0, 0, 0.9, 0, 0, -0.8, 0, 0.6, 0.1, 0], 3));
  kite.computeVertexNormals();
  GEO = {
    kite,
    bow: new T.BoxGeometry(0.22, 0.08, 0.02),
    body: new T.BoxGeometry(0.34, 0.09, 0.34),
    arm: new T.BoxGeometry(0.62, 0.03, 0.05),
    rotor: new T.CylinderGeometry(0.15, 0.15, 0.01, 8),
    remote: new T.BoxGeometry(0.2, 0.05, 0.12),
    mats: new Map(),
    line: new T.LineBasicMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.7 }),
  };
  return GEO;
}
function mat (hex, o = {}) {
  const G = geo(), k = hex + (o.side ? 's' : '') + (o.op || '');
  if (!G.mats.has(k)) {
    const m = new A.THREE.MeshLambertMaterial({ color: hex, flatShading: true, side: o.side ? A.THREE.DoubleSide : A.THREE.FrontSide, transparent: !!o.op, opacity: o.op || 1 });
    m.userData.keep = true;                              // общий: dropMesh его не освобождает
    G.mats.set(k, m);
  }
  return G.mats.get(k);
}

function spawn (s) {
  const T = A.THREE, G = geo();
  const person = A.makeHuman(makePerson({ seed: (hsh(s.x, s.z, 1) * 1e9) | 0, fem: hsh(s.x, s.z, 2) < 0.35 }), {});
  const gy = A.groundH(s.x, s.z);
  person.position.set(s.x, gy, s.z);
  A.scene.add(person);
  const on = { person, t: hsh(s.x, s.z, 5) * 30, gy, p: { x: s.x, z: s.z, grp: person } };   // p — для наезда (hits.js)
  if (s.kite) {
    const k = new T.Group();
    const sail = new T.Mesh(G.kite, mat(s.hex, { side: true }));
    k.add(sail);
    on.tail = [];
    for (let i = 0; i < 5; i++) { const b = new T.Mesh(G.bow, mat(i % 2 ? '#f4f1ea' : s.hex)); b.position.set(0, -0.95 - i * 0.45, 0); k.add(b); on.tail.push(b); }
    A.scene.add(k);
    on.kite = k;
    on.posA = new Float32Array(6);
    const lg = new T.BufferGeometry();
    lg.setAttribute('position', new T.BufferAttribute(on.posA, 3));
    on.line = new T.Line(lg, G.line);
    on.line.frustumCulled = false;
    A.scene.add(on.line);
    person.rotation.y = s.wind;
  } else {
    const dr = new T.Group();
    dr.add(new T.Mesh(G.body, mat('#2b2f36')));
    on.rot = [];
    for (const a of [Math.PI / 4, -Math.PI / 4]) { const m = new T.Mesh(G.arm, mat('#3a3f48')); m.rotation.y = a; dr.add(m); }
    for (const [x, z] of [[0.22, 0.22], [-0.22, 0.22], [0.22, -0.22], [-0.22, -0.22]]) {
      const r = new T.Mesh(G.rotor, mat('#c9ced6', { op: 0.55 }));
      r.position.set(x, 0.05, z); dr.add(r); on.rot.push(r);
    }
    const led = new T.Mesh(G.bow, mat(s.hex)); led.scale.set(0.5, 0.6, 3); led.position.set(0, -0.05, 0.17); dr.add(led);
    A.scene.add(dr);
    on.drone = dr;
    const rc = new T.Mesh(G.remote, mat('#30343a'));
    rc.position.set(0, 1.05, 0.38);
    person.add(rc); on.rc = rc;
  }
  hold(s, on);
  s.on = on; ST.active++;
}
/* руки: змей — правая с ниткой вверх, дрон — обе с пультом, смотрит вверх (и снова — когда встал после наезда) */
function hold (s, on) {
  const u = on.person.userData;
  if (s.kite) { u.armR.rotation.x = -1.9; u.armL.rotation.x = -0.4; on.person.rotation.y = s.wind; }
  else { u.armL.rotation.x = u.armR.rotation.x = -1.0; u.head.rotation.x = -0.45; }
}
function despawn (s) {
  const on = s.on;
  if (!on) return;
  if (on.rc) on.person.remove(on.rc);                    // пульт — общая геометрия
  A.dropMesh(on.person);
  for (const m of [on.kite, on.drone]) if (m) A.scene.remove(m);   // геометрии и материалы общие — не освобождаем
  if (on.line) { A.scene.remove(on.line); on.line.geometry.dispose(); }
  s.on = null; ST.active--;
}

function animate (s, dt, lying) {
  const on = s.on, p = on.person;
  on.t += dt;
  const t = on.t;
  if (s.kite) {
    const wx = Math.sin(s.wind), wz = Math.cos(s.wind);
    const dist = 18 + Math.sin(t * 0.21) * 4, hgt = 22 + Math.sin(t * 0.33) * 4 + Math.sin(t * 1.1) * 0.6;
    const side = Math.sin(t * 0.47) * 4 + Math.sin(t * 1.3) * 0.8;
    const kx = s.x + wx * dist + wz * side, kz = s.z + wz * dist - wx * side, ky = on.gy + hgt;
    on.kite.position.set(kx, ky, kz);
    on.kite.rotation.set(0.35, s.wind + Math.PI, Math.sin(t * 1.3) * 0.35);
    for (let i = 0; i < on.tail.length; i++) on.tail[i].position.x = Math.sin(t * 3 - i * 0.8) * 0.12 * (i + 1);
    // нитка: от руки к змею
    const hx = on.p.x + wx * 0.45, hz = on.p.z + wz * 0.45, hy = on.gy + (lying ? 0.4 : 1.85 * p.scale.y);
    on.posA.set([hx, hy, hz, kx, ky - 0.75, kz]);
    on.line.geometry.attributes.position.needsUpdate = true;
    if (!lying) p.userData.armR.rotation.x = -1.9 + Math.sin(t * 1.3) * 0.12;
  } else {
    // восьмёрка над хозяином, чуть дрожит
    const ax = Math.sin(t * 0.31) * 10, az = Math.sin(t * 0.62) * 5, ay = 9 + Math.sin(t * 0.23) * 4 + Math.sin(t * 5.1) * 0.05;
    const dx = on.drone.position.x, dz = on.drone.position.z;
    on.drone.position.set(s.x + ax, on.gy + ay, s.z + az);
    const vx = on.drone.position.x - dx, vz = on.drone.position.z - dz;
    on.drone.rotation.set(vz * 2, Math.sin(t * 0.2) * 1.2, -vx * 2);
    for (const r of on.rot) r.rotation.y += dt * 40;
    if (!lying) p.rotation.y = Math.atan2(on.drone.position.x - on.p.x, on.drone.position.z - on.p.z);
  }
}

export function init (api) {
  A = api;
  findSpots();
  if (typeof window !== 'undefined') window.setTimeout(() => { if (window.__dlv) window.__dlv.KITES = DEBUG; }, 0);
}

let scanT = 0;
export function step (dt) {
  if (!A || !SPOTS.length) return;
  const V = A.V, ENV = A.ENV;
  if ((scanT -= dt) <= 0) {
    scanT = 1;
    const ok = ENV.night < 0.4 && ENV.rain < 0.3;
    for (const s of SPOTS) {
      if (s.rest > 0) s.rest -= 1;
      if (s.on && (!ok || Math.hypot(s.x - V.x, s.z - V.z) > KT.DROP)) despawn(s);
    }
    if (ok && ST.active < KT.ACTIVE) {
      const near = SPOTS.filter(s => !s.on && s.rest <= 0 && Math.hypot(s.x - V.x, s.z - V.z) < KT.NEAR)
        .sort((a, b) => Math.hypot(a.x - V.x, a.z - V.z) - Math.hypot(b.x - V.x, b.z - V.z));
      for (const s of near.slice(0, KT.ACTIVE - ST.active)) spawn(s);
    }
  }
  // наезд — как на любого прохожего (game.js underCar, hits.js): медленно — упал и встал, быстрее — сбит
  const sp = Math.hypot(V.vx, V.vz), kmh = sp * 3.6, fx = Math.sin(V.h), fz = Math.cos(V.h);
  for (const s of SPOTS) {
    if (!s.on) continue;
    const p = s.on.p;
    if (p.fall) {
      if (HITS.fallStep(p, dt)) { animate(s, dt, true); continue; }
      hold(s, s.on);                                     // встал — снова держит нитку / пульт
    }
    if (sp > 3 && A.CAR_L) {
      const dx = p.x - V.x, dz = p.z - V.z;
      if (Math.abs(dx * fx + dz * fz) < A.CAR_L + 0.5 && Math.abs(dx * fz - dz * fx) < A.CAR_W + 0.35) {
        if (HITS.isFall(kmh)) { HITS.fall(p, V.vx, V.vz); ST.falls++; animate(s, dt, true); continue; }
        despawn(s);                                      // змей/дрон пропадает, модель человека — в hits.js
        A.gibHuman(p, V.vx, V.vz, kmh);
        if (A.runOver) A.runOver();
        s.rest = KT.REST; ST.hit++;
        continue;
      }
    }
    animate(s, dt);
  }
}

const DEBUG = { KT, ST, SPOTS, spawn, despawn };
