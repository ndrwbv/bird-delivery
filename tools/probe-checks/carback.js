/* После удара машина не телепортируется (0п32, 24.10.2026; carback.js, docs/CAREER.md «Чужие машины мнутся и бьются» → «После
   удара»). В npm run check не входит. Запуск: npm run probe -- --eval=tools/probe-checks/carback.js --max=0 --timeout=300
   [--q=cbshots=/папка] [--q=oldback — как было].
   Смена; курьер на 40 / 70 / 100 км/ч въезжает в корму и в бок стоящей машины потока и сразу уходит в сторону (не толкает).
   Водитель не выходит (FW.OUT = 0). Дальше ~16 с каждый кадр — где машина: скачок — сдвиг за кадр больше (скорость × кадр) · 1,25 + 3 см, где скорость —
   большая из прошлой и нынешней (в полёте — скорость полёта, своим ходом — его, в полосе — скорость потока + 1 м/с).
   Скачки считаем до 2 с после того, как машина встала в полосу; дальше — обычный поток (flowJumps, отдельно).
   Что с машиной в конце: стоит (водитель вышел, разбита), едет своим ходом к полосе или уже в полосе. */
const Q = new URLSearchParams(location.search), SHOTS = Q.get('cbshots') || '';
const V = d.V, IN = d.IN, TR = d.TRAFFIC, CB = d.CBK;
const out = { on: CB ? CB.CB.on : null, runs: [], st: null };
await onShift();
autopilot(true); await run(6, 2); autopilot(false); IN.gas = 0;
const frame = () => new Promise(r => requestAnimationFrame(r));
/* окно разговора, выбор, пауза — автопилот их закрывает (как в foewreck.js) */
const paused = () => !!(d.DLG && d.DLG.isOpen && d.DLG.isOpen()) || !!(d.CH && d.CH.opts && d.CH.opts.length) || (d.S.paused && d.S.state !== 'over');
async function unstall () { if (!paused()) return; autopilot(true); await until(() => !paused(), 5000); autopilot(false); IN.gas = 0; }
const flowOk = t => !t.gone && !t.knock && !t.wreck && !t.driver && !t.parked && !t.svc && !t.bus && !t.mp && !t.rival && t.model !== 'moped' && t.model !== 'dump' && !t.chase && t.e && !t.turn && !t.cb;
const used = new Set();
const st0 = CB ? { ...CB.ST } : {};
const FWC = d.FW && d.FW.FW, OUT0 = FWC ? FWC.OUT : 0;
if (FWC) FWC.OUT = 0;                               // водитель не выходит (иначе стоит 12—28 с, пока он у твоей машины) — сразу на полосу
const ONLY = Q.get('cbonly');
for (const [kmh, from] of [[40, 'корма'], [70, 'корма'], [100, 'корма'], [40, 'бок'], [70, 'бок'], [100, 'бок']].filter(([k]) => !ONLY || String(k) === ONLY)) {
  // рядом (12 м) ни одной машины — чтобы въехать именно в неё
  const t = TR.filter(t => flowOk(t) && !used.has(t) && !TR.some(o => o !== t && !o.gone && Math.hypot(o.x - t.x, o.z - t.z) < 12))
    .sort((a, b) => Math.hypot(a.x - V.x, a.z - V.z) - Math.hypot(b.x - V.x, b.z - V.z))[0];
  if (!t) break;
  used.add(t);
  await unstall();
  t.speed = 0; t.stopT = 5;
  await wait(50);
  const hl = t.hl || 2.2, v = kmh / 3.6;
  // откуда въезжаем: в корму — по ходу машины, в бок — слева поперёк (её развернёт поперёк улицы)
  const fx = from === 'бок' ? -Math.cos(t.h) : Math.sin(t.h), fz = from === 'бок' ? Math.sin(t.h) : Math.cos(t.h), back = from === 'бок' ? 6 : hl + 5;
  V.x = t.x - fx * back; V.z = t.z - fz * back; V.h = Math.atan2(fx, fz); V.y = d.surfaceAt(V.x, V.z); V.air = 0;
  V.vx = fx * v; V.vz = fz * v; V.camX = V.x - fx * 11; V.camZ = V.z - fz * 11; V.camH = V.h; V.camY = V.y + 6;
  const hp0 = d.S.hp;
  let hit = false;
  for (let i = 0; i < 60 && !hit; i++) { t.speed = 0; IN.gas = 1; V.vx = fx * v; V.vz = fz * v; d.S.hp = Math.max(d.S.hp, 6); await frame(); hit = !!(t.knock || t.hitT > 0); }
  IN.gas = 0; V.vx = V.vz = 0;
  await frame();
  V.x -= fz * 7; V.z += fx * 7;                     // курьера — в сторону: машину не толкает, смотрит сбоку
  V.camX = V.x + fz * 6; V.camZ = V.z - fx * 6; V.camH = Math.atan2(t.x - V.x, t.z - V.z);
  const R = { kmh, from, hit, frames: 0, jumps: 0, maxStep: 0, maxV: 0, phases: {}, sample: [], end: null };
  const spd = t => t.knock ? Math.hypot(t.kvx, t.kvz) : t.cb ? Math.abs(t.speed || 0) : t.rejoin > 0 || !(t.stalled || t.driver || t.wreck) ? Math.abs(t.speed || 0) + 1 : Math.abs(t.speed || 0);
  const ph = t => t.knock ? 'летит' : t.cb ? (t.cb.gave || !t.cb.e ? 'стоит (некуда)' : t.cb.dir < 0 ? 'назад' : 'своим ходом') : t.wreck ? 'разбита' : t.stalled || t.driver ? 'водитель вышел' : t.rejoin > 0 ? 'в полосу' : 'едет';
  let px = t.x, pz = t.z, pv = spd(t), pT = performance.now();
  const T0 = performance.now();
  let shotN = 0;
  while (performance.now() - T0 < 16000) {
    const ts = await frame();
    if (paused()) { R.paused = (R.paused || 0) + 1; await unstall(); pT = await frame(); px = t.x; pz = t.z; pv = spd(t); continue; }
    d.S.hp = Math.max(d.S.hp, 6);
    if (t.gone) { R.end = 'убрана'; break; }
    const step = Math.hypot(t.x - px, t.z - pz);
    if (step === 0 && ts - pT < 250) continue;     // вдали поток считается раз в несколько кадров (gfx.js lag) — время копится
    const dt = Math.min(0.25, (ts - pT) / 1000); pT = ts;
    const sv = spd(t), lim = Math.max(sv, pv) * dt * 1.25 + 0.03;
    const p = ph(t);
    R.phases[p] = (R.phases[p] || 0) + 1;
    if (ONLY && t.cb && R.frames % 45 === 0) (R.trace = R.trace || []).push([R.frames, t.cb.dir, +(t.cb.sp || 0).toFixed(1), +(t.cb.lat || 0).toFixed(2), +(t.cb.dh || 0).toFixed(2), +(t.cb.ang || 0).toFixed(2), +(t.cb.s || 0).toFixed(1) + '/' + (+(t.cb.run || 0)).toFixed(0)]);
    if (p === 'своим ходом' || p === 'назад') R.backS = +(((R.backS || 0) + dt)).toFixed(2);
    if (p === 'едет' && R.phases['своим ходом'] && !R.backAt) R.backAt = ts;
    const flow = R.backAt && ts - R.backAt > 2000;   // через 2 с обычной езды — уже поток (его рывки — flowlane.js, не удар): считаем отдельно
    if (step > lim && R.frames > 0 && flow) { R.flowJumps = (R.flowJumps || 0) + 1; if (!R.flowAt) R.flowAt = [R.frames, +step.toFixed(2), +lim.toFixed(2)]; }
    else if (step > lim && R.frames > 0) { R.jumps++; if (R.sample.filter(q => q[1] === p).length < 3) R.sample.push([R.frames, p, +step.toFixed(2), +lim.toFixed(2), +(t.speed || 0).toFixed(1), t.turn ? 'дуга' + (t.turn.ut ? '-разв' : '') : 's' + (t.s || 0).toFixed(1) + '/' + (t.e ? (t.e.len - t.e.tA - t.e.tB).toFixed(1) : '-'), 'nar' + (+(t.nar || 0)).toFixed(2), 'gh' + (+(t.ghost || 0)).toFixed(1), t.fo ? 'o' + Math.hypot(t.fo.ox, t.fo.oz).toFixed(2) : '']); }
    if (step > R.maxStep) R.maxAt = [R.frames, p, +(dt * 1000).toFixed(0)];
    R.maxStep = Math.max(R.maxStep, step); R.maxV = Math.max(R.maxV, step / Math.max(dt, 1e-3));
    px = t.x; pz = t.z; pv = sv; R.frames++;
    if (SHOTS && (R.frames === 40 || R.frames === 300 || R.frames === 600) && shotN < 3) { shotN++; await shot(SHOTS + '/cb-' + kmh + (from === 'бок' ? 'b' : 'k') + '-' + R.frames + '.png'); pT = await frame(); px = t.x; pz = t.z; pv = spd(t); }
  }
  R.maxStep = +R.maxStep.toFixed(2); R.maxV = +(R.maxV * 3.6).toFixed(0);
  if (!R.end) R.end = ph(t);
  d.S.hp = hp0;
  out.runs.push(R);
}
if (FWC) FWC.OUT = OUT0;
out.st = CB ? Object.fromEntries(Object.keys(CB.ST).map(k => [k, +(CB.ST[k] - (st0[k] || 0)).toFixed(1)])) : null;
out.ok = out.runs.length === (ONLY ? 2 : 6) && out.runs.every(r => r.hit && !r.jumps);
return out;
