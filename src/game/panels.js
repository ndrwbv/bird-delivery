/* ──────────────────────────────────────────────────────────────────────────
   Фасады панелек (2г3, 25.10.2026; автор: «видно как дома сделаны из плит и эти плиты разного цвета и как видно стык
   этажей, но при этом не видно саму плиту конкретного блока»). Правила словами — docs/CAREER.md «Город: как выглядит» →
   «Фасады панелек».

   Было: стена одного цвета и поверх — светлая сетка швов (полосы FLATM, света не ловят — выглядело клетчатой бумагой).
   Стало (всё — правкой общего «Ламберта», как grit.js, без картинок):
     • стык этажей — тонкая тёмная горизонталь (12 см, на дальних — тише и шире, чтобы не рябило), под ней светлая кромка
       плиты и иногда подтёк;
     • плиты чуть разного тона: колонка плит — ±4 % в цвете вершин, каждая плита — ещё ±7 % в шейдере; у ~24 % плит —
       заплатка (прямоугольник светлее или серее, крупным пикселем 1/6 м);
     • вертикальные швы — едва заметные (−6 %, только вблизи);
     • подтёки: под подоконником (у половины плит), со стыка этажа, с крыши — по верхнему этажу и чердачной полосе;
     • выгоревшие пятна — крупные светлые; краска чуть глуше (−10 % насыщенности — бетон под ней);
     • цоколь — тёмная полоса снизу 0,8 м над землёй у самой стены (по склону — вдоль земли, не выше подоконников первого
       этажа), кирпично-красная, бурая или тёмно-серая, чуть выступает, сверху — светлый уступ;
     • парапет — край крыши чуть выступает, снизу тень.
   Где этажи и плиты, шейдер знает из вершин стены (своих вершин у дома столько же, сколько было бы швов-полос):
     • четвёртый байт цвета (1…127 — свободные значения признака склейки LITM, seasons.js) — этаж: у верхнего стыка 120
       (крайние куски стены — 56), вниз на этаж — на единицу меньше; между вершинами он плавно меняется, и дробная
       часть — высота над стыком. Чердачная полоса над верхним этажом — 126 → 125;
     • красный байт растёт на единицу поперёк плиты (слева r, справа r + 1): дробная часть — место поперёк плиты
       (в цвете это 1/255 — не видно).
   Стены дома — кусками block склейки LITM (вершины спереди клетки, со своим индексом): новых вызовов отрисовки нет.
   ?oldfacade (и общий ?oldlook) — по-старому: ровная стена и сетка швов. На телефоне — по-старому (память).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import './grit.js';                                 // правка «Ламберта» grit.js — до нашей (функции шума — её)
import { MOB } from './mobile.js';

const QS = typeof location !== 'undefined' ? location.search : '';
const QP = new URLSearchParams(QS);
export const OLDLOOK = QP.has('oldlook');
export const ON = !OLDLOOK && !QP.has('oldfacade') && !MOB.on;

export const PANEL = {
  FH: 3.15,                     // высота этажа, м (как в facade)
  CHUNK: 200,                   // клетка склейки LITM, м (game.js CHUNK — ставит game.js)
  TOP: 120, TOP_END: 56,        // признак у верхнего стыка: плиты с окнами / крайние куски
  ATTIC: [126, 125],            // чердачная полоса: снизу, сверху
  TONE: 0.04,                   // колонка плит: ±4 % в цвете вершин
  PLINTH: 0.8, PLINTH_OUT: 0.05,    // цоколь: PLINTH м над землёй у стены (в каждой точке), выступ
  PLINTH_DOWN: 0.4, PLINTH_STEP: 2, PLINTH_SILL: 0.15,   // в землю, шаг по контуру, м; верх — не выше подоконника 1-го этажа − SILL
  PARAPET: 0.38, PARAPET_OUT: 0.07, PARAPET_UP: 0.06,   // парапет: высота от верха стены вниз, выступ, над стеной
  PLINTH_HEX: ['#8a5a4b', '#7b5246', '#94634f', '#66615b', '#75706a', '#5a5651', '#7f6656'],   // кирпично-красный, бурый, тёмно-серый — приглушённые
};
export const STATS = { walls: 0, segs: 0, corners: 0, verts: 0, plinths: 0, parapets: 0 };

/* ── шейдер: после цвета вершин, до пятен и зерна grit.js ── */
const DECL = `
float pnH (vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
vec3 panelCol (vec3 c) {
#ifdef USE_COLOR_ALPHA
  float A = vColor.a * 255.0;
  if (A < 0.5 || A > 127.5) return c;
  const float FH = 3.15;
  float attic = step(124.5, A), endS = step(A, 60.5);
  float F = A - mix(120.0, 56.0, endS);                        // этажей от верхнего стыка (ниже — меньше нуля)
  float t = fract(vColor.r * 255.0 + 0.003);                   // поперёк плиты 0…1
  vec3 by = floor(vColor.rgb * 255.0 + vec3(0.0, 0.5, 0.5));   // байты колонки (красный — левый край)
  float fi = floor(F + 0.0005), fy = (F - fi) * FH;            // этаж, высота над его стыком, м
  float s = t * 3.0;                                           // поперёк плиты, м (плита с окном — 3 м)
  vec3 key = vec3(by.r * 1.37 + by.g * 0.113, by.b * 0.71 + fi * 3.17 + attic * 41.0, endS * 5.3 + 17.0);
  float h1 = pnH(key), h2 = pnH(key + 11.1), h3 = pnH(key + 23.7), h4 = pnH(key + 31.3);
  c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))), 0.1);       // краска по бетону — чуть глуше
  // тон плиты ±7 %, чуть теплее или холоднее
  c *= (1.0 + (h1 - 0.5) * 0.14) * mix(vec3(1.02, 1.0, 0.97), vec3(0.975, 0.995, 1.025), h2);
  // заплатка: прямоугольник крупным пикселем (1/6 м) светлее или серее
  float tq = (floor(s * 6.0) + 0.5) / 18.0, yq = (floor(fy * 6.0) + 0.5) / 6.0;
  if (attic < 0.5 && h3 < 0.24) {
    float x0 = 0.05 + h4 * 0.55, x1 = x0 + 0.18 + pnH(key + 41.9) * 0.3;
    float y0 = 0.2 + pnH(key + 47.3) * 1.5, y1 = y0 + 0.35 + pnH(key + 53.1) * 0.9;
    if (tq > x0 && tq < x1 && yq > y0 && yq < y1) c = h4 < 0.5 ? c * vec3(1.07, 1.06, 1.03) : mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))), 0.35) * 0.95;
  }
  float cq = floor(s * 6.0);                                   // столбик 1/6 м — для подтёков
  float hc = pnH(vec3(cq + by.r * 0.31, by.b + fi * 1.91, by.g + 3.0));
  float dark = 0.0;
  if (attic < 0.5) {
    // стык этажей: тонкая тёмная горизонталь; дальше — тише и шире (без ряби)
    float fw = max(fwidth(F) * FH, 1e-4), d = min(fy, FH - fy), lw = 0.06;
    dark += clamp((lw - d) / fw + 0.5, 0.0, 1.0) * min(1.0, 2.0 * lw / fw) * 0.42;
    // светлый край плиты под стыком (кромка смотрит вверх, на солнце)
    float dl = FH - fy - lw - 0.03;
    dark -= clamp((0.03 - abs(dl)) / fw + 0.5, 0.0, 1.0) * min(1.0, 0.06 / fw) * 0.07;
    // вертикальный шов — едва заметный, только вблизи
    float fws = max(fwidth(s), 1e-4), dv = min(s, 3.0 - s);
    dark += clamp((0.035 - dv) / fws + 0.5, 0.0, 1.0) * min(1.0, 0.07 / fws) * 0.06;
    // подтёк со стыка над плитой (вниз от верхнего края плиты)
    float bj = FH - fy, Lj = 0.15 + hc * hc * 1.1;
    if (hc > 0.55 && bj < Lj) dark += (1.0 - bj / Lj) * 0.12;
    // подтёки под подоконником (плиты с окном, у половины)
    if (endS < 0.5 && h2 > 0.45 && s > 0.85 && s < 2.15) {
      float bw = 0.9 - fy, Lw = (0.25 + hc * hc * 1.5) * step(0.3, hc);
      if (bw > 0.0 && bw < Lw) dark += (1.0 - bw / Lw) * (0.12 + h3 * 0.14);
    }
  }
  // с крыши: по чердачной полосе (≈ 1 м) и вниз по верхним этажам
  float dRoof = attic > 0.5 ? (A - 125.0) * 1.0 : 1.0 - F * FH;
  float hr = pnH(vec3(cq * 0.73 + by.r, by.b * 1.3 + 7.0, by.g + endS * 2.0));
  float Lr = 0.5 + hr * hr * hr * 5.0;
  if (hr > 0.3 && dRoof < Lr) dark += (1.0 - dRoof / Lr) * 0.2;
  if (attic > 0.5) dark += 0.05 + (1.0 - (A - 125.0)) * 0.06;  // под самым краем — темнее
  // у части столбиков подтёк ржавый
  c *= 1.0 - clamp(dark, -0.1, 0.5);
  c *= mix(vec3(1.0), vec3(1.0, 0.9, 0.78), step(0.86, hc) * min(dark * 3.0, 1.0));
  // выгоревшие пятна — крупные, светлее
  float bl = gN(vGritW * 0.21 + 5.0);
  c = mix(c, c * 1.07 + 0.012, smoothstep(0.62, 0.8, bl) * 0.8);
#endif
  return c;
}
`;

const L = THREE.ShaderLib.lambert;
if (ON && !L.fragmentShader.includes('panelCol')) {
  L.fragmentShader = L.fragmentShader.replace('void main() {', DECL + 'void main() {')
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = panelCol(diffuseColor.rgb);');
}

/* ── стены дома кусками с признаком (из osmBuildings) ── */
const hsh = (x, z, k) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
const CC = new THREE.Color();
function bytesOf (hex) { CC.set(hex); return [Math.round(CC.r * 255), Math.round(CC.g * 255), Math.round(CC.b * 255)]; }

/* стена дома: a — начало ребра контура, ux/uz — вдоль, len — длина ребра; s0…s1 — какой кусок ребра стоит (без мягких
   углов и проёма арки); y0 — низ стены, y1 — верх стены (под краем крыши), top — верхний стык (земля дома + этажи × FH);
   grid — { pad, step, cols } окон фасада (плиты — между окнами) или null; hex — цвет стен; low — у низа стены заводить
   признак с ближайшего стыка выше y0 (перемычка над аркой), иначе стена уходит вниз до стыка ниже y0 (под землю) */
export function wall (M, o) {
  const FH = PANEL.FH, { a, ux, uz, len, y1, top } = o;
  const s0 = Math.max(0, o.s0), s1 = Math.min(len, o.s1);
  if (s1 - s0 < 0.02) return;
  // по высоте: n этажей от верхнего стыка вниз
  let n = o.low ? Math.floor((top - o.y0) / FH + 1e-6) : Math.ceil((top - o.y0) / FH - 1e-6);
  n = Math.max(0, Math.min(n, 54));
  const yb = top - n * FH;
  // ниже первого стыка (перемычка арки; очень высокий склон) — простой стеной
  if (yb - o.y0 > 0.01) { M.color(o.hex); M.wall(a[0] + ux * s0, a[1] + uz * s0, a[0] + ux * s1, a[1] + uz * s1, o.y0, yb); }
  // поперёк: плиты между окнами, по краям — крайние куски
  const cuts = [];
  if (o.grid) {
    const { pad, step, cols } = o.grid;
    cuts.push([0, pad, 1]);
    for (let i = 0; i < cols; i++) cuts.push([pad + i * step, pad + (i + 1) * step, 0]);
    cuts.push([pad + cols * step, len, 1]);
  } else cuts.push([0, len, 1]);
  const segs = [];
  for (const [c0, c1, end] of cuts) {
    const p0 = Math.max(c0, s0), p1 = Math.min(c1, s1);
    if (p1 - p0 < 0.02) continue;
    const whole = p0 - c0 < 1e-4 && c1 - p1 < 1e-4;
    segs.push([p0, p1, end || !whole ? 1 : 0, (c0 + c1) / 2]);
  }
  if (!segs.length) return;
  const base = bytesOf(o.hex), hasN = n > 0, hasA = y1 - top > 0.02;
  const per = (hasN ? 4 : 0) + (hasA ? 4 : 0);
  const nv = segs.length * per, pos = new Float32Array(nv * 3), col = new Uint8Array(nv * 4);
  const idx = new (nv > 65535 ? Uint32Array : Uint16Array)(segs.length * per / 4 * 6);
  let v = 0, k = 0;
  const vert = (s, y, r, g, b, al) => {
    pos[v * 3] = a[0] + ux * s; pos[v * 3 + 1] = y; pos[v * 3 + 2] = a[1] + uz * s;
    col[v * 4] = r; col[v * 4 + 1] = g; col[v * 4 + 2] = b; col[v * 4 + 3] = al; v++;
  };
  const quad = (sA, sB, ya, yc, r, g, b, alA, alC) => {
    const i0 = v;
    vert(sA, ya, r, g, b, alA); vert(sB, ya, r + 1, g, b, alA); vert(sB, yc, r + 1, g, b, alC); vert(sA, yc, r, g, b, alC);
    idx[k++] = i0; idx[k++] = i0 + 1; idx[k++] = i0 + 2; idx[k++] = i0; idx[k++] = i0 + 2; idx[k++] = i0 + 3;
  };
  for (const [p0, p1, end, mid] of segs) {
    const kc = end ? 1 : 1 + (hsh(a[0] + ux * mid, a[1] + uz * mid, 3) - 0.5) * 2 * PANEL.TONE;
    const r = Math.min(254, Math.round(base[0] * kc)), g = Math.min(255, Math.round(base[1] * kc)), b = Math.min(255, Math.round(base[2] * kc));
    const A0 = end ? PANEL.TOP_END : PANEL.TOP;
    if (hasN) quad(p0, p1, yb, top, r, g, b, A0 - n, A0);
    if (hasA) quad(p0, p1, top, y1, r, g, b, PANEL.ATTIC[0], PANEL.ATTIC[1]);
    STATS.segs++;
  }
  STATS.walls++; STATS.verts += nv;
  // куском в клетку склейки своей середины (как раньше треугольники стены): длинная стена — несколькими кусками
  const CH = PANEL.CHUNK, cellOf = q => Math.floor((a[0] + ux * q) / CH) * 100003 + Math.floor((a[1] + uz * q) / CH);
  let g0 = 0;
  for (let i = 1; i <= segs.length; i++) {
    if (i < segs.length && cellOf(segs[i][3]) === cellOf(segs[g0][3])) continue;
    const v0 = g0 * per, v1 = i * per, sm = segs[g0][3];
    const P = pos.subarray(v0 * 3, v1 * 3), Cl = col.subarray(v0 * 4, v1 * 4);
    const I = new (v1 - v0 > 65535 ? Uint32Array : Uint16Array)((v1 - v0) / 4 * 6);
    for (let j = 0; j < I.length; j++) I[j] = idx[g0 * per / 4 * 6 + j] - v0;
    M.block(P, (C, at) => C.set(Cl, at), I, a[0] + ux * sm, a[1] + uz * sm);
    g0 = i;
  }
}

/* мягкие углы дома (softcity.js corners): каждый кусочек дуги — крайний кусок со стыками этажей */
export function corners (M, list, o) {
  if (!list) return;
  for (const c of list) if (c) for (let i = 1; i < c.arc.length; i++) {
    const p = c.arc[i - 1], q = c.arc[i], dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz);
    if (l < 0.005) continue;
    wall(M, { ...o, a: p, ux: dx / l, uz: dz / l, len: l, s0: 0, s1: l, grid: null });
    STATS.corners++;
  }
}

/* ── цоколь и парапет: полоса чуть снаружи стены (LITM, ловит свет), сверху / снизу — уступ ──
   w — стена фасада (a, ux/uz, ox/oz, len); from…to вдоль; soft — мягкие углы дома (у угла полоса идёт дугой) */
function ledgeRun (M, pts, y0, y1, out, cap, under) {
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i];
    if (!p || !q) continue;
    M.wall(p[0] + p[2] * out, p[1] + p[3] * out, q[0] + q[2] * out, q[1] + q[3] * out, y0, y1);
    if (cap) M.up(p[0], y1, p[1], q[0], y1, q[1], q[0] + q[2] * out, y1, q[1] + q[3] * out), M.up(p[0], y1, p[1], q[0] + q[2] * out, y1, q[1] + q[3] * out, p[0] + p[2] * out, y1, p[1] + p[3] * out);
    if (under) {
      const a = [p[0], y0, p[1]], b = [q[0], y0, q[1]], c = [q[0] + q[2] * out, y0, q[1] + q[3] * out], d = [p[0] + p[2] * out, y0, p[1] + p[3] * out];
      M.tri(...a, ...c, ...b); M.tri(...a, ...d, ...c);
    }
  }
}
/* контур дома снаружи: точки [x, z, наружу x, наружу z] по стенам и дугам углов (с замыканием) */
export function rim (p, ccw, soft, gap) {
  const n = p.length, pts = [];
  for (let i = 0; i < n; i++) {
    const a = p[i], c = p[(i + 1) % n], dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
    if (len < 0.05) continue;
    const ox = (ccw ? dz : -dz) / len, oz = (ccw ? -dx : dx) / len;
    const c0 = soft?.[i], c1 = soft?.[(i + 1) % n];
    if (c0) {
      const pr = p[(i + n - 1) % n], pdx = a[0] - pr[0], pdz = a[1] - pr[1], pl = Math.hypot(pdx, pdz) || 1;
      const pox = (ccw ? pdz : -pdz) / pl, poz = (ccw ? -pdx : pdx) / pl;
      c0.arc.forEach((q, j) => {
        const t = j / (c0.arc.length - 1), nx = pox * (1 - t) + ox * t, nz = poz * (1 - t) + oz * t, l = Math.hypot(nx, nz) || 1;
        pts.push([q[0], q[1], nx / l, nz / l]);
      });
    } else pts.push([a[0], a[1], ox, oz]);
    const g = gap && gap(i);                        // проём арки: полоса прерывается
    if (g) { pts.push([a[0] + dx / len * g[0], a[1] + dz / len * g[0], ox, oz], null, [a[0] + dx / len * g[1], a[1] + dz / len * g[1], ox, oz]); }
    const e = c1 ? c1.start : c;
    pts.push([e[0], e[1], ox, oz]);
  }
  if (pts.length) pts.push(pts[0]);
  return pts;
}
/* стыки контура — где у соседних точек разная нормаль, ставим одну точку с усреднённой (у острого угла — выступ в угол) */
function miter (pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const q = pts[i], prev = out[out.length - 1];
    if (!q) { out.push(null); continue; }
    if (prev && Math.abs(prev[0] - q[0]) < 1e-4 && Math.abs(prev[1] - q[1]) < 1e-4) {
      const nx = prev[2] + q[2], nz = prev[3] + q[3], l = nx * prev[2] + nz * prev[3];
      if (l > 0.2) { prev[2] = nx / l; prev[3] = nz / l; }   // биссектриса длиной 1/cos(половины угла): углы полосы сходятся
      continue;
    }
    out.push(q.slice());
  }
  const f = out[0], l = out[out.length - 1];       // замкнутый контур: у первой точки — та же нормаль, что у последней
  if (f && l && f !== l && Math.abs(f[0] - l[0]) < 1e-4 && Math.abs(f[1] - l[1]) < 1e-4) { f[2] = l[2]; f[3] = l[3]; }
  return out;
}
/* цоколь идёт по земле у самой стены (автор 25.10: «0,4—0,9 м над землёй у стены в каждой точке, не выше подоконников
   первого этажа»): контур режется через ~STEP м, в каждой точке верх — земля в 0,3 м от стены + PLINTH, но не выше
   cap (подоконник первого этажа − 0,15 м); низ — на PLINTH_DOWN ниже земли. Где земля выше cap (дом врезан в склон), верх
   прижат к cap, и цоколя почти не видно */
export function plinth (M, rimPts, groundH, cap, hex) {
  const P = PANEL, out = P.PLINTH_OUT, pts = miter(rimPts), R = [];
  for (let i = 0; i < pts.length; i++) {
    const q = pts[i], p = pts[i - 1];
    if (!q) { R.push(null); continue; }
    if (p) {
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]), m = Math.max(1, Math.ceil(L / P.PLINTH_STEP));
      for (let k = 1; k < m; k++) { const t = k / m; R.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t, p[3] + (q[3] - p[3]) * t]); }
    }
    R.push(q);
  }
  const Y = R.map(q => {
    if (!q) return null;
    const l = Math.hypot(q[2], q[3]) || 1, g = groundH(q[0] + q[2] / l * 0.3, q[1] + q[3] / l * 0.3);
    return [g - P.PLINTH_DOWN, Math.min(g + P.PLINTH, cap)];
  });
  M.color(hex);
  for (let i = 1; i < R.length; i++) {
    const p = R[i - 1], q = R[i];
    if (!p || !q) continue;
    const [a0, a1] = Y[i - 1], [b0, b1] = Y[i];
    const ax = p[0] + p[2] * out, az = p[1] + p[3] * out, bx = q[0] + q[2] * out, bz = q[1] + q[3] * out;
    M.tri(ax, a0, az, bx, b0, bz, bx, b1, bz); M.tri(ax, a0, az, bx, b1, bz, ax, a1, az);
    M.tri(p[0], a1, p[1], q[0], b1, q[1], bx, b1, bz); M.tri(p[0], a1, p[1], bx, b1, bz, ax, a1, az);   // уступ сверху
  }
  STATS.plinths++;
}
export function parapet (M, rimPts, y0, y1, hex) {
  M.color(hex);
  ledgeRun(M, miter(rimPts), y0, y1, PANEL.PARAPET_OUT, true, true);
  STATS.parapets++;
}
export const plinthHex = (x, z) => PANEL.PLINTH_HEX[Math.floor(hsh(x, z, 7) * PANEL.PLINTH_HEX.length) % PANEL.PLINTH_HEX.length];
if (typeof window !== 'undefined' && /[?&]debug/.test(QS)) window.__PANELS = STATS;   // отладка: сколько стен, кусков, вершин
