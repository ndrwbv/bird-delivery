/* ──────────────────────────────────────────────────────────────────────────
   Пиццерия растёт (docs/IDEAS.md, блок 9; правила — docs/CAREER.md «Пиццерия растёт»).
   Только в карьере с районами.

   У каждой из 8 пиццерий — своя ступень 1—5 по числу доставок игрока в её районе
   (адрес в районе, за всё время профиля; сохранение — профильный ключ dlv-pz-grow).
   Числа — econ.js GROWTH (AT — пороги, PAY / TIP / SIZE / COURIERS — что даёт ступень).

     1 «загибается»  — ты и ещё один курьер, пустые столики, вывеска мигает, на стекле
                        «ищем курьеров»; оплата ×0,95, сборные — на пиццу меньше;
     2 «держится»    — 2 коллеги, за столиком один гость, вывеска ровная;
     3 «растёт»      — 3 коллеги, ещё 2 столика, 3 гостя, вывеска светится ореолом;
     4 «на подъёме»  — 4 коллеги, 5 гостей, гирлянды на тамбуре и по карнизу, очередь из 2;
     5 «процветает»  — 6 гостей, очередь из 4, шарики у входа, оркестр из трёх в форме
                        (труба, аккордеон, барабан) играет — над ними ноты.

   Что видно у шара — строится, только когда машина ближе BUILD_R м (люди — свои, при
   отъезде дальше DROP_R убираются): кадр не тяжелеет, пока ты на другом конце города.
   Гостей, очередь и музыкантов можно сбить (как прохожих, hits.js); столики — сбиваются.

   Из game.js: GROW.step(dt, api) — каждый кадр; GROW.delivered(x, z) — отдал адрес;
   GROW.couriers() — сколько своих на смене. Из orders.js: payK(x, z), tipAdd(x, z), sizeAdd().
   Итоги смены (career.js) — GROW.rows(); меню районов — GROW.label(i).
   Отладка: __dlv.GROW (set(i, n), stage(i), counts, state).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import Platform from '../platform/index.js';
import { t, tn, N_ } from '../i18n/index.js';
import { GROWTH as G } from './econ.js';
import * as DIST from './districts.js';
import { TIER } from './hits.js';
import { DEBUG as PZD } from './pizzadome.js';

const KEY = 'dlv-pz-grow';
export const LOOK = { BUILD_R: 300, DROP_R: 420, HIT_R: 24, FLICKER: true };
const NAMES = [N_('загибается'), N_('держится'), N_('растёт'), N_('на подъёме'), N_('процветает')];
const STAGES = G.AT.length;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

let A = null;
const ST = { counts: null, snap: null, session: -1, t: 0, ups: [] };

/* ── счёт ── */
function counts () {
  if (ST.counts) return ST.counts;
  let c = null;
  try { c = Platform.store.get(KEY); } catch (e) { c = null; }
  if (typeof c === 'string') { try { c = JSON.parse(c); } catch (e) { c = null; } }
  ST.counts = Array.isArray(c) ? c.map(v => Math.max(0, +v || 0)) : [];
  return ST.counts;
}
function save () { try { Platform.store.set(KEY, counts().slice()); } catch (e) { /* приватный режим */ } }
export const count = i => counts()[i] || 0;
/** ступень пиццерии района i: 1…5 */
export function stage (i, n) {
  const c = n === undefined ? count(i) : n;
  let s = 1;
  for (let k = 0; k < STAGES; k++) if (c >= G.AT[k]) s = k + 1;
  return s;
}
export const stageName = s => t(NAMES[Math.max(1, Math.min(STAGES, s)) - 1]);
export const stars = s => '★'.repeat(s) + '☆'.repeat(STAGES - s);
/** до следующей ступени: сколько доставок (0 — последняя) */
export const toNext = i => { const s = stage(i); return s >= STAGES ? 0 : G.AT[s] - count(i); };
/** «растёт ★★★☆☆» */
export const label = i => stageName(stage(i)) + ' ' + stars(stage(i));
const on = () => DIST.has();
const distOf = (x, z) => { const i = DIST.at(x, z); return i >= 0 ? i : DIST.cur(); };
/* где сейчас берёшь заказы: «весь город» — пиццерия, у которой стоишь; иначе — район смены */
function here () {
  if (DIST.city() && A && A.PIZZA) return distOf(A.PIZZA.x, A.PIZZA.z);
  return DIST.cur();
}
const sOf = (arr, s) => arr[Math.max(0, Math.min(arr.length - 1, s - 1))];

/* ── экономика (orders.js) ── */
export const payK = (x, z) => (on() ? sOf(G.PAY, stage(x === undefined ? here() : distOf(x, z))) : 1);
export const tipAdd = (x, z) => (on() ? sOf(G.TIP, stage(x === undefined ? here() : distOf(x, z))) : 0);
export const sizeAdd = () => (on() ? sOf(G.SIZE, stage(here())) : 0);
/** курьеров своей сети на смене (game.js initRivals) */
export const couriers = () => (on() ? sOf(G.COURIERS, stage(here())) : 99);

/** отдал адрес в (x, z): +1 доставка пиццерии его района; выросла — всплывашка */
export function delivered (x, z) {
  if (!on()) return;
  const i = distOf(x, z);
  if (i < 0) return;
  const c = counts(), was = stage(i);
  c[i] = (c[i] || 0) + 1;
  for (let k = 0; k < DIST.count(); k++) if (c[k] === undefined) c[k] = 0;
  save();
  const now = stage(i);
  if (now > was) {
    ST.ups.push({ i, s: now });
    const name = t(DIST.list()[i].name);
    if (A && A.popBonus) A.popBonus(t('пиццерия «{name}» растёт!', { name }), stageName(now) + ' ' + stars(now));
  }
}

/* ── итоги смены (career.js): строки [подпись, текст, 'info' | 'new'] ── */
export function rows () {
  if (!on()) return [];
  const snap = ST.snap || [];
  const out = [];
  const touched = [];
  for (let i = 0; i < DIST.count(); i++) if (count(i) > (snap[i] || 0)) touched.push(i);
  const list = touched.length ? touched.slice(0, 2) : [DIST.cur()];
  for (const i of list) {
    const name = t(DIST.list()[i].name), s = stage(i), was = stage(i, snap[i] || 0), left = toNext(i);
    const tail = left ? ' · ' + tn(left, 'до следующей — {n} доставка|до следующей — {n} доставки|до следующей — {n} доставок') : '';
    if (s > was) out.push([t('пиццерия «{name}» выросла', { name }), stageName(s) + ' ' + stars(s), 'new']);
    else out.push([t('пиццерия «{name}»', { name }), stageName(s) + ' ' + stars(s) + tail, 'info']);
  }
  return out;
}

/* ═════════════════ как выглядит ═════════════════ */
const DECOR = new Map();            // dome → { stage, humans: [], meshes: [], tables: bool, ... }
let GARL = null, GLOW_MAT = null, POSTER_MAT = null;
const GARL_HEX = ['#ff4b3e', '#ffd23f', '#5bd66a', '#4aa8ff'];

function domeList () {
  const P = (A && A.PIZZERIAS) || [];
  const out = [];
  P.forEach((p, i) => {
    if (!p || !p.dome) return;
    const d = PZD.DOMES.find(q => Math.abs(q.x - p.dome.x) < 0.01 && Math.abs(q.z - p.dome.z) < 0.01);
    if (d) out.push({ i, d });
  });
  return out;
}
/* локальные координаты шара: u — вправо, v — к улице */
function frame (d) {
  const fx = Math.sin(d.ry), fz = Math.cos(d.ry), rx = fz, rz = -fx;
  return (u, v) => [d.x + rx * u + fx * v, d.z + rz * u + fz * v];
}
function posterMat () {
  if (POSTER_MAT) return POSTER_MAT;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 160;
  const x = c.getContext('2d');
  x.fillStyle = '#fbf6e8'; x.fillRect(0, 0, 256, 160);
  x.strokeStyle = '#c8bfa8'; x.lineWidth = 4; x.strokeRect(4, 4, 248, 152);
  x.fillStyle = '#d9342c'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const fit = (s, y, max) => { let f = max; do { x.font = 'bold ' + f + 'px sans-serif'; f -= 2; } while (x.measureText(s).width > 230 && f > 12); x.fillText(s, 128, y); };
  fit(t('ИЩЕМ КУРЬЕРОВ'), 56, 34);
  x.fillStyle = '#33210c';
  fit(t('зарплата достойная'), 108, 22);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  POSTER_MAT = new THREE.MeshBasicMaterial({ map: tx });
  return POSTER_MAT;
}
function garlandMats () {
  if (!GARL) GARL = GARL_HEX.map(h => new THREE.MeshBasicMaterial({ color: h }));
  return GARL;
}

/* человек: гость (сидит), в очереди (стоит), музыкант (играет) */
function human (kind, x, z, h, gy) {
  const o = kind === 'band' ? { shirt: '#ff7a1a', pants: '#1b1b20', fat: false } : {};
  const grp = A.makeHuman(null, o);
  const u = grp.userData;
  const p = { grp, u, kind, x, z, h, gy, dead: 0, ph: rand(0, 6), sit: kind === 'guest' ? 1 : 0, inst: null };
  if (kind === 'guest') {
    if (u.legL) { u.legL.rotation.x = -1.45; u.legR.rotation.x = -1.45; }
    if (u.armL) { u.armL.rotation.x = -0.9; u.armR.rotation.x = -0.7; }
  }
  if (kind === 'band') {
    const g = [];
    const which = p.band = h.inst;
    if (which === 'trumpet') {
      A.put(g, new THREE.CylinderGeometry(0.035, 0.035, 0.45, 6).rotateX(Math.PI / 2), '#e8c23a', 0, 1.36, 0.42);
      A.put(g, new THREE.ConeGeometry(0.11, 0.18, 8).rotateX(-Math.PI / 2), '#f2d24a', 0, 1.36, 0.72);
    } else if (which === 'accordion') {
      A.box(g, 0.46, 0.3, 0.2, '#c8242c', 0, 1.0, 0.26);
      A.box(g, 0.08, 0.32, 0.22, '#f4f1ea', -0.25, 1.0, 0.26);
      A.box(g, 0.08, 0.32, 0.22, '#f4f1ea', 0.25, 1.0, 0.26);
    } else {
      A.put(g, new THREE.CylinderGeometry(0.26, 0.26, 0.26, 12).rotateX(Math.PI / 2), '#f4f1ea', 0, 0.9, 0.34);
      A.put(g, new THREE.CylinderGeometry(0.27, 0.27, 0.05, 12).rotateX(Math.PI / 2), '#c8242c', 0, 0.9, 0.48);
    }
    // белая фуражка с оранжевым околышем — оркестр «в форме»
    A.box(g, 0.34, 0.08, 0.36, '#ff7a1a', 0, 1.88, 0);
    A.box(g, 0.36, 0.05, 0.4, '#f4f1ea', 0, 1.93, 0.02);
    p.inst = new THREE.Mesh(A.mergeGeos(g), A.HUMAN_VC);
    grp.add(p.inst);
    h = h.h;
    p.h = h;
  }
  grp.position.set(x, gy - (p.sit ? 0.42 : 0), z);
  grp.rotation.y = p.h;
  A.scene.add(grp);
  return p;
}

/* столик под зонтиком — как у шара (pizzadome.js), но свой меш: сбивается (smashMesh) */
function table (x, z, ry, hex) {
  const ty = A.groundH(x, z) + 0.13, g = [];
  A.put(g, new THREE.CylinderGeometry(0.55, 0.55, 0.06, 10), '#f4f1ea', x, ty + 0.75, z);
  A.put(g, new THREE.CylinderGeometry(0.05, 0.05, 0.75, 6), '#585460', x, ty + 0.38, z);
  A.put(g, new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), '#585460', x, ty + 1.1, z);
  A.put(g, new THREE.ConeGeometry(1.4, 0.55, 8), hex, x, ty + 2.35, z);
  for (const a of [0, Math.PI]) A.put(g, new THREE.BoxGeometry(0.45, 0.5, 0.45), '#c8c2b8', x + Math.cos(a + ry) * 0.9, ty + 0.25, z - Math.sin(a + ry) * 0.9);
  const geo = A.mergeGeos(g);
  const m = new THREE.Mesh(geo, A.HUMAN_VC);
  A.scene.add(m);
  if (A.smashMesh) A.smashMesh('table', x, z, 1.2, m, 0, geo.attributes.position.count, '#f4f1ea');
  return m;
}

/* гирлянда: лампочки по цепочке точек, четыре цвета — четыре склейки */
function garland (pts, out) {
  const M = garlandMats(), by = [[], [], [], []];
  pts.forEach(([x, y, z], k) => { A.put(by[k % 4], new THREE.SphereGeometry(0.09, 5, 4), GARL_HEX[k % 4], x, y, z); });
  by.forEach((l, c) => {
    if (!l.length) return;
    const m = new THREE.Mesh(A.mergeGeos(l), M[c]);
    A.scene.add(m); out.push(m);
  });
}

function buildDecor (d, i, s) {
  const at = frame(d), P = d.porch || { V0: 4.8, V1: 8.8, VW: 6.2, VH: 3.6 }, gy = d.gy;
  const old = DECOR.get(d);
  dropDecor(d, true);
  const D = { stage: s, i, humans: [], meshes: [], tables: old ? old.tables : null, glow: null, poster: null, balloons: [], t: 0 };
  DECOR.set(d, D);
  const ry = d.ry;
  // «ищем курьеров» на стекле тамбура — пока загибается и держится
  if (s <= 2) {
    const [x, z] = at(-1.9, P.V1 + 0.06);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.75), posterMat());
    m.position.set(x, gy + 1.7, z); m.rotation.y = ry;
    A.scene.add(m); D.meshes.push(m); D.poster = m;
  }
  // ещё два столика под шаром по бокам — с «растёт»; строятся один раз и стоят дальше
  if (G.TABLES[s - 1] > 0 && !D.tables) {
    D.tables = [];
    for (const sg of [-1, 1]) {
      const [x, z] = at(sg * 6.9, 5.8);
      D.tables.push({ x, z, sg, m: table(x, z, ry, sg > 0 ? '#ffd23f' : '#f0522a') });
    }
  }
  if (D.tables) for (const tb of D.tables) tb.m.visible = G.TABLES[s - 1] > 0;
  // ореол вывески — с «растёт», у «процветает» дышит
  if (s >= 3 && d.sign) {
    if (!GLOW_MAT) GLOW_MAT = new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    const sp = d.sign.position, w = (P.VW + 0.2) * 1.18;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 112 / 512 * 1.9), GLOW_MAT);
    const [bx, bz] = at(0, P.V1 + 0.02);
    m.position.set(bx, sp.y, bz); m.rotation.y = ry;
    A.scene.add(m); D.meshes.push(m); D.glow = m;
  }
  // гирлянды: по краю козырька тамбура (провисают) и по карнизу барабана — с «на подъёме»
  if (s >= 4) {
    const pts = [];
    const y0 = gy + P.VH + 0.42;
    for (let k = 0; k <= 22; k++) {
      const q = k / 22, u = -P.VW / 2 - 0.2 + q * (P.VW + 0.4), sag = Math.sin(q * Math.PI * 3) ** 2 * 0.28;
      const [x, z] = at(u, P.V1 + 0.32);
      pts.push([x, y0 - sag, z]);
    }
    const RD = 6.4, HD = 4.4;
    for (let k = 0; k < 44; k++) {
      const a = k / 44 * Math.PI * 2, r = RD + 0.5;
      pts.push([d.x + Math.sin(a) * r, gy + HD + 0.62 - Math.abs(Math.sin(a * 7)) * 0.12, d.z + Math.cos(a) * r]);
    }
    garland(pts, D.meshes);
  }
  // шарики у входа — у «процветает»
  if (s >= 5) {
    const COL = ['#ff7a1a', '#ffd23f', '#f4f1ea', '#e0302a', '#ff9ec7'];
    for (const sg of [-1, 1]) {
      const g = [], [x, z] = at(sg * (P.VW / 2 + 0.7), P.V1 + 0.5);
      const by = A.groundH(x, z);
      A.box(g, 0.08, 0.5, 0.08, '#585460', 0, 0.25, 0);
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * Math.PI * 2, ox = Math.cos(a) * 0.35, oz = Math.sin(a) * 0.35, oy = 2.6 + (k % 2) * 0.35;
        A.put(g, new THREE.SphereGeometry(0.32, 8, 6).scale(1, 1.2, 1), COL[k % COL.length], ox, oy, oz);
        A.box(g, 0.012, oy - 0.4, 0.012, '#f4f1ea', ox * 0.5, (oy - 0.4) / 2 + 0.4, oz * 0.5);
      }
      const m = new THREE.Mesh(A.mergeGeos(g), A.HUMAN_VC);
      m.position.set(x, by + 0.13, z);
      A.scene.add(m); D.meshes.push(m); D.balloons.push(m);
    }
  }
  // гости за столиками: места — по два у каждого столика (два у шара + два новых)
  const seats = [];
  for (const sg of [-1, 1]) {
    const [tx, tz] = at(sg * (P.VW / 2 + 3.4), P.V1 + 1.2);
    seats.push([tx, tz]);
  }
  if (D.tables && G.TABLES[s - 1] > 0) for (const tb of D.tables) seats.push([tb.x, tb.z]);
  const rx = Math.cos(ry), rz = -Math.sin(ry);          // «вправо» (чем стулья стоят у столика)
  const chairs = [];
  for (const [tx, tz] of seats) for (const sg of [1, -1]) chairs.push([tx + rx * 0.9 * sg, tz + rz * 0.9 * sg, Math.atan2(-rx * sg, -rz * sg)]);
  // сначала по одному за каждый столик, потом напротив
  const order = [0, 2, 4, 6, 1, 3, 5, 7].filter(k => k < chairs.length);
  for (let k = 0; k < Math.min(G.GUESTS[s - 1], order.length); k++) {
    const [x, z, h] = chairs[order[k]];
    D.humans.push(human('guest', x, z, h, A.groundH(x, z) + 0.13));
  }
  // очередь у двери: от двери вбок вдоль тамбура
  const Q = [[1.9, P.V1 + 0.85], [3.0, P.V1 + 1.05], [4.3, P.V1 + 0.6], [4.6, P.V1 - 0.4], [4.6, P.V1 - 1.3], [4.6, P.V1 - 2.2]];
  for (let k = 0; k < Math.min(G.QUEUE[s - 1], Q.length); k++) {
    const [x, z] = at(Q[k][0], Q[k][1]);
    const [px, pz] = k ? at(Q[k - 1][0], Q[k - 1][1]) : at(1.9, P.V1);
    D.humans.push(human('queue', x, z, Math.atan2(px - x, pz - z), A.groundH(x, z) + 0.13));
  }
  // оркестр — у «процветает»: с другой стороны тамбура, лицом к улице
  if (s >= 5) {
    const B = [[-4.4, P.V1 - 0.2, 'trumpet'], [-4.9, P.V1 - 1.4, 'accordion'], [-4.4, P.V1 - 2.6, 'drum']];
    for (const [u, v, inst] of B) {
      const [x, z] = at(u, v);
      D.humans.push(human('band', x, z, { h: ry + 0.35, inst }, A.groundH(x, z) + 0.13));
    }
  }
}
function dropDecor (d, keepTables) {
  const D = DECOR.get(d);
  if (!D) return;
  for (const p of D.humans) if (!p.dead) A.dropMesh(p.grp);
  for (const m of D.meshes) { A.scene.remove(m); if (m.geometry) m.geometry.dispose(); }
  D.humans = []; D.meshes = [];
  if (D.tables && !keepTables) for (const tb of D.tables) tb.m.visible = false;
  DECOR.delete(d);
  if (keepTables && D.tables) DECOR.set(d, { stage: 0, humans: [], meshes: [], tables: D.tables, balloons: [] });
}

/* вывеска: у загибающейся мигает, как перегоревший неон */
function signStep (d, s, dt) {
  if (!d.sign) return;
  const m = d.sign.material;
  if (s > 1) { if (m.color.r !== 1) m.color.setScalar(1); return; }
  d.fl = (d.fl || 0) - dt;
  if (d.fl <= 0) {
    const off = Math.random() < 0.45;
    d.fl = off ? rand(0.05, 0.25) : rand(0.2, 1.6);
    m.color.setScalar(off ? 0.22 : 1);
  }
}

/* сбить гостя / музыканта / из очереди — как прохожего */
const HL = 2.7, HW = 1.35;
function hitPeople (D, dt) {
  const V = A.V, sp = Math.hypot(V.vx, V.vz), fx = Math.sin(V.h), fz = Math.cos(V.h);
  for (const p of D.humans) {
    if (p.dead) continue;
    const ex = p.x - V.x, ez = p.z - V.z, al = ex * fx + ez * fz, ac = ex * fz - ez * fx;
    if (Math.abs(al) >= HL || Math.abs(ac) >= HW) continue;
    if (sp * 3.6 >= TIER.FALL) {
      p.dead = 1;
      A.dropMesh(p.grp);
      A.gibHuman({ x: p.x, z: p.z, grp: p.grp }, V.vx, V.vz);
      if (A.onRunOver) A.onRunOver();
    } else {
      // медленно — встал и отошёл в сторону
      const outW = HW - Math.abs(ac) + 0.1;
      const k = ac >= 0 ? outW : -outW;
      p.x += fz * k; p.z -= fx * k;
      p.sit = 0;
      if (p.u.legL) { p.u.legL.rotation.x = 0; p.u.legR.rotation.x = 0; }
      p.grp.position.set(p.x, A.groundH(p.x, p.z) + 0.13, p.z);
    }
  }
}

function animate (D, dt) {
  D.t += dt;
  const night = A.ENV ? A.ENV.night : 0;
  for (const p of D.humans) {
    if (p.dead) continue;
    const u = p.u;
    p.ph += dt;
    if (p.kind === 'band') {
      // играют: покачиваются, руки — по инструменту
      p.grp.rotation.z = Math.sin(p.ph * 4) * 0.05;
      if (u.armL) {
        if (p.band === 'trumpet') { u.armL.rotation.x = -1.5; u.armR.rotation.x = -1.4 + Math.sin(p.ph * 9) * 0.08; }
        else if (p.band === 'accordion') { const k = Math.sin(p.ph * 3); u.armL.rotation.x = -1.0; u.armR.rotation.x = -1.0; u.armL.rotation.z = -0.3 - k * 0.3; u.armR.rotation.z = 0.3 + k * 0.3; if (p.inst) p.inst.scale.x = 1 + k * 0.25; }
        else { u.armL.rotation.x = -1.1 + Math.max(0, Math.sin(p.ph * 10)) * 0.5; u.armR.rotation.x = -1.1 + Math.max(0, Math.sin(p.ph * 10 + Math.PI)) * 0.5; }
      }
      if ((p.noteT = (p.noteT || rand(0.3, 1.2)) - dt) <= 0) { p.noteT = rand(0.9, 1.6); if (A.emote) A.emote(p.x, 2.3, p.z, 'note', 1); }
    } else if (p.kind === 'guest' && p.sit) {
      // едят: рука ко рту
      if (u.armR) u.armR.rotation.x = -0.7 - Math.max(0, Math.sin(p.ph * 1.3)) * 1.1;
    } else if (p.kind === 'queue') {
      p.grp.rotation.y = p.h + Math.sin(p.ph * 0.7) * 0.25;
    }
  }
  for (const b of D.balloons) { b.rotation.y = Math.sin(D.t * 0.8) * 0.2; b.rotation.z = Math.sin(D.t * 1.3) * 0.04; }
  if (D.glow) GLOW_MAT.opacity = (0.28 + 0.3 * night) * (D.stage >= 5 ? 0.8 + 0.2 * Math.sin(D.t * 2.2) : 1);
  if (D.stage >= 4 && GARL) {
    // лампочки мигают по очереди
    const k = Math.floor(D.t * 2.5) % 4;
    GARL.forEach((m, c) => m.color.set(GARL_HEX[c]).multiplyScalar(c === k ? 1 : 0.55 + 0.25 * night));
  }
}

/* ── кадр ── */
export function step (dt, api) {
  if (api) A = api;
  if (!A) return;
  if (typeof window !== 'undefined' && window.__dlv && !window.__dlv.GROW) window.__dlv.GROW = DEBUG;
  if (!A.CAREER || !on()) return;
  const ses = DIST.session();
  if (ses !== ST.session) { ST.session = ses; ST.snap = counts().slice(); ST.ups = []; }
  ST.t += dt;
  const V = A.V;
  for (const { i, d } of domeList()) {
    const s = stage(i), dist = Math.hypot(V.x - d.x, V.z - d.z);
    signStep(d, s, dt);
    const D = DECOR.get(d);
    if (dist < LOOK.BUILD_R) {
      if (!D || D.stage !== s) buildDecor(d, i, s);
      const E = DECOR.get(d);
      animate(E, dt);
      if (dist < LOOK.HIT_R) hitPeople(E, dt);
    } else if (D && D.stage && dist > LOOK.DROP_R) dropDecor(d, true);
  }
}

export const DEBUG = {
  G, LOOK, ST, DECOR,
  get counts () { return counts().slice(); },
  stage, label, toNext, rows, payK, tipAdd, sizeAdd, couriers,
  /** выставить пиццерии i n доставок (или ступень s: stageSet(i, s)) */
  set (i, n) { const c = counts(); c[i] = Math.max(0, n | 0); save(); return stage(i); },
  stageSet (i, s) { return DEBUG.set(i, G.AT[Math.max(1, Math.min(STAGES, s)) - 1]); },
  reset () { ST.counts = []; save(); },
  get state () {
    return domeList().map(({ i, d }) => {
      const D = DECOR.get(d);
      return { i, stage: stage(i), n: count(i), built: D ? D.stage : 0, humans: D ? D.humans.filter(p => !p.dead).length : 0, meshes: D ? D.meshes.length : 0, tables: D && D.tables ? D.tables.length : 0, dist: Math.round(Math.hypot(A.V.x - d.x, A.V.z - d.z)) };
    });
  },
};
