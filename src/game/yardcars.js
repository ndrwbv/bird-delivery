/* ──────────────────────────────────────────────────────────────────────────
   Машины во дворах (16.10.2026, автор: «Никто не ездит по дворам — надо добавить машины»,
   «во дворах надо добавить машины и парковки»; правила словами — docs/CAREER.md «Машины во дворах»).

   1. Карманы парковки вдоль дворовых проездов (класс 7, «service» в карте, без проездов стоянок):
      • двор — это проезд в YC.ENT_R м от подъезда многоэтажки (промзоны, гаражи, пустыри — мимо);
      • карман — асфальт за краем проезда (EDGE м от полотна): вдоль (PAR — машины друг за другом)
        или «ёлочкой» поперёк (PERP — носом к дому, с белыми полосами между местами); мест в кармане
        PAR_N / PERP_N, между карманами GAP м, начало кармана — жребий START на каждые STEP м;
      • место не встаёт в дом, на чужое полотно, тротуар, дорожку, аллею, в стоянку и площадку, в дерево,
        будку, забор, лавочку, урну, в воду, ближе ENT_MIN м к двери подъезда, у пиццерии и точки
        конкурента, на стройку; занято FILL мест (остальные — пусто), COVER машин — под тентом.
   2. Стоящие — настоящие машины потока (carObj) в сетке стоящих (trafficgrid.js sleep): твёрдые, их
      толкают, мнут, взрывают (boom → wakeNear). В общий список TRAFFIC нетронутая не входит (их ~3 000 —
      циклы по TRAFFIC не растут): тронули — out() кладёт её туда.
      Своей модели у нетронутой нет (пустая группа: память — ~3 КБ на машину, а не ~160):
      все стоящие дворов рисуются InstancedMesh — один вызов отрисовки на модель (5 моделей), только
      ближе дальности машин (220 м, в последние 35 м плавно уменьшаются). Тронули (trafficgrid.js wake) —
      out(): своя лёгкая модель на сцену, дальше — как любая припаркованная (fullCar, мятины, полёт).
   3. Немного ездят: рядом с курьером (MOV.R м) 1—3 машины (ночью — до одной) медленно, 15—25 км/ч:
      • выезд — стоящая машина двора сдаёт назад (поперёк) или выруливает (вдоль) из кармана, едет по
        дворовым проездам до улицы и вливается в поток;
      • заезд — машина с улицы (родится вне кадра) сворачивает во двор, едет до свободного места
        и паркуется (дальше — снова стоящая, в общей отрисовке).
      Едут как скорая и курьеры (game.js svcDrive): тормозят перед курьером, людьми и машинами.

     YCARS.build(api)      — LATE-шаг сборки (до сугробов: места — в PARKED, сугроб там не насыпают)
     YCARS.cars()          — LATE-шаг после 'cars': машины по местам, отрисовка
     YCARS.out(t, bare)    — trafficgrid.js wake: true — это машина двора, своя модель уже на сцене
     YCARS.view(x, z, R, band) — каждый кадр (game.js cullFar): какие стоящие рисовать
     YCARS.step(dt)        — каждый кадр (CL.step): кто едет
     YCARS.blocks(x, z, r) — место кармана (мелочь на газоне и ельник туда не встают)
     YCARS.carsEach(...)   — стоящие в прямоугольнике (навигатор во дворах, routeyard.js: как забор)
   ────────────────────────────────────────────────────────────────────────── */

export const YC = {
  ENT_R: 55,              // м: от подъезда до места — двор
  ENT_MIN: 6,             // м: от двери подъезда до любой точки места — свободно (клиент, пин, тропинка)
  STEP: 4,                // м: шаг по проезду между жребиями «здесь карман»
  START: 0.075,           // жребий на начало кармана на каждом шаге (на телефоне — × START_TOUCH)
  START_TOUCH: 0.6,
  GAP: [12, 40],          // м: после кармана — пусто
  ENDS: 5,                // м: от концов куска проезда (перекрёсток, излом) — без мест
  PERP: 0.3,              // доля карманов поперёк (носом к дому)
  PAR_N: [2, 5], PERP_N: [3, 8],
  PAR: { SP: 6.1, D: 2.3 },     // вдоль: на машину 6,1 м проезда, глубина кармана 2,3 м
  PERP_: { SP: 2.75, D: 5.0 },  // поперёк: 2,75 м, глубина 5 м
  EDGE: 0.15,             // м: от края полотна до кармана
  FILL: 0.8,              // доля занятых мест
  BACK: 0.25,             // поперёк — доля стоящих задом (носом к проезду)
  COVER: 0.05,            // под тентом
  MAX: 3600, MAX_TOUCH: 2200,   // потолок машин на город (страховка: в Солнечном ~3 200 / ~1 900)
  Y: 0.1,                 // высота асфальта кармана (тротуар проезда 0,09, полотно 0,14)
  HEX: '#a6abb3',         // асфальт кармана — как у стоянок
  LINE: '#eeeae0',
  COVER_HEX: ['#5d6b5a', '#6c7480', '#8a8170', '#4f5a6b'],
  // дворовая палитра: к обычным цветам потока — выцветшие «Жигули» и тёмные
  CAR_HEX: ['#7fa8e0', '#e6dfd2', '#f2f2ee', '#3c4048', '#9aa6b8', '#c85a4f', '#b9b4a6', '#6b2f2f', '#2f4a3a', '#7a7f86', '#1f2329', '#3a4f7a', '#b0b5bb', '#8fd0a4', '#d9c27a'],
  MOV: {
    R: 180,               // м: машины двора ездят только у курьера
    IN_MIN: 45,           // м: заезжающая родится не ближе (и вне кадра)
    OUT_MIN: 22,          // м: выезжающая — не ближе
    WANT: [1, 3], NIGHT: 1,
    EVERY: 1.6,           // с: как часто пробовать добавить
    ROLL: 45,             // с: сколько машин хотим — жребий заново
    SPEED: [4.2, 6.9],    // м/с: 15—25 км/ч
    FAR: 260,             // м: уехал курьер — машину (вне кадра) убираем
    STUCK: 30,            // с: не продвинулась по пути — вне кадра убираем, на виду протискивается
    GLIDE: 2.1,           // м/с: заезд в карман и выезд из него
    PATH: 420,            // м: самый длинный путь по дворам
  },
};

export const ST = { rej: {}, segs: 0, spots: 0, cars: 0, pockets: 0, perp: 0, cover: 0, ms: 0, msCars: 0, woke: 0, drawn: 0,
  mov: { now: 0, out: 0, in: 0, flow: 0, parked: 0, gone: 0, fail: 0 }, yard: { nodes: 0, mouths: 0 } };

let A = null, THREE = null;
const SPOTS = [], POCKETS = [], CARS = [];
const PG = new Map(), PGC = 32;          // карманы по клеткам (blocks)
const CG = new Map(), CGC = 64;          // машины двора по клеткам (view, выезд)
const EDGE_SPOTS = new Map();            // ребро графа (меньший узел, больший) → места
const YADJ = new Map();                  // узел → [{ b, e, len }] — дворовые проезды
const MOUTH = new Set();                 // узлы, где проезд выходит на улицу
const MOUTH_G = new Map();
const MOV = [];
const rand = (a, b) => a + Math.random() * (b - a);
const irand = (a, b) => Math.floor(rand(a, b + 1));
const pick = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const gk = (i, j) => i * 65536 + j;
const gput = (G, C, x, z, v) => { const k = gk(Math.floor(x / C), Math.floor(z / C)); let a = G.get(k); if (!a) G.set(k, a = []); a.push(v); };
const ekey = (a, b) => (a < b ? a * 1e6 + b : b * 1e6 + a);

/* ── места ── */
function inRect (P, x, z, r) {
  const dx = x - P.cx, dz = z - P.cz;
  return Math.abs(dx * P.ux + dz * P.uz) < P.hl + r && Math.abs(dx * P.nx + dz * P.nz) < P.hd + r;
}
export function blocks (x, z, r = 0) {
  if (!POCKETS.length) return false;
  const i0 = Math.floor((x - r - 8) / PGC), i1 = Math.floor((x + r + 8) / PGC), j0 = Math.floor((z - r - 8) / PGC), j1 = Math.floor((z + r + 8) / PGC);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const a = PG.get(gk(i, j));
    if (a) for (const P of a) if (inRect(P, x, z, r)) return true;
  }
  return false;
}
function putPocket (P) {
  const ex = Math.abs(P.ux) * P.hl + Math.abs(P.nx) * P.hd, ez = Math.abs(P.uz) * P.hl + Math.abs(P.nz) * P.hd;
  const seen = new Set();
  for (let i = Math.floor((P.cx - ex) / PGC); i <= Math.floor((P.cx + ex) / PGC); i++)
    for (let j = Math.floor((P.cz - ez) / PGC); j <= Math.floor((P.cz + ez) / PGC); j++) {
      const k = gk(i, j);
      if (seen.has(k)) continue;
      seen.add(k);
      let a = PG.get(k); if (!a) PG.set(k, a = []); a.push(P);
    }
  POCKETS.push(P);
}

/** LATE-шаг сборки города (шагами): места и асфальт карманов. api — см. game.js ycApi */
export function* build (api) {
  A = api; THREE = api.THREE;
  let ms = 0, tt = performance.now();
  A.indexSolids();                                  // деревья дворов и будки уже посажены — твёрдое по клеткам заново
  // подъезды — по клеткам
  const EG = new Map(), EC = 32;
  for (const e of A.CITY.entrances || []) gput(EG, EC, e[0], e[1], e);
  const entD = (x, z, R) => {
    let best = Infinity;
    for (let i = Math.floor((x - R) / EC); i <= Math.floor((x + R) / EC); i++)
      for (let j = Math.floor((z - R) / EC); j <= Math.floor((z + R) / EC); j++)
        for (const e of EG.get(gk(i, j)) || []) { const d = Math.hypot(e[0] - x, e[1] - z); if (d < best) best = d; }
    return best;
  };
  // стоянки, площадки, вода — многоугольники по клеткам
  const LG = new Map(), LC = 64;
  const addPoly = p => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of p) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1]; }
    const b = { p, x0, x1, z0, z1 };
    for (let i = Math.floor(x0 / LC); i <= Math.floor(x1 / LC); i++) for (let j = Math.floor(z0 / LC); j <= Math.floor(z1 / LC); j++) gput(LG, 1, i, j, b);
  };
  for (const l of A.CITY.lots || []) addPoly(l.p);
  for (const g of A.CITY.green || []) if (g.k === 'water' || g.k === 'pitch' || g.k === 'play') addPoly(g.p);
  const inLot = (x, z) => { for (const b of LG.get(gk(Math.floor(x / LC), Math.floor(z / LC))) || []) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && A.inPoly(x, z, b.p)) return true; return false; };
  const CL = A.claims();
  const claimed = (x, z) => { for (const c of CL) if (Math.abs(c.x - x) < c.r + 3 && Math.abs(c.z - z) < c.r + 3 && Math.hypot(c.x - x, c.z - z) < c.r + 1.5) return true; return false; };
  const pzs = A.pizzerias();
  const nearPizza = (x, z) => { for (const P of pzs) if (P && Math.hypot(P.x - x, P.z - z) < 40) return true; return false; };
  const ramps = A.RAMPS || [];
  // дом рядом: двор жилой, если ближний дом — жилой или общественный (не цех и не гараж)
  const nearKind = (x, z) => {
    let best = Infinity, k = null;
    for (let i = Math.floor((x - 40) / 40); i <= Math.floor((x + 40) / 40); i++)
      for (let j = Math.floor((z - 40) / 40); j <= Math.floor((z + 40) / 40); j++)
        for (const b of A.HOUSE_GRID.get(i + ',' + j) || []) {
          const p = b.p;
          let cx = 0, cz = 0;
          for (const q of p) { cx += q[0]; cz += q[1]; }
          const d = Math.hypot(cx / p.length - x, cz / p.length - z);
          if (d < best) { best = d; k = b.k; }
        }
    return k;
  };
  const cap = A.mobile() ? YC.MAX_TOUCH : YC.MAX, START = YC.START * (A.mobile() ? YC.START_TOUCH : 1);
  let nCars = 0, nSeg = 0;
  ms += performance.now() - tt; yield 'index'; tt = performance.now();
  const roads = A.CITY.roads.filter(r => r.c === 7 && !r.x && !r.b && r.s !== 'parking_aisle' && r.s !== 'drive-through');
  // по городу — в случайном порядке, чтобы потолок мест (cap) не съел один угол карты
  for (let i = roads.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = roads[i]; roads[i] = roads[j]; roads[j] = t; }
  const E = YC.EDGE;
  for (const r of roads) {
    if (nCars >= cap) break;
    const w = A.roadWidth(r), p = r.p, hw = w / 2;
    for (let si = 1; si < p.length; si++) {
      const ax = p[si - 1][0], az = p[si - 1][1], bx = p[si][0], bz = p[si][1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 2 * YC.ENDS + 5) continue;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (!A.inBounds(mx, mz, 30) || entD(mx, mz, YC.ENT_R + len / 2) > YC.ENT_R + len / 2) continue;
      const kind = nearKind(mx, mz);
      if (kind === 'ind' || kind === 'gar') continue;
      if (++nSeg % 20 === 0) { ms += performance.now() - tt; yield 'yardcars'; tt = performance.now(); }
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      const na = A.NODE_IDX.get(ax + ',' + az), nb = A.NODE_IDX.get(bx + ',' + bz);
      for (const side of [1, -1]) {
        const nx = -uz * side, nz = ux * side;          // наружу от проезда
        let s = YC.ENDS + rand(0, 6);
        while (s < len - YC.ENDS - 3 && nCars < cap) {
          if (Math.random() > START) { s += YC.STEP; continue; }
          const perp = Math.random() < YC.PERP;
          const G = perp ? YC.PERP_ : YC.PAR;
          const want = perp ? irand(YC.PERP_N[0], YC.PERP_N[1]) : irand(YC.PAR_N[0], YC.PAR_N[1]);
          const list = [];
          let s1 = s;
          for (let k = 0; k < want && s1 + G.SP <= len - YC.ENDS; k++, s1 += G.SP) {
            const sc = s1 + G.SP / 2, off = hw + E + G.D / 2;
            const cx = ax + ux * sc + nx * off, cz = az + uz * sc + nz * off;
            if (!spotOk(cx, cz, ux, uz, nx, nz, G.SP / 2 - 0.15, G.D / 2, hw, entD, inLot, claimed, nearPizza, ramps)) { if (list.length) break; s = s1 + G.SP; continue; }
            list.push({ sc, cx, cz });
          }
          if (!list.length) { s += YC.STEP; continue; }
          // карман: асфальт под всеми местами подряд
          const sA = list[0].sc - G.SP / 2, sB = list[list.length - 1].sc + G.SP / 2;
          const P = { cx: ax + ux * (sA + sB) / 2 + nx * (hw + E + G.D / 2), cz: az + uz * (sA + sB) / 2 + nz * (hw + E + G.D / 2),
            ux, uz, nx, nz, hl: (sB - sA) / 2, hd: G.D / 2, perp, n: list.length };
          putPocket(P);
          paintPocket(P, ax, az, sA, sB, hw + E, G, list);
          ST.pockets++; if (perp) ST.perp++;
          for (const q of list) {
            const sp = { x: q.cx, z: q.cz, h: 0, perp, ux, uz, nx, nz, w, sa: q.sc, len, na, nb,
              ax: ax + ux * q.sc, az: az + uz * q.sc, t: null, res: null, i: SPOTS.length };
            sp.h = perp ? Math.atan2(nx, nz) : Math.atan2(ux, uz);
            SPOTS.push(sp);
            const e = [q.cx, q.cz, sp.h];
            e.yc = sp;                                   // game.js 'cars': эти — не свои модели, их ставит yardcars.js
            A.PARKED.push(e);
            if (Math.random() < YC.FILL) { sp.want = 1; nCars++; }
            if (na !== undefined && nb !== undefined) { const k = ekey(na, nb); let a = EDGE_SPOTS.get(k); if (!a) EDGE_SPOTS.set(k, a = []); a.push(sp); }
          }
          s = sB + rand(YC.GAP[0], YC.GAP[1]);
        }
      }
    }
  }
  ST.segs = nSeg; ST.spots = SPOTS.length;
  ms += performance.now() - tt;
  ST.ms = Math.round(ms);
}

const rej = k => { ST.rej[k] = (ST.rej[k] || 0) + 1; return false; };
function spotOk (cx, cz, ux, uz, nx, nz, hl, hd, hw, entD, inLot, claimed, nearPizza, ramps) {
  if (!A.inBounds(cx, cz, 20) || nearPizza(cx, cz) || A.startClear(cx, cz)) return rej('place');
  if (inLot(cx, cz)) return rej('lot');
  if (claimed(cx, cz)) return rej('claim');
  if (entD(cx, cz, YC.ENT_MIN + hl + hd) < YC.ENT_MIN + 0.5) return rej('door');
  for (const R of ramps) if (Math.abs(R.x - cx) < 9 && Math.abs(R.z - cz) < 9) return rej('ramp');
  if (A.pzBlocks(cx, cz, hl + 1) || A.rivBlocks(cx, cz, hl + 1)) return rej('pizza');
  // уже занято соседним карманом (излом проезда, другой проезд рядом)
  if (blocks(cx, cz, 0.6) || blocks(cx + ux * hl, cz + uz * hl, 0.4) || blocks(cx - ux * hl, cz - uz * hl, 0.4)) return rej('pocket');
  // сбиваемое рядом: заборы, урны, контейнеры, фонари, знаки
  let hit = false;
  A.smashNear(cx, cz, it => { if (!hit && Math.abs(it.x - cx) < hl + 4 && Math.abs(it.z - cz) < hl + 4) { const dx = it.x - cx, dz = it.z - cz; if (Math.abs(dx * ux + dz * uz) < hl + (it.r || 0.5) + 0.3 && Math.abs(dx * nx + dz * nz) < hd + (it.r || 0.5) + 0.3) hit = true; } });
  if (hit) return rej('smash');
  // по точкам места: сетка ~1 м
  const nu = Math.max(2, Math.ceil(hl * 2 / 1.1)), nv = Math.max(2, Math.ceil(hd * 2 / 1.1));
  for (let a = 0; a <= nu; a++)
    for (let b = 0; b <= nv; b++) {
      const lu = -hl + 2 * hl * a / nu, lv = -hd + 2 * hd * b / nv;
      const x = cx + ux * lu + nx * lv, z = cz + uz * lu + nz * lv;
      if (A.groundH(x, z) < 0.3) return rej('water');
      if (A.inHouse(x, z, 0.8)) return rej('house');
      const pv = A.onPave(x, z, 0);
      if (pv === 'road' || pv === 'path' || pv === 'alley') return rej(pv);
      if (pv === 'walk') {                            // метр плитки у самого проезда — можно, тротуар улицы — нет
        const nr = A.nearestRoad(x, z, 7, 1);
        if (!nr || nr.seg.c !== 7 || nr.d > nr.seg.w / 2 + 1.3) return rej('walk');
      }
      if (A.solidAt(x, z, 0.35)) return rej('solid');
      if (A.yardBlocks(x, z, 0.35)) return rej('yard');
      if (entD(x, z, YC.ENT_MIN) < YC.ENT_MIN) return rej('door2');
    }
  return true;
}

function paintPocket (P, ax, az, sA, sB, e0, G, list) {
  const { ux, uz, nx, nz } = P;
  const pt = (s, o) => [ax + ux * s + nx * o, az + uz * s + nz * o];
  A.LITM.color(YC.HEX);
  A.LITM.poly([pt(sA, e0 - 0.05), pt(sB, e0 - 0.05), pt(sB, e0 + G.D), pt(sA, e0 + G.D)], YC.Y);
  if (!P.perp) return;
  A.FLATM.color(YC.LINE);
  const bounds = [list[0].sc - G.SP / 2];
  for (const q of list) bounds.push(q.sc + G.SP / 2);
  for (const s of bounds) { const a = pt(s, e0 + 0.35), b = pt(s, e0 + G.D - 0.25); A.FLATM.ribbon(a[0], a[1], b[0], b[1], 0.12, YC.Y + 0.03); }
}

/* ── отрисовка: InstancedMesh на модель ── */
const U = { uBasic: { value: null }, uLed: { value: null } };
const MODELS = [];        // { model, im, geo, cap, n, col, cov }
let MAT = null;
const MI = new Map();
const COVER_Y = 0.55;     // тент — выше этого (колёса снизу видно)

function material (base) {
  const m = base.clone();
  m.onBeforeCompile = sh => {
    for (const k in U) sh.uniforms[k] = U[k];
    sh.vertexShader = 'attribute float aM;\nattribute float aF;\nattribute float aCov;\nvarying float vF;\n' +
      sh.vertexShader.replace('#include <color_vertex>', `#include <color_vertex>
  vF = aF;
#ifdef USE_INSTANCING_COLOR
  if (aCov > 0.5 && position.y > ${COVER_Y.toFixed(2)}) { vColor.xyz = instanceColor.xyz * (0.9 + 0.1 * color.r); vF = 0.0; }
  else vColor.xyz = aM > 0.5 ? color.xyz * instanceColor.xyz : color.xyz;
#endif`);
    sh.fragmentShader = 'uniform vec3 uBasic, uLed;\nvarying float vF;\n' +
      sh.fragmentShader.replace('#include <opaque_fragment>', `if (vF > 0.5) outgoingLight = vColor * (vF > 1.5 ? uLed : uBasic);   // фары — без света, как у лёгкой машины
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'yardcars';
  m.userData.shared = true;
  return m;
}

/* шаблон модели: кузов (цвет кузова — по маске aM) и фары (aF: 1 — как LITE_BASIC, 2 — LED) одним куском */
function modelGeo (model) {
  const T = A.liteTemplate(model);
  const parts = [[T.lit, 0, T.mask]];
  if (T.flat) parts.push([T.flat, model === 'cn' ? 2 : 1, null]);
  let vn = 0, iN = 0;
  for (const [g] of parts) { vn += g.attributes.position.count; iN += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(vn * 3), nor = new Float32Array(vn * 3), col = new Float32Array(vn * 3), aM = new Float32Array(vn), aF = new Float32Array(vn), idx = new Uint32Array(iN);
  let vo = 0, io = 0;
  for (const [g, f, mask] of parts) {
    const P = g.attributes.position, N = g.attributes.normal, K = g.attributes.color, n = P.count;
    for (let i = 0; i < n; i++) {
      const j = (vo + i) * 3;
      pos[j] = P.getX(i); pos[j + 1] = P.getY(i); pos[j + 2] = P.getZ(i);
      if (N) { nor[j] = N.getX(i); nor[j + 1] = N.getY(i); nor[j + 2] = N.getZ(i); }
      if (K) { col[j] = K.getX(i); col[j + 1] = K.getY(i); col[j + 2] = K.getZ(i); } else col[j] = col[j + 1] = col[j + 2] = 1;
      aM[vo + i] = mask && mask[i] ? 1 : 0;
      aF[vo + i] = f;
    }
    if (g.index) { const I = g.index.array; for (let i = 0; i < I.length; i++) idx[io + i] = I[i] + vo; io += I.length; }
    else { for (let i = 0; i < n; i++) idx[io + i] = vo + i; io += n; }
    vo += n;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aM', new THREE.BufferAttribute(aM, 1));
  geo.setAttribute('aF', new THREE.BufferAttribute(aF, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return { geo, hl: T.hl };
}

function modelOf (model) {
  let k = MI.get(model);
  if (k !== undefined) return MODELS[k];
  const { geo, hl } = modelGeo(model);
  const M = { model, geo, hl, im: null, cap: 0, n: 0 };
  MI.set(model, MODELS.length);
  MODELS.push(M);
  return M;
}
function ensureIM (M, cap) {
  if (M.im && M.cap >= cap) return;
  const c = Math.max(cap, 32);
  if (M.im) { A.scene.remove(M.im); M.im.dispose(); }
  const im = new THREE.InstancedMesh(M.geo, MAT, c);
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(c * 3), 3);
  M.cov = new THREE.InstancedBufferAttribute(new Float32Array(c), 1);
  M.geo.setAttribute('aCov', M.cov);
  im.count = 0; im.visible = false;
  im.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
  im.name = 'yardcars';
  im.userData.yard = true;
  A.scene.add(im);
  M.im = im; M.cap = c;
}

/* пустая модель машины: та же форма userData, что у makeCarLite (game.js), детей нет — рисует InstancedMesh */
function hollow (hex, model, hl) {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  g.userData = A.dbl({ lite: true, hl, wheels: [], steer: [], panels: [], glass: [], hazard: [], dmg: 0, bodyHex: hex, model, taxi: false, full: undefined, _pose: undefined });
  return g;
}

/* машина t (лёгкая или пустая, стоит на месте s) — в общую отрисовку */
function adopt (t, s, hex, cov, inT) {
  const M = modelOf(t.model), g = t.mesh;
  A.poseOnSlope(t);
  g.updateMatrix();
  t.pk = { x: t.x, z: t.z, h: t.h, mesh: g, yc: s, mi: MI.get(t.model), m: Float32Array.from(g.matrix.elements), hex, cov: cov ? 1 : 0, inT: !!inT,
    r: 0, gg: 0, b: 0 };
  const c = new THREE.Color(hex);
  t.pk.r = c.r; t.pk.gg = c.g; t.pk.b = c.b;
  s.t = t; s.res = null;
  if (M.im && M.n + 4 > M.cap) ensureIM(M, Math.ceil(M.cap * 1.5));   // заехало больше, чем место в отрисовке
  A.TGRID.sleep(t);
  gput(CG, CGC, t.x, t.z, t);
  CARS.push(t);
  M.n++;
  VW.dirty = true;
}

/** LATE-шаг после 'cars': машины по местам (нетронутые — пустые, рисует InstancedMesh) */
/* шагами (function*, latebuild.js): на Деке ~0,1—0,25 с одним куском — через каждые 120 машин, потом пачки и граф */
export function* cars () {
  if (!A || !A.TGRID.TG.on) return;                // ?oldcars — без сетки стоящих: дворы пустые
  let t0 = performance.now(), ms = 0, nc = 0;
  MAT = material(A.LITE_MAT);
  U.uBasic.value = new THREE.Color(1, 1, 1); U.uLed.value = new THREE.Color(1, 1, 1);
  const V = A.V;
  for (const s of SPOTS) {
    if (!s.want || Math.hypot(s.x - V.x, s.z - V.z) < 11) continue;
    if (++nc % 120 === 0) { ms += performance.now() - t0; yield 'cars'; t0 = performance.now(); }
    const model = pick(A.MODELS), cov = Math.random() < YC.COVER;
    const hex = cov ? pick(YC.COVER_HEX) : pick(YC.CAR_HEX);
    const M = modelOf(model);
    let h = s.h;
    if (s.perp ? Math.random() < YC.BACK : Math.random() < 0.5) h += Math.PI;
    const t = A.carObj(hollow(hex, model, M.hl), model, false, true, rand(9, 14), 100, rand(8, 30));
    t.x = s.x; t.z = s.z; t.h = h;
    adopt(t, s, hex, cov, false);                  // в TRAFFIC — только когда тронут (out): списки машин не растут на тысячи
    if (cov) ST.cover++;
  }
  ms += performance.now() - t0; yield 'cars'; t0 = performance.now();
  for (const M of MODELS) ensureIM(M, M.n + 48);
  ST.cars = CARS.length;
  ms += performance.now() - t0; yield 'im'; t0 = performance.now();
  buildGraph();
  ST.msCars = Math.round(ms + performance.now() - t0);
  READY = true;
}

/* тент: вся машина выше колёс — цвета ткани */
function coverPaint (geo, hex) {
  const c = new THREE.Color(hex), P = geo.attributes.position, K = geo.attributes.color;
  for (let i = 0; i < P.count; i++) if (P.getY(i) > COVER_Y) { const k = 0.9 + 0.1 * K.getX(i); K.setXYZ(i, c.r * k, c.g * k, c.b * k); }
  K.needsUpdate = true;
}

/** trafficgrid.js wake: стоящую двора тронули — своя лёгкая модель на сцену. false — не наша (parkmerge.js) */
export function out (t, bare) {
  const P = t.pk;
  if (!P || !P.yc) return false;
  t.pk = undefined;
  if (!P.inT && !t.gone) A.TRAFFIC.push(t);       // в общий список: дальше её двигает поток (trafficgrid.js fresh)
  const L = A.makeCarLite(P.hex, t.model, false);
  for (const c of [...L.children]) t.mesh.add(c);
  if (P.cov) { const m = t.mesh.children[0]; if (m && m.geometry) coverPaint(m.geometry, P.hex); }
  if (P.cov && t.mesh.children[1]) t.mesh.children[1].visible = false;   // фары под тентом не видно
  if (!bare && !t.mesh.parent && !t.gone) A.scene.add(t.mesh);
  const M = MODELS[P.mi]; if (M) M.n--;
  ST.woke++;
  VW.dirty = true;
  return true;
}

const VW = { x: 1e9, z: 1e9, t: 0, R: 0, dirty: true };
let READY = false;
/** каждый кадр (game.js cullFar): стоящие дворов ближе R — в InstancedMesh; в последние band м — уменьшаются */
export function view (x, z, R, band) {
  if (!MAT) return;
  MAT.color.copy(A.LITE_MAT.color); MAT.emissive.copy(A.LITE_MAT.emissive);
  U.uBasic.value.copy(A.LITE_BASIC.color); U.uLed.value.copy(A.LED_MAT.color);
  const now = performance.now();
  if (!VW.dirty && (x - VW.x) ** 2 + (z - VW.z) ** 2 < 4 && now - VW.t < 250 && R === VW.R) return;
  VW.dirty = false; VW.x = x; VW.z = z; VW.t = now; VW.R = R;
  for (const M of MODELS) { M.k = 0; M.rad = 0; }
  const i0 = Math.floor((x - R) / CGC), i1 = Math.floor((x + R) / CGC), j0 = Math.floor((z - R) / CGC), j1 = Math.floor((z + R) / CGC);
  const R2 = R * R;
  let drawn = 0;
  for (let i = i0; i <= i1; i++)
    for (let j = j0; j <= j1; j++) {
      const a = CG.get(gk(i, j));
      if (!a) continue;
      for (let q = 0; q < a.length; q++) {
        const t = a[q], P = t.pk;
        if (!P || !P.yc || !t.still || t.gone) continue;
        const dx = t.x - x, dz = t.z - z, d2 = dx * dx + dz * dz;
        if (d2 > R2) continue;
        const M = MODELS[P.mi];
        if (!M.im || M.k >= M.cap) continue;
        const d = Math.sqrt(d2);
        let s = clamp((R - d) / band, 0, 1);
        s = Math.max(0.02, s * s * (3 - 2 * s));
        const e = M.im.instanceMatrix.array, o = M.k * 16, m = P.m;
        for (let c = 0; c < 12; c++) e[o + c] = (c & 3) === 3 ? m[c] : m[c] * s;
        e[o + 12] = m[12]; e[o + 13] = m[13]; e[o + 14] = m[14]; e[o + 15] = 1;
        const ca = M.im.instanceColor.array, co = M.k * 3;
        ca[co] = P.r; ca[co + 1] = P.gg; ca[co + 2] = P.b;
        M.cov.array[M.k] = P.cov;
        if (d + 4 > M.rad) M.rad = d + 4;
        M.k++; drawn++;
      }
    }
  for (const M of MODELS) {
    const im = M.im;
    if (!im) continue;
    im.count = M.k;
    im.visible = M.k > 0;
    if (!M.k) continue;
    im.instanceMatrix.needsUpdate = true; im.instanceMatrix.clearUpdateRanges(); im.instanceMatrix.addUpdateRange(0, M.k * 16);
    im.instanceColor.needsUpdate = true; im.instanceColor.clearUpdateRanges(); im.instanceColor.addUpdateRange(0, M.k * 3);
    M.cov.needsUpdate = true; M.cov.clearUpdateRanges(); M.cov.addUpdateRange(0, M.k);
    im.boundingSphere.center.set(x, 0, z); im.boundingSphere.radius = M.rad + 3;
  }
  ST.drawn = drawn;
}

/** взрыв (game.js boom): стоящие дворов ближе r — будим (своя модель, в TRAFFIC), чтобы их помяло и отбросило */
export function wakeNear (x, z, r) {
  if (!CARS.length) return;
  for (let i = Math.floor((x - r) / CGC); i <= Math.floor((x + r) / CGC); i++)
    for (let j = Math.floor((z - r) / CGC); j <= Math.floor((z + r) / CGC); j++)
      for (const t of CG.get(gk(i, j)) || []) if (t.still && t.pk && t.pk.yc && Math.hypot(t.x - x, t.z - z) < r) A.TGRID.wake(t);
}

/** нетронутые стоящие дворов ближе r (по квадрату ±r): fn(t). Их нет в TRAFFIC — кто ищет машины рядом
    по TRAFFIC (лось — fauna.js, отскок ошмётков — game.js bounceBody), добавляет их отсюда */
export function eachNear (x, z, r, fn) {
  if (!CARS.length) return;
  for (let i = Math.floor((x - r) / CGC); i <= Math.floor((x + r) / CGC); i++)
    for (let j = Math.floor((z - r) / CGC); j <= Math.floor((z + r) / CGC); j++) {
      const a = CG.get(gk(i, j));
      if (a) for (let q = 0; q < a.length; q++) { const t = a[q]; if (t.still && t.pk && t.pk.yc && !t.pk.inT && !t.gone && Math.abs(t.x - x) < r && Math.abs(t.z - z) < r) fn(t); }
    }
}

/** стоящие дворов (нетронутые) в прямоугольнике: fn(cx, cz, cs, sn, hw, hd) — коробка как у obb (routeyard.js) */
export function carsEach (x0, z0, x1, z1, fn) {
  for (let i = Math.floor(x0 / CGC); i <= Math.floor(x1 / CGC); i++)
    for (let j = Math.floor(z0 / CGC); j <= Math.floor(z1 / CGC); j++)
      for (const t of CG.get(gk(i, j)) || []) {
        if (!t.pk || !t.pk.yc || t.gone || t.x < x0 || t.x > x1 || t.z < z0 || t.z > z1) continue;
        fn(t.x, t.z, Math.sin(t.h), Math.cos(t.h), (t.hl || 2.2) + 0.2, 1.15);
      }
}
/** стоящая двора, нетронутая (на большой карте не рисуем — их сотни) */
export const parkedYard = t => !!(t.still && t.pk && t.pk.yc);

/* ── граф дворовых проездов ── */
function usable (e) { return e && e.ok && !e.closed && !e.lock; }
function buildGraph () {
  const { NODES, edgeOf } = A;
  for (const s of A.RSEG) {
    if (s.c !== 7 || s.x || s.b || s.na === undefined || s.nb === undefined) continue;
    const e = edgeOf(s.na, s.nb);
    if (!e || e.c !== 7) continue;
    if ((A.RAMPS || []).some(R => { const dx = R.x - s.x1, dz = R.z - s.z1, l = e.len || 1, u = (dx * e.ux + dz * e.uz) / l; return u > -0.1 && u < 1.1 && Math.abs(dx * e.rx + dz * e.rz) < 4; })) continue;   // трамплин на проезде — туда не едем
    for (const [a, b] of [[s.na, s.nb], [s.nb, s.na]]) {
      let L = YADJ.get(a); if (!L) YADJ.set(a, L = []);
      if (!L.some(q => q.b === b)) L.push({ b, e: edgeOf(a, b), len: e.len });
    }
  }
  for (const n of YADJ.keys()) {
    const N = NODES[n];
    if (N.nb.some(m => { const e = edgeOf(n, m); return e && e.c <= 5; })) { MOUTH.add(n); gput(MOUTH_G, CGC, N.x, N.z, n); }
  }
  ST.yard.nodes = YADJ.size; ST.yard.mouths = MOUTH.size;
}

/* кратчайшие пути по дворовым проездам от узла s (не дальше max м); ban — запрещённое первое ребро [a, b] */
function dijkstra (s, max, ban) {
  const D = new Map([[s, 0]]), PR = new Map(), open = [s], done = new Set();
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (D.get(open[i]) < D.get(open[bi])) bi = i;
    const a = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (done.has(a)) continue;
    done.add(a);
    const da = D.get(a);
    for (const q of YADJ.get(a) || []) {
      if (!usable(q.e)) continue;
      if (ban && a === ban[0] && q.b === ban[1]) continue;
      const d = da + q.len;
      if (d > max) continue;
      if (d < (D.has(q.b) ? D.get(q.b) : Infinity)) { D.set(q.b, d); PR.set(q.b, a); open.push(q.b); }
    }
    if (done.size > 400) break;
  }
  return { D, PR };
}
function chain (PR, s, n) { const out = [n]; while (n !== s) { n = PR.get(n); if (n === undefined) return null; out.push(n); } return out.reverse(); }

/* точки пути по полосе: правее оси на LO м (на изломе — по биссектрисе) */
const LO = w => Math.min(1.1, w / 5);
function lanePts (nodes, w) {
  const N = A.NODES, pts = nodes.map(n => [N[n].x, N[n].z]), out = [];
  for (let i = 0; i < pts.length; i++) {
    const b = pts[i], a = pts[i - 1], c = pts[i + 1];
    const r1 = a ? right(a, b) : null, r2 = c ? right(b, c) : null;
    let nx = (r1 ? r1[0] : 0) + (r2 ? r2[0] : 0), nz = (r1 ? r1[1] : 0) + (r2 ? r2[1] : 0);
    const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    const ref = r1 || r2 || [0, 0], dot = Math.max(0.6, nx * ref[0] + nz * ref[1]);
    const o = LO(w) / dot;
    out.push([b[0] + nx * o, b[1] + nz * o]);
  }
  return out;
}
function right (a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; }

/* выезд на улицу у узла M: улица (ребро от M), точки на её правой полосе через 5 и 12 м */
function streetOut (M, fromX, fromZ) {
  const N = A.NODES[M], opts = [];
  for (const m of N.nb) {
    const e = A.edgeOf(M, m);
    if (!usable(e) || e.c > 5 || e.len < 14) continue;
    const dx = N.x - fromX, dz = N.z - fromZ, l = Math.hypot(dx, dz) || 1;
    opts.push({ e, dot: (dx * e.ux + dz * e.uz) / l });
  }
  if (!opts.length) return null;
  opts.sort((a, b) => b.dot - a.dot);
  const e = (opts.length > 1 && Math.random() < 0.35 ? opts[1] : opts[0]).e;
  const o = e.oneway ? 0 : Math.min(e.w / 4, 2.4);
  return [[N.x + e.ux * 5 + e.rx * o, N.z + e.uz * 5 + e.rz * o], [N.x + e.ux * 13 + e.rx * o, N.z + e.uz * 13 + e.rz * o]];
}

/* кривая Безье: точка и касательная */
function bez (C, u, out) {
  const v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
  out[0] = a * C[0] + b * C[2] + c * C[4] + d * C[6];
  out[1] = a * C[1] + b * C[3] + c * C[5] + d * C[7];
  const ta = -3 * v * v, tb = 3 * v * v - 6 * u * v, tc = 6 * u * v - 3 * u * u, td = 3 * u * u;
  out[2] = ta * C[0] + tb * C[2] + tc * C[4] + td * C[6];
  out[3] = ta * C[1] + tb * C[3] + tc * C[5] + td * C[7];
  return out;
}
const BZ = [0, 0, 0, 0];
function cubic (x0, z0, hx0, hz0, x3, z3, hx3, hz3) {
  const k = Math.max(1.5, Math.hypot(x3 - x0, z3 - z0) / 3);
  const C = [x0, z0, x0 + hx0 * k, z0 + hz0 * k, x3 - hx3 * k, z3 - hz3 * k, x3, z3];
  let L = 0, px = x0, pz = z0;
  for (let i = 1; i <= 12; i++) { bez(C, i / 12, BZ); L += Math.hypot(BZ[0] - px, BZ[1] - pz); px = BZ[0]; pz = BZ[1]; }
  return { C, L };
}

/* ── едущие ── */
function svcOn (t, path) {
  t.parked = false; t.svc = 'yard'; t.path = path; t.pi = 0; t.goal = null; t.arrived = 0; t.repath = 0;
  t.cruise = rand(YC.MOV.SPEED[0], YC.MOV.SPEED[1]); t.acc = 2.2; t.corner = 0.45; t.gap = 1.3; t.peds = true; t.aggr = 0;
  t.onWreck = onWreck; t.speed = Math.max(0, t.speed || 0);
}
function svcOff (t) {
  t.svc = undefined; t.path = null; t.goal = null; t.arrived = 0; t.repath = 0;
  t.acc = undefined; t.corner = undefined; t.gap = undefined; t.peds = undefined; t.onWreck = undefined;
}
function onWreck (t) {                              // сгорела в пути: на виду — тлеет, потом убираем
  if (A.shown(t.x, t.z)) { t.wreckT = 1; return; }
  drop(t);
}
function drop (t) {
  const m = MOV.find(q => q.t === t);
  if (m) end(m);
  if (!t.gone) { A.svcGone(t); ST.mov.gone++; }
}
function end (m) {
  const i = MOV.indexOf(m);
  if (i >= 0) MOV.splice(i, 1);
  if (m.spot && m.spot.res === m) m.spot.res = null;
}

/* из трёх случайных — ближняя к курьеру: машины двора чаще едут там, где их видно */
function nearOf (a, dist) {
  let bi = (Math.random() * a.length) | 0, bd = dist(a[bi]);
  for (let k = 0; k < 2; k++) { const i = (Math.random() * a.length) | 0, d = dist(a[i]); if (d < bd) { bd = d; bi = i; } }
  return bi;
}
/* выезд: стоящая двора рядом с курьером */
function planOut (t) {
  const s = t.pk.yc;
  if (s.na === undefined || s.nb === undefined) return null;
  const hx = Math.sin(t.h), hz = Math.cos(t.h);
  const facesRoad = s.perp && hx * s.nx + hz * s.nz < 0;
  const opts = s.perp ? (Math.random() < 0.5 ? [1, -1] : [-1, 1]) : [hx * s.ux + hz * s.uz > 0 ? 1 : -1];
  for (const sg of opts) {
    const dx = s.ux * sg, dz = s.uz * sg, rx = -dz, rz = dx, lo = LO(s.w);
    const ahead = sg > 0 ? s.nb : s.na, behind = sg > 0 ? s.na : s.nb;
    const left = sg > 0 ? s.len - s.sa : s.sa;       // до узла впереди
    if (left < 6) continue;
    let G, rev = false;
    if (s.perp && !facesRoad) {                      // носом к дому — сдаёт назад на полосу позади места
      const back = sg > 0 ? s.sa : s.len - s.sa;
      if (back < 6) continue;
      const lx = s.ax - dx * 5 + rx * lo, lz = s.az - dz * 5 + rz * lo;
      G = cubic(lx, lz, dx, dz, s.x, s.z, s.nx, s.nz); rev = true;
    } else {                                         // вдоль или носом к проезду — выруливает вперёд
      const lx = s.ax + dx * Math.min(7, left - 2) + rx * lo, lz = s.az + dz * Math.min(7, left - 2) + rz * lo;
      G = cubic(s.x, s.z, hx, hz, lx, lz, dx, dz);
    }
    const end0 = rev ? [G.C[0], G.C[1]] : [G.C[6], G.C[7]];
    const R = dijkstra(ahead, YC.MOV.PATH, [ahead, behind]);
    let best = -1, bd = Infinity;
    for (const [n, d] of R.D) if (MOUTH.has(n) && d < bd) { bd = d; best = n; }
    if (best < 0) continue;
    const nodes = chain(R.PR, ahead, best);
    if (!nodes) continue;
    const pts = lanePts(nodes, s.w);
    const N = A.NODES, last = nodes.length > 1 ? N[nodes[nodes.length - 2]] : { x: end0[0], z: end0[1] };
    const ext = streetOut(best, last.x, last.z);
    if (!ext) continue;
    pts[pts.length - 1] = [N[best].x, N[best].z];   // на выезде — ось проезда: дальше полоса улицы
    return { G, rev, path: [end0, ...pts, ...ext] };
  }
  return null;
}
function spawnOut () {
  const V = A.V, R = YC.MOV.R, cand = [];
  for (let i = Math.floor((V.x - R) / CGC); i <= Math.floor((V.x + R) / CGC); i++)
    for (let j = Math.floor((V.z - R) / CGC); j <= Math.floor((V.z + R) / CGC); j++)
      for (const t of CG.get(gk(i, j)) || []) {
        if (!t.still || !t.pk || !t.pk.yc || t.gone || t.pk.cov) continue;
        const d = Math.hypot(t.x - V.x, t.z - V.z);
        if (d > YC.MOV.OUT_MIN && d < R) cand.push(t);
      }
  for (let k = 0; k < 8 && cand.length; k++) {
    const i = nearOf(cand, t => Math.hypot(t.x - V.x, t.z - V.z)), t = cand[i];
    cand[i] = cand[cand.length - 1]; cand.pop();
    const pl = planOut(t);
    if (!pl) continue;
    const s = t.pk.yc;
    A.TGRID.wake(t);                                // своя модель на сцену (out), из сетки стоящих
    t.moved = 0;
    svcOn(t, []); t.speed = 0;                      // на кривой — «служба» без пути (стоит на месте для svcDrive), ведёт glide; не «припаркованная»
    const m = { t, kind: 'out', ph: 'glide', G: pl.G, u: pl.rev ? 1 : 0, du: pl.rev ? -1 : 1, path: pl.path, spot: null, pi: 0, idle: 0, age: 0 };
    if (s.t === t) s.t = null;
    MOV.push(m); ST.mov.out++;
    return true;
  }
  return false;
}

/* заезд: с улицы во двор, до свободного места */
function spawnIn () {
  const V = A.V, R = YC.MOV.R, cand = [];
  for (let i = Math.floor((V.x - R) / CGC); i <= Math.floor((V.x + R) / CGC); i++)
    for (let j = Math.floor((V.z - R) / CGC); j <= Math.floor((V.z + R) / CGC); j++)
      for (const n of MOUTH_G.get(gk(i, j)) || []) { const N = A.NODES[n], d = Math.hypot(N.x - V.x, N.z - V.z); if (d > YC.MOV.IN_MIN && d < R) cand.push(n); }
  for (let k = 0; k < 6 && cand.length; k++) {
    const i = nearOf(cand, n => Math.hypot(A.NODES[n].x - V.x, A.NODES[n].z - V.z)), M = cand[i];
    cand[i] = cand[cand.length - 1]; cand.pop();
    const N = A.NODES[M];
    // откуда: улица, что ведёт в M; родится в 14 м до него, вне кадра
    const ins = [];
    for (const q of N.nb) { const e = A.edgeOf(q, M); if (usable(e) && e.c <= 5 && e.len > 18) ins.push(e); }
    if (!ins.length) continue;
    const e = pick(ins), o = e.oneway ? 0 : Math.min(e.w / 4, 2.4);
    const px = N.x - e.ux * 14 + e.rx * o, pz = N.z - e.uz * 14 + e.rz * o;
    if (Math.hypot(px - V.x, pz - V.z) < YC.MOV.IN_MIN || A.inView(px, 1.2, pz, 4)) continue;
    if (A.carNear(px, pz, 8)) continue;
    // свободное место по дворам от M
    const Dk = dijkstra(M, YC.MOV.PATH, null), spots = [];
    for (const [a, da] of Dk.D) for (const q of YADJ.get(a) || []) {
      for (const s of EDGE_SPOTS.get(ekey(a, q.b)) || []) {
        if (s.t || s.res) continue;
        const along = a === s.na ? s.sa : s.len - s.sa;
        if (along < 9 || !usable(q.e)) continue;
        spots.push({ s, a, b: q.b, d: da + along });
      }
    }
    if (!spots.length) continue;
    spots.sort((x, y) => x.d - y.d);
    const S = spots[Math.min(spots.length - 1, (Math.random() * Math.min(10, spots.length)) | 0)];
    const nodes = chain(Dk.PR, M, S.a);
    if (!nodes) continue;
    const s = S.s, sg = S.a === s.na ? 1 : -1, dx = s.ux * sg, dz = s.uz * sg, lo = LO(s.w);
    const pts = lanePts(nodes, s.w);
    pts[0] = [N.x, N.z];
    const p0 = [s.ax - dx * 6 - dz * lo, s.az - dz * 6 + dx * lo];   // за 6 м до места, на правой полосе
    const t = A.newCar(true);
    A.scene.add(t.mesh);
    A.TRAFFIC.push(t);
    t.x = px; t.z = pz; t.h = Math.atan2(e.ux, e.uz); t.gy = undefined;
    svcOn(t, [[px, pz], ...pts, p0]);
    t.speed = 4;
    A.poseOnSlope(t);
    const m = { t, kind: 'in', ph: 'drive', G: null, u: 0, du: 1, path: null, spot: s, pi: 0, idle: 0, age: 0, dir: [dx, dz] };
    s.res = m;
    MOV.push(m); ST.mov.in++;
    return true;
  }
  return false;
}

/* кривая заезда/выезда: по ней машину ведёт этот модуль (стоит «припаркованной», как толкнутая) */
function glide (m, dt) {
  const t = m.t;
  t.speed = 0;                                     // svcDrive её не двигает
  const v = YC.MOV.GLIDE * (0.45 + 0.55 * Math.sin(Math.PI * clamp(m.u, 0.04, 0.96)));
  m.u = clamp(m.u + m.du * v * dt / (m.G.L || 1), 0, 1);
  bez(m.G.C, m.u, BZ);
  t.x = BZ[0]; t.z = BZ[1];
  if (BZ[2] * BZ[2] + BZ[3] * BZ[3] > 1e-6) t.h = Math.atan2(BZ[2], BZ[3]);
  A.poseOnSlope(t);
  return m.du > 0 ? m.u >= 1 : m.u <= 0;
}

let SPAWN_T = 2, ROLL_T = 0, WANT = 1, CHK_T = 0;
/** каждый кадр (game.js CL.step после потока) */
export function step (dt) {
  if (!READY || !A) return;
  const V = A.V;
  if ((ROLL_T -= dt) <= 0) { ROLL_T = YC.MOV.ROLL; WANT = A.night() ? (Math.random() < 0.5 ? YC.MOV.NIGHT : 0) : irand(YC.MOV.WANT[0], YC.MOV.WANT[1]); }
  for (let i = MOV.length - 1; i >= 0; i--) {
    const m = MOV[i], t = m.t;
    m.age += dt;
    if (t.gone) { end(m); continue; }
    const d = Math.hypot(t.x - V.x, t.z - V.z);
    if (d > YC.MOV.FAR && !A.inView(t.x, 1.2, t.z, 4)) { drop(t); continue; }
    if (t.knock || t.wreck || t.stalled || t.driver) {          // задели — дальше как обычная машина
      if (m.ph === 'glide') { svcOff(t); t.parked = true; end(m); ST.mov.fail++; }   // стоит, где остановилась (припаркованная)
      continue;
    }
    if (m.ph === 'glide') {
      if (glide(m, dt)) {
        if (m.kind === 'out') { m.ph = 'drive'; svcOn(t, m.path); t.speed = 1.5; }
        else { t.x = m.spot.x; t.z = m.spot.z; t.h = m.spot.perp ? m.spot.h : Math.atan2(m.dir[0], m.dir[1]); settle(m); }
      }
      continue;
    }
    // едет (svcDrive в game.js)
    if (t.pi !== m.pi) { m.pi = t.pi; m.idle = 0; } else m.idle += dt;
    if (m.idle > YC.MOV.STUCK) {
      if (!A.shown(t.x, t.z)) { drop(t); ST.mov.fail++; continue; }
      t.ghost = 2; m.idle = 0;
    }
    const P = t.path;
    if (!P || t.pi >= P.length || t.arrived) {
      if (m.kind === 'out') {                        // на улице — в поток
        const r = A.nearestRoad(t.x, t.z, 5, 2);
        if (r && r.d < r.seg.w / 2 + 1.5) { svcOff(t); t.cruise = rand(9, 14); end(m); A.rejoinRoad(t); ST.mov.flow++; }
        else if (!A.shown(t.x, t.z)) drop(t);
      } else {                                       // у места — заруливает
        const s = m.spot;
        if (s.t) { drop(t); continue; }              // место заняли — уезжает «за кадр»
        t.path = []; t.pi = 0; t.speed = 0;          // путь кончился — дальше кривая (glide)
        const ex = s.perp ? s.nx : m.dir[0], ez = s.perp ? s.nz : m.dir[1];
        m.G = cubic(t.x, t.z, Math.sin(t.h), Math.cos(t.h), s.x, s.z, ex, ez);
        m.u = 0; m.du = 1; m.ph = 'glide';
      }
    }
  }
  if ((CHK_T -= dt) <= 0) { CHK_T = 0.5; ST.mov.now = MOV.length; }
  if ((SPAWN_T -= dt) <= 0) {
    SPAWN_T = YC.MOV.EVERY;
    if (MOV.length < WANT && A.live()) {
      const outFirst = Math.random() < 0.55;
      if (!(outFirst ? spawnOut() || spawnIn() : spawnIn() || spawnOut())) ST.mov.fail++;
    }
  }
}

/* приехала на место: своя модель — вон, машина — в общую отрисовку стоящих */
function settle (m) {
  const t = m.t, s = m.spot;
  end(m);
  svcOff(t); t.parked = true; t.speed = 0; t.moved = 0;
  const g = t.mesh, u = g.userData;
  if (!u.lite || u.dmg > 0 || s.t) { ST.mov.parked++; return; }   // мятая — стоит своей моделью
  const hex = u.bodyHex;
  A.scene.remove(g);
  for (const c of [...g.children]) { g.remove(c); if (c.geometry && !c.geometry.userData.shared) c.geometry.dispose(); }
  adopt(t, s, hex, false, true);                 // она и так в TRAFFIC
  ST.mov.parked++;
}

export const DEBUG = { YC, ST, SPOTS, POCKETS, CARS, MOV, MODELS, YADJ, MOUTH, get ready () { return READY; }, spawnOut: () => spawnOut(), spawnIn: () => spawnIn() };
