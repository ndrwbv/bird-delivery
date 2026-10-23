/* Достройка города за меню на «Деке» (23.10.2026, docs/AGENTS.md «Достройка города на Деке, второй заход»). В npm run check не входит.
   Запуск: npm run probe -- --eval=tools/probe-checks/lateboot.js --early --bootcpu --cpu=3 --size=deck --max=0 --timeout=300
   (--early — скрипт с первого кадра меню, --bootcpu — процессор втрое медленнее с начала загрузки).
   Ответ: pre / game / menu / full — мс от старта страницы (window.__boot: до меню и «город достроен»), lateTotal — достройка
   от меню до конца, lateWork — сумма кусков (остальное — кадры меню между ними); topT — 12 самых долгих кусков, мс;
   topMax — самые долгие шаги кусков; big — шаги дольше 40 мс (кусок: [номер шага, подпись:мс]); gaps — промежутки между кадрами
   меню (top, > 50, > 100 мс); long — долгие задачи браузера после меню (> 50 мс: сколько, самые долгие [начало, мс]).
   Сравнивать «до/после» — двумя сборками (--dir=папка) по очереди, по 2 запуска: на машине агентов шум ±1 с. */
const gaps = []; let last = performance.now(), on = true;
const lt = [];
try { new PerformanceObserver(l => { for (const e of l.getEntries()) lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) { log('longtask: ' + e.message); }
const raf = () => { const n = performance.now(); gaps.push(n - last); last = n; if (on) requestAnimationFrame(raf); };
requestAnimationFrame(raf);
await until(() => window.__boot && window.__boot.full, 200000);
on = false;
const B = window.__boot;
const top = (o, k) => Object.entries(o).filter(([n]) => n !== 'total' && n !== 'flush').sort((a, b) => b[1] - a[1]).slice(0, k);
const ms = v => (typeof v === 'number' ? v : +String(v).split(':').pop());
const big = {};
for (const [n, a] of Object.entries(B.lateSteps || {})) { const L = a.map((v, i) => [i, v]).filter(([, v]) => ms(v) > 40); if (L.length) big[n] = L.slice(0, 6); }
gaps.sort((a, b) => b - a);
const after = lt.filter(([s]) => s > B.menu).sort((a, b) => b[1] - a[1]);
const work = Object.entries(B.late).filter(([n]) => n !== 'total').reduce((s, [, v]) => s + v, 0);
return {
  pre: B.pre, game: B.game, menu: B.menu, full: B.full, lateTotal: B.late.total, lateWork: Math.round(work),
  topT: top(B.late, 12), topMax: top(B.lateMax, 8), big,
  gaps: { n: gaps.length, top: gaps.slice(0, 8).map(Math.round), over50: gaps.filter(g => g > 50).length, over100: gaps.filter(g => g > 100).length },
  long: { over50: after.filter(x => x[1] > 50).length, top: after.slice(0, 6) },
};
