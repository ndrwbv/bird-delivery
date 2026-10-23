/* ──────────────────────────────────────────────────────────────────────────
   Три вида камеры в езде (автор 18.10.2026: «смену вида: от первого лица, от третьего высоко
   и от третьего средне-близко»). Правила словами — docs/CAREER.md «Камера: три вида».

     high — сзади, высоко: как было всегда (сама камера — game.js camStep, здесь не трогаем);
     near — сзади, близко: ниже и ближе к машине, сильнее отстаёт в повороте, шире кадр на скорости;
     cab  — из-за руля: глаза курьера, видно торпедо, руль с руками, щиток со стрелками и капот.

   Переключать: V (клавиатура), View / Back (геймпад), значок камеры на экране телефона, строка
   «камера» в настройках (таб «игра»). Запоминается (Store 'dlv-cam'), в сброс прогресса не входит.
   Катсцены, повтор, смерть, вступление, мини-игры у двери — со своими камерами, как раньше.

   Из-за руля: машину игрока прячем на кадр (FPV.hid в game.js), а салон рисуем вторым проходом
   поверх города (overlay): своя маленькая сцена, глубина очищена — сквозь торпедо и капот ничего
   не просвечивает, ближняя граница кадра города (0,4 м) не трогается, дальние дорожки не рябят.
   Капот — та же сетка, что у капота машины (вмятины видно), цвет — её же.

     CV.init(api)          — game.js: { THREE, Store, cam, V, S, car(), camClear, groundH, surfaceAt,
                             vmax(), lights() → { hemi, sun, amb }, toast, label }
     CV.mode() / set(m) / cycle()  — какой вид; cycle — следующий по кругу, вернёт его
     CV.fov(sp)            — обычный угол кадра вида (sp — доля максималки 0…1); нитро и бист-мод — сверху (game.js)
     CV.near(dt, vf, sh)   — поставить камеру «сзади, близко»
     CV.cab(dt, vf, sh)    — поставить камеру «из-за руля» и салон
     CV.overlay(renderer)  — нарисовать салон поверх (после renderer.render города); сам знает, нужен ли
   ────────────────────────────────────────────────────────────────────────── */
import './camview.css';
import { t } from '../i18n/index.js';
import * as TEL from './telemetry.js';          // анонимная статистика: смена вида камеры (telemetry.js)

export const MODES = ['high', 'near', 'cab'];
const KEY = 'dlv-cam';
/* числа видов */
export const CAMV = {
  NEAR: {
    dist: 6.6, distFast: 2.6,       // м за машиной: стоит — 6,6, на максималке — 9,2 (высокая: 12,5 → 17)
    h: 3.4, pullRaise: 0.5,         // м над машиной (высокая: 6,2; до 23.10.2026 — 2,3: машина загораживала дорогу впереди, 11с); у стены — ещё 0,5 на каждый метр, что пришлось подойти
    ahead: 9, lookH: 1,             // смотрит на точку в 9 м перед машиной, 1 м над дорогой (было 5,5 и 1,25) — машина в нижней трети кадра, дорога за ней видна
    yawK: 3.2, posK: 20,            // догоняет поворот медленнее высокой (4,5) — в повороте видно бок машины; за машиной держится плотно (высокая — 9)
    minBack: 2.2,                   // ближе к машине у стены не подходит
    fov: 68, fovFast: 7,            // угол кадра: 68° стоя, 75° на максималке (высокая — всегда 64)
  },
  CAB: {
    fov: 66, fovFast: 6,            // 66° стоя, 72° на максималке
    pitch: -0.06,                   // взгляд чуть вниз (рад) — торпедо и капот в кадре
    bob: 0.35, bobMax: 0.06,        // голову отбрасывает, когда машина резко идёт вниз / вверх: доля, предел, м
    sway: 0.05,                     // в повороте голову ведёт наружу, м (на полной скорости и полном руле)
    shakeK: 0.12,                   // тряска от ударов — 12 % от тряски камеры сзади
    wheelK: 5,                      // руль крутится в 5 раз сильнее колёс (полный — ~120°)
    kmhMax: 200,                    // спидометр до 200 км/ч
  },
};

let A = null, MODE = 'high', CAB = null;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const lerp = (a, b, k) => a + (b - a) * k;

export function init (api) {
  A = api;
  const v = A.Store ? A.Store.get(KEY, 'high') : 'high';
  MODE = MODES.includes(v) ? v : 'high';
  const b = typeof document !== 'undefined' && document.getElementById('cambtn');
  if (b) {
    b.addEventListener('click', e => { e.currentTarget.blur(); if (A.can && !A.can()) return; cycle(true); });
    sync();
  }
}

export const mode = () => MODE;
/** подпись вида для настроек и всплывашки */
export const label = (m = MODE) => m === 'cab' ? t('из-за руля') : m === 'near' ? t('сзади, близко') : t('сзади, высоко');

export function set (m, save = true) {
  if (!MODES.includes(m)) return MODE;
  MODE = m;
  if (save && A && A.Store) { A.Store.set(KEY, m); if (A.Store.flush) A.Store.flush(); }
  sync();
  return MODE;
}
/** следующий вид по кругу: высоко → близко → из-за руля → высоко; say — всплывашка «камера: …» */
export function cycle (say) {
  set(MODES[(MODES.indexOf(MODE) + 1) % MODES.length]);
  TEL.ev('setting', { id: 'cam', v: MODE, how: say ? 'key' : 'menu' });
  if (say && A && A.toast) A.toast(t('камера: {v}', { v: label() }));
  return MODE;
}
function sync () {
  const b = typeof document !== 'undefined' && document.getElementById('cambtn');
  if (!b) return;
  b.dataset.cam = MODE;
  const l = t('камера: {v}', { v: label() });
  b.title = l; b.setAttribute('aria-label', l);
}

/** угол кадра вида без нитро и бист-мода; sp — доля максималки */
export function fov (sp) {
  sp = clamp(sp || 0, 0, 1);
  return MODE === 'near' ? CAMV.NEAR.fov + CAMV.NEAR.fovFast * sp : MODE === 'cab' ? CAMV.CAB.fov + CAMV.CAB.fovFast * sp : 64;
}

/* ── сзади, близко ──
   Та же логика стен, что у высокой (game.js camStep): идём от машины назад и останавливаемся у первой
   стены дома (camClear: дома и большие стены, не деревья и столбы) — во дворах и узких проездах камера
   не залезает в дом, а подходит ближе и чуть поднимается. */
export function near (dt, vf, sh) {
  const { V, cam } = A, N = CAMV.NEAR, sp = clamp(Math.abs(vf) / (A.vmax() || 48), 0, 1);
  V.camH = damp(V.camH, V.h, N.yawK, dt);
  const full = N.dist + sp * N.distFast;
  const sx = Math.sin(V.camH), sz = Math.cos(V.camH);
  let back = full;
  for (let d = 1.6; d <= full; d += 0.5) if (!A.camClear(V.x - sx * d, V.z - sz * d)) { back = Math.max(N.minBack, d - 1.2); break; }
  const pull = full - back;
  V.camPull = damp(V.camPull || 0, pull, pull > (V.camPull || 0) ? 18 : 2.5, dt);
  const eff = full - V.camPull;
  const tx = V.x - sx * eff, tz = V.z - sz * eff;
  V.camX = damp(V.camX, tx, N.posK, dt);
  V.camZ = damp(V.camZ, tz, N.posK, dt);
  if (!A.camClear(V.camX, V.camZ)) { V.camX = tx; V.camZ = tz; }   // отстающая камера оказалась в стене — сразу на место
  const want = Math.max(V.y + N.h + V.camPull * N.pullRaise, A.groundH(V.camX, V.camZ) + 1.6);
  V.camY = damp(V.camY, want, 8, dt);
  sh = sh || 0;
  cam.position.set(V.camX + (sh ? (Math.random() * 2 - 1) * sh * 0.7 : 0), V.camY + (sh ? (Math.random() * 2 - 1) * sh * 0.7 : 0), V.camZ);
  const ax = V.x + Math.sin(V.h) * N.ahead, az = V.z + Math.cos(V.h) * N.ahead;
  const gy = V.air ? V.y : lerp(V.y, A.surfaceAt(ax, az, V.y), 0.6);    // в прыжке и полёте — на машину, не на землю под ней
  cam.lookAt(ax, gy + N.lookH, az);
}

/* ── из-за руля ── */
export function cab (dt, vf, sh) {
  const { V, cam } = A, C = CAMV.CAB, car = A.car();
  if (!CAB || CAB.car !== car) build(car);
  const K = CAB, u = car.userData;
  const sp = clamp(Math.abs(vf) / (A.vmax() || 48), 0, 1);
  K.M.compose(car.position, car.quaternion, car.scale);
  // голова: отстаёт от резких движений кузова вверх-вниз, в повороте её ведёт наружу, на скорости мелко дрожит
  const cy = car.position.y;
  K.fy = K.fy === null ? cy : damp(K.fy, cy, 16, dt);
  const bob = clamp((K.fy - cy) * C.bob, -C.bobMax, C.bobMax);
  K.tt += dt;
  const jit = sp * (Math.sin(K.tt * 13.7) * 0.0025 + Math.sin(K.tt * 7.1) * 0.0018);
  K.e.copy(K.eye);
  K.e.x -= (V.steerVis || 0) / 0.42 * sp * C.sway;
  K.e.applyMatrix4(K.M);
  K.e.y += bob + jit;
  const s = (sh || 0) * C.shakeK;
  if (s) { K.e.x += (Math.random() * 2 - 1) * s; K.e.y += (Math.random() * 2 - 1) * s; }
  cam.position.copy(K.e);
  // взгляд — по курсу, наклон кузова — сглаженный, крена нет: кочки не дёргают картинку, качается салон
  K.p = damp(K.p, V.pitch || 0, 4, dt);
  const p = K.p - C.pitch, cp = Math.cos(p);
  cam.up.set(0, 1, 0);
  cam.lookAt(K.e.x + Math.sin(V.h) * cp * 10, K.e.y - Math.sin(p) * 10, K.e.z + Math.cos(V.h) * cp * 10);
  // салон: в осях машины
  K.root.matrix.copy(K.M);
  K.root.matrixWorldNeedsUpdate = true;
  K.spin.rotation.z = -(V.steerVis || 0) * C.wheelK;
  const kmh = Math.hypot(V.vx, V.vz) * 3.6;
  K.kmh = damp(K.kmh, kmh, 9, dt);
  K.speedo.rotation.z = 2.356 - clamp(K.kmh / C.kmhMax, 0, 1.03) * 4.712;
  // тахометр: «передачи» — пилой по скорости, газ на месте — перегазовка
  const g = clamp(sp * 4.3, 0, 4.3), r = g >= 1 ? 0.35 + (g - Math.floor(g)) * 0.6 : g * 0.95;
  const rpm = Math.max(0.12 + (A.gas && A.gas() ? 0.25 : 0), r);
  K.rpm = damp(K.rpm, rpm, 7, dt);
  K.tacho.rotation.z = 2.356 - clamp(K.rpm, 0, 1) * 4.712;
  // лампы: красная — сердец мало, синяя — горит кофе
  const S = A.S;
  K.lampHp.visible = S.hp <= 2 && (S.hp <= 1 ? (K.tt * 3) % 1 < 0.6 : true);
  K.lampNos.visible = !!(A.nitro && A.nitro());
  // капот — сетка капота машины (вмятины), его положение и цвет; отлетел — нет
  const hm = u.hood && u.hood.m;
  if (K.hood && hm) {
    K.hood.visible = hm.parent === car && hm.visible !== false;
    K.hood.position.copy(hm.position); K.hood.quaternion.copy(hm.quaternion); K.hood.scale.copy(hm.scale);
    if (hm.material && hm.material.color) K.hood.material.color.copy(hm.material.color);
  }
  K.drawn = true;
  // для звука, отсечения и возврата в вид сзади — без рывка из-за спины
  V.camX = K.e.x; V.camZ = K.e.z; V.camY = K.e.y + 4; V.camH = V.h; V.camPull = 0;
}

/** салон поверх кадра города: зовёт game.js сразу после renderer.render(scene, cam) */
export function overlay (renderer) {
  if (!CAB || !CAB.drawn) return;
  CAB.drawn = false;
  const { cam } = A, K = CAB;
  const c = K.cam;
  c.position.copy(cam.position); c.quaternion.copy(cam.quaternion);
  if (c.fov !== cam.fov || c.aspect !== cam.aspect) { c.fov = cam.fov; c.aspect = cam.aspect; c.updateProjectionMatrix(); }
  // свет — как в городе сейчас: день, вечер, ночь, гроза
  const L = A.lights ? A.lights() : null;
  if (L) {
    if (L.hemi) { K.hemi.color.copy(L.hemi.color); K.hemi.groundColor.copy(L.hemi.groundColor); K.hemi.intensity = L.hemi.intensity; }
    if (L.amb) { K.amb.color.copy(L.amb.color); K.amb.intensity = L.amb.intensity; }
    if (L.sun) {
      K.sun.color.copy(L.sun.color); K.sun.intensity = L.sun.intensity * 0.8;   // в салоне солнце чуть слабее: крыша и стойки
      K.sun.position.copy(L.sun.position).sub(L.sun.target ? L.sun.target.position : K.zero).normalize().multiplyScalar(10);
    }
  }
  const ac = renderer.autoClear, ar = renderer.info.autoReset;
  renderer.autoClear = false; renderer.info.autoReset = false;   // вызовы отрисовки салона — к счёту кадра, а не вместо него
  renderer.clearDepth();
  renderer.render(K.scene, c);
  renderer.autoClear = ac; renderer.info.autoReset = ar;
}

/* ── салон кодом: по размерам кузова машины (CAR_SPEC / машины гаража), в осях машины ──
   +z — вперёд, +x — левый борт (водитель слева), y — вверх от земли. Числа салона — те же, что у курьера
   за стёклами (carglass.js cabin): где лобовое, где сидит водитель, высота стёкол. */
const SPEC0 = { L: 4.3, W: 1.74, h: 0.42, hood: 1.5, trunk: 1.05, cab: 2.0, cz: -0.22, ch: 0.62, r: 0.44 };
let DIAL_TEX = null;
function dialTex (THREE, kind) {
  DIAL_TEX = DIAL_TEX || {};
  if (DIAL_TEX[kind]) return DIAL_TEX[kind];
  const n = 128, c = document.createElement('canvas');
  c.width = c.height = n;
  const x = c.getContext('2d'), R = n / 2;
  x.fillStyle = '#16151a'; x.beginPath(); x.arc(R, R, R, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#3c3a44'; x.lineWidth = 5; x.beginPath(); x.arc(R, R, R - 3, 0, Math.PI * 2); x.stroke();
  const max = kind === 'speed' ? CAMV.CAB.kmhMax : 8, step = kind === 'speed' ? 20 : 1, big = kind === 'speed' ? 40 : 1;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let v = 0; v <= max; v += step) {
    const f = -135 + 270 * v / max, a = f * Math.PI / 180, s = Math.sin(a), co = Math.cos(a);
    const isBig = v % big === 0, r1 = R - 8, r0 = r1 - (isBig ? 12 : 7);
    x.strokeStyle = kind === 'tacho' && v >= 6 ? '#e8452c' : '#f2ead2'; x.lineWidth = isBig ? 4 : 2;
    x.beginPath(); x.moveTo(R + s * r0, R - co * r0); x.lineTo(R + s * r1, R - co * r1); x.stroke();
    if (isBig) {
      x.fillStyle = kind === 'tacho' && v >= 6 ? '#e8452c' : '#f2ead2';
      x.font = 'bold ' + (kind === 'speed' ? 15 : 17) + 'px sans-serif';
      const rt = r0 - 13;
      x.fillText(String(v), R + s * rt, R - co * rt + 1);
    }
  }
  x.fillStyle = '#9b958a'; x.font = 'bold 11px sans-serif';
  x.fillText(kind === 'speed' ? t('км/ч') : 'x1000', R, R + 30);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.LinearFilter; tx.generateMipmaps = false;
  return (DIAL_TEX[kind] = tx);
}

function dispose () {
  if (!CAB) return;
  CAB.root.traverse(o => {
    if (!o.isMesh) return;
    if (o !== CAB.hood && o.geometry) o.geometry.dispose();
    if (o.material && !o.material.userData.shared) o.material.dispose();
  });
}

function build (car) {
  const { THREE } = A;
  const old = CAB;
  dispose();
  const u = car.userData || {}, S = u.spec || SPEC0, W = u.W || S.W || 1.74, dy = u.dy || 0;
  const y0 = 0.2 + S.h / 2 + 0.22 + dy, top = y0 + S.h / 2;
  const ch = S.ch, cy = top + ch / 2, gh = ch * 0.72, gb = cy + 0.02 - gh / 2, gt = cy + 0.02 + gh / 2, roof = top + ch;
  const cf = S.cz + S.cab / 2, dz = cf - Math.min(0.78, S.cab * 0.38), dx = W * 0.22;
  const hl = u.hl || S.L / 2;
  const ey = gb + 0.23, ez = dz + 0.04;           // глаза — на 23 см выше низа лобового: у низких кабриолетов торпедо не закрывает дорогу
  const scene = old ? old.scene : new THREE.Scene();
  if (old) scene.remove(old.root);
  const root = new THREE.Group();
  root.matrixAutoUpdate = false;
  scene.add(root);
  const mats = {};
  const mat = (hex, basic) => {
    const k = hex + (basic ? 'b' : '');
    return mats[k] || (mats[k] = basic ? new THREE.MeshBasicMaterial({ color: hex }) : new THREE.MeshLambertMaterial({ color: hex, flatShading: true }));
  };
  const box = (w, h, d, hex, x, y, z, rx = 0, ry = 0, rz = 0, parent = root) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof hex === 'string' ? mat(hex) : hex);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  };
  /* брусок между двумя точками (стойки) */
  const bar = (w, d, hex, a, b) => {
    const dy2 = b[1] - a[1], dz2 = b[2] - a[2], len = Math.hypot(dy2, dz2);
    return box(w, len, d, hex, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, Math.atan2(dz2, dy2), 0, 0);
  };
  const paint = u.bodyHex || '#f0522a';
  const paintDk = '#' + new THREE.Color(paint).multiplyScalar(0.72).getHexString();
  const DASH = '#3b3640', DASH_T = '#302c34', PANEL = '#1c1b20', TRIM = '#4a4550', LINING = '#c4b99e', WHEEL = '#121114';
  const open = !!u.open;

  // крылья и верх кузова перед лобовым (по бокам капота и в щели у лобового)
  box(W - 0.02, 0.05, Math.max(0.1, hl - 0.08 - cf), paintDk, 0, top - 0.02, (cf + hl - 0.08) / 2);
  // капот — сетка капота машины (вмятины видно), цвет — её материала
  let hood = null;
  const hm = u.hood && u.hood.m;
  const hoodIn = hm && hm.position.z < cf;          // «капот» внутри салона (у «Буханки» мотор между сиденьями) — его не рисуем
  if (hm && hm.geometry && !hoodIn) {
    hood = new THREE.Mesh(hm.geometry, new THREE.MeshLambertMaterial({ color: paint, flatShading: true }));
    root.add(hood);
  } else if (!hoodIn && hl - (S.hood || 1.4) / 2 - 0.05 > cf) box(W - 0.06, 0.16, S.hood || 1.4, paint, 0, top + 0.06, hl - (S.hood || 1.4) / 2 - 0.05);
  // торпедо: корпус, мягкий верх, козырёк щитка над приборами
  const dz0 = ez + 0.46, dz1 = cf + 0.02, dH = gb + 0.03 - (top - 0.12);
  box(W - 0.2, dH, dz1 - dz0, DASH, 0, top - 0.12 + dH / 2, (dz0 + dz1) / 2);
  box(W - 0.24, 0.035, dz1 - dz0 - 0.04, DASH_T, 0, gb + 0.045, (dz0 + dz1) / 2 + 0.02);
  box(0.36, 0.03, 0.06, DASH_T, dx, gb + 0.1, dz0 - 0.01);                    // козырёк щитка
  box(0.36, 0.115, 0.012, PANEL, dx, gb + 0.012, dz0 - 0.006);               // лицо щитка — выступает из торпедо
  // бардачок и магнитола — у пассажира и по центру
  box(0.34, 0.12, 0.02, TRIM, -W * 0.24, gb - 0.07, dz0 - 0.005);
  box(0.2, 0.06, 0.02, PANEL, 0.02, gb - 0.05, dz0 - 0.005);
  box(0.16, 0.012, 0.022, '#3fb8a8', 0.02, gb - 0.04, dz0 - 0.01);           // окошко магнитолы
  // щиток: спидометр (слева) и тахометр, стрелки, лампы
  const dialZ = dz0 - 0.014, dialY = gb + 0.012, dialR = 0.048;
  const gauge = (x, kind) => {
    const g = new THREE.Group();
    g.position.set(x, dialY, dialZ); g.rotation.y = Math.PI;               // лицом к водителю
    root.add(g);
    const face = new THREE.Mesh(new THREE.CircleGeometry(dialR, 24), new THREE.MeshBasicMaterial({ map: dialTex(THREE, kind), color: 0xdcdcdc }));
    g.add(face);
    const nd = new THREE.Group();
    nd.position.z = 0.003;
    g.add(nd);
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.0045, dialR * 0.86, 0.002), mat('#ff5a2a', true));
    needle.position.y = dialR * 0.36;
    nd.add(needle);
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.008, 10), mat('#2a2930', true));
    cap.position.z = 0.002;
    nd.add(cap);
    return nd;
  };
  const speedo = gauge(dx + 0.072, 'speed'), tacho = gauge(dx - 0.072, 'tacho');
  const lamp = (hex, x) => { const m = box(0.016, 0.012, 0.004, mat(hex, true), x, dialY - 0.035, dialZ - 0.004); m.visible = false; return m; };
  const lampHp = lamp('#ff3b2a', dx + 0.008), lampNos = lamp('#6fd3ff', dx - 0.012);
  // руль: колонка, обод, три спицы, руки курьера (рукава — оранжевая куртка)
  const wz = ez + 0.31, wy = gb - 0.05, wr = 0.165, tilt = 0.44;
  box(0.05, 0.05, 0.2, PANEL, dx, wy - 0.045, wz + 0.09, tilt);             // колонка — вперёд и вниз, в торпедо
  const tg = new THREE.Group();
  tg.position.set(dx, wy, wz); tg.rotation.x = tilt;
  root.add(tg);
  const spin = new THREE.Group();
  tg.add(spin);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(wr, 0.02, 6, 22), mat(WHEEL));
  spin.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.035, 10).rotateX(Math.PI / 2), mat('#26252b'));
  spin.add(hub);
  box(0.022, 0.006, 0.01, mat('#c9a43a'), 0, 0, -0.019, 0, 0, 0, spin);     // значок на гудке
  for (const a of [Math.PI / 2, Math.PI * 7 / 6, -Math.PI / 6]) {
    const sx = Math.cos(a), sy = -Math.sin(a);
    box(0.02, wr - 0.04, 0.012, mat(WHEEL), sx * (wr / 2 + 0.01), sy * (wr / 2 + 0.01), 0, 0, 0, Math.atan2(sy, sx) - Math.PI / 2, spin);
  }
  for (const s of [1, -1]) {
    const a = s * Math.PI * 0.36, hx = Math.sin(a) * wr, hy = Math.cos(a) * wr;
    box(0.026, 0.042, 0.03, '#e2b48c', hx, hy, -0.014, 0, 0, -a, spin);                        // кисти на ободе («на десять и два»)
  }
  // двери изнутри: обивка, подлокотник, верх двери у стекла
  for (const s of [1, -1]) {
    const x = s * (W / 2 - 0.05), z0 = ez - 0.7, z1 = cf + 0.08;
    box(0.06, gb - (top - 0.2), z1 - z0, TRIM, x, (gb + top - 0.2) / 2, (z0 + z1) / 2);
    box(0.1, 0.035, z1 - z0, PANEL, x - s * 0.02, gb + 0.005, (z0 + z1) / 2);
    box(0.08, 0.04, 0.32, PANEL, x - s * 0.06, gb - 0.11, ez - 0.05);
  }
  // пол, стенка под торпедо и сиденье пассажира (0ад, 23.10.2026: «в машине нет пола — видно при ускорении»): салон
  // качается с кузовом, а взгляд — сглаженно, и на разгоне из-под торпедо и между сиденьями была видна дорога
  const fy = top - S.h + 0.1, fz0 = ez - 1.1;
  box(W - 0.1, 0.04, dz1 - fz0, '#2c2a2e', 0, fy, (fz0 + dz1) / 2);                       // пол — коврик
  box(W - 0.2, top - 0.12 - fy, 0.08, PANEL, 0, (top - 0.12 + fy) / 2, dz0 + 0.18);       // стенка под торпедо, у ног
  box(0.2, 0.16, dz0 + 0.18 - (ez - 0.2), DASH_T, 0, fy + 0.08, (dz0 + 0.18 + ez - 0.2) / 2);   // тоннель между сиденьями
  for (const s of [1, -1]) box(0.06, top - 0.2 - fy, ez + 0.9 - fz0, TRIM, s * (W / 2 - 0.05), (top - 0.2 + fy) / 2, (fz0 + ez + 0.9) / 2);   // низ дверей — до пола
  box(0.5, 0.12, 0.5, '#5d3d24', -dx, fy + 0.26, ez - 0.02);                                 // сиденье пассажира: подушка
  box(0.5, 0.62, 0.12, '#7a5232', -dx, fy + 0.62, ez - 0.32, -0.18);                         // спинка
  // дворники лежат у низа лобового
  for (const x of [0.32, -0.18]) box(0.5, 0.012, 0.014, '#141317', x, gb + 0.015, cf + 0.03, 0, 0.12, 0);
  // рама лобового, крыша изнутри, козырьки, зеркало (у кабриолета — только низкая рамка стекла)
  if (!open) {
    for (const s of [1, -1]) bar(0.085, 0.11, TRIM, [s * (W / 2 - 0.1), gb - 0.02, cf + 0.02], [s * (W / 2 - 0.13), gt + 0.02, cf - 0.26]);
    box(W - 0.2, 0.06, 0.1, TRIM, 0, gt + 0.04, cf - 0.27);                  // верх рамы
    box(W - 0.14, 0.04, Math.max(0.3, cf - 0.3 - (ez - 0.6)), LINING, 0, roof - 0.04, (cf - 0.3 + ez - 0.6) / 2);
    for (const s of [1, -1]) box(0.34, 0.015, 0.16, LINING, s * dx, gt - 0.005, cf - 0.4, -0.25, 0, 0);
    box(0.03, 0.05, 0.03, PANEL, 0, gt + 0.0, cf - 0.22);
    box(0.17, 0.05, 0.022, PANEL, 0, gt - 0.045, cf - 0.21);                 // зеркало заднего вида
    box(0.155, 0.036, 0.004, mat('#a9bccb', true), 0, gt - 0.045, cf - 0.223);
  } else {
    box(W - 0.24, 0.04, 0.05, TRIM, 0, gb + 0.12, cf - 0.04, -0.6, 0, 0);
  }

  const K = old || {
    scene, cam: new THREE.PerspectiveCamera(64, 1, 0.03, 30), zero: new THREE.Vector3(),
    hemi: new THREE.HemisphereLight(0xffffff, 0xffffff, 1), amb: new THREE.AmbientLight(0xffffff, 0.5), sun: new THREE.DirectionalLight(0xffffff, 1),
    M: new THREE.Matrix4(), e: new THREE.Vector3(), eye: new THREE.Vector3(),
  };
  if (!old) scene.add(K.hemi, K.amb, K.sun);
  Object.assign(K, { car, root, spin, speedo, tacho, hood, lampHp, lampNos, fy: null, p: 0, tt: 0, kmh: 0, rpm: 0, drawn: false });
  K.eye.set(dx, ey, ez);
  CAB = K;
  if (A.renderer) try { A.renderer().compile(scene, K.cam); } catch (e) { /* — */ }   // программы шейдеров — сразу, а не рывком в первом кадре
}

export const DEBUG = {
  get mode () { return MODE; }, CAMV,
  get cab () { return CAB ? { built: true, eye: CAB.eye.toArray().map(v => +v.toFixed(3)), wheel: +CAB.spin.rotation.z.toFixed(3), speedo: +CAB.speedo.rotation.z.toFixed(3), kmh: Math.round(CAB.kmh), meshes: CAB.root.children.length } : null; },
};
