/* Разбор профилей из probe: node tools/profsum.cjs f.cpuprofile | f.heapprofile [--top=25] [--spikes [--spike=12]]
   --spikes — долгие кадры по отдельности (скрипт замера должен звать колбэки кадра через __frameA/__frameB,
   см. tools/probe-checks/frametail.js)
   .cpuprofile — собственное время функций (% от всех сэмплов) и время целиком под шагами кадра;
   .heapprofile — кто выделяет память: МБ за запуск по функциям (собственные выделения) и по
   цепочке «функция ← кто звал» — откуда мусор, который потом собирает сборщик.
   Имена — только со сборкой без сжатия (npx vite build --mode web --outDir папка --minify false,
   потом probe --dir=папка). */
const fs = require('fs');
const f = process.argv[2], TOP = +((process.argv.find(a => a.startsWith('--top=')) || '--top=25').slice(6));
const P = JSON.parse(fs.readFileSync(f, 'utf8'));
const key = c => (c.functionName || '(anon)') + ' ' + String(c.url || '').split('/').pop().split('?')[0] + ':' + (c.lineNumber + 1);
const top = (o, n, unit, tot) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n)
  .map(([k, v]) => (unit === '%' ? (100 * v / tot).toFixed(1) + '%' : (v / 1048576).toFixed(1) + ' МБ').padStart(9) + '  ' + k).join('\n');
if (P.head) {                                         // выборка выделений (HeapProfiler.stopSampling)
  const self = {}, chain = {};
  let tot = 0;
  const walk = (n, up) => {
    const k = key(n.callFrame), s = n.selfSize || 0;
    if (s) { self[k] = (self[k] || 0) + s; const c = k + '  ←  ' + (up || '-'); chain[c] = (chain[c] || 0) + s; tot += s; }
    for (const c of n.children || []) walk(c, k);
  };
  walk(P.head, '');
  console.log('выделено всего', (tot / 1048576).toFixed(1), 'МБ (выборка)');
  console.log('собственные выделения:\n' + top(self, TOP, 'mb'));
  console.log('с тем, кто звал:\n' + top(chain, TOP, 'mb'));
} else if (process.argv.includes('--spikes')) {
  /* долгие кадры: сэмплы внутри колбэка кадра. Кадры отличаем по обёртке: чётные идут через
     функцию __frameA, нечётные — через __frameB (ставит скрипт замера, как perf.cjs). Долгий —
     дольше --spike мс (12); для каждого — что звал frame() и что сидело само */
  const byId = new Map(P.nodes.map(n => [n.id, n])), parent = new Map();
  for (const n of P.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const TH = +((process.argv.find(a => a.startsWith('--spike=')) || '--spike=12').slice(8));
  const frames = [], dts = P.timeDeltas;
  let cur = null, par = '';
  P.samples.forEach((id, i) => {
    const d = (dts[i + 1] || 0) / 1000, f = byId.get(id).callFrame;
    let side = '', path = [];
    for (let x = id; x != null; x = parent.get(x)) {
      const cf = byId.get(x).callFrame;
      if (cf.functionName === '__frameA' || cf.functionName === '__frameB') { side = cf.functionName; break; }
      path.push(cf.functionName || '(anon)');
    }
    const gc = f.functionName === '(garbage collector)';
    if (side) { if (!cur || side !== par) { if (cur) frames.push(cur); cur = { ms: 0, by: {}, self: {} }; par = side; } }
    else if (!(gc && cur)) { if (cur) frames.push(cur); cur = null; par = ''; return; }
    cur.ms += d;
    // «шаг»: функция сразу под step (предохранитель crashlog) или под frameStep / render
    let k = gc ? '(сборка мусора)' : path[path.length - 1] || '?';
    for (let j = path.length - 1; j > 0; j--) if (path[j] === 'step' || path[j] === 'frameStep' || path[j] === 'R.render') { k = path[j] + ' › ' + path[j - 1]; if (path[j] === 'frameStep' && path[j - 1] === 'step') continue; break; }
    cur.by[k] = (cur.by[k] || 0) + d;
    const sk = key(f); cur.self[sk] = (cur.self[sk] || 0) + d;
  });
  if (cur) frames.push(cur);
  const ms = frames.map(q => q.ms).sort((a, b) => a - b), long = frames.filter(q => q.ms > TH);
  console.log(`кадров ${frames.length}: медиана ${ms[ms.length >> 1].toFixed(1)} мс, p99 ${ms[Math.floor(ms.length * 0.99)].toFixed(1)}, худший ${ms[ms.length - 1].toFixed(1)}; дольше ${TH} мс — ${long.length}`);
  const sum = {}, sself = {}, all = {};
  for (const q of long) { for (const [k, v] of Object.entries(q.by)) sum[k] = (sum[k] || 0) + v; for (const [k, v] of Object.entries(q.self)) sself[k] = (sself[k] || 0) + v; }
  for (const q of frames) for (const [k, v] of Object.entries(q.by)) all[k] = (all[k] || 0) + v;
  const tp = (o, n, div) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => (v / div).toFixed(2).padStart(7) + ' мс/кадр  ' + k + (div === long.length && all[k] ? '   (в среднем кадре ' + (all[k] / frames.length).toFixed(2) + ')' : '')).join('\n');
  console.log('в долгих кадрах — по шагам:\n' + tp(sum, TOP, long.length || 1));
  console.log('в долгих кадрах — собственное время:\n' + tp(sself, TOP, long.length || 1));
  console.log('самые долгие:\n  ' + long.sort((a, b) => b.ms - a.ms).slice(0, 12).map(q => q.ms.toFixed(1) + ' мс: ' + Object.entries(q.by).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => k + ' ' + v.toFixed(1)).join(', ')).join('\n  '));
} else {                                              // профиль процессора
  const byId = new Map(P.nodes.map(n => [n.id, n])), parent = new Map();
  for (const n of P.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const self = {}, incl = {}, tot = P.samples.length;
  for (const id of P.samples) {
    const k = key(byId.get(id).callFrame); self[k] = (self[k] || 0) + 1;
    const seen = new Set();
    for (let x = id; x != null; x = parent.get(x)) { const kk = key(byId.get(x).callFrame); if (!seen.has(kk)) { seen.add(kk); incl[kk] = (incl[kk] || 0) + 1; } }
  }
  console.log('сэмплов', tot);
  console.log('собственное время:\n' + top(self, TOP, '%', tot));
  console.log('целиком (с вызванным):\n' + top(incl, TOP, '%', tot));
}
