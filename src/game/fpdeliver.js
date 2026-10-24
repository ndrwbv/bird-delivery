/* ──────────────────────────────────────────────────────────────────────────
   Доставка от первого лица — первый кусок (Д2, docs/plan/doors.md; автор 24.10.2026: «ты подъехал к точке, камера от
   первого лица становится, курьер выходит из машины, подходит к багажнику, берёт пиццу, подходит к двери»).
   Пока проба: только с ?fpdeliver. Правило словами — docs/ORDERS.md «Доставка от первого лица (проба)».

   Подъезд на адресе (doorstep.js stairs) — перед ним сцена глазами курьера, всё само, ~7 с:
     1) ВЫХОД (FP.EXIT с): камера плавно уходит в глаза курьера у водительской двери; дверь открывается и закрывается
        (куски carwreck.js, как у коллег — crewride.js), за рулём пусто;
     2) К БАГАЖНИКУ (FP.TO_TRUNK с): шаги вдоль борта за корму, взгляд — на крышку;
     3) БАГАЖНИК: крышка поднимается (FP.OPEN с), руки берут коробку — много пицц одному — стопку (pizzabox.js STACK) —
        из багажника в руки (FP.TAKE с), крышка закрывается (FP.CLOSE с);
     4) К ДВЕРИ ПОДЪЕЗДА: шаги в обход машины (carround.js) до двери (FP.WALK м/с, но не дольше FP.WALK_MAX с), стоит
        перед дверью FP.HOLD с;
     5) ДОМОФОН (Д3; автор 24.10: «камера наезжает на домофон и бесшовно открывается интерфейс ввода кода на домофоне»):
        камера за FP.ZOOM с наезжает на панель домофона на двери (3D, справа от середины полотна), панель и есть ввод —
        без окна поверх: экранчик с набранным, кнопки 1—9, ⌫, 0, 🔔, лампочка. Номер квартиры — с накладной (st.home.flat,
        та же, что в листе заказа), бумажка в левой руке. Цифры / Backspace / Enter или касание кнопок на панели; верно —
        лампочка зелёная, пищит, FP.OPENED с — и подъезд, как сейчас (minigames/stairs.js, stairs3d.js); неверно — красная,
        «нет такой» на экранчике, стереть и заново. Логика — как у мини-игры домофона (minigames/intercom.js), вид — свой.
   Руки курьера (кисти и предплечья, футболка — руки голые) видны в кадре всё время, с коробкой — с шага 3.
   Пропуск шагов 1—4 — любая клавиша, кнопка геймпада, касание: сразу к домофону (коробка — в руках). У домофона Esc или
   кнопка геймпада — без набора, сразу подъезд. Машина стоит (game.js holdCar), срок идёт.

     init(api)     — game.js: { THREE, cam, scene, V, S, car(), groundH(x, z), courier() — человек курьера, box(n) — коробка /
                     стопка, door(x, z) → [x, z, nx, nz] | null — дверь подъезда и наружу от неё, setTrunk(open),
                     trunk() → { x, y, z } — середина багажника, seatOf(t) — водительское место (carexit.js),
                     driver(on), mode(), cabOut(), pad, Snd — звуки (intercom-key / ring / open / wrong, как у домофона) }
     run(st, o)    — doorstep.js stairs: Promise — сцена кончилась (или пропущена); null — без сцены (нет флага, двери)
     step(dt)      — game.js после camStep и HCAM.step: камера глазами курьера поверх обычной
     busy()        — идёт (game.js: машина стоит, ближняя граница кадра — 5 см)
     taken()       — сколько коробок уже в руках (game.js: в багажнике их больше не рисовать)
   Отладка: __dlv.FPD
   ────────────────────────────────────────────────────────────────────────── */
import * as WRECK from './carwreck.js';
import * as CROUND from './carround.js';
import { t } from '../i18n/index.js';

export const ON = typeof location !== 'undefined' && /[?&]fpdeliver\b/.test(location.search || '');

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
  // домофон (Д3)
  ZOOM: 0.9,          // с: камера наезжает на панель
  PANEL_X: 0.45,      // м: панель — правее середины двери
  PANEL_Y: 1.32,      // м: середина панели над землёй
  PANEL_D: 0.42,      // м: глаза от панели при наборе
  PANEL_EYE: 0.1,     // м: глаза выше середины панели
  WRONG: 0.9,         // с: красная лампочка и «нет такой» — потом набор чистый
  OPENED: 0.7,        // с: зелёная лампочка, пищит — потом подъезд
  MAXLEN: 4,          // цифр на экранчике
};
export const ST = { runs: 0, skips: 0, last: null, noDoor: 0 };

let A = null;
const R = { on: false, t: 0, ph: '', st: null, n: 1, done: null, path: null, len: 0, dur: 0, door: null, pc: null, doorA: 0,
  p0: null, look: null, hands: null, box: null, from: null, taken: 0, walkT: 0, bob: 0,
  pan: null, flat: '', typed: '', tries: 0, led: '', ledT: 0, keyT: 0, keyI: -1, dialT: 0, handK: 0, note: null };
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
    if (R.ph === 'zoom' || R.ph === 'dial') {        // домофон: цифры, ⌫, вызов; касание — по кнопке панели
      if (e.type === 'pointerdown') { const i = keyAt(e); if (i >= 0) press(KEYS[i]); return; }
      const k = e.key;
      if (/^[0-9]$/.test(k)) press(k);
      else if (k === 'Backspace' || k === 'Delete') press('del');
      else if (k === 'Enter' || k === ' ') press('call');
      else if (k === 'Escape') finish(true);
      return;
    }
    if (R.ph !== 'opened') toDial();               // пропуск шагов — сразу к домофону
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
  const e = car && at && A.door && A.door(at.x, at.z);
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
  if (R.pan && R.pan.g.parent) R.pan.g.parent.remove(R.pan.g);
  if (R.note) R.note.visible = false;
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
  if (pad) { if (R.ph === 'zoom' || R.ph === 'dial') { finish(true); return; } if (R.ph !== 'opened') { toDial(); return; } }
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
    if (ph === 'open' && R.t >= FP.OPEN) { R.ph = 'take'; R.t = 0; takeBox(tp); }
    else if (ph === 'take' && R.t >= FP.TAKE) { R.ph = 'close'; R.t = 0; holdBox(); if (A.setTrunk) A.setTrunk(false); }
    else if (ph === 'close' && R.t >= FP.CLOSE) {
      R.ph = 'walk'; R.t = 0;
      const d = R.door, to = [d.x + d.nx * FP.AT_DOOR, d.z + d.nz * FP.AT_DOOR];
      R.path = pathTo(car, back, to);
      R.dur = clamp(R.path.len / FP.WALK, FP.WALK_MIN, FP.WALK_MAX);
      if (ST.last) ST.last.walk = +R.path.len.toFixed(1);
    }
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
    if (R.t >= FP.HOLD) { startDial(); return; }
  } else if (ph === 'zoom' || ph === 'dial' || ph === 'opened') { dialStep(dt); return; }
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

/* ── домофон (Д3): панель на двери, камера наезжает, набор — прямо на ней ── */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'call'];
const CW = 256, CH = 448;                           // холст лицевой стороны: 0,18 × 0,315 м
const PW = 0.18, PH = 0.315;
const KEY_R = i => { const c = i % 3, r = (i / 3) | 0; return { x: 22 + c * 74, y: 182 + r * 64, w: 64, h: 54 }; };

/* звуки — те же имена, что у мини-игры домофона (doorstep.js sound; файлы public/sfx intercom-*), без файлов — синтез */
const SY = {
  key: s => s.blip(1250, 0.05, 'square', 0.06),
  ring: s => { s.blip(660, 0.18, 'square', 0.05); setTimeout(() => s.blip(520, 0.22, 'square', 0.05), 200); },
  open: s => { s.blip(180, 0.5, 'sawtooth', 0.06); },
  wrong: s => { s.blip(300, 0.1, 'square', 0.07); setTimeout(() => s.blip(220, 0.16, 'square', 0.07), 110); },
};
function sfx (n) { const S = A && A.Snd; if (!S || !S.fx || !SY[n]) return; try { S.fx('intercom-' + n, SY[n]); } catch (e) { /* — */ } }

function panel () {
  if (R.pan) return R.pan;
  const T = A.THREE, g = new T.Group();
  g.name = 'fp-intercom';
  const body = new T.Mesh(new T.BoxGeometry(PW + 0.02, PH + 0.02, 0.035), new T.MeshLambertMaterial({ color: '#3b3f46' }));
  body.position.z = -0.012;
  const cv = document.createElement('canvas');
  cv.width = CW; cv.height = CH;
  const tex = new T.CanvasTexture(cv);
  if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 4;
  const face = new T.Mesh(new T.PlaneGeometry(PW, PH), new T.MeshBasicMaterial({ map: tex }));   // подсвечена — видно и ночью
  face.position.z = 0.0065;
  g.add(body, face);
  R.pan = { g, face, cv, tex, ctx: cv.getContext('2d'), key: '' };
  return R.pan;
}

/* лицевая сторона: решётка динамика, лампочка, экранчик, кнопки; перерисовать — только когда поменялось */
function drawPanel () {
  const P = R.pan;
  if (!P) return;
  const press = R.keyT > 0 ? R.keyI : -1;
  const key = R.typed + '|' + R.led + '|' + press;
  if (key === P.key) return;
  P.key = key;
  const c = P.ctx;
  const gr = c.createLinearGradient(0, 0, CW, CH);
  gr.addColorStop(0, '#b9bec6'); gr.addColorStop(1, '#7c828b');
  c.fillStyle = gr; c.fillRect(0, 0, CW, CH);
  c.strokeStyle = '#4a4f57'; c.lineWidth = 6; c.strokeRect(3, 3, CW - 6, CH - 6);
  c.fillStyle = '#2d3036';                            // решётка
  for (let y = 0; y < 4; y++) for (let x = 0; x < 9; x++) { c.beginPath(); c.arc(56 + x * 14, 26 + y * 12, 3.2, 0, 7); c.fill(); }
  const led = R.led === 'ok' ? '#3dff6a' : R.led === 'bad' ? '#ff3b30' : '#6b4a1a';
  c.fillStyle = led; c.beginPath(); c.arc(214, 44, 11, 0, 7); c.fill();
  if (R.led) { c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.arc(210, 40, 4, 0, 7); c.fill(); }
  c.fillStyle = '#16231b'; c.fillRect(22, 84, CW - 44, 76);   // экранчик
  c.fillStyle = R.led === 'bad' ? '#ff8a7a' : '#8dffab';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  if (R.led === 'bad') { c.font = 'bold 30px monospace'; c.fillText(t('нет такой'), CW / 2, 122); }
  else if (R.led === 'ok') { c.font = 'bold 34px monospace'; c.fillText(t('открыто'), CW / 2, 122); }
  else {
    c.font = 'bold 50px monospace';
    const blink = ((performance.now() / 450) | 0) % 2 === 0 ? '_' : ' ';
    c.fillText((R.typed || '') + (R.typed.length < FP.MAXLEN ? blink : ''), CW / 2, 124);
  }
  for (let i = 0; i < 12; i++) {
    const r = KEY_R(i), on = i === press;
    c.fillStyle = on ? '#e9edf2' : '#a7adb6';
    c.fillRect(r.x, r.y, r.w, r.h);
    c.strokeStyle = '#555b64'; c.lineWidth = 3; c.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3);
    c.fillStyle = KEYS[i] === 'call' ? '#1f6f3a' : '#22252a';
    c.font = KEYS[i] === 'del' || KEYS[i] === 'call' ? 'bold 30px sans-serif' : 'bold 34px sans-serif';
    c.fillText(KEYS[i] === 'del' ? '⌫' : KEYS[i] === 'call' ? '🔔' : KEYS[i], r.x + r.w / 2, r.y + r.h / 2 + 2);
  }
  P.tex.needsUpdate = true;
}

/* бумажка с номером квартиры в левой руке (с накладной заказа) */
function note () {
  const T = A.THREE;
  if (!R.note) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 160;
    const tex = new T.CanvasTexture(cv);
    if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
    const m = new T.Mesh(new T.PlaneGeometry(0.11, 0.069), new T.MeshBasicMaterial({ map: tex }));
    m.position.set(-0.19, 0.07, -0.55);
    m.rotation.set(-0.35, 0.55, 0.08);
    m.userData.cv = cv; m.userData.tex = tex;
    R.note = m;
  }
  const m = R.note, cv = m.userData.cv, c = cv.getContext('2d');
  c.fillStyle = '#f6efd9'; c.fillRect(0, 0, 256, 160);
  c.strokeStyle = '#c9bd98'; c.lineWidth = 4; c.strokeRect(2, 2, 252, 156);
  c.fillStyle = '#5b544a'; c.font = '26px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'top';
  c.fillText(t('накладная'), 16, 12);
  c.fillStyle = '#1d3f8f'; c.font = 'bold 64px sans-serif';
  c.fillText(t('кв. {n}', { n: R.flat }), 16, 56);
  m.userData.tex.needsUpdate = true;
  if (R.hands && m.parent !== R.hands) R.hands.add(m);
  m.visible = true;
}

/* где панель: на полотне двери (game.js entranceAt: полотно — на 0,09 м наружу от точки двери), правее середины */
function panelPose () {
  const d = R.door, tx = d.nz, tz = -d.nx;
  const gx = d.x + d.nx, gz = d.z + d.nz, gy = A.groundH(gx, gz);
  const px = d.x + d.nx * 0.115 + tx * FP.PANEL_X, pz = d.z + d.nz * 0.115 + tz * FP.PANEL_X, py = gy + FP.PANEL_Y;
  return { px, py, pz, cx: px + d.nx * FP.PANEL_D, cy: py + FP.PANEL_EYE, cz: pz + d.nz * FP.PANEL_D };
}

function startDial () {
  const p = panel(), d = R.door;
  const q = panelPose();
  p.g.position.set(q.px, q.py, q.pz);
  p.g.rotation.set(0, Math.atan2(d.nx, d.nz), 0);
  if (!p.g.parent) A.scene.add(p.g);
  const h = R.st && R.st.home;
  R.flat = String((h && h.flat) || R.st.flat || 1);
  Object.assign(R, { ph: 'zoom', t: 0, typed: '', tries: 0, led: '', ledT: 0, keyT: 0, keyI: -1, dialT: 0,
    z0: { x: d.x + d.nx * FP.AT_DOOR, y: eyeY(d.x + d.nx * FP.AT_DOOR, d.z + d.nz * FP.AT_DOOR), z: d.z + d.nz * FP.AT_DOOR }, pose: q });
  p.key = '';
  drawPanel();
  note();
  if (ST.last) { ST.last.ph = 'zoom'; ST.last.flat = R.flat; ST.last.dial = null; }
}

/* пропуск шагов: коробка — сразу в руках, машина закрыта, камера — у панели */
function toDial () {
  if (!R.on || R.ph === 'zoom' || R.ph === 'dial' || R.ph === 'opened') return;
  ST.skips++;
  if (ST.last) ST.last.walkSkip = true;
  if (R.doorA) setDoor(0);
  if (A.setTrunk) A.setTrunk(false);
  if (!R.box || R.box.parent !== R.hands) {
    const tp = A.trunk ? A.trunk() : null;
    if (tp) { takeBox(tp); holdBox(); }
  }
  startDial();
  R.t = FP.ZOOM;                                    // сразу у панели
  const q = R.pose;
  R.look.x = q.px; R.look.y = q.py; R.look.z = q.pz;
}

function keyAt (e) {
  const P = R.pan;
  if (!P || !A.cam || typeof innerWidth === 'undefined') return -1;
  const T = A.THREE;
  const el = e.target && e.target.getBoundingClientRect ? e.target : null;
  const rc = el && el.tagName === 'CANVAS' ? el.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
  const v = new T.Vector2(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
  const ray = new T.Raycaster();
  ray.setFromCamera(v, A.cam);
  const hit = ray.intersectObject(P.face, false)[0];
  if (!hit || !hit.uv) return -1;
  const x = hit.uv.x * CW, y = (1 - hit.uv.y) * CH;
  for (let i = 0; i < 12; i++) { const r = KEY_R(i); if (x >= r.x - 4 && x <= r.x + r.w + 4 && y >= r.y - 4 && y <= r.y + r.h + 4) return i; }
  return -1;
}

/* нажатие на панели: как у мини-игры домофона (intercom.js) — цифры, стереть, вызов */
function press (k) {
  if (!R.on || R.ph === 'opened' || R.led === 'bad') return;
  if (R.ph === 'zoom') { R.ph = 'dial'; R.t = FP.ZOOM; }   // нажал, пока камера едет, — уже набор
  R.keyI = KEYS.indexOf(k); R.keyT = 0.12;
  if (k === 'del') { R.typed = R.typed.slice(0, -1); sfx('key'); }
  else if (k === 'call') {
    if (!R.typed) return;
    R.tries++;
    if (R.typed === R.flat) {
      R.led = 'ok'; R.ph = 'opened'; R.t = 0; sfx('ring'); setTimeout(() => sfx('open'), 260);
    } else { R.led = 'bad'; R.ledT = FP.WRONG; sfx('wrong'); }
  } else if (R.typed.length < FP.MAXLEN) { R.typed += k; sfx('key'); }
  drawPanel();
}

function dialStep (dt) {
  R.dialT += dt;                                    // R.t — уже в step()
  if (R.keyT > 0) R.keyT -= dt;
  if (R.ledT > 0 && (R.ledT -= dt) <= 0 && R.led === 'bad') { R.led = ''; R.typed = ''; }
  const q = R.pose, z0 = R.z0;
  const k = R.ph === 'zoom' ? ease(R.t / FP.ZOOM) : 1;
  R.handK = k;
  const x = lerp(z0.x, q.cx, k), y = lerp(z0.y, q.cy, k), z = lerp(z0.z, q.cz, k);
  place(A.cam, x, y, z, q.px, q.py, q.pz, dt, 1);
  drawPanel();
  if (R.ph === 'zoom' && R.t >= FP.ZOOM) R.ph = 'dial';
  if (ST.last) ST.last.ph = R.ph;
  if (R.ph === 'opened' && R.t >= FP.OPENED) {
    if (ST.last) { ST.last.dial = { ok: true, tries: R.tries, s: +R.dialT.toFixed(1) }; ST.last.ph = 'door'; }
    finish(false);
  }
}

export const busy = () => R.on;
export const taken = () => (R.on ? R.taken : 0);

export const DEBUG = {
  FP, ST, R, ON,
  get on () { return R.on; },
  get ph () { return R.ph; },
  skip: () => finish(true),
  get typed () { return R.typed; },
  get led () { return R.led; },
  get flat () { return R.flat; },
  toDial: () => toDial(),
  /* набрать как игрок: '47' — цифры и вызов; 'wrong' — сначала неверно */
  dial: (s) => { for (const ch of String(s)) press(ch === '<' ? 'del' : ch === '!' ? 'call' : ch); },
};
