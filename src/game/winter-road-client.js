function validRoadSheets (data) {
  return Number.isFinite(data?.ms) && data.indexStats &&
    ['n', 'u', 'cells', 'plain', 'ms'].every(key => Number.isFinite(data.indexStats[key])) &&
    Array.isArray(data.cells) && data.cells.length > 0 && data.cells.every(cell =>
      Number.isSafeInteger(cell.key) && Number.isSafeInteger(cell.vertices) && cell.vertices > 0 &&
      Array.isArray(cell.bounds) && cell.bounds.length === 4 && cell.bounds.every(Number.isFinite) &&
      cell.positions instanceof Float32Array && cell.colours instanceof Uint8Array &&
      cell.positions.length === cell.colours.length && cell.positions.length % 3 === 0 &&
      (cell.index === null ? cell.positions.length === cell.vertices * 3
        : (cell.index instanceof Uint16Array || cell.index instanceof Uint32Array) && cell.index.length === cell.vertices));
}

let primed = null;

// Start after the launch menu has painted, so Chromium can load the
// worker module before the synchronous city builders need its output.
export function primeWinterRoadWorker (onReady) {
  if (primed || typeof Worker === 'undefined') return;
  let worker;
  try { worker = new Worker(new URL('./winter-road-sheet.worker.js', import.meta.url), { type: 'module' }); }
  catch (error) { return; }
  const slot = primed = { worker, ready: false };
  worker.onmessage = ({ data }) => {
    if (primed !== slot || data?.ready !== true) return;
    slot.ready = true;
    onReady?.();
  };
  worker.onerror = event => { event.preventDefault(); if (primed === slot) takeWinterRoadWorker(false); };
}

export function takeWinterRoadWorker (use = true) {
  const slot = primed;
  primed = null;
  if (!slot) return null;
  if (use && slot.ready) return slot.worker;
  slot.worker.terminate();
  return null;
}

// The street index stays on the main thread. The worker emits colour and
// position buffers for the immutable road sheet on the same terrain.
export function startWinterRoadSheets (worker, segments, terrain, heights, chunk) {
  let timer, finish;
  const result = new Promise(resolve => {
    finish = value => {
      if (!worker) return;
      clearTimeout(timer);
      worker.terminate();
      worker = null;
      resolve(value);
    };
    worker.onmessage = ({ data }) => finish(validRoadSheets(data) ? data : null);
    worker.onerror = event => { event.preventDefault(); finish(null); };
    worker.onmessageerror = () => finish(null);
  });
  try {
    const heightCopy = heights.slice();
    const { g, nx, nz, x0, z0 } = terrain;
    worker.postMessage({ segments, terrain: { g, nx, nz, x0, z0 }, heights: heightCopy, chunk }, [heightCopy.buffer]);
  } catch (error) {
    finish(null);
    return null;
  }
  return {
    take () {
      if (worker) timer = setTimeout(() => finish(null), 160);
      return result;
    },
  };
}
