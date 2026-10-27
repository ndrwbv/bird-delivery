/* Этап доставки от машины до подъезда. Камера плавно переходит к глазам курьера,
   у багажника игрок отдельным действием берёт пиццу. После подхода к двери
   управление передаётся существующему домофону doorstep.js.
   Автомобильное управление и сам домофон здесь не дублируются. */
import * as WRECK from './carwreck.js';
import * as CROUND from './carround.js';
export const ON = true;

export const FP = {
  EYE: 1.62,          // м: глаза над землёй
  FOV: 68,
  EXIT: 1.0,          // с: камера уходит в глаза, дверь открылась
  OUT: 0.9,           // м: встал от борта (дальше — в окно салон не видно)
  ROUND: 0.8,         // м: обход машины — на столько от кузова
  DOOR_ANG: 1.1,      // рад: насколько открывается водительская дверь
  TO_TRUNK: 1.5,      // с: вдоль борта за корму
  BACK: 0.7,          // м: стоит за кормой
  OPEN: 0.45,         // с: крышка поднимается
  TAKE: 0.7,          // с: коробка из багажника в руки
  CLOSE: 0.4,         // с: крышка закрывается
  WALK: 2.6,          // м/с: к двери подъезда (быстрый шаг)
  WALK_MIN: 1.3,      // с: не меньше
  WALK_MAX: 3.0,      // с: не дольше (далеко — быстрее)
  AT_DOOR: 2.6,       // м: от точки двери подъезда (game.js nearEntrance — она за полотном) — встал в ~1,5 м от двери
  HOLD: 0.35,         // с: постоял у двери
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
  handK: 0, hint: null };
let V3 = null;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, k) => a + (b - a) * k;
const ease = k => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };

export function init (api) {
  A = api;
  V3 = new A.THREE.Vector3();
  if (typeof addEventListener !== 'function') return;
  const hit = e => {
    if (!R.on) return;
    if (e.cancelable) e.preventDefault();
    e.stopImmediatePropagation();                   // ни руль, ни пауза под сценой (как сцена вручения, handcam.js)
    if (e.repeat) return;
    if (R.ph === 'take-ready') { beginTake(); return; }
    if (R.ph === 'exit' || R.ph === 'trunk') toTrunk();
  };
  addEventListener('keydown', hit, true);
  addEventListener('pointerdown', hit, true);
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
    arm.position.set(sx * 0.23, -0.56, -0.2);
    arm.rotation.set(0.35, sx * 0.12, 0);
    const fore = new T.Mesh(new T.BoxGeometry(0.085, 0.08, 0.36), m);
    fore.position.z = -0.18;
    const palm = new T.Mesh(new T.BoxGeometry(0.08, 0.035, 0.11), m);
    palm.position.set(-sx * 0.01, 0, -0.41);
    const thumb = new T.Mesh(new T.BoxGeometry(0.025, 0.06, 0.05), m);
    thumb.position.set(-sx * 0.045, 0.03, -0.38);
    arm.add(fore, palm, thumb);
    g.add(arm);
  }
  g.userData.mat = m;
  R.hands = g;
  return g;
}
const HAND_BOX = { x: 0, y: -0.36, z: -0.6 };     // где коробка в руках (оси рук: −z — вперёд)

function dropBox () {
  const b = R.box;
  if (!b) return;
  if (b.parent) b.parent.remove(b);
  b.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (!o.material.userData.keep) o.material.dispose(); } });
  R.box = null;
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
  Object.assign(R, { on: true, t: 0, ph: 'exit', st, n, taken: 0, walkT: 0, bob: 0, from: null, box: null,
    p0: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
    look: { x: V3.x, y: V3.y, z: V3.z },
    door: { x: e[0], z: e[1], nx: e[2], nz: e[3] } });
  // водительская дверь — слева (+x), как у коллег (crewride.js); нет куска (сорвало, ?oldwreck) — без неё
  R.pc = null; R.doorA = 0;
  try { if (WRECK.WR.on) { const pc = WRECK.piece(car, car.userData.real ? 'dfl' : 'dl'); if (pc && !pc.gone) R.pc = pc; } } catch (e2) { R.pc = null; }
  const seat = A.seatOf ? A.seatOf({ mesh: car }) : null;
  R.seat = { hw: seat && seat.hw ? seat.hw : FP.HW, dz: seat && Number.isFinite(seat.dz) ? seat.dz : 0.2 };
  if (A.driver) A.driver(false);                    // курьер вышел — за рулём пусто
  const h = hands();
  if (!h.parent) A.scene.add(h);
  h.visible = true;
  ST.last = { n, ph: 'exit', ms: 0, skip: false, walk: 0, door: +Math.hypot(e[0] - car.position.x, e[1] - car.position.z).toFixed(1) };
  R.t0 = performance.now();
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
  R.on = false;
  if (skip) { ST.skips++; if (ST.last) ST.last.skip = true; }
  if (R.doorA) setDoor(0);
  if (A.setTrunk) A.setTrunk(false);
  dropBox();
  if (R.hands) { R.hands.visible = false; if (R.hands.parent) R.hands.parent.remove(R.hands); }
  if (R.hint) R.hint.hidden = true;
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
  const pad = !!(A.pad && A.pad.any);
  if (!car || S.state !== 'drive') { finish(false); return; }
  if (pad) { if (R.ph === 'take-ready') { beginTake(); return; } if (R.ph === 'exit' || R.ph === 'trunk') { toTrunk(); return; } }
  R.t += dt;
  const cam = A.cam, hw = R.seat.hw;
  const side = world(car, Math.max(hw, FP.HW) + FP.OUT, R.seat.dz); // у водительской двери снаружи — от борта, не от сиденья
  const back = world(car, 0.15, -(FP.HL + FP.BACK));                // за кормой
  const tp = A.trunk ? A.trunk() : { x: car.position.x, y: car.position.y + 0.9, z: car.position.z };
  let x = 0, z = 0, lx = 0, ly = 0, lz = 0, walking = false;
  const ph = R.ph;
  if (ph === 'exit') {
    const k = ease(R.t / FP.EXIT);
    x = lerp(R.p0.x, side[0], k); z = lerp(R.p0.z, side[1], k);
    const y = lerp(R.p0.y, eyeY(side[0], side[1]), k);
    setDoor(FP.DOOR_ANG * Math.sin(Math.PI * clamp(R.t / FP.EXIT, 0, 1)));   // открылась — и прикрыл за собой
    const ah = world(car, Math.max(hw, FP.HW) + FP.OUT + 0.3, R.seat.dz - 4);   // глядя к корме
    lx = ah[0]; ly = eyeY(ah[0], ah[1]) - 0.4; lz = ah[1];
    place(cam, x, y, z, lx, ly, lz, dt, k < 0.5 ? 0 : 1);
    if (R.t >= FP.EXIT) { setDoor(0); R.ph = 'trunk'; R.t = 0; R.path = pathTo(car, side, back); }
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
    if (ph === 'open' && R.t >= FP.OPEN) { R.ph = 'take-ready'; R.t = 0; showTakeHint(); }
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
    if (R.t >= R.dur) { R.ph = 'hold'; R.t = 0; }
  } else if (ph === 'hold') {
    const d = R.door;
    x = d.x + d.nx * FP.AT_DOOR; z = d.z + d.nz * FP.AT_DOOR;
    lx = d.x; ly = A.groundH(d.x, d.z) + 1.35; lz = d.z;
    if (R.t >= FP.HOLD) { if (R.st) R.st.carry = true; finish(false); return; }
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

function showTakeHint () {
  if (!R.hint) {
    const el = document.createElement('div');
    el.id = 'fp-take-hint';
    el.style.cssText = 'position:absolute;left:50%;bottom:11%;transform:translateX(-50%);z-index:42;padding:12px 18px;border-radius:12px;background:rgba(20,21,28,.88);color:#fff;font:16px sans-serif;text-align:center;cursor:pointer';
    el.textContent = 'E / A — забрать пиццу';
    el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); beginTake(); });
    (document.getElementById('game') || document.body).appendChild(el);
    R.hint = el;
  }
  R.hint.hidden = false;
}
function beginTake () {
  if (!R.on || R.ph !== 'take-ready') return;
  const tp = A.trunk ? A.trunk() : null;
  if (!tp) return;
  if (R.hint) R.hint.hidden = true;
  takeBox(tp);
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
