/* ──────────────────────────────────────────────────────────────────────────
   Подъезд (2г5, 25.10.2026; автор по референсам: «подъезд с козырьком и доской объявлений»). Правила словами —
   docs/CAREER.md «Город: как выглядит» → «Подъезд».

   К прежнему подъезду (дверь, лампа, козырёк-плита, ступенька — game.js entranceAt; лавочка у двери и урна — свои, как
   были) добавляется:
     • козырёк — бетонная плита с мягкой скруглённой кромкой спереди; держится на двух косых опорах от стены (45 %),
       на двух трубах от земли (25 %) или просто консолью (30 %);
     • доска объявлений сбоку от двери (у 80 % подъездов, сторона — от места): рамка, на ней 3—6 белых и цветных листков.
   Прямо в склейки LITM (рамка, кромка, опоры) и FLATM (листки) — без вещей three.js, без Math.random (зерно сборки не
   сдвигается), без новых вызовов отрисовки. Жребий — от места двери. ?oldporch (и общий ?oldlook) — как было.
   ────────────────────────────────────────────────────────────────────────── */
import { mbox } from './roofbits.js';

const QS = typeof location !== 'undefined' ? location.search : '';
export const ON = !/[?&](oldporch|oldlook)(&|$)/.test(QS);

export const PORCH = {
  SLAB: '#a8a39a',                               // козырёк — бетон (был сиреневато-серый #8f8a93)
  STRUTS: 0.45, POSTS: 0.25,                     // косые опоры / трубы от земли; остальное — консоль
  METAL: ['#4a4d50', '#5d4a3c', '#3f5446', '#6b6e70'],
  BOARD: 0.8,                                    // доля подъездов с доской объявлений
  FRAME: ['#5a4632', '#3f5a46', '#4f5a6a', '#7a6a55'],
  SHEET: ['#f2f0e8', '#ecebe2', '#f4efcf', '#e9d8d4', '#dfe9f0', '#f6f6f2'],
};
export const STATS = { porches: 0, struts: 0, posts: 0, boards: 0, sheets: 0 };

const hsh = (x, z, k) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
const pk = (a, h) => a[Math.min(a.length - 1, (h * a.length) | 0)];

/* брус от p до q (x, y, z) сечением w × w: четыре грани */
function beam (M, p, q, w, hex) {
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], L = Math.hypot(dx, dy, dz) || 1;
  const d = [dx / L, dy / L, dz / L];
  let s = [-d[2], 0, d[0]]; const sl = Math.hypot(s[0], s[2]);
  s = sl > 1e-3 ? [s[0] / sl, 0, s[2] / sl] : [1, 0, 0];
  const u = [s[1] * d[2] - s[2] * d[1], s[2] * d[0] - s[0] * d[2], s[0] * d[1] - s[1] * d[0]], h = w / 2;
  const C = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([a, b]) => [s[0] * a * h + u[0] * b * h, s[1] * a * h + u[1] * b * h, s[2] * a * h + u[2] * b * h]);
  M.color(hex);
  for (let i = 0; i < 4; i++) {
    const a = C[i], b = C[(i + 1) % 4];
    M.tri(p[0] + a[0], p[1] + a[1], p[2] + a[2], q[0] + a[0], q[1] + a[1], q[2] + a[2], q[0] + b[0], q[1] + b[1], q[2] + b[2]);
    M.tri(p[0] + a[0], p[1] + a[1], p[2] + a[2], q[0] + b[0], q[1] + b[1], q[2] + b[2], p[0] + b[0], p[1] + b[1], p[2] + b[2]);
  }
}

/* подъезд у двери x, z (наружу nx, nz; земля у двери gy): козырёк game.js — плита 2,5 × 0,18 × 1,35 м, середина в 0,7 м от
   стены на высоте gy + 2,7 */
export function porch (A, x, z, nx, nz, gy) {
  const { LITM, FLATM } = A, tx = nz, tz = -nx;
  const P = (s, o, y) => [x + tx * s + nx * o, y, z + tz * s + nz * o];
  const y0 = gy + 2.61, y1 = gy + 2.79, front = 0.7 + 0.675, hw = 1.25;
  STATS.porches++;
  // мягкая кромка: полукруглый нос вдоль передней грани плиты
  LITM.color(PORCH.SLAB);
  const r = (y1 - y0) / 2, yc = (y0 + y1) / 2, seg = 4;
  for (let i = 0; i < seg; i++) {
    const a0 = -Math.PI / 2 + Math.PI * i / seg, a1 = -Math.PI / 2 + Math.PI * (i + 1) / seg;
    const o0 = front + Math.cos(a0) * r * 0.8, o1 = front + Math.cos(a1) * r * 0.8, ya = yc + Math.sin(a0) * r, yb = yc + Math.sin(a1) * r;
    const a = P(-hw, o0, ya), b = P(hw, o0, ya), c = P(hw, o1, yb), d = P(-hw, o1, yb);
    LITM.tri(...a, ...b, ...c); LITM.tri(...a, ...c, ...d);
  }
  // опоры
  const h = hsh(x, z, 61), metal = pk(PORCH.METAL, hsh(x, z, 62));
  if (h < PORCH.STRUTS) {
    for (const s of [-1, 1]) beam(LITM, P(s * 1.0, 0.03, gy + 2.0), P(s * 1.0, front - 0.15, y0), 0.07, metal);   // от стены над доской
    STATS.struts++;
  } else if (h < PORCH.STRUTS + PORCH.POSTS) {
    for (const s of [-1, 1]) beam(LITM, P(s * 1.05, front - 0.2, gy - 0.05), P(s * 1.05, front - 0.2, y0), 0.08, metal);
    STATS.posts++;
  }
  // доска объявлений сбоку от двери: рамка на стене, листки
  if (hsh(x, z, 63) < PORCH.BOARD) {
    const sd = hsh(x, z, 64) < 0.5 ? 1 : -1, bs = sd * 1.25, bw = 0.62, bh = 0.72, by0 = gy + 1.12;
    const c = P(bs, 0.035, 0);
    mbox(LITM, c[0], by0, c[2], bw, 0.05, bh, tx, tz, pk(PORCH.FRAME, hsh(x, z, 65)));
    const n = 3 + Math.floor(hsh(x, z, 66) * 4);
    for (let i = 0; i < n; i++) {
      const o = 0.063 + i * 0.003;                    // каждый следующий листок — чуть поверх (не мерцают)
      const w = 0.12 + hsh(x + i, z, 67) * 0.1, ht = 0.14 + hsh(x, z + i, 68) * 0.12;
      const sc = bs - bw / 2 + 0.05 + w / 2 + hsh(x + i, z - i, 69) * (bw - 0.1 - w);
      const yc2 = by0 + 0.05 + ht / 2 + hsh(x - i, z + i, 70) * (bh - 0.1 - ht);
      const a = P(sc - w / 2, o, yc2 - ht / 2), b = P(sc + w / 2, o, yc2 - ht / 2), cc = P(sc + w / 2, o, yc2 + ht / 2), d = P(sc - w / 2, o, yc2 + ht / 2);
      FLATM.color(pk(PORCH.SHEET, hsh(x + i * 1.3, z, 71)));
      FLATM.quad(...a, ...b, ...cc, ...d, nx, 0, nz);
      STATS.sheets++;
    }
    STATS.boards++;
  }
}
if (typeof window !== 'undefined' && /[?&]debug/.test(QS)) window.__PORCH = STATS;   // отладка
