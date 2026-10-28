/* Сюжетная парковка: короткий маршрут по улице от точки входа в область дома.
   Машина доезжает до одной пригодной точки, чтобы выход курьера не зависел от угла въезда. */
export const AREA = 38;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function safeSegment (a, b, api, onRoad = false) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
  if (api.blocked(a[0], a[1], b[0], b[1])) return false;
  const nx = -dz / (l || 1), nz = dx / (l || 1);
  for (let d = Math.min(3, l); d <= l; d += 1.5) {
    const t = l ? Math.min(1, d / l) : 0, x = a[0] + dx * t, z = a[1] + dz * t;
    if (!api.pathClear(x, z) || !api.pathClear(x + nx * 0.65, z + nz * 0.65) || !api.pathClear(x - nx * 0.65, z - nz * 0.65)) return false;
    if (onRoad) {
      const road = api.road(x, z);
      if (!road || road.d > (road.seg?.w || 4) / 2 + 1.5) return false;
    }
  }
  return true;
}

function spots (api, door, fixed) {
  if (fixed) return api.clear(fixed.x, fixed.z) ? [[fixed.x, fixed.z]] : [];
  const road = api.road(door.x + door.nx * 6, door.z + door.nz * 6) || api.road(door.x, door.z);
  const roadNear = road && road.d < 15;
  const candidates = [];
  const tx = door.nz, tz = -door.nx;
  for (const depth of [7, 9, 11]) for (const side of [0, -4, 4, -8, 8])
    candidates.push([door.x + door.nx * depth + tx * side, door.z + door.nz * depth + tz * side]);
  if (roadNear) {
    const seg = road.seg, dx = seg.x2 - seg.x1, dz = seg.z2 - seg.z1, l = Math.hypot(dx, dz) || 1;
    for (const off of [0, -4, 4]) {
      const t = clamp(road.t + off / l, 0.04, 0.96);
      candidates.push([seg.x1 + dx * t, seg.z1 + dz * t]);
    }
  }
  return candidates.filter(to => api.clear(to[0], to[1]));
}

export function spot (api, door) {
  const to = spots(api, door)[0];
  return to ? { x: to[0], z: to[1], h: Math.atan2(door.x - to[0], door.z - to[1]) } : null;
}

export function plan (api, from, door, fixed) {
  let best = null;
  const candidates = spots(api, door, fixed);
  for (const useRoad of [false, true]) {
    for (const to of candidates) {
      const route = useRoad ? api.route(from[0], from[1], to[0], to[1]) : null;
      const raw = useRoad ? [from, ...(route || []), to] : [from, to];
      const pts = raw.filter((p, i) => !i || dist(p, raw[i - 1]) > 0.25);
      if (pts.length < 2 || pts.some((p, i) => i && !safeSegment(pts[i - 1], p, api, !!fixed))) continue;
      const length = pts.reduce((n, p, i) => n + (i ? dist(pts[i - 1], p) : 0), 0);
      const score = length + dist(to, [door.x, door.z]) * 0.5;
      if (!best || score < best.score) best = { pts, length, score, to, endHeading: fixed?.h };
    }
    if (best) break;
    if (!useRoad) {
      const road = api.road(door.x + door.nx * 6, door.z + door.nz * 6);
      if (!road || road.d > 20) break;
    }
  }
  if (!best) return null;
  // В завершении смотрит вдоль последнего участка дороги, а не в стену дома.
  best.duration = clamp(best.length / 13, 0.9, 5.5);
  return best;
}

// Если игрок въехал сбоку дома, берём безопасный стандартный старт перед фасадом.
// Переход к нему происходит только при полностью закрытом кадре.
export function canonical (api, door, fixed) {
  if (fixed?.approach) return plan(api, [fixed.approach.x, fixed.approach.z], door, fixed);
  const tx = door.nz, tz = -door.nx;
  for (const depth of [25, 30, 20]) for (const side of [0, -8, 8, -15, 15]) {
    const x = door.x + door.nx * depth + tx * side, z = door.z + door.nz * depth + tz * side;
    if (!api.clear(x, z)) continue;
    const p = plan(api, [x, z], door, fixed);
    if (p && p.length >= 10) return p;
  }
  return null;
}

export function sample (p, seconds, initialHeading) {
  const k = clamp(seconds / p.duration, 0, 1), travel = (k * k * (3 - 2 * k)) * p.length;
  let remain = travel;
  for (let i = 1; i < p.pts.length; i++) {
    const a = p.pts[i - 1], b = p.pts[i], length = dist(a, b);
    if (remain > length && i < p.pts.length - 1) { remain -= length; continue; }
    const q = clamp(remain / (length || 1), 0, 1);
    const targetHeading = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const delta = Math.atan2(Math.sin(targetHeading - initialHeading), Math.cos(targetHeading - initialHeading));
    const turn = k * k * (3 - 2 * k);
    let h = initialHeading + delta * turn;
    if (Number.isFinite(p.endHeading)) {
      const tail = clamp((k - 0.7) / 0.3, 0, 1), dh = Math.atan2(Math.sin(p.endHeading - h), Math.cos(p.endHeading - h));
      h += dh * (tail * tail * (3 - 2 * tail));
    }
    return { x: a[0] + (b[0] - a[0]) * q, z: a[1] + (b[1] - a[1]) * q, h };
  }
  const last = p.pts[p.pts.length - 1];
  return { x: last[0], z: last[1], h: initialHeading };
}
