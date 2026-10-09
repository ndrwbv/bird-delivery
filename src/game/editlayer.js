/* ──────────────────────────────────────────────────────────────────────────
   Правки города из редактора (editor.html, docs/SANDBOX.md → «Редактор города»).

   Автор в редакторе ставит и убирает предметы. Правки — слой поверх карты:
   src/maps/<карта>/edits.json, игра читает его при сборке города (MAP.edits):

     remove — [{ kind, x, z }]: предмет этого вида ближе R_MATCH (0,35 м) к точке убирается.
              Город сначала строится целиком, как без правок (иначе пропажа одной лавочки
              сдвигает жребий у соседей, и «убрать вот это» попадает мимо), а в куске 'edits'
              — до склейки — убранное вынимается: сбиваемое (лавочки, урны, кусты, заборчики,
              песочницы, горки, фонари) — из клеток склейки, сетки ударов и списков (фонарь —
              с плафоном и пятном света), лавочка-реквизит — со сцены, из списков «где посидеть».
              Дерево (game.js tree) не растёт сразу, но его ствол стоит до куска 'edits' — для
              соседей город тот же. Виды — REMOVABLE.
     add    — [{ id, kind, sub, x, z, ry, w, d, h, col }]: ставится куском поздней сборки
              'edits' (после деревьев дворов, до склейки), теми же функциями, что и город:
              дерево — game.js tree (порода sub), лавочка — bench, фонарь — streetlamps.js
              (вид sub), урна, клумба из покрышек, куча песка, выбивалка — сбиваемые
              (smashAdd), коробка-постройка — статика LIT и твёрдый прямоугольник (obb).
              Правила места те же, что у города: дерево и лавочка на дороге и в доме
              не встанут (редактор об этом предупреждает заранее).

   Чтобы «убрать вот это дерево» значило одно и то же каждый запуск, куски поздней сборки,
   которые ставят предметы (SEEDED), идут с зерном Math.random — своим у каждого куска и
   шага (latebuild.js зовёт window.__lateSeed перед каждым). Деревья вдоль улиц, лавочки
   в парках, урны у подъездов брали Math.random — теперь они на тех же местах каждый
   запуск. После куска — снова обычный Math.random (игра дальше случайная, как была).
   Стройки, точки конкурентов, пустыри — без зерна: они по-прежнему каждый раз свои.
   probe --seed ставит своё зерно на всё — тогда наше не ставим.

   ED — для редактора: ED.on (страница editor.html), ED.cam(cam, dt) — своя камера
   вместо камеры меню (game.js зовёт её в кадре меню).
   ────────────────────────────────────────────────────────────────────────── */
import { MAP } from './map.js';

export const ED = { on: typeof window !== 'undefined' && !!window.__EDITOR, cam: null };

/* что можно убрать в редакторе: вид в правке → кто ставит */
export const REMOVABLE = {
  tree: 'дерево или куст (game.js tree: улицы, дворы, острова кругов)',
  forest: 'ель, сосна или куст ельника (forest.js: леса из карты, лес у Ленина, лес на Кольце)',
  lawn: 'мелочь газона (lawnprops.js: покрышки, выбивалка, бельё, песок, ракушки, мусор у баков, оградка)',
  bench: 'лавочка',
  bush: 'куст или клумба у дорожки',
  bin: 'урна',
  fence: 'заборчик (и ворота стройки)',
  sand: 'песочница',
  slide: 'горка',
  lamp: 'фонарь',
  sign: 'знак у дороги или стенд стройки',
  bigfence: 'секция забора стройки или высокого забора у дома',
  board: 'рекламный щит (billboards.js)',
};
/* ельник и мелочь газона строятся у камеры клетками (forest.js, lawnprops.js) — правку смотрят при сборке
   клетки, в игре и в редакторе одинаково. Остальное в редакторе город строит целиком, а убранное прячет
   на месте (hideNow) — так «убрать» видно сразу и отменяется без пересборки */
const LAZY = { forest: 1, lawn: 1 };

/* палитра редактора: что можно поставить (kind + sub). Подписи — по-русски, это инструмент автора */
export const KINDS = [
  { kind: 'tree', sub: 'birch', name: 'берёза', group: 'деревья' },
  { kind: 'tree', sub: 'pine', name: 'сосна', group: 'деревья' },
  { kind: 'tree', sub: 'spruce', name: 'ель', group: 'деревья' },
  { kind: 'tree', sub: 'poplar', name: 'тополь', group: 'деревья' },
  { kind: 'tree', sub: 'maple', name: 'клён', group: 'деревья' },
  { kind: 'tree', sub: 'lime', name: 'липа', group: 'деревья' },
  { kind: 'tree', sub: 'rowan', name: 'рябина', group: 'деревья' },
  { kind: 'tree', sub: 'bush', name: 'куст', group: 'кусты' },
  { kind: 'tree', sub: 'lilac', name: 'сирень', group: 'кусты' },
  { kind: 'tree', sub: 'rosehip', name: 'шиповник', group: 'кусты' },
  { kind: 'bench', name: 'лавочка', group: 'улица' },
  { kind: 'lamp', sub: 'ball', name: 'фонарь-шар', group: 'улица' },
  { kind: 'lamp', sub: 'cobra', name: 'фонарь над дорогой', group: 'улица' },
  { kind: 'lamp', sub: 'park', name: 'фонарик аллеи', group: 'улица' },
  { kind: 'lamp', sub: 'wood', name: 'деревянный столб', group: 'улица' },
  { kind: 'bin', name: 'урна', group: 'улица' },
  { kind: 'tyres', name: 'клумба из покрышек', group: 'мелочь газона' },
  { kind: 'sandpile', name: 'куча песка', group: 'мелочь газона' },
  { kind: 'beater', name: 'выбивалка', group: 'мелочь газона' },
  { kind: 'box', sub: 'shed', name: 'сарай', group: 'постройки', w: 4, d: 3, h: 2.6, col: '#9a8a70' },
  { kind: 'box', sub: 'kiosk', name: 'ларёк', group: 'постройки', w: 3, d: 2.4, h: 2.6, col: '#e2c46a' },
  { kind: 'box', sub: 'garage', name: 'гараж', group: 'постройки', w: 3.6, d: 6, h: 2.6, col: '#8b9098' },
  { kind: 'box', sub: 'block', name: 'коробка', group: 'постройки', w: 8, d: 6, h: 4, col: '#c9b8a0' },
];

const R_MATCH = 0.35;             // убрать — всё этого вида ближе 0,35 м к точке правки
const CELL = 8;
const EDITS = () => (MAP && MAP.edits) || { add: [], remove: [] };

/* ── убранное: сетка по клеткам ──
   Список «убрать» — из edits.json (MAP.edits), а в редакторе — живой (setLive: тот же массив, что правит
   автор). Сколько предметов накрыла каждая правка — HIT по ключу «вид:x:z» (hits(r)) */
let RM = null, APPLYING = false, LIVE = null;
const HIT = new Map();
const rkey = r => r.kind + ':' + (+r.x).toFixed(2) + ':' + (+r.z).toFixed(2);
export const STATS = { removed: {}, get hits () { return (EDITS().remove || []).map(hits); }, added: 0, refused: [] };
export function hits (r) { return HIT.get(rkey(r)) || 0; }
function grid () {
  if (RM) return RM;
  RM = new Map();
  for (const r of LIVE || EDITS().remove || []) {
    if (!r || !isFinite(r.x) || !isFinite(r.z)) continue;
    const k = Math.floor(r.x / CELL) + ',' + Math.floor(r.z / CELL);
    if (!RM.has(k)) RM.set(k, []);
    RM.get(k).push({ kind: r.kind, x: +r.x, z: +r.z, k: rkey(r) });
  }
  return RM;
}
/* правка «убрать», что накрывает этот предмет, или null */
function match (kind, x, z) {
  const G = grid();
  if (!G.size) return null;
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let i = cx - 1; i <= cx + 1; i++) for (let j = cz - 1; j <= cz + 1; j++) {
    const a = G.get(i + ',' + j);
    if (!a) continue;
    for (const r of a) {
      if (r.kind !== kind) continue;
      const dx = r.x - x, dz = r.z - z;
      if (dx * dx + dz * dz <= R_MATCH * R_MATCH) return r;
    }
  }
  return null;
}
const hit = (r, kind) => { HIT.set(r.k, (HIT.get(r.k) || 0) + 1); STATS.removed[kind] = (STATS.removed[kind] || 0) + 1; };
/** этот предмет автор убрал в редакторе — не ставить. В редакторе — только ельник и мелочь газона
    (остальное он строит целиком и прячет на месте: hideNow) */
export function gone (kind, x, z) {
  if (APPLYING || (ED.on && !LAZY[kind])) return false;
  const r = match(kind, x, z);
  if (!r) return false;
  hit(r, kind);
  return true;
}
/** редактор: список «убрать» — живой (массив автора); клетки ельника и газона пересобираются с ним */
export function setLive (list) {
  LIVE = list; RM = null;
  for (const k in LAZY) { const p = PROV[k]; if (p && p.refresh) p.refresh(); }
}

/* ── ельник и мелочь газона: кто что строит у камеры (forest.js, lawnprops.js регистрируют) ──
   PROV[вид] = { list(x, z, r) → [{ x, z, sub }] — что сейчас стоит, refresh(x?, z?, r?) — пересобрать
   клетки с живым списком (без точки — все собранные), built(x, z) — клетка у точки собрана } */
const PROV = {};
export function provide (kind, p) { PROV[kind] = p; }

/* ── зерно сборки ── */
const SEEDED = new Set(['nightlife', 'world', 'construction', 'rivals', 'darknight', 'wastelands', 'beach', 'life', 'entr', 'vents', 'signs', 'gates', 'trees', 'metro', 'lots', 'lights', 'ramps', 'landmarks', 'roadlife', 'billboards', 'cars', 'yard', 'yardbits', 'yardtrees', 'edits', 'seasonyard', 'smash', 'seasons', 'trails']);
const ORIG = Math.random;
let back = false;
const mulberry = s => { let a = s >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const hashName = n => { let h = 0x5EED ^ 0x9E3779B9; for (let i = 0; i < n.length; i++) h = Math.imul(h ^ n.charCodeAt(i), 0x01000193); return h >>> 0; };
const OURS = typeof window !== 'undefined' && !window.__lateSeed;
function seedOn (name) {
  Math.random = mulberry(hashName(name));
  if (!back) { back = true; queueMicrotask(() => { back = false; Math.random = ORIG; }); }   // кусок кончился — игра снова случайная
}
if (OURS) {
  window.__lateSeed = name => {
    name = String(name);
    if (SEEDED.has(name.split('#')[0])) seedOn(name); else Math.random = ORIG;
  };
}
/** game.js buildCity: сразу видимая часть города (дома, дороги…) — тоже с зерном; buildEnd() — после неё */
export function buildStart () { if (OURS) seedOn('city'); }
export function buildEnd () { if (OURS) Math.random = ORIG; }

/* ── поставить добавленное (кусок поздней сборки 'edits') ──
   A: THREE, tree, bench, lamp(o), smashAdd, put, box, LIT, obb, groundH, curbAt, BENCHES */
export const BOXES = [];          // коробки из правок: { id, cx, cz, hw, hd, cs, sn, h } — для npm run check (постройки не на дороге)
export function apply (A) {
  const E = EDITS();
  const { THREE } = A;
  AP = A;
  dropAll(A);
  APPLYING = true;
  try {
    for (const a of E.add || []) {
      if (!a || !isFinite(a.x) || !isFinite(a.z)) continue;
      const x = +a.x, z = +a.z, ry = +a.ry || 0, gy = A.groundH(x, z);
      let ok = true;
      if (a.kind === 'tree') ok = !!A.tree(x, z, 0, a.sub || 'birch');
      else if (a.kind === 'bench') ok = !!A.bench(x, z, ry);
      else if (a.kind === 'lamp') A.lamp({ x, z, style: a.sub || 'ball', dx: Math.cos(ry), dz: -Math.sin(ry) });
      else if (a.kind === 'bin') {
        const g = [];
        A.put(g, new THREE.CylinderGeometry(0.28, 0.24, 0.8, 8), '#4e5a4a', x, gy + 0.4, z);
        A.put(g, new THREE.CylinderGeometry(0.3, 0.3, 0.06, 8), '#3a4238', x, gy + 0.82, z);
        A.smashAdd('bin', x, z, 0.5, g, '#4e5a4a');
      } else if (a.kind === 'tyres') {                // три белёные покрышки кольцом, земля и цветы внутри
        const g = [], cs = Math.cos(ry), sn = Math.sin(ry);
        for (let k = 0; k < 3; k++) {
          const u = (k - 1) * 0.95, px = x + cs * u, pz = z - sn * u;
          A.put(g, new THREE.CylinderGeometry(0.45, 0.45, 0.24, 10), '#f1eee6', px, gy + 0.12, pz);
          A.put(g, new THREE.CylinderGeometry(0.32, 0.32, 0.06, 8), '#5a3d28', px, gy + 0.24, pz);
          A.box(g, 0.16, 0.16, 0.16, ['#e0475a', '#f2c230', '#b65fd0'][k], px, gy + 0.33, pz, ry);
        }
        A.smashAdd('bin', x, z, 1.4, g, '#f1eee6');
      } else if (a.kind === 'sandpile') {
        const g = [];
        A.put(g, new THREE.ConeGeometry(1.3, 0.9, 9), '#d9b56c', x, gy + 0.45, z, 0, ry, 0);
        A.smashAdd('sand', x, z, 1.3, g, '#d9b56c');
      } else if (a.kind === 'beater') {               // выбивалка для ковров: два столба и перекладина
        const g = [], cs = Math.cos(ry), sn = Math.sin(ry);
        for (const u of [-1.3, 1.3]) A.box(g, 0.1, 2.2, 0.1, '#5c6a78', x + cs * u, gy + 1.1, z - sn * u, ry);
        A.box(g, 2.7, 0.08, 0.08, '#5c6a78', x, gy + 2.1, z, ry);
        A.box(g, 2.7, 0.06, 0.06, '#5c6a78', x, gy + 1.5, z, ry);
        A.smashAdd('fence', x, z, 1.4, g, '#5c6a78');
      } else if (a.kind === 'box') {                  // простая постройка: стены, крыша чуть шире и темнее
        const K = KINDS.find(k => k.kind === 'box' && k.sub === a.sub) || KINDS.find(k => k.kind === 'box');
        const w = Math.max(0.5, +a.w || K.w), d = Math.max(0.5, +a.d || K.d), h = Math.max(0.5, +a.h || K.h), col = a.col || K.col;
        const roof = '#' + new THREE.Color(col).multiplyScalar(0.7).getHexString();
        A.box(A.LIT, w, h, d, col, x, gy + h / 2 - 0.3, z, ry);            // на склоне — чуть в землю, не висит
        A.box(A.LIT, w + 0.3, 0.22, d + 0.3, roof, x, gy + h - 0.2, z, ry);
        const s = A.obb(x, z, w / 2, d / 2, -ry);      // obb: угол оси x — atan2(z, x); у поворота меша — наоборот
        BOXES.push({ id: a.id, cx: x, cz: z, hw: w / 2, hd: d / 2, cs: s.cs, sn: s.sn, h });
      } else ok = false;
      if (ok) STATS.added++; else STATS.refused.push(a.id || a.kind);
    }
  } finally { APPLYING = false; }
}

/* ── убрать то, что автор убрал ── */
const keep = (arr, f) => { let j = 0; for (let i = 0; i < arr.length; i++) if (f(arr[i])) arr[j++] = arr[i]; arr.length = j; };
/* сбиваемое, которое можно убрать: у кого свой onDown — только фонари и то, что модуль пометил edOk
   (забор, ворота и стенд стройки); точки конкурентов (rshop) и мусор (junk) — нет: на них держатся их правила */
const allowed = it => REMOVABLE[it.kind] && !LAZY[it.kind] && it.kind !== 'tree' && it.kind !== 'board' && !it.rshop && !it.junk && (!it.onDown || it.kind === 'lamp' || it.edOk);
/* вершины своего куска склейки — под землю (on) или назад */
function squash (it, on) {
  const pos = it.mesh && it.mesh.geometry.attributes.position, a = pos && pos.array;
  if (!a) return false;
  if (on) {
    if (it.edOrig) return true;
    it.edOrig = a.slice(it.v0 * 3, (it.v0 + it.nv) * 3);
    for (let i = it.v0; i < it.v0 + it.nv; i++) { a[i * 3] = it.x; a[i * 3 + 1] = -60; a[i * 3 + 2] = it.z; }
    it.down = 1;
  } else {
    if (!it.edOrig) return false;
    a.set(it.edOrig, it.v0 * 3); it.edOrig = null; it.down = 0;
  }
  pos.needsUpdate = true;
  return true;
}

/* игра: город уже построен как без правок, склейки сбиваемого ещё нет — убранное вынимаем */
function dropAll (A) {
  if (ED.on || !(EDITS().remove || []).length) return;
  keep(A.SOLIDS, s => !s.edGone);                                  // стволы убранных деревьев (game.js tree)
  const out = new Set(), own = new Set();
  for (const it of A.SMASH) if (allowed(it) && gone(it.kind, it.x, it.z)) (it.mesh ? own : out).add(it);
  for (const it of own) squash(it, true);                          // свой меш (высокие заборы, лицо стенда) — вершины под землю
  if (out.size) {
    for (const ch of A.SM_CHUNKS.values()) {
      if (!ch.geos || !ch.items.some(it => out.has(it))) continue;
      const gi = new Set();
      for (const it of ch.items) if (out.has(it)) for (let k = it.g0; k < it.g0 + it.gn; k++) gi.add(k);
      ch.geos = ch.geos.filter((g, k) => !gi.has(k));
      keep(ch.items, it => !out.has(it));
    }
  }
  const all = new Set([...out, ...own]);
  if (all.size) {
    keep(A.SMASH, it => !all.has(it));
    for (const cell of A.SMASH_GRID.values()) keep(cell, it => !all.has(it));
    const lh = new Set();
    for (const it of all) {
      it.down = 1; it.dropped = 1;                                   // кто держит ссылку (дворы, лавочки, стройка) — видит «сбита»
      if (it.kind === 'sign' && A.unsign) A.unsign(it, true);        // таблички знака (roadlife.js)
      if (it.kind !== 'lamp' || !A.unlamp) continue;
      const r = A.unlamp(it);
      if (!r) continue;
      if (r.LH === A.LAMPH) for (const k of r.lh) lh.add(k);
      if (r.spot) { const i = A.LAMP_SPOTS.indexOf(r.spot); if (i >= 0) A.LAMP_SPOTS.splice(i, 1); }
    }
    if (lh.size) { let k = 0; keep(A.LAMPH, () => !lh.has(k++)); }
  }
  // лавочки-реквизит (game.js bench): со сцены и из списков
  const props = new Set();
  for (const p of A.PROPS) if (p.kind === 'bench' && gone('bench', p.x, p.z)) props.add(p);
  if (props.size) { for (const p of props) { A.scene.remove(p.pivot); p.down = 1; } keep(A.PROPS, p => !props.has(p)); }
  // «где посидеть» (кальянщики, протесты, Степан…) — без убранных лавочек
  keep(A.BENCHES, b => !(b.prop && (b.prop.dropped || props.has(b.prop))) && !match('bench', b.x, b.z));
}

/* ── редактор: город целиком, убранное — спрятать на месте и вернуть (отмена) ──
   Деревья: seasons.js в редакторе держит вершины склейки деревьев (TREES — где чьи куски, edTree);
   сбиваемое — вершины под землю; лавочка — спрятать; фонарь — ещё плафон и пятно (streetlamps.js edHide),
   знак — таблички (roadlife.js unsign), щит — billboards.js edHide; ельник и газон — пересобрать клетки */
let AP = null;
const TREES = [];
export const PILE_OF = { get: null };                // seasons.js: ключ клетки склейки деревьев → меш
/** seasons.js (только в редакторе): дерево на x, z — его куски в склейке [{ key, v0, nv }] */
export function edTree (x, z, parts) { TREES.push({ x, z, parts, orig: null }); }
function treeHide (t, on) {
  for (let i = 0; i < t.parts.length; i++) {
    const p = t.parts[i], m = PILE_OF.get && PILE_OF.get(p.key), pos = m && m.geometry.attributes.position, a = pos && pos.array;
    if (!a) continue;
    if (on) {
      if (!t.orig) t.orig = [];
      t.orig[i] = a.slice(p.v0 * 3, (p.v0 + p.nv) * 3);
      for (let v = p.v0; v < p.v0 + p.nv; v++) { a[v * 3] = t.x; a[v * 3 + 1] = -60; a[v * 3 + 2] = t.z; }
    } else if (t.orig && t.orig[i]) a.set(t.orig[i], p.v0 * 3);
    pos.needsUpdate = true;
  }
  t.hid = on ? 1 : 0;
  if (!on) t.orig = null;
}
const HID = new Map();                               // ключ правки → что вернуть
/** спрятать то, что накрывает правка «убрать» (редактор, город уже собран) → сколько нашлось */
export function hideNow (r) {
  if (!ED.on || !r) return 0;
  const k = rkey(r);
  RM = null;
  if (LAZY[r.kind]) { const p = PROV[r.kind]; if (p) p.refresh(+r.x, +r.z, 1); return hits(r); }
  if (!AP) return 0;
  if (HID.has(k)) return HID.get(k).length;
  const und = [], R2 = R_MATCH * R_MATCH, near = (x, z) => (x - r.x) * (x - r.x) + (z - r.z) * (z - r.z) <= R2;
  if (r.kind === 'tree') {
    for (const t of TREES) if (!t.hid && near(t.x, t.z)) { treeHide(t, true); und.push(() => treeHide(t, false)); }
  } else if (r.kind === 'board') {
    const u = AP.board && AP.board(+r.x, +r.z, R_MATCH);
    if (u) und.push(u);
  } else {
    for (const it of AP.SMASH) {
      if (it.kind !== r.kind || it.edOrig || it.down || !near(it.x, it.z) || !allowed(it)) continue;
      if (!squash(it, true)) continue;
      if (it.kind === 'lamp' && AP.lampHide) AP.lampHide(it, true);
      if (it.kind === 'sign' && AP.unsign) AP.unsign(it, true);
      und.push(() => { squash(it, false); if (it.kind === 'lamp' && AP.lampHide) AP.lampHide(it, false); if (it.kind === 'sign' && AP.unsign) AP.unsign(it, false); });
    }
    if (r.kind === 'bench') for (const p of AP.PROPS) if (p.kind === 'bench' && !p.down && near(p.x, p.z)) { p.pivot.visible = false; p.down = 1; und.push(() => { p.pivot.visible = true; p.down = 0; }); }
  }
  HID.set(k, und);
  HIT.set(k, und.length);
  return und.length;
}
/** вернуть спрятанное (правку «убрать» отменили) */
export function showNow (r) {
  if (!ED.on || !r) return;
  const k = rkey(r);
  RM = null;
  if (LAZY[r.kind]) { HIT.delete(k); const p = PROV[r.kind]; if (p) p.refresh(+r.x, +r.z, 1); return; }
  for (const u of HID.get(k) || []) u();
  HID.delete(k); HIT.delete(k);
}
/** пачкой (кисть «убрать всё в круге», отмена): ельник и газон — одна пересборка клеток на всю пачку → сколько нашлось */
export function hideMany (list) { return many(list, hideNow); }
export function showMany (list) { many(list, showNow); }
function many (list, f) {
  let n = 0;
  const lazy = {};
  for (const r of list) {
    if (!LAZY[r.kind]) { n += f(r) || 0; continue; }
    const b = lazy[r.kind] || (lazy[r.kind] = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, list: [] });
    b.x0 = Math.min(b.x0, r.x); b.x1 = Math.max(b.x1, r.x); b.z0 = Math.min(b.z0, r.z); b.z1 = Math.max(b.z1, r.z); b.list.push(r);
  }
  RM = null;
  for (const k in lazy) {
    const b = lazy[k], p = PROV[k];
    if (f === showNow) for (const r of b.list) HIT.delete(rkey(r));
    if (p) p.refresh((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / 2 + 1);
    for (const r of b.list) n += hits(r) > 0 ? 1 : 0;
  }
  return n;
}
/** что можно убрать рядом с точкой (редактор: выбор и «убрать всё в круге»): деревья — по записям склейки,
    сбиваемое, лавочки, щиты, ельник и мелочь газона — у собранных клеток. → [{ kind, x, z, sub? }] */
export function itemsNear (x, z, r) {
  const out = [], R2 = r * r, near = (px, pz) => (px - x) * (px - x) + (pz - z) * (pz - z) <= R2;
  if (!AP) return out;
  for (const t of TREES) if (!t.hid && near(t.x, t.z)) out.push({ kind: 'tree', x: t.x, z: t.z });
  for (const it of AP.SMASH) if (!it.down && near(it.x, it.z) && allowed(it)) out.push({ kind: it.kind, x: it.x, z: it.z });
  for (const p of AP.PROPS) if (p.kind === 'bench' && !p.down && near(p.x, p.z)) out.push({ kind: 'bench', x: p.x, z: p.z });
  if (AP.boards) for (const b of AP.boards()) if (!b.hid && near(b.x, b.z)) out.push({ kind: 'board', x: b.x, z: b.z });
  for (const k in LAZY) if (PROV[k]) for (const q of PROV[k].list(x, z, r)) out.push({ kind: k, ...q });
  return out;
}

export const DEBUG = { ED, STATS, BOXES, KINDS, REMOVABLE, LAZY, R_MATCH, get edits () { return EDITS(); }, match, hits, setLive, hideNow, showNow, hideMany, showMany, itemsNear, PROV, TREES };
