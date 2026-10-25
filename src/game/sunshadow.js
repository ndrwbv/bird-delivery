/* ──────────────────────────────────────────────────────────────────────────
   Настоящие тени от солнца (2г2, автор 25.10.2026: «тени балконов на стене, тень дерева на стене дома,
   тени домов и деревьев на газоне и асфальте»). Правила словами — docs/CAREER.md «Город: как выглядит» →
   «Настоящие тени от солнца»; пункт графики — «Настройки графики» → «тени».

   Только на графике «Высокая» (пункт «тени: настоящие», gfx.js). На Средней и Низкой — как было: поддельные
   тени домов маской на земле (fakeshadows.js).

   1. КАРТА ТЕНЕЙ. Глубина города «глазами солнца» — квадрат ±SS.HALF м вокруг точки чуть впереди камеры, SS.N²
      точек (2048² — 6 см на точку). Рисуется не каждый кадр, а когда камера отъехала на SS.MOVE м,
      солнце повернулось на SS.TURN°, камера развернулась на SS.YAW° (ельник — только то, что в кадре) или прошло
      SS.EVERY с; не чаще раза в SS.GAP кадров. Квадрат привязан к точкам карты — тени при перерисовке не дрожат.
      Рисует свой «кадр» (своя сцена-двойник): на каждый неподвижный меш города — двойник с той же геометрией и
      матрицей, материал — копия своего, где шейдер сразу после вершин пишет только глубину (вершины двигает та же
      программа: сезонная листва, ураган). Горизонтальное (земля, дороги, крыши, низ балконов) тень не отбрасывает —
      тень дома дают стены, лишних «прыщей» на земле нет.
      Кто отбрасывает: склейки города (дома, балконы, реквизит, фонари, провода — LITM), деревья и сугробы (PILE),
      ельник (forest.js), набор балконов (balconyKit), всё неподвижное Lambert-овое на сцене; и что передали
      cast(mesh). Машины, люди и звери — нет (у них свои пятна, fakeshadows.js); трава газона — нет.
   2. КТО ПРИНИМАЕТ. Каждый материал города (Lambert: земля, дороги, стены, крыши, деревья, трава, балконы; Basic:
      окна, разметка, вывески) берёт тень в своём шейдере по мировой точке: смещение вдоль нормали (нормаль — по
      соседним точкам кадра, как у плоских граней three.js) и 5 выборок с мягким сравнением ближе SS.NEAR м к камере, дальше — одна.
      В тени у Lambert остаётся SS.FILL от прямого солнца (прохладная), рассеянный свет — × SS.IND; у Basic — весь
      цвет × SS.FLAT_K. Грань, повёрнутая от солнца, — без прямого солнца, рассеянный × SS.IND_BACK (светлее отброшенной).
      Травинки и мелочь газона (InstancedMesh, не отбрасывают) — только чужая тень, обратная сторона не темнеет. У края квадрата тень
      растворяется; дальше — снова поддельная маска домов (fakeshadows.js берёт GLSL_COVER: где настоящие, её нет).
      Провода фонарей (#222327) тень не отбрасывают: тоньше точки карты — шла бы пунктиром.
      Кроны (листва склейки деревьев, хвоя, зелёное ельника) — с просветами: в материале глубины половина кусочков
      ~40 см по шуму в мире (SS.LACE, тот же шум, что у рваного края кроны seasons.js / treeform.js) — тень «кружевом».
   3. СИЛА. По силе солнца (ночью и в пасмурно / дождь — меньше и до нуля), в снежную погоду × SS.SNOWY.

   Флаги: ?noshadows — без настоящих (и ?oldlook — весь прежний вид), ?shadows — настоящие на любой графике (замеры),
   ?ssn=1024 — сторона карты, ?ssflat=2 — и горизонтальное отбрасывает. Отладка: __dlv.SUNSH — SS (числа), ST (замеры),
   redraw(), force(true / false / null), gpu = true (замер видеокарты карты в ST.gpu), U.uSsDbg.value = 1 (вместо цвета —
   свет / тень), 2 (координаты карты), 3—4 (глубина карты).
   Соседям: новый меш отбрасывает тень — cast(mesh) (InstancedMesh — только так), не должен — noCast(mesh);
   материал принимает тень — receive(mat) (неподвижное на сцене находится само раз в 4 с).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

const Q = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
const BAN = Q.has('noshadows') || Q.has('oldlook');
const FORCE = Q.has('shadows');

export const SS = {
  N: +Q.get('ssn') || 2048,  // сторона карты, точек
  HALF: 80,                  // квадрат ±HALF м поперёк лучей (2048 → 7,8 см на точку); вдоль лучей по земле — ±HALF / sin(высоты солнца)
  AHEAD: 0.35,               // середина квадрата впереди камеры на долю HALF
  MOVE: 16,                  // камера отъехала на столько м от прошлой середины — перерисовать
  TURN: 0.5,                 // солнце повернулось на столько градусов — перерисовать
  YAW: 35,                   // камера развернулась на столько градусов — перерисовать (ельник рисуется только в кадре)
  EVERY: 4,                  // и в любом случае раз в столько секунд (сбили фонарь, сменился сезон)
  GAP: 8,                    // не чаще раза в столько кадров
  DIST: 520,                 // «солнце» — столько м от середины (дальше любого дома, что затеняет середину, при низком солнце)
  FLAT: +(Q.get('ssflat') || 0.96),   // грань горизонтальнее (|нормаль.y| больше) — тень не отбрасывает
  SOFT: 1.4,                 // разброс выборок, точек карты (мягкость края)
  NEAR: 45,                  // ближе к камере — 5 выборок (мягкий край), дальше — одна
  OFS: 1.6,                  // смещение точки вдоль нормали, точек карты (против «прыщей»)
  BIAS: 0.00012,             // сдвиг глубины (доля глубины кадра солнца)
  // в тени: красный и зелёный гасятся поровну, синий меньше — тень прохладно-лиловая, жёлтая стена не уходит в зелёно-серый
  FILL: [0.1, 0.095, 0.1],  // доля прямого солнца, что остаётся в тени
  IND: [0.62, 0.6, 0.55],    // рассеянный свет в отброшенной тени × (рядом дом, крона, балкон — закрывают и часть неба)
  IND_BACK: [0.84, 0.82, 0.8], // рассеянный свет на грани, повёрнутой от солнца (открытая тень) ×
  FLAT_K: [0.53, 0.52, 0.54], // окна, разметка, вывески (без света) в отброшенной тени ×
  FLAT_BACK: [0.8, 0.76, 0.9], // … на грани от солнца ×
  LACE: 0.5,                 // кроны: доля «дыр» в тени (просветы ~40 см, по шуму в мире, как рваный край кроны treeform.js)
  EDGE: [0.4, 0.485],        // к краю квадрата (доля от середины до края) тень растворяется
  SNOWY: 0.75,               // снежная погода ×
  WET: 0.5,                  // сильный дождь × (1 − WET) — солнце и так тусклее
};

/* three.js даёт новым материалам, геометриям, текстурам и мешам uuid из Math.random, а город строится с зерном
   (editlayer.js, latebuild.js) — наши объекты не должны сдвигать его случайные числа: создаём их со своим генератором */
let QS = (Date.now() ^ 0x5A5A) >>> 0;
function quiet (fn) {
  const r0 = Math.random;
  Math.random = () => ((QS = (Math.imul(QS, 1664525) + 1013904223) >>> 0) / 4294967296);
  try { return fn(); } finally { Math.random = r0; }
}

const ST = { on: 0, proxies: 0, mats: 0, depthMats: 0, draws: 0, lastMs: 0, scans: 0, k: 0, drawCalls: 0, why: '' };

/* ── униформы приёмников: одни на всех ── */
/* пока карты нет — своя пустая глубина 1×1 со сравнением (запасная three.js без режима сравнения — ошибка GL у машин) */
const EMPTY = quiet(() => new THREE.DepthTexture(1, 1, THREE.UnsignedIntType));
EMPTY.format = THREE.DepthFormat; EMPTY.compareFunction = THREE.LessEqualCompare; EMPTY.needsUpdate = true;
const U = {
  uSsMap: { value: EMPTY },
  uSsMat: { value: new THREE.Matrix4() },
  uSsP: { value: new THREE.Vector4(0.06, SS.BIAS, 0, 1 / SS.N) },     // x — точка карты, м; y — сдвиг глубины; z — сила; w — 1/N
  uSsDir: { value: new THREE.Vector3(0, 1, 0) },                       // к солнцу (мир)
  uSsFill: { value: new THREE.Vector3(...SS.FILL) },
  uSsInd: { value: new THREE.Vector3(...SS.IND) },
  uSsIndB: { value: new THREE.Vector3(...SS.IND_BACK) },
  uSsFlat: { value: new THREE.Vector3(...SS.FLAT_K) },
  uSsFlatB: { value: new THREE.Vector3(...SS.FLAT_BACK) },
  uSsDbg: { value: 0 },                                                 // отладка: 1 — вместо цвета карта (белое — свет, чёрное — тень), 2 — координаты карты
};
export const UNIFORMS = U;

const VERT = `
#include <project_vertex>
{ vec4 ssP = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  ssP = instanceMatrix * ssP;
#endif
  vSsW = (modelMatrix * ssP).xyz; }`;

/* GLSL: ssCover(w) — 0…1, насколько точка внутри квадрата настоящих теней (для поддельной маски — fakeshadows.js);
   ssLit(w, N) — 1 на свету, 0 в тени (N — нормаль, смотрит на камеру) */
export const GLSL_COVER = `
uniform mat4 uSsMat; uniform vec4 uSsP;
float ssCover (vec3 w) {
  if (uSsP.z <= 0.0) return 0.0;
  vec2 e = abs((uSsMat * vec4(w, 1.0)).xy - 0.5);
  return 1.0 - smoothstep(${SS.EDGE[0].toFixed(3)}, ${SS.EDGE[1].toFixed(3)}, max(e.x, e.y));
}
`;
export const GLSL_LIT = `
uniform sampler2DShadow uSsMap; uniform vec3 uSsDir, uSsFill, uSsInd, uSsIndB, uSsFlat, uSsFlatB;
float ssLit (vec3 w, vec3 N) {
  float nl = dot(N, uSsDir);
  vec3 p = w + N * uSsP.x * (${SS.OFS.toFixed(2)} + 2.0 * (1.0 - clamp(nl, 0.0, 1.0))) + uSsDir * uSsP.x * 0.5;
  vec3 c = (uSsMat * vec4(p, 1.0)).xyz;
  vec2 e = abs(c.xy - 0.5);
  float cov = 1.0 - smoothstep(${SS.EDGE[0].toFixed(3)}, ${SS.EDGE[1].toFixed(3)}, max(e.x, e.y));
  if (cov <= 0.0) return 1.0;                    // вне квадрата — ни одной выборки
  float z = c.z - uSsP.y;
  float s = texture(uSsMap, vec3(c.xy, z));
  if (dot(w - cameraPosition, w - cameraPosition) < ${(SS.NEAR * SS.NEAR).toFixed(1)}) {   // ближе SS.NEAR м — мягкий край (ещё 4 выборки), дальше он мельче точки кадра
    float d = uSsP.w * ${SS.SOFT.toFixed(2)};
    s = s * 0.28 + (texture(uSsMap, vec3(c.xy + vec2(d, d * 0.35), z))
      + texture(uSsMap, vec3(c.xy + vec2(-d * 0.35, d), z))
      + texture(uSsMap, vec3(c.xy + vec2(-d, -d * 0.35), z))
      + texture(uSsMap, vec3(c.xy + vec2(d * 0.35, -d), z))) * 0.18;
  }
  return mix(1.0, s, cov);
}
`;
/* GLSL_COVER (и GLSL_LIT, если lit или уже был) — в самое начало фрагмента, по одному разу (fakeshadows.js берёт их же) */
export function withSS (frag, lit) {
  const hadLit = frag.indexOf(GLSL_LIT) >= 0;
  frag = frag.split(GLSL_LIT).join('').split(GLSL_COVER).join('');
  return GLSL_COVER + (lit || hadLit ? GLSL_LIT : '') + frag;
}
const HEAD = `
varying vec3 vSsW;
uniform float uSsDbg;
/* x — доля отброшенной тени (дом, крона, балкон между точкой и солнцем), y — грань от солнца; обе 0…1 с силой */
vec2 ssShade () {
  if (uSsP.z <= 0.0) return vec2(0.0);
  vec3 N = normalize(cross(dFdx(vSsW), dFdy(vSsW)));
  float nl = dot(N, uSsDir);
#ifdef SS_THIN
  return vec2(uSsP.z * (1.0 - ssLit(vSsW, nl < 0.0 ? -N : N)), 0.0);   // травинки, цветы: тонкие, светятся насквозь — только чужая тень
#else
  float face = smoothstep(-0.02, 0.1, nl);
  float lit = nl > 0.0 ? ssLit(vSsW, N) : 1.0;
  return uSsP.z * vec2((1.0 - lit) * face, 1.0 - face);
#endif
}
`;

/* приёмник: Lambert / Phong / Standard — прямой свет солнца и рассеянный; Basic — весь цвет */
function inject (sh, lit, thin) {
  if (sh.fragmentShader.indexOf('ssShade') >= 0) return;
  Object.assign(sh.uniforms, U);
  sh.vertexShader = 'varying vec3 vSsW;\n' + sh.vertexShader.replace('#include <project_vertex>', VERT);
  let f = (thin ? '#define SS_THIN\n' : '') + withSS(HEAD + sh.fragmentShader, true);
  if (lit && f.indexOf('#include <lights_fragment_begin>') >= 0) {
    const ch = THREE.ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );',
      'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= ssDirK;');
    f = f.replace('#include <lights_fragment_begin>', 'vec2 ssA = ssShade();\nvec3 ssDirK = mix(vec3(1.0), uSsFill, max(ssA.x, ssA.y));\n' + ch)
      .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= mix(vec3(1.0), uSsInd, ssA.x) * mix(vec3(1.0), uSsIndB, ssA.y);\n#include <aomap_fragment>');
  } else if (f.indexOf('#include <opaque_fragment>') >= 0) {
    f = f.replace('#include <opaque_fragment>', '{ vec2 ssA = ssShade(); outgoingLight *= mix(vec3(1.0), uSsFlat, ssA.x) * mix(vec3(1.0), uSsFlatB, ssA.y); }\n#include <opaque_fragment>');
  } else return;
  f = f.replace(/}\s*$/, `  if (uSsDbg > 0.5) {
    vec3 N = normalize(cross(dFdx(vSsW), dFdy(vSsW)));
    vec3 c = (uSsMat * vec4(vSsW, 1.0)).xyz;
    gl_FragColor = uSsDbg > 3.5 ? vec4(texture(uSsMap, vec3(c.xy, c.z)), texture(uSsMap, vec3(c.xy, c.z - 0.01)), texture(uSsMap, vec3(c.xy, c.z - 0.1)), 1.0)
      : uSsDbg > 2.5 ? vec4(texture(uSsMap, vec3(c.xy, 0.3)), texture(uSsMap, vec3(c.xy, 0.6)), texture(uSsMap, vec3(c.xy, 0.9)), 1.0)
      : uSsDbg > 1.5 ? vec4(fract(c.xy * 8.0), c.z, 1.0) : vec4(vec3(dot(N, uSsDir) > 0.0 ? ssLit(vSsW, N) : 0.2), 1.0);
  }
}`);
  sh.fragmentShader = f;
}

/* обернуть материал-приёмник (поверх всех прежних правок шейдера; ключ программы — свой + «|ss») */
const RECV = new WeakSet(), ORIG = new WeakMap();   // ORIG — правка шейдера до нашей (для материала глубины)
export function receive (m, thin = false) {
  if (!m || !m.isMaterial || RECV.has(m) || m.isShaderMaterial || m.isRawShaderMaterial || m.fog === false || m.userData.fsCar || m.userData.dirt) return m;   // машины — своя тень (fakeshadows.js carMat)
  const lit = m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshStandardMaterial;
  if (!lit && !(m.isMeshBasicMaterial && m.vertexColors && !m.transparent)) return m;   // без света — только склейки города (окна, разметка, вывески), не частицы и пятна
  RECV.add(m);
  ORIG.set(m, m.onBeforeCompile);
  const prev = m.onBeforeCompile, key = Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey') ? m.customProgramCacheKey : null, pk = prev ? String(prev) : '';
  m.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(this, sh, r);
    inject(sh, lit, thin);
  };
  m.customProgramCacheKey = function () { return (key ? key.call(this) : pk) + (thin ? '|sst' : '|ss'); };
  m.needsUpdate = true;
  ST.mats++;
  return m;
}

/* ── отбрасывающие: двойник со своим материалом глубины ── */
const DEPTH = new WeakMap();
function depthOf (m) {
  let d = DEPTH.get(m);
  if (d) return d;
  d = m.clone();
  const prev = ORIG.has(m) ? ORIG.get(m) : m.onBeforeCompile, key = m.customProgramCacheKey;   // без приёма тени: карта — цель этого же кадра
  d.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(m, sh, r);
    // кроны — с просветами («кружево», реф 9): листва склейки деревьев (вид 1, хвоя — палитра 2; seasons.js pileMat) и ельник (зелёное)
    const leaf = sh.fragmentShader.indexOf('varying float vK, vP, vSeed') >= 0 ? '(vK == 1.0 || (vK == 0.0 && vP > 1.5 && vP < 2.5))'
      : /forestSnow/.test(d.customProgramCacheKey()) ? 'vColor.g > vColor.r * 1.15' : '';
    const lace = !leaf ? '' : `    if (${leaf}) { vec3 lq = fract(floor(vSsD * 2.6) * 0.1031); lq += dot(lq, lq.yzx + 33.33);
      if (fract((lq.x + lq.y) * lq.z) < ${SS.LACE.toFixed(2)}) discard; }`;
    sh.vertexShader = 'varying vec3 vSsD;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
{ vec4 ssP = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  ssP = instanceMatrix * ssP;
#endif
  vSsD = (modelMatrix * ssP).xyz; }`);
    // фрагмент: сразу глубина — ни цвета, ни сезонных правок, ни растворения у камеры; горизонтальное — мимо
    sh.fragmentShader = 'varying vec3 vSsD;\n' + sh.fragmentShader.replace(/void\s+main\s*\(\s*\)\s*\{/, `void main() {
  { vec3 ssN = normalize(cross(dFdx(vSsD), dFdy(vSsD)));
    if (abs(ssN.y) > ${SS.FLAT.toFixed(3)}) discard;
${lace}
#if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
    if (dot(abs(vColor.rgb - vec3(0.016, 0.0168, 0.0203)), vec3(1.0)) < 0.008) discard;   // провода фонарей (#222327, streetlamps.js): тоньше точки карты — тень пунктиром
#endif
    gl_FragColor = vec4(1.0); return; }`);
  };
  d.customProgramCacheKey = function () { return (key ? key.call(m) : '') + '|ssd'; };
  d.side = THREE.DoubleSide; d.transparent = false; d.depthWrite = true; d.depthTest = true; d.blending = THREE.NoBlending;
  d.colorWrite = false; d.opacity = 1; d.alphaTest = 0; d.fog = false;
  d.polygonOffset = true; d.polygonOffsetFactor = 1.2; d.polygonOffsetUnits = 2;
  DEPTH.set(m, d);
  ST.depthMats++;
  return d;
}
const castable = m => m && m.isMaterial && !m.userData.fsCar && !m.userData.dirt && !m.isShaderMaterial && !m.isRawShaderMaterial && !m.isMeshBasicMaterial && m.visible !== false && m.fog !== false &&
  (m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshStandardMaterial) && !(m.transparent && m.opacity < 0.6);

let SCENE = null, R = null, SHS = null, LCAM = null, RT = null;
const PROX = [], SEEN = new WeakSet(), NOCAST = new WeakSet(), CAST = new WeakSet();
/** этот меш отбрасывает настоящую тень (InstancedMesh — только так, кроме ельника и набора балконов) */
export function cast (mesh) { if (mesh) { CAST.add(mesh); NOCAST.delete(mesh); SEEN.delete(mesh); } return mesh; }
/** этот меш тени не отбрасывает (принимать — будет) */
export function noCast (mesh) { if (mesh) NOCAST.add(mesh); return mesh; }

function proxyOf (o) {
  const mats = [].concat(o.material);
  if (!mats.every(castable)) return null;
  const dm = Array.isArray(o.material) ? o.material.map(depthOf) : depthOf(o.material);
  let p;
  if (o.isInstancedMesh) {
    p = new THREE.InstancedMesh(o.geometry, dm, 0);
    p.instanceMatrix = o.instanceMatrix;
    p.frustumCulled = false;
  } else {
    p = new THREE.Mesh(o.geometry, dm);
    p.frustumCulled = o.frustumCulled && !!o.geometry.boundingSphere;
  }
  p.matrixAutoUpdate = false; p.matrixWorldAutoUpdate = false;
  p.matrixWorld = o.matrixWorld;                  // общая матрица: сдвинули оригинал — двойник там же
  p.userData.o = o;
  return p;
}
const still = o => o.position.x === 0 && o.position.y === 0 && o.position.z === 0 && o.rotation.x === 0 && o.rotation.y === 0 && o.rotation.z === 0 &&
  o.scale.x === 1 && o.scale.y === 1 && o.scale.z === 1;
const instOk = o => CAST.has(o) || o.name === 'balconyKit' || [].concat(o.material).some(m => { try { return /^forestSnow(near|far)/.test(m.customProgramCacheKey()); } catch (e) { return false; } });

/* что на сцене: неподвижные меши в корне и в неподвижных группах — приёмники (материалы) и отбрасывающие (двойники) */
function consider (o, stat) {
  if (!o.isMesh || SEEN.has(o)) return;
  SEEN.add(o);
  const thin = o.isInstancedMesh && !instOk(o);   // трава, цветы, мелочь газона: тень принимают, не отбрасывают, обратная сторона — не «в тени»
  for (const m of [].concat(o.material)) receive(m, thin);
  if (!stat || NOCAST.has(o) || thin) return;
  const p = proxyOf(o);
  if (!p) return;
  PROX.push(p); SHS.add(p);
  ST.proxies = PROX.length;
}
const attached = o => { for (let x = o; x; x = x.parent) if (x === SCENE) return true; return false; };
function scan () {
  ST.scans++;
  // двойники тех, кого убрали со сцены (склеили в клетку, сняли вдали), — прочь; вернётся — найдём заново
  let j = 0;
  for (let i = 0; i < PROX.length; i++) {
    const p = PROX[i], o = p.userData.o;
    if (attached(o)) PROX[j++] = p;
    else { p.parent = null; SEEN.delete(o); }
  }
  if (j < PROX.length) { PROX.length = j; SHS.children = PROX.slice(); }   // двойники — единственные дети своей сцены
  for (const c of SCENE.children) {
    if (c.isMesh) consider(c, still(c) || CAST.has(c));
    else if (c.isGroup || (c.isObject3D && !c.isLight && !c.isCamera)) {
      const st = still(c) && (c.matrixWorldAutoUpdate === false || c.matrixAutoUpdate === false || c.isGroup);
      for (const k of c.children) {
        if (k.isMesh) consider(k, st && still(k));
        // одна ступень глубже: склейки клеток кладут меши в группы клеток
        else if (st && still(k)) for (const q of k.children) if (q.isMesh) consider(q, still(q));
      }
    }
  }
  // машины — тень на кузове через fakeshadows.js (shadeInject), люди — без неё (у них пятна)
}

/* ── включено ли ── */
let GFXON = () => false;
let FORCED = null;
const on = () => !BAN && (FORCED !== null ? FORCED : FORCE || GFXON());

/* один раз, когда город построен (LATE 'sunsh'): цель, камера солнца, сцена двойников */
export function* initSteps (api) {
  if (BAN) return;
  SCENE = api.scene; R = api.renderer;
  if (api.gfxOn) GFXON = api.gfxOn;
  if (!on()) return;
  // включены с запуска: обернуть материалы и собрать двойников сейчас — дальше кусок 'shaders' (game.js) скомпилирует
  // программы города уже с тенью, а программы глубины — здесь, под меню, а не рывком в первом кадре
  quiet(setup); built = true;
  yield 'ssrt';
  quiet(scan); lastScan = performance.now() - 3500;   // через ~0,5 с — ещё раз: убрать двойников того, что склеилось после
  yield 'ssscan';
  try { R.compile(SHS, LCAM); } catch (e) { /* — */ }
  yield 'ssdepth';
}
function setup () {
  const dt = new THREE.DepthTexture(SS.N, SS.N, THREE.UnsignedIntType);
  dt.format = THREE.DepthFormat;
  dt.compareFunction = THREE.LessEqualCompare;
  dt.minFilter = THREE.LinearFilter; dt.magFilter = THREE.LinearFilter;
  RT = new THREE.WebGLRenderTarget(SS.N, SS.N, { format: THREE.RedFormat, type: THREE.UnsignedByteType, depthBuffer: true, stencilBuffer: false,
    depthTexture: dt, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  SHS = new THREE.Scene();                         // карта — в униформу после первой отрисовки (до неё у цели нет текстуры в видеокарте)
  SHS.matrixAutoUpdate = false; SHS.matrixWorldAutoUpdate = false;
  LCAM = new THREE.OrthographicCamera(-SS.HALF, SS.HALF, SS.HALF, -SS.HALF, 1, SS.DIST + 160);
  LCAM.matrixAutoUpdate = true;
  U.uSsP.value.x = (2 * SS.HALF) / SS.N; U.uSsP.value.w = 1 / SS.N;
  try { R.domElement.addEventListener('webglcontextrestored', () => { lastT = -1e9; }); } catch (e) { /* — */ }
}

/* ── каждый кадр перед отрисовкой: E — { V, cam, sun, ENV, weather } ── */
let built = false, lastScan = 0, lastT = -1e9, lastF = 0, frame = 0;
const C = new THREE.Vector3(), D = new THREE.Vector3(), LD = new THREE.Vector3(9, 9, 9), LC = new THREE.Vector3(1e9, 0, 1e9), FW = new THREE.Vector3();
let lastYaw = 0;
const BIASM = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
const RV = new THREE.Vector3(), UV = new THREE.Vector3();
export function step (E) {
  if (!SCENE || BAN) return;
  frame++;
  if (!on()) { U.uSsP.value.z = 0; ST.on = 0; return; }
  if (!built) { quiet(setup); built = true; }
  ST.on = 1;
  const now = performance.now();
  if (now - lastScan > 4000) { lastScan = now; const t0 = performance.now(); quiet(scan); ST.scanMs = +(performance.now() - t0).toFixed(2); }
  const sun = E.sun, ENV = E.ENV || {};
  // сила: по солнцу, ночь, дождь, снег
  const night = ENV.night || 0, rain = ENV.rain || 0, wid = E.weather ? E.weather() : '';
  let k = Math.min(1, Math.max(0, (sun.intensity - 0.15) / 0.55)) * (1 - night);
  k *= 1 - SS.WET * rain;
  if (wid === 'snowy' || wid === 'storm') k *= SS.SNOWY;
  ST.k = +k.toFixed(3);
  U.uSsP.value.z = k;
  if (k <= 0.005) return;
  D.copy(sun.position).sub(sun.target.position).normalize();
  if (!(D.y > 0.05)) { U.uSsP.value.z = 0; return; }   // солнце у горизонта или под ним
  U.uSsDir.value.copy(D);
  // середина квадрата — впереди камеры
  const cam = E.cam;
  cam.getWorldDirection(FW); FW.y = 0;
  if (FW.lengthSq() < 1e-6) FW.set(0, 0, 1); else FW.normalize();
  C.set(E.V.x + FW.x * SS.HALF * SS.AHEAD, 0, E.V.z + FW.z * SS.HALF * SS.AHEAD);
  const yaw = Math.atan2(FW.x, FW.z) * 180 / Math.PI;
  let dy = Math.abs(yaw - lastYaw); if (dy > 180) dy = 360 - dy;
  const turn = Math.acos(Math.max(-1, Math.min(1, D.dot(LD)))) * 180 / Math.PI;
  const moved = Math.hypot(C.x - LC.x, C.z - LC.z);
  let why = '';
  if (moved > SS.MOVE) why = 'move'; else if (turn > SS.TURN) why = 'sun'; else if (dy > SS.YAW) why = 'yaw'; else if (now - lastT > SS.EVERY * 1000) why = 'time';
  if (!why || frame - lastF < SS.GAP && why !== 'move') return;
  if (frame - lastF < 2) return;
  ST.why = why;
  lastF = frame; lastT = now; lastYaw = yaw; LD.copy(D);
  C.y = E.groundY !== undefined ? E.groundY : (E.V.y || 0);
  LC.copy(C);
  draw();
}

function draw () {
  const t0 = performance.now();
  // камера солнца: смотрит на середину; середина — по точкам карты (тени при перерисовке не дрожат)
  LCAM.position.copy(C).addScaledVector(D, SS.DIST);
  LCAM.lookAt(C);
  LCAM.updateMatrixWorld();
  RV.setFromMatrixColumn(LCAM.matrixWorld, 0); UV.setFromMatrixColumn(LCAM.matrixWorld, 1);
  const t = (2 * SS.HALF) / SS.N, a = C.dot(RV), b = C.dot(UV);
  C.addScaledVector(RV, Math.round(a / t) * t - a).addScaledVector(UV, Math.round(b / t) * t - b);
  LCAM.position.copy(C).addScaledVector(D, SS.DIST);
  LCAM.updateMatrixWorld();
  LCAM.updateProjectionMatrix();
  U.uSsMat.value.multiplyMatrices(LCAM.projectionMatrix, LCAM.matrixWorldInverse).premultiply(BIASM);
  // двойники: видны, только если оригинал на сцене и виден; ельник — сколько сейчас деревьев
  const R2 = (SS.HALF * 1.5 + SS.DIST * 0.6) ** 2;
  for (let i = 0; i < PROX.length; i++) {
    const p = PROX[i], o = p.userData.o;
    let v = true, x = o;
    while (x) { if (!x.visible) { v = false; break; } if (x === SCENE) break; x = x.parent; }
    if (!x) v = false;
    if (v && o.isInstancedMesh) { p.count = o.count; v = o.count > 0; }
    if (v && !o.isInstancedMesh && o.geometry.boundingSphere) {
      const s = o.geometry.boundingSphere, e = o.matrixWorld.elements;
      const sx = s.center.x + e[12] - C.x, sz = s.center.z + e[14] - C.z, r = s.radius;
      if (sx * sx + sz * sz > R2 + r * r + 2 * r * Math.sqrt(R2)) v = false;
    }
    p.visible = v;
  }
  const prev = R.getRenderTarget(), ac = R.autoClear;
  R.autoClear = true;
  R.setRenderTarget(RT);
  const tq = DBG.gpu ? gpuBegin() : null;
  R.render(SHS, LCAM);
  if (tq) gpuEnd(tq);
  ST.drawCalls = R.info.render.calls;
  R.setRenderTarget(prev);
  R.autoClear = ac;
  U.uSsMap.value = RT.depthTexture;
  ST.draws++; ST.lastMs = +(performance.now() - t0).toFixed(2);
}

/* замер видеокарты на отрисовку карты (__dlv.SUNSH.gpu = true): ST.gpu — последние замеры, мс */
const DBG = { gpu: false }, GQ = [];
function gpuBegin () {
  const gl = R.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return null;
  const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
  return { q, ext, gl };
}
function gpuEnd (t) {
  const { gl, ext } = t; gl.endQuery(ext.TIME_ELAPSED_EXT); GQ.push(t);
  for (let i = GQ.length - 1; i >= 0; i--) {
    const g = GQ[i];
    if (!gl.getQueryParameter(g.q, gl.QUERY_RESULT_AVAILABLE)) continue;
    (ST.gpu || (ST.gpu = [])).push(+(gl.getQueryParameter(g.q, gl.QUERY_RESULT) / 1e6).toFixed(2));
    if (ST.gpu.length > 50) ST.gpu.shift();
    gl.deleteQuery(g.q); GQ.splice(i, 1);
  }
}

export const DEBUG = {
  set gpu (v) { DBG.gpu = !!v; }, get gpu () { return DBG.gpu; },
  SS, ST, U,
  get rt () { return RT; }, get cam () { return LCAM; }, get proxies () { return PROX; },
  on: () => on(),
  redraw () { lastT = -1e9; LC.set(1e9, 0, 1e9); },
  /* на этот запуск: true — настоящие, false — нет, null — по графике (сравнить до / после одним прогоном) */
  force (v) { FORCED = v; },
};
