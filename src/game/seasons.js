/* ──────────────────────────────────────────────────────────────────────────
   Времена года.

   Сезон — число от 0 до 4: 0 — начало лета, 1 — осень, 2 — зима, 3 — весна.
   С 17.10.2026 сезон каждой смены карьеры решает круг сезонов (seasoncycle.js: с зимы
   по кругу, с переходными сменами и сюрпризами; weather.js shiftStart → shiftSeason(v)).
   До того (11.10—17.10) — жребий вместе с погодой. Между сменами и при заходе в игру
   сезон не сдвигается — в меню тот, что был на последней смене.
   Хранится в dlv-season, ?season=2.4 ставит своё значение и ничего не сохраняет.

   Статика города склеена в меши один раз при загрузке, поэтому сезон в ней
   не «запечён», а считается в шейдере по общим юниформам:
   • земля, крыши, дороги (LITM), реквизит (LIT) и мелочь дворов (SMASH):
     снег на всём, что смотрит вверх (пятнами, пока снега мало), жухлая
     трава осенью, грязь и свежая зелень весной, мокрый асфальт, лёд на реке;
   • деревья — свои склейки (PILE) с атрибутом aux: вид куска и зерно.
     Кроны осенью желтеют и по одной пропадают (зерно выше доли листвы —
     вершины уходят в точку), под деревьями по зерну появляются листья,
     зимой — сугробы вдоль улиц и во дворах. Ель и сосна зелёные всегда;
   • гирлянды — ещё одна склейка без света, мигают, ночью ярче.
   Смена сезона между сменами — это только новые значения юниформ, города
   заново не собираем. Ледяные горки и снеговики — вещи из SMASH (их можно
   снести), вне зимы их вершины схлопнуты, к зиме возвращаются.

   Живое: люди одеваются по сезону (people.js, setPeopleSeason), зимой во
   дворах играют в снежки, идёт снег вместо дождя, сцепление хуже, небо
   бледнее; ёлки не пускают машину, сугробы тормозят.

   Вариант сезона на смену (жара, золотая осень, снежная зима — weather.js) ложится поверх
   кривых: setVariant({ доля: число | f(было) }), юниформы uHeat и uGold.
   ────────────────────────────────────────────────────────────────────────── */

import { t } from '../i18n/index.js';
import { setPeopleSeason, redressHumans } from './people.js';
import { growTree } from './trees.js';
import * as EDL from './editlayer.js';         // редактор города: прятать убранные деревья на месте
import { YARD, onYard } from './yards.js';
import { inView } from './cull.js';             // снежки: бой не заводится на глазах (cull.js)   // дворовые дорожки: зимой протоптаны, сугробы мимо (yards.js)
import * as PEDC from './pedcollide.js';         // снежки: бегут не сквозь твёрдое, прячутся за предметы (pedcollide.js steer, coverNear)
import { qHas } from './qpeople.js';               // снежки: бросок — клип «Punch» людей-моделей
import { mat as fakeShadowMat } from './fakeshadows.js';   // тени домов на сугробах, листьях и кронах (fakeshadows.js)
import { ON as MOBILE } from './mobile.js';       // снег на телефоне — крупнее и реже (SNOW_PH, 0п43)
import * as DYN from './dynres.js';              // «мыло»: снежинка того же размера на экране, когда кадр меньше
import { SEE_U, SEE_FN } from './seethru.js';    // деревья, кусты и столбы между камерой и машиной тают (seethru.js, 0п47)
import { BAYER_FN } from './fade.js';
import { indexPile } from './pileindex.js';
import { WOOD_ON, WOOD } from './treeform.js';      // деревья «как в глубинке» (2г6, 2г10): два тона кроны, снег на ветках толще, шапки на соснах; ?oldwood — по-старому

const CELL = 200;                           // клетка склейки, как у статики (CHUNK в game.js; было 100 — деревья и сугробы давали ~37 вызовов отрисовки в кадре, 10.10.2026)

let C = null;                               // что дала игра (init)
let SEA = 0, FORCED = false;
let THREE = null;

/* ─── кривые: сколько чего при данном сезоне ─── */
const curve = pts => s => {
  for (let i = 1; i < pts.length; i++) if (s <= pts[i][0]) {
    const [a, va] = pts[i - 1], [b, vb] = pts[i];
    return va + (vb - va) * (b > a ? (s - a) / (b - a) : 1);
  }
  return pts[pts.length - 1][1];
};
const K = {
  // лето 0—1, осень 1—2, зима 2—3, весна 3—4; где внутри сезона встаёт смена — weather.js SEASON_AT.
  // «Зимний вид» (снег, сугробы, пуховики) — только 2,0—3,0 (docs/CAREER.md «Сезоны»)
  snow: curve([[0, 0], [1.92, 0], [2.1, 1], [2.85, 1], [3.08, 0], [4, 0]]),
  leaf: curve([[0, 1], [1.35, 1], [1.85, 0], [3.05, 0], [3.35, 1], [4, 1]]),
  yellow: curve([[0, 0], [0.92, 0], [1.4, 1], [2.95, 1], [3.0, 0], [4, 0]]),
  fresh: curve([[0, 0.25], [0.4, 0], [3.02, 0], [3.3, 1], [3.6, 0.8], [4, 0.25]]),
  fallen: curve([[0, 0], [1.2, 0], [1.6, 1], [1.95, 1], [2.12, 0], [4, 0]]),
  bloom: curve([[0, 0], [3.25, 0], [3.4, 1], [3.7, 1], [3.85, 0], [4, 0]]),      // сирень цветёт: разгар весны (trees.js)
  berry: curve([[0, 0], [0.85, 0], [1.15, 1], [2.25, 1], [2.5, 0], [4, 0]]),      // ягоды рябины и шиповника: с ранней осени до середины зимы
  dry: curve([[0, 0], [0.8, 0.1], [1.1, 0.45], [1.55, 1], [2.9, 1], [3.1, 0], [4, 0]]),   // летом трава чуть подсыхает (09.10 убирали — автор 10.10 вернул)
  mud: curve([[0, 0], [2.9, 0], [3.06, 1], [3.35, 0], [4, 0]]),
  wet: curve([[0, 0], [1.5, 0], [1.75, 0.5], [1.95, 0], [2.85, 0], [3.08, 1], [3.4, 0.35], [3.7, 0], [4, 0]]),
  drift: curve([[0, 0], [1.98, 0], [2.2, 1], [2.82, 1], [3.04, 0], [4, 0]]),
  ice: curve([[0, 0], [2.04, 0], [2.25, 1], [2.82, 1], [2.96, 0], [4, 0]]),
  ny: curve([[0, 0], [1.98, 0], [2.06, 1], [2.7, 1], [2.8, 0], [4, 0]]),
  warm: curve([[0, 0], [0.92, 0], [1.35, 0.4], [1.85, 0.68], [2.02, 1], [2.82, 1], [3.1, 0.55], [3.35, 0.25], [3.6, 0], [4, 0]]),
};
const A = {};                                // текущие доли (apply)

/* название: три части на сезон */
const NAMES = () => [t('начало лета'), t('разгар лета'), t('конец лета'), t('ранняя осень'), t('золотая осень'), t('поздняя осень'),
  t('начало зимы'), t('разгар зимы'), t('конец зимы'), t('ранняя весна'), t('разгар весны'), t('поздняя весна')];
export const seasonName = (s = SEA) => NAMES()[Math.floor(((s % 4) + 4) % 4 * 3) % 12];
export const seasonValue = () => SEA;
/* новогодние ёлки (у пиццерии — первая): где и какого размера (k — 1 обычная) — праздник их наряжает ярче (holidays.js) */
export const firs = () => FIRS.map(f => ({ x: f.x, z: f.z, k: f.hw / 3.1 }));
/* насколько холодно, 0 — лето … 1 — зима (кривая warm): одежда людей, снежки и горки (life.js) */
export const warmth = () => A.warm || 0;
/* насколько скользко: зимой — как лёгкий дождь */
export const slip = () => (A.snow || 0) * 0.32;
/* идёт ли вместо дождя снег */
export const snowy = () => (A.snow || 0) > 0.45;
/* сколько снега на ветках и земле, 0 … 1 (ельник: forest.js) */
export const snowAmt = () => A.snow || 0;
/* листва на деревьях 1 … 0 (облетела) и желтизна 0 … 1 — берёзы ельника (forest.js) */
export const leafAmt = () => A.leaf ?? 1;
export const yellowAmt = () => A.yellow || 0;
/* распутица (весна) и мокрая земля, 0 … 1 — грязь на машине (cardirt.js) */
export const mudAmt = () => A.mud || 0;
export const wetAmt = () => A.wet || 0;
/* сколько снега падает сейчас (снегопад 0…1) — дворникам (wipers.js) */
export const snowFall = () => (SKY ? SKY.amt : 0);
/* погода волнами (weather.js, 12ах 23.10.2026): snow — снегопад этой силы вместо своего жребия и VAR.snowfall (null — как
   было), wind 0…1 — метель (снег летит вбок до 9,5 м/с, сбитые сугробы отрастают до 4 раз быстрее), wet — асфальт мокрее
   (ливень; null — как у сезона и варианта). Ставит weather.js каждый кадр смены */
const WX = { snow: null, wind: 0, wet: null };
/* лужи на асфальте в дождь (12ам): v — сколько сейчас (0…1, в шейдере земли — порог шума: 0,3 — редкие пятна, 0,85 —
   дождь, 1 — ливень); FROM — с какой силы дождя копятся (морось — нет); GROW / DRY — с от 0 до 1 / от 1 до 0 */
export const RAINPUD = { v: 0, FROM: 0.5, GROW: 70, DRY: 150 };
export const puddles = () => RAINPUD.v;
export function setWx (snow = null, wind = 0, wet = null) { WX.snow = snow; WX.wind = wind || 0; WX.wet = wet; }
export const blizzard = () => WX.wind;
/* жара (вариант погоды weather.js): 0 … 1 — трава выжжена (lawnprops.js красит пучки в солому) */
export const heatAmt = () => U.uHeat.value || 0;
/* река во льду (сёрферу там не место) */
export const iced = () => (A.snow || 0) > 0.25;

/* ─── юниформы: общие для всех сезонных материалов ─── */
const U = {
  uSnow: { value: 0 }, uDry: { value: 0 }, uMud: { value: 0 }, uFresh: { value: 0 }, uWet: { value: 0 },
  uPud: { value: 0 }, uPudR: { value: 0 },        // лужи на асфальте: сколько (0…1) и сила дождя сейчас — кольца (RAINPUD)
  uLeaf: { value: 1 }, uYellow: { value: 0 }, uFallen: { value: 0 }, uDrift: { value: 0 }, uNY: { value: 0 }, uIce: { value: 0 },
  uTime: { value: 0 }, uNight: { value: 0 },
  uHeat: { value: 0 }, uGold: { value: 0 },     // варианты сезона (weather.js): жара, яркая сухая осень
  uBloom: { value: 0 }, uBerry: { value: 0 },  // цветы сирени, ягоды рябины (trees.js): вид 5 и 6 в PILE
  uGale: { value: 0 }, uGaleD: { value: [1, 0] },   // ураган (hurricane.js): кроны клонит по ветру, м
  uYardP: { value: [-1, -1, -1] },              // цвет-метка дворовых дорожек (yards.js YARD.COLOR) — как его хранит склейка
};
/* ураган: насколько клонит кроны (м, 0 — тихо) и куда дует (x, z) */
export function setGale (amp, dx = 1, dz = 0) { U.uGale.value = amp; U.uGaleD.value[0] = dx; U.uGaleD.value[1] = dz; }

/* Снег и краски земли. Нормаль грани — из производных мировой позиции:
   она всегда смотрит на камеру, поэтому у земли и крыш y > 0, у стен ~0.
   Классы по цвету вершины (цвета линейные): зелёное — трава, серое и
   тёмное — асфальт, синее — вода. */
const TINT = `
#ifdef USE_COLOR_ALPHA
#define S_LAND (vColor.a < 0.5)
#else
#define S_LAND true
#endif
uniform float uSnow, uDry, uMud, uFresh, uWet, uHeat, uGold, uTime, uPud, uPudR;
uniform vec3 uYardP;
varying vec3 vSW;
float sHash (vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sNoise (vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash(i), sHash(i + vec2(1.0, 0.0)), f.x), mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), f.x), f.y); }
/* хэш без синуса: на координатах в тысячи метров sin теряет точность и рисует ряды (листья лежали строем) */
float lHash (vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
/* опавший лист: в клетке s м — не больше одного, со случайным сдвигом, поворотом и размером (ряды не видны);
   есть ли — жребий против dens (0…1). 1 — точка на листе, pk — жребий цвета */
float leafAt (vec2 p, float s, float dens, float salt, out float pk) {
  vec2 q = p / s, c = floor(q) + salt, f = fract(q);
  pk = lHash(c + 31.0);
  if (lHash(c) >= dens) return 0.0;
  vec2 d = f - (vec2(lHash(c + 7.0), lHash(c + 13.0)) * 0.3 + 0.35);
  float a = lHash(c + 19.0) * 3.1416, ca = cos(a), sa = sin(a);
  d = vec2(d.x * ca - d.y * sa, d.x * sa + d.y * ca);
  float r = 0.17 + 0.15 * lHash(c + 23.0);
  return step(abs(d.x) / r + abs(d.y) / (r * 0.6), 1.0);
}
/* осенняя листва: 0 — золотая (берёза, липа), 1 — оранжевая, 2 — красная (клён, рябина), 3 — лимонная (тополь);
   чистые яркие цвета, у каждого комка чуть свой оттенок (зерно), золотая осень — ещё ярче */
vec3 autPal (float p, float seed) {
  vec3 a = p < 0.5 ? vec3(0.82, 0.52, 0.02) : p < 1.5 ? vec3(0.88, 0.28, 0.02) : p < 2.5 ? vec3(0.7, 0.07, 0.02) : vec3(0.66, 0.6, 0.04);
  a *= 0.86 + 0.28 * fract(seed * 13.7);
  return mix(a, a * vec3(1.12, 1.08, 1.0) + vec3(0.04, 0.02, 0.0), uGold);
}
vec3 seasonTint (vec3 c, float dryK, float snowK) {
  vec3 ydd = abs(c - uYardP);
  float yardP = step(max(ydd.r, max(ydd.g, ydd.b)), 0.0022);   // дворовая дорожка (цвет-метка)
  vec3 N = normalize(cross(dFdx(vSW), dFdy(vSW)));
  float up = smoothstep(0.42, 0.8, N.y);
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float sat = mx - mn, lum = dot(c, vec3(0.3, 0.55, 0.15));
  float green = smoothstep(0.05, 0.18, c.g - max(c.r, c.b)) * dryK;
  float water = smoothstep(0.08, 0.2, c.b - c.r) * step(c.g, c.b);
  float road = (1.0 - smoothstep(0.05, 0.12, sat)) * (1.0 - smoothstep(0.4, 0.62, lum));
  // шум пятен (снег, сухая трава, грязь): сетка шума повёрнута (37° и −53°), у двух октав — каждая по-своему,
  // Ровная сетка по осям мира рисовала пятна углами и клетками — снег лежал «квадратами» (О6, 09.10.2026)
  // крупная октава ещё и сдвинута мелкой (без лишних вызовов шума): край пятна извилистый, а не ромбом
  // (мелкая — ~2 м, а не ~1 м: метровые клетки шума по краю пятна читались ступеньками)
  float n2 = sNoise(mat2(0.6, -0.8, 0.8, 0.6) * vSW.xz * 0.5 + 17.0);
  float n = sNoise(mat2(0.8, 0.6, -0.6, 0.8) * vSW.xz * 0.23 + (n2 - 0.5) * 0.9) * 0.68 + n2 * 0.32;
  float g = green * up;
  // сухая трава осенью — золотисто-зелёная и жёлтая, чистая (не бурая): пятнами по шуму
  vec3 dryC = mix(vec3(0.38, 0.45, 0.05), vec3(0.80, 0.52, 0.04), smoothstep(0.3, 0.75, n)) * (0.88 + 0.26 * n);
  c = mix(c, mix(dryC, dryC * vec3(1.1, 1.06, 0.9), uGold), uDry * g * 0.8);
  c = mix(c, vec3(0.2, 0.15, 0.07), uMud * g * smoothstep(0.35, 0.65, n) * 0.85);
  c = mix(c, vec3(0.16, 0.52, 0.08), uFresh * g * 0.55);
  c *= 1.0 - uWet * (0.3 * road + 0.12 * g + 0.06) * up * (0.6 + 0.4 * n);
  if (uPud > 0.0) {                            // лужи на асфальте (12ам): копятся в дождь, растут в ливень, сохнут после (RAINPUD)
    float pn = sNoise(mat2(0.8, -0.6, 0.6, 0.8) * vSW.xz * 0.14 + 61.0) * 0.75 + n2 * 0.25;
    float pm = smoothstep(0.0, 0.035, pn - (0.93 - 0.26 * uPud)) * road * up;
    if (pm > 0.0) {
      // кольца от капель: в клетке 0,7 м — одно, расходится и гаснет; дальше 28 м не видно (не рябит)
      vec2 cq = vSW.xz * 1.4, cell = floor(cq), f = fract(cq) - 0.5 - (vec2(lHash(cell + 3.0), lHash(cell + 5.0)) - 0.5) * 0.4;
      float ph = fract(uTime * 1.1 + lHash(cell));
      float rip = (1.0 - smoothstep(0.0, 0.05, abs(length(f) - ph * 0.42))) * (1.0 - ph) * uPudR
        * (1.0 - smoothstep(12.0, 28.0, length(vSW.xz - cameraPosition.xz)));
      // вода отражает пасмурное небо: на тёмном асфальте — светлее, серо-голубая, по краю — тёмный мокрый ободок
      float rim = smoothstep(0.0, 0.035, pn - (0.93 - 0.26 * uPud) + 0.02) - pm;
      c = mix(c, vec3(0.4, 0.45, 0.53), pm * 0.7) * (1.0 - 0.35 * clamp(rim * road * up, 0.0, 1.0));
      c += vec3(0.22, 0.24, 0.26) * rip * pm;
    }
  }
  if (uGold > 0.0) {                           // яркая сухая осень: листья на асфальте — вразброс, кучками (то густо, то пусто)
    float clump = smoothstep(0.3, 0.8, sNoise(vSW.xz * 0.07 + 3.7)) * 0.75 + n * 0.25;
    float pk, pk2;
    float lf = max(leafAt(vSW.xz, 0.7, 0.08 + 0.6 * clump, 0.0, pk), leafAt(vSW.xz + 0.31, 0.53, 0.45 * clump * clump, 57.0, pk2));
    vec3 lcol = pk < 0.35 ? vec3(0.9, 0.42, 0.04) : pk < 0.7 ? vec3(0.95, 0.7, 0.08) : vec3(0.75, 0.14, 0.03);
    c = mix(c, lcol, uGold * road * up * lf);
  }
  if (uHeat > 0.0) {                           // жара: трава — песок, всё в оранжевый, марево над дальним асфальтом
    // выжженная трава: соломенная и сухая оливковая пятнами, кое-где ещё зелёная (не песок и не осень)
    vec3 burnt = mix(vec3(0.62, 0.52, 0.2), vec3(0.44, 0.43, 0.15), smoothstep(0.3, 0.7, n)) * (0.85 + 0.3 * n);
    c = mix(c, burnt, uHeat * g * (0.6 + 0.3 * smoothstep(0.25, 0.6, n)));
    c = mix(c, c * vec3(1.25, 0.92, 0.58) + vec3(0.07, 0.025, 0.0), uHeat * 0.6);   // всё теплее; 09.10.2026 — слабее (было 0,85: «оранжевый туман»)
    float dist = length(vSW.xz - cameraPosition.xz);
    float mir = road * up * smoothstep(28.0, 70.0, dist) * (1.0 - smoothstep(150.0, 260.0, dist));
    mir *= 0.55 + 0.45 * sin(vSW.x * 0.21 + vSW.z * 0.17 + uTime * 2.6) * sin(vSW.z * 0.33 - uTime * 1.9);
    c = mix(c, vec3(0.96, 0.82, 0.62), uHeat * clamp(mir, 0.0, 1.0) * 0.6);
  }
  float lim = uSnow * up * 1.35 * snowK - 0.22;
  float cov = (1.0 - smoothstep(lim - 0.1, lim + 0.1, n)) * (1.0 - water * 0.7);   // край проталины — мягкий (до 09.10 ±0,06)
  cov *= 1.0 - road * 0.55 * (0.45 + 0.55 * n);
  cov *= 1.0 - yardP * (0.45 + 0.3 * n);       // дворовая дорожка зимой протоптана: плитка проглядывает пятнами
  vec3 snowC = mix(vec3(0.88, 0.91, 0.97), vec3(0.46, 0.48, 0.52), road * 0.6);
  snowC = mix(snowC, vec3(0.66, 0.68, 0.72), yardP * 0.55);   // утоптанный снег — серее
  c = mix(c, vec3(0.55, 0.7, 0.8), uSnow * water * up * 0.85);
  return mix(c, snowC, cov);
}
`;
const WPOS = 'vSW = (modelMatrix * vec4(transformed, 1.0)).xyz;';

/* статика игры: земля (dry 1), реквизит и мелочь дворов */
function yardMark () {
  if (U.uYardP.value[0] >= 0 || !THREE) return;
  const c = new THREE.Color(YARD.COLOR);         // как Mesher кладёт цвет вершины: байтами
  U.uYardP.value = [Math.round(c.r * 255) / 255, Math.round(c.g * 255) / 255, Math.round(c.b * 255) / 255];
}
/* propK — склейка земли с реквизитом (game.js LITM, 17.10.2026): у вершин с признаком «реквизит» (четвёртый байт цвета,
   S_LAND ложно) сухость травы propK, у земли — dryK */
/* smashJ — в той же склейке и мелочь дворов (game.js smashToMesher, 17.10.2026): четвёртый байт цвета 254 — мелочь (сухость
   0,6), 128…253 — куст: 128 + палитра × 42 + зерно (0…41), листва — как у smashMat (aux) */
const SMJ_FRAG = (dryK, propK) => `
#ifdef USE_COLOR_ALPHA
float sjF = floor(vColor.a * 255.0 + 0.5);
if (sjF > 127.5 && sjF < 253.5) {
  float sjB = sjF - 128.0, sjP = floor(sjB / 42.0), sjS = (sjB - sjP * 42.0 + 0.5) / 42.0;
  vec3 c0 = diffuseColor.rgb;
  float leafy = smoothstep(0.03, 0.12, c0.g - max(c0.r, c0.b));
  vec3 c = mix(c0, autPal(min(sjP, 2.0), sjS), clamp(uYellow * 1.7 - sjS * 0.7, 0.0, 1.0));
  c = mix(c, vec3(0.13, 0.09, 0.06), clamp((1.0 - uLeaf) * 1.4 - sjS * 0.4, 0.0, 1.0));
  c = mix(c, vec3(0.2, 0.5, 0.08), uFresh * 0.5);
  diffuseColor.rgb = mix(c0, c, leafy);
}
float sjDry = S_LAND ? ${dryK.toFixed(2)} : sjF > 254.5 ? ${propK.toFixed(2)} : sjF > 253.5 ? 0.6 : 0.0;
#else
float sjDry = ${dryK.toFixed(2)};
#endif
diffuseColor.rgb = seasonTint(diffuseColor.rgb, sjDry, 1.0);`;
export function seasonMat (m, dryK = 1, propK, smashJ) {
  const dry = propK === undefined ? dryK.toFixed(2) : '(S_LAND ? ' + dryK.toFixed(2) + ' : ' + propK.toFixed(2) + ')';
  m.onBeforeCompile = sh => {
    yardMark();
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vSW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + WPOS);
    sh.fragmentShader = (smashJ ? 'uniform float uYellow, uLeaf;\n' : '') + TINT + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' +
      (smashJ ? SMJ_FRAG(dryK, propK === undefined ? dryK : propK) : 'diffuseColor.rgb = seasonTint(diffuseColor.rgb, ' + dry + ', 1.0);'));
  };
  m.customProgramCacheKey = () => 'season' + dryK + (propK === undefined ? '' : 'p' + propK) + (smashJ ? 's' : '');
  return m;
}

/* Мелочь дворов (SMASH): как статика, но у кустов (aux.x = 1) листва
   своя: осенью желтеет и краснеет, к зиме — голые бурые прутья под
   снежной шапкой, весной — свежая зелень. Листвой считаем только
   зелёные вершины: кашпо и цветы у пиццерии не перекрашиваются. */
function smashMat (m) {
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute vec4 aux;\nvarying vec3 vSW;\nvarying float vK, vP, vSeed;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvK = floor(aux.x * 255.0 + 0.5); vSeed = aux.y; vP = floor(aux.z * 255.0 + 0.5);')
        .replace('#include <project_vertex>', '#include <project_vertex>\n' + WPOS);
    sh.uniforms.uSeeP = SEE_U;
    sh.fragmentShader = 'uniform float uYellow, uLeaf;\nvarying float vK, vP, vSeed;\n' + TINT + BAYER_FN + SEE_FN + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      seeCut(vSW);                                    // между камерой и машиной — тает (seethru.js)
      if (vK == 1.0) {
        vec3 c0 = diffuseColor.rgb;
        float leafy = smoothstep(0.03, 0.12, c0.g - max(c0.r, c0.b));
        vec3 pal = autPal(min(vP, 2.0), vSeed);
        vec3 c = mix(c0, pal, clamp(uYellow * 1.7 - vSeed * 0.7, 0.0, 1.0));
        c = mix(c, vec3(0.13, 0.09, 0.06), clamp((1.0 - uLeaf) * 1.4 - vSeed * 0.4, 0.0, 1.0));
        c = mix(c, vec3(0.2, 0.5, 0.08), uFresh * 0.5);
        diffuseColor.rgb = mix(c0, c, leafy);
      }
      diffuseColor.rgb = seasonTint(diffuseColor.rgb, vK == 1.0 ? 0.0 : 0.6, 1.0);`);
  };
  m.customProgramCacheKey = () => 'seasonSmash';
  return m;
}

/* деревья, листья, сугробы, ёлки: aux = вид, зерно, палитра осени */
function pileMat () {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.defines = { MAT_LEAF: '' };                   // 2г11: зелень склейки (листва) — на просвет против солнца (materials.js)
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute vec4 aux;\nuniform float uLeaf, uFallen, uDrift, uNY, uGale, uTime, uBloom, uBerry, uSnow;\nuniform vec2 uGaleD;\nvarying vec3 vSW;\nvarying float vK, vP, vSeed;\n' + (WOOD_ON ? 'varying vec3 vFolN;\n' : '') +
      sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vK = floor(aux.x * 255.0 + 0.5); vSeed = aux.y; vP = floor(aux.z * 255.0 + 0.5);${WOOD_ON ? `
        vFolN = vec3(0.0, 1.0, 0.0);
        float fPp = mod(vP, 4.0);
        if (vK == 1.0 || (vK == 0.0 && abs(fPp - 2.0) < 0.5)) {   // листва и хвоя: нормаль вершины — октаэдром в aux (seasons.js octN), палитра — 2 младших бита
          float fU = floor(vP / 4.0) / 31.5 - 1.0, fV = aux.w * 2.0 - 1.0;
          vec3 fN = vec3(fU, 1.0 - abs(fU) - abs(fV), fV);
          if (fN.y < 0.0) fN.xz = (1.0 - abs(fN.zx)) * vec2(fN.x >= 0.0 ? 1.0 : -1.0, fN.z >= 0.0 ? 1.0 : -1.0);
          vFolN = normalize(fN); vP = fPp;
        } else transformed.y += aux.w * 1.275 * uSnow;   // снег обволакивает ветки (2г10, treeform.js): верх сечения ветки поднят на столько м зимой` : ''}
        if (uGale > 0.0 && vK == 1.0) transformed.xz += uGaleD * uGale * (0.72 + 0.28 * sin(uTime * 3.1 + vSeed * 41.0 + transformed.x * 0.07));   // ураган: крону клонит по ветру
        float lim = vK == 1.0 ? uLeaf : vK == 2.0 ? uFallen : vK == 3.0 ? uDrift : vK == 4.0 ? uNY : vK == 5.0 ? uBloom : vK == 6.0 ? uBerry : vK == 8.0 ? uSnow : 2.0;   // вид 8 — снежные шапки на лапах сосен (treeform.js)
        if (vSeed >= lim) transformed = vec3(0.0, -3000.0, 0.0);
        if (vK == 7.0 && uLeaf > vSeed) transformed = vec3(0.0, -3000.0, 0.0);   // вид 7 — ветки и прутья голой кроны (trees.js, зимние модели): видны, когда облетела листва`)
        .replace('#include <project_vertex>', '#include <project_vertex>\n' + WPOS);
    sh.uniforms.uSeeP = SEE_U;
    sh.fragmentShader = 'uniform float uYellow;\nvarying float vK, vP, vSeed;\n' + (WOOD_ON ? 'varying vec3 vFolN;\n' : '') + TINT + BAYER_FN + SEE_FN + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      if (vK != 2.0 && vK != 3.0) seeCut(vSW);       // между камерой и машиной — тает (seethru.js); листья и сугробы на земле — нет
      if (vK == 1.0) {
        vec3 pal = autPal(vP, vSeed);                 // яркая сухая осень — сочнее (uGold внутри)
        diffuseColor.rgb = mix(diffuseColor.rgb, pal, clamp(uYellow * 1.7 - vSeed * 0.7, 0.0, 1.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.72, 0.16), uFresh * 0.55);   // весна: молодая листва светлее
      }
      if ((vK == 0.0 || vK == 7.0) && vP > 0.5 && vP < 1.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.91, 0.97), uSnow);   // снег на верхней стороне веток (палитра 1 у ствола и веток — trees.js)
      float wEver = vK == 0.0 && vP > 1.5 && vP < 2.5 ? 1.0 : 0.0;   // хвоя новых сосен и елей (палитра 2, treeform.js): снег гуще
      float wFol = vK == 1.0 ? 1.0 : wEver;
      diffuseColor.rgb = seasonTint(diffuseColor.rgb, 0.0, wEver > 0.5 ? ${WOOD_ON ? '1.45' : '0.62'} : vK == 0.0 || vK == 4.0 || vK == 7.0 ? 0.62 : 1.0);`);
    if (WOOD_ON) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if (wFol > 0.5) {
        // мягкая крона (2г6): нормаль — плавная, от середины комка и кроны, свет без граней
        normal = normalize((viewMatrix * vec4(vFolN, 0.0)).xyz);
        // рваный край: у края силуэта (нормаль вбок к взгляду) листва — гроздьями, между ними просвет (шум в мире, ~0,4 м)
        float fFr = 1.0 - abs(dot(normal, normalize(vViewPosition)));
        float fD = length(vSW - cameraPosition);
        vec3 fQ = fract(floor(vSW * 2.6) * 0.1031); fQ += dot(fQ, fQ.yzx + 33.33);
        vec3 fQ2 = fract(floor(vSW * 5.2 + 0.5) * 0.1031); fQ2 += dot(fQ2, fQ2.yzx + 33.33);
        float fH = fract((fQ.x + fQ.y) * fQ.z) * 0.65 + fract((fQ2.x + fQ2.y) * fQ2.z) * 0.35;
        if (fH < smoothstep(${WOOD.EDGE[0].toFixed(2)}, ${WOOD.EDGE[1].toFixed(2)}, fFr) * ${WOOD.EDGE[2].toFixed(2)} * (1.0 - smoothstep(${WOOD.EDGE[3]}.0, ${WOOD.EDGE[4]}.0, fD))) discard;
      }`).replace('#include <lights_lambert_fragment>', `
      #if NUM_DIR_LIGHTS > 0
      if (wFol > 0.5) {                              // два тона кроны (2г6): грань к солнцу — теплее и светлее, в тени — холодная и тёмная
        float wNdl = dot(normal, directionalLights[ 0 ].direction);
        diffuseColor.rgb *= mix(vec3(0.56, 0.66, 0.82), vec3(1.12, 1.06, 0.8), smoothstep(-0.25, 0.6, wNdl));
      }
      #endif
      #include <lights_lambert_fragment>`);
  };
  m.customProgramCacheKey = () => 'seasonPile' + (WOOD_ON ? 'w' : '');
  return fakeShadowMat(m);
}

/* гирлянды: без света, мигают каждая лампочка по-своему, ночью ярче */
function garlandMat () {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.userData.glow = 1;                        // игра не темнит его ночью (FLAT_MATS)
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute vec4 aux;\nuniform float uNY;\nvarying float vPh;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vPh = aux.z; if (aux.y >= uNY) transformed = vec3(0.0, -3000.0, 0.0);`);
    sh.fragmentShader = 'uniform float uTime, uNight;\nvarying float vPh;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float tw = 0.5 + 0.5 * sin(uTime * (1.3 + fract(vPh * 7.3) * 2.6) + vPh * 40.0);
      diffuseColor.rgb *= mix(0.6, 1.0, uNight) * mix(0.45, 1.3, tw) + uNight * 0.45 * tw;`);
  };
  m.customProgramCacheKey = () => 'seasonGarland';
  return m;
}

/* нормаль листвы октаэдром (ось — вверх): u — 6 бит в aux.z над палитрой (2 бита), v — 8 бит в aux.w (pileMat разбирает) */
function octN (c, v0, nv, x, y, z, pal, nrm) {
  const w = nrm ? nrm.w : 0;
  for (let i = v0; i < v0 + nv; i++) {
    const px = c.p[i * 3], py = c.p[i * 3 + 1], pz = c.p[i * 3 + 2];
    let ax = px - x, ay = py - y, az = pz - z, l = Math.hypot(ax, ay, az) || 1;
    ax /= l; ay /= l; az /= l;
    if (w) {
      let bx = px - nrm.cx, by = py - nrm.cy, bz = pz - nrm.cz, m = Math.hypot(bx, by, bz) || 1;
      ax = ax * (1 - w) + bx / m * w; ay = ay * (1 - w) + by / m * w; az = az * (1 - w) + bz / m * w;
    }
    const s = Math.abs(ax) + Math.abs(ay) + Math.abs(az) || 1;
    let u = ax / s, v = az / s;
    if (ay < 0) { const u2 = (1 - Math.abs(v)) * (u >= 0 ? 1 : -1), v2 = (1 - Math.abs(u)) * (v >= 0 ? 1 : -1); u = u2; v = v2; }
    c.a[i * 4 + 2] = pal + (Math.round((u * 0.5 + 0.5) * 63) << 2);
    c.a[i * 4 + 3] = Math.round((v * 0.5 + 0.5) * 255);
  }
}

/* ─── своя склейка: клетки по сто метров, позиция + цвет + aux ─── */
function Pile (CH = CELL) {                      // CH — клетка склейки, м
  const cells = new Map();
  const col = new THREE.Color(), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), Sc = new THREE.Vector3();
  let tris = 0;
  const byNum = new Map(), RGB = new Map();         // клетка по числу (строка-ключ на каждую вещь стоила), цвет по строке — разобранный
  function cell (x, z) {
    const i = Math.floor(x / CH), j = Math.floor(z / CH), kn = (i + 50000) * 100000 + j + 50000;
    let c = byNum.get(kn);
    if (!c) {
      const k = i + ',' + j;
      c = cells.get(k);
      if (!c) cells.set(k, c = { k, n: 0, cap: 2048, p: new Float32Array(2048 * 3), c: new Uint8Array(2048 * 3), a: new Uint8Array(2048 * 4) });
      byNum.set(kn, c);
    }
    return c;
  }
  /* вершины шаблона после сдвига, поворота и масштаба — в массив out с o */
  function write (tpl, out, o, x, y, z, sx, sy, sz, rx, ry, rz) {
    M.compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz, 'YZX')), Sc.set(sx, sy, sz));
    const e = M.elements, nv = tpl.length / 3;
    for (let i = 0; i < nv; i++) {
      const vx = tpl[i * 3], vy = tpl[i * 3 + 1], vz = tpl[i * 3 + 2], q = o + i * 3;
      out[q] = e[0] * vx + e[4] * vy + e[8] * vz + e[12];
      out[q + 1] = e[1] * vx + e[5] * vy + e[9] * vz + e[13];
      out[q + 2] = e[2] * vx + e[6] * vy + e[10] * vz + e[14];
    }
  }
  function room (c, add) {
    if (c.n + add <= c.cap) return;
    while (c.n + add > c.cap) c.cap = Math.ceil(c.cap * 1.5);   // запас ×1,5 (был ×2: на телефоне ~28 МБ пустого из 90 к пику поздней сборки, 23.10.2026)
    const p = new Float32Array(c.cap * 3), cc = new Uint8Array(c.cap * 3), a = new Uint8Array(c.cap * 4);
    p.set(c.p); cc.set(c.c); a.set(c.a);
    c.p = p; c.c = cc; c.a = a;
  }
  return {
    /* tpl — неиндексированные вершины шаблона; поворот: X, потом Z, потом Y */
    /* возвращает, где лежат вершины: клетка и первая вершина */
    /* shade — низ куска темнее, верх светлее (кроны, trees.js): 0 — ровный цвет */
    /* lift — на сколько м поднять вершину зимой (по вершине шаблона, снег на ветках толще: treeform.js), liftK — множитель */
    /* nrm — мягкая листва (2г6, treeform.js): { cx, cy, cz, w } — центр кроны и доля «от центра кроны» в нормали (остальное —
       от середины комка x, y, z); у листвы (вид 1; вид 0 с палитрой 2 — хвоя) нормаль вершины пишется в aux.z (старшие 6 бит)
       и aux.w (8 бит) октаэдром — без лишней памяти; шейдер рисует крону плавно, без граней */
    add (tpl, x, y, z, sx, sy, sz, rx, ry, rz, hex, kind = 0, seed = 0, pal = 0, shade = 0, lift = null, liftK = 1, nrm = null) {
      const c = cell(x, z), nv = tpl.length / 3, v0 = c.n;
      room(c, nv);
      write(tpl, c.p, v0 * 3, x, y, z, sx, sy, sz, rx, ry, rz);
      let rgb = RGB.get(hex);
      if (rgb === undefined) {
        col.set(hex);
        rgb = (Math.round(col.r * 255) << 16) | (Math.round(col.g * 255) << 8) | Math.round(col.b * 255);
        if (typeof hex === 'string' || typeof hex === 'number') RGB.set(hex, rgb);
      }
      const r = rgb >> 16, g = (rgb >> 8) & 255, b = rgb & 255;
      const sd = Math.max(1, Math.min(254, Math.round(seed * 253) + 1));
      for (let i = v0; i < v0 + nv; i++) {
        const o = i * 3, q = i * 4;
        if (shade) {
          const f = 1 + shade * (0.6 * tpl[(i - v0) * 3 + 1] - 0.12);
          c.c[o] = Math.min(255, r * f); c.c[o + 1] = Math.min(255, g * f); c.c[o + 2] = Math.min(255, b * f);
        } else { c.c[o] = r; c.c[o + 1] = g; c.c[o + 2] = b; }
        c.a[q] = kind; c.a[q + 1] = sd; c.a[q + 2] = pal; c.a[q + 3] = lift ? Math.min(255, Math.round(lift[i - v0] * liftK * 200)) : 0;
      }
      if (WOOD_ON && (kind === 1 || (kind === 0 && pal === 2))) octN(c, v0, nv, x, y, z, pal, nrm);
      c.n += nv;
      tris += nv / 3;
      return { key: c.k, v0, nv };
    },
    write,
    tris: () => tris,
    /* keep — позиции остаются в памяти: их правят на ходу (сугробы). steps — то же шагами по 24 клетки
       (поздняя сборка, latebuild.js) */
    build (mat, keep) { const it = this.steps(mat, keep); for (;;) { const r = it.next(); if (r.done) return r.value; } },
    *steps (mat, keep) {
      const out = [];
      out.byKey = new Map();
      let i = 0;
      for (const c of cells.values()) {
        if (!c.n) continue;
        if (++i % 24 === 0) yield 'pile';
        const g = new THREE.BufferGeometry();
        const pa = new THREE.BufferAttribute(c.p.slice(0, c.n * 3), 3), ca = new THREE.BufferAttribute(c.c.slice(0, c.n * 3), 3, true), aa = new THREE.BufferAttribute(c.a.slice(0, c.n * 4), 4, true);
        g.setAttribute('position', pa); g.setAttribute('color', ca); g.setAttribute('aux', aa);
        g.computeBoundingSphere(); g.computeBoundingBox();          // коробка — для отсечения по кадру (cull.js)
        for (const at of keep ? [ca, aa] : [pa, ca, aa]) at.onUpload(dropArr);
        const m = new THREE.Mesh(g, mat);
        C.scene.add(m);
        out.push(m); out.byKey.set(c.k, m);
      }
      cells.clear(); byNum.clear();
      return out;
    },
    cells: () => cells,
    clear () { cells.clear(); byNum.clear(); },
    /* клетку уже переложили в склейку (jointSteps): её массивы — вон сразу, а не после всех клеток (на телефоне исходники
       деревьев и сугробов ~150 МБ жили рядом с готовыми склейками — пик поздней сборки, 23.10.2026) */
    drop (k) {
      const c = cells.get(k);
      if (!c) return;
      cells.delete(k);
      const [i, j] = k.split(',').map(Number);
      byNum.delete((i + 50000) * 100000 + j + 50000);
      c.p = c.c = c.a = null; c.n = c.cap = 0;
    },
    /* память клеток (отладка): МБ занято массивами / из них вершинами */
    mem () { let cap = 0, used = 0; for (const c of cells.values()) { cap += c.cap * 10; used += c.n * 10; } return { cells: cells.size, cap: +(cap / 1048576).toFixed(1), used: +(used / 1048576).toFixed(1) }; },
  };
}
function dropArr () { this.array = null; }

/* Несколько склеек с одним материалом — одним мешем на клетку (17.10.2026, docs/AGENTS.md «Слои статики»): сугробы, кучи
   листьев и деревья лежали тремя мешами в одной клетке 200 м — три вызова отрисовки вместо одного (~20 лишних в кадре
   на «Деке»). Видно их и так по шейдеру (вид и зерно в aux против uDrift / uFallen / uLeaf), прятать меш сугробов не нужно.
   piles — склейки по порядку, первые nKeep — «живые» (их вершины правят на ходу: сугробы разбиваются, листья — тоже):
   они идут в начале клетки, и после загрузки в видеокарту в памяти JS остаётся только их кусок позиций (как раньше —
   их отдельные массивы), а не вся клетка с деревьями. Ответ: меши и для каждой склейки — сдвиг её вершин в клетке
   (offs[i].get(ключ клетки) — прибавить к v0 записи). */
/* computeBoundingSphere + computeBoundingBox одним проходом по массиву (те же числа, что у three.js: центр — середина рамки,
   радиус — до самой дальней вершины): у three.js — через Vector3 на вершину, на Деке ~0,2 с за склейку сугробов */
function bounds (g) {
  const a = g.attributes.position.array, n = a.length;
  if (!n) { g.computeBoundingSphere(); g.computeBoundingBox(); return; }
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i += 3) {
    const x = a[i], y = a[i + 1], z = a[i + 2];
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5, cz = (z0 + z1) * 0.5;
  let r2 = 0;
  for (let i = 0; i < n; i += 3) { const dx = cx - a[i], dy = cy - a[i + 1], dz = cz - a[i + 2], d = dx * dx + dy * dy + dz * dz; if (d > r2) r2 = d; }
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), Math.sqrt(r2));
  g.boundingBox = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
}
function* jointSteps (piles, mat, nKeep) {
  const keys = new Set();
  for (const P of piles) for (const k of P.cells().keys()) keys.add(k);
  const out = [], offs = piles.map(() => new Map());
  out.byKey = new Map();
  let i = 0;
  for (const k of keys) {
    if (++i % 24 === 0) yield 'pile';
    let n = 0, nk = 0;
    const parts = piles.map((P, pi) => { const c = P.cells().get(k), cn = c ? c.n : 0; n += cn; if (pi < nKeep) nk += cn; return c; });
    if (!n) continue;
    let pp = new Float32Array(n * 3), cc = new Uint8Array(n * 3), aa = new Uint8Array(n * 4);
    let o = 0;
    for (let pi = 0; pi < parts.length; pi++) {
      const c = parts[pi];
      if (!c || !c.n) continue;
      pp.set(c.p.subarray(0, c.n * 3), o * 3); cc.set(c.c.subarray(0, c.n * 3), o * 3); aa.set(c.a.subarray(0, c.n * 4), o * 4);
      offs[pi].set(k, o);
      o += c.n;
    }
    for (const P of piles) P.drop(k);
    const g = new THREE.BufferGeometry();
    // ?nopileix — контрольная сборка без общих вершин, для замера памяти и вида.
    const t0 = performance.now();
    const indexed = /[?&]nopileix(&|$)/.test(location.search) ? null : indexPile(pp, cc, aa, nk);
    if (indexed) {
      pp = indexed.p; cc = indexed.c; aa = indexed.a;
      const ia = new THREE.BufferAttribute(indexed.index, 1);
      ia.onUpload(dropArr); g.setIndex(ia);
    }
    g.userData.pileIndex = { before: n, after: pp.length / 3, keep: nk, ms: performance.now() - t0,
      bytesBefore: n * 19, bytesAfter: pp.byteLength + cc.byteLength + aa.byteLength + (indexed ? indexed.index.byteLength : 0) };
    const pa = new THREE.BufferAttribute(pp, 3), ca = new THREE.BufferAttribute(cc, 3, true), xa = new THREE.BufferAttribute(aa, 4, true);
    g.setAttribute('position', pa); g.setAttribute('color', ca); g.setAttribute('aux', xa);
    bounds(g);
    ca.onUpload(dropArr); xa.onUpload(dropArr);
    pa.onUpload(nk ? keepHead(nk * 3) : dropArr);
    const m = new THREE.Mesh(g, mat);
    C.scene.add(m);
    out.push(m); out.byKey.set(k, m);
  }
  for (const P of piles) P.clear();
  return { out, offs };
}
/* после загрузки — только начало массива (живые вершины). three.js сверяет размер массива с буфером в видеокарте
   (byteLength) и правит буфер кусками (addUpdateRange: bufferSubData со сдвигом и в буфере, и в массиве), поэтому
   короткому массиву — прежний byteLength: правки живых вершин ложатся куда надо, остальное в видеокарте не трогается */
function keepHead (len) {
  return function () {
    const a = this.array;
    if (!a || a.length <= len) return;
    const h = a.slice(0, len);
    Object.defineProperty(h, 'byteLength', { value: a.byteLength });
    this.array = h;
  };
}

/* шаблоны: коробка, икосаэдр, конус, плашка стоймя (+Z) и лёжа (вверх) */
let TPL = null;
function tpls () {
  if (TPL) return TPL;
  const arr = g => { const a = (g.index ? g.toNonIndexed() : g).attributes.position.array; return Float32Array.from(a); };
  TPL = {
    box: arr(new THREE.BoxGeometry(1, 1, 1)), ico: arr(new THREE.IcosahedronGeometry(1, 0)),
    cone: arr(new THREE.ConeGeometry(1, 1, 7, 1, true)), quad: arr(new THREE.PlaneGeometry(1, 1)),
    flat: arr(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
    mound: moundTpl(),
    // стволы и ветки без торцов (8 треугольников вместо 12) и ягоды-октаэдры (8 вместо 20) — trees.js
    stick: arr(new THREE.CylinderGeometry(0.7071, 0.7071, 1, 4, 1, true).rotateY(Math.PI / 4)),
    oct: arr(new THREE.OctahedronGeometry(1, 0)),
  };
  return TPL;
}

/* Сугроб: пятиугольник у земли, кольцо выше и уже, макушка. Обход граней —
   наружу (снизу его не видно, дна нет). */
function moundTpl () {
  const rim = [], ring = [], out = [];
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2, b = a + Math.PI / 5;
    rim.push([Math.cos(a), -0.08, Math.sin(a)]); ring.push([Math.cos(b) * 0.62, 0.7, Math.sin(b) * 0.62]);
  }
  const top = [0, 1, 0];
  const tri = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (a[0] + b[0] + c[0]) / 3, my = (a[1] + b[1] + c[1]) / 3 - 0.2, mz = (a[2] + b[2] + c[2]) / 3;
    out.push(...a, ...(nx * mx + ny * my + nz * mz > 0 ? [...b, ...c] : [...c, ...b]));
  };
  for (let i = 0; i < 5; i++) {
    const j = (i + 1) % 5;
    tri(rim[i], rim[j], ring[i]); tri(ring[i], rim[j], ring[j]); tri(ring[i], ring[j], top);
  }
  return Float32Array.from(out);
}

/* детерминированный шум от точки: одно и то же дерево на одном месте */
function hsh (x, z, k = 0) {
  let h = Math.imul(Math.round(x * 16) ^ 0x27d4eb2d, 0x9E3779B1) ^ Math.imul(Math.round(z * 16) + k * 1013904223, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function rngAt (x, z, k = 0) {
  let a = (hsh(x, z, k) * 4294967296) >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let q = a;
    q = Math.imul(q ^ (q >>> 15), q | 1);
    q ^= q + Math.imul(q ^ (q >>> 7), q | 61);
    return ((q ^ (q >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = (a, b) => a + Math.random() * (b - a);
const pickR = (r, a) => a[(r() * a.length) | 0];

/* ─────────────── инициализация ─────────────── */
let PILE = null, GARL = null, DRIFTP = null, DRIFT_MESH = [], LEAFP = null, LEAF_MESH = [];
const DECID = [], SPRUCES = [], SEA_ITEMS = [], DRIFTS = new Map(), LEAVES = new Map(), FIRS = [], FIGHT_SPOTS = [];
const SLIDES = [];
/* ледяные горки дворов { x, z, ry, H, L, k, it } — на них катаются люди (yardlife.js) */
export const slides = () => SLIDES;
let MESH_GARL = [], MESH_PILE = [];
/* ?nojoint — сугробы, листья и деревья по-старому, тремя мешами на клетку (для замера «до/после») */
const JOINT_OFF = typeof location !== 'undefined' && /[?&]nojoint(&|$)/.test(location.search);
const BUILT = { trees: 0, pile: 0, garl: 0, drifts: 0, bulbs: 0, items: 0 };

/* ctx: THREE, scene, cam, renderer, Store, MAP, CITY, V, S, groundH, curbAt, nearestRoad, roadWidth, drivable,
   inHouse, inPoly, inBounds, put, smashAdd, SMASH, SMASH_MAT, LAMP_SPOTS, ZEBRAS, NODE_IDX, nodeDeg,
   makeHuman, dropMesh, gibHuman, toast, Snd, CAR_L, CAR_W, isPlaying, sayBubble; геттеры: PIZZA, ENV, rainLines, hemi */
/* память склеек до их сборки (отладка, __dlv.SEASMEM) */
export const pileMem = () => ({ pile: PILE && PILE.mem(), drift: DRIFTP && DRIFTP.mem(), leaf: LEAFP && LEAFP.mem(), garl: GARL && GARL.mem(),
  index: MESH_PILE.map(m => m.geometry.userData.pileIndex).filter(Boolean) });
export function initSeasons (ctx) {
  C = ctx; THREE = ctx.THREE;
  const q = new URLSearchParams(location.search).get('season');
  if (q !== null && q !== '' && !Number.isNaN(+q)) { SEA = wrap(+q); FORCED = true; }
  else readSaved();
  PILE = Pile(); GARL = Pile(CELL * 2); DRIFTP = Pile(); LEAFP = Pile();   // гирлянды редкие и мелкие — клетки 400 м (17.10.2026): вдвое меньше вызовов, лишних вершин за кадром — мало
  smashMat(C.SMASH_MAT);
  apply();
}

/* новая смена карьеры: сезон, который выпал жребием (weather.js shiftStart); сугробы снова целые */
export function shiftSeason (v) {
  if (FORCED) return;
  SEA = wrap(+v || 0);
  healDrifts();
  C.Store.set('dlv-season', SEA);
  apply();
}
/* forced — дальше не трогать (песочница, ?season=). Быстрый заезд (quickrun.js) ставит свой сезон
   и потом возвращает прежний с прежним forced — сохранение не трогается.
   Заход в игру сезон не сдвигает (до 11.10.2026 — +полсмены календаря): какой был на последней смене */
function readSaved () {
  const saved = C.Store.get('dlv-season', null);
  SEA = wrap(saved === null || saved === undefined ? 2.5 : +saved || 0);   // новичок в меню — зима (13.10.2026, «по базе зима»)
}
/** сменили профиль без перезагрузки (game.js reprofile): сезон — сохранённый у нового профиля (как при входе в игру) */
export function reloadSaved () { if (!C || FORCED) return; readSaved(); apply(); }
export function setSeason (v, forced = true) { SEA = wrap(+v); FORCED = !!forced; apply(); }
export const seasonForced = () => FORCED;
function wrap (v) { return Math.round(((v % 4) + 4) % 4 * 1e5) / 1e5 % 4; }

/* Вариант сезона на смену (weather.js): поверх кривых — свои доли. v: { snow, leaf, yellow, …: число или
   f(было) → стало; heat, gold — юниформы жары и яркой осени; snowfall — снегопад не реже этой силы }.
   null — как по календарю. */
let VAR = null;
export function setVariant (v) { VAR = v || null; apply(); }
function apply () {
  for (const k in K) A[k] = K[k](SEA);
  if (VAR) for (const k in K) if (VAR[k] !== undefined) A[k] = typeof VAR[k] === 'function' ? VAR[k](A[k]) : VAR[k];
  U.uHeat.value = (VAR && VAR.heat) || 0; U.uGold.value = (VAR && VAR.gold) || 0;
  U.uSnow.value = A.snow; U.uDry.value = A.dry; U.uMud.value = A.mud; U.uFresh.value = A.fresh; U.uWet.value = A.wet;
  U.uLeaf.value = A.leaf; U.uYellow.value = A.yellow; U.uFallen.value = A.fallen; U.uDrift.value = A.drift;
  U.uNY.value = A.ny; U.uIce.value = A.ice; U.uBloom.value = A.bloom; U.uBerry.value = A.berry;
  setPeopleSeason(A.warm);
  for (const m of MESH_GARL) m.visible = A.ny > 0.001;
  for (const m of DRIFT_MESH) m.visible = A.drift > 0.004;
  // новогодние ёлки стоят, пока видны (шейдер: зерно 4/255 < uNY)
  for (const f of FIRS) if (f.solid) f.solid.hw = f.solid.hd = A.ny > 0.016 ? f.hw : -50;     // -50 — «препятствия нет», как в игре
  // ледяные горки и снеговики: вне зимы вершины — в точку
  for (const it of SEA_ITEMS) {
    if (!it.mesh || !it.seaPos) continue;
    const want = it.seaSeed < A.ice;
    const pos = it.mesh.geometry.attributes.position, a = pos.array;
    if (!a) continue;
    if (!want && !it.down) {
      const gy = C.groundH(it.x, it.z);
      for (let i = it.v0; i < it.v0 + it.nv; i++) { a[i * 3] = it.x; a[i * 3 + 1] = gy - 1; a[i * 3 + 2] = it.z; }
      it.down = 1; it.seaOff = 1; pos.needsUpdate = true;
    } else if (want && it.seaOff) {
      a.set(it.seaPos, it.v0 * 3);
      it.down = 0; it.seaOff = 0; pos.needsUpdate = true;
    }
  }
}

/* ─────────────── деревья ───────────────
   Породы и как они выглядят — trees.js (growTree). Здесь — только где
   нельзя сажать у пиццерии и общая склейка PILE. kind — порода силой
   (группы во дворах и кусты под окнами), иначе — жребий по месту. */
let PZ_NEAR = null;
export function seasonTree (x, z, y, kind) {
  // у пиццерии: не в столиках, кашпо и заборчике и не на парковке курьеров
  const PZ = C.PIZZA;
  if (PZ && Math.hypot(x - PZ.bx, z - PZ.bz) < 90) {
    if (!PZ_NEAR) PZ_NEAR = C.SMASH.filter(it => Math.hypot(it.x - PZ.bx, it.z - PZ.bz) < 100);
    if (PZ_NEAR.some(it => Math.hypot(it.x - x, it.z - z) < (it.r || 1) + 1.6) || (C.COURIER_SLOTS || []).some(q => Math.hypot(q.x - x, q.z - z) < 4)) return false;
    if (startViewBlocked(PZ, x, z, 3.5)) return false;              // не заслоняет стартовый кадр
  }
  BUILT.trees++;
  // редактор города: где чьи куски склейки — чтобы «убрать» прятало дерево сразу (editlayer.js hideNow)
  const rec = EDL.ED.on ? [] : null;
  const P = rec ? { add (...a) { const q = PILE.add(...a); rec.push(q); return q; } } : PILE;
  const out = growTree({ P, T: tpls(), r: rngAt(x, z, 7), x, z, y, kind, seversk: C.MAP.id === 'seversk', CITY: C.CITY, inPoly: C.inPoly, DECID, SPRUCES, ground: (lx, lz) => C.groundH(lx, lz) + C.curbAt(lx, lz) });
  if (rec) EDL.edTree(x, z, rec);
  return out;
}

/* ─────────────── двор: ледяные горки и снеговики (до smashBuild) ─────────────── */
export function* seasonYard () {                  // шагами (latebuild.js): на Деке ~0,1 с одним куском
  const { CITY, put, smashAdd, SMASH, groundH, inHouse, inPoly, inBounds, nearestRoad } = C;
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const free = (x, z, m) => {
    if (!inBounds(x, z, -20) || inHouse(x, z, m)) return false;
    const n = nearestRoad(x, z, 7, 1);
    return !(n && n.d < n.seg.w / 2 + m + 1);
  };
  // то же, что SMASH.some(|dx| < d и |dz| < d), только по клеткам 8 м: перебор 25 тыс. мелочи на каждую пробу
  // съедал ~0,35 с на Деке. Новое в SMASH (горки, снеговики) дописываем в клетки перед каждым вопросом
  const SG = new Map(), SGC = 8;
  let sgN = 0;
  const nearSmash = (x, z, d) => {
    for (; sgN < SMASH.length; sgN++) {
      const it = SMASH[sgN];
      if (!Number.isFinite(it.x) || !Number.isFinite(it.z)) continue;
      const k = Math.floor(it.x / SGC) * 65536 + Math.floor(it.z / SGC);
      let a = SG.get(k);
      if (!a) SG.set(k, a = []);
      a.push(it);
    }
    for (let i = Math.floor((x - d) / SGC); i <= Math.floor((x + d) / SGC); i++)
      for (let j = Math.floor((z - d) / SGC); j <= Math.floor((z + d) / SGC); j++) {
        const a = SG.get(i * 65536 + j);
        if (a) for (const it of a) if (Math.abs(it.x - x) < d && Math.abs(it.z - z) < d) return true;
      }
    return false;
  };
  const track = () => { const it = SMASH[SMASH.length - 1]; it.seaSeed = 0.02 + hsh(it.x, it.z, 3) * 0.9; SEA_ITEMS.push(it); };
  const slideAt = (x, z, ry, big) => {
    const k = big ? 1.35 : 1, gy = groundH(x, z), g = [];
    const W = (lx, lz) => [x + lx * Math.cos(ry) + lz * Math.sin(ry), z - lx * Math.sin(ry) + lz * Math.cos(ry)];
    const H = 1.8 * k, L = 5.2 * k, tilt = Math.atan2(H - 0.1, L);
    let [px, pz] = W(0, 0);
    put(g, B(2.4 * k, H, 2.4 * k), '#dfe6ee', px, gy + H / 2, pz, 0, ry, 0);
    for (let i = 0; i < 3; i++) { [px, pz] = W(0, -1.2 * k - 0.4 - i * 0.45); put(g, B(1.2, H * (0.75 - i * 0.25), 0.5), '#d6dee8', px, gy + H * (0.75 - i * 0.25) / 2, pz, 0, ry, 0); }
    const cz = 1.2 * k + Math.cos(tilt) * L / 2;
    [px, pz] = W(0, cz); put(g, B(1.3, 0.28, L), '#a8d8f0', px, gy + H / 2 - 0.05, pz, tilt, ry, 0);
    for (const sd of [-1, 1]) { [px, pz] = W(sd * 0.78, cz); put(g, B(0.26, 0.55, L), '#dfe6ee', px, gy + H / 2 + 0.12, pz, tilt, ry, 0); }
    [px, pz] = W(0, 1.2 * k + L + 1.4); put(g, B(1.3, 0.06, 3), '#9fd0ea', px, gy + 0.06, pz, 0, ry, 0);
    [px, pz] = W(0, (1.2 * k + L) / 2 - 0.3);
    smashAdd('ice', px, pz, 2.2 * k, g, '#dfe6ee');
    track();
    const sl = { x, z, ry, H, L, k, it: SMASH[SMASH.length - 1] };   // it — сама горка в мелочи (снесли — it.down)
    FIGHT_SPOTS.push({ x: x + 5, z: z + 5, slide: sl });
    SLIDES.push(sl);
  };
  nearSmash(1e9, 1e9, 0);                          // клетки мелочи — сразу, своим шагом
  yield 'index';
  // площадки: горка рядом с песочницей; большие парки — побольше
  let slides = 0;
  for (const pl of CITY.green) {
    if ((pl.k !== 'play' && pl.k !== 'park') || slides > 80) continue;
    let cx = 0, cz = 0;
    for (const q of pl.p) { cx += q[0] / pl.p.length; cz += q[1] / pl.p.length; }
    const r = rngAt(cx, cz, 11);
    for (let tr = 0; tr < 8; tr++) {
      const a = r() * 6.283, d = 5 + r() * 6, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (!inPoly(x, z, pl.p) || !free(x, z, 3.2) || nearSmash(x, z, 4.5)) continue;
      slideAt(x, z, r() * 6.283, pl.k === 'park');
      slides++;
      break;
    }
  }
  // снеговики: у части подъездов, в скверах и парках
  let men = 0;
  const man = (x, z, ry) => {
    if (!free(x, z, 1.2) || nearSmash(x, z, 1.6)) return;
    const gy = groundH(x, z), g = [], r = rngAt(x, z, 5), k = 0.8 + r() * 0.45;
    const I = rr => new THREE.IcosahedronGeometry(rr * k, 1);
    put(g, I(0.62), '#e8edf3', x, gy + 0.5 * k, z);
    put(g, I(0.45), '#e8edf3', x, gy + 1.25 * k, z);
    put(g, I(0.32), '#e8edf3', x, gy + 1.82 * k, z);
    const fx = Math.sin(ry), fz = Math.cos(ry);
    put(g, new THREE.ConeGeometry(0.07 * k, 0.4 * k, 5), '#e8752a', x + fx * 0.45 * k, gy + 1.8 * k, z + fz * 0.45 * k, Math.PI / 2, ry, 0);
    for (const sd of [-1, 1]) put(g, B(0.07, 0.07, 0.05), '#1f1c1a', x + fx * 0.28 * k + fz * sd * 0.11 * k, gy + 1.93 * k, z + fz * 0.28 * k - fx * sd * 0.11 * k, 0, ry, 0);
    put(g, new THREE.CylinderGeometry(0.2 * k, 0.26 * k, 0.3 * k, 7), pickR(r, ['#d95d5d', '#4f7fd6', '#e0b13f', '#59b06a']), x, gy + 2.16 * k, z, 0.2, ry, 0);
    for (const sd of [-1, 1]) put(g, B(0.05, 0.05, 0.8 * k), '#6a4c32', x + fz * sd * 0.62 * k, gy + 1.35 * k, z - fx * sd * 0.62 * k, 0.5, ry + sd * 1.57, 0);
    smashAdd('snowman', x, z, 0.75 * k, g, '#e8edf3');
    track();
    men++;
  };
  yield 'slides';
  const E = CITY.entrances;
  for (let i = 0; i < E.length && men < 110; i++) {
    if (i && i % 2000 === 0) yield 'men';
    const [ex, ez, nx, nz] = E[i];
    if (hsh(ex, ez, 9) > 0.1) continue;
    const s = hsh(ex, ez, 2) < 0.5 ? 1 : -1;
    man(ex + nx * 5 + nz * 3.5 * s, ez + nz * 5 - nx * 3.5 * s, Math.atan2(nx, nz));
  }
  yield 'men';
  for (const pl of CITY.green) {
    if ((pl.k !== 'park' && pl.k !== 'green') || men > 150) continue;
    let cx = 0, cz = 0;
    for (const q of pl.p) { cx += q[0] / pl.p.length; cz += q[1] / pl.p.length; }
    if (hsh(cx, cz, 4) > (pl.k === 'park' ? 0.8 : 0.22) || !inPoly(cx, cz, pl.p)) continue;
    man(cx + 2, cz - 1.5, hsh(cx, cz, 8) * 6.28);
  }
  BUILT.items = SEA_ITEMS.length;
}

/* Форма сугроба (автор 23.10.2026, 0п22: «узкий высокий сугроб — нелепо, высокий всегда широкий»): ширина у основания
   (меньшая из двух, 2·W и 2·L — W, L — полуоси) не меньше DRIFT_RATIO высот. Выше — срезаем высоту, склоны пологие.
   Так же — сугробы снежной зимы (weather.js) и кучи листьев. narrowDrifts() — сколько сугробов сезона уже (проверка) */
export const DRIFT_RATIO = 2.5;
export const driftH = (H, W, L) => Math.min(H, 2 * Math.min(W, L) / DRIFT_RATIO);
export function narrowDrifts () {
  let n = 0;
  for (const m of [DRIFTS, LEAVES]) for (const list of m.values()) for (const d of list) if (2 * Math.min(d.W, d.L) < DRIFT_RATIO * d.H - 1e-6) n++;
  return n;
}

/* ─────────────── сугробы, ёлки, гирлянды — в конце сборки города ───────────────
   seasonSteps — итератором, шагами для поздней сборки (latebuild.js; при ?nolate — разом): на Деке весь
   кусок ~0,65 с, меню между шагами отвечает. Шаги — по счёту улиц и домов, не по времени */
export function* seasonSteps () {
  const { CITY, groundH, curbAt, nearestRoad, roadWidth, drivable, inHouse, inPoly, inBounds, ZEBRAS, NODE_IDX, nodeDeg, LAMP_SPOTS } = C;
  const T = tpls(), P = PILE, G = GARL;
  const svk = C.MAP.id === 'seversk';
  // копии вершин горок и снеговиков: чтобы вернуть их к зиме
  for (const it of SEA_ITEMS) if (it.mesh) it.seaPos = it.mesh.geometry.attributes.position.array.slice(it.v0 * 3, (it.v0 + it.nv) * 3);
  yield 'sea';
  // кусты: вид 1 и зерно в aux склеек мелочи — их листву красит smashMat
  const SMA = new Map();
  let nsm = 0;
  for (const it of C.SMASH) {
    if (++nsm % 5000 === 0) yield 'bush';
    if (!it.mesh || it.mesh.material !== C.SMASH_MAT) continue;
    let a = SMA.get(it.mesh);
    if (!a) { a = new Uint8Array(it.mesh.geometry.attributes.position.count * 4); SMA.set(it.mesh, a); }
    if (it.kind !== 'bush') continue;
    const sd = 1 + ((hsh(it.x, it.z, 61) * 253) | 0), pal = hsh(it.x, it.z, 62) < 0.5 ? 0 : hsh(it.x, it.z, 63) < 0.5 ? 1 : 2;
    for (let i = it.v0; i < it.v0 + it.nv; i++) { a[i * 4] = 1; a[i * 4 + 1] = sd; a[i * 4 + 2] = pal; }
    BUILT.bushes = (BUILT.bushes || 0) + 1;
  }
  for (const [m, a] of SMA) m.geometry.setAttribute('aux', new THREE.BufferAttribute(a, 4, true));
  yield 'bush';

  // ── сугробы вдоль улиц: за тротуаром, у перекрёстков и зебр не наваливаем
  const DRIFT_HEX = '#e6ebf2';
  // у пиццерии — не на парковке курьеров и не в столиках с заборчиком
  const PZ0 = C.PIZZA, SL = C.COURIER_SLOTS || [];
  const PZT = PZ0 ? C.SMASH.filter(it => Math.hypot(it.x - PZ0.bx, it.z - PZ0.bz) < 80) : [];
  const busy = (x, z) => PZ0 && Math.hypot(x - PZ0.bx, z - PZ0.bz) < 75 &&
    (SL.some(q => Math.hypot(q.x - x, q.z - z) < 9) || PZT.some(it => Math.hypot(it.x - x, it.z - z) < (it.r || 1) + 2.5));
  const drift = (x, z, L, H, W, ry, seed) => {
    if (busy(x, z) || onYard(x, z, Math.max(L, W) * 0.8)) return;   // на дворовые дорожки и выходы к тротуару — нет (yards.js)
    H = driftH(H, W, L);                                       // не уже 2,5 высоты (0п22)
    const y = groundH(x, z) + C.curbAt(x, z) + 0.02;
    const at = DRIFTP.add(T.mound, x, y, z, W, H, L, 0, ry, 0, DRIFT_HEX, 3, seed);
    const k = Math.floor(x / 20) + ',' + Math.floor(z / 20);
    if (!DRIFTS.has(k)) DRIFTS.set(k, []);
    DRIFTS.get(k).push({ x, y, z, L, H, W, ry, cs: Math.cos(ry), sn: Math.sin(ry), s: 1, t: 0, ...at, pile: DRIFTP,
      seed: Math.max(1, Math.min(254, Math.round(seed * 253) + 1)) / 255 });
    BUILT.drifts++;
    // осенью рядом — кучи листьев (по зерну видны, как опавшие листья: uFallen), пониже и рыжие. Не строем через
    // каждые 5 м, как валы: где-то кучки гуще, где-то пусто (пятна 9 и 23 м), сдвиг вдоль улицы ±1,8 м, размер ×0,5—1,4
    const clump = hsh(Math.floor(x / 23), Math.floor(z / 23), 96) * 0.6 + hsh(Math.floor(x / 9), Math.floor(z / 9), 97) * 0.4;
    if (hsh(x, z, 91) < 0.75 * clump * clump * 1.6) {
      const ja = (hsh(x, z, 98) - 0.5) * 3.6, k = 0.5 + hsh(x, z, 99) * 0.9, lx = x + Math.sin(ry) * ja, lz = z + Math.cos(ry) * ja;
      leafPile(lx, groundH(lx, lz) + C.curbAt(lx, lz) + 0.02, lz, L * 1.05 * k, H * 0.5 * (0.7 + 0.3 * k), W * 1.15 * (0.8 + 0.4 * hsh(x, z, 100)), ry + (hsh(x, z, 92) - 0.5) * 1.4, hsh(x, z, 93));
    }
  };
  const LEAF_HEX = ['#e8862a', '#f2b438', '#d8502a', '#eca232', '#e06a22'];   // яркие, не бурые (осень золотая, не грязная)
  const leafPile = (x, y, z, L, H, W, ry, seed) => {
    H = driftH(H, W, L);
    const at = LEAFP.add(T.mound, x, y, z, W, H, L, 0, ry, 0, LEAF_HEX[(hsh(x, z, 94) * LEAF_HEX.length) | 0], 2, seed);
    const k = Math.floor(x / 20) + ',' + Math.floor(z / 20);
    if (!LEAVES.has(k)) LEAVES.set(k, []);
    LEAVES.get(k).push({ x, y, z, L, H, W, ry, cs: Math.cos(ry), sn: Math.sin(ry), s: 1, t: 0, ...at, pile: LEAFP, leaf: true,
      seed: Math.max(1, Math.min(254, Math.round(seed * 253) + 1)) / 255 });
    BUILT.leaves = (BUILT.leaves || 0) + 1;
  };
  const PK = new Map();                                   // припаркованные — у бордюра вал не насыпаем
  for (const q of C.PARKED || []) { const k = Math.floor(q[0] / 10) + ',' + Math.floor(q[1] / 10); if (!PK.has(k)) PK.set(k, []); PK.get(k).push(q); }
  const parkedNear = (x, z) => { const i = Math.floor(x / 10), j = Math.floor(z / 10); for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) for (const q of PK.get(a + ',' + b) || []) if (Math.hypot(q[0] - x, q[1] - z) < 4.5) return true; return false; };
  const onAsphalt = (x, z, m) => { const n = nearestRoad(x, z, 7, 1); return n && n.d < n.seg.w / 2 + m; };
  // зебры по клеткам в 10 м (d — до 9 м): ответ тот же, что у перебора всех
  const ZG = new Map();
  for (const q of ZEBRAS) { const k = Math.floor(q.x / 10) * 100003 + Math.floor(q.z / 10); if (!ZG.has(k)) ZG.set(k, []); ZG.get(k).push(q); }
  const nearZebra = (x, z, d) => {
    for (let i = Math.floor((x - d) / 10); i <= Math.floor((x + d) / 10); i++)
      for (let j = Math.floor((z - d) / 10); j <= Math.floor((z + d) / 10); j++) {
        const a = ZG.get(i * 100003 + j);
        if (a) for (const q of a) if (Math.abs(q.x - x) < d && Math.abs(q.z - z) < d) return true;
      }
    return false;
  };
  const nearStop = (x, z) => (CITY.stops || []).some(q => Math.abs(q.p[0] - x) < 9 && Math.abs(q.p[1] - z) < 9);
  const RIDGES = svk ? 9000 : 3600, HEAPS = svk ? 1800 : 900, BANKS = svk ? 1300 : 650;
  let nRidge = 0, nHeap = 0, nBank = 0;
  const heapCells = new Set();
  let nRd = 0;
  for (const rd of CITY.roads) {
    if (++nRd % 30 === 0) yield 'roads';                   // шаг поздней сборки (latebuild.js)
    if (!drivable(rd) || rd.b || rd.c > 5) continue;
    const w = roadWidth(rd), off = w / 2 + 2.75 + 1.1;
    for (let i = 1; i < rd.p.length; i++) {
      const [x1, z1] = rd.p[i - 1], [x2, z2] = rd.p[i];
      const len = Math.hypot(x2 - x1, z2 - z1) || 1, ux = (x2 - x1) / len, uz = (z2 - z1) / len, ry = Math.atan2(ux, uz);
      const nA = NODE_IDX.get(x1 + ',' + z1), nB = NODE_IDX.get(x2 + ',' + z2);
      const endA = nA !== undefined && nodeDeg(nA) >= 3, endB = nB !== undefined && nodeDeg(nB) >= 3;
      // вал вдоль бордюра: что счистил грейдер, лежит длинной грядой на кромке
      for (let d = 3; d < len - 2.5 && nRidge < RIDGES; d += 5.2) {
        if ((endA && d < 10) || (endB && len - d < 10)) continue;
        for (const sd of [-1, 1]) {
          const o = w / 2 + 0.4, x = x1 + ux * d - uz * o * sd, z = z1 + uz * d + ux * o * sd;
          if (hsh(x, z, 71) > 0.82 || !inBounds(x, z, -20) || inHouse(x, z, 0.8)) continue;
          const n = nearestRoad(x, z, 7, 1);
          if (n && n.d < n.seg.w / 2 - 0.2) continue;               // чужое полотно
          if (nearZebra(x, z, 7) || nearStop(x, z) || parkedNear(x, z)) continue;
          const r = rngAt(x, z, 72);
          drift(x, z, 2.2 + r() * 1.6, 0.3 + r() * 0.28, 0.55 + r() * 0.3, ry + (r() - 0.5) * 0.08, r());
          nRidge++;
        }
      }
      // за тротуаром — сугробы побольше
      for (let d = 4; d < len - 3 && nBank < BANKS; d += 11) {
        if ((endA && d < 13) || (endB && len - d < 13)) continue;
        for (const sd of [-1, 1]) {
          const x = x1 + ux * d - uz * off * sd, z = z1 + uz * d + ux * off * sd;
          if (hsh(x, z, 1) > 0.6 || !inBounds(x, z, -20) || inHouse(x, z, 1.4) || onAsphalt(x, z, 3.2) || nearZebra(x, z, 9)) continue;
          const r = rngAt(x, z, 6);
          drift(x, z, 1.5 + r() * 1.6, 0.5 + r() * 0.45, 0.9 + r() * 0.5, ry, r());
          nBank++;
        }
      }
    }
    // кучи на углах перекрёстков и у въездов во дворы: туда сгребают всё
    for (let i = 0; i < rd.p.length && nHeap < HEAPS; i++) {
      const [ex, ez] = rd.p[i], nd = NODE_IDX.get(ex + ',' + ez);
      if (nd === undefined || nodeDeg(nd) < 3) continue;
      for (const j of [i - 1, i + 1]) {
        if (j < 0 || j >= rd.p.length) continue;
        const dx = rd.p[j][0] - ex, dz = rd.p[j][1] - ez, l = Math.hypot(dx, dz);
        if (l < 12) continue;
        const ux = dx / l, uz = dz / l, along = 6.5 + w / 2, big = rd.c >= 4 ? 1.25 : 1;
        for (const sd of [-1, 1]) {
          const o = w / 2 + 1.9, x = ex + ux * along - uz * o * sd, z = ez + uz * along + ux * o * sd;
          const hk = Math.round(x / 4) + ',' + Math.round(z / 4);
          if (heapCells.has(hk) || !inBounds(x, z, -20) || inHouse(x, z, 1.2) || onAsphalt(x, z, 0.5) || nearZebra(x, z, 5) || parkedNear(x, z)) continue;
          heapCells.add(hk);
          const r = rngAt(x, z, 73);
          drift(x, z, (1.7 + r() * 1.1) * big, (0.75 + r() * 0.5) * big, (1.3 + r() * 0.7) * big, Math.atan2(ux, uz) + r() * 0.6, r() * 0.55);
          nHeap++;
        }
      }
    }
  }
  BUILT.ridges = nRidge; BUILT.heaps = nHeap; BUILT.banks = nBank;
  yield 'roads';
  // во дворах и парках
  let yd = 0, ng = 0;
  for (const pl of CITY.green) {
    if (++ng % 150 === 0) yield 'yard';
    if (yd > (svk ? 1000 : 500)) break;
    if (pl.k === 'water' || pl.k === 'pitch') continue;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const q of pl.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    const r = rngAt(x0, z0, 12), n = Math.min(8, Math.round((x1 - x0) * (z1 - z0) / 500));
    for (let i = 0; i < n; i++) {
      const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
      if (!inPoly(x, z, pl.p) || !inBounds(x, z, -20) || inHouse(x, z, 1.5)) continue;
      const nr = nearestRoad(x, z, 7, 1);
      if (nr && nr.d < nr.seg.w / 2 + 2) continue;
      drift(x, z, 1.2 + r() * 2.2, 0.4 + r() * 0.6, 1.0 + r() * 1.4, r() * 6.28, r());
      yd++;
    }
  }

  yield 'yard';
  // ── ёлки к Новому году: у пиццерии и в самых больших парках
  const firSpot = (x, z, need) => {
    if (!inBounds(x, z, -10) || inHouse(x, z, 5)) return false;
    const n = nearestRoad(x, z, 7, 1);
    return !(n && n.d < n.seg.w / 2 + need);
  };
  const PZ = C.PIZZA;
  if (PZ) {
    // тесно — ёлка поменьше, зато рядом и видна со старта
    let b = pizzaFirSpot(PZ, firSpot, 1.15), k = 1.15;
    if (!b || b[2] > 30) { const b2 = pizzaFirSpot(PZ, firSpot, 0.8); if (b2 && (!b || b2[2] < b[2])) { b = b2; k = 0.8; } }
    if (b) bigFir(b[0], b[1], k);
  }
  const parks = CITY.green.filter(g => g.k === 'park' || (g.k === 'green' && g.p.length > 6)).map(g => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, cx = 0, cz = 0;
    for (const q of g.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); cx += q[0] / g.p.length; cz += q[1] / g.p.length; }
    return { g, a: (x1 - x0) * (z1 - z0), cx, cz };
  }).sort((a, b) => b.a - a.a);
  let firs = 0;
  for (const p of parks) {
    if (firs >= (svk ? 7 : 4)) break;
    if (p.a < 2500 || !inPoly(p.cx, p.cz, p.g.p) || !firSpot(p.cx, p.cz, 8)) continue;
    if (FIRS.some(f => Math.hypot(f.x - p.cx, f.z - p.cz) < 250)) continue;
    bigFir(p.cx, p.cz, 1);
    firs++;
  }

  // ── гирлянды: по фасадам части домов — провисающими петлями над первым этажом
  const PAL_MULTI = ['#ff5a4a', '#ffd23f', '#5aff7a', '#5aa8ff', '#ff7ae0'], PAL_WARM = ['#ffe6a0', '#ffd98a', '#fff2c8'];
  let bulbs = 0;
  const BULB_CAP = svk ? 16000 : 9000;
  yield 'yardfir';
  let nB = 0;
  for (const b of CITY.buildings) {
    if (++nB % 400 === 0) yield 'garl';                    // шаг поздней сборки
    if (bulbs > BULB_CAP) break;
    if (b.k === 'gar' || b.k === 'ind' || b.k === 'church' || b.p.length < 3) continue;
    let cx = 0, cz = 0;
    for (const q of b.p) { cx += q[0] / b.p.length; cz += q[1] / b.p.length; }
    if (!inBounds(cx, cz, 0) || hsh(cx, cz, 21) > (svk ? 0.16 : 0.24)) continue;
    const r = rngAt(cx, cz, 22), multi = r() < 0.6, seed = 0.02 + r() * 0.95, hy = 3.1 + r() * 0.6;
    for (let i = 0; i < b.p.length; i++) {
      const a = b.p[i], c = b.p[(i + 1) % b.p.length];
      const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 4) continue;
      let nx = dz / len, nz = -dx / len;
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      if (inPoly(mx + nx * 0.5, mz + nz * 0.5, b.p)) { nx = -nx; nz = -nz; }        // наружу
      const ry = Math.atan2(nx, nz), span = 2.6;
      for (let d = 0.4; d < len - 0.3 && bulbs <= BULB_CAP; d += 0.62) {
        const x = a[0] + dx / len * d + nx * 0.14, z = a[1] + dz / len * d + nz * 0.14;
        const f = (d % span) / span, y = groundH(x, z) + hy - 1.6 * f * (1 - f);
        G.add(T.quad, x, y, z, 0.2, 0.2, 1, 0, ry, 0, multi ? PAL_MULTI[(d / 0.62 | 0) % PAL_MULTI.length] : pickR(r, PAL_WARM), 4, seed, (r() * 255) | 0);
        bulbs++;
      }
    }
  }
  // снежинок из лампочек у фонарей больше нет (автор 23.10.2026, 0п20): висели в воздухе у пятна света и оставались,
  // когда фонарь сбит, — свет фонаря только пятном на земле и горящим плафоном
  // ели у дорог — в гирлянде спиралью
  for (const f of SPRUCES) {
    if (hsh(f.x, f.z, 41) > 0.32) continue;
    const n = nearestRoad(f.x, f.z, 7, 1);
    if (!n || n.d > 22) continue;
    spiral(f.x, f.z, f.y + 1.1 * f.s * f.hs, 4.6 * f.s * f.hs, 2.5 * f.s, 0.7 * f.s, 34, 0.02 + hsh(f.x, f.z, 42) * 0.95, PAL_MULTI);
  }
  BUILT.bulbs = bulbs;
  yield 'garl2';
  BUILT.pile = PILE.tris(); BUILT.garl = GARL.tris();
  if (EDL.ED.on || JOINT_OFF) {
    MESH_PILE = yield* PILE.steps(pileMat(), EDL.ED.on);   // редактор: вершины деревьев — в памяти (прятать убранное на месте)
    if (EDL.ED.on) EDL.PILE_OF.get = key => MESH_PILE.byKey.get(key);
    yield 'pile';
  }
  MESH_GARL = yield* GARL.steps(garlandMat());
  yield 'garlmesh';
  if (EDL.ED.on || JOINT_OFF) {
    // сугробы — отдельно: их позиции живые (разбиваются и отрастают)
    DRIFT_MESH = yield* DRIFTP.steps(MESH_PILE[0] ? MESH_PILE[0].material : pileMat(), true);
    for (const list of DRIFTS.values()) for (const d of list) d.mesh = DRIFT_MESH.byKey.get(d.key);
    yield 'drift';
    LEAF_MESH = yield* LEAFP.steps(MESH_PILE[0] ? MESH_PILE[0].material : pileMat(), true);
    for (const list of LEAVES.values()) for (const d of list) d.mesh = LEAF_MESH.byKey.get(d.key);
    yield 'drift';
  } else {
    // сугробы, кучи листьев и деревья — одним мешем на клетку (jointSteps): живые сугробы и листья — в начале клетки
    const J = yield* jointSteps([DRIFTP, LEAFP, PILE], pileMat(), 2);
    MESH_PILE = J.out; DRIFT_MESH = []; LEAF_MESH = [];
    for (const list of DRIFTS.values()) for (const d of list) { d.mesh = J.out.byKey.get(d.key); d.v0 += J.offs[0].get(d.key) || 0; }
    for (const list of LEAVES.values()) for (const d of list) { d.mesh = J.out.byKey.get(d.key); d.v0 += J.offs[1].get(d.key) || 0; }
    yield 'pile';
  }
  // гирлянды, сугробы, снег и комья впервые появятся посреди зимы — на сцене заранее: их программы собирает
  // кусок поздней сборки 'shaders' (game.js; renderer.compile берёт и невидимое). Свой compile тут был лишним —
  // 60—120 мс «меню не отвечает» на Деке (10.10.2026, docs/AGENTS.md «Шейдеры на ходу»)
  initSky();
  chunks(0, -500, 0, 1, 0, 0);
  yield 'sky';
  const warm = [...MESH_GARL, ...DRIFT_MESH, ...LEAF_MESH, SNOWF, SPLASH.pts, ...CHUNKS.map(c => c.m)];
  for (const m of warm) m.visible = true;
  for (const c of CHUNKS) { c.life = 0; c.m.visible = false; }
  SNOWF.visible = false;
  yield 'compile';
  apply();
}
/* Стартовый кадр (V.hero в camStep): камера в 10 м перед машиной на месте 0
   и в 6 м вбок, смотрит на машину и пиццерию. */
function heroViews () {
  const s0 = (C.COURIER_SLOTS || [])[0];
  if (!s0) return [];
  const fx = Math.sin(s0.h), fz = Math.cos(s0.h), rx = Math.cos(s0.h), rz = -Math.sin(s0.h);
  return [1, -1].map(sd => [s0.x + fx * 10 + rx * 6 * sd, s0.z + fz * 10 + rz * 6 * sd]);
}
const segD = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
};
function startViewBlocked (PZ, x, z, r) {
  const s0 = (C.COURIER_SLOTS || [])[0];
  if (!s0) return false;
  return heroViews().some(([cx, cz]) => segD(x, z, cx, cz, PZ.bx, PZ.bz) < r || segD(x, z, cx, cz, s0.x, s0.z) < r);
}
/* Ёлка у пиццерии: не на парковке курьеров, не в столиках и заборчике,
   не в чужом препятствии и не между стартовой камерой и машиной с
   пиццерией. Из годных — та, что ближе к пиццерии и видна со старта. */
function pizzaFirSpot (PZ, firSpot, k) {
  const R = 4.9 * k, slots = C.COURIER_SLOTS || [];
  const near = (x, z, d) => Math.hypot(x - PZ.bx, z - PZ.bz) < d;
  const things = C.SMASH.filter(it => near(it.x, it.z, 90));
  const solids = C.SOLIDS.filter(q => near(q.cx, q.cz, 110) && q.deckY === undefined);
  const s0 = slots[0], views = heroViews();
  let best = null, bs = Infinity;
  for (let rr = 14; rr <= 46; rr += 3)
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * 6.283, x = PZ.bx + Math.cos(a) * rr, z = PZ.bz + Math.sin(a) * rr;
      if (!firSpot(x, z, 3.5 + k * 1.5)) continue;
      if (things.some(it => Math.hypot(it.x - x, it.z - z) < R + (it.r || 1) + 1)) continue;
      if (slots.some(q => Math.hypot(q.x - x, q.z - z) < R + 4)) continue;
      if (solids.some(q => { const dx = x - q.cx, dz = z - q.cz, lx = dx * q.cs + dz * q.sn, lz = -dx * q.sn + dz * q.cs; return Math.abs(lx) < q.hw + R + 1 && Math.abs(lz) < q.hd + R + 1; })) continue;
      if (startViewBlocked(PZ, x, z, R + 2)) continue;
      // видна со старта: в конусе от камеры к машине
      let sc = rr;
      if (s0) { const [cx, cz] = views[0], ux = s0.x - cx, uz = s0.z - cz, vx = x - cx, vz = z - cz; const cs = (ux * vx + uz * vz) / (Math.hypot(ux, uz) * Math.hypot(vx, vz) || 1); if (cs < 0.8) sc += 25; }
      if (sc < bs) { bs = sc; best = [x, z, sc]; }
    }
  return best;
}
function spiral (x, z, y0, H, r0, r1, n, seed, pal) {
  const T = tpls();
  for (let i = 0; i < n; i++) {
    const f = i / n, a = f * 5 * 6.283 + hsh(x, z, 43) * 6.28, rr = r0 + (r1 - r0) * f + 0.12;
    const bx = x + Math.sin(a) * rr, bz = z + Math.cos(a) * rr;
    GARL.add(T.quad, bx, y0 + f * H, bz, 0.26, 0.26, 1, 0, a, 0, pal[i % pal.length], 4, seed, (hsh(bx, bz, 44) * 255) | 0);
  }
}
/* новогодняя ель: ярусы, шары, звезда, гирлянда; стоит только к Новому году (вид 4) */
function bigFir (x, z, k) {
  const T = tpls(), y = C.groundH(x, z), r = rngAt(x, z, 51);
  PILE.add(T.box, x, y + 0.8, z, 0.7 * k, 1.8, 0.7 * k, 0, 0, 0, '#5a4030', 4, 0.01);
  const L = [[4.6, 1.2], [3.9, 3.2], [3.1, 5.1], [2.3, 6.9], [1.5, 8.5], [0.8, 9.8]];
  L.forEach(([rr, b], i) => PILE.add(T.cone, x, y + (b + 1.5) * k, z, rr * k, 3.0 * k, rr * k, 0, i * 0.5, 0, i % 2 ? '#2a6a3a' : '#245e34', 4, 0.01));
  const BALLS = ['#e04836', '#ffd23f', '#4f7fd6', '#e0e0f0', '#c94ad0'];
  for (let i = 0; i < 26; i++) {
    const f = r(), a = r() * 6.283, h = 1.0 + f * 9.0, rr = (4.6 - f * 3.9) * 0.93 * k;
    PILE.add(T.ico, x + Math.sin(a) * rr, y + (h + 0.2) * k, z + Math.cos(a) * rr, 0.28 * k, 0.28 * k, 0.28 * k, 0, 0, 0, BALLS[i % BALLS.length], 4, 0.01);
  }
  // звезда: два ромба крестом
  for (const ry of [0, Math.PI / 2]) GARL.add(T.quad, x, y + 12.2 * k, z, 1.1 * k, 1.1 * k, 1, 0, ry, Math.PI / 4, '#ffcf3a', 4, 0.01, 0);
  spiral(x, z, y + 1.2 * k, 9.4 * k, 4.7 * k, 0.9 * k, 150, 0.01, ['#ff5a4a', '#ffd23f', '#5aff7a', '#5aa8ff', '#ffe6a0']);
  // настоящее препятствие; вне праздников его уносим прочь (apply)
  FIRS.push({ x, z, hw: 3.1 * k, solid: C.obb ? Object.assign(C.obb(x, z, 3.1 * k, 3.1 * k, 0), { tree: 1 }) : null });   // tree — удар звучит деревом (impact.js)
}

/* ─────────────── живое: снег с неба, снежки, сугробы под колёсами ─────────────── */
let SNOWF = null, SPLASH = null, SKY = null;
const SF_N = 3200, SP_N = 420, SF_R = 38, SF_IN = 1400, SF_RI = 15;   // первые SF_IN — ближняя коробка: крупные хлопья у камеры
/* размер хлопьев в точках кадра: от MIN до MAX, всегда целое (дробный — то 2, то 3 точки по месту: мерцание), «мыло» не раздувает */
const SNOW_PC = { MIN: 2, MAX: 6, S: 1 };
/* Телефон (0п43, автор 24.10.2026: «снег на мобиле мерцает, вообще ничего не видно»): кадр там ~931×430 и сам экран маленький —
   хлопья в 2 точки и метель вбок 9,5 м/с при 30 к/с прыгали по 30—50 точек за кадр и рябили. Тут: N — доля хлопьев (реже),
   ближних из них — каждый NEAR-й (а не первые 1 400); MIN / MAX / S — размер крупнее; FADE — ближе этого (м) хлопок гаснет
   (самые быстрые по экрану); WIND — доля сноса вбок в метель (0,5 → ~5 м/с вместо 9,5) */
const SNOW_PH = { N: 0.5, NEAR: 3, MIN: 3, MAX: 8, S: 1.3, FADE: [1.5, 4], WIND: 0.5 };
const SNOW_K = MOBILE ? SNOW_PH : SNOW_PC;
function initSky () {
  const g = new THREE.BufferGeometry();
  // хлопья — в мировых координатах, в коробке вокруг камеры (чуть впереди);
  // ушедшие из коробки — на другом её краю: едешь — снег летит навстречу.
  // Движение — в вершинном шейдере (11.10.2026; раньше — цикл по 3 200 хлопьям и перезапись буфера каждый кадр):
  // место = начальное + снос ветром (uDx) + покачивание + падение (uFall × своя скорость), по модулю коробки вокруг камеры.
  // В буфере неизменное: начальное место; aS — своя скорость падения (0,7…1,18), ближняя ли коробка, фаза покачивания.
  const p = new Float32Array(SF_N * 3), sa = new Float32Array(SF_N * 3);
  for (let i = 0; i < SF_N; i++) {
    p[i * 3] = rnd(-SF_R, SF_R); p[i * 3 + 1] = rnd(-10, 30); p[i * 3 + 2] = rnd(-SF_R, SF_R);
    sa[i * 3] = 0.7 + (i % 5) * 0.12; sa[i * 3 + 1] = (MOBILE ? i % SNOW_PH.NEAR === 0 : i < SF_IN) ? 1 : 0; sa[i * 3 + 2] = i % 6.283185307;
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('aS', new THREE.BufferAttribute(sa, 3));
  /* Своя точка: ближние крупнее, с серо-голубой каймой — иначе белое на
     белом поле и бледном небе не видно; дальние — по пикселю. */
  const m = new THREE.ShaderMaterial({
    uniforms: { uOp: { value: 0 }, uNight: U.uNight, uS: { value: 64 }, uFall: { value: 0 }, uDx: { value: 0 }, uW: { value: 0 },
      uO: { value: new THREE.Vector3() }, uOi: { value: new THREE.Vector3() }, uK: { value: 1 } },
    vertexShader: `uniform float uS, uFall, uDx, uW, uK; uniform vec3 uO, uOi; attribute vec3 aS; varying float vD;
      void main () {
        bool nr = aS.y > 0.5;
        vec3 o = nr ? uOi : uO;
        float R = nr ? ${SF_RI.toFixed(1)} : ${SF_R.toFixed(1)}, lo = o.y - (nr ? 8.0 : 12.0), span = nr ? 22.0 : 42.0;
        vec3 q = vec3(position.x + uDx - 0.44444 * cos(uW * 0.9 + aS.z), position.y - uFall * aS.x, position.z);
        q.x = o.x - R + mod(q.x - o.x + R, 2.0 * R);
        q.z = o.z - R + mod(q.z - o.z + R, 2.0 * R);
        q.y = lo + mod(q.y - lo, span);
        vec4 mv = modelViewMatrix * vec4(q, 1.0); gl_Position = projectionMatrix * mv; vD = -mv.z; gl_PointSize = floor(max(clamp(uS / max(vD, 0.5), ${SNOW_K.MIN.toFixed(1)}, ${SNOW_K.MAX.toFixed(1)}) * uK, ${SNOW_K.MIN.toFixed(1)}) + 0.5); }`,
    fragmentShader: `uniform float uOp, uNight; varying float vD;
      void main () { vec2 q = abs(gl_PointCoord * 2.0 - 1.0); float r = max(q.x, q.y);
        vec3 c = r > 0.52 && vD < 16.0 ? vec3(0.58, 0.66, 0.78) : vec3(1.0);
        c *= mix(1.0, 0.5, uNight);
        gl_FragColor = vec4(c, uOp * clamp(1.25 - vD / 60.0, 0.35, 1.0)${MOBILE ? ` * smoothstep(${SNOW_PH.FADE[0].toFixed(1)}, ${SNOW_PH.FADE[1].toFixed(1)}, vD)` : ''}); }`,
    transparent: true, depthWrite: false,
  });
  // «мягкие края» (fxaa.js) хлопья не трогают: трафарет 1, как у облачков с текстом (talk.js) — снежинка в 2—3 точки
  // после сглаживания то бледнела, то нет
  m.stencilWrite = true; m.stencilRef = 1; m.stencilFunc = THREE.AlwaysStencilFunc;
  m.stencilZPass = THREE.ReplaceStencilOp; m.stencilFail = m.stencilZFail = THREE.KeepStencilOp;
  CAM_DIR = new THREE.Vector3();
  SNOWF = new THREE.Points(g, m);
  SNOWF.frustumCulled = false; SNOWF.visible = false;
  C.scene.add(SNOWF);
  const g2 = new THREE.BufferGeometry();
  g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SP_N * 3).fill(-5000), 3));
  SPLASH = { pts: new THREE.Points(g2, new THREE.PointsMaterial({ color: 0xf4f8fc, size: 3, sizeAttenuation: false })), v: new Float32Array(SP_N * 3), life: new Float32Array(SP_N), i: 0, on: 0 };
  SPLASH.pts.frustumCulled = false;
  C.scene.add(SPLASH.pts);
  const forceSnow = new URLSearchParams(location.search).has('snow');              // ?snow — снег идёт сразу (проверка)
  SKY = { want: forceSnow ? 0.8 : 0, amt: forceSnow ? 0.8 : 0, t: forceSnow ? 9999 : rnd(10, 40), fall: 0.5, dx: 0.5, bg: new THREE.Color('#c6d0da'), fog: new THREE.Color('#e0e6ec'), gnd: new THREE.Color('#e4ebf2'), aut: new THREE.Color('#b8c6d0') };
  BALL_GEO = new THREE.IcosahedronGeometry(0.13, 0);
  BALL_MAT = new THREE.MeshLambertMaterial({ color: 0xf4f7fa, flatShading: true });
}
function splash (x, y, z, n, k = 1) {
  const S = SPLASH, a = S.pts.geometry.attributes.position.array;
  for (let j = 0; j < n; j++) {
    const i = S.i; S.i = (S.i + 1) % SP_N;
    a[i * 3] = x + rnd(-0.2, 0.2); a[i * 3 + 1] = y; a[i * 3 + 2] = z + rnd(-0.2, 0.2);
    S.v[i * 3] = rnd(-2.2, 2.2) * k; S.v[i * 3 + 1] = rnd(1.5, 4.5) * k; S.v[i * 3 + 2] = rnd(-2.2, 2.2) * k;
    S.life[i] = rnd(0.5, 1.1);
  }
  S.on = 1.3;
}
function stepSplash (dt) {
  const S = SPLASH;
  if (S.on <= 0) return;
  S.on -= dt;
  const a = S.pts.geometry.attributes.position.array;
  for (let i = 0; i < SP_N; i++) {
    if (S.life[i] <= 0) continue;
    S.life[i] -= dt;
    S.v[i * 3 + 1] -= 9.8 * dt;
    a[i * 3] += S.v[i * 3] * dt; a[i * 3 + 1] += S.v[i * 3 + 1] * dt; a[i * 3 + 2] += S.v[i * 3 + 2] * dt;
    if (S.life[i] <= 0) a[i * 3 + 1] = -5000;
  }
  S.pts.geometry.attributes.position.needsUpdate = true;
}

/* снег с неба: вместо дождя, когда земля белая, и сам по себе иногда */
function stepSky (dt) {
  const ENV = C.ENV, rain = C.rainLines, hemi = C.hemi, scene = C.scene;
  const sn = A.snow || 0, night = ENV.night || 0;
  if (sn > 0.45) {
    if ((SKY.t -= dt) <= 0) { SKY.want = SKY.want ? 0 : Math.random() < 0.55 ? rnd(0.3, 0.7) : 0; SKY.t = SKY.want ? rnd(40, 90) : rnd(30, 80); }
    if (rain) rain.visible = false;                      // дождь зимой — это снег
  } else SKY.want = 0;
  const want = sn > 0.45 ? (WX.snow != null ? WX.snow : Math.max(SKY.want, ENV.rain || 0, (VAR && VAR.snowfall) || 0)) : 0;
  U.uWet.value = WX.wet != null ? Math.max(A.wet || 0, WX.wet) : A.wet || 0;   // ливень — асфальт мокрее (weather.js)
  // лужи на асфальте (12ам, 23.10.2026): в дождь (сила > FROM) копятся к силе дождя за ~GROW с (ливень — до 1, крупнее и
  // больше), стихло — сохнут за ~DRY с; снег — нет. Кольца от капель — пока идёт (uPudR)
  const pr = sn > 0.45 ? 0 : (ENV.rain || 0), pw = pr > RAINPUD.FROM ? pr : 0;
  RAINPUD.v = RAINPUD.v < pw ? Math.min(pw, RAINPUD.v + dt / RAINPUD.GROW) : Math.max(pw, RAINPUD.v - dt / RAINPUD.DRY);
  if (sn > 0.45) RAINPUD.v = 0;                  // зима — лужи под снегом сразу
  U.uPud.value = RAINPUD.v; U.uPudR.value = Math.min(1, pr * 1.2);
  SKY.amt += (want - SKY.amt) * (1 - Math.exp(-0.5 * dt));
  // небо: зимой бледнее, осенью чуть серее, свет от снега снизу
  const day = 1 - night;
  scene.background.lerp(SKY.bg, sn * 0.32 * day);
  if (scene.fog) scene.fog.color.lerp(SKY.fog, sn * 0.42 * day);
  if (A.dry > 0 && sn < 0.5) scene.background.lerp(SKY.aut, A.dry * 0.08 * day * (1 - sn) * (1 - U.uGold.value));   // осень чуть серее, золотая — нет
  if (hemi) hemi.groundColor.lerp(SKY.gnd, sn * 0.55);
  SNOWF.visible = SKY.amt > 0.02;
  if (!SNOWF.visible) return;
  const u = SNOWF.material.uniforms;
  u.uOp.value = Math.min(1, SKY.amt * 1.4);
  const cam = C.cam;
  cam.getWorldDirection(CAM_DIR);
  const hl = Math.sqrt(CAM_DIR.x * CAM_DIR.x + CAM_DIR.z * CAM_DIR.z) || 1, fx = CAM_DIR.x / hl, fz = CAM_DIR.z / hl, cp = cam.position;
  // хлопья двигает шейдер (initSky): тут только коробки вокруг камеры (дальняя — на 14 м вперёд, ближняя — на 6 м)
  // и пройденный путь; путь — по модулю, кратному всем коробкам и скоростям, чтобы число не росло и не было скачка
  u.uO.value.set(cp.x + fx * 14, cp.y, cp.z + fz * 14);
  u.uOi.value.set(cp.x + fx * 6, cp.y, cp.z + fz * 6);
  SKY.fall = (SKY.fall + (2.0 + SKY.amt * 1.6 + WX.wind * 1.4) * dt) % 46200;     // 46 200 м × любая скорость 0,7…1,18 — целое число высот коробок 22 и 42 м
  SKY.dx = (SKY.dx + (0.5 + WX.wind * 9 * (MOBILE ? SNOW_PH.WIND : 1)) * dt) % 1140;   // снос ветром 0,5 м/с (в метель — до 9,5, на телефоне ~5); 1 140 — кратно ширине коробок 30 и 76 м
  u.uFall.value = SKY.fall; u.uDx.value = SKY.dx;
  u.uS.value = 64 * SNOW_K.S * (1 + 0.45 * WX.wind);              // в метель хлопья крупнее (ближе к глазам)
  u.uK.value = DYN.k();                                           // «мыло»: кадр меньше и растянут — хлопок во столько же меньше
  u.uW.value = U.uTime.value % (6.283185307 / 0.9);                 // покачивание ±0,44 м с периодом 7 с
  SNOWF.geometry.setDrawRange(0, Math.floor(SF_N * (MOBILE ? SNOW_PH.N : 1) * Math.min(1, 0.35 + SKY.amt)));
}

/* Сугробы. Врезался на скорости — сугроб взрывается: белые комья,
   снежная пыль, мягкий глухой удар, машину ненадолго тормозит. От него
   остаётся плоский след, через минуту-полторы он отрастает (новая смена —
   все снова целые). Правим только вершины этого сугроба в его склейке. */
let driftT = 0, dragT = 0, redressT = 0, CAM_DIR = null, growT = 0;
const GROW = [];                                          // разбитые — ждут, пока отрастут
function driftShape (d, s) {
  const m = d.mesh;
  if (!m) return;
  const pa = m.geometry.attributes.position;
  if (!pa.array) return;
  (d.pile || DRIFTP).write(tpls().mound, pa.array, d.v0 * 3, d.x, d.y - (1 - s) * 0.05, d.z, d.W * (1 + (1 - s) * 0.25), d.H * s, d.L * (1 + (1 - s) * 0.15), 0, d.ry, 0);
  pa.addUpdateRange(d.v0 * 3, d.nv * 3);
  pa.needsUpdate = true;
  d.s = s;
}
function burstDrift (d, sp) {
  const V = C.V;
  driftShape(d, 0.18);
  d.t = rnd(55, 95);
  GROW.push(d);
  const vol = Math.min(1.6, d.L * d.W * d.H);
  splash(d.x, d.y + d.H * 0.6, d.z, 18 + (vol * 14 | 0), 1.3 + sp / 18);
  chunks(d.x, d.y + d.H * 0.5, d.z, 5 + (vol * 5 | 0), V.vx, V.vz);
  C.Snd.fx('snowdrift', s => { s.blip(70 + Math.random() * 25, 0.22, 'sine', 0.2); s.noise(0.22, 0.13); });
  C.S.shake = Math.max(C.S.shake || 0, 0.1 + Math.min(0.15, sp / 120));
  const k = 0.84 - Math.min(0.12, vol * 0.08);
  V.vx *= k; V.vz *= k;
  dragT = 0.28;
}
function stepCar (dt) {
  const V = C.V, sp = Math.hypot(V.vx, V.vz);
  driftT -= dt;
  if (dragT > 0) { dragT -= dt; const k = Math.exp(-1.8 * dt); V.vx *= k; V.vz *= k; }
  // отрастают понемногу
  if (GROW.length && (growT -= dt) <= 0) {
    growT = 0.25;
    for (let i = GROW.length - 1; i >= 0; i--) {
      const d = GROW[i];
      if ((d.t -= 0.25 * (1 + 3 * WX.wind)) > 0) continue;   // в метель отрастают быстрее (weather.js)
      const s = Math.min(1, d.s + 0.06 * (1 + 3 * WX.wind));
      driftShape(d, s);
      if (s >= 1) GROW.splice(i, 1);
    }
  }
  if (sp < 2.5) return;
  const ci = Math.floor(V.x / 20), cj = Math.floor(V.z / 20);
  // осенние кучи листьев: въехал — разлетаются, машину чуть тормозит, через минуту-полторы снова куча
  if (A.fallen > 0.01) for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
    for (const d of LEAVES.get(i + ',' + j) || []) {
      if (d.seed >= A.fallen || d.s < 0.5) continue;
      const dx = V.x - d.x, dz = V.z - d.z;
      if (Math.abs(dx) > d.L + 2.5 || Math.abs(dz) > d.L + 2.5) continue;
      const lx = dx * d.cs - dz * d.sn, lz = dx * d.sn + dz * d.cs;
      const ex = lx / (d.W + 1.0), ez = lz / (d.L + 1.2);
      if (ex * ex + ez * ez > 1) continue;
      burstLeaves(d, sp);
    }
  }
  if (A.drift < 0.01) return;
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
    for (const d of DRIFTS.get(i + ',' + j) || []) {
      if (d.seed >= A.drift || d.s < 0.5) continue;
      const dx = V.x - d.x, dz = V.z - d.z;
      if (Math.abs(dx) > d.L + 2.5 || Math.abs(dz) > d.L + 2.5) continue;
      const lx = dx * d.cs - dz * d.sn, lz = dx * d.sn + dz * d.cs;         // в осях сугроба
      const ex = lx / (d.W + 1.0), ez = lz / (d.L + 1.2);
      if (ex * ex + ez * ez > 1) continue;
      if (sp > 5) burstDrift(d, sp);
      else { const k = Math.exp(-1.4 * dt); V.vx *= k; V.vz *= k; if (driftT <= 0) { driftT = 0.15; splash(V.x, 0.4 + d.y, V.z, 5, 0.6); } }
    }
  }
}
/* верх видимого сугроба в точке — сбитые, лужи и пятна ложатся на него, а не внутрь (hits.js topAt).
   Профиль — как у модели кучи (moundTpl): вершина 1, на 0,62 радиуса — 0,7, край — у земли.
   Нет сугроба — -Infinity */
const EXTRA_TOP = [];
/* ещё сугробы со своим верхом (weather.js: снежная зима) */
export function addDriftTop (fn) { EXTRA_TOP.push(fn); }
export function driftTop (x, z) {
  let ex = -Infinity;
  for (const f of EXTRA_TOP) ex = Math.max(ex, f(x, z));
  return Math.max(ex, driftTop0(x, z));
}
function driftTop0 (x, z) {
  if ((A.drift || 0) < 0.01) return -Infinity;
  const ci = Math.floor(x / 20), cj = Math.floor(z / 20);
  let top = -Infinity;
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
    for (const d of DRIFTS.get(i + ',' + j) || []) {
      if (d.seed >= A.drift) continue;
      const dx = x - d.x, dz = z - d.z, s = d.s;
      const W = d.W * (1 + (1 - s) * 0.25), L = d.L * (1 + (1 - s) * 0.15);
      if (Math.abs(dx) > W + L || Math.abs(dz) > W + L) continue;
      const lx = dx * d.cs - dz * d.sn, lz = dx * d.sn + dz * d.cs;
      const e = Math.hypot(lx / W, lz / L);
      if (e >= 1) continue;
      const k = e < 0.62 ? 1 - 0.3 * e / 0.62 : 0.7 - 0.78 * (e - 0.62) / 0.38;
      const y = d.y - (1 - s) * 0.05 + d.H * s * k;
      if (y > top) top = y;
    }
  }
  return top;
}
function burstLeaves (d, sp) {
  const V = C.V;
  driftShape(d, 0.2);
  d.t = rnd(50, 90);
  GROW.push(d);
  leafBits(d.x, d.y + d.H * 0.5, d.z, 14 + Math.min(14, sp | 0), V.vx, V.vz);
  C.Snd.fx('leaves', s => s.noise(0.18, 0.09));
  V.vx *= 0.97; V.vz *= 0.97;
}
/* листья в воздухе: плоские рыжие квадратики из пула, кружат и падают */
const LEAF_BITS = [];
let LEAF_GEO = null;
function leafBits (x, y, z, n, vx, vz) {
  if (!LEAF_GEO) LEAF_GEO = new THREE.PlaneGeometry(0.22, 0.16);
  for (let k = 0; k < n; k++) {
    let b = LEAF_BITS.find(q => q.life <= 0);
    if (!b) {
      if (LEAF_BITS.length > 90) break;
      b = { m: new THREE.Mesh(LEAF_GEO, new THREE.MeshLambertMaterial({ color: 0xc9782a, side: THREE.DoubleSide })), life: 0 };
      C.scene.add(b.m);
      LEAF_BITS.push(b);
    }
    b.m.material.color.set(['#c9782a', '#d9a23a', '#a8452a', '#e0b13f'][(Math.random() * 4) | 0]);
    b.m.position.set(x + rnd(-0.8, 0.8), y, z + rnd(-0.8, 0.8));
    b.m.visible = true;
    b.vx = vx * rnd(0.15, 0.35) + rnd(-2.5, 2.5); b.vy = rnd(2, 5); b.vz = vz * rnd(0.15, 0.35) + rnd(-2.5, 2.5);
    b.spin = rnd(-8, 8); b.life = rnd(2.2, 3.6);
  }
}
function stepLeafBits (dt) {
  for (const b of LEAF_BITS) {
    if (b.life <= 0) continue;
    b.life -= dt;
    b.vy = Math.max(-1.1, b.vy - 6 * dt);                 // парусят: падают медленно
    b.vx *= 1 - dt * 1.2; b.vz *= 1 - dt * 1.2;
    b.m.position.x += (b.vx + Math.sin(b.life * 5) * 0.6) * dt; b.m.position.y += b.vy * dt; b.m.position.z += b.vz * dt;
    b.m.rotation.x += b.spin * dt; b.m.rotation.y += b.spin * 0.7 * dt;
    const g = C.groundH(b.m.position.x, b.m.position.z) + 0.05;
    if (b.m.position.y < g) { b.m.position.y = g; b.vy = 0; b.vx = b.vz = 0; b.spin = 0; }
    if (b.life <= 0) b.m.visible = false;
  }
}
/* новая смена: все сугробы снова целые */
function healDrifts () {
  for (const d of GROW) driftShape(d, 1);
  GROW.length = 0;
}
/* комья снега: несколько коробочек из пула, летят, падают, тают */
const CHUNKS = [];
let CHUNK_GEO = null, CHUNK_MAT = null;
function chunks (x, y, z, n, vx, vz) {
  if (!CHUNK_GEO) { CHUNK_GEO = new THREE.BoxGeometry(1, 1, 1); CHUNK_MAT = seasonMat(new THREE.MeshLambertMaterial({ color: 0xe8eef5, flatShading: true }), 0); }
  for (let i = 0; i < n; i++) {
    let c = CHUNKS.find(q => q.life <= 0);
    if (!c) { if (CHUNKS.length >= 40) break; c = { m: new THREE.Mesh(CHUNK_GEO, CHUNK_MAT), life: 0 }; C.scene.add(c.m); CHUNKS.push(c); }
    const sz = rnd(0.18, 0.42);
    c.m.scale.setScalar(sz); c.sz = sz; c.m.visible = true;
    c.m.position.set(x + rnd(-0.6, 0.6), y + rnd(0, 0.4), z + rnd(-0.6, 0.6));
    c.vx = vx * rnd(0.3, 0.7) + rnd(-3, 3); c.vz = vz * rnd(0.3, 0.7) + rnd(-3, 3); c.vy = rnd(2.5, 6.5);
    c.spin = rnd(-8, 8); c.life = rnd(1.6, 2.6); c.rest = 0;
  }
}
function stepChunks (dt) {
  for (const c of CHUNKS) {
    if (c.life <= 0) continue;
    c.life -= dt;
    const p = c.m.position;
    if (!c.rest) {
      c.vy -= 14 * dt;
      p.x += c.vx * dt; p.y += c.vy * dt; p.z += c.vz * dt;
      c.m.rotation.x += c.spin * dt; c.m.rotation.z += c.spin * 0.7 * dt;
      const gy = C.groundH(p.x, p.z) + C.curbAt(p.x, p.z) + c.sz * 0.4;
      if (p.y < gy) { p.y = gy; if (c.vy < -3) { c.vy *= -0.25; c.vx *= 0.4; c.vz *= 0.4; } else c.rest = 1; }
    }
    if (c.life < 0.6) c.m.scale.setScalar(c.sz * Math.max(0.01, c.life / 0.6));    // тает
    if (c.life <= 0) c.m.visible = false;
  }
}

/* ── снежки: две команды во дворе, лепят, замахиваются, бросают ── */
const FIGHTS = [], BALLS = [];
let BALL_GEO = null, BALL_MAT = null, fightScan = 0;
function fightSpots () {
  if (FIGHT_SPOTS.built) return FIGHT_SPOTS;
  const { CITY, inHouse, inPoly, inBounds, nearestRoad } = C;
  for (const g of CITY.green) {
    if (g.k === 'water' || g.k === 'pitch' || g.k === 'cem') continue;
    let cx = 0, cz = 0;
    for (const q of g.p) { cx += q[0] / g.p.length; cz += q[1] / g.p.length; }
    if (!inPoly(cx, cz, g.p) || !inBounds(cx, cz, 20) || inHouse(cx, cz, 6)) continue;
    const n = nearestRoad(cx, cz, 7, 1);
    if (n && n.d < n.seg.w / 2 + 6) continue;
    FIGHT_SPOTS.push({ x: cx, z: cz });
  }
  for (let i = 0; i < CITY.entrances.length; i += 6) {
    const [ex, ez, nx, nz] = CITY.entrances[i], x = ex + nx * 10, z = ez + nz * 10;
    if (!inBounds(x, z, 20) || inHouse(x, z, 6)) continue;
    const n = nearestRoad(x, z, 7, 1);
    if (n && n.d < n.seg.w / 2 + 6) continue;
    FIGHT_SPOTS.push({ x, z });
  }
  FIGHT_SPOTS.built = true;
  return FIGHT_SPOTS;
}
function spawnFight (sp) {
  const { makeHuman, groundH, curbAt, inHouse, nearestRoad, scene } = C;
  const a = rnd(0, 6.28), ux = Math.cos(a), uz = Math.sin(a), ppl = [];
  for (const team of [-1, 1]) {
    const n = 2 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const lat = (i - (n - 1) / 2) * 1.9 + rnd(-0.4, 0.4), dd = rnd(3.6, 5.2);
      const x = sp.x + ux * dd * team - uz * lat, z = sp.z + uz * dd * team + ux * lat;
      if (inHouse(x, z, 0.5)) continue;
      const nr = nearestRoad(x, z, 7, 1);
      if (nr && nr.d < nr.seg.w / 2 + 1.2) continue;
      const grp = makeHuman(null, { fat: Math.random() < 0.15 });      // детей в игре нет — играют взрослые
      grp.position.set(x, groundH(x, z) + curbAt(x, z), z);
      scene.add(grp);
      ppl.push({ grp, x, z, hx: x, hz: z, team, st: 'idle', t: rnd(0.2, 2.2), hit: 0, dead: 0, person: null, tgt: null, sc: grp.scale.x, ph: 0, sq: 0, gx: 0, gz: 0, hide: 0, nHide: 0, thrown: 0, T: 1, pcS: 1 });
    }
  }
  if (ppl.length < 3) { for (const q of ppl) C.dropMesh(q.grp); return; }
  // укрытия своего двора: горки и снеговики рядом (остальное — деревья, будки, машины — ищет pedcollide.js coverNear)
  const extra = SEA_ITEMS.filter(it => (it.kind === 'ice' || it.kind === 'snowman') && Math.abs(it.x - sp.x) < 18 && Math.abs(it.z - sp.z) < 18);
  FIGHTS.push({ sp, ppl, say: null, sayT: 0, extra });
  sp.on = 1;
}
function dropFight (f) {
  for (const q of f.ppl) if (!q.dead) C.dropMesh(q.grp);
  if (f.say && f.say.parent) { f.say.parent.remove(f.say); f.say.material.dispose(); }
  f.sp.on = 0;
}
function throwBall (q, tx, ty, tz, f) {
  let b = BALLS.find(o => !o.on);
  if (!b) { if (BALLS.length > 30) return; b = { m: new THREE.Mesh(BALL_GEO, BALL_MAT), on: 0 }; C.scene.add(b.m); BALLS.push(b); }
  const fx = Math.sin(q.grp.rotation.y), fz = Math.cos(q.grp.rotation.y);
  const x = q.x + fx * 0.3 + fz * 0.25 * q.sc, y = q.grp.position.y + 1.7 * q.sc, z = q.z + fz * 0.3 - fx * 0.25 * q.sc;
  const d = Math.hypot(tx - x, tz - z), T = Math.max(0.45, Math.min(1.15, d / 10));
  b.on = 1; b.f = f; b.team = q.team; b.life = 3;
  b.x = x; b.y = y; b.z = z;
  b.vx = (tx - x) / T + rnd(-0.6, 0.6); b.vz = (tz - z) / T + rnd(-0.6, 0.6); b.vy = (ty - y + 4.9 * T * T) / T;
  b.m.position.set(x, y, z); b.m.visible = true;
}
function stepBalls (dt) {
  const V = C.V;
  for (const b of BALLS) {
    if (!b.on) continue;
    b.life -= dt;
    b.vy -= 9.8 * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    b.m.position.set(b.x, b.y, b.z);
    let done = b.life <= 0;
    const gy = C.groundH(b.x, b.z) + C.curbAt(b.x, b.z);
    if (!done && b.f) for (const q of b.f.ppl) {
      if (q.dead || q.team === b.team) continue;
      const dy = b.y - q.grp.position.y;
      if (dy > 0.2 && dy < (q.sq > 0.5 ? 1.1 : 1.9) * q.sc && Math.hypot(b.x - q.x, b.z - q.z) < 0.45) { q.hit = 0.7; q.st = 'idle'; q.t = rnd(0.6, 1.4); q.grp.userData.qAnim = null; done = true; FIGHT.hits++; break; }   // присел — ниже
    }
    // попали в курьера
    if (!done && Math.abs(b.x - V.x) < 1.2 && Math.abs(b.z - V.z) < 1.2 && b.y < V.y + 1.8) {
      done = true;
      C.Snd.fx('snowball-hit', s => s.blip(420, 0.05, 'triangle', 0.05));
    }
    if (!done && b.y < gy) done = true;
    if (!done && b.y < gy + FIGHT.COVER_H && PEDC.solidAt(b.x, b.z, 0)) done = true;   // в укрытие (дерево, будка, машина ниже) — разбился о него
    if (!done && b.y < gy + 1.3 && PEDC.carAt(b.x, b.z, 0, 0, false, false)) done = true;
    if (done) {
      b.on = 0; b.m.visible = false;
      splash(b.x, Math.max(b.y, gy + 0.1), b.z, 7, 0.6);
      C.Snd.fx('snowball', s => s.noise(0.05, 0.03), { x: b.x, z: b.z, far: 25, near: 2 });
    }
  }
}
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
function stepFights (dt) {
  const V = C.V, ENV = C.ENV;
  const on = (A.snow || 0) > 0.55 && (ENV.night || 0) < 0.7;
  if (!on) { if (FIGHTS.length) { for (const f of FIGHTS) dropFight(f); FIGHTS.length = 0; } return; }
  if ((fightScan -= dt) <= 0) {
    fightScan = 1.2;
    for (let i = FIGHTS.length - 1; i >= 0; i--) if (Math.hypot(FIGHTS[i].sp.x - V.x, FIGHTS[i].sp.z - V.z) > 230) { dropFight(FIGHTS[i]); FIGHTS.splice(i, 1); }
    if (FIGHTS.length < 3) {
      // не появляются на глазах и не за спиной рядом, пока стоишь (0п0, автор 23.10.2026: «после доставки рядом множество людей»):
      // в кадре — дальше 70 м, вне кадра — дальше 30 м, стоишь (у двери) — дальше 70 м и вне кадра
      const still = Math.hypot(V.vx, V.vz) < 2;
      const near = fightSpots().filter(p => {
        if (p.on || p.slide || p.cool) return false;
        const d = Math.hypot(p.x - V.x, p.z - V.z);
        if (d >= 160 || d <= 30) return false;
        return d > 70 || (!still && !inView(p.x, 1, p.z, 6));
      });
      if (near.length) { const sp = near[(Math.random() * near.length) | 0]; spawnFight(sp); }
    }
  }
  const fx = Math.sin(V.h), fz = Math.cos(V.h), vsp = Math.hypot(V.vx, V.vz);
  for (const f of FIGHTS) {
    const dC = Math.hypot(f.sp.x - V.x, f.sp.z - V.z);
    if (f.sayT > 0 && (f.sayT -= dt) <= 0 && f.say) { f.say.parent && f.say.parent.remove(f.say); f.say.material.dispose(); f.say = null; }
    for (const q of f.ppl) {
      if (q.dead) continue;
      const u = q.grp.userData, g = q.grp;
      g.visible = dC < 130;
      // под колёса — как все
      if (vsp > 3) {
        const dx = q.x - V.x, dz = q.z - V.z;
        if (Math.abs(dx * fx + dz * fz) < C.CAR_L + 0.5 && Math.abs(dx * fz - dz * fx) < C.CAR_W + 0.35) {
          q.dead = 1; C.dropMesh(g); C.gibHuman(q, V.vx, V.vz); C.S.people++; C.Snd.squish();
          continue;
        }
      }
      if (!g.visible) continue;
      fighter(q, f, u, g, dt, dC, vsp);
    }
  }
}
/* один игрок в снежки (автор 23.10.2026, 0п13: «поворачиваются на прямых ногах» — должны приседать, бросать, убегать и
   прятаться). Цикл: стоит → приседает и лепит снежок (SCOOP с) → бросает (клип «Punch» у людей-моделей, у остальных —
   замах рукой) → дальше: стоит / отбегает вбок (P_DODGE) / бежит в укрытие (P_COVER: ближайшее твёрдое со стороны от
   «противника» — дерево, будка, гараж, машина, горка, снеговик; pedcollide.js coverNear, не дальше COVER_R м) / назад
   на своё место (дальше HOME м). В укрытии сидит на корточках HIDE с, лепит там же и встаёт бросить; так NHIDE раз,
   потом выбегает. Бежит через pedcollide.js steer — не сквозь твёрдое. Снежок о твёрдое ниже COVER_H м — разбивается */
export const FIGHT = { SCOOP: [0.9, 1.4], THROW: 0.55, REL: 0.42, RUN: 4.2, COVER_R: 9, HIDE: [0.9, 2.2], NHIDE: [1, 3],
  P_COVER: 0.35, P_DODGE: 0.2, HOME: 2.5, ROAM: 7, COVER_H: 1.6, LEG: -1.35, DROP: 0.32, BODY: 0.5, hits: 0, covers: 0, dodges: 0, throws: 0, squats: 0 };
function fighter (q, f, u, g, dt, dC, vsp) {
  const V = C.V;
  // цель: кто-то из другой команды, а если курьер рядом и медленно — он
  const foes = f.ppl.filter(o => !o.dead && o.team !== q.team);
  const atCar = dC < 26 && vsp < 7 && Math.hypot(q.x - V.x, q.z - V.z) < 22;
  if (!q.tgt || q.tgt.dead || Math.random() < dt * 0.2) q.tgt = foes.length ? foes[(Math.random() * foes.length) | 0] : null;
  const tx = atCar ? V.x : q.tgt ? q.tgt.x : f.sp.x, tz = atCar ? V.z : q.tgt ? q.tgt.z : f.sp.z;
  const body = u.parts && u.parts[2];
  g.rotation.x = 0; g.rotation.z = 0;
  let want = 0, run = false;                       // want — насколько присел (0 — стоит, 1 — на корточках)
  if (q.hit > 0) {
    // попали: дёрнулся корпусом, рука к лицу
    q.hit -= dt;
    if (body) body.rotation.z = Math.sin(q.hit * 22) * 0.15;
    u.armL.rotation.x = damp(u.armL.rotation.x, -2.4, 12, dt);
    if (q.hit <= 0) { if (body) body.rotation.z = 0; if (!f.say && Math.random() < 0.35 && dC < 60) { f.say = C.sayBubble(g, Math.random() < 0.5 ? t('ай!') : t('ха-ха!'), '#4f7fd6', 2.4 * q.sc + 0.3); f.sayT = 1.3; } }
  } else {
    q.t -= dt;
    if (q.st !== 'run') u.armL.rotation.x = damp(u.armL.rotation.x, -0.3, 6, dt);
    if (q.st === 'idle') {
      u.armR.rotation.x = damp(u.armR.rotation.x, 0, 6, dt);
      if (q.t <= 0) { q.st = 'scoop'; q.T = q.t = rnd(FIGHT.SCOOP[0], FIGHT.SCOOP[1]); FIGHT.squats++; }
    } else if (q.st === 'scoop' || q.st === 'hide') {
      // на корточках: лепит снежок — ладони у земли, похлопывают
      want = 1;
      const pat = q.st === 'scoop' ? Math.sin(q.t * 18) * 0.22 : 0;
      u.armR.rotation.x = damp(u.armR.rotation.x, -0.75 + pat, 10, dt);
      u.armL.rotation.x = damp(u.armL.rotation.x, -0.75 - pat, 10, dt);
      if (q.t <= 0) {
        if (q.st === 'hide') { q.st = 'scoop'; q.T = q.t = rnd(FIGHT.SCOOP[0], FIGHT.SCOOP[1]) * 0.7; }
        else { q.st = 'throw'; q.T = q.t = FIGHT.THROW; q.thrown = 0; }
      }
    } else if (q.st === 'throw') {
      const k = 1 - Math.max(0, q.t) / q.T;
      if (qHas(g, 'punch')) u.qAnim = { c: 'punch', f: Math.min(1, k * 1.15) };   // бросок: клип художника
      else u.armR.rotation.x = k < FIGHT.REL ? damp(u.armR.rotation.x, -3.0, 14, dt) : damp(u.armR.rotation.x, -0.7, 14, dt);   // замах и бросок рукой
      if (!q.thrown && k >= FIGHT.REL) {
        q.thrown = 1; FIGHT.throws++;
        const tg = q.tgt, ty = atCar ? V.y + 1.0 : tg ? tg.grp.position.y + (tg.sq > 0.5 ? 0.7 : 1.1) * tg.sc : C.groundH(tx, tz);
        throwBall(q, tx + rnd(-0.5, 0.5), ty, tz + rnd(-0.5, 0.5), f);
        if (dC < 40) C.Snd.fx('throw', s => s.blip(rnd(500, 700), 0.04, 'triangle', 0.03), { x: tx, z: tz, far: 40 });
      }
      if (q.t <= 0) { u.qAnim = null; u.armR.rotation.x = -0.4; nextMove(q, f, tx, tz); }
    } else if (q.st === 'run') {
      const dx = q.gx - q.x, dz = q.gz - q.z, d = Math.hypot(dx, dz);
      if (d < 0.35 || q.t <= 0) {
        if (q.hide && d < 1) { q.st = 'hide'; q.T = q.t = rnd(FIGHT.HIDE[0], FIGHT.HIDE[1]); }
        else { q.st = 'idle'; q.t = rnd(0.3, 1.0); q.hide = 0; q.nHide = 0; }
      } else {
        const a = PEDC.steer(q, dx / d, dz / d, Math.min(d, FIGHT.RUN * dt));
        if (Number.isNaN(a)) q.t = 0;
        else { g.rotation.y = damp(g.rotation.y, a, 12, dt); run = true; }
        q.ph += dt * 15;
        const sw = Math.sin(q.ph) * 1.1;
        u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
        u.armL.rotation.x = -sw * 0.8; u.armR.rotation.x = sw * 0.8;
      }
    }
  }
  if (!run) {
    // лицом к цели (в укрытии — тоже: выглядывает)
    g.rotation.y = damp(g.rotation.y, Math.atan2(tx - q.x, tz - q.z), 6, dt);
    if (q.st !== 'throw' || !u.qAnim) { u.legL.rotation.x = damp(u.legL.rotation.x, FIGHT.LEG * q.sq, 14, dt); u.legR.rotation.x = damp(u.legR.rotation.x, FIGHT.LEG * q.sq, 14, dt); }
  }
  // приседает: бёдра вперёд, голень вниз (колени гнёт модель — как на лавочке), корпус вперёд, ниже к земле
  q.sq = damp(q.sq, want, 9, dt);
  if (body) body.rotation.x = FIGHT.BODY * q.sq;
  u.head.rotation.x = -0.3 * q.sq;
  g.position.set(q.x, C.groundH(q.x, q.z) + C.curbAt(q.x, q.z) - FIGHT.DROP * q.sq * q.sc, q.z);
}
/* после броска: куда дальше */
function nextMove (q, f, tx, tz) {
  const r = Math.random();
  q.st = 'idle'; q.t = rnd(0.5, 1.6);
  if (q.hide && q.nHide > 0) { q.nHide--; q.st = 'hide'; q.T = q.t = rnd(FIGHT.HIDE[0], FIGHT.HIDE[1]); return; }   // ещё раз из того же укрытия
  q.hide = 0;
  if (r < FIGHT.P_COVER) {
    const c = PEDC.coverNear(q.x, q.z, tx, tz, FIGHT.COVER_R, f.extra);
    if (c && Math.hypot(c.x - f.sp.x, c.z - f.sp.z) < FIGHT.COVER_R + 6) {
      q.gx = c.x; q.gz = c.z; q.st = 'run'; q.t = 4; q.hide = 1; q.nHide = (rnd(FIGHT.NHIDE[0], FIGHT.NHIDE[1] + 1) | 0) - 1; FIGHT.covers++;
      return;
    }
  }
  if (r < FIGHT.P_COVER + FIGHT.P_DODGE) {
    // отбежать вбок от линии броска, не дальше ROAM м от своего места
    const ux = tx - q.x, uz = tz - q.z, l = Math.hypot(ux, uz) || 1, s = Math.random() < 0.5 ? 1 : -1, dd = rnd(1.5, 3);
    const gx = q.x + uz / l * s * dd, gz = q.z - ux / l * s * dd;
    if (Math.hypot(gx - q.hx, gz - q.hz) < FIGHT.ROAM && !PEDC.solidAt(gx, gz, 0.3) && !C.inHouse(gx, gz, 0.3)) { q.gx = gx; q.gz = gz; q.st = 'run'; q.t = 2; FIGHT.dodges++; return; }
  }
  if (Math.hypot(q.x - q.hx, q.z - q.hz) > FIGHT.HOME && Math.random() < 0.6) { q.gx = q.hx; q.gz = q.hz; q.st = 'run'; q.t = 4; }
}

/* каждый кадр — после updateEnv */
export function updateSeasons (dt) {
  if (!C || !SNOWF) return;
  U.uTime.value += dt;
  U.uNight.value = C.ENV.night || 0;
  stepSky(dt);
  stepCar(dt);
  stepLeafBits(dt);
  stepFights(dt);
  stepBalls(dt);
  stepSplash(dt);
  stepChunks(dt);
  // кто уже на улице — переодеваются понемногу, пока их не видно
  if ((redressT -= dt) <= 0) { redressT = 0.3; C.cam.getWorldDirection(CAM_DIR); redressHumans(C.cam.position.x, C.cam.position.z, CAM_DIR.x, CAM_DIR.z, 2); }
  if (window.__dlv && !window.__dlv.season) window.__dlv.season = DEBUG;
}

/* для weather.js: склейка, шаблоны, шум и снежные брызги — сугробы снежной зимы строятся тем же */
export const kit = () => ({ Pile, tpls, hsh, rngAt, splash: (x, y, z, n, k) => splash(x, y, z, n, k), chunks: (x, y, z, n, vx, vz) => chunks(x, y, z, n, vx, vz),
  mat: () => (MESH_PILE[0] ? MESH_PILE[0].material : pileMat()) });

/* для ?debug: __dlv.season */
const DEBUG = {
  get value () { return SEA; }, get name () { return seasonName(); }, get amounts () { return { ...A }; }, BUILT, set: setSeason, shift: shiftSeason,
  snowNow (a = 0.8) { SKY.want = a; SKY.amt = a; SKY.t = 9999; }, DRIFTS, GROW, burstDrift,
  FIGHTS, FIGHT, FIRS, SEA_ITEMS, DECID, SPRUCES, get meshes () { return [...MESH_PILE, ...MESH_GARL, ...DRIFT_MESH]; }, get drifts () { return BUILT.drifts; }, get ENV () { return C.ENV; },
};
