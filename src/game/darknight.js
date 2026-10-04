/* ──────────────────────────────────────────────────────────────────────────
   Тёмная ночь — каждую ночь (docs/IDEAS.md блок 11; правила словами —
   docs/CAREER.md «Тёмная ночь»). Обе версии; что иначе в детской — ниже.

   Когда: с 23:00 до 5:00 по часам мира (DARK.FROM / TO), только в открытых
   районах. К утру всё рассасывается: костры гаснут (дым), дикари и ведьмы
   расходятся (LEAVE с) и пропадают; днём их нет.

   1. Костры дикарей-бургеров (CAMP). Места — свободные пустыри у улиц,
      тем же отбором, что стройки (construction.js freeLots): участок 24 × 18 м,
      не ближе 15 м к стройкам, CAMP.GAP друг к другу, по одному на район,
      потом до CAMP.MAX. На месте: костёр в кольце камней (пламя светится,
      свет на земле и ореол), вертел — во взрослой свинья и бургер, в детской
      кукуруза и сосиски; 3—5 дикарей-бургеров в шкурах с дубинками пляшут
      вокруг костра. Сбил дикаря — разлетается булками и котлетой (обе
      версии), во взрослой ночью встаёт привидением. Въехал в костёр — искры,
      машину чуть тормозит.
   2. Ведьмы с котлами (POT). Тоже пустыри: 12 × 10 м, POT.GAP друг к другу,
      не ближе 15 м к стройкам и кострам. Ведьма в остроконечной шляпе, лицо
      зелёное, мешает зелёную жижу в чёрном котле на огне; подъехал ближе
      SAY_R — дразнится. Врезался в котёл — котёл опрокидывается по ходу
      удара, жижа разливается лужей (до PUDDLE.R м), лежит, потом
      улетучивается в небо зелёным дымом. Ведьму сбить — как прохожего (hits.js).
   3. Привидения (GHOST). Сбитый ночью (любой прохожий, ведьма, дикарь)
      через RISE с встаёт привидением: полупрозрачный, плывёт дальше туда,
      куда шёл, покачиваясь, сквозь стены. Сбил его ещё раз — рассеивается.
      Живёт LIFE с, утром тает. Во взрослой — бледный силуэт человека,
      в детской — смешная простынка с глазами.
   Появляется и пропадает только вне кадра (дальше HIDE_R или за спиной
   камеры) и ближе WANT_R к машине. Перф: общие геометрии и материалы,
   дикарь — 5 мешей, анимация только ближе ANIM_R.
   Из game.js: build(api) — после строек, step(dt) — каждый кадр,
   onHit(p, vx, vz) — из gibHuman (сбит человек).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t, N_ } from '../i18n/index.js';
import { hourOf } from './econ.js';
import * as CONSTR from './construction.js';
import * as HITS from './hits.js';

export const DARK = {
  FROM: 23, TO: 5,              // часы мира
  WANT_R: 230, HIDE_R: 140, DROP_R: 300, ANIM_R: 170, SHOW_R: 220,
  LEAVE: 14,                    // с: утром расходятся
};
export const CAMP = { MAX: 8, GAP: 350, W: 24, D: 18, N: [3, 5], RING: 3.4, FIRE_R: 1.1 };
export const POT = { MAX: 8, GAP: 300, W: 12, D: 10, R: 0.75, SAY_R: 18, SAY_CD: 7 };
export const PUDDLE = { R: 3.6, GROW: 1.5, STAY: 4, FUME: 7 };
export const GHOST = { MAX: 8, RISE: 1.2, LIFE: 90, SPEED: 1.2, R: 0.45, FAR: 260 };

const SAVAGE_LINES = [N_('Ууга!'), N_('Ууга-ууга!'), N_('мясо!'), N_('огонь — наш!'), N_('пляши с нами!')];
const WITCH_LINES = [N_('хи-хи-хи!'), N_('не подходи — заколдую!'), N_('отвар не для курьеров'), N_('пицца с мухоморами — завтра'), N_('кыш, кыш!')];

let A = null;
const CAMPS = [], POTS = [], GHOSTS = [], PUDDLES = [];
const STATS = { camps: 0, pots: 0, liveCamps: 0, livePots: 0, savages: 0, witches: 0, ghosts: 0, raised: 0, dispelled: 0, tipped: 0, puddles: 0, savHit: 0, fireHit: 0, ms: 0 };
let scanT = 0;

const hash = (x, z, k) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
const rand = (a, b) => a + Math.random() * (b - a);
const clockH = () => hourOf(A.ENV.t) % 24;
const nightNow = () => { const h = clockH(); return h >= DARK.FROM || h < DARK.TO; };
const openAt = (x, z) => !A.isOpenAt || A.isOpenAt(x, z);

const FR = new THREE.Frustum(), FM = new THREE.Matrix4(), SPH = new THREE.Sphere();
function frustum () { FM.multiplyMatrices(A.cam.projectionMatrix, A.cam.matrixWorldInverse); FR.setFromProjectionMatrix(FM); }
function inView (x, y, z, r) { SPH.center.set(x, y, z); SPH.radius = r; return FR.intersectsSphere(SPH); }

/* машина задевает точку (x, z) с радиусом r */
function carHits (x, z, r) {
  const V = A.V, fx = Math.sin(V.h), fz = Math.cos(V.h), dx = x - V.x, dz = z - V.z;
  return Math.abs(dx * fx + dz * fz) < A.CAR_L + r && Math.abs(dx * fz - dz * fx) < A.CAR_W + r;
}

/* ═════════════ общие геометрии и материалы ═════════════ */
const R = {};
const keep = m => { m.userData.keep = true; return m; };
function glowTex (inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 1, 32, 32, 31);
  g.addColorStop(0, inner); g.addColorStop(0.35, outer); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}
const add = { blending: THREE.AdditiveBlending, transparent: true, depthWrite: false };
function res () {
  if (R.ok) return R;
  R.ok = 1;
  R.vc = keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  R.fire = keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#5a2a0a' }));   // отсвет костра
  R.vc2 = keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  R.flame = ['#ff6a14', '#ffa62a', '#ffe27a'].map(c => keep(new THREE.MeshBasicMaterial({ color: c, ...add, opacity: 0.9 })));
  R.flameGeo = new THREE.ConeGeometry(0.45, 1.3, 7, 1, true); R.flameGeo.translate(0, 0.65, 0);
  R.glowFire = keep(new THREE.MeshBasicMaterial({ map: glowTex('rgba(255,190,90,1)', 'rgba(255,110,30,.55)'), ...add }));
  R.glowGreen = keep(new THREE.MeshBasicMaterial({ map: glowTex('rgba(170,255,120,1)', 'rgba(80,220,60,.5)'), ...add }));
  R.plane = new THREE.PlaneGeometry(1, 1); R.plane.rotateX(-Math.PI / 2);
  R.halo = keep(new THREE.SpriteMaterial({ map: R.glowFire.map, ...add, opacity: 0.55 }));
  R.liquid = keep(new THREE.MeshBasicMaterial({ color: '#7dff3a' }));
  R.bubble = new THREE.SphereGeometry(0.07, 6, 4);
  R.disc = new THREE.CircleGeometry(1, 22); R.disc.rotateX(-Math.PI / 2);
  R.puffGeo = new THREE.IcosahedronGeometry(0.5, 0);
  // дикарь-бургер: тело одним мешем, руки и ноги — с шарниром наверху
  const P = A.put, cyl = (r1, r2, h, n = 12) => new THREE.CylinderGeometry(r1, r2, h, n);
  let L = [];
  P(L, cyl(0.47, 0.52, 0.3, 10), '#b9832f', 0, 0.52, 0);                               // шкура-набедренник
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; P(L, A.boxGeo(0.12, 0.08, 0.04), '#4a2f12', Math.sin(a) * 0.5, 0.5 + (i % 2) * 0.08, Math.cos(a) * 0.5, 0, a, 0); }
  P(L, cyl(0.44, 0.4, 0.2), '#d9973e', 0, 0.74, 0);                                    // нижняя булка
  P(L, cyl(0.48, 0.48, 0.13), '#5a3018', 0, 0.9, 0);                                   // котлета
  P(L, A.boxGeo(0.84, 0.04, 0.84), '#ffc93a', 0, 0.975, 0, 0, Math.PI / 4, 0);         // сыр
  P(L, cyl(0.5, 0.5, 0.05, 10), '#5fbf3a', 0, 1.0, 0);                                 // салат
  P(L, cyl(0.42, 0.42, 0.05, 10), '#d8322a', 0, 1.04, 0);                              // помидор
  P(L, new THREE.SphereGeometry(0.46, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.75, 1), '#e3a24a', 0, 1.06, 0);   // верхняя булка
  for (let i = 0; i < 7; i++) { const a = i * 2.4, r = 0.12 + (i % 3) * 0.08; P(L, A.boxGeo(0.06, 0.03, 0.03), '#fff6dc', Math.sin(a) * r, 1.38 - r * 0.25, Math.cos(a) * r, 0, a, 0); }
  for (const s of [-1, 1]) {
    P(L, A.boxGeo(0.15, 0.15, 0.04), '#ffffff', s * 0.15, 1.2, 0.4);
    P(L, A.boxGeo(0.07, 0.08, 0.03), '#111111', s * 0.15, 1.19, 0.425);
    P(L, A.boxGeo(0.16, 0.035, 0.03), '#3a2010', s * 0.15, 1.31, 0.39, 0, 0, s * 0.35);   // злые брови
    P(L, A.boxGeo(0.07, 0.07, 0.03), '#fffaf0', s * 0.07, 0.95, 0.48);                    // зубы
  }
  P(L, A.boxGeo(0.46, 0.06, 0.06), '#f4efe2', 0, 1.47, 0, 0, 0, 0.3);                   // кость в «причёске»
  for (const s of [-1, 1]) P(L, A.boxGeo(0.1, 0.12, 0.1), '#f4efe2', s * 0.22, 1.47 + s * 0.07, 0);
  R.savBody = A.mergeGeos(L);
  L = [];
  P(L, A.boxGeo(0.13, 0.5, 0.13), '#e7b98a', 0, -0.25, 0);
  P(L, A.boxGeo(0.17, 0.07, 0.24), '#6a4a2a', 0, -0.5, 0.05);
  R.savLeg = A.mergeGeos(L);
  L = [];
  P(L, A.boxGeo(0.1, 0.45, 0.1), '#e7b98a', 0, -0.22, 0);
  R.savArm = A.mergeGeos(L);
  L = [];
  P(L, A.boxGeo(0.1, 0.45, 0.1), '#e7b98a', 0, -0.22, 0);
  P(L, A.boxGeo(0.08, 0.7, 0.08), '#8a5a2a', 0, -0.5, 0.12, 0.4, 0, 0);                // дубина
  P(L, A.boxGeo(0.18, 0.24, 0.18), '#7a4a22', 0, -0.82, 0.27, 0.4, 0, 0);
  R.savArmR = A.mergeGeos(L);
  // жаркое на вертеле (вдоль x)
  L = [];
  if (A.ADULT) {
    P(L, new THREE.SphereGeometry(0.5, 10, 7).scale(1.5, 0.75, 0.8), '#c9744a', 0, 0, 0);   // свинья
    P(L, new THREE.SphereGeometry(0.3, 8, 6), '#c9744a', 0.82, 0.04, 0);
    P(L, cyl(0.12, 0.12, 0.12, 8), '#e88a8a', 1.1, 0.02, 0, 0, 0, Math.PI / 2);
    P(L, new THREE.SphereGeometry(0.1, 6, 4), '#d8322a', 1.2, 0.02, 0);                // яблоко во рту
    for (const s of [-1, 1]) P(L, A.boxGeo(0.12, 0.14, 0.05), '#b8603a', 0.82, 0.28, s * 0.15, 0, 0, s * 0.3);
    for (const [a, b] of [[0.4, 1], [0.4, -1], [-0.45, 1], [-0.45, -1]]) P(L, A.boxGeo(0.1, 0.36, 0.1), '#b8603a', a, -0.4, b * 0.2);
    // и бургер — свой же
    P(L, cyl(0.26, 0.24, 0.12), '#d9973e', -1.15, -0.12, 0); P(L, cyl(0.28, 0.28, 0.08), '#5a3018', -1.15, -0.02, 0);
    P(L, new THREE.SphereGeometry(0.27, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1), '#e3a24a', -1.15, 0.02, 0);
  } else {
    for (const x of [-0.95, 0, 0.95]) {                                                   // кукуруза
      P(L, cyl(0.11, 0.09, 0.5, 8), '#ffd23a', x, 0, 0, 0, 0, Math.PI / 2);
      P(L, A.boxGeo(0.25, 0.04, 0.22), '#6abf3a', x - 0.22, -0.08, 0);
    }
    for (const x of [-0.48, 0.48]) P(L, cyl(0.075, 0.075, 0.45, 8), '#b4442a', x, -0.02, 0, 0, 0, Math.PI / 2);   // сосиски
  }
  R.roast = A.mergeGeos(L);
  // костёр: камни, поленья, вертел, брёвна-скамейки (в своих осях: x — вдоль улицы)
  L = [];
  for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2; P(L, A.boxGeo(0.34, 0.22, 0.3), i % 2 ? '#7a7570' : '#8a857e', Math.sin(a) * 1.05, 0.11, Math.cos(a) * 1.05, 0, a, 0); }
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI; P(L, A.boxGeo(1.25, 0.16, 0.16), '#4a3020', 0, 0.12 + i * 0.03, 0, 0, a, 0.18); }
  for (const s of [-1, 1]) {
    P(L, A.boxGeo(0.09, 1.55, 0.09), '#5a3a22', s * 1.7, 0.78, 0);
    P(L, A.boxGeo(0.07, 0.3, 0.07), '#5a3a22', s * 1.7 - 0.08, 1.6, 0, 0, 0, 0.5);
    P(L, A.boxGeo(0.07, 0.3, 0.07), '#5a3a22', s * 1.7 + 0.08, 1.6, 0, 0, 0, -0.5);
  }
  P(L, A.boxGeo(3.8, 0.05, 0.05), '#9a9a9a', 0, 1.5, 0);
  for (const [x, z, a] of [[-4.6, 3.2, 0.5], [4.4, 3.6, -0.6], [0.3, 5.6, 0.05]]) P(L, A.boxGeo(2.2, 0.38, 0.38), '#6a4a2a', x, 0.19, z, 0, a, 0);
  for (const [x, z] of [[2.6, -2.4], [-2.9, -1.8], [3.5, 1.2]]) P(L, A.boxGeo(0.4, 0.06, 0.06), '#f4efe2', x, 0.04, z, 0, x, 0);   // косточки
  R.campBase = A.mergeGeos(L);
  // котёл: чаша, обод, три ножки, огонь под ним (поленья)
  L = [];
  P(L, new THREE.SphereGeometry(0.62, 12, 8, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.7), '#1e1e22', 0, 0.75, 0);
  P(L, new THREE.TorusGeometry(0.5, 0.05, 5, 14), '#2a2a30', 0, 0.75 + 0.364, 0, Math.PI / 2);
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; P(L, A.boxGeo(0.07, 0.42, 0.07), '#1e1e22', Math.sin(a) * 0.4, 0.21, Math.cos(a) * 0.4, Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3); }
  R.pot = A.mergeGeos(L);
  L = [];
  for (let i = 0; i < 4; i++) P(L, A.boxGeo(0.9, 0.12, 0.12), '#4a3020', 0, 0.08, 0, 0, i / 4 * Math.PI, 0);
  R.potLogs = A.mergeGeos(L);
  // привидения: взрослое — бледный силуэт, детское — простынка с глазами
  L = [];
  if (A.ADULT) {
    P(L, new THREE.SphereGeometry(0.24, 10, 8).scale(1, 1.15, 1), '#dfeeff', 0, 1.62, 0);
    for (const s of [-1, 1]) P(L, new THREE.SphereGeometry(0.06, 6, 4), '#0d1830', s * 0.09, 1.66, 0.2);
    P(L, new THREE.SphereGeometry(0.06, 6, 4).scale(1, 1.6, 1), '#0d1830', 0, 1.52, 0.21);
    P(L, cyl(0.26, 0.05, 1.25, 10), '#cfe4ff', 0, 0.78, 0);                               // тело хвостом-дымкой
    P(L, A.boxGeo(0.7, 0.18, 0.2), '#cfe4ff', 0, 1.32, 0);
    for (const s of [-1, 1]) P(L, A.boxGeo(0.1, 0.1, 0.6), '#cfe4ff', s * 0.3, 1.25, 0.32, -0.25, 0, 0);   // руки вперёд
  } else {
    P(L, new THREE.SphereGeometry(0.55, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#fbfbff', 0, 1.3, 0);
    P(L, cyl(0.55, 0.62, 1.0, 12), '#fbfbff', 0, 0.8, 0);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; P(L, new THREE.ConeGeometry(0.16, 0.28, 5), '#fbfbff', Math.sin(a) * 0.5, 0.18, Math.cos(a) * 0.5, Math.PI, 0, 0); }
    for (const s of [-1, 1]) P(L, new THREE.SphereGeometry(0.11, 8, 6).scale(0.8, 1.3, 0.4), '#141418', s * 0.18, 1.42, 0.5);
    P(L, new THREE.SphereGeometry(0.09, 8, 6).scale(1, 1.2, 0.4), '#141418', 0, 1.18, 0.56);   // «у-у-у»
    for (const s of [-1, 1]) P(L, A.boxGeo(0.3, 0.16, 0.16), '#fbfbff', s * 0.62, 1.05, 0.1, 0, 0, s * 0.5);
  }
  R.ghost = A.mergeGeos(L);
  R.ghostMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false });
  return R;
}
/* в осях участка: a — вдоль улицы, b — вглубь */
const at = (s, a, b) => [s.x + s.ux * a - s.uz * b, s.z + s.uz * a + s.ux * b];

/* ═════════════ 1. костры дикарей ═════════════ */
function savage (seed) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(R.savBody, R.fire);
  const legL = new THREE.Mesh(R.savLeg, R.fire), legR = new THREE.Mesh(R.savLeg, R.fire);
  const armL = new THREE.Mesh(R.savArm, R.fire), armR = new THREE.Mesh(R.savArmR, R.fire);
  legL.position.set(-0.2, 0.55, 0); legR.position.set(0.2, 0.55, 0);
  armL.position.set(-0.5, 0.95, 0); armR.position.set(0.5, 0.95, 0);
  g.add(body, legL, legR, armL, armR);
  g.scale.setScalar(0.9 + hash(seed, 1, 2) * 0.25);
  A.scene.add(g);
  return { g, legL, legR, armL, armR, ph: hash(seed, 3, 4) * 6, x: 0, z: 0, dead: 0 };
}
function spawnCamp (s) {
  res();
  s.gen++;
  const gy = A.groundH(s.x, s.z);
  const g = new THREE.Group();
  g.position.set(s.x, gy, s.z);
  g.rotation.y = Math.atan2(-s.uz, s.ux);
  g.add(new THREE.Mesh(R.campBase, R.fire));
  s.flames = R.flame.map((m, i) => { const f = new THREE.Mesh(R.flameGeo, m); f.position.set((i - 1) * 0.18, 0.15, (i % 2) * 0.12); g.add(f); return f; });
  s.glow = new THREE.Mesh(R.plane, R.glowFire.clone()); s.glow.material.userData.keep = false;
  s.glow.position.y = 0.06; s.glow.scale.setScalar(11); g.add(s.glow);
  s.halo = new THREE.Sprite(R.halo); s.halo.position.y = 1.2; s.halo.scale.setScalar(5); g.add(s.halo);
  s.roast = new THREE.Mesh(R.roast, R.fire); s.roast.position.y = 1.5; g.add(s.roast);
  A.scene.add(g);
  s.grp = g; s.gy = gy;
  s.sav = [];
  for (let k = 0; k < s.n; k++) {
    const v = savage(s.i * 37 + k * 11 + s.gen * 101);
    v.a = k / s.n * Math.PI * 2 + hash(s.i, k, 5) * 0.6;
    s.sav.push(v);
  }
  s.live = true; s.leave = 0; s.say = 0; s.bubble = null; s.bubT = 0; s.hitCd = 0; s.smokeT = 0;
}
function dropBubble (o) {
  if (!o.bubble) return;
  if (o.bubble.parent) o.bubble.parent.remove(o.bubble);
  o.bubble.material.dispose(); o.bubble = null;
}
function say (o, grp, text, col) {
  dropBubble(o);
  o.bubble = A.sayBubble(grp, text, col, 2.3);
  o.bubT = 3;
}
function despawnCamp (s) {
  dropBubble(s);
  if (s.grp) { A.scene.remove(s.grp); s.glow.material.dispose(); s.grp = null; }
  for (const v of s.sav) if (!v.dead) A.scene.remove(v.g);
  s.sav = []; s.live = false;
}
function campStep (s, dt, near) {
  const V = A.V, T = performance.now() / 1000;
  if (s.bubble && (s.bubT -= dt) <= 0) dropBubble(s);
  s.hitCd -= dt;
  const fireK = s.leave ? Math.max(0, 1 - s.leave / 6) : 1;           // утром гаснет за 6 с
  if (near) {
    s.flames.forEach((f, i) => {
      const k = fireK * (0.85 + Math.sin(T * (9 + i * 3) + i) * 0.12 + Math.random() * 0.1);
      f.scale.set(fireK * (1 - i * 0.2), Math.max(0.001, k * (1 - i * 0.15)), fireK * (1 - i * 0.2));
      f.rotation.y = T * (1 + i);
      f.visible = fireK > 0.02;
    });
    s.glow.material.opacity = fireK * (0.75 + Math.sin(T * 13) * 0.08 + Math.random() * 0.08);
    s.halo.visible = fireK > 0.05; s.halo.scale.setScalar(4 + fireK * (1 + Math.sin(T * 11) * 0.3));
    s.roast.rotation.x = T * 0.9;
  }
  if (s.leave && s.leave < 6 && (s.smokeT -= dt) <= 0) { s.smokeT = 0.6; A.puff(s.x, 0.6, s.z, true, 0.9); }
  // въехал в костёр — искры, машину чуть тормозит
  const sp = Math.hypot(V.vx, V.vz);
  if (fireK > 0.2 && sp > 2 && s.hitCd <= 0 && carHits(s.x, s.z, CAMP.FIRE_R)) {
    s.hitCd = 1.2; STATS.fireHit++;
    A.sparks(s.x, 0.6, s.z, 18, V.vx / sp, V.vz / sp);
    A.puff(s.x, 0.8, s.z, true, 1);
    V.vx *= 0.85; V.vz *= 0.85;
    if (A.Snd) A.Snd.noise(0.15, 0.2);
    const v = s.sav.find(q => !q.dead);
    if (v) say(s, v.g, t('огонь — наш!'), '#c8641a');
  }
  for (const v of s.sav) {
    if (v.dead) continue;
    v.ph += dt;
    let x, z, h;
    if (s.leave) {                                     // утро: расходятся от костра
      v.out = (v.out || CAMP.RING) + dt * 1.6;
      x = s.x + Math.sin(v.a) * v.out; z = s.z + Math.cos(v.a) * v.out; h = v.a;
    } else {
      v.a += dt * 0.32;
      const r = CAMP.RING + Math.sin(v.ph * 1.3) * 0.3;
      x = s.x + Math.sin(v.a) * r; z = s.z + Math.cos(v.a) * r;
      h = v.a + Math.PI + Math.sin(v.ph * 2) * 0.5;      // лицом к огню, вертится
    }
    v.x = x; v.z = z;
    // сбил дикаря — разлетается булками; ночью встаёт привидением
    if (sp > 3 && carHits(x, z, 0.45)) {
      v.dead = 1; A.scene.remove(v.g); STATS.savHit++;
      A.gibBurger(x, z);
      if (A.Snd) A.Snd.squish();
      A.runOver();
      onHit({ x, z, grp: v.g }, V.vx, V.vz);
      const o = s.sav.find(q => !q.dead);
      if (o) say(s, o.g, t('наших бьют!'), '#c8641a');
      continue;
    }
    v.g.visible = near;
    if (!near) continue;
    const hop = s.leave ? Math.abs(Math.sin(v.ph * 6)) * 0.08 : Math.abs(Math.sin(v.ph * 5.5)) * 0.35;
    v.g.position.set(x, s.gy + hop, z);
    v.g.rotation.set(0, h, Math.sin(v.ph * 5.5) * (s.leave ? 0.05 : 0.18));
    const w = Math.sin(v.ph * (s.leave ? 6 : 11));
    v.legL.rotation.x = w * 0.5; v.legR.rotation.x = -w * 0.5;
    if (s.leave) { v.armL.rotation.x = -w * 0.4; v.armR.rotation.x = w * 0.4; v.armL.rotation.z = 0; v.armR.rotation.z = 0; }
    else {
      v.armL.rotation.x = -2.6 + Math.sin(v.ph * 7) * 0.5; v.armL.rotation.z = -0.3;
      v.armR.rotation.x = -2.2 + Math.cos(v.ph * 7) * 0.6; v.armR.rotation.z = 0.3;
    }
  }
  // кричат «Ууга!», когда подъезжаешь
  if (!s.leave && (s.say -= dt) <= 0 && Math.hypot(s.x - V.x, s.z - V.z) < 22) {
    const v = s.sav.find(q => !q.dead);
    if (v) { say(s, v.g, t(SAVAGE_LINES[(Math.random() * SAVAGE_LINES.length) | 0]), '#c8641a'); s.say = 6; }
  }
}

/* ═════════════ 2. ведьмы и котлы ═════════════ */
const MATS = {};
const lam = hex => MATS[hex] || (MATS[hex] = keep(new THREE.MeshLambertMaterial({ color: hex, flatShading: true })));
function addBox (parent, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); parent.add(m); return m;
}
function witch (seed) {
  const person = A.makePerson({ seed: (seed * 7919) >>> 0, fem: true, fat: false });
  Object.assign(person.look, { f: true, age: 'old', top: 'dress', skirt: '#2a1838', shirt: '#2a1838', legs: '#3a3036', shoes: '#141016',
    hair: 'long', hairC: ['#c8c8c0', '#1a1a1a', '#8a3b22'][seed % 3], head: 'none', glasses: 'none', pack: null });
  const grp = A.makeHuman(person, { fem: true, fat: false, summer: true });
  const u = grp.userData, body = u.parts[2];
  u.head.material.color.set('#9ccf6a');                                     // зелёное лицо
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.44, 0.78, 10), lam('#2a1838'));
  robe.position.set(0, 0.4, 0); body.add(robe);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.04, 12), lam('#141018'));
  brim.position.set(0, 0.27, 0); u.head.add(brim);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.62, 10), lam('#141018'));
  cone.position.set(0.04, 0.58, -0.03); cone.rotation.z = -0.18; u.head.add(cone);
  addBox(u.head, 0.47, 0.07, 0.47, lam('#6a2a8a'), 0, 0.32, 0);           // лента
  addBox(u.armR, 0.05, 1.0, 0.05, lam('#6a4a2a'), 0, -0.8, 0.1);           // поварёшка
  A.scene.add(grp);
  return { grp, u, x: 0, z: 0, h: 0, ph: hash(seed, 2, 3) * 6, dead: 0, fall: null };
}
function spawnPot (s) {
  res();
  s.gen++;
  const gy = A.groundH(s.x, s.z);
  const g = new THREE.Group();
  g.position.set(s.x, gy, s.z);
  g.add(new THREE.Mesh(R.potLogs, R.vc));
  s.flames = R.flame.slice(0, 2).map((m, i) => { const f = new THREE.Mesh(R.flameGeo, m); f.position.set(i * 0.15 - 0.07, 0.05, 0); f.scale.setScalar(0.5); g.add(f); return f; });
  s.glow = new THREE.Mesh(R.plane, R.glowGreen); s.glow.position.y = 0.05; s.glow.scale.setScalar(5); g.add(s.glow);
  const pot = new THREE.Group();
  pot.add(new THREE.Mesh(R.pot, R.vc2));
  s.liq = new THREE.Mesh(R.disc, R.liquid); s.liq.scale.setScalar(0.47); s.liq.position.y = 0.75 + 0.3; pot.add(s.liq);
  s.bub = [0, 1, 2].map(i => { const b = new THREE.Mesh(R.bubble, R.liquid); b.position.set((i - 1) * 0.2, 1.06, (i % 2) * 0.15 - 0.07); pot.add(b); return b; });
  g.add(pot);
  A.scene.add(g);
  s.grp = g; s.pot = pot; s.gy = gy; s.tip = null;
  const w = witch(s.i * 53 + s.gen * 311);
  const [wx, wz] = at(s, -1.15, 0.2);
  w.x = wx; w.z = wz; w.h = Math.atan2(s.x - wx, s.z - wz);
  s.w = w;
  s.live = true; s.leave = 0; s.say = 2; s.bubble = null; s.bubT = 0; s.steamT = 0;
}
function despawnPot (s) {
  dropBubble(s);
  if (s.grp) { A.scene.remove(s.grp); s.grp = null; }
  if (s.w && !s.w.dead) A.dropMesh(s.w.grp);
  s.w = null; s.live = false;
}
function tipPot (s, dx, dz) {
  const l = Math.hypot(dx, dz) || 1;
  s.tip = { t: 0, dx: dx / l, dz: dz / l, ax: new THREE.Vector3(dz / l, 0, -dx / l) };
  s.liq.visible = false; for (const b of s.bub) b.visible = false;
  STATS.tipped++;
  if (A.Snd) { A.Snd.crash(6); A.Snd.blip(180, 0.25, 'square', 0.12); }
  A.puff(s.x, 0.8, s.z, false, 0.8);
  const pud = { x: s.x + s.tip.dx * 1.8, z: s.z + s.tip.dz * 1.8, t: 0, smokeT: 0, mat: new THREE.MeshBasicMaterial({ color: '#5cff2a', transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }) };
  pud.m = new THREE.Mesh(R.disc, pud.mat);
  pud.m.position.set(pud.x, A.groundH(pud.x, pud.z) + 0.07, pud.z);
  pud.m.scale.setScalar(0.01);
  A.scene.add(pud.m);
  PUDDLES.push(pud); STATS.puddles++;
  if (s.w && !s.w.dead) say(s, s.w.grp, t('мой отвар!!!'), '#4a8a1a');
}
const Q = new THREE.Quaternion();
function potStep (s, dt, near) {
  const V = A.V, T = performance.now() / 1000, sp = Math.hypot(V.vx, V.vz);
  if (s.bubble && (s.bubT -= dt) <= 0) dropBubble(s);
  const fireK = s.leave ? Math.max(0, 1 - s.leave / 5) : 1;
  if (near) {
    s.flames.forEach((f, i) => { f.visible = fireK > 0.02; f.scale.set(0.5 * fireK, 0.45 * fireK * (0.85 + Math.sin(T * (10 + i * 4)) * 0.15 + Math.random() * 0.1), 0.5 * fireK); });
    s.glow.visible = !s.tip && fireK > 0.05;
    if (!s.tip) {
      s.liq.scale.setScalar(0.47 + Math.sin(T * 4) * 0.01);
      s.bub.forEach((b, i) => { const k = (T * 0.8 + i * 0.33) % 1; b.position.y = 1.03 + k * 0.12; b.scale.setScalar(0.4 + k); });
    }
  }
  if (!s.tip && !s.leave && near && (s.steamT -= dt) <= 0) { s.steamT = 0.9; greenPuff(s.x, s.gy + 1.2, s.z, 0.5); }
  // врезался в котёл — опрокидывается по ходу удара
  if (!s.tip && sp > 2 && carHits(s.x, s.z, POT.R)) { tipPot(s, V.vx, V.vz); V.vx *= 0.9; V.vz *= 0.9; }
  if (s.tip && s.tip.t < 0.6) {
    s.tip.t += dt;
    const k = Math.min(1, s.tip.t / 0.5);
    Q.setFromAxisAngle(s.tip.ax, k * 1.45);
    s.pot.quaternion.copy(Q);
    s.pot.position.set(s.tip.dx * k * 0.9, 0, s.tip.dz * k * 0.9);
  }
  // ведьма: мешает, дразнится; сбить — как прохожего
  const w = s.w;
  if (!w || w.dead) return;
  const g = w.grp, u = w.u;
  if (w.fall) { if (HITS.fallStep(w, dt)) return; }
  if (sp > 3 && carHits(w.x, w.z, 0.35)) {
    const kmh = sp * 3.6;
    if (HITS.isFall(kmh)) { if (!w.fall) HITS.fall(w, V.vx, V.vz); return; }
    w.dead = 1;
    if (s.bubble && s.bubble.parent === g) dropBubble(s);
    A.dropMesh(g);
    A.gibHuman(w, V.vx, V.vz, kmh);                  // ночью — встанет привидением (onHit из gibHuman)
    A.runOver();
    return;
  }
  w.ph += dt;
  if (s.leave) {                                     // утро: уходит вглубь пустыря
    w.x += -s.uz * dt * 1.3; w.z += s.ux * dt * 1.3; w.h = Math.atan2(-s.uz, s.ux);
  }
  g.visible = near;
  if (!near) return;
  g.position.set(w.x, s.gy, w.z);
  g.rotation.set(0, w.h, 0);
  if (s.leave) {
    const k = Math.sin(w.ph * 6);
    u.legL.rotation.x = k * 0.45; u.legR.rotation.x = -k * 0.45; u.armR.rotation.x = 0; u.armL.rotation.x = -k * 0.3;
  } else {
    u.legL.rotation.x = 0; u.legR.rotation.x = 0;
    u.armR.rotation.x = -0.9 + Math.sin(w.ph * 3) * 0.25; u.armR.rotation.z = Math.cos(w.ph * 3) * 0.25;
    u.armL.rotation.x = s.tip ? -2.6 : -0.3; u.head.rotation.y = Math.sin(w.ph * 0.7) * 0.3;
    if ((s.say -= dt) <= 0 && Math.hypot(w.x - V.x, w.z - V.z) < POT.SAY_R) {
      say(s, g, t(WITCH_LINES[(Math.random() * WITCH_LINES.length) | 0]), '#4a8a1a');
      s.say = POT.SAY_CD;
      if (A.Snd) A.Snd.blip(1100, 0.08, 'triangle', 0.05);
    }
  }
}
function greenPuff (x, y, z, size) {
  const m = new THREE.Mesh(R.puffGeo, new THREE.MeshBasicMaterial({ color: '#7dff4a', transparent: true, opacity: 0.6, depthWrite: false }));
  m.position.set(x + rand(-0.3, 0.3), y, z + rand(-0.3, 0.3));
  m.scale.setScalar(size);
  A.fxAdd(m, { vy: rand(1.8, 3), vx: rand(-0.3, 0.3), vz: rand(-0.3, 0.3), life: rand(1.6, 2.4), max: 2.4, grow: 0.9, spin: rand(-1, 1) });
}
/* лужа: растекается, лежит, улетучивается зелёным дымом */
function puddleStep (dt) {
  for (let i = PUDDLES.length - 1; i >= 0; i--) {
    const p = PUDDLES[i];
    p.t += dt;
    const { GROW, STAY, FUME } = PUDDLE;
    let r = PUDDLE.R, op = 0.8;
    if (p.t < GROW) r *= 1 - (1 - p.t / GROW) ** 2;
    else if (p.t > GROW + STAY) {
      const k = Math.min(1, (p.t - GROW - STAY) / FUME);
      r *= 1 - k * 0.7; op = 0.8 * (1 - k);
      if ((p.smokeT -= dt) <= 0) { p.smokeT = 0.3; greenPuff(p.x + rand(-1, 1) * r * 0.6, p.m.position.y + 0.2, p.z + rand(-1, 1) * r * 0.6, 0.6 + Math.random() * 0.5); }
    }
    p.m.scale.setScalar(Math.max(0.01, r));
    p.mat.opacity = op;
    if (p.t > GROW + STAY + FUME) { A.scene.remove(p.m); p.mat.dispose(); PUDDLES.splice(i, 1); }
  }
}

/* ═════════════ 3. привидения ═════════════ */
export function onHit (p, vx, vz) {
  if (!A || !p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
  if (!nightNow() || !openAt(p.x, p.z)) return;
  res();
  if (GHOSTS.length >= GHOST.MAX) { const o = GHOSTS.find(q => q.state !== 'fade'); if (o) { o.state = 'fade'; o.k = 0; } }
  const ry = p.grp && Number.isFinite(p.grp.rotation.y) && p.grp.rotation.y ? p.grp.rotation.y : Math.atan2(vx || 0, vz || 1);
  const l = Math.hypot(vx || 0, vz || 0) || 1;
  const x = p.x + (vx || 0) / l * 2.5, z = p.z + (vz || 0) / l * 2.5;   // там, где упал
  const mat = R.ghostMat.clone();
  const m = new THREE.Mesh(R.ghost, mat);
  m.visible = false;
  A.scene.add(m);
  GHOSTS.push({ m, mat, x, z, h: ry, t: 0, k: 0, state: 'wait', seed: Math.random() * 9 });
  STATS.raised++;
}
function dispel (g) {
  g.state = 'gone'; g.k = 0; STATS.dispelled++;
  for (let i = 0; i < 5; i++) A.puff(g.x + rand(-0.4, 0.4), 0.6 + i * 0.3, g.z + rand(-0.4, 0.4), false, 0.6);
  if (A.Snd) { A.Snd.blip(880, 0.12, 'sine', 0.08); A.Snd.blip(440, 0.3, 'sine', 0.06); }
}
function ghostStep (dt) {
  if (!GHOSTS.length) return;
  const V = A.V, sp = Math.hypot(V.vx, V.vz), night = nightNow();
  const full = A.ADULT ? 0.42 : 0.82;
  for (let i = GHOSTS.length - 1; i >= 0; i--) {
    const g = GHOSTS[i];
    g.t += dt;
    if (g.state === 'wait') { if (g.t < GHOST.RISE) continue; g.state = 'rise'; g.k = 0; g.m.visible = true; }
    if (g.state !== 'gone' && g.state !== 'fade' && (!night || g.t > GHOST.LIFE || Math.hypot(g.x - V.x, g.z - V.z) > GHOST.FAR)) { g.state = 'fade'; g.k = 0; }
    let op = full, lift = 0.35, sc = 1;
    if (g.state === 'rise') { g.k += dt / 1.5; op = full * Math.min(1, g.k); lift = -1.2 + 1.55 * Math.min(1, g.k); if (g.k >= 1) g.state = 'float'; }
    else if (g.state === 'fade') { g.k += dt / 2; op = full * (1 - g.k); }
    else if (g.state === 'gone') { g.k += dt / 0.4; op = full * (1 - g.k); sc = 1 + g.k * 0.8; }
    if (g.state !== 'gone' && g.state !== 'wait') {      // плывёт дальше, чуть виляя
      g.h += Math.sin(g.t * 0.5 + g.seed) * 0.25 * dt;
      const v = g.state === 'rise' ? 0.3 : GHOST.SPEED;
      g.x += Math.sin(g.h) * v * dt; g.z += Math.cos(g.h) * v * dt;
    }
    if ((g.state === 'float' || g.state === 'rise') && sp > 3 && carHits(g.x, g.z, GHOST.R)) dispel(g);
    if (g.k >= 1 && (g.state === 'fade' || g.state === 'gone')) { A.scene.remove(g.m); g.mat.dispose(); GHOSTS.splice(i, 1); continue; }
    g.mat.opacity = Math.max(0, op * (0.85 + Math.sin(g.t * 3 + g.seed) * 0.15));
    g.m.position.set(g.x, A.groundH(g.x, g.z) + lift + Math.sin(g.t * 2 + g.seed) * 0.15, g.z);
    g.m.rotation.set(0, g.h, Math.sin(g.t * 1.7 + g.seed) * 0.1);
    g.m.scale.setScalar(sc);
  }
}

/* ═════════════ сборка и шаг ═════════════ */
export function build (api) {
  A = api;
  const t0 = performance.now();
  const camps = CONSTR.freeLots({ W: CAMP.W, D: CAMP.D, max: CAMP.MAX, gap: CAMP.GAP, salt: 21 });
  camps.forEach((s, i) => { s.i = i; s.n = CAMP.N[0] + Math.floor(hash(s.x, s.z, 3) * (CAMP.N[1] - CAMP.N[0] + 1)); s.live = false; s.gen = 0; s.sav = []; CAMPS.push(s); });
  const pots = CONSTR.freeLots({ W: POT.W, D: POT.D, max: POT.MAX, gap: POT.GAP, salt: 41, avoid: CAMPS.map(c => ({ x: c.x, z: c.z, r: Math.hypot(c.W, c.D) / 2 + 100 })) });
  pots.forEach((s, i) => { s.i = i; s.live = false; s.gen = 0; POTS.push(s); });
  STATS.camps = CAMPS.length; STATS.pots = POTS.length;
  STATS.ms = Math.round(performance.now() - t0);
}

function scan (force) {
  const V = A.V, night = nightNow();
  frustum();
  for (const [L, spawn, despawn] of [[CAMPS, spawnCamp, despawnCamp], [POTS, spawnPot, despawnPot]]) for (const s of L) {
    const d = Math.hypot(s.x - V.x, s.z - V.z);
    const hidden = force || d > DARK.HIDE_R || !inView(s.x, 1.5, s.z, 6);
    if (!s.live && night && d < DARK.WANT_R && hidden && openAt(s.x, s.z)) spawn(s);
    else if (s.live && d > DARK.DROP_R) despawn(s);
    else if (s.live && !night && !s.leave) s.leave = 0.001;          // утро: костёр гаснет, расходятся
    else if (s.live && s.leave && (s.leave > DARK.LEAVE || (s.leave > 6 && hidden))) despawn(s);
  }
}
export function step (dt) {
  if (!A || (!CAMPS.length && !POTS.length && !GHOSTS.length)) return;
  if ((scanT -= dt) <= 0) { scanT = 0.5; scan(false); }
  const V = A.V;
  let lc = 0, lp = 0, sv = 0, wt = 0;
  for (const s of CAMPS) {
    if (!s.live) continue;
    if (s.leave) s.leave += dt;
    const d = Math.hypot(s.x - V.x, s.z - V.z), near = d < DARK.ANIM_R;
    s.grp.visible = d < DARK.SHOW_R;
    campStep(s, dt, near);
    lc++; sv += s.sav.filter(v => !v.dead).length;
  }
  for (const s of POTS) {
    if (!s.live) continue;
    if (s.leave) s.leave += dt;
    const d = Math.hypot(s.x - V.x, s.z - V.z), near = d < DARK.ANIM_R;
    s.grp.visible = d < DARK.SHOW_R;
    potStep(s, dt, near);
    lp++; if (s.w && !s.w.dead) wt++;
  }
  STATS.liveCamps = lc; STATS.livePots = lp; STATS.savages = sv; STATS.witches = wt;
  puddleStep(dt);
  ghostStep(dt);
  STATS.ghosts = GHOSTS.length;
}

/* для probe: d.DARK */
export const DEBUG = {
  DARK, CAMP, POT, PUDDLE, GHOST, STATS, CAMPS, POTS, GHOSTS, PUDDLES,
  night: () => nightNow(),
  hour: () => +clockH().toFixed(2),
  list: () => ({ camps: CAMPS.map(s => [Math.round(s.x), Math.round(s.z), s.dist, s.n, s.live]), pots: POTS.map(s => [Math.round(s.x), Math.round(s.z), s.dist, s.live]) }),
  spawnNear: () => scan(true),
  ghost: (x, z, h = 0) => onHit({ x, z, grp: { rotation: { y: h } } }, 0, 0),   // привидение в точке (только ночью)                       // поставить всё, что рядом, даже в кадре
  killWitch: i => { const s = POTS[i]; if (!s || !s.w || s.w.dead) return false; s.w.dead = 1; A.dropMesh(s.w.grp); A.gibHuman(s.w, 12, 0, 60); return true; },
};
