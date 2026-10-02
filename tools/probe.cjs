/* probe — «одна команда — ответ»: собранная игра в Электроне вне экрана, скрипт агента
   в странице, JSON на выходе. Окна нет, панель браузера не нужна, кадры идут сами.

   npm run probe -- --js="return d.S.state"
   npm run probe -- --eval=check.js --kids --size=phone --secs=10 --shot=out.png --scale=0.5

   --mode=web|yandex|steam  сборка (web); собирается в os.tmpdir()/bird-probe, только если
                            исходники новее (--rebuild — всегда, --no-build — не собирать)
   --kids                   ?kids (детская версия; на yandex она и так)
   --map=seversk  --lang=ru  --q=a=1&b  — добавки к адресу игры (?debug&mute&nolb&nointro уже есть)
   --fresh                  первый запуск как у новичка: без ?nointro, гайд и учебный заказ не пропущены
   --size=desktop|phone|deck|WxH   1280×720 / 390×844 с касаниями / 1280×800
   --js="код" | --eval=file.js     тело async-функции в странице. Есть: d (= __dlv), wait(ms),
                            until(fn, ms), run(secs, k) — дать игре идти secs секунд (k — ускорение
                            до 3), onShift() — начать смену и принять заказ, ride() — просто кататься,
                            tp(x, z[, h]) — машину на ближайшую дорогу, autopilot(on) — едет по
                            маршруту заказа и принимает следующие, frames() — время кадров
                            {n, p50, p95, max}, log(x) — строка в вывод. return — JSON в stdout
                            smoke(secs) — смена на автопилоте и проверка «игра жива» (едет ≥ 150 м,
                            кадры и часы идут, числа конечные, в конце смена) → { ok, fail, m, ft }
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
  return { ok: !fail.length, fail, m: Math.round(m), frames, clock, env, state: d.S.state, delivered: d.S.delivered || 0, ft: P.stats(f0) };
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
      const dx = tx - V.x, dz = tz - V.z, dl = Math.hypot(dx, dz) || 1;
      const lane = S.target && Math.hypot(S.target.x - V.x, S.target.z - V.z) < 25 ? 0 : 2.6;
      tx += dz / dl * -lane; tz += -dx / dl * -lane;
      const diff = wrap(Math.atan2(tx - V.x, tz - V.z) - V.h), sv = Math.max(-1, Math.min(1, diff * 2));
      IN.joy = 1; IN.jx = -sv / 1.35;
      const sp = Math.hypot(V.vx, V.vz), left = S.target ? Math.hypot(S.target.x - V.x, S.target.z - V.z) : 99;
      const fx = Math.sin(V.h), fz = Math.cos(V.h); let block = false;
      for (const t of D.TRAFFIC) { const ax = t.x - V.x, az = t.z - V.z, f = ax * fx + az * fz; if (f > 2 && f < 16 && Math.abs(ax * fz - az * fx) < 2.2) { block = true; break; } }
      const want = block ? 0 : left < 14 ? 3.5 : Math.abs(diff) > 0.45 ? 7 : A.vmax;
      IN.gas = sp < want ? 1 : 0; IN.brake = sp > want + 2 ? 1 : 0;
    } catch (e) { console.error('[probe autopilot]', e && e.message); A.on = false; }
  };
  raf0(step);
})()`;

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
  const url = 'app://g/index.html?' + q.join('&');
  try { await win.loadURL(url); } catch (e) { err('probe: не открылась', url, e.message); }
  let ok = false;
  for (let i = 0; i < 240; i++) {
    try { ok = await js(`!!(window.__dlv && __dlv.frame && __dlv.S && !document.body.classList.contains('booting'))`); } catch (e) { /* — */ }
    if (ok) break;
    await sleep(100);
  }
  if (!ok) { err('probe: игра не загрузилась за 24 с;', errors.length, 'ошибок:\n  ' + errors.slice(0, 5).join('\n  ')); clearTimeout(timer); return finish(1, { ok: false, loaded: false, errors }); }
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
