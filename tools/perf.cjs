/* Замер кадра на карте: npm run build:web && npx electron tools/perf.cjs --map=seversk
   Ставит машину в несколько точек, несколько секунд ездит прямо, печатает fps,
   разброс кадров, вызовы и треугольники.

   --deck — как на Steam Deck: экран 1280×800 и процессор втрое медленнее
   (DevTools CPU throttling; Zen 2 на 3,5 ГГц против Apple M — примерно так).
   --cpu=N — своё замедление, --q=&season=2.4 — добавка к адресу (зима, ночь…).
   --secs=N — сколько ехать в каждой точке (4 с), --at=x,z[,h];x,z — свои точки (h — курс, рад), --fps=40 — ограничение кадров,
   --dist=web — папка сборки в dist/
   (или полный путь), --prof — где сидит время кадра, --spikes — что делали
   самые долгие кадры (по профилю, кадр за кадром).

   Средний fps плавность не показывает: 58 кадров в секунду с двумя по 50 мс
   выглядят рывками. Поэтому печатаем раскладку: медиана (p50), p95, p99,
   худший кадр, сколько кадров длиннее 20 мс (пропущен один такт экрана) и
   длиннее 33 мс (пропущено два), и «JS» — сколько из кадра занял сам код игры.
   Цель: 60 fps, кадров > 20 мс — меньше 1 %, > 33 мс — ни одного в режиме --deck. */
const { app, BrowserWindow, protocol, net, session } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const has = k => process.argv.includes('--' + k);
const DIST = path.isAbsolute(arg('dist', 'web')) ? arg('dist', 'web') : path.join(__dirname, '..', 'dist', arg('dist', 'web'));
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('js-flags', '--expose-gc');
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* раскладка длительностей кадров, мс */
function stats (iv, busy) {
  const s = iv.slice().sort((a, b) => a - b), q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))] || 0;
  const mean = iv.reduce((a, b) => a + b, 0) / (iv.length || 1);
  const sd = Math.sqrt(iv.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (iv.length || 1));
  const b = busy.slice().sort((x, y) => x - y), bq = p => b[Math.min(b.length - 1, Math.floor(p * b.length))] || 0;
  const r1 = v => Math.round(v * 10) / 10;
  return { n: iv.length, fps: r1(1000 / mean), p50: r1(q(0.5)), p95: r1(q(0.95)), p99: r1(q(0.99)), max: r1(s[s.length - 1] || 0),
    sd: r1(sd), over20: iv.filter(v => v > 20).length, over33: iv.filter(v => v > 33).length, js50: r1(bq(0.5)), js99: r1(bq(0.99)), jsMax: r1(b[b.length - 1] || 0),
    jsLate: r1(100 * busy.filter(v => v > 16.7).length / (busy.length || 1)) };
}
/* «JS > 16,7» — доля кадров, где один код игры дольше такта экрана 60 Гц: на Деке такой
   кадр опоздает к развёртке и покажется дважды — это и есть подёргивание при «60 fps» */
const line = r => `fps ${r.fps}  кадр: p50 ${r.p50} p95 ${r.p95} p99 ${r.p99} худший ${r.max} мс, σ ${r.sd}  > 20 мс: ${r.over20}/${r.n}  > 33 мс: ${r.over33}  JS: p50 ${r.js50} p99 ${r.js99} худший ${r.jsMax}, > 16,7 мс — ${r.jsLate}%`;

process.on('unhandledRejection', e => { console.error(e); app.exit(1); });   // упало — не висеть в фоне
app.whenReady().then(async () => {
  // каждый запуск — с чистого листа: сохранения прошлых запусков на замер не влияют
  const SES = session.fromPartition('perf' + Date.now());
  SES.protocol.handle('app', req => { let p = decodeURIComponent(new URL(req.url).pathname); if (p === '/' || p === '') p = '/index.html'; return net.fetch(pathToFileURL(path.join(DIST, p)).toString()); });
  const DECK = has('deck'), CPU = +arg('cpu', DECK ? 3 : 1), SECS = +arg('secs', 4);
  const win = new BrowserWindow({ width: 1280, height: DECK ? 800 : 720, show: false, webPreferences: { offscreen: true, backgroundThrottling: false, session: SES } });
  win.webContents.setFrameRate(+arg('fps', 60));      // --fps=40 — как ограничение кадров в Steam на Деке
  win.webContents.on('console-message', (e, l, m) => { if (l >= 2 && !/Security Warning/.test(m)) console.log('[page]', m); });
  const js = c => win.webContents.executeJavaScript(c);
  const t0 = Date.now();
  await win.loadURL(`app://g/index.html?debug&mute&nolb&lang=ru&map=${arg('map', 'seversk')}${arg('q', '')}`);
  for (let i = 0; i < 120 && !(await js('!!window.__dlv')); i++) await sleep(250);
  const dbg = win.webContents.debugger; dbg.attach('1.3');
  if (CPU > 1) {                                   // сборку города не тормозим — только игру
    await dbg.sendCommand('Emulation.setCPUThrottlingRate', { rate: CPU });
    console.log('процессор медленнее в', CPU, 'раза' + (DECK ? ', экран 1280×800 (Steam Deck)' : ''));
  }
  console.log('загрузка до игры', Date.now() - t0, 'мс; сборка города', Math.round(await js('__dlv.BUILD_MS')), 'мс; треугольников статики', await js('__dlv.BUILD_T.tris'), '; земля', await js('__dlv.BUILD_T.ground'), 'мс');
  /* Длительность кадра — по часам в начале колбэка, а не по отметке времени
     requestAnimationFrame: в окне вне экрана Электрон раздаёт отметки ровно
     через 16,7 мс, даже когда кадр на деле опоздал.
     Сколько из кадра — код игры: обёртка вокруг колбэков requestAnimationFrame */
  await js(`(() => { const raf = window.__raf0 = window.requestAnimationFrame.bind(window); window.__busy = [];
    // чётные и нечётные кадры — через разные функции: в профиле видно, где кончился один кадр и начался другой
    // (колбэки одного кадра получают одну отметку времени — по ней и меняем)
    let odd = 0, lastT = -1; const A = function __frameA (cb, t) { cb(t); }, B = function __frameB (cb, t) { cb(t); };
    // время всех колбэков одного кадра — в одну запись
    let acc = 0;
    window.requestAnimationFrame = cb => raf(t => { if (t !== lastT) { if (lastT >= 0) window.__busy.push(acc); acc = 0; odd ^= 1; lastT = t; } const s = performance.now(); odd ? A(cb, t) : B(cb, t); acc += performance.now() - s; }); })()`);
  await js(`document.getElementById('st-ride').click()`);
  await sleep(1500);
  /* --at=x,z;x,z — свои точки вместо стандартных (например большие перекрёстки) */
  const pts = arg('at') ? arg('at').split(';').map(q => q.split(',').map(Number)) : await js(`(() => { const C = __dlv.CITY, B = C.buildings; const cen = p => p.reduce((a, q) => [a[0] + q[0] / p.length, a[1] + q[1] / p.length], [0, 0]);
    const one = (f, i) => { const a = B.filter(f); return a.length ? cen(a[Math.min(i, a.length - 1)].p) : null; };
    return [__dlv.PIZZA ? [__dlv.PIZZA.x, __dlv.PIZZA.z] : [0, 0], one(b => b.st === 'panel', 40), one(b => b.st === 'stalin', 80), one(b => b.k === 'ind', 200), one(b => b.k === 'gar', 100), one(b => b.lv >= 5, 30)].filter(Boolean); })()`);
  const place = (x, z, h) => js(`(() => { const D = __dlv, r = D.nearestRoad(${x}, ${z}, 5, 4); if (r) { D.V.x = r.x; D.V.z = r.z; D.V.h = Math.atan2(r.seg.x2 - r.seg.x1, r.seg.z2 - r.seg.z1); } if (${h !== undefined && !isNaN(h)}) D.V.h = ${+h || 0}; D.V.vx = D.V.vz = 0; D.V.y = D.surfaceAt(D.V.x, D.V.z); D.V.camX = D.V.x; D.V.camZ = D.V.z; D.IN.gas = 1; })()`);
  const ALL = [], ALLB = [], levels = [];
  for (const [x, z, h] of pts) {
    await place(x, z, h);
    await sleep(1500);
    const r = await js(`new Promise(res => { const iv = []; let last = -1; const t0 = performance.now(); window.__busy.length = 0;
      const f = () => { const now = performance.now(); if (last >= 0) iv.push(now - last); last = now; if (now - t0 < ${SECS * 1000}) __raf0(f); else res({ iv, busy: window.__busy.slice(), calls: __dlv.renderer.info.render.calls, tris: __dlv.renderer.info.render.triangles, geo: __dlv.renderer.info.memory.geometries }); }; __raf0(f); })`);
    const st = stats(r.iv, r.busy), lv = await js('__dlv.CULL ? (__dlv.CULL.q || 0) : 0');
    ALL.push(...r.iv); ALLB.push(...r.busy); levels.push(lv);
    console.log([Math.round(x), Math.round(z)], line(st), `| вызовов ${r.calls}, треуг. ${r.tris}, дальность: ступень ${lv}`);
  }
  console.log('ВСЕГО', line(stats(ALL, ALLB)), '| ступени дальности по точкам', levels.join(' '), '| переключений', await js('__dlv.CULL.switches || 0'));
  if (has('prof') || has('spikes')) {               // где сидит время кадра
    const [px, pz, ph] = pts[Math.min(+arg('profat', pts.length - 1), pts.length - 1)];   // --profat=0 — у пиццерии
    await place(px, pz, ph);
    await sleep(1500);
    await dbg.sendCommand('Profiler.enable'); await dbg.sendCommand('Profiler.setSamplingInterval', { interval: 250 });
    await dbg.sendCommand('Profiler.start'); await sleep(+arg('profsecs', 6) * 1000);
    const { profile } = await dbg.sendCommand('Profiler.stop');
    const byId = new Map(profile.nodes.map(n => [n.id, n])), parent = new Map();
    for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
    const key = f => (f.functionName || '(anon)') + ' ' + f.url.split('/').pop().split('?')[0] + ':' + (f.lineNumber + 1);
    const dts = profile.timeDeltas, tot = profile.samples.length;
    if (has('prof')) {
      const self = {};
      profile.samples.forEach(id => { const k = key(byId.get(id).callFrame); self[k] = (self[k] || 0) + 1; });
      const idle = Object.entries(self).filter(([k]) => /^\(idle\)|^\(program\)|^\(garbage/.test(k)).reduce((a, [, v]) => a + v, 0);
      console.log('занято', (100 * (tot - idle) / tot).toFixed(0) + '%');
      console.log(Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, +arg('top', 30)).map(([k, v]) => (100 * v / tot).toFixed(1).padStart(5) + '% ' + k).join('\n'));
    }
    if (has('spikes')) {
      /* Кадр — сэмплы внутри колбэка кадра (__frameA или __frameB: чётный и
         нечётный кадры идут через разные функции) и сборка мусора между ними.
         Долгие кадры (дольше --spike мс, 12 по умолчанию) раскладываем по тому,
         что frame() звал напрямую, и по собственному времени функций */
      const TH = +arg('spike', 12), frames = [];
      let cur = null, par = '';
      profile.samples.forEach((id, i) => {
        const d = (dts[i + 1] || 0) / 1000, f = byId.get(id).callFrame;
        let child = '(вне frame)', side = '', deep = '';
        for (let x = id, prev = null, prev2 = null; x != null; prev2 = prev, prev = x, x = parent.get(x)) {
          const cf = byId.get(x).callFrame;
          if (cf.functionName === 'frame' && /game/.test(cf.url)) {
            child = prev != null ? key(byId.get(prev).callFrame) : '(сам frame)';
            deep = prev2 != null ? child.split(' ')[0] + ' › ' + key(byId.get(prev2).callFrame).split(' ')[0] : child.split(' ')[0];
          }
          if (cf.functionName === '__frameA' || cf.functionName === '__frameB') { side = cf.functionName; break; }
        }
        const gc = f.functionName === '(garbage collector)';
        if (side) {
          if (!cur || side !== par) { if (cur) frames.push(cur); cur = { ms: 0, by: {}, self: {}, deep: {} }; par = side; }
        } else if (!(gc && cur)) { if (cur) frames.push(cur); cur = null; par = ''; return; }
        cur.ms += d;
        const k = side ? child : '(сборка мусора)';
        cur.by[k] = (cur.by[k] || 0) + d;
        const sk = key(f); cur.self[sk] = (cur.self[sk] || 0) + d;
        if (deep) cur.deep[deep] = (cur.deep[deep] || 0) + d;
      });
      if (cur) frames.push(cur);
      const long = frames.filter(q => q.ms > TH), sum = {}, sself = {};
      for (const q of long) { for (const [k, v] of Object.entries(q.by)) sum[k] = (sum[k] || 0) + v; for (const [k, v] of Object.entries(q.self)) sself[k] = (sself[k] || 0) + v; }
      const ms = frames.map(q => q.ms).sort((a, b) => a - b);
      if (!ms.length) console.log('в профиле не нашлось кадров');
      if (ms.length && !Object.keys(frames[0].by).some(k => k !== '(вне frame)' && k !== '(сборка мусора)')) console.log('имена функций сжаты: для раскладки нужна сборка без сжатия — npx vite build --mode web --outDir dist/dbg --minify false, потом --dist=dbg');
      else console.log(`кадров в профиле ${frames.length}, код кадра: медиана ${ms[ms.length >> 1].toFixed(1)} мс, худший ${ms[ms.length - 1].toFixed(1)} мс; дольше ${TH} мс — ${long.length}`);
      const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => (v / (long.length || 1)).toFixed(2).padStart(7) + ' мс/кадр  ' + k).join('\n');
      console.log('в долгих кадрах — что звал frame():\n' + top(sum, +arg('top', 20)));
      console.log('в долгих кадрах — собственное время:\n' + top(sself, +arg('top', 20)));
      console.log('самые долгие:\n  ' + long.sort((a, b) => b.ms - a.ms).slice(0, +arg('worst', 10)).map(q => q.ms.toFixed(1) + ' мс: ' + Object.entries(q.deep).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => k + ' ' + v.toFixed(1)).join(', ')).join('\n  '));
    }
  }
  console.log('размеры', await js(`JSON.stringify({ raised: __dlv.RAISED.size, solids: __dlv.SOLIDS.length, sgrid: __dlv.SOLID_GRID.size, smash: __dlv.SMASH.length, traffic: __dlv.TRAFFIC.length, people: __dlv.PEOPLE.length, props: __dlv.PROPS.length, meshes: (() => { let n = 0, v = 0; __dlv.scene.traverse(o => { if (o.isMesh) { n++; const p = o.geometry.attributes.position; if (p && p.array) v += p.array.length; } }); return { n, floatsInJs: v }; })() })`));
  await js('window.gc && gc()'); await sleep(500);
  console.log('JS heap после сборки мусора', await js(`performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1`), 'МБ');
  app.quit();
});
