/* Заборы не накладываются друг на друга и не липнут к стенам (0п88, 24.10.2026; для npm run check, id fenceover;
   можно и так: npm run probe -- --eval=tools/probe-checks/fence-overlap.js --max=0 --timeout=300).
   Берём каждую секцию сбиваемых заборов (SMASH: fence, bigfence) — по вершинам её меша: отрезок вдоль секции и её
   высота. Ответ:
     • dup — пары секций почти на одной линии (угол < 12°, поперёк < 0,3 м) и общим куском вдоль > 1 м — «два забора в одном
       месте»; по видам пары (fence/fence, big/big, big/fence), sample — где;
     • wall — высокие заборы (bigfence, чёрные, высотой ~2 м) ближе 0,4 м к стене дома (хоть одна точка секции) — текстура
       «дёргается» на фасаде; sample — где.
   ok — dup, cross и wall равны 0 (cross — осевые линии секций режутся не у концов). */
const Q = new URLSearchParams(location.search);
await until(() => d.SPOTS && d.SPOTS.length > 50 && (!d.LATE || !d.LATE.busy()), 90000);
const L = d.SMASH.list || d.SMASH;
const segs = [];
for (const it of L) {
  if ((it.kind !== 'fence' && it.kind !== 'bigfence') || it.rshop || it.down || !it.mesh) continue;
  const pa = it.mesh.geometry && it.mesh.geometry.attributes.position;
  if (!pa || !pa.array) continue;
  const A = pa.array, o = it.v0 * 3, n = it.nv;
  if (!(n > 0) || o + n * 3 > A.length) continue;
  // главная ось в плоскости земли (по вершинам) и размах вдоль неё
  let mx = 0, mz = 0, ymin = 1e9, ymax = -1e9;
  for (let k = 0; k < n; k++) { mx += A[o + k * 3] / n; mz += A[o + k * 3 + 2] / n; const y = A[o + k * 3 + 1]; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
  let sxx = 0, szz = 0, sxz = 0;
  for (let k = 0; k < n; k++) { const dx = A[o + k * 3] - mx, dz = A[o + k * 3 + 2] - mz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
  const th = 0.5 * Math.atan2(2 * sxz, sxx - szz), ux = Math.cos(th), uz = Math.sin(th);
  let t0 = 1e9, t1 = -1e9, w0 = 1e9, w1 = -1e9;
  for (let k = 0; k < n; k++) { const dx = A[o + k * 3] - mx, dz = A[o + k * 3 + 2] - mz, t = dx * ux + dz * uz, w = -dx * uz + dz * ux; if (t < t0) t0 = t; if (t > t1) t1 = t; if (w < w0) w0 = w; if (w > w1) w1 = w; }
  if (t1 - t0 < 0.5) continue;                    // кусты, столбики — не секции
  segs.push({ k: it.kind === 'bigfence' ? 'big' : 'fence', cons: it.cons, x: mx, z: mz, ux, uz, t0, t1, thick: w1 - w0, h: ymax - ymin, y: ymax });
}
// сетка 6 м
const CS = 6, G = new Map(), key = (i, j) => i * 100003 + j;
segs.forEach((s, i) => { const L2 = Math.max(Math.abs(s.t0), Math.abs(s.t1)) + 0.5; for (let a = Math.floor((s.x - L2) / CS); a <= Math.floor((s.x + L2) / CS); a++) for (let b = Math.floor((s.z - L2) / CS); b <= Math.floor((s.z + L2) / CS); b++) { const kk = key(a, b); let g = G.get(kk); if (!g) G.set(kk, g = []); g.push(i); } });
const R = { segs: segs.length, cross: 0, crossBy: {}, csample: [], dup: 0, dupBy: {}, wall: 0, wallBy: {}, sample: [], wsample: [] };
const seen = new Set();
const LAT = +(Q.get('folat') || 0.3), ANG = 0.2;
segs.forEach((s, i) => {
  const near = new Set();
  const L2 = Math.max(Math.abs(s.t0), Math.abs(s.t1)) + 0.5;
  for (let a = Math.floor((s.x - L2) / CS); a <= Math.floor((s.x + L2) / CS); a++) for (let b = Math.floor((s.z - L2) / CS); b <= Math.floor((s.z + L2) / CS); b++) for (const j of G.get(key(a, b)) || []) if (j > i) near.add(j);
  for (const j of near) {
    const o = segs[j];
    if (Math.abs(s.ux * o.uz - s.uz * o.ux) > Math.sin(ANG)) continue;
    const dx = o.x - s.x, dz = o.z - s.z, lat = Math.abs(-dx * s.uz + dz * s.ux);
    if (lat > LAT) continue;
    // общий кусок вдоль s: у o ось своя, сводим к оси s
    const sg = o.ux * s.ux + o.uz * s.uz < 0 ? -1 : 1, c = dx * s.ux + dz * s.uz;
    const a0 = sg > 0 ? o.t0 : -o.t1, a1 = sg > 0 ? o.t1 : -o.t0;
    const ov = Math.min(s.t1, c + a1) - Math.max(s.t0, c + a0);
    if (ov < 1.0) continue;                  // стык соседних секций одного ряда внахлёст до метра (изгиб ряда, плавные дорожки) — не в счёт
    R.dup++;
    const kk = s.k < o.k ? s.k + '/' + o.k : o.k + '/' + s.k;
    R.dupBy[kk] = (R.dupBy[kk] || 0) + 1;
    if (R.sample.length < 10) R.sample.push([kk, Math.round(s.x), Math.round(s.z), +lat.toFixed(2), +ov.toFixed(1)]);
  }
});
// пересечения: осевые линии секций режутся не у самых концов (< 0,35 м от конца — стык углом), не параллельные
segs.forEach((s, i) => {
  const near = new Set();
  const L2 = Math.max(Math.abs(s.t0), Math.abs(s.t1)) + 0.5;
  for (let a = Math.floor((s.x - L2) / CS); a <= Math.floor((s.x + L2) / CS); a++) for (let b = Math.floor((s.z - L2) / CS); b <= Math.floor((s.z + L2) / CS); b++) for (const j of G.get(key(a, b)) || []) if (j > i) near.add(j);
  for (const j of near) {
    const o = segs[j], cr = s.ux * o.uz - s.uz * o.ux;
    if (Math.abs(cr) < Math.sin(ANG)) continue;
    const dx = o.x - s.x, dz = o.z - s.z, ts = (dx * o.uz - dz * o.ux) / cr, to = (dx * s.uz - dz * s.ux) / cr;
    const EN = 0.35;
    if (ts > s.t0 + EN && ts < s.t1 - EN && to > o.t0 + EN && to < o.t1 - EN) {
      R.cross++;
      const kk = s.k < o.k ? s.k + '/' + o.k : o.k + '/' + s.k;
      R.crossBy[kk] = (R.crossBy[kk] || 0) + 1;
      if (R.csample.length < 10) R.csample.push([kk, Math.round(s.x + s.ux * ts), Math.round(s.z + s.uz * ts)]);
    }
  }
});
// стены домов: отрезки контуров в сетке
const HG = new Map();
for (const b of d.CITY.buildings) {
  const p = b.p;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], c = p[(i + 1) % p.length];
    for (let u = Math.floor(Math.min(a[0], c[0]) / CS); u <= Math.floor(Math.max(a[0], c[0]) / CS); u++) for (let v = Math.floor(Math.min(a[1], c[1]) / CS); v <= Math.floor(Math.max(a[1], c[1]) / CS); v++) { const kk = key(u, v); let g = HG.get(kk); if (!g) HG.set(kk, g = []); g.push([a[0], a[1], c[0], c[1]]); }
  }
}
const dseg = (px, pz, e) => { const dx = e[2] - e[0], dz = e[3] - e[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((px - e[0]) * dx + (pz - e[1]) * dz) / l2)); return Math.hypot(px - e[0] - dx * t, pz - e[1] - dz * t); };
const WALL = +(Q.get('fowall') || 0.4);
for (const s of segs) {
  if (s.k !== 'big') continue;
  let best = 1e9;
  for (let q = 0; q <= 4; q++) {
    const t = s.t0 + (s.t1 - s.t0) * q / 4, px = s.x + s.ux * t, pz = s.z + s.uz * t;
    for (const e of HG.get(key(Math.floor(px / CS), Math.floor(pz / CS))) || []) { const dd = dseg(px, pz, e); if (dd < best) best = dd; }
  }
  if (best < WALL) { R.wall++; R.wallBy[s.k] = (R.wallBy[s.k] || 0) + 1; if (R.wsample.length < 10) R.wsample.push([Math.round(s.x), Math.round(s.z), +best.toFixed(2)]); }
}
R.ok = R.dup === 0 && R.cross === 0 && R.wall === 0;
return R;
