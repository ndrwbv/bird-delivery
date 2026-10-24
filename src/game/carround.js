/* ──────────────────────────────────────────────────────────────────────────
   Пешком — вокруг машины, а не сквозь (0п73, автор 24.10.2026: «люди выходят из двери машины и пробегают сквозь свою
   же машину — надо, чтобы оббегали»). Правила словами — docs/CAREER.md «Чужие машины мнутся и бьются» → «Водитель».

   Человек идёт к точке, а прямая до неё проходит сквозь кузов (с запасом CR.M м вокруг) — идёт сначала к углу кузова
   (тот же запас), с которого цель видна или путь через него короче; дошёл до угла — дальше к следующему или прямо.
   Считается заново каждый кадр: машина сдвинулась — путь тоже.

     via(px, pz, tx, tz, b, m) — куда идти сейчас: [x, z] угла или null (прямо можно). b — машина { x, z, h, hl, hw }
                                 (середина, курс, половины длины и ширины — как у машин потока)
     around(p, tx, tz, cars)   — то же для нескольких машин (первая, что мешает); → [x, z] — куда идти сейчас
   ?oldround — по-старому, напрямик.
   ────────────────────────────────────────────────────────────────────────── */
const SRCH = typeof location !== 'undefined' ? location.search || '' : '';
export const CR = {
  on: !/[?&]oldround\b/.test(SRCH),
  M: 0.45,     // м: запас вокруг кузова — по нему и обходит
  IN: 0.5,     // доля запаса: «сквозь» — ближе этого к кузову (по краю запаса, срезая угол, — можно)
  NEAR: 0.15,  // м: дошёл до угла
};
export const ST = { detours: 0 };

/* отрезок (a → b) в прямоугольнике |x| < hx, |z| < hz (локально) */
function hits (ax, az, bx, bz, hx, hz) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-9) { if (ax <= -hx || ax >= hx) return false; }
  else { let u0 = (-hx - ax) / dx, u1 = (hx - ax) / dx; if (u0 > u1) { const s = u0; u0 = u1; u1 = s; } t0 = Math.max(t0, u0); t1 = Math.min(t1, u1); if (t0 >= t1) return false; }
  if (Math.abs(dz) < 1e-9) { if (az <= -hz || az >= hz) return false; }
  else { let u0 = (-hz - az) / dz, u1 = (hz - az) / dz; if (u0 > u1) { const s = u0; u0 = u1; u1 = s; } t0 = Math.max(t0, u0); t1 = Math.min(t1, u1); if (t0 >= t1) return false; }
  return true;
}
const CN = [[-1, -1], [1, -1], [1, 1], [-1, 1]];   // углы по кругу: соседние — через один индекс

export function via (px, pz, tx, tz, b, m = CR.M) {
  if (!CR.on || !b) return null;
  const fx = Math.sin(b.h), fz = Math.cos(b.h);
  // локально: x — поперёк (вправо от курса), z — вдоль
  const L = (x, z) => { const dx = x - b.x, dz = z - b.z; return [dx * fz - dz * fx, dx * fx + dz * fz]; };
  let [ax, az] = L(px, pz);
  const [qx, qz] = L(tx, tz);
  const hx = b.hw + m, hz = b.hl + m, ix = b.hw + m * CR.IN, iz = b.hl + m * CR.IN;   // углы — по запасу, «сквозь» — по его половине
  for (const [sx, sz] of CN) if (Math.hypot(sx * hx - ax, sz * hz - az) < CR.NEAR) { ax = sx * hx; az = sz * hz; break; }   // дошёл до угла — считаем от угла
  if (Math.abs(ax) < ix && Math.abs(az) < iz) return null;      // уже в запасе (толкнули) — не выдумываем
  if (Math.abs(qx) < ix && Math.abs(qz) < iz) return null;      // цель у самого кузова (дверь) — дойдёт по краю
  if (!hits(ax, az, qx, qz, ix, iz)) return null;
  let best = -1, bc = Infinity;
  for (let i = 0; i < 4; i++) {
    const cx = CN[i][0] * hx, cz = CN[i][1] * hz, d0 = Math.hypot(cx - ax, cz - az);
    if (d0 < CR.NEAR || hits(ax, az, cx, cz, ix, iz)) continue;
    let c = d0 + Math.hypot(qx - cx, qz - cz);
    if (hits(cx, cz, qx, qz, ix, iz)) {                         // и от угла цель за кузовом — ещё через соседний угол
      let c2 = Infinity;
      for (const j of [(i + 1) % 4, (i + 3) % 4]) { const ex = CN[j][0] * hx, ez = CN[j][1] * hz; c2 = Math.min(c2, Math.hypot(ex - cx, ez - cz) + Math.hypot(qx - ex, qz - ez)); }
      c = d0 + c2;
    }
    if (c < bc) { bc = c; best = i; }
  }
  if (best < 0) return null;
  const cx = CN[best][0] * hx, cz = CN[best][1] * hz;
  return [b.x + cx * fz + cz * fx, b.z - cx * fx + cz * fz];
}

/** куда идти сейчас p (с x, z) к (tx, tz), обходя машины cars (b или null) */
export function around (p, tx, tz, cars) {
  for (const b of cars) {
    const w = b && via(p.x, p.z, tx, tz, b);
    if (w) { ST.detours++; return w; }
  }
  return [tx, tz];
}
