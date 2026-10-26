/* ──────────────────────────────────────────────────────────────────────────
   Поддельные тени (автор 18.10.2026: «не хватает теней — от домов, машин и людей,
   хотя бы очень лайтовые и не реалистичные»). Правила словами — docs/CAREER.md
   «Город: как выглядит» → «Тени домов, машин и людей».

   Настоящих теней three.js (shadowMap) нет: на Деке и телефоне это вторая отрисовка
   всего города. Вместо них — два дешёвых слоя.

   1. ДОМА. Маска теней — маленькая картинка 1024² (одноканальная, 1 МБ видеопамяти)
      сверху на квадрат ±300 м вокруг машины. В неё рисуется «след» каждого дома:
      контур, вытянутый от солнца на долю высоты дома (FS.LEN), у стены — гуще, к концу
      тени — бледнее; потом сами контуры домов стираются (на крыше и под домом тени нет).
      Пересечения теней не темнее одной тени (смешивание MAX). Рисуется не каждый кадр, а
      когда машина отъехала на FS.MOVE м или солнце повернулось на FS.TURN° — раз в
      несколько секунд, 2 вызова отрисовки в маленькую цель. Земля, дороги, реквизит,
      разметка (склейки клеток LITM и FLATM) берут маску в своём шейдере по мировой точке —
      0 новых вызовов в обычном кадре. Тень ложится только на то, что смотрит вверх
      (земля, крыши низких построек, верх реквизита); стены — нет. Сила — одной униформой:
      днём FS.DAY, к вечеру и ночью — меньше (по силе солнца), в дождь, грозу и снежную
      погоду — бледнее (FS.WET, FS.SNOWY). Направление — от настоящего солнца игры (оно ходит
      по небу), длина — вечером и утром длиннее (FS.LEN).

      Столбы, фонари, знаки, светофоры и стволы деревьев — тонкие полоски в той же маске (poleGeo).

   2. МАШИНЫ, ЛЮДИ, ЗВЕРИ. Мягкое пятно под каждым: машины — свой InstancedMesh с картинкой как у
      машины игрока (carshadow.js), по наклону кузова; люди и звери — второй (2 вызова на всех).
      Только ближе FS.R м от машины, у края — бледнеет. Днём пятно чуть сдвинуто от солнца, ночью —
      ровно под ним и бледнее. Старые круги под машинами (полная модель, машины курьеров) спрятаны.

   Флаги для замера одной сборкой: ?nofs — без всего, ?nofsh — без теней домов,
   ?nofsb — без пятен, ?nofsc — без тени домов на машинах (carMat). __dlv.FSH — числа и ручки.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { STYLE } from './softcity.js';
import { pullDepth } from './carshadow.js';   // 0п87: пятна не прячутся под соседнюю поверхность
import { UNIFORMS as SSU, GLSL_COVER, withSS } from './sunshadow.js';
import { ON as SUNP_ON } from './sunpath.js';   // путь солнца ниже (2г2): длина тени — по высоте солнца   // 2г2: где настоящие тени от солнца — маски домов нет (sunshadow.js)
import { car as matCar } from './materials.js';   // 2г11: лак кузова — метка MAT_CAR у всех материалов машин (materials.js)

const Q = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
const OFF = Q.has('nofs');

export const FS = {
  HOUSES: !OFF && !Q.has('nofsh'),
  BLOBS: !OFF && !Q.has('nofsb'),
  // маска теней домов
  N: 2048,            // сторона маски, точек (2048² одним каналом — 4 МБ видеопамяти)
  HALF: 300,          // маска — квадрат ±HALF м вокруг машины (0,29 м на точку: тонкие тени столбов не рвутся, край мягкий сам)
  MOVE: 50,           // машина отъехала на столько м от середины маски — нарисовать заново
  TURN: 1.2,          // солнце повернулось на столько градусов — заново
  DAY: STYLE.on ? STYLE.shadow : 0.35,          // насколько темнее земля в тени днём, в ясную погоду (у стены; к концу тени — FS.TIP от неё), в цвете экрана
  TIP: 0.6,           // конец тени — такая доля от густоты у стены
  LEN: [0.4, 0.65],   // длина тени — доля высоты дома: в полдень — меньшее, к утру и вечеру — большее (?oldsun; с путём солнца sunpath.js — по его высоте)
  LEN_MAX: 3.5,       // с путём солнца sunpath.js: не длиннее стольких высот дома (солнце у горизонта)
  LEN_MAN: 1.0,       // тень-пятно человека: длина как у дома, но не больше этой доли
  WET: 0.3,           // в сильный дождь сила × (1 − WET) — и так слабее: солнце в дождь тусклее (weather.js)
  SNOWY: 0.6,         // в снежную погоду сила × SNOWY
  // пятна под машинами, людьми и зверями
  CAP: 320,           // сколько пятен за раз
  R: 110,             // ближе стольких м от машины игрока
  FADE: 25,           // последние FADE м до R — бледнеет
  CAR: 0.45, CAR_NIGHT: 0.28,    // густота пятна машины в середине днём / ночью — как у машины игрока (carshadow.js)
  MAN: 0.36, MAN_NIGHT: 0.18,    // человека и зверя
  SUN: 0.25,          // сдвиг пятна машины от солнца днём, м (небольшой: тень «держится» за колёса)
  LIFT: 0.035,        // пятно машины над низом кузова, м
  AIR: 3,             // машина в воздухе: к такой высоте пятно почти пропало, м
};

const ST = { built: 0, buildMs: 0, houses: 0, tris: 0, draws: 0, lastDrawMs: 0, blobs: 0, by: [0, 0, 0, 0], k: 0, len: 0, dir: [0, 0], stepMs: 0 };

/* ── униформы для шейдеров земли: маска, окно (середина и 1/ширина), сила ── */
const U = {
  uFsMap: { value: null },
  uFsWin: { value: new THREE.Vector3(0, 0, 1 / 600) },
  uFsK: { value: 0 },
  uFsCar: { value: Q.has('nofsc') ? 0 : 1 },   // доля силы тени на машинах (carMat; ?nofsc — без неё, для сравнения)
};
const VERT = `
#include <project_vertex>
{ vec4 fsP = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  fsP = instanceMatrix * fsP;
#endif
  vFsW = (modelMatrix * fsP).xyz; }`;
const FRAG_HEAD = GLSL_COVER + `
uniform sampler2D uFsMap; uniform vec3 uFsWin; uniform float uFsK;
varying vec3 vFsW;
float fsShade () {
  vec2 uv = (vFsW.xz - uFsWin.xy) * uFsWin.z + 0.5;
  vec2 e = abs(uv - 0.5);
  float s = texture2D(uFsMap, uv).r;
  ${STYLE.on ? `// Feather the shadow mask only; geometry and HUD remain sharp.
  vec2 tap = vec2(${(1.5 / 2048).toFixed(10)}, 0.0);
  s = s * 0.4 + 0.15 * (texture2D(uFsMap, uv + tap).r + texture2D(uFsMap, uv - tap).r
    + texture2D(uFsMap, uv + tap.yx).r + texture2D(uFsMap, uv - tap.yx).r);` : ''}
  s *= 1.0 - smoothstep(0.4, 0.48, max(e.x, e.y));
  s *= 1.0 - ssCover(vFsW);                       // 2г2: тут настоящие тени от солнца (sunshadow.js)
  vec3 N = normalize(cross(dFdx(vFsW), dFdy(vFsW)));
  return 1.0 - uFsK * s * smoothstep(0.45, 0.8, abs(N.y));
}
`;
/* материал склейки земли / разметки — берёт маску теней домов: поверх всех его прежних правок шейдера */
export function mat (m) {
  if (!FS.HOUSES) return m;
  m.userData.fsGround = 1;
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey;
  m.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(this, sh, r);
    Object.assign(sh.uniforms, U, SSU);
    sh.vertexShader = 'varying vec3 vFsW;\n' + sh.vertexShader.replace('#include <project_vertex>', VERT);
    // после перевода в цвет экрана (sRGB), до тумана: густота FS.DAY — как у пятна под машиной (смешивание тоже в цвете экрана)
    sh.fragmentShader = FRAG_HEAD + sh.fragmentShader.replace('#include <colorspace_fragment>', '#include <colorspace_fragment>\nif (uFsK > 0.0) gl_FragColor.rgb *= fsShade();');
  };
  m.customProgramCacheKey = function () { return (key ? key.call(this) : '') + '|fs'; };
  m.needsUpdate = true;
  return m;
}

/* Машины в тени домов (0п5, 23.10.2026: «въехал в тень — асфальт затенён, а машина светлая»): та же маска в точке
   каждого пикселя кузова — краска, стёкла, колёса темнее на ту же долю, что асфальт под ними (без проверки «смотрит
   вверх»: в тени весь кузов). Тень по машине ползёт, как по земле: въехал наполовину — темнее половина. Светящееся
   (MeshBasic: фары, фонари, приборы) и свои программы (ShaderMaterial) — как есть. Своя машина — каждый её
   материал (ownCar, раз в FS_CAR.EVERY кадров ищет новые: модель, дворники, фары приходят позже); кузов в грязи —
   в программе грязи (cardirt.js inject → shadeInject); поток — общий материал лёгких машин (game.js LITE_MAT, одна
   программа на все) и «Семёрки» потока (realcar.js trafficCar, bodyShader); салон вида из-за руля (camview.js).
   Новых вызовов нет; программы — в прогреве (game.js WARM extra: машина игрока в грязи + carMats). */
const FS_CAR = { EVERY: 60 };   // доля силы тени асфальта на машине — U.uFsCar (1 — как асфальт)
const FRAG_CAR = `
uniform sampler2D uFsMap; uniform vec3 uFsWin; uniform float uFsK; uniform float uFsCar;
varying vec3 vFsW;
float fsShadeCar () {
  vec2 uv = (vFsW.xz - uFsWin.xy) * uFsWin.z + 0.5;
  vec2 e = abs(uv - 0.5);
  float k = 1.0 - uFsK * uFsCar * texture2D(uFsMap, uv).r * (1.0 - smoothstep(0.4, 0.48, max(e.x, e.y))) * (1.0 - ssCover(vFsW));
  if (uSsP.z > 0.0 && uFsCar > 0.0) {             // 2г2: настоящая тень от солнца на кузове (sunshadow.js)
    vec3 N = normalize(cross(dFdx(vFsW), dFdy(vFsW)));
    float lit = dot(N, uSsDir) > 0.0 ? ssLit(vFsW, N) : 1.0;
    return k * mix(1.0, dot(uSsFlat, vec3(0.3333)), uSsP.z * uFsCar * (1.0 - lit));
  }
  return k;
}
`;
/* в чужую программу (cardirt.js inject — своя машина в грязи; realcar.js bodyShader — кузов «Семёрки» потока) */
export function shadeInject (sh) {
  if (!FS.HOUSES || sh.fragmentShader.indexOf('fsShadeCar') >= 0) return;
  Object.assign(sh.uniforms, U, SSU);
  sh.vertexShader = 'varying vec3 vFsW;\n' + sh.vertexShader.replace('#include <project_vertex>', VERT);
  sh.fragmentShader = withSS(FRAG_CAR + sh.fragmentShader, true).replace('#include <colorspace_fragment>', '#include <colorspace_fragment>\nif ((uFsK + uSsP.z) * uFsCar > 0.0) gl_FragColor.rgb *= fsShadeCar();');
}
/* материал со своей программой грязи (userData.dirt: cardirt.js, realcar.js) тень берёт там же — не трогаем; свой обёрнутый,
   который потом переписали без нас (onBeforeCompile = …), — оборачиваем заново */
export function carMat (m) {
  matCar(m);
  if (!FS.HOUSES || !m || !m.isMaterial || m.userData.dirt || m.userData.fsGround || m.isMeshBasicMaterial || m.isShaderMaterial || m.isRawShaderMaterial) return m;
  if (!(m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshStandardMaterial || m.isMeshToonMaterial)) return m;
  if (m.userData.fsCar && m.onBeforeCompile === FSC_FN.get(m)) return m;
  m.userData.fsCar = 1;
  // ключ программы: свой у материала — его + «|fsc»; нет своего (у three.js по умолчанию — текст onBeforeCompile) — текст прежней
  // правки + «|fsc»: иначе у всех обёрнутых один ключ (текст обёртки) и программа с чужой правкой досталась бы не тому
  const prev = m.onBeforeCompile, key = Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey') ? m.customProgramCacheKey : null, pk = prev ? String(prev) : '';
  const fn = function (sh, r) {
    if (prev) prev.call(this, sh, r);
    shadeInject(sh);
  };
  m.onBeforeCompile = fn; FSC_FN.set(m, fn);
  m.customProgramCacheKey = function () { return (key ? key.call(this) : pk) + '|fsc'; };
  m.needsUpdate = true;
  return m;
}
const FSC_FN = new WeakMap();
/* все материалы машины (кроме курьера за рулём — у людей общие материалы) */
export function carMats (g) {
  if (!FS.HOUSES || !g) return;
  const walk = o => {
    if (o.name === 'driver') return;
    if (o.isMesh && o.material) for (const m of [].concat(o.material)) carMat(m);
    for (const c of o.children) walk(c);
  };
  walk(g);
}
let OWN = null, OWN_R = null, OWN_N = 0;
function ownCar (E) {
  const c = E.car ? E.car() : null;
  if (!c) return;
  const r = c.userData && c.userData.real;
  if (c === OWN && r === OWN_R && ++OWN_N < FS_CAR.EVERY) return;
  OWN = c; OWN_R = r; OWN_N = 0;
  carMats(c);
}

/* ── маска теней домов ── */
let R = null, RT = null, MS = null, MCAM = null, SH_MAT = null, ER_MAT = null;
let cx = NaN, cz = NaN, dX = 0, dZ = 0, dLen = 0;
/* вершины: (x, w, z) — w = высота дома над землёй у вершин «вершины тени» (их сдвигает униформа), 0 — у основания */
function houseGeo (buildings, groundH) {
  let nv = 0, ns = 0, nf = 0, nh = 0;
  const list = [];
  for (const b of buildings) {
    if (b._top === undefined || !b.p || b.p.length < 3) continue;
    const p = b.p;
    let g = 0;
    for (const q of p) g += groundH(q[0], q[1]);
    g /= p.length;
    const h = b._top - g;
    if (!(h > 1)) continue;
    const ct = p.map(q => new THREE.Vector2(q[0], q[1]));
    let tri;
    try { tri = THREE.ShapeUtils.triangulateShape(ct, []); } catch (e) { continue; }
    if (!tri.length) continue;
    list.push([p, h, tri]);
    nv += p.length * 2; ns += p.length * 6 + tri.length * 3; nf += tri.length * 3; nh++;
  }
  const pos = new Float32Array(nv * 3), si = new Uint32Array(ns), fi = new Uint32Array(nf);
  let v = 0, s = 0, f = 0;
  for (const [p, h, tri] of list) {
    const n = p.length, v0 = v;
    for (let i = 0; i < n; i++) {
      const o = (v0 + i * 2) * 3;
      pos[o] = p[i][0]; pos[o + 1] = 0; pos[o + 2] = p[i][1];            // основание
      pos[o + 3] = p[i][0]; pos[o + 4] = h; pos[o + 5] = p[i][1];        // сдвинутое от солнца
    }
    v += n * 2;
    // стенки «следа»: каждое ребро контура, протянутое от основания до сдвинутого
    for (let i = 0; i < n; i++) {
      const a0 = v0 + i * 2, a1 = a0 + 1, b0 = v0 + ((i + 1) % n) * 2, b1 = b0 + 1;
      si[s++] = a0; si[s++] = b0; si[s++] = b1;
      si[s++] = a0; si[s++] = b1; si[s++] = a1;
    }
    // сдвинутый контур целиком (конец тени) и контур дома (стереть)
    for (const t of tri) {
      si[s++] = v0 + t[0] * 2 + 1; si[s++] = v0 + t[1] * 2 + 1; si[s++] = v0 + t[2] * 2 + 1;
      fi[f++] = v0 + t[0] * 2; fi[f++] = v0 + t[1] * 2; fi[f++] = v0 + t[2] * 2;
    }
  }
  const at = new THREE.BufferAttribute(pos, 3), as = new THREE.BufferAttribute(new Float32Array(nv), 1);   // aS — полуширина вбок (у домов 0)
  const gs = new THREE.BufferGeometry(), gf = new THREE.BufferGeometry();
  gs.setAttribute('position', at); gs.setAttribute('aS', as); gs.setIndex(new THREE.BufferAttribute(si, 1));
  gf.setAttribute('position', at); gf.setAttribute('aS', as); gf.setIndex(new THREE.BufferAttribute(fi, 1));
  gs.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5); gf.boundingSphere = gs.boundingSphere;   // вершин в JS не будет — шар заранее (сортировка three.js)
  // копия в JS не нужна после загрузки в видеокарту (память телефона): отпускаем, как склейки города
  const free = function () { this.array = null; };   // как dropArr в game.js: count остаётся, рисуется из видеокарты
  gs.index.onUpload(free); gf.index.onUpload(free); at.onUpload(free); as.onUpload(free);
  ST.houses = nh; ST.tris = (ns + nf) / 3;
  return [gs, gf];
}
/* Столбы, фонари, знаки, светофоры, стволы деревьев (автор 18.10.2026: «у столба нет тени»): тонкая полоска от основания
   по направлению тени, длина — та же доля высоты, что у домов. 4 вершины на столб: основание и конец, слева и справа.
   Деревья — вместе (не падают); то, что сбивается (фонари, знаки, светофоры), — отдельно: сбили — полоска схлопывается */
function poleGeo (list, keep) {
  const n = list.length, pos = new Float32Array(n * 12), as = new Float32Array(n * 4), idx = new Uint32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const [x, z, h, w] = list[i], o = i * 12, v = i * 4;
    pos.set([x, 0, z, x, 0, z, x, h, z, x, h, z], o);
    as[v] = -w; as[v + 1] = w; as[v + 2] = -w; as[v + 3] = w;
    idx.set([v, v + 1, v + 3, v, v + 3, v + 2], i * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aS', new THREE.BufferAttribute(as, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  if (!keep) { const free = function () { this.array = null; }; for (const k in g.attributes) g.attributes[k].onUpload(free); g.index.onUpload(free); }
  return g;
}
const POLE = { lamp: [6.5, 0.26], sign: [2.6, 0.2], light: [4.5, 0.22], tree: [3.2, 0.28] };   // полоска шире столба: тоньше 1,5 точки маски — рвётся в пунктир   // высота, м; полуширина полоски, м
let DYN = [], DYN_G = null, dynI = 0;            // сбиваемые столбы: { o — предмет, i — номер столба, h, w, on }
function polesFrom (api) {
  const trees = [], dyn = [];
  for (const s of api.solids || []) if (s.tree && !s.edGone) trees.push([s.cx, s.cz, POLE.tree[0], POLE.tree[1]]);
  for (const it of api.smash || []) {
    const P = (it.kind === 'lamp' && it.post) ? POLE.lamp : it.kind === 'sign' ? POLE.sign : null;
    if (P) dyn.push({ o: it, h: P[0], w: P[1], on: !it.down });
  }
  for (const p of api.props || []) if (p.kind === 'light') dyn.push({ o: p, h: POLE.light[0], w: POLE.light[1], on: !p.down });
  ST.trees = trees.length; ST.poles = dyn.length;
  return [trees, dyn];
}

const MVERT = `
uniform vec2 uC; uniform float uIH; uniform vec2 uD;
attribute float aS;
varying float vV;
void main () {
  vec2 dn = dot(uD, uD) > 1e-8 ? normalize(uD) : vec2(1.0, 0.0);
  vec2 p = position.xz + uD * position.y + vec2(-dn.y, dn.x) * aS;   // столб: полоска шириной 2·aS поперёк тени
  vV = position.y > 0.0 ? ${FS.TIP.toFixed(2)} : 1.0;
  gl_Position = vec4((p - uC) * uIH, 0.0, 1.0);
}`;
const MU = { uC: { value: new THREE.Vector2() }, uIH: { value: 1 / FS.HALF }, uD: { value: new THREE.Vector2() } };

/* один раз, когда дома построены (b._top): геометрия, цель, свой маленький «кадр» */
export function* buildSteps (api) {
  if (!FS.HOUSES || RT) return;
  const t0 = performance.now();
  R = api.renderer;
  const [gs, gf] = quiet(() => houseGeo(api.buildings, api.groundH));
  yield 'fsgeo';
  const [trees, dyn] = polesFrom(api);
  const gt = quiet(() => poleGeo(trees, false));
  DYN = dyn; DYN_G = quiet(() => poleGeo(dyn.map(q => [q.o.x, q.o.z, q.on ? q.h : 0, q.on ? q.w : 0]), true));
  yield 'fspoles';
  quiet(() => maskInit(gs, gf, [gt, DYN_G]));
  U.uFsMap.value = RT.texture;
  yield 'fsrt';
  try { R.domElement.addEventListener('webglcontextrestored', () => { cx = NaN; }); } catch (e) { /* — */ }   // маска пропала с видеокартой — нарисовать заново
  drawMask(api.x || 0, api.z || 0);               // программы маски — сейчас, под меню, а не рывком в смене
  cx = NaN; ST.draws = 0;
  ST.built = 1; ST.buildMs = Math.round(performance.now() - t0);
}
function maskInit (gs, gf, poles) {
  RT = new THREE.WebGLRenderTarget(FS.N, FS.N, { format: THREE.RedFormat, type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
  RT.texture.colorSpace = THREE.NoColorSpace;
  SH_MAT = new THREE.ShaderMaterial({ uniforms: MU, vertexShader: MVERT, fragmentShader: 'varying float vV;\nvoid main () { gl_FragColor = vec4(vV, 0.0, 0.0, 1.0); }',
    blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  ER_MAT = new THREE.ShaderMaterial({ uniforms: MU, vertexShader: MVERT, fragmentShader: 'void main () { gl_FragColor = vec4(0.0); }',
    blending: THREE.NoBlending, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  MS = new THREE.Scene();
  MS.background = new THREE.Color(0);
  const ms = new THREE.Mesh(gs, SH_MAT), mf = new THREE.Mesh(gf, ER_MAT);
  ms.frustumCulled = mf.frustumCulled = false;
  ms.renderOrder = 0; mf.renderOrder = 1;
  ms.matrixAutoUpdate = mf.matrixAutoUpdate = false;
  MS.add(ms, mf);
  for (const g of poles) { const m = new THREE.Mesh(g, SH_MAT); m.frustumCulled = false; m.renderOrder = 0; m.matrixAutoUpdate = false; MS.add(m); }
  MS.matrixWorldAutoUpdate = false;
  MCAM = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
}

/* сбиваемые столбы — по кусочку в кадр (весь список за ~0,5 с): упал — полоска в точку, поставили — обратно */
function pollPoles () {
  const n = DYN.length;
  if (!n) return false;
  const pa = DYN_G.attributes.position, sa = DYN_G.attributes.aS;
  let ch = false;
  for (let c = Math.min(n, 160); c > 0; c--) {
    if (dynI >= n) dynI = 0;
    const q = DYN[dynI], on = !q.o.down;
    if (on !== q.on) {
      q.on = on; ch = true;
      const h = on ? q.h : 0, w = on ? q.w : 0, o = dynI * 12;
      pa.array[o + 7] = h; pa.array[o + 10] = h;
      sa.array[dynI * 4] = -w; sa.array[dynI * 4 + 1] = w; sa.array[dynI * 4 + 2] = -w; sa.array[dynI * 4 + 3] = w;
      pa.addUpdateRange(o, 12); sa.addUpdateRange(dynI * 4, 4);
      pa.needsUpdate = true; sa.needsUpdate = true;
    }
    dynI++;
  }
  return ch;
}

function drawMask (x, z) {
  const t0 = performance.now();
  cx = x; cz = z;
  MU.uC.value.set(x, z);
  MU.uD.value.set(dX * dLen, dZ * dLen);
  const prev = R.getRenderTarget();
  R.setRenderTarget(RT);
  R.render(MS, MCAM);
  R.setRenderTarget(prev);
  U.uFsWin.value.set(x, z, 1 / (2 * FS.HALF));
  ST.draws++; ST.lastDrawMs = +(performance.now() - t0).toFixed(2);
}

/* ── пятна ── */
let BLOB = null, BI = null, BC = null, NB = 0;
function blobTex () {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#000';
  x.filter = 'blur(6px)';
  x.beginPath();
  x.roundRect(14, 14, 36, 36, 12);    // скруглённый квадрат, размытый: под машиной — тень кузова, под человеком — круглое пятно
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const BK = 64 / 36;                     // плоскость больше пятна: сколько тела — × BK
/* three.js даёт каждому новому материалу, геометрии и текстуре uuid из Math.random, а город строится с зерном
   (editlayer.js: Math.random подменён на время сборки) — наши объекты, созданные посреди сборки, сдвинули бы все
   случайные числа после них, и город вышел бы другим. Поэтому создаём их со своим генератором */
let QS = (Date.now() ^ 0x5EED) >>> 0;
function quiet (fn) {
  const r0 = Math.random;
  Math.random = () => ((QS = (Math.imul(QS, 1664525) + 1013904223) >>> 0) / 4294967296);
  try { return fn(); } finally { Math.random = r0; }
}
export function init (scene) {
  if (!FS.BLOBS || BLOB) return;
  quiet(() => blobInit(scene));
}
function blobInit (scene) {
  BLOB = instMesh(blobMat(blobTex(), 'fakeBlob'), FS.CAP);          // люди и звери
  BI = BLOB.instanceMatrix.array; BC = BLOB.instanceColor.array;
  CARB = instMesh(blobMat(carTex(), 'fakeBlob'), FS.CAP);           // машины (та же программа, своя картинка)
  CI = CARB.instanceMatrix.array; CC = CARB.instanceColor.array;
  // в своей группе: cull.js забирает в «статику» (отсечение по клетке и заморозка) меши прямо на сцене с нулевым положением —
  // пятна, рассыпанные по городу, пропадали бы, когда клетка их общего шара (у начала координат) вне кадра
  const G = new THREE.Group();
  G.add(BLOB, CARB);
  scene.add(G);
}

/* Пятно машины (автор 18.10.2026: «под машиной какое-то пятно странное»): было — то же квадратное размытое пятно, что у
   человека, растянутое вдоль машины и плоское — на склоне и приподнятой парковке половина уходила под землю и резала
   жёсткий клин; у машин курьеров и полных моделей под ним ещё и старый круг. Теперь — своя картинка, как у машины игрока
   (carshadow.js: прямоугольник со скруглёнными углами, плотный под кузовом, мягкий к краю), лежит по наклону кузова,
   старые круги спрятаны — одно пятно на машину */
let CARB = null, CI = null, CC = null, NC = 0;
const CWK = 80 / 48, CLK = 144 / 108;          // плоскость больше кузова: картинка 80×144, кузов в ней 48×108
function carTex () {
  const c = document.createElement('canvas');
  c.width = 80; c.height = 144;
  const x = c.getContext('2d');
  x.fillStyle = '#000';
  x.filter = 'blur(7px)';
  x.beginPath();
  x.roundRect(12, 13, 56, 118, 16);   // как у машины игрока: плотная часть чуть шире кузова
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function blobMat (tex, key) {
  const m = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.alphaMap = tex;
  m.onBeforeCompile = sh => {
    pullDepth(sh, 0.35);           // 0п87: не прячется под соседнюю поверхность выше (carshadow.js); меньше, чем у своей — не темнит обувь людей
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <alphamap_fragment>', '#ifdef USE_ALPHAMAP\n  diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).a;\n#endif')
      .replace('#include <color_fragment>', '#ifdef USE_COLOR\n  diffuseColor.a *= vColor.r;\n#endif\n  diffuseColor.rgb = vec3(0.0);');
  };
  m.customProgramCacheKey = () => key;
  return m;
}
function instMesh (m, cap) {
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), m, cap);
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.instanceColor.setUsage(THREE.DynamicDrawUsage);
  im.count = 0; im.frustumCulled = false; im.renderOrder = -1; im.matrixAutoUpdate = false;
  return im;
}
const M4 = new THREE.Matrix4(), QY = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), PV = new THREE.Vector3(), SV = new THREE.Vector3();
function putCar (x, y, z, q, w, l, a) {
  if (NC >= FS.CAP || a <= 0.01) return;
  M4.compose(PV.set(x, y, z), q, SV.set(w, 1, l));
  M4.toArray(CI, NC * 16);
  CC[NC * 3] = a;
  NC++;
}
/* старый круг под машиной (полная модель — game.js makeCar, машины курьеров — rivalLite) — спрятать: пятно теперь одно */
const NOC = new WeakSet();
export function noCircle (g) {
  if (!g || !g.isObject3D || NOC.has(g)) return;
  NOC.add(g);
  for (const c of g.children) if (c.isMesh && c.geometry && c.geometry.type === 'CircleGeometry' && c.material && c.material.transparent) c.visible = false;
}

/* пятно: середина (x, y, z), поворот h (вокруг вертикали), ширина w и длина l плоскости, густота a */
function put (x, y, z, h, w, l, a) {
  if (NB >= FS.CAP || a <= 0.01) return;
  const c = Math.cos(h), s = Math.sin(h), o = NB * 16;
  // поворот вокруг y на h, масштаб (w, 1, l) — столбцы матрицы
  BI[o] = c * w; BI[o + 1] = 0; BI[o + 2] = -s * w; BI[o + 3] = 0;
  BI[o + 4] = 0; BI[o + 5] = 1; BI[o + 6] = 0; BI[o + 7] = 0;
  BI[o + 8] = s * l; BI[o + 9] = 0; BI[o + 10] = c * l; BI[o + 11] = 0;
  BI[o + 12] = x; BI[o + 13] = y; BI[o + 14] = z; BI[o + 15] = 1;
  BC[NB * 3] = a;
  NB++;
}

const CAR_W = { bus: 2.5, moped: 0.75, smart: 1.6, suv: 2.0 };

/* Каждый кадр перед отрисовкой. E — { V, sun, ENV, weather, rain, traffic, humans, yard(x, z, r, fn), animals: [списки с .g], scene } */
let A = null, ok = true;
const P = new THREE.Vector3();
export function step (E) {
  if (!ok) return;
  const t0 = performance.now();
  A = E;
  const V = E.V, ENV = E.ENV, sun = E.sun;
  // солнце: откуда светит (по земле), сила, длина тени
  let sx = sun.position.x - sun.target.position.x, sz = sun.position.z - sun.target.position.z;
  const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
  const night = ENV.night || 0, R0 = ENV.rain || 0;
  const wid = E.weather ? E.weather() : '';
  let k = FS.DAY * Math.min(1, Math.max(0, (sun.intensity - 0.3) / 1.2)) * (1 - night);
  k *= 1 - FS.WET * R0;
  if (wid === 'snowy' || wid === 'storm') k *= FS.SNOWY;
  ST.k = +k.toFixed(3);
  const dt = Math.min(1, Math.abs(((ENV.t || 0) - 0.3)) / 0.35);
  // длина тени: при новом пути солнца (sunpath.js, 2г2) — по его высоте, как у настоящей (днём ~1,4 высоты дома, вечером до FS.LEN_MAX)
  const sv = sun.position.y - sun.target.position.y;
  const len = SUNP_ON ? Math.min(FS.LEN_MAX, Math.max(FS.LEN[0], sl / Math.max(1e-3, sv))) : FS.LEN[0] + (FS.LEN[1] - FS.LEN[0]) * dt;
  if (FS.HOUSES && RT) {
    U.uFsK.value = k;
    ownCar(E);
    if (k > 0.005 && pollPoles()) cx = NaN;        // сбили фонарь или знак — маску заново
    if (k > 0.005) {
      const turn = Math.acos(Math.max(-1, Math.min(1, -sx * dX + -sz * dZ))) * 180 / Math.PI;
      const far = !(Math.abs(V.x - cx) < FS.MOVE && Math.abs(V.z - cz) < FS.MOVE);
      if (far || turn > FS.TURN || Math.abs(len - dLen) > 0.02 * Math.max(1, len)) {
        dX = -sx; dZ = -sz; dLen = len;
        ST.len = +len.toFixed(3); ST.dir = [+dX.toFixed(3), +dZ.toFixed(3)];
        drawMask(V.x, V.z);
      }
    }
  }
  if (FS.BLOBS && BLOB) blobs(E, -sx, -sz, night, len);
  ST.stepMs += (performance.now() - t0 - ST.stepMs) * 0.05;
}

function blobs (E, dx, dz, night, len) {
  NB = 0; NC = 0;
  const V = E.V, px = V.x, pz = V.z, Rr = FS.R, R2 = Rr * Rr, f0 = Rr - FS.FADE;
  const day = 1 - night;
  const ca = FS.CAR + (FS.CAR_NIGHT - FS.CAR) * night, ma = FS.MAN + (FS.MAN_NIGHT - FS.MAN) * night;
  const fade = d2 => { const d = Math.sqrt(d2); return d < f0 ? 1 : 1 - (d - f0) / FS.FADE; };
  // машины: поток, стоящие (и в склейке стоящих), такси, автобусы, мопеды
  const car = (t, d2) => {
    const g = t.mesh;
    if (!g) return;
    const ud = g.userData;
    noCircle(g); if (ud.full) noCircle(ud.full);
    const hl = t.hl || ud.hl || 2.2, w = CAR_W[t.model] || 1.9;
    // в воздухе (подбросило, отбросило) — пятно на земле, меньше и бледнее, без наклона
    const gy = t.gy !== undefined ? t.gy + 0.11 : g.position.y, air = Math.max(0, g.position.y - gy - 0.25), k = Math.max(0, 1 - air / FS.AIR);
    const off = FS.SUN * day * (t.model === 'bus' ? 2 : 1), sc = 0.75 + 0.25 * k;
    const q = air > 0.2 ? QY.setFromAxisAngle(UP, t.h) : g.quaternion;
    putCar(t.x + dx * off, (air > 0.2 ? gy : g.position.y) + FS.LIFT, t.z + dz * off, q, w * CWK * sc, hl * 2 * CLK * sc, ca * fade(d2) * (0.25 + 0.75 * k));
  };
  const T = E.traffic;
  for (let i = 0; i < T.length; i++) {
    const t = T[i];
    if (t.gone || !(t.still || (t.mesh && t.mesh.visible && t.mesh.parent))) continue;
    const ex = t.x - px, ez = t.z - pz, d2 = ex * ex + ez * ez;
    if (d2 < R2) car(t, d2);
  }
  const nT = NC;
  if (E.yard) E.yard(px, pz, Rr, t => { const ex = t.x - px, ez = t.z - pz, d2 = ex * ex + ez * ez; if (d2 < R2) car(t, d2); });
  const nY = NC;
  // люди: стоят на земле сами по себе (в машине, на руках, в сценке внутри группы — без пятна)
  const H = E.humans, sc = E.scene, ha = Math.atan2(dx, dz), hl = 1.7 * Math.min(len, FS.LEN_MAN) * day;   // тень человека вытянута от солнца
  for (const g of H) {
    if (g.parent !== sc || !g.visible) continue;
    const p = g.position, ex = p.x - px, ez = p.z - pz, d2 = ex * ex + ez * ez;
    if (d2 >= R2) continue;
    const s = g.scale.y || 1;
    put(p.x + dx * hl * 0.4 * s, p.y + 0.04, p.z + dz * hl * 0.4 * s, ha, 0.62 * BK * s, (0.62 + hl * 0.8) * BK * s, ma * fade(d2));
  }
  const nH = NB;   // людей
  // звери: лоси, лисы, зайцы, коты
  if (E.animals) for (const L of E.animals) {
    if (!L) continue;
    for (let i = 0; i < L.length; i++) {
      const a = L[i], g = a.g;
      if (!g || !g.visible || !g.parent) continue;
      const p = g.position, ex = p.x - px, ez = p.z - pz, d2 = ex * ex + ez * ez;
      if (d2 >= R2) continue;
      const big = a.big ? 1 : 0, w = big ? 1.1 : 0.35 * (g.scale.x || 1) / 0.6, l = big ? 2.4 : w * 1.6;
      put(p.x + dx * (big ? 0.5 : 0.1) * day, p.y + 0.04, p.z + dz * (big ? 0.5 : 0.1) * day, g.rotation.y, w * BK, l * BK, ma * fade(d2));
    }
  }
  BLOB.count = NB; CARB.count = NC;
  ST.blobs = NB + NC; ST.by = [nT, nY - nT, nH, NB - nH];   // машины потока, во дворах, люди, звери
  for (const [im, n] of [[BLOB, NB], [CARB, NC]]) if (n) { im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.instanceMatrix.clearUpdateRanges(); im.instanceMatrix.addUpdateRange(0, n * 16); im.instanceColor.clearUpdateRanges(); im.instanceColor.addUpdateRange(0, n * 3); }
}

export const DEBUG = {
  FS, ST, U,
  get rt () { return RT; }, get blob () { return BLOB; }, get carb () { return CARB; },
  redraw () { cx = NaN; },
  off (v = true) { ok = !v; if (v) { U.uFsK.value = 0; if (BLOB) { BLOB.count = 0; CARB.count = 0; } } },
};
