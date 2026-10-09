/* Отсечение статики по дальности и заморозка матриц — чтобы кадр держал
   60 fps на Steam Deck. Время кадра там съедает не логика игры, а обход сцены
   three.js: у Северска ~13 тысяч объектов, и каждый кадр для каждого считается
   матрица (updateMatrixWorld) и проверяется, попал ли он в кадр (projectObject).

   freeze() — один раз после сборки города: всё неподвижное, что лежит в
   мировых координатах (склейки LIT/FLAT/LAMPH, куски LITM/FLATM, слои сезонов,
   знаки), получает matrixAutoUpdate = false и попадает в список отсечения.
   Неподвижное — значит с нулевым положением, поворотом и масштабом: у всего,
   что ездит и ходит, положение не нулевое, его не трогаем.

   step() — каждый кадр перед рендером. Раз в CULL_EVERY кадров куски дальше
   камеры (far + радиус куска) снимаются со сцены и возвращаются, когда
   подъедешь. Видимость (visible) не трогаем — её переключают сезоны.
   Если кто-то всё-таки сдвинул замороженный меш — он размораживается.
   Матрицы сцены считает сам step(), а не рендер: только у видимого и живого —
   невидимые группы (машины и люди за кадром), замороженный реквизит, склейки
   города и стоящие на месте лёгкие машины пропускаются целиком.

   Реквизит (фонари, светофоры, лавочки — PROPS из game.js) двигается только
   пока падает после удара. Стоит или уже лежит — матрицы заморожены целиком
   (matrixWorldAutoUpdate = false на пивоте), а дальше камеры — снят со сцены. */

import * as THREE from '../vendor/three.module.min.js';

const CULL_EVERY = 12;
const MAX_R = 400;              // больше — это юбка земли и река: они всегда на сцене

let LIST = [], SCENE = null, CAM = null, PROPS = [], tick = 0;
export const STATS = { frozen: 0, culled: 0, groups: 0, props: 0, propsOff: 0, cells: 0, cellsOut: 0, outMeshes: 0 };

/* ── что в кадре: клетки статики (09.10.2026, хвост кадров на Деке) ──
   three.js в каждом кадре проверяет КАЖДЫЙ видимый меш сцены на попадание в кадр (projectObject →
   frustum.intersectsObject). Статики в радиусе дальности (490 м) — ~8 тысяч кусков, а в кадр
   попадает меньше трети: остальное сзади и по бокам. На Деке эта проверка была самым дорогим
   куском кадра (~40 % времени процессора). Теперь куски статики разложены по клеткам VIEW_CELL м;
   раз в кадр — проверка коробки клетки (сотни проверок вместо тысяч), и у кусков клетки вне кадра
   выключен слой (layers.mask = 0) — three.js проходит их, не считая. Видимость (visible) не
   трогаем: её переключают сезоны. Слои в игре больше никто не использует.
   Камера та же для всех отрисовок (главная, катсцены, меню) — inView() годится и для машин и людей. */
const VIEW_CELL = 128;
/* VIEW.on = false (или ?noview) — без отсечения по кадру: для сравнения замеров (tools/perf.cjs, probe) */
export const VIEW = { on: typeof location === 'undefined' || !/[?&]noview(&|$)/.test(location.search) };
let CELLS = [], masked = false;
const FR = new THREE.Frustum(), PS = new THREE.Matrix4(), BOX = new THREE.Box3(), SPH = new THREE.Sphere();
let frOk = false;
function viewFrustum () {
  CAM.updateMatrixWorld();
  PS.multiplyMatrices(CAM.projectionMatrix, CAM.matrixWorldInverse);
  FR.setFromProjectionMatrix(PS);
  frOk = true;
}
/** пирамиду кадра — сейчас (камера уже на месте в этом кадре): для inView() до step() */
export function view () { if (CAM && VIEW.on) viewFrustum(); else frOk = false; }
/** шар (x, y, z, r) в кадре камеры — по пирамиде, посчитанной в этом кадре в step(); до первого step() — да */
export function inView (x, y, z, r) {
  if (!frOk) return true;
  SPH.center.set(x, y, z); SPH.radius = r;
  return FR.intersectsSphere(SPH);
}
function buildCells () {
  const M = new Map();
  for (const e of LIST) {
    const k = Math.floor(e.x / VIEW_CELL) + ',' + Math.floor(e.z / VIEW_CELL);
    let c = M.get(k);
    if (!c) M.set(k, c = { box: new THREE.Box3(), list: [], vis: true, cx: 0, cz: 0, rad: 0 });
    c.list.push(e);
    c.box.expandByPoint(BOX.min.set(e.x - e.r, e.y - e.r, e.z - e.r));
    c.box.expandByPoint(BOX.max.set(e.x + e.r, e.y + e.r, e.z + e.r));
  }
  CELLS = [...M.values()];
  for (const c of CELLS) { const b = c.box; c.cx = (b.min.x + b.max.x) / 2; c.cz = (b.min.z + b.max.z) / 2; c.rad = Math.hypot(b.max.x - b.min.x, b.max.z - b.min.z) / 2; }
  STATS.cells = CELLS.length;
  nearCells();
}
/* клетки в пределах дальности — раз в CULL_EVERY кадров или сразу, если камера прыгнула:
   каждый кадр пирамиду проверяем только у них (десятки, а не 4 тысячи по всему городу) */
let NEAR = [], nearX = 1e9, nearZ = 1e9;
function nearCells () {
  const px = CAM.position.x, pz = CAM.position.z, far = CAM.far + 20;
  NEAR = [];
  for (const c of CELLS) { const dx = c.cx - px, dz = c.cz - pz, r = far + c.rad; if (dx * dx + dz * dz < r * r) NEAR.push(c); }
  nearX = px; nearZ = pz;
}
function cellCull () {
  let out = 0, om = 0;
  masked = true;
  for (let i = 0; i < NEAR.length; i++) {
    const c = NEAR[i], v = FR.intersectsBox(c.box);
    if (v !== c.vis) {
      c.vis = v;
      const L = c.list, mask = v ? 1 : 0;
      for (let j = 0; j < L.length; j++) if (!L[j].gone) L[j].m.layers.mask = mask;
    }
    if (!v) { out++; om += c.list.length; }
  }
  STATS.cellsOut = out; STATS.outMeshes = om;
}

const still = o => o.position.x === 0 && o.position.y === 0 && o.position.z === 0 &&
  o.rotation.x === 0 && o.rotation.y === 0 && o.rotation.z === 0 &&
  o.scale.x === 1 && o.scale.y === 1 && o.scale.z === 1;

function take (m, parent) {
  m.matrixAutoUpdate = false;
  m.updateMatrix();
  m.matrixWorld.copy(m.matrix);
  if (parent !== SCENE) m.matrixWorld.premultiply(parent.matrixWorld);
  STATS.frozen++;
  const g = m.geometry;
  if (m.isInstancedMesh || m.frustumCulled === false || !g) return;
  if (!g.boundingSphere) g.computeBoundingSphere();
  const s = g.boundingSphere;
  if (!s || !(s.radius < MAX_R)) return;
  if (parent === SCENE) m.matrixWorldAutoUpdate = false;   // step() не зовёт ему updateMatrixWorld каждый кадр (их тысячи); сдвинут — cullFar вернёт
  LIST.push({ m, parent, x: s.center.x, y: s.center.y, z: s.center.z, r: s.radius, on: true });
}

export function freeze (scene, cam, props) {
  for (const c of CELLS) for (const e of c.list) if (!e.gone) e.m.layers.mask = 1;   // второй раз — с чистого листа
  CELLS = []; NEAR = []; OFF = 0;
  SCENE = scene; CAM = cam; LIST = []; PROPS = props || [];
  POFF = PROPS.filter(p => p._fz && p._on === false).length;
  for (const c of scene.children.slice()) {
    if (c.isMesh && still(c)) take(c, scene);
    else if (c.isGroup && still(c) && c.matrixWorldAutoUpdate === false) {
      c.updateMatrixWorld(true);
      for (const k of c.children.slice()) if (k.isMesh && still(k)) take(k, c);
    }
  }
  /* Матрицы сцены дальше считает step(), а не рендер. В three.js r169 сцена
     сама пересобирает свою матрицу каждый кадр и тем «толкает» весь граф:
     все ~7 тысяч объектов (и замороженные, и спрятанные) заново перемножали
     матрицы в каждом кадре — на Деке это 3–4 мс из 16,7. Сцена не двигается */
  scene.updateMatrixWorld(true);
  scene.matrixAutoUpdate = false;
  scene.matrixWorldAutoUpdate = false;
  buildCells();
  return STATS;
}

/* Лёгкая машина (одна склейка кузова и фары — makeCarLite) внутри не
   шевелится: стоит на месте — её матрицы те же, что в прошлом кадре.
   Таких у бордюров и на парковках под сотню в кадре */
function moved (c) {
  const p = c.position, q = c.quaternion, s = c.scale;
  let k = c.userData._pose;
  if (!k) k = c.userData._pose = new Float64Array(10).fill(NaN);
  if (k[0] === p.x && k[1] === p.y && k[2] === p.z && k[3] === q.x && k[4] === q.y && k[5] === q.z && k[6] === q.w && k[7] === s.x && k[8] === s.y && k[9] === s.z) return false;
  k[0] = p.x; k[1] = p.y; k[2] = p.z; k[3] = q.x; k[4] = q.y; k[5] = q.z; k[6] = q.w; k[7] = s.x; k[8] = s.y; k[9] = s.z;
  return true;
}

/* падает — живой; стоит или лёг — заморожен (и может уйти со сцены вдали) */
const falling = p => p.down && p.tilt < 1.45;
function propFreeze (p) {
  const g = p.pivot;
  g.matrixAutoUpdate = true; g.updateMatrixWorld(true);
  g.matrixAutoUpdate = false; g.matrixWorldAutoUpdate = false;
  p._fz = 1; if (p._on === undefined) p._on = true;
}
function propThaw (p) {
  const g = p.pivot;
  g.matrixAutoUpdate = true; g.matrixWorldAutoUpdate = true;
  if (!p._on) { SCENE.add(g); p._on = true; POFF--; }
  p._fz = 0;
}

/** камера прыгнула далеко (смена профиля в меню, game.js reprofile): дальние — сразу, не через CULL_EVERY кадров */
export function refresh () { if (SCENE) cullFar(); }
export function step () {
  if (!SCENE) return;
  let np = 0;
  for (const p of PROPS) {
    if (falling(p)) { if (p._fz) propThaw(p); }
    else if (!p._fz) propFreeze(p);
    else np++;
  }
  STATS.props = np;
  /* дальнее — по кусочку в каждом кадре (1/CULL_EVERY списка), а не всё разом раз в 12 кадров:
     11 тысяч кусков разом давали на Деке рывок кадра 1—3 мс каждые 12 кадров. Камера прыгнула
     (смерть, новая смена, телепорт) — сразу всё */
  tick++;
  const jump = Math.abs(CAM.position.x - nearX) + Math.abs(CAM.position.z - nearZ) > 60;
  if (jump) cullFar(); else cullFar(tick % CULL_EVERY, CULL_EVERY);
  if (jump || tick % CULL_EVERY === 0) nearCells();
  if (VIEW.on) { viewFrustum(); cellCull(); }
  else if (masked) { masked = false; frOk = false; for (const c of CELLS) { c.vis = true; for (const e of c.list) if (!e.gone) e.m.layers.mask = 1; } STATS.cellsOut = STATS.outMeshes = 0; }
  // матрицы — только у видимого и живого (см. freeze): спрятанные группы,
  // замороженный реквизит, склейки города и стоящие лёгкие машины пропускаем
  let g = 0, still2 = 0;
  for (const c of SCENE.children) {
    if (c.isGroup && c.matrixAutoUpdate) {
      let on = c.visible;
      if (on && c.userData.lite && !moved(c)) { on = false; still2++; }
      c.matrixWorldAutoUpdate = on; g++;
    }
    if (c.visible && c.matrixWorldAutoUpdate) c.updateMatrixWorld();
  }
  STATS.groups = g; STATS.stillCars = still2;
}

/* part, of — каждый of-й элемент, начиная с part (по кусочку в кадр); без них — весь список */
let OFF = 0, POFF = 0;
function cullFar (part = 0, of = 1) {
  const px = CAM.position.x, pz = CAM.position.z, far = CAM.far + 20;
  for (let i = LIST.length - 1 - part; i >= 0; i -= of) {
    const e = LIST[i], m = e.m;
    if (!still(m)) {                                // кто-то сдвинул — больше не наш
      m.matrixAutoUpdate = true; m.matrixWorldAutoUpdate = true;
      e.gone = true; m.layers.mask = 1;             // и не в клетках «что в кадре»
      if (!e.on) { e.parent.add(m); OFF--; }
      LIST.splice(i, 1);
      continue;
    }
    const dx = e.x - px, dz = e.z - pz, lim = far + e.r;   // как hypot(dx, dz) - r < far, без Math.hypot (он сорит числами)
    const want = dx * dx + dz * dz < lim * lim;
    if (want !== e.on) {
      e.on = want;
      if (want) { e.parent.add(m); OFF--; } else { e.parent.remove(m); OFF++; }
    }
  }
  STATS.culled = OFF;
  for (let i = part; i < PROPS.length; i += of) {
    const p = PROPS[i];
    if (!p._fz) continue;
    const dx = p.x - px, dz = p.z - pz, want = dx * dx + dz * dz < far * far;
    if (want !== p._on) { p._on = want; if (want) { SCENE.add(p.pivot); POFF--; } else { SCENE.remove(p.pivot); POFF++; } }
  }
  STATS.propsOff = POFF;
}

/* ── страховка на слабом железе: дальность видимости по ступеням ──
   Кадр в среднем длиннее 18,5 мс две секунды подряд — ступень вниз: туман и
   дальний край камеры ближе (0,85, потом 0,72 от полной дальности), а с ними
   и отсечение выше — меньше города в обходе сцены. Двенадцать секунд с запасом —
   ступень обратно. Меряем только во время езды: меню и пауза не в счёт.

   Чтобы страховка не качалась туда-сюда (на Деке так и было: на полной
   дальности кадр чуть не успевает → ступень вниз → через 12 с обратно → снова
   не успевает — и так по кругу, с рывком и скачком тумана каждый раз):
   - не вышло подняться (через 20 с снова пришлось опускать) — следующая
     попытка вдвое позже: 12 с, 24, 48… до 4 минут; прожили наверху минуту — снова 12 с;
   - дальность меняется не скачком, а плавно, за пару секунд — туман и край
     камеры ползут, дома вдали не выпрыгивают;
   - кадр длинный, но код игры занял меньше половины его — дело не в нас
     (на Деке стоит ограничение 40/45 fps или экран на 50 Гц): дальность не режем. */
const LEVELS = [1, 0.85, 0.72];
/* base — полная дальность по настройке графики (gfx.js: 250 / 370 / 490 м), fps — на сколько
   кадров в секунду рассчитан кадр (ограничение 30 к/с — пороги вдвое длиннее, иначе 30 к/с
   сами по себе выглядели бы «не успевает») */
export const Q = { lvl: 0, k: 1, base: 490, fps: 60 };
let ema = 1 / 60, busy = 1 / 120, slowT = 0, fastT = 0, coolT = 0, clock = 0, upAt = -1e9, downAt = -1e9, upWait = 12, farF = 490;
/* сколько занял сам кадр игры (секунды) — зовётся после рендера */
export function work (sec) { if (sec > 0 && sec < 0.2) busy += (sec - busy) * 0.05; }
export function govern (raw, active) {
  const want = LEVELS[Q.lvl];
  if (Q.k !== want) {                              // плавный переход, ~1,5 с
    const d = want - Q.k, st = Math.min(0.1, raw > 0 ? raw : 0) * 0.1;
    Q.k = Math.abs(d) <= st ? want : Q.k + Math.sign(d) * st;
  }
  if (CAM && Q.base * Q.k !== farF) { farF = Q.base * Q.k; CAM.far = farF; CAM.updateProjectionMatrix(); }
  if (!active || !(raw > 0) || raw > 0.1) return;
  clock += raw;
  ema += (raw - ema) * 0.05;
  coolT = Math.max(0, coolT - raw);
  if (upAt > downAt && clock - upAt > 60) upWait = 12;          // поднялись и держимся минуту — всё хорошо
  const ours = busy > ema * 0.5;                   // долгий кадр — из-за нас, а не из-за ограничения кадров
  const f = Q.fps || 60;                           // 60: «долгий» — дольше 1/54 с, «с запасом» — короче 1/58,5
  if (ema > 1 / (f * 0.9) && ours) { slowT += raw; fastT = 0; } else if (ema < 1 / (f * 0.975)) { fastT += raw; slowT = 0; } else { slowT = 0; fastT = 0; }
  let to = Q.lvl;
  if (slowT > 2 && Q.lvl < LEVELS.length - 1 && !coolT) to = Q.lvl + 1;
  else if (fastT > upWait && Q.lvl > 0) to = Q.lvl - 1;
  if (to === Q.lvl) return;
  if (to > Q.lvl) { if (clock - upAt < 20) upWait = Math.min(240, upWait * 2); downAt = clock; }   // только что поднимались — не вышло
  if (to < Q.lvl) upAt = clock;
  Q.lvl = to; slowT = fastT = 0; coolT = 4;
  STATS.q = to; STATS.switches = (STATS.switches || 0) + 1; STATS.upWait = upWait;
}
