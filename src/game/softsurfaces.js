/* Shared outlines for paving and its curb. Geometry only; roads' centre lines stay intact. */
import { STYLE, corners, inside } from './softcity.js';
export const ST = { lots: 0, greens: 0, caps: 0, pockets: 0, seams: 0 };
const signedArea = p => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - a[1] * b[0]; }, 0);
export function outline (p, radius = 0.65, blocked = null) {
  if (!STYLE.geometry || p.soft || p.length < 3) return p;
  const c = corners(p, signedArea(p) > 0, blocked, radius, false);
  if (!c?.some(Boolean)) return p;
  const out = p.flatMap((v, i) => c[i]?.arc || [v]);
  for (let i = 0; i < out.length; i++) {
    const a = out[i], b = out[(i + 1) % out.length];
    if (!inside(p, a) || !inside(p, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])) return p;
  }
  out.soft = true; out.original = p;
  return out;
}
export function contains (p, x, z, margin = 0) {
  if (inside(p, [x, z])) return true;
  if (margin <= 0) return false;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    if (Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) <= margin) return true;
  }
  return false;
}
const key = p => p[0] + ',' + p[1];
export function prepare (city, isArc) {
  if (!STYLE.geometry) return;
  // Keep layout polygons intact: centres, props, terrain and navigation use their original vertices.
  for (const lot of city.lots) if (lot.k === 'park') { const p = outline(lot.p); if (p !== lot.p) ST.lots++; lot.softP = p; }
  for (const g of city.green) if (['play', 'pitch', 'green', 'grass', 'park'].includes(g.k)) { const p = outline(g.p); if (p !== g.p) ST.greens++; g.softP = p; }
  const deg = new Map();
  for (const r of city.roads) for (let i = 0; i < r.p.length; i++) deg.set(key(r.p[i]), (deg.get(key(r.p[i])) || 0) + (i === 0 || i === r.p.length - 1 ? 1 : 2));
  for (const r of city.roads) if (r.c === 7 && !r.b && r.p.length >= 2) {
    r.softEnds = [[r.p[0], r.p[1]], [r.p.at(-1), r.p.at(-2)]].map(([e, f]) => deg.get(key(e)) === 1 && Math.hypot(e[0] - f[0], e[1] - f[1]) >= 4.5 && !isArc(f[0], f[1]));
    ST.caps += r.softEnds.filter(Boolean).length;
  }
}
export const CAP = 0.65;
export function endOutline (e, f, hw, depth = CAP * 3) {
  const l = Math.hypot(e[0] - f[0], e[1] - f[1]), ux = (e[0] - f[0]) / l, uz = (e[1] - f[1]) / l, vx = -uz, vz = ux;
  const at = (t, o) => [e[0] + ux * t + vx * o, e[1] + uz * t + vz * o];
  // Short legs must be eligible for rounding, unlike building walls.
  return outline([at(-depth, -hw), at(0, -hw), at(0, hw), at(-depth, hw)], CAP, new Set([0, 3]));
}
export function endRibbon (M, a, b, hw, y, first, last) {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (l < 3 || (!first && !last)) return false;
  const nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l;
  const p = [[a[0] + nx * hw, a[1] + nz * hw], [b[0] + nx * hw, b[1] + nz * hw], [b[0] - nx * hw, b[1] - nz * hw], [a[0] - nx * hw, a[1] - nz * hw]];
  const blocked = new Set(); if (!first) { blocked.add(0); blocked.add(3); } if (!last) { blocked.add(1); blocked.add(2); }
  M.poly(outline(p, CAP, blocked), y);
  return true;
}

const rgbCache = new Map();
const rgb = hex => {
  if (rgbCache.has(hex)) return rgbCache.get(hex);
  const c = [1, 3, 5].map(i => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return Math.round(255 * (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); });
  rgbCache.set(hex, c); return c;
};
// Replace the road ribbon with three adjacent bands in the existing mesher, without coplanar overlays.
export function roadSeam (M, a, b, ma, mb, hw, y, hex, paving, baseGrad) {
  if (!STYLE.geometry || hw < 1) return false;
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 0.3) return false;
  const ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l, na = ma || [-uz, ux], nb = mb || [-uz, ux];
  const base = rgb(hex), target = rgb(paving), width = 0.12;
  const plain = baseGrad || ((x, z, col, i) => { col[i] = base[0]; col[i + 1] = base[1]; col[i + 2] = base[2]; });
  const at = (t, o) => [a[0] + (b[0] - a[0]) * t + (na[0] + (nb[0] - na[0]) * t) * o, a[1] + (b[1] - a[1]) * t + (na[1] + (nb[1] - na[1]) * t) * o];
  const band = (lo, hi, s, t) => { const p = at(s, lo), q = at(t, lo), r = at(t, hi), v = at(s, hi); M.dtri(...p, ...q, ...r, y); M.dtri(...p, ...r, ...v, y); };
  M.grad(baseGrad); band(-hw + width, hw - width, 0, 1);
  for (const side of [-1, 1]) {
    const p = at(0, hw * side), q = at(1, hw * side), ex = q[0] - p[0], ez = q[1] - p[1], el = Math.hypot(ex, ez) || 1;
    M.grad((x, z, col, i) => {
      plain(x, z, col, i);
      const edge = Math.max(0, 1 - Math.abs(ex * (z - p[1]) - ez * (x - p[0])) / (el * width));
      const along = (x - a[0]) * ux + (z - a[1]) * uz;
      const fadeA = ma ? 1 : Math.max(0, Math.min(1, (along - hw) / 0.5));
      const fadeB = mb ? 1 : Math.max(0, Math.min(1, (l - along - hw) / 0.5));
      const k = edge * 0.18 * fadeA * fadeB;
      for (let j = 0; j < 3; j++) col[i + j] = Math.round(col[i + j] + (target[j] - col[i + j]) * k);
    });
    const cuts = [0, 1]; for (const d of [hw + 0.5, l - hw - 0.5]) if (d > 0 && d < l) cuts.push(d / l); cuts.sort((a, b) => a - b);
    for (let i = 1; i < cuts.length; i++) band(side < 0 ? -hw : hw - width, side < 0 ? -hw + width : hw, cuts[i - 1], cuts[i]);
  }
  M.grad(baseGrad); ST.seams++; return true;
}
