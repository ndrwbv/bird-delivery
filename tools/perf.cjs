/* Замер кадра на карте: npm run build:web && npx electron tools/perf.cjs --map=seversk
   Ставит машину в несколько точек, 3 с ездит прямо, печатает fps, вызовы и треугольники. */
const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const DIST = path.join(__dirname, '..', 'dist', arg('dist', 'web'));
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('js-flags', '--expose-gc');
const sleep = ms => new Promise(r => setTimeout(r, ms));
app.whenReady().then(async () => {
  protocol.handle('app', req => { let p = decodeURIComponent(new URL(req.url).pathname); if (p === '/' || p === '') p = '/index.html'; return net.fetch(pathToFileURL(path.join(DIST, p)).toString()); });
  const win = new BrowserWindow({ width: 1280, height: 720, show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
  win.webContents.setFrameRate(60);
  win.webContents.on('console-message', (e, l, m) => { if (l >= 2) console.log('[page]', m); });
  const js = c => win.webContents.executeJavaScript(c);
  const t0 = Date.now();
  await win.loadURL(`app://g/index.html?debug&mute&nolb&lang=ru&map=${arg('map', 'moscow')}`);
  for (let i = 0; i < 60 && !(await js('!!window.__dlv')); i++) await sleep(250);
  console.log('загрузка до игры', Date.now() - t0, 'мс; сборка города', Math.round(await js('__dlv.BUILD_MS')), 'мс; треугольников статики', await js('__dlv.BUILD_T.tris'), '; земля', await js('__dlv.BUILD_T.ground'), 'мс');
  await js(`document.getElementById('st-ride').click()`);
  await sleep(1500);
  const pts = await js(`(() => { const C = __dlv.CITY, B = C.buildings; const cen = p => p.reduce((a, q) => [a[0] + q[0] / p.length, a[1] + q[1] / p.length], [0, 0]);
    const one = (f, i) => { const a = B.filter(f); return a.length ? cen(a[Math.min(i, a.length - 1)].p) : null; };
    return [__dlv.PIZZA ? [__dlv.PIZZA.x, __dlv.PIZZA.z] : [0, 0], one(b => b.st === 'panel', 40), one(b => b.st === 'stalin', 80), one(b => b.k === 'ind', 200), one(b => b.k === 'gar', 100), one(b => b.lv >= 5, 30)].filter(Boolean); })()`);
  for (const [x, z] of pts) {
    await js(`(() => { const D = __dlv, r = D.nearestRoad(${x}, ${z}, 5, 4); if (r) { D.V.x = r.x; D.V.z = r.z; D.V.h = Math.atan2(r.seg.x2 - r.seg.x1, r.seg.z2 - r.seg.z1); } D.V.y = D.surfaceAt(D.V.x, D.V.z); D.V.camX = D.V.x; D.V.camZ = D.V.z; D.IN.gas = 1; })()`);
    await sleep(1500);
    const r = await js(`new Promise(res => { let n = 0, worst = 0, last = performance.now(); const t0 = last; const f = now => { n++; worst = Math.max(worst, now - last); last = now; if (now - t0 < 3000) requestAnimationFrame(f); else res({ fps: +(n / 3).toFixed(1), worst: Math.round(worst), calls: __dlv.renderer.info.render.calls, tris: __dlv.renderer.info.render.triangles, geo: __dlv.renderer.info.memory.geometries }); }; requestAnimationFrame(f); })`);
    console.log([Math.round(x), Math.round(z)], JSON.stringify(r));
  }
  console.log('размеры', await js(`JSON.stringify({ raised: __dlv.RAISED.size, solids: __dlv.SOLIDS.length, sgrid: __dlv.SOLID_GRID.size, smash: __dlv.SMASH.length, traffic: __dlv.TRAFFIC.length, people: __dlv.PEOPLE.length, props: __dlv.PROPS.length, meshes: (() => { let n = 0, v = 0; __dlv.scene.traverse(o => { if (o.isMesh) { n++; const p = o.geometry.attributes.position; if (p && p.array) v += p.array.length; } }); return { n, floatsInJs: v }; })() })`));
  await js('window.gc && gc()'); await sleep(500);
  console.log('JS heap после сборки', await js(`Math.round(performance.memory.usedJSHeapSize / 1048576)`), 'МБ');
  const heap = await js(`performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1`);
  console.log('JS heap', heap, 'МБ');
  app.quit();
});
