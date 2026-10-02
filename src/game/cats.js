/* ──────────────────────────────────────────────────────────────────────────
   Подвалы и дворовые коты (docs/IDEAS.md «Быстрые правки»; правила —
   docs/ORDERS.md «Коты на крышах и в подвалах»).

   Продухи: у жилых домов (панельки, кирпичные, сталинки от 2 этажей) — тёмные
     окошки подвала у самой земли вдоль стен от VENT.MIN_WALL (7 м), через
     VENT.STEP (6 м), не у подъездов, не в арке и не там, где к стене прилип
     соседний дом. Большинство — с решёткой из двух прутьев, VENT.BROKEN (10 %) —
     решётка выломана (один прут, косо), VENT.OPEN (10 %) — чёрная дыра без
     решётки. В доме, где продухов от трёх, хотя бы одна дыра есть всегда.
     Это квадраты в общей склейке окон (FLATM) — ни объектов, ни вызовов отрисовки.
   Коты (их не сбить ни в одной версии — машина проезжает сквозь, кот отпрыгивает):
     на крышах — до ROOF.ON (4): крыша жилого дома 2–9 этажей в ROOF.R
       (18–90 м) от машины. На плоской — сидят на краю боком к улице, хвост
       свешен вниз; на скатной (сталинки, кирпичные) — на коньке, хвост по скату;
       смотрят по сторонам (машина ближе 30 м — смотрят на неё), иногда
       вылизывают лапу, раз в ROOF.MOVE (30–90 с) переходят на другой край той же
       крыши. Никого не боятся.
     во дворах — до GROUND.ON (4): у дыры в подвал или у подъезда рядом с ней,
       сидят, умываются, бродят в GROUND.HOME (6 м) от дыры. Машина ближе
       GROUND.FLEE (12 м) — а если она едет быстрее 40 км/ч, то ближе FLEE_FAST
       (22 м) — или прохожий ближе PEOPLE (2,5 м): кот бежит (RUN 6,5 м/с) к своей
       дыре или к ближайшей в 30 м и ныряет в подвал. Через HIDE (20–60 с)
       выглядывает (PEEK 3–6 с) и, если вокруг тихо, выходит. Машина ещё рядом —
       прячется обратно.
     Появляются вне кадра (или дальше 70 м), уехал дальше FAR (200 / 160 м) —
     пропадают. Всего рядом — не больше MAX (8).

   Перф: модель кота — 7 мешей с общими геометриями (по окрасу) и одним
   материалом на всех; дальше SHOW — спрятан; люди вокруг — раз в 0,3 с.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

export const CATS = {
  VENT: { STEP: 6, MIN_WALL: 7, W: 0.85, H: 0.4, Y: 0.1, OPEN: 0.1, BROKEN: 0.1, DOOR: 2.4, ARCH: 4.5 },
  ROOF: { ON: 4, R: [18, 90], LV: [2, 9], FAR: 200, SHOW: 190, MOVE: [30, 90], WALK: 1.1, LOOK: 30 },
  GROUND: { ON: 4, R: [25, 100], FAR: 160, SHOW: 140, FLEE: 12, FLEE_FAST: 22, FAST: 11, PEOPLE: 2.5,
    RUN: 6.5, WALK: 0.7, HIDE: [20, 60], PEEK: [3, 6], HOME: 6, HOLE_R: 30, DODGE: 3 },
  MAX: 8, SCALE: 1.2, VIEW: 70,
};
const STYLES = ['panel', 'brick', 'stalin'];
const LIVE = ['drive', 'back', 'handover', 'side'];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const hash = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
const dAng = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/* ── модель: коробки, склеенные по частям, цвет — в вершинах ──
   части: тело (с брюхом и полосками), голова, хвост (группа + кусок, как у
   Барсика из story.js), четыре лапы — пивот у бедра, чтобы шагать. */
export const FURS = [
  { base: '#e0873f', belly: '#f4efe6', leg: '#f4efe6', stripe: '#b8622a', eye: '#2a1d16' },   // рыжий с белым (Барсик)
  { base: '#2a2a2e', belly: '#34343a', leg: '#2a2a2e', stripe: '#1e1e22', eye: '#c8d84a' },   // чёрный
  { base: '#8d8d93', belly: '#d8d8d4', leg: '#8d8d93', stripe: '#5e5e66', eye: '#2a2a20' },   // серый полосатый
  { base: '#efe9de', belly: '#ffffff', leg: '#efe9de', stripe: '#e2d8c8', eye: '#3a6a8a' },   // белый
  { base: '#3b2a22', belly: '#f4efe6', leg: '#3b2a22', stripe: '#c9733a', eye: '#2a1d16' },   // черепаховый
  { base: '#7a6450', belly: '#cbbba5', leg: '#7a6450', stripe: '#4a3a2c', eye: '#2a1d16' },   // бурый полосатый
  { base: '#2a2a2e', belly: '#f4efe6', leg: '#f4efe6', stripe: '#2a2a2e', eye: '#c8d84a' },   // чёрно-белый
];
const PINK = '#e89aa8';
let CAT_MAT = null;
const catMat = T => CAT_MAT || (CAT_MAT = Object.assign(new T.MeshLambertMaterial({ vertexColors: true, flatShading: true }), { userData: { keep: true } }));
/* boxes: [w, h, d, hex, x, y, z, rx] → одна геометрия с цветами вершин */
function merge (T, boxes) {
  const pos = [], nor = [], col = [], c = new T.Color(), m = new T.Matrix4(), e = new T.Euler();
  for (const [w, h, d, hex, x, y, z, rx = 0] of boxes) {
    const g = new T.BoxGeometry(w, h, d).toNonIndexed();
    m.makeRotationFromEuler(e.set(rx, 0, 0)).setPosition(x, y, z);
    g.applyMatrix4(m);
    c.set(hex);
    const P = g.attributes.position.array, N = g.attributes.normal.array;
    for (let i = 0; i < P.length; i += 3) { pos.push(P[i], P[i + 1], P[i + 2]); nor.push(N[i], N[i + 1], N[i + 2]); col.push(c.r, c.g, c.b); }
    g.dispose();
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
function catGeos (T, f) {
  const body = [[0.26, 0.22, 0.5, f.base, 0, 0, 0], [0.2, 0.08, 0.36, f.belly, 0, -0.11, 0.02]];
  for (const z of [-0.12, 0, 0.12]) body.push([0.27, 0.03, 0.05, f.stripe, 0, 0.11, z]);
  const head = [[0.26, 0.22, 0.22, f.base, 0, 0, 0], [0.16, 0.08, 0.04, f.belly, 0, -0.05, 0.11], [0.04, 0.03, 0.02, PINK, 0, -0.02, 0.125]];
  for (const x of [-0.07, 0.07]) head.push([0.04, 0.05, 0.02, f.eye, x, 0.03, 0.115], [0.07, 0.09, 0.05, f.base, x, 0.14, -0.02]);
  return {
    body: merge(T, body), head: merge(T, head),
    tail: merge(T, [[0.06, 0.06, 0.34, f.base, 0, 0, 0], [0.065, 0.065, 0.06, f.stripe, 0, 0, -0.1]]),
    leg: merge(T, [[0.07, 0.16, 0.07, f.leg, 0, -0.08, 0]]),
  };
}
const GEOS = new Map();
/* кот: Group с userData { head, tail, tailBox, body, legs[4] } — легенда в шапке.
   own — свои геометрии (story.js отдаёт кота в dropMesh, а тот их освобождает) */
export function makeCatModel (T, fur = FURS[0], own = false) {
  let G = own ? null : GEOS.get(fur);
  if (!G) { G = catGeos(T, fur); if (!own) GEOS.set(fur, G); }
  const M = catMat(T), g = new T.Group();
  const mesh = (geo, x, y, z, parent = g) => { const o = new T.Mesh(geo, M); o.position.set(x, y, z); parent.add(o); return o; };
  const body = mesh(G.body, 0, 0.25, 0);
  const legs = [[-0.08, 0.18], [0.08, 0.18], [-0.08, -0.18], [0.08, -0.18]].map(([x, z]) => mesh(G.leg, x, 0.16, z));
  const head = mesh(G.head, 0, 0.42, 0.28);
  const tail = new T.Group(); tail.position.set(0, 0.32, -0.24); g.add(tail);
  const tailBox = mesh(G.tail, 0, 0.1, -0.14, tail); tailBox.rotation.x = -0.7;
  g.userData = { head, tail, tailBox, body, legs };
  return g;
}

/* ───────── подвалы: продухи на стенах жилых домов ───────── */
let A = null;
const HOLES = [];                     // дыры в подвал: { x, z, y, ox, oz } — точка у стены снаружи
const HGRID = new Map();              // клетки 40 м → дыры
const ROOFS = [];                     // плоские крыши жилых домов: { p, y, cx, cz, walls }
const RGRID = new Map();              // клетки 60 м → крыши
const ENTR = [];                      // подъезды (для котов у двери)
export const STATS = { vents: 0, holes: 0, broken: 0, roofs: 0, ms: 0 };
const gkey = (x, z, s) => Math.floor(x / s) + ',' + Math.floor(z / s);
function gput (G, s, x, z, v) { const k = gkey(x, z, s); let a = G.get(k); if (!a) G.set(k, a = []); a.push(v); }
function gnear (G, s, x, z, r, out = []) {
  for (let i = Math.floor((x - r) / s); i <= Math.floor((x + r) / s); i++)
    for (let j = Math.floor((z - r) / s); j <= Math.floor((z + r) / s); j++) {
      const a = G.get(i + ',' + j);
      if (a) for (const v of a) out.push(v);
    }
  return out;
}

/* конёк скатной крыши — та же раскладка, что в CBITS.gableRoof: прямоугольник по
   длинной стене, вынос 0,45 м, подъём до 4,5 м; не прямоугольник — крыши нет */
function ridgeOf (p, h, hipped) {
  if (p.length < 4 || p.length > 6) return null;
  let best = 0, ang = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > best) { best = l; ang = Math.atan2(b[1] - a[1], b[0] - a[0]); }
  }
  const ux = Math.cos(ang), uz = Math.sin(ang), nx = -uz, nz = ux;
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity, area2 = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i], r = p[(i + 1) % p.length];
    area2 += q[0] * r[1] - r[0] * q[1];
    const a = q[0] * ux + q[1] * uz, b = q[0] * nx + q[1] * nz;
    a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b);
  }
  if (Math.abs(area2) / 2 / ((a1 - a0) * (b1 - b0) || 1) < 0.82) return null;
  a0 -= 0.45; a1 += 0.45; b0 -= 0.45; b1 += 0.45;
  const W = b1 - b0, rise = Math.min(4.5, W * (hipped ? 0.3 : 0.42)), bm = (b0 + b1) / 2;
  const hip = hipped ? Math.min(W * 0.5, (a1 - a0) * 0.3) : 0, s0 = a0 + hip + 0.5, len = a1 - hip - 0.5 - s0;
  if (len < 3) return null;
  return { y: h + rise, slope: Math.atan2(rise, W / 2), w: { a: [s0 * ux + bm * nx, s0 * uz + bm * nz], len, ux, uz, ox: nx, oz: nz } };
}

/* api: { CITY, FLATM, ARCHES, groundH, inHouse, inPoly, hexOf } — после подъездов (osmEntrances) */
export function build (api) {
  A = api;
  const t0 = performance.now(), VT = CATS.VENT, F = A.FLATM, C = new THREE.Color();
  const EG = new Map();
  for (const e of A.CITY.entrances) { gput(EG, 10, e[0], e[1], e); ENTR.push(e); }
  for (const a of A.ARCHES || []) for (const q of [[a.mx, a.mz], [a.mx + a.ix * a.t, a.mz + a.iz * a.t]]) gput(EG, 10, q[0], q[1], [q[0], q[1], 0, 0, 1]);
  const TMP = [];
  // у подъезда (DOOR) или у арки (ARCH): точки арок — в той же сетке, с пометкой
  const nearDoor = (x, z) => {
    TMP.length = 0;
    for (const e of gnear(EG, 10, x, z, Math.max(VT.DOOR, VT.ARCH), TMP)) if (Math.hypot(e[0] - x, e[1] - z) < (e[4] ? VT.ARCH : VT.DOOR)) return true;
    return false;
  };
  for (const b of A.CITY.buildings) {
    if (b.k !== 'res' || !b._hex || !STYLES.includes(b.st)) continue;
    const p = b.p, n = p.length;
    let hHi = -Infinity, s2 = 0, cx = 0, cz = 0;
    for (let i = 0; i < n; i++) {
      const a = p[i], c = p[(i + 1) % n], cr = a[0] * c[1] - c[0] * a[1];
      s2 += cr; cx += (a[0] + c[0]) * cr; cz += (a[1] + c[1]) * cr;
      hHi = Math.max(hHi, A.groundH(a[0], a[1]));
    }
    const area = Math.abs(s2) / 2, ccw = s2 > 0;
    if (s2) { cx /= 3 * s2; cz /= 3 * s2; } else { cx = p[0][0]; cz = p[0][1]; }
    const lv = b.lv || (area > 1200 ? 5 : area > 600 ? 4 : area > 220 ? 2 : 1);
    if (lv < 2) continue;
    const h = hHi + 3.15 * lv + 1.1, seed = Math.abs(Math.round(cx * 7 + cz * 13));
    const walls = [];
    for (let i = 0; i < n; i++) {
      const a = p[i], c = p[(i + 1) % n], dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 0.4) continue;
      walls.push({ a, len, ux: dx / len, uz: dz / len, ox: (ccw ? dz : -dz) / len, oz: (ccw ? -dx : dx) / len });
    }
    // крыша для котов: плоская — край у стены; скатная (как CBITS.gableRoof) — конёк
    if (area > 120 && lv >= CATS.ROOF.LV[0] && lv <= CATS.ROOF.LV[1]) {
      const rg = (b.roof === 'g' || b.roof === 'h') ? ridgeOf(p, h, b.roof === 'h') : null;
      const tent = !rg && b.roof && b.roof !== 'f' && area < 420 && n <= 10 && lv <= 4;
      const rw = rg ? [rg.w] : tent ? [] : walls.filter(w => w.len >= 4);
      if (rw.length) {
        const r = { p, y: rg ? rg.y : h, cx, cz, walls: rw, ridge: !!rg, slope: rg ? rg.slope : 0, cat: null };
        ROOFS.push(r); gput(RGRID, 60, cx, cz, r);
      }
    }
    // продухи: сначала места, потом какие из них — дыры
    const vit = lv >= 5 && seed % 3 === 0;              // у части высоких — витрина во весь первый этаж
    const spots = [];
    for (const w of walls) {
      if (w.len < VT.MIN_WALL || (vit && w.len > 14)) continue;
      const m = Math.floor((w.len - 1.5) / VT.STEP) + 1, pad = (w.len - (m - 1) * VT.STEP) / 2;
      for (let i = 0; i < m; i++) {
        const s = pad + i * VT.STEP, x = w.a[0] + w.ux * s, z = w.a[1] + w.uz * s;
        if (nearDoor(x, z) || A.inHouse(x + w.ox * 0.6, z + w.oz * 0.6)) continue;
        const g = A.groundH(x + w.ox * 0.5, z + w.oz * 0.5);
        if (g + VT.Y + VT.H > hHi + 0.62) continue;     // выше — уже окна первого этажа
        spots.push({ w, s, x, z, g, r: hash(x, z) });
      }
    }
    if (!spots.length) continue;
    let holes = 0;
    for (const v of spots) { v.kind = v.r < VT.OPEN ? 'open' : v.r < VT.OPEN + VT.BROKEN ? 'broken' : 'grille'; if (v.kind !== 'grille') holes++; }
    if (!holes && spots.length >= 3) spots[Math.floor(hash(cz, cx) * spots.length)].kind = 'open';
    C.set(A.hexOf(b)).multiplyScalar(0.72);
    const bar = '#' + C.getHexString();
    for (const v of spots) {
      const { w, s, g } = v, hw = VT.W / 2 + (v.kind === 'open' ? 0.04 : 0), y0 = g + VT.Y, y1 = y0 + VT.H + (v.kind === 'open' ? 0.06 : 0);
      const at = (d, out) => [w.a[0] + w.ux * (s + d) + w.ox * out, w.a[1] + w.uz * (s + d) + w.oz * out];
      const [ax, az] = at(-hw, 0.1), [bx, bz] = at(hw, 0.1);
      F.color(v.kind === 'grille' ? '#2b2622' : '#0b0a09');
      F.quad(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az, w.ox, 0, w.oz);
      F.color(bar);
      const rod = (d0, d1) => {                          // прут: снизу в d0, сверху в d1
        const [p0x, p0z] = at(d0 - 0.025, 0.12), [p1x, p1z] = at(d0 + 0.025, 0.12), [q1x, q1z] = at(d1 + 0.025, 0.12), [q0x, q0z] = at(d1 - 0.025, 0.12);
        F.quad(p0x, y0, p0z, p1x, y0, p1z, q1x, y1, q1z, q0x, y1, q0z, w.ox, 0, w.oz);
      };
      if (v.kind === 'grille') { rod(-hw / 3, -hw / 3); rod(hw / 3, hw / 3); STATS.vents++; }
      else {
        if (v.kind === 'broken') { rod(-hw / 3 - 0.06, -hw / 3 + 0.08); STATS.broken++; }
        const x = v.x + w.ox * 0.3, z = v.z + w.oz * 0.3;
        const hole = { x, z, y: g, ox: w.ox, oz: w.oz, ux: w.ux, uz: w.uz, cat: null };
        HOLES.push(hole); gput(HGRID, 40, x, z, hole);
        STATS.holes++;
      }
    }
  }
  STATS.roofs = ROOFS.length;
  STATS.ms = Math.round(performance.now() - t0);
  return STATS;
}

/* ───────── коты ───────── */
const LIST = [];
const ST = { spawnR: 0.5, spawnG: 1, ppl: 0 };
const FR = new THREE.Frustum(), PM = new THREE.Matrix4(), PV = new THREE.Vector3();
function inView (x, y, z) {
  const cam = A.cam;
  if (!cam) return false;
  PM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  FR.setFromProjectionMatrix(PM);
  return FR.containsPoint(PV.set(x, y, z));
}
const hidden = (x, y, z) => Math.hypot(x - A.V.x, z - A.V.z) > CATS.VIEW || !inView(x, y + 0.3, z);
function onRoad (x, z, m) { const r = A.nearestRoad(x, z); return !!r && r.d < (r.seg.w || 7) / 2 + m; }

function add (kind, x, y, z, h, extra) {
  const g = makeCatModel(THREE, pick(FURS));
  g.scale.setScalar(CATS.SCALE);
  const c = { kind, g, u: g.userData, x, y, z, h, v: 0, mode: 'sit', mt: rand(2, 6), ph: rand(0, 6), look: 0, lookT: 0,
    groom: rand(6, 16), sitK: 1, jy: 0, jump: 0, ...extra };
  if (kind === 'roof') { c.u.tail.rotation.order = 'YXZ'; c.u.tailBox.position.set(0, 0, -0.17); c.u.tailBox.rotation.x = 0; }
  A.scene.add(g);
  LIST.push(c);
  pose(c, 0);
  return c;
}
function drop (c) {
  A.scene.remove(c.g);
  if (c.roof && c.roof.cat === c) c.roof.cat = null;
  if (c.hole && c.hole.cat === c) c.hole.cat = null;
  LIST.splice(LIST.indexOf(c), 1);
}
export function clear () { for (let i = LIST.length - 1; i >= 0; i--) drop(LIST[i]); }

/* крыша: место на краю — 0,16 м внутрь от стены, боком к улице */
function edgeSpot (r, w) {
  const t = rand(0.15, 0.85) * w.len;
  if (r.ridge) {                                     // на коньке: хвост — по одному из скатов
    const sd = Math.random() < 0.5 ? 1 : -1;
    return { x: w.a[0] + w.ux * t, z: w.a[1] + w.uz * t, w: { ...w, ox: w.ox * sd, oz: w.oz * sd } };
  }
  const x = w.a[0] + w.ux * t - w.ox * 0.16, z = w.a[1] + w.uz * t - w.oz * 0.16;
  if (!A.inPoly(x, z, r.p)) return null;
  return { x, z, w };
}
function spawnRoof () {
  const R = CATS.ROOF, V = A.V;
  const cands = gnear(RGRID, 60, V.x, V.z, R.R[1]).filter(r => !r.cat && Math.hypot(r.cx - V.x, r.cz - V.z) > R.R[0] && Math.hypot(r.cx - V.x, r.cz - V.z) < R.R[1]);
  for (let k = 0; k < 6 && cands.length; k++) {
    const r = cands.splice(Math.floor(Math.random() * cands.length), 1)[0];
    const sp = edgeSpot(r, pick(r.walls));
    if (!sp || !hidden(sp.x, r.y, sp.z)) continue;
    const c = add('roof', sp.x, r.y, sp.z, Math.atan2(sp.w.ux, sp.w.uz), { roof: r, edge: sp.w, mt: rand(...R.MOVE) });
    r.cat = c;
    setEdge(c, sp.w);
    return c;
  }
  return null;
}
/* в какую сторону от кота улица (локальный +x или −x) */
function setEdge (c, w) {
  c.edge = w; c.h = Math.atan2(w.ux, w.uz);
  c.side = (w.ox * Math.cos(c.h) - w.oz * Math.sin(c.h)) > 0 ? 1 : -1;
}

function holesNear (x, z, r) { return gnear(HGRID, 40, x, z, r).filter(q => Math.hypot(q.x - x, q.z - z) < r); }
/* ближайшая дыра в стене, что смотрит на точку (не через дом) */
function nearestHole (x, z, r) {
  let best = null, bd = r;
  for (const q of holesNear(x, z, r)) {
    const d = Math.hypot(q.x - x, q.z - z);
    if (d < bd && (x - q.x) * q.ox + (z - q.z) * q.oz > -0.2) { bd = d; best = q; }
  }
  return best;
}
/* точка во дворе у дыры: не в доме и не на дороге */
function yardSpot (q, near = CATS.GROUND.HOME) {
  for (let k = 0; k < 8; k++) {
    const o = rand(0.8, 3.5), s = rand(-near, near), x = q.x + q.ox * o + q.ux * s, z = q.z + q.oz * o + q.uz * s;
    if (!A.inHouse(x, z, 0.3) && !onRoad(x, z, 1)) return { x, z };
  }
  return null;
}
function spawnGround () {
  const G = CATS.GROUND, V = A.V;
  const cands = holesNear(V.x, V.z, G.R[1]).filter(q => !q.cat && Math.hypot(q.x - V.x, q.z - V.z) > G.R[0]);
  for (let k = 0; k < 8 && cands.length; k++) {
    const q = cands.splice(Math.floor(Math.random() * cands.length), 1)[0];
    let sp = null;
    // у подъезда рядом с дырой (до 20 м) — чаще, чем у самой дыры
    if (Math.random() < 0.4) {
      const e = ENTR.find(e => Math.hypot(e[0] - q.x, e[1] - q.z) < 20);
      if (e) { const x = e[0] + e[2] * 1.7 + e[3] * rand(-1, 1), z = e[1] + e[3] * 1.7 - e[2] * rand(-1, 1); if (!A.inHouse(x, z, 0.3) && !onRoad(x, z, 1)) sp = { x, z }; }
    }
    if (!sp) sp = yardSpot(q);
    if (!sp) continue;
    const y = A.groundH(sp.x, sp.z);
    if (!hidden(sp.x, y, sp.z)) continue;
    const c = add('ground', sp.x, y, sp.z, rand(0, Math.PI * 2), { hole: q, mode: Math.random() < 0.6 ? 'sit' : 'walk' });
    q.cat = c;
    if (c.mode === 'walk') { c.tx = sp.x; c.tz = sp.z; wanderTo(c); }
    return c;
  }
  return null;
}
function wanderTo (c) {
  const sp = yardSpot(c.hole);
  if (!sp) { c.mode = 'sit'; c.mt = rand(3, 6); return; }
  c.tx = sp.x; c.tz = sp.z; c.mode = 'walk'; c.mt = 12;
}

/* прохожий рядом (сетка прохожих game.js — клетки 5 м) */
function personNear (c) {
  const W = A.WGRID, r = CATS.GROUND.PEOPLE;
  if (!W) return false;
  for (let i = Math.floor((c.x - r) / 5); i <= Math.floor((c.x + r) / 5); i++)
    for (let j = Math.floor((c.z - r) / 5); j <= Math.floor((c.z + r) / 5); j++) {
      const a = W.get(i + ',' + j);
      if (a) for (const p of a) if (!p.dead && Math.hypot(p.x - c.x, p.z - c.z) < r) return true;
    }
  return false;
}

function thinkGround (c, dt, dCar, spd, ppl) {
  const G = CATS.GROUND, V = A.V;
  const scared = dCar < (spd > G.FAST ? G.FLEE_FAST : G.FLEE) || (ppl && personNear(c));
  c.mt -= dt;
  const m = c.mode;
  if (scared && (m === 'sit' || m === 'walk' || m === 'groom')) {
    const hm = c.hole, homeOk = Math.hypot(hm.x - c.x, hm.z - c.z) < G.HOLE_R && (c.x - hm.x) * hm.ox + (c.z - hm.z) * hm.oz > -0.2;
    const q = homeOk ? hm : nearestHole(c.x, c.z, G.HOLE_R);
    if (q && q !== c.hole) { if (c.hole.cat === c) c.hole.cat = null; c.hole = q; q.cat = c; }
    if (q) { c.mode = 'flee'; c.tx = q.x + q.ox * 0.2; c.tz = q.z + q.oz * 0.2; }
    else { c.mode = 'away'; c.mt = 3; c.h = Math.atan2(c.x - V.x, c.z - V.z); }
    if (A.Snd && A.Snd.blip && dCar < 30 && Math.random() < 0.5) A.Snd.blip(1100, 0.08, 'triangle', 0.03);
  }
  // машина совсем рядом — отпрыгнуть вбок (сбить кота нельзя: столкновения нет вовсе)
  if (dCar < G.DODGE && !c.jump && c.mode !== 'hid' && c.mode !== 'in') {
    const vx = V.vx, vz = V.vz, sv = Math.hypot(vx, vz) || 1, sd = ((c.x - V.x) * vz - (c.z - V.z) * vx) > 0 ? 1 : -1;
    c.jump = 1; c.jy = 0; c.kx = vz / sv * sd * 3.5; c.kz = -vx / sv * sd * 3.5;
  }
  switch (c.mode) {
    case 'sit': c.v = 0; if (c.mt <= 0) { if (Math.random() < 0.35) { c.mode = 'groom'; c.mt = rand(2.5, 4); } else wanderTo(c); } break;
    case 'groom': c.v = 0; if (c.mt <= 0) { c.mode = 'sit'; c.mt = rand(3, 8); } break;
    case 'walk': {
      const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
      c.h += dAng(c.h, Math.atan2(dx, dz)) * Math.min(1, dt * 5);
      c.v = G.WALK;
      if (d < 0.3 || c.mt <= 0) { c.mode = 'sit'; c.mt = rand(4, 10); c.v = 0; }
      break;
    }
    case 'flee': case 'out': {
      const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
      c.h = Math.atan2(dx, dz);
      c.v = c.mode === 'flee' ? G.RUN : G.WALK * 1.4;
      if (d < 0.35) {
        if (c.mode === 'flee') { c.mode = 'in'; c.mt = 0.4; c.h = Math.atan2(-c.hole.ox, -c.hole.oz); }
        else { c.mode = 'sit'; c.mt = rand(3, 8); }
        c.v = 0;
      }
      break;
    }
    case 'in':                                       // ныряет в дыру: в стену и чуть вниз
      c.v = 1.4; c.h = Math.atan2(-c.hole.ox, -c.hole.oz);
      if (c.mt <= 0) { c.mode = 'hid'; c.mt = rand(...G.HIDE); c.g.visible = false; c.v = 0; }
      break;
    case 'hid':
      c.v = 0;
      if (c.mt <= 0) {
        if (dCar < G.FLEE * 1.5) { c.mt = rand(5, 10); break; }
        const q = c.hole;
        c.x = q.x - q.ox * 0.12; c.z = q.z - q.oz * 0.12; c.h = Math.atan2(q.ox, q.oz);
        c.mode = 'peek'; c.mt = rand(...G.PEEK);
      }
      break;
    case 'peek':                                     // выглянул: голова из дыры
      c.v = 0;
      if (scared) { c.mode = 'in'; c.mt = 0.25; break; }
      if (c.mt <= 0) { const sp = yardSpot(c.hole, 2); if (sp) { c.mode = 'out'; c.tx = sp.x; c.tz = sp.z; } else c.mt = 3; }
      break;
    case 'away': c.v = G.RUN; if (c.mt <= 0) { c.mode = 'hid'; c.mt = 1e9; c.g.visible = false; } break;
  }
}

function thinkRoof (c, dt, dCar) {
  const R = CATS.ROOF;
  c.mt -= dt;
  if (c.mode === 'move') {
    const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
    c.h = Math.atan2(dx, dz); c.v = R.WALK;
    if (d < 0.2) { c.x = c.tx; c.z = c.tz; c.v = 0; c.mode = 'sit'; setEdge(c, c.next); c.mt = rand(...R.MOVE); }
    return;
  }
  c.v = 0;
  if (c.mode === 'groom' && c.mt <= 0) { c.mode = 'sit'; c.mt = rand(...R.MOVE); }
  if (c.mode === 'sit') {
    if ((c.groom -= dt) <= 0) { c.groom = rand(8, 20); c.mode = 'groom'; c.mt = rand(2, 3.5); return; }
    if (c.mt <= 0) {
      // переходит на другой край: прямая должна идти по крыше
      const sp = edgeSpot(c.roof, pick(c.roof.walls));
      let ok = !!sp;
      for (let t = 0.2; ok && !c.roof.ridge && t < 0.9; t += 0.2) ok = A.inPoly(c.x + (sp.x - c.x) * t, c.z + (sp.z - c.z) * t, c.roof.p);
      if (ok && Math.hypot(sp.x - c.x, sp.z - c.z) > 2) { c.mode = 'move'; c.tx = sp.x; c.tz = sp.z; c.next = sp.w; }
      else c.mt = rand(5, 15);
    }
  }
}

/* поза: лапы, тело, голова, хвост */
function pose (c, dt) {
  const u = c.u, T = performance.now() / 1000;
  const walking = c.v > 0.05;
  c.ph += dt * (walking ? c.v / 0.22 * Math.PI : 0);
  const sw = walking ? Math.sin(c.ph) * Math.min(0.9, 0.35 + c.v * 0.1) : 0;
  u.legs[0].rotation.x = u.legs[3].rotation.x = sw;
  u.legs[1].rotation.x = u.legs[2].rotation.x = -sw;
  const sit = !walking && c.mode !== 'in';
  c.sitK += ((sit ? 1 : 0) - c.sitK) * Math.min(1, dt * 6);
  u.body.rotation.x = -0.35 * c.sitK;
  u.body.position.y = 0.25 + 0.05 * c.sitK;
  u.head.position.y = 0.42 + 0.06 * c.sitK;
  u.legs[2].rotation.x -= 1.4 * c.sitK; u.legs[3].rotation.x -= 1.4 * c.sitK;   // сидит: задние лапы поджаты под себя
  // голова: оглядывается; умывается — к лапе
  if ((c.lookT -= dt) <= 0) { c.lookT = rand(1.5, 4.5); c.look = rand(-1.1, 1.1); }
  let yaw = c.look, pitch = 0;
  if (c.kind === 'roof') {
    yaw = c.side * Math.PI / 2 + c.look * 0.6;
    const dCar = Math.hypot(A.V.x - c.x, A.V.z - c.z);
    if (dCar < CATS.ROOF.LOOK) yaw = dAng(c.h, Math.atan2(A.V.x - c.x, A.V.z - c.z));
    yaw = Math.max(-1.9, Math.min(1.9, yaw)); pitch = 0.35;              // смотрит вниз, на улицу
  }
  if (walking) { yaw = 0; pitch = 0; }
  if (c.mode === 'groom') {
    yaw = 0.35; pitch = 0.5 + Math.sin(T * 9) * 0.15;
    u.legs[1].rotation.x = -1.3 + Math.sin(T * 9) * 0.2;
  }
  u.head.rotation.y += (yaw - u.head.rotation.y) * Math.min(1, dt * 4);
  u.head.rotation.x += (pitch - u.head.rotation.x) * Math.min(1, dt * 4);
  // хвост: на крыше свешен с края вниз, на земле — трубой на ходу и метёт, сидя
  if (c.kind === 'roof' && !walking) {
    u.tail.position.set(c.side * 0.12, 0.3, -0.18);
    u.tail.rotation.set((c.roof.ridge ? -c.roof.slope - 0.12 : -1.25) + Math.sin(T * 1.7 + c.ph) * 0.12, -c.side * Math.PI / 2 + Math.sin(T * 1.1) * 0.15, 0);
  } else {
    u.tail.position.set(0, 0.32, -0.24);
    u.tail.rotation.set(walking ? (c.mode === 'flee' ? 0.2 : 0.9) : 0.6, Math.sin(T * 3.2 + c.ph) * (walking ? 0.15 : 0.5), 0);
  }
  // в дыру: проседает и уходит в стену; выглядывает — видна передняя половина
  let y = c.y;
  if (c.mode === 'in') y -= 0.12;
  if (c.mode === 'peek') y -= 0.24;
  if (c.jump) {
    c.jy += dt / 0.45;
    if (c.jy >= 1) { c.jump = 0; c.jy = 0; c.kx = c.kz = 0; } else y += 1.6 * c.jy * (1 - c.jy);
  }
  c.g.position.set(c.x, y, c.z);
  c.g.rotation.y = c.h;
}

export function step (dt, api) {
  A = api;
  const S = A.S, V = A.V;
  if (!S || S.state === 'title' || S.state === 'over' || !HOLES.length && !ROOFS.length) { if (LIST.length) clear(); return; }
  const live = LIVE.includes(S.state);
  if (live) {
    const nR = LIST.filter(c => c.kind === 'roof').length, nG = LIST.length - nR;
    if ((ST.spawnR -= dt) <= 0) { ST.spawnR = rand(1.5, 4); if (nR < CATS.ROOF.ON && LIST.length < CATS.MAX) spawnRoof(); }
    if ((ST.spawnG -= dt) <= 0) { ST.spawnG = rand(2, 5); if (nG < CATS.GROUND.ON && LIST.length < CATS.MAX) spawnGround(); }
  }
  const spd = Math.hypot(V.vx, V.vz);
  const ppl = (ST.ppl -= dt) <= 0;
  if (ppl) ST.ppl = 0.3;
  for (let i = LIST.length - 1; i >= 0; i--) {
    const c = LIST[i], dCar = Math.hypot(c.x - V.x, c.z - V.z);
    const roof = c.kind === 'roof', far = roof ? CATS.ROOF.FAR : CATS.GROUND.FAR;
    if (dCar > far || (c.mode === 'hid' && c.mt > 1e8)) { drop(c); continue; }
    if (!live) continue;
    if (roof) thinkRoof(c, dt, dCar); else thinkGround(c, dt, dCar, spd, ppl);
    if (c.mode === 'hid') continue;
    c.x += (Math.sin(c.h) * c.v + (c.kx || 0)) * dt;
    c.z += (Math.cos(c.h) * c.v + (c.kz || 0)) * dt;
    c.g.visible = dCar < (roof ? CATS.ROOF.SHOW : CATS.GROUND.SHOW);
    if (!c.g.visible) continue;
    if (!roof && c.mode !== 'in') c.y = A.groundH(c.x, c.z);
    pose(c, dt);
  }
}

/* отладка: window.__cats (только dev или ?debug) */
export const DEBUG = {
  LIST, HOLES, ROOFS, STATS, CATS,
  /* кот у ближайшей к точке дыры (по умолчанию — к машине); d — на сколько от стены */
  ground (x, z, d = 2) {
    const V = A.V, q = nearestHole(x === undefined ? V.x : x, z === undefined ? V.z : z, 400);
    if (!q) return null;
    if (q.cat) drop(q.cat);
    const cx = q.x + q.ox * d, cz = q.z + q.oz * d;
    const c = add('ground', cx, A.groundH(cx, cz), cz, Math.atan2(q.ox, q.oz), { hole: q, mode: 'sit', mt: 30 });
    q.cat = c;
    return c;
  },
  /* кот на ближайшей крыше; kind — 'ridge' (конёк) | 'flat' | любая */
  roof (x, z, kind) {
    const V = A.V, X = x === undefined ? V.x : x, Z = z === undefined ? V.z : z;
    let best = null, bd = Infinity;
    for (const r of ROOFS) {
      if (kind && (kind === 'ridge') !== r.ridge) continue;
      const d = Math.hypot(r.cx - X, r.cz - Z); if (d < bd && !r.cat) { bd = d; best = r; }
    }
    if (!best) return null;
    const w = best.walls.reduce((a, b) => b.len > a.len ? b : a);
    const sp = edgeSpot(best, w) || { x: w.a[0] + w.ux * w.len / 2 - w.ox * 0.16, z: w.a[1] + w.uz * w.len / 2 - w.oz * 0.16, w };
    const c = add('roof', sp.x, best.y, sp.z, 0, { roof: best, mt: 999 });
    best.cat = c; setEdge(c, w);
    return c;
  },
  nearestHole: (x, z, r = 400) => nearestHole(x, z, r),
  clear,
};
if (typeof window !== 'undefined' && (import.meta.env.DEV || new URLSearchParams(location.search).has('debug'))) window.__cats = DEBUG;
