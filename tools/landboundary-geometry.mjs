import assert from 'node:assert/strict';
import { createLandCover } from '../src/game/landcover.js';
import { landBoundary } from '../src/game/landboundary.js';

const rect = (c, x0, z0, x1, z1, h = .1) => {
  c.triangle(x0, z0, x1, z0, x0, z1, h);
  c.triangle(x1, z1, x0, z1, x1, z0, h);
};
function check(c, g, expected) {
  const stats = {}, out = [...landBoundary(c, g, { stats })].filter(Boolean);
  assert.ok(Math.abs(stats.length - expected) < 1e-5, `Периметр ${stats.length}, ожидался ${expected}`);
  const land = (x, z) => g.height(x, z) > c.height(x, z) || !c.covered(x, z);
  for (const { a, b } of out) {
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    for (const t of [.17, .5, .83]) {
      const x = a[0] + dx * t, z = a[1] + dz * t, r = Math.min(.0000001, len / 20);
      assert.equal(land(x - dz / len * r, z + dx / len * r), true, 'Земля слева');
      assert.equal(land(x + dz / len * r, z - dx / len * r), false, 'Мощение справа');
    }
  }
  return out;
}
const c = createLandCover(), g = createLandCover();
rect(c, 0, 0, 10, 2); check(c, g, 24); // без внутренней диагонали
rect(c, 4, 1, 6, 6); check(c, g, 32); // перекрытие, T-образный стык
rect(c, 0, 0, 10, 2); check(c, g, 32); // дублированный слой не удваивает камень
rect(g, 1, .5, 2, 1.5, .15); check(c, g, 36); // зелёный остров внутри мощения
rect(c, 1, .5, 1.5, 1.5, .2); check(c, g, 35); // более высокое мощение режет остров
rect(c, 4, 6, 6, 8, .5); check(c, g, 33); // у стены здания нет отдельной линии камня
c.compact(); g.compact(); check(c, g, 33);
const a = createLandCover(), b = createLandCover();
rect(a, -10, -5, 0, -3); rect(a, -6, -4, -4, 1);
check(a, b, 32); // отрицательные координаты и границы клеток
// Узкий проход сохраняется: обе его стороны — настоящие отдельные края.
const p = createLandCover(), q = createLandCover();
rect(p, 0, 0, 2, 2); rect(p, 2.02, 0, 4.02, 2); check(p, q, 16);
const thin = createLandCover();
rect(thin, 0, 0, 2, 2); rect(thin, 2.0002, 0, 4.0002, 2); check(thin, q, 16);
// Частично совпадающие края должны разбиваться в одинаковых точках,
// чтобы перекрытие не давало двух камней вдоль одной линии.
const overlap = createLandCover();
rect(overlap, 0, 0, 10, 2); rect(overlap, 5, 0, 15, 2); check(overlap, q, 34);
// Почти совпавшее ребро после поворота: отрицательная погрешность
// не должна прятать T-образный стык от разбиения исходной стороны.
const touching = createLandCover();
rect(touching, 0, 0, 10, 2); rect(touching, 2, -2, 3, -1e-12); check(touching, q, 28);
// Повернутый участок: треугольный карман касается только части длинной
// стороны прямоугольника. Раньше отрицательная погрешность параллельной
// полуплоскости оставляла камень прямо между этими двумя покрытиями.
const angled = createLandCover();
const quad = [[202.14459273771078,87.70752440571982],[203.91701690364707,75.43485099785937],[216.78352934737174,77.29303762343775],[215.01110518143545,89.5657110312982]];
const tri = [[215.08257389780383,89.07084516807802],[216.71206063100337,77.78790348665794],[222.15558512642534,78.57405936671034]];
angled.triangle(...quad[0], ...quad[2], ...quad[3], .08);
angled.triangle(...quad[0], ...quad[1], ...quad[2], .08);
angled.triangle(...tri[0], ...tri[1], ...tri[2], .1);
const perimeter = p => p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + Math.hypot(a[0] - b[0], a[1] - b[1]); }, 0);
check(angled, q, perimeter(quad) + perimeter(tri) - 2 * Math.hypot(tri[0][0] - tri[1][0], tri[0][1] - tri[1][1]));
for (const shift of [[5000,4000],[-5000,-4000]]) {
  const far = createLandCover(), points = p => p.map(v => [v[0] + shift[0], v[1] + shift[1]]);
  const r = points(quad), t = points(tri);
  far.triangle(...r[0], ...r[2], ...r[3], .08);
  far.triangle(...r[0], ...r[1], ...r[2], .08);
  far.triangle(...t[0], ...t[1], ...t[2], .1);
  check(far, q, perimeter(quad) + perimeter(tri) - 2 * Math.hypot(tri[0][0] - tri[1][0], tri[0][1] - tri[1][1]));
}
console.log('Граница покрытий: диагонали, перекрытия, острова, этажность, стены, узкие проходы — OK');
