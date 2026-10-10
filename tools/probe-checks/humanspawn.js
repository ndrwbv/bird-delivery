/* Люди на ходу (10.10.2026): смена на автопилоте N секунд — долгие кадры и сборка людей. В npm run check не входит.
   Запуск: npm run probe -- --eval=tools/probe-checks/humanspawn.js --cpu=3 --size=deck --max=0 --timeout=480
   --q=hsecs=300 — сколько секунд мерить (300 по умолчанию); кончилась смена — новая. --q=nopool — без запаса людей (как раньше).
   --runprofile=f.cpuprofile, потом node tools/profsum.cjs f.cpuprofile --spikes --spike=33 — что делали долгие кадры.
   Ответ: JS кадра (p50/p95/p99/max, сколько кадров > 33, > 50, > 90 мс), десять худших кадров (мс, секунда замера,
   сколько людей собрано в этом кадре и мс на них), запас людей (__dlv.HPOOL: собрано на ходу / взято из запаса,
   мс по тем, кто рождает). */
const Q = new URLSearchParams(location.search), SECS = +(Q.get('hsecs') || 300);
await onShift(); autopilot(true); await wait(4000);
const H = d.HPOOL || null, st0 = H ? H.snap() : null;
const raf = window.requestAnimationFrame, js = [], hum = [];
let acc = 0, lastT = -1, odd = 0, hm0 = H ? H.S.buildMs : 0, hn0 = H ? H.S.built : 0;
const A = function __frameA (cb, t) { cb(t); }, B = function __frameB (cb, t) { cb(t); };
const t0 = performance.now();
window.requestAnimationFrame = cb => raf(t => {
  if (t !== lastT) {
    if (lastT >= 0) { js.push(acc); const bm = H ? H.S.buildMs : 0, bn = H ? H.S.built : 0; hum.push([performance.now() - t0, bn - hn0, bm - hm0]); hm0 = bm; hn0 = bn; }
    acc = 0; lastT = t; odd ^= 1;
  }
  const s = performance.now(); (odd ? A : B)(cb, t); acc += performance.now() - s;
});
let shifts = 1;
while (performance.now() - t0 < SECS * 1000) {
  await wait(2000);
  const on = d.CAREERM && d.CAREERM.shiftOn ? d.CAREERM.shiftOn() : ['drive', 'back', 'handover', 'brief', 'loading', 'side'].includes(d.S.state);
  if (!on) { autopilot(false); await wait(500); await onShift(); autopilot(true); shifts++; }
}
window.requestAnimationFrame = raf; autopilot(false);
const n = js.length, s = js.slice().sort((x, y) => x - y), q = p => +s[Math.min(n - 1, Math.floor(p * n))].toFixed(1);
const idx = js.map((v, i) => i).sort((a, b) => js[b] - js[a]).slice(0, 10);
const r = {
  secs: +((performance.now() - t0) / 1000).toFixed(0), shifts, frames: n,
  js: { p50: q(0.5), p95: q(0.95), p99: q(0.99), max: +s[n - 1].toFixed(1), o33: js.filter(v => v > 33).length, o50: js.filter(v => v > 50).length, o90: js.filter(v => v > 90).length },
  worst: idx.map(i => [+js[i].toFixed(1), +(hum[i][0] / 1000).toFixed(0), hum[i][1], +hum[i][2].toFixed(1)]),
  people: { people: d.PEOPLE.length }, crash: d.crashlog.count(),
};
if (H) {
  const a = H.snap();
  r.pool = { built: a.built - st0.built, buildMs: +(a.buildMs - st0.buildMs).toFixed(1), buildMax: a.buildMax, taken: a.taken - st0.taken, refill: a.refill - st0.refill,
    refillMs: +(a.refillMs - st0.refillMs).toFixed(1), refillMax: +a.refillMax.toFixed(2), refillOver1ms: a.refillOver - (st0.refillOver || 0), left: a.left, dropped: a.dropped, on: a.on,
    framesWithBuild: hum.filter(h => h[1] > 0).length, framesBuild2ms: hum.filter(h => h[2] > 2).length, worstBuildFrame: +Math.max(0, ...hum.map(h => h[2])).toFixed(1),
    who: Object.entries(a.who).map(([k, v]) => [k, v[0] - ((st0.who[k] || [0])[0]), +(v[1] - ((st0.who[k] || [0, 0])[1])).toFixed(1), +v[2].toFixed(1)]).filter(x => x[1] > 0).sort((x, y) => y[2] - x[2]).slice(0, 25) };
}
return r;
