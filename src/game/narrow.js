/* ──────────────────────────────────────────────────────────────────────────
   Узкие дороги для машин потока (правила — docs/CAREER.md «Движение машин» → «Узкие дороги»).

   Ширина полотна — из выгрузки карты (r.w: по числу полос из OSM, во дворах сужена до стен;
   без неё — по классу улицы, game.js ROAD_W). Двусторонняя улица:
     • уже ONE_LANE м — одна полоса посередине: машина едет по оси, а не «в две полосы»;
       встречная (машина потока, служебная или курьер) ближе LOOK м — обе прижимаются вправо
       (до четверти ширины, но не ближе MARGIN м к бордюру) и сбрасывают ход до SLOW крейсерской;
       ещё не разъехались, а встречная уже в CLOSE м — почти стоят (STOP);
     • уже ONE_WAY м (двум машинам не разъехаться) — для потока ещё и односторонняя: заезжают
       только с узла с меньшим номером; тупиковые такие — поток туда не заезжает вовсе.
   Курьера (игрока) это не касается — он едет где хочет; прижимаются перед ним машины потока.

   Из game.js: narrow(e) — одна полоса посередине; flowOk(e, deg) — можно ли потоку на ребро;
   step(t, dt, TRAFFIC, V) → доля скорости (1 — не мешает), сдвиг вправо — t.nar (м).
   ────────────────────────────────────────────────────────────────────────── */

export const NARROW = {
  ONE_LANE: 7,    // м: двусторонняя уже — одна полоса посередине
  ONE_WAY: 5,     // м: ещё уже — для потока односторонняя
  LOOK: 38,       // м: встречную видит заранее и начинает прижиматься
  CLOSE: 12,      // м: встречная так близко, а не прижался — почти стоп
  SLOW: 0.5,      // доля крейсерской, пока разъезжаются
  STOP: 0.12,
  HALF_W: 1.0,    // м: полширины машины потока
  MARGIN: 0.15,   // м: до бордюра
  PULL_K: 2.6,    // как быстро прижимается (1/с)
};

export const narrow = e => !!e && !e.oneway && e.w < NARROW.ONE_LANE;
const tiny = e => narrow(e) && e.w < NARROW.ONE_WAY;
/* насколько можно прижаться вправо от оси */
export const pullMax = e => Math.max(0, Math.min(e.w / 4, e.w / 2 - NARROW.HALF_W - NARROW.MARGIN));

/* можно ли машине потока на это ребро: самые узкие — в одну сторону, тупиковые — никак */
export function flowOk (e, deg) {
  if (!tiny(e)) return true;
  return e.a < e.b && deg(e.a) > 1 && deg(e.b) > 1;
}

const ST = { pulls: 0, waits: 0 };
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

/* машина t на узком ребре t.e: есть ли встречная впереди; двигает t.nar, возвращает долю скорости */
export function step (t, dt, list, V) {
  const e = t.e, hx = Math.sin(t.h), hz = Math.cos(t.h);
  let near = Infinity, beside = false;
  const look = (ox, oz, oh, ohl) => {
    const dx = ox - t.x, dz = oz - t.z, fw = dx * hx + dz * hz;
    if (fw > NARROW.LOOK || fw < -((t.hl || 2.3) + ohl + 1)) return;     // разъехались — когда хвосты разошлись
    if (Math.abs(-hz * dx + hx * dz) > e.w * 0.5 + 2.5) return;           // не на этой улице
    if (Math.sin(oh) * hx + Math.cos(oh) * hz > -0.4) return;             // не навстречу
    if (fw > 0) near = Math.min(near, fw); else beside = true;
  };
  for (const o of list) {
    if (o === t || o.parked || o.knock || o.gone || Math.abs(o.x - t.x) > NARROW.LOOK || Math.abs(o.z - t.z) > NARROW.LOOK) continue;
    look(o.x, o.z, o.h, o.hl || 2.3);
  }
  if (V && Math.hypot(V.vx || 0, V.vz || 0) > 1) look(V.x, V.z, V.h, 2.3);   // курьер едет навстречу — тоже уступаем
  const want = near < Infinity || beside ? pullMax(e) : 0;
  t.nar = damp(t.nar || 0, want, NARROW.PULL_K, dt);
  if (near === Infinity) return 1;              // поравнялись — уже не тормозит, но держится у края
  ST.pulls++;
  if (near < NARROW.CLOSE && t.nar < want * 0.75) { ST.waits++; return NARROW.STOP; }
  return NARROW.SLOW;
}

/* после узкого ребра сдвиг плавно уходит */
export const relax = (t, dt) => { if (t.nar) t.nar = Math.abs(t.nar) < 0.01 ? 0 : damp(t.nar, 0, NARROW.PULL_K, dt); };

export const DEBUG = { NARROW, ST, narrow, flowOk, pullMax };
