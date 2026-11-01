/* Место магазина на существующей стене. Подъезд сохраняет адрес и полный подход;
   магазин с витриной и козырьком занимает ближайший свободный отрезок этой же стены. */
export const DOOR_HALF = 1.65;
export const SHOP_MARGIN = 0.25;

export function entranceOverlap (x, z, nx, nz, half, e) {
  const dx = e[0] - x, dz = e[1] - z;
  // Запас включает вынос козырька, опоры и подход с обеих сторон угла дома.
  return Math.abs(dx * nx + dz * nz) < 2.8 &&
    Math.abs(dx * nz - dz * nx) < half + (e[4] ? 2.55 : DOOR_HALF) + SHOP_MARGIN;
}

export function shopSlot (x, z, nx, nz, half, buildings, doors) {
  const tx = nz, tz = -nx, spans = [];
  for (const b of buildings) for (let i = 0; i < b.p.length; i++) {
    const a = b.p[i], c = b.p[(i + 1) % b.p.length];
    const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
    if (len < 2 * half + 0.6 || Math.abs(dx * nx + dz * nz) > len * 0.08) continue;
    if (Math.abs((a[0] - x) * nx + (a[1] - z) * nz) > 0.65) continue;
    const s0 = (a[0] - x) * tx + (a[1] - z) * tz, s1 = (c[0] - x) * tx + (c[1] - z) * tz;
    const lo = Math.min(s0, s1), hi = Math.max(s0, s1);
    if (lo > 0.5 || hi < -0.5) continue;
    spans.push([lo + half + 0.3, hi - half - 0.3]);
  }
  let best = null;
  for (const [lo, hi] of spans) {
    const cand = [Math.max(lo, Math.min(hi, 0)), lo, hi];
    for (const e of doors) {
      if (Math.abs((e[0] - x) * nx + (e[1] - z) * nz) >= 2.8) continue;
      const at = (e[0] - x) * tx + (e[1] - z) * tz;
      const gap = half + (e[4] ? 2.55 : DOOR_HALF) + SHOP_MARGIN + 0.01;
      cand.push(at - gap, at + gap);
    }
    for (const s of cand) {
      if (s < lo || s > hi || (best !== null && Math.abs(s) >= Math.abs(best))) continue;
      if (!doors.some(e => entranceOverlap(x + tx * s, z + tz * s, nx, nz, half, e))) best = s;
    }
  }
  return best === null ? null : { x: x + tx * best, z: z + tz * best };
}
