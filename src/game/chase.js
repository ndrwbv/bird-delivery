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
     преследование» точки маршрута в LOOK м впереди; маршрут заново — раз в REPATH с, если ты уехал дальше REGOAL м;
   - 'near' — вблизи напрямик, как было по замыслу: сзади не таранит, уходит на соседнюю полосу и обгоняет,
     поравнялся — подрезает, обогнал — тормозит наискосок (game.js по-старому, только руль и педали — человеческие);
   - 'stop' — ты стоишь (медленнее STOP_V дольше STOP_T с): подъезжает и встаёт в GAP м от тебя, тормозит плавно;
   - 'wait' — стоит WAIT с, сигналит; потом в FIGHT случаев выходит разбираться (game.js stallCar → дверь, carexit.js),
     иначе сигналит и уезжает. Поехал ты раньше (быстрее GO_V) — снова в погоню;
   - потерял — дальше LOST_D м, за домом или кружит, не приближаясь, — LOST с подряд: сдаётся и уезжает. */
import * as TGRID from './trafficgrid.js';

export const CH = {
  old: typeof location !== 'undefined' && /[?&]oldchase\b/.test(location.search),
  L: 2.6,             // м — база машины (между осями)
  STEER: 0.6,         // рад — руль до упора (угол колёс): самый крутой круг ~3,8 м радиусом
  RATE: 0.9,          // рад/с — как быстро крутится руль стоя; на ходу — RATE / (1 + v / RATE_V)
  RATE_V: 8,
  A_LAT: 5.5,         // м/с² — боковое в повороте: быстрее √(A_LAT / кривизна) в поворот не идёт
  ACC: 3.8,           // м/с² — разгон
  BRAKE: 6,           // м/с² — тормоз
  HARD: 9,            // м/с² — по тормозам перед твоим носом
  JERK: 10,           // м/с³ — педаль не дёргается: ускорение меняется не быстрее
  NEAR: 40,           // м — ближе — напрямик
  LOOK: [5, 0.5, 16], // м — куда смотрит по маршруту: 5 + 0,5 × скорость, не дальше 16
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
export const STATS = { frames: 0, secs: 0, jerk: 0, spin: 0, spinEv: 0, laps: 0, backs: 0, orbit: 0, maxYawAcc: 0, maxYaw0: 0, jerkAt: [], stops: [], fights: 0, leaves: 0, lost: 0, modes: {} };

let G = null;
/** game.js: { V: () => V, K: () => ECON.CHASE, vmax: () => VMAX, svcRoute, svcWall, segHouse, pushOut, poseOnSlope, honk, walkers, wall, hold } */
export function init (deps) { G = deps; }

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const NB = [];

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
    slow = Math.min(slow, clamp((fw - (t.hl || 2) - (o.hl || 2) - 1.5) / 7, 0, 1));
  }
  for (const list of G.walkers()) for (const p of list) {
    if (p.dead || Math.abs(p.x - t.x) > 13 || Math.abs(p.z - t.z) > 13) continue;
    const dx = p.x - t.x, dz = p.z - t.z, fw = dx * hx + dz * hz;
    if (fw <= 0 || fw > 12 || Math.abs(-hz * dx + hx * dz) > 1.8) continue;
    slow = Math.min(slow, clamp((fw - 2.4) / 6, 0, 1));
  }
  if (block && slow < 0.5 && C.passT <= 0) C.passT = rnd(1.8, 2.6);   // плетётся за кем-то — на обгон
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
  while (t.pi < P.length - 1 && Math.hypot(P[t.pi][0] - t.x, P[t.pi][1] - t.z) < 3.5) t.pi++;
  const look = clamp(CH.LOOK[0] + CH.LOOK[1] * t.speed, CH.LOOK[0], CH.LOOK[2]);
  let px = t.x, pz = t.z, left = look, i = t.pi, turn = 0;
  for (; i < P.length; i++) {
    const qx = P[i][0], qz = P[i][1], l = Math.hypot(qx - px, qz - pz);
    if (l >= left) { px += (qx - px) * left / l; pz += (qz - pz) * left / l; left = 0; break; }
    left -= l; px = qx; pz = qz;
  }
  // поворот впереди (до 25 м) — сбросить заранее
  for (let j = t.pi, run = Math.hypot(P[t.pi][0] - t.x, P[t.pi][1] - t.z); j < P.length - 1 && run < 25; j++) {
    const a1 = Math.atan2(P[j][0] - (j ? P[j - 1][0] : t.x), P[j][1] - (j ? P[j - 1][1] : t.z)), a2 = Math.atan2(P[j + 1][0] - P[j][0], P[j + 1][1] - P[j][1]);
    turn = Math.max(turn, Math.abs(wrap(a2 - a1)));
    run += Math.hypot(P[j + 1][0] - P[j][0], P[j + 1][1] - P[j][1]);
  }
  return { x: px, z: pz, turn };
}

/** раз в кадр вместо старого chaseDrive (game.js). → null | 'fight' | 'leave' | 'lost' */
export function drive (t, dt) {
  const C = t.chase, V = G.V(), K = G.K();
  if (C.steer === undefined) start(t);
  const dx = V.x - t.x, dz = V.z - t.z, d = Math.hypot(dx, dz);
  const vp = Math.hypot(V.vx, V.vz), fx = Math.sin(V.h), fz = Math.cos(V.h);
  if (t.honkT > 0) t.honkT -= dt;
  if (C.passT > 0) C.passT -= dt;
  t.cruise = G.vmax() * K.VMAX_K;
  // за домом? — раз в 0,5 с
  if ((C.lostChk -= dt) <= 0) { C.lostChk = 0.5; C.hidden = d > 12 && G.segHouse(t.x, t.z, V.x, V.z) ? 1 : 0; }
  // ты стоишь?
  C.slowT = vp < CH.STOP_V ? C.slowT + dt : 0;
  if ((C.mode === 'stop' || C.mode === 'wait') && vp > CH.GO_V) { C.mode = 'near'; C.honks = 0; }
  if (C.mode !== 'stop' && C.mode !== 'wait' && C.slowT > CH.STOP_T && d < CH.NEAR && !C.hidden) {
    C.mode = 'stop'; C.gap = rnd(...CH.GAP);
    const ux = (t.x - V.x) / (d || 1), uz = (t.z - V.z) / (d || 1);
    C.sx = V.x + ux * C.gap; C.sz = V.z + uz * C.gap; C.vx0 = V.x; C.vz0 = V.z;
  }
  if (C.mode !== 'stop' && C.mode !== 'wait') C.mode = d > CH.NEAR || C.hidden || C.pathT > 0 ? 'road' : 'near';
  STATS.modes[C.mode] = (STATS.modes[C.mode] || 0) + dt;
  if (C.pathT > 0) C.pathT -= dt;

  let res = null, want = t.cruise;
  const ox = t.x, oz = t.z;
  if (C.revT > 0 || t.speed < 0) {
    backUp(t, C, dt); want = 0;
  } else if (C.mode === 'wait') {
    steerTo(t, C, t.x + Math.sin(t.h) * 6, t.z + Math.cos(t.h) * 6, 0, dt);
    C.waitT -= dt;
    // сигналит: злой — раз, перед тем как выйти; остальные — два-три раза и уезжают
    if (C.honks < (C.fight ? 1 : 3) && C.waitT < (C.fight ? 1.2 : C.honks === 0 ? C.wait0 - 0.4 : C.honks === 1 ? C.wait0 * 0.5 : 0.3)) { C.honks++; t.honkT = 0; G.honk(t); }
    if (C.waitT <= 0) { res = C.fight ? 'fight' : 'leave'; STATS[C.fight ? 'fights' : 'leaves']++; }
  } else if (C.mode === 'stop') {
    if (Math.hypot(V.x - C.vx0, V.z - C.vz0) > 3) {   // тебя сдвинуло — точку заново
      const ux = (t.x - V.x) / (d || 1), uz = (t.z - V.z) / (d || 1);
      C.sx = V.x + ux * C.gap; C.sz = V.z + uz * C.gap; C.vx0 = V.x; C.vz0 = V.z;
    }
    const ds = Math.hypot(C.sx - t.x, C.sz - t.z), behind = wrap(Math.atan2(C.sx - t.x, C.sz - t.z) - t.h);
    want = Math.min(t.cruise, Math.sqrt(2 * CH.STOP_DEC * Math.max(0, ds - 0.6)));
    if (d < C.gap + 0.5 || (Math.abs(behind) > 1.6 && ds < 12)) want = 0;   // уже рядом (или точка за спиной) — просто встать
    // к тебе лицом: руль — на тебя, когда близко; влетел быстро — тормозит сильнее, но не резче HARD
    const need = t.speed * t.speed / (2 * Math.max(0.5, Math.min(ds, d - C.gap + 1)));
    steerTo(t, C, ds > 4 ? C.sx : V.x, ds > 4 ? C.sz : V.z, want * aheadSlow(t, C), dt, clamp(need * 1.3, CH.BRAKE, CH.HARD));
    if (want === 0 && t.speed < 0.25) {
      C.mode = 'wait'; C.wait0 = C.waitT = rnd(...CH.WAIT); C.fight = Math.random() < CH.FIGHT ? 1 : 0; C.honks = 0;
      if (STATS.stops.length < 20) STATS.stops.push({ d: +d.toFixed(1), wait: +C.waitT.toFixed(1), fight: C.fight });
    }
  } else if (C.mode === 'road') {
    const p = roadPoint(t, C, V, dt);
    if (p) {
      want = t.cruise * (1 - (1 - 0.55) * clamp(p.turn / 1.5, 0, 1));
      let px = p.x, pz = p.z;
      if (C.passT > 0) {                            // обгон по соседней полосе (слева)
        const lx = px + Math.cos(t.h) * 3.3, lz = pz - Math.sin(t.h) * 3.3;
        if (!G.wall(lx, lz)) { px = lx; pz = lz; } else C.passT = 0;
      }
      if (t.pi >= t.path.length - 1) want = Math.min(want, 1.5 + Math.hypot(px - t.x, pz - t.z) * 0.7);
      steerTo(t, C, px, pz, want * Math.min(aheadSlow(t, C), G.hold(t, dt)), dt);
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
  if (G.svcWall(t, ox, oz, dt)) C.acc = Math.min(C.acc, 0);   // нос в доме — шаг отменён (game.js svcWall)
  const bx = t.x, bz = t.z;
  G.pushOut(t, 1.1);                               // забор, столб — не сквозь
  if (bx !== t.x || bz !== t.z) t.speed *= Math.max(0, 1 - 3 * dt);   // трётся боком — теряет ход, но не встаёт как вкопанный
  // упёрся — сдать назад; второй раз подряд — ещё и по улицам
  if (!(C.revT > 0) && t.speed >= 0 && C.wantV > 3 && t.speed < 1.2) {
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
  const C = t.chase || {}, yr = wrap(t.h - h0) / dt, v = Math.hypot(t.x - x0, t.z - z0) / dt;
  STATS.frames++; STATS.secs += dt;
  if (C.myr !== undefined) {
    const ya = Math.abs(yr - C.myr) / dt;
    if (ya > STATS.maxYawAcc) STATS.maxYawAcc = +ya.toFixed(2);
    if (ya > 3) { STATS.jerk++; if (STATS.jerkAt.length < 12) STATS.jerkAt.push([C.mode, +(t.speed || 0).toFixed(1), +(C.steer || 0).toFixed(2), +yr.toFixed(2), +C.myr.toFixed(2), +dt.toFixed(3), C.revT > 0 ? 'rev' : '']); }
  }
  C.myr = yr;
  if (v < 2.5 && Math.abs(yr) > Math.abs(STATS.maxYaw0)) STATS.maxYaw0 = +yr.toFixed(2);
  if (v < 2.5 && Math.abs(yr) > 0.8) { STATS.spin++; if ((C.mspin = (C.mspin || 0) + dt) > 0.3 && !C.mspinEv) { C.mspinEv = 1; STATS.spinEv++; } }
  else { C.mspin = 0; C.mspinEv = 0; }
  // круги (и в старой): полный оборот кузова за 8 с
  C.myS = (C.myS || 0) + wrap(t.h - h0); C.myT = (C.myT || 0) + dt;
  if (Math.abs(C.myS) > Math.PI * 2) { STATS.laps++; C.myS = 0; C.myT = 0; }
  else if (C.myT > 8) { C.myS = 0; C.myT = 0; }
}
