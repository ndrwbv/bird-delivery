/* Медленные шаги мира в смене (23.10.2026, docs/AGENTS.md «Достройка города на Деке, второй заход»). В npm run check не входит.
   Запуск: npm run probe -- --eval=tools/probe-checks/slowsteps.js --cpu=3 --size=deck --max=0 --timeout=500
   --q="stsecs=150&stk=2&stage=4&events": stsecs — секунд смены (120), stk — ускорение мира (1…3), stage — ступень протеста
   (4 — марши и драки), events — каждые 5 с марш, концерт или драка. Каждый шаг CL.step меряется в каждом кадре (аналитика —
   раз в 30 кадров, «slow» в docs/ANALYTICS.md). Ответ: max — самые долгие шаги, мс; ev — шаги дольше 4 мс: [шаг, мс от начала
   замера, мс]. Что внутри долгого шага — тот же запуск с --runprofile=f.cpuprofile на сборке без сжатия (функция __probeMark
   в профиле — начало отсчёта ev). */
const Q = new URLSearchParams(location.search), SECS = +(Q.get('stsecs') || 120), STG = Q.get('stage'), K = +(Q.get('stk') || 1);
const mark = function __probeMark () { const t = performance.now(); while (performance.now() - t < 3); return t; };
await onShift(); autopilot(true); await wait(2000);
if (STG && d.PROT) d.PROT.stage(+STG);
const EV = [], MX = {}, PF = d.crashlog.PROF;
const m0 = mark();
PF.fn = (n, ms) => { if (!(MX[n] >= ms)) MX[n] = ms; if (ms > 4) EV.push([n, Math.round(performance.now() - ms - m0), +ms.toFixed(1)]); };
const t0 = performance.now(); let k = 0;
while (performance.now() - t0 < SECS * 1000) {
  if (K > 1) await run(5, K); else await wait(5000);
  k++;
  if (Q.has('events') && d.PROT) { try { if (k % 3 === 0) d.PROT.march(); else if (k % 3 === 1) d.PROT.gig(); else d.PROT.riot(); } catch (e) { log('event: ' + e.message); } }
}
PF.fn = null;
return { delivered: d.S.delivered, state: d.S.state, max: Object.entries(MX).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([a, b]) => [a, +b.toFixed(1)]), ev: EV.slice(0, 60) };
