/* ──────────────────────────────────────────────────────────────────────────
   Пиццерия-купол (docs/IDEAS.md, блок 6; правила — docs/CAREER.md «Город: как выглядит»).

   Пиццерия — не первый этаж жилого дома, а отдельное здание: полусфера-купол
   в цветах логотипа (бордовый #3d0d01 / #5a1608, оранжевый, светлая обводка
   #ffb347) — DOME.R = 9 м (18 м в поперечнике, 9 м высотой) на низком светлом
   цоколе DOME.PLINTH = 0,45 м. Купол — 12 долек двух бордовых тонов (#6e1a0b / #5a1608,
   с 23.10.2026; были оранжевые) без тёмных полос, светлая макушка со светящимся ободком; на ней сидит большая птица из
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
   С 24.10.2026 (12ау) у каждой из 8 пиццерий своё здание в том же стиле — форма, поза птицы, окна, крыльцо, свет
   (pizzastyles.js, вариант — по номеру пиццерии; Юг — классика, как описано здесь). Тело здания — купол-эллипсоид на
   барабане (bodyPt / bodyWrap / shellAdd), второй купол, башенка, козырёк, галерея, корочка — в той же сетке купола.
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
import { onPave, walkHalf } from './pave.js';
import { t } from '../i18n/index.js';
import SIGNFONT from './signfont.json';
import { MOB } from './mobile.js';
import { STYLES } from './pizzastyles.js';

export const DOME = { R: 9, PLINTH: 0.45, BIRD: 1.3, GAP: [2, 12], SEARCH: 200, STEP: 4, SLOPE: 1.6, PLAZA: 4.6, PORCH: 1.6 };

/* цвета логотипа (src/styles/paper.css --brand-*) */
const BRD = '#3d0d01', BRD2 = '#5a1608', ORANGE = '#ff9636', ORANGE2 = '#ffae52', GLOW = '#ffb347', CREAM = '#ffe3b0';
// купол — бордовый бренда (автор 21.10): дольки двух тонов, светлее фона логотипа (#3d0d01) — на свету не уходит в чёрный
const DOME1 = '#6e1a0b', DOME2 = '#5a1608';
const DOMES = [];                       // { x, z, R, base, gy, bird, ry, dist, sign, letters, signGlow, road, free, extra, porch, ring }
let DOME_MAT = null, BIRD_MAT = null, WIN_MAT = null;
const ST = { tries: 0, ms: 0, night: -1, t: 0 };
const PZ_CLASSIC = typeof location !== 'undefined' && /[?&]pzclassic(&|=|$)/.test(location.search);   // ?pzclassic — все 8 как классика (сравнить «до/после», 12ау)
const DAYGLOW = 0.12;                    // и днём чуть светится своим цветом — оранжевый не уходит в бурый в тени
const BU = { uYaw: { value: 0 }, uWing: { value: 0 }, uWave: { value: 0 } };     // поворот головы, взмах крыльев и «машет» птицы (step)

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
  // мобильный режим: без зала за стеклом (холст 1024×512 и тяжёлый шейдер) — тёплый ровный цвет, как у купола издалека
  if (MOB.on && !MOB.hall) return (WIN_MAT = new THREE.MeshBasicMaterial({ color: 0xd9652a }));
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
function signGeo (text, R, row = false) {           // row — прямой строкой стоймя (низ — y = 0, лицом к +Z): вывеска над аркой (12ау)
  let txt = String(text || '').toUpperCase().replace(/[«»"]/g, '');
  if ([...txt].some(ch => !SIGNFONT.g[ch])) txt = 'PTITSA PIZZA';
  const key = txt + (row ? '|row' : '');
  if (SIGN_GEO.has(key)) return SIGN_GEO.get(key);
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
      if (row) g.applyMatrix4(M.makeTranslation(x + adv * s * SIGN.TRACK / 2 - W / 2, SIGN.H / 2, 0));
      else {
        const [px, py, pz] = onDome(0, 0, 0, R, 0, al, mid, SIGN.OUT + half * Math.sin(Math.abs(al - yaw)) + 0.02);
        g.applyMatrix4(M.makeRotationFromEuler(E.set(-mid, yaw, 0, 'YXZ')).setPosition(px, py, pz));
      }
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
  g.userData.w = W;
  SIGN_GEO.set(key, g);
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

/* ── тело здания (12ау): купол-«эллипсоид» на барабане ──
   B — { cx, cy, cz, R, Hd, Hc, ry }: центр на полу зала (cy), R — радиус, Hd — высота барабана (стена R) над полом,
   Hc — высота купола над барабаном (полусфера — Hc = R; приплюснутый — меньше, «яйцо» — больше). Точка на теле:
   al — угол от «к улице», t — «широта» купола (рад: r = R cos t, y = Hd + Hc sin t) или yd — высота на барабане */
const RC = B => B.Rc || B.R;                       // радиус купола над барабаном (Rc < R — купол отступает, вокруг — плоская крыша)
const surfY = (B, r) => r >= RC(B) ? B.Hd : B.Hd + B.Hc * Math.sqrt(1 - (r / RC(B)) ** 2);   // высота купола над полом на расстоянии r от оси
const rAt = (B, y) => y <= B.Hd ? B.R : y >= B.Hd + B.Hc ? 0 : RC(B) * Math.sqrt(1 - ((y - B.Hd) / B.Hc) ** 2);
const angW = a => Math.atan2(Math.sin(a), Math.cos(a));
function bodyPt (B, al, t, out, yd) {
  const aw = al + B.ry, sa = Math.sin(aw), ca = Math.cos(aw);
  let r, y, nr, ny;
  if (yd !== undefined) { r = B.R; y = yd; nr = 1; ny = 0; }
  else { const Rc = RC(B); r = Rc * Math.cos(t); y = B.Hd + B.Hc * Math.sin(t); const a = B.Hc * Math.cos(t), b = Rc * Math.sin(t), l = Math.hypot(a, b) || 1; nr = a / l; ny = b / l; }
  return { x: B.cx + sa * (r + nr * out), y: B.cy + y + ny * out, z: B.cz + ca * (r + nr * out), nx: sa * nr, ny, nz: ca * nr, ph: Math.atan2(ny, nr), aw };
}
/* плоская фигура (в плоскости XY) — на тело: касательно в точке и прижать к поверхности (на расстоянии out по нормали) */
const BM = new THREE.Matrix4(), BE = new THREE.Euler();
function bodyWrap (B, g, al, t, out, yd) {
  const P = bodyPt(B, al, t, out, yd);
  g.applyMatrix4(BM.makeRotationFromEuler(BE.set(-P.ph, P.aw, 0, 'YXZ')).setPosition(P.x, P.y, P.z));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const qx = p.getX(i) - B.cx, qy = p.getY(i) - B.cy, qz = p.getZ(i) - B.cz;
    if (yd !== undefined) { const h = Math.hypot(qx, qz) || 1, k = (B.R + out) / h; p.setXYZ(i, B.cx + qx * k, p.getY(i), B.cz + qz * k); continue; }
    const Rc = RC(B);
    let ux = qx / Rc, uy = (qy - B.Hd) / B.Hc, uz = qz / Rc;
    const l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
    let nx = ux / Rc, ny = uy / B.Hc, nz = uz / Rc;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    p.setXYZ(i, B.cx + ux * Rc + nx * out, B.cy + B.Hd + uy * B.Hc + ny * out, B.cz + uz * Rc + nz * out);
  }
  return P;
}
/* оболочка тела — в склейку купола (цвет на треугольник): купол-эллипсоид и барабан от y0 до Hd.
   col(t°, долька 0…23 по 15°, барабан?) → цвет; g0 — поворот долек (перёд — середина дольки) */
function shellAdd (acc, B, col, g0, y0 = 0, segH = 9) {
  const cs = Math.cos(g0), sn = Math.sin(g0), C = new THREE.Color();
  const add = (g, drum) => {
    const a = g.attributes.position.array, n = g.attributes.position.count;
    for (let i = 0; i < n; i += 3) {
      let mx = 0, my = 0, mz = 0;
      for (let k = 0; k < 3; k++) { mx += a[(i + k) * 3]; my += a[(i + k) * 3 + 1]; mz += a[(i + k) * 3 + 2]; }
      mx /= 3; my /= 3; mz /= 3;
      const t = drum ? -1 : Math.asin(Math.min(1, my)) * 180 / Math.PI, az = (Math.atan2(mx, mz) + Math.PI * 2) % (Math.PI * 2);
      C.set(col(t, Math.floor(az / (Math.PI / 12)) % 24, drum));
      for (let k = 0; k < 3; k++) {
        const rr = drum ? B.R : RC(B), x = a[(i + k) * 3] * rr, z = a[(i + k) * 3 + 2] * rr, v = a[(i + k) * 3 + 1];
        const y = drum ? y0 + (v + 0.5) * (B.Hd - y0) : B.Hd + v * B.Hc;
        acc.p.push(B.cx + x * cs + z * sn, B.cy + y, B.cz - x * sn + z * cs); acc.c.push(C.r, C.g, C.b); acc.k.push(0);
      }
    }
  };
  add(new THREE.SphereGeometry(1, 24, segH, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed(), false);
  if (B.Hd - y0 > 0.01) add(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).toNonIndexed(), true);
}
/* раскраска долек: g12 — 12 долек двух тонов (как было), g6 — 6 широких, bands — поясами, swirl — винтом; выше top° — макушка */
function goreCol (kind, top = 79, topHex = CREAM, drumHex = null) {
  return (t, seg, drum) => {
    if (drum && drumHex) return drumHex;
    if (!drum && t > top) return topHex;
    if (kind === 'g6') return Math.floor(seg / 4) % 2 ? DOME2 : DOME1;
    if (kind === 'bands') return drum ? DOME1 : Math.floor(t / 10) % 2 ? DOME2 : DOME1;
    if (kind === 'swirl') return Math.floor((seg + (drum ? 0 : Math.round(t / 10))) / 2) % 2 ? DOME2 : DOME1;
    return Math.floor(seg / 2) % 2 ? DOME2 : DOME1;
  };
}
/* свободные дуги кольца (рад, θ — от «к улице», по часовой — как al): без промежутков gaps [[середина, полуширина]] */
function freeArcs (gaps, step = Math.PI / 180) {
  const out = [];
  let s = null;
  for (let a = -Math.PI; a <= Math.PI + 1e-9; a += step) {
    const ok = !gaps.some(([c, w]) => Math.abs(angW(a - c)) < w);
    if (ok && s === null) s = a;
    if ((!ok || a + step > Math.PI + 1e-9) && s !== null) { if (a - s > step) out.push([s, a]); s = null; }
  }
  return out;
}

/* птица с логотипа: тёплое оранжевое тело, хвост, хохолок и тёмные перья крыльев — бордово-красные, как тени на логотипе
   (23.10.2026: купол бордовый — птица не сливается: тело светлее купола, светлая кромка крыльев). Перёд — +Z, лапы — y = 0.
   part: 1 — голова, 2/3 — левое/правое крыло (взмах), 4 — правое крыло машет (uWave).
   Позы (12ау, у каждой пиццерии своя; pizzastyles.js bird): slice — кусок пиццы в лапе (как было), takeoff — взлетает
   (крылья вверх, лапы назад), wave — машет правым крылом, левое сложено, overhead — держит над головой целую пиццу,
   perch — сидит на коробке с пиццей, крылья сложены, courier — в кепке курьера с коробкой, chef — в поварском колпаке,
   dance — пляшет на одной ноге, крылья в стороны, клюв открыт. Голова и крылья — те же точки поворота у всех поз */
const B_HEAD = new THREE.Vector3(0, 3.25, 0.45), B_WING = new THREE.Vector3(1.0, 2.85, -0.15);
const BIRD_GEOS = new Map();
export const BIRD_LIFT = { perch: 0.62, takeoff: 0.35 };     // поза приподнята над опорой (коробка под лапами, лапы свисают), м до размера
function birdGeo (pose = 'slice') {
  if (BIRD_GEOS.has(pose)) return BIRD_GEOS.get(pose);
  const acc = { p: [], c: [], k: [] }, M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), SC = new THREE.Vector3();
  const piece = (g, hex, part, pos, rot = [0, 0, 0], scl = [1, 1, 1], order = 'XYZ') => {
    M.compose(V.set(...pos), Q.setFromEuler(E.set(rot[0], rot[1], rot[2], order)), SC.set(...scl));
    addPiece(acc, g.applyMatrix4(M), hex, part);
  };
  const ball = (seg = 7) => new THREE.SphereGeometry(1, seg, Math.max(4, seg - 2));
  const cyl = (r, h) => new THREE.CylinderGeometry(r, r, h, 5);
  // тело, брюхо, хвост
  piece(ball(8), '#f26c2c', 0, [0, 2.15, 0], [-0.35, 0, 0], [1.3, 1.55, 1.65]);
  piece(ball(7), '#ffb650', 0, [0, 1.95, 0.62], [-0.3, 0, 0], [0.95, 1.2, 1.15]);
  const tailUp = pose === 'takeoff' ? 0.35 : pose === 'dance' ? -0.25 : 0;
  for (const [a, l, hex] of [[-0.42, 2.1, '#8a2214'], [0, 2.4, '#b3361a'], [0.42, 2.1, '#8a2214']])
    piece(new THREE.BoxGeometry(0.62, 0.16, l).translate(0, 0, -l / 2), hex, 0, [0, 1.25, -1.25], [-0.55 - tailUp, a * (pose === 'takeoff' ? 1.5 : 1), 0], [1, 1, 1], 'YXZ');
  // лапы: стоит на двух (у перча — короткие, под брюхом; у взлёта — свисают назад; у пляски — одна поднята назад)
  for (const s of [1, -1]) {
    if (pose === 'takeoff') {
      piece(cyl(0.13, 1.0), '#ffb347', 0, [0.5 * s, 0.62, -0.28], [0.6, 0, 0]);
      for (const a of [-0.4, 0, 0.4]) piece(new THREE.BoxGeometry(0.14, 0.1, 0.55).translate(0, 0, -0.27), '#ffb347', 0, [0.5 * s, 0.22, -0.55], [0.9, a, 0]);
      continue;
    }
    if (pose === 'dance' && s < 0) {                          // левая нога поднята назад-вбок
      piece(cyl(0.13, 1.0), '#ffb347', 0, [-0.75, 0.95, -0.5], [-0.9, 0, -0.45]);
      continue;
    }
    const L = pose === 'perch' ? 0.55 : 0.95;
    piece(cyl(0.13, L), '#ffb347', 0, [0.55 * s, L / 2, 0.15]);
    for (const a of [-0.45, 0, 0.45]) piece(new THREE.BoxGeometry(0.14, 0.1, 0.6).translate(0, 0, 0.3), '#ffb347', 0, [0.55 * s, 0.05, 0.2], [0, a, 0]);
  }
  const slice = (pos, rx, rz) => {                            // кусок пиццы: треугольная призма, остриём вниз; корочка, три пепперони
    const sl = { p: [], c: [], k: [] }, m2 = new THREE.Matrix4();
    addPiece(sl, new THREE.CylinderGeometry(1, 1, 0.2, 3).scale(0.8, 1, 1.35), '#ffcf5a');
    addPiece(sl, new THREE.BoxGeometry(1.5, 0.34, 0.38).translate(0, 0.02, -0.72), '#d98a2e');
    for (const [x, z] of [[0, 0.35], [-0.3, -0.25], [0.3, -0.22]]) addPiece(sl, new THREE.CylinderGeometry(0.2, 0.2, 0.06, 7).translate(x, 0.12, z), '#b0301c');
    const g = accGeo(sl);
    g.applyMatrix4(m2.makeRotationX(rx)).applyMatrix4(m2.makeRotationZ(rz)).applyMatrix4(m2.makeTranslation(...pos));
    const p = g.attributes.position, c = g.attributes.color;
    for (let i = 0; i < p.count; i++) { acc.p.push(p.getX(i), p.getY(i), p.getZ(i)); acc.c.push(c.getX(i), c.getY(i), c.getZ(i)); acc.k.push(0); }
  };
  const box = (w, h, dd, pos) => {                           // коробка с пиццей: светлая, бордовая полоса и оранжевая птичка на крышке
    piece(new THREE.BoxGeometry(w, h, dd), '#fff0d2', 0, pos);
    piece(new THREE.BoxGeometry(w + 0.02, h * 0.25, dd + 0.02), '#5a1608', 0, [pos[0], pos[1] + h * 0.28, pos[2]]);
    piece(new THREE.BoxGeometry(w * 0.32, 0.05, dd * 0.32), '#ff9636', 0, [pos[0], pos[1] + h / 2 + 0.02, pos[2]]);
  };
  // что в лапах: кусок пиццы (как было), коробка (курьер), коробка под лапами (перч), целая пицца над головой
  if (pose === 'slice' || pose === 'chef' || pose === 'wave' || pose === 'takeoff') {
    piece(cyl(0.12, 1.2), '#ffb347', 0, [-0.62, 1.25, 1.35], [1.0, 0, 0]);
    slice([-0.75, 1.55, 2.05], Math.PI / 2, 0.35);
  }
  if (pose === 'courier') {
    piece(cyl(0.12, 1.2), '#ffb347', 0, [-0.62, 1.25, 1.35], [1.0, 0, 0]);
    box(1.7, 0.42, 1.7, [-0.15, 1.55, 1.95]);
  }
  if (pose === 'perch') {
    box(2.5, 0.6, 2.5, [0, -0.3, 0.1]);
  }
  if (pose === 'overhead') {                                 // целая пицца над головой: корочка, сыр, пепперони
    piece(new THREE.CylinderGeometry(1.95, 1.95, 0.24, 14), '#d98a2e', 0, [0, 6.05, 0.35]);
    piece(new THREE.CylinderGeometry(1.7, 1.7, 0.08, 14), '#ffcf5a', 0, [0, 6.2, 0.35]);
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, r = i ? 1.05 : 0; piece(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 8), '#b0301c', 0, [Math.cos(a) * r, 6.27, 0.35 + Math.sin(a) * r]); }
  }
  // голова: шар, клюв, глаза со светлой обводкой, хохолок (под кепкой и колпаком — нет)
  piece(ball(7), '#f5843a', 1, [0, 3.9, 0.75], [0, 0, 0], [0.95, 0.92, 0.98]);
  if (pose === 'dance') {                                    // клюв открыт: верх приподнят, снизу — вторая половинка
    piece(new THREE.ConeGeometry(0.34, 0.95, 4), '#ffd23f', 1, [0, 3.92, 1.82], [Math.PI / 2 - 0.3, 0, 0]);
    piece(new THREE.ConeGeometry(0.26, 0.7, 4), '#ffb347', 1, [0, 3.58, 1.7], [Math.PI / 2 + 0.35, 0, 0]);
  } else piece(new THREE.ConeGeometry(0.34, 0.95, 4), '#ffd23f', 1, [0, 3.8, 1.85], [Math.PI / 2, 0, 0]);
  for (const s of [1, -1]) {
    piece(ball(5), '#ffe3b0', 1, [0.5 * s, 4.12, 1.38], [0, 0, 0], [0.26, 0.26, 0.2]);
    piece(ball(5), '#1b1a1f', 1, [0.56 * s, 4.15, 1.48], [0, 0, 0], [0.15, 0.17, 0.12]);
  }
  if (pose === 'chef') {                                     // поварской колпак: светлый цилиндр и пышная шапка
    piece(new THREE.CylinderGeometry(0.62, 0.66, 0.8, 9), '#fff8ec', 1, [0, 4.85, 0.62]);
    piece(ball(7), '#fff8ec', 1, [0, 5.4, 0.62], [0, 0, 0], [0.92, 0.55, 0.92]);
  } else if (pose === 'courier') {                           // кепка курьера: бордовая, козырёк вперёд, оранжевая пуговка
    piece(new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), '#5a1608', 1, [0, 4.42, 0.7], [0, 0, 0], [0.92, 0.6, 0.98]);
    piece(new THREE.BoxGeometry(1.25, 0.1, 0.75), '#5a1608', 1, [0, 4.45, 1.6], [0.12, 0, 0]);
    piece(ball(5), '#ff9636', 1, [0, 5.02, 0.7], [0, 0, 0], [0.16, 0.12, 0.16]);
  } else {
    for (const [y, z, a, h] of [[4.75, 0.65, -0.45, 0.9], [4.6, 0.25, -0.8, 0.75], [4.35, -0.05, -1.1, 0.6]])
      piece(new THREE.ConeGeometry(0.2, h, 4), '#9a2616', 1, [0, y, z], [a, 0, 0]);
  }
  // крылья: «галочкой», как на логотипе (веер перьев от плеча вверх и назад), или сложены вдоль боков
  const F = [[0.72, 2.4, 0.1, '#f08a2a'], [0.92, 2.9, 0.22, '#a82a16'], [1.1, 3.1, 0.34, '#e8762a'], [1.27, 2.8, 0.46, '#8a2214'], [1.42, 2.3, 0.58, '#a82a16']];
  const wing = (s, mode, part) => {
    const px = B_WING.x * s;
    if (mode === 'fold') {                                   // сложено: перья плашмя вдоль бока, назад и чуть вниз
      piece(ball(6), '#d9541f', part, [1.08 * s, 2.55, -0.1], [0, 0, 0], [0.42, 0.75, 1.05]);
      for (const [a, l, sw, hex] of [[-0.22, 2.0, 1.42, '#d9541f'], [-0.38, 2.3, 1.36, '#a82a16'], [-0.52, 2.1, 1.3, '#e8762a'], [-0.68, 1.8, 1.24, '#8a2214']])
        piece(new THREE.BoxGeometry(l, 0.15, 0.62).translate(l / 2, 0, 0).scale(s, 1, 1), hex, part, [1.16 * s, 2.7, 0.25], [Math.PI / 2 - 0.15, sw * s, a * s], [1, 1, 1], 'YZX');
      piece(new THREE.BoxGeometry(1.9, 0.17, 0.2).translate(0.95, 0, 0.3).scale(s, 1, 1), '#ffb347', part, [1.2 * s, 2.95, 0.25], [Math.PI / 2, 1.4 * s, -0.2 * s], [1, 1, 1], 'YZX');
      return;
    }
    // up — как на логотипе; high — выше и шире (взлёт, машет); hold — почти отвесно (держит пиццу); spread — в стороны (пляска); low — ниже (повар)
    const ka = { up: [1, 0], high: [1, 0.45], hold: [0.35, 1.05], spread: [0.3, -0.08], low: [1, -0.25] }[mode];
    const ks = { up: 1, high: 0.4, hold: 0.25, spread: 0.45, low: 1 }[mode];
    piece(ball(6), '#d9541f', part, [px + 0.25 * s, B_WING.y + 0.1, B_WING.z], [0, 0, 0.6 * s], [0.75, 0.45, 0.85]);
    for (const [a0, l, sw, hex] of F) {
      const a = mode === 'hold' ? 1.3 + (a0 - 0.72) * ka[0] : a0 * ka[0] + ka[1];
      piece(new THREE.BoxGeometry(l, 0.15, 0.62).translate(l / 2, 0, 0).scale(s, 1, 1), hex, part, [px, B_WING.y, B_WING.z], [mode === 'spread' ? 1.2 : 0, (sw * ks - (mode === 'hold' ? 0.12 : 0)) * s, a * s], [1, 1, 1], 'YZX');   // в стороны — перья веером к улице
    }
    // светлая кромка, как обводка на логотипе
    const ea = mode === 'hold' ? 1.45 : 0.8 * ka[0] + ka[1];
    piece(new THREE.BoxGeometry(2.1, 0.17, 0.2).translate(1.05, 0, 0.3).scale(s, 1, 1), '#ffb347', part, [px, B_WING.y, B_WING.z], [0, -0.1 * s, ea * s], [1, 1, 1], 'YZX');
  };
  const WINGS = {
    slice: [['up', 2], ['up', 3]], takeoff: [['high', 2], ['high', 3]], wave: [['high', 4], ['fold', 0]], overhead: [['hold', 0], ['hold', 0]],
    perch: [['fold', 0], ['fold', 0]], courier: [['up', 2], ['up', 3]], chef: [['low', 2], ['low', 3]], dance: [['spread', 2], ['spread', 3]],
  }[pose] || [['up', 2], ['up', 3]];
  wing(1, ...WINGS[0]); wing(-1, ...WINGS[1]);
  const g = accGeo(acc);
  g.computeBoundingSphere();
  g.boundingSphere.radius += 1.5;          // крылья взмахивают — шар отсечения с запасом
  BIRD_GEOS.set(pose, g);
  return g;
}
function birdMat () {
  if (BIRD_MAT) return BIRD_MAT;
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#ffffff', emissiveIntensity: DAYGLOW });
  glowOwn(m, 'pzbird', sh => {
    Object.assign(sh.uniforms, BU);
    sh.uniforms.uHP = { value: B_HEAD }; sh.uniforms.uWP = { value: B_WING };
    sh.vertexShader = 'attribute float part;\nuniform float uYaw, uWing, uWave;\nuniform vec3 uHP, uWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
      if (part > 0.5 && part < 1.5) {
        vec3 q = transformed - uHP; float c = cos(uYaw), s = sin(uYaw);
        transformed = uHP + vec3(c * q.x + s * q.z, q.y, -s * q.x + c * q.z);
      } else if (part > 1.5) {
        float sg = part > 2.5 && part < 3.5 ? -1.0 : 1.0; vec3 pv = vec3(uWP.x * sg, uWP.y, uWP.z);
        float an = part > 3.5 ? uWave : uWing * sg;
        vec3 q = transformed - pv; float c = cos(an), s = sin(an);
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

/* стоянка курьеров не на куполе и его площади */
const plazaBlock = (cx, cz) => (x, z) => Math.hypot(x - cx, z - cz) < DOME.R + DOME.PLAZA + 0.5;
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
      if (lots && !lotBase(A, g, lots, plazaBlock(cx, cz))) continue;
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
  // вариант здания (12ау) — по номеру пиццерии: Юг строится первым (классика), дальше районы по порядку
  const SC0 = A.scene.children.length;                         // своих мешей на купол (DEBUG.stats: own)
  const VI = PZ_CLASSIC ? 0 : DOMES.length % STYLES.length, V = STYLES[VI];
  const D = DOME, R = D.R, PL = D.PLINTH, { x: cx, z: cz, fx, fz, rx, rz, road } = S;
  const gy = S.gy, cy = gy + PL;                               // центр полусферы — на цоколе; пол зала — тоже
  const ry = Math.atan2(fx, fz);                               // «перёд» модели (+Z) — к улице
  const at = (u, v) => [cx + rx * u + fx * v, cz + rz * u + fz * v];
  const { put, LIT, FLAT, LAMPH, LITM, FLATM } = A;
  const deg = Math.PI / 180, M4 = new THREE.Matrix4();
  // местные u, v, y (от земли) → мир: для геометрии, собранной «в рамке» купола
  const local = (g, u, v, y) => g.applyMatrix4(M4.makeRotationY(ry)).translate(...((p) => [p[0], gy + y, p[1]])(at(u, v)));
  const B = { cx, cy, cz, R, Rc: V.Rc || R, Hd: V.Hd, Hc: V.Hc, ry }, H = V.Hd + V.Hc;   // тело купола; H — макушка над полом

  // площадь из светлой плитки с оранжевым кольцом и дорожка к улице
  // Площадь — до тротуара (11.10.2026, пометки автора «коллизия текстур»): край, что лёг бы на тротуар или полотно
  // (pave.js), подтянут к куполу — со стороны улицы площадь срезана по краю тротуара, оранжевое кольцо идёт по
  // этому краю. Раньше круг заходил на тротуар (0,11 м) и под поднятую плиту (0,30 м): плитка, кольцо и тротуар
  // лежали внахлёст. Слои на площади — каждый своей высоты: площадь 0,13, дорожка к улице 0,128, дорожка к стоянке
  // 0,14, кольцо 0,15, штрихи 0,17 (над землёй, м)
  const PR = R + D.PLAZA, NP = 64, rim = [];
  const onWalk = (x, z) => { const k = onPave(x, z, 0); return k === 'walk' || k === 'road'; };
  for (let i = 0; i < NP; i++) {
    const a = i / NP * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    let rr = PR;
    if (onWalk(cx + ca * rr, cz + sa * rr)) { while (rr > R + 0.9 && onWalk(cx + ca * rr, cz + sa * rr)) rr -= 0.05; rr = Math.min(PR, rr + 0.04); }   // встык к краю тротуара, без полоски травы
    rim.push(rr);
  }
  const rimAt = (i, k = 0) => { const a = (i % NP) / NP * Math.PI * 2, rr = rim[i % NP] - k; return [cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]; };
  LITM.color('#d9d3c9');
  for (let i = 0; i < NP; i++) { const [x1, z1] = rimAt(i), [x2, z2] = rimAt(i + 1); LITM.dtri(cx, cz, x1, z1, x2, z2, 0.13); }
  FLATM.color(ORANGE);
  for (let i = 0; i < NP; i++) { const [x1, z1] = rimAt(i, 0.6), [x2, z2] = rimAt(i + 1, 0.6); FLATM.ribbon(x1, z1, x2, z2, 0.35, 0.15); }
  {
    // дорожка к улице — до внешнего края тротуара, не поверх него
    const v1 = road.d - walkHalf(road.seg) + 0.05;
    if (v1 > PR - 0.5) { const [x1, z1] = at(0, PR - 0.5), [x2, z2] = at(0, v1); LITM.color('#d9d3c9'); LITM.ribbon(x1, z1, x2, z2, 4.2, 0.128); }
  }
  // цоколь: светлый, уходит в землю на SLOPE — на склоне купол не висит
  put(LIT, new THREE.CylinderGeometry(R + 0.35, R + 0.5, PL + D.SLOPE, 32), '#f1e2c4', cx, gy + (PL - D.SLOPE) / 2, cz);

  // окно выдачи курьерам — сбоку, со стороны парковки
  const lb = opt.lots ? lotBase(A, { mx: cx, mz: cz, road }, opt.lots, plazaBlock(cx, cz)) : null;   // то же место, что нашёл поиск (site)
  let side = 1;
  if (lb) { const lx = lb.base[0] + lb.nx * (lb.off + lb.D / 2), lz = lb.base[1] + lb.nz * (lb.off + lb.D / 2); side = (lx - cx) * rx + (lz - cz) * rz >= 0 ? 1 : -1; }
  const KA = side * 62 * deg, ku = Math.sin(KA), kv = Math.cos(KA);   // направление на окно выдачи
  const kat = (w, d) => at(ku * d + kv * w, kv * d - ku * w);          // w — вбок, d — от центра
  const kry = ry + KA;

  // купол: бордовые дольки двух тонов, светлая макушка; ночью светится своим цветом; снег — как у города (seasons.js).
  // Всё тело здания (купол, барабан, второй купол, башенка, козырёк, галерея, корочка) — одна сетка: один вызов
  if (!DOME_MAT) { const m = seasonMat(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#ffffff', emissiveIntensity: DAYGLOW }), 0.4); DOME_MAT = glowOwn(m, 'season0.4dome', m.onBeforeCompile); }
  const G0 = ry + 15 * deg;                                    // дольки — от входа: перёд — середина дольки
  const dacc = { p: [], c: [], k: [] };
  const topT = V.extra === 'crust' ? 64 : 79;
  shellAdd(dacc, B, goreCol(V.gore, topT, V.extra === 'crust' ? '#ffd25a' : CREAM, V.extra === 'ribs' ? '#ffe3b0' : null), G0, 0, V.Hc > 9.5 ? 11 : 9);
  const dAdd = (g, hex) => addPiece(dacc, g, hex);
  const ring = (r, h, y, hex, gaps, closed = true) => {        // кольцо-пояс вокруг оси купола (y — над полом), без промежутков gaps
    for (const [a0, a1] of gaps ? freeArcs(gaps) : [[-Math.PI, Math.PI]])
      dAdd(new THREE.CylinderGeometry(r, r, h, Math.max(2, Math.ceil((a1 - a0) / (Math.PI / 24))), 1, !closed, a0, a1 - a0).rotateY(ry).translate(cx, cy + y, cz), hex);
  };
  let birdAt = [cx, cy + H - 0.15, cz], glowRing = { B, t: topT };
  const wins = [];                                             // доп. окна: [тело, угол °, высота на барабане, размер]
  if (V.extra === 'cornice') {
    // карниз между этажами: светлый пояс с оранжевой полосой, под ним — гирлянда лампочек (ночью горит)
    ring(R + 0.22, 0.42, V.Hd + 0.1, CREAM, [[0, 17 * deg]]);
    ring(R + 0.1, 0.12, V.Hd - 0.3, ORANGE, [[0, 17 * deg]], false);
    for (let i = 0; i < 48; i++) {
      const a = (i + 0.5) / 48 * Math.PI * 2;
      if (Math.abs(angW(a)) < 19 * deg) continue;
      const aw = a + ry;
      put(LAMPH, new THREE.SphereGeometry(0.13, 5, 4), i % 3 ? '#ffe9a8' : '#ffb347', cx + Math.sin(aw) * (R + 0.3), cy + V.Hd - 0.12, cz + Math.cos(aw) * (R + 0.3));
    }
  }
  if (V.extra === 'canopy') {
    // козырёк вокруг купола: полосатые доски (бордовый / светлый) с зубцами по краю, под ним — лампочки; над входом и окном выдачи — без
    const N = 40, CY = 2.85, TL = 0.12, LEN = 3.0, R0 = 7.6;
    for (let i = 0; i < N; i++) {
      const a = (i + 0.5) / N * Math.PI * 2;
      if (Math.abs(angW(a)) < 25 * deg || Math.abs(angW(a - KA)) < 13 * deg) continue;
      const hex = i % 2 ? CREAM : BRD2, w = 2 * Math.PI * (R0 + LEN) / N * 1.04;
      dAdd(new THREE.BoxGeometry(w, 0.1, LEN).translate(0, 0, LEN / 2).rotateX(TL).translate(0, 0, R0).rotateY(a + ry).translate(cx, cy + CY, cz), hex);
      dAdd(new THREE.BoxGeometry(w, 0.3, 0.06).translate(0, -0.15, R0 + LEN * Math.cos(TL)).rotateY(a + ry).translate(cx, cy + CY - LEN * Math.sin(TL), cz), hex);
      const aw = a + ry, rb = R0 + LEN - 0.35;
      put(LAMPH, new THREE.SphereGeometry(0.12, 5, 4), '#ffe9a8', cx + Math.sin(aw) * rb, cy + CY - (rb - R0) * Math.sin(TL) - 0.2, cz + Math.cos(aw) * rb);
    }
  }
  if (V.extra === 'ribs') {
    // светящиеся рёбра от светлого пояса к макушке (по бокам и сзади; спереди — вывеска)
    for (const a of [67.5, -67.5, 112.5, -112.5, 157.5, -157.5]) {
      const al = a * deg, t0 = Math.abs(angW(al - KA)) < 14 * deg ? 9 * deg : 0, t1 = 80 * deg, n = 16, pos = [];
      for (let k = 0; k < n; k++) {
        const ta = t0 + (t1 - t0) * k / n, tb = t0 + (t1 - t0) * (k + 1) / n;
        const P0 = bodyPt(B, al, ta, 0.05), P1 = bodyPt(B, al, tb, 0.05), sx = Math.cos(P0.aw) * 0.14, sz = -Math.sin(P0.aw) * 0.14;
        pos.push(P0.x - sx, P0.y, P0.z - sz, P0.x + sx, P0.y, P0.z + sz, P1.x + sx, P1.y, P1.z + sz,
          P0.x - sx, P0.y, P0.z - sz, P1.x + sx, P1.y, P1.z + sz, P1.x - sx, P1.y, P1.z - sz);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      put(LAMPH, g, '#ffd9a0', 0, 0, 0);
    }
  }
  if (V.extra === 'balcony') {
    // галерея на середине высоты: плита, оранжевая кромка, перила со столбиками и огоньками; спереди (вывеска) — без
    const YB = 4.55, RB = R + 0.15, GB = [[0, 40 * deg]];
    ring(RB, 0.25, YB, '#f1e2c4', GB);
    ring(RB + 0.02, 0.08, YB + 0.02, ORANGE, GB, false);
    for (const [a0, a1] of freeArcs(GB)) {
      for (const [y, hex] of [[0.95, CREAM], [0.55, ORANGE]])
        put(LIT, new THREE.CylinderGeometry(R, R, 0.07, Math.ceil((a1 - a0) / (Math.PI / 24)), 1, true, a0, a1 - a0).rotateY(ry), hex, cx, cy + YB + 0.12 + y, cz);
      const n = Math.ceil((a1 - a0) / (7.5 * deg));
      for (let k = 0; k <= n; k++) {
        const aw = a0 + (a1 - a0) * k / n + ry, x = cx + Math.sin(aw) * R, z = cz + Math.cos(aw) * R;
        A.box(LIT, 0.08, 0.95, 0.08, BRD2, x, cy + YB + 0.6, z, aw);
        if (k % 3 === 0) put(LAMPH, new THREE.SphereGeometry(0.14, 6, 4), '#ffe9a8', x, cy + YB + 1.13, z);
      }
    }
  }
  if (V.extra === 'crust') {
    // «корочка» по низу купола — как у пиццы; над входом и окном выдачи — разрыв
    for (const [a0, a1] of freeArcs([[0, 22 * deg], [KA, 12 * deg]])) {
      const g = new THREE.TorusGeometry(R + 0.15, 0.66, 6, Math.ceil((a1 - a0) / (Math.PI / 20)), a1 - a0).rotateZ(Math.PI / 2 - a1).rotateX(Math.PI / 2);
      dAdd(g.rotateY(ry).translate(cx, cy + 0.2, cz), '#e39a3e');
      for (const a of [a0, a1]) { const aw = a + ry; dAdd(new THREE.SphereGeometry(0.66, 6, 4).translate(cx + Math.sin(aw) * (R + 0.15), cy + 0.2, cz + Math.cos(aw) * (R + 0.15)), '#e39a3e'); }
      for (let a = a0 + 0.12; a < a1 - 0.08; a += 0.21) {     // подпалины на корочке
        const aw = a + ry, rr = R + 0.15 + 0.5, yy = cy + 0.2 + 0.32 * Math.sin(a * 7);
        dAdd(new THREE.SphereGeometry(0.2, 5, 3).scale(1, 0.6, 1).translate(cx + Math.sin(aw) * rr, yy, cz + Math.cos(aw) * rr), '#b8692a');
      }
    }
    // сырная макушка с кружками пепперони
    for (let i = 0; i < 6; i++) { const g = new THREE.CircleGeometry(0.62, 10); bodyWrap(B, g, (i * 60 + 30) * deg, 71 * deg, 0.03); dAdd(g, '#b0301c'); }
  }
  if (V.top === 'dome2') {
    // второй купол сзади: светлый барабан с окошками и оранжевым карнизом, дольки — наоборот, светлая макушка; птица — на нём
    const [x2, z2] = at(0, -2.6), B2 = { cx: x2, cy, cz: z2, R: 4.2, Hd: 8.6, Hc: 4.2, ry };
    shellAdd(dacc, B2, (t, seg, drum) => drum ? '#ffe3b0' : t > 79 ? CREAM : Math.floor(seg / 2) % 2 ? DOME1 : DOME2, G0, 3.8, 7);
    dAdd(new THREE.CylinderGeometry(B2.R + 0.2, B2.R + 0.2, 0.3, 24).translate(x2, cy + B2.Hd + 0.05, z2), ORANGE);
    for (let i = 0; i < 8; i++) wins.push([B2, i * 45 + 22.5, 7.85, 0.42]);
    birdAt = [x2, cy + B2.Hd + B2.Hc - 0.1, z2]; glowRing = { B: B2, t: 79 };
  }
  if (V.top === 'tower') {
    // башенка из макушки: бордовая в светлую полоску, иллюминаторы, светящиеся кольца, шапка-купол, площадка — птица на ней
    const BT = { cx, cy, cz, R: 1.9, Hd: 12.4, Hc: 0.05, ry }, BC = { cx, cy, cz, R: 2.35, Hd: 12.6, Hc: 1.9, ry };
    shellAdd(dacc, BT, (t, seg) => seg % 4 === 0 ? CREAM : DOME1, G0, 7.4, 3);
    shellAdd(dacc, BC, (t, seg, drum) => drum ? CREAM : t > 72 ? CREAM : Math.floor(seg / 2) % 2 ? DOME2 : DOME1, G0, 12.35, 6);
    dAdd(new THREE.CylinderGeometry(BC.R, BC.R, 0.04, 24).translate(cx, cy + 12.37, cz), CREAM);   // донце шапки — снизу не видно сквозь
    dAdd(new THREE.CylinderGeometry(1.0, 1.0, 0.6, 10).translate(cx, cy + 14.2, cz), DOME2);
    dAdd(new THREE.CylinderGeometry(1.45, 1.45, 0.22, 16).translate(cx, cy + 14.53, cz), CREAM);
    put(LAMPH, new THREE.TorusGeometry(2.0, 0.13, 4, 24), GLOW, cx, cy + surfY(B, 2.0) + 0.1, cz, Math.PI / 2, 0, 0);
    put(LAMPH, new THREE.TorusGeometry(2.42, 0.1, 4, 28), GLOW, cx, cy + 12.32, cz, Math.PI / 2, 0, 0);
    for (let i = 0; i < 4; i++) wins.push([BT, i * 90, 10.8, 0.55]);
    birdAt = [cx, cy + 14.64, cz]; glowRing = null;
  }
  A.scene.add(new THREE.Mesh(accGeo(dacc), DOME_MAT));
  // светящийся ободок у макушки — на нём сидит птица
  if (glowRing) { const t = glowRing.t * deg, BB = glowRing.B; put(LAMPH, new THREE.TorusGeometry(BB.R * Math.cos(t) + 0.05, 0.14, 4, 32), GLOW, BB.cx, BB.cy + BB.Hd + BB.Hc * Math.sin(t), BB.cz, Math.PI / 2, 0, 0); }

  // окна: круги-«пепперони» и дольки пиццы разного размера на разной высоте, толстая светлая рама (ночью светится);
  // сквозь стекло — зал: люди за столиками едят (winMat). Все окна и стекло входа — одна сетка.
  // [угол от входа, высота над горизонтом (°) или на барабане (м), размер, форма, на барабане] — pizzastyles.js
  const ga = { p: [], c: [], n: [], f: [] };
  const winAdd = (BW, a, pos, r, kind, drum, i) => {
    const al = a * deg, t = drum ? 0 : pos * deg, yd = drum ? pos : undefined;
    const yy = drum ? pos : BW.Hd + BW.Hc * Math.sin(t);       // над полом
    if (BW === B && Math.abs(angW(al - KA)) < 20 * deg && yy < 3.85) return;   // там окно выдачи
    const fr = V.frame[kind === 'o' ? 0 : 1];
    const gf = winShape(kind, r * (kind === 'o' ? 1.24 : 1.22)); bodyWrap(BW, gf, al, t, 0.07, yd);
    put(LAMPH, gf, fr, 0, 0, 0);
    const g = winShape(kind, r), P = bodyWrap(BW, g, al, t, 0.1, yd);
    const fy = VI && P.y - cy > 4.2 ? P.y - 1.5 : cy;          // окна второго этажа — тоже в зал (у классики — как было)
    glassAdd(ga, g, [P.x, P.y, P.z], [P.nx, P.ny, P.nz], fy, i * 0.61);
  };
  V.win.forEach(([a, pos, r, kind, drum], i) => winAdd(B, a, pos, r, kind, drum, i));
  wins.forEach(([BW, a, y, r], i) => winAdd(BW, a, y, r, 'o', 1, V.win.length + i));

  // вход — арка-портал из купола к улице: бордовый свод, светлая светящаяся арка, стеклянная стена с двойной дверью
  // (сквозь неё тоже виден зал), полосатая маркиза, над аркой — объёмные буквы названия на куполе, ступеньки, коврик
  const AR = 2.9, AW = 1.5, VF = R + D.PORCH, AY = PL + AW;   // радиус свода, высота стенок, где свод кончается
  const V0 = Math.min(6.2, rAt(B, AW + AR + 0.35) - 0.3);      // где свод начинается — внутри купола (у низкого — ближе к центру)
  {
    const len = VF - V0, vm = (V0 + VF) / 2;
    put(LIT, local(new THREE.CylinderGeometry(AR + 0.25, AR + 0.25, len, 18, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), 0, vm, AY), BRD2, 0, 0, 0);
    for (const s of [-1, 1]) { const [x, z] = at(s * (AR + 0.12), vm); A.box(LIT, 0.5, AW + PL, len, BRD2, x, gy + (AW + PL) / 2, z, ry); }
    put(LAMPH, local(new THREE.TorusGeometry(AR + 0.25, 0.28, 6, 20, Math.PI), 0, VF + 0.05, AY), V.arch, 0, 0, 0);
    for (const s of [-1, 1]) { const [x, z] = at(s * (AR + 0.25), VF + 0.05); A.box(LAMPH, 0.56, AY, 0.56, V.arch, x, gy + AY / 2, z, ry); }
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
    // маркиза над дверями: полоски двух цветов (свои у каждой пиццерии), край — зубцами
    const CY = PL + 2.85, CL = 1.25, NS = 10, sw = 5.2 / NS;
    for (let i = 0; i < NS; i++) {
      const u = -2.6 + (i + 0.5) * sw, hex = i % 2 ? V.awn[1] : V.awn[0];
      put(LIT, local(new THREE.BoxGeometry(sw, 0.06, CL).translate(0, 0, CL / 2).rotateX(0.42), u, VF - 0.32, CY), hex, 0, 0, 0);
      put(LIT, local(new THREE.BoxGeometry(sw, 0.28, 0.05), u, VF - 0.32 + CL * Math.cos(0.42), CY - CL * Math.sin(0.42) - 0.12), hex, 0, 0, 0);
    }
    // ступеньки (две, три или полукругом) и коврик
    const STC = '#e6dccb';
    if (V.steps === 'three') {
      for (const [w, h, d, v] of [[6.0, 0.3, 0.55, 0.025], [6.4, 0.2, 0.4, 0.5], [6.8, 0.1, 0.35, 0.875]]) { const [x, z] = at(0, VF + v); A.box(LIT, w, h, d, STC, x, gy + h / 2, z, ry); }
    } else if (V.steps === 'half') {
      put(LIT, local(new THREE.CylinderGeometry(3.3, 3.3, 0.3, 16, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 0.8 / 3.3), 0, VF - 0.25, 0.15), STC, 0, 0, 0);
      put(LIT, local(new THREE.CylinderGeometry(3.6, 3.6, 0.15, 16, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 1.3 / 3.6), 0, VF - 0.25, 0.075), STC, 0, 0, 0);
    } else {
      { const [x, z] = at(0, VF + 0.15); A.box(LIT, 6.0, 0.3, 0.8, STC, x, gy + 0.15, z, ry); }
      { const [x, z] = at(0, VF + 0.8); A.box(LIT, 6.0, 0.15, 0.5, STC, x, gy + 0.075, z, ry); }
    }
    { const [x, z] = at(0, VF + 1.75); A.box(LIT, 2.6, 0.04, 1.3, ORANGE, x, gy + 0.15, z, ry); A.box(LIT, 2.3, 0.05, 1.0, /^#fff/.test(V.awn[0]) ? BRD2 : V.awn[0], x, gy + 0.16, z, ry); }
    // у крыльца: фонари на столбиках или флаги с бордовым полотнищем (твёрдые — сквозь не проехать)
    if (V.porch === 'lanterns') for (const s of [-1, 1]) {
      const [x, z] = at(s * (AR + 0.75), VF + 1.25);
      A.box(LIT, 0.12, 2.3, 0.12, '#3a3036', x, gy + 1.15, z, ry);
      A.box(LAMPH, 0.34, 0.45, 0.34, '#ffe9a8', x, gy + 2.5, z, ry);
      A.box(LIT, 0.48, 0.08, 0.48, BRD2, x, gy + 2.76, z, ry);
      A.obb(x, z, 0.15, 0.15, -ry); A.LAMP_SPOTS.push([x, z]);
    }
    if (V.porch === 'flags') for (const s of [-1, 1]) {
      const [x, z] = at(s * (AR + 1.35), VF - 0.6), [x2, z2] = at(s * (AR + 2.05), VF - 0.6);
      A.box(LIT, 0.1, 4.6, 0.1, '#e6dccb', x, gy + 2.3, z, ry);
      A.box(LIT, 1.4, 0.9, 0.04, BRD2, x2, gy + 4.05, z2, ry);
      A.box(LIT, 1.42, 0.16, 0.05, V.awn[0] === BRD2 ? ORANGE : V.awn[0], x2, gy + 4.05, z2, ry);
      put(LAMPH, new THREE.SphereGeometry(0.12, 6, 4), GLOW, x, gy + 4.68, z);
      A.obb(x, z, 0.12, 0.12, -ry);
    }
  }
  // вывеска — объёмные буквы названия дугой на куполе над входом (sign — для growth.js: мигает у загибающейся,
  // ярче светится у процветающей — signGlow). На низком куполе дуга ниже свода арки — буквы прямой строкой над аркой;
  // где купол ниже полусферы — дуга сдвинута на его поверхность (и чуть меньше, чтобы не уйти в свод)
  const VW = 2 * AR;
  let sign;
  if (V.Hc < 6) {
    sign = new THREE.Mesh(signGeo(opt.brand, R, true), signMat());
    const [sx, sz] = at(0, VF + 0.05), W = sign.geometry.userData.w || 6;
    A.box(LIT, W + 0.5, 0.14, 0.42, BRD2, sx, gy + AY + AR + 0.6, sz, ry);
    sign.position.set(sx, gy + AY + AR + 0.67, sz);
  } else {
    sign = new THREE.Mesh(signGeo(opt.brand, R), signMat());
    const mid = SIGN.EL * deg + SIGN.H / 2 / R, rr = R * Math.cos(mid), ym = R * Math.sin(mid);
    let k = 1;
    while (k > 0.72 && surfY(B, rr * k) < AW + AR + 0.6 + SIGN.H / 2 * k) k -= 0.01;
    sign.scale.setScalar(k);
    sign.position.set(cx, cy + surfY(B, rr * k) - ym * k, cz);
  }
  sign.rotation.y = ry;
  if (V.sign) sign.material.color.set(V.sign);
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
    for (let i = 0; i < 4; i++) {                              // козырёк: полоски — как маркиза входа
      const [x, z] = kat(-0.9 + i * 0.6, KD + 0.45);
      const g = new THREE.BoxGeometry(0.6, 0.06, 0.95).rotateX(0.35);
      put(LIT, g, i % 2 ? V.awn[1] : V.awn[0], x, gy + 2.35, z, 0, kry, 0);
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

  // птица наверху — одна сетка с логотипа, своя поза у каждой пиццерии (голова и крылья двигаются в шейдере, step)
  const bird = new THREE.Mesh(birdGeo(V.bird), birdMat());
  bird.position.set(birdAt[0], birdAt[1] + (BIRD_LIFT[V.bird] || 0) * V.bs, birdAt[2]); bird.rotation.y = ry; bird.scale.setScalar(V.bs);
  A.scene.add(bird);

  // свет у цоколя: днём — светлые плафоны, ночью — пятна света на плитке. box8 — 8 плафонов (как было), globe12 — 12 шаров
  // на столбиках, post6 — 6 фонарей-столбов, strip — светящаяся лента по краю цоколя
  const nearGap = a => Math.abs(angW(a - ry)) < 21 * deg || Math.abs(angW(a - ry - KA)) < 12 * deg;
  if (V.lamps === 'box8') {
    const LR = V.extra === 'crust' ? R + 1.15 : R + 0.85;
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + Math.PI / 8 + ry;
      const x = cx + Math.sin(a) * LR, z = cz + Math.cos(a) * LR;
      put(LAMPH, new THREE.BoxGeometry(0.5, 0.3, 0.5), GLOW, x, gy + 0.3, z, 0, a, 0);
      A.LAMP_SPOTS.push([cx + Math.sin(a) * (R + 1.6), cz + Math.cos(a) * (R + 1.6)]);
    }
  } else if (V.lamps === 'globe12') {
    for (let i = 0; i < 12; i++) {
      const a = (i + 0.5) / 12 * Math.PI * 2 + ry;
      if (nearGap(a)) continue;
      const x = cx + Math.sin(a) * (R + 0.95), z = cz + Math.cos(a) * (R + 0.95);
      A.box(LIT, 0.1, 0.6, 0.1, BRD2, x, gy + 0.3, z, a);
      put(LAMPH, new THREE.SphereGeometry(0.22, 6, 4), '#ffe9a8', x, gy + 0.78, z);
      A.LAMP_SPOTS.push([cx + Math.sin(a) * (R + 1.6), cz + Math.cos(a) * (R + 1.6)]);
    }
  } else if (V.lamps === 'post6') {
    for (const d of [45, -45, 105, -105, 165, -165]) {
      const a = d * deg + ry;
      if (nearGap(a)) continue;
      const x = cx + Math.sin(a) * (R + 1.2), z = cz + Math.cos(a) * (R + 1.2);
      A.box(LIT, 0.13, 2.7, 0.13, '#3a3036', x, gy + 1.35, z, a);
      put(LAMPH, new THREE.SphereGeometry(0.3, 7, 5), '#ffe9a8', x, gy + 2.95, z);
      A.box(LIT, 0.5, 0.08, 0.5, BRD2, x, gy + 3.27, z, a);
      A.obb(x, z, 0.15, 0.15, -a);
      A.LAMP_SPOTS.push([cx + Math.sin(a) * (R + 2.0), cz + Math.cos(a) * (R + 2.0)]);
    }
  } else {
    put(LAMPH, new THREE.TorusGeometry(R + 0.45, 0.1, 4, 64), GLOW, cx, gy + PL + 0.04, cz, Math.PI / 2, 0, 0);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8 + ry; A.LAMP_SPOTS.push([cx + Math.sin(a) * (R + 1.6), cz + Math.cos(a) * (R + 1.6)]); }
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

  // летняя веранда: столики под пёстрыми зонтиками (цвета — свои у каждой пиццерии), по два стула — вдоль
  // «вправо» купола (сюда growth.js сажает гостей), кадки с цветами у проходов, низкий заборчик по краю площади
  const RV = R + 2.75, free = [], extra = [];
  const UMB = V.umb;
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
  // заборчик веранды: две перекладины и столбики (цвета — свои у каждой пиццерии); проходы — у входа и к окну выдачи
  const RFc = PR - 1.0;
  for (const s of [1, -1]) for (let a = 34; a < 166; a += 9) {
    const a0 = s * a * deg, a1 = s * (a + 9) * deg;
    if (Math.abs((a0 + a1) / 2 - KA) < 16 * deg) continue;
    const [x0, z0] = at(Math.sin(a0) * RFc, Math.cos(a0) * RFc), [x1, z1] = at(Math.sin(a1) * RFc, Math.cos(a1) * RFc);
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    if (!freeAt(mx, mz, 0.3)) continue;
    const y = A.groundH(mx, mz), l = Math.hypot(x1 - x0, z1 - z0), yr = Math.atan2(-(z1 - z0), x1 - x0), g = [];
    put(g, new THREE.BoxGeometry(l, 0.08, 0.06), V.fence[0], mx, y + 0.85, mz, 0, yr, 0);
    put(g, new THREE.BoxGeometry(l, 0.08, 0.06), V.fence[1], mx, y + 0.5, mz, 0, yr, 0);
    put(g, new THREE.BoxGeometry(0.1, 0.95, 0.1), V.fence[2], x0, y + 0.48, z0);
    A.smashAdd('fence', mx, mz, 1.2, g, V.fence[1]);
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
  // ring — где гирлянда «на подъёме» обходит купол (growth.js): над порталом, на «широте» ringT своего купола
  const RE = V.ringT * deg;
  DOMES.push({ x: cx, z: cz, R: R + 0.3, base: R, gy, bird, ry, dist: S.dist, sign, letters: true, signGlow: 0, road, free, extra, style: VI, kind: V.name, own: A.scene.children.length - SC0,
    porch: { V0, V1: VF - 0.3, VW, VH: 2.75, ST: 1.3 }, ring: { r: R * Math.cos(RE) + 0.12, y: cy + V.Hd + V.Hc * Math.sin(RE) } });

  // парковка курьеров — у улицы, сбоку от купола
  const g = { mx: cx, mz: cz, road };
  const slots = opt.lots ? courierLot(A, g, opt.lots, lb) : null;

  // подъезжать — в ближнюю к куполу полосу улицы
  const ddx = cx - road.x, ddz = cz - road.z, dl = Math.hypot(ddx, ddz) || 1;
  const off = Math.min(opt.lane || 3.2, Math.max(0, dl - 4));
  const sa = ry - side * Math.PI * 0.62, sx = cx + Math.sin(sa) * (R + 1.6), sz = cz + Math.cos(sa) * (R + 1.6);   // курилка — с другой стороны от окна выдачи
  return {
    x: road.x + ddx / dl * off, z: road.z + ddz / dl * off,
    bx: cx, bz: cz, by: gy, wx, wz, wy, slots, smoke: { x: sx, z: sz },
    dome: { x: cx, z: cz, R, moved: Math.round(S.dist), style: VI },
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
  BU.uWave.value = 0.32 * Math.sin(tt * 5.5) + 0.06;            // «машет» — правое крыло туда-сюда (поза wave)
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
  get stats () { return { domes: DOMES.length, tries: ST.tries, ms: Math.round(ST.ms), moved: DOMES.map(d => Math.round(d.dist)), own: DOMES.map(d => d.own), kind: DOMES.map(d => d.kind) }; },
};
