/* ──────────────────────────────────────────────────────────────────────────
   Круги — кольцевые развязки и их острова (docs/CAREER.md «Город: как выглядит» → «Круги»).

   Где круги — считаем по карте при загрузке, руками ничего не отмечено: замкнутая цепочка
   односторонних кусков улиц (в OSM кольцо — junction=roundabout, в выгрузке это просто
   односторонние куски по кругу), концы сшиваем, если ближе SNAP м. Круг — если цепочка
   короче MAX_L, почти круглая (ближняя к центру точка оси / дальняя ≥ ROUND) и не петляет
   (длина / 2π·радиус ≤ LEN_K). Одна развязка даёт несколько цепочек (через съезды) —
   берём самую круглую. В Солнечном таких четыре: большое Кольцо у пиццерии (остров ~200 м),
   малый круг на Ленинградской и Победы, круг на площади Ленина и овал во дворах у Калинина.

   Остров — от центра лучами до края асфальта (RAYS лучей, край — до 2 см).
     • остров меньше WOOD_R: поднят на высоту тротуара (бордюр, CURB_H) — сочный газон той же
       краской, что парки (сезоны и пятна газона — lawn.js, как везде), по краю — бордюрный
       камень, сплошной, и машину на нём подкидывает, как на тротуаре (клетки RAISED);
     • от GROVE_R — роща: деревья разных пород через STEP м, ели и сосны — в глубине, у края —
       лиственные; по краю — кусты (сирень, шиповник), у въездов (ENTRY м) кустов нет;
     • меньше GROVE_R — клумба посередине (земля и цветы), кусты по краю и пара деревьев;
     • от WOOD_R (Кольцо) — газон парка как был; лес: ельник forest.js (ели, сосны, подлесок)
       от WOOD.EDGE м за краем асфальта, с полянами (шум), большой поляной посередине, аллеи и
       дорожки свободны (WOOD.PATH м); лиственные рощицы (берёза, клён, липа, рябина) пятнами
       по второму шуму и опушкой вдоль круга.
   Стволы — не ближе ROAD м к краю проезжей части. Деревья — обычные городские (game.js tree):
   твёрдые, как в парках, и убираются редактором города. На островах поменьше Кольца город сам
   деревья больше не сажает (уличные ряды, газоны) — только мы (blocks); на Кольце ряд вдоль улицы
   и деревья парка — как были, ельник их обходит.

   game.js: build — кусок поздней сборки до деревьев (краска — в статику LIT, деревья — в склейку
   сезонов), wood — после ельника (forest.js addArea), blocks — в tree(), polys — мелочь на
   газоне (lawnprops.js) островов не трогает, wooded — воздушные змеи (kites.js) не в лесу.
   отладка: __dlv.ROUND
   ────────────────────────────────────────────────────────────────────────── */
import * as FOREST from './forest.js';

export const RING = {
  SNAP: 3.5,              // концы односторонних кусков ближе — один узел, м
  MAX_L: 1600,            // круг длиннее — не круг, м (Кольцо — ~1,4 км)
  MAX_N: 12,              // кусков в одном круге не больше
  ROUND: 0.55,            // ближняя точка оси / дальняя (от центра) — не меньше: овал ещё круг
  LEN_K: 1.12,            // длина / (2π · средний радиус) — не больше
  MIN_R: 3,               // остров (до края асфальта) уже — не трогаем, м
  RAYS: 72,               // лучей от центра до края асфальта
  CURB_W: 0.24,           // бордюрный камень по краю острова, м
  LAWN_UP: 0.04,          // газон выше поднятого тротуара, м (камень — ещё на 2 см выше)
  LAWN: '#86c862',        // газон острова — краска парков (game.js GREEN_HEX.park)
  STONE: '#f1ede6', FACE: '#b9b4ab',
  GROVE_R: 15,            // остров от этого радиуса — роща, м
  WOOD_R: 60,             // от этого — лес (ельник forest.js) с полянами, м
  ROAD: 3,                // ствол от края проезжей части не ближе, м
  BUSH: 2.7,              // куст от края асфальта, м
  BUSH_STEP: 3.1,         // между кустами по краю, м
  ENTRY: 5,               // у въезда на круг кустов нет, м (от точки въезда по краю)
  STEP: 3.8,              // шаг рощи, м
  DEEP: 6,                // ели и сосны рощи — не ближе к краю, м
  BED: [1.4, 3.0],        // клумба: радиус от/до, м
  GROVE: { birch: 30, maple: 18, lime: 10, rowan: 10, spruce: 18, pine: 14 },
  EDGE_MIX: { birch: 40, maple: 25, lime: 15, rowan: 12, poplar: 8 },
  FLOWERS: ['#e8424a', '#f4c430', '#f6f2ea', '#e86fa8', '#9a5ee0', '#f08a2c'],
  WOOD: {
    EDGE: 22,             // ельник — от края асфальта, м (ближе — газон, ряд деревьев вдоль улицы и опушка лиственными)
    MEADOW: 42,           // большая поляна посередине, м
    PATH: 2.6,            // от дорожки и аллеи до ствола, м
    GLADE: { S: 34, T: 0.62 },     // поляны: масштаб шума, м; выше порога — поляна
    DECID: { S: 46, T: 0.55 },     // лиственные рощицы: свой шум, выше порога — рощица (ельника там нет)
    DECID_STEP: 6.5,      // шаг лиственных рощиц, м
    RIM: [8, 15],         // опушка лиственными вдоль круга: от края асфальта, м
    RIM_STEP: 6,          // шаг опушки, м
    RIM_GAP: 0.22,        // доля пропусков в опушке
    CAP: 520,             // лиственных на один лес не больше
  },
};

let A = null;
const LIST = [];                       // круги: { c, rho, isl, rIn, rMid, kind, ids, entries, ... }
const ST = { cycles: 0, rings: 0, trees: 0, bushes: 0, flowers: 0, beds: 0, raised: 0, wood: 0, ms: 0, why: {} };
const OWN = new Map();                 // свои деревья по клеткам 8 м — «лес ли тут» для змеев

/* ── мелочи ── */
const segD = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
};
const inP = (x, z, p) => {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
};
function hsh (x, z, k) {
  let h = Math.imul(Math.round(x * 8) ^ 0x51ed270b, 0x9E3779B1) ^ Math.imul(Math.round(z * 8) + k * 1013904223, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function noise (x, z, S, k) {
  const gx = x / S, gz = z / S, i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hsh(i, j, k), b = hsh(i + 1, j, k), c = hsh(i, j + 1, k), e = hsh(i + 1, j + 1, k);
  return (a + (b - a) * u) + ((c + (e - c) * u) - (a + (b - a) * u)) * v;
}
function weighted (r, o) {
  let s = 0; for (const k in o) s += o[k];
  let x = r * s; for (const k in o) if ((x -= o[k]) < 0) return k;
  return Object.keys(o)[0];
}

/* ── где круги ── */
function find (CITY, roadWidth) {
  const R = CITY.roads || [];
  const len = r => { let s = 0; for (let i = 1; i < r.p.length; i++) s += Math.hypot(r.p[i][0] - r.p[i - 1][0], r.p[i][1] - r.p[i - 1][1]); return s; };
  const ow = [];
  R.forEach((r, i) => { if (r.o && !r.b && r.c <= 5 && r.p && r.p.length > 1) ow.push(i); });
  const L = new Map(ow.map(i => [i, len(R[i])]));
  const close = (a, b) => Math.abs(a[0] - b[0]) <= RING.SNAP && Math.abs(a[1] - b[1]) <= RING.SNAP && Math.hypot(a[0] - b[0], a[1] - b[1]) <= RING.SNAP;
  // кто начинается у конца кого
  const next = new Map();
  for (const i of ow) next.set(i, ow.filter(j => j !== i && close(R[j].p[0], R[i].p[R[i].p.length - 1])));
  const found = new Map();
  let budget = 200000;
  for (const i of ow) {
    const st = [[i, [i], L.get(i)]];
    while (st.length && budget-- > 0) {
      const [cur, path, l] = st.pop();
      if (path.length > 1 && close(R[cur].p[R[cur].p.length - 1], R[i].p[0])) {
        const key = [...path].sort((a, b) => a - b).join('-');
        if (!found.has(key)) found.set(key, path);
        continue;
      }
      if (path.length >= RING.MAX_N) continue;
      for (const n of next.get(cur)) {
        if (n < i || path.includes(n)) continue;            // цикл ищем от его меньшего куска — каждый раз один
        const l2 = l + L.get(n);
        if (l2 <= RING.MAX_L) st.push([n, [...path, n], l2]);
      }
    }
  }
  ST.cycles = found.size;
  const cand = [];
  for (const path of found.values()) {
    const pts = [];
    for (const j of path) for (const q of R[j].p) pts.push(q);
    let a2 = 0, cx = 0, cz = 0;
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k], b = pts[(k + 1) % pts.length], c = a[0] * b[1] - b[0] * a[1];
      a2 += c; cx += (a[0] + b[0]) * c; cz += (a[1] + b[1]) * c;
    }
    if (Math.abs(a2) < 1) continue;
    cx /= 3 * a2; cz /= 3 * a2;
    let mn = Infinity, mx = 0, sum = 0, n = 0, Lc = 0;
    for (const j of path) {
      const p = R[j].p;
      for (let k = 1; k < p.length; k++) {
        const [ax, az] = p[k - 1], [bx, bz] = p[k], l = Math.hypot(bx - ax, bz - az), m = Math.max(1, Math.ceil(l / 2));
        Lc += l;
        for (let t = 0; t < m; t++) {
          const d = Math.hypot(ax + (bx - ax) * t / m - cx, az + (bz - az) * t / m - cz);
          mn = Math.min(mn, d); mx = Math.max(mx, d); sum += d; n++;
        }
      }
    }
    const mean = sum / n, round = mn / mx, lenK = Lc / (2 * Math.PI * mean);
    if (round < RING.ROUND || lenK > RING.LEN_K) continue;
    cand.push({ c: [cx, cz], ids: path, L: Lc, rmin: mn, rmax: mx, mean, round, w: Math.max(...path.map(j => roadWidth(R[j]))) });
  }
  cand.sort((a, b) => b.round - a.round);
  const out = [];
  for (const c of cand) if (!out.some(o => Math.hypot(o.c[0] - c.c[0], o.c[1] - c.c[1]) < Math.max(o.mean, c.mean))) out.push(c);
  return out;
}

/* ── остров: от центра лучами до края асфальта ── */
function island (ring, CITY, roadWidth) {
  const [cx, cz] = ring.c, reach = ring.rmax + 20;
  const segs = [];
  for (const r of CITY.roads || []) {
    if (r.b || !r.p) continue;
    const hw = roadWidth(r) / 2;
    for (let i = 1; i < r.p.length; i++) {
      const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
      if (Math.max(ax, bx) < cx - reach || Math.min(ax, bx) > cx + reach || Math.max(az, bz) < cz - reach || Math.min(az, bz) > cz + reach) continue;
      segs.push(ax, az, bx, bz, hw);
    }
  }
  const asphalt = (x, z) => {
    for (let k = 0; k < segs.length; k += 5) if (segD(x, z, segs[k], segs[k + 1], segs[k + 2], segs[k + 3]) < segs[k + 4]) return true;
    return false;
  };
  if (asphalt(cx, cz)) return null;
  const N = RING.RAYS, rho = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2, ux = Math.cos(a), uz = Math.sin(a);
    let t = 0;
    const st = ring.rmax > 60 ? 1 : 0.4;
    while (t < reach && !asphalt(cx + ux * t, cz + uz * t)) t += st;
    if (t >= reach) return null;                       // луч ушёл — кольцо не замкнуто
    let lo = Math.max(0, t - st), hi = t;
    while (hi - lo > 0.02) { const m = (lo + hi) / 2; if (asphalt(cx + ux * m, cz + uz * m)) hi = m; else lo = m; }
    rho[i] = lo;
  }
  // въезды: концы чужих улиц у кольца — там без кустов
  const own = new Set(ring.ids), entries = [];
  for (let ri = 0; ri < (CITY.roads || []).length; ri++) {
    const r = CITY.roads[ri];
    if (r.b || !r.p || own.has(ri)) continue;
    for (const q of [r.p[0], r.p[r.p.length - 1]]) {
      const d = Math.hypot(q[0] - cx, q[1] - cz);
      if (d > ring.rmin - 3 && d < ring.rmax + 3) entries.push(Math.atan2(q[1] - cz, q[0] - cx));
    }
  }
  return { rho, entries };
}
/* край острова в сторону точки и сколько до него (≥ 0 — на острове) */
function rhoAt (g, x, z) {
  const N = RING.RAYS;
  let a = Math.atan2(z - g.c[1], x - g.c[0]); if (a < 0) a += Math.PI * 2;
  const f = a / (Math.PI * 2) * N, i = Math.floor(f) % N, k = f - Math.floor(f);
  return g.rho[i] * (1 - k) + g.rho[(i + 1) % N] * k;
}
const edgeDist = (g, x, z) => rhoAt(g, x, z) - Math.hypot(x - g.c[0], z - g.c[1]);
function nearEntry (g, a, R) {
  for (const e of g.entries) {
    let d = Math.abs(a - e); if (d > Math.PI) d = 2 * Math.PI - d;
    if (d * R < RING.ENTRY) return true;
  }
  return false;
}
function ringPts (g, off) {
  const out = [], N = RING.RAYS;
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2, r = Math.max(0.2, g.rho[i] + off);
    out.push([g.c[0] + Math.cos(a) * r, g.c[1] + Math.sin(a) * r]);
  }
  return out;
}

/* ── посадка: обычное городское дерево (game.js tree), своя отметка в сетке ── */
function plant (x, z, kind) {
  if (!A.tree(x, z, 0, kind, true)) return false;
  const k = Math.floor(x / 8) + ',' + Math.floor(z / 8);
  let a = OWN.get(k); if (!a) OWN.set(k, a = []); a.push(x, z);
  if (kind === 'lilac' || kind === 'rosehip' || kind === 'bush') ST.bushes++; else ST.trees++;
  return true;
}

/* ── остров поменьше Кольца: поднятый газон с бордюром ── */
function paint (g) {
  const M = A.LITM, H = A.CURB_H, N = RING.RAYS, [cx, cz] = g.c;
  const lawnY = H + RING.LAWN_UP, stoneY = lawnY + 0.02;
  M.color(RING.LAWN);
  M.poly(ringPts(g, -RING.CURB_W + 0.02), lawnY);
  // бордюрный камень: кромка сверху и грань к дороге (на 4 см заходит на асфальт — грань тротуара за ней)
  const inner = ringPts(g, -RING.CURB_W), outer = ringPts(g, 0.04);
  M.color(RING.STONE);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N, a = inner[i], b = inner[j], c = outer[j], d = outer[i];
    M.dtri(a[0], a[1], b[0], b[1], c[0], c[1], stoneY);
    M.dtri(a[0], a[1], c[0], c[1], d[0], d[1], stoneY);
  }
  M.color(RING.FACE);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N, d = outer[i], c = outer[j];
    const gd = A.groundH(d[0], d[1]), gc = A.groundH(c[0], c[1]);
    const nx = (d[0] + c[0]) / 2 - cx, nz = (d[1] + c[1]) / 2 - cz, nl = Math.hypot(nx, nz) || 1;
    M.quad(d[0], gd - 0.05, d[1], c[0], gc - 0.05, c[1], c[0], gc + stoneY, c[1], d[0], gd + stoneY, d[1], nx / nl, 0, nz / nl);
  }
  // по острову машину подкидывает, люди стоят на нём, а не в нём (клетки по метру, как у тротуара)
  const R = Math.max(...g.rho);
  for (let x = Math.ceil(cx - R); x <= cx + R; x++)
    for (let z = Math.ceil(cz - R); z <= cz + R; z++)
      if (edgeDist(g, x, z) > 0.7) { A.raise(x, z); ST.raised++; }
}

/* клумба: земля в каменном кольце и цветы кругами */
function bed (g, r) {
  const M = A.LITM, [cx, cz] = g.c, y = A.CURB_H + RING.LAWN_UP;
  M.color('#d8d2c6'); M.disc(cx, cz, r + 0.25, y + 0.05, 20);
  M.color('#6b4a33'); M.disc(cx, cz, r, y + 0.07, 20);
  let n = 0;
  for (let rr = r - 0.35, ring = 0; rr > 0.2; rr -= 0.5, ring++) {
    const m = Math.max(1, Math.round(2 * Math.PI * rr / 0.42)), col = RING.FLOWERS[(ring + Math.floor(hsh(cx, cz, 9) * 6)) % RING.FLOWERS.length];
    M.color(col);
    for (let k = 0; k < m; k++) {
      const a = (k + (ring % 2) * 0.5) / m * Math.PI * 2;
      M.disc(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, 0.15, y + 0.13, 5);
      n++;
    }
  }
  M.color('#f4c430'); M.disc(cx, cz, 0.18, y + 0.14, 5);
  ST.flowers += n + 1; ST.beds++;
}

/* кусты по краю острова, кроме въездов */
function rimBushes (g, off, step, seed) {
  const N = RING.RAYS, [cx, cz] = g.c;
  let per = 0;
  for (let i = 0; i < N; i++) per += Math.hypot((g.rho[i] - g.rho[(i + 1) % N]), g.rho[i] * Math.PI * 2 / N);
  const n = Math.floor(per / step);
  for (let k = 0; k < n; k++) {
    const a = (k + hsh(cx, cz, seed + k) * 0.3) / n * Math.PI * 2;
    const R = rhoAt(g, cx + Math.cos(a), cz + Math.sin(a)) - off;
    if (R < 1 || nearEntry(g, a, R + off)) continue;
    const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
    plant(x, z, hsh(x, z, 3) < 0.6 ? 'lilac' : 'rosehip');
  }
}

/* роща: деревья через STEP со сдвигом; ели и сосны — в глубине */
function grove (g) {
  const [cx, cz] = g.c, S = RING.STEP, R = Math.max(...g.rho);
  for (let x = cx - R; x <= cx + R; x += S)
    for (let z = cz - R; z <= cz + R; z += S) {
      const px = x + (hsh(x, z, 1) - 0.5) * S * 0.7, pz = z + (hsh(x, z, 2) - 0.5) * S * 0.7;
      const e = edgeDist(g, px, pz);
      if (e < RING.ROAD) continue;
      let kind = weighted(hsh(px, pz, 4), RING.GROVE);
      if (e < RING.DEEP && (kind === 'spruce' || kind === 'pine')) kind = hsh(px, pz, 5) < 0.6 ? 'birch' : 'rowan';
      plant(px, pz, kind);
    }
  rimBushes(g, RING.BUSH, RING.BUSH_STEP, 20);
}

/* маленький остров: клумба, кусты по краю, пара деревьев */
function small (g) {
  const [cx, cz] = g.c, rIn = g.rIn;
  const br = Math.min(RING.BED[1], rIn * 0.32);
  if (br >= RING.BED[0] && rIn - br >= 2) bed(g, br);
  rimBushes(g, Math.min(RING.BUSH, Math.max(1.2, rIn * 0.5)), RING.BUSH_STEP + 0.6, 30);
  // два дерева — напротив друг друга, где остров шире всего
  let best = 0;
  for (let i = 0; i < RING.RAYS; i++) if (g.rho[i] + g.rho[(i + RING.RAYS / 2) % RING.RAYS] > g.rho[best] + g.rho[(best + RING.RAYS / 2) % RING.RAYS]) best = i;
  const kinds = ['birch', hsh(cx, cz, 6) < 0.5 ? 'maple' : 'rowan'];
  for (const [n, i] of [[0, best], [1, (best + RING.RAYS / 2) % RING.RAYS]]) {
    const a = i / RING.RAYS * Math.PI * 2, r = Math.max(br + 1.6, Math.min(g.rho[i] - RING.ROAD, br + 3));
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (edgeDist(g, x, z) >= RING.ROAD && r > (br ? br + 1.2 : 0)) plant(x, z, kinds[n]);
  }
}

/* ── Кольцо: лес ── */
function woodHole (g, x, z, r = 0) {
  const W = RING.WOOD;
  if (Math.hypot(x - g.c[0], z - g.c[1]) < W.MEADOW + r) return true;
  if (noise(x, z, W.GLADE.S, 11) > W.GLADE.T) return true;
  if (noise(x, z, W.DECID.S, 17) > W.DECID.T) return true;     // тут лиственная рощица (своими деревьями)
  if (A.onPave && A.onPave(x, z, W.PATH + r)) return true;
  if (A.onAlley && A.onAlley(x, z, W.PATH + r)) return true;
  return false;
}
function woodDecid (g) {
  const W = RING.WOOD, [cx, cz] = g.c, R = Math.max(...g.rho);
  let n = 0;
  const ok = (x, z, m) => !(A.onPave && A.onPave(x, z, m)) && !(A.onAlley && A.onAlley(x, z, m)) && !A.inHouse(x, z, 4);
  // опушка вдоль круга: группами, с пропусками; кусты между
  let per = 0;
  for (let i = 0; i < RING.RAYS; i++) per += g.rho[i] * Math.PI * 2 / RING.RAYS;
  const m = Math.floor(per / W.RIM_STEP);
  for (let k = 0; k < m && n < W.CAP; k++) {
    const a = (k + hsh(cx, cz, 40 + k) * 0.4) / m * Math.PI * 2, ux = Math.cos(a), uz = Math.sin(a);
    const rr = rhoAt(g, cx + ux, cz + uz);
    if (hsh(rr, a, 41) < W.RIM_GAP || nearEntry(g, a, rr)) continue;
    const off = W.RIM[0] + hsh(a, rr, 42) * (W.RIM[1] - W.RIM[0]), x = cx + ux * (rr - off), z = cz + uz * (rr - off);
    if (!ok(x, z, 2)) continue;
    const kind = hsh(x, z, 43) < 0.18 ? (hsh(x, z, 44) < 0.6 ? 'lilac' : 'rosehip') : weighted(hsh(x, z, 45), RING.EDGE_MIX);
    if (plant(x, z, kind)) n++;
  }
  // лиственные рощицы пятнами там, где нет ельника
  const S = W.DECID_STEP;
  for (let x = cx - R; x <= cx + R && n < W.CAP; x += S)
    for (let z = cz - R; z <= cz + R && n < W.CAP; z += S) {
      const px = x + (hsh(x, z, 50) - 0.5) * S * 0.8, pz = z + (hsh(x, z, 51) - 0.5) * S * 0.8;
      if (noise(px, pz, W.DECID.S, 17) <= W.DECID.T + 0.02 || noise(px, pz, W.GLADE.S, 11) > W.GLADE.T) continue;
      if (edgeDist(g, px, pz) < W.RIM[1] + 3 || Math.hypot(px - cx, pz - cz) < W.MEADOW || !ok(px, pz, W.PATH)) continue;
      if (plant(px, pz, weighted(hsh(px, pz, 52), RING.EDGE_MIX))) n++;
    }
  g.decid = n;
}

/* ── подключение ── */
/* api (game.js): CITY, roadWidth, LITM, CURB_H, groundH, inHouse, tree(x, z, strip, kind, own), raise(x, z),
   onPave(x, z, m), onAlley(x, z, m) */
export function build (api) {
  const t0 = performance.now();
  A = api;
  LIST.length = 0; OWN.clear();
  for (const r of find(A.CITY, A.roadWidth)) {
    const isl = island(r, A.CITY, A.roadWidth);
    if (!isl) { ST.why.open = (ST.why.open || 0) + 1; continue; }
    const g = { ...r, ...isl, c: r.c };
    g.rIn = Math.min(...g.rho); g.rMid = g.rho.reduce((s, v) => s + v, 0) / g.rho.length;
    if (g.rIn < RING.MIN_R) { ST.why.thin = (ST.why.thin || 0) + 1; continue; }
    g.kind = g.rMid >= RING.WOOD_R ? 'wood' : g.rMid >= RING.GROVE_R ? 'grove' : 'small';
    g.poly = ringPts(g, 0);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of g.poly) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    g.box = [x0, z0, x1, z1];
    g.names = [...new Set(g.ids.map(j => A.CITY.roads[j].n).filter(Boolean))];
    LIST.push(g);
  }
  for (const g of LIST) {
    const t = ST.trees + ST.bushes;
    if (g.kind === 'wood') woodDecid(g);
    else { paint(g); if (g.kind === 'grove') grove(g); else small(g); }
    g.planted = ST.trees + ST.bushes - t;
  }
  ST.rings = LIST.length;
  ST.ms = Math.round(performance.now() - t0);
  if (typeof window !== 'undefined') window.setTimeout(() => { if (window.__dlv) window.__dlv.ROUND = DEBUG; }, 0);
}

/* после ельника (forest.js init): лес на Кольце */
export function wood () {
  for (const g of LIST) {
    if (g.kind !== 'wood') continue;
    const p = ringPts(g, -RING.WOOD.EDGE);
    if (FOREST.addArea(p, (x, z, r) => woodHole(g, x, z, r))) { g.wood = p; ST.wood++; }
  }
}

const onIsland = (g, x, z, m) => {
  const b = g.box;
  return !(x < b[0] - m || x > b[2] + m || z < b[1] - m || z > b[3] + m) && edgeDist(g, x, z) > -m;
};
/* на острове поменьше Кольца (tree() города тут не сажает — только мы). На Кольце городские деревья —
   ряд вдоль улицы и парк — растут как раньше: ельник их обходит */
export function blocks (x, z, m = 0) {
  for (const g of LIST) if (g.kind !== 'wood' && onIsland(g, x, z, m)) return true;
  return false;
}
/* в лесу или в рощице острова: ближе m к своему дереву или там, где растёт ельник */
export function wooded (x, z, m = 5) {
  for (let i = Math.floor((x - m) / 8); i <= Math.floor((x + m) / 8); i++)
    for (let j = Math.floor((z - m) / 8); j <= Math.floor((z + m) / 8); j++) {
      const a = OWN.get(i + ',' + j);
      if (a) for (let k = 0; k < a.length; k += 2) if (Math.hypot(a[k] - x, a[k + 1] - z) < m) return true;
    }
  const forest = (g, px, pz) => edgeDist(g, px, pz) >= RING.WOOD.EDGE && !woodHole(g, px, pz);
  for (const g of LIST) {
    if (g.kind !== 'wood' || !onIsland(g, x, z, m)) continue;
    if (forest(g, x, z) || forest(g, x + m, z) || forest(g, x - m, z) || forest(g, x, z + m) || forest(g, x, z - m)) return true;
  }
  return false;
}
/* контуры островов — мелочь на газоне (lawnprops.js) их не трогает */
export const polys = () => LIST.map(g => g.poly);

export const DEBUG = {
  RING, ST, LIST,
  get list () {
    return LIST.map(g => ({ c: g.c.map(Math.round), kind: g.kind, names: g.names, L: Math.round(g.L), axis: [+g.rmin.toFixed(1), +g.rmax.toFixed(1)],
      island: [+g.rIn.toFixed(1), +g.rMid.toFixed(1), +Math.max(...g.rho).toFixed(1)], round: +g.round.toFixed(2), entries: g.entries.length, planted: g.planted, decid: g.decid || 0, wood: !!g.wood }));
  },
  blocks, wooded, edgeDist: (i, x, z) => edgeDist(LIST[i], x, z),
};
