/* probe — «одна команда — ответ»: собранная игра в Электроне вне экрана, скрипт агента
   в странице, JSON на выходе. Окна нет, панель браузера не нужна, кадры идут сами.

   npm run probe -- --js="return d.S.state"
   npm run probe -- --eval=check.js --kids --size=phone --secs=10 --shot=out.png --scale=0.5

   --mode=web|yandex|steam  сборка (web); собирается в os.tmpdir()/bird-probe, только если
                            исходники новее (--rebuild — всегда, --no-build — не собирать)
   --dir=папка              готовая сборка вместо своей (напр. релизная: BUILD_VERSION=0.0.99 npx vite build
                            --mode steam --outDir папка) — проверить то, что видно только в релизе
   --kids                   ?kids (детская версия; на yandex она и так)
   --map=seversk  --lang=ru  --q=a=1&b  — добавки к адресу игры (?debug&mute&nolb&nointro уже есть)
   --fresh                  первый запуск как у новичка: подсказки (hints.js) и учебный заказ не пропущены
   --page=ui.html           другая страница сборки (index.html по умолчанию): ждём не __dlv, а загрузку
                            и window.__probeReady !== false. Песочница интерфейса: --page=ui.html — панель
                            (window.__uilab), --page=ui.html --q=frame — сам экран (window.__ui), docs/SANDBOX.md
                            Редактор города: --page=editor.html (window.__editor; ждёт, пока город достроится)
   --size=desktop|phone|phone-land|phone-se|phone-big|deck|WxH   1280×720 / 390×844 с касаниями (стоя — с ?portrait:
                            игра на телефоне только боком, orient.js) / 844×390 боком / 667×375 iPhone SE боком /
                            932×430 большой боком / 1280×800
   поворот из скрипта: console.log('__proberesize:844x390') — окно сменит размер (повернуть телефон туда-обратно)
   кадр посреди скрипта: await shot('/путь/a.png') — снимок как --shot (несколько экранов за один запуск);
                            по-старому console.log('__probeshot:/путь/a.png') + wait(800)
   --turn                   --size=phone без ?portrait: как настоящий телефон стоя — заставка «поверни телефон» и пауза
   --sa=L,B                 вырез и полоска «домой» боком, px (iPhone 15 — 59,21): отступы --sa-* хада вместо env()
   --js="код" | --eval=file.js     тело async-функции в странице. Есть: d (= __dlv), wait(ms),
                            until(fn, ms), run(secs, k) — дать игре идти secs секунд (k — ускорение
                            до 3), onShift() — начать смену и принять заказ, ride() — просто кататься,
                            tp(x, z[, h]) — машину на ближайшую дорогу, autopilot(on) — едет по
                            маршруту заказа и принимает следующие, frames() — время кадров
                            {n, p50, p95, max}, log(x) — строка в вывод. return — JSON в stdout
                            smoke(secs) — смена на автопилоте и проверка «игра жива» (едет ≥ 150 м,
                            кадры и часы идут, числа конечные, в конце смена, журнал ошибок пуст)
                            → { ok, fail, m, ft, crash }. Журнал — d.crashlog (docs/CRASHES.md)
   --cpu=N                  процессор медленнее в N раз (после загрузки, как perf.cjs --deck; Дека ≈ 3)
   --early                  не ждать, пока город достроится за меню (latebuild.js): скрипт — сразу с первым кадром меню
   --bootcpu                --cpu уже с начала загрузки (замер запуска на «Деке»: window.__boot — мс от старта страницы)
   --seed=N                 Math.random с зерном — город одинаковый от запуска к запуску (сравнить до/после)
   --cpuprofile=f.cpuprofile  профиль процессора загрузки (до меню) — для разбора, что долго строится
   --runprofile=f.cpuprofile  профиль процессора, пока идёт скрипт; --allocprofile=f.heapprofile — выборка
                            выделений памяти (с мусором, что уже собран). Разбор — node tools/profsum.cjs f
                            (имена функций — со сборкой без сжатия: --dir=папка от vite build --minify false)
   --secs=N                 после скрипта дать игре идти N секунд
   --shot=out.png [--scale=2]      кадр в конце — как видит игрок: кадр игры крупным пикселем (растянут «ближайшим», без
                            размытия) и интерфейс поверх; размер — окна (1280×800 при --size=deck). --scale только кратно:
                            2, 3 — крупнее (2 — как на ретине), 0.5, 0.33 — мельче, тоже без размытия кадра. Автору — без --scale
   --errors                 напечатать ошибки консоли (счётчик печатается всегда)
   --console                печатать всю консоль страницы
   --max=4000               обрезать вывод JSON до N символов (0 — целиком)
   --report=file.json       полный отчёт (результат, ошибки, кадры, время) — для tools/check.cjs
   --mem                    память (docs/AGENTS.md «Память на телефоне»): в скрипте mem('метка') → куча JS после сборки мусора,
                            видеопамять по обёрткам WebGL (tools/probe-glmem.cjs: буферы, текстуры, кадр), renderer.info,
                            память процессов Электрона (страница, видеокарта); memLate() — по кускам поздней сборки (с --early)
   --heapsnap=папка         снимок кучи по heapSnap('метка') в скрипте → папка/метка.heapsnapshot; разбор — node tools/heapsum.cjs a [b]
                            watch('метка') … unwatch('метка') в скрипте (с --mem) — пик следа страницы между ними: probe опрашивает
                            footprint без передышки (~10—60 мс на опрос), пока окно открыто → { foot0, peak, exact, peakT, foot1, life0 / life1 — пик с запуска до / после, page, gpu, n, ms };
                            пик с запуска вырос за окно — peak = он (точно, exact), нет — по опросам
                            (переходы: экран загрузки, мини-игры — docs/AGENTS.md «Память на телефоне» → «Пики на переходах»)
   --bootwait=240           секунд на полную готовность города; --early ждёт только меню
   --timeout=360            секунд на всё
   Код выхода: 1 — необработанная ошибка в странице, исключение в скрипте, игра не загрузилась.
   Каждый запуск — с чистым сохранением (своя сессия в памяти и своя папка userData). */
const { app, BrowserWindow, protocol, net, session, nativeImage } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { ensureBuild, BASE } = require('./probe-build.cjs');

const argv = process.argv.slice(2);
const arg = (k, d) => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const has = k => argv.includes('--' + k);
const T0 = Date.now();
const MODE = arg('mode', 'web');
const PAGE = arg('page', 'index.html').replace(/^\/+/, '');
const GAME = PAGE === 'index.html';
const SIZES = { desktop: [1280, 720], phone: [390, 844], 'phone-land': [844, 390], 'phone-se': [667, 375], 'phone-big': [932, 430], deck: [1280, 800] };
const SZ = arg('size', 'desktop');
const [W, H] = SIZES[SZ] || (/^\d+x\d+$/.test(SZ) ? SZ.split('x').map(Number) : SIZES.desktop);
const PHONE = SZ === 'phone' || SZ.startsWith('phone-');
const MAXC = +arg('max', 4000);
const err = (...a) => process.stderr.write(a.join(' ') + '\n');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let CODE = arg('js', null);
if (arg('eval')) { try { CODE = fs.readFileSync(path.resolve(arg('eval')), 'utf8'); } catch (e) { err('probe: нет файла', arg('eval')); process.exit(2); } }

// чистое сохранение: своя папка userData (кеш, localStorage сессии по умолчанию)
fs.mkdirSync(BASE, { recursive: true });
for (const f of fs.readdirSync(BASE)) {            // папки упавших запусков — старше часа
  if (f.startsWith('ud-')) { try { if (Date.now() - fs.statSync(path.join(BASE, f)).mtimeMs > 3600e3) fs.rmSync(path.join(BASE, f), { recursive: true, force: true }); } catch (e) { /* — */ } }
}
const UD = fs.mkdtempSync(path.join(BASE, 'ud-'));
app.setPath('userData', UD);
if (app.dock) app.dock.hide();
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);   // stream — <audio> музыки (music.js), как в electron/main.cjs
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('mute-audio');   // ни звука из проверок, даже если ?mute где-то не сработал (автор 09.10)
const MEM = has('mem') || !!arg('heapsnap');
if (MEM) app.commandLine.appendSwitch('enable-precise-memory-info');   // performance.memory — точные байты, не ступеньки
const JSF = [arg('jsflags', ''), MEM ? '--expose-gc' : ''].filter(Boolean).join(' ');
if (JSF) app.commandLine.appendSwitch('js-flags', JSF);   // --jsflags="--trace-deopt" — флаги V8 (вывод — в stdout страницы), docs/AGENTS.md «Хвост кадров»

function finish (code, report) {
  if (arg('report')) { try { fs.writeFileSync(path.resolve(arg('report')), JSON.stringify(report)); } catch (e) { err('probe: отчёт не записан:', e.message); } }
  try { fs.rmSync(UD, { recursive: true, force: true }); } catch (e) { /* — */ }
  app.exit(code);
}

// ошибка в самом probe — в stderr и выход, без окна Электрона «A JavaScript error occurred in the main process»
// (агенты гоняют по 6 probe разом — окна сыпались автору на экран)
const fatal = e => { err('probe: ошибка probe:', (e && e.stack) || e); finish(1, { ok: false, probeError: String((e && e.message) || e) }); };
process.on('uncaughtException', fatal);
process.on('unhandledRejection', fatal);

const { PRELUDE, INSTALL } = require('./probe-page.cjs');   // помощники скрипта и автопилот — общие с perf.cjs
const { GLMEM } = require('./probe-glmem.cjs');                 // --mem: видеопамять по обёрткам WebGL

app.whenReady().then(async () => {
  // --dir=папка — готовая сборка (например, релизная с BUILD_VERSION), без своей пересборки
  const b = arg('dir') ? (fs.existsSync(path.join(path.resolve(arg('dir')), 'index.html')) ? { dir: path.resolve(arg('dir')) } : { error: 'нет index.html в ' + arg('dir') })
    : ensureBuild(MODE, { force: has('rebuild'), skip: has('no-build') });
  if (b.error) { err('probe: сборка', MODE, 'не удалась:\n' + b.error); return finish(1, { ok: false, buildError: b.error }); }
  const tBuild = Date.now() - T0;
  const DIST = b.dir;

  const SES = session.fromPartition('probe-' + process.pid + '-' + Date.now());   // без persist: — только в памяти
  SES.protocol.handle('app', req => {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (p === '/' || p === '') p = '/index.html';
    const f = path.join(DIST, p);
    if (!fs.existsSync(f)) {
      if (p === '/sdk.js') return new Response('/* probe: без SDK Яндекса */', { headers: { 'content-type': 'text/javascript' } });
      return new Response('нет файла', { status: 404 });
    }
    return net.fetch(pathToFileURL(f).toString());
  });
  // до первой страницы: язык выбран, гайд, учебный заказ и обучение на чеке смены пройдены (--fresh — как у новичка)
  const LANG = arg('lang', 'ru');
  const seed = has('fresh') ? { 'dlv-lang': LANG } : { 'dlv-lang': LANG, 'dlv-msk-guide': 1, 'dlv-msk-tut': '1', 'dlv-msk-nostut': 1, 'dlv-shift-tut': 1 };
  const pre = path.join(UD, 'seed-preload.js');
  /* телефон: касания как у смартфона — matchMedia(pointer: coarse / hover: none), maxTouchPoints,
     ontouchstart. Эмуляция через DevTools (Emulation.*) в окне вне экрана роняет Электрон,
     поэтому подмена прямо в странице (preload в её мире, contextIsolation: false) */
  const touch = !PHONE ? '' : `
    const mm = window.matchMedia.bind(window);
    window.matchMedia = q => { const r = mm(q); if (/pointer:\\s*coarse|hover:\\s*none|any-pointer:\\s*coarse/.test(q)) return ({ matches: true, media: q, onchange: null, dispatchEvent: () => true, addEventListener () {}, removeEventListener () {}, addListener () {}, removeListener () {} }); return r; };
    Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 });
    if (!('ontouchstart' in window)) window.ontouchstart = null;
    Object.defineProperty(Navigator.prototype, 'userAgent', { get: () => 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });`;
  // --seed=N — Math.random с зерном: город строится одинаково от запуска к запуску (сравнить «до/после»)
  const rnd = arg('seed') ? `(() => { let a = ${+arg('seed') >>> 0}; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    // каждый кусок поздней сборки — со своего зерна (latebuild.js): город один и тот же с ?nolate и без, что бы ни шло между кусками
    window.__lateSeed = n => { let h = ${+arg('seed') >>> 0} ^ 0x9E3779B9; for (let i = 0; i < n.length; i++) h = Math.imul(h ^ n.charCodeAt(i), 0x01000193); a = h; }; })();` : '';
  fs.writeFileSync(pre, `try { const S = ${JSON.stringify(seed)}; for (const k in S) if (localStorage.getItem(k) === null) localStorage.setItem(k, JSON.stringify(S[k])); } catch (e) {}` + touch);

  const win = new BrowserWindow({ width: W, height: H, useContentSize: true, show: false,
    webPreferences: { offscreen: true, backgroundThrottling: false, session: SES, preload: pre, sandbox: false, contextIsolation: !PHONE } });
  win.webContents.setFrameRate(60);
  const errors = [];
  let uncaught = 0;
  win.webContents.on('console-message', (e, level, msg, line, src) => {
    if (MEM && typeof msg === 'string' && msg.startsWith('__probemem:')) { memMark(msg.slice(11)); return; }
    if (MEM && typeof msg === 'string' && msg.startsWith('__probewatch:')) { watchMark(msg.slice(13)); return; }
    // повернуть «телефон» из скрипта: console.log('__proberesize:844x390') — окно меняет размер (orient.js, поворот туда-обратно)
    if (typeof msg === 'string' && msg.startsWith('__proberesize:')) { const [w, h] = msg.slice(14).split('x').map(Number); if (w > 0 && h > 0) win.setContentSize(w, h); return; }
    // кадр посреди скрипта: await shot('/путь/кадр.png') (PRELUDE) или console.log('__probeshot:/путь/кадр.png') + wait(800)
    if (typeof msg === 'string' && msg.startsWith('__probeshot:')) {
      const raw = msg.slice(12), f = path.resolve(raw);
      shot(f).then(r => { err('probe: кадр →', f, r.w + '×' + r.h + (r.sharp ? '' : ' (без растяжки кадра: ' + (r.skip || 'нет холста') + ')')); return r; }, e => { err('probe: кадр не снят:', e.message); return { err: e.message }; })
        .then(r => js(`(window.__probeShots || (window.__probeShots = {}))[${JSON.stringify(raw)}] = ${JSON.stringify(r)}`).catch(() => {}));
      return;
    }
    if (has('console') || (level >= 3 && has('errors'))) err('[page]', msg.slice(0, 500));
    if (level >= 3) {
      const un = /^Uncaught/.test(msg);
      if (un) uncaught++;
      if (errors.length < 50) errors.push((un ? '' : '') + msg.slice(0, 400) + (src ? ' @' + String(src).split('/').pop() + ':' + line : ''));
    }
  });
  win.webContents.on('render-process-gone', (e, d) => { err('probe: страница упала:', d.reason); finish(1, { ok: false, crashed: d.reason, errors }); });
  const js = c => win.webContents.executeJavaScript(c, true);
  /* --mem: память процессов Электрона по метке из страницы (mem('метка') в PRELUDE); --heapsnap — ещё и снимок кучи */
  const MEMLOG = [];
  async function memMark (raw) {
    const heap = raw.startsWith('heap:'), label = heap ? raw.slice(5) : raw;
    let r = {};
    try {
      const rpid = win.webContents.getOSProcessId(), MBk = 1024;
      for (const m of app.getAppMetrics()) {
        const k = m.pid === rpid ? 'page' : m.type === 'GPU' ? 'gpu' : null;
        if (k) r[k] = Math.round(m.memory.workingSetSize / MBk);
        if (k === 'page' && m.memory.privateBytes) r.pagePriv = Math.round(m.memory.privateBytes / MBk);
      }
      // macOS: «след» страницы (phys_footprint) — та же мера, по которой iOS убивает вкладку; и его пик с начала
      if (process.platform === 'darwin') {
        try {
          const o = require('child_process').execFileSync('footprint', ['-p', String(rpid), '--noCategories'], { encoding: 'utf8', timeout: 20000 });
          const mb = re => { const x = o.match(re); return x ? Math.round(+x[1] * (/GB/.test(x[2]) ? 1024 : /KB/.test(x[2]) ? 1 / 1024 : 1)) : null; };
          r.foot = mb(/phys_footprint:\s*([\d.]+)\s*(GB|MB|KB)/); r.footPeak = mb(/phys_footprint_peak:\s*([\d.]+)\s*(GB|MB|KB)/);
        } catch (e) { /* нет прав или утилиты — без следа */ }
      }
      if (heap && arg('heapsnap') && dbg.isAttached()) {
        const dir = path.resolve(arg('heapsnap')); fs.mkdirSync(dir, { recursive: true });
        const f = path.join(dir, label.replace(/[^\w.-]+/g, '_') + '.heapsnapshot'), out = fs.openSync(f, 'w');
        const on = (ev, m, p) => { if (m === 'HeapProfiler.addHeapSnapshotChunk') fs.writeSync(out, p.chunk); };
        dbg.on('message', on);
        await dbg.sendCommand('HeapProfiler.enable');
        await dbg.sendCommand('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false });
        dbg.removeListener('message', on); fs.closeSync(out);
        r.snap = f; err('probe: снимок кучи →', f);
      }
    } catch (e) { r.err = String(e.message || e); }
    MEMLOG.push({ label, ...r });
    if (heap) js('window.__lateHold = false').catch(() => {});   // ?latesnap — поздняя сборка стояла, пока снимали кучу
    js(`(window.__probeMemR || (window.__probeMemR = {}))[${JSON.stringify(raw)}] = ${JSON.stringify(r)}`).catch(() => {});
  }

  /* --mem: окно «пик между метками» (watch / unwatch в скрипте): след страницы опрашивается подряд, пока открыто хоть одно окно.
     phys_footprint_peak — пик с запуска процесса (его не сбросить), поэтому — свои опросы текущего следа */
  const WATCH = new Map();                            // метка → { foot0, peak, page, gpu, n, t0 }
  let watchLoop = null;
  const footNow = full => new Promise(res => {
    if (process.platform !== 'darwin') return res(full ? {} : null);
    let rpid; try { rpid = win.webContents.getOSProcessId(); } catch (e) { return res(full ? {} : null); }
    require('child_process').execFile('footprint', ['-p', String(rpid), '--noCategories'], { encoding: 'utf8', timeout: 20000 }, (e, o) => {
      const mb = re => { const x = !e && o && o.match(re); return x ? Math.round(+x[1] * (/GB/.test(x[2]) ? 1024 : /KB/.test(x[2]) ? 1 / 1024 : 1)) : null; };
      res(full ? { foot: mb(/phys_footprint:\s*([\d.]+)\s*(GB|MB|KB)/), peak: mb(/phys_footprint_peak:\s*([\d.]+)\s*(GB|MB|KB)/) } : mb(/phys_footprint:\s*([\d.]+)\s*(GB|MB|KB)/));
    });
  });
  const procNow = () => { const r = {}; try { const rpid = win.webContents.getOSProcessId(); for (const m of app.getAppMetrics()) { if (m.pid === rpid) r.page = Math.round(m.memory.workingSetSize / 1024); else if (m.type === 'GPU') r.gpu = Math.round(m.memory.workingSetSize / 1024); } } catch (e) { /* — */ } return r; };
  async function watchRun () {
    while (WATCH.size) {
      const f = await footNow(), p = procNow();
      for (const w of WATCH.values()) {
        w.n++;
        if (f != null) { if (w.foot0 == null) w.foot0 = f; if (f > w.peak) { w.peak = f; w.peakT = Date.now() - w.t0; } }
        if (p.page > w.page) w.page = p.page;
        if (p.gpu > w.gpu) w.gpu = p.gpu;
      }
    }
    watchLoop = null;
  }
  async function watchMark (raw) {
    const i = raw.indexOf(':'), op = raw.slice(0, i), label = raw.slice(i + 1);
    if (op === 'start') {
      const F = await footNow(true), f = F.foot, p = procNow();
      WATCH.set(label, { foot0: f, peak: f || 0, life0: F.peak, page: p.page || 0, gpu: p.gpu || 0, n: 0, t0: Date.now() });
      if (!watchLoop) watchLoop = watchRun();
      js(`(window.__probeWatchR || (window.__probeWatchR = {}))[${JSON.stringify('start:' + label)}] = true`).catch(() => {});
      return;
    }
    const w = WATCH.get(label);
    WATCH.delete(label);
    const F = await footNow(true), f = F.foot;
    // пик с запуска (phys_footprint_peak) вырос за окно — новый пик был в окне, он и есть пик окна (точно, между опросами тоже);
    // не вырос — пик окна не выше прежнего, берём опросы (exact: false — между опросами мог быть короткий всплеск, но ниже life0)
    const rose = w && F.peak != null && w.life0 != null && F.peak > w.life0;
    const r = w ? { foot0: w.foot0, peak: rose ? Math.max(F.peak, w.peak) : Math.max(w.peak, f || 0), exact: !!rose, sampled: w.peak, peakT: w.peakT || 0, foot1: f,
      life0: w.life0, life1: F.peak, page: w.page, gpu: w.gpu, n: w.n, ms: Date.now() - w.t0 } : { err: 'нет окна ' + label };
    MEMLOG.push({ label: 'watch:' + label, foot: r.foot1, footPeak: r.peak, page: r.page, gpu: r.gpu, win: true });
    js(`(window.__probeWatchR || (window.__probeWatchR = {}))[${JSON.stringify('stop:' + label)}] = ${JSON.stringify(r)}`).catch(() => {});
  }

  /* снимок как видит игрок (автор 23.10: «скрины жёстко заблюренные»). Игра рисует маленький кадр (~1152×720, dynres)
     и растягивает его на экран с image-rendering: pixelated; capturePage окна вне экрана тянет его плавно, а уменьшение
     ещё мылит. Поэтому: (1) кадр игры — прямо из холста (в rAF сразу после отрисовки игры), растянут «ближайшим»;
     (2) интерфейс — два снимка окна без холста, на чёрном и на белом: из разницы — прозрачность каждого пикселя
     хада, и он ложится поверх кадра как в браузере (тексты, полупрозрачные плашки, тени). Холст под фильтром
     (размытие брифа) или кадр не достался — просто снимок окна. --scale: ≥ 1 — целое, < 1 — 1/n */
  const SC = (() => { const s = +arg('scale', 1) || 1; return s >= 1 ? Math.max(1, Math.round(s)) : 1 / Math.max(2, Math.round(1 / s)); })();
  const GRAB = `(async () => {
    const v = document.getElementById('view'); if (!v || !v.width || !v.isConnected) return null;
    const cs = getComputedStyle(v); if ((cs.filter && cs.filter !== 'none') || cs.visibility !== 'visible' || cs.display === 'none' || +cs.opacity < 1) return { skip: 'filter' };
    const c = document.createElement('canvas'); c.width = v.width; c.height = v.height;
    const g = c.getContext('2d', { willReadFrequently: true }); let ok = false;
    for (let i = 0; i < 30 && !ok; i++) {
      await new Promise(r => requestAnimationFrame(() => { try { g.clearRect(0, 0, c.width, c.height); g.drawImage(v, 0, 0); } catch (e) {} r(); }));
      const px = g.getImageData(0, 0, c.width, c.height).data;
      for (let k = 0; k < px.length; k += 4 * 389) if (px[k] | px[k + 1] | px[k + 2]) { ok = true; break; }   // кадр не стёрт (холст без preserveDrawingBuffer)
    }
    if (!ok) return { skip: 'empty' };
    const r = v.getBoundingClientRect();
    return { url: c.toDataURL('image/png'), x: r.left, y: r.top, w: r.width, h: r.height };
  })()`;
  const KEY = col => `(async () => {
    let st = document.getElementById('__probekey');
    if (!st) { st = document.createElement('style'); st.id = '__probekey'; document.head.appendChild(st);
      for (let e = document.getElementById('view').parentElement; e; e = e.parentElement) e.setAttribute('data-probekey', ''); }
    st.textContent = '#view { visibility: hidden !important } [data-probekey] { background: ${col} !important }';
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  })()`;
  const UNKEY = `(() => { const st = document.getElementById('__probekey'); if (st) st.remove(); for (const e of document.querySelectorAll('[data-probekey]')) e.removeAttribute('data-probekey'); })()`;
  const fit = (img, w, h) => { const z = img.getSize(); return z.width === w && z.height === h ? img : img.resize({ width: w, height: h, quality: 'best' }); };
  async function shot (file) {
    const [cw, ch] = win.getContentSize(), TW = Math.round(cw * SC), TH = Math.round(ch * SC);
    let fr = null;
    try { fr = await js(GRAB); } catch (e) { fr = null; }
    let out;
    if (!fr || !fr.url) out = fit(await win.webContents.capturePage(), TW, TH);
    else {
      let B, Wt;
      try { await js(KEY('#000')); await sleep(40); B = await win.webContents.capturePage(); await js(KEY('#fff')); await sleep(40); Wt = await win.webContents.capturePage(); }
      finally { await js(UNKEY).catch(() => {}); }
      const b = fit(B, TW, TH).toBitmap(), w = fit(Wt, TW, TH).toBitmap();
      const F = nativeImage.createFromDataURL(fr.url), fz = F.getSize(), f = F.toBitmap();
      const o = Buffer.alloc(TW * TH * 4);
      // какой пиксель кадра попадает в пиксель снимка — «ближайший»; вне холста — фон 0
      const cx = new Int32Array(TW), cy = new Int32Array(TH), s = TW / cw;
      for (let X = 0; X < TW; X++) { const u = ((X + 0.5) / s - fr.x) / fr.w; cx[X] = u >= 0 && u < 1 ? Math.floor(u * fz.width) : -1; }
      for (let Y = 0; Y < TH; Y++) { const u = ((Y + 0.5) / s - fr.y) / fr.h; cy[Y] = u >= 0 && u < 1 ? Math.floor(u * fz.height) : -1; }
      for (let Y = 0; Y < TH; Y++) {
        const fy = cy[Y];
        for (let X = 0; X < TW; X++) {
          const i = (Y * TW + X) * 4, fx = cx[X], j = fy >= 0 && fx >= 0 ? (fy * fz.width + fx) * 4 : -1;
          for (let k = 0; k < 3; k++) {
            const bk = b[i + k], t = w[i + k] - bk;          // t/255 — сколько хад пропускает (1 — пусто, 0 — плотный)
            const v = bk + (j >= 0 && t > 0 ? t * f[j + k] / 255 : 0);
            o[i + k] = v > 255 ? 255 : v;
          }
          o[i + 3] = 255;
        }
      }
      out = nativeImage.createFromBitmap(o, { width: TW, height: TH });
    }
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, out.toPNG());
    return { w: out.getSize().width, h: out.getSize().height, sharp: !!(fr && fr.url), skip: fr && fr.skip };
  }

  const timer = setTimeout(() => { err('probe: время вышло (--timeout=' + arg('timeout', 360) + ')'); finish(1, { ok: false, timeout: true, errors }); }, +arg('timeout', 360) * 1000);

  const q = ['debug', 'mute', 'nolb', 'lang=' + LANG];
  if (!has('fresh')) q.push('nointro');
  if (has('kids')) q.push('kids');
  if (arg('map')) q.push('map=' + arg('map'));
  if (SZ === 'phone' && !has('turn')) q.push('portrait');   // стоя — без заставки «поверни телефон» (orient.js); --turn — с ней
  if (arg('q')) q.push(arg('q').replace(/^[?&]/, ''));
  const url = 'app://g/' + PAGE + '?' + q.join('&');
  const dbg = win.webContents.debugger;
  if ((has('bootcpu') && +arg('cpu', 1) > 1) || arg('cpuprofile') || rnd || MEM) {
    try {
      await win.loadURL('app://g/__blank').catch(() => {});   // тот же источник: рендерер не сменится при переходе на игру
      dbg.attach('1.3');
      if (has('bootcpu') && +arg('cpu', 1) > 1) await dbg.sendCommand('Emulation.setCPUThrottlingRate', { rate: +arg('cpu') });
      if (rnd || MEM) await dbg.sendCommand('Page.enable');
      if (rnd) await dbg.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: rnd });
      if (MEM) await dbg.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: GLMEM });   // видеопамять — с первого вызова WebGL
      if (arg('cpuprofile')) { await dbg.sendCommand('Profiler.enable'); await dbg.sendCommand('Profiler.setSamplingInterval', { interval: 250 }); await dbg.sendCommand('Profiler.start'); }
    } catch (e) { err('probe: отладчик загрузки:', e.message); }
  }
  /* --mem: пик памяти процессов за весь запуск (раз в 200 мс) — загрузка и поздняя сборка дают пики, которых нет в метках */
  const PEAK = { page: 0, gpu: 0, pageT: 0, gpuT: 0, n: 0 };
  const peakT = MEM ? setInterval(() => {
    try {
      const rpid = win.webContents.getOSProcessId(), t = Date.now() - T0;
      for (const m of app.getAppMetrics()) {
        const v = Math.round(m.memory.workingSetSize / 1024);
        if (m.pid === rpid && v > PEAK.page) { PEAK.page = v; PEAK.pageT = t; }
        if (m.type === 'GPU' && v > PEAK.gpu) { PEAK.gpu = v; PEAK.gpuT = t; }
      }
      PEAK.n++;
    } catch (e) { /* — */ }
  }, 200) : null;
  try { await win.loadURL(url); } catch (e) { err('probe: не открылась', url, e.message); }
  let ok = false;
  const bootWait=+arg('bootwait',240);                // окончательный контур земли строится за меню; смена — только после полной готовности
  for (let i = 0; i < bootWait*10; i++) {
    try { ok = await js(GAME ? `!!(window.__dlv && __dlv.frame && __dlv.S && !document.body.classList.contains('booting')${has('early') ? '' : ' && (!window.__boot || window.__boot.full)'})` : `document.readyState === 'complete' && window.__probeReady !== false`); } catch (e) { /* — */ }
    if (ok) break;
    await sleep(100);
  }
  if (!ok) { err('probe: ' + (GAME ? 'игра' : PAGE) + ' не загрузилась за '+bootWait+' с;', errors.length, 'ошибок:\n  ' + errors.slice(0, 5).join('\n  ')); clearTimeout(timer); return finish(1, { ok: false, loaded: false, errors }); }
  if (arg('cpuprofile')) {
    try { const { profile } = await dbg.sendCommand('Profiler.stop'); fs.writeFileSync(path.resolve(arg('cpuprofile')), JSON.stringify(profile)); err('probe: профиль загрузки →', path.resolve(arg('cpuprofile'))); } catch (e) { err('probe: профиль не снят:', e.message); }
  }
  await js(INSTALL);
  if (arg('sa')) {                                    // --sa=59,21 — вырез по бокам и полоска «домой», как у iPhone боком
    const [l, b] = arg('sa').split(',').map(Number);
    await js(`(() => { const r = document.documentElement.style; r.setProperty('--sa-l', '${+l || 0}px'); r.setProperty('--sa-r', '${+l || 0}px'); r.setProperty('--sa-b', '${+b || 0}px'); })()`);
  }
  await sleep(200);                                   // модули дописывают себя в __dlv через setTimeout 0
  if (+arg('cpu', 1) > 1) {                           // --cpu=3 — как процессор Деки (сборку города не тормозим — только игру)
    try { if (!dbg.isAttached()) dbg.attach('1.3'); await dbg.sendCommand('Emulation.setCPUThrottlingRate', { rate: +arg('cpu') }); } catch (e) { err('probe: --cpu не вышло:', e.message); }
  }
  const tLoad = Date.now() - T0;

  /* --runprofile / --allocprofile — профиль процессора и выборка выделений памяти, пока идёт скрипт
     (хвост кадров: кто тратит время и кто плодит мусор). Разбор — node tools/profsum.cjs файл */
  const RUNP = arg('runprofile'), ALLOCP = arg('allocprofile');
  if (RUNP || ALLOCP) {
    try {
      if (!dbg.isAttached()) dbg.attach('1.3');
      if (RUNP) { await dbg.sendCommand('Profiler.enable'); await dbg.sendCommand('Profiler.setSamplingInterval', { interval: 500 }); await dbg.sendCommand('Profiler.start'); }
      if (ALLOCP) { await dbg.sendCommand('HeapProfiler.enable'); await dbg.sendCommand('HeapProfiler.startSampling', { samplingInterval: 16384, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }); }
    } catch (e) { err('probe: профиль не включился:', e.message); }
  }
  let result, evalErr = null;
  if (CODE) {
    try {
      const out = await js(`(async () => { ${PRELUDE}\n const __r = await (async () => {\n${CODE}\n})();\n return JSON.stringify(__r === undefined ? null : __r); })()`);
      result = JSON.parse(out);
    } catch (e) {
      evalErr = String(e && e.message || e).replace(/^Error: /, '');
      await sleep(50);                                  // синтаксическая ошибка — текст только в консоли страницы
      if (/Script failed to execute/.test(evalErr) && errors.length) evalErr = errors[errors.length - 1];
    }
  }
  const tEval = Date.now() - T0;
  if (RUNP) { try { const { profile } = await dbg.sendCommand('Profiler.stop'); fs.writeFileSync(path.resolve(RUNP), JSON.stringify(profile)); err('probe: профиль скрипта →', path.resolve(RUNP)); } catch (e) { err('probe: профиль не снят:', e.message); } }
  if (ALLOCP) { try { const { profile } = await dbg.sendCommand('HeapProfiler.stopSampling'); fs.writeFileSync(path.resolve(ALLOCP), JSON.stringify(profile)); err('probe: выделения памяти →', path.resolve(ALLOCP)); } catch (e) { err('probe: выделения не сняты:', e.message); } }
  if (+arg('secs', 0) > 0) await sleep(+arg('secs') * 1000);
  const logs = await js('window.__probe.logs').catch(() => []);
  const fstats = await js('window.__probe.stats()').catch(() => null);
  if (arg('shot')) {
    const f = path.resolve(arg('shot'));
    try { const r = await shot(f); err('probe: кадр →', f, r.w + '×' + r.h + (r.sharp ? '' : ' (без растяжки кадра: ' + (r.skip || 'нет холста') + ')')); } catch (e) { err('probe: кадр не снят:', e.message); }
  }
  clearTimeout(timer);

  const cut = s => (MAXC > 0 && s.length > MAXC ? s.slice(0, MAXC) + ` …(обрезано: ${s.length} симв., --max=0 — целиком)` : s);
  for (const l of logs) process.stdout.write('· ' + cut(JSON.stringify(l)) + '\n');
  if (CODE && !evalErr) process.stdout.write(cut(JSON.stringify(result)) + '\n');
  if (evalErr) err('probe: исключение в скрипте:', evalErr);
  if (has('errors') && errors.length) err('ошибки консоли:\n  ' + errors.join('\n  '));
  const total = Date.now() - T0;
  err(`probe: ${MODE}${has('kids') ? ' kids' : ''} ${W}×${H} · ${(total / 1000).toFixed(1)} с (сборка ${b.built ? (b.ms / 1000).toFixed(1) + ' с' : 'свежая'}, загрузка ${((tLoad - tBuild) / 1000).toFixed(1)} с) · кадр p50 ${fstats ? fstats.p50 : '?'} p95 ${fstats ? fstats.p95 : '?'} мс · ошибок консоли ${errors.length}, необработанных ${uncaught}`);
  const code = uncaught || evalErr ? 1 : 0;
  if (peakT) clearInterval(peakT);
  if (MEM) err('probe: память процессов, МБ (страница/видеокарта):', MEMLOG.map(m => m.label + ' ' + m.page + '/' + m.gpu + (m.foot ? ' (след ' + m.foot + ', пик ' + m.footPeak + ')' : '')).join(', ') + (MEMLOG.length ? ', ' : '') + 'пик ' + PEAK.page + ' (на ' + (PEAK.pageT / 1000).toFixed(1) + ' с)/' + PEAK.gpu);
  finish(code, { ok: !code, result, evalErr, errors, uncaught, frames: fstats, logs, mem: MEMLOG, memPeak: MEM ? PEAK : undefined, ms: { total, build: b.built ? b.ms : 0, load: tLoad - tBuild, eval: tEval - tLoad } });
}).catch(e => { err('probe:', e && e.stack || e); finish(1, { ok: false, error: String(e) }); });
