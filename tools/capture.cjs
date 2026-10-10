/* Скриншоты и видео для карточки игры — Электрон вне экрана, машину ведёт автопилот.

   npm run build:yandex && npx electron tools/capture.cjs [--lang=ru] [--video] [--shots] [--mobile]
   Кадры — в media/<lang>/: shot-*.png (1920×1080, мобильные — 1080×1920), clean-*.png
   (без хада — для обложки), video.mp4 (1920×1080, 30 к/с, ≤ 28 с, без звука; нужен ffmpeg).

   Игра открывается собранной (dist/web) с ?debug — так доступна ручка window.__dlv. */
const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const has = k => process.argv.includes('--' + k);
const LANG = arg('lang', 'ru');
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist', arg('dist', 'yandex'));      // яндексовая — мягкий режим, без крови
const OUT = path.join(ROOT, 'media', LANG);
fs.mkdirSync(OUT, { recursive: true });

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* автопилот: руль к точке маршрута в 12 м впереди, газ — пока не близко к гостю */
const AUTOPILOT = `
(() => {
  const D = window.__dlv;
  if (window.__ap) return;
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  window.__ap = { on: true, nitro: false, vmax: 14 };
  const step = () => {
    requestAnimationFrame(step);
    const A = window.__ap, IN = D.IN, V = D.V, S = D.S;
    if (!A.on || !['drive', 'back', 'side'].includes(S.state)) { IN.joy = 0; IN.gas = 0; return; }
    const R = D.route;
    if (!R || R.length < 2) return;
    let tx = R[R.length - 1][0], tz = R[R.length - 1][1], acc = 0;
    for (let i = 1; i < R.length; i++) {
      const l = Math.hypot(R[i][0] - R[i - 1][0], R[i][1] - R[i - 1][1]);
      if (acc + l >= 12) { const k = (12 - acc) / (l || 1); tx = R[i - 1][0] + (R[i][0] - R[i - 1][0]) * k; tz = R[i - 1][1] + (R[i][1] - R[i - 1][1]) * k; break; }
      acc += l;
    }
    // держимся правой полосы: точку сдвигаем вправо от направления пути
    const dx = tx - V.x, dz = tz - V.z, dl = Math.hypot(dx, dz) || 1;
    const lane = S.target && Math.hypot(S.target.x - V.x, S.target.z - V.z) < 25 ? 0 : 2.6;
    tx += dz / dl * -lane; tz += -dx / dl * -lane;
    const diff = wrap(Math.atan2(tx - V.x, tz - V.z) - V.h);
    const sv = Math.max(-1, Math.min(1, diff * 2.0));
    IN.joy = 1; IN.jx = -sv / 1.35;
    const sp = Math.hypot(V.vx, V.vz);
    const left = S.target ? Math.hypot(S.target.x - V.x, S.target.z - V.z) : 99;
    // машина впереди в конусе — тормозим
    const fx = Math.sin(V.h), fz = Math.cos(V.h);
    let block = false;
    for (const t of D.TRAFFIC) { const ax = t.x - V.x, az = t.z - V.z, f = ax * fx + az * fz; if (f > 2 && f < 16 && Math.abs(ax * fz - az * fx) < 2.2) { block = true; break; } }
    const want = block ? 0 : left < 14 ? 3.5 : Math.abs(diff) > 0.45 ? 7 : A.vmax;
    IN.gas = sp < want ? 1 : 0;
    IN.brake = sp > want + 2 ? 1 : 0;
    IN.nitro = A.nitro && Math.abs(diff) < 0.15 && left > 60 ? 1 : 0;
  };
  step();
})();`;

async function main () {
  await app.whenReady();
  protocol.handle('app', req => {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (p === '/' || p === '') p = '/index.html';
    return net.fetch(pathToFileURL(path.join(DIST, p)).toString());
  });
  const mobile = has('mobile');
  const W = mobile ? 1080 : 1920, H = mobile ? 1920 : 1080;
  const win = new BrowserWindow({
    width: W, height: H, show: false, useContentSize: true,
    // телефон — 390 CSS-пикселей в ширину, как у обычного смартфона
    webPreferences: { offscreen: true, backgroundThrottling: false, zoomFactor: mobile ? W / 390 : 1 },
  });
  win.webContents.setFrameRate(30);
  let last = null;
  win.webContents.on('paint', (e, dirty, img) => { last = img; });
  win.webContents.on('console-message', (e, lvl, msg) => { if (lvl >= 2) console.log('[page]', msg); });
  const url = `app://game/index.html?debug&mute&nolb&lang=${LANG}`;
  const js = code => win.webContents.executeJavaScript(code);
  // сохранения до старта: без гайда и без учебного заказа (в нём город пустой и тихий)
  await win.loadURL(url);
  await js(`localStorage.clear(); localStorage.setItem('dlv-msk-guide', '1'); localStorage.setItem('dlv-msk-tut', '"1"'); localStorage.setItem('dlv-msk-nostut', '1'); localStorage.setItem('dlv-msk-xp', '4')`);
  await win.loadURL(url);
  await sleep(4000);
  const shot = async (name) => {
    await sleep(150);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, name + '.png'), img.resize({ width: W, height: H }).toPNG());
    console.log('кадр', name);
  };
  const hud = on => js(`document.body.classList.toggle('shot-clean', ${!on}); (() => { let s = document.getElementById('shot-css'); if (!s) { s = document.createElement('style'); s.id = 'shot-css'; s.textContent = 'body.shot-clean .hud, body.shot-clean #ctrls, body.shot-clean #radar, body.shot-clean #toast, body.shot-clean #bonus, body.shot-clean #guide { display: none !important; }'; document.head.appendChild(s); } })()`);
  // на заставке: имя, «поехали» — первый заказ
  await js(`(() => { const n = document.getElementById('st-name'); n.value = ${JSON.stringify(LANG === 'ru' ? 'Игрок' : 'Player')}; n.dispatchEvent(new Event('input')); localStorage.setItem('dlv-msk-guide', '1'); localStorage.setItem('dlv-msk-tut', '"1"'); localStorage.setItem('dlv-msk-nostut', '1'); })()`);
  if (has('shots') || !has('video')) await shot(mobile ? 'm-title' : 'shot-0-title');
  await js(`document.getElementById('st-go').click()`);
  await sleep(1500);
  if (!has('video')) await shot(mobile ? 'm-order' : 'shot-1-order');

  const STRAIGHT = `(() => { const D = __dlv; if (window.__ap) window.__ap.on = false; D.startPose(); D.V.vx = Math.sin(D.V.h) * 12; D.V.vz = Math.cos(D.V.h) * 12;
    D.V.camX = D.V.x - Math.sin(D.V.h) * 12; D.V.camZ = D.V.z - Math.cos(D.V.h) * 12; D.V.camH = D.V.h; D.IN.joy = 0; D.IN.gas = 1; })()`;
  // вручение: гостя ставим на тротуар впереди справа, машина подкатывает и тормозит
  const deliver = async () => {
    await js(STRAIGHT);
    await js(`(() => { const D = __dlv, V = D.V, p = D.S.target && D.S.target.ped; if (!p) return;
      const fx = Math.sin(V.h), fz = Math.cos(V.h);
      p.x = V.x + fx * 11 + fz * -4.4; p.z = V.z + fz * 11 - fx * -4.4; p.sitAt = null; p.sitting = 0; p.waitAt = null;
      D.S.target.x = p.x; D.S.target.z = p.z; D.S.time = D.S.timeMax; })()`);
    for (let i = 0; i < 60 && (await js(`__dlv.S.state`)) === 'drive'; i++) {
      await js(`(() => { const D = __dlv, d = Math.hypot(D.S.target.x - D.V.x, D.S.target.z - D.V.z), sp = Math.hypot(D.V.vx, D.V.vz);
        D.IN.gas = d > 7 && sp < 8 ? 1 : 0; D.IN.brake = d <= 7 ? 1 : 0; })()`);
      await sleep(80);
    }
    await js(`__dlv.IN.brake = 0`);
    // гость иногда просит «сгоняй за…» — в кадре эта карточка лишняя, отказываемся
    await sleep(250);
    await js(`__dlv.CH.opts.length && __dlv.pickChoice(1)`);
  };

  if (has('video')) {
    // видео: пишем кадры по таймеру — последний отрисованный, 30 в секунду
    const ff = spawn('ffmpeg', ['-y', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', `${W}x${H}`, '-r', '30', '-i', '-',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', '-movflags', '+faststart', path.join(OUT, 'video.mp4')], { stdio: ['pipe', 'ignore', 'inherit'] });
    let frames = 0, stop = false;
    const tick = setInterval(() => {
      if (stop || !last) return;
      const b = last.getSize().width === W ? last : last.resize({ width: W, height: H });
      ff.stdin.write(b.toBitmap());
      frames++;
    }, 1000 / 30);
    // постановка: анкета → проспект с нитро → вручение → вечер → дождь. Всего ~26 с
    await sleep(1800);                                  // анкета заказа в кадре
    await js(`__dlv.acceptOrder()`);                  // накладная и так свернётся сама через ~2,6 с
    await js(AUTOPILOT);
    await sleep(1500);
    await js(`window.__ap.on = false`);
    await js(STRAIGHT); await js(`__dlv.NOS.tank = 1; __dlv.IN.nitro = 1`);
    await sleep(3500);
    await js(`__dlv.IN.nitro = 0`);
    await deliver();
    await sleep(2500);
    await js(`__dlv.S.target = { x: 1e5, z: 1e5, name: '' }; __dlv.ENV.t = 0.8`); await js(STRAIGHT);
    await sleep(5000);
    await js(`__dlv.ENV.t = 0.35; __dlv.ENV.rainWant = 1; __dlv.ENV.rain = 1`); await js(STRAIGHT);
    await sleep(4500);
    await js(`__dlv.ENV.rainWant = 0; __dlv.ENV.rain = 0; __dlv.IN.gas = 0; __dlv.setFullMap(true)`);
    await sleep(2500);
    stop = true; clearInterval(tick);
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
    console.log('видео:', frames, 'кадров,', (frames / 30).toFixed(1), 'с →', path.join(OUT, 'video.mp4'));
    app.quit(); return;
  }

  await js(`__dlv.acceptOrder()`);                  // накладная и так свернётся сама через ~2,6 с
  await js(AUTOPILOT);
  await sleep(5000);
  await shot(mobile ? 'm-drive' : 'shot-2-drive');
  await hud(false); await shot(mobile ? 'm-clean-drive' : 'clean-drive'); await hud(true);
  // дальше — постановка на проспекте у пиццерии: машина едет прямо, автопилот выключен
  await deliver();
  await sleep(900);
  await shot(mobile ? 'm-deliver' : 'shot-3-deliver');
  // маркер адреса уводим подальше: в постановочных кадрах он не нужен
  await js(`__dlv.S.target = { x: 1e5, z: 1e5, name: '' }`);
  // нитро по проспекту
  await sleep(1500);
  await js(STRAIGHT); await js(`__dlv.NOS.tank = 1; __dlv.IN.nitro = 1`);
  await sleep(1600);
  await shot(mobile ? 'm-nitro' : 'shot-4-nitro');
  await js(`__dlv.IN.nitro = 0`);
  // ночь
  await js(`__dlv.ENV.t = 0.84`); await js(STRAIGHT);
  await sleep(2500);
  await shot(mobile ? 'm-night' : 'shot-5-night');
  await hud(false); await shot(mobile ? 'm-clean-night' : 'clean-night'); await hud(true);
  // дождь днём
  await js(`__dlv.ENV.t = 0.35; __dlv.ENV.rainWant = 1; __dlv.ENV.rain = 1`); await js(STRAIGHT);
  await sleep(2500);
  await shot(mobile ? 'm-rain' : 'shot-6-rain');
  await js(`__dlv.ENV.rainWant = 0; __dlv.ENV.rain = 0; __dlv.IN.gas = 0; __dlv.setFullMap(true)`);
  await sleep(800);
  await shot(mobile ? 'm-map' : 'shot-7-map');
  app.quit();
}
main().catch(e => { console.error(e); app.exit(1); });
