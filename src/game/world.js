/* ──────────────────────────────────────────────────────────────────────────
   Город вокруг курьера: то, что меняется от карьеры, и то, что просто делает
   улицы разнообразнее.

   Для обеих карт:
   • плитка тротуаров и дорожек (paveRoad / pavePath / paveMat): где-то
     брусчатка, где-то серая в крапинку, где-то гладкая, как раньше. Вид —
     по улице и району, всегда один и тот же. Узор рисует шейдер статики по
     мировым координатам, а вид узнаёт по «цвету-метке» вершины: ни текстур,
     ни лишних вызовов отрисовки;
   • аллеи в парках (build → alleys): прямые и плавные дорожки через парк
     (или настоящие дорожки из карты, если они в парке есть), вдоль них —
     лавочки друг напротив друга и фонари.

   Только в карьере (CAREER):
   • кучи мусора у жилых домов — у подъездов и в углах дворов, мешки и
     хлам. Чем больше донат «борьба с мусором», тем они меньше; на цели —
     нет совсем. Никто этого не объясняет. Кучи — склейка по клеткам, при
     смене доната пересобирается только она (trash*);
   • бандитские районы (ZN.gangZones): красные круги на радаре и карте;
     подъехал к клиенту в районе — могут подойти 3–4 гопника (днём 6 из 10, вечером всегда)
     в спортивках и потребовать мзду (gang*). Отказал — мнут машину,
     пока не уедешь. В детской версии без бит: «покачают» машину;
   • особняки (prepCity): дома в круге MAP.career.rich — коттеджи в 2–3
     этажа со скатной крышей, светлыми стенами, газоном, высоким забором
     (roadlife.js), воротами и дорогой машиной у дома;
   • шашлыки у гаражей (grill*): мангал, дым, 2–4 человека, раскладные
     стулья; чаще вечером и «на выходных».

   Переменных игры модуль не видит — всё приходит объектом api (worldApi в
   game.js). Кто вызывает: prepCity — до сборки города, build — в buildCity до
   деревьев и лавочек, step — каждый кадр, drawRadar / drawMap — радар и карта.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t } from '../i18n/index.js';
import { GANG, SHIFT, hourOf } from './econ.js';
import * as ZN from './zones.js';
import * as DLG from './dialog.js';
import * as SEAS from './seasons.js';
import { makePerson } from './people.js';

/* соседние модули карьеры — если уже есть: вечер (career.js), «подъехал к
   клиенту» (orders.js), «машина хуже заводится» (cars.js) */
const OPT = import.meta.glob(['./career.js', './orders.js', './cars.js'], { eager: true });
const MOD = k => OPT['./' + k + '.js'] || null;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const chance = p => Math.random() < p;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
/* жребий по месту: одно и то же место — всегда одинаково */
const hash = (x, z, k = 0) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
const strHash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; };
function rng (seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) | 0; let q = Math.imul(a ^ (a >>> 15), 1 | a); q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q; return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
}
const centroid = p => { let x = 0, z = 0; for (const q of p) { x += q[0] / p.length; z += q[1] / p.length; } return [x, z]; };
function areaOf (p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], c = p[(i + 1) % p.length]; s += a[0] * c[1] - c[0] * a[1]; } return Math.abs(s) / 2; }
function inPolyP (x, z, p) {
  let on = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0], zi = p[i][1], xj = p[j][0], zj = p[j][1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) on = !on;
  }
  return on;
}
function segD (x, z, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1, q = clamp(((x - x1) * dx + (z - z1) * dz) / l2, 0, 1);
  return Math.hypot(x - x1 - dx * q, z - z1 - dz * q);
}
/* прямоугольник наименьшей площади вокруг контура; u — вдоль длинной стороны */
function minRect (p) {
  let R = null;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], c = p[(i + 1) % p.length], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (l < 0.5) continue;
    const ux = (c[0] - a[0]) / l, uz = (c[1] - a[1]) / l;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const q of p) {
      const u = q[0] * ux + q[1] * uz, v = -q[0] * uz + q[1] * ux;
      if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    const area = (u1 - u0) * (v1 - v0);
    if (!R || area < R.area) R = { ux, uz, u0, u1, v0, v1, area };
  }
  if (R && R.u1 - R.u0 < R.v1 - R.v0) R = { ux: -R.uz, uz: R.ux, u0: R.v0, u1: R.v1, v0: -R.u1, v1: -R.u0, area: R.area };
  return R;
}
const rectPt = (R, u, v) => [u * R.ux - v * R.uz, u * R.uz + v * R.ux];
/* локальная точка модели (ry — как у three.js rotateY) → мир */
const rot = (x, z, ry, lx, lz) => [x + lx * Math.cos(ry) + lz * Math.sin(ry), z - lx * Math.sin(ry) + lz * Math.cos(ry)];

let A = null, CAREER = false, MAPR = null;
export const STATS = { alleys: 0, alleyBenches: 0, alleyLamps: 0, heaps: 0, trashK: -1, trashTris: 0, villas: 0, grillSpots: 0, grills: 0, gang: 0, ms: 0, buildMs: {} };

/* ═════════════════ плитка ═════════════════
   Цвет-метка: вершины брусчатки и крапчатой плитки красятся в свой точный
   цвет, шейдер статики (paveMat) узнаёт его и рисует узор по мировым x/z.
   Гладкая — прежний цвет, её шейдер не трогает. */
export const PAVE = { plain: '#e3ded4', brick: '#dbd1c4', speck: '#d5d3ce', path: '#ddd5c6' };
function paveKind (key, x, z, salt) {
  const d = hash(Math.floor(x / 420), Math.floor(z / 420), 3 + salt);   // район: где-то старый центр, где-то новостройки
  const h = key ? strHash(key + '#' + Math.floor(x / 420) + ',' + Math.floor(z / 420)) : hash(Math.round(x), Math.round(z), 5 + salt);
  const brickP = d < 0.3 ? 0.55 : d < 0.65 ? 0.22 : 0.1, speckP = d < 0.3 ? 0.15 : d < 0.65 ? 0.3 : 0.42;
  return h < brickP ? 'brick' : h < brickP + speckP ? 'speck' : 'plain';
}
/* тротуар улицы — по имени улицы и району: вся улица в районе одинаковая */
export function paveRoad (r) {
  const p = r.p[(r.p.length / 2) | 0] || r.p[0];
  return PAVE[paveKind(r.n || '', p[0], p[1], 0)];
}
export function pavePath (q) {
  const k = paveKind('', q[0][0], q[0][1], 1);
  return k === 'plain' ? PAVE.path : PAVE[k];
}
const CB = new THREE.Color();
const lin = hex => { CB.set(hex); return new THREE.Vector3(Math.round(CB.r * 255) / 255, Math.round(CB.g * 255) / 255, Math.round(CB.b * 255) / 255); };
/* Узор — по мировым x/z, без юниформ на меш: заморозка матриц и отсечение
   (cull.js) его не трогают. Сглаживание — по размеру клетки в пикселях по
   каждой оси отдельно (fwidth в клетках, а не в метрах): в 540p и под острым
   углом к тротуару вдоль дороги брусок всё равно больше пикселя на десятки
   метров вперёд. Шов сглаживается по ширине пикселя, а цвет брусков уходит в
   средний тон, только когда брусок меньше пикселя — далеко и плавно. */
const PAVE_GLSL = `
{
  vec3 pvc = vColor.rgb;
  vec3 pdB = abs(pvc - uPvB), pdS = abs(pvc - uPvS);
  float isB = step(max(pdB.r, max(pdB.g, pdB.b)), 0.0022), isS = step(max(pdS.r, max(pdS.g, pdS.b)), 0.0022);
  if (isB + isS > 0.5) {
    vec2 q = vSW.xz;
    if (isB > 0.5) {
      // брусчатка: брусок 40×20 см, перевязка через ряд, швы темнее, часть брусков красная
      vec2 b0 = q * vec2(2.5, 5.0);
      vec2 dB = fwidth(b0);                        // клеток на пиксель — до сдвига рядов, без скачков на стыках
      float row = floor(b0.y);
      vec2 b = vec2(b0.x + fract(row * 0.5), b0.y);
      vec2 id = floor(b), f = fract(b);
      vec2 ed = min(f, 1.0 - f);                   // до шва, в долях клетки
      vec2 sw = vec2(0.03, 0.06);                  // полушов: ~1,2 см
      vec2 sc = 1.0 - smoothstep(sw - dB * 0.5, sw + dB * 0.5 + 1e-4, ed);
      float seamAA = max(sc.x, sc.y), seamAvg = 2.0 * (sw.x + sw.y);
      float big = max(dB.x, dB.y);
      float seam = mix(seamAA, seamAvg, smoothstep(0.35, 0.8, big));
      float h = sHash(id), h2 = sHash(id + 17.3);
      vec3 tone = h < 0.1 ? vec3(0.42, 0.22, 0.17) : h < 0.26 ? vec3(0.44, 0.42, 0.4) : vec3(0.6, 0.57, 0.52);
      tone *= 0.88 + 0.24 * h2;
      vec3 avg = vec3(0.555, 0.51, 0.47);
      tone = mix(tone, avg, smoothstep(0.6, 1.6, big));
      diffuseColor.rgb = mix(tone, vec3(0.3, 0.29, 0.28), seam) * (0.96 + 0.08 * sNoise(q * 0.45));
    } else {
      // серая плитка в крапинку: крапины гаснут, когда меньше пикселя; пятна крупнее — видно всегда
      vec2 c0 = q * 11.0;
      float big = max(fwidth(c0).x, fwidth(c0).y);
      float h = sHash(floor(c0));
      vec3 base = vec3(0.6, 0.6, 0.58) * (0.94 + 0.12 * sNoise(q * 0.7));
      float sp = -0.3 * step(0.86, h) + 0.13 * step(h, 0.07);
      diffuseColor.rgb = base * (1.0 + sp * (1.0 - smoothstep(0.5, 1.4, big)));
    }
  }
}`;
/* материал статики (LITM): поверх сезонного — узор плитки. Сезонный шейдер
   уже объявил vSW, sHash и sNoise (seasons.js TINT) — ими и пользуемся;
   узор кладётся до снега и луж */
export function paveMat (m) {
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
  const uPvB = { value: lin(PAVE.brick) }, uPvS = { value: lin(PAVE.speck) };
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    if (!/sHash/.test(sh.fragmentShader) || !/vSW/.test(sh.fragmentShader)) return;     // без сезонного шейдера — как было
    sh.uniforms.uPvB = uPvB; sh.uniforms.uPvS = uPvS;
    sh.fragmentShader = 'uniform vec3 uPvB, uPvS;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + PAVE_GLSL);
  };
  m.customProgramCacheKey = () => key + 'pave';
  return m;
}

/* ═════════════════ до сборки города: особняки ═════════════════
   Дома в круге MAP.career.rich становятся коттеджами: большой контур
   (панелька, цех) режется на отдельные дома по 12–17 м с просветами, у
   каждого 2–3 этажа, вальмовая или двускатная крыша, светлые стены. Адрес
   первого — прежний, у остальных — корпуса. Подъезды, вывески и деревья из
   карты, которые стояли на месте старого контура, убираем. */
const VILLA_WALL = ['#f4efe6', '#efe6d6', '#ebe6de', '#f3e8da', '#e7ece8', '#f1e3d2', '#f6f1e8'];
const VILLA_ROOF = ['#5a3a32', '#3f4750', '#6b3f2f', '#4a4f45', '#2f3338', '#7a4a36'];
const VILLAS = [];
export function prepCity (CITY, MAP, career) {
  CAREER = !!career;
  MAPR = (MAP && MAP.career) || null;
  if (!CAREER || !MAPR || !MAPR.rich) return;
  const R = MAPR.rich, out = [], gone = [];
  for (const b of CITY.buildings) {
    const [cx, cz] = centroid(b.p);
    if (Math.hypot(cx - R.x, cz - R.z) > R.r || b.k === 'gar' || (b.k === 'pub' && b.n) || b.k === 'church' || b.k === 'mall') { out.push(b); continue; }
    const Rc = minRect(b.p);
    if (!Rc) { out.push(b); continue; }
    const L = Rc.u1 - Rc.u0, D = Rc.v1 - Rc.v0, vm = (Rc.v0 + Rc.v1) / 2;
    gone.push(b.p);
    const r = rng(Math.round(cx * 31 + cz * 17));
    const dep = clamp(D, 7, 11 + r() * 3);
    const n = L <= 22 ? 1 : Math.max(1, Math.floor((L + 12) / (14 + 12)));
    const cell = L / n;
    for (let i = 0; i < n; i++) {
      const len = n === 1 ? clamp(L, 8, 18) : clamp(cell - 11, 9, 17), um = Rc.u0 + cell * (i + 0.5) + (n > 1 ? (r() - 0.5) * 3 : 0);
      const dv = n > 1 ? (r() - 0.5) * Math.max(0, D - dep) : 0;
      const p = [rectPt(Rc, um - len / 2, vm + dv - dep / 2), rectPt(Rc, um + len / 2, vm + dv - dep / 2), rectPt(Rc, um + len / 2, vm + dv + dep / 2), rectPt(Rc, um - len / 2, vm + dv + dep / 2)]
        .map(q => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]);
      const v = Object.assign({}, b, {
        p, k: 'res', st: 'villa', lv: r() < 0.55 ? 2 : 3, roof: r() < 0.6 ? 'h' : 'g',
        col: VILLA_WALL[(r() * VILLA_WALL.length) | 0], rc: VILLA_ROOF[(r() * VILLA_ROOF.length) | 0], rich: 1, n: undefined, style: undefined,
        a: b.a ? (i ? [b.a[0], b.a[1] + ' к' + (i + 1)] : b.a) : undefined, id: b.id !== undefined ? b.id + (i ? '-' + i : '') : undefined,
      });
      out.push(v); VILLAS.push(v);
    }
  }
  if (!gone.length) return;
  CITY.buildings.length = 0;
  for (const b of out) CITY.buildings.push(b);
  // на месте старых стен ничего не висит: подъезды, вывески, деревья и лавочки из карты
  const nearOld = (x, z) => gone.some(p => inPolyP(x, z, p) || p.some((a, i) => { const c = p[(i + 1) % p.length]; return segD(x, z, a[0], a[1], c[0], c[1]) < 2; }));
  const inVilla = (x, z, m) => VILLAS.some(v => inPolyP(x, z, v.p) || (m && v.p.some((a, i) => { const c = v.p[(i + 1) % v.p.length]; return segD(x, z, a[0], a[1], c[0], c[1]) < m; })));
  const keep = (list, xy, m) => { if (!list) return; let w = 0; for (const e of list) { const [x, z] = xy(e); if (!(Math.hypot(x - R.x, z - R.z) < R.r + 30 && (nearOld(x, z) || inVilla(x, z, m)))) list[w++] = e; } list.length = w; };
  keep(CITY.entrances, e => [e[0], e[1]], 0);
  keep(CITY.pois, e => e.p, 0);
  keep(CITY.trees, e => (Array.isArray(e[0]) ? e[0] : e), 1.2);
  keep(CITY.benches, e => (Array.isArray(e[0]) ? e[0] : e.p || e), 1.2);
  STATS.villas = VILLAS.length;
}

/* ═════════════════ аллеи в парках ═════════════════ */
const ALLEYS = [];                  // { pts: [[x, z]…], w }
const AL_C = 16, AL_GRID = new Map();
function alleyIndex (x1, z1, x2, z2, w) {
  const s = [x1, z1, x2, z2, w];
  for (let a = Math.floor((Math.min(x1, x2) - w) / AL_C); a <= Math.floor((Math.max(x1, x2) + w) / AL_C); a++)
    for (let b = Math.floor((Math.min(z1, z2) - w) / AL_C); b <= Math.floor((Math.max(z1, z2) + w) / AL_C); b++) {
      const k = a + ',' + b;
      if (!AL_GRID.has(k)) AL_GRID.set(k, []);
      AL_GRID.get(k).push(s);
    }
}
/* на аллее ли точка: деревья и случайные лавочки парка туда не ставим (game.js) */
export function onAlley (x, z, m = 1.2) {
  if (!AL_GRID.size) return false;
  for (const [x1, z1, x2, z2, w] of AL_GRID.get(Math.floor(x / AL_C) + ',' + Math.floor(z / AL_C)) || []) if (segD(x, z, x1, z1, x2, z2) < w / 2 + m) return true;
  return false;
}
function roadClear (x, z, m) {
  const r = A.nearestRoad(x, z, 7, 1);
  if (!r) return true;
  if (r.seg.c >= 7) return r.d > r.seg.w / 2 + 0.3;          // дорожку аллея может пересечь, но не лечь на неё
  return r.d > r.seg.w / 2 + m + (r.seg.c <= 5 ? 2.8 : 0.6);
}
function planAlleys () {
  const C = A.CITY;
  for (const g of C.green) {
    if (g.k !== 'park' || ALLEYS.length > 160) continue;
    const P = g.p, area = areaOf(P);
    if (area < 2500) continue;                                  // в Москве парки — скверы по полгектара
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of P) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1]; }
    if (!A.inBounds((x0 + x1) / 2, (z0 + z1) / 2, 30)) continue;
    const inside = (x, z, m) => x > x0 && x < x1 && z > z0 && z < z1 && inPolyP(x, z, P) && (!m || (inPolyP(x + m, z, P) && inPolyP(x - m, z, P) && inPolyP(x, z + m, P) && inPolyP(x, z - m, P)));
    // настоящие дорожки из карты в этом парке — вдоль них и лавочки
    const own = [];
    let L = 0;
    for (const q of C.paths || []) {
      if (q.length < 2) continue;
      let n = 0;
      for (const pt of q) if (inside(pt[0], pt[1], 0)) n++;
      if (n < q.length * 0.7) continue;
      own.push(q);
      for (let i = 1; i < q.length; i++) L += Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]);
    }
    const seed = Math.round(x0 * 7 + z0 * 13);
    if (L > Math.min(90, Math.sqrt(area) * 0.9)) { for (const q of own) ALLEYS.push({ pts: q, w: 2.0, own: 1, seed: seed + ALLEYS.length }); continue; }
    // своих нет — через парк по длинной оси, иногда плавной змейкой; в большом — и поперёк
    const R = minRect(P);
    if (!R) continue;
    const r = rng(seed);
    const axes = [[R.u0, R.u1, (R.v0 + R.v1) / 2 + (r() - 0.5) * (R.v1 - R.v0) * 0.2, false]];
    if (area > 20000 && R.v1 - R.v0 > 70) axes.push([R.v0, R.v1, (R.u0 + R.u1) / 2 + (r() - 0.5) * (R.u1 - R.u0) * 0.3, true]);
    for (const [a0, a1, mid, cross] of axes) {
      const curvy = r() < 0.5, amp = curvy ? 3 + r() * 5 : 0, wl = 45 + r() * 50, ph = r() * 6;
      let run = [];
      const flush = () => { if (run.length >= 10) ALLEYS.push({ pts: run, w: 3.2, own: 0, seed: seed + ALLEYS.length }); run = []; };
      for (let a = a0 + 5; a <= a1 - 5; a += 2.5) {
        const off = mid + Math.sin(a / wl * Math.PI * 2 + ph) * amp;
        const [x, z] = cross ? rectPt(R, off, a) : rectPt(R, a, off);
        const ok = inside(x, z, 3) && !A.inHouse(x, z, 3) && roadClear(x, z, 2) && A.groundH(x, z) > 0.3;
        if (ok) run.push([x, z]); else flush();
      }
      flush();
    }
  }
  for (const al of ALLEYS) for (let i = 1; i < al.pts.length; i++) alleyIndex(al.pts[i - 1][0], al.pts[i - 1][1], al.pts[i][0], al.pts[i][1], al.w);
  STATS.alleys = ALLEYS.length;
}

/* лавочка из склейки мелочи: сбивается, как урна или куст */
function benchGeo (x, z, ry) {
  const gy = A.groundH(x, z), parts = [];
  const at = (lx, lz) => rot(x, z, ry, lx, lz);
  let [px, pz] = at(0, 0); A.box(parts, 2.4, 0.16, 0.62, '#8a6b4e', px, gy + 0.6, pz, ry);
  [px, pz] = at(0, -0.27); A.box(parts, 2.4, 0.5, 0.12, '#8a6b4e', px, gy + 0.98, pz, ry);
  for (const s of [-1, 1]) { [px, pz] = at(s * 1.05, -0.05); A.box(parts, 0.14, 0.85, 0.66, '#3b3f46', px, gy + 0.2, pz, ry); }
  return parts;
}
function drawAlleys () {
  const LITM = A.LITM;
  let benches = 0, lamps = 0;
  const benchAt = [];
  for (const al of ALLEYS) {
    const pts = al.pts, W = al.w, r = rng(al.seed * 7 + 3);
    if (!al.own) {
      const k = r();
      LITM.color(k < 0.55 ? PAVE.brick : k < 0.8 ? PAVE.speck : PAVE.path);
      for (let i = 1; i < pts.length; i++) {
        LITM.ribbon(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], W, 0.075);
        if (i < pts.length - 1) LITM.disc(pts[i][0], pts[i][1], W / 2, 0.075, 7);
      }
    }
    // вдоль аллеи: пары лавочек лицом друг к другу, фонари через один промежуток
    let acc = 0, nextB = 6 + r() * 6, nextL = 3 + r() * 5, side = 1, nb = 0, nl = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len, nx = -uz, nz = ux;
      for (let d = 0; d < len; d += 0.5) {
        acc += 0.5;
        const x = ax + ux * d, z = az + uz * d;
        if (acc >= nextB && benches < 360 && nb < 8) {
          nb++;
          nextB = acc + 16 + r() * 8;
          for (const s of [-1, 1]) {
            const o = W / 2 + 0.75, bx2 = x + nx * o * s, bz2 = z + nz * o * s;
            if (A.inHouse(bx2, bz2, 1.4) || !roadClear(bx2, bz2, 0.6) || A.groundH(bx2, bz2) < 0.3) continue;
            if (onAlley(bx2, bz2, 0.35) || nearPath(bx2, bz2, 1.45)) continue;          // не на соседней дорожке
            if (benchAt.some(q => Math.abs(q[0] - bx2) < 2.5 && Math.abs(q[1] - bz2) < 2.5)) continue;
            const ry = Math.atan2(-nx * s, -nz * s);                 // лицом к аллее, то есть друг к другу
            A.smashAdd('bench', bx2, bz2, 1.5, benchGeo(bx2, bz2, ry), '#8a6b4e');
            const it = A.SMASH[A.SMASH.length - 1];
            if (A.BENCHES) A.BENCHES.push({ x: bx2, z: bz2, y: A.groundH(bx2, bz2), ry, prop: it });
            benchAt.push([bx2, bz2]);
            benches++;
          }
        }
        if (acc >= nextL && lamps < 320 && nl < 9) {
          nl++;
          nextL = acc + 22 + r() * 8;
          side = -side;
          const o = W / 2 + 1.1, lx = x + nx * o * side, lz = z + nz * o * side;
          if (A.inHouse(lx, lz, 1) || !roadClear(lx, lz, 0.5) || benchAt.some(q => Math.abs(q[0] - lx) < 1.8 && Math.abs(q[1] - lz) < 1.8)) continue;
          if (onAlley(lx, lz, 0.4) || nearPath(lx, lz, 1.4)) continue;
          const gy = A.groundH(lx, lz);
          A.box(A.LIT, 0.34, 0.5, 0.34, '#2f3338', lx, gy + 0.2, lz);
          A.box(A.LIT, 0.14, 3.9, 0.14, '#3b3f46', lx, gy + 2.2, lz);
          A.box(A.LIT, 0.5, 0.12, 0.5, '#2f3338', lx, gy + 4.2, lz);
          A.put(A.LAMPH, new THREE.IcosahedronGeometry(0.3, 0), '#fff3c4', lx, gy + 4.5, lz);
          A.LAMP_SPOTS.push([lx, lz]);
          lamps++;
        }
      }
    }
  }
  STATS.alleyBenches = benches; STATS.alleyLamps = lamps;
}

/* ═════════════════ газоны у особняков ═════════════════ */
const LUX_SPOTS = [];
function richLawns () {
  const C = A.CITY;
  for (const v of VILLAS) {
    const R = minRect(v.p);
    if (!R) continue;
    const bad = (x, z) => !roadClear(x, z, 0.4) || C.buildings.some(b => b !== v && b.rich && inPolyP(x, z, b.p)) || A.inHouse(x, z, 0) && !inPolyP(x, z, v.p);
    // отступ каждой стороны: самый широкий, при котором край газона ничего не задевает
    const m = [0, 0, 0, 0];
    for (let sd = 0; sd < 4; sd++) {
      for (const mm of [7, 5.5, 4, 2.5, 1.2]) {
        let ok = true;
        for (let q = 0; q <= 1.001 && ok; q += 0.25) {
          const u = sd === 0 ? R.u0 - mm : sd === 1 ? R.u1 + mm : R.u0 - 1 + (R.u1 - R.u0 + 2) * q;
          const w = sd === 2 ? R.v0 - mm : sd === 3 ? R.v1 + mm : R.v0 - 1 + (R.v1 - R.v0 + 2) * q;
          const [x, z] = rectPt(R, u, w);
          if (bad(x, z)) ok = false;
        }
        if (ok) { m[sd] = mm; break; }
      }
    }
    const U0 = R.u0 - m[0], U1 = R.u1 + m[1], V0 = R.v0 - m[2], V1 = R.v1 + m[3];
    A.LITM.color(hash(U0, V0, 2) < 0.5 ? '#86c867' : '#7fc160');
    A.LITM.poly([rectPt(R, U0, V0), rectPt(R, U1, V0), rectPt(R, U1, V1), rectPt(R, U0, V1)], 0.035);
    // пара деревьев на газоне — по углам, подальше от дома
    const r = rng(Math.round(U0 * 11 + V0 * 7));
    for (let k = 0; k < 3; k++) {
      const sd = (r() * 4) | 0, mm = m[sd];
      if (mm < 3.5) continue;
      const q = r(), off = mm * 0.55;
      const u = sd === 0 ? R.u0 - off : sd === 1 ? R.u1 + off : R.u0 + (R.u1 - R.u0) * q;
      const w = sd === 2 ? R.v0 - off : sd === 3 ? R.v1 + off : R.v0 + (R.v1 - R.v0) * q;
      const [x, z] = rectPt(R, u, w);
      if (A.tree && !bad(x, z)) A.tree(x, z);
    }
    // дорогая машина — на самой широкой стороне, вдоль стены
    let best = -1, bm = 0;
    for (let sd = 0; sd < 4; sd++) if (m[sd] > bm) { bm = m[sd]; best = sd; }
    if (best >= 0 && bm >= 4 && LUX_SPOTS.length < 36 && r() < 0.8) {
      const off = 2.2;
      const along = best < 2, u = best === 0 ? R.u0 - off : best === 1 ? R.u1 + off : (R.u0 + R.u1) / 2 + (r() - 0.5) * 3;
      const w = best === 2 ? R.v0 - off : best === 3 ? R.v1 + off : (R.v0 + R.v1) / 2 + (r() - 0.5) * 2;
      const [x, z] = rectPt(R, u, w);
      // вдоль стены: у торца (u) машина смотрит по v, у длинной стороны — по u
      const ry = along ? Math.atan2(-R.uz, R.ux) : Math.atan2(R.ux, R.uz);
      LUX_SPOTS.push([x, z, ry + (r() < 0.5 ? Math.PI : 0)]);
    }
  }
}

/* ворота и дорогие машины — когда заборы (roadlife.js) и парковки уже стоят */
function richLate () {
  const fa = A.fenceAt || [];
  const parts = [];
  for (const f of fa) {
    const [cx, cz, , gx, gz] = f;
    const v = VILLAS.find(q => { const c = centroid(q.p); return Math.abs(c[0] - cx) < 1.5 && Math.abs(c[1] - cz) < 1.5; });
    if (!v) continue;
    const dx = gx - cx, dz = gz - cz, l = Math.hypot(dx, dz) || 1, tx = -dz / l, tz = dx / l, ry = Math.atan2(tx, tz);
    for (const s of [-1, 1]) {
      const px = gx + tx * 2.75 * s, pz = gz + tz * 2.75 * s, gy = A.groundH(px, pz);
      A.box(parts, 0.55, 2.7, 0.55, '#a8503c', px, gy + 1.3, pz, ry);
      A.box(parts, 0.7, 0.14, 0.7, '#e6dfd2', px, gy + 2.72, pz, ry);
      // створка ворот распахнута внутрь двора
      const ox = -dx / l, oz = -dz / l, lx = px - tx * s * 0.3 + ox * 1.0, lz = pz - tz * s * 0.3 + oz * 1.0;
      A.box(parts, 0.06, 2.0, 2.3, '#1b1c20', lx, A.groundH(lx, lz) + 1.05, lz, ry + 0.35 * s);
    }
  }
  if (parts.length) {
    const m = new THREE.Mesh(A.mergeGeos(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    m.geometry.computeBoundingSphere();
    A.scene.add(m);
  }
  const HEX = ['#101216', '#101216', '#f4f4f2', '#1c2a44', '#6b6f76', '#2a1d1d'];
  for (const [x, z, ry] of LUX_SPOTS) {
    if (A.TRAFFIC.some(q => Math.abs(q.x - x) < 5 && Math.abs(q.z - z) < 5)) continue;
    const base = A.newCar(true);
    const old = base.mesh;
    old.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    const model = pick(['suv', 'suv', 'sedan']);
    const mesh = A.makeCarLite(pick(HEX), model);
    const car = Object.assign(base, { mesh, model, hl: mesh.userData.hl, x, z, h: ry, lux: 1 });
    A.poseOnSlope(car);
    A.scene.add(mesh);
    A.TRAFFIC.push(car);
  }
}

/* ═════════════════ мусор ═════════════════ */
const HEAPS = [];
const TRASH = { grp: null, mats: null, k: -1, checkT: 0, chunks: [] };
const BAG_HEX = ['#222227', '#222227', '#26262c', '#2d3a2b', '#35507e', '#d6d4cc', '#5a5550', '#1d1f24'];
function trashSpotOk (x, z, R, lots) {
  if (!A.inBounds(x, z, 20) || A.groundH(x, z) < 0.3) return false;
  if (A.inHouse(x, z, R + 0.6)) return false;
  for (const [dx, dz] of [[R, 0], [-R, 0], [0, R], [0, -R]]) if (A.inHouse(x + dx, z + dz, 0.4)) return false;
  const r = A.nearestRoad(x, z, 7, 1);
  if (r && r.d < r.seg.w / 2 + R + (r.seg.c <= 5 ? 3.4 : r.seg.c >= 7 ? 1.0 : 1.3)) return false;
  if (nearPath(x, z, R + 1.3) || onAlley(x, z, R + 1)) return false;
  for (const l of lots) if (x > l.x0 - R && x < l.x1 + R && z > l.z0 - R && z < l.z1 + R && inPolyP(x, z, l.p)) return false;
  const P = A.PIZZA;
  if (P && Math.hypot(P.x - x, P.z - z) < 70) return false;
  if (MAPR && MAPR.rich && Math.hypot(MAPR.rich.x - x, MAPR.rich.z - z) < MAPR.rich.r + 20) return false;
  if (MAPR && MAPR.garage && Math.hypot(MAPR.garage.x - x, MAPR.garage.z - z) < 40) return false;
  return !HEAPS.some(h => Math.abs(h.x - x) < 22 && Math.abs(h.z - z) < 22);
}
/* дорожки по клеткам: мусор на них не ляжет */
const PG = new Map(), PGC = 16;
function pathGrid () {
  if (PG.size) return;
  for (const p of A.CITY.paths || [])
    for (let i = 1; i < p.length; i++) {
      const [x1, z1] = p[i - 1], [x2, z2] = p[i];
      for (let a = Math.floor(Math.min(x1, x2) / PGC); a <= Math.floor(Math.max(x1, x2) / PGC); a++)
        for (let b = Math.floor(Math.min(z1, z2) / PGC); b <= Math.floor(Math.max(z1, z2) / PGC); b++) {
          const k = a + ',' + b;
          if (!PG.has(k)) PG.set(k, []);
          PG.get(k).push([x1, z1, x2, z2]);
        }
    }
}
function nearPath (x, z, r) {
  for (const [x1, z1, x2, z2] of PG.get(Math.floor(x / PGC) + ',' + Math.floor(z / PGC)) || []) if (segD(x, z, x1, z1, x2, z2) < r) return true;
  return false;
}
function planTrash () {
  const C = A.CITY;
  pathGrid();
  // куда нельзя: парковки, площадки, футбольные коробки
  const lots = [];
  const addLot = p => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const q of p) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1]; } lots.push({ p, x0, x1, z0, z1 }); };
  for (const l of C.lots || []) if (l.k === 'park') addLot(l.p);
  for (const g of C.green || []) if (g.k === 'play' || g.k === 'pitch') addLot(g.p);
  const ents = (C.entrances || []).concat(A.GEN_ENTR || []);
  const EG = new Map();
  for (const e of ents) { const k = Math.floor(e[0] / 40) + ',' + Math.floor(e[1] / 40); if (!EG.has(k)) EG.set(k, []); EG.get(k).push(e); }
  const cands = [];
  for (const b of C.buildings) {
    if (b.rich || (b.k !== 'res' && b.k !== 'priv')) continue;
    const [cx, cz] = centroid(b.p);
    const h = hash(cx, cz, 21);
    if (h > 0.34) continue;
    cands.push({ b, cx, cz, h });
  }
  cands.sort((p, q) => p.h - q.h);
  for (const c of cands) {
    if (HEAPS.length >= 96) break;
    const { b, cx, cz } = c, r = rng(Math.round(cx * 13 + cz * 29));
    const R = 1.3 + r() * 1.3;
    const spots = [];
    // у подъезда: сбоку от двери, чуть во двор
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of b.p) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1]; }
    for (const e of EG.get(Math.floor(cx / 40) + ',' + Math.floor(cz / 40)) || []) {
      if (e[0] < x0 - 3 || e[0] > x1 + 3 || e[1] < z0 - 3 || e[1] > z1 + 3) continue;
      const [ex, ez, nx, nz] = e, tx = nz, tz = -nx, s = r() < 0.5 ? 1 : -1;
      spots.push([ex + nx * (R + 2.4) + tx * s * (5 + r() * 2.5), ez + nz * (R + 2.4) + tz * s * (5 + r() * 2.5)]);
    }
    // угол двора: наружу от угла, со стороны, дальней от улицы
    const p = b.p;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length], v = p[i], n2 = p[(i + 1) % p.length];
      let ox = (v[0] - cx), oz = (v[1] - cz);
      const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
      const x = v[0] + ox * (R + 2.2), z = v[1] + oz * (R + 2.2);
      const road = A.nearestRoad(x, z, 5, 1);
      if (road && road.d < 16) continue;
      if (Math.hypot(n2[0] - a[0], n2[1] - a[1]) < 4) continue;
      spots.push([x, z]);
    }
    for (let k = spots.length - 1; k > 0; k--) { const j = (r() * (k + 1)) | 0; [spots[k], spots[j]] = [spots[j], spots[k]]; }
    for (const [x, z] of spots) {
      if (!trashSpotOk(x, z, R, lots)) continue;
      HEAPS.push(makeHeap(x, z, R, r));
      break;
    }
  }
  STATS.heaps = HEAPS.length;
}
/* куча: мешки горкой, сверху и по краям — хлам. У каждой вещи ранг: при
   донате остаются только те, у кого он меньше доли «сколько ещё грязно» */
function makeHeap (x, z, R, r) {
  const H = 0.9 + r() * 0.6 + R * 0.35, items = [];
  // тело кучи — тёмный бугор, мешки облепляют его сверху
  items.push({ k: 'core', x: 0, z: 0, y: 0, s: 1, sx: R * 0.86, sy: H * 0.78, sz: R * (0.7 + r() * 0.2), ry: r() * 6.3, rank: 0 });
  const nb = Math.round(R * R * 8 + 6);
  for (let i = 0; i < nb; i++) {
    const an = r() * Math.PI * 2, d = Math.pow(r(), 0.6) * R * 0.95, k = d / R;
    const s = 0.3 + r() * 0.26;
    items.push({ k: 'bag', x: Math.cos(an) * d, z: Math.sin(an) * d, y: Math.max(0, H * 0.82 * Math.sqrt(Math.max(0, 1 - k * k))) * (0.75 + r() * 0.25) + s * 0.3, s, ry: r() * 6.3, rx: (r() - 0.5) * 0.8, hex: BAG_HEX[(r() * BAG_HEX.length) | 0], rank: r() });
  }
  // разлетевшиеся мешки вокруг
  for (let i = 0; i < 2 + r() * 3; i++) {
    const an = r() * Math.PI * 2, d = R * (1.1 + r() * 0.6);
    items.push({ k: 'bag', x: Math.cos(an) * d, z: Math.sin(an) * d, y: 0.18, s: 0.24 + r() * 0.12, ry: r() * 6.3, rx: 0, hex: BAG_HEX[(r() * BAG_HEX.length) | 0], rank: r() * 0.9 + 0.1 });
  }
  const JUNK = ['box', 'box', 'tire', 'chair', 'mattress', 'tv', 'boards', 'fridge', 'box'];
  const nj = 3 + ((r() * 4) | 0);
  for (let i = 0; i < nj; i++) {
    const an = r() * Math.PI * 2, d = R * (0.3 + r() * 0.8), k = d / R;
    items.push({ k: JUNK[(r() * JUNK.length) | 0], x: Math.cos(an) * d, z: Math.sin(an) * d, y: Math.max(0, H * (1 - k * k)) * 0.7, s: 1, ry: r() * 6.3, rx: (r() - 0.5) * 0.9, rz: (r() - 0.5) * 0.6, rank: r() });
  }
  const stain = [];
  for (let i = 0; i < 11; i++) stain.push(0.75 + r() * 0.45);
  return { x, z, R, H, items, stain };
}
let BAG_G = null, TIRE_G = null, CORE_G = null;
function heapGeos (hp, s, out) {
  const keep = 0.12 + 0.88 * s, sc = 0.45 + 0.55 * s, gy0 = A.groundH(hp.x, hp.z);
  // пятно грязи под кучей — неровное
  const stain = new THREE.CircleGeometry(hp.R * 1.2 * sc, 11), sp = stain.attributes.position;
  for (let i = 1; i < sp.count; i++) { const k = hp.stain[(i - 1) % 11]; sp.setXY(i, sp.getX(i) * k, sp.getY(i) * k); }
  stain.rotateX(-Math.PI / 2);
  A.put(out, stain, '#5f574b', hp.x, gy0 + 0.035, hp.z);
  if (!BAG_G) { BAG_G = new THREE.IcosahedronGeometry(1, 0); TIRE_G = new THREE.TorusGeometry(0.34, 0.13, 4, 9); CORE_G = new THREE.IcosahedronGeometry(1, 1); }
  for (const it of hp.items) {
    if (it.rank >= keep) continue;
    const x = hp.x + it.x * sc, z = hp.z + it.z * sc, y = A.groundH(x, z) + it.y * sc;
    switch (it.k) {
      case 'core': A.put(out, A.geoScaled(CORE_G, it.sx * sc, it.sy * sc, it.sz * sc), '#2c2a2c', x, A.groundH(x, z) - 0.05, z, 0, it.ry, 0); break;
      case 'bag': {
        const g = A.geoScaled(BAG_G, it.s * sc, it.s * 0.78 * sc, it.s * 1.08 * sc);
        A.put(out, g, it.hex, x, y, z, it.rx, it.ry, 0);
        if (it.s > 0.36) A.box(out, 0.07 * sc, 0.12 * sc, 0.07 * sc, it.hex, x, y + it.s * 0.78 * sc, z);     // узелок
        break;
      }
      case 'box': A.put(out, A.boxGeo(0.6 * sc, 0.45 * sc, 0.5 * sc), pick(['#b08a5a', '#a2804f', '#c09a66']), x, y + 0.22 * sc, z, it.rx * 0.5, it.ry, it.rz || 0); break;
      case 'tire': A.put(out, A.geoScaled(TIRE_G, sc, sc, sc), '#1c1c20', x, y + 0.16 * sc, z, Math.PI / 2 + it.rx * 0.4, it.ry, 0); break;
      case 'chair': {
        const g = [];
        A.box(g, 0.5, 0.06, 0.5, '#8a6b4e', 0, 0.45, 0); A.box(g, 0.5, 0.5, 0.05, '#8a6b4e', 0, 0.72, -0.23);
        for (const [a, b] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2]]) A.box(g, 0.05, 0.45, 0.05, '#6b523b', a, 0.22, b);   // одной ножки нет
        const m = A.mergeGeos(g); m.scale(sc, sc, sc);
        A.put(out, m, '#8a6b4e', x, y, z, it.rx, it.ry, 0.5);
        break;
      }
      case 'mattress': A.put(out, A.boxGeo(1.8 * sc, 0.18 * sc, 0.85 * sc), '#cdbf9f', x, y + 0.35 * sc, z, 0, it.ry, 0.45); break;
      case 'tv': A.put(out, A.boxGeo(0.55 * sc, 0.42 * sc, 0.45 * sc), '#4a4a50', x, y + 0.2 * sc, z, it.rx * 0.5, it.ry, 0); break;
      case 'boards': for (let i = 0; i < 3; i++) A.put(out, A.boxGeo(1.6 * sc, 0.05 * sc, 0.18 * sc), '#9a7a55', x + i * 0.1, y + 0.1 * sc + i * 0.06, z + i * 0.2 * sc, 0, it.ry + i * 0.2, 0.25); break;
      case 'fridge': A.put(out, A.boxGeo(0.62 * sc, 1.5 * sc, 0.62 * sc), '#e9e6df', x, y + 0.3 * sc, z, Math.PI / 2 - 0.15, it.ry, 0); break;
    }
  }
}
function trashBuild (k) {
  if (!TRASH.grp) {
    TRASH.grp = new THREE.Group();
    TRASH.grp.matrixAutoUpdate = false;          // cull.js эту группу не трогает: мы пересобираем её сами
    TRASH.mat = SEAS.seasonMat(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 0);
    A.scene.add(TRASH.grp);
  }
  for (const m of TRASH.chunks) { TRASH.grp.remove(m); m.geometry.dispose(); }
  TRASH.chunks = [];
  TRASH.k = k;
  STATS.trashTris = 0;
  const s = 1 - k;
  if (s <= 0.004 || !HEAPS.length) return;
  const by = new Map();
  for (const hp of HEAPS) {
    const key = Math.floor(hp.x / 400) + ',' + Math.floor(hp.z / 400);
    if (!by.has(key)) by.set(key, []);
    heapGeos(hp, s, by.get(key));
  }
  for (const list of by.values()) {
    if (!list.length) continue;
    const g = A.mergeGeos(list);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, TRASH.mat);
    m.matrixAutoUpdate = false;
    TRASH.grp.add(m);
    TRASH.chunks.push(m);
    STATS.trashTris += g.index.count / 3;
  }
}
function trashStep (dt) {
  if ((TRASH.checkT -= dt) > 0) return;
  TRASH.checkT = 1;
  // шаг доната — 500 ₽ из 60 000; пересобираем, только когда он сдвинулся
  const k = Math.round(A.donated('trash') * 240) / 240;
  if (k !== TRASH.k) trashBuild(k);
  const cx = A.cam.position.x, cz = A.cam.position.z, far = (A.cam.far || 490) + 30;
  for (const m of TRASH.chunks) { const s = m.geometry.boundingSphere; m.visible = Math.hypot(s.center.x - cx, s.center.z - cz) - s.radius < far; }
}

/* ═════════════════ гаражи: шашлыки ═════════════════ */
const GRILL_SPOTS = [], GRILLS = [];
const GRILL_LINES = /*i18n*/ ['Шашлычок поспевает!', 'Переворачивай, горит!', 'Ещё пять минуточек', 'Лучок бери!', 'Мясо — огонь', 'Угли — самое то', 'Сбрызни водичкой!'];
function planGarages () {
  for (const b of A.CITY.buildings) {
    if (b.k !== 'gar' || GRILL_SPOTS.length > 420) continue;
    const p = b.p, [cx, cz] = centroid(p);
    if (hash(cx, cz, 41) > 0.5) continue;
    let best = null;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], c = p[(i + 1) % p.length], len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < 12 || (best && len < best.len)) continue;
      best = { a, c, len };
    }
    if (!best) continue;
    const { a, c, len } = best, ux = (c[0] - a[0]) / len, uz = (c[1] - a[1]) / len;
    for (const s of [1, -1]) {
      const nx = -uz * s, nz = ux * s, t0 = 0.3 + hash(cx, cz, 43) * 0.4;
      const mx = a[0] + (c[0] - a[0]) * t0, mz = a[1] + (c[1] - a[1]) * t0;
      const x = mx + nx * 3.2, z = mz + nz * 3.2;
      if (inPolyP(mx + nx * 0.5, mz + nz * 0.5, p)) continue;          // это внутрь дома
      if (A.inHouse(x, z, 1.6) || !A.inBounds(x, z, 20) || A.groundH(x, z) < 0.3) continue;
      const r = A.nearestRoad(x, z, 7, 1);
      if (r && r.seg.c <= 5 && r.d < r.seg.w / 2 + 5) continue;
      if (MAPR && MAPR.garage && Math.hypot(MAPR.garage.x - x, MAPR.garage.z - z) < 45) continue;   // гараж Дяди Жени — cars.js
      GRILL_SPOTS.push({ x, z, ry: Math.atan2(nx, nz), busy: 0 });
      break;
    }
  }
  STATS.grillSpots = GRILL_SPOTS.length;
}
let GRILL_GEO = null, COAL_MAT = null;
function grillGeo () {
  if (GRILL_GEO) return GRILL_GEO;
  const g = [];
  A.box(g, 1.0, 0.28, 0.34, '#3a3a40', 0, 0.72, 0);                 // корыто мангала
  for (const [x, z] of [[-0.44, -0.13], [0.44, -0.13], [-0.44, 0.13], [0.44, 0.13]]) A.box(g, 0.04, 0.62, 0.04, '#2b2b30', x, 0.31, z);
  for (let i = 0; i < 5; i++) {                                     // шампуры с мясом
    const x = -0.36 + i * 0.18;
    A.box(g, 0.015, 0.015, 0.5, '#c8ccd2', x, 0.9, 0);
    for (const z of [-0.1, -0.02, 0.06]) A.box(g, 0.07, 0.07, 0.07, i % 2 ? '#7a3b22' : '#8e4a2a', x, 0.9, z);
  }
  // раскладной стол и сумка-холодильник
  A.box(g, 0.8, 0.04, 0.55, '#d8d2c6', 1.25, 0.7, 0.1); for (const x of [-0.35, 0.35]) A.box(g, 0.03, 0.68, 0.5, '#8d929b', 1.25 + x, 0.35, 0.1);
  A.box(g, 0.14, 0.3, 0.14, '#e8e0cf', 1.1, 0.87, 0.05); A.box(g, 0.28, 0.06, 0.2, '#f2f0ea', 1.4, 0.75, 0.2);
  A.box(g, 0.5, 0.36, 0.34, '#2f6fbf', -1.2, 0.18, 0.4); A.box(g, 0.52, 0.06, 0.36, '#f2f0ea', -1.2, 0.38, 0.4);
  GRILL_GEO = A.mergeGeos(g);
  COAL_MAT = new THREE.MeshBasicMaterial({ color: 0xff6a1a });
  return GRILL_GEO;
}
function chairGeo (hex) {
  const g = [];
  A.box(g, 0.5, 0.04, 0.46, hex, 0, 0.42, 0);
  A.box(g, 0.5, 0.5, 0.04, hex, 0, 0.7, -0.24);
  for (const s of [-1, 1]) { A.box(g, 0.03, 0.7, 0.03, '#8d929b', s * 0.24, 0.3, 0.14); A.box(g, 0.03, 0.9, 0.03, '#8d929b', s * 0.24, 0.45, -0.18); }
  return A.mergeGeos(g);
}
function spawnGrill (sp) {
  const grp = new THREE.Group();
  grp.position.set(sp.x, A.groundH(sp.x, sp.z), sp.z);
  grp.rotation.y = sp.ry;
  const lit = new THREE.Mesh(grillGeo(), GRILL_MAT());
  grp.add(lit);
  const coal = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.26), COAL_MAT);
  coal.position.y = 0.84;
  grp.add(coal);
  const chairs = [];
  const nChairs = 1 + (chance(0.55) ? 1 : 0);
  for (let i = 0; i < nChairs; i++) {
    const c = new THREE.Mesh(chairGeo(pick(['#3f7a4a', '#2f5fa8', '#8a3b3b', '#3b3f46'])), GRILL_MAT());
    const a = (i ? -1 : 1) * rand(0.9, 1.3), rr = 2.3;
    c.position.set(Math.sin(a) * rr, 0, Math.cos(a) * rr);
    c.rotation.y = a + Math.PI;
    grp.add(c); chairs.push(c);
  }
  A.scene.add(grp);
  // дым: свои клубы по кругу — поднимаются, растут и тают (без новых мешей каждый раз)
  const smoke = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(SMOKE_GEO || (SMOKE_GEO = new THREE.IcosahedronGeometry(0.5, 0)), new THREE.MeshBasicMaterial({ color: 0xe4e0da, transparent: true, opacity: 0, depthWrite: false }));
    m.userData.ph = i / 7; m.userData.dx = rand(-0.3, 0.3);
    grp.add(m); smoke.push(m);
  }
  const g = { sp, grp, coal, smoke, men: [], t: 0, sayT: rand(3, 8), tip: 0, x: sp.x, z: sp.z, gone: 0 };
  const n = chance(0.2) ? 2 : chance(0.55) ? 3 : 4;
  for (let i = 0; i < n; i++) {
    const m = { grp: A.makeHuman(null), ph: rand(0, 6), dead: 0, sit: null, shock: 0, bubble: null, bubT: 0 };
    let lx, lz, face;
    if (i === 0) { lx = 0; lz = -0.75; face = 0; m.cook = 1; }            // повар — за мангалом, лицом к нему
    else if (i <= chairs.length) { const c = chairs[i - 1]; lx = c.position.x; lz = c.position.z; face = c.rotation.y; m.sit = c; }
    else { const a = rand(-0.5, 0.5) + (i % 2 ? 0.25 : -0.25); lx = Math.sin(a) * 1.9; lz = Math.cos(a) * 1.9; face = a + Math.PI; }
    m.lx = lx; m.lz = lz;
    m.grp.position.set(lx, m.sit ? 0.02 : 0, lz);
    m.grp.rotation.y = face;
    grp.add(m.grp);
    const [wx, wz] = rot(sp.x, sp.z, sp.ry, lx, lz);
    m.x = wx; m.z = wz;
    if (m.sit) { const u = m.grp.userData; u.legL.rotation.x = u.legR.rotation.x = -1.45; m.grp.position.y = -0.28; }
    g.men.push(m);
  }
  sp.busy = 1;
  GRILLS.push(g);
  STATS.grills++;
}
let GRILL_M = null, SMOKE_GEO = null;
const GRILL_MAT = () => GRILL_M || (GRILL_M = SEAS.seasonMat(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 0));
function dropGrill (g) {
  for (const m of g.men) { if (m.bubble) { m.grp.remove(m.bubble); m.bubble.material.dispose(); } if (!m.dead) { g.grp.remove(m.grp); A.dropMesh(m.grp); } }
  A.scene.remove(g.grp);
  g.grp.traverse(o => { if (o.isMesh && o.geometry !== GRILL_GEO && o.geometry !== SMOKE_GEO && o.material !== COAL_MAT) o.geometry.dispose(); });
  for (const m of g.smoke) m.material.dispose();
  g.coal.geometry.dispose();
  g.sp.busy = 0;
}
let grillScanT = 1;
function grillScan () {
  const V = A.V;
  for (let i = GRILLS.length - 1; i >= 0; i--) {
    const g = GRILLS[i];
    if (Math.hypot(g.x - V.x, g.z - V.z) > 260 || g.gone) { dropGrill(g); GRILLS.splice(i, 1); }
  }
  if (GRILLS.length >= 2 || !GRILL_SPOTS.length) return;
  const E = A.ENV, h = hourOf(E.t);
  if (E.rain > 0.35 || E.rainWant) return;
  let p = h >= 17 ? 0.55 : h >= 12 ? 0.22 : 0.07;
  if ((A.shiftN ? A.shiftN() : 0) % 7 >= 5) p = Math.min(0.9, p * 1.7);        // «выходные» — каждая шестая и седьмая смена
  if (SEAS.snowy && SEAS.snowy()) p *= 0.5;
  if (!chance(p)) return;
  const near = GRILL_SPOTS.filter(s => { if (s.busy) return false; const d = Math.hypot(s.x - V.x, s.z - V.z); return d > 55 && d < 210; });
  if (near.length) spawnGrill(pick(near));
}
function grillStep (dt) {
  if ((grillScanT -= dt) <= 0) { grillScanT = 2; grillScan(); }
  const V = A.V, sp = Math.hypot(V.vx, V.vz), fx = Math.sin(V.h), fz = Math.cos(V.h);
  for (const g of GRILLS) {
    g.t += dt;
    const d = Math.hypot(g.x - V.x, g.z - V.z);
    g.grp.visible = d < 170;
    if (!g.grp.visible) continue;
    // дым от углей: клуб поднимается на три метра, растёт и тает; ветер чуть сносит
    for (const m of g.smoke) {
      const u = m.userData, q = (g.t * 0.28 + u.ph) % 1;
      m.visible = !g.tip;
      m.position.set(u.dx + q * 0.9, 0.95 + q * 3.0, q * 0.4);
      m.scale.setScalar(0.35 + q * 1.3);
      m.material.opacity = (q < 0.12 ? q / 0.12 : 1 - (q - 0.12) / 0.88) * 0.5;
    }
    g.coal.material.color.setHex(Math.sin(g.t * 7) > 0.6 ? 0xff8a2a : 0xff5a14);
    // сбил мангал — опрокинулся, угли погасли
    if (!g.tip && sp > 3 && Math.hypot(g.x - V.x, g.z - V.z) < 1.8) {
      g.tip = 1; g.coal.visible = false;
      if (A.sparks) A.sparks(g.x, 0.9, g.z, 10);
      if (A.Snd) A.Snd.noise(0.15, 0.2);
      for (const m of g.men) if (!m.dead) { m.shock = rand(2, 3.5); say(m, pick([t('Шашлык!!'), t('Ты чё творишь?!'), t('Мясо-о-о!')]), '#d9342c'); }
    }
    if (g.tip) { const c = g.grp.children[0]; c.rotation.z = damp(c.rotation.z, 1.45, 6, dt); c.position.y = damp(c.position.y, -0.35, 6, dt); }
    let sayer = null;
    if ((g.sayT -= dt) <= 0) { g.sayT = rand(5, 11); sayer = pick(g.men.filter(m => !m.dead)); }
    for (const m of g.men) {
      if (m.dead) continue;
      const u = m.grp.userData;
      m.ph += dt;
      if (m.bubble && (m.bubT -= dt) <= 0) { m.grp.remove(m.bubble); m.bubble.material.dispose(); m.bubble = null; }
      if (m === sayer && d < 60) say(m, t(pick(GRILL_LINES)), '#8a4a1a');
      if (m.shock > 0) { m.shock -= dt; if (A.handsUp) A.handsUp(u, dt); }
      else if (m.cook && !g.tip) {
        // повар машет картонкой над углями и переворачивает шампуры
        u.armR.rotation.x = -1.2 + Math.sin(m.ph * 9) * 0.35;
        u.armL.rotation.x = damp(u.armL.rotation.x, Math.sin(m.ph * 0.7) > 0.7 ? -0.9 : -0.2, 4, dt);
        u.head.rotation.x = 0.35;
      } else if (!m.sit) {
        u.armL.rotation.x = damp(u.armL.rotation.x, Math.sin(m.ph * 0.5) > 0.4 ? -0.8 : 0, 3, dt);     // «ну, за встречу» — жестикулирует
        u.head.rotation.y = Math.sin(m.ph * 0.4) * 0.5;
      }
      // наезд
      if (sp > 3) {
        const dx = m.x - V.x, dz = m.z - V.z;
        if (Math.abs(dx * fx + dz * fz) < 2.4 && Math.abs(dx * fz - dz * fx) < 1.25) {
          m.dead = 1;
          if (m.bubble) { m.grp.remove(m.bubble); m.bubble.material.dispose(); m.bubble = null; }
          g.grp.remove(m.grp);
          A.dropMesh(m.grp);
          A.gibHuman({ x: m.x, z: m.z, grp: m.grp }, V.vx, V.vz);
          if (A.onRunOver) A.onRunOver();
          for (const o of g.men) if (!o.dead) o.shock = rand(2, 3.5);
        }
      }
    }
  }
}
function say (m, text, col) {
  if (!A.sayBubble) return;
  if (m.bubble) { m.grp.remove(m.bubble); m.bubble.material.dispose(); }
  m.bubble = A.sayBubble(m.grp, text, col || '#5a4a9a', 2.7);
  m.bubT = 2.6;
}

/* ═════════════════ бандитские районы ═════════════════ */
const TRACK = ['#1d2a66', '#1b1b20', '#2a2d36', '#16305a', '#3a3a42'];
const GE = { st: '', men: [], t: 0, cd: 0, cx: 0, cz: 0, bribe: 0, hearts: 0, hurtT: 0, done: null, lead: null, left: 0, force: false };
/* песочница: на ближайшем вручении в районе — гопники наверняка (без жребия и часов) */
export function thugsNext (on = true) { GE.force = !!on; GE.cd = 0; return GE.force; }
function evening () {
  const C = MOD('career');
  if (C && C.isEvening && C.shiftOn && C.shiftOn()) return C.isEvening();
  return hourOf(A.ENV.t) >= SHIFT.EVENING_H;
}
const inGang = (x, z) => ZN.gangZones().some(g => (x - g.x) ** 2 + (z - g.z) ** 2 < g.r * g.r);
/* подъехал к клиенту (orders.js onArrive): в районе — шанс, что подойдут (днём GANG.CHANCE,
   вечером GANG.CHANCE_EVENING; донат «борьба с насилием» — вдвое реже).
   Раньше — только вечером: в укороченных сменах вечер ~1 мин, мзду почти не видели.
   Возвращаем обещание: пока разбираемся с гопниками, заказ ждёт */
export function arrive (ev) {
  if (!A || !CAREER || GE.st || (GE.cd > 0 && !GE.force)) return;
  const x = ev && ev.x !== undefined ? ev.x : A.V.x, z = ev && ev.z !== undefined ? ev.z : A.V.z;
  if (!inGang(x, z) && !inGang(A.V.x, A.V.z)) return;
  if (GE.force) GE.force = false;
  else if (!chance((evening() ? GANG.CHANCE_EVENING : GANG.CHANCE) * (1 - 0.5 * A.donated('gang')))) return;
  return gangStart();
}
function thug (lead) {
  const person = lead ? makePerson({ fem: false }) : null, hex = pick(TRACK);
  // портрет в диалоге — тоже в спортивке и кепке
  if (person && person.look) Object.assign(person.look, { shirt: hex, pants: hex, jacket: hex, top: 'long', bottom: 'pants', head: 'cap', headC: '#131317', pack: null });
  const grp = A.makeHuman(person, { shirt: hex, pants: hex, cap: '#131317', fat: false, fem: false });
  const u = grp.userData;
  // лампасы на штанах и рукавах
  for (const [part, h, y] of [[u.legL, 0.62, -0.34], [u.legR, 0.62, -0.34], [u.armL, 0.42, -0.23], [u.armR, 0.42, -0.23]]) {
    const g = [];
    for (const s of [-1, 1]) A.box(g, 0.02, h, 0.03, '#f2f2f0', s * 0.078, y, 0);
    part.add(new THREE.Mesh(A.mergeGeos(g), A.HUMAN_VC));
  }
  let bat = null;
  if (A.ADULT) {                                   // детская версия — без бит
    const g = [];
    A.box(g, 0.06, 0.5, 0.06, '#6b4a2e', 0, -0.62, 0.05);
    A.box(g, 0.09, 0.5, 0.09, '#9a7348', 0, -1.1, 0.05);
    bat = new THREE.Mesh(A.mergeGeos(g), A.HUMAN_VC);
    u.armR.add(bat);
  }
  A.scene.add(grp);
  return { grp, u, person, x: 0, z: 0, h: 0, ph: rand(0, 6), dead: 0, slot: 0, swingT: rand(0.2, 1), swing: 0, bubble: null, bubT: 0, bat };
}
function slotPos (i, n) {
  // вокруг машины: у водительской двери — главный, остальные — у капота, багажника и с другой стороны
  const V = A.V, fx = Math.sin(V.h), fz = Math.cos(V.h), rx = fz, rz = -fx;
  const S = [[1.75, 0.6], [-1.75, 1.0], [1.7, -1.5], [-1.7, -1.3], [0, 3.2]];
  const [a, b] = S[i % S.length];
  return [V.x + rx * a + fx * b, V.z + rz * a + fz * b];
}
function gangStart () {
  const V = A.V, n = 3 + (chance(0.5) ? 1 : 0);
  GE.st = 'come'; GE.t = 0; GE.cx = V.x; GE.cz = V.z; GE.hearts = 0; GE.hurtT = 1.2; GE.men = [];
  GE.bribe = Math.round((GANG.BRIBE_BASE + GANG.BRIBE_SHARE * Math.max(0, (A.S && A.S.money) || 0)) / 10) * 10;
  for (let i = 0; i < n; i++) {
    const m = thug(i === 0);
    m.slot = i;
    // из разных сторон: из-за угла, из двора, с улицы
    let placed = false;
    for (let k = 0; k < 14 && !placed; k++) {
      const an = V.h + (i / n) * Math.PI * 2 + rand(-0.5, 0.5), d = rand(14, 22);
      const x = V.x + Math.sin(an) * d, z = V.z + Math.cos(an) * d;
      if (A.inHouse(x, z, 0.8) || !A.inBounds(x, z, 5)) continue;
      m.x = x; m.z = z; placed = true;
    }
    if (!placed) { m.x = V.x + rand(-12, 12); m.z = V.z + rand(-12, 12); }
    GE.men.push(m);
  }
  GE.lead = GE.men[0];
  STATS.gang++;
  return new Promise(res => { GE.done = res; });
}
function gangEnd () {
  if (GE.done) { const f = GE.done; GE.done = null; f(); }
}
function gangLeave (line, col) {
  GE.st = 'leave'; GE.t = 0; GE.cd = 45;
  const m = GE.men.find(q => !q.dead);
  if (m && line) gsay(m, line, col || '#3a3a42');
  for (const q of GE.men) { const an = Math.atan2(q.x - A.V.x, q.z - A.V.z) + rand(-0.4, 0.4); q.tx = q.x + Math.sin(an) * 30; q.tz = q.z + Math.cos(an) * 30; }
  gangEnd();
}
function gsay (m, text, col) {
  if (!A.sayBubble || m.dead) return;
  if (m.bubble) { m.grp.remove(m.bubble); m.bubble.material.dispose(); }
  m.bubble = A.sayBubble(m.grp, text, col || '#3a3a42', 2.7);
  m.bubT = 2.8;
}
function gangTalk () {
  GE.st = 'talk';
  const L = GE.lead && !GE.lead.dead ? GE.lead : GE.men.find(q => !q.dead);
  if (!L) { gangLeave(); return; }
  const sum = A.money ? A.money(GE.bribe) : GE.bribe + ' ₽';
  const text = A.ADULT
    ? t('Слышь, курьер. Это наш район. Хочешь тут ездить — плати. {money}, и катайся спокойно.', { money: sum })
    : t('Эй, курьер! Это наш двор. Проезд платный — {money}. Заплатишь — катайся.', { money: sum });
  DLG.say({
    person: L.person, name: A.ADULT ? t('Гопник') : t('Пацан со двора'), text, mood: 'calm', color: '#d9342c',
    accept: t('заплатить {money}', { money: sum }), decline: t('не буду'), timer: 9,
    timeoutText: A.ADULT ? t('Молчишь? Ну, сам виноват') : t('Молчишь? Ну держись!'),
  }).then(ok => {
    if (GE.st !== 'talk') return;
    if (ok) {
      const paid = A.pay ? A.pay(GE.bribe) : 0;
      if (A.toast) A.toast(paid < GE.bribe ? t('отдал всё, что было: {money}', { money: A.money(paid) }) : t('мзда: −{money}', { money: A.money(paid) }));
      gangLeave(A.ADULT ? t('Другое дело. Катайся.') : t('Во, нормально. Езжай.'));
    } else {
      GE.st = 'smash'; GE.t = 0; GE.hurtT = 0.9;
      gsay(L, A.ADULT ? t('Сам напросился!') : t('Ща покачаем!'), '#d9342c');
    }
  });
}
/* машина хуже заводится: ломучесть L +1 (cars.js worsen) */
function carWorse () {
  const C = MOD('cars');
  try { if (C && C.worsen) C.worsen(1); } catch (e) { console.warn('[world] cars.worsen', e); }
}
function gangStep (dt) {
  if (GE.cd > 0) GE.cd -= dt;
  if (!GE.st) return;
  const V = A.V, S = A.S, sp = Math.hypot(V.vx, V.vz), fx = Math.sin(V.h), fz = Math.cos(V.h);
  if (!S || S.state === 'title' || S.state === 'over' || S.state === 'dying') { gangClear(); return; }
  GE.t += dt;
  const dCar = Math.hypot(V.x - GE.cx, V.z - GE.cz);
  // уехал до разговора — ну и вали
  if (GE.st === 'come') {
    if (dCar > 16) { gangLeave(A.ADULT ? t('Вали-вали!') : t('Ну и езжай!')); }
    else {
      const L = GE.lead && !GE.lead.dead ? GE.lead : GE.men.find(q => !q.dead);
      if (!L) { gangLeave(); }
      else {
        const [tx, tz] = slotPos(L.slot, GE.men.length);
        if (Math.hypot(tx - L.x, tz - L.z) < 0.6 || GE.t > 11) gangTalk();
      }
    }
  }
  if (GE.st === 'smash') {
    // уехал — ругаются вслед
    if (dCar > 9 && sp > 4) { gangLeave(A.ADULT ? t('Ещё встретимся!') : t('Ещё увидимся!'), '#d9342c'); }
    else {
      GE.cx = damp(GE.cx, V.x, 2, dt); GE.cz = damp(GE.cz, V.z, 2, dt);
      const near = GE.men.some(m => !m.dead && Math.hypot(m.x - V.x, m.z - V.z) < 3.4);
      if (near && (GE.hurtT -= dt) <= 0) {
        GE.hurtT = 1.7;
        if (A.hurt) A.hurt(1);
        GE.hearts++;
        if (GE.hearts >= GANG.SMASH_HEARTS) {
          const worse = chance(GANG.SMASH_BREAK);
          if (worse) carWorse();
          if (A.toast) A.toast(worse ? (A.ADULT ? t('машину помяли — теперь хуже заводится') : t('машину раскачали — теперь хуже заводится'))
            : (A.ADULT ? t('машину помяли') : t('машину раскачали')));
          gangLeave(A.ADULT ? t('Будешь знать!') : t('В следующий раз плати!'), '#d9342c');
        }
      }
      if (GE.t > 14) gangLeave(t('Ладно, пошли, пацаны'));
    }
  }
  for (const m of GE.men) {
    if (m.dead) continue;
    const u = m.u;
    if (m.bubble && (m.bubT -= dt) <= 0) { m.grp.remove(m.bubble); m.bubble.material.dispose(); m.bubble = null; }
    let tx, tz, speed = 1.6;
    if (GE.st === 'leave') { tx = m.tx; tz = m.tz; speed = 1.9; }
    else { [tx, tz] = slotPos(m.slot, GE.men.length); if (GE.st === 'smash') speed = 3.2; }
    const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
    let walk = false;
    if (d > 0.3 && GE.st !== 'talk') {
      const k = Math.min(1, speed * dt / d);
      m.x += dx * k; m.z += dz * k; walk = true;
      m.h = damp(m.h, m.h + wrap(Math.atan2(dx, dz) - m.h), 8, dt);
    } else m.h = damp(m.h, m.h + wrap(Math.atan2(V.x - m.x, V.z - m.z) - m.h), 6, dt);   // лицом к машине
    m.ph += dt * (walk ? 8 : 2);
    const sw = walk ? Math.sin(m.ph) * 0.6 : 0;
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
    if (GE.st === 'smash' && !walk) {
      if (m.bat) {
        // замах битой и удар по кузову
        m.swing = Math.max(0, m.swing - dt * 2.4);
        if ((m.swingT -= dt) <= 0) {
          m.swingT = rand(0.75, 1.2); m.swing = 1;
          const hx = V.x + (m.x - V.x) * 0.45, hz = V.z + (m.z - V.z) * 0.45;
          if (A.dent) A.dent(hx, hz, 16);
          if (A.Snd) { A.Snd.noise(0.09, 0.22); A.Snd.blip(120 + Math.random() * 40, 0.08, 'square', 0.1); }
          if (A.sparks && chance(0.3)) A.sparks(hx, 1.0, hz, 3);
          if (S) S.shake = Math.max(S.shake || 0, 0.25);
        }
        const k = m.swing;
        u.armR.rotation.x = k > 0.6 ? -2.7 : -2.7 + (0.6 - k) / 0.6 * 3.2;     // вверх — и вниз
        u.armL.rotation.x = -0.6;
      } else {
        // детская версия: руками в машину и раскачивают
        const k = Math.sin(GE.t * 7 + m.slot);
        u.armR.rotation.x = -1.4 + k * 0.25; u.armL.rotation.x = -1.4 + k * 0.25;
        if ((m.swingT -= dt) <= 0) { m.swingT = rand(0.9, 1.4); if (A.dent) A.dent(V.x + (m.x - V.x) * 0.45, V.z + (m.z - V.z) * 0.45, 6); if (A.Snd) A.Snd.noise(0.06, 0.12); }
        if (S) S.shake = Math.max(S.shake || 0, 0.18);
      }
    } else {
      u.armR.rotation.x = walk ? -sw * 0.6 : damp(u.armR.rotation.x, m.bat ? -0.3 : 0, 5, dt);
      u.armL.rotation.x = walk ? sw * 0.6 : damp(u.armL.rotation.x, 0, 5, dt);
      if (GE.st === 'talk' && m === GE.lead) u.armL.rotation.x = -1.0;          // тянет руку за деньгами
    }
    m.grp.position.set(m.x, A.groundH(m.x, m.z) + (A.curbAt ? A.curbAt(m.x, m.z) : 0), m.z);
    m.grp.rotation.y = m.h;
    // наезд
    if (sp > 3) {
      const ex = m.x - V.x, ez = m.z - V.z;
      if (Math.abs(ex * fx + ez * fz) < 2.4 && Math.abs(ex * fz - ez * fx) < 1.2) {
        m.dead = 1;
        if (m.bubble) { m.grp.remove(m.bubble); m.bubble.material.dispose(); m.bubble = null; }
        A.dropMesh(m.grp);
        A.gibHuman({ x: m.x, z: m.z, grp: m.grp }, V.vx, V.vz);
        if (A.onRunOver) A.onRunOver();
      }
    }
  }
  if (GE.st === 'leave') {
    GE.left += dt;
    const all = GE.men.every(m => m.dead || Math.hypot(m.x - m.tx, m.z - m.tz) < 0.5 || Math.hypot(m.x - V.x, m.z - V.z) > 60);
    if (all || GE.t > 25) gangClear();
  } else if (GE.men.every(m => m.dead)) gangLeave();
}
function gangClear () {
  for (const m of GE.men) {
    if (m.bubble) { m.grp.remove(m.bubble); m.bubble.material.dispose(); m.bubble = null; }
    if (!m.dead) { m.dead = 1; A.dropMesh(m.grp); }
  }
  GE.men = []; GE.st = ''; GE.lead = null;
  gangEnd();
}

/* круги районов на радаре и полной карте */
export function drawRadar (ctx, tr, s) {
  if (!CAREER || !A) return;
  for (const g of ZN.gangZones()) {
    const [a, b] = tr(g.x, g.z), r = g.r * s;
    if (Math.hypot(a, b) > r + 200) continue;
    ctx.beginPath(); ctx.arc(a, b, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(226, 48, 56, 0.24)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(214, 36, 44, 0.75)'; ctx.stroke();
  }
}
export function drawMap (x, fmX, fmZ, s) {
  if (!CAREER || !A) return;
  for (const g of ZN.gangZones()) {
    const a = fmX(g.x), b = fmZ(g.z), r = Math.abs(fmX(g.x + g.r) - a);
    x.beginPath(); x.arc(a, b, r, 0, Math.PI * 2);
    x.fillStyle = 'rgba(226, 48, 56, 0.3)'; x.fill();
    x.lineWidth = Math.max(2, 3 * s); x.strokeStyle = 'rgba(200, 30, 40, 0.85)'; x.stroke();
  }
}

/* ═════════════════ сборка и шаг ═════════════════ */
export function build (api) {
  A = api;
  if (!CAREER) CAREER = !!api.CAREER;
  if (!MAPR) MAPR = (api.MAP && api.MAP.career) || null;
  const tm = (k, f) => { const t0 = performance.now(); f(); STATS.buildMs[k] = Math.round(performance.now() - t0); };
  tm('alleys', () => { pathGrid(); planAlleys(); drawAlleys(); });
  if (!CAREER) return;
  tm('rich', richLawns);
  tm('trash', () => { planTrash(); trashBuild(Math.round(A.donated('trash') * 240) / 240); });
  tm('garages', planGarages);
}

let late = false;
export function step (dt, api) {
  if (!A) return;
  if (api) A = api;
  if (typeof window !== 'undefined' && window.__dlv && !window.__dlv.WORLD) window.__dlv.WORLD = DEBUG;
  if (!CAREER) return;
  const t0 = performance.now();
  if (!late) {
    late = true;
    richLate();
    const ORD = MOD('orders');
    if (ORD && ORD.onArrive) ORD.onArrive(arrive);
  }
  trashStep(dt);
  gangStep(dt);
  grillStep(dt);
  STATS.ms = STATS.ms * 0.98 + (performance.now() - t0) * 0.02;
}

/* для отладки: __dlv.WORLD */
export const DEBUG = {
  STATS, HEAPS, ALLEYS, VILLAS, GRILLS, GRILL_SPOTS, GE, LUX_SPOTS, TRASH, paveRoad, pavePath, PAVE,
  gang: () => A && !GE.st && gangStart(), thugsNext, trash: k => A && trashBuild(k), grill: () => { const V = A.V; const s = GRILL_SPOTS.filter(q => !q.busy).sort((a, b) => Math.hypot(a.x - V.x, a.z - V.z) - Math.hypot(b.x - V.x, b.z - V.z))[0]; if (s) spawnGrill(s); return s; },
};
