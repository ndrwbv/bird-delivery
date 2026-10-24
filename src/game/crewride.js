/* ──────────────────────────────────────────────────────────────────────────
   Развоз смены: коллеги садятся в машину через двери и едут в ней (12бн, автор 24.10.2026: «развозишь людей со смены —
   они подходят к твоей машине, открывают двери машины и садятся»). Правила словами — docs/CAREER.md «Развоз смены».

   До 24.10 коллега доходил до машины (orders.js boardCrew) и пропадал, а у своего дома появлялся сбоку. Теперь:
     • место: первый — спереди справа (пассажир), дальше — сзади справа, сзади слева, сзади посередине (через левую);
     • посадка: дошёл до своей двери (CR.NEAR м; к ней — вокруг кузова, carround.js) — дверь открывается (CR.OPEN с),
       человек шагает внутрь и садится (CR.IN с, как водитель потока — carexit.js, задом наперёд), дверь
       захлопывается (CR.CLOSE с, звук door-close);
     • едет: сидит на своём месте всю дорогу (поза «сидит», руки на коленях) — его видно в окна и из-за руля;
     • выход: у своего дома дверь открывается, он вылезает на порог и встаёт снаружи (CR.OUT с), дальше идёт к подъезду
       уже прохожим (orders.js staffArrive); дверь закрывается за ним через CR.SHUT с.
   Двери — куски carwreck.js (у «Семёрки» — все четыре, у коробочной — только передние: сзади садятся через переднюю);
   двери нет (сорвало ударом, ?oldwreck) — просто проходит сквозь проём.
   ?oldcrew — по-старому (дошёл — пропал, у дома — появился).

     init(api)            — game.js: { makeHuman(person, o), drop(g), car(), groundH(x, z), seatOf(t) (carexit.js), Snd }
     seats(n)             — сколько мест есть (≤ 4)
     doorAt(i)            — куда идти садиться пассажиру i: { x, z } (точка снаружи у его двери)
     board(person, i, at) — пассажир i дошёл до двери: модель на его место, дверь, сел. at: { x, z } — где стоял (или null — у двери)
     alight(person, cb)   — у дома: вылезает; cb(x, z, ry) — когда встал снаружи (модель убрана, дальше — прохожий)
     busy()               — кто-то сейчас садится / вылезает
     seated()             — сколько сидит
     clear()              — убрать всех (развоз снят, смена кончилась)
     step(dt, on)         — каждый кадр; on — развоз идёт (нет — сидящие убираются)
   ────────────────────────────────────────────────────────────────────────── */
import * as WRECK from './carwreck.js';

export const CR = {
  on: !(typeof location !== 'undefined' && /[?&]oldcrew\b/.test(location.search || '')),
  NEAR: 0.55,        // м: дошёл до двери — садится
  ANG: 1.1,          // рад: насколько открывается дверь
  OPEN: 0.35,        // с: дверь открывается
  IN: 1.05,          // с: шагнул внутрь и сел (половина — внутрь на порог, половина — на сиденье)
  OUT: 1.05,         // с: вылез и встал снаружи
  CLOSE: 0.3,        // с: дверь закрывается
  SHUT: 0.5,         // с: вылез — дверь закрывается через столько
  STEP: 0.5,         // м: где стоит снаружи — от борта
  REAR: -0.84,       // м: задний ряд — на столько позади водителя
  REAR_DZ: 0.4,      // м: проём задней двери — на столько впереди заднего сиденья
  LEG: -1.45, ARM: -0.55,   // поза «сидит», руки на коленях
};
export const ST = { boarded: 0, alighted: 0, doors: 0, noDoor: 0, cleared: 0 };

let A = null;
export function init (api) { A = api; }

const lerp = (a, b, k) => a + (b - a) * k;
const ease = k => k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k);
const RIDERS = [];                                   // { person, i, g, ph, T, door, cb }
const CLOSING = [];                                  // { pc, wait }

/* места: [x — влево по ходу, z, дверь у «Семёрки», дверь у коробочной]; i — по порядку посадки */
const SEATS = [
  { side: -1, rear: 0, x: -1, key: 'dfr', box: 'dr' },
  { side: -1, rear: 1, x: -1, key: 'drr', box: 'dr' },
  { side: 1, rear: 1, x: 1, key: 'drl', box: 'dl' },
  { side: 1, rear: 1, x: 0, key: 'drl', box: 'dl' },
];
export const seats = n => Math.min(n, SEATS.length);

function carNow () { const c = A && A.car && A.car(); return c && c.parent ? c : null; }
/* место i в осях машины: { x, y, z — где группа человека; dz — середина проёма; hw — полуширина; side — сторона двери } */
function seatAt (car, i) {
  const S = SEATS[Math.min(i, SEATS.length - 1)];
  const d = A.seatOf({ mesh: car });                 // водитель (carexit.js): x — влево по ходу, z — вперёд
  const z = d.z + (S.rear ? CR.REAR : 0);
  return { x: d.x * S.x, y: d.y, z, dz: S.rear ? z + CR.REAR_DZ : d.dz, hw: d.hw, side: S.side, S };
}
function world (car, lx, lz) {
  const c = Math.cos(car.rotation.y), s = Math.sin(car.rotation.y);
  return [car.position.x + lx * c + lz * s, car.position.z - lx * s + lz * c];
}
export function doorAt (i) {
  const car = carNow();
  if (!A || !car) return null;
  const s = seatAt(car, i), [x, z] = world(car, s.side * (s.hw + CR.STEP), s.dz);
  return { x, z };
}
function doorOf (car, s) {
  if (!WRECK.WR.on) return null;
  const pc = WRECK.piece(car, car.userData.real ? s.S.key : s.S.box);
  return pc && !pc.gone ? pc : null;
}
function setDoor (R, a) {
  if (!R.door) return;
  WRECK.open(R.door, a);
  if (R.car.userData) R.car.userData._pose = undefined;   // стоящая машина матрицы не пересчитывает (cull.js) — пересчитать
}
function doorTo (R, want, T, dt) {
  if (!R.door) return true;
  const a0 = R.door.open || 0, a = a0 + Math.sign(want - a0) * Math.min(Math.abs(want - a0), CR.ANG * dt / T);
  setDoor(R, a);
  return a === want;
}

/* поза: q 0 — сидит, 1 — стоит снаружи у двери (первая половина — к порогу, вторая — встаёт и наружу) */
function pose (R, q) {
  const car = R.car, s = R.s, g = R.g, u = g.userData;
  const kS = ease(q / 0.5), kO = ease((q - 0.5) / 0.5);
  const edge = s.side * (s.hw - 0.05), out = s.side * (s.hw + CR.STEP);
  const lx = q < 0.5 ? lerp(s.x, edge, kS) : lerp(edge, out, kO);
  const lz = lerp(s.z, s.dz, kS);
  const [wx, wz] = world(car, lx, lz);
  const gy = A.groundH(wx, wz) - car.position.y;      // земля в осях машины (наклон кузова не учитываем)
  g.position.set(lx, lerp(s.y, gy, kO), lz);
  g.rotation.set(0, s.side * Math.PI / 2 * kS, 0);
  const leg = lerp(CR.LEG, 0, kO), arm = lerp(CR.ARM, 0, Math.max(kS * 0.5, kO));
  u.legL.rotation.x = leg; u.legR.rotation.x = leg * (1 - 0.3 * Math.sin(kO * Math.PI));
  u.armL.rotation.x = arm; u.armR.rotation.x = arm;
  u.qAnim = null;
  if (car.userData) car.userData._pose = undefined;
}

function build (person, car) {
  let g = null;
  try { g = A.makeHuman(person, { shirt: person.look && person.look.shirt, pants: person.look && person.look.pants }); }
  catch (e) { console.warn('[crewride] human', e); }
  if (!g) return null;
  car.add(g);
  return g;
}
function dispose (R) {
  if (!R.g) return;
  if (R.g.parent) R.g.parent.remove(R.g);
  try { A.drop(R.g); } catch (e) { /* — */ }
  R.g = null;
}

/** пассажир i дошёл до двери (orders.js boardCrew): садится. false — не вышло (по-старому: пропал) */
export function board (person, i) {
  const car = carNow();
  if (!A || !CR.on || !car || !person) return false;
  const g = build(person, car);
  if (!g) return false;
  const s = seatAt(car, i);
  const R = { person, i, g, car, s, ph: 'open', T: 0, door: doorOf(car, s), cb: null };
  ST[R.door ? 'doors' : 'noDoor']++;
  for (let k = CLOSING.length - 1; k >= 0; k--) if (CLOSING[k].pc === R.door) CLOSING.splice(k, 1);
  RIDERS.push(R);
  pose(R, 1);
  return true;
}
/** у дома: вылезает; cb(x, z, ry) — встал снаружи. false — его нет в машине (по-старому) */
export function alight (person, cb) {
  const R = RIDERS.find(r => r.person === person && r.ph === 'sit') || RIDERS.find(r => r.person === person);
  if (!R || !R.g) return false;
  if (R.car !== carNow()) { dispose(R); RIDERS.splice(RIDERS.indexOf(R), 1); return false; }
  R.ph = 'exit'; R.T = 0; R.cb = cb;
  R.door = doorOf(R.car, R.s);
  return true;
}
export const busy = () => RIDERS.some(r => r.ph !== 'sit');
export const seated = () => RIDERS.length;
export function clear () {
  for (const R of RIDERS) { if (R.door) CLOSING.push({ pc: R.door, wait: 0, car: R.car }); dispose(R); ST.cleared++; }
  RIDERS.length = 0;
}

function finishExit (R) {
  const g = R.g;
  g.updateMatrixWorld(true);
  const wx = g.matrixWorld.elements[12], wz = g.matrixWorld.elements[14];
  const ry = R.car.rotation.y + R.s.side * Math.PI / 2;
  dispose(R);
  if (R.door) CLOSING.push({ pc: R.door, wait: CR.SHUT, car: R.car });
  ST.alighted++;
  try { if (R.cb) R.cb(wx, wz, ry); } catch (e) { console.warn('[crewride] alight', e); }
}

export function step (dt, on) {
  if (!A) return;
  for (let k = CLOSING.length - 1; k >= 0; k--) {
    const C = CLOSING[k];
    if (C.pc.gone || !C.car.parent) { CLOSING.splice(k, 1); continue; }
    if ((C.wait -= dt) > 0) continue;
    if (doorTo({ door: C.pc, car: C.car }, 0, CR.CLOSE, dt)) {
      CLOSING.splice(k, 1);
      if (A.Snd) A.Snd.fx('door-close', s => s.blip(120, 0.08, 'square', 0.07), { x: C.car.position.x, z: C.car.position.z, far: 60 });
    }
  }
  if (!RIDERS.length) return;
  const car = carNow();
  if (!on && !busy()) { clear(); return; }
  for (let k = RIDERS.length - 1; k >= 0; k--) {
    const R = RIDERS[k];
    if (!R.g) { RIDERS.splice(k, 1); continue; }
    if (R.car !== car) {                             // машину подменили (взрыв, гараж) — пересаживаем на то же место
      if (!car) { dispose(R); RIDERS.splice(k, 1); continue; }
      car.add(R.g); R.car = car; R.s = seatAt(car, R.i); R.door = null;
      if (R.ph !== 'exit') R.ph = 'sit';
    }
    if (R.door && R.door.gone) R.door = null;
    R.T += dt;
    if (R.ph === 'open') {
      pose(R, 1);
      if (doorTo(R, CR.ANG, CR.OPEN, dt) || R.T > CR.OPEN + 0.2) { R.ph = 'in'; R.T = 0; }
    } else if (R.ph === 'in') {
      pose(R, 1 - Math.min(1, R.T / CR.IN));
      if (R.T >= CR.IN) { R.ph = 'close'; R.T = 0; }
    } else if (R.ph === 'close') {
      pose(R, 0);
      if (doorTo(R, 0, CR.CLOSE, dt) || R.T > CR.CLOSE + 0.2) {
        R.ph = 'sit'; R.T = 0; ST.boarded++;
        if (A.Snd && R.door) A.Snd.fx('door-close', s => s.blip(120, 0.08, 'square', 0.07), { x: R.car.position.x, z: R.car.position.z, far: 60 });
      }
    } else if (R.ph === 'sit') {
      pose(R, 0);
    } else if (R.ph === 'exit') {
      // дверь открывается — он ещё сидит; открылась — вылезает
      const op = doorTo(R, CR.ANG, CR.OPEN, dt) || R.T > CR.OPEN + 0.2;
      if (!R.out0 && op) R.out0 = R.T;
      const q = R.out0 ? Math.min(1, (R.T - R.out0) / CR.OUT) : 0;
      pose(R, q);
      if (q >= 1) { RIDERS.splice(k, 1); finishExit(R); }
    }
  }
}

export const DEBUG = { CR, ST, RIDERS, CLOSING, doorAt, busy, seated, clear };
