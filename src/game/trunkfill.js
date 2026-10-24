/* ──────────────────────────────────────────────────────────────────────────
   Багажник «Семёрки» изнутри (11бт, автор 24.10: «в багажнике тоже всё белое, и поэтому непонятно, что он есть;
   его надо наполнить всякими штучками, и багажник будет тёмным»). Правило словами — docs/CAREER.md «Зад машины и багажник».

   Под крышкой «Семёрки» (realcar.js) кузов сплошной и светлый: открытая крышка показывала белую дыру. Теперь в
   проёме — тёмная обивка (ванна: одна коробка, видна изнутри) и мелочи по краям: запаска, канистра, ящик с
   инструментом, аптечка, трос, тряпка, пакет. Коробки с пиццей — посередине поверх, как были (carrear.js cargo,
   carwreck.js cargoReal). Две отрисовки (обивка и мелочи одной склейкой), и только пока крышка открыта или сорвана.
   У коробочных машин (?oldcar) своя ванна с термосумкой — их не трогаем.
     step(car, open) — carrear.js step каждый кадр: собрать при первом открытии, показать / спрятать.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

/* проём крышки в осях модели (до увеличения k, как crashfx.js RLID / carwreck.js REAL_PARTS.trunk):
   x — до ±X, z — от Z0 (корма) до Z1 (у петли), пол — Y0 (там же лежат коробки), стенки — до Y1 */
export const TF = { X: 0.64, Z0: -1.93, Z1: -1.3, Y0: 0.78, Y1: 1.0, LINING: 0x1f1d22 };
export const STATS = { built: 0, shown: false };

/* мелочи: put(форма, цвет, x, в, z, поворот) — x и z доли полупроёма (−1…1; +x — левый борт, +z — к стеклу),
   в — над полом, м. Посередине (|x|, |z| до ~0,35) — место коробок с пиццей */
function stuff () {
  const out = [];
  const put = (geo, hex, x, y, z, ry = 0) => { geo.rotateY(ry); geo.translate(x, y, z); out.push([geo, hex]); };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  // запаска — лёжа у левого борта: шина и колпак; у кормы — мятая тряпка
  put(new THREE.CylinderGeometry(0.21, 0.21, 0.13, 14), '#1c1c1e', 0.68, 0.065, -0.05);
  put(new THREE.CylinderGeometry(0.1, 0.1, 0.135, 10), '#6d7178', 0.68, 0.068, -0.05);
  put(box(0.22, 0.025, 0.12), '#5c4f72', 0.55, 0.013, -0.85, 0.15);
  put(box(0.13, 0.03, 0.08), '#4d4262', 0.6, 0.03, -0.82, -0.3);
  // трос — бухта на запаске
  put(new THREE.TorusGeometry(0.1, 0.028, 5, 12).rotateX(Math.PI / 2), '#a7844a', 0.68, 0.16, -0.05);
  // канистра — у правого борта, ближе к корме (хаки) и её ручка
  put(box(0.17, 0.28, 0.28), '#4c5a2c', -0.65, 0.14, -0.55, 0.05);
  put(box(0.04, 0.05, 0.15), '#3a4522', -0.65, 0.305, -0.55, 0.05);
  // ящик с инструментом — у правого борта, ближе к стеклу (красный, с ручкой)
  put(box(0.14, 0.12, 0.32), '#8e2c24', -0.68, 0.06, 0.45, -0.04);
  put(box(0.03, 0.04, 0.18), '#2a2a2c', -0.68, 0.14, 0.45, -0.04);
  // аптечка — у кормы посередине: серая коробка с красной полосой
  put(box(0.22, 0.08, 0.1), '#b9b4a8', 0.0, 0.04, -0.85, 0.08);
  put(box(0.06, 0.082, 0.102), '#c0302a', 0.0, 0.041, -0.85, 0.08);
  // пакет — у стекла посередине (синий, мятый — два бокса)
  put(box(0.2, 0.15, 0.12), '#2f5c94', 0.02, 0.075, 0.82, 0.1);
  put(box(0.12, 0.06, 0.08), '#284f80', 0.0, 0.18, 0.8, 0.5);
  return out;
}

/* склейка без индексов: позиции, нормали, цвет — одна отрисовка */
function merge (list) {
  let n = 0;
  const geos = list.map(([g, hex]) => { const ng = g.index ? g.toNonIndexed() : g; n += ng.attributes.position.count; return [ng, new THREE.Color(hex)]; });
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
  let o = 0;
  for (const [g, c] of geos) {
    const p = g.attributes.position, q = g.attributes.normal;
    for (let i = 0; i < p.count; i++, o++) {
      P[o * 3] = p.getX(i); P[o * 3 + 1] = p.getY(i); P[o * 3 + 2] = p.getZ(i);
      N[o * 3] = q.getX(i); N[o * 3 + 1] = q.getY(i); N[o * 3 + 2] = q.getZ(i);
      C[o * 3] = c.r; C[o * 3 + 1] = c.g; C[o * 3 + 2] = c.b;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  g.computeBoundingSphere();
  return g;
}

function build (car) {
  const R = car.userData.real, k = R && R.C && R.C.k || 1;
  const x = TF.X * k, z0 = TF.Z0 * k, z1 = TF.Z1 * k, y0 = TF.Y0 * k, y1 = TF.Y1 * k;
  const grp = new THREE.Group();
  grp.name = 'trunkFill';
  // обивка: коробка во весь проём, видна изнутри (BackSide) — пол и дальние стенки; снаружи её закрывает кузов
  const lining = new THREE.Mesh(new THREE.BoxGeometry(2 * x, y1 - y0 + 0.02, z1 - z0),
    new THREE.MeshLambertMaterial({ color: TF.LINING, side: THREE.BackSide }));
  lining.position.set(0, (y0 + y1) / 2 - 0.01 - 0.006, (z0 + z1) / 2);
  grp.add(lining);
  // мелочи: x, z — доли полупроёма; пол — y0
  const list = stuff();
  const sx = x, sz = (z1 - z0) / 2, cz = (z0 + z1) / 2;
  for (const [g] of list) {
    const p = g.attributes.position;
    // в stuff() x и z — сдвиги в долях: переносим «центр» детали из долей в метры, саму форму не тянем
    g.computeBoundingBox();
    const b = g.boundingBox, mx = (b.min.x + b.max.x) / 2, mz = (b.min.z + b.max.z) / 2;
    const dx = mx * sx - mx, dz = cz + mz * sz - mz;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + dx, p.getY(i) + y0 - 0.005, p.getZ(i) + dz);
  }
  const items = new THREE.Mesh(merge(list), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  grp.add(items);
  for (const c of grp.children) { c.userData.keepMat = 1; c.castShadow = c.receiveShadow = false; }
  grp.visible = false;
  car.add(grp);
  car.userData.trunkFill = grp;
  STATS.built++;
  return grp;
}

/** каждый кадр (carrear.js step): open — крышка открыта или сорвана */
export function step (car, open) {
  const u = car && car.userData;
  if (!u || !u.real) return;
  let g = u.trunkFill;
  if (!g) { if (!open) return; g = build(car); }
  if (g.parent !== car) car.add(g);
  g.visible = !!open;
  STATS.shown = g.visible;
}
