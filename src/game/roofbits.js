/* ──────────────────────────────────────────────────────────────────────────
   Крыши многоэтажек (2г4, 25.10.2026; автор по референсам: «на домах антенны и кирпичные трубы»). Правила словами —
   docs/CAREER.md «Город: как выглядит» → «Крыши многоэтажек».

   На плоской крыше жилого дома от 4 этажей (кроме сталинок — у них карниз):
     • крыша — тёмный рубероид (серо-бурый, у дома свой оттенок), а не розовато-серая;
     • вдоль каждой стены от 10 м — секции по ~24 м (как подъезды); у секции 0—2 кирпичные вентшахты в 3—5 м от стены
       (красно-бурый кирпич, бетонная шапка, у части — трубка-дефлектор);
     • телевизионные антенны: мачта с 2—3 перекладинами, 2—5 на дом; между соседними (ближе 16 м) у части — провод
       с провисом;
     • будка выхода на крышу — прежняя коробка facade (тот же жребий, бетон с кирпичом), над дверью — козырёк-плита,
       дверь тёмная; у длинных домов — ещё будка на дальней секции.
   Всё — прямо в склейку LITM (треугольники, как балконы): ни вещей three.js, ни Math.random (зерно сборки не сдвигается),
   ни новых вызовов отрисовки. Не твёрдое (крыши от 4 этажей выше любого прыжка). Без случайного: всё — от места.
   ?noroofbits (и общий ?oldlook) — голые крыши, как было. На телефоне — как было.
   ────────────────────────────────────────────────────────────────────────── */
import { MOB } from './mobile.js';

const QS = typeof location !== 'undefined' ? location.search : '';
export const ON = !/[?&](noroofbits|oldlook)(&|$)/.test(QS) && !MOB.on;   // телефон — как было (память видео)

export const RB = {
  SECTION: 24,                                   // м — длина секции вдоль дома
  BRICK: ['#8e4b3a', '#9a5644', '#7f4536', '#a0604a', '#86503f'],
  CAP: '#a39d94',
  MAST: ['#3a3c3f', '#55585c', '#6b6e72'],
  WIRE: '#2c2d30',
  BOOTH: '#b3aca2', BOOTH_DOOR: '#4d4640', BOOTH_ROOF: '#8f8a83',
  ROOF: ['#77736e', '#827c74', '#6c6966', '#8b857c', '#746e66'],   // плоская крыша многоэтажки — рубероид (была розовато-серая)
  ANT: [2, 5],                                   // антенн на дом: от и до
};
export const STATS = { houses: 0, shafts: 0, antennas: 0, wires: 0, booths: 0, tris: 0 };

const hsh = (x, z, k) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
const pk = (a, h) => a[Math.min(a.length - 1, (h * a.length) | 0)];

/* коробка: середина x, z; низ y0; вдоль (ux, uz) — w, поперёк — d, высота hgt; стены и верх */
export const roofHex = (x, z) => pk(RB.ROOF, hsh(x, z, 9));

export function mbox (M, x, y0, z, w, d, hgt, ux, uz, hex, top = true) {
  const vx = -uz, vz = ux, a = w / 2, b = d / 2;
  const P = [[x - ux * a - vx * b, z - uz * a - vz * b], [x + ux * a - vx * b, z + uz * a - vz * b], [x + ux * a + vx * b, z + uz * a + vz * b], [x - ux * a + vx * b, z - uz * a + vz * b]];
  M.color(hex);
  for (let i = 0; i < 4; i++) { const p = P[i], q = P[(i + 1) % 4]; M.wall(p[0], p[1], q[0], q[1], y0, y0 + hgt); }
  if (top) { const y = y0 + hgt; M.up(P[0][0], y, P[0][1], P[1][0], y, P[1][1], P[2][0], y, P[2][1]); M.up(P[0][0], y, P[0][1], P[2][0], y, P[2][1], P[3][0], y, P[3][1]); }
  STATS.tris += top ? 10 : 8;
}
/* тонкий стержень от p до q (x, y, z): две ленты крестом — видно и сбоку, и снизу */
export function rod (M, p, q, th, hex) {
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], l = Math.hypot(dx, dz) || 1, h = th / 2;
  const nx = -dz / l * h, nz = dx / l * h;      // поперёк по горизонтали
  M.color(hex);
  M.tri(p[0] + nx, p[1], p[2] + nz, q[0] + nx, q[1], q[2] + nz, q[0] - nx, q[1], q[2] - nz);
  M.tri(p[0] + nx, p[1], p[2] + nz, q[0] - nx, q[1], q[2] - nz, p[0] - nx, p[1], p[2] - nz);
  M.tri(p[0], p[1] - h, p[2], q[0], q[1] - h, q[2], q[0], q[1] + h, q[2]);
  M.tri(p[0], p[1] - h, p[2], q[0], q[1] + h, q[2], p[0], p[1] + h, p[2]);
  STATS.tris += 4;
  return dy;
}

/* антенна: мачта и 2—3 перекладины, повёрнуты по-своему; вернёт верх мачты */
function antenna (M, x, y, z, k) {
  const H = 2.6 + hsh(x, z, k + 1) * 2.0, col = pk(RB.MAST, hsh(x, z, k + 2)), a = hsh(x, z, k + 3) * Math.PI;
  const ux = Math.cos(a), uz = Math.sin(a);
  mbox(M, x, y - 0.05, z, 0.1, 0.1, H + 0.05, ux, uz, col, false);
  mbox(M, x, y - 0.05, z, 0.35, 0.35, 0.15, ux, uz, '#7c7872');      // пятка на крыше
  const n = hsh(x, z, k + 4) < 0.5 ? 2 : 3;
  for (let i = 0; i < n; i++) {
    const yy = y + H - 0.15 - i * 0.5, L = (1.6 - i * 0.35) / 2;
    rod(M, [x - ux * L, yy, z - uz * L], [x + ux * L, yy, z + uz * L], 0.07, col);
  }
  if (hsh(x, z, k + 5) < 0.35) rod(M, [x, y + H * 0.45, z], [x + uz * 0.9, y + 0.02, z - ux * 0.9], 0.04, col);   // растяжка
  STATS.antennas++;
  return [x, y + H - 0.1, z];
}

/* провод между верхушками антенн — двумя кусками с провисом */
function wire (M, p, q) {
  const m = [(p[0] + q[0]) / 2, Math.min(p[1], q[1]) - 0.25 - Math.hypot(q[0] - p[0], q[2] - p[2]) * 0.02, (p[2] + q[2]) / 2];
  rod(M, p, m, 0.03, RB.WIRE); rod(M, m, q, 0.03, RB.WIRE);
  STATS.wires++;
}

/* крыша дома: p — контур, h — высота крыши, inPoly(x, z, p); exit — [x, z] будки из facade (или null) */
export function roof (M, o) {
  const { p, h, inPoly } = o, n = p.length;
  // длинная ось — по самой длинной стене
  let ux = 1, uz = 0, best = 0;
  for (let i = 0; i < n; i++) {
    const a = p[i], c = p[(i + 1) % n], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (l > best) { best = l; ux = (c[0] - a[0]) / l; uz = (c[1] - a[1]) / l; }
  }
  const vx = -uz, vz = ux;
  if (o.exit) booth(M, o.exit[0], h, o.exit[1], 1, 0, 2.5, 2.5, 2.2);   // выход на крышу — вокруг прежней коробки facade (2,2 м, по осям мира)
  let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
  for (const q of p) { const s = q[0] * ux + q[1] * uz, t = q[0] * vx + q[1] * vz; s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
  const W = t1 - t0, Ls = s1 - s0;
  if (W < 6 || Ls < 8) return;
  const free = (x, z, r) => inPoly(x, z, p) && inPoly(x + r, z, p) && inPoly(x - r, z, p) && inPoly(x, z + r, p) && inPoly(x, z - r, p);
  const ex = o.exit, y = h, put = [];
  const clear = (x, z, r) => (!ex || Math.hypot(x - ex[0], z - ex[1]) > r) && put.every(q => Math.hypot(x - q[0], z - q[1]) > Math.max(r, q[2]));
  const ccw = o.ccw ?? (p.reduce((a, q, i) => a + q[0] * p[(i + 1) % n][1] - p[(i + 1) % n][0] * q[1], 0) > 0);
  STATS.houses++;
  /* места — от стен внутрь (дом буквой Г и изогнутый тоже): у каждой стены от 10 м — секции по ~24 м, в середине секции
     точка в IN м от стены; что не внутри крыши или ближе других — пропускаем */
  const spots = [];
  for (let i = 0; i < n; i++) {
    const a = p[i], c = p[(i + 1) % n], dx = c[0] - a[0], dz = c[1] - a[1], l = Math.hypot(dx, dz);
    if (l < 10) continue;
    const ix = (ccw ? -dz : dz) / l, iz = (ccw ? dx : -dx) / l, m = Math.max(1, Math.round(l / RB.SECTION));
    for (let j = 0; j < m; j++) {
      const t = (j + 0.5) / m, bx = a[0] + dx * t, bz = a[1] + dz * t;
      spots.push([bx, bz, ix, iz, dx / l, dz / l]);
    }
  }
  // вентшахты: 1—2 на секцию, в 3—5 м от стены
  for (const [bx, bz, ix, iz, tx, tz] of spots) {
    const hm = hsh(bx, bz, 31), m = hm < 0.3 ? 0 : hm < 0.8 ? 1 : 2;   // секция стены: 0—2 (с двух длинных стен дома — 1—3 на секцию)
    for (let j = 0; j < m; j++) {
      const off = (j ? 1 : -1) * (2 + hsh(bx, j, 32) * 3.5), inn = 3 + hsh(bz, j, 33) * 2.2;
      const x = bx + tx * off + ix * inn, z = bz + tz * off + iz * inn;
      if (!free(x, z, 1.2) || !clear(x, z, 3)) continue;
      const bw = 0.8 + hsh(x, z, 34) * 0.5, bd = 0.5 + hsh(x, z, 35) * 0.25, bh = 1.0 + hsh(x, z, 36) * 0.9;
      mbox(M, x, y - 0.05, z, bw, bd, bh + 0.05, tx, tz, pk(RB.BRICK, hsh(x, z, 37)));
      mbox(M, x, y + bh, z, bw + 0.2, bd + 0.2, 0.1, tx, tz, RB.CAP);                       // бетонная шапка
      if (hsh(x, z, 38) < 0.45) mbox(M, x + tx * bw * 0.2, y + bh + 0.1, z + tz * bw * 0.2, 0.22, 0.22, 0.35, tx, tz, '#6f6a64');   // трубка-дефлектор
      put.push([x, z, 3]);
      STATS.shafts++;
    }
  }
  // антенны: 2—5 на дом — в секциях по очереди, от стены 2—6 м; соседние — иногда проводом
  const na = Math.min(RB.ANT[1], Math.max(RB.ANT[0], Math.round(1 + spots.length * 0.45 + hsh(s0, t0, 41) * 2)));
  let prev = null, made = 0;
  for (let i = 0; i < spots.length * 2 && made < na; i++) {
    const [bx, bz, ix, iz, tx, tz] = spots[(i * 7 + Math.floor(hsh(s0, t0, 46) * spots.length)) % spots.length];
    const off = (hsh(bx + i, bz, 42) - 0.5) * 14, inn = 2 + hsh(bx, bz + i, 43) * 4;
    const x = bx + tx * off + ix * inn, z = bz + tz * off + iz * inn;
    if (!free(x, z, 0.8) || !clear(x, z, 2.5)) continue;
    const top = antenna(M, x, y, z, 50 + i * 7);
    put.push([x, z, 2.5]); made++;
    if (prev && Math.hypot(top[0] - prev[0], top[2] - prev[2]) < 16 && hsh(x, z, 44) < 0.6) wire(M, prev, top);
    prev = top;
  }
  // будка выхода — ещё одна на дальней секции длинного дома
  if (Ls >= 60 && spots.length) {
    const [bx, bz, ix, iz, tx, tz] = spots[Math.floor(hsh(s1, t1, 45) * spots.length)], x = bx + ix * 5, z = bz + iz * 5;
    if (free(x, z, 1.6) && clear(x, z, 8)) booth(M, x, y, z, tx, tz);
  }
}

/* будка выхода: бетонная коробка, плита-козырёк, тёмная дверь (с длинной стороны) */
export function booth (M, x, y, z, ux, uz, w = 2.4, d = 1.9, hgt = 2.2) {
  mbox(M, x, y - 0.05, z, w, d, hgt + 0.05, ux, uz, RB.BOOTH);
  mbox(M, x, y + hgt, z, w + 0.3, d + 0.3, 0.12, ux, uz, RB.BOOTH_ROOF);
  const vx = -uz, vz = ux, o = d / 2 + 0.02;
  M.color(RB.BOOTH_DOOR);
  M.wall(x + vx * o - ux * 0.45, z + vz * o - uz * 0.45, x + vx * o + ux * 0.45, z + vz * o + uz * 0.45, y, y + 1.9);
  STATS.booths++; STATS.tris += 2;
}
if (typeof window !== 'undefined' && /[?&]debug/.test(QS)) window.__RBITS = STATS;   // отладка
