/* ──────────────────────────────────────────────────────────────────────────
   Частицы эффектов из общего запаса (11.10.2026, трек «Производительность»,
   п. 2 и 6 docs/IDEAS.md). Раньше каждая искра, клуб дыма, язык пламени нитро,
   капля крови и кусок взрыва были своим мешем со своим материалом: кальянная
   компания — ~100 новых материалов в секунду, нитро — ~38; three.js на каждый
   новый материал ищет программу и копирует униформы, сборщик мусора потом
   убирает всё это, а рисуется каждая частица отдельным вызовом.
   Теперь вид частицы (kind) — один InstancedMesh с общим материалом:
     spark  — искры, крошки пиццы (кубик 0,11, без света, непрозрачный);
     bit    — капли крови (кубик 0,22, без света, непрозрачный);
     debris — обломки взрыва (кубик 0,22, со светом, гранёный);
     puff   — клубы: дым из-под капота, пламя нитро и огонь, брызги, пар,
              кальян, курильщики, электронка, ведьмин зелёный дым (икосаэдр 0,5);
     ring   — кольца дыма кальянщика (тор);
     bubble — мыльные пузыри детской версии (шарик).
   Цвет — у каждой частицы свой (instanceColor), прозрачность у прозрачных видов
   (puff, ring, bubble) — своя у каждой (атрибут aA): при рождении — как была у её
   материала, дальше, как раньше, «осталось жизни / вся жизнь × 0,85».
   Движение то же, что у FX в game.js: скорость, тяжесть и отскок от пола, рост
   (масштаб × (1 + grow·dt) за кадр), вращение (spin: x — spin, z — 0,7·spin).
   Отрисовка вида — одна, пока в нём что-то живо; запас растёт вдвое, если не
   хватило (до CAP), новых мешей и материалов в кадре нет.
   Порядок прозрачных: renderOrder 0,5 — после всего прозрачного «обычного»
   (следы крови и копоти, тени — как и раньше, клуб над пятном), до стёкол машин
   (1), воды (2) и дымка выхлопа (pixfx.js, 2).
   ?oldfx — по-старому, меш и материал на частицу (сравнить до/после одной сборкой).
   Переменных игры модуль не видит: всё нужное — init.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

export const FXP = { START: 64, START_PUFF: 512, CAP: 8192 };   // запас вида при загрузке (клубов — больше: кальянная компания держит 300+), предел
export const STATS = { spawned: 0, alive: 0, peak: 0, grown: 0, dropped: 0, old: 0 };
const OLD = typeof location !== 'undefined' && new URLSearchParams(location.search).has('oldfx');

/* вид: геометрия, материал (basic / lambert), прозрачный ли, «мелкий» (на графике «эффекты: меньше» — через один) */
const KINDS = {
  spark: { mat: 'basic', tr: false, small: true },
  bit: { mat: 'basic', tr: false, small: true },
  debris: { mat: 'lambert', tr: false, small: true },
  puff: { mat: 'basic', tr: true, small: true },
  ring: { mat: 'basic', tr: true, small: false },
  bubble: { mat: 'basic', tr: true, small: false },
};
let SCENE = null, CAM = null, GEO = null, LOW = () => false, DROP = () => false, LIFE = () => 1, LEGACY = null;
const POOLS = {};
const FREE = [];                                  // отжившие частицы — для новых (без new в кадре)
let NFREE = 0;
const M4 = new THREE.Matrix4(), POS = new THREE.Vector3(), SCL = new THREE.Vector3(), Q = new THREE.Quaternion(), EU = new THREE.Euler(), COL = new THREE.Color();

/* частица — все поля с рождения и дробные (скрытая форма V8 одна) */
function mk () {
  return { x: 0.5, y: 0.5, z: 0.5, vx: 0.5, vy: 0.5, vz: 0.5, life: 0.5, max: 0.5, grow: 0.5, spin: 0.5, gravity: 0.5,
    floor: 0.5, s: 0.5, rx: 0.5, ry: 0.5, rz: 0.5, r: 0.5, g: 0.5, b: 0.5, a: 0.5, d: 0.5 };
}

function material (k) {
  if (k.mat === 'lambert') return new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  if (!k.tr) return new THREE.MeshBasicMaterial({ color: 0xffffff });
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
  m.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute float aA;\nvarying float vA;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvA = aA;');
    sh.fragmentShader = 'varying float vA;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vA;');
  };
  m.customProgramCacheKey = () => 'fxPoolA';
  return m;
}

/* меш вида на n частиц (геометрия — своя копия: у прозрачных в ней атрибут aA на каждую частицу) */
function meshFor (name, n, old) {
  const k = KINDS[name];
  const geo = old ? old.geometry : GEO[name].clone();
  let aA = null;
  if (k.tr) {
    aA = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    aA.setUsage(THREE.DynamicDrawUsage);
    if (old) aA.array.set(old.userData.aA.array);
    geo.setAttribute('aA', aA);
  }
  const m = new THREE.InstancedMesh(geo, old ? old.material : material(k), n);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.setColorAt(0, COL.set(0xffffff));
  m.instanceColor.setUsage(THREE.DynamicDrawUsage);
  if (old) { m.instanceMatrix.array.set(old.instanceMatrix.array); m.instanceColor.array.set(old.instanceColor.array); }
  m.count = 0;
  m.frustumCulled = false;
  m.renderOrder = k.tr ? 0.5 : 0;
  m.visible = false;
  m.userData.aA = aA;
  m.name = 'fxpool:' + name;
  return m;
}

/* api: scene, cam (порядок прозрачных — от дальних к ближним), geo { spark, bit, puff } — геометрии game.js (у нас — их копии), fxLow / fxDrop / fxLife (gfx.js),
   legacy(mesh, o, floor) — старый fxAdd game.js (для ?oldfx) */
export function init (api) {
  if (SCENE) return;
  SCENE = api.scene;
  CAM = api.cam || null;
  if (api.fxLow) LOW = api.fxLow;
  if (api.fxDrop) DROP = api.fxDrop;
  if (api.fxLife) LIFE = api.fxLife;
  LEGACY = api.legacy || null;
  GEO = {
    spark: api.geo.spark, bit: api.geo.bit, debris: api.geo.bit, puff: api.geo.puff,
    ring: new THREE.TorusGeometry(0.22, 0.07, 6, 14), bubble: new THREE.SphereGeometry(0.1, 8, 6),
  };
  // все виды — на сцене с загрузки (пустые, невидимые): программы собирает кусок shaders (warmup.js), посреди смены — ни одной
  for (const name in KINDS) {
    const cap = name === 'puff' ? FXP.START_PUFF : FXP.START, m = meshFor(name, cap, null);
    SCENE.add(m);
    POOLS[name] = { mesh: m, cap, n: 0, L: [], tr: KINDS[name].tr };
  }
}

/* запас кончился — меш вдвое больше (раз-два за игру; до CAP) */
function grow (P, name) {
  if (P.cap >= FXP.CAP) return false;
  const cap = Math.min(FXP.CAP, P.cap * 2), old = P.mesh, m = meshFor(name, cap, old);
  m.count = old.count; m.visible = old.visible;
  SCENE.remove(old); SCENE.add(m);
  old.dispose();                                  // буферы старого меша (геометрия и материал переходят новому)
  P.mesh = m; P.cap = cap; STATS.grown++;
  return true;
}

/* записать частицу в ячейку i меша */
function put (P, i, p) {
  const m = P.mesh, e = m.instanceMatrix.array, o = i * 16;
  if (p.rx === 0 && p.ry === 0 && p.rz === 0) {
    const s = p.s;
    e[o] = s; e[o + 1] = 0; e[o + 2] = 0; e[o + 3] = 0;
    e[o + 4] = 0; e[o + 5] = s; e[o + 6] = 0; e[o + 7] = 0;
    e[o + 8] = 0; e[o + 9] = 0; e[o + 10] = s; e[o + 11] = 0;
    e[o + 12] = p.x; e[o + 13] = p.y; e[o + 14] = p.z; e[o + 15] = 1;
  } else {
    POS.set(p.x, p.y, p.z); SCL.set(p.s, p.s, p.s);
    Q.setFromEuler(EU.set(p.rx, p.ry, p.rz));
    M4.compose(POS, Q, SCL).toArray(e, o);
  }
  const c = m.instanceColor.array, j = i * 3;
  c[j] = p.r; c[j + 1] = p.g; c[j + 2] = p.b;
  if (P.tr) m.userData.aA.array[i] = p.a;
}

/* в видеокарту — только занятая часть буфера; отрезок один на кадр (three.js сам очищает список после загрузки) */
function dirty (a, n) {
  const r = a.updateRanges;
  if (r.length) { r[0].start = 0; if (r[0].count < n) r[0].count = n; } else a.addUpdateRange(0, n);
  a.needsUpdate = true;
}
function flush (P) {
  const m = P.mesh, n = P.n;
  m.count = n;
  m.visible = n > 0;
  if (!n) return;
  dirty(m.instanceMatrix, n * 16);
  dirty(m.instanceColor, n * 3);
  if (P.tr) dirty(m.userData.aA, n);
}

/* частица. kind — вид (KINDS), x/y/z — где (y — уже с полом), hex — цвет, s — размер (масштаб), a — прозрачность
   в первом кадре (прозрачные виды; дальше — по жизни), o — { vx, vy, vz, life, max, grow, spin, gravity, ry, floor, keep },
   floor — пол для отскока (у кого тяжесть; o.floor важнее). keep — не прореживать на «эффекты: меньше» */
export function part (kind, x, y, z, hex, s, a, o, floor) {
  const P = POOLS[kind];
  if (!P) return;
  if (OLD && LEGACY) { oldPart(kind, x, y, z, hex, s, a, o, floor); return; }
  // графика «эффекты: меньше» (gfx.js): мелкие частицы — через одну, все — короче (как fxAdd)
  let life = o.life || 1, max = o.max || 1;
  if (LOW()) {
    if (KINDS[kind].small && !o.keep && DROP()) return;
    const k = LIFE();
    if (o.life) life *= k;
    if (o.max) max *= k;
  }
  if (P.n >= P.cap && !grow(P, kind)) { STATS.dropped++; return; }
  const p = NFREE ? FREE[--NFREE] : mk();
  p.x = x; p.y = y; p.z = z;
  p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
  p.life = life; p.max = max;
  p.grow = o.grow || 0; p.spin = o.spin || 0; p.gravity = o.gravity || 0;
  p.floor = o.floor !== undefined ? o.floor : (floor || 0);
  p.s = s; p.rx = 0; p.ry = o.ry || 0; p.rz = 0;
  COL.setHex(hex);
  p.r = COL.r; p.g = COL.g; p.b = COL.b;
  p.a = a;
  const i = P.n++;
  P.L[i] = p;
  put(P, i, p);                                   // видна уже в этом кадре — как меш, добавленный на сцену
  flush(P);
  STATS.spawned++;
}

/* шаг: как updateFX в game.js — скорость, тяжесть с отскоком, вращение, рост, прозрачность по жизни */
export function step (dt) {
  if (!SCENE) return;
  let alive = 0;
  for (const name in POOLS) {
    const P = POOLS[name], L = P.L;
    let n = 0;
    for (let i = 0; i < P.n; i++) {
      const p = L[i];
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.spin) { p.rx += p.spin * dt; p.rz += p.spin * 0.7 * dt; }
      if (p.grow) p.s *= 1 + p.grow * dt;
      if (p.gravity && p.y < p.floor + 0.12) { p.y = p.floor + 0.12; p.vy *= -0.3; p.vx *= 0.5; p.vz *= 0.5; }
      p.life -= dt;
      if (p.life <= 0) { FREE[NFREE++] = p; continue; }
      if (P.tr) { const k = p.life / p.max; p.a = (k < 0 ? 0 : k > 1 ? 1 : k) * 0.85; }
      L[n++] = p;
    }
    for (let i = n; i < P.n; i++) L[i] = null;
    P.n = n;
    if (P.tr && CAM && n > 1) depthSort(L, n);
    for (let i = 0; i < n; i++) put(P, i, L[i]);
    alive += n;
    flush(P);
  }
  STATS.alive = alive;
  if (alive > STATS.peak) STATS.peak = alive;
}

/* прозрачные — от дальних к ближним, как three.js сортирует отдельные меши (иначе дым, рождённый позже, всегда
   поверх огня взрыва). Вставками: порядок от кадра к кадру почти тот же — проход почти линейный */
function depthSort (L, n) {
  const e = CAM.matrixWorld.elements, cx = e[12], cy = e[13], cz = e[14], fx = -e[8], fy = -e[9], fz = -e[10];
  for (let i = 0; i < n; i++) { const p = L[i]; p.d = (p.x - cx) * fx + (p.y - cy) * fy + (p.z - cz) * fz; }
  for (let i = 1; i < n; i++) {
    const p = L[i], k = p.d;
    let j = i - 1;
    while (j >= 0 && L[j].d < k) { L[j + 1] = L[j]; j--; }
    L[j + 1] = p;
  }
}

/* сколько частиц вида живо (для замеров) */
export const count = kind => (POOLS[kind] ? POOLS[kind].n : 0);

/* ?oldfx: как было — меш и материал на частицу, через старый fxAdd */
function oldPart (kind, x, y, z, hex, s, a, o, floor) {
  const k = KINDS[kind];
  const mat = k.mat === 'lambert' ? new THREE.MeshLambertMaterial({ color: hex, flatShading: true })
    : k.tr ? new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: a, depthWrite: false })
      : new THREE.MeshBasicMaterial({ color: hex });
  const m = new THREE.Mesh(GEO[kind], mat);
  m.position.set(x, y, z);
  if (s !== 1) m.scale.setScalar(s);
  if (o.ry) m.rotation.y = o.ry;
  STATS.old++;
  LEGACY(m, o, floor);
}
