/* Sparse, cell-centred snow state. Untouched cells are evaluated from the
   deterministic city surface; contact stores only the affected tiles.
   All transfers are accumulated before being applied, including across tiles. */
import { SNOW, clamp01, density, compactionOf, seasonFactor } from './config.js';

const N = SNOW.CELLS, COUNT = N * N, DX = SNOW.CELL, AREA = DX * DX;
const AN = SNOW.ARCHIVE_CELLS, AS = N / AN, ACOUNT = AN * AN;
const Q = 65535, B = 255;
const tileCode = (x, z) => (x + 32768) + (z + 32768) * 65536;
const blank = () => ({ valid: false, baseY: 0, thickness: 0, compaction: 0, wetness: 0, ice: 0, dirt: 0, sand: 0, exposure: 1, materialId: 0 });

export function createSnowField ({ initial }) {
  if (typeof initial !== 'function') throw new TypeError('Snow field requires an initial surface sampler');
  const surfaces = new Map(), live = new Set(), archived = new Set();
  const base = blank(), centre = blank(), neighbour = blank(), pristine = blank();
  const weatherSample = { mass: 0, compaction: 0, added: 0, removed: 0 };
  const lookup = { tile: null, index: 0, x: 0, z: 0 };
  const workTiles = [], receivers = Array.from({ length: 6 }, () => ({ tile: null, index: 0, weight: 0, capacity: 0 }));
  const settleQueue = Array.from({ length: 1024 }, () => ({ id: null, gx: 0, gz: 0, passes: 0 }));
  let settleRead = 0, settleWrite = 0, settleCount = 0, settleClock = 0;
  const result = { changed: false, movedMass: 0, compressedMass: 0, pickedUp: 0, deposited: 0 };
  const splitResult = { changed: false, movedMass: 0, compressedMass: 0, pickedUp: 0, deposited: 0 };
  const splitFrom = { x: 0, z: 0 }, splitTo = { x: 0, z: 0 }, splitContact = {};
  let revision = 1, weatherRevision = 0, visualWeatherRevision = 0, stampId = 0, serial = 0, focusX = 0, focusZ = 0, protectTile = null;
  let visualFall = 0, visualMelt = 0;
  let time = 0, weatherClock = 0, fall = 0, melt = 0, season = 1, snowGone = false;
  const weather = { snowAmount: 1, snowfall: 0, thaw: 0, wetness: 0, wind: 0 };
  const stats = {
    fullTiles: 0, archivedTiles: 0, initializedCells: 0, bytes: 0, revision: 1,
    contacts: 0, changedContacts: 0, movedMass: 0, compressedMass: 0,
    pickedUp: 0, deposited: 0, precipitation: 0, melted: 0, settled: 0,
    evictions: 0, coarseRestores: 0, overflow: 0, cachePressure: 0, season: 1,
  };

  function initSample (id, x, z, out) {
    out.valid = false; out.baseY = 0; out.thickness = 0; out.compaction = 0;
    out.wetness = out.ice = out.dirt = out.sand = 0;
    out.exposure = 1; out.materialId = 0; out.maxThickness = undefined;
    initial(id, x, z, out);
    out.valid = !!out.valid && Number.isFinite(out.baseY) && Number.isFinite(out.thickness);
    out.thickness = Math.max(0, Math.min(SNOW.MAX_DEPTH, out.thickness || 0));
    out.compaction = clamp01(out.compaction);
    out.surfaceId = id;
    return out;
  }

  function surfaceMap (id, create = false) {
    let map = surfaces.get(id);
    if (!map && create) { map = new Map(); surfaces.set(id, map); }
    return map;
  }

  function tileAt (id, tx, tz) { return surfaceMap(id)?.get(tileCode(tx, tz)); }

  function cellCoords (index, tile, out) {
    out.x = tile.tx * SNOW.TILE + ((index % N) + 0.5) * DX;
    out.z = tile.tz * SNOW.TILE + (((index / N) | 0) + 0.5) * DX;
    return out;
  }

  function initialMass (out) {
    const original = out.thickness * density(out.compaction);
    // A cleaned receiver can accumulate a thin dusting, not an unlimited wall.
    const extra = Number.isFinite(out.maxThickness) ? Math.max(0, out.maxThickness - out.thickness) : out.thickness < 0.035 ? 0.025 : 0.12;
    const addition = Math.min(extra * SNOW.DENSITY_LOOSE, fall * clamp01(out.exposure));
    return Math.max(0, original + addition - melt * (0.5 + clamp01(out.exposure) * 0.5));
  }

  function weathered (mass, c, oldFall, oldMelt, source, out) {
    const limit = Number.isFinite(source.maxThickness) ? source.maxThickness :
      source.thickness + (source.thickness < 0.035 ? 0.025 : 0.12);
    const exposure = clamp01(source.exposure);
    const room = Math.max(0, limit - mass / density(c)) * SNOW.DENSITY_LOOSE;
    const add = Math.min(room, Math.max(0, fall - oldFall) * exposure);
    const removed = Math.min(mass + add, Math.max(0, melt - oldMelt) * (0.5 + exposure * 0.5));
    const volume = mass / density(c) + add / SNOW.DENSITY_LOOSE;
    out.mass = Math.max(0, mass + add - removed);
    out.compaction = compactionOf((mass + add) / Math.max(volume, 1e-8));
    out.added = add; out.removed = removed;
    return out;
  }

  function mark (tile, index) {
    const x = index % N, z = (index / N) | 0;
    tile.dirty.minX = Math.min(tile.dirty.minX, x); tile.dirty.maxX = Math.max(tile.dirty.maxX, x);
    tile.dirty.minZ = Math.min(tile.dirty.minZ, z); tile.dirty.maxZ = Math.max(tile.dirty.maxZ, z);
    for (let reader=0;reader<2;reader++) {
      const dirty = reader ? tile.renderDirty.middle : tile.renderDirty.near;
      dirty.minX = Math.min(dirty.minX, x); dirty.maxX = Math.max(dirty.maxX, x);
      dirty.minZ = Math.min(dirty.minZ, z); dirty.maxZ = Math.max(dirty.maxZ, z);
    }
    tile.revision = ++revision; tile.dirty.revision = tile.revision;
    // Only neighbouring render tiles that share this contact's edge need
    // resampling. A footprint in the middle cannot dirty eight whole tiles.
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dz) || dx < 0 && x > 1 || dx > 0 && x < N - 2
        || dz < 0 && z > 1 || dz > 0 && z < N - 2) continue;
      tile.edgeRevision[(dz + 1) * 3 + dx + 1] = tile.revision;
    }
    stats.revision = revision;
  }

  function memory () {
    let bytes = 0;
    for (const t of live) bytes += t.bytes + (t.archive?.bytes || 0);
    for (const t of archived) bytes += t.bytes;
    stats.bytes = bytes + 65536; stats.fullTiles = live.size; stats.archivedTiles = archived.size;
  }

  function makeTile (id, tx, tz, archive = null) {
    if (live.size >= SNOW.FULL_TILES) {
      const victim = chooseVictim(live, true);
      if (!victim) { stats.cachePressure++; return null; }
      archiveTile(victim);
      trim();
    }
    const tile = {
      surfaceId: id, tx, tz, mass: new Float32Array(COUNT), c: new Uint16Array(COUNT),
      w: new Uint8Array(COUNT), ice: new Uint8Array(COUNT), dirt: new Uint8Array(COUNT), sand: new Uint8Array(COUNT),
      exposure: new Uint8Array(COUNT), flags: new Uint8Array(COUNT), indices: new Uint16Array(COUNT), count: 0,
      deltaM: new Float32Array(COUNT), deltaV: new Float32Array(COUNT), changedIndices: new Uint16Array(COUNT),
      pending: new Uint32Array(COUNT), changedCount: 0, stamp: 0,
      revision: ++revision, last: ++serial, fall, melt, weatherRevision,
      edgeRevision: new Float64Array(9),
      renderWeather: { near: -1, middle: -1 },
      renderDirty: {
        near: { minX: N, minZ: N, maxX: -1, maxZ: -1 },
        middle: { minX: N, minZ: N, maxX: -1, maxZ: -1 },
      },
      archive, archived: false, dirty: { minX: N, minZ: N, maxX: -1, maxZ: -1, revision },
    };
    tile.bytes = tile.mass.byteLength + tile.c.byteLength + tile.w.byteLength * 6 + tile.indices.byteLength +
      tile.deltaM.byteLength * 2 + tile.changedIndices.byteLength + tile.pending.byteLength;
    if (archive) { archived.delete(archive); stats.coarseRestores++; }
    live.add(tile); surfaceMap(id, true).set(tileCode(tx, tz), tile);
    memory();
    return tile;
  }

  function isProtected (tile) {
    if (protectTile) return !!protectTile(tile.surfaceId, tile.tx, tile.tz);
    // The renderer binds exact ready near tiles. Before binding, preserve the
    // closest 5×5 footprint rather than trusting only the current stamp.
    return Math.abs(tile.tx - Math.floor(focusX / SNOW.TILE)) <= 2 &&
      Math.abs(tile.tz - Math.floor(focusZ / SNOW.TILE)) <= 2;
  }

  function chooseVictim (collection, detailed = false) {
    let victim = null, score = -Infinity;
    for (const tile of collection) {
      if (isProtected(tile) || detailed && tile.stamp === stampId && tile.changedCount) continue;
      const distance = Math.hypot(tile.tx * SNOW.TILE + 4 - focusX, tile.tz * SNOW.TILE + 4 - focusZ);
      const s = (distance > SNOW.PROTECT_RADIUS ? 1e12 : 0) + distance * 10000 + Math.min(1e7, serial - tile.last);
      if (s > score) { victim = tile; score = s; }
    }
    return victim;
  }

  function archiveTile (tile) {
    integrate(tile);
    const a = { surfaceId: tile.surfaceId, tx: tile.tx, tz: tile.tz, archived: true,
      mass: new Float32Array(ACOUNT), c: new Uint16Array(ACOUNT), w: new Uint8Array(ACOUNT),
      ice: new Uint8Array(ACOUNT), dirt: new Uint8Array(ACOUNT), sand: new Uint8Array(ACOUNT), flags: new Uint8Array(ACOUNT),
      last: tile.last, revision: tile.revision, edgeRevision: tile.edgeRevision.slice(), fall, melt, weatherRevision };
    a.bytes = a.mass.byteLength + a.c.byteLength + a.flags.byteLength * 5;
    for (let k = 0; k < tile.count; k++) {
      const i = tile.indices[k], ai = Math.floor(i % N / AS) + Math.floor(Math.floor(i / N) / AS) * AN;
      a.flags[ai] = 1;
    }
    if (tile.archive) for (let i = 0; i < ACOUNT; i++) if (tile.archive.flags[i]) a.flags[i] = 1;
    // Include pristine siblings: reducing resolution must preserve volume and mass.
    for (let ai = 0; ai < ACOUNT; ai++) {
      if (!a.flags[ai]) continue;
      let mass = 0, volume = 0, wet = 0, ice = 0, dirt = 0, sand = 0, valid = 0;
      const ax = (ai % AN) * AS, az = Math.floor(ai / AN) * AS;
      for (let z = 0; z < AS; z++) for (let x = 0; x < AS; x++) {
        const i = ax + x + (az + z) * N;
        cellState(tile.surfaceId, tile.tx * N + ax + x, tile.tz * N + az + z, centre);
        if (!centre.valid) continue;
        const m = centre.mass, c = centre.compaction;
        mass += m; volume += m / density(c); valid++;
        wet += m * (centre.wetness || 0); ice += m * (centre.ice || 0);
        dirt += m * (centre.dirt || 0); sand += m * (centre.sand || 0);
      }
      a.mass[ai] = valid ? mass / valid : 0;
      a.c[ai] = Math.round(compactionOf(mass / Math.max(1e-8, volume)) * Q);
      a.w[ai] = Math.round(wet / Math.max(1e-8, mass) * B);
      a.ice[ai] = Math.round(ice / Math.max(1e-8, mass) * B);
      a.dirt[ai] = Math.round(dirt / Math.max(1e-8, mass) * B);
      a.sand[ai] = Math.round(sand / Math.max(1e-8, mass) * B);
    }
    live.delete(tile); archived.add(a); surfaceMap(tile.surfaceId).set(tileCode(tile.tx, tile.tz), a);
    stats.initializedCells -= tile.count;
  }

  function trim () {
    if (live.size <= SNOW.FULL_TILES && archived.size <= SNOW.ARCHIVE_TILES) return;
    // Prefer distant cells. Never discard the whole history when a limit is reached.
    let victim = live.size > SNOW.FULL_TILES ? chooseVictim(live, true) : null;
    if (victim) archiveTile(victim);
    if (archived.size > SNOW.ARCHIVE_TILES) {
      victim = chooseVictim(archived);
      if (victim) { archived.delete(victim); surfaceMap(victim.surfaceId).delete(tileCode(victim.tx, victim.tz)); stats.evictions++; }
    }
    memory();
  }

  function integrate (tile) {
    if (tile.archived || tile.weatherRevision === weatherRevision) return;
    for (let k = 0; k < tile.count; k++) {
      const i = tile.indices[k], old = tile.mass[i], c = tile.c[i] / Q;
      cellCoords(i, tile, lookup); initSample(tile.surfaceId, lookup.x, lookup.z, centre);
      if (!centre.valid) continue;
      weathered(old, c, tile.fall, tile.melt, centre, weatherSample);
      const next = weatherSample.mass;
      if (Math.abs(next - old) > 1e-5 || Math.abs(weatherSample.compaction - c) > 1 / Q) {
        tile.c[i] = Math.round(weatherSample.compaction * Q);
        tile.mass[i] = next;
        tile.w[i] = Math.round(clamp01(Math.max(centre.wetness || 0, weather.wetness, weather.thaw * 0.7)) * B);
        mark(tile, i);
        stats.precipitation += weatherSample.added * AREA * season; stats.melted += weatherSample.removed * AREA * season;
      }
    }
    tile.fall = fall; tile.melt = melt; tile.weatherRevision = weatherRevision;
  }

  function cell (id, gx, gz, create, out) {
    const tx = Math.floor(gx / N), tz = Math.floor(gz / N);
    let tile = tileAt(id, tx, tz);
    const i = gx - tx * N + (gz - tz * N) * N;
    out.tile = null; out.index = i; out.x = (gx + 0.5) * DX; out.z = (gz + 0.5) * DX;
    if (!tile && !create) return out;
    if ((!tile || tile.archived) && create) tile = makeTile(id, tx, tz, tile || null);
    // Eviction may sample an archived tile through the shared lookup scratch.
    // Restore this lookup before exposing it to the caller.
    out.tile = null; out.index = i; out.x = (gx + 0.5) * DX; out.z = (gz + 0.5) * DX;
    if (!tile) return out;
    if (tile.archived) { out.tile = tile; out.index = Math.floor((gx - tx * N) / AS) + Math.floor((gz - tz * N) / AS) * AN; return out; }
    integrate(tile);
    out.x = (gx + 0.5) * DX; out.z = (gz + 0.5) * DX;
    if (!tile.flags[i] && create) {
      initSample(id, out.x, out.z, centre);
      if (!centre.valid) return out;
      const ai = Math.floor((gx - tx * N) / AS) + Math.floor((gz - tz * N) / AS) * AN;
      const a = tile.archive, saved = a?.flags[ai];
      if (saved) weathered(a.mass[ai], a.c[ai] / Q, a.fall, a.melt, centre, weatherSample);
      tile.mass[i] = saved ? weatherSample.mass : initialMass(centre);
      tile.c[i] = saved ? Math.round(weatherSample.compaction * Q) : Math.round(centre.compaction * Q);
      tile.w[i] = saved ? a.w[ai] : Math.round(clamp01(centre.wetness) * B);
      tile.ice[i] = saved ? a.ice[ai] : Math.round(clamp01(centre.ice) * B);
      tile.dirt[i] = saved ? a.dirt[ai] : Math.round(clamp01(centre.dirt) * B);
      tile.sand[i] = saved ? a.sand[ai] : Math.round(clamp01(centre.sand) * B);
      tile.exposure[i] = Math.round(clamp01(centre.exposure) * B);
      tile.flags[i] = 1; tile.indices[tile.count++] = i; stats.initializedCells++;
    }
    out.tile = tile;
    return out;
  }

  function cellState (id, gx, gz, out) {
    cell(id, gx, gz, false, lookup);
    const tile = lookup.tile, i = lookup.index;
    initSample(id, (gx + 0.5) * DX, (gz + 0.5) * DX, out);
    if (!out.valid) { out.mass = 0; return out; }
    out.pristineMass = initialMass(out);
    out.pristineVolume = out.pristineMass / density(out.compaction);
    out.pristineWet = out.wetness; out.pristineIce = out.ice;
    out.pristineDirt = out.dirt; out.pristineSand = out.sand;
    let stored = tile?.flags[i] ? tile : null, index = i;
    if (tile && !tile.archived && !stored && tile.archive) {
      const ai = Math.floor((gx - tile.tx * N) / AS) + Math.floor((gz - tile.tz * N) / AS) * AN;
      if (tile.archive.flags[ai]) { stored = tile.archive; index = ai; }
    }
    if (stored) {
      if (stored.archived) weathered(stored.mass[index], stored.c[index] / Q, stored.fall, stored.melt, out, weatherSample);
      out.mass = stored.archived ? weatherSample.mass : stored.mass[index];
      out.compaction = stored.archived ? weatherSample.compaction : stored.c[index] / Q; out.wetness = stored.w[index] / B;
      out.ice = stored.ice[index] / B; out.dirt = stored.dirt[index] / B; out.sand = stored.sand[index] / B;
    } else out.mass = initialMass(out);
    return out;
  }

  function sample (id, x, z, out = {}) {
    initSample(id, x, z, out);
    const c0 = out.compaction, h0 = out.thickness, mass0 = out.valid ? initialMass(out) : 0;
    const own = tileAt(id, Math.floor(x / SNOW.TILE), Math.floor(z / SNOW.TILE));
    let m = mass0, c = c0, w = clamp01(out.wetness), ice = clamp01(out.ice), dirt = clamp01(out.dirt), sand = clamp01(out.sand);
    // Only inspect neighbours of modified tiles. The common pristine path is one sample.
    const gx = x / DX - 0.5, gz = z / DX - 0.5, ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
    const has = own || tileAt(id, Math.floor(ix / N), Math.floor(iz / N)) || tileAt(id, Math.floor((ix + 1) / N), Math.floor(iz / N)) ||
      tileAt(id, Math.floor(ix / N), Math.floor((iz + 1) / N)) || tileAt(id, Math.floor((ix + 1) / N), Math.floor((iz + 1) / N));
    if (out.valid && has) {
      let total = 0, mass = 0, volume = 0, wet = 0, iced = 0, dirty = 0, sandy = 0;
      for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) {
        const weight = (dx ? fx : 1 - fx) * (dz ? fz : 1 - fz);
        if (weight < 1e-6) continue;
        cellState(id, ix + dx, iz + dz, neighbour);
        if (!neighbour.valid || Math.abs(neighbour.baseY - out.baseY) > SNOW.BARRIER_HEIGHT) continue;
        // Interpolate deformation, not the authored terrain profile. Allocating
        // a tile must not change any untouched snow around the first tyre mark.
        total += weight;
        mass += (neighbour.mass - neighbour.pristineMass) * weight;
        volume += (neighbour.mass / density(neighbour.compaction) - neighbour.pristineVolume) * weight;
        wet += (neighbour.wetness - neighbour.pristineWet) * weight;
        iced += (neighbour.ice - neighbour.pristineIce) * weight;
        dirty += (neighbour.dirt - neighbour.pristineDirt) * weight;
        sandy += (neighbour.sand - neighbour.pristineSand) * weight;
      }
      if (total > 0.01) {
        m = Math.max(0, mass0 + mass / total);
        c = compactionOf(m / Math.max(mass0 / density(c0) + volume / total, 1e-8));
        w = clamp01(w + wet / total); ice = clamp01(ice + iced / total);
        dirt = clamp01(dirt + dirty / total); sand = clamp01(sand + sandy / total);
      }
    }
    out.mass = out.valid ? m * season : 0;
    out.compaction = c; out.wetness = Math.max(w, weather.wetness * 0.6); out.ice = ice; out.dirt = dirt; out.sand = sand;
    out.thickness = out.mass / density(c); out.topY = out.baseY + out.thickness;
    out.looseDepth = out.thickness * (1 - c) * (1 - ice * 0.8);
    out.contactResistance = clamp01(out.looseDepth / 0.18);
    out.supportY = out.baseY + Math.min(out.thickness, out.mass / density(Math.max(c, SNOW.WHEEL_TARGET))) * (1 - Math.min(0.7, out.looseDepth));
    out.initialThickness = h0 * season; out.coverage = clamp01(out.thickness / 0.012);
    out.revision = (own?.revision || 0) + weatherRevision;
    return out;
  }

  function pending (tile, i) {
    if (tile.stamp !== stampId) { tile.stamp = stampId; tile.changedCount = 0; workTiles.push(tile); }
    if (tile.pending[i] !== stampId) {
      tile.pending[i] = stampId; tile.deltaM[i] = tile.deltaV[i] = 0;
      tile.changedIndices[tile.changedCount++] = i;
    }
  }

  function queueSettle (id, gx, gz, passes = 2) {
    if (settleCount >= settleQueue.length) return;
    const q = settleQueue[settleWrite]; q.id = id; q.gx = gx; q.gz = gz; q.passes = passes;
    settleWrite = (settleWrite + 1) % settleQueue.length; settleCount++;
  }

  function applyPending (settling = false) {
    for (const tile of workTiles) {
      for (let k = 0; k < tile.changedCount; k++) {
        const i = tile.changedIndices[k], old = tile.mass[i], c = tile.c[i] / Q;
        const next = Math.max(0, old + tile.deltaM[i]), volume = Math.max(1e-8, old / density(c) + tile.deltaV[i]);
        if (Math.abs(tile.deltaM[i]) > 1e-7) {
          tile.mass[i] = next; tile.c[i] = Math.round(compactionOf(next / volume) * Q);
          if (!settling) {
            result.changed = true;
            queueSettle(tile.surfaceId, tile.tx * N + i % N, tile.tz * N + Math.floor(i / N));
          }
        }
        if (Math.abs(tile.deltaM[i]) > 1e-7 || tile.flags[i] & 2) mark(tile, i);
        tile.flags[i] = 1;
      }
      tile.changedCount = 0;
    }
    // Scratch handles must not keep an evicted detailed tile alive behind the
    // cache's byte counters on a quiet frame after the transfer.
    for (const receiver of receivers) receiver.tile = null;
    lookup.tile = null;
  }

  function settle () {
    if (!settleCount || season <= 0.001) return;
    stampId++; workTiles.length = 0;
    const count = Math.min(64, settleCount);
    for (let k = 0; k < count; k++) {
      const q = settleQueue[settleRead], id = q.id, gx = q.gx, gz = q.gz, passes = q.passes;
      settleRead = (settleRead + 1) % settleQueue.length; settleCount--;
      cell(id, gx, gz, false, lookup);
      const tile = lookup.tile, index = lookup.index;
      if (!tile || tile.archived || !tile.flags[index]) continue;
      if (tile.pending[index] === stampId) continue;
      initSample(id, (gx + 0.5) * DX, (gz + 0.5) * DX, base);
      if (!base.valid) continue;
      const c = tile.c[index] / Q, ice = tile.ice[index] / B;
      if (c > 0.85 || ice > 0.7) continue;
      const mass = tile.mass[index], top = base.baseY + mass * season / density(c);
      pending(tile, index);
      const bed = base.materialId === 0 ? 0.06 : base.materialId === 2 ? 0.025 : 0;
      let remaining = Math.min(mass * 0.06, Math.max(0, mass - bed * density(c)));
      for (let direction = 0; direction < 4 && remaining > 1e-5; direction++) {
        const rx = gx + (direction === 0 ? -1 : direction === 1 ? 1 : 0);
        const rz = gz + (direction === 2 ? -1 : direction === 3 ? 1 : 0);
        cellState(id, rx, rz, neighbour);
        if (!neighbour.valid || Math.abs(neighbour.baseY - base.baseY) > SNOW.BARRIER_HEIGHT) continue;
        const drop = top - neighbour.baseY - neighbour.mass * season / density(neighbour.compaction) - DX * 0.7;
        if (drop <= 0) continue;
        let amount = Math.min(remaining, mass * 0.015, drop * density(c) / Math.max(season, 0.001) * 0.3 * (1 - c) * (1 - ice));
        if (amount < 1e-5) continue;
        const maxHeight = Number.isFinite(neighbour.maxThickness) ? neighbour.maxThickness : Math.min(SNOW.MAX_DEPTH, neighbour.thickness + SNOW.RIDGE_HEADROOM);
        cell(id, rx, rz, true, lookup);
        const rt = lookup.tile, ri = lookup.index;
        if (!rt || !rt.flags[ri]) continue;
        const receivingHeight = rt.mass[ri] / density(rt.c[ri] / Q) + (rt.pending[ri] === stampId ? rt.deltaV[ri] : 0);
        amount = Math.min(amount, Math.max(0, maxHeight - receivingHeight) * density(c));
        if (amount < 1e-5) continue;
        pending(tile, index); pending(rt, ri);
        tile.deltaM[index] -= amount; tile.deltaV[index] -= amount / density(c);
        rt.deltaM[ri] += amount; rt.deltaV[ri] += amount / density(c);
        remaining -= amount; stats.settled += amount * AREA * season;
      }
      if (passes > 1) queueSettle(id, gx, gz, passes - 1);
    }
    applyPending(true); trim();
  }

  function stampSegment (contact) {
    result.changed = false; result.movedMass = result.compressedMass = result.pickedUp = result.deposited = 0;
    if (!(season > 0.001) || contact.surfaceId === undefined || !contact.from || !contact.to) return result;
    const id = contact.surfaceId, x0 = contact.from.x, z0 = contact.from.z, x1 = contact.to.x, z1 = contact.to.z;
    if (!Number.isFinite(x0) || !Number.isFinite(z0) || !Number.isFinite(x1) || !Number.isFinite(z1)) return result;
    const vx = x1 - x0, vz = z1 - z0, distance = Math.hypot(vx, vz);
    if (distance > SNOW.MAX_CONTACT_DISTANCE) return result;
    const width = Math.max(0.08, Math.min(3.5, contact.width || SNOW.TIRE_WIDTH));
    const length = Math.max(0.08, Math.min(2, contact.length || SNOW.TIRE_LENGTH));
    const dt = Math.max(0, Math.min(0.15, contact.dt || 0));
    if (!dt && !contact.depositMass) return result;
    const ux = distance > 0.001 ? vx / distance : Math.sin(contact.heading || 0);
    const uz = distance > 0.001 ? vz / distance : Math.cos(contact.heading || 0), nx = uz, nz = -ux;
    const half = width / 2, pad = Math.max(width, length) * 0.5 + DX;
    const minX = Math.floor((Math.min(x0, x1) - pad) / DX), maxX = Math.floor((Math.max(x0, x1) + pad) / DX);
    const minZ = Math.floor((Math.min(z0, z1) - pad) / DX), maxZ = Math.floor((Math.max(z0, z1) + pad) / DX);
    if ((maxX - minX + 1) * (maxZ - minZ + 1) > SNOW.MAX_CONTACT_CELLS) { stats.overflow++; return result; }
    const load = clamp01(contact.load01 ?? 1), foot = contact.kind === 'foot';
    const target = foot ? SNOW.FOOT_TARGET : SNOW.WHEEL_TARGET;
    const slip = Math.min(3, Math.abs(contact.slipLong || 0) + Math.abs(contact.slipSide || 0));
    const dwell = dt * Math.min(1, (length + DX) / Math.max(length + DX, distance));
    stats.contacts++; stampId++; workTiles.length = 0;
    let availablePickup = Math.max(0, contact.pickupCapacity || 0) / season;
    let deposit = Math.max(0, contact.depositMass || 0) / season;
    const minDot = -length * 0.5, maxDot = distance + length * 0.5;
    for (let gz = minZ; gz <= maxZ; gz++) for (let gx = minX; gx <= maxX; gx++) {
      const x = (gx + 0.5) * DX, z = (gz + 0.5) * DX;
      const along = (x - x0) * ux + (z - z0) * uz, across = (x - x0) * nx + (z - z0) * nz;
      const weight = clamp01((half + DX / 2 - Math.abs(across)) / DX) *
        clamp01((Math.min(along - minDot, maxDot - along) + DX / 2) / DX);
      if (weight <= 0) continue;
      initSample(id, x, z, base);
      if (!base.valid) continue;
      cell(id, gx, gz, true, lookup);
      const tile = lookup.tile, i = lookup.index;
      if (!tile || !tile.flags[i]) continue;
      tile.last = ++serial;
      const old = tile.mass[i], oldC = tile.c[i] / Q, icy = tile.ice[i] / B;
      const nextC = Math.max(oldC, oldC + (target - oldC) * (1 - Math.exp(-SNOW.COMPACT_RATE * load * dwell * weight)) * (1 - icy * 0.9));
      pending(tile, i);
      if (Math.round(nextC * Q) !== tile.c[i]) {
        tile.c[i] = Math.round(nextC * Q); tile.flags[i] |= 2; result.changed = true;
        result.compressedMass += old * AREA * season * (nextC - oldC);
      }
      if (deposit > 0 && old * season < 2) {
        const amount = Math.min(deposit / AREA, 0.04 * weight / AREA);
        tile.deltaM[i] += amount; tile.deltaV[i] += amount / SNOW.DENSITY_LOOSE;
        deposit -= amount * AREA; result.deposited += amount * AREA * season;
      }
      if (old < 0.0001) continue;
      const height = old * season / density(nextC);
      // Bearing pressure compacts first. Only the remaining loose part moves;
      // an arbitrary low visual wheel position cannot excavate the solid base.
      const bed = (base.materialId === 0 ? 0.06 : base.materialId === 2 ? 0.025 : 0) * season;
      const desired = Math.max(bed, Number.isFinite(contact.soleY) ? Math.max(0.006, contact.soleY - base.baseY) : height * 0.65);
      const excess = Math.max(0, old - desired / Math.max(season, 0.001) * density(nextC));
      const motion = foot ? 1 : Math.min(1, distance / DX + slip);
      const moved = Math.min(excess, old * (1 - nextC) * (1 - icy) * (1 - Math.exp(-(foot ? 3 : 12 + slip * 9) * dwell * weight * load * motion)));
      if (moved <= 1e-6) continue;
      let totalWeight = 0, count = 0, totalCapacity = 0;
      for (let slot = 0; slot < 6; slot++) {
        const side = slot < 2 ? -1 : 1, ring = slot % 2;
        const sideways = slot < 4, tail = (contact.slipLong || 0) > 0.3;
        // Two receiving cells per bank keep ridges broad. A slipping tyre
        // also throws material behind it; gentle rolling pushes it forward.
        const rx = sideways ? x + nx * side * (half + SNOW.TRANSFER_STEP + ring * DX) :
          x + ux * (tail ? -1 : 1) * (length * 0.5 + SNOW.TRANSFER_STEP) + nx * (ring ? 1 : -1) * width * 0.25;
        const rz = sideways ? z + nz * side * (half + SNOW.TRANSFER_STEP + ring * DX) :
          z + uz * (tail ? -1 : 1) * (length * 0.5 + SNOW.TRANSFER_STEP) + nz * (ring ? 1 : -1) * width * 0.25;
        initSample(id, rx, rz, pristine);
        if (!pristine.valid || Math.abs(pristine.baseY - base.baseY) > SNOW.BARRIER_HEIGHT) continue;
        cell(id, Math.floor(rx / DX), Math.floor(rz / DX), true, lookup);
        const rt = lookup.tile, ri = lookup.index;
        if (!rt || !rt.flags[ri] || rt === tile && ri === i) continue;
        const rh = rt.mass[ri] / density(rt.c[ri] / Q) + (rt.pending[ri] === stampId ? rt.deltaV[ri] : 0);
        const limit = Number.isFinite(pristine.maxThickness) ? pristine.maxThickness : Math.min(SNOW.MAX_DEPTH, pristine.thickness + SNOW.RIDGE_HEADROOM);
        const capacity = Math.max(0, limit - rh) * density(SNOW.FRESH_RIDGE_COMPACTION);
        if (capacity < 1e-6) continue;
        const weight = sideways ? 0.175 * (1 + Math.max(0, side * (contact.slipSide || 0)) * 0.5) : tail ? 0.15 : 0.1;
        let duplicate = false;
        for (let j = 0; j < count; j++) if (receivers[j].tile === rt && receivers[j].index === ri) {
          receivers[j].weight += weight; duplicate = true; break;
        }
        if (!duplicate) {
          const r = receivers[count++]; r.tile = rt; r.index = ri; r.capacity = capacity; r.weight = weight;
          pending(rt, ri); // pin prospective recipients until this transfer commits
          totalCapacity += capacity;
        }
        totalWeight += weight;
      }
      if (!count) continue;
      // Pickup is part of removed mass; remaining displaced mass becomes ridges.
      const accepted = Math.min(moved, totalCapacity);
      const pickup = foot ? 0 : Math.min(availablePickup / AREA, accepted * 0.08);
      availablePickup -= pickup * AREA; result.pickedUp += pickup * AREA * season;
      let remaining = accepted - pickup, deposited = 0;
      for (let pass = 0; pass < count && remaining > 1e-7; pass++) {
        totalWeight = 0;
        for (let j = 0; j < count; j++) if (receivers[j].capacity > 1e-7) totalWeight += receivers[j].weight;
        if (!totalWeight) break;
        const share = remaining;
        for (let j = 0; j < count; j++) {
          const r = receivers[j]; if (r.capacity <= 1e-7) continue;
          const amount = Math.min(r.capacity, share * r.weight / totalWeight);
          pending(r.tile, r.index); r.tile.deltaM[r.index] += amount;
          r.tile.deltaV[r.index] += amount / density(SNOW.FRESH_RIDGE_COMPACTION);
          r.capacity -= amount; remaining -= amount; deposited += amount;
        }
      }
      const actual = pickup + deposited;
      tile.deltaM[i] -= actual; tile.deltaV[i] -= actual / density(nextC);
      result.movedMass += actual * AREA * season; result.changed = true;
    }
    applyPending();
    if (result.changed) stats.changedContacts++;
    stats.movedMass += result.movedMass; stats.compressedMass += result.compressedMass;
    stats.pickedUp += result.pickedUp; stats.deposited += result.deposited;
    trim(); return result;
  }

  function stamp (contact) {
    if (!contact?.from || !contact.to) return stampSegment(contact || {});
    const dx = contact.to.x - contact.from.x, dz = contact.to.z - contact.from.z;
    const pad = Math.max(contact.width || SNOW.TIRE_WIDTH, contact.length || SNOW.TIRE_LENGTH) + DX * 2;
    const box = (Math.abs(dx) + pad) * (Math.abs(dz) + pad) / AREA;
    if (box <= SNOW.MAX_CONTACT_CELLS || Math.hypot(dx, dz) > SNOW.MAX_CONTACT_DISTANCE) return stampSegment(contact);
    // Large diagonal body contacts are split geometrically, not dropped. Each
    // part receives its fraction of elapsed time and the remaining tyre store.
    const parts = Math.min(8, Math.ceil(box / SNOW.MAX_CONTACT_CELLS) + 1);
    Object.assign(splitContact, contact); splitContact.from = splitFrom; splitContact.to = splitTo;
    splitResult.changed = false;
    splitResult.movedMass = splitResult.compressedMass = splitResult.pickedUp = splitResult.deposited = 0;
    for (let part = 0; part < parts; part++) {
      splitFrom.x = contact.from.x + dx * part / parts; splitFrom.z = contact.from.z + dz * part / parts;
      splitTo.x = contact.from.x + dx * (part + 1) / parts; splitTo.z = contact.from.z + dz * (part + 1) / parts;
      splitContact.dt = (contact.dt || 0) / parts;
      splitContact.pickupCapacity = Math.max(0, (contact.pickupCapacity || 0) - splitResult.pickedUp);
      splitContact.depositMass = (contact.depositMass || 0) / parts;
      const r = stampSegment(splitContact);
      splitResult.changed ||= r.changed;
      splitResult.movedMass += r.movedMass; splitResult.compressedMass += r.compressedMass;
      splitResult.pickedUp += r.pickedUp; splitResult.deposited += r.deposited;
    }
    return splitResult;
  }

  function setWeather (next) {
    const previousWet = Math.round(clamp01(weather.wetness) * 20);
    Object.assign(weather, next);
    season = seasonFactor(weather.snowAmount);
    // A completed melt season ends that snowpack. Menu/shift changes do not.
    // Rebase precipitation/melt history before the NEXT winter, otherwise a
    // long summer's melt integral would erase its pristine initial snow.
    if (season <= 0.0001) snowGone = true;
    if (snowGone && season > 0.005) { reset(); snowGone = false; }
    stats.season = season;
    // Seasonal depth already uses a shared shader uniform. Invalidating every
    // tile on every step of its interpolation kept both render queues busy.
    if (previousWet !== Math.round(clamp01(weather.wetness) * 20)) { weatherRevision++; visualWeatherRevision++; }
  }

  function step (dt) {
    dt = Math.max(0, Math.min(1, dt || 0)); time += dt; weatherClock += dt;
    settleClock += dt;
    if (settleClock >= 0.05) { settleClock %= 0.05; settle(); }
    if (weatherClock < 1 / SNOW.WEATHER_HZ) return;
    const elapsed = weatherClock; weatherClock = 0;
    const df = clamp01(weather.snowfall) * (0.02 + 0.04 * clamp01(weather.wind)) * elapsed * season;
    const dm = clamp01(weather.thaw) * 0.06 * elapsed;
    if (df || dm) { fall += df; melt += dm; weatherRevision++; }
    // Integrate weather at its original rate, but rebuild untouched meshes
    // only after about 2 mm of loose snow has changed. Submillimetre snowfall
    // used to invalidate the entire visible city twice a second.
    if (Math.abs(fall - visualFall) >= 0.24 || Math.abs(melt - visualMelt) >= 0.24) {
      visualFall = fall; visualMelt = melt; visualWeatherRevision++;
    }
  }

  function getRevision (id, tx, tz) { return (tileAt(id, tx, tz)?.revision || 0) + visualWeatherRevision * 100000000; }
  function getEdgeRevision (id, tx, tz, dx, dz) {
    return (tileAt(id, tx, tz)?.edgeRevision[(dz + 1) * 3 + dx + 1] || 0) + visualWeatherRevision * 100000000;
  }
  function getDirtyBounds (id, tx, tz, consumer) {
    const tile = tileAt(id, tx, tz);
    if (!tile || tile.archived || tile.weatherRevision !== weatherRevision) return null;
    if (consumer && tile.renderWeather[consumer] !== visualWeatherRevision) return null;
    const dirty = consumer ? tile.renderDirty[consumer] : tile.dirty;
    return dirty.maxX >= 0 ? dirty : null;
  }
  function clearDirty (id, tx, tz, rev, consumer) {
    const tile = tileAt(id, tx, tz);
    if (!tile || tile.archived || rev !== getRevision(id, tx, tz) && rev !== tile.revision) return;
    const dirty = consumer ? tile.renderDirty[consumer] : tile.dirty;
    dirty.minX = dirty.minZ = N; dirty.maxX = dirty.maxZ = -1;
    if (consumer) tile.renderWeather[consumer] = visualWeatherRevision;
  }
  function reset () {
    surfaces.clear(); live.clear(); archived.clear(); workTiles.length = 0;
    lookup.tile = null;
    for (const receiver of receivers) receiver.tile = null;
    settleRead = settleWrite = settleCount = settleClock = 0;
    fall = melt = time = weatherClock = visualFall = visualMelt = 0; weatherRevision++; visualWeatherRevision++; revision++;
    for (const key of Object.keys(stats)) stats[key] = 0;
    stats.season = season; stats.revision = revision; stats.bytes = 65536;
  }
  return { sample, stamp, setWeather, step, getRevision, getEdgeRevision, getDirtyBounds, clearDirty,
    setFocus (x, z) { focusX = x; focusZ = z; },
    setProtection (predicate) { protectTile = typeof predicate === 'function' ? predicate : null; },
    reset, dispose: reset, stats };
}
