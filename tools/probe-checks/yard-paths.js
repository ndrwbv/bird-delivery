/* Дорожки дворов ведут в общую сеть, точки конкурентов — за тротуаром (для npm run check; можно и так:
   npm run probe -- --eval=tools/probe-checks/yard-paths.js).
   Дворы многоэтажек (yards.js, d.YARDS.NETS — сеть одной стены):
     • каждая нарисованная тропинка от двери кончается на общей дорожке своей стены (≤ 1,2 м до её оси)
       или у края проезда двора;
     • у каждой общей дорожки есть выход, и он кончается на тротуаре, пешеходке, краю проезда, аллее
       или на чужой дорожке (pave.js: «где ходят») — не в газоне;
     • ни выход, ни общая дорожка не идут сквозь дом и стоячий забор (через 1 м по оси);
     • концы общей дорожки — у выхода или у крайней двери, без хвоста в газон.
   Точки конкурентов (rivals.js): весь участок (терраса, павильон, площадка) не на тротуаре, полотне и
   аллее; от тротуара к входу на террасу — своя дорожка, начало — на тротуаре. */
const P = d.PAVE.onPave, Y = d.YARDS;
const inPoly = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const inHouse = (x, z) => { for (const b of d.HOUSE_GRID.get(Math.floor(x / 40) + ',' + Math.floor(z / 40)) || []) if (inPoly(x, z, b.p)) return true; return false; };
const segD = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
const polyD = (x, z, q) => { let m = 1e9; for (let i = 1; i < q.length; i++) m = Math.min(m, segD(x, z, q[i - 1][0], q[i - 1][1], q[i][0], q[i][1])); return m; };
// стоячие заборы — сеткой 10 м
const FG = new Map();
for (const it of (d.SMASH.list || d.SMASH)) {
  if ((it.kind !== 'fence' && it.kind !== 'bigfence') || it.down) continue;
  const x = it.x ?? it.x0, z = it.z ?? it.z0, k = Math.floor(x / 10) + ',' + Math.floor(z / 10);
  let a = FG.get(k); if (!a) FG.set(k, a = []); a.push([x, z]);
}
const fenceAt = (x, z, r) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const [fx, fz] of FG.get((Math.floor(x / 10) + i) + ',' + (Math.floor(z / 10) + j)) || []) if (Math.hypot(fx - x, fz - z) < r) return true; return false; };
const asphaltEdge = (x, z, m) => { const r = d.nearestRoad(x, z, 7, 1); return !!r && r.d < r.seg.w / 2 + m; };
const R = { nets: Y.NETS.length, doors: 0, walks: 0, links: 0, stub: 0, by: {}, sample: [] };
const fail = (k, x, z) => { R.by[k] = (R.by[k] || 0) + 1; if (R.sample.length < 6) R.sample.push([k, Math.round(x), Math.round(z)]); };
const along = (q, fn) => { for (let i = 1; i < q.length; i++) { const [ax, az] = q[i - 1], [bx, bz] = q[i], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L)); for (let k = 0; k <= n; k++) if (fn(ax + (bx - ax) * k / n, az + (bz - az) * k / n)) return true; } return false; };
for (const N of Y.NETS) {
  for (const [a, b] of N.doors) {
    R.doors++;
    if (N.walk ? polyD(b[0], b[1], N.walk) > 1.2 : !asphaltEdge(b[0], b[1], 1.0)) fail('тропинка двери висит', b[0], b[1]);
  }
  if (!N.walk) continue;
  R.walks++;
  if (!N.links.length) { fail('нет выхода', N.walk[0][0], N.walk[0][1]); continue; }
  for (const [s, e, to] of N.links) {
    R.links++;
    if (polyD(s[0], s[1], N.walk) > 1.0) fail('выход не от дорожки', s[0], s[1]);
    const k = P(e[0], e[1], 0.2);
    if (!k) fail('выход в газон', e[0], e[1]);
    else if (k === 'path' && to !== 'alley') {   // чужая дорожка (до её края ≤ 0,8 м): не своя же общая или выход; аллея — pave.js сам
      let other = false;
      for (const q of d.CITY.paths) { if (q === N.walk || q.length < 2) continue; if (q.length === 2 && Math.hypot(q[0][0] - s[0], q[0][1] - s[1]) < 0.01) continue; if (polyD(e[0], e[1], q) < 1.8) { other = true; break; } }
      if (!other) fail('выход в газон', e[0], e[1]);
    }
    along([s, e], (x, z) => (inHouse(x, z) && (fail('сквозь дом', x, z), true)) || (fenceAt(x, z, 0.6) && (fail('сквозь забор', x, z), true)));
  }
  along(N.walk, (x, z) => (inHouse(x, z) && (fail('сквозь дом', x, z), true)) || (fenceAt(x, z, 0.6) && (fail('сквозь забор', x, z), true)));
  // концы общей дорожки: у выхода или у крайней двери (без хвоста в газон)
  for (const p of [N.walk[0], N.walk[N.walk.length - 1]]) {
    const ok = N.links.some(([s]) => Math.hypot(s[0] - p[0], s[1] - p[1]) < 1.5) || N.doors.some(([, b]) => Math.hypot(b[0] - p[0], b[1] - p[1]) < 2.5) ||
      N.links.some(([s]) => polyD(s[0], s[1], [p, p]) < 1.5);
    if (!ok) R.stub++;
  }
}
// точки конкурентов
const RV = d.RIV, shops = RV.SHOPS, WT = RV.RIV.W + RV.RIV.SIDE * 2, DT = RV.RIV.TER + RV.RIV.D + 1.2;
R.shops = shops.length; R.branch = 0;
for (const s of shops) {
  let on = null;
  for (let a = -WT / 2; a <= WT / 2 + 1e-6 && !on; a += 1) for (let b = 0; b <= DT + 1e-6; b += 1) {
    const x = s.fx + s.ux * a + s.nx * b, z = s.fz + s.uz * a + s.nz * b, k = P(x, z, 0);
    if (k && k !== 'path') { on = [k, x, z]; break; }
  }
  if (on) fail('точка конкурента на ' + on[0], on[1], on[2]);
  if (!s.branch) fail('у точки нет дорожки от тротуара', s.x, s.z);
  else {
    R.branch++;
    const [b0] = s.branch, k = P(b0[0], b0[1], 0.2);
    if (k !== 'walk' && k !== 'road') fail('дорожка точки не от тротуара', b0[0], b0[1]);
  }
}
const bad = Object.values(R.by).reduce((a, b) => a + b, 0);
const S = Y.STATS;
return { ok: bad === 0 && R.links > 0 && R.shops > 0 && R.stub === 0, bad, ...R,
  stats: { doors: S.doors, paths: S.paths, doorRoad: S.doorRoad, doorBlock: S.doorBlock, doorHang: S.doorHang, doorShort: S.doorShort, walks: S.walks, walkHang: S.walkHang, trim: S.trim, links: S.links, linkM: S.linkM, to: S.to, benches: S.benches, ms: S.ms } };
