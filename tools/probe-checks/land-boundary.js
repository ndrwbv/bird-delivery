/* 0п68, ?raisedland: проверка рассчитанной границы покрытий на всей карте.
   Геометрическая диагностика; она ещё не доказывает готовность бордюров. */
await until(() => d.RLAND?.ST.built && !d.LATE.busy(), 120000);
const L = d.RLAND, stats = {}, degree = new Map(), sample = [];
const land = (x, z) => L.onLand(x, z);
const key = p => p.map(x => Math.round(x * 1e4)).join(',');
let checked = 0, bad = 0, thin = 0;
for (const edge of L.boundaries({ stats, accept: (x, z) => d.RLAND_BASE(x, z) > .8 })) {
  if (!edge) { await wait(0); continue; }
  const { a, b } = edge, dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  const nx = -dz / len, nz = dx / len;
  for (const t of [.17, .5, .83]) {
    const x = a[0] + dx * t, z = a[1] + dz * t;
    let r = Math.min(.00001, len / 20);
    const good = () => land(x + nx * r, z + nz * r) && !land(x - nx * r, z - nz * r);
    if (!good()) {
      // У реальной границы бывает соседняя линия в нескольких микронах.
      // Выбираем пробу внутри ближайшего пересечения по нормали, чтобы
      // проверять именно эту границу, а не перескочить на другую фигуру.
      const span = .01;
      for (const C of L.finalMask?.ready ? [L.finalMask] : [L.cover, L.green]) for (const u of C.breaks(x - nx * span, z - nz * span, x + nx * span, z + nz * span)) {
        const distance = Math.abs(u - .5) * span * 2;
        if (distance > 1e-9) r = Math.min(r, distance / 4);
      }
      if (good()) thin++;
      else { bad++; if (sample.length < 8) sample.push({ a, b, t, r }); }
    }
  }
  for (const p of [a, b]) { const k = key(p); degree.set(k, (degree.get(k) || 0) + 1); }
  if (++checked % 1000 === 0) await wait(0);
}
const degrees = {}; for (const v of degree.values()) degrees[v] = (degrees[v] || 0) + 1;
return { complete: false, ok: checked > 0 && !bad && !d.crashlog.count(), checked, stats, degrees, thin, bad, sample, crash: d.crashlog.count() };
