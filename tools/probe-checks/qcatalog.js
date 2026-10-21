/* Вся одежда людей Quaternius (qpeople.js) — лист для автора: каждая модель целиком в своей одежде (цвета художника)
   и зимние комплекты (пуховик, сапоги, вязаная шапка / ушанка из Blender), спереди и сзади.
   Запуск: npm run probe -- --eval=tools/probe-checks/qcatalog.js --max=0 → { sheet } */
await run(1);
const T = d.THREE, R = d.renderer, QP = window.__qp;
const sc = new T.Scene();
sc.background = new T.Color(0xd8dde2);
sc.add(new T.HemisphereLight(0xeaf7ff, 0xb6c8a6, 1.7));
const sun = new T.DirectionalLight(0xfff6e4, 1.45); sun.position.set(-3, 6, 5); sc.add(sun);
sc.add(new T.AmbientLight(0xdfeaff, 0.5));
const rows = [];
for (const { fam, models } of QP.families()) {
  const W = models.indexOf('winter'), list = [];
  models.forEach((n, i) => { if (n !== 'winter') list.push([n, fam === 'A' ? { fam, all: i } : { fam, head: i, body: i, legs: i, feet: i }]); });
  if (W >= 0) {
    const h = models.findIndex(n => n !== 'winter' && !/worker|king/.test(n)), l = models.findIndex(n => /business|wformal|wcasual/.test(n));
    list.push(['зима: пуховик, шапка', { fam, head: h, body: W, legs: l < 0 ? h : l, feet: W, hat: 'hatb', hatM: W }]);
    list.push(['зима: ушанка', { fam, head: models.length > 2 ? 2 : h, body: W, legs: l < 0 ? h : l, feet: W, hat: 'hatu', hatM: W }]);
  }
  rows.push({ fam, list });
}
const CW = 150, CH = 300, cols = Math.max(...rows.map(r => r.list.length));
const out = document.createElement('canvas'); out.width = CW * cols; out.height = CH * rows.length * 2;
const ctx = out.getContext('2d'); ctx.fillStyle = '#d8dde2'; ctx.fillRect(0, 0, out.width, out.height);
const W = CW * cols, H = CH, rt = new T.WebGLRenderTarget(W, H, { type: T.FloatType, samples: 4 });
const cam = new T.OrthographicCamera(-W / H * 1.05, W / H * 1.05, 1.05, -1.05, 0.1, 50);
const buf = new Float32Array(W * H * 4), img = ctx.createImageData(W, H);
const enc = x => { x = Math.max(0, Math.min(1, x)); return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)); };
let y0 = 0;
for (const r of rows) {
  const gs = r.list.map(([n, q], i) => { const g = QP.make(q); g.position.x = (i - (cols - 1) / 2) * (2 * 1.05 * W / H / cols); sc.add(g); return g; });
  for (const back of [false, true]) {
    for (const g of gs) g.rotation.y = back ? Math.PI + 0.35 : -0.35;
    cam.position.set(0, 0.92, 10); cam.lookAt(0, 0.92, 0);
    sc.updateMatrixWorld(true);
    R.setRenderTarget(rt); R.render(sc, cam); R.render(sc, cam); R.setRenderTarget(null);
    R.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const s = ((H - 1 - y) * W + x) * 4, t = (y * W + x) * 4; img.data[t] = enc(buf[s]); img.data[t + 1] = enc(buf[s + 1]); img.data[t + 2] = enc(buf[s + 2]); img.data[t + 3] = 255; }
    ctx.putImageData(img, 0, y0);
    ctx.fillStyle = '#222'; ctx.font = '13px sans-serif';
    r.list.forEach(([n], i) => ctx.fillText((back ? 'сзади · ' : '') + n, i * CW + 6, y0 + CH - 8));
    y0 += CH;
  }
  for (const g of gs) sc.remove(g);
}
return { sheet: out.toDataURL() };
