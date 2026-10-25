/* Мягкий город: общий профиль света и небольшие фаски внутри прежних габаритов.
   Ветка сравнения: ?hardcity — прежний вид, ?softlightonly — только свет.
   Никакой случайности: адреса, проёмы и предметы города от оформления не зависят. */
const Q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
export const STYLE = {
  on: !Q.has('hardcity'),
  geometry: !Q.has('hardcity') && !Q.has('softlightonly'),
  sun: 0.74, sky: 1.08, fill: 0.06, nightFill: 0.035,
  shadow: 0.27, curb: 0.035, corner: 0.22,
};
export const STATS = { corners: 0, curbEdges: 0 };

// Called after the base day/night profile is reset, before weather and lightning.
export function light (sun, hemi, amb, night, rain) {
  if (!STYLE.on) return;
  const day = 1 - night, clear = 1 - Math.min(1, rain) * 0.6;
  sun.intensity *= 1 - (1 - STYLE.sun) * day * clear;
  if (hemi) hemi.intensity *= 1 + (STYLE.sky - 1) * day * clear;
  if (amb) amb.intensity += STYLE.fill * day * clear + STYLE.nightFill * night;
}

// Clip only convex, roomy corners; keep original points for mapping and collisions.
export function corners (p, ccw) {
  if (!STYLE.geometry) return null;
  return p.map((v, i) => {
    const a = p[(i + p.length - 1) % p.length], b = p[(i + 1) % p.length];
    const la = Math.hypot(v[0] - a[0], v[1] - a[1]), lb = Math.hypot(b[0] - v[0], b[1] - v[1]);
    if (la < 2 || lb < 2) return null;
    const ux = (v[0] - a[0]) / la, uz = (v[1] - a[1]) / la, vx = (b[0] - v[0]) / lb, vz = (b[1] - v[1]) / lb;
    const cross = (ux * vz - uz * vx) * (ccw ? 1 : -1), dot = ux * vx + uz * vz;
    if (cross < 0.3 || dot < -0.5) return null;
    const r = Math.min(STYLE.corner, la * 0.08, lb * 0.08);
    const start = [v[0] - ux * r, v[1] - uz * r], end = [v[0] + vx * r, v[1] + vz * r];
    const arc = [start];
    for (let j = 1; j < 3; j++) {
      const t = j / 3, s = 1 - t;
      arc.push([s * s * start[0] + 2 * s * t * v[0] + t * t * end[0], s * s * start[1] + 2 * s * t * v[1] + t * t * end[1]]);
    }
    arc.push(end); STATS.corners++;
    return { start, end, arc };
  });
}

export function cornerWalls (M, list, low, high) {
  if (!list) return;
  for (const c of list) if (c) for (let i = 1; i < c.arc.length; i++) {
    const a = c.arc[i - 1], b = c.arc[i];
    M.wall(a[0], a[1], b[0], b[1], low, high);
  }
}

// Front edge -> top, with a narrow bevel. a/b are front, c/d are back at the same ends.
// Heights stay continuous at mitres and curves: interpolate each end independently.
export function curbEdge (M, a, b, c, d, bottom0, bottom1, top0, top1, width = STYLE.curb) {
  const w0 = Math.hypot(c[0] - a[0], c[1] - a[1]), w1 = Math.hypot(d[0] - b[0], d[1] - b[1]);
  const cut = Math.max(0, Math.min(width, w0 * 0.35, w1 * 0.35, (top0 - bottom0) * 0.4, (top1 - bottom1) * 0.4));
  const t0 = w0 ? cut / w0 : 0, t1 = w1 ? cut / w1 : 0;
  const aa = [a[0] + (c[0] - a[0]) * t0, a[1] + (c[1] - a[1]) * t0];
  const bb = [b[0] + (d[0] - b[0]) * t1, b[1] + (d[1] - b[1]) * t1];
  M.quad(a[0], bottom0, a[1], b[0], bottom1, b[1], b[0], top1 - cut, b[1], a[0], top0 - cut, a[1]);
  M.up(a[0], top0 - cut, a[1], b[0], top1 - cut, b[1], bb[0], top1, bb[1]);
  M.up(a[0], top0 - cut, a[1], bb[0], top1, bb[1], aa[0], top0, aa[1]);
  STATS.curbEdges++;
  return [aa, bb];
}

export function curbStone (M, a, b, c, d, bottom0, bottom1, top0, top1) {
  M.color('#bbb8b0');
  const [aa, bb] = curbEdge(M, a, b, c, d, bottom0, bottom1, top0, top1);
  M.color('#d6d2c9');
  M.up(aa[0], top0, aa[1], bb[0], top1, bb[1], d[0], top1, d[1]);
  M.up(aa[0], top0, aa[1], d[0], top1, d[1], c[0], top0, c[1]);
}
