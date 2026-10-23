/* ──────────────────────────────────────────────────────────────────────────
   Машина «верхом» на стволе или кусте (автор 23.10.2026, 0п16: «зимой влетаешь под несбиваемый куст — и не выехать»).

   Кузов в езде — два круга, нос и корма (game.js driveStep). Ствол, твёрдый куст (сирень, шиповник), ствол
   ельника, ёлка — коробка ~1,1 м. Если коробка оказалась между кругами (занесло боком на льду, развернуло
   у ствола, приземлился после прыжка) или в середине борта, куда круги не достают, нос выталкивает вперёд,
   корма — назад: толчки гасят друг друга, а скорость к стволу гасит и тот, и другой — ни вперёд, ни назад.
   Машина стоит «внутри» куста навсегда.

   Правка: «застряла» — нос и корму в одном шаге толкает в разные стороны, ствол в середине кузова (ближе
   DEEP м к оси машины) или машина стоит (медленнее SLOW м/с), влезши в ствол глубже SUNK м, и за STILL с не
   сдвинулась (толчок от ствола гасит что-то ещё — столб, другой куст). Тогда ищем, куда вывести: из DIRS направлений — то, где ближе всего (до FAR м) место,
   где ни нос, ни середина, ни корма ничего твёрдого не задевают (живая изгородь — рядом другие кусты, стена
   дома), и ведём туда не быстрее STEP м/с (без рывка): из-под куста — за ~0,3 с, из середины изгороди —
   за ~0,5 с. Пока ведём, стволы, в которых машина стояла, её не держат (иначе нос и корма тянут назад);
   остальное твёрдое — как всегда. Не дошли за HOLD с — бросаем. Нет места ближе FAR — прочь от ствола.
   Только небольшие коробки (до MAX_HALF м в обе стороны): стены домов и заборы — как раньше.

   Из game.js driveStep: begin(V, dt) — до носа и кормы (ведёт, если вывод начат); в переборе твёрдого —
   IGN.length && ign(s) — пропустить; hit(0 | 1, nx, nz) — нос / корма упёрлись; check(V, near, r, dt) — после.
   near(x, z) — твёрдое у точки (список живёт до следующего вызова near).
   ────────────────────────────────────────────────────────────────────────── */

export const UNSTUCK = {
  MAX_HALF: 3.2,      // м: полуширина коробки, до которой выводим (ствол 0,55, ёлка у пиццерии 3,1)
  STEP: 7,            // м/с: так быстро машину выводит из-под ствола
  AXLE: 1.21,         // м: круги кузова — на столько вперёд и назад от середины (game.js: CAR_L · 0,55)
  DEEP: 0.6,          // м: ствол ближе к оси машины (с полушириной коробки) — он в кузове
  GAP: 0.05,          // м: запас, чтобы после вывода нос и корма ствола уже не касались
  HOLD: 1.5,          // с: дольше не ведём
  SLOW: 1.0,          // м/с: медленнее — «стоит»
  SUNK: 0.05,         // м: нос, середина или корма влезли в ствол глубже — «в стволе»
  STILL: 0.4,         // с: столько стоит в стволе, не сдвигаясь, — застряла
};
export const STATS = { plans: 0, frames: 0, found: 0, boxed: 0, opp: 0, deep: 0, still: 0 };
export const IGN = [];              // стволы, которые пока не держат: x, z, x, z…

const skip = s => s.deckY !== undefined || s.topY !== undefined || s.ramp !== undefined || !(s.hw > 0) || !(s.hd > 0);
const small = s => !s.rail && !s.stop && !s.veranda && s.hw <= UNSTUCK.MAX_HALF && s.hd <= UNSTUCK.MAX_HALF;
/* точка (x, z) с запасом r — в коробке s? (как в driveStep: в осях коробки) */
const inBox = (s, x, z, r) => {
  const dx = x - s.cx, dz = z - s.cz;
  return Math.abs(dx * s.cs + dz * s.sn) < s.hw + r && Math.abs(-dx * s.sn + dz * s.cs) < s.hd + r;
};
/* держит ли машину на высоте y (как в driveStep: под мостом — нет, стена низкого дома — пока кузов ниже крыши) */
const holds = (s, y) => s.hw > 0 && s.hd > 0 && s.ramp === undefined && !(s.deckY !== undefined && y < s.deckY - 1.2) && !(s.topY !== undefined && y > s.topY - 0.5);
/* машина серединой в (x, z) с курсом (fx, fz) задевает что-то твёрдое (нос, середина или корма)? */
function busy (near, x, z, fx, fz, r, y) {
  const A = UNSTUCK.AXLE;
  for (let c = -1; c <= 1; c++) {
    const cx = x + fx * A * c, cz = z + fz * A * c, L = near(cx, cz);
    for (let i = 0; i < L.length; i++) {
      const s = L[i];
      if (holds(s, y) && inBox(s, cx, cz, r - 0.02)) return true;
    }
  }
  return false;
}

export function ign (s) {
  for (let i = 0; i < IGN.length; i += 2) if (Math.abs(s.cx - IGN[i]) < 0.01 && Math.abs(s.cz - IGN[i + 1]) < 0.01) return true;
  return false;
}

const HN = [0, 0, 0, 0];
let HM = 0, CUR = null;             // CUR: { ux, uz — куда, left — сколько ещё, м, t — с }
export function hit (ci, nx, nz) { HN[ci * 2] = nx; HN[ci * 2 + 1] = nz; HM |= 1 << ci; }

export function begin (V, dt) {
  HM = 0;
  if (!CUR) return false;
  const st = Math.min(CUR.left, UNSTUCK.STEP * dt);
  V.x += CUR.ux * st; V.z += CUR.uz * st; CUR.left -= st; CUR.t += dt;
  const vn = V.vx * CUR.ux + V.vz * CUR.uz;
  if (vn < 0) { V.vx -= vn * CUR.ux; V.vz -= vn * CUR.uz; }
  STATS.frames++;
  if (CUR.left <= 1e-4 || CUR.t > UNSTUCK.HOLD) { CUR = null; IGN.length = 0; }
  return true;
}

const DIRS = 16, FAR = 6, STEP_T = 0.25;
const ST = { t: 0, x: 0, z: 0 };    // стоит, влезши в ствол: сколько, с, и где встала
export function check (V, near, r, dt) {
  if (CUR) return false;
  const opp = HM === 3 && HN[0] * HN[2] + HN[1] * HN[3] < -0.5;
  const slow = V.vx * V.vx + V.vz * V.vz < UNSTUCK.SLOW * UNSTUCK.SLOW;
  if (!opp && !slow && !HM) { ST.t = 0; return false; }   // едет и ни во что не упёрлась — дальше не смотрим
  const fx = Math.sin(V.h), fz = Math.cos(V.h), A = UNSTUCK.AXLE;
  // стволы в кузове: в середине — глубоко (DEEP); у носа, середины и кормы — когда их толкает в разные стороны
  // или когда машина стоит, влезши в ствол (толчок носа или кормы гасит что-то ещё: столб, другой куст)
  IGN.length = 0;
  let deep = false, inS = false, ox = 0, oz = 0, ext = 0;
  for (let c = -1; c <= 1; c++) {
    const cx = V.x + fx * A * c, cz = V.z + fz * A * c, L = near(cx, cz);
    for (let i = 0; i < L.length; i++) {
      const s = L[i];
      if (skip(s) || !small(s)) continue;
      const dp = !c && inBox(s, cx, cz, UNSTUCK.DEEP), sunk = slow && inBox(s, cx, cz, r - UNSTUCK.SUNK);
      if (!dp && !sunk && !(opp && inBox(s, cx, cz, r))) continue;
      if (!IGN.length || (dp && !deep)) { ox = s.cx; oz = s.cz; ext = Math.hypot(s.hw, s.hd); }
      if (dp) deep = true;
      if (sunk) inS = true;
      if (!ign(s)) IGN.push(s.cx, s.cz);
    }
  }
  // стоит, влезши в ствол: не сдвинулась дальше SUNK за STILL с — застряла
  if (!deep && !opp) {
    if (!inS) { ST.t = 0; IGN.length = 0; return false; }
    if (!ST.t || Math.abs(V.x - ST.x) + Math.abs(V.z - ST.z) > UNSTUCK.SUNK) { ST.t = dt; ST.x = V.x; ST.z = V.z; IGN.length = 0; return false; }
    ST.t += dt;
    if (ST.t < UNSTUCK.STILL) { IGN.length = 0; return false; }
  }
  if (!IGN.length) return false;
  ST.t = 0;
  if (deep) STATS.deep++; else if (opp) STATS.opp++; else STATS.still++;
  // куда вывести: свободное место ближе всего
  let best = null;
  for (let t = STEP_T; t <= FAR && !best; t += STEP_T) {
    for (let k = 0; k < DIRS; k++) {
      const a = k / DIRS * Math.PI * 2, ux = Math.sin(a), uz = Math.cos(a);
      if (!busy(near, V.x + ux * t, V.z + uz * t, fx, fz, r, V.y)) { best = { ux, uz, left: t + UNSTUCK.GAP, t: 0 }; break; }
    }
  }
  if (best) STATS.found++;
  else {                            // зажат со всех сторон — прочь от ствола
    const dx = V.x - ox, dz = V.z - oz, l = Math.hypot(dx, dz);
    best = { ux: l > 1e-3 ? dx / l : 1, uz: l > 1e-3 ? dz / l : 0, left: Math.max(0.1, ext + r - l), t: 0 };
    STATS.boxed++;
  }
  CUR = best;
  STATS.plans++;
  return true;
}
