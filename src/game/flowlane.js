/* ──────────────────────────────────────────────────────────────────────────
   Поток машин: плавность, перестроения, кольца (23.10.2026, план 0аг, 0ак;
   правила словами — docs/CAREER.md «Машины потока: плавно, перестроения, кольца»).

   1. Плавность (pose). Машина потока едет по «рельсам»: точка полосы на ребре, дуга через перекрёсток.
      На стыках рёбер рельсы рвались: соседние куски улицы разной ширины (полоса сдвигается на 0,3—0,5 м),
      улица из карты ломаной (курс щёлкал на 5—15° в один кадр), на прямом стыке разной ширины дуга в 0,6 м
      шла поперёк улицы — машина на 3 кадра вставала боком: «едет прямо — кадр вбок — кадр прямо».
      Теперь рывок (скорость вбок за кадр сменилась больше чем на SNAP_V м/с, скорость поворота — на SNAP_W рад/с) не показывается:
      машина остаётся, где была, а разница гаснет плавно (SMOOTH_K, H_K — 1/с), нос — по ходу.
      Переставили машину (placeTraffic), её сбили, двинул кто-то другой — без сглаживания.
   2. Смена полосы (lc): только на ребре в 2+ полосы в свою сторону, по дуге за LC_DUR с (плавно: начало и
      конец — медленно), сначала мигает поворотник (SIGNAL с), и только если в новой полосе свободно:
      впереди от бампера до бампера не меньше GAP_F м, сзади — GAP_B м (+ разница скоростей × 2—2,5 с).
      Зачем перестраивается: впереди в своей полосе медленный или стоящий (меньше SLOW_K своей скорости, терпит
      PATIENCE с) — обгоняет; полоса кончается (на следующем ребре полос меньше) — заранее вправо; изредка —
      обратно в правую (KEEP_RIGHT за проверку), если там надолго свободно.
   3. Уступи (yieldSlow), у конца ребра (ближе YIELD_LOOK м): следующее ребро выбирается заранее (nx).
      • место занято — на следующем ребре в моей полосе ближе двух корпусов кто-то стоит или едет — ждёт у линии;
      • кто-то уже поворачивает в то же место (на дуге в ту же полосу того же ребра) — ждёт;
      • двое подъезжают к одному месту (полоса кончается, два ребра в одно) — пропускает тот, у кого ниже
        приоритет: на кольце > полоса не кончается > ближе по времени > номер;
      • въезд на кольцо: на кольце кто-то едет к точке въезда и будет там быстрее чем за RING_T с — ждёт.
      Ждёт дольше YIELD_MAX с (а место свободно) — едет. Не успевает затормозить (скорость² / 12 больше, чем
      до линии) — не уступает, а проезжает: в пол перед кольцом не встаёт.
      Ряд: на улице в 2+ полосы следующее ребро выбирается за PICK_LOOK м; направо — из правой полосы, налево — из
      левой (не та — перестраивается заранее, не успел — едет прямо). Прямо — в ближнюю по месту полосу следующего куска.
      Поворот — не быстрее √(A_LAT × радиус дуги) (не медленнее V_TURN), сбрасывает заранее (BRAKE м/с²).
   4. Подрезка (cut): не чаще раза в CUT_EVERY с, когда курьер едет быстрее 25 км/ч по улице в 2+ полосы:
      машина из соседней полосы чуть впереди (её задний бампер в CUT_GAP м перед носом курьера) внезапно
      (поворотник — за 0,15 с), но плавно (CUT_DUR с) перестраивается прямо перед ним.
   5. На пути (predict): корпус «где я буду через ~0,7 с» задевает соседа — тормозит один из двоих (first: кто «сзади»).
      В game.js по тому же правилу «прямо по курсу» пути накрест тормозит один, а не оба до сцепки; сцепились
      (ghost) — едут, не глядя только на тех, кто сбоку, сквозь стоящего на пути — лишь со второго раза.
   Кольца — сами по карте: одностороннее ребро, по односторонним можно вернуться в его начало быстрее
   RING_LEN м (в Солнечном 4 кольца, 122 ребра). ?oldflow — по-старому (без всего этого, для замера «до/после»).
   Замер — tools/probe-checks/traffic-flow.js (рывки, пересечения корпусов, перестроения, уступи).
   ────────────────────────────────────────────────────────────────────────── */

export const FLOW = {
  on: !new URLSearchParams(typeof location !== 'undefined' ? location.search : '').has('oldflow'),
  SNAP_V: 2,          // м/с: скорость вбок за кадр сменилась больше — рывок, гасим
  SNAP_W: 1.5,        // рад/с: скорость поворота за кадр сменилась больше — рывок, гасим
  SMOOTH_K: 2.6,      // 1/с: как быстро гаснет сдвиг
  H_K: 4,             // 1/с: как быстро гаснет курс
  LC_DUR: [1.5, 2],   // с: смена полосы
  SIGNAL: 0.7,        // с: поворотник до того, как поехал вбок
  GAP_F: 5,           // м: впереди в новой полосе (бампер — бампер)
  GAP_B: 4,           // м: сзади в новой полосе
  LOOK: 24,           // м: кого видит впереди в своей полосе
  SLOW_K: 0.6,        // впереди медленнее этой доли своей крейсерской — хочется обогнать
  PATIENCE: [1.2, 3], // с: сколько терпит медленного впереди
  KEEP_RIGHT: 0.04,   // шанс за проверку вернуться в правую полосу
  CHECK: 0.4,         // с: как часто думает о перестроении
  YIELD_LOOK: 24,     // м до конца ребра — смотрит, кому уступить
  P_MAX: 8,           // с: стоит из-за «на пути» дольше — едет (2 с не смотрит)
  PICK_LOOK: 70,      // м до конца ребра в 2+ полосы — выбирает, куда дальше, и перестраивается в свой ряд
  RING_T: 2.6,        // с: на кольце кому-то до точки въезда меньше — ждём
  YIELD_MAX: 8,       // с: ждёт дольше — едет (если место свободно)
  RING_LEN: 260,      // м: кольцо — круг односторонних не длиннее
  CUT_EVERY: [180, 360],   // с
  CUT_FIRST: [120, 240],   // с: первая — не сразу
  CUT_GAP: [4, 10],   // м: от его заднего бампера до носа курьера
  CUT_DUR: 1.3,       // с
  CUT_V: 7,           // м/с: курьер быстрее — можно подрезать
  MAX_V: 2.5,         // м/с: сдвиг от рывка гаснет не быстрее
  MAX_W: 1.6,         // рад/с: курс от рывка — не быстрее
  A_LAT: 4.5,         // м/с²: в повороте не быстрее √(A_LAT × радиус), но не медленнее V_TURN
  V_TURN: 2.5,        // м/с
  BRAKE: 3,           // м/с²: к повороту сбрасывает заранее
};

export const ST = { lc: 0, cut: 0, yield: 0, snaps: 0, rings: 0, ringEdges: 0, forced: 0, resetBig: 0, bigSnap: 0, pred: 0 };

let A = null;                                       // из game.js: NODES, EDGES, laneCount, laneOff, edgeRun, nextEdge, okNext, near, V, CAR_L, THREE
const NB = [], NB2 = [];                            // кандидаты «кто рядом» — без выделений в кадре (NB2 — у подрезки: внутри неё laneFree)
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a, b) => a + Math.random() * (b - a);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const sm = q => q <= 0 ? 0 : q >= 1 ? 1 : q * q * (3 - 2 * q);

export function init (api) {
  A = api;
  if (FLOW.on) markRings();
  // первая подрезка — жребий в первом кадре (frameStep), не здесь: init идёт посреди сборки города с зерном (editlayer.js
  // buildStart), лишний Math.random сдвигал весь город — подъезды, заборы дворов, адреса (23.10.2026, yard-maze.js)
  CUT.t = NaN;
}

/* кольца: одностороннее ребро, из конца которого по односторонним можно вернуться в его начало быстрее RING_LEN */
function markRings () {
  const { NODES, EDGES } = A;
  const out = new Map();
  for (const e of EDGES.values()) if (e.oneway && e.ok && !e.two) { let L = out.get(e.a); if (!L) out.set(e.a, L = []); L.push(e); }
  const stack = [];
  for (const e of EDGES.values()) {
    if (!e.oneway || !e.ok || e.two || e.ring) continue;
    // поиск в глубину по длине: [ребро, пройдено, глубина]
    stack.length = 0; stack.push([e, e.len, 0]);
    let path = null;
    const prev = new Map();
    while (stack.length) {
      const [c, L, dep] = stack.pop();
      if (c.b === e.a) { path = c; break; }
      if (dep > 40) continue;
      for (const n of out.get(c.b) || []) {
        if (n === e || prev.has(n) || L + n.len > FLOW.RING_LEN) continue;
        prev.set(n, c); stack.push([n, L + n.len, dep + 1]);
      }
    }
    if (!path) continue;
    let k = 0;
    for (let c = path; c; c = c === e ? null : prev.get(c)) { if (!c.ring) { c.ring = 1; k++; NODES[c.a].ring = 1; NODES[c.b].ring = 1; } }
    if (k) ST.rings++;
    ST.ringEdges += k;
  }
}

/* ── 1. плавность ── */
/* после позы по рельсам (lx, lz, lh): рывок не показываем, гасим плавно. dt = 0 — машину поставили: заново */
export function pose (t, lx, lz, lh, dt) {
  if (!FLOW.on) { t.x = lx; t.z = lz; t.h = lh; return; }
  let F = t.fo;
  if (!F) F = t.fo = { tx: lx, tz: lz, th: lh, ox: 0, oz: 0, oh: 0, tl: 0, lv: 0, w: 0, rx: NaN, rz: NaN };
  const sp = Math.max(3, t.speed || 0);
  if (!dt || t.x !== F.rx || t.z !== F.rz) {        // поставили, сбили, двинул кто-то другой — без сглаживания
    if (dt && Math.abs(F.ox) + Math.abs(F.oz) > 0.5) ST.resetBig++;
    F.ox = F.oz = F.oh = F.tl = F.lv = F.w = 0;
    if (!dt) { t.lc = null; t.nx = null; blink(t, 0); }
  } else {
    // рывок — скорость рельсов вбок (от прежнего курса) или скорость поворота за кадр сменилась резко: больше SNAP_V м/с
    // или SNAP_W рад/с. Резкую часть не показываем (она — в сдвиг ox/oz, oh), плавная (дуга, смена полосы) — как есть
    const rx = -Math.cos(F.th), rz = Math.sin(F.th);
    const lat = (lx - F.tx) * rx + (lz - F.tz) * rz;
    // показываем скорость вбок / поворота, сменившуюся за кадр не больше SNAP_V / SNAP_W; остальное — в сдвиг
    const lv = clamp(lat / dt, F.lv - FLOW.SNAP_V, F.lv + FLOW.SNAP_V), el = lat - lv * dt;
    if (el > 0.004 || el < -0.004) { F.ox -= el * rx; F.oz -= el * rz; ST.snaps++; if (Math.abs(el) > 1) ST.bigSnap++; }
    F.lv = lv;
    const dh = wrap(lh - F.th), w = clamp(dh / dt, F.w - FLOW.SNAP_W, F.w + FLOW.SNAP_W), eh = dh - w * dt;
    if (eh > 0.002 || eh < -0.002) { F.oh -= eh; ST.snaps++; }
    F.w = w;
    // гаснет: доля за кадр, но не быстрее MAX_V / MAX_W (большой сдвиг — иначе машина «ехала» вбок рывком)
    const o = Math.hypot(F.ox, F.oz);
    if (o > 0) { const dec = Math.min(o * (1 - Math.exp(-FLOW.SMOOTH_K * dt)), FLOW.MAX_V * dt), k = (o - dec) / o; F.ox *= k; F.oz *= k; }
    F.oh = wrap(F.oh);
    const ah = Math.abs(F.oh);
    if (ah > 0) F.oh *= (ah - Math.min(ah * (1 - Math.exp(-FLOW.H_K * dt)), FLOW.MAX_W * dt)) / ah;
    if (o < 0.003) F.ox = F.oz = 0;
  }
  F.tx = lx; F.tz = lz; F.th = lh;
  // нос — по ходу: сдвиг гаснет (вбок со скоростью K × сдвиг) и смена полосы (производная дуги)
  const rx = -Math.cos(lh), rz = Math.sin(lh);
  const or = F.ox * rx + F.oz * rz, oo = Math.hypot(F.ox, F.oz);
  let tl = Math.atan(Math.min(FLOW.SMOOTH_K * oo, FLOW.MAX_V) * (oo > 0 ? or / oo : 0) / sp);
  const L = t.lc;
  if (L && !t.turn && L.q > 0 && L.q < 1) tl += Math.atan(L.d * 6 * L.q * (1 - L.q) / L.dur / sp);
  const dtl = (clamp(tl, -0.3, 0.3) - F.tl) * (1 - Math.exp(-10 * (dt || 1))), mt = 1.2 * (dt || 1);   // нос — не быстрее 1,2 рад/с
  F.tl += dtl > mt ? mt : dtl < -mt ? -mt : dtl;
  t.x = lx + F.ox; t.z = lz + F.oz; t.h = lh + F.oh + F.tl;
  F.rx = t.x; F.rz = t.z;
}

/* как damp, но не быстрее vmax в секунду (такси к бордюру и обратно) */
export function ease (a, b, k, vmax, dt) {
  if (!FLOW.on) return a + (b - a) * (1 - Math.exp(-k * dt));
  const d = (b - a) * (1 - Math.exp(-k * dt)), m = vmax * dt;
  return a + (d > m ? m : d < -m ? -m : d);
}

/* ── 2. смена полосы ── */
/* сдвиг от смены полосы, м вдоль правой нормали ребра — в lanePoint (game.js poseTraffic, startTurn) */
export const lat = t => (t.lc ? t.lc.d * (1 - sm(t.lc.q)) : 0);
/* машина начала дугу через перекрёсток: смена полосы кончилась (её сдвиг уже в начале дуги) */
export function onTurn (t) { if (t.lc) { t.lc = null; blink(t, 0); } t.nx = null; }

const plain = t => !t.bus && !t.dump && !t.rvGoal && !t.mp && t.model !== 'moped' && !t.svc && !t.chase;
const canLc = t => plain(t) && !t.turn && !t.lc && !(t.stopT > 0) && !t.rlJam && !t.rlOut && !(t.pull > 0.05) && !(t.nar > 0.05) && A.laneCount(t.e) >= 2;

/* поперечная координата точки на ребре e (от оси, вдоль правой нормали) — FR.la, и продольная от машины t — FR.fw */
const FR = { la: 0, fw: 0 };
function frame (e, t, x, z) {
  const N = A.NODES[e.a];
  FR.la = (x - N.x) * e.rx + (z - N.z) * e.rz; FR.fw = (x - t.x) * e.ux + (z - t.z) * e.uz;
}

/* свободно ли в полосе L ребра t.e рядом с t (skipV — курьера не считать: подрезка) */
function laneFree (t, L, skipV, gapF = FLOW.GAP_F, gapB = FLOW.GAP_B) {
  const e = t.e, off = A.laneOff(e, L), hl = t.hl || 2.2;
  const chk = (x, z, h, ohl, osp, olane, oe) => {
    if (Math.sin(h) * e.ux + Math.cos(h) * e.uz < 0.3 && osp > 0.5) return true;   // встречная или поперёк и едет — не в этой полосе
    frame(e, t, x, z);
    const la = FR.la, fw = FR.fw;
    if (Math.abs(la - off) > 2.1 && !(oe === e && olane === L)) return true;
    if (fw >= 0) return fw - hl - ohl > gapF + Math.max(0, (t.speed || 0) - osp) * 2;
    return -fw - hl - ohl > gapB + Math.max(0, osp - (t.speed || 0)) * 2.5;
  };
  for (let i = 0, n = A.near(t.x, t.z, 34, NB), R = A.R(); i < n; i++) {
    const o = R[i];
    if (o === t || o.gone || Math.abs(o.x - t.x) > 34 || Math.abs(o.z - t.z) > 34) continue;
    if (!chk(o.x, o.z, o.h, o.bus ? o.hl : (o.hl || 2.2), o.parked || o.knock ? 0 : (o.speed || 0), o.lane, o.e)) return false;
  }
  if (!skipV) { const V = A.V; if (Math.abs(V.x - t.x) < 34 && Math.abs(V.z - t.z) < 34 && !chk(V.x, V.z, V.h, A.CAR_L, Math.hypot(V.vx, V.vz), -1, null)) return false; }
  return true;
}

function startLc (t, L, dur, wait) {
  const e = t.e;
  t.lc = { d: A.laneOff(e, t.lane) + lat(t) - A.laneOff(e, L), q: -wait / dur, dur, side: L > t.lane ? 1 : -1, bt: 0 };
  t.lane = L;
  ST.lc++;
}

/* кто впереди в моей полосе: [машина, зазор бампер — бампер] */
function leaderOf (t) {
  const e = t.e, off = A.laneOff(e, t.lane) + lat(t), hl = t.hl || 2.2;
  let best = null, bg = 1e9;
  for (let i = 0, n = A.near(t.x, t.z, FLOW.LOOK, NB), R = A.R(); i < n; i++) {
    const o = R[i];
    if (o === t || o.gone || Math.abs(o.x - t.x) > FLOW.LOOK || Math.abs(o.z - t.z) > FLOW.LOOK) continue;
    const stand = o.stalled || o.wreck || o.knock || (o.speed || 0) < 0.5;
    if (o.parked && !o.accident) continue;
    if (!stand && Math.sin(o.h) * e.ux + Math.cos(o.h) * e.uz < 0.5) continue;
    frame(e, t, o.x, o.z);
    const la = FR.la, fw = FR.fw;
    if (fw <= 0 || Math.abs(la - off) > 1.7) continue;
    const g = fw - hl - (o.hl || 2.2);
    if (g < bg) { bg = g; best = o; }
  }
  return best ? [best, bg] : null;
}

/* прямо с ребра e, если можно (не успел перестроиться в ряд поворота) */
function straight (e) {
  const N = A.NODES[e.b];
  let best = null, bd = 0.85;
  for (const c of N.nb) {
    if (c === e.a) continue;
    const n = A.edgeOf(e.b, c);
    if (!n || !A.okNext(n)) continue;
    const d = e.ux * n.ux + e.uz * n.uz;
    if (d > bd) { bd = d; best = n; }
  }
  return best;
}
function decide (t) {
  const e = t.e, n = A.laneCount(e), rem = A.edgeRun(e) - t.s, sp = t.speed || 0;
  const room = rem > sp * FLOW.LC_DUR[1] + 10;
  const sigNear = e.sig && e.len - e.stopAt - e.tA - t.s < 45;
  // полоса кончается (на следующем ребре полос меньше) — заранее вправо; поворот — заранее в свой ряд
  if (t.nx && t.nxE === e) {
    let want = A.laneCount(t.nx) <= t.lane ? A.laneCount(t.nx) - 1 : -1;
    const L = laneFor(e, t.nx, n);
    if (L >= 0 && L !== t.lane) want = L;
    if (want >= 0 && want !== t.lane) {
      const to = want > t.lane ? t.lane + 1 : t.lane - 1;
      if (rem > sp * 1.4 + 3 && laneFree(t, to)) startLc(t, to, rand(...FLOW.LC_DUR), FLOW.SIGNAL * 0.6);
      else if (rem < sp * 1.4 + 3 && L >= 0 && L !== t.lane) { t.nx = straight(e) || t.nx; }   // не успел в свой ряд — прямо
      return;
    }
  }
  if (!room || sigNear) { t.lcP = 0; return; }
  const ld = leaderOf(t);
  const slowAhead = ld && ld[1] < 18 && (ld[0].stalled || ld[0].wreck || ld[0].knock ||
    ((ld[0].speed || 0) < t.cruise * FLOW.SLOW_K && t.cruise - (ld[0].speed || 0) > 2.5 && !(ld[0].e && ld[0].e.sig)));
  if (slowAhead) {
    if (t.lcW === undefined) t.lcW = rand(...FLOW.PATIENCE);
    if ((t.lcP = (t.lcP || 0) + FLOW.CHECK) < t.lcW) return;
    for (let k = 0; k < 2; k++) {
      const L = k ? t.lane - 1 : t.lane + 1;
      if (L < 0 || L >= n) continue;
      if (laneFree(t, L)) { startLc(t, L, rand(...FLOW.LC_DUR), FLOW.SIGNAL); t.lcP = 0; t.lcW = undefined; return; }
    }
    return;
  }
  t.lcP = 0;
  // обратно вправо — изредка и только если надолго свободно
  if (t.lane > 0 && Math.random() < FLOW.KEEP_RIGHT && laneFree(t, t.lane - 1, false, 14, 8)) startLc(t, t.lane - 1, rand(...FLOW.LC_DUR), FLOW.SIGNAL);
}

/* ── 3. уступи ── */
/* куда дальше — выбрать заранее. На улице в 2+ полосы: направо — из правой полосы, налево — из левой, прямо — из любой;
   не та полоса — до 3 попыток выбрать другое, иначе перестроится заранее (decide), не успеет — поедет прямо */
const side = (e, n) => { const b = e.ux * n.uz - e.uz * n.ux; return b > 0.35 ? 1 : b < -0.35 ? -1 : 0; };   // 1 — направо, -1 — налево
const laneFor = (e, n, nl) => { const sd = side(e, n); return sd > 0 ? 0 : sd < 0 ? nl - 1 : -1; };   // -1 — любая
function pick (t, e, nl) {
  t.nxE = e;
  if (t.bus || t.mp || t.model === 'moped' || t.svc || t.chase) { t.nx = null; return; }   // самосвал и бургер-машина — догадка (их поворот выбирает своё, startTurn)
  let n = A.nextEdge(e);
  if (nl >= 2 && n) for (let i = 0; i < 3; i++) {
    const L = laneFor(e, n, nl);
    if (L < 0 || L === t.lane) break;
    const m = A.nextEdge(e);
    if (!m) break;
    n = m;
  }
  t.nx = n;
}

const prio = (t, e, Lt) => (e.ring ? 4 : 0) + (t.lane === Lt ? 2 : 0);
function yieldSlow (t, dt) {
  const e = t.e, rem = A.edgeRun(e) - t.s;
  const nl = A.laneCount(e);
  if (rem > (nl >= 2 ? FLOW.PICK_LOOK : FLOW.YIELD_LOOK)) { t.yT = 0; return 1; }
  if (!t.nx || t.nxE !== e) pick(t, e, nl);
  if (rem > FLOW.YIELD_LOOK) { t.yT = 0; return 1; }
  const nx = t.nx, N = A.NODES[e.b], hl = t.hl || 2.2, sp = t.speed || 0;
  const Lt = nx ? laneOnto(t, e, nx, clamp(t.lane, 0, A.laneCount(nx) - 1)) : t.lane;
  const enterRing = N.ring && !e.ring;
  const late = rem - 0.8 < sp * sp / 12;            // уже не затормозить — проезжаем
  const soft = !(t.yGo > 0);                        // ждал дольше YIELD_MAX — «вежливые» правила не держат
  if (t.yGo > 0) t.yGo -= dt;
  let wait = false, hard = false;
  const myT = rem / Math.max(1, sp);
  for (let i = 0, n = A.near(N.x, N.z, 30, NB), R = A.R(); i < n && !hard; i++) {
    const o = R[i];
    if (o === t || o.gone || (o.parked && !o.accident) || Math.abs(o.x - N.x) > 30 || Math.abs(o.z - N.z) > 30) continue;
    if (nx) {
      // место занято: на следующем ребре в моей полосе, ближе двух корпусов
      // (на изломе улицы и прямо — это просто «кто впереди», его держит updateTraffic)
      if (o.e === nx && !o.turn && o.s < hl + (o.hl || 2.2) + 2.5 && (o.lane === Lt || A.laneCount(nx) === 1) &&
          (N.nb.length >= 3 || e.ux * nx.ux + e.uz * nx.uz < 0.9) && Math.sin(o.h) * e.ux + Math.cos(o.h) * e.uz < 0.9) { hard = true; break; }
      // кто-то уже на дуге в то же место (не мой же впереди из моей полосы)
      if (o.turn && o.turn.next === nx && o.turn.lane === Lt && !(o.e === e && o.lane === t.lane)) { wait = true; continue; }
    }
    if (!soft || late) continue;
    // двое к одному месту: пропускает младший по приоритету
    if (nx && !o.turn && o.nx === nx && o.nxE === o.e && o.e.b === e.b && !(o.e === e && o.lane === t.lane)) {
      const oL = laneOnto(o, o.e, nx, clamp(o.lane, 0, A.laneCount(nx) - 1));
      if (oL === Lt) {
        const pa = prio(t, e, Lt), pb = prio(o, o.e, oL);
        const oT = (A.edgeRun(o.e) - o.s) / Math.max(1, o.speed || 0);
        if (pb > pa || (pb === pa && (oT < myT - 0.05 || (Math.abs(oT - myT) <= 0.05 && (o._fid || 0) < (t._fid || 0))))) { wait = true; continue; }
      }
    }
    // въезд на кольцо: на кольце кто-то едет к точке въезда
    if (enterRing && o.e && o.e.ring && !(o.e === e)) {
      const dx = N.x - o.x, dz = N.z - o.z, dd = Math.hypot(dx, dz);
      if ((dx * Math.sin(o.h) + dz * Math.cos(o.h)) > 0.3 * dd && dd < (o.speed || 0) * FLOW.RING_T + (o.hl || 2.2) + hl + 2) wait = true;
    }
  }
  if (!hard && !wait) { t.yT = 0; if (t.yld) t.yld = 0; return 1; }
  if (!hard && late) return 1;
  if (!t.yld) { t.yld = 1; ST.yield++; }
  if (!hard && (t.yT = (t.yT || 0) + dt) > FLOW.YIELD_MAX) { t.yGo = 2.5; t.yT = 0; ST.forced++; }
  return clamp((rem - 0.8) / 8, 0, 1);
}

/* ── 4. подрезка перед курьером ── */
const CUT = { t: 0 };
function cutIn (why) {
  const V = A.V, vp = Math.hypot(V.vx, V.vz);
  if (vp < FLOW.CUT_V) return false;
  const fx = Math.sin(V.h), fz = Math.cos(V.h);
  for (let i = 0, n = A.near(V.x, V.z, 26, NB2), R = A.R() === NB2 ? NB2 : A.R().slice(); i < n; i++) {
    const o = R[i];
    const no = r => { if (why) why.push([Math.round(o.x - V.x), Math.round(o.z - V.z), r]); };
    if (o.gone || o.parked || o.knock || o.wreck || o.stalled || !canLc(o)) { no('canLc'); continue; }
    const e = o.e;
    if (Math.sin(o.h) * fx + Math.cos(o.h) * fz < 0.93 || e.ux * fx + e.uz * fz < 0.9) { no('dir'); continue; }
    const dx = o.x - V.x, dz = o.z - V.z, fw = dx * fx + dz * fz, gap = fw - (o.hl || 2.2) - A.CAR_L;
    if (gap < FLOW.CUT_GAP[0] || gap > FLOW.CUT_GAP[1]) { no('gap ' + gap.toFixed(1)); continue; }
    if ((o.speed || 0) < vp * 0.75 || A.edgeRun(e) - o.s < (o.speed || 0) * 2 + 12) { no('speed/room'); continue; }
    // полоса курьера на ребре машины
    frame(e, o, V.x, V.z);
    const la = FR.la;
    let L = -1, bd = 9;
    for (let k = 0, nl = A.laneCount(e); k < nl; k++) { const d = Math.abs(A.laneOff(e, k) - la); if (d < bd) { bd = d; L = k; } }
    if (L < 0 || bd > 1.6 || Math.abs(L - o.lane) !== 1) { no('lane ' + L + ' ' + o.lane + ' ' + bd.toFixed(1)); continue; }
    if (!laneFree(o, L, true)) { no('busy'); continue; }
    startLc(o, L, FLOW.CUT_DUR, 0.15);
    o.lc.cut = 1;
    ST.cut++;
    return true;
  }
  return false;
}

/* раз в кадр (updateTraffic): часы подрезки */
export function frameStep (dt) {
  if (!FLOW.on) return;
  if (CUT.t !== CUT.t) CUT.t = rand(...FLOW.CUT_FIRST);   // NaN — ещё не тянули (init)
  if ((CUT.t -= dt) > 0) return;
  CUT.t = 0.5;
  if (cutIn()) CUT.t = rand(...FLOW.CUT_EVERY);
}

/* машина потока на ребре, перед расчётом скорости (updateTraffic): смена полосы идёт, решения, уступи → доля скорости */
let FID = 1;
/* ── 5. не въезжать в того, кто на пути ──
   Прямоугольник «где я буду через ~0,7 с» (корпус + путь вперёд по носу) против корпусов соседей. Задел — тормозит тот, у кого
   другой больше впереди (кто «сзади» по отношению к другому); поровну — младший номер едет. Ловит то, что не видит «прямо по
   курсу» в game.js: слияние двух улиц под углом, дуги из соседних полос накрест, такси у бордюра, кто вывернул сбоку */
const OB = { ax: 0, az: 0, bx: 0, bz: 0 };
function obb (x1, z1, h1, L1, W1, x2, z2, h2, L2, W2) {
  const s1 = Math.sin(h1), c1 = Math.cos(h1), s2 = Math.sin(h2), c2 = Math.cos(h2), dx = x2 - x1, dz = z2 - z1;
  // оси: нос 1 (s1, c1), бок 1 (c1, -s1), нос 2, бок 2
  for (let k = 0; k < 4; k++) {
    const ux = k === 0 ? s1 : k === 1 ? c1 : k === 2 ? s2 : c2, uz = k === 0 ? c1 : k === 1 ? -s1 : k === 2 ? c2 : -s2;
    const r1 = L1 * Math.abs(s1 * ux + c1 * uz) + W1 * Math.abs(c1 * ux - s1 * uz);
    const r2 = L2 * Math.abs(s2 * ux + c2 * uz) + W2 * Math.abs(c2 * ux - s2 * uz);
    if (Math.abs(dx * ux + dz * uz) > r1 + r2) return false;
  }
  return true;
}
/* кто из двоих, чьи пути пересеклись, едет первым: тот, кто сильнее впереди другого (по курсу другого); поровну — младший номер */
export function first (t, o) {
  const fo = (o.x - t.x) * Math.sin(t.h) + (o.z - t.z) * Math.cos(t.h);
  const ft = !o.knock && !o.stalled && !o.wreck && !o.parked ? (t.x - o.x) * Math.sin(o.h) + (t.z - o.z) * Math.cos(o.h) : -1;   // стоящую аварийную не пропускаем вперёд себя
  return ft > fo + 0.5 || (Math.abs(ft - fo) <= 0.5 && (t._fid || 0) < (o._fid || 0));
}
function predict (t, dt) {
  const sp = t.speed || 0;
  if (t.pGo > 0) { t.pGo -= dt; return 1; }        // стоял из-за этого дольше P_MAX — пару секунд не смотрит (не встать навсегда)
  if (sp < 0.4 && !(t.pT > 0)) return 1;
  if (t.ghost > 0 && t.gN >= 2) return 1;
  const hl = t.bus ? t.hl : (t.hl || 2.2), hx = Math.sin(t.h), hz = Math.cos(t.h), look = clamp(sp * 0.7, 1.5, 7);
  const cx = t.x + hx * look / 2, cz = t.z + hz * look / 2, L = hl + look / 2, W = t.bus ? 1.25 : 0.95, R = L + 7;
  let k = 1;
  for (let i = 0, n = A.near(cx, cz, R, NB, false), RR = A.R(); i < n; i++) {
    const o = RR[i];
    if (o === t || o.gone || o.parked || Math.abs(o.x - cx) > R || Math.abs(o.z - cz) > R) continue;
    const ohl = o.bus ? o.hl : (o.hl || 2.2);
    if (!obb(cx, cz, t.h, L, W, o.x, o.z, o.h, ohl, o.bus ? 1.25 : 0.9)) continue;
    const fo = (o.x - t.x) * hx + (o.z - t.z) * hz;                    // насколько он впереди меня
    if (fo <= 0) continue;                                             // позади
    if (first(t, o)) {                                                 // он уступит мне: едет — да; стоит — если не прямо на пути (или уже сцепились)
      if ((o.speed || 0) >= 0.4 || Math.abs(-hz * (o.x - t.x) + hx * (o.z - t.z)) > 1.2 || obb(t.x, t.z, t.h, hl, 0.9, o.x, o.z, o.h, ohl, 0.9)) continue;
    }
    k = Math.min(k, clamp((fo - hl - ohl - 0.6) / 6, 0, 1));
    if (!k) break;
  }
  if (k < 1) ST.pred++;
  if (k < 0.05 && sp < 0.4) { if ((t.pT = (t.pT || 0) + dt) > FLOW.P_MAX) { t.pT = 0; t.pGo = 2; ST.forced++; } } else t.pT = 0;
  return k;
}

/* сколько можно в повороте с ребра e на n: радиус дуги ≈ длина / угол */
function curveV (e, n, len) {
  const c = clamp(e.ux * n.ux + e.uz * n.uz, -1, 1), ang = Math.acos(c);
  if (ang < 0.12) return 99;
  return Math.max(FLOW.V_TURN, Math.sqrt(FLOW.A_LAT * Math.max(1, (len || e.tB + n.tA + 0.5) / ang)));
}
/* «на пути» и «уступи» — через раз (у каждой машины свой счёт), время копится; сменилось ребро или дуга — заново (Дека: −0,1 мс) */
function predC (t, dt) {
  t._pa = (t._pa || 0) + dt;
  if ((t._pc = (t._pc || 0) + 1) & 1 && t._pk !== undefined && t._pt === t.turn) return t._pk;
  t._pt = t.turn; t._pk = predict(t, t._pa); t._pa = 0;
  return t._pk;
}
function yieldC (t, dt) {
  t._ya = (t._ya || 0) + dt;
  if ((t._pc & 1) && t._yk !== undefined && t._ye === t.e && t._yt === t.turn) return t._yk;
  t._ye = t.e; t._yt = t.turn; t._yk = yieldSlow(t, t._ya); t._ya = 0;
  return t._yk;
}
export function step (t, dt) {
  if (!FLOW.on || t.mp || t.model === 'moped') return 1;   // мопеды доставки едут по-своему (mopeds.js)
  if (!t._fid) t._fid = FID++;
  if (t.turn) {                                     // на дуге — не быстрее, чем позволяет её радиус
    if (t.lc) onTurn(t);
    const T = t.turn;
    return Math.min(predC(t, dt), curveV(t.e, T.next, T.len) / Math.max(1, t.cruise));   // и в развороте (deadends.js): петля тугая
  }
  const L = t.lc;
  if (L) {
    L.q += dt / L.dur;
    L.bt += dt;
    blink(t, L.side, L.bt);
    if (L.q >= 1) { t.lc = null; blink(t, 0); }
  } else if (canLc(t) && (t.lcT = (t.lcT || 0) - dt) <= 0) { t.lcT = FLOW.CHECK * rand(0.8, 1.2); decide(t); }
  let k = predC(t, dt);
  k = Math.min(k, yieldC(t, dt));
  // к повороту — сбросить заранее (следующее ребро выбрано: nx)
  if (t.nx && t.nxE === t.e) {
    const vm = curveV(t.e, t.nx), rem = A.edgeRun(t.e) - t.s;
    if (vm < t.cruise) k = Math.min(k, Math.sqrt(vm * vm + 2 * FLOW.BRAKE * Math.max(0, rem - 1)) / t.cruise);
  }
  return k;
}

/* полоса на следующем ребре: прямо (угол меньше ~25°) — ближняя по месту к той, где едет сейчас (у соседних кусков улицы разные
   ширина и число полос: «та же полоса 0» бывала на 3—4 м в стороне — машину вело вбок через всю улицу), иначе — lane0 */
export function laneOnto (t, e, n, lane0) {
  if (!FLOW.on || e.ux * n.ux + e.uz * n.uz < 0.9) return lane0;
  const nl = A.laneCount(n);
  if (nl < 2 && A.laneCount(e) < 2) return lane0;
  const Na = A.NODES[e.a], Nb = A.NODES[n.a], d = e.tA + A.edgeRun(e), o = A.laneOff(e, t.lane) + lat(t) + (t.nar || 0) + (t.pull || 0);
  const x = Na.x + e.ux * d + e.rx * o, z = Na.z + e.uz * d + e.rz * o, la = (x - Nb.x) * n.rx + (z - Nb.z) * n.rz;
  let best = lane0, bd = 1e9;
  for (let k = 0; k < nl; k++) { const dd = Math.abs(A.laneOff(n, k) - la); if (dd < bd) { bd = dd; best = k; } }
  return best;
}

/* выбранное заранее следующее ребро (startTurn в game.js), если ещё можно туда */
export function takeNext (t, e) {
  const n = t.nx;
  t.nx = null;
  return FLOW.on && n && t.nxE === e && n.a === e.b && A.okNext(n) ? n : null;
}

/* ── поворотник: два оранжевых огонька (перед и зад) на том боку, куда перестраивается ── */
let BL_GEO = null, BL_MAT = null;
const POOL = [];
function blink (t, side, bt = 0) {
  let b = t.blk;
  if (!side) { if (b) { for (const m of b.m) { if (m.parent) m.parent.remove(m); POOL.push(m); } t.blk = null; } return; }
  const THREE = A.THREE;
  if (!BL_GEO) { BL_GEO = new THREE.BoxGeometry(0.14, 0.1, 0.12); BL_MAT = new THREE.MeshBasicMaterial({ color: 0xffa21a }); BL_GEO.userData.shared = true; BL_MAT.userData.shared = true; }
  if (!b) b = t.blk = { m: [POOL.pop() || new THREE.Mesh(BL_GEO, BL_MAT), POOL.pop() || new THREE.Mesh(BL_GEO, BL_MAT)], side: 0, mesh: null };
  if (b.mesh !== t.mesh || b.side !== side) {       // подменили модель (лёгкая → полная) или сторону
    const hl = (t.hl || 2.2) - 0.08, x = side > 0 ? 0.86 : -0.86;   // +X — левый бок
    for (let i = 0; i < 2; i++) { const m = b.m[i]; t.mesh.add(m); m.position.set(x, 0.78, i ? -hl : hl); }
    b.mesh = t.mesh; b.side = side;
  }
  const on = (bt % 0.7) < 0.4;
  b.m[0].visible = b.m[1].visible = on;
}

export const DEBUG = { FLOW, ST, CUT, cut: why => { CUT.t = 0; return cutIn(why); }, laneFree, leaderOf, lanes: e => A.laneCount(e), off: (e, k) => A.laneOff(e, k) };
