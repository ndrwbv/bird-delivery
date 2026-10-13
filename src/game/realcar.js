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
export const REAL = { on: true, k: 1.2, eye: new THREE.Vector3(0.36, 1.2, 0.06) };
/* руль и щиток — в осях модели (до увеличения): C — середина руля, tilt — наклон верхом к водителю */
const SW = { C: [0.36, 0.9, 0.5], R: 0.175, tilt: -0.5, turn: 2.2 };
const DASH = { C: [0.36, 0.99, 0.72], tilt: -0.3, KMH: 180, RPM: 8 };
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
        const key = p.file + '|' + p.blend + '|' + p.alpha;
        let mat = mats[key];
        if (!mat) {
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
        if (p.blend) m.renderOrder = 2;
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

export function dress (car) {
  if (!REAL.on || !car) return;
  load().then(M => {
    if (!M || car.userData.real) return;
    const old = new THREE.Group();
    old.name = 'old-body';
    old.visible = false;
    for (const c of [...car.children]) old.add(c);   // позиции детей — в осях машины, подгруппа без сдвига: всё на месте
    car.add(old);
    const m = M.clone();                              // clone делит геометрию и материалы, группы — свои
    m.scale.setScalar(REAL.k);
    car.add(m);
    const R = { m, wheels: [], front: [], sw: null, needles: [] };
    m.traverse(o => {
      if (/^wheel/.test(o.name)) { R.wheels.push(o.children[0]); if (o.name[6] === 'F') R.front.push(o); }
      if (o.name === 'sw-rot') R.sw = o;
      if (o.name === 'needle0') R.needles[0] = o;
      if (o.name === 'needle1') R.needles[1] = o;
    });
    car.userData.real = R;
  });
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
}
