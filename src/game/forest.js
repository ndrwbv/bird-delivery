/* ──────────────────────────────────────────────────────────────────────────
   Ельник в больших лесах (docs/IDEAS.md, блок 6; правила — docs/CAREER.md
   «Город: как выглядит» → «Ельник»).

   Лес — зелёная зона карты (OSM «green») от FOREST.MIN (3 га), как у зверей
   (fauna.js). Земля в таком лесу темнее (FLOOR), на ней — густой ельник:
     • сетка через SPACE (5 м) со сдвигом каждого дерева, одно и то же место —
       одно и то же дерево (зерно по точке);
     • в глубине: ели (70 %) 10—17 м и сосны (30 %) 14—20 м;
     • опушка — полоса EDGE (16 м) у края леса и у дорог сквозь него: деревья
       реже и ниже (у самого края — треть высоты), больше кустов и молодых ёлок;
     • подлесок: кусты и ёлочки 1,5—3,5 м;
     • не растут: в домах и ближе HOUSE (9 м) к ним, на дороге и ближе ROAD
       (3,5 м) к полотну (у пешеходной дорожки — PATH, 1,6 м), в заборах и
       стенах, на аллеях, дворовых тропинках и лавочках, на парковках, в воде,
       на спорт- и детских площадках, у пиццерии-шара.
   Зимой ели в снегу: снег лежит на верхушках ярусов, больше снега — ниже
   опускается (общий сезон, seasons.js snowAmt). Ель и сосна зелёные всегда.

   Твёрдость: деревья выше SOLID_H (6 м) — препятствие для машины, как
   городские деревья (ствол TRUNK = 0,45 м в обе стороны); кусты и молодые
   ёлки — нет. Между стволами в среднем 5 м — машина (ширина ~2 м)
   протискивается медленно, задним ходом выезжает всегда. Дороги и дорожки
   сквозь лес свободны (ROAD/PATH от края полотна).

   Перф: ничего не склеено заранее (лесов ~3000 га — это миллион деревьев).
   Лес режется на клетки CELL (48 м); клетка собирается, только когда камера
   ближе FAR (470 м — дальше туман; туман ближе по настройке графики — и FAR ближе, farOf), не больше BUDGET мс за кадр; дальше
   FAR + 150 м — выбрасывается. Рисуют 5 общих InstancedMesh (ель, ель-даль,
   сосна, сосна-даль, куст): раз в несколько кадров (или когда камера
   сдвинулась/повернулась) в них копируются клетки, что в кадре: ближе NEAR
   (220 м) — подробные деревья (38—50 треугольников), дальше — простые (6—14),
   и чем дальше, тем реже (до THIN на краю тумана). Кусты — ближе BUSH_R.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { snowAmt } from './seasons.js';

export const FOREST = {
  MIN: 30000, CELL: 48, SPACE: 5, JIT: 0.8,
  EDGE: 16, HOUSE: 9, ROAD: 3.5, PATH: 1.6,
  NEAR: 220, FAR: 470, THIN: 0.4, BUSH_R: 170,
  CAP: 16000, BUSH_CAP: 9000,
  SOLID_H: 6, TRUNK: 0.45,
  BUDGET: 2.5, WARM: 160,
  FLOOR: '#86ab6a',
};

let A = null;
let FORESTS = null;                     // [{ p, x0, x1, z0, z1, segs }]
let LOTS = null;
const CELLS = new Map();                // клетка → { i, j, cx, cz, gy, sp, pi, bu, sol }
const MESH = {};                         // sp0, sp1, pi0, pi1, bu
const U = { uSnow: { value: 0 } };
const ST = { built: 0, dropped: 0, ms: 0, msMax: 0, trees: 0, sp: 0, pi: 0, bu: 0, sol: 0, shown: {}, refresh: 0 };
const AREA = new WeakMap();
let LAST = { x: 1e9, z: 1e9, yaw: 0, n: 0, dirty: true, frame: 0, sweep: 0 };

/* ── какая зелёная зона — лес ── */
function area (p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; }
  return Math.abs(a / 2);
}
export function isForest (g) {
  if (!g || g.k !== 'green') return false;
  let a = AREA.get(g);
  if (a === undefined) { a = area(g.p); AREA.set(g, a); }
  return a >= FOREST.MIN;
}
function forests () {
  if (FORESTS) return FORESTS;
  FORESTS = [];
  for (const g of A.CITY.green || []) {
    if (!isForest(g)) continue;
    const p = g.p;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    FORESTS.push({ p, x0, x1, z0, z1 });
  }
  LOTS = [];
  const take = p => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    LOTS.push({ p, x0, x1, z0, z1 });
  };
  for (const l of A.CITY.lots || []) take(l.p);
  for (const g of A.CITY.green || []) if (g.k === 'water' || g.k === 'pitch' || g.k === 'play') take(g.p);
  return FORESTS;
}

/* ── модели: единичной высоты, цвет вершин и «снежность» (1 — верх яруса) ── */
function part (geo, hex, snow) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count, col = new THREE.Color(hex);
  const c = new Float32Array(n * 3), s = new Float32Array(n);
  const pos = g.attributes.position;
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; s[i] = snow(pos.getY(i)); }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setAttribute('aSnow', new THREE.BufferAttribute(s, 1));
  return g;
}
function merge (parts) {
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), C = new Float32Array(n * 3), S = new Float32Array(n);
  let o = 0;
  for (const g of parts) {
    const k = g.attributes.position.count;
    P.set(g.attributes.position.array, o * 3); C.set(g.attributes.color.array, o * 3); S.set(g.attributes.aSnow.array, o);
    o += k;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  g.setAttribute('aSnow', new THREE.BufferAttribute(S, 1));
  g.computeVertexNormals();
  return g;
}
const cone = (r, h, seg, y0, rot) => new THREE.ConeGeometry(r, h, seg, 1, true).rotateY(rot || 0).translate(0, y0 + h / 2, 0);
const tier = (y0, h) => y => 0.12 + 0.88 * Math.max(0, Math.min(1, (y - y0) / h));
function spruceGeo () {
  const P = [part(new THREE.CylinderGeometry(0.018, 0.03, 0.2, 5, 1, true).translate(0, 0.1, 0), '#5a4030', () => 0)];
  const T = [[0.12, 0.34, 0.22, '#2a5f35'], [0.32, 0.32, 0.175, '#2f6a3a'], [0.52, 0.3, 0.13, '#357341'], [0.72, 0.28, 0.085, '#3a7a45']];
  T.forEach(([y0, h, r, hex], i) => P.push(part(cone(r, h, 7, y0, i * 0.45), hex, tier(y0, h))));
  return merge(P);
}
function spruceFar () { return merge([part(cone(0.2, 0.92, 6, 0.08), '#2f6a3a', tier(0.08, 0.92))]); }
function pineGeo () {
  const P = [part(new THREE.CylinderGeometry(0.016, 0.026, 0.8, 5, 1, true).translate(0, 0.4, 0), '#a0603a', () => 0)];
  const cr = (sx, sy, x, y, z, hex) => part(new THREE.IcosahedronGeometry(1, 0).scale(sx, sy, sx).translate(x, y, z), hex, yy => (yy > y ? 0.3 + 0.7 * (yy - y) / sy : 0.05));
  P.push(cr(0.15, 0.08, 0, 0.86, 0, '#3f7a3f'), cr(0.11, 0.065, 0.07, 0.76, 0.04, '#467f44'));
  return merge(P);
}
function pineFar () {
  return merge([
    part(new THREE.CylinderGeometry(0.02, 0.026, 0.8, 3, 1, true).translate(0, 0.4, 0), '#a0603a', () => 0),
    part(new THREE.OctahedronGeometry(1, 0).scale(0.16, 0.09, 0.16).translate(0, 0.85, 0), '#3f7a3f', y => (y > 0.85 ? 1 : 0.1)),
  ]);
}
function bushGeo () {
  return merge([part(new THREE.IcosahedronGeometry(1, 0).scale(1, 0.62, 1).translate(0, 0.38, 0), '#4f8a40', y => (y > 0.5 ? 0.4 + (y - 0.5) * 2 : 0.05))]);
}

function material () {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = sh => {
    sh.uniforms.uSnow = U.uSnow;
    sh.vertexShader = 'attribute float aSnow;\nvarying float vSnow;\nvarying vec3 vFW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vSnow = aSnow;
      vFW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = 'uniform float uSnow;\nvarying float vSnow;\nvarying vec3 vFW;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float fn = fract(sin(dot(floor(vFW.xz * 1.7 + vFW.y * 0.9), vec2(12.9898, 78.233))) * 43758.5453);
      float cov = smoothstep(0.98 - uSnow * 0.62, 1.1 - uSnow * 0.62, vSnow + (fn - 0.5) * 0.22) * step(0.02, uSnow);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 0.98), cov * 0.95);`);
  };
  m.customProgramCacheKey = () => 'forestSnow';
  return m;
}

function makeMeshes () {
  const mat = material();
  const mk = (geo, cap) => {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.count = 0; m.frustumCulled = false;
    A.scene.add(m);
    return m;
  };
  MESH.sp0 = mk(spruceGeo(), FOREST.CAP); MESH.sp1 = mk(spruceFar(), FOREST.CAP);
  MESH.pi0 = mk(pineGeo(), FOREST.CAP >> 1); MESH.pi1 = mk(pineFar(), FOREST.CAP >> 1);
  MESH.bu = mk(bushGeo(), FOREST.BUSH_CAP);
}

/* ── зерно по точке ── */
function hsh (x, z, k) {
  let h = Math.imul(Math.round(x * 8) ^ 0x27d4eb2d, 0x9E3779B1) ^ Math.imul(Math.round(z * 8) + k * 1013904223, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function rng (x, z) {
  let a = (hsh(x, z, 3) * 4294967296) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let q = a; q = Math.imul(q ^ (q >>> 15), q | 1); q ^= q + Math.imul(q ^ (q >>> 7), q | 61); return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
}
const key = (i, j) => (i + 4096) * 8192 + j + 4096;
const inP = (x, z, p) => {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
};

/* ── клетка: какие деревья где ── */
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P3 = new THREE.Vector3(), S3 = new THREE.Vector3();
function buildCell (i, j) {
  const t0 = performance.now(), F = FOREST, C = F.CELL;
  const x0 = i * C, z0 = j * C, x1 = x0 + C, z1 = z0 + C;
  const cell = { i, j, cx: x0 + C / 2, cz: z0 + C / 2, gy: 0, sp: null, pi: null, bu: null, sol: [] };
  CELLS.set(key(i, j), cell);
  const polys = forests().filter(f => f.x1 > x0 && f.x0 < x1 && f.z1 > z0 && f.z0 < z1);
  if (!polys.length) { cell.empty = true; return cell; }
  // края лесов рядом с клеткой: для «опушки»
  const segs = [];
  for (const f of polys) {
    const p = f.p;
    for (let k = 0; k < p.length; k++) {
      const a = p[k], b = p[(k + 1) % p.length];
      if (Math.max(a[0], b[0]) < x0 - F.EDGE || Math.min(a[0], b[0]) > x1 + F.EDGE || Math.max(a[1], b[1]) < z0 - F.EDGE || Math.min(a[1], b[1]) > z1 + F.EDGE) continue;
      segs.push(a[0], a[1], b[0], b[1]);
    }
  }
  const lots = LOTS.filter(l => l.x1 > x0 && l.x0 < x1 && l.z1 > z0 && l.z0 < z1);
  const sp = [], pi = [], bu = [];
  const edgeD = (x, z) => {
    let e = F.EDGE;
    for (let k = 0; k < segs.length; k += 4) {
      const ax = segs[k], az = segs[k + 1], dx = segs[k + 2] - ax, dz = segs[k + 3] - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < e) e = d;
    }
    return e;
  };
  const okAt = (x, z, r) => {
    const y = A.groundH(x, z);
    if (y < 0.3 || !A.inBounds(x, z, -200)) return -1;
    if (A.inHouse(x, z, 4) || A.inHouse(x, z, F.HOUSE)) return -1;
    const nr = A.nearestRoad(x, z, 9, 1);
    let dR = 99;
    if (nr) { dR = nr.d - nr.seg.w / 2 - (nr.seg.c > 5 ? F.PATH : F.ROAD); if (dR < 0) return -1; }
    if (A.solidAt(x, z, r) || A.onAlley(x, z, 1) || A.yardBlocks(x, z, 1.2) || A.pzBlocks(x, z, 1)) return -1;
    for (const l of lots) if (x > l.x0 && x < l.x1 && z > l.z0 && z < l.z1 && inP(x, z, l.p)) return -1;
    return dR;
  };
  let gs = 0, gn = 0;
  const S = F.SPACE;
  for (let gx = x0 + S / 2; gx < x1; gx += S)
    for (let gz = z0 + S / 2; gz < z1; gz += S) {
      const r = rng(gx, gz);
      const x = gx + (r() - 0.5) * S * F.JIT, z = gz + (r() - 0.5) * S * F.JIT;
      let f = null;
      for (const q of polys) if (x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1 && inP(x, z, q.p)) { f = q; break; }
      if (!f) continue;
      const dR = okAt(x, z, 1.2);
      if (dR < 0) continue;
      const k = Math.min(1, Math.min(edgeD(x, z), dR) / F.EDGE);   // 0 — край, 1 — глубина
      const y = A.groundH(x, z);
      gs += y; gn++;
      const rank = r();
      // опушка: реже, ниже, больше кустов и молодых ёлок
      if (r() < 0.38 * (1 - k)) { if (r() < 0.6) bu.push([x, y, z, r() * 6.3, 0.9 + r() * 1.1, 0.6 + r() * 0.7, 0.8 + r() * 0.4, rank]); continue; }
      const grow = 0.34 + 0.66 * k;
      if (r() < (k > 0.7 ? 0.3 : 0.12)) {
        const H = (14 + r() * 6) * grow;
        pi.push([x, y, z, r() * 6.3, H, H, 0.85 + r() * 0.3, rank]);
        if (H > F.SOLID_H) cell.sol.push(x, z);
      } else {
        const H = (10 + r() * 7) * grow, w = H * (0.85 + r() * 0.35);
        sp.push([x, y, z, r() * 6.3, w, H, 0.82 + r() * 0.36, rank]);
        if (H > F.SOLID_H) cell.sol.push(x, z);
      }
      // подлесок: куст или молодая ёлка рядом
      if (r() < 0.12 + 0.5 * (1 - k)) {
        const a = r() * 6.3, d = 1.6 + r() * 1.2, bx = x + Math.cos(a) * d, bz = z + Math.sin(a) * d;
        if (okAt(bx, bz, 0.6) >= 0) {
          const by = A.groundH(bx, bz);
          if (r() < 0.55) bu.push([bx, by, bz, r() * 6.3, 0.8 + r() * 1.0, 0.5 + r() * 0.7, 0.75 + r() * 0.45, r()]);
          else { const H = 1.5 + r() * 2; sp.push([bx, by, bz, r() * 6.3, H, H, 0.95 + r() * 0.3, r()]); }
        }
      }
    }
  cell.gy = gn ? gs / gn : 0;
  const pack = list => {
    if (!list.length) return null;
    list.sort((a, b) => a[7] - b[7]);
    const m = new Float32Array(list.length * 16), c = new Float32Array(list.length * 3);
    list.forEach((t, n) => {
      M4.compose(P3.set(t[0], t[1] - 0.15, t[2]), Q.setFromEuler(E.set(0, t[3], 0)), S3.set(t[4], t[5], t[4]));
      M4.toArray(m, n * 16);
      c[n * 3] = t[6] * 0.97; c[n * 3 + 1] = t[6]; c[n * 3 + 2] = t[6] * 0.95;
    });
    return { m, c, n: list.length };
  };
  cell.sp = pack(sp); cell.pi = pack(pi); cell.bu = pack(bu);
  ST.sp += sp.length; ST.pi += pi.length; ST.bu += bu.length; ST.trees += sp.length + pi.length; ST.sol += cell.sol.length / 2;
  ST.built++;
  const dt = performance.now() - t0;
  ST.ms += dt; ST.msMax = Math.max(ST.msMax, dt);
  return cell;
}
function dropCell (k, c) {
  if (!c.empty) {
    ST.sp -= c.sp ? c.sp.n : 0; ST.pi -= c.pi ? c.pi.n : 0; ST.bu -= c.bu ? c.bu.n : 0;
    ST.trees -= (c.sp ? c.sp.n : 0) + (c.pi ? c.pi.n : 0); ST.sol -= c.sol.length / 2;
  }
  CELLS.delete(k); ST.dropped++;
}

/* ── есть ли вообще лес рядом с клеткой (по рамкам лесов) ── */
function hasForest (i, j) {
  const C = FOREST.CELL, x0 = i * C, z0 = j * C;
  for (const f of FORESTS) if (f.x1 > x0 && f.x0 < x0 + C && f.z1 > z0 && f.z0 < z0 + C) return true;
  return false;
}

/* собрать недостающие клетки ближе R, пока не кончится бюджет (мс) */
function ensure (x, z, R, budget) {
  const C = FOREST.CELL, ci = Math.floor(x / C), cj = Math.floor(z / C), n = Math.ceil(R / C);
  const todo = [];
  for (let i = ci - n; i <= ci + n; i++)
    for (let j = cj - n; j <= cj + n; j++) {
      const d = Math.hypot((i + 0.5) * C - x, (j + 0.5) * C - z);
      if (d > R + C * 0.71 || CELLS.has(key(i, j))) continue;
      if (!hasForest(i, j)) { CELLS.set(key(i, j), { i, j, empty: true }); continue; }
      todo.push([d, i, j]);
    }
  if (!todo.length) return false;
  todo.sort((a, b) => a[0] - b[0]);
  const t0 = performance.now();
  let any = false;
  for (const [, i, j] of todo) {
    buildCell(i, j); any = true;
    if (performance.now() - t0 > budget) break;
  }
  return any;
}

/* ── в меши: что в кадре ── */
const FR = new THREE.Frustum(), PM = new THREE.Matrix4(), SPH = new THREE.Sphere(), V3 = new THREE.Vector3();
/* дальность леса — не дальше края камеры: туман ближе (настройка графики gfx.js, страховка cull.js) —
   и ельник ближе, дальше тумана не строим и не рисуем. Твёрдые стволы нужны только у машины — рядом */
const farOf = cam => Math.max(120, Math.min(FOREST.FAR, (cam.far || 490) - 20));
const nearOf = far => Math.min(FOREST.NEAR, far * 0.47);
function refresh (cam) {
  const F = FOREST, x = cam.position.x, z = cam.position.z, FAR = farOf(cam), NEAR = nearOf(FAR);
  PM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  FR.setFromProjectionMatrix(PM);
  const vis = [];
  for (const c of CELLS.values()) {
    if (c.empty) continue;
    const d = Math.hypot(c.cx - x, c.cz - z);
    if (d > FAR + F.CELL * 0.71) continue;
    SPH.center.set(c.cx, c.gy + 9, c.cz); SPH.radius = F.CELL * 0.71 + 22;
    if (d > F.CELL * 1.5 && !FR.intersectsSphere(SPH)) continue;
    vis.push([d, c]);
  }
  vis.sort((a, b) => a[0] - b[0]);
  const n = { sp0: 0, sp1: 0, pi0: 0, pi1: 0, bu: 0 };
  const put = (mk, src, cnt) => {
    const M = MESH[mk], cap = M.instanceMatrix.count;
    const k = Math.min(cnt, cap - n[mk]);
    if (k <= 0) return;
    M.instanceMatrix.array.set(k === src.n ? src.m : src.m.subarray(0, k * 16), n[mk] * 16);
    M.instanceColor.array.set(k === src.n ? src.c : src.c.subarray(0, k * 3), n[mk] * 3);
    n[mk] += k;
  };
  for (const [d, c] of vis) {
    const near = d < NEAR;
    const keep = near ? 1 : 1 - (1 - F.THIN) * Math.min(1, (d - NEAR) / Math.max(1, FAR - NEAR));
    if (c.sp) put(near ? 'sp0' : 'sp1', c.sp, Math.ceil(c.sp.n * keep));
    if (c.pi) put(near ? 'pi0' : 'pi1', c.pi, Math.ceil(c.pi.n * keep));
    if (c.bu && d < F.BUSH_R) put('bu', c.bu, c.bu.n);
  }
  for (const k in MESH) {
    const M = MESH[k];
    M.count = n[k];
    M.instanceMatrix.clearUpdateRanges && M.instanceMatrix.clearUpdateRanges();
    M.instanceColor.clearUpdateRanges && M.instanceColor.clearUpdateRanges();
    if (n[k]) {
      if (M.instanceMatrix.addUpdateRange) { M.instanceMatrix.addUpdateRange(0, n[k] * 16); M.instanceColor.addUpdateRange(0, n[k] * 3); }
      M.instanceMatrix.needsUpdate = true; M.instanceColor.needsUpdate = true;
    }
  }
  ST.shown = n; ST.refresh++;
}

/* ── подключение ──
   api (game.js): THREE-сцена и камера, CITY, groundH, inHouse, inBounds, nearestRoad,
   solidAt(x, z, r), onAlley(x, z, m), yardBlocks(x, z, r), pzBlocks(x, z, m) */
export function init (api) {
  A = api;
  forests();
  if (!FORESTS.length) return api;
  makeMeshes();
  return api;
}

export function step (dt, api) {
  if (!A || !FORESTS || !FORESTS.length) return;
  U.uSnow.value = snowAmt();
  const cam = A.cam, x = cam.position.x, z = cam.position.z, F = FOREST;
  LAST.frame++;
  const jump = Math.hypot(x - LAST.x, z - LAST.z);
  // первый кадр или прыжок (телепорт, другая пиццерия): ближнее — сразу
  let built = jump > 150 ? ensure(x, z, F.WARM, 140) : false;
  const FAR = farOf(cam);
  built = ensure(x, z, FAR, F.BUDGET) || built;
  const fx = -cam.matrixWorld.elements[8], fz = -cam.matrixWorld.elements[10], yaw = Math.atan2(fx, fz);
  let dy = Math.abs(yaw - LAST.yaw); if (dy > Math.PI) dy = 2 * Math.PI - dy;
  if (built || jump > 6 || dy > 0.1 || LAST.frame - LAST.n > 30 || FAR !== LAST.far) {
    LAST.far = FAR;
    refresh(cam);
    LAST.x = x; LAST.z = z; LAST.yaw = yaw; LAST.n = LAST.frame;
  }
  // дальние клетки — из памяти
  if ((LAST.sweep += dt) > 3) {
    LAST.sweep = 0;
    const R = FAR + 150;
    for (const [k, c] of CELLS) {
      const cx = c.empty ? (c.i + 0.5) * F.CELL : c.cx, cz = c.empty ? (c.j + 0.5) * F.CELL : c.cz;
      if (Math.hypot(cx - x, cz - z) > R) { if (c.empty) CELLS.delete(k); else dropCell(k, c); }
    }
  }
}

/* стволы рядом с точкой — машина в них упирается (game.js: столкновения кузова) */
const T_LIST = [];
export function withTrees (list, x, z) {
  if (!FORESTS || !FORESTS.length) return list;
  const C = FOREST.CELL, T = FOREST.TRUNK, R = 3.5;
  T_LIST.length = 0;
  for (let i = Math.floor((x - R) / C); i <= Math.floor((x + R) / C); i++)
    for (let j = Math.floor((z - R) / C); j <= Math.floor((z + R) / C); j++) {
      const c = CELLS.get(key(i, j));
      if (!c || c.empty || !c.sol.length) continue;
      const s = c.sol;
      for (let k = 0; k < s.length; k += 2) {
        if (Math.abs(s[k] - x) > R || Math.abs(s[k + 1] - z) > R) continue;
        T_LIST.push({ cx: s[k], cz: s[k + 1], hw: T, hd: T, cs: 1, sn: 0, ex: T, ez: T, tree: 1 });
      }
    }
  return T_LIST.length ? list.concat(T_LIST) : list;
}

/* опушка: расстояние до края леса (для зверей; < 0 — снаружи), null — не у леса */
export function edgeAt (x, z, R = 40) {
  if (!FORESTS) return null;
  let best = null;
  for (const f of FORESTS) {
    if (x < f.x0 - R || x > f.x1 + R || z < f.z0 - R || z > f.z1 + R) continue;
    const p = f.p;
    let e = R;
    for (let k = 0; k < p.length; k++) {
      const a = p[k], b = p[(k + 1) % p.length], dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
      if (d < e) e = d;
    }
    if (e >= R) continue;
    const v = inP(x, z, p) ? e : -e;
    if (best === null || Math.abs(v) < Math.abs(best)) best = v;
  }
  return best;
}

export const DEBUG = {
  FOREST, CELLS, MESH, edgeAt,
  get stats () {
    return { forests: FORESTS ? FORESTS.length : 0, cells: [...CELLS.values()].filter(c => !c.empty).length, built: ST.built, dropped: ST.dropped,
      spruce: ST.sp, pine: ST.pi, bush: ST.bu, trees: ST.trees, solid: ST.sol, shown: ST.shown, refresh: ST.refresh,
      msTotal: Math.round(ST.ms), msMax: Math.round(ST.msMax * 10) / 10, snow: U.uSnow.value };
  },
  warm: (x, z, R = 470) => { while (ensure(x, z, R, 1000)); return CELLS.size; },
};
