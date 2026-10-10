/* Частицы эффектов (fxpool.js, 11.10.2026): вызовы отрисовки, JS кадра и частицы по этапам. В npm run check не входит.
   Запуск: npm run probe -- --eval=tools/probe-checks/fxparts.js --cpu=3 --size=deck --max=0 --timeout=300
   --q=fxsecs=20 — секунд на этап (15); --q=fxonly=nitro,hookah — только эти; --q=oldfx — по-старому (меш и материал
   на частицу), сравнить одной сборкой. Этапы: езда (автопилот), нитро (автопилот, нитро зажато, бак полный), кальян
   (см. ниже), взрывы (boom раз в секунду перед машиной), бист (бист-мод с нитро).
   (кальян: машина у ближайшей компании, затяжка каждые 50 мс — ~100 клубов в секунду).
   Ответ по этапу: calls — вызовов отрисовки в кадре (среднее / p95), js — JS кадра (p50 / p95 / доля > 16,7 мс),
   fx — частиц на сцене (запас + свои меши FX; среднее, пик), spawned — родилось в запасе, old — меш+материал старым путём. */
const Q = new URLSearchParams(location.search), SECS = +(Q.get('fxsecs') || 15);
const ONLY = (Q.get('fxonly') || '').split(',').filter(Boolean);
const R = d.renderer, r0 = R.render;
await onShift(); autopilot(true); await wait(3000);
const out = { oldfx: Q.has('oldfx') };
let calls = [], js = [], fxn = [];
let acc = 0, lastT = -1;
R.render = function (s, c) { r0.call(R, s, c); if (s === d.scene) calls.push(R.info.render.calls); };
const raf = window.requestAnimationFrame;
window.requestAnimationFrame = cb => raf(t => { if (t !== lastT) { if (lastT >= 0) js.push(acc); acc = 0; lastT = t; fxn.push(d.FXP ? d.FXP.S.alive + d.FXP.FX.length : 0); } const s = performance.now(); cb(t); acc += performance.now() - s; });
const st = a => { const s = a.slice().sort((x, y) => x - y), n = s.length || 1, q = p => +(s[Math.min(n - 1, Math.floor(p * n))] || 0).toFixed(1);
  return { p50: q(0.5), p95: q(0.95), avg: +(a.reduce((x, y) => x + y, 0) / n).toFixed(1), 'o16,7%': +(100 * a.filter(v => v > 16.7).length / n).toFixed(1) }; };
async function phase (name, setup, tick, done) {
  if (ONLY.length && !ONLY.includes(name)) return;
  if (setup) await setup();
  calls = []; js = []; fxn = [];
  const S = () => (d.FXP ? d.FXP.S : { spawned: 0, old: 0 }), s0 = { ...S() }, t0 = performance.now();
  while (performance.now() - t0 < SECS * 1000) { if (tick) tick(); await wait(50); }
  if (done) await done();
  const c = st(calls), j = st(js), f = st(fxn);
  out[name] = { calls: [c.avg, c.p95], js: [j.p50, j.p95, j['o16,7%']], fx: [f.avg, Math.max(0, ...fxn)], spawned: S().spawned - s0.spawned, old: S().old - s0.old, frames: js.length };
}
await phase('drive', null, null);
await phase('nitro', null, () => { d.IN.nitro = 1; d.NOS.tank = 1e9; }, () => { d.IN.nitro = 0; });
await phase('beast', () => { d.FXS.beastT = 1e9; }, () => { d.IN.nitro = 1; d.FXS.beastT = 1e9; }, () => { d.IN.nitro = 0; d.FXS.beastT = 0; });
await phase('boom', () => { autopilot(false); }, () => {
  const V = d.V, fx = Math.sin(V.h), fz = Math.cos(V.h);
  if (!phase.t || performance.now() - phase.t > 1000) { phase.t = performance.now(); d.boom(V.x + fx * 14, V.z + fz * 14, 0.1); }
}, null);
await phase('hookah', async () => {
  autopilot(false);
  const s = d.HOOKAH.nearest();
  if (!s) return;
  tp(s.b.x, s.b.z);
  await until(() => s.live, 8000);
  d.V.h = Math.atan2(s.b.x - d.V.x, s.b.z - d.V.z);              // машина носом к компании, в 8 м — компания в кадре
  { const fx = Math.sin(d.V.h), fz = Math.cos(d.V.h); d.V.x = s.b.x - fx * 8; d.V.z = s.b.z - fz * 8; }
  phase.s = s;
}, () => { const s = phase.s; d.V.vx = d.V.vz = 0; if (s && s.live) s.puffT = 0; }, null);   // затяжка каждые 50 мс — ~100 клубов в секунду
R.render = r0; window.requestAnimationFrame = raf;
out.S = d.FXP ? d.FXP.S : null;   // сборка до fxpool.js — без счётчиков частиц out.crash = d.crashlog.count();
return out;
