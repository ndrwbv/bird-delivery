/* Экскурсия по карте для глаз: npx electron tools/tour.cjs --map=seversk
   Ставит машину на ближайшую дорогу лицом к объекту и снимает кадр в
   media/tour-<map>/<имя>.png. Список объектов — ниже (SPOTS). */
const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path'); const fs = require('fs'); const { pathToFileURL } = require('url');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const MAP = arg('map', 'seversk'), DIST = path.join(__dirname, '..', 'dist', arg('dist', 'web'));
const OUT = path.join(__dirname, '..', 'media', 'tour-' + MAP); fs.mkdirSync(OUT, { recursive: true });
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SPOTS = `{
  pizza: D.PIZZA && [D.PIZZA.bx, D.PIZZA.bz],
  church: one(b => b.k === 'church', 0), mall: one(b => b.n === 'Мармелайт', 0), mall2: one(b => b.k === 'mall', 3),
  panel9: one(b => b.st === 'panel' && b.lv >= 9, 20), panel5: one(b => b.st === 'panel' && b.lv === 5, 60),
  stalin: one(b => b.st === 'stalin', 40), stalin2: one(b => b.st === 'stalin', 200), brick: one(b => b.st === 'brick', 50),
  priv: one(b => b.k === 'priv', 40), gar: one(b => b.k === 'gar', 150), ind: one(b => b.k === 'ind', 250), pub: one(b => b.k === 'pub', 20),
  rail: C.levelx[8], rail2: (() => { let best = null; for (const r of C.rails) for (const q of r.p) { const n = D.nearestRoad(q[0], q[1], 5, 1); if (n && n.d > 14 && n.d < 30 && Math.abs(q[0] - D.PIZZA.x) < 2500 && Math.abs(q[1] - D.PIZZA.z) < 2500) return q; } return best; })(), lx2: C.levelx[20], kpp: C.kpp[0] && C.kpp[0].p, kpp2: C.kpp[4] && C.kpp[4].p,
}`;
app.whenReady().then(async () => {
  protocol.handle('app', req => { let p = decodeURIComponent(new URL(req.url).pathname); if (p === '/' || p === '') p = '/index.html'; return net.fetch(pathToFileURL(path.join(DIST, p)).toString()); });
  const win = new BrowserWindow({ width: 1280, height: 720, show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
  win.webContents.setFrameRate(30);
  const js = c => win.webContents.executeJavaScript(c);
  await win.loadURL(`app://g/index.html?debug&mute&nolb&lang=ru&map=${MAP}`);
  for (let i = 0; i < 80 && !(await js('!!window.__dlv')); i++) await sleep(250);
  await js(`localStorage.setItem('dlv-msk-guide','1'); document.getElementById('st-ride').click()`);
  await sleep(1500);
  const names = await js(`(() => { const D = __dlv, C = D.CITY, B = C.buildings;
    const cen = p => p.reduce((a, q) => [a[0] + q[0] / p.length, a[1] + q[1] / p.length], [0, 0]);
    const one = (f, i) => { const a = B.filter(f); return a.length ? cen(a[Math.min(i, a.length - 1)].p) : null; };
    window.__SP = ${SPOTS}; return Object.keys(__SP).filter(k => __SP[k]); })()`);
  for (const k of names) {
    await js(`(() => { const D = __dlv, [tx, tz] = __SP['${k}'], r = D.nearestRoad(tx, tz, 5, 4); const x = r ? r.x : tx, z = r ? r.z : tz;
      let h = Math.atan2(tx - x, tz - z); const d = Math.hypot(tx - x, tz - z), back = ${'`'}\${0}${'`'};
      if (d < 3 && r) h = Math.atan2(r.seg.x2 - r.seg.x1, r.seg.z2 - r.seg.z1) + 0.6;
      const off = Math.max(0, 45 - d); D.V.x = x - Math.sin(h) * off; D.V.z = z - Math.cos(h) * off; D.V.h = h; D.V.vx = D.V.vz = 0;
      D.V.y = D.surfaceAt(D.V.x, D.V.z); D.V.camH = h; D.V.camX = D.V.x - Math.sin(h) * 12; D.V.camZ = D.V.z - Math.cos(h) * 12; D.V.camY = D.V.y + 6; })()`);
    await sleep(1800);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, k + '.png'), img.toPNG());
    console.log('кадр', k);
  }
  app.quit();
});
