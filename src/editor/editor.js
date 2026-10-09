/* Редактор города: панель, пометки, предметы (docs/SANDBOX.md, «Редактор города»).

   Инструменты:
     смотреть  — только камера (тянуть мышью — повернуть голову);
     пометка   — клик по городу → текст → булавка; файл src/maps/<карта>/notes.json;
     поставить — выбрать предмет в палитре, клик — поставить (R — повернуть на 15°); файл edits.json;
     выбрать   — клик по предмету: свой (поставленный) — повернуть или убрать, городской — убрать;
     кисть     — круг радиуса R: «посадить рощу» (N деревьев выбранных пород вперемешку, не на асфальт)
                 или «убрать всё в круге» (что отмечено галочками).
   Убранное пропадает сразу (editlayer.js hideNow: город в редакторе собран целиком, убранное спрятано на
   месте); поставленное — заготовкой, в городе — после «пересобрать город» (страница перезагружается,
   камера остаётся). Отмена — Ctrl+Z (Cmd+Z) или кнопка, до UNDO_MAX шагов.

   Для probe и агентов — window.__editor: st, goTo, top, side, addNote, place, removeCity, grove, clearCircle,
   undo, pickAt, check, cityNear. */
import { KINDS } from '../game/editlayer.js';
import * as FILES from './files.js';
import { makeCam } from './cam.js';
import { makeMinimap } from './minimap.js';

const NAME = { tree: 'дерево', bench: 'лавочка', bush: 'куст', bin: 'урна', fence: 'заборчик', sand: 'песочница', slide: 'горка', lamp: 'фонарь',
  forest: 'ельник', lawn: 'мелочь газона', sign: 'знак', bigfence: 'забор', board: 'рекламный щит' };
// что именно (sub у ельника и мелочи газона)
const SUBNAME = { spruce: 'ель', pine: 'сосна', bush: 'куст ельника', tire: 'клумба из покрышек', beater: 'выбивалка', line: 'бельё на верёвке',
  sand: 'куча песка', garage: 'ракушка', trash: 'мусор у баков', rail: 'оградка' };
const itemName = r => (r.sub && SUBNAME[r.sub]) || NAME[r.kind] || r.kind;
// высота и толщина «столба», по которому попадает клик: [h, r]
const HGT = { tree: [7, 1.8], bench: [1.1, 1.3], bush: [1.2, 1.1], bin: [0.9, 0.6], fence: [1, 1.2], sand: [0.5, 1.7], slide: [2, 1.3], lamp: [6.5, 0.7],
  forest: [10, 1.3], lawn: [1.4, 1.4], sign: [2.6, 0.6], bigfence: [2, 1.4], board: [8.5, 2.2] };
// «убрать всё в круге»: что трогать (галочки кисти)
const CLEAR = [
  { id: 'trees', name: 'деревья и кусты', kinds: ['tree', 'bush'], on: true },
  { id: 'forest', name: 'ельник', kinds: ['forest'], on: true },
  { id: 'yard', name: 'мелочь дворов и газона', kinds: ['lawn', 'bench', 'bin', 'sand', 'slide', 'fence'], on: true },
  { id: 'street', name: 'фонари, знаки, заборы, щиты', kinds: ['lamp', 'sign', 'bigfence', 'board'], on: false },
];
const TREEKINDS = KINDS.filter(k => k.kind === 'tree');
const UNDO_MAX = 20;
const FAR = { normal: 0, far: 1600, all: 6000 };
const $ = id => document.getElementById(id);
const r2 = v => Math.round(v * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
let UIDN = 0;
const uid = p => p + Date.now().toString(36) + (UIDN++ % 1296).toString(36).padStart(2, '0') + Math.floor(Math.random() * 1296).toString(36);
const kindOf = a => KINDS.find(k => k.kind === a.kind && (k.sub || null) === (a.sub || null)) || KINDS.find(k => k.kind === a.kind);
const addName = a => { const k = kindOf(a); return k ? k.name : a.kind; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let d, THREE, CAM, MAPID, MM, ROOT3, built = false;
const st = { clouds: false, tool: 'look', notes: [], edits: { add: [], remove: [] }, notesAbout: '', editsAbout: '', place: KINDS[0], ry: 0, sel: null, selNote: null, far: 'normal', status: '',
  brush: { mode: 'grove', R: 12, N: 10, kinds: new Set(['birch', 'pine', 'rowan']), clear: new Set(CLEAR.filter(c => c.on).map(c => c.id)) }, undo: [] };

/* ── ожидание игры ── */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until (f, ms = 120000) { const t0 = performance.now(); while (!f()) { if (performance.now() - t0 > ms) throw new Error('редактор: не дождался игры'); await sleep(50); } }

export async function boot () {
  await until(() => window.__dlv && window.__dlv.EDL && window.__dlv.cam && window.__dlv.scene);
  d = window.__dlv; THREE = d.THREE; MAPID = d.MAP.id;
  CAM = makeCam(d, window.__edKeys);
  restoreCam();
  d.EDL.ED.cam = (cam, dt) => CAM.apply(cam, dt);
  buildDom();
  setFar(st.far);
  const [N, E] = await Promise.all([FILES.load(MAPID, 'notes'), FILES.load(MAPID, 'edits')]);
  st.notes = Array.isArray(N.notes) ? N.notes : []; st.notesAbout = N.about || '';
  st.edits = { add: Array.isArray(E.add) ? E.add : [], remove: Array.isArray(E.remove) ? E.remove : [] }; st.editsAbout = E.about || '';
  renderLists();
  await until(() => window.__boot && window.__boot.full, 180000);     // город достроился (latebuild.js)
  $('ed-wait').remove();
  ROOT3 = new THREE.Group(); ROOT3.name = 'editor'; d.scene.add(ROOT3);
  built = true;
  // убранное — спрятать на месте: город в редакторе собран целиком (editlayer.js), ельник и газон — по живому списку
  d.EDL.setLive(st.edits.remove);
  for (const r of st.edits.remove) d.EDL.hideNow(r);
  rebuildMarks();
  renderLists();
  status(FILES.canSave() ? 'готово. Пометки и правки сохраняются сами — в ' + FILES.path(MAPID, 'notes') + ' и edits.json' : 'только чтение: сохранять можно из npm run editor', FILES.canSave() ? 'ok' : 'bad');
  document.title = 'Редактор города';
  requestAnimationFrame(loop);
}

/* ── камера: запомнить между перезагрузками ── */
function restoreCam () {
  let c = null;
  try { c = JSON.parse(sessionStorage.getItem('ed-cam') || 'null'); } catch (e) { /* — */ }
  if (c && isFinite(c.x)) Object.assign(CAM.P, c);
  else { const P = d.PIZZA || { bx: 0, bz: 0 }; CAM.goTo(P.bx, P.bz, 120, -0.8); }
}
let camSaved = 0;
function saveCam () { try { sessionStorage.setItem('ed-cam', JSON.stringify(CAM.P)); } catch (e) { /* — */ } }

/* ── дальность: туман и край камеры дальше, чем в игре ── */
let fogHooked = false;
function setFar (k) {
  st.far = k;
  const Q = d.CULLQ;
  if (!st.baseFar) st.baseFar = Q.base;
  Q.base = FAR[k] || st.baseFar;
  if (!fogHooked && d.scene.fog) {
    fogHooked = true;
    const fog = d.scene.fog;
    let far = fog.far, near = fog.near;
    Object.defineProperty(fog, 'far', { get: () => (FAR[st.far] ? FAR[st.far] * 0.98 : far), set: v => { far = v; }, configurable: true });
    Object.defineProperty(fog, 'near', { get: () => (FAR[st.far] ? FAR[st.far] * 0.6 : near), set: v => { near = v; }, configurable: true });
  }
  for (const b of document.querySelectorAll('[data-far]')) b.classList.toggle('on', b.dataset.far === k);
}

/* ── луч из точки экрана ── */
const RC = () => (RC.r || (RC.r = new THREE.Raycaster()));
function ray (cx, cy) {
  const cv = d.renderer.domElement, r = cv.getBoundingClientRect();
  const v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  d.cam.updateMatrixWorld();
  RC().setFromCamera(v, d.cam);
  return RC().ray;
}
const gH = (x, z) => Math.max(0, d.groundH(x, z) || 0);
/** точка земли под лучом (дома не мешают): { x, y, z, t } или null */
function groundAt (cx, cy) {
  const R = ray(cx, cy), o = R.origin, v = R.direction;
  let t = 0, step = 1, pt = 0;
  for (let i = 0; i < 4000 && t < 9000; i++) {
    const x = o.x + v.x * t, y = o.y + v.y * t, z = o.z + v.z * t, g = gH(x, z);
    if (y <= g) {
      let a = pt, b = t;
      for (let k = 0; k < 24; k++) { const m = (a + b) / 2, mx = o.x + v.x * m, my = o.y + v.y * m, mz = o.z + v.z * m; if (my <= gH(mx, mz)) b = m; else a = m; }
      return { x: o.x + v.x * b, y: o.y + v.y * b, z: o.z + v.z * b, t: b };
    }
    pt = t;
    step = Math.max(0.4, Math.min(25, (y - g) * 0.4));
    t += step;
  }
  return null;
}
/* расстояние от луча до вертикального отрезка (x, g…g+h, z): [расстояние, t по лучу] */
function rayToPost (R, x, z, h) {
  const o = R.origin, v = R.direction, g = gH(x, z);
  const hx = v.x, hz = v.z, l2 = hx * hx + hz * hz;
  let t = l2 > 1e-9 ? ((x - o.x) * hx + (z - o.z) * hz) / l2 : 0;
  if (t < 0) t = 0;
  const px = o.x + v.x * t, py = o.y + v.y * t, pz = o.z + v.z * t;
  const yy = Math.max(g, Math.min(g + h, py));
  return [Math.hypot(px - x, pz - z, (py - yy) * 0.6), t];
}

/* ── что можно выбрать ── */
function removedNow (kind, x, z) { return st.edits.remove.some(q => q.kind === kind && Math.hypot(q.x - x, q.z - z) <= d.EDL.R_MATCH); }
/* что из города стоит ближе r к точке (editlayer.js itemsNear: деревья, сбиваемое, лавочки, щиты, ельник и мелочь
   газона у собранных клеток), без уже убранного */
const cityAround = (x, z, r) => d.EDL.itemsNear(x, z, r).filter(c => !removedNow(c.kind, c.x, c.z));
/** что под точкой экрана: { type: 'add', a } | { type: 'city', kind, x, z, sub? } | { type: 'note', n } | null */
function pickAt (cx, cy) {
  const R = ray(cx, cy), G = groundAt(cx, cy), tMax = G ? G.t + 3 : 1e9;
  let best = null, bt = Infinity;
  const consider = (o, x, z, h, r) => { const [dd, t] = rayToPost(R, x, z, h); if (dd < r && t < tMax && t < bt) { bt = t; best = o; } };
  for (const n of st.notes) consider({ type: 'note', n }, n.x, n.z, 8, 1.4);
  for (const a of st.edits.add) { const box = a.kind === 'box'; consider({ type: 'add', a }, a.x, a.z, box ? (+a.h || 3) : 3, box ? Math.max(+a.w || 3, +a.d || 3) / 2 + 0.5 : 1.6); }
  if (best) return best;
  const o = R.origin, reach = G ? Math.min(900, Math.hypot(G.x - o.x, G.z - o.z) + 12) : 300;
  const city = cityAround(o.x, o.z, reach);
  for (const c of city) {
    const [h, r] = c.kind === 'forest' && c.h ? [c.h, c.sub === 'bush' ? 1 : 1.3] : HGT[c.kind] || [1, 1];
    consider({ type: 'city', ...c }, c.x, c.z, h, r);
  }
  if (best || !G) return best;
  // ничего на луче — ближайшее к точке земли в 2,5 м
  let bd = 2.5;
  for (const c of city) { const dd = Math.hypot(c.x - G.x, c.z - G.z); if (dd < bd) { bd = dd; best = { type: 'city', ...c }; } }
  return best;
}

/* ── проверка места: те же правила, что у игры, и npm run check ── */
let RG = null;
function roadGrid () {
  if (RG) return RG;
  RG = new Map();
  for (const s of d.RSEG) {
    if (s.c === 6) continue;
    const m = s.w / 2 + 1;
    for (let i = Math.floor((Math.min(s.x1, s.x2) - m) / 40); i <= Math.floor((Math.max(s.x1, s.x2) + m) / 40); i++)
      for (let j = Math.floor((Math.min(s.z1, s.z2) - m) / 40); j <= Math.floor((Math.max(s.z1, s.z2) + m) / 40); j++) {
        const k = i + ',' + j; if (!RG.has(k)) RG.set(k, []); RG.get(k).push(s);
      }
  }
  return RG;
}
/* насколько точка на асфальте (как tools/probe-checks/buildings-road.js): > 0 — на асфальте, м */
function pen (x, z) {
  let p = -99;
  for (const s of roadGrid().get(Math.floor(x / 40) + ',' + Math.floor(z / 40)) || []) {
    const dx = s.x2 - s.x1, dz = s.z2 - s.z1, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - s.x1) * dx + (z - s.z1) * dz) / l2));
    p = Math.max(p, s.w / 2 - Math.hypot(x - s.x1 - dx * t, z - s.z1 - dz * t));
  }
  return p;
}
const inPoly = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
function inHouse (x, z, m = 0) {
  for (const b of d.HOUSE_GRID.get(Math.floor(x / 40) + ',' + Math.floor(z / 40)) || []) {
    const p = b.p;
    if (inPoly(x, z, p) || (m && (inPoly(x + m, z, p) || inPoly(x - m, z, p) || inPoly(x, z + m, p) || inPoly(x, z - m, p)))) return true;
  }
  return false;
}
function boxCorners (a) {
  const k = kindOf(a), w = +a.w || k.w, dd = +a.d || k.d, cs = Math.cos(a.ry || 0), sn = Math.sin(a.ry || 0), out = [];
  for (const u of [-0.5, -0.25, 0, 0.25, 0.5]) for (const v of [-0.5, 0, 0.5]) out.push([a.x + cs * u * w + sn * v * dd, a.z - sn * u * w + cs * v * dd]);
  return out;
}
/** почему тут плохо: [строки]; hard — игра не поставит или npm run check упадёт */
function check (a) {
  const W = [], x = a.x, z = a.z, g = d.groundH(x, z);
  const road = d.nearestRoad(x, z, 7, 1), edge = road ? road.d - road.seg.w / 2 : 99;
  if (a.kind === 'tree') {
    if (g < 0.3) W.push('в воде — дерево не вырастет (игра его не посадит)');
    if (edge < 2.5) W.push('ближе 2,5 м к краю дороги — игра дерево не посадит');
    if (inHouse(x, z, 0.6)) W.push('в доме');
  } else if (a.kind === 'bench') {
    if (g < 0.3) W.push('в воде — игра лавочку не поставит');
    if (edge < 1) W.push('на дороге — игра лавочку не поставит');
    if (inHouse(x, z, 1.4)) W.push('в доме или вплотную к стене (ближе 1,4 м) — игра лавочку не поставит');
  } else if (a.kind === 'box') {
    if (boxCorners(a).some(([px, pz]) => pen(px, pz) > 0)) W.push('постройка заходит на дорогу — npm run check («постройки не на дороге») упадёт');
    if (boxCorners(a).some(([px, pz]) => inHouse(px, pz))) W.push('залезает в дом');
  } else {
    if (pen(x, z) > -0.3) W.push('на асфальте — будет мешать машинам');
    if (inHouse(x, z, 0.3)) W.push('в доме');
    if (g < 0.1) W.push('в воде');
  }
  return W;
}

/* ── 3D: булавки, заготовки, кресты ── */
const MATS = {};
const mat = (hex, op = 1) => MATS[hex + op] || (MATS[hex + op] = new THREE.MeshBasicMaterial({ color: hex, transparent: op < 1, opacity: op, fog: false, depthWrite: op >= 1 }));
const mesh = (geo, hex, x, y, z, op) => { const m = new THREE.Mesh(geo, mat(hex, op)); m.position.set(x, y, z); return m; };
function shapeOf (a, op = 0.85) {
  const g = new THREE.Group(), k = kindOf(a) || {};
  if (a.kind === 'tree') {
    const bush = ['bush', 'lilac', 'rosehip'].includes(a.sub);
    if (bush) g.add(mesh(new THREE.IcosahedronGeometry(1, 0), a.sub === 'lilac' ? '#b58ad6' : '#4f8f3f', 0, 0.9, 0, op));
    else {
      g.add(mesh(new THREE.CylinderGeometry(0.18, 0.25, 3, 6), '#6b4a2e', 0, 1.5, 0, op));
      const conifer = a.sub === 'pine' || a.sub === 'spruce';
      g.add(mesh(conifer ? new THREE.ConeGeometry(1.8, 6, 7) : new THREE.IcosahedronGeometry(2.2, 0), a.sub === 'birch' ? '#8fc25a' : '#3f8a3a', 0, conifer ? 5 : 4.6, 0, op));
    }
  } else if (a.kind === 'bench') g.add(mesh(new THREE.BoxGeometry(2.6, 0.9, 0.7), '#8a6b4e', 0, 0.45, 0, op));
  else if (a.kind === 'lamp') { g.add(mesh(new THREE.CylinderGeometry(0.12, 0.14, 6, 6), '#585460', 0, 3, 0, op)); g.add(mesh(new THREE.SphereGeometry(0.4, 8, 6), '#fff3c4', 0, 6.1, 0, op)); }
  else if (a.kind === 'bin') g.add(mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.85, 8), '#4e5a4a', 0, 0.42, 0, op));
  else if (a.kind === 'tyres') for (const u of [-0.95, 0, 0.95]) g.add(mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 10), '#f1eee6', u, 0.15, 0, op));
  else if (a.kind === 'sandpile') g.add(mesh(new THREE.ConeGeometry(1.3, 0.9, 9), '#d9b56c', 0, 0.45, 0, op));
  else if (a.kind === 'beater') { for (const u of [-1.3, 1.3]) g.add(mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), '#5c6a78', u, 1.1, 0, op)); g.add(mesh(new THREE.BoxGeometry(2.7, 0.1, 0.1), '#5c6a78', 0, 2.1, 0, op)); }
  else if (a.kind === 'box') { const w = +a.w || k.w, dd = +a.d || k.d, h = +a.h || k.h; g.add(mesh(new THREE.BoxGeometry(w, h, dd), a.col || k.col, 0, h / 2, 0, op)); }
  g.rotation.y = +a.ry || 0;
  g.position.set(a.x, d.groundH(a.x, a.z), a.z);
  return g;
}
const ring = (x, z, r, hex, y = 0.25) => { const m = mesh(new THREE.TorusGeometry(r, Math.max(0.08, r * 0.08), 6, 28), hex, x, gH(x, z) + y, z); m.rotation.x = Math.PI / 2; return m; };
function cross (x, z) {
  const g = new THREE.Group(), y = gH(x, z);
  for (const a of [Math.PI / 4, -Math.PI / 4]) { const b = mesh(new THREE.BoxGeometry(2.6, 0.18, 0.35), '#e0281b', x, y + 0.35, z); b.rotation.y = a; g.add(b); }
  g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 5), '#e0281b', x, y + 2, z));
  g.add(mesh(new THREE.OctahedronGeometry(0.45, 0), '#e0281b', x, y + 4.3, z));
  return g;
}
function pin (n) {
  const g = new THREE.Group(), y = gH(n.x, n.z), hex = n.done ? '#3c8d40' : '#d63a26';
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 6, 5), '#3a3226', n.x, y + 3, n.z));
  g.add(mesh(new THREE.SphereGeometry(0.7, 10, 8), hex, n.x, y + 6.4, n.z));
  return g;
}
const MK = { notes: null, adds: null, rem: null, sel: null, ghost: null };
function clearGroup (g) { if (!g) return; ROOT3.remove(g); g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
function rebuildMarks () {
  if (!built) return;
  for (const k of ['notes', 'adds', 'rem']) { clearGroup(MK[k]); MK[k] = new THREE.Group(); ROOT3.add(MK[k]); }
  for (const n of st.notes) MK.notes.add(pin(n));
  const applied = new Set((d.EDL.edits.add || []).map(a => a.id));
  for (const a of st.edits.add) {
    if (!applied.has(a.id)) MK.adds.add(shapeOf(a, 0.7));           // ещё не в городе — заготовка
    MK.adds.add(ring(a.x, a.z, a.kind === 'box' ? Math.max(+a.w || 3, +a.d || 3) * 0.6 : 1.3, '#2f6fd0'));
  }
  // убранное спрятано сразу; крест — только где «убрать» ничего не нашло (ельник и газон — у собранной клетки)
  for (const r of st.edits.remove) if (!(d.EDL.hits(r) > 0)) MK.rem.add(cross(r.x, r.z));
  showSel();
}
function showSel () {
  clearGroup(MK.sel); MK.sel = null;
  const s = st.sel;
  if (!s || !built) return;
  const x = s.type === 'add' ? s.a.x : s.type === 'note' ? s.n.x : s.x, z = s.type === 'add' ? s.a.z : s.type === 'note' ? s.n.z : s.z;
  MK.sel = new THREE.Group();
  MK.sel.add(ring(x, z, 2.2, '#ffcc00', 0.4));
  ROOT3.add(MK.sel);
}

/* ── сохранение (с задержкой: несколько кликов — одна запись) ── */
const T = {};
function saveLater (f) {
  clearTimeout(T[f]);
  T[f] = setTimeout(async () => {
    const obj = f === 'notes' ? { about: st.notesAbout, notes: st.notes } : { about: st.editsAbout, add: st.edits.add, remove: st.edits.remove };
    const r = await FILES.save(MAPID, f, obj);
    if (r.ok) status('сохранено → ' + r.path, 'ok'); else status('не сохранено: ' + r.error, 'bad');
  }, 250);
}
function status (s, cls = '') { const el = $('ed-status'); if (!el) return; el.textContent = s; el.className = cls; st.status = s; }

/* ── действия (каждое — шаг отмены: do / undo) ── */
const sameR = (q, r) => q.kind === r.kind && Math.abs(q.x - r.x) < 0.005 && Math.abs(q.z - r.z) < 0.005;
function refresh () { rebuildMarks(); renderLists(); renderSel(); }
/* список «убрать» правим на месте: его же видит игра (editlayer.js setLive) */
function remPush (list) { for (const r of list) { st.edits.remove.push(r); } d.EDL.hideMany(list); }
function remDrop (list) { const L = st.edits.remove; for (const r of list) { const i = L.findIndex(q => q === r || sameR(q, r)); if (i >= 0) L.splice(i, 1); } d.EDL.showMany(list); }
function addPush (list) { for (const a of list) st.edits.add.push(a); }
function addDrop (list) { const set = new Set(list.map(a => a.id)); st.edits.add = st.edits.add.filter(a => !set.has(a.id)); if (st.sel && st.sel.a && set.has(st.sel.a.id)) st.sel = null; }
/* выполнить и запомнить для отмены */
function act (name, fwd, back) {
  fwd();
  st.undo.push({ name, back });
  if (st.undo.length > UNDO_MAX) st.undo.shift();
  renderUndo();
}
function undo () {
  const u = st.undo.pop();
  if (!u) { status('отменять нечего', 'bad'); return null; }
  u.back();
  renderUndo();
  status('отменено: ' + u.name, 'ok');
  return u.name;
}
function renderUndo () {
  const b = $('ed-undo');
  if (!b) return;
  const u = st.undo[st.undo.length - 1];
  b.disabled = !u;
  b.textContent = u ? '↶ отменить: ' + u.name + ' (' + st.undo.length + ')' : '↶ отменить';
}

function addNote (x, z, text) {
  const n = { id: uid('n'), x: r2(x), z: r2(z), text: String(text).trim(), date: today(), done: false };
  if (!n.text) return null;
  act('пометка', () => { st.notes.push(n); saveLater('notes'); refresh(); }, () => { st.notes = st.notes.filter(q => q !== n); saveLater('notes'); refresh(); });
  return n;
}
function mkAdd (a) {
  return { id: uid('a'), kind: a.kind, ...(a.sub ? { sub: a.sub } : {}), x: r2(a.x), z: r2(a.z), ry: r2(a.ry || 0), ...(a.kind === 'box' ? { w: a.w, d: a.d, h: a.h, col: a.col } : {}), date: today() };
}
function place (a, force = false) {
  a = mkAdd(a);
  const W = check(a);
  if (W.length && !force) return { ok: false, why: W, a };
  act('поставить ' + addName(a), () => { addPush([a]); saveLater('edits'); refresh(); }, () => { addDrop([a]); saveLater('edits'); refresh(); });
  return { ok: true, a, why: W };
}
/* убрать из города: правки «убрать» (одна или пачка) — спрятано сразу, один шаг отмены */
function removeMany (items, name) {
  const list = [];
  for (const c of items) {
    if (removedNow(c.kind, c.x, c.z) || list.some(q => q.kind === c.kind && Math.hypot(q.x - c.x, q.z - c.z) <= d.EDL.R_MATCH)) continue;
    list.push({ kind: c.kind, ...(c.sub ? { sub: c.sub } : {}), x: r2(c.x), z: r2(c.z), date: today() });
  }
  if (!list.length) return [];
  act(name || 'убрать ' + itemName(list[0]), () => { remPush(list); saveLater('edits'); st.sel = null; refresh(); }, () => { remDrop(list); saveLater('edits'); refresh(); });
  return list;
}
function removeCity (kind, x, z, sub) { const l = removeMany([{ kind, x, z, sub }]); return l[0] || null; }
function unRemove (r) { act('вернуть ' + itemName(r), () => { remDrop([r]); saveLater('edits'); refresh(); }, () => { remPush([r]); saveLater('edits'); refresh(); }); }
function unAdd (a) {
  const i = st.edits.add.indexOf(a);
  act('убрать ' + addName(a), () => { addDrop([a]); saveLater('edits'); refresh(); }, () => { st.edits.add.splice(Math.min(i, st.edits.add.length), 0, a); saveLater('edits'); refresh(); });
}
function rotateAdd (a, da) {
  const was = a.ry;
  act('повернуть ' + addName(a), () => { a.ry = r2(((+a.ry || 0) + da) % (Math.PI * 2)); saveLater('edits'); refresh(); }, () => { a.ry = was; saveLater('edits'); refresh(); });
}

/* ── кисть: роща и «убрать всё в круге» ── */
/** посадить рощу: n деревьев пород kinds (sub из палитры) вперемешку в круге радиуса R — не на асфальт, не в дом и воду,
    не вплотную к деревьям (новым и городским). → поставленные */
function grove (x, z, R = st.brush.R, n = st.brush.N, kinds = [...st.brush.kinds]) {
  const subs = kinds.filter(k => TREEKINDS.some(q => q.sub === k));
  if (!subs.length) { status('кисть: выбери хоть одну породу', 'bad'); return []; }
  const city = cityAround(x, z, R + 3).filter(c => c.kind === 'tree' || c.kind === 'forest');
  const out = [];
  const gap = sub => (['bush', 'lilac', 'rosehip'].includes(sub) ? 1.6 : 3);
  for (let tries = 0; out.length < n && tries < n * 25; tries++) {
    const a0 = Math.random() * Math.PI * 2, rr = R * Math.sqrt(Math.random());
    const sub = subs[Math.floor(Math.random() * subs.length)];
    const a = mkAdd({ kind: 'tree', sub, x: x + Math.cos(a0) * rr, z: z + Math.sin(a0) * rr, ry: 0 });
    if (check(a).length) continue;
    const g = gap(sub);
    if (out.some(q => Math.hypot(q.x - a.x, q.z - a.z) < Math.max(g, gap(q.sub))) || city.some(c => Math.hypot(c.x - a.x, c.z - a.z) < g)) continue;
    if (st.edits.add.some(q => q.kind === 'tree' && Math.hypot(q.x - a.x, q.z - a.z) < g)) continue;
    out.push(a);
  }
  if (!out.length) { status('кисть: тут некуда сажать (асфальт, дома, вода или уже густо)', 'bad'); return []; }
  act('роща (' + out.length + ')', () => { addPush(out); saveLater('edits'); refresh(); }, () => { addDrop(out); saveLater('edits'); refresh(); });
  status('роща: ' + out.length + (out.length < n ? ' из ' + n + ' (больше не влезло)' : '') + ' — в городе после «пересобрать город»', out.length < n ? 'bad' : 'ok');
  return out;
}
/** убрать всё в круге: что отмечено (groups — id из CLEAR) → убранные правки */
function clearCircle (x, z, R = st.brush.R, groups = [...st.brush.clear]) {
  const kinds = new Set(CLEAR.filter(c => groups.includes(c.id)).flatMap(c => c.kinds));
  const items = cityAround(x, z, R).filter(c => kinds.has(c.kind));
  const list = removeMany(items, 'убрать в круге');
  status(list.length ? 'убрано в круге: ' + list.length : 'в круге нечего убирать (галочки — что трогать)', list.length ? 'ok' : 'bad');
  return list;
}

/* ── клики по городу ── */
function onClick (cx, cy) {
  closePop();
  if (st.tool === 'note') {
    const G = groundAt(cx, cy);
    if (!G) return status('тут нет земли — кликни по городу', 'bad');
    askText(cx, cy, 'Что тут? (Enter — сохранить)', '', t => { const n = addNote(G.x, G.z, t); if (n) { st.selNote = n.id; renderLists(); status('пометка сохранена', 'ok'); } });
  } else if (st.tool === 'place') {
    const G = groundAt(cx, cy);
    if (!G) return;
    const k = st.place, a = { kind: k.kind, sub: k.sub, x: G.x, z: G.z, ry: st.ry, ...(k.kind === 'box' ? boxDims() : {}) };
    const r = place(a);
    if (r.ok) status('поставлено: ' + k.name + ' — в городе после «пересобрать город»', 'ok');
    else askYes(cx, cy, 'Тут плохо: ' + r.why.join('; ') + '. Поставить всё равно?', () => { place(a, true); status('поставлено с предупреждением: ' + r.why.join('; '), 'bad'); });
  } else if (st.tool === 'brush') {
    const G = groundAt(cx, cy);
    if (!G) return;
    if (st.brush.mode === 'grove') grove(G.x, G.z); else clearCircle(G.x, G.z);
  } else if (st.tool === 'pick') {
    st.sel = pickAt(cx, cy);
    if (st.sel && st.sel.type === 'note') st.selNote = st.sel.n.id;
    showSel(); renderSel(); renderLists();
  }
}

/* ── всплывающее окошко у точки клика ── */
function closePop () { const p = $('ed-pop'); if (p) p.remove(); }
function pop (cx, cy, html) {
  closePop();
  const p = document.createElement('div');
  p.id = 'ed-pop'; p.innerHTML = html;
  $('ed-root').appendChild(p);
  const W = innerWidth, H = innerHeight;
  p.style.left = Math.min(W - 300, Math.max(350, cx + 12)) + 'px';
  p.style.top = Math.min(H - 170, Math.max(10, cy - 20)) + 'px';
  return p;
}
function askText (cx, cy, label, val, ok) {
  const p = pop(cx, cy, `<div class="msg">${esc(label)}</div><textarea></textarea><div class="row"><button class="yes">сохранить</button><button class="no">отмена</button></div>`);
  const ta = p.querySelector('textarea'); ta.value = val; setTimeout(() => ta.focus(), 0);
  const go = () => { const v = ta.value; closePop(); ok(v); };
  p.querySelector('.yes').onclick = go; p.querySelector('.no').onclick = closePop;
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } else if (e.key === 'Escape') closePop(); });
}
function askYes (cx, cy, msg, ok) {
  const p = pop(cx, cy, `<div class="msg bad">${esc(msg)}</div><div class="row"><button class="yes">да</button><button class="no">нет</button></div>`);
  p.querySelector('.yes').onclick = () => { closePop(); ok(); };
  p.querySelector('.no').onclick = closePop;
}

/* ── панель ── */
function boxDims () { return { w: +$('ed-bw').value || 4, d: +$('ed-bd').value || 3, h: +$('ed-bh').value || 2.6, col: $('ed-bc').value || '#c9b8a0' }; }
function buildDom () {
  const root = document.createElement('div');
  root.id = 'ed-root';
  const groups = [...new Set(KINDS.map(k => k.group))];
  root.innerHTML = `
    <div id="ed-view"></div><div id="ed-labels"></div><div id="ed-cross"></div>
    <div id="ed-wait">город строится…</div>
    <div id="ed-panel">
      <h1>Редактор города <small>${esc(d.MAP.id === 'seversk' ? 'Солнечный' : d.MAP.id)}</small></h1>
      <div id="ed-status">загрузка…</div>
      <h2>Что делаем</h2>
      <div class="row tools">
        <button data-tool="look">смотреть</button><button data-tool="note">пометка</button>
        <button data-tool="place">поставить</button><button data-tool="pick">выбрать / убрать</button><button data-tool="brush">кисть</button>
      </div>
      <div class="row"><button id="ed-undo" disabled>↶ отменить</button> <span class="hint">Ctrl+Z</span></div>
      <div class="hint" id="ed-toolhint"></div>
      <div id="ed-placebox" hidden>
        <div class="ed-pal">${groups.map(g => `<b>${esc(g)}</b>` + KINDS.map((k, i) => k.group === g ? `<button data-kind="${i}">${esc(k.name)}</button>` : '').join('')).join('')}</div>
        <div class="row">поворот: <b id="ed-ry">0°</b> <button class="mini" id="ed-rl">↺ 15°</button><button class="mini" id="ed-rr">↻ 15°</button> <span class="hint">или R</span></div>
        <div class="row" id="ed-boxdims" hidden>ш <input type="number" id="ed-bw" step="0.5" min="0.5"> г <input type="number" id="ed-bd" step="0.5" min="0.5"> в <input type="number" id="ed-bh" step="0.5" min="0.5"> <input type="color" id="ed-bc"></div>
      </div>
      <div id="ed-brushbox" hidden>
        <div class="row"><button data-bmode="grove">посадить рощу</button><button data-bmode="clear">убрать всё в круге</button></div>
        <div class="row">радиус <input type="range" id="ed-br" min="3" max="60" step="1"> <b id="ed-brv"></b> м</div>
        <div class="row" id="ed-bgrove">деревьев <input type="number" id="ed-bn" min="1" max="80" step="1"></div>
        <div class="ed-pal" id="ed-bkinds">${TREEKINDS.map(k => `<button data-bk="${k.sub}">${esc(k.name)}</button>`).join('')}</div>
        <div id="ed-bclear">${CLEAR.map(c => `<label><input type="checkbox" data-bc="${c.id}"> ${esc(c.name)}</label>`).join('<br>')}</div>
      </div>
      <div id="ed-sel" hidden></div>
      <h2>Камера</h2>
      <div class="row"><button id="ed-top">сверху</button><button id="ed-side">сбоку</button><button id="ed-home">к пиццерии</button></div>
      <div class="row">к точке: x <input type="number" id="ed-gx"> z <input type="number" id="ed-gz"> <button id="ed-go">лететь</button></div>
      <div class="row hint" id="ed-pos"></div>
      <div class="row">дальность: <button data-far="normal">как в игре</button><button data-far="far">далеко</button><button data-far="all">весь город</button></div>
      <div class="row">время: <select id="ed-hour"><option value="">как есть</option><option>9</option><option>13</option><option>18</option><option>21</option><option>23</option></select>
        <label><input type="checkbox" id="ed-clouds"> облака</label>
        сезон: <select id="ed-sea"><option value="">как есть</option><option value="0.4">лето</option><option value="1.4">осень</option><option value="2.4">зима</option><option value="3.4">весна</option></select></div>
      <canvas id="ed-map"></canvas>
      <div class="row"><button class="mini" id="ed-mapk">рядом</button><span class="hint">клик по карте — камера туда</span></div>
      <h2>Пометки <span class="hint" id="ed-ncount"></span></h2>
      <div class="row"><label><input type="checkbox" id="ed-hidedone"> прятать сделанные</label></div>
      <ul class="ed-list" id="ed-notes"></ul>
      <h2>Правки предметов <span class="hint" id="ed-ecount"></span></h2>
      <div class="row"><button class="big" id="ed-rebuild">пересобрать город (показать правки)</button></div>
      <ul class="ed-list" id="ed-edits"></ul>
      <h2>Кнопки</h2>
      <div id="ed-keys"><kbd>W A S D</kbd> / стрелки — лететь, <kbd>Q</kbd> <kbd>E</kbd> — ниже / выше, <kbd>Shift</kbd> — быстрее,
        колесо — высота, тянуть мышью — повернуть голову. <kbd>1</kbd>–<kbd>5</kbd> — инструменты, <kbd>R</kbd> — повернуть предмет,
        <kbd>[</kbd> <kbd>]</kbd> — радиус кисти, <kbd>Del</kbd> — убрать выбранное, <kbd>Ctrl</kbd>+<kbd>Z</kbd> — отменить, <kbd>Esc</kbd> — снять выбор.
        Геймпад: стики, курки — высота, A — действие в центре.</div>
    </div>`;
  document.body.appendChild(root);
  // события мыши и касаний редактора — не игре (её обработчики висят на window и document)
  for (const t of ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'wheel', 'touchstart', 'touchmove', 'touchend', 'contextmenu']) root.addEventListener(t, e => e.stopPropagation());

  for (const b of root.querySelectorAll('[data-tool]')) b.onclick = () => setTool(b.dataset.tool);
  for (const b of root.querySelectorAll('[data-kind]')) b.onclick = () => setKind(KINDS[+b.dataset.kind]);
  for (const b of root.querySelectorAll('[data-far]')) b.onclick = () => setFar(b.dataset.far);
  $('ed-rl').onclick = () => setRy(st.ry + Math.PI / 12); $('ed-rr').onclick = () => setRy(st.ry - Math.PI / 12);
  $('ed-top').onclick = () => { const c = lookPoint(); CAM.top(c.x, c.z); };
  $('ed-side').onclick = () => { const c = lookPoint(); CAM.side(c.x, c.z); };
  $('ed-home').onclick = () => { const P = d.PZ_CUR || d.PIZZA; CAM.goTo(P.bx, P.bz, 90); };
  $('ed-go').onclick = () => { const x = +$('ed-gx').value, z = +$('ed-gz').value; if (isFinite(x) && isFinite(z)) CAM.goTo(x, z, 60); };
  $('ed-hour').onchange = e => { const h = +e.target.value; if (h) { d.ENV.t = d.ECON.tOfHour(h); d.updateEnv && d.updateEnv(0); } };
  $('ed-sea').onchange = e => { const v = e.target.value; if (v !== '' && d.season && d.season.set) d.season.set(+v); };
  $('ed-rebuild').onclick = rebuild;
  $('ed-undo').onclick = undo;
  for (const b of root.querySelectorAll('[data-bmode]')) b.onclick = () => setBrush({ mode: b.dataset.bmode });
  for (const b of root.querySelectorAll('[data-bk]')) b.onclick = () => { const k = b.dataset.bk, K = st.brush.kinds; if (K.has(k)) K.delete(k); else K.add(k); setBrush({}); };
  for (const c of root.querySelectorAll('[data-bc]')) c.onchange = () => { const C = st.brush.clear; if (c.checked) C.add(c.dataset.bc); else C.delete(c.dataset.bc); };
  $('ed-br').oninput = e => setBrush({ R: +e.target.value });
  $('ed-bn').oninput = e => setBrush({ N: Math.max(1, Math.min(80, Math.round(+e.target.value) || 1)) }, true);
  $('ed-clouds').onchange = e => { st.clouds = e.target.checked; };
  $('ed-hidedone').onchange = renderLists;
  for (const id of ['ed-bw', 'ed-bd', 'ed-bh', 'ed-bc']) $(id).addEventListener('input', () => { if (GH.ghost) updateGhost(true); });
  MM = makeMinimap($('ed-map'), d, (x, z) => CAM.goTo(x, z, Math.max(60, CAM.P.y - gH(CAM.P.x, CAM.P.z))));
  $('ed-mapk').onclick = () => { MM.M.near = !MM.M.near; $('ed-mapk').textContent = MM.M.near ? 'весь город' : 'рядом'; };

  // мышь по городу: тянуть — голова, клик — инструмент, колесо — высота
  const V = $('ed-view');
  let down = null;
  V.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, moved: false, b: e.button }; V.setPointerCapture(e.pointerId); });
  V.addEventListener('pointermove', e => {
    MOUSE.x = e.clientX; MOUSE.y = e.clientY; MOUSE.in = true;
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!down.moved && Math.hypot(dx, dy) > 4) { down.moved = true; V.classList.add('drag'); }
    if (down.moved) { CAM.turn(e.movementX, e.movementY); }
  });
  V.addEventListener('pointerup', e => {
    const c = down; down = null; V.classList.remove('drag');
    if (c && !c.moved && c.b === 0) onClick(e.clientX, e.clientY);
  });
  V.addEventListener('pointerleave', () => { MOUSE.in = false; });
  V.addEventListener('wheel', e => { e.preventDefault(); CAM.wheel(e.deltaY); }, { passive: false });
  V.addEventListener('contextmenu', e => e.preventDefault());

  window.__edKeys.on = onKey;
  setTool('look'); setKind(KINDS[0]); setBrush({});
}
const MOUSE = { x: 0, y: 0, in: false };
function lookPoint () { const G = groundAt(innerWidth / 2 + 165, innerHeight / 2); return G || { x: CAM.P.x, z: CAM.P.z }; }
function setTool (t) {
  st.tool = t; closePop();
  for (const b of document.querySelectorAll('[data-tool]')) b.classList.toggle('on', b.dataset.tool === t);
  $('ed-view').className = 't-' + t;
  $('ed-placebox').hidden = t !== 'place';
  $('ed-brushbox').hidden = t !== 'brush';
  $('ed-toolhint').textContent = {
    look: 'Просто смотреть: лететь — WASD, повернуть голову — тянуть мышью.',
    note: 'Клик по городу — булавка с текстом. Сохраняется сразу в ' + FILES.path(MAPID || 'seversk', 'notes') + '.',
    place: 'Выбери предмет и кликни, куда поставить. В городе появится после «пересобрать город».',
    pick: 'Клик по предмету: свой — повернуть или убрать, городской — убрать: дерево, куст, ель и сосна ельника, лавочка, фонарь, урна, заборчик, песочница, горка, мелочь газона (покрышки, выбивалка, бельё, ракушка…), знак, забор стройки, рекламный щит. Пропадает сразу.',
    brush: 'Круг под мышью. «Посадить рощу» — деревья выбранных пород вперемешку (не на асфальт, не в дом и воду; в городе — после «пересобрать город»). «Убрать всё в круге» — что отмечено галочками, пропадает сразу. [ ] — радиус.',
  }[t];
  if (t !== 'place') { clearGroup(GH.ghost); GH.ghost = null; }
  if (t !== 'brush') { clearGroup(GH.ring); GH.ring = null; }
  if (t !== 'pick') { st.sel = null; showSel(); renderSel(); }
}
function setKind (k) {
  st.place = k;
  for (const b of document.querySelectorAll('[data-kind]')) b.classList.toggle('on', KINDS[+b.dataset.kind] === k);
  $('ed-boxdims').hidden = k.kind !== 'box';
  if (k.kind === 'box') { $('ed-bw').value = k.w; $('ed-bd').value = k.d; $('ed-bh').value = k.h; $('ed-bc').value = k.col; }
  updateGhost(true);
}
function setBrush (o, quiet) {
  Object.assign(st.brush, o);
  const B = st.brush;
  B.R = Math.max(3, Math.min(60, B.R));
  for (const b of document.querySelectorAll('[data-bmode]')) b.classList.toggle('on', b.dataset.bmode === B.mode);
  for (const b of document.querySelectorAll('[data-bk]')) b.classList.toggle('on', B.kinds.has(b.dataset.bk));
  for (const c of document.querySelectorAll('[data-bc]')) c.checked = B.clear.has(c.dataset.bc);
  $('ed-br').value = B.R; $('ed-brv').textContent = B.R;
  if (!quiet) $('ed-bn').value = B.N;
  $('ed-bgrove').hidden = $('ed-bkinds').hidden = B.mode !== 'grove';
  $('ed-bclear').hidden = B.mode !== 'clear';
  GH.rkey = '';
}
function setRy (v) { st.ry = ((v % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); $('ed-ry').textContent = Math.round(st.ry * 180 / Math.PI) + '°'; updateGhost(true); }

function onKey (e) {
  const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT');
  if (e.type === 'keyup') { window.__edKeys.down.delete(e.code); return; }
  if (e.type !== 'keydown' || typing) return;
  window.__edKeys.down.add(e.code);
  const k = e.code;
  if ((e.ctrlKey || e.metaKey) && k === 'KeyZ') { e.preventDefault(); undo(); return; }
  if (k === 'Digit1') setTool('look'); else if (k === 'Digit2') setTool('note'); else if (k === 'Digit3') setTool('place'); else if (k === 'Digit4') setTool('pick'); else if (k === 'Digit5') setTool('brush');
  else if (k === 'BracketLeft' || k === 'BracketRight') { if (st.tool === 'brush') setBrush({ R: st.brush.R + (k === 'BracketLeft' ? -2 : 2) }); }
  else if (k === 'KeyR') { if (st.tool === 'place') setRy(st.ry - Math.PI / 12); else if (st.sel && st.sel.type === 'add') rotateAdd(st.sel.a, -Math.PI / 12); }
  else if (k === 'Escape') { closePop(); if (st.sel) { st.sel = null; showSel(); renderSel(); } }
  else if (k === 'Delete' || k === 'Backspace') delSel();
  if (/^(Arrow|Page|Space)/.test(k)) e.preventDefault();
}
function delSel () {
  const s = st.sel;
  if (!s) return;
  if (s.type === 'add') unAdd(s.a);
  else if (s.type === 'city') removeCity(s.kind, s.x, s.z, s.sub);
  else if (s.type === 'note') delNote(s.n);
}

function renderSel () {
  const el = $('ed-sel'), s = st.sel;
  if (!el) return;
  el.hidden = !s;
  if (!s) return;
  if (s.type === 'add') {
    el.innerHTML = `<b>${esc(addName(s.a))}</b> — поставлено в редакторе<br><span class="hint">x ${s.a.x}, z ${s.a.z}, поворот ${Math.round((s.a.ry || 0) * 180 / Math.PI)}°</span>
      <div class="row"><button class="mini" data-a="rl">↺ 15°</button><button class="mini" data-a="rr">↻ 15°</button><button class="mini warn" data-a="del">убрать</button></div>`;
  } else if (s.type === 'city') {
    el.innerHTML = `<b>${esc(itemName(s))}</b> — из города<br><span class="hint">x ${r2(s.x)}, z ${r2(s.z)}</span>
      <div class="row"><button class="mini warn" data-a="del">убрать из города</button></div>`;
  } else {
    el.innerHTML = `<b>пометка</b>: ${esc(s.n.text)}<div class="row"><button class="mini warn" data-a="del">удалить пометку</button></div>`;
  }
  for (const b of el.querySelectorAll('[data-a]')) b.onclick = () => { const a = b.dataset.a; if (a === 'del') delSel(); else if (s.type === 'add') rotateAdd(s.a, a === 'rl' ? Math.PI / 12 : -Math.PI / 12); };
}

function delNote (n) {
  if (!confirm('Удалить пометку «' + n.text.slice(0, 60) + '»?')) return;
  const i = st.notes.indexOf(n);
  act('удалить пометку', () => { st.notes = st.notes.filter(q => q !== n); if (st.sel && st.sel.n === n) st.sel = null; saveLater('notes'); refresh(); },
    () => { st.notes.splice(Math.min(i, st.notes.length), 0, n); saveLater('notes'); refresh(); });
}
function renderLists () {
  const ul = $('ed-notes');
  if (!ul) return;
  const hide = $('ed-hidedone').checked;
  ul.innerHTML = '';
  for (const n of st.notes.slice().reverse()) {
    if (hide && n.done) continue;
    const li = document.createElement('li');
    li.className = (n.done ? 'done' : '') + (st.selNote === n.id ? ' sel' : '');
    li.innerHTML = `<input type="checkbox" title="сделано" ${n.done ? 'checked' : ''}><span class="tx">${esc(n.text)}<small>${esc(n.date || '')} · x ${Math.round(n.x)}, z ${Math.round(n.z)}</small></span><button class="mini" title="лететь туда">→</button><button class="mini" title="править текст">✎</button><button class="mini warn" title="удалить">×</button>`;
    const [cb] = li.getElementsByTagName('input'), bs = li.getElementsByTagName('button');
    cb.onchange = () => { n.done = cb.checked; saveLater('notes'); rebuildMarks(); renderLists(); };
    li.querySelector('.tx').onclick = bs[0].onclick = () => { st.selNote = n.id; CAM.goTo(n.x, n.z, 35); renderLists(); };
    bs[1].onclick = () => { const r = bs[1].getBoundingClientRect(); askText(r.right, r.top, 'Текст пометки', n.text, t => { if (t.trim()) { n.text = t.trim(); saveLater('notes'); renderLists(); } }); };
    bs[2].onclick = () => delNote(n);
    ul.appendChild(li);
  }
  $('ed-ncount').textContent = st.notes.length ? `${st.notes.filter(n => !n.done).length} открыто · ${st.notes.filter(n => n.done).length} сделано` : 'пока нет';
  // правки: поставленное и убранное. Поставленное ещё не в городе — «после пересборки»; игра не поставила — красным.
  // Убранное спрятано сразу; «ничего не нашлось» — красным (ельник и газон проверяются у собранной клетки — подлети)
  const ue = $('ed-edits');
  ue.innerHTML = '';
  const A = d.EDL.edits || {}, applied = new Set((A.add || []).map(a => a.id)), ST = d.EDL.STATS, refused = new Set(ST.refused);
  const MAXROWS = 150;
  let rows = 0;
  const row = (cls, html, go, undo, undoT) => {
    if (++rows > MAXROWS) return;
    const li = document.createElement('li'); li.className = cls;
    li.innerHTML = `<span class="tx">${html}</span><button class="mini" title="лететь туда">→</button><button class="mini warn">${undoT}</button>`;
    const bs = li.getElementsByTagName('button');
    li.querySelector('.tx').onclick = bs[0].onclick = go; bs[1].onclick = undo;
    ue.appendChild(li);
  };
  // сначала поставленное, потом убранное; новые — сверху
  for (const a of st.edits.add.slice().reverse()) {
    const W = check(a), pend = !applied.has(a.id), bad = !pend && refused.has(a.id);
    const note = pend ? 'ещё не в городе — «пересобрать город»' : bad ? 'игра не поставила: ' + (W.join('; ') || 'место занято') : W.length ? W.join('; ') : 'в городе';
    row(bad || W.length ? 'bad' : '', `+ ${esc(addName(a))}<small>x ${Math.round(a.x)}, z ${Math.round(a.z)} · ${esc(note)}</small>`, () => { CAM.goTo(a.x, a.z, 30); setTool('pick'); st.sel = { type: 'add', a }; showSel(); renderSel(); }, () => unAdd(a), 'убрать');
  }
  for (const r of st.edits.remove.slice().reverse()) {
    const n = d.EDL.hits(r), lazy = d.EDL.LAZY[r.kind];
    const note = n > 0 ? 'убрано' + (n > 1 ? ' (' + n + ')' : '') : lazy ? 'не нашлось — или далеко (подлети: ельник и газон строятся у камеры)' : 'тут ничего не нашлось (предмета уже нет?)';
    row(n > 0 ? '' : 'bad', `− ${esc(itemName(r))}<small>x ${Math.round(r.x)}, z ${Math.round(r.z)} · ${esc(note)}</small>`, () => CAM.goTo(r.x, r.z, 30), () => unRemove(r), 'вернуть');
  }
  if (rows > MAXROWS) { const li = document.createElement('li'); li.className = 'hint'; li.textContent = '… и ещё ' + (rows - MAXROWS) + ' (старые)'; ue.appendChild(li); }
  $('ed-ecount').textContent = `+${st.edits.add.length} · −${st.edits.remove.length}`;
}
async function rebuild () {
  saveCam();
  for (const f of ['notes', 'edits']) if (T[f]) { clearTimeout(T[f]); T[f] = null; const obj = f === 'notes' ? { about: st.notesAbout, notes: st.notes } : { about: st.editsAbout, add: st.edits.add, remove: st.edits.remove }; await FILES.save(MAPID, f, obj); }
  location.reload();
}

/* ── заготовка под мышью (инструмент «поставить») ── */
const GH = { ghost: null, key: '', ring: null, rkey: '' };
/* кисть: круг радиуса R по земле под мышью (зелёный — роща, красный — убрать) */
function updateRing () {
  const G = MOUSE.in ? groundAt(MOUSE.x, MOUSE.y) : null;
  if (!G) { if (GH.ring) GH.ring.visible = false; return; }
  const B = st.brush, key = B.mode + B.R;
  if (key !== GH.rkey || !GH.ring) {
    clearGroup(GH.ring); GH.rkey = key;
    const n = 64, pts = [];
    for (let i = 0; i <= n; i++) pts.push(new THREE.Vector3(Math.cos(i / n * Math.PI * 2) * B.R, 0, Math.sin(i / n * Math.PI * 2) * B.R));
    GH.ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: B.mode === 'grove' ? '#3fbf4a' : '#e0281b', fog: false, depthTest: false }));
    GH.ring.renderOrder = 10;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(B.R, 48).rotateX(-Math.PI / 2), mat(B.mode === 'grove' ? '#3fbf4a' : '#e0281b', 0.18));
    disc.name = 'disc';
    GH.ring.add(disc);
    ROOT3.add(GH.ring);
  }
  // по рельефу: точки круга — на высоте земли
  const P = GH.ring.geometry.attributes.position, a = P.array;
  for (let i = 0; i < P.count; i++) a[i * 3 + 1] = gH(G.x + a[i * 3], G.z + a[i * 3 + 2]) + 0.4;
  P.needsUpdate = true;
  GH.ring.position.set(G.x, 0, G.z);
  GH.ring.getObjectByName('disc').position.y = G.y + 0.35;
  GH.ring.visible = true;
}
function updateGhost (force) {
  if (built && st.tool === 'brush') return updateRing();
  if (!built || st.tool !== 'place') return;
  const G = MOUSE.in ? groundAt(MOUSE.x, MOUSE.y) : null;
  if (!G) { if (GH.ghost) GH.ghost.visible = false; return; }
  const k = st.place, a = { kind: k.kind, sub: k.sub, x: G.x, z: G.z, ry: st.ry, ...(k.kind === 'box' ? boxDims() : {}) };
  const bad = check(a).length > 0;
  const key = k.name + JSON.stringify(k.kind === 'box' ? boxDims() : 0) + st.ry + bad;
  if (force || key !== GH.key || !GH.ghost) {
    clearGroup(GH.ghost); GH.ghost = shapeOf(a, 0.8); ROOT3.add(GH.ghost); GH.key = key;
    if (bad) GH.ghost.traverse(o => { if (o.isMesh) o.material = mat('#e0281b', 0.8); });   // тут игра не поставит или check упадёт
    const R = k.kind === 'box' ? Math.max(a.w, a.d) * 0.6 : 1.5, rg = mesh(new THREE.TorusGeometry(R, 0.12, 6, 28), bad ? '#e0281b' : '#ffd85e', 0, 0.3, 0);
    rg.rotation.x = Math.PI / 2; GH.ghost.add(rg);                // кольцо — видно и на траве, и сверху
  }
  GH.ghost.visible = true;
  GH.ghost.position.set(G.x, d.groundH(G.x, G.z), G.z);
}

/* ── подписи пометок, мини-карта, геймпад ── */
const LAB = new Map();
const V3 = () => (V3.v || (V3.v = new THREE.Vector3()));
function labels () {
  const box = $('ed-labels'), cam = d.cam, cx = cam.position.x, cz = cam.position.z, seen = new Set();
  const W = innerWidth, H = innerHeight;
  for (const n of st.notes) {
    if ($('ed-hidedone').checked && n.done) continue;
    if (Math.hypot(n.x - cx, n.z - cz) > Math.max(900, (cam.position.y - gH(cx, cz)) * 3)) continue;
    const v = V3().set(n.x, gH(n.x, n.z) + 7.3, n.z).project(cam);
    if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) continue;
    let el = LAB.get(n.id);
    if (!el) { el = document.createElement('div'); el.className = 'ed-lab'; box.appendChild(el); LAB.set(n.id, el); el.onclick = () => { st.selNote = n.id; renderLists(); }; }
    if (el.dataset.t !== n.text) { el.textContent = n.text; el.dataset.t = n.text; el.title = n.text; }
    el.classList.toggle('done', !!n.done); el.classList.toggle('sel', st.selNote === n.id);
    el.style.left = ((v.x + 1) / 2 * W) + 'px'; el.style.top = ((1 - v.y) / 2 * H) + 'px';
    el.hidden = false; seen.add(n.id);
  }
  for (const [id, el] of LAB) if (!seen.has(id)) { if (!st.notes.some(n => n.id === id)) { el.remove(); LAB.delete(id); } else el.hidden = true; }
}
let mmT = 0, ghT = 0;
function loop (now) {
  requestAnimationFrame(loop);
  try {
    labels();
    for (const c of d.CLOUDS || []) c.visible = st.clouds;     // облака на ~100 м — сверху закрывают город
    if (now - ghT > 50) { ghT = now; updateGhost(false); }
    if (now - mmT > 250) {
      mmT = now;
      const s = st.sel, sel = s ? (s.type === 'add' ? s.a : s.type === 'note' ? s.n : s) : null;
      MM.draw({ cam: { x: CAM.P.x, z: CAM.P.z, yaw: CAM.P.yaw }, notes: $('ed-hidedone').checked ? st.notes.filter(n => !n.done) : st.notes, adds: st.edits.add, removes: st.edits.remove, sel });
      $('ed-pos').textContent = `камера: x ${Math.round(CAM.P.x)}, z ${Math.round(CAM.P.z)}, высота ${Math.round(CAM.P.y - gH(CAM.P.x, CAM.P.z))} м`;
      if (now - camSaved > 1000) { camSaved = now; saveCam(); }
      // ельник и газон строятся у камеры: правка «убрать» находит своё, когда клетка собралась — список и кресты заново
      let lazy = 0;
      for (const r of st.edits.remove) if (d.EDL.LAZY[r.kind] && d.EDL.hits(r) > 0) lazy++;
      if (lazy !== st.lazySeen) { st.lazySeen = lazy; rebuildMarks(); renderLists(); }
    }
    // геймпад: A — действие в центре экрана, B — отмена
    const p = CAM.pad, padOn = now - p.used < 8000;
    $('ed-root').classList.toggle('pad', padOn);
    if (p.a && !p.aWas) onClick(innerWidth / 2, innerHeight / 2);
    if (p.b && !p.bWas) { closePop(); st.sel = null; showSel(); renderSel(); }
    p.aWas = p.a; p.bWas = p.b;
  } catch (e) { console.error('[editor]', e); }
}

/* ── для probe и агентов ── */
window.__editor = {
  st, get cam () { return CAM.P; },
  goTo: (x, z, h) => CAM.goTo(x, z, h), top: (x, z, h) => CAM.top(x, z, h), side: (x, z) => CAM.side(x, z),
  setTool, setKind: name => { const k = KINDS.find(q => q.name === name || q.sub === name || q.kind === name); if (k) setKind(k); return k; }, setFar,
  addNote, place, removeCity, unAdd, unRemove, rotateAdd, check, pickAt, groundAt, pen, inHouse, grove, clearCircle, undo, setBrush,
  cityNear: (x, z, r = 3) => cityAround(x, z, r).map(c => ({ ...c, d: r2(Math.hypot(c.x - x, c.z - z)) })).sort((a, b) => a.d - b.d),
  click: (cx, cy) => onClick(cx, cy),
  get ghost () { return GH.ghost; }, hover: (cx, cy) => { MOUSE.x = cx; MOUSE.y = cy; MOUSE.in = true; updateGhost(true); },
};
