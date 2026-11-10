/* Prepared draw-only terrain. Collision, paint ownership and object
   placement still use the live contour data. Buffers are laid out for
   direct BufferAttribute views after reading the verified local asset. */
import { decodeCurbPhysics, encodeCurbPhysics } from './curb-physics.js';

const MAGIC = 0x31544c53;
export const SURFACE_BAKE_RADIUS = 1024;
export const SURFACE_LIMIT = 128 * 1024 * 1024;
const align4 = bytes => Math.ceil(bytes / 4) * 4;
const requireValue = (value, reason) => {
  if (!value) throw Error('land-surface: ' + reason);
};

export function snapshotSurface (group) {
  return group.children.map(({ geometry }) => ({
    position: geometry.attributes.position.array.slice(),
    color: geometry.attributes.color.array.slice(),
    colors: geometry.attributes.color.itemSize,
    index: geometry.index?.array.slice() ?? null,
  }));
}

export function encodeSurfaceTiles (tiles, curbs = null) {
  const curbBytes = curbs?.size ? encodeCurbPhysics(curbs) : null;
  requireValue(tiles.size > 0 && tiles.size <= 512, 'tile count');
  let size = 8 + (curbBytes?.byteLength || 0);
  for (const meshes of tiles.values()) {
    size += 8;
    for (const { position, color, index } of meshes) {
      size += 12 + position.byteLength + align4(color.byteLength) + align4(index?.byteLength || 0);
    }
  }
  requireValue(size <= SURFACE_LIMIT, 'size');
  const bytes = new Uint8Array(size), header = new DataView(bytes.buffer);
  header.setUint32(0, MAGIC, true);
  header.setUint32(4, tiles.size, true);
  let at = 8;
  const write = array => {
    if (!array) return;
    bytes.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), at);
    at += align4(array.byteLength);
  };
  for (const [id, meshes] of tiles) {
    header.setUint32(at, id, true);
    header.setUint32(at + 4, meshes.length, true);
    at += 8;
    for (const { position, color, colors, index } of meshes) {
      header.setUint32(at, position.length / 3, true);
      header.setUint32(at + 4, index?.length || 0, true);
      header.setUint8(at + 8, colors);
      header.setUint8(at + 9, index?.BYTES_PER_ELEMENT || 0);
      at += 12;
      write(position);
      write(color);
      write(index);
    }
  }
  if (curbBytes) bytes.set(curbBytes, at);
  return bytes;
}

export function decodeSurfaceBundle (buffer) {
  requireValue(buffer instanceof ArrayBuffer && buffer.byteLength >= 8 && buffer.byteLength <= SURFACE_LIMIT, 'size');
  const header = new DataView(buffer), tiles = new Map();
  requireValue(header.getUint32(0, true) === MAGIC, 'format');
  const count = header.getUint32(4, true);
  requireValue(count > 0 && count <= 512, 'tile count');
  let at = 8;
  const fits = length => requireValue(at + length <= buffer.byteLength, 'truncated');
  const read = (Type, length) => {
    const bytes = align4(length * Type.BYTES_PER_ELEMENT);
    fits(bytes);
    const view = new Type(buffer, at, length);
    at += bytes;
    return view;
  };
  for (let t = 0; t < count; t++) {
    fits(8);
    const id = header.getUint32(at, true), length = header.getUint32(at + 4, true);
    requireValue(!tiles.has(id) && length <= 128, 'tile header');
    at += 8;
    const meshes = [];
    for (let m = 0; m < length; m++) {
      fits(12);
      const n = header.getUint32(at, true), ni = header.getUint32(at + 4, true);
      const colors = header.getUint8(at + 8), indexSize = header.getUint8(at + 9);
      requireValue(n > 0 && (colors === 3 || colors === 4), 'attributes');
      requireValue((indexSize === 0 && ni === 0 && n % 3 === 0) ||
        ((indexSize === 2 || indexSize === 4) && ni > 0 && ni % 3 === 0), 'indices');
      at += 12;
      const position = read(Float32Array, n * 3), color = read(Uint8Array, n * colors);
      const index = indexSize ? read(indexSize === 2 ? Uint16Array : Uint32Array, ni) : null;
      requireValue(position.every(Number.isFinite) && (!index || index.every(i => i < n)), 'geometry');
      meshes.push({ position, color, colors, index });
    }
    tiles.set(id, meshes);
  }
  return { tiles, curbs: decodeCurbPhysics(buffer, at) };
}

export function decodeSurfaceTiles (buffer) {
  return decodeSurfaceBundle(buffer).tiles;
}

export async function loadSurfaceTiles (entry, signal) {
  const response = await fetch(new URL(entry.path, location.href), { signal });
  requireValue(response.ok, 'read');
  const buffer = await response.arrayBuffer();
  requireValue(buffer.byteLength === entry.bytes, 'length');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  const hash = Array.from(digest, n => n.toString(16).padStart(2, '0')).join('');
  requireValue(hash === entry.sha256, 'hash');
  return decodeSurfaceTiles(buffer);
}

export function createSurfaceCapture () {
  const tiles = new Map(), curbs = new Map();
  let archive;
  return {
    save(id, group) { tiles.set(id, snapshotSurface(group)); },
    saveCurbs(district, data) { curbs.set(district, data); },
    size() {
      if (!archive) { archive = encodeSurfaceTiles(tiles, curbs); tiles.clear(); curbs.clear(); }
      return archive.byteLength;
    },
    chunk(offset, length) {
      requireValue(archive && Number.isSafeInteger(offset) && Number.isSafeInteger(length) &&
        offset >= 0 && length > 0 && length <= 65536 && offset + length <= archive.length, 'chunk');
      let out = '';
      for (let i = offset; i < offset + length; i += 4096) {
        out += String.fromCharCode(...archive.subarray(i, Math.min(i + 4096, offset + length)));
      }
      return btoa(out);
    },
  };
}
