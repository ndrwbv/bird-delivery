/* ──────────────────────────────────────────────────────────────────────────
   Машина после удара возвращается на полосу своим ходом (0п32, автор 24.10.2026: «врезался в машину в потоке, она
   улетела, а потом резко вернулась на дорогу»). Правила словами — docs/CAREER.md «Чужие машины мнутся и бьются» →
   «После удара».

   До 24.10 упавшую после кувырка машину «доводили» до полосы рисованием: за ~1,4 с она съезжала из того места, где
   легла, в свою полосу вбок, стоя на месте колёсами (game.js poseTraffic, rejoin) — с 15 м это 10 м/с боком; дорогу не
   нашла — переставляли за 120—340 м (телепорт). Теперь машина едет сама, как водитель:
   • цель — точка своей полосы на LOOK м впереди (по ходу улицы); нос смотрит на неё — вперёд, со скоростью до V м/с,
     руль — радиус R м; цель сбоку или сзади (нос в бордюр, в стену) — задним ходом до VR м/с, выворачивая нос к полосе;
   • упёрлась (стена, забор) — меняет вперёд / назад; впереди по ходу человек, твоя машина или другая — ждёт;
   • встала в полосу (вбок ближе DONE м, курс ближе DONE_H) — дальше обычная езда с той же скорости; остаток вбок
     машина добирает, как после разворота (t.nar, не быстрее 1,6 м/с вбок);
   • дороги рядом нет (дальше FAR м) или за GIVE с так и не встала — стоит, где стоит; переставляем только когда её не
     видно (как сгоревшие, deadends.js).
   Скорость за кадр — не больше V м/с: телепортов нет (проверка tools/probe-checks/carback.js).

     init(api)      — game.js
     start(t, e)    — game.js rejoinRoad: ребро, на которое возвращается (null — дороги рядом нет)
     step(t, dt)    — game.js updateTraffic: true — машина ещё возвращается (обычную езду пропустить)
     stop(t)        — машину сбили снова / переставили
   ?oldback — как было (рисованием, для сравнения).
   ────────────────────────────────────────────────────────────────────────── */
const SRCH = typeof location !== 'undefined' ? location.search || '' : '';
export const CB = {
  on: !/[?&]oldback\b/.test(SRCH),
  V: 2.8,          // м/с вперёд (10 км/ч; медленнее 3 м/с — людей расталкивает, а не сбивает, pedcollide.js SOFT)
  VR: 1.6,         // м/с задним ходом
  ACC: 2.2,        // м/с² разгон и торможение
  R: 4.6,          // м: радиус разворота
  LOOK: 4.5,       // м: цель — на столько впереди по полосе (дальше от полосы — LOOK_K × сколько до неё)
  LOOK_K: 1.3,
  REV: 1.25,       // рад: цель дальше от носа — задним ходом
  FWD: 0.55,       // рад: задним, пока цель не ближе к носу, чем столько (или REV_D м проехал)
  REV_D: 5,
  DONE: 0.4, DONE_H: 0.06,    // м, рад: встала в полосу (остаток вбок доезжает обычной ездой, курс — щелчком не больше 3°)
  FAR: 30,         // м: полоса дальше — не едет
  END: 1,          // м: ближе к концу ребра — встаёт в полосу уже следующего
  STUCK: 0.9,      // с: упёрлась — меняет вперёд / назад
  GIVE: 30,        // с: не встала — стоит (вне кадра — переставим)
  WAIT: 2.4,       // м: впереди по ходу кто-то ближе — ждёт
};
export const ST = { next: 0, starts: 0, done: 0, rev: 0, stuck: 0, waits: 0, gave: 0, none: 0, moved: 0 };

let A = null;
/** api: V, NODES, edgeRun, lane(e, s) → [x, z, h], pushOut(t, r), poseOnSlope(t), shown(x, z), respawn(t), carsNear(x, z, r) → [n, list],
    walkersNear(x, z, r) → [n, list] */
export function init (api) { A = api; }

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export function start (t, e) {
  if (!A || !CB.on) return false;
  ST.starts++;
  t.cb = { e, sp: 0, dir: 1, T: 0, stuck: 0, rd: 0, gave: 0 };
  if (!e) ST.none++;
  t.speed = 0;
  return true;
}
export function stop (t) { t.cb = null; }

/* где машина относительно полосы: s — сколько от начала ребра, lat — вбок (+ вправо), dh — курс полосы минус курс машины */
function rel (t, e) {
  const N = A.NODES[e.a], s = (t.x - N.x) * e.ux + (t.z - N.z) * e.uz - e.tA, run = A.edgeRun(e);
  const sc = Math.max(0, Math.min(run, s));
  const [lx, lz, lh] = A.lane(e, sc);
  const ox = lx + e.ux * (s - sc), oz = lz + e.uz * (s - sc);   // за концом ребра — по прямой дальше
  const lat = (t.x - ox) * -Math.cos(lh) + (t.z - oz) * Math.sin(lh);
  return { s, run, lat, d: Math.hypot(t.x - ox, t.z - oz), dh: wrap(lh - t.h), lh };
}

/* впереди по ходу (dir = 1 — нос, −1 — корма) кто-то ближе WAIT м к кузову */
function blockedAhead (t, dir) {
  const hl = t.hl || 2.2, fx = Math.sin(t.h) * dir, fz = Math.cos(t.h) * dir, V = A.V;
  const near = (x, z, w) => { const dx = x - t.x, dz = z - t.z, al = dx * fx + dz * fz; return al > 0 && al < hl + CB.WAIT && Math.abs(dx * fz - dz * fx) < w; };
  if (near(V.x, V.z, 2.2)) return true;
  let [n, L] = A.carsNear(t.x, t.z, hl + CB.WAIT + 3);
  for (let i = 0; i < n; i++) { const o = L[i]; if (o !== t && !o.gone && near(o.x, o.z, 1.9) && Math.hypot(o.x - t.x, o.z - t.z) < hl + (o.hl || 2.2) + CB.WAIT) return true; }
  [n, L] = A.walkersNear(t.x, t.z, hl + CB.WAIT);
  for (let i = 0; i < n; i++) { const p = L[i]; if (!p.dead && near(p.x, p.z, 1.3)) return true; }
  return false;
}

export function step (t, dt) {
  const C = t.cb;
  if (!C) return false;
  C.T += dt;
  const e = C.e;
  if (!e || C.gave) {                              // стоит, где стоит; не видно — переставляем
    t.speed = 0;
    if ((C.wT = (C.wT || 0) - dt) <= 0) { C.wT = 1; if (!A.shown(t.x, t.z)) { ST.moved++; t.cb = null; A.respawn(t); } }
    return true;
  }
  const R = rel(t, e);
  if (R.d > CB.FAR) { C.gave = 1; ST.gave++; return true; }
  // проехала конец улицы, так и не встав в полосу, — на следующую (самую прямую)
  if (R.s > R.run - CB.END) { const n = A.next(e); if (n && n !== e) { C.e = n; ST.next++; return true; } }
  // встала в полосу — дальше обычная езда (не у самого конца ребра: там дуга перекрёстка начиналась бы рывком)
  if (Math.abs(R.lat) < CB.DONE && Math.abs(R.dh) < CB.DONE_H && R.s >= 0 && R.s <= R.run - CB.END) {
    t.cb = null; ST.done++;
    return A.join(t, e, R.s, Math.max(0, C.sp * C.dir), R.lat) ? false : true;
  }
  if (C.T > CB.GIVE) { C.gave = 1; ST.gave++; t.speed = 0; return true; }
  // цель — точка полосы впереди; сколько ещё ехать вбок — столько и вперёд (плавный заход)
  const look = Math.max(CB.LOOK, Math.abs(R.lat) * CB.LOOK_K), sa = Math.max(0, R.s) + look;
  const [ax0, az0] = A.lane(e, Math.min(sa, R.run)), ax = ax0 + e.ux * Math.max(0, sa - R.run), az = az0 + e.uz * Math.max(0, sa - R.run);
  const ang = wrap(Math.atan2(ax - t.x, az - t.z) - t.h);
  C.lat = R.lat; C.dh = R.dh; C.ang = ang; C.s = R.s; C.run = R.run;
  if (C.dir > 0 && Math.abs(ang) > CB.REV) { C.dir = -1; C.rd = 0; ST.rev++; }
  else if (C.dir < 0 && (Math.abs(ang) < CB.FWD || C.rd > CB.REV_D)) { C.dir = 1; C.rd = 0; }
  const vmax = C.dir > 0 ? CB.V * Math.max(0.45, 1 - Math.abs(ang) / 2) : CB.VR;
  const want = blockedAhead(t, C.dir) ? 0 : vmax;
  if (!want && C.sp > 0.05) ST.waits += dt;
  C.sp = C.sp < want ? Math.min(want, C.sp + CB.ACC * dt) : Math.max(want, C.sp - CB.ACC * 1.6 * dt);
  const v = C.sp * C.dir;
  // руль: вперёд — нос к цели; назад — корма уводит нос к цели
  const steer = Math.max(-1, Math.min(1, ang * 2)) * (C.dir > 0 ? 1 : -1);
  const x0 = t.x, z0 = t.z;
  t.h = wrap(t.h + v / CB.R * steer * dt);
  t.x += Math.sin(t.h) * v * dt; t.z += Math.cos(t.h) * v * dt;
  const bx = t.x, bz = t.z;
  A.pushOut(t, 1.1);                               // в дом не въезжает
  const moved = Math.hypot(t.x - x0, t.z - z0);
  if (moved > Math.abs(v) * dt + 1e-4) { const k = Math.abs(v) * dt / moved; t.x = x0 + (t.x - x0) * k; t.z = z0 + (t.z - z0) * k; }   // стена не толкает быстрее хода
  if (Math.abs(t.x - bx) + Math.abs(t.z - bz) > 0.01 && C.sp > 0.3) {
    if ((C.stuck += dt) > CB.STUCK) { C.stuck = 0; C.dir = -C.dir; C.rd = 0; C.sp = 0; ST.stuck++; }
  } else C.stuck = Math.max(0, C.stuck - dt * 0.5);
  if (C.dir < 0) C.rd += Math.abs(v) * dt;
  t.speed = v;                                     // знак — ход (толкает людей, pedcollide.js; колёса)
  A.pose(t, dt, steer);
  return true;
}

export const DEBUG = { CB, ST };
