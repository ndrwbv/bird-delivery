/* ──────────────────────────────────────────────────────────────────────────
   Окна жилых домов (блок 6 docs/IDEAS.md, CAREER.md → «Город: как выглядит»).

   Раньше окно — плоский голубой прямоугольник, а ночью поверх него — второй
   прямоугольник со светом. Теперь каждое окно — один четырёхугольник на общем
   материале, всё остальное рисует шейдер:
   • рама и переплёт — у дома свой: крест, «Т», две створки, три створки,
     форточка сверху; рама белая (пластик), коричневая (дерево) или серая.
     В каждом седьмом окне жильцы поставили свой белый стеклопакет;
   • за стеклом — комната с глубиной (interior mapping, как в Spider-Man):
     луч из глаза идёт сквозь стекло и упирается в пол, потолок, боковые или
     заднюю стену коробки-комнаты. Обои, пол, потолок — свои у каждого окна;
     на задней стене — мебель из атласа (шкаф, книжная полка, ковёр над
     диваном, телевизор, кухня, дверь с вешалкой, «стенка», стол с плакатом);
     в глубине у части окон — человек, кот, торшер или фикус (люди иногда
     ходят по комнате); на подоконнике — цветы в горшках, банки, кот;
     у стекла — шторы, тюль или рулонная штора;
   • днём в стекле отражается небо (сильнее под острым углом), комната — в
     полутени; ночью свет горит в части окон (~36 %): у 88 % окон — на всю ночь
     одно, 12 % переключаются раз в 4—10 мин, плавно за ~1,2 с (автор 10.10.2026: без
     визуального шума); тёплый, холодный, синий мягкий от телевизора, фиолетовая
     фитолампа, изредка (0,4 % окон) лампа мигает; шторы светятся насквозь, люди — силуэтами;
   • дальше LOD-метров (70 м; на телефоне — 45) комната не считается: окно
     одного усреднённого цвета, рама — тоже усреднённая (не рябит). С 70 % LOD
     комната плавно переходит в этот цвет — граница не щёлкает.
   Всё детерминированно: зерно окна — от его середины, стиль — от дома.
   Окна склеены по клеткам города (как статика): один вызов отрисовки на
   клетку, один материал и один маленький атлас на весь город.
   В game.js: add() — в facade вместо цветных прямоугольников, build() — после
   склейки статики, update() — в updateEnv (ночь, небо, время).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

export const STATS = { windows: 0, meshes: 0, verts: 0, ms: 0, interior: 1, lod: 70 };

let CH = 100;
const BUCKETS = new Map();
export function init (chunk) { CH = chunk; }

/* стиль окон дома: тип переплёта (0—4) + цвет рамы (0 — белый, 1 — дерево, 2 — серый) × 8 */
export function style (seed, st) {
  const h = Math.abs(Math.sin(seed * 12.9898 + 4.1) * 43758.5453) % 1, h2 = Math.abs(Math.sin(seed * 78.233 + 1.7) * 24634.6345) % 1;
  let ft;
  if (st === 'stalin' || st === 'brick') ft = h < 0.45 ? 1 : h < 0.75 ? 0 : h < 0.9 ? 3 : 2;
  else if (st === 'priv') ft = h < 0.5 ? 0 : h < 0.8 ? 1 : 4;
  else ft = h < 0.3 ? 1 : h < 0.5 ? 0 : h < 0.72 ? 2 : h < 0.85 ? 3 : 4;
  const old = st === 'stalin' || st === 'brick' || st === 'priv';
  const fc = h2 < (old ? 0.4 : 0.22) ? 1 : h2 < (old ? 0.5 : 0.34) ? 2 : 0;
  return ft + fc * 8;
}

/* окно — один экземпляр общего четырёхугольника: угол (u = 0, v = 0), нормаль, размер, зерно, стиль.
   9 чисел на окно вместо 4 вершин — в Северске ~300 тысяч окон, это ~11 МБ, а не ~55 */
const PER = 9;
function bucket (x, z) {
  const k = Math.floor(x / CH) + ',' + Math.floor(z / CH);
  let b = BUCKETS.get(k);
  if (!b) { b = { n: 0, cap: 64, a: new Float32Array(64 * PER), x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity }; BUCKETS.set(k, b); }
  if (b.n >= b.cap) { b.cap *= 2; const a = new Float32Array(b.cap * PER); a.set(b.a); b.a = a; }
  return b;
}

/* окно на стене w (a, ux/uz вдоль, ox/oz наружу): from..to вдоль стены, y0..y1, out — от стены */
export function add (w, from, to, y0, y1, out, sty) {
  const ax = w.a[0] + w.ox * out, az = w.a[1] + w.oz * out;
  const ww = to - from, hh = y1 - y0;
  const cx = ax + w.ux * (from + to) / 2, cz = az + w.uz * (from + to) / 2, cy = (y0 + y1) / 2;
  const seed = Math.abs(Math.sin(cx * 12.9898 + cy * 78.233 + cz * 37.719) * 43758.5453) % 1;
  // u растёт вдоль T = (oz, −ox) — так шейдер строит касательную из нормали; угол u = 0 — с того конца
  const s0 = w.ux * w.oz - w.uz * w.ox > 0 ? from : to;
  const px = ax + w.ux * s0, pz = az + w.uz * s0;
  const b = bucket(cx, cz), A = b.a, j = b.n * PER;
  A[j] = px; A[j + 1] = y0; A[j + 2] = pz;
  A[j + 3] = w.ox; A[j + 4] = w.oz; A[j + 5] = ww; A[j + 6] = hh;
  A[j + 7] = seed; A[j + 8] = sty;
  b.n++;
  const qx = ax + w.ux * (from + to - s0), qz = az + w.uz * (from + to - s0);
  b.x0 = Math.min(b.x0, px, qx); b.x1 = Math.max(b.x1, px, qx); b.z0 = Math.min(b.z0, pz, qz); b.z1 = Math.max(b.z1, pz, qz);
  b.y0 = Math.min(b.y0, y0); b.y1 = Math.max(b.y1, y1);
  STATS.windows++;
}

/* ── атлас: мебель задней стены, фигуры в глубине, подоконник ──
   1024×512: ряд 0 — 8 клеток 128×128 (задняя стена, ~3,5 × 2,7 м);
   ряд 1 — 16 клеток 64×128 (фигура 1,2 × 2,4 м); ряд 2 — 16 клеток 128×32
   (подоконник: ширина окна × 0,5 м). Фон прозрачный — там обои / комната. */
function atlas () {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const x = c.getContext('2d');
  let ox = 0, oy = 0;
  const R = (a, b, w, h, col) => { x.fillStyle = col; x.fillRect(ox + a, oy + b, w, h); };
  const O = (a, b, r, col) => { x.fillStyle = col; x.beginPath(); x.arc(ox + a, oy + b, r, 0, Math.PI * 2); x.fill(); };
  const cell = (i, cw, ch, y0, cols) => { ox = (i % cols) * cw; oy = y0 + Math.floor(i / cols) * ch; };

  // ряд 0: задняя стена (пол — низ клетки)
  const BACK = [
    () => { R(8, 18, 44, 110, '#6b4429'); R(29, 22, 2, 104, '#3e2616'); R(24, 70, 3, 8, '#c9a04a'); R(33, 70, 3, 8, '#c9a04a'); R(72, 34, 34, 26, '#8a6a3a'); R(75, 37, 28, 20, '#7fb3c9'); R(75, 49, 28, 8, '#5f8f4a'); },
    () => { R(62, 12, 56, 116, '#5a3a22'); for (let s = 0; s < 5; s++) { R(64, 16 + s * 22, 52, 2, '#3a2412'); for (let k = 0; k < 9; k++) R(66 + k * 5.5, 20 + s * 22, 4, 14 - (k * 7 + s * 3) % 5, ['#b83a2e', '#2e5fa8', '#e0b23c', '#3d8a4f', '#e8e0d0', '#7a3f8c'][(k + s * 2) % 6]); } R(12, 92, 40, 4, '#6b4429'); R(16, 96, 3, 32, '#6b4429'); R(45, 96, 3, 32, '#6b4429'); R(26, 74, 4, 18, '#333'); R(18, 64, 20, 12, '#f2d27a'); },
    () => { R(18, 22, 92, 62, '#8e1f22'); R(22, 26, 84, 54, '#b8322c'); for (let k = 0; k < 5; k++) { x.fillStyle = k % 2 ? '#e3b04b' : '#2b3f7a'; x.beginPath(); x.moveTo(ox + 64, oy + 30 + k * 4); x.lineTo(ox + 100 - k * 7, oy + 53); x.lineTo(ox + 64, oy + 76 - k * 4); x.lineTo(ox + 28 + k * 7, oy + 53); x.fill(); } R(12, 88, 104, 40, '#4c6b3a'); R(12, 84, 104, 14, '#5d7f48'); R(8, 90, 10, 38, '#3f5a30'); R(110, 90, 10, 38, '#3f5a30'); },
    () => { R(30, 96, 68, 32, '#4a3220'); R(34, 100, 28, 10, '#3a2618'); R(38, 56, 52, 38, '#1c1c22'); R(42, 60, 44, 30, '#2a3c66'); R(46, 63, 18, 8, '#4d6aa8'); R(104, 30, 12, 98, '#5a3a22'); O(110, 26, 9, '#3d7a3c'); R(10, 40, 18, 24, '#d8c9a0'); },
    () => { R(0, 84, 88, 44, '#e9e4d6'); R(0, 82, 88, 5, '#9a8a70'); for (let k = 0; k < 4; k++) R(4 + k * 21, 92, 1, 34, '#b8b0a0'); R(0, 18, 80, 36, '#e9e4d6'); for (let k = 0; k < 4; k++) R(2 + k * 20, 20, 1, 32, '#b8b0a0'); R(92, 26, 32, 102, '#f4f4f0'); R(92, 64, 32, 2, '#b8b8b0'); R(118, 40, 2, 16, '#999'); R(30, 70, 14, 12, '#c84a2a'); },
    () => { R(48, 26, 38, 102, '#7a5232'); R(52, 30, 30, 44, '#8a6040'); R(52, 78, 30, 44, '#8a6040'); R(78, 80, 3, 6, '#d8c070'); R(10, 26, 34, 3, '#3a2a1a'); R(12, 29, 12, 44, '#3b4d78'); R(28, 29, 12, 38, '#8a3a32'); R(14, 110, 22, 18, '#2a2a2a'); R(98, 50, 22, 30, '#d9c19a'); },
    () => { R(4, 14, 120, 114, '#4a2c18'); for (let k = 0; k < 4; k++) { R(8 + k * 30, 18, 26, 50, '#8fb3c4'); for (let q = 0; q < 3; q++) R(12 + k * 30 + q * 7, 40 - q * 3, 4, 8, '#e8f2f6'); R(8 + k * 30, 42, 26, 2, '#4a2c18'); } R(8, 72, 116, 52, '#5a3820'); for (let k = 0; k < 4; k++) R(10 + k * 30, 76, 26, 44, '#6a4428'); },
    () => { R(16, 88, 64, 6, '#8a6a4a'); R(20, 94, 4, 34, '#6a4a2a'); R(72, 94, 4, 34, '#6a4a2a'); R(32, 64, 30, 22, '#222'); R(34, 66, 26, 17, '#5aa0d8'); R(44, 84, 6, 4, '#333'); R(86, 22, 30, 42, '#e0503a'); R(90, 28, 22, 14, '#f5d04a'); R(90, 46, 22, 12, '#2e2e6a'); R(30, 100, 26, 28, '#3a5a8a'); R(6, 30, 14, 14, '#f0eee8'); O(13, 37, 6, '#fafafa'); },
  ];
  BACK.forEach((f, i) => { cell(i, 128, 128, 0, 8); f(); });

  // ряд 1: фигуры в глубине комнаты (низ — пол; человек ~92 px = 1,75 м)
  const SHIRTS = ['#c0392b', '#2e86c1', '#27ae60', '#e67e22', '#8e44ad', '#f1c40f', '#ecf0f1', '#34495e'];
  const person = (cx, top, shirt, pants, arms) => {
    O(cx, top + 7, 7, '#e0b08a'); R(cx - 7, top - 1, 14, 6, ['#3a2a1a', '#d8b860', '#2a2a2a', '#8a3a1a'][(top + cx) % 4]);
    R(cx - 9, top + 14, 18, 34, shirt); R(cx - 8, top + 48, 7, 44, pants); R(cx + 1, top + 48, 7, 44, pants);
    if (arms) { R(cx - 15, top + 2, 5, 16, shirt); R(cx + 10, top + 2, 5, 16, shirt); } else { R(cx - 13, top + 15, 4, 28, shirt); R(cx + 9, top + 15, 4, 28, shirt); }
  };
  const CARDS = [
    () => person(32, 36, SHIRTS[0], '#2c3e50', 0),
    () => person(30, 40, SHIRTS[1], '#34495e', 0),
    () => person(34, 34, SHIRTS[2], '#5d4037', 1),
    () => { R(12, 92, 40, 6, '#6a4a2a'); R(14, 98, 4, 30, '#6a4a2a'); R(46, 98, 4, 30, '#6a4a2a'); R(44, 60, 6, 32, '#6a4a2a'); O(28, 56, 7, '#e0b08a'); R(19, 64, 18, 28, SHIRTS[3]); R(20, 92, 22, 7, '#2c3e50'); R(36, 92, 7, 36, '#2c3e50'); },
    () => { person(22, 40, SHIRTS[4], '#2c3e50', 0); O(48, 82, 5, '#e0b08a'); R(42, 87, 12, 20, SHIRTS[5]); R(43, 107, 4, 21, '#3a5a8a'); R(49, 107, 4, 21, '#3a5a8a'); },
    () => { R(30, 40, 3, 88, '#333'); R(22, 122, 20, 6, '#333'); x.fillStyle = '#f0d890'; x.beginPath(); x.moveTo(ox + 18, oy + 44); x.lineTo(ox + 46, oy + 44); x.lineTo(ox + 40, oy + 26); x.lineTo(ox + 24, oy + 26); x.fill(); },
    () => { R(20, 104, 24, 24, '#b5563a'); R(30, 60, 4, 44, '#5a3a1a'); for (let k = 0; k < 9; k++) O(32 + Math.sin(k * 2.4) * 14, 36 + k * 7, 9 - k * 0.4, k % 2 ? '#3f8a3c' : '#2f6e2e'); },
    () => { R(14, 100, 36, 28, '#8a6a4a'); O(30, 88, 9, '#d07a2a'); O(24, 79, 5, '#d07a2a'); R(20, 72, 3, 6, '#d07a2a'); R(26, 72, 3, 6, '#d07a2a'); R(38, 86, 10, 4, '#d07a2a'); },
    () => person(30, 38, SHIRTS[6], '#1a1a2a', 0),
    () => person(33, 42, SHIRTS[7], '#5a4a3a', 0),
    () => { person(32, 36, SHIRTS[5], '#2c3e50', 0); R(40, 50, 6, 9, '#111'); },
    () => { R(4, 60, 56, 3, '#aaa'); R(8, 63, 2, 65, '#aaa'); R(54, 63, 2, 65, '#aaa'); R(12, 63, 12, 26, '#e74c3c'); R(26, 63, 10, 20, '#ecf0f1'); R(38, 63, 14, 30, '#3498db'); },
    () => { R(14, 80, 36, 48, '#8a3a32'); R(10, 72, 8, 56, '#7a2a22'); R(46, 72, 8, 56, '#7a2a22'); R(14, 72, 36, 14, '#9a4a42'); },
    () => person(31, 37, SHIRTS[2], '#2c3e50', 1),
    () => { R(18, 108, 28, 20, '#3a3a3a'); O(32, 100, 10, '#d8d0c0'); O(24, 92, 5, '#d8d0c0'); O(40, 92, 5, '#d8d0c0'); R(44, 98, 10, 3, '#d8d0c0'); },
    () => person(32, 44, SHIRTS[1], '#7a5a3a', 0),
  ];
  CARDS.forEach((f, i) => { cell(i, 64, 128, 128, 16); f(); });

  // ряд 2: подоконник (низ — доска подоконника; 1 px ≈ 1 см в ширину, 1,6 см в высоту)
  const pot = (a, col) => { R(a - 6, 22, 12, 10, col || '#b5563a'); R(a - 7, 21, 14, 3, '#a04a30'); };
  const geran = a => { pot(a); R(a - 1, 12, 2, 10, '#3f7a3c'); O(a - 4, 12, 4, '#3f8a3c'); O(a + 4, 13, 4, '#3f8a3c'); O(a - 2, 7, 3, '#e03a3a'); O(a + 3, 8, 3, '#e8504a'); };
  const cactus = a => { pot(a, '#c8763a'); R(a - 3, 8, 6, 14, '#4a8a3a'); R(a - 7, 12, 4, 3, '#4a8a3a'); R(a - 7, 9, 3, 5, '#4a8a3a'); };
  const violet = a => { pot(a, '#e8e0d0'); O(a, 18, 6, '#3f7a3c'); O(a - 3, 15, 2, '#8a4ac8'); O(a + 3, 15, 2, '#9a5ad8'); O(a, 13, 2, '#8a4ac8'); };
  const aloe = a => { pot(a, '#7a8a9a'); for (let k = -2; k <= 2; k++) { x.fillStyle = '#5a9a5a'; x.beginPath(); x.moveTo(ox + a + k * 2, oy + 22); x.lineTo(ox + a + k * 5, oy + 4 + Math.abs(k) * 3); x.lineTo(ox + a + k * 2 + 2, oy + 22); x.fill(); } };
  const jars = a => { for (let k = 0; k < 3; k++) { R(a + k * 9, 14, 8, 18, 'rgba(200,220,210,0.95)'); R(a + k * 9 + 1, 20, 6, 11, ['#c0392b', '#e67e22', '#3f8a3c'][k]); R(a + k * 9, 12, 8, 3, '#d0b040'); } };
  const cat = (a, col) => { O(a, 24, 9, col); O(a + 7, 12, 6, col); R(a + 3, 4, 3, 5, col); R(a + 9, 4, 3, 5, col); R(a - 14, 28, 10, 3, col); };
  const toy = a => { O(a, 24, 7, '#c8a070'); O(a, 13, 6, '#c8a070'); O(a - 5, 8, 3, '#c8a070'); O(a + 5, 8, 3, '#c8a070'); };
  const SILLS = [
    () => { geran(20); geran(48); violet(100); },
    () => { cactus(30); aloe(64); cactus(96); },
    () => { cat(60, '#2a2a2a'); },
    () => { jars(14); geran(96); },
    () => { violet(22); violet(40); violet(58); },
    () => { cat(36, '#d07a2a'); aloe(100); },
    () => { geran(64); },
    () => { toy(28); cactus(104); },
    () => { aloe(18); jars(70); },
    () => { geran(16); cactus(40); violet(64); geran(110); },
    () => { cat(92, '#8a8a8a'); violet(24); },
    () => { cactus(64); },
    () => { jars(46); },
    () => { geran(26); aloe(108); },
    () => { violet(100); toy(30); },
    () => { cat(50, '#f0ece0'); geran(108); },
  ];
  SILLS.forEach((f, i) => { cell(i, 128, 32, 256, 8); f(); });

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 1;
  return t;
}

const U = {
  uT: { value: 0 }, uNight: { value: 0 }, uLod: { value: 70 },
  uDark: { value: new THREE.Color(1, 1, 1) }, uSky: { value: new THREE.Color(0.6, 0.8, 0.95) },
  uAtlas: { value: null },
};

const VERT_HEAD = 'attribute vec3 iP;\nattribute vec4 iD;\nattribute vec2 iS;\nvarying vec4 vW;\nvarying vec4 vN;\nvarying vec3 vView;\n';
// position.xy общего четырёхугольника — это u, v окна (0…1)
const VERT_BEGIN = `
  vec3 Tt = vec3(iD.y, 0.0, -iD.x);
  vec3 transformed = iP + Tt * (position.x * iD.z) + vec3(0.0, position.y * iD.w, 0.0);
  vec3 Vv = transformed - cameraPosition;
  vView = vec3(dot(Vv, Tt), Vv.y, dot(Vv, vec3(iD.x, 0.0, iD.y)));
  vW = vec4(position.xy, iS); vN = iD;`;

const FRAG_HEAD = `
uniform float uT, uNight, uLod;
uniform vec3 uDark, uSky;
uniform sampler2D uAtlas;
varying vec4 vW;
varying vec4 vN;
varying vec3 vView;
vec4 wh4 (float s) { vec4 p = fract(vec4(s) * vec4(443.897, 441.423, 437.195, 444.129) + vec4(0.13, 0.71, 0.37, 0.53)); p += dot(p, p.wzxy + 19.19); return fract((p.xxyz + p.yzzw) * p.zywx); }
vec3 wpick (float k, vec3 a, vec3 b, vec3 c, vec3 d, vec3 e, vec3 f) { k *= 6.0; return k < 1.0 ? a : k < 2.0 ? b : k < 3.0 ? c : k < 4.0 ? d : k < 5.0 ? e : f; }
`;

/* цвета в шейдере — линейные (квадрат от sRGB, приблизительно) */
const FRAG_BODY = `
  vec2 S = vN.zw;
  vec2 lp = vW.xy * S;
  float seed = vW.z, sty = vW.w;
  vec4 A = wh4(seed), B = wh4(seed + 0.371), C = wh4(seed + 0.719), E = wh4(seed + 0.113);
  // рама и переплёт
  float ft = mod(sty, 8.0), fc = floor(sty / 8.0 + 0.01);
  if (C.z < 0.14) { ft = 2.0; fc = 0.0; }                  // жильцы поставили свой стеклопакет
  float ew = max(max(fwidth(lp.x), fwidth(lp.y)), 1e-4);
  const float F = 0.085, Bw = 0.035;
  float d = min(min(lp.x, S.x - lp.x), min(lp.y, S.y - lp.y)) - F;
  float ty = S.y * 0.68;
  if (ft < 0.5) { d = min(d, abs(lp.x - S.x * 0.5) - Bw); d = min(d, abs(lp.y - ty) - Bw); }
  else if (ft < 1.5) { d = min(d, abs(lp.y - ty) - Bw); if (lp.y < ty) d = min(d, abs(lp.x - S.x * 0.5) - Bw); }
  else if (ft < 2.5) { d = min(d, abs(lp.x - S.x * 0.5) - Bw); }
  else if (ft < 3.5) { d = min(d, abs(lp.x - S.x / 3.0) - Bw); d = min(d, abs(lp.x - S.x * 2.0 / 3.0) - Bw); d = min(d, abs(lp.y - S.y * 0.74) - Bw); }
  else { d = min(d, abs(lp.y - S.y * 0.74) - Bw); if (lp.y > S.y * 0.74) d = min(d, abs(lp.x - S.x * 0.4) - Bw); }
  float cov = clamp(0.5 - d / ew, 0.0, 1.0);
  cov = mix(cov, 0.26, smoothstep(Bw, Bw * 4.0, ew));       // вдали рама — усреднённая, не рябит
  vec3 fcol = fc < 0.5 ? vec3(0.80, 0.80, 0.76) : fc < 1.5 ? vec3(0.17, 0.08, 0.035) : vec3(0.28, 0.30, 0.33);
  // свет: горит ли сейчас и какой. Автор 10.10.2026: «хаотично включается и выключается повсюду — визуальный шум».
  // Теперь у 88 % окон свет на всю ночь один (горит или нет); переключаются только 12 % — раз в 4—10 минут,
  // и не щелчком, а плавно за ~1,2 с
  float per = 240.0 + seed * 360.0;
  float ph = uT / per + seed * 13.0;
  float slot = step(0.88, fract(seed * 57.31)) * floor(ph);
  float on0 = step(0.64, fract(sin((slot + seed * 91.7) * 12.9898) * 43758.5453));
  float on1 = step(0.64, fract(sin((slot - 1.0 + seed * 91.7) * 12.9898) * 43758.5453));
  float on = slot > 0.0 ? mix(on1, on0, smoothstep(0.0, 1.2 / per, fract(ph))) : on0;
  vec3 L;
  if (B.x < 0.09) L = vec3(0.22, 0.4, 1.0) * (0.75 + 0.12 * sin(uT * 2.1 + seed * 30.0) + 0.06 * sin(uT * 5.3 + seed * 11.0));   // телевизор: мерцает мягко и медленно
  else if (B.x < 0.12) L = vec3(0.5, 0.1, 1.0);           // фитолампа над рассадой
  else if (B.x < 0.32) L = vec3(0.72, 0.85, 1.0);         // холодный белый
  else L = mix(vec3(1.0, 0.58, 0.24), vec3(1.0, 0.78, 0.46), B.y);   // тёплый
  if (B.z < 0.004) on *= step(0.2, fract(sin(floor(uT * 3.0) + seed * 77.0) * 4375.85));   // лампа барахлит — мигает: редкое окно на район, не 3,5 % окон
  float lit = on * smoothstep(0.15, 0.7, uNight);
  vec3 wc = wpick(A.x, vec3(0.93, 0.87, 0.72), vec3(0.78, 0.86, 0.72), vec3(0.74, 0.82, 0.90), vec3(0.92, 0.78, 0.76), vec3(0.86, 0.78, 0.62), vec3(0.95, 0.92, 0.80));
  wc *= wc;
  vec3 nv = normalize(vView);
  float far = smoothstep(0.02, 0.06, ew);                // вдали: складки штор не рисуем (рябили бы), стекло больше отражает
  float fres = 0.07 + 0.18 * far + 0.55 * pow(1.0 - abs(nv.z), 4.0);
  vec3 refl = uSky * (0.8 + 0.25 * vW.y);
  vec3 col;
  // без комнаты (вдали и на «окнах без комнат»): ровный цвет
  vec3 colF = mix(wc * 0.7 * 0.36 * uDark, L * (0.6 + 0.5 * wc), lit);
  float wd = length(vView);
#ifdef INTERIOR
  if (wd < uLod && cov < 0.99) {
    vec3 r = vView; r.z = min(r.z, -1e-3);
    float sx = 0.45 + A.y * 0.9, RH = 2.75, D = 2.6 + A.z * 2.4;
    const float sill = 0.85;
    vec3 o = vec3(lp, 0.0);
    vec3 inv = 1.0 / r;
    vec3 tf = max((vec3(-sx, -sill, -D) - o) * inv, (vec3(S.x + sx, RH - sill, 0.0) - o) * inv);
    float t = min(min(tf.x, tf.y), tf.z);
    vec3 p = o + r * t;
    vec3 alb;
    if (t == tf.z) {                                     // задняя стена: обои и мебель
      alb = wc * (C.w < 0.5 ? 1.0 - 0.08 * step(0.5, fract(p.x * 3.0)) : 1.0 - 0.06 * step(0.8, fract(p.x * 4.0) + fract(p.y * 4.0) * 0.3));
      vec2 q = vec2((p.x + sx) / (S.x + 2.0 * sx), (p.y + sill) / RH);
      float ci = floor(A.w * 8.0);
      vec4 tx = texture2D(uAtlas, vec2((ci + 0.02 + q.x * 0.96) * 0.125, 0.75 + (0.01 + q.y * 0.98) * 0.25));
      alb = mix(alb, tx.rgb, tx.a);
    } else if (t == tf.y) alb = r.y < 0.0 ? (C.w < 0.6 ? vec3(0.2, 0.09, 0.035) : vec3(0.3, 0.05, 0.04)) : vec3(0.78, 0.77, 0.73);
    else alb = wc * 0.78;
    if (B.w < 0.42) {                                    // в глубине: человек, кот, торшер, фикус
      float zc = 0.9 + C.x * 1.4, tc = -zc / r.z;
      if (tc < t) {
        vec3 cp = o + r * tc;
        float ci = floor(fract(B.w * 7.31) * 16.0);
        // люди (не торшер, фикус, кот, сушилка, кресло, собака, сидящий) иногда ходят по комнате
        bool still = ci == 3.0 || ci == 5.0 || ci == 6.0 || ci == 7.0 || ci == 11.0 || ci == 12.0 || ci == 14.0;
        float mv = E.x < 0.35 && !still ? sin(uT * 0.21 + seed * 40.0) * 0.9 : 0.0;
        vec2 q = vec2((cp.x - S.x * (0.25 + 0.5 * C.y) - mv) / 1.2 + 0.5, (cp.y + sill) / 2.4);
        if (q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0) {
          vec4 tx = texture2D(uAtlas, vec2((ci + 0.03 + q.x * 0.94) * 0.0625, 0.5 + (0.01 + q.y * 0.98) * 0.25));
          if (tx.a > 0.5) { alb = tx.rgb; p = cp; }
        }
      }
    }
    vec3 dl = p - vec3(S.x * 0.5, RH - sill - 0.35, -D * 0.45);
    float bri = 0.45 + 1.1 / (1.0 + 0.35 * dot(dl, dl));
    col = mix(alb * (0.42 - 0.18 * clamp(-p.z / D, 0.0, 1.0)) * uDark * vec3(0.9, 0.96, 1.0), alb * L * bri * 1.5, lit);
    vec3 lgt = mix(0.6 * uDark * (1.0 - 0.6 * uNight), L * 0.4, lit);            // что у самого стекла: днём светлее комнаты, ночью — силуэт
    if (E.y < 0.4) {                                     // подоконник: цветы, банки, кот
      float ts = -0.2 / r.z;
      vec3 sp = o + r * ts;
      vec2 q = vec2(sp.x / S.x, sp.y / 0.5);
      if (q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0) {
        float ci = floor(E.z * 16.0), row = floor(ci / 8.0);
        vec4 tx = texture2D(uAtlas, vec2((mod(ci, 8.0) + 0.02 + q.x * 0.96) * 0.125, 0.4375 - row * 0.0625 + (0.03 + q.y * 0.94) * 0.0625));
        if (tx.a > 0.5) col = tx.rgb * lgt;
      }
    }
    col = mix(col, colF, smoothstep(uLod * 0.7, uLod, wd));   // к краю LOD комната плавно уходит в ровный цвет — не щёлкает
  } else
#endif
  col = colF;
  // шторы у стекла: по бокам, тюль, рулонная (и без комнаты — на телефоне и вдали)
  float ct = E.w;
  vec3 cc = wpick(fract(ct * 17.3), vec3(0.55, 0.12, 0.10), vec3(0.25, 0.40, 0.20), vec3(0.80, 0.65, 0.30), vec3(0.30, 0.35, 0.60), vec3(0.85, 0.78, 0.60), vec3(0.60, 0.30, 0.45));
  cc *= cc;
  vec3 cl = mix(0.75 * uDark * (1.0 - 0.6 * uNight), L * 0.95, lit);           // ночью штора светится насквозь
  float fold = mix(0.78 + 0.22 * sin(lp.x * 38.0 + seed * 10.0), 0.86, far);
  if (ct < 0.42) {
    if (ct > 0.33 || ct < 0.06) col = mix(col, vec3(0.8) * cl * mix(0.9 + 0.1 * sin(lp.x * 60.0), 0.95, far), 0.35);   // тюль
    float cw = S.x * (0.14 + 0.18 * fract(ct * 7.0));
    if (ct < 0.33 && (lp.x < cw || lp.x > S.x - cw)) col = cc * fold * cl;
  } else if (ct < 0.5) {
    if (lp.y > S.y * (0.7 - 0.5 * fract(ct * 13.0))) col = vec3(0.56, 0.5, 0.38) * cl * mix(0.92 + 0.08 * step(0.5, fract(lp.y * 10.0)), 0.96, far);
  }
  col = mix(col, refl, fres * (1.0 - 0.8 * lit));
  col = mix(col, fcol * uDark * (1.0 - 0.75 * uNight), cov);
  vec4 diffuseColor = vec4(col, opacity);`;

let MAT = null;
function material () {
  if (MAT) return MAT;
  U.uAtlas.value = atlas();
  MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });
  MAT.defines = STATS.interior ? { INTERIOR: 1 } : {};
  MAT.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <begin_vertex>', VERT_BEGIN);
    sh.fragmentShader = FRAG_HEAD + sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', FRAG_BODY);
  };
  MAT.customProgramCacheKey = () => 'windows' + (STATS.interior ? 1 : 0);
  return MAT;
}

/* слабое железо: телефон — комната только вблизи (или совсем без неё) */
export function quality ({ interior = 1, lod = 70 } = {}) {
  STATS.interior = interior ? 1 : 0; STATS.lod = lod; U.uLod.value = lod;
  if (MAT) { MAT.defines = interior ? { INTERIOR: 1 } : {}; MAT.needsUpdate = true; }
}

function dropArr () { this.array = null; }

/* все окна — по клеткам города: в клетке один вызов отрисовки (экземпляры одного четырёхугольника) */
export function build (scene) {
  const t0 = performance.now();
  const mat = material();
  const quad = new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3);
  const idx = new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1);
  for (const b of BUCKETS.values()) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', quad);
    g.setIndex(idx);
    const buf = new THREE.InstancedInterleavedBuffer(b.a.subarray(0, b.n * PER), PER, 1);
    buf.onUpload(dropArr);
    g.setAttribute('iP', new THREE.InterleavedBufferAttribute(buf, 3, 0));
    g.setAttribute('iD', new THREE.InterleavedBufferAttribute(buf, 4, 3));
    g.setAttribute('iS', new THREE.InterleavedBufferAttribute(buf, 2, 7));
    g.instanceCount = b.n;
    const c = new THREE.Vector3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
    g.boundingSphere = new THREE.Sphere(c, Math.hypot(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0) / 2 + 0.5);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(b.x0, b.y0, b.z0), new THREE.Vector3(b.x1, b.y1, b.z1));
    const m = new THREE.Mesh(g, mat);
    m.matrixAutoUpdate = false;
    m.name = 'windows';
    scene.add(m);
    STATS.meshes++; STATS.verts += b.n * 4;
  }
  BUCKETS.clear();
  STATS.ms = Math.round(performance.now() - t0);
}

/* каждый кадр из updateEnv: ночь (0—1), затемнение стен (как у склеек без света), небо, время */
export function update (night, dark, darkB, sky, t) {
  U.uNight.value = night;
  U.uDark.value.setRGB(dark, dark, darkB);
  U.uSky.value.copy(sky);
  U.uT.value = t;
}
