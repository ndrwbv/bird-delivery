/* Погоня обиженного водителя водит как человек (0п49, 24.10.2026; chase.js, docs/CAREER.md «Обиженный водитель гонится»).
   В npm run check не входит. Запуск:
     npm run probe -- --eval=tools/probe-checks/chase-drive.js --max=0 --timeout=300 [--q=cshots=/папка] [--q=oldchase]
   Смена на автопилоте; ближняя машина потока в 25—90 м начинает погоню (часы погони — 999 с, чтобы хватило на замер).
   ~35 с ты едешь (автопилот), потом стоишь 20 с, едешь ещё 10 с и снова стоишь 20 с. Каждые 0,1 с — где он, режим,
   скорость, кто вышел. Замер chase.js STATS (и в ?oldchase): рывки руля (поворот кузова меняется быстрее 3 рад/с²),
   развороты на месте (кузов крутится быстрее 0,8 рад/с медленнее 2,5 м/с, дольше 0,3 с), полные круги за 8 с.
   Стоянка: через сколько встал, на каком расстоянии, через сколько после твоей остановки вышел водитель / уехал.
   cshots — снимки полным размером: в погоне, он встал у тебя, вышел / уезжает. */
const Q = new URLSearchParams(location.search), SHOTS = Q.get('cshots') || '';
const V = d.V, IN = d.IN, CS = d.CHS.STATS;
const out = { old: !!d.CHS.CH.old, miss: [], chases: 0, ends: [], phases: [], stats: null, shots: [] };
let T = 0;
const stalled = () => !!(d.DLG && d.DLG.isOpen && d.DLG.isOpen()) || (d.S.paused && d.S.state !== 'over');
await onShift();
autopilot(true); await run(6, 2);
const TR = d.TRAFFIC;
let car = null;
function begin () {
  d.SBX.chase = 1; d.CHASE.next = 0;
  const L = TR.filter(t => !t.gone && !t.knock && !t.wreck && !t.driver && !t.parked && !t.svc && !t.bus && !t.mp && t.model !== 'moped' && !t.stalled)
    .map(t => [t, Math.hypot(t.x - V.x, t.z - V.z)]).filter(p => p[1] > 25 && p[1] < 70).sort((a, b) => a[1] - b[1]);
  for (const [t] of L) if (d.chaseStart(t)) { t.chase.T = 999; car = t; out.chases++; return true; }
  // рядом никого — ближнюю машину потока переносим на улицу в ~45 м за тобой (как будто ехала следом)
  const far = TR.filter(t => !t.gone && !t.knock && !t.wreck && !t.driver && !t.parked && !t.svc && !t.bus && !t.mp && t.model !== 'moped' && !t.stalled && !t.chase && t.mesh)
    .sort((a, b) => Math.hypot(a.x - V.x, a.z - V.z) - Math.hypot(b.x - V.x, b.z - V.z))[0];
  const r = far && d.nearestRoad(V.x - Math.sin(V.h) * 45, V.z - Math.cos(V.h) * 45, 8, 4);
  if (r && Math.hypot(r.x - V.x, r.z - V.z) > 20) {
    Object.assign(far, { x: r.x, z: r.z, h: V.h, speed: 6, e: null, turn: null, cb: null });
    if (d.chaseStart(far)) { far.chase.T = 999; car = far; out.chases++; out.moved = (out.moved || 0) + 1; return true; }
  }
  if (out.miss.length < 6) out.miss.push([d.S.state, L.length, +T.toFixed(0)]);
  return false;
}
for (const k in CS) { if (typeof CS[k] === 'number') CS[k] = 0; }
CS.stops.length = 0; CS.jerkAt.length = 0; CS.modes = {}; CS.lim = {}; CS.touchBy = {};
begin();
let ended = null;
const wrapEnd = () => { if (car && !car.chase && !ended) ended = { why: car.driver ? 'вышел' : car.stalled ? 'встал' : 'уехал', t: +T.toFixed(1) }; };
async function phase (name, secs, move) {
  const P = { name, secs, minD: 1e9, stopAt: null, stopD: null, exitAt: null, leaveAt: null, modes: {}, maxV: 0 };
  const halt = () => { IN.gas = 0; IN.joy = 0; IN.brake = V.vx * Math.sin(V.h) + V.vz * Math.cos(V.h) > 0.3 ? 1 : 0; };   // тормоз стоя — это задний ход
  autopilot(!!move); if (!move) halt();
  if (!car || !car.chase) { car = null; begin(); P.fresh = !!car; }   // погоня кончилась — новая (замер стоянки — с той, что есть)
  const n = Math.round(secs * 10);
  let shotPursuit = false, shotStop = false, shotExit = false, shotLeave = false;
  for (let i = 0; i < n; i++) {
    await wait(100); T += 0.1;
    if (stalled()) { autopilot(true); await until(() => !stalled(), 4000); autopilot(!!move); if (!move) halt(); }
    if (!move) halt();
    if (car && car.gone) { out.ends.push({ why: car.wreck ? 'сгорел' : 'исчез', t: +T.toFixed(1), phase: name }); car = null; }
    if (!car) { if (i % 10 === 0) begin(); continue; }
    const dd = Math.hypot(car.x - V.x, car.z - V.z), C = car.chase;
    P.minD = Math.min(P.minD, +dd.toFixed(1)); P.maxV = Math.max(P.maxV, +(car.speed || 0).toFixed(1));
    if (C) P.modes[C.mode] = (P.modes[C.mode] || 0) + 1;
    const ts = +(i / 10).toFixed(1);
    if (!move && C && C.mode === 'wait' && P.stopAt === null) { P.stopAt = ts; P.stopD = +dd.toFixed(1); P.wait = +C.waitT.toFixed(1); P.fight = C.fight; }
    if (!move && P.stopAt === null && !C && car.speed < 0.3 && dd < 20) { P.stopAt = ts; P.stopD = +dd.toFixed(1); }
    if (!move && car.driver && P.exitAt === null) P.exitAt = ts;
    if (!move && !C && !car.driver && !car.stalled && P.leaveAt === null && P.stopAt !== null) P.leaveAt = ts;
    if (SHOTS && move && !shotPursuit && C && C.mode === 'near' && dd < 25 && i > 20) { shotPursuit = true; out.shots.push(SHOTS + '/chase-' + name + '.png'); await shot(SHOTS + '/chase-' + name + '.png'); }
    if (SHOTS && !move && !shotStop && P.stopAt !== null && i / 10 > P.stopAt + 0.5) { shotStop = true; out.shots.push(SHOTS + '/stop-' + name + '.png'); await shot(SHOTS + '/stop-' + name + '.png'); }
    if (SHOTS && !move && !shotExit && P.exitAt !== null && i / 10 > P.exitAt + 1.2) { shotExit = true; out.shots.push(SHOTS + '/exit-' + name + '.png'); await shot(SHOTS + '/exit-' + name + '.png'); }
    if (SHOTS && !move && !shotLeave && P.leaveAt !== null && i / 10 > P.leaveAt + 1.5) { shotLeave = true; out.shots.push(SHOTS + '/leave-' + name + '.png'); await shot(SHOTS + '/leave-' + name + '.png'); }
    wrapEnd();
    if (ended) { out.ends.push({ ...ended, phase: name }); ended = null; if (!car.chase) car = null; }
  }
  IN.brake = 0;
  out.phases.push(P);
}
await phase('едет-1', 35, true);
await phase('стоит-1', 20, false);
if (!car || !car.chase) begin();
await phase('едет-2', 10, true);
await phase('стоит-2', 20, false);
autopilot(false);
out.stats = { ...CS, lim: Object.fromEntries(Object.entries(CS.lim).map(([k, v]) => [k, +v.toFixed(1)])), modes: Object.fromEntries(Object.entries(CS.modes).map(([k, v]) => [k, +v.toFixed(1)])), secs: +CS.secs.toFixed(1) };
return out;
