/* ──────────────────────────────────────────────────────────────────────────
   Бордюры во дворах (автор 18.10.2026: «между газоном и дорожкой резкий стык, некрасивый. Дорожка обычно
   с двух сторон огорожена бордюром… во дворах всё ещё очень гладко… чтобы дорога отделялась от газонов
   высотой»). Правила словами — docs/CAREER.md «Город: как выглядит» → «Бордюры у дорожек и проездов».

   Где: по обоим краям
     • дорожек во дворах и парках (CITY.paths: тропинки к подъездам, общие дорожки, выходы в сеть, дорожки
       вдоль стен, дорожки из карты) — у каждой своя полуширина (pts.hw; нет — 1 м, как плитка 2 м);
     • дворовых проездов и пешеходок (класс 7 и 6) — по внешнему краю их плитки (метр за асфальтом).
   Только во дворах: середина края ближе ZONE м к подъезду (парки и промзоны — без бордюров, память).
   Бордюрный камень: ширина W (0,12 м), верх на H (0,12 м) выше плитки — над газоном 0,2 м; секции по SEC м
   (на компьютере — через одну чуть другого серого, видны стыки; местами просевшие и со сколом).
   Нет бордюра там, где край ложится на другое мощёное: чужую дорожку (перекрёсток дорожек), тротуар,
   полотно, аллею, стоянку, карман парковки двора, в дом — там он «опущен» сам собой (заезды, стыки).
   Нет и там, где за камнем — узкая (до STRIP м) полоска газона, а за ней вдоль края снова мощёное (дорожка
   вдоль тротуара улицы, отмостка вдоль проезда): на стыке газона и тротуара бордюра нет (23.10.2026).
   На изломе дорожки снаружи — дугой шагами ARC, по тем же лучам, что и угол плитки (bendFan: плитка дорожек
   из карты и проездов на изломе — веер теми же шагами, а не 6—9-угольник): камень идёт точно по краю
   плитки; изнутри излома камни сходятся в угол (обрезаны по пересечению), а не заходят друг за друга.

   Машина: бордюр — не стена. Колесо переехало камень — толчок вверх (BUMP м, гаснет за ~0,2 с) и тряска
   камеры; скорость не теряется (step). Люди и машины потока — как раньше.

   Всё — треугольниками в клетки земли и дорог (LITM): новых вызовов отрисовки нет. Телефон (MOB): секции
   длиннее (SEC_MOB), одного цвета — вершины соседних секций общие; камень клином (грань к дорожке и скат к
   газону, без отдельного верха) — вдвое меньше треугольников; только у дорожек, у проездов — нет (память).

     CURBS.build(api)            — LATE-шаг (game.js, после лабиринта дворов, до smashBuild); шагами
     CURBS.bump(V, dt)           — каждый кадр езды: толчок от бордюра под колёсами, м (прибавка к высоте кузова)
     CURBS.near(x, z, r)         — бордюр ближе r (yarddecor.js: не ставить на него)
   ?nocurbs — без бордюров (сравнить).
   ────────────────────────────────────────────────────────────────────────── */

export const CURB = {
  W: 0.12,            // ширина камня, м
  H: 0.12,            // верх над плиткой дорожки, м (над газоном — плитка 0,085 + H ≈ 0,2)
  IN: 0.02,           // камень заходит на плитку, м (без щели между ними)
  SEC: 2.0,           // секция, м (телефон — SEC_MOB, одним цветом)
  SEC_MOB: 6.0,
  ZONE: 60,           // только во дворах: подъезд ближе, м
  STEP: 0.25,         // шаг проверки края, м (концы — точнее, делением пополам)
  MIN: 0.45,          // кусок короче — не кладём, м
  HEX: ['#aeaba3', '#a3a098'],   // серый бетон, темнее плитки (видно издали); через одну — видны стыки
  CHIP: '#8f8c85',    // со сколом (темнее)
  SUNK: 0.07,         // доля просевших секций (верх ниже на 3—6 см, наклон)
  CHIPS: 0.05,        // доля секций со сколом
  DRIVE: 1.0,         // проезд (класс 7) и пешеходка (6): плитка за асфальтом, м (pave.js PAVE.SIDE)
  BUMP: 0.07,         // толчок кузова, м (на скорости от 6 м/с; медленнее — меньше)
  ARC: 0.2,           // дуга на изломе: шаг, рад (тот же — у веера плитки, bendFan; до 23.10.2026 — 0,45 и 6—9-угольник плитки)
  STRIP: 0.9,         // за камнем газон уже этого, а дальше вдоль края мощёное — бордюра нет, м
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
export const ST = { ms: 0, runs: 0, m: 0, secs: 0, pathM: 0, driveM: 0, arcs: 0, cut: 0, strip: 0, miter: 0, bumps: 0, mob: 0 };

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
let PG = null, LOTS = null;
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
function inLot (x, z) {
  const a = LOTS.get(ck(Math.floor(x / 40), Math.floor(z / 40)));
  if (a) for (const b of a) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && A.inPoly(x, z, b.p)) return true;
  return false;
}
/* стоянка, чья рамка задевает прямоугольник */
function lotIn (x0, z0, x1, z1) {
  for (let i = Math.floor(x0 / 40); i <= Math.floor(x1 / 40); i++) for (let j = Math.floor(z0 / 40); j <= Math.floor(z1 / 40); j++) {
    const a = LOTS.get(ck(i, j));
    if (a) for (const b of a) if (b.x1 >= x0 && b.x0 <= x1 && b.z1 >= z0 && b.z0 <= z1) return true;
  }
  return false;
}
/* по краю (edge): есть ли вообще рядом дом / стоянка / карман парковки. Нет — их пробы в точках края заведомо «нет», и их
   не зовём (ответ тот же; на Деке бордюры строились ~5 с, это треть). Вне края (дуги) — всё как есть */
let EH = true, EL = true, EY = true;
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
  if (!inZone(x, z)) return true;
  if (onPath(x, z, self)) return true;
  if (rwa(x, z)) return true;
  if (EH && A.inHouse(x, z, 0.05)) return true;
  if (A.groundH(x, z) < 0.3) return true;
  if (EL && inLot(x, z)) return true;
  if (EY && A.ycBlocks && A.ycBlocks(x, z, 0.2)) return true;
  if (A.extra && A.extra(x, z)) return true;
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
  const g = CURB.W / 2 + CURB.STRIP, px = x + nx * g, pz = z + nz * g;
  return paved(px, pz) && paved(px + ux, pz + uz) && paved(px - ux, pz - uz);
}

/* дворы: клетки 20 м, середина которых ближе ZONE м к подъезду */
let ZN = null;
const ZC = 20;
const inZone = (x, z) => ZN.has(ck(Math.floor(x / ZC), Math.floor(z / ZC)));

/* ── толчок: куски бордюра по клеткам BC м (середина камня, отрезок). На время сборки — массивы чисел по клеткам,
   потом — один Float32Array, по ключу клетки — где начинается и сколько (BI: начало × 1024 + сколько) ── */
const BC = 32;
let BG = new Map(), BI = new Map(), BF = null;
function bgAdd (ax, az, bx, bz) {
  for (let i = Math.floor((Math.min(ax, bx) - 0.2) / BC); i <= Math.floor((Math.max(ax, bx) + 0.2) / BC); i++)
    for (let j = Math.floor((Math.min(az, bz) - 0.2) / BC); j <= Math.floor((Math.max(az, bz) + 0.2) / BC); j++) {
      const k = ck(i, j);
      let a = BG.get(k);
      if (!a) BG.set(k, a = []);
      a.push(ax, az, bx, bz);
    }
}
function bgPack () {
  let n = 0;
  for (const a of BG.values()) n += Math.min(a.length, 4 * 1023);
  BF = new Float32Array(n);
  let o = 0;
  for (const [k, a] of BG) {
    const m = Math.min(a.length, 4 * 1023);
    for (let i = 0; i < m; i++) BF[o + i] = a[i];
    BI.set(k, (o / 4) * 1024 + m / 4);
    o += m;
  }
  BG = null;
}

/* ── геометрия: секция камня от (x0, z0) до (x1, z1) по средней линии; nx, nz — от дорожки к газону ── */
let LITM = null, SEC = 1, MOB = false;
const hexOf = (x, z, k) => (MOB ? CURB.HEX[0] : hsh(x, z, 5) < CURB.CHIPS ? CURB.CHIP : CURB.HEX[k & 1]);
function section (x0, z0, x1, z1, nx, nz, lift, k) {
  const hw = CURB.W / 2 + CURB.IN / 2, ow = CURB.W / 2 - CURB.IN / 2;
  const ix0 = x0 - nx * hw, iz0 = z0 - nz * hw, ix1 = x1 - nx * hw, iz1 = z1 - nz * hw;   // к дорожке
  const ox0 = x0 + nx * ow, oz0 = z0 + nz * ow, ox1 = x1 + nx * ow, oz1 = z1 + nz * ow;   // к газону
  const gi0 = A.groundH(ix0, iz0), gi1 = A.groundH(ix1, iz1), go0 = A.groundH(ox0, oz0), go1 = A.groundH(ox1, oz1);
  let t0 = Math.max(gi0, go0) + lift + CURB.H, t1 = Math.max(gi1, go1) + lift + CURB.H;
  if (!MOB && hsh(x0, z0, 3) < CURB.SUNK) { const s = 0.03 + hsh(x0, z0, 4) * 0.03; if (hsh(x1, z1, 6) < 0.5) { t0 -= s; t1 -= s * 0.4; } else { t1 -= s; t0 -= s * 0.4; } }
  LITM.color(hexOf(x0, z0, k));
  const b0 = gi0 + lift - 0.035, b1 = gi1 + lift - 0.035;
  LITM.quad(ix0, b0, iz0, ix1, b1, iz1, ix1, t1, iz1, ix0, t0, iz0);           // к дорожке
  if (MOB) {                                         // клин: от верха грани к дорожке — скатом к газону
    LITM.quad(ix0, t0, iz0, ix1, t1, iz1, ox1, go1 - 0.03, oz1, ox0, go0 - 0.03, oz0);
  } else {
    LITM.quad(ix0, t0, iz0, ix1, t1, iz1, ox1, t1, oz1, ox0, t0, oz0);         // верх
    LITM.quad(ox0, t0, oz0, ox1, t1, oz1, ox1, go1 - 0.03, oz1, ox0, go0 - 0.03, oz0);   // к газону
  }
  ST.secs++;
}
/* кусок [t0, t1] края: секции и толчок */
function run (P, ux, uz, nx, nz, t0, t1, lift) {
  const L = t1 - t0;
  if (L < CURB.MIN) return;
  const n = Math.max(1, Math.round(L / SEC)), sl = L / n;
  const k0 = Math.round(t0 / SEC);
  for (let k = 0; k < n; k++) {
    const a = k ? t0 + k * sl : t0, b = k + 1 < n ? t0 + (k + 1) * sl : t1;   // концы соседних секций — одно и то же число (общие вершины)
    section(P[0] + ux * a, P[1] + uz * a, P[0] + ux * b, P[1] + uz * b, nx, nz, lift, k0 + k);
  }
  bgAdd(P[0] + ux * t0, P[1] + uz * t0, P[0] + ux * t1, P[1] + uz * t1);
  ST.runs++; ST.m += L;
}
/* край отрезка: P — начало средней линии камня, вдоль u на L м; где не накрыто — куски */
function edge (P, ux, uz, nx, nz, L, lift, self, t0 = 0) {
  const st = CURB.STEP, at = t => covered(P[0] + ux * t, P[1] + uz * t, self) || (strip(P[0] + ux * t, P[1] + uz * t, ux, uz, nx, nz) && ++ST.strip > 0);
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
    // дорожки рядом: из клеток PG, чья рамка (+ полуширина) задевает край с полоской (± M); куски дорог — у pave.js
    const st = ++PST; EPL.length = 0;
    for (let i = Math.floor((x0 - M) / PC); i <= Math.floor((x1 + M) / PC); i++)
      for (let j = Math.floor((z0 - M) / PC); j <= Math.floor((z1 + M) / PC); j++) {
        const c = PG.get(ck(i, j));
        if (c) for (let k = 0; k < c.length; k++) { const q = c[k]; if (q[9] !== st && q[7] >= x0 - M && q[5] <= x1 + M && q[8] >= z0 - M && q[6] <= z1 + M) { q[9] = st; EPL.push(q); } }
      }
    if (A.roadsIn) A.roadsIn(x0 - M, z0 - M, x1 + M, z1 + M, ERL);
    EP = !!A.roadsIn;
  }
  let s0 = null, prevT = t0, prevFree = false;
  for (let t = t0; ; t += st) {
    const tt = Math.min(t, L), free = !at(tt);
    if (free && s0 === null) s0 = tt > t0 && !prevFree ? fine(tt, prevT, true) : tt;
    if (!free && s0 !== null) { run(P, ux, uz, nx, nz, s0, fine(prevT, tt, true), lift); s0 = null; ST.cut++; }
    prevT = tt; prevFree = free;
    if (tt >= L) break;
  }
  EH = EL = EY = true; EP = false;
  if (s0 !== null) run(P, ux, uz, nx, nz, s0, L, lift);
}
/* дуга снаружи излома: вокруг точки (cx, cz) радиусом r от угла a0 на da */
function arc (cx, cz, r, a0, da, lift, self) {
  const n = arcN(da);
  for (let k = 0; k < n; k++) {
    const a = a0 + da * k / n, b = a0 + da * (k + 1) / n, m = (a + b) / 2;
    const mx = cx + Math.cos(m) * r, mz = cz + Math.sin(m) * r;
    if (covered(mx, mz, self)) continue;
    const x0 = cx + Math.cos(a) * r, z0 = cz + Math.sin(a) * r, x1 = cx + Math.cos(b) * r, z1 = cz + Math.sin(b) * r;
    section(x0, z0, x1, z1, Math.cos(m), Math.sin(m), lift, k);
    bgAdd(x0, z0, x1, z1);
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
function line (pts, hw, lift, segs) {
  const off = hw - CURB.IN + CURB.W / 2;            // середина камня от оси
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az);
    if (L < 0.3) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L, self = segs ? segs[i - 1] : null;
    const tA = i > 1 ? turn(pts[i - 2][0], pts[i - 2][1], ax, az, bx, bz) : null;
    const tB = i < pts.length - 1 ? turn(ax, az, bx, bz, pts[i + 1][0], pts[i + 1][1]) : null;
    for (const sd of [-1, 1]) {
      const nx = -uz * sd, nz = ux * sd;
      // изнутри излома (нормаль этой стороны смотрит в поворот) — край короче на off·tg(угла/2)
      const cutA = tA && tA.cr * sd > 0 ? Math.min(L / 2, off * tA.tan) : 0;
      const cutB = tB && tB.cr * sd > 0 ? Math.min(L / 2, off * tB.tan) : 0;
      if (cutA || cutB) ST.miter++;
      if (L - cutA - cutB < CURB.MIN) continue;
      edge([ax + nx * off, az + nz * off], ux, uz, nx, nz, L - cutB, lift, self, cutA);
    }
    if (i < pts.length - 1) {                       // излом: снаружи — дугой от нормали этого отрезка до нормали следующего
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

export function* build (api) {
  const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  if (QS && QS.has('nocurbs')) return ST;
  const t0 = performance.now();
  A = api; LITM = api.LITM; MOB = !!(api.mobile && api.mobile()); SEC = MOB ? CURB.SEC_MOB : CURB.SEC; ST.mob = MOB ? 1 : 0;
  const C = A.CITY;
  // стоянки (CITY.lots: k = 'park') — асфальт: туда бордюр не ведём
  LOTS = new Map();
  for (const l of C.lots || []) {
    if (l.k !== 'park' || !l.p || l.p.length < 3) continue;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of l.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    const b = { p: l.p, x0, x1, z0, z1 };
    for (let i = Math.floor(x0 / 40); i <= Math.floor(x1 / 40); i++) for (let j = Math.floor(z0 / 40); j <= Math.floor(z1 / 40); j++) {
      const k = ck(i, j); let a = LOTS.get(k); if (!a) LOTS.set(k, a = []); a.push(b);
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
  let n = 0, m0 = 0;
  for (const [q, hw, lift, segs] of lines) {
    if (A.inBounds && !A.inBounds(q[0][0], q[0][1], -20)) continue;
    line(q, hw, lift, segs);
    if (++n % 40 === 0) yield 'бордюры: дорожки';   // шаг ≤ ~50 мс на Деке (случайных чисел здесь нет — шаги можно двигать)
  }
  ST.pathM = Math.round(ST.m); m0 = ST.m;
  // дворовые проезды и пешеходки: по внешнему краю их плитки (телефон — нет: пик памяти поздней сборки у порога)
  for (const r of MOB ? [] : C.roads) {
    if (r.b || (r.c !== 6 && r.c !== 7) || r.p.length < 2) continue;
    if (A.inBounds && !A.inBounds(r.p[0][0], r.p[0][1], -20)) continue;
    line(r.p, A.roadWidth(r) / 2 + CURB.DRIVE, 0.09, null);
    if (++n % 15 === 0) yield 'бордюры: проезды';  // проезды длиннее дорожек: на Деке по 70 было до 95 мс на шаг
  }
  ST.driveM = Math.round(ST.m - m0);
  bgPack();                                         // толчок: один типизированный массив (меньше памяти, чем массивы чисел)
  PG = null; LOTS = null; ZN = null;
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
/* отрезок p—q пересекает камень? */
function crosses (px, pz, qx, qz) {
  const kq = ck(Math.floor(qx / BC), Math.floor(qz / BC)), kp = ck(Math.floor(px / BC), Math.floor(pz / BC));
  return crossIn(kq, px, pz, qx, qz) || (kp !== kq && crossIn(kp, px, pz, qx, qz));
}
function crossIn (key, px, pz, qx, qz) {
  const v = BI.get(key);
  if (v === undefined) return false;
  const a = BF, i0 = Math.floor(v / 1024) * 4, i1 = i0 + (v % 1024) * 4;
  const dx = qx - px, dz = qz - pz;
  for (let i = i0; i < i1; i += 4) {
    const ax = a[i], az = a[i + 1], ex = a[i + 2] - ax, ez = a[i + 3] - az, den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((ax - px) * ez - (az - pz) * ex) / den, u = ((ax - px) * dz - (az - pz) * dx) / den;
    if (t >= 0 && t <= 1 && u >= -0.02 && u <= 1.02) return true;
  }
  return false;
}
/* Толчок: переднее или заднее колесо (по оси машины, ±1,4 м) за кадр пересекло камень — кузов подкидывает.
   Вернёт прибавку к высоте кузова, м. V — машина игрока (x, z, h, vx, vz, air) */
const BS = { lift: 0, vy: 0, fx: NaN, fz: NaN, rx: NaN, rz: NaN, shake: 0 };
export function bump (V, dt) {
  if (!ON) return 0;
  const sx = Math.sin(V.h), sz = Math.cos(V.h);
  const fx = V.x + sx * 1.4, fz = V.z + sz * 1.4, rx = V.x - sx * 1.45, rz = V.z - sz * 1.45;
  const sp = Math.hypot(V.vx || 0, V.vz || 0);
  if (!V.air && BS.fx === BS.fx && sp > 0.8) {
    const step = Math.hypot(fx - BS.fx, fz - BS.fz);
    if (step < 3 && (crosses(BS.fx, BS.fz, fx, fz) || crosses(BS.rx, BS.rz, rx, rz))) {
      const k = Math.min(1, 0.35 + sp / 9);
      BS.vy = Math.max(BS.vy, CURB.BUMP * k * 18);    // вверх, гаснет пружиной
      BS.shake = 0.06 * k;
      ST.bumps++;
    }
  }
  BS.fx = fx; BS.fz = fz; BS.rx = rx; BS.rz = rz;
  // пружина: подкинуло и опустилось (~0,2 с)
  BS.lift += BS.vy * dt;
  BS.vy -= (BS.lift * 380 + BS.vy * 18) * dt;
  if (BS.lift < 0) { BS.lift = 0; if (BS.vy < 0) BS.vy = 0; }
  if (BS.lift > 0.12) BS.lift = 0.12;
  return BS.lift;
}
/* тряска камеры от последнего толчка (game.js берёт и обнуляет) */
export function shake () { const s = BS.shake; BS.shake = 0; return s; }

export const DEBUG = { CURB, ST, near, get cells () { return BI.size; }, get floats () { return BF ? BF.length : 0; }, get segs () { return BF; }, BS };
