/* ──────────────────────────────────────────────────────────────────────────
   Времена года.

   Сезон — число от 0 до 4: 0 — начало лета, 1 — осень, 2 — зима, 3 — весна.
   Каждая смена (не «просто покататься») сдвигает его на SEASON_STEP, полный
   сезон — восемь смен, год — тридцать две. И каждый заход в игру — ещё на
   SEASON_ENTER (первый запуск — нет): кто заходит редко и на одну смену, всё
   равно со временем попадает в разные сезоны. Хранится в dlv-season, ?season=2.4
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
import { setPeopleSeason, redressHumans } from './people.js';

export const SEASON_STEP = 0.125;          // на столько сдвигает сезон одна смена: сезон — восемь смен
export const SEASON_ENTER = 0.06;          // и на столько — каждый заход в игру (~16 заходов без смен — сезон)
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
/* река во льду (сёрферу там не место) */
export const iced = () => (A.snow || 0) > 0.25;

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

/* Мелочь дворов (SMASH): как статика, но у кустов (aux.x = 1) листва
   своя: осенью желтеет и краснеет, к зиме — голые бурые прутья под
   снежной шапкой, весной — свежая зелень. Листвой считаем только
   зелёные вершины: кашпо и цветы у пиццерии не перекрашиваются. */
function smashMat (m) {
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute vec4 aux;\nvarying vec3 vSW;\nvarying float vK, vP, vSeed;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvK = floor(aux.x * 255.0 + 0.5); vSeed = aux.y; vP = floor(aux.z * 255.0 + 0.5);')
        .replace('#include <project_vertex>', '#include <project_vertex>\n' + WPOS);
    sh.fragmentShader = 'uniform float uYellow, uLeaf;\nvarying float vK, vP, vSeed;\n' + TINT + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      if (vK == 1.0) {
        vec3 c0 = diffuseColor.rgb;
        float leafy = smoothstep(0.03, 0.12, c0.g - max(c0.r, c0.b));
        vec3 pal = vP < 0.5 ? vec3(0.52, 0.33, 0.02) : vP < 1.5 ? vec3(0.55, 0.17, 0.02) : vec3(0.4, 0.05, 0.02);
        vec3 c = mix(c0, pal, clamp(uYellow * 1.7 - vSeed * 0.7, 0.0, 1.0));
        c = mix(c, vec3(0.13, 0.09, 0.06), clamp((1.0 - uLeaf) * 1.4 - vSeed * 0.4, 0.0, 1.0));
        c = mix(c, vec3(0.2, 0.5, 0.08), uFresh * 0.5);
        diffuseColor.rgb = mix(c0, c, leafy);
      }
      diffuseColor.rgb = seasonTint(diffuseColor.rgb, vK == 1.0 ? 0.0 : 0.6, 1.0);`);
  };
  m.customProgramCacheKey = () => 'seasonSmash';
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
  const byNum = new Map(), RGB = new Map();         // клетка по числу (строка-ключ на каждую вещь стоила), цвет по строке — разобранный
  function cell (x, z) {
    const i = Math.floor(x / CH), j = Math.floor(z / CH), kn = (i + 50000) * 100000 + j + 50000;
    let c = byNum.get(kn);
    if (!c) {
      const k = i + ',' + j;
      c = cells.get(k);
      if (!c) cells.set(k, c = { k, n: 0, cap: 2048, p: new Float32Array(2048 * 3), c: new Uint8Array(2048 * 3), a: new Uint8Array(2048 * 4) });
      byNum.set(kn, c);
    }
    return c;
  }
  /* вершины шаблона после сдвига, поворота и масштаба — в массив out с o */
  function write (tpl, out, o, x, y, z, sx, sy, sz, rx, ry, rz) {
    M.compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz, 'YZX')), Sc.set(sx, sy, sz));
    const e = M.elements, nv = tpl.length / 3;
    for (let i = 0; i < nv; i++) {
      const vx = tpl[i * 3], vy = tpl[i * 3 + 1], vz = tpl[i * 3 + 2], q = o + i * 3;
      out[q] = e[0] * vx + e[4] * vy + e[8] * vz + e[12];
      out[q + 1] = e[1] * vx + e[5] * vy + e[9] * vz + e[13];
      out[q + 2] = e[2] * vx + e[6] * vy + e[10] * vz + e[14];
    }
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
    /* возвращает, где лежат вершины: клетка и первая вершина */
    add (tpl, x, y, z, sx, sy, sz, rx, ry, rz, hex, kind = 0, seed = 0, pal = 0) {
      const c = cell(x, z), nv = tpl.length / 3, v0 = c.n;
      room(c, nv);
      write(tpl, c.p, v0 * 3, x, y, z, sx, sy, sz, rx, ry, rz);
      let rgb = RGB.get(hex);
      if (rgb === undefined) {
        col.set(hex);
        rgb = (Math.round(col.r * 255) << 16) | (Math.round(col.g * 255) << 8) | Math.round(col.b * 255);
        if (typeof hex === 'string' || typeof hex === 'number') RGB.set(hex, rgb);
      }
      const r = rgb >> 16, g = (rgb >> 8) & 255, b = rgb & 255;
      const sd = Math.max(1, Math.min(254, Math.round(seed * 253) + 1));
      for (let i = v0; i < v0 + nv; i++) {
        const o = i * 3, q = i * 4;
        c.c[o] = r; c.c[o + 1] = g; c.c[o + 2] = b;
        c.a[q] = kind; c.a[q + 1] = sd; c.a[q + 2] = pal; c.a[q + 3] = 0;
      }
      c.n += nv;
      tris += nv / 3;
      return { key: c.k, v0, nv };
    },
    write,
    tris: () => tris,
    /* keep — позиции остаются в памяти: их правят на ходу (сугробы) */
    build (mat, keep) {
      const out = [];
      out.byKey = new Map();
      for (const c of cells.values()) {
        if (!c.n) continue;
        const g = new THREE.BufferGeometry();
        const pa = new THREE.BufferAttribute(c.p.slice(0, c.n * 3), 3), ca = new THREE.BufferAttribute(c.c.slice(0, c.n * 3), 3, true), aa = new THREE.BufferAttribute(c.a.slice(0, c.n * 4), 4, true);
        g.setAttribute('position', pa); g.setAttribute('color', ca); g.setAttribute('aux', aa);
        g.computeBoundingSphere();
        for (const at of keep ? [ca, aa] : [pa, ca, aa]) at.onUpload(dropArr);
        const m = new THREE.Mesh(g, mat);
        C.scene.add(m);
        out.push(m); out.byKey.set(c.k, m);
      }
      cells.clear(); byNum.clear();
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
    mound: moundTpl(),
  };
  return TPL;
}

/* Сугроб: пятиугольник у земли, кольцо выше и уже, макушка. Обход граней —
   наружу (снизу его не видно, дна нет). */
function moundTpl () {
  const rim = [], ring = [], out = [];
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2, b = a + Math.PI / 5;
    rim.push([Math.cos(a), -0.08, Math.sin(a)]); ring.push([Math.cos(b) * 0.62, 0.7, Math.sin(b) * 0.62]);
  }
  const top = [0, 1, 0];
  const tri = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (a[0] + b[0] + c[0]) / 3, my = (a[1] + b[1] + c[1]) / 3 - 0.2, mz = (a[2] + b[2] + c[2]) / 3;
    out.push(...a, ...(nx * mx + ny * my + nz * mz > 0 ? [...b, ...c] : [...c, ...b]));
  };
  for (let i = 0; i < 5; i++) {
    const j = (i + 1) % 5;
    tri(rim[i], rim[j], ring[i]); tri(ring[i], rim[j], ring[j]); tri(ring[i], ring[j], top);
  }
  return Float32Array.from(out);
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
let PILE = null, GARL = null, DRIFTP = null, DRIFT_MESH = [], LEAFP = null, LEAF_MESH = [];
const DECID = [], SPRUCES = [], SEA_ITEMS = [], DRIFTS = new Map(), LEAVES = new Map(), FIRS = [], FIGHT_SPOTS = [];
let MESH_GARL = [], MESH_PILE = [];
const BUILT = { trees: 0, pile: 0, garl: 0, drifts: 0, bulbs: 0, items: 0 };

/* ctx: THREE, scene, cam, renderer, Store, MAP, CITY, V, S, groundH, curbAt, nearestRoad, roadWidth, drivable,
   inHouse, inPoly, inBounds, put, smashAdd, SMASH, SMASH_MAT, LAMP_SPOTS, ZEBRAS, NODE_IDX, nodeDeg,
   makeHuman, dropMesh, gibHuman, toast, Snd, CAR_L, CAR_W, isPlaying, sayBubble; геттеры: PIZZA, ENV, rainLines, hemi */
export function initSeasons (ctx) {
  C = ctx; THREE = ctx.THREE;
  const q = new URLSearchParams(location.search).get('season');
  if (q !== null && q !== '' && !Number.isNaN(+q)) { SEA = wrap(+q); FORCED = true; }
  else {
    const saved = C.Store.get('dlv-season', null);
    // зашёл в игру — сезон чуть вперёд (сохранённый уже был: не первый запуск)
    SEA = wrap((+saved || 0) + (saved === null || saved === undefined ? 0 : SEASON_ENTER));
    C.Store.set('dlv-season', SEA);
  }
  PILE = Pile(); GARL = Pile(); DRIFTP = Pile(); LEAFP = Pile();
  smashMat(C.SMASH_MAT);
  apply();
}

/* сдвинуть сезон: новая смена */
export function advanceSeason () {
  if (FORCED) return;
  SEA = wrap(SEA + SEASON_STEP);
  healDrifts();
  C.Store.set('dlv-season', SEA);
  apply();
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
  for (const m of DRIFT_MESH) m.visible = A.drift > 0.004;
  // новогодние ёлки стоят, пока видны (шейдер: зерно 4/255 < uNY)
  for (const f of FIRS) if (f.solid) f.solid.hw = f.solid.hd = A.ny > 0.016 ? f.hw : -50;     // -50 — «препятствия нет», как в игре
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

let PZ_NEAR = null;
export function seasonTree (x, z, y) {
  // у пиццерии: не в столиках, кашпо и заборчике и не на парковке курьеров
  const PZ = C.PIZZA;
  if (PZ && Math.hypot(x - PZ.bx, z - PZ.bz) < 90) {
    if (!PZ_NEAR) PZ_NEAR = C.SMASH.filter(it => Math.hypot(it.x - PZ.bx, it.z - PZ.bz) < 100);
    if (PZ_NEAR.some(it => Math.hypot(it.x - x, it.z - z) < (it.r || 1) + 1.6) || (C.COURIER_SLOTS || []).some(q => Math.hypot(q.x - x, q.z - z) < 4)) return false;
    if (startViewBlocked(PZ, x, z, 3.5)) return false;              // не заслоняет стартовый кадр
  }
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
  // кусты: вид 1 и зерно в aux склеек мелочи — их листву красит smashMat
  const SMA = new Map();
  for (const it of C.SMASH) {
    if (!it.mesh || it.mesh.material !== C.SMASH_MAT) continue;
    let a = SMA.get(it.mesh);
    if (!a) { a = new Uint8Array(it.mesh.geometry.attributes.position.count * 4); SMA.set(it.mesh, a); }
    if (it.kind !== 'bush') continue;
    const sd = 1 + ((hsh(it.x, it.z, 61) * 253) | 0), pal = hsh(it.x, it.z, 62) < 0.5 ? 0 : hsh(it.x, it.z, 63) < 0.5 ? 1 : 2;
    for (let i = it.v0; i < it.v0 + it.nv; i++) { a[i * 4] = 1; a[i * 4 + 1] = sd; a[i * 4 + 2] = pal; }
    BUILT.bushes = (BUILT.bushes || 0) + 1;
  }
  for (const [m, a] of SMA) m.geometry.setAttribute('aux', new THREE.BufferAttribute(a, 4, true));

  // ── сугробы вдоль улиц: за тротуаром, у перекрёстков и зебр не наваливаем
  const DRIFT_HEX = '#e6ebf2';
  // у пиццерии — не на парковке курьеров и не в столиках с заборчиком
  const PZ0 = C.PIZZA, SL = C.COURIER_SLOTS || [];
  const PZT = PZ0 ? C.SMASH.filter(it => Math.hypot(it.x - PZ0.bx, it.z - PZ0.bz) < 80) : [];
  const busy = (x, z) => PZ0 && Math.hypot(x - PZ0.bx, z - PZ0.bz) < 75 &&
    (SL.some(q => Math.hypot(q.x - x, q.z - z) < 9) || PZT.some(it => Math.hypot(it.x - x, it.z - z) < (it.r || 1) + 2.5));
  const drift = (x, z, L, H, W, ry, seed) => {
    if (busy(x, z)) return;
    const y = groundH(x, z) + C.curbAt(x, z) + 0.02;
    const at = DRIFTP.add(T.mound, x, y, z, W, H, L, 0, ry, 0, DRIFT_HEX, 3, seed);
    const k = Math.floor(x / 20) + ',' + Math.floor(z / 20);
    if (!DRIFTS.has(k)) DRIFTS.set(k, []);
    DRIFTS.get(k).push({ x, y, z, L, H, W, ry, cs: Math.cos(ry), sn: Math.sin(ry), s: 1, t: 0, ...at, pile: DRIFTP,
      seed: Math.max(1, Math.min(254, Math.round(seed * 253) + 1)) / 255 });
    BUILT.drifts++;
    // осенью на тех же местах — кучи листьев (по зерну видны, как опавшие листья: uFallen), пониже и рыжие
    if (hsh(x, z, 91) < 0.55) leafPile(x, y, z, L * 1.05, H * 0.5, W * 1.15, ry + (hsh(x, z, 92) - 0.5) * 0.5, hsh(x, z, 93));
  };
  const LEAF_HEX = ['#c9782a', '#d9a23a', '#a8452a', '#b8862e', '#8a5a2a'];
  const leafPile = (x, y, z, L, H, W, ry, seed) => {
    const at = LEAFP.add(T.mound, x, y, z, W, H, L, 0, ry, 0, LEAF_HEX[(hsh(x, z, 94) * LEAF_HEX.length) | 0], 2, seed);
    const k = Math.floor(x / 20) + ',' + Math.floor(z / 20);
    if (!LEAVES.has(k)) LEAVES.set(k, []);
    LEAVES.get(k).push({ x, y, z, L, H, W, ry, cs: Math.cos(ry), sn: Math.sin(ry), s: 1, t: 0, ...at, pile: LEAFP, leaf: true,
      seed: Math.max(1, Math.min(254, Math.round(seed * 253) + 1)) / 255 });
    BUILT.leaves = (BUILT.leaves || 0) + 1;
  };
  const PK = new Map();                                   // припаркованные — у бордюра вал не насыпаем
  for (const q of C.PARKED || []) { const k = Math.floor(q[0] / 10) + ',' + Math.floor(q[1] / 10); if (!PK.has(k)) PK.set(k, []); PK.get(k).push(q); }
  const parkedNear = (x, z) => { const i = Math.floor(x / 10), j = Math.floor(z / 10); for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) for (const q of PK.get(a + ',' + b) || []) if (Math.hypot(q[0] - x, q[1] - z) < 4.5) return true; return false; };
  const onAsphalt = (x, z, m) => { const n = nearestRoad(x, z, 7, 1); return n && n.d < n.seg.w / 2 + m; };
  // зебры по клеткам в 10 м (d — до 9 м): ответ тот же, что у перебора всех
  const ZG = new Map();
  for (const q of ZEBRAS) { const k = Math.floor(q.x / 10) * 100003 + Math.floor(q.z / 10); if (!ZG.has(k)) ZG.set(k, []); ZG.get(k).push(q); }
  const nearZebra = (x, z, d) => {
    for (let i = Math.floor((x - d) / 10); i <= Math.floor((x + d) / 10); i++)
      for (let j = Math.floor((z - d) / 10); j <= Math.floor((z + d) / 10); j++) {
        const a = ZG.get(i * 100003 + j);
        if (a) for (const q of a) if (Math.abs(q.x - x) < d && Math.abs(q.z - z) < d) return true;
      }
    return false;
  };
  const nearStop = (x, z) => (CITY.stops || []).some(q => Math.abs(q.p[0] - x) < 9 && Math.abs(q.p[1] - z) < 9);
  const RIDGES = svk ? 9000 : 3600, HEAPS = svk ? 1800 : 900, BANKS = svk ? 1300 : 650;
  let nRidge = 0, nHeap = 0, nBank = 0;
  const heapCells = new Set();
  for (const rd of CITY.roads) {
    if (!drivable(rd) || rd.b || rd.c > 5) continue;
    const w = roadWidth(rd), off = w / 2 + 2.75 + 1.1;
    for (let i = 1; i < rd.p.length; i++) {
      const [x1, z1] = rd.p[i - 1], [x2, z2] = rd.p[i];
      const len = Math.hypot(x2 - x1, z2 - z1) || 1, ux = (x2 - x1) / len, uz = (z2 - z1) / len, ry = Math.atan2(ux, uz);
      const nA = NODE_IDX.get(x1 + ',' + z1), nB = NODE_IDX.get(x2 + ',' + z2);
      const endA = nA !== undefined && nodeDeg(nA) >= 3, endB = nB !== undefined && nodeDeg(nB) >= 3;
      // вал вдоль бордюра: что счистил грейдер, лежит длинной грядой на кромке
      for (let d = 3; d < len - 2.5 && nRidge < RIDGES; d += 5.2) {
        if ((endA && d < 10) || (endB && len - d < 10)) continue;
        for (const sd of [-1, 1]) {
          const o = w / 2 + 0.4, x = x1 + ux * d - uz * o * sd, z = z1 + uz * d + ux * o * sd;
          if (hsh(x, z, 71) > 0.82 || !inBounds(x, z, -20) || inHouse(x, z, 0.8)) continue;
          const n = nearestRoad(x, z, 7, 1);
          if (n && n.d < n.seg.w / 2 - 0.2) continue;               // чужое полотно
          if (nearZebra(x, z, 7) || nearStop(x, z) || parkedNear(x, z)) continue;
          const r = rngAt(x, z, 72);
          drift(x, z, 2.2 + r() * 1.6, 0.3 + r() * 0.28, 0.55 + r() * 0.3, ry + (r() - 0.5) * 0.08, r());
          nRidge++;
        }
      }
      // за тротуаром — сугробы побольше
      for (let d = 4; d < len - 3 && nBank < BANKS; d += 11) {
        if ((endA && d < 13) || (endB && len - d < 13)) continue;
        for (const sd of [-1, 1]) {
          const x = x1 + ux * d - uz * off * sd, z = z1 + uz * d + ux * off * sd;
          if (hsh(x, z, 1) > 0.6 || !inBounds(x, z, -20) || inHouse(x, z, 1.4) || onAsphalt(x, z, 3.2) || nearZebra(x, z, 9)) continue;
          const r = rngAt(x, z, 6);
          drift(x, z, 1.5 + r() * 1.6, 0.5 + r() * 0.45, 0.9 + r() * 0.5, ry, r());
          nBank++;
        }
      }
    }
    // кучи на углах перекрёстков и у въездов во дворы: туда сгребают всё
    for (let i = 0; i < rd.p.length && nHeap < HEAPS; i++) {
      const [ex, ez] = rd.p[i], nd = NODE_IDX.get(ex + ',' + ez);
      if (nd === undefined || nodeDeg(nd) < 3) continue;
      for (const j of [i - 1, i + 1]) {
        if (j < 0 || j >= rd.p.length) continue;
        const dx = rd.p[j][0] - ex, dz = rd.p[j][1] - ez, l = Math.hypot(dx, dz);
        if (l < 12) continue;
        const ux = dx / l, uz = dz / l, along = 6.5 + w / 2, big = rd.c >= 4 ? 1.25 : 1;
        for (const sd of [-1, 1]) {
          const o = w / 2 + 1.9, x = ex + ux * along - uz * o * sd, z = ez + uz * along + ux * o * sd;
          const hk = Math.round(x / 4) + ',' + Math.round(z / 4);
          if (heapCells.has(hk) || !inBounds(x, z, -20) || inHouse(x, z, 1.2) || onAsphalt(x, z, 0.5) || nearZebra(x, z, 5) || parkedNear(x, z)) continue;
          heapCells.add(hk);
          const r = rngAt(x, z, 73);
          drift(x, z, (1.7 + r() * 1.1) * big, (0.75 + r() * 0.5) * big, (1.3 + r() * 0.7) * big, Math.atan2(ux, uz) + r() * 0.6, r() * 0.55);
          nHeap++;
        }
      }
    }
  }
  BUILT.ridges = nRidge; BUILT.heaps = nHeap; BUILT.banks = nBank;
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
    // тесно — ёлка поменьше, зато рядом и видна со старта
    let b = pizzaFirSpot(PZ, firSpot, 1.15), k = 1.15;
    if (!b || b[2] > 30) { const b2 = pizzaFirSpot(PZ, firSpot, 0.8); if (b2 && (!b || b2[2] < b[2])) { b = b2; k = 0.8; } }
    if (b) bigFir(b[0], b[1], k);
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
  // сугробы — отдельно: их позиции живые (разбиваются и отрастают)
  DRIFT_MESH = DRIFTP.build(MESH_PILE[0] ? MESH_PILE[0].material : pileMat(), true);
  for (const list of DRIFTS.values()) for (const d of list) d.mesh = DRIFT_MESH.byKey.get(d.key);
  LEAF_MESH = LEAFP.build(MESH_PILE[0] ? MESH_PILE[0].material : pileMat(), true);
  for (const list of LEAVES.values()) for (const d of list) d.mesh = LEAF_MESH.byKey.get(d.key);
  // гирлянды, сугробы, снег и комья впервые появятся посреди зимы — программы собираем сразу
  initSky();
  chunks(0, -500, 0, 1, 0, 0);
  const warm = [...MESH_GARL, ...DRIFT_MESH, ...LEAF_MESH, SNOWF, SPLASH.pts, ...CHUNKS.map(c => c.m)];
  for (const m of warm) m.visible = true;
  C.renderer.compile(C.scene, C.cam);
  for (const c of CHUNKS) { c.life = 0; c.m.visible = false; }
  SNOWF.visible = false;
  apply();
}
/* Стартовый кадр (V.hero в camStep): камера в 10 м перед машиной на месте 0
   и в 6 м вбок, смотрит на машину и пиццерию. */
function heroViews () {
  const s0 = (C.COURIER_SLOTS || [])[0];
  if (!s0) return [];
  const fx = Math.sin(s0.h), fz = Math.cos(s0.h), rx = Math.cos(s0.h), rz = -Math.sin(s0.h);
  return [1, -1].map(sd => [s0.x + fx * 10 + rx * 6 * sd, s0.z + fz * 10 + rz * 6 * sd]);
}
const segD = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
};
function startViewBlocked (PZ, x, z, r) {
  const s0 = (C.COURIER_SLOTS || [])[0];
  if (!s0) return false;
  return heroViews().some(([cx, cz]) => segD(x, z, cx, cz, PZ.bx, PZ.bz) < r || segD(x, z, cx, cz, s0.x, s0.z) < r);
}
/* Ёлка у пиццерии: не на парковке курьеров, не в столиках и заборчике,
   не в чужом препятствии и не между стартовой камерой и машиной с
   пиццерией. Из годных — та, что ближе к пиццерии и видна со старта. */
function pizzaFirSpot (PZ, firSpot, k) {
  const R = 4.9 * k, slots = C.COURIER_SLOTS || [];
  const near = (x, z, d) => Math.hypot(x - PZ.bx, z - PZ.bz) < d;
  const things = C.SMASH.filter(it => near(it.x, it.z, 90));
  const solids = C.SOLIDS.filter(q => near(q.cx, q.cz, 110) && q.deckY === undefined);
  const s0 = slots[0], views = heroViews();
  let best = null, bs = Infinity;
  for (let rr = 14; rr <= 46; rr += 3)
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * 6.283, x = PZ.bx + Math.cos(a) * rr, z = PZ.bz + Math.sin(a) * rr;
      if (!firSpot(x, z, 3.5 + k * 1.5)) continue;
      if (things.some(it => Math.hypot(it.x - x, it.z - z) < R + (it.r || 1) + 1)) continue;
      if (slots.some(q => Math.hypot(q.x - x, q.z - z) < R + 4)) continue;
      if (solids.some(q => { const dx = x - q.cx, dz = z - q.cz, lx = dx * q.cs + dz * q.sn, lz = -dx * q.sn + dz * q.cs; return Math.abs(lx) < q.hw + R + 1 && Math.abs(lz) < q.hd + R + 1; })) continue;
      if (startViewBlocked(PZ, x, z, R + 2)) continue;
      // видна со старта: в конусе от камеры к машине
      let sc = rr;
      if (s0) { const [cx, cz] = views[0], ux = s0.x - cx, uz = s0.z - cz, vx = x - cx, vz = z - cz; const cs = (ux * vx + uz * vz) / (Math.hypot(ux, uz) * Math.hypot(vx, vz) || 1); if (cs < 0.8) sc += 25; }
      if (sc < bs) { bs = sc; best = [x, z, sc]; }
    }
  return best;
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
  // настоящее препятствие; вне праздников его уносим прочь (apply)
  FIRS.push({ x, z, hw: 3.1 * k, solid: C.obb ? C.obb(x, z, 3.1 * k, 3.1 * k, 0) : null });
}

/* ─────────────── живое: снег с неба, снежки, сугробы под колёсами ─────────────── */
let SNOWF = null, SPLASH = null, SKY = null;
const SF_N = 3200, SP_N = 420, SF_R = 38, SF_IN = 1400, SF_RI = 15;   // первые SF_IN — ближняя коробка: крупные хлопья у камеры
function initSky () {
  const g = new THREE.BufferGeometry();
  // хлопья — в мировых координатах, в коробке вокруг камеры (чуть впереди);
  // ушедшие из коробки переносим на другой её край: едешь — снег летит навстречу
  const p = new Float32Array(SF_N * 3);
  for (let i = 0; i < SF_N; i++) { p[i * 3] = rnd(-SF_R, SF_R); p[i * 3 + 1] = rnd(-10, 30); p[i * 3 + 2] = rnd(-SF_R, SF_R); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  /* Своя точка: ближние крупнее, с серо-голубой каймой — иначе белое на
     белом поле и бледном небе не видно; дальние — по пикселю. */
  const m = new THREE.ShaderMaterial({
    uniforms: { uOp: { value: 0 }, uNight: U.uNight, uS: { value: 64 } },
    vertexShader: `uniform float uS; varying float vD;
      void main () { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vD = -mv.z; gl_PointSize = clamp(uS / max(vD, 0.5), 2.0, 6.0); }`,
    fragmentShader: `uniform float uOp, uNight; varying float vD;
      void main () { vec2 q = abs(gl_PointCoord * 2.0 - 1.0); float r = max(q.x, q.y);
        vec3 c = r > 0.52 && vD < 16.0 ? vec3(0.58, 0.66, 0.78) : vec3(1.0);
        c *= mix(1.0, 0.5, uNight);
        gl_FragColor = vec4(c, uOp * clamp(1.25 - vD / 60.0, 0.35, 1.0)); }`,
    transparent: true, depthWrite: false,
  });
  CAM_DIR = new THREE.Vector3();
  SNOWF = new THREE.Points(g, m);
  SNOWF.frustumCulled = false; SNOWF.visible = false;
  C.scene.add(SNOWF);
  const g2 = new THREE.BufferGeometry();
  g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SP_N * 3).fill(-5000), 3));
  SPLASH = { pts: new THREE.Points(g2, new THREE.PointsMaterial({ color: 0xf4f8fc, size: 3, sizeAttenuation: false })), v: new Float32Array(SP_N * 3), life: new Float32Array(SP_N), i: 0, on: 0 };
  SPLASH.pts.frustumCulled = false;
  C.scene.add(SPLASH.pts);
  const forceSnow = new URLSearchParams(location.search).has('snow');              // ?snow — снег идёт сразу (проверка)
  SKY = { want: forceSnow ? 0.8 : 0, amt: forceSnow ? 0.8 : 0, t: forceSnow ? 9999 : rnd(10, 40), bg: new THREE.Color('#c6d0da'), fog: new THREE.Color('#e0e6ec'), gnd: new THREE.Color('#e4ebf2'), aut: new THREE.Color('#b8c6d0') };
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
  SNOWF.material.uniforms.uOp.value = Math.min(1, SKY.amt * 1.4);
  const cam = C.cam, p = SNOWF.geometry.attributes.position.array, n = SF_N;
  cam.getWorldDirection(CAM_DIR);
  const hl = Math.hypot(CAM_DIR.x, CAM_DIR.z) || 1;
  const cx = cam.position.x + CAM_DIR.x / hl * 14, cz = cam.position.z + CAM_DIR.z / hl * 14, cy = cam.position.y, R2 = SF_R * 2;
  const fall = (2.0 + SKY.amt * 1.6) * dt, tt = U.uTime.value;
  SNOWF.geometry.setDrawRange(0, Math.floor(SF_N * Math.min(1, 0.35 + SKY.amt)));
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    let x = p[o], y = p[o + 1] - fall * (0.7 + (i % 5) * 0.12), z = p[o + 2];
    x += (Math.sin(tt * 0.9 + i) * 0.4 + 0.5) * dt;
    const R = i < SF_IN ? SF_RI : SF_R, RR = R * 2, ox = i < SF_IN ? cam.position.x + CAM_DIR.x / hl * 6 : cx, oz = i < SF_IN ? cam.position.z + CAM_DIR.z / hl * 6 : cz;
    if (x < ox - R || x >= ox + R) x = ox - R + (((x - ox + R) % RR) + RR) % RR;
    if (z < oz - R || z >= oz + R) z = oz - R + (((z - oz + R) % RR) + RR) % RR;
    if (i < SF_IN) { if (y < cy - 8) y += 22; else if (y > cy + 14) y -= 22; }
    else if (y < cy - 12) y += 42; else if (y > cy + 30) y -= 42;
    p[o] = x; p[o + 1] = y; p[o + 2] = z;
  }
  SNOWF.geometry.attributes.position.needsUpdate = true;
}

/* Сугробы. Врезался на скорости — сугроб взрывается: белые комья,
   снежная пыль, мягкий глухой удар, машину ненадолго тормозит. От него
   остаётся плоский след, через минуту-полторы он отрастает (новая смена —
   все снова целые). Правим только вершины этого сугроба в его склейке. */
let driftT = 0, dragT = 0, redressT = 0, CAM_DIR = null, growT = 0;
const GROW = [];                                          // разбитые — ждут, пока отрастут
function driftShape (d, s) {
  const m = d.mesh;
  if (!m) return;
  const pa = m.geometry.attributes.position;
  if (!pa.array) return;
  (d.pile || DRIFTP).write(tpls().mound, pa.array, d.v0 * 3, d.x, d.y - (1 - s) * 0.05, d.z, d.W * (1 + (1 - s) * 0.25), d.H * s, d.L * (1 + (1 - s) * 0.15), 0, d.ry, 0);
  pa.addUpdateRange(d.v0 * 3, d.nv * 3);
  pa.needsUpdate = true;
  d.s = s;
}
function burstDrift (d, sp) {
  const V = C.V;
  driftShape(d, 0.18);
  d.t = rnd(55, 95);
  GROW.push(d);
  const vol = Math.min(1.6, d.L * d.W * d.H);
  splash(d.x, d.y + d.H * 0.6, d.z, 18 + (vol * 14 | 0), 1.3 + sp / 18);
  chunks(d.x, d.y + d.H * 0.5, d.z, 5 + (vol * 5 | 0), V.vx, V.vz);
  C.Snd.blip(70 + Math.random() * 25, 0.22, 'sine', 0.2);
  C.Snd.noise(0.22, 0.13);
  C.S.shake = Math.max(C.S.shake || 0, 0.1 + Math.min(0.15, sp / 120));
  const k = 0.84 - Math.min(0.12, vol * 0.08);
  V.vx *= k; V.vz *= k;
  dragT = 0.28;
}
function stepCar (dt) {
  const V = C.V, sp = Math.hypot(V.vx, V.vz);
  driftT -= dt;
  if (dragT > 0) { dragT -= dt; const k = Math.exp(-1.8 * dt); V.vx *= k; V.vz *= k; }
  // отрастают понемногу
  if (GROW.length && (growT -= dt) <= 0) {
    growT = 0.25;
    for (let i = GROW.length - 1; i >= 0; i--) {
      const d = GROW[i];
      if ((d.t -= 0.25) > 0) continue;
      const s = Math.min(1, d.s + 0.06);
      driftShape(d, s);
      if (s >= 1) GROW.splice(i, 1);
    }
  }
  if (sp < 2.5) return;
  const ci = Math.floor(V.x / 20), cj = Math.floor(V.z / 20);
  // осенние кучи листьев: въехал — разлетаются, машину чуть тормозит, через минуту-полторы снова куча
  if (A.fallen > 0.01) for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
    for (const d of LEAVES.get(i + ',' + j) || []) {
      if (d.seed >= A.fallen || d.s < 0.5) continue;
      const dx = V.x - d.x, dz = V.z - d.z;
      if (Math.abs(dx) > d.L + 2.5 || Math.abs(dz) > d.L + 2.5) continue;
      const lx = dx * d.cs - dz * d.sn, lz = dx * d.sn + dz * d.cs;
      const ex = lx / (d.W + 1.0), ez = lz / (d.L + 1.2);
      if (ex * ex + ez * ez > 1) continue;
      burstLeaves(d, sp);
    }
  }
  if (A.drift < 0.01) return;
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
    for (const d of DRIFTS.get(i + ',' + j) || []) {
      if (d.seed >= A.drift || d.s < 0.5) continue;
      const dx = V.x - d.x, dz = V.z - d.z;
      if (Math.abs(dx) > d.L + 2.5 || Math.abs(dz) > d.L + 2.5) continue;
      const lx = dx * d.cs - dz * d.sn, lz = dx * d.sn + dz * d.cs;         // в осях сугроба
      const ex = lx / (d.W + 1.0), ez = lz / (d.L + 1.2);
      if (ex * ex + ez * ez > 1) continue;
      if (sp > 5) burstDrift(d, sp);
      else { const k = Math.exp(-1.4 * dt); V.vx *= k; V.vz *= k; if (driftT <= 0) { driftT = 0.15; splash(V.x, 0.4 + d.y, V.z, 5, 0.6); } }
    }
  }
}
function burstLeaves (d, sp) {
  const V = C.V;
  driftShape(d, 0.2);
  d.t = rnd(50, 90);
  GROW.push(d);
  leafBits(d.x, d.y + d.H * 0.5, d.z, 14 + Math.min(14, sp | 0), V.vx, V.vz);
  C.Snd.noise(0.18, 0.09);
  V.vx *= 0.97; V.vz *= 0.97;
}
/* листья в воздухе: плоские рыжие квадратики из пула, кружат и падают */
const LEAF_BITS = [];
let LEAF_GEO = null;
function leafBits (x, y, z, n, vx, vz) {
  if (!LEAF_GEO) LEAF_GEO = new THREE.PlaneGeometry(0.22, 0.16);
  for (let k = 0; k < n; k++) {
    let b = LEAF_BITS.find(q => q.life <= 0);
    if (!b) {
      if (LEAF_BITS.length > 90) break;
      b = { m: new THREE.Mesh(LEAF_GEO, new THREE.MeshLambertMaterial({ color: 0xc9782a, side: THREE.DoubleSide })), life: 0 };
      C.scene.add(b.m);
      LEAF_BITS.push(b);
    }
    b.m.material.color.set(['#c9782a', '#d9a23a', '#a8452a', '#e0b13f'][(Math.random() * 4) | 0]);
    b.m.position.set(x + rnd(-0.8, 0.8), y, z + rnd(-0.8, 0.8));
    b.m.visible = true;
    b.vx = vx * rnd(0.15, 0.35) + rnd(-2.5, 2.5); b.vy = rnd(2, 5); b.vz = vz * rnd(0.15, 0.35) + rnd(-2.5, 2.5);
    b.spin = rnd(-8, 8); b.life = rnd(2.2, 3.6);
  }
}
function stepLeafBits (dt) {
  for (const b of LEAF_BITS) {
    if (b.life <= 0) continue;
    b.life -= dt;
    b.vy = Math.max(-1.1, b.vy - 6 * dt);                 // парусят: падают медленно
    b.vx *= 1 - dt * 1.2; b.vz *= 1 - dt * 1.2;
    b.m.position.x += (b.vx + Math.sin(b.life * 5) * 0.6) * dt; b.m.position.y += b.vy * dt; b.m.position.z += b.vz * dt;
    b.m.rotation.x += b.spin * dt; b.m.rotation.y += b.spin * 0.7 * dt;
    const g = C.groundH(b.m.position.x, b.m.position.z) + 0.05;
    if (b.m.position.y < g) { b.m.position.y = g; b.vy = 0; b.vx = b.vz = 0; b.spin = 0; }
    if (b.life <= 0) b.m.visible = false;
  }
}
/* новая смена: все сугробы снова целые */
function healDrifts () {
  for (const d of GROW) driftShape(d, 1);
  GROW.length = 0;
}
/* комья снега: несколько коробочек из пула, летят, падают, тают */
const CHUNKS = [];
let CHUNK_GEO = null, CHUNK_MAT = null;
function chunks (x, y, z, n, vx, vz) {
  if (!CHUNK_GEO) { CHUNK_GEO = new THREE.BoxGeometry(1, 1, 1); CHUNK_MAT = seasonMat(new THREE.MeshLambertMaterial({ color: 0xe8eef5, flatShading: true }), 0); }
  for (let i = 0; i < n; i++) {
    let c = CHUNKS.find(q => q.life <= 0);
    if (!c) { if (CHUNKS.length >= 40) break; c = { m: new THREE.Mesh(CHUNK_GEO, CHUNK_MAT), life: 0 }; C.scene.add(c.m); CHUNKS.push(c); }
    const sz = rnd(0.18, 0.42);
    c.m.scale.setScalar(sz); c.sz = sz; c.m.visible = true;
    c.m.position.set(x + rnd(-0.6, 0.6), y + rnd(0, 0.4), z + rnd(-0.6, 0.6));
    c.vx = vx * rnd(0.3, 0.7) + rnd(-3, 3); c.vz = vz * rnd(0.3, 0.7) + rnd(-3, 3); c.vy = rnd(2.5, 6.5);
    c.spin = rnd(-8, 8); c.life = rnd(1.6, 2.6); c.rest = 0;
  }
}
function stepChunks (dt) {
  for (const c of CHUNKS) {
    if (c.life <= 0) continue;
    c.life -= dt;
    const p = c.m.position;
    if (!c.rest) {
      c.vy -= 14 * dt;
      p.x += c.vx * dt; p.y += c.vy * dt; p.z += c.vz * dt;
      c.m.rotation.x += c.spin * dt; c.m.rotation.z += c.spin * 0.7 * dt;
      const gy = C.groundH(p.x, p.z) + C.curbAt(p.x, p.z) + c.sz * 0.4;
      if (p.y < gy) { p.y = gy; if (c.vy < -3) { c.vy *= -0.25; c.vx *= 0.4; c.vz *= 0.4; } else c.rest = 1; }
    }
    if (c.life < 0.6) c.m.scale.setScalar(c.sz * Math.max(0.01, c.life / 0.6));    // тает
    if (c.life <= 0) c.m.visible = false;
  }
}

/* ── снежки: две команды во дворе, лепят, замахиваются, бросают ── */
const FIGHTS = [], BALLS = [];
let BALL_GEO = null, BALL_MAT = null, fightScan = 0;
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
      const grp = makeHuman(null, { fat: Math.random() < 0.15 });      // детей в игре нет — играют взрослые
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
  stepSky(dt);
  stepCar(dt);
  stepLeafBits(dt);
  stepFights(dt);
  stepBalls(dt);
  stepSplash(dt);
  stepChunks(dt);
  // кто уже на улице — переодеваются понемногу, пока их не видно
  if ((redressT -= dt) <= 0) { redressT = 0.3; C.cam.getWorldDirection(CAM_DIR); redressHumans(C.cam.position.x, C.cam.position.z, CAM_DIR.x, CAM_DIR.z, 2); }
  if (window.__dlv && !window.__dlv.season) window.__dlv.season = DEBUG;
}

/* для ?debug: __dlv.season */
const DEBUG = {
  get value () { return SEA; }, get name () { return seasonName(); }, get amounts () { return { ...A }; }, BUILT, set: setSeason, advance: advanceSeason,
  snowNow (a = 0.8) { SKY.want = a; SKY.amt = a; SKY.t = 9999; }, DRIFTS, GROW, burstDrift,
  FIGHTS, FIRS, SEA_ITEMS, DECID, SPRUCES, get meshes () { return [...MESH_PILE, ...MESH_GARL, ...DRIFT_MESH]; }, get drifts () { return BUILT.drifts; }, get ENV () { return C.ENV; },
};
