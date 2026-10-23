/* Чужие машины мнутся и бьются (12ар, 23.10.2026; foewreck.js, docs/CAREER.md «Чужие машины мнутся и бьются»). В npm run check не входит.
   Запуск: npm run probe -- --eval=tools/probe-checks/foewreck.js --max=0 --timeout=400 [--q=fwshots=/папка]
   Смена; курьер на 30 / 60 / 90 км/ч въезжает в машины потока («Семёрка» и коробочная — в корму и в угол у колеса),
   в стоящую у бордюра (в бок), в автобус (в морду и в борт). По каждой: подробная ли копия, вмятины, стёкла (целое 0 /
   трещины 1 / разбито 2), фары, что отлетело; у автобуса — качка (наибольший угол), вмятина, трещин, фар.
   Потом водители: выходит всегда (FW.OUT = 1), по разу каждый вариант — пинает, бьёт лобовое, прыгает на капоте:
   сколько ударов, что с твоим лобовым. fwshots — снимки полным размером. */
const Q = new URLSearchParams(location.search), SHOTS = Q.get('fwshots') || '';
const V = d.V, IN = d.IN, F = d.FW, FW = F.FW, RC = d.REALCAR, CG = d.CGM;
const out = { hits: [], bus: [], drivers: [], st: null, tst: null, slots: 0, links: [] };
/* новые программы шейдеров посреди езды (после прогрева): кто рисовался, когда собралась */
let PH = 'старт', curM = '';
{ const Rr = d.renderer, gl = Rr.getContext(), rbd = Rr.renderBufferDirect, lp = gl.linkProgram.bind(gl);
  Rr.renderBufferDirect = function (c, s2, g, m, o, gr) { curM = (o.name || o.type) + ' · ' + m.type + (m.transparent ? ' прозр' : '') + (m.map ? ' map' : '') + (m.vertexColors ? ' vc' : ''); return rbd.call(this, c, s2, g, m, o, gr); };
  gl.linkProgram = p => { if (PH !== 'старт') out.links.push(PH + ': ' + curM); lp(p); }; }
await onShift();
await until(() => RC.trafficReady(), 15000);
autopilot(true); await run(6, 2); autopilot(false); IN.gas = 0;
const stalled = () => !!(d.DLG && d.DLG.isOpen && d.DLG.isOpen()) || !!(d.CH && d.CH.opts && d.CH.opts.length) || (d.S.paused && d.S.state !== 'over');
async function tick (ms) {
  await wait(ms);
  if (!stalled()) return;
  autopilot(true); await until(() => !stalled(), 5000); autopilot(false); IN.gas = 0;
}
const TR = d.TRAFFIC;
const near = (f, r = 400) => TR.filter(t => !t.gone && !t.knock && !t.wreck && !t.driver && f(t) && Math.hypot(t.x - V.x, t.z - V.z) < r)
  .sort((p, q) => Math.hypot(p.x - V.x, p.z - V.z) - Math.hypot(q.x - V.x, q.z - V.z));
const flowOk = t => !t.parked && !t.svc && !t.bus && !t.mp && !t.rival && t.model !== 'moped' && t.model !== 'dump' && !t.chase;
const used = new Set();
const pickOne = f => { const L = near(t => !used.has(t) && f(t)); const t = L[0]; if (t) used.add(t); return t; };
/* въехать: from — откуда в осях цели ('rear' — сзади по ходу, 'side' — слева в бок, 'front', 'corner' — в угол у переднего колеса) */
async function ram (t, kmh, from) {
  const v = kmh / 3.6, fx = Math.sin(t.h), fz = Math.cos(t.h), rx = Math.cos(t.h), rz = -Math.sin(t.h);   // rx — влево по ходу (+x машины)
  const hl = t.bus ? t.bus.hl : (t.hl || 2.2), hw = t.bus ? t.bus.W2 : 1;
  let ax, az, dx, dz;
  if (from === 'rear') { ax = t.x - fx * (hl + 5); az = t.z - fz * (hl + 5); dx = fx; dz = fz; }
  else if (from === 'front') { ax = t.x + fx * (hl + 5); az = t.z + fz * (hl + 5); dx = -fx; dz = -fz; }
  else { const along = from === 'corner' ? hl * 0.62 : 0; ax = t.x + rx * (hw + 5) + fx * along; az = t.z + rz * (hw + 5) + fz * along; dx = -rx; dz = -rz; }
  if (!t.parked && !t.bus) { t.speed = 0; t.stopT = 3; }   // пусть постоит (поток): иначе мимо
  await tick(0);
  V.x = ax; V.z = az; V.h = Math.atan2(dx, dz); V.y = d.surfaceAt(V.x, V.z); V.air = 0;
  V.vx = dx * v; V.vz = dz * v; V.camX = V.x - dx * 11; V.camZ = V.z - dz * 11; V.camH = V.h; V.camY = V.y + 6;
  if (d.car) { d.car.position.set(V.x, V.y, V.z); d.car.rotation.y = V.h; }
  const hp0 = d.S.hp; d.S.hp = Math.max(hp0, d.S.hpMax || 6);
  const s0 = JSON.stringify(F.ST), m0 = t.mesh;
  let hit = false;
  for (let i = 0; i < 40 && !hit; i++) {
    IN.gas = 1; V.vx = dx * v; V.vz = dz * v;          // держим скорость до удара
    await wait(16);
    hit = t.hitT > 0 || t.knock || (t.bus && t.hitT > 0);
  }
  IN.gas = 0; V.vx = V.vz = 0;
  d.S.hp = hp0;
  await wait(400);
  return { hit, s0, m0 };
}
const fw = () => JSON.parse(JSON.stringify(F.ST));
function carState (t) {
  const u = t.mesh.userData, R = u.real, r = F.rec(t);
  const o = { kind: u.realLite ? 'семёрка' : (t.parked ? 'стоящая ' : 'коробочная ') + t.model, det: !!(r && r.det), hits: r ? r.hits.length : 0, seat: !!(r && r.seat) };
  if (R) {
    o.glass = R.detail ? Object.entries(R.panes).map(([k, p]) => k + p.st).join(' ') : (R.glass[0] && !R.glass[0].visible ? 'все 2' : R.glass[0] && R.glass[0].material.map ? 'все 1' : 'все 0');
    o.lamps = 'fl' + R.lamp.dead.x + ' fr' + R.lamp.dead.y + ' rl' + R.lamp.dead.z + ' rr' + R.lamp.dead.w;
    o.wheelsLost = R.detail ? Object.values(R.wheelG).filter(w => w.userData.lost).length : 0;
    o.bumpers = R.detail ? Object.keys(R.cut).filter(k => R.cut[k]).join('') : '';
  } else {
    o.glass = u.cg ? CG.state(u.cg) : '—';
    o.lamps = CG.lampState(t.mesh);
    o.dents = u.dents || 0; o.lost = Object.keys(u.lost || {}).join(' ');
    o.wheels = (u.wheels || []).length;
  }
  return o;
}
const camAt = (t, side = 1, back = 7) => {   // курьер в стороне — камера смотрит на машину
  const rx = Math.cos(t.h), rz = -Math.sin(t.h);
  V.x = t.x + rx * side * back; V.z = t.z + rz * side * back; V.h = Math.atan2(t.x - V.x, t.z - V.z); V.vx = V.vz = 0;
  V.y = d.surfaceAt(V.x, V.z); V.camX = V.x - Math.sin(V.h) * 9; V.camZ = V.z - Math.cos(V.h) * 9; V.camH = V.h; V.camY = V.y + 4;
  if (d.car) { d.car.position.set(V.x, V.y, V.z); d.car.rotation.y = V.h; }
};
const PLAN = [
  ['семёрка', t => flowOk(t) && t.mesh.userData.realLite, [[30, 'rear'], [60, 'rear'], [90, 'corner'], [90, 'rear']]],
  ['коробочная', t => flowOk(t) && t.mesh.userData.lite && !t.mesh.userData.realLite, [[30, 'rear'], [60, 'rear'], [90, 'corner']]],
  ['стоящая', t => t.parked && t.model !== 'moped' && !t.lux, [[60, 'side'], [90, 'corner']]],
];
const ONLY = Q.get('fwonly') || '';
if (ONLY === 'drivers') PLAN.length = 0;
FW.OUT = 0;                                            // сначала — без водителей (смотрим машины)
PH = 'удары';
for (const [tag, f, list] of PLAN) {
  for (const [kmh, from] of list) {
    const t = pickOne(f);
    if (!t) { out.hits.push({ tag, kmh, none: 1 }); continue; }
    PH = tag + ' ' + kmh + ' ' + from;
    const { hit, s0 } = await ram(t, kmh, from);
    const a = JSON.parse(s0), b = fw(), dd = {};
    for (const k in b) if (typeof b[k] === 'number' && b[k] !== a[k]) dd[k] = +(b[k] - a[k]).toFixed(3);
    out.hits.push({ tag, kmh, from, hit, ...carState(t), fw: dd });
    if (SHOTS && (kmh === 90)) { await until(() => !t.knock, 4000); camAt(t, 1, 6); await wait(500); await shot(SHOTS + '/fw-' + tag + '-' + kmh + '.png'); }
  }
}
out.slots = F.DETS.length;
/* автобус: в морду 30, в борт 60 */
const bus = ONLY === 'drivers' ? null : pickOne(t => !!t.bus && !t.bus.sleep);
if (bus) {
  for (const [kmh, from] of [[30, 'front'], [60, 'side'], [90, 'side']]) {
    PH = 'автобус ' + kmh + ' ' + from;
    const s0 = fw(), { hit } = await ram(bus, kmh, from);
    const r = F.big(bus), b = fw();
    out.bus.push({ kmh, from, hit, swayMax: +(b.swayMax).toFixed(3), dent: b.bigDent - s0.bigDent, cracks: r ? r.ncr : 0, lamps: b.bigLamp - s0.bigLamp, ownGeo: r ? r.ownBody : false });
  }
  if (SHOTS) { camAt(bus, 1, 9); await wait(500); await shot(SHOTS + '/fw-bus.png'); }
} else out.bus.push({ none: 1 });
/* самосвал (если есть рядом со стройкой): в борт у кабины 60 */
const dump = ONLY === 'drivers' ? null : pickOne(t => t.model === 'dump');
if (dump) {
  PH = 'самосвал';
  const s0 = fw(), { hit } = await ram(dump, 60, 'corner');
  const r = F.big(dump), b = fw();
  out.dump = { hit, knock: dump.knock, swayMax: +(b.swayMax).toFixed(3), dent: b.bigDent - s0.bigDent, cracks: r ? r.ncr : 0, lamps: b.bigLamp - s0.bigLamp };
  if (SHOTS) { camAt(dump, 1, 9); await wait(500); await shot(SHOTS + '/fw-dump.png'); }
} else out.dump = { none: 1 };

/* водители: выходит всегда, каждый вариант по разу; курьер стоит */
FW.OUT = 1;
for (const want of ['kick', 'glass', 'hood']) {
  for (const k of ['kick', 'glass', 'hood']) FW.VAR[k] = k === want ? 1 : 0;
  const t = pickOne(t => flowOk(t) && !t.noDriver);
  if (!t) { out.drivers.push({ want, none: 1 }); continue; }
  const g0 = () => d.car.userData.cg ? CG.state(d.car.userData.cg) : '';
  const st0 = fw();
  PH = 'водитель ' + want;
  const rr = await ram(t, 40, 'rear');
  const after = { hit: rr.hit, angry: t.angry, knock: t.knock, d: Math.round(Math.hypot(t.x - V.x, t.z - V.z)) };
  await until(() => !!t.driver || !!t.chase, 12000);
  d.resetCar && d.resetCar();                           // удар самого тарана — не в счёт: стекло целое до его ударов
  const dr = t.driver;
  if (!dr) { out.drivers.push({ want, after, out: 0, knock: t.knock, angry: t.angry, chase: !!t.chase, stalled: t.stalled, noDriver: t.noDriver, hitT: +t.hitT.toFixed(2), d: Math.round(Math.hypot(t.x - V.x, t.z - V.z)) }); continue; }
  // стоим и ждём, что он сделает
  const t0 = Date.now(), states = new Set(), gBefore = g0();
  while (Date.now() - t0 < 9000) { await tick(100); V.vx = V.vz = 0; IN.gas = 0; states.add(dr.state); }
  if (SHOTS) { const cx = d.car; V.camX = V.x + Math.cos(V.h) * 4 - Math.sin(V.h) * 4; V.camZ = V.z - Math.sin(V.h) * 4 - Math.cos(V.h) * 4; await shot(SHOTS + '/fw-driver-' + want + '.png'); }
  const b = fw();
  out.drivers.push({ want, fw: dr.fw, states: [...states].join(','), strikes: dr.strikes, kicks: b.kicks - st0.kicks, glassHits: b.glassHits - st0.glassHits,
    ownCrack: b.ownCrack - st0.ownCrack, ownBreak: b.ownBreak - st0.ownBreak, jumps: b.jumps - st0.jumps, falls: b.falls - st0.falls,
    glass: gBefore + ' → ' + g0(), person: !!(F.rec(t) && F.rec(t).person), sameAsSeat: dr.grp.userData.person === (F.rec(t) && F.rec(t).person) });
  // уехать от него, чтобы следующий не мешал
  dr.give = 0;
}
out.st = F.ST; out.tst = RC.TST; out.buildMs = +F.ST.buildMax.toFixed(1); out.slotsEnd = F.DETS.length;
return out;
