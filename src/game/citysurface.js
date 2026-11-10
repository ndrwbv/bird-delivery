// The builders still lay out the city in their original order. This index
// owns the resulting visual batches until the terrain queue publishes them.
export function createCitySurface (terrain) {
  const size = terrain.g * 16, { x0, z0 } = terrain;
  const nx = Math.ceil((terrain.nx - 1) / 16), nz = Math.ceil((terrain.nz - 1) / 16);
  const x1 = x0 + (terrain.nx - 1) * terrain.g, z1 = z0 + (terrain.nz - 1) * terrain.g;
  const cells = new Map(), staged = new WeakMap();
  const stats = { waiting: 0, published: 0 };

  function defer (bounds, build, onPublish) {
    const [left, top, right, bottom] = bounds;
    if (left < x0 || top < z0 || right > x1 || bottom > z1) return false;
    const entry = { build, onPublish, tiles: [] };
    const lastX = Math.min(nx - 1, Math.floor((right - x0) / size));
    const lastZ = Math.min(nz - 1, Math.floor((bottom - z0) / size));
    for (let j = Math.min(lastZ, Math.floor((top - z0) / size)); j <= lastZ; j++) {
      for (let i = Math.min(lastX, Math.floor((left - x0) / size)); i <= lastX; i++) {
        const id = j * nx + i;
        let cell = cells.get(id);
        if (!cell) cells.set(id, cell = new Set());
        cell.add(entry);
        entry.tiles.push(id);
      }
    }
    stats.waiting++;
    return true;
  }

  function* append (id, group) {
    const cell = cells.get(id);
    if (!cell) return;
    const entries = [];
    staged.set(group, entries);
    for (const entry of cell) {
      const work = entry.build();
      const result = work?.next ? yield* work : work;
      const meshes = result.isGroup ? result.children.slice() : [result];
      for (const mesh of meshes) group.add(mesh);
      entries.push([entry, meshes]);
      yield 'город: геометрия';
    }
  }

  function publish (group) {
    const entries = staged.get(group);
    if (!entries) return;
    for (const [entry, meshes] of entries) {
      for (const mesh of meshes) entry.onPublish?.(mesh);
      for (const id of entry.tiles) {
        const cell = cells.get(id);
        cell.delete(entry);
        if (!cell.size) cells.delete(id);
      }
      stats.waiting--;
      stats.published++;
    }
    staged.delete(group);
  }

  return { defer, append, publish, stats };
}
