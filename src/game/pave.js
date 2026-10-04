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
     PAVE.onPave(x, z, m)                 — '' (газон) или вид мощёного
     PAVE.walkHalf(seg)                   — от оси дороги до внешнего края тротуара, м
   ────────────────────────────────────────────────────────────────────────── */

export const PAVE = { WALK: 2.75, SIDE: 1, PATH: 1, CELL: 32, MAXM: 3 };

let A = null, G = null, PG = null, PN = 0;
const key = (i, j) => (i + 4096) * 8192 + j + 4096;
const segD = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
};
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

function index () {
  G = new Map();
  for (const s of A.RSEG) {
    const h = walkHalf(s) + PAVE.MAXM;
    put(G, Math.min(s.x1, s.x2) - h, Math.min(s.z1, s.z2) - h, Math.max(s.x1, s.x2) + h, Math.max(s.z1, s.z2) + h, s);
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
      put(PG, Math.min(ax, bx) - h, Math.min(az, bz) - h, Math.max(ax, bx) + h, Math.max(az, bz) + h, [ax, az, bx, bz]);
    }
  }
}

export function onPave (x, z, m = 0) {
  if (!A) return '';
  if (!G) index();
  const k = key(Math.floor(x / PAVE.CELL), Math.floor(z / PAVE.CELL));
  let walk = false;
  for (const s of G.get(k) || []) {
    const d = segD(x, z, s.x1, s.z1, s.x2, s.z2), hw = s.w / 2;
    if (s.c === 6) { if (d < hw + PAVE.SIDE + m) walk = true; continue; }
    if (d < hw + m) return 'road';
    if (s.c <= 5) {
      const g = s.g || 0;
      if (d < hw + g + PAVE.WALK + m && (g < 0.5 || d > hw + g - m)) walk = true;
    } else if (d < hw + PAVE.SIDE + m) walk = true;
  }
  if (walk) return 'walk';
  indexPaths();
  for (const s of PG.get(k) || []) if (segD(x, z, s[0], s[1], s[2], s[3]) < PAVE.PATH + m) return 'path';
  if (A.onAlley && A.onAlley(x, z, m)) return 'alley';
  return '';
}

export const DEBUG = { PAVE, onPave, walkHalf, get cells () { return G ? G.size : 0; }, get paths () { return PN; } };
