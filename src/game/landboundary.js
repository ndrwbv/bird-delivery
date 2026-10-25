/* Граница земли и мощения из фактически нарисованных треугольников.
   Внутренние диагонали и перекрытые части отбрасываются. Слева от каждого
   выходного отрезка — земля, справа — покрытие. Высокий пол здания только
   закрывает землю: отдельный бордюр вдоль стены не добавляем. */
const KEY_SCALE = 1e6;
const pointKey = p => Math.round(p[0] * KEY_SCALE) + ',' + Math.round(p[1] * KEY_SCALE);
const edgeKey = (a, b) => { const x = pointKey(a), y = pointKey(b); return x < y ? x + ':' + y : y + ':' + x; };
export function* landBoundary(cover, green, { accept = () => true, stats = {} } = {}) {
  const seen = new Set(), emitted = new Set();
  stats.edges = stats.segments = stats.length = 0;
  let work = 0;
  for (const C of [cover, green]) for (const t of C.triangles) {
    if (C === cover && t.lift >= .49) continue;
    for (let i = 0; i < 3; i++) {
      const a = t.p[i], b = t.p[(i + 1) % 3], key = edgeKey(a, b);
      if (seen.has(key)) continue;
      seen.add(key); stats.edges++;
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      const nx = -dz / len, nz = dx / len;
      const cuts = [...cover.breaks(...a, ...b), ...green.breaks(...a, ...b)].sort((x, y) => x - y);
      for (let j = 1; j < cuts.length; j++) {
        const lo = cuts[j - 1], hi = cuts[j];
        if ((hi - lo) * len < 1e-5) continue;
        const mid = (lo + hi) / 2, x = a[0] + dx * mid, z = a[1] + dz * mid;
        const paved = cover.sideHeights(x, z, nx, nz), grass = green.sideHeights(x, z, nx, nz);
        const left = grass[0] > paved[0] || paved[0] === -Infinity;
        const right = grass[1] > paved[1] || paved[1] === -Infinity;
        if (left === right || !accept(x, z)) continue;
        const lift = paved[left ? 1 : 0];
        if (!Number.isFinite(lift) || lift >= .49) continue;
        let p = [a[0] + dx * lo, a[1] + dz * lo], q = [a[0] + dx * hi, a[1] + dz * hi];
        if (!left) [p, q] = [q, p];
        const outKey = edgeKey(p, q);
        if (emitted.has(outKey)) continue;
        emitted.add(outKey); stats.segments++; stats.length += (hi - lo) * len;
        yield { a: p, b: q, lift };
      }
    }
    // Длинный обход тоже участвует в поздней сборке, даже если края скрыты.
    if (++work % 128 === 0) yield null;
  }
}
