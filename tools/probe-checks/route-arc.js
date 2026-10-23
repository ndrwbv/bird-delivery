/* Линия маршрута на дуге (плавные улицы 11ч, этап 4): кадры сверху — полоса на асфальте и радар на крутых дугах.
   npm run probe -- --eval=tools/probe-checks/route-arc.js --q="smooth&rashots=/папка" --max=0 --timeout=300
   (без smooth — те же места углом; места — по ?smooth: ra=X,Z;… — свои, вершины излома; thin0 — путь прорежен как до этапа 4).
   Места: крутые дуги улицы (класс 4—5), проезда (класс 7, ближний к пиццерии) и большой улицы (1—3) — машина в ~30 м до излома, цель — в ~30 м за ним по той же
   улице. Ответ: по месту — точек пути на дуге (в 12 м от вершины), наибольший излом пути там, градусов (углом — 60—90). */
const Q = new URLSearchParams(location.search), DIR = Q.get('rashots') || '';
if (Q.has('thin0')) d.RT.thin0 = true;            // прореживание пути как до этапа 4 (дуга углом) — сравнить
await onShift(); autopilot(false);
if (d.CITYOPEN && d.CITYOPEN.unlockAll) d.CITYOPEN.unlockAll();
if (d.districtLocks) d.districtLocks();
await until(() => !d.LATE || !d.LATE.busy(), 120000);
d.ENV.t = d.ECON.tOfHour(13);
const R = d.renderer, r0 = R.render.bind(R);
let EYE = null;
R.render = (s, c) => { if (EYE && c === d.cam) { c.position.set(EYE[0], EYE[1], EYE[2]); c.lookAt(EYE[3], EYE[4], EYE[5]); c.updateMatrixWorld(); } r0(s, c); };
const hold = () => { d.V.vx = d.V.vz = 0; for (const k in d.IN) if (typeof d.IN[k] === 'number') d.IN[k] = 0; d.ENV.t = d.ECON.tOfHour(13); };
// места: вершины изломов (как в ?smooth: ARCS); без флага — те же координаты (--q=ra=…)
let at = (Q.get('ra') || '').split(';').filter(Boolean).map(a => a.split(',').map(Number));
if (!at.length && d.SMOOTH && d.SMOOTH.ARCS.length) {
  const A = d.SMOOTH.ARCS;
  const pick = f => A.filter(f).sort((a, b) => b.deg - a.deg)[0];
  at = [pick(a => a.c >= 4 && a.c <= 5 && a.deg >= 60 && a.deg <= 100), A.filter(a => a.c === 7 && a.deg >= 60 && a.deg <= 100).sort((a, b) => Math.hypot(a.x - d.PZ_CUR.x, a.z - d.PZ_CUR.z) - Math.hypot(b.x - d.PZ_CUR.x, b.z - d.PZ_CUR.z))[0], pick(a => a.c <= 3 && a.deg >= 20)].filter(Boolean).map(a => [a.x, a.z]);
}
const roads = d.CITY.roads;
const out = [];
for (const [vx, vz] of at) {
  // улица у вершины и точка на ней
  let br = null, bi = -1, bd = Infinity;
  for (const r of roads) { if (!r.p || r.c > 7 || r.c === 6) continue; r.p.forEach((q, i) => { const e = Math.hypot(q[0] - vx, q[1] - vz); if (e < bd) { bd = e; br = r; bi = i; } }); }
  if (!br) continue;
  const p = br.p, along = (i, dir, m) => { let L = 0, k = i; while (k + dir >= 0 && k + dir < p.length && L < m) { L += Math.hypot(p[k + dir][0] - p[k][0], p[k + dir][1] - p[k][1]); k += dir; } return k; };
  const a = along(bi, -1, 30), b = along(bi, 1, 30);
  const sx = p[a][0], sz = p[a][1], nx = p[Math.min(p.length - 1, a + 1)];
  const h = Math.atan2(nx[0] - sx, nx[1] - sz);
  const put = () => { const V = d.V; V.x = sx; V.z = sz; V.h = h; V.y = d.groundH(sx, sz); if (d.car) { d.car.position.set(V.x, V.y, V.z); d.car.rotation.y = V.h; } };
  tp(sx, sz, h); put();                            // tp — камера за машиной; put — на саму улицу (и на проезд: tp ставит на ближнюю улицу)
  for (let k = 0; k < 10; k++) { hold(); put(); await wait(50); }
  d.S.target = { x: p[b][0], z: p[b][1], name: 'дуга' };
  d.RP.cur = null; d.rebuildRoutePath();
  for (let k = 0; k < 30; k++) { hold(); put(); await wait(50); }
  // путь у вершины: точки и наибольший излом
  const P = d.route, near = [];
  P.forEach((q, i) => { if (Math.hypot(q[0] - vx, q[1] - vz) < 12) near.push(i); });
  let maxTurn = 0;
  for (const i of near) {
    if (i < 1 || i >= P.length - 1) continue;
    const ux = P[i][0] - P[i - 1][0], uz = P[i][1] - P[i - 1][1], wx = P[i + 1][0] - P[i][0], wz = P[i + 1][1] - P[i][1];
    const c = (ux * wx + uz * wz) / (Math.hypot(ux, uz) * Math.hypot(wx, wz) || 1);
    maxTurn = Math.max(maxTurn, Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI);
  }
  const row = { at: [vx, vz], c: br.c, pts: near.length, maxTurn: Math.round(maxTurn), route: P.length, on: d.routeOn };
  if (DIR) {
    const y = d.groundH(vx, vz);
    EYE = [vx + 4, y + 34, vz + 10, vx, y, vz];
    for (let k = 0; k < 6; k++) { hold(); put(); await wait(60); }
    row.shot = DIR + '/arc-' + (d.SMOOTH && d.SMOOTH.STATS.on ? (d.RT.thin0 ? 'thin0' : 'smooth') : 'old') + '-' + out.length + '.png';
    await shot(row.shot);
    EYE = null;
  }
  out.push(row);
}
return { smooth: !!(d.SMOOTH && d.SMOOTH.STATS.on), out };
