/* ──────────────────────────────────────────────────────────────────────────
   Настоящие тени от солнца (2г2, автор 25.10.2026: «тени балконов на стене, тень дерева на стене дома,
   тени домов и деревьев на газоне и асфальте»). Правила словами — docs/CAREER.md «Город: как выглядит» →
   «Настоящие тени от солнца»; пункт графики — «Настройки графики» → «тени».

   Только на графике «Высокая» (пункт «тени: настоящие», gfx.js). На Средней и Низкой — как было: поддельные
   тени домов маской на земле (fakeshadows.js).

   1. КАРТА ТЕНЕЙ. Глубина города «глазами солнца» — квадрат ±SS.HALF м вокруг точки чуть впереди камеры («фокус»), SS.N²
      точек (2048² — 8,6 см на точку). Карт две (2г16, автор 25.10: «тени меняются очень дёргано, будто солнце постоянно
      идёт»): одна показана, вторая — запасная, в неё рисуется следующая по частям (SS.KMAX кадров, не больше SS.BUDGET
      треугольников за кадр — без рывка кадра), потом карты меняются местами.
      — Солнце для теней держится на месте, пока настоящее не уйдёт на SS.STEP°; тогда новая карта (с направлением чуть
        наперёд — ошибка ±STEP/2) и плавное перетекание старой в новую за SS.FADE с (обе выборки только на это время).
        Свет (сила, цвет, какая грань от солнца) идёт как раньше — плавно каждый кадр.
      — Фокус отъехал от середины карты на SS.MOVE м или прошло SS.EVERY с (сбили фонарь, сменился сезон) — та же
        карта с новой серединой, переключение сразу: середина — по точкам карты, тот же кусок тени попиксельно тот же.
      — Тень растворяется к краю по расстоянию от фокуса (плавно едет с камерой), а не от середины карты — при
        перерисовке край не прыгает. От направления камеры карта не зависит: ельник — весь в квадрате (forest.js
        shadowCells), не только тот, что в кадре.
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
      Травинки и мелочь газона (InstancedMesh, не отбрасывают) — только чужая тень, обратная сторона не темнеет. Дальше
      SS.COV от фокуса тень растворяется; дальше — снова поддельная маска домов (fakeshadows.js берёт GLSL_COVER: где настоящие, её нет).
      Провода фонарей (#222327) тень не отбрасывают: тоньше точки карты — шла бы пунктиром.
      Кроны лиственных (листва склейки деревьев, листва берёз ельника) — с просветами: в материале глубины половина кусочков
      ~40 см по шуму в мире (SS.LACE, тот же шум, что у рваного края кроны seasons.js / treeform.js) — тень «кружевом».
      Хвоя сосен и елей (город и ельник) — сплошная тень: их кроны плотные, без рваного края (2г17).
   3. СИЛА. По силе солнца (ночью и в пасмурно / дождь — меньше и до нуля), в снежную погоду × SS.SNOWY.

   Флаги: ?noshadows — без настоящих (и ?oldlook — весь прежний вид), ?shadows — настоящие на любой графике (замеры),
   ?ssn=1024 — сторона карты, ?ssflat=2 — и горизонтальное отбрасывает. Отладка: __dlv.SUNSH — SS (числа), ST (замеры),
   redraw(), force(true / false / null), gpu = true (замер видеокарты частей карты в ST.gpu), U.uSsDbg.value = 1 (вместо цвета —
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
  HALF: 88,                  // квадрат ±HALF м поперёк лучей (2048 → 8,6 см на точку); вдоль лучей по земле — ±HALF / sin(высоты солнца)
  AHEAD: 0.35,               // фокус — впереди камеры на долю HALF
  MOVE: 14,                  // фокус отъехал от середины карты на столько м — та же карта с новой серединой
  COV: [51, 67],             // тень растворяется от фокуса (м поперёк лучей): с запасом на MOVE до края карты
  STEP: 1,                   // солнце ушло от солнца теней на столько градусов — новая карта с перетеканием
  FADE: 1,                   // перетекание старой карты в новую, с
  EVERY: 4,                  // и в любом случае раз в столько секунд (сбили фонарь, сменился сезон) — сразу, без перетекания
  BUDGET: 300000,            // треугольников карты за кадр (больше — карта рисуется по частям за несколько кадров)
  KMAX: 6,                   // не больше стольких частей
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
  LACE: 0.5,                 // кроны лиственных (не хвоя): доля «дыр» в тени (просветы ~40 см, по шуму в мире, как рваный край кроны treeform.js)
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

const ST = { on: 0, proxies: 0, mats: 0, depthMats: 0, draws: 0, lastMs: 0, scans: 0, k: 0, drawCalls: 0, why: '', jobs: 0, parts: 0, tris: 0, fade: 0 };

/* ── униформы приёмников: одни на всех ── */
/* пока карты нет — своя пустая глубина 1×1 со сравнением (запасная three.js без режима сравнения — ошибка GL у машин) */
const EMPTY = quiet(() => new THREE.DepthTexture(1, 1, THREE.UnsignedIntType));
EMPTY.format = THREE.DepthFormat; EMPTY.compareFunction = THREE.LessEqualCompare; EMPTY.needsUpdate = true;
const U = {
  uSsMap: { value: EMPTY },                                              // показанная карта
  uSsMat: { value: new THREE.Matrix4() },
  uSsMap2: { value: EMPTY },                                             // прошлая (пока перетекает)
  uSsMat2: { value: new THREE.Matrix4() },
  uSsQ: { value: new THREE.Vector4(0, 0.5, 0.5, 0) },                    // x — доля прошлой, yz — фокус на показанной
  uSsQ2: { value: new THREE.Vector4(0.5, 0.5, 0, 0) },                   // xy — фокус на прошлой
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
   ssLit(w, N) — 1 на свету, 0 в тени (N — нормаль, смотрит на камеру).
   uSsQ: x — доля прошлой карты (перетекание, 0 — нет), yz — фокус в координатах показанной карты */
const F = v => v.toFixed(4);
export const GLSL_COVER = `
uniform mat4 uSsMat, uSsMat2; uniform vec4 uSsP, uSsQ, uSsQ2;
float ssCovUV (vec2 uv, vec2 f) {
  vec2 e = abs(uv - f), g = abs(uv - 0.5);
  return (1.0 - smoothstep(${F(SS.COV[0] / (2 * SS.HALF))}, ${F(SS.COV[1] / (2 * SS.HALF))}, max(e.x, e.y))) * (1.0 - smoothstep(0.47, 0.495, max(g.x, g.y)));
}
float ssCover (vec3 w) {
  if (uSsP.z <= 0.0) return 0.0;
  float c = ssCovUV((uSsMat * vec4(w, 1.0)).xy, uSsQ.yz);
  if (uSsQ.x > 0.0) c = mix(c, ssCovUV((uSsMat2 * vec4(w, 1.0)).xy, uSsQ2.xy), uSsQ.x);
  return c;
}
`;
export const GLSL_LIT = `
uniform sampler2DShadow uSsMap, uSsMap2; uniform vec3 uSsDir, uSsFill, uSsInd, uSsIndB, uSsFlat, uSsFlatB;
float ssTap (sampler2DShadow m, vec3 c, bool soft) {
  float s = texture(m, c);
  if (soft) {                                    // ближе SS.NEAR м — мягкий край (ещё 4 выборки), дальше он мельче точки кадра
    float d = uSsP.w * ${SS.SOFT.toFixed(2)};
    s = s * 0.28 + (texture(m, vec3(c.xy + vec2(d, d * 0.35), c.z))
      + texture(m, vec3(c.xy + vec2(-d * 0.35, d), c.z))
      + texture(m, vec3(c.xy + vec2(-d, -d * 0.35), c.z))
      + texture(m, vec3(c.xy + vec2(d * 0.35, -d), c.z))) * 0.18;
  }
  return s;
}
float ssLit (vec3 w, vec3 N) {
  float nl = dot(N, uSsDir);
  vec4 p = vec4(w + N * uSsP.x * (${SS.OFS.toFixed(2)} + 2.0 * (1.0 - clamp(nl, 0.0, 1.0))) + uSsDir * uSsP.x * 0.5, 1.0);
  vec3 c = (uSsMat * p).xyz, c2 = vec3(0.0);
  float cov = ssCovUV(c.xy, uSsQ.yz), cov2 = 0.0;
  if (uSsQ.x > 0.0) { c2 = (uSsMat2 * p).xyz; cov2 = ssCovUV(c2.xy, uSsQ2.xy); }
  if (cov <= 0.0 && cov2 <= 0.0) return 1.0;     // вне квадрата — ни одной выборки
  bool soft = dot(w - cameraPosition, w - cameraPosition) < ${(SS.NEAR * SS.NEAR).toFixed(1)};
  float L = cov > 0.0 ? mix(1.0, ssTap(uSsMap, vec3(c.xy, c.z - uSsP.y), soft), cov) : 1.0;
  // перетекание: прошлая карта (другое солнце) со своим краем уходит за SS.FADE с
  if (uSsQ.x > 0.0) L = mix(L, cov2 > 0.0 ? mix(1.0, ssTap(uSsMap2, vec3(c2.xy, c2.z - uSsP.y), soft), cov2) : 1.0, uSsQ.x);
  return L;
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

/* clone() копирует userData через JSON — у части материалов там ссылки по кругу (ошибка); копия — по верхнему уровню */
function cloneMat (m) {
  const ud = m.userData;
  m.userData = {};
  try { const c = m.clone(); c.userData = Object.assign({}, ud); return c; } finally { m.userData = ud; }
}
/* ── отбрасывающие: двойник со своим материалом глубины ── */
const DEPTH = new WeakMap();
function depthOf (m) {
  let d = DEPTH.get(m);
  if (d) return d;
  d = cloneMat(m);
  const prev = ORIG.has(m) ? ORIG.get(m) : m.onBeforeCompile, key = m.customProgramCacheKey;   // без приёма тени: карта — цель этого же кадра
  d.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(m, sh, r);
    // кроны лиственных — с просветами («кружево», реф 9): листва склейки деревьев (вид 1; seasons.js pileMat) и листва берёз
    // ельника (aSnow −1, forest.js). Хвоя сосен и елей — сплошная тень (2г17, 26.10: их кроны плотные, без рваного края)
    const leaf = sh.fragmentShader.indexOf('varying float vK, vP, vSeed') >= 0 ? 'vK == 1.0'
      : /forestSnow/.test(d.customProgramCacheKey()) && sh.fragmentShader.indexOf('varying float vSnow') >= 0 ? 'vSnow < -0.5' : '';
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
  (m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshStandardMaterial) && !(m.transparent && m.opacity < 0.6) && m.depthWrite !== false;   // глубину не пишет (следы шин, пятна) — тень не отбрасывает

let SCENE = null, R = null, SHS = null, LCAM = null;
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
const keyOf = o => [].concat(o.material).map(m => { try { return m.customProgramCacheKey(); } catch (e) { return ''; } }).join();
/* ельник (forest.js): его меши — только то, что в кадре; в карту — весь ельник квадрата своими мешами (FOR), не двойниками */
const isForest = o => o.isInstancedMesh && /forestSnow(near|far)/.test(keyOf(o));
const instOk = o => CAST.has(o) || o.name === 'balconyKit' || isForest(o);

/* что на сцене: неподвижные меши в корне и в неподвижных группах — приёмники (материалы) и отбрасывающие (двойники) */
function consider (o, stat) {
  if (!o.isMesh || SEEN.has(o)) return;
  SEEN.add(o);
  const thin = o.isInstancedMesh && !instOk(o);   // трава, цветы, мелочь газона: тень принимают, не отбрасывают, обратная сторона — не «в тени»
  for (const m of [].concat(o.material)) receive(m, thin);
  if (!stat || NOCAST.has(o) || thin || (FORESTF && isForest(o))) return;
  const p = proxyOf(o);
  if (!p) return;
  PROX.push(p); SHS.add(p);
  ST.proxies = PROX.length;
}
const attached = o => { for (let x = o; x; x = x.parent) if (x === SCENE) return true; return false; };
/* меши сцены, как их видит scan: в корне и в неподвижных группах (fn(меш, неподвижен ли)) */
function walk (fn) {
  for (const c of SCENE.children) {
    if (c.isMesh) fn(c, still(c) || CAST.has(c));
    else if (c.isGroup || (c.isObject3D && !c.isLight && !c.isCamera)) {
      const st = still(c) && (c.matrixWorldAutoUpdate === false || c.matrixAutoUpdate === false || c.isGroup);
      for (const k of c.children) {
        if (k.isMesh) fn(k, st && still(k));
        // одна ступень глубже: склейки клеток кладут меши в группы клеток
        else if (st && still(k)) for (const q of k.children) if (q.isMesh) fn(q, still(q));
      }
    }
  }
}
function scan () {
  ST.scans++;
  // двойники тех, кого убрали со сцены (склеили в клетку, сняли вдали), — прочь; вернётся — найдём заново
  let j = 0;
  for (let i = 0; i < PROX.length; i++) {
    const p = PROX[i], o = p.userData.o;
    if (attached(o)) PROX[j++] = p;
    else { p.parent = null; SEEN.delete(o); }
  }
  if (j < PROX.length) { PROX.length = j; SHS.children = PROX.concat(FORM); }   // двойники и меши ельника — единственные дети своей сцены
  walk(consider);
  // машины — тень на кузове через fakeshadows.js (shadeInject), люди — без неё (у них пятна)
}

/* ── ельник в карте: свой InstancedMesh на вид (геометрия и материал глубины — подробной ели / сосны / берёзы) ── */
let FORESTF = null;
const FOR = new Map(), FORM = [];                 // меш вида forest.js → свой меш карты
function forOf (src, n) {
  let f = FOR.get(src);
  if (f && f.instanceMatrix.count >= n) return f;
  const cap = Math.max(1024, 1 << Math.ceil(Math.log2(Math.max(1, n))));
  const g = quiet(() => {
    const m = new THREE.InstancedMesh(src.geometry, depthOf(src.material), cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false; m.matrixAutoUpdate = false; m.matrixWorldAutoUpdate = false; m.count = 0; m.visible = false;
    return m;
  });
  if (f) { SHS.remove(f); FORM.splice(FORM.indexOf(f), 1); f.dispose(); }
  FOR.set(src, g); FORM.push(g); SHS.add(g);
  return g;
}

/* ── включено ли ── */
let GFXON = () => false;
let FORCED = null;
const on = () => !BAN && (FORCED !== null ? FORCED : FORCE || GFXON());

/* один раз, когда город построен (LATE 'sunsh'): цели, камера солнца, сцена двойников */
export function* initSteps (api) {
  if (BAN) return;
  SCENE = api.scene; R = api.renderer;
  if (api.gfxOn) GFXON = api.gfxOn;
  if (api.forest) FORESTF = api.forest;
  if (!on()) return;
  // включены с запуска: обернуть материалы и собрать двойников сейчас — дальше кусок 'shaders' (game.js) скомпилирует
  // программы города уже с тенью, а программы глубины — здесь, под меню, а не рывком в первом кадре
  quiet(setup); built = true;
  yield 'ssrt';
  quiet(scan); lastScan = performance.now() - 3500;   // через ~0,5 с — ещё раз: убрать двойников того, что склеилось после
  if (FORESTF) FORESTF(src => { const f = forOf(src, 1); f.count = 1; f.visible = true; }, true);   // программы глубины ельника — тоже под меню
  yield 'ssscan';
  compileDepth(SHS);
  for (const f of FORM) { f.count = 0; f.visible = false; }
  yield 'ssdepth';
}

/* ── прогрев программ с тенью (2г17, 26.10.2026): на ходу не собирать ни «|ss», ни «|ssd» ──
   prep() — в начале куска 'shaders' (game.js): ещё раз найти, что добавилось на сцену после initSteps (кусок 'first': мир,
   протесты, газон, жизнь), — их программы с тенью соберёт 'shaders', глубину — здесь.
   warm(objs, cam) — образцы прогрева (warmup.js: автобус, его огни, машины потока, машина игрока…): то, чего при загрузке нет
   на сцене, получает тень, когда появится (scan раз в 4 с) — копии их материалов с тенью собираем сейчас. */
export function prep () {
  if (BAN || !built || !on()) return;
  quiet(scan); lastScan = performance.now() - 3500;
  compileDepth(SHS);
}
/* программы глубины — с целью карты: без неё three.js собирает их для экрана (цвет sRGB и тональная кривая — другой ключ),
   и настоящая карта собирала свои заново при первой отрисовке */
function compileDepth (g, async = false) {
  const prev = R.getRenderTarget();
  try { R.setRenderTarget(MAPS[0].rt); return async ? R.compileAsync(g, LCAM, SHS) : R.compile(g, LCAM, SHS); }
  catch (e) { console.error('[sunshadow] глубина', e); return null; } finally { R.setRenderTarget(prev); }
}
const OBC0 = THREE.Material.prototype.onBeforeCompile;
function twin (m) {                                  // копия со всеми правками шейдера (clone их не переносит)
  const c = cloneMat(m);
  if (m.onBeforeCompile !== OBC0) c.onBeforeCompile = m.onBeforeCompile;
  if (Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey')) c.customProgramCacheKey = m.customProgramCacheKey;
  if (m.defaultAttributeValues) c.defaultAttributeValues = m.defaultAttributeValues;
  return c;
}
/* копии материалов objs с тенью (и глубины, если отбрасывают): по одной на материал × вид меша; оригиналы не трогаем */
function twins (objs) {
  const gm = new THREE.Group(), gd = new THREE.Group(), SEENK = new Set();
  quiet(() => {
    const like = (o, mat) => {                     // меш того же вида (инстансы, цвет инстансов, скиннинг) — программа та же
      if (o.isSkinnedMesh) { const ud = o.userData; o.userData = {}; try { const k = o.clone(false); k.material = mat; return k; } finally { o.userData = ud; } }   // userData — бывает по кругу
      if (o.isInstancedMesh) { const k = new THREE.InstancedMesh(o.geometry, mat, 1); if (o.instanceColor) k.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3), 3); return k; }
      return new THREE.Mesh(o.geometry, mat);
    };
    const add = (o, thin) => {
      const src = [].concat(o.material), key = src.map(m => m.uuid).join() + (o.isInstancedMesh ? 'i' : '') + (o.instanceColor ? 'c' : '') + (o.isSkinnedMesh ? 's' : '') + (thin ? 't' : '');
      if (SEENK.has(key)) return;
      SEENK.add(key);
      const ms = src.map(m => (RECV.has(m) ? m : receive(twin(m), thin)));
      if (!ms.some(m => RECV.has(m))) return;
      const k = like(o, Array.isArray(o.material) ? ms : ms[0]); k.frustumCulled = false; gm.add(k);
      if (!thin && ms.every(castable)) { const q = like(o, Array.isArray(o.material) ? ms.map(depthOf) : depthOf(ms[0])); q.frustumCulled = false; gd.add(q); }
    };
    for (const o0 of objs) if (o0 && o0.traverse) o0.traverse(o => {
      if (!o.isMesh || !o.material || o.isBatchedMesh) return;
      add(o, false);
      if (o.isInstancedMesh) add(o, true);       // общий материал станет «тонким» или нет по первому найденному мешу — собираем оба
    });
  });
  return { gm, gd };
}
export function warm (objs, cam) {
  if (BAN || !built || !on() || !R) return 0;
  const { gm, gd } = twins(objs);
  try { R.compile(gm, cam, SCENE); } catch (e) { console.error('[sunshadow] прогрев', e); }
  compileDepth(gd);
  ST.warm = (ST.warm || 0) + gm.children.length;
  return gm.children.length;
}

/* включили «тени: настоящие» посреди игры (с запуска были выключены): сначала копии всех материалов сцены с тенью собираются
   без ожидания (compileAsync, KHR_parallel_shader_compile) по HEAT_N за кадр — тени пока нет; все готовы — обернуть настоящие
   материалы (их программы уже есть в кэше three.js по тому же ключу) и показать. Было: ~40 программ одним кадром (~0,3 с на M-маке) */
const HEAT_N = 6, HEAT_WRAP = 20;
let HEAT = null;
function heat (cam) {
  if (!HEAT) {
    const t0 = performance.now();
    quiet(setup);
    const objs = SCENE.children.slice();
    if (FORESTF) FORESTF(src => objs.push(src), true);
    const { gm, gd } = twins(objs);
    HEAT = { list: [...gm.children.map(o => [o, false]), ...gd.children.map(o => [o, true])], i: 0, wait: [], done: false, t: performance.now(),
      old: new Set(R.info.programs), use: null };
    ST.heat = HEAT.list.length; ST.heatMs = +(performance.now() - t0).toFixed(1);
    return false;
  }
  if (HEAT.i < HEAT.list.length) {
    const g = new THREE.Group(), gd = new THREE.Group();
    for (const [o, dep] of HEAT.list.slice(HEAT.i, HEAT.i += HEAT_N)) (dep ? gd : g).add(o);
    try {
      if (g.children.length) HEAT.wait.push(R.compileAsync(g, cam, SCENE));
      if (gd.children.length) HEAT.wait.push(compileDepth(gd, true));
    } catch (e) { console.error('[sunshadow] прогрев на ходу', e); }
    if (HEAT.i >= HEAT.list.length) Promise.all(HEAT.wait).then(() => { HEAT.done = true; }, () => { HEAT.done = true; });
    return false;
  }
  if (!HEAT.done) return false;
  // первое использование собранных (поиск униформ — ждёт видеокарту) — тоже по кусочку, не больше ~4 мс за кадр
  if (!HEAT.use) HEAT.use = R.info.programs.filter(p => !HEAT.old.has(p));
  const t1 = performance.now();
  while (HEAT.use.length && performance.now() - t1 < 4) { const p = HEAT.use.pop(); try { if (p.program) { p.getUniforms(); p.getAttributes(); } } catch (e) { /* — */ } }
  if (HEAT.use.length) return false;
  // обернуть материалы сцены — по HEAT_WRAP за кадр (у каждого обёрнутого three.js заново готовит шейдер — сотни разом ~80 мс)
  if (!HEAT.wrap) { HEAT.wrap = []; const S = new Set(); walk(o => { if (SEEN.has(o)) return; const thin = o.isInstancedMesh && !instOk(o); for (const m of [].concat(o.material)) if (!RECV.has(m) && !S.has(m)) { S.add(m); HEAT.wrap.push([m, thin]); } }); }
  if (HEAT.wrap.length) { quiet(() => { for (const [m, thin] of HEAT.wrap.splice(0, HEAT_WRAP)) receive(m, thin); }); return false; }
  ST.heatS = +((performance.now() - HEAT.t) / 1000).toFixed(2);
  built = true;
  const t2 = performance.now();
  quiet(scan); lastScan = performance.now();
  ST.wrapMs = +(lastScan - t2).toFixed(1);
  return true;
}

/* две карты: показанная (cur) и запасная — в неё рисуется следующая по частям; после перетекания — прошлая */
const MAPS = [];
function mkMap () {
  const dt = new THREE.DepthTexture(SS.N, SS.N, THREE.UnsignedIntType);
  dt.format = THREE.DepthFormat;
  dt.compareFunction = THREE.LessEqualCompare;
  dt.minFilter = THREE.LinearFilter; dt.magFilter = THREE.LinearFilter;
  const rt = new THREE.WebGLRenderTarget(SS.N, SS.N, { format: THREE.RedFormat, type: THREE.UnsignedByteType, depthBuffer: true, stencilBuffer: false,
    depthTexture: dt, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  return { rt, ok: false, mat: new THREE.Matrix4(), dir: new THREE.Vector3(0, 1, 0), c: new THREE.Vector3(1e9, 0, 1e9),
    pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
}
function setup () {
  MAPS.push(mkMap(), mkMap());                     // карты — в униформы после первой отрисовки (до неё у цели нет текстуры в видеокарте)
  SHS = new THREE.Scene();
  SHS.matrixAutoUpdate = false; SHS.matrixWorldAutoUpdate = false;
  LCAM = new THREE.OrthographicCamera(-SS.HALF, SS.HALF, SS.HALF, -SS.HALF, 1, SS.DIST + 160);
  LCAM.updateProjectionMatrix();
  U.uSsP.value.x = (2 * SS.HALF) / SS.N; U.uSsP.value.w = 1 / SS.N;
  try { R.domElement.addEventListener('webglcontextrestored', () => { for (const m of MAPS) m.ok = false; job = null; }); } catch (e) { /* — */ }
}

/* ── каждый кадр перед отрисовкой: E — { V, cam, sun, ENV, weather } ── */
let built = false, lastScan = 0, lastT = -1e9, lastNow = 0, cur = 0, fade = 0, job = null, want = '';
const D = new THREE.Vector3(), DT = new THREE.Vector3(), FW = new THREE.Vector3(), FP = new THREE.Vector3(), V4 = new THREE.Vector4();
const BIASM = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
const RV = new THREE.Vector3(), UV = new THREE.Vector3(), C = new THREE.Vector3();
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * 180 / Math.PI;
const uvOf = (m, p, out) => { V4.set(p.x, p.y, p.z, 1).applyMatrix4(m.mat); return out.set(V4.x, V4.y, 0); };
const UVF = new THREE.Vector3();
export function step (E) {
  if (!SCENE || BAN) return;
  if (!on()) { U.uSsP.value.z = 0; ST.on = 0; return; }
  if (!built && !heat(E.cam)) { U.uSsP.value.z = 0; ST.on = 0; return; }   // включили посреди игры — сначала прогрев
  ST.on = 1;
  const now = performance.now(), dt = Math.min(0.1, Math.max(0, (now - (lastNow || now)) / 1000));
  lastNow = now;
  if (now - lastScan > 4000) { lastScan = now; const t0 = performance.now(); quiet(scan); ST.scanMs = +(performance.now() - t0).toFixed(2); }
  const sun = E.sun, ENV = E.ENV || {};
  // сила: по солнцу, ночь, дождь, снег
  const night = ENV.night || 0, rain = ENV.rain || 0, wid = E.weather ? E.weather() : '';
  let k = Math.min(1, Math.max(0, (sun.intensity - 0.15) / 0.55)) * (1 - night);
  k *= 1 - SS.WET * rain;
  if (wid === 'snowy' || wid === 'storm') k *= SS.SNOWY;
  ST.k = +k.toFixed(3);
  D.copy(sun.position).sub(sun.target.position).normalize();
  const M = MAPS[cur];
  U.uSsP.value.z = M.ok && D.y > 0.05 ? k : 0;
  if (k <= 0.005 || !(D.y > 0.05)) return;           // ночь, ливень; солнце у горизонта или под ним
  U.uSsDir.value.copy(D);                            // какая грань от солнца — по настоящему солнцу, плавно
  // фокус — впереди камеры (плавно едет с камерой: от него растворяется край тени)
  const cam = E.cam;
  cam.getWorldDirection(FW); FW.y = 0;
  if (FW.lengthSq() < 1e-6) FW.set(0, 0, 1); else FW.normalize();
  FP.set(E.V.x + FW.x * SS.HALF * SS.AHEAD, E.groundY !== undefined ? E.groundY : (E.V.y || 0), E.V.z + FW.z * SS.HALF * SS.AHEAD);
  const drift = M.ok ? (uvOf(M, FP, UVF), Math.max(Math.abs(UVF.x - 0.5), Math.abs(UVF.y - 0.5)) * 2 * SS.HALF) : 1e9;
  // перетекание прошлой карты в показанную
  if (fade > 0) fade = Math.max(0, fade - dt / (drift > SS.MOVE ? 0.25 : SS.FADE));   // быстро едем — фокус у края карты: дотечь скорее
  // следующая карта: солнце ушло, фокус отъехал, давно не рисовали
  if (!job && fade <= 0) {
    const turn = M.ok ? angle(D, M.dir) : 1e9;
    let why = want;
    if (!M.ok) why = 'first';
    else if (turn > SS.STEP) why = 'sun';
    else if (drift > SS.MOVE) why = 'move';
    else if (now - lastT > SS.EVERY * 1000) why = 'time';
    if (why) {
      // солнце теней — чуть наперёд (настоящее ушло на STEP — ставим на STEP/2 дальше): ошибка ±STEP/2, а не 0…STEP
      if (why === 'sun' && turn < SS.STEP * 3) DT.copy(D).sub(M.dir).multiplyScalar(0.5).add(D).normalize();
      else if (why === 'sun' || why === 'first' || !M.ok) DT.copy(D);
      else DT.copy(M.dir);
      want = '';
      quiet(() => begin(why, DT, FP));
    }
  }
  if (job) part();
  // униформы: показанная карта, прошлая (пока перетекает), фокус
  const S = MAPS[cur], P2 = MAPS[1 - cur];
  if (S.ok) {
    U.uSsMap.value = S.rt.depthTexture; U.uSsMat.value.copy(S.mat);
    uvOf(S, FP, UVF); U.uSsQ.value.y = UVF.x; U.uSsQ.value.z = UVF.y;
    U.uSsP.value.z = k;
  }
  const f = fade > 0 && P2.ok ? fade * fade * (3 - 2 * fade) : 0;
  U.uSsQ.value.x = f;
  if (f > 0) { U.uSsMap2.value = P2.rt.depthTexture; U.uSsMat2.value.copy(P2.mat); uvOf(P2, FP, UVF); U.uSsQ2.value.x = UVF.x; U.uSsQ2.value.y = UVF.y; }
  ST.fade = +f.toFixed(2);
}

/* начать карту: камера солнца на фокус (середина — по точкам карты), что рисовать — по частям */
const FR = new THREE.Frustum(), PV = new THREE.Matrix4(), SPH = new THREE.Sphere(), TRI = new WeakMap();
const tris = g => { let n = TRI.get(g); if (n === undefined) { n = (g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0) / 3; TRI.set(g, n); } return n; };
function camFor (m) { LCAM.position.copy(m.pos); LCAM.quaternion.copy(m.quat); LCAM.updateMatrixWorld(true); }
function begin (why, dir, fp) {
  const t0 = performance.now();
  const m = MAPS[1 - cur];
  m.ok = false;
  C.copy(fp);
  LCAM.position.copy(C).addScaledVector(dir, SS.DIST);
  LCAM.up.set(0, 1, 0);
  LCAM.lookAt(C);
  LCAM.updateMatrixWorld(true);
  RV.setFromMatrixColumn(LCAM.matrixWorld, 0); UV.setFromMatrixColumn(LCAM.matrixWorld, 1);
  const t = (2 * SS.HALF) / SS.N, a = C.dot(RV), b = C.dot(UV);
  C.addScaledVector(RV, Math.round(a / t) * t - a).addScaledVector(UV, Math.round(b / t) * t - b);
  LCAM.position.copy(C).addScaledVector(dir, SS.DIST);
  LCAM.updateMatrixWorld(true);
  m.dir.copy(dir); m.c.copy(C); m.pos.copy(LCAM.position); m.quat.copy(LCAM.quaternion);
  m.mat.multiplyMatrices(LCAM.projectionMatrix, LCAM.matrixWorldInverse).premultiply(BIASM);
  PV.multiplyMatrices(LCAM.projectionMatrix, LCAM.matrixWorldInverse);
  FR.setFromProjectionMatrix(PV);
  // что рисовать: двойники (оригинал на сцене и виден, в пирамиде камеры солнца) и ельник квадрата
  const items = [];
  let W = 0, FT = 0;
  for (let i = 0; i < PROX.length; i++) {
    const p = PROX[i], o = p.userData.o;
    let v = true, x = o;
    while (x) { if (!x.visible) { v = false; break; } if (x === SCENE) break; x = x.parent; }
    if (!x) v = false;
    let n = 1;
    if (v && o.isInstancedMesh) { n = o.count; v = n > 0; }
    if (v && !o.isInstancedMesh && p.frustumCulled && o.geometry.boundingSphere) {
      SPH.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
      v = FR.intersectsSphere(SPH);
    }
    p.visible = false;
    if (!v) continue;
    const w = tris(o.geometry) * n;
    items.push({ p, w }); W += w;
  }
  if (FORESTF && !FORM.length) FORESTF(src => forOf(src, 1), true);   // ельник появился позже — его меши сразу (программы — в прогреве шейдеров)
  if (FORESTF) {
    const R2 = SS.HALF + 60, IV = LCAM.matrixWorldInverse;   // клетка 48 м (радиус 34) и высота ели — запас 60 м
    FORESTF((src, c, pk) => {
      V4.set(c.cx, c.gy + 10, c.cz, 1).applyMatrix4(IV);
      if (Math.abs(V4.x) > R2 || Math.abs(V4.y) > R2) return;
      const w = tris(src.geometry) * pk.n;
      items.push({ src, pk, w }); W += w; FT += pk.n;
    });
  }
  // по частям: не больше BUDGET треугольников за кадр, самые тяжёлые — в самую лёгкую часть
  const K = Math.max(1, Math.min(SS.KMAX, Math.ceil(W / SS.BUDGET)));
  const parts = Array.from({ length: K }, () => ({ w: 0, it: [] }));
  items.sort((x, y) => y.w - x.w);
  for (const it of items) { let b0 = parts[0]; for (const q of parts) if (q.w < b0.w) b0 = q; b0.it.push(it); b0.w += it.w; }
  job = { why, m: 1 - cur, parts, i: 0, W, t0: now() };
  ST.why = why; ST.jobs = (ST.jobs || 0) + 1; ST.parts = K; ST.tris = W; ST.ftrees = FT;
  (ST.whys || (ST.whys = {}))[why] = (ST.whys[why] || 0) + 1;
  ST.beginMs = +(performance.now() - t0).toFixed(2);
}
const now = () => performance.now();

/* одна часть карты за кадр; последняя — карты меняются местами */
const FCNT = new Map();
function part () {
  const t0 = performance.now();
  const m = MAPS[job.m], pt = job.parts[job.i];
  for (let i = 0; i < PROX.length; i++) PROX[i].visible = false;
  for (const f of FORM) { f.visible = false; f.count = 0; }
  FCNT.clear();
  for (const it of pt.it) {
    if (it.p) { it.p.visible = it.p.parent === SHS; if (it.p.isInstancedMesh) it.p.count = it.p.userData.o.count; continue; }
    FCNT.set(it.src, (FCNT.get(it.src) || 0) + it.pk.n);
  }
  for (const [src, n] of FCNT) {
    const f = forOf(src, n);
    let o = 0;
    for (const it of pt.it) if (it.src === src) { f.instanceMatrix.array.set(it.pk.n * 16 === it.pk.m.length ? it.pk.m : it.pk.m.subarray(0, it.pk.n * 16), o * 16); o += it.pk.n; }
    f.count = n; f.visible = true;
    if (f.instanceMatrix.clearUpdateRanges) { f.instanceMatrix.clearUpdateRanges(); f.instanceMatrix.addUpdateRange(0, n * 16); }
    f.instanceMatrix.needsUpdate = true;
  }
  camFor(m);
  const prev = R.getRenderTarget(), ac = R.autoClear;
  R.autoClear = job.i === 0;                         // первая часть стирает карту, остальные дорисовывают
  R.setRenderTarget(m.rt);
  const tq = DBG.gpu ? gpuBegin() : null;
  R.render(SHS, LCAM);
  if (tq) gpuEnd(tq);
  ST.drawCalls = R.info.render.calls;
  R.setRenderTarget(prev);
  R.autoClear = ac;
  job.i++;
  ST.draws++; ST.lastMs = +(performance.now() - t0).toFixed(2);
  if (job.i < job.parts.length) return;
  // готово: «солнце» — перетекание из прошлой; середина или раз в 4 с — сразу (тот же кусок тени тот же)
  m.ok = true;
  const old = cur, fadeIn = job.why === 'sun' && MAPS[old].ok;
  cur = job.m;
  fade = fadeIn ? 1 : 0;
  lastT = performance.now();
  ST.jobMs = +(lastT - job.t0).toFixed(1);
  job = null;
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
    if (ST.gpu.length > 400) ST.gpu.shift();
    gl.deleteQuery(g.q); GQ.splice(i, 1);
  }
}

export const DEBUG = {
  set gpu (v) { DBG.gpu = !!v; }, get gpu () { return DBG.gpu; },
  SS, ST, U,
  get rt () { return MAPS[cur] && MAPS[cur].rt; }, get cam () { return LCAM; }, get proxies () { return PROX; }, get maps () { return MAPS; },
  get forest () { return FORM; }, get cur () { return cur; }, get job () { return job; },
  on: () => on(),
  redraw (why = 'time') { want = why; },
  /* на этот запуск: true — настоящие, false — нет, null — по графике (сравнить до / после одним прогоном) */
  force (v) { FORCED = v; },
};
