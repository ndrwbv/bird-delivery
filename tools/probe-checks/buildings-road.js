/* Постройки не на дороге (для npm run check; можно и так: npm run probe -- --eval=tools/probe-checks/buildings-road.js).
   Асфальт — полотно любой дороги, кроме пешеходки (класс 6): до края каждой дороги рядом, а не только до
   ближайшей осевой. Проверяем:
     • свои постройки-«дома» (контуры, что модули кладут как дом): пустыри (wastelands.js), точки
       конкурентов (rivals.js), стройки (construction.js), пиццерии-шары (pizzadome.js), клуб — ни одна
       точка контура не на асфальте;
     • участки строек, пустырей, костров и котлов (darknight.js) — прямоугольник целиком не на асфальте;
     • гаражи-ракушки (lawnprops.js) — собираем клетки у каждого 20-го подъезда, коробка не на асфальте. */
const RS = d.RSEG, G = new Map(), CELL = 40;
RS.forEach(s => {
  if (s.c === 6) return;
  const m = s.w / 2 + 1;
  for (let i = Math.floor((Math.min(s.x1, s.x2) - m) / CELL); i <= Math.floor((Math.max(s.x1, s.x2) + m) / CELL); i++)
    for (let j = Math.floor((Math.min(s.z1, s.z2) - m) / CELL); j <= Math.floor((Math.max(s.z1, s.z2) + m) / CELL); j++) {
      const k = i * 100000 + j; let a = G.get(k); if (!a) G.set(k, a = []); a.push(s);
    }
});
/* насколько точка зашла на асфальт, м (> 0 — на асфальте) */
const pen = (x, z) => {
  let p = -99;
  for (const s of G.get(Math.floor(x / CELL) * 100000 + Math.floor(z / CELL)) || []) {
    const dx = s.x2 - s.x1, dz = s.z2 - s.z1, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - s.x1) * dx + (z - s.z1) * dz) / l2));
    p = Math.max(p, s.w / 2 - Math.hypot(x - s.x1 - dx * t, z - s.z1 - dz * t));
  }
  return p;
};
const inPoly = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const R = { n: {}, by: {}, sample: [] };
const hit = (k, x, z, p) => { R.by[k] = (R.by[k] || 0) + 1; if (R.sample.length < 5) R.sample.push([k, Math.round(x), Math.round(z), +p.toFixed(1)]); };
const cnt = k => { R.n[k] = (R.n[k] || 0) + 1; };

// 1) свои контуры-дома
const OWN = new Set(['waste', 'rival', 'site', 'pizza', 'club']), seen = new Set();
for (const a of d.HOUSE_GRID.values()) for (const b of a) {
  if (seen.has(b) || !OWN.has(b.k)) continue;
  seen.add(b); cnt(b.k);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const q of b.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
  let w = -99, wx = 0, wz = 0;
  for (let x = x0 + 0.1; x < x1; x += 0.7) for (let z = z0 + 0.1; z < z1; z += 0.7) if (inPoly(x, z, b.p)) { const p = pen(x, z); if (p > w) { w = p; wx = x; wz = z; } }
  if (w > 0) hit(b.k, wx, wz, w);
}
// 2) участки: центр, ось вдоль улицы, W × D
const rect = (k, s) => {
  if (!s || !(s.W > 0)) return;
  cnt(k);
  const nx = -s.uz, nz = s.ux;
  let w = -99, wx = 0, wz = 0;
  for (let a = -s.W / 2; a <= s.W / 2 + 1e-6; a += s.W / 24) for (let b = -s.D / 2; b <= s.D / 2 + 1e-6; b += s.D / 18) {
    const x = s.x + s.ux * a + nx * b, z = s.z + s.uz * a + nz * b, p = pen(x, z);
    if (p > w) { w = p; wx = x; wz = z; }
  }
  if (w > 0) hit(k, wx, wz, w);
};
for (const s of (d.CONS && d.CONS.SITES) || []) rect('стройка', s);
for (const s of (d.WASTE && d.WASTE.LOTS) || []) rect('пустырь', s);
for (const s of (d.DARK && d.DARK.CAMPS) || []) rect('костёр', s);
for (const s of (d.DARK && d.DARK.POTS) || []) rect('котёл', s);
// 3) гаражи-ракушки газона (собираются у камеры — соберём сами у части подъездов)
if (d.LAWN) {
  const ents = d.CITY.entrances, done = new Set();
  for (let q = 0; q < ents.length; q += 20) {
    d.LAWN.warm(ents[q][0], ents[q][1], 50);
    for (const c of d.LAWN.CELLS.values()) {
      if (done.has(c)) continue;
      done.add(c);
      for (const s of c.sol || []) {
        cnt('ракушка');
        let w = -99;
        for (const a of [-1, 0, 1]) for (const b of [-1, -0.5, 0, 0.5, 1]) w = Math.max(w, pen(s.cx + s.hw * a * s.cs - s.hd * b * s.sn, s.cz + s.hw * a * s.sn + s.hd * b * s.cs));
        if (w > 0) hit('ракушка', s.cx, s.cz, w);
      }
    }
  }
}
const bad = Object.values(R.by).reduce((a, b) => a + b, 0);
return { ok: bad === 0 && Object.keys(R.n).length > 0, bad, ...R };
