/* Кофе на длинных улицах (11.10.2026, автор: «на длинных дорогах чтобы встречался кофе почаще»).
   Правила — docs/CAREER.md «Нитро и аптечки» → «Кофе на длинных улицах», числа — PACE.LONG_ROAD в econ.js.

   Длинная улица — большая (класс дороги ≤ MAXC: проспект, тракт, Ленинградская, Солнечная, Ленина вдоль
   Томи…), и в районе, где работаешь, её вместе — не меньше MIN_M метров (куски с одним названием
   складываются). По каждой такой улице, по каждому её куску (у двух проезжих частей проспекта — по каждой)
   стаканчик кофе — через EVERY ± JITTER метров по ходу, по очереди то в правой, то в левой полосе (в
   четверти ширины от оси), чтобы попадался в какую сторону ни едешь. Не на мостах и не в тоннелях.

     longRoadSpots(roads, { inMine, every, rand }) → [[x, z], …]  — точки; дальше game.js scatterPickups
                                                                   проверяет их, как любой кофе (зазор, пиццерия) */
import { PACE } from './econ.js';

export function longRoadSpots (roads, o) {
  const L = PACE.LONG_ROAD, inMine = o.inMine, rnd = o.rand || Math.random;
  const every = o.every || L.EVERY;
  if (!L || !roads) return [];
  const big = roads.filter(r => r.n && r.c <= L.MAXC && !r.b && !r.x && r.p && r.p.length > 1);
  // сколько метров каждой улицы — в районе
  const len = new Map();
  for (const r of big) {
    let m = 0;
    for (let i = 1; i < r.p.length; i++) {
      const a = r.p[i - 1], b = r.p[i];
      if (inMine((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) m += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    len.set(r.n, (len.get(r.n) || 0) + m);
  }
  const out = [];
  let side = 1;
  for (const r of big) {
    if ((len.get(r.n) || 0) < L.MIN_M) continue;
    const off = (r.w || 7) / 4;
    let next = every * (0.3 + 0.7 * rnd());                  // первый — не с самого начала куска
    let s = 0;
    for (let i = 1; i < r.p.length; i++) {
      const a = r.p[i - 1], b = r.p[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d < 0.5) continue;
      const ux = (b[0] - a[0]) / d, uz = (b[1] - a[1]) / d;
      while (next <= s + d) {
        const t = next - s, x = a[0] + ux * t, z = a[1] + uz * t;
        next += every + (rnd() * 2 - 1) * L.JITTER;
        if (!inMine(x, z)) continue;
        out.push([x - uz * off * side, z + ux * off * side]);   // вбок от оси — в полосу
        side = -side;
      }
      s += d;
    }
  }
  return out;
}
