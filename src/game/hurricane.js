/* ──────────────────────────────────────────────────────────────────────────
   Ураган — редкий вариант погоды смены (IDEAS блок 8, правила — docs/CAREER.md «Погода смены» → «Ураган»).

   Вариант выбирает weather.js (шанс — CHANCES там, не раньше HUR.FROM смен). Здесь — всё, что он делает:
     • ветер: направление на смену, порывы 0,25…1,1; машину на ходу сносит вбок (PUSH м/с² при
       порыве 1, гасит обычное боковое сцепление — управлять можно); кроны деревьев клонит по ветру
       (seasons.js setGale); летят листья, бумага и куски шифера (одна отрисовка на всё); воет;
     • за смену уносит HOUSES домов рядом с игроком (в NEAR м, перед камерой): дом дрожит, взлетает
       кусками (стены по этажам, крыша треугольниками) и, вращаясь, уходит вверх и по ветру — одна
       отрисовка на дом, куски крутит шейдер; не дом текущего клиента, не пиццерия, не именной дом;
     • на месте — фундамент, мусор, шиферный забор по контуру, бытовка и кран (модели строек —
       construction.js kit()), до конца смены и ещё BACK − 1 смен; адреса у дома (DOOR м) не выпадают
       в заказах (orders.js pickSpot → blocked). На BACK-ю смену после урагана дом стоит как новенький.

   Как прячется дом: статика города склеена по клеткам и её вершин в памяти уже нет, поэтому дом
   «проваливается» в вершинном шейдере: у материалов статики (holeMat — склейки LITM/FLATM/LIT/FLAT,
   фонари над дверьми, окна, ночные окна, муралы) до HOLE_MAX коробок, в которых всё выше земли
   уходит под землю. Пустые — одно сравнение на вершину, discard нет (ранний тест глубины цел).
   Столкновения дома остаются — это и есть забор.

   Из weather.js: init(ctx), shiftStart(id, ride, n), step(dt, on). Из game.js: holeMat(material).
   __dlv.weather.hur — ручки (force(), sites, wind, restore()).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import * as SEAS from './seasons.js';
import * as CONSTR from './construction.js';
import * as TWIST from './twister.js';          // смерч к дому и косой ливень (twister.js)

export const HUR = {
  FROM: 8,                 // не в первые смены: только когда закончено ≥ 8 смен (с 9-й)
  HOUSES: [50, 35, 15],    // уносит 1 / 2 / 3 дома за смену — %
  FIRST: [25, 45],         // с: первый дом — через столько езды после начала смены
  GAP: [50, 90],           // с: следующий — через столько
  NEAR: [55, 170],         // м: дом — в стольких от машины, перед камерой
  BACK: 3,                 // смен: забор стоит до конца этой и ещё 2 смены, на 3-ю дом снова на месте
  DOOR: 10,                // м: адреса заказов у унесённого дома (от стен) не выдаются
  CLIENT: 35,              // м: дом ближе этого к адресу текущего заказа не уносит
  PIZZA: 80,               // м: и ближе этого к пиццерии
  PUSH: 6.5,               // м/с²: боковой снос машины при порыве 1 (гасит боковое сцепление): поперёк ветра ~1,5—3,5 м за 3 с
  GALE: [0.35, 1.0],       // м: насколько клонит кроны (тихо…порыв)
  DEBRIS: 150, DEBRIS_PHONE: 80,   // летящего мусора вокруг камеры
  M: 1.8,                  // м: коробка дома шире контура (балконы, козырьки, водостоки)
};
/* коробок в шейдере статики; сохранённых бывает до 9 (3 смены × 3 дома), с запасом — 12;
   больше — самая старая стройка снимается (дом возвращается), чтобы не было дома сквозь стройку */
const HOLE_MAX = 12;

let C = null;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
function h01 (n, k = 0) {
  let h = Math.imul((n | 0) ^ 0x2c1b3c6d, 0x9E3779B1) ^ Math.imul(k + 0x297a2d39, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/* ═════════════ дом проваливается: коробки в шейдере статики ═════════════ */
const HOLE_N = { value: 0 };
const HOLE_A = { value: Array.from({ length: HOLE_MAX }, () => new THREE.Vector4()) };   // центр x, z; ось x, z
const HOLE_B = { value: Array.from({ length: HOLE_MAX }, () => new THREE.Vector4()) };   // полуразмеры; выше y0 — в y1
const HOLE_GLSL = `uniform int uHoleN;
uniform vec4 uHoleA[${HOLE_MAX}], uHoleB[${HOLE_MAX}];
vec3 hurHole (vec3 p) {
  if (uHoleN == 0) return p;
  vec3 w = (modelMatrix * vec4(p, 1.0)).xyz;
  for (int i = 0; i < ${HOLE_MAX}; i++) {
    if (i >= uHoleN) break;
    vec4 a = uHoleA[i], b = uHoleB[i];
    vec2 d = w.xz - a.xy;
    if (w.y > b.z && abs(d.x * a.z + d.y * a.w) < b.x && abs(d.y * a.z - d.x * a.w) < b.y) { p.y -= w.y - b.w; return p; }
  }
  return p;
}
`;
const WRAPPED = new WeakSet();
/* материал статики города: дома в коробках уходят под землю */
export function holeMat (m) {
  if (!m || WRAPPED.has(m)) return m;
  WRAPPED.add(m);
  const prev = m.onBeforeCompile, own = m.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey;
  const prevKey = own ? m.customProgramCacheKey : null, base = own ? '' : (prev ? prev.toString() : '');
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    sh.uniforms.uHoleN = HOLE_N; sh.uniforms.uHoleA = HOLE_A; sh.uniforms.uHoleB = HOLE_B;
    sh.vertexShader = HOLE_GLSL + sh.vertexShader.replace('#include <project_vertex>', 'transformed = hurHole(transformed);\n#include <project_vertex>');
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : base) + '|hole';
  m.needsUpdate = true;
  return m;
}
/* место под ещё одну коробку: лишняя самая старая стройка — дом снова стоит */
function holesRoom () {
  while (SITES.filter(s => s.hole).length >= HOLE_MAX) {
    const old = SITES.find(s => s.hole && !s.fly) || SITES.find(s => s.hole);
    restore(old, false);
  }
}
function holesApply () {
  let n = 0;
  for (const s of SITES) {
    if (!s.hole || n >= HOLE_MAX) continue;
    const I = s.I;
    HOLE_A.value[n].set(I.ox, I.oz, I.ux, I.uz);
    HOLE_B.value[n].set(I.hx + HUR.M, I.hz + HUR.M, I.gmax + 0.22, I.gmin - 1.4);
    n++;
  }
  HOLE_N.value = n;
}

/* ═════════════ дома: что можно унести ═════════════ */
let BGRID = null;
const INFO = new Map(), WHY = {};
const why = k => { WHY[k] = (WHY[k] || 0) + 1; return null; };
const KIND_NO = new Set(['gar', 'ind', 'church', 'mall']);
function grid () {
  if (BGRID) return BGRID;
  BGRID = new Map();
  C.CITY.buildings.forEach((b, i) => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const q of b.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    b._hb = [x0, z0, x1, z1];
    for (let a = Math.floor(x0 / 40); a <= Math.floor(x1 / 40); a++) for (let c = Math.floor(z0 / 40); c <= Math.floor(z1 / 40); c++) {
      const k = a + ',' + c; let l = BGRID.get(k); if (!l) BGRID.set(k, l = []); l.push(i);
    }
  });
  return BGRID;
}
function near (x0, z0, x1, z1) {
  const G = grid(), out = new Set();
  for (let a = Math.floor(x0 / 40); a <= Math.floor(x1 / 40); a++) for (let c = Math.floor(z0 / 40); c <= Math.floor(z1 / 40); c++) for (const i of G.get(a + ',' + c) || []) out.add(i);
  return out;
}
/* контур: площадь, центр, обход; наименьший прямоугольник; рельеф под ним */
function shape (b) {
  const p = b.p, n = p.length;
  let s2 = 0, cx = 0, cz = 0;
  for (let i = 0; i < n; i++) { const a = p[i], c = p[(i + 1) % n], cr = a[0] * c[1] - c[0] * a[1]; s2 += cr; cx += (a[0] + c[0]) * cr; cz += (a[1] + c[1]) * cr; }
  const area = Math.abs(s2) / 2;
  if (s2) { cx /= 3 * s2; cz /= 3 * s2; } else { cx = p[0][0]; cz = p[0][1]; }
  let best = null;
  for (let i = 0; i < n; i++) {
    const a = p[i], c = p[(i + 1) % n], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (l < 0.5) continue;
    const ux = (c[0] - a[0]) / l, uz = (c[1] - a[1]) / l;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const q of p) { const u = q[0] * ux + q[1] * uz, v = -q[0] * uz + q[1] * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const ar = (u1 - u0) * (v1 - v0);
    if (!best || ar < best.ar) {
      const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
      best = { ar, ux, uz, hx: (u1 - u0) / 2, hz: (v1 - v0) / 2, ox: uc * ux - vc * uz, oz: uc * uz + vc * ux };
    }
  }
  return { area, cx, cz, ccw: s2 > 0, ...best };
}
const toW = (I, a, c) => [I.ox + I.ux * a - I.uz * c, I.oz + I.uz * a + I.ux * c];
const toL = (I, x, z) => { const dx = x - I.ox, dz = z - I.oz; return [dx * I.ux + dz * I.uz, -dx * I.uz + dz * I.ux]; };
/* можно ли этот дом вообще уносить (без машины и заказа): кэш по индексу */
function info (i) {
  if (INFO.has(i)) return INFO.get(i);
  const b = C.CITY.buildings[i];
  let I = null;
  try { I = check(b, i); } catch (e) { I = null; }
  INFO.set(i, I);
  return I;
}
function check (b, i) {
  const p = b.p;
  if (!p || p.length < 4 || p.length > 24 || KIND_NO.has(b.k) || b.n) return why('kind');
  const S = shape(b);
  if (!S.hx || S.area < 60 || S.area > 3000 || S.area / (4 * S.hx * S.hz) < 0.55 || Math.min(S.hx, S.hz) < 2.5) return why('shape');
  const lv = b.lv || (S.area > 1200 ? 5 : S.area > 600 ? 4 : S.area > 220 ? 2 : 1);
  if (lv > 12) return why('lv');
  const I = { i, b, p, ...S, lv };
  const M = HUR.M;
  // рельеф под коробкой — почти ровный
  let gmin = Infinity, gmax = -Infinity, hLo = Infinity, hHi = -Infinity;
  for (let a = -1; a <= 1; a += 0.5) for (let c = -1; c <= 1; c += 0.5) {
    const [x, z] = toW(I, a * (I.hx + M), c * (I.hz + M)), g = C.groundH(x, z);
    gmin = Math.min(gmin, g); gmax = Math.max(gmax, g);
  }
  for (const q of p) { const g = C.groundH(q[0], q[1]); hLo = Math.min(hLo, g); hHi = Math.max(hHi, g); }
  gmin = Math.min(gmin, hLo); gmax = Math.max(gmax, hHi);
  if (gmax - gmin > 2.0) return why('slope');
  Object.assign(I, { gmin, gmax, hLo, hHi, top: hHi + 3.15 * lv + 1.1 });
  // дорог в коробке и рядом нет
  const per = 2 * (I.hx + I.hz + 2 * M + 2), st = Math.max(2.5, per / 40);
  for (let s = 0; s < per; s += st) {
    let a, c, A = I.hx + M + 1, B = I.hz + M + 1, q = s;
    if (q < 2 * A) { a = -A + q; c = -B; } else if ((q -= 2 * A) < 2 * B) { a = A; c = -B + q; } else if ((q -= 2 * B) < 2 * A) { a = A - q; c = B; } else { q -= 2 * A; a = -A; c = B - q; }
    const [x, z] = toW(I, a, c), r = C.nearestRoad(x, z, 12, 1);
    if (r && r.d < r.seg.w / 2 + 0.6) return why('road');
  }
  // чужие дома в коробку не залезают
  const ax0 = Math.min(I.cx, I.ox) - I.hx - I.hz - M - 2, ax1 = Math.max(I.cx, I.ox) + I.hx + I.hz + M + 2;
  const az0 = Math.min(I.cz, I.oz) - I.hx - I.hz - M - 2, az1 = Math.max(I.cz, I.oz) + I.hx + I.hz + M + 2;
  const inBox = (x, z, m) => { const [a, c] = toL(I, x, z); return Math.abs(a) < I.hx + m && Math.abs(c) < I.hz + m; };
  for (const j of near(ax0, az0, ax1, az1)) {
    if (j === i) continue;
    const q = C.CITY.buildings[j].p;
    for (let k = 0; k < q.length; k++) {
      const a = q[k], c = q[(k + 1) % q.length], l = Math.hypot(c[0] - a[0], c[1] - a[1]), n = Math.max(1, Math.ceil(l / 1.5));
      for (let s = 0; s <= n; s++) if (inBox(a[0] + (c[0] - a[0]) * s / n, a[1] + (c[1] - a[1]) * s / n, M + 0.4)) return why('house');
    }
    for (const [sa, sc] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const [x, z] = toW(I, sa * (I.hx + M), sc * (I.hz + M)); if (C.inPoly(x, z, q)) return why('house'); }
  }
  // без арок, не у пиццерии
  for (const a of C.ARCHES || []) if (inBox(a.mx, a.mz, M + 3)) return why('arch');
  for (const P of pizzerias()) if (Math.hypot(P[0] - I.cx, P[1] - I.cz) < HUR.PIZZA) return why('pizza');
  I.hex = b._hex || '#e6d3c0';
  return I;
}
function pizzerias () {
  const L = (C.PIZZERIAS && C.PIZZERIAS.length ? C.PIZZERIAS : [C.PIZZA]).filter(Boolean);
  return L.map(p => [p.bx ?? p.x, p.bz ?? p.z]);
}
/* адрес у унесённого дома: в DOOR м от его коробки */
const nearBox = (I, x, z, m) => { const [a, c] = toL(I, x, z); return Math.abs(a) < I.hx + m && Math.abs(c) < I.hz + m; };
export function blocked (x, z) {
  for (const s of SITES) if (nearBox(s.I, x, z, HUR.DOOR)) return true;
  return false;
}
/* куда сейчас везут: текущая цель и все адреса заказа */
function clientPts () {
  const S = C.S, out = [];
  if (S.target) out.push([S.target.x, S.target.z]);
  if (S.order && S.order.stops) for (const st of S.order.stops) if (st && st.x !== undefined) out.push([st.x, st.z]);
  return out;
}

/* ═════════════ модели: склейка своих вершин ═════════════ */
const MX = new THREE.Matrix4(), MN = new THREE.Matrix3(), V3 = new THREE.Vector3(), CO = new THREE.Color();
function Geo (extra) {
  const P = [], N = [], Cc = [], I = [], AC = extra ? [] : null, AR = extra ? [] : null;
  let n = 0, ch = null;
  const g = {
    chunk (c, r) { ch = [c, r]; },
    /* шаблон (position, normal, color, index) через матрицу; hex — перекрасить */
    add (tpl, m, hex) {
      const p = tpl.attributes.position, nr = tpl.attributes.normal, cl = tpl.attributes.color, idx = tpl.index;
      MN.getNormalMatrix(m);
      if (hex) CO.set(hex);
      for (let i = 0; i < p.count; i++) {
        V3.fromBufferAttribute(p, i).applyMatrix4(m); P.push(V3.x, V3.y, V3.z);
        V3.fromBufferAttribute(nr, i).applyMatrix3(MN).normalize(); N.push(V3.x, V3.y, V3.z);
        if (hex) Cc.push(CO.r, CO.g, CO.b); else if (cl) Cc.push(cl.getX(i), cl.getY(i), cl.getZ(i)); else Cc.push(1, 1, 1);
        if (AC) { AC.push(ch[0][0], ch[0][1], ch[0][2]); AR.push(ch[1][0], ch[1][1], ch[1][2], ch[1][3]); }
      }
      if (idx) for (let i = 0; i < idx.count; i++) I.push(idx.getX(i) + n);
      else for (let i = 0; i < p.count; i++) I.push(i + n);
      n += p.count;
    },
    box (w, h, d, hex, x, y, z, ry = 0, rx = 0, rz = 0) {
      MX.makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')).setPosition(x, y, z);
      g.add(boxT(w, h, d), MX, hex);
    },
    tri (a, b, c, hex) {
      CO.set(hex);
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      for (const q of [a, b, c]) { P.push(q[0], q[1], q[2]); N.push(nx, ny, nz); Cc.push(CO.r, CO.g, CO.b); if (AC) { AC.push(ch[0][0], ch[0][1], ch[0][2]); AR.push(ch[1][0], ch[1][1], ch[1][2], ch[1][3]); } }
      I.push(n, n + 1, n + 2); n += 3;
    },
    get n () { return n; },
    build () {
      const G = new THREE.BufferGeometry();
      G.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      G.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      G.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
      if (AC) { G.setAttribute('aC', new THREE.Float32BufferAttribute(AC, 3)); G.setAttribute('aR', new THREE.Float32BufferAttribute(AR, 4)); }
      G.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
      G.computeBoundingSphere();
      return G;
    },
  };
  return g;
}
const BOXT = new Map();
function boxT (w, h, d) {
  const k = w.toFixed(2) + ',' + h.toFixed(2) + ',' + d.toFixed(2);
  let g = BOXT.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); if (BOXT.size < 400) BOXT.set(k, g); }
  return g;
}

/* ═════════════ дом взлетает кусками ═════════════ */
const FLY_VERT = `attribute vec3 aC;
attribute vec4 aR;
uniform float uT;
uniform vec3 uO;
uniform vec2 uW;
mat3 hurRot (vec3 a, float g) {
  float s = sin(g), c = cos(g), o = 1.0 - c;
  return mat3(o * a.x * a.x + c, o * a.x * a.y + a.z * s, o * a.z * a.x - a.y * s,
              o * a.x * a.y - a.z * s, o * a.y * a.y + c, o * a.y * a.z + a.x * s,
              o * a.z * a.x + a.y * s, o * a.y * a.z - a.x * s, o * a.z * a.z + c);
}
`;
const FLY_BEGIN = `#include <begin_vertex>
  {
    float tt = max(0.0, uT - aR.w);
    vec3 lp = transformed - aC;
    vec3 ax = normalize(aR.xyz - 0.5 + vec3(0.002, 0.001, 0.0));
    lp = hurRot(ax, tt * (1.0 + 2.6 * aR.y)) * lp * (1.0 - smoothstep(5.5, 8.0, tt));
    vec2 rel = aC.xz - uO.xz;
    float ang = tt * (0.35 + 0.6 * aR.z) + tt * tt * 0.06;
    float cs = cos(ang), sn = sin(ang);
    rel = vec2(rel.x * cs - rel.y * sn, rel.x * sn + rel.y * cs) * (1.0 + 0.3 * tt);
    vec3 c = vec3(uO.x + rel.x, aC.y + 0.5 * (4.0 + 7.0 * aR.y) * tt * tt, uO.z + rel.y);
    c.xz += uW * (0.5 * (3.5 + 5.0 * aR.x) * tt * tt);
    float pre = step(tt, 0.0) * min(uT, 1.0);
    c.xz += vec2(sin(uT * 37.0 + aR.x * 50.0), cos(uT * 31.0 + aR.z * 40.0)) * 0.09 * pre;
    transformed = c + lp;
  }`;
function flyMat () {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  const U = { uT: { value: 0 }, uO: { value: new THREE.Vector3() }, uW: { value: new THREE.Vector2() } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = FLY_VERT + sh.vertexShader.replace('#include <begin_vertex>', FLY_BEGIN);
  };
  m.customProgramCacheKey = () => 'hurFly';
  m.userData.U = U;
  return m;
}
const GLASS = ['#4d6578', '#5b7590', '#6f8aa3'];
/* копия дома из кусков: стены — плиты по 6—8 м на 1—3 этажа с окнами, крыша — треугольники до 10 м */
function flyHouse (I) {
  const g = Geo(true), p = I.p, n = p.length, base = I.hLo - 0.3, top = I.top, H = top - base;
  const fb = I.lv <= 3 ? Math.max(1, I.lv) : I.lv <= 6 ? 2 : 3, bands = Math.ceil(I.lv / fb), FH = 3.15;
  const roofHex = ['#c3b6bc', '#bcafb8', '#b4b0bd', '#c7bdb0'][(n + I.lv) % 4];
  const seed = (I.i * 7919) | 0;
  let ci = 0;
  const R = (y) => { ci++; return [h01(seed, ci * 3), h01(seed, ci * 3 + 1), h01(seed, ci * 3 + 2), 0.25 + (1 - clamp((y - base) / H, 0, 1)) * 1.7 + h01(seed, ci * 3 + 7) * 0.5]; };
  for (let i = 0; i < n; i++) {
    const a = p[i], c = p[(i + 1) % n], dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
    if (len < 0.5) continue;
    const ux = dx / len, uz = dz / len, ox = I.ccw ? uz : -uz, oz = I.ccw ? -ux : ux, ry = Math.atan2(-uz, ux);
    const ns = Math.max(1, Math.round(len / 7)), sl = len / ns;
    for (let s = 0; s < ns; s++) {
      const m0 = s * sl, mx = a[0] + ux * (m0 + sl / 2) - ox * 0.15, mz = a[1] + uz * (m0 + sl / 2) - oz * 0.15;
      for (let k = 0; k < bands; k++) {
        const y0 = k === 0 ? base : base + 0.6 + k * fb * FH, y1 = k === bands - 1 ? top : base + 0.6 + (k + 1) * fb * FH;
        const yc = (y0 + y1) / 2;
        g.chunk([mx, yc, mz], R(yc));
        g.box(sl + 0.02, y1 - y0, 0.3, I.hex, mx, yc, mz, ry);
        if (sl > 2.6) {
          const cols = Math.max(1, Math.floor((sl - 0.6) / 3));
          for (let f = 0; f < fb; f++) {
            const wy = base + 0.6 + (k * fb + f) * FH + 1.55;
            if (wy > y1 - 0.8 || wy < y0 + 0.6) continue;
            for (let q = 0; q < cols; q++) {
              const u = m0 + (sl - cols * 3) / 2 + (q + 0.5) * 3;
              g.box(1.3, 1.6, 0.08, GLASS[(q + f + k) % 3], a[0] + ux * u + ox * 0.03, wy, a[1] + uz * u + oz * 0.03, ry);
            }
          }
        }
      }
    }
  }
  // крыша: треугольники контура, длинные — пополам, пока не меньше 10 м
  let faces = [];
  try { faces = THREE.ShapeUtils.triangulateShape(p.map(q => new THREE.Vector2(q[0], q[1])), []); } catch (e) { faces = []; }
  const roof = (A, B, Cq, d) => {
    const l = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1]);
    const ab = l(A, B), bc = l(B, Cq), ca = l(Cq, A), mx = Math.max(ab, bc, ca);
    if (mx > 10 && d < 6) {
      if (mx === ab) { const m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]; roof(A, m, Cq, d + 1); roof(m, B, Cq, d + 1); }
      else if (mx === bc) { const m = [(B[0] + Cq[0]) / 2, (B[1] + Cq[1]) / 2]; roof(A, B, m, d + 1); roof(A, m, Cq, d + 1); }
      else { const m = [(Cq[0] + A[0]) / 2, (Cq[1] + A[1]) / 2]; roof(A, B, m, d + 1); roof(m, B, Cq, d + 1); }
      return;
    }
    const cx = (A[0] + B[0] + Cq[0]) / 3, cz = (A[1] + B[1] + Cq[1]) / 3;
    g.chunk([cx, top, cz], R(top + 1));
    g.tri([A[0], top, A[1]], [B[0], top, B[1]], [Cq[0], top, Cq[1]], roofHex);
    g.tri([A[0], top - 0.35, A[1]], [Cq[0], top - 0.35, Cq[1]], [B[0], top - 0.35, B[1]], '#8e8a84');
  };
  for (const f of faces) roof(p[f[0]], p[f[1]], p[f[2]], 0);
  const geo = g.build(), mat = flyMat();
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.matrixAutoUpdate = false; m.updateMatrix();
  mat.userData.U.uO.value.set(I.cx, base, I.cz);
  return m;
}

/* ═════════════ забор, фундамент, кран ═════════════ */
const CRANE_COL = ['#f2b21c', '#e8892e', '#c8323a'];
let FALL_MAT = null;
function siteMat () {
  const K = CONSTR.kit && CONSTR.kit();
  if (K) return K.MAT;
  return FALL_MAT || (FALL_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}
function buildSite (s) {
  const I = s.I, K = CONSTR.kit && CONSTR.kit(), g = Geo(false), p = I.p, n = p.length, M = HUR.M;
  const seed = (I.i * 104729) | 0;
  const r = k => h01(seed, k);
  // земля: укатанный грунт по всей коробке (под ней статика провалилась)
  {
    const A = I.hx + M, B = I.hz + M, nu = Math.max(2, Math.ceil(2 * A / 2.5)), nv = Math.max(2, Math.ceil(2 * B / 2.5));
    for (let a = 0; a < nu; a++) for (let c = 0; c < nv; c++) {
      const pt = (ia, ic) => { const [x, z] = toW(I, -A + 2 * A * ia / nu, -B + 2 * B * ic / nv); return [x, C.groundH(x, z) + 0.09, z]; };
      const q00 = pt(a, c), q10 = pt(a + 1, c), q11 = pt(a + 1, c + 1), q01 = pt(a, c + 1);
      const hex = r(a * 131 + c * 17) < 0.5 ? '#7d6b55' : r(a * 7 + c * 311) < 0.5 ? '#86745c' : '#74644f';
      g.tri(q00, q01, q11, hex); g.tri(q00, q11, q10, hex);
    }
  }
  // фундамент по контуру и забор снаружи стен (там же, где стены дома — их препятствие и держит машину)
  const SEC = K ? K.SEC : 2.5;
  for (let i = 0; i < n; i++) {
    const a = p[i], c = p[(i + 1) % n], dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
    if (len < 0.6) continue;
    const ux = dx / len, uz = dz / len, ox = I.ccw ? uz : -uz, oz = I.ccw ? -ux : ux, ry = Math.atan2(-uz, ux);
    const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
    g.box(len + 0.4, 0.9, 0.5, i & 1 ? '#b9b5ad' : '#a8a49c', mx - ox * 0.6, C.groundH(mx, mz) + 0.15, mz - oz * 0.6, ry);
    const ns = Math.max(1, Math.round(len / SEC)), sl = len / ns;
    for (let k = 0; k < ns; k++) {
      const u = (k + 0.5) * sl, x = a[0] + ux * u + ox * 0.42, z = a[1] + uz * u + oz * 0.42, gy = C.groundH(x, z);
      if (K) { MX.makeRotationY(ry).scale(V3.set((sl + 0.04) / SEC, 1, 1)).setPosition(x, gy, z); g.add(K.panel, MX); }
      else g.box(sl, 2, 0.06, k % 3 ? '#9aa0a2' : '#8d9496', x, gy + 1.05, z, ry);
    }
  }
  // мусор: обломки стен цвета дома, кирпич, бетон
  const inside = (x, z, m = 1.2) => C.inPoly(x, z, p) && C.inPoly(x + m, z, p) && C.inPoly(x - m, z, p) && C.inPoly(x, z + m, p) && C.inPoly(x, z - m, p);
  for (let k = 0, got = 0; k < 40 && got < 9; k++) {
    const [x, z] = toW(I, (r(k * 5) * 2 - 1) * (I.hx - 1.5), (r(k * 5 + 1) * 2 - 1) * (I.hz - 1.5));
    if (!inside(x, z, 1.4)) continue;
    const kind = got % 3, gy = C.groundH(x, z);
    if (kind === 0) g.box(2.2 + r(k * 5 + 2) * 2, 0.25, 1.4 + r(k * 5 + 3), I.hex, x, gy + 0.35, z, r(k * 5 + 4) * 6, 0.35 - r(k) * 0.7, 0.3);
    else if (kind === 1) g.box(1.1, 0.9, 0.95, '#b0533c', x, gy + 0.5, z, r(k * 5 + 4) * 6);
    else g.box(1.6, 0.6, 1.2, '#9a968e', x, gy + 0.35, z, r(k * 5 + 4) * 6, 0.2, -0.15);
    got++;
  }
  // бытовка — у самой длинной стены, внутри
  if (K) {
    let best = -1, bl = 0;
    for (let i = 0; i < n; i++) { const a = p[i], c = p[(i + 1) % n], l = Math.hypot(c[0] - a[0], c[1] - a[1]); if (l > bl) { bl = l; best = i; } }
    if (bl > 8) {
      const a = p[best], c = p[(best + 1) % n], ux = (c[0] - a[0]) / bl, uz = (c[1] - a[1]) / bl, ox = I.ccw ? uz : -uz, oz = I.ccw ? -ux : ux;
      const u = bl * (0.25 + r(91) * 0.2), x = a[0] + ux * u - ox * 2.4, z = a[1] + uz * u - oz * 2.4;
      if (inside(x, z, 1.3)) { MX.makeRotationY(Math.atan2(-uz, ux)).setPosition(x, C.groundH(x, z), z); g.add(K.cabin(seed & 1), MX); }
    }
  }
  // кран (у большого дома — два): башня в склейку, стрела — свой меш
  const cranes = [], big = I.area > 900 && I.hx > 14;
  const spots = big ? [toW(I, -I.hx * 0.45, 0), toW(I, I.hx * 0.45, 0)] : [inside(I.cx, I.cz, 2) ? [I.cx, I.cz] : [I.ox, I.oz]];
  spots.forEach(([px, pz], j) => {
    if (!inside(px, pz, 2)) return;
    const cg = C.groundH(px, pz), H = clamp(I.top - I.hLo + 6 + r(70 + j) * 4, 22, 42), col = CRANE_COL[(seed + j) % 3];
    const ry = Math.atan2(-I.uz, I.ux), B = (w, h, d, hex, la, y, lb) => g.box(w, h, d, hex, px + I.ux * la - I.uz * lb, cg + y, pz + I.uz * la + I.ux * lb, ry);
    B(4, 0.9, 4, '#9a968e', 0, 0.45, 0);
    for (const [a, b] of [[-0.75, -0.75], [0.75, -0.75], [0.75, 0.75], [-0.75, 0.75]]) B(0.18, H, 0.18, col, a, H / 2 + 0.9, b);
    for (let y = 2; y < H; y += 2.2) { B(1.6, 0.1, 0.1, col, 0, y, -0.75); B(1.6, 0.1, 0.1, col, 0, y + 1.1, 0.75); B(0.1, 0.1, 1.6, col, -0.75, y + 0.55, 0); B(0.1, 0.1, 1.6, col, 0.75, y + 1.65, 0); }
    if (K) {
      const jm = new THREE.Mesh(K.jib(col), K.MAT);
      jm.position.set(px, cg + H + 0.9, pz);
      const ang = r(80 + j) * Math.PI * 2;
      jm.rotation.y = ang;
      jm.matrixAutoUpdate = false; jm.updateMatrix();
      C.scene.add(jm);
      cranes.push({ m: jm, ang, base: ang, to: ang, wait: rnd(2, 6) });
    }
  });
  const m = new THREE.Mesh(g.build(), siteMat());
  m.matrixAutoUpdate = false; m.updateMatrix();
  C.scene.add(m);
  s.mesh = m; s.cranes = cranes;
}
function dropSite (s) {
  if (s.mesh) { C.scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh = null; }
  for (const c of s.cranes || []) C.scene.remove(c.m);
  s.cranes = [];
  if (s.fly) { C.scene.remove(s.fly); s.fly.geometry.dispose(); s.fly.material.dispose(); s.fly = null; }
}

/* ═════════════ унесённые дома: список и сохранение ═════════════ */
const SITES = [];          // { I, back, temp, hole, mesh, cranes, fly, t }
const KEY = 'dlv-hurricane';
const shiftsDone = () => +C.Store.get('dlv-shifts', 0) || 0;
function save () {
  try { C.Store.set(KEY, SITES.filter(s => !s.temp).map(s => ({ i: s.I.i, x: Math.round(s.I.cx), z: Math.round(s.I.cz), back: s.back }))); } catch (e) { /* — */ }
}
function load () {
  let v = null;
  try { v = C.Store.get(KEY, null); } catch (e) { v = null; }
  return Array.isArray(v) ? v.filter(e => e && Number.isFinite(e.i) && Number.isFinite(e.back)) : [];
}
function findHouse (e) {
  const b = C.CITY.buildings[e.i];
  if (b) { const S = shape(b); if (Math.hypot(S.cx - e.x, S.cz - e.z) < 3) return e.i; }
  let best = -1, bd = 3;
  for (const i of near(e.x - 60, e.z - 60, e.x + 60, e.z + 60)) { const S = shape(C.CITY.buildings[i]); const d = Math.hypot(S.cx - e.x, S.cz - e.z); if (d < bd) { bd = d; best = i; } }
  return best;
}
/* стоит без анимации: загрузка игры, новая смена */
function placeStill (i, back, temp) {
  if (SITES.some(s => s.I.i === i)) return null;
  const I = info(i) || (() => { const b = C.CITY.buildings[i]; const S = shape(b); const I2 = { i, b, p: b.p, ...S, lv: b.lv || 2 }; let lo = Infinity, hi = -Infinity; for (const q of b.p) { const g = C.groundH(q[0], q[1]); lo = Math.min(lo, g); hi = Math.max(hi, g); } return Object.assign(I2, { gmin: lo, gmax: hi, hLo: lo, hHi: hi, top: hi + 3.15 * I2.lv + 1.1, hex: b._hex || '#e6d3c0' }); })();
  const s = { I, back, temp: !!temp, hole: true, mesh: null, cranes: [], fly: null, t: -1 };
  holesRoom();
  SITES.push(s);
  buildSite(s);
  holesApply();
  return s;
}
function restore (s) {                              // «дом снова стоит» — без подписи снизу (04.10.2026: информационные плашки убраны)
  dropSite(s);
  const k = SITES.indexOf(s);
  if (k >= 0) SITES.splice(k, 1);
  holesApply();
}
/* новая смена: вернуть отстоявшие своё дома, сверить со списком профиля */
function sync (sayBack) {
  const done = shiftsDone(), list = load();
  for (const s of SITES.slice()) {
    const e = list.find(q => q.i === s.I.i);
    if (s.temp || !e || done >= e.back) restore(s, sayBack && !s.temp && e && done >= e.back);
  }
  let changed = false;
  for (const e of list) {
    if (done >= e.back) { changed = true; continue; }
    if (SITES.some(s => s.I.i === e.i)) continue;
    const i = findHouse(e);
    if (i >= 0) placeStill(i, e.back, false); else changed = true;
  }
  if (changed) save();
}

/* ═════════════ ветер ═════════════ */
const WIND = { on: false, T: 0, base: 0, ang: 0, g: 0, x: 1, z: 0, amt: 0, push: 0, maxDrift: 0 };
function gust (T) {
  return clamp(0.62 + 0.22 * Math.sin(T * 0.31) + 0.2 * Math.sin(T * 0.83 + 1.3) * Math.sin(T * 0.17 + 0.4) + 0.1 * Math.sin(T * 2.3), 0.25, 1.1);
}
function stepWind (dt, on) {
  WIND.amt = damp(WIND.amt, on ? 1 : 0, on ? 0.8 : 1.5, dt);
  if (WIND.amt < 0.002 && !on) { if (WIND.on) { WIND.on = false; SEAS.setGale(0); } return; }
  WIND.on = true;
  WIND.T += dt;
  WIND.ang = WIND.base + 0.4 * Math.sin(WIND.T * 0.045);
  WIND.g = gust(WIND.T) * WIND.amt;
  WIND.x = Math.cos(WIND.ang); WIND.z = Math.sin(WIND.ang);
  SEAS.setGale(WIND.amt * (HUR.GALE[0] + (HUR.GALE[1] - HUR.GALE[0]) * clamp((WIND.g - 0.25) / 0.85, 0, 1)), WIND.x, WIND.z);
}
/* машину на ходу сносит по ветру: вбок полностью, вдоль — на четверть */
const DRIVE = new Set(['drive', 'back', 'side']);
function pushCar (dt) {
  const V = C.V, S = C.S;
  if (!C.isPlaying() || !DRIVE.has(S.state) || V.air || V.sink !== undefined) { WIND.push = 0; return; }
  const sp = Math.hypot(V.vx, V.vz), k = clamp((sp - 2) / 8, 0, 1);
  if (k <= 0) { WIND.push = 0; return; }
  const fx = Math.sin(V.h), fz = Math.cos(V.h), sx = fz, sz = -fx;
  const a = HUR.PUSH * WIND.g * k, ax = WIND.x * a, az = WIND.z * a;
  const al = ax * sx + az * sz, af = (ax * fx + az * fz) * 0.25;
  V.vx += (sx * al + fx * af) * dt; V.vz += (sz * al + fz * af) * dt;
  WIND.push = al;
}

/* ═════════════ летящий мусор: листья, бумага, шифер ═════════════ */
let DEB = null;
const LEAF = ['#d9822b', '#c2541f', '#e3b23c', '#6f9a3a', '#8a5a2b', '#a0702a'];
function debris () {
  if (DEB) return DEB;
  const n = matchMedia && matchMedia('(pointer: coarse)').matches ? HUR.DEBRIS_PHONE : HUR.DEBRIS;
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), n);
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  const P = [];
  for (let i = 0; i < n; i++) {
    const kind = i % 10 === 0 ? 2 : i % 4 === 0 ? 1 : 0;   // 10 % шифер, ~22 % бумага, остальное — листья
    const q = { kind, x: 0, y: 0, z: 0, rx: rnd(0, 6), ry: rnd(0, 6), rz: rnd(0, 6), sx: rnd(-6, 6), sy: rnd(-5, 5), sz: rnd(-7, 7), k: rnd(0.6, 1.1), ph: rnd(0, 6),
      w: kind === 2 ? rnd(0.7, 1.0) : kind === 1 ? rnd(0.3, 0.45) : rnd(0.22, 0.32), h: kind === 2 ? rnd(0.45, 0.65) : kind === 1 ? rnd(0.35, 0.5) : rnd(0.16, 0.24) };
    mesh.setColorAt(i, CO.set(kind === 2 ? (i & 1 ? '#9aa0a2' : '#8d9496') : kind === 1 ? '#efeee8' : LEAF[i % LEAF.length]));
    P.push(q);
  }
  mesh.visible = false;
  C.scene.add(mesh);
  DEB = { mesh, P, init: false };
  return DEB;
}
const DM = new THREE.Matrix4(), DQ = new THREE.Quaternion(), DE = new THREE.Euler(), DP = new THREE.Vector3(), DS = new THREE.Vector3();
function respawn (q, cam, spread) {
  const px = -WIND.z, pz = WIND.x, back = spread ? rnd(-70, 70) : rnd(55, 75), side = rnd(-75, 75);
  q.x = cam.x - WIND.x * back + px * side; q.z = cam.z - WIND.z * back + pz * side;
  q.y = C.groundH(q.x, q.z) + (q.kind === 2 ? rnd(0.4, 6) : rnd(0.4, 14));
}
function stepDebris (dt) {
  const on = WIND.amt > 0.3;
  if (!on) { if (DEB) DEB.mesh.visible = false; return; }
  const D = debris(), cam = C.cam.position, m = D.mesh, sp = 9 + 15 * WIND.g;
  m.visible = true;
  for (let i = 0; i < D.P.length; i++) {
    const q = D.P[i];
    if (!D.init) respawn(q, cam, true);
    q.ph += dt;
    const fl = q.kind === 2 ? 0.5 : 1.6;
    q.x += (WIND.x * sp * q.k + Math.sin(q.ph * 2.1) * fl) * dt;
    q.z += (WIND.z * sp * q.k + Math.cos(q.ph * 1.7) * fl) * dt;
    q.y += (Math.sin(q.ph * 1.3 + i) * (q.kind === 2 ? 1.2 : 2.2) - (q.kind === 2 ? 0.6 : 0.15)) * dt;
    q.rx += q.sx * dt; q.ry += q.sy * dt; q.rz += q.sz * dt;
    const dx = q.x - cam.x, dz = q.z - cam.z, along = dx * WIND.x + dz * WIND.z, across = -dx * WIND.z + dz * WIND.x;
    if (along > 75 || Math.abs(across) > 85 || along < -90 || q.y < cam.y - 40) respawn(q, cam, false);
    const near = clamp((Math.hypot(dx, q.y - cam.y, dz) - 4) / 5, 0, 1);   // у самой камеры — не заслоняет экран
    DP.set(q.x, Math.max(q.y, 0.15), q.z); DQ.setFromEuler(DE.set(q.rx, q.ry, q.rz)); DS.set(q.w * near + 1e-4, q.h * near + 1e-4, 1);
    m.setMatrixAt(i, DM.compose(DP, DQ, DS));
  }
  D.init = true;
  m.instanceMatrix.needsUpdate = true;
  if (!m._colorsUp) { m.instanceColor.needsUpdate = true; m._colorsUp = 1; }
}

/* ═════════════ вой ветра ═════════════ */
const HOWL = { src: null, f: null, g: null };
function stepHowl () {
  const Snd = C.Snd;
  if (!Snd || !Snd.ctx || !Snd.master) return;
  const want = Snd.on && WIND.amt > 0.02 ? (0.05 + 0.13 * WIND.g) * WIND.amt : 0;
  if (!HOWL.src) {
    if (want <= 0) return;
    const c = Snd.ctx, n = c.sampleRate * 3, b = c.createBuffer(1, n, c.sampleRate), a = b.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < n; i++) { lp += (Math.random() * 2 - 1 - lp) * 0.12; a[i] = lp * 3; }
    HOWL.src = c.createBufferSource(); HOWL.src.buffer = b; HOWL.src.loop = true;
    HOWL.f = c.createBiquadFilter(); HOWL.f.type = 'bandpass'; HOWL.f.Q.value = 1.6;
    HOWL.g = c.createGain(); HOWL.g.gain.value = 0;
    HOWL.src.connect(HOWL.f); HOWL.f.connect(HOWL.g); HOWL.g.connect(Snd.master); HOWL.src.start();
  }
  const now = Snd.ctx.currentTime;
  HOWL.g.gain.setTargetAtTime(want, now, 0.3);
  HOWL.f.frequency.setTargetAtTime(260 + 520 * WIND.g, now, 0.4);
  if (want <= 0 && WIND.amt < 0.005) { try { HOWL.src.stop(); } catch (e) { /* — */ } HOWL.src.disconnect(); HOWL.src = null; }
}

/* ═════════════ смена урагана: когда и какой дом ═════════════ */
const PLAN = { on: false, left: 0, wait: 0, scan: null, temp: false, took: 0 };
export function shiftStart (id, ride, n) {
  if (!C) return;
  sync(true);
  PLAN.on = id === 'hurricane';
  WIND.base = h01(n | 0, 11) * Math.PI * 2;
  WIND.T = h01(n | 0, 12) * 100;
  PLAN.pend = null;
  if (!PLAN.on) { PLAN.left = 0; PLAN.scan = null; return; }
  const x = h01(n | 0, 13) * 100;
  PLAN.left = x < HUR.HOUSES[0] ? 1 : x < HUR.HOUSES[0] + HUR.HOUSES[1] ? 2 : 3;
  PLAN.wait = rnd(...HUR.FIRST);
  PLAN.scan = null; PLAN.took = 0; PLAN.miss = 0;
  PLAN.temp = !!ride || !!(C.quick && C.quick());
}
/* поиск по кусочку за кадр: дома в NEAR м от машины, перед камерой; лучший — ближе к середине кольца */
function scanStep (force) {
  const V = C.V;
  if (!PLAN.scan) {
    const R = HUR.NEAR[1] * (1 + 0.5 * Math.min(2, PLAN.miss || 0));   // не нашлось — ищем шире, до ×2
    PLAN.scan = { list: [...near(V.x - R, V.z - R, V.x + R, V.z + R)], k: 0, best: null, bs: -Infinity };
  }
  const sc = PLAN.scan, fw = new THREE.Vector3(); C.cam.getWorldDirection(fw);
  const fl = Math.hypot(fw.x, fw.z) || 1, fx = fw.x / fl, fz = fw.z / fl;
  const cl = clientPts(), used = new Set(SITES.map(s => s.I.i));
  let budget = force ? Infinity : 3;
  while (sc.k < sc.list.length && budget > 0) {
    const i = sc.list[sc.k++];
    if (used.has(i)) continue;
    const b = C.CITY.buildings[i], hb = b._hb;
    if (!hb) continue;
    const mx = (hb[0] + hb[2]) / 2, mz = (hb[1] + hb[3]) / 2, d = Math.hypot(mx - V.x, mz - V.z);
    if (d < HUR.NEAR[0] || d > HUR.NEAR[1] * (1 + 0.5 * Math.min(2, PLAN.miss || 0))) continue;
    const dot = ((mx - V.x) * fx + (mz - V.z) * fz) / (d || 1);
    if (!force && dot < (PLAN.miss ? -0.2 : 0.3)) continue;
    if (!INFO.has(i)) budget--;
    const I = info(i);
    if (!I) continue;
    if (cl.some(([x, z]) => nearBox(I, x, z, HUR.CLIENT))) continue;
    const score = dot * 60 - Math.abs(d - 100) * 0.5 + Math.min(I.lv, 9) * 2;
    if (score > sc.bs) { sc.bs = score; sc.best = I; }
  }
  if (sc.k < sc.list.length) return undefined;   // ещё ищем
  PLAN.scan = null;
  return sc.best;
}
/* унести дом сейчас */
function takeHouse (I) {
  const s = { I, back: shiftsDone() + HUR.BACK, temp: PLAN.temp, hole: true, mesh: null, cranes: [], fly: null, t: 0, puffT: 0 };
  const t0 = performance.now();
  s.fly = flyHouse(I);
  MS.fly = Math.max(MS.fly, +(performance.now() - t0).toFixed(1));
  s.fly.material.userData.U.uW.value.set(WIND.x, WIND.z);
  C.scene.add(s.fly);
  holesRoom();
  SITES.push(s);
  holesApply();
  if (!s.temp) save();
  PLAN.took++;
  // «ураган унёс дом!» — без подписи снизу (04.10.2026): видно и слышно
  if (C.Snd && C.Snd.noise) { C.Snd.noise(0.9, 0.22); C.Snd.blip(55, 0.6, 'sawtooth', 0.12); }
  if (C.S) C.S.shake = Math.max(C.S.shake || 0, 0.18);
  return s;
}
function stepSites (dt) {
  const hurr = PLAN.on;
  for (const s of SITES) {
    if (s.t >= 0 && s.fly) {
      if (!DEBUG.hold) s.t += dt;
      s.fly.material.userData.U.uT.value = s.t;
      // пыль у подножия, пока отрываются нижние этажи
      if (s.t < 3.2 && (s.puffT -= dt) <= 0 && C.puff) {
        s.puffT = 0.22;
        const p = s.I.p, e = p[(Math.random() * p.length) | 0], f = p[(p.indexOf(e) + 1) % p.length], u = Math.random();
        C.puff(e[0] + (f[0] - e[0]) * u, 0.4, e[1] + (f[1] - e[1]) * u, Math.random() < 0.3, rnd(1.6, 3.2));
      }
      if (s.t > 2.6 && !s.mesh) { const t0 = performance.now(); buildSite(s); MS.site = Math.max(MS.site, +(performance.now() - t0).toFixed(1)); }
      if (s.t > 12) { C.scene.remove(s.fly); s.fly.geometry.dispose(); s.fly.material.dispose(); s.fly = null; }
    }
    // краны: в ураган стрела флюгером встаёт по ветру, в тихую погоду — как на стройках
    for (const c of s.cranes || []) {
      if (Math.abs(c.m.position.x - C.V.x) > 700 || Math.abs(c.m.position.z - C.V.z) > 700) continue;
      if (hurr && WIND.amt > 0.3) c.to = Math.atan2(-WIND.z, WIND.x) + Math.sin(WIND.T * 0.7) * 0.15;
      else if (c.wait > 0) { c.wait -= dt; continue; }
      const d = c.to - c.ang;
      if (Math.abs(d) < 0.01) { if (!hurr) { c.wait = rnd(4, 9); c.to = c.base + rnd(-1.6, 1.6); } continue; }
      c.ang += Math.sign(d) * Math.min(Math.abs(d), (hurr ? 0.35 : 0.13) * dt);
      c.m.rotation.y = c.ang; c.m.updateMatrix();
    }
  }
}
/* каждый кадр (из weather.update): on — сейчас ураган */
const PERF = { ms: 0, n: 0 }, MS = { fly: 0, site: 0, scan: 0 };
export function step (dt, on) {
  if (!C) return;
  const t0 = performance.now();
  if (!on && PLAN.on) PLAN.on = false;
  stepWind(dt, on);
  if (WIND.on) {
    if (on) pushCar(dt);
    stepDebris(dt);
    stepHowl();
  } else {
    if (DEB && DEB.mesh.visible) DEB.mesh.visible = false;
    if (HOWL.src) { try { HOWL.src.stop(); } catch (e) { /* — */ } HOWL.src.disconnect(); HOWL.src = null; }
  }
  if (SITES.length) stepSites(dt);
  if (on && PLAN.left > 0 && !PLAN.pend && C.isPlaying() && DRIVE.has(C.S.state)) {
    if (PLAN.scan || (PLAN.wait -= dt) <= 0) {
      const t1 = performance.now(), I = scanStep(false);
      MS.scan = Math.max(MS.scan, +(performance.now() - t1).toFixed(1));
      if (I !== undefined) {
        // дом выбран: смерч касается земли и идёт к нему (twister.js), дом взлетает, когда дошёл
        if (I) { PLAN.pend = { I, t: TWIST.come(I.cx, I.cz, WIND) }; PLAN.left--; PLAN.wait = rnd(...HUR.GAP); PLAN.miss = 0; }
        else { PLAN.wait = 3; PLAN.miss = (PLAN.miss || 0) + 1; }
      }
    }
  }
  if (PLAN.pend && (PLAN.pend.t -= dt) <= 0) {
    const I = PLAN.pend.I, dbg = PLAN.pend.dbg;
    PLAN.pend = null;
    // пока шёл смерч, рядом мог появиться адрес заказа — тогда дом стоит, а смерч уходит
    if (on && !SITES.some(s => s.I.i === I.i) && !clientPts().some(([x, z]) => nearBox(I, x, z, HUR.CLIENT))) takeHouse(I);
    else if (!dbg) PLAN.left++;
  }
  TWIST.step(dt, on && WIND.on, WIND);
  PERF.ms += performance.now() - t0; PERF.n++;
}

/* ctx — тот же, что у weather.js (+ ARCHES, realAddress, puff, quick) */
export function init (ctx) {
  C = ctx;
  // окна и муралы собраны в своих модулях — их материалы оборачиваем здесь (склейки — в game.js)
  ctx.scene.traverse(o => { if (o.isMesh && (o.name === 'windows' || o.name === 'murals')) holeMat(o.material); });
  try { sync(false); } catch (e) { console.error('[hurricane] загрузка', e); }
  warm();
  TWIST.init(ctx);
}
/* программы шейдеров — сразу при загрузке (со светом и туманом сцены): иначе первый взлёт дома
   и первый мусор компилируются посреди смены — рывок кадра в 50 мс */
let WARM = null;
function warm () {
  if (!C.renderer || !C.renderer.compile) return;
  try {
    const tmp = new THREE.Scene(), D = debris(), fm = flyMat();
    tmp.add(new THREE.Mesh(boxT(1, 1, 1), fm));
    const dm = new THREE.InstancedMesh(D.mesh.geometry, D.mesh.material, 1);
    dm.setColorAt(0, CO.set('#ffffff'));
    tmp.add(dm);
    C.renderer.compile(tmp, C.cam, C.scene);
    WARM = fm;                                    // держим: без материала программа уйдёт из кэша
  } catch (e) { console.error('[hurricane] шейдеры', e); }
}

export const DEBUG = {
  HUR, SITES, WIND, PLAN, WHY, MS,
  get sites () { return SITES.map(s => ({ i: s.I.i, x: Math.round(s.I.cx), z: Math.round(s.I.cz), lv: s.I.lv, area: Math.round(s.I.area), back: s.back, temp: s.temp, t: +s.t.toFixed(1), fence: !!s.mesh, cranes: (s.cranes || []).length, flying: !!s.fly, tris: s.mesh ? s.mesh.geometry.index.count / 3 : 0 })); },
  get holes () { return HOLE_N.value; },
  get wind () { return { g: +WIND.g.toFixed(2), amt: +WIND.amt.toFixed(2), dir: [+WIND.x.toFixed(2), +WIND.z.toFixed(2)], push: +WIND.push.toFixed(2) }; },
  /* унести дом рядом сейчас (поиск целиком, без «перед камерой»); null — нечего */
  force () { PLAN.scan = null; const I = scanStep(true); PLAN.scan = null; if (I) TWIST.at(I.cx, I.cz); return I ? takeHouse(I) && DEBUG.sites.slice(-1)[0] : null; },
  /* как в смене: смерч идёт к дому рядом, дом взлетает через TW.COME с */
  come () { PLAN.scan = null; const I = scanStep(true); PLAN.scan = null; if (!I) return null; PLAN.pend = { I, t: TWIST.come(I.cx, I.cz, WIND), dbg: 1 }; return { i: I.i, x: Math.round(I.cx), z: Math.round(I.cz), t: PLAN.pend.t }; },
  twister: TWIST.DEBUG,
  /* сколько домов в кольце вокруг машины вообще можно унести */
  candidates () { const V = C.V, R = HUR.NEAR[1], out = []; for (const i of near(V.x - R, V.z - R, V.x + R, V.z + R)) { const I = info(i); if (I) out.push({ i, x: Math.round(I.cx), z: Math.round(I.cz), d: Math.round(Math.hypot(I.cx - V.x, I.cz - V.z)), lv: I.lv, area: Math.round(I.area) }); } return out; },
  /* унести этот дом (индекс в CITY.buildings), если его вообще можно уносить */
  take (i) { const I = info(i); return I ? (takeHouse(I), DEBUG.sites.slice(-1)[0]) : null; },
  hold: false,
  blocked,
  restore () { for (const s of SITES.slice()) restore(s, false); save(); },
  sync: () => sync(true),
  perf (reset) { const o = { ms: +(PERF.ms / Math.max(1, PERF.n)).toFixed(3), n: PERF.n }; if (reset) PERF.ms = PERF.n = 0; return o; },
};
