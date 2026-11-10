import { Sha256 } from '../landcache17a/sha256.js';

/* Prepared yard curb lookup for the same map geometry. The asset is
   optional and the live layout must match the hash before installation. */
const MAGIC = 0x31434259;
const MAX_SEGMENTS = 500000;
const MAX_CELLS = 32000;
const HASH_BYTES = 32;
export const CURB_STATS = [
  'runs', 'm', 'secs', 'pathM', 'driveM', 'streetM', 'capM', 'lotM',
  'playM', 'pocketM', 'arcs', 'cut', 'strip', 'miter', 'raised',
];
const STATS_BYTES = CURB_STATS.length * 4;
const ENTRY_HEADER = 12 + HASH_BYTES + STATS_BYTES;
const check = (value, reason) => {
  if (!value) throw Error('land-curbs: ' + reason);
};
function validHeader(district, cells, segments) {
  check(district <= 63 && cells > 0 && cells <= MAX_CELLS && segments > 0 &&
    segments <= MAX_SEGMENTS, 'size');
}
export function encodeCurbPhysics(entries) {
  check(entries.size > 0 && entries.size <= 8, 'districts');
  let size = 8;
  for (const entry of entries.values()) {
    size += ENTRY_HEADER + entry.cells.byteLength + entry.segments.byteLength + entry.berm.byteLength;
  }
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, entries.size, true);
  let at = 8;
  for (const [district, { inputHash, cells, segments, berm, stats }] of entries) {
    check(/^[a-f0-9]{64}$/.test(inputHash), 'input hash');
    check(cells.length % 2 === 0 && segments.length % 4 === 0 && berm.length === segments.length / 2, 'arrays');
    validHeader(district, cells.length / 2, segments.length / 4);
    view.setUint32(at, district, true);
    view.setUint32(at + 4, cells.length / 2, true);
    view.setUint32(at + 8, segments.length / 4, true);
    at += 12;
    for (let i = 0; i < HASH_BYTES; i++) bytes[at++] = Number.parseInt(inputHash.slice(i * 2, i * 2 + 2), 16);
    for (const key of CURB_STATS) {
      const count = stats[key];
      check(Number.isSafeInteger(count) && count >= 0 && count <= 0xffffffff, 'stats');
      view.setUint32(at, count, true);
      at += 4;
    }
    for (const a of [cells, segments, berm]) {
      bytes.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), at);
      at += a.byteLength;
    }
  }
  return bytes;
}

export function decodeCurbPhysics(buffer, start) {
  const entries = new Map();
  if (start === buffer.byteLength) return entries;
  const view = new DataView(buffer);
  check(start % 4 === 0 && start + 8 <= buffer.byteLength && view.getUint32(start, true) === MAGIC, 'format');
  const count = view.getUint32(start + 4, true);
  check(count > 0 && count <= 8, 'districts');
  let at = start + 8;
  const read = (Type, length) => {
    const bytes = length * Type.BYTES_PER_ELEMENT;
    check(at + bytes <= buffer.byteLength, 'truncated');
    const value = new Type(buffer, at, length);
    at += bytes;
    return value;
  };
  for (let i = 0; i < count; i++) {
    check(at + ENTRY_HEADER <= buffer.byteLength, 'truncated');
    const district = view.getUint32(at, true);
    const n = view.getUint32(at + 4, true), segmentsN = view.getUint32(at + 8, true);
    validHeader(district, n, segmentsN);
    check(!entries.has(district), 'duplicate district');
    at += 12;
    let inputHash = '';
    for (let b = 0; b < HASH_BYTES; b++) inputHash += view.getUint8(at++).toString(16).padStart(2, '0');
    const stats = {};
    for (const key of CURB_STATS) {
      stats[key] = view.getUint32(at, true);
      at += 4;
    }
    const cells = read(Uint32Array, n * 2);
    const segments = read(Float32Array, segmentsN * 4), berm = read(Float32Array, segmentsN * 2);
    let end = 0;
    const keys = new Set();
    for (let c = 0; c < cells.length; c += 2) {
      const key = cells[c], range = cells[c + 1], size = range % 1024;
      check(!keys.has(key) && size > 0 && Math.floor(range / 1024) === end, 'ranges');
      keys.add(key);
      end += size;
    }
    check(end === segmentsN && segments.every(Number.isFinite) && berm.every(Number.isFinite), 'segments');
    entries.set(district, { inputHash, cells, segments, berm, stats });
  }
  check(at === buffer.byteLength, 'trailing data');
  return entries;
}

// Fingerprint the data used by ground height, raised sidewalk cells,
// point-in-house, paved surfaces, parking pockets and park paths.
export function curbPhysicsInputHash({ CITY, TH, BOUNDS, BORDER, RAISED, RSEG, HOUSE_GRID,
  roadWidth, isArc, pave, alleys, pockets }) {
  const hash = new Sha256(), encoder = new TextEncoder();
  hash.update(new Uint8Array(TH.buffer, TH.byteOffset, TH.byteLength));
  hash.update(RAISED.bits);
  const polygons = [], polygonIds = new Map();
  const polygonId = ({ p }) => {
    let id = polygonIds.get(p);
    if (id === undefined) {
      id = polygons.length;
      polygonIds.set(p, id);
      polygons.push(p);
    }
    return id;
  };
  const houses = Array.from(HOUSE_GRID, ([key, list]) => [key, list.map(polygonId)]);
  const layout = [
    [CITY.terrain.g, CITY.terrain.nx, CITY.terrain.nz, CITY.terrain.x0, CITY.terrain.z0],
    BOUNDS, BORDER, [...RAISED.extra], pave, houses, polygons,
    CITY.entrances.map(e => [e[0], e[1]]),
    CITY.roads.map(r => [r.p, r.c, r.b, r.x, r.g, r.softEnds, roadWidth(r), r.p.map(p => isArc(p[0], p[1]))]),
    RSEG.map(s => [s.x1, s.z1, s.x2, s.z2, s.c, s.w, s.g]),
    CITY.paths.map(p => [p, p.hw, p.lift]),
    (CITY.lots || []).map(p => [p.k, p.p, p.softP, !!p.softP?.soft]),
    (CITY.green || []).map(p => [p.k, p.p, p.softP, !!p.softP?.soft]),
    alleys.map(a => [a.pts, a.w]),
    pockets.map(p => [p.cx, p.cz, p.ux, p.uz, p.nx, p.nz, p.hl, p.hd, p.outline, !!p.outline?.soft]),
  ];
  hash.update(encoder.encode(JSON.stringify(layout, (_key, value) => Object.is(value, -0) ? '-0' : value)));
  return hash.hex();
}
