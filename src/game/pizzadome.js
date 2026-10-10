/* ──────────────────────────────────────────────────────────────────────────
   Пиццерия-купол (docs/IDEAS.md, блок 6; правила — docs/CAREER.md «Город: как выглядит»).

   Пиццерия — не первый этаж жилого дома, а отдельное здание: полусфера-купол
   в цветах логотипа (бордовый #3d0d01 / #5a1608, оранжевый, светлая обводка
   #ffb347) — DOME.R = 9 м (18 м в поперечнике, 9 м высотой) на низком светлом
   цоколе DOME.PLINTH = 0,45 м. Купол — 12 долек двух оранжевых тонов без тёмных
   полос, светлая макушка со светящимся ободком; на ней сидит большая птица из
   логотипа (DOME.BIRD = 1,3 → ~7 м, верх — ~17 м над землёй) с куском пиццы в
   лапе: одна сетка, голова и крылья двигаются в шейдере.
   • Окна — 14: круги-«пепперони» и 2 дольки пиццы (0,75—1,35 м) на разной
     высоте, толстая светлая рама (ночью светится). Сквозь стекло виден зал
     (interior mapping, winMat): два ряда столиков, люди едят — кусок то у
     тарелки, то у рта, — задняя стена с прилавком, печью, меню и лампами, пол
     в клетку. Дальше ~65 м — ровный тёплый цвет.
   • Вход — арка-портал из купола к улице (DOME.PORCH = 1,6 м): бордовый свод,
     светлая арка (ночью светится), стеклянная стена с двойной дверью (за ней —
     тот же зал), полосатая маркиза, две ступеньки, коврик.
   • Вывеска — название объёмными буквами шрифта меню (Rubik Mono One,
     signfont.json из tools/sign-glyphs.py), дугой на куполе над аркой: лицо
     светлое, бока бордовые, ночью светятся. Букв нет в шрифте — «PTITSA PIZZA».
   • Окно выдачи курьерам — будка сбоку, со стороны парковки (62° от входа):
     тёплое окошко, полка, полосатый козырёк, табличка «ВЫДАЧА КУРЬЕРАМ»;
     коробка вылетает отсюда (wx, wz). От будки к стоянке — дорожка из плитки.
   • Летняя веранда на площади (DOME.PLAZA = 4,6 м): столики под пёстрыми
     зонтиками (бордовый/оранжевый, оранжевый/светлый), по два стула, низкий
     заборчик с проходами, кадки с цветами; столики и заборчик сбиваются.
     Гостей сажает growth.js (по ступени пиццерии: у «загибается» — пусто).
   Ночью купол, птица и буквы светятся своим цветом, у цоколя — светильники.
   Вызовов отрисовки на купол — 5 (купол, окна с залом, буквы, птица, табличка
   выдачи; остальное — в общих склейках города), у шара было 7.

   Место (site): рядом с прежней точкой пиццерии района — ближайшее к улице,
   где у неё стоял дом (по кольцам от точки на улице, до DOME.SEARCH м):
     • край купола — в DOME.GAP (2—12 м) от края полотна улицы (не двора,
       класс ≤ 4), вход смотрит на улицу; край купола, вход со ступеньками и
       коврик — не на тротуаре, дорожке, аллее (pave.js);
     • под куполом, площадью и дорожкой — ни дома, ни дороги/дорожки, ни
       забора/стены/рельсов, ни парковки, ни воды и спортплощадки;
       перепад высот под куполом — не больше DOME.SLOPE (цоколь уходит в
       землю на 1,6 м — не висит над склоном);
     • в том же районе, что и прежний дом;
     • рядом с куполом помещается парковка курьеров.
   Не нашлось — пиццерия остаётся в доме (старый фасад, game.js dodoFacade).

   Купол — препятствие (кольцо стен по цоколю, R + 0,2 м, портал со ступеньками,
   будка выдачи) и «дом» для всего, что расставляется после (деревья, лавочки,
   гаражи, ельник не встают в него).
   Переменных игры модуль не видит — всё приходит в api (pizzaApi в game.js).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { courierLot, lotBase } from './pizzeria.js';
import { seasonMat } from './seasons.js';
import { onPave } from './pave.js';
import { t } from '../i18n/index.js';
import SIGNFONT from './signfont.json';

export const DOME = { R: 9, PLINTH: 0.45, BIRD: 1.3, GAP: [2, 12], SEARCH: 200, STEP: 4, SLOPE: 1.6, PLAZA: 4.6, PORCH: 1.6 };

/* цвета логотипа (src/styles/paper.css --brand-*) */
const BRD = '#3d0d01', BRD2 = '#5a1608', ORANGE = '#ff9636', ORANGE2 = '#ffae52', GLOW = '#ffb347', CREAM = '#ffe3b0';
const DOMES = [];                       // { x, z, R, base, gy, bird, ry, dist, sign, letters, signGlow, road, free, extra, porch, ring }
let DOME_MAT = null, BIRD_MAT = null, BIRD_GEO = null, WIN_MAT = null;
const ST = { tries: 0, ms: 0, night: -1, t: 0 };
const DAYGLOW = 0.12;                    // и днём чуть светится своим цветом — оранжевый не уходит в бурый в тени
const BU = { uYaw: { value: 0 }, uWing: { value: 0 } };     // поворот головы и взмах крыльев птицы (step)

function canvasTex (c) {
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
  return tx;
}
/* ── окна купола: сквозь стекло виден зал (interior mapping, как окна домов в windows.js) ──
   Луч из глаза идёт сквозь стекло внутрь купола: в 2,2 м за стеклом — ближний ряд столиков с людьми, в 4,6 м —
   дальний (чуть темнее), в 7,5 м — задняя стена (прилавок, печь, меню, лампы), ниже — пол в клетку, выше — свод.
   Люди едят: у каждого столика своя пара кадров (кусок у тарелки / у рта), кадр меняется раз в 2—4 с.
   Картинки — один холст 1024 × 512: верх — стена зала (16 × 5 м), низ — 4 клетки столиков (2,6 × 2,6 м).
   Все окна и стекло входа — одна сетка на купол (один вызов отрисовки); дальше ~65 м — ровный тёплый цвет */
const HU = { uT: { value: 0 }, uNight: { value: 0 }, uHall: { value: null } };
function hallTex () {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const x = c.getContext('2d');
  // ── стена зала: 16 м × 5 м → 64 px/м по ширине, 51 px/м по высоте; низ стены — y = 256
  const WX = m => m * 64, WY = m => 256 - m * 51.2;
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#ff9a3c'); g.addColorStop(0.45, '#ffd08a'); g.addColorStop(1, '#ffe2b0');
  x.fillStyle = g; x.fillRect(0, 0, 1024, 256);
  x.fillStyle = '#7a2410'; x.fillRect(0, WY(1.0), 1024, 51.2);                         // панель понизу
  x.fillStyle = '#ffe9c4'; x.fillRect(0, WY(1.05), 1024, 4);
  // прилавок с печью и меню (6—11 м)
  x.fillStyle = '#5a1608'; x.fillRect(WX(5.6), WY(1.15), WX(5.6), 1.15 * 51.2);
  x.fillStyle = '#ff9636'; x.fillRect(WX(5.6), WY(1.15), WX(5.6), 6);
  x.fillStyle = '#3d0d01'; x.beginPath(); x.arc(WX(8.4), WY(1.2), WX(1.1), Math.PI, 0); x.fill();   // печь
  x.fillStyle = '#ff5a1f'; x.beginPath(); x.arc(WX(8.4), WY(1.2), WX(0.8), Math.PI, 0); x.fill();
  x.fillStyle = '#ffe14a'; x.beginPath(); x.arc(WX(8.4), WY(1.2), WX(0.42), Math.PI, 0); x.fill();
  for (const m of [6.0, 10.2]) { x.fillStyle = '#2c1a12'; x.fillRect(WX(m), WY(3.6), WX(1.2), 1.0 * 51.2);   // доски меню
    x.fillStyle = '#ffe9c4'; for (let i = 0; i < 4; i++) x.fillRect(WX(m) + 8, WY(3.45) + i * 11, WX(0.8) - (i % 2) * 14, 3); }
  for (let i = 0; i < 4; i++) { x.fillStyle = i % 2 ? '#fff0d2' : '#ffe2a8'; x.fillRect(WX(10.4), WY(1.3 + i * 0.16), WX(0.6), 7); }   // коробки на прилавке
  // повар за прилавком
  x.fillStyle = '#fff3dc'; x.fillRect(WX(7.0) - 9, WY(1.95) - 26, 18, 14);
  x.fillStyle = '#f2c29b'; x.beginPath(); x.arc(WX(7.0), WY(1.75), 9, 0, 7); x.fill();
  x.fillStyle = '#fff3dc'; x.fillRect(WX(7.0) - 12, WY(1.6), 24, WY(1.15) - WY(1.6));
  // постеры с птицей, лампы-плафоны, кадки с зеленью
  for (const m of [1.6, 13.4]) {
    x.fillStyle = '#3d0d01'; x.fillRect(WX(m), WY(3.3), WX(1.3), 1.4 * 51.2);
    x.fillStyle = '#ff9636'; x.beginPath(); x.ellipse(WX(m + 0.65), WY(2.6), 22, 16, 0, 0, 7); x.fill();
    x.beginPath(); x.arc(WX(m + 0.95), WY(2.95), 10, 0, 7); x.fill();
    x.fillStyle = '#ffd23f'; x.beginPath(); x.moveTo(WX(m + 1.08), WY(2.98)); x.lineTo(WX(m + 1.25), WY(2.9)); x.lineTo(WX(m + 1.08), WY(2.82)); x.fill();
  }
  for (let i = 0; i < 8; i++) {
    const lx = WX(1 + i * 2);
    x.fillStyle = '#3d0d01'; x.fillRect(lx - 1, 0, 2, WY(4.1));
    x.fillStyle = '#ff9636'; x.beginPath(); x.moveTo(lx - 14, WY(3.8)); x.lineTo(lx + 14, WY(3.8)); x.lineTo(lx + 7, WY(4.1)); x.lineTo(lx - 7, WY(4.1)); x.fill();
    x.fillStyle = '#fffbe0'; x.beginPath(); x.arc(lx, WY(3.78), 6, 0, Math.PI); x.fill();
  }
  for (const m of [0.6, 4.4, 12.2, 15.2]) { x.fillStyle = '#b0502a'; x.fillRect(WX(m), WY(0.6), 22, 0.6 * 51.2); x.fillStyle = '#4c9a3a'; x.beginPath(); x.arc(WX(m) + 11, WY(0.85), 16, 0, 7); x.fill(); }
  // ── столики с людьми: клетка 256 × 256 = 2,6 × 2,6 м (98 px/м), низ клетки — пол; фон прозрачный
  const P = 98;
  const person = (ox, cx, face, shirt, hair, up, kid) => {   // сидит в профиль, лицом к столу (face = ±1)
    const k = kid ? 0.78 : 1, Y = m => 256 - m * P;
    x.fillStyle = '#8a4a22'; x.fillRect(ox + cx - face * 22 - 4, Y(0.92 * k), 6, (0.47 * k) * P);   // спинка стула
    x.fillRect(ox + cx - 20, Y(0.46), 40, 6); x.fillRect(ox + cx - 18, Y(0.46), 4, 0.46 * P); x.fillRect(ox + cx + 14, Y(0.46), 4, 0.46 * P);
    x.fillStyle = '#3a3550'; x.fillRect(ox + cx - 6 + face * 4, Y(0.5), 30 * face, 10);                  // бедро
    x.fillRect(ox + cx + face * 22 - 4, Y(0.5), 9, 0.5 * P);                                           // голень
    x.fillStyle = shirt; x.beginPath(); x.roundRect ? x.roundRect(ox + cx - 15, Y(0.5 + 0.58 * k), 30, 0.6 * k * P, 8) : x.rect(ox + cx - 15, Y(0.5 + 0.58 * k), 30, 0.6 * k * P); x.fill();
    const hy = Y(0.5 + 0.58 * k + 0.15 * k);
    x.fillStyle = '#f2c29b'; x.beginPath(); x.arc(ox + cx + face * 2, hy, 13 * k, 0, 7); x.fill();
    x.fillStyle = hair; x.beginPath(); x.arc(ox + cx - face * 1, hy - 4 * k, 13 * k, Math.PI, 0); x.fill();
    x.fillStyle = '#1b1a1f'; x.fillRect(ox + cx + face * 8 - 2, hy - 3, 3, 3);                           // глаз
    // рука с куском пиццы: у тарелки или у рта
    const sx = ox + cx + face * 6, sy = Y(0.5 + 0.48 * k);
    const hx = up ? ox + cx + face * 17 : ox + cx + face * 34, hy2 = up ? hy + 6 : Y(0.8);
    x.strokeStyle = shirt; x.lineWidth = 8; x.lineCap = 'round'; x.beginPath(); x.moveTo(sx, sy); x.lineTo(hx, hy2); x.stroke();
    x.fillStyle = '#ffd25a'; x.beginPath(); x.moveTo(hx, hy2 - 5); x.lineTo(hx + face * 16, hy2 - (up ? 12 : 2)); x.lineTo(hx + face * 3, hy2 + 7); x.fill();
    x.fillStyle = '#b0301c'; x.beginPath(); x.arc(hx + face * 7, hy2 - 1, 2.5, 0, 7); x.fill();
  };
  const table = (ox, cx) => {
    x.fillStyle = '#5a1608'; x.fillRect(ox + cx - 4, 256 - 0.75 * P, 8, 0.75 * P); x.fillRect(ox + cx - 22, 250, 44, 6);
    x.fillStyle = '#fff0d2'; x.fillRect(ox + cx - 46, 256 - 0.78 * P, 92, 7);                          // скатерть
    x.fillStyle = '#d98a2e'; x.beginPath(); x.ellipse(ox + cx, 256 - 0.8 * P, 30, 6, 0, 0, 7); x.fill();   // пицца
    x.fillStyle = '#ffd25a'; x.beginPath(); x.ellipse(ox + cx, 256 - 0.81 * P, 25, 4, 0, 0, 7); x.fill();
    x.fillStyle = '#9fd3e8'; x.fillRect(ox + cx + 30, 256 - 0.92 * P, 6, 12); x.fillRect(ox + cx - 36, 256 - 0.92 * P, 6, 12);
  };
  const SH = ['#3a7bd5', '#e04836', '#5bd66a', '#ffd23f', '#9b59b6', '#ff8a2b'], HR = ['#3b2414', '#1b1a1f', '#c8741e', '#6b4c3a'];
  for (let k = 0; k < 4; k++) {
    const ox = k * 256, fr = k % 2, v = k >> 1;
    table(ox, 128);
    if (!v) { person(ox, 66, 1, SH[0], HR[0], fr === 0); person(ox, 190, -1, SH[1], HR[1], fr === 1); }
    else { person(ox, 66, 1, SH[2], HR[2], fr === 1); person(ox, 190, -1, SH[4], HR[3], fr === 0, true); }
  }
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace; tx.generateMipmaps = false; tx.minFilter = THREE.LinearFilter;
  return tx;
}
function winMat () {
  if (WIN_MAT) return WIN_MAT;
  HU.uHall.value = hallTex();
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, HU);
    sh.vertexShader = 'attribute vec3 aC, aN;\nattribute vec2 aF;\nvarying vec3 vWp, vC, vNn;\nvarying vec2 vF;\n' +
      sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vC = aC; vNn = aN; vF = aF;');
    sh.fragmentShader = `uniform sampler2D uHall;
uniform float uT, uNight;
varying vec3 vWp, vC, vNn;
varying vec2 vF;
float hh (float a) { return fract(sin(a * 91.17 + 3.1) * 43758.55); }
vec4 row (vec3 p, vec3 tg, float fy, float sd) {
  float u = dot(p - vC, tg) / 2.6 + sd, v = (p.y - fy) / 2.6;
  if (v < 0.0 || v > 1.0) return vec4(0.0);
  float tl = floor(u), hs = hh(tl + sd * 17.0);
  float fr = step(0.5, fract(uT / (2.0 + 2.0 * hs) + hs));
  float cell = mod(tl + floor(hs * 2.0), 2.0) * 2.0 + fr;
  return texture2D(uHall, vec2((cell + clamp(fract(u), 0.01, 0.99)) * 0.25, 0.005 + v * 0.49));
}
` + sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
  vec3 n = normalize(vNn), tg = normalize(vec3(n.z, 0.0, -n.x));
  vec3 rd = normalize(vWp - cameraPosition);
  float rz = max(dot(rd, -n), 0.08), fy = vF.x, sd = vF.y;
  vec3 pb = vWp + rd * (7.5 / rz), col;
  if (pb.y < fy) {
    vec3 pf = vWp + rd * ((fy - vWp.y) / min(rd.y, -1e-3));
    vec2 q = floor(pf.xz * 2.0);
    col = mod(q.x + q.y, 2.0) < 0.5 ? vec3(0.85, 0.66, 0.45) : vec3(0.62, 0.30, 0.16);
  } else if (pb.y > fy + 5.0) col = vec3(1.0, 0.36, 0.09);
  else col = texture2D(uHall, vec2(fract(dot(pb - vC, tg) / 16.0 + sd * 0.37), 0.502 + (pb.y - fy) / 5.0 * 0.496)).rgb;
  vec4 q = row(vWp + rd * (4.6 / rz), tg, fy, sd + 0.5);
  if (q.a > 0.5) col = q.rgb * 0.8;
  q = row(vWp + rd * (2.2 / rz), tg, fy, sd);
  if (q.a > 0.5) col = q.rgb;
  col *= mix(0.9, 1.25, uNight);
  col = mix(col, vec3(0.3, 0.5, 0.75), (1.0 - uNight) * (0.1 + 0.4 * pow(1.0 - rz, 3.0)));
  col = mix(col, vec3(1.0, 0.42, 0.12) * mix(0.75, 1.15, uNight), smoothstep(50.0, 70.0, length(vWp - cameraPosition)));
  vec4 diffuseColor = vec4(col, opacity);`);
  };
  m.customProgramCacheKey = () => 'pzhall';
  WIN_MAT = m;
  return m;
}
/* стекло в общую сетку окон: c — середина, n — наружу, fy — пол зала, sd — зерно (какие столики видны) */
function glassAdd (acc, g, c, n, fy, sd) {
  const ng = g.index ? g.toNonIndexed() : g, p = ng.attributes.position;
  for (let i = 0; i < p.count; i++) { acc.p.push(p.getX(i), p.getY(i), p.getZ(i)); acc.c.push(c[0], c[1], c[2]); acc.n.push(n[0], n[1], n[2]); acc.f.push(fy, sd); }
}
/* форма окна в плоскости XY: круг-«пепперони» или долька пиццы остриём вниз */
function winShape (kind, r) {
  if (kind === 'o') return new THREE.CircleGeometry(r, 20);
  const sh = new THREE.Shape();
  sh.moveTo(0, -r * 1.15); sh.lineTo(r * 0.95, r * 0.55);
  sh.quadraticCurveTo(0, r * 1.05, -r * 0.95, r * 0.55); sh.closePath();
  return new THREE.ShapeGeometry(sh, 6);
}
/* табличка у окна выдачи курьерам — один холст на все купола */
let PLATE_MAT = null;
function plateMat () {
  if (PLATE_MAT) return PLATE_MAT;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = BRD; x.fillRect(0, 0, 256, 64);
  x.strokeStyle = GLOW; x.lineWidth = 4; x.strokeRect(4, 4, 248, 56);
  x.fillStyle = '#fff0d2'; x.fillRect(16, 20, 30, 24); x.fillStyle = '#d9342c'; x.fillRect(26, 30, 10, 4);   // коробка
  x.fillStyle = GLOW; x.textAlign = 'center'; x.textBaseline = 'middle';
  const txt = t('ВЫДАЧА КУРЬЕРАМ');
  let fs = 30;
  do { x.font = 'bold ' + fs + 'px sans-serif'; fs -= 2; } while (x.measureText(txt).width > 190 && fs > 10);
  x.fillText(txt, 150, 33);
  PLATE_MAT = new THREE.MeshBasicMaterial({ map: canvasTex(c) });
  return PLATE_MAT;
}
/* ── объёмная вывеска: название буквами шрифта меню (Rubik Mono One), выдавленными на 0,28 м ──
   Контуры букв — src/game/signfont.json (tools/sign-glyphs.py разбирает public/fonts/RubikMonoOne-Regular.ttf):
   заглавные латиница и кириллица, буквы всех языков игры, что есть в шрифте. Нет буквы (японский, китайский) —
   латиницей «PTITSA PIZZA». Буквы лежат на куполе дугой над входом: лицо светлое, бока бордовые, ночью светятся.
   Сетка — одна на название (все купола), в рамке купола: центр — (0, 0, 0), вход — +Z */
const SIGN = { H: 0.74, DEPTH: 0.28, EL: 37, OUT: 0.06, TRACK: 0.88, TURN: 0.5 };   // высота букв, толщина, где низ (° над горизонтом), шаг букв, доля поворота по дуге
const SIGN_GEO = new Map();
function contour (path, c) {                        // контур TrueType: квадратичные кривые, между двумя «вне кривой» — середина
  const n = c.length / 3, pt = k => { const q = ((k % n) + n) % n; return [c[q * 3], c[q * 3 + 1], c[q * 3 + 2]]; };
  let s = 0;
  while (s < n && !pt(s)[2]) s++;
  let st;
  const seq = [];
  if (s < n) { st = pt(s); for (let i = 1; i < n; i++) seq.push(pt(s + i)); }
  else { const a = pt(0), b = pt(1); st = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 1]; for (let i = 1; i <= n; i++) seq.push(pt(i)); }
  path.moveTo(st[0], st[1]);
  let off = null;
  for (const q of seq) {
    if (q[2]) { if (off) path.quadraticCurveTo(off[0], off[1], q[0], q[1]); else path.lineTo(q[0], q[1]); off = null; }
    else { if (off) path.quadraticCurveTo(off[0], off[1], (off[0] + q[0]) / 2, (off[1] + q[1]) / 2); off = q; }
  }
  if (off) path.quadraticCurveTo(off[0], off[1], st[0], st[1]); else path.lineTo(st[0], st[1]);
}
function area (c) { let a = 0; const n = c.length / 3; for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += c[i * 3] * c[j * 3 + 1] - c[j * 3] * c[i * 3 + 1]; } return a / 2; }
function inside (c, x, y) {
  let r = false; const n = c.length / 3;
  for (let i = 0, j = n - 1; i < n; j = i++) { const xi = c[i * 3], yi = c[i * 3 + 1], xj = c[j * 3], yj = c[j * 3 + 1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) r = !r; }
  return r;
}
function glyphShapes (cs) {
  const outer = cs.filter(c => area(c) < 0), holes = cs.filter(c => area(c) >= 0);   // TrueType: внешние — по часовой
  return outer.map(o => {
    const sh = new THREE.Shape(); contour(sh, o);
    for (const h of holes) if (inside(o, h[0], h[1])) { const p = new THREE.Path(); contour(p, h); sh.holes.push(p); }
    return sh;
  });
}
function signGeo (text, R) {
  let txt = String(text || '').toUpperCase().replace(/[«»"]/g, '');
  if ([...txt].some(ch => !SIGNFONT.g[ch])) txt = 'PTITSA PIZZA';
  if (SIGN_GEO.has(txt)) return SIGN_GEO.get(txt);
  const s = SIGN.H / 700, W = [...txt].reduce((a, ch) => a + SIGNFONT.g[ch][0], 0) * s * SIGN.TRACK;
  const el = SIGN.EL * Math.PI / 180, mid = el + SIGN.H / 2 / R, rr = R * Math.cos(mid);
  const pos = [], col = [], cF = new THREE.Color('#fff3dc'), cS = new THREE.Color(BRD2), M = new THREE.Matrix4(), E = new THREE.Euler();
  let x = 0;
  for (const ch of txt) {
    const [adv, cs] = SIGNFONT.g[ch];
    if (cs.length) {
      const g = new THREE.ExtrudeGeometry(glyphShapes(cs), { depth: SIGN.DEPTH / s, bevelEnabled: true, bevelThickness: 14, bevelSize: 10, bevelSegments: 1, curveSegments: 3 });
      g.translate(-adv / 2, -350, 0).scale(s, s, s);
      const al = (x + adv * s * SIGN.TRACK / 2 - W / 2) / rr;           // по дуге: середина названия — над входом
      // крайние буквы повёрнуты к улице только наполовину (иначе на изгибе их видно ребром и кажется, что
      // первой буквы нет) — и отодвинуты от купола на столько, на сколько их край зашёл бы в него
      const yaw = al * SIGN.TURN, half = adv * s / 2;
      const [px, py, pz] = onDome(0, 0, 0, R, 0, al, mid, SIGN.OUT + half * Math.sin(Math.abs(al - yaw)) + 0.02);
      g.applyMatrix4(M.makeRotationFromEuler(E.set(-mid, yaw, 0, 'YXZ')).setPosition(px, py, pz));
      const p = g.attributes.position, gr = g.groups;
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i));
        const c = gr.length > 1 && i >= gr[1].start ? cS : cF;
        col.push(c.r, c.g, c.b);
      }
    }
    x += adv * s * SIGN.TRACK;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  SIGN_GEO.set(txt, g);
  return g;
}
function signMat () {
  return glowOwn(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#ffffff', emissiveIntensity: DAYGLOW }), 'pzsign', null);
}

/* ночью светится своим цветом: emissive (белый × сила) умножается на цвет грани */
function glowOwn (m, key, prev) {
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= diffuseColor.rgb;');
  };
  m.customProgramCacheKey = () => key;
  return m;
}

/* ── геометрия: склейка цветных кусков (позиция + цвет, без индекса) ── */
const CC = new THREE.Color();
function addPiece (acc, g, hex, part = 0) {
  const n = g.index ? g.toNonIndexed() : g, p = n.attributes.position;
  CC.set(hex);
  for (let i = 0; i < p.count; i++) { acc.p.push(p.getX(i), p.getY(i), p.getZ(i)); acc.c.push(CC.r, CC.g, CC.b); acc.k.push(part); }
}
function accGeo (acc) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(acc.p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(acc.c, 3));
  if (acc.k.some(v => v)) g.setAttribute('part', new THREE.Float32BufferAttribute(acc.k, 1));
  return g;
}

/* купол: полусфера, грани — по долькам и поясам (цвет на треугольник) */
function domeGeo (R) {
  const g = new THREE.SphereGeometry(R, 24, 9, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const el = Math.asin(Math.min(1, y / R)) * 180 / Math.PI, az = (Math.atan2(x, z) + Math.PI * 2) % (Math.PI * 2);
    const gore = Math.floor(az / (Math.PI / 6));
    c.set(el > 79 ? CREAM : gore % 2 ? ORANGE2 : ORANGE);
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  return g;
}

/* птица с логотипа: перёд — +Z, лапы — y = 0. part: 1 — голова, 2/3 — левое/правое крыло */
const B_HEAD = new THREE.Vector3(0, 3.25, 0.45), B_WING = new THREE.Vector3(1.0, 2.85, -0.15);
function birdGeo () {
  if (BIRD_GEO) return BIRD_GEO;
  const acc = { p: [], c: [], k: [] }, M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), SC = new THREE.Vector3();
  const piece = (g, hex, part, pos, rot = [0, 0, 0], scl = [1, 1, 1], order = 'XYZ') => {
    M.compose(V.set(...pos), Q.setFromEuler(E.set(rot[0], rot[1], rot[2], order)), SC.set(...scl));
    addPiece(acc, g.applyMatrix4(M), hex, part);
  };
  const ball = (seg = 7) => new THREE.SphereGeometry(1, seg, Math.max(4, seg - 2));
  // тело, брюхо, хвост
  piece(ball(8), '#f26c2c', 0, [0, 2.15, 0], [-0.35, 0, 0], [1.3, 1.55, 1.65]);
  piece(ball(7), '#ffb650', 0, [0, 1.95, 0.62], [-0.3, 0, 0], [0.95, 1.2, 1.15]);
  for (const [a, l, hex] of [[-0.42, 2.1, '#a8341a'], [0, 2.4, '#c8481e'], [0.42, 2.1, '#a8341a']])
    piece(new THREE.BoxGeometry(0.62, 0.16, l).translate(0, 0, -l / 2), hex, 0, [0, 1.25, -1.25], [-0.55, a, 0], [1, 1, 1], 'YXZ');
  // лапы: левая стоит, правая держит кусок пиццы перед грудью
  for (const s of [1, -1]) {
    piece(new THREE.CylinderGeometry(0.13, 0.13, 0.95, 5), '#ffb347', 0, [0.55 * s, 0.48, 0.15]);
    for (const a of [-0.45, 0, 0.45]) piece(new THREE.BoxGeometry(0.14, 0.1, 0.6).translate(0, 0, 0.3), '#ffb347', 0, [0.55 * s, 0.05, 0.2], [0, a, 0]);
  }
  piece(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 5), '#ffb347', 0, [-0.62, 1.25, 1.35], [1.0, 0, 0]);
  {
    // кусок пиццы: треугольная призма, лицом к улице, остриём вниз; корочка, три пепперони
    const sl = { p: [], c: [], k: [] }, m2 = new THREE.Matrix4();
    addPiece(sl, new THREE.CylinderGeometry(1, 1, 0.2, 3).scale(0.8, 1, 1.35), '#ffcf5a');
    addPiece(sl, new THREE.BoxGeometry(1.5, 0.34, 0.38).translate(0, 0.02, -0.72), '#d98a2e');
    for (const [x, z] of [[0, 0.35], [-0.3, -0.25], [0.3, -0.22]]) addPiece(sl, new THREE.CylinderGeometry(0.2, 0.2, 0.06, 7).translate(x, 0.12, z), '#b0301c');
    const g = accGeo(sl);
    g.applyMatrix4(m2.makeRotationX(Math.PI / 2)).applyMatrix4(m2.makeRotationZ(0.35)).applyMatrix4(m2.makeTranslation(-0.75, 1.55, 2.05));
    const p = g.attributes.position, c = g.attributes.color;
    for (let i = 0; i < p.count; i++) { acc.p.push(p.getX(i), p.getY(i), p.getZ(i)); acc.c.push(c.getX(i), c.getY(i), c.getZ(i)); acc.k.push(0); }
  }
  // голова: шар, клюв, глаза со светлой обводкой, хохолок
  piece(ball(7), '#f5843a', 1, [0, 3.9, 0.75], [0, 0, 0], [0.95, 0.92, 0.98]);
  piece(new THREE.ConeGeometry(0.34, 0.95, 4), '#ffd23f', 1, [0, 3.8, 1.85], [Math.PI / 2, 0, 0]);
  for (const s of [1, -1]) {
    piece(ball(5), '#ffe3b0', 1, [0.5 * s, 4.12, 1.38], [0, 0, 0], [0.26, 0.26, 0.2]);
    piece(ball(5), '#1b1a1f', 1, [0.56 * s, 4.15, 1.48], [0, 0, 0], [0.15, 0.17, 0.12]);
  }
  for (const [y, z, a, h] of [[4.75, 0.65, -0.45, 0.9], [4.6, 0.25, -0.8, 0.75], [4.35, -0.05, -1.1, 0.6]])
    piece(new THREE.ConeGeometry(0.2, h, 4), '#c2401b', 1, [0, y, z], [a, 0, 0]);
  // крылья «галочкой», как на логотипе: веер перьев от плеча вверх и назад
  for (const s of [1, -1]) {
    const part = s > 0 ? 2 : 3, px = B_WING.x * s;
    piece(ball(6), '#d9541f', part, [px + 0.25 * s, B_WING.y + 0.1, B_WING.z], [0, 0, 0.6 * s], [0.75, 0.45, 0.85]);
    const F = [[0.72, 2.4, 0.1, '#f08a2a'], [0.92, 2.9, 0.22, '#c2401b'], [1.1, 3.1, 0.34, '#e8762a'], [1.27, 2.8, 0.46, '#a8341a'], [1.42, 2.3, 0.58, '#c2401b']];
    for (const [a, l, sw, hex] of F)
      piece(new THREE.BoxGeometry(l, 0.15, 0.62).translate(l / 2, 0, 0).scale(s, 1, 1), hex, part, [px, B_WING.y, B_WING.z], [0, sw * s, a * s], [1, 1, 1], 'YZX');
    // светлая кромка, как обводка на логотипе
    piece(new THREE.BoxGeometry(2.1, 0.17, 0.2).translate(1.05, 0, 0.3).scale(s, 1, 1), '#ffb347', part, [px, B_WING.y, B_WING.z], [0, -0.1 * s, 0.8 * s], [1, 1, 1], 'YZX');
  }
  BIRD_GEO = accGeo(acc);
  BIRD_GEO.computeBoundingSphere();
  BIRD_GEO.boundingSphere.radius += 1.5;          // крылья взмахивают — шар отсечения с запасом
  return BIRD_GEO;
}
function birdMat () {
  if (BIRD_MAT) return BIRD_MAT;
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#ffffff', emissiveIntensity: DAYGLOW });
  glowOwn(m, 'pzbird', sh => {
    Object.assign(sh.uniforms, BU);
    sh.uniforms.uHP = { value: B_HEAD }; sh.uniforms.uWP = { value: B_WING };
    sh.vertexShader = 'attribute float part;\nuniform float uYaw, uWing;\nuniform vec3 uHP, uWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
      if (part > 0.5 && part < 1.5) {
        vec3 q = transformed - uHP; float c = cos(uYaw), s = sin(uYaw);
        transformed = uHP + vec3(c * q.x + s * q.z, q.y, -s * q.x + c * q.z);
      } else if (part > 1.5) {
        float sg = part > 2.5 ? -1.0 : 1.0; vec3 pv = vec3(uWP.x * sg, uWP.y, uWP.z);
        vec3 q = transformed - pv; float c = cos(uWing * sg), s = sin(uWing * sg);
        transformed = pv + vec3(c * q.x - s * q.y, s * q.x + c * q.y, q.z);
      }`);
  });
  BIRD_MAT = m;
  return m;
}

/* точка на куполе: al — угол от «к улице», ph — высота над горизонтом (рад) */
function onDome (cx, cy, cz, R, ry, al, ph, out) {
  const aw = al + ry, nx = Math.cos(ph) * Math.sin(aw), ny = Math.sin(ph), nz = Math.cos(ph) * Math.cos(aw);
  return [cx + nx * (R + out), cy + ny * (R + out), cz + nz * (R + out), -ph, aw];
}
/* плоская фигура (в плоскости XY) — на поверхность купола: касательно в точке и прижать к сфере */
function wrap (g, cx, cy, cz, R, ry, al, ph, out) {
  const [x, y, z, rxx, ryy] = onDome(cx, cy, cz, R, ry, al, ph, out);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rxx, ryy, 0, 'YXZ')).setPosition(x, y, z));
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i) - cx, p.getY(i) - cy, p.getZ(i) - cz).setLength(R + out);
    p.setXYZ(i, cx + v.x, cy + v.y, cz + v.z);
  }
  return g;
}

/* ── место под купол ── */
const isIn = (x, z, p) => {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
};
/* препятствия рядом с точкой (стены, заборы, рельсы): сетка до индекса игры — его ещё нет */
function solidGrid (A, ox, oz, R) {
  const G = new Map(), C = 10;
  for (const s of A.SOLIDS) {
    if (Math.abs(s.cx - ox) > R || Math.abs(s.cz - oz) > R) continue;
    for (let i = Math.floor((s.cx - s.ex - 1) / C); i <= Math.floor((s.cx + s.ex + 1) / C); i++)
      for (let j = Math.floor((s.cz - s.ez - 1) / C); j <= Math.floor((s.cz + s.ez + 1) / C); j++) {
        const k = i * 100003 + j;
        let a = G.get(k); if (!a) G.set(k, a = []);
        a.push(s);
      }
  }
  return (x, z, r) => {
    for (const s of G.get(Math.floor(x / C) * 100003 + Math.floor(z / C)) || []) {
      const dx = x - s.cx, dz = z - s.cz;
      if (Math.abs(dx * s.cs + dz * s.sn) < s.hw + r && Math.abs(-dx * s.sn + dz * s.cs) < s.hd + r) return true;
    }
    return false;
  };
}
/* площадки, куда купол не ставим: парковки, вода, спорт и детские площадки */
function areaGrid (A, ox, oz, R) {
  const list = [];
  const take = p => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    if (x1 < ox - R || x0 > ox + R || z1 < oz - R || z0 > oz + R) return;
    list.push({ p, x0, x1, z0, z1 });
  };
  for (const l of A.CITY.lots || []) take(l.p);
  for (const g of A.CITY.green || []) if (g.k === 'water' || g.k === 'pitch' || g.k === 'play') take(g.p);
  return (x, z) => list.some(q => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1 && isIn(x, z, q.p));
}

export function site (A, f, lots) {
  const t0 = performance.now(), D = DOME, R = D.R;
  const Rb = R;                                                // край купола (цоколь — на 0,35—0,5 м шире)
  const r0 = f.road || A.nearestRoad(f.mx, f.mz, 4, 3);
  if (!r0) return null;
  const ox = r0.x, oz = r0.z, want = A.distAt ? A.distAt(f.cx === undefined ? f.mx : f.cx, f.cz === undefined ? f.mz : f.cz) : 0;
  const solid = solidGrid(A, ox, oz, D.SEARCH + 60), area = areaGrid(A, ox, oz, D.SEARCH + 60);
  const free = (x, z, m) => {
    if (!A.inBounds(x, z, 6) || A.inHouse(x, z, m)) return false;
    if (A.groundH(x, z) < 0.3) return false;
    const r = A.nearestRoad(x, z, 9, 1);
    if (r && r.d < r.seg.w / 2 + m) return false;
    return !solid(x, z, m) && !area(x, z);
  };
  // кольца площади: центр, тело купола, его край, край цоколя, край площади
  const RINGS = [[0, 1], [Rb * 0.5, 6], [Rb, 14], [Rb + 1.6, 16], [Rb + D.PLAZA, 20]];
  for (let rad = 0; rad <= D.SEARCH; rad += D.STEP) {
    const n = Math.max(1, Math.round(rad * 2 * Math.PI / D.STEP));
    for (let i = 0; i < n; i++) {
      ST.tries++;
      const a = i / n * Math.PI * 2, cx = ox + Math.cos(a) * rad, cz = oz + Math.sin(a) * rad;
      const road = A.nearestRoad(cx, cz, 4, 3);                   // улица, не дворовый проезд
      if (!road) continue;
      const edge = road.d - road.seg.w / 2 - Rb;
      if (edge < D.GAP[0] || edge > D.GAP[1]) continue;
      if (A.inHouse(cx, cz, Rb)) continue;
      if (want !== undefined && A.distAt && A.distAt(cx, cz) !== want) continue;
      const fx = (road.x - cx) / road.d, fz = (road.z - cz) / road.d, rx = fz, rz = -fx;
      let ok = true, hMin = Infinity, hMax = -Infinity;
      for (const [rr, m] of RINGS) {
        for (let k = 0; k < m && ok; k++) {
          const b = k / m * Math.PI * 2, x = cx + Math.cos(b) * rr, z = cz + Math.sin(b) * rr;
          if (!free(x, z, rr > Rb + 1 ? 0.4 : 0.8)) ok = false;
          else if (rr <= Rb) { const h = A.groundH(x, z); hMin = Math.min(hMin, h); hMax = Math.max(hMax, h); }
        }
        if (!ok) break;
      }
      if (!ok || hMax - hMin > D.SLOPE) continue;
      // край купола, вход со ступеньками и коврик — не на тротуаре, дорожке, аллее (pave.js): там ходят люди
      for (let k = 0; k < 24 && ok; k++) { const b = k / 24 * Math.PI * 2; if (onPave(cx + Math.cos(b) * (Rb + 0.5), cz + Math.sin(b) * (Rb + 0.5), 0)) ok = false; }
      for (let v = Rb; v < Rb + D.PORCH + 2.4 && ok; v += 0.7)
        for (const u of [-3.5, 0, 3.5]) if (onPave(cx + fx * v + rx * u, cz + fz * v + rz * u, 0)) { ok = false; break; }
      if (!ok) continue;
      // тамбур и дорожка к улице
      for (let v = Rb; v < road.d - road.seg.w / 2 - 0.5 && ok; v += 1.5)
        for (const u of [-2.2, 0, 2.2]) if (!free(cx + fx * v + rx * u, cz + fz * v + rz * u, 0.3)) { ok = false; break; }
      if (!ok) continue;
      // парковка курьеров рядом помещается
      const g = { mx: cx, mz: cz, road };
      const block = (x, z) => Math.hypot(x - cx, z - cz) < Rb + D.PLAZA + 0.5;
      if (lots && !lotBase(A, g, lots, block)) continue;
      ST.ms += performance.now() - t0;
      return { x: cx, z: cz, fx, fz, rx, rz, road, Rb, gy: A.groundH(cx, cz), dist: rad };
    }
  }
  ST.ms += performance.now() - t0;
  return null;
}

/* ── сам купол ── */
/* пёстрый зонтик: конус, грани через одну — двух цветов (одна склейка) */
function umbrella (hexA, hexB) {
  const g = new THREE.ConeGeometry(1.35, 0.55, 8, 1, true).toNonIndexed(), p = g.attributes.position, col = new Float32Array(p.count * 3);
  const a = new THREE.Color(hexA), b = new THREE.Color(hexB);
  for (let i = 0; i < p.count; i += 3) {
    const az = Math.atan2((p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3);
    const c = Math.floor((az + Math.PI) / (Math.PI / 4)) % 2 ? a : b;
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const idx = new Uint32Array(p.count); for (let i = 0; i < p.count; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
export function build (A, f, opt = {}) {
  const S = site(A, f, opt.lots || 0);
  if (!S) return null;
  const D = DOME, R = D.R, PL = D.PLINTH, { x: cx, z: cz, fx, fz, rx, rz, road } = S;
  const gy = S.gy, cy = gy + PL;                               // центр полусферы — на цоколе; пол зала — тоже
  const ry = Math.atan2(fx, fz);                               // «перёд» модели (+Z) — к улице
  const at = (u, v) => [cx + rx * u + fx * v, cz + rz * u + fz * v];
  const { put, LIT, FLAT, LAMPH, LITM, FLATM } = A;
  const deg = Math.PI / 180, M4 = new THREE.Matrix4();
  // местные u, v, y (от земли) → мир: для геометрии, собранной «в рамке» купола
  const local = (g, u, v, y) => g.applyMatrix4(M4.makeRotationY(ry)).translate(...((p) => [p[0], gy + y, p[1]])(at(u, v)));

  // площадь из светлой плитки с оранжевым кольцом и дорожка к улице
  const PR = R + D.PLAZA;
  LITM.color('#d9d3c9'); LITM.disc(cx, cz, PR, 0.13, 40);
  FLATM.color(ORANGE);
  for (let i = 0; i < 48; i++) {
    const a = i / 48 * Math.PI * 2, b = (i + 1) / 48 * Math.PI * 2, rr = PR - 0.6;
    FLATM.ribbon(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, cx + Math.cos(b) * rr, cz + Math.sin(b) * rr, 0.35, 0.15);
  }
  {
    const [x1, z1] = at(0, PR - 0.5), ed = road.d - road.seg.w / 2;
    const [x2, z2] = at(0, Math.max(PR, ed + 0.3));
    LITM.color('#d9d3c9'); LITM.ribbon(x1, z1, x2, z2, 4.2, 0.13);
  }
  // цоколь: светлый, уходит в землю на SLOPE — на склоне купол не висит
  put(LIT, new THREE.CylinderGeometry(R + 0.35, R + 0.5, PL + D.SLOPE, 32), '#f1e2c4', cx, gy + (PL - D.SLOPE) / 2, cz);

  // купол: дольки двух оранжевых тонов, светлая макушка; ночью светится своим цветом; снег — как у города (seasons.js)
  if (!DOME_MAT) { const m = seasonMat(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#ffffff', emissiveIntensity: DAYGLOW }), 0.4); DOME_MAT = glowOwn(m, 'season0.4dome', m.onBeforeCompile); }
  const G0 = ry + 15 * deg;                                    // дольки — от входа: перёд — середина дольки
  A.scene.add(new THREE.Mesh(domeGeo(R).rotateY(G0).translate(cx, cy, cz), DOME_MAT));
  // светящийся ободок у макушки — на нём сидит птица
  { const el = 79 * deg; put(LAMPH, new THREE.TorusGeometry(R * Math.cos(el) + 0.05, 0.14, 4, 32), GLOW, cx, cy + R * Math.sin(el), cz, Math.PI / 2, 0, 0); }

  // окно выдачи курьерам — сбоку, со стороны парковки
  const lb = opt.lots ? lotBase(A, { mx: cx, mz: cz, road }, opt.lots) : null;
  let side = 1;
  if (lb) { const lx = lb.base[0] + lb.nx * (lb.off + lb.D / 2), lz = lb.base[1] + lb.nz * (lb.off + lb.D / 2); side = (lx - cx) * rx + (lz - cz) * rz >= 0 ? 1 : -1; }
  const KA = side * 62 * deg, ku = Math.sin(KA), kv = Math.cos(KA);   // направление на окно выдачи
  const kat = (w, d) => at(ku * d + kv * w, kv * d - ku * w);          // w — вбок, d — от центра
  const kry = ry + KA;

  // окна: круги-«пепперони» и дольки пиццы разного размера на разной высоте, толстая светлая рама (ночью светится);
  // сквозь стекло — зал: люди за столиками едят (winMat). Все окна и стекло входа — одна сетка
  // [угол от входа, высота над горизонтом (°), размер, форма]
  const W = [[48, 11, 1.2, 'o'], [-48, 11, 1.2, 'o'], [82, 12, 1.35, 'o'], [-82, 12, 1.35, 'o'], [112, 10, 1.05, 'o'], [-112, 10, 1.05, 'o'],
    [141, 13, 1.25, 'v'], [-141, 13, 1.25, 'v'], [166, 10, 1.15, 'o'], [-166, 10, 1.15, 'o'],
    [62, 31, 0.75, 'o'], [-62, 31, 0.75, 'o'], [126, 33, 0.8, 'o'], [-126, 33, 0.8, 'o'], [180, 30, 0.9, 'o']];
  const ga = { p: [], c: [], n: [], f: [] };
  W.forEach(([a, e, r, kind], i) => {
    if (Math.abs(a * deg - KA) < 20 * deg && e < 25) return;      // там окно выдачи
    const al = a * deg, ph = e * deg;
    put(LAMPH, wrap(winShape(kind, r * (kind === 'o' ? 1.24 : 1.22)), cx, cy, cz, R, ry, al, ph, 0.07), kind === 'o' ? '#fff0d2' : '#ffd25a', 0, 0, 0);
    const [x, y, z] = onDome(cx, cy, cz, R, ry, al, ph, 0.1), nn = [(x - cx) / (R + 0.1), (y - cy) / (R + 0.1), (z - cz) / (R + 0.1)];
    glassAdd(ga, wrap(winShape(kind, r), cx, cy, cz, R, ry, al, ph, 0.1), [x, y, z], nn, cy, i * 0.61);
  });

  // вход — арка-портал из купола к улице: бордовый свод, светлая светящаяся арка, стеклянная стена с двойной дверью
  // (сквозь неё тоже виден зал), полосатая маркиза, над аркой — объёмные буквы названия на куполе, ступеньки, коврик
  const AR = 2.9, AW = 1.5, V0 = 6.2, VF = R + D.PORCH, AY = PL + AW;   // радиус свода, высота стенок, где свод начинается и кончается
  {
    const len = VF - V0, vm = (V0 + VF) / 2;
    put(LIT, local(new THREE.CylinderGeometry(AR + 0.25, AR + 0.25, len, 18, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), 0, vm, AY), BRD2, 0, 0, 0);
    for (const s of [-1, 1]) { const [x, z] = at(s * (AR + 0.12), vm); A.box(LIT, 0.5, AW + PL, len, BRD2, x, gy + (AW + PL) / 2, z, ry); }
    put(LAMPH, local(new THREE.TorusGeometry(AR + 0.25, 0.28, 6, 20, Math.PI), 0, VF + 0.05, AY), '#ffe9c4', 0, 0, 0);
    for (const s of [-1, 1]) { const [x, z] = at(s * (AR + 0.25), VF + 0.05); A.box(LAMPH, 0.56, AY, 0.56, '#ffe9c4', x, gy + AY / 2, z, ry); }
    // стеклянная стена в арке
    const sh = new THREE.Shape();
    sh.moveTo(-AR, 0); sh.lineTo(AR, 0); sh.lineTo(AR, AW); sh.absarc(0, AW, AR, 0, Math.PI, false); sh.lineTo(-AR, 0);
    const GV = VF - 0.35, [gx, gz] = at(0, GV);
    glassAdd(ga, local(new THREE.ShapeGeometry(sh, 10), 0, GV, PL), [gx, cy + 1.2, gz], [fx, 0, fz], cy, 9.3);
    // рама: двери, фрамуга, лучи веерного окна; ручки
    const bar = (w, h, u, y) => { const [x, z] = at(u, VF - 0.3); A.box(LIT, w, h, 0.1, BRD2, x, gy + y, z, ry); };
    for (const u of [-1.05, 0, 1.05]) bar(0.1, 2.4, u, PL + 1.2);
    bar(2.2, 0.1, 0, PL + 2.4); bar(AR * 2, 0.12, 0, AY + 0.05);
    for (const a of [30, 60, 90, 120, 150]) {
      const g = new THREE.BoxGeometry(AR, 0.09, 0.1).translate(AR / 2, 0, 0).rotateZ(a * deg);
      put(LIT, local(g, 0, VF - 0.3, AY), BRD2, 0, 0, 0);
    }
    for (const u of [-0.15, 0.15]) { const [x, z] = at(u, VF - 0.24); A.box(LIT, 0.06, 0.5, 0.08, '#ffe9c4', x, gy + PL + 1.15, z, ry); }
    // маркиза над дверями: полоски бордовая / светлая, край — зубцами
    const CY = PL + 2.85, CL = 1.25, NS = 10, sw = 5.2 / NS;
    for (let i = 0; i < NS; i++) {
      const u = -2.6 + (i + 0.5) * sw, hex = i % 2 ? '#fff0d2' : BRD2;
      put(LIT, local(new THREE.BoxGeometry(sw, 0.06, CL).translate(0, 0, CL / 2).rotateX(0.42), u, VF - 0.32, CY), hex, 0, 0, 0);
      put(LIT, local(new THREE.BoxGeometry(sw, 0.28, 0.05), u, VF - 0.32 + CL * Math.cos(0.42), CY - CL * Math.sin(0.42) - 0.12), hex, 0, 0, 0);
    }
    // ступеньки и коврик
    { const [x, z] = at(0, VF + 0.15); A.box(LIT, 6.0, 0.3, 0.8, '#e6dccb', x, gy + 0.15, z, ry); }
    { const [x, z] = at(0, VF + 0.8); A.box(LIT, 6.0, 0.15, 0.5, '#e6dccb', x, gy + 0.075, z, ry); }
    { const [x, z] = at(0, VF + 1.75); A.box(LIT, 2.6, 0.04, 1.3, ORANGE, x, gy + 0.15, z, ry); A.box(LIT, 2.3, 0.05, 1.0, BRD2, x, gy + 0.16, z, ry); }
  }
  // вывеска — объёмные буквы названия дугой на куполе над входом (sign — для growth.js: мигает у загибающейся,
  // ярче светится у процветающей — signGlow)
  const VW = 2 * AR;
  const sign = new THREE.Mesh(signGeo(opt.brand, R), signMat());
  sign.position.set(cx, cy, cz); sign.rotation.y = ry;
  A.scene.add(sign);

  // окно выдачи курьерам: бордовая будка из купола со светлой полосой, тёплое окошко, полка, полосатый козырёк, табличка
  let wx, wz, wy = gy + 1.6;
  {
    const KD = R + 1.1;                                        // передняя стенка будки — от центра
    { const [x, z] = kat(0, R - 0.2); A.box(LIT, 2.8, 2.7, 2.6, BRD2, x, gy + 1.35, z, kry); }
    { const [x, z] = kat(0, R - 0.2); A.box(LIT, 2.9, 0.25, 2.7, ORANGE, x, gy + 2.75, z, kry); }
    { const [x, z] = kat(0, KD + 0.02); put(LAMPH, new THREE.PlaneGeometry(1.9, 1.05), '#ffe2a8', x, gy + 1.65, z, 0, kry, 0); }
    { const [x, z] = kat(0, KD + 0.03); put(LAMPH, new THREE.PlaneGeometry(0.5, 0.35), '#fff0d2', x, gy + 1.4, z, 0, kry, 0); }   // коробка в окошке
    { const [x, z] = kat(0, KD + 0.25); A.box(LIT, 2.2, 0.08, 0.5, '#ffe9c4', x, gy + 1.12, z, kry); }
    for (let i = 0; i < 4; i++) {                              // козырёк: полоски бордовая / светлая
      const [x, z] = kat(-0.9 + i * 0.6, KD + 0.45);
      const g = new THREE.BoxGeometry(0.6, 0.06, 0.95).rotateX(0.35);
      put(LIT, g, i % 2 ? '#fff0d2' : BRD2, x, gy + 2.35, z, 0, kry, 0);
    }
    const [px, pz] = kat(0, KD + 0.04);
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), plateMat());
    pm.position.set(px, gy + 3.15, pz); pm.rotation.y = kry; A.scene.add(pm);
    [wx, wz] = kat(0, KD + 0.8);
  }
  // окна и стекло входа — одна сетка
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(ga.p, 3));
    g.setAttribute('aC', new THREE.Float32BufferAttribute(ga.c, 3));
    g.setAttribute('aN', new THREE.Float32BufferAttribute(ga.n, 3));
    g.setAttribute('aF', new THREE.Float32BufferAttribute(ga.f, 2));
    A.scene.add(new THREE.Mesh(g, winMat()));
  }

  // птица на макушке — одна сетка с логотипа (голова и крылья двигаются в шейдере, step)
  const bird = new THREE.Mesh(birdGeo(), birdMat());
  bird.position.set(cx, cy + R - 0.15, cz); bird.rotation.y = ry; bird.scale.setScalar(D.BIRD);
  A.scene.add(bird);

  // светильники у цоколя: днём — светлые плафоны, ночью — пятна света на плитке
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + Math.PI / 8 + ry;
    const x = cx + Math.sin(a) * (R + 0.85), z = cz + Math.cos(a) * (R + 0.85);
    put(LAMPH, new THREE.BoxGeometry(0.5, 0.3, 0.5), GLOW, x, gy + 0.3, z, 0, a, 0);
    A.LAMP_SPOTS.push([cx + Math.sin(a) * (R + 1.6), cz + Math.cos(a) * (R + 1.6)]);
  }
  A.LAMP_SPOTS.push(at(0, VF + 2.2));

  // дорожка из плитки от окна выдачи до стоянки курьеров (к её задней кромке, посередине)
  const inLot = (x, z) => {
    if (!lb) return false;
    const dx = x - lb.base[0], dz = z - lb.base[1], a = dx * lb.ux + dz * lb.uz, b = dx * lb.nx + dz * lb.nz - lb.off;
    return Math.abs(a) < lb.W / 2 + 2.2 && b > -3 && b < lb.D + 2.2;
  };
  let lane = null;
  if (lb) {
    const [x1, z1] = kat(0, R + 1.3);
    const x2 = lb.base[0] + lb.nx * (lb.off + lb.D + 0.6), z2 = lb.base[1] + lb.nz * (lb.off + lb.D + 0.6);
    LITM.color('#e2d6c2'); LITM.ribbon(x1, z1, x2, z2, 2.0, 0.14);
    FLATM.color(ORANGE);
    const L = Math.hypot(x2 - x1, z2 - z1);
    for (let s = 1.2; s < L - 0.6; s += 2.4) { const k = s / L, k2 = Math.min(1, (s + 0.7) / L); FLATM.ribbon(x1 + (x2 - x1) * k, z1 + (z2 - z1) * k, x1 + (x2 - x1) * k2, z1 + (z2 - z1) * k2, 0.3, 0.17); }   // «стрелки»-штрихи
    lane = (x, z, m) => {
      const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1, q = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / l2));
      return Math.hypot(x - x1 - dx * q, z - z1 - dz * q) < m;
    };
  }
  const freeAt = (x, z, m) => !A.inHouse(x, z, m) && !A.onRoad(x, z, m + 0.6) && !inLot(x, z) && !onPave(x, z, m) && !(lane && lane(x, z, m + 1.2));

  // летняя веранда: столики под пёстрыми зонтиками (бордовый/оранжевый, оранжевый/светлый), по два стула — вдоль
  // «вправо» купола (сюда growth.js сажает гостей), кадки с цветами у проходов, низкий заборчик по краю площади
  const RV = R + 2.75, free = [], extra = [];
  const UMB = [[BRD2, ORANGE], [ORANGE, '#fff0d2']];
  let ti = 0;
  for (const s of [1, -1]) for (let a = 40; a <= 160; a += 17) {
    const al = s * a * deg;
    if (Math.abs(al - KA) < 22 * deg) continue;                // у окна выдачи — проход
    const [tx, tz] = at(Math.sin(al) * RV, Math.cos(al) * RV);
    if (!freeAt(tx, tz, 1.4)) continue;
    if (a > 130 && extra.length < 2) { extra.push([tx, tz]); continue; }   // два места — под столики «растёт» (growth.js)
    const ty = A.groundH(tx, tz) + 0.13, g = [];
    put(g, new THREE.CylinderGeometry(0.55, 0.55, 0.06, 10), '#fff0d2', tx, ty + 0.75, tz);
    put(g, new THREE.CylinderGeometry(0.05, 0.05, 0.75, 6), '#585460', tx, ty + 0.38, tz);
    put(g, new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), '#585460', tx, ty + 1.1, tz);
    const um = umbrella(...UMB[ti++ % 2]); um.translate(tx, ty + 2.35, tz); g.push(um);
    put(g, new THREE.CylinderGeometry(0.22, 0.22, 0.03, 8), '#d98a2e', tx + 0.1, ty + 0.79, tz - 0.05);   // пицца на столе
    for (const k of [1, -1]) {                                 // стулья: сиденье и спинка
      const sx = tx + rx * 0.9 * k, sz = tz + rz * 0.9 * k;
      put(g, new THREE.BoxGeometry(0.45, 0.06, 0.45), '#8a4a22', sx, ty + 0.46, sz, 0, ry, 0);
      put(g, new THREE.BoxGeometry(0.06, 0.5, 0.45), '#8a4a22', sx + rx * 0.22 * k, ty + 0.72, sz + rz * 0.22 * k, 0, ry, 0);
      for (const [p, q] of [[0.18, 0.18], [-0.18, 0.18], [0.18, -0.18], [-0.18, -0.18]]) put(g, new THREE.BoxGeometry(0.04, 0.46, 0.04), '#585460', sx + rx * p + fx * q, ty + 0.23, sz + rz * p + fz * q);
    }
    A.smashAdd('table', tx, tz, 1.2, g, '#fff0d2');
    free.push([tx, tz]);
  }
  free.sort((p, q) => Math.hypot(p[0] - at(0, VF)[0], p[1] - at(0, VF)[1]) - Math.hypot(q[0] - at(0, VF)[0], q[1] - at(0, VF)[1]));
  // заборчик веранды: светлые перекладины, бордовые столбики; проходы — у входа и к окну выдачи
  const RFc = PR - 1.0;
  for (const s of [1, -1]) for (let a = 34; a < 166; a += 9) {
    const a0 = s * a * deg, a1 = s * (a + 9) * deg;
    if (Math.abs((a0 + a1) / 2 - KA) < 16 * deg) continue;
    const [x0, z0] = at(Math.sin(a0) * RFc, Math.cos(a0) * RFc), [x1, z1] = at(Math.sin(a1) * RFc, Math.cos(a1) * RFc);
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    if (!freeAt(mx, mz, 0.3)) continue;
    const y = A.groundH(mx, mz), l = Math.hypot(x1 - x0, z1 - z0), yr = Math.atan2(-(z1 - z0), x1 - x0), g = [];
    put(g, new THREE.BoxGeometry(l, 0.08, 0.06), '#fff0d2', mx, y + 0.85, mz, 0, yr, 0);
    put(g, new THREE.BoxGeometry(l, 0.08, 0.06), ORANGE, mx, y + 0.5, mz, 0, yr, 0);
    put(g, new THREE.BoxGeometry(0.1, 0.95, 0.1), BRD2, x0, y + 0.48, z0);
    A.smashAdd('fence', mx, mz, 1.2, g, ORANGE);
  }
  // кадки с цветами — у проходов в заборчике и у входа
  const tub = (x, z) => {
    if (!freeAt(x, z, 0.5)) return;
    const y = A.groundH(x, z) + 0.13, g = [];
    put(g, new THREE.CylinderGeometry(0.42, 0.34, 0.6, 8), '#b0502a', x, y + 0.3, z);
    put(g, new THREE.IcosahedronGeometry(0.42, 0), '#4c9a3a', x, y + 0.78, z);
    for (const [p, q, h] of [[0.18, 0.1, '#d9342c'], [-0.15, 0.16, '#ffd23f'], [0.02, -0.2, '#ff5fa2']]) put(g, new THREE.IcosahedronGeometry(0.12, 0), h, x + p, y + 1.05, z + q);
    A.smashAdd('table', x, z, 0.6, g, '#4c9a3a');
  };
  for (const s of [1, -1]) {
    tub(...at(Math.sin(s * 30 * deg) * RFc, Math.cos(s * 30 * deg) * RFc));
    tub(...at(s * (AR + 1.3), VF + 0.6));
  }
  for (const s of [1, -1]) tub(...kat(s * 2.2, PR - 1.0));

  // препятствие: кольцо стен по цоколю, портал входа со ступеньками, будка выдачи; «дом» (весь купол) — для того, что ставится после
  const N = 18, foot = [];
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2, b = (i + 1) / N * Math.PI * 2, rw = R + 0.2;
    const x1 = cx + Math.cos(a) * rw, z1 = cz + Math.sin(a) * rw, x2 = cx + Math.cos(b) * rw, z2 = cz + Math.sin(b) * rw;
    A.obb((x1 + x2) / 2, (z1 + z2) / 2, Math.hypot(x2 - x1, z2 - z1) / 2 + 0.3, 0.6, Math.atan2(z2 - z1, x2 - x1));
  }
  for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; foot.push([cx + Math.cos(a) * (R + 0.5), cz + Math.sin(a) * (R + 0.5)]); }
  { const [x, z] = at(0, (V0 + VF + 1.05) / 2); A.obb(x, z, AR + 0.55, (VF + 1.05 - V0) / 2, -ry); }
  { const [x, z] = kat(0, R + 0.1); A.obb(x, z, 1.45, 1.0, -kry); }
  A.addFoot(foot);
  A.addFoot([at(-AR - 0.6, V0), at(AR + 0.6, V0), at(AR + 0.6, VF + 1.05), at(-AR - 0.6, VF + 1.05)]);
  A.addFoot([kat(-1.5, R - 1), kat(1.5, R - 1), kat(1.5, R + 1.2), kat(-1.5, R + 1.2)]);
  // ring — где гирлянда «на подъёме» обходит купол (growth.js): над порталом
  const RE = 31 * deg;
  DOMES.push({ x: cx, z: cz, R: R + 0.3, base: R, gy, bird, ry, dist: S.dist, sign, letters: true, signGlow: 0, road, free, extra,
    porch: { V0, V1: VF - 0.3, VW, VH: 2.75, ST: 1.3 }, ring: { r: R * Math.cos(RE) + 0.12, y: cy + R * Math.sin(RE) } });

  // парковка курьеров — у улицы, сбоку от купола
  const g = { mx: cx, mz: cz, road };
  const slots = opt.lots ? courierLot(A, g, opt.lots) : null;

  // подъезжать — в ближнюю к куполу полосу улицы
  const ddx = cx - road.x, ddz = cz - road.z, dl = Math.hypot(ddx, ddz) || 1;
  const off = Math.min(opt.lane || 3.2, Math.max(0, dl - 4));
  const sa = ry - side * Math.PI * 0.62, sx = cx + Math.sin(sa) * (R + 1.6), sz = cz + Math.cos(sa) * (R + 1.6);   // курилка — с другой стороны от окна выдачи
  return {
    x: road.x + ddx / dl * off, z: road.z + ddz / dl * off,
    bx: cx, bz: cz, by: gy, wx, wz, wy, slots, smoke: { x: sx, z: sz },
    dome: { x: cx, z: cz, R, moved: Math.round(S.dist) },
  };
}

/* в куполе или его площади (для деревьев и ельника) */
export function blocks (x, z, m = 0) {
  for (const d of DOMES) if (Math.abs(x - d.x) < d.R + 4 + m && Math.abs(z - d.z) < d.R + 4 + m && Math.hypot(x - d.x, z - d.z) < d.R + DOME.PLAZA - 0.6 + m) return true;
  return false;
}

/* кадр: птица крутит головой и изредка машет крыльями, ночью купол и птица светятся изнутри */
export function step (dt, A) {
  if (!DOMES.length) return;
  const tt = ST.t += dt;
  // голова: медленно оглядывает улицу; крылья: еле дышат, раз в ~7 с — два-три взмаха
  BU.uYaw.value = 0.55 * Math.sin(tt * 0.37) + 0.18 * Math.sin(tt * 1.1);
  const ph = tt % 7.3, flap = ph < 1.4 ? Math.sin(ph / 1.4 * Math.PI) : 0;
  BU.uWing.value = 0.05 * Math.sin(tt * 1.6) + flap * 0.32 * Math.sin(ph * 11);
  const nt = A.ENV ? A.ENV.night : 0;
  HU.uT.value = tt; HU.uNight.value = nt;
  if (Math.abs(nt - ST.night) > 0.02 && DOME_MAT) {
    ST.night = nt;
    DOME_MAT.emissiveIntensity = DAYGLOW + 0.5 * nt;
    if (BIRD_MAT) BIRD_MAT.emissiveIntensity = DAYGLOW + 0.5 * nt;
  }
  // буквы вывески: ночью светятся; «растёт» и выше — ярче (growth.js: signGlow 1), «процветает» — ещё и дышат (2)
  for (const d of DOMES) {
    const m = d.sign && d.sign.material, g = d.signGlow || 0;
    if (m) m.emissiveIntensity = DAYGLOW + 0.6 * nt + (g ? 0.22 + (g > 1 ? 0.12 * Math.sin(tt * 2.4) : 0) : 0);
  }
}

export const DEBUG = {
  DOMES, DOME, BU,
  get stats () { return { domes: DOMES.length, tries: ST.tries, ms: Math.round(ST.ms), moved: DOMES.map(d => Math.round(d.dist)) }; },
};
