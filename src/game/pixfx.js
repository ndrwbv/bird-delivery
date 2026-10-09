/* ──────────────────────────────────────────────────────────────────────────
   Пиксельные частицы одним мешем (08.10.2026): дымок из-под ведущих колёс при
   резком старте (группа Е2 docs/IDEAS.md) и осколки стёкол твоей машины
   (carglass.js). Пул на PIX.N кубиков — один InstancedMesh, одна отрисовка на
   всё; новых мешей и материалов на частицу нет (как у FX в game.js), поэтому
   кадр не тяжелеет. Частица — кубик без поворота (пиксель), растёт и к концу
   жизни сжимается в ноль; прозрачность у всех одна.

   • Дымок (tires): газ с места или с малой скорости — первые TIRE.T с после
     нажатия, пока быстрее TIRE.VMAX не разогнался, — серые кубики из-под
     ведущих колёс назад и вверх. Ведущие — по машине: «Семёрка», «Копейка»,
     «Волжанка» — задние; «Нива», «Буханка», «Патриот», «Хавалка» — все четыре;
     остальные — передние. В полёте, задним ходом и в воде — нет.
   • Осколки (spawn с rest) — падают, отскакивают и лежат до конца жизни.
   • Дым из выхлопа (exhaust.js) — во втором пуле PIX.SOFT (09.10.2026, автор:
     «квадратный, ужасно»): не кубики, а круглые мягкие клубы — плоский спрайт
     к камере с размытым краем (одна текстура-облачко на всех), крутится,
     растёт и тает по прозрачности (появляется за долю секунды, к концу жизни
     растворяется). Прозрачность у каждого клуба своя (spawn a). Вторая
     отрисовка — только пока в нём что-то есть.
   Переменных игры модуль не видит: всё нужное — аргументами.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

export const PIX = { N: 160, SOFT: 200, SOFT_OP: 0.4 };   // SOFT_OP — прозрачность клуба дыма по умолчанию (spawn a)
/* дымок: T — с после нажатия газа, VMAX — м/с, быстрее уже не дымит (≈ 29 км/ч), FROM — газ нажат
   медленнее этого (м/с ≈ 11 км/ч) — «с места»; EVERY — с между клубками от колеса */
export const TIRE = { T: 0.75, VMAX: 8, FROM: 3, EVERY: 0.045 };
const DRIVE = {
  semerka: 'r', kopeyka: 'r', volga: 'r',
  niva: 'a', buhanka: 'a', patriot: 'a', havalka: 'a',
};
export const STATS = { alive: 0, spawned: 0, puffs: 0 };

let MESH = null, SOFT = null, CAM = null, LOW = () => false;
const P = [], P2 = [];                           // живые частицы: плотные и прозрачные (дым выхлопа)
const M4 = new THREE.Matrix4(), POS = new THREE.Vector3(), SCL = new THREE.Vector3(), Q = new THREE.Quaternion(), COL = new THREE.Color();
const QC = new THREE.Quaternion(), QR = new THREE.Quaternion(), ZAX = new THREE.Vector3(0, 0, 1);

/* текстура клуба: несколько мягких кругов внахлёст — пухлое облачко с размытым краем, белое (цвет — у клуба) */
function puffTex () {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  for (const [cx, cy, r, a] of [[32, 34, 26, 0.85], [24, 28, 15, 0.5], [41, 27, 14, 0.45], [33, 41, 16, 0.4], [26, 38, 12, 0.35]]) {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.55, `rgba(255,255,255,${a * 0.55})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/* пул дыма: спрайты к камере, прозрачность — своя у каждого (атрибут aA) */
function softPool (scene, n) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: puffTex(), transparent: true, depthWrite: false });
  mat.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute float aA;\nvarying float vA;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvA = aA;');
    sh.fragmentShader = 'varying float vA;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vA;');
  };
  mat.customProgramCacheKey = () => 'pixSoft';
  const geo = new THREE.PlaneGeometry(1, 1);
  const aA = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
  aA.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aA', aA);
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.setColorAt(0, COL.set(0xffffff));
  m.count = 0;
  m.frustumCulled = false;
  m.renderOrder = 2;
  m.visible = false;
  m.userData.aA = aA;
  scene.add(m);
  return m;
}

function pool (scene, n, op, geo) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: op, depthWrite: false });
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.setColorAt(0, COL.set(0xffffff));
  m.count = 0;
  m.frustumCulled = false;
  m.renderOrder = 2;
  m.visible = false;
  scene.add(m);
  return m;
}
export function init (scene, fxLow, cam) {
  if (MESH) return;
  if (fxLow) LOW = fxLow;
  CAM = cam || null;
  MESH = pool(scene, PIX.N, 0.72, new THREE.BoxGeometry(1, 1, 1));
  SOFT = softPool(scene, PIX.SOFT);
}
export const low = () => LOW();

/* o: { vx, vy, vz, s — размер, grow — /с, life, hex, g — тяжесть, drag — /с, floor — пол (y), soft — клуб дыма (мягкий спрайт),
   a — его прозрачность (по умолчанию PIX.SOFT_OP), spin — сколько крутится, рад/с } */
export function spawn (x, y, z, o) {
  if (!MESH) return;
  const L = o.soft ? P2 : P;
  if (L.length >= (o.soft ? PIX.SOFT : PIX.N)) return;
  STATS.spawned++;
  L.push({ x, y, z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, s: o.s || 0.2, grow: o.grow || 0, life: o.life || 1, max: o.life || 1,
    hex: o.hex || 0xffffff, g: o.g || 0, drag: o.drag || 0, floor: o.floor === undefined ? -1e9 : o.floor, rest: 0,
    a: o.a || PIX.SOFT_OP, rot: Math.random() * 6.283, spin: o.spin !== undefined ? o.spin : (Math.random() - 0.5) * 2.4 });
}

/* дымок из-под колёс. car — группа машины (колёса — car.userData.wheels: передние, потом задние),
   id — машина карьеры (cars.js), V — физика (x, z, h, air, sink), vf — скорость вперёд, gas — газ */
const T = { t: 0, gas: 0, acc: 0 };
export function tires (dt, car, id, V, vf, gas) {
  if (!MESH || !car) return;
  if (gas && !T.gas && vf < TIRE.FROM && vf > -0.5) T.t = TIRE.T;   // нажал газ с места
  T.gas = gas;
  if (T.t <= 0) return;
  T.t -= dt;
  // V.wade — вброд: брызги, а не дымок (streams.js)
  if (!gas || V.air || V.sink !== undefined || V.wade || vf > TIRE.VMAX || vf < -0.5) { if (vf > TIRE.VMAX || !gas) T.t = 0; return; }
  if ((T.acc -= dt) > 0) return;
  T.acc = TIRE.EVERY * (LOW() ? 2 : 1);
  const u = car.userData, W = u && u.wheels;
  if (!W || W.length < 4) return;
  const kind = DRIVE[id] || (id ? 'f' : 'r'), list = kind === 'a' ? [0, 1, 2, 3] : kind === 'r' ? [2, 3] : [0, 1];
  const fx = Math.sin(V.h), fz = Math.cos(V.h), lx = fz, lz = -fx;     // вперёд и влево
  const k = 1 - Math.max(0, vf) / TIRE.VMAX;                            // с места гуще, на разгоне тает
  for (const i of list) {
    const pv = W[i].parent.position;
    const x = car.position.x + lx * pv.x + fx * pv.z, z = car.position.z + lz * pv.x + fz * pv.z, y = car.position.y + 0.12;
    const side = pv.x > 0 ? 1 : -1;
    spawn(x - fx * 0.25 + lx * side * 0.1, y, z - fz * 0.25 + lz * side * 0.1, {
      vx: -fx * (1 + Math.random() * 1.6) + lx * side * (0.3 + Math.random() * 0.7) + (Math.random() - 0.5) * 0.6,
      vy: 0.5 + Math.random() * 0.9,
      vz: -fz * (1 + Math.random() * 1.6) + lz * side * (0.3 + Math.random() * 0.7) + (Math.random() - 0.5) * 0.6,
      s: (0.13 + Math.random() * 0.1) * (0.6 + 0.4 * k), grow: 0.45, life: 0.45 + Math.random() * 0.4 * k,
      hex: Math.random() < 0.5 ? 0xdedbd5 : 0xc4c0b8, drag: 2.2,
    });
    STATS.puffs++;
  }
}

/* шаг: всё живое — в матрицы пулов */
export function step (dt) {
  if (!MESH) return;
  STATS.alive = stepPool(MESH, P, dt) + stepSoft(dt);
}
/* дым: клубы к камере, крутятся, растут; прозрачность — быстро появиться, долго таять */
function stepSoft (dt) {
  if (CAM) QC.copy(CAM.quaternion);
  const aA = SOFT.userData.aA, arr = aA.array;
  let n = 0;
  for (let i = P2.length - 1; i >= 0; i--) {
    const p = P2[i];
    p.life -= dt;
    if (p.life <= 0) { P2[i] = P2[P2.length - 1]; P2.pop(); continue; }
    const dr = Math.exp(-p.drag * dt);
    p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr - p.g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.s += p.grow * dt; p.rot += p.spin * dt;
    const left = p.life / p.max, age = 1 - left;
    POS.set(p.x, p.y, p.z); SCL.set(p.s, p.s, p.s);
    Q.copy(QC).multiply(QR.setFromAxisAngle(ZAX, p.rot));
    SOFT.setMatrixAt(n, M4.compose(POS, Q, SCL));
    SOFT.setColorAt(n, COL.setHex(p.hex));
    arr[n] = p.a * Math.min(1, age / 0.12) * (left < 0.7 ? (left / 0.7) ** 1.3 : 1);
    n++;
  }
  Q.identity();
  SOFT.count = n;
  SOFT.visible = n > 0;
  if (n) { SOFT.instanceMatrix.needsUpdate = true; if (SOFT.instanceColor) SOFT.instanceColor.needsUpdate = true; aA.needsUpdate = true; }
  return n;
}
function stepPool (MESH, P, dt) {
  let n = 0;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    p.life -= dt;
    if (p.life <= 0) { P[i] = P[P.length - 1]; P.pop(); continue; }
    if (!p.rest) {
      const dr = Math.exp(-p.drag * dt);
      p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr - p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < p.floor + p.s / 2) {
        p.y = p.floor + p.s / 2;
        if (Math.abs(p.vy) < 1.2) { p.rest = 1; p.vx = p.vz = p.vy = 0; } else { p.vy *= -0.3; p.vx *= 0.5; p.vz *= 0.5; }
      }
      p.s += p.grow * dt;
    }
    const left = p.life / p.max, sc = p.s * (p.rest ? Math.min(1, p.life * 2) : left < 0.35 ? left / 0.35 : 1);
    POS.set(p.x, p.y, p.z); SCL.set(sc, sc, sc);
    MESH.setMatrixAt(n, M4.compose(POS, Q, SCL));
    MESH.setColorAt(n, COL.setHex(p.hex));
    n++;
  }
  MESH.count = n;
  MESH.visible = n > 0;
  if (n) { MESH.instanceMatrix.needsUpdate = true; if (MESH.instanceColor) MESH.instanceColor.needsUpdate = true; }
  return n;
}

/* новая смена: всё убрать */
export function clear () { P.length = 0; P2.length = 0; if (MESH) { MESH.count = SOFT.count = 0; MESH.visible = SOFT.visible = false; } }
