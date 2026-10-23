/* ──────────────────────────────────────────────────────────────────────────
   Машина о машину (0п38, 24.10.2026; автор: «врезаешься машиной в другую — она может проходить сквозь другую»).
   Правила словами — docs/CAREER.md «Чужие машины мнутся и бьются» → «Машина о машину».

   До 24.10 твёрдой для чужих машин была только твоя: отброшенная ударом машина (knock — летит юзом), машина, что
   своим ходом возвращается на полосу (carback.js), и стоящая, которую ты толкаешь (у бордюра, во дворе), проходили
   сквозь все остальные — поток, стоящие, автобусы.

   Теперь каждый кадр (после updateTraffic) «свободные» машины — летящая, возвращающаяся, сдвинутая с места
   стоящая — проверяются с соседями по сетке машин (trafficgrid.js near, 8 м): два прямоугольника кузова (длина
   hl, ширина hw), разделяющая ось (SAT). Пересеклись:
     • расталкиваем по кратчайшей оси: обе подвижные (летящая, стоящая, разбитая, возвращающаяся) — пополам;
       машина потока на полосе и машина с маршрутом (скорая, курьеры) — не двигаются (их ведёт полоса), автобус
       и самосвал — тоже, двигается свободная;
     • скорость сближения делим, как у двух одинаковых машин (отскок E): летящая толкает ту, в которую влетела;
       та получила больше CH.KNOCK м/с — сама летит (knockCar: юзом, с разворотом), меньше — только сдвинута;
     • удар с CH.DENT м/с — мнутся обе в месте удара (как от твоей: dentCar, подробная копия — foewreck.js,
       автобус и самосвал — качка и вмятина, FW.big), искры и звук удара; машине — урон (hp), кончился — горит.
   Летящая о твою машину — как раньше (game.js, удар курьера по машинам: расталкиваемся пополам).
   ?oldcarhit — по-старому (для сравнения одной сборкой).

     init(api)       — game.js
     step(list, dt)  — конец updateTraffic (до TGRID.rebuild): list — TACT
   ────────────────────────────────────────────────────────────────────────── */

export const CH = {
  on: !(typeof location !== 'undefined' && /[?&]oldcarhit\b/.test(location.search || '')),
  R: 8,            // м: соседей ищем в квадрате ±R (две длинные машины по 2,5 м от середины + запас)
  E: 0.2,          // отскок: доля скорости сближения, что возвращается
  KNOCK: 1.8,      // м/с: столько получила стоящая / едущая — сама отлетает (меньше — только сдвинута)
  DENT: 3,         // м/с сближения — с такого мнутся обе
  CD: 0.25,        // с: одна и та же машина мнётся не чаще
  HP: [1.0, 1.5],  // урон за 1 м/с удара: той, что влетела, и той, в которую влетели
  SPIN: 0.12,      // разворот от удара не в середину (рад/с на м/с, не больше 2,5)
};
export const ST = { loose: 0, pairs: 0, hits: 0, dents: 0, knocks: 0, pushes: 0, maxPen: 0, ms: 0 };

let A = null;
export function init (api) { A = api; }

let CLOCK = 0;
const NB = [];                                       // кандидаты near (без выделений в кадре)
const P = { ax: 0, az: 0, pen: 0, cx: 0, cz: 0 };    // результат overlap: ось (от B к A), глубина, точка удара

const isBig = t => !!(t.bus || t.model === 'dump');
const hlOf = t => t.bus ? t.bus.hl : (t.hl || 2.2);
function hwOf (t) {
  if (t.bus) return t.bus.W2;
  if (t.mp || t.model === 'moped') return 0.4;
  const u = t.mesh && t.mesh.userData;
  if (u && (u.real || u.realLite)) return 0.95;
  return u && u.W ? Math.min(1.05, u.W / 2) : 0.9;
}
/* сам ведёт: полоса потока, маршрут скорой / курьеров / погони / двора — его x, z ставит не физика */
const railed = t => !t.knock && !t.cb && !t.parked && !t.stalled && !t.wreck;
/* свободная — двигается не по полосе, а физикой / толчком: её и проверяем */
function loose (t) {
  if (t.knock || t.cb) return true;
  if ((t.parked || t.stalled || t.wreck) && t.chx !== undefined && (Math.abs(t.x - t.chx) > 0.002 || Math.abs(t.z - t.chz) > 0.002)) return true;   // сдвинули (ты толкнул, взрыв, лось)
  return false;
}
const velX = t => t.knock ? t.kvx : Math.sin(t.h) * (t.speed || 0);
const velZ = t => t.knock ? t.kvz : Math.cos(t.h) * (t.speed || 0);

/* два прямоугольника (середина, курс h, полудлина hl, полуширина hw): пересекаются — P (ось от B к A, глубина, точка) */
const CA = [0, 0, 0, 0, 0, 0, 0, 0], CB = [0, 0, 0, 0, 0, 0, 0, 0];
function corners (t, hl, hw, out) {
  const fx = Math.sin(t.h), fz = Math.cos(t.h), rx = fz, rz = -fx;
  let k = 0;
  for (const a of [1, -1]) for (const s of [1, -1]) { out[k++] = t.x + fx * hl * a + rx * hw * s; out[k++] = t.z + fz * hl * a + rz * hw * s; }
}
function overlap (a, ha, wa, b, hb, wb) {
  const dx = a.x - b.x, dz = a.z - b.z;
  let best = 1e9, bx = 0, bz = 0;
  const fa = [Math.sin(a.h), Math.cos(a.h)], fb = [Math.sin(b.h), Math.cos(b.h)];
  const axes = [fa[0], fa[1], fa[1], -fa[0], fb[0], fb[1], fb[1], -fb[0]];
  for (let i = 0; i < 8; i += 2) {
    const ux = axes[i], uz = axes[i + 1];
    const ra = ha * Math.abs(ux * fa[0] + uz * fa[1]) + wa * Math.abs(ux * fa[1] - uz * fa[0]);
    const rb = hb * Math.abs(ux * fb[0] + uz * fb[1]) + wb * Math.abs(ux * fb[1] - uz * fb[0]);
    const dp = dx * ux + dz * uz, o = ra + rb - Math.abs(dp);
    if (o <= 0) return false;
    if (o < best) { best = o; const sg = dp < 0 ? -1 : 1; bx = ux * sg; bz = uz * sg; }
  }
  P.ax = bx; P.az = bz; P.pen = best;
  // точка удара: углы одной машины внутри другой (в среднем); ни одного (крест-накрест) — посередине
  corners(a, ha, wa, CA); corners(b, hb, wb, CB);
  let sx = 0, sz = 0, n = 0;
  const inside = (t, hl, hw, x, z) => { const f = (x - t.x) * Math.sin(t.h) + (z - t.z) * Math.cos(t.h), s = (x - t.x) * Math.cos(t.h) - (z - t.z) * Math.sin(t.h); return Math.abs(f) <= hl && Math.abs(s) <= hw; };
  for (let k = 0; k < 8; k += 2) {
    if (inside(b, hb, wb, CA[k], CA[k + 1])) { sx += CA[k]; sz += CA[k + 1]; n++; }
    if (inside(a, ha, wa, CB[k], CB[k + 1])) { sx += CB[k]; sz += CB[k + 1]; n++; }
  }
  if (n) { P.cx = sx / n; P.cz = sz / n; } else { P.cx = (a.x + b.x) / 2; P.cz = (a.z + b.z) / 2; }
  return true;
}

/* сдвинуть стоящую (у бордюра, во дворе — может спать в склейке: сперва своя модель) */
function shove (t, dx, dz) {
  if (t.still) A.wake(t);
  t.x += dx; t.z += dz;
  if (t.parked || t.stalled || t.wreck) t.moved = 1;
}
/* получила толчок dv: больше KNOCK — летит сама (юзом), меньше — летящей прибавили, стоящая — только сдвинута */
function kick (t, dvx, dvz, sp) {
  if (t.knock) { t.kvx += dvx; t.kvz += dvz; t.spin += sp; return; }
  const m = Math.hypot(dvx, dvz);
  if (m < CH.KNOCK) { if (t.cb) A.cbStop(t); return; }
  const vx = velX(t), vz = velZ(t);
  if (t.still) A.wake(t);
  A.knock(t, dvx / m, dvz / m, 6);                  // полёт (knockCar: в ACT, своя модель, carback снят) — скорость ниже ставим сами
  t.kvx = vx + dvx; t.kvz = vz + dvz;
  t.kvy = Math.min(2.5, Math.max(0.5, m * 0.1));
  t.spin = sp + (Math.random() - 0.5) * Math.min(2, m * 0.08);
  ST.knocks++;
}
function hitBoth (a, b, v, cx, cz, nx, nz) {
  const cdA = CLOCK - (a.chAt || -9) > CH.CD, cdB = CLOCK - (b.chAt || -9) > CH.CD;
  if (!cdA && !cdB) return;
  ST.hits++;
  A.impact(v, cx, cz, nx, nz);
  if (v < CH.DENT) return;
  if (cdA) { a.chAt = CLOCK; A.dent(a, cx, cz, v, nx, nz); a.hp -= v * CH.HP[0]; ST.dents++; }
  if (cdB) { b.chAt = CLOCK; A.dent(b, cx, cz, v, -nx, -nz); if (!isBig(b)) b.hp -= v * CH.HP[1]; ST.dents++; }
  for (const t of [a, b]) if (t.hp <= 0 && !t.wreck && !(t.chainT > 0) && !isBig(t)) t.chainT = 0.25 + Math.random() * 0.5;   // загорится, как от взрыва рядом (updateTraffic chainT)
}

function pair (a, b) {
  const ha = hlOf(a), wa = hwOf(a), hb = hlOf(b), wb = hwOf(b);
  if (Math.abs(a.x - b.x) > ha + hb + 1 || Math.abs(a.z - b.z) > ha + hb + 1) return;
  if (!overlap(a, ha, wa, b, hb, wb)) return;
  ST.pairs++;
  const nx = P.ax, nz = P.az, pen = P.pen, cx = P.cx, cz = P.cz;
  ST.maxPen = Math.max(ST.maxPen, pen);
  // кто двигается: полоса / маршрут / автобус — нет
  const ma = isBig(a) || railed(a) ? 0 : 1, mb = isBig(b) || railed(b) ? 0 : 1;
  if (!ma && !mb) return;
  const s = ma + mb;
  if (ma) { a.x += nx * pen * ma / s; a.z += nz * pen * ma / s; }
  if (mb) { shove(b, -nx * pen * mb / s, -nz * pen * mb / s); ST.pushes++; }
  // скорость сближения: две одинаковые машины (автобус и самосвал — стена)
  const vn = (velX(a) - velX(b)) * nx + (velZ(a) - velZ(b)) * nz;
  if (vn >= 0) return;
  const ia = 1, ib = isBig(b) ? 0 : 1, J = -(1 + CH.E) * vn / (ia + ib);
  // разворот: удар не в середину кузова — крутит (рычаг поперёк оси удара)
  const sp = t => Math.max(-2.5, Math.min(2.5, ((cx - t.x) * nz - (cz - t.z) * nx) * J * CH.SPIN));
  kick(a, nx * J * ia, nz * J * ia, -sp(a) * ia);
  if (ib) kick(b, -nx * J * ib, -nz * J * ib, sp(b) * ib);
  hitBoth(a, b, -vn, cx, cz, nx, nz);
}

export function step (list, dt) {
  if (!A || !CH.on || !(dt > 0)) return;
  const t0 = performance.now();
  CLOCK += dt;
  let nl = 0;
  for (let i = 0, n = list.length; i < n; i++) {
    const a = list[i];
    if (a.gone || !a.mesh) continue;
    if (loose(a)) {
      nl++;
      const nn = A.near(a.x, a.z, CH.R, NB), L = A.nearList();
      if (L !== NB) for (let k = 0; k < nn; k++) NB[k] = L[k];   // ?oldcars — near отдаёт весь TRAFFIC
      for (let k = 0; k < nn; k++) {
        const b = NB[k];
        if (b === a || b.gone || !b.mesh) continue;
        pair(a, b);
      }
      NB.length = Math.min(NB.length, 64);
    }
    if (a.parked || a.stalled || a.wreck) { a.chx = a.x; a.chz = a.z; } else if (a.chx !== undefined) a.chx = undefined;
  }
  ST.loose = nl;
  ST.ms = performance.now() - t0;
}

export const DEBUG = { CH, ST, overlap: (a, b) => overlap(a, hlOf(a), hwOf(a), b, hlOf(b), hwOf(b)) ? { ...P } : null, hlOf, hwOf };
