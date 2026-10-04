/* Оболочка Electron для Steam и Steam Deck.

   dist/steam отдаётся через схему app:// — так работают fetch, модули и относительные пути
   Vite (base './'). Флаги запуска:
     --windowed        окном 1280×800, а не на весь экран
     --log             консоль рендерера в stdout (для отладки на Deck из Konsole)
     --page=pad.html   открыть другую страницу сборки (диагностика геймпада)
     --steam           считать, что запущены из Steam (обновления с GitHub выключены)
     --no-update       не проверять обновления с GitHub
     --steam-overlay   попытаться включить оверлей Steam (steamworks.js, in-process-gpu)
     --no-steam-lb     без таблиц лидеров Стима (только локальная) — если они мешают
     --no-vsync        кадры без ожидания вертикальной развёртки и без ограничения 60 fps —
                       проверка плавности на Deck (docs/STEAM.md, «Производительность»)
   Сохранения — localStorage рендерера, он лежит в userData (путь закреплён ниже). */
const { app, BrowserWindow, globalShortcut, Menu, ipcMain, protocol, net, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');

const NAME = 'BirdPizza';
const TITLE = 'Птица Пицца';
const argv = process.argv;
const has = f => argv.includes(f);

/* userData закрепляем явно, чтобы путь не зависел от productName в package.json и совпадал
   с настройкой Steam Cloud: %APPDATA%\BirdPizza, ~/.config/BirdPizza,
   ~/Library/Application Support/BirdPizza. */
app.setName(NAME);
app.setPath('userData', path.join(app.getPath('appData'), NAME));

/* SteamOS: распакованная сборка без setuid-бита на chrome-sandbox — без этого Electron не стартует */
if (process.platform === 'linux') { app.commandLine.appendSwitch('no-sandbox'); app.commandLine.appendSwitch('disable-gpu-sandbox'); }
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
// звук без жеста пользователя: в Стиме кликать «чтобы включить звук» некому
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
/* Проба для Деки, только по флагу: Chromium на Linux тактует кадры своим таймером, и под
   gamescope он может расходиться с настоящей развёрсткой экрана — fps 60, а картинка
   подрагивает. С --no-vsync кадры идут без ожидания развёртки, а показывает их уже gamescope.
   Батарею ест сильнее; включать по умолчанию — только если на Деке это заметно лучше */
if (has('--no-vsync')) { app.commandLine.appendSwitch('disable-gpu-vsync'); app.commandLine.appendSwitch('disable-frame-rate-limit'); }

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

const DIST = path.join(__dirname, '..', 'dist', 'steam');
const log = (...a) => { if (has('--log')) console.log('[electron]', ...a); };

/* ─── запущены ли из Стима ───
   Настоящий запуск из Steam ставит SteamAppId/SteamGameId с App ID магазина — он меньше 2³¹.
   У ярлыка «сторонней игры» (Add a Non-Steam Game) SteamAppId — id ярлыка с поднятым старшим
   битом (≥ 2³¹), а SteamGameId — 64-битный: это наша сборка с GitHub, ей обновления нужны.
   Раньше порог был 2³², и ярлык на Деке считался Стимом — обновление не предлагалось.
   Надёжнее всего — аргумент --steam в Launch Options Steamworks. */
function steamLaunched() {
  if (has('--steam')) return true;
  const id = Number(process.env.SteamAppId || process.env.SteamGameId || 0);
  return id > 0 && id < 2 ** 31;
}

/* ─── Steamworks (необязательно) ───
   steamworks.js — нативный модуль; если его нет в сборке или Steam не запущен, игра работает
   без достижений. App ID: STEAM_APP_ID, иначе steam_appid.txt (рядом с exe, в cwd, в корне
   проекта), иначе Steam сам передаёт его при запуске из библиотеки. */
let SW = null, steam = null;
try { SW = require('steamworks.js'); } catch (e) { log('steamworks.js нет:', e.message); }

function steamAppId() {
  const env = Number(process.env.STEAM_APP_ID || 0);
  if (env) return env;
  for (const d of [path.dirname(process.execPath), process.cwd(), path.join(__dirname, '..')]) {
    try { const n = Number(fs.readFileSync(path.join(d, 'steam_appid.txt'), 'utf8').trim()); if (n) return n; } catch (e) { /* — */ }
  }
  return undefined;
}
/* steamworks.js в init() сам заводит setInterval(runCallbacks, 33 мс) — ловим этот таймер,
   чтобы таблицы лидеров (steamlb.cjs) могли на время своих запросов разбирать очередь Стима сами */
let swTick = null, swTimer = null;
function initSteam() {
  if (!SW) return;
  const id = steamAppId();
  if (!id && !steamLaunched()) { log('steam: нет App ID и не из Стима — пропускаю'); return; }
  const realSI = global.setInterval;
  global.setInterval = function (fn, ms, ...rest) {
    const h = realSI.call(this, fn, ms, ...rest);
    if (!swTick && typeof fn === 'function') { swTick = fn; swTimer = h; }
    return h;
  };
  try { steam = SW.init(id); log('steam: ок, app', steam.utils.getAppId(), 'deck', steam.utils.isSteamRunningOnSteamDeck()); }
  catch (e) { steam = null; log('steam: init не удался:', e.message); }
  finally { global.setInterval = realSI; }
}
initSteam();

/* ─── таблицы лидеров Стима (electron/steamlb.cjs, docs/STEAM.md §4.2) ───
   koffi + steam_api из steamworks.js. Не поднялось (нет koffi, нет Стима, --no-steam-lb) —
   игра берёт локальную таблицу. Очередь Стима: пока таблица ждёт ответа — разбирает она,
   иначе steamworks.js, как раньше. Открыта экранная клавиатура — всегда steamworks.js. */
let LB = null, textOpen = false;
if (steam && swTick && !has('--no-steam-lb')) {
  try { LB = require('./steamlb.cjs').create({ log }); } catch (e) { LB = null; log('lb:', e.message); }
  if (LB) {
    clearInterval(swTimer);
    setInterval(() => {
      try { if (LB.busy() && !textOpen) LB.pump(); else swTick(); }
      catch (e) { log('steam: очередь:', e.message); }
    }, 1000 / 30);
  }
}
if (steam && has('--steam-overlay')) { try { SW.electronEnableSteamOverlay(); } catch (e) { log('overlay:', e.message); } }

const safe = fn => { try { return fn(); } catch (e) { log('steam:', e.message); return null; } };

ipcMain.on('steam:boot', e => {
  e.returnValue = {
    available: !!steam,
    deck: !!(steam && safe(() => steam.utils.isSteamRunningOnSteamDeck())) || process.env.SteamDeck === '1',
    launched: steamLaunched(),
    lang: steam ? safe(() => steam.apps.currentGameLanguage()) || '' : '',
    name: steam ? safe(() => steam.localplayer.getName()) || '' : '',
    lb: !!LB,                                      // таблицы лидеров Стима работают
  };
});
// таблица лидеров: null — Стим не ответил (игра возьмёт локальную)
ipcMain.handle('steam:lbUpload', async (e, name, score, details) => {
  if (!LB) return null;
  try { return await LB.upload(String(name), Math.round(+score || 0), Array.isArray(details) ? details : []); }
  catch (err) { log('lb upload:', err.message); return null; }
});
ipcMain.handle('steam:lbEntries', async (e, name, kind, from, to) => {
  if (!LB) return null;
  try { return await LB.entries(String(name), String(kind), from | 0, to | 0); }
  catch (err) { log('lb entries:', err.message); return null; }
});
ipcMain.handle('steam:achievement', (e, id) => !!(steam && safe(() => steam.achievement.activate(String(id)))));
ipcMain.handle('steam:achieved', (e, id) => !!(steam && safe(() => steam.achievement.isActivated(String(id)))));
ipcMain.handle('steam:clearAchievement', (e, id) => !!(steam && safe(() => steam.achievement.clear(String(id)))));
ipcMain.handle('steam:getStat', (e, name) => steam ? safe(() => steam.stats.getInt(String(name))) : null);
ipcMain.handle('steam:setStat', (e, name, v) => !!(steam && safe(() => steam.stats.setInt(String(name), Math.round(+v || 0)) && steam.stats.store())));
ipcMain.handle('steam:richPresence', (e, k, v) => { if (steam) safe(() => steam.localplayer.setRichPresence(String(k), v == null ? null : String(v))); return !!steam; });
// экранная клавиатура Steam (Big Picture / Deck): вернёт текст или null, если отменили или не вышло
ipcMain.handle('steam:textInput', async (e, desc, max, text) => {
  if (!steam) return null;
  textOpen = true;                                 // её колбэк ждёт steamworks.js — очередь не трогаем
  try { return await steam.utils.showGamepadTextInput(0, 0, String(desc || ''), max || 24, text || ''); }
  catch (err) { log('textInput:', err.message); return null; }
  finally { textOpen = false; }
});

/* плавающая клавиатура Стима над полем ввода (поле в фокусе, буквы приходят нажатиями клавиш):
   Стим есть — showFloatingGamepadTextInput; не поднялась или Стима нет (ярлык «сторонней игры»
   на Деке) — steam://open/keyboard, его понимает сам клиент Стима на Деке и в Big Picture */
ipcMain.handle('steam:floatKeyboard', async (e, x, y, w, h) => {
  if (steam) {
    try { if (await steam.utils.showFloatingGamepadTextInput(0, x | 0, y | 0, w | 0, h | 0)) return 'float'; }
    catch (err) { log('floatKeyboard:', err.message); }
  }
  if (process.platform === 'linux') { try { await shell.openExternal('steam://open/keyboard'); return 'url'; } catch (err) { log('keyboard url:', err.message); } }
  return '';
});

/* ─── обновление с GitHub ───
   Только для сборок, поставленных с GitHub мимо Steam (в Steam обновляет сам Steam):
   • Linux / Deck — tools/install-deck.sh, он кладёт в папку метку .github-install;
     обновление — тот же install-deck.sh поверх. Распакованный руками архив (без метки) тоже
     обновляется: рядом с exe есть resources/app.asar — это наша папка, install-deck.sh сносит
     только такую (чужую не тронет).
   • Windows — установщик bird-pizza-setup.exe (NSIS из electron-builder, build.nsis в package.json).
     Признак — его деинсталлятор «Uninstall BirdPizza.exe» рядом с exe: установщик кладёт его
     всегда, в какую бы папку ни встал, а в zip для Steam его нет. Обновление — качаем свежий
     setup.exe во временную папку, игра закрывается, установщик с --updated встаёт поверх
     (окошко с полоской, без вопросов) и сам запускает игру снова.
   Сравниваем тег, запечённый CI в electron/build-tag.json, с последним релизом. С 04.10.2026 окна
   «Вышла версия» при старте нет (в игровом режиме Деки оно могло не показаться): игра сама спрашивает
   update:latest и рисует на первом экране меню плашку «есть новая версия — обновить», по ней —
   update:apply. Ход скачивания — событием update:progress. REPO — репозиторий с релизами (docs/STEAM.md). */
const REPO = 'ndrwbv/bird-delivery';
const INSTALLER = `https://raw.githubusercontent.com/${REPO}/main/tools/install-deck.sh`;
const SETUP = 'bird-pizza-setup.exe';
const installDir = () => path.dirname(process.execPath);

function buildInfo() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'build-tag.json'), 'utf8')); }
  catch (e) { return {}; }
}
const buildTag = () => buildInfo().tag || '';
function githubInstall() {
  if (process.platform === 'linux') return fs.existsSync(path.join(installDir(), '.github-install'))
    || (fs.existsSync(path.join(installDir(), 'resources', 'app.asar')) && fs.existsSync(process.execPath));
  // NSIS называет деинсталлятор по productName, как и сам exe: BirdPizza.exe → «Uninstall BirdPizza.exe»
  if (process.platform === 'win32') return fs.existsSync(path.join(installDir(), `Uninstall ${path.basename(process.execPath, '.exe')}.exe`));
  return false;
}
function updatable() {
  if (!app.isPackaged || steamLaunched()) return false;
  if (has('--no-update') || process.env.BIRD_NO_UPDATE) return false;
  if (!githubInstall()) return false;
  try { fs.accessSync(installDir(), fs.constants.W_OK); } catch (e) { return false; }
  return !!buildTag();
}

async function latestRelease() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'birdpizza-updater' }, signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || !j.tag_name) return null;
    const setup = (j.assets || []).find(a => a && a.name === SETUP);
    return { tag: j.tag_name, notes: (j.body || '').slice(0, 400), setup: setup ? setup.browser_download_url : '' };
  } catch (e) { return null; }
  finally { clearTimeout(timer); }
}

const RU = () => /^(ru|uk|be|kk)/i.test(app.getLocale());
/* manual=true — игрок сам нажал «проверить обновления»: отвечаем и когда всё свежее */
async function checkUpdate(win, manual) {
  if (!updatable() && !manual) return { state: 'off' };
  const cur = buildTag();
  const rel = await latestRelease();
  if (!rel) return { state: 'error', current: cur };
  if (!cur || rel.tag === cur) return { state: 'fresh', current: cur, latest: rel.tag };
  // в релизе нет установщика под Windows — предлагать нечего
  if (process.platform === 'win32' && !rel.setup) return { state: 'error', current: cur, latest: rel.tag };
  if (!updatable()) return { state: 'available', current: cur, latest: rel.tag };
  const ru = RU();
  const win32 = process.platform === 'win32';
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    title: ru ? 'Обновление' : 'Update',
    message: (ru ? 'Вышла версия ' : 'New version ') + rel.tag,
    detail: (rel.notes ? rel.notes + '\n\n' : '') + (ru
      ? `Установлена ${cur}. Обновить сейчас? ` + (win32
        ? 'Новая версия скачается в фоне (около 110 МБ, полоска на значке в панели задач), потом игра закроется, обновится и запустится заново.'
        : 'Игра закроется и запустится заново.')
      : `Installed: ${cur}. Update now? ` + (win32
        ? 'The new version downloads in the background (~110 MB), then the game closes, updates and restarts.'
        : 'The game will restart.')),
    buttons: ru ? ['Обновить', 'Потом'] : ['Update', 'Later'],
    defaultId: 0, cancelId: 1, noLink: true,
  });
  if (response !== 0) return { state: 'declined', current: cur, latest: rel.tag };
  applyUpdate(win, rel);
  return { state: 'updating', current: cur, latest: rel.tag };
}

/* без окон: что стоит, что вышло, можно ли обновиться отсюда. Ответ GitHub — на 10 минут */
let relCache = null, relAt = 0;
async function latestInfo(force) {
  const cur = buildTag();
  const base = { current: cur, updatable: updatable(), platform: process.platform, steam: steamLaunched() };
  if (!app.isPackaged || steamLaunched() || has('--no-update') || process.env.BIRD_NO_UPDATE) return { ...base, state: 'off' };
  if (force || !relCache || Date.now() - relAt > 600e3) { const r = await latestRelease(); if (r) { relCache = r; relAt = Date.now(); } else if (force || !relCache) return { ...base, state: 'error' }; }
  const rel = relCache;
  if (!cur || rel.tag === cur) return { ...base, state: 'fresh', latest: rel.tag };
  if (process.platform === 'win32' && !rel.setup) return { ...base, state: 'error', latest: rel.tag };
  return { ...base, state: 'newer', latest: rel.tag, notes: rel.notes };
}
const progress = (win, d) => { try { if (win && !win.isDestroyed()) win.webContents.send('update:progress', d); } catch (e) { /* — */ } };

function applyUpdate(win, rel) {
  if (!rel) rel = relCache;
  if (process.platform === 'win32') { applyUpdateWin(win, rel); return; }
  progress(win, { stage: 'restart' });
  // ждём, пока процесс отпустит папку, и ставим поверх тем же скриптом, что и в первый раз
  const sh = spawn('bash', ['-c', 'sleep 2; curl -fsSL "$BIRD_INSTALLER" | bash -s -- --dir "$BIRD_DIR" --no-desktop --run'], {
    env: { ...process.env, BIRD_INSTALLER: INSTALLER, BIRD_DIR: installDir() }, detached: true, stdio: 'ignore',
  });
  sh.unref();
  setTimeout(() => app.quit(), 300);
}

/* Windows: setup.exe качаем сами (net.fetch — без пометки «из интернета», так что SmartScreen
   не спрашивает), пока игра идёт; ход — полоской на значке в панели задач. Потом запускаем его
   отдельным процессом и выходим: --updated — тихо дождаться выхода игры, не спрашивать «закрыть?»
   и не возвращать удалённый ярлык; --force-run — запустить игру после установки.
   Не скачалось — окошко с ошибкой, игра остаётся открытой; ссылок наружу не даём (правило Steam). */
let updatingWin = false;
async function applyUpdateWin(win, rel) {
  if (updatingWin) return;
  updatingWin = true;
  const bar = p => { try { if (win && !win.isDestroyed()) win.setProgressBar(p); } catch (e) { /* — */ } };
  const file = path.join(app.getPath('temp'), SETUP);
  try {
    if (!rel) rel = await latestRelease();
    if (!rel || !rel.setup) throw new Error('no ' + SETUP + ' in the latest release');
    const r = await net.fetch(rel.setup, { headers: { 'user-agent': 'birdpizza-updater' } });
    if (!r.ok || !r.body) throw new Error('HTTP ' + r.status);
    const total = Number(r.headers.get('content-length')) || 0;
    const out = fs.createWriteStream(file);
    const closed = new Promise((res, rej) => { out.on('finish', res); out.on('error', rej); });
    const reader = r.body.getReader();
    let got = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        got += value.length;
        if (!out.write(value)) await Promise.race([new Promise(res => out.once('drain', res)), closed]);
        if (total) { bar(got / total); progress(win, { stage: 'download', p: got / total }); }
      }
    } finally { out.end(); }
    await closed;
    if ((total && got !== total) || got < 1e6) throw new Error(`download cut short: ${got} of ${total || '?'} bytes`);
    bar(-1);
    progress(win, { stage: 'restart' });
    spawn(file, ['--updated', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 300);
  } catch (e) {
    log('update:', e.message);
    updatingWin = false;
    bar(-1);
    progress(win, { stage: 'error', msg: e.message });
    const ru = RU();
    dialog.showMessageBox(win && !win.isDestroyed() ? win : undefined, {
      type: 'error',
      title: ru ? 'Обновление' : 'Update',
      message: ru ? 'Не получилось скачать обновление' : 'Could not download the update',
      detail: (ru ? 'Проверь интернет и попробуй позже — игра предложит снова при следующем запуске.\n\n'
        : 'Check your connection and try later — the game will offer it again next launch.\n\n') + e.message,
      buttons: ['OK'], noLink: true,
    }).catch(() => {});
  }
}

ipcMain.handle('app:info', () => {
  const b = buildInfo();
  return {
    tag: b.tag || '', sha: b.sha || '', date: b.date || '', version: app.getVersion(),
    platform: process.platform, packaged: app.isPackaged, updatable: updatable(),
    steamLaunched: steamLaunched(), steam: !!steam, userData: app.getPath('userData'),
  };
});
ipcMain.handle('update:check', (e, manual) => checkUpdate(BrowserWindow.fromWebContents(e.sender), !!manual));
ipcMain.handle('update:latest', (e, force) => latestInfo(!!force));
ipcMain.handle('update:apply', e => { if (!updatable()) return false; applyUpdate(BrowserWindow.fromWebContents(e.sender)); return true; });
ipcMain.handle('app:quit', () => { setTimeout(() => app.quit(), 50); return true; });
ipcMain.handle('win:fullscreen', (e, on) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.setFullScreen(!!on); return !!(w && w.isFullScreen()); });
ipcMain.handle('win:isFullscreen', e => { const w = BrowserWindow.fromWebContents(e.sender); return !!(w && w.isFullScreen()); });

/* ─── журнал ошибок (docs/CRASHES.md) ───
   Рендерер (src/platform/crashlog.js) шлёт по строке JSON на запись; сюда же — зависание
   рендерера и его падение. Файл в день: userData/logs/crash-ГГГГ-ММ-ДД.log, не больше 1 МБ,
   хранятся 7 последних файлов. На Деке — ~/.config/BirdPizza/logs. */
const LOG_DIR = () => path.join(app.getPath('userData'), 'logs');
const LOG_MAX = 1024 * 1024, LOG_KEEP = 7;
let logPruned = false;
function crashWrite(line) {
  try {
    const dir = LOG_DIR();
    fs.mkdirSync(dir, { recursive: true });
    if (!logPruned) {
      logPruned = true;
      const old = fs.readdirSync(dir).filter(f => /^crash-\d{4}-\d\d-\d\d\.log$/.test(f)).sort();
      for (const f of old.slice(0, Math.max(0, old.length - LOG_KEEP + 1))) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* — */ } }
    }
    const d = new Date(), day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const file = path.join(dir, 'crash-' + day + '.log');
    let size = 0; try { size = fs.statSync(file).size; } catch (e) { /* — */ }
    if (size > LOG_MAX) return;
    fs.appendFileSync(file, String(line).replace(/\n/g, ' ').slice(0, 20000) + '\n');
  } catch (e) { log('crashlog:', e.message); }
}
const crashMain = (kind, msg) => crashWrite(JSON.stringify({ kind, where: 'electron', msg, n: 1, first: new Date().toISOString(), last: new Date().toISOString(), snap: { build: buildTag() || app.getVersion(), platform: process.platform } }));
ipcMain.on('log:write', (e, line) => crashWrite(line));
ipcMain.handle('log:dir', () => LOG_DIR());
ipcMain.handle('log:open', async () => { try { fs.mkdirSync(LOG_DIR(), { recursive: true }); return !(await shell.openPath(LOG_DIR())); } catch (e) { return false; } });

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 640, minHeight: 400,
    fullscreen: !has('--windowed'),
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    title: TITLE,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, preload: path.join(__dirname, 'preload.cjs') },
  });
  if (has('--log')) {
    win.webContents.on('console-message', (e, level, msg) => console.log('[renderer]', msg));
    win.webContents.on('did-finish-load', () => log('loaded', win.webContents.getURL()));
    win.webContents.on('render-process-gone', (e, d) => log('renderer gone', d.reason));
    win.webContents.on('did-fail-load', (e, code, desc, url) => log('fail', code, desc, url));
  }
  // зависание и падение страницы — в журнал (рендерер сам записать не успеет)
  win.webContents.on('unresponsive', () => crashMain('freeze', 'renderer unresponsive (страница не отвечает)'));
  win.webContents.on('responsive', () => crashMain('info', 'renderer responsive again'));
  win.webContents.on('render-process-gone', (e, d) => crashMain('crash', 'renderer gone: ' + (d && d.reason) + ' ' + (d && d.exitCode)));
  // ссылки наружу — не внутри игры: в Стиме их открывать некуда
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) e.preventDefault(); });

  const pageArg = argv.find(a => a.startsWith('--page='));
  win.loadURL(`app://birdpizza/${pageArg ? pageArg.slice(7) : 'index.html'}`);
  // обновление: окна при старте нет — игра сама спросит update:latest и покажет плашку в меню
  const toggle = () => { if (win.isFocused()) win.setFullScreen(!win.isFullScreen()); };
  globalShortcut.register('F11', toggle);
  globalShortcut.register('Alt+Enter', toggle);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
  Menu.setApplicationMenu(null);
  app.whenReady().then(() => {
    protocol.handle('app', req => {
      const u = new URL(req.url);
      let p = decodeURIComponent(u.pathname);
      if (p === '/' || p === '') p = '/index.html';
      const file = path.normalize(path.join(DIST, p));
      if (!file.startsWith(DIST)) return new Response('forbidden', { status: 403 });
      if (!fs.existsSync(file)) return new Response('not found: ' + p, { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
    if (!fs.existsSync(path.join(DIST, 'index.html'))) log('нет dist/steam/index.html — сначала npm run build:steam');
    createWindow();
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());
}
