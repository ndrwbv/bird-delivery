/* Внешность людей (people.js makeHuman, 11.10.2026): тот же ли человек в кадре после правок модели. В npm run check не входит.
   Запуск: npm run probe -- --eval=tools/probe-checks/humanlook.js --max=0 (со сборкой «до» — --dir=папка, и сравнить)
   40 людей по зерну (часть — с особыми чертами, толстые, в форме, в маске, с перекрашенной головой) × 2 позы (стоит;
   шаг: ноги, руки, поворот головы) × 3 кадра: вблизи (3 м), вдали (30 м, ближняя модель) и дальняя модель (lod, как humanLod).
   Своя сцена со своим светом, без сглаживания: хеш пикселей каждого кадра. Ответ: all — один хеш на всё, near / far / lod —
   по видам, per — по людям (--q=hper=1), box — низ коробки «лёг» (hits.js fallLift) и макушка головы (encounters.js) по людям,
   calls — вызовов отрисовки на ближнего человека. --q=hshot=1 — ещё и картинка-лист (PNG в data URL, поле sheet). */
const Q = new URLSearchParams(location.search);
await run(1);
const T = d.THREE, R = d.renderer;
const sc = new T.Scene();
sc.add(new T.AmbientLight(0xffffff, 0.7));
const sun = new T.DirectionalLight(0xffffff, 1.6); sun.position.set(2, 4, 3); sc.add(sun);
const NW = 128, NH = 224, FW = 64, FH = 64;
const rtN = new T.WebGLRenderTarget(NW, NH), rtF = new T.WebGLRenderTarget(FW, FH);
const camN = new T.PerspectiveCamera(40, NW / NH, 0.1, 100); camN.position.set(1.1, 1.35, 3.0); camN.lookAt(0, 0.95, 0);
const camF = new T.PerspectiveCamera(8, 1, 1, 200); camF.position.set(6, 3, 30); camF.lookAt(0, 0.95, 0);
const fnv = (h, a) => { for (let i = 0; i < a.length; i++) { h ^= a[i]; h = Math.imul(h, 16777619); } return h >>> 0; };
const bufN = new Uint8Array(NW * NH * 4), bufF = new Uint8Array(FW * FH * 4);
const cc = new T.Color(); R.getClearColor(cc); const ca = R.getClearAlpha();
const shot = (rt, cam, buf) => {
  R.setRenderTarget(rt); R.setClearColor(0x808080, 1); R.clear(); R.render(sc, cam);
  R.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, buf);
  return fnv(2166136261, buf);
};
const SPEC = [{ beard: 'full' }, { head: 'hat' }, { cig: true, earring: true }, { bottle: '#2f5a2a' }, { broad: true }, { sleeve: 'R' }, { cup: '#f4f1ea' },
  { antenna: '#e0287a' }, { eyes: 'bulge' }, { nose: 'huge', noseC: '#d9342c' }, { hair: 'afro' }, { hair: 'ponytail' }];
const OPTS = [{}, { fat: true }, { shirt: '#ff8a00', pants: '#2f3540', cap: '#ff8a00' }, { summer: true }, { face: false, shirt: '#1b1a1f', pants: '#1b1a1f', cap: '#1b1a1f' }];
const out = { all: 0, near: 0, far: 0, lod: 0, per: [], box: [], calls: 0 };
let hAll = 2166136261, hN = 2166136261, hF = 2166136261, hL = 2166136261, callsN = 0;
const sheet = Q.has('hshot') ? document.createElement('canvas') : null;
if (sheet) { sheet.width = NW * 10; sheet.height = NH * 8; }
const BX = new T.Box3();
for (let i = 0; i < 40; i++) {
  const p = d.makePerson({ seed: 5000 + i * 7919, fem: i % 3 === 0 });
  if (i < SPEC.length) Object.assign(p.look, SPEC[i]);
  const o = OPTS[i % OPTS.length];
  const g = d.makeHuman(p, o), u = g.userData;
  if (i % 6 === 4) for (const m of [].concat(u.head.material)) if (!m.map) m.color.set('#d8534a');   // злой водитель (game.js stallCar)
  g.rotation.y = i * 0.7;
  sc.add(g);
  const per = [];
  for (const pose of [0, 1]) {
    if (pose) { u.legL.rotation.x = 0.5; u.legR.rotation.x = -0.4; u.armL.rotation.x = -1.2; u.armR.rotation.z = 0.4; u.armR.rotation.x = 0.3; u.head.rotation.y = 0.35; u.head.rotation.x = -0.2; }
    g.updateMatrixWorld(true);
    R.info.autoReset = false; R.info.reset();
    const a = shot(rtN, camN, bufN);
    if (!pose) callsN += R.info.render.calls;
    R.info.autoReset = true;
    const b = shot(rtF, camF, bufF);
    // дальняя модель — как humanLod (game.js)
    u.lod.visible = true; for (const m of u.parts) m.visible = false;
    const c = shot(rtF, camF, bufF);
    u.lod.visible = false; for (const m of u.parts) m.visible = true;
    per.push(a, b, c);
    hN = fnv(hN, [a]); hF = fnv(hF, [b]); hL = fnv(hL, [c]);
    if (sheet) {                                   // bufN — ещё кадр вблизи этой позы (дальние — в bufF)
      const id = new ImageData(NW, NH);
      for (let y = 0; y < NH; y++) id.data.set(bufN.subarray((NH - 1 - y) * NW * 4, (NH - y) * NW * 4), y * NW * 4);
      sheet.getContext('2d').putImageData(id, (i % 10) * NW, (Math.floor(i / 10) * 2 + pose) * NH);
    }
  }
  // коробка «лёг» (hits.js fallLift: по кускам с шарнирами) и макушка (encounters.js: коробка головы)
  BX.makeEmpty(); for (const m of u.parts || []) if (m) BX.expandByObject(m, true);
  const lo = +BX.min.y.toFixed(3), hi = +BX.max.y.toFixed(3);
  BX.makeEmpty(); BX.setFromObject(u.head);
  out.box.push([lo, hi, +BX.max.y.toFixed(3)]);
  out.per.push(per.join('.'));
  hAll = fnv(hAll, per);
  sc.remove(g);
}
R.setRenderTarget(null); R.setClearColor(cc, ca);
out.all = hAll; out.near = hN; out.far = hF; out.lod = hL; out.calls = +(callsN / 40).toFixed(2);
if (!Q.has('hper')) delete out.per;
if (sheet) out.sheet = sheet.toDataURL();
return out;
