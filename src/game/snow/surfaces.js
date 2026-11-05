/* Bare receivers are independent from snow. A bridge/roof never shares its
   deformation with the ground below it. All heights here are world metres. */
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const smooth = n => { n = clamp(n); return n * n * (3 - 2 * n); };
const hash = (x, z) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
function noise(x, z, scale) {
  x /= scale; z /= scale;
  const i = Math.floor(x), j = Math.floor(z), u = smooth(x - i), v = smooth(z - j);
  return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v)
    + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v;
}

export function createSnowSurfaces(A) {
  const bridges = new Map(), bridgeIds = new Map(), roofs = new Map(), roofIds = new WeakMap();
  const bridgeGrid = new Map(), roofGrid = new Map(), shelterGrid = new Map();
  let nextBridge = 1, nextRoof = 10000, roofCount = 0, shelterCount = 0;
  const road = {}, chosen = {}, layerList = [];
  const gridKey = (x, z) => `${Math.floor(x / 32)},${Math.floor(z / 32)}`;
  function insert(grid, item, x0, z0, x1, z1) {
    for (let x = Math.floor(x0 / 32); x <= Math.floor(x1 / 32); x++)
      for (let z = Math.floor(z0 / 32); z <= Math.floor(z1 / 32); z++) {
        const k = `${x},${z}`, list = grid.get(k);
        if (list) list.push(item); else grid.set(k, [item]);
      }
  }
  for (const b of A.bridges) {
    let id = bridgeIds.get(b.road);
    if (!id) { id = nextBridge++; bridgeIds.set(b.road, id); bridges.set(id, []); }
    bridges.get(id).push(b);
    insert(bridgeGrid, { b, id }, b.bx0, b.bz0, b.bx1, b.bz1);
  }
  function refreshRoofs() {
    const list = A.roofs.LIST;
    for (; roofCount < list.length; roofCount++) {
      const r = list[roofCount], id = nextRoof++;
      roofIds.set(r, id); roofs.set(id, r);
      insert(roofGrid, { r, id }, r.x0, r.z0, r.x1, r.z1);
    }
    const shelters = A.canopies || [];
    for (; shelterCount < shelters.length; shelterCount++) {
      const p = shelters[shelterCount];
      insert(shelterGrid, p, p.x-2.5, p.z-2.5, p.x+2.5, p.z+2.5);
    }
  }
  function bridgeHeight(b, x, z) {
    const dx = b.x2 - b.x1, dz = b.z2 - b.z1;
    const t = ((x - b.x1) * dx + (z - b.z1) * dz) / (dx * dx + dz * dz || 1);
    if (t < 0 || t > 1 || Math.hypot(x - b.x1 - dx * t, z - b.z1 - dz * t) > b.ws / 2) return NaN;
    return A.deckAt(b, t, x, z);
  }
  function base(surfaceId, x, z, out) {
    out.valid = true; out.surfaceId = surfaceId; out.materialId = 0; out.exposure = 1;
    let y;
    if (surfaceId >= 10000) {
      const r = roofs.get(surfaceId);
      y = r ? A.roofs.heightOf(r, x, z) : NaN;
      out.materialId = 4;
    } else if (surfaceId > 0) {
      y = NaN;
      for (const b of bridges.get(surfaceId) || []) {
        const h = bridgeHeight(b, x, z);
        if (Number.isFinite(h)) { y = h; break; }
      }
      out.materialId = 1;
    } else {
      y = A.groundH(x, z);
      if (!A.inBounds(x, z) || A.inHouse(x, z)) out.valid = false;
      const water = A.waterAt(x, z);
      if (y < 0 || water) {
        const ice = A.iceY(x, z);
        if (ice == null) out.valid = false;
        else { y = ice; out.materialId = 3; }
      }
    }
    if (!Number.isFinite(y)) out.valid = false;
    out.baseY = Number.isFinite(y) ? y : 0;
    return out;
  }
  function resolve(x, z, previousY, previousSurfaceId, out = {}) {
    refreshRoofs();
    let id = 0, y = A.groundH(x, z), best = y;
    const ice = A.iceY(x, z);
    if (ice != null && ice > best) best = ice;
    for (const item of bridgeGrid.get(gridKey(x, z)) || []) {
      const h = bridgeHeight(item.b, x, z);
      if (!Number.isFinite(h)) continue;
      if ((previousSurfaceId === item.id || previousY === undefined || Math.abs(h - previousY) < 2.5 || h - y < 1.8) && h >= best) {
        best = h; id = item.id;
      }
    }
    for (const item of roofGrid.get(gridKey(x, z)) || []) {
      const h = A.roofs.heightOf(item.r, x, z);
      if (Number.isFinite(h) && (previousY === undefined || previousY >= h - A.roofs.ROOF.STEP) && h > best) {
        best = h; id = item.id;
      }
    }
    base(id, x, z, out);
    return out;
  }
  function rawInitial(surfaceId, x, z, out = {}) {
    base(surfaceId, x, z, out);
    out.visualCoverage = 1; out.thickness = 0; out.compaction = 0; out.wetness = 0; out.ice = 0;
    out.dirt = 0; out.sand = 0; out.rut = 0; out.heading = 0;
    out.normalX = 0; out.normalY = 1; out.normalZ = 0;
    if (!out.valid) { out.legacyY = out.legacyTopY = out.baseY; return out; }
    const originalY = out.baseY;
    if (surfaceId < 10000 && out.materialId !== 3) {
      A.roadSample(x, z, originalY, road);
      const raisedLand = surfaceId === 0 && A.isRaisedLand(x, z);
      const pavingY = surfaceId === 0 && !raisedLand ? A.pavedY(x, z) : NaN;
      if (road.onRoad && !raisedLand) {
        out.baseY = Number.isFinite(pavingY) ? pavingY : road.baseY;
        out.materialId = 1; out.thickness = road.thickness;
        out.visualCoverage = road.thickness > road.roadThickness + 0.01 ? 1 : road.coverage;
        out.compaction = road.compaction; out.dirt = road.dirt;
        out.sand = road.sand; out.rut = road.rut || 0; out.heading = road.heading || 0;
        out.legacyY = road.legacyY ?? (out.baseY + out.thickness);
      } else {
        const pave = A.pavedLift(x, z), curb = A.curbAt(x, z);
        if (surfaceId === 0 && !raisedLand && (Number.isFinite(pavingY) || pave >= 0 || curb > 0 || A.onPave(x, z))) {
          out.baseY = Number.isFinite(pavingY) ? pavingY : originalY + Math.max(0, pave, curb);
          out.materialId = 2; out.thickness = 0.08 + noise(x, z, 3) * 0.04; out.compaction = 0.65;
        } else {
          out.thickness = 0.3 + noise(x + 19, z - 7, 4) * 0.12 + noise(x, z, 1.2) * 0.025;
          // A low rounded lip beside the actual paved boundary, not white
          // triangles joining opposite sides of a curb.
          if (A.nearCurb(x, z)) out.thickness += 0.12;
        }
        out.legacyY = out.baseY;
      }
    } else {
      out.thickness = out.materialId === 3 ? 0.035 + noise(x, z, 3) * 0.04 : 0.08 + noise(x, z, 3) * 0.06;
      out.compaction = out.materialId === 3 ? 0.55 : 0.12;
      out.ice = out.materialId === 3 ? 0.35 : 0;
      out.legacyY = out.baseY;
    }
    // Snowfall has no direct access to receivers underneath another floor.
    if (surfaceId < 10000) {
      for (const p of shelterGrid.get(gridKey(x, z)) || []) {
        if (p.broken || p.it?.down) continue;
        const cs=Math.cos(p.ry||0),sn=Math.sin(p.ry||0),dx=x-p.x,dz=z-p.z;
        if(Math.abs(dx*cs-dz*sn)<2.2 && Math.abs(dx*sn+dz*cs)<1.1 && out.baseY<(p.y||0)+2.5) { out.exposure=0;break; }
      }
      for (const item of roofGrid.get(gridKey(x, z)) || []) {
        const h = A.roofs.heightOf(item.r, x, z);
        if (Number.isFinite(h) && h > out.baseY + 0.5) { out.exposure = 0; break; }
      }
      for (const item of bridgeGrid.get(gridKey(x, z)) || []) {
        if (item.id === surfaceId) continue;
        const h = bridgeHeight(item.b, x, z);
        if (Number.isFinite(h) && h > out.baseY + 0.8) { out.exposure = 0; break; }
      }
    }
    out.thickness *= out.exposure;
    if (surfaceId === 0 && out.exposure) {
      const top = Math.max(A.driftTop(x, z), A.lotSnowTop(x, z));
      if (Number.isFinite(top) && top > out.baseY + out.thickness) {
        out.thickness = Math.min(8, top - out.baseY);
        out.legacyY = top;
        out.compaction = 0.08;
      }
    }
    out.legacyTopY = Math.max(out.legacyY + 0.12, out.baseY + out.thickness + 0.15, out.baseY + 0.4);
    out.topY = out.baseY + out.thickness;
    return out;
  }
  function layersNear(x, z, y) {
    resolve(x, z, y, undefined, chosen);
    layerList.length = 0; layerList.push(chosen.surfaceId);
    if (chosen.surfaceId !== 0) layerList.push(0);
    return layerList;
  }
  // Rendering and physics ask the same vertex/cell centres repeatedly.
  // Cache exact vertices and cell centres in two 64² planes. Mixed parity
  // coordinates are rare and sampled directly: no 128² allocation of holes.
  const cache = new Map(), floats = ['baseY','thickness','legacyY','legacyTopY','heading'];
  const bytes = ['compaction','wetness','ice','dirt','sand','exposure','rut','visualCoverage'];
  let cacheClock = 0;
  let focusX = 0, focusZ = 0;
  const stats = { bridges: bridges.size, cacheBytes: 0, cacheTiles: 0, samples: 0, hits: 0 };
  function finish(out) {
    // A cleared traffic corridor and a walking path accept loose dust from
    // tyres, but must not grow a permanent obstacle across the route.
    out.maxThickness = out.materialId === 1 && out.thickness < 0.01 ? 0.025
      : out.materialId === 2 && out.thickness < 0.13 ? 0.15 : undefined;
    return out;
  }
  function initial(id,x,z,out={}) {
    if (Math.abs(x-focusX)>24 || Math.abs(z-focusZ)>24) return finish(rawInitial(id,x,z,out));
    const ix=Math.round(x*16),iz=Math.round(z*16);
    if(Math.abs(ix-x*16)>1e-5 || Math.abs(iz-z*16)>1e-5) return finish(rawInitial(id,x,z,out));
    if ((ix&1)!==(iz&1)) return finish(rawInitial(id,x,z,out));
    const tx=Math.floor(ix/128),tz=Math.floor(iz/128),k=id+':'+tx+':'+tz;
    let c=cache.get(k);
    if(!c) {
      if(cache.size>=32) {
        let oldest=null;
        for(const item of cache.values()) if(!oldest || item.at<oldest.at) oldest=item;
        cache.delete(oldest.key);
      }
      c={key:k,at:0,flags:new Uint8Array(8192),material:new Uint8Array(8192),f:new Float32Array(8192*5),b:new Uint8Array(8192*8)};
      cache.set(k,c);
      stats.cacheTiles=cache.size;stats.cacheBytes=cache.size*(8192*30);
    }
    c.at=++cacheClock;
    const n=Math.floor((iz-tz*128)/2)*64+Math.floor((ix-tx*128)/2)+(ix&1)*4096;
    if(!c.flags[n]) {
      rawInitial(id,x,z,out); stats.samples++;
      c.flags[n]=out.valid?3:1;c.material[n]=out.materialId;
      for(let j=0;j<5;j++) c.f[n*5+j]=out[floats[j]]||0;
      for(let j=0;j<8;j++) c.b[n*8+j]=Math.round(clamp(out[bytes[j]]||0)*255);
    } else {
      stats.hits++;out.valid=c.flags[n]===3;out.surfaceId=id;out.materialId=c.material[n];
      for(let j=0;j<5;j++) out[floats[j]]=c.f[n*5+j];
      for(let j=0;j<8;j++) out[bytes[j]]=c.b[n*8+j]/255;
      out.normalX=0;out.normalY=1;out.normalZ=0;out.topY=out.baseY+out.thickness;
    }
    return finish(out);
  }
  return { initial, resolve, base, layersNear, refresh: refreshRoofs, stats,
    setFocus(x,z) { focusX=x;focusZ=z; },
    invalidate() { cache.clear();stats.cacheBytes=stats.cacheTiles=0; },
    sampleBase: (x, z, context, out) => resolve(x, z, context?.previousY, context?.previousSurfaceId, out) };
}
