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
export const STATS = { frozen: 0, culled: 0, groups: 0, props: 0, propsOff: 0, cells: 0, cellsOut: 0, outMeshes: 0, big: 0, boxOut: 0, mwSkip: 0, farMs: 0 };

/* ── что в кадре: клетки статики (09.10.2026, хвост кадров на Деке) ──
   three.js в каждом кадре проверяет КАЖДЫЙ видимый меш сцены на попадание в кадр (projectObject →
   frustum.intersectsObject). Статики в радиусе дальности (490 м) — ~8 тысяч кусков, а в кадр
   попадает меньше трети: остальное сзади и по бокам. На Деке эта проверка была самым дорогим
   куском кадра (~40 % времени процессора). Теперь куски статики разложены по клеткам VIEW_CELL м;
   раз в кадр — проверка коробки клетки (сотни проверок вместо тысяч), и у кусков клетки вне кадра
   выключен слой (layers.mask = 0) — three.js проходит их, не считая. Видимость (visible) не
   трогаем: её переключают сезоны. Слои в игре больше никто не использует.
   Камера та же для всех отрисовок (главная, катсцены, меню) — inView() годится и для машин и людей.
   Большие куски (клетки статики 200 м: земля, разметка, склейки реквизита, деревья — радиус от BIG_R м; таких ~6 тыс. на город) в клетке, что в кадре,
   проверяются ещё и своей коробкой (17.10.2026): шар клетки 200 м — радиус ~140 м, он задевает кадр куда чаще, чем сама
   клетка (сзади и сбоку камеры, над и под ней) — ~5 лишних вызовов отрисовки в кадре на «Деке» (docs/AGENTS.md «Слои статики»). Коробку кладёт тот, кто
   собрал геометрию (game.js boundSphere, seasons.js Pile), или она считается здесь, пока вершины ещё в памяти. */
const VIEW_CELL = 128;
const BIG_R = 80;
const BOX_ON = typeof location === 'undefined' || !/[?&]nobox(&|$)/.test(location.search);   // ?nobox — без коробок, для замера
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
    if (!c) M.set(k, c = { box: new THREE.Box3(), list: [], big: [], vis: true, cx: 0, cz: 0, rad: 0 });
    c.list.push(e);
    if (e.box) c.big.push(e);
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
  let out = 0, om = 0, bo = 0;
  masked = true;
  for (let i = 0; i < NEAR.length; i++) {
    const c = NEAR[i], v = FR.intersectsBox(c.box);
    if (v !== c.vis) {
      c.vis = v;
      const L = c.list, mask = v ? 1 : 0;
      for (let j = 0; j < L.length; j++) if (!L[j].gone) { L[j].m.layers.mask = mask; L[j].bw = mask; }
    }
    if (!v) { out++; om += c.list.length; continue; }
    // клетка в кадре — большие куски ещё и своей коробкой
    const B = c.big;
    for (let j = 0; j < B.length; j++) {
      const e = B[j];
      if (e.gone || !e.on) continue;
      const w = FR.intersectsBox(e.box) ? 1 : 0;
      if (w !== e.bw) { e.bw = w; e.m.layers.mask = w; }
      if (!w) bo++;
    }
  }
  STATS.cellsOut = out; STATS.outMeshes = om; STATS.boxOut = bo;
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
  let box = null;
  if (BOX_ON && s.radius >= BIG_R) {
    if (!g.boundingBox && g.attributes.position && g.attributes.position.array) g.computeBoundingBox();
    // запас 3 м: ветер урагана клонит кроны, разбитый сугроб чуть шире — коробка геометрии их не знает
    if (g.boundingBox && !g.boundingBox.isEmpty()) { box = g.boundingBox.clone().expandByScalar(3); STATS.big++; }
  }
  LIST.push({ m, parent, x: s.center.x, y: s.center.y, z: s.center.z, r: s.radius, on: true, box, bw: 1 });
}

export function freeze (scene, cam, props) {
  for (const c of CELLS) for (const e of c.list) if (!e.gone) e.m.layers.mask = 1;   // второй раз — с чистого листа
  CELLS = []; NEAR = []; OFF = 0; STATS.big = 0; SCH = null;
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
  // дальнее и ближние клетки — сразу, а не в первом кадре мира после сборки (на Деке он и так самый долгий: ~10 мс отсюда)
  if (CAM) { farAll(); nearCells(); }
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
export function refresh () { if (SCENE) { if (FAR_OLD) cullFar(); else farAll(); } }
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
  const tf = performance.now();
  if (FAR_OLD) { if (jump) cullFar(); else cullFar(tick % CULL_EVERY, CULL_EVERY); }
  else if (jump || !SCH) farAll();
  else farStep(tick % CULL_EVERY, CULL_EVERY);
  STATS.farMs += (performance.now() - tf - STATS.farMs) * 0.02;   // дальнее, мс на кадр (сглажено) — для замеров
  if (jump || tick % CULL_EVERY === 0) nearCells();
  if (VIEW.on) { viewFrustum(); cellCull(); }
  else if (masked) { masked = false; frOk = false; for (const c of CELLS) { c.vis = true; for (const e of c.list) if (!e.gone) { e.m.layers.mask = 1; e.bw = 1; } } STATS.cellsOut = STATS.outMeshes = STATS.boxOut = 0; }
  // матрицы — только у видимого и живого (см. freeze): спрятанные группы,
  // замороженный реквизит, склейки города и стоящие лёгкие машины пропускаем
  let g = 0, still2 = 0;
  SKIP = 0;
  for (const c of SCENE.children) {
    if (c.isGroup && c.matrixAutoUpdate) {
      let on = c.visible;
      if (on && c.userData.lite && !moved(c)) { on = false; still2++; }
      c.matrixWorldAutoUpdate = on; g++;
    }
    if (c.visible && c.matrixWorldAutoUpdate) { if (MW_SKIP) upd(c, false); else c.updateMatrixWorld(); }
  }
  STATS.groups = g; STATS.stillCars = still2; STATS.mwSkip = SKIP;
}

/* updateMatrixWorld three.js, только спрятанное внутри видимого (visible = false) не обходим (17.10.2026): у дальнего
   человека (humanLod) спрятаны кости, тело и всё, что у него в руках, — ~340 узлов из ~960 в кадре на «Деке» считались
   зря. Спрятанному ставим matrixWorldNeedsUpdate: покажут — пересчитается в том же кадре, до отрисовки, вместе с детьми.
   Кто читает matrixWorld спрятанного сам (localToWorld у кости дальнего) — сначала updateWorldMatrix(true, false).
   У кого свой updateMatrixWorld (колёса лёгких машин курьеров, SkinnedMesh) — зовём его, как раньше.
   ?mwall — как раньше (обходить всё), для замеров */
const UMW = THREE.Object3D.prototype.updateMatrixWorld;
const MW_SKIP = typeof location === 'undefined' || !/[?&]mwall(&|$)/.test(location.search);
let SKIP = 0;
function upd (o, force) {
  if (o.updateMatrixWorld !== UMW) { o.updateMatrixWorld(force); return; }
  if (o.matrixAutoUpdate) o.updateMatrix();
  if (o.matrixWorldNeedsUpdate || force) {
    if (o.matrixWorldAutoUpdate) { const p = o.parent; if (p === null) o.matrixWorld.copy(o.matrix); else o.matrixWorld.multiplyMatrices(p.matrixWorld, o.matrix); }
    o.matrixWorldNeedsUpdate = false;
    force = true;
  }
  const ch = o.children;
  for (let i = 0, n = ch.length; i < n; i++) {
    const k = ch[i];
    if (k.visible) upd(k, force);
    else { k.matrixWorldNeedsUpdate = true; SKIP++; }
  }
}

/* Дальнее по расписанию (17.10.2026, docs/AGENTS.md «Слои статики»): было — каждый кадр 1/12 списка (~620 кусков из ~7,4 тыс.:
   сдвинут ли и дальше ли дальности), ~0,2 мс кадра на «Деке». Кусок не может перейти границу дальности, пока камера не
   проехала (плюс сколько сдвинулась сама дальность — страховка govern) столько, сколько от него до границы: после проверки
   он ложится в корзину «путь камеры» = сейчас + этот зазор (корзины по FSTEP м), и до неё его не трогают. В кадр — только
   корзины, до которых доехали (обычно пусто или десяток-другой кусков у края дальности). «Сдвинут ли» — отдельно, по
   кусочку: весь список за ~STILL_PASS кадров (кто-то сдвинул замороженное — больше не наш, как было). Камера прыгнула —
   всё разом и расписание заново. ?farold — по-старому, для замера */
const FAR_OLD = typeof location !== 'undefined' && /[?&]farold(&|$)/.test(location.search);
const FSTEP = 4, STILL_PASS = 48;
let SCH = null, ODO = 0, odoK = 0, oX = NaN, oZ = NaN, oF = NaN, stillI = 0;
function farOne (e, px, pz, far) {
  const m = e.m, dx = e.x - px, dz = e.z - pz, lim = far + e.r, d2 = dx * dx + dz * dz;
  const want = d2 < lim * lim;
  if (want !== e.on) {
    e.on = want;
    if (want) { e.parent.add(m); OFF--; } else { e.parent.remove(m); OFF++; }
  }
  const gap = Math.abs(Math.sqrt(d2) - lim);
  const k = Math.max(odoK + 1, Math.floor((ODO + Math.max(gap, FSTEP)) / FSTEP));
  const L = SCH.get(k);
  if (L) L.push(e); else SCH.set(k, [e]);
}
function unfreeze (e, i) {                          // кто-то сдвинул — больше не наш
  const m = e.m;
  m.matrixAutoUpdate = true; m.matrixWorldAutoUpdate = true;
  e.gone = true; m.layers.mask = 1;                 // и не в клетках «что в кадре», и не в расписании
  if (!e.on) { e.parent.add(m); OFF--; }
  LIST.splice(i, 1);
}
function farAll () {
  const px = CAM.position.x, pz = CAM.position.z, far = CAM.far + 20;
  SCH = new Map(); oX = px; oZ = pz; oF = far; odoK = Math.floor(ODO / FSTEP);
  for (let i = LIST.length - 1; i >= 0; i--) { const e = LIST[i]; if (!still(e.m)) { unfreeze(e, i); continue; } farOne(e, px, pz, far); }
  STATS.culled = OFF;
  propsFar(0, 1, px, pz, far);
}
function farStep (part, of) {
  const px = CAM.position.x, pz = CAM.position.z, far = CAM.far + 20;
  ODO += Math.sqrt((px - oX) * (px - oX) + (pz - oZ) * (pz - oZ)) + Math.abs(far - oF);
  oX = px; oZ = pz; oF = far;
  const kNow = Math.floor(ODO / FSTEP);
  let n = 0;
  while (odoK < kNow) {
    odoK++;
    const L = SCH.get(odoK);
    if (!L) continue;
    SCH.delete(odoK);
    for (let j = 0; j < L.length; j++) { const e = L[j]; if (!e.gone) { farOne(e, px, pz, far); n++; } }
  }
  // сдвинут ли — по кусочку
  const per = Math.ceil(LIST.length / STILL_PASS);
  for (let c = 0; c < per && LIST.length; c++) {
    if (stillI >= LIST.length) stillI = 0;
    const e = LIST[stillI];
    if (!still(e.m)) unfreeze(e, stillI); else stillI++;
  }
  STATS.culled = OFF; STATS.farN = n;
  propsFar(part, of, px, pz, far);
}
function propsFar (part, of, px, pz, far) {
  for (let i = part; i < PROPS.length; i += of) {
    const p = PROPS[i];
    if (!p._fz) continue;
    const dx = p.x - px, dz = p.z - pz, want = dx * dx + dz * dz < far * far;
    if (want !== p._on) { p._on = want; if (want) { SCENE.add(p.pivot); POFF--; } else { SCENE.remove(p.pivot); POFF++; } }
  }
  STATS.propsOff = POFF;
}

/* part, of — каждый of-й элемент, начиная с part (по кусочку в кадр); без них — весь список (по-старому: ?farold) */
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
export const Q = { lvl: 0, k: 1, base: 490, fps: 60, t: 1 };   // t — облегчение тяжёлого кадра (tune.js M.far, ставит game.js каждый кадр)
let ema = 1 / 60, busy = 1 / 120, slowT = 0, fastT = 0, coolT = 0, clock = 0, upAt = -1e9, downAt = -1e9, upWait = 12, farF = 490;
/* сколько занял сам кадр игры (секунды) — зовётся после рендера */
export function work (sec) { if (sec > 0 && sec < 0.2) busy += (sec - busy) * 0.05; }
export function govern (raw, active) {
  const want = LEVELS[Q.lvl];
  if (Q.k !== want) {                              // плавный переход, ~1,5 с
    const d = want - Q.k, st = Math.min(0.1, raw > 0 ? raw : 0) * 0.1;
    Q.k = Math.abs(d) <= st ? want : Q.k + Math.sign(d) * st;
  }
  if (CAM && Q.base * Q.k * Q.t !== farF) { farF = Q.base * Q.k * Q.t; CAM.far = farF; CAM.updateProjectionMatrix(); }
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
