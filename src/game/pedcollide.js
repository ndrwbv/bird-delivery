/* ──────────────────────────────────────────────────────────────────────────
   Люди не сквозь твёрдое, машины толкают людей (автор 23.10.2026, 0п1: «люди ходят сквозь предметы, дома и гаражи,
   бегут в стену, проходят сквозь стоящую машину и сквозь чужие машины»). Правила словами — docs/CAREER.md
   «Люди и твёрдое».

   Твёрдое для человека — то же, во что упирается машина: стены домов и пристроек (коробки SOLIDS), гаражи, заборы,
   будки, контейнеры, ракушки газона (lawnprops.js), заборчики и лавочки у подъездов (yards.js). Машины — любые:
   поток, стоящие у бордюра (trafficgrid.js), во дворах (yardcars.js), твоя.

   1. Идёт по линии (тротуар, дворовая дорожка, зебра): следующая точка линии — центром в твёрдом (не в запасе у стены:
      вдоль стены по-прежнему скользит, game.js pushOut) — шаг не делает и разворачивается: по тротуару — назад по той же
      улице, по дорожке — назад по дорожке; на зебре ждёт (через WAIT с — назад на свой тротуар). Уже стоит в твёрдом
      (так родился, толкнули) — выходит, не застревает. Стоящую машину (и твою, и чужую, и медленно ползущую — медленнее
      SOFT м/с) обходит у ближнего борта (game.js dodgeCar), а не разворачивается.
   2. Идёт сам к точке (к тротуару, к подъезду, к лавочке) и бегство в панике: щупает LOOK м перед собой; там стена,
      твёрдое или машина — поворачивает (ANG, сначала туда, куда свернул в прошлый раз: так обходит дом по стене),
      а не бежит в стену. Свободно ни в одну сторону — стоит.
   3. Едущая машина (поток, автобус, служба, погоня, едущая во дворе; толкнутая тобой и катящаяся после удара) толкает
      людей у кузова: медленнее SOFT м/с — расталкивает к ближнему борту; быстрее — сбивает, как машина игрока
      (hits.js: медленнее 20 км/ч — падает и встаёт, во взрослой жизни LIVES — падает и встаёт, последняя — сбит, кровь;
      в детской — падает и встаёт). Гость, который ждёт пиццу, клиент с коробкой, сидящий — только падает и встаёт.
      Сбитый машиной потока — не на тебе: счёт «сбил прохожих», штраф и сорванный заказ не трогает. Только ближе NEAR м
      к курьеру (дальше людей не видно). Летящая выше FLY м — над головами.

   Сетки, без перебора всех со всеми: стены — клетки 30 м (game.js solidsNear), машины и люди — клетки 20 м
   (trafficgrid.js near / walkersNear).

   ?oldped — по-старому (для замера «до/после» одной сборкой). Отладка: __dlv.PEDC (PC, ST, inside(x, z)).
   ────────────────────────────────────────────────────────────────────────── */
import * as TGRID from './trafficgrid.js';
import * as YCARS from './yardcars.js';
import * as LAWNP from './lawnprops.js';
import * as YARDS from './yards.js';
import * as HITS from './hits.js';

const SRCH = typeof location !== 'undefined' ? location.search || '' : '';
export const PC = {
  on: !/[?&]oldped\b/.test(SRCH),
  LOOK: 0.7,      // м: щупает перед собой, когда идёт сам или бежит
  WALL: 0.25,     // м: столько до твёрдого — уже «впереди стена» (бегство, идёт сам)
  CAR: 0.3,       // м: запас к кузову для того же
  FENCE: 0.12,    // м: центр ближе к заборчику / лавочке двора — в нём
  WAIT: 8,        // с: ждёт на зебре, пока машина не уедет, потом назад на свой тротуар
  SOFT: 3,        // м/с: машина медленнее — расталкивает, быстрее — сбивает (как твоя, econ.js CLIENT_HIT.SOFT)
  NEAR: 160,      // м от курьера: тут едущие машины толкают людей
  FLY: 1.3,       // м: машина выше — летит над головами
  PAD: 0.3,       // м: к кузову — человек задет (как у твоей: underCar)
  UNSTICK: 3,     // м/с: стоящий отходит от вставшей на него машины
  RECHK: 0.25,    // м: идущий по линии проверяет твёрдое раз на столько пути (Дека: не каждый кадр) …
  AHEAD: 0.35,    // м: … на столько вперёд
  CAR_SCAN: 1.5, CAR_RECHK: 1,   // м: машины ближе CAR_SCAN к кузову — ищет раз на CAR_RECHK м пути; нашлись — каждый кадр
  PING: 4,        // разворотов за PING_T с у одного — и далеко от курьера (PING_R м): переносим на другой тротуар
  PING_T: 60, PING_R: 90,
  t: 0,           // с: часы (carsStep)
};
export const ST = { carBack: 0, blocked: 0, turned: 0, waits: 0, steer: 0, stuck: 0, moved: 0, pushed: 0, fell: 0, killed: 0, cars: 0, ms: 0 };
const ANG = [0, 0.55, -0.55, 1.1, -1.1, 1.7, -1.7, 2.4, -2.4];

let A = null;
/** api: V, TRAFFIC, CAR_L, CAR_W, solidsNear, inHouse(x, z) — дом не арка, walkLeg, walkSpawn, releaseIdle, gibHuman,
    gibBurger, runOverScoot, ERRS, CBLOOD, GORE, Snd, PEOPLE, PEDS, SCOOTS, rand */
export function init (api) { A = api; }

/* ── что твёрдое ── */
/* центр (x, z) — в коробке obb с запасом m (m = 0 — в самой коробке) */
const inBox = (s, x, z, m) => {
  const dx = x - s.cx, dz = z - s.cz;
  if (Math.abs(dx) > s.ex + m || Math.abs(dz) > s.ez + m) return false;
  const lx = dx * s.cs + dz * s.sn, lz = -dx * s.sn + dz * s.cs;
  return Math.abs(lx) < s.hw + m && Math.abs(lz) < s.hd + m;
};
/* коробки стен и твёрдого (game.js SOLIDS по клеткам 30 м) — центр ближе m */
function boxAt (x, z, m) {
  const L = A.solidsNear(x, z);
  for (let i = 0; i < L.length; i++) { const s = L[i]; if (s.deckY === undefined && inBox(s, x, z, m)) return true; }
  return false;
}
/* идёт по линии: по тротуару — только коробки (заборчики дворов и ракушки на тротуарах не стоят — проверка pave-props),
   по дорожке двора — всё */
const hard = (p, x, z) => (p.path ? solidAt(x, z, 0) : boxAt(x, z, 0));
/* стена, твёрдое, ракушка, заборчик двора — центр ближе m */
export function solidAt (x, z, m) {
  if (boxAt(x, z, m)) return true;
  const G = LAWNP.solidsOnly(x, z);
  for (let i = 0; i < G.length; i++) if (inBox(G[i], x, z, m)) return true;
  return YARDS.blocks(x, z, m + PC.FENCE);
}
/* кузов машины: центр (x, z) в нём с запасом mL вдоль и mW поперёк */
function inCar (cx, cz, h, hl, hw, x, z, mL, mW) {
  const dx = x - cx, dz = z - cz, R = hl + mL + 1;
  if (Math.abs(dx) > R || Math.abs(dz) > R) return false;
  const fx = Math.sin(h), fz = Math.cos(h), al = dx * fx + dz * fz, ac = dx * fz - dz * fx;
  return Math.abs(al) < hl + mL && Math.abs(ac) < hw + mW;
}
const NB = [];
let YX = 0, YZ = 0, YL = 0, YW = 0, YHIT = null;
function ycOne (t) { if (!YHIT && inCar(t.x, t.z, t.h, t.hl || A.CAR_L, A.CAR_W, YX, YZ, YL, YW)) YHIT = t; }
const carSp = t => (t.knock ? Math.hypot(t.kvx, t.kvz) : Math.abs(t.speed || 0));
/* машина (не летящая), чей кузов с запасом (mL вдоль, mW поперёк) накрывает точку; slow — только стоящие и медленнее
   SOFT; mine — и твоя (A.V), если стоит или ползёт. Вернёт машину или null */
export function carAt (x, z, mL, mW, slow, mine = true) {
  const V = A.V;
  if (mine && !V.air && Math.abs(V.x - x) < 7 && Math.abs(V.z - z) < 7 && Math.hypot(V.vx, V.vz) < PC.SOFT &&
      inCar(V.x, V.z, V.h, A.CAR_L, A.CAR_W, x, z, mL, mW)) return V;
  for (let i = 0, n = TGRID.near(x, z, 4 + mL, NB), L = TGRID.TG.R; i < n; i++) {
    const t = L[i];
    if (t.gone || (t.knock && t.y > PC.FLY)) continue;
    if (slow && carSp(t) >= PC.SOFT) continue;
    if (inCar(t.x, t.z, t.h, t.hl || A.CAR_L, A.CAR_W, x, z, mL, mW)) return t;
  }
  YX = x; YZ = z; YL = mL; YW = mW; YHIT = null;
  YCARS.eachNear(x, z, 5 + mL, ycOne);
  return YHIT;
}
/* свободно ли встать центром в (x, z): не в твёрдом и не у кузова */
const free = (x, z) => !solidAt(x, z, PC.WALL) && !carAt(x, z, PC.CAR, PC.CAR, false);

/** для проверки (tools/probe-checks/ped-solid.js): где центр — 'house' | 'solid' | 'car' | 'mycar' | '' (m — допуск, м) */
export function inside (x, z, m = 0.1) {
  if (A.inHouse(x, z)) return 'house';
  if (solidAt(x, z, -m)) return 'solid';
  const c = carAt(x, z, -m, -m, false);
  return c ? (c === A.V ? 'mycar' : 'car') : '';
}

/* ── 1. идёт по линии ── */
/** следующая точка линии (nx, nz) — в твёрдом? true — шаг не делать (вызывающий разворачивается или ждёт).
    Стоит в твёрдом уже сейчас — не держим: пусть выходит */
export function blocked (p, nx, nz) {
  if (!PC.on) return false;
  const mx = nx - p.pcX, mz = nz - p.pcZ;
  if (p.pcOk && mx * mx + mz * mz < PC.RECHK * PC.RECHK) return false;   // с прошлой проверки прошёл меньше RECHK м, впереди было свободно
  const dx = nx - p.x, dz = nz - p.z, L = Math.hypot(dx, dz);
  const ax = L > 1e-4 ? nx + dx / L * PC.AHEAD : nx, az = L > 1e-4 ? nz + dz / L * PC.AHEAD : nz;
  if (!hard(p, ax, az)) { p.pcOk = 1; p.pcX = nx; p.pcZ = nz; p.pcIn = 0; return false; }
  p.pcOk = 0;                                      // у стены — смотрим каждый шаг
  if (!hard(p, nx, nz)) { p.pcIn = 0; return false; }
  if (p.pcIn) return false;
  if (hard(p, p.x, p.z) || A.inHouse(p.x, p.z)) { p.pcIn = 1; return false; }   // стоит в твёрдом или в доме (так родился) — выходит
  ST.blocked++;
  return true;
}
/* развернулся: часто и далеко от курьера — переносим (бьётся между двумя заборами) */
function pinged (p) {
  const now = PC.t;
  if (!(p.pcN >= 0) || !(now - p.pcT <= PC.PING_T)) { p.pcT = now; p.pcN = 0; }
  if (++p.pcN < PC.PING) return false;
  p.pcN = 0;
  if (Math.hypot(p.x - A.V.x, p.z - A.V.z) < PC.PING_R) return false;
  ST.moved++;
  A.walkSpawn(p, PC.PING_R, 380);
  return true;
}
/** тротуар: назад по той же улице, по той же стороне (как из тупика, game.js walkerStep) */
export function turnLeg (p) {
  ST.turned++;
  if (pinged(p)) return;
  const W = p.w, a = W.b;
  W.b = W.a; W.a = a; W.side = -W.side;
  A.walkLeg(p, p.x, p.z);
}
/** дворовая дорожка: назад по ней. i0, d0, dir0 — где был до шага (pathStep мог перейти через точку) */
export function turnPath (p, i0, d0, dir0) {
  ST.turned++;
  if (pinged(p)) return;
  const P = p.path, q = P.q;
  let dir = dir0, j = i0 + dir;
  if (j < 0 || j >= q.length) { dir = -dir; j = i0 + dir; }
  if (j < 0 || j >= q.length) { P.i = i0; P.d = 0; P.dir = -dir0; return; }
  const L = Math.hypot(q[j][0] - q[i0][0], q[j][1] - q[i0][1]);
  P.i = j; P.d = Math.max(0, L - d0); P.dir = -dir;
}

/** после шага, обхода машины (game.js dodgeCar) и стен (pushOut): центр всё же в кузове (машина вплотную к стене или
    забору — обойти негде), а до шага был снаружи — назад на место и развернуться (по тротуару, по дорожке; на зебре — ждёт) */
export function settle (p, ox, oz) {
  if (!PC.on) return;
  const V = A.V;
  if (!p.pcCN && (Math.abs(p.x - V.x) > 7 || Math.abs(p.z - V.z) > 7)) return;   // машин рядом нет (смотрел standCar)
  if (!carAt(p.x, p.z, 0, 0, false) || carAt(ox, oz, 0, 0, false)) return;
  ST.carBack++;
  p.x = ox; p.z = oz;
  p.dodge = 0; p.dox = 0; p.doz = 0; p.dpx = p.dpz = NaN;
  if (p.cross) return;
  if (p.path) { const P = p.path; turnPath(p, P.i, P.d, P.dir); }
  else if (p.w && !p.goTo) turnLeg(p);
}

/* ── 2. идёт сам к точке, бежит ── */
/** шаг step м в сторону (ux, uz) (единичный): впереди твёрдое или машина — поворачивает. Вернёт угол взгляда; NaN — стоит */
export function steer (p, ux, uz, step) {
  if (!PC.on || step <= 0) { p.x += ux * step; p.z += uz * step; return Math.atan2(ux, uz); }
  if (!free(p.x, p.z)) { p.x += ux * step; p.z += uz * step; return Math.atan2(ux, uz); }   // уже у стены / в машине — выходит
  const s = p.pcS || 1, look = Math.max(PC.LOOK, step);
  for (let i = 0; i < ANG.length; i++) {
    const a = ANG[i] * s, c = Math.cos(a), sn = Math.sin(a);
    const vx = ux * c + uz * sn, vz = -ux * sn + uz * c;
    if (!free(p.x + vx * look, p.z + vz * look)) continue;
    if (i) { ST.steer++; p.pcS = a > 0 ? 1 : -1; }
    p.x += vx * step; p.z += vz * step;
    return Math.atan2(vx, vz);
  }
  ST.stuck++;
  return NaN;
}

/* ── 1. стоящую машину обходит (game.js dodgeCar): ближняя стоящая / ползущая машина, чей кузов с запасом
   (DL, DW) накрывает точку. Вернёт { x, z, h, hl } или null ── */
const SC = { x: 0, z: 0, h: 0, hl: 0 };
export function standCar (x, z, DL, DW, p) {
  if (!PC.on) return null;
  if (p) {                                         // машин ближе CAR_SCAN м к кузову не было и прошёл меньше CAR_RECHK м — не ищем
    const mx = x - p.pcCX, mz = z - p.pcCZ, far = mx * mx + mz * mz >= PC.CAR_RECHK * PC.CAR_RECHK;
    if (!far && !p.pcCN) return null;
    if (far) { p.pcCX = x; p.pcCZ = z; p.pcCN = carAt(x, z, DL + PC.CAR_SCAN, DW + PC.CAR_SCAN, false, false) ? 1 : 0; if (!p.pcCN) return null; }
  }
  const t = carAt(x, z, DL, DW, true, false);
  if (!t) return null;
  SC.x = t.x; SC.z = t.z; SC.h = t.h; SC.hl = t.hl || A.CAR_L;
  return SC;
}

/** с какой стороны обходить машину (game.js dodgeCar, при первом касании): ±1 — к борту, ±2 — к носу / корме. Идёт вдоль
    кузова — к ближнему борту, поперёк — к ближнему концу, и дальше вдоль него (до 23.10.2026 — по меньшему заходу: у капота
    держало у бампера, а вышел край пути с той стороны — перескакивал сквозь кузов). Там стена — к другой стороне */
export function dodgeSide (p, rx, rz, cx, cz, fx, fz, al, ac, HL, HW) {
  let sd = HW - Math.abs(ac) <= HL - Math.abs(al) ? (ac >= 0 ? 1 : -1) : (al >= 0 ? 2 : -2);
  if (!PC.on) return sd;
  const mx = rx - ((p.dpx || 0) - (p.dox || 0)), mz = rz - ((p.dpz || 0) - (p.doz || 0)), ml = Math.hypot(mx, mz);
  if (ml > 1e-3 && ml < 2) sd = Math.abs(mx * fx + mz * fz) >= Math.abs(mx * fz - mz * fx) ? (ac >= 0 ? 1 : -1) : (al >= 0 ? 2 : -2);
  const nal = Math.abs(sd) === 1 ? al : Math.sign(sd) * HL, nac = Math.abs(sd) === 1 ? sd * HW : ac;
  if (solidAt(cx + fx * nal + fz * nac, cz + fz * nal - fx * nac, 0.1)) sd = -sd;
  return sd;
}

/* ── 3. едущая машина толкает людей ── */
const NW = [];
function kindOf (p) {
  if (p.pcK !== undefined) return p.pcK;
  return (p.pcK = A.PEOPLE.indexOf(p) >= 0 ? 1 : A.PEDS.indexOf(p) >= 0 ? 2 : A.SCOOTS.indexOf(p) >= 0 ? 3 : 0);
}
/** раз в кадр, после машин (game.js: CL.step('pedcars')) */
export function carsStep (dt) {
  if (!A || !dt) return;
  PC.t += dt;
  if (!PC.on) return;
  const t0 = performance.now(), V = A.V, NR2 = PC.NEAR * PC.NEAR, ACT = TGRID.TG.ACT;
  let cars = 0;
  for (let ci = 0; ci < ACT.length; ci++) {
    const t = ACT[ci];
    if (t.gone || t.still) continue;
    if ((t.x - V.x) * (t.x - V.x) + (t.z - V.z) * (t.z - V.z) > NR2) continue;
    let vx, vz;
    if (t.knock) { if (t.y > PC.FLY) continue; vx = t.kvx; vz = t.kvz; }
    else { const s = t.speed || 0; if (t.wreck || t.parked) continue; vx = Math.sin(t.h) * s; vz = Math.cos(t.h) * s; }
    const sp = Math.hypot(vx, vz);
    if (sp < 0.4) continue;
    cars++;
    const hl = t.hl || A.CAR_L, fx = Math.sin(t.h), fz = Math.cos(t.h);
    for (let i = 0, n = TGRID.walkersNear(t.x, t.z, hl + 2, NW); i < n; i++) {
      const p = NW[i];
      if (p.dead || p.fall) continue;
      const dx = p.x - t.x, dz = p.z - t.z;
      if (Math.abs(dx) > hl + 2 || Math.abs(dz) > hl + 2) continue;
      const al = dx * fx + dz * fz, ac = dx * fz - dz * fx;
      if (Math.abs(al) >= hl + PC.PAD || Math.abs(ac) >= A.CAR_W + PC.PAD) continue;
      const k = kindOf(p);
      if (!k || (k === 3 && !p.grp.visible)) continue;
      if (sp < PC.SOFT) { shove(p, t, al, ac, fx, fz, hl); continue; }
      hitOne(p, k, t, vx, vz, sp);
    }
  }
  ST.cars = cars;
  ST.ms += performance.now() - t0;
}
/** стоит на месте (гость ждёт пиццу): на него встала машина (твоя или чужая, стоит или ползёт) — отходит к ближнему борту
    (UNSTICK м/с). true — отходит */
export function unstick (p, dt) {
  if (!PC.on || !A) return false;
  const t = carAt(p.x, p.z, PC.PAD, PC.PAD, true);
  if (!t) return false;
  const hl = t === A.V ? A.CAR_L : (t.hl || A.CAR_L), fx = Math.sin(t.h), fz = Math.cos(t.h), dx = p.x - t.x, dz = p.z - t.z;
  const ox = p.x, oz = p.z;
  shove(p, t, dx * fx + dz * fz, dx * fz - dz * fx, fx, fz, hl);
  const ex = p.x - ox, ez = p.z - oz, L = Math.hypot(ex, ez), k = L > 1e-4 ? Math.min(1, PC.UNSTICK * dt / L) : 1;
  p.x = ox + ex * k; p.z = oz + ez * k;
  if (p.grp) { p.grp.position.x = p.x; p.grp.position.z = p.z; }
  return true;
}
/* медленно — к ближнему борту, не насквозь */
function shove (p, t, al, ac, fx, fz, hl) {
  const HL = hl + PC.PAD, HW = A.CAR_W + PC.PAD;
  let nal = al, nac = ac;
  if (HW - Math.abs(ac) <= HL - Math.abs(al)) nac = (ac >= 0 ? 1 : -1) * HW; else nal = (al >= 0 ? 1 : -1) * HL;
  p.x = t.x + fx * nal + fz * nac; p.z = t.z + fz * nal - fx * nac;
  if (p.grp) { p.grp.position.x = p.x; p.grp.position.z = p.z; }
  ST.pushed++;
}
function hitOne (p, k, t, vx, vz, sp) {
  const kmh = sp * 3.6;
  if (k === 2) {                                   // бургер — разлетается
    p.dead = 1; p.deadT = A.rand(6, 14); p.grp.visible = false;
    A.gibBurger(p.x, p.z);
    ST.killed++;
    return;
  }
  if (k === 3) { A.runOverScoot(p, vx, vz, 'traffic'); ST.killed++; return; }
  if (p.errand && A.ERRS.bump(p, vx, vz)) { ST.fell++; return; }
  // ждёт пиццу, с коробкой, сидит — только падает и встаёт (заказ цел)
  const soft = p.guest || p.after || p.sitting;
  if (soft || HITS.isFall(kmh) || HITS.survive(p, kmh)) {
    if (p.idle) A.releaseIdle(p);
    HITS.fall(p, vx, vz);
    if (A.Snd.impact) A.Snd.impact(sp, 'person', { x: p.x, z: p.z });
    ST.fell++;
    return;
  }
  if (p.idle) A.releaseIdle(p);
  p.dead = 1; p.deadT = A.rand(18, 26); p.fly = null; p.fall = null;
  p.grp.visible = false;
  A.gibHuman(p, vx, vz);
  if (A.GORE && t.mesh) A.CBLOOD.hit(t.mesh, p.x, p.z, kmh);   // кровь на машине, что сбила (carblood.js)
  ST.killed++;
}

export const DEBUG = { PC, ST, inside, solidAt, carAt };
