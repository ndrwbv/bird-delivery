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
   Плюс у невидимых групп (машины и люди за кадром) не считаем матрицы.

   Реквизит (фонари, светофоры, лавочки — PROPS из game.js) двигается только
   пока падает после удара. Стоит или уже лежит — матрицы заморожены целиком
   (matrixWorldAutoUpdate = false на пивоте), а дальше камеры — снят со сцены. */

const CULL_EVERY = 12;
const MAX_R = 400;              // больше — это юбка земли и река: они всегда на сцене

let LIST = [], SCENE = null, CAM = null, PROPS = [], tick = 0;
export const STATS = { frozen: 0, culled: 0, groups: 0, props: 0, propsOff: 0 };

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
  LIST.push({ m, parent, x: s.center.x, z: s.center.z, r: s.radius, on: true });
}

export function freeze (scene, cam, props) {
  SCENE = scene; CAM = cam; LIST = []; PROPS = props || [];
  for (const c of scene.children.slice()) {
    if (c.isMesh && still(c)) take(c, scene);
    else if (c.isGroup && still(c) && c.matrixWorldAutoUpdate === false) {
      c.updateMatrixWorld(true);
      for (const k of c.children.slice()) if (k.isMesh && still(k)) take(k, c);
    }
  }
  return STATS;
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
  if (!p._on) { SCENE.add(g); p._on = true; }
  p._fz = 0;
}

export function step () {
  if (!SCENE) return;
  let np = 0;
  for (const p of PROPS) {
    if (falling(p)) { if (p._fz) propThaw(p); }
    else if (!p._fz) propFreeze(p);
    else np++;
  }
  STATS.props = np;
  // невидимые группы (машины, люди, реквизит вне кадра) матрицы не считают;
  // стала видимой — со следующего обхода считает снова
  let g = 0;
  for (const c of SCENE.children) if (c.isGroup && c.matrixAutoUpdate) { c.matrixWorldAutoUpdate = c.visible; g++; }
  STATS.groups = g;
  if (++tick % CULL_EVERY) return;
  const px = CAM.position.x, pz = CAM.position.z, far = CAM.far + 20;
  let off = 0;
  for (let i = LIST.length - 1; i >= 0; i--) {
    const e = LIST[i], m = e.m;
    if (!still(m)) {                                // кто-то сдвинул — больше не наш
      m.matrixAutoUpdate = true;
      if (!e.on) e.parent.add(m);
      LIST.splice(i, 1);
      continue;
    }
    const d = Math.hypot(e.x - px, e.z - pz) - e.r;
    const want = d < far;
    if (want !== e.on) {
      e.on = want;
      if (want) e.parent.add(m); else e.parent.remove(m);
    }
    if (!e.on) off++;
  }
  STATS.culled = off;
  let po = 0;
  for (const p of PROPS) {
    if (!p._fz) continue;
    const want = Math.hypot(p.x - px, p.z - pz) < far;
    if (want !== p._on) { p._on = want; if (want) SCENE.add(p.pivot); else SCENE.remove(p.pivot); }
    if (!p._on) po++;
  }
  STATS.propsOff = po;
}

/* ── страховка на слабом железе: дальность видимости по ступеням ──
   Кадр в среднем длиннее 18,5 мс две секунды подряд — ступень вниз: туман и
   дальний край камеры ближе (0,85, потом 0,72 от полной дальности), а с ними
   и отсечение выше — меньше города в обходе сцены. Двенадцать секунд с запасом —
   ступень обратно. Меряем только во время езды: меню и пауза не в счёт. */
const LEVELS = [1, 0.85, 0.72];
const BASE_FAR = 490;
export const Q = { lvl: 0, k: 1 };
let ema = 1 / 60, slowT = 0, fastT = 0, coolT = 0;
export function govern (raw, active) {
  if (!active || !(raw > 0) || raw > 0.1) return;
  ema += (raw - ema) * 0.05;
  coolT = Math.max(0, coolT - raw);
  if (ema > 1 / 54) { slowT += raw; fastT = 0; } else if (ema < 1 / 58.5) { fastT += raw; slowT = 0; } else { slowT = 0; fastT = 0; }
  let to = Q.lvl;
  if (slowT > 2 && Q.lvl < LEVELS.length - 1 && !coolT) to = Q.lvl + 1;
  else if (fastT > 12 && Q.lvl > 0) to = Q.lvl - 1;
  if (to === Q.lvl) return;
  Q.lvl = to; Q.k = LEVELS[to]; slowT = fastT = 0; coolT = 4;
  if (CAM) { CAM.far = BASE_FAR * Q.k; CAM.updateProjectionMatrix(); }
  STATS.q = to;
}
