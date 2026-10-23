/* Погоня обиженного водителя — как водит человек (0п49, автор 24.10.2026: «машины преследователя бесят: может ездить
   по кругу, ездит резко и не как человек бы водил; при этом если игрок остановился — и он останавливается и выходит»).
   Кто и когда гонится, награда, облачко и гудки — game.js (chaseStart / chaseDrive / chaseEnd), числа погони — CHASE в
   econ.js; тут — как он ведёт машину. Правила словами — CAREER.md «Обиженный водитель гонится». ?oldchase — по-старому.

   Было: машина поворачивала носом прямо на точку (до 3 рад/с, хоть стоя), скорость — без ограничения рывка; вблизи
   целилась в точку перед твоим носом — ты стоишь, точка стоит, а машина её проскакивает и кружит вокруг; упёрлась в тебя —
   «догнал», и следом удар делал её «злой» — тут же вылезал водитель.
   Стало: машина — «велосипед». Руль (угол колёс) крутится не быстрее RATE рад/с (на скорости — медленнее), поворот
   кузова = скорость × tg(руль) / база: на месте не развернуться, крутой поворот — только на ходу. Газ и тормоз — с
   ограничением рывка (JERK), разгон ACC, тормоз BRAKE (подрезал — HARD). В повороте не быстрее √(A_LAT / кривизна).
   Режимы:
   - 'road' — издали (дальше NEAR м) или когда между вами дом: по улицам маршрутом (svcRoute), руль — «чистое
     преследование» точки маршрута в LOOK м впереди (за угол улицы — не дальше 3 м, чтобы не срезать по тротуару);
     повороты видит за CORNER_D м и тормозит к каждому заранее (90° — CORNER_V[0] м/с); проскочил точку — следующая;
     маршрут заново — раз в REPATH с, если ты уехал дальше REGOAL м; стоит за кем-то BLOCK_T с — протискивается;
   - 'near' — вблизи напрямик, как было по замыслу: сзади не таранит, уходит на соседнюю полосу и обгоняет,
     поравнялся — подрезает, обогнал — тормозит наискосок (game.js по-старому, только руль и педали — человеческие);
   - 'stop' — ты стоишь (медленнее STOP_V дольше STOP_T с): подъезжает и встаёт в GAP м от тебя (на асфальте),
     тормозит плавно; напрямик не подъехать (забор, 8 с) — раз по улицам, потом встаёт где есть;
   - 'wait' — стоит WAIT с, сигналит; потом в FIGHT случаев выходит разбираться (game.js stallCar → дверь, carexit.js),
     иначе сигналит и уезжает. Поехал ты раньше (быстрее GO_V) — снова в погоню;
   - потерял — дальше LOST_D м (или за домом дальше 30 м), или кружит, не приближаясь, — LOST с подряд: сдаётся и уезжает.
   Упёрся или цель внутри круга разворота — сдаёт назад, выкрутив руль в другую сторону (в три приёма), а не кружит. */
import * as TGRID from './trafficgrid.js';

export const CH = {
  old: typeof location !== 'undefined' && /[?&]oldchase\b/.test(location.search),
  L: 2.6,             // м — база машины (между осями)
  STEER: 0.6,         // рад — руль до упора (угол колёс): самый крутой круг ~3,8 м радиусом
  RATE: 0.9,          // рад/с — как быстро крутится руль стоя; на ходу — RATE / (1 + v / RATE_V)
  RATE_V: 8,
  A_LAT: 7,           // м/с² — боковое в повороте (злой, но не каскадёр): быстрее √(A_LAT / кривизна) в поворот не идёт
  ACC: 3.8,           // м/с² — разгон
  BRAKE: 6,           // м/с² — тормоз
  HARD: 9,            // м/с² — по тормозам перед твоим носом
  JERK: 10,           // м/с³ — педаль не дёргается: ускорение меняется не быстрее
  NEAR: 40,           // м — ближе — напрямик
  LOOK: [5, 0.8, 30], // м — куда смотрит по маршруту: 5 + 0,8 × скорость, не дальше 30
  CORNER_D: 60,       // м — повороты маршрута так далеко вперёд видит заранее
  CORNER_V: [8, 26],  // м/с — в поворот 90° и круче — 8 (~30 км/ч), чем положе, тем быстрее (до 26)
  BLOCK_T: 2.5,       // с — стоит за кем-то дольше — протискивается (как курьеры), сигналит
  REPATH: 2.5, REGOAL: 15,
  STOP_V: 1.5,        // м/с — ты стоишь: медленнее этого …
  STOP_T: 0.7,        // с — … дольше этого
  GO_V: 3,            // м/с — поехал
  GAP: [7.5, 10],     // м — встаёт от тебя (середина до середины: между бамперами 3—5 м)
  STOP_DEC: 2.5,      // м/с² — подъезжает, тормозит мягко
  WAIT: [2, 4],       // с — стоит, прежде чем решить
  FIGHT: 0.5,         // доля: выходит разбираться; остальные сигналят и уезжают
  LOST_D: 70,         // м — дальше — «потерял»
  LOST: [10, 20],     // с — потерял столько подряд — сдаётся
  ORBIT: 8,           // с — окно: полный круг за это время, а ближе к тебе не стал — кружит
};

/* замер для проверки (tools/probe-checks/chase-drive.js): рывки руля, развороты на месте, круги — и в ?oldchase */
export const STATS = { frames: 0, secs: 0, jerk: 0, spin: 0, spinEv: 0, laps: 0, backs: 0, touch: 0, wall: 0, orbit: 0, maxYawAcc: 0, maxYaw0: 0, jerkAt: [], stops: [], fights: 0, leaves: 0, lost: 0, modes: {}, lim: {}, touchBy: {} };

let G = null;
/** game.js: { V: () => V, K: () => ECON.CHASE, vmax: () => VMAX, road: (x, z) => ближайшая дорога, svcRoute, svcWall, segHouse, pushOut, poseOnSlope, honk, walkers, wall, hold } */
export function init (deps) { G = deps; }

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const NB = [];
let DT = 0;

/** chaseStart: новое состояние водителя поверх t.chase */
export function start (t) {
  const C = t.chase;
  Object.assign(C, { steer: 0, acc: 0, mode: 'road', slowT: 0, sx: 0, sz: 0, gap: rnd(...CH.GAP), waitT: 0, fight: 0, honks: 0,
    lostT: 0, lostLim: rnd(...CH.LOST), lostChk: 0, hidden: 0, yawSum: 0, yawT: 0, yawD0: 1e9, spinT: 0, repT: 0, passT: 0, yr: 0 });
  t.path = null; t.pi = 0;
}

/** стоит у тебя и решает — часы погони не идут (game.js) */
export const waiting = t => !!(t.chase && t.chase.mode === 'wait');

/* руль и педали: ехать к точке (tx, tz) со скоростью не больше want; brake — каким тормозом гасить */
function steerTo (t, C, tx, tz, want, dt, brake = CH.BRAKE) {
  const v = t.speed, dx = tx - t.x, dz = tz - t.z, ld = Math.max(3, Math.hypot(dx, dz));
  const alpha = wrap(Math.atan2(dx, dz) - t.h);
  // точка внутри круга, который машина описывает с рулём до упора, — вперёд к ней не подъехать, только кружить
  { const R = CH.L / Math.tan(CH.STEER), sg = alpha > 0 ? 1 : -1, cx = t.x + sg * R * Math.cos(t.h), cz = t.z - sg * R * Math.sin(t.h);
    C.inCircle = Math.abs(alpha) > 0.5 && Math.hypot(tx - cx, tz - cz) < R * 1.1 ? sg : 0; }
  let k = 2 * Math.sin(alpha) / ld;                // «чистое преследование»: кривизна дуги через точку
  // точка за спиной: «чистое преследование» дало бы прямо (sin ≈ 0) — разворот до упора, в одну сторону, пока не развернулся
  if (Math.abs(alpha) > Math.PI / 2) { if (!C.uDir) C.uDir = alpha > 0 ? 1 : -1; k = C.uDir * Math.max(2 / ld, Math.tan(CH.STEER) / CH.L); }
  else C.uDir = 0;
  C.wantV = want;
  const dMax = Math.min(CH.STEER, Math.atan(CH.A_LAT * CH.L / Math.max(v * v, 0.01)));
  const target = clamp(Math.atan(CH.L * k), -dMax, dMax);
  const rate = CH.RATE / (1 + v / CH.RATE_V);
  C.steer += clamp(target - C.steer, -rate * dt, rate * dt);
  k = Math.tan(C.steer) / CH.L;
  // в повороте — не быстрее, чем держит дорога; точка сзади — сперва развернуться на малом ходу
  let vt = Math.min(want, Math.sqrt(CH.A_LAT / Math.max(Math.abs(2 * Math.sin(alpha) / ld), 1e-3)));
  if (Math.abs(alpha) > 1.6) vt = Math.min(vt, 4);
  if (Math.abs(alpha) > 1.6 && want > 0.5) vt = Math.max(vt, Math.min(want, 2.5));   // разворачивается на ходу, не стоит
  const aWant = clamp((vt - v) * 1.6, -brake, CH.ACC);
  C.acc += clamp(aWant - C.acc, -CH.JERK * dt * (brake > CH.BRAKE ? 2 : 1), CH.JERK * dt);
  t.speed = Math.max(0, v + C.acc * dt);
  if (t.speed === 0 && C.acc < 0) C.acc = 0;
  t.h = wrap(t.h + t.speed * k * dt);
}

/* упёрся (дом, забор, бордюр, машина): сдать назад, выкрутив руль в другую сторону, — как человек в три приёма */
function backUp (t, C, dt) {
  C.revT -= dt;
  const rate = CH.RATE;
  C.steer += clamp(-C.revDir * CH.STEER - C.steer, -rate * dt, rate * dt);
  const aWant = clamp(((C.revT > 0 ? -2.5 : 0) - t.speed) * 1.6, -CH.BRAKE, CH.BRAKE);
  C.acc += clamp(aWant - C.acc, -CH.JERK * dt, CH.JERK * dt);
  t.speed = Math.max(-3, t.speed + C.acc * dt);
  if (C.revT <= 0) { C.revT = 0; if (t.speed > -0.15) { t.speed = 0; C.acc = 0; } }
  t.h = wrap(t.h + t.speed * Math.tan(C.steer) / CH.L * dt);
}

/* впереди машины и люди: во сколько раз сбросить (злой — машины объезжает по соседней полосе) */
function aheadSlow (t, C) {
  const hx = Math.sin(t.h), hz = Math.cos(t.h);
  let slow = 1, block = 0;
  for (let i = 0, n = TGRID.near(t.x, t.z, 18, NB), L = TGRID.TG.R; i < n; i++) {
    const o = L[i];
    if (o === t || o.gone || Math.abs(o.x - t.x) > 18 || Math.abs(o.z - t.z) > 18) continue;
    if (!o.knock && !o.parked && Math.sin(o.h) * hx + Math.cos(o.h) * hz < -0.3) continue;   // встречная
    const dx = o.x - t.x, dz = o.z - t.z, fw = dx * hx + dz * hz;
    if (fw <= 0 || fw > 16 || Math.abs(-hz * dx + hx * dz) > 1.9) continue;
    block = 1;
    if (C.passT > 0 && !o.knock) continue;          // уже обгоняет по соседней полосе — эту не ждёт
    const k = clamp((fw - (t.hl || 2) - (o.hl || 2) - 1.5) / 7, 0, 1);
    if (k < slow) { slow = k; C.lim = 'car'; }
  }
  for (const list of G.walkers()) for (const p of list) {
    if (p.dead || Math.abs(p.x - t.x) > 13 || Math.abs(p.z - t.z) > 13) continue;
    const dx = p.x - t.x, dz = p.z - t.z, fw = dx * hx + dz * hz;
    if (fw <= 0 || fw > 12 || Math.abs(-hz * dx + hx * dz) > 1.8) continue;
    const k = clamp((fw - 2.4) / 6, 0, 1);
    if (k < slow) { slow = k; C.lim = 'ped'; }
  }
  if (block && slow < 0.5 && C.passT <= 0) C.passT = rnd(1.8, 2.6);   // плетётся за кем-то — на обгон
  // стоит за кем-то (обгон не вышел: стена слева, затор) — через BLOCK_T с протискивается, сигналит
  if (C.ghostT > 0) return 1;
  if (slow < 0.3 && t.speed < 1.5) { if ((C.blockT = (C.blockT || 0) + DT) > CH.BLOCK_T) { C.blockT = 0; C.ghostT = 2; t.honkT = 0; G.honk(t); } }
  else C.blockT = 0;
  return slow;
}

/* по улицам: точка маршрута в LOOK м впереди */
function roadPoint (t, C, V, dt) {
  C.repT -= dt;
  const g = t.goal;
  if (!t.path || t.pi >= t.path.length || (C.repT <= 0 && (!g || Math.hypot(g.x - V.x, g.z - V.z) > CH.REGOAL))) {
    C.repT = CH.REPATH;
    G.svcRoute(t, V.x, V.z);
    // маршрут заново — точки за спиной рядом пропустить: иначе разворот назад к началу улицы
    const P = t.path, hx = Math.sin(t.h), hz = Math.cos(t.h);
    while (P && t.pi < P.length - 1 && (P[t.pi][0] - t.x) * hx + (P[t.pi][1] - t.z) * hz < 0 && Math.hypot(P[t.pi][0] - t.x, P[t.pi][1] - t.z) < 15) t.pi++;
  }
  const P = t.path;
  if (!P || !P.length) return null;
  // точка пройдена: ближе 3,5 м — или проскочил мимо (сзади и ближе 12 м) — следующая; иначе кружил бы вокруг неё
  { const hx = Math.sin(t.h), hz = Math.cos(t.h);
    while (t.pi < P.length - 1) {
      const qx = P[t.pi][0] - t.x, qz = P[t.pi][1] - t.z, l = Math.hypot(qx, qz);
      if (l < 3.5 || (l < 12 && qx * hx + qz * hz < 0)) t.pi++; else break;
    } }
  const look = clamp(CH.LOOK[0] + CH.LOOK[1] * t.speed, CH.LOOK[0], CH.LOOK[2]);
  let px = t.x, pz = t.z, left = look, i = t.pi, turn = 0;
  for (; i < P.length; i++) {
    const qx = P[i][0], qz = P[i][1], l = Math.hypot(qx - px, qz - pz);
    if (l >= left) { px += (qx - px) * left / l; pz += (qz - pz) * left / l; left = 0; break; }
    left -= l;
    // угол улицы: дальше него смотрит не больше чем на 3 м — иначе срезает угол по тротуару в забор
    if (i < P.length - 1) {
      const th = Math.abs(wrap(Math.atan2(P[i + 1][0] - qx, P[i + 1][1] - qz) - Math.atan2(qx - px, qz - pz)));
      if (th > 0.35) left = Math.min(left, 3);
    }
    px = qx; pz = qz;
  }
  // повороты впереди (до CORNER_D м): у каждого — своя скорость (90° — ~6 м/с), тормозить к нему заранее и без рывка
  let vmax = 1e9;
  for (let j = t.pi, run = Math.hypot(P[t.pi][0] - t.x, P[t.pi][1] - t.z); j < P.length - 1 && run < CH.CORNER_D; j++) {
    const a1 = Math.atan2(P[j][0] - (j ? P[j - 1][0] : t.x), P[j][1] - (j ? P[j - 1][1] : t.z)), a2 = Math.atan2(P[j + 1][0] - P[j][0], P[j + 1][1] - P[j][1]);
    const th = Math.abs(wrap(a2 - a1));
    if (th > 0.35) {                               // мелкие изломы маршрута (сдвиг полосы у узла) — не поворот
      const vc = CH.CORNER_V[0] + (CH.CORNER_V[1] - CH.CORNER_V[0]) * Math.pow(1 - Math.min(th, 1.6) / 1.6, 1.5);
      vmax = Math.min(vmax, Math.sqrt(vc * vc + 2 * CH.BRAKE * 0.8 * run));
      turn = Math.max(turn, th);
    }
    run += Math.hypot(P[j + 1][0] - P[j][0], P[j + 1][1] - P[j][1]);
  }
  return { x: px, z: pz, turn, vmax };
}

/* где встать: в gap м от тебя на линии «ты — он», но на асфальте (ближайшая дорога, если она в 6 м), а не на газоне за забором */
function stopPoint (t, C, V, d) {
  const ux = (t.x - V.x) / (d || 1), uz = (t.z - V.z) / (d || 1);
  let x = V.x + ux * C.gap, z = V.z + uz * C.gap;
  const r = G.road(x, z);
  if (r && Math.hypot(r.x - x, r.z - z) < 6) { x = r.x; z = r.z; }
  C.sx = x; C.sz = z; C.vx0 = V.x; C.vz0 = V.z;
}

/** раз в кадр вместо старого chaseDrive (game.js). → null | 'fight' | 'leave' | 'lost' */
export function drive (t, dt) {
  const C = t.chase, V = G.V(), K = G.K();
  if (C.steer === undefined) start(t);
  const dx = V.x - t.x, dz = V.z - t.z, d = Math.hypot(dx, dz);
  const vp = Math.hypot(V.vx, V.vz), fx = Math.sin(V.h), fz = Math.cos(V.h);
  if (t.honkT > 0) t.honkT -= dt;
  if (C.passT > 0) C.passT -= dt;
  if (C.ghostT > 0) C.ghostT -= dt;
  DT = dt;
  t.cruise = G.vmax() * K.VMAX_K;
  // за домом? — раз в 0,5 с
  if ((C.lostChk -= dt) <= 0) { C.lostChk = 0.5; C.hidden = d > 12 && G.segHouse(t.x, t.z, V.x, V.z) ? 1 : 0; }
  // ты стоишь?
  C.slowT = vp < CH.STOP_V ? C.slowT + dt : 0;
  if ((C.mode === 'stop' || C.mode === 'wait') && vp > CH.GO_V) { C.mode = 'near'; C.honks = 0; C.stopFails = 0; }
  if (C.mode === 'stop' && C.hidden) C.mode = 'road';   // между вами дом — подъезжать по улицам, а не сквозь двор
  if (C.mode !== 'stop' && C.mode !== 'wait' && C.slowT > CH.STOP_T && d < CH.NEAR && !C.hidden) {
    C.mode = 'stop'; C.gap = rnd(...CH.GAP); C.stopT = 0; C.touchT = 0; C.stopIn = 0;
    stopPoint(t, C, V, d);
  }
  if (C.mode !== 'stop' && C.mode !== 'wait') C.mode = d > CH.NEAR || C.hidden || C.pathT > 0 ? 'road' : 'near';
  STATS.modes[C.mode] = (STATS.modes[C.mode] || 0) + dt;
  if (C.pathT > 0) C.pathT -= dt;

  let res = null, want = t.cruise;
  const ox = t.x, oz = t.z, oh = t.h;
  if (C.revT > 0 || t.speed < 0) {
    backUp(t, C, dt); want = 0;
  } else if (C.mode === 'wait') {
    steerTo(t, C, t.x + Math.sin(t.h) * 6, t.z + Math.cos(t.h) * 6, 0, dt);
    C.waitT -= dt;
    // сигналит: злой — раз, перед тем как выйти; остальные — два-три раза и уезжают
    if (C.honks < (C.fight ? 1 : 3) && C.waitT < (C.fight ? 1.2 : C.honks === 0 ? C.wait0 - 0.4 : C.honks === 1 ? C.wait0 * 0.5 : 0.3)) { C.honks++; t.honkT = 0; G.honk(t); }
    if (C.waitT <= 0) { res = C.fight ? 'fight' : 'leave'; STATS[C.fight ? 'fights' : 'leaves']++; }
  } else if (C.mode === 'stop') {
    if (Math.hypot(V.x - C.vx0, V.z - C.vz0) > 3) stopPoint(t, C, V, d);   // тебя сдвинуло — точку заново
    const ds = Math.hypot(C.sx - t.x, C.sz - t.z), behind = wrap(Math.atan2(C.sx - t.x, C.sz - t.z) - t.h);
    want = C.stopT > 8 || C.touchT > 1 || C.stopIn ? 0 : Math.min(t.cruise, Math.sqrt(2 * CH.STOP_DEC * Math.max(0, ds - 0.6)));
    if (d < C.gap + 0.5 || (Math.abs(behind) > 1.6 && ds < 12)) want = 0;   // уже рядом (или точка за спиной) — просто встать
    // к тебе лицом: руль — на тебя, когда близко; влетел быстро — тормозит сильнее, но не резче HARD
    const need = t.speed * t.speed / (2 * Math.max(0.5, Math.min(ds, d - C.gap + 1)));
    steerTo(t, C, ds > 4 ? C.sx : V.x, ds > 4 ? C.sz : V.z, want * aheadSlow(t, C), dt, clamp(need * 1.3, CH.BRAKE, CH.HARD));
    C.holdT = t.speed < 0.3 ? (C.holdT || 0) + dt : 0;   // ближе не подъехать (машина впереди, забор) — решает там, где встал
    C.stopT += dt;                                  // подъезжает дольше 8 с — тормозит и решает там, где он есть
    if (C.touch > 0) C.touchT += dt;                // упирается в забор, столб — дальше не лезет
    if (C.inCircle) C.stopIn = 1;                    // точка сбоку, ближе круга разворота — встать тут же, не кружить
    const fail = (C.stopT > 8 || C.touchT > 1) && t.speed < 0.5;
    if (fail && d > 15 && !(C.stopFails > 0)) {      // не подъехать напрямик (забор, газон) — по улицам, потом ещё раз
      C.stopFails = 1; C.mode = 'road'; C.pathT = 5; t.path = null;
    } else if ((want === 0 && t.speed < 0.25) || C.holdT > 2.5 || fail) {
      C.mode = 'wait'; C.wait0 = C.waitT = rnd(...CH.WAIT); C.fight = Math.random() < CH.FIGHT ? 1 : 0; C.honks = 0;
      if (STATS.stops.length < 20) STATS.stops.push({ d: +d.toFixed(1), wait: +C.waitT.toFixed(1), fight: C.fight });
    }
  } else if (C.mode === 'road') {
    const p = roadPoint(t, C, V, dt);
    if (p) {
      want = Math.min(t.cruise, p.vmax);
      let px = p.x, pz = p.z;
      if (C.passT > 0) {                            // обгон по соседней полосе (слева)
        const lx = px + Math.cos(t.h) * 3.3, lz = pz - Math.sin(t.h) * 3.3;
        if (!G.wall(lx, lz)) { px = lx; pz = lz; } else C.passT = 0;
      }
      const E = t.path[t.path.length - 1], dEnd = Math.hypot(E[0] - t.x, E[1] - t.z);
      want = Math.min(want, 3 + Math.sqrt(2 * CH.BRAKE * 0.6 * dEnd));   // к концу маршрута (где ты был) — сбрасывает заранее
      const sl = aheadSlow(t, C), hd = G.hold(t, dt);
      if (hd < sl) C.lim = 'hold';
      const why = Math.min(sl, hd) < 0.6 ? C.lim : want < t.cruise * 0.7 ? 'corner' : 'free';   // что держит по улицам (замер)
      STATS.lim[why] = (STATS.lim[why] || 0) + dt;
      steerTo(t, C, px, pz, want * Math.min(sl, hd), dt);
    } else steerTo(t, C, V.x, V.z, 6, dt);
  } else {
    // вблизи — напрямик: точка у твоего носа; обогнал — тормозит наискосок
    const along = -(dx * fx + dz * fz), side = -(dx * fz - dz * fx);
    if (C.brakeCd > 0) C.brakeCd -= dt;
    if (C.brakeT <= 0 && C.brakeCd <= 0 && along > 3.5 && along < 16 && Math.abs(side) < 2.4 && vp > 5) {
      C.brakeT = K.BRAKE_S; C.brakeCd = 5; t.honkT = 0; G.honk(t);
    }
    if (C.brakeT > 0) {
      C.brakeT -= dt;
      const th = V.h + C.swerve * 0.55;             // встаёт наискосок поперёк полосы
      steerTo(t, C, t.x + Math.sin(th) * 8, t.z + Math.cos(th) * 8, 0, dt, CH.HARD);
    } else {
      // сзади — уходит на соседнюю полосу (обгон), поравнялся — подрезает к твоей полосе
      const lead = clamp(d / 12, 0.3, 1.2), off = along < 2 ? 3.6 * C.swerve : clamp(3.6 - (along - 2) * 0.9, 0, 3.6) * C.swerve;
      const tx = V.x + V.vx * lead + fx * (along < 2 ? 4 : 8) + fz * off, tz = V.z + V.vz * lead + fz * (along < 2 ? 4 : 8) - fx * off;
      want = Math.min(t.cruise, vp + K.CATCH + (along < -6 ? 4 : 0));
      if (along < 0 && along > -10 && Math.abs(side) < 2.2) want = Math.min(want, vp + 1);   // прямо за тобой — не таранит в зад
      // нагоняет сзади в твоей полосе — сбрасывает заранее, чтобы тормозить без рывка (не быстрее, чем успеет погасить)
      if (along < 0 && Math.abs(side) < 2.8) want = Math.min(want, vp + Math.sqrt(2 * CH.BRAKE * 0.6 * Math.max(0, -along - 7)));
      // ты рядом и медленно (ещё не «стоишь») — не крутиться вокруг: тише
      if (vp < 4 && d < 14) want = Math.min(want, Math.max(0, d - C.gap) * 0.8);
      steerTo(t, C, tx, tz, want, dt);
    }
  }
  t.x += Math.sin(t.h) * t.speed * dt; t.z += Math.cos(t.h) * t.speed * dt;
  if (G.svcWall(t, ox, oz, dt)) { C.acc = Math.min(C.acc, 0); t.h = oh; C.touch = 2; STATS.wall++; }   // нос в доме — шаг отменён (game.js svcWall), и поворот тоже: стоя не крутится
  const bx = t.x, bz = t.z;
  G.pushOut(t, 1.1);                               // забор, столб — не сквозь
  if (bx !== t.x || bz !== t.z) {                 // трётся боком — теряет ход, но не встаёт как вкопанный
    t.speed *= Math.max(0, 1 - 3 * dt);
    if (Math.hypot(bx - t.x, bz - t.z) > 0.04) C.touch = 2;   // заметный толчок, не сантиметровое касание
  }
  // цель внутри круга разворота (вблизи, на малом ходу) — сдать назад с рулём в другую сторону, а не наматывать круги
  if ((C.mode === 'near' || C.mode === 'road') && C.inCircle && !(C.revT > 0) && t.speed >= 0 && t.speed < 5 && C.wantV > 1) {
    if ((C.circT = (C.circT || 0) + dt) > 0.6) { C.circT = 0; C.revT = rnd(1.2, 1.8); C.revDir = C.inCircle; STATS.backs++; }
  } else C.circT = 0;
  // упёрся — сдать назад; второй раз подряд — ещё и по улицам
  if (!(C.revT > 0) && t.speed >= 0 && C.wantV > 2 && t.speed < Math.min(2.5, C.wantV * 0.5) && !(C.blockT > 0)) {   // хочет ехать, а ползёт (трётся о забор, упёрся)
    if ((C.stuckT += dt) > 1.2) {
      C.stuckT = 0; C.revT = rnd(1.2, 1.8); STATS.backs++;
      const a = wrap(Math.atan2(V.x - t.x, V.z - t.z) - t.h); C.revDir = a > 0 ? 1 : -1;
      if (C.lastRev > 0) { C.pathT = 4; t.path = null; }
      C.lastRev = 8;
    }
  } else C.stuckT = 0;
  if (C.lastRev > 0) C.lastRev -= dt;
  // кружит? полный круг за ORBIT с, а ближе не стал
  const yaw = wrap(t.h - (C.h0 === undefined ? t.h : C.h0)); C.h0 = t.h;
  C.yawSum += yaw; C.yawT += dt;
  if (Math.abs(C.yawSum) > Math.PI * 2) {
    if (d > C.yawD0 - 8) { STATS.orbit++; C.lostT += 4; C.pathT = 4; t.path = null; }
    C.yawSum = 0; C.yawT = 0; C.yawD0 = d;
  } else if (C.yawT > CH.ORBIT) { C.yawSum = 0; C.yawT = 0; C.yawD0 = d; }
  // потерял?
  const lost = d > CH.LOST_D || (C.hidden && d > 30);   // за углом рядом — ещё не потерял
  C.lostT = lost ? C.lostT + dt : Math.max(0, C.lostT - 2 * dt);
  if (!res && C.mode !== 'wait' && C.lostT > C.lostLim) { res = 'lost'; STATS.lost++; }
  // колёса
  t.wheel += t.speed * dt / 0.46;
  for (const w of t.mesh.userData.wheels || []) w.rotation.x = t.wheel;
  for (const s of t.mesh.userData.steer || []) s.rotation.y = C.steer;
  G.poseOnSlope(t);
  return res;
}

/** замер после кадра погони (и новой, и ?oldchase): рывок руля — поворот кузова меняется быстрее 3 рад/с²;
    разворот на месте — кузов поворачивается быстрее 0,8 рад/с медленнее 2,5 м/с */
export function meter (t, h0, x0, z0, dt) {
  if (!(dt > 0) || t.knock) return;
  const C = t.chase || {}, yr = wrap(t.h - h0) / dt, v = Math.hypot(t.x - x0, t.z - z0) / dt, touch = C.touch > 0;
  STATS.frames++; STATS.secs += dt;
  // круги (и в старой): полный оборот кузова за 8 с
  C.myS = (C.myS || 0) + wrap(t.h - h0); C.myT = (C.myT || 0) + dt;
  if (Math.abs(C.myS) > Math.PI * 2) { STATS.laps++; C.myS = 0; C.myT = 0; }
  else if (C.myT > 8) { C.myS = 0; C.myT = 0; }
  const ya = C.myr !== undefined ? Math.abs(yr - C.myr) / dt : 0;
  C.myr = yr;
  if (touch) { C.touch--; STATS.touch++; STATS.touchBy[C.mode] = (STATS.touchBy[C.mode] || 0) + 1; return; }   // упёрся в стену / забор — кузов дёрнуло ударом, это не руль
  if (ya > STATS.maxYawAcc) STATS.maxYawAcc = +ya.toFixed(2);
  if (ya > 3) { STATS.jerk++; if (STATS.jerkAt.length < 12) STATS.jerkAt.push([C.mode, +(t.speed || 0).toFixed(1), +(C.steer || 0).toFixed(2), +yr.toFixed(2), +dt.toFixed(3), C.revT > 0 ? 'rev' : '']); }
  if (v < 2.5 && Math.abs(yr) > Math.abs(STATS.maxYaw0)) STATS.maxYaw0 = +yr.toFixed(2);
  if (v < 2.5 && Math.abs(yr) > 0.8) { STATS.spin++; if ((C.mspin = (C.mspin || 0) + dt) > 0.3 && !C.mspinEv) { C.mspinEv = 1; STATS.spinEv++; } }
  else { C.mspin = 0; C.mspinEv = 0; }
}
