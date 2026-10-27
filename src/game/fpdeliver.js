/* Этап доставки от машины до подъезда. Короткое затемнение переводит камеру
   к глазам курьера; пиццу у багажника он берёт сам. После подхода к двери
   управление передаётся существующему домофону doorstep.js.
   Автомобильное управление и сам домофон здесь не дублируются. */
import * as WRECK from './carwreck.js';
import * as CROUND from './carround.js';
export const ON = true;

export const FP = {
  EYE: 1.62,          // м: глаза над землёй
  FOV: 68,
  FADE_OUT: 0.25, FADE_IN: 0.35,
  EXIT: 1.0,          // с: камера уходит в глаза, дверь открылась
  OUT: 0.9,           // м: встал от борта (дальше — в окно салон не видно)
  ROUND: 0.8,         // м: обход машины — на столько от кузова
  DOOR_ANG: 1.1,      // рад: насколько открывается водительская дверь
  TO_TRUNK: 1.5,      // с: вдоль борта за корму
  BACK: 1.5,          // м: стоит за кормой, чтобы был виден открытый багажник
  OPEN: 0.45,         // с: крышка поднимается
  TAKE: 0.7,          // с: коробка из багажника в руки
  CLOSE: 0.4,         // с: крышка закрывается
  WALK: 2.6,          // м/с: к двери подъезда (быстрый шаг)
  WALK_MIN: 1.3,      // с: не меньше
  WALK_MAX: 8.0,      // с: длинный путь не ускоряется до рывка
  AT_DOOR: 3.2,       // м: остановился перед входом
  INTERCOM: 2.3,      // м: приблизился к домофону, но не уткнулся в дверь
  APPROACH: 0.55, HOLD: 0.2,
  LOOK_K: 5,          // как быстро взгляд догоняет цель
  BOB: 0.035, BOB_HZ: 1.9,   // м, шагов/с: голова качается на ходу
  HL: 2.15,           // м: полудлина машины (обход)
  HW: 0.9,            // м: полуширина
  STACK_DN: 0.07, STACK_MAX: 0.25,   // м: стопку руки держат ниже — на столько за каждую коробку сверх одной (не выше)
  SKIN: '#e2ae86',
};
export const ST = { runs: 0, skips: 0, last: null, noDoor: 0 };

let A = null;
const R = { on: false, t: 0, ph: '', st: null, n: 1, done: null, path: null, len: 0, dur: 0, door: null, pc: null, doorA: 0,
  p0: null, look: null, hands: null, box: null, from: null, taken: 0, walkT: 0, bob: 0,
  handK: 0, fade: null, entryDoor: null, entryDark: null };
let V3 = null;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, k) => a + (b - a) * k;
const ease = k => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };

export function init (api) {
  A = api;
  V3 = new A.THREE.Vector3();
}

function fade (alpha) {
  if (!R.fade) {
    const el = document.createElement('div');
    el.id = 'fp-delivery-fade';
    el.style.cssText = 'position:absolute;inset:0;background:#08090c;z-index:45;pointer-events:none;opacity:0';
    (document.getElementById('game') || document.body).appendChild(el);
    R.fade = el;
  }
  R.fade.style.opacity = String(clamp(alpha, 0, 1));
  R.fade.hidden = alpha <= 0;
}

/* машина: оси — x влево по ходу, z вперёд (как crewride.js) */
function carNow () { const c = A && A.car && A.car(); return c && c.parent ? c : null; }
function world (car, lx, lz) {
  const c = Math.cos(car.rotation.y), s = Math.sin(car.rotation.y);
  return [car.position.x + lx * c + lz * s, car.position.z - lx * s + lz * c];
}
const eyeY = (x, z) => A.groundH(x, z) + FP.EYE;

/* руки: предплечья и кисти перед камерой; коробка ложится на кисти */
function hands () {
  if (R.hands) return R.hands;
  const T = A.THREE, g = new T.Group();
  g.name = 'fp-hands';
  const p = A.courier && A.courier();
  const skin = (p && p.look && p.look.skin) || FP.SKIN;
  const m = new T.MeshLambertMaterial({ color: skin, flatShading: true });
  for (const sx of [-1, 1]) {
    const arm = new T.Group();
    arm.position.set(sx * 0.17, -0.58, -0.3);
    arm.rotation.set(0.18, sx * 0.1, 0);
    const fore = new T.Mesh(new T.BoxGeometry(0.065, 0.06, 0.18), m);
    fore.position.z = -0.1;
    const palm = new T.Mesh(new T.BoxGeometry(0.07, 0.03, 0.09), m);
    palm.position.set(-sx * 0.01, 0, -0.23);
    const thumb = new T.Mesh(new T.BoxGeometry(0.023, 0.045, 0.045), m);
    thumb.position.set(-sx * 0.038, 0.025, -0.21);
    arm.add(fore, palm, thumb);
    g.add(arm);
  }
  g.userData.mat = m;
  R.hands = g;
  return g;
}
const HAND_BOX = { x: 0, y: -0.42, z: -0.55 };     // где коробка в руках (оси рук: −z — вперёд)

function dropBox () {
  const b = R.box;
  if (!b) return;
  if (b.parent) b.parent.remove(b);
  b.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (!o.material.userData.keep) o.material.dispose(); } });
  R.box = null;
}

function entryLeaf () {
  if (R.entryDoor || !R.door) return;
  const T = A.THREE, d = R.door, ry = Math.atan2(d.nx, d.nz), tx = d.nz, tz = -d.nx;
  const gy = A.groundH(d.x + d.nx, d.z + d.nz), hinge = new T.Group();
  const dark = new T.Mesh(new T.PlaneGeometry(1.5, 2.25),
    new T.MeshBasicMaterial({ color: '#151411', side: T.DoubleSide }));
  dark.position.set(d.x + d.nx * 0.13, gy + 1.12, d.z + d.nz * 0.13); dark.rotation.y = ry;
  hinge.position.set(d.x - tx * 0.75 + d.nx * 0.15, gy + 1.12, d.z - tz * 0.75 + d.nz * 0.15);
  hinge.rotation.y = ry;
  const leaf = new T.Mesh(new T.PlaneGeometry(1.5, 2.25),
    new T.MeshLambertMaterial({ color: '#5a4636', side: T.DoubleSide }));
  leaf.position.x = 0.75;
  const handle = new T.Mesh(new T.BoxGeometry(0.045, 0.05, 0.03),
    new T.MeshBasicMaterial({ color: '#c5aa6d' }));
  handle.position.set(1.33, -0.18, 0.025);
  hinge.add(leaf, handle); A.scene.add(dark, hinge);
  R.entryDoor = hinge; R.entryDark = dark;
}
function dropEntryLeaf () {
  for (const g of [R.entryDoor, R.entryDark]) {
    if (!g) continue;
    if (g.parent) g.parent.remove(g);
    g.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }
  R.entryDoor = R.entryDark = null;
}

/** doorstep.js stairs: подъезд на адресе — сначала дойти до него от первого лица */
export function run (st, o = {}) {
  if (!ON || !A || R.on || !st) return null;
  const car = carNow();
  const at = st.at || (st.peds && st.peds[0]);
  const e = car && at && A.door && A.door(at.x, at.z) ||
    (car && st.entry && [st.entry.x, st.entry.z, st.entry.nx, st.entry.nz]);
  if (!e) { ST.noDoor++; return null; }
  ST.runs++;
  const n = Math.max(1, st.boxes || 1);
  const cam = A.cam;
  V3.set(0, 0, -1).applyQuaternion(cam.quaternion).multiplyScalar(6).add(cam.position);
  Object.assign(R, { on: true, t: 0, ph: 'fade', st, n, taken: 0, walkT: 0, bob: 0, from: null, box: null,
    look: { x: V3.x, y: V3.y, z: V3.z },
    door: { x: e[0], z: e[1], nx: e[2], nz: e[3] } });
  // водительская дверь — слева (+x), как у коллег (crewride.js); нет куска (сорвало, ?oldwreck) — без неё
  R.pc = null; R.doorA = 0;
  try { if (WRECK.WR.on) { const pc = WRECK.piece(car, car.userData.real ? 'dfl' : 'dl'); if (pc && !pc.gone) R.pc = pc; } } catch (e2) { R.pc = null; }
  const seat = A.seatOf ? A.seatOf({ mesh: car }) : null;
  R.seat = { hw: seat && seat.hw ? seat.hw : FP.HW, dz: seat && Number.isFinite(seat.dz) ? seat.dz : 0.2 };
  const [sx, sz] = world(car, Math.max(R.seat.hw, FP.HW) + 0.12, R.seat.dz);
  R.p0 = { x: sx, y: eyeY(sx, sz), z: sz };
  const h = hands();
  if (!h.parent) A.scene.add(h);
  h.visible = false;
  fade(0);
  ST.last = { n, ph: 'fade', ms: 0, skip: false, walk: 0, door: +Math.hypot(e[0] - car.position.x, e[1] - car.position.z).toFixed(1) };
  R.t0 = performance.now();
  return new Promise(res => { R.done = res; });
}

/** После сюжетной встречи: от входа бегом к своей машине и обратно за руль. */
export function returnToCar (st) {
  if (!A || R.on || !st) return null;
  const car = carNow(), at = st.at || (st.peds && st.peds[0]);
  const e = car && at && A.door && A.door(at.x, at.z) ||
    (car && st.entry && [st.entry.x, st.entry.z, st.entry.nx, st.entry.nz]);
  if (!e) return null;
  const seat = A.seatOf ? A.seatOf({ mesh: car }) : null;
  R.seat = { hw: seat && seat.hw ? seat.hw : FP.HW, dz: seat && Number.isFinite(seat.dz) ? seat.dz : 0.2 };
  R.door = { x: e[0], z: e[1], nx: e[2], nz: e[3] };
  const from = [e[0] + e[2] * FP.INTERCOM, e[1] + e[3] * FP.INTERCOM];
  const to = world(car, Math.max(R.seat.hw, FP.HW) + FP.OUT, R.seat.dz);
  R.path = pathTo(car, from, to);
  R.dur = clamp(R.path.len / 4.5, 0.8, 7);
  R.t = 0; R.ph = 'return-fade'; R.on = true; R.st = st; R.box = null; R.handK = 0; R.bob = 0;
  if (R.hands) R.hands.visible = false;
  fade(1);
  return new Promise(res => { R.done = res; });
}

function setDoor (a) {
  if (!R.pc || R.pc.gone) return;
  R.doorA = a;
  WRECK.open(R.pc, a);
  const car = carNow();
  if (car && car.userData) car.userData._pose = undefined;   // стоящая машина матрицы не пересчитывает (cull.js)
}

function finish (skip) {
  if (!R.on) return;
  const leavingEntrance = R.ph === 'entry';
  R.on = false;
  if (skip) { ST.skips++; if (ST.last) ST.last.skip = true; }
  if (R.doorA) setDoor(0);
  dropEntryLeaf();
  if (A.setTrunk) A.setTrunk(false);
  dropBox();
  if (R.hands) { R.hands.visible = false; if (R.hands.parent) R.hands.parent.remove(R.hands); }
  if (leavingEntrance) requestAnimationFrame(() => fade(0)); else fade(0);
  R.handK = 0;
  if (A.driver) A.driver(true);
  R.taken = 0;
  if (ST.last) { ST.last.ms = Math.round(performance.now() - R.t0); ST.last.ph = R.ph; }
  const r = R.done; R.done = null; R.st = null;
  if (r) r(!skip);
}

/* путь пешком: от a к b, в обход машины (carround.js) — точки [x, z] */
function pathTo (car, a, b) {
  const box = { x: car.position.x, z: car.position.z, h: car.rotation.y, hl: FP.HL, hw: FP.HW };
  const pts = [a];
  let cur = { x: a[0], z: a[1] };
  for (let i = 0; i < 3; i++) {
    const w = CROUND.via(cur.x, cur.z, b[0], b[1], box, FP.ROUND);
    if (!w) break;
    pts.push(w); cur = { x: w[0], z: w[1] };
  }
  pts.push(b);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return { pts, len };
}
function along (P, k) {
  let d = k * P.len;
  for (let i = 1; i < P.pts.length; i++) {
    const a = P.pts[i - 1], b = P.pts[i], s = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d <= s || i === P.pts.length - 1) { const q = s ? clamp(d / s, 0, 1) : 1; return [lerp(a[0], b[0], q), lerp(a[1], b[1], q)]; }
    d -= s;
  }
  return P.pts[P.pts.length - 1];
}

/** каждый кадр после camStep / HCAM.step (game.js) */
export function step (dt) {
  if (!A || !R.on) return;
  const S = A.S, car = carNow();
  if (!car || S.state !== 'drive') { finish(false); return; }
  R.t += dt;
  const cam = A.cam, hw = R.seat.hw;
  const side = world(car, Math.max(hw, FP.HW) + FP.OUT, R.seat.dz); // у водительской двери снаружи — от борта, не от сиденья
  const back = world(car, 0.15, -(FP.HL + FP.BACK));                // за кормой
  const tp = A.trunk ? A.trunk() : { x: car.position.x, y: car.position.y + 0.9, z: car.position.z };
  let x = 0, z = 0, lx = 0, ly = 0, lz = 0, walking = false;
  const ph = R.ph;
  if (ph === 'return-fade') {
    if (R.t >= 0.22) { R.ph = 'return-run'; R.t = 0; }
    return;
  }
  if (ph === 'return-run') {
    const k = clamp(R.t / R.dur, 0, 1), p = along(R.path, k), to = world(car, Math.max(hw, FP.HW) + FP.OUT, R.seat.dz);
    R.bob += dt * FP.BOB_HZ * Math.PI * 3;
    const y = eyeY(p[0], p[1]) + Math.abs(Math.sin(R.bob)) * FP.BOB * 1.5;
    place(cam, p[0], y, p[1], to[0], eyeY(to[0], to[1]) - 0.2, to[1], dt, 1);
    fade(1 - ease(R.t / 0.35));
    if (k >= 1) { R.ph = 'return-enter'; R.t = 0; }
    return;
  }
  if (ph === 'return-enter') {
    const p = world(car, Math.max(hw, FP.HW) + FP.OUT, R.seat.dz);
    setDoor(FP.DOOR_ANG * Math.sin(Math.PI * clamp(R.t / 0.75, 0, 1)));
    place(cam, p[0], lerp(eyeY(p[0], p[1]), car.position.y + 1.2, ease(R.t / 0.75)), p[1],
      car.position.x, car.position.y + 1.2, car.position.z, dt, 0);
    fade(ease((R.t - 0.35) / 0.35));
    if (R.t >= 0.75) finish(false);
    return;
  }
  if (ph === 'fade') {
    fade(R.t / FP.FADE_OUT);
    if (R.t >= FP.FADE_OUT) {
      R.ph = 'exit'; R.t = 0; fade(1);
      if (A.driver) A.driver(false);
      const near = world(car, Math.max(hw, FP.HW) - 0.2, R.seat.dz - 1.2);
      R.look = { x: near[0], y: eyeY(near[0], near[1]) - 0.3, z: near[1] };
    }
    return;
  }
  if (ph === 'exit') {
    const k = ease(R.t / FP.EXIT);
    fade(1 - R.t / FP.FADE_IN);
    x = lerp(R.p0.x, side[0], k); z = lerp(R.p0.z, side[1], k);
    const y = lerp(R.p0.y, eyeY(side[0], side[1]), k);
    setDoor(FP.DOOR_ANG * Math.sin(Math.PI * clamp(R.t / FP.EXIT, 0, 1)));   // открылась — и прикрыл за собой
    const ah = world(car, Math.max(hw, FP.HW) + FP.OUT + 0.3, R.seat.dz - 4);   // глядя к корме
    const near = world(car, Math.max(hw, FP.HW) - 0.2, R.seat.dz - 1.2);
    const turn = ease((R.t / FP.EXIT - 0.25) / 0.6);
    lx = lerp(near[0], ah[0], turn);
    ly = lerp(eyeY(near[0], near[1]) - 0.3, eyeY(ah[0], ah[1]) - 0.4, turn);
    lz = lerp(near[1], ah[1], turn);
    place(cam, x, y, z, lx, ly, lz, dt, k < 0.5 ? 0 : 1);
    if (R.t >= FP.EXIT) { fade(0); setDoor(0); R.ph = 'trunk'; R.t = 0; R.path = pathTo(car, side, back); }
    return;
  }
  if (ph === 'trunk') {
    const k = ease(R.t / FP.TO_TRUNK);
    [x, z] = along(R.path, k);
    // вдоль борта — смотрит вперёд по ходу (не в окна салона), к корме — на крышку багажника
    const fw = world(car, Math.max(hw, FP.HW) + FP.OUT, -(FP.HL + 4)), q = ease((k - 0.5) / 0.4);
    lx = lerp(fw[0], tp.x, q); ly = lerp(eyeY(fw[0], fw[1]) - 0.5, tp.y - 0.15, q); lz = lerp(fw[1], tp.z, q);
    walking = true;
    if (R.t >= FP.TO_TRUNK) { R.ph = 'open'; R.t = 0; if (A.setTrunk) A.setTrunk(true); }
  } else if (ph === 'open' || ph === 'take' || ph === 'close') {
    [x, z] = back;
    lx = tp.x; ly = tp.y - (ph === 'close' ? 0 : 0.3); lz = tp.z;
    if (ph === 'open' && R.t >= FP.OPEN) { R.ph = 'take-ready'; R.t = 0; beginTake(); }
    else if (ph === 'take' && R.t >= FP.TAKE) { R.ph = 'close'; R.t = 0; holdBox(); if (A.setTrunk) A.setTrunk(false); }
    else if (ph === 'close' && R.t >= FP.CLOSE) {
      R.ph = 'walk'; R.t = 0;
      const d = R.door, to = [d.x + d.nx * FP.AT_DOOR, d.z + d.nz * FP.AT_DOOR];
      R.path = pathTo(car, back, to);
      R.dur = clamp(R.path.len / FP.WALK, FP.WALK_MIN, FP.WALK_MAX);
      if (ST.last) ST.last.walk = +R.path.len.toFixed(1);
    }
  } else if (ph === 'take-ready') {
    [x, z] = back; lx = tp.x; ly = tp.y - 0.3; lz = tp.z;
  } else if (ph === 'walk') {
    const k = R.t / R.dur;
    [x, z] = along(R.path, ease(k) * 0.15 + clamp(k, 0, 1) * 0.85);  // с места — плавно, дальше ровным шагом
    lx = R.door.x; ly = A.groundH(R.door.x, R.door.z) + 1.35; lz = R.door.z;
    walking = true;
    if (R.t >= R.dur) { R.ph = 'approach'; R.t = 0; }
  } else if (ph === 'approach') {
    const d = R.door, k = ease(R.t / FP.APPROACH), dist = lerp(FP.AT_DOOR, FP.INTERCOM, k);
    R.handK = k;
    x = d.x + d.nx * dist; z = d.z + d.nz * dist;
    lx = d.x; ly = A.groundH(d.x, d.z) + 1.35; lz = d.z;
    if (R.t >= FP.APPROACH) { R.ph = 'hold'; R.t = 0; }
  } else if (ph === 'hold') {
    const d = R.door;
    R.handK = 1;
    x = d.x + d.nx * FP.INTERCOM; z = d.z + d.nz * FP.INTERCOM;
    lx = d.x; ly = A.groundH(d.x, d.z) + 1.35; lz = d.z;
    if (R.t >= FP.HOLD) { R.ph = 'entry'; R.t = 0; return; }
  } else if (ph === 'entry') {
    const d = R.door;
    entryLeaf();
    if (R.entryDoor) R.entryDoor.rotation.y = Math.atan2(d.nx, d.nz) - 1.35 * ease(R.t / 0.45);
    x = d.x + d.nx * FP.INTERCOM; z = d.z + d.nz * FP.INTERCOM;
    lx = d.x; ly = A.groundH(d.x, d.z) + 1.35; lz = d.z;
    fade(ease(R.t / 0.45));
    if (R.t >= 0.45) { if (R.st) R.st.carry = true; finish(false); return; }
  }
  if (walking) R.bob += dt * FP.BOB_HZ * Math.PI * 2;
  const y = eyeY(x, z) + (walking ? Math.abs(Math.sin(R.bob)) * FP.BOB - FP.BOB * 0.5 : 0);
  if (R.ph === 'take') moveBox(ease(R.t / FP.TAKE));   // R.ph: в этом кадре могла уже лечь в руки (holdBox)
  place(cam, x, y, z, lx, ly, lz, dt, 1);
  if (ST.last) ST.last.ph = R.ph;
}

/* камера: стоит в (x, y, z), взгляд догоняет (lx, ly, lz); руки — за камерой (только поворот по горизонтали) */
function place (cam, x, y, z, lx, ly, lz, dt, w) {
  const L = R.look, k = 1 - Math.exp(-FP.LOOK_K * dt * (0.4 + 0.6 * w));
  L.x = lerp(L.x, lx, k); L.y = lerp(L.y, ly, k); L.z = lerp(L.z, lz, k);
  cam.position.set(x, y, z);
  cam.up.set(0, 1, 0);
  cam.lookAt(L.x, L.y, L.z);
  if (Math.abs(cam.fov - FP.FOV) > 0.01) { cam.fov = FP.FOV; cam.updateProjectionMatrix(); }
  if (A.mode && A.mode() === 'cab' && A.cabOut) A.cabOut();   // из-за руля: машину снаружи видно, салон не рисуем
  const h = R.hands;
  if (h) {
    const yaw = Math.atan2(-(L.x - x), -(L.z - z));
    const hk = R.handK;                             // у домофона руки ниже и ближе к себе — панель не загораживают
    h.position.set(x + Math.sin(yaw) * 0.25 * hk, y - Math.min(FP.STACK_MAX, (R.n - 1) * FP.STACK_DN) - 0.12 * hk, z + Math.cos(yaw) * 0.25 * hk);
    h.rotation.set(0, yaw, 0);
  }
}

/* коробка: из багажника (середина пола) — в руки */
function takeBox (tp) {
  dropBox();
  const b = A.box(R.n);
  A.scene.add(b);
  b.position.set(tp.x, tp.y - 0.2, tp.z);
  const car = carNow();
  b.rotation.set(0, car ? car.rotation.y : 0, 0);
  R.box = b;
  R.from = { x: tp.x, y: tp.y - 0.2, z: tp.z };
  R.taken = R.n;
}
function moveBox (k) {
  const b = R.box, h = R.hands;
  if (!b || !h || !R.from) return;
  V3.set(HAND_BOX.x, HAND_BOX.y, HAND_BOX.z);
  h.localToWorld(V3);
  b.position.set(lerp(R.from.x, V3.x, k), lerp(R.from.y, V3.y, k) + Math.sin(k * Math.PI) * 0.15, lerp(R.from.z, V3.z, k));
  b.rotation.y = lerp(b.rotation.y, h.rotation.y, k);
}
function holdBox () {
  const b = R.box, h = R.hands;
  if (!b || !h) return;
  if (b.parent) b.parent.remove(b);
  h.add(b);
  b.position.set(HAND_BOX.x, HAND_BOX.y, HAND_BOX.z);
  b.rotation.set(0, 0, 0);
}

function beginTake () {
  if (!R.on || R.ph !== 'take-ready') return;
  const tp = A.trunk ? A.trunk() : null;
  if (!tp) return;
  takeBox(tp);
  if (R.hands) R.hands.visible = true;
  if (R.st) R.st.carry = true;
  R.ph = 'take'; R.t = 0;
}
function toTrunk () {
  if (!R.on || (R.ph !== 'exit' && R.ph !== 'trunk')) return;
  ST.skips++;
  if (ST.last) ST.last.walkSkip = true;
  if (R.doorA) setDoor(0);
  if (A.setTrunk) A.setTrunk(true);
  R.ph = 'open'; R.t = 0;
}

export const busy = () => R.on;
export const taken = () => (R.on ? R.taken : 0);

export const DEBUG = {
  FP, ST, R, ON,
  get on () { return R.on; },
  get ph () { return R.ph; },
  toTrunk, take: beginTake,
};
