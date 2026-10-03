/* probe — «одна команда — ответ»: собранная игра в Электроне вне экрана, скрипт агента
   в странице, JSON на выходе. Окна нет, панель браузера не нужна, кадры идут сами.

   npm run probe -- --js="return d.S.state"
   npm run probe -- --eval=check.js --kids --size=phone --secs=10 --shot=out.png --scale=0.5

   --mode=web|yandex|steam  сборка (web); собирается в os.tmpdir()/bird-probe, только если
                            исходники новее (--rebuild — всегда, --no-build — не собирать)
   --kids                   ?kids (детская версия; на yandex она и так)
   --map=seversk  --lang=ru  --q=a=1&b  — добавки к адресу игры (?debug&mute&nolb&nointro уже есть)
   --fresh                  первый запуск как у новичка: без ?nointro, гайд и учебный заказ не пропущены
   --page=ui.html           другая страница сборки (index.html по умолчанию): ждём не __dlv, а загрузку
                            и window.__probeReady !== false. Песочница интерфейса: --page=ui.html — панель
                            (window.__uilab), --page=ui.html --q=frame — сам экран (window.__ui), docs/SANDBOX.md
   --size=desktop|phone|deck|WxH   1280×720 / 390×844 с касаниями / 1280×800
   --js="код" | --eval=file.js     тело async-функции в странице. Есть: d (= __dlv), wait(ms),
                            until(fn, ms), run(secs, k) — дать игре идти secs секунд (k — ускорение
                            до 3), onShift() — начать смену и принять заказ, ride() — просто кататься,
                            tp(x, z[, h]) — машину на ближайшую дорогу, autopilot(on) — едет по
                            маршруту заказа и принимает следующие, frames() — время кадров
                            {n, p50, p95, max}, log(x) — строка в вывод. return — JSON в stdout
                            smoke(secs) — смена на автопилоте и проверка «игра жива» (едет ≥ 150 м,
                            кадры и часы идут, числа конечные, в конце смена, журнал ошибок пуст)
                            → { ok, fail, m, ft, crash }. Журнал — d.crashlog (docs/CRASHES.md)
   --secs=N                 после скрипта дать игре идти N секунд
   --shot=out.png [--scale=0.5]    кадр в конце
   --errors                 напечатать ошибки консоли (счётчик печатается всегда)
   --console                печатать всю консоль страницы
   --max=4000               обрезать вывод JSON до N символов (0 — целиком)
   --report=file.json       полный отчёт (результат, ошибки, кадры, время) — для tools/check.cjs
   --timeout=120            секунд на всё
   Код выхода: 1 — необработанная ошибка в странице, исключение в скрипте, игра не загрузилась.
   Каждый запуск — с чистым сохранением (своя сессия в памяти и своя папка userData). */
const { app, BrowserWindow, protocol, net, session } = require('electron');
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
const SIZES = { desktop: [1280, 720], phone: [390, 844], deck: [1280, 800] };
const SZ = arg('size', 'desktop');
const [W, H] = SIZES[SZ] || (/^\d+x\d+$/.test(SZ) ? SZ.split('x').map(Number) : SIZES.desktop);
const PHONE = SZ === 'phone';
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
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function finish (code, report) {
  if (arg('report')) { try { fs.writeFileSync(path.resolve(arg('report')), JSON.stringify(report)); } catch (e) { err('probe: отчёт не записан:', e.message); } }
  try { fs.rmSync(UD, { recursive: true, force: true }); } catch (e) { /* — */ }
  app.exit(code);
}

const { PRELUDE, INSTALL } = require('./probe-page.cjs');   // помощники скрипта и автопилот — общие с perf.cjs

app.whenReady().then(async () => {
  const b = ensureBuild(MODE, { force: has('rebuild'), skip: has('no-build') });
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
  // до первой страницы: язык выбран, гайд и учебный заказ пройдены (--fresh — как у новичка)
  const LANG = arg('lang', 'ru');
  const seed = has('fresh') ? { 'dlv-lang': LANG } : { 'dlv-lang': LANG, 'dlv-msk-guide': 1, 'dlv-msk-tut': '1', 'dlv-msk-nostut': 1 };
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
  fs.writeFileSync(pre, `try { const S = ${JSON.stringify(seed)}; for (const k in S) if (localStorage.getItem(k) === null) localStorage.setItem(k, JSON.stringify(S[k])); } catch (e) {}` + touch);

  const win = new BrowserWindow({ width: W, height: H, useContentSize: true, show: false,
    webPreferences: { offscreen: true, backgroundThrottling: false, session: SES, preload: pre, sandbox: false, contextIsolation: !PHONE } });
  win.webContents.setFrameRate(60);
  const errors = [];
  let uncaught = 0;
  win.webContents.on('console-message', (e, level, msg, line, src) => {
    if (has('console') || (level >= 3 && has('errors'))) err('[page]', msg.slice(0, 500));
    if (level >= 3) {
      const un = /^Uncaught/.test(msg);
      if (un) uncaught++;
      if (errors.length < 50) errors.push((un ? '' : '') + msg.slice(0, 400) + (src ? ' @' + String(src).split('/').pop() + ':' + line : ''));
    }
  });
  win.webContents.on('render-process-gone', (e, d) => { err('probe: страница упала:', d.reason); finish(1, { ok: false, crashed: d.reason, errors }); });
  const js = c => win.webContents.executeJavaScript(c, true);

  const timer = setTimeout(() => { err('probe: время вышло (--timeout=' + arg('timeout', 120) + ')'); finish(1, { ok: false, timeout: true, errors }); }, +arg('timeout', 120) * 1000);

  const q = ['debug', 'mute', 'nolb', 'lang=' + LANG];
  if (!has('fresh')) q.push('nointro');
  if (has('kids')) q.push('kids');
  if (arg('map')) q.push('map=' + arg('map'));
  if (arg('q')) q.push(arg('q').replace(/^[?&]/, ''));
  const url = 'app://g/' + PAGE + '?' + q.join('&');
  try { await win.loadURL(url); } catch (e) { err('probe: не открылась', url, e.message); }
  let ok = false;
  for (let i = 0; i < 240; i++) {
    try { ok = await js(GAME ? `!!(window.__dlv && __dlv.frame && __dlv.S && !document.body.classList.contains('booting'))` : `document.readyState === 'complete' && window.__probeReady !== false`); } catch (e) { /* — */ }
    if (ok) break;
    await sleep(100);
  }
  if (!ok) { err('probe: ' + (GAME ? 'игра' : PAGE) + ' не загрузилась за 24 с;', errors.length, 'ошибок:\n  ' + errors.slice(0, 5).join('\n  ')); clearTimeout(timer); return finish(1, { ok: false, loaded: false, errors }); }
  await js(INSTALL);
  await sleep(200);                                   // модули дописывают себя в __dlv через setTimeout 0
  const tLoad = Date.now() - T0;

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
  if (+arg('secs', 0) > 0) await sleep(+arg('secs') * 1000);
  const logs = await js('window.__probe.logs').catch(() => []);
  const fstats = await js('window.__probe.stats()').catch(() => null);
  if (arg('shot')) {
    let img = await win.webContents.capturePage();
    // в CSS-пикселях окна (на ретине кадр вдвое больше — приводим), --scale — ещё меньше
    const sc = +arg('scale', 1) || 1, tw = Math.round(W * sc);
    if (img.getSize().width !== tw) img = img.resize({ width: tw, quality: 'good' });
    const f = path.resolve(arg('shot'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, img.toPNG());
    err('probe: кадр →', f, img.getSize().width + '×' + img.getSize().height);
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
  finish(code, { ok: !code, result, evalErr, errors, uncaught, frames: fstats, logs, ms: { total, build: b.built ? b.ms : 0, load: tLoad - tBuild, eval: tEval - tLoad } });
}).catch(e => { err('probe:', e && e.stack || e); finish(1, { ok: false, error: String(e) }); });
