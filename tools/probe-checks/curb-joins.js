/* Бордюры на поворотах стыкуются (0п72, 24.10.2026; для npm run check, id curbjoin; можно и так:
   npm run probe -- --eval=tools/probe-checks/curb-joins.js --q=curbtrace --max=0 --timeout=300).
   Правила — docs/CAREER.md «Бордюр на изломах». Нужен ?curbtrace (check.cjs добавляет сам): curbs.js пишет углы каждой секции.
   Ищем стыки: торцы двух секций, у которых середина торца (на средней линии камня) совпадает в пределах 2 см — это один стык
   (соседние секции по ходу, излом дорожки, дуга). Мерим, насколько не сходятся края торцов (к дорожке и к газону): расстояние
   между парными вершинами в плане и по высоте верха. Щель — больше 3 см в плане или ступенька выше 3 см.
   Ответ: ends — торцов, joins — стыков, gap — щелей (план > 3 см), step — ступенек (высота > 3 см), по видам (turn — на изломе:
   секции под углом > 3°, line — прямо), worst — самый большой разрыв, sample — где (только изломы). ok — gap и step на изломах не больше 5 (было 477 и 728; остаток — 2—3 стыка разных линий в одной точке). Ступеньки на прямой — просевшие секции нарочно (CURB.SUNK), в счёт не идут.
   ?nomiter — как до правки (сравнить). */
await until(() => d.SPOTS && d.SPOTS.length > 50 && (!d.LATE || !d.LATE.busy()), 90000);
const T = d.CURBS && d.CURBS.trace;
if (!T) return { err: 'нет __dlv.CURBS.trace (нужен ?curbtrace)' };
const N = T.length / 18, F = 18, CS = 1;
const ends = [];   // [секция, торец]
const G = new Map(), key = (i, j) => i * 100003 + j;
for (let s = 0; s < N; s++) for (let e = 0; e < 2; e++) {
  const o = s * F, cx = T[o + 14 + e * 2], cz = T[o + 15 + e * 2];
  const id = ends.length; ends.push([s, e, cx, cz]);
  const k = key(Math.floor(cx / CS), Math.floor(cz / CS)); let a = G.get(k); if (!a) G.set(k, a = []); a.push(id);
}
const R = { sections: N, ends: ends.length, joins: 0, gap: 0, step: 0, gapTurn: 0, stepTurn: 0, worst: 0, sample: [] };
const TOL = 0.02, GAP = 0.03;
const vert = (s, e) => { const o = s * F + e * 6; return [T[o], T[o + 1], T[o + 2], T[o + 3], T[o + 4], T[o + 5]]; };   // к дорожке (x, z, верх), к газону (x, z, верх)
for (let id = 0; id < ends.length; id++) {
  const [s, e, cx, cz] = ends[id];
  for (let i = Math.floor((cx - TOL) / CS); i <= Math.floor((cx + TOL) / CS); i++) for (let j = Math.floor((cz - TOL) / CS); j <= Math.floor((cz + TOL) / CS); j++) for (const q of G.get(key(i, j)) || []) {
    if (q <= id) continue;
    const [s2, e2, cx2, cz2] = ends[q];
    if (s2 === s || Math.hypot(cx - cx2, cz - cz2) > TOL) continue;
    const a = vert(s, e), b = vert(s2, e2);
    // та же сторона: торцы смотрят в одну сторону (от дорожки к газону)
    const ax = a[3] - a[0], az = a[4] - a[1], bx = b[3] - b[0], bz = b[4] - b[1];
    if (ax * bx + az * bz < 0.2 * Math.hypot(ax, az) * Math.hypot(bx, bz)) continue;
    // направление секций: на стыке идут навстречу или вдоль? разворот по средней линии
    const ua = [T[s * F + 16] - T[s * F + 14], T[s * F + 17] - T[s * F + 15]], ub = [T[s2 * F + 16] - T[s2 * F + 14], T[s2 * F + 17] - T[s2 * F + 15]];
    const la = Math.hypot(ua[0], ua[1]) || 1, lb = Math.hypot(ub[0], ub[1]) || 1;
    const cosT = (ua[0] * ub[0] + ua[1] * ub[1]) / (la * lb);
    if (e === e2 && cosT > 0.9) continue;                 // торцы одного конца у параллельных секций — не стык
    const turn = Math.abs(cosT) < Math.cos(3 * Math.PI / 180);
    R.joins++;
    const dIn = Math.hypot(a[0] - b[0], a[1] - b[1]), dOut = Math.hypot(a[3] - b[3], a[4] - b[4]), dh = Math.max(Math.abs(a[2] - b[2]), Math.abs(a[5] - b[5]));
    const gap = Math.max(dIn, dOut);
    if (gap > R.worst) R.worst = +gap.toFixed(3);
    if (gap > GAP) { R.gap++; if (turn) R.gapTurn++; if (turn && R.sample.length < 8) R.sample.push([Math.round(cx), Math.round(cz), +gap.toFixed(2), 'turn']); }
    if (dh > GAP) { R.step++; if (turn) R.stepTurn++; if (turn && R.sample.length < 8) R.sample.push([Math.round(cx), Math.round(cz), 'h' + dh.toFixed(2), 'turn']); }
  }
}
R.ok = R.gapTurn <= 5 && R.stepTurn <= 5;   // стыки двух разных линий, начатых в одной точке (2 на город, 7–8 см) — остаток; изломы одной линии — 0
return R;
