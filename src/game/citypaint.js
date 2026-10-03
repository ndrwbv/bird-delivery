/* ──────────────────────────────────────────────────────────────────────────
   Дома в цвет и муралы на торцах (блок 6 docs/IDEAS.md, CAREER.md → «Город: дома»).

   • Цвет стен — по номеру дома из карты (b.id), а не случайно: от запуска
     к запуску дом одного цвета. Жилые и общественные дома (не особняки, не
     частный сектор, не цеха и гаражи):
       – кирпичные — красный (3 из 6), белый (2 из 6) или жёлтый кирпич;
       – остальные: 16 % «покрашены целиком» — яркий цвет (терракота,
         голубой, горчица, мята, роза, сирень, апельсин, бирюза), прочие —
         спокойная советская палитра (бежевый, песочный, розовый, голубой,
         жёлтый, белый кирпич, светло-серый, мятный, персиковый, сиреневый).
   • Мурал — у 22 % жилых домов от 4 этажей, у которых есть торец (стена
     8—20 м, не длиннее 0,6 самой длинной): на торце, что смотрит к дороге,
     во всю стену фон и рисунок: птица, ракета, бегун, пицца, абстракция,
     атом, солнце над городом, лось. На этой стене нет окон и балконов.
     Рисунки — кодом на одном холсте-атласе, все муралы города — один меш
     (один вызов отрисовки), свет как у стен.
   В game.js: wallHex(b) — в osmBuildings, mural(...) — в facade, build() —
   в buildCity после склейки статики.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

/* жребий по строке: FNV-1a → [0, 1) */
const strHash = (s, k = 0) => { let h = 2166136261 ^ k; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); h = Math.imul(h ^ (h >>> 15), 2246822507); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };
const keyOf = b => (b.id !== undefined ? String(b.id) : b.p[0][0].toFixed(1) + ',' + b.p[0][1].toFixed(1));

export const DEBUG = { calm: 0, bold: 0, brick: 0, murals: 0, muralTried: 0, designs: {}, ms: 0, at: [] };   // at — [x, z, наружу x, z] торцов с муралом

const CALM = ['#e8d6b6', '#efdcae', '#ebc4b5', '#e3b3a5', '#bfd1e0', '#aac5dd', '#f0da92', '#f3e5b3', '#ece7dc', '#dcd8d0', '#c7dcc4', '#efcca6', '#d3c6de'];
const BOLD = ['#e08a62', '#79b3d8', '#efbf4a', '#86c7a2', '#d98a9a', '#a596d4', '#ef9f58', '#63a7a0'];
const BRICK = ['#b5684e', '#a75c45', '#bf7658', '#e9e3d6', '#e7e0d0', '#dfc68c'];
const BOLD_P = 0.16, MURAL_P = 0.22;

const paintable = b => (b.k === 'res' || b.k === 'pub') && !b.rich && b.st !== 'villa' && b.st !== 'priv';

/* цвет стен дома или null — тогда как было (цвет из карты / по типу) */
export function wallHex (b) {
  if (!paintable(b)) return null;
  const key = keyOf(b), h = strHash(key, 1), h2 = strHash(key, 7);
  if (b.st === 'brick') { DEBUG.brick++; return BRICK[(h2 * BRICK.length) | 0]; }
  if (h < BOLD_P) { DEBUG.bold++; b._bold = 1; return BOLD[(h2 * BOLD.length) | 0]; }
  DEBUG.calm++;
  return CALM[(h2 * CALM.length) | 0];
}

/* ═════════════ рисунки муралов: клетка 256×512, фон — цвет всей стены ═════════════ */
const CW = 256, CH = 512, COLS = 4, ROWS = 2, WHITE_H = 64;
const AW = CW * COLS, AH = CH * ROWS + WHITE_H;

function circle (x, cx, cy, r, col) { x.fillStyle = col; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); }
function poly (x, pts, col) { x.fillStyle = col; x.beginPath(); x.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]); x.closePath(); x.fill(); }
function line (x, pts, w, col) { x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath(); x.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]); x.stroke(); }

const DESIGNS = [
  { k: 'bird', bg: '#7ec4e8', draw (x) {                    // птица с пиццей на фоне неба
    circle(x, 196, 70, 38, '#ffe27a');
    for (const [cx, cy, r] of [[60, 120, 22], [86, 112, 28], [116, 122, 20], [150, 420, 26], [184, 410, 32], [214, 424, 22]]) circle(x, cx, cy, r, '#eaf6fd');
    poly(x, [40, 300, 150, 250, 220, 300, 140, 330], '#f07a2a');          // тело
    poly(x, [110, 270, 200, 150, 170, 290], '#e2561f');                    // крыло
    circle(x, 205, 268, 26, '#f07a2a');                                     // голова
    poly(x, [226, 262, 252, 272, 226, 282], '#ffcf3a');                    // клюв
    circle(x, 212, 260, 6, '#1d2433');
    poly(x, [40, 300, 8, 280, 14, 320], '#e2561f');                        // хвост
    poly(x, [120, 340, 176, 340, 148, 392], '#f6c35b');                    // пицца в лапах
    for (const [cx, cy] of [[140, 352], [158, 356], [148, 372]]) circle(x, cx, cy, 5, '#c8382c');
  } },
  { k: 'rocket', bg: '#26305e', draw (x) {                  // ракета в звёздах
    for (let i = 0; i < 40; i++) circle(x, (i * 97) % 240 + 8, (i * 151) % 480 + 16, 1.5 + (i % 3), '#f5f1d8');
    poly(x, [128, 70, 168, 160, 168, 340, 88, 340, 88, 160], '#eef0f2');   // корпус
    poly(x, [128, 70, 168, 160, 88, 160], '#d8382f');                      // нос
    poly(x, [88, 280, 50, 360, 88, 340], '#d8382f');
    poly(x, [168, 280, 206, 360, 168, 340], '#d8382f');
    circle(x, 128, 210, 20, '#3b6fb6'); circle(x, 128, 210, 13, '#9fd3f3');
    poly(x, [96, 340, 160, 340, 128, 470], '#ffb13b');                     // пламя
    poly(x, [110, 340, 146, 340, 128, 420], '#fff1a0');
  } },
  { k: 'runner', bg: '#e05a3a', draw (x) {                  // бегун на дорожке
    for (let i = 0; i < 3; i++) line(x, [0, 430 + i * 22, CW, 410 + i * 22], 6, '#f6d7c8');
    circle(x, 150, 120, 26, '#ffffff');
    line(x, [140, 150, 112, 270], 26, '#ffffff');                          // туловище
    line(x, [134, 175, 180, 210, 214, 180], 16, '#ffffff');                // рука вперёд
    line(x, [128, 185, 86, 220, 62, 196], 16, '#ffffff');                  // рука назад
    line(x, [112, 270, 170, 320, 160, 390], 18, '#ffffff');                // нога вперёд
    line(x, [112, 270, 76, 330, 30, 340], 18, '#ffffff');                  // нога назад
    poly(x, [208, 160, 230, 100, 244, 160], '#ffd23f');                    // факел
    line(x, [220, 176, 226, 160], 10, '#ffffff');
  } },
  { k: 'pizza', bg: '#f2c14e', draw (x) {                   // кусок пиццы
    poly(x, [40, 110, 216, 110, 128, 440], '#f9e08a');
    line(x, [40, 110, 216, 110], 30, '#c77b3a');
    for (const [cx, cy, r] of [[96, 170, 20], [156, 180, 22], [124, 250, 18], [110, 330, 14], [150, 290, 12]]) circle(x, cx, cy, r, '#cc3b2c');
    for (const [cx, cy] of [[80, 220], [170, 230], [134, 380]]) poly(x, [cx - 6, cy, cx + 6, cy, cx, cy + 22], '#f9e08a');
    for (const [cx, cy] of [[140, 210], [98, 270]]) circle(x, cx, cy, 6, '#3f8f4d');
  } },
  { k: 'abstract', bg: '#efe6d2', draw (x) {                // абстракция: круги и полосы
    circle(x, 90, 140, 70, '#d9452e');
    poly(x, [0, 300, CW, 200, CW, 250, 0, 350], '#2f5aa8');
    circle(x, 180, 330, 54, '#f2b632');
    poly(x, [30, 420, 120, 420, 75, 340], '#1d2433');
    line(x, [150, 60, 230, 140], 14, '#1d2433');
    for (let i = 0; i < 4; i++) poly(x, [160 + i * 22, 420, 172 + i * 22, 420, 172 + i * 22, 490, 160 + i * 22, 490], i % 2 ? '#d9452e' : '#2f5aa8');
  } },
  { k: 'atom', bg: '#9fd0e6', draw (x) {                    // мирный атом
    x.save(); x.translate(128, 250);
    for (const a of [0, Math.PI / 3, -Math.PI / 3]) { x.save(); x.rotate(a); x.strokeStyle = '#1f4f8a'; x.lineWidth = 9; x.beginPath(); x.ellipse(0, 0, 110, 40, 0, 0, Math.PI * 2); x.stroke(); x.restore(); }
    circle(x, 0, 0, 24, '#d8382f');
    for (const a of [0.4, 2.5, 4.4]) circle(x, Math.cos(a) * 110 * Math.cos(a * 0.3), Math.sin(a) * 40 + Math.cos(a) * 30, 10, '#f5f1d8');
    x.restore();
    poly(x, [20, 470, 60, 400, 100, 470], '#2f6a54'); poly(x, [150, 470, 200, 380, 250, 470], '#2f6a54');
  } },
  { k: 'sun', bg: '#ffb35c', draw (x) {                     // солнце над городом (Солнечный)
    circle(x, 128, 190, 62, '#fff0a8');
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; line(x, [128 + Math.cos(a) * 78, 190 + Math.sin(a) * 78, 128 + Math.cos(a) * 112, 190 + Math.sin(a) * 112], 9, '#fff0a8'); }
    for (const [x0, w, hh] of [[0, 46, 120], [50, 38, 90], [92, 60, 140], [156, 40, 100], [200, 56, 130]]) {
      poly(x, [x0, 440, x0 + w, 440, x0 + w, 440 - hh, x0, 440 - hh], '#7a4a8c');
      for (let r = 0; r < hh / 22 - 1; r++) for (let c = 0; c < w / 16 - 1; c++) poly(x, [x0 + 6 + c * 16, 440 - hh + 10 + r * 22, x0 + 14 + c * 16, 440 - hh + 10 + r * 22, x0 + 14 + c * 16, 440 - hh + 22 + r * 22, x0 + 6 + c * 16, 440 - hh + 22 + r * 22], '#ffd56b');
    }
    poly(x, [0, 440, CW, 440, CW, CH, 0, CH], '#4f86c6');
    for (let i = 0; i < 4; i++) line(x, [10, 460 + i * 12, 80, 452 + i * 12, 160, 462 + i * 12, 246, 454 + i * 12], 3, '#a9d2f2');
  } },
  { k: 'moose', bg: '#8fc79a', draw (x) {                   // лось в ельнике
    for (const [cx, by, s] of [[40, 300, 1], [220, 280, 1.2], [190, 330, 0.8]]) for (let k = 0; k < 3; k++) poly(x, [cx - 40 * s + k * 8 * s, by - k * 40 * s, cx + 40 * s - k * 8 * s, by - k * 40 * s, cx, by - k * 40 * s - 60 * s], '#2f6a54');
    const M = '#6b4630';
    poly(x, [60, 330, 190, 320, 196, 390, 70, 400], M);                    // туловище
    for (const lx of [74, 96, 164, 184]) line(x, [lx, 390, lx, 470], 12, M);
    poly(x, [180, 330, 214, 260, 236, 270, 210, 350], M);                 // шея
    poly(x, [206, 250, 250, 262, 252, 290, 214, 282], M);                 // голова
    line(x, [210, 252, 186, 214, 166, 222], 8, '#e6d2a6'); line(x, [186, 214, 192, 192], 8, '#e6d2a6');   // рога
    line(x, [222, 250, 236, 206, 256, 200], 8, '#e6d2a6'); line(x, [236, 206, 226, 188], 8, '#e6d2a6');
    poly(x, [0, 470, CW, 470, CW, CH, 0, CH], '#5e9e6a');
  } },
];

let ATLAS = null;
function atlas () {
  if (ATLAS) return ATLAS;
  const c = document.createElement('canvas');
  c.width = AW; c.height = AH;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, AW, AH);           // белая полоса снизу — под фон стены (цвет вершин)
  DESIGNS.forEach((d, i) => {
    const ox = (i % COLS) * CW, oy = ((i / COLS) | 0) * CH;
    x.save(); x.translate(ox, oy);
    x.beginPath(); x.rect(0, 0, CW, CH); x.clip();
    x.fillStyle = d.bg; x.fillRect(0, 0, CW, CH);
    x.save(); x.translate(10, 14); x.scale((CW - 20) / CW, (CH - 28) / CH); d.draw(x); x.restore();   // поля в цвет фона: соседняя клетка не просвечивает
    x.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  ATLAS = tex;
  return tex;
}

/* ═════════════ мурал на торце ═════════════ */
const P = [], UV = [], COL = [], NR = [], IDX = [];
const TC = new THREE.Color();
function quad (w, from, to, y0, y1, out, u0, v0, u1, v1, hex) {
  const ax = w.a[0] + w.ux * from + w.ox * out, az = w.a[1] + w.uz * from + w.oz * out;
  const bx = w.a[0] + w.ux * to + w.ox * out, bz = w.a[1] + w.uz * to + w.oz * out;
  const n = P.length / 3;
  P.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az);
  UV.push(u0, v0, u1, v0, u1, v1, u0, v1);
  TC.set(hex);
  for (let i = 0; i < 4; i++) { COL.push(TC.r, TC.g, TC.b); NR.push(w.ox, 0, w.oz); }
  // обход — против часовой снаружи: лицевая сторона смотрит из дома
  if (-w.uz * w.ox + w.ux * w.oz > 0) IDX.push(n, n + 1, n + 2, n, n + 2, n + 3);
  else IDX.push(n, n + 2, n + 1, n, n + 3, n + 2);
}

/* Выбрать торец под мурал и положить его. walls — стены из facade (a, len, ux/uz,
   ox/oz наружу). Вернёт стену (на ней facade не рисует окна) или null. */
export function mural (b, walls, base, h, lv, arch, api) {
  if (b.k !== 'res' || !paintable(b) || lv < 4 || walls.length < 4) return null;
  const key = keyOf(b);
  if (strHash(key, 3) >= MURAL_P) return null;
  DEBUG.muralTried++;
  let maxLen = 0;
  for (const w of walls) if (w.len > maxLen) maxLen = w.len;
  let best = null, bd = Infinity;
  for (const w of walls) {
    if (w.len < 8 || w.len > 20 || w.len > maxLen * 0.6) continue;
    if (arch && arch.cut.get(w.a) !== undefined) continue;
    const mx = w.a[0] + w.ux * w.len / 2 + w.ox * 12, mz = w.a[1] + w.uz * w.len / 2 + w.oz * 12;
    if (api.inHouse(mx, mz, 1)) continue;                    // торец в торец с соседом — не видно
    const r = api.nearestRoad(mx, mz, 7, 2);
    const d = r ? r.d : 200;
    if (d < bd) { bd = d; best = w; }
  }
  if (!best) return null;
  const y0 = base + 0.3, y1 = h - 0.5, W = best.len - 0.8, Hh = y1 - y0;
  // рисунок 1:2 — по высоте стены, но не шире торца
  let dh = Math.min(Hh - 1.2, (W - 1.0) * 2), dw = dh / 2;
  if (dh < 6) return null;
  const i = (strHash(key, 5) * DESIGNS.length) | 0, D = DESIGNS[i];
  const m0 = 0.4, mid = m0 + W / 2, dy0 = y0 + (Hh - dh) * 0.55, dy1 = dy0 + dh;
  const OUT = 0.11, wv = (WHITE_H / 2) / AH;                // белая точка атласа: фон берёт цвет вершин
  const fx0 = mid - dw / 2, fx1 = mid + dw / 2;
  // фон — четыре полосы вокруг рисунка (без нахлёста: не мерцает)
  quad(best, m0, fx0, y0, y1, OUT, 0.5, wv, 0.5, wv, D.bg);
  quad(best, fx1, m0 + W, y0, y1, OUT, 0.5, wv, 0.5, wv, D.bg);
  quad(best, fx0, fx1, y0, dy0, OUT, 0.5, wv, 0.5, wv, D.bg);
  quad(best, fx0, fx1, dy1, y1, OUT, 0.5, wv, 0.5, wv, D.bg);
  // рисунок: клетка атласа (v снизу вверх — холст переворачивается)
  const cu0 = (i % COLS) * CW / AW, cu1 = cu0 + CW / AW;
  const cv1 = 1 - ((i / COLS) | 0) * CH / AH, cv0 = cv1 - CH / AH;
  quad(best, fx0, fx1, dy0, dy1, OUT, cu0, cv0, cu1, cv1, '#ffffff');
  DEBUG.murals++;
  DEBUG.at.push([Math.round(best.a[0] + best.ux * best.len / 2), Math.round(best.a[1] + best.uz * best.len / 2), +best.ox.toFixed(2), +best.oz.toFixed(2)]);
  DEBUG.designs[D.k] = (DEBUG.designs[D.k] || 0) + 1;
  return best;
}

/* все муралы города — одним мешем */
export function build (scene) {
  const t0 = performance.now();
  if (!IDX.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(COL, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(NR, 3));
  g.setIndex(IDX);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: atlas(), vertexColors: true }));
  m.matrixAutoUpdate = false;
  m.name = 'murals';
  scene.add(m);
  P.length = UV.length = COL.length = NR.length = IDX.length = 0;
  DEBUG.ms = Math.round(performance.now() - t0);
  return m;
}
