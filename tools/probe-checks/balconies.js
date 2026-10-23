/* Балконы (balconies.js, М1): сколько их в городе и в кадре, кадры днём и ночью. В npm run check не входит.
   Числа:  npm run probe -- --eval=tools/probe-checks/balconies.js --size=deck --max=0 --timeout=300 --seed=7
   Кадры:  ... --q="bshots=/папка&bh=13" — улица и двор (bh — час мира: 13 день, 23 ночь); bat=X,Z,H — своя точка машины.
   bn=12 — мест для замера «сколько в кадре»; bfar — дальность счёта (м, 250). Сравнить с прежними коробками — ?nobalc
   (тогда балконов в счёте нет, только кадры и вызовы). Ответ: ST (сколько каких), win (стёкла балконов в окнах),
   view — балконов в кадре ближе 60 / 150 / bfar м по местам, calls — вызовов отрисовки в кадре по местам. */
/* нужен ?balcall (середины всех балконов для счёта «в кадре»): --q="balcall&…" */
const Q = new URLSearchParams(location.search), DIR = Q.get('bshots') || '', H = +(Q.get('bh') || 13), N = +(Q.get('bn') || 12), FAR = +(Q.get('bfar') || 250);
await onShift();
if (Q.has('bab')) {                                  // bab=N — кадр «набор и люди выкл / вкл» по очереди, N пар по 10 с, на автопилоте
  autopilot(true); await wait(4000);
  const T = { off: [], on: [] }; let mode = 'off', last = performance.now(), go = true;
  const loop = () => { const t = performance.now(); T[mode].push(t - last); last = t; if (go) requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  for (let i = 0; i < +Q.get('bab'); i++) for (const m of ['off', 'on']) { mode = 'skip'; T.skip = []; d.BALC.off = m === 'off'; await wait(800); mode = m; await wait(10000); }
  go = false;
  const st = a => { a = a.slice().sort((p, q) => p - q); const q = k => +a[Math.floor(a.length * k)].toFixed(1); return { n: a.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), avg: +(a.reduce((p, v) => p + v, 0) / a.length).toFixed(2), o20: +(a.filter(v => v > 20).length / a.length * 100).toFixed(2) }; };
  return { off: st(T.off), on: st(T.on), ST: d.BALC.ST };
}
autopilot(false);
if (Q.has('bman')) {                                 // bman — машина у дома, жилец выходит (force), 12 с: курит / машет; кадр — bshots
  d.CITYOPEN.unlockAll(); d.districtLocks(); d.ENV.t = d.ECON.tOfHour(H);
  const B = d.BALC, sp = B.spot(+Q.get('bman') || 1234), x = sp.x + sp.ox * 16, z = sp.z + sp.oz * 16, h = Math.atan2(-sp.ox, -sp.oz);
  const put = () => { const V = d.V; V.vx = V.vz = 0; V.x = x; V.z = z; V.h = h; V.y = d.groundH(x, z); if (d.car) { d.car.position.set(V.x, V.y, V.z); d.car.rotation.y = V.h; } d.ENV.t = d.ECON.tOfHour(H); };
  // камера — своя: в bcam м перед балконом на высоте 2 м, смотрит на него (поверх камеры игры, перед отрисовкой)
  const R = d.renderer, r0 = R.render.bind(R), cd = +(Q.get('bcam') || 14);
  R.render = (sc, c) => { const t = B.MEN.length ? B.MEN[0].sp : sp; c.position.set(t.x + t.ox * cd + t.oz * 3, t.y + 1.2 - Math.min(3, t.y * 0.3), t.z + t.oz * cd - t.ox * 3); c.lookAt(t.x, t.y + 1.1, t.z); c.updateMatrixWorld(); r0(sc, c); };
  for (let k = 0; k < 30; k++) { put(); await wait(50); }
  for (let k = 0; k < 3; k++) { B.force(Q.has('bsmoke')); for (let i = 0; i < 20; i++) { put(); await wait(50); } }
  const tr = [];
  for (let k = 0; k < 200; k++) { put(); await wait(50); if (k % 20 === 0) tr.push(B.MEN.map(m => m.st + ':' + m.t.toFixed(1) + ':' + Math.hypot(m.x - d.V.x, m.z - d.V.z).toFixed(0)).join(' ')); }
  log(tr);
  if (Q.get('bshots')) await shot(Q.get('bshots') + '/man-h' + H + '.png');
  return { men: B.MEN.map(m => [m.st, m.smoke, +Math.hypot(m.x - d.V.x, m.z - d.V.z).toFixed(1)]), ST: { spawned: B.ST.spawned, waves: B.ST.waves, puffs: B.ST.puffs }, cam: [d.cam.position.x, d.cam.position.y, d.cam.position.z].map(v => +v.toFixed(1)) };
}
d.CITYOPEN.unlockAll(); d.districtLocks();
d.ENV.t = d.ECON.tOfHour(H);
const B = d.BALC, T = d.THREE, cam = d.cam, R = d.renderer;
const hold = () => { d.V.vx = d.V.vz = 0; for (const k in d.IN) if (typeof d.IN[k] === 'number') d.IN[k] = 0; d.ENV.t = d.ECON.tOfHour(H); };
const put = (x, z, h) => { const V = d.V; V.x = x; V.z = z; V.h = h; V.y = d.groundH(x, z); if (d.car) { d.car.position.set(V.x, V.y, V.z); d.car.rotation.y = V.h; } };
let calls = 0; const r0 = R.render.bind(R);
R.render = (s, c) => { r0(s, c); calls = R.info.render.calls; };
const settle = async (x, z, h, n = 40) => { for (let k = 0; k < n; k++) { hold(); put(x, z, h); await wait(50); } };
const FR = new T.Frustum(), M4 = new T.Matrix4(), P = new T.Vector3();
const inFrame = () => {
  if (!B || !B.ALL) return null;
  cam.updateMatrixWorld(); M4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); FR.setFromProjectionMatrix(M4);
  const A = B.ALL, c = [0, 0, 0];
  for (let i = 0; i < A.length; i += 3) {
    const dd = Math.hypot(A[i] - cam.position.x, A[i + 2] - cam.position.z);
    if (dd > FAR) continue;
    P.set(A[i], A[i + 1], A[i + 2]);
    if (!FR.containsPoint(P)) continue;
    c[2]++; if (dd < 150) c[1]++; if (dd < 60) c[0]++;
  }
  return c;
};
const out = { ST: B ? { ...B.ST } : null, win: { ...d.WIN }, view: [], calls: [] };
// отпечаток города: зерно сборки не сдвинулось, если совпадает с ?nobalc
out.seedPrint = [d.BENCHES.length, +d.BENCHES.reduce((p, b) => p + b.x * 0.37 + b.z * 0.61, 0).toFixed(2), d.PROPS.length, d.SOLIDS.length, +d.SOLIDS.slice(0, 5000).reduce((p, b) => p + (b.cx || b.x || 0) * 0.3 + (b.cz || b.z || 0) * 0.7, 0).toFixed(2)];
// места: открытые балконы по городу через равный шаг, машина на дороге перед домом носом к балкону
const NS = B ? B.open : 0;
const at = Q.get('bat');
const places = [];
if (at) for (const a of at.split(';')) places.push(a.split(',').map(Number));   // bat=X,Z,H;X,Z,H — свои точки
else for (let i = 0; i < N && NS; i++) {
  const sp = B.spot(Math.floor((i + 0.5) / N * NS));
  if (Q.has('bclose')) {                         // близко: машина в 14 м от стены носом к балкону (может и на газоне)
    const x = sp.x + sp.ox * 14, z = sp.z + sp.oz * 14;
    places.push([x, z, Math.atan2(-sp.ox, -sp.oz)]);
    continue;
  }
  tp(sp.x + sp.ox * 22, sp.z + sp.oz * 22);
  const V = d.V;
  places.push([V.x, V.z, Math.atan2(sp.x - V.x, sp.z - V.z)]);
}
for (const [x, z, h] of places) {
  await settle(x, z, h, 30);
  out.view.push(inFrame()); out.calls.push(calls);
}
const avg = a => +(a.reduce((p, q) => p + q, 0) / Math.max(1, a.length)).toFixed(1);
out.avg = { near60: avg(out.view.map(v => v ? v[0] : 0)), near150: avg(out.view.map(v => v ? v[1] : 0)), far: avg(out.view.map(v => v ? v[2] : 0)), calls: avg(out.calls) };
out.places = places.map(p => p.map(v => +v.toFixed(2)).join(','));
if (DIR) {
  for (const [i, [x, z, h]] of places.slice(0, Q.get('bk') ? +Q.get('bk') : 2).entries()) {
    await settle(x, z, h, 50);
    await run(1.5);
    await settle(x, z, h, 10);
    await shot(DIR + '/b' + i + '-h' + H + '.png');
  }
}
out.men = B ? B.MEN.length : 0;
out.ST2 = B ? { people: B.ST.people, spawned: B.ST.spawned, waves: B.ST.waves, puffs: B.ST.puffs } : null;
return out;
