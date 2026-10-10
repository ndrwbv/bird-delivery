/* Маршрут навигатора не режет дома (для npm run check; можно и так:
   npm run probe -- --eval=tools/probe-checks/route-house.js).
   Адреса заказов (SPOTS) — случайные N штук (сид постоянный); к каждому два старта: от пиццерии
   и с дороги в 250—900 м от адреса; и выезд со двора: от адреса к адресу другого задания. Маршрут — тот же,
   что рисует игра (d.roadPath). По всей ломаной через 1 м: точка в доме (контур CITY.buildings, HOUSE_GRID; арка-проезд — не дом) — «режет дом»; последние 1,5 м у
   клиента и у старта со двора не считаем (стоят у стены). before — по-старому (RYARD.RY.OFF), after — сейчас.
   tail / head — время поиска проезда по клеткам (к клиенту — раз на адрес, со двора — раз на двор; в игре
   растянуты по кадрам, здесь — сразу, RT.sync), мс: p50, p95, худшее. noRoad — старт дальше 400 м от улиц, far — дальше 230 м (за окном поиска): не провал, считаем отдельно. */
const N = +(window.__RH_N || 300);
await until(() => d.SPOTS && d.SPOTS.length > 50 && (!d.LATE || !d.LATE.busy()), 30000);
const pool = d.SPOTS;
const inPoly = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
// арка — сквозной проезд во двор через дом (game.js archFor, ширина 5,2 м): не дом
const inArch = (x, z) => d.ARCHES.some(a => { const dx = x - a.mx, dz = z - a.mz, l = dx * a.ix + dz * a.iz, w = dx * a.ux + dz * a.uz; return l > -1 && l < a.t + 1 && Math.abs(w) < 2.2; });
const inHouse = (x, z) => { for (const b of d.HOUSE_GRID.get(Math.floor(x / 40) + ',' + Math.floor(z / 40)) || []) if (inPoly(x, z, b.p)) return !inArch(x, z); return false; };
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const pz = d.PZ_CUR || (d.PIZZERIAS || []).find(Boolean) || pool[0];
// пары «адрес — старт»: от пиццерии и с дороги в 250—900 м
const jobs = [];
for (let s = 0; s < N; s++) {
  const p = pool[Math.floor(rnd() * pool.length)];
  jobs.push([pz.x, pz.z, p.x, p.z, rnd() * 6.28]);
  for (let t = 0; t < 20; t++) {
    const a = rnd() * Math.PI * 2, r = 250 + rnd() * 650, q = d.nearestRoad(p.x + Math.sin(a) * r, p.z + Math.cos(a) * r, 5, 2);
    if (q && q.d < 30) { jobs.push([q.x, q.z, p.x, p.z, rnd() * 6.28]); break; }
  }
}
// cuts: start — пропустить и первые 1,5 м (старт во дворе: машина стоит у стены)
const cutsFrom = (R, tx, tz, sx, sz) => {
  for (let i = 1; i < R.length; i++) {
    const [ax, az] = R[i - 1], [bx, bz] = R[i], L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L);
    for (let k = 1; k < n; k++) {
      const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
      if (Math.hypot(x - tx, z - tz) < 1.5 || Math.hypot(x - sx, z - sz) < 1.5) continue;
      if (inHouse(x, z)) return { seg: i, of: R.length - 1, x: Math.round(x), z: Math.round(z) };
    }
  }
  return null;
};
// выезд со двора: старт — адрес (машина там, где отдала заказ), цель — адрес другого задания
const yardJobs = jobs.filter((j, i) => i % 2 === 0).map((j, i, A) => { const o = A[(i + 7) % A.length]; return [j[2], j[3], o[2], o[3], j[4]]; });
const pass = (off, list, tag) => {
  d.RYARD.RY.OFF = off; d.RT.key = NaN; d.RT.head = null; d.RT.sync = true;
  const R = { n: 0, cut: 0, noRoad: 0, far: 0, ms: 0, msMax: 0, sample: [] };
  for (const [x0, z0, tx, tz, h] of list) {
    d.RT.head = null; d.RT.headFail = null; d.RT.hjob = null;
    const t0 = performance.now();
    const pts = d.roadPath(x0, z0, tx, tz, h, false);
    const ms = performance.now() - t0;
    R.ms += ms; R.msMax = Math.max(R.msMax, ms); R.n++;
    if (pts.length === 2) { R.noRoad++; continue; }   // до дороги от старта > 400 м (лес, пустошь): навигатору не по чему вести
    const c = cutsFrom(pts, tx, tz, x0, z0);
    // старт дальше окна поиска (240 м) от ближайшей улицы — выезд по клеткам не ищется, прямая к улице
    if (c && c.seg === 1 && Math.hypot(pts[1][0] - x0, pts[1][1] - z0) > 230) { R.far++; continue; }
    // и адрес дальше окна от улицы (точка в 300 м от дорог, промка на севере): последний кусок — тоже прямая
    if (c && c.seg === pts.length - 1 && Math.hypot(pts[pts.length - 2][0] - tx, pts[pts.length - 2][1] - tz) > 230) { R.far++; continue; }
    if (c) { R.cut++; if (R.sample.length < 6) R.sample.push({ tag, to: [Math.round(tx), Math.round(tz)], from: [Math.round(x0), Math.round(z0)], ...c }); }
  }
  R.ms = +(R.ms / R.n).toFixed(2); R.msMax = +R.msMax.toFixed(1);
  return R;
};
const before = pass(true, jobs, 'к клиенту'), beforeY = pass(true, yardJobs, 'со двора');
d.RYARD.STATS.log = []; d.RYARD.STATS.pathMax = 0;
const after = pass(false, jobs, 'к клиенту'), afterY = pass(false, yardJobs, 'со двора');
const L = d.RYARD.STATS.log; d.RYARD.STATS.log = null; d.RYARD.RY.OFF = false; d.RT.key = NaN; d.RT.sync = false; d.RT.head = null;
const q = (a, f, p = 0.95) => { const v = a.map(f).sort((x, y) => x - y); return v.length ? +v[Math.min(v.length - 1, Math.floor(v.length * p))].toFixed(2) : 0; };
const st = s => { const a = L.filter(e => e.slot === s); return { calls: a.length, p50: q(a, e => e.ms, 0.5), p95: q(a, e => e.ms), max: q(a, e => e.ms, 1), raster95: q(a, e => e.raster), cells95: q(a, e => e.cells), n95: q(a, e => e.n) }; };
const bad = after.cut + afterY.cut;
return { ok: bad === 0, n: after.n, yard: afterY.n, noRoad: after.noRoad + afterY.noRoad, far: after.far + afterY.far, before: before.cut, after: after.cut, beforeYard: beforeY.cut, afterYard: afterY.cut,
  sample: bad ? [...after.sample, ...afterY.sample] : [...before.sample.slice(0, 3), ...beforeY.sample.slice(0, 3)],
  ms: after.ms, msOld: before.ms, tail: st(0), head: st(1), pathMax: +d.RYARD.STATS.pathMax.toFixed(2) };
