/* ──────────────────────────────────────────────────────────────────────────
   Некошеная трава рядом с камерой (трек «Мир», «Стиль глубинки» 2г8—2г9, 25.10.2026;
   правила словами — docs/CAREER.md «Город: как выглядит» → «Трава, тропинки, плиты»).

   Автор: «трава нежная, явно выше обычного — не стригут; растительность на газонах заполоняет
   даже дорожки; плиты дорожек у дома, из-под плит растёт зелень». До того газон был ровной
   салатовой скатертью с редкими пучками-«ёжиками» (lawnprops.js).

   Как устроено — два куска, оба почти целиком в видеокарте:

   1. МАСКА ЗЕМЛИ. Картинка MASK.N² (по умолчанию 512², ~0,2 м на точку) сверху на квадрат
      ±HALF м вокруг точки чуть впереди камеры. В неё раз в несколько метров езды рисуется
      склейка земли (LITM — те же куски, что на экране) своим простым шейдером:
        R — «газон» (зелёная грань, смотрит вверх, не реквизит; на проплешинах lawn.js — нет,
            на заросшем краю тропинки — наполовину), G — высота земли (от uRefY),
        A — направление дворовой дорожки (по CITY.paths: полосой поверх, для плит).
      Новых вызовов в обычном кадре нет: маска рисуется в маленькую цель, когда середина
      отъехала на MASK.MOVE м (раз в 1—2 с на ходу), кусками склейки, что задевают квадрат.

   2. ТРАВА. Два меша (ближний густой и дальний пореже) — один и тот же пучок травинок
      (InstancedBufferGeometry), экземпляры лежат сеткой-плиткой по миру и «переезжают» за
      камерой по модулю (трава не плывёт). Каждый экземпляр в шейдере вершин смотрит маску: не
      газон — сжат в точку; газон — травинки 0,3—0,9 м (у края газона — у стен, заборов,
      дорожек — выше), качаются от ветра, расходятся от машины (машина едет насквозь). Вдали —
      плавно опускается в землю (без резкой границы), дальше FAR.B м её нет: там краска газона
      (lawn.js, «бархат»). Цвет — от тёмного у корня к светлому тёплому на кончиках, осенью
      золотится, в жару — солома, зимой под снегом нет. Тени домов (fakeshadows.js) — на траве
      тоже (shadeInject: по мировой точке, без проверки «смотрит вверх»).

   Та же маска нужна краске земли (lawn.js): трава заходит на край плитки и асфальта неровным
   краем, плиты дорожек со швами и травой в швах, тропинки (wastelands.js) — рыжая утоптанная
   земля с заросшим краем. Дальше квадрата маски этого нет — край плавный.

   Графика (gfx.js DETAIL.meadow): 3 — высокая (оба меша), 2 — средняя (Steam Deck: реже и ближе),
   1 — низкая (только ближний, редкий), 0 — нет. Телефон — как низкая, ещё реже.
   Флаги: ?oldgrass (и ?oldlook) — всё по-старому (и краска lawn.js), ?nomeadow — без травинок
   (краска остаётся). __dlv.MEADOW — числа и ручки.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import {landPositionMaskMaterial} from './landpositions.js';
import * as GFX from './gfx.js';
import { snowAmt, dryAmt, heatAmt, mudAmt, patchNoiseGLSL } from './seasons.js';
import { ON as MOBILE } from './mobile.js';
import * as FSH from './fakeshadows.js';

const Q = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
/* весь новый вид травы и земли (и краска lawn.js) — выключен: ?oldgrass, ?oldlook */
export const OLD = Q.has('oldgrass') || Q.has('oldlook');
const NO_BLADES = OLD || Q.has('nomeadow');

export const MEADOW = {
  MASK: { N: 512, HALF: 56, AHEAD: 0.42, MOVE: 9, REFRESH: 4 },   // сторона маски, точек; ± м; середина впереди камеры (доля HALF); заново — отъехали на MOVE м или раз в REFRESH с
  // [сторона плитки, м; экземпляров по стороне; травинок в пучке; полоса угасания, м] по графике: 1 — низкая, 2 — средняя, 3 — высокая
  NEAR: { 1: [22, 44, 5, [7, 10]], 2: [34, 76, 6, [10, 15]], 3: [40, 104, 7, [12, 18]] },
  FAR: { 1: null, 2: [72, 84, 3, [20, 32]], 3: [96, 128, 3, [26, 40]] },
  H: [0.3, 0.9],             // высота травы, м
  EDGE: 0.45,                // у края газона (стены, заборы, дорожки) — выше на эту долю
  CREEP: 0.12,               // порог маски: трава заходит за край газона на 10—30 см
  WIND: 0.13,                // качание кончика от ветра, доля высоты
};

/* униформы краски земли (lawn.js): маска, окно (x, z середины, 1 / ширина), включено, сторона маски */
export const MU = {
  uMdMap: { value: null },
  uMdWin: { value: new THREE.Vector3(0, 0, 1 / 112) },
  uMdOn: { value: 0 },
  uMdN: { value: MEADOW.MASK.N },
  uMdRef: { value: 0 },
  uMdCover: { value: new THREE.Vector3(0, 1, 0) },   // земля под травой темнее: (откуда гаснет, где нет, сила) — как трава вдали
};

let A = null, RT = null, MCAM = null, MMAT = null, PMAT = null, KMAT = null, PROPS = [], PMESH = null, PN = -1, PSTABLE = 0;
let GROUND = null, LIST = [], LIST_T = -1e9, T = 0, LAST = { x: 1e9, z: 1e9, t: -1e9 };
const LAYERS = [];
const ST = { masks: 0, maskMs: 0, maskMsMax: 0, meshes: 0, drawn: 0, paths: 0, pathSegs: 0, level: -1, inst: 0, off: '' };

/* ── шум и хэш для шейдеров (как sHash / sNoise в seasons.js — проплешины газона считаются тем же) ── */
const NOISE = `
float mdHash (vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float mdNoise (vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mdHash(i), mdHash(i + vec2(1.0, 0.0)), f.x), mix(mdHash(i + vec2(0.0, 1.0)), mdHash(i + vec2(1.0, 1.0)), f.x), f.y); }`;

const CB = new THREE.Color();
const lin = hex => { CB.set(hex); return new THREE.Vector3(Math.round(CB.r * 255) / 255, Math.round(CB.g * 255) / 255, Math.round(CB.b * 255) / 255); };
/* цвета-метки тропинок (wastelands.js TRAIL_HEX — середина, EDGE_HEX — заросший край): см. lawn.js */
export const TAGS = { trail: ['#8f7a5a', '#94805e', '#87735a'], trailEdge: '#a3a072', yard: '#d3c9b8', walk: '#d9d0c0', path: '#ddd5c6' };
export const tagLin = hex => lin(hex);

/* ── 1. маска ── */
function maskMat () {
  const m = new THREE.ShaderMaterial({
    vertexColors: true, side: THREE.DoubleSide,     // проекция сверху «зеркальная» (z → вверх картинки): обе стороны
    uniforms: { uC: { value: new THREE.Vector3() }, uRef: MU.uMdRef, uEdge: { value: lin(TAGS.trailEdge) }, uTr: { value: TAGS.trail.map(lin) }, uDbg: { value: 0 } },
    vertexShader: `
      uniform vec3 uC; uniform float uRef;
      varying vec3 vW; varying vec4 vC;
      void main () {
        vW = (modelMatrix * vec4(position, 1.0)).xyz;      // склейка: куски могут лежать от своей середины
        #if defined(USE_COLOR_ALPHA)
          vC = color;
        #elif defined(USE_COLOR)
          vC = vec4(color, 0.0);
        #else
          vC = vec4(0.0);
        #endif
        gl_Position = vec4((vW.x - uC.x) * uC.z * 2.0, (vW.z - uC.y) * uC.z * 2.0, clamp(-(vW.y - uRef) / 120.0, -1.0, 1.0), 1.0);
      }`,
    fragmentShader: `
      uniform float uRef; uniform vec3 uEdge; uniform vec3 uTr[3]; uniform float uDbg;
      varying vec3 vW; varying vec4 vC;
      ${NOISE}
      void main () {
        if (vC.a > 0.5) discard;                           // реквизит, мелочь дворов — не земля (seasons.js S_LAND)
        vec3 N = normalize(cross(dFdx(vW), dFdy(vW)));
        float up = smoothstep(0.42, 0.8, abs(N.y));
        float g = smoothstep(0.05, 0.18, vC.g - max(vC.r, vC.b)) * up;
        vec3 de = abs(vC.rgb - uEdge);
        float trail = 0.0;                                 // B: тропинка (середина 1, край 0,5) — трава туда не заходит
        if (max(de.r, max(de.g, de.b)) < 0.0022) { g = 0.5 * up * smoothstep(0.3, 0.7, mdNoise(vW.xz * 1.3)); trail = 0.5; }   // заросший край тропинки
        for (int i = 0; i < 3; i++) { vec3 dt = abs(vC.rgb - uTr[i]); if (max(dt.r, max(dt.g, dt.b)) < 0.0022) trail = 1.0; }
        if (vW.y - uRef > 6.0) g = 0.0;                    // крыши
        // проплешины — как в lawn.js (тот же шум, та же сетка): там травы нет
        vec2 q = vW.xz;
        vec2 bq = mat2(0.857, 0.515, -0.515, 0.857) * q;
        float clump = mdNoise(q * 0.021 + 19.0);
        float bn = mdNoise(bq * 0.14 + 5.0) * 0.82 + mdNoise(mat2(0.643, -0.766, 0.766, 0.643) * q * 0.5 + 9.0) * 0.18;
        float bTh = 0.84 - clump * 0.1;
        g *= 1.0 - smoothstep(bTh - 0.03, bTh + 0.03, bn);
        gl_FragColor = vec4(g, vW.y - uRef, trail, 0.0);
        if (uDbg > 0.5) gl_FragColor = vec4(vC.rgb, 1.0);
      }`,
  });
  m.extensions = {};
  return m;
}
/* реквизит поверх газона (второй круг 25.10.2026): лавочки, клумбы, покрышки, песочницы, бортики кругов, заборчики — склейка
   (признак «реквизит» в 4-м байте цвета LITM) и мелочь газона (lawnprops.js, твёрдое) — гасит «газон» в маске (R × 0),
   высоту и дорожки не трогает. Только низкое: до PROP_H м над своим основанием (у склейки — над серединой маски), кроны
   деревьев траву не гасят */
const PROP_H = 1.4, PROP_H_LITM = 4;
function killMat () {
  const m = new THREE.ShaderMaterial({
    vertexColors: true, side: THREE.DoubleSide,
    uniforms: { uC: { value: new THREE.Vector3() }, uRef: MU.uMdRef },
    vertexShader: `
      uniform vec3 uC; uniform float uRef;
      varying vec4 vC; varying float vH;
      void main () {
        vec4 lp = vec4(position, 1.0), b0 = vec4(0.0, uRef, 0.0, 1.0);
        #ifdef USE_INSTANCING
          lp = instanceMatrix * lp;
          b0 = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #endif
        vec3 w = (modelMatrix * lp).xyz;
        #if defined(USE_COLOR_ALPHA)
          vC = color;
        #else
          vC = vec4(0.0, 0.0, 0.0, 1.0);                   // мелочь газона (InstancedMesh) — вся реквизит
        #endif
        #ifdef USE_INSTANCING
          vC.a = 1.0; vH = (w.y - b0.y) / ${PROP_H.toFixed(2)};
        #else
          vH = (w.y - uRef) / ${PROP_H_LITM.toFixed(2)};
        #endif
        gl_Position = vec4((w.x - uC.x) * uC.z * 2.0, (w.z - uC.y) * uC.z * 2.0, 0.0, 1.0);
      }`,
    fragmentShader: `
      varying vec4 vC; varying float vH;
      void main () {
        if (vC.a < 0.5 || vH > 1.0) discard;
        gl_FragColor = vec4(0.0, 1.0, 1.0, 1.0);
      }`,
    depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
    blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });
  return m;
}
/* направление дорожек (A): полосы по CITY.paths поверх — только альфа, цвет маски не трогаем */
function pathMat () {
  const m = new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Vector3() } },
    vertexShader: `
      uniform vec3 uC; attribute float aAng; varying float vA;
      void main () { vA = aAng; gl_Position = vec4((position.x - uC.x) * uC.z * 2.0, (position.z - uC.y) * uC.z * 2.0, 0.0, 1.0); }`,
    fragmentShader: `
      varying float vA;
      void main () { gl_FragColor = vec4(0.0, 0.0, 0.0, vA); }`,
    depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.OneFactor,
    blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.ZeroFactor,
  });
  return m;
}
function buildPaths () {
  const P = (A.CITY && A.CITY.paths) || [];
  const pos = [], ang = [];
  let n = 0;
  for (const q of P) {
    const hw = (q.hw || 1) + 0.15;
    for (let i = 1; i < q.length; i++) {
      const [ax, az] = q[i - 1], [bx, bz] = q[i], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      if (L < 0.05) continue;
      const nx = -dz / L * hw, nz = dx / L * hw, ex = dx / L * 0.1, ez = dz / L * 0.1;
      let a = Math.atan2(dz, dx); if (a < 0) a += Math.PI; if (a >= Math.PI) a -= Math.PI;
      const v = 0.1 + 0.85 * a / Math.PI;
      const p0 = [ax - ex + nx, az - ez + nz], p1 = [bx + ex + nx, bz + ez + nz], p2 = [bx + ex - nx, bz + ez - nz], p3 = [ax - ex - nx, az - ez - nz];
      for (const p of [p0, p1, p2, p0, p2, p3]) { pos.push(p[0], 0, p[1]); ang.push(v); }
      n++;
    }
  }
  if (PMESH) { PMESH.geometry.dispose(); PMESH = null; }
  if (!n) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aAng', new THREE.Float32BufferAttribute(ang, 1));
  PMESH = new THREE.Mesh(g, PMAT);
  PMESH.frustumCulled = false; PMESH.matrixAutoUpdate = false;
  ST.paths = P.length; ST.pathSegs = n;
}
/* куски склейки земли: всё с материалом статики (litMat) — раз в 2 с ищем новые (поздняя сборка дописывает клетки) */
function ground () {
  if (!GROUND || (LIST.length && T - LIST_T < 6)) return LIST;
  LIST_T = T;
  const L = [];
  const PR = [];
  A.scene.traverse(o => {
    if (!o.isMesh || !o.geometry) return;
    if (o.material === GROUND || o.material?.userData?.landPositions) { L.push(o); return; }
    if (o.isInstancedMesh && !Array.isArray(o.material) && o.material.customProgramCacheKey) {
      let k = ''; try { k = String(o.material.customProgramCacheKey()); } catch (e) { return; }
      if (/^lawn(Solid|Rail)/.test(k)) PR.push(o);       // мелочь газона: покрышки, песок, ракушки, оградки, мусор (кроны — выше PROP_H)
    }
  });
  PROPS = PR;
  LIST = L; ST.meshes = L.length;
  return L;
}
const ORIG = { mat: null, mask: 0 }, SPH = new THREE.Sphere();
function drawMask (cx, cz) {
  const R = A.renderer, H = MEADOW.MASK.HALF, t0 = performance.now();
  // середина — по сетке точек маски (2г17, автор 26.10: «трава перемещается раз в несколько секунд»): иначе при каждой
  // перерисовке сетка сдвигалась на долю точки, и у края газона травинки пропадали и меняли высоту
  const tx = 2 * H / MEADOW.MASK.N;
  cx = Math.round(cx / tx) * tx; cz = Math.round(cz / tx) * tx;
  MU.uMdRef.value = A.groundH(cx, cz);
  MMAT.uniforms.uC.value.set(cx, cz, 1 / (2 * H));
  PMAT.uniforms.uC.value.set(cx, cz, 1 / (2 * H));
  MCAM.left = -H; MCAM.right = H; MCAM.top = H; MCAM.bottom = -H; MCAM.near = 1; MCAM.far = 2000;
  MCAM.up.set(0, 0, -1); MCAM.position.set(cx, MU.uMdRef.value + 600, cz); MCAM.lookAt(cx, MU.uMdRef.value - 100, cz);
  MCAM.updateProjectionMatrix(); MCAM.updateMatrixWorld(true);
  const prevRT = R.getRenderTarget(), prevAC = R.autoClear, prevCol = R.getClearColor(new THREE.Color()), prevA = R.getClearAlpha();
  R.setRenderTarget(RT);
  R.setClearColor(0x000000, 0);
  R.clear(true, true, false);
  R.autoClear = false;
  let n = 0;
  try {
    for (const m of ground()) {
      if (!m.geometry.boundingSphere) continue;
      SPH.copy(m.geometry.boundingSphere).applyMatrix4(m.matrixWorld);
      if (Math.abs(SPH.center.x - cx) > H + SPH.radius || Math.abs(SPH.center.z - cz) > H + SPH.radius) continue;
      ORIG.mat = m.material; ORIG.mask = m.layers.mask;
      m.material = landPositionMaskMaterial(MMAT,ORIG.mat); m.layers.mask = 1;
      try { R.render(m, MCAM); } finally { m.material = ORIG.mat; m.layers.mask = ORIG.mask; }
      n++;
    }
    // реквизит гасит газон: та же склейка вторым проходом, потом мелочь газона
    KMAT.uniforms.uC.value.set(cx, cz, 1 / (2 * H));
    for (const m of LIST) {
      if (!m.geometry.boundingSphere || !m.geometry.attributes.color || m.geometry.attributes.color.itemSize < 4) continue;
      SPH.copy(m.geometry.boundingSphere).applyMatrix4(m.matrixWorld);
      if (Math.abs(SPH.center.x - cx) > H + SPH.radius || Math.abs(SPH.center.z - cz) > H + SPH.radius) continue;
      ORIG.mat = m.material; ORIG.mask = m.layers.mask;
      m.material = KMAT; m.layers.mask = 1;
      try { R.render(m, MCAM); } finally { m.material = ORIG.mat; m.layers.mask = ORIG.mask; }
      n++;
    }
    for (const m of PROPS) {
      if (!m.visible || !m.count) continue;
      ORIG.mat = m.material; ORIG.mask = m.layers.mask; const fc = m.frustumCulled;
      m.material = KMAT; m.layers.mask = 1; m.frustumCulled = false;
      try { R.render(m, MCAM); } finally { m.material = ORIG.mat; m.layers.mask = ORIG.mask; m.frustumCulled = fc; }
      n++;
    }
    if (PMESH) { R.render(PMESH, MCAM); n++; }
  } finally {
    R.setRenderTarget(prevRT); R.autoClear = prevAC; R.setClearColor(prevCol, prevA);
  }
  MU.uMdWin.value.set(cx, cz, 1 / (2 * H));
  MU.uMdOn.value = 1;
  const ms = performance.now() - t0;
  ST.masks++; ST.drawn = n; ST.maskMs = Math.round(ms * 100) / 100; ST.maskMsMax = Math.max(ST.maskMsMax, ST.maskMs);
}

/* ── 2. трава ── */
/* пучок: nb травинок, у каждой два звена (5 вершин, 3 треугольника — с обеих сторон: индекс вдвое).
   position — (x основания, доля высоты, z основания); aBl — (сторона −1…1, поворот плоскости, куда клонится, жребий) */
function clumpGeo (nb, seed, seg2) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6D2B79F5) >>> 0; let q = s; q = Math.imul(q ^ (q >>> 15), q | 1); q ^= q + Math.imul(q ^ (q >>> 7), q | 61); return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
  const P = [], B = [], I = [];
  for (let b = 0; b < nb; b++) {
    const a = b / nb * Math.PI * 2 + r() * 0.8, d = 0.03 + r() * 0.13, bx = Math.cos(a) * d, bz = Math.sin(a) * d;
    const face = r() * Math.PI, lean = a + (r() - 0.5) * 0.9, rk = r();
    const v0 = P.length / 3;
    const V = seg2 ? [[-1, 0], [1, 0], [-0.75, 0.5], [0.75, 0.5], [0, 1]] : [[-1, 0], [1, 0], [0, 1]];   // дальний — одним треугольником
    for (const [side, t] of V) { P.push(bx, t, bz); B.push(side, face, lean, rk); }
    const tri = seg2 ? [[0, 1, 3], [0, 3, 2], [2, 3, 4]] : [[0, 1, 2]];
    for (const [x, y, z] of tri) { I.push(v0 + x, v0 + y, v0 + z); I.push(v0 + x, v0 + z, v0 + y); }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('aBl', new THREE.Float32BufferAttribute(B, 4));
  g.setIndex(I);
  return g;
}
/* экземпляры: сетка n × n с дрожанием в клетке — ровная густота без рядов */
function instAttr (g, n, seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6D2B79F5) >>> 0; let q = s; q = Math.imul(q ^ (q >>> 15), q | 1); q ^= q + Math.imul(q ^ (q >>> 7), q | 61); return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
  const a = new Float32Array(n * n * 4);
  let k = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { a[k++] = (i + 0.1 + r() * 0.8) / n; a[k++] = (j + 0.1 + r() * 0.8) / n; a[k++] = r(); a[k++] = r(); }
  g.setAttribute('aI', new THREE.InstancedBufferAttribute(a, 4));
  g.instanceCount = n * n;
}
const GU = {
  uTime: { value: 0 }, uCar: { value: new THREE.Vector4(0, 0, 0, 0) }, uWind: { value: new THREE.Vector2(0.8, 0.6) },
  uSea: { value: new THREE.Vector4(0, 0, 0, 0) },    // сухость, жара, весна (грязь), снег
  uH: { value: new THREE.Vector2(MEADOW.H[0], MEADOW.H[1]) }, uEdgeK: { value: MEADOW.EDGE }, uCreep: { value: MEADOW.CREEP },
  uMdFast: { value: 1 },     // 1 — невидимые пучки сразу в точку (perf 14); 0 — по-старому (замер: __dlv.MEADOW.GU.uMdFast)
};
function grassMat (L) {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
  m.defines = { MAT_LEAF: '' };                   // 2г11: трава на просвет против солнца (materials.js)
  const U = { uTile: { value: new THREE.Vector3(0, 0, L.T) }, uFadeAB: { value: new THREE.Vector2(L.fade[0], L.fade[1]) }, uDens: { value: 1 }, uLayH: { value: L.near ? 1 : 0.75 } };
  L.U = U;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, GU, U, MU);
    sh.vertexShader = `
uniform float uTime; uniform vec4 uCar; uniform vec2 uWind; uniform vec4 uSea; uniform vec2 uH; uniform float uEdgeK, uCreep;
uniform vec3 uTile; uniform vec2 uFadeAB; uniform float uDens, uLayH, uMdFast;
uniform sampler2D uMdMap; uniform vec3 uMdWin; uniform float uMdOn, uMdRef, uMdN;
attribute vec4 aBl; attribute vec4 aI;
varying vec3 vMdC;
${NOISE}
${patchNoiseGLSL('mdNoise')}
float mdLawn (vec2 p) { vec2 uv = (p - uMdWin.xy) * uMdWin.z + 0.5; vec2 e = abs(uv - 0.5); return max(e.x, e.y) > 0.49 ? 0.0 : texture2D(uMdMap, uv).r; }
` + sh.vertexShader
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <begin_vertex>', `
  // место пучка: плитка uTile.z м с серединой uTile.xy — по модулю, привязана к миру
  vec2 c0 = uTile.xy - uTile.z * 0.5;
  vec2 p = c0 + mod(aI.xy * uTile.z - c0, uTile.z);
  float dist = length(p - cameraPosition.xz);
  vec3 fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  vec2 rel = p - cameraPosition.xz;
  float behind = dot(rel, normalize(fwd.xz + vec2(1e-5))) < -4.0 ? 0.0 : 1.0;
  vec2 uv = (p - uMdWin.xy) * uMdWin.z + 0.5;
  vec2 ue = abs(uv - 0.5);
  float win = 1.0 - smoothstep(0.42, 0.48, max(ue.x, ue.y));
  float fade = 1.0 - smoothstep(uFadeAB.x, uFadeAB.y, dist);
  // скорость (perf 14, 26.10.2026): пучок за спиной, дальше угасания, реже густоты или вбок за краем кадра — сразу в точку,
  // без маски и шума (их считала каждая из 15—35 вершин пучка; видимых пучков — около трети плитки)
  vec3 transformed = vec3(p.x, uMdRef - 60.0, p.y);
  vMdC = vec3(0.0);
  vec3 mdQ = (viewMatrix * vec4(p.x, uMdRef + 0.5, p.y, 1.0)).xyz;   // ось x вида горизонтальна (камера без крена) — высота не важна
  float mdP0 = projectionMatrix[0][0];
  bool mdCut = uMdFast > 0.5 && (behind < 0.5 || fade < 0.001 || aI.z > uDens
    || abs(mdQ.x) * mdP0 - 2.2 * sqrt(mdP0 * mdP0 + 1.0) > -mdQ.z + 1.0);
  if (!mdCut) {
  float lawn = texture2D(uMdMap, uv).r * win * uMdOn;
  // шов плит дворовой дорожки с травой (как в lawn.js): пучок — на шов, короткий
  float seamG = 0.0;
  if (lawn < uCreep && win > 0.0) {
    float aE = texelFetch(uMdMap, min(ivec2(clamp(uv, 0.0, 1.0) * uMdN), ivec2(int(uMdN) - 1)), 0).a;
    if (aE > 0.05) {
      float ang = (aE - 0.1) / 0.85 * 3.14159265;
      vec2 dir = vec2(cos(ang), sin(ang));
      float u = dot(p, dir) / 1.15, ks = floor(u + 0.5);
      if (mdHash(vec2(ks + 17.0, floor(aE * 300.0))) < 0.3 && abs(u - ks) < 0.22 && aI.z < 0.55) { p += dir * (ks - u) * 1.15; seamG = 1.0; }
    }
  }
  // высота — по ближайшей точке маски (не смешанная: у края балкона над газоном смешанная висела бы в воздухе);
  // за краем газона — только если рядом газон на той же высоте (плитка, асфальт, бордюр), а не балкон или крыша
  ivec2 ti = clamp(ivec2(clamp(uv, 0.0, 1.0) * uMdN), ivec2(1), ivec2(int(uMdN) - 2));
  vec4 n0 = texelFetch(uMdMap, ti, 0);
  float okH = 1.0;
  if (n0.r < 0.5 && seamG < 0.5) {
    float best = 99.0;
    vec4 nb = texelFetch(uMdMap, ti + ivec2(1, 0), 0); if (nb.r > 0.5) best = min(best, abs(nb.g - n0.g));
    nb = texelFetch(uMdMap, ti - ivec2(1, 0), 0); if (nb.r > 0.5) best = min(best, abs(nb.g - n0.g));
    nb = texelFetch(uMdMap, ti + ivec2(0, 1), 0); if (nb.r > 0.5) best = min(best, abs(nb.g - n0.g));
    nb = texelFetch(uMdMap, ti - ivec2(0, 1), 0); if (nb.r > 0.5) best = min(best, abs(nb.g - n0.g));
    okH = step(best, 0.35);
  }
  float keep = (1.0 - smoothstep(uDens - 0.12, uDens, aI.z)) * behind * max(step(uCreep, lawn), seamG) * step(0.001, fade) * okH * step(n0.b, 0.75);   // на середине тропинки — нет
  float snow = 1.0 - smoothstep(0.25, 0.45, uSea.w);
  if (uSea.w > 0.0) {
    // Под белым пятном газона травинок нет; остаются только в проталинах.
    // Летом дополнительный шум не считается (Steam Deck, 2г18).
    float lim = uSea.w * 1.35 - 0.22;
    float cover = 1.0 - smoothstep(lim - 0.1, lim + 0.1, seasonPatch(p).x);
    snow *= 1.0 - smoothstep(0.05, 0.4, cover);
  }
  // некошеная: пятнами выше и ниже; у края газона (стена, забор, дорожка) — выше
  float patchH = mdNoise(p * 0.11 + 4.0) * 0.6 + mdNoise(p * 0.37 + 9.0) * 0.4;
  float edge = 1.0 - min(min(mdLawn(p + vec2(1.1, 0.0)), mdLawn(p - vec2(1.1, 0.0))), min(mdLawn(p + vec2(0.0, 1.1)), mdLawn(p - vec2(0.0, 1.1))));
  float h = mix(uH.x, uH.y, clamp(patchH * 0.8 + aI.w * 0.45 - 0.1, 0.0, 1.0)) * (1.0 + uEdgeK * edge) * (0.85 + 0.3 * aBl.w);
  h *= smoothstep(uCreep, 0.6, lawn) * 0.6 + 0.4;               // за краем газона — ниже: заходит на плитку
  h = seamG > 0.5 ? mix(0.1, 0.32, aI.w) : h;                    // в шве — низкая
  h *= 1.0 - 0.55 * step(0.25, n0.b);                             // на краю тропинки — ниже (вытоптано)
  h *= mix(1.0, 0.7, uSea.z) * mix(1.0, 0.85, uSea.y);          // весной ниже, в жару сухая и пониже
  h *= fade * snow * keep * uLayH;
  float t = position.y;
  float yaw = aI.w * 6.2832;
  float cy = cos(yaw), sy = sin(yaw);
  vec2 b0 = vec2(position.x * cy - position.z * sy, position.x * sy + position.z * cy) * (0.9 + 0.5 * aI.z);
  float face = aBl.y + yaw, ln = aBl.z + yaw;
  vec2 side = vec2(cos(face), sin(face));
  float wdt = (0.011 + 0.011 * aBl.w) * (1.0 - t * 0.3) * (1.0 + dist * 0.035);   // вдали шире: тоньше точки экрана — рябит
  vec2 lean = vec2(cos(ln), sin(ln)) * (0.12 + 0.25 * aBl.w);
  // ветер: порывы бегут по полю; машина раздвигает (как lawnprops.js)
  float gust = sin(uTime * 1.3 + dot(p, uWind) * 0.45) * 0.6 + sin(uTime * 2.3 + p.x * 0.9 + p.y * 0.7) * 0.4;
  vec2 wind = uWind * (0.35 + 0.65 * gust) * ${MEADOW.WIND.toFixed(3)};
  vec2 dd = p - uCar.xy; float dl = max(length(dd), 0.001);
  float push = (1.0 - smoothstep(0.6, 2.6, dl)) * uCar.z;
  vec2 bend = (lean + wind) * t * t + dd / dl * push * t * 0.9;
  transformed = vec3(p.x + b0.x + side.x * aBl.x * wdt + bend.x * h, uMdRef + n0.g - 0.03 + t * h * (1.0 - push * 0.5), p.y + b0.y + side.y * aBl.x * wdt + bend.y * h);
  if (h < 0.004) transformed = vec3(p.x, uMdRef + n0.g - 0.5, p.y);
  // цвет: тёмный у корня → сочный → светлый тёплый кончик (на солнце — золотистый)
  // тёплые и холодные пятна — те же, что у краски газона (lawn.js «бархат»)
  float pw = mdNoise(p * 0.028 + 57.0) * 0.6 + mdNoise(p * 0.09 + 13.0) * 0.4;
  float warm = clamp(smoothstep(0.2, 0.8, pw) + (aBl.w - 0.5) * 0.5, 0.0, 1.0);
  vec3 root = vec3(0.03, 0.05, 0.014), mid = mix(vec3(0.07, 0.14, 0.03), vec3(0.15, 0.19, 0.04), warm);
  vec3 tip = mix(vec3(0.30, 0.38, 0.08), vec3(0.64, 0.52, 0.13), warm);
  vec3 dryTip = mix(vec3(0.72, 0.55, 0.16), vec3(0.62, 0.40, 0.10), warm), dryMid = vec3(0.36, 0.33, 0.08);
  tip = mix(tip, dryTip, uSea.x * 0.9); mid = mix(mid, dryMid, uSea.x * 0.85); root = mix(root, vec3(0.08, 0.06, 0.02), uSea.x * 0.6);
  tip = mix(tip, vec3(0.70, 0.60, 0.30), uSea.y * 0.8); mid = mix(mid, vec3(0.40, 0.36, 0.14), uSea.y * 0.7);
  tip = mix(tip, vec3(0.26, 0.55, 0.08), uSea.z * 0.6);
  vMdC = mix(root, mid, smoothstep(0.0, 0.45, t));
  vMdC = mix(vMdC, tip, smoothstep(0.35, 1.0, t));
  vMdC *= 0.9 + 0.2 * aI.z;
  }`);
    sh.fragmentShader = 'varying vec3 vMdC;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vMdC;');
    try { FSH.shadeInject(sh); } catch (e) { /* без теней домов */ }
  };
  m.customProgramCacheKey = () => 'meadow';
  return m;
}
function makeLayer (cfg, near, seed) {
  const [T0, n, nb, fade] = cfg;
  const L = { T: T0, n, nb, fade, near };
  const g = clumpGeo(nb, seed, near);
  instAttr(g, n, seed * 7 + 1);
  const mesh = new THREE.Mesh(g, grassMat(L));
  mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.renderOrder = 1;
  A.scene.add(mesh);                                 // видим сразу (пока маски нет — сжато в точки): программу соберёт прогрев
  L.mesh = mesh;
  return L;
}
function level () {
  if (NO_BLADES) return 0;
  let k = 3;
  try { const D = GFX.detail(); k = D.meadow ?? 3; } catch (e) { /* — */ }
  if (MOBILE) k = Math.min(k, 1);
  return k;
}
function setLevel (k) {
  for (const L of LAYERS) { A.scene.remove(L.mesh); L.mesh.geometry.dispose(); L.mesh.material.dispose(); }
  LAYERS.length = 0;
  ST.level = k; ST.inst = 0;
  MU.uMdCover.value.z = 0;
  if (!k) return;
  const nc = MEADOW.NEAR[k], fc = MEADOW.FAR[k];
  if (nc) LAYERS.push(makeLayer(MOBILE ? [nc[0], Math.round(nc[1] * 0.7), nc[2], nc[3]] : nc, true, 11));
  if (fc) LAYERS.push(makeLayer(fc, false, 23));
  for (const L of LAYERS) ST.inst += L.n * L.n;
}

/* ── подключение (game.js): init — после склейки статики; groundMat(litMat) — материал земли; step — каждый кадр ── */
export function init (api) {
  if (OLD) { ST.off = 'oldgrass'; return; }
  const R = api.renderer;
  const ok = R.capabilities.isWebGL2 && (R.extensions.has('EXT_color_buffer_float') || R.extensions.has('EXT_color_buffer_half_float'));
  if (!ok) { ST.off = 'no float target'; return; }
  A = api;
  const N = MEADOW.MASK.N;
  RT = new THREE.WebGLRenderTarget(N, N, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, generateMipmaps: false });
  RT.texture.name = 'meadowMask';
  MU.uMdMap.value = RT.texture; MU.uMdN.value = N;
  MCAM = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000);
  MMAT = maskMat(); PMAT = pathMat(); KMAT = killMat();
  // дорожки рисуются в маску только через ~1,5 с езды — их программу собрать сейчас, под загрузкой (2г17: новая программа на ходу)
  try {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(9, 3)); g.setAttribute('aAng', new THREE.Float32BufferAttribute(3, 1));
    const R = api.renderer, prev = R.getRenderTarget();
    R.setRenderTarget(RT); R.compile(new THREE.Mesh(g, PMAT), MCAM); R.setRenderTarget(prev);
    g.dispose();
  } catch (e) { /* — */ }
}
export function groundMat (m) { GROUND = m; }
/* середина маски и плиток травы — впереди камеры */
function ahead (cam, k) {
  const P = DEBUG.pose;                              // проверки (кадры с камерой «руками»): [x, y, z, куда x, y, z]
  if (P) { const fx = P[3] - P[0], fz = P[5] - P[2], l = Math.hypot(fx, fz) || 1; return [P[0] + fx / l * k, P[2] + fz / l * k]; }
  const e = cam.matrixWorld.elements, fx = -e[8], fz = -e[10], l = Math.hypot(fx, fz) || 1;
  return [cam.position.x + fx / l * k, cam.position.z + fz / l * k];
}
export function step (dt) {
  if (!A || !GROUND) return;
  T += dt;
  const cam = A.cam, H = MEADOW.MASK.HALF;
  // дорожки: собираем, когда их число перестало расти (поздняя сборка дописывает)
  const np = (A.CITY && A.CITY.paths && A.CITY.paths.length) || 0;
  if (np !== PN) { PN = np; PSTABLE = T; }
  else if (PSTABLE >= 0 && T - PSTABLE > 1.5) { buildPaths(); PSTABLE = -1; LAST.t = -1e9; }
  const [cx, cz] = ahead(cam, H * MEADOW.MASK.AHEAD);
  if (Math.hypot(cx - LAST.x, cz - LAST.z) > MEADOW.MASK.MOVE || T - LAST.t > MEADOW.MASK.REFRESH) {
    LAST.x = cx; LAST.z = cz; LAST.t = T;
    drawMask(cx, cz);
  }
  const k = level();
  if (k !== ST.level) setLevel(k);
  if (!LAYERS.length) return;
  GU.uTime.value = T;
  const V = A.car;
  if (V) GU.uCar.value.set(V.x, V.z, 1, 0);
  // Сухая трава — по той же кривой, что газон: после зимы не зеленеет раньше земли (2г18).
  const snow = snowAmt();
  const spring = Math.min(1, mudAmt() * 1.5);
  GU.uSea.value.set(dryAmt(), heatAmt(), spring, snow);
  { const L = LAYERS[LAYERS.length - 1]; MU.uMdCover.value.set(L.fade[0], L.fade[1], snow < 0.45 ? 1 : 0); }
  let dk = 1;
  try { dk = Math.max(0.35, Math.min(1, GFX.detail().meadowK ?? 1)); } catch (e) { /* — */ }
  for (const L of LAYERS) {
    const [tx, tz] = ahead(cam, L.T * 0.3);
    L.U.uTile.value.set(tx, tz, L.T);
    L.U.uDens.value += (dk - L.U.uDens.value) * Math.min(1, dt * 0.8);   // кадр тяжёлый (tune.js «облегчение») — реже, без пересборки; плавно за ~2 с (2г17)
    L.mesh.visible = snow < 0.45;
  }
}
/* трава газона рисуется здесь — старые пучки (lawnprops.js 'grass') не нужны */
export const active = () => LAYERS.length > 0 && MU.uMdOn.value > 0;
export const DEBUG = {
  pose: null,
  stats: () => ({ ...ST, on: MU.uMdOn.value, win: [Math.round(MU.uMdWin.value.x), Math.round(MU.uMdWin.value.y)] }),
  get MEADOW () { return MEADOW; }, MU, GU, redraw: () => { LAST.t = -1e9; }, setLevel: k => setLevel(k), get layers () { return LAYERS; },
  /* вся маска картинкой (для проверок глазами): зелёный — газон, серый — высота, синий — дорожка */
  dbg (k) { MMAT.uniforms.uDbg.value = k; LAST.t = -1e9; },
  image (raw) {
    if (!RT) return null;
    const N = MEADOW.MASK.N, b = new Uint16Array(N * N * 4);
    A.renderer.readRenderTargetPixels(RT, 0, 0, N, N, b);
    const cv = document.createElement('canvas'); cv.width = cv.height = N;
    const cx = cv.getContext('2d'), im = cx.createImageData(N, N), f = THREE.DataUtils.fromHalfFloat;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4, o = ((N - 1 - y) * N + x) * 4, h = f(b[i + 1]);
      if (raw) { im.data[o] = Math.pow(f(b[i]), 1 / 2.2) * 255; im.data[o + 1] = Math.pow(h, 1 / 2.2) * 255; im.data[o + 2] = Math.pow(f(b[i + 2]), 1 / 2.2) * 255; im.data[o + 3] = 255; continue; }
      im.data[o] = 128 + h * 20; im.data[o + 1] = f(b[i]) * 255; im.data[o + 2] = f(b[i + 3]) * 255; im.data[o + 3] = 255;
    }
    cx.putImageData(im, 0, 0);
    return cv.toDataURL('image/png');
  },
  /* маска в точке мира: [газон, высота над uRefY, —, направление дорожки] (для проверок) */
  sample (x, z) {
    if (!RT) return null;
    const N = MEADOW.MASK.N, w = MU.uMdWin.value, u = Math.floor(((x - w.x) * w.z + 0.5) * N), v = Math.floor(((z - w.y) * w.z + 0.5) * N);
    if (u < 0 || v < 0 || u >= N || v >= N) return null;
    const b = new Uint16Array(4);
    A.renderer.readRenderTargetPixels(RT, u, v, 1, 1, b);
    return Array.from(b, h => +THREE.DataUtils.fromHalfFloat(h).toFixed(3));
  },
};
