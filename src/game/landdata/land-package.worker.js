import { decodeCheckpoint } from '../landcache17a/checkpoint-codec.js';
import { limitsOf } from '../landcache17a/checkpoint-limits.js';
import { decodeSurfaceBundle, SURFACE_LIMIT } from './surface-tiles.js';

async function readExact (stream, length) {
  const reader = stream.getReader(), out = new Uint8Array(length);
  let offset = 0, finished = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array) || offset + value.length > length) throw Error('land-preload:SIZE');
      out.set(value, offset);
      offset += value.length;
    }
    if (offset !== length) throw Error('land-preload:SHORT');
    finished = true;
    return out;
  } finally {
    if (!finished) reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
async function sha256 (bytes) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash, n => n.toString(16).padStart(2, '0')).join('');
}
function localAsset (url, entry) {
  const asset = new URL(url), here = self.location;
  if (asset.protocol !== here.protocol || asset.host !== here.host ||
      asset.pathname !== '/' + entry.path || asset.search || asset.hash) throw Error('land-preload:URL');
  return asset;
}
async function load ({ url, entry, identity, limits: ceilings }) {
  const asset = localAsset(url, entry);
  const limits = limitsOf(ceilings);
  const ceiling = limits.maxPayloadBytes + limits.maxHeaderBytes + 20;
  for (const length of [entry.bytes, entry.rawBytes]) {
    if (!Number.isSafeInteger(length) || length <= 0 || length > ceiling) throw Error('land-preload:BUDGET');
  }
  const response = await fetch(asset, { cache: 'default' });
  const contentLength = response.headers.get('content-length');
  if (!response.ok || !response.body ||
      (contentLength !== null && Number(contentLength) !== entry.bytes)) throw Error('land-preload:HTTP');
  const wire = await readExact(response.body, entry.bytes), wireHash = await sha256(wire);
  if (wireHash !== entry.sha256) throw Error('land-preload:WIRE_HASH');
  const source = entry.encoding === 'gzip'
    ? new ReadableStream({ start (controller) { controller.enqueue(wire); controller.close(); } })
      .pipeThrough(new DecompressionStream('gzip'))
    : null;
  const raw = source ? await readExact(source, entry.rawBytes) : wire;
  const rawHash = source ? await sha256(raw) : wireHash;
  if (raw.length !== entry.rawBytes || rawHash !== entry.rawSha256) throw Error('land-preload:RAW_HASH');
  const snapshot = decodeCheckpoint(raw, identity, { limits });
  const buffers = new Set([snapshot.mask.segments.buffer]);
  for (const cover of [snapshot.cover, snapshot.green, snapshot.mask.kept]) {
    // All cells in a decoded cover share the compact index buffer.
    for (const cell of cover.grid.values()) buffers.add(cell.buffer);
    for (const page of cover.packed?.blocks || []) {
      for (const value of Object.values(page)) if (ArrayBuffer.isView(value)) buffers.add(value.buffer);
    }
  }
  self.postMessage({ snapshot, wireHash, rawHash }, [...buffers]);
}

async function loadSurface ({ url, entry }) {
  const asset = localAsset(url, entry);
  if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 8 || entry.bytes > SURFACE_LIMIT) throw Error('land-preload:BUDGET');
  const response = await fetch(asset, { cache: 'default' });
  if (!response.ok || !response.body) throw Error('land-preload:HTTP');
  const bytes = await readExact(response.body, entry.bytes);
  const hash = await sha256(bytes);
  if (hash !== entry.sha256) throw Error('land-preload:SURFACE_HASH');
  const bundle = decodeSurfaceBundle(bytes.buffer);
  self.postMessage({ ...bundle, hash }, [bytes.buffer]);
}

self.onmessage = ({ data }) => {
  (data?.surface ? loadSurface(data) : load(data)).catch(() => self.postMessage(null));
};
