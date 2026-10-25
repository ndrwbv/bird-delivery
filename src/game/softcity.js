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
export const STATS = { corners: 0, curbEdges: 0, roofs: 0, ridges: 0, lawnEdges: 0 };

// Called after the base day/night profile is reset, before weather and lightning.
export function light (sun, hemi, amb, night, rain) {
  if (!STYLE.on) return;
  const day = 1 - night, clear = 1 - Math.min(1, rain) * 0.6;
  sun.intensity *= 1 - (1 - STYLE.sun) * day * clear;
  if (hemi) hemi.intensity *= 1 + (STYLE.sky - 1) * day * clear;
  if (amb) amb.intensity += STYLE.fill * day * clear + STYLE.nightFill * night;
}

// Clip only convex, roomy corners; keep original points for mapping and collisions.
export function corners (p, ccw, blocked = null) {
  if (!STYLE.geometry) return null;
  return p.map((v, i) => {
    if (blocked?.has(i)) return null;
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

const cross2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
export function inside (p, q) {
  let yes = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[j], b = p[i];
    if (Math.abs(cross2(a, b, q)) < 1e-7 && q[0] >= Math.min(a[0], b[0]) - 1e-7 && q[0] <= Math.max(a[0], b[0]) + 1e-7 && q[1] >= Math.min(a[1], b[1]) - 1e-7 && q[1] <= Math.max(a[1], b[1]) + 1e-7) return true;
    if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < (b[0] - a[0]) * (q[1] - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes;
  }
  return yes;
}

// Matching wall and roof contours. Reject an inset that folds over in a narrow recess.
export function roofRim (p, rounded, ccw) {
  if (!STYLE.geometry) return null;
  const outer = p.flatMap((v, i) => rounded?.[i]?.arc || [v]), inner = [], width = 0.10;
  const sg = ccw ? 1 : -1;
  for (let i = 0; i < outer.length; i++) {
    const a = outer[(i + outer.length - 1) % outer.length], b = outer[i], c = outer[(i + 1) % outer.length];
    const la = Math.hypot(b[0] - a[0], b[1] - a[1]), lb = Math.hypot(c[0] - b[0], c[1] - b[1]);
    if (Math.min(la, lb) < 1e-5) return null;
    const ux = (b[0] - a[0]) / la, uz = (b[1] - a[1]) / la, vx = (c[0] - b[0]) / lb, vz = (c[1] - b[1]) / lb;
    const den = 1 + ux * vx + uz * vz;
    if (den < 0.2) return null;
    const dx = -(uz + vz) * sg * width / den, dz = (ux + vx) * sg * width / den;
    if (Math.hypot(dx, dz) > width * 2.5) return null;
    const q = [b[0] + dx, b[1] + dz];
    if (!inside(outer, q)) return null;
    inner.push(q);
  }
  for (let i = 0; i < inner.length; i++) {
    const j = (i + 1) % inner.length, a = inner[i], b = inner[j], u = outer[i], v = outer[j];
    if ((b[0] - a[0]) * (v[0] - u[0]) + (b[1] - a[1]) * (v[1] - u[1]) <= 1e-8 || !inside(outer, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])) return null;
    for (let k = i + 2; k < inner.length; k++) {
      const l = (k + 1) % inner.length;
      if (l === i) continue;
      const c = inner[k], d = inner[l];
      if (cross2(a, b, c) * cross2(a, b, d) < 0 && cross2(c, d, a) * cross2(c, d, b) < 0) return null;
    }
  }
  STATS.roofs++;
  return { outer, inner, drop: 0.08 };
}

export function flatRoof (M, rim, height) {
  for (let i = 0; i < rim.outer.length; i++) {
    const j = (i + 1) % rim.outer.length, a = rim.outer[i], b = rim.outer[j], c = rim.inner[j], d = rim.inner[i];
    M.up(a[0], height - rim.drop, a[1], b[0], height - rim.drop, b[1], c[0], height, c[1]);
    M.up(a[0], height - rim.drop, a[1], c[0], height, c[1], d[0], height, d[1]);
  }
  M.poly(rim.inner, height, true);
}

// Five cross-sections form a small rounded ridge, with closed gable/hip ends.
export function pitchedRoof (M, base, ends, normal, y0, top, halfWidth, roofHex, wallHex, hipped) {
  if (!STYLE.geometry) return false;
  const radius = Math.min(0.14, halfWidth * 0.08), drop = (top - y0) * radius / halfWidth;
  const [nx, nz] = normal;
  const row = ends.map(p => Array.from({ length: 5 }, (_, i) => {
    const t = i / 2 - 1;
    return [p[0] + nx * radius * t, top - drop * (1 + t * t) / 2, p[1] + nz * radius * t];
  }));
  const [a, b, c, d] = base.map(p => [p[0], y0, p[1]]), [r0, r1] = row;
  M.color(roofHex);
  M.quad(...a, ...b, ...r1[0], ...r0[0]);
  M.quad(...c, ...d, ...r0[4], ...r1[4]);
  for (let i = 0; i < 4; i++) M.quad(...r0[i], ...r1[i], ...r1[i + 1], ...r0[i + 1]);
  M.color(hipped ? roofHex : wallHex);
  const end0 = [d, a, ...r0], end1 = [b, c, ...r1.slice().reverse()];
  for (const face of [end0, end1]) for (let i = 1; i < face.length - 1; i++) M.tri(...face[0], ...face[i], ...face[i + 1]);
  STATS.ridges++;
  return true;
}

const linearBytes = hex => [1, 3, 5].map(i => {
  const s = parseInt(hex.slice(i, i + 2), 16) / 255;
  return Math.round(255 * (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4));
});
const GRASS = linearBytes('#a2cf86'), DUST = linearBytes('#b3b29a');
// Tint the existing grassy slope: no overlay, no extra triangles, seasonal shading still applies.
export function lawnEdge (M, a, b, c, d, top0, top1, low0, low1) {
  const front = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const back = Math.hypot(d[0] - c[0], d[1] - c[1]) || 1;
  M.grad((x, z, col, at) => {
    const q = [x, z], f = Math.abs(cross2(a, b, q)) / front, g = Math.abs(cross2(c, d, q)) / back;
    const t = f / Math.max(1e-6, f + g);
    const variation = 0.24 + 0.06 * Math.sin(x * 0.71 + z * 0.43);
    const dust = (1 - t) * variation;
    for (let i = 0; i < 3; i++) col[at + i] = Math.round(GRASS[i] + (DUST[i] - GRASS[i]) * dust);
  });
  try { M.quad(a[0], top0, a[1], b[0], top1, b[1], d[0], low1, d[1], c[0], low0, c[1]); }
  finally { M.grad(null); }
  STATS.lawnEdges++;
}
