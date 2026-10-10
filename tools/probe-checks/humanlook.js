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
const OPTS = [{}, { fat: true }, { shirt: '#ff8a00', pants: '#2f3540', cap: '#ff8a00' }, { summer: true }, { face: false, shirt: '#1b1a1f', pants: '#1b1a1f', cap: '#1b1a1f' }];
/* --q=hheld=1 — предметы в руках (people.js holdFixed, 11.10.2026): тот же человек дважды, предметы — как раньше (bone.add) и
   в меше тела; кадры вблизи и вдали в трёх позах. Ответ held: diff — пикселей отличается (из NW×NH вблизи / FW×FH вдали), по
   предметам, худший кадр; calls — вызовов на человека с предметами: как раньше / в меше; box — низ коробки «лёг» и макушка (обе). */
if (Q.has('hheld')) {
  const HV = d.makeHuman(null).userData.skin.material, L = c => new T.MeshLambertMaterial({ color: c }), LF = c => new T.MeshLambertMaterial({ color: c, flatShading: true });
  const box = (w, h, dd, c, x, y, z) => { const m = new T.Mesh(new T.BoxGeometry(w, h, dd), LF(c)); m.position.set(x, y, z); return m; };
  const vbox = (list) => { const g = new T.Group(); for (const q of list) g.add(box(...q)); return g; };
  const ITEMS = {
    bottle: u => [[u.armR, (() => { const m = new T.Mesh(new T.CylinderGeometry(0.05, 0.06, 0.28, 6), L(0x5a3a16)); m.position.set(0, -0.55, 0.1); return m; })()]],
    cup: u => [[u.armR, (() => { const m = new T.Mesh(new T.CylinderGeometry(0.07, 0.055, 0.2, 8), L(0xf4f1ea)); const l = new T.Mesh(new T.CylinderGeometry(0.075, 0.075, 0.04, 8), L(0xf0522a)); l.position.y = 0.11; m.add(l); m.position.set(0, -0.55, 0.1); return m; })()]],
    shovel: u => [[u.armR, (() => { const g = vbox([[0.05, 1.1, 0.05, '#8a6b4e', 0, -0.35, 0.05], [0.26, 0.3, 0.04, '#6e6a72', 0, -0.95, 0.12]]); g.rotation.x = 0.4; return g; })()]],
    case: u => [[u.armR, vbox([[0.42, 0.3, 0.1, '#3a2a22', 0, -0.74, 0], [0.14, 0.04, 0.03, '#1f1c1a', 0, -0.57, 0], [0.3, 0.02, 0.11, '#e0b13f', 0, -0.62, 0]])]],
    gun: u => [[u.armR, vbox([[0.05, 0.2, 0.07, '#151517', 0, -0.62, 0.02], [0.05, 0.06, 0.12, '#151517', 0, -0.54, 0.06]])]],
    stripes: u => [u.legL, u.legR, u.armL, u.armR].map(b => [b, vbox([[0.02, 0.5, 0.03, '#f2f2f0', -0.078, -0.3, 0], [0.02, 0.5, 0.03, '#f2f2f0', 0.078, -0.3, 0]])]),
    hat: u => [[u.head, (() => { const g = new T.Group(); const br = new T.Mesh(new T.CylinderGeometry(0.44, 0.44, 0.04, 12), LF(0x141018)); br.position.y = 0.27; const c = new T.Mesh(new T.ConeGeometry(0.23, 0.62, 10), LF(0x141018)); c.position.set(0.04, 0.58, -0.03); c.rotation.z = -0.18; g.add(br, c); return g; })()], [u.parts[2], (() => { const m = new T.Mesh(new T.CylinderGeometry(0.26, 0.44, 0.78, 10), LF(0x2a1838)); m.position.set(0, 0.4, 0); return m; })()]],
    racket: u => [[u.armL, (() => { const g = vbox([[0.035, 0.24, 0.035, '#2b2a30', 0, -0.12, 0], [0.008, 0.24, 0.22, '#f4f1ea', 0, -0.38, 0]]); const r = new T.Mesh(new T.TorusGeometry(0.13, 0.018, 4, 14), LF(0xe0703f)); r.position.set(0, -0.38, 0); r.rotation.y = Math.PI / 2; g.add(r); g.position.set(0, -0.5, 0.05); return g; })()]],
    heels: u => [u.legL, u.legR].map(b => [b, vbox([[0.035, 0.25, 0.035, '#c23a4a', 0, -0.825, -0.07], [0.13, 0.25, 0.08, '#c23a4a', 0, -0.825, 0.12]])]),
    phone: u => [[u.armR, (() => { const m = new T.Mesh(new T.BoxGeometry(0.1, 0.16, 0.03), new T.MeshBasicMaterial({ color: 0x9fd4ff })); m.position.set(0, -0.5, 0.12); return m; })()]],
    vc: u => [[u.armR, (() => { const g = new T.BoxGeometry(0.09, 0.5, 0.09); const n = g.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = 0.6; c[i * 3 + 1] = 0.45; c[i * 3 + 2] = 0.28; } g.setAttribute('color', new T.BufferAttribute(c, 3)); const m = new T.Mesh(g, HV); m.position.set(0, -0.8, 0.05); return m; })()]],
  };
  const POSES = [u => {}, u => { u.legL.rotation.x = 0.5; u.legR.rotation.x = -0.4; u.armL.rotation.x = -1.2; u.armR.rotation.z = 0.4; u.armR.rotation.x = 0.3; u.head.rotation.y = 0.35; u.head.rotation.x = -0.2; },
    u => { u.armR.rotation.x = -2.6; u.armL.rotation.x = -0.9; u.armL.rotation.z = -0.5; u.head.rotation.z = 0.3; u.parts[2].rotation.y = 0.3; }];
  const bA = new Uint8Array(NW * NH * 4), fA = new Uint8Array(FW * FH * 4), BX = new T.Box3(), BXh = new T.Box3();
  const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++; return n; };
  const res = { diff: {}, worst: [0, 0], calls: [0, 0], box: 0, held: 0 }, h0 = d.HSK.held;
  let nP = 0;
  for (const [name, mk] of Object.entries(ITEMS)) {
    let dn = 0, df = 0;
    for (let i = 0; i < 6; i++) {
      const p = d.makePerson({ seed: 9100 + i * 7919, fem: i % 3 === 0 }), o = OPTS[i % OPTS.length];
      const A = d.makeHuman(p, o), B = d.makeHuman(p, o);
      for (const [bn, it] of mk(A.userData)) bn.add(it);
      for (const [bn, it] of mk(B.userData)) d.holdFixed(bn, it);
      const bxs = [];
      for (const [k, g] of [[0, A], [1, B]]) { g.rotation.y = i * 0.9; }
      for (const pose of POSES) {
        const fr = [];
        for (const [k, g] of [[0, A], [1, B]]) {
          pose(g.userData); sc.add(g); g.updateMatrixWorld(true);
          R.info.autoReset = false; R.info.reset();
          shot(rtN, camN, k ? bufN : bA);
          res.calls[k] += R.info.render.calls; R.info.autoReset = true;
          shot(rtF, camF, k ? bufF : fA);
          BX.makeEmpty(); for (const m of g.userData.parts) BX.expandByObject(m, true); BXh.setFromObject(g.userData.head);
          bxs.push([BX.min.y, BX.max.y, BXh.max.y]);
          sc.remove(g);
        }
        const a = diff(bA, bufN), b = diff(fA, bufF);
        dn += a; df += b; if (a > res.worst[0]) res.worst = [a, name, i]; nP++;
        const [x, y] = bxs.splice(0, 2), e = Math.max(...x.map((v, j) => Math.abs(v - y[j]))); if (e > res.box) res.box = e; if (e > 0.001) (res.boxBy || (res.boxBy = {}))[name] = x.concat(y).map(v => +v.toFixed(3));
      }
    }
    res.diff[name] = [dn, df];
  }
  res.calls = res.calls.map(v => +(v / nP).toFixed(2)); res.box = +res.box.toFixed(4); res.held = d.HSK.held - h0; res.of = [NW * NH, FW * FH];
  R.setRenderTarget(null); R.setClearColor(cc, ca);
  return res;
}
const SPEC = [{ beard: 'full' }, { head: 'hat' }, { cig: true, earring: true }, { bottle: '#2f5a2a' }, { broad: true }, { sleeve: 'R' }, { cup: '#f4f1ea' },
  { antenna: '#e0287a' }, { eyes: 'bulge' }, { nose: 'huge', noseC: '#d9342c' }, { hair: 'afro' }, { hair: 'ponytail' }];
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
