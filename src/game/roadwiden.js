/* ──────────────────────────────────────────────────────────────────────────
   Полосы шире (docs/CAREER.md «Город: как выглядит» → «Полосы шире»; 17.10.2026, автор 16.10:
   «Дороги надо сделать чуть шире, я имею в виду полосы»).

   Ширину полотна считает выгрузка карты (r.w: по числу полос из OSM — 3,3 м на полосу, без него —
   по классу улицы; во дворах сужена до стен). Здесь, сразу после загрузки карты и до всего, что
   строится из улиц (мосты, рельеф, тротуары, бордюры, заборы, деревья, разметка, граф потока), полотно
   улиц (классы 0—5) становится в K раз шире. Число полос не меняется — шире каждая полоса; тротуар
   (2,75 м) и газон бульвара отодвигаются вместе с краем полотна. Проезды во дворы (класс 7) и
   пешеходки — как были.

   Где дома вплотную — поджимаем по месту: вдоль улицы через STEP м с каждой стороны смотрим, куда
   можно отодвинуть край:
     • край полотна (минус M_ROAD) — не в доме;
     • внешний край тротуара (минус M_WALK) — не в доме, если раньше там дома не было
       (тротуар, что и так упирался в стену, глубже под неё не считается);
     • край полотна не наезжает на полотно другой улицы, что идёт рядом (две половины проспекта,
       соседняя улица вдоль): между ними остаётся не меньше GAP м (где полотна и так сливались —
       слияние, съезд — не мешает).
   Допустимый множитель — у каждой точки проверки свой (с шагом QUANT от K вниз до прежней ширины);
   промежуток между соседними — меньший из двух. Где он меняется, улица режется на куски (в точке
   проверки со свободной стороны — поджатый кусок захватывает и её) (новые — в конец
   CITY.roads, той же улицей: имя, класс, полосы; вид асфальта и плитки — по середине прежней, r.m0);
   кусок короче MIN_PIECE м или почти той же ширины (разница < SMOOTH м) сливается с соседом — ширина
   меньшая. На стыке широкого куска с узким — воронка roadends.js. Стык двух улиц без перекрёстка
   (в узле концы двух, больше никого): разница ширины меньше SMOOTH м — обоим меньшая.
   Мост — как улицы у его концов (самая узкая из них того же класса), иначе K.

   r.w0 — прежняя ширина: по ней считаются число полос и «узкая» (narrow.js), чтобы поток ездил,
   как ездил, только просторнее. ?nowiden — как было.

   отладка: __dlv.WIDEN — STATS (сколько улиц, поджато, средняя ширина полосы до/после, мс).
   ────────────────────────────────────────────────────────────────────────── */

export const WIDEN = {
  K: 1.2,          // во сколько раз шире полотно улиц
  MAX_C: 5,        // классы 0…MAX_C (трасса … тихая улица); 6 — пешеходка, 7 — проезд во двор
  STEP: 2.5,       // м: шаг проверки вдоль улицы
  END: 2,          // м: у самых концов куска не проверяем (там узел)
  WALK: 2.75,      // м: тротуар у улиц (как game.js SIDEWALK, pave.js WALK)
  M_ROAD: 0.3,     // м: край полотна от стены
  M_WALK: 0.2,     // м: край тротуара от стены
  GAP: 0.5,        // м: между полотнами соседних улиц
  NEAR_NODE: 25,   // м: у общего узла с соседней улицей её полотно не мешает (перекрёсток)
  QUANT: 0.05,     // шаг множителя
  MIN_PIECE: 20,   // м: кусок улицы с другой шириной — не короче
  SMOOTH: 1.0,     // м: на стыке кусков одной улицы разница меньше — обоим меньшая
  CELL: 40,
};

export const STATS = { roads: 0, full: 0, pinched: 0, none: 0, lenAll: 0, lenPinched: 0, laneBefore: 0, laneAfter: 0, bridges: 0, split: 0, lenNone: 0, ms: 0, off: false, why: {} };

const inPoly = (x, z, p) => {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
};
const segDist = (x, z, x1, z1, x2, z2) => {
  const dx = x2 - x1, dz = z2 - z1, L2 = dx * dx + dz * dz;
  let t = L2 > 0 ? ((x - x1) * dx + (z - z1) * dz) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(x - x1 - dx * t, z - z1 - dz * t);
};
const lanesOf = r => r.l ? r.l : (r.o ? Math.max(1, Math.round(r.w / 3.3)) : (r.w < 7 ? 1 : r.w >= 12.5 ? 4 : 2));

export function widen (CITY, opt = {}) {
  const t0 = performance.now();
  const W = WIDEN, C = W.CELL, roads = CITY.roads || [];
  Object.assign(STATS, { roads: 0, full: 0, pinched: 0, none: 0, lenAll: 0, lenPinched: 0, laneBefore: 0, laneAfter: 0, bridges: 0, split: 0, lenNone: 0, off: !!opt.off, why: {} });
  for (const r of roads) if (r.w0 === undefined) r.w0 = r.w;
  if (opt.off) return STATS;
  const cand = r => r.c <= W.MAX_C && r.c !== 6 && r.w > 0 && r.p && r.p.length > 1;

  // дома по клеткам
  const HG = new Map();
  for (const b of CITY.buildings || []) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const q of b.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    const o = { p: b.p, x0, z0, x1, z1 };
    for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++)
      for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) {
        const k = i + ',' + j; let a = HG.get(k); if (!a) HG.set(k, a = []); a.push(o);
      }
  }
  const inH = (x, z) => {
    const a = HG.get(Math.floor(x / C) + ',' + Math.floor(z / C));
    if (!a) return false;
    for (const o of a) if (x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1 && inPoly(x, z, o.p)) return true;
    return false;
  };
  // куски улиц по клеткам — для соседних полотен
  const SG = new Map();
  roads.forEach((r, ri) => {
    if (!cand(r) && r.c !== 7) return;
    for (let i = 1; i < r.p.length; i++) {
      const [x1, z1] = r.p[i - 1], [x2, z2] = r.p[i];
      const s = { ri, x1, z1, x2, z2 };
      for (let a = Math.floor(Math.min(x1, x2) / C) - 1; a <= Math.floor(Math.max(x1, x2) / C) + 1; a++)
        for (let b = Math.floor(Math.min(z1, z2) / C) - 1; b <= Math.floor(Math.max(z1, z2) / C) + 1; b++) {
          const k = a + ',' + b; let l = SG.get(k); if (!l) SG.set(k, l = []); l.push(s);
        }
    }
  });
  const hwT = r => (cand(r) ? r.w0 * W.K : r.w0) / 2;     // полуширина соседа — с запасом, как будто его уже расширили
  const nodesOf = new Map();                              // узел 'x,z' → улицы
  roads.forEach((r, ri) => { for (const q of r.p) { const k = q[0] + ',' + q[1]; let a = nodesOf.get(k); if (!a) nodesOf.set(k, a = new Set()); a.add(ri); } });
  const shared = (ri, rj) => {
    const out = [];
    for (const q of roads[ri].p) { const s = nodesOf.get(q[0] + ',' + q[1]); if (s && s.has(rj)) out.push(q); }
    return out;
  };
  // насколько точка (x, z) внутри полотна соседей (> 0 — внутри): максимум по соседям, кроме тех, с кем общий узел ближе NEAR_NODE
  const intoOthers = (ri, x, z, cx, cz, shCache) => {
    const a = SG.get(Math.floor(x / C) + ',' + Math.floor(z / C));
    if (!a) return -Infinity;
    let best = -Infinity;
    for (const s of a) {
      if (s.ri === ri) continue;
      let sh = shCache.get(s.ri);
      if (sh === undefined) shCache.set(s.ri, sh = shared(ri, s.ri));
      if (sh.some(q => Math.hypot(q[0] - cx, q[1] - cz) < W.NEAR_NODE)) continue;
      const v = hwT(roads[s.ri]) + W.GAP - segDist(x, z, s.x1, s.z1, s.x2, s.z2);
      if (v > best) best = v;
    }
    return best;
  };

  // вдоль улицы — «станции»: её точки и точки проверки через STEP м; у точки проверки — допустимый множитель
  const RUNS = new Map();                                 // улица → [{ pts, k, L }] — куски с множителем k
  const r2 = v => Math.round(v * 100) / 100;
  const sumL = (p, a, b) => { let L = 0; for (let i = a; i < b; i++) L += Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]); return L; };
  roads.forEach((r, ri) => {
    if (!cand(r) || r.b) return;
    const hw0 = r.w0 / 2, walk = W.WALK + (r.g || 0), shCache = new Map(), p = r.p;
    let Ltot = 0;
    for (let i = 1; i < p.length; i++) Ltot += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    // допустимый множитель в точке (cx, cz) с нормалью (nx, nz): с обеих сторон, от k0 вниз
    const testAt = (cx, cz, nx, nz, k0) => {
      let k = k0;
      for (const sd of [1, -1]) {
        const at = o => [cx + nx * o * sd, cz + nz * o * sd];
        let why = '', wallOld, othOld;
        const ok = kk => {
          const hw = hw0 * kk;
          if (inH(...at(hw - W.M_ROAD))) { why = 'house'; return false; }
          if (wallOld === undefined) wallOld = inH(...at(hw0 + walk - W.M_WALK));
          if (!wallOld && inH(...at(hw + walk - W.M_WALK))) { why = 'walk'; return false; }
          const o = intoOthers(ri, ...at(hw), cx, cz, shCache);
          if (o > 0) {
            if (othOld === undefined) othOld = intoOthers(ri, ...at(hw0), cx, cz, shCache);
            if (othOld <= 0) { why = 'road'; return false; }
          }
          return true;
        };
        while (k > 1 && !ok(k)) { k = Math.max(1, Math.round((k - W.QUANT) * 100) / 100); STATS.why[why] = (STATS.why[why] || 0) + 1; if (opt.spots && k <= 1) opt.spots.push([Math.round(cx), Math.round(cz), why, ri]); }
      }
      return k;
    };
    const st = [{ s: 0, q: p[0], v: true, k: null }];
    let s0 = 0;
    for (let i = 1; i < p.length; i++) {
      const [x1, z1] = p[i - 1], [x2, z2] = p[i], L = Math.hypot(x2 - x1, z2 - z1);
      if (L >= 0.1) {
        const ux = (x2 - x1) / L, uz = (z2 - z1) / L, nx = -uz, nz = ux;
        // точки проверки: через STEP м и напротив каждого угла дома у края ±1 м (острый угол между ними не проскочит)
        // точки проверки через STEP м; и напротив каждого угла дома у края — там допустимое считается прямо
        // по углу (ближе всего дом к оси улицы — в своём углу, острый угол между точками не проскочит):
        // край полотна − M_ROAD не дальше угла, внешний край тротуара − M_WALK не дальше угла (если раньше был ближе)
        const ds = [];
        for (let d = (W.STEP - (s0 % W.STEP)) % W.STEP; d <= L; d += W.STEP) ds.push({ d, k: null });
        const band = hw0 * W.K + walk + 0.5, seen = new Set(), qk = v => Math.max(1, Math.min(W.K, Math.floor(v / W.QUANT + 1e-6) * W.QUANT));
        for (let a = Math.floor((Math.min(x1, x2) - band) / C); a <= Math.floor((Math.max(x1, x2) + band) / C); a++)
          for (let b = Math.floor((Math.min(z1, z2) - band) / C); b <= Math.floor((Math.max(z1, z2) + band) / C); b++)
            for (const h of HG.get(a + ',' + b) || []) {
              if (seen.has(h)) continue;
              seen.add(h);
              for (const q of h.p) {
                const d = (q[0] - x1) * ux + (q[1] - z1) * uz, lat = Math.abs((q[0] - x1) * nx + (q[1] - z1) * nz);
                if (lat >= band || d <= 0.05 || d >= L - 0.05) continue;
                let k = W.K;
                if (lat > hw0 - W.M_ROAD) k = Math.min(k, qk((lat + W.M_ROAD) / hw0)); else k = 1;
                if (lat > hw0 + walk - W.M_WALK) k = Math.min(k, qk((lat - walk + W.M_WALK) / hw0));
                if (k < W.K) { ds.push({ d, k }); STATS.why.corner = (STATS.why.corner || 0) + 1; }
              }
            }
        ds.sort((a, b) => a.d - b.d);
        for (const { d, k: kc } of ds) {
          const s = s0 + d;
          if (kc === null && (s < W.END || s > Ltot - W.END)) continue;     // у концов — только углы домов
          const cx = x1 + ux * d, cz = z1 + uz * d;
          const k = kc !== null ? kc : testAt(cx, cz, nx, nz, W.K);
          const last = st[st.length - 1];
          if (d < 0.05) last.k = Math.min(last.k ?? W.K, k);                       // проверка в самой точке улицы
          else if (d > L - 0.05) st.push({ s: s0 + L, q: p[i], v: true, k });
          else if (!last.v && Math.abs(last.s - s) < 0.02) last.k = Math.min(last.k, k);
          else st.push({ s, q: [r2(cx), r2(cz)], v: false, k });
        }
      }
      if (st[st.length - 1].q !== p[i]) st.push({ s: s0 + L, q: p[i], v: true, k: null });
      s0 += L;
    }
    // излом улицы: снаружи угла край отходит дальше — проверяем и по нормалям обоих кусков, и по биссектрисе
    for (let j = 1, vi = 0; j < st.length - 1; j++) {
      const o = st[j];
      if (!o.v) continue;
      vi = p.indexOf(o.q);
      if (vi <= 0 || vi >= p.length - 1 || o.s < W.END || o.s > Ltot - W.END) continue;
      const [ax, az] = p[vi - 1], [bx, bz] = p[vi], [cx2, cz2] = p[vi + 1];
      const l1 = Math.hypot(bx - ax, bz - az) || 1, l2 = Math.hypot(cx2 - bx, cz2 - bz) || 1;
      const n1 = [-(bz - az) / l1, (bx - ax) / l1], n2 = [-(cz2 - bz) / l2, (cx2 - bx) / l2];
      const nb = [n1[0] + n2[0], n1[1] + n2[1]], lb = Math.hypot(nb[0], nb[1]) || 1;
      let k = o.k ?? W.K;
      for (const [nx, nz] of [n1, n2, [nb[0] / lb, nb[1] / lb]]) k = testAt(bx, bz, nx, nz, k);
      o.k = k;
    }
    // промежуток между соседними станциями — меньший из ближайших проверок слева и справа
    const n = st.length, left = new Array(n), right = new Array(n);
    for (let j = 0, cur = null; j < n; j++) { if (st[j].k !== null) cur = st[j].k; left[j] = cur; }
    for (let j = n - 1, cur = null; j >= 0; j--) { if (st[j].k !== null) cur = st[j].k; right[j] = cur; }
    const kI = [], LI = [];
    for (let j = 0; j < n - 1; j++) {
      const a = left[j] ?? right[j], b = right[j + 1] ?? left[j + 1];
      kI.push(Math.min(a ?? W.K, b ?? W.K)); LI.push(st[j + 1].s - st[j].s);
    }
    const mkRuns = () => {
      const out = [];
      kI.forEach((k, j) => { const last = out[out.length - 1]; if (last && last.k === k) { last.b = j + 1; last.L += LI[j]; } else out.push({ a: j, b: j + 1, k, L: LI[j] }); });
      return out;
    };
    let runs = mkRuns();
    // короткий кусок (< MIN_PIECE м): шире соседа — берёт ширину соседа (ближайшую меньшую); уже обоих
    // соседей — растёт в их сторону до MIN_PIECE м (соседи укорачиваются, но не сужаются целиком)
    for (let it = 0; it < 2000 && runs.length > 1; it++) {
      let j = -1;
      for (let i = 0; i < runs.length; i++) if (runs[i].L < W.MIN_PIECE && (j < 0 || runs[i].L < runs[j].L)) j = i;
      if (j < 0) break;
      const R = runs[j], P = runs[j - 1], N = runs[j + 1];
      const lower = [P, N].filter(o => o && o.k <= R.k);
      if (lower.length) {
        const k = Math.max(...lower.map(o => o.k));
        for (let i = R.a; i < R.b; i++) kI[i] = k;
      } else {
        let a = R.a, b = R.b, L = R.L, side = (P ? P.L : 0) >= (N ? N.L : 0) ? -1 : 1;
        while (L < W.MIN_PIECE && (a > 0 || b < kI.length)) {
          if ((side < 0 && a > 0) || b >= kI.length) { a--; L += LI[a]; kI[a] = R.k; } else { kI[b] = R.k; L += LI[b]; b++; }
          side = -side;
        }
      }
      runs = mkRuns();
    }
    // соседние куски почти той же ширины (разница < SMOOTH м) — один кусок, ширина меньшая
    for (let it = 0; it < 200 && runs.length > 1; it++) {
      let j = -1, bestD = Infinity;
      for (let i = 0; i < runs.length - 1; i++) { const dw = Math.abs(runs[i].k - runs[i + 1].k) * r.w0; if (dw < W.SMOOTH && dw < bestD) { bestD = dw; j = i; } }
      if (j < 0) break;
      const A = runs[j], B = runs[j + 1];
      runs.splice(j, 2, { a: A.a, b: B.b, k: Math.min(A.k, B.k), L: A.L + B.L });
    }
    // точки куска: точки улицы внутри и станции на стыках
    RUNS.set(ri, runs.map(q => ({ k: q.k, L: q.L, pts: st.slice(q.a, q.b + 1).filter((o, i, A) => o.v || i === 0 || i === A.length - 1).map(o => o.q) })));
  });

  // режем улицы по кускам: первый кусок — на месте улицы, остальные — новыми улицами в конец списка
  // (вид асфальта и плитки — по середине прежней улицы: r.m0, roadwear.js / world.js)
  const K = new Map();                                    // улица (объект) → множитель
  const n0 = roads.length;
  for (let ri = 0; ri < n0; ri++) {
    const runs = RUNS.get(ri);
    if (!runs) continue;
    const r = roads[ri];
    if (runs.length === 1) { K.set(r, runs[0].k); continue; }
    const m0 = r.p[(r.p.length / 2) | 0];
    runs.forEach((q, i) => {
      if (i === 0) { r.p = q.pts; r.m0 = m0; K.set(r, q.k); return; }
      const nr = { ...r, p: q.pts, m0 };
      roads.push(nr); K.set(nr, q.k);
      STATS.split++;
    });
  }

  // стык двух улиц без перекрёстка (в узле концы двух, больше никого): разница ширины меньше SMOOTH м — обоим меньшая
  const nodesNow = new Map(), ends = new Map();
  for (const r of roads) {
    r.p.forEach((q, i) => {
      const kq = q[0] + ',' + q[1];
      nodesNow.set(kq, (nodesNow.get(kq) || 0) + 1);
      if (K.has(r) && (i === 0 || i === r.p.length - 1)) { let a = ends.get(kq); if (!a) ends.set(kq, a = []); a.push(r); }
    });
  }
  for (let it = 0; it < 8; it++) {
    let ch = 0;
    for (const [kq, a] of ends) {
      if (a.length !== 2 || nodesNow.get(kq) !== 2) continue;
      const [A, B] = a;
      if (A.w0 !== B.w0 || A.c !== B.c || K.get(A) === K.get(B)) continue;
      if (Math.abs(K.get(A) - K.get(B)) * A.w0 < W.SMOOTH) { const m = Math.min(K.get(A), K.get(B)); K.set(A, m); K.set(B, m); ch++; }
    }
    if (!ch) break;
  }

  // мосты — как улицы у концов (той же ширины и класса — самая узкая из них), иначе K
  for (const r of roads) {
    if (!cand(r) || !r.b) continue;
    let k = Infinity;
    for (const q of [r.p[0], r.p[r.p.length - 1]])
      for (const o of ends.get(q[0] + ',' + q[1]) || []) if (o !== r && o.c === r.c && !o.b) k = Math.min(k, K.get(o));
    K.set(r, k === Infinity ? W.K : k);
    STATS.bridges++;
  }

  for (const [r, k] of K) {
    const L = sumL(r.p, 0, r.p.length - 1);
    r.w = Math.round(r.w0 * k * 10) / 10;
    const n = lanesOf({ ...r, w: r.w0 });
    STATS.roads++; STATS.lenAll += L;
    if (k >= W.K - 1e-6) STATS.full++; else if (k <= 1 + 1e-6) { STATS.none++; STATS.lenNone += L; STATS.lenPinched += L; } else { STATS.pinched++; STATS.lenPinched += L; }
    STATS.laneBefore += L * r.w0 / n; STATS.laneAfter += L * r.w / n;
  }
  if (STATS.lenAll) { STATS.laneBefore = +(STATS.laneBefore / STATS.lenAll).toFixed(2); STATS.laneAfter = +(STATS.laneAfter / STATS.lenAll).toFixed(2); }
  STATS.lenAll = Math.round(STATS.lenAll); STATS.lenPinched = Math.round(STATS.lenPinched); STATS.lenNone = Math.round(STATS.lenNone);
  STATS.ms = Math.round(performance.now() - t0);
  return STATS;
}

/* ширина, по которой считаются полосы и «узкая»: прежняя (до расширения) */
export const laneW = e => (e && e.w0) || (e && e.w) || 0;
