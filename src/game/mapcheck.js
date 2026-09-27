/* ──────────────────────────────────────────────────────────────────────────
   Проверка и починка карты.

   Москва приезжает из OpenStreetMap (city-data.js), и в выгрузке хватает
   мест, которые в игре выглядят сломанными: мост начинается посреди
   набережной и лежит настилом на чужом проезде, проезд не доходит до
   улицы полтора метра, улица кончается в чистом поле, асфальт скачет на
   кочках рельефа. Здесь — чистые функции над CITY и сеткой высот:

     checkMap(city, TH)  → список проблем { kind, x, z, severity, msg, fix? }
     fixMap(city, TH)    → чинит на загрузке, до того как построена геометрия:
                           сшивает обрывы, режет переезды без узла, выравнивает
                           рельеф под дорогами, поднимает мосты над улицами,
                           и отдаёт план тупиков (чем закрыть каждый).

   Здесь нет three.js и браузера: те же проверки гоняет tools/mapcheck.mjs
   в Node (npm run mapcheck). Всё, что строит сцену, — в mapworks.js.

   Модели высот повторяют game.js: groundH — тот же разрез клеток
   диагональю, настил моста — прямая между берегами с горбом (или профиль
   r.dk, если его посчитала починка). Меняешь там — поменяй и тут.
   ────────────────────────────────────────────────────────────────────────── */

/* ── пороги ── */
export const MC = {
  SNAP_ON: 1.5,        // конец проезда ближе стольких метров к краю чужого полотна — это стык, а не тупик
  SNAP_GAP: 7,         // …а до стольких — недотянутый обрыв: дотягиваем, если смотрит на дорогу
  NODE_SNAP: 2.5,      // рядом чужой узел — встаём прямо в него
  STEP: 2,             // шаг выборки по дорогам, м (сетка рельефа — 12 м)
  SLOPE_MAX: 0.12,     // круче — «стена» (уклон по ходу)
  KINK_MAX: 0.07,      // перелом уклона на 4 м — машину подкидывает
  TILT_MAX: 0.09,      // поперечный уклон полотна
  WIDTH_JUMP: 2.2,     // скачок ширины на стыке двух улиц, м
  CLEAR_ROAD: 5.0,     // над улицей настил моста не ниже, м (сам настил с балками — 1,8)
  CLEAR_PATH: 3.2,     // над дорожкой
  BRIDGE_SLOPE: 0.10,  // съезд с моста не круче
  BRIDGE_SLOPE_HARD: 0.14,
  DEAD_STUB: 35,       // тупик короче — блоки, длиннее — ремонт дороги
  WORKS_MAX: 14,       // ремонтных бригад на весь город
};

/* ── рельеф ── */
export function decodeHeights (ter) {
  const bin = atob(ter.h), a = new Float32Array(ter.nx * ter.nz);
  for (let i = 0; i < a.length; i++) a[i] = ((bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8)) - 1000) / 10;
  return a;
}

export function groundFn (ter, TH) {
  const TG = ter.g, NX = ter.nx, NZ = ter.nz, X0 = ter.x0, Z0 = ter.z0;
  return (x, z) => {
    const u = (x - X0) / TG, v = (z - Z0) / TG;
    let i = Math.floor(u), j = Math.floor(v);
    if (i < 0) i = 0; else if (i > NX - 2) i = NX - 2;
    if (j < 0) j = 0; else if (j > NZ - 2) j = NZ - 2;
    const fu = u - i, fv = v - j, k = j * NX + i;
    if (fu + fv <= 1) return TH[k] + (TH[k + 1] - TH[k]) * fu + (TH[k + NX] - TH[k]) * fv;
    const h11 = TH[k + NX + 1];
    return h11 + (TH[k + NX] - h11) * (1 - fu) + (TH[k + 1] - h11) * (1 - fv);
  };
}

/* ── улицы: те же правила, что в game.js ── */
export const ROAD_W = [20, 16, 13.5, 11, 9, 7, 5, 5.5];
export const roadWidth = r => r.w || ROAD_W[r.c];
export const drivable = r => !r.x && r.c !== 6;
export const sidewalkW = r => roadWidth(r) + (r.c <= 5 ? 5.5 : 2);
const DRIVE_MAX = 5;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const r1 = v => Math.round(v * 10) / 10;
const pkey = p => p[0] + ',' + p[1];

function polyLen (p) {
  const acc = [0];
  for (let i = 1; i < p.length; i++) acc.push(acc[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  return acc;
}

/* Профиль настила: плоский массив [s0, y0, s1, y1, …] с шагом по длине.
   Его понимает game.js (r.dk) — туда же, где раньше была прямая с горбом. */
export function profileFn (dk) {
  const n = dk.length / 2;
  return s => {
    if (s <= dk[0]) return dk[1];
    if (s >= dk[(n - 1) * 2]) return dk[(n - 1) * 2 + 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (dk[m * 2] <= s) lo = m; else hi = m; }
    const s0 = dk[lo * 2], s1 = dk[hi * 2];
    return lerp(dk[lo * 2 + 1], dk[hi * 2 + 1], (s - s0) / (s1 - s0 || 1));
  };
}

/* настил моста так, как его кладёт game.js */
export function deckOf (r, groundH) {
  const p = r.p, acc = polyLen(p), L = acc[acc.length - 1] || 1;
  if (r.dk) return { L, acc, fn: profileFn(r.dk) };
  const h0 = groundH(p[0][0], p[0][1]), h1 = groundH(p[p.length - 1][0], p[p.length - 1][1]);
  const arch = L > 120 ? Math.min(6, L * 0.01) : 0;
  return { L, acc, fn: s => lerp(h0, h1, s / L) + arch * Math.sin(Math.PI * clamp(s / L, 0, 1)) };
}
/* над землёй настил не ниже двадцати сантиметров — кроме самых концов:
   там он сходит на нет, иначе на въезде ступенька (fade — так в game.js) */
export const deckMin = (s, L, fade) => (fade ? Math.min(0.2, 0.04 * Math.min(s, L - s)) : 0.2);

function inPoly (x, z, p) {
  let ins = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i], [xj, zj] = p[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
function segDist (x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
  return { d: Math.hypot(x - ax - dx * t, z - az - dz * t), t, x: ax + dx * t, z: az + dz * t };
}
function segCross (ax, az, bx, bz, cx, cz, dx, dz) {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, x: ax + rx * t, z: az + rz * t };
}

/* дома и парковки — одни на все пересборки контекста */
const STATIC = new WeakMap();
function staticPart (city) {
  const HG = new Map(), HC = 40;
  for (const b of city.buildings) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const q of b.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    const e = { p: b.p, x0, z0, x1, z1 };
    for (let i = Math.floor((x0 - 8) / HC); i <= Math.floor((x1 + 8) / HC); i++)
      for (let j = Math.floor((z0 - 8) / HC); j <= Math.floor((z1 + 8) / HC); j++) {
        const k = (i + 500) * 1000 + j + 500;
        if (!HG.has(k)) HG.set(k, []);
        HG.get(k).push(e);
      }
  }
  const NOH = [];
  const housesNear = (x, z) => HG.get((Math.floor(x / HC) + 500) * 1000 + Math.floor(z / HC) + 500) || NOH;
  const inHouse = (x, z) => {
    for (const b of housesNear(x, z)) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && inPoly(x, z, b.p)) return true;
    return false;
  };
  function wallDist (x, z) {
    let d = Infinity;
    for (const b of housesNear(x, z)) {
      if (inPoly(x, z, b.p)) return 0;
      const p = b.p;
      for (let i = 0; i < p.length; i++) {
        const a = p[i], c = p[(i + 1) % p.length];
        d = Math.min(d, segDist(x, z, a[0], a[1], c[0], c[1]).d);
      }
    }
    return d;
  }
  const parks = city.lots.filter(l => l.k === 'park');
  function lotDist (x, z) {
    let d = Infinity;
    for (const l of parks) {
      const p = l.p;
      if (Math.abs(p[0][0] - x) > 250 || Math.abs(p[0][1] - z) > 250) continue;
      if (inPoly(x, z, p)) return 0;
      for (let i = 0; i < p.length; i++) {
        const a = p[i], c = p[(i + 1) % p.length];
        d = Math.min(d, segDist(x, z, a[0], a[1], c[0], c[1]).d);
      }
    }
    return d;
  }

  const out = { housesNear, inHouse, wallDist, lotDist };
  STATIC.set(city, out);
  return out;
}

/* ── контекст: граф, сетки и высоты на текущих данных ──
   Строится заново после каждой починки — это миллисекунды. */
export function mapContext (city, TH, o = {}) {
  const ter = city.terrain, groundH = groundFn(ter, TH);
  const CW = city.meta.size[0], CD = city.meta.size[1];
  const B = { x0: -CW / 2 + 12, x1: CW / 2 - 12, z0: -CD / 2 + 12, z1: CD / 2 - 12 };
  const inBounds = (x, z, m = 0) => x > B.x0 + m && x < B.x1 - m && z > B.z0 + m && z < B.z1 - m;
  const roads = city.roads;

  // куски улиц по клеткам
  const SEGS = [], CELL = 32, SG = new Map();
  roads.forEach((r, ri) => {
    const w = roadWidth(r);
    for (let i = 1; i < r.p.length; i++) {
      const s = { ri, i, r, x1: r.p[i - 1][0], z1: r.p[i - 1][1], x2: r.p[i][0], z2: r.p[i][1], w, id: 0 };
      s.id = SEGS.length;
      SEGS.push(s);
      const m = w / 2 + 8;
      for (let a = Math.floor((Math.min(s.x1, s.x2) - m) / CELL); a <= Math.floor((Math.max(s.x1, s.x2) + m) / CELL); a++)
        for (let b = Math.floor((Math.min(s.z1, s.z2) - m) / CELL); b <= Math.floor((Math.max(s.z1, s.z2) + m) / CELL); b++) {
          const k = (a + 500) * 1000 + b + 500;
          let l = SG.get(k);
          if (!l) SG.set(k, l = []);
          l.push(s);
        }
    }
  });
  const NONE = [];
  const segsNear = (x, z) => SG.get((Math.floor(x / CELL) + 500) * 1000 + Math.floor(z / CELL) + 500) || NONE;

  // граф — как NODES в game.js: узел — точка карты, соседей считаем по проезжим
  const NODES = new Map();                  // "x,z" → { x, z, nb:Set, roads:[{ri,i}] }
  const node = q => {
    const k = pkey(q);
    let n = NODES.get(k);
    if (!n) NODES.set(k, n = { k, x: q[0], z: q[1], nb: new Set(), at: [], drv: 0 });
    return n;
  };
  roads.forEach((r, ri) => {
    for (let i = 0; i < r.p.length; i++) node(r.p[i]).at.push({ ri, i });
    if (!drivable(r)) return;
    for (let i = 1; i < r.p.length; i++) {
      const a = node(r.p[i - 1]), b = node(r.p[i]);
      if (a === b) continue;
      a.nb.add(b.k); b.nb.add(a.k); a.drv = b.drv = 1;
    }
  });
  const deg = q => { const n = NODES.get(pkey(q)); return n ? n.nb.size : 0; };

  // мосты
  const BR = [];
  roads.forEach((r, ri) => {
    if (!r.b) return;
    const D = deckOf(r, groundH), ws = sidewalkW(r);
    const segs = [];
    for (let i = 1; i < r.p.length; i++)
      segs.push({ x1: r.p[i - 1][0], z1: r.p[i - 1][1], x2: r.p[i][0], z2: r.p[i][1], s1: D.acc[i - 1], s2: D.acc[i] });
    BR.push({ r, ri, L: D.L, fn: D.fn, ws, w: roadWidth(r), segs, acc: D.acc });
  });
  const deckY = (b, s, x, z) => Math.max(b.fn(s), groundH(x, z) + deckMin(s, b.L, o.fade));
  /* на настиле ли точка: высота и мост, иначе null (как surfaceAt без prevY) */
  function deckAt (x, z, pad = 1) {
    for (const b of BR)
      for (const g of b.segs) {
        const dx = g.x2 - g.x1, dz = g.z2 - g.z1;
        const t = ((x - g.x1) * dx + (z - g.z1) * dz) / (dx * dx + dz * dz || 1);
        if (t < 0 || t > 1) continue;
        if (Math.hypot(x - g.x1 - dx * t, z - g.z1 - dz * t) > b.ws / 2 + pad) continue;
        const s = lerp(g.s1, g.s2, t);
        return { y: deckY(b, s, x, z), b, s };
      }
    return null;
  }

  // дома, въезды, подъезды, парковки: от улиц не зависят — строим один раз на city
  const { housesNear, inHouse, wallDist, lotDist } = STATIC.get(city) || staticPart(city);

  /* ближайшее чужое полотно: не своя улица у этого конца */
  function nearestOther (x, z, skip, pred) {
    let best = null;
    for (const s of segsNear(x, z)) {
      if (skip && skip(s)) continue;
      if (pred && !pred(s)) continue;
      const q = segDist(x, z, s.x1, s.z1, s.x2, s.z2);
      const edge = q.d - s.w / 2;
      if (!best || edge < best.edge) best = { ...q, edge, s };
    }
    return best;
  }

  return { city, TH, ter, groundH, B, inBounds, roads, SEGS, segsNear, NODES, deg, BR, deckAt, deckY,
    inHouse, wallDist, lotDist, nearestOther, housesNear, fade: !!o.fade };
}

/* ── тупики ──
   Конец проезжей улицы, у которого нет соседей. Хороший тупик — у стены
   дома, у въезда, у подъезда, на парковке, за рамкой карты (там стоят
   блоки osmEdgeBlocks). Остальные кончаются «ничем» — им нужен блок или
   ремонт. */
export function deadEnds (ctx) {
  const out = [];
  const { city, roads } = ctx;
  roads.forEach((r, ri) => {
    if (r.c === 6) return;
    for (const end of [0, 1]) {
      const i = end ? r.p.length - 1 : 0, j = end ? r.p.length - 2 : 1;
      const q = r.p[i], n = ctx.NODES.get(pkey(q));
      // и обрывки «только нарисовать» (r.x): машина по земле ездит где угодно — видно и их
      const others = n.at.filter(a => a.ri !== ri || (a.i !== i)).length;
      if (others) continue;
      const [x, z] = q, [px, pz] = r.p[j];
      const l = Math.hypot(x - px, z - pz) || 1, ux = (x - px) / l, uz = (z - pz) / l;
      out.push({ ri, r, end, x, z, ux, uz, w: roadWidth(r), c: r.c });
    }
  });
  return out;
}

/* куда упирается тупик: ok — там что-то есть; иначе — чем закрыть */
export function classifyDeadEnd (ctx, d) {
  const { x, z, ux, uz } = d, city = ctx.city;
  if (!ctx.inBounds(x, z, 10)) return { ok: true, why: 'frame' };
  if (ctx.deckAt(x, z, -1)) return { ok: false, why: 'deck' };
  if (ctx.groundH(x, z) < 0.4) return { ok: false, why: 'water' };
  for (const g of city.gates) if (Math.hypot(g[0] - x, g[1] - z) < 9) return { ok: true, why: 'gate' };
  for (const e of city.entrances) if (Math.hypot(e[0] - x, e[1] - z) < 7) return { ok: true, why: 'entrance' };
  const wd = Math.min(ctx.wallDist(x, z), ctx.wallDist(x + ux * 3, z + uz * 3));
  if (wd < 5.5) return { ok: true, why: 'wall' };
  if (ctx.lotDist(x, z) < 4) return { ok: true, why: 'parking' };
  // сколько улицы до ближайшего перекрёстка: короткий огрызок — блоки
  const r = d.r, p = r.p;
  let len = 0;
  for (let k = 1; k < p.length; k++) {
    const a = d.end ? p[p.length - k] : p[k - 1], b = d.end ? p[p.length - k - 1] : p[k];
    len += Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (ctx.deg(b) >= 3) break;
  }
  // ремонту нужно место впереди: не в дом, не в чужую улицу
  let room = true;
  for (let s = 2; s <= 12 && room; s += 2) {
    const qx = x + ux * s, qz = z + uz * s;
    if (ctx.inHouse(qx, qz) || ctx.groundH(qx, qz) < 0.4) room = false;
    const o = ctx.nearestOther(qx, qz, sg => sg.r === r);
    if (o && o.edge < 1.5) room = false;
  }
  const works = room && d.c <= 7 && len >= MC.DEAD_STUB && !r.x;
  return { ok: false, why: 'nothing', len, kind: works ? 'works' : 'blocks' };
}

/* ── проверки ── */
export function checkMap (city, TH, o = {}) {
  const ctx = o.ctx || mapContext(city, TH, o);
  const out = [];
  const add = (kind, x, z, severity, msg, fix) => out.push({ kind, x: r1(x), z: r1(z), severity, msg, ...(fix ? { fix } : {}) });
  checkBridges(ctx, add);
  checkJoints(ctx, add, o.tapers);
  checkHeights(ctx, add);
  checkDeadEnds(ctx, add, o.treated);
  checkMisc(ctx, add);
  return out;
}

function checkBridges (ctx, add) {
  const { roads, groundH, BR } = ctx;
  for (const b of BR) {
    const r = b.r, p = r.p, name = r.n || 'мост';
    // концы: связаны с сетью, не в воде, не посреди чужого полотна
    for (const q of [p[0], p[p.length - 1]]) {
      const n = ctx.NODES.get(pkey(q));
      if (ctx.deg(q) < 2) add('bridge-end', q[0], q[1], 'error', `${name}: end of deck is not connected to any street`);
      if (groundH(q[0], q[1]) < 0.3) add('bridge-end', q[0], q[1], 'error', `${name}: deck ends in water`);
      const o = ctx.nearestOther(q[0], q[1], s => s.r === r || n.at.some(a => a.ri === s.ri));
      if (o && o.edge < -0.5 && !o.s.r.b) add('bridge-end', q[0], q[1], 'error', `${name}: deck starts on the asphalt of "${o.s.r.n || 'road'}" without a junction`);
      // конец моста — на перекрёстке: перила и балки влезают в чужую улицу
      const cross = junctionCut(ctx, b, q === p[0] ? 0 : 1);
      if (cross > 0.5) add('bridge-parapet', q[0], q[1], 'warn', `${name}: parapets start inside a junction (${cross.toFixed(1)} m into the crossing street)`, 'trim');
      const step = ctx.deckY(b, q === p[0] ? 0 : b.L, q[0], q[1]) - groundH(q[0], q[1]);
      if (step > 0.08) add('bridge-step', q[0], q[1], 'warn', `${name}: ${Math.round(step * 100)} cm step from the road onto the deck`, 'fade');
    }
    // что под настилом: улицы и дорожки, и сколько над ними места
    for (const c of bridgeCrossings(ctx, b)) {
      const clear = ctx.deckY(b, c.s, c.x, c.z) - groundH(c.x, c.z);
      if (clear >= c.need) continue;
      const on = clear < 1.3;
      add(on ? 'bridge-on-road' : 'bridge-low', c.x, c.z, 'error',
        `${name}: ${on ? 'deck lies on' : 'only ' + clear.toFixed(1) + ' m above'} ${c.path ? 'a footpath' : '"' + (c.r.n || 'road') + '" (class ' + c.r.c + ')'}`, 'lift');
    }
    // крутизна съездов
    let worst = 0, ws = 0;
    for (let s = 0; s + 3 <= b.L; s += 3) {
      const g = Math.abs(b.fn(s + 3) - b.fn(s)) / 3;
      if (g > worst) { worst = g; ws = s; }
    }
    if (worst > 0.125) {
      const [x, z] = alongPoly(p, b.acc, ws);
      add('bridge-steep', x, z, worst > 0.16 ? 'error' : 'warn', `${name}: ramp ${Math.round(worst * 100)}% steep`);
    }
  }
  // два настила друг в друге на разной высоте
  for (let i = 0; i < BR.length; i++)
    for (let j = i + 1; j < BR.length; j++) {
      const A = BR[i], Bb = BR[j];
      let worst = 0, wx = 0, wz = 0;
      for (let s = 0; s <= A.L; s += 6) {
        const [x, z] = alongPoly(A.r.p, A.acc, s);
        const dy = overlapDy(ctx, A, Bb, s, x, z);
        if (dy > worst) { worst = dy; wx = x; wz = z; }
      }
      if (worst > 0.5) add('bridge-overlap', wx, wz, 'warn', `decks of "${A.r.n || 'bridge'}" and "${Bb.r.n || 'bridge'}" overlap ${worst.toFixed(1)} m apart in height`, 'pair');
    }
}

/* где настил A залезает на настил B — на сколько они расходятся по высоте */
function overlapDy (ctx, A, B, s, x, z) {
  for (const g of B.segs) {
    const dx = g.x2 - g.x1, dz = g.z2 - g.z1;
    const t = ((x - g.x1) * dx + (z - g.z1) * dz) / (dx * dx + dz * dz || 1);
    if (t < 0 || t > 1) continue;
    const d = Math.hypot(x - g.x1 - dx * t, z - g.z1 - dz * t);
    if (d > (A.ws + B.ws) / 2 - 0.3) continue;
    const sb = lerp(g.s1, g.s2, t);
    return Math.abs(ctx.deckY(A, s, x, z) - ctx.deckY(B, sb, x, z));
  }
  return 0;
}

function alongPoly (p, acc, s) {
  for (let i = 1; i < p.length; i++)
    if (s <= acc[i] || i === p.length - 1) {
      const t = clamp((s - acc[i - 1]) / (acc[i] - acc[i - 1] || 1), 0, 1);
      return [lerp(p[i - 1][0], p[i][0], t), lerp(p[i - 1][1], p[i][1], t), i, t];
    }
  return [p[0][0], p[0][1], 1, 0];
}

/* что пересекает мост под настилом: улицы (любые, кроме мостов) и дорожки */
function bridgeCrossings (ctx, b) {
  const out = [], p = b.r.p, city = ctx.city;
  const lines = [];
  ctx.roads.forEach((r, ri) => { if (!r.b) lines.push({ r, ri, p: r.p, w: sidewalkW(r), need: MC.CLEAR_ROAD }); });
  city.paths.forEach((q, qi) => lines.push({ path: true, qi, p: q, w: 2, need: MC.CLEAR_PATH }));
  let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
  for (const [x, z] of p) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (z < bz0) bz0 = z; if (z > bz1) bz1 = z; }
  for (const L of lines) {
    const q = L.p;
    for (let j = 1; j < q.length; j++) {
      const ax = q[j - 1][0], az = q[j - 1][1], bx = q[j][0], bz = q[j][1];
      if ((ax < bx0 && bx < bx0) || (ax > bx1 && bx > bx1) || (az < bz0 && bz < bz0) || (az > bz1 && bz > bz1)) continue;
      for (let i = 1; i < p.length; i++) {
        const X = segCross(p[i - 1][0], p[i - 1][1], p[i][0], p[i][1], ax, az, bx, bz);
        if (!X) continue;
        const s = b.acc[i - 1] + X.t * (b.acc[i] - b.acc[i - 1]);
        if (s < 0.5 || s > b.L - 0.5) continue;             // в узле на конце — это перекрёсток, не переезд
        // сколько настила над дорогой по длине моста: её ширина поперёк
        const ux = (p[i][0] - p[i - 1][0]), uz = (p[i][1] - p[i - 1][1]), lu = Math.hypot(ux, uz) || 1;
        const vx = bx - ax, vz = bz - az, lv = Math.hypot(vx, vz) || 1;
        const sin = Math.max(0.35, Math.abs((ux * vz - uz * vx) / lu / lv));
        out.push({ ...L, s, x: X.x, z: X.z, j, u: X.u, half: L.w / 2 / sin + 1 });
      }
    }
  }
  return out;
}

/* Конец моста на перекрёстке: насколько чужая улица заходит под настил.
   Считаем по улицам в узле, которые идут поперёк моста. */
function junctionCut (ctx, b, end) {
  const p = b.r.p, q = end ? p[p.length - 1] : p[0], nx = end ? p[p.length - 2] : p[1];
  const n = ctx.NODES.get(pkey(q));
  const ul = Math.hypot(nx[0] - q[0], nx[1] - q[1]) || 1, ux = (nx[0] - q[0]) / ul, uz = (nx[1] - q[1]) / ul;
  let cut = 0;
  for (const a of n.at) {
    const r = ctx.roads[a.ri];
    if (r === b.r || r.b) continue;
    for (const k of [a.i - 1, a.i + 1]) {
      if (k < 0 || k >= r.p.length) continue;
      const m = r.p[k], l = Math.hypot(m[0] - q[0], m[1] - q[1]) || 1;
      const cos = ((m[0] - q[0]) * ux + (m[1] - q[1]) * uz) / l;
      if (Math.abs(cos) > 0.87) continue;                  // продолжает мост — не поперёк
      const sin = Math.sqrt(1 - cos * cos);
      cut = Math.max(cut, sidewalkW(r) / 2 / Math.max(sin, 0.4) + 0.8);
    }
  }
  return Math.min(cut, b.L * 0.3, 24);
}

function checkJoints (ctx, add, tapers) {
  const { roads } = ctx;
  // обрывы: конец проезда у чужого полотна, но без общего узла
  for (const d of deadEnds(ctx)) {
    if (!drivable(d.r) || !ctx.inBounds(d.x, d.z, -5)) continue;
    const j = joinTarget(ctx, d);
    if (!j) continue;
    add(j.edge < MC.SNAP_ON ? 'joint-seam' : 'joint-gap', d.x, d.z, j.edge < MC.SNAP_ON ? 'error' : 'warn',
      j.edge < MC.SNAP_ON
        ? `end of "${d.r.n || 'road'}" touches "${j.s.r.n || 'road'}" without a shared node (seam, traffic can't turn)`
        : `"${d.r.n || 'road'}" stops ${j.edge.toFixed(1)} m short of "${j.s.r.n || 'road'}"`, 'snap');
  }
  // улицы пересекаются в одном уровне без узла
  for (const X of gradeCrossings(ctx))
    add('cross-no-node', X.x, X.z, 'warn', `"${X.a.n || 'road'}" and "${X.b.n || 'road'}" cross without a junction node (markings and curbs run across)`, 'node');
  // скачок ширины на стыке двух улиц
  for (const n of ctx.NODES.values()) {
    if (n.nb.size !== 2 || n.at.length !== 2) continue;
    const ra = roads[n.at[0].ri], rb = roads[n.at[1].ri];
    if (ra === rb || !drivable(ra) || !drivable(rb) || ra.b || rb.b) continue;
    const dw = Math.abs(roadWidth(ra) - roadWidth(rb));
    if (dw > MC.WIDTH_JUMP && ctx.inBounds(n.x, n.z, -20)) {
      const done = tapers && tapers.some(t => Math.hypot(t.x - n.x, t.z - n.z) < 0.5);
      add('width-jump', n.x, n.z, done ? 'info' : 'warn', `width jumps ${roadWidth(ra)} → ${roadWidth(rb)} m at a joint${done ? ' → tapered' : ''}`, 'taper');
    }
  }
  // конец улицы на общем узле, где game.js не кладёт пятно (узел не в графе)
  for (const n of ctx.NODES.values()) {
    if (n.at.length < 2 || n.nb.size >= 2 || !ctx.inBounds(n.x, n.z, -20)) continue;
    const vis = n.at.filter(a => { const r = roads[a.ri]; return !r.b && r.c !== 6; });
    if (vis.length >= 2) add('no-disc', n.x, n.z, 'info', 'roads meet here but the joint gets no round patch (off-network node)');
  }
  // одинаковые полотна друг на друге: осевые близко и параллельно, без общего узла
  for (const P of overlaps(ctx))
    add('overlap', P.x, P.z, 'info', `"${P.a.n || 'road'}" and "${P.b.n || 'road'}" ribbons overlap ${P.len.toFixed(0)} m (${P.same ? 'same class: z-fighting' : 'edge lines of one run on the other'})`);
}

/* куда пришить тупик: чужое проезжее полотно рядом и по ходу */
function joinTarget (ctx, d) {
  const r = d.r, { x, z, ux, uz } = d;
  const own = s => s.r === r && (s.i === (d.end ? r.p.length - 1 : 1));
  const o = ctx.nearestOther(x, z, s => own(s) || !drivable(s.r) || s.r.c === 6);
  if (!o || o.edge > MC.SNAP_GAP) return null;
  // мост посреди — только если настил тут почти на земле
  if (o.s.r.b) {
    const dk = ctx.deckAt(o.x, o.z, 0);
    if (!dk || dk.y - ctx.groundH(o.x, o.z) > 0.5) return null;
  }
  if (o.edge >= MC.SNAP_ON) {
    // недотянутый: чужая дорога должна быть впереди, а не сбоку
    const dx = o.x - x, dz = o.z - z, l = Math.hypot(dx, dz) || 1;
    if ((dx * ux + dz * uz) / l < 0.55) return null;
    for (let t = 0.2; t < 1; t += 0.2) if (ctx.inHouse(lerp(x, o.x, t), lerp(z, o.z, t))) return null;
  }
  // перемычка не должна подныривать под настил моста
  for (let t = 0; t <= 1.001; t += 0.25) if (ctx.deckAt(lerp(x, o.x, t), lerp(z, o.z, t), 1.5)) return null;
  return o;
}

/* Пересечения в одном уровне без общего узла. Мосты и «только нарисовать»
   не считаем: над улицей мост — так и задумано. */
function gradeCrossings (ctx) {
  const out = [], seen = new Set(), N = ctx.SEGS.length;
  for (const s of ctx.SEGS) {
    if (!drivable(s.r) || s.r.b) continue;
    const L = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
    for (let t = 0; t <= 1.001; t += Math.min(1, 24 / (L || 1))) {
      for (const q of ctx.segsNear(lerp(s.x1, s.x2, t), lerp(s.z1, s.z2, t))) {
        if (q.id <= s.id || q.r === s.r || !drivable(q.r) || q.r.b) continue;
        const k = s.id * N + q.id;
        if (seen.has(k)) continue;
        seen.add(k);
        const X = segCross(s.x1, s.z1, s.x2, s.z2, q.x1, q.z1, q.x2, q.z2);
        if (!X) continue;
        // на концах кусков — общий узел (или почти): это не наш случай
        const near = (ax, az) => Math.hypot(X.x - ax, X.z - az) < 0.6;
        if (near(s.x1, s.z1) || near(s.x2, s.z2) || near(q.x1, q.z1) || near(q.x2, q.z2)) continue;
        out.push({ x: X.x, z: X.z, a: s.r, b: q.r, sa: s, sb: q, ta: X.t, tb: X.u });
      }
    }
  }
  return out;
}

/* параллельные полотна, лежащие друг на друге */
function overlaps (ctx) {
  const out = [], seen = new Set();
  for (const s of ctx.SEGS) {
    if (!drivable(s.r) || s.r.b) continue;
    const L = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
    if (L < 8) continue;
    const ux = (s.x2 - s.x1) / L, uz = (s.z2 - s.z1) / L;
    for (const q of ctx.segsNear((s.x1 + s.x2) / 2, (s.z1 + s.z2) / 2)) {
      if (q.r === s.r || !drivable(q.r) || q.r.b) continue;
      const k = Math.min(s.ri, q.ri) + '/' + Math.max(s.ri, q.ri);
      if (seen.has(k)) continue;
      const lq = Math.hypot(q.x2 - q.x1, q.z2 - q.z1) || 1;
      if (Math.abs(((q.x2 - q.x1) * ux + (q.z2 - q.z1) * uz) / lq) < 0.96) continue;
      // сколько метров s лежит в полосе q
      let run = 0, bx = 0, bz = 0;
      for (let t = 2; t < L - 2; t += 2) {
        const x = s.x1 + ux * t, z = s.z1 + uz * t;
        const d = segDist(x, z, q.x1, q.z1, q.x2, q.z2);
        if (d.t > 0.02 && d.t < 0.98 && d.d < (s.w + q.w) / 2 - 0.6) { run += 2; bx = x; bz = z; }
      }
      if (run < 8) continue;
      seen.add(k);
      out.push({ x: bx, z: bz, a: s.r, b: q.r, len: run, same: s.r.c === q.r.c && s.w === q.w });
    }
  }
  return out;
}

/* ── высоты: скачки, стены, перекос полотна ──
   Дорога лежит на рельефе, рельеф — плоские треугольники по двенадцать
   метров. Сам он непрерывный, но на стыке клеток уклон меняется
   скачком, а SRTM местами шумит — полотно «подскакивает». */
export function roadProfileIssues (ctx, onIssue) {
  const { roads, groundH } = ctx, S = MC.STEP;
  roads.forEach(r => {
    if (!drivable(r) || r.b) return;
    const w = roadWidth(r), p = r.p;
    for (let i = 1; i < p.length; i++) {
      const [x1, z1] = p[i - 1], [x2, z2] = p[i];
      const L = Math.hypot(x2 - x1, z2 - z1);
      if (L < 2 * S) continue;
      const ux = (x2 - x1) / L, uz = (z2 - z1) / L;
      let prev = null;
      for (let s = S; s < L - S; s += S) {
        const x = x1 + ux * s, z = z1 + uz * s;
        if (!ctx.inBounds(x, z) || ctx.deckAt(x, z, 2)) { prev = null; continue; }
        const hb = groundH(x - ux * S, z - uz * S), h = groundH(x, z), hf = groundH(x + ux * S, z + uz * S);
        const g0 = (h - hb) / S, g1 = (hf - h) / S;
        const kink = Math.abs(g1 - g0), slope = Math.abs(hf - hb) / (2 * S);
        const tilt = Math.abs(groundH(x - uz * w / 2, z + ux * w / 2) - groundH(x + uz * w / 2, z - ux * w / 2)) / w;
        if (kink > MC.KINK_MAX) onIssue('bump', x, z, kink, r);
        else if (slope > MC.SLOPE_MAX) onIssue('steep', x, z, slope, r);
        else if (tilt > MC.TILT_MAX) onIssue('tilt', x, z, tilt, r);
        prev = h;
      }
    }
  });
}

function checkHeights (ctx, add) {
  // одна отметка на двадцать метров: подряд идущие кочки — одна проблема
  const marks = [];
  roadProfileIssues(ctx, (kind, x, z, v, r) => {
    if (marks.some(m => m.kind === kind && Math.abs(m.x - x) < 20 && Math.abs(m.z - z) < 20)) return;
    marks.push({ kind, x, z });
    const msg = kind === 'bump' ? `grade changes ${Math.round(v * 100)}% within 4 m on "${r.n || 'road'}" (car hops)`
      : kind === 'steep' ? `${Math.round(v * 100)}% slope on "${r.n || 'road'}"`
      : `road surface tilted ${Math.round(v * 100)}% sideways on "${r.n || 'road'}"`;
    add(kind, x, z, v > (kind === 'bump' ? 0.14 : 0.2) ? 'error' : 'warn', msg, 'smooth');
  });
}

function checkDeadEnds (ctx, add, treated) {
  for (const d of deadEnds(ctx)) {
    if (!drivable(d.r) && !ctx.inBounds(d.x, d.z, 20)) continue;
    const c = classifyDeadEnd(ctx, d);
    if (c.ok) continue;
    const done = treated && treated.some(t => Math.hypot(t.x - d.x, t.z - d.z) < 1);
    const what = c.why === 'deck' ? 'on a bridge deck' : c.why === 'water' ? 'in water' : 'in nothing';
    add('dead-end', d.x, d.z, done ? 'info' : c.why === 'deck' ? 'error' : 'error',
      `"${d.r.n || 'road'}" (class ${d.c}) ends ${what}${done ? ' → ' + (c.kind === 'works' ? 'road works' : 'closed-road blocks') : ''}`, c.kind);
  }
}

function checkMisc (ctx, add) {
  // проезжая улица сквозь дом
  const seen = [];
  ctx.roads.forEach(r => {
    if (!drivable(r) || r.b) return;
    const p = r.p;
    for (let i = 1; i < p.length; i++) {
      const [x1, z1] = p[i - 1], [x2, z2] = p[i], L = Math.hypot(x2 - x1, z2 - z1);
      for (let s = 3; s < L - 3; s += 3) {
        const x = lerp(x1, x2, s / L), z = lerp(z1, z2, s / L);
        if (!ctx.inBounds(x, z) || !ctx.inHouse(x, z)) continue;
        if (seen.some(q => Math.abs(q[0] - x) < 25 && Math.abs(q[1] - z) < 25)) continue;
        seen.push([x, z]);
        add('road-in-house', x, z, r.c <= 4 ? 'warn' : 'info', `"${r.n || 'road'}" (class ${r.c}) runs through a building`);
      }
    }
  });
  // дорожка сквозь дом: гуляющие проходят сквозь стену
  const pin = [];
  for (const q of ctx.city.paths)
    for (let i = 1; i < q.length; i++) {
      const [x1, z1] = q[i - 1], [x2, z2] = q[i], L = Math.hypot(x2 - x1, z2 - z1);
      for (let s = 1; s < L - 1; s += 2) {
        const x = lerp(x1, x2, s / L), z = lerp(z1, z2, s / L);
        if (!ctx.inBounds(x, z) || !ctx.inHouse(x, z) || pin.some(p => Math.abs(p[0] - x) < 20 && Math.abs(p[1] - z) < 20)) continue;
        pin.push([x, z]);
        add('path-in-house', x, z, 'warn', 'footpath runs through a building (walkers go through the wall)', 'path');
      }
    }
  // асфальт под водой: край полотна на склоне к реке
  const wet = [];
  ctx.roads.forEach(r => {
    if (r.b || r.c === 6) return;
    const p = r.p, hw = roadWidth(r) / 2;
    for (let i = 1; i < p.length; i++) {
      const [x1, z1] = p[i - 1], [x2, z2] = p[i], L = Math.hypot(x2 - x1, z2 - z1) || 1;
      const nx = -(z2 - z1) / L, nz = (x2 - x1) / L;
      for (let s = 0; s <= L; s += 3)
        for (const o of [-hw, 0, hw]) {
          const x = lerp(x1, x2, s / L) + nx * o, z = lerp(z1, z2, s / L) + nz * o;
          if (!ctx.inBounds(x, z, -30) || ctx.groundH(x, z) + 0.14 > 0.05 || ctx.deckAt(x, z, 1)) continue;
          if (wet.some(q => Math.abs(q[0] - x) < 25 && Math.abs(q[1] - z) < 25)) continue;
          wet.push([x, z]);
          add('road-in-water', x, z, drivable(r) ? 'error' : 'warn', `asphalt of "${r.n || 'road'}" dips under the river surface`, 'bank');
        }
    }
  });
  // деревья из карты на асфальте (tree() их отбрасывает — проверяем, что их и правда нет)
  for (const [x, z] of ctx.city.trees) {
    const o = ctx.nearestOther(x, z, s => !drivable(s.r));
    if (o && o.edge < 0 && ctx.inBounds(x, z)) add('tree-on-road', x, z, 'info', 'map tree stands on asphalt (skipped by tree())');
  }
}

/* ═════════════════ починка ═════════════════
   Всё — на загрузке, до RSEG, мостов и графа в game.js: правим сами
   данные (city.roads, city.paths) и сетку высот TH. */
export function fixMap (city, TH, o = {}) {
  const t0 = now();
  const log = [];
  const note = (kind, x, z, msg) => log.push({ kind, x: r1(x), z: r1(z), msg });
  const before = o.before ? checkMap(city, TH) : null;       // для отчёта ?mapcheck: как было
  const T = {}, lap = (k, f) => { const t = now(); const r = f(); T[k] = Math.round((now() - t) * 10) / 10; return r; };
  let ctx = lap('ctx', () => mapContext(city, TH));
  lap('joints', () => fixJoints(ctx, note));
  ctx = mapContext(city, TH);
  lap('cross', () => fixGradeCrossings(ctx, note));
  lap('paths', () => fixPaths(ctx, note));
  // рельефу нужны только сами улицы (массивы те же) и высоты — контекст не пересобираем
  ctx.report = !!o.report;
  lap('terrain', () => fixTerrain(ctx, note));
  ctx = mapContext(city, TH);
  ctx = lap('bridges', () => fixBridges(ctx, note));
  // после обрезки мостов у набережных — ещё раз: к новым кускам тоже пришиваем
  if (lap('joints2', () => fixJoints(ctx, note))) ctx = mapContext(city, TH, { fade: true });

  // план тупиков: кто без ничего — тому блоки или ремонт
  const plan = [];
  for (const d of deadEnds(ctx)) {
    if (!drivable(d.r) && !ctx.inBounds(d.x, d.z, 20)) continue;
    const c = classifyDeadEnd(ctx, d);
    if (c.ok || c.why === 'deck') continue;
    plan.push({ x: d.x, z: d.z, ux: d.ux, uz: d.uz, w: d.w, c: d.c, kind: c.kind || 'blocks', why: c.why, len: c.len || 0, name: d.r.n || '', ri: d.ri });
  }
  // ремонт — не на каждом углу: самые длинные улицы, остальным — блоки
  plan.filter(p => p.kind === 'works').sort((a, b) => b.len - a.len).slice(MC.WORKS_MAX).forEach(p => { p.kind = 'blocks'; });
  // клинья на стыках улиц разной ширины (кладёт mapworks.js)
  const tapers = [];
  for (const n of ctx.NODES.values()) {
    if (n.nb.size !== 2 || n.at.length !== 2 || !ctx.inBounds(n.x, n.z, -20)) continue;
    const [A, Bq] = n.at, ra = ctx.roads[A.ri], rb = ctx.roads[Bq.ri];
    if (ra === rb || !drivable(ra) || !drivable(rb) || ra.b || rb.b) continue;
    if (Math.abs(roadWidth(ra) - roadWidth(rb)) <= MC.WIDTH_JUMP) continue;
    const [wide, wa, nar, na] = roadWidth(ra) > roadWidth(rb) ? [ra, A, rb, Bq] : [rb, Bq, ra, A];
    const q = nar.p[na.i === 0 ? 1 : na.i - 1], l = Math.hypot(q[0] - n.x, q[1] - n.z) || 1;
    if (l < 6) continue;
    tapers.push({ x: n.x, z: n.z, vx: (q[0] - n.x) / l, vz: (q[1] - n.z) / l, w1: roadWidth(nar), w2: roadWidth(wide), c: wide.c, c1: nar.c });
  }
  const ms = now() - t0;
  return { log, deadEnds: plan, tapers, before, ms, T, ctx };
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/* вставить точку в улицу r после вершины i-1 (или вернуть ближнюю вершину) */
function splitAt (r, i, x, z, near = 1.2) {
  const a = r.p[i - 1], b = r.p[i];
  if (Math.hypot(a[0] - x, a[1] - z) < near) return a;
  if (Math.hypot(b[0] - x, b[1] - z) < near) return b;
  const q = [r1(x), r1(z)];
  r.p.splice(i, 0, q);
  return q;
}

/* 1. Обрывы: конец проезда на чужом полотне или в паре метров от него —
   пришиваем к нему общим узлом. Улица получает перекрёсток, трафик —
   поворот, асфальт — пятно на стыке. */
function fixJoints (ctx, note) {
  let n = 0;
  const ends = deadEnds(ctx).filter(d => drivable(d.r) && ctx.inBounds(d.x, d.z, -5));
  for (const d of ends) {
    const j = joinTarget(ctx, d);
    if (!j) continue;
    const r = d.r, q = j.s.r;
    // рядом чужой узел — прямо в него
    let tgt = null;
    for (const s of ctx.segsNear(d.x, d.z)) {
      if (s.r === r || !drivable(s.r)) continue;
      for (const v of [[s.x1, s.z1], [s.x2, s.z2]])
        if (Math.hypot(v[0] - j.x, v[1] - j.z) < MC.NODE_SNAP && (!tgt || Math.hypot(v[0] - j.x, v[1] - j.z) < Math.hypot(tgt[0] - j.x, tgt[1] - j.z))) tgt = v;
    }
    if (tgt) {
      // вершина — именно та, что лежит в улице (тот же массив, те же числа)
      const own = q.p.find(v => v[0] === tgt[0] && v[1] === tgt[1]) ||
        ctx.roads.flatMap(rr => rr.p).find(v => v[0] === tgt[0] && v[1] === tgt[1]);
      tgt = own || tgt;
    } else {
      // сегмент мог сдвинуться от прошлых вставок — ищем его заново
      const i = q.p.findIndex((v, k) => k > 0 && q.p[k - 1][0] === j.s.x1 && q.p[k - 1][1] === j.s.z1 && v[0] === j.s.x2 && v[1] === j.s.z2);
      if (i < 0) continue;
      tgt = splitAt(q, i, j.x, j.z);
    }
    const end = d.end ? r.p.length - 1 : 0;
    const dd = Math.hypot(tgt[0] - d.x, tgt[1] - d.z);
    const pt = [tgt[0], tgt[1]];
    if (dd < 0.8) r.p[end] = pt;
    else if (d.end) r.p.push(pt); else r.p.unshift(pt);
    note('snap', d.x, d.z, `joined "${r.n || 'road'}" to "${q.n || 'road'}" (${j.edge < MC.SNAP_ON ? 'seam' : 'gap ' + j.edge.toFixed(1) + ' m'})`);
    n++;
  }
  return n;
}

/* 2. Улицы, пересекающиеся в одном уровне без узла: общий узел в обеих.
   Разметка и бордюры у перекрёстка обрываются сами. */
function fixGradeCrossings (ctx, note) {
  const X = gradeCrossings(ctx);
  // с конца: вставки в одну улицу не сдвигают ещё не обработанные сегменты
  X.sort((a, b) => b.sa.i - a.sa.i || b.sb.i - a.sb.i);
  for (const c of X) {
    const find = (r, s) => r.p.findIndex((v, k) => k > 0 && r.p[k - 1][0] === s.x1 && r.p[k - 1][1] === s.z1 && v[0] === s.x2 && v[1] === s.z2);
    const ia = find(c.a, c.sa), ib = find(c.b, c.sb);
    if (ia < 0 || ib < 0) continue;
    const qa = splitAt(c.a, ia, c.x, c.z, 0.6);
    const ib2 = find(c.b, c.sb);
    if (ib2 < 0) continue;
    // во вторую — ровно та же точка, иначе узлы не совпадут
    const b0 = c.b.p[ib2 - 1], b1 = c.b.p[ib2];
    if (qa[0] === b0[0] && qa[1] === b0[1]) { /* уже общий */ } else if (qa[0] === b1[0] && qa[1] === b1[1]) { /* уже общий */ } else c.b.p.splice(ib2, 0, [qa[0], qa[1]]);
    note('node', c.x, c.z, `junction node where "${c.a.n || 'road'}" crosses "${c.b.n || 'road'}"`);
  }
}

/* 2б. Дорожки сквозь дома. В выгрузке дворовая дорожка местами идёт через
   корпус насквозь (проход в арку, которой у нас нет) — и гуляющий по ней
   человек проходит сквозь стену. Режем дорожку по стенам. */
function fixPaths (ctx, note) {
  const out = [];
  let cut = 0;
  for (const q of ctx.city.paths) {
    let cur = [], hit = false;
    const flush = () => { if (cur.length >= 2 && polyLen(cur).at(-1) >= 3) out.push(cur); cur = []; };
    for (let i = 0; i < q.length; i++) {
      if (i === 0) { if (!ctx.inHouse(q[0][0], q[0][1])) cur.push(q[0]); continue; }
      const [x1, z1] = q[i - 1], [x2, z2] = q[i], L = Math.hypot(x2 - x1, z2 - z1);
      const n = Math.max(1, Math.ceil(L / 1.5));
      let prevIn = ctx.inHouse(x1, z1);
      for (let k = 1; k <= n; k++) {
        const x = lerp(x1, x2, k / n), z = lerp(z1, z2, k / n), inn = ctx.inHouse(x, z);
        if (inn && !prevIn) { hit = true; cur.push([r1(lerp(x1, x2, (k - 1) / n)), r1(lerp(z1, z2, (k - 1) / n))]); flush(); }
        else if (!inn && prevIn) cur.push([r1(x), r1(z)]);
        prevIn = inn;
      }
      if (!prevIn) cur.push(q[i]);
    }
    flush();
    if (hit) { cut++; note('path', q[0][0], q[0][1], 'footpath through a building cut at the walls'); }
  }
  // вершины подряд могли совпасть — чистим
  for (const p of out) for (let i = p.length - 1; i > 0; i--) if (p[i][0] === p[i - 1][0] && p[i][1] === p[i - 1][1]) p.splice(i, 1);
  ctx.city.paths.length = 0;
  for (const p of out) if (p.length >= 2) ctx.city.paths.push(p);
  return cut;
}

/* 3. Рельеф под дорогами. Сетку высот TH сглаживаем только в коридоре
   проезжих улиц и только среди сухих вершин: соседи — такие же вершины
   коридора, поэтому берег набережной не тянет асфальт в реку. Кочки на
   стыках клеток расходятся, уклоны вдоль улицы становятся ровнее, а всё,
   что строится потом (дома, газоны, мосты), и так берёт высоту из TH. */
function fixTerrain (ctx, note) {
  const { ter, TH } = ctx, NX = ter.nx, NZ = ter.nz, TG = ter.g;
  // сколько от вершины до края ближайшего проезжего полотна
  const FAR = 22, edge = new Float32Array(NX * NZ).fill(FAR);
  for (const r of ctx.roads) {
    if (!drivable(r) || r.b) continue;
    const hw = roadWidth(r) / 2;
    for (let i = 1; i < r.p.length; i++) {
      const [x1, z1] = r.p[i - 1], [x2, z2] = r.p[i], m = hw + FAR;
      const i0 = Math.max(0, Math.floor((Math.min(x1, x2) - m - ter.x0) / TG)), i1 = Math.min(NX - 1, Math.ceil((Math.max(x1, x2) + m - ter.x0) / TG));
      const j0 = Math.max(0, Math.floor((Math.min(z1, z2) - m - ter.z0) / TG)), j1 = Math.min(NZ - 1, Math.ceil((Math.max(z1, z2) + m - ter.z0) / TG));
      const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1;
      for (let j = j0; j <= j1; j++)
        for (let ii = i0; ii <= i1; ii++) {
          const px = ter.x0 + ii * TG - x1, pz = ter.z0 + j * TG - z1;
          const t = clamp((px * dx + pz * dz) / l2, 0, 1), ex = px - dx * t, ez = pz - dz * t;
          const k = j * NX + ii, d = Math.sqrt(ex * ex + ez * ez) - hw;
          if (d < edge[k]) edge[k] = d;
        }
    }
  }
  const DRY = 0.6, dry = k => TH[k] >= DRY;
  // Полотно у воды: край асфальта местами лежит на склоне к реке, и лента,
  // нарезанная по рельефу, уходит под воду. Под улицей и тротуаром —
  // набережная: вершины подтягиваем к урезу плюс полметра.
  let banks = 0;
  for (const r of ctx.roads) {
    if (r.b || r.c === 6) continue;
    const hw = sidewalkW(r) / 2;
    for (let i = 1; i < r.p.length; i++) {
      const [x1, z1] = r.p[i - 1], [x2, z2] = r.p[i], L = Math.hypot(x2 - x1, z2 - z1) || 1;
      // рядом нет низких вершин — и проверять нечего (почти все улицы)
      const m = hw + TG + 6;
      const i0 = clamp(Math.floor((Math.min(x1, x2) - m - ter.x0) / TG), 0, NX - 1), i1 = clamp(Math.ceil((Math.max(x1, x2) + m - ter.x0) / TG), 0, NX - 1);
      const j0 = clamp(Math.floor((Math.min(z1, z2) - m - ter.z0) / TG), 0, NZ - 1), j1 = clamp(Math.ceil((Math.max(z1, z2) + m - ter.z0) / TG), 0, NZ - 1);
      let low = false;
      for (let j = j0; j <= j1 && !low; j++) for (let ii = i0; ii <= i1; ii++) if (TH[j * NX + ii] < 0.75) { low = true; break; }
      if (!low) continue;
      const nx = -(z2 - z1) / L, nz = (x2 - x1) / L;
      // на концах — ещё на пару метров вперёд: иначе сразу за тупиком обрыв в реку
      const sa = i === 1 ? -5 : 0, sb = i === r.p.length - 1 ? L + 5 : L;
      for (let s = sa; s <= sb; s += 2)
        for (let o = -hw; o <= hw + 0.01; o += hw / 2) {
          const x = lerp(x1, x2, s / L) + nx * o, z = lerp(z1, z2, s / L) + nz * o;
          if (ctx.groundH(x, z) >= 0.7) continue;
          const ci = clamp(Math.floor((x - ter.x0) / TG), 0, NX - 2), cj = clamp(Math.floor((z - ter.z0) / TG), 0, NZ - 2);
          for (const k of [cj * NX + ci, cj * NX + ci + 1, (cj + 1) * NX + ci, (cj + 1) * NX + ci + 1])
            if (TH[k] < 0.75) { TH[k] = 0.75; banks++; }
        }
    }
  }
  if (banks) note('bank', 0, 0, `${banks} grid points under roads lifted out of the river`);
  let before = 0; if (ctx.report) roadProfileIssues(ctx, k => { if (k !== 'tilt') before++; });
  // низкие частоты рельефа: сглаживаем всю сухую сетку (мокрые соседи не в счёт —
  // иначе набережную тянет в реку), а применяем только у дорог, с плавным краем
  // Поперёк полотна — ровно: вершины под асфальтом тянем к высоте осевой.
  // Иначе улица вдоль склона к реке лежит с перекосом, и машину тянет вбок.
  const flatten = k0 => {
    const acc = new Float32Array(TH.length), cnt = new Float32Array(TH.length);
    for (const r of ctx.roads) {
      if (!drivable(r) || r.b) continue;
      const hw = roadWidth(r) / 2, m = hw + 4;
      for (let i = 1; i < r.p.length; i++) {
        const [x1, z1] = r.p[i - 1], [x2, z2] = r.p[i];
        const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1;
        const i0 = Math.max(1, Math.floor((Math.min(x1, x2) - m - ter.x0) / TG)), i1 = Math.min(NX - 2, Math.ceil((Math.max(x1, x2) + m - ter.x0) / TG));
        const j0 = Math.max(1, Math.floor((Math.min(z1, z2) - m - ter.z0) / TG)), j1 = Math.min(NZ - 2, Math.ceil((Math.max(z1, z2) + m - ter.z0) / TG));
        for (let j = j0; j <= j1; j++)
          for (let ii = i0; ii <= i1; ii++) {
            const k = j * NX + ii;
            if (TH[k] < DRY) continue;
            const px = ter.x0 + ii * TG - x1, pz = ter.z0 + j * TG - z1;
            const t = clamp((px * dx + pz * dz) / l2, 0, 1), ex = px - dx * t, ez = pz - dz * t;
            const d = Math.sqrt(ex * ex + ez * ez);
            if (d > m) continue;
            const wt = d < hw + 1 ? 1 : (m - d) / 3;
            acc[k] += ctx.groundH(x1 + dx * t, z1 + dz * t) * wt; cnt[k] += wt;
          }
      }
    }
    for (let k = 0; k < TH.length; k++)
      if (cnt[k] > 0) TH[k] = Math.max(DRY, lerp(TH[k], acc[k] / cnt[k], k0 * Math.min(1, cnt[k])));
  };
  flatten(0.75);
  const orig = Float32Array.from(TH), S = Float32Array.from(TH), T = new Float32Array(TH.length);
  // сухие вершины у дорог — списком: в цикле сглаживания только они
  const act = [], dryM = new Uint8Array(TH.length);
  for (let k = 0; k < TH.length; k++) if (TH[k] >= DRY) dryM[k] = 1;
  for (let j = 1; j < NZ - 1; j++) for (let i = 1; i < NX - 1; i++) { const k = j * NX + i; if (dryM[k] && edge[k] < FAR) act.push(k); }
  const OFF = [-NX - 1, -NX, -NX + 1, -1, 1, NX - 1, NX, NX + 1], WT = [0.7, 1, 0.7, 1, 1, 0.7, 1, 0.7];
  for (let it = 0; it < 5; it++) {
    T.set(S);
    for (let a = 0; a < act.length; a++) {
      const k = act[a];
      let s = T[k] * 2, w = 2;
      for (let o = 0; o < 8; o++) { const q = k + OFF[o]; if (dryM[q]) { s += T[q] * WT[o]; w += WT[o]; } }
      S[k] = s / w;
    }
  }
  let moved = 0, maxd = 0;
  for (let k = 0; k < TH.length; k++) {
    if (!dry(k) || edge[k] >= FAR) continue;
    const f = clamp((FAR - edge[k]) / (FAR - 6), 0, 1);           // у полотна — целиком, к двадцати метрам — на нет
    const v = clamp(lerp(orig[k], S[k], f), orig[k] - 2, orig[k] + 2);
    TH[k] = Math.max(DRY, v);
    const d = Math.abs(TH[k] - orig[k]);
    if (d > 0.05) moved++;
    if (d > maxd) maxd = d;
  }
  flatten(0.5);                                                   // и ещё раз, мягче: сглаживание вернуло часть перекоса
  let after = 0; if (ctx.report) roadProfileIssues(mapContext(ctx.city, TH), k => { if (k !== 'tilt') after++; });
  note('smooth', 0, 0, `terrain under roads smoothed: ${moved} grid points moved (max ${maxd.toFixed(2)} m)` + (ctx.report ? `, bumpy/steep samples ${before} → ${after}` : ''));
}

/* подъём не круче slope: низкие точки подтягиваем к соседям (только вверх),
   потом срезаем то, до чего от концов не доехать */
function slopeLimit (S, y, slope, y0, y1, L) {
  const n = y.length;
  for (let k = 1; k < n; k++) y[k] = Math.max(y[k], y[k - 1] - slope * (S[k] - S[k - 1]));
  for (let k = n - 2; k >= 0; k--) y[k] = Math.max(y[k], y[k + 1] - slope * (S[k + 1] - S[k]));
  for (let k = 0; k < n; k++) y[k] = Math.min(y[k], y0 + slope * S[k], y1 + slope * (L - S[k]));
  y[0] = y0; y[n - 1] = y1;
  return y;
}

/* 4. Мосты.
   а) Конец моста на перекрёстке — первые метры отдаём обычной улице:
      перила и балки начинаются за краем чужого полотна, а не посреди него.
   б) Над каждой улицей и дорожкой под настилом — просвет не меньше
      CLEAR_*: считаем профиль настила r.dk (подъём не круче BRIDGE_SLOPE),
      game.js кладёт настил по нему.
   в) Где просвета не добиться (проезд у самого берега, мост низкий) —
      проезд под мостом разрываем: концы у настила получат блоки.
   г) Два настила друг в друге (разделённая эстакада) — на одной высоте. */
function fixBridges (ctx, note) {
  const { roads } = ctx;
  // а) обрезка концов
  for (const b of ctx.BR.slice()) {
    const r = b.r;
    for (const end of [0, 1]) {
      let cut = junctionCut(ctx, b, end);
      if (cut < 0.5) continue;
      const p = r.p, acc = polyLen(p), L = acc[acc.length - 1];
      if (L - cut < 30) continue;
      // обычной улицей — только по суше: у набережной конец моста висит над водой
      let dryCut = 0;
      for (let d = 0; d <= cut; d += 0.5) {
        const [x, z] = alongPoly(p, acc, end ? L - d : d);
        if (ctx.groundH(x, z) < 0.45) break;
        dryCut = d;
      }
      if (dryCut < cut) cut = Math.max(0, dryCut - 0.5);
      if (cut < 1.5) continue;
      const s = end ? L - cut : cut;
      const [x, z, i] = alongPoly(p, acc, s);
      const q = [r1(x), r1(z)];
      const head = end ? p.slice(i) : p.slice(0, i);   // кусок, что становится обычной улицей
      let piece, rest;
      if (end) { piece = [q, ...head]; rest = [...p.slice(0, i), q]; }
      else { piece = [...head, q]; rest = [q, ...p.slice(i)]; }
      r.p = rest;
      const plain = { ...r, p: piece };
      delete plain.b; delete plain.dk;
      roads.push(plain);
      note('trim', p[end ? p.length - 1 : 0][0], p[end ? p.length - 1 : 0][1], `${r.n || 'bridge'}: first ${cut.toFixed(1)} m of the deck became a plain road (junction under the parapets)`);
    }
  }
  ctx = mapContext(ctx.city, ctx.TH);
  // б) профиль
  for (const b of ctx.BR) {
    const r = b.r, L = b.L, N = Math.max(2, Math.ceil(L / 3));
    const S = [], base = [], need = [];
    const g = s => { const [x, z] = alongPoly(r.p, b.acc, s); return ctx.groundH(x, z); };
    for (let k = 0; k <= N; k++) { const s = L * k / N; S.push(s); base.push(b.fn(s)); need.push(-Infinity); }
    const cr = bridgeCrossings(ctx, b);
    const hard = cr.some(c => !c.path && c.r.c <= 4);
    const slope = hard ? MC.BRIDGE_SLOPE_HARD : MC.BRIDGE_SLOPE;
    for (const c of cr) {
      const top = ctx.groundH(c.x, c.z) + c.need + 0.3;
      // до такой высоты от концов не подняться — этот переезд разорвём (в),
      // а мост зря не задираем
      const reach = Math.min(base[0] + slope * Math.max(0, c.s - c.half), base[N] + slope * Math.max(0, L - c.s - c.half));
      if (top - 0.5 > reach && (c.path || c.r.c >= 4)) continue;
      for (let k = 0; k <= N; k++) {
        const out = Math.max(0, Math.abs(S[k] - c.s) - c.half);
        need[k] = Math.max(need[k], top - out * slope * 0.8);
      }
    }
    const h0 = base[0], h1 = base[N];
    const y = slopeLimit(S, S.map((s, k) => Math.max(base[k], need[k], g(s) + 0.2)), slope, h0, h1, L);
    // мягкий перегиб на вершине и у подножия, не опуская ниже нужного
    for (let it = 0; it < 2; it++)
      for (let k = 1; k < N; k++) y[k] = Math.max((y[k - 1] + 2 * y[k] + y[k + 1]) / 4, Math.min(need[k], y[k]));
    let lifted = false;
    for (let k = 0; k <= N; k++) if (Math.abs(y[k] - base[k]) > 0.05) lifted = true;
    if (lifted) {
      const dk = [];
      for (let k = 0; k <= N; k++) dk.push(Math.round(S[k] * 100) / 100, Math.round(y[k] * 100) / 100);
      r.dk = dk;
      note('lift', r.p[0][0], r.p[0][1], `${r.n || 'bridge'}: deck profile raised over ${cr.length} crossing(s), max ${Math.max(...y.map((v, k) => v - base[k])).toFixed(1)} m`);
    }
  }
  // г) пары настилов
  ctx = mapContext(ctx.city, ctx.TH);
  pairDecks(ctx, note);
  ctx = mapContext(ctx.city, ctx.TH, { fade: true });
  // в) разрывы: что так и не пролезло под настил. По одному и заново —
  // после разреза список дорог и дорожек уже другой (мосты — те же, контекст не пересобираем)
  let cuts = 0;
  for (let it = 0; it < 40; it++) {
    let hit = null;
    for (const b of ctx.BR) {
      for (const c of bridgeCrossings(ctx, b)) {
        const clear = ctx.deckY(b, c.s, c.x, c.z) - ctx.groundH(c.x, c.z);
        if (clear >= c.need - 0.2 || (!c.path && c.r.c < 4)) continue;
        hit = { b, c };
        break;
      }
      if (hit) break;
    }
    if (!hit) break;
    const { b, c } = hit;
    const half = b.ws / 2 / Math.max(0.35, Math.abs(Math.sin(angleBetween(b, c)))) + 2.5;
    if (c.path) cutPolyline(ctx.city.paths, c.p, c.j, c.u, half);
    else roads.splice(roads.indexOf(c.r), 1, ...cutRoad(c.r, c.j, c.u, half));
    note('cut', c.x, c.z, `${c.path ? 'footpath' : '"' + (c.r.n || 'road') + '"'} under too-low "${b.r.n || 'bridge'}" deck split at the bridge`);
    cuts++;
  }
  return cuts ? mapContext(ctx.city, ctx.TH, { fade: true }) : ctx;
}

function angleBetween (b, c) {
  const p = b.r.p, q = c.p, [, , i] = alongPoly(p, b.acc, c.s);
  const ux = p[i][0] - p[i - 1][0], uz = p[i][1] - p[i - 1][1];
  const vx = q[c.j][0] - q[c.j - 1][0], vz = q[c.j][1] - q[c.j - 1][1];
  return Math.atan2(ux * vz - uz * vx, ux * vx + uz * vz);
}

/* разрезать линию дыры шириной 2·half вокруг точки (сегмент j, доля u) */
function cutLine (p, j, u, half) {
  const acc = polyLen(p), s = acc[j - 1] + u * (acc[j] - acc[j - 1]), L = acc[acc.length - 1];
  const sa = s - half, sb = s + half;
  const part = (s0, s1) => {
    if (s1 - s0 < 3) return null;
    const out = [];
    const [ax, az] = alongPoly(p, acc, s0); out.push([r1(ax), r1(az)]);
    for (let i = 0; i < p.length; i++) if (acc[i] > s0 + 0.3 && acc[i] < s1 - 0.3) out.push(p[i]);
    const [bx, bz] = alongPoly(p, acc, s1); out.push([r1(bx), r1(bz)]);
    // исходные концы — те же массивы, чтобы узлы не разошлись
    if (s0 === 0) out[0] = p[0];
    if (s1 === L) out[out.length - 1] = p[p.length - 1];
    return out;
  };
  return [part(0, Math.max(0, sa)), part(Math.min(L, sb), L)].filter(Boolean);
}
function cutRoad (r, j, u, half) {
  const parts = cutLine(r.p, j, u, half);
  return parts.map(p => { const q = { ...r, p }; delete q.dk; return q; });
}
function cutPolyline (list, p, j, u, half) {
  const parts = cutLine(p, j, u, half);
  list.splice(list.indexOf(p), 1, ...parts);
}

/* Разделённая эстакада — два моста бок о бок, и их настилы налезают
   друг на друга. Выравниваем: там, где они рядом, оба по верхнему. */
function pairDecks (ctx, note) {
  const BR = ctx.BR;
  for (let i = 0; i < BR.length; i++)
    for (let j = 0; j < BR.length; j++) {
      if (i === j) continue;
      const A = BR[i], B = BR[j];
      let dy = 0;
      const N = Math.max(2, Math.ceil(A.L / 3));
      const ys = [];
      for (let k = 0; k <= N; k++) {
        const s = A.L * k / N, [x, z] = alongPoly(A.r.p, A.acc, s);
        let yb = null;
        for (const g of B.segs) {
          const dx = g.x2 - g.x1, dz = g.z2 - g.z1;
          const t = ((x - g.x1) * dx + (z - g.z1) * dz) / (dx * dx + dz * dz || 1);
          if (t < 0 || t > 1) continue;
          if (Math.hypot(x - g.x1 - dx * t, z - g.z1 - dz * t) > (A.ws + B.ws) / 2 + 1) continue;
          yb = B.fn(lerp(g.s1, g.s2, t));
        }
        const ya = A.fn(s);
        ys.push([s, yb !== null ? Math.max(ya, yb) : ya]);
        if (yb !== null) dy = Math.max(dy, yb - ya);
      }
      if (dy < 0.3) continue;
      // концы — свои: съезд к своей улице не круче BRIDGE_SLOPE_HARD
      const L = A.L, S = ys.map(q => q[0]);
      const y = slopeLimit(S, ys.map(q => q[1]), MC.BRIDGE_SLOPE, A.fn(0), A.fn(L), L);
      A.r.dk = S.flatMap((s, k) => [Math.round(s * 100) / 100, Math.round(y[k] * 100) / 100]);
      A.fn = profileFn(A.r.dk);
      note('pair', A.r.p[0][0], A.r.p[0][1], `"${A.r.n || 'bridge'}" deck raised up to ${dy.toFixed(1)} m to meet its twin`);
    }
}
