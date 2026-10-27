/* Подъезд в 3D (12ас, автор 24.10.2026: «мини-игру с подъёмом надо точно делать в 3D; я хочу, чтобы тебе открывали
   квартиру, а там чел в трусах или чел, затирающий историю какую-то; можешь оставить одного»).
   Правила словами — docs/ORDERS.md «Подъезд: подняться на этаж». Здесь — только картинка; бег, двери, гопники, реплики,
   деньги — stairs.js (он зовёт create() и каждый кадр frame()). ?old2dstairs — прежний 2D (stairs.js рисует сам).

   Что видно: лестничная клетка в разрезе — вид сбоку и чуть сверху (ближней стены нет). Слева — площадка этажа: двери
   квартир в ряд по задней стене (номера по порядку слева направо), справа от них — лестница: ближний пролёт вверх
   вправо, промежуточная площадка с окном (вечернее небо, подоконник, батарея), дальний пролёт назад влево — на площадку
   следующего этажа. Стены в две краски (низ масляный, верх побелка, полоса), у обшарпанного — облупленные пятна,
   граффити, мусор, мигает лампочка; у чистого — цветы. На первом этаже — почтовые ящики. Лампочки на проводе со светом.
   Курьер — модель Quaternius (как люди города) с коробкой в руках, бежит по ступенькам; камера едет за ним.
   Своя дверь: звонок — дверь открывается внутрь, в проёме клиент, майке и тапках, за ним коридор (обои,
   вешалка с куртками, зеркало, коврик), он затирает историю облачками и берёт коробку двумя руками.

   Память (docs/AGENTS.md «Пики на переходах»): в игре сцена рисуется ТЕМ ЖЕ рендерером, что город (game.js init(env),
   render(renderer) — вместо города, пока подъезд открыт): второй WebGL-контекст на телефоне — лишняя память. Сцена
   создаётся при входе и освобождается при выходе; строятся только этажи вокруг курьера (FLOORS_AROUND), остальные — по
   мере бега, ушедшие из кадра — освобождаются. Ничего из three.js при загрузке модуля (город строится на зерне).
   Свет — те же три источника, что у города (небо, солнце, рассеянный) и туман: программы шейдеров людей — общие, на входе
   не собираются заново. В песочнице интерфейса (ui.html — game.js нет) — свой рендерер на своём холсте.

     init(env)          — game.js: { THREE, renderer, human(person, o) — человек (не в «дальних», humanLod), drop(g),
                          courier() — человек курьера, box() — коробка пиццы }
     on() / render(r)   — game.js frameStep: открыт подъезд — рисовать его вместо города (true — нарисовал)
     create(box, o)     — stairs.js: { plan, look, seed, ADULT, t, gopAt } → вид (frame, pick, doorRect, manRect, project,
                          scene — сцена у двери, dispose) */
import * as THREE from '../../vendor/three.module.min.js';
import { createHumanFactory, makePerson } from '../people.js';
import { QP } from '../qpeople.js';
import * as PBOX from '../pizzabox.js';
import * as SC from './doorscene.js';

export const OLD = typeof location !== 'undefined' && /[?&]old2dstairs\b/.test(location.search);

/* размеры клетки, м: этаж FH, 9 ступенек на пролёт (подступёнок R, проступь TR), промежуточная площадка — от RUN до MX */
const FH = 2.8, NS = 9, R = 1.4 / NS, TR = 0.3, RUN = NS * TR, MX = RUN + 1.45;
const ZB = -1.6, ZF = 1.55;                      // задняя стена (двери), край разреза (к камере)
const Z1 = 0.78, Z2 = -0.86;                     // середины ближнего и дальнего пролёта
const W1 = [0.12, 1.45], W2 = [-1.5, -0.17];     // ширина пролётов по z
const DX1 = -1.2;                                  // середина правой двери ряда
const SPOT = { x: -0.32, z: -0.05 };             // где курьер стоит на площадке «у лестницы»
const FLOORS_AROUND = [-1, 1];                   // три соседних этажа покрывают взгляд и уменьшают число мешей
const WALK = 3.4;                                // м/с: от лестницы к двери и обратно
/* вид сбоку: сколько видно по высоте (м; низкий экран — VISL), не уже MINW по ширине, камера выше ступней на UP; ступни курьера — на
   доле F высоты экрана сверху (низкий экран — FL: сверху задание, снизу кнопки); K — как быстро догоняет */
const CAM = { FOV: 42, VIS: 5.4, VISL: 5.9, MINW: 6.2, UP: 2.5, F: 0.7, FL: 0.73, Z: -0.45, K: 7 };
const DOORCAM = { DX: 1.35, Y: 1.62, DZ: 3.7, LX: -0.1, LY: 1.22, LZ: -0.45, T: 0.75 };   // крупно у своей двери

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = k => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
export const cinematicDoor = t => t < 0.75 ? 0 : t < 1.55 ? 0.18 * ease((t - 0.75) / 0.8)
  : t < 1.85 ? 0.18 : 0.18 + 0.82 * ease((t - 1.85) / 1.85);
export const cinematicLight = t => t < 1.27 ? 0 : t < 1.38 ? 0.25 : t < 1.53 ? 0.035
  : t < 1.64 ? 0.62 : t < 1.78 ? 0.12 : t < 1.93 ? 0.78 : 0.78 + 0.22 * ease((t - 1.93) / 0.48);

let ENV = null, CUR = null, SBX = null;
export function init (env) { ENV = env; }
export const on = () => !!CUR;
/** game.js: вместо города — подъезд (true — нарисовал) */
export function render (renderer) {
  if (!CUR || !CUR.game) return false;
  CUR.draw(renderer);
  return true;
}

/* песочница интерфейса: своих людей и коробку заводим сами (game.js нет) */
function sandboxEnv () {
  if (SBX) return SBX;
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const make = createHumanFactory({ THREE, HUMAN_VC: mat, HUMANS: new Set() });
  let cp = null;
  SBX = {
    human: (p, o) => make(p, o),
    drop: g => {
      if (g.parent) g.parent.remove(g);
      g.traverse(m => { if (m.isMesh) { m.geometry.dispose(); for (const x of [].concat(m.material)) if (x !== mat && !x.userData.keep) x.dispose(); } });
    },
    courier: () => {
      if (cp) return cp;
      cp = makePerson({ seed: 0xc0de, fem: false });
      Object.assign(cp.look, { head: 'cap', headC: '#ff6a13', shirt: '#ff6a13', pants: '#2f3540', glasses: 'none', top: 'tee', bottom: 'pants' });
      return cp;
    },
    box: n => (n > 1 ? PBOX.makeStack(THREE, n) : PBOX.makeBox(THREE)),
  };
  return SBX;
}

/* ── склейка коробок и многоугольников в один меш с цветами вершин (одна отрисовка на этаж) ── */
const LIN = new Map();
function lin (hex) {
  let c = LIN.get(hex);
  if (!c) { const k = new THREE.Color(hex); c = [k.r, k.g, k.b]; LIN.set(hex, c); }
  return c;
}
class Mesher {
  constructor () { this.p = []; this.n = []; this.c = []; this.i = []; }
  quad (a, b, c, d, hex, k = 1) {
    const v = this.p.length / 3, col = lin(hex);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = d[0] - a[0], wy = d[1] - a[1], wz = d[2] - a[2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    for (const q of [a, b, c, d]) { this.p.push(q[0], q[1], q[2]); this.n.push(nx, ny, nz); this.c.push(col[0] * k, col[1] * k, col[2] * k); }
    this.i.push(v, v + 1, v + 2, v, v + 2, v + 3);
  }
  /* многоугольник в плоскости xy (4 точки против часовой, если смотреть с +z), вытянутый по z от z0 до z1 */
  prism (pts, z0, z1, hex, k = 1) {
    const P = (q, z) => [q[0], q[1], z];
    this.quad(P(pts[0], z1), P(pts[1], z1), P(pts[2], z1), P(pts[3], z1), hex, k);
    this.quad(P(pts[3], z0), P(pts[2], z0), P(pts[1], z0), P(pts[0], z0), hex, k * 0.9);
    for (let i = 0; i < 4; i++) { const a = pts[i], b = pts[(i + 1) % 4]; this.quad(P(a, z1), P(a, z0), P(b, z0), P(b, z1), hex, k * 0.95); }
  }
  box (x0, y0, z0, x1, y1, z1, hex, k = 1) { this.prism([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z0, z1, hex, k); }
  /* только верх (плитка пола, коврик) */
  top (x0, z0, x1, z1, y, hex, k = 1) { this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], hex, k); }
  geo () {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    return g;
  }
}
/* прямоугольники с картинками из холста-атласа этажа (номера, табличка этажа, объявления, граффити) */
class Quads {
  constructor () { this.p = []; this.n = []; this.u = []; this.i = []; }
  /* x0..x1, y0..y1 на плоскости z (лицом к +z); u — [u0, v0, u1, v1] в пикселях атласа aw × ah */
  add (x0, y0, x1, y1, z, uv, aw, ah) {
    const v = this.p.length / 3, [a, b, c, d] = uv;
    this.p.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z);
    for (let k = 0; k < 4; k++) this.n.push(0, 0, 1);
    this.u.push(a / aw, 1 - d / ah, c / aw, 1 - d / ah, c / aw, 1 - b / ah, a / aw, 1 - b / ah);
    this.i.push(v, v + 1, v + 2, v, v + 2, v + 3);
  }
  geo () {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setIndex(this.i);
    return g;
  }
}

const CLIENT_LOOK = { shirt: '#ece7da', pants: '#495c7e', q: { head: 'casual', body: 'punk', legs: 'casual', feet: 'beach' }, summer: true };

export function create (box, o) {
  const env = o.forceOwn ? sandboxEnv() : ENV || sandboxEnv(), game = !!ENV && !o.forceOwn;
  const t = o.t, P = o.plan, C = SC.PAL[o.look] || SC.PAL.shabby, look = o.look;
  const oldStairwell = o.firstPerson && look === 'shabby';
  const wallLow = oldStairwell ? '#37674e' : C.wallLow;
  const wallTop = oldStairwell ? '#aba99e' : C.wallTop;
  const wallStripe = oldStairwell ? '#294b3a' : C.stripe;
  // У сюжетной квартиры широкий проём и площадка: фигура Геннадия не зажата дверной коробкой.
  const DW = o.firstPerson ? 1.5 : 0.9, DH = o.firstPerson ? 2.25 : 2.05, DG = o.firstPerson ? 1.85 : 1.3;
  const { lv, per, first } = P, tgt = P.floor - 1;
  const seed = o.seed >>> 0;
  const hsh = (...n) => { let x = seed ^ 0x9e3779b9; for (const v of n) { x = Math.imul(x ^ (v + 0x7f4a7c15), 0x85ebca6b); x ^= x >>> 13; } x = Math.imul(x, 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
  const flatAt = (f, i) => first + f * per + i;
  const doorX = i => DX1 - (per - 1 - i) * DG;
  const LX0 = doorX(0) - 1.35;
  const flickF = C.flicker ? Math.floor(hsh(99) * lv) : -1;
  const topAt = QP.topAt;                          // подошва «на слой асфальта» города — тут не нужна (снимаем в конце create)

  /* ── сцена, свет, камера ── */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#120c08');
  scene.fog = new THREE.Fog('#120c08', 8.5, 24);
  const kL = C.lamp || 1;
  const hemi = new THREE.HemisphereLight(0xffe6c0, 0x3a2a1e, 1.25 * kL);
  const sun = new THREE.DirectionalLight(0xfff0d6, 1.05 * kL);
  const amb = new THREE.AmbientLight(0xffffff, 0.32);
  scene.add(hemi, sun, sun.target, amb);
  const cam = new THREE.PerspectiveCamera(CAM.FOV, 1.6, 0.1, 80);
  if (o.firstPerson) { cam.fov = 68; cam.updateProjectionMatrix(); }

  /* свой холст и рендерер — только в песочнице */
  let own = null;
  if (!game) {
    const cv = document.createElement('canvas');
    cv.className = 'mk-cv sx3-cv';
    box.insertBefore(cv, box.firstChild);
    own = new THREE.WebGLRenderer({ canvas: cv, antialias: false });
    own.setPixelRatio(Math.min(1, (window.devicePixelRatio || 1) * 0.5));
  }

  /* ── общие материалы и формы (освобождаются в dispose) ── */
  const MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const SKY = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const HI = new THREE.MeshBasicMaterial({ color: '#ffd85e', fog: false });
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,230,170,1)'); gr.addColorStop(0.35, 'rgba(255,200,120,.45)'); gr.addColorStop(1, 'rgba(255,190,110,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
  })();
  const GLOW = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(C.light), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  GLOW.opacity = 0.5 * kL;
  const FADE = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.25, depthWrite: false });   // ближний пролёт этажа выше, когда курьер на дальнем
  const GLOWF = GLOW.clone();                      // мигающая лампочка (обшарпанный подъезд, один этаж)
  const entryGlow = GLOW.clone();
  const entryShadeMat = new THREE.MeshBasicMaterial({ color: '#090806', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const own3 = [MAT, SKY, HI, GLOW, GLOWF, entryGlow, FADE, glowTex, entryShadeMat];        // освободить в конце
  let chairmanMaterial = null, chairmanActive = true;
  function chairmanMat () {
    if (chairmanMaterial) return chairmanMaterial;
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 420;
    const ctx = canvas.getContext('2d');
    const draw = img => {
      ctx.fillStyle = '#3b3629'; ctx.fillRect(0, 0, 256, 420);
      ctx.fillStyle = '#b69a68'; ctx.fillRect(8, 8, 240, 404);
      ctx.fillStyle = '#28291e'; ctx.fillRect(14, 14, 228, 392);
      ctx.fillStyle = '#e3d5a9'; ctx.font = 'bold 19px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('ПРЕДСЕДАТЕЛЬ', 128, 39); ctx.fillText('ПОДЪЕЗДА', 128, 61);
      if (img) ctx.drawImage(img, 23, 74, 210, 273);
      ctx.fillStyle = '#ad8b5b'; ctx.fillRect(19, 353, 218, 1);
      ctx.fillStyle = '#e2d5b1'; ctx.font = 'bold 30px sans-serif';
      ctx.fillText(o.ADULT ? 'ХУЙЛО' : 'ГЕННАДИЙ', 128, 389);
      if (chairmanMaterial) chairmanMaterial.map.needsUpdate = true;
    };
    draw(null);
    const tx = new THREE.CanvasTexture(canvas); tx.colorSpace = THREE.SRGBColorSpace;
    chairmanMaterial = new THREE.MeshBasicMaterial({ map: tx, side: THREE.DoubleSide });
    own3.push(chairmanMaterial, tx);
    const img = new Image();
    img.onload = () => { if (chairmanActive) draw(img); };
    img.src = './assets/dialogue/ZATO_Gennady_dialogue_assets/gennady-chairman.webp';
    return chairmanMaterial;
  }
  let entryLightLevel = 1, entryLights = [], entryBulbMat = null;
  const setEntryLight = k => {
    entryLightLevel = clamp(k, 0, 1);
    entryShadeMat.opacity = 0.91 * (1 - entryLightLevel);
    entryGlow.opacity = 0.025 + 0.475 * entryLightLevel;
    if (entryBulbMat) entryBulbMat.emissiveIntensity = 0.08 + 1.7 * entryLightLevel;
    for (let i = 0; i < entryLights.length; i++) entryLights[i].intensity = (i ? 0.12 : 0.2) + (i ? 1.65 : 1.15) * entryLightLevel;
    if (portraitMaterials) for (const mat of Object.values(portraitMaterials)) mat.color.setScalar(0.42 + 0.58 * entryLightLevel);
  };
  const leafGeo = new Map();                        // вид двери → форма полотна (общая на все этажи)

  /* полотно двери: железная (рамка, филёнки) или дерматин (стёжка гвоздиками, кант; у обшарпанного — порван), глазок,
     ручка, замок; номерок — отдельной табличкой из атласа. Начало — у петель (x = 0), лицом к +z */
  const DCOL = look === 'clean' ? ['#7a4a2a', '#5b4636', '#6b2f3f', '#3f5a6b'] : ['#7a3b2a', '#4a3a30', '#6b2f3f', '#3a4a30', '#5a2f2a'];
  function leaf (kind, ci, torn) {
    const key = kind + ci + (torn ? 't' : '');
    if (leafGeo.has(key)) return leafGeo.get(key);
    const M = new Mesher(), w = DW, h = DH, d = 0.055;
    if (kind === 'steel') {
      const c = look === 'clean' ? '#7f878e' : '#7a8086';
      M.box(0, 0, 0, w, h, d, c);
      M.box(0.08, 0.12, d, w - 0.08, 0.95, d + 0.012, c, 0.9);
      M.box(0.08, 1.07, d, w - 0.08, h - 0.1, d + 0.012, c, 1.08);
    } else {
      const c = DCOL[ci % DCOL.length];
      M.box(0, 0, 0, w, h, d, c);
      for (const [x0, y0, x1, y1] of [[0.04, 0.04, w - 0.04, 0.08], [0.04, h - 0.08, w - 0.04, h - 0.04], [0.04, 0.04, 0.08, h - 0.04], [w - 0.08, 0.04, w - 0.04, h - 0.04]]) M.box(x0, y0, d, x1, y1, d + 0.012, c, 0.7);   // кант
      for (let r = 0; r < 14; r++) for (let q = 0; q < 4; q++) {                // стёжка: гвоздики ромбом
        const x = 0.15 + q * 0.2 + (r % 2 ? 0.1 : 0), y = 0.16 + r * 0.13;
        if (x > w - 0.1) continue;
        M.box(x - 0.012, y - 0.012, d, x + 0.012, y + 0.012, d + 0.014, '#d9b25a');
      }
      if (torn) { M.box(0.18, 0.72, d, 0.44, 0.98, d + 0.02, '#c9a46a'); M.box(0.22, 0.76, d + 0.02, 0.4, 0.94, d + 0.03, '#e0c48a'); }   // торчит поролон
    }
    M.box(w / 2 - 0.02, 1.45, d, w / 2 + 0.02, 1.49, d + 0.02, '#14100c');     // глазок
    M.box(w - 0.16, 0.98, d, w - 0.05, 1.02, d + 0.05, '#e8d07a');             // ручка
    M.box(w - 0.13, 0.86, d, w - 0.08, 0.93, d + 0.02, '#33210c');             // замок
    const g = M.geo();
    leafGeo.set(key, g);
    return g;
  }

  /* Фактуры квартиры рисуются один раз при входе; на полу и стенах повторяются в метрах. */
  const paper = new Map();
  let linoleum = null, roomShade = null;
  const familyPhotos = [];
  function familyPhotoMat (index) {
    if (familyPhotos[index]) return familyPhotos[index];
    const name = index ? 'family-dacha.webp' : 'family-room.webp';
    const path = new URL('./assets/dialogue/ZATO_Gennady_dialogue_assets/' + name, document.baseURI).href;
    const tx = new THREE.TextureLoader().load(path);
    tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: tx, roughness: 1 });
    own3.push(mat, tx);
    familyPhotos[index] = mat;
    return mat;
  }
  function paperMat (variant = 0) {
    if (paper.has(variant)) return paper.get(variant);
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = look === 'clean' ? '#d2c19b' : '#bca981'; g.fillRect(0, 0, c.width, c.height);
    // Одна большая развёртка на стену: не тайлится. Разный seed у каждой стены скрывает повтор.
    for (let i = 0; i < 185; i++) {
      const x = 28 + hsh(variant, i, 421) * (c.width - 56);
      const yy = 24 + hsh(variant, i, 422) * (c.height - 48);
      const r = 7 + hsh(variant, i, 423) * 5;
      const col = ['#a56c61', '#9a554a', '#c18c74', '#936a61'][Math.floor(hsh(variant, i, 424) * 4)];
      g.strokeStyle = 'rgba(79,93,61,.55)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, yy + r * 0.3); g.quadraticCurveTo(x + 7, yy + 18, x - 3, yy + 27); g.stroke();
      for (const side of [-1, 1]) {
        g.fillStyle = side < 0 ? 'rgba(91,108,69,.5)' : 'rgba(116,125,80,.46)';
        g.beginPath(); g.ellipse(x + side * 6, yy + 16, 5, 2.2, side * 0.5, 0, Math.PI * 2); g.fill();
      }
      for (let petal = 0; petal < 5; petal++) {
        const a = petal * Math.PI * 2 / 5 + hsh(variant, i, 425) * 0.3;
        g.fillStyle = col;
        g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.65, yy + Math.sin(a) * r * 0.65,
          r * 0.58, r * 0.37, a, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#d7b57a'; g.beginPath(); g.arc(x, yy, r * 0.32, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 18000; i++) {
      const x = hsh(variant, i, 411) * c.width, yy = hsh(variant, i, 412) * c.height;
      g.fillStyle = hsh(i, 413) < 0.55 ? 'rgba(50,38,23,.07)' : 'rgba(255,250,226,.14)';
      g.fillRect(x, yy, 1 + hsh(i, 414) * 2, 1);
    }
    if (look !== 'clean') {
      const grime = g.createLinearGradient(0, 300, 0, c.height);
      grime.addColorStop(0, 'rgba(51,38,26,0)'); grime.addColorStop(1, 'rgba(51,38,26,.24)');
      g.fillStyle = grime; g.fillRect(0, 300, c.width, c.height - 300);
    }
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: tx, roughness: 1 });
    paper.set(variant, mat); own3.push(mat, tx);
    return mat;
  }
  function linoleumMat () {
    if (linoleum) return linoleum;
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#987047'; g.fillRect(0, 0, 512, 512);
    // Печатный орнамент на цельном рулоне: восьмиугольники и маленькие ромбы, без швов между плитками.
    const inks = ['#916039', '#ad7842', '#a65e36', '#bd8b52'];
    for (let row = -1; row <= 8; row++) for (let col = -1; col <= 8; col++) {
      const x = col * 64, yy = row * 64, cx = x + 32, cy = yy + 32;
      g.fillStyle = '#65452e';
      g.beginPath(); g.moveTo(x + 16, yy + 3); g.lineTo(x + 48, yy + 3); g.lineTo(x + 61, yy + 16);
      g.lineTo(x + 61, yy + 48); g.lineTo(x + 48, yy + 61); g.lineTo(x + 16, yy + 61);
      g.lineTo(x + 3, yy + 48); g.lineTo(x + 3, yy + 16); g.closePath(); g.fill();
      g.fillStyle = inks[(row + col * 3 + 48) % inks.length];
      g.beginPath(); g.moveTo(x + 17, yy + 7); g.lineTo(x + 47, yy + 7); g.lineTo(x + 57, yy + 17);
      g.lineTo(x + 57, yy + 47); g.lineTo(x + 47, yy + 57); g.lineTo(x + 17, yy + 57);
      g.lineTo(x + 7, yy + 47); g.lineTo(x + 7, yy + 17); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(238,198,123,.31)'; g.lineWidth = 2;
      g.strokeRect(x + 18, yy + 18, 28, 28);
      g.fillStyle = 'rgba(227,183,109,.42)';
      g.beginPath(); g.moveTo(cx, cy - 13); g.lineTo(cx + 13, cy); g.lineTo(cx, cy + 13); g.lineTo(cx - 13, cy); g.closePath(); g.fill();
      g.fillStyle = '#c79c62';
      g.beginPath(); g.moveTo(x, yy - 10); g.lineTo(x + 10, yy); g.lineTo(x, yy + 10); g.lineTo(x - 10, yy); g.closePath(); g.fill();
    }
    for (let i = 0; i < 13000; i++) {
      const x = hsh(i, 902) * 512, yy = hsh(i, 903) * 512;
      g.fillStyle = hsh(i, 904) < 0.6 ? 'rgba(47,29,18,.095)' : 'rgba(251,222,168,.15)';
      g.fillRect(x, yy, 1 + hsh(i, 905) * 3, 1 + hsh(i, 906) * 2);
    }
    g.strokeStyle = 'rgba(49,34,22,.14)';
    for (let i = 0; i < 35; i++) {
      const x = hsh(i, 910) * 512, yy = hsh(i, 911) * 512;
      g.beginPath(); g.moveTo(x, yy); g.lineTo(x + hsh(i, 912) * 16, yy + hsh(i, 913) * 8); g.stroke();
    }
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = 4;
    linoleum = new THREE.MeshStandardMaterial({ map: tx, roughness: 0.86 });
    own3.push(linoleum, tx);
    return linoleum;
  }
  function roomShadeMat () {
    if (roomShade) return roomShade;
    roomShade = new THREE.MeshBasicMaterial({ color: '#100b09', transparent: true, opacity: 0.72,
      depthWrite: false, side: THREE.DoubleSide });
    own3.push(roomShade);
    return roomShade;
  }

  /* ── этаж: всё неподвижное — одним мешем, картинки — одним мешем атласа, двери — по отдельности ── */
  const floors = new Map();
  const AW = 512, AH = 256;
  function atlas (f) {
    const cv = document.createElement('canvas'); cv.width = AW; cv.height = AH;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    // табличка этажа: синяя эмаль, номер крупно, «кв. a—b»; нужный этаж — жёлтая рамка
    const here = f === tgt;
    SC.rect(g, 0, 0, 128, 96, here ? '#ffd85e' : '#f4efe2');
    SC.rect(g, 6, 6, 116, 84, '#2f5fb0');
    SC.text(g, String(f + 1), 64, 40, 44, '#fff6e0');
    SC.text(g, t('кв. {a}—{b}', { a: flatAt(f, 0), b: flatAt(f, per - 1) }), 64, 78, 10, '#fff6e0');
    // номерки дверей: латунь, номер чёрным
    for (let i = 0; i < per; i++) {
      const x = 128 + (i % 6) * 64, y = (i / 6 | 0) * 32;
      SC.rect(g, x + 2, y + 2, 60, 28, '#7a5a20'); SC.rect(g, x + 4, y + 4, 56, 24, '#d9b25a');
      const s = String(flatAt(f, i));
      SC.text(g, s, x + 32, y + 17, Math.min(18, 52 / Math.max(2, s.length) * 1.4), '#33210c');
    }
    // объявления — 2 места по 128 × 128; за лестницей — граффити (обшарпанный) или объявление, место 256 × 128
    for (let k = 0; k < 2; k++) SC.poster(g, k * 128 + 14, 110, 100, 82, 3, SC.ADS[(hsh(f, k, 13) * SC.ADS.length) | 0], t);
    if (C.graffiti) {
      const s = t(SC.GRAFFITI[(hsh(f, 3, 12) * SC.GRAFFITI.length) | 0]);
      SC.graffiti(g, s, 384, 160, Math.min(18, 230 / Math.max(4, s.length)), ['#c8402e', '#2f5fb0', '#2a2622'][f % 3], -0.1 + hsh(f, 3, 11) * 0.2);
    } else SC.poster(g, 256 + 78, 110, 100, 82, 3, SC.ADS[(hsh(f, 3, 13) * SC.ADS.length) | 0], t);
    // почтовые ящики (первый этаж): номера
    const tx = new THREE.CanvasTexture(cv);
    tx.colorSpace = THREE.SRGBColorSpace; tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false;
    const mat = new THREE.MeshLambertMaterial({ map: tx, alphaTest: 0.4 });
    return { cv, tx, mat };
  }
  const plateUV = i => { const x = 128 + (i % 6) * 64, y = (i / 6 | 0) * 32; return [x + 2, y + 2, x + 62, y + 30]; };

  /* стена x0..x1 по задней стене (z ZB−0,2…ZB) от y0 до y1: низ масляной краской до yp, полоса, верх побелкой */
  function wall (M, x0, x1, y0, y1, yp, z0 = ZB - 0.2, z1 = ZB) {
    if (x1 - x0 < 0.005 || y1 - y0 < 0.005) return;
    const a = Math.min(y1, yp - 0.025), b = Math.max(y0, yp + 0.025);
    if (a > y0) M.box(x0, y0, z0, x1, a, z1, wallLow);
    if (yp + 0.025 > y0 && yp - 0.025 < y1) M.box(x0, Math.max(y0, yp - 0.025), z0, x1, Math.min(y1, yp + 0.025), z1, wallStripe);
    if (y1 > b) M.box(x0, b, z0, x1, y1, z1, wallTop);
  }
  /* облупленное: пятна штукатурки и трещины поверх стены (z — лицо стены) */
  function peel (M, f, x0, x1, y0, y1, n, z = ZB, avoid = []) {
    if (C.grime < 0.2) return;
    for (let k = 0; k < n; k++) {
      const x = lerp(x0, x1, hsh(f, k, 51)), y = lerp(y0, y1, hsh(f, k, 52)), w = 0.08 + hsh(f, k, 53) * 0.42, h = 0.05 + hsh(f, k, 54) * 0.26;
      if (x + w > x1) continue;
      if (avoid.some(([a, b, c, d]) => x < b && x + w > a && y - 0.2 < d && y + h > c)) continue;   // не на дверях и окне
      const c = hsh(f, k, 55) < 0.6 ? '#adaf9f' : '#828d80';
      M.quad([x, y + h * 0.13, z + 0.006], [x + w * 0.86, y, z + 0.006],
        [x + w, y + h * 0.76, z + 0.006], [x + w * 0.18, y + h, z + 0.006], c, 0.87);
      if (hsh(f, k, 56) < 0.25) M.box(x + w * 0.3, y - 0.12, z, x + w * 0.3 + 0.008, y, z + 0.006, '#4a4034');
    }
  }

  function buildFloor (f) {
    const M = new Mesher(), N = new Mesher(), Q = new Quads(), y = f * FH, A = atlas(f);   // N — ближний пролёт (прячется, когда курьер за ним)
    const flights = f <= lv - 2;
    let skyM = null;
    const slabC = '#8a7f72', slabD = '#5e564c';
    if (o.firstPerson) {
      // Разрез нужен камере сбоку, но из глаз курьера вместо отсутствующей ближней стены была чёрная пустота.
      M.box(LX0 - 0.45, y - 0.2, ZF + 0.03, MX + 0.45, y + 1.5, ZF + 0.14, wallLow);
      M.box(LX0 - 0.45, y + 1.5, ZF + 0.03, MX + 0.45, y + 1.56, ZF + 0.14, wallStripe);
      M.box(LX0 - 0.45, y + 1.56, ZF + 0.03, MX + 0.45, y + FH, ZF + 0.14, wallTop);
      // Матовые потёртости и сколы на длинной стене — как на фотографии лестничной клетки.
      if (oldStairwell) for (let k = 0; k < 20; k++) {
        const px = lerp(LX0 - 0.25, MX + 0.2, hsh(f, k, 809));
        const py = 0.12 + hsh(f, k, 810) * 2.43;
        const pw = 0.06 + hsh(f, k, 811) * 0.24;
        const ph = 0.035 + hsh(f, k, 812) * 0.14;
        const c = py < 1.48 ? (k % 4 ? '#3d6b52' : '#607562') : (k % 4 ? '#a1a197' : '#8e968c');
        const pz = ZF + 0.007;
        M.quad([px, y + py + ph * 0.14, pz], [px + pw * 0.11, y + py + ph, pz],
          [px + pw, y + py + ph * 0.83, pz], [px + pw * 0.86, y + py, pz], c, 0.94);
      }
    }
    // ── пол площадки: плита и плитка шахматкой ──
    M.box(LX0 - 0.25, y - 0.24, ZB - 0.2, f === 0 ? MX + 0.25 : 0.02, y - 0.012, ZF, slabC);
    M.box(LX0 - 0.25, y - 0.24, ZF - 0.02, f === 0 ? MX + 0.25 : 0.02, y - 0.015, ZF, slabD);   // срез плиты ниже верхней грани: без мерцания
    const t0 = look === 'clean' ? '#b0806a' : '#8c7a66', t1 = look === 'clean' ? '#c9b08a' : '#7a6a58';
    for (let x = LX0, i = 0; x < (f === 0 ? MX : 0) - 0.01; x += 0.4, i++) for (let z = ZB, j = 0; z < ZF - 0.01; z += 0.4, j++) {
      const x1 = Math.min(x + 0.4, f === 0 ? MX : 0), z1 = Math.min(z + 0.4, ZF);
      const k = C.grime > 0.2 && hsh(f, i, j, 7) < 0.12 ? 0.82 : 1;           // выщербленная плитка
      M.top(x, z, x1, z1, y, (i + j) % 2 ? t0 : t1, k);
    }
    // ── задняя стена площадки с проёмами дверей ──
    const holes = [];
    for (let i = 0; i < per; i++) holes.push([doorX(i) - DW / 2 - 0.06, doorX(i) + DW / 2 + 0.06]);
    let x = LX0 - 0.25;
    for (const [a, b] of holes) { wall(M, x, a, y, y + FH, y + 1.5); wall(M, a, b, y + DH + 0.06, y + FH, y + 1.5); x = b; }
    wall(M, x, 0.02, y, y + FH, y + 1.5);
    peel(M, f, LX0, 0, y + 0.2, y + 2.5, 14, ZB + 0.002, holes.map(([a, b]) => [a - 0.03, b + 0.03, y, y + DH + 0.1]).concat([[LX0 + 0.15, LX0 + 0.7, y + 1.25, y + 1.95], [-0.05, 0.8, y + 1.3, y + 1.8]]));
    // ── двери: коробка, ниша за дверью (тёплая — видно, когда открыли), коврик ──
    const doors = [];
    for (let i = 0; i < per; i++) {
      const dx = doorX(i), n = flatAt(f, i), L = dx - DW / 2, Rr = dx + DW / 2;
      M.box(L - 0.06, y, ZB - 0.2, L, y + DH + 0.06, ZB + 0.03, C.frame);
      M.box(Rr, y, ZB - 0.2, Rr + 0.06, y + DH + 0.06, ZB + 0.03, C.frame);
      M.box(L - 0.06, y + DH, ZB - 0.2, Rr + 0.06, y + DH + 0.06, ZB + 0.03, C.frame);
      const mine = f === tgt && i === P.door;
      if (!mine) {                                   // чужая: тёмная прихожая, тёплый свет
        M.box(L, y, ZB - 0.62, Rr, y + DH, ZB - 0.6, '#6a4628');
        M.box(L, y, ZB - 0.6, L + 0.02, y + DH, ZB - 0.2, '#3a2616'); M.box(Rr - 0.02, y, ZB - 0.6, Rr, y + DH, ZB - 0.2, '#3a2616');
        M.box(L, y + DH - 0.02, ZB - 0.6, Rr, y + DH, ZB - 0.2, '#2a1a10');
        M.top(L, ZB - 0.6, Rr, ZB - 0.2, y + 0.001, '#4a3020');
      }
      const r = hsh(f, i, 21);
      if (r < (look === 'clean' ? 0.85 : 0.5) || mine) {
        const mc = ['#a8324a', '#5a3a2a', '#3f6a8a', '#6a8a3a'][(r * 40 | 0) % 4];
        M.box(dx - 0.36, y, ZB + 0.1, dx + 0.36, y + 0.018, ZB + 0.55, mc);
        M.box(dx - 0.3, y + 0.018, ZB + 0.16, dx + 0.3, y + 0.022, ZB + 0.2, '#e8dcb0', 0.8);
      }
      // Полотно на петлях слева; сюжетная дверь открывается наружу, в подъезд.
      const kind = hsh(n, 3) < (look === 'clean' ? 0.45 : 0.25) ? 'steel' : 'derm';
      const g = new THREE.Group();
      g.position.set(L, y, ZB - 0.07);
      const lm = new THREE.Mesh(leaf(kind, (hsh(n, 4) * 5) | 0, look === 'shabby' && kind === 'derm' && hsh(n, 5) < 0.5), MAT);
      g.add(lm);
      const pq = new Quads(), u = plateUV(i);
      pq.add(DW / 2 - 0.13, 1.6, DW / 2 + 0.13, 1.74, 0.07, u, AW, AH);
      const pm = new THREE.Mesh(pq.geo(), A.mat);
      g.add(pm);
      doors.push({ g, n, i, open: 0, plate: pm });
    }
    // ── щиток с проводами (слева) и табличка этажа у лестницы ──
    M.box(LX0 + 0.22, y + 1.3, ZB, LX0 + 0.64, y + 1.9, ZB + 0.1, '#7d858c');
    M.box(LX0 + 0.26, y + 1.34, ZB + 0.1, LX0 + 0.6, y + 1.86, ZB + 0.105, '#6a7178');
    for (const dx of [0.36, 0.42, 0.5]) M.box(LX0 + dx, y + 1.9, ZB + 0.02, LX0 + dx + 0.015, y + FH, ZB + 0.035, '#1d1a16');
    Q.add(0.22, y + 1.36, 0.72, y + 1.74, ZB + 0.012, [0, 0, 128, 96], AW, AH);
    // Объявления переехали на отдельную доску между этажами: над квартирными дверями их нет.
    { const s = C.graffiti ? 0.75 : 0.42, sx = 1.5; Q.add(sx - s, y + 1.05 - s / 2, sx + s, y + 1.05 + s / 2, ZB + 0.011, [256, 96, 512, 224], AW, AH); }
    // ── первый этаж: почтовые ящики на стене за лестницей ──
    if (f === 0) {
      for (let c = 0; c < 4; c++) for (let r = 0; r < 3; r++) {
        const x0 = 0.32 + c * 0.31, y0 = 0.92 + r * 0.23, col = (c + r) % 2 ? '#5a7fa8' : '#4f6f94';
        M.box(x0, y0, ZB, x0 + 0.29, y0 + 0.21, ZB + 0.14, col);
        M.box(x0 + 0.05, y0 + 0.13, ZB + 0.14, x0 + 0.24, y0 + 0.15, ZB + 0.145, '#1d2430');
        if (C.grime > 0.2 && hsh(c, r, 61) < 0.25) M.box(x0 + 0.02, y0 + 0.02, ZB + 0.14, x0 + 0.12, y0 + 0.2, ZB + 0.2, col, 0.8);   // дверца нараспашку
      }
      wall(M, RUN, MX + 0.25, 0, 1.4, 1.5);
    }
    // ── пролёты: ближний (вверх вправо) и дальний (назад влево), перила с деревянным поручнем ──
    if (flights) {
      const sC = oldStairwell ? '#755d4e' : C.step;
      const sH = oldStairwell ? '#a08770' : C.stepHi;
      for (let k = 0; k < NS; k++) {
        const a = k * TR, b = (k + 1) * TR, h = y + (k + 1) * R;
        N.box(a, h - 0.42, W1[0], b, h - 0.035, W1[1], sC);
        N.box(a - 0.02, h - 0.035, W1[0], b, h, W1[1], sH);
        const a2 = RUN - (k + 1) * TR, b2 = RUN - k * TR, h2 = y + 1.4 + (k + 1) * R;
        M.box(a2, h2 - 0.42, W2[0], b2, h2 - 0.035, W2[1], sC, 0.88);
        M.box(a2, h2 - 0.035, W2[0], b2 + 0.02, h2, W2[1], sH, 0.88);
      }
      N.prism([[0, y - 0.24], [RUN, y + 1.4 - 0.46], [RUN, y + 1.4 - 0.3], [0, y - 0.08]], W1[0], W1[1], slabD);   // косоур снизу
      M.prism([[0, y + FH - 0.46], [RUN, y + 1.4 - 0.24], [RUN, y + 1.4 - 0.08], [0, y + FH - 0.3]], W2[0], W2[1], slabD, 0.85);
      // перила: балясины через ступеньку и поручень по скату (у колодца между пролётами)
      const rail = look === 'clean' ? '#7a4a28' : '#5a3a22', bal = '#2d2a26';
      for (let k = 0; k <= NS; k += 2) {
        const xa = k * TR + 0.1, ha = y + Math.min(NS, k + 1) * R;
        N.box(xa, ha, W1[0] + 0.02, xa + 0.03, ha + 0.9, W1[0] + 0.05, bal);
        const xb = RUN - k * TR - 0.13, hb = y + 1.4 + Math.min(NS, k + 1) * R;
        M.box(xb, hb, W2[1] - 0.05, xb + 0.03, hb + 0.9, W2[1] - 0.02, bal, 0.9);
      }
      N.prism([[0, y + 0.88], [RUN, y + 1.4 + 0.88], [RUN, y + 1.4 + 0.95], [0, y + 0.95]], W1[0] - 0.01, W1[0] + 0.08, rail);
      M.prism([[0, y + FH + 0.88], [RUN, y + 1.4 + 0.88], [RUN, y + 1.4 + 0.95], [0, y + FH + 0.95]], W2[1] - 0.08, W2[1] + 0.01, rail, 0.9);
      M.box(RUN - 0.02, y + 1.4 + 0.88, W2[1] - 0.08, RUN + 0.06, y + 1.4 + 0.95, W1[0] + 0.08, rail);   // поворот поручня
      M.box(RUN + 0.01, y + 1.4, -0.06, RUN + 0.04, y + 1.4 + 0.9, -0.03, bal);
      // промежуточная площадка: плита, окно (вечернее небо), подоконник, батарея
      const yb = y + 1.4;
      M.box(RUN - 0.02, yb - 0.24, ZB - 0.2, MX + 0.25, yb - 0.012, ZF, slabC);
      M.box(RUN - 0.02, yb - 0.24, ZF - 0.02, MX + 0.25, yb - 0.015, ZF, slabD);
      for (let x0 = RUN, i = 0; x0 < MX - 0.01; x0 += 0.4, i++) for (let z = ZB, j = 0; z < ZF - 0.01; z += 0.4, j++) M.top(x0, z, Math.min(x0 + 0.4, MX), Math.min(z + 0.4, ZF), yb, (i + j) % 2 ? t0 : t1);
      const wx0 = RUN + 0.3, wx1 = MX - 0.3, wy0 = yb + 0.95, wy1 = yb + 2.2;
      wall(M, RUN, wx0, yb, yb + FH, yb + 1.5); wall(M, wx1, MX + 0.25, yb, yb + FH, yb + 1.5);
      wall(M, wx0, wx1, yb, wy0, yb + 1.5); wall(M, wx0, wx1, wy1, yb + FH, yb + 1.5);
      peel(M, f + 1000, RUN, MX, yb + 0.2, yb + 2.4, 5, ZB + 0.002, [[wx0 - 0.15, wx1 + 0.15, wy0 - 0.12, wy1 + 0.08]]);
      M.box(wx0 - 0.05, wy0 - 0.05, ZB - 0.05, wx1 + 0.05, wy0, ZB + 0.04, '#3a2a1e');
      M.box(wx0 - 0.05, wy1, ZB - 0.05, wx1 + 0.05, wy1 + 0.05, ZB + 0.04, '#3a2a1e');
      M.box(wx0 - 0.05, wy0, ZB - 0.05, wx0, wy1, ZB + 0.04, '#3a2a1e'); M.box(wx1, wy0, ZB - 0.05, wx1 + 0.05, wy1, ZB + 0.04, '#3a2a1e');
      M.box((wx0 + wx1) / 2 - 0.025, wy0, ZB - 0.04, (wx0 + wx1) / 2 + 0.025, wy1, ZB + 0.02, '#3a2a1e');
      M.box(wx0, wy0 + 0.72, ZB - 0.04, wx1, wy0 + 0.76, ZB + 0.02, '#3a2a1e');
      M.box(wx0 - 0.12, wy0 - 0.07, ZB, wx1 + 0.12, wy0 - 0.02, ZB + 0.24, '#9a9284');   // подоконник
      for (let k = 0; k < 7; k++) M.box(wx0 + 0.05 + k * 0.12, yb + 0.25, ZB + 0.02, wx0 + 0.13 + k * 0.12, yb + 0.75, ZB + 0.16, look === 'clean' ? '#c9c2b0' : '#a39a8c');   // батарея
      // Доска с разными листками на боковой стене промежуточной площадки.
      M.box(MX + 0.205, yb + 1.17, -0.75, MX + 0.255, yb + 1.91, 0.39, '#62472d');
      M.box(MX + 0.197, yb + 1.23, -0.68, MX + 0.205, yb + 1.83, 0.31, '#91826a');
      for (let k = 0; k < 4; k++) {
        const z = -0.59 + k * 0.22, top = yb + 1.37 + (k % 2) * 0.2;
        M.box(MX + 0.19, top, z, MX + 0.197, top + 0.28, z + 0.17, k % 2 ? '#d7c9a3' : '#d4d0bd');
      }
      const potX = RUN + 0.2, potZ = ZF - 0.32;
      M.box(potX - 0.11, yb, potZ - 0.11, potX + 0.11, yb + 0.21, potZ + 0.11, '#8d4b33');
      M.box(potX - 0.16, yb + 0.21, potZ - 0.14, potX + 0.16, yb + 0.49, potZ + 0.14, '#4f6a3c');
      if (C.flowers) { const px = wx0 + 0.2; M.box(px - 0.08, wy0 - 0.02, ZB + 0.05, px + 0.08, wy0 + 0.12, ZB + 0.19, '#b0613a'); M.box(px - 0.1, wy0 + 0.12, ZB + 0.04, px + 0.1, wy0 + 0.3, ZB + 0.2, '#3f8a4a'); M.box(px - 0.05, wy0 + 0.28, ZB + 0.08, px + 0.05, wy0 + 0.36, ZB + 0.16, f % 2 ? '#e8436a' : '#f2a03c'); }
      else { const px = wx1 - 0.2; M.box(px - 0.06, wy0 - 0.02, ZB + 0.06, px + 0.06, wy0 + 0.14, ZB + 0.18, '#a8b8a0', 0.9); M.box(px - 0.05, wy0 - 0.02, ZB + 0.07, px + 0.05, wy0 + 0.06, ZB + 0.17, '#8a7a5a'); }   // банка с окурками
      // небо: градиент вершин (без света, без тумана)
      const sky = new THREE.BufferGeometry(), a0 = lin('#2b3a6b'), a1 = lin('#f4a35a'), sz = ZB - 0.03;
      sky.setAttribute('position', new THREE.Float32BufferAttribute([wx0, wy0, sz, wx1, wy0, sz, wx1, wy1, sz, wx0, wy1, sz], 3));
      sky.setAttribute('color', new THREE.Float32BufferAttribute([...a1, ...a1, ...a0, ...a0], 3));
      sky.setIndex([0, 1, 2, 0, 2, 3]);
      skyM = new THREE.Mesh(sky, SKY);
    } else {
      // верхний этаж: справа стена до крыши (без окна), потолок
      wall(M, RUN, MX + 0.25, y + 1.4, y + FH, y + 2.9);
      M.box(LX0 - 0.25, y + FH, ZB - 0.2, MX + 0.25, y + FH + 0.3, ZF, slabD);
    }
    // стена над пролётами (за дальним): краска по скату дальнего пролёта этажа ниже (на первом — ровно)
    const lp0 = y + 1.5, lp1 = f === 0 ? y + 1.5 : y + 0.1;
    M.prism([[0, y], [RUN, y], [RUN, lp1 - 0.025], [0, lp0 - 0.025]], ZB - 0.2, ZB, wallLow);
    M.prism([[0, lp0 - 0.025], [RUN, lp1 - 0.025], [RUN, lp1 + 0.025], [0, lp0 + 0.025]], ZB - 0.2, ZB, wallStripe);
    M.prism([[0, lp0 + 0.025], [RUN, lp1 + 0.025], [RUN, y + FH], [0, y + FH]], ZB - 0.2, ZB, wallTop);
    peel(M, f + 2000, 0.2, RUN - 0.3, y + 1.6, y + 2.6, 4, ZB + 0.002);
    // правый край клетки (за промежуточной площадкой) и левый — торцы разреза
    M.box(LX0 - 0.45, y - 0.24, ZB - 0.2, LX0 - 0.25, y + FH, ZF, '#2a211a');
    M.box(MX + 0.25, y - 0.24 + (flights ? 0 : 0), ZB - 0.2, MX + 0.45, y + FH, ZF, '#2a211a');
    // ── мелочь на площадке: мусор или цветы, иногда кот ──
    const sp = [LX0 + 0.3, -0.75, LX0 + 1.0];
    sp.forEach((sx, k) => {
      const r = hsh(f, k, 31), sz = ZF - 0.5 - hsh(f, k, 32) * 0.6;
      if (C.trash && r < 0.45) {
        if (k % 3 === 0) { M.box(sx - 0.04, y, sz - 0.04, sx + 0.04, y + 0.26, sz + 0.04, '#3f7a4a'); M.box(sx - 0.015, y + 0.26, sz - 0.015, sx + 0.015, y + 0.34, sz + 0.015, '#3f7a4a'); }
        else if (k % 3 === 1) { M.box(sx - 0.16, y, sz - 0.12, sx + 0.16, y + 0.24, sz + 0.12, '#d8d2c4'); M.box(sx - 0.08, y + 0.24, sz - 0.05, sx + 0.08, y + 0.3, sz + 0.05, '#d8d2c4', 0.9); }
        else { M.box(sx - 0.22, y, sz - 0.22, sx + 0.22, y + 0.05, sz + 0.22, '#c8a46a'); M.box(sx - 0.1, y + 0.05, sz - 0.04, sx + 0.06, y + 0.052, sz + 0.04, '#d8402f'); }
      } else if (C.flowers && r < 0.6) {
        M.box(sx - 0.12, y, sz - 0.12, sx + 0.12, y + 0.22, sz + 0.12, '#b0613a');
        M.box(sx - 0.16, y + 0.22, sz - 0.16, sx + 0.16, y + 0.5, sz + 0.16, '#3f8a4a');
        M.box(sx - 0.07, y + 0.5, sz - 0.07, sx + 0.07, y + 0.6, sz + 0.07, k % 2 ? '#e8436a' : '#f2a03c');
      }
    });
    if (hsh(f, 41) < 0.18) {                         // кот
      const cx = LX0 + 1.6, cz = ZF - 0.55, kc = hsh(f, 42) < 0.5 ? '#2a2622' : '#c87a3a';
      M.box(cx - 0.18, y, cz - 0.09, cx + 0.14, y + 0.17, cz + 0.09, kc);
      M.box(cx + 0.1, y + 0.1, cz - 0.08, cx + 0.26, y + 0.26, cz + 0.08, kc);
      M.box(cx + 0.12, y + 0.26, cz - 0.07, cx + 0.16, y + 0.31, cz - 0.03, kc); M.box(cx + 0.12, y + 0.26, cz + 0.03, cx + 0.16, y + 0.31, cz + 0.07, kc);
      M.box(cx + 0.24, y + 0.17, cz - 0.05, cx + 0.262, y + 0.2, cz - 0.02, '#ffd85e'); M.box(cx + 0.24, y + 0.17, cz + 0.02, cx + 0.262, y + 0.2, cz + 0.05, '#ffd85e');
      M.box(cx - 0.3, y + 0.02, cz - 0.02, cx - 0.17, y + 0.05, cz + 0.02, kc);
    }
    // лампочки на проводе: над площадкой и над промежуточной
    const bulbs = [];
    const lampAt = (bx, by, bz, roof) => {
      M.box(bx - 0.06, roof - 0.03, bz - 0.06, bx + 0.06, roof, bz + 0.06, '#3a3530');
      M.box(bx - 0.008, by + 0.08, bz - 0.008, bx + 0.008, roof - 0.02, bz + 0.008, '#1d1a16');
      M.box(bx - 0.035, by + 0.04, bz - 0.035, bx + 0.035, by + 0.1, bz + 0.035, '#3a3530');
      M.box(bx - 0.045, by - 0.05, bz - 0.045, bx + 0.045, by + 0.04, bz + 0.045, '#fff3c0', 1.6);
      const s = new THREE.Sprite(f === flickF ? GLOWF : GLOW); s.position.set(bx, by, bz); s.scale.setScalar(1.6);
      bulbs.push(s);
    };
    lampAt((LX0 + 0) / 2, y + FH - 0.62, -0.1, y + FH);
    if (flights) lampAt(RUN + 0.75, y + FH - 0.62, -0.3, y + FH);
    // ── своя квартира: коридор за дверью (обои, вешалка, зеркало, коврик, свет) ──
    let flat = null;
    if (f === tgt) flat = corridor(M, y);
    const grp = new THREE.Group();
    const mesh = new THREE.Mesh(M.geo(), MAT);
    grp.add(mesh);
    const near = N.p.length ? new THREE.Mesh(N.geo(), MAT) : null;
    if (near) grp.add(near);
    if (Q.p.length) grp.add(new THREE.Mesh(Q.geo(), A.mat));
    if (skyM) grp.add(skyM);
    for (const d of doors) grp.add(d.g);
    for (const s of bulbs) grp.add(s);
    if (o.firstPerson && f === tgt) {
      const image = new THREE.Mesh(new THREE.PlaneGeometry(0.67, 1.1), chairmanMat());
      image.position.set(LX0 - 0.231, y + 1.52, -0.35); image.rotation.y = Math.PI / 2;
      grp.add(image);
    }
    if (flat) grp.add(flat);
    scene.add(grp);
    return { f, grp, A, doors, bulbs, flat, near };
  }

  function corridor (M, y) {
    const dx = doorX(P.door), L = dx - (o.firstPerson ? 1.15 : 0.85), Rr = dx + (o.firstPerson ? 1.15 : 0.85);
    const Z0 = ZB - 3.3, Z1c = ZB - 0.2, Zroom = Z0 - 1.65, Zdeep = Zroom - 3.1, Hc = 2.6;
    const g = new THREE.Group(), wallLeft = paperMat(0), wallRight = paperMat(1);
    const floorMat = linoleumMat();
    const surface = (w, h, px, py, pz, rx, ry, mat, scale = 0.48) => {
      const geo = new THREE.PlaneGeometry(w, h), uv = geo.attributes.uv;
      if (scale) for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w / scale, uv.getY(k) * h / scale);
      const mesh = new THREE.Mesh(geo, mat); mesh.position.set(px, py, pz); mesh.rotation.set(rx, ry, 0); g.add(mesh);
    };
    M.top(L, Zdeep, Rr, Z1c, y + 0.002, '#65452e');
    surface(Rr - L, Z1c - Zdeep, dx, y + 0.008, (Zdeep + Z1c) / 2, -Math.PI / 2, 0, floorMat, 1.15);
    M.box(L, y + Hc, Zdeep, Rr, y + Hc + 0.05, Z1c, '#d5c9ac');
    M.box(L, y + Hc - 0.1, Zdeep, Rr, y + Hc - 0.075, Z1c, '#e9dec4');
    surface(Z1c - Z0, Hc, L + 0.004, y + Hc / 2, (Z0 + Z1c) / 2, 0, Math.PI / 2, wallLeft, 0);
    surface(Z1c - Z0, Hc, Rr - 0.004, y + Hc / 2, (Z0 + Z1c) / 2, 0, -Math.PI / 2, wallRight, 0);
    // После прихожей коридор расходится в боковые комнаты. У проёмов стена и плинтус действительно кончаются.
    const voidMat = new THREE.MeshBasicMaterial({ color: '#15120f', side: THREE.DoubleSide, fog: false });
    const darkWall = new THREE.MeshBasicMaterial({ color: '#29231d', side: THREE.DoubleSide, fog: false });
    own3.push(voidMat, darkWall);
    const sideDoor = (left, from, to) => {
      const x = left ? L : Rr, innerX = left ? L + 0.004 : Rr - 0.004;
      const angle = left ? Math.PI / 2 : -Math.PI / 2;
      for (const [a, b] of [[Zroom, from], [to, Z0]]) {
        surface(b - a, Hc, innerX, y + Hc / 2, (a + b) / 2, 0, angle, darkWall, 0);
      }
      M.box(left ? L - 0.03 : Rr, y + 2.14, from, left ? L : Rr + 0.03, y + Hc, to, '#584333');
      for (const z of [from, to]) {
        M.box(left ? L - 0.11 : Rr, y, z - 0.045, left ? L + 0.04 : Rr + 0.11, y + 2.2, z + 0.045, '#6e5138');
      }
      M.box(left ? L - 0.12 : Rr, y + 2.17, from - 0.05, left ? L + 0.04 : Rr + 0.12, y + 2.24, to + 0.05, '#8a6747');
      surface(to - from - 0.1, 2.13, left ? L - 0.76 : Rr + 0.76, y + 1.065,
        (from + to) / 2, 0, angle, voidMat, 0);
      M.top(left ? L - 0.76 : Rr, from, left ? L : Rr + 0.76, to, y + 0.002, '#302720');
      M.box(left ? L - 0.16 : Rr, y + 0.004, from, left ? L : Rr + 0.16, y + 0.035, to, '#66513a');
      for (const [a, b] of [[Zroom, from - 0.05], [to + 0.05, Z1c]]) {
        M.box(left ? L : Rr - 0.045, y, a, left ? L + 0.045 : Rr, y + 0.13, b, '#67442c');
        M.box(left ? L + 0.045 : Rr - 0.075, y + 0.12, a,
          left ? L + 0.075 : Rr - 0.045, y + 0.16, b, '#a47b52');
        M.box(left ? L + 0.045 : Rr - 0.095, y, a,
          left ? L + 0.095 : Rr - 0.045, y + 0.035, b, '#51351f');
      }
    };
    sideDoor(true, Zroom + 0.52, Zroom + 1.26);
    sideDoor(false, Zroom + 0.35, Zroom + 1.08);
    surface(Zroom - Zdeep, Hc, L + 0.004, y + Hc / 2, (Zdeep + Zroom) / 2, 0, Math.PI / 2, darkWall, 0);
    surface(Zroom - Zdeep, Hc, Rr - 0.004, y + Hc / 2, (Zdeep + Zroom) / 2, 0, -Math.PI / 2, darkWall, 0);
    M.box(L, y + 2.47, Zroom, L + 0.045, y + 2.54, Z1c, '#eee1c7');
    M.box(Rr - 0.045, y + 2.47, Zroom, Rr, y + 2.54, Z1c, '#eee1c7');
    // За последним проёмом нет торцевой стены: поверхности исчезают в темноте и тумане сцены.
    const shadeMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'attribute float aShade; varying float vShade; void main(){vShade=aShade; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying float vShade; void main(){gl_FragColor=vec4(0.012,0.011,0.010,vShade);}' });
    own3.push(shadeMat);
    const addShade = (front, back, a, b, opacity) => {
      const positions = [], shades = [], indices = [], segments = 16;
      for (let i = 0; i <= segments; i++) {
        const q = i / segments, z = lerp(front, back, q), alpha = opacity * ease(Math.pow(q, 0.7));
        positions.push(...a(z), ...b(z)); shades.push(alpha, alpha);
        if (i < segments) { const k = i * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('aShade', new THREE.Float32BufferAttribute(shades, 1)); geo.setIndex(indices);
      g.add(new THREE.Mesh(geo, shadeMat));
    };
    const lightEnd = Z0 + 1.65;
    addShade(lightEnd, Z0, z => [L + 0.008, y + 0.01, z], z => [L + 0.008, y + Hc - 0.01, z], 0.72);
    addShade(lightEnd, Z0, z => [Rr - 0.008, y + 0.01, z], z => [Rr - 0.008, y + Hc - 0.01, z], 0.72);
    addShade(Zroom, Zdeep + 0.01, z => [L + 0.008, y + 0.01, z], z => [L + 0.008, y + Hc - 0.01, z], 0.98);
    addShade(Zroom, Zdeep + 0.01, z => [Rr - 0.008, y + 0.01, z], z => [Rr - 0.008, y + Hc - 0.01, z], 0.98);
    addShade(lightEnd, Zdeep + 0.01, z => [L + 0.01, y + 0.012, z], z => [Rr - 0.01, y + 0.012, z], 0.98);
    addShade(lightEnd, Zdeep + 0.01, z => [L + 0.01, y + Hc - 0.106, z], z => [Rr - 0.01, y + Hc - 0.106, z], 0.98);
    // Лёгкая дымка в глубине размывает контраст прохода; края полностью прозрачны, прямоугольника нет.
    const hazeMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying vec2 vUv; void main(){float r=length((vUv-0.5)*vec2(1.0,1.15)); float a=0.24*(1.0-smoothstep(0.12,0.51,r)); gl_FragColor=vec4(0.12,0.087,0.06,a);}' });
    own3.push(hazeMat);
    const haze = new THREE.Mesh(new THREE.PlaneGeometry(Rr - L + 0.3, Hc + 0.3), hazeMat);
    haze.position.set(dx, y + Hc / 2, Z0 - 0.75); g.add(haze);
    // Бра над тумбой подсвечивает обжитую часть прихожей.
    M.box(L + 0.015, y + 2.27, ZB - 1.36, L + 0.16, y + 2.39, ZB - 1.22, '#a27a49');
    M.box(L + 0.1, y + 2.19, ZB - 1.4, L + 0.29, y + 2.31, ZB - 1.18, '#eacb86', 1.25);
    const pictureLight = new THREE.PointLight(0xffc480, 1.15, 2.6);
    pictureLight.position.set(L + 0.45, y + 2.13, ZB - 1.3); g.add(pictureLight);
    const hallLight = new THREE.PointLight(0xffd29a, 1.7, 2.85);
    hallLight.position.set(dx, y + 2.3, ZB - 1.75); g.add(hallLight);
    entryLights = [pictureLight, hallLight]; setEntryLight(entryLightLevel);
    // Небольшой входной коврик не закрывает характерный рисунок линолеума.
    M.box(dx - 0.4, y + 0.012, ZB - 0.95, dx + 0.4, y + 0.019, ZB - 0.37, '#622c36');
    M.box(dx - 0.34, y + 0.02, ZB - 0.9, dx + 0.34, y + 0.022, ZB - 0.42, '#a9624d');
    for (let z = ZB - 0.85; z < ZB - 0.47; z += 0.1) M.top(dx - 0.3, z, dx + 0.3, z + 0.01, y + 0.024, '#d1a875', 0.75);
    M.top(dx - 0.28, ZB - 0.83, dx + 0.28, ZB - 0.49, y + 0.026, '#85404a', 0.92);
    // Тумба стоит рядом с входом слева; над ней нет подвешенных ящиков и коробчатой одежды.
    M.box(L + 0.04, y + 0.04, ZB - 1.6, L + 0.49, y + 0.78, ZB - 0.72, '#765134');
    M.box(L + 0.02, y + 0.77, ZB - 1.63, L + 0.53, y + 0.83, ZB - 0.68, '#a27649');
    for (let k = 0; k < 2; k++) {
      const z = ZB - 1.49 + k * 0.39;
      M.box(L + 0.49, y + 0.14, z, L + 0.505, y + 0.67, z + 0.3, '#946a45');
      M.box(L + 0.505, y + 0.42, z + 0.12, L + 0.53, y + 0.45, z + 0.18, '#d0ad68');
    }
    const frameWood = new THREE.MeshStandardMaterial({ color: '#5f3f29', roughness: 0.8 }); own3.push(frameWood);
    const frame = new THREE.Group();
    frame.position.set(L + 0.27, y + 0.95, ZB - 1.2);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.22, 0.035), frameWood);
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.19), familyPhotoMat(0));
    photo.position.z = 0.019;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.035, 0.08), frameWood);
    foot.position.set(0, -0.12, -0.03);
    frame.add(rim, photo, foot); g.add(frame);
    // Ключи и сдача на тумбе.
    M.box(L + 0.11, y + 0.835, ZB - 0.9, L + 0.27, y + 0.842, ZB - 0.88, '#b7a575');
    for (let k = 0; k < 4; k++) M.box(L + 0.34 + k * 0.035, y + 0.834, ZB - 1.28 + (k % 2) * 0.04,
      L + 0.36 + k * 0.035, y + 0.84, ZB - 1.26 + (k % 2) * 0.04, '#bca06b');
    // Зеркало и обувь остались справа, чтобы у входа не загораживать тумбу.
    M.box(Rr - 0.06, y + 1.18, ZB - 2.09, Rr, y + 2.08, ZB - 1.27, '#513822');
    M.box(Rr - 0.07, y + 1.24, ZB - 2.02, Rr - 0.052, y + 2.02, ZB - 1.34, '#82989a');
    M.box(L + 0.18, y + 0.01, ZB - 0.86, L + 0.31, y + 0.1, ZB - 0.48, '#36291c');
    M.box(L + 0.38, y + 0.01, ZB - 0.88, L + 0.51, y + 0.1, ZB - 0.5, '#36291c');
    // Полки вдоль левой стены: отдельные доски и мелкий домашний хлам, без парящих ящиков.
    for (const shelfY of [1.18, 1.69]) {
      M.box(L + 0.015, y + shelfY, Z0 + 0.45, L + 0.34, y + shelfY + 0.04, Z0 + 1.75, '#775336');
      M.box(L + 0.06, y + shelfY - 0.2, Z0 + 0.64, L + 0.11, y + shelfY, Z0 + 0.71, '#4c3827');
      M.box(L + 0.06, y + shelfY - 0.2, Z0 + 1.48, L + 0.11, y + shelfY, Z0 + 1.55, '#4c3827');
    }
    for (let k = 0; k < 9; k++) {
      const z = Z0 + 0.53 + k * 0.13, h = 0.12 + hsh(k, 986) * 0.18, level = k % 2 ? 1.73 : 1.22;
      M.box(L + 0.09, y + level, z, L + 0.24, y + level + h, z + 0.07,
        ['#655446', '#3d5a5c', '#aa8a5b', '#645041'][k % 4]);
    }
    M.box(L + 0.09, y + 1.73, Z0 + 1.67, L + 0.25, y + 1.88, Z0 + 1.83, '#d2c7a9');
    // Небольшая люстра: цепь, латунный корпус, четыре рожка и матовые стеклянные плафоны.
    const lampZ = ZB - 1.75, metal = new THREE.MeshStandardMaterial({ color: '#866941', metalness: 0.55, roughness: 0.45 });
    entryBulbMat = new THREE.MeshStandardMaterial({ color: '#f2dcc0', emissive: '#ffcf89', emissiveIntensity: 0.1, roughness: 0.35 });
    own3.push(metal, entryBulbMat);
    const lampPart = (geo, mat, px, py, pz) => { const mesh = new THREE.Mesh(geo, mat); mesh.position.set(px, py, pz); g.add(mesh); return mesh; };
    lampPart(new THREE.CylinderGeometry(0.012, 0.012, 0.29, 8), metal, dx, y + Hc - 0.15, lampZ);
    lampPart(new THREE.CylinderGeometry(0.08, 0.11, 0.12, 12), metal, dx, y + Hc - 0.34, lampZ);
    lampPart(new THREE.TorusGeometry(0.13, 0.016, 6, 16), metal, dx, y + Hc - 0.43, lampZ).rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4, vx = Math.cos(a), vz = Math.sin(a);
      const arm = lampPart(new THREE.CylinderGeometry(0.012, 0.015, 0.32, 7), metal,
        dx + vx * 0.16, y + Hc - 0.43, lampZ + vz * 0.16);
      arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(vx, -0.16, vz).normalize());
      lampPart(new THREE.CylinderGeometry(0.085, 0.12, 0.1, 12), metal,
        dx + vx * 0.33, y + Hc - 0.46, lampZ + vz * 0.33);
      lampPart(new THREE.SphereGeometry(0.09, 12, 8), entryBulbMat,
        dx + vx * 0.33, y + Hc - 0.53, lampZ + vz * 0.33);
    }
    setEntryLight(entryLightLevel);
    const s = new THREE.Sprite(entryGlow); s.position.set(dx, y + Hc - 0.48, lampZ); s.scale.setScalar(1.4); g.add(s);
    const entryShade = new THREE.Mesh(new THREE.PlaneGeometry(DW + 0.06, DH + 0.04), entryShadeMat);
    entryShade.position.set(dx, y + DH / 2, ZB - 0.18); g.add(entryShade);
    return g;
  }

  function dropFloor (F) {
    scene.remove(F.grp);
    F.grp.traverse(o => { if (o.isMesh && !leafGeoHas(o.geometry)) o.geometry.dispose(); });
    F.A.tx.dispose(); F.A.mat.dispose();
  }
  const leafGeoHas = g => { for (const v of leafGeo.values()) if (v === g) return true; return false; };
  function ensureFloors (c) {
    const lo = clamp(c + FLOORS_AROUND[0], 0, lv - 1), hi = clamp(c + FLOORS_AROUND[1], 0, lv - 1);
    for (const [f, F] of floors) if (f < lo || f > hi) { dropFloor(F); floors.delete(f); }
    for (let f = lo; f <= hi; f++) if (!floors.has(f)) floors.set(f, buildFloor(f));
  }

  /* ── люди: курьер с коробкой, клиент (лениво — у своего этажа), гопники ── */
  const humans = [];
  const human = (p, opt) => { const g = env.human(p, opt); scene.add(g); humans.push(g); return g; };
  const cp = env.courier();
  const cour = human(cp, { shirt: cp.look && cp.look.shirt, pants: cp.look && cp.look.pants });
  let cbox = o.firstPerson ? null : env.box(o.boxes); // в подъезде пицца не торчит перед глазами
  if (cbox) { cbox.position.set(0, 1.12, 0.48); cour.add(cbox); }
  if (o.firstPerson) {
    scene.add(cam);
  }
  let man = null, manP = null;
  let portrait = null, portraitMaterials = null;
  function portraitClear () {
    if (portrait) { scene.remove(portrait); portrait.geometry.dispose(); portrait = null; }
    if (portraitMaterials) { for (const m of Object.values(portraitMaterials)) { m.map.dispose(); m.dispose(); } portraitMaterials = null; }
  }
  function portraitSprites (sprites) {
    portraitClear();
    portraitMaterials = {};
    for (const [state, image] of Object.entries(sprites)) {
      const map = new THREE.Texture(image);
      map.colorSpace = THREE.SRGBColorSpace; map.needsUpdate = true;
      portraitMaterials[state] = new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.03, depthWrite: false, side: THREE.DoubleSide, fog: false });
    }
    portrait = new THREE.Mesh(new THREE.PlaneGeometry(1.28, 1.76), portraitMaterials.idle);
    portrait.position.set(doorX(P.door) - 0.016, tgt * FH + 0.9, ZB - 0.88);
    portrait.renderOrder = 2;
    scene.add(portrait);
    setEntryLight(entryLightLevel);
  }
  function makeMan () {
    if (man) return man;
    // У двери появляется клиент из заказа; для обычного заказа используется его внешний вид.
    const cl = o.person;
    manP = cl || makePerson({ seed: (seed ^ 0x7a11) >>> 0, fem: false });
    // Сюжетный клиент берёт внешность из данных персонажа; обычным заказам остаётся прежний временный облик.
    man = human(manP, cl && cl.story ? { summer: true, q: cl.look && cl.look.q } : CLIENT_LOOK);
    const dx = doorX(P.door);
    man.position.set(dx + 0.08, tgt * FH, ZB - 0.42);
    man.rotation.y = 0;
    return man;
  }
  const gops = [];
  if (o.gopAt) {
    for (let k = 0; k < 2; k++) {
      const g = human(makePerson({ seed: (seed ^ (0x6097 + k)) >>> 0, fem: false }), { shirt: k ? '#141519' : '#1d2a5a', pants: k ? '#141519' : '#1d2a5a', cap: k ? '#141519' : '#1b1a1f', summer: true });
      const sx = 0.62 + k * 0.62, sh = o.gopAt * FH + (Math.floor(sx / TR) + 1) * R;
      g.position.set(sx + 0.15, sh - 0.5, Z1 + (k ? -0.28 : 0.22));
      g.rotation.y = -Math.PI / 2 + (k ? 0.5 : 0.2);
      const u = g.userData; u.legL.rotation.x = u.legR.rotation.x = -1.45; u.qV = 0;
      gops.push(g);
    }
  }

  /* ── DOM поверх: номера дверей площадки, облачко мужика, стрелки гопников ── */
  const ui = document.createElement('div');
  ui.className = 'sx3-ui';
  box.appendChild(ui);
  const tags = [];
  for (let i = 0; i < per; i++) { const e = document.createElement('b'); e.className = 'sx3-tag'; e.hidden = true; ui.appendChild(e); tags.push(e); }
  const bub = document.createElement('div'); bub.className = 'sx3-bub'; bub.hidden = true; ui.appendChild(bub);
  const arrow = document.createElement('div'); arrow.className = 'sx3-arrow'; arrow.hidden = true;
  arrow.innerHTML = '<i class="sx3-ring"></i><b></b><span></span>'; ui.appendChild(arrow);

  /* ── путь курьера по этажам (y — этажи, дробь): от точки у лестницы — ближний пролёт, разворот, дальний, к точке ── */
  const SEG = [0.09, 0.38, 0.635, 0.915];
  const nose = x => R * 0.6 * clamp(x / 0.3, 0, 1) * clamp((RUN - x) / 0.3, 0, 1);   // по ступенькам, а не по скату под ними
  const V = new THREE.Vector3(), V2 = new THREE.Vector2();
  function pathAt (yy, out) {
    const f = Math.floor(yy), fr = yy - f, y0 = f * FH;
    if (fr < SEG[0]) { const k = fr / SEG[0]; out.x = lerp(SPOT.x, 0.05, k); out.z = lerp(SPOT.z, Z1, k); out.y = y0; out.dx = 0.05 - SPOT.x; out.dz = Z1 - SPOT.z; }
    else if (fr < SEG[1]) { const k = (fr - SEG[0]) / (SEG[1] - SEG[0]); out.x = lerp(0.05, RUN - 0.1, k); out.z = Z1; out.y = y0 + 1.4 * out.x / RUN + nose(out.x); out.dx = 1; out.dz = 0; }
    else if (fr < SEG[2]) {
      const k = (fr - SEG[1]) / (SEG[2] - SEG[1]), a = Math.PI / 2 - k * Math.PI, r = (Z1 - Z2) / 2, cz = (Z1 + Z2) / 2;
      out.x = RUN - 0.1 + Math.cos(a) * r * 0.95; out.z = cz + Math.sin(a) * r; out.y = y0 + 1.4; out.dx = Math.sin(a); out.dz = -Math.cos(a);
    } else if (fr < SEG[3]) { const k = (fr - SEG[2]) / (SEG[3] - SEG[2]); out.x = lerp(RUN - 0.1, 0.05, k); out.z = Z2; out.y = y0 + 1.4 + 1.4 * (1 - out.x / RUN) + nose(out.x); out.dx = -1; out.dz = 0; }
    else { const k = (fr - SEG[3]) / (1 - SEG[3]); out.x = lerp(0.05, SPOT.x, k); out.z = lerp(Z2, SPOT.z, k); out.y = y0 + FH; out.dx = SPOT.x - 0.05; out.dz = SPOT.z - Z2; }
    return out;
  }
  // Высота настоящих площадок и ступеней. Движение FPS проверяет эту поверхность,
  // поэтому на пролёте игрок сам выбирает направление и не может пройти через колодец.
  function walkSurface (x, z, footY) {
    let best = null, distance = 0.23;
    const offer = height => { const d = Math.abs(height - footY); if (d <= distance) { best = height; distance = d; } };
    for (let f = 0; f < lv; f++) {
      const base = f * FH;
      if (x >= LX0 - 0.1 && x <= 0.08 && z >= ZB + 0.16 && z <= ZF - 0.15) offer(base);
      if (f === lv - 1) continue;
      if (x >= 0 && x <= RUN && z >= W1[0] + 0.08 && z <= W1[1] - 0.08) {
        offer(base + Math.min(NS, Math.floor(x / TR) + 1) * R);
      }
      if (x >= RUN - 0.08 && x <= MX + 0.08 && z >= ZB + 0.16 && z <= ZF - 0.15) offer(base + FH / 2);
      if (x >= 0 && x <= RUN && z >= W2[0] + 0.08 && z <= W2[1] - 0.08) {
        offer(base + FH / 2 + Math.min(NS, Math.floor((RUN - x) / TR) + 1) * R);
      }
    }
    return best;
  }
  const standX = i => doorX(i) - 0.5;              // где встаёт курьер у двери — слева от неё
  const standOff = i => standX(i) - SPOT.x;

  /* ── камера ── */
  const CS = { x: 0, y: 0, lx: 0, ly: 0, init: false, door: 0 };
  let W = 1, H = 1, aspect = 1.6;
  function sizes (r) {
    const el = r ? r.domElement : own.domElement;
    W = el.clientWidth || el.width || 1; H = el.clientHeight || el.height || 1;
    aspect = W / H;
    if (!r && own) { const s = own.getSize(V2); if (Math.abs(s.x - W) > 0.5 || Math.abs(s.y - H) > 0.5) own.setSize(W, H, false); }
  }
  function camAt (px, py, dt, sceneK) {
    if (o.firstPerson) {
      const st = VW.st, at = pathAt(clamp(st ? st.y : 0, 0, lv - 1), PT);
      let x = px, y = py + 1.58, z = VW.pz == null ? at.z : VW.pz;
      const look = VW.look;
      let yaw = look.yaw;
      if (sceneK > 0) {
        const e = ease(sceneK), doorX0 = doorX(P.door), targetZ = ZB + 1.2;
        x = lerp(x, doorX0, e); y = lerp(y, tgt * FH + 1.52, e); z = lerp(z, targetZ, e);
        // Дверь распахивается в подъезд: курьер уступает ей место и возвращается к порогу перед разговором.
        if (VW.scene?.portrait) {
          const openT = VW.scene.t;
          const yieldDoor = ease((openT - 0.8) / 0.7) * (1 - ease((openT - 3.1) / 0.9));
          z += 0.7 * yieldDoor;
        }
        yaw = lerpAng(yaw, Math.PI, e);
      }
      cam.position.set(x, y, z);
      cam.lookAt(x + Math.sin(yaw) * 3, y + Math.tan(look.pitch * (1 - ease(sceneK)) - 0.06 * ease(sceneK)) * 3, z + Math.cos(yaw) * 3);
      if (Math.abs(cam.aspect - aspect) > 1e-3) { cam.aspect = aspect; cam.updateProjectionMatrix(); }
      sun.position.set(x - 3, y + 5, 8); sun.target.position.set(x + Math.sin(yaw), y - 1, z + Math.cos(yaw));
      return;
    }
    const vf = Math.tan(CAM.FOV * Math.PI / 360);
    let D = (H < 520 ? CAM.VISL : CAM.VIS) / 2 / vf;
    if (D * vf * aspect * 2 < CAM.MINW) D = CAM.MINW / 2 / (vf * aspect);   // узкий экран — дальше, чтобы влезла ширина
    const hw = D * vf * aspect, xl = LX0 - 0.3, xr = MX + 0.3;
    const cx = xr - xl <= 2 * hw ? (xl + xr) / 2 : clamp(px + 0.5, xl + hw, xr - hw);
    const k = CS.init ? Math.min(1, dt * CAM.K) : 1;
    CS.init = true;
    CS.x += (cx - CS.x) * k; CS.y += (py - CS.y) * k;
    // куда смотреть, чтобы ступни (y = CS.y, z ≈ 0) легли на долю F высоты экрана
    const F = H < 520 ? CAM.FL : CAM.F, th = Math.atan2(CAM.UP, D) - Math.atan((F - 0.5) * 2 * vf);
    let x = CS.x, y = CS.y + CAM.UP, z = D, lx = CS.x, ly = y - Math.tan(th) * (D - CAM.Z), lz = CAM.Z;
    if (sceneK > 0) {                                // крупно у своей двери
      const dx = doorX(P.door), y0 = tgt * FH, e = ease(sceneK);
      x = lerp(x, dx + DOORCAM.DX, e); y = lerp(y, y0 + DOORCAM.Y, e); z = lerp(z, ZB + DOORCAM.DZ, e);
      lx = lerp(lx, dx + DOORCAM.LX, e); ly = lerp(ly, y0 + DOORCAM.LY, e); lz = lerp(lz, ZB + DOORCAM.LZ, e);
    }
    cam.position.set(x, y, z);
    cam.lookAt(lx, ly, lz);
    if (Math.abs(cam.aspect - aspect) > 1e-3) { cam.aspect = aspect; cam.updateProjectionMatrix(); }
    sun.position.set(x - 3, y + 5, 8); sun.target.position.set(lx, ly - 1, lz);
  }
  /* точка мира → место на экране мини-игры (px от левого верхнего угла box) */
  const BR = { x: 0, y: 0, ok: false };
  function project (x, y, z) {
    V.set(x, y, z).project(cam);
    return { x: (V.x + 1) / 2 * W + BR.x, y: (1 - V.y) / 2 * H + BR.y, ok: V.z < 1 };
  }
  function rectOf (pts) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pts) { const s = project(p[0], p[1], p[2]); x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /* ── кадр: где курьер, двери, камера, подписи ── */
  const PT = { x: 0, y: 0, z: 0, dx: 1, dz: 0 };
  const VW = { st: null, curF: 0, hiDoor: -1, leg: 0, scene: null, lastFl: -9, ry: Math.PI / 2, fade: 0, fadeF: -1,
    eyeY: null, look: { yaw: Math.atan2(0.37, Z1 - SPOT.z) + 0.5, pitch: 0 } };
  let hiFrame = null;
  function frameMesh () {
    const g = new THREE.Group(), add = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), HI); m.position.set(x, y, 0); g.add(m); };
    const w = DW + 0.24, h = DH + 0.14, th = 0.05;
    add(w, th, 0, h); add(th, h, -w / 2, h / 2); add(th, h, w / 2, h / 2);
    scene.add(g);
    return g;
  }
  hiFrame = frameMesh();
  hiFrame.visible = false;

  function frame (st, dt, x) {
    VW.st = st;
    const doors = x.doors, here = Math.round(st.y);
    ensureFloors(clamp(here, 0, lv - 1));
    if (man == null && (Math.abs(st.y - tgt) < 1.3 || (VW.scene && VW.scene.on))) makeMan();
    if (man && o.firstPerson) man.visible = !!(VW.scene && VW.scene.on && !VW.scene.portrait);
    // курьер: на лестнице — по пути, на площадке — к двери и обратно, гопники — стоит перед ними
    let px, py, pz, ry = VW.ry, moving = false, spd = 0;
    const gopHold = x.gop && st.phase === 'gop';
    const onLand = (o.firstPerson ? Math.abs(st.fpY - here * FH) < 0.04 : Math.abs(st.y - here) < 0.02) && !gopHold;
    if (o.firstPerson && !gopHold) {
      px = st.fpX == null ? SPOT.x : st.fpX;
      pz = st.fpZ == null ? SPOT.z : st.fpZ;
      py = st.fpY == null ? here * FH : st.fpY;
      moving = Math.abs(st.v) > 0.05;
      spd = moving ? 2.2 : 0;
    } else if (onLand && Math.abs(st.walk) > 0.005) {
      const k = clamp(Math.abs(st.walk) / 0.9, 0, 1);
      px = SPOT.x + st.walk; pz = lerp(SPOT.z, ZB + 0.72, ease(k)); py = here * FH;
      const want = st.door >= 0 ? standOff(st.door) : 0, d = want - st.walk;
      if (Math.abs(d) > 0.004) { moving = true; spd = 1.6; ry = d < 0 ? -Math.PI / 2 : Math.PI / 2; }
      else if (st.door >= 0) ry = Math.atan2(doorX(st.door) - px, ZB - pz);
    } else {
      pathAt(clamp(st.y, 0, lv - 1), PT);
      px = PT.x; py = PT.y; pz = PT.z;
      const v = st.v;
      if (Math.abs(v) > 0.08 && st.phase !== 'end') { moving = true; spd = Math.min(6.2, 3.6 * Math.abs(v) + 0.6); ry = Math.atan2(PT.dx * Math.sign(v), PT.dz * Math.sign(v)); }
      else if (onLand) ry = lerpAng(VW.ry, Math.PI / 2 - 0.55, Math.min(1, dt * 6));
    }
    if (gopHold) { ry = Math.PI / 2 - 0.2; moving = false; }
    if (st.sideT > 0) pz += st.side * 0.32 * Math.sin((1 - st.sideT / 0.28) * Math.PI);
    VW.ry = lerpAng(VW.ry, ry, Math.min(1, dt * 14));
    cour.position.set(px, py + (st.bounce || 0) * 0.05, pz);
    cour.visible = !o.firstPerson && !(VW.scene && VW.scene.on && VW.scene.portrait);
    cour.rotation.y = VW.ry;
    const u = cour.userData;
    VW.leg += dt * (moving ? 6 + spd * 2.2 : 0);
    const sw = moving ? Math.sin(VW.leg) * 0.6 : 0;
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
    u.qV = moving ? spd : 0;
    const puff = st.puff > 0 && st.phase !== 'end';
    if (u.parts && u.parts[2]) u.parts[2].rotation.x = lerp(u.parts[2].rotation.x, puff ? 0.5 : 0, Math.min(1, dt * 8));
    u.head.rotation.x = puff ? 0.35 : 0;
    // двери: насколько открыта — из stairs.js (doors: квартира → { open }), внутрь квартиры
    for (const F of floors.values()) for (const d of F.doors) {
      const s = doors.get(d.n), k = s ? s.open : 0;
      d.g.rotation.y = k * 1.65 * (o.firstPerson && d.n === flatAt(tgt, P.door) ? -1 : 1);
    }
    // курьер на развороте или дальнем пролёте — ближний пролёт этажа выше его заслоняет: полупрозрачный
    const fl = Math.floor(st.y), frr = st.y - fl;
    const fadeF = !onLand && !gopHold && frr > SEG[1] - 0.03 && frr < SEG[3] + 0.02 ? fl + 1 : -1;
    VW.fade += ((fadeF >= 0 ? 1 : 0) - VW.fade) * Math.min(1, dt * (fadeF >= 0 ? 10 : 25));
    if (fadeF >= 0) VW.fadeF = fadeF;
    FADE.opacity = 1 - 0.78 * VW.fade;
    for (const F of floors.values()) if (F.near) F.near.material = F.f === VW.fadeF && VW.fade > 0.15 ? FADE : MAT;
    // выбранная дверь — жёлтая рамка
    const sel = st.door >= 0 && onLand && st.phase === 'play' ? st.door : -1;
    hiFrame.visible = sel >= 0;
    if (sel >= 0) hiFrame.position.set(doorX(sel), here * FH, ZB + 0.06);
    // лампочка мигает (обшарпанный подъезд, один этаж)
    GLOWF.opacity = ((x.t * 7) | 0) % 9 <= 1 ? 0.12 : GLOW.opacity;
    // сцена у двери (stairs.js scene*): камера крупно, мужик говорит, коробка из рук в руки
    const SCN = VW.scene;
    let sk = 0;
    if (SCN && SCN.on) { SCN.t += dt; sk = clamp(SCN.t / DOORCAM.T, 0, 1); sceneAnim(SCN, dt); }
    VW.sk = sk;
    if (o.firstPerson) VW.eyeY = VW.eyeY == null ? py : lerp(VW.eyeY, py, Math.min(1, dt * 12));
    VW.cx = px; VW.cy = o.firstPerson ? VW.eyeY : py; VW.pz = pz;
    VW.dt = dt; VW.here = here; VW.onLand = onLand && st.phase === 'play' && Math.abs(st.v) < 0.2;
  }
  const lerpAng = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

  /* после камеры: подписи — номера дверей своей площадки, облачко, стрелки (нужна свежая камера) */
  function overlay () {
    const here = VW.here, show = VW.onLand && !(VW.scene && VW.scene.on);
    for (let i = 0; i < per; i++) {
      const e = tags[i];
      if (!show) { if (!e.hidden) e.hidden = true; continue; }
      const p = project(doorX(i), here * FH + (H < 520 ? 1.67 : DH + 0.22), ZB + 0.05);   // низкий экран: над дверью — под заданием, номер — на самой двери
      const s = String(flatAt(here, i));
      if (e.textContent !== s) e.textContent = s;
      e.hidden = false;
      e.style.transform = 'translate(' + Math.round(p.x) + 'px,' + Math.round(p.y) + 'px) translate(-50%,-50%)';
      e.classList.toggle('on', VW.st && VW.st.door === i);
    }
    const SCN = VW.scene;
    if (SCN && SCN.on && SCN.text && man) {
      if (bub.hidden) bub.hidden = false;
      const p = project(man.position.x + 0.1, man.position.y + 2.0, man.position.z);
      const bw = bub.offsetWidth || 200, bh = bub.offsetHeight || 60, bx = clamp(p.x, bw / 2 + 10, W - bw / 2 - 10), by = Math.max(p.y, bh + 22);
      bub.style.transform = 'translate(' + Math.round(bx) + 'px,' + Math.round(by) + 'px) translate(-50%,-100%)';
    } else if (!bub.hidden) bub.hidden = true;
    const A = VW.arrow;
    if (A && A.on) {
      const p = project(0.95, A.at * FH + 1.95, Z1);
      arrow.hidden = false;
      arrow.style.transform = 'translate(' + Math.round(p.x) + 'px,' + Math.round(p.y) + 'px) translate(-50%,-50%)';
    } else if (!arrow.hidden) arrow.hidden = true;
  }

  function draw (r) {
    sizes(r);
    const el = (r || own).domElement, cr = el.getBoundingClientRect(), bb = box.getBoundingClientRect();
    BR.x = cr.left - bb.left; BR.y = cr.top - bb.top;
    camAt(VW.cx || 0, VW.cy || 0, VW.dt || 0, VW.sk || 0);
    overlay();
    (r || own).render(scene, cam);
  }

  /* ── сцена у своей двери: мужик говорит, жестикулирует, берёт коробку двумя руками ── */
  function sceneAnim (S, dt) {
    if (!man) return;
    const u = man.userData;
    u.qV = 0;
    const talk = (S.text || S.talking) && !S.given;
    S.ph = (S.ph || 0) + dt;
    if (!S.given) {
      u.armR.rotation.x = talk ? -0.5 - 0.45 * Math.max(0, Math.sin(S.ph * 4.2)) : 0;
      u.armR.rotation.z = talk ? 0.25 : 0;
      u.armL.rotation.x = talk ? -0.15 * Math.max(0, Math.sin(S.ph * 3.1 + 1)) : 0;
      u.head.rotation.x = talk ? 0.08 * Math.sin(S.ph * 6) : 0;
      u.head.rotation.y = -0.25;
      if (u.parts && u.parts[2]) u.parts[2].rotation.z = talk ? 0.04 * Math.sin(S.ph * 2.3) : 0;
    } else { u.armR.rotation.x = u.armR.rotation.z = u.armL.rotation.x = 0; u.head.rotation.x = 0.1; u.head.rotation.y = 0; }
    // коробка: курьер протягивает — дугой к мужику — у него на кистях
    if (S.pass >= 0 && cbox) {
      S.pass += dt;
      const k = ease(S.pass / 0.45);
      if (!S.from) {
        cbox.updateWorldMatrix(true, false);
        const w = new THREE.Vector3(); cbox.getWorldPosition(w);
        S.from = w; cour.remove(cbox); scene.add(cbox); cbox.position.copy(w); cbox.rotation.set(0, cour.rotation.y, 0);
      }
      const tx = man.position.x, tz = man.position.z + 0.45, ty = man.position.y + 1.02;
      cbox.position.set(lerp(S.from.x, tx, k), lerp(S.from.y, ty, k) + Math.sin(k * Math.PI) * 0.15, lerp(S.from.z, tz, k));
      cbox.rotation.y = lerp(cour.rotation.y, 0, k);
      if (k >= 1) { scene.remove(cbox); cbox.position.set(0, 1.12, 0.48); cbox.rotation.set(0, 0, 0); man.add(cbox); S.given = true; S.pass = -1; }
    }
  }
  const sceneApi = {
    start (o = {}) { VW.scene = { on: true, t: 0, text: '', talking: false, pass: -1, given: false, from: null, portrait: !!o.portrait }; cour.visible = !o.portrait && !o.firstPerson; makeMan().visible = !o.portrait; if (o.portrait && cbox) cbox.visible = false; if (o.portrait) setEntryLight(0); },
    light: setEntryLight,
    portrait (on) { if (VW.scene) { VW.scene.portrait = !!on; cour.visible = !on && !o.firstPerson; makeMan().visible = !on; if (cbox) cbox.visible = !on; } },
    portraitSprites,
    portraitState (state) { if (portrait && portraitMaterials) portrait.material = portraitMaterials[state] || portraitMaterials.idle; },
    portraitBreath (x, y) { if (portrait) portrait.scale.set(x, y, 1); },
    portraitClear,
    say (text) { if (!VW.scene) return; VW.scene.text = text; bub.textContent = text; bub.classList.remove('sx3-pop'); void bub.offsetWidth; bub.classList.add('sx3-pop'); },
    talk (on) { if (VW.scene) VW.scene.talking = !!on; },
    hush () { if (VW.scene) VW.scene.text = ''; },
    give () { if (VW.scene && VW.scene.pass < 0 && !VW.scene.given) { if (VW.scene.portrait && o.firstPerson) VW.scene.given = true; else VW.scene.pass = 0; } },
    given: () => !!(VW.scene && VW.scene.given),
    k: () => VW.sk || 0,
  };

  /* ── для stairs.js: тап по двери, рамки обучения, стрелки гопников ── */
  function doorRect (i, f = Math.round(VW.st ? VW.st.y : 0)) {
    const dx = doorX(i), y = f * FH;
    return rectOf([[dx - DW / 2 - 0.06, y, ZB], [dx + DW / 2 + 0.06, y, ZB], [dx - DW / 2 - 0.06, y + DH + 0.06, ZB], [dx + DW / 2 + 0.06, y + DH + 0.06, ZB]]);
  }
  function manRect () {
    const p = cour.position;
    return rectOf([[p.x - 0.35, p.y, p.z], [p.x + 0.35, p.y, p.z], [p.x - 0.35, p.y + 1.85, p.z], [p.x + 0.35, p.y + 1.85, p.z]]);
  }
  function pick (px, py) {
    if (!VW.st) return -1;
    for (let i = 0; i < per; i++) { const r = doorRect(i); if (px >= r.x - 6 && px <= r.x + r.w + 6 && py >= r.y - 6 && py <= r.y + r.h + 6) return i; }
    return -1;
  }
  function gopRect () {
    const y = (o.gopAt || 0) * FH;
    return rectOf([[0.3, y, Z1], [2.0, y, Z1], [0.3, y + 2.3, Z1], [2.0, y + 2.3, Z1]]);
  }
  function setArrow (a) {
    VW.arrow = a;
    if (!a || !a.on) return;
    arrow.classList.toggle('miss', a.state === 'miss');
    arrow.querySelector('b').textContent = a.dir < 0 ? '◀' : '▶';
    arrow.style.setProperty('--k', a.state === 'beat' ? a.k.toFixed(3) : '1');
    arrow.classList.toggle('beat', a.state === 'beat');
    arrow.querySelector('span').innerHTML = Array.from({ length: a.n }, (_, i) => '<i' + (i < a.i ? ' class="ok"' : '') + '></i>').join('');
  }

  function dispose () {
    if (CUR === view) CUR = null;
    portraitClear();
    QP.topAt = topAt;
    for (const F of floors.values()) dropFloor(F);
    floors.clear();
    for (const g of leafGeo.values()) g.dispose();
    leafGeo.clear();
    if (cbox) { if (cbox.parent) cbox.parent.remove(cbox); cbox.traverse(m => { if (m.isMesh) { m.geometry.dispose(); if (!m.material.userData.keep) m.material.dispose(); } }); cbox = null; }
    for (const g of humans) { try { env.drop(g); } catch (e) { /* — */ } if (g.parent) g.parent.remove(g); }
    humans.length = 0;
    hiFrame.traverse(m => { if (m.isMesh) m.geometry.dispose(); });
    chairmanActive = false;
    for (const m of own3) m.dispose();
    ui.remove();
    if (own) { own.dispose(); try { own.forceContextLoss(); } catch (e) { /* — */ } own.domElement.remove(); own = null; }
    scene.clear();
  }

  const view = {
    game, WALK, standOff, frame, draw: r => draw(r), render: () => { if (own) draw(null); },
    pick, doorRect, manRect, gopRect, setArrow, scene: sceneApi, dispose,
    look (dx, dy) { if (!o.firstPerson) return; VW.look.yaw -= dx * 0.003; VW.look.pitch = clamp(VW.look.pitch - dy * 0.003, -0.55, 0.55); },
    heading: () => VW.look.yaw,
    walkSurface,
    walkDir (progress) { const at = pathAt(clamp(progress, 0, lv - 1), PT), len = Math.hypot(at.dx, at.dz) || 1; return { x: at.dx / len, z: at.dz / len }; },
    doorAt: i => doorX(i),
    /* проверки: яркий кубик в точке мира (где он на экране — project) */
    mark: (x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), HI); m.position.set(x, y, z); scene.add(m); return project(x, y, z); },
    stats: () => { const f = project(cour.position.x, cour.position.y, cour.position.z); return { floors: [...floors.keys()], humans: humans.length, man: !!man, portrait: !!portrait, firstPerson: !!o.firstPerson, W, H, cam: [cam.position.x, cam.position.y, cam.position.z].map(v => +v.toFixed(2)), feet: [Math.round(f.x), Math.round(f.y)], cour: [cour.position.x, cour.position.y, cour.position.z].map(v => +v.toFixed(2)) }; },
  };
  ensureFloors(0);
  CUR = view;
  QP.topAt = null;
  return view;
}
