/* ──────────────────────────────────────────────────────────────────────────
   Крыши низких домов — твёрдые сверху (автор 17.10.2026: «запрыгнуть на небольшой дом»).
   docs/CAREER.md → «Трамплины и крыши».

   Какие: дома из карты, у которых крыша не выше ROOF.MAX_H над самым низким углом —
   ряды гаражей (2,7 м), одноэтажные магазины, цеха, павильоны, жилые одноэтажки
   (плоские и двускатные / вальмовые — та же раскладка, что CBITS.gableRoof), пиццерия,
   если она в таком доме. Плюс то, что заведёт кто-то ещё (кабина фуры у трамплина — jumps.js).
   Высокие дома — по-прежнему стена.

   Как работает:
     • add(p, top, o) — крыша: контур, высота (плоская) или скаты; вернёт запись r;
       у стен дома game.js ставит s.topY — выше неё кузов стену не цепляет;
     • at(x, z, y) — высота крыши под точкой, если машина уже примерно на ней
       (y не ниже ROOF.STEP от крыши): сбоку снизу на крышу не «запрыгнешь» — держит стена;
       нет крыши — −Infinity. «Высота опоры» = max(земля / мост, крыша) — game.js supportAt;
     • under(x, z) — запись крыши над точкой (без проверки высоты) — для «ты на крыше».
   Сетка — клетками CELL м, ключ — число (без строк в кадре).
   ────────────────────────────────────────────────────────────────────────── */

export const ROOF = {
  MAX_H: 6.5,      // крыша не выше этого над самым низким углом дома, м: одноэтажки (4,25) и гаражи (2,7)
  STEP: 0.8,       // машина ниже крыши больше чем на STEP — крыша её не держит (едет мимо / в стену)
  PASS: 0.35,      // кузов выше верха стены минус PASS — стена не держит (стоишь на крыше у края)
  DROP: 0.9,       // опора ушла вниз больше чем на DROP за шаг — машина падает (с края крыши, с трамплина)
  MIN_W: 3.2,      // уже этого (узкие пристройки) — не крыша: машине не встать
};
const CELL = 32;
const GRID = new Map();
export const LIST = [];
export const STATS = { flat: 0, gable: 0, other: 0 };
const key = (i, j) => i * 8191 + j;

function inPoly (x, z, p) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0], zi = p[i][1], xj = p[j][0], zj = p[j][1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/* прямоугольник по самой длинной стене: оси u (вдоль) и n (поперёк), пределы a0…a1, b0…b1 */
export function frame (p) {
  let best = 0, ang = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > best) { best = l; ang = Math.atan2(b[1] - a[1], b[0] - a[0]); }
  }
  const ux = Math.cos(ang), uz = Math.sin(ang), nx = -uz, nz = ux;
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity, area2 = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i], r = p[(i + 1) % p.length];
    area2 += q[0] * r[1] - r[0] * q[1];
    const a = q[0] * ux + q[1] * uz, b = q[0] * nx + q[1] * nz;
    a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b);
  }
  return { ux, uz, nx, nz, a0, a1, b0, b1, area: Math.abs(area2) / 2, fill: Math.abs(area2) / 2 / ((a1 - a0) * (b1 - b0) || 1) };
}

/* та же раскладка ската, что CBITS.gableRoof (citybits.js): null — не прямоугольник (там будет шатёр) */
export function gableOf (p, h, hipped) {
  if (p.length < 4 || p.length > 6) return null;
  const f = frame(p);
  if (f.fill < 0.82) return null;
  const ov = 0.45;
  const a0 = f.a0 - ov, a1 = f.a1 + ov, b0 = f.b0 - ov, b1 = f.b1 + ov;
  const W = b1 - b0, rise = Math.min(4.5, W * (hipped ? 0.3 : 0.42));
  return { ux: f.ux, uz: f.uz, nx: f.nx, nz: f.nz, a0, a1, b0, b1, bm: (b0 + b1) / 2, W, rise, y0: h - 0.15,
    hip: hipped ? Math.min(W * 0.5, (a1 - a0) * 0.3) : 0 };
}

/* o: { kind, gable } — gable из gableOf (скаты), без него — плоская на высоте top */
export function add (p, top, o = {}) {
  const f = frame(p);
  if (f.b1 - f.b0 < ROOF.MIN_W && !o.force) return null;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
  const g = o.gable || null;
  if (g) { x0 -= 0.5; z0 -= 0.5; x1 += 0.5; z1 += 0.5; }
  const r = { p, top, g, kind: o.kind || '', x0, z0, x1, z1, f, peak: g ? g.y0 + g.rise : top };
  LIST.push(r);
  if (g) STATS.gable++; else if (o.kind === 'other') STATS.other++; else STATS.flat++;
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
    for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
      const k = key(i, j);
      let a = GRID.get(k);
      if (!a) GRID.set(k, a = []);
      a.push(r);
    }
  return r;
}

/* высота крыши r в точке (x, z); NaN — точка не над крышей */
export function heightOf (r, x, z) {
  if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) return NaN;
  const g = r.g;
  if (!g) return inPoly(x, z, r.p) ? r.top : NaN;
  const a = x * g.ux + z * g.uz, b = x * g.nx + z * g.nz;
  if (a < g.a0 || a > g.a1 || b < g.b0 || b > g.b1) return NaN;
  let k = 1 - Math.abs(b - g.bm) / (g.W / 2);
  if (g.hip) k = Math.min(k, (a - g.a0) / g.hip, (g.a1 - a) / g.hip);
  return g.y0 + g.rise * Math.max(0, k);
}

/* высота крыши под точкой для машины на высоте y (см. шапку); −Infinity — нет */
export function at (x, z, y) {
  const a = GRID.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!a) return -Infinity;
  let best = -Infinity;
  for (let i = 0; i < a.length; i++) {
    const h = heightOf(a[i], x, z);
    if (h !== h) continue;
    if (y !== undefined && y < h - ROOF.STEP) continue;
    if (h > best) best = h;
  }
  return best;
}

/* крыша над точкой, любой высоты (null — нет) */
export function under (x, z) {
  const a = GRID.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!a) return null;
  for (let i = 0; i < a.length; i++) { const h = heightOf(a[i], x, z); if (h === h) return a[i]; }
  return null;
}

export const DEBUG = { ROOF, LIST, STATS, at, under, heightOf };
