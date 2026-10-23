/* Люди Quaternius (qpeople.js, ветка test/people) рядом с нашими: картинка-лист для автора.
   Запуск: npm run probe -- --eval=tools/probe-checks/qlook.js --max=0
   Своя сцена со светом как в игре: 16 человек из частей Quaternius (мужчины и женщины) — стоят и в позе шага игры.
   Ответ: { sheet: PNG в data URL, built, posed, combos } */
await run(1);
const T = d.THREE, R = d.renderer, QP = window.__qp;
const sc = new T.Scene();
sc.background = new T.Color(0x86c6f2);
sc.add(new T.HemisphereLight(0xeaf7ff, 0xb6c8a6, 1.7));
const sun = new T.DirectionalLight(0xfff6e4, 1.45); sun.position.set(-3, 6, 5); sc.add(sun);
sc.add(new T.AmbientLight(0xdfeaff, 0.5));
const ground = new T.Mesh(new T.PlaneGeometry(40, 20), new T.MeshLambertMaterial({ color: 0x9a9c9e }));
ground.rotation.x = -Math.PI / 2; sc.add(ground);
const W = 1400, H = 520;
const rt = new T.WebGLRenderTarget(W, H, { type: T.FloatType, samples: 4 });
const cam = new T.PerspectiveCamera(30, W / H, 0.1, 100);
cam.position.set(0, 1.8, 9.5); cam.lookAt(0, 0.9, -0.5);
// люди: 16 моделей Quaternius (сборка из частей, цвета и очки — по внешности человека игры), два ряда по 8
const keep = { on: QP.on, all: QP.all };
QP.on = true; QP.all = true;
const row = [];
for (let s = 0; s < 16; s++) row.push(d.makeHuman(d.makePerson({ seed: 30000 + s * 7919, fem: s % 2 === 1 })));
QP.on = keep.on; QP.all = keep.all;
row.forEach((g, i) => { g.position.set(((i % 8) - 3.5) * 1.05, 0, i < 8 ? -1.6 : 0.6); g.rotation.y = -0.3; sc.add(g); });
const poses = {
  stand: u => { for (const b of [u.legL, u.legR, u.armL, u.armR, u.head]) b.rotation.set(0, 0, 0); },
  walk: u => { u.legL.rotation.set(0.5, 0, 0); u.legR.rotation.set(-0.5, 0, 0); u.armL.rotation.set(-0.35, 0, 0); u.armR.rotation.set(0.35, 0, 0); u.head.rotation.set(0, 0.2, 0); },
  wave: u => { u.legL.rotation.set(0, 0, 0); u.legR.rotation.set(0, 0, 0); u.armL.rotation.set(0, 0, 0); u.armR.rotation.set(0, 0, 2.6); u.head.rotation.set(-0.15, 0, 0); },
};
const out = document.createElement('canvas'); out.width = W; out.height = H * 2;
const ctx = out.getContext('2d');
const buf = new Float32Array(W * H * 4), img = ctx.createImageData(W, H);
const enc = x => { x = Math.max(0, Math.min(1, x)); return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)); };
let k = 0;
for (const name of ['stand', 'walk']) {
  for (const g of row) poses[name](g.userData);
  sc.updateMatrixWorld(true);
  R.setRenderTarget(rt); R.render(sc, cam); R.render(sc, cam); R.setRenderTarget(null);
  R.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = ((H - 1 - y) * W + x) * 4, t = (y * W + x) * 4;
    img.data[t] = enc(buf[s]); img.data[t + 1] = enc(buf[s + 1]); img.data[t + 2] = enc(buf[s + 2]); img.data[t + 3] = 255;
  }
  ctx.putImageData(img, 0, H * k++);
}
for (const g of row) sc.remove(g);
return { sheet: out.toDataURL(), built: QP.built, posed: QP.posed, combos: QP.combos };
