function prefetch (job) {
  if (typeof Worker === 'undefined') return null;
  const worker = new Worker(new URL('./land-package.worker.js', import.meta.url), { type: 'module' });
  let result = null, active = true;
  const timer = setTimeout(stop, 30000);
  function stop () {
    if (!active) return;
    active = false;
    clearTimeout(timer);
    worker.onmessage = worker.onerror = worker.onmessageerror = null;
    worker.terminate();
  }
  worker.onmessage = ({ data }) => { result = data; stop(); };
  worker.onerror = event => { event.preventDefault(); stop(); };
  worker.onmessageerror = stop;
  try { worker.postMessage(job); }
  catch (error) { stop(); throw error; }
  return {
    peek () { return result; },
    take () { const value = result; result = null; stop(); return value; },
    close () { result = null; stop(); },
  };
}

export function prefetchLandPackage (url, entry, identity, limits) {
  const request = prefetch({ url, entry, identity, limits });
  return request && { precleanHash: entry.precleanHash, ...request };
}

export function prefetchSurfaceTiles (entry) {
  return prefetch({ url: new URL(entry.path, location.href).href, entry, surface: true });
}
