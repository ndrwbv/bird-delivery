/* ──────────────────────────────────────────────────────────────────────────
   Водитель выходит через дверь (0п39, 24.10.2026; автор: «человек должен выходить через дверь в машине, а не
   появляться посреди неё и идти на меня»). Правила словами — docs/CAREER.md «Чужие машины мнутся и бьются» → «Водитель».

   До 24.10 вышедший разбираться (game.js stallCar) появлялся сразу в 1,4 м сбоку от середины машины и шёл к тебе,
   а вернувшийся пропадал, дойдя до середины машины. Теперь:
     • выход: водительская дверь (слева по ходу) открывается на CX.ANG за CX.OPEN с; человек — тот же, что сидел
       за рулём (на его месте, в позе «сидит»), — поворачивается к двери и сдвигается на порог (CX.SLIDE с), встаёт
       и выходит наружу на CX.OUT м от борта (CX.STAND с); дальше — к тебе (foewreck.js). Отошёл на CX.AWAY м (или
       прошло CX.SHUT с) — дверь закрывается за CX.CLOSE с;
     • вернулся (28 с, дальше 70 м): идёт не к середине, а к своей двери; дошёл — дверь открывается, садится (то же
       задом наперёд), дверь закрывается, машина едет;
     • дверь: у коробочной — её створка (меш doorR кузова) поворачивается на петле у передней кромки; у «Семёрки»
       (подробная копия, realcar.js detail) передняя левая дверь вырезается из кузова (треугольники кузова и деталей
       в её контуре — как бампер, CX.REAL) вместе с передней половиной бокового стекла и поворачивается так же.
       Облегчённая «Семёрка» (копий уже 4) — без двери: человек всё равно выходит сбоку, с её места.
   Машину снова ударили, пока он вылезает, — он сразу снаружи; пока садится — уже сел.
   ?oldexit — по-старому.

     init(api)               — game.js
     exit(d)                 — stallCar: посадить человека d.grp на место водителя и начать выход (d.state = 'exit')
     enter(d)                — водитель дошёл до двери (game.js updateDrivers, d.state 'back')
     door(t)                 — точка у двери (куда идти садиться): { x, z }
     step(d, dt)             — updateDrivers: 0 — не моё, 1 — веду я, 2 — сел (game.js: убрать человека, машина едет)
     tick(dt)                — раз в кадр: двери, что закрываются
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import * as WRECK from './carwreck.js';   // 0п34: дверь — тот же кусок, что перекашивает и срывает удар (carwreck.js)

export const CX = {
  on: !(typeof location !== 'undefined' && /[?&]oldexit\b/.test(location.search || '')),
  ANG: 1.1,          // рад (~63°): на сколько открывается дверь
  OPEN: 0.35,        // с: дверь открывается
  SLIDE: 0.6,        // с: поворачивается к двери, сдвигается на порог
  STAND: 0.55,       // с: встаёт и выходит наружу
  OUT: 0.5,          // м: где встаёт — от борта
  AWAY: 1.6,         // м: отошёл от двери — закрывается
  SHUT: 2.2,         // с: и так закрывается через столько после выхода
  CLOSE: 0.3,        // с: закрывается
  IN_R: 0.45,        // м: дошёл до двери — садится
  LEG: -1.45, ARM: -0.8,   // поза «сидит» (как foewreck.js FW.SEAT)
  // «Семёрка» в осях модели (realcar.js MODELS.semerka, до k = 1,2): дверь — шов у стойки (z 0) и у переднего крыла (z 0,87),
  // по высоте от порога до окна; петля у передней кромки; сиденье водителя (game-оси машины, как FW.SEAT)
  REAL: { X: 0.6, Z: [0.0, 0.87], Y: [0.28, 0.98], YD: 1.37, HX: 0.84, HZ: 0.87, SEAT: [0.43, 0.17, -0.08], DZ: 0.35, HW: 0.84 * 1.2 },   // DZ — где вылезает (м, середина проёма ближе к стойке)
};
export const ST = { exits: 0, enters: 0, doorsBox: 0, doorsReal: 0, noDoor: 0, aborts: 0, cutTris: 0 };

let A = null;
export function init (api) { A = api; }

const DOORS = new WeakMap();                         // машина → { kind, mesh, pivot, ang, want, … }
const MOVING = new Set();                            // двери, что двигаются без человека (закрываются)
const lerp = (a, b, k) => a + (b - a) * k;
const ease = k => k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k);

/* ─── дверь ─── */
function boxDoor (t) {
  const g = t.mesh, m = g && g.children.find(c => c.isMesh && c.name === 'doorR');   // doorR — у борта +x, водитель — слева по ходу (+x)
  if (!m || m.userData.lost) return null;
  if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
  const L = (m.geometry.boundingBox.max.z - m.geometry.boundingBox.min.z) / 2;
  return { kind: 'box', car: g, mesh: m, L, p0: m.position.clone(), r0: m.rotation.y, ang: 0, want: 0 };
}
function realDoor (t) {
  const g = t.mesh, R = g && g.userData.real;
  if (!R || !R.detail || !R.m) return null;
  const C = CX.REAL, P = [], UV = [], parts = [];
  R.m.traverse(o => {
    if (!o.isMesh || !o.geometry.index) return;
    const body = /^real:Car_CarBody_0$/.test(o.name), det = /^real:Car_Details_0$/.test(o.name), win = o.name === 'real:winL';
    if (!body && !det && !win) return;
    const g2 = o.geometry, pa = g2.attributes.position, ua = g2.attributes.uv, I = g2.index.array, keep = [], tris = [];
    const yMax = body ? C.Y[1] : C.YD;
    for (let q = 0; q < I.length; q += 3) {
      const a = I[q], b = I[q + 1], c = I[q + 2];
      const x = (pa.getX(a) + pa.getX(b) + pa.getX(c)) / 3, y = (pa.getY(a) + pa.getY(b) + pa.getY(c)) / 3, z = (pa.getZ(a) + pa.getZ(b) + pa.getZ(c)) / 3;
      const z0 = Math.min(pa.getZ(a), pa.getZ(b), pa.getZ(c)), z1 = Math.max(pa.getZ(a), pa.getZ(b), pa.getZ(c));   // весь треугольник — между швами (с допуском)
      const ok = win ? z0 > C.Z[0] - 0.05 : x > C.X && Math.min(pa.getX(a), pa.getX(b), pa.getX(c)) > C.X - 0.15 && z0 > C.Z[0] - 0.08 && z1 < C.Z[1] + 0.1 && y > C.Y[0] && y < yMax;
      if (ok) tris.push(a, b, c); else keep.push(a, b, c);
    }
    if (!tris.length) return;
    g2.setIndex(keep);
    // и изнутри (тот же треугольник задом наперёд): материал кузова односторонний — открытую дверь сзади было бы не видно,
    // а двусторонний — другая программа шейдера (сборка посреди удара)
    const two = [];
    for (let q = 0; q < tris.length; q += 3) two.push(tris[q], tris[q + 1], tris[q + 2]);
    for (let q = 0; q < tris.length; q += 3) two.push(tris[q], tris[q + 2], tris[q + 1]);
    parts.push({ start: P.length / 3, count: two.length, mat: o.material });
    for (const i of two) { P.push(pa.getX(i), pa.getY(i), pa.getZ(i)); UV.push(ua ? ua.getX(i) : 0, ua ? ua.getY(i) : 0); }
    ST.cutTris += tris.length / 3;
  });
  if (P.length < 9 * 4) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  geo.computeVertexNormals();
  parts.forEach((q, k) => geo.addGroup(q.start, q.count, k));
  const m = new THREE.Mesh(geo, parts.map(q => q.mat));
  m.name = 'real:door-l';
  m.position.set(-C.HX, 0, -C.HZ);                  // сетка — в осях модели, петля — в середине группы
  const pivot = new THREE.Group();
  pivot.name = 'real:door-pivot';
  pivot.position.set(C.HX, 0, C.HZ);
  pivot.add(m);
  R.m.add(pivot);
  R.dent.push(geo);                                 // мнётся с кузовом (realcar.js dentR), выбросят с копией (undetail)
  return { kind: 'real', car: g, pivot, R, ang: 0, want: 0 };
}
/* дверь водителя куском carwreck.js: та же, что перекосило или сорвало ударом (у «Семёрки» — передняя левая dfl, у коробочной — doorR) */
function wreckDoor (t) {
  const g = t.mesh, u = g && g.userData;
  if (!u) return null;
  const key = u.real ? 'dfl' : 'dl';
  if (u.real && !u.real.detail) return null;
  const P = WRECK.piece(g, key);
  if (!P) return null;
  if (!u.real && P.m && P.m.userData.lost) return null;
  return { kind: 'wr', car: g, P, R: u.real || null, ang: 0, want: 0 };
}
function doorOf (t, make) {
  let r = DOORS.get(t);
  if (r && r.kind === 'wr' && (r.car !== t.mesh || r.P.gone || (t.mesh.userData.real || null) !== r.R)) { MOVING.delete(r); DOORS.delete(t); r = null; }   // сорвало, копию убрали
  if (r && r.kind !== 'wr' && (r.car !== t.mesh || (r.kind === 'real' && (!r.pivot.parent || t.mesh.userData.real !== r.R)) || (r.kind === 'box' && r.mesh.parent !== t.mesh))) { MOVING.delete(r); DOORS.delete(t); r = null; }   // машину подменили (копия ушла, перекрасил взрыв)
  if (r || !make) return r;
  if (A.detail) A.detail(t);                        // «Семёрка» — в подробную копию: у облегчённой двери нет
  const u = t.mesh && t.mesh.userData;
  r = u && (WRECK.WR.on ? wreckDoor(t) : u.real ? realDoor(t) : boxDoor(t));
  if (r) { DOORS.set(t, r); ST[r.kind === 'real' || (r.kind === 'wr' && r.R) ? 'doorsReal' : 'doorsBox']++; } else ST.noDoor++;
  return r;
}
function setDoor (r, a) {
  if (r.ang !== a && r.car.userData) r.car.userData._pose = undefined;   // стоящая машина матрицы не пересчитывает (cull.js moved) — пересчитать
  r.ang = a;
  if (r.kind === 'wr') { WRECK.open(r.P, a); return; }
  if (r.kind === 'real') { r.pivot.rotation.y = -a; return; }
  const m = r.mesh, hx = r.p0.x, hz = r.p0.z + r.L;   // петля у передней кромки
  m.rotation.y = r.r0 - a;
  m.position.x = hx + r.L * Math.sin(a);
  m.position.z = hz - r.L * Math.cos(a);
  if (a === 0) m.position.copy(r.p0);
}

/* ─── где сидит и где дверь (оси машины: x — влево по ходу, z — вперёд) ─── */
function seatOf (t) {
  const u = t.mesh.userData;
  if (u.real) { const [x, y, z] = CX.REAL.SEAT; return { x, y, z, dz: CX.REAL.DZ, hw: CX.REAL.HW }; }
  const S = u.spec, W = u.W || 1.8;
  if (!S) return { x: 0.4, y: 0.2, z: 0, dz: 0, hw: W / 2 };
  const top = 0.42 + S.h, cf = S.cz + S.cab / 2, z = cf - Math.min(0.78, S.cab * 0.38);
  return { x: W * 0.22, y: top + 0.14 * S.ch + 0.02 - 0.85 + (u.dy || 0), z, dz: z, hw: W / 2 };
}
function world (t, lx, lz) {
  const g = t.mesh, c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y);
  return [g.position.x + lx * c + lz * s, g.position.z - lx * s + lz * c];
}
export function door (t) {
  const s = seatOf(t), [x, z] = world(t, s.hw + CX.OUT, s.z);
  return { x, z };
}

/* человек в позе k (0 — сидит за рулём, 1 — стоит снаружи у двери); поза — по фазам выхода */
function pose (d, q) {
  const t = d.t, g = t.mesh, s = seatOf(t), u = d.grp.userData;
  const kS = ease(q / 0.5), kO = ease((q - 0.5) / 0.5);   // первая половина — к порогу, вторая — встаёт и наружу
  const lx = q < 0.5 ? lerp(s.x, s.hw - 0.05, kS) : lerp(s.hw - 0.05, s.hw + CX.OUT, kO);
  const [wx, wz] = world(t, lx, lerp(s.z, s.dz, kS));   // к проёму двери (у «Семёрки» сиденье чуть за стойкой)
  const gy = A.groundH(wx, wz);
  const sitY = g.position.y + s.y;
  d.x = wx; d.z = wz;
  d.grp.position.set(wx, lerp(sitY, gy, kO), wz);
  d.grp.rotation.y = g.rotation.y + Math.PI / 2 * kS;    // лицом к двери (+x машины)
  const leg = lerp(CX.LEG, 0, kO), arm = lerp(CX.ARM, 0, Math.max(kS * 0.5, kO));
  u.legL.rotation.x = leg; u.legR.rotation.x = leg * (1 - 0.3 * Math.sin(kO * Math.PI));   // одна нога вперёд — вылезает
  u.armL.rotation.x = arm; u.armR.rotation.x = arm;
  u.qAnim = null;
}

/* ─── выход / вход ─── */
export function exit (d) {
  if (!A || !CX.on || !d.t || !d.t.mesh) return false;
  const t = d.t;
  d.cx = { ph: 'open', T: 0, door: doorOf(t, true) };
  d.state = 'exit';
  if (d.cx.door) { d.cx.door.want = CX.ANG; MOVING.delete(d.cx.door); }
  t.mesh.updateMatrixWorld(true);
  pose(d, 0);
  ST.exits++;
  return true;
}
export function enter (d) {
  if (!A || !CX.on || !d.t || !d.t.mesh || d.t.knock) return false;
  d.cx = { ph: 'open', T: 0, door: doorOf(d.t, true), back: 1 };
  d.state = 'enter';
  if (d.cx.door) MOVING.delete(d.cx.door);
  return true;
}
function doorTo (r, want, T, dt) {
  if (!r) return true;
  const a = r.ang + Math.sign(want - r.ang) * Math.min(Math.abs(want - r.ang), CX.ANG * dt / T);
  setDoor(r, a);
  return a === want;
}
export function step (d, dt) {
  if (!A || !CX.on || (d.state !== 'exit' && d.state !== 'enter')) return 0;
  const C = d.cx, t = d.t;
  if (!C || !t.mesh || t.gone) { d.state = d.state === 'enter' ? 'back' : 'chase'; return d.state === 'back' ? 2 : 0; }
  if (C.door && !doorOf(t, false)) C.door = null;      // машину подменили
  C.T += dt;
  if (d.state === 'exit') {
    if (t.knock) { pose(d, 1); d.state = 'chase'; d.cx = null; ST.aborts++; return 0; }   // снова ударили — уже снаружи
    if (C.ph === 'open') { if (doorTo(C.door, CX.ANG, CX.OPEN, dt) || C.T > CX.OPEN + 0.2) { C.ph = 'out'; C.T = 0; } pose(d, 0); return 1; }
    const q = Math.min(1, C.T / (CX.SLIDE + CX.STAND));
    pose(d, q < CX.SLIDE / (CX.SLIDE + CX.STAND) ? 0.5 * q / (CX.SLIDE / (CX.SLIDE + CX.STAND)) : 0.5 + 0.5 * (q - CX.SLIDE / (CX.SLIDE + CX.STAND)) / (CX.STAND / (CX.SLIDE + CX.STAND)));
    if (q >= 1) {
      d.state = 'chase';
      if (C.door) { C.door.want = 0; C.door.wait = CX.SHUT; C.door.who = d; MOVING.add(C.door); }
      d.cx = null;
    }
    return 1;
  }
  // садится: дверь открылась → задом наперёд → дверь закрылась → сел
  if (t.knock) { d.cx = null; ST.aborts++; return 2; }
  if (C.ph === 'open') {
    // встать лицом от двери (к машине спиной не надо — просто у двери, как вышел)
    pose(d, 1);
    if (doorTo(C.door, CX.ANG, CX.OPEN, dt) || C.T > CX.OPEN + 0.2) { C.ph = 'in'; C.T = 0; }
    return 1;
  }
  if (C.ph === 'in') {
    const q = 1 - Math.min(1, C.T / (CX.SLIDE + CX.STAND));
    const f = CX.SLIDE / (CX.SLIDE + CX.STAND);
    pose(d, q < f ? 0.5 * q / f : 0.5 + 0.5 * (q - f) / (1 - f));
    if (q <= 0) { C.ph = 'close'; C.T = 0; d.grp.visible = false; }
    return 1;
  }
  if (doorTo(C.door, 0, CX.CLOSE, dt) || C.T > CX.CLOSE + 0.2) { d.cx = null; ST.enters++; return 2; }
  return 1;
}
/* двери, что закрываются за вышедшим: отошёл на AWAY или прошло SHUT */
export function tick (dt) {
  if (!MOVING.size) return;
  for (const r of MOVING) {
    if (!r.car.parent) { MOVING.delete(r); continue; }
    const w = r.who, dw = w && !w.gone && !w.dead ? Math.hypot(w.x - r.car.position.x, w.z - r.car.position.z) : 9;
    r.wait -= dt;
    if (r.wait > 0 && dw < CX.AWAY + 1.2) continue;
    if (doorTo(r, 0, CX.CLOSE, dt)) MOVING.delete(r);
  }
}

export const DEBUG = { CX, ST, doorOf: t => DOORS.get(t) || null, door, seatOf };
