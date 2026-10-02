/* ──────────────────────────────────────────────────────────────────────────
   Следы колёс на газоне и снегу.

   Съехал с асфальта на траву — за задними колёсами остаются две тёмные
   полосы, зимой по снегу — серо-синие колеи (по снегу на дороге — тоже,
   когда снега много, только бледнее). В заносе и на ручнике след темнее и
   шире, и к нему добавляются полосы от передних колёс: машину боком видно
   по земле. След лежит на земле и тает: трава — за ~28 с, снег — за ~40 с.

   Дёшево для Steam Deck: всё — один меш, один вызов отрисовки. Кольцевой
   буфер на CAP кусков (кусок — четырёхугольник ~0,5–1,2 м под одним
   колесом), выделен раз и навсегда; за кадр дописываются только новые
   куски, и на видеокарту уходит только их диапазон. Таяние считает
   шейдер по времени рождения куска — каждый кадр буфер не трогаем.
   Следов нет — меш спрятан, вызова нет вовсе.

   Где асфальт: улица с тротуаром (nearestRoad), площадки и парковки
   (CITY.lots), дорожки (CITY.paths), аллеи (world.js), площадки АЗС
   (landmarks.js), парковка курьеров у пиццерии. Вода, мост, трамплин,
   полёт — следа нет.

   Всё, что нужно из игры, приходит объектом api (init в game.js).
   ────────────────────────────────────────────────────────────────────────── */
import * as SEAS from './seasons.js';
import { onAlley } from './world.js';
import { FUEL_PADS } from './landmarks.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

const CAP = 3072;                       // кусков в кольце (×4 вершины — 12 тыс., Uint16 хватает)
const LIFE_GRASS = 28, LIFE_SNOW = 40;  // сколько живёт след, с; последние 45 % — тает
const LIFT = 0.06, LIFT_ROAD = 0.2;     // над землёй (газоны лежат на 0,04), над асфальтом
const W_TIRE = 0.34;                    // ширина следа шины, м
const JUMP = 6;                         // колесо прыгнуло дальше — это не езда, а телепорт: след рвём

let A = null, M = null, G = null;
let POS = null, COL = null, AT = null;
let head = 0, filled = 0, now = 0, lastBirth = -1e9, q0 = -1, k = 0;
let lastX = 0, lastZ = 0;
// цвета (линейные, как у вершин three.js) и непрозрачность по виду поверхности: 1 трава, 2 снег, 3 снег на асфальте
const TINT = [null, null, null, null], BASE_A = [0, 0.44, 0.62, 0.38];
export const STATS = { quads: 0, kind: 0 };

/* колесо: идёт ли сейчас след, последняя точка середины и края */
const W = [0, 1, 2, 3].map(() => ({ on: false, cx: 0, cz: 0, lx: 0, ly: 0, lz: 0, rx: 0, ry: 0, rz: 0 }));

export function init (api) {
  A = api;
  const THREE = A.THREE;
  for (const [i, hex] of [[1, '#3a4520'], [2, '#7a879f'], [3, '#5a616d']]) TINT[i] = new THREE.Color(hex);
  POS = new Float32Array(CAP * 12);
  COL = new Uint8Array(CAP * 16);
  AT = new Float32Array(CAP * 8);
  const idx = new Uint16Array(CAP * 6);
  for (let q = 0; q < CAP; q++) {
    const a = q * 4, o = q * 6;
    idx[o] = a; idx[o + 1] = a + 1; idx[o + 2] = a + 2; idx[o + 3] = a + 1; idx[o + 4] = a + 3; idx[o + 5] = a + 2;
  }
  G = new THREE.BufferGeometry();
  const attr = (arr, n, norm) => new THREE.BufferAttribute(arr, n, norm).setUsage(THREE.DynamicDrawUsage);
  G.setAttribute('position', attr(POS, 3));
  G.setAttribute('color', attr(COL, 4, true));        // альфа в цвете: в заносе след гуще
  G.setAttribute('aT', attr(AT, 2));                  // когда родился и сколько живёт
  G.setIndex(new THREE.BufferAttribute(idx, 1));
  G.setDrawRange(0, 0);
  const uNow = { value: 0 };
  // освещается, как земля (ночью темнеет вместе с ней), прозрачный, глубину не пишет
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uNow = uNow;
    sh.vertexShader = 'attribute vec2 aT;\nuniform float uNow;\nvarying float vFade;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvFade = 1.0 - smoothstep(aT.y * 0.55, aT.y, uNow - aT.x);');
    sh.fragmentShader = 'varying float vFade;\n' + sh.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\ndiffuseColor.a *= vFade;\nif (diffuseColor.a < 0.01) discard;');
  };
  mat.customProgramCacheKey = () => 'tracks';
  M = new THREE.Mesh(G, mat);
  M.userData.uNow = uNow;
  M.frustumCulled = false;                            // кольцо разбросано по городу; cull.js такой меш не снимает
  M.renderOrder = 2;                                  // под оранжевым маршрутом (3)
  M.matrixAutoUpdate = false;
  // виден с пустым диапазоном: шейдер соберёт renderer.compile под экраном загрузки, а не рывком при первом следе
  A.scene.add(M);
  lastX = A.V.x; lastZ = A.V.z;
  if (new URLSearchParams(location.search).has('debug')) window.__trk = { STATS, clear, surf: x => surf(x[0], x[1], snowK()) };
}

export function clear () {
  head = 0; filled = 0; q0 = -1;
  for (const w of W) w.on = false;
  if (G) G.setDrawRange(0, 0);
  STATS.quads = 0;
}

/* ── где асфальт ──
   Площадки, дорожки, АЗС и пруды раскладываем по клеткам один раз, при
   первом вопросе: дальше — несколько сравнений на точку. */
const CELL = 32;
let GRID = null;
const ckey = (i, j) => (i + 4000) * 8000 + (j + 4000);
function gridAdd (item, x0, z0, x1, z1) {
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
    for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
      const key = ckey(i, j);
      let a = GRID.get(key);
      if (!a) GRID.set(key, a = []);
      a.push(item);
    }
}
function buildGrid () {
  GRID = new Map();
  // h — на сколько над рельефом нарисован верх (game.js osmRoads / osmParkingLots, landmarks.js)
  const poly = (p, water, h) => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const q of p) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1]; }
    if (!(x1 - x0 < 3000 && z1 - z0 < 3000)) return;
    gridAdd({ p, x0, z0, x1, z1, water, h }, x0, z0, x1, z1);
  };
  for (const l of A.CITY.lots || []) poly(l.p, false, l.k === 'park' ? 0.11 : 0.025);
  for (const g of A.CITY.green || []) if (g.k === 'water') poly(g.p, true, 0.03);
  for (const p of FUEL_PADS) poly(p, false, 0.1);
  for (const q of A.CITY.paths || [])
    for (let i = 1; i < q.length; i++) {
      const x1 = q[i - 1][0], z1 = q[i - 1][1], x2 = q[i][0], z2 = q[i][1];
      gridAdd({ s: [x1, z1, x2, z2] }, Math.min(x1, x2) - 1.2, Math.min(z1, z2) - 1.2, Math.max(x1, x2) + 1.2, Math.max(z1, z2) + 1.2);
    }
}
/* верх плитки, дорожки, площадки или парковки над рельефом в точке, м; −1 — ничего такого
   (трава, голая земля). Для hits.js: на что ложится сбитый вдали от улицы */
export function pavedLift (x, z) {
  if (!A) return -1;
  if (!GRID) buildGrid();
  let h = -1;
  const a = GRID.get(ckey(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (a) for (let i = 0; i < a.length; i++) {
    const it = a[i];
    if (it.s) { if (h < 0.085 && segD(x, z, it.s[0], it.s[1], it.s[2], it.s[3]) < 1.05) h = 0.085; continue; }
    if (it.water || it.h <= h || x < it.x0 || x > it.x1 || z < it.z0 || z > it.z1 || !A.inPoly(x, z, it.p)) continue;
    h = it.h;
  }
  if (h < 0.075 && onAlley(x, z, 0)) h = 0.075;
  return h;
}
function segD (x, z, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1;
  const t = clamp(((x - x1) * dx + (z - z1) * dz) / l2, 0, 1);
  return Math.hypot(x - x1 - dx * t, z - z1 - dz * t);
}
/* 0 — асфальт, плитка, площадка; 1 — земля и трава; -1 — вода */
function ground (x, z) {
  const r = A.nearestRoad(x, z, 9, 1);
  if (r && r.d < r.seg.w / 2 + (r.seg.c <= 5 ? 2.75 : 1.0)) return 0;   // полотно с тротуаром, пешеходная дорожка
  if (!GRID) buildGrid();
  const a = GRID.get(ckey(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (a) for (let i = 0; i < a.length; i++) {
    const it = a[i];
    if (it.s) { if (segD(x, z, it.s[0], it.s[1], it.s[2], it.s[3]) < 1.05) return 0; continue; }
    if (x < it.x0 || x > it.x1 || z < it.z0 || z > it.z1 || !A.inPoly(x, z, it.p)) continue;
    return it.water ? -1 : 0;
  }
  if (onAlley(x, z, 0)) return 0;
  for (const pz of A.pizzerias()) {
    if (!pz || !pz.slots) continue;
    for (const s of pz.slots) if (Math.abs(s.x - x) < 3.4 && Math.abs(s.z - z) < 3.4) return 0;
  }
  return 1;
}
/* сколько снега: 0 — нет, 1 — зима в разгаре (seasons.js: slip = снег × 0,32) */
const snowK = () => SEAS.slip() / 0.32;
/* вид следа в точке: 0 — нет следа, 1 — трава, 2 — снег, 3 — снег на асфальте */
function surf (x, z, sn) {
  const g = A.groundH(x, z);
  if (g < -0.05) return 0;                              // река, дно
  if (A.surfaceAt(x, z, A.V.y) - g > 0.5) return 0;     // по мосту
  const k = ground(x, z);
  if (k < 0) return 0;
  if (sn > 0.5) return k ? 2 : sn > 0.75 ? 3 : 0;
  return k ? 1 : 0;
}

/* одна вершина куска */
function vtx (v, x, y, z, c, a, life) {
  const p = v * 3, o = v * 4, t = v * 2;
  POS[p] = x; POS[p + 1] = y; POS[p + 2] = z;
  COL[o] = c.r * 255; COL[o + 1] = c.g * 255; COL[o + 2] = c.b * 255; COL[o + 3] = a * 255;
  AT[t] = now; AT[t + 1] = life;
}
/* дописанное за кадр — на видеокарту одним диапазоном (на стыке кольца — двумя) */
function flush () {
  if (q0 < 0) return;
  const n = head > q0 ? head - q0 : CAP - q0;
  const at = G.attributes;
  at.position.addUpdateRange(q0 * 12, n * 12); at.position.needsUpdate = true;
  at.color.addUpdateRange(q0 * 16, n * 16); at.color.needsUpdate = true;
  at.aT.addUpdateRange(q0 * 8, n * 8); at.aT.needsUpdate = true;
  q0 = -1;
}
function quad (w, lx, ly, lz, rx, ry, rz, kind, a) {
  if (q0 < 0) q0 = head;
  const c = TINT[kind], life = kind === 1 ? LIFE_GRASS : LIFE_SNOW, v = head * 4;
  a *= (k++ & 1) ? 0.84 : 1;                           // через кусок светлее — крупный протектор, как пиксели
  vtx(v, w.lx, w.ly, w.lz, c, a, life);
  vtx(v + 1, w.rx, w.ry, w.rz, c, a, life);
  vtx(v + 2, lx, ly, lz, c, a, life);
  vtx(v + 3, rx, ry, rz, c, a, life);
  head++;
  if (filled < CAP) filled++;
  if (head >= CAP) { flush(); head = 0; }
  lastBirth = now;
}

/* машина: колёса из её меша (у машин карьеры база своя), запасные — как у седана */
const WX = [-0.89, 0.89, -0.89, 0.89], WZ = [1.4, 1.4, -1.45, -1.45];
function wheelsOf (car) {
  const ws = car && car.userData && car.userData.wheels;
  if (!ws || ws.length < 4) return;
  for (let i = 0; i < 4; i++) { const p = ws[i].parent && ws[i].parent.position; if (p) { WX[i] = p.x; WZ[i] = p.z; } }
}

export function step (dt) {
  if (!M) return;
  now += dt;
  M.userData.uNow.value = now;
  const V = A.V;
  // телепорт (новая смена, другой район, новая машина с неба) — старые следы ни к чему
  if (Math.abs(V.x - lastX) + Math.abs(V.z - lastZ) > 40) clear();
  lastX = V.x; lastZ = V.z;
  const live = filled > 0 && now - lastBirth < LIFE_SNOW;
  M.visible = live;
  if (!live && filled) { filled = 0; head = 0; G.setDrawRange(0, 0); }

  const speed = Math.hypot(V.vx || 0, V.vz || 0);
  if (V.air || V.sink !== undefined || (V.rlift || 0) > 0.05) { for (const w of W) w.on = false; return; }
  if (speed < 0.6) return;
  wheelsOf(A.car());
  const fx = Math.sin(V.h), fz = Math.cos(V.h), sx = fz, sz = -fx;
  const vl = Math.abs(V.vx * sx + V.vz * sz);
  const slide = clamp((vl - 1.2) / 5, 0, 1), hand = A.IN.hand && speed > 3 ? 1 : 0;
  const sn = snowK();
  const st = clamp(0.5 + speed * 0.02, 0.5, 1.2);       // кусок длиннее на скорости
  const hw = (W_TIRE + slide * 0.12) / 2;
  const str = Math.min(1, 0.72 + slide * 0.4 + hand * 0.2);
  let kindSeen = 0;
  for (let i = 0; i < 4; i++) {
    const w = W[i];
    if (i < 2 && slide < 0.25 && !hand) { w.on = false; continue; }   // передние — только боком
    const px = V.x + sx * WX[i] + fx * WZ[i], pz = V.z + sz * WX[i] + fz * WZ[i];
    const dx = px - w.cx, dz = pz - w.cz, d = Math.hypot(dx, dz);
    if (w.on && d < st) continue;
    const kind = surf(px, pz, sn);
    if (kind) kindSeen = kind;
    if (!kind) { w.on = false; w.cx = px; w.cz = pz; continue; }
    // края следа — поперёк пути колеса (в заносе он идёт не по оси машины)
    let nx = sx, nz = sz;
    if (w.on && d < JUMP && d > 0.01) { nx = dz / d; nz = -dx / d; }
    const lift = kind === 3 ? LIFT_ROAD : LIFT;
    const lx = px + nx * hw, lz = pz + nz * hw, rx = px - nx * hw, rz = pz - nz * hw;
    const ly = A.groundH(lx, lz) + lift + A.curbAt(lx, lz), ry = A.groundH(rx, rz) + lift + A.curbAt(rx, rz);
    if (w.on && d < JUMP) quad(w, lx, ly, lz, rx, ry, rz, kind, BASE_A[kind] * str);
    w.on = true; w.cx = px; w.cz = pz;
    w.lx = lx; w.ly = ly; w.lz = lz; w.rx = rx; w.ry = ry; w.rz = rz;
  }
  STATS.kind = kindSeen;
  flush();
  if (filled) { G.setDrawRange(0, filled * 6); M.visible = true; }
  STATS.quads = filled;
}
