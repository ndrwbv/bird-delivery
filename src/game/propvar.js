/* ──────────────────────────────────────────────────────────────────────────
   Формы вариантов мелочи (М5, этап 2; автор 24.10.2026: «все заборчики и препятствия должны быть в нескольких
   вариациях»). Правила словами и таблица — docs/CAREER.md «Варианты заборов и препятствий».

   Какой вид, краска и износ у вещи в этом месте — выбирает fencevar.js (по месту и району). Здесь — только как вид
   выглядит: секция низкого заборчика, лавочка, урна, контейнер — куски в осях вещи (x — вдоль, y — вверх, z — вглубь),
   и одна геометрия на вещь: у коробки 8 общих вершин (у BoxGeometry — 24), у цилиндра — 2n. Нормали не нужны: мелочь
   рисуется плоской заливкой (game.js SMASH_MAT, клетки LITM). Новых вызовов отрисовки нет — вещь ложится в ту же склейку.

   Город строится на зерне (docs/AGENTS.md «Город строится на зерне»): каждая BufferGeometry тянет 4 жребия Math.random
   (uuid three.js). Поэтому вариант строится в quiet() — uuid из своего генератора, — а burn(n) вытягивает из жребия
   куска столько, сколько вытянули бы n прежних геометрий: город за вещью не сдвигается.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

/* свой генератор для uuid вещей варианта: жребий куска не трогаем */
let QS = 0x2545f491;
const QR = () => { QS = (QS + 0x6D2B79F5) | 0; let t = Math.imul(QS ^ (QS >>> 15), 1 | QS); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export function quiet (fn) { const R = Math.random; Math.random = QR; try { return fn(); } finally { Math.random = R; } }
/* n прежних геометрий (BoxGeometry, CylinderGeometry…) — по 4 жребия uuid */
let SINK = 0;                                     // результат копится: иначе сборщик выкидывает «ненужный» Math.random()
export function burn (n) { for (let i = 0; i < n * 4; i++) SINK += Math.random(); return SINK; }
export const sink = () => SINK;

const COL = new Map();
const col = hex => { let c = COL.get(hex); if (!c) { const k = new THREE.Color(hex); c = [k.r, k.g, k.b]; COL.set(hex, c); } return c; };
export const mix = (hex, to, k) => {
  const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16), c = s => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
};
const RUST = '#8a4a2a', RUST2 = '#5e3220';

/* куски вещи */
export function kit () { return { P: [], nv: 0, ni: 0 }; }
/* коробка: размеры w (x), h (y), d (z); середина x, y, z; o: rz — наклон в плоскости xy, rx — вокруг x, ry — поворот,
   cb — цвет низа, ts — верх шире/уже (по x и z) */
function B (K, w, h, d, hex, x, y, z, o) {
  K.P.push({ t: 0, w, h, d, c: hex, x, y, z, rz: (o && o.rz) || 0, rx: (o && o.rx) || 0, ry: (o && o.ry) || 0, cb: (o && o.cb) || hex, ts: (o && o.ts) || 1 });
  K.nv += 8; K.ni += 36;
}
/* цилиндр: радиусы верха и низа, высота, n граней */
function C (K, rt, rb, h, n, hex, x, y, z, o) {
  K.P.push({ t: 1, rt, rb, h, n, c: hex, x, y, z, rz: (o && o.rz) || 0, rx: (o && o.rx) || 0, ry: 0, cb: (o && o.cb) || hex, ph: (o && o.ph) || 0 });
  K.nv += 2 * n; K.ni += n * 6 + (n - 2) * 6;
}
const BOX_F = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0];
const BOX_V = [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]];

/* одна геометрия на вещь: X, Y, Z — где (Y — земля), RY — поворот (как у three.js rotateY: x вещи → (cos, −sin)),
   slope — подъём земли на метр вдоль x (секция на склоне) */
export function geo (K, X, Y, Z, RY, slope = 0) {
  const pos = new Float32Array(K.nv * 3), cl = new Float32Array(K.nv * 3), idx = K.nv > 65535 ? new Uint32Array(K.ni) : new Uint16Array(K.ni);
  const CY = Math.cos(RY), SY = Math.sin(RY);
  let v = 0, ii = 0;
  const put = (lx, ly, lz, p, c) => {
    // наклоны куска: rz, потом rx, потом ry; сдвиг; поворот вещи
    let x = lx, y = ly, z = lz;
    if (p.rz) { const c1 = Math.cos(p.rz), s1 = Math.sin(p.rz), nx = x * c1 - y * s1; y = x * s1 + y * c1; x = nx; }
    if (p.rx) { const c1 = Math.cos(p.rx), s1 = Math.sin(p.rx), ny = y * c1 - z * s1; z = y * s1 + z * c1; y = ny; }
    if (p.ry) { const c1 = Math.cos(p.ry), s1 = Math.sin(p.ry), nx = x * c1 + z * s1; z = -x * s1 + z * c1; x = nx; }
    x += p.x; y += p.y; z += p.z;
    pos[v * 3] = X + x * CY + z * SY; pos[v * 3 + 1] = Y + y + slope * x; pos[v * 3 + 2] = Z - x * SY + z * CY;
    cl[v * 3] = c[0]; cl[v * 3 + 1] = c[1]; cl[v * 3 + 2] = c[2];
    v++;
  };
  for (const p of K.P) {
    const o = v, ct = col(p.c), cb = col(p.cb);
    if (p.t === 0) {
      for (const q of BOX_V) { const k = q[1] > 0 ? p.ts : 1; put(q[0] * p.w / 2 * k, q[1] * p.h / 2, q[2] * p.d / 2 * k, p, q[1] > 0 ? ct : cb); }
      for (let i = 0; i < 36; i++) idx[ii++] = BOX_F[i] + o;
    } else {
      const n = p.n;
      for (let s = 0; s < 2; s++) for (let i = 0; i < n; i++) {
        const a = i / n * 6.2832 + p.ph, r = s ? p.rt : p.rb;
        put(Math.cos(a) * r, (s ? 0.5 : -0.5) * p.h, Math.sin(a) * r, p, s ? ct : cb);
      }
      for (let i = 0; i < n; i++) {
        const b0 = o + i, b1 = o + (i + 1) % n, t0 = b0 + n, t1 = b1 + n;
        idx[ii++] = b0; idx[ii++] = t0; idx[ii++] = b1;
        idx[ii++] = b1; idx[ii++] = t0; idx[ii++] = t1;
      }
      for (let k = 1; k < n - 1; k++) {
        idx[ii++] = o + n; idx[ii++] = o + n + k + 1; idx[ii++] = o + n + k;     // верх
        idx[ii++] = o; idx[ii++] = o + k; idx[ii++] = o + k + 1;                 // низ
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

/* жребий куска вещи (не Math.random): s — 0…1 */
function rng (s) {
  let a = (Math.floor(s * 4294967296) ^ 0x9e3779b9) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let q = a; q = Math.imul(q ^ (q >>> 15), q | 1); q ^= q + Math.imul(q ^ (q >>> 7), q | 61); return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
}

/* ═════ секция низкого заборчика ═════
   L — длина (x от −L/2 до L/2), H — высота; o: form, hex (краска), hex2 (пики, шапка), rust — секция ржавая, peel —
   облупленная (рыжие пятна), miss — доля выпавших планок / прутьев, seed — жребий секции, p0 / p1 — столб в начале / конце.
   Формы: pipes — две трубы на столбах (как было), picket — штакетник (частые планки), planks4 — четыре широкие планки
   (как было у тротуаров), hoops — дуги, forged — кованая (прутья с пиками), xframe — рама из уголка с крестом,
   board — сплошной борт (коробки), bars — прутья в раме (сетка), planks — горбыль (три доски вдоль) */
export const METAL = { pipes: 1, hoops: 1, forged: 1, xframe: 1, bars: 1 };
export function fence (K, L, H, o) {
  const f = o.form, r = rng(o.seed || 0.5), h2 = L / 2, p0 = o.p0 !== false, p1 = o.p1 !== false;
  let hex = o.hex;
  if (o.rust) hex = mix(RUST, hex, 0.18);
  const low = o.rust ? RUST2 : o.peel || o.aged ? mix(hex, RUST, o.peel ? 0.55 : 0.3) : hex;      // низ столбов: ржавчина от земли
  const miss = o.miss || 0;
  const post = (x, w, hh, c = hex) => B(K, w, hh, w, c, x, hh / 2 - 0.03, 0, { cb: c === hex ? low : c });
  const posts = (w, hh, c) => { if (p0) post(-h2 + w / 2, w, hh, c); if (p1) post(h2 - w / 2, w, hh, c); };
  const peel = (y, t) => { if (!o.peel) return; const n = 1 + (r() * 2 | 0); for (let i = 0; i < n; i++) { const x = (r() - 0.5) * (L - 0.5), l = 0.12 + r() * 0.25; B(K, l, t * 1.25, t * 1.25, r() < 0.5 ? RUST : '#a0643a', x, y, 0); } };
  if (f === 'pipes') {
    const t = H > 0.7 ? 0.05 : 0.055;
    B(K, L, t, t, hex, 0, H - 0.06, 0);
    B(K, L, t, t, hex, 0, H * 0.45, 0);
    posts(0.07, H + 0.03);
    peel(H - 0.06, t);
  } else if (f === 'picket' || f === 'planks4') {
    const wide = f === 'planks4', n = wide ? 4 : Math.max(3, Math.round(L / (H < 0.7 ? 0.24 : 0.21))), pw = wide ? 0.1 : 0.075;
    B(K, L, 0.05, 0.03, hex, 0, H * 0.78, -0.02, { cb: hex });
    B(K, L, 0.05, 0.03, hex, 0, H * 0.3, -0.02, { cb: low });
    for (let i = 0; i < n; i++) {
      if (miss && r() < miss) continue;
      const x = wide ? [-0.94, -0.31, 0.31, 0.94][i] * L / 2.5 : -h2 + (i + 0.5) * L / n, hh = H + 0.02 + (o.tips ? 0 : (r() - 0.5) * 0.03);
      B(K, pw, hh, 0.022, hex, x, hh / 2 - 0.02, 0.012, { cb: low, rz: miss ? (r() - 0.5) * 0.06 : 0 });
      if (o.tips) B(K, pw * 0.72, pw * 0.72, 0.02, o.hex2 || hex, x, hh - 0.02, 0.012, { rz: 0.785 });
    }
  } else if (f === 'hoops') {
    const n = Math.max(2, Math.round(L / 0.62)), s = L / n, w = s * 0.86, lean = 0.16;
    for (let i = 0; i < n; i++) {
      const x = -h2 + (i + 0.5) * s;
      for (const sd of [-1, 1]) B(K, 0.04, H, 0.04, hex, x + sd * (w / 2 - Math.sin(lean) * H / 2), H / 2 - 0.02, 0, { rz: sd * lean, cb: low });
      B(K, w - 2 * Math.sin(lean) * H + 0.04, 0.04, 0.04, hex, x, H - 0.03, 0);
    }
    B(K, L, 0.035, 0.035, hex, 0, 0.14, 0, { cb: low });
  } else if (f === 'forged' || f === 'bars') {
    const forged = f === 'forged', step = forged ? (H < 0.7 ? 0.19 : 0.14) : 0.17, n = Math.max(3, Math.round(L / step)), bw = forged ? 0.022 : 0.02;   // низкий — реже: вершины
    B(K, L, 0.04, 0.04, hex, 0, H - 0.08, 0);
    B(K, L, 0.04, 0.04, hex, 0, 0.1, 0, { cb: low });
    for (let i = 1; i < n; i++) {
      if (miss && r() < miss) continue;
      const x = -h2 + i * L / n, hh = forged ? H : H - 0.06;
      B(K, bw, hh, bw, hex, x, hh / 2, 0, { cb: low });
      if (forged && (o.tips || i % 2 === 0)) B(K, 0.045, 0.045, 0.02, o.hex2 || hex, x, hh + 0.01, 0, { rz: 0.785 });
    }
    posts(forged ? 0.06 : 0.05, H + 0.04);
    if (forged && o.hex2 && p0) B(K, 0.085, 0.085, 0.085, o.hex2, -h2 + 0.03, H + 0.06, 0);   // шар на столбе
  } else if (f === 'xframe') {
    const n = Math.max(1, Math.round(L / Math.max(0.9, H * 1.5))), s = L / n, hy = H - 0.14, a = Math.atan2(hy, s), dl = Math.hypot(s, hy);
    B(K, L, 0.04, 0.04, hex, 0, H - 0.05, 0);
    B(K, L, 0.04, 0.04, hex, 0, 0.09, 0, { cb: low });
    for (let i = 0; i < n; i++) {
      const x = -h2 + (i + 0.5) * s;
      if (!(miss && r() < miss)) B(K, dl, 0.032, 0.032, hex, x, (H - 0.05 + 0.09) / 2, -0.005, { rz: a, cb: low });
      B(K, dl, 0.032, 0.032, hex, x, (H - 0.05 + 0.09) / 2, 0.005, { rz: -a, cb: low });
      if (i) B(K, 0.04, H - 0.1, 0.04, hex, -h2 + i * s, H / 2, 0, { cb: low });
    }
    posts(0.055, H + 0.02);
    peel(H - 0.05, 0.04);
  } else if (f === 'board') {
    const bh = H - 0.12;
    B(K, L - 0.06, bh, 0.035, hex, 0, 0.06 + bh / 2, 0, { cb: o.rust || o.peel ? mix(hex, '#6a5a48', 0.5) : hex });
    B(K, L, 0.06, 0.07, o.hex2 || hex, 0, H - 0.03, 0);
    posts(0.08, H, o.hex2 || hex);
    if (o.peel) for (let i = 0; i < 2; i++) B(K, 0.2 + r() * 0.3, 0.1 + r() * 0.15, 0.04, mix(hex, '#8a8070', 0.6), (r() - 0.5) * (L - 0.6), 0.2 + r() * (bh - 0.3), 0);
  } else if (f === 'planks') {
    for (const k of [0.22, 0.52, 0.82]) {
      if (miss && r() < miss) continue;
      B(K, L - 0.04 + (r() - 0.5) * 0.12, 0.13, 0.025, mix(hex, '#8a8478', r() * 0.35), (r() - 0.5) * 0.06, H * k, 0.02, { rz: (r() - 0.5) * 0.05 });
    }
    posts(0.085, H + 0.05, mix(hex, '#5a4e40', 0.45));
  }
  return K;
}

/* ═════ лавочка ═════  x — вдоль (±1,2), z — к спинке минус; сиденье — 0,6—0,68 м над землёй (на неё садятся люди).
   o: form, hex (доски), hex2 (ножки), seed, k — размер (1 — у подъезда, 1,08 — у стен и остановок) */
export function bench (K, o) {
  const f = o.form, r = rng(o.seed || 0.5), k = o.k || 1, W = 2.4 * k, hex = o.hex, leg = o.hex2 || '#3b3f46';
  if (f === 'classic') {
    B(K, W, 0.16, 0.62 * k, hex, 0, 0.6, 0);
    B(K, W, 0.5, 0.12, hex, 0, 0.98, -0.27 * k);
    for (const s of [-1, 1]) B(K, 0.14, 0.85, 0.66 * k, leg, s * 1.05 * k, 0.2, -0.05);
  } else if (f === 'slats' || f === 'broken') {
    const gone = f === 'broken' ? (r() * 3) | 0 : -1;
    for (let i = 0; i < 3; i++) if (i !== gone) B(K, W, 0.05, 0.16, hex, 0, 0.64, (i - 1) * 0.2 * k, { rz: f === 'broken' ? (r() - 0.5) * 0.04 : 0 });
    const back = f === 'broken' ? (r() < 0.5 ? 1 : -1) : 0;
    for (let i = 0; i < 2; i++) if (!(back > 0 && i === 1)) B(K, W, 0.12, 0.04, hex, 0, 0.86 + i * 0.19, -0.31 * k, { rx: -0.12, rz: back < 0 && i === 1 ? 0.07 : 0 });
    for (const s of [-1, 1]) {
      B(K, 0.18, 0.62, 0.52 * k, leg, s * 0.92 * k, 0.28, 0, { cb: mix(leg, '#5a5650', 0.4) });                 // бетонная ножка
      B(K, 0.05, 0.5, 0.05, '#3b3f46', s * 0.92 * k, 0.92, -0.33 * k, { rx: -0.12 });                            // стойка спинки
    }
  } else if (f === 'plain') {
    for (const s of [-1, 1]) B(K, W * 0.94, 0.06, 0.2, hex, 0, 0.62, s * 0.11 * k);
    for (const s of [-1, 1]) { B(K, 0.06, 0.6, 0.06, leg, s * 0.85 * k, 0.29, 0.14 * k); B(K, 0.06, 0.6, 0.06, leg, s * 0.85 * k, 0.29, -0.14 * k); B(K, 0.06, 0.05, 0.4 * k, leg, s * 0.85 * k, 0.57, 0); }
  } else if (f === 'park') {
    for (let i = 0; i < 4; i++) B(K, W * 0.96, 0.04, 0.11, hex, 0, 0.63, (i - 1.5) * 0.135 * k);
    for (let i = 0; i < 3; i++) B(K, W * 0.96, 0.09, 0.03, hex, 0, 0.8 + i * 0.13, -0.3 * k - i * 0.025, { rx: -0.18 });
    for (const s of [-1, 1]) {
      const x = s * 1.0 * k;
      B(K, 0.06, 0.62, 0.06, leg, x, 0.31, 0.22 * k);                         // передняя ножка
      B(K, 0.06, 1.12, 0.06, leg, x, 0.56, -0.24 * k, { rx: -0.16 });         // задняя — до верха спинки
      B(K, 0.06, 0.05, 0.52 * k, leg, x, 0.84, 0.0);                          // подлокотник
      B(K, 0.08, 0.05, 0.62 * k, leg, x, 0.03, 0.0);                          // лапа
      if (o.hex3) B(K, 0.08, 0.08, 0.08, o.hex3, x, 0.88, 0.25 * k);          // шишечка
    }
  }
  return K;
}

/* ═════ урна ═════ o: form, hex, hex2 (ободок, крышка), seed */
export function urn (K, o) {
  const f = o.form, r = rng(o.seed || 0.5), hex = o.hex;
  if (f === 'cup') {
    C(K, 0.28, 0.24, 0.8, 8, hex, 0, 0.4, 0);
    C(K, 0.3, 0.3, 0.06, 8, o.hex2 || mix(hex, '#000000', 0.25), 0, 0.82, 0);
  } else if (f === 'vase') {                         // бетонная «ваза»: ножка, чаша, тёмное нутро, крашеный поясок
    C(K, 0.19, 0.24, 0.2, 8, hex, 0, 0.1, 0, { cb: mix(hex, '#6a665e', 0.35) });
    C(K, 0.37, 0.2, 0.5, 8, hex, 0, 0.44, 0);
    C(K, 0.375, 0.34, 0.07, 8, o.hex2 || hex, 0, 0.61, 0);
    C(K, 0.31, 0.31, 0.02, 8, '#2a2622', 0, 0.68, 0);
  } else if (f === 'tilt') {                         // опрокидывающаяся: ведро на оси между двух столбиков
    for (const s of [-1, 1]) B(K, 0.05, 0.92, 0.05, o.hex2 || '#3b3f46', s * 0.31, 0.44, 0);
    B(K, 0.64, 0.03, 0.03, o.hex2 || '#3b3f46', 0, 0.74, 0);
    C(K, 0.25, 0.19, 0.48, 8, hex, 0, 0.56, 0, { rx: (r() - 0.5) * 0.25 });
    C(K, 0.265, 0.265, 0.03, 8, mix(hex, '#000000', 0.3), 0, 0.8, 0);
  } else if (f === 'iron') {                         // чугунная, Старый город: база, тулово, поясок, купол
    C(K, 0.23, 0.27, 0.1, 10, hex, 0, 0.05, 0);
    C(K, 0.28, 0.21, 0.58, 10, hex, 0, 0.39, 0);
    C(K, 0.3, 0.3, 0.05, 10, o.hex2 || '#b8923a', 0, 0.56, 0);
    C(K, 0.13, 0.29, 0.13, 10, hex, 0, 0.745, 0);
    B(K, 0.06, 0.06, 0.06, o.hex2 || '#b8923a', 0, 0.84, 0);
  } else if (f === 'rusty') {                        // ржавое ведро без крышки, из него торчит мусор
    const lean = (r() - 0.5) * 0.14;
    C(K, 0.27, 0.22, 0.7, 8, hex, 0, 0.35, 0, { cb: RUST2, rz: lean });
    B(K, 0.2, 0.16, 0.14, '#e8e4da', 0.05, 0.72, 0.02, { rz: 0.4, ry: r() * 3 });
    if (r() < 0.6) C(K, 0.05, 0.05, 0.22, 6, ['#3f8a4a', '#8a5a2a', '#cfe3ee'][(r() * 3) | 0], -0.08, 0.74, -0.06, { rz: 0.5 });
  }
  return K;
}

/* ═════ контейнер ═════ x — длинная сторона (1,4), основание в 0. o: form, hex (короб), hex2 (крышка), seed */
export function can (K, o) {
  const f = o.form, r = rng(o.seed || 0.5), body = o.hex, lid = o.hex2 || o.hex, wheel = '#1b1a1f';
  const wheels = (s = 0.14, y = 0.07) => { for (const [a, b] of [[-0.55, -0.38], [0.55, -0.38], [-0.55, 0.38], [0.55, 0.38]]) B(K, s, s, s, wheel, a, y, b); };
  if (f === 'metal') {
    B(K, 1.4, 1.0, 1.0, body, 0, 0.62, 0);
    B(K, 1.46, 0.08, 1.08, lid, 0, 1.17, -0.02, { rx: -0.06 });
    B(K, 1.5, 0.08, 0.1, lid, 0, 1.0, 0.52);
    wheels();
  } else if (f === 'euro') {                         // пластиковый «евро»: короб к верху шире, крышка, ручки, колёса крупнее
    B(K, 1.22, 1.02, 0.92, body, 0, 0.66, 0, { ts: 1.09 });
    B(K, 1.4, 0.09, 1.08, lid, 0, 1.21, -0.01, { rx: -0.04 });
    B(K, 1.3, 0.06, 0.08, body, 0, 1.13, 0.53);
    for (const s of [-1, 1]) B(K, 0.07, 0.07, 0.5, body, s * 0.7, 1.0, 0);
    wheels(0.19, 0.095);
  } else if (f === 'open') {                         // старый ржавый, крышки нет: мусор горкой, сзади висит оторванная крышка
    B(K, 1.4, 1.0, 1.0, body, 0, 0.62, 0, { cb: RUST2 });
    B(K, 1.3, 0.12, 0.9, '#2b2a28', 0, 1.08, 0);
    B(K, 0.36, 0.3, 0.32, ['#1e1e22', '#e8e4da', '#3a4a6a'][(r() * 3) | 0], (r() - 0.5) * 0.6, 1.2, (r() - 0.5) * 0.3, { ry: r() * 3 });
    B(K, 1.46, 0.06, 0.9, lid, 0, 0.72, -0.56, { rx: 1.35 });
    for (let i = 0; i < 2; i++) B(K, 0.25 + r() * 0.3, 0.2 + r() * 0.25, 0.02, RUST, (r() - 0.5) * 0.9, 0.35 + r() * 0.5, 0.505);
    wheels();
  } else if (f === 'cage') {                         // сетка для пластика: рама, прутья, внутри бутылки
    B(K, 1.4, 0.06, 1.0, body, 0, 0.16, 0);
    for (const s of [-1, 1]) { B(K, 1.4, 0.05, 0.05, body, 0, 1.28, s * 0.5); B(K, 0.05, 0.05, 1.0, body, s * 0.7, 1.28, 0); }
    for (const [a, b] of [[-0.7, -0.5], [0.7, -0.5], [-0.7, 0.5], [0.7, 0.5]]) B(K, 0.06, 1.18, 0.06, body, a, 0.7, b);
    for (let i = 1; i < 7; i++) for (const s of [-1, 1]) B(K, 0.022, 1.1, 0.022, body, -0.7 + i * 0.2, 0.72, s * 0.5);
    for (let i = 1; i < 4; i++) for (const s of [-1, 1]) B(K, 0.022, 1.1, 0.022, body, s * 0.7, 0.72, -0.5 + i * 0.25);
    B(K, 1.3, 0.62 + r() * 0.3, 0.9, '#cfe3ee', 0, 0.5 + r() * 0.12, 0, { cb: '#9fc4d8' });
    wheels(0.12, 0.06);
  }
  return K;
}

/* ═════ бетонная плита забора ПО-2 (стройки) ═════ x — вдоль (L), низ в 0, высота H; ромбы рельефа с обеих сторон
   (plate0 — гладкая, телефон); o: hex, aged (подтёки, скол), seed */
export function plate (K, L, H, o) {
  const r = rng(o.seed || 0.5), hex = o.hex, dk = mix(hex, '#000000', 0.14), dirt = o.aged ? mix(hex, '#5a5244', 0.45) : mix(hex, '#6a665e', 0.2);
  B(K, L, 0.14, 0.24, '#7d7a72', 0, 0.07, 0);                                  // фундаментный блок
  B(K, L - 0.03, H - 0.1, 0.12, hex, 0, 0.1 + (H - 0.1) / 2, 0, { cb: dirt });
  if (o.form === 'plate') {
    const cols = 5, rows = 3, sx = (L - 0.3) / cols, sy = (H - 0.5) / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) for (const sd of [-1, 1]) {
      if (o.aged && r() < 0.06) continue;                                         // ромб отбит
      B(K, 0.2, 0.2, 0.03, dk, -L / 2 + 0.15 + (i + 0.5) * sx, 0.35 + (j + 0.5) * sy, sd * 0.07, { rz: 0.785 });
    }
  }
  if (o.aged) {                                                                   // скол на верхнем углу, рыжий подтёк от петли
    B(K, 0.3, 0.16, 0.14, '#6f6a60', (r() < 0.5 ? -1 : 1) * (L / 2 - 0.2), H - 0.05, 0, { rz: 0.5 });
    B(K, 0.08, 0.6 + r() * 0.5, 0.125, '#8a6a4a', (r() - 0.5) * (L - 0.6), H - 0.55, 0);
  }
  return K;
}

/* одной геометрией, в quiet(): sv — вид (fencevar.js item), w — износ секции (fencevar.js wear2) */
export function fenceGeo (sv, w, L, H, X, Y, Z, RY, slope = 0, p0 = true, p1 = true) {
  return quiet(() => geo(fence(kit(), L, H, { form: sv.form, hex: sv.hex, hex2: sv.hex2, tips: sv.tips, rust: w.rust, peel: w.peel, miss: w.miss, seed: w.seed, aged: sv.aged, p0, p1 }), X, Y, Z, RY, slope));
}
export const benchGeo = (sv, X, Y, Z, RY, k = 1) => quiet(() => geo(bench(kit(), { ...sv, k }), X, Y, Z, RY));
export const urnGeo = (sv, X, Y, Z, RY) => quiet(() => geo(urn(kit(), sv), X, Y, Z, RY));
export const canGeo = (sv, X, Y, Z, RY) => quiet(() => geo(can(kit(), sv), X, Y, Z, RY));
export const plateGeo = (sv, L, H, X, Y, Z, RY) => quiet(() => geo(plate(kit(), L, H, sv), X, Y, Z, RY));
