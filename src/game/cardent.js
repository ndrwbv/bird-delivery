/* ──────────────────────────────────────────────────────────────────────────
   Своя машина мнётся и теряет детали (09.10.2026, группа Ж3 docs/IDEAS.md).
   Правила словами — docs/CAREER.md «Вмятины и отлетающие детали».

   • Кузов своей машины (makeCar opts.see) собран из коробок с частой сеткой
     (tess: шаг DENT.SEG м) — есть что вдавливать. Удар (dentCar в game.js →
     hit) вдавливает вершины кузова, панелей, фар и наклеек у места удара:
     внутрь от той стороны, куда пришёлся удар (морда, корма или бок), глубже
     и шире — чем сильнее удар (от DENT.MIN до DENT.FULL м/с), с «мятым» шумом
     и чуть вниз. Глубже DENT.IN_END (спереди и сзади) / DENT.IN_SIDE (бок) от
     края не мнётся — повторные удары доминают, но машина не складывается.
     Броня (ступень 1—3) — вмятины мельче на DENT.ARMOR за ступень.
   • Отлетают (PART): бампер (передний или задний — тот, что с номером из
     carrear.js), крышка багажника (седаны), зеркало (своё с каждой стороны),
     колпак колеса. Летят от удара с машиной, кувыркаются, падают, ложатся
     плашмя на дорогу, лежат PART.LIE с и исчезают (PART.FADE с).
   • Следы сзади (10.10.2026, REARD): камера сзади — поэтому любой удар, и в
     морду, и в бок, копит износ зада: фонари трескаются и бьются, задний
     бампер перекашивает и он отваливается, крышка багажника (у хэтчбеков —
     задняя дверь, carrear.js) приоткрывается и распахивается — видно пиццу.
   • Место удара — настоящее: о стену бьёт тот край кузова (нос или корма),
     которым въехал (game.js bump); до 10.10 удар о стену всегда шёл в морду.
   • Чинится вместе с кузовом: новая смена, «ещё раз», возрождение, смена
     или тюнинг машины и ремонт у Дяди Жени — машина собирается заново
     (resetCar в game.js).
   Кадр: вмятина — правка вершин в момент удара (раз на удар); новых
   отрисовок — два зеркала; детали на земле — те же меши, без новых.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

/* MIN / FULL — м/с удара: слабее не мнёт, с FULL — вмятина во всю глубину DEPTH (м);
   R0 + R1 — радиус вмятины (м) от слабого до полного; IN_END / IN_SIDE — глубже этого от края не мнётся;
   ARMOR — на столько мельче за ступень брони; SEG — шаг сетки кузова (м) */
export const DENT = { MIN: 4, FULL: 22, DEPTH: 0.3, R0: 0.45, R1: 0.6, IN_END: 0.5, IN_SIDE: 0.28, ARMOR: 0.15, SEG: 0.3 };
/* м/с удара: BUMPER — бампер с того конца (спереди + ARMOR_F за ступень брони — кенгурятник), SUM — или столько
   набитых вмятин на этом конце (сумма глубин 0…1 за удар); TRUNK — крышка багажника от удара сзади
   (TRUNK_BARE — если заднего бампера уже нет); MIRROR — зеркало от удара в бок рядом с ним (MIRROR_NEAR м),
   MIRROR_ANY — от удара в бок где угодно; HUB — колпак ближнего колеса, если удар ближе HUB_R м;
   LIE — с лежат на дороге, FADE — с тают; MAX — деталей на земле не больше */
export const PART = { BUMPER: 17, ARMOR_F: 3, SUM: 1.6, TRUNK: 24, TRUNK_BARE: 18, MIRROR: 9, MIRROR_NEAR: 1.3, MIRROR_ANY: 15,
  HUB: 13, HUB_R: 0.8, LIE: 15, FADE: 0.6, MAX: 10 };
/* «Следы сзади» (10.10.2026, автор: «игрок видит по большей части сзади всё»): любой удар — и в морду, и в бок —
   копит износ зада W += сила удара 0…1 (как глубина вмятины: (м/с − MIN) / (FULL − MIN), с бронёй — меньше),
   удар в корму — × REAR_K. Ступени: S1 / S2 / S3 износа или один удар силой ONE2 / ONE3 (0…1):
     1 — задний фонарь с той стороны в трещинах, задний бампер чуть перекосило (SKEW1 рад, сел на DROP1 м);
     2 — тот фонарь разбит, второй в трещинах; бампер висит одним краем (SKEW2, DROP2); крышка багажника
         (у хэтчбеков и джипов — задняя дверь) приоткрылась на AJAR / DOOR_AJAR рад и болтается на ходу;
     3 — оба фонаря разбиты, задний бампер отвалился (падает на дорогу), крышка / дверь распахнута (OPEN / DOOR_OPEN) —
         видны коробки с пиццей */
export const REARD = { REAR_K: 1.5, S1: 0.4, S2: 1.0, S3: 1.6, ONE2: 0.67, ONE3: 0.99,
  SKEW1: 0.1, DROP1: 0.04, SKEW2: 0.2, DROP2: 0.08, AJAR: 0.24, OPEN: 1.15, DOOR_AJAR: 1.0, DOOR_OPEN: 1.5 };
export const ST = { dents: 0, lost: [], ground: 0, flown: 0, verts: 0, car: null, rear: 0 };

import { crackLamp, smashLamp } from './carglass.js';

let API = null;
/* api: scene, groundH(x, z), put, mergeGeos; onLand(x, z, v, key, again) — деталь ударилась об асфальт (звук, impact.js) */
export function init (api) { API = api; }

/* ─── частая сетка кузова: коробка как есть (не повёрнута, не сдвинута) и не меньше 0,6 м → с сегментами ─── */
export function tess (geo) {
  const p = geo && geo.parameters;
  if (!p || geo.type !== 'BoxGeometry' || p.widthSegments > 1 || p.heightSegments > 1 || p.depthSegments > 1) return geo;
  if (Math.max(p.width, p.height, p.depth) < DENT.SEG * 2) return geo;
  geo.computeBoundingBox();
  const b = geo.boundingBox, e = 1e-4;
  if (Math.abs(b.max.x - b.min.x - p.width) > e || Math.abs(b.max.y - b.min.y - p.height) > e || Math.abs(b.max.z - b.min.z - p.depth) > e ||
    Math.abs(b.max.x + b.min.x) > e || Math.abs(b.max.y + b.min.y) > e || Math.abs(b.max.z + b.min.z) > e) return geo;
  const n = v => (v < 0.35 ? 1 : Math.min(16, Math.max(2, Math.round(v / DENT.SEG))));
  const out = new THREE.BoxGeometry(p.width, p.height, p.depth, n(p.width), n(p.height), n(p.depth));
  geo.dispose();
  return out;
}

/* ─── зеркала: на передних краях дверей, у низа боковых стёкол. k: W, top, cf, hex, put, mergeGeos ─── */
export function mirrors (g, k) {
  const out = [];
  for (const s of [-1, 1]) {
    const list = [];
    const B = (w, h, d, hex, x, y, z) => k.put(list, new THREE.BoxGeometry(w, h, d), hex, x, y, z);
    B(0.12, 0.035, 0.05, '#26252a', -s * 0.07, -0.03, 0.02);          // ножка к двери
    B(0.07, 0.12, 0.17, k.hex, 0, 0, 0);                              // корпус цвета кузова
    B(0.075, 0.09, 0.012, '#7f97ad', 0, 0, -0.09);                    // стекло — смотрит назад
    const m = new THREE.Mesh(k.mergeGeos(list), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    m.position.set(s * (k.W / 2 + 0.13), k.top + 0.17, k.cf - 0.16);
    m.userData.mirror = s > 0 ? 'mirrorL' : 'mirrorR';
    g.add(m);
    out.push(m);
  }
  return out;
}

/* ─── что мнётся: склейка кузова, панели (с наклейками), фары, аварийки, зеркала ─── */
function targets (g) {
  const u = g.userData, list = [], hz = u.hazard || [];
  for (const c of g.children) {
    if (!c.isMesh || !c.visible && !hz.includes(c)) continue;
    const m = c.material;
    const lamp = m && m.isMeshBasicMaterial && !m.map && !m.transparent && (m.vertexColors || m.color.getHex() === 0xfff1c8);
    if (c.userData.bulk || c.userData.mirror || c.userData.decal || u.panels.some(p => p.m === c) || hz.includes(c) || lamp) {
      list.push(c);
      for (const d of c.children) if (d.isMesh && d.userData.decal) list.push(d);
    }
  }
  return list;
}

const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const _inv = new THREE.Matrix4(), _m = new THREE.Matrix4(), _t = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3();

/* удар по своей машине: lx, lz — точка удара в осях машины (как в dentCar), force — м/с удара */
export function hit (g, lx, lz, force) {
  const u = g && g.userData;
  if (!u || !u.see || !(force > DENT.MIN)) return;
  const W = u.W || 1.8, hl = u.hl || 2.1;
  // сторона удара: морда / корма или бок — по тому, к какому краю точка ближе в долях габарита
  const end = Math.abs(lz) / hl >= Math.abs(lx) / (W / 2);
  const nx = end ? 0 : Math.sign(lx) || 1, nz = end ? Math.sign(lz) || 1 : 0;
  const cx = end ? Math.max(-W / 2, Math.min(W / 2, lx)) : nx * W / 2, cz = end ? nz * hl : Math.max(-hl, Math.min(hl, lz)), cy = u.y0 || 0.65;
  const k = Math.min(1, (force - DENT.MIN) / (DENT.FULL - DENT.MIN)) * Math.max(0.2, 1 - DENT.ARMOR * (u.armor || 0));
  if (dent(g, cx, cy, cz, nx, nz, DENT.DEPTH * k, DENT.R0 + DENT.R1 * k, (end ? hl : W / 2) - (end ? DENT.IN_END : DENT.IN_SIDE))) u.dents = (u.dents || 0) + 1;
  ST.dents++;
  // что отлетает
  const L = u.lost || (u.lost = {}), zone = end ? (nz > 0 ? 'f' : 'r') : (nx > 0 ? 'sl' : 'sr');
  const sum = u.dentSum || (u.dentSum = { f: 0, r: 0, sl: 0, sr: 0 });
  sum[zone] += k;
  if (end) {
    const front = nz > 0, key = front ? 'bumperF' : 'bumperR';
    const need = PART.BUMPER + (front ? PART.ARMOR_F * (u.armor || 0) : 0);
    if (!L[key] && (force >= need || sum[front ? 'f' : 'r'] >= PART.SUM)) dropPanel(g, key, nx, nz, force);
    if (!front && !L.trunk && u.trunk && (force >= PART.TRUNK || (L.bumperR && force >= PART.TRUNK_BARE))) dropPanel(g, 'trunk', 0, -1, force);
  } else {
    for (const m of u.mirrors || []) {
      const key = m.userData.mirror;
      if (L[key] || Math.sign(m.position.x) !== nx) continue;
      if (force >= PART.MIRROR_ANY || (force >= PART.MIRROR && Math.abs(m.position.z - lz) < PART.MIRROR_NEAR)) { L[key] = 1; fly(g, m, key, nx, 0, force); }
    }
  }
  rearWear(g, end && nz < 0 ? REARD.REAR_K : 1, k, end ? (Math.sign(lx) || 1) : nx, force);
  if (force >= PART.HUB) {
    let best = null, bd = PART.HUB_R;
    for (const w of u.wheels || []) {
      const p = w.parent && w.parent.position;
      if (!p || w.userData.bare) continue;
      const d = Math.hypot(p.x - (end ? cx : lx), p.z - cz);
      if (d < bd) { bd = d; best = w; }
    }
    if (best) hubcap(g, best, force);
  }
}

/* ─── следы сзади от любого удара: фонари, задний бампер, крышка / задняя дверь (REARD) ───
   w — вес удара (REAR_K — в корму), k — сила 0…1, sd — с какой стороны (+1 — левый по ходу, +X) */
function rearWear (g, w, k, sd, force) {
  const u = g.userData, R = u.rear || (u.rear = { w: 0, st: 0 });
  R.w += k * w;
  let st = R.w >= REARD.S3 ? 3 : R.w >= REARD.S2 ? 2 : R.w >= REARD.S1 ? 1 : 0;
  if (k >= REARD.ONE3) st = 3; else if (k >= REARD.ONE2) st = Math.max(st, 2);
  const near = 'r' + (sd > 0 ? 'l' : 'r'), far = 'r' + (sd > 0 ? 'r' : 'l');
  while (R.st < st) {
    R.st++;
    if (R.st === 1) { crackLamp(g, near); skew(g, sd, REARD.SKEW1, REARD.DROP1); }
    else if (R.st === 2) {
      smashLamp(g, near); crackLamp(g, far); skew(g, sd, REARD.SKEW2, REARD.DROP2);
      ajar(u, REARD.AJAR, REARD.DOOR_AJAR);
    } else {
      smashLamp(g, near); smashLamp(g, far);
      if (!(u.lost || {}).bumperR) dropPanel(g, 'bumperR', 0, -1, Math.min(force, 6));   // не улетает — падает под машину
      ajar(u, REARD.OPEN, REARD.DOOR_OPEN);
    }
  }
  ST.rear = R.st;
}
/* задний бампер перекосило: одним краем (со стороны удара) ниже */
function skew (g, sd, a, dy) {
  const p = g.userData.panels.find(q => q.m.name === 'bumperR');
  if (!p) return;
  const m = p.m;
  m.rotation.z = Math.max(-0.5, Math.min(0.5, m.rotation.z - sd * a));
  m.rotation.x = Math.max(-0.4, Math.min(0.4, m.rotation.x + a * 0.5));    // низ — наружу
  m.position.y -= dy;
}
function ajar (u, lid, door) {
  if (u.trunk && !u.trunk.lost) u.trunk.ajar = Math.max(u.trunk.ajar || 0, lid);
  if (u.rdoor) u.rdoor.ajar = Math.max(u.rdoor.ajar || 0, door);
}

/* вершины у точки (cx, cy, cz) — внутрь по −n на глубину depth, в радиусе r; не глубже плоскости lim от середины */
function dent (g, cx, cy, cz, nx, nz, depth, r, lim) {
  g.updateMatrixWorld(true);
  _inv.copy(g.matrixWorld).invert();
  _c.set(cx, cy, cz);
  const tx = -nz, tz = nx, r2 = r * r;
  let moved = 0;
  for (const m of targets(g)) {
    _m.multiplyMatrices(_inv, m.matrixWorld);
    _m.decompose(_t, _q, _s);
    _q.invert();
    const geo = m.geometry;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    _v.copy(geo.boundingSphere.center).applyMatrix4(_m);
    if (_v.distanceTo(_c) > r + geo.boundingSphere.radius) continue;
    const pos = geo.attributes.position, a = pos.array;
    let any = false;
    for (let i = 0; i < a.length; i += 3) {
      _v.set(a[i], a[i + 1], a[i + 2]).applyMatrix4(_m);
      const dx = _v.x - cx, dy = (_v.y - cy) * 0.8, dz = _v.z - cz, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r2) continue;
      const out = _v.x * nx + _v.z * nz;
      if (out <= lim) continue;
      const t = 1 - Math.sqrt(d2) / r, h = hash(_v.x, _v.y, _v.z), h2 = hash(_v.z, _v.x, _v.y);
      const inn = Math.min(depth * t * t * (0.65 + 0.7 * h), out - lim);
      if (inn < 1e-4) continue;
      const side = (h2 - 0.5) * inn * 0.6;                       // мнётся неровно: вбок
      _d.set(-nx * inn + tx * side, -inn * (0.15 + 0.35 * h2), -nz * inn + tz * side).applyQuaternion(_q);
      a[i] += _d.x; a[i + 1] += _d.y; a[i + 2] += _d.z;
      any = true; moved++;
    }
    if (any) { pos.needsUpdate = true; geo.computeBoundingSphere(); }
  }
  ST.verts = moved;
  return moved;
}

/* ─── отлетающие детали ─── */
const DEB = [];
const _w = new THREE.Vector3(), _up = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qt = new THREE.Quaternion(), _e = new THREE.Euler();
const VEL = { x: 0, z: 0, px: 0, pz: 0, ok: false };

function dropPanel (g, key, nx, nz, force) {
  const u = g.userData, i = u.panels.findIndex(p => p.m.name === key);
  u.lost[key] = 1;
  if (i < 0) return;
  const m = u.panels[i].m;
  u.panels.splice(i, 1);                           // dentCar её больше не трогает
  if (key === 'trunk' && u.trunk) { u.trunk.lost = true; u.trunk.m = new THREE.Object3D(); }   // крышки нет: открывать нечего, коробки видно (carrear.js)
  fly(g, m, key, nx, nz, force);
}

/* деталь m слетает с машины g: в мир, со скоростью машины, наружу (nx, nz — в осях машины) и вверх */
function fly (g, m, key, nx, nz, force) {
  if (!API || !API.scene) return;
  while (DEB.length >= PART.MAX) end(DEB.shift());
  g.updateMatrixWorld(true);
  API.scene.attach(m);
  m.visible = true;
  _w.set(nx, 0, nz).transformDirection(g.matrixWorld);
  const sp = 2 + force * 0.12, r = () => Math.random() - 0.5;
  const geo = m.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox;
  DEB.push({
    m, key, t: 0, rest: false,
    vx: VEL.x * 0.75 + _w.x * sp + r() * 2, vy: 2.5 + Math.random() * 2.5 + force * 0.06, vz: VEL.z * 0.75 + _w.z * sp + r() * 2,
    ax: r() * 14, ay: r() * 8, az: r() * 14,
    hy: Math.max(0.02, (bb.max.y - bb.min.y) / 2), oy: (bb.max.y + bb.min.y) / 2,
  });
  ST.lost.push(key); ST.flown++;
}

/* колпак: на колесе остаётся тёмный обод, сам колпак — отдельной шайбой летит */
function hubcap (g, wm, force) {
  wm.userData.bare = true;
  const col = wm.geometry.attributes.color, pos = wm.geometry.attributes.position;
  if (!col) return;
  const bare = new THREE.Color('#4a4950');
  let rad = 0, hex = null;
  for (let i = 0; i < col.count; i++) {
    if (col.getX(i) < 0.3) continue;                 // шина тёмная, колпак светлый
    rad = Math.max(rad, Math.hypot(pos.getY(i), pos.getZ(i)));
    if (!hex) hex = new THREE.Color(col.getX(i), col.getY(i), col.getZ(i));
    col.setXYZ(i, bare.r, bare.g, bare.b);
  }
  col.needsUpdate = true;
  if (!hex || !API || !API.scene) return;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, 0.05, 8), new THREE.MeshLambertMaterial({ color: hex, flatShading: true }));
  m.userData.own = 1;                                // своя геометрия: на исчезновении — в мусор
  wm.updateMatrixWorld(true);
  wm.getWorldPosition(m.position);
  m.quaternion.copy(g.quaternion).multiply(_qa.setFromAxisAngle(_up.set(0, 0, 1), Math.PI / 2));
  const p = wm.parent.position, s = Math.sign(p.x) || 1;
  m.position.addScaledVector(_w.set(s, 0, 0).transformDirection(g.matrixWorld), 0.18);
  g.userData.lost[(p.z > 0 ? 'hubF' : 'hubR') + (s > 0 ? 'L' : 'R')] = 1;
  fly(g, m, 'hub', s, 0, force * 0.7);
}

function end (d) {
  if (!d) return;
  API.scene.remove(d.m);
  d.m.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
}

/* каждый кадр: скорость машины (от неё летят детали) и детали на дороге */
export function step (dt, car) {
  if (car !== ST.car) { ST.car = car; VEL.ok = false; ST.lost = []; }
  if (car && dt > 0) {
    if (VEL.ok) { VEL.x = (car.position.x - VEL.px) / dt; VEL.z = (car.position.z - VEL.pz) / dt; if (Math.hypot(VEL.x, VEL.z) > 80) VEL.x = VEL.z = 0; }
    VEL.px = car.position.x; VEL.pz = car.position.z; VEL.ok = true;
  }
  ST.ground = DEB.length;
  if (!DEB.length) return;
  for (let i = DEB.length - 1; i >= 0; i--) {
    const d = DEB[i], m = d.m;
    d.t += dt;
    const fl = API.groundH(m.position.x, m.position.z) + d.hy - d.oy;
    if (!d.rest) {
      d.vy -= 19 * dt;
      m.position.x += d.vx * dt; m.position.y += d.vy * dt; m.position.z += d.vz * dt;
      _e.set(d.ax * dt, d.ay * dt, d.az * dt); _qa.setFromEuler(_e); m.quaternion.multiply(_qa);
      if (m.position.y < fl) {
        m.position.y = fl;
        if (d.vy < -2) {
          if (API.onLand) API.onLand(m.position.x, m.position.z, -d.vy, d.key, !!d.landed);   // звук: деталь об асфальт (impact.js)
          d.landed = 1;
          d.vy *= -0.3; d.vx *= 0.55; d.vz *= 0.55; d.ax *= 0.5; d.ay *= 0.5; d.az *= 0.5; }
        else {
          d.vy = 0; const f = Math.max(0, 1 - 5 * dt); d.vx *= f; d.vz *= f; d.ax *= f; d.ay *= f; d.az *= f;
          if (Math.hypot(d.vx, d.vz) < 0.4) d.rest = true;
        }
      }
    }
    if (d.rest) {
      // ложится плашмя: верх детали — к небу или к земле, что ближе
      _up.set(0, 1, 0).applyQuaternion(m.quaternion);
      _qt.setFromUnitVectors(_up, _w.set(0, _up.y >= 0 ? 1 : -1, 0)).multiply(m.quaternion);
      m.quaternion.slerp(_qt, Math.min(1, dt * 6));
      m.position.y += (fl - m.position.y) * Math.min(1, dt * 8);
    }
    if (d.t > PART.LIE) {
      const k = 1 - (d.t - PART.LIE) / PART.FADE;
      if (k <= 0) { end(d); DEB.splice(i, 1); continue; }
      m.scale.setScalar(Math.max(0.001, k));
    }
  }
}

/* битая ли машина (Дядя Женя выправит): вмятины, отлетевшие детали, стёкла, фары и фонари (carglass.js) */
export function hurt (car) {
  const u = car && car.userData;
  if (!u) return false;
  const lamps = u.lamps ? Object.values(u.lamps).some(l => l.st || l.cr) : false;
  return !!(u.dents || (u.rear && u.rear.st) || (u.lost && Object.keys(u.lost).length) || (u.cg && u.cg.panes.some(p => p.st)) || lamps);
}

export const DEBUG = { ST, DENT, PART, REARD, DEB, rear: car => (car && car.userData.rear) || null, lost: car => Object.keys((car && car.userData.lost) || {}).sort().join(' ') };
