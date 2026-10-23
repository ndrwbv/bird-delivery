/* ──────────────────────────────────────────────────────────────────────────
   Обломки и разлёт мелочи (автор 23.10.2026): забор ломается кусками вразнобой (0п18), куча мусора
   разлетается (0п19). Правила словами — docs/CAREER.md «Город: что сбивается».

   • Куски — из запаса: материал один на цвет (кэш), геометрия одна на вид (коробка, комок, бутылка) —
     размер куска — масштаб меша; меши отработавших кусков возвращаются в запас (release). Новых
     материалов и геометрий на кусок нет. Летят и лежат общей механикой обломков game.js (GORE,
     updateGore): у куска pool — вернуть меш в запас, sc — свой размер (тает, не меняя формы),
     roll — катится по земле, теряя скорость (мешки), rest — как лечь (плашмя, с поворотом наугад).
   • Не больше CAP кусков сразу (лишние не появляются).

   fence(api, it, nx, nz, force) — забор (smashHit, вид fence / bigfence): 3—6 кусков разного размера
     (от 1/5 до 1/2 секции) и 6—10 щепок / крошки; летят по удару с разбросом ±35° и вращением, сильный удар —
     дальше; ложатся плашмя, каждый своим поворотом.
   heap(api, hp, vx, vz, speed, k) — куча мусора у дома (world.js HEAPS): чёрные мешки отлетают по ходу машины,
     катятся и ложатся; бутылки, бумага, коробки — веером вокруг. k — доля кусков (мусор у подъезда — 0,4).
   chunks(api, x, z, nx, nz, force, hex, n, bar) — мелочь газона (оградки, выбивалки…): n кусков разного размера.
   api: scene, GORE, groundH.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

export const DEB = {
  CAP: 160,                    // кусков сразу, не больше
  FENCE: { BIG: [3, 6], CHIP: [6, 10], SPREAD: 0.6, FAR: 30 },   // разброс — рад (±35°), FAR — удар, на котором летит дальше всего, м/с
  HEAP: { BAG: [5, 9], BIT: [8, 14] },
};
export const STATS = { live: 0, made: 0, reused: 0, mats: 0 };

const MATS = new Map();
const mat = hex => {
  let m = MATS.get(hex);
  if (!m) { m = new THREE.MeshLambertMaterial({ color: hex, flatShading: true }); MATS.set(hex, m); STATS.mats++; }
  return m;
};
let GEO = null;
const geos = () => GEO || (GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  lump: new THREE.IcosahedronGeometry(1, 0),
  bottle: new THREE.CylinderGeometry(0.5, 0.55, 1, 6),
});
const POOL = [];
export function release (m) {
  if (POOL.length < DEB.CAP) { m.visible = true; POOL.push(m); }
  STATS.live = Math.max(0, STATS.live - 1);
}
const rand = (a, b) => a + Math.random() * (b - a);
const pickOf = a => a[(Math.random() * a.length) | 0];

/* кусок: вид геометрии, цвет, где, размер (sx, sy, sz), скорость, вращение, сколько живёт */
function piece (api, k, hex, x, y, z, sx, sy, sz, vx, vy, vz, o = {}) {
  if (STATS.live >= DEB.CAP) return null;
  const G = geos();
  let m = POOL.pop();
  if (m) { m.geometry = G[k]; m.material = mat(hex); STATS.reused++; } else { m = new THREE.Mesh(G[k], mat(hex)); STATS.made++; }
  m.position.set(x, y, z);
  m.rotation.set(rand(-0.6, 0.6), rand(0, 6.283), rand(-0.6, 0.6));
  m.scale.set(sx, sy, sz);
  api.scene.add(m);
  STATS.live++;
  // как лечь: самая тонкая сторона — вверх (коробка: y или z), лёгкий наклон
  const rest = sy <= sz ? [rand(-0.08, 0.08), rand(-0.08, 0.08)] : [Math.PI / 2 + rand(-0.08, 0.08), rand(-0.08, 0.08)];
  const g = { m, vx, vy, vz, spin: o.spin ?? rand(-9, 9), spinY: o.spinY ?? rand(-6, 6), life: o.life ?? rand(10, 16), bleed: 1e9, rest: 0,
    pool: 1, sc: [sx, sy, sz], lift: Math.min(sy, sz) / 2 + 0.01, restRot: k === 'bottle' ? [0, Math.PI / 2] : rest, roll: o.roll || 0 };
  api.GORE.push(g);
  return g;
}

/* забор: куски разного размера и крошка — по удару с разбросом */
export function fence (api, it, nx, nz, force) {
  const F = DEB.FENCE, big = it.kind === 'bigfence', gy = api.groundH(it.x, it.z);
  const sec = big ? 2.6 : 2.5, h = big ? 2.0 : 0.85, th = big ? 0.12 : 0.06;
  const f = Math.min(1.4, 0.35 + force / F.FAR);                    // сильный удар — дальше
  const n = F.BIG[0] + ((Math.random() * (F.BIG[1] - F.BIG[0] + 1)) | 0);
  const base = Math.atan2(nx, nz);
  for (let i = 0; i < n; i++) {
    const len = sec * rand(0.2, 0.5), hh = h * rand(0.25, 0.7);
    const a = base + rand(-F.SPREAD, F.SPREAD), sp = rand(3, 8) * f;
    const ox = rand(-sec / 2, sec / 2), lx = it.x + Math.cos(base) * ox, lz = it.z - Math.sin(base) * ox;   // вдоль секции
    piece(api, 'box', it.hex, lx, gy + rand(0.3, h), lz, len, hh, th,
      Math.sin(a) * sp, rand(2, 5.5) * Math.min(1.2, f + 0.3), Math.cos(a) * sp, { spin: rand(-12, 12), spinY: rand(-9, 9), life: rand(10, 16) });
  }
  const nc = F.CHIP[0] + ((Math.random() * (F.CHIP[1] - F.CHIP[0] + 1)) | 0);
  for (let i = 0; i < nc; i++) {
    const s = rand(0.06, 0.16), a = base + rand(-F.SPREAD * 1.6, F.SPREAD * 1.6), sp = rand(2, 9) * f;
    piece(api, Math.random() < 0.5 ? 'box' : 'lump', it.hex, it.x + rand(-0.8, 0.8), gy + rand(0.2, h), it.z + rand(-0.8, 0.8), s * rand(1, 2.5), s * 0.6, s,
      Math.sin(a) * sp, rand(1.5, 5), Math.cos(a) * sp, { life: rand(6, 10) });
  }
}

/* мелочь газона (lawnprops.js debris: оградки, выбивалки, покрышки…): n кусков разного размера, bar — вытянутые */
export function chunks (api, x, z, nx, nz, force, hex, n, bar) {
  const gy = api.groundH(x, z), f = Math.min(1.4, 0.35 + force / DEB.FENCE.FAR), base = Math.atan2(nx, nz);
  for (let i = 0; i < n; i++) {
    const sz = rand(0.1, 0.35), a = base + rand(-DEB.FENCE.SPREAD, DEB.FENCE.SPREAD), sp = rand(2.5, 7) * f;
    piece(api, 'box', hex, x + rand(-0.4, 0.4), gy + rand(0.3, 0.9), z + rand(-0.4, 0.4), sz * (bar ? rand(2, 4) : rand(0.8, 1.4)), sz * 0.5, sz,
      Math.sin(a) * sp, rand(2.5, 5.5), Math.cos(a) * sp, { life: rand(8, 14) });
  }
}

/* куча мусора: мешки — по ходу машины, катятся; мелочь — веером */
const BAG = ['#222227', '#26262c', '#1d1f24', '#2a2a30', '#2d3a2b', '#35507e'];
const BIT = [['bottle', '#3f8a4a'], ['bottle', '#6b4a2a'], ['bottle', '#cfe3d8'], ['box', '#e8e4da'], ['box', '#d9cdb0'], ['box', '#b08a5a'], ['box', '#a2804f']];
export function heap (api, hp, vx, vz, speed, k = 1) {
  const H = DEB.HEAP, l = Math.hypot(vx, vz) || 1, dx = vx / l, dz = vz / l, base = Math.atan2(dx, dz);
  const R = hp.rs || hp.R, gy = api.groundH(hp.x, hp.z), f = 0.45 + Math.min(speed, 25) / 25;
  const nb = Math.max(1, Math.round((H.BAG[0] + ((Math.random() * (H.BAG[1] - H.BAG[0] + 1)) | 0)) * k));
  for (let i = 0; i < nb; i++) {
    const s = rand(0.26, 0.4), a = base + rand(-0.7, 0.7), sp = speed * rand(0.35, 0.75) + rand(0, 2);
    const g = piece(api, 'lump', pickOf(BAG), hp.x + rand(-R, R) * 0.6, gy + rand(0.3, 1.0) * (hp.H || 1), hp.z + rand(-R, R) * 0.6, s, s * 0.8, s * 1.1,
      Math.sin(a) * sp, rand(1.5, 4) * f, Math.cos(a) * sp, { roll: 1.6, life: rand(30, 45), spin: rand(-5, 5) });
    if (g) g.lift = s * 0.7;
  }
  const nt = Math.max(1, Math.round((H.BIT[0] + ((Math.random() * (H.BIT[1] - H.BIT[0] + 1)) | 0)) * k));
  for (let i = 0; i < nt; i++) {
    const [k, hex] = pickOf(BIT), a = base + rand(-1.8, 1.8), sp = rand(2, 7) * f;
    const big = k === 'box' && Math.random() < 0.4;
    const sx = k === 'bottle' ? 0.11 : big ? rand(0.35, 0.6) : rand(0.2, 0.32), sy = k === 'bottle' ? 0.3 : big ? sx * 0.7 : 0.02, sz = k === 'bottle' ? 0.11 : big ? sx * 0.8 : sx * 0.75;
    piece(api, k, hex, hp.x + rand(-R, R) * 0.7, gy + rand(0.3, 1.2), hp.z + rand(-R, R) * 0.7, sx, sy, sz,
      Math.sin(a) * sp, rand(2, 5) * f, Math.cos(a) * sp, { life: rand(25, 40), roll: k === 'bottle' ? 2.5 : 0 });
  }
}

/* кусок на земле (updateGore): отскок, катится с трением roll, лёг — когда почти стоит */
export function ground (g, fl, dt) {
  const m = g.m;
  m.position.y = fl + g.lift;
  g.vy = g.vy < -2.5 ? -g.vy * 0.25 : 0;
  const k = Math.exp(-(g.roll || 6) * dt);
  g.vx *= k; g.vz *= k; g.spin *= k;
  const sp = Math.hypot(g.vx, g.vz);
  if (g.roll && sp > 0.3) {                          // катится: крутится по ходу
    m.rotation.y = Math.atan2(g.vx, g.vz);
    m.rotation.x += sp / Math.max(0.1, g.lift) * dt;
  }
  if (sp < 0.3 && g.vy === 0) {
    g.rest = 1;
    m.rotation.set(g.restRot[0], m.rotation.y, g.restRot[1]);
  }
}

export const DEBUG = { DEB, STATS, POOL };
