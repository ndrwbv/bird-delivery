import * as SOFTCITY from './softcity.js';
import * as SOFTSURF from './softsurfaces.js';
import {joinLandCurbs} from './landcurb.js';
/* ──────────────────────────────────────────────────────────────────────────
   Бордюры во дворах (автор 18.10.2026: «между газоном и дорожкой резкий стык, некрасивый. Дорожка обычно
   с двух сторон огорожена бордюром… во дворах всё ещё очень гладко… чтобы дорога отделялась от газонов
   высотой»). Правила словами — docs/CAREER.md «Город: как выглядит» → «Бордюры у дорожек и проездов».

   Где: по обоим краям
     • дорожек во дворах и парках (CITY.paths: тропинки к подъездам, общие дорожки, выходы в сеть, дорожки
       вдоль стен, дорожки из карты) — у каждой своя полуширина (pts.hw; нет — 1 м, как плитка 2 м);
     • дворовых проездов и пешеходок (класс 7 и 6) — по внешнему краю их плитки (метр за асфальтом), по всему городу
       (11ц, 24.10.2026: «надо подталкивать, чтобы ездил именно по дороге»); тупик проезда — поперёк конца плитки;
     • улиц (класс ≤ 5) — по внешнему краю тротуара там, где он не поднят (у перекрёстков, зебр, стыков, обрывков подъёма);
     • стоянок из карты (CITY.lots 'park'), детских и спортплощадок (CITY.green 'play' / 'pitch') — по контуру снаружи;
       карманов парковки дворов (yardcars.js) — по дальнему краю и торцам (0п35, 24.10.2026: «бордюры везде, где есть
       стыки между землёй и дорожками»).
   Дорожки — по всему городу (и в парках); телефон — только во дворах: середина края ближе ZONE м к подъезду (память), без
   стоянок, площадок, карманов, проездов и улиц. Промзоны, гаражи, площадки-участки (CITY.lots не 'park') — не газон: туда камень
   не ведём.
   Бордюрный камень: ширина W (0,12 м), верх на H (0,12 м) выше плитки — над газоном 0,2 м; секции по SEC м
   (на компьютере — через одну чуть другого серого, видны стыки; местами просевшие и со сколом).
   Нет бордюра там, где край ложится на другое мощёное: чужую дорожку (перекрёсток дорожек), тротуар,
   полотно, аллею, стоянку, карман парковки двора, в дом — там он «опущен» сам собой (заезды, стыки).
   Нет и там, где за камнем — шов: газон уже STRIP (0,25 м), а за ним вдоль края снова мощёное — газона там нет. Есть
   газон шире — есть бордюр (0п35, 24.10.2026; до того STRIP был 0,9 м: на стыке узкой полоски газона и тротуара камня не было,
   23.10.2026; телефон и ?oldcurbs — так и осталось).
   На изломе дорожки снаружи — дугой шагами ARC, по тем же лучам, что и угол плитки (bendFan: плитка дорожек
   из карты и проездов на изломе — веер теми же шагами, а не 6—9-угольник): камень идёт точно по краю
   плитки; изнутри излома камни сходятся в угол (обрезаны по пересечению), а не заходят друг за друга.

   Машина: бордюр — не стена. Колесо переехало камень — толчок вверх (BUMP / BUMP_ON м, гаснет за ~0,2 с) и тряска
   камеры; передними на газон — теряешь скорость и уводит вбок (took() → carbump.js 'curb'), с газона — слабее, задними — чуть.
   Люди и машины потока — как раньше.
   Земля за камнем поднята (0п68, 24.10.2026): от верха камня к газону — скат травы BERM м (узкий газон — BERM_N); машина встаёт
   на него колёсами (liftAt → game.js), толчок пружины вдвое мягче. ?noberm — без ската.

   Всё — треугольниками в клетки земли и дорог (LITM): новых вызовов отрисовки нет. Телефон (MOB): секции
   длиннее (SEC_MOB), одного цвета — вершины соседних секций общие; камень клином (грань к дорожке и скат к
   газону, без отдельного верха) — вдвое меньше треугольников; только у дорожек, у проездов и улиц — нет (память).
   Проверка «край газона у дороги без бордюра» — tools/probe-checks/curb-gaps.js (npm run check, id curbgap).

     CURBS.build(api)            — LATE-шаг (game.js, после лабиринта дворов, до smashBuild); шагами
     CURBS.bump(V, dt)           — каждый кадр езды: толчок от бордюра под колёсами, м (прибавка к высоте кузова)
     CURBS.took()                — какой удар был ('curb' | 'curbOff' | 'curbRear' | ''): game.js бьёт им машину (carbump.js)
     CURBS.near(x, z, r)         — бордюр ближе r (yarddecor.js: не ставить на него)
     CURBS.liftAt(x, z)          — высота камня / ската над рельефом в точке, м (0 — нет): машина игрока на скате (game.js)
   ?nocurbs — без бордюров, ?oldcurbs — как до 24.10.2026 (проезды только во дворах, без улиц и тупиков; сравнить).
   ────────────────────────────────────────────────────────────────────────── */

import { isArc, STATS as SMST } from './roadsmooth.js';   // плавные улицы: точки дуги — края «в ус», без дуги камня на каждой
import { DEBUG as YCD } from './yardcars.js';          // карманы парковки двора: камень по дальнему краю и торцам (0п35)

export const CURB = {
  W: 0.12,            // ширина камня, м
  H: 0.15,            // верх над плиткой, м (над газоном — плитка 0,085 + H ≈ 0,23; до 24.10.2026 — 0,12, 11ц: «высокий бордюр»)
  IN: 0.02,           // камень заходит на плитку, м (без щели между ними)
  SEC: 2.0,           // секция, м (телефон — SEC_MOB, одним цветом)
  SEC_MOB: 6.0,
  ZONE: 60,           // только во дворах: подъезд ближе, м
  STEP: 0.25,         // шаг проверки края, м (концы — точнее, делением пополам)
  MIN: 0.45,          // кусок короче — не кладём, м
  HEX: SOFTCITY.STYLE.geometry ? ['#b2afa6', '#aca9a0'] : ['#aeaba3', '#a3a098'],   // серый бетон, темнее плитки (видно издали); через одну — видны стыки
  CHIP: '#8f8c85',    // со сколом (темнее)
  SUNK: 0.07,         // доля просевших секций (верх ниже на 3—6 см, наклон)
  CHIPS: 0.05,        // доля секций со сколом
  DRIVE: 1.0,         // проезд (класс 7) и пешеходка (6): плитка за асфальтом, м (pave.js PAVE.SIDE)
  BUMP: 0.07,         // толчок кузова, м (на скорости от 6 м/с; медленнее — меньше) — съезд с газона на мощёное и задние колёса
  BUMP_ON: 0.1,       // толчок передних колёс при заезде через камень на газон, м (11ц, 24.10.2026)
  LIFT_MAX: 0.15,     // выше кузов от камня не подкидывает, м
  ARC: 0.2,           // дуга на изломе: шаг, рад (тот же — у веера плитки, bendFan; до 23.10.2026 — 0,45 и 6—9-угольник плитки)
  STRIP: 0.25,        // за камнем газон уже этого, а дальше вдоль края мощёное — это шов, не газон: бордюра нет, м (0п35, 24.10.2026:
                      // «есть газон — есть бордюр»; до того — 0,9: полоски до 0,9 м были без камня; телефон и ?oldcurbs — как было)
  STRIP_OLD: 0.9,
  BERM: 0.9,          // за камнем земля поднята (0п68, 24.10.2026: «нужно просто землю поднять относительно дороги»): скат газона от верха
                      // камня вниз до газона, м; ?noberm — без ската (как было: камень торчит над газоном на 0,2 м)
  BERM_N: 0.35,       // газон за камнем узкий (в 0,45 м снова мощёное) — скат короче, м
  BERM_HEX: '#a2cf86',  // цвет ската — газона двора (game.js GREEN_HEX.green; сезоны красят его как газон: зелёное и смотрит вверх)
};
/* шагов дуги на изломе на угол da (рад) — один и тот же у плитки (bendFan) и у камня (arc) */
export const arcN = da => Math.max(1, Math.ceil(Math.abs(da) / CURB.ARC - 1e-6));
/* Угол плитки на изломе ломаной (b — вершина, u — куда шёл отрезок до, v — после): веер снаружи поворота
   радиусом r шагами CURB.ARC (game.js osmRoads — дорожки из карты и плитка проездов). Изнутри поворота
   ленты соседних отрезков и так перекрываются. M — склейка (LITM), lift — высота плитки */
export function bendFan (M, bx, bz, ux, uz, vx, vz, r, lift) {
  const cr = ux * vz - uz * vx, dot = ux * vx + uz * vz;
  if (Math.abs(cr) < 1e-4 && dot > 0) return 0;
  const sd = cr > 0 ? 1 : -1;
  const a0 = Math.atan2(ux * -sd, -uz * -sd), a1 = Math.atan2(vx * -sd, -vz * -sd);
  let da = a1 - a0;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  const n = arcN(da);
  for (let k = 0; k < n; k++) {
    const a = a0 + da * k / n, b = a0 + da * (k + 1) / n;
    M.dtri(bx, bz, bx + Math.cos(a) * r, bz + Math.sin(a) * r, bx + Math.cos(b) * r, bz + Math.sin(b) * r, lift);
  }
  return n;
}
export const ST = { ms: 0, runs: 0, m: 0, secs: 0, pathM: 0, driveM: 0, streetM: 0, capM: 0, lotM: 0, playM: 0, pocketM: 0, arcs: 0, cut: 0, strip: 0, miter: 0, raised: 0, bumps: 0, onLawn: 0, offLawn: 0, mob: 0 };

let A = null, ON = false;
const segD = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
  const qx = ax + dx * t - x, qz = az + dz * t - z;
  return Math.sqrt(qx * qx + qz * qz);
};
function hsh (x, z, k) {
  let h = Math.imul(Math.round(x * 4) ^ 0x1b873593, 0x9E3779B1) ^ Math.imul(Math.round(z * 4) + k * 1013904223, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/* ── дорожки по клеткам: [ax, az, bx, bz, hw] (свои — для «край лёг на чужую дорожку») ── */
const PC = 16;
const ck = (i, j) => (i + 8192) * 16384 + j + 8192;
let PG = null, LOTS = null, LOTX = null;
function pgAdd (s) {
  const m = s[4] + 0.5;
  for (let i = Math.floor((Math.min(s[0], s[2]) - m) / PC); i <= Math.floor((Math.max(s[0], s[2]) + m) / PC); i++)
    for (let j = Math.floor((Math.min(s[1], s[3]) - m) / PC); j <= Math.floor((Math.max(s[1], s[3]) + m) / PC); j++) {
      const k = ck(i, j);
      let a = PG.get(k);
      if (!a) PG.set(k, a = []);
      a.push(s);
    }
}
/* по краю (edge): дорожки и куски дорог рядом с краем — списком один раз (EPL, ERL), по точкам края — только по нему */
let EP = false;
const EPL = [], ERL = [];
let PST = 0;
function onPath (x, z, self) {
  const a = EP ? EPL : PG.get(ck(Math.floor(x / PC), Math.floor(z / PC)));
  if (a) for (let i = 0; i < a.length; i++) {
    const s = a[i];
    if (x < s[5] || x > s[7] || z < s[6] || z > s[8]) continue;   // мимо рамки отрезка (+ полуширина) — мимо дорожки
    if (s !== self && segD(x, z, s[0], s[1], s[2], s[3]) < s[4]) return true;
  }
  return false;
}
function inLot (x, z, M = LOTS) {
  const a = M.get(ck(Math.floor(x / 40), Math.floor(z / 40)));
  if (a) for (const b of a) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && A.inPoly(x, z, b.p)) return true;
  return false;
}
/* стоянка (или площадка — M = LOTX), чья рамка задевает прямоугольник */
function lotIn (x0, z0, x1, z1, M = LOTS) {
  for (let i = Math.floor(x0 / 40); i <= Math.floor(x1 / 40); i++) for (let j = Math.floor(z0 / 40); j <= Math.floor(z1 / 40); j++) {
    const a = M.get(ck(i, j));
    if (a) for (const b of a) if (b.x1 >= x0 && b.x0 <= x1 && b.z1 >= z0 && b.z0 <= z1) return true;
  }
  return false;
}
/* по краю (edge): есть ли вообще рядом дом / стоянка / карман парковки. Нет — их пробы в точках края заведомо «нет», и их
   не зовём (ответ тот же; на Деке бордюры строились ~5 с, это треть). Вне края (дуги) — всё как есть */
let EH = true, EL = true, EY = true, EX = true;
/* ALL — край проездов, пешеходок и улиц (11ц, 24.10.2026): по всему городу, не только во дворах; площадки, промзоны и гаражи
   (CITY.lots не 'park') — не газон, туда камень не ведём. RSW — край тротуара улицы (от края камня внутрь до полотна, м):
   там, где тротуар поднят (бордюр 0,28 м, game.js osmCurbs), камня нет — у поднятого тротуара грань к газону своя */
let ALL = false, RSW = 0;
/* ?oldcurbs — как до 24.10.2026 целиком (сравнить «было»): и камень, и езда (через камень — только толчок, скорость не теряется) */
export const RULES = { on: true };
/* поперёк тупика проезда: pave.js считает конец плитки кругом (полуширина от последней точки), а плитка обрезана прямо —
   полотно и тротуар проверяем дальше по ходу на CX, CZ (за кругом своего конца): там чужое мощёное — камня нет */
let CX = 0, CZ = 0;
/* край своего кармана парковки (0п35): «карман рядом» — на YN дальше от края (свой карман с запасом 0,2 м накрыл бы и свой камень);
   соседний кусок того же кармана (на изломе, у торца) там есть — камня нет. STRIPV — шов (CURB.STRIP; телефон и ?oldcurbs — STRIP_OLD) */
let YN = null, STRIPV = 0.25;
/* край камня (середина) в точке — на другом мощёном или в доме: тут бордюра нет */
/* onPave по частям (pave.js roadWalk / pathAt): дорожка из карты сама по себе бордюру не мешает, проверять её
   (до 20 кусков в клетке) не нужно — то же, что «onPave ∈ полотно, тротуар, аллея» и «дорожка + аллея» */
const RW = (x, z) => (EP && A.roadWalkL ? A.roadWalkL(ERL, x, z, 0) : A.roadWalk ? A.roadWalk(x, z, 0) : '');
function rwa (x, z) {                                // covered: полотно, тротуар или аллея (дорожка + аллея — тоже да)
  if (!A.roadWalk) { const k = A.onPave(x, z, 0); return k === 'road' || k === 'walk' || k === 'alley' || (k === 'path' && !!A.onAlley && A.onAlley(x, z, 0)); }
  return !!RW(x, z) || (!!A.onAlley && A.onAlley(x, z, 0));
}
function rwaPaved (x, z) {                           // paved: полотно, тротуар или аллея там, где нет дорожки из карты
  if (!A.roadWalk) { const k = A.onPave(x, z, 0); return k === 'road' || k === 'walk' || k === 'alley'; }
  return !!RW(x, z) || (!!A.onAlley && A.onAlley(x, z, 0) && !A.pathAt(x, z, 0));
}
function covered (x, z, self) {
  if (!ALL && !inZone(x, z)) return true;
  if (onPath(x, z, self)) return true;
  if (rwa(x + CX, z + CZ)) return true;
  if (EH && A.inHouse(x, z, 0.05)) return true;
  if (A.groundH(x, z) < 0.3) return true;
  if (EL && inLot(x, z)) return true;
  if (EY && A.ycBlocks && (YN ? A.ycBlocks(x + YN[0], z + YN[1], 0) : A.ycBlocks(x, z, 0.2))) return true;
  if (A.extra && A.extra(x, z)) return true;
  if (ALL && EX && inLot(x, z, LOTX)) return true;
  return false;
}
/* тротуар улицы поднят поперёк в этой точке края (середина камня x, z; n — к газону) */
function raised (x, z, nx, nz) {
  for (let q = 0.45; q < RSW - 0.2; q += 0.45) if (A.curbAt(x - nx * q, z - nz * q) > 0) return true;
  return false;
}

/* мощёное в точке (для полоски газона за камнем): дорожка, тротуар, полотно, аллея, стоянка, карман */
function paved (x, z) {
  if (onPath(x, z, null)) return true;
  if (rwaPaved(x, z)) return true;
  if (EL && inLot(x, z)) return true;
  return !!(EY && A.ycBlocks && A.ycBlocks(x, z, 0));
}
/* за камнем (середина x, z; n — от дорожки к газону, u — вдоль края) газон уже STRIP м, а за ним вдоль края
   снова мощёное: стык газона и тротуара — тут бордюра нет. Вдоль — три пробы (±1 м): поперечное мощёное
   (дорожка подходит к нашей под углом) — не в счёт */
function strip (x, z, ux, uz, nx, nz) {
  const g = CURB.W / 2 + STRIPV, px = x + nx * g + CX, pz = z + nz * g + CZ;   // CX, CZ — тупик: за кругом своего конца
  return paved(px, pz) && paved(px + ux, pz + uz) && paved(px - ux, pz - uz);
}

/* дворы: клетки 20 м, середина которых ближе ZONE м к подъезду */
let ZN = null;
const ZC = 20;
const inZone = (x, z) => ZN.has(ck(Math.floor(x / ZC), Math.floor(z / ZC)));

/* ── толчок: куски бордюра по клеткам BC м (середина камня, отрезок). На время сборки — массивы чисел по клеткам,
   потом — один Float32Array, по ключу клетки — где начинается и сколько (BI: начало × 1024 + сколько) ── */
const BC = 32;
let BG = new Map(), BI = new Map(), BF = null, BWF = null;   // BWF — по куску: ширина ската и верх камня (0п68)
function bgAdd (ax, az, bx, bz, nx, nz, top = 0) {
  if ((bx - ax) * nz - (bz - az) * nx < 0) { let t = ax; ax = bx; bx = t; t = az; az = bz; bz = t; }   // газон — слева от a→b (толчок знает, куда заехал)
  const mg = 0.2 + (BERM ? BW : 0);                 // скат — тоже в клетках, где он лежит (liftAt)
  for (let i = Math.floor((Math.min(ax, bx) - mg) / BC); i <= Math.floor((Math.max(ax, bx) + mg) / BC); i++)
    for (let j = Math.floor((Math.min(az, bz) - mg) / BC); j <= Math.floor((Math.max(az, bz) + mg) / BC); j++) {
      const k = ck(i, j);
      let a = BG.get(k);
      if (!a) BG.set(k, a = []);
      a.push(ax, az, bx, bz, BERM ? BW : 0, top);  // + скат: ширина и верх камня над рельефом (liftAt)
    }
}
function bgPack () {
  let n = 0;
  for (const a of BG.values()) n += Math.min(a.length / 6, 1023) * 4;
  BF = new Float32Array(n); BWF = A.contours ? null : new Float32Array(n / 2);
  let o = 0;
  for (const [k, a] of BG) {
    const m = Math.min(a.length / 6, 1023);
    for (let i = 0; i < m; i++) { for (let j = 0; j < 4; j++) BF[o + i * 4 + j] = a[i * 6 + j]; if(BWF){BWF[(o / 2) + i * 2] = a[i * 6 + 4]; BWF[(o / 2) + i * 2 + 1] = a[i * 6 + 5];} }
    BI.set(k, (o / 4) * 1024 + m);
    o += m * 4;
  }
  BG = null;
}

/* ── геометрия: секция камня от (x0, z0) до (x1, z1) по средней линии; nx, nz — от дорожки к газону ── */
let LITM = null, SEC = 1, MOB = false;
let BERM = false, BW = 0;                           // скат газона за камнем (0п68): включён, ширина у текущего куска, м
/* ?nomiter — торцы камня на изломе поперёк, дуги по хорде, просадка где попало (как до 0п72; сравнить стыки — curb-joins.js) */
const NOMITER = typeof location !== 'undefined' && /[?&]nomiter(&|$)/.test(location.search);
const TRACE = typeof location !== 'undefined' && /[?&]curbtrace(&|$)/.test(location.search) ? [] : null;   // по 18 чисел на секцию: углы торцов (низ — вверх) и средняя линия
const TRACE_TOPOLOGY=TRACE?{active:false,links:[],bridges:[],open:[]}:null;
const hexOf = (x, z, k) => (MOB ? CURB.HEX[0] : hsh(x, z, 5) < CURB.CHIPS ? CURB.CHIP : CURB.HEX[k & 1]);
/* ta, tb — «в ус» (0п72, 24.10.2026): торец секции на изломе лежит не поперёк камня, а по биссектрисе излома — как у соседнего
   отрезка, и два камня сходятся без щели и нахлёста. Вершина торца на расстоянии s поперёк (к газону — плюс) от средней
   линии сдвинута вдоль камня на +s·ta в начале и на −s·tb в конце; ta, tb = tg(половины угла излома), плюс — если газон
   со стороны, куда поворачивает дорожка, минус — снаружи поворота. en — свои нормали торцов [n0x, n0z, n1x, n1z] (дуга: по лучу
   из центра, как у веера плитки и соседнего отрезка); flat — без просадки (концы стыкуются с соседом по высоте) */
function section (x0, z0, x1, z1, nx, nz, lift, k, ta = 0, tb = 0, en = null, flat = false) {
  const hw = CURB.W / 2 + CURB.IN / 2, ow = CURB.W / 2 - CURB.IN / 2;
  const n0x = en ? en[0] : nx, n0z = en ? en[1] : nz, n1x = en ? en[2] : nx, n1z = en ? en[3] : nz;
  let ux = 0, uz = 0;
  if (ta || tb) { const l = Math.hypot(x1 - x0, z1 - z0) || 1; ux = (x1 - x0) / l; uz = (z1 - z0) / l; }
  const ix0 = x0 - n0x * hw - ux * hw * ta, iz0 = z0 - n0z * hw - uz * hw * ta, ix1 = x1 - n1x * hw + ux * hw * tb, iz1 = z1 - n1z * hw + uz * hw * tb;   // к дорожке
  const ox0 = x0 + n0x * ow + ux * ow * ta, oz0 = z0 + n0z * ow + uz * ow * ta, ox1 = x1 + n1x * ow - ux * ow * tb, oz1 = z1 + n1z * ow - uz * ow * tb;   // к газону
  const gi0 = A.groundH(ix0, iz0), gi1 = A.groundH(ix1, iz1), go0 = A.groundH(ox0, oz0), go1 = A.groundH(ox1, oz1);
  let t0 = Math.max(gi0, go0) + lift + CURB.H, t1 = Math.max(gi1, go1) + lift + CURB.H;
  if (!MOB && !flat && hsh(x0, z0, 3) < CURB.SUNK) { const s = 0.03 + hsh(x0, z0, 4) * 0.03; if (hsh(x1, z1, 6) < 0.5) { t0 -= s; t1 -= s * 0.4; } else { t1 -= s; t0 -= s * 0.4; } }
  if (A.landTopAt) {
    t0 = Math.max(t0, go0 + A.landTopAt(ox0 + n0x * .12, oz0 + n0z * .12));
    t1 = Math.max(t1, go1 + A.landTopAt(ox1 + n1x * .12, oz1 + n1z * .12));
  }
  LITM.color(hexOf(x0, z0, k));
  const b0 = gi0 + lift - 0.035, b1 = gi1 + lift - 0.035;
  let tx0 = ix0, tz0 = iz0, tx1 = ix1, tz1 = iz1;
  if (SOFTCITY.STYLE.geometry && !MOB) {
    const [a, b] = SOFTCITY.curbEdge(LITM, [ix0, iz0], [ix1, iz1], [ox0, oz0], [ox1, oz1], b0, b1, t0, t1);
    tx0 = a[0]; tz0 = a[1]; tx1 = b[0]; tz1 = b[1];
  } else LITM.quad(ix0, b0, iz0, ix1, b1, iz1, ix1, t1, iz1, ix0, t0, iz0);           // к дорожке
  if (A.landTopAt) {
    // Полный грунт уже поднят: камень заканчивается у его верхней грани,
    // вместо отдельного спуска обратно к старому уровню газона.
    LITM.quad(tx0, t0, tz0, tx1, t1, tz1, ox1, t1, oz1, ox0, t0, oz0);
    LITM.quad(ox0, t0, oz0, ox1, t1, oz1, ox1, go1, oz1, ox0, go0, oz0);
  } else if (BERM && BW > 0) {                              // 0п68: за камнем земля поднята — скат газона от верха камня до газона (BW м)
    const fw = (MOB ? -hw : ow) + BW, lim = 1.2 / fw;  // «в ус» и у ската: торец по биссектрисе (на остром изломе — не дальше 1,2 м вдоль)
    const fa = Math.max(-lim, Math.min(lim, ta)), fb = Math.max(-lim, Math.min(lim, tb));
    const fx0 = x0 + n0x * fw + ux * fw * fa, fz0 = z0 + n0z * fw + uz * fw * fa, fx1 = x1 + n1x * fw - ux * fw * fb, fz1 = z1 + n1z * fw - uz * fw * fb;
    const gf0 = A.groundH(fx0, fz0) - 0.01, gf1 = A.groundH(fx1, fz1) - 0.01;   // конец ската — чуть ниже газона (0,04): уходит под него
    if (MOB) {                                       // телефон: грань к дорожке камнем, сверху сразу скат (без верха камня — те же 4 треугольника)
      LITM.color(CURB.BERM_HEX);
      LITM.quad(ix0, t0, iz0, ix1, t1, iz1, fx1, gf1, fz1, fx0, gf0, fz0);
    } else {
      LITM.quad(tx0, t0, tz0, tx1, t1, tz1, ox1, t1, oz1, ox0, t0, oz0);       // верх камня
      LITM.color(CURB.BERM_HEX);
      if (SOFTCITY.STYLE.geometry) SOFTCITY.lawnEdge(LITM, [ox0, oz0], [ox1, oz1], [fx0, fz0], [fx1, fz1], t0, t1, gf0, gf1);
      else LITM.quad(ox0, t0, oz0, ox1, t1, oz1, fx1, gf1, fz1, fx0, gf0, fz0);     // скат газона (вместо грани камня к газону)
    }
  } else if (MOB) {                                  // клин: от верха грани к дорожке — скатом к газону
    LITM.quad(ix0, t0, iz0, ix1, t1, iz1, ox1, go1 - 0.03, oz1, ox0, go0 - 0.03, oz0);
  } else {
    LITM.quad(tx0, t0, tz0, tx1, t1, tz1, ox1, t1, oz1, ox0, t0, oz0);         // верх
    LITM.quad(ox0, t0, oz0, ox1, t1, oz1, ox1, go1 - 0.03, oz1, ox0, go0 - 0.03, oz0);   // к газону
  }
  if (TRACE) TRACE.push(ix0, iz0, t0, ox0, oz0, t0, ix1, iz1, t1, ox1, oz1, t1, (x0 + x1) / 2, (z0 + z1) / 2, x0, z0, x1, z1);   // ?curbtrace: углы секции для проверки стыков (curb-joins.js)
  ST.secs++;
}
/* кусок [t0, t1] края: секции и толчок */
let MIN_RUN = CURB.MIN;
function run (P, ux, uz, nx, nz, t0, t1, lift, ta = 0, tb = 0, fa = false, fb = false) {
  const L = t1 - t0;
  if (L < MIN_RUN) return;
  const n = Math.max(1, Math.round(L / SEC)), sl = L / n;
  const k0 = Math.round(t0 / SEC);
  if (BERM) {                                        // скат за камнем: в 0,45 м за ним снова мощёное (начало, середина, конец куска) — короче
    const g = CURB.W / 2 + 0.45;
    BW = CURB.BERM;
    for (const t of [t0 + 0.2, (t0 + t1) / 2, t1 - 0.2]) if (paved(P[0] + ux * t + nx * g, P[1] + uz * t + nz * g)) { BW = CURB.BERM_N; break; }
  }
  for (let k = 0; k < n; k++) {
    const a = k ? t0 + k * sl : t0, b = k + 1 < n ? t0 + (k + 1) * sl : t1;   // концы соседних секций — одно и то же число (общие вершины)
    section(P[0] + ux * a, P[1] + uz * a, P[0] + ux * b, P[1] + uz * b, nx, nz, lift, k0 + k, k ? 0 : ta, k + 1 < n ? 0 : tb, null, (!k && fa) || (k + 1 === n && fb));
  }
  bgAdd(P[0] + ux * t0, P[1] + uz * t0, P[0] + ux * t1, P[1] + uz * t1, nx, nz, lift + CURB.H);
  ST.runs++; ST.m += L;
}
/* край отрезка: P — начало средней линии камня, вдоль u на L м; где не накрыто — куски */
function edge (P, ux, uz, nx, nz, L, lift, self, t0 = 0, J = null) {
  if(A.boundaryRanges){
    for(const [a,b] of A.boundaryRanges(P,ux,uz,nx,nz,t0,L)){
      const first=Math.abs(a-t0)<1e-6,last=Math.abs(b-L)<1e-6;
      run(P,ux,uz,nx,nz,a,b,lift,first&&J?J.ma:0,last&&J?J.mb:0,!!(first&&J?.fa),!!(last&&J?.fb));
    }
    return;
  }
  const st = CURB.STEP, at = A.boundaryAt ? t => {
    const x=P[0]+ux*t,z=P[1]+uz*t;
    return !A.boundaryAt(x,z,nx,nz)||A.inHouse(x,z,.05)||A.groundH(x,z)<.3;
  } : t => (RSW > 0 && raised(P[0] + ux * t, P[1] + uz * t, nx, nz) && ++ST.raised > 0) ||
    covered(P[0] + ux * t, P[1] + uz * t, self) || (strip(P[0] + ux * t, P[1] + uz * t, ux, uz, nx, nz) && ++ST.strip > 0);
  const fine = (a, b, wantFree) => {              // граница между a (как wantFree) и b — делением пополам
    for (let i = 0; i < 4; i++) { const m = (a + b) / 2; if (!at(m) === wantFree) a = m; else b = m; }
    return a;
  };
  /* все пробы края — на отрезке [t0, L] (covered — с запасом 0,05 у дома) и в полоске за камнем (strip: 0,96 м вбок, ±1 м вдоль) */
  if (L > t0) {
    const ax = P[0] + ux * t0, az = P[1] + uz * t0, bx = P[0] + ux * L, bz = P[1] + uz * L, M = 1.5;
    const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), z0 = Math.min(az, bz), z1 = Math.max(az, bz);
    EH = !A.houseIn || A.houseIn(x0 - 0.06, z0 - 0.06, x1 + 0.06, z1 + 0.06);
    EL = lotIn(x0 - M, z0 - M, x1 + M, z1 + M);
    EY = !!A.ycBlocks && A.ycBlocks((ax + bx) / 2, (az + bz) / 2, 0.2 + (L - t0) / 2 + 2.5);
    EX = ALL && lotIn(x0 - M, z0 - M, x1 + M, z1 + M, LOTX);
    // дорожки рядом: из клеток PG, чья рамка (+ полуширина) задевает край с полоской (± M); куски дорог — у pave.js
    const st = ++PST; EPL.length = 0;
    for (let i = Math.floor((x0 - M) / PC); i <= Math.floor((x1 + M) / PC); i++)
      for (let j = Math.floor((z0 - M) / PC); j <= Math.floor((z1 + M) / PC); j++) {
        const c = PG.get(ck(i, j));
        if (c) for (let k = 0; k < c.length; k++) { const q = c[k]; if (q[9] !== st && q[7] >= x0 - M && q[5] <= x1 + M && q[8] >= z0 - M && q[6] <= z1 + M) { q[9] = st; EPL.push(q); } }
      }
    if (A.roadsIn) A.roadsIn(x0 - M, z0 - M, x1 + M, z1 + M, ERL);
    EP = !!A.roadsIn && !CX && !CZ;          // тупик (CX, CZ): полотно — по всему городу, не по списку у края
  }
  let s0 = null, prevT = t0, prevFree = false;
  for (let t = t0; ; t += st) {
    const tt = Math.min(t, L), free = !at(tt);
    if (free && s0 === null) s0 = tt > t0 && !prevFree ? fine(tt, prevT, true) : tt;
    if (!free && s0 !== null) { run(P, ux, uz, nx, nz, s0, fine(prevT, tt, true), lift, J && s0 === t0 ? J.ma : 0, 0, !!J && s0 === t0 && J.fa, false); s0 = null; ST.cut++; }
    prevT = tt; prevFree = free;
    if (tt >= L) break;
  }
  EH = EL = EY = EX = true; EP = false;
  if (s0 !== null) run(P, ux, uz, nx, nz, s0, L, lift, J && s0 === t0 ? J.ma : 0, J ? J.mb : 0, !!J && s0 === t0 && J.fa, !!J && J.fb);
}
/* дуга снаружи излома: вокруг точки (cx, cz) радиусом r от угла a0 на da */
function arc (cx, cz, r, a0, da, lift, self) {
  const n = arcN(da);
  BW = CURB.BERM;                                    // скат снаружи излома — полный (0п68)
  for (let k = 0; k < n; k++) {
    const a = a0 + da * k / n, b = a0 + da * (k + 1) / n, m = (a + b) / 2;
    const mx = cx + Math.cos(m) * r, mz = cz + Math.sin(m) * r;
    const x0 = cx + Math.cos(a) * r, z0 = cz + Math.sin(a) * r, x1 = cx + Math.cos(b) * r, z1 = cz + Math.sin(b) * r;
    if(A.boundaryRanges){
      const len=Math.hypot(x1-x0,z1-z0),ux=(x1-x0)/len,uz=(z1-z0)/len;
      for(const [lo,hi] of A.boundaryRanges([x0,z0],ux,uz,Math.cos(m),Math.sin(m),0,len)){
        if(hi-lo<.035)continue;
        const p=[x0+ux*lo,z0+uz*lo],q=[x0+ux*hi,z0+uz*hi],aa=a+(b-a)*lo/len,bb=a+(b-a)*hi/len;
        section(...p,...q,Math.cos(m),Math.sin(m),lift,k,0,0,[Math.cos(aa),Math.sin(aa),Math.cos(bb),Math.sin(bb)],true);
        bgAdd(...p,...q,Math.cos(m),Math.sin(m),lift+CURB.H);ST.arcs++;ST.m+=hi-lo;
      }
      continue;
    }
    if (covered(mx, mz, self)) continue;
    section(x0, z0, x1, z1, Math.cos(m), Math.sin(m), lift, k, 0, 0, NOMITER ? null : [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b)], !NOMITER);   // торцы — по лучам, как соседние секции и отрезки
    bgAdd(x0, z0, x1, z1, Math.cos(m), Math.sin(m), lift + CURB.H);
    ST.arcs++; ST.m += Math.hypot(x1 - x0, z1 - z0);
  }
}
/* ломаная pts полуширины hw: оба края каждого отрезка, дуги снаружи изломов. Изнутри излома край обрезан там,
   где он пересекает край соседнего отрезка (камни сходятся в угол, не заходят друг за друга) */
const turn = (ax, az, bx, bz, cx, cz) => {            // излом в b: { cr, tan(половины угла) } или null
  const L1 = Math.hypot(bx - ax, bz - az), L2 = Math.hypot(cx - bx, cz - bz);
  if (L1 < 0.3 || L2 < 0.3) return null;
  const ux = (bx - ax) / L1, uz = (bz - az) / L1, vx = (cx - bx) / L2, vz = (cz - bz) / L2;
  const cr = ux * vz - uz * vx, dot = ux * vx + uz * vz;
  return { cr, tan: Math.abs(cr) / Math.max(0.05, 1 + dot) };
};
/* плавные улицы (roadsmooth.js): у точки дуги (излом ≤ ~25°) снаружи край не обрывается и не ведёт дугу камня — оба края
   продлены до биссектрисы излома («в ус», как плитка и тротуар в game.js), изнутри — как обычно, обрезаны. pre / post — точка
   соседнего куска за концом (стык двух кусков одной улицы на дуге) */
const ARCT = () => Math.tan(CURB.ARC) + 1e-6;       // tg половины излома, не больше: круче двух шагов дуги камня (~23°) — снаружи дугой (круглее), как у плитки
function line (pts, hw, lift, segs, pre = null, post = null) {
  const off = hw - CURB.IN + CURB.W / 2;            // середина камня от оси
  const SM = SMST.done > 0, MT = ARCT();
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az);
    if (L < 0.3) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L, self = segs ? segs[i - 1] : null;
    const pA = i > 1 ? pts[i - 2] : pre, pB = i < pts.length - 1 ? pts[i + 1] : post;
    const tA = pA ? turn(pA[0], pA[1], ax, az, bx, bz) : null;
    const tB = pB ? turn(ax, az, bx, bz, pB[0], pB[1]) : null;
    const mA = SM && tA && tA.tan < MT && isArc(ax, az), mB = SM && tB && tB.tan < MT && isArc(bx, bz);
    for (const sd of [-1, 1]) {
      const nx = -uz * sd, nz = ux * sd;
      // изнутри излома (нормаль этой стороны смотрит в поворот) — край короче на off·tg(угла/2); снаружи у точки дуги — длиннее
      const cutA = tA && tA.cr * sd > 0 ? Math.min(L / 2, off * tA.tan) : mA ? -off * tA.tan : 0;
      const cutB = tB && tB.cr * sd > 0 ? Math.min(L / 2, off * tB.tan) : mB ? -off * tB.tan : 0;
      if (cutA || cutB) ST.miter++;
      if (L - cutA - cutB < CURB.MIN) continue;
      // торцы по биссектрисе (0п72): изнутри излома — если обрезали ровно по ней (не зажали половиной отрезка), снаружи у точки дуги — продлили до неё;
      // снаружи с дугой — торец по лучу, высота как у дуги (без просадки)
      const inA = tA && tA.cr * sd > 0, inB = tB && tB.cr * sd > 0;
      const ma = inA ? (cutA >= off * tA.tan - 1e-6 ? tA.tan : 0) : mA ? -tA.tan : 0, mb = inB ? (cutB >= off * tB.tan - 1e-6 ? tB.tan : 0) : mB ? -tB.tan : 0;
      const arcA = !inA && !mA && !!tA && !RSW, arcB = !inB && !mB && !!tB && !RSW;
      edge([ax + nx * off, az + nz * off], ux, uz, nx, nz, L - cutB, lift, self, cutA, NOMITER ? null : { ma, mb, fa: !!ma || arcA, fb: !!mb || arcB });
    }
    if (i < pts.length - 1 && !RSW && !mB) {        // излом: снаружи — дугой от нормали этого отрезка до нормали следующего (у улиц — нет: угол тротуара — пятно, не дуга)
      const [cx, cz] = pts[i + 1], L2 = Math.hypot(cx - bx, cz - bz);
      if (L2 < 0.3) continue;
      const vx = (cx - bx) / L2, vz = (cz - bz) / L2, cr = ux * vz - uz * vx;
      if (Math.abs(cr) < 0.05 && ux * vx + uz * vz > 0) continue;   // почти прямо
      const sd = cr > 0 ? 1 : -1;                   // снаружи поворота — сторона −sd: нормаль (−uz, ux)·(−sd)
      const a0 = Math.atan2(ux * -sd, -uz * -sd), a1 = Math.atan2(vx * -sd, -vz * -sd);
      let da = a1 - a0;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      arc(bx, bz, off, a0, da, lift, null);
    }
  }
}

/* контур p мощёного (стоянка, площадка): камень снаружи по каждой стороне, вплотную к краю. На выпуклом углу края продлены
   до биссектрисы («в ус»), на вогнутом — обрезаны (камни сходятся в угол); у острого угла (круче ~100°) — не дальше 0,3 м */
function ring (p, lift, options = {}) {
  const prev = MIN_RUN; MIN_RUN = p.soft ? 0.035 : CURB.MIN;
  try { ringCore(p, lift, options); } finally { MIN_RUN = prev; }
}
function ringCore (p, lift, options) {
  const n = p.length;
  if (n < 3) return;
  let s2 = 0;
  for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; s2 += a[0] * b[1] - b[0] * a[1]; }
  const sg = s2 > 0 ? 1 : -1, off = CURB.W / 2 - CURB.IN;
  const short = p.soft ? 0.03 : 0.3;
  const U = [];
  for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); U.push(L > 1e-6 ? [(b[0] - a[0]) / L, (b[1] - a[1]) / L, L] : null); }
  const ext = (u, v) => {                           // на сколько продлить край у угла (u — до угла, v — после); < 0 — обрезать
    if (!u || !v) return 0;
    const cr = u[0] * v[1] - u[1] * v[0], dot = u[0] * v[0] + u[1] * v[1], tn = Math.abs(cr) / Math.max(0.05, 1 + dot);
    return Math.min(0.3, off * tn) * (cr * sg > 0 ? 1 : -1);   // против часовой (sg > 0): поворот влево — угол выпуклый
  };
  for (let i = 0; i < n; i++) {
    if ((options.open && i === n - 1) || (options.skipFirst && i === 0)) continue;
    const u = U[i];
    if (!u || u[2] < short) continue;
    let pi = (i - 1 + n) % n, ni = (i + 1) % n;
    while (pi !== i && (!U[pi] || U[pi][2] < short)) pi = (pi - 1 + n) % n;
    while (ni !== i && (!U[ni] || U[ni][2] < short)) ni = (ni + 1) % n;
    const nx = u[1] * sg, nz = -u[0] * sg, a = p[i];
    const eA = options.open && i === 0 ? 0 : ext(U[pi], u), eB = options.open && i === n - 2 ? 0 : ext(u, U[ni]);
    if (YN) { YN[0] = nx * 0.22; YN[1] = nz * 0.22; }
    if (u[2] + eA + eB < MIN_RUN) continue;
    if (eA || eB) ST.miter++;
    // торцы по биссектрисе (0п72): продлили (выпуклый угол — снаружи поворота, ta < 0) или обрезали (вогнутый, ta > 0) ровно до неё — не зажатый 0,3 м
    const tn = (u0, v0) => { const cr = u0[0] * v0[1] - u0[1] * v0[0], dot = u0[0] * v0[0] + u0[1] * v0[1]; return Math.abs(cr) / Math.max(0.05, 1 + dot); };
    const ma = eA && Math.abs(eA) >= off * tn(U[pi], u) - 1e-9 ? tn(U[pi], u) * (eA > 0 ? -1 : 1) : 0, mb = eB && Math.abs(eB) >= off * tn(u, U[ni]) - 1e-9 ? tn(u, U[ni]) * (eB > 0 ? -1 : 1) : 0;
    edge([a[0] + nx * off, a[1] + nz * off], u[0], u[1], nx, nz, u[2] + eB, lift, null, -eA, NOMITER ? null : { ma, mb, fa: !!ma, fb: !!mb });
  }
}

export function* build (api) {
  const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  if (QS && QS.has('nocurbs')) return ST;
  if (api.rebuild) {
    BG=new Map();BI.clear();BF=BWF=null;ON=false;
    if(TRACE)TRACE.length=0;
    if(TRACE_TOPOLOGY){TRACE_TOPOLOGY.active=false;TRACE_TOPOLOGY.links.length=TRACE_TOPOLOGY.bridges.length=TRACE_TOPOLOGY.open.length=0;}
    for(const k of Object.keys(ST))ST[k]=0;
  }
  const OLD = !!(QS && QS.has('oldcurbs'));         // ?oldcurbs — как до 24.10.2026: проезды только во дворах, без тупиков и улиц, камень 0,12 м, без потери скорости (сравнить)
  if (OLD) { RULES.on = false; CURB.H = 0.12; }
  BERM = !OLD && !(QS && QS.has('noberm'));        // 0п68: за камнем — скат газона (земля поднята); ?noberm, ?oldcurbs — без
  const t0 = performance.now();
  A = api; LITM = api.LITM; MOB = !!(api.mobile && api.mobile()); SEC = MOB ? CURB.SEC_MOB : CURB.SEC; ST.mob = MOB ? 1 : 0;
  if(api.contours){
    BERM=false;
    if(TRACE_TOPOLOGY)TRACE_TOPOLOGY.active=true;
    const edges=[];
    for(const e of api.contours()){if(e)edges.push(e);else yield 'бордюры: общий контур';}
    const mesh=joinLandCurbs(edges,CURB.W);edges.length=0;
    ST.contourOpen=mesh.open;ST.contourJoins=mesh.joins.length;
    const mix=(a,b,t)=>t===0?a:t===1?b:[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
    const top=p=>A.groundH(...p)+A.landTopAt(...p);
    const draw=(a,b,oa,ob,lift,k)=>{
      const ha=top(a),hb=top(b),fa=A.groundH(...oa)+lift-.035,fb=A.groundH(...ob)+lift-.035;
      if(ha<=fa||hb<=fb)return null;
      LITM.color(CURB.HEX[MOB?0:k&1]);
      if(MOB){
        // Как у прежнего мобильного камня, без отдельной фаски.
        // Высота, ширина и общие торцы остаются теми же.
        LITM.quad(oa[0],fa,oa[1],ob[0],fb,ob[1],ob[0],hb,ob[1],oa[0],ha,oa[1]);
        LITM.quad(oa[0],ha,oa[1],ob[0],hb,ob[1],b[0],hb,b[1],a[0],ha,a[1]);
      }else{
        const ca=mix(oa,a,.16),cb=mix(ob,b,.16),bevel=.02;
        LITM.quad(oa[0],fa,oa[1],ob[0],fb,ob[1],ob[0],hb-bevel,ob[1],oa[0],ha-bevel,oa[1]);
        LITM.quad(oa[0],ha-bevel,oa[1],ob[0],hb-bevel,ob[1],cb[0],hb,cb[1],ca[0],ha,ca[1]);
        LITM.quad(ca[0],ha,ca[1],cb[0],hb,cb[1],b[0],hb,b[1],a[0],ha,a[1]);
      }
      const id=TRACE?TRACE.length/18:null;
      if(TRACE)TRACE.push(oa[0],oa[1],ha,a[0],a[1],ha,ob[0],ob[1],hb,b[0],b[1],hb,(a[0]+b[0])/2,(a[1]+b[1])/2,...a,...b);
      ST.secs++;
      return id;
    };
    let count=0;
    for(const s of mesh.sections){
      const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],length=Math.hypot(dx,dz),n=Math.ceil(length/SEC);
      let previous=null;s.traceFirst=s.traceLast=null;
      for(let i=0;i<n;i++){
        const id=draw(mix(s.a,s.b,i/n),mix(s.a,s.b,(i+1)/n),mix(s.outA,s.outB,i/n),mix(s.outA,s.outB,(i+1)/n),s.lift,i);
        if(TRACE_TOPOLOGY){
          if(i===0)s.traceFirst=id;if(i===n-1)s.traceLast=id;
          if(id!==null){
            if(previous!==null)TRACE_TOPOLOGY.links.push(previous,id);
            else if(i>0)TRACE_TOPOLOGY.open.push(id,0);
          }else if(previous!==null)TRACE_TOPOLOGY.open.push(previous,1);
        }
        previous=id;
      }
      bgAdd(...s.a,...s.b,-dz/length,dx/length);ST.m+=length;ST.runs++;
      if(++count%128===0)yield 'бордюры: стыки';
    }
    if(TRACE_TOPOLOGY)for(const s of mesh.sections){
      if(s.traceFirst!==null&&(!s.prev||s.prev.traceLast===null))TRACE_TOPOLOGY.open.push(s.traceFirst,0);
      if(s.traceLast!==null&&(!s.next||s.next.traceFirst===null))TRACE_TOPOLOGY.open.push(s.traceLast,1);
      if(s.traceLast!==null&&s.next?.traceFirst!==null&&s.next?.traceFirst!==undefined&&s.outB===s.next.outA)TRACE_TOPOLOGY.links.push(s.traceLast,s.next.traceFirst);
    }
    for(const j of mesh.joins){
      const h=top(j.p),fa=A.groundH(...j.a)+j.lift-.035,fb=A.groundH(...j.b)+j.lift-.035;
      LITM.color(CURB.HEX[0]);LITM.up(j.p[0],h,j.p[1],j.a[0],h,j.a[1],j.b[0],h,j.b[1]);
      LITM.quad(j.a[0],fa,j.a[1],j.b[0],fb,j.b[1],j.b[0],h,j.b[1],j.a[0],h,j.a[1]);
      if(TRACE_TOPOLOGY){
        const prev=mesh.sections.find(s=>s.b===j.p&&s.outB===j.a),next=prev?.next;
        if(prev?.traceLast!==null&&prev?.traceLast!==undefined&&next?.traceFirst!==null&&next?.traceFirst!==undefined)TRACE_TOPOLOGY.bridges.push(prev.traceLast,next.traceFirst,...j.p,...j.a,...j.b,h);
      }
    }
    // После записи камня и сведений о стыках связанный граф больше
    // не нужен. Отпускаем его перед упаковкой опоры и загрузкой мешей.
    for(const s of mesh.sections)s.next=s.prev=null;
    mesh.sections.length=0;mesh.joins.length=0;
    yield 'бордюры: готовые стыки';
    bgPack();ON=true;ST.m=Math.round(ST.m);ST.ms=Math.round(performance.now()-t0);return ST;
  }
  const EVERY = !MOB && !OLD;                       // 0п35 (24.10.2026, «бордюры везде, где есть стыки между землёй и дорожками»): дорожки — по всему
  STRIPV = EVERY ? CURB.STRIP : CURB.STRIP_OLD;     // городу, стоянки, площадки, карманы, шов 0,25 м. Телефон и ?oldcurbs — как было (память)
  const C = A.CITY;
  // стоянки (CITY.lots: k = 'park') — асфальт: туда бордюр не ведём
  LOTS = new Map(); LOTX = new Map();
  for (const l of C.lots || []) {
    if (!l.p || l.p.length < 3) continue;
    const LM = l.k === 'park' ? LOTS : LOTX;        // площадки, промзоны, гаражи — не газон: только для края проездов и улиц (ALL)
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of l.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    const b = { p: l.p, x0, x1, z0, z1 };
    for (let i = Math.floor(x0 / 40); i <= Math.floor(x1 / 40); i++) for (let j = Math.floor(z0 / 40); j <= Math.floor(z1 / 40); j++) {
      const k = ck(i, j); let a = LM.get(k); if (!a) LM.set(k, a = []); a.push(b);
    }
  }
  ZN = new Set();
  for (const e of C.entrances || []) {
    const R = CURB.ZONE, kk = Math.ceil(R / ZC) + 1, ci = Math.floor(e[0] / ZC), cj = Math.floor(e[1] / ZC);
    for (let i = ci - kk; i <= ci + kk; i++) for (let j = cj - kk; j <= cj + kk; j++) if (Math.hypot((i + 0.5) * ZC - e[0], (j + 0.5) * ZC - e[1]) < R) ZN.add(ck(i, j));
  }
  PG = new Map();
  const lines = [];
  for (const q of C.paths) {
    if (!q || q.length < 2) continue;
    const hw = q.hw || 1, segs = [];
    for (let i = 1; i < q.length; i++) {
      const ax = q[i - 1][0], az = q[i - 1][1], bx = q[i][0], bz = q[i][1], R = hw + 1e-6;
      const s = [ax, az, bx, bz, hw, Math.min(ax, bx) - R, Math.min(az, bz) - R, Math.max(ax, bx) + R, Math.max(az, bz) + R, 0];   // + рамка (onPath), метка обхода (edge)
      segs.push(s); pgAdd(s);
    }
    lines.push([q, hw, q.lift || 0.085, segs]);
  }
  yield 'бордюры: сетка';
  let n = 0, m0 = 0, acc = 0;
  ALL = EVERY;                                      // дорожки: на компьютере — по всему городу (и в парках), телефон — только во дворах
  for (const [q, hw, lift, segs] of lines) {
    if (A.inBounds && !A.inBounds(q[0][0], q[0][1], -20)) continue;
    line(q, hw, lift, segs);
    for (const sg of segs) acc += Math.hypot(sg[2] - sg[0], sg[3] - sg[1]);
    if (++n % 40 === 0 || acc > 350) { acc = 0; yield 'бордюры: дорожки'; }   // шаг ≤ ~50 мс на Деке: 40 дорожек или 350 м (длинные дорожки парков); случайных чисел здесь нет — шаги можно двигать
  }
  ALL = false;
  ST.pathM = Math.round(ST.m); m0 = ST.m;
  // дворовые проезды и пешеходки: по внешнему краю их плитки — по всему городу, не только во дворах (11ц, 24.10.2026: «надо
  // подталкивать, чтобы ездил именно по дороге»); тупик проезда — поперёк, у конца плитки (телефон — нет: пик памяти поздней сборки у порога)
  const inB = r => !A.inBounds || (OLD ? A.inBounds(r.p[0][0], r.p[0][1], -20) : r.p.some(q => A.inBounds(q[0], q[1], -20)));   // хоть одна точка в черте (до 24.10.2026 — первая: проезды, что начинались за краем, оставались без камня)
  ALL = !OLD;
  const deg = new Map(), pk = q => q[0] * 65536 + q[1];
  if (!MOB) for (const r of C.roads) for (let i = 0; i < r.p.length; i++) { const k = pk(r.p[i]); deg.set(k, (deg.get(k) || 0) + (i === 0 || i === r.p.length - 1 ? 1 : 2)); }
  // плавные улицы: стык двух кусков одной улицы на дуге (в точке концы ровно двух) — точка соседа за концом (line: pre / post)
  const ENDS = new Map();
  if (!MOB && SMST.done) for (const r of C.roads) if (r.p.length >= 2) for (const [e, f] of [[r.p[0], r.p[1]], [r.p[r.p.length - 1], r.p[r.p.length - 2]]]) {
    if (!isArc(e[0], e[1])) continue;
    const k = pk(e); let a = ENDS.get(k); if (!a) ENDS.set(k, a = []); a.push([r, f]);
  }
  const nbAt = (r, e) => {
    if (!ENDS.size || deg.get(pk(e)) !== 2) return null;
    const a = ENDS.get(pk(e));
    const o = a && a.length === 2 ? a.find(q => q[0] !== r) : null;
    return o ? o[1] : null;
  };
  const joint = r => [nbAt(r, r.p[0]), nbAt(r, r.p[r.p.length - 1])];
  for (const r of MOB ? [] : C.roads) {
    if (r.b || (r.c !== 6 && r.c !== 7) || r.p.length < 2) continue;
    if (!inB(r)) continue;
    const hw = A.roadWidth(r) / 2 + CURB.DRIVE;
    let curbPath = r.p;
    if (!OLD && r.softEnds?.some(Boolean)) {
      curbPath = r.p.map(p => p.slice());
      for (const [end, idx, nb] of [[0, 0, 1], [1, r.p.length - 1, r.p.length - 2]]) if (r.softEnds[end]) {
        const e = r.p[idx], f = r.p[nb], l = Math.hypot(f[0] - e[0], f[1] - e[1]);
        const trim = Math.min(SOFTSURF.CAP * 3, l * 0.45);
        curbPath[idx] = [e[0] + (f[0] - e[0]) * trim / l, e[1] + (f[1] - e[1]) * trim / l];
      }
    }
    line(curbPath, hw, 0.09, null, ...joint(r));
    if (r.c === 7 && !OLD) for (const [e, f] of [[r.p[0], r.p[1]], [r.p[r.p.length - 1], r.p[r.p.length - 2]]]) {
      if (deg.get(pk(e)) !== 1) continue;
      const L = Math.hypot(e[0] - f[0], e[1] - f[1]);
      if (L < 1) continue;
      const ux = (e[0] - f[0]) / L, uz = (e[1] - f[1]) / L, vx = -uz, vz = ux, off = hw - CURB.IN + CURB.W / 2, c = CURB.W / 2 - CURB.IN, m1 = ST.m;
      CX = ux * (hw + 0.15); CZ = uz * (hw + 0.15);
      const softEnd = r.softEnds?.[e === r.p[0] ? 0 : 1];
      if (softEnd) ring(SOFTSURF.endOutline(e, f, hw, Math.min(SOFTSURF.CAP * 3, L * 0.45)), 0.09, { open: true });
      else edge([e[0] + ux * c - vx * off, e[1] + uz * c - vz * off], vx, vz, ux, uz, off * 2, 0.09, null);   // поперёк конца: газон — дальше по ходу
      CX = CZ = 0;
      ST.capM += ST.m - m1;
    }
    if (++n % 15 === 0) yield 'бордюры: проезды';  // проезды длиннее дорожек: на Деке по 70 было до 95 мс на шаг
  }
  ST.driveM = Math.round(ST.m - m0); m0 = ST.m;
  // улицы (класс ≤ 5): по внешнему краю тротуара — только там, где он не поднят (у перекрёстков, зебр, стыков и обрывков
  // поднятого тротуара — плита вровень с газоном): камень тот же, что у проездов
  for (const r of MOB || OLD || !A.curbAt ? [] : C.roads) {
    if (r.b || r.c > 5 || r.x || r.p.length < 2) continue;
    if (!inB(r)) continue;
    const w = A.roadWidth(r);
    RSW = 2.75 + (r.g || 0) + CURB.W / 2;
    line(r.p, w / 2 + 2.75 + (r.g || 0), 0.1 + (7 - r.c) * 0.004, null, ...joint(r));
    RSW = 0;
    if (++n % 15 === 0) yield 'бордюры: улицы';
  }
  ST.streetM = Math.round(ST.m - m0); m0 = ST.m;
  // стоянки из карты (асфальт 0,11), детские и спортплощадки (CITY.green 'play' / 'pitch'), карманы парковки дворов (0п35, 24.10.2026):
  // камень по краю, где за ним газон; въезд с проезда, дорожка, тротуар, соседняя площадка — понижение (covered)
  const inP = pp => !A.inBounds || pp.some(q => A.inBounds(q[0], q[1], -20));
  if (EVERY) {
    for (const l of C.lots || []) if (l.k === 'park' && l.p && l.p.length > 2 && inP(l.p)) { ring(l.softP || l.p, 0.11); if (++n % 15 === 0) yield 'бордюры: стоянки'; }
    ST.lotM = Math.round(ST.m - m0); m0 = ST.m;
    for (const g of C.green || []) if ((g.k === 'play' || g.k === 'pitch') && g.p && g.p.length > 2 && inP(g.p)) { ring(g.softP || g.p, 0.045); if (++n % 15 === 0) yield 'бордюры: площадки'; }
    ST.playM = Math.round(ST.m - m0); m0 = ST.m;
    const off = CURB.W / 2 - CURB.IN, YQ = [0, 0];
    YN = YQ;
    for (const P of YCD.POCKETS) {
      if (P.outline?.soft) { ring(P.outline, 0.1, { skipFirst: true }); if (++n % 60 === 0) yield 'бордюры: карманы'; continue; }
      const { cx, cz, ux, uz, nx, nz, hl, hd } = P, fx = cx + nx * hd, fz = cz + nz * hd;
      YQ[0] = nx * 0.22; YQ[1] = nz * 0.22;
      edge([fx + nx * off - ux * hl, fz + nz * off - uz * hl], ux, uz, nx, nz, hl * 2, 0.1, null);   // дальний край (ближний — у проезда)
      for (const sd of [-1, 1]) {                   // торцы: от проезда к дальнему краю
        const ex = cx + ux * (hl + off) * sd, ez = cz + uz * (hl + off) * sd;
        YQ[0] = ux * sd * 0.22; YQ[1] = uz * sd * 0.22;
        edge([ex - nx * hd, ez - nz * hd], nx, nz, ux * sd, uz * sd, hd * 2 + off, 0.1, null);
      }
      if (++n % 60 === 0) yield 'бордюры: карманы';
    }
    YN = null;
    ST.pocketM = Math.round(ST.m - m0);
  }
  ALL = false;
  ST.capM = Math.round(ST.capM);
  bgPack();                                         // толчок: один типизированный массив (меньше памяти, чем массивы чисел)
  PG = null; LOTS = null; LOTX = null; ZN = null;
  ON = true;
  ST.m = Math.round(ST.m);
  ST.ms = Math.round(performance.now() - t0);
  return ST;
}

/* бордюр ближе r к точке */
export function near (x, z, r = 0.3) {
  if (!ON) return false;
  const v = BI.get(ck(Math.floor(x / BC), Math.floor(z / BC)));
  if (v === undefined) return false;
  const a = BF, i0 = Math.floor(v / 1024) * 4, i1 = i0 + (v % 1024) * 4;
  for (let i = i0; i < i1; i += 4) if (segD(x, z, a[i], a[i + 1], a[i + 2], a[i + 3]) < r) return true;
  return false;
}
/* отрезок p—q пересекает камень? 1 — заехал на газон (q слева от камня), −1 — съехал с газона, 0 — нет */
function crosses (px, pz, qx, qz) {
  const kq = ck(Math.floor(qx / BC), Math.floor(qz / BC)), kp = ck(Math.floor(px / BC), Math.floor(pz / BC));
  return crossIn(kq, px, pz, qx, qz) || (kp !== kq ? crossIn(kp, px, pz, qx, qz) : 0);
}
function crossIn (key, px, pz, qx, qz) {
  const v = BI.get(key);
  if (v === undefined) return 0;
  const a = BF, i0 = Math.floor(v / 1024) * 4, i1 = i0 + (v % 1024) * 4;
  const dx = qx - px, dz = qz - pz;
  for (let i = i0; i < i1; i += 4) {
    const ax = a[i], az = a[i + 1], ex = a[i + 2] - ax, ez = a[i + 3] - az, den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((ax - px) * ez - (az - pz) * ex) / den, u = ((ax - px) * dz - (az - pz) * dx) / den;
    if (t >= 0 && t <= 1 && u >= -0.02 && u <= 1.02) return ex * (qz - az) - ez * (qx - ax) > 0 ? 1 : -1;
  }
  return 0;
}
/* Толчок: переднее или заднее колесо (по оси машины, ±1,4 м) за кадр пересекло камень — кузов подкидывает.
   Вернёт прибавку к высоте кузова, м. V — машина игрока (x, z, h, vx, vz, air).
   Какой удар (11ц, 24.10.2026) — took(): передние колёса через камень на газон — 'curb' (теряешь скорость, уводит вбок,
   carbump.js), с газона на мощёное — 'curbOff' (слабее), задние — 'curbRear' (чуть) */
const BS = { lift: 0, vy: 0, fx: NaN, fz: NaN, rx: NaN, rz: NaN, shake: 0, hit: '' };
export function bump (V, dt) {
  if (!ON) return 0;
  const sx = Math.sin(V.h), sz = Math.cos(V.h);
  const fx = V.x + sx * 1.4, fz = V.z + sz * 1.4, rx = V.x - sx * 1.45, rz = V.z - sz * 1.45;
  const sp = Math.hypot(V.vx || 0, V.vz || 0);
  if (!V.air && BS.fx === BS.fx && sp > 0.8) {
    const step = Math.hypot(fx - BS.fx, fz - BS.fz);
    const f = step < 3 ? crosses(BS.fx, BS.fz, fx, fz) : 0, r = step < 3 && !f ? crosses(BS.rx, BS.rz, rx, rz) : 0;
    if (f || r) {
      const k = Math.min(1, 0.35 + sp / 9);
      BS.vy = Math.max(BS.vy, (f > 0 ? CURB.BUMP_ON : CURB.BUMP) * k * (BERM ? 9 : 18));    // вверх, гаснет пружиной; со скатом (0п68) — вдвое мягче: кузов и так встаёт на поднятую землю
      BS.shake = (f > 0 ? 0.09 : 0.06) * k * (BERM ? 0.45 : 1);
      BS.hit = f > 0 ? 'curb' : f < 0 ? 'curbOff' : 'curbRear';
      ST.bumps++;
      if (f > 0) ST.onLawn++; else if (f < 0) ST.offLawn++;
    }
  }
  BS.fx = fx; BS.fz = fz; BS.rx = rx; BS.rz = rz;
  // пружина: подкинуло и опустилось (~0,2 с)
  BS.lift += BS.vy * dt;
  BS.vy -= (BERM ? BS.lift * 160 + BS.vy * 14 : BS.lift * 380 + BS.vy * 18) * dt;   // со скатом — пружина мягче и дольше (~0,3 с): «мягкий толчок подвески»
  if (BS.lift < 0) { BS.lift = 0; if (BS.vy < 0) BS.vy = 0; }
  if (BS.lift > CURB.LIFT_MAX) BS.lift = CURB.LIFT_MAX;
  return BS.lift;
}
/* Высота земли за камнем в точке (0п68): над камнем — его верх, на скате — от верха вниз до газона; нет ската — 0. В метрах над
   рельефом (как paveLift и curbAt в game.js): машина игрока встаёт на скат передними и задними колёсами (game.js, кузов и наклон) */
export function liftAt (x, z) {
  if (!ON || !BERM) return 0;
  const v = BI.get(ck(Math.floor(x / BC), Math.floor(z / BC)));
  if (v === undefined) return 0;
  const a = BF, i0 = Math.floor(v / 1024) * 4, i1 = i0 + (v % 1024) * 4, hw = CURB.W / 2;
  let h = 0;
  for (let i = i0; i < i1; i += 4) {
    const w = BWF[i / 2];
    if (!w) continue;
    const ax = a[i], az = a[i + 1], ex = a[i + 2] - ax, ez = a[i + 3] - az, l2 = ex * ex + ez * ez;
    if (l2 < 1e-6) continue;
    const t = ((x - ax) * ex + (z - az) * ez) / l2;
    if (t < -0.02 || t > 1.02) continue;
    const s = (ex * (z - az) - ez * (x - ax)) / Math.sqrt(l2);   // к газону — плюс (bgAdd: газон слева)
    if (s < -hw || s > hw + w) continue;
    const top = BWF[i / 2 + 1], y = s <= hw ? top : top * (1 - (s - hw) / w);
    if (y > h) h = y;
  }
  return h;
}
/* тряска камеры от последнего толчка (game.js берёт и обнуляет) */
export function shake () { const s = BS.shake; BS.shake = 0; return s; }
/* какой удар был за кадр ('curb' | 'curbOff' | 'curbRear' | ''): game.js берёт, обнуляет и бьёт машину (carbump.js hit) */
export function took () { const h = BS.hit; BS.hit = ''; return RULES.on ? h : ''; }

export const DEBUG = { CURB, ST, near, liftAt, get berm () { return BERM; }, get trace () { return TRACE; }, get traceTopology () { return TRACE_TOPOLOGY?.active?TRACE_TOPOLOGY:null; }, get api () { return A; }, get cells () { return BI.size; }, get floats () { return BF ? BF.length : 0; }, get segs () { return BF; }, BS };
