/* ──────────────────────────────────────────────────────────────────────────
   Плавные улицы (задача 11ч, docs/plan/smooth-roads.md): изломы улиц — дугой.

   Улица из карты — ломаная: выгрузка упрощает линии до метра, и на поворотах улица идёт углом (полотно —
   лента от точки до точки и круглое пятно в точке, бордюр — углом). Здесь, сразу после ровных малых кругов
   (rings.js roundOff) и до всего, что строится из улиц (fixMap, рельеф, граф, полотно, бордюры, поток), излом
   внутри цепочки — точка, где сходятся ровно две улицы-ветки (внутри одной улицы или стык двух кусков одной
   улицы), — заменяется дугой окружности:
     • радиус оси — по классу улицы (SM.CLS: R), но срез угла (от вершины до дуги) не больше CUT м — данные
       выгрузки (сужения, бульвары, КПП, остановки, переходы) остаются верными;
     • излом от MIN_DEG до MAX_DEG градусов; круче — не трогаем (угол остаётся углом);
     • шаг дуги ≤ STEP_DEG градусов на точку и хорда ≥ CHORD м; координаты — с шагом 0,01 м;
     • касание дуги не дальше, чем позволяет кусок: половина куска, если на другом его конце тоже излом;
       до перекрёстка — его запретная зона; до тупика — END м;
     • без дуги: у перекрёстка (узел, где сходятся три ветки и больше) ближе maxW/2 + JUNC м (maxW — самая
       широкая улица узла; у проездов и пешеходок — maxW/2 + JUNC7 м); ближе STOP м к остановке; ближе MARK м
       к переходу, переезду, КПП, воротам, закрытому проезду; ближе SIG м к светофору (светофор посреди улицы
       цепляется к ближайшему узлу графа — новые точки рядом его бы сдвинули);
     • дома: по дуге через SAMPLE м край полотна (−M_ROAD) и внешний край тротуара (−M_WALK) — не в доме, если
       раньше там асфальта (тротуара) не было; иначе радиус ×HOUSE_K и снова, до наименьшего (внутренний
       край полотна на дуге — не меньше MIN_IN м радиусом, у проездов и пешеходок внутренний край плитки — не меньше
       MIN_IN7 м), потом — не скругляем;
     • соседи: край полотна на дуге не заходит на полотно другой улицы (+GAP м), с которой нет общего узла
       ближе NEAR_NODE м, если раньше там нашего полотна не было — так же, радиус ×HOUSE_K;
     • не трогаем: узлы перекрёстков, концы, мосты (и стыки с мостом), улицы кругов (rings.js — замкнутые
       цепочки односторонних) и изломы ближе CIRCLE_ZONE м к краю малого круга, стыки разных по виду кусков
       (класс, ширина, полосы, бульвар, направление).
   Новых улиц и узлов перекрёстков не появляется; граф (game.js NODES) получает точки дуги — узлы с двумя
   рёбрами. Случайности здесь нет, порядок обхода фиксированный (улицы по номеру, точки по порядку): город
   одинаков от запуска к запуску.

   Подключение (game.js): smooth(CITY, { on, circles }) — сразу после RINGM.roundOff; с 24.10.2026 (этап 5) — по умолчанию,
   ?oldroads — on: false, ничего не меняет (старые улицы углом, бит в бит прежний город).
   isArc(x, z) — точка оси (x, z) — точка дуги (для полотна, тротуара, бордюров и разметки: края кусков «в ус», без пятна);
   arcOf(x, z) — номер дуги у точки (ARCS), у дуги corner — прежний угол (касание, вершина, касание): «лицевая» стена дома и
   стена подъездов выбираются по улицам как до дуг (game.js nearestRoad0), фасады угловых домов не поворачиваются.
   r.mid0 — средний кусок улицы до дуг [точка до, точка]: выбор «по середине» (заплатки, подпись на карте) — как без дуг.
   отладка: __dlv.SMOOTH — SM, STATS (найдено, скруглено по классам, пропущено по причинам, добавлено точек,
   наибольший срез, мс), ARCS (по дуге: x, z, класс, радиус, срез, излом).
   ────────────────────────────────────────────────────────────────────────── */

export const SM = {
  // по классу улицы (0—1 трасса и главная … 5 тихая, 6 пешеходка, 7 проезд во двор): R — радиус оси, м; CUT — предельный срез угла, м
  CLS: {
    0: { R: 40, CUT: 3 }, 1: { R: 40, CUT: 3 }, 2: { R: 40, CUT: 3 }, 3: { R: 30, CUT: 3 },
    4: { R: 20, CUT: 2.5 }, 5: { R: 20, CUT: 2.5 }, 6: { R: 6, CUT: 1 }, 7: { R: 8, CUT: 1.5 },
  },
  STEP_DEG: 10,     // шаг дуги, градусов на точку, не больше
  MIN_DEG: 6,       // излом меньше — прямая
  MAX_DEG: 120,     // излом круче — не трогаем
  CHORD: 1.5,       // хорда дуги не короче, м
  MIN_SEG: 0.5,     // соседние точки улицы не ближе, м (граф game.js пропускает куски короче 0,3 м)
  JUNC: 1.2 + 3.4 + 7,   // у перекрёстка: от узла maxW/2 + 1,2 (край перекрёстка) + 3,4 (зебра) + 7, м
  JUNC7: 4,         // у проездов и пешеходок: maxW/2 + 4, м
  END: 2,           // до тупика касание дуги не ближе, м
  STOP: 20,         // от остановки, м
  MARK: 8,          // от перехода, переезда, КПП, ворот, закрытого проезда, м
  SIG: 16,          // от светофора, м
  CIRCLE_R: 40,     // малый круг (средний радиус оси до), м
  CIRCLE_ZONE: 10,  // от края малого круга, м
  SAMPLE: 1,        // шаг проверки по дуге, м
  WALK: 2.75,       // тротуар улиц (game.js SIDEWALK), м
  WALK7: 1,         // у проездов и пешеходок — полоса за краем, м
  M_ROAD: 0.3,      // край полотна от стены, м
  M_WALK: 0.2,      // край тротуара от стены, м
  GAP: 0.5,         // между полотнами соседних улиц, м
  NEAR_NODE: 25,    // общий узел с соседней улицей ближе — её полотно не мешает, м
  HOUSE_K: 0.75,    // не вышло — радиус во столько раз меньше
  MIN_IN: 1,        // внутренний край полотна на дуге — радиусом не меньше, м
  MIN_IN7: 1.5,     // у проездов и пешеходок — внутренний край плитки (полоса WALK7 за асфальтом) на дуге радиусом не меньше, м:
                    // при R ≈ 4 м край плитки сходился почти в точку, pave.js видел там клочок газона без камня (curbgap +85 м)
  CELL: 40,
};

const ZERO = () => ({ junction: 0, zone: 0, house: 0, neighbor: 0, room: 0, cut: 0, circle: 0, bridge: 0, joint: 0, dup: 0 });
/* why — пропущено по причинам: junction — у перекрёстка, zone — запретная зона (остановка, переход, светофор,
   переезд, КПП, ворота), house — дом, neighbor — полотно соседней улицы, room — мало места на кусках,
   cut — круто для предельного среза (радиус вышел бы меньше полуширины), circle — круг, bridge — мост,
   joint — стык разных кусков, dup — точка дуги совпала бы с чужой точкой */
export const STATS = { on: false, found: 0, done: 0, sharp: 0, byClass: {}, foundByClass: {}, why: ZERO(), pts: 0, ptsBefore: 0, ptsAfter: 0, shrunk: 0, maxCut: 0, minR: 0, ms: 0 };
export const ARCS = [];
const ARC_KEYS = new Map();                    // точка дуги → номер дуги в ARCS
const akey = (x, z) => Math.round(x * 100) + ',' + Math.round(z * 100);

/* точка оси (x, z) — точка дуги (касания и точки между ними) */
export const isArc = (x, z) => ARC_KEYS.size > 0 && ARC_KEYS.has(akey(x, z));
/* номер дуги (ARCS) у точки оси, −1 — не дуга: кусок между точками одной дуги — сама дуга (game.js nearestRoad0) */
export const arcOf = (x, z) => { if (!ARC_KEYS.size) return -1; const a = ARC_KEYS.get(akey(x, z)); return a === undefined ? -1 : a; };

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
const r2 = v => Math.round(v * 100) / 100;
const pk = q => q[0] + ',' + q[1];
const DEF_W = { 0: 16, 1: 16, 2: 13.5, 3: 11, 4: 9, 5: 9, 6: 3, 7: 5.5 };
const widthOf = r => r.w || DEF_W[r.c] || 9;

export function smooth (CITY, opt = {}) {
  const t0 = performance.now();
  Object.assign(STATS, { on: !!opt.on, found: 0, done: 0, sharp: 0, byClass: {}, foundByClass: {}, why: ZERO(), pts: 0, ptsBefore: 0, ptsAfter: 0, shrunk: 0, maxCut: 0, minR: 0, ms: 0 });
  ARCS.length = 0; ARC_KEYS.clear();
  if (!opt.on) return STATS;
  const W = SM, C = W.CELL, roads = CITY.roads || [];
  const cell = (x, z) => Math.floor(x / C) + ',' + Math.floor(z / C);
  const put = (G, k, o) => { let a = G.get(k); if (!a) G.set(k, a = []); a.push(o); };
  const near = (G, x, z, fn) => {
    const i0 = Math.floor(x / C), j0 = Math.floor(z / C);
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) { const a = G.get(i + ',' + j); if (a) for (const o of a) if (fn(o)) return true; }
    return false;
  };
  for (const r of roads) STATS.ptsBefore += r.p ? r.p.length : 0;

  // круги: улицы кругов не трогаем; у малого круга — зона
  const ringRoad = new Set(), small = [];
  for (const g of opt.circles || []) {
    for (const j of g.ids || []) ringRoad.add(j);
    if (g.c && (g.mean || g.R) <= W.CIRCLE_R) small.push({ x: g.c[0], z: g.c[1], R: (g.mean || g.R) + (g.w || 9) / 2 + W.CIRCLE_ZONE });
  }

  // точки улиц: кто в них (улица, номер точки), соседи (ветки), где
  const INC = new Map(), NB = new Map(), POS = new Map();
  roads.forEach((r, ri) => {
    const p = r.p;
    if (!p) return;
    for (let i = 0; i < p.length; i++) {
      const k = pk(p[i]);
      put(INC, k, { ri, i });
      POS.set(k, p[i]);
      let s = NB.get(k); if (!s) NB.set(k, s = new Set());
      if (i > 0 && pk(p[i - 1]) !== k) s.add(pk(p[i - 1]));
      if (i < p.length - 1 && pk(p[i + 1]) !== k) s.add(pk(p[i + 1]));
    }
  });
  const deg = k => (NB.get(k) || { size: 0 }).size;
  // излом в точке с двумя ветками, градусов (или -1)
  const bendAt = k => {
    const s = NB.get(k);
    if (!s || s.size !== 2) return -1;
    const [a, b] = [...s].map(q => POS.get(q)), v = POS.get(k);
    const ux = v[0] - a[0], uz = v[1] - a[1], wx = b[0] - v[0], wz = b[1] - v[1];
    const l1 = Math.hypot(ux, uz), l2 = Math.hypot(wx, wz);
    if (l1 < 1e-6 || l2 < 1e-6) return -1;
    return Math.acos(Math.max(-1, Math.min(1, (ux * wx + uz * wz) / (l1 * l2)))) * 180 / Math.PI;
  };

  // перекрёстки (3+ веток): зона по самой широкой улице узла
  const JG = new Map();
  for (const [k, s] of NB) {
    if (s.size < 3) continue;
    let maxW = 0;
    for (const o of INC.get(k)) maxW = Math.max(maxW, widthOf(roads[o.ri]));
    const q = POS.get(k);
    put(JG, cell(q[0], q[1]), { x: q[0], z: q[1], big: maxW / 2 + W.JUNC, low: maxW / 2 + W.JUNC7 });
  }
  const zoneOf = (k, lowCls) => {
    let maxW = 0;
    for (const o of INC.get(k)) maxW = Math.max(maxW, widthOf(roads[o.ri]));
    return maxW / 2 + (lowCls ? W.JUNC7 : W.JUNC);
  };
  // запретные точки: остановки, переходы, светофоры, переезды, КПП, ворота, закрытые проезды
  const ZG = new Map();
  const zpt = (x, z, R) => { if (Number.isFinite(x) && Number.isFinite(z)) put(ZG, cell(x, z), { x, z, R }); };
  for (const s of CITY.stops || []) zpt(s.p[0], s.p[1], W.STOP);
  for (const q of CITY.crossings || []) zpt(q[0], q[1], W.MARK);
  for (const q of CITY.signals || []) zpt(q[0], q[1], W.SIG);
  for (const q of CITY.levelx || []) zpt(q[0], q[1], W.MARK);
  for (const q of CITY.kpp || []) zpt(q.p[0], q.p[1], W.MARK);
  for (const q of CITY.gates || []) zpt(q[0], q[1], W.MARK);
  for (const q of CITY.closed || []) zpt(q[0], q[1], W.MARK);

  // дома по клеткам
  const HG = new Map();
  for (const b of CITY.buildings || []) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const q of b.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    const o = { p: b.p, x0, z0, x1, z1 };
    for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++)
      for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) put(HG, i + ',' + j, o);
  }
  const inH = (x, z) => {
    const a = HG.get(cell(x, z));
    if (a) for (const o of a) if (x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1 && inPoly(x, z, o.p)) return true;
    return false;
  };
  // куски улиц по клеткам — полотна соседей
  const SG = new Map();
  roads.forEach((r, ri) => {
    const p = r.p;
    if (!p || p.length < 2) return;
    const hw = widthOf(r) / 2;
    for (let i = 1; i < p.length; i++) {
      const [x1, z1] = p[i - 1], [x2, z2] = p[i], s = { ri, x1, z1, x2, z2, hw };
      for (let a = Math.floor(Math.min(x1, x2) / C); a <= Math.floor(Math.max(x1, x2) / C); a++)
        for (let b = Math.floor(Math.min(z1, z2) / C); b <= Math.floor(Math.max(z1, z2) / C); b++) put(SG, a + ',' + b, s);
    }
  });
  // общие узлы двух улиц (кэш)
  const SHARED = new Map();
  const sharedNodes = (ri, rj) => {
    const key = ri < rj ? ri * 100000 + rj : rj * 100000 + ri;
    let out = SHARED.get(key);
    if (out) return out;
    out = [];
    for (const q of roads[ri].p) { const a = INC.get(pk(q)); if (a && a.some(o => o.ri === rj)) out.push(q); }
    SHARED.set(key, out);
    return out;
  };

  // вершина кандидата: где можно (касание по куску до соседней точки U)
  const room = (V, U, Ukey, lowCls) => {
    const L = Math.hypot(U[0] - V[0], U[1] - V[1]), d = deg(Ukey);
    if (d >= 3) return { L: L - zoneOf(Ukey, lowCls), j: true };
    if (d <= 1) return { L: L - W.END, j: false };
    const b = bendAt(Ukey);
    if (b >= W.MIN_DEG && b <= W.MAX_DEG) return { L: L / 2 - W.MIN_SEG / 2, j: false };
    return { L: L - W.MIN_SEG, j: false };
  };

  // дуга: V — вершина, A — точка до, B — после (по ходу улицы in); R — радиус оси; n чётное — для стыка
  const arc = (A, V, B, R, even) => {
    let ux = V[0] - A[0], uz = V[1] - A[1], wx = B[0] - V[0], wz = B[1] - V[1];
    const l1 = Math.hypot(ux, uz), l2 = Math.hypot(wx, wz);
    ux /= l1; uz /= l1; wx /= l2; wz /= l2;
    const phi = Math.acos(Math.max(-1, Math.min(1, ux * wx + uz * wz)));
    const sg = ux * wz - uz * wx > 0 ? 1 : -1;                    // поворот: влево (+) или вправо
    const t = R * Math.tan(phi / 2);
    const T1 = [V[0] - ux * t, V[1] - uz * t];
    const nx = -uz * sg, nz = ux * sg;                             // от касания к центру
    const cx = T1[0] + nx * R, cz = T1[1] + nz * R;
    const a0 = Math.atan2(T1[1] - cz, T1[0] - cx);
    let n = Math.max(1, Math.min(Math.ceil(phi / (W.STEP_DEG * Math.PI / 180) - 1e-9), Math.floor(R * phi / W.CHORD)));
    if (even && n % 2) n++;
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const a = a0 + sg * phi * k / n;
      pts.push([r2(cx + Math.cos(a) * R), r2(cz + Math.sin(a) * R)]);
    }
    const cut = R / Math.cos(phi / 2) - R;
    return { pts, t, cut, phi, n };
  };

  // проверки дуги: зоны, дома, соседи
  const check = (pts, hw, walk, A, V, B, lowCls, skipRoads) => {
    const oldD = (x, z) => Math.min(segDist(x, z, A[0], A[1], V[0], V[1]), segDist(x, z, V[0], V[1], B[0], B[1]));
    for (const q of pts) {
      const [x, z] = q;
      if (near(JG, x, z, o => Math.hypot(o.x - x, o.z - z) < (lowCls ? o.low : o.big))) return 'junction';
      if (near(ZG, x, z, o => Math.hypot(o.x - x, o.z - z) < o.R)) return 'zone';
    }
    const shCache = new Map();
    for (let i = 1; i < pts.length; i++) {
      const [x1, z1] = pts[i - 1], [x2, z2] = pts[i], L = Math.hypot(x2 - x1, z2 - z1);
      if (L < 1e-6) continue;
      const ux = (x2 - x1) / L, uz = (z2 - z1) / L, nx = -uz, nz = ux, m = Math.max(1, Math.ceil(L / W.SAMPLE));
      for (let s = 0; s <= m; s++) {
        const cx = x1 + (x2 - x1) * s / m, cz = z1 + (z2 - z1) * s / m;
        for (const sd of [1, -1]) {
          // край полотна
          const er = hw - W.M_ROAD, ex = cx + nx * er * sd, ez = cz + nz * er * sd;
          if (inH(ex, ez) && oldD(ex, ez) > er) return 'house';
          // внешний край тротуара
          const ew = hw + walk - W.M_WALK, wx = cx + nx * ew * sd, wz = cz + nz * ew * sd;
          if (inH(wx, wz) && oldD(wx, wz) > ew) return 'house';
          // полотно соседей
          const px = cx + nx * hw * sd, pz = cz + nz * hw * sd;
          if (oldD(px, pz) <= hw) continue;
          const hit = near(SG, px, pz, o => {
            if (skipRoads.has(o.ri)) return false;
            let sh = shCache.get(o.ri);
            if (sh === undefined) {
              sh = false;
              for (const rj of skipRoads) if (sharedNodes(rj, o.ri).some(q => Math.hypot(q[0] - V[0], q[1] - V[1]) < W.NEAR_NODE)) { sh = true; break; }
              shCache.set(o.ri, sh);
            }
            if (sh) return false;
            return o.hw + W.GAP - segDist(px, pz, o.x1, o.z1, o.x2, o.z2) > 0;
          });
          if (hit) return 'neighbor';
        }
      }
    }
    return '';
  };

  // обход: улицы по номеру, точки по порядку; дуги считаем по исходной форме, применяем в конце
  const REP = new Map();                       // улица → Map(номер точки → точки взамен, по ходу улицы)
  const rep = (ri, i, pts) => { let m = REP.get(ri); if (!m) REP.set(ri, m = new Map()); m.set(i, pts); };
  const NEWK = new Set();
  const why = k => { STATS.why[k]++; };
  roads.forEach((r, ri) => {
    const p = r.p;
    if (!p || p.length < 2) return;
    const last = p.length - 1;
    for (let i = 0; i <= last; i++) {
      const V = p[i], k = pk(V);
      if (deg(k) !== 2) continue;
      const inc = INC.get(k);
      // кто ещё в этой точке: внутри улицы — только она; на конце — стык ровно двух концов разных улиц
      let A, B, partner = null, pi = -1;
      if (i > 0 && i < last) {
        if (inc.length !== 1) continue;
        A = p[i - 1]; B = p[i + 1];
      } else {
        if (inc.length !== 2) continue;
        const o = inc.find(q => q.ri !== ri);
        if (!o || o.ri < ri) continue;                             // стык — один раз, от улицы с меньшим номером
        const pr = roads[o.ri].p, pl = pr.length - 1;
        if (o.i !== 0 && o.i !== pl) continue;
        partner = o.ri; pi = o.i;
        A = i === last ? p[i - 1] : p[1];
        B = pi === 0 ? pr[1] : pr[pl - 1];
      }
      const phiDeg = bendAt(k);
      if (phiDeg < W.MIN_DEG) continue;
      const c = r.c;
      if (phiDeg > W.MAX_DEG) { STATS.sharp++; continue; }
      STATS.found++; STATS.foundByClass[c] = (STATS.foundByClass[c] || 0) + 1;
      const R2 = partner !== null ? roads[partner] : null;
      if (r.b || (R2 && R2.b)) { why('bridge'); continue; }
      if (ringRoad.has(ri) || (partner !== null && ringRoad.has(partner)) || small.some(o => Math.hypot(o.x - V[0], o.z - V[1]) < o.R)) { why('circle'); continue; }
      if (R2) {
        const same = R2.c === r.c && Math.abs(widthOf(R2) - widthOf(r)) < 0.05 && (R2.l || 0) === (r.l || 0) && (R2.g || 0) === (r.g || 0) && !!R2.o === !!r.o && !!R2.x === !!r.x;
        // одностороння: одна приходит в точку, другая из неё уходит
        const flow = !r.o || ((i === last) !== (pi === last));
        if (!same || !flow) { why('joint'); continue; }
      }
      const cl = W.CLS[c] || W.CLS[4], hw = widthOf(r) / 2, lowCls = c >= 6;
      const walk = lowCls ? W.WALK7 : W.WALK + (r.g || 0);
      const kA = pk(A), kB = pk(B);
      const rA = room(V, A, kA, lowCls), rB = room(V, B, kB, lowCls);
      const tanH = Math.tan(phiDeg * Math.PI / 360), Rmin = hw + (lowCls ? walk + W.MIN_IN7 : W.MIN_IN);
      const Rspace = Math.min(rA.L, rB.L) / tanH, Rcut = cl.CUT / (1 / Math.cos(phiDeg * Math.PI / 360) - 1);
      let R = Math.min(cl.R, Rcut, Rspace);
      if (R < Rmin) {
        if (Rcut < Rmin && Rcut <= Rspace) why('cut');
        else why((rA.L < rB.L ? rA.j : rB.j) ? 'junction' : 'room');
        continue;
      }
      const skip = new Set([ri]); if (partner !== null) skip.add(partner);
      let res = '', a = null, tries = 0;
      for (; R >= Rmin; R *= W.HOUSE_K, tries++) {
        a = arc(A, V, B, R, partner !== null);
        res = check(a.pts, hw, walk, A, V, B, lowCls, skip);
        if (!res) break;
      }
      if (res || !a) { why(res || 'room'); continue; }
      // точки дуги не совпадают с чужими и между собой
      if (a.pts.some(q => POS.has(pk(q)) || NEWK.has(pk(q)))) { why('dup'); continue; }
      for (const q of a.pts) NEWK.add(pk(q));
      if (tries) STATS.shrunk++;
      // применяем: внутри улицы — точка → дуга; стык — половина дуги каждой улице, середина дуги — их общий узел
      if (partner === null) rep(ri, i, a.pts);
      else {
        const m = a.n / 2, h1 = a.pts.slice(0, m + 1), h2 = a.pts.slice(m);
        rep(ri, i, i === last ? h1 : h1.slice().reverse());
        rep(partner, pi, pi === 0 ? h2 : h2.slice().reverse());
      }
      STATS.done++; STATS.byClass[c] = (STATS.byClass[c] || 0) + 1;
      STATS.maxCut = Math.max(STATS.maxCut, Math.round(a.cut * 100) / 100);
      STATS.minR = STATS.minR ? Math.min(STATS.minR, Math.round(R * 10) / 10) : Math.round(R * 10) / 10;
      for (const q of a.pts) ARC_KEYS.set(akey(q[0], q[1]), ARCS.length);
      // corner — прежний угол: касание, вершина, касание (game.js nearestRoad0 — «лицевая» стена дома как до дуг)
      ARCS.push({ x: Math.round(V[0]), z: Math.round(V[1]), c, R: Math.round(R * 10) / 10, cut: Math.round(a.cut * 100) / 100, deg: Math.round(phiDeg), n: a.n, ri,
        corner: [a.pts[0][0], a.pts[0][1], V[0], V[1], a.pts[a.n][0], a.pts[a.n][1]], rx: r.x ? 1 : 0 });
    }
  });
  for (const [ri, m] of REP) {
    const r = roads[ri], p = r.p, out = [];
    if (!r.m0) r.m0 = p[(p.length / 2) | 0];             // вид асфальта и плитки — по середине улицы, как было (roadwear.js, world.js)
    r.mid0 = [p[((p.length / 2) | 0) - 1], p[(p.length / 2) | 0]];   // средний кусок этого куска улицы до дуг: заплатки (roadwear.js decorate), подпись на карте (game.js)
    for (let i = 0; i < p.length; i++) {
      for (const q of m.has(i) ? m.get(i) : [p[i]]) {
        const l = out[out.length - 1];
        if (l && l[0] === q[0] && l[1] === q[1]) continue;
        out.push(q);
      }
    }
    r.p = out;
  }
  for (const r of roads) STATS.ptsAfter += r.p ? r.p.length : 0;
  STATS.pts = STATS.ptsAfter - STATS.ptsBefore;
  STATS.ms = Math.round(performance.now() - t0);
  return STATS;
}
