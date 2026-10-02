/* Код страницы для probe и perf --play: помощники скрипта (PRELUDE) и
   время кадров, ускорение, автопилот (INSTALL). Общий файл, чтобы perf.cjs
   ездил тем же автопилотом, что probe. */
/* что есть у скрипта в странице: ставится до него одной строкой */
const PRELUDE = `
const d = window.__dlv, wait = ms => new Promise(r => setTimeout(r, ms));
const P = window.__probe;
const log = (...a) => { P.logs.push(a.length === 1 ? a[0] : a); };
const until = async (fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn(d)) return true; } catch (e) {} await wait(50); } return false; };
const run = async (secs, k = 1) => { const n0 = P.n; window.__warp = Math.max(0.1, Math.min(3, k)); await wait(secs * 1000); window.__warp = 1; return P.n - n0; };
const frames = (from = 0) => P.stats(from);
const tp = (x, z, h) => { const r = d.nearestRoad(x, z, 5, 4), V = d.V;
  if (r) { V.x = r.x; V.z = r.z; V.h = h !== undefined ? h : Math.atan2(r.seg.x2 - r.seg.x1, r.seg.z2 - r.seg.z1); } else { V.x = x; V.z = z; if (h !== undefined) V.h = h; }
  V.vx = V.vz = 0; V.y = d.surfaceAt(V.x, V.z); V.camX = V.x - Math.sin(V.h) * 11; V.camZ = V.z - Math.cos(V.h) * 11; V.camH = V.h; V.camY = V.y + 6; V.hero = 0;
  if (d.car) { d.car.position.set(V.x, V.y, V.z); d.car.rotation.y = V.h; } return { x: +V.x.toFixed(1), z: +V.z.toFixed(1) }; };
const onShift = async () => {
  const cm = d.CAREERM, on = cm && cm.shiftOn ? cm.shiftOn() : !d.S.ride && ['drive', 'back', 'handover', 'brief', 'loading', 'side'].includes(d.S.state);
  if (!on || d.S.ride) { d.startRun(false); await wait(300); }
  if (d.S.state === 'brief') { d.acceptOrder(); await until(x => x.S.state === 'drive', 4000); }
  return d.S.state; };
const ride = async () => { if (!d.S.ride || !['drive'].includes(d.S.state)) { d.startRun(true); await wait(200); } return d.S.state; };
const autopilot = (on = true) => P.autopilot(on);
/* smoke(secs): смена на автопилоте и проверка, что игра жива. → { ok, fail: [что не так], m, frames, clock, ft }
   жива — машина проехала ≥ 150 м, кадры идут, часы смены идут, числа конечные, в конце — смена и руль в руках */
const smoke = async (secs = 30, minM = 150) => {
  await onShift(); autopilot(true);
  const fail = [], V = d.V, fin = v => typeof v === 'number' && Number.isFinite(v);
  let m = 0, px = V.x, pz = V.z, bad = null, stuckMenu = 0;
  const n0 = P.n, f0 = P.ft.length, c0 = d.S.shiftT || 0, e0 = d.ENV ? d.ENV.t : 0, t0 = Date.now();
  while (Date.now() - t0 < secs * 1000) {
    await wait(250);
    const step = Math.hypot(V.x - px, V.z - pz);
    if (step < 60) m += step;                       // телепорт (оживление, новая смена) — не езда
    px = V.x; pz = V.z;
    const nums = { x: V.x, z: V.z, y: V.y, money: d.S.money, hp: d.S.hp, hpMax: d.S.hpMax, wallet: d.wallet ? d.wallet() : 0 };
    for (const k in nums) if (!fin(nums[k]) && !bad) bad = k + '=' + nums[k];
  }
  autopilot(false);
  const frames = P.n - n0, clock = +((d.S.shiftT || 0) - c0).toFixed(1), env = d.ENV ? +(d.ENV.t - e0).toFixed(4) : null;
  const playing = ['drive', 'back', 'handover', 'side', 'loading', 'brief'].includes(d.S.state);
  if (m < minM) fail.push('проехала ' + Math.round(m) + ' м < ' + minM + ' (застряла?)');
  if (frames < secs * 20) fail.push('кадров ' + frames + ' за ' + secs + ' с (зависла?)');
  if (!(clock > secs * 0.5)) fail.push('часы смены прошли ' + clock + ' с из ' + secs);
  if (bad) fail.push('не число: ' + bad);
  if (!playing || d.S.ride) fail.push('в конце не смена: state=' + d.S.state + (d.S.ride ? ', ride' : ''));
  if (d.S.paused) fail.push('пауза');
  if (d.DLG && d.DLG.isOpen && d.DLG.isOpen()) fail.push('открыт диалог');
  // журнал ошибок (src/platform/crashlog.js): предохранитель глотает исключения кадра — их видно только тут
  const crash = d.crashlog ? d.crashlog.entries().map(e => ({ kind: e.kind, where: e.where, n: e.n, msg: e.msg, at: (e.stack || '').split('\\n')[1] || '', phase: e.snap && e.snap.phase, state: e.snap && e.snap.state })) : null;
  if (crash && crash.length) fail.push('журнал ошибок: ' + crash.length + ' записей');
  return { ok: !fail.length, fail, m: Math.round(m), frames, clock, env, state: d.S.state, delivered: d.S.delivered || 0, ft: P.stats(f0), crash };
};
`;

/* ставится в страницу один раз после загрузки: время кадров, ускорение, автопилот */
const INSTALL = `(() => { if (window.__probe) return; const P = window.__probe = { logs: [], ft: [], n: 0 };
  const raf0 = window.requestAnimationFrame.bind(window); let lastR = null, vt = 0, lastP = -1;
  window.__warp = 1;
  // время кадра — по часам в начале первого колбэка кадра (отметки rAF вне экрана идут ровно по 16,7 мс)
  const map = t => { if (t !== lastR) { const now = performance.now(); if (lastP >= 0) { P.ft.push(now - lastP); if (P.ft.length > 20000) P.ft.splice(0, 10000); } lastP = now; P.n++;
      vt = lastR === null ? t : vt + (t - lastR) * window.__warp; lastR = t; } return vt; };
  window.requestAnimationFrame = cb => raf0(t => cb(map(t)));
  P.stats = (from = 0) => { const s = P.ft.slice(from).sort((a, b) => a - b), q = p => s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1) : 0;
    return { n: s.length, p50: q(0.5), p95: q(0.95), max: s.length ? +s[s.length - 1].toFixed(1) : 0 }; };
  /* автопилот (как в tools/capture.cjs): руль к точке маршрута в 12 м впереди, тормоз перед машинами;
     следующий заказ принимает сам, от поручений отказывается */
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  P.ap = { on: false, vmax: 14 };
  P.autopilot = on => { P.ap.on = !!on; if (!on) { const IN = window.__dlv.IN; IN.joy = 0; IN.gas = 0; IN.brake = 0; } return P.ap.on; };
  const step = () => { raf0(step);
    const D = window.__dlv, A = P.ap; if (!A.on || !D) return; const IN = D.IN, V = D.V, S = D.S;
    try {
      if (S.state === 'brief') { D.acceptOrder(); return; }
      if (D.CH && D.CH.opts && D.CH.opts.length && D.pickChoice) { D.pickChoice(1); return; }
      if (!['drive', 'back', 'side'].includes(S.state)) { IN.joy = 0; IN.gas = 0; return; }
      const R = D.route; if (!R || R.length < 2) { IN.joy = 0; IN.gas = 0; return; }
      let tx = R[R.length - 1][0], tz = R[R.length - 1][1], acc = 0;
      for (let i = 1; i < R.length; i++) { const l = Math.hypot(R[i][0] - R[i - 1][0], R[i][1] - R[i - 1][1]);
        if (acc + l >= 12) { const k = (12 - acc) / (l || 1); tx = R[i - 1][0] + (R[i][0] - R[i - 1][0]) * k; tz = R[i - 1][1] + (R[i][1] - R[i - 1][1]) * k; break; } acc += l; }
      /* не застревать (иначе дымовой прогон «проехала 90 м»): упёрлась в стену — газ есть, а едет
         медленнее 0,6 м/с 1,5 с — назад 1,2 с с рулём в другую сторону; 2,5 с стоит за машиной,
         что не едет (светофор, пробка), — 3 с объезжает по левой полосе, как живой игрок */
      const now = performance.now(), dts = A.t ? Math.min(0.1, (now - A.t) / 1000) : 0; A.t = now;
      if (A.rev > 0) { A.rev -= dts; IN.joy = 1; IN.jx = A.rjx; IN.gas = 0; IN.brake = 1; return; }
      if (A.pass > 0) A.pass -= dts;
      const dx = tx - V.x, dz = tz - V.z, dl = Math.hypot(dx, dz) || 1;
      const lane = S.target && Math.hypot(S.target.x - V.x, S.target.z - V.z) < 25 ? 0 : A.pass > 0 ? -2.6 : 2.6;
      tx += dz / dl * -lane; tz += -dx / dl * -lane;
      const diff = wrap(Math.atan2(tx - V.x, tz - V.z) - V.h), sv = Math.max(-1, Math.min(1, diff * 2));
      IN.joy = 1; IN.jx = -sv / 1.35;
      const sp = Math.hypot(V.vx, V.vz), left = S.target ? Math.hypot(S.target.x - V.x, S.target.z - V.z) : 99;
      const fx = Math.sin(V.h), fz = Math.cos(V.h); let block = false;
      for (const t of D.TRAFFIC) { const ax = t.x - V.x, az = t.z - V.z, f = ax * fx + az * fz; if (f > 2 && f < 16 && Math.abs(ax * fz - az * fx) < 2.2) { block = true; break; } }
      A.wait = block && sp < 1 ? (A.wait || 0) + dts : 0;
      if (A.wait > 2.5) { A.wait = 0; A.pass = 3; }
      if (A.pass > 0) block = false;
      const want = block ? 0 : left < 14 ? 3.5 : Math.abs(diff) > 0.45 ? 7 : A.vmax;
      IN.gas = sp < want ? 1 : 0; IN.brake = sp > want + 2 ? 1 : 0;
      A.stk = IN.gas && sp < 0.6 ? (A.stk || 0) + dts : 0;
      if (A.stk > 1.5) { A.stk = 0; A.rev = 1.2; A.rjx = IN.jx > 0 ? -0.8 : 0.8; }
    } catch (e) { console.error('[probe autopilot]', e && e.message); A.on = false; }
  };
  raf0(step);
})()`;

module.exports = { PRELUDE, INSTALL };
