/* Варианты заборов и препятствий (fencevar.js, М5): сколько каких в городе, вызовы отрисовки и кадры по местам.
   В npm run check не входит.
   Числа:  npm run probe -- --eval=tools/probe-checks/fence-vars.js --size=deck --max=0 --timeout=400 --seed=7
   Кадры:  ... --q="fvshots=/папка" — по кадру на место (улица и двор: Старый город, окраина, частный сектор), полным размером;
           fvh — час мира (13); fvseason — сезон (0.5 — лето, 2.5 — зима; иначе — как выпал); fvat=X,Z,H[,1];… — свои места машины (1 — не на дорогу, как стоит); fvclose — высокие заборы вблизи (иначе выбираются сами, по районам и предметам).
   Ответ: rails — оградки газона (выборка клеток рядом с местами: вид × износ), solid — твёрдые заборы у тротуаров по видам
   и износу, tall — высокие заборы частных домов по видам, calls — вызовов в кадре по местам, places — места (для fvat). */
const Q = new URLSearchParams(location.search), DIR = Q.get('fvshots') || '', H = +(Q.get('fvh') || 13);
await onShift(); autopilot(false);
if (d.CITYOPEN && d.CITYOPEN.unlockAll) d.CITYOPEN.unlockAll();
if (d.districtLocks) d.districtLocks();
await until(() => !d.LATE || !d.LATE.busy(), 120000);
d.ENV.t = d.ECON.tOfHour(H);
if (Q.get('fvseason') && d.setSeason) d.setSeason(+Q.get('fvseason'));   // 0.5 — середина лета, 2.5 — зима
const R = d.renderer, FV = d.FENCEVAR || null;
const hold = () => { d.V.vx = d.V.vz = 0; for (const k in d.IN) if (typeof d.IN[k] === 'number') d.IN[k] = 0; d.ENV.t = d.ECON.tOfHour(H); };
const put = (x, z, h) => { const V = d.V; V.x = x; V.z = z; V.h = h; V.y = d.groundH(x, z); if (d.car) { d.car.position.set(V.x, V.y, V.z); d.car.rotation.y = V.h; } };
let calls = 0; const r0 = R.render.bind(R);
let EYE = null;                                    // вблизи: камера сама — [x, y, z, куда x, y, z] (машина — где стоит)
R.render = (s, c) => { if (EYE && c === d.cam) { c.position.set(EYE[0], EYE[1], EYE[2]); c.lookAt(EYE[3], EYE[4], EYE[5]); c.updateMatrixWorld(); } r0(s, c); calls = R.info.render.calls; };
const eye = (x, z, tx, tz, h = 1.7) => [x, d.groundH(x, z) + h, z, tx, d.groundH(tx, tz) + 0.6, tz];
const cam0 = (x, z, h) => { const V = d.V; V.hero = 0; V.camX = x - Math.sin(h) * 11; V.camZ = z - Math.cos(h) * 11; V.camH = h; V.camY = d.groundH(x, z) + 6; };
const settle = async (x, z, h, n = 40, free) => { if (free) { put(x, z, h); cam0(x, z, h); } else tp(x, z, h); for (let k = 0; k < n; k++) { hold(); put(x, z, h); await wait(50); } };   // tp — и камера сразу за машиной; free — где стоит, без дороги
const dist = (x, z) => (d.DIST && d.DIST.at ? d.DIST.at(x, z) : -1);
const out = { FV: FV ? FV.ST : null, solid: {}, tall: {}, rails: {}, calls: [], places: [] };
// отпечаток города: заборы и всё сбиваемое там же (до/после совпадает)
out.print = [d.SOLIDS.length, d.SMASH.length, d.YMAZE.FEN.length, +d.YMAZE.FEN.reduce((p, f) => p + f.ax * 0.3 + f.az * 0.7, 0).toFixed(2), d.RL.RL.n.panels];
for (const f of d.YMAZE.FEN) { const k = f.sty + (f.wear !== undefined ? '/' + f.wear : ''); out.solid[k] = (out.solid[k] || 0) + 1; }
if (FV && FV.TALL) for (const v of FV.TALL) out.tall[v] = (out.tall[v] || 0) + 1;
// места
const places = [];
const at = Q.get('fvat');
if (at) for (const a of at.split(';')) places.push(a.split(',').map(Number));
else {
  // твёрдый забор у тротуара: аккуратный кирпич с решёткой (Старый город), старые столбы с трубой, старый парапет —
  // машина на дороге в 6 м до куска, вдоль забора (без износа — ?nofvar — те же места: выбор по месту куска)
  const want = Q.has('fvold') ? [] : [[2, 0], [1, 2], [0, 2]];
  const FEN = d.YMAZE.FEN, wearOf = f => (f.wear !== undefined ? f.wear : -1);
  const fen = FV && !FV.OFF ? want.map(([st, we]) => FEN.find(q => q.sty === st && wearOf(q) === we && Math.hypot(q.bx - q.ax, q.bz - q.az) > 16)) : [];
  if (!fen.length) for (const zz of [[4], [6, 5]]) fen.push(FEN.find(q => zz.includes(dist(q.ax, q.az)) && zz.includes(dist(q.bx, q.bz)) && Math.hypot(q.bx - q.ax, q.bz - q.az) > 20));
  for (const f of fen) {
    if (!f) continue;
    const ux = (f.bx - f.ax), uz = (f.bz - f.az), l = Math.hypot(ux, uz);
    if (Q.has('fvclose')) {                         // близко: глаз над тротуаром в 3,5 м от забора, смотрит на кусок наискосок
      const mx = f.ax + ux / l * Math.min(8, l / 2), mz = f.az + uz / l * Math.min(8, l / 2), ex = f.ax - ux / l * 2 + (f.rx || 0) * 3.5, ez = f.az - uz / l * 2 + (f.rz || 0) * 3.5;
      tp(ex, ez); places.push([d.V.x, d.V.z, Math.atan2(ux, uz), 0, eye(ex, ez, mx, mz)]); continue;
    }
    tp(f.ax - ux / l * 6 + (f.rx || 0) * 6, f.az - uz / l * 6 + (f.rz || 0) * 6);
    places.push([d.V.x, d.V.z, Math.atan2(ux, uz)]);
  }
  // высокие заборы домов по видам (FENCEVAR.TALL — в том же порядке, что RL.fenceAt): доски, профлист, рабица, старый
  // профлист / ржавые пики; машина — на ближней к воротам дороге, носом к дому
  const FA = d.RL.RL.fenceAt, TL = FV ? FV.TALL : [];
  const tiles = FV && !FV.OFF ? [4, 2, 5, 3] : [];
  const picked = tiles.map(t => FA.find((p, i) => TL[i] === t && Math.hypot(p[3] - p[0], p[4] - p[1]) > 6)).filter(Boolean);
  if (!picked.length) for (const zz of [[7], [3, 4, 2]]) picked.push(FA.find(p => zz.includes(dist(p[0], p[1])) && Math.hypot(p[3] - p[0], p[4] - p[1]) > 8));
  for (const q of picked) {
    if (!q) continue;
    if (Q.has('fvclose')) {                         // близко: в 8 м перед воротами, носом к дому (может и на газоне)
      const dx = q[0] - q[3], dz = q[1] - q[4], l = Math.hypot(dx, dz) || 1;
      const ex = q[3] - dx / l * 7, ez = q[4] - dz / l * 7;
      tp(q[3], q[4]); places.push([d.V.x, d.V.z, Math.atan2(dx, dz), 0, eye(ex, ez, q[3] + (q[0] - q[3]) * 0.3, q[4] + (q[1] - q[4]) * 0.3, 2.4)]);
      continue;
    }
    tp(q[3], q[4]);
    const dx = q[0] - d.V.x, dz = q[1] - d.V.z;
    places.push([d.V.x, d.V.z, Math.atan2(dx, dz)]);
  }
}
for (const [x, z, h, free] of places) {
  await settle(x, z, h, 40, free);
  if (d.LAWN && d.LAWN.warm) d.LAWN.warm(x, z, 90);
  await settle(x, z, h, 10, free);
  out.calls.push(calls);
}
// оградки газона: что собралось в клетках вокруг мест
if (d.LAWN) for (const c of d.LAWN.CELLS.values()) for (const it of c.items) if (it.kind === 'rail') { const k = it.v !== undefined ? it.v : '-'; out.rails[k] = (out.rails[k] || 0) + 1; }
// вблизи — ещё по оградке газона каждого вида (из клеток, что собрались у мест): машина в 6 м, носом к секции
if (Q.has('fvclose') && d.LAWN) {
  const got = {}, FEN = d.YMAZE.FEN;
  for (let i = 0; i < 16; i++) { const f = FEN[Math.floor((i + 0.5) / 16 * FEN.length)]; d.LAWN.warm(f.ax, f.az, 80); }   // клетки газона в разных районах
  for (const c of d.LAWN.CELLS.values()) for (const it of c.items) if (it.kind === 'rail' && it.v !== undefined && (!got[Math.floor(it.v / 10)] || (it.v % 10) > (got[Math.floor(it.v / 10)].v % 10))) got[Math.floor(it.v / 10)] = it;   // по виду — самая изношенная
  for (const k of Object.keys(got).sort()) {
    const it = got[k], [a, b] = it.pts, ux = b[0] - a[0], uz = b[1] - a[1], l = Math.hypot(ux, uz) || 1, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    tp(mx, mz); places.push([d.V.x, d.V.z, d.V.h, 0, eye(mx - uz / l * 3.2 - ux / l * 2, mz + ux / l * 3.2 - uz / l * 2, mx + ux / l * 1.2, mz + uz / l * 1.2, 1.3)]);
  }
}
out.places = places.map(p => p.slice(0, 4).map(v => +(+v || 0).toFixed(2)).join(',')).join(';');
out.dists = places.map(p => dist(p[0], p[1]));
if (DIR) {
  for (const [i, [x, z, h, free, E]] of places.entries()) {
    await settle(x, z, h, 40, free);
    if (d.LAWN && d.LAWN.warm && E) d.LAWN.warm(E[3], E[5], 60);
    await run(1.2);
    await settle(x, z, h, 12, free);
    EYE = E || null;
    await wait(200);
    await shot(DIR + '/fv' + i + '.png');
    EYE = null;
  }
}
return out;
