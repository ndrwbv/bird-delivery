/* Оболочка Electron для Steam и Steam Deck.

   dist/steam отдаётся через схему app:// — так работают fetch, модули и относительные пути
   Vite (base './'). Флаги запуска:
     --windowed        окном 1280×800, а не на весь экран
     --log             консоль рендерера в stdout (для отладки на Deck из Konsole)
     --page=pad.html   открыть другую страницу сборки (диагностика геймпада)
     --steam           считать, что запущены из Steam (обновления с GitHub выключены)
     --no-update       не проверять обновления с GitHub
     --steam-overlay   попытаться включить оверлей Steam (steamworks.js, in-process-gpu)
   Сохранения — localStorage рендерера, он лежит в userData (путь закреплён ниже). */
const { app, BrowserWindow, globalShortcut, Menu, ipcMain, protocol, net, dialog } = require('electron');
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

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

const DIST = path.join(__dirname, '..', 'dist', 'steam');
const log = (...a) => { if (has('--log')) console.log('[electron]', ...a); };

/* ─── запущены ли из Стима ───
   Настоящий запуск из Steam ставит SteamAppId/SteamGameId с 32-битным App ID. У ярлыка
   «сторонней игры» SteamGameId огромный (64-битный id ярлыка) — это наша сборка с GitHub,
   ей обновления нужны. Надёжнее всего — аргумент --steam в Launch Options Steamworks. */
function steamLaunched() {
  if (has('--steam')) return true;
  const id = Number(process.env.SteamAppId || process.env.SteamGameId || 0);
  return id > 0 && id < 2 ** 32;
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
function initSteam() {
  if (!SW) return;
  const id = steamAppId();
  if (!id && !steamLaunched()) { log('steam: нет App ID и не из Стима — пропускаю'); return; }
  try { steam = SW.init(id); log('steam: ок, app', steam.utils.getAppId(), 'deck', steam.utils.isSteamRunningOnSteamDeck()); }
  catch (e) { steam = null; log('steam: init не удался:', e.message); }
}
initSteam();
if (steam && has('--steam-overlay')) { try { SW.electronEnableSteamOverlay(); } catch (e) { log('overlay:', e.message); } }

const safe = fn => { try { return fn(); } catch (e) { log('steam:', e.message); return null; } };

ipcMain.on('steam:boot', e => {
  e.returnValue = {
    available: !!steam,
    deck: !!(steam && safe(() => steam.utils.isSteamRunningOnSteamDeck())) || process.env.SteamDeck === '1',
    launched: steamLaunched(),
    lang: steam ? safe(() => steam.apps.currentGameLanguage()) || '' : '',
    name: steam ? safe(() => steam.localplayer.getName()) || '' : '',
  };
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
  try { return await steam.utils.showGamepadTextInput(0, 0, String(desc || ''), max || 24, text || ''); }
  catch (err) { log('textInput:', err.message); return null; }
});

/* ─── обновление с GitHub ───
   Только для сборки, поставленной tools/install-deck.sh: он кладёт в папку метку .github-install.
   Сравниваем тег, запечённый CI в electron/build-tag.json, с последним релизом и, если игрок
   согласен, запускаем тот же install-deck.sh поверх. В Steam обновляет сам Steam.
   REPO — репозиторий с релизами; его ещё надо создать (см. docs/STEAM.md). */
const REPO = 'ndrwbv/bird-delivery';
const INSTALLER = `https://raw.githubusercontent.com/${REPO}/main/tools/install-deck.sh`;
const installDir = () => path.dirname(process.execPath);

function buildInfo() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'build-tag.json'), 'utf8')); }
  catch (e) { return {}; }
}
const buildTag = () => buildInfo().tag || '';
function updatable() {
  if (!app.isPackaged || process.platform !== 'linux' || steamLaunched()) return false;
  if (has('--no-update') || process.env.BIRD_NO_UPDATE) return false;
  if (!fs.existsSync(path.join(installDir(), '.github-install'))) return false;
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
    return j && j.tag_name ? { tag: j.tag_name, notes: (j.body || '').slice(0, 400) } : null;
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
  if (!updatable()) return { state: 'available', current: cur, latest: rel.tag };
  const ru = RU();
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    title: ru ? 'Обновление' : 'Update',
    message: (ru ? 'Вышла версия ' : 'New version ') + rel.tag,
    detail: (rel.notes ? rel.notes + '\n\n' : '') + (ru
      ? `Установлена ${cur}. Обновить сейчас? Игра закроется и запустится заново.`
      : `Installed: ${cur}. Update now? The game will restart.`),
    buttons: ru ? ['Обновить', 'Потом'] : ['Update', 'Later'],
    defaultId: 0, cancelId: 1, noLink: true,
  });
  if (response !== 0) return { state: 'declined', current: cur, latest: rel.tag };
  applyUpdate();
  return { state: 'updating', current: cur, latest: rel.tag };
}

function applyUpdate() {
  // ждём, пока процесс отпустит папку, и ставим поверх тем же скриптом, что и в первый раз
  const sh = spawn('bash', ['-c', 'sleep 2; curl -fsSL "$BIRD_INSTALLER" | bash -s -- --dir "$BIRD_DIR" --no-desktop --run'], {
    env: { ...process.env, BIRD_INSTALLER: INSTALLER, BIRD_DIR: installDir() }, detached: true, stdio: 'ignore',
  });
  sh.unref();
  setTimeout(() => app.quit(), 300);
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
ipcMain.handle('update:apply', () => { if (!updatable()) return false; applyUpdate(); return true; });
ipcMain.handle('app:quit', () => { setTimeout(() => app.quit(), 50); return true; });
ipcMain.handle('win:fullscreen', (e, on) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.setFullScreen(!!on); return !!(w && w.isFullScreen()); });
ipcMain.handle('win:isFullscreen', e => { const w = BrowserWindow.fromWebContents(e.sender); return !!(w && w.isFullScreen()); });

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
  // ссылки наружу — не внутри игры: в Стиме их открывать некуда
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) e.preventDefault(); });

  const pageArg = argv.find(a => a.startsWith('--page='));
  win.loadURL(`app://birdpizza/${pageArg ? pageArg.slice(7) : 'index.html'}`);
  // тихая проверка обновления через пару секунд после старта, чтобы не мешать загрузке
  if (updatable()) setTimeout(() => checkUpdate(win, false).catch(() => {}), 2500);
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
