/* ──────────────────────────────────────────────────────────────────────────
   Люди уворачиваются от машины (автор 23.10.2026, 12аф: «машина едет рядом — человек отходит, отбегает или
   отпрыгивает в сторону; иногда карикатурно — прыжок с кувырком»). Правила словами — docs/CAREER.md «Уворот от машины».

   Кто: прохожие на тротуарах, дворовых дорожках и зебрах (game.js PEOPLE). Не уворачиваются: гость, который ждёт пиццу,
   клиент с коробкой, сидящий, ждущий поручения, упавший, в панике.
   От чего: от твоей машины, когда она едет на человека — он в полосе кузова (полширины + REACH м) и машина доедет
   до него за LOOK с (и не дальше FAR м). Летящая выше — над головами, не уворачиваются.
   Заметил ли: лицом к машине — SEE, спиной (только слышит) — HEAR; не заметил — зевака, стоит как шёл (его можно сбить).
   Заметил — через REACT с (испуг) уходит поперёк хода машины, в сторону от её линии; там стена или твёрдое — в другую;
   обе заняты — замирает, руки вверх. Как уходит — от скорости машины:
     • медленнее WALK_V м/с — отходит шагом (STEP_SP м/с), лицом туда, куда идёт;
     • до RUN_V м/с — отбегает вбок лицом к машине (клип «Run_Left / Run_Right» у мужчин и женщин Quaternius;
       у цельных женщин и коробочных — разворачивается и бежит), SIDE_SP м/с;
     • быстрее — отпрыгивает: бегом вбок с подскоком (LEAP_SP м/с), а с вероятностью ROLL — прыжок с кувырком
       (клип «Roll», ROLL_T с, ROLL_SP м/с; у кого клипа нет — прыжок повыше). И на средней скорости изредка (ROLL_MID) — кувырок.
   Уходит на столько, чтобы кузов прошёл мимо с запасом CLEAR м (не меньше MIN, не больше MAX м). Потом стоит
   LOOK_T с, смотрит на машину (иногда сердится), и шагом возвращается туда, где ушёл с пути, — и идёт дальше.
   Сквозь твёрдое не уходит: каждый шаг — через pedcollide.js steer (стена, забор, машина впереди — сворачивает).

   Отладка: __dlv.PDODGE (DG — числа, ST — счёт: заметили / не заметили / как ушли / сбиты во время уворота).
   ────────────────────────────────────────────────────────────────────────── */
import * as PEDC from './pedcollide.js';
import { qHas } from './qpeople.js';

export const DG = {
  on: !(typeof location !== 'undefined' && /[?&]nododge\b/.test(location.search || '')),
  NEAR: 30,       // м: дальше — не смотрим
  MIN_V: 1.5,     // м/с: машина медленнее — не уворачиваются (стоящую обходят, pedcollide.js)
  LOOK: 1.1,      // с: машина доедет за столько — пора уходить (медленнее WALK_V — за LOOK_SLOW: шагом уходить дольше)
  LOOK_SLOW: 2.4,
  FAR: 22,        // м: и не дальше
  REACH: 0.7,     // м: к полуширине кузова — «в полосе»
  SEE: 0.85, HEAR: 0.55,   // заметил: лицом к машине / спиной
  REACT: [0.08, 0.28],   // с: испуг перед тем, как уйти
  WALK_V: 4,      // м/с: медленнее — шагом
  RUN_V: 11,      // м/с: медленнее — бегом вбок, быстрее — отпрыгивает
  STEP_SP: 1.8, SIDE_SP: 3.6, LEAP_SP: 5.2, ROLL_SP: 3.6,
  ROLL: 0.4, ROLL_MID: 0.12, ROLL_T: 0.8,
  HOP: 0.32,      // м: подскок при прыжке (у кого нет кувырка — HOP × 1,6)
  CLEAR: 0.75, MIN: 1.1, MAX: 3.2,
  LOOK_T: [0.5, 1.3],    // с: стоит и смотрит вслед
  BACK_T: 8,      // с: не дошёл обратно — на ближайший тротуар (game.js walkBack)
  COOL: 1.2,      // с: не заметил — столько не смотрит снова
};
export const ST = { seen: 0, missed: 0, walk: 0, side: 0, leap: 0, roll: 0, freeze: 0, hitDuring: 0, done: 0, stuck: 0, clips: {} };

let A = null;
/** api: V, CAR_L, CAR_W, walkBack, groundH, curbAt, pushOut, emote, rand, chance, inHouse, intro() */
export function init (api) { A = api; }

const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const turn = (g, a, k, dt) => { g.rotation.y += wrap(a - g.rotation.y) * (1 - Math.exp(-k * dt)); };
const freeAt = (x, z) => !PEDC.solidAt(x, z, 0.25) && !A.inHouse(x, z);

/** каждый кадр — на идущего прохожего (game.js updatePeople, до шага). true — начал уворот (шаг ходьбы в этот кадр не делать) */
export function watch (p, dt, alert = false) {
  if (!DG.on || !A) return false;
  if (p.dgCool > 0) { p.dgCool -= dt; return false; }
  const V = A.V;
  if (V.air || p.guest || p.after || p.idle || p.errand || p.fall || p.panic || p.bike) return false;
  const dx = p.x - V.x, dz = p.z - V.z;
  if (dx > DG.NEAR || dx < -DG.NEAR || dz > DG.NEAR || dz < -DG.NEAR) return false;
  const sp = Math.sqrt(V.vx * V.vx + V.vz * V.vz);
  if (sp < DG.MIN_V) return false;
  if (A.intro && A.intro()) return false;
  const ux = V.vx / sp, uz = V.vz / sp;
  const along = dx * ux + dz * uz, across = dx * uz - dz * ux;
  const CL = A.CAR_L, CW = A.CAR_W;
  if (along < -CL * 0.3 || along > Math.min(DG.FAR, CL + sp * (sp < DG.WALK_V ? DG.LOOK_SLOW : DG.LOOK))) return false;
  if (Math.abs(across) > CW + DG.REACH) return false;
  // заметил?
  const g = p.grp, fx = Math.sin(g.rotation.y), fz = Math.cos(g.rotation.y);
  const facing = -(dx * fx + dz * fz) > 0;                 // машина у него перед лицом
  if (!alert) {                                            // уже смотрит на машину (только что уворачивался) — замечает всегда
    ST.seen++;
    if (Math.random() > (facing ? DG.SEE : DG.HEAR)) { ST.missed++; p.dgCool = DG.COOL; return false; }
  }
  // куда: поперёк хода машины, от её линии; там твёрдое — в другую сторону
  let s = across >= 0 ? 1 : -1;
  if (Math.abs(across) < 0.25 && Math.random() < 0.5) s = -s;
  const need = s0 => Math.max(DG.MIN, Math.min(DG.MAX, CW + DG.CLEAR + 0.35 - across * s0));   // сколько уйти: across·s — уже на той стороне
  let ex = uz * s, ez = -ux * s;
  if (!freeAt(p.x + ex * Math.min(need(s), 1.5), p.z + ez * Math.min(need(s), 1.5))) {
    ex = -ex; ez = -ez; s = -s;
    if (!freeAt(p.x + ex * 1.2, p.z + ez * 1.2)) {         // обе стороны заняты — замирает
      ST.freeze++;
      p.dg = { grp: g, ph: 'freeze', t: 0, T: 0.9, sx: p.x, sz: p.z, ex: 0, ez: 0, d: 0, sp: 0, mode: 'freeze', cx: V.x, cz: V.z, wait: 0 };
      return true;
    }
  }
  let mode = sp < DG.WALK_V ? 'walk' : sp < DG.RUN_V ? 'side' : 'leap';
  const roll = qHas(g, 'roll');
  if (mode === 'leap' && Math.random() < DG.ROLL) mode = 'roll';
  else if (mode === 'side' && Math.random() < DG.ROLL_MID) mode = 'roll';
  const spd = mode === 'walk' ? DG.STEP_SP : mode === 'side' ? DG.SIDE_SP : mode === 'leap' ? DG.LEAP_SP : DG.ROLL_SP;
  ST[mode]++;
  p.dg = {
    grp: g, ph: 'react', t: 0, wait: A.rand(DG.REACT[0], DG.REACT[1]),
    sx: p.x, sz: p.z, ex, ez, d: need(s), sp: spd, mode, roll: mode === 'roll' && roll, cx: V.x, cz: V.z,
    side: mode !== 'walk' && qHas(g, 'runl'), T: 0,
  };
  return true;
}

function clearAnim (p) {
  const u = p.grp && p.grp.userData;
  if (!u) return;
  u.qSide = 0;
  if (u.qAnim && u.qAnim.c === 'roll') u.qAnim = null;
  if (u.armL) { u.armL.rotation.z = 0; u.armR.rotation.z = 0; }
  if (u.parts && u.parts[2]) u.parts[2].rotation.x = 0;
}
/** прервать (упал, сбит, стал гостем…) */
export function stop (p) { if (p.dg) { clearAnim(p); p.dg = null; } }

/** каждый кадр, пока уворачивается (game.js updatePeople). false — уворота нет (ходит как обычно) */
export function step (p, dt) {
  const D = p.dg;
  if (!D) return false;
  if (p.dead || p.grp !== D.grp) { if (D.ph !== 'back' && D.ph !== 'look') ST.hitDuring++; p.dg = null; return false; }   // сбит / заново родился
  if (p.fall || p.guest || p.after || p.idle || p.panic) { if (p.fall && (D.ph === 'react' || D.ph === 'go')) ST.hitDuring++; stop(p); return false; }
  const V = A.V, g = p.grp, u = g.userData;
  D.t += dt;
  let hop = 0, sw = 0;
  const faceCar = Math.atan2(V.x - p.x, V.z - p.z);
  if (D.ph === 'freeze' || D.ph === 'react') {
    // испуг: замер, руки вверх
    if (u.armL) { u.armL.rotation.x += (-2.7 - u.armL.rotation.x) * Math.min(1, dt * 14); u.armR.rotation.x += (-2.7 - u.armR.rotation.x) * Math.min(1, dt * 14); u.armL.rotation.z = -0.3; u.armR.rotation.z = 0.3; }
    turn(g, faceCar, 10, dt);
    u.legL.rotation.x *= 0.8; u.legR.rotation.x *= 0.8;
    if (D.ph === 'freeze' && D.t > D.T) { D.ph = 'look'; D.t = 0; D.T = A.rand(DG.LOOK_T[0], DG.LOOK_T[1]); }
    if (D.ph === 'react' && D.t > D.wait) {
      D.ph = 'go'; D.t = 0; D.T = D.roll ? DG.ROLL_T : D.d / D.sp;
      if (u.armL) { u.armL.rotation.z = 0; u.armR.rotation.z = 0; }
      ST.clips[D.roll ? 'roll' : D.side ? 'runlr' : D.mode === 'walk' ? 'walk' : 'run'] = (ST.clips[D.roll ? 'roll' : D.side ? 'runlr' : D.mode === 'walk' ? 'walk' : 'run'] || 0) + 1;
    }
  } else if (D.ph === 'go') {
    const k = Math.min(1, D.t / D.T);
    // в конце уворота — тише (не стоп с разгона)
    const v = D.sp * (D.roll ? (k < 0.75 ? 1 : 0.5) : (k < 0.8 ? 1 : 0.6));
    const ox = p.x, oz = p.z;
    const a = PEDC.steer(p, D.ex, D.ez, v * dt);
    A.pushOut(p, 0.45);
    if (Number.isNaN(a)) { ST.stuck++; D.ph = 'look'; D.t = 0; D.T = A.rand(DG.LOOK_T[0], DG.LOOK_T[1]); }
    const mx = p.x - ox, mz = p.z - oz;
    if (D.roll) {
      u.qAnim = { c: 'roll', f: k };
      if (mx || mz) turn(g, Math.atan2(mx, mz), 16, dt);
      u.legL.rotation.x = u.legR.rotation.x = 0;
    } else {
      p.ph += dt * (D.mode === 'walk' ? 7 : 15);
      sw = Math.sin(p.ph) * (D.mode === 'walk' ? 0.8 : 1.1);
      if (D.side) {
        // бег вбок лицом к машине: клип художника (qpeople.js u.qSide), шаг — в сторону
        turn(g, faceCar, 10, dt);
        const lx = Math.cos(g.rotation.y), lz = -Math.sin(g.rotation.y);   // левая рука в мире (модель смотрит по +z, левая — +x)
        u.qSide = mx * lx + mz * lz >= 0 ? 1 : -1;
      } else if (mx || mz) turn(g, Math.atan2(mx, mz), 14, dt);
      if (D.mode === 'leap') hop = Math.sin(Math.PI * k) * DG.HOP;
    }
    if (D.mode === 'roll' && !D.roll) hop = Math.sin(Math.PI * k) * DG.HOP * 1.6;   // кувырка у модели нет — прыжок повыше
    if (k >= 1 && D.ph === 'go') { clearAnim(p); D.ph = 'look'; D.t = 0; D.T = A.rand(DG.LOOK_T[0], DG.LOOK_T[1]); if (A.chance(0.3) && A.emote) A.emote(p.x, 2.3, p.z, 'angry', 1); }
  } else if (D.ph === 'look') {
    // стоит, смотрит вслед; машина снова едет на него — уворачивается ещё раз (откуда шёл — то же место)
    turn(g, faceCar, 6, dt);
    u.legL.rotation.x *= 0.8; u.legR.rotation.x *= 0.8;
    if (u.armL) { u.armL.rotation.x *= 0.85; u.armR.rotation.x *= 0.85; u.armL.rotation.z = 0; u.armR.rotation.z = 0; }
    if (D.t > D.T) { D.ph = 'back'; D.t = 0; }
    else if (again(p, D)) return true;
  } else {
    // назад, туда, где ушёл с пути — шагом; оттуда пойдёт дальше своей дорогой
    const dx = D.sx - p.x, dz = D.sz - p.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.05 || D.t > DG.BACK_T) {
      clearAnim(p);
      if (d >= 0.05) A.walkBack(p);   // не дошёл (там машина) — на ближайший тротуар
      else { p.x = D.sx; p.z = D.sz; }
      p.dg = null; p.dgCool = 0.6; ST.done++;
      return false;
    }
    if (again(p, D)) return true;
    const a = PEDC.steer(p, dx / d, dz / d, Math.min(d, p.speed * dt));
    A.pushOut(p, 0.45);
    p.ph += dt * 7;
    sw = Math.sin(p.ph) * 0.8;
    if (!Number.isNaN(a)) turn(g, a, 8, dt);
  }
  u.legL.rotation.x = D.ph === 'go' || D.ph === 'back' ? sw : u.legL.rotation.x;
  u.legR.rotation.x = D.ph === 'go' || D.ph === 'back' ? -sw : u.legR.rotation.x;
  if ((D.ph === 'go' && !D.roll) || D.ph === 'back') { u.armL.rotation.x = -sw * 0.7; u.armR.rotation.x = sw * 0.7; }
  g.position.set(p.x, A.groundH(p.x, p.z) + A.curbAt(p.x, p.z) + hop, p.z);
  return true;
}

/* стоит / идёт назад, а машина снова едет на него — новый уворот, точка возврата та же */
function again (p, D) {
  const sx = D.sx, sz = D.sz, keep = p.dg;
  p.dg = null; p.dgCool = 0;
  if (watch(p, 0, true)) { clearAnim(p); p.dg.sx = sx; p.dg.sz = sz; return true; }
  p.dg = keep;
  return false;
}

export const DEBUG = { DG, ST };
