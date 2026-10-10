/* ──────────────────────────────────────────────────────────────────────────
   Стык широкой улицы с узкой (docs/CAREER.md «Город: как выглядит» → «Стыки улиц»; 10.10.2026,
   автор: «вот такие места криво выглядят, проверь везде подобное»).

   Улица — лента от точки до точки, в узле — круглое пятно её же ширины (чтобы угол не рвался). Когда
   широкая улица (проспект в 4 полосы, двусторонняя перед развилкой на две односторонних) кончается в
   узле, где дальше только узкие, её квадратный торец и пятно в полширины торчат за узкие: на газоне —
   тёмный блин асфальта и прямоугольник тротуара, у бордюра — ступенька. В Солнечном таких концов ~135.

   Теперь у такого конца (своя половина ширины больше, чем у самой широкой из остальных в узле, на
   ENDS.MIN м и больше) — отдельно для полотна и для тротуара:
     • лента улицы кончается за T м до узла (T = 1,5 × разница полуширин + 1, от ENDS.T[0] до доли
       ENDS.T[1] последнего куска), пятна в узле нет;
     • от этого места — «воронка»: выпуклый многоугольник от краёв широкой (за T м до узла) до краёв
       каждой узкой в D м от узла (D = полуширина широкой + 1, не дальше доли ENDS.D куска узкой) — широкая
       плавно сходится в узкие, развилка на две односторонних — тоже без ступеньки. Воронка — тем же
       цветом, что конец полотна (у стыка — общим цветом узла, roadwear.js), и чуть ниже узких улиц:
       их полотно и разметка — поверх;
     • бордюр и разметка у такого узла опущены ближе cutAt м (как у перекрёстка).
   Пешеходки (класс 6) и мосты в расчёт не идут.

     ENDS.prep({ CITY, roadWidth, sidewalk })   — до полотна (game.js osmRoads)
     ENDS.trim(r, pass, p)                       — точки ленты улицы с обрезанными концами (или p)
     ENDS.hulls(r, pass)                         — воронки концов этой улицы: [[x, z]…][]
     ENDS.cutAt(x, z)                            — бордюр и разметка у узла опущены ближе стольких м (0 — нет)
   отладка: __dlv.ENDS
   ────────────────────────────────────────────────────────────────────────── */

export const ENDS = {
  MIN: 0.5,               // своя полуширина больше, чем у самой широкой из остальных, — от стольких м
  T: [2, 0.6],            // обрез ленты: не меньше, м; не больше доли последнего куска
  TK: 1.5,                // обрез = TK × разница полуширин + 1
  D: 0.8,                 // край воронки по узкой: полуширина широкой + 1, не дальше доли первого куска узкой
  DROP: 0.0015,           // воронка ниже самой низкой улицы в узле, м
};

const BY = new Map();                    // улица → { [pass]: [{ end, T, hull }] }
const CUT = new Map();                   // узел 'x,z' → м
export const STATS = { ends: 0, walk: 0, road: 0, ms: 0 };
const key = (x, z) => x + ',' + z;

function hull (pts) {
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (P.length < 3) return P;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  lo.pop(); up.pop();
  return lo.concat(up);
}

/* api: CITY, roadWidth(r), sidewalk(r) — ширина тротуара вместе с полотном (game.js SIDEWALK) */
export function prep (api) {
  const t0 = performance.now();
  BY.clear(); CUT.clear();
  STATS.ends = STATS.walk = STATS.road = 0;
  const ok = r => r && !r.b && r.c !== 6 && r.p && r.p.length > 1;
  const at = new Map();
  for (const r of api.CITY.roads) {
    if (!ok(r)) continue;
    for (let i = 0; i < r.p.length; i++) {
      const k = key(r.p[i][0], r.p[i][1]);
      let a = at.get(k);
      if (!a) at.set(k, a = []);
      a.push({ r, i });
    }
  }
  const half = [r => api.sidewalk(r) / 2, r => api.roadWidth(r) / 2];   // pass 0 — тротуар, 1 — полотно
  for (const a of at.values()) {
    if (a.length < 2) continue;
    for (const e of a) {
      const r = e.r, L = r.p.length;
      if (e.i !== 0 && e.i !== L - 1) continue;
      if (a.some(o => o.r === r && o.i !== e.i)) continue;             // петля в себя — не трогаем
      const others = a.filter(o => o.r !== r);
      if (!others.length) continue;
      const N = r.p[e.i], Q = r.p[e.i === 0 ? 1 : L - 2];
      const Ls = Math.hypot(Q[0] - N[0], Q[1] - N[1]);
      if (Ls < 1.5) continue;
      const ux = (Q[0] - N[0]) / Ls, uz = (Q[1] - N[1]) / Ls;          // от узла в свою улицу
      let cut = 0;
      for (const pass of [0, 1]) {
        const h = half[pass](r), hp = Math.max(...others.map(o => half[pass](o.r)));
        if (h <= hp + ENDS.MIN) continue;
        const T = Math.min(Math.max(ENDS.TK * (h - hp) + 1, ENDS.T[0]), Ls * ENDS.T[1]);
        const pts = [[N[0] + ux * T - uz * h, N[1] + uz * T + ux * h], [N[0] + ux * T + uz * h, N[1] + uz * T - ux * h]];
        let D = 0;
        for (const o of others) {
          const p = o.r.p, ho = half[pass](o.r);
          for (const j of [o.i - 1, o.i + 1]) {
            if (j < 0 || j >= p.length) continue;
            const l = Math.hypot(p[j][0] - N[0], p[j][1] - N[1]);
            if (l < 0.5) continue;
            const vx = (p[j][0] - N[0]) / l, vz = (p[j][1] - N[1]) / l, d = Math.min(h + 1, l * ENDS.D);
            pts.push([N[0] + vx * d - vz * ho, N[1] + vz * d + vx * ho], [N[0] + vx * d + vz * ho, N[1] + vz * d - vx * ho]);
            D = Math.max(D, d);
          }
        }
        let rec = BY.get(r);
        if (!rec) BY.set(r, rec = { 0: [], 1: [] });
        rec[pass].push({ end: e.i === 0 ? 0 : 1, T, hull: hull(pts), N, others: others.map(o => o.r) });
        cut = Math.max(cut, T + 0.5, D + 0.5);
        STATS[pass ? 'road' : 'walk']++;
      }
      if (cut) { CUT.set(key(N[0], N[1]), Math.max(CUT.get(key(N[0], N[1])) || 0, cut)); STATS.ends++; }
    }
  }
  STATS.ms = Math.round(performance.now() - t0);
  return STATS;
}

/* точки ленты с обрезанными концами: p — [[x, z, …]…] (r.p или с точками перехода асфальта, roadwear.js) */
export function trim (r, pass, p) {
  const rec = BY.get(r);
  if (!rec || !rec[pass].length) return p;
  let a = p.slice();
  for (const t of rec[pass]) {
    if (t.end === 1) a.reverse();
    // от начала (узел) срезаем T м
    let left = t.T;
    while (a.length > 2) {
      const l = Math.hypot(a[1][0] - a[0][0], a[1][1] - a[0][1]);
      if (l > left + 0.3) break;
      left -= l; a.shift();
      if (left <= 0) break;
    }
    if (left > 0) {
      const l = Math.hypot(a[1][0] - a[0][0], a[1][1] - a[0][1]);
      const k = Math.min(left, Math.max(0, l - 0.3)) / (l || 1);
      a[0] = [a[0][0] + (a[1][0] - a[0][0]) * k, a[0][1] + (a[1][1] - a[0][1]) * k, 0];
    }
    if (t.end === 1) a.reverse();
  }
  return a;
}
/* воронки концов улицы в этом проходе */
export const hulls = (r, pass) => { const rec = BY.get(r); return rec ? rec[pass] : []; };
/* бордюр и разметка у узла опущены ближе стольких м */
export const cutAt = (x, z) => CUT.get(key(x, z)) || 0;

export const DEBUG = { ENDS, STATS, BY, CUT, cutAt };
