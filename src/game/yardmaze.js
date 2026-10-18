/* ──────────────────────────────────────────────────────────────────────────
   Дворы сложнее (автор 12.10 и 16.10.2026: «надо, чтобы дворы были сложнее: там, где тротуар, — заборы
   несбиваемые, но не всегда; большие клумбы; леса — чтобы интересно и сложно было доехать… кустов положить
   ещё можно»; «игрок всегда старался ездить по дороге, и по тротуару ему ехать было сложнее, потому что там
   заборы стоят»). Правила словами — docs/CAREER.md «Город: как выглядит» → «Дворы сложнее».

   1. Заборы вдоль тротуаров (FEN). По внешнему краю тротуара улиц (класс 1—4, со стороны газона, у дворов —
      ближе ENT_NEAR м есть подъезд) — забор. Сторона улицы режется на куски по RUN м,
      у каждого куска жребий по месту: твёрдое (SOLID), сбиваемое (SMASH) или ничего.
      Твёрдое и сбиваемое — разной формы (автор 18.10: «по ним непонятно, сбиваются они или нет»):
        • твёрдое — тяжёлое, серое, толстое (STY: бетонный парапет, бетонные столбы с толстой трубой, кирпичные
          столбы с кованой решёткой); как стена (SOLIDS: машина упирается, на скорости — удар как о стену); каждые
          PED м — проход для людей PED_W м (машине не пролезть) с тумбами в красно-белых шапках по краям; каждые
          PIECE м — проезд CAR_GAP м (или кусок сбиваемого): двор за забором всегда достижим;
        • сбиваемое — хлипкое, светлое (SMASH_HEX): тонкие крашеные трубы или штакетник, секции по 2,5 м, как дворовые
          заборчики (smashAdd 'fence'). Советского ограждения из труб в твёрдом больше нет.
      Не встаёт: на чужое полотно, тротуар, дорожку, аллею (въезды во дворы, перекрёстки, тропинки — разрывы сами
      собой), у фасада (дом ближе FRONT м), у подъезда, остановки, въезда на стоянку и АЗС, у пиццерии и точки
      конкурента, на стройке, у кармана парковки, у дерева, будки, фонаря, лавочки и чужого забора.
   2. Во дворах (у подъездов, вглубь двора и между домами) — то, что надо объезжать:
        • большие клумбы (BED): круг 2,6—4,5 м, бордюр (белёный, бело-красный) или покрышки, внутри земля горкой
          и цветы (зимой — под снегом); твёрдые, как стена (4 коробки — почти круг);
        • кусты (HEDGE): живая изгородь рядом (сирень и шиповник — твёрдые, как кусты под окнами; или
          сбиваемые кусты, как у подъездов);
        • лесочки (GROVE): 8—22 дерева густо (стволы — твёрдые, между ними машине не пролезть).
      Не встаёт: на дорожки и проезды, у подъездов и клиентов, в карманы парковки, на площадки и стоянки, в воду,
      ельник, на стройки, у пиццерий; от дома, проезда, деревьев и друг от друга — запас: проезд вокруг остаётся.

   Всё — в общей склейке статики (LIT) и сбиваемой мелочи (smashAdd), деревья — trees.js/seasons.js:
   новых вызовов отрисовки нет. Сборка — шагами (latebuild.js).

     YMAZE.build(api)              — LATE-шаг (после машин дворов, до сугробов и smashBuild)
     YMAZE.blocks(x, z, r)         — занято лабиринтом (мелочь на газоне и ельник туда не встают)
     YMAZE.segHits(ax, az, bx, bz) — отрезок задевает твёрдое лабиринта (навигатор: прямая к клиенту — «режет»)
   ?nomaze — без всего этого (сравнить).
   ────────────────────────────────────────────────────────────────────────── */
import { wet } from './streams.js';
import { MOB } from './mobile.js';                 // телефон: лесочки меньше (MOB.groveR)

export const MAZE = {
  FEN: {
    CLS: 4,                    // классы улиц 1…CLS (0 — трасса — нет)
    OFF: 0.55,                 // ось забора — за внешним краем тротуара, м
    RUN: [40, 75],             // кусок стороны улицы с одним жребием, м
    SOLID: 0.45, SMASH: 0.12,  // доли кусков: твёрдое / сбиваемое (остальное — без забора)
    SEC: 2.5,                  // секция, м
    H: 0.85,                   // высота, м
    PED: [15, 30],             // твёрдое: проход для людей через столько метров
    PED_W: 1.0,                // его ширина, м (машине не пролезть)
    PIECE: [26, 52],           // твёрдое: кусок между проездами, м
    CAR_GAP: 3,                // проезд — столько секций (7,5 м); у половины — сбиваемые секции вместо пустоты
    ENT_NEAR: 70,              // у дворов: подъезд ближе, м
    FRONT: 3.2,                // дом ближе — это фасад, забора нет
    ENT: 7, STOP: 8, PARK: 10, PIZZA: 45, FUEL: 7,
    TH: 0.16,                  // полутолщина твёрдого для удара, м (на вид — 0,3—0,48 м)
    // твёрдое — тяжёлое и серое: доли видов (парапет, столбы с трубой, кирпич с решёткой) и цвета
    STY: [0.35, 0.4, 0.25],
    CONCRETE: ['#8f8c84', '#827f78', '#9a968b'],
    PIPE: ['#34373c', '#2e4a3a', '#4a3a30'],   // толстая труба: графит, тёмно-зелёная, тёмно-коричневая
    BRICK: ['#8c4632', '#7b3c2c', '#955a40'],
    // сбиваемое — светлое и яркое: тонкие трубы (половина) или штакетник
    SMASH_HEX: ['#f0c63c', '#7cc3ea', '#86cf6e', '#f2eee4', '#f08a3c'],
    PICKET_HEX: ['#e3c48e', '#f4f1e8', '#a8dc90', '#a8d0ee'],
    PICKET: 0.5,
  },
  YARD: {
    SHARE: 0.85,               // у такой доли подъездов — что-то во дворе (перед дверью)
    SECOND: 0.6,               // и у такой доли из них — ещё одно между домами
    W: { bed: 0.38, hedge: 0.37, grove: 0.25 },
    FRONT: [15, 36],           // вглубь от двери, м
    SIDE: 24,                  // вдоль дома, м
    BETWEEN: [26, 46],         // между домами: вдоль стены дальше, м
    HOUSE: 4,                  // от стены дома (плюс радиус), м
    ROAD: 3,                   // от края проезда, м
    STREET: 5,                 // от внешнего края тротуара улицы, м
    DOOR: 9,                   // от двери подъезда, м
    SOLID: 3,                  // от дерева, будки, гаража, м
    SMASHR: 2,                 // от лавочки, заборчика, урны, м
    GAP: 6,                    // между вещами лабиринта (край — край), м: машина проедет
    PAVE: 1.5,                 // от дорожки, тротуара, аллеи, м
  },
  MOB: 0.55,                   // на телефоне — столько середин дворов и вторых вещей, лесочки — до GROVE.R_MOB м
  FILL: { STEP: 26, SHARE: 0.7, W: { grove: 0.32, bed: 0.3, hedge: 0.38 } },
  BED: { R: [2.6, 4.5], TIRES: 0.25, STRIPE: 0.3, FLOWERS: [9, 16] },
  HEDGE: { LEN: [6, 14], SOLID: 0.55, STEP_S: 1.5, STEP_B: 1.15, CLUMP: 0.35 },
  GROVE: { R: [5.5, 9.5], R_MOB: 7.5, STEP: 2.6, MIX: { spruce: 34, pine: 30, birch: 22, rowan: 8, poplar: 6 } },
};
export const ST = { ms: 0, fen: { solidM: 0, smashM: 0, solidRuns: 0, peds: 0, carGaps: 0, smashSec: 0, pickets: 0, sty: [0, 0, 0], sides: 0, tried: 0 },
  fill: 0, beds: 0, tires: 0, hedges: 0, hedgeSolid: 0, bushes: 0, shrubs: 0, groves: 0, groveTrees: 0, tried: 0, rej: {} };

let A = null, THREE = null, OFF = new Set(), MOBK = 1;
const FEN = [];                       // твёрдые куски заборов: { ax, az, bx, bz, th }
const OBJ = [];                       // клумбы, лесочки, изгороди: { x, z, r, kind, solid, seg? }
const G = new Map(), GC = 16;         // всё лабиринта по клеткам: blocks, segHits, запас между вещами
const gk = (i, j) => (i + 8192) * 16384 + j + 8192;
function gput (x0, z0, x1, z1, v) {
  for (let i = Math.floor(x0 / GC); i <= Math.floor(x1 / GC); i++)
    for (let j = Math.floor(z0 / GC); j <= Math.floor(z1 / GC); j++) {
      const k = gk(i, j);
      let a = G.get(k);
      if (!a) G.set(k, a = []);
      a.push(v);
    }
}
const segD = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
  const qx = ax + dx * t - x, qz = az + dz * t - z;
  return Math.sqrt(qx * qx + qz * qz);
};
/* зерно по месту: один и тот же двор — всегда одинаковый */
function hsh (x, z, k) {
  let h = Math.imul(Math.round(x * 4) ^ 0x2f6b1d3, 0x9E3779B1) ^ Math.imul(Math.round(z * 4) + k * 1013904223, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function rng (x, z, k) {
  let a = (hsh(x, z, k) * 4294967296) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let q = a; q = Math.imul(q ^ (q >>> 15), q | 1); q ^= q + Math.imul(q ^ (q >>> 7), q | 61); return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
}
const rej = k => { ST.rej[k] = (ST.rej[k] || 0) + 1; return false; };

/* ── что занято: blocks и segHits ── */
function objDist (o, x, z) {
  if (o.seg) return segD(x, z, o.ax, o.az, o.bx, o.bz) - o.th;
  if (o.pts) { let d = Infinity; for (const p of o.pts) { const dx = p[0] - x, dz = p[1] - z; d = Math.min(d, Math.sqrt(dx * dx + dz * dz) - 0.7); } return d; }
  const dx = o.x - x, dz = o.z - z;
  return Math.sqrt(dx * dx + dz * dz) - o.r;
}
export function blocks (x, z, r = 0) {
  const a = G.get(gk(Math.floor(x / GC), Math.floor(z / GC)));
  if (a) for (let i = 0; i < a.length; i++) if (objDist(a[i], x, z) < r) return true;
  // край клетки: вещь из соседней (радиус до ~10 м) — проверяем и соседей, если r или вещь большая
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    if (!di && !dj) continue;
    const b = G.get(gk(Math.floor(x / GC) + di, Math.floor(z / GC) + dj));
    if (b) for (let i = 0; i < b.length; i++) if (objDist(b[i], x, z) < r) return true;
  }
  return false;
}
/* отрезок a—b задевает твёрдое лабиринта (забор, клумбу, лесок)? концы (1,5 м) не считаем; m — запас у забора, м */
const SEEN = new Set();
export function segHits (ax, az, bx, bz, m = 0.6) {
  if (!G.size) return false;
  const L = Math.hypot(bx - ax, bz - az);
  if (L < 3) return false;
  const ux = (bx - ax) / L, uz = (bz - az) / L, x0 = ax + ux * 1.5, z0 = az + uz * 1.5, x1 = bx - ux * 1.5, z1 = bz - uz * 1.5;
  SEEN.clear();
  const n = Math.ceil((L - 3) / (GC / 2));
  for (let s = 0; s <= n; s++) {
    const px = x0 + (x1 - x0) * s / n, pz = z0 + (z1 - z0) * s / n;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const a = G.get(gk(Math.floor(px / GC) + di, Math.floor(pz / GC) + dj));
      if (!a) continue;
      for (const o of a) {
        if (!o.solid || SEEN.has(o)) continue;
        SEEN.add(o);
        if (o.seg) { if (segSeg(x0, z0, x1, z1, o.ax, o.az, o.bx, o.bz) < o.th + m) return true; }
        else if (o.pts || o.tr) { for (const p of o.pts || o.tr) if (segD(p[0], p[1], x0, z0, x1, z1) < 0.6 + m) return true; }
        else if (segD(o.x, o.z, x0, z0, x1, z1) < o.r) return true;
      }
    }
  }
  return false;
}
function segSeg (ax, az, bx, bz, cx, cz, dx, dz) {
  const d1x = bx - ax, d1z = bz - az, d2x = dx - cx, d2z = dz - cz, den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) > 1e-9) {
    const t = ((cx - ax) * d2z - (cz - az) * d2x) / den, u = ((cx - ax) * d1z - (cz - az) * d1x) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(segD(ax, az, cx, cz, dx, dz), segD(bx, bz, cx, cz, dx, dz), segD(cx, cz, ax, az, bx, bz), segD(dx, dz, ax, az, bx, bz));
}

/* ── сетки на время сборки ── */
let SG = null, SMG = null, ENTG = null, ALLG = null, LOTG = null, PTG = null, RAILG = null;
const RES = [];                       // подъезды многоэтажек (как yards.js: жилой дом от 3 этажей, не особняк и не частный)
function resDoor (e) {
  const ix = e[0] - e[2] * 0.6, iz = e[1] - e[3] * 0.6;
  for (const b of A.HOUSE_GRID.get(Math.floor(ix / 40) + ',' + Math.floor(iz / 40)) || []) {
    if (!A.inPoly(ix, iz, b.p)) continue;
    if ((b.k && b.k !== 'res') || b.st === 'villa' || b.st === 'priv') return false;
    return (b.lvY !== undefined ? b.lvY : b.lv || 1) >= 3;
  }
  return false;
}
const railNear = (x, z, r) => near(RAILG, 20, x, z, 0, q => segD(x, z, q[0], q[1], q[2], q[3]) < r);
const SGC = 30;
function idx (Gr, C, x0, z0, x1, z1, v) {
  for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++)
    for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) {
      const k = gk(i, j);
      let a = Gr.get(k);
      if (!a) Gr.set(k, a = []);
      a.push(v);
    }
}
function near (Gr, C, x, z, r, fn) {
  for (let i = Math.floor((x - r) / C); i <= Math.floor((x + r) / C); i++)
    for (let j = Math.floor((z - r) / C); j <= Math.floor((z + r) / C); j++) {
      const a = Gr.get(gk(i, j));
      if (a) for (let k = 0; k < a.length; k++) if (fn(a[k])) return true;
    }
  return false;
}
/* твёрдое (SOLIDS: деревья, будки, гаражи, стены участков) ближе r */
function solidNear (x, z, r) {
  return near(SG, SGC, x, z, r + 12, s => {
    if (s.deckY !== undefined) return false;
    const dx = x - s.cx, dz = z - s.cz, lx = dx * s.cs + dz * s.sn, lz = -dx * s.sn + dz * s.cs;
    return Math.abs(lx) < s.hw + r && Math.abs(lz) < s.hd + r;
  });
}
const smashNear = (x, z, r, fenceOnly) => near(SMG, 20, x, z, r + 2, it => !it.down && (!fenceOnly || it.kind === 'fence' || it.kind === 'bigfence') && Math.hypot(it.x - x, it.z - z) < r + Math.min(it.r || 1, 1.6));
const entIn = (Gr, x, z, r) => near(Gr, 20, x, z, r, e => Math.abs(e[0] - x) < r && Math.abs(e[1] - z) < r && Math.hypot(e[0] - x, e[1] - z) < r);
const entNear = (x, z, r) => entIn(ALLG, x, z, r);      // любая дверь
const resNear = (x, z, r) => entIn(ENTG, x, z, r);      // дверь многоэтажки
/* «у двора»: клетка 20 м, середина которой ближе FEN.ENT_NEAR м к подъезду многоэтажки (заборы и середины дворов спрашивают сотни тысяч раз) */
let RESC = null;
const RC = 20;
const resZone = (x, z) => RESC.has(gk(Math.floor(x / RC), Math.floor(z / RC)));
const inBox = (b, x, z, m) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m;
function inArea (x, z, m) {
  return near(LOTG, 40, x, z, 0, b => inBox(b, x, z, m) && (A.inPoly(x, z, b.p) || (m > 0 && (A.inPoly(x + m, z, b.p) || A.inPoly(x - m, z, b.p) || A.inPoly(x, z + m, b.p) || A.inPoly(x, z - m, b.p)))));
}
const ownNear = (x, z, r) => near(G, GC, x, z, r + 12, o => objDist(o, x, z) < r);

/* общие запреты: пиццерии, точки конкурентов, стройки, старт */
function taken (x, z, m) {
  if (A.pzBlocks(x, z, m + 1) || A.rivBlocks(x, z, m + 2) || A.startClear(x, z)) return true;
  for (const P of A.pizzerias()) if (P && Math.hypot(P.x - x, P.z - z) < MAZE.FEN.PIZZA) return true;
  if (near(CLG, 40, x, z, 0, c => Math.hypot(c.x - x, c.z - z) < c.r + m + 2)) return true;
  for (const p of FUEL) if (inBox(p, x, z, MAZE.FEN.FUEL + m)) return true;
  return false;
}
let CLG = null, FUEL = [];

/* ── геометрия ── */
let LIT = null;
/* шаблоны: икосаэдр куста, цилиндры клумбы и покрышки — строим раз, дальше копия вершин в масштабе
   (новый IcosahedronGeometry / CylinderGeometry на каждую вещь — половина времени сборки) */
let TPL = null;
function tpl () {
  const plain = g => { const o = new THREE.BufferGeometry(); o.setAttribute('position', g.attributes.position.clone()); if (g.attributes.normal) o.setAttribute('normal', g.attributes.normal.clone()); if (g.index) o.setIndex(g.index.clone()); g.dispose(); return o; };
  return {
    ico: plain(new THREE.IcosahedronGeometry(1, 0)),
    soil: plain(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true)),
    cone: plain(new THREE.CylinderGeometry(0.36, 1, 1, 12, 1, true)),
    cap: plain(new THREE.CircleGeometry(1, 8).rotateX(-Math.PI / 2)),
    tire: plain(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 6)),
  };
}
function scaled (t, sx, sy, sz) {
  const o = new THREE.BufferGeometry(), p = t.attributes.position.array.slice();
  for (let i = 0; i < p.length; i += 3) { p[i] *= sx; p[i + 1] *= sy; p[i + 2] *= sz; }
  o.setAttribute('position', new THREE.BufferAttribute(p, 3));
  if (t.attributes.normal) o.setAttribute('normal', new THREE.BufferAttribute(t.attributes.normal.array.slice(), 3));
  if (t.index) o.setIndex(new THREE.BufferAttribute(t.index.array.slice(), 1));
  return o;
}
const TMP = { m: null, r: null };
/* коробка от (ax, ya, az) до (bx, yb, bz) толщиной w × h — наклонная по рельефу; середина — в нуле (put сдвигает) */
function railGeo (ax, ay, az, bx, by, bz, w, h) {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 0.01;
  const g = new THREE.BoxGeometry(L, h, w);
  TMP.m.makeRotationZ(Math.atan2(by - ay, L)); g.applyMatrix4(TMP.m);
  TMP.m.makeRotationY(Math.atan2(-dz, dx)); g.applyMatrix4(TMP.m);
  return g;
}

/* ═════════════ 1. заборы вдоль тротуаров ═════════════ */
function* fences () {
  const F = MAZE.FEN, C = A.CITY;
  let n = 0;
  for (const r of C.roads) {
    if (r.c < 1 || r.c > F.CLS || r.b || r.x || r.p.length < 2) continue;
    const half = A.walkHalf({ w: A.roadWidth(r), c: r.c, g: r.g || 0 }) + F.OFF;
    for (const sd of [-1, 1]) {
      ST.fen.sides++;
      // состояние стороны: тип куска, сколько до нового жребия, кусок твёрдого, проход людям
      let type = 0, left = 0, piece = 0, pieceAt = 0, ped = 0, pedAt = 0, gap = 0, gapSmash = false, sty = 0, hex = '', sk = null;
      let run = null;                              // текущий твёрдый кусок: { ax, az, ay, ux, uz, len }
      const flush = (trim = 0) => {
        if (run && run.len - trim > 1.2) solidRun(run, run.len - trim, sty, hex);
        run = null;
      };
      for (let i = 1; i < r.p.length; i++) {
        const [x1, z1] = r.p[i - 1], [x2, z2] = r.p[i];
        const L = Math.hypot(x2 - x1, z2 - z1);
        flush();
        if (L < F.SEC + 0.6) continue;
        const ux = (x2 - x1) / L, uz = (z2 - z1) / L, nx = -uz * sd, nz = ux * sd;
        const m = Math.floor((L - 0.6) / F.SEC), d0 = (L - m * F.SEC) / 2;
        for (let k = 0; k < m; k++) {
          const d = d0 + k * F.SEC, cx = x1 + ux * (d + F.SEC / 2) + nx * half, cz = z1 + uz * (d + F.SEC / 2) + nz * half;
          if (left <= 0) {                         // новый кусок стороны: жребий по месту
            flush();
            const h = hsh(cx, cz, 7), rr = rng(cx, cz, 8);
            type = h < F.SOLID ? 1 : h < F.SOLID + F.SMASH ? 2 : 0;
            left = F.RUN[0] + rr() * (F.RUN[1] - F.RUN[0]);
            // твёрдое: вид и цвет; сбиваемое (и секции в проездах твёрдого): трубы или штакетник, светлое
            const w = rr();
            sty = w < F.STY[0] ? 0 : w < F.STY[0] + F.STY[1] ? 1 : 2;
            const pal = sty === 2 ? F.BRICK : sty === 1 ? F.PIPE : F.CONCRETE;
            hex = pal[Math.floor(rr() * pal.length)];
            const pk = rr() < F.PICKET, sp = pk ? F.PICKET_HEX : F.SMASH_HEX;
            sk = { pk, hex: sp[Math.floor(rr() * sp.length)] };
            piece = 0; pieceAt = F.PIECE[0] + rr() * (F.PIECE[1] - F.PIECE[0]);
            ped = 0; pedAt = F.PED[0] + rr() * (F.PED[1] - F.PED[0]);
          }
          left -= F.SEC;
          if (!type) continue;
          if (++n % 150 === 0) yield 'заборы';
          ST.fen.tried++;
          if (!fenceOk(cx, cz, ux, uz)) { flush(); piece = 0; ped = 0; continue; }
          // проезд между твёрдыми кусками: пусто или сбиваемые секции
          if (type === 1 && gap > 0) {
            gap--;
            if (gapSmash) smashSec(cx, cz, ux, uz, sk);
            continue;
          }
          if (type === 2) { smashSec(cx, cz, ux, uz, sk); continue; }
          // твёрдое
          const ax = cx - ux * F.SEC / 2, az = cz - uz * F.SEC / 2;
          if (!run) run = { ax, az, ux, uz, len: 0, rx: -nx, rz: -nz };
          run.len += F.SEC; piece += F.SEC; ped += F.SEC;
          if (piece >= pieceAt) {                  // кусок кончился — проезд для машин
            flush(); piece = 0; ped = 0; gap = F.CAR_GAP; gapSmash = hsh(cx, cz, 9) < 0.5; ST.fen.carGaps++;
            pieceAt = F.PIECE[0] + hsh(cx, cz, 10) * (F.PIECE[1] - F.PIECE[0]);
          } else if (ped >= pedAt) {               // проход для людей: последний метр секции — пусто
            flush(F.PED_W); ped = 0; ST.fen.peds++;
            pedAt = F.PED[0] + hsh(cx, cz, 11) * (F.PED[1] - F.PED[0]);
          }
        }
        flush();
      }
    }
  }
}
/* можно ли здесь секцию забора (середина cx, cz, вдоль ux, uz) */
function fenceOk (cx, cz, ux, uz) {
  const F = MAZE.FEN, h = F.SEC / 2;
  if (!A.inBounds(cx, cz, -30)) return rej('край');
  if (!resZone(cx, cz)) return rej('не у двора');
  if (railNear(cx, cz, 4)) return rej('рельсы');
  if (A.groundH(cx, cz) < 0.3 || wet(cx, cz, 1)) return rej('вода');
  if (A.inHouse(cx, cz, F.FRONT)) return rej('фасад');
  for (const t of [-h, 0, h]) if (A.onPave(cx + ux * t, cz + uz * t, 0.35)) return rej('мощёное');
  if (entNear(cx, cz, F.ENT)) return rej('подъезд');
  if (near(PTG, 20, cx, cz, F.PARK, q => Math.hypot(q[0] - cx, q[1] - cz) < q[2])) return rej('остановка, стоянка');
  if (inArea(cx, cz, 1)) return rej('площадка');
  if (A.ycBlocks(cx, cz, 2) || A.yardBlocks(cx, cz, 1)) return rej('карман');
  if (solidNear(cx, cz, 0.7) || smashNear(cx, cz, 0.6) || smashNear(cx, cz, 1.4, true)) return rej('занято');
  if (taken(cx, cz, 2)) return rej('пиццерия');
  return true;
}
/* стенка от t0 до t1 по рельефу (концы — на земле): от земли −0,25 до top, толщина w; середина — сдвиг put */
function wall (run, t0, t1, top, w, hex) {
  const { ax, az, ux, uz } = run, x0 = ax + ux * t0, z0 = az + uz * t0, x1 = ax + ux * t1, z1 = az + uz * t1;
  const y0 = A.groundH(x0, z0), y1 = A.groundH(x1, z1), h = top + 0.25;
  A.put(LIT, railGeo(x0, y0, z0, x1, y1, z1, w, h), hex, (x0 + x1) / 2, (y0 + y1) / 2 + top - h / 2, (z0 + z1) / 2);
}
/* столб s × s высотой top над землёй (и 0,2 м в землю) в точке t; ry — вдоль забора */
function pillar (run, t, s, top, hex, ry) {
  const x = run.ax + run.ux * t, z = run.az + run.uz * t, gy = A.groundH(x, z);
  A.box(LIT, s, top + 0.2, s, hex, x, gy + top / 2 - 0.1, z, ry);
  return gy;
}
/* твёрдое: тяжёлое и серое, три вида (MAZE.FEN.STY); по краям куска — тумбы с красно-белой шапкой (проход людям,
   проезд машинам — видно, где кончается стена) */
function solidRun (run, len, sty, hex) {
  const F = MAZE.FEN, { ax, az, ux, uz } = run, bx = ax + ux * len, bz = az + uz * len;
  const ay = A.groundH(ax, az), by = A.groundH(bx, bz), cx = (ax + bx) / 2, cz = (az + bz) / 2;
  const n = Math.max(1, Math.round(len / F.SEC)), sl = len / n, ry = Math.atan2(-uz, ux);
  const cap = (gy, t, s, top) => {                 // красно-белая шапка тумбы: видно издали и ночью в фарах
    const x = ax + ux * t, z = az + uz * t;
    A.box(LIT, s + 0.02, 0.14, s + 0.02, '#c8352e', x, gy + top - 0.21, z, ry);
    A.box(LIT, s + 0.03, 0.14, s + 0.03, '#f1ede4', x, gy + top - 0.07, z, ry);
  };
  if (sty === 0) {
    // бетонный парапет 0,7 м, 0,32 толщиной, с плитой-крышкой; секции через одну чуть другого серого — стыки
    const alt = hex === F.CONCRETE[1] ? F.CONCRETE[0] : F.CONCRETE[1];
    for (let k = 0; k < n; k++) {
      wall(run, k * sl, (k + 1) * sl, 0.62, 0.32, k % 2 ? alt : hex);
      wall(run, k * sl + 0.02, (k + 1) * sl - 0.02, 0.7, 0.4, '#c9c5bb');     // крышка: выше на 8 см, шире
    }
    for (const t of [0, len]) cap(pillar(run, t, 0.46, 1.05, hex, ry), t, 0.46, 1.05);
  } else if (sty === 1) {
    // бетонные столбы 0,34 через 2,5 м, бетонный поребрик внизу, толстая труба (0,2) поверху
    const conc = F.CONCRETE[0];
    for (let k = 0; k < n; k++) wall(run, k * sl, (k + 1) * sl, 0.3, 0.3, '#a9a59a');
    for (let k = 1; k < n; k++) pillar(run, k * sl, 0.34, 1.0, conc, ry);
    for (const t of [0, len]) cap(pillar(run, t, 0.44, 1.15, conc, ry), t, 0.44, 1.15);
    A.put(LIT, railGeo(ax, ay + 0.8, az, bx, by + 0.8, bz, 0.2, 0.2), hex, cx, (ay + by) / 2 + 0.8, cz);
  } else {
    // кирпичные столбы с бетонной шапкой через 5 м, высокий кирпичный цоколь 0,55, кованая решётка: верхний брус и прутья
    // (цоколь и столбы — чтобы не путать с высокими чёрными сбиваемыми заборами частных домов)
    const top = 1.06, base = 0.55;
    for (let k = 0; k < n; k++) {
      wall(run, k * sl, (k + 1) * sl, base, 0.36, hex);
      for (let b = 1; b <= 3; b++) {
        const t = (k + b / 4) * sl, x = ax + ux * t, z = az + uz * t, gy = A.groundH(x, z);
        A.box(LIT, 0.045, top - base + 0.02, 0.045, '#1d1f22', x, gy + (top + base) / 2, z, ry);
      }
    }
    A.put(LIT, railGeo(ax, ay + top, az, bx, by + top, bz, 0.07, 0.07), '#1d1f22', cx, (ay + by) / 2 + top, cz);
    for (let k = 0; k <= n; k++) {
      if (k % 2 && k !== n) continue;
      const gy = pillar(run, k * sl, 0.5, 1.22, hex, ry), x = ax + ux * k * sl, z = az + uz * k * sl;
      A.box(LIT, 0.6, 0.09, 0.6, '#cbc6ba', x, gy + 1.26, z, ry);
    }
  }
  const s = A.obb(cx, cz, len / 2, F.TH, Math.atan2(uz, ux));
  s.rail = 1; s.maze = 1;                          // удар — как о забор (impact.js), лабиринт — для отладки
  const o = { seg: 1, ax, az, bx, bz, th: F.TH, solid: 1, kind: 'fence', sty, rx: run.rx, rz: run.rz };   // rx, rz — к дороге (отладка)
  FEN.push(o);
  gput(Math.min(ax, bx) - 1, Math.min(az, bz) - 1, Math.max(ax, bx) + 1, Math.max(az, bz) + 1, o);
  ST.fen.solidM += len; ST.fen.solidRuns++; ST.fen.sty[sty]++;
}
/* сбиваемое: хлипкое и светлое — тонкие крашеные трубы (2 трубы, 2 стойки) или штакетник (2 жердины, 4 планки) */
function smashSec (cx, cz, ux, uz, sk) {
  const F = MAZE.FEN, gy = A.groundH(cx, cz), g = [], ry = Math.atan2(-uz, ux), hex = sk.hex;
  if (sk.pk) {
    A.box(g, F.SEC, 0.06, 0.03, hex, cx, gy + 0.72, cz, ry);
    A.box(g, F.SEC, 0.06, 0.03, hex, cx, gy + 0.28, cz, ry);
    for (const o of [-0.94, -0.31, 0.31, 0.94]) A.box(g, 0.1, 0.92, 0.025, hex, cx + ux * o, gy + 0.46, cz + uz * o, ry);
  } else {
    A.box(g, F.SEC, 0.045, 0.045, hex, cx, gy + F.H - 0.05, cz, ry);
    A.box(g, F.SEC, 0.045, 0.045, hex, cx, gy + 0.4, cz, ry);
    for (const o of [-1.2, 1.2]) A.box(g, 0.05, F.H, 0.05, hex, cx + ux * o, gy + F.H / 2, cz + uz * o);
  }
  A.smashAdd('fence', cx, cz, 1.3, g, hex);
  const o = { seg: 1, ax: cx - ux * 1.25, az: cz - uz * 1.25, bx: cx + ux * 1.25, bz: cz + uz * 1.25, th: 0.1, solid: 0, kind: 'sfence' };
  gput(cx - 2, cz - 2, cx + 2, cz + 2, o);
  ST.fen.smashM += F.SEC; ST.fen.smashSec++; if (sk.pk) ST.fen.pickets++;
}

/* ═════════════ 2. дворы: клумбы, кусты, лесочки ═════════════ */
/* свободно ли место радиусом R для вещи лабиринта */
function yardFree (x, z, R, solidM) {
  const Y = MAZE.YARD;
  ST.tried++;
  if (!A.inBounds(x, z, -30)) return rej('y:край');
  if (A.groundH(x, z) < 0.3 || wet(x, z, R + 1)) return rej('y:вода');
  if (A.inHouse(x, z, R + Y.HOUSE)) return rej('y:дом');
  const nr = A.nearestRoad(x, z, 7, 2);
  if (nr && nr.d < nr.seg.w / 2 + R + Y.ROAD) return rej('y:проезд');
  const ns = A.nearestRoad(x, z, 5, 2);
  if (ns && ns.d < A.walkHalf(ns.seg) + R + Y.STREET) return rej('y:улица');
  if (A.onPave(x, z, R + Y.PAVE)) return rej('y:дорожка');
  if (railNear(x, z, R + 5)) return rej('y:рельсы');
  if (entNear(x, z, R + Y.DOOR)) return rej('y:подъезд');
  if (ownNear(x, z, R + Y.GAP)) return rej('y:тесно');
  if (solidNear(x, z, R + (solidM || Y.SOLID))) return rej('y:твёрдое');
  if (smashNear(x, z, R + Y.SMASHR)) return rej('y:мелочь');
  if (A.ycBlocks(x, z, R + 3) || A.yardBlocks(x, z, R + 2.5)) return rej('y:карман');
  if (inArea(x, z, R + 2)) return rej('y:площадка');
  if (A.onAlley(x, z, R + 1)) return rej('y:аллея');
  for (const p of A.PITCHES) if (Math.hypot(p.cx - x, p.cz - z) < Math.max(p.L || 0, p.W || 0) / 2 + R + 4) return rej('y:поле');
  if (taken(x, z, R + 2)) return rej('y:занято');
  return true;
}

function* yards () {
  const Y = MAZE.YARD;
  let ne = 0;
  const place = (kind, x, z, r, tx, tz) => kind === 'bed' ? bed(x, z, r) : kind === 'hedge' ? hedge(x, z, r, tx, tz) : grove(x, z, r);
  const pickKind = w => (w < Y.W.bed ? 'bed' : w < Y.W.bed + Y.W.hedge ? 'hedge' : 'grove');
  for (const e of RES) {
    if (++ne % 5 === 0) yield 'дворы';
    const [ex, ez, nx, nz] = e, tx = -nz, tz = nx;
    if (hsh(ex, ez, 21) >= Y.SHARE) continue;
    const r = rng(ex, ez, 22);
    // перед дверью, вглубь двора
    const k1 = pickKind(r());
    for (let t = 0; t < 7; t++) {
      const d = Y.FRONT[0] + r() * (Y.FRONT[1] - Y.FRONT[0]), s = (r() * 2 - 1) * Y.SIDE;
      if (place(k1, ex + nx * d + tx * s, ez + nz * d + tz * s, r, tx, tz)) break;
    }
    // между домами: вдоль стены дальше (лесочек или кусты чаще)
    if (r() >= Y.SECOND * MOBK) continue;
    const k2 = r() < 0.55 ? 'grove' : r() < 0.6 ? 'hedge' : 'bed';
    for (let t = 0; t < 6; t++) {
      const s = (r() < 0.5 ? -1 : 1) * (Y.BETWEEN[0] + r() * (Y.BETWEEN[1] - Y.BETWEEN[0])), d = 2 + r() * 18;
      if (place(k2, ex + nx * d + tx * s, ez + nz * d + tz * s, r, tx, tz)) break;
    }
  }
}

/* большая клумба: бордюр-круг (или покрышки), земля горкой, цветы */
const FLOWER = ['#d9342c', '#f2c12e', '#9a5fc0', '#ef7d2a', '#f4f1ea', '#e0568f'];
function bed (x, z, r) {
  if (OFF.has('bed')) return false;
  const B = MAZE.BED, R = B.R[0] + r() * (B.R[1] - B.R[0]);
  if (!yardFree(x, z, R)) return false;
  const gy = A.groundH(x, z), tires = r() < B.TIRES, stripe = !tires && r() < B.STRIPE;
  // бордюр: кольцо коробок по хорде (или покрышки стоймя, крашеные через одну)
  const n = Math.max(10, Math.round(2 * Math.PI * R / (tires ? 0.75 : 1.25)));
  const tireHex = ['#f4f1ea', '#d9342c', '#f2c12e', '#4f6fa8', '#3f7a4a'][Math.floor(r() * 5)];
  for (let k = 0; k < n; k++) {
    const a = k / n * Math.PI * 2, px = x + Math.cos(a) * R, pz = z + Math.sin(a) * R, ry = -a + Math.PI / 2;
    if (tires) {
      const g = scaled(TPL.tire, 1, 1, 1);
      A.put(LIT, g, k % 2 ? tireHex : '#f4f1ea', px, gy + 0.22, pz, Math.PI / 2, ry + Math.PI / 2, 0);
    } else {
      const hex = stripe ? (k % 2 ? '#d9342c' : '#f4f1ea') : (k % 5 ? '#ece8df' : '#dcd7cc');
      A.box(LIT, 2 * Math.PI * R / n + 0.1, 0.72, 0.4, hex, px, gy + 0.17, pz, ry);    // толстый (0,4 м): верх — 0,53 м над землёй
    }
  }
  // земля горкой
  const Ri = R - 0.1;
  A.put(LIT, scaled(TPL.soil, Ri, 0.6, Ri), '#5b4532', x, gy + 0.1, z);         // без донышка: его не видно
  A.put(LIT, scaled(TPL.cone, Ri, 0.36, Ri), '#634b35', x, gy + 0.58, z);       // горка — конусом до края
  A.put(LIT, scaled(TPL.cap, Ri * 0.36, 1, Ri * 0.36), '#634b35', x, gy + 0.76, z);
  // цветы: кустики-кубики, ряды по кругу
  const nf = B.FLOWERS[0] + Math.floor(r() * (B.FLOWERS[1] - B.FLOWERS[0]));
  const main = FLOWER[Math.floor(r() * FLOWER.length)], alt = FLOWER[Math.floor(r() * FLOWER.length)];
  for (let k = 0; k < nf; k++) {
    const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * (R - 0.45), px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
    const top = gy + 0.4 + 0.36 * Math.max(0, 1 - rr / Ri) * 0.9;            // по склону горки
    A.box(LIT, 0.36, 0.3, 0.36, k % 3 === 2 ? '#4f8f3f' : rr < R * 0.5 ? alt : main, px, top + 0.08, pz, a);
  }
  if (tires) ST.tires++;
  // твёрдое: 4 вытянутые коробки — почти круг (не дальше 1,08 R от середины)
  for (let k = 0; k < 4; k++) { const s = A.obb(x, z, R + 0.16, (R + 0.16) * 0.4142, k * Math.PI / 4); s.mat = 'wall'; s.maze = 1; }
  const o = { x, z, r: R + 0.2, solid: 1, kind: 'bed' };
  OBJ.push(o);
  gput(x - R - 1, z - R - 1, x + R + 1, z + R + 1, o);
  ST.beds++;
  return true;
}

/* кусты: живая изгородь (сирень, шиповник — твёрдые) или сбиваемые кусты рядом / кучкой */
function hedge (x, z, r, tx, tz) {
  if (OFF.has('hedge')) return false;
  const H = MAZE.HEDGE, len = H.LEN[0] + r() * (H.LEN[1] - H.LEN[0]);
  const along = r() < 0.6, ux = along ? tx : -tz, uz = along ? tz : tx;
  const clump = r() < H.CLUMP, solid = !clump && r() < H.SOLID;
  if (!yardFree(x, z, clump ? 2.6 : len / 2, 2.5)) return false;
  const pts = [];
  if (clump) {
    const n = 4 + Math.floor(r() * 4);
    for (let k = 0; k < n * 3 && pts.length < n; k++) {
      const a = r() * 6.283, d = k ? 0.9 + r() * 1.6 : 0, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (pts.some(p => Math.hypot(p[0] - px, p[1] - pz) < 1.05)) continue;
      pts.push([px, pz]);
    }
  } else {
    const step = solid ? H.STEP_S : H.STEP_B, n = Math.max(3, Math.round(len / step));
    for (let k = 0; k < n; k++) { const t = (k - (n - 1) / 2) * step; pts.push([x + ux * t + (r() - 0.5) * 0.25, z + uz * t + (r() - 0.5) * 0.25]); }
  }
  const kind = r() < 0.6 ? 'lilac' : 'rosehip', planted = [];
  for (const [px, pz] of pts) {
    if (solid) { if (A.tree(px, pz, 0, kind)) { planted.push([px, pz]); ST.shrubs++; } }
    else {
      const gy = A.groundH(px, pz), g = [], hex = ['#79c055', '#8acd62', '#6cb34c'][Math.floor(r() * 3)];   // светлее изгороди: сбиваемое — лёгкое
      const s1 = 0.7 + r() * 0.3;                // один комок (не два): сбиваемое держит вершины в памяти (smashAdd)
      A.put(g, scaled(TPL.ico, s1, s1 * 0.85, s1), hex, px, gy + 0.6, pz);
      A.smashAdd('bush', px, pz, 0.9, g, hex);
      planted.push([px, pz]); ST.bushes++;
    }
  }
  if (!planted.length) return false;
  const o = { pts: planted, solid: solid ? 1 : 0, kind: solid ? 'hedge' : 'bushes' };
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of planted) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  OBJ.push(o);
  gput(x0 - 1.5, z0 - 1.5, x1 + 1.5, z1 + 1.5, o);
  ST.hedges++; if (solid) ST.hedgeSolid++;
  return true;
}

/* лесочек: деревья густо (стволы твёрдые — между ними машине не пролезть) */
function grove (x, z, r) {
  if (OFF.has('grove')) return false;
  if (MOB.on && hsh(Math.round(x / 26), Math.round(z / 26), 77) > MOB.groveKeep) return false;   // телефон: лесочков меньше (память)
  const Gv = MAZE.GROVE, R = Gv.R[0] + r() * ((MOBK < 1 ? Gv.R_MOB : Gv.R[1]) - Gv.R[0]);
  if (!yardFree(x, z, R, 4)) return false;
  // порода: лесочек из двух-трёх пород, главная — по жребию
  const kinds = Object.keys(Gv.MIX), tot = kinds.reduce((s, k) => s + Gv.MIX[k], 0);
  const pickK = () => { let v = r() * tot; for (const k of kinds) { v -= Gv.MIX[k]; if (v <= 0) return k; } return kinds[0]; };
  const main = pickK(), pts = [];
  const want = Math.round(Math.PI * R * R / (Gv.STEP * Gv.STEP * 1.35));
  for (let k = 0; k < want * 4 && pts.length < want; k++) {
    const a = r() * 6.283, d = Math.sqrt(r()) * R, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (pts.some(p => Math.hypot(p[0] - px, p[1] - pz) < Gv.STEP)) continue;
    if (A.onPave(px, pz, 1.2) || entNear(px, pz, 8)) continue;
    if (!A.tree(px, pz, 0, r() < 0.7 ? main : pickK())) continue;
    pts.push([px, pz]);
  }
  if (!pts.length) return false;
  const o = { x, z, r: R + 0.6, solid: 1, kind: 'grove', trees: pts.length, tr: pts };
  OBJ.push(o);
  gput(x - R - 1, z - R - 1, x + R + 1, z + R + 1, o);
  ST.groves++; ST.groveTrees += pts.length;
  return true;
}

/* большие дворы: сетка FILL.STEP м по газонам у многоэтажек (ближе FEN.ENT_NEAR м к подъезду) — пустые середины тоже */
function* fill () {
  const Fl = MAZE.FILL;
  if (!RES.length) return;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const e of RES) { x0 = Math.min(x0, e[0]); x1 = Math.max(x1, e[0]); z0 = Math.min(z0, e[1]); z1 = Math.max(z1, e[1]); }
  let n = 0;
  for (let gx = Math.floor((x0 - MAZE.FEN.ENT_NEAR) / Fl.STEP) * Fl.STEP; gx <= x1 + MAZE.FEN.ENT_NEAR; gx += Fl.STEP) {
    for (let gz = Math.floor((z0 - MAZE.FEN.ENT_NEAR) / Fl.STEP) * Fl.STEP; gz <= z1 + MAZE.FEN.ENT_NEAR; gz += Fl.STEP) {
      if (hsh(gx, gz, 31) >= Fl.SHARE * MOBK) continue;
      if (!resZone(gx, gz)) continue;
      if (++n % 5 === 0) yield 'середины';
      const r = rng(gx, gz, 32), w = r();
      const kind = w < Fl.W.grove ? 'grove' : w < Fl.W.grove + Fl.W.bed ? 'bed' : 'hedge';
      const a = r() * 6.283;
      for (let t = 0; t < 3; t++) {
        const x = gx + (r() - 0.5) * Fl.STEP * 0.7, z = gz + (r() - 0.5) * Fl.STEP * 0.7;
        if (kind === 'bed' ? bed(x, z, r) : kind === 'hedge' ? hedge(x, z, r, Math.cos(a), Math.sin(a)) : grove(x, z, r)) { ST.fill++; break; }
      }
    }
  }
}

export function* build (api) {
  const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  if (QS && QS.has('nomaze')) return ST;
  OFF = new Set(((QS && QS.get('mazeoff')) || '').split(','));   // ?mazeoff=fence,bed,hedge,grove — без этих частей (замеры)
  const t0 = performance.now();
  A = api; THREE = api.THREE; LIT = api.LIT;
  TMP.m = new THREE.Matrix4();
  if (!TPL) TPL = tpl();
  MOBK = A.mobile && A.mobile() ? MAZE.MOB : 1;   // телефон: дворов с вещами меньше, лесочки меньше (память)
  SG = new Map(); for (const s of A.SOLIDS) idx(SG, SGC, s.cx - s.ex, s.cz - s.ez, s.cx + s.ex, s.cz + s.ez, s);
  yield 'твёрдое';
  SMG = new Map(); for (const it of A.SMASH) idx(SMG, 20, it.x, it.z, it.x, it.z, it);
  ENTG = new Map(); ALLG = new Map(); RES.length = 0;
  for (const e of A.CITY.entrances) { idx(ALLG, 20, e[0], e[1], e[0], e[1], e); if (resDoor(e)) { RES.push(e); idx(ENTG, 20, e[0], e[1], e[0], e[1], e); } }
  RESC = new Set();
  for (const e of RES) {
    const RR = MAZE.FEN.ENT_NEAR, k = Math.ceil(RR / RC) + 1, ci = Math.floor(e[0] / RC), cj = Math.floor(e[1] / RC);
    for (let i = ci - k; i <= ci + k; i++) for (let j = cj - k; j <= cj + k; j++) if (Math.hypot((i + 0.5) * RC - e[0], (j + 0.5) * RC - e[1]) < RR) RESC.add(gk(i, j));
  }
  RAILG = new Map();
  for (const r of A.CITY.rails || []) for (let i = 1; i < r.p.length; i++) {
    const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
    idx(RAILG, 20, Math.min(ax, bx) - 4, Math.min(az, bz) - 4, Math.max(ax, bx) + 4, Math.max(az, bz) + 4, [ax, az, bx, bz]);
  }
  PTG = new Map();                                 // остановки и въезды стоянок: [x, z, запас]
  for (const s of A.stops || []) idx(PTG, 20, s.x, s.z, s.x, s.z, [s.x, s.z, MAZE.FEN.STOP]);
  for (const p of A.PARKINGS || []) idx(PTG, 20, p.ex, p.ez, p.ex, p.ez, [p.ex, p.ez, MAZE.FEN.PARK]);
  LOTG = new Map();
  const box = p => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); } return { p, x0, x1, z0, z1 }; };
  const area = b => idx(LOTG, 40, b.x0 - 6, b.z0 - 6, b.x1 + 6, b.z1 + 6, b);
  for (const l of A.CITY.lots || []) if (l.p && l.p.length > 2) area(box(l.p));
  for (const g of A.CITY.green || []) if (g.p && (g.k === 'water' || g.k === 'pitch' || g.k === 'play' || g.k === 'sport' || A.isForest(g))) area(box(g.p));
  for (const p of (A.forests && A.forests()) || []) area(box(p));
  CLG = new Map(); for (const c of A.claims()) idx(CLG, 40, c.x - c.r - 12, c.z - c.r - 12, c.x + c.r + 12, c.z + c.r + 12, c);
  FUEL = (A.fuelPads || []).map(box);
  ST.ms = Math.round(performance.now() - t0);
  yield 'сетки';
  if (!OFF.has('fence')) yield* fences();
  yield* yards();
  yield* fill();
  // своё твёрдое (заборы, клумбы, стволы) — в сетку стен сразу: сугробы, горки и всё, что дальше, его обходят
  yield 'дворы';
  A.indexSolids();
  SG = SMG = ENTG = ALLG = LOTG = PTG = RAILG = RESC = null;
  ST.fen.solidM = Math.round(ST.fen.solidM); ST.fen.smashM = Math.round(ST.fen.smashM);
  ST.ms = Math.round(performance.now() - t0);
  return ST;
}

/* чужая вещь двора (yarddecor.js: палисадники, клумбы у подъездов, холмики) — в ту же сетку: мелочь, ельник, сцены жизни
   дворов и трамплины их обходят (blocks); твёрдое (solid) — и прямая навигатора (segHits) */
export function addObj (o) {
  const r = (o.r || 0) + 1;
  OBJ.push(o);
  gput(o.x - r, o.z - r, o.x + r, o.z + r, o);
}

export const DEBUG = { MAZE, ST, FEN, OBJ, blocks, segHits };
