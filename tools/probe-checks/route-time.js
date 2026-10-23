/* Время поиска маршрута (плавные улицы 11ч, этап 4: с ?smooth узлов графа ~×1,8 — поиск не дороже +30 %).
   npm run probe -- --eval=tools/probe-checks/route-time.js --max=0               — как сейчас
   npm run probe -- --eval=tools/probe-checks/route-time.js --max=0 --q=smooth    — со скруглением
   (--q=rtn=300 — пар больше; --cpu=3 — как «Дека»)
   Пары «старт — адрес» — как в route-house.js (тот же сид): от пиццерии и с дороги в 250—900 м, плюс через город.
   nav — d.roadPath пересчёт к той же цели (хвост к клиенту уже найден — так игра считает раз в 0,35 с), мс на вызов:
   p50, p95, худшее; first — первый вызов к новой цели (с хвостом по клеткам сразу, RT.sync), tail — first без nav (кандидаты
   у клиента и проезд по клеткам; в игре проезд растянут по кадрам, RT.BUDGET), cand — сколько кандидатов у клиента. svc — путь курьеров
   (svcpath.js route), len — длина пути для срока заказа (routeLen). Длины путей — сумма, м (сравнить без и с флагом). */
const Q0 = new URLSearchParams(location.search), N = +(Q0.get("rtn") || 150), REP = +(Q0.get("rtrep") || 20);
await until(() => d.SPOTS && d.SPOTS.length > 50 && (!d.LATE || !d.LATE.busy()), 60000);
const pool = d.SPOTS.slice().sort((a, b) => a.x - b.x || a.z - b.z);
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const pz = d.PZ_CUR || (d.PIZZERIAS || []).find(Boolean) || pool[0];
// адрес — ближайший к случайной точке (а не по номеру: с ?smooth адресов на 3 больше — номера сдвигаются, пары разъезжаются)
let X0 = Infinity, X1 = -Infinity, Z0 = Infinity, Z1 = -Infinity;
for (const q of pool) { X0 = Math.min(X0, q.x); X1 = Math.max(X1, q.x); Z0 = Math.min(Z0, q.z); Z1 = Math.max(Z1, q.z); }
const spotAt = (x, z) => { let b = pool[0], bd = Infinity; for (const q of pool) { const e = (q.x - x) ** 2 + (q.z - z) ** 2; if (e < bd) { bd = e; b = q; } } return b; };
const rndSpot = () => spotAt(X0 + rnd() * (X1 - X0), Z0 + rnd() * (Z1 - Z0));
const jobs = [];
for (let s = 0; s < N; s++) {
  const p = rndSpot();
  jobs.push([pz.x, pz.z, p.x, p.z, rnd() * 6.28]);
  for (let t = 0; t < 20; t++) {
    const a = rnd() * Math.PI * 2, r = 250 + rnd() * 650, q = d.nearestRoad(p.x + Math.sin(a) * r, p.z + Math.cos(a) * r, 5, 2);
    if (q && q.d < 30) { jobs.push([q.x, q.z, p.x, p.z, rnd() * 6.28]); break; }
  }
  const o = rndSpot(), q = d.nearestRoad(o.x, o.z, 5, 2);   // через город
  if (q && q.d < 30) jobs.push([q.x, q.z, p.x, p.z, rnd() * 6.28]);
}
const pl = P => { let L = 0; for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return L; };
const qt = (a, p) => { const v = a.slice().sort((x, y) => x - y); return v.length ? +v[Math.min(v.length - 1, Math.floor(v.length * p))].toFixed(3) : 0; };
const st = a => ({ n: a.length, p50: qt(a, 0.5), p95: qt(a, 0.95), max: qt(a, 1), mean: +(a.reduce((s, v) => s + v, 0) / (a.length || 1)).toFixed(3) });
d.RT.sync = true;
const first = [], nav = [], pts = [], tail = [];
let navLen = 0, navPts = 0, cand = 0;
for (const [x0, z0, tx, tz, h] of jobs) {
  d.RT.key = NaN; d.RT.head = null; d.RT.headFail = null; d.RT.hjob = null; d.RP.sa = d.RP.sb = -1;
  let t0 = performance.now();
  const P = d.roadPath(x0, z0, tx, tz, h, false);
  first.push(performance.now() - t0);
  navLen += pl(P); navPts += P.length; pts.push(P.length); cand += d.RT.cand.length;
  t0 = performance.now();
  for (let k = 0; k < REP; k++) { d.RP.sa = d.RP.sb = -1; d.roadPath(x0, z0, tx, tz, h, false); }
  nav.push((performance.now() - t0) / REP);
  tail.push(Math.max(0, first[first.length - 1] - nav[nav.length - 1]));
}
d.RT.sync = false; d.RT.key = NaN; d.RT.head = null; d.RP.sa = d.RP.sb = -1;
// курьеры: svcpath (от точки на улице до точки на улице)
const svc = [];
let svcN = 0, svcFail = 0, svcLen = 0;
for (const [x0, z0, tx, tz] of jobs) {
  const r0 = d.nearestRoad(x0, z0, 5, 2), r1 = d.nearestRoad(tx, tz, 5, 3);
  if (!r0 || !r1) continue;
  const t0 = performance.now();
  let R = null;
  for (let k = 0; k < REP; k++) R = d.SVCP.route(r0, r1);
  svc.push((performance.now() - t0) / REP);
  svcN++;
  if (!R) { svcFail++; continue; }
  for (let i = 1; i < R.length; i++) svcLen += Math.hypot(R[i].x - R[i - 1].x, R[i].z - R[i - 1].z);
}
// срок заказа: routeLen (поиск в ширину routeNodes)
const len = [];
let lenSum = 0;
for (const [x0, z0, tx, tz] of jobs) {
  const t0 = performance.now();
  let L = 0;
  for (let k = 0; k < REP; k++) L = d.routeLen(x0, z0, tx, tz);
  len.push((performance.now() - t0) / REP);
  lenSum += L;
}
return { smooth: !!(d.SMOOTH && d.SMOOTH.STATS.on), nodes: d.NODES.length, jobs: jobs.length,
  nav: st(nav), first: st(first), tail: st(tail), svc: st(svc), len: st(len),
  sum: { navM: Math.round(navLen), navPts, cand, svcM: Math.round(svcLen), svcFail, svcN, lenM: Math.round(lenSum) } };
