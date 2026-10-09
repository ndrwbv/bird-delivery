/* Хвост кадров на «Деке» (09.10.2026): смена на автопилоте, раскладка времени кадра. В npm run check не входит.
   Запуск: npm run probe -- --eval=tools/probe-checks/frametail.js --cpu=3 --size=deck --max=0 --timeout=300
   --q=tailsecs=75 — сколько секунд мерить (60 по умолчанию; первые 4 с после начала смены — разгон, не в счёт);
   --q=noview — без отсечения по кадру (cull.js), для сравнения; --runprofile=f.cpuprofile, потом
   node tools/profsum.cjs f.cpuprofile --spikes — что делали самые долгие кадры (имена — с несжатой сборкой).
   Ответ: кадр (промежутки между кадрами: p50/p95/p99, доля > 16,7 и > 33 мс), JS кадра (сам код игры
   с отрисовкой), отрисовка отдельно, шаги мира CL.step — в среднем на кадр, худший раз и сколько раз > 2 мс.
   Числа на загруженной машине шумят на 10—20 %: сравнивать «до/после» лучше в одном запуске
   (переключая что-то из __dlv) или 2—3 запуска подряд. */
const Q = new URLSearchParams(location.search), SECS = +(Q.get('tailsecs') || 60);
await onShift(); autopilot(true); await wait(4000);
// шаги мира: crashlog PROF.fn зовётся после каждого CL.step
const ST = {}, PF = d.crashlog.PROF;
PF.fn = (n, ms) => { const s = ST[n] || (ST[n] = { sum: 0, max: 0, big: 0 }); s.sum += ms; if (ms > s.max) s.max = ms; if (ms > 2) s.big++; };
const R = d.renderer, r0 = R.render; let rd = 0;
R.render = function (s, c) { const t = performance.now(); r0.call(R, s, c); rd += performance.now() - t; };
// JS кадра: колбэки кадра — через __frameA / __frameB по очереди (профиль: tools/profsum.cjs --spikes)
const raf = window.requestAnimationFrame, js = [], rds = [], ft = [];
let acc = 0, lastT = -1, lastW = -1, odd = 0;
const A = function __frameA (cb, t) { cb(t); }, B = function __frameB (cb, t) { cb(t); };
window.requestAnimationFrame = cb => raf(t => {
  if (t !== lastT) { const now = performance.now(); if (lastT >= 0) { js.push(acc); rds.push(rd); if (lastW >= 0) ft.push(now - lastW); } lastW = now; acc = 0; rd = 0; lastT = t; odd ^= 1; }
  const s = performance.now(); (odd ? A : B)(cb, t); acc += performance.now() - s;
});
const t0 = performance.now(), del0 = d.S.delivered || 0;
await wait(SECS * 1000);
PF.fn = null; R.render = r0; window.requestAnimationFrame = raf;
const el = (performance.now() - t0) / 1000;
const st = a => { const s = a.slice().sort((x, y) => x - y), n = s.length, q = p => +s[Math.min(n - 1, Math.floor(p * n))].toFixed(1);
  return { n, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: +s[n - 1].toFixed(1), avg: +(a.reduce((x, y) => x + y, 0) / n).toFixed(2),
    'o16,7%': +(100 * a.filter(v => v > 16.7).length / n).toFixed(2), 'o33%': +(100 * a.filter(v => v > 33).length / n).toFixed(2) }; };
const n = js.length;
return { secs: +el.toFixed(1), frame: st(ft), js: st(js), render: st(rds),
  steps: Object.entries(ST).map(([k, v]) => [k, +(v.sum / n).toFixed(3), +v.max.toFixed(1), v.big]).sort((a, b) => b[1] - a[1]).slice(0, 15),
  worst: Object.entries(ST).map(([k, v]) => [k, +v.max.toFixed(1), v.big]).sort((a, b) => b[1] - a[1]).slice(0, 10),
  cull: { cells: d.CULL.cells, cellsOut: d.CULL.cellsOut, view: d.CULLV ? d.CULLV.on : null, q: d.CULLQ ? d.CULLQ.lvl : null },
  n: { traffic: d.TRAFFIC.length, people: d.PEOPLE.length, peds: d.PEDS.length }, delivered: (d.S.delivered || 0) - del0, state: d.S.state, crash: d.crashlog.count() };
