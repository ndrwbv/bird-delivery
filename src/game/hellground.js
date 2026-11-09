/* Видимый разрез земли: вырез в полотне города плюс свой меш с кромкой, стенками и дном. */
import * as THREE from '../vendor/three.module.min.js';

const SIZE = 2048, SPAN = 420;
const U = {
  uHellCuts: { value: null },
  uHellArea: { value: new THREE.Vector2() },
  uHellCutOn: { value: 0 },
};
const lip = new THREE.Color('#3c2b2a'), rock = new THREE.Color('#683f32');
const shale = new THREE.Color('#392225'), bottom = new THREE.Color('#200f15');
const cuts = [];
let canvas, brush, mask, material, root, floor, random, dirty, lastX, lastZ;

export function cutMaterial (mat) {
  const compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = function (sh, renderer) {
    compile.call(this, sh, renderer);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vHellCut;\n' + sh.vertexShader.replace('#include <project_vertex>',
      `#include <project_vertex>
vec4 hellCutPos = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
hellCutPos = instanceMatrix * hellCutPos;
#endif
vHellCut = (modelMatrix * hellCutPos).xyz;`);
    sh.fragmentShader = `varying vec3 vHellCut;
uniform sampler2D uHellCuts;
uniform vec2 uHellArea;
uniform float uHellCutOn;
` + sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
if (uHellCutOn > 0.0) {
  vec2 uv = (vHellCut.xz - uHellArea) / ${SPAN}.0 + 0.5;
  if (all(lessThan(abs(uv - 0.5), vec2(0.5)))) {
    vec4 cut = texture2D(uHellCuts, uv);
    if (cut.a > 0.5 && vHellCut.y < cut.r * 510.0 - 176.0) discard;
  }
}`);
  };
  mat.customProgramCacheKey = () => key + '|hell-cut';
}

export function start (group, height, rand) {
  root = group; floor = height; random = rand;
  canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  brush = canvas.getContext('2d');
  mask = new THREE.CanvasTexture(canvas);
  mask.flipY = false;
  mask.minFilter = mask.magFilter = THREE.NearestFilter;
  mask.generateMipmaps = false;
  U.uHellCuts.value = mask;
  material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  lastX = lastZ = Infinity;
  dirty = true;
}

function add (x, z, rings, darkFloor, name, repaired = false) {
  const points = [], colors = [], color = new THREE.Color();
  const vertex = (p, base) => {
    points.push(...p);
    color.copy(base).multiplyScalar(random(0.72, 1.19)).toArray(colors, colors.length);
  };
  for (let row = 1; row < rings.length; row++) {
    const a = rings[row - 1], b = rings[row];
    const hi = repaired ? new THREE.Color(row === 1 ? '#242426' : '#555052') : [lip, lip, rock, shale][row - 1];
    const lo = repaired ? new THREE.Color('#575456') : [lip, rock, shale, darkFloor][row - 1];
    for (let i = 0; i < a.length; i++) {
      const j = (i + 1) % a.length;
      vertex(a[i], hi); vertex(a[j], hi); vertex(b[i], lo);
      vertex(a[j], hi); vertex(b[j], lo); vertex(b[i], lo);
    }
  }
  const base = rings.at(-1);
  const outline = base.map(p => new THREE.Vector2(p[0], p[2]));
  const fill = (a, b, c) => {
    const distance = (p, q) => Math.hypot(p[0] - q[0], p[2] - q[2]);
    if (repaired && Math.max(distance(a, b), distance(b, c), distance(c, a)) > 2.4) {
      const mid = (p, q) => repairPoint((p[0] + q[0]) / 2, (p[2] + q[2]) / 2);
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      fill(a, ab, ca); fill(ab, b, bc); fill(ca, bc, c); fill(ab, bc, ca);
      return;
    }
    vertex(a, darkFloor); vertex(b, darkFloor); vertex(c, darkFloor);
  };
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(outline, [])) fill(base[a], base[b], base[c]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  root.add(mesh);
  const reach = Math.max(...rings[0].map(p => Math.hypot(p[0] - x, p[2] - z)));
  const cut = { x, z, y: floor(x, z), mesh, contour: rings[1], outer: rings[0], reach, open: repaired ? 1 : 0.015, repaired };
  opening(cut);
  cuts.push(cut);
  dirty = true;
  return cut;
}

export const near = (x, z, radius) => cuts.some(c => Math.hypot(c.x - x, c.z - z) < radius);

export function fissure (x, z, angle, length, width, depth) {
  const ux = Math.cos(angle), uz = Math.sin(angle), rows = [];
  const count = Math.ceil(length / 1.65);
  let jitter = 0;
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    jitter = jitter * 0.42 + random(-0.75, 0.75);
    const w = 0.055 + width * Math.pow(Math.sin(Math.PI * t), 0.76) * random(0.54, 1.14);
    const along = (t - 0.5) * length;
    rows.push({ x: x + ux * along - uz * jitter, z: z + uz * along + ux * jitter, w });
  }
  const rings = [[1, 0.39, 0.20], [1, 0, 0.28], [0.86, 0, -0.38], [0.70, 0, -0.74], [0.46, 0, -1]].map(([k, ext, lift]) => {
    const edge = sign => rows.map((p, i) => {
      const s = (p.w * k + ext) * sign;
      const px = p.x - uz * s, pz = p.z + ux * s;
      const y = lift > 0 ? lift : lift * depth * Math.min(1, p.w / width);
      return [px, floor(px, pz) + y + (i % 3 - 1) * p.w * 0.14, pz];
    });
    return [...edge(1), ...edge(-1).reverse()];
  });
  return add(x, z, rings, bottom, 'hell-fissure');
}

export function crater (x, z, radius, depth, approach) {
  const ux = Math.cos(approach), uz = Math.sin(approach);
  const radial = Array.from({ length: 23 }, (_, i) => {
    const a = (i + random(-0.18, 0.18)) / 23 * Math.PI * 2;
    const r = radius * random(0.84, 1.12);
    const dx = Math.cos(a), dz = Math.sin(a);
    const entry = THREE.MathUtils.smoothstep(dx * ux + dz * uz, 0.80, 0.97);
    return [dx * r, dz * r, random(0.46, 1.18), entry];
  });
  const rings = [[1.20, 0.13, 0.07], [1, 0.72, 0.04], [0.87, -0.35, -0.17], [0.58, -0.82, -0.60], [0.34, -1, -1]].map(([k, normal, slope]) =>
    radial.map(([dx, dz, noise, entry]) => {
      const px = x + dx * k, pz = z + dz * k, lift = THREE.MathUtils.lerp(normal, slope, entry);
      return [px, floor(px, pz) + (lift > 0 ? lift * noise : lift * depth * (0.83 + noise * 0.17)), pz];
    }));
  const cut = add(x, z, rings, shale, 'hell-crater');
  cut.approach = { ux, uz, radius };
  return cut;
}

function opening (c) {
  const k = THREE.MathUtils.smoothstep(c.open, 0, 1);
  c.mesh.scale.setScalar(k);
  c.mesh.position.set(c.x * (1 - k), c.y * (1 - k), c.z * (1 - k));
}

// Точные контуры последнего заезда нужны для узнаваемых заплат на следующий день.
export const history = () => cuts.filter(c => !c.repaired).map(c => ({
  x: c.x, z: c.z, contour: c.contour, outer: c.outer, kind: c.mesh.name,
}));

export function repair (scar) {
  const { x, z } = scar;
  const outline = scar.outer || scar.contour;
  if (!Array.isArray(outline) || outline.length < 3) return;
  const rings = [1.04, 1, 0.86].map(k => outline.map(([px, , pz]) => {
    const xx = x + (px - x) * k, zz = z + (pz - z) * k;
    return repairPoint(xx, zz);
  }));
  return add(x, z, rings, new THREE.Color('#514d4b'), 'hell-repaired-ground', true);
}

function repairPoint (x, z) {
  return [x, floor(x, z) + 0.065 + Math.sin(x * 1.7 + z * 0.9) * 0.012, z];
}

export function rubbleExit (x, z, margin) {
  for (const cut of cuts) {
    const a = cut.approach;
    if (!a) continue;
    const dx = x - cut.x, dz = z - cut.z, along = dx * a.ux + dz * a.uz;
    const side = -dx * a.uz + dz * a.ux;
    if (along < -a.radius * 0.32 - margin || along > cut.reach + 4 + margin || Math.abs(side) >= 2.55 + margin) continue;
    const sign = side < 0 ? -1 : 1;
    return { x: -a.uz * sign, z: a.ux * sign };
  }
  return null;
}

// Опора берётся с тех же треугольников, которые игрок видит под машиной.
export function support (x, z, base) {
  let y = base;
  for (const cut of cuts) {
    if ((!cut.repaired && cut.mesh.name !== 'hell-crater') || Math.abs(x - cut.x) > cut.reach || Math.abs(z - cut.z) > cut.reach) continue;
    const k = cut.mesh.scale.x;
    if (k < 0.001) continue;
    const sx = (x - cut.mesh.position.x) / k, sz = (z - cut.mesh.position.z) / k;
    const p = cut.mesh.geometry.attributes.position.array;
    let surface = -Infinity;
    for (let i = 0; i < p.length; i += 9) {
      const ux = p[i + 3] - p[i], uz = p[i + 5] - p[i + 2];
      const vx = p[i + 6] - p[i], vz = p[i + 8] - p[i + 2];
      const det = ux * vz - uz * vx;
      if (Math.abs(det) < 1e-6) continue;
      const dx = sx - p[i], dz = sz - p[i + 2];
      const u = (dx * vz - dz * vx) / det, v = (ux * dz - uz * dx) / det;
      if (u < 0 || v < 0 || u + v > 1) continue;
      surface = Math.max(surface, p[i + 1] + u * (p[i + 4] - p[i + 1]) + v * (p[i + 7] - p[i + 1]));
    }
    if (surface > -Infinity) y = cut.mesh.position.y + surface * k;
  }
  return y;
}

export function update (x, z, dt = 0) {
  for (let i = 0; i < cuts.length;) {
    const c = cuts[i];
    if (c.open < 1) { c.open = Math.min(1, c.open + dt / 0.65); opening(c); dirty = true; }
    if (c.repaired) { i++; continue; }
    const distance = Math.hypot(c.x - x, c.z - z);
    const overflow = cuts.length > 26 && (c.mesh.name !== 'hell-crater' || distance > 75);
    if (distance < 210 && !overflow) { i++; continue; }
    root.remove(c.mesh);
    c.mesh.geometry.dispose();
    cuts.splice(i, 1);
    dirty = true;
  }
  if (!dirty && Math.hypot(x - lastX, z - lastZ) < 30) return;
  lastX = x; lastZ = z; dirty = false;
  const scale = SIZE / SPAN;
  brush.setTransform(1, 0, 0, 1, 0, 0);
  brush.clearRect(0, 0, SIZE, SIZE);
  brush.setTransform(scale, 0, 0, scale, SIZE * 0.5 - x * scale, SIZE * 0.5 - z * scale);
  for (const c of cuts) {
    const { contour, y } = c, k = c.mesh.scale.x;
    brush.fillStyle = 'rgb(' + THREE.MathUtils.clamp(Math.ceil((y + 180) / 2), 0, 255) + ',0,0)';
    brush.beginPath();
    brush.moveTo(c.x + (contour[0][0] - c.x) * k, c.z + (contour[0][2] - c.z) * k);
    for (let i = 1; i < contour.length; i++) brush.lineTo(c.x + (contour[i][0] - c.x) * k, c.z + (contour[i][2] - c.z) * k);
    brush.closePath();
    brush.fill();
  }
  U.uHellArea.value.set(x, z);
  U.uHellCutOn.value = cuts.length ? 1 : 0;
  mask.needsUpdate = true;
}

export function stop () {
  U.uHellCutOn.value = 0;
  U.uHellCuts.value = null;
  for (const c of cuts) c.mesh.geometry.dispose();
  cuts.length = 0;
  mask.dispose(); material.dispose();
  root = floor = random = mask = material = brush = canvas = null;
}
