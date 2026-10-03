/* Фестивали на парковках ТЦ (блок 10, docs/CAREER.md → «Фестивали»).

   Иногда смена идёт с фестивалем: он занимает парковку у ТЦ в районе, где работаешь
   (в «весь город» — у любого открытого). Вокруг — бетонные блоки (твёрдые), за ними сцена,
   шатры, гирлянды и толпа; между блоками и краем парковки — дорожка для машины, на въезде —
   проход для курьера (щель в блоках, машина не пролезает, человек — да). Толпа за блоками
   недосягаема; если машина всё же оказалась внутри (трамплин) — люди отпрыгивают, не давятся.

   Три фестиваля:
   • кальянщики (взрослая) / самовары (детская) — Стёпа на сцене с огромным кальяном
     (самоваром), дым над толпой; в эту смену заказы — рядом с фестивалем (FEST.NEAR_R),
     первый и часть остальных (FEST.PASS_SHARE) — на сам фестиваль, вручение у прохода;
   • тыква — только осенью: тыквы-гиганты на поддонах, конкурс, победительница на весах;
   • День угнетения бургеров — митинг против «Королевы Бургеров»: плакаты, перечёркнутый
     бургер на сцене, маскот-бургер в короне ходит по дорожке. Сбил маскота — +2 респекта и
     премия (во взрослой он лопается на ингредиенты, в детской — укатывается колесом и встаёт);
     часть заказов — «вместо бургера», оплата × FEST.BURGER_K.

     FEST.init(api)          — один раз после города (game.js)
     FEST.shiftStart(o)      — начало смены: решить, будет ли фестиваль; o: { ride, quick }
     FEST.step(dt)           — каждый кадр
   для orders.js:
     FEST.near()             — { x, z, r } — заказы рядом с фестивалем (кальянщики) или null
     FEST.passSpec(n)        — n-й заказ смены: на сам фестиваль? → { x, z, addr, why } или null
     FEST.burgerRoll()       — этот заказ «вместо бургера»? → множитель оплаты или 0
   api: THREE, scene, V, S, CITY, ADULT, Store, obb, SOLIDS, indexSolids, NODES, TRAFFIC,
        put, mergeGeos, groundH, inHouse, inPoly, nearestRoad, solidAt, makeHuman, makePerson,
        dropMesh, sayBubble, fxAdd, puffGeo, steam, gibBurger, popBonus, toast, chat(text),
        addWallet, money, CASH, Snd, CAR_L, CAR_W, HEROES, DIST, season() */
import { t, N_ } from '../i18n/index.js';

export const FEST = {
  CHANCE: 0.22,          // шанс фестиваля в смену (если в районе есть парковка ТЦ)
  FROM: 3,               // не раньше 4-й смены игрока (3 законченных)
  PITY: 7,               // 7 смен подряд без фестиваля (где он мог быть) — следующая точно с ним
  EDGE: 1.5,             // блоки — не ближе к краю парковки, м
  LANE: 6.5,             // перед (к улице) отодвинут вглубь: дорожка вдоль блоков по самой парковке, м
  MIN_SIDE: 22,          // площадка не уже, м (с дорожкой; без неё — от 15,5)
  MIN_AREA: 900,         // и не меньше, м²
  GAP: 1.3,              // проход для курьера в блоках, м (машина ~2 м — не пролезает)
  NEAR_R: 380,           // кальянщики: адреса не дальше от фестиваля, м
  PASS_SHARE: 0.35,      // кальянщики: доля заказов (после первого) ровно на фестиваль
  BURGER_SHARE: 0.4,     // День угнетения бургеров: доля заказов «вместо бургера»
  BURGER_K: 1.5,         // их оплата ×
  MASCOT_PAY: 100,       // премия за маскота (× MONEY_K в карьере — 800 ₽)
  MASCOT_MAX: 3,         // премий за смену не больше
  MASCOT_BACK: 25,       // новый маскот через, с (взрослая)
  CROWD_M2: 4.5,         // на одного человека толпы, м² свободной площади
  CROWD_MAX: 320,
  SHOW_R: 520,           // дальше — толпу и дым не считаем и не рисуем
};
const KINDS = ['hookah', 'pumpkin', 'burger'];
const NAME = {
  hookah: N_('фестиваль кальянщиков'), hookahKids: N_('фестиваль самоваров'),
  pumpkin: N_('фестиваль тыквы'), burger: N_('День угнетения бургеров'),
};
const KEY = 'dlv-fest';

let A = null, THREE = null;
let SITES = null;                    // парковки ТЦ, где может быть фестиваль
let F = null;                        // идущий фестиваль
const ST = { forced: null };
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function init (api) {
  A = api; THREE = api.THREE;
  setTimeout(() => { if (window.__dlv) window.__dlv.FEST = DEBUG; }, 0);
}
const kidsName = k => (k === 'hookah' && !A.ADULT ? NAME.hookahKids : NAME[k]);
export const nameOf = k => t(kidsName(k));

/* ─────────────── где: парковки ТЦ ───────────────
   Для каждого ТЦ — парковки (площадка «park» из карты) с центром ближе 160 м. На парковке
   ищем самый большой прямоугольник вдоль её длинной стороны (от края — FEST.EDGE), мимо домов и
   сквозных улиц. Лучший у ТЦ — его площадка. Перед (сторону к улице) отодвигаем вглубь на
   FEST.LANE — по парковке вдоль блоков остаётся дорожка; по бокам и сзади — что есть вокруг. */
function sites () {
  if (SITES) return SITES;
  SITES = [];
  const C = A.CITY, malls = [];
  for (const m of C.malls || []) {
    const b = C.buildings.find(q => q.id === m.id);
    if (!b) continue;
    let x = 0, z = 0;
    for (const q of b.p) { x += q[0] / b.p.length; z += q[1] / b.p.length; }
    const n = String(b.n || m.n || '').replace(/^(ТЦ|ТРЦ|ТРК)\s*/i, '').replace(/["«»]/g, '').trim();
    if (!n || /ООО/.test(n)) continue;
    malls.push({ n, x, z });
  }
  const seen = new Set();
  for (const m of malls) {
    let best = null;
    for (const lot of C.lots) {
      if (lot.k !== 'park' || seen.has(lot)) continue;
      let x = 0, z = 0;
      for (const q of lot.p) { x += q[0] / lot.p.length; z += q[1] / lot.p.length; }
      if (Math.hypot(x - m.x, z - m.z) > 160) continue;
      const s = rectIn(lot);
      if (s && (!best || s.area > best.area)) best = s;
    }
    if (!best || SITES.some(s => s.lot === best.lot)) continue;
    seen.add(best.lot);
    best.mall = m.n;
    best.di = A.DIST && A.DIST.has() ? A.DIST.at(best.x, best.z) : -1;
    SITES.push(best);
  }
  return SITES;
}
function edgeD (x, z, p) {
  let d = Infinity;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], c = p[(i + 1) % p.length], dx = c[0] - a[0], dz = c[1] - a[1];
    const k = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    d = Math.min(d, Math.hypot(x - a[0] - dx * k, z - a[1] - dz * k));
  }
  return d;
}
function rectIn (lot) {
  const p = lot.p, n = p.length;
  let bl = 0, ux = 1, uz = 0;
  for (let i = 0; i < n; i++) {
    const a = p[i], c = p[(i + 1) % n], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (l > bl) { bl = l; ux = (c[0] - a[0]) / l; uz = (c[1] - a[1]) / l; }
  }
  const vx = -uz, vz = ux;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const q of p) {
    const u = q[0] * ux + q[1] * uz, v = q[0] * vx + q[1] * vz;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const G = 2, nu = Math.ceil((u1 - u0) / G), nv = Math.ceil((v1 - v0) / G);
  if (nu < 8 || nv < 8) return null;
  const ok = new Uint8Array(nu * nv);
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const u = u0 + (i + 0.5) * G, v = v0 + (j + 0.5) * G, x = u * ux + v * vx, z = u * uz + v * vz;
    if (!A.inPoly(x, z, p) || edgeD(x, z, p) < FEST.EDGE || A.inHouse(x, z, 2)) continue;
    const r = A.nearestRoad(x, z, 5, 1);                  // сквозная улица — не наша
    if (r && r.d < r.seg.w / 2 + 2) continue;
    ok[i * nv + j] = 1;
  }
  // самый большой прямоугольник из клеток: «гистограмма» по строкам
  const h = new Int32Array(nu);
  let best = null;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) h[i] = ok[i * nv + j] ? h[i] + 1 : 0;
    const stk = [];
    for (let i = 0; i <= nu; i++) {
      const hi = i < nu ? h[i] : 0;
      while (stk.length && h[stk[stk.length - 1]] >= hi) {
        const top = stk.pop(), hh = h[top], i0 = stk.length ? stk[stk.length - 1] + 1 : 0;
        const wu = (i - i0) * G, wv = hh * G;
        if (wu >= FEST.MIN_SIDE && wv >= FEST.MIN_SIDE && (!best || wu * wv > best.area)) best = { i0, i1: i - 1, j0: j - hh + 1, j1: j, area: wu * wv };
      }
      stk.push(i);
    }
  }
  if (!best || best.area - FEST.LANE * Math.min((best.i1 - best.i0 + 1), (best.j1 - best.j0 + 1)) * G < FEST.MIN_AREA) return null;
  const ua = u0 + best.i0 * G, ub = u0 + (best.i1 + 1) * G, va = v0 + best.j0 * G, vb = v0 + (best.j1 + 1) * G;
  const uc = (ua + ub) / 2, vc = (va + vb) / 2;
  return { lot, ux, uz, vx, vz, x: uc * ux + vc * vx, z: uc * uz + vc * vz, hu: (ub - ua) / 2 - 0.4, hv: (vb - va) / 2 - 0.4, area: Math.round(best.area) };
}

/* раскладка: «перед» — сторона к ближайшей улице, на ней проход; сцена — у задней стороны.
   Координаты (a, b): a — вдоль переда (-W…W), b — вглубь от переда (0…D) */
function layout (s) {
  const R = A.nearestRoad(s.x, s.z, 5, 6);
  const ex = R ? R.x - s.x : s.vx, ez = R ? R.z - s.z : s.vz;
  const eu = ex * s.ux + ez * s.uz, ev = ex * s.vx + ez * s.vz;
  let nx, nz, W, D, along;                                // наружная нормаль переда, полуширина, глубина
  if (Math.abs(eu) / s.hu > Math.abs(ev) / s.hv) { const k = Math.sign(eu) || 1; nx = s.ux * k; nz = s.uz * k; W = s.hv; D = 2 * s.hu; along = ev * k; }
  else { const k = Math.sign(ev) || 1; nx = s.vx * k; nz = s.vz * k; W = s.hu; D = 2 * s.hv; along = -eu * k; }
  const ax = -nz, az = nx;                                // вдоль переда (a)
  const h = D / 2 - FEST.LANE, ox = s.x + nx * h, oz = s.z + nz * h;   // середина переда: на FEST.LANE вглубь — дорожка
  D -= FEST.LANE;
  const aPass = clamp(along, -W + 6, W - 6);
  const w = (a, b) => ({ x: ox + ax * a - nx * b, z: oz + az * a - nz * b });
  return { ax, az, nx, nz, W, D, aPass, w, road: R ? { x: R.x, z: R.z } : null };
}

/* ─────────────── какой и когда ─────────────── */
function save (o) { try { A.Store.set(KEY, JSON.stringify(o)); } catch (e) { /* без сохранения — не страшно */ } }
function load () { try { return JSON.parse(A.Store.get(KEY, '') || '{}') || {}; } catch (e) { return {}; } }
/* площадки, где может быть фестиваль в эту смену: район, где работаешь (весь город — любой открытый) */
function siteChoices () {
  const D = A.DIST;
  if (!D || !D.has()) return sites();
  if (D.city()) return sites().filter(s => D.isOpen(s.di));
  return sites().filter(s => s.di === D.cur());
}
function kindRoll (prev) {
  const autumn = isAutumn();
  const w = autumn ? { pumpkin: 0.5, hookah: 0.25, burger: 0.25 } : { hookah: 0.55, burger: 0.45 };
  if (prev && w[prev] && Object.keys(w).length > 1) w[prev] *= 0.3;   // тот же, что в прошлый раз, — реже
  let sum = 0;
  for (const k in w) sum += w[k];
  let r = Math.random() * sum;
  for (const k in w) if ((r -= w[k]) <= 0) return k;
  return 'hookah';
}
const isAutumn = () => { const s = A.season ? A.season() : 0; const y = ((s % 4) + 4) % 4; return y >= 1 && y < 2; };

export function shiftStart (o = {}) {
  if (!A) return;
  const want = ST.forced;
  ST.forced = null;
  if (o.ride || o.quick) { stop(); return; }
  if (want) { start(want.kind, want.site); return; }
  const shifts = +A.Store.get('dlv-shifts', 0) || 0, sv = load(), choices = siteChoices();
  let go = false;
  if (choices.length && shifts >= FEST.FROM && sv.last !== shifts - 1) {
    const since = sv.since || 0;
    go = since + 1 >= FEST.PITY || Math.random() < FEST.CHANCE;
    sv.since = go ? 0 : since + 1;
  }
  if (!go) { save(sv); stop(); return; }
  const kind = kindRoll(sv.kind);
  sv.last = shifts; sv.kind = kind;
  save(sv);
  start(kind, pick(choices));
}

/* ─────────────── постройка ─────────────── */
const PAL = {
  hookah: ['#8a3b9a', '#3fa8c9', '#e0b13f', '#c95a8a', '#2f9a6a'],
  hookahKids: ['#c9873a', '#e04836', '#f2c230', '#4f7fd6', '#59b06a'],
  pumpkin: ['#e8781e', '#c9452a', '#f2c230', '#7a5a2a', '#59803a'],
  burger: ['#d9342c', '#f4f1ea', '#1d3f8f', '#f2c230', '#2b2a30'],
};
const SHIRTS = ['#d9342c', '#2f6fd8', '#f2c230', '#59b06a', '#e8eef2', '#2b2a30', '#c95a8a', '#e8781e', '#7a5ad0', '#3a8a8a', '#8a6a4a', '#f4f1ea'];
const SKINS = ['#f1c9a5', '#e8bb92', '#d9a37a', '#c48a5c', '#a96e44', '#f6d9bd'];

let MAT = null;
function mats () {
  if (MAT) return MAT;
  MAT = {
    vc: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    crowd: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  };
  for (const m of Object.values(MAT)) m.userData.keep = true;
  return MAT;
}

/* текстура-надпись: баннер над входом, задник сцены, табличка прохода */
function banner (lines, bg, fg, w = 1024, h = 256, pic) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = fg; g.lineWidth = Math.max(4, h * 0.035); g.strokeRect(g.lineWidth, g.lineWidth, w - g.lineWidth * 2, h - g.lineWidth * 2);
  const x0 = pic ? h * 0.95 : 0;
  if (pic) pic(g, h * 0.5, h * 0.5, h * 0.36);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = lines.length;
  lines.forEach((s, i) => {
    let fs = Math.round(h * (i === 0 ? (n > 1 ? 0.36 : 0.5) : 0.2));
    g.font = '900 ' + fs + 'px system-ui, sans-serif';
    while (g.measureText(s).width > (w - x0) * 0.9 && fs > 10) { fs -= 2; g.font = '900 ' + fs + 'px system-ui, sans-serif'; }
    g.fillText(s, x0 + (w - x0) / 2, h * (n > 1 ? (i === 0 ? 0.4 : 0.76) : 0.52));
  });
  const tx = new THREE.CanvasTexture(c);
  tx.anisotropy = 4;
  if ('colorSpace' in tx) tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}
function drawBurger (g, x, y, r, slash) {
  const L = [['#e8a84f', -0.55, 0.5], ['#e04836', -0.12, 0.16], ['#5fbf4a', 0.05, 0.14], ['#ffd34d', 0.2, 0.12], ['#7a4526', 0.38, 0.22], ['#e8b563', 0.62, 0.22]];
  for (const [c, dy, hh] of L) {
    g.fillStyle = c;
    g.beginPath();
    if (dy < -0.3) g.ellipse(x, y + dy * r + hh * r * 0.5, r, hh * r, 0, Math.PI, 0);
    else g.ellipse(x, y + dy * r, r * 1.02, hh * r * 0.5, 0, 0, Math.PI * 2);
    g.fill();
  }
  if (slash) {
    g.strokeStyle = '#d9342c'; g.lineWidth = r * 0.22;
    g.beginPath(); g.arc(x, y, r * 1.25, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(x - r * 0.88, y - r * 0.88); g.lineTo(x + r * 0.88, y + r * 0.88); g.stroke();
  }
}
function drawPumpkin (g, x, y, r) {
  g.fillStyle = '#e8781e';
  for (const k of [-0.5, 0.5, 0]) { g.beginPath(); g.ellipse(x + k * r * 0.7, y + r * 0.1, r * 0.6, r * 0.75, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#4a6a2a'; g.fillRect(x - r * 0.1, y - r * 0.9, r * 0.2, r * 0.35);
}
function drawHookah (g, x, y, r) {
  if (A.ADULT) {
    g.fillStyle = '#3fa8c9'; g.beginPath(); g.arc(x, y + r * 0.45, r * 0.45, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c9a24d'; g.fillRect(x - r * 0.08, y - r * 0.6, r * 0.16, r * 0.7); g.fillRect(x - r * 0.3, y - r * 0.62, r * 0.6, r * 0.1);
    g.fillStyle = '#a0522d'; g.fillRect(x - r * 0.16, y - r * 0.82, r * 0.32, r * 0.2);
    g.fillStyle = 'rgba(255,255,255,0.85)'; for (const k of [0, 1, 2]) { g.beginPath(); g.arc(x + r * (0.3 + k * 0.28), y - r * (1 + k * 0.08), r * (0.18 + k * 0.06), 0, Math.PI * 2); g.fill(); }
  } else {
    g.fillStyle = '#c9873a'; g.beginPath(); g.ellipse(x, y + r * 0.2, r * 0.55, r * 0.6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#a8692a'; g.fillRect(x - r * 0.3, y + r * 0.7, r * 0.6, r * 0.2);
    g.fillStyle = '#f4f1ea'; g.beginPath(); g.arc(x, y - r * 0.6, r * 0.28, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)'; for (const k of [0, 1]) { g.beginPath(); g.arc(x + r * (0.25 + k * 0.3), y - r * (1.05 + k * 0.1), r * 0.2, 0, Math.PI * 2); g.fill(); }
  }
}

function plane (tex, w, h, x, y, z, ry) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  m.position.set(x, y, z); m.rotation.y = ry;
  A.scene.add(m);
  F.objs.push(m);
  return m;
}

/* поворот для put/three: локальная +z смотрит по (dx, dz); локальная +x — вдоль (ax, az) */
const faceTo = (dx, dz) => Math.atan2(dx, dz);
const alongX = (ax, az) => Math.atan2(-az, ax);

function start (kind, site) {
  stop();
  if (!site) site = sites()[0];
  if (!site || !KINDS.includes(kind)) return false;
  const L = layout(site);
  F = { kind, site, L, objs: [], solids: [], hidden: [], fest: [], crowd: null, t: 0, sayT: rand(2, 4), say: null, puffT: 0, stage: null, hookahs: [], mascot: null, mascotN: 0, mascotT: 0, near: false };
  const kp = kind === 'hookah' && !A.ADULT ? 'hookahKids' : kind;
  const pal = PAL[kp];
  const M = mats(), G = [], GL = [];
  const gh = (x, z) => A.groundH(x, z);
  const { w, W, D, nx, nz, ax, az, aPass } = L;
  const inX = -nx, inZ = -nz;                             // вглубь
  const ryA = alongX(ax, az), ryIn = alongX(inX, inZ);
  const at = (list, geo, hex, a, y, b, ry = 0) => { const p = w(a, b); A.put(list, geo, hex, p.x, gh(p.x, p.z) + y, p.z, 0, ry); };

  // ── бетонные блоки по периметру, в переднем ряду — щель-проход ──
  const BL = 2.0, BH = 0.85, BW = 0.8;
  const run = (a0, b0, a1, b1) => {
    const p0 = w(a0, b0), p1 = w(a1, b1), dx = p1.x - p0.x, dz = p1.z - p0.z, len = Math.hypot(dx, dz);
    if (len < 0.5) return;
    const n = Math.max(1, Math.round(len / (BL + 0.05))), ry = alongX(dx / len, dz / len);
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n, x = p0.x + dx * k, z = p0.z + dz * k;
      A.put(G, new THREE.BoxGeometry(len / n - 0.06, BH, BW), i % 2 ? '#d9342c' : '#e8e2d6', x, gh(x, z) + BH / 2, z, 0, ry);   // блоки в красно-белую полоску — видно издалека
    }
    const s = A.obb((p0.x + p1.x) / 2, (p0.z + p1.z) / 2, len / 2, BW / 2 + 0.05, Math.atan2(dz, dx));
    F.solids.push(s);
  };
  const g2 = FEST.GAP / 2;
  run(-W, 0, aPass - g2, 0); run(aPass + g2, 0, W, 0);       // перед: проход
  run(W, 0, W, D); run(W, D, -W, D); run(-W, D, -W, 0);
  A.indexSolids();

  // ── арка над проходом: две мачты, баннер с названием, табличка «проход · курьерам» ──
  const title = nameOf(kind).toUpperCase();
  const mall = t('у ТЦ «{name}»', { name: site.mall });
  const pic = kind === 'burger' ? (g, x, y, r) => drawBurger(g, x, y, r, true) : kind === 'pumpkin' ? drawPumpkin : drawHookah;
  for (const s of [-1, 1]) at(G, new THREE.BoxGeometry(0.22, 5.6, 0.22), '#3a3a44', aPass + s * 3.4, 2.8, 0.7);
  {
    const p = w(aPass, 0.7);
    plane(banner([title, mall], pal[0], '#ffffff', 1024, 256, pic), 7, 1.75, p.x, gh(p.x, p.z) + 4.7, p.z, faceTo(nx, nz));
    const q = w(aPass, 0.15);
    plane(banner([t('проход · курьерам')], '#2b2a30', '#ffd84a', 512, 96), 2.4, 0.45, q.x, gh(q.x, q.z) + 2.5, q.z, faceTo(nx, nz));
    for (const s of [-1, 1]) at(G, new THREE.BoxGeometry(0.1, 2.6, 0.1), '#f2c230', aPass + s * (g2 + 0.15), 1.3, 0.15);
  }

  // ── гирлянды: мачты по периметру, нитки лампочек с провисом, пара ниток поперёк ──
  const poles = [];
  const ring = [[-W, 0], [W, 0], [W, D], [-W, D]];
  for (let i = 0; i < 4; i++) {
    const [a0, b0] = ring[i], [a1, b1] = ring[(i + 1) % 4], len = Math.hypot(a1 - a0, b1 - b0), n = Math.max(1, Math.round(len / 14));
    for (let k = 0; k < n; k++) {
      const a = a0 + (a1 - a0) * k / n, b = b0 + (b1 - b0) * k / n;
      const ai = clamp(a, -W + 0.8, W - 0.8), bi = clamp(b, 0.8, D - 0.8);
      if (i === 0 && Math.abs(ai - aPass) < 4) continue;
      poles.push([ai, bi]);
    }
  }
  for (const [a, b] of poles) at(G, new THREE.CylinderGeometry(0.07, 0.09, 5.2, 6), '#585460', a, 2.6, b);
  const bulb = (p0, p1, y0, y1, sag) => {
    const len = Math.hypot(p1.x - p0.x, p1.z - p0.z), n = Math.max(2, Math.round(len / 1.1));
    for (let k = 1; k < n; k++) {
      const q = k / n, x = p0.x + (p1.x - p0.x) * q, z = p0.z + (p1.z - p0.z) * q;
      const y = y0 + (y1 - y0) * q - sag * 4 * q * (1 - q);
      A.put(GL, new THREE.BoxGeometry(0.2, 0.26, 0.2), pal[k % pal.length], x, y, z);
    }
  };
  for (let i = 0; i < poles.length; i++) {
    const [a0, b0] = poles[i], [a1, b1] = poles[(i + 1) % poles.length];
    const p0 = w(a0, b0), p1 = w(a1, b1);
    bulb(p0, p1, gh(p0.x, p0.z) + 5.1, gh(p1.x, p1.z) + 5.1, 0.8);
  }
  for (let k = 1; k <= 3; k++) {
    const b = D * k / 4.2, p0 = w(-W + 0.8, b), p1 = w(W - 0.8, b);
    bulb(p0, p1, gh(p0.x, p0.z) + 5.1, gh(p1.x, p1.z) + 5.1, 1.4);
  }

  // ── сцена у задней стороны: помост, ферма, колонки, задник с названием ──
  const sw = Math.min(16, W * 1.2), sd = 6.5, sb = D - 1.2 - sd / 2;
  at(G, new THREE.BoxGeometry(sw, 1.2, sd), '#2b2a30', 0, 0.6, sb, ryA);
  at(G, new THREE.BoxGeometry(sw, 0.08, sd), '#4a4652', 0, 1.24, sb, ryA);
  for (const sa of [-1, 1]) for (const sbb of [-1, 1]) at(G, new THREE.BoxGeometry(0.25, 6.4, 0.25), '#9a9aa2', sa * (sw / 2 - 0.2), 3.2, sb + sbb * (sd / 2 - 0.2));
  for (const sbb of [-1, 1]) at(G, new THREE.BoxGeometry(sw, 0.3, 0.3), '#9a9aa2', 0, 6.3, sb + sbb * (sd / 2 - 0.2), ryA);
  for (const sa of [-1, 1]) at(G, new THREE.BoxGeometry(sd, 0.3, 0.3), '#9a9aa2', sa * (sw / 2 - 0.2), 6.3, sb, ryIn);
  for (const sa of [-1, 1]) { at(G, new THREE.BoxGeometry(1.2, 2.2, 1), '#1b1b20', sa * (sw / 2 + 0.9), 1.1, sb - sd / 2 + 0.8, ryA); at(G, new THREE.BoxGeometry(1, 1.4, 0.9), '#1b1b20', sa * (sw / 2 + 0.9), 2.9, sb - sd / 2 + 0.8, ryA); }
  for (let k = 0; k < 6; k++) at(GL, new THREE.BoxGeometry(0.35, 0.3, 0.35), pal[k % pal.length], -sw / 2 + 1 + k * (sw - 2) / 5, 5.95, sb - sd / 2 + 0.3);
  {
    const p = w(0, D - 1.3);
    const sub = kind === 'hookah' ? (A.ADULT ? t('гость фестиваля — Стёпа Тугарев') : t('Стёпа Тугарев и самовар-гигант'))
      : kind === 'pumpkin' ? t('конкурс тыкв-гигантов') : t('пицца круглая — совесть чистая');
    plane(banner([title, sub], pal[0], '#ffffff', 1024, 320, pic), sw - 1.2, 3.6, p.x, gh(p.x, p.z) + 3.4, p.z, faceTo(nx, nz));
  }
  F.stage = { a: 0, b: sb, sw, sd };

  // ── шатры вдоль боков: крыша-пирамида, стойки, прилавок ──
  const tents = [];
  for (const s of [-1, 1]) {
    for (let b = 7; b < D - sd - 5; b += 6.2) {
      const a = s * (W - 2.6);
      if (Math.abs(a - aPass) < 4 && b < 9) continue;
      tents.push([a, b]);
      const hex = pal[(tents.length) % pal.length];
      for (const ca of [-1, 1]) for (const cb of [-1, 1]) at(G, new THREE.BoxGeometry(0.08, 2.4, 0.08), '#e8e2d6', a + ca * 1.45, 1.2, b + cb * 1.45);
      at(G, new THREE.ConeGeometry(2.2, 1.3, 4), hex, a, 3.05, b, Math.PI / 4 + ryA);
      at(G, new THREE.BoxGeometry(2.8, 0.9, 0.7), '#f4f1ea', a, 0.45, b, s > 0 ? ryIn : ryIn + Math.PI);
    }
  }

  // ── что у каждого своё ──
  const free = [];                                        // где не ставить толпу: [a, b, r]
  free.push([aPass, 3, 3.2]);                             // у прохода — пятачок для клиента
  for (const [a, b] of tents) free.push([a, b, 2.6]);
  if (kind === 'hookah') buildHookah(G, at, sw, sb, sd, free);
  else if (kind === 'pumpkin') buildPumpkins(G, at, W, D, sd, free);
  else buildBurger(G, at, sw, sb, sd, pal, free);

  const geo = A.mergeGeos(G);
  const mesh = new THREE.Mesh(geo, M.vc);
  A.scene.add(mesh); F.objs.push(mesh);
  const gl = new THREE.Mesh(A.mergeGeos(GL), M.glow);
  A.scene.add(gl); F.objs.push(gl);

  crowd(free);
  if (kind === 'burger') spawnMascot();

  // ── припаркованные машины с площадки убираем на время фестиваля ──
  for (let i = A.TRAFFIC.length - 1; i >= 0; i--) {
    const c = A.TRAFFIC[i];
    if (!c.parked || c.gone || !c.mesh) continue;
    const q = local(c.x, c.z);                            // площадка, дорожка перед ней и 3 м вокруг
    if (!(Math.abs(q.a) < L.W + 3 && q.b > -FEST.LANE - 2 && q.b < L.D + 3)) continue;
    A.TRAFFIC.splice(i, 1);
    A.scene.remove(c.mesh);
    F.hidden.push(c);
  }
  // навигатор: куски улиц сквозь блоки — закрыты (game.js roadPath: NODES[i].fx — соседи, к кому нельзя)
  const c0 = L.w(0, L.D / 2), R0 = L.W + L.D + 60, NS = A.NODES;
  for (let i = 0; i < NS.length; i++) {
    const U = NS[i];
    if (Math.abs(U.x - c0.x) > R0 || Math.abs(U.z - c0.z) > R0) continue;
    for (const j of U.nb) {
      if (j < i && Math.abs(NS[j].x - c0.x) <= R0 && Math.abs(NS[j].z - c0.z) <= R0) continue;   // это ребро уже смотрели
      const Q = NS[j], len = Math.hypot(Q.x - U.x, Q.z - U.z), n = Math.max(1, Math.ceil(len));
      let hit = false;
      for (let k = 0; k <= n && !hit; k++) hit = insideRect(U.x + (Q.x - U.x) * k / n, U.z + (Q.z - U.z) * k / n, -0.2);
      if (!hit) continue;
      for (const [a, b] of [[U, j], [Q, i]]) { if (!a.fx) { a.fx = new Set(); F.fest.push(a); } a.fx.add(b); }
    }
  }
  F.start = { shifts: +A.Store.get('dlv-shifts', 0) || 0 };
  return true;
}

/* внутри блоков? (координаты a, b — с запасом m наружу) */
function local (x, z) {
  const L = F.L, p = L.w(0, 0), dx = x - p.x, dz = z - p.z;
  return { a: dx * L.ax + dz * L.az, b: -(dx * L.nx + dz * L.nz) };
}
function insideRect (x, z, m = 0) {
  if (!F) return false;
  const q = local(x, z);
  return Math.abs(q.a) < F.L.W + m && q.b > -m && q.b < F.L.D + m;
}

function buildHookah (G, at, sw, sb, sd, free) {
  const kids = !A.ADULT;
  // кальян (самовар) на сцене — в рост человека с лишним
  const big = (a, b, s) => {
    if (!kids) {
      at(G, new THREE.SphereGeometry(0.2 * s, 10, 8), '#3fa8c9', a, 1.25 + 0.2 * s, b);
      at(G, new THREE.CylinderGeometry(0.035 * s, 0.05 * s, 0.55 * s, 8), '#c9a24d', a, 1.25 + 0.62 * s, b);
      at(G, new THREE.CylinderGeometry(0.14 * s, 0.14 * s, 0.02 * s, 12), '#c9a24d', a, 1.25 + 0.82 * s, b);
      at(G, new THREE.CylinderGeometry(0.07 * s, 0.045 * s, 0.1 * s, 8), '#a0522d', a, 1.25 + 0.89 * s, b);
    } else {
      at(G, new THREE.CylinderGeometry(0.2 * s, 0.16 * s, 0.36 * s, 12), '#c9873a', a, 1.25 + 0.3 * s, b);
      at(G, new THREE.CylinderGeometry(0.12 * s, 0.14 * s, 0.1 * s, 10), '#a8692a', a, 1.25 + 0.07 * s, b);
      at(G, new THREE.CylinderGeometry(0.04 * s, 0.04 * s, 0.16 * s, 8), '#5a4a3a', a, 1.25 + 0.56 * s, b);
      at(G, new THREE.SphereGeometry(0.11 * s, 10, 8), '#f4f1ea', a, 1.25 + 0.68 * s, b);
    }
  };
  big(1.6, sb - 0.5, 2.6);
  F.hookahs.push({ a: 1.6, b: sb - 0.5, y: 1.25 + (kids ? 0.75 : 0.95) * 2.6, big: 1 });
  // Стёпа на сцене (heroes.js) — на улице его в эту смену нет
  try {
    const g = A.HEROES && A.HEROES.model('stepa');
    if (g) {
      const p = F.L.w(-0.6, sb - 0.6);
      g.position.set(p.x, A.groundH(p.x, p.z) + 1.25, p.z);
      g.rotation.y = faceTo(F.L.nx, F.L.nz);
      A.scene.add(g);
      F.stepa = g; F.objs.push(g);
      A.HEROES.hold('stepa', true);
    }
  } catch (e) { console.warn('[fest] stepa', e); }
  // кальяны (самовары) в толпе — на столиках
  const n = clamp(Math.round(F.L.W * F.L.D / 160), 4, 14);
  for (let i = 0; i < n; i++) {
    const a = rand(-F.L.W + 6, F.L.W - 6), b = rand(5, F.L.D - sd - 5);
    at(G, new THREE.CylinderGeometry(0.5, 0.5, 0.06, 10), '#e8e2d6', a, 0.72, b);
    at(G, new THREE.CylinderGeometry(0.06, 0.06, 0.7, 6), '#585460', a, 0.36, b);
    if (!kids) {
      at(G, new THREE.SphereGeometry(0.18, 8, 6), pick(['#3fa8c9', '#6fd0a0', '#c95a8a', '#e0b13f']), a, 0.93, b);
      at(G, new THREE.CylinderGeometry(0.03, 0.04, 0.5, 6), '#c9a24d', a, 1.3, b);
      at(G, new THREE.CylinderGeometry(0.06, 0.04, 0.09, 6), '#a0522d', a, 1.58, b);
    } else {
      at(G, new THREE.CylinderGeometry(0.17, 0.14, 0.3, 10), '#c9873a', a, 0.92, b);
      at(G, new THREE.SphereGeometry(0.09, 8, 6), '#f4f1ea', a, 1.18, b);
    }
    F.hookahs.push({ a, b, y: kids ? 1.25 : 1.65 });
    free.push([a, b, 0.9]);
  }
}

function buildPumpkins (G, at, W, D, sd, free) {
  const pump = (a, b, r, y0 = 0) => {
    const g = new THREE.SphereGeometry(r, 16, 10);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), ph = Math.atan2(z, x), k = 1 + 0.07 * Math.cos(ph * 10);
      P.setXYZ(i, x * k, y * 0.72, z * k);
    }
    g.computeVertexNormals();
    at(G, g, pick(['#e8781e', '#e06a18', '#f08a2a', '#d9661c']), a, y0 + r * 0.72, b);
    at(G, new THREE.CylinderGeometry(r * 0.07, r * 0.1, r * 0.3, 6), '#5a6a2a', a, y0 + r * 1.52, b);
  };
  const pal = (a, b, s) => at(G, new THREE.BoxGeometry(s, 0.16, s), '#b08a5a', a, 0.08, b);
  // победительница — на весах перед сценой, с лентой
  const wb = D - sd - 6.5;
  at(G, new THREE.BoxGeometry(4.6, 0.5, 4.6), '#9a9aa2', 0, 0.25, wb);
  at(G, new THREE.BoxGeometry(1.2, 1.6, 0.25), '#e8e2d6', 0, 0.8, wb - 2.6);
  pump(0, wb, 2.1, 0.5);
  at(G, new THREE.BoxGeometry(0.5, 1.4, 0.06), '#2f6fd8', 0, 1.3, wb - 2.05);
  free.push([0, wb, 3.4]);
  // остальные — рядами через 8 м по всей площадке, с номерками; у прохода — коридор
  let n = 0;
  const bs = wb - 4 > 9 ? [4.6, (4.6 + wb - 4) / 2, wb - 4] : [4.6, Math.max(4.6, wb - 4)];
  for (const b of [...new Set(bs.map(v => +v.toFixed(1)))]) for (let a = -W + 5; a <= W - 5; a += 8) {
    if (n >= 16 || (Math.abs(a - F.L.aPass) < 4 && b < 7) || (Math.abs(a) < 4.5 && b > wb - 4.5)) continue;
    const r = rand(0.7, 1.5), aa = a + rand(-1.2, 1.2);
    pal(aa, b, r * 2.2); pump(aa, b, r, 0.16);
    at(G, new THREE.BoxGeometry(0.5, 0.36, 0.04), '#f4f1ea', aa, 0.5, b - r * 1.2);
    free.push([aa, b, r + 1.4]);
    n++;
  }
  // тюки соломы
  for (let i = 0; i < 10; i++) {
    const a = rand(-W + 4, W - 4), b = rand(4, D - sd - 3);
    at(G, new THREE.BoxGeometry(1.2, 0.6, 0.8), '#d9b44a', a, 0.3, b, rand(0, 3));
    free.push([a, b, 1]);
  }
  F.pumpkins = n + 1;
}

function buildBurger (G, at, sw, sb, sd, pal, free) {
  // перечёркнутый бургер на сцене, три метра
  const L = [[1.6, 1.7, 0.6, '#e8b563'], [1.7, 1.7, 0.45, '#7a4526'], [1.75, 1.75, 0.2, '#ffd34d'], [1.72, 1.7, 0.25, '#5fbf4a'], [1.55, 1.55, 0.25, '#e04836']];
  let y = 1.3;
  const b0 = sb + 0.5;
  for (const [r0, r1, h, c] of L) { at(G, new THREE.CylinderGeometry(r0, r1, h, 16), c, 0, y + h / 2, b0); y += h; }
  at(G, new THREE.SphereGeometry(1.65, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#e8a84f', 0, y, b0);
  const ry = alongX(F.L.ax, F.L.az);
  for (const s of [-1, 1]) {
    const p = F.L.w(0, b0 - 1.9);
    A.put(G, new THREE.BoxGeometry(5, 0.5, 0.3), '#d9342c', p.x, A.groundH(p.x, p.z) + 3, p.z, 0, ry, s * 0.75);
  }
  // плакаты на блоках снаружи — перед и бока
  const texs = [
    banner([t('бургер — не еда')], '#f4f1ea', '#d9342c', 512, 256, (g, x, yy, r) => drawBurger(g, x, yy, r, true)),
    banner([t('долой булки без повода')], '#1d3f8f', '#ffd84a', 512, 256, (g, x, yy, r) => drawBurger(g, x, yy, r, true)),
    banner([t('Королеву — в отставку!')], '#f2c230', '#1d3f8f', 512, 256, (g, x, yy, r) => drawBurger(g, x, yy, r, true)),
  ];
  F.texs = texs;
  const { W, D, aPass, nx, nz } = F.L;
  let k = 0;
  for (let a = -W + 3; a < W - 2; a += 7) {
    if (Math.abs(a - aPass) < 4.5) continue;
    const p = F.L.w(a, -0.45);
    plane(texs[k++ % 3], 1.8, 0.9, p.x, A.groundH(p.x, p.z) + 1.35, p.z, faceTo(nx, nz));
    // стойка плаката
    at(G, new THREE.BoxGeometry(0.08, 1.9, 0.08), '#585460', a, 0.95, -0.4);
  }
  for (const s of [-1, 1]) for (let b = 5; b < D - 4; b += 9) {
    const p = F.L.w(s * (W + 0.45), b), dx = s * F.L.ax, dz = s * F.L.az;
    plane(texs[k++ % 3], 1.8, 0.9, p.x, A.groundH(p.x, p.z) + 1.35, p.z, faceTo(dx, dz));
  }
  // ведущий с мегафоном на сцене
  const host = A.makeHuman(A.makePerson(), { shirt: '#d9342c' });
  const p = F.L.w(-2.4, sb - 1.2);
  host.position.set(p.x, A.groundH(p.x, p.z) + 1.25, p.z);
  host.rotation.y = faceTo(F.L.nx, F.L.nz);
  A.scene.add(host); F.objs.push(host);
  F.host = host;
}

/* ─────────────── толпа ───────────────
   Инстансами: тело (ноги темнее, рубашка — цвет инстанса) и голова (цвет кожи).
   Две отрисовки на всю толпу. Подпрыгивают в такт; машина внутри — отпрыгивают. */
let BODY = null, HEAD = null, PIECE = null;
function crowdGeo () {
  if (BODY) return;
  const b = [];
  A.put(b, new THREE.BoxGeometry(0.16, 0.8, 0.18), '#4a4a52', -0.11, 0.4, 0);
  A.put(b, new THREE.BoxGeometry(0.16, 0.8, 0.18), '#4a4a52', 0.11, 0.4, 0);
  A.put(b, new THREE.BoxGeometry(0.46, 0.62, 0.26), '#ffffff', 0, 1.1, 0);
  A.put(b, new THREE.BoxGeometry(0.12, 0.58, 0.14), '#ffffff', -0.3, 1.12, 0, 0, 0, -0.12);
  A.put(b, new THREE.BoxGeometry(0.12, 0.58, 0.14), '#ffffff', 0.3, 1.12, 0, 0, 0, 0.12);
  BODY = A.mergeGeos(b);
  const h = [];
  A.put(h, new THREE.BoxGeometry(0.26, 0.28, 0.26), '#ffffff', 0, 1.56, 0);
  A.put(h, new THREE.BoxGeometry(0.28, 0.08, 0.28), '#3a2a20', 0, 1.72, -0.01);
  HEAD = A.mergeGeos(h);
}
function crowd (free) {
  crowdGeo();
  const { W, D } = F.L, sd = F.stage.sd;
  const area = (2 * W - 6) * (D - sd - 5);
  const n = clamp(Math.round(area / (FEST.CROWD_M2 * (F.kind === 'pumpkin' ? 1.6 : 1))), 30, FEST.CROWD_MAX);   // у тыкв — посвободнее
  const P = [];
  for (let k = 0; k < n * 6 && P.length < n; k++) {
    const a = rand(-W + 1.4, W - 1.4), b = rand(1.4, D - sd - 2.2);
    if (free.some(([fa, fb, r]) => (a - fa) ** 2 + (b - fb) ** 2 < r * r)) continue;
    if (P.some(q => (q.a - a) ** 2 + (q.b - b) ** 2 < 0.55)) continue;
    P.push({ a, b });
  }
  const body = new THREE.InstancedMesh(BODY, mats().crowd, P.length), head = new THREE.InstancedMesh(HEAD, mats().crowd, P.length);
  body.frustumCulled = head.frustumCulled = false;
  const c = new THREE.Color(), st = F.stage, toS = F.L.w(st.a, st.b);
  for (let i = 0; i < P.length; i++) {
    const q = P[i], p = F.L.w(q.a, q.b);
    q.x = p.x; q.z = p.z; q.y = A.groundH(p.x, p.z);
    q.ry = faceTo(toS.x - p.x, toS.z - p.z) + rand(-0.6, 0.6);
    q.s = rand(0.88, 1.1); q.ph = rand(0, 6.28); q.amp = Math.random() < 0.55 ? rand(0.08, 0.3) : 0.02; q.hop = 0; q.vx = 0; q.vz = 0;
    body.setColorAt(i, c.set(pick(SHIRTS)));
    head.setColorAt(i, c.set(pick(SKINS)));
  }
  F.crowd = { P, body, head, m: new THREE.Matrix4(), r: new THREE.Matrix4(), t: 0 };
  pose(0, true);
  A.scene.add(body, head);
  F.objs.push(body, head);
}
function pose (dt, all) {
  const C = F.crowd;
  C.t += dt;
  const beat = C.t * 4.2;
  const { m, r } = C;
  for (let i = 0; i < C.P.length; i++) {
    const q = C.P[i];
    if (q.hop > 0) {                                    // отпрыгнул от машины
      q.hop = Math.max(0, q.hop - dt);
      q.x += q.vx * dt; q.z += q.vz * dt;
      q.vx *= 0.9; q.vz *= 0.9;
    }
    const y = q.y + Math.max(0, Math.sin(beat + q.ph)) * q.amp + (q.hop > 0 ? Math.sin(q.hop / 0.6 * Math.PI) * 0.9 : 0);
    r.makeRotationY(q.ry + (all ? 0 : Math.sin(beat * 0.25 + q.ph) * 0.15));
    m.makeScale(q.s, q.s, q.s).premultiply(r);
    m.setPosition(q.x, y, q.z);
    C.body.setMatrixAt(i, m); C.head.setMatrixAt(i, m);
  }
  C.body.instanceMatrix.needsUpdate = true; C.head.instanceMatrix.needsUpdate = true;
}
/* машина внутри (трамплин, баг): кто рядом — отпрыгивает в сторону, не давится */
function dodge () {
  const V = A.V, C = F.crowd;
  for (const q of C.P) {
    const dx = q.x - V.x, dz = q.z - V.z, d = Math.hypot(dx, dz);
    if (d > 4.2 || q.hop > 0.2) continue;
    const k = 7 / (d || 1);
    q.vx = dx * k; q.vz = dz * k; q.hop = 0.6;
    F.dodged = (F.dodged || 0) + 1;
  }
}

/* ─────────────── маскот «Королевы Бургеров» ─────────────── */
function mascotMesh () {
  const g = new THREE.Group(), b = [];
  const L = [[0.95, 0.42, '#e8b563', 0.9], [1.0, 0.3, '#7a4526', 1.27], [1.0, 0.1, '#ffd34d', 1.47], [1.02, 0.14, '#5fbf4a', 1.59], [0.9, 0.14, '#e04836', 1.73]];
  for (const [r, h, c, y] of L) A.put(b, new THREE.CylinderGeometry(r, r * 1.03, h, 14), c, 0, y, 0);
  A.put(b, new THREE.SphereGeometry(1.0, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), '#e8a84f', 0, 1.8, 0);
  for (let i = 0; i < 7; i++) A.put(b, new THREE.SphereGeometry(0.06, 5, 4), '#fff3d6', Math.cos(i * 2.1) * 0.65, 2.55, Math.sin(i * 2.1) * 0.65);
  for (const s of [-1, 1]) {
    A.put(b, new THREE.SphereGeometry(0.17, 8, 6), '#ffffff', 0.32 * s, 2.15, 0.82);
    A.put(b, new THREE.SphereGeometry(0.08, 6, 5), '#1b1410', 0.32 * s, 2.15, 0.97);
  }
  // корона — «Королева»
  A.put(b, new THREE.CylinderGeometry(0.42, 0.42, 0.22, 10, 1, true), '#f2c230', 0, 2.9, 0);
  for (let i = 0; i < 5; i++) A.put(b, new THREE.ConeGeometry(0.09, 0.28, 4), '#f2c230', Math.cos(i * 1.257) * 0.4, 3.12, Math.sin(i * 1.257) * 0.4);
  const legs = [];
  for (const s of [-1, 1]) {
    const lg = [];
    A.put(lg, new THREE.BoxGeometry(0.2, 0.75, 0.2), '#2b2a30', 0, -0.37, 0);
    const l = new THREE.Mesh(A.mergeGeos(lg), mats().vc);
    l.position.set(0.35 * s, 0.75, 0);
    g.add(l); legs.push(l);
  }
  g.add(new THREE.Mesh(A.mergeGeos(b), mats().vc));
  g.userData.legs = legs;
  return g;
}
function spawnMascot () {
  const L = F.L, g = mascotMesh();
  const m = { grp: g, a: L.aPass + rand(-8, 8), dir: Math.random() < 0.5 ? -1 : 1, b: -3.4, ph: 0, down: 0, vx: 0, vy: 0, vz: 0, x: 0, z: 0, y: 0, spin: 0, gone: 0 };
  const p = L.w(m.a, m.b);
  m.x = p.x; m.z = p.z; m.y = A.groundH(p.x, p.z);
  g.position.set(m.x, m.y, m.z);
  A.scene.add(g);
  F.mascot = m;
}
function dropMascot () {
  const m = F && F.mascot;
  if (!m) return;
  A.scene.remove(m.grp);
  m.grp.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
  F.mascot = null;
}
function mascotStep (dt, dC) {
  if (!F.mascot) {
    if (F.mascotT > 0 && (F.mascotT -= dt) <= 0) spawnMascot();
    return;
  }
  const m = F.mascot, L = F.L, V = A.V, g = m.grp;
  if (m.down > 0) {                                      // детская: катится колесом, встаёт
    m.down -= dt;
    m.vy -= 18 * dt;
    m.x += m.vx * dt; m.z += m.vz * dt; m.y += m.vy * dt;
    const fl = A.groundH(m.x, m.z);
    if (m.y < fl) { m.y = fl; m.vy = Math.abs(m.vy) * 0.4; m.vx *= 0.7; m.vz *= 0.7; }
    g.rotation.z += m.spin * dt; m.spin *= 0.985;
    g.position.set(m.x, m.y, m.z);
    if (m.down <= 0) {
      g.rotation.z = 0; m.y = fl;
      const q = local(m.x, m.z); m.a = clamp(q.a, -L.W + 2, L.W - 2); m.b = -3.4;
      if (dC < 80) say(g, t('я ещё вернусь! с картошкой!'), 3.3);
    }
    return;
  }
  // гуляет по дорожке перед проходом, туда-сюда
  m.ph += dt;
  m.a += m.dir * 1.1 * dt;
  if (Math.abs(m.a - L.aPass) > 14 || Math.abs(m.a) > L.W - 2) { m.dir = m.a > L.aPass ? -1 : 1; m.a += m.dir * 0.1; }
  const p = L.w(m.a, m.b);
  const tx = p.x, tz = p.z;
  m.x += (tx - m.x) * Math.min(1, dt * 3); m.z += (tz - m.z) * Math.min(1, dt * 3);
  m.y = A.groundH(m.x, m.z);
  g.position.set(m.x, m.y + Math.abs(Math.sin(m.ph * 5)) * 0.08, m.z);
  g.rotation.y = faceTo(L.ax * m.dir, L.az * m.dir) + Math.sin(m.ph * 2) * 0.2;
  g.rotation.z = Math.sin(m.ph * 5) * 0.06;
  const [l0, l1] = g.userData.legs;
  l0.rotation.x = Math.sin(m.ph * 10) * 0.6; l1.rotation.x = -l0.rotation.x;
  if (dC < 60 && Math.random() < dt * 0.15) say(g, pick([t('бургеры тоже люди!'), t('не угнетай!'), t('съешь бургер, курьер!'), t('Королева всё видит')]), 3.3);
  // наезд
  const sp = Math.hypot(V.vx, V.vz);
  if (sp < 3) return;
  const fx = Math.sin(V.h), fz = Math.cos(V.h), dx = m.x - V.x, dz = m.z - V.z;
  if (Math.abs(dx * fx + dz * fz) > A.CAR_L + 0.9 || Math.abs(dx * fz - dz * fx) > A.CAR_W + 0.9) return;
  hitMascot(m, sp);
}
function hitMascot (m, sp) {
  const V = A.V, S = A.S;
  F.mascotN++;
  const paid = F.mascotN <= FEST.MASCOT_MAX;
  if (paid) {
    const cash = A.CASH(FEST.MASCOT_PAY);
    S.burgers = (S.burgers || 0) + 2;
    S.money += cash;
    if (!S.freeRun) A.addWallet(cash);
    A.popBonus(t('маскот угнетён!'), t('+2 респекта · премия +{money}', { money: A.money(cash) }));
  } else A.toast(t('маскот угнетён — премии на сегодня кончились'));
  try { A.Snd.squish(); A.Snd.blip(140, 0.25, 'square', 0.08); } catch (e) { /* звук не обязателен */ }
  if (F.host && Math.hypot(F.host.position.x - V.x, F.host.position.z - V.z) < 160) say(F.host, pick([t('УРА! Минус булка!'), t('Вот это угнетение!'), t('Пицца победила!')]), 3.4);
  if (A.ADULT) {
    // лопается на ингредиенты — большие куски
    for (let i = 0; i < 3; i++) A.gibBurger(m.x + rand(-0.6, 0.6), m.z + rand(-0.6, 0.6));
    const cols = [0xe8b563, 0x7a4526, 0xffd34d, 0x5fbf4a, 0xe04836, 0xe8a84f, 0xf2c230];
    if (!PIECE) PIECE = [new THREE.CylinderGeometry(0.8, 0.85, 0.3, 10), new THREE.CylinderGeometry(0.6, 0.6, 0.2, 10), new THREE.BoxGeometry(1.3, 0.1, 1.3)];
    cols.forEach((c, i) => {
      const piece = new THREE.Mesh(PIECE[i % PIECE.length], new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
      piece.position.set(m.x, m.y + rand(0.8, 2.2), m.z);
      A.fxAdd(piece, { vx: V.vx * 0.5 + rand(-6, 6), vy: rand(6, 12), vz: V.vz * 0.5 + rand(-6, 6), life: 3, max: 3, gravity: 18, spin: rand(-8, 8) }, m.y);
    });
    dropMascot();
    F.mascotT = FEST.MASCOT_BACK;
  } else {
    // детская: отлетает и катится колесом, потом встаёт
    const k = Math.min(1.4, sp / 12);
    m.vx = V.vx * 0.8 * k + rand(-2, 2); m.vz = V.vz * 0.8 * k + rand(-2, 2); m.vy = 6 + sp * 0.2;
    m.spin = 9 * (Math.random() < 0.5 ? -1 : 1); m.down = 2.6;
  }
}

/* реплика над головой: старую убираем */
function say (grp, text, y) {
  if (F.say && F.say.parent) { F.say.parent.remove(F.say); F.say.material.dispose(); }
  F.say = A.sayBubble(grp, text, F.kind === 'burger' ? '#d9342c' : F.kind === 'pumpkin' ? '#b0561a' : '#8a3b9a', y);
  F.sayLeft = 3.2;
}
const LINES = {
  hookah: [N_('Бизнес — это дым, брат!'), N_('Новый табак: «Пепперони». Будущее!'), N_('Кто последний на чашу?'), N_('Дуем кольцами, Солнечный!'), N_('Болгарка тоже продаётся. По-братски.')],
  hookahKids: [N_('Самовар — это бизнес, брат!'), N_('Новый чай: «Пепперони». Будущее!'), N_('Кто последний за бубликом?'), N_('Пар — это тоже облако!'), N_('Болгарка тоже продаётся. По-братски.')],
  pumpkin: [N_('Тыква номер три — 412 кило!'), N_('Новый рекорд Солнечного!'), N_('Пирог из тыквы — у шатров!'), N_('Кто вырастил больше — тот и молодец!'), N_('Не трогайте тыкву руками, это экспонат!')],
  burger: [N_('Пицца круглая — совесть чистая!'), N_('Долой булки без повода!'), N_('Королеву — в отставку!'), N_('Бургер — это не еда, это бутерброд!'), N_('Сбей маскота — получи респект!')],
};

/* ─────────────── каждый кадр ─────────────── */
export function step (dt) {
  if (!F || !A) return;
  const V = A.V, c = F.L.w(0, F.L.D / 2), dC = Math.hypot(c.x - V.x, c.z - V.z) - Math.max(F.L.W, F.L.D / 2);
  F.t += dt;
  const show = dC < FEST.SHOW_R;
  if (F.crowd) {
    F.crowd.body.visible = F.crowd.head.visible = show;
    if (show && dC < 240) pose(dt);
    if (insideRect(V.x, V.z, 1.5)) dodge();
  }
  if (F.sayLeft > 0 && (F.sayLeft -= dt) <= 0 && F.say) { if (F.say.parent) F.say.parent.remove(F.say); F.say.material.dispose(); F.say = null; }
  if (dC < 140 && (F.sayT -= dt) <= 0) {
    F.sayT = rand(5, 9);
    const who = F.kind === 'hookah' ? F.stepa : F.kind === 'burger' ? F.host : null;
    const pool = LINES[F.kind === 'hookah' && !A.ADULT ? 'hookahKids' : F.kind];
    if (who) say(who, t(pick(pool)), 2.9);
    else if (F.kind === 'pumpkin' && F.crowd && F.crowd.P.length) {
      // объявляют со сцены — пузырь над сценой
      const p = F.L.w(0, F.stage.b);
      if (!F.mic) { F.mic = new THREE.Group(); F.mic.position.set(p.x, A.groundH(p.x, p.z) + 1.3, p.z); A.scene.add(F.mic); F.objs.push(F.mic); }
      say(F.mic, t(pick(pool)), 3.2);
    }
  }
  if (F.stepa) {
    const u = F.stepa.userData;
    if (u && u.armL) u.armL.rotation.x = -0.4 + Math.sin(F.t * 1.6) * 0.5;
  }
  // дым кальянов / пар самоваров
  if (F.kind === 'hookah' && dC < 260 && (F.puffT -= dt) <= 0) {
    F.puffT = rand(0.35, 0.7);
    const h = Math.random() < 0.3 ? F.hookahs[0] : pick(F.hookahs);
    if (h) puff(h);
  }
  if (F.kind === 'burger') mascotStep(dt, dC);
}
function puff (h) {
  const p = F.L.w(h.a, h.b), big = h.big ? 2.2 : 1;
  if (!A.ADULT) { for (let k = 0; k < (h.big ? 4 : 2); k++) A.steam(p.x + rand(-0.2, 0.2), h.y - 0.4 + k * 0.3, p.z + rand(-0.2, 0.2)); return; }
  const n = h.big ? 7 : 3, gy = A.groundH(p.x, p.z);
  for (let k = 0; k < n; k++) {
    const m = new THREE.Mesh(A.puffGeo, new THREE.MeshBasicMaterial({ color: k % 3 ? 0xe9e7e2 : 0xf6f4f0, transparent: true, opacity: 0.6, depthWrite: false }));
    m.position.set(p.x + rand(-0.3, 0.3), gy + h.y + rand(0, 0.4), p.z + rand(-0.3, 0.3));
    m.scale.setScalar(rand(0.5, 0.9) * big);
    A.fxAdd(m, { vx: rand(-0.6, 0.6), vz: rand(-0.6, 0.6), vy: rand(0.5, 1.1), life: rand(3, 4.5), max: 4.5, grow: 0.42 });   // к концу — в ~6 раз больше, уже прозрачное
  }
}

/* ─────────────── убрать ─────────────── */
export function stop () {
  if (!F) return;
  for (const o of F.objs) {
    if (o.parent) o.parent.remove(o);
    if (o === F.stepa) continue;
    o.traverse(q => {
      if (q.isSprite) { q.material.dispose(); return; }
      if (!q.isMesh && !q.isInstancedMesh) return;
      if (q.geometry !== BODY && q.geometry !== HEAD) q.geometry.dispose();
      for (const m of [].concat(q.material)) { if (m.map) m.map.dispose(); if (!m.userData.keep) m.dispose(); }
    });
  }
  if (F.stepa) { A.dropMesh(F.stepa); if (A.HEROES) A.HEROES.hold('stepa', false); }
  if (F.host) A.dropMesh(F.host);
  for (const tx of F.texs || []) tx.dispose();
  dropMascot();
  if (F.say && F.say.parent) F.say.parent.remove(F.say);
  if (F.solids.length) {
    for (const s of F.solids) { const i = A.SOLIDS.indexOf(s); if (i >= 0) A.SOLIDS.splice(i, 1); }
    A.indexSolids();
  }
  for (const c of F.hidden) if (!c.gone && !A.TRAFFIC.includes(c)) { A.TRAFFIC.push(c); A.scene.add(c.mesh); }
  for (const N of F.fest) delete N.fx;
  F = null;
}

/* ─────────────── объявление ─────────────── */
export function announce () {
  if (!F) return;
  const k = F.kind, m = F.site.mall;
  const lines = {
    hookah: A.ADULT
      ? [t('сегодня у ТЦ «{mall}» фестиваль кальянщиков, Стёпа на сцене. все заказы — туда и рядом, отдаёшь у прохода. по толпе не гони — там блоки', { mall: m })]
      : [t('сегодня у ТЦ «{mall}» фестиваль самоваров, Стёпа на сцене. все заказы — туда и рядом, отдаёшь у прохода', { mall: m })],
    pumpkin: [t('у ТЦ «{mall}» фестиваль тыквы — тыквы размером с твою машину. проезд по дорожке вдоль блоков', { mall: m })],
    burger: A.ADULT
      ? [t('сегодня День угнетения бургеров! у ТЦ «{mall}» митинг против «Королевы Бургеров». кто берёт пиццу вместо бургера — платит больше. увидишь ихнего маскота — сам знаешь, что делать)', { mall: m })]
      : [t('сегодня День угнетения бургеров! у ТЦ «{mall}» митинг против «Королевы Бургеров». кто берёт пиццу вместо бургера — платит больше. увидишь маскота — толкни его, он мягкий)', { mall: m })],
  };
  const sub = k === 'hookah' ? t('парковка ТЦ «{mall}» · заказы — туда и рядом', { mall: m })
    : k === 'pumpkin' ? t('парковка ТЦ «{mall}» · тыквы-гиганты, конкурс', { mall: m })
      : t('парковка ТЦ «{mall}» · заказы «вместо бургера» ×{k}', { mall: m, k: String(FEST.BURGER_K).replace('.', ',') });
  const id = F;
  setTimeout(() => { if (F === id && A.chat) A.chat(lines[k][0]); }, 2500);
  setTimeout(() => { if (F === id) A.popBonus(nameOf(k) + '!', sub); }, 8000);
}

/* ─────────────── для orders.js ─────────────── */
export function near () {
  if (!F || F.kind !== 'hookah') return null;
  const c = F.L.w(0, F.L.D / 2);
  return { x: c.x, z: c.z, r: FEST.NEAR_R };
}
/* n — сколько заказов смены уже собрано (0 — первый). Первый — всегда на фестиваль */
export function passSpec (n) {
  if (!F || F.kind !== 'hookah') return null;
  if (n > 0 && Math.random() >= FEST.PASS_SHARE) return null;
  if (F.lastPass === n - 1 && F.passRow >= 2) { F.passRow = 0; return null; }   // не больше двух подряд
  F.passRow = F.lastPass === n - 1 ? (F.passRow || 1) + 1 : 1;
  F.lastPass = n;
  const p = F.L.w(F.L.aPass, 0.35);
  return {
    x: p.x, z: p.z,
    addr: t('{fest} · парковка ТЦ «{mall}», проход', { fest: nameOf('hookah'), mall: F.site.mall }),
    why: t('{fest}: отдать у прохода, внутрь не проехать', { fest: nameOf('hookah') }),
  };
}
export function burgerRoll () {
  if (!F || F.kind !== 'burger') return 0;
  return Math.random() < FEST.BURGER_SHARE ? FEST.BURGER_K : 0;
}
export const active = () => (F ? { kind: F.kind, mall: F.site.mall } : null);

/* ─────────────── отладка: __dlv.FEST ─────────────── */
export const DEBUG = {
  FEST,
  sites: () => sites().map(s => ({ mall: s.mall, di: s.di, x: Math.round(s.x), z: Math.round(s.z), w: +(s.hu * 2).toFixed(1), d: +(s.hv * 2).toFixed(1), area: s.area })),
  /* запустить сейчас: kind — hookah | pumpkin | burger, site — номер из sites() или имя ТЦ */
  start: (kind = 'hookah', site = 0) => {
    const S = sites(), s = typeof site === 'string' ? S.find(q => q.mall === site) : S[site];
    const ok = start(kind, s);
    if (ok) announce();
    return ok ? DEBUG.info() : false;
  },
  /* на следующую смену (shiftStart) — этот */
  next: (kind = 'hookah', site) => { const S = sites(); ST.forced = { kind, site: typeof site === 'string' ? S.find(q => q.mall === site) : S[site] }; return true; },
  stop: () => { stop(); return true; },
  info: () => {
    if (!F) return null;
    const L = F.L, c = L.w(0, L.D / 2), pass = L.w(L.aPass, 0), out = L.w(L.aPass, -3.5);
    return {
      kind: F.kind, mall: F.site.mall, di: F.site.di, center: [Math.round(c.x), Math.round(c.z)], w: +(L.W * 2).toFixed(1), d: +L.D.toFixed(1),
      pass: [+pass.x.toFixed(1), +pass.z.toFixed(1)], outside: [+out.x.toFixed(1), +out.z.toFixed(1)], nx: +L.nx.toFixed(3), nz: +L.nz.toFixed(3), ax: +L.ax.toFixed(3), az: +L.az.toFixed(3),
      crowd: F.crowd ? F.crowd.P.length : 0, solids: F.solids.length, parkedHidden: F.hidden.length, navClosed: F.fest.reduce((a, N) => a + N.fx.size, 0) / 2, objs: F.objs.length,
      hookahs: F.hookahs.length, pumpkins: F.pumpkins || 0, mascot: !!F.mascot, mascotHits: F.mascotN, dodged: F.dodged || 0,
    };
  },
  /* дорожка: точки по кругу в 3,5 м за блоками — сколько свободны для машины (r — полуширина) */
  lane: (off = 3.5, r = 1.1) => {
    if (!F) return null;
    const { W, D } = F.L, pts = [];
    const ring = [[-W - off, -off], [W + off, -off], [W + off, D + off], [-W - off, D + off]];
    for (let i = 0; i < 4; i++) {
      const [a0, b0] = ring[i], [a1, b1] = ring[(i + 1) % 4], len = Math.hypot(a1 - a0, b1 - b0);
      for (let s = 0; s < len; s += 2) { const p = F.L.w(a0 + (a1 - a0) * s / len, b0 + (b1 - b0) * s / len); pts.push({ side: i, x: p.x, z: p.z, ok: !A.solidAt(p.x, p.z, r) && !A.inHouse(p.x, p.z, r), lot: A.inPoly(p.x, p.z, F.site.lot.p) }); }
    }
    const by = [0, 1, 2, 3].map(i => { const q = pts.filter(p => p.side === i); return { n: q.length, free: q.filter(p => p.ok).length, inLot: q.filter(p => p.lot).length }; });
    return { n: pts.length, free: pts.filter(p => p.ok).length, sides: by, front: by[0] };
  },
  inside: (x, z) => insideRect(x, z),
  local: (x, z) => (F ? local(x, z) : null),
  crowdAt: () => (F && F.crowd ? F.crowd.P.map(q => [+q.x.toFixed(1), +q.z.toFixed(1)]) : []),
  mascot: () => (F && F.mascot ? { x: +F.mascot.x.toFixed(1), z: +F.mascot.z.toFixed(1), down: F.mascot.down } : null),
  get F () { return F; },
};
