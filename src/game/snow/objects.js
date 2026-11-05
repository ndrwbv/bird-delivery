/* Ближние шапки снега на реальной верхней поверхности кузова. Один меш
   на игрока и восемь ближайших машин, одна программа, ограниченный буфер.
   Верх получаем из треугольников кузова; размер машины не превращается
   в белую коробку, стёкла/колёса/люди не становятся принимающей опорой. */
import * as THREE from '../../vendor/three.module.min.js';
import { shadeInject } from '../fakeshadows.js';

const MAX_CARS = 9, MAX_VERTS = 32760, STEP = 0.16, DISTANCE = 34;
const MAX_PROP_CAPS = 80, TEMPLATE_VERTS = 8190, TEMPLATE_TRIANGLES = 4096;
const TEMPLATE_BUDGET = 384 * 1024, PROP_CACHE_LIMIT = 64, PRESS_LIMIT = 128, PRESS_RADIUS = 0.35;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
const AB = new THREE.Vector3(), AC = new THREE.Vector3(), N = new THREE.Vector3();
const INV = new THREE.Matrix4(), REL = new THREE.Matrix4();
const NORMAL = new THREE.Matrix3();

// Верхние грани конкретной лавочки, включая отсутствующие/наклонённые
// доски broken. У склейки читаем только диапазон вершин этой вещи.
function benchBoards (bench, indexSpan) {
  const prop = bench.prop, boards = [], seen = new Set(), ry = bench.ry || 0, cs = Math.cos(ry), sn = Math.sin(ry);
  const read = (node, first = 0, length = Infinity) => {
    const pos = node.geometry?.attributes.position, idx = node.geometry?.index;
    if (!pos?.array || (idx && !idx.array)) return;
    node.updateWorldMatrix(true, false);
    const end = Math.min(pos.count, first + length), count = idx ? Math.min(idx.count, indexSpan?.end ?? idx.count) : end;
    for (let i = idx ? indexSpan?.begin || 0 : first; i + 2 < count; i += 3) {
      const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
      if (ia < first || ia >= end || ib < first || ib >= end || ic < first || ic >= end) continue;
      A.fromBufferAttribute(pos, ia).applyMatrix4(node.matrixWorld); B.fromBufferAttribute(pos, ib).applyMatrix4(node.matrixWorld); C.fromBufferAttribute(pos, ic).applyMatrix4(node.matrixWorld);
      N.crossVectors(AB.subVectors(B, A), AC.subVectors(C, A)).normalize();
      if (N.y < 0.92 || Math.min(A.y, B.y, C.y) < bench.y + 0.56) continue;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      const y = Math.max(A.y, B.y, C.y);
      for (const v of [A, B, C]) {
        const dx = v.x - bench.x, dz = v.z - bench.z, lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
        x0 = Math.min(x0, lx); x1 = Math.max(x1, lx); z0 = Math.min(z0, lz); z1 = Math.max(z1, lz);
      }
      if (x1 - x0 < 0.15 || z1 - z0 < 0.02) continue;
      const key = [x0, x1, z0, z1, y].map(v => Math.round(v * 100)).join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      boards.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, y, w: x1 - x0, d: z1 - z0 });
      if (boards.length >= 16) return;
    }
  };
  if (prop?.pivot) prop.pivot.traverse(o => { if (o.isMesh && o.visible) read(o); });
  else if (prop?.mesh) read(prop.mesh, prop.v0 || 0, prop.nv || 0);
  return boards;
}

// Captured before the city's indexed batches discard CPU index arrays. Keep
// only real board tops, in bench-local XZ and height relative to bench.y;
// raised-land alignment may then move the bench without invalidating the cap.
const capturedBenches = new WeakMap();
let capturedBytes = 0, capturedCount = 0;
export function captureBench (bench, indexSpan) {
  if (!bench?.prop?.mesh || capturedBenches.has(bench)) return false;
  const boards = benchBoards(bench, indexSpan);
  if (!boards.length) return false;
  const data = new Float32Array(Math.min(16, boards.length) * 5);
  for (let i = 0; i < data.length / 5; i++) {
    const b = boards[i]; data.set([b.x, b.z, b.y - bench.y, b.w, b.d], i * 5);
  }
  capturedBenches.set(bench, data); capturedCount++; capturedBytes += data.byteLength + 128;
  return true;
}
export function captureBenches (benches) {
  const groups = new Map();
  for (const b of benches || []) {
    const mesh = b.prop?.mesh;
    if (!mesh || capturedBenches.has(b)) continue;
    if (!mesh.geometry.index) { captureBench(b); continue; }
    if (!mesh.geometry.index.array) continue;
    if (!groups.has(mesh)) groups.set(mesh, []);
    groups.get(mesh).push({ b, first: b.prop.v0, last: b.prop.v0 + b.prop.nv, begin: Infinity, end: 0 });
  }
  for (const [mesh, rows] of groups) {
    rows.sort((a, b) => a.first - b.first);
    const idx = mesh.geometry.index;
    // mergeGeos appends each object's indices contiguously. Locate the spans
    // with one shared pass; never scan the whole city chunk for every bench.
    for (let i = 0; i + 2 < idx.count; i += 3) {
      const v = idx.getX(i);
      let lo = 0, hi = rows.length - 1, hit = -1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (rows[mid].first <= v) { hit = mid; lo = mid + 1; } else hi = mid - 1; }
      if (hit < 0 || v >= rows[hit].last) continue;
      const row = rows[hit]; row.begin = Math.min(row.begin, i); row.end = i + 3;
    }
    for (const row of rows) if (row.end > row.begin) captureBench(row.b, row);
  }
}
function savedBenchBoards (bench) {
  const data = capturedBenches.get(bench);
  if (!data) return benchBoards(bench);
  const boards = [];
  for (let i = 0; i < data.length; i += 5) boards.push({ x: data[i], z: data[i + 1], dy: data[i + 2], w: data[i + 3], d: data[i + 4] });
  return boards;
}

function canopyRoof (stop) {
  const item = stop.it, attr = item?.mesh?.geometry?.attributes.position;
  if (!attr?.array || !item.nv) return null;
  let top = -Infinity;
  for (let i = item.v0; i < item.v0 + item.nv; i++) top = Math.max(top, attr.getY(i));
  // Размеры stopParts('roof'), а высота — из уже поднятой склейки города.
  return Number.isFinite(top) ? [{ x: 0, z: 0, y: top, w: 4.4, d: 2.2 }] : null;
}

function isReceiver (node, root) {
  if (!node.isMesh || node.isInstancedMesh || node.isSkinnedMesh || !node.geometry?.attributes.position?.array || !node.visible) return false;
  if (node.geometry.index && !node.geometry.index.array) return false;
  const mat = node.material;
  if (!mat || Array.isArray(mat) || mat.transparent || mat.opacity < 0.95 || node.userData.snowCap) return false;
  for (let p = node.parent; p && p !== root; p = p.parent) if (!p.visible) return false;
  if (mat.userData.body) return true;
  if (root.userData?.real) return false;
  if (!mat.isMeshLambertMaterial) return false;
  if (node.name === 'hood' || node.name === 'trunk') return true;
  if (node.parent !== root) return false;
  if ((root.userData?.wheels || []).includes(node)) return false;
  return !/glass|lamp|shadow|wheel|driver|passenger|seat/i.test(node.name);
}

function signature (root) {
  let s = '';
  root.traverse(o => {
    if (isReceiver(o, root)) s += o.id + ':' + o.geometry.id + ':' + o.geometry.attributes.position.version + ':' + Math.round(o.rotation.x * 10) + ':' + Math.round(o.position.y * 20) + ';';
  });
  return s;
}

function template (root, sig, scratch) {
  root.updateWorldMatrix(true, true);
  INV.copy(root.matrixWorld).invert();
  const { triangles, positions, normals, snow, heights, amounts } = scratch;
  let triangleLength = 0, vertices = 0;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  root.traverse(o => {
    if (!isReceiver(o, root)) return;
    const geo = o.geometry, pos = geo.attributes.position, index = geo.index, sn = geo.attributes.aSnw;
    REL.multiplyMatrices(INV, o.matrixWorld);
    const count = index ? index.count : pos.count;
    for (let i = 0; i + 2 < count && triangleLength < triangles.length; i += 3) {
      const ia = index ? index.getX(i) : i, ib = index ? index.getX(i + 1) : i + 1, ic = index ? index.getX(i + 2) : i + 2;
      A.fromBufferAttribute(pos, ia).applyMatrix4(REL); B.fromBufferAttribute(pos, ib).applyMatrix4(REL); C.fromBufferAttribute(pos, ic).applyMatrix4(REL);
      N.crossVectors(AB.subVectors(B, A), AC.subVectors(C, A));
      const length = N.length();
      if (length < 1e-7 || N.y / length < 0.65 || Math.min(A.y, B.y, C.y) < 0.62) continue;
      // Ходовая и нижние площадки не должны образовать вторую снежную крышу.
      const byte = sn?.array ? sn.array[ia] : -1;
      triangles.set([A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z, byte], triangleLength); triangleLength += 10;
      x0 = Math.min(x0, A.x, B.x, C.x); z0 = Math.min(z0, A.z, B.z, C.z);
      x1 = Math.max(x1, A.x, B.x, C.x); z1 = Math.max(z1, A.z, B.z, C.z);
    }
  });
  if (!triangleLength || x1 - x0 > 15 || z1 - z0 > 18) return { sig, pos: new Float32Array(0), normal: new Float32Array(0), amount: new Float32Array(0) };
  let step = STEP, nx = Math.ceil((x1 - x0) / step), nz = Math.ceil((z1 - z0) / step);
  // Большой кузов получает более редкую полную шапку, не обрезанный хвост.
  while (nx * nz * 6 > TEMPLATE_VERTS) { step *= 1.05; nx = Math.ceil((x1 - x0) / step); nz = Math.ceil((z1 - z0) / step); }
  const stride = nx + 1;
  heights.fill(-Infinity); amounts.fill(-1);
  for (let i = 0; i < triangleLength; i += 10) {
    const ax = triangles[i], ay = triangles[i + 1], az = triangles[i + 2], bx = triangles[i + 3], by = triangles[i + 4], bz = triangles[i + 5], cx = triangles[i + 6], cy = triangles[i + 7], cz = triangles[i + 8];
    const denom = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(denom) < 1e-8) continue;
    const ix0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / step)), iz0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - z0) / step));
    const ix1 = Math.min(nx, Math.ceil((Math.max(ax, bx, cx) - x0) / step)), iz1 = Math.min(nz, Math.ceil((Math.max(az, bz, cz) - z0) / step));
    for (let z = iz0; z <= iz1; z++) for (let x = ix0; x <= ix1; x++) {
      const px = x0 + x * step, pz = z0 + z * step;
      const u = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / denom;
      const v = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / denom, w = 1 - u - v;
      if (u < -0.001 || v < -0.001 || w < -0.001) continue;
      const k = z * stride + x, y = u * ay + v * by + w * cy;
      if (y > heights[k]) { heights[k] = y; amounts[k] = triangles[i + 9]; }
    }
  }
  const emit = (ia, ib, ic) => {
    if (vertices + 3 > TEMPLATE_VERTS) return;
    const ya = heights[ia], yb = heights[ib], yc = heights[ic];
    if (!Number.isFinite(ya + yb + yc) || Math.max(ya, yb, yc) - Math.min(ya, yb, yc) > 0.18) return;
    A.set(x0 + ia % stride * step, ya, z0 + Math.floor(ia / stride) * step);
    B.set(x0 + ib % stride * step, yb, z0 + Math.floor(ib / stride) * step);
    C.set(x0 + ic % stride * step, yc, z0 + Math.floor(ic / stride) * step);
    N.crossVectors(AB.subVectors(B, A), AC.subVectors(C, A)).normalize();
    if (N.y < 0) N.negate();
    for (const [p, j] of [[A, ia], [B, ib], [C, ic]]) {
      p.toArray(positions, vertices * 3); N.toArray(normals, vertices * 3); snow[vertices++] = amounts[j];
    }
  };
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const k = z * stride + x;
    emit(k, k + stride, k + stride + 1); emit(k, k + stride + 1, k + 1);
  }
  return { sig, pos: positions.slice(0, vertices * 3), normal: normals.slice(0, vertices * 3), amount: snow.slice(0, vertices) };
}

const NOISE = `
float capHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float capNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
return mix(mix(capHash(i),capHash(i+vec2(1.,0.)),f.x),mix(capHash(i+vec2(0.,1.)),capHash(i+vec2(1.,1.)),f.x),f.y); }
`;

// Одна достаточно частая верхняя поверхность для всех досок: локальное
// продавливание не требует создавать отдельную геометрию на сидящего.
function propCapGeometry () {
  const nx = 16, nz = 4, p = new Float32Array((nx + 1) * (nz + 1) * 3), ix = [];
  for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++) {
    const k = (z * (nx + 1) + x) * 3, u = x / nx * 2 - 1, v = z / nz * 2 - 1;
    p[k] = u; p[k + 1] = Math.sqrt(Math.max(0, (1 - u * u) * (1 - v * v))); p[k + 2] = v;
    if (x < nx && z < nz) {
      const a = z * (nx + 1) + x, b = a + nx + 1;
      ix.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setIndex(ix); g.computeVertexNormals();
  return g;
}

const PRESS_GLSL = `
attribute vec4 capPress0, capPress1, capPress2, capPress3;
float capPressAt(vec2 p, vec4 stamp) {
  float d = length(p - stamp.xy) / max(0.001, stamp.z);
  return stamp.w * (1.0 - smoothstep(0.35, 1.0, d));
}
float capHeight(vec2 p) {
  vec2 world = (modelMatrix * instanceMatrix * vec4(p.x, 0.0, p.y, 1.0)).xz;
  float pressure = max(max(capPressAt(world,capPress0), capPressAt(world,capPress1)), max(capPressAt(world,capPress2), capPressAt(world,capPress3)));
  float shape = sqrt(max(0.0, 1.0-p.x*p.x)*max(0.0, 1.0-p.y*p.y));
  return shape * (1.0 - 0.92 * pressure);
}
`;

export function createSnowObjects ({ scene, onShed }) {
  // Reusable bounded template scratch; also reserve one output during eviction.
  const scratch = { triangles: new Float32Array(TEMPLATE_TRIANGLES * 10), positions: new Float32Array(TEMPLATE_VERTS * 3), normals: new Float32Array(TEMPLATE_VERTS * 3), snow: new Float32Array(TEMPLATE_VERTS), heights: new Float32Array(95 * 114), amounts: new Float32Array(95 * 114) };
  const scratchBytes = Object.values(scratch).reduce((n, a) => n + a.byteLength, 0);
  const stats = { capturedBenches: 0, benchMetadataBytes: 0, cars: 0, props: 0, propCaps: 0, triangles: 0, builds: 0, bytes: 0, cpuBytes: 0, gpuBytes: 0, stagingPeakBytes: scratchBytes + TEMPLATE_VERTS * 28, uploadBytes: 0, hits: 0, presses: 0, ms: 0 };
  const pos = new Float32Array(MAX_VERTS * 3), nor = new Float32Array(MAX_VERTS * 3), local = new Float32Array(MAX_VERTS * 3), props = new Float32Array(MAX_VERTS * 3);
  const geo = new THREE.BufferGeometry();
  for (const [name, array, size] of [['position', pos, 3], ['normal', nor, 3], ['capLocal', local, 3], ['capProps', props, 3]]) {
    const attr = new THREE.BufferAttribute(array, size); attr.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, attr);
  }
  const wet = { value: 0 };
  const mat = new THREE.MeshLambertMaterial({ color: 0xe9f0f3, side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uCapWet = wet;
    sh.vertexShader = 'attribute vec3 capLocal; attribute vec3 capProps; varying vec3 vCapLocal; varying vec3 vCapProps;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
vCapLocal = capLocal; vCapProps = capProps;
transformed += normal * (0.004 + 0.035 * capProps.x);`);
    sh.fragmentShader = 'varying vec3 vCapLocal; varying vec3 vCapProps; uniform float uCapWet;\n' + NOISE + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
float amount = vCapProps.x;
if (amount < 0.025) discard;
float s;
if (vCapProps.y > 0.5) {
  s = capNoise(vCapLocal.xz * 3.2 + 7.0) * 0.7 + capNoise(vCapLocal.xz * 11.0) * 0.3;
  if (s > amount * 1.15 - 0.16) discard;
} else {
  vec2 q = vCapLocal.xz * 2.6 + vec2(vCapLocal.y * 1.7, -vCapLocal.y * 1.3) + fract(vCapProps.z * 0.618) * 40.0;
  s = capNoise(q) * 0.65 + capNoise(q * 3.7) * 0.35;
  if (s > amount * 1.2 - 0.12) discard;
}
diffuseColor.rgb *= (1.0 - 0.24 * uCapWet) * (0.96 + 0.04*s);`);
    shadeInject(sh);
  };
  mat.customProgramCacheKey = () => 'snow-object-caps-v1';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'near-snow-object-caps'; mesh.userData.snowCap = true; mesh.userData.snowDynamic = true; mesh.visible = false;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), DISTANCE + 16);
  geo.setDrawRange(0, 0); scene.add(mesh);
  const baseBytes = pos.byteLength + nor.byteLength + local.byteLength + props.byteLength;
  stats.bytes = baseBytes;
  const capGeo = propCapGeometry(), capMat = new THREE.MeshLambertMaterial({ color: 0xe9f0f3 });
  const pressureAttrs = Array.from({ length: 4 }, (_, i) => {
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PROP_CAPS * 4), 4); attr.setUsage(THREE.DynamicDrawUsage);
    capGeo.setAttribute('capPress' + i, attr); return attr;
  });
  capMat.onBeforeCompile = sh => {
    sh.vertexShader = PRESS_GLSL + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y = capHeight(position.xz);')
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
float capDX = (capHeight(position.xz+vec2(0.01,0.0))-capHeight(position.xz-vec2(0.01,0.0)))/0.02;
float capDZ = (capHeight(position.xz+vec2(0.0,0.01))-capHeight(position.xz-vec2(0.0,0.01)))/0.02;
objectNormal = normalize(vec3(-capDX, 1.0, -capDZ));`);
    shadeInject(sh);
  };
  capMat.customProgramCacheKey = () => 'snow-prop-caps-pressure-v2';
  const propMesh = new THREE.InstancedMesh(capGeo, capMat, MAX_PROP_CAPS);
  propMesh.name = 'near-snow-bench-and-canopy-caps'; propMesh.userData.snowCap = true; propMesh.userData.snowDynamic = true;
  propMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); propMesh.count = 0; propMesh.frustumCulled = false; scene.add(propMesh);
  const transform = new THREE.Object3D(), propCache = new Map(), propAttempts = new WeakMap(), CAPS = new Map(), pressures = new Map();
  let templateBytes = 0;
  const damage = new WeakMap(), chosen = Array.from({ length: MAX_CARS }, () => ({ mesh: null, player: false, d: Infinity })), sigTimes = new WeakMap();
  let time = 0;
  const staticGeometryBytes = Object.values(capGeo.attributes).reduce((n, a) => n + a.array.byteLength, 0) + capGeo.index.array.byteLength;
  const gpuBytes = baseBytes + staticGeometryBytes + propMesh.instanceMatrix.array.byteLength;
  function memory () {
    // JS metadata — консервативная оценка, не только полезные float-массивы.
    const metadata = 96 * 1024 + CAPS.size * 2048 + propCache.size * 4096 + pressures.size * 512;
    stats.gpuBytes = gpuBytes; stats.cpuBytes = gpuBytes + templateBytes + metadata + stats.stagingPeakBytes + capturedBytes;
    stats.capturedBenches = capturedCount; stats.benchMetadataBytes = capturedBytes;
    stats.bytes = stats.cpuBytes;
  }
  memory();

  function update ({ player, vehicles = [], benches = [], canopies = [], x = 0, z = 0, snowAmount = 0, playerSnow = snowAmount, wetness = 0, dt = 0 }) {
    const t0 = performance.now(); time += dt;
    if (snowAmount < 0.01) { mesh.visible = false; propMesh.count = 0; stats.cars = stats.props = stats.propCaps = stats.triangles = 0; return; }
    let count = 0;
    if (player?.visible) { chosen[0].mesh = player; chosen[0].player = true; chosen[0].d = 0; count = 1; }
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i], root = v.mesh || v;
      if (!root?.isObject3D || root === player || !root.visible || !root.parent) continue;
      const dx = root.position.x - x, dz = root.position.z - z, d = dx * dx + dz * dz;
      if (d > DISTANCE * DISTANCE) continue;
      let at = count;
      while (at > 0 && !chosen[at - 1].player && chosen[at - 1].d > d) at--;
      if (at >= MAX_CARS) continue;
      for (let j = Math.min(count, MAX_CARS - 1); j > at; j--) {
        chosen[j].mesh = chosen[j - 1].mesh; chosen[j].player = false; chosen[j].d = chosen[j - 1].d;
      }
      chosen[at].mesh = root; chosen[at].player = false; chosen[at].d = d; count = Math.min(MAX_CARS, count + 1);
    }
    let used = 0, built = false, cars = 0;
    for (let ci = 0; ci < count; ci++) {
      const item = chosen[ci];
      const root = item.mesh;
      let tpl = CAPS.get(root);
      const due = !tpl || time - (sigTimes.get(root) || 0) > 1;
      if (due && !built) {
        const sig = signature(root); sigTimes.set(root, time);
        if (!tpl || tpl.sig !== sig) {
          if (tpl) { templateBytes -= tpl.pos.byteLength + tpl.normal.byteLength + tpl.amount.byteLength; CAPS.delete(root); }
          tpl = template(root, sig, scratch);
          const bytes = tpl.pos.byteLength + tpl.normal.byteLength + tpl.amount.byteLength;
          while (CAPS.size && (CAPS.size >= 24 || templateBytes + bytes > TEMPLATE_BUDGET)) {
            const oldest = CAPS.keys().next().value, old = CAPS.get(oldest);
            templateBytes -= old.pos.byteLength + old.normal.byteLength + old.amount.byteLength; CAPS.delete(oldest);
          }
          // Не даём необычной модели превратить ограниченный кэш в безразмерный.
          if (bytes <= TEMPLATE_BUDGET) { CAPS.set(root, tpl); templateBytes += bytes; }
          else { tpl = { sig, pos: new Float32Array(0), normal: new Float32Array(0), amount: new Float32Array(0) }; CAPS.set(root, tpl); }
          stats.builds++; built = true;
        }
      }
      if (!tpl?.pos.length || used + tpl.pos.length / 3 > MAX_VERTS) continue;
      root.updateWorldMatrix(true, false); NORMAL.getNormalMatrix(root.matrixWorld);
      const lost = damage.get(root) || 0, fade = clamp((DISTANCE - Math.sqrt(item.d)) / 8, 0, 1);
      const seasonal = clamp((snowAmount - 0.08) / 0.5, 0, 1);
      for (let i = 0; i < tpl.pos.length / 3; i++) {
        const j = used + i, k = i * 3;
        A.fromArray(tpl.pos, k).applyMatrix4(root.matrixWorld); N.fromArray(tpl.normal, k).applyMatrix3(NORMAL).normalize();
        A.toArray(pos, j * 3); N.toArray(nor, j * 3);
        local[j * 3] = tpl.pos[k]; local[j * 3 + 1] = tpl.pos[k + 1]; local[j * 3 + 2] = tpl.pos[k + 2];
        const amount = item.player ? playerSnow : (tpl.amount[i] < 0 ? 0.45 : Math.min(1, (tpl.amount[i] % 128) / 120)) * seasonal;
        props[j * 3] = Math.max(0, amount - lost) * fade; props[j * 3 + 1] = item.player ? 1 : 0;
        props[j * 3 + 2] = tpl.amount[i] < 0 ? 54 : tpl.amount[i];
      }
      used += tpl.pos.length / 3; cars++;
      if (lost > 0 && snowAmount > 0.45) damage.set(root, Math.max(0, lost - dt / 180));
    }
    for (const attr of Object.values(geo.attributes)) { attr.clearUpdateRanges(); attr.addUpdateRange(0, used * attr.itemSize); attr.needsUpdate = true; }
    geo.setDrawRange(0, used); mesh.visible = used > 0; wet.value = clamp(wetness, 0, 1);
    geo.boundingSphere.center.set(x, player?.position.y || 0, z);
    let propCount = 0, capCount = 0;
    const appendProps = (list, canopy) => {
      for (let i = 0; i < list.length && propCount < 24 && capCount < MAX_PROP_CAPS; i++) {
        const p = list[i];
        if (p.broken || p.prop?.down || p.it?.down || Math.abs(p.x - x) > 30 || Math.abs(p.z - z) > 30) continue;
        const dist = Math.hypot(p.x - x, p.z - z);
        if (dist > 30) continue;
        let boards = propCache.get(p);
        if (!boards && !built) {
          if (time - (propAttempts.get(p) ?? -10) < 1) continue;
          propAttempts.set(p, time);
          boards = canopy ? canopyRoof(p) : savedBenchBoards(p);
          // Пока склейка не готова, повторить позднее вместо пустого кэша.
          if (boards?.length) {
            if (propCache.size >= PROP_CACHE_LIMIT) propCache.delete(propCache.keys().next().value);
            propCache.set(p, boards);
          }
          built = true;
        }
        if (!boards?.length) continue;
        const lost = damage.get(p.prop || p.it || p) || 0;
        const amount = Math.max(0, snowAmount - lost) * clamp((30 - dist) / 5, 0, 1);
        if (amount < 0.02) continue;
        const cs = Math.cos(p.ry || 0), sn = Math.sin(p.ry || 0);
        const pressure = pressures.get(p.prop || p.it || p);
        for (const board of boards) {
          if (capCount >= MAX_PROP_CAPS) break;
          const boardY = board.dy !== undefined ? p.y + board.dy : board.y;
          transform.position.set(p.x + board.x * cs + board.z * sn, boardY + 0.002, p.z - board.x * sn + board.z * cs);
          transform.rotation.set(0, p.ry || 0, 0);
          transform.scale.set(board.w * 0.49, (canopy ? 0.055 : 0.025) * amount, board.d * 0.49);
          transform.updateMatrix(); propMesh.setMatrixAt(capCount, transform.matrix);
          for (let j = 0; j < 4; j++) {
            const arr = pressureAttrs[j].array, off = capCount * 4;
            for (let q = 0; q < 4; q++) arr[off + q] = pressure && !canopy && boardY <= p.y + 0.85 ? pressure.data[j * 4 + q] : 0;
          }
          capCount++;
        }
        propCount++;
      }
    };
    appendProps(canopies, true); appendProps(benches, false);
    propMesh.count = capCount; propMesh.instanceMatrix.needsUpdate = true;
    for (const attr of pressureAttrs) { attr.clearUpdateRanges(); attr.addUpdateRange(0, capCount * 4); attr.needsUpdate = true; }
    capMat.color.setRGB(0.82 - wetness * 0.12, 0.88 - wetness * 0.12, 0.91 - wetness * 0.12);
    memory();
    stats.cars = cars; stats.props = propCount; stats.propCaps = capCount; stats.triangles = used / 3 + capCount * capGeo.index.count / 3;
    stats.uploadBytes = used * 12 * 4 + capCount * 128; stats.ms = performance.now() - t0;
  }
  return {
    update, stats,
    press (receiver, x, z, amount = 1) {
      const owner = receiver?.prop || receiver?.it || receiver;
      if (!owner || !Number.isFinite(x) || !Number.isFinite(z) || !(amount > 0)) return;
      let pressure = pressures.get(owner);
      if (!pressure) {
        if (pressures.size >= PRESS_LIMIT) pressures.delete(pressures.keys().next().value);
        pressure = { data: new Float32Array(16), next: 0 }; pressures.set(owner, pressure);
      }
      const data = pressure.data, strength = clamp(amount, 0, 1);
      // Повторно севший на то же место не продавливает доску и не наращивает штампы.
      for (let i = 0; i < 4; i++) {
        const k = i * 4;
        if (data[k + 3] > 0 && Math.hypot(data[k] - x, data[k + 1] - z) < 0.12) {
          data[k + 3] = Math.max(data[k + 3], strength); return;
        }
      }
      const k = pressure.next * 4; pressure.next = (pressure.next + 1) % 4;
      data[k] = x; data[k + 1] = z; data[k + 2] = PRESS_RADIUS; data[k + 3] = strength; stats.presses++; memory();
    },
    hit (root, strength = 0.4) { if (root) { damage.set(root, clamp((damage.get(root) || 0) + strength, 0, 1)); stats.hits++; onShed?.(root, strength); } },
    dispose () { scene.remove(mesh); scene.remove(propMesh); geo.dispose(); mat.dispose(); capGeo.dispose(); capMat.dispose(); CAPS.clear(); propCache.clear(); pressures.clear(); for (const item of chosen) item.mesh = null; },
  };
}
