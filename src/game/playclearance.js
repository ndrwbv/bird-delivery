/* Горка занимает не только основание: скат, лестница и столкновение тоже должны остаться вне дорог.
   Проверяем весь прямоугольник по всем кускам мощёного рядом (не по ближайшей осевой).
   ux/uz — направление длинной стороны, lo/hi — её концы относительно x/z, half — полуширина. */
import { each } from './pave.js';

const pointSeg2 = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, q = dx * dx + dz * dz;
  const t = q ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / q)) : 0;
  return (x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2;
};
const pointBox2 = (x, z, lo, hi, half) => Math.max(lo - x, 0, x - hi) ** 2 + Math.max(Math.abs(z) - half, 0) ** 2;
function segBox2 (ax, az, bx, bz, lo, hi, half) {
  let t0 = 0, t1 = 1;
  const clip = (a, b, low, high) => {
    const d = b - a;
    if (Math.abs(d) < 1e-12) return a >= low && a <= high;
    const ta = (low - a) / d, tb = (high - a) / d;
    t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb));
    return t0 <= t1;
  };
  if (clip(ax, bx, lo, hi) && clip(az, bz, -half, half)) return 0;
  return Math.min(pointBox2(ax, az, lo, hi, half), pointBox2(bx, bz, lo, hi, half),
    pointSeg2(lo, -half, ax, az, bx, bz), pointSeg2(lo, half, ax, az, bx, bz),
    pointSeg2(hi, -half, ax, az, bx, bz), pointSeg2(hi, half, ax, az, bx, bz));
}

export function clearPlayArea (x, z, ux, uz, lo, hi, half) {
  const mid = (lo + hi) / 2, len = (hi - lo) / 2;
  const cx = x + ux * mid, cz = z + uz * mid, ex = Math.abs(ux) * len + Math.abs(uz) * half, ez = Math.abs(uz) * len + Math.abs(ux) * half;
  let clear = true;
  each(cx - ex, cz - ez, cx + ex, cz + ez, (ax, az, bx, bz, width) => {
    if (!clear) return;
    const al = (ax - x) * ux + (az - z) * uz, ap = -(ax - x) * uz + (az - z) * ux;
    const bl = (bx - x) * ux + (bz - z) * uz, bp = -(bx - x) * uz + (bz - z) * ux;
    if (segBox2(al, ap, bl, bp, lo, hi, half) <= (width + 0.15) ** 2) clear = false;
  });
  return clear;
}
