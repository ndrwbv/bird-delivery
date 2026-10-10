/* ──────────────────────────────────────────────────────────────────────────
   Навигатор во дворах: последние метры маршрута — не сквозь дома
   (правило словами — docs/CAREER.md «Путь на дороге»).

   Маршрут игры (game.js roadPath) идёт по улицам, но клиент часто ждёт во
   дворе, за домами. Раньше последний кусок был прямой от точки улицы до
   клиента — и резал дом. Теперь, если прямая режет дом, вокруг клиента
   (и вокруг машины, если она во дворе) строится сетка клеток 2 × 2 м:
     • стена — дом (контуры CITY.buildings, стройки и пустыри тоже), твёрдое
       (SOLIDS: будки, гаражи, деревья, перила), вода, фестиваль за блоками;
     • дороже всего — сбиваемые заборы и дворовые заборчики (×8 к шагу):
       через них — только если иначе никак;
     • газон — ×1,4, асфальт, тротуары, дорожки дворов и тропинки — ×1:
       линия держится проездов и дорожек, а газон срезает, если так короче.
   От клиента — кратчайший путь по клеткам (Дейкстра) до точек улиц рядом;
   ломаная по клеткам потом выпрямляется (прямая, если по клеткам не задевает
   стену и забор), каждый выпрямленный кусок ещё раз проверяется по контурам
   домов через 1 м.

   Переменных игры модуль не видит — всё приходит объектом api (game.js):
     init({ HOUSE_GRID, inHouse, solidAt, ARCHES, SOLID_GRID, SCELL, SMASH_GRID, SM_CELL,
            yardsEach, paveEach, groundH, festBlocks })   — inHouse: в доме, но не в арке; solidAt — твёрдое
     const J = job(slot, x, z, R, extra, goals)     — то же шагами: J.step(мс) → true, когда готово; J.result — F
     const F = field(slot, x, z, R, extra, goals)   — поле расстояний от (x, z) сразу:
       R — полуширина окна, м; goals — точки [x, z, ...] (улицы), extra — после
       первой достигнутой точки ищем ещё extra «метров»; slot — 0 клиент, 1 машина
     F.at(x, z)   — «метры» по клеткам от источника (Infinity — не дойти)
     F.path(x, z) — ломаная от (x, z) до источника (или null)
   ────────────────────────────────────────────────────────────────────────── */

export const RY = {
  OFF: false,       // отладка: true — по-старому, прямой (проверка «до/после»)
  CELL: 2,          // клетка, м
  FINE: 1,          // третий заход — клетка 1 м (узкая щель у самого старта), окно не больше ± FINE_R
  FINE_R: 130,
  RMAX: 240,        // окно — не больше ± этого от источника, м
  LAWN: 1.4,        // шаг по газону дороже асфальта и дорожки
  FENCE: 8,         // через забор — только если иначе никак
  SOLID_M: 1.0,     // запас вокруг твёрдого, м
  WATER: 0.3,       // ниже — вода
};
const W = [Infinity, 1, RY.LAWN, RY.FENCE];        // цена шага: 0 стена, 1 мощёное, 2 газон, 3 забор
const SQ2 = Math.SQRT2;

let A = null;
export function init (api) { A = api; }

/* ── окно сетки: n × n клеток, origin — левый нижний угол ── */
function makeSlot () {
  return { n: 0, ox: 0, oz: 0, sx: 0, sz: 0, K: null, CI: null, D: null, PR: null, src: -1, hk: new Float64Array(4096), hv: new Int32Array(4096), hn: 0, GM: null, C: 2, cpu: 0, rms: 0, stepMax: 0, cells: 0, ok: false, ver: 0 };
}
const SLOTS = [makeSlot(), makeSlot()];
SLOTS.forEach((S, i) => { S.id = i; });
export const STATS = { calls: 0, ms: 0, msMax: 0, cells: 0, steps: 0, stepMax: 0, pathMax: 0, ph: {}, last: null, log: null };   // log = [] — копить каждый вызов (проверка)

/* lo ≤ a·x + b ≤ hi → отрезок x (или всё / пусто) */
function lin (a, b, lo, hi, out) {
  if (Math.abs(a) < 1e-9) { if (b < lo || b > hi) { out[0] = 1; out[1] = 0; } else { out[0] = -Infinity; out[1] = Infinity; } return; }
  let u = (lo - b) / a, v = (hi - b) / a;
  if (u > v) { const t = u; u = v; v = t; }
  out[0] = u; out[1] = v;
}
const IA = [0, 0], IB = [0, 0];

/* клетки строки j, у которых середина x в [xl, xr]: fn(idx) */
function rowSpan (S, j, xl, xr, fn) {
  if (!(xr >= xl)) return;
  const C = S.C, n = S.n;
  let i0 = Math.ceil((xl - S.ox) / C - 0.5), i1 = Math.floor((xr - S.ox) / C - 0.5);
  if (i0 < 0) i0 = 0; if (i1 > n - 1) i1 = n - 1;
  for (let i = i0, k = j * n + i0; i <= i1; i++, k++) fn(k);
}
/* прямоугольник вдоль оси (cx, cz) ± hw по (cs, sn) и ± hd поперёк */
function markBox (S, cx, cz, cs, sn, hw, hd, fn) {
  const C = S.C, ex = Math.abs(cs) * hw + Math.abs(sn) * hd, ez = Math.abs(sn) * hw + Math.abs(cs) * hd;
  let j0 = Math.ceil((cz - ez - S.oz) / C - 0.5), j1 = Math.floor((cz + ez - S.oz) / C - 0.5);
  if (j0 < 0) j0 = 0; if (j1 > S.n - 1) j1 = S.n - 1;
  for (let j = j0; j <= j1; j++) {
    const z = S.oz + (j + 0.5) * C, dz = z - cz;
    lin(cs, dz * sn - cx * cs, -hw, hw, IA);          // вдоль:  (x−cx)·cs + dz·sn
    lin(-sn, cx * sn + dz * cs, -hd, hd, IB);         // поперёк: −(x−cx)·sn + dz·cs
    rowSpan(S, j, Math.max(IA[0], IB[0]), Math.min(IA[1], IB[1]), fn);
  }
}
/* капсула: отрезок a—b толщиной h в каждую сторону */
function markCapsule (S, ax, az, bx, bz, h, fn) {
  const L = Math.hypot(bx - ax, bz - az);
  if (L > 1e-3) markBox(S, (ax + bx) / 2, (az + bz) / 2, (bx - ax) / L, (bz - az) / L, L / 2, h, fn);
  markDisc(S, ax, az, h, fn); markDisc(S, bx, bz, h, fn);
}
function markDisc (S, x, z, r, fn) {
  const C = S.C;
  let j0 = Math.ceil((z - r - S.oz) / C - 0.5), j1 = Math.floor((z + r - S.oz) / C - 0.5);
  if (j0 < 0) j0 = 0; if (j1 > S.n - 1) j1 = S.n - 1;
  for (let j = j0; j <= j1; j++) {
    const dz = S.oz + (j + 0.5) * C - z, w = r * r - dz * dz;
    if (w >= 0) { const s = Math.sqrt(w); rowSpan(S, j, x - s, x + s, fn); }
  }
}

/* дом: углы клеток внутри контура (строками) и клетки с вершинами контура.
   Мягко (o = 0,5) — середины клеток внутри контура, без вершин: для щелей между домами в 3—4 м */
const XS = [];
function markHouse (S, p, o) {
  const C = S.C, n = S.n, CI = S.CI;
  let z0 = Infinity, z1 = -Infinity;
  for (const q of p) { if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1]; }
  let j0 = Math.ceil((z0 - S.oz) / C - o), j1 = Math.floor((z1 - S.oz) / C - o);
  if (j0 < 0) j0 = 0; if (j1 > n) j1 = n;
  for (let j = j0; j <= j1; j++) {
    const z = S.oz + (j + o) * C;
    XS.length = 0;
    for (let a = 0, b = p.length - 1; a < p.length; b = a++) {
      const P = p[a], Q = p[b];
      if ((P[1] > z) !== (Q[1] > z)) XS.push((Q[0] - P[0]) * (z - P[1]) / (Q[1] - P[1]) + P[0]);
    }
    if (XS.length < 2) continue;
    XS.sort((u, v) => u - v);
    for (let k = 0; k + 1 < XS.length; k += 2) {
      let i0 = Math.ceil((XS[k] - S.ox) / C - o), i1 = Math.floor((XS[k + 1] - S.ox) / C - o);
      if (i0 < 0) i0 = 0; if (i1 > n) i1 = n;
      for (let i = i0; i <= i1; i++) CI[j * (n + 1) + i] = 1;
    }
  }
  if (o) return;
  for (const q of p) {
    const i = Math.floor((q[0] - S.ox) / C), j = Math.floor((q[1] - S.oz) / C);
    if (i >= 0 && j >= 0 && i < n && j < n) S.K[j * n + i] = 0;
  }
}

/* сетка вокруг (x, z): цены клеток; шагами (yield) — job() растягивает на кадры */
function* raster (S, x, z, R, soft) {
  const C = S.C, n = Math.max(8, Math.ceil(2 * R / C)), N = n * n;
  S.n = n; S.ox = x - n * C / 2; S.oz = z - n * C / 2; S.sx = x; S.sz = z;
  if (!S.K || S.K.length < N) {
    S.K = new Uint8Array(N); S.D = new Float64Array(N); S.PR = new Int32Array(N); S.CI = new Uint8Array((n + 1) * (n + 1));
  }
  if (S.CI.length < (n + 1) * (n + 1)) S.CI = new Uint8Array((n + 1) * (n + 1));
  const K = S.K, CI = S.CI;
  const x0 = S.ox, z0 = S.oz, x1 = x0 + n * C, z1 = z0 + n * C;
  K.fill(2, 0, N);
  CI.fill(0, 0, (n + 1) * (n + 1));
  // мощёное: дороги, тротуары, дорожки дворов и тропинки
  const paved = k => { K[k] = 1; }, SEG = [];
  A.paveEach(x0, z0, x1, z1, (ax, az, bx, bz, h) => SEG.push(ax, az, bx, bz, h + 0.3));
  yield 'мощёное';
  for (let q = 0; q < SEG.length; q += 5) {
    markCapsule(S, SEG[q], SEG[q + 1], SEG[q + 2], SEG[q + 3], SEG[q + 4], paved);
    if (q % 200 === 195) yield 'мощёное';
  }
  yield 'мощёное';
  // вода (не на мощёном: мост). Рельеф плавный: проба через 8 м выше 1,5 м — воды в окне нет
  let wet = false;
  for (let zz = z0; zz <= z1 && !wet; zz += 8) for (let xx = x0; xx <= x1; xx += 8) if (A.groundH(xx, zz) < 1.5) { wet = true; break; }
  yield 'вода';
  if (wet) for (let j = 0, k = 0; j < n; j++) {
    const cz = z0 + (j + 0.5) * C;
    for (let i = 0; i < n; i++, k++) if (K[k] === 2 && A.groundH(x0 + (i + 0.5) * C, cz) < RY.WATER) K[k] = 0;
    if ((j & 31) === 31) yield 'вода';
  }
  yield 'вода';
  // заборы: сбиваемые (SMASH) и дворовые заборчики с лавочками (yards.js)
  const fence = k => { if (K[k]) K[k] = 3; };
  const SM = A.SM_CELL;
  for (let i = Math.floor(x0 / SM); i <= Math.floor(x1 / SM); i++) {
    for (let j = Math.floor(z0 / SM); j <= Math.floor(z1 / SM); j++)
      for (const it of A.SMASH_GRID.get(i + ',' + j) || []) {
        if (it.down || (it.kind !== 'fence' && it.kind !== 'bigfence')) continue;
        markDisc(S, it.x, it.z, Math.min(it.r, 1.3) + 0.3, fence);
      }
    if ((i & 3) === 3) yield 'заборы';
  }
  const YS = [];
  A.yardsEach(x0, z0, x1, z1, it => YS.push(it));
  for (let q = 0; q < YS.length; q++) {
    const it = YS[q];
    markCapsule(S, it.ax, it.az, it.bx, it.bz, (it.th || 0.1) + 0.4, fence);
    if ((q & 63) === 63) yield 'заборы';
  }
  yield 'заборы';
  // твёрдое: будки, гаражи, деревья (перила моста — не на земле)
  const wall = k => { K[k] = 0; };
  const SC = A.SCELL, seen = new Set();
  for (let i = Math.floor(x0 / SC); i <= Math.floor(x1 / SC); i++, yield 'твёрдое')
    for (let j = Math.floor(z0 / SC); j <= Math.floor(z1 / SC); j++)
      for (const s of A.SOLID_GRID.get(i + ',' + j) || []) {
        if (s.deckY !== undefined || seen.has(s)) continue;
        seen.add(s);
        markBox(S, s.cx, s.cz, s.cs, s.sn, s.hw + (soft ? 0.4 : RY.SOLID_M), s.hd + (soft ? 0.4 : RY.SOLID_M), wall);
      }
  yield 'твёрдое';
  // дома: углы клеток внутри контура → клетка — стена
  const hs = new Set();
  for (let i = Math.floor(x0 / 40); i <= Math.floor(x1 / 40); i++)
    for (let j = Math.floor(z0 / 40); j <= Math.floor(z1 / 40); j++)
      for (const b of A.HOUSE_GRID.get(i + ',' + j) || []) if (!hs.has(b)) { hs.add(b); markHouse(S, b.p, soft ? 0.5 : 0); if ((hs.size & 15) === 15) yield 'дома'; }
  yield 'дома';
  const n1 = n + 1;
  for (let j = 0, k = 0; j < n; j++)
    for (let i = 0; i < n; i++, k++) {
      const c = j * n1 + i;
      if (soft ? CI[c] : CI[c] || CI[c + 1] || CI[c + n1] || CI[c + n1 + 1]) K[k] = 0;
      if (i === n - 1 && (j & 31) === 31) yield 'углы';
    }
  yield 'углы';
  // арки — сквозной проезд во двор через дом (game.js archFor): середина тоннеля проезжая
  const open = k => { K[k] = 1; };
  for (const a of A.ARCHES) {
    if (a.x < x0 - 30 || a.x > x1 + 30 || a.z < z0 - 30 || a.z > z1 + 30) continue;
    markCapsule(S, a.mx - a.ix * 1.5, a.mz - a.iz * 1.5, a.mx + a.ix * (a.t + 1.5), a.mz + a.iz * (a.t + 1.5), 1.1, open);
  }
  yield 'арки';
  // фестиваль за блоками (festivals.js) — только когда он идёт
  if (A.festBlocks(x, z, 1e9)) {
    for (let j = 0, k = 0; j < n; j++) {
      const cz = z0 + (j + 0.5) * C;
      for (let i = 0; i < n; i++, k++) if (K[k] && A.festBlocks(x0 + (i + 0.5) * C, cz)) K[k] = 0;
      if ((j & 31) === 31) yield 'фестиваль';
    }
  }
}

const cellOf = (S, x, z) => {
  const i = Math.floor((x - S.ox) / S.C), j = Math.floor((z - S.oz) / S.C);
  return i < 0 || j < 0 || i >= S.n || j >= S.n ? -1 : j * S.n + i;
};
/* ближайшая не-стена в паре колец вокруг клетки */
function freeNear (S, k, rings = 2) {
  if (k < 0) return -1;
  if (S.K[k]) return k;
  const n = S.n, ci = k % n, cj = (k - ci) / n;
  let best = -1, bd = Infinity;
  for (let dj = -rings; dj <= rings; dj++)
    for (let di = -rings; di <= rings; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= n || j >= n || !S.K[j * n + i]) continue;
      const d = di * di + dj * dj;
      if (d < bd) { bd = d; best = j * n + i; }
    }
  return best;
}

function cornerOk (S, ui, uj, i, j) {
  const C = S.C, ax = S.ox + (ui + 0.5) * C, az = S.oz + (uj + 0.5) * C, bx = S.ox + (i + 0.5) * C, bz = S.oz + (j + 0.5) * C;
  for (let t = 0.2; t < 0.9; t += 0.2) {
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    if (A.inHouse(x, z) || A.solidAt(x, z)) return false;
  }
  return true;
}
/* куча на типизированных массивах (ключ — расстояние, значение — клетка); растёт вдвое */
function push (S, k, v) {
  if (S.hn === S.hk.length) {
    const K2 = new Float64Array(S.hk.length * 2), H2 = new Int32Array(S.hk.length * 2);
    K2.set(S.hk); H2.set(S.hv); S.hk = K2; S.hv = H2;
  }
  const K = S.hk, H = S.hv;
  let i = S.hn++;
  while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= k) break; K[i] = K[p]; H[i] = H[p]; i = p; }
  K[i] = k; H[i] = v;
}
function pop (S) {
  const K = S.hk, H = S.hv, v = H[0], n = --S.hn;
  S.top = K[0];
  if (n) {
    const k = K[n], w = H[n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && K[c + 1] < K[c]) c++;
      if (K[c] >= k) break;
      K[i] = K[c]; H[i] = H[c]; i = c;
    }
    K[i] = k; H[i] = w;
  }
  return v;
}

function* fieldGen (S, my, x, z, R, extra, goals) {
  R = Math.min(RY.RMAX, Math.max(20, R));
  let cells = 0;
  // сначала строго (клетка, задетая домом, — стена); до улицы не дошли — ещё раз мягко (щели между домами),
  // и ещё — мягко по клеткам 1 м в окне поменьше (щель в 2—3 м, где стоит сам клиент или машина)
  for (const [soft, C0, R0] of [[false, RY.CELL, R], [true, RY.CELL, R], [true, RY.FINE, Math.min(R, RY.FINE_R)]]) {
    const tr = performance.now();
    S.C = C0;
    yield* raster(S, x, z, R0, soft);
    S.rms = performance.now() - tr;
    const n = S.n, N = n * n, K = S.K, D = S.D, PR = S.PR, C = S.C;
    D.fill(Infinity, 0, N); PR.fill(-1, 0, N);
    yield 'обнулить';
    S.ok = false; S.soft = soft;
    const src = freeNear(S, cellOf(S, x, z), 3);
    S.src = src;
    S.hn = 0;
    cells = 0;
    let limit = Infinity;
    if (src >= 0) {
      // цели — клетки точек улиц: первая достигнутая ставит предел поиска
      if (!S.GM || S.GM.length < N) S.GM = new Uint8Array(N);
      const GM = S.GM;
      GM.fill(0, 0, N);
      if (goals) for (let g = 0; g + 1 < goals.length; g += 2) { const k = freeNear(S, cellOf(S, goals[g], goals[g + 1]), 1); if (k >= 0) GM[k] = 1; }
      yield 'цели';
      D[src] = 0; push(S, 0, src);
      while (S.hn) {
        const u = pop(S), du = S.top;
        if (du > D[u]) continue;                     // устаревшая запись
        if (du > limit) break;
        if ((++cells & 127) === 0) yield 'поиск';
        if (limit === Infinity && GM[u]) limit = du + extra;
        const ui = u % n, uj = (u - ui) / n, wu = W[K[u]];
        for (let m = 0; m < 8; m++) {
          const i = ui + DI[m], j = uj + DJ[m];
          if (i < 0 || j < 0 || i >= n || j >= n) continue;
          const v = j * n + i, kv = K[v];
          if (!kv) continue;
          // по диагонали — не срезая угол стены; мягко — можно, если сам отрезок не в доме и не в твёрдом
          // (диагональная щель в 2—3 м между рядами гаражей, домами наискосок: по клеткам 2 м она — цепочка углов)
          if (m >= 4 && (!K[uj * n + i] || !K[j * n + ui]) && !(soft && cornerOk(S, ui, uj, i, j))) continue;
          const nd = du + C * (wu + W[kv]) * 0.5 * (m >= 4 ? SQ2 : 1);
          if (nd < D[v]) { D[v] = nd; PR[v] = u; push(S, nd, v); }
        }
      }
      S.ok = true;
    }
    if (limit < Infinity || !goals || !goals.length) break;
  }
  const D = S.D;
  S.cells = cells;
  return {
    at: (px, pz) => { if (S.ver !== my) return Infinity; const k = freeNear(S, cellOf(S, px, pz), 1); return k < 0 ? Infinity : D[k]; },
    path: (px, pz) => (S.ver === my ? pathFrom(S, px, pz) : null),
    cells,
  };
}

/* поле расстояний шагами: step(мс) — считать не дольше стольких мс (по умолчанию — до конца), true — готово.
   Новая работа в том же слоте отменяет старую (её step вернёт false, path — null) */
const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1];
let ver = 0;
export function job (slot, x, z, R, extra, goals) {
  const S = SLOTS[slot], my = ++ver;
  S.ver = my; S.cpu = 0; S.stepMax = 0;
  const it = fieldGen(S, my, x, z, R, extra, goals);
  let res = null;
  return {
    get result () { return res; },
    step (budget = Infinity) {
      if (res) return true;
      if (S.ver !== my) return false;
      const t0 = performance.now();
      for (let t1 = t0; ;) {
        const r = it.next(), t2 = performance.now();
        if (r.done) { res = r.value; break; }
        if (r.value) STATS.ph[r.value] = Math.max(STATS.ph[r.value] || 0, t2 - t1);   // самый долгий кусок по шагам — подпись yield
        t1 = t2;
        if (t2 - t0 > budget) break;
      }
      const ms = performance.now() - t0;
      S.cpu += ms; S.stepMax = Math.max(S.stepMax, ms);
      if (budget < Infinity) { STATS.steps++; STATS.stepMax = Math.max(STATS.stepMax, ms); }
      if (res) {
        res.ms = S.cpu;
        STATS.last = { slot: S.id, ms: S.cpu, raster: S.rms, step: S.stepMax, n: S.n, cells: S.cells };
        if (STATS.log) STATS.log.push(STATS.last);
        STATS.calls++; STATS.ms += S.cpu; STATS.msMax = Math.max(STATS.msMax, S.cpu); STATS.cells = S.cells;
      }
      return !!res;
    },
  };
}
/* сразу, без растяжки по кадрам */
export function field (slot, x, z, R, extra, goals) {
  const j = job(slot, x, z, R, extra, goals);
  j.step();
  return j.result;
}

/* ── ломаная: по клеткам до источника, потом выпрямить ── */
function losFree (S, ax, az, bx, bz, maxW) {
  const L = Math.hypot(bx - ax, bz - az), m = Math.max(1, Math.ceil(L / 0.7));
  for (let s = 1; s < m; s++) {
    const k = cellOf(S, ax + (bx - ax) * s / m, az + (bz - az) * s / m);
    if (k < 0) return false;
    const c = S.K[k];
    if (!c || W[c] > maxW) return false;
  }
  return true;
}
function exactFree (ax, az, bx, bz) {
  const L = Math.hypot(bx - ax, bz - az);
  for (let d = 0.5; d < L; d += 1) { const t = d / L; if (A.inHouse(ax + (bx - ax) * t, az + (bz - az) * t)) return false; }
  return true;
}
function pathFrom (S, px, pz) {
  const t0 = performance.now(), r = pathRaw(S, px, pz);
  STATS.pathMax = Math.max(STATS.pathMax, performance.now() - t0);
  return r;
}
function pathRaw (S, px, pz) {
  if (!S.ok) return null;
  const k0 = freeNear(S, cellOf(S, px, pz), 1);
  if (k0 < 0 || S.D[k0] === Infinity) return null;
  const n = S.n, C = S.C, raw = [[px, pz]], wc = [];
  for (let k = k0; k !== -1; k = S.PR[k]) {
    const i = k % n, j = (k - i) / n;
    raw.push([S.ox + (i + 0.5) * C, S.oz + (j + 0.5) * C]);
    wc.push(W[S.K[k]]);
    if (raw.length > 4 * n) break;                     // защита от петли
  }
  raw.push([S.sx, S.sz]);
  wc.unshift(1); wc.push(1);
  // выпрямляем: от якоря — к самой дальней точке, до которой прямая не задевает стену и забор
  // (если сам путь по клеткам шёл через забор — там, где шёл, можно)
  const out = [raw[0]];
  let a = 0;
  while (a < raw.length - 1) {
    let b = a + 1;
    for (let c = a + 2; c < raw.length; c++) {
      if (!losFree(S, raw[a][0], raw[a][1], raw[c][0], raw[c][1], Math.max(RY.LAWN, wc[a], wc[c]))) break;
      b = c;
    }
    while (b > a + 1 && !exactFree(raw[a][0], raw[a][1], raw[b][0], raw[b][1])) b--;   // по контурам домов — ещё раз, через 1 м
    out.push(raw[b]);
    a = b;
  }
  return out;
}

export const DEBUG = { RY, STATS, SLOTS, field, job };
