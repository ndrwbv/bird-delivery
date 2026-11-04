/* Следы колёс в глубоком снегу вне дорог. Короткие рельефные борозды
   добавляются в один буфер; дворовую дорожную колею этот слой не меняет. */
import * as THREE from '../vendor/three.module.min.js';

export const ST = { segments: 0 };
const CAP = 1200, VERTS = 72, PROFILE = [-0.31, -0.23, -0.14, 0, 0.14, 0.23, 0.31];
const HEIGHT = [0.12, 0.19, 0.13, 0.12, 0.13, 0.19, 0.12];
const COLORS = [0xdce5e8, 0xeef3f4, 0xd6e1e3, 0xd2dde0, 0xd6e1e3, 0xeef3f4, 0xdce5e8];
const ALPHA = [0, 178, 218, 236, 218, 178, 0];
const POS = new Float32Array(CAP * VERTS * 3), NOR = new Float32Array(CAP * VERTS * 3),
  COL = new Uint8Array(CAP * VERTS * 4);
let mesh = null, last = null, used = 0;

export function init (scene) {
  if (mesh) return;
  const g = new THREE.BufferGeometry();
  const p = new THREE.BufferAttribute(POS, 3), c = new THREE.BufferAttribute(COL, 4, true);
  p.setUsage(THREE.DynamicDrawUsage); c.setUsage(THREE.DynamicDrawUsage);
  for (let i = 1; i < NOR.length; i += 3) NOR[i] = 1;
  g.setAttribute('position', p); g.setAttribute('normal', new THREE.BufferAttribute(NOR, 3));
  g.setAttribute('color', c); g.setDrawRange(0, 0);
  // Вычислять границы всего города для каждого добавленного следа не нужно.
  // Нормаль направлена вверх: свет совпадает со снегом вокруг, а бока
  // борозды не чернеют из-за крутых полигонов.
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide,
    transparent: true, depthWrite: false });
  mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh);
}

export function reset () {
  used = 0; last = null; ST.segments = 0;
  if (mesh) { mesh.geometry.setDrawRange(0, 0); mesh.visible = false; }
}

export function step (V, snow, deep, groundH) {
  if (!mesh) return;
  mesh.visible = snow > 0.55 && used > 0;
  if (snow <= 0.55 || !deep || V.air || V.wade || V.sink !== undefined) { last = null; return; }
  if (!last) { last = { x: V.x, z: V.z, h: V.h }; return; }
  const d = Math.hypot(V.x - last.x, V.z - last.z);
  if (d < 0.65) return;
  if (d > 7) { last = { x: V.x, z: V.z, h: V.h }; return; }
  const prev = last;
  if (used + VERTS > POS.length / 3) reset();
  last = { x: V.x, z: V.z, h: V.h };
  let at = used;
  const write = (x, z, off, sideX, sideZ, index) => {
    const px = x + sideX * off, pz = z + sideZ * off;
    const v = at++, i = v * 3, c = v * 4, col = COLORS[index];
    POS[i] = px; POS[i + 1] = groundH(px, pz) + HEIGHT[index]; POS[i + 2] = pz;
    COL[c] = col >> 16; COL[c + 1] = (col >> 8) & 255; COL[c + 2] = col & 255; COL[c + 3] = ALPHA[index];
  };
  for (const side of [-0.82, 0.82]) {
    const psx = Math.cos(prev.h), psz = -Math.sin(prev.h), csx = Math.cos(V.h), csz = -Math.sin(V.h);
    const px = prev.x + psx * side, pz = prev.z + psz * side;
    const cx = V.x + csx * side, cz = V.z + csz * side;
    for (let i = 0; i < PROFILE.length - 1; i++) {
      write(px, pz, PROFILE[i], psx, psz, i);
      write(cx, cz, PROFILE[i], csx, csz, i);
      write(cx, cz, PROFILE[i + 1], csx, csz, i + 1);
      write(px, pz, PROFILE[i], psx, psz, i);
      write(cx, cz, PROFILE[i + 1], csx, csz, i + 1);
      write(px, pz, PROFILE[i + 1], psx, psz, i + 1);
    }
  }
  used = at; ST.segments++;
  mesh.geometry.setDrawRange(0, used);
  mesh.geometry.attributes.position.needsUpdate = true;
  mesh.geometry.attributes.color.needsUpdate = true;
  mesh.visible = true;
}
