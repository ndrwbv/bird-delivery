/* ──────────────────────────────────────────────────────────────────────────
   Настоящая «Семёрка» вместо кубиков (проба, ветка test/real-car, 13.10.2026).

   Модель — «Old Car - VAZ 2107», Arkady Gribachev, CC-BY-4.0 (в титры):
   https://sketchfab.com/3d-models/old-car-vaz-2107-91270dab9d1a47c7ba7ffaaf8c8b0beb
   Ужата tools/realcar.mjs: ~20 тыс. треугольников → ~8 тыс., текстуры 2K → 128—256 px
   с палитрой ~24 цвета. Здесь — гранёный свет (flatShading) и крупный пиксель
   (NearestFilter), как у всего города.

   dress(car) — только своя машина: модель грузится один раз, потом прежний кузов
   (все дети группы — рама, панели, стёкла, колёса, курьер) уходит в спрятанную
   подгруппу, а модель встаёт на его место. Вмятины, стёкла, фары считаются как
   раньше, но их не видно — это проба вида.
   Колёса модели крутятся и поворачивают так же, как спрятанные (step). В салоне — свой
   руль (обод, две спицы, накладка, колонка; крутится с рулём игрока) и щиток: спидометр
   и тахометр со стрелками.
   eye — где глаза водителя (вид из-за руля, game.js camStep).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

const BASE = (import.meta.env.BASE_URL || './') + 'models/vaz2107/';
/* k — во сколько раз больше настоящей: люди в игре рослые, в настоящий размер (4,16 м) машина меньше
   прежних кубиков (4,53 м) и рядом с людьми — игрушечная. eye — в осях модели, до увеличения */
export const REAL = { on: true, k: 1.2, eye: new THREE.Vector3(0.36, 1.19, 0.24) };   // ближе к стеклу (автор 13.10)
/* руль и щиток — в осях модели (до увеличения): C — середина руля, tilt — наклон верхом к водителю */
const SW = { C: [0.36, 0.9, 0.58], R: 0.17, tilt: -0.5, turn: 2.2 };
const DASH = { C: [0.36, 0.98, 0.78], tilt: -0.3, KMH: 180, RPM: 8 };
let LOADING = null;

const lambert = (hex, flat = true) => new THREE.MeshLambertMaterial({ color: hex, flatShading: flat });

/* руль «Семёрки»: тонкий чёрный обод, две спицы чуть вниз, мягкая накладка, колонка в торпедо */
function steeringWheel () {
  const g = new THREE.Group(), rot = new THREE.Group();   // g — наклон колонки, rot — поворот руля
  const dark = lambert(0x1d1c20, false), pad = lambert(0x2a282d, false), chrome = lambert(0x9da3aa, false);
  rot.add(new THREE.Mesh(new THREE.TorusGeometry(SW.R, 0.016, 10, 40), dark));
  // накладка: сплющенная капсула поперёк, с хромовой эмблемой
  const hub = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.1, 6, 12), pad);
  hub.rotation.z = Math.PI / 2; hub.scale.set(1, 1, 0.55); hub.position.z = 0.012;
  rot.add(hub);
  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.006, 16), chrome);
  badge.rotation.x = Math.PI / 2; badge.position.z = -0.014;
  rot.add(badge);
  // спицы: от накладки к ободу, сужаются, чуть вниз
  const L = SW.R - 0.06;
  for (const s of [-1, 1]) {
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.009, L, 8), dark);
    const a = s * (Math.PI / 2 + 0.28);              // от «вверх» на 106° в сторону: чуть ниже горизонта
    sp.position.set(-Math.sin(a) * (0.05 + L / 2), Math.cos(a) * (0.05 + L / 2), 0.004);
    sp.rotation.z = a;
    sp.scale.z = 0.6;
    rot.add(sp);
  }
  const low = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, SW.R - 0.05, 8), dark);   // нижняя тонкая спица
  low.position.set(0, -(SW.R / 2 + 0.02), 0.004);
  rot.add(low);
  g.add(rot);
  // колонка: из-под руля вперёд-вниз, в кожухе
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.042, 0.32, 12), dark);
  col.rotation.x = Math.PI / 2; col.position.z = 0.18;
  g.add(col);
  const shroud = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.08, 4, 10), pad);
  shroud.rotation.x = Math.PI / 2; shroud.scale.set(1.1, 0.7, 1); shroud.position.set(0, -0.04, 0.13);
  g.add(shroud);
  g.position.set(...SW.C);
  g.rotation.x = SW.tilt;
  rot.name = 'sw-rot';                          // по имени находит dress: clone копирует userData как JSON, ссылки теряются
  return g;
}

/* щиток: козырёк над двумя круглыми приборами; лицо приборов — холст, стрелки — отдельно */
function gaugeFace () {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#141316'; x.fillRect(0, 0, 256, 128);
  for (const [cx, n, lab] of [[64, 9, 'км/ч'], [192, 8, '×1000']]) {
    x.fillStyle = '#0b0b0d'; x.beginPath(); x.arc(cx, 64, 58, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#b9b2a4'; x.lineWidth = 3; x.beginPath(); x.arc(cx, 64, 58, 0, Math.PI * 2); x.stroke();
    for (let i = 0; i <= n * 2; i++) {
      const a = (-135 + 270 * i / (n * 2)) * Math.PI / 180, big = i % 2 === 0;
      const r0 = big ? 42 : 47, r1 = 53;
      x.strokeStyle = cx > 128 && i >= n * 2 - 3 ? '#e2462a' : '#f3ecdc'; x.lineWidth = big ? 3 : 1.5;
      x.beginPath(); x.moveTo(cx + Math.sin(a) * r0, 64 - Math.cos(a) * r0); x.lineTo(cx + Math.sin(a) * r1, 64 - Math.cos(a) * r1); x.stroke();
      if (big) {
        x.fillStyle = '#f3ecdc'; x.font = 'bold 11px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(String(cx < 128 ? i / 2 * 20 : i / 2), cx + Math.sin(a) * 32, 64 - Math.cos(a) * 32);
      }
    }
    x.fillStyle = '#f0522a'; x.font = '9px monospace'; x.fillText(lab, cx, 92);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

function cluster () {
  const g = new THREE.Group(), needles = [];       // стрелки: needle0 — спидометр, needle1 — тахометр
  // козырёк — полтрубы над приборами
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.34, 18, 1, true, -Math.PI / 2, Math.PI), lambert(0x1d1c20));
  hood.material.side = THREE.DoubleSide;
  hood.rotation.z = Math.PI / 2; hood.scale.set(1, 1, 0.7); hood.position.set(0, 0, -0.02);
  g.add(hood);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshBasicMaterial({ map: gaugeFace() }));
  face.rotation.y = Math.PI;                     // лицом к водителю (−z)
  face.position.set(0, -0.025, 0.03);
  g.add(face);
  for (const s of [1, -1]) {                       // спидометр слева (+x, ближе к водителю слева), тахометр справа
    const pv = new THREE.Group();
    pv.position.set(s * 0.075, -0.025, 0.027);
    const n = new THREE.Mesh(new THREE.BoxGeometry(0.0035, 0.05, 0.002), new THREE.MeshBasicMaterial({ color: 0xff6a2a }));
    n.position.y = 0.02;
    pv.add(n);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.004, 10), new THREE.MeshBasicMaterial({ color: 0x2b2b2e }));
    cap.rotation.x = Math.PI / 2;
    pv.add(cap);
    pv.name = 'needle' + needles.length;
    g.add(pv);
    needles.push(pv);
  }
  g.position.set(...DASH.C);
  g.rotation.x = DASH.tilt;
  return g;
}

/* ─── стёкла: светлые и прозрачные; трескаются и бьются вместе со стёклами старого кузова (carglass.js) ───
   GLASS — прозрачность целого / треснувшего; трещины — общий холст (паутина от точки удара) */
const GLASS = { CLEAR: 0.14, CRACK: 0.6, HEX: 0xdcecf7 };
let CRACK = null;
function crackTex () {
  if (CRACK) return CRACK;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.strokeStyle = 'rgba(255,255,255,0.95)'; x.lineWidth = 1.5;
  const cx = 78, cy = 56;
  for (let i = 0; i < 11; i++) {                     // лучи паутины
    let a = i / 11 * Math.PI * 2 + Math.random() * 0.4, px = cx, py = cy;
    x.beginPath(); x.moveTo(px, py);
    for (let s = 0; s < 6; s++) { a += (Math.random() - 0.5) * 0.5; px += Math.cos(a) * 14; py += Math.sin(a) * 14; x.lineTo(px, py); }
    x.stroke();
  }
  x.lineWidth = 1;
  for (const r of [9, 20, 34]) {                     // кольца
    x.beginPath();
    for (let i = 0; i <= 22; i++) { const a = i / 22 * Math.PI * 2, rr = r * (0.8 + Math.random() * 0.4); x[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    x.stroke();
  }
  CRACK = new THREE.CanvasTexture(c);
  CRACK.magFilter = THREE.NearestFilter;
  return CRACK;
}

/* ─── кровь на лобовом (только взрослая версия: blood зовёт game.js под ADULT) ───
   Сбил человека — брызги на стекле; дворники машут, пока стекло в крови, и стирают то, где прошли */
const BLOOD = { W: 128, H: 64, WET: 0.6 };
function bloodLayer (R, win) {
  const c = document.createElement('canvas');
  c.width = BLOOD.W; c.height = BLOOD.H;
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(win.geometry, new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.renderOrder = 3;
  m.visible = false;
  win.parent.add(m);
  R.blood = { c, x: c.getContext('2d'), t, m, n: 0 };
}

export function blood (car, n = 1) {
  const R = car && car.userData.real, B = R && R.blood;
  if (!B) return;
  const x = B.x;
  for (let i = 0; i < 6 + n * 4; i++) {
    const px = Math.random() * BLOOD.W, py = BLOOD.H * (0.2 + Math.random() * 0.75), r = 2 + Math.random() * 7;
    x.fillStyle = Math.random() < 0.5 ? '#8a0d12' : '#b3161b';
    x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
    if (Math.random() < 0.6) { x.fillRect(px - 1, py, 2, 4 + Math.random() * 14); }                      // потёк вниз по стеклу
    for (let k = 0; k < 4; k++) { x.beginPath(); x.arc(px + (Math.random() - 0.5) * r * 4, py + (Math.random() - 0.5) * r * 3, 1 + Math.random() * 1.5, 0, Math.PI * 2); x.fill(); }
  }
  B.n = 1; B.m.visible = true; B.t.needsUpdate = true;
}
/* дождь для дворников: пока на стекле кровь — машут, как в дождь */
export const bloodWet = car => { const B = car && car.userData.real && car.userData.real.blood; return B && B.n > 0 ? BLOOD.WET : 0; };

/* дворники стирают кровь: сектор от опоры до угла дворника (wipers.js: опоры px от середины, лежат влево) */
function wipeBlood (R, W) {
  const B = R.blood, F = R.glassF;
  if (!B || !(B.n > 0) || !W || !W.arms || !(W.a > 0.05)) return;
  const x = B.x;
  x.save();
  x.globalCompositeOperation = 'destination-out';
  x.translate(0, BLOOD.H);
  x.scale(BLOOD.W / F.w0, -BLOOD.H / F.H);          // метры стекла: x — от левого края, y — вверх по стеклу
  for (const m of W.arms) {
    if (m.F !== F) continue;
    const ox = F.w0 / 2 + m.px;
    x.beginPath(); x.moveTo(ox, 0);
    for (let i = 0; i <= 12; i++) { const a = W.a * m.k * i / 12; x.lineTo(ox - Math.cos(a) * m.len * 1.05, Math.sin(a) * m.len * 1.05); }
    x.closePath(); x.fill();
  }
  x.restore();
  B.t.needsUpdate = true;
  if (W.a >= 1.7) {                                  // взмах до верха: если почти чисто — всё
    const d = x.getImageData(0, 0, BLOOD.W, BLOOD.H).data;
    let left = 0;
    for (let i = 3; i < d.length; i += 16) if (d[i] > 40) left++;
    if (left < 6) { x.clearRect(0, 0, BLOOD.W, BLOOD.H); B.n = 0; B.m.visible = false; }
  }
}

function load () {
  if (LOADING) return LOADING;
  LOADING = Promise.all([fetch(BASE + 'car.json').then(r => r.json()), fetch(BASE + 'car.bin').then(r => r.arrayBuffer())])
    .then(([J, bin]) => {
      const g = new THREE.Group(), tl = new THREE.TextureLoader(), mats = {};
      const cz = (J.box.min[2] + J.box.max[2]) / 2;      // середина по длине — в ноль, как у кузова игры
      for (const p of J.parts) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(bin, p.pos[0], p.pos[1]), 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(bin, p.uv[0], p.uv[1]), 2));
        geo.setIndex(new THREE.BufferAttribute(p.idx[2] === 4 ? new Uint32Array(bin, p.idx[0], p.idx[1]) : new Uint16Array(bin, p.idx[0], p.idx[1]), 1));
        const pane = /^win/.test(p.name);
        const key = pane ? p.name : p.file + '|' + p.blend + '|' + p.alpha;
        let mat = mats[key];
        if (!mat && pane) {
          mat = mats[key] = new THREE.MeshBasicMaterial({ color: GLASS.HEX, transparent: true, opacity: GLASS.CLEAR, depthWrite: false, side: THREE.DoubleSide });
        } else if (!mat) {
          mat = mats[key] = new THREE.MeshLambertMaterial({ flatShading: true, side: THREE.DoubleSide });
          if (p.file) {
            const t = tl.load(BASE + p.file);
            t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
            t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapNearestFilter;
            mat.map = t;
          }
          if (p.blend) { mat.transparent = true; mat.opacity = Math.min(1, p.alpha); mat.depthWrite = false; }
        }
        const m = new THREE.Mesh(geo, mat);
        m.name = 'real:' + p.name;
        if (p.blend || pane) m.renderOrder = 2;
        if (p.pivot) {
          // колесо: steer (поворот передних) → spin (вращение); геометрия — вокруг оси колеса
          const steer = new THREE.Group(), spin = new THREE.Group();
          steer.position.set(p.pivot[0], p.pivot[1], p.pivot[2] - cz);
          spin.add(m); steer.add(spin); g.add(steer);
          steer.name = p.name;
        } else {
          geo.translate(0, 0, -cz);
          g.add(m);
        }
        geo.computeVertexNormals();
        geo.computeBoundingSphere();
      }
      g.add(steeringWheel());
      g.add(cluster());
      if (window.__dlv) window.__dlv.REAL = REAL;     // отладка: глаза водителя двигать из probe
      return g;
    })
    .catch(e => { console.warn('realcar: модель не загрузилась', e); REAL.on = false; return null; });
  return LOADING;
}

/* лобовое для дворников (wipers.js): O — середина низа снаружи, ex — вбок, ey — вверх по стеклу, n — наружу, H, w;
   w0 — полная ширина (для крови); в осях машины (с увеличением k) */
function glassFrame (win) {
  const a = win.geometry.attributes.position, k = REAL.k;
  let y0 = 1e9, y1 = -1e9, z0 = 0, z1 = 0, x0 = 1e9, x1 = -1e9;
  for (let i = 0; i < a.count; i++) {
    const x = a.getX(i), y = a.getY(i), z = a.getZ(i);
    if (y < y0) { y0 = y; z0 = z; }
    if (y > y1) { y1 = y; z1 = z; }
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
  }
  const ey = new THREE.Vector3(0, y1 - y0, z1 - z0).normalize(), n = new THREE.Vector3(0, -ey.z, ey.y);
  const O = new THREE.Vector3(0, y0 * k, z0 * k).addScaledVector(n, 0.03).addScaledVector(ey, 0.03);
  const H = Math.hypot(y1 - y0, z1 - z0) * k, w0 = (x1 - x0) * k;
  return { O, ex: new THREE.Vector3(1, 0, 0), ey, n, H, w: w0 * 0.9, w0 };
}

export function dress (car) {
  if (!REAL.on || !car) return;
  load().then(M => {
    if (!M || car.userData.real) return;
    const ud = car.userData;
    const old = new THREE.Group();
    old.name = 'old-body';
    old.visible = false;
    for (const c of [...car.children]) old.add(c);   // позиции детей — в осях машины, подгруппа без сдвига: всё на месте
    car.add(old);
    const m = M.clone();
    m.scale.setScalar(REAL.k);
    car.add(m);
    const R = { m, wheels: [], front: [], sw: null, needles: [], dent: [], panes: {}, glassF: null, blood: null };
    const own = new Map();                           // у каждой машины свои материалы: взрыв красит их в чёрный (game.js gameOver),
    m.traverse(o => {                                //   общие — и новая после воскрешения была бы чёрной
      if (o.isMesh) {
        if (!own.has(o.material)) own.set(o.material, o.material.clone());
        o.material = own.get(o.material);
        if (/^real:(?!wheel)/.test(o.name)) { o.geometry = o.geometry.clone(); R.dent.push(o.geometry); }   // мнётся — своя сетка
        const pk = /^real:win([FBLR])$/.exec(o.name);
        if (pk) R.panes[pk[1].toLowerCase()] = { m: o, st: 0 };
      }
      if (/^wheel/.test(o.name)) { R.wheels.push(o.children[0]); if (o.name[6] === 'F') R.front.push(o); }
      if (o.name === 'sw-rot') R.sw = o;
      if (o.name === 'needle0') R.needles[0] = o;
      if (o.name === 'needle1') R.needles[1] = o;
    });
    if (R.panes.f) {
      R.glassF = glassFrame(R.panes.f.m);
      bloodLayer(R, R.panes.f.m);
      ud.realGlass = R.glassF;                       // дворники — по новому лобовому (wipers.js)
      ud.wipers = undefined;                         // уже собранные (по старому стеклу) ушли в old-body — собрать заново
    }
    ud.real = R;
  });
}

/* вмятина (game.js dentCar → тут же, как cardent.js hit): lx, lz — точка удара в осях машины, force — м/с.
   Те же числа, что у старого кузова (DENT в cardent.js): с 4 м/с, во всю глубину 0,3 м с 22 м/с, радиус 0,45—1,05 м;
   глубже 0,5 м от морды / кормы и 0,28 м от бока не мнётся — машина не складывается */
const DENT = { MIN: 4, FULL: 22, DEPTH: 0.3, R0: 0.45, R1: 0.6, IN_END: 0.5, IN_SIDE: 0.28, W2: 0.89, HL: 2.08 };
export function dent (car, lx, lz, force) {
  const R = car && car.userData.real;
  if (!R || !(force > DENT.MIN)) return;
  const K = REAL.k, x = lx / K, z = lz / K, k = Math.min(1, (force - DENT.MIN) / (DENT.FULL - DENT.MIN));
  const end = Math.abs(z) / DENT.HL >= Math.abs(x) / DENT.W2;
  const nx = end ? 0 : Math.sign(x) || 1, nz = end ? Math.sign(z) || 1 : 0;
  const cx = end ? Math.max(-DENT.W2, Math.min(DENT.W2, x)) : nx * DENT.W2, cz = end ? nz * DENT.HL : Math.max(-DENT.HL, Math.min(DENT.HL, z)), cy = 0.6;
  const depth = DENT.DEPTH * k / K, rad = (DENT.R0 + DENT.R1 * k) / K;
  for (const g of R.dent) {
    const a = g.attributes.position;
    let hit = false;
    for (let i = 0; i < a.count; i++) {
      const px = a.getX(i), py = a.getY(i), pz = a.getZ(i);
      if (end ? Math.abs(pz) < DENT.HL - DENT.IN_END : Math.abs(px) < DENT.W2 - DENT.IN_SIDE) continue;
      const d = Math.hypot(px - cx, (py - cy) * 0.8, pz - cz);
      if (d >= rad) continue;
      const f = (1 - d / rad) ** 2 * depth * (0.75 + 0.5 * Math.abs(Math.sin(px * 37 + py * 53 + pz * 71)));   // «мятый» шум
      a.setXYZ(i, px - nx * f, py - f * 0.15, pz - nz * f);
      hit = true;
    }
    if (hit) { a.needsUpdate = true; g.computeBoundingSphere(); }
  }
}

/* каждый кадр (game.js после колёс): spin — угол колёс, steerY — поворот передних, steer — руль −1…1,
   vf — скорость, м/с. Колёса модели в 1,2 раза больше — крутятся в 1,2 раза медленнее */
export function step (car, spin, steerY, steer, vf) {
  const R = car.userData.real;
  if (!R) return;
  const a = spin / REAL.k;
  for (let i = 0; i < R.wheels.length; i++) R.wheels[i].rotation.x = a;
  for (let i = 0; i < R.front.length; i++) R.front[i].rotation.y = steerY;
  if (R.sw) R.sw.rotation.z = steer * SW.turn;
  if (R.needles.length) {
    const kmh = Math.abs(vf) * 3.6, rpm = 0.9 + (Math.abs(vf) % 9) / 9 * 4.5;   // тахометр — «передачи» каждые 9 м/с
    R.needles[0].rotation.z = -(-135 + 270 * Math.min(1, kmh / DASH.KMH)) * Math.PI / 180;
    R.needles[1].rotation.z = -(-135 + 270 * Math.min(1, rpm / DASH.RPM)) * Math.PI / 180;
  }
  // стёкла — как у старого кузова (carglass.js: 0 целое, 1 в трещинах, 2 разбито)
  const cg = car.userData.cg;
  if (cg) for (const p of cg.panes) {
    const q = R.panes[p.k];
    if (!q || q.st === p.st) continue;
    q.st = p.st;
    const mt = q.m.material;
    if (p.st === 1) { mt.map = crackTex(); mt.opacity = GLASS.CRACK; mt.color.setHex(0xffffff); mt.needsUpdate = true; }
    if (p.st === 2) { q.m.visible = false; if (p.k === 'f' && R.blood) R.blood.m.visible = false; }
  }
  wipeBlood(R, car.userData.wipers);
}
