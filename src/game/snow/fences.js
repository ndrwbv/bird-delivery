/* A ground receiver tapers around the actual panel, including thin mesh
   fences that can lie wholly between samples of the snow mesh. */
const CELL = 8, REACH = 0.95, CORE = 0.38;
const EMPTY = [];
const key = (x, z) => x + z * 100003;

export function createSnowFences() {
  const grid = new Map();
  function build(items) {
    grid.clear();
    for (const it of items) {
      if (it.down || (it.kind !== 'fence' && it.kind !== 'bigfence')) continue;
      const half = Number.isFinite(it.fvr) ? it.snowHalf ?? it.r : 0;
      const ux = Math.cos(it.fvr || 0), uz = -Math.sin(it.fvr || 0);
      const radius = half ? 0.09 : it.r;
      const rx = Math.abs(ux) * half + radius + REACH, rz = Math.abs(uz) * half + radius + REACH;
      const panel = { x: it.x, z: it.z, half, ux, uz, radius };
      for (let j = Math.floor((it.z - rz) / CELL); j <= Math.floor((it.z + rz) / CELL); j++)
        for (let i = Math.floor((it.x - rx) / CELL); i <= Math.floor((it.x + rx) / CELL); i++) {
          const k = key(i, j), list = grid.get(k);
          if (list) list.push(panel); else grid.set(k, [panel]);
        }
    }
  }
  function panelDistance(p, x, z) {
    const dx = x - p.x, dz = z - p.z;
    const along = Math.max(-p.half, Math.min(p.half, dx * p.ux + dz * p.uz));
    return Math.hypot(dx - along * p.ux, dz - along * p.uz) - p.radius;
  }
  function distance(x, z) {
    let closest = Infinity;
    for (const p of grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || EMPTY) {
      closest = Math.min(closest, panelDistance(p, x, z));
    }
    return closest;
  }
  function fits(x, z, radius) {
    for (let j = Math.floor((z - radius) / CELL); j <= Math.floor((z + radius) / CELL); j++)
      for (let i = Math.floor((x - radius) / CELL); i <= Math.floor((x + radius) / CELL); i++)
        for (const p of grid.get(key(i, j)) || EMPTY) if (panelDistance(p, x, z) < radius) return false;
    return true;
  }
  function cover(x, z) {
    const t = Math.max(0, Math.min(1, (distance(x, z) - CORE) / (REACH - CORE)));
    return t * t * (3 - 2 * t);
  }
  return { build, distance, cover, fits };
}
