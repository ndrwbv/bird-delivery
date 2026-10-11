/* ──────────────────────────────────────────────────────────────────────────
   Край города без стены (11.10.2026, автор: «невидимые стены города надо
   убрать»; правила — docs/CAREER.md «Край города: без стены»).

   Раньше за границей закрытого города (бетонный забор убран 10.10.2026)
   машину откатывало назад на шаг, как от стены. Теперь граница мягкая:
     • за линию границы можно заехать — дальше поле, лес или берег;
     • чем ближе к пределу (LIM м за границей, или край данных карты —
       что ближе), тем сильнее вязнет движение НАРУЖУ: скорость от края
       не больше √(2·A·осталось) — как торможение с замедлением A; вдоль
       края и обратно в город — без помех;
     • на самом пределе машина просто стоит (без отскока, звука и урона),
       развернуться и уехать можно сразу.
   Дороги через границу перекрыты, как были: будки КПП со шлагбаумом и
   блоки «дорога закрыта» (game.js borderEdges).

   API: init(poly, bounds) — граница-многоугольник [[x, z]…] (или null) и
   прямоугольник данных карты { x0, x1, z0, z1 }; at(x, z) — { left, nx, nz }:
   сколько метров до предела и куда «наружу»; slow(V, dt) — притормозить
   движение наружу (true — тормозили уже за линией границы); hold(V) — за пределом вернуть на
   предел (true — вернули).
   ────────────────────────────────────────────────────────────────────────── */

export const EDGE = {
  LIM: 25,        // предел — столько метров за линией границы (озёра на западе — в 35 м, Томь — в 55 м)
  A: 16,          // «замедление» болота: наружу не быстрее √(2·A·осталось) м/с
  WIN: 70,        // ближе этого к пределу — считаем (√(2·16·70) ≈ 47 м/с — максималка машины)
  GRIP: 8,        // как быстро скорость сходится к потолку, 1/с (не рывком)
  TOAST: 6,       // подсказка «дальше закрытая зона» — не чаще раза в столько секунд
};

let SEG = null;           // [ax, az, bx, bz, …]
let INSIDE = null;        // (x, z) → внутри ли границы
let B = null;
const R = { left: 1e9, nx: 0, nz: 0 };
export const STATS = { slowed: 0, held: 0 };

export function init (poly, bounds, inside) {
  B = bounds; INSIDE = inside || null;
  SEG = null;
  if (poly && poly.length > 2) {
    SEG = new Float64Array(poly.length * 4);
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      SEG[i * 4] = a[0]; SEG[i * 4 + 1] = a[1]; SEG[i * 4 + 2] = b[0]; SEG[i * 4 + 3] = b[1];
    }
  }
}

export function at (x, z) {
  R.left = 1e9; R.nx = 0; R.nz = 0;
  if (!B) return R;
  // край данных карты: прямоугольник
  let l = x - B.x0; R.left = l; R.nx = -1; R.nz = 0;
  if ((l = B.x1 - x) < R.left) { R.left = l; R.nx = 1; R.nz = 0; }
  if ((l = z - B.z0) < R.left) { R.left = l; R.nx = 0; R.nz = -1; }
  if ((l = B.z1 - z) < R.left) { R.left = l; R.nx = 0; R.nz = 1; }
  if (!SEG) return R;
  // граница: ближайшая точка многоугольника
  let best = Infinity, px = x, pz = z;
  for (let k = 0; k < SEG.length; k += 4) {
    const ax = SEG[k], az = SEG[k + 1], dx = SEG[k + 2] - ax, dz = SEG[k + 3] - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    const qx = ax + dx * t, qz = az + dz * t, d2 = (x - qx) * (x - qx) + (z - qz) * (z - qz);
    if (d2 < best) { best = d2; px = qx; pz = qz; }
  }
  const d = Math.sqrt(best), out = INSIDE ? !INSIDE(x, z) : false;
  const left = EDGE.LIM - (out ? d : -d);
  if (left < R.left && d > 1e-6) {
    R.left = left;
    R.nx = (out ? x - px : px - x) / d; R.nz = (out ? z - pz : pz - z) / d;
  }
  return R;
}

export function slow (V, dt) {
  const e = at(V.x, V.z);
  if (e.left > EDGE.WIN) return false;
  const vo = V.vx * e.nx + V.vz * e.nz;
  if (vo <= 0) return false;
  const cap = Math.sqrt(2 * EDGE.A * Math.max(0, e.left));
  if (vo <= cap) return false;
  const cut = (vo - cap) * Math.min(1, EDGE.GRIP * dt + (e.left < 3 ? 0.5 : 0));
  V.vx -= e.nx * cut; V.vz -= e.nz * cut;
  STATS.slowed++;
  return e.left < EDGE.LIM - 3;      // подсказку — только уже за линией границы (в городе на разгоне к КПП — молча)
}

export function hold (V) {
  const e = at(V.x, V.z);
  if (e.left >= 0) return false;
  V.x += e.nx * e.left; V.z += e.nz * e.left;
  const vo = V.vx * e.nx + V.vz * e.nz;
  if (vo > 0) { V.vx -= e.nx * vo; V.vz -= e.nz * vo; }
  STATS.held++;
  return true;
}

export const DEBUG = { EDGE, STATS, at: (x, z) => ({ ...at(x, z) }) };
