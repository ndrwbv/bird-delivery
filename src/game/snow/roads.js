/* Уборка следует связной улице. Разные уровни связываются только общим
   концом дороги, а не пересечением линий в XZ. Без зависимости от three.js. */
const hash = s => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};
const pointKey = p => Math.round(p[0] * 100) + ':' + Math.round(p[1] * 100);
const identity = road => {
  let min = '';
  for (const p of road.p) { const k = pointKey(p); if (!min || k < min) min = k; }
  return road.c + ':' + (road.n || '') + ':' + min;
};

export function corridorModes (roads, roadWidth) {
  const entries = [], nodes = new Map(), result = new Map();
  for (const road of roads) {
    if (road.x || road.c === 6 || road.c > 7 || roadWidth(road) < 3 || road.p.length < 2) continue;
    const e = { road, parent: null, id: identity(road), w: roadWidth(road) };
    e.parent = e; entries.push(e);
    // Все вершины нужны для улицы, которая заканчивается в середине другой.
    for (let i = 0; i < road.p.length; i++) {
      const p = road.p[i], key = pointKey(p);
      let list = nodes.get(key); if (!list) nodes.set(key, list = []);
      for (const j of [i - 1, i + 1]) {
        if (j < 0 || j >= road.p.length) continue;
        const dx = road.p[j][0] - p[0], dz = road.p[j][1] - p[1], len = Math.hypot(dx, dz);
        if (len > 0.01) list.push({ e, ux: dx / len, uz: dz / len, end: i === 0 || i === road.p.length - 1 });
      }
    }
  }
  const root = e => { while (e.parent !== e) { e.parent = e.parent.parent; e = e.parent; } return e; };
  for (const list of nodes.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (a.e === b.e || a.e.road.c !== b.e.road.c || Math.max(a.e.w, b.e.w) > Math.min(a.e.w, b.e.w) * 1.6) continue;
    if (!!a.e.road.b !== !!b.e.road.b && (!a.end || !b.end)) continue;
    // Продолжение должно смотреть в противоположные стороны от узла.
    const cosine = a.ux * b.ux + a.uz * b.uz;
    const named = a.e.road.n && a.e.road.n === b.e.road.n;
    if (cosine > (named ? -0.65 : -0.94)) continue;
    const ra = root(a.e), rb = root(b.e);
    if (ra !== rb) { if (ra.id < rb.id) rb.parent = ra; else ra.parent = rb; }
  }
  const byRoot = new Map();
  for (const e of entries) {
    const r = root(e);
    let mode = byRoot.get(r);
    if (!mode) {
      const c = r.road.c, roll = hash(r.id + ':service');
      const sandShare = c <= 3 ? 0.16 : c === 7 ? 0.05 : 0.12;
      const clearShare = c <= 3 ? 0.55 : c === 4 ? 0.38 : c === 5 ? 0.2 : 0.08;
      const sand = roll < sandShare, clear = !sand && roll < sandShare + clearShare;
      mode = { sand, clear, corridor: r.id };
      byRoot.set(r, mode);
    }
    result.set(e.road, mode);
  }
  return result;
}
