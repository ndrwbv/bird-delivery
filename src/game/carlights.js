/* ──────────────────────────────────────────────────────────────────────────
   Огни машины игрока: стоп-сигналы, поворотники, фонарь заднего хода.
   Правила словами — docs/CAREER.md «Машины игрока: огни».

   • Тормозишь (тормоз на ходу вперёд или газ, пока катишься назад) —
     горят стоп-сигналы: яркий красный поверх задних фонарей и красный
     ореол. Обычные задние фонари чуть приглушены (габариты), чтобы
     разницу было видно и днём.
   • Поворотники у машины игрока выключены (TURN.OFF, 04.10.2026: автору мешали —
     мигали от любого руля). Включить обратно — TURN.OFF = false: тогда руль
     зажат — мигает с той стороны, после руля ещё TURN.HOLD с, от TURN.MIN хода.
     У машин города поворотники свои и остаются.
   • Едешь назад — белый фонарь заднего хода рядом с задними фонарями.

   Где фонари у каждой модели, модуль находит сам: в меше фар (склейка без
   света из cars.js — dress) ищет красные и оранжевые вершины сзади и
   спереди. Нет такого меша (простая машина) — ставит по углам кузова,
   там же, где аварийка. Источников света нет: только яркие плашки и
   ореолы (прозрачные, складываются с картинкой), видны, только когда горят.
   step(car, dt, vf, steer, brake, gas, night) — из driveStep каждый кадр.
   kill(car, угол) — фонарь разбит (carglass.js): его плашки больше не горят.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

export const TURN = { OFF: true, HOLD: 1.0, PERIOD: 0.7, ON: 0.4, MIN: 0.08 };   // OFF — у игрока не мигают; с; доля руля, с которой мигает
const BRAKE_V = 0.4;                                                 // м/с: медленнее — уже не тормоз, а стоим
const REV_V = 0.3;                                                   // м/с назад — горит задний ход

let GLOW = null;
function glowTex () {
  if (GLOW) return GLOW;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 1, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  GLOW = new THREE.CanvasTexture(c); GLOW.colorSpace = THREE.SRGBColorSpace;
  return GLOW;
}

/* плашки (лампа) и ореол одним мешем каждая: q — [x, y, z, w, h, назад?] */
function quads (list, k = 1, pad = 0) {
  const gs = list.map(([x, y, z, w, h, back]) => {
    const g = new THREE.PlaneGeometry(Math.max(w * k, pad), Math.max(h * k, pad));
    if (back) g.rotateY(Math.PI);
    return g.translate(x, y, z);
  });
  const pos = [], idx = [];
  for (const g of gs) {
    const o = pos.length / 3;
    pos.push(...g.attributes.position.array);
    for (const i of g.index.array) idx.push(i + o);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(gs.flatMap(() => [0, 1, 1, 1, 0, 0, 1, 0]), 2));
  out.setIndex(idx);
  out.computeBoundingSphere();
  return out;
}

function lampSet (car, list, hex, haloK, haloMin) {
  const lamp = new THREE.Mesh(quads(list), new THREE.MeshBasicMaterial({ color: hex, side: THREE.DoubleSide }));
  const halo = new THREE.Mesh(quads(list, haloK, haloMin), new THREE.MeshBasicMaterial({
    color: hex, map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5, side: THREE.DoubleSide }));
  lamp.visible = halo.visible = false;
  halo.renderOrder = 3;
  lamp.frustumCulled = halo.frustumCulled = false;
  car.add(lamp, halo);
  return { lamp, halo, on: false };
}

/* где у модели задние красные и оранжевые: рамки по сторонам */
function findLamps (car) {
  const box = () => ({ x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity, n: 0 });
  const F = { tail: [box(), box()], ambR: [box(), box()], ambF: [box(), box()] };   // [0] — правый (−X), [1] — левый (+X)
  const v = new THREE.Vector3();
  for (const m of car.children) {
    if (!m.isMesh || !m.material || !m.material.isMeshBasicMaterial || !m.material.vertexColors) continue;
    const col = m.geometry.attributes.color, pos = m.geometry.attributes.position;
    if (!col || !pos) continue;
    m.updateMatrix();
    const dim = [];
    for (let i = 0; i < pos.count; i++) {
      const r = col.getX(i), g = col.getY(i), b = col.getZ(i);
      const red = r > 0.4 && g < 0.08 && b < 0.12, amb = r > 0.8 && g > 0.2 && g < 0.55 && b < 0.1;
      if (!red && !amb) continue;
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrix);
      const k = red ? (v.z < 0 ? F.tail : null) : v.z < 0 ? F.ambR : F.ambF;
      if (!k) continue;
      const B = k[v.x > 0 ? 1 : 0];
      B.x0 = Math.min(B.x0, v.x); B.x1 = Math.max(B.x1, v.x); B.y0 = Math.min(B.y0, v.y); B.y1 = Math.max(B.y1, v.y);
      B.z0 = Math.min(B.z0, v.z); B.z1 = Math.max(B.z1, v.z); B.n++;
      if (red) dim.push(i);
    }
    // задние фонари — габариты: чуть тусклее, стоп-сигнал заметно ярче
    for (const i of dim) col.setXYZ(i, col.getX(i) * 0.5, col.getY(i) * 0.5, col.getZ(i) * 0.5);
    if (dim.length) col.needsUpdate = true;
  }
  return F;
}

function rig (car) {
  const ud = car.userData, hz = ud.hazard || [];
  if (hz.length < 4) return (ud.lights = null);           // мопед и «лёгкие» машины — без огней
  // углы кузова — по аварийке (makeCar): x = ±(W/2 − 0,1), y = верх борта + 0,08, z = ±(hl − 0,05)
  const W2 = Math.abs(hz[1].position.x) + 0.1, top = hz[0].position.y - 0.08, hlF = hz[0].position.z + 0.05, hlB = -hz[2].position.z + 0.05;
  const F = findLamps(car);
  const brake = [], rev = [], turn = [[], []];
  for (const s of [0, 1]) {
    const sg = s ? 1 : -1;
    const T = F.tail[s];
    // стоп-сигнал — поверх своего заднего фонаря, или где он у простой машины
    const tb = T.n ? T : { x0: sg > 0 ? W2 - 0.41 : -W2 + 0.03, x1: sg > 0 ? W2 - 0.03 : -W2 + 0.41, y0: top - 0.12, y1: top + 0.04, z0: -hlB - 0.02, n: 0 };
    const tz = tb.z0 - 0.015, tw = tb.x1 - tb.x0 + 0.04, th = tb.y1 - tb.y0 + 0.04, tx = (tb.x0 + tb.x1) / 2, ty = (tb.y0 + tb.y1) / 2;
    brake.push([tx, ty, tz, tw, th, 1]);
    // задний ход — белая плашка ближе к середине от фонаря
    const inner = sg > 0 ? tb.x0 : tb.x1;
    rev.push([inner - sg * 0.11, ty, tz, 0.14, Math.min(0.12, th), 1]);
    // поворотники: свои оранжевые сзади и спереди, нет — у внешнего края фонаря и по углам морды
    const R = F.ambR[s], Fr = F.ambF[s];
    if (R.n) turn[s].push([(R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2, R.z0 - 0.016, R.x1 - R.x0 + 0.04, R.y1 - R.y0 + 0.04, 1]);
    else turn[s].push([(sg > 0 ? tb.x1 : tb.x0) - sg * 0.06, tb.y0 - 0.07, tz, 0.12, 0.08, 1]);
    if (Fr.n) turn[s].push([(Fr.x0 + Fr.x1) / 2, (Fr.y0 + Fr.y1) / 2, Fr.z1 + 0.016, Fr.x1 - Fr.x0 + 0.04, Fr.y1 - Fr.y0 + 0.04, 0]);
    else turn[s].push([sg * (W2 - 0.12), top - 0.2, hlF + 0.01, 0.14, 0.08, 0]);
  }
  const L = {
    brake: lampSet(car, brake, '#ff2626', 3.2, 0.7),
    rev: lampSet(car, rev, '#f2f6ff', 4, 0.5),
    turn: [lampSet(car, turn[0], '#ffa21f', 4, 0.55), lampSet(car, turn[1], '#ffa21f', 4, 0.55)],
    side: 0, hold: 0, blinkT: 0,
    state: { brake: false, reverse: false, left: false, right: false, side: 0, found: { tail: F.tail[0].n + F.tail[1].n, ambR: F.ambR[0].n + F.ambR[1].n, ambF: F.ambF[0].n + F.ambF[1].n } },
  };
  DEBUG.L = L;
  ud.lights = L;
  if (ud.lampDead) for (const k in ud.lampDead) apply(L, k);    // разбиты раньше, чем огни собрались
  return L;
}

/* разбитый фонарь (carglass.js): его плашки больше не горят. k — угол: 'rl' / 'rr' / 'fl' / 'fr'
   (r — сзади / f — спереди, l — левый бок +X, r — правый −X) */
export function kill (car, k) {
  const ud = car && car.userData;
  if (!ud) return;
  (ud.lampDead || (ud.lampDead = {}))[k] = 1;
  if (ud.lights) apply(ud.lights, k);
}
function collapse (set, q) {
  for (const m of [set.lamp, set.halo]) {
    const a = m.geometry.attributes.position;
    if (!a || a.count < (q + 1) * 4) continue;
    for (let i = q * 4 + 1; i < q * 4 + 4; i++) a.setXYZ(i, a.getX(q * 4), a.getY(q * 4), a.getZ(q * 4));
    a.needsUpdate = true;
  }
}
function apply (L, k) {
  const s = k[1] === 'l' ? 1 : 0;
  if (k[0] === 'r') { collapse(L.brake, s); collapse(L.rev, s); collapse(L.turn[s], 0); }
  else collapse(L.turn[s], 1);
}

function set (S, on, op) {
  if (S.on !== on) { S.on = on; S.lamp.visible = S.halo.visible = on; }
  if (on) S.halo.material.opacity = op;
}

/* vf — скорость вдоль машины (м/с, назад — минус), steer — руль (+ влево) */
export function step (car, dt, vf, steer, brake, gas, night = 0) {
  if (!car) return;
  const L = car.userData.lights === undefined ? rig(car) : car.userData.lights;
  if (!L) return;
  const braking = !!((brake && vf > BRAKE_V) || (gas && vf < -BRAKE_V));
  const reverse = vf < -REV_V && !gas;
  // поворотник: руль зажат — мигает с той стороны; отпустил — ещё HOLD с
  const want = !TURN.OFF && Math.abs(steer) > TURN.MIN ? Math.sign(steer) : 0;
  if (want) {
    if (want !== L.side) { L.side = want; L.blinkT = 0; }   // новая сторона — сразу вспышка
    L.hold = TURN.HOLD;
  } else if (L.side && (L.hold -= dt) <= 0) L.side = 0;
  L.blinkT += dt;
  const hz = car.userData.hazard, haz = hz && hz.some(m => m.visible);
  const blink = !!L.side && !haz && (L.blinkT % TURN.PERIOD) < TURN.ON;
  const op = 0.3 + 0.6 * night;                             // ночью ореол ярче
  set(L.brake, braking, op);
  set(L.rev, reverse, op * 0.8);
  set(L.turn[1], blink && L.side > 0, op);                  // +X — левый бок
  set(L.turn[0], blink && L.side < 0, op);
  const st = L.state;
  st.brake = braking; st.reverse = reverse; st.side = haz ? 0 : L.side; st.left = blink && L.side > 0; st.right = blink && L.side < 0;
}

export const DEBUG = { L: null, TURN, step };
