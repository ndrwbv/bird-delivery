/* ──────────────────────────────────────────────────────────────────────────
   Мягкие края — сглаживание краёв одним проходом по готовому кадру (FXAA 3.11, «качество»).
   Правила словами — docs/CAREER.md «Настройки графики» → «мягкие края»; замеры — docs/AGENTS.md «Мягкие края».

   Зачем, если есть MSAA ×4: MSAA гладит только края треугольников. Лесенка, которая осталась, — внутри
   краски: разметка, бордюры и швы плитки на газоне, рамы и шторы окон, вывески, края листвы и травы,
   тонкие столбы и провода вдали, блики. FXAA ищет в кадре резкие перепады яркости вдоль линии и
   подмешивает соседа по ту сторону края — на долю точки, пропорционально тому, где по длине «ступеньки»
   стоит точка. Ровное (стены, асфальт, небо) не трогает: перепад меньше порога — точка как есть,
   поэтому кадр не мылится, крупный пиксель остаётся крупным пикселем (растяжка на экран — та же, «pixelated»).
   Подмес по самой точке (subpix) — слабый, 0,35 (в оригинале 0,75): мелкие детали (буквы, окна вдали)
   не размываются.

   Как рисуется (dynres.js — там же «мыло»): кадр сцены готов на холсте → копия в текстуру → один
   треугольник на весь холст этой программой. Свои программы three.js не нужны и не пересобираются (своя
   цель отрисовки пересобрала бы все — рывок); программа собирается при загрузке. Текстура — та же, что
   у «мыла» (память не растёт). Пока «мыло» снизило разрешение — края сглаживаются на маленьком кадре,
   и он же растягивается.

   Настройка — gfx.js «мягкие края» (вкл / выкл, без перезапуска). ?fxaa=0 / ?fxaa=1 — на этот запуск.
   ────────────────────────────────────────────────────────────────────────── */

/* шаги поиска конца «ступеньки» вдоль края, в точках (12 выборок — как FXAA_QUALITY 12 у Лоттса) */
const STEPS = [1.0, 1.0, 1.0, 1.0, 1.0, 1.5, 2.0, 2.0, 2.0, 2.0, 4.0, 8.0];
export const SUBPIX = 0.35, EDGE_THR = 0.166, EDGE_MIN = 0.0833;

export const FS = `#version 300 es
precision highp float;
uniform sampler2D t;
uniform vec2 s, m, px;   // s — доля текстуры под кадром, m — край кадра в текстуре, px — размер точки текстуры
in vec2 v; out vec4 o;
const float SUBPIX = ${SUBPIX.toFixed(3)}, THR = ${EDGE_THR.toFixed(4)}, THR_MIN = ${EDGE_MIN.toFixed(4)};
vec3 T (vec2 u) { return texture(t, clamp(u, px * 0.5, m)).rgb; }
float L (vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float Lo (vec2 u, float x, float y) { return L(T(u + vec2(x, y) * px)); }
void main () {
  vec2 uv = v * s;
  vec3 cC = T(uv);
  float lC = L(cC);
  float lD = Lo(uv, 0.0, -1.0), lU = Lo(uv, 0.0, 1.0), lL = Lo(uv, -1.0, 0.0), lR = Lo(uv, 1.0, 0.0);
  float lMin = min(lC, min(min(lD, lU), min(lL, lR))), lMax = max(lC, max(max(lD, lU), max(lL, lR)));
  float rng = lMax - lMin;
  if (rng < max(THR_MIN, lMax * THR)) { o = vec4(cC, 1.0); return; }
  float lDL = Lo(uv, -1.0, -1.0), lUR = Lo(uv, 1.0, 1.0), lUL = Lo(uv, -1.0, 1.0), lDR = Lo(uv, 1.0, -1.0);
  float lDU = lD + lU, lLR = lL + lR;
  float lLc = lDL + lUL, lDc = lDL + lDR, lRc = lDR + lUR, lUc = lUR + lUL;
  float eH = abs(-2.0 * lL + lLc) + abs(-2.0 * lC + lDU) * 2.0 + abs(-2.0 * lR + lRc);
  float eV = abs(-2.0 * lU + lUc) + abs(-2.0 * lC + lLR) * 2.0 + abs(-2.0 * lD + lDc);
  bool hor = eH >= eV;
  float l1 = hor ? lD : lL, l2 = hor ? lU : lR;
  float g1 = l1 - lC, g2 = l2 - lC;
  bool steep1 = abs(g1) >= abs(g2);
  float gS = 0.25 * max(abs(g1), abs(g2));
  float st = hor ? px.y : px.x;
  float lAvgL;
  if (steep1) { st = -st; lAvgL = 0.5 * (l1 + lC); } else lAvgL = 0.5 * (l2 + lC);
  vec2 cu = uv;
  if (hor) cu.y += st * 0.5; else cu.x += st * 0.5;
  vec2 off = hor ? vec2(px.x, 0.0) : vec2(0.0, px.y);
  vec2 u1 = cu - off, u2 = cu + off;
  float e1 = L(T(u1)) - lAvgL, e2 = L(T(u2)) - lAvgL;
  bool r1 = abs(e1) >= gS, r2 = abs(e2) >= gS;
  if (!r1) u1 -= off;
  if (!r2) u2 += off;
${STEPS.slice(2).map(q => `  if (!(r1 && r2)) {
    if (!r1) e1 = L(T(u1)) - lAvgL;
    if (!r2) e2 = L(T(u2)) - lAvgL;
    r1 = abs(e1) >= gS; r2 = abs(e2) >= gS;
    if (!r1) u1 -= off * ${q.toFixed(1)};
    if (!r2) u2 += off * ${q.toFixed(1)};
  }`).join('\n')}
  float d1 = hor ? uv.x - u1.x : uv.y - u1.y, d2 = hor ? u2.x - uv.x : u2.y - uv.y;
  bool dir1 = d1 < d2;
  float dF = min(d1, d2), len = d1 + d2;
  float pOff = -dF / len + 0.5;
  bool cSm = lC < lAvgL;
  bool ok = ((dir1 ? e1 : e2) < 0.0) != cSm;
  float fOff = ok ? pOff : 0.0;
  float lAvg = (1.0 / 12.0) * (2.0 * (lDU + lLR) + lLc + lRc);
  float sp1 = clamp(abs(lAvg - lC) / rng, 0.0, 1.0);
  float sp2 = (-2.0 * sp1 + 3.0) * sp1 * sp1;
  fOff = max(fOff, sp2 * sp2 * SUBPIX);
  vec2 fu = uv;
  if (hor) fu.y += fOff * st; else fu.x += fOff * st;
  o = vec4(T(fu), 1.0);
}`;
