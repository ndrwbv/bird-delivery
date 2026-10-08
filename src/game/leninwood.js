/* ──────────────────────────────────────────────────────────────────────────
   Лес вдоль улицы Ленина (docs/CAREER.md «Город: как выглядит» → «Лес у Ленина»).

   Улица Ленина идёт по краю города: с одной стороны дома, с другой — пусто. На пустой
   стороне — полоса ельника (тот же ельник, что в больших лесах карты, forest.js):
     • от LW.FROM м за краем асфальта (за тротуаром и аллеей-аркой) вглубь на LW.DEPTH
       (50—90 м, ширина плавно гуляет вдоль улицы);
     • только там, где рядом нет домов (LW.HOUSE м) и внутри города; кусок короче LW.MIN_RUN —
       не сажаем;
     • проплешины: поляны 15—40 м — пятнами по шуму (LW.GLADE), и поляна у каждой развилки троп;
     • тропы: одна петляет вдоль полосы посередине, съезды к ней с улицы — через LW.ENTRY м
       (и на концах полосы). Тропа — полоса утоптанной земли LW.TRAIL_W м, деревьев и кустов ближе
       LW.FREE м к её оси нет: машина проезжает (деревья выше 6 м — твёрдые, как в ельнике).
   Съезд с улицы не кладём, если на нём столб, дерево или стена (solidAt).

   Перф: деревья — клетками ельника (forest.js addArea), тропы — один меш на весь город.

   init(api) — game.js, после FOREST.init: { THREE, scene, CITY, groundH, inHouse, inBounds, solidAt, onPave }
   отладка: __dlv.LWOOD
   ────────────────────────────────────────────────────────────────────────── */
import * as FOREST from './forest.js';
import { snowAmt } from './seasons.js';

export const LW = {
  STREET: 'улица Ленина',
  FROM: 14,               // от края асфальта, м
  DEPTH: [50, 90],        // вглубь, м
  HOUSE: 22,              // дом ближе — здесь не лес, м
  BORDER: 6,              // до края города (границы) — не ближе, м
  MIN_D: 25,              // полоса уже — не лес, м
  STEP: 8,                // шаг разметки вдоль улицы, м
  MIN_RUN: 120,           // кусок полосы не короче, м
  ENTRY: [170, 260],      // съезды с улицы — через столько, м
  TRAIL_W: 3.2,           // ширина утоптанной тропы, м
  FREE: 2.9,              // деревьев ближе к оси тропы нет, м
  GLADE: { S: 38, T: 0.72, FORK: [9, 15] },   // поляны: масштаб шума, м; порог; поляна у развилки, м
  COLOR: '#9b8763', SNOW: '#e3e7ec',
};

let A = null;
const ST = { why: {}, strips: 0, m: 0, trails: 0, trailM: 0, entries: 0, skipped: 0, glades: 0 };
const TR = [];                 // отрезки троп: [ax, az, bx, bz]
const GRID = new Map();        // клетка 16 м → индексы отрезков
const GLADES = [];             // [x, z, r]
const POLYS = [];              // контуры полос — для мелочи газона (lawnprops.js: в лесу её нет)
let MAT = null;

/* ── шум для полян ── */
function hsh (i, j) {
  let h = Math.imul(i ^ 0x27d4eb2d, 0x9E3779B1) ^ Math.imul(j + 0x165667b1, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
function noise (x, z) {
  const S = LW.GLADE.S, gx = x / S, gz = z / S, i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hsh(i, j), b = hsh(i + 1, j), c = hsh(i, j + 1), e = hsh(i + 1, j + 1);
  return (a + (b - a) * u) + ((c + (e - c) * u) - (a + (b - a) * u)) * v;
}
const segD = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
};
const G = 16, gk = (i, j) => i + ',' + j;
function addSeg (ax, az, bx, bz) {
  const n = TR.length;
  TR.push([ax, az, bx, bz]);
  for (let i = Math.floor((Math.min(ax, bx) - 6) / G); i <= Math.floor((Math.max(ax, bx) + 6) / G); i++)
    for (let j = Math.floor((Math.min(az, bz) - 6) / G); j <= Math.floor((Math.max(az, bz) + 6) / G); j++) {
      let a = GRID.get(gk(i, j));
      if (!a) GRID.set(gk(i, j), a = []);
      a.push(n);
    }
}
/* здесь дерева нет: тропа, поляна у развилки, проплешина */
function hole (x, z, r = 0) {
  const a = GRID.get(gk(Math.floor(x / G), Math.floor(z / G)));
  if (a) for (const n of a) { const s = TR[n]; if (segD(x, z, s[0], s[1], s[2], s[3]) < LW.FREE + r) return true; }
  for (const g of GLADES) if ((x - g[0]) ** 2 + (z - g[1]) ** 2 < g[2] * g[2]) return true;
  return noise(x, z) > LW.GLADE.T;
}

/* ── разметка улицы: точки через STEP м с нормалью ── */
function samples (p) {
  const out = [];
  let s0 = 0;
  for (let i = 1; i < p.length; i++) {
    const [ax, az] = p[i - 1], [bx, bz] = p[i], l = Math.hypot(bx - ax, bz - az);
    if (l < 0.5) continue;
    const ux = (bx - ax) / l, uz = (bz - az) / l;
    for (let s = out.length ? (LW.STEP - (s0 % LW.STEP)) % LW.STEP : 0; s < l; s += LW.STEP)
      out.push({ x: ax + ux * s, z: az + uz * s, ux, uz, s: s0 + s });
    s0 += l;
  }
  // нормаль сглаженная: на изломах контур не перекручивается
  for (let k = 0; k < out.length; k++) {
    const a = out[Math.max(0, k - 2)], b = out[Math.min(out.length - 1, k + 2)];
    let ux = b.x - a.x, uz = b.z - a.z; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l;
    out[k].nx = -uz; out[k].nz = ux;
  }
  return out;
}

/* дом (по рамке) ближе r м */
const HB = new Map();
function houseGrid () {
  for (const b of A.CITY.buildings || []) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const q of b.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    const bb = [x0, z0, x1, z1];
    for (let i = Math.floor(x0 / 50); i <= Math.floor(x1 / 50); i++) for (let j = Math.floor(z0 / 50); j <= Math.floor(z1 / 50); j++) {
      let a = HB.get(gk(i, j)); if (!a) HB.set(gk(i, j), a = []); a.push(bb);
    }
  }
}
function nearHouse (x, z, r) {
  for (let i = Math.floor((x - r) / 50); i <= Math.floor((x + r) / 50); i++) for (let j = Math.floor((z - r) / 50); j <= Math.floor((z + r) / 50); j++)
    for (const b of HB.get(gk(i, j)) || []) {
      const dx = Math.max(b[0] - x, 0, x - b[2]), dz = Math.max(b[1] - z, 0, z - b[3]);
      if (dx * dx + dz * dz < r * r) return true;
    }
  return false;
}
/* сколько метров вглубь свободно: до края города (граница), воды или дома; меньше MIN_D — не лес */
function freeDepth (q, sd, w) {
  let o = LW.FROM;
  for (; o <= LW.FROM + LW.DEPTH[1]; o += 5) {
    const x = q.x + q.nx * sd * (w / 2 + o), z = q.z + q.nz * sd * (w / 2 + o);
    const why = !A.inBounds(x, z, LW.BORDER) ? 'bounds' : A.groundH(x, z) < 0.3 ? 'water' : nearHouse(x, z, LW.HOUSE) ? 'house' : '';
    if (why) { if (o === LW.FROM) ST.why[why] = (ST.why[why] || 0) + 1; break; }
  }
  const dep = o - 5 - LW.FROM;
  return dep >= LW.MIN_D ? dep : 0;
}
/* на отрезке есть твёрдое или дом — по нему не проехать (проверка через 1,5 м) */
function blockedLine (ax, az, bx, bz) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5));
  for (let i = 0; i <= n; i++) { const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n; if (A.solidAt(x, z, 1.3) || A.inHouse(x, z, 2)) return true; }
  return false;
}
function strip (pts, sd, w) {
  const at = (q, o) => [q.x + q.nx * sd * (w / 2 + o), q.z + q.nz * sd * (w / 2 + o)];
  const dep = q => Math.min(q.free, LW.DEPTH[0] + (LW.DEPTH[1] - LW.DEPTH[0]) * noise(q.s * 0.37 + 9000, sd * 777));
  const inner = pts.map(q => at(q, LW.FROM)), outer = pts.map(q => at(q, LW.FROM + dep(q))).reverse();
  const poly = inner.concat(outer);
  FOREST.addArea(poly, hole);
  POLYS.push(poly);
  ST.strips++; ST.m += pts.length * LW.STEP;
  ST.ha = +((ST.ha || 0) + pts.reduce((q, p) => q + dep(p), 0) * LW.STEP / 1e4).toFixed(1);
  // тропа вдоль: посередине, петляет
  const ph = noise(pts[0].x, pts[0].z) * 6.3;
  const mid = pts.map(q => at(q, LW.FROM + dep(q) * (0.5 + 0.22 * Math.sin(q.s / 65 + ph))));
  // где на тропе твёрдое (стоянка, будка, дерево города) — тропа прерывается: там лес, объезд — по съездам
  const lines = [];
  let line = [];
  for (let k = 0; k < mid.length; k++) {
    const blocked = k && blockedLine(mid[k - 1][0], mid[k - 1][1], mid[k][0], mid[k][1]);
    if (blocked) { if (line.length > 1) lines.push(line); line = [mid[k]]; ST.cut = (ST.cut || 0) + 1; continue; }
    line.push(mid[k]);
    if (k) { addSeg(mid[k - 1][0], mid[k - 1][1], mid[k][0], mid[k][1]); ST.trailM += LW.STEP; }
  }
  if (line.length > 1) lines.push(line);
  ST.trails++;
  // съезды: на концах и через ENTRY м — от края тротуара до тропы, с поляной на развилке
  const marks = [0];
  let s = 0;
  while (true) { s += LW.ENTRY[0] + (LW.ENTRY[1] - LW.ENTRY[0]) * noise(s, sd * 31 + pts[0].s); if (s >= (pts.length - 1) * LW.STEP - 30) break; marks.push(Math.round(s / LW.STEP)); }
  marks.push(pts.length - 1);
  for (const k0 of marks) {
    // на съезде твёрдое (столб, дерево аллеи, стена) — сдвигаем на 8—24 м вдоль улицы, иначе не кладём
    let k = -1, rx = 0, rz = 0, mx = 0, mz = 0;
    for (const dk of [0, 1, -1, 2, -2, 3, -3]) {
      const kk = k0 + dk;
      if (kk < 0 || kk >= pts.length) continue;
      const q = pts[kk];
      [mx, mz] = mid[kk]; [rx, rz] = at(q, 3.2);             // от края тротуара
      if (!blockedLine(rx, rz, mx, mz)) { k = kk; break; }
    }
    if (k < 0) { ST.skipped++; continue; }
    addSeg(rx, rz, mx, mz);
    lines.push([[rx, rz], [mx, mz]]);
    ST.entries++;
    const [g0, g1] = LW.GLADE.FORK, gr = g0 + (g1 - g0) * noise(mx, mz);
    GLADES.push([mx, mz, gr]); ST.glades++;
  }
  return lines;
}

/* ── меш троп: лента утоптанной земли по рельефу, на тротуар и асфальт не заходит ── */
function trailMesh (lines) {
  const T = A.THREE, P = [], half = LW.TRAIL_W / 2;
  for (const ln of lines) {
    // по 3 м
    const pts = [];
    for (let k = 1; k < ln.length; k++) {
      const [ax, az] = ln[k - 1], [bx, bz] = ln[k], l = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(l / 3));
      for (let i = k > 1 ? 1 : 0; i <= n; i++) pts.push([ax + (bx - ax) * i / n, az + (bz - az) * i / n]);
    }
    for (let k = 1; k < pts.length; k++) {
      const [ax, az] = pts[k - 1], [bx, bz] = pts[k];
      if (A.onPave(ax, az, half) || A.onPave(bx, bz, half)) continue;
      const l = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / l * half, nz = (bx - ax) / l * half;
      const y = (x, z) => A.groundH(x, z) + 0.05;
      const a1 = [ax + nx, az + nz], a2 = [ax - nx, az - nz], b1 = [bx + nx, bz + nz], b2 = [bx - nx, bz - nz];
      P.push(a1[0], y(...a1), a1[1], b1[0], y(...b1), b1[1], a2[0], y(...a2), a2[1]);
      P.push(a2[0], y(...a2), a2[1], b1[0], y(...b1), b1[1], b2[0], y(...b2), b2[1]);
    }
  }
  if (!P.length) return;
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(P, 3));
  g.computeVertexNormals();
  MAT = new T.MeshLambertMaterial({ color: LW.COLOR, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: T.DoubleSide });
  const m = new T.Mesh(g, MAT);
  m.matrixAutoUpdate = false; m.updateMatrix();
  m.userData.noShadow = true;
  A.scene.add(m);
  ST.tris = P.length / 9;
}

export function init (api) {
  A = api;
  const roads = (A.CITY.roads || []).filter(r => r.n === LW.STREET && r.c <= 5 && r.p && r.p.length > 1);
  const lines = [];
  houseGrid();
  for (const r of roads) {
    const pts = samples(r.p);
    for (const sd of [1, -1]) {
      let run = [];
      const flush = () => { if (run.length * LW.STEP >= LW.MIN_RUN) lines.push(...strip(run, sd, r.w)); run = []; };
      for (const q0 of pts) { const f = freeDepth(q0, sd, r.w); if (f) run.push({ ...q0, free: f }); else flush(); }
      flush();
    }
  }
  trailMesh(lines);
  if (typeof window !== 'undefined') window.setTimeout(() => { if (window.__dlv) window.__dlv.LWOOD = DEBUG; }, 0);
}

export const polys = () => POLYS;

/* зимой тропы под снегом — светлее, но видны */
const C0 = { r: 0, g: 0, b: 0 };
export function step () {
  if (!MAT) return;
  const s = snowAmt();
  if (Math.abs(s - (C0.s ?? -1)) < 0.01) return;
  C0.s = s;
  MAT.color.set(LW.COLOR).lerp(new A.THREE.Color(LW.SNOW), Math.min(1, s) * 0.75);
}

const DEBUG = { LW, ST, TR, GLADES, hole, get A () { return A; }, nearHouse };
