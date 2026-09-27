/* ──────────────────────────────────────────────────────────────────────────
   Времена года.

   Сезон — число от 0 до 4: 0 — начало лета, 1 — осень, 2 — зима, 3 — весна.
   Каждая смена (не «просто покататься») сдвигает его на SEASON_STEP, полный
   сезон — восемь смен, год — тридцать две. Хранится в dlv-season, ?season=2.4
   ставит своё значение и ничего не сохраняет.

   Статика города склеена в меши один раз при загрузке, поэтому сезон в ней
   не «запечён», а считается в шейдере по общим юниформам:
   • земля, крыши, дороги (LITM), реквизит (LIT) и мелочь дворов (SMASH):
     снег на всём, что смотрит вверх (пятнами, пока снега мало), жухлая
     трава осенью, грязь и свежая зелень весной, мокрый асфальт, лёд на реке;
   • деревья — свои склейки (PILE) с атрибутом aux: вид куска и зерно.
     Кроны осенью желтеют и по одной пропадают (зерно выше доли листвы —
     вершины уходят в точку), под деревьями по зерну появляются листья,
     зимой — сугробы вдоль улиц и во дворах. Ель и сосна зелёные всегда;
   • гирлянды — ещё одна склейка без света, мигают, ночью ярче.
   Смена сезона между сменами — это только новые значения юниформ, города
   заново не собираем. Ледяные горки и снеговики — вещи из SMASH (их можно
   снести), вне зимы их вершины схлопнуты, к зиме возвращаются.

   Живое: люди одеваются по сезону (people.js, setPeopleSeason), зимой во
   дворах играют в снежки, идёт снег вместо дождя, сцепление хуже, небо
   бледнее; ёлки не пускают машину, сугробы тормозят.
   ────────────────────────────────────────────────────────────────────────── */

import { t } from '../i18n/index.js';
import { setPeopleSeason } from './people.js';

export const SEASON_STEP = 0.125;          // на столько сдвигает сезон одна смена: сезон — восемь смен
const CH = 100;                             // клетка склейки, как у статики

let C = null;                               // что дала игра (init)
let SEA = 0, FORCED = false;
let THREE = null;

/* ─── кривые: сколько чего при данном сезоне ─── */
const curve = pts => s => {
  for (let i = 1; i < pts.length; i++) if (s <= pts[i][0]) {
    const [a, va] = pts[i - 1], [b, vb] = pts[i];
    return va + (vb - va) * (b > a ? (s - a) / (b - a) : 1);
  }
  return pts[pts.length - 1][1];
};
const K = {
  snow: curve([[0, 0], [1.7, 0], [2.08, 1], [2.8, 1], [3.25, 0], [4, 0]]),
  leaf: curve([[0, 1], [1.25, 1], [1.85, 0], [3.08, 0], [3.5, 1], [4, 1]]),
  yellow: curve([[0, 0], [0.8, 0], [1.45, 1], [2.95, 1], [3.0, 0], [4, 0]]),
  fresh: curve([[0, 0.25], [0.45, 0], [3.1, 0], [3.45, 1], [4, 0.25]]),
  fallen: curve([[0, 0], [1.1, 0], [1.7, 1], [1.95, 1], [2.2, 0], [4, 0]]),
  dry: curve([[0, 0], [0.7, 0.12], [1.05, 0.45], [1.6, 1], [2.9, 1], [3.15, 0], [4, 0]]),
  mud: curve([[0, 0], [2.85, 0], [3.1, 1], [3.45, 0], [4, 0]]),
  wet: curve([[0, 0], [1.5, 0], [1.8, 0.5], [2.0, 0], [2.8, 0], [3.12, 1], [3.5, 0.35], [3.8, 0], [4, 0]]),
  drift: curve([[0, 0], [1.92, 0], [2.2, 1], [2.8, 1], [3.1, 0], [4, 0]]),
  ice: curve([[0, 0], [2.02, 0], [2.3, 1], [2.85, 1], [3.0, 0], [4, 0]]),
  ny: curve([[0, 0], [1.9, 0], [2.02, 1], [2.72, 1], [2.85, 0], [4, 0]]),
  warm: curve([[0, 0], [0.82, 0], [1.3, 0.45], [1.8, 0.78], [2.02, 1], [2.8, 1], [3.2, 0.62], [3.6, 0.3], [3.9, 0], [4, 0]]),
};
const A = {};                                // текущие доли (apply)

/* название: три части на сезон */
const NAMES = () => [t('начало лета'), t('разгар лета'), t('конец лета'), t('ранняя осень'), t('золотая осень'), t('поздняя осень'),
  t('начало зимы'), t('разгар зимы'), t('конец зимы'), t('ранняя весна'), t('разгар весны'), t('поздняя весна')];
export const seasonName = (s = SEA) => NAMES()[Math.floor(((s % 4) + 4) % 4 * 3) % 12];
export const seasonValue = () => SEA;
/* насколько скользко: зимой — как лёгкий дождь */
export const slip = () => (A.snow || 0) * 0.32;
/* идёт ли вместо дождя снег */
export const snowy = () => (A.snow || 0) > 0.45;

/* ─── юниформы: общие для всех сезонных материалов ─── */
const U = {
  uSnow: { value: 0 }, uDry: { value: 0 }, uMud: { value: 0 }, uFresh: { value: 0 }, uWet: { value: 0 },
  uLeaf: { value: 1 }, uYellow: { value: 0 }, uFallen: { value: 0 }, uDrift: { value: 0 }, uNY: { value: 0 }, uIce: { value: 0 },
  uTime: { value: 0 }, uNight: { value: 0 },
};

/* Снег и краски земли. Нормаль грани — из производных мировой позиции:
   она всегда смотрит на камеру, поэтому у земли и крыш y > 0, у стен ~0.
   Классы по цвету вершины (цвета линейные): зелёное — трава, серое и
   тёмное — асфальт, синее — вода. */
const TINT = `
uniform float uSnow, uDry, uMud, uFresh, uWet;
varying vec3 vSW;
float sHash (vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sNoise (vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash(i), sHash(i + vec2(1.0, 0.0)), f.x), mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), f.x), f.y); }
vec3 seasonTint (vec3 c, float dryK, float snowK) {
  vec3 N = normalize(cross(dFdx(vSW), dFdy(vSW)));
  float up = smoothstep(0.42, 0.8, N.y);
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float sat = mx - mn, lum = dot(c, vec3(0.3, 0.55, 0.15));
  float green = smoothstep(0.05, 0.18, c.g - max(c.r, c.b)) * dryK;
  float water = smoothstep(0.08, 0.2, c.b - c.r) * step(c.g, c.b);
  float road = (1.0 - smoothstep(0.05, 0.12, sat)) * (1.0 - smoothstep(0.4, 0.62, lum));
  float n = sNoise(vSW.xz * 0.23) * 0.62 + sNoise(vSW.xz * 0.9) * 0.38;
  float g = green * up;
  c = mix(c, vec3(0.36, 0.25, 0.07) * (0.8 + 0.45 * n), uDry * g * 0.85);
  c = mix(c, vec3(0.2, 0.15, 0.07), uMud * g * smoothstep(0.35, 0.65, n) * 0.85);
  c = mix(c, vec3(0.16, 0.52, 0.08), uFresh * g * 0.55);
  c *= 1.0 - uWet * (0.3 * road + 0.12 * g + 0.06) * up * (0.6 + 0.4 * n);
  float lim = uSnow * up * 1.35 * snowK - 0.22;
  float cov = (1.0 - smoothstep(lim - 0.06, lim + 0.06, n)) * (1.0 - water * 0.7);
  cov *= 1.0 - road * 0.55 * (0.45 + 0.55 * n);
  vec3 snowC = mix(vec3(0.88, 0.91, 0.97), vec3(0.46, 0.48, 0.52), road * 0.6);
  c = mix(c, vec3(0.55, 0.7, 0.8), uSnow * water * up * 0.85);
  return mix(c, snowC, cov);
}
`;
const WPOS = 'vSW = (modelMatrix * vec4(transformed, 1.0)).xyz;';

/* статика игры: земля (dry 1), реквизит и мелочь дворов */
export function seasonMat (m, dryK = 1) {
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vSW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + WPOS);
    sh.fragmentShader = TINT + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = seasonTint(diffuseColor.rgb, ' + dryK.toFixed(2) + ', 1.0);');
  };
  m.customProgramCacheKey = () => 'season' + dryK;
  return m;
}

/* деревья, листья, сугробы, ёлки: aux = вид, зерно, палитра осени */
function pileMat () {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute vec4 aux;\nuniform float uLeaf, uFallen, uDrift, uNY;\nvarying vec3 vSW;\nvarying float vK, vP, vSeed;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vK = floor(aux.x * 255.0 + 0.5); vSeed = aux.y; vP = floor(aux.z * 255.0 + 0.5);
        float lim = vK == 1.0 ? uLeaf : vK == 2.0 ? uFallen : vK == 3.0 ? uDrift : vK == 4.0 ? uNY : 2.0;
        if (vSeed >= lim) transformed = vec3(0.0, -3000.0, 0.0);`)
        .replace('#include <project_vertex>', '#include <project_vertex>\n' + WPOS);
    sh.fragmentShader = 'uniform float uYellow;\nvarying float vK, vP, vSeed;\n' + TINT + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      if (vK == 1.0) {
        vec3 pal = vP < 0.5 ? vec3(0.52, 0.33, 0.02) : vP < 1.5 ? vec3(0.55, 0.17, 0.02) : vP < 2.5 ? vec3(0.4, 0.05, 0.02) : vec3(0.3, 0.3, 0.03);
        diffuseColor.rgb = mix(diffuseColor.rgb, pal, clamp(uYellow * 1.7 - vSeed * 0.7, 0.0, 1.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.5, 0.08), uFresh * 0.5);
      }
      diffuseColor.rgb = seasonTint(diffuseColor.rgb, 0.0, vK == 0.0 || vK == 4.0 ? 0.62 : 1.0);`);
  };
  m.customProgramCacheKey = () => 'seasonPile';
  return m;
}

/* гирлянды: без света, мигают каждая лампочка по-своему, ночью ярче */
function garlandMat () {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.userData.glow = 1;                        // игра не темнит его ночью (FLAT_MATS)
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute vec4 aux;\nuniform float uNY;\nvarying float vPh;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vPh = aux.z; if (aux.y >= uNY) transformed = vec3(0.0, -3000.0, 0.0);`);
    sh.fragmentShader = 'uniform float uTime, uNight;\nvarying float vPh;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float tw = 0.5 + 0.5 * sin(uTime * (1.3 + fract(vPh * 7.3) * 2.6) + vPh * 40.0);
      diffuseColor.rgb *= mix(0.6, 1.0, uNight) * mix(0.45, 1.3, tw) + uNight * 0.45 * tw;`);
  };
  m.customProgramCacheKey = () => 'seasonGarland';
  return m;
}

/* ─── своя склейка: клетки по сто метров, позиция + цвет + aux ─── */
function Pile () {
  const cells = new Map();
  const col = new THREE.Color(), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), Sc = new THREE.Vector3();
  let tris = 0;
  function cell (x, z) {
    const k = Math.floor(x / CH) + ',' + Math.floor(z / CH);
    let c = cells.get(k);
    if (!c) cells.set(k, c = { n: 0, cap: 2048, p: new Float32Array(2048 * 3), c: new Uint8Array(2048 * 3), a: new Uint8Array(2048 * 4) });
    return c;
  }
  function room (c, add) {
    if (c.n + add <= c.cap) return;
    while (c.n + add > c.cap) c.cap *= 2;
    const p = new Float32Array(c.cap * 3), cc = new Uint8Array(c.cap * 3), a = new Uint8Array(c.cap * 4);
    p.set(c.p); cc.set(c.c); a.set(c.a);
    c.p = p; c.c = cc; c.a = a;
  }
  return {
    /* tpl — неиндексированные вершины шаблона; поворот: X, потом Z, потом Y */
    add (tpl, x, y, z, sx, sy, sz, rx, ry, rz, hex, kind = 0, seed = 0, pal = 0) {
      const c = cell(x, z), nv = tpl.length / 3;
      room(c, nv);
      M.compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz, 'YZX')), Sc.set(sx, sy, sz));
      const e = M.elements;
      col.set(hex);
      const r = Math.round(col.r * 255), g = Math.round(col.g * 255), b = Math.round(col.b * 255);
      const sd = Math.max(1, Math.min(254, Math.round(seed * 253) + 1));
      for (let i = 0; i < nv; i++) {
        const vx = tpl[i * 3], vy = tpl[i * 3 + 1], vz = tpl[i * 3 + 2], o = c.n * 3, q = c.n * 4;
        c.p[o] = e[0] * vx + e[4] * vy + e[8] * vz + e[12];
        c.p[o + 1] = e[1] * vx + e[5] * vy + e[9] * vz + e[13];
        c.p[o + 2] = e[2] * vx + e[6] * vy + e[10] * vz + e[14];
        c.c[o] = r; c.c[o + 1] = g; c.c[o + 2] = b;
        c.a[q] = kind; c.a[q + 1] = sd; c.a[q + 2] = pal; c.a[q + 3] = 0;
        c.n++;
      }
      tris += nv / 3;
    },
    tris: () => tris,
    build (mat) {
      const out = [];
      for (const c of cells.values()) {
        if (!c.n) continue;
        const g = new THREE.BufferGeometry();
        const pa = new THREE.BufferAttribute(c.p.slice(0, c.n * 3), 3), ca = new THREE.BufferAttribute(c.c.slice(0, c.n * 3), 3, true), aa = new THREE.BufferAttribute(c.a.slice(0, c.n * 4), 4, true);
        g.setAttribute('position', pa); g.setAttribute('color', ca); g.setAttribute('aux', aa);
        g.computeBoundingSphere();
        for (const at of [pa, ca, aa]) at.onUpload(dropArr);
        const m = new THREE.Mesh(g, mat);
        C.scene.add(m);
        out.push(m);
      }
      cells.clear();
      return out;
    },
  };
}
function dropArr () { this.array = null; }

/* шаблоны: коробка, икосаэдр, конус, плашка стоймя (+Z) и лёжа (вверх) */
let TPL = null;
function tpls () {
  if (TPL) return TPL;
  const arr = g => { const a = (g.index ? g.toNonIndexed() : g).attributes.position.array; return Float32Array.from(a); };
  TPL = {
    box: arr(new THREE.BoxGeometry(1, 1, 1)), ico: arr(new THREE.IcosahedronGeometry(1, 0)),
    cone: arr(new THREE.ConeGeometry(1, 1, 7, 1, true)), quad: arr(new THREE.PlaneGeometry(1, 1)),
    flat: arr(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
  };
  return TPL;
}

/* детерминированный шум от точки: одно и то же дерево на одном месте */
function hsh (x, z, k = 0) {
  let h = Math.imul(Math.round(x * 16) ^ 0x27d4eb2d, 0x9E3779B1) ^ Math.imul(Math.round(z * 16) + k * 1013904223, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function rngAt (x, z, k = 0) {
  let a = (hsh(x, z, k) * 4294967296) >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let q = a;
    q = Math.imul(q ^ (q >>> 15), q | 1);
    q ^= q + Math.imul(q ^ (q >>> 7), q | 61);
    return ((q ^ (q >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = (a, b) => a + Math.random() * (b - a);
const pickR = (r, a) => a[(r() * a.length) | 0];
function weighted (r, o) {
  let s = 0; for (const k in o) s += o[k];
  let x = r() * s; for (const k in o) if ((x -= o[k]) < 0) return k;
  return Object.keys(o)[0];
}

/* ─────────────── инициализация ─────────────── */
let PILE = null, GARL = null;
const DECID = [], SPRUCES = [], SEA_ITEMS = [], DRIFTS = new Map(), FIRS = [], FIGHT_SPOTS = [];
let MESH_GARL = [], MESH_PILE = [];
const BUILT = { trees: 0, pile: 0, garl: 0, drifts: 0, bulbs: 0, items: 0 };

/* ctx: THREE, scene, cam, renderer, Store, MAP, CITY, V, S, groundH, curbAt, nearestRoad, roadWidth, drivable,
   inHouse, inPoly, inBounds, put, smashAdd, SMASH, SM_WORD, SMASH_MAT, LAMP_SPOTS, ZEBRAS, NODE_IDX, nodeDeg,
   makeHuman, dropMesh, gibHuman, toast, Snd, CAR_L, CAR_W, isPlaying, sayBubble; геттеры: PIZZA, ENV, rainLines, hemi */
export function initSeasons (ctx) {
  C = ctx; THREE = ctx.THREE;
  const q = new URLSearchParams(location.search).get('season');
  if (q !== null && q !== '' && !Number.isNaN(+q)) { SEA = wrap(+q); FORCED = true; }
  else SEA = wrap(+C.Store.get('dlv-season', 0) || 0);
  PILE = Pile(); GARL = Pile();
  seasonMat(C.SMASH_MAT, 0.6);
  C.SM_WORD.ice = t('ледяная горка');
  C.SM_WORD.snowman = t('снеговик');
  apply();
}

/* сдвинуть сезон: новая смена */
export function advanceSeason () {
  if (FORCED) return;
  const was = seasonName();
  SEA = wrap(SEA + SEASON_STEP);
  C.Store.set('dlv-season', SEA);
  apply();
  const now = seasonName();
  if (now !== was) C.toast(t('на дворе {s}', { s: now }));
}
export function setSeason (v) { SEA = wrap(+v); FORCED = true; apply(); }
function wrap (v) { return Math.round(((v % 4) + 4) % 4 * 1000) / 1000 % 4; }

function apply () {
  for (const k in K) A[k] = K[k](SEA);
  U.uSnow.value = A.snow; U.uDry.value = A.dry; U.uMud.value = A.mud; U.uFresh.value = A.fresh; U.uWet.value = A.wet;
  U.uLeaf.value = A.leaf; U.uYellow.value = A.yellow; U.uFallen.value = A.fallen; U.uDrift.value = A.drift;
  U.uNY.value = A.ny; U.uIce.value = A.ice;
  setPeopleSeason(A.warm);
  for (const m of MESH_GARL) m.visible = A.ny > 0.001;
  // ледяные горки и снеговики: вне зимы вершины — в точку
  for (const it of SEA_ITEMS) {
    if (!it.mesh || !it.seaPos) continue;
    const want = it.seaSeed < A.ice;
    const pos = it.mesh.geometry.attributes.position, a = pos.array;
    if (!a) continue;
    if (!want && !it.down) {
      const gy = C.groundH(it.x, it.z);
      for (let i = it.v0; i < it.v0 + it.nv; i++) { a[i * 3] = it.x; a[i * 3 + 1] = gy - 1; a[i * 3 + 2] = it.z; }
      it.down = 1; it.seaOff = 1; pos.needsUpdate = true;
    } else if (want && it.seaOff) {
      a.set(it.seaPos, it.v0 * 3);
      it.down = 0; it.seaOff = 0; pos.needsUpdate = true;
    }
  }
}

/* ─────────────── деревья ───────────────
   Вид — от точки: в Москве больше лип, клёнов и тополей, в Северске
   (Сибирь) — берёзы, ели и сосны. Ствол и голые ветки есть всегда, в
   кроне — две-четыре шапки, у каждой своё зерно: осенью пропадают по
   одной. Под лиственными — пятна листьев (вид 2, осенью). */
const W_MSK = { lime: 34, maple: 14, birch: 14, poplar: 11, spruce: 11, pine: 4, bush: 12 };
const W_SVK = { birch: 34, spruce: 22, pine: 17, lime: 8, poplar: 8, bush: 11 };
const GREENS = ['#5aa04a', '#6fb05a', '#4f9443', '#62a84f'];

export function seasonTree (x, z, y) {
  const T = tpls(), r = rngAt(x, z, 7), P = PILE;
  const kind = weighted(r, C.MAP.id === 'seversk' ? W_SVK : W_MSK);
  const s = 0.82 + r() * 0.4, yaw = r() * 6.283;
  BUILT.trees++;
  const trunk = (w, h, hex) => P.add(T.box, x, y + h / 2 - 0.2, z, w * s, h * s + 0.2, w * s, 0, yaw, 0, hex);
  const branch = (y0, len, tilt, a, w, hex) => {
    // ветка от ствола: наклон tilt, по кругу a; центр — на середине длины
    const dx = -Math.sin(tilt) * Math.cos(a + yaw), dy = Math.cos(tilt), dz = Math.sin(tilt) * Math.sin(a + yaw);
    P.add(T.box, x + dx * len / 2 * s, y + (y0 + dy * len / 2) * s, z + dz * len / 2 * s, w * s, len * s, w * s, 0, a + yaw, tilt, hex);
  };
  const crown = (ox, oy, oz, rr, sy, hex, pal) => P.add(T.ico, x + ox * s, y + oy * s, z + oz * s, rr * s, rr * s * sy, rr * s, 0, r() * 6.283, 0, hex, 1, r(), pal);
  const leaves = (hexes, n, rad) => {
    for (let i = 0; i < n; i++) {
      const a = r() * 6.283, d = 0.4 + r() * rad, lx = x + Math.cos(a) * d, lz = z + Math.sin(a) * d;
      const sz = 0.6 + r() * 0.8, ly = C.groundH(lx, lz) + C.curbAt(lx, lz) + 0.1;
      P.add(T.flat, lx, ly, lz, sz, 1, sz * (0.6 + r() * 0.6), 0, r() * 6.283, 0, pickR(r, hexes), 2, r());
    }
  };
  const YEL = ['#e8b830', '#f0c848', '#d8a028'], ORA = ['#e8902a', '#d86a22', '#f0a838'], RED = ['#c84a24', '#d86a22', '#b83a22'];
  if (kind === 'lime' || kind === 'maple') {
    const pal = kind === 'maple' ? (r() < 0.6 ? 1 : 2) : r() < 0.7 ? 0 : 1;
    trunk(0.5, 3.1, '#7a5a3c');
    for (let i = 0; i < 3; i++) branch(2.3 + r() * 0.5, 1.8 + r() * 0.5, 0.55 + r() * 0.35, i * 2.1 + r() * 0.6, 0.15, '#6a4c32');
    const g = pickR(r, GREENS);
    crown(0, 4.1, 0, 1.85, 1, g, pal);
    crown(0.5, 5.2, -0.35, 1.3, 1, '#6fb05a', pal);
    crown(-0.7, 4.6, 0.6, 1.2, 0.9, g, pal);
    leaves(pal === 0 ? YEL : pal === 1 ? ORA : RED, 5, 3.2);
    DECID.push([x, z]);
  } else if (kind === 'birch') {
    trunk(0.32, 5.8, '#ece8de');
    for (const [hy, sd] of [[1.3, 1], [3.0, -1]]) P.add(T.box, x + sd * 0.04 * s, y + hy * s, z, 0.34 * s, 0.09 * s, 0.22 * s, 0, yaw, 0, '#2b2a30');
    for (let i = 0; i < 3; i++) branch(3.4 + i * 0.7, 1.3 + r() * 0.5, 0.45 + r() * 0.35, i * 1.9 + r(), 0.09, '#d8d2c6');
    const g = r() < 0.5 ? '#7fbf5a' : '#8cc862';
    crown(0, 4.4, 0, 1.15, 1.35, g, 0);
    crown(0.25, 5.6, 0.2, 1.0, 1.4, '#94cc6a', 0);
    crown(-0.2, 6.6, -0.1, 0.75, 1.3, g, 0);
    leaves(YEL, 4, 2.6);
    DECID.push([x, z]);
  } else if (kind === 'poplar') {
    trunk(0.45, 2.6, '#6a5a48');
    branch(2.0, 3.2, 0.18, r() * 6.28, 0.14, '#5a4a3a'); branch(2.3, 3.4, 0.2, r() * 6.28 + 3, 0.14, '#5a4a3a'); branch(3.0, 3.0, 0.12, r() * 6.28, 0.12, '#5a4a3a');
    crown(0, 5.0, 0, 1.35, 2.2, '#4f8f3f', 3);
    crown(0.1, 7.4, 0.1, 1.0, 1.7, '#5a9a48', 0);
    leaves(['#c8b840', '#e0c040'], 3, 2.2);
    DECID.push([x, z]);
  } else if (kind === 'bush') {
    for (let i = 0; i < 3; i++) branch(0, 2.2, 0.28, i * 2.1 + r(), 0.16, '#6a4c32');
    const pal = r() < 0.5 ? 2 : 1;
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + r(); crown(Math.sin(a) * 0.75, 2.1 + r() * 0.6, Math.cos(a) * 0.75, 0.95 + r() * 0.3, 0.9, pickR(r, GREENS), pal); }
    leaves(pal === 2 ? RED : ORA, 3, 2.0);
    DECID.push([x, z]);
  } else if (kind === 'spruce') {
    const hs = 0.85 + r() * 0.5;
    trunk(0.36, 1.4, '#5a4030');
    const L = [[2.3, 1.0], [1.85, 2.2], [1.4, 3.3], [0.9, 4.3]];
    L.forEach(([rr, b], i) => P.add(T.cone, x, y + (b + 1.0) * s * hs, z, rr * s, 2.0 * s * hs, rr * s, 0, yaw + i * 0.45, 0, i % 2 ? '#357341' : '#2f6a3a'));
    SPRUCES.push({ x, z, y, s, hs });
  } else {                                           // сосна: высокий рыжий ствол, крона наверху
    trunk(0.38, 7.2, '#a0603a');
    branch(5.6, 1.6, 1.0, r() * 6.28, 0.14, '#8a5030'); branch(6.2, 1.4, 0.9, r() * 6.28 + 2.5, 0.12, '#8a5030');
    P.add(T.ico, x, y + 7.5 * s, z, 1.7 * s, 0.75 * s, 1.7 * s, 0, yaw, 0, '#3f7a3f');
    P.add(T.ico, x + 0.8 * s, y + 6.7 * s, z + 0.3 * s, 1.25 * s, 0.6 * s, 1.25 * s, 0, yaw, 0, '#467f44');
    P.add(T.ico, x - 0.6 * s, y + 8.2 * s, z - 0.4 * s, 1.0 * s, 0.55 * s, 1.0 * s, 0, yaw, 0, '#3a7240');
  }
}

/* ─────────────── двор: ледяные горки и снеговики (до smashBuild) ─────────────── */
export function seasonYard () {
  const { CITY, put, smashAdd, SMASH, groundH, inHouse, inPoly, inBounds, nearestRoad } = C;
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const free = (x, z, m) => {
    if (!inBounds(x, z, -20) || inHouse(x, z, m)) return false;
    const n = nearestRoad(x, z, 7, 1);
    return !(n && n.d < n.seg.w / 2 + m + 1);
  };
  const nearSmash = (x, z, d) => SMASH.some(it => Math.abs(it.x - x) < d && Math.abs(it.z - z) < d);
  const track = () => { const it = SMASH[SMASH.length - 1]; it.seaSeed = 0.02 + hsh(it.x, it.z, 3) * 0.9; SEA_ITEMS.push(it); };
  const slideAt = (x, z, ry, big) => {
    const k = big ? 1.35 : 1, gy = groundH(x, z), g = [];
    const W = (lx, lz) => [x + lx * Math.cos(ry) + lz * Math.sin(ry), z - lx * Math.sin(ry) + lz * Math.cos(ry)];
    const H = 1.8 * k, L = 5.2 * k, tilt = Math.atan2(H - 0.1, L);
    let [px, pz] = W(0, 0);
    put(g, B(2.4 * k, H, 2.4 * k), '#dfe6ee', px, gy + H / 2, pz, 0, ry, 0);
    for (let i = 0; i < 3; i++) { [px, pz] = W(0, -1.2 * k - 0.4 - i * 0.45); put(g, B(1.2, H * (0.75 - i * 0.25), 0.5), '#d6dee8', px, gy + H * (0.75 - i * 0.25) / 2, pz, 0, ry, 0); }
    const cz = 1.2 * k + Math.cos(tilt) * L / 2;
    [px, pz] = W(0, cz); put(g, B(1.3, 0.28, L), '#a8d8f0', px, gy + H / 2 - 0.05, pz, tilt, ry, 0);
    for (const sd of [-1, 1]) { [px, pz] = W(sd * 0.78, cz); put(g, B(0.26, 0.55, L), '#dfe6ee', px, gy + H / 2 + 0.12, pz, tilt, ry, 0); }
    [px, pz] = W(0, 1.2 * k + L + 1.4); put(g, B(1.3, 0.06, 3), '#9fd0ea', px, gy + 0.06, pz, 0, ry, 0);
    [px, pz] = W(0, (1.2 * k + L) / 2 - 0.3);
    smashAdd('ice', px, pz, 2.2 * k, g, '#dfe6ee');
    track();
    FIGHT_SPOTS.push({ x: x + 5, z: z + 5, slide: { x, z, ry, H, L, k } });
  };
  // площадки: горка рядом с песочницей; большие парки — побольше
  let slides = 0;
  for (const pl of CITY.green) {
    if ((pl.k !== 'play' && pl.k !== 'park') || slides > 80) continue;
    let cx = 0, cz = 0;
    for (const q of pl.p) { cx += q[0] / pl.p.length; cz += q[1] / pl.p.length; }
    const r = rngAt(cx, cz, 11);
    for (let tr = 0; tr < 8; tr++) {
      const a = r() * 6.283, d = 5 + r() * 6, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (!inPoly(x, z, pl.p) || !free(x, z, 3.2) || nearSmash(x, z, 4.5)) continue;
      slideAt(x, z, r() * 6.283, pl.k === 'park');
      slides++;
      break;
    }
  }
  // снеговики: у части подъездов, в скверах и парках
  let men = 0;
  const man = (x, z, ry) => {
    if (!free(x, z, 1.2) || nearSmash(x, z, 1.6)) return;
    const gy = groundH(x, z), g = [], r = rngAt(x, z, 5), k = 0.8 + r() * 0.45;
    const I = rr => new THREE.IcosahedronGeometry(rr * k, 1);
    put(g, I(0.62), '#e8edf3', x, gy + 0.5 * k, z);
    put(g, I(0.45), '#e8edf3', x, gy + 1.25 * k, z);
    put(g, I(0.32), '#e8edf3', x, gy + 1.82 * k, z);
    const fx = Math.sin(ry), fz = Math.cos(ry);
    put(g, new THREE.ConeGeometry(0.07 * k, 0.4 * k, 5), '#e8752a', x + fx * 0.45 * k, gy + 1.8 * k, z + fz * 0.45 * k, Math.PI / 2, ry, 0);
    for (const sd of [-1, 1]) put(g, B(0.07, 0.07, 0.05), '#1f1c1a', x + fx * 0.28 * k + fz * sd * 0.11 * k, gy + 1.93 * k, z + fz * 0.28 * k - fx * sd * 0.11 * k, 0, ry, 0);
    put(g, new THREE.CylinderGeometry(0.2 * k, 0.26 * k, 0.3 * k, 7), pickR(r, ['#d95d5d', '#4f7fd6', '#e0b13f', '#59b06a']), x, gy + 2.16 * k, z, 0.2, ry, 0);
    for (const sd of [-1, 1]) put(g, B(0.05, 0.05, 0.8 * k), '#6a4c32', x + fz * sd * 0.62 * k, gy + 1.35 * k, z - fx * sd * 0.62 * k, 0.5, ry + sd * 1.57, 0);
    smashAdd('snowman', x, z, 0.75 * k, g, '#e8edf3');
    track();
    men++;
  };
  const E = CITY.entrances;
  for (let i = 0; i < E.length && men < 110; i++) {
    const [ex, ez, nx, nz] = E[i];
    if (hsh(ex, ez, 9) > 0.1) continue;
    const s = hsh(ex, ez, 2) < 0.5 ? 1 : -1;
    man(ex + nx * 5 + nz * 3.5 * s, ez + nz * 5 - nx * 3.5 * s, Math.atan2(nx, nz));
  }
  for (const pl of CITY.green) {
    if ((pl.k !== 'park' && pl.k !== 'green') || men > 150) continue;
    let cx = 0, cz = 0;
    for (const q of pl.p) { cx += q[0] / pl.p.length; cz += q[1] / pl.p.length; }
    if (hsh(cx, cz, 4) > (pl.k === 'park' ? 0.8 : 0.22) || !inPoly(cx, cz, pl.p)) continue;
    man(cx + 2, cz - 1.5, hsh(cx, cz, 8) * 6.28);
  }
  BUILT.items = SEA_ITEMS.length;
}

/* ─────────────── сугробы, ёлки, гирлянды — в конце сборки города ─────────────── */
export function seasonBuild () {
  const { CITY, groundH, curbAt, nearestRoad, roadWidth, drivable, inHouse, inPoly, inBounds, ZEBRAS, NODE_IDX, nodeDeg, LAMP_SPOTS } = C;
  const T = tpls(), P = PILE, G = GARL;
  const svk = C.MAP.id === 'seversk';
  // копии вершин горок и снеговиков: чтобы вернуть их к зиме
  for (const it of SEA_ITEMS) if (it.mesh) it.seaPos = it.mesh.geometry.attributes.position.array.slice(it.v0 * 3, (it.v0 + it.nv) * 3);

  // ── сугробы вдоль улиц: за тротуаром, у перекрёстков и зебр не наваливаем
  const DRIFT_HEX = '#e6ebf2';
  const drift = (x, z, L, H, W, ry, seed) => {
    P.add(T.ico, x, groundH(x, z) + 0.08, z, W, H, L, 0, ry, 0, DRIFT_HEX, 3, seed);
    const k = Math.floor(x / 20) + ',' + Math.floor(z / 20);
    if (!DRIFTS.has(k)) DRIFTS.set(k, []);
    DRIFTS.get(k).push({ x, z, r: Math.min(L, W) * 0.9 + 0.3, seed: Math.max(1, Math.min(254, Math.round(seed * 253) + 1)) / 255 });
    BUILT.drifts++;
  };
  const CAP = svk ? 2200 : 1100;
  for (const rd of CITY.roads) {
    if (BUILT.drifts > CAP) break;
    if (!drivable(rd) || rd.b || rd.c > 5) continue;
    const off = roadWidth(rd) / 2 + 2.75 + 1.1;
    for (let i = 1; i < rd.p.length; i++) {
      const [x1, z1] = rd.p[i - 1], [x2, z2] = rd.p[i];
      const len = Math.hypot(x2 - x1, z2 - z1) || 1, ux = (x2 - x1) / len, uz = (z2 - z1) / len, ry = Math.atan2(ux, uz);
      const nA = NODE_IDX.get(x1 + ',' + z1), nB = NODE_IDX.get(x2 + ',' + z2);
      const endA = nA !== undefined && nodeDeg(nA) >= 3, endB = nB !== undefined && nodeDeg(nB) >= 3;
      for (let d = 4; d < len - 3; d += 8) {
        if ((endA && d < 13) || (endB && len - d < 13)) continue;
        for (const sd of [-1, 1]) {
          const x = x1 + ux * d - uz * off * sd, z = z1 + uz * d + ux * off * sd, h = hsh(x, z, 1);
          if (h > 0.72 || !inBounds(x, z, -20) || inHouse(x, z, 1.4)) continue;
          const n = nearestRoad(x, z, 7, 1);
          if (n && n.d < n.seg.w / 2 + 3.2) continue;
          if (ZEBRAS.some(q => Math.abs(q.x - x) < 9 && Math.abs(q.z - z) < 9)) continue;
          const r = rngAt(x, z, 6);
          drift(x, z, 1.5 + r() * 1.6, 0.45 + r() * 0.45, 0.8 + r() * 0.5, ry, r());
          if (r() < 0.4) drift(x + ux * 2.2, z + uz * 2.2, 0.9 + r() * 0.7, 0.35 + r() * 0.3, 0.7 + r() * 0.3, ry + 0.4, r());
        }
      }
    }
  }
  // во дворах и парках
  let yd = 0;
  for (const pl of CITY.green) {
    if (yd > (svk ? 1000 : 500)) break;
    if (pl.k === 'water' || pl.k === 'pitch') continue;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const q of pl.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    const r = rngAt(x0, z0, 12), n = Math.min(8, Math.round((x1 - x0) * (z1 - z0) / 500));
    for (let i = 0; i < n; i++) {
      const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
      if (!inPoly(x, z, pl.p) || !inBounds(x, z, -20) || inHouse(x, z, 1.5)) continue;
      const nr = nearestRoad(x, z, 7, 1);
      if (nr && nr.d < nr.seg.w / 2 + 2) continue;
      drift(x, z, 1.2 + r() * 2.2, 0.4 + r() * 0.6, 1.0 + r() * 1.4, r() * 6.28, r());
      yd++;
    }
  }

  // ── ёлки к Новому году: у пиццерии и в самых больших парках
  const firSpot = (x, z, need) => {
    if (!inBounds(x, z, -10) || inHouse(x, z, 5)) return false;
    const n = nearestRoad(x, z, 7, 1);
    return !(n && n.d < n.seg.w / 2 + need);
  };
  const PZ = C.PIZZA;
  if (PZ) {
    let best = null;
    for (let rr = 18; rr <= 44 && !best; rr += 4)
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * 6.283, x = PZ.bx + Math.cos(a) * rr, z = PZ.bz + Math.sin(a) * rr;
        if (firSpot(x, z, 5)) { best = [x, z]; break; }
      }
    if (best) bigFir(best[0], best[1], 1.15);
  }
  const parks = CITY.green.filter(g => g.k === 'park' || (g.k === 'green' && g.p.length > 6)).map(g => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, cx = 0, cz = 0;
    for (const q of g.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); cx += q[0] / g.p.length; cz += q[1] / g.p.length; }
    return { g, a: (x1 - x0) * (z1 - z0), cx, cz };
  }).sort((a, b) => b.a - a.a);
  let firs = 0;
  for (const p of parks) {
    if (firs >= (svk ? 7 : 4)) break;
    if (p.a < 2500 || !inPoly(p.cx, p.cz, p.g.p) || !firSpot(p.cx, p.cz, 8)) continue;
    if (FIRS.some(f => Math.hypot(f.x - p.cx, f.z - p.cz) < 250)) continue;
    bigFir(p.cx, p.cz, 1);
    firs++;
  }

  // ── гирлянды: по фасадам части домов — провисающими петлями над первым этажом
  const PAL_MULTI = ['#ff5a4a', '#ffd23f', '#5aff7a', '#5aa8ff', '#ff7ae0'], PAL_WARM = ['#ffe6a0', '#ffd98a', '#fff2c8'];
  let bulbs = 0;
  const BULB_CAP = svk ? 16000 : 9000;
  for (const b of CITY.buildings) {
    if (bulbs > BULB_CAP) break;
    if (b.k === 'gar' || b.k === 'ind' || b.k === 'church' || b.p.length < 3) continue;
    let cx = 0, cz = 0;
    for (const q of b.p) { cx += q[0] / b.p.length; cz += q[1] / b.p.length; }
    if (!inBounds(cx, cz, 0) || hsh(cx, cz, 21) > (svk ? 0.16 : 0.24)) continue;
    const r = rngAt(cx, cz, 22), multi = r() < 0.6, seed = 0.02 + r() * 0.95, hy = 3.1 + r() * 0.6;
    for (let i = 0; i < b.p.length; i++) {
      const a = b.p[i], c = b.p[(i + 1) % b.p.length];
      const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 4) continue;
      let nx = dz / len, nz = -dx / len;
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      if (inPoly(mx + nx * 0.5, mz + nz * 0.5, b.p)) { nx = -nx; nz = -nz; }        // наружу
      const ry = Math.atan2(nx, nz), span = 2.6;
      for (let d = 0.4; d < len - 0.3 && bulbs <= BULB_CAP; d += 0.62) {
        const x = a[0] + dx / len * d + nx * 0.14, z = a[1] + dz / len * d + nz * 0.14;
        const f = (d % span) / span, y = groundH(x, z) + hy - 1.6 * f * (1 - f);
        G.add(T.quad, x, y, z, 0.2, 0.2, 1, 0, ry, 0, multi ? PAL_MULTI[(d / 0.62 | 0) % PAL_MULTI.length] : pickR(r, PAL_WARM), 4, seed, (r() * 255) | 0);
        bulbs++;
      }
    }
  }
  // снежинки на фонарях: через один, два креста из лампочек
  let flakes = 0;
  for (let i = 0; i < LAMP_SPOTS.length && flakes < (svk ? 500 : 300); i += 2) {
    const [lx, lz] = LAMP_SPOTS[i];
    if (!inBounds(lx, lz, 0)) continue;
    const gy = groundH(lx, lz), cy = gy + 5.2, seed = 0.02 + hsh(lx, lz, 31) * 0.95, hex = hsh(lx, lz, 32) < 0.5 ? '#bfe4ff' : '#ffd98a';
    for (const plane of [0, Math.PI / 2]) {
      const ux = Math.cos(plane), uz = -Math.sin(plane);
      for (let ln = 0; ln < 3; ln++) {
        const an = ln * Math.PI / 3;
        for (let k = -2; k <= 2; k++) {
          if (!k && (ln || plane)) continue;
          const h = Math.cos(an) * k * 0.26, v = Math.sin(an) * k * 0.26;
          G.add(T.quad, lx + ux * h, cy + v, lz + uz * h, 0.14, 0.14, 1, 0, plane, 0, hex, 4, seed, (hsh(lx + k, lz + ln, 33) * 255) | 0);
          bulbs++;
        }
      }
    }
    flakes++;
  }
  // ели у дорог — в гирлянде спиралью
  for (const f of SPRUCES) {
    if (hsh(f.x, f.z, 41) > 0.32) continue;
    const n = nearestRoad(f.x, f.z, 7, 1);
    if (!n || n.d > 22) continue;
    spiral(f.x, f.z, f.y + 1.1 * f.s * f.hs, 4.6 * f.s * f.hs, 2.5 * f.s, 0.7 * f.s, 34, 0.02 + hsh(f.x, f.z, 42) * 0.95, PAL_MULTI);
  }
  BUILT.bulbs = bulbs;
  BUILT.pile = PILE.tris(); BUILT.garl = GARL.tris();
  MESH_PILE = PILE.build(pileMat());
  MESH_GARL = GARL.build(garlandMat());
  // гирлянды впервые появятся посреди зимы — программы собираем сразу
  C.renderer.compile(C.scene, C.cam);
  apply();
  initSky();
}
function spiral (x, z, y0, H, r0, r1, n, seed, pal) {
  const T = tpls();
  for (let i = 0; i < n; i++) {
    const f = i / n, a = f * 5 * 6.283 + hsh(x, z, 43) * 6.28, rr = r0 + (r1 - r0) * f + 0.12;
    const bx = x + Math.sin(a) * rr, bz = z + Math.cos(a) * rr;
    GARL.add(T.quad, bx, y0 + f * H, bz, 0.26, 0.26, 1, 0, a, 0, pal[i % pal.length], 4, seed, (hsh(bx, bz, 44) * 255) | 0);
  }
}
/* новогодняя ель: ярусы, шары, звезда, гирлянда; стоит только к Новому году (вид 4) */
function bigFir (x, z, k) {
  const T = tpls(), y = C.groundH(x, z), r = rngAt(x, z, 51);
  PILE.add(T.box, x, y + 0.8, z, 0.7 * k, 1.8, 0.7 * k, 0, 0, 0, '#5a4030', 4, 0.01);
  const L = [[4.6, 1.2], [3.9, 3.2], [3.1, 5.1], [2.3, 6.9], [1.5, 8.5], [0.8, 9.8]];
  L.forEach(([rr, b], i) => PILE.add(T.cone, x, y + (b + 1.5) * k, z, rr * k, 3.0 * k, rr * k, 0, i * 0.5, 0, i % 2 ? '#2a6a3a' : '#245e34', 4, 0.01));
  const BALLS = ['#e04836', '#ffd23f', '#4f7fd6', '#e0e0f0', '#c94ad0'];
  for (let i = 0; i < 26; i++) {
    const f = r(), a = r() * 6.283, h = 1.0 + f * 9.0, rr = (4.6 - f * 3.9) * 0.93 * k;
    PILE.add(T.ico, x + Math.sin(a) * rr, y + (h + 0.2) * k, z + Math.cos(a) * rr, 0.28 * k, 0.28 * k, 0.28 * k, 0, 0, 0, BALLS[i % BALLS.length], 4, 0.01);
  }
  // звезда: два ромба крестом
  for (const ry of [0, Math.PI / 2]) GARL.add(T.quad, x, y + 12.2 * k, z, 1.1 * k, 1.1 * k, 1, 0, ry, Math.PI / 4, '#ffcf3a', 4, 0.01, 0);
  spiral(x, z, y + 1.2 * k, 9.4 * k, 4.7 * k, 0.9 * k, 150, 0.01, ['#ff5a4a', '#ffd23f', '#5aff7a', '#5aa8ff', '#ffe6a0']);
  FIRS.push({ x, z, r: 4.2 * k + 1.4 });
}

/* ─────────────── живое: снег с неба, снежки, сугробы под колёсами ─────────────── */
let SNOWF = null, SPLASH = null, SKY = null;
const SF_N = 1600, SP_N = 260;
function initSky () {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(SF_N * 3);
  for (let i = 0; i < SF_N; i++) { p[i * 3] = rnd(-40, 40); p[i * 3 + 1] = rnd(-6, 34); p[i * 3 + 2] = rnd(-40, 40); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false });
  SNOWF = new THREE.Points(g, m);
  SNOWF.frustumCulled = false; SNOWF.visible = false;
  C.scene.add(SNOWF);
  const g2 = new THREE.BufferGeometry();
  g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SP_N * 3).fill(-5000), 3));
  SPLASH = { pts: new THREE.Points(g2, new THREE.PointsMaterial({ color: 0xf4f8fc, size: 3, sizeAttenuation: false })), v: new Float32Array(SP_N * 3), life: new Float32Array(SP_N), i: 0, on: 0 };
  SPLASH.pts.frustumCulled = false;
  C.scene.add(SPLASH.pts);
  SKY = { want: 0, amt: 0, t: rnd(10, 40), bg: new THREE.Color('#c6d0da'), fog: new THREE.Color('#e0e6ec'), gnd: new THREE.Color('#e4ebf2'), aut: new THREE.Color('#b8c6d0') };
  BALL_GEO = new THREE.IcosahedronGeometry(0.13, 0);
  BALL_MAT = new THREE.MeshLambertMaterial({ color: 0xf4f7fa, flatShading: true });
}
function splash (x, y, z, n, k = 1) {
  const S = SPLASH, a = S.pts.geometry.attributes.position.array;
  for (let j = 0; j < n; j++) {
    const i = S.i; S.i = (S.i + 1) % SP_N;
    a[i * 3] = x + rnd(-0.2, 0.2); a[i * 3 + 1] = y; a[i * 3 + 2] = z + rnd(-0.2, 0.2);
    S.v[i * 3] = rnd(-2.2, 2.2) * k; S.v[i * 3 + 1] = rnd(1.5, 4.5) * k; S.v[i * 3 + 2] = rnd(-2.2, 2.2) * k;
    S.life[i] = rnd(0.5, 1.1);
  }
  S.on = 1.3;
}
function stepSplash (dt) {
  const S = SPLASH;
  if (S.on <= 0) return;
  S.on -= dt;
  const a = S.pts.geometry.attributes.position.array;
  for (let i = 0; i < SP_N; i++) {
    if (S.life[i] <= 0) continue;
    S.life[i] -= dt;
    S.v[i * 3 + 1] -= 9.8 * dt;
    a[i * 3] += S.v[i * 3] * dt; a[i * 3 + 1] += S.v[i * 3 + 1] * dt; a[i * 3 + 2] += S.v[i * 3 + 2] * dt;
    if (S.life[i] <= 0) a[i * 3 + 1] = -5000;
  }
  S.pts.geometry.attributes.position.needsUpdate = true;
}

/* снег с неба: вместо дождя, когда земля белая, и сам по себе иногда */
function stepSky (dt) {
  const ENV = C.ENV, rain = C.rainLines, hemi = C.hemi, scene = C.scene;
  const sn = A.snow || 0, night = ENV.night || 0;
  if (sn > 0.45) {
    if ((SKY.t -= dt) <= 0) { SKY.want = SKY.want ? 0 : Math.random() < 0.55 ? rnd(0.3, 0.7) : 0; SKY.t = SKY.want ? rnd(40, 90) : rnd(30, 80); }
    if (rain) rain.visible = false;                      // дождь зимой — это снег
  } else SKY.want = 0;
  const want = sn > 0.45 ? Math.max(SKY.want, ENV.rain || 0) : 0;
  SKY.amt += (want - SKY.amt) * (1 - Math.exp(-0.5 * dt));
  // небо: зимой бледнее, осенью чуть серее, свет от снега снизу
  const day = 1 - night;
  scene.background.lerp(SKY.bg, sn * 0.32 * day);
  if (scene.fog) scene.fog.color.lerp(SKY.fog, sn * 0.42 * day);
  if (A.dry > 0 && sn < 0.5) scene.background.lerp(SKY.aut, A.dry * 0.14 * day * (1 - sn));
  if (hemi) hemi.groundColor.lerp(SKY.gnd, sn * 0.55);
  SNOWF.visible = SKY.amt > 0.02;
  if (!SNOWF.visible) return;
  SNOWF.material.opacity = Math.min(1, SKY.amt * 1.3);
  const cam = C.cam, p = SNOWF.geometry.attributes.position.array, n = Math.floor(SF_N * Math.min(1, 0.25 + SKY.amt));
  SNOWF.position.set(cam.position.x, cam.position.y - 6, cam.position.z);
  SNOWF.geometry.setDrawRange(0, n);
  const fall = (2.2 + SKY.amt * 1.5) * dt, tt = U.uTime.value;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    p[o + 1] -= fall * (0.7 + (i % 5) * 0.12);
    p[o] += Math.sin(tt * 0.9 + i) * 0.4 * dt + 0.5 * dt;
    if (p[o + 1] < -6) { p[o + 1] = 34; p[o] = rnd(-40, 40); p[o + 2] = rnd(-40, 40); }
    if (p[o] > 40) p[o] -= 80;
  }
  SNOWF.geometry.attributes.position.needsUpdate = true;
}

/* ёлки не пускают машину, сугробы тормозят и разлетаются */
let driftT = 0;
function stepCar (dt) {
  const V = C.V, sp = Math.hypot(V.vx, V.vz);
  if (A.ny > 0.01) for (const f of FIRS) {
    const dx = V.x - f.x, dz = V.z - f.z, d = Math.hypot(dx, dz);
    if (d >= f.r || d < 0.01) continue;
    const nx = dx / d, nz = dz / d, vin = V.vx * nx + V.vz * nz;
    V.x = f.x + nx * f.r; V.z = f.z + nz * f.r;
    if (vin < 0) { V.vx -= nx * vin * 1.4; V.vz -= nz * vin * 1.4; if (-vin > 4) { C.Snd.noise(0.15, 0.2); splash(V.x - nx, 2.5, V.z - nz, 14, 1.2); } }
  }
  driftT -= dt;
  if (A.drift < 0.01 || sp < 3) return;
  const ci = Math.floor(V.x / 20), cj = Math.floor(V.z / 20);
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
    for (const d of DRIFTS.get(i + ',' + j) || []) {
      if (d.seed >= A.drift || Math.hypot(V.x - d.x, V.z - d.z) > d.r + 0.8) continue;
      const k = Math.exp(-1.6 * dt);
      V.vx *= k; V.vz *= k;
      if (driftT <= 0) { driftT = 0.12; splash(V.x + V.vx * 0.08, 0.5, V.z + V.vz * 0.08, 10, 1 + sp / 20); }
      return;
    }
  }
}

/* ── снежки: две команды во дворе, лепят, замахиваются, бросают ── */
const FIGHTS = [], BALLS = [];
let BALL_GEO = null, BALL_MAT = null, fightScan = 0, carHitT = 0;
function fightSpots () {
  if (FIGHT_SPOTS.built) return FIGHT_SPOTS;
  const { CITY, inHouse, inPoly, inBounds, nearestRoad } = C;
  for (const g of CITY.green) {
    if (g.k === 'water' || g.k === 'pitch' || g.k === 'cem') continue;
    let cx = 0, cz = 0;
    for (const q of g.p) { cx += q[0] / g.p.length; cz += q[1] / g.p.length; }
    if (!inPoly(cx, cz, g.p) || !inBounds(cx, cz, 20) || inHouse(cx, cz, 6)) continue;
    const n = nearestRoad(cx, cz, 7, 1);
    if (n && n.d < n.seg.w / 2 + 6) continue;
    FIGHT_SPOTS.push({ x: cx, z: cz });
  }
  for (let i = 0; i < CITY.entrances.length; i += 6) {
    const [ex, ez, nx, nz] = CITY.entrances[i], x = ex + nx * 10, z = ez + nz * 10;
    if (!inBounds(x, z, 20) || inHouse(x, z, 6)) continue;
    const n = nearestRoad(x, z, 7, 1);
    if (n && n.d < n.seg.w / 2 + 6) continue;
    FIGHT_SPOTS.push({ x, z });
  }
  FIGHT_SPOTS.built = true;
  return FIGHT_SPOTS;
}
function spawnFight (sp) {
  const { makeHuman, groundH, curbAt, inHouse, nearestRoad, scene } = C;
  const a = rnd(0, 6.28), ux = Math.cos(a), uz = Math.sin(a), ppl = [];
  for (const team of [-1, 1]) {
    const n = 2 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const lat = (i - (n - 1) / 2) * 1.9 + rnd(-0.4, 0.4), dd = rnd(3.6, 5.2);
      const x = sp.x + ux * dd * team - uz * lat, z = sp.z + uz * dd * team + ux * lat;
      if (inHouse(x, z, 0.5)) continue;
      const nr = nearestRoad(x, z, 7, 1);
      if (nr && nr.d < nr.seg.w / 2 + 1.2) continue;
      const kid = Math.random() < 0.5;
      const grp = makeHuman(null, kid ? { h: rnd(0.56, 0.7), fat: false } : { fat: Math.random() < 0.15 });
      grp.position.set(x, groundH(x, z) + curbAt(x, z), z);
      scene.add(grp);
      ppl.push({ grp, x, z, team, st: 'idle', t: rnd(0.2, 2.2), hit: 0, dead: 0, person: null, tgt: null, sc: grp.scale.x });
    }
  }
  if (ppl.length < 3) { for (const q of ppl) C.dropMesh(q.grp); return; }
  FIGHTS.push({ sp, ppl, say: null, sayT: 0 });
  sp.on = 1;
}
function dropFight (f) {
  for (const q of f.ppl) if (!q.dead) C.dropMesh(q.grp);
  if (f.say && f.say.parent) { f.say.parent.remove(f.say); f.say.material.dispose(); }
  f.sp.on = 0;
}
function throwBall (q, tx, ty, tz, f) {
  let b = BALLS.find(o => !o.on);
  if (!b) { if (BALLS.length > 30) return; b = { m: new THREE.Mesh(BALL_GEO, BALL_MAT), on: 0 }; C.scene.add(b.m); BALLS.push(b); }
  const fx = Math.sin(q.grp.rotation.y), fz = Math.cos(q.grp.rotation.y);
  const x = q.x + fx * 0.3 + fz * 0.25 * q.sc, y = q.grp.position.y + 1.7 * q.sc, z = q.z + fz * 0.3 - fx * 0.25 * q.sc;
  const d = Math.hypot(tx - x, tz - z), T = Math.max(0.45, Math.min(1.15, d / 10));
  b.on = 1; b.f = f; b.team = q.team; b.life = 3;
  b.x = x; b.y = y; b.z = z;
  b.vx = (tx - x) / T + rnd(-0.6, 0.6); b.vz = (tz - z) / T + rnd(-0.6, 0.6); b.vy = (ty - y + 4.9 * T * T) / T;
  b.m.position.set(x, y, z); b.m.visible = true;
}
function stepBalls (dt) {
  const V = C.V;
  for (const b of BALLS) {
    if (!b.on) continue;
    b.life -= dt;
    b.vy -= 9.8 * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    b.m.position.set(b.x, b.y, b.z);
    let done = b.life <= 0;
    const gy = C.groundH(b.x, b.z) + C.curbAt(b.x, b.z);
    if (!done && b.f) for (const q of b.f.ppl) {
      if (q.dead || q.team === b.team) continue;
      const dy = b.y - q.grp.position.y;
      if (dy > 0.2 && dy < 1.9 * q.sc && Math.hypot(b.x - q.x, b.z - q.z) < 0.45) { q.hit = 0.7; q.st = 'idle'; q.t = rnd(0.6, 1.4); done = true; break; }
    }
    // попали в курьера
    if (!done && Math.abs(b.x - V.x) < 1.2 && Math.abs(b.z - V.z) < 1.2 && b.y < V.y + 1.8) {
      done = true;
      if (carHitT <= 0 && C.isPlaying()) { carHitT = 25; C.toast(t('в тебя попали снежком')); }
      C.Snd.blip(420, 0.05, 'triangle', 0.05);
    }
    if (!done && b.y < gy) done = true;
    if (done) {
      b.on = 0; b.m.visible = false;
      splash(b.x, Math.max(b.y, gy + 0.1), b.z, 7, 0.6);
      if (Math.hypot(b.x - V.x, b.z - V.z) < 25) C.Snd.noise(0.05, 0.03);
    }
  }
}
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
function stepFights (dt) {
  const V = C.V, ENV = C.ENV;
  const on = (A.snow || 0) > 0.55 && (ENV.night || 0) < 0.7;
  if (!on) { if (FIGHTS.length) { for (const f of FIGHTS) dropFight(f); FIGHTS.length = 0; } return; }
  if ((fightScan -= dt) <= 0) {
    fightScan = 1.2;
    for (let i = FIGHTS.length - 1; i >= 0; i--) if (Math.hypot(FIGHTS[i].sp.x - V.x, FIGHTS[i].sp.z - V.z) > 230) { dropFight(FIGHTS[i]); FIGHTS.splice(i, 1); }
    if (FIGHTS.length < 3) {
      const near = fightSpots().filter(p => !p.on && !p.slide && !p.cool && (d => d > 25 && d < 160)(Math.hypot(p.x - V.x, p.z - V.z)));
      if (near.length) { const sp = near[(Math.random() * near.length) | 0]; spawnFight(sp); }
    }
  }
  const fx = Math.sin(V.h), fz = Math.cos(V.h), vsp = Math.hypot(V.vx, V.vz);
  for (const f of FIGHTS) {
    const dC = Math.hypot(f.sp.x - V.x, f.sp.z - V.z);
    if (f.sayT > 0 && (f.sayT -= dt) <= 0 && f.say) { f.say.parent && f.say.parent.remove(f.say); f.say.material.dispose(); f.say = null; }
    for (const q of f.ppl) {
      if (q.dead) continue;
      const u = q.grp.userData, g = q.grp;
      g.visible = dC < 130;
      // под колёса — как все
      if (vsp > 3) {
        const dx = q.x - V.x, dz = q.z - V.z;
        if (Math.abs(dx * fx + dz * fz) < C.CAR_L + 0.5 && Math.abs(dx * fz - dz * fx) < C.CAR_W + 0.35) {
          q.dead = 1; C.dropMesh(g); C.gibHuman(q, V.vx, V.vz); C.S.people++; C.Snd.squish();
          C.toast(t('минус {what}', { what: t('снежный снайпер') }));
          continue;
        }
      }
      if (!g.visible) continue;
      // цель: кто-то из другой команды, а если курьер рядом и медленно — он
      const foes = f.ppl.filter(o => !o.dead && o.team !== q.team);
      const atCar = dC < 26 && vsp < 7 && Math.hypot(q.x - V.x, q.z - V.z) < 22;
      if (!q.tgt || q.tgt.dead || Math.random() < dt * 0.2) q.tgt = foes.length ? foes[(Math.random() * foes.length) | 0] : null;
      const tx = atCar ? V.x : q.tgt ? q.tgt.x : f.sp.x, tz = atCar ? V.z : q.tgt ? q.tgt.z : f.sp.z;
      g.rotation.y = damp(g.rotation.y, Math.atan2(tx - q.x, tz - q.z), 6, dt);
      if (q.hit > 0) {
        q.hit -= dt;
        g.rotation.z = Math.sin(q.hit * 22) * 0.12;
        u.armL.rotation.x = damp(u.armL.rotation.x, -2.4, 12, dt);
        if (q.hit <= 0) { g.rotation.z = 0; if (!f.say && Math.random() < 0.35 && dC < 60) { f.say = C.sayBubble(g, Math.random() < 0.5 ? t('ай!') : t('ха-ха!'), '#4f7fd6', 2.4 * q.sc + 0.3); f.sayT = 1.3; } }
        continue;
      }
      u.armL.rotation.x = damp(u.armL.rotation.x, -0.3, 6, dt);
      q.t -= dt;
      if (q.st === 'idle') {
        g.rotation.x = damp(g.rotation.x, 0, 8, dt);
        u.armR.rotation.x = damp(u.armR.rotation.x, 0, 6, dt);
        if (q.t <= 0) { q.st = 'scoop'; q.t = rnd(0.5, 0.9); }
      } else if (q.st === 'scoop') {                  // нагнулся, лепит
        g.rotation.x = damp(g.rotation.x, 0.5, 8, dt);
        u.armR.rotation.x = damp(u.armR.rotation.x, -0.9, 8, dt);
        u.armL.rotation.x = damp(u.armL.rotation.x, -0.9, 8, dt);
        if (q.t <= 0) { q.st = 'aim'; q.t = rnd(0.3, 0.5); }
      } else if (q.st === 'aim') {                    // замах
        g.rotation.x = damp(g.rotation.x, -0.08, 8, dt);
        u.armR.rotation.x = damp(u.armR.rotation.x, -3.0, 12, dt);
        if (q.t <= 0) {
          q.st = 'idle'; q.t = rnd(0.9, 2.6);
          u.armR.rotation.x = -0.7;
          const ty = atCar ? V.y + 1.0 : q.tgt ? q.tgt.grp.position.y + 1.1 * q.tgt.sc : C.groundH(tx, tz);
          throwBall(q, tx + rnd(-0.5, 0.5), ty, tz + rnd(-0.5, 0.5), f);
          if (dC < 40) C.Snd.blip(rnd(500, 700), 0.04, 'triangle', 0.03);
        }
      }
    }
  }
}

/* каждый кадр — после updateEnv */
export function updateSeasons (dt) {
  if (!C || !SNOWF) return;
  U.uTime.value += dt;
  U.uNight.value = C.ENV.night || 0;
  carHitT -= dt;
  stepSky(dt);
  stepCar(dt);
  stepFights(dt);
  stepBalls(dt);
  stepSplash(dt);
  if (window.__dlv && !window.__dlv.season) window.__dlv.season = DEBUG;
}

/* для ?debug: __dlv.season */
const DEBUG = {
  get value () { return SEA; }, get name () { return seasonName(); }, get amounts () { return { ...A }; }, BUILT, set: setSeason, advance: advanceSeason,
  FIGHTS, FIRS, SEA_ITEMS, DECID, SPRUCES, get meshes () { return [...MESH_PILE, ...MESH_GARL]; }, get drifts () { return BUILT.drifts; }, get ENV () { return C.ENV; },
};
