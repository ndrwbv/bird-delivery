/* ──────────────────────────────────────────────────────────────────────────
   Настоящие модели машин вместо кубиков (проба, ветка test/real-car, 13.10.2026).
   Как добавить машину — docs/CARS3D.md.

   MODELS — какие машины игры уже с настоящей моделью и как она сидит: папка (public/models/<dir>,
   её готовит tools/realcar.mjs), во сколько раз больше настоящей (k), где глаза водителя, руль,
   щиток, торпедо, габариты для вмятин. «Семёрка» — «Old Car - VAZ 2107», Arkady Gribachev,
   CC-BY-4.0 (в титры): https://sketchfab.com/3d-models/old-car-vaz-2107-91270dab9d1a47c7ba7ffaaf8c8b0beb

   dress(car, id, hex) — своя машина: прежний кузов (рама, панели, стёкла, колёса, курьер) уходит
   в спрятанную подгруппу — вмятины, стёкла, фары у него считаются как раньше, — а модель встаёт
   на его место. У каждой машины свои материалы (взрыв красит их в чёрный — новая после
   воскрешения чистая) и своя сетка кузова (мнётся).
   • Краска — маской (tools/realcar.mjs paint): серый оттенок × цвет машины из гаража (hex) —
     перекраска работает; хром, резина, фары — как есть.
   • Колёса крутятся и поворачивают как спрятанные; руль крутится с рулём игрока; щиток —
     спидометр и тахометр со стрелками; торпедо, дефлекторы, магнитола, бардачок, рычаг КПП,
     зеркало, козырьки — своё (неподвижное — одной склейкой).
   • Стёкла светлые и прозрачные; трескаются и бьются вместе со стёклами старого кузова.
   • Вмятины — от тех же ударов (game.js dentCar → dent), числа — как в cardent.js.
   • Кровь (только взрослая версия): сбил человека — на кузове с той стороны пятна растут
     и стекают (до BODY_BLOOD.N пятен, копятся — машина «в кровище»), на лобовом — брызги,
     растекаются и текут вниз; дворники машут, пока стекло в крови, и стирают её.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { inject as dirtInject } from './cardirt.js';

const ROOT = (import.meta.env.BASE_URL || './') + 'models/';
/* всё — в осях модели до увеличения k (метры настоящей машины): x — влево по ходу, y — вверх, z — вперёд, 0 — середина длины.
   k — во сколько раз больше настоящей (люди в игре рослые: в настоящий размер машина рядом с ними игрушечная);
   eye — глаза водителя; sw — руль (C — середина, R — радиус, tilt — наклон верхом к водителю, turn — рад на весь руль);
   dash — щиток приборов; box — полуширина и полудлина кузова (вмятины, кровь);
   torpedo — панель: W — полуширина, top — верх, lip — кромка (z), low — низ лица, back — у лобового (z), floor — пол */
export const MODELS = {
  semerka: {
    dir: 'vaz2107', k: 1.2,
    eye: [0.36, 1.19, 0.24],
    sw: { C: [0.36, 0.9, 0.58], R: 0.17, tilt: -0.5, turn: 2.2 },
    dash: { C: [0.36, 0.97, 0.66], tilt: -0.3, KMH: 180, RPM: 8 },   // щиток — колодцем из кромки торпедо (низ в панели, не висит)
    box: { W2: 0.89, HL: 2.08 },
    torpedo: { W: 0.68, top: 0.95, lip: 0.68, low: 0.6, back: 1.0, floor: 0.4 },
    driver: { x: 0.36, seat: 0.5, z: 0.1 },        // курьер: середина сиденья (x), его высота, где голова по длине
  },
};
export const REAL = { on: true, k: 1.2, eye: new THREE.Vector3(0.36, 1.19, 0.24) };   // текущая (для game.js camStep и отладки)
const CACHE = {};
let SEQ = 0;                                       // номер машины — свой ключ программы кузова (bodyShader)

const lambert = (hex, flat = true) => new THREE.MeshLambertMaterial({ color: hex, flatShading: flat });

/* ─── склейка: много мелких частей одного вида → одна сетка с цветом по вершинам (одна отрисовка) ─── */
function merge (parts) {
  const P = [], N = [], C = [], col = new THREE.Color();
  for (const { geo, m, hex } of parts) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m);
    g.computeVertexNormals();
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    col.set(hex);
    for (let i = 0; i < p.length; i += 3) { P.push(p[i], p[i + 1], p[i + 2]); N.push(n[i], n[i + 1], n[i + 2]); C.push(col.r, col.g, col.b); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return out;
}
const M4 = (x, y, z, rx = 0, ry = 0, rz = 0, s = [1, 1, 1]) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(...s));

/* ─── торпедо: панель (профиль сбоку, вытянут по ширине, скруглён), консоль, дефлекторы, бардачок,
   рычаг КПП в чехле, зеркало заднего вида, козырьки. Цвета: чёрный пластик, хром, обивка ─── */
const DASHC = { plastic: 0x2a292e, dark: 0x18171b, trim: 0x3a3840, chrome: 0xa9aeb5, boot: 0x1f1e22, visor: 0x8b8378 };
function torpedo (T) {
  const parts = [];
  // профиль панели (по x шейпа — z машины, по y — высота): от лобового по верху назад, скруглённая кромка, вниз к коленям
  const s = new THREE.Shape();
  s.moveTo(T.back, T.top - 0.03);
  s.lineTo(T.lip + 0.1, T.top);
  s.quadraticCurveTo(T.lip, T.top, T.lip - 0.01, T.top - 0.06);
  s.lineTo(T.lip + 0.02, T.low + 0.1);
  s.quadraticCurveTo(T.lip + 0.04, T.low, T.lip + 0.12, T.low);
  s.lineTo(T.back, T.low + 0.02);
  s.lineTo(T.back, T.top - 0.03);
  const panel = new THREE.ExtrudeGeometry(s, { depth: T.W * 2, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2, curveSegments: 6 });
  parts.push({ geo: panel, m: M4(T.W, 0, 0, 0, -Math.PI / 2, 0), hex: DASHC.plastic });   // шейп в (z, y), выдавлен поперёк машины
  parts.push({ geo: new THREE.BoxGeometry(T.W * 2 - 0.08, 0.035, 0.01), m: M4(0, T.top - 0.12, T.lip - 0.005, 0.08), hex: DASHC.trim });   // накладка по лицу
  // центральные дефлекторы: рамка + ламели
  for (const sx of [-1, 1]) {
    const x = sx * 0.07;
    parts.push({ geo: new THREE.BoxGeometry(0.11, 0.07, 0.02), m: M4(x, T.top - 0.17, T.lip + 0.005), hex: DASHC.dark });
    for (let i = 0; i < 4; i++) parts.push({ geo: new THREE.BoxGeometry(0.1, 0.006, 0.012), m: M4(x, T.top - 0.195 + i * 0.016, T.lip - 0.004, 0.3), hex: DASHC.trim });
  }
  // боковые круглые дефлекторы
  for (const sx of [-1, 1]) {
    parts.push({ geo: new THREE.CylinderGeometry(0.035, 0.035, 0.02, 16), m: M4(sx * (T.W - 0.06), T.top - 0.09, T.lip + 0.02, Math.PI / 2), hex: DASHC.dark });
    parts.push({ geo: new THREE.TorusGeometry(0.035, 0.006, 6, 16), m: M4(sx * (T.W - 0.06), T.top - 0.09, T.lip + 0.008), hex: DASHC.chrome });
  }
  // бардачок (пассажир — −x): крышка чуть выступает, хромовая ручка
  parts.push({ geo: new THREE.BoxGeometry(0.34, 0.13, 0.015), m: M4(-0.38, T.top - 0.2, T.lip + 0.003, 0.1), hex: DASHC.trim });
  parts.push({ geo: new THREE.BoxGeometry(0.06, 0.012, 0.012), m: M4(-0.38, T.top - 0.15, T.lip - 0.008, 0.1), hex: DASHC.chrome });
  // консоль: от панели вниз-назад к полу
  const cs = new THREE.Shape();
  cs.moveTo(T.lip + 0.02, T.low + 0.12); cs.lineTo(T.lip - 0.02, T.low - 0.02);
  cs.quadraticCurveTo(T.lip - 0.08, T.floor + 0.12, T.lip - 0.3, T.floor);
  cs.lineTo(T.lip + 0.1, T.floor); cs.lineTo(T.lip + 0.1, T.low + 0.12);
  parts.push({ geo: new THREE.ExtrudeGeometry(cs, { depth: 0.24, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 6 }), m: M4(0.12, 0, 0, 0, -Math.PI / 2, 0), hex: DASHC.plastic });
  // рычаг КПП: чехол-конус, хромовый стержень, чёрный шар
  const gz = T.lip - 0.3, gy = T.floor + 0.02;
  parts.push({ geo: new THREE.ConeGeometry(0.06, 0.1, 10), m: M4(0, gy + 0.05, gz, -0.25), hex: DASHC.boot });
  parts.push({ geo: new THREE.CylinderGeometry(0.008, 0.01, 0.22, 8), m: M4(0, gy + 0.15, gz - 0.025, -0.25), hex: DASHC.chrome });
  parts.push({ geo: new THREE.SphereGeometry(0.03, 12, 8), m: M4(0, gy + 0.26, gz - 0.055), hex: DASHC.dark });
  // зеркало заднего вида и козырьки
  parts.push({ geo: new THREE.CylinderGeometry(0.008, 0.008, 0.07, 6), m: M4(0, 1.36, 0.66, 0.5), hex: DASHC.dark });
  parts.push({ geo: new THREE.BoxGeometry(0.16, 0.05, 0.02), m: M4(0, 1.32, 0.64, 0.15), hex: DASHC.dark });
  for (const sx of [-1, 1]) parts.push({ geo: new THREE.BoxGeometry(0.36, 0.012, 0.15), m: M4(sx * 0.32, 1.39, 0.6, -0.12), hex: DASHC.visor });
  const mesh = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = 'torpedo';
  // лицо магнитолы и часов — холст
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#121115'; x.fillRect(0, 0, 128, 64);
  x.fillStyle = '#3d2a12'; x.fillRect(8, 10, 80, 16);
  x.fillStyle = '#ffb347'; for (let i = 0; i < 9; i++) x.fillRect(12 + i * 9, 18, 1, 6);
  x.fillStyle = '#ff3b1f'; x.fillRect(44, 12, 2, 12);
  x.fillStyle = '#9da2a9'; for (const cx of [16, 80]) { x.beginPath(); x.arc(cx, 44, 8, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = '#0b0b0c'; x.fillRect(96, 8, 26, 26);
  x.strokeStyle = '#e8e2d2'; x.lineWidth = 2; x.beginPath(); x.arc(109, 21, 10, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.moveTo(109, 21); x.lineTo(109, 14); x.moveTo(109, 21); x.lineTo(114, 23); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), new THREE.MeshBasicMaterial({ map: t }));
  face.position.set(0, T.low + 0.035, T.lip - 0.02);
  face.rotation.set(-0.35, Math.PI, 0);
  const g = new THREE.Group();
  g.add(mesh, face);
  return g;
}

/* курьер за рулём (как люди в игре — из коробок): оранжевая куртка, кепка, руки к рулю. Из-за руля (V) не виден */
const DRV = { jacket: 0xf0522a, dark: 0xc93f1f, skin: 0xe2b48c, pants: 0x2f3440 };
function driver (D, SW) {
  const parts = [], B = (w, h, d, hex, x, y, z, rx = 0) => parts.push({ geo: new THREE.BoxGeometry(w, h, d), m: M4(x, y, z, rx), hex });
  const y0 = D.seat;
  B(0.4, 0.14, 0.42, DRV.pants, 0, y0 + 0.07, D.z + 0.18);                 // бёдра на сиденье
  B(0.42, 0.5, 0.26, DRV.jacket, 0, y0 + 0.4, D.z - 0.02, -0.12);           // торс, чуть откинут
  B(0.2, 0.22, 0.21, DRV.skin, 0, y0 + 0.75, D.z + 0.01);                   // голова
  B(0.22, 0.07, 0.23, DRV.jacket, 0, y0 + 0.88, D.z);                       // кепка
  B(0.2, 0.025, 0.11, DRV.dark, 0, y0 + 0.86, D.z + 0.16);                  // козырёк
  for (const s of [-1, 1]) B(0.08, 0.08, 0.4, DRV.jacket, s * 0.17, y0 + 0.47, D.z + 0.2, -0.45);   // руки к рулю
  const g = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  g.position.x = D.x;
  g.name = 'driver';
  return g;
}

/* руль: тонкий чёрный обод, две спицы чуть вниз, мягкая накладка, колонка в торпедо */
function steeringWheel (SW) {
  const g = new THREE.Group(), rot = new THREE.Group();   // g — наклон колонки, rot — поворот руля
  const dark = lambert(0x1d1c20, false), pad = lambert(0x2a282d, false), chrome = lambert(0x9da3aa, false);
  rot.add(new THREE.Mesh(new THREE.TorusGeometry(SW.R, 0.016, 10, 40), dark));
  const hub = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.1, 6, 12), pad);
  hub.rotation.z = Math.PI / 2; hub.scale.set(1, 1, 0.55); hub.position.z = 0.012;
  rot.add(hub);
  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.006, 16), chrome);
  badge.rotation.x = Math.PI / 2; badge.position.z = -0.014;
  rot.add(badge);
  const L = SW.R - 0.06;
  for (const s of [-1, 1]) {
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.009, L, 8), dark);
    const a = s * (Math.PI / 2 + 0.28);              // от «вверх» на 106° в сторону: чуть ниже горизонта
    sp.position.set(-Math.sin(a) * (0.05 + L / 2), Math.cos(a) * (0.05 + L / 2), 0.004);
    sp.rotation.z = a; sp.scale.z = 0.6;
    rot.add(sp);
  }
  const low = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, SW.R - 0.05, 8), dark);
  low.position.set(0, -(SW.R / 2 + 0.02), 0.004);
  rot.add(low);
  g.add(rot);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.042, 0.32, 12), dark);
  col.rotation.x = Math.PI / 2; col.position.z = 0.18;
  g.add(col);
  const shroud = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.08, 4, 10), pad);
  shroud.rotation.x = Math.PI / 2; shroud.scale.set(1.1, 0.7, 1); shroud.position.set(0, -0.04, 0.13);
  g.add(shroud);
  g.position.set(...SW.C);
  g.rotation.x = SW.tilt;
  rot.name = 'sw-rot';                              // по имени находит dress: clone копирует userData как JSON, ссылки теряются
  return g;
}

/* щиток: козырёк над двумя круглыми приборами; лицо — холст, стрелки — отдельно (needle0 — спидометр, needle1 — тахометр) */
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
function cluster (D) {
  const g = new THREE.Group();
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.34, 18, 1, true, -Math.PI / 2, Math.PI), lambert(0x1d1c20));
  hood.material.side = THREE.DoubleSide;
  hood.rotation.z = Math.PI / 2; hood.scale.set(1, 1, 0.7); hood.position.set(0, 0, -0.02);
  g.add(hood);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshBasicMaterial({ map: gaugeFace() }));
  face.rotation.y = Math.PI;
  face.position.set(0, -0.025, 0.03);
  g.add(face);
  for (const s of [1, -1]) {
    const pv = new THREE.Group();
    pv.position.set(s * 0.075, -0.025, 0.027);
    const n = new THREE.Mesh(new THREE.BoxGeometry(0.0035, 0.05, 0.002), new THREE.MeshBasicMaterial({ color: 0xff6a2a }));
    n.position.y = 0.02;
    pv.add(n);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.004, 10), new THREE.MeshBasicMaterial({ color: 0x2b2b2e }));
    cap.rotation.x = Math.PI / 2;
    pv.add(cap);
    pv.name = s > 0 ? 'needle0' : 'needle1';
    g.add(pv);
  }
  g.position.set(...D.C);
  g.rotation.x = D.tilt;
  return g;
}

/* ─── стёкла: светлые и прозрачные; трещины — общий холст «паутина» ─── */
const GLASS = { CLEAR: 0.14, CRACK: 0.6, HEX: 0xdcecf7 };
let CRACK = null;
function crackTex () {
  if (CRACK) return CRACK;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.strokeStyle = 'rgba(255,255,255,0.95)'; x.lineWidth = 1.5;
  const cx = 78, cy = 56;
  for (let i = 0; i < 11; i++) {
    let a = i / 11 * Math.PI * 2 + Math.random() * 0.4, px = cx, py = cy;
    x.beginPath(); x.moveTo(px, py);
    for (let s = 0; s < 6; s++) { a += (Math.random() - 0.5) * 0.5; px += Math.cos(a) * 14; py += Math.sin(a) * 14; x.lineTo(px, py); }
    x.stroke();
  }
  x.lineWidth = 1;
  for (const r of [9, 20, 34]) {
    x.beginPath();
    for (let i = 0; i <= 22; i++) { const a = i / 22 * Math.PI * 2, rr = r * (0.8 + Math.random() * 0.4); x[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    x.stroke();
  }
  CRACK = new THREE.CanvasTexture(c);
  CRACK.magFilter = THREE.NearestFilter;
  return CRACK;
}

/* ─── краска и кровь на кузове (своя программа поверх «Ламберта») ───
   uPaint — цвет машины (маска краски — прозрачность картинки кузова); uBlood[i] — пятно: xyz — центр
   в осях модели, w — радиус (0 — нет). Ниже центра пятно вытянуто — стекает */
const BODY_BLOOD = { N: 40, GROW: 0.9, DRIP: 0.07, DRIP_MIN: 0.3, K: 1.5 };   // K — пятна крупнее (автор 13.10: «кровищи больше»)
function bodyShader (mat, U, paint) {
  mat.userData.dirt = 1;                            // cardirt.js свою программу не ставит — грязь и снег вставляем сами
  mat.onBeforeCompile = sh => {
    dirtInject(sh);
    sh.uniforms.uPaint = U.paint;
    sh.uniforms.uBlood = U.blood;
    sh.vertexShader = 'varying vec3 vBLoc;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvBLoc = transformed;');
    sh.fragmentShader = `uniform vec3 uPaint;\nuniform vec4 uBlood[${BODY_BLOOD.N}];\nvarying vec3 vBLoc;\n
float bH (vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }\n` +
      sh.fragmentShader
        .replace('#include <map_fragment>', paint ? `#ifdef USE_MAP
  vec4 tx = texture2D(map, vMapUv);
  diffuseColor.rgb *= mix(tx.rgb, tx.rgb * uPaint, tx.a);
#endif` : '#include <map_fragment>')
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  float bl = 0.0;
  vec3 q = floor(vBLoc * 22.0) / 22.0;
  for (int i = 0; i < ${BODY_BLOOD.N}; i++) {
    vec4 s = uBlood[i];
    if (s.w <= 0.0) continue;
    vec3 d = q - s.xyz;
    if (d.y < 0.0) d.y *= 0.3;
    float r = length(d) / s.w + (bH(q * 3.1 + float(i)) - 0.5) * 0.6;
    bl = max(bl, smoothstep(1.0, 0.7, r));
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.015, 0.02), bl * 0.92);
}`);
  };
  // ключ — свой у каждой машины: three вызывает onBeforeCompile только для новой программы, и вторая машина
  // с тем же ключом осталась бы без своих uPaint / uBlood — с цветом и кровью первой (после «починить», воскрешения)
  mat.customProgramCacheKey = () => 'realcar-body' + (paint ? '-paint-' : '-') + U.id;
}

/* ─── кровь на лобовом: холст на геометрии стекла; брызги растут, потёки текут вниз ─── */
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
  R.blood = { c, x: c.getContext('2d'), t, m, n: 0, drops: [] };
}
const RED = ['#7d0a10', '#9b0f15', '#b3161b'];
function glassBlood (B, side) {
  // брызги: со стороны удара гуще; каждая растёт от точки до своего размера за ~0,25 с; мелкие капли вокруг; потёки
  const cx = BLOOD.W * (0.5 + side * 0.25);
  for (let i = 0; i < 22; i++) {
    const x = Math.max(2, Math.min(BLOOD.W - 2, cx + (Math.random() - 0.5) * BLOOD.W * 0.9)), y = BLOOD.H * (0.1 + Math.random() * 0.8);
    B.drops.push({ x, y, r: 0.5, R: 3 + Math.random() * 7, vy: 0, t: 0, life: 0.3, hex: RED[i % 3] });
    for (let k = 0; k < 5; k++) B.drops.push({ x: x + (Math.random() - 0.5) * 22, y: y + (Math.random() - 0.5) * 14, r: 0.3, R: 0.6 + Math.random() * 1.2, vy: 0, t: 0, life: 0.2, hex: RED[k % 3] });
    if (Math.random() < 0.5) B.drops.push({ x, y, r: 1.4, R: 1.4, vy: 8 + Math.random() * 12, t: 0, life: 1.5 + Math.random() * 2.5, hex: RED[0] });
  }
  B.n = 1; B.m.visible = true;
}
function bloodTick (B, dt) {
  if (!B || !B.drops.length) return;
  const x = B.x;
  for (const d of B.drops) {
    d.t += dt;
    const k = Math.min(1, d.t / Math.max(0.05, d.life));
    if (d.vy) { d.y += d.vy * dt * (1 - k * 0.7); d.r = d.R * (1 - k * 0.4); }
    else d.r = d.R * Math.min(1, d.t / 0.25);
    x.fillStyle = d.hex;
    x.beginPath(); x.arc(d.x, d.y, Math.max(0.5, d.r), 0, Math.PI * 2); x.fill();
  }
  B.drops = B.drops.filter(d => d.t < d.life && d.y < BLOOD.H + 4);
  B.t.needsUpdate = true;
}
/* дождь для дворников: пока на стекле кровь — машут, как в дождь */
export const bloodWet = car => { const B = car && car.userData.real && car.userData.real.blood; return B && B.n > 0 ? BLOOD.WET : 0; };

/* сбил человека: wx, wz — где он был (мир) */
export function blood (car, wx, wz, kmh = 40) {
  const R = car && car.userData.real;
  if (!R) return;
  const C = R.C, L = new THREE.Vector3(wx === undefined ? car.position.x : wx, car.position.y + 0.8, wz === undefined ? car.position.z + 9 * Math.cos(car.rotation.y) : wz);
  car.updateMatrixWorld();
  car.worldToLocal(L).divideScalar(C.k);
  const { W2, HL } = C.box, end = Math.abs(L.z) / HL >= Math.abs(L.x) / W2;
  const nz = end ? Math.sign(L.z) || 1 : 0, nx = end ? 0 : Math.sign(L.x) || 1;
  const x = end ? Math.max(-W2, Math.min(W2, L.x)) : nx * W2, z = end ? nz * HL : Math.max(-HL, Math.min(HL, L.z));
  const add = (px, py, pz, r, drip) => {
    const v = R.bloodU.value[R.bloodI++ % BODY_BLOOD.N];
    v.set(px, py, pz, 0.01);
    R.splats = R.splats.filter(s => s.v !== v);
    R.splats.push({ v, R: r * BODY_BLOOD.K, t: 0, drip });
  };
  add(x, 0.6, z * 0.98, 0.3 + Math.random() * 0.15, 0);                      // удар — морда / бок
  add(x + (Math.random() - 0.5) * 0.6, 0.45, z * 0.99, 0.25, 1);                // бампер, стекает
  add(x + (Math.random() - 0.5) * 0.4, 0.75, z * 0.95, 0.18, 1);              // потёк
  if (end && nz > 0) { add(x * 0.8, 0.98, HL - 0.5 - Math.random() * 0.3, 0.35, 0); add(x * 0.5, 1.2, 0.9, 0.2, 0); }   // капот и стойки
  else if (!end) add(x, 1.0, z, 0.25, 1);                                       // дверь повыше
  // камера сзади — брызги перелетают на крышу, заднее стекло и корму (чем быстрее, тем больше)
  const n = kmh > 25 ? 1 + Math.floor(Math.min(3, kmh / 35)) : 0;
  for (let i = 0; i < n; i++) add((Math.random() - 0.5) * 1.2, 1.46, -0.6 + Math.random() * 1.2, 0.18 + Math.random() * 0.15, 0);   // крыша
  if (n > 1) { add((Math.random() - 0.5) * 1.0, 0.98, -HL + 0.55, 0.22, 1); add((Math.random() - 0.5) * 1.2, 0.75, -HL, 0.2, 1); }   // крышка багажника и корма
  if (R.blood && end && nz > 0 && R.panes.f && R.panes.f.st < 2) glassBlood(R.blood, Math.sign(x) || 0);
}

/* дворники стирают кровь: сектор от опоры до угла дворника (wipers.js: опоры px от середины, лежат влево) */
function wipeBlood (R, W) {
  const B = R.blood, F = R.glassF;
  if (!B || !(B.n > 0) || !W || !W.arms || !(W.a > 0.05)) return;
  const x = B.x;
  x.save();
  x.globalCompositeOperation = 'destination-out';
  x.translate(0, BLOOD.H);
  x.scale(BLOOD.W / F.w0, -BLOOD.H / F.H);
  for (const m of W.arms) {
    if (m.F !== F) continue;
    const ox = F.w0 / 2 + m.px;
    x.beginPath(); x.moveTo(ox, 0);
    for (let i = 0; i <= 12; i++) { const a = W.a * m.k * i / 12; x.lineTo(ox - Math.cos(a) * m.len * 1.05, Math.sin(a) * m.len * 1.05); }
    x.closePath(); x.fill();
  }
  x.restore();
  B.t.needsUpdate = true;
  if (W.a >= 1.7 && !B.drops.length) {
    const d = x.getImageData(0, 0, BLOOD.W, BLOOD.H).data;
    let left = 0;
    for (let i = 3; i < d.length; i += 16) if (d[i] > 40) left++;
    if (left < 6) { x.clearRect(0, 0, BLOOD.W, BLOOD.H); B.n = 0; B.m.visible = false; }
  }
}

function load (C) {
  if (CACHE[C.dir]) return CACHE[C.dir];
  const BASE = ROOT + C.dir + '/';
  CACHE[C.dir] = Promise.all([fetch(BASE + 'car.json').then(r => r.json()), fetch(BASE + 'car.bin').then(r => r.arrayBuffer())])
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
          mat.userData.body = !p.blend && /CarBody|Details_0/.test(p.name);   // кровь — на кузове и деталях
          mat.userData.paint = /CarBody/.test(p.name);                        // краска маской — только кузов
        }
        const m = new THREE.Mesh(geo, mat);
        m.name = 'real:' + p.name;
        if (p.blend || pane) m.renderOrder = 2;
        if (p.pivot) {
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
      if (C.torpedo) g.add(torpedo(C.torpedo));
      if (C.driver) g.add(driver(C.driver, C.sw));
      if (C.sw) g.add(steeringWheel(C.sw));
      if (C.dash) g.add(cluster(C.dash));
      if (window.__dlv) window.__dlv.REAL = REAL;
      return g;
    })
    .catch(e => { console.warn('realcar: модель не загрузилась', C.dir, e); return null; });
  return CACHE[C.dir];
}

/* лобовое для дворников (wipers.js): O — середина низа снаружи, ex — вбок, ey — вверх по стеклу, n — наружу, H, w;
   w0 — полная ширина (для крови); в осях машины (с увеличением k) */
function glassFrame (win, k) {
  const a = win.geometry.attributes.position;
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

export const has = id => REAL.on && !!MODELS[id];

export function dress (car, id = 'semerka', hex) {
  const C = MODELS[id];
  if (!REAL.on || !car || !C) return;
  load(C).then(M => {
    if (!M || car.userData.real) return;
    const ud = car.userData;
    const old = new THREE.Group();
    old.name = 'old-body';
    old.visible = false;
    for (const c of [...car.children]) old.add(c);   // позиции детей — в осях машины, подгруппа без сдвига: всё на месте
    car.add(old);
    const m = M.clone();
    m.scale.setScalar(C.k);
    car.add(m);
    const U = { id: ++SEQ, paint: { value: dull(new THREE.Color(hex || '#f0522a')) }, blood: { value: Array.from({ length: BODY_BLOOD.N }, () => new THREE.Vector4(0, 0, 0, 0)) } };   // w = 0 — пятна нет (у Vector4 по умолчанию w = 1)
    const R = { C, m, wheels: [], front: [], sw: null, needles: [], dent: [], panes: {}, glassF: null, blood: null, bloodU: U.blood, bloodI: 0, splats: [], paint: U.paint };
    const own = new Map();                           // у каждой машины свои материалы: взрыв красит их в чёрный (game.js gameOver)
    m.traverse(o => {
      if (o.isMesh) {
        if (!own.has(o.material)) {
          const mt = o.material.clone();
          if (o.material.userData.body) bodyShader(mt, U, o.material.userData.paint);
          own.set(o.material, mt);
        }
        o.material = own.get(o.material);
        if (/^real:(?!wheel)/.test(o.name)) { o.geometry = o.geometry.clone(); R.dent.push(o.geometry); }   // мнётся — своя сетка
        const pk = /^real:win([FBLR])$/.exec(o.name);
        if (pk) R.panes[pk[1].toLowerCase()] = { m: o, st: 0 };
      }
      if (/^wheel/.test(o.name)) { R.wheels.push(o.children[0]); if (o.name[6] === 'F') R.front.push(o); }
      if (o.name === 'sw-rot') R.sw = o;
      if (o.name === 'driver') R.driver = o;
      if (o.name === 'needle0') R.needles[0] = o;
      if (o.name === 'needle1') R.needles[1] = o;
    });
    if (R.panes.f) {
      R.glassF = glassFrame(R.panes.f.m, C.k);
      bloodLayer(R, R.panes.f.m);
      ud.realGlass = R.glassF;                       // дворники — по новому лобовому (wipers.js)
      ud.wipers = undefined;                         // уже собранные (по старому стеклу) ушли в old-body — собрать заново
    }
    REAL.k = C.k; REAL.eye.set(...C.eye);
    ud.real = R;
  });
}

/* вид из-за руля (game.js camStep): курьера не видно — ни головы, ни рук */
export function fp (car, on) {
  const R = car && car.userData.real;
  if (R && R.driver) R.driver.visible = !on;
}

/* перекрасить на ходу (гараж, песочница машин) */
export function paint (car, hex) {
  const R = car && car.userData.real;
  if (R) dull(R.paint.value.set(hex));
}
/* краска чуть тусклее заводской (автор 13.10: «цвета чуть тусклее, не такие яркие»): к серому на DULL.GRAY, темнее ×DULL.DARK */
const DULL = { GRAY: 0.22, DARK: 0.88 };
function dull (c) {
  const g = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
  return c.lerp(new THREE.Color(g, g, g), DULL.GRAY).multiplyScalar(DULL.DARK);
}

/* вмятина (game.js dentCar → тут же, как cardent.js hit): lx, lz — точка удара в осях машины, force — м/с.
   Числа — как у старого кузова (DENT в cardent.js): с 4 м/с, во всю глубину 0,3 м с 22 м/с, радиус 0,45—1,05 м;
   глубже 0,5 м от морды / кормы и 0,28 м от бока не мнётся — машина не складывается */
const DENT = { MIN: 4, FULL: 22, DEPTH: 0.3, R0: 0.45, R1: 0.6, IN_END: 0.5, IN_SIDE: 0.28 };
export function dent (car, lx, lz, force, rear) {
  const R = car && car.userData.real;
  if (!R || !(force > DENT.MIN)) return;
  if (!rear) rearDent(car, lx, lz, force);
  const K = R.C.k, { W2, HL } = R.C.box, x = lx / K, z = lz / K, k = Math.min(1, (force - DENT.MIN) / (DENT.FULL - DENT.MIN));
  const end = Math.abs(z) / HL >= Math.abs(x) / W2;
  const nx = end ? 0 : Math.sign(x) || 1, nz = end ? Math.sign(z) || 1 : 0;
  const cx = end ? Math.max(-W2, Math.min(W2, x)) : nx * W2, cz = end ? nz * HL : Math.max(-HL, Math.min(HL, z)), cy = 0.6;
  const depth = DENT.DEPTH * k / K, rad = (DENT.R0 + DENT.R1 * k) / K;
  for (const g of R.dent) {
    const a = g.attributes.position;
    let hit = false;
    for (let i = 0; i < a.count; i++) {
      const px = a.getX(i), py = a.getY(i), pz = a.getZ(i);
      if (end ? Math.abs(pz) < HL - DENT.IN_END : Math.abs(px) < W2 - DENT.IN_SIDE) continue;
      const d = Math.hypot(px - cx, (py - cy) * 0.8, pz - cz);
      if (d >= rad) continue;
      const f = (1 - d / rad) ** 2 * depth * (0.75 + 0.5 * Math.abs(Math.sin(px * 37 + py * 53 + pz * 71)));   // «мятый» шум
      a.setXYZ(i, px - nx * f, py - f * 0.15, pz - nz * f);
      hit = true;
    }
    if (hit) { a.needsUpdate = true; g.computeBoundingSphere(); }
  }
}
/* «Следы сзади» (как cardent.js REARD; автор 13.10: «ломаться чаще сзади» — камера сзади): любой удар не в корму
   мнёт и корму — REAR.K силы, в случайном месте по ширине, на высоте бампера */
const REAR = { K: 0.55 };
function rearDent (car, lx, lz, force) {
  const R = car.userData.real, { W2, HL } = R.C.box;
  if (lz / R.C.k < -HL * 0.6) return;                 // и так в корму
  const f = DENT.MIN + (force - DENT.MIN) * REAR.K;
  if (f > DENT.MIN) dent(car, (Math.random() - 0.5) * W2 * 1.4 * R.C.k, -(HL + 0.3) * R.C.k, f, true);
}

/* каждый кадр (game.js после колёс): spin — угол колёс, steerY — поворот передних, steer — руль −1…1,
   vf — скорость, м/с; dt — шаг. Колёса модели в k раз больше — крутятся в k раз медленнее */
export function step (car, spin, steerY, steer, vf, dt = 1 / 60) {
  const R = car.userData.real;
  if (!R) return;
  const a = spin / R.C.k;
  for (let i = 0; i < R.wheels.length; i++) R.wheels[i].rotation.x = a;
  for (let i = 0; i < R.front.length; i++) R.front[i].rotation.y = steerY;
  if (R.sw) R.sw.rotation.z = steer * R.C.sw.turn;
  if (R.needles.length) {
    const kmh = Math.abs(vf) * 3.6, rpm = 0.9 + (Math.abs(vf) % 9) / 9 * 4.5;   // тахометр — «передачи» каждые 9 м/с
    R.needles[0].rotation.z = -(-135 + 270 * Math.min(1, kmh / R.C.dash.KMH)) * Math.PI / 180;
    R.needles[1].rotation.z = -(-135 + 270 * Math.min(1, rpm / R.C.dash.RPM)) * Math.PI / 180;
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
  // заднее стекло — от износа зада (cardent.js REARD: 2 — трещины, 3 — разбито), как фонари у старого кузова
  const rw = car.userData.rear && car.userData.rear.st, pb = cg && cg.panes.find(p => p.k === 'b');
  if (pb && rw >= 2 && pb.st < (rw >= 3 ? 2 : 1)) pb.st = rw >= 3 ? 2 : 1;
  // кровь на кузове: пятна растут, потёки сползают вниз
  for (const s of R.splats) {
    if (s.t > 4) continue;
    s.t += dt;
    s.v.w = s.R * Math.min(1, s.t / BODY_BLOOD.GROW) ** 0.5;
    if (s.drip && s.v.y > BODY_BLOOD.DRIP_MIN) s.v.y -= BODY_BLOOD.DRIP * dt;
  }
  bloodTick(R.blood, dt);
  wipeBlood(R, car.userData.wipers);
}
