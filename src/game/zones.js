/* Районы города для карьеры: куда ведёт заказ и что там бывает.
     rich   — особняки (MAP.career.rich: точка и радиус)
     gang   — бандитские районы (MAP.career.gang), сжимаются донатом «борьба с насилием»
     garage — гаражные кооперативы и ряды гаражей
     ind    — промзона
     poor   — частный сектор и бараки
     normal — всё остальное
   ZN.init(api) — один раз после сборки города; ZN.zoneAt(x, z) — строка выше.
   ZN.gangZones() — бандитские районы с учётом доната: середина и радиус-охват { x, z, r } (для карты,
     событий «рядом с районом» и запасного выбора адреса).
   ZN.inGang(x, z) — точка в бандитском районе (по кварталам, см. ниже), с учётом доната.
   ZN.gangMask() — сами кварталы: [{ x0, z0, nx, nz, C, v }] (радар и карта — world.js, вид района — gangland.js).
   Прогресс доната читается через api.donated('gang') → 0…1.

   Бандитский район — не круг, а кварталы целиком (24.10.2026, автор: «зона бандитов должна быть гораздо больше»):
   город режется улицами (класс 1—4 — от магистралей до жилых; дворовые проезды — внутри квартала) на кварталы
   клетками GMAP.CELL м; квартал в районе, если его середина ближе R района (у каждого квартала свой жребий
   GMAP.EDGE — край неровный, по улицам). Граничная улица — вне района, улица между кварталами района — в нём.
   Юг — без бандитов (правило 11.10.2026): клетки Юга не берутся никогда. У пиццерий (GMAP.PIZZA_R) — тоже нет.
   Донат сжимает район к середине: квартал остаётся, пока его середина ближе R × (1 − доля доната). */
import { GANG } from './econ.js';

let A = null, CELL = new Map();
const C = 60;

export const GMAP = {
  CELL: 8,            // м — клетка маски кварталов
  BAR: 7,             // улицы класса ≤ BAR — границы кварталов (7 — дворовый проезд — нет)
  PAD: 2.5,           // м за краем полотна — тоже улица (тротуар)
  CLIP: 1.18,         // доля R: дальше середины района квартал не тянется (большие парки, лес, поле)
  EDGE: [0.86, 1.1],  // квартал в районе, если его середина ближе R × жребий квартала из этих пределов
  PIZZA_R: 150,       // м — у пиццерии бандитов нет: кварталы с серединой ближе (и те, что ближе половины, — целиком)
  NEAR: 45,           // м — клетка дальше от домов — не район (поле, лес, вода за кварталом)
  ROAD_IN: 1.6,       // клетка улицы — в районе, если кварталов района вокруг в столько раз больше, чем чужих
  WET: 24,            // м — шаг проверки воды (Томь — не квартал)
};

/* ?nogang — вид района по-старому (без граффити, сгоревших машин, стай, хвоста, лишнего мусора) — сравнить память и кадр */
export const LOOK_OFF = typeof location !== 'undefined' && /[?&]nogang(&|$)/.test(location.search);

export function init (api) {
  A = Object.assign(A || {}, api);
  CELL = new Map();
  // клетки по 60 м: какой вид домов в клетке преобладает — быстрый ответ без перебора
  const add = (x, z, k) => {
    const key = Math.floor(x / C) + ',' + Math.floor(z / C);
    let c = CELL.get(key);
    if (!c) CELL.set(key, c = {});
    c[k] = (c[k] || 0) + 1;
  };
  for (const b of A.CITY.buildings) {
    let cx = 0, cz = 0;
    for (const q of b.p) { cx += q[0] / b.p.length; cz += q[1] / b.p.length; }
    const k = b.k === 'gar' ? 'garage' : b.k === 'ind' ? 'ind' : b.k === 'priv' || b.st === 'priv' ? 'poor' : 'normal';
    add(cx, cz, k);
  }
  for (const g of A.CITY.garlots || []) for (const q of g.p || []) add(q[0], q[1], 'garage');
}

/* ── кварталы бандитов: маска клеток ── */
let MASK = null;
export const MSTAT = { ms: 0, zones: [] };
const bhash = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233 + 5.17) * 43758.5453; return s - Math.floor(s); };

/* одна зона: прямоугольник клеток вокруг середины, улицы — стены, кварталы — заливкой между ними */
export function* zoneSteps (g, o) {
  const { roads, distAt, pizzas, wet } = o, Cs = GMAP.CELL, R = g.r || GANG.ZONE_R;
  const span = R * GMAP.CLIP + Cs * 4;
  const x0 = Math.floor((g.x - span) / Cs) * Cs, z0 = Math.floor((g.z - span) / Cs) * Cs;
  const nx = Math.ceil((g.x + span - x0) / Cs), nz = Math.ceil((g.z + span - z0) / Cs), N = nx * nz;
  const bar = new Uint8Array(N);                 // 1 — улица, 2 — нельзя (Юг, вода, далеко от середины)
  const cx = i => x0 + (i + 0.5) * Cs, cz = j => z0 + (j + 0.5) * Cs;
  // нельзя: дальше CLIP, Юг, вода
  const RC = R * GMAP.CLIP;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = cx(i), z = cz(j);
    if ((x - g.x) ** 2 + (z - g.z) ** 2 > RC * RC) { bar[i * nz + j] = 2; continue; }
    if (distAt && distAt(x, z) === 0) bar[i * nz + j] = 2;
  }
  if (wet) {
    const st = Math.max(1, Math.round(GMAP.WET / Cs));
    for (let i = 0; i < nx; i += st) for (let j = 0; j < nz; j += st) {
      if (bar[i * nz + j] === 2) continue;
      if (!wet(x0 + (i + st / 2) * Cs, z0 + (j + st / 2) * Cs)) continue;
      for (let a = i; a < Math.min(nx, i + st); a++) for (let b = j; b < Math.min(nz, j + st); b++) bar[a * nz + b] = 2;
    }
  }
  yield 'wet';
  // улицы: по каждому отрезку — диск полуширины + тротуар
  const X1 = x0 + nx * Cs, Z1 = z0 + nz * Cs;
  for (const r of roads) {
    if (!(r.c <= GMAP.BAR) || !r.p) continue;
    const hw = (r.w || 7) / 2 + GMAP.PAD, rc = Math.ceil(hw / Cs);
    for (let k = 1; k < r.p.length; k++) {
      const [ax, az] = r.p[k - 1], [bx, bz] = r.p[k];
      if (Math.max(ax, bx) < x0 - hw || Math.min(ax, bx) > X1 + hw || Math.max(az, bz) < z0 - hw || Math.min(az, bz) > Z1 + hw) continue;
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / (Cs * 0.5)));
      for (let q = 0; q <= n; q++) {
        const px = ax + (bx - ax) * q / n, pz = az + (bz - az) * q / n;
        const ci = Math.floor((px - x0) / Cs), cj = Math.floor((pz - z0) / Cs);
        for (let a = ci - rc; a <= ci + rc; a++) {
          if (a < 0 || a >= nx) continue;
          for (let b = cj - rc; b <= cj + rc; b++) {
            if (b < 0 || b >= nz) continue;
            const k2 = a * nz + b;
            if (bar[k2]) continue;
            if ((cx(a) - px) ** 2 + (cz(b) - pz) ** 2 <= hw * hw) bar[k2] = 1;
          }
        }
      }
    }
  }
  yield 'streets';
  // кварталы — заливкой (4 соседа)
  const lab = new Int32Array(N).fill(-1), blocks = [], stack = new Int32Array(N);
  for (let s = 0; s < N; s++) {
    if (bar[s] || lab[s] >= 0) continue;
    const id = blocks.length, B = { n: 0, sx: 0, sz: 0, bad: false };
    blocks.push(B);
    let top = 0; stack[top++] = s; lab[s] = id;
    while (top) {
      const k = stack[--top], i = (k / nz) | 0, j = k - i * nz;
      B.n++; B.sx += cx(i); B.sz += cz(j);
      if (i > 0) { const q = k - nz; if (!bar[q] && lab[q] < 0) { lab[q] = id; stack[top++] = q; } } else B.edge = 1;
      if (i < nx - 1) { const q = k + nz; if (!bar[q] && lab[q] < 0) { lab[q] = id; stack[top++] = q; } } else B.edge = 1;
      if (j > 0) { const q = k - 1; if (!bar[q] && lab[q] < 0) { lab[q] = id; stack[top++] = q; } }
      if (j < nz - 1) { const q = k + 1; if (!bar[q] && lab[q] < 0) { lab[q] = id; stack[top++] = q; } }
    }
  }
  yield 'blocks';
  // жилое рядом: клетка не дальше NEAR от дома или дворового проезда — поля, лес и вода за кварталом не в счёт
  const near = new Uint8Array(N), nr = Math.ceil(GMAP.NEAR / Cs);
  const mark = (x, z) => {
    const ci = Math.floor((x - x0) / Cs), cj = Math.floor((z - z0) / Cs);
    if (ci < -nr || cj < -nr || ci >= nx + nr || cj >= nz + nr) return;
    for (let a = Math.max(0, ci - nr); a <= Math.min(nx - 1, ci + nr); a++) for (let b = Math.max(0, cj - nr); b <= Math.min(nz - 1, cj + nr); b++) near[a * nz + b] = 1;
  };
  for (const r of roads) { if (!r.p || !(r.c <= 7)) continue; for (let k = 1; k < r.p.length; k++) { const [ax, az] = r.p[k - 1], [bx, bz] = r.p[k]; if (Math.max(ax, bx) < x0 - 60 || Math.min(ax, bx) > X1 + 60 || Math.max(az, bz) < z0 - 60 || Math.min(az, bz) > Z1 + 60) continue; const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 20)); for (let q = 0; q <= n; q++) mark(ax + (bx - ax) * q / n, az + (bz - az) * q / n); } }
  for (const b of o.houses || []) { if (b.p[0][0] < x0 - 200 || b.p[0][0] > X1 + 200 || b.p[0][1] < z0 - 200 || b.p[0][1] > Z1 + 200) continue; for (const q of b.p) mark(q[0], q[1]); }
  // у пиццерий бандитов нет: квартал, чья середина ближе PIZZA_R, или хоть одна клетка ближе PIZZA_R / 2 — не район
  const PR = GMAP.PIZZA_R;
  for (const p of pizzas || []) {
    for (const B of blocks) if ((B.sx / B.n - p[0]) ** 2 + (B.sz / B.n - p[1]) ** 2 < PR * PR) B.bad = true;
    const r2 = PR / 2;
    for (let i = Math.max(0, Math.floor((p[0] - r2 - x0) / Cs)); i <= Math.min(nx - 1, Math.floor((p[0] + r2 - x0) / Cs)); i++)
      for (let j = Math.max(0, Math.floor((p[1] - r2 - z0) / Cs)); j <= Math.min(nz - 1, Math.floor((p[1] + r2 - z0) / Cs)); j++) {
        const l = lab[i * nz + j];
        if (l >= 0 && (cx(i) - p[0]) ** 2 + (cz(j) - p[1]) ** 2 < r2 * r2) blocks[l].bad = true;
      }
  }
  // квартал в районе: середина ближе R × жребий или большая часть его клеток ближе R; dn — доля R (донат сжимает к середине)
  for (let k = 0; k < N; k++) { const l = lab[k]; if (l < 0) continue; const i = (k / nz) | 0, j = k - i * nz; if ((cx(i) - g.x) ** 2 + (cz(j) - g.z) ** 2 < R * R) blocks[l].nin = (blocks[l].nin || 0) + 1; }
  for (const B of blocks) {
    const mx = B.sx / B.n, mz = B.sz / B.n, e = GMAP.EDGE[0] + (GMAP.EDGE[1] - GMAP.EDGE[0]) * bhash(Math.round(mx), Math.round(mz));
    B.dn = Math.min(0.999, Math.hypot(mx - g.x, mz - g.z) / (R * e));
    B.in = !B.bad && B.n >= 3 && (Math.hypot(mx - g.x, mz - g.z) < R * e || (B.nin || 0) > B.n * 0.5);
  }
  // v: 0 — не район, 1…250 — доля R середины квартала (для доната)
  const v = new Uint8Array(N);
  for (let k = 0; k < N; k++) { const l = lab[k]; if (l >= 0 && blocks[l].in && near[k]) v[k] = 1 + Math.min(249, Math.round(blocks[l].dn * 249)); }
  // улицы между кварталами района — тоже район: клетка улицы берёт долю ближайших кварталов района
  const W = 3, v2 = v.slice();
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const k = i * nz + j;
    if (bar[k] !== 1 || !near[k]) continue;
    let nin = 0, nout = 0, best = 255;
    for (let a = Math.max(0, i - W); a <= Math.min(nx - 1, i + W); a++) for (let b = Math.max(0, j - W); b <= Math.min(nz - 1, j + W); b++) {
      const q = a * nz + b;
      if (bar[q] === 1) continue;
      if (v[q]) { nin++; if (v[q] < best) best = v[q]; } else nout++;
    }
    if (nin && nin >= nout * GMAP.ROAD_IN) v2[k] = best;
  }
  let cells = 0, far = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) if (v2[i * nz + j]) { cells++; far = Math.max(far, Math.hypot(cx(i) - g.x, cz(j) - g.z)); }
  return { x: g.x, z: g.z, R, x0, z0, nx, nz, C: Cs, v: v2, cells, area: cells * Cs * Cs, far: far + Cs, blocks: blocks.filter(b => b.in).length };
}

export function buildZone (g, o) {
  const it = zoneSteps(g, o);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}

/* маска всех районов — один раз: шагами — кусок поздней сборки game.js 'gangmap' (prepSteps), или разом при первом
   вопросе (prep), если спросили раньше */
export function prep (api) {
  if (MASK) return MASK;
  const it = prepSteps(api);
  for (;;) { if (it.next().done) return MASK; }
}
export function* prepSteps (api) {
  if (api) A = Object.assign(A || {}, api);
  if (MASK || !A || !A.CITY || !A.MAP) return MASK;
  const G = (A.MAP.career && A.MAP.career.gang) || [];
  let ms = 0, t0 = performance.now();
  const D = A.MAP.career && A.MAP.career.districts;
  const o = {
    roads: A.CITY.roads || [],
    houses: A.CITY.buildings || [],
    distAt: D && D.at ? D.at : null,
    pizzas: D && D.list ? D.list.map(d => d.pizza).filter(Boolean) : [],
    wet: A.groundH ? (x, z) => A.groundH(x, z) < 0 : null,
  };
  const out = [];
  for (const g of G) {
    const it = zoneSteps(g, o);
    for (;;) {
      const r = it.next();
      if (r.done) { out.push(r.value); break; }
      const dt = performance.now() - t0; ms += dt; MSTAT.steps = (MSTAT.steps || 0) + 1; MSTAT.max = Math.max(MSTAT.max || 0, Math.round(dt));
      yield 'gang-' + r.value;
      if (MASK) return MASK;                     // пока ждали шаг, маску уже собрали разом (prep)
      t0 = performance.now();
    }
  }
  MASK = out;
  MSTAT.ms = Math.round(ms + performance.now() - t0);
  MSTAT.zones = MASK.map(m => ({ x: m.x, z: m.z, R: m.R, km2: Math.round(m.area / 1e4) / 100, blocks: m.blocks, far: Math.round(m.far) }));
  return MASK;
}
export const gangMask = () => prep() || [];

const inR = (x, z, c) => (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r;
const donP = () => (A && A.donated ? A.donated('gang') : 0);

/* значение клетки маски в точке (0 — не район); m — зона */
export function cellV (m, x, z) {
  const i = Math.floor((x - m.x0) / m.C), j = Math.floor((z - m.z0) / m.C);
  if (i < 0 || j < 0 || i >= m.nx || j >= m.nz) return 0;
  return m.v[i * m.nz + j];
}
/* порог доната: квартал остаётся, пока доля R его середины меньше 1 − p */
export const gangCut = () => 1 + Math.round((1 - donP()) * 249);
export function inGang (x, z) {
  const M = gangMask();
  if (!M.length) return false;
  const cut = gangCut();
  if (cut <= 1) return false;
  for (const m of M) { const v = cellV(m, x, z); if (v && v < cut) return true; }
  return false;
}

/* без доната — кварталы как построены (вид района: мусор, граффити, сгоревшие машины — gangland.js, junk.js, world.js) */
export function inMask (x, z) {
  if (LOOK_OFF) return false;
  for (const m of gangMask()) if (cellV(m, x, z)) return true;
  return false;
}

/* в каких районах карьеры (districts) есть кварталы бандитов: at(x, z) → номер района. Один раз (по каждой 3-й клетке) */
let GDIST = null;
export function gangDistricts (at) {
  if (GDIST) return GDIST;
  const M = gangMask();
  if (!M.length || !at) return new Set();
  GDIST = new Set();
  for (const m of M) for (let i = 0; i < m.nx; i += 3) for (let j = 0; j < m.nz; j += 3) if (m.v[i * m.nz + j]) GDIST.add(at(m.x0 + (i + 0.5) * m.C, m.z0 + (j + 0.5) * m.C));
  return GDIST;
}

export function gangZones () {
  const G = (A && A.MAP && A.MAP.career && A.MAP.career.gang) || [];
  const p = donP(), M = MASK;
  return G.map((g, i) => ({ x: g.x, z: g.z, r: (M && M[i] ? M[i].far : (g.r || GANG.ZONE_R)) * (1 - p) })).filter(g => g.r > 20);
}

export function zoneAt (x, z) {
  if (!A || !A.CITY) return 'normal';
  const car = A.MAP.career || {};
  if (inGang(x, z)) return 'gang';
  if (car.rich && inR(x, z, car.rich)) return 'rich';
  const c = CELL.get(Math.floor(x / C) + ',' + Math.floor(z / C));
  if (!c) return 'normal';
  let best = 'normal', n = 0;
  for (const k in c) if (c[k] > n) { n = c[k]; best = k; }
  return best;
}
