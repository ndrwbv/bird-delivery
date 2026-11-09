/* Следующий день: новые перекрытия, недоложенные стены и леса на пострадавших домах. */
import * as THREE from '../vendor/three.module.min.js';

const pose = new THREE.Object3D();
const groups = [];
let root, box, materials;

export function start (world) {
  root = world;
  box = new THREE.BoxGeometry(1, 1, 1);
  materials = ['#a29b8e', '#cc933c', '#5b8190', '#9e5941'].map(color =>
    new THREE.MeshLambertMaterial({ color, flatShading: true }));
}

export function rebuild (h) {
  const group = new THREE.Group(), parts = materials.map(() => []);
  group.name = 'hell-house-rebuilding';
  group.position.set(h.ox, h.hHi, h.oz);
  group.rotation.y = -Math.atan2(h.uz, h.ux);
  const add = (mat, x, y, z, sx, sy, sz, rz = 0) => parts[mat].push({ x, y, z, sx, sy, sz, rz });
  const cut = h.cut - h.hHi, top = Math.min(h.top - h.hHi - 0.5, cut + 7.1);
  const nx = Math.max(2, Math.ceil(h.hx * 2 / 4.8)), nz = Math.max(2, Math.ceil(h.hz * 2 / 4.8));
  // Перекрытия достроенных этажей и открытый каркас следующего.
  for (let y = cut + 0.22; y < top; y += 3.05) {
    const height = Math.min(2.8, top - y);
    add(0, 0, y, 0, h.hx * 1.98, 0.24, h.hz * 1.98);
    for (let i = 0; i <= nx; i++) for (const side of [-1, 1]) {
      const x = -h.hx + i / nx * h.hx * 2;
      add(0, x, y + height * 0.5, side * h.hz, 0.3, height, 0.35);
      // Кирпичная стена ещё не доведена до потолка, остаются проёмы.
      if (i < nx && (i + Math.round(y)) % 3 !== 0)
        add(3, x + h.hx / nx, y + 0.65, side * h.hz, h.hx * 1.6 / nx, 1.15, 0.24);
    }
    for (let i = 1; i < nz; i++) for (const side of [-1, 1])
      add(0, side * h.hx, y + height * 0.5, -h.hz + i / nz * h.hz * 2, 0.35, height, 0.3);
  }
  // Леса охватывают уцелевший низ и недостроенные этажи.
  for (const side of [-1, 1]) {
    const z = side * (h.hz + 0.85);
    for (let i = 0; i <= nx; i++) {
      const x = -h.hx - 0.6 + i / nx * (h.hx * 2 + 1.2);
      add(1, x, top * 0.5, z, 0.095, top + 0.5, 0.095);
      if (i < nx) {
        const w = (h.hx * 2 + 1.2) / nx;
        for (let y = 1.8; y < top; y += 2.9) {
          add(1, x + w * 0.5, y, z, w, 0.08, 0.12);
          add(0, x + w * 0.5, y - 0.12, z, w, 0.08, 0.7);
          if (i % 2 === 0) add(1, x + w * 0.5, y + 1.2, z, 0.065, Math.hypot(w, 2.4), 0.065, -Math.atan2(w, 2.4));
        }
      }
    }
    // Полосы защитной сетки, между ними видны свежая кладка и проёмы.
    add(2, -h.hx * 0.38, cut + 2.3, z + side * 0.05, h.hx * 0.85, 3.7, 0.04);
  }
  // Небольшой башенный кран над площадкой.
  const cx = h.hx * 0.65, cz = h.hz * 0.3, crane = top + 7;
  const boom = Math.min(36, h.hx * 2.25);
  for (const dx of [-0.32, 0.32]) for (const dz of [-0.32, 0.32])
    add(1, cx + dx, crane * 0.5, cz + dz, 0.11, crane, 0.11);
  for (let y = 1; y < crane; y += 1.3) add(1, cx, y, cz, 0.82, 0.09, 0.82);
  add(1, cx - boom * 0.18, crane - 0.1, cz, boom, 0.18, 0.7);
  add(1, cx - boom * 0.18, crane + 0.65, cz, boom, 0.1, 0.1);
  for (let i = 0; i < boom / 2; i++)
    add(1, cx - boom * 0.68 + i * 2, crane + 0.28, cz, 0.07, 2.1, 0.07, i % 2 ? 1.19 : -1.19);
  add(2, cx + 0.7, crane - 0.8, cz, 1.2, 1.1, 0.95);
  add(0, cx + boom * 0.25, crane - 0.4, cz, 1.6, 0.65, 0.9);
  add(1, cx - boom * 0.63, crane - 2.8, cz, 0.045, 5, 0.045);
  add(0, cx - boom * 0.63, crane - 5.5, cz, 1.4, 0.2, 0.8);
  for (let i = 0; i < parts.length; i++) {
    const mesh = new THREE.InstancedMesh(box, materials[i], parts[i].length);
    for (let j = 0; j < parts[i].length; j++) {
      const p = parts[i][j];
      pose.position.set(p.x, p.y, p.z); pose.rotation.set(0, 0, p.rz); pose.scale.set(p.sx, p.sy, p.sz); pose.updateMatrix();
      mesh.setMatrixAt(j, pose.matrix);
    }
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  root.add(group); groups.push(group);
}

export function stop () {
  for (const group of groups) { group.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); root.remove(group); }
  groups.length = 0;
  box.dispose(); materials.forEach(m => m.dispose());
  root = box = materials = null;
}
