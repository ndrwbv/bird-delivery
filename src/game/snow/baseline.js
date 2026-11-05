/* A stationary rest surface shared by both render grids. Subdividing a
   triangle must not grow a fresh snowbank when the car approaches it.
   The fine CPU contact field remains independent of this visual sampling. */
export function createSnowBaseline(surfaces) {
  const STEP = 0.5, SIDE = 16, LIMIT = 256;
  const cache = new Map(), source = {}, neighbour = {};
  let lastKey, lastTile;
  const points = Array.from({ length: 4 }, () => ({ base: 0, depth: 0, nx: 0, nz: 0, edge: 1, valid: false }));
  const offsets = [[-STEP, 0], [STEP, 0], [0, -STEP], [0, STEP]];
  function node(id, ix, iz, out) {
    const tx = Math.floor(ix / SIDE), tz = Math.floor(iz / SIDE), key = `${id}:${tx}:${tz}`;
    let tile = key === lastKey ? lastTile : cache.get(key);
    if (!tile) {
      if (cache.size >= LIMIT) cache.delete(cache.keys().next().value);
      tile = { flags: new Uint8Array(SIDE * SIDE), values: new Float32Array(SIDE * SIDE * 5) };
      cache.set(key, tile);
    } else if (key !== lastKey) {
      cache.delete(key); cache.set(key, tile);
    }
    lastKey = key; lastTile = tile;
    const k = (iz - tz * SIDE) * SIDE + ix - tx * SIDE;
    if (!tile.flags[k]) {
      const x = ix * STEP, z = iz * STEP;
      surfaces.initial(id, x, z, source);
      let depth = source.deformable ? source.thickness : 0, sum = 4*depth, weight = 4, nx = 0, nz = 0, lip = false;
      // Smooth only compatible receivers. A positive symmetric kernel cannot
      // overshoot into a sharp peak or mix a bridge with the ground below it.
      if (source.valid) for (const [dx, dz] of offsets) {
        surfaces.initial(id, x + dx, z + dz, neighbour);
        const sameMaterial = source.materialId === neighbour.materialId;
        const same = neighbour.valid && Math.abs(source.baseY - neighbour.baseY) <= (sameMaterial ? 0.22 : 0.075);
        if (!same) { lip = true; continue; }
        const neighbourDepth = neighbour.deformable ? neighbour.thickness : 0;
        sum += neighbourDepth; weight++;
        const h = neighbour.baseY + neighbourDepth;
        nx -= dx * h / (2*STEP*STEP); nz -= dz * h / (2*STEP*STEP);
      }
      depth = source.deformable ? sum / weight : 0;
      // A discontinuous receiver has its own normal; it is not a slope.
      if (lip) nx = nz = 0;
      tile.flags[k] = source.valid ? 3 : 1;
      tile.values[k * 5] = source.baseY;
      tile.values[k * 5 + 1] = depth;
      tile.values[k * 5 + 2] = nx; tile.values[k * 5 + 3] = nz;
      tile.values[k * 5 + 4] = lip ? 0.18 : 1;
    }
    out.valid = tile.flags[k] === 3;
    out.base = tile.values[k * 5]; out.depth = tile.values[k * 5 + 1];
    out.nx = tile.values[k * 5 + 2]; out.nz = tile.values[k * 5 + 3];
    out.edge = tile.values[k * 5 + 4];
    return out;
  }
  return {
    height(id, x, z, season, fallback, normal) {
      if (normal) { normal.x=0; normal.z=0; normal.depth=NaN; normal.edge=1; }
      const gx = x / STEP, gz = z / STEP, ix = Math.floor(gx), iz = Math.floor(gz);
      const u = gx - ix, v = gz - iz;
      node(id, ix, iz, points[0]);
      // The coarse grid's vertices must use exactly these same samples,
      // including a vertex beside a cliff whose adjacent quad is absent.
      if (u === 0 && v === 0) {
        if (normal) {
          normal.x=points[0].nx; normal.z=points[0].nz;
          if (points[0].valid) { normal.depth=points[0].depth*season; normal.edge=points[0].edge; }
        }
        return points[0].valid ? points[0].base + points[0].depth * season : fallback;
      }
      node(id, ix + 1, iz, points[1]); node(id, ix, iz + 1, points[2]); node(id, ix + 1, iz + 1, points[3]);
      const [a, b, c, d] = points;
      if (normal) normal.edge = u+v<=1 ? a.edge*(1-u-v)+b.edge*u+c.edge*v : b.edge*(1-v)+c.edge*(1-u)+d.edge*(u+v-1);
      if (!a.valid || !b.valid || !c.valid || !d.valid
        || Math.max(a.base,b.base,c.base,d.base) - Math.min(a.base,b.base,c.base,d.base) > 0.22) return fallback;
      const ha=a.base+a.depth*season, hb=b.base+b.depth*season, hc=c.base+c.depth*season, hd=d.base+d.depth*season;
      if (normal) {
        normal.x = u+v<=1 ? a.nx*(1-u-v)+b.nx*u+c.nx*v : b.nx*(1-v)+c.nx*(1-u)+d.nx*(u+v-1);
        normal.z = u+v<=1 ? a.nz*(1-u-v)+b.nz*u+c.nz*v : b.nz*(1-v)+c.nz*(1-u)+d.nz*(u+v-1);
        normal.depth = season * (u+v<=1 ? a.depth*(1-u-v)+b.depth*u+c.depth*v : b.depth*(1-v)+c.depth*(1-u)+d.depth*(u+v-1));
      }
      // Matches render.js indices (a,c,b), (b,c,d), not bilinear quads.
      return u + v <= 1 ? ha*(1-u-v) + hb*u + hc*v : hb*(1-v) + hc*(1-u) + hd*(u+v-1);
    },
    clear() { cache.clear(); lastKey = lastTile = undefined; },
    get bytes() { return cache.size * SIDE * SIDE * 21; },
  };
}
