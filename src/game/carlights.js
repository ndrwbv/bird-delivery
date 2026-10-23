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
   Настоящая модель (realcar.js, 23.10.2026): плашек нет — светятся сами фары и фонари модели (сила — в ud.real.lamp),
   здесь — только ореолы на их местах (rigReal).

   • Фары и задние фонари ночью (автор 18.10.2026: «ночью у машины моей всегда должны светить
     фары»): с сумерек до рассвета (ENV.night ≥ HEAD.ON) и в ливень / сильный снегопад (≥ HEAD.WX)
     горят обе фары — тёплый ореол на каждом стекле фары — и задние фонари — красный ореол.
     Включаются за ~0,2 с, выключаются с запасом (HEAD.OFF / HEAD.WX_OFF) — не мигают на границе.
     Разбитая фара или фонарь (carglass.js → kill) гаснет только она. Пятно света на асфальте
     перед машиной рисует game.js (headGlow) — его сила тоже отсюда: headK().
     lights(car, dt, night, wx) — из updateEnv каждый кадр, в любом состоянии игры (смерть,
     воскрешение, катсцена, повтор, вид из-за руля): огни не зависят от того, едешь ли ты.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

export const TURN = { OFF: true, HOLD: 1.0, PERIOD: 0.7, ON: 0.4, MIN: 0.08 };   // OFF — у игрока не мигают; с; доля руля, с которой мигает
const BRAKE_V = 0.4;                                                 // м/с: медленнее — уже не тормоз, а стоим
const REV_V = 0.3;                                                   // м/с назад — горит задний ход
/* фары своей машины: ON / OFF — ENV.night, с которой включаются / выключаются (сумерки: 0,35 на закате,
   0,3 на рассвете); WX / WX_OFF — сила дождя или снегопада (0…1); FADE — 1/с, как быстро разгораются */
export const HEAD = { ON: 0.12, OFF: 0.06, WX: 0.5, WX_OFF: 0.3, FADE: 9, k: 0, on: false, night: 0, wx: 0 };   // night, wx — что видели в последнем кадре (__dlv.CARL.HEAD)

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

/* пятно фар на асфальте (game.js headGlow): луч от машины вперёд — узкий у бампера, шире и тусклее вдали.
   Верх картинки — у машины, низ — дальний край (плоскость повёрнута, как в game.js) */
let BEAM = null;
export function beamTex () {
  if (BEAM) return BEAM;
  const W = 64, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), img = x.createImageData(W, H), d = img.data;
  const ss = (a, b, t) => { const q = Math.min(1, Math.max(0, (t - a) / (b - a))); return q * q * (3 - 2 * q); };
  for (let py = 0; py < H; py++) {
    const v = py / (H - 1), hw = 0.24 + 0.76 * Math.sqrt(v);
    const along = ss(0.02, 0.14, v) * (1 - ss(0.5, 1, v)) * (0.8 + 0.2 * ss(0.1, 0.4, v));
    for (let px = 0; px < W; px++) {
      const u = Math.abs((px + 0.5) / W * 2 - 1) / hw, a = along * (1 - ss(0.25, 1, u)), o = (py * W + px) * 4;
      d[o] = 255; d[o + 1] = 246; d[o + 2] = 222; d[o + 3] = Math.round(255 * a);
    }
  }
  x.putImageData(img, 0, 0);
  BEAM = new THREE.CanvasTexture(c); BEAM.colorSpace = THREE.SRGBColorSpace;
  return BEAM;
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

/* только ореол (без плашки): фары и задние фонари ночью */
function haloSet (car, list, hex, haloK, haloMin) {   // одна сторона: фары видно спереди, фонари — сзади
  const halo = new THREE.Mesh(quads(list, haloK, haloMin), new THREE.MeshBasicMaterial({
    color: hex, map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  halo.visible = false; halo.renderOrder = 3; halo.frustumCulled = false;
  car.add(halo);
  return { lamp: halo, halo, on: false };
}

/* где у модели передние фары: светлые вершины меша фар у переднего края ниже крыши (рамки по сторонам,
   по высоте — отдельными стёклами: фара и противотуманка — два ореола). У простой машины — свои меши фар (0xfff1c8) */
function findHeads (car, hl, top) {
  const pts = [[], []], v = new THREE.Vector3();
  for (const m of car.children) {
    if (!m.isMesh || !m.material || !m.material.isMeshBasicMaterial || m.material.map) continue;
    m.updateMatrix();
    const pos = m.geometry.attributes.position;
    if (!pos) continue;
    if (m.material.vertexColors) {
      const col = m.geometry.attributes.color;
      if (!col) continue;
      for (let i = 0; i < pos.count; i++) {
        const r = col.getX(i), g = col.getY(i), b = col.getZ(i);
        if (!(r > 0.45 && g > 0.7 && b > 0.5)) continue;              // белые, тёплые и холодные стёкла фар
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrix);
        if (v.z < hl * 0.55 || v.y > top + 0.15) continue;           // люстра на крыше, задний ход — не фары
        pts[v.x > 0 ? 1 : 0].push([v.x, v.y, v.z]);
      }
    } else if (m.material.color.getHex() === 0xfff1c8 && m.position.z > 0) {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox;
      for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
        v.set(x, y, z).applyMatrix4(m.matrix);
        pts[m.position.x > 0 ? 1 : 0].push([v.x, v.y, v.z]);
      }
    }
  }
  const out = [[], []];
  for (const s of [0, 1]) {
    const P = pts[s].sort((a, b) => a[1] - b[1]);
    let c = null;
    const flush = () => { if (c) out[s].push([(c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2, c.z1 + 0.02, c.x1 - c.x0 + 0.04, c.y1 - c.y0 + 0.04, 0]); c = null; };
    for (const p of P) {
      if (c && p[1] - c.y1 > 0.1) flush();
      if (!c) c = { x0: p[0], x1: p[0], y0: p[1], y1: p[1], z1: p[2] };
      c.x0 = Math.min(c.x0, p[0]); c.x1 = Math.max(c.x1, p[0]); c.y1 = Math.max(c.y1, p[1]); c.z1 = Math.max(c.z1, p[2]);
    }
    flush();
  }
  return out;
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

/* настоящая модель (realcar.js): фары и фонари светятся сами (программа кузова, униформы ud.real.lamp) — здесь только
   ореолы на их местах (ud.real.lampQ), без коробочных плашек; разбитые — гаснут (kill → ud.real.lamp.dead) */
function rigReal (car, Q) {
  const ud = car.userData;
  const L = {
    brake: haloSet(car, Q.tail, '#ff2626', 2.6, 0.6),
    rev: haloSet(car, Q.rev, '#f2f6ff', 3, 0.45),
    turn: [haloSet(car, Q.turn[0], '#ffa21f', 4, 0.55), haloSet(car, Q.turn[1], '#ffa21f', 4, 0.55)],
    head: haloSet(car, Q.head, '#fff1d0', 2.8, 0.6), headSide: [0, 1],
    tail: haloSet(car, Q.tail, '#ff2a2a', 2.2, 0.5),
    tailLamp: null, real: ud.real.lamp,
    side: 0, hold: 0, blinkT: 0,
    state: { head: false, brake: false, reverse: false, left: false, right: false, side: 0, found: { tail: 2, ambR: 2, ambF: 2, real: 1 } },
  };
  DEBUG.L = L;
  ud.lights = L;
  if (ud.lampDead) for (const k in ud.lampDead) apply(L, k);
  return L;
}
function rig (car) {
  const ud = car.userData, hz = ud.hazard || [];
  if (ud.real && ud.real.lampQ) return rigReal(car, ud.real.lampQ);
  if (hz.length < 4) return (ud.lights = null);           // мопед и «лёгкие» машины — без огней
  // углы кузова — по аварийке (makeCar): x = ±(W/2 − 0,1), y = верх борта + 0,08, z = ±(hl − 0,05)
  const W2 = Math.abs(hz[1].position.x) + 0.1, top = hz[0].position.y - 0.08, hlF = hz[0].position.z + 0.05, hlB = -hz[2].position.z + 0.05;
  const F = findLamps(car);
  const brake = [], rev = [], turn = [[], []], tailPlate = [];
  const H = findHeads(car, hlF, top), head = [], headSide = [];
  for (const s of [0, 1]) {
    const sg = s ? 1 : -1;
    if (!H[s].length) H[s].push([sg * (W2 - 0.27), top - 0.12, hlF + 0.02, 0.3, 0.16, 0]);   // не нашли — по углу морды
    for (const q of H[s]) { head.push(q); headSide.push(s); }
  }
  for (const s of [0, 1]) {
    const sg = s ? 1 : -1;
    const T = F.tail[s];
    // стоп-сигнал — поверх своего заднего фонаря, или где он у простой машины
    const tb = T.n ? T : { x0: sg > 0 ? W2 - 0.41 : -W2 + 0.03, x1: sg > 0 ? W2 - 0.03 : -W2 + 0.41, y0: top - 0.12, y1: top + 0.04, z0: -hlB - 0.02, n: 0 };
    const tz = tb.z0 - 0.015, tw = tb.x1 - tb.x0 + 0.04, th = tb.y1 - tb.y0 + 0.04, tx = (tb.x0 + tb.x1) / 2, ty = (tb.y0 + tb.y1) / 2;
    brake.push([tx, ty, tz, tw, th, 1]);
    tailPlate.push([tx, ty, tz + 0.005, tw - 0.04, th - 0.04, 1]);
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
    head: haloSet(car, head, '#fff1d0', 2.8, 0.6), headSide,
    tail: haloSet(car, brake, '#ff2a2a', 2.4, 0.5),
    // простая машина: задние фонари в склейке кузова (темнеют ночью) — поверх своя красная плашка
    tailLamp: F.tail[0].n + F.tail[1].n ? null : lampSet(car, tailPlate, '#c8141e', 1, 0),
    side: 0, hold: 0, blinkT: 0,
    state: { head: false, brake: false, reverse: false, left: false, right: false, side: 0, found: { tail: F.tail[0].n + F.tail[1].n, ambR: F.ambR[0].n + F.ambR[1].n, ambF: F.ambF[0].n + F.ambF[1].n } },
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
  const RL = ud.real && ud.real.lamp, c = { fl: 'x', fr: 'y', rl: 'z', rr: 'w' }[k];   // настоящая модель: гаснет сам пиксель фары
  if (RL && c) RL.dead[c] = 1;
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
  if (k[0] === 'r') {
    collapse(L.brake, s); collapse(L.rev, s); collapse(L.turn[s], 0);
    if (L.tail) collapse(L.tail, s);
    if (L.tailLamp) collapse(L.tailLamp, s);
  } else {
    collapse(L.turn[s], 1);
    if (L.head) for (let q = 0; q < L.headSide.length; q++) if (L.headSide[q] === s) collapse(L.head, q);
  }
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
  if (L.real) { L.real.on.z = braking ? 1 : 0; L.real.on.w = reverse ? 1 : 0; }   // настоящая модель: стоп-сигнал и задний ход — в программе кузова
  const st = L.state;
  st.brake = braking; st.reverse = reverse; st.side = haz ? 0 : L.side; st.left = blink && L.side > 0; st.right = blink && L.side < 0;
}

/* фары и задние фонари своей машины: night — ENV.night (0…1), wx — дождь или снегопад (0…1).
   Каждый кадр из updateEnv (game.js), в любом состоянии игры: огни собираются здесь же, если ещё нет */
export function lights (car, dt, night = 0, wx = 0, dead = false) {
  if (!car) return;
  const L = car.userData.lights === undefined ? rig(car) : car.userData.lights;
  HEAD.night = night; HEAD.wx = wx;
  HEAD.on = HEAD.on ? night >= HEAD.OFF || wx >= HEAD.WX_OFF : night >= HEAD.ON || wx >= HEAD.WX;
  if (dead) { HEAD.on = false; HEAD.k = 0; }               // «машина всё» (0п46, 24.10.2026): разбита — ни фар, ни фонарей
  HEAD.k += ((HEAD.on ? 1 : 0) - HEAD.k) * Math.min(1, HEAD.FADE * dt);
  if (!HEAD.on && HEAD.k < 0.01) HEAD.k = 0;
  if (!L || !L.head) return;
  const k = HEAD.k, on = k > 0;
  set(L.head, on, k * (0.45 + 0.4 * night));               // днём в непогоду — тусклее, ночью — ярко
  set(L.tail, on, k * (0.3 + 0.35 * night));
  if (L.tailLamp) set(L.tailLamp, on, 0.4 * k);
  if (L.real) { L.real.on.x = k * (0.75 + 0.25 * night); L.real.on.y = k; }   // настоящая модель: фары и габариты (днём в непогоду — тусклее)
  L.state.head = HEAD.on;
}
/* сила света фар 0…1 — для пятна на асфальте (game.js headGlow) */
export const headK = () => HEAD.k;

export const DEBUG = { L: null, TURN, HEAD, step, lights };
