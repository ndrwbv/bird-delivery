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
   Переменных игры модуль не видит: всё нужное — аргументами.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

export const PIX = { N: 160 };
/* дымок: T — с после нажатия газа, VMAX — м/с, быстрее уже не дымит (≈ 29 км/ч), FROM — газ нажат
   медленнее этого (м/с ≈ 11 км/ч) — «с места»; EVERY — с между клубками от колеса */
export const TIRE = { T: 0.75, VMAX: 8, FROM: 3, EVERY: 0.045 };
const DRIVE = {
  semerka: 'r', kopeyka: 'r', volga: 'r',
  niva: 'a', buhanka: 'a', patriot: 'a', havalka: 'a',
};
export const STATS = { alive: 0, spawned: 0, puffs: 0 };

let MESH = null, LOW = () => false;
const P = [];                                    // живые частицы
const M4 = new THREE.Matrix4(), POS = new THREE.Vector3(), SCL = new THREE.Vector3(), Q = new THREE.Quaternion(), COL = new THREE.Color();

export function init (scene, fxLow) {
  if (MESH) return;
  if (fxLow) LOW = fxLow;
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, depthWrite: false });
  MESH = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, PIX.N);
  MESH.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  MESH.setColorAt(0, COL.set(0xffffff));
  MESH.count = 0;
  MESH.frustumCulled = false;
  MESH.renderOrder = 2;
  scene.add(MESH);
}

/* o: { vx, vy, vz, s — размер, grow — /с, life, hex, g — тяжесть, drag — /с, floor — пол (y) } */
export function spawn (x, y, z, o) {
  if (!MESH || P.length >= PIX.N) return;
  STATS.spawned++;
  P.push({ x, y, z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, s: o.s || 0.2, grow: o.grow || 0, life: o.life || 1, max: o.life || 1,
    hex: o.hex || 0xffffff, g: o.g || 0, drag: o.drag || 0, floor: o.floor === undefined ? -1e9 : o.floor, rest: 0 });
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
  if (!gas || V.air || V.sink !== undefined || vf > TIRE.VMAX || vf < -0.5) { if (vf > TIRE.VMAX || !gas) T.t = 0; return; }
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

/* шаг: всё живое — в матрицы пула */
export function step (dt) {
  if (!MESH) return;
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
  STATS.alive = n;
  if (n) { MESH.instanceMatrix.needsUpdate = true; if (MESH.instanceColor) MESH.instanceColor.needsUpdate = true; }
}

/* новая смена: всё убрать */
export function clear () { P.length = 0; if (MESH) MESH.count = 0; }
