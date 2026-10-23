/* ──────────────────────────────────────────────────────────────────────────
   Где ходят люди: асфальт, тротуары, пешеходки, дворовые дорожки, аллеи
   (правило словами — docs/CAREER.md «Город: как выглядит» → «Мелочь на газоне»).

   Одно общее правило для всего, что расставляется по городу: заборчики, оградки,
   выбивалки, бельё, ракушки, заросли и прочие «конструкции» не встают туда, где
   ходят. Раньше каждый модуль мерил только «до края асфальта» — и оградки газона
   вставали посреди тротуара (в 1,5 м от бордюра при тротуаре 2,75 м), а дворовые
   заборчики улиц — в 0,8 м от бордюра.

   Что считается «мощёным» (onPave → вид или ''):
     • 'road' — полотно любой дороги;
     • 'walk' — тротуар улицы (класс ≤ 5): 2,75 м за полотном (у бульвара — за полосой
       газона r.g, сам газон бульвара не тротуар); у пешеходок (класс 6) — вся пешеходка
       и метр плитки по краям; у дворового проезда (класс 7) — метр по краям;
     • 'path' — дорожки во дворах и парках (CITY.paths, плитка 2 м: 1 м от оси);
     • 'alley' — аллеи парков (world.js).
   m — запас в метрах: вещь шириной в метр ставят с m = 0,5.

     PAVE.init({ RSEG, CITY, onAlley })   — один раз (game.js, сразу после RSEG)
     PAVE.reindex()                       — RSEG дополнен (проезды арок): переиндексировать
     PAVE.onPave(x, z, m)                 — '' (газон) или вид мощёного
     PAVE.roadWalk(x, z, m) / pathAt(x, z, m) — его части: полотно или тротуар ('road' / 'walk' / ''); дорожка ближе PATH + m
     PAVE.walkHalf(seg)                   — от оси дороги до внешнего края тротуара, м
     PAVE.roadGap(x, z, extra)            — до края асфальта по каждой дороге рядом (не по ближайшей осевой), м
     PAVE.each(x0, z0, x1, z1, fn)        — куски мощёного в прямоугольнике (проезд навигатора, routeyard.js)
   ────────────────────────────────────────────────────────────────────────── */

export const PAVE = { WALK: 2.75, SIDE: 1, PATH: 1, CELL: 32, MAXM: 3 };

let A = null, G = null, PG = null, PN = 0;
const key = (i, j) => (i + 4096) * 8192 + j + 4096;
const segD = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
  const qx = x - ax - dx * t, qz = z - az - dz * t;
  return Math.sqrt(qx * qx + qz * qz);              // не Math.hypot: в V8 не встраивается — onPave зовут сотни тысяч раз при сборке (бордюры, дворы)
};
const NONE = [];
function put (Gr, x0, z0, x1, z1, v) {
  const C = PAVE.CELL;
  for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++)
    for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) {
      const k = key(i, j);
      let a = Gr.get(k);
      if (!a) Gr.set(k, a = []);
      a.push(v);
    }
}

export const walkHalf = s => s.w / 2 + (s.c <= 5 ? PAVE.WALK + (s.g || 0) : PAVE.SIDE);

export function init (api) { A = api; G = null; PG = null; PN = 0; return api; }
/* в RSEG дописали куски (проезды арок — game.js archRoads, после домов): клетки — заново при следующем вопросе */
export function reindex () { G = null; PG = null; PN = 0; }

/* в клетке — не сам кусок, а { s, рамка + walkHalf }: точка за рамкой (с запасом m) кусок не задевает — onPave его пропускает
   без segD (при сборке города onPave зовут сотни тысяч раз: бордюры, дворы; в клетке 32 м — до 20—30 кусков) */
function index () {
  G = new Map();
  for (const s of A.RSEG) {
    const R = walkHalf(s), h = R + PAVE.MAXM;
    const x0 = Math.min(s.x1, s.x2), z0 = Math.min(s.z1, s.z2), x1 = Math.max(s.x1, s.x2), z1 = Math.max(s.z1, s.z2);
    put(G, x0 - h, z0 - h, x1 + h, z1 + h, { s, x0: x0 - R - 1e-6, z0: z0 - R - 1e-6, x1: x1 + R + 1e-6, z1: z1 + R + 1e-6, st: 0 });
  }
  PG = new Map(); PN = 0;
}
/* дорожки дописываются при сборке (yards.js, game.js houseWalks) — доиндексируем новые */
function indexPaths () {
  const P = (A.CITY && A.CITY.paths) || [];
  const h = PAVE.PATH + PAVE.MAXM;
  for (; PN < P.length; PN++) {
    const q = P[PN];
    for (let i = 1; i < q.length; i++) {
      const [ax, az] = q[i - 1], [bx, bz] = q[i];
      const R = PAVE.PATH + 1e-6;                // [ось, рамка + PATH] — как у кусков дорог
      put(PG, Math.min(ax, bx) - h, Math.min(az, bz) - h, Math.max(ax, bx) + h, Math.max(az, bz) + h,
        [ax, az, bx, bz, Math.min(ax, bx) - R, Math.min(az, bz) - R, Math.max(ax, bx) + R, Math.max(az, bz) + R]);
    }
  }
}

export function onPave (x, z, m = 0) {
  if (!A) return '';
  const rw = roadWalk(x, z, m);
  if (rw) return rw;
  if (pathAt(x, z, m)) return 'path';
  if (A.onAlley && A.onAlley(x, z, m)) return 'alley';
  return '';
}
/* первая часть onPave: полотно ('road') или тротуар ('walk'), иначе '' — без дорожек и аллей (бордюры дворов, curbs.js:
   им дорожка из карты сама по себе не мешает — только полотно, тротуар и аллея) */
export function roadWalk (x, z, m = 0) {
  if (!A) return '';
  if (!G) index();
  const k = key(Math.floor(x / PAVE.CELL), Math.floor(z / PAVE.CELL));
  let walk = false;
  const a = G.get(k) || NONE;
  for (let i = 0; i < a.length; i++) {
    const e = a[i];
    if (x < e.x0 - m || x > e.x1 + m || z < e.z0 - m || z > e.z1 + m) continue;   // дальше walkHalf + m — ни полотно, ни тротуар
    const s = e.s, d = segD(x, z, s.x1, s.z1, s.x2, s.z2), hw = s.w / 2;
    if (s.c === 6) { if (d < hw + PAVE.SIDE + m) walk = true; continue; }
    if (d < hw + m) return 'road';
    if (s.c <= 5) {
      const g = s.g || 0;
      if (d < hw + g + PAVE.WALK + m && (g < 0.5 || d > hw + g - m)) walk = true;
    } else if (d < hw + PAVE.SIDE + m) walk = true;
  }
  return walk ? 'walk' : '';
}
/* куски дорог, чья рамка (+ walkHalf) задевает прямоугольник, — в out (без повторов): бордюры дворов (curbs.js) берут их
   один раз на край дорожки и потом спрашивают roadWalkL по точкам края только по ним, а не по всей клетке */
let ST = 0;
export function roadsIn (x0, z0, x1, z1, out) {
  out.length = 0;
  if (!A) return out;
  if (!G) index();
  const st = ++ST, C = PAVE.CELL;
  for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++)
    for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) {
      const a = G.get(key(i, j));
      if (a) for (let k = 0; k < a.length; k++) { const e = a[k]; if (e.st !== st && e.x1 >= x0 && e.x0 <= x1 && e.z1 >= z0 && e.z0 <= z1) { e.st = st; out.push(e); } }
    }
  return out;
}
/* roadWalk по списку из roadsIn: точка (x, z) — внутри того прямоугольника; ответ «полотно или тротуар» (да / нет) тот же:
   кусок, что задевает точку, лежит и в её клетке, и в списке */
export function roadWalkL (L, x, z, m = 0) {
  for (let i = 0; i < L.length; i++) {
    const e = L[i];
    if (x < e.x0 - m || x > e.x1 + m || z < e.z0 - m || z > e.z1 + m) continue;
    const s = e.s, d = segD(x, z, s.x1, s.z1, s.x2, s.z2), hw = s.w / 2;
    if (s.c === 6) { if (d < hw + PAVE.SIDE + m) return true; continue; }
    if (d < hw + m) return true;
    if (s.c <= 5) {
      const g = s.g || 0;
      if (d < hw + g + PAVE.WALK + m && (g < 0.5 || d > hw + g - m)) return true;
    } else if (d < hw + PAVE.SIDE + m) return true;
  }
  return false;
}
/* дорожка (CITY.paths) ближе PAVE.PATH + m — вторая часть onPave */
export function pathAt (x, z, m = 0) {
  if (!A) return false;
  if (!G) index();
  indexPaths();
  const b = PG.get(key(Math.floor(x / PAVE.CELL), Math.floor(z / PAVE.CELL))) || NONE, pr = PAVE.PATH + m;
  for (let i = 0; i < b.length; i++) {
    const s = b[i];
    if (x < s[4] - m || x > s[6] + m || z < s[5] - m || z > s[7] + m) continue;
    if (segD(x, z, s[0], s[1], s[2], s[3]) < pr) return true;
  }
  return false;
}

/* до края асфальта, м — по каждой дороге рядом, а не по ближайшей осевой (как construction.js): узкий
   проезд рядом с широкой улицей — осевая ближе у проезда, а асфальт ближе у улицы. < 0 — на асфальте.
   extra(seg) — свой запас у дороги (вычитается: «пешеходке — 0,8 м, остальным — 1 м»).
   Точно до ~4 м от края (дальше кусок может не попасть в клетку — тогда больше настоящего, 99 — дорог рядом нет) */
export function roadGap (x, z, extra) {
  if (!A) return 99;
  if (!G) index();
  let g = 99;
  for (const { s } of G.get(key(Math.floor(x / PAVE.CELL), Math.floor(z / PAVE.CELL))) || []) {
    const v = segD(x, z, s.x1, s.z1, s.x2, s.z2) - s.w / 2 - (extra ? extra(s) : 0);
    if (v < g) g = v;
  }
  return g;
}

/* мощёное в прямоугольнике, по разу каждый кусок — для проезда навигатора (routeyard.js):
   fn(ax, az, bx, bz, half) — ось куска и от оси до края мощёного */
export function each (x0, z0, x1, z1, fn) {
  if (!A) return;
  if (!G) index();
  indexPaths();
  const C = PAVE.CELL, seen = new Set();
  for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++)
    for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) {
      const k = key(i, j);
      for (const { s } of G.get(k) || []) if (!seen.has(s)) { seen.add(s); fn(s.x1, s.z1, s.x2, s.z2, s.c <= 5 ? walkHalf(s) : s.w / 2 + PAVE.SIDE); }
      for (const s of PG.get(k) || []) if (!seen.has(s)) { seen.add(s); fn(s[0], s[1], s[2], s[3], PAVE.PATH); }
    }
}

export const DEBUG = { PAVE, onPave, walkHalf, roadGap, get cells () { return G ? G.size : 0; }, get paths () { return PN; },
  /* сколько кусков в клетке в среднем по точкам (x, z) — для замера */
  load (pts) { let g = 0, p = 0; for (const [x, z] of pts) { const k = key(Math.floor(x / PAVE.CELL), Math.floor(z / PAVE.CELL)); g += (G && G.get(k) || NONE).length; p += (PG && PG.get(k) || NONE).length; } return { g: g / pts.length, p: p / pts.length }; } };
