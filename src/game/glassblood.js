/* ──────────────────────────────────────────────────────────────────────────
   Кровь на лобовом своей машины (0п41, автор 24.10.2026: «крови так и нет на лобовом стекле, как раньше была когда-то,
   от первого лица»). Только взрослая версия (game.js зовёт под GORE_ON). Правила словами — docs/CAREER.md «Кровь на машине».

   Сбил человека мордой — на лобовом брызги: пятна растут за ~0,25 с, мелкие капли вокруг, потёки ползут вниз.
   Дворники машут, пока в их секторах кровь: щётка не стирает всё за раз — тащит кровь за собой (размазывает дугой) и
   каждым проходом снимает часть (GB.WIPE); за 3—5 взмахов сектор чистый — дворники ложатся. Углы стекла, куда щётка
   не достаёт, остаются в крови (как у настоящей машины). В дождь стекло ещё и смывает понемногу.

   Одна картинка (холст GB.W × GB.H) — и снаружи, и изнутри:
   • снаружи — на лобовом настоящей «Семёрки»: её слой крови (realcar.js bloodLayer) показывает эту картинку;
   • из-за руля — салон игры (camview.js, у «Семёрки» свой салон выключен): стекло-плоскость в раме лобового с той же
     картинкой и дворники салона, что машут вместе с настоящими (wipers.js — угол и опоры).
   Холст: x — поперёк стекла (слева — правый борт машины), y — вверх по стеклу; как UV лобового (tools/realcar.mjs).

     hit(car, wx, wz)   — сбил человека (точка — мир); не мордой или лобового нет — ничего
     wet()              — «дождь» для дворников (game.js: max с дождём): пока в секторах щёток кровь
     step(dt, car, rain) — каждый кадр после дворников: капли, щётки, проверка «чисто», слой снаружи
     cab(root, g) / cabStep(h, car) — стекло и дворники в салоне (camview.js build / cab)
   Кадр: без новых отрисовок, пока стекло чистое; с кровью — одна плоскость (снаружи — слой realcar.js, изнутри — своя).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { WIPE } from './wipers.js';

/* W, H — холст; WET — сила «дождя» для дворников; WIPE — сколько щётка снимает с пройденного (доля за кадр-шаг);
   SMEAR — какую долю снятого тащит перед собой (размазывает); CHECK — с между проверками «чисто»; LEFT — меньше стольких точек в секторах — чисто;
   R0…R1 — где щётка по длине дворника (доли; R1 > 1 — с концом щётки и брызгами, чтобы верх стекла не оставался);
   RAIN — с дождя сила смывает (доля за с при ливне 1) */
export const GB = { W: 128, H: 64, WET: 0.6, SMEAR: 0.6, WIPE: 0.3, R0: 0.2, R1: 1.15, CHECK: 0.5, LEFT: 6, RAIN: 0.05, RAIN_FROM: 0.3 };
export const STATS = { hits: 0, wipe: false, any: false, left: 0, cleaned: 0 };

let ON = false;
export function setOn (v) { ON = !!v; }

const ST = { car: null, c: null, x: null, tmp: null, tx: null, mask: null, maskKey: '', drops: [], wipe: false, any: false, chk: 0, a: 0, dir: 0, tex: null };
const RED = ['#7d0a10', '#9b0f15', '#b3161b'];

/* холст и текстура — при первой нужде (кровь или салон) */
function ensure () {
  if (ST.c || typeof document === 'undefined') return ST.c;
  const c = document.createElement('canvas');
  c.width = GB.W; c.height = GB.H;
  ST.c = c; ST.x = c.getContext('2d', { willReadFrequently: true });
  const t = document.createElement('canvas');
  t.width = GB.W; t.height = GB.H;
  ST.tmp = t; ST.tx = t.getContext('2d');
  const tx = new THREE.CanvasTexture(c);
  tx.magFilter = THREE.NearestFilter; tx.colorSpace = THREE.SRGBColorSpace;
  ST.tex = tx;
  return c;
}
function clear () {
  if (ST.x) ST.x.clearRect(0, 0, GB.W, GB.H);
  ST.drops.length = 0; ST.wipe = false; ST.any = false;
  if (ST.tex) ST.tex.needsUpdate = true;
  STATS.wipe = STATS.any = false;
}
/* новая машина (смена, «ещё раз», воскрешение, ремонт у Дяди Жени) — стекло чистое */
function own (car) {
  if (ST.car === car) return;
  ST.car = car;
  clear();
}

/* лобовое: размеры (м) и опоры дворников (wipers.js) — по настоящему стеклу «Семёрки» или по стеклу кузова игры */
function glassOf (car) {
  const u = car && car.userData, W = u && u.wipers, F = (u && u.realGlass) || (W && W.arms && W.arms[0] && W.arms[0].F) || null;
  const w0 = F ? (F.w0 || F.w) : 1.5, H = F ? F.H : 0.6;
  const arms = W && W.arms ? W.arms.filter(m => m.F === F) : null;
  return { w0, H, arms: arms && arms.length ? arms : null, a: W ? W.a || 0 : 0 };
}
const FALLBACK = [{ px: 0.36, len: 0.378 }, { px: 0.036, len: 0.378 }];   // в долях ширины — как wipers.js у «Семёрки»

/* сбил человека: точка в осях машины — мордой ли (как realcar.js blood: доля длины против доли ширины) */
export function hit (car, wx, wz) {
  if (!ON || !car || !car.userData || typeof document === 'undefined') return;
  own(car);
  const u = car.userData, cg = u.cg;
  if (cg && cg.panes && cg.panes.some(p => p.k === 'f' && p.st === 2)) return;   // лобового нет — не на что
  car.updateMatrixWorld();
  const e = car.matrixWorld.elements, dx = wx - e[12], dz = wz - e[14];
  // в оси машины: x — влево (столбец 0), z — вперёд (столбец 2); масштаб машины — 1
  const lx = (dx * e[0] + dz * e[2]) / Math.max(1e-6, e[0] * e[0] + e[2] * e[2]);
  const lz = (dx * e[8] + dz * e[10]) / Math.max(1e-6, e[8] * e[8] + e[10] * e[10]);
  const HL = (u.hl || 2.2) * 0.98, W2 = 0.95;
  if (!(lz > 0 && Math.abs(lz) / HL >= Math.abs(lx) / W2)) return;               // не мордой — на стекло не летит
  if (!ensure()) return;
  splash(Math.sign(lx) || 0);
  STATS.hits++;
}
/* брызги: со стороны удара гуще; каждая растёт от точки до своего размера за ~0,25 с; мелкие вокруг; потёки */
function splash (side) {
  const W = GB.W, H = GB.H, cx = W * (0.5 + side * 0.25);
  for (let i = 0; i < 22; i++) {
    const x = Math.max(2, Math.min(W - 2, cx + (Math.random() - 0.5) * W * 0.9)), y = H * (0.1 + Math.random() * 0.8);
    ST.drops.push({ x, y, r: 0.5, R: 3 + Math.random() * 7, vy: 0, t: 0, life: 0.3, hex: RED[i % 3] });
    for (let k = 0; k < 5; k++) ST.drops.push({ x: x + (Math.random() - 0.5) * 22, y: y + (Math.random() - 0.5) * 14, r: 0.3, R: 0.6 + Math.random() * 1.2, vy: 0, t: 0, life: 0.2, hex: RED[k % 3] });
    if (Math.random() < 0.5) ST.drops.push({ x, y, r: 1.4, R: 1.4, vy: 8 + Math.random() * 12, t: 0, life: 1.5 + Math.random() * 2.5, hex: RED[0] });
  }
  ST.wipe = ST.any = true; ST.chk = GB.CHECK;
  STATS.wipe = STATS.any = true;
}
function drops (dt) {
  if (!ST.drops.length) return;
  const x = ST.x;
  for (const d of ST.drops) {
    d.t += dt;
    const k = Math.min(1, d.t / Math.max(0.05, d.life));
    if (d.vy) { d.y += d.vy * dt * (1 - k * 0.7); d.r = d.R * (1 - k * 0.4); } else d.r = d.R * Math.min(1, d.t / 0.25);
    x.fillStyle = d.hex;
    x.beginPath(); x.arc(d.x, d.y, Math.max(0.5, d.r), 0, Math.PI * 2); x.fill();
  }
  ST.drops = ST.drops.filter(d => d.t < d.life && d.y < GB.H + 4);
}

/* в метрах стекла (x — влево, y — вверх по стеклу от низа) → пиксели холста */
function metric (x, g) { x.setTransform(GB.W / g.w0, 0, 0, -GB.H / g.H, GB.W / 2, GB.H); }
/* сектор щётки: от угла a0 до a1 вокруг опоры px, радиусы r0…r1 (дворник лежит к −x, поднимается к +y) */
function sector (x, px, r0, r1, a0, a1) {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1), n = Math.max(2, Math.ceil((hi - lo) / 0.08));
  x.beginPath();
  for (let i = 0; i <= n; i++) { const a = lo + (hi - lo) * i / n; x.lineTo(px - Math.cos(a) * r1, Math.sin(a) * r1); }
  for (let i = n; i >= 0; i--) { const a = lo + (hi - lo) * i / n; x.lineTo(px - Math.cos(a) * r0, Math.sin(a) * r0); }
  x.closePath();
}
const armsOf = g => g.arms ? g.arms.map(m => ({ px: m.px, len: m.len, k: m.k || 1 })) : FALLBACK.map(f => ({ px: f.px * g.w0, len: f.len * g.w0, k: 1 }));
/* щётки прошли от a0 до a1: с пройденного снимают часть крови (GB.WIPE), а часть снятого (GB.SMEAR) тащат перед
   собой — копия пройденной полосы, повёрнутая на шаг вокруг опоры, ложится полосой впереди щётки. Снимают больше, чем
   кладут, — крови на стекле с каждым кадром меньше; что дотащили до края взмаха — дуга-потёк, её снимут следующие */
function wipe (g, a0, a1) {
  const x = ST.x, da = a1 - a0;
  if (Math.abs(da) < 1e-4) return;
  ST.tx.clearRect(0, 0, GB.W, GB.H);
  ST.tx.drawImage(ST.c, 0, 0);
  const sx = GB.W / g.w0, sy = GB.H / g.H;
  for (const m of armsOf(g)) {
    const r0 = m.len * GB.R0, r1 = m.len * GB.R1, b0 = a0 * m.k, b1 = a1 * m.k, db = b1 - b0;
    // 1) снимает с пройденного
    x.save();
    metric(x, g);
    x.globalCompositeOperation = 'destination-out';
    x.fillStyle = 'rgba(0,0,0,' + GB.WIPE + ')';
    sector(x, m.px, r0, r1, b0, b1);
    x.fill();
    x.restore();
    // 2) тащит: пройденная полоса (как была до щётки) — на шаг вперёд, слабее
    x.save();
    metric(x, g);
    sector(x, m.px, r0, r1, b1, b1 + db);
    x.clip();
    x.translate(m.px, 0); x.rotate(-db); x.translate(-m.px, 0);       // в осях стекла угол щётки растёт по часовой (y — вверх)
    x.transform(1 / sx, 0, 0, -1 / sy, -GB.W / 2 / sx, GB.H / sy);     // обратно в пиксели — рисуем холст как есть
    x.globalAlpha = GB.WIPE * GB.SMEAR;
    x.drawImage(ST.tmp, 0, 0);
    x.restore();
  }
}
/* где щётки достают (маска холста) — для «чисто»: углы, куда не достают, не держат дворники вечно */
function maskOf (g, max) {
  const key = g.w0.toFixed(3) + ':' + g.H.toFixed(3) + ':' + max.toFixed(2) + ':' + (g.arms ? g.arms.length : 0);
  if (ST.mask && ST.maskKey === key) return ST.mask;
  const c = document.createElement('canvas');
  c.width = GB.W; c.height = GB.H;
  const x = c.getContext('2d');
  metric(x, g);
  x.fillStyle = '#000';
  for (const m of armsOf(g)) { sector(x, m.px, m.len * GB.R0, m.len * GB.R1, 0, max * m.k); x.fill(); }
  const d = x.getImageData(0, 0, GB.W, GB.H).data, M = new Uint8Array(GB.W * GB.H);
  for (let i = 0; i < M.length; i++) M[i] = d[i * 4 + 3] > 128 ? 1 : 0;
  ST.mask = M; ST.maskKey = key;
  return M;
}
function check (g) {
  const d = ST.x.getImageData(0, 0, GB.W, GB.H).data, M = maskOf(g, WIPE.MAX);
  let inS = 0, all = 0;
  for (let i = 0, p = 3; i < M.length; i += 2, p += 8) if (d[p] > 40) { all++; if (M[i]) inS++; }
  STATS.left = inS;
  if (inS < GB.LEFT && ST.wipe) {                                   // щётки дочистили: в их секторах — ни пленки, ни точек
    STATS.cleaned++; ST.wipe = false;
    const x = ST.x;
    x.save(); metric(x, g); x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000';
    for (const m of armsOf(g)) { sector(x, m.px, m.len * GB.R0, m.len * GB.R1, 0, WIPE.MAX * m.k); x.fill(); }
    x.restore();
    return check(g);
  }
  ST.any = all > 2;
  if (!ST.any) clear();
  STATS.wipe = ST.wipe; STATS.any = ST.any;
}

export const wet = () => (ON && ST.wipe ? GB.WET : 0);

export function step (dt, car, rain = 0) {
  if (!ON || !car) return;
  own(car);
  const u = car.userData || {}, R = u.real, L = R && R.blood && R.blood.m;
  if (ST.any) {
    const cg = u.cg;
    if (cg && cg.panes && cg.panes.some(p => p.k === 'f' && p.st === 2)) clear();   // лобовое разбилось — крови на нём нет
  }
  if (ST.any) {
    const g = glassOf(car);
    drops(dt);
    if (g.a !== ST.a) { wipe(g, ST.a, g.a); ST.a = g.a; }
    if (rain > GB.RAIN_FROM) {                                       // дождь смывает понемногу
      const x = ST.x;
      x.save(); x.globalCompositeOperation = 'destination-out';
      x.fillStyle = 'rgba(0,0,0,' + Math.min(1, (rain - GB.RAIN_FROM) / (1 - GB.RAIN_FROM) * GB.RAIN * dt).toFixed(4) + ')';
      x.fillRect(0, 0, GB.W, GB.H); x.restore();
    }
    if (!ST.drops.length && (ST.chk -= dt) <= 0) { ST.chk = GB.CHECK; check(g); }
    if (ST.tex) ST.tex.needsUpdate = true;
  } else ST.a = glassOf(car).a;
  // снаружи: слой крови лобового настоящей «Семёрки» показывает эту картинку (свою realcar.js рисует, но не видно)
  if (L) {
    if (ST.any && ST.tex && L.material.map !== ST.tex) { L.material.map = ST.tex; L.material.needsUpdate = true; }
    L.visible = !!(ST.any && ST.tex && L.material.map === ST.tex);
  }
}

/* ── салон (camview.js): стекло-плоскость в раме лобового и два дворника на нём ──
   g: { W — ширина кузова, gb, gt — низ и верх лобового (высота), cf — где лобовое по длине } (оси салона = оси машины) */
export function cab (root, g) {
  const Wg = g.W - 0.2, B = new THREE.Vector3(0, g.gb - 0.005, g.cf + 0.015), T = new THREE.Vector3(0, g.gt + 0.02, g.cf - 0.26);
  const Hg = Math.hypot(T.y - B.y, T.z - B.z);
  const frame = new THREE.Group();
  frame.position.copy(B);
  frame.rotation.x = Math.atan2(T.z - B.z, T.y - B.y);              // локальная y — вверх по стеклу, z — наружу
  root.add(frame);
  let plane = null;
  if (ON) {
    ensure();
    plane = new THREE.Mesh(new THREE.PlaneGeometry(Wg, Hg).translate(0, Hg / 2, 0),
      new THREE.MeshLambertMaterial({ map: ST.tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    plane.renderOrder = 2;
    frame.add(plane);                                                 // видно при сборке — программа собирается сразу (camview.js build: compile)
  }
  const dark = new THREE.MeshLambertMaterial({ color: 0x141317, flatShading: true });
  const arms = [];
  for (let i = 0; i < 2; i++) {
    const a = new THREE.Group();
    a.position.z = -0.006;                                            // чуть ближе к глазу, чем кровь: щётку видно поверх
    const rod = new THREE.Mesh(new THREE.BoxGeometry(1, 0.012, 0.012).translate(0.5, 0, 0), dark);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.02, 0.016).translate(0.22 + 0.39, 0, -0.002), dark);
    a.add(rod, blade);
    frame.add(a);
    arms.push(a);
  }
  const h = { frame, plane, arms, Wg, Hg };
  pose(h, null);
  return h;
}
function pose (h, car) {
  const g = car ? glassOf(car) : { w0: 1.5, H: 0.6, arms: null, a: 0 };
  const list = armsOf(g);
  for (let i = 0; i < h.arms.length; i++) {
    const a = h.arms[i], m = list[i];
    if (!m) { a.visible = false; continue; }
    a.visible = true;
    const b = g.a * m.k, dx = -Math.cos(b) * m.len * h.Wg / g.w0, dy = Math.sin(b) * m.len * h.Hg / g.H;
    a.position.x = m.px * h.Wg / g.w0;
    a.position.y = 0.025;
    a.rotation.z = Math.atan2(dy, dx);
    a.scale.x = Math.max(0.05, Math.hypot(dx, dy));
  }
}
export function cabStep (h, car) {
  if (!h) return;
  pose(h, car);
  if (h.plane) h.plane.visible = ON && ST.any && ST.car === car;
}

export const DEBUG = { GB, STATS, ST, clear, get on () { return ON; } };
