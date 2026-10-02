/* ──────────────────────────────────────────────────────────────────────────
   Хлам и то, что ломается: остановки, мусор у подъездов, контейнеры.
   Правила словами и числами — docs/CAREER.md «Город: что сбивается».

   • Остановка (stop): будка из склейки мелочи дворов (SMASH в game.js) +
     препятствие 4,4 × 1,1 м. Въехал медленнее STOP.BREAK — стена, как раньше.
     Быстрее — стекло разлетается пиксельными осколками, крыша и стойки
     падают, лавочка опрокидывается; машина теряет STOP.SLOW скорости и
     получает удар слабее, чем о стену. Препятствия больше нет, обломки
     лежат до конца смены (reset — в начале следующей).
   • Мусор у подъездов (litter): горка мешков, коробок, бутылок у каждого
     третьего подъезда — жребий по месту подъезда, всегда одинаково. Проехал
     — разлетается, без урона, чуть тормозит (это делает game.js, как с
     дворовой мелочью).
   • Контейнеры (can): 2–4 на бетонной площадке во дворах и по 2 у дворовых
     парковок. Тяжёлые: упираются, толкаются, на сильном ударе
     опрокидываются и вываливают мусор; совсем сильный удар — полсердца.

   Всё стоящее лежит в склейках мелочи по клеткам (одна отрисовка на клетку,
   отсечение — cull.js). Свой меш появляется только у того, что сдвинули:
   контейнер, которого коснулись, и обломки снесённой остановки.

   Переменных игры модуль не видит — всё приходит объектом api (junkApi в
   game.js): init — до сборки улиц, stop — из osmStreetLife, yard — до
   smashBuild, car — каждый шаг машины, step — каждый кадр, reset — новая смена.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

/* числа — здесь; в docs/CAREER.md — они же словами */
export const STOP = {
  BREAK: 35 / 3.6,        // м/с: с этой скорости (по нормали к будке) остановка ломается
  SLOW: 0.4,              // сколько скорости машина теряет на сломе
  DMG_K: 0.6,             // удар — как о стену на той же скорости × 0,6
  DMG_MIN: 0.4,           // но не меньше половинки сердца
};
export const LITTER = { P: 0.34, CAP: 1400 };                      // доля подъездов с мусором, потолок
export const CANS = {
  PAD_P: 0.1, PAD_CAP: 260, PAD_GAP: 34,  // площадки: доля подъездов, потолок, не ближе друг к другу
  R: 0.85,                                // радиус контейнера для удара
  MASS: 0.2,                              // доля массы машины
  TIP: 35 / 3.6,                          // м/с: опрокидывается
  HURT: 50 / 3.6,                         // м/с: с этой — полсердца
  FRICT: 7,                               // м/с² — трение по асфальту
};
export const STATS = { litter: 0, pads: 0, cans: 0, stops: 0, tris: 0, broken: 0, dyn: 0 };

let A = null;
const rand = (a, b) => a + Math.random() * (b - a);
const hash = (x, z, k = 0) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
function rng (seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) | 0; let q = Math.imul(a ^ (a >>> 15), 1 | a); q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q; return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
}
/* локальная точка (x вдоль, z вглубь; поворот как у three.js rotateY) → мир */
const rot = (x, z, ry, lx, lz) => [x + lx * Math.cos(ry) + lz * Math.sin(ry), z - lx * Math.sin(ry) + lz * Math.cos(ry)];
const lastSmash = () => A.SMASH[A.SMASH.length - 1];
const tris = g => (g.index ? g.index.count : g.attributes.position.count) / 3;

export function init (api) {
  A = api;
  if (typeof location !== 'undefined' && (import.meta.env.DEV || new URLSearchParams(location.search).has('debug'))) window.__junk = { STOPS, CANS_ALL, DYN, STATS, stopHit, reset };
}

/* вершины вещи в склейке: спрятать (в точку под землю) и вернуть */
function hide (it) {
  const pos = it.mesh.geometry.attributes.position, a = pos.array;
  if (!it.orig) it.orig = a.slice(it.v0 * 3, (it.v0 + it.nv) * 3);
  const gy = A.groundH(it.x, it.z) - 1;
  for (let i = it.v0; i < it.v0 + it.nv; i++) { a[i * 3] = it.x; a[i * 3 + 1] = gy; a[i * 3 + 2] = it.z; }
  pos.needsUpdate = true;
  it.down = 1;
}
function unhide (it) {
  if (!it.orig || !it.mesh) return;
  const pos = it.mesh.geometry.attributes.position;
  pos.array.set(it.orig, it.v0 * 3);
  pos.needsUpdate = true;
  it.down = 0;
}

const MAT = {};
const mat = k => MAT[k] || (MAT[k] = k === 'glass'
  ? new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.75 })
  : new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
/* меш из кусков put() — свои вершины, свой цвет, origin в (0, 0, 0) */
function meshOf (parts) {
  const m = new THREE.Mesh(A.mergeGeos(parts), mat('vc'));
  return m;
}

/* ═════════════════ остановка ═════════════════ */
const STOPS = [];
const GLASS = '#a9d3ec', FRAME = '#4f7fd6', ROOF = '#e8e2d6', POST = '#585460', WOOD = '#8a6b4e';
/* части будки в её осях: x — вдоль (±2,2), z — вглубь, к домам (+0,9 — задняя стенка) */
function stopParts (only) {
  const P = [];
  const add = (k, w, h, d, hex, x, y, z) => { if (!only || only === k) P.push({ k, w, h, d, hex, x, y, z }); };
  add('roof', 4.4, 0.25, 2.2, ROOF, 0, 2.7, 0);
  add('back', 4.4, 0.4, 0.2, FRAME, 0, 2.4, 0.9);         // верхняя планка с синей полосой
  add('back', 4.4, 0.12, 0.2, FRAME, 0, 0.25, 0.9);       // нижняя
  add('back', 0.12, 2.3, 0.14, FRAME, -2.12, 1.2, 0.9);
  add('back', 0.12, 2.3, 0.14, FRAME, 2.12, 1.2, 0.9);
  add('glass', 4.1, 1.95, 0.06, GLASS, 0, 1.28, 0.9);
  add('glass', 0.06, 1.9, 0.8, GLASS, -2.12, 1.3, 0.45);  // боковые стёкла
  add('glass', 0.06, 1.9, 0.8, GLASS, 2.12, 1.3, 0.45);
  add('post', 0.2, 3.2, 0.2, POST, 2.1, 1.1, 0);
  add('post2', 0.2, 3.2, 0.2, POST, -2.1, 1.1, 0);
  add('bench', 3.0, 0.08, 0.42, WOOD, 0, 0.5, 0.58);
  add('bench', 0.08, 0.5, 0.36, POST, -1.3, 0.25, 0.58);
  add('bench', 0.08, 0.5, 0.36, POST, 1.3, 0.25, 0.58);
  return P;
}

/* поставить будку: склейка мелочи + препятствие по стенке и стойкам */
export function stop (px, py, pz, ry) {
  const g = [];
  for (const p of stopParts()) {
    const [x, z] = rot(px, pz, ry, p.x, p.z);
    A.put(g, A.boxGeo(p.w, p.h, p.d), p.hex, x, py + p.y, z, 0, ry, 0);
  }
  A.smashAdd('stop', px, pz, 2.4, g, FRAME);
  const it = lastSmash();
  // препятствие — по стенке и стойкам (4,4 × 1,1 м); obb считает угол от оси x, three.js крутит наоборот — поэтому −ry
  const s = A.obb(px + Math.sin(ry) * 0.45, pz + Math.cos(ry) * 0.45, 2.2, 0.55, -ry);
  const st = { it, s, x: px, y: py, z: pz, ry, broken: 0, parts: [] };
  s.stop = st;
  it.heavy = 1;                                             // машина сносит её не как мелочь, а через препятствие
  it.junk = (q, nx, nz, force) => stopBreak(st, nx, nz, force, true);   // взрыв рядом
  STOPS.push(st);
  STATS.stops++;
  return st;
}

/* удар машины в будку: rel — скорость сближения по нормали. true — сломали (game.js машину не отбрасывает) */
export function stopHit (s, rel, dx, dz, speed) {
  const st = s.stop;
  if (!st || st.broken || rel < STOP.BREAK) return false;
  stopBreak(st, dx, dz, speed, false);
  const V = A.V;
  V.vx *= 1 - STOP.SLOW; V.vz *= 1 - STOP.SLOW;
  A.hurt(Math.max(STOP.DMG_MIN, (rel - 13) * 0.16 * STOP.DMG_K), rel, st.x, st.z);
  A.S.stops = (A.S.stops || 0) + 1;
  return true;
}

function stopBreak (st, dx, dz, speed, quiet) {
  if (st.broken) return;
  st.broken = 1;
  STATS.broken++;
  st.hw = st.s.hw; st.hd = st.s.hd;
  st.s.hw = st.s.hd = -50;                                  // препятствия больше нет
  hide(st.it);
  const { x, y, z, ry } = st, sp = Math.max(6, speed || 0), gy = y;
  // стекло — пиксельными осколками: кубики, разлетаются по ходу машины
  for (let i = 0; i < 30; i++) {
    const s = rand(0.07, 0.17);
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.8 }));
    const [lx, lz] = i < 20 ? [rand(-2, 2), 0.9] : [(i & 1 ? 1 : -1) * 2.12, rand(0.1, 0.8)];
    const [px, pz] = rot(x, z, ry, lx, lz);
    m.position.set(px, gy + rand(0.4, 2.2), pz);
    A.scene.add(m);
    A.GORE.push({ m, vx: dx * sp * rand(0.2, 0.6) + rand(-2.5, 2.5), vy: rand(1, 4.5), vz: dz * sp * rand(0.2, 0.6) + rand(-2.5, 2.5),
      spin: rand(-14, 14), life: rand(5, 9), bleed: 1e9, rest: 0 });
  }
  // крошка стекла на асфальте — лежит вместе с обломками
  const crumbs = [], r = rng(Math.round(x * 7 + z * 13));
  for (let i = 0; i < 26; i++) {
    const a = r() * 6.283, d = 0.4 + r() * 2.6;
    const cx = x + Math.cos(a) * d + dx * r() * 2, cz = z + Math.sin(a) * d + dz * r() * 2;
    A.put(crumbs, A.boxGeo(0.12 + r() * 0.1, 0.03, 0.1 + r() * 0.1), r() < 0.5 ? '#cfeaff' : '#b8dcf0', cx, A.groundH(cx, cz) + 0.03, cz, 0, r() * 3, 0);
  }
  const cm = meshOf(crumbs);
  A.scene.add(cm);
  st.parts.push({ m: cm, rest: 1 });
  // крыша, стойки, рама задней стенки и лавочка — свои меши, падают и остаются
  const k = sp / 20;
  const piece = (key, vel, restRot, restY, spin) => {
    const parts = stopParts(key);
    if (!parts.length) return;
    const g = [];
    let cx = 0, cy = 0, cz = 0;
    for (const p of parts) { cx += p.x / parts.length; cy += p.y / parts.length; cz += p.z / parts.length; }
    for (const p of parts) A.put(g, A.boxGeo(p.w, p.h, p.d), p.hex, p.x - cx, p.y - cy, p.z - cz);
    const m = meshOf(g);
    const [wx, wz] = rot(x, z, ry, cx, cz);
    m.position.set(wx, gy + cy, wz);
    m.rotation.order = 'YXZ';                              // сначала наклон в своих осях, потом поворот будки
    m.rotation.set(0, ry, 0);
    A.scene.add(m);
    st.parts.push({ m, vx: dx * sp * vel[0] + rand(-1, 1), vy: vel[1], vz: dz * sp * vel[0] + rand(-1, 1), spin, restRot, restY, rest: 0 });
  };
  piece('roof', [0.35, 3.5 + k * 2], [rand(-0.12, 0.12), ry + rand(-0.6, 0.6), rand(-0.1, 0.1)], 0.14, 2.5);
  piece('back', [0.45, 2 + k], [-Math.PI / 2, ry + rand(-0.5, 0.5), 0], 0.12, 3);
  piece('post', [0.5, 2.5], [0, ry + rand(-1, 1), Math.PI / 2], 0.1, 5);
  piece('post2', [0.5, 2.5], [0, ry + rand(-1, 1), Math.PI / 2], 0.1, 5);
  piece('bench', [0.18, 1.5], [-Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1), ry + rand(-0.4, 0.4), 0], 0.3, 2);   // опрокинулась
  if (!quiet) A.S.shake = Math.max(A.S.shake, 0.45);
  A.sparks(x, 1.2, z, 10, dx, dz);
  A.Snd.noise(0.4, 0.42);
  for (let i = 0; i < 6; i++) setTimeout(() => A.Snd.blip(rand(1800, 3400), 0.05, 'triangle', 0.06), i * 55);
  A.Snd.blip(110, 0.25, 'sawtooth', 0.14);
}

function stepStops (dt) {
  for (const st of STOPS) {
    if (!st.broken) continue;
    for (const p of st.parts) {
      if (p.rest) continue;
      const m = p.m;
      p.vy -= 19 * dt;
      m.position.x += p.vx * dt; m.position.y += p.vy * dt; m.position.z += p.vz * dt;
      m.rotation.x += p.spin * dt * 0.5; m.rotation.z += p.spin * dt * 0.3;
      const fl = A.groundH(m.position.x, m.position.z) + p.restY;
      if (m.position.y <= fl && p.vy < 0) {
        m.position.y = fl;
        if (Math.abs(p.vy) > 3) { p.vy *= -0.25; p.vx *= 0.5; p.vz *= 0.5; continue; }
        m.rotation.set(p.restRot[0], p.restRot[1], p.restRot[2]);           // упал и лёг
        p.rest = 1;
        A.puff && A.puff(m.position.x, 0.2, m.position.z, false, 0.6);
      }
    }
  }
}

/* ═════════════════ мусор у подъездов ═════════════════ */
const BAG = ['#222227', '#26262c', '#2d3a2b', '#35507e', '#d6d4cc', '#5a5550', '#1d1f24', '#2a2a30'];
const BOTTLE = ['#3f8a4a', '#6b4a2a', '#cfe3d8', '#2f6a3a'];
let ICO = null, CYL = null;
function litterGeos (x, z, r, out) {
  if (!ICO) { ICO = new THREE.IcosahedronGeometry(1, 0); CYL = new THREE.CylinderGeometry(0.055, 0.06, 0.3, 6); }
  const gy0 = A.groundH(x, z);
  const nb = 1 + ((r() * 3.2) | 0), nbox = r() < 0.55 ? 1 + ((r() * 1.6) | 0) : 0, nbt = 1 + ((r() * 3) | 0);
  for (let i = 0; i < nb; i++) {
    const a = r() * 6.283, d = r() * 0.5, s = 0.24 + r() * 0.16, bx = x + Math.cos(a) * d, bz = z + Math.sin(a) * d;
    A.put(out, A.geoScaled(ICO, s, s * 0.8, s * 1.1), BAG[(r() * BAG.length) | 0], bx, A.groundH(bx, bz) + s * 0.55, bz, (r() - 0.5) * 0.6, r() * 6.3, 0);
    if (s > 0.33) A.put(out, A.boxGeo(0.06, 0.1, 0.06), BAG[0], bx, A.groundH(bx, bz) + s * 1.3, bz);       // узелок
  }
  for (let i = 0; i < nbox; i++) {
    const a = r() * 6.283, d = 0.3 + r() * 0.5, w = 0.35 + r() * 0.3, bx = x + Math.cos(a) * d, bz = z + Math.sin(a) * d;
    A.put(out, A.boxGeo(w, w * 0.7, w * 0.8), r() < 0.5 ? '#b08a5a' : '#a2804f', bx, A.groundH(bx, bz) + w * 0.35, bz, 0, r() * 6.3, (r() - 0.5) * 0.3);
  }
  for (let i = 0; i < nbt; i++) {
    const a = r() * 6.283, d = 0.3 + r() * 0.8, bx = x + Math.cos(a) * d, bz = z + Math.sin(a) * d;
    A.put(out, A.geoScaled(CYL, 1, 1, 1), BOTTLE[(r() * BOTTLE.length) | 0], bx, A.groundH(bx, bz) + 0.06, bz, 0, r() * 6.3, Math.PI / 2);   // лежит
  }
  if (r() < 0.5) {                                          // бумажка
    const a = r() * 6.283, bx = x + Math.cos(a) * 0.9, bz = z + Math.sin(a) * 0.9;
    A.put(out, A.boxGeo(0.3, 0.02, 0.22), '#e8e4da', bx, gy0 + 0.02, bz, 0, r() * 6.3, 0);
  }
}
function litterHit (it, nx, nz, force) {
  hide(it);
  const f = 0.4 + Math.min(force, 30) / 30;
  for (let i = 0; i < 5; i++) {
    const bag = i < 3, s = bag ? rand(0.18, 0.3) : 0.1;
    const m = new THREE.Mesh(bag ? new THREE.IcosahedronGeometry(s, 0) : new THREE.CylinderGeometry(0.055, 0.06, 0.3, 6),
      new THREE.MeshLambertMaterial({ color: bag ? BAG[(Math.random() * BAG.length) | 0] : BOTTLE[(Math.random() * BOTTLE.length) | 0], flatShading: true }));
    m.position.set(it.x + rand(-0.4, 0.4), A.groundH(it.x, it.z) + rand(0.2, 0.6), it.z + rand(-0.4, 0.4));
    A.scene.add(m);
    A.GORE.push({ m, vx: nx * rand(2, 6) * f + rand(-2, 2), vy: rand(2, 5) * f, vz: nz * rand(2, 6) * f + rand(-2, 2),
      spin: rand(-10, 10), life: rand(10, 16), bleed: 1e9, rest: 0 });
  }
  A.Snd.noise(0.12, 0.12);
}
function litterAt (x, z, seed) {
  if (!A.inBounds(x, z, -30) || A.groundH(x, z) < 0.3 || A.inHouse(x, z, 0.7)) return false;
  const near = A.nearestRoad(x, z, 7, 1);
  if (near && near.d < near.seg.w / 2 + 0.7) return false;
  const g = [];
  litterGeos(x, z, rng(seed), g);
  A.smashAdd('litter', x, z, 0.8, g, BAG[0]);
  const it = lastSmash();
  it.junk = litterHit;
  for (const q of g) STATS.tris += tris(q);
  STATS.litter++;
  return true;
}

/* ═════════════════ контейнеры ═════════════════ */
const CAN_HEX = [['#3f7a4a', '#2f5a38'], ['#2f5f9a', '#244a78'], ['#6c7378', '#4e5559'], ['#3f7a4a', '#2f5a38']];
const CAN_TPL = [];
/* контейнер в своих осях: основание в (0, 0, 0), длинная сторона вдоль x */
function canParts (g, c, x, y, z, ry) {
  const [body, lid] = CAN_HEX[c];
  const P = (geo, hex, lx, ly, lz, rx = 0) => { const [wx, wz] = rot(x, z, ry, lx, lz); A.put(g, geo, hex, wx, y + ly, wz, rx, ry, 0); };
  P(A.boxGeo(1.4, 1.0, 1.0), body, 0, 0.62, 0);
  P(A.boxGeo(1.46, 0.08, 1.08), lid, 0, 1.17, -0.02, -0.06);
  P(A.boxGeo(1.5, 0.08, 0.1), lid, 0, 1.0, 0.52);                     // ручка-обод
  for (const [a, b] of [[-0.55, -0.38], [0.55, -0.38], [-0.55, 0.38], [0.55, 0.38]]) P(A.boxGeo(0.14, 0.14, 0.14), '#1b1a1f', a, 0.07, b);
}
function canTpl (c) {
  if (CAN_TPL[c]) return CAN_TPL[c];
  const g = [];
  canParts(g, c, 0, 0, 0, 0);
  return (CAN_TPL[c] = A.mergeGeos(g));
}
const CANS_ALL = [], CAN_GRID = new Map(), CG = 20, DYN = [];
const cgKey = (x, z) => Math.floor(x / CG) + ',' + Math.floor(z / CG);

/* поставить контейнер: в склейку мелочи (стоит — ничего не стоит) */
export function can (x, z, ry, c) {
  const gy = A.groundH(x, z) + A.curbAt(x, z), g = [];
  canParts(g, c, x, gy, z, ry);
  A.smashAdd('can', x, z, CANS.R, g, CAN_HEX[c][0]);
  const it = lastSmash();
  const o = { it, x, z, ry, c, x0: x, z0: z, ry0: ry, vx: 0, vz: 0, w: 0, tip: 0, tipV: 0, ax: 1, az: 0, dyn: null, fell: 0 };
  it.heavy = 1;
  it.junk = (q, nx, nz, force) => { detach(o); push(o, nx * force * 0.8, nz * force * 0.8, force); };   // взрыв рядом
  CANS_ALL.push(o);
  const k = cgKey(x, z);
  if (!CAN_GRID.has(k)) CAN_GRID.set(k, []);
  CAN_GRID.get(k).push(o);
  for (const q of g) STATS.tris += tris(q);
  STATS.cans++;
  return o;
}

/* коснулись — вершины из склейки прячем, дальше это свой меш */
function detach (o) {
  if (o.dyn) return;
  hide(o.it);
  const m = new THREE.Mesh(canTpl(o.c), mat('vc'));
  A.scene.add(m);
  o.dyn = m;
  o.rest = 0;
  DYN.push(o);
  STATS.dyn = DYN.length;
  pose(o);
}
const QY = new THREE.Quaternion(), QT = new THREE.Quaternion(), AX = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
function pose (o) {
  const m = o.dyn;
  m.position.set(o.x, A.groundH(o.x, o.z) + A.curbAt(o.x, o.z) + Math.sin(o.tip) * 0.5 + (o.hop || 0), o.z);
  QY.setFromAxisAngle(UP, o.ry);
  AX.set(o.ax, 0, o.az);
  QT.setFromAxisAngle(AX, o.tip);
  m.quaternion.copy(QT).multiply(QY);
}
/* толчок: скорость контейнеру и, если сильный, — опрокинуть */
function push (o, vx, vz, rel) {
  o.vx += vx; o.vz += vz;
  o.w += rand(-1, 1) * Math.min(rel, 12) * 0.25;
  o.rest = 0;
  if (rel >= CANS.TIP && !o.fell) {
    o.fell = 1;
    const l = Math.hypot(vx, vz) || 1;
    o.ax = vz / l; o.az = -vx / l;                          // ось (dz, 0, −dx): валится туда, куда толкнули
    o.tipV = 3 + rel * 0.15;
    o.hopV = 2 + rel * 0.08; o.hop = 0.01;
    spill(o, vx / l, vz / l, rel);
  }
}
function spill (o, nx, nz, rel) {
  for (let i = 0; i < 7; i++) {
    const bag = i < 5, s = bag ? rand(0.2, 0.34) : 0.1;
    const m = new THREE.Mesh(bag ? new THREE.IcosahedronGeometry(s, 0) : new THREE.BoxGeometry(0.3, 0.2, 0.25),
      new THREE.MeshLambertMaterial({ color: bag ? BAG[(Math.random() * BAG.length) | 0] : '#b08a5a', flatShading: true }));
    m.position.set(o.x + rand(-0.4, 0.4), A.groundH(o.x, o.z) + rand(0.6, 1.1), o.z + rand(-0.4, 0.4));
    A.scene.add(m);
    A.GORE.push({ m, vx: nx * rand(2, 5) * (0.5 + rel / 25) + rand(-2, 2), vy: rand(2, 4.5), vz: nz * rand(2, 5) * (0.5 + rel / 25) + rand(-2, 2),
      spin: rand(-8, 8), life: rand(40, 60), bleed: 1e9, rest: 0 });
  }
  A.Snd.noise(0.3, 0.32);
  A.Snd.blip(80, 0.3, 'square', 0.12);                    // гулкий железный бах
}

/* удар машины: нос и корма — два круга радиуса rc. Возвращает, было ли касание */
const NEAR = [];
export function car (noseX, noseZ, tailX, tailZ, rc) {
  const V = A.V;
  NEAR.length = 0;
  const ci = Math.floor(V.x / CG), cj = Math.floor(V.z / CG);
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (const o of CAN_GRID.get(i + ',' + j) || []) NEAR.push(o);
  for (const o of DYN) if (Math.abs(o.x - V.x) < 8 && Math.abs(o.z - V.z) < 8 && NEAR.indexOf(o) < 0) NEAR.push(o);
  for (const o of NEAR) {
    if (Math.abs(o.x - V.x) > 6 || Math.abs(o.z - V.z) > 6) continue;
    for (let c = 0; c < 2; c++) {
      const px = c ? tailX : noseX, pz = c ? tailZ : noseZ;
      const R = (o.fell ? CANS.R * 0.9 : CANS.R) + rc;
      let dx = px - o.x, dz = pz - o.z;
      const d = Math.hypot(dx, dz);
      if (d >= R || d < 1e-4) continue;
      dx /= d; dz /= d;                                     // от контейнера к машине
      detach(o);
      const pen = R - d;
      V.x += dx * pen * 0.7; V.z += dz * pen * 0.7;
      o.x -= dx * pen * 0.3; o.z -= dz * pen * 0.3;
      const rel = -((V.vx - o.vx) * dx + (V.vz - o.vz) * dz);
      if (rel <= 0) continue;
      // удар двух тел: контейнер — пятая часть машины, отскок 0,2
      const j = 1.2 * rel / (1 + 1 / CANS.MASS);
      V.vx += dx * j; V.vz += dz * j;
      push(o, -dx * j / CANS.MASS, -dz * j / CANS.MASS, rel);
      if (rel > 3) {
        A.sparks(o.x, 0.8, o.z, rel > 8 ? 6 : 3, -dx, -dz);
        A.Snd.noise(0.15, Math.min(0.3, rel * 0.03));
        A.S.shake = Math.max(A.S.shake, Math.min(0.35, rel * 0.03));
      }
      if (rel >= CANS.HURT) A.hurt(0.5, rel, o.x, o.z);   // полсердца
    }
  }
}

function stepCans (dt) {
  for (const o of DYN) {
    if (o.rest) continue;
    const sp = Math.hypot(o.vx, o.vz);
    if (sp > 0) {
      const k = Math.max(0, sp - CANS.FRICT * (o.fell ? 1.6 : 1) * dt) / sp;
      o.vx *= k; o.vz *= k;
      o.x += o.vx * dt; o.z += o.vz * dt;
      A.pushOut(o, CANS.R * 0.8);                           // в дом не уезжает
    }
    o.ry += o.w * dt; o.w *= Math.exp(-3 * dt);
    if (o.fell && o.tip < Math.PI / 2) {
      o.tip = Math.min(Math.PI / 2, o.tip + o.tipV * dt);
      o.tipV += 9 * dt;
      if (o.tip >= Math.PI / 2) { A.Snd.noise(0.2, 0.25); A.puff && A.puff(o.x, 0.3, o.z, false, 0.7); }
    }
    if (o.hop > 0) { o.hop += o.hopV * dt; o.hopV -= 19 * dt; if (o.hop <= 0) o.hop = 0; }
    pose(o);
    if (sp < 0.05 && Math.abs(o.w) < 0.05 && (!o.fell || o.tip >= Math.PI / 2) && !(o.hop > 0)) { o.vx = o.vz = 0; o.rest = 1; }
  }
}

/* ═════════════════ расстановка ═════════════════ */
function padAt (x, z, ux, uz, n, seed) {
  const L = n * 1.65 + 0.6, D = 1.7, nx = -uz, nz = ux;
  for (const [a, b] of [[-L / 2, -D / 2], [L / 2, -D / 2], [L / 2, D / 2], [-L / 2, D / 2], [0, 0]]) {
    const px = x + ux * a + nx * b, pz = z + uz * a + nz * b;
    if (!A.inBounds(px, pz, -30) || A.groundH(px, pz) < 0.3 || A.inHouse(px, pz, 0.6)) return false;
    const near = A.nearestRoad(px, pz, 7, 1);
    if (near && near.d < near.seg.w / 2 + 0.8) return false;
  }
  const P = A.PIZZA;
  if (P && Math.hypot((P.bx || P.x || 0) - x, (P.bz || P.z || 0) - z) < 45) return false;
  const ry = Math.atan2(-uz, ux), gy = A.groundH(x, z);
  A.box(A.LIT, L, 0.14, D, '#b9b4aa', x, gy + 0.05, z, ry);            // бетонная площадка
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = (i - (n - 1) / 2) * 1.65, cx = x + ux * a, cz = z + uz * a;
    can(cx, cz, ry + (r() - 0.5) * 0.12, (r() * CAN_HEX.length) | 0);
  }
  // рядом — что не влезло в контейнеры
  for (let i = 0; i < 1 + ((r() * 2) | 0); i++) {
    const a = (r() - 0.5) * L, b = (r() < 0.5 ? -1 : 1) * (D / 2 + 0.9);
    litterAt(x + ux * a + nx * b, z + uz * a + nz * b, seed + i * 7 + 1);
  }
  STATS.pads++;
  return true;
}

/* у подъездов — мусор, во дворах — площадки с контейнерами. Жребий — по месту подъезда */
export function yard () {
  const t0 = performance.now();
  const clean = A.CAREER ? A.donated('trash') : 0;        // карьера: город вычищен донатом — мусора меньше
  const pLit = LITTER.P * (1 - clean), pPad = CANS.PAD_P;
  const pads = [];
  for (const [x, z, nx, nz] of A.CITY.entrances) {
    if (!A.inBounds(x, z, -40)) continue;
    const tx = nz, tz = -nx, h = hash(x, z, 5), seed = Math.round(x * 31 + z * 17);
    if (h < pLit && STATS.litter < LITTER.CAP) {
      const s = hash(x, z, 6) < 0.5 ? 1 : -1, a = 3.4 + hash(x, z, 7) * 1.2, b = 1.8 + hash(x, z, 8) * 1.4;
      litterAt(x + nx * b + tx * a * s, z + nz * b + tz * a * s, seed);
    }
    const h2 = hash(x, z, 9);
    if (h2 < pPad && STATS.pads < CANS.PAD_CAP) {
      const s = h2 < pPad / 2 ? 1 : -1, b = 9 + hash(x, z, 10) * 4, a = 6 + hash(x, z, 11) * 4;
      const px = x + nx * b + tx * a * s, pz = z + nz * b + tz * a * s;
      if (pads.some(p => Math.abs(p[0] - px) < CANS.PAD_GAP && Math.abs(p[1] - pz) < CANS.PAD_GAP)) continue;
      if (padAt(px, pz, tx, tz, 2 + ((hash(x, z, 12) * 3) | 0), seed + 3)) pads.push([px, pz]);
    }
  }
  STATS.ms = Math.round(performance.now() - t0);
}

/* ═════════════════ каждый кадр и новая смена ═════════════════ */
export function step (dt) {
  if (DYN.length) stepCans(dt);
  if (STATS.broken) stepStops(dt);
}

/* новая смена: будки и контейнеры — на место, мусор у подъездов — снова лежит */
export function reset () {
  for (const st of STOPS) {
    if (!st.broken) continue;
    for (const p of st.parts) { A.scene.remove(p.m); p.m.geometry.dispose(); }
    st.parts = [];
    st.s.hw = st.hw; st.s.hd = st.hd;
    unhide(st.it);
    st.broken = 0;
  }
  STATS.broken = 0;
  for (const o of DYN) {
    A.scene.remove(o.dyn); o.dyn = null;
    Object.assign(o, { x: o.x0, z: o.z0, ry: o.ry0, vx: 0, vz: 0, w: 0, tip: 0, tipV: 0, hop: 0, fell: 0, rest: 0 });
    unhide(o.it);
  }
  DYN.length = 0; STATS.dyn = 0;
  for (const it of A.SMASH) if (it.kind === 'litter' && it.down) unhide(it);
  if (A.S) A.S.stops = 0;
}

export const DEBUG = { STOPS, CANS_ALL, DYN, STATS };
