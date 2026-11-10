import { createPileCommands, applyPileCommands } from './season-pile-codec.js';

export function startSeasonPile ({ cell, wood, raised }) {
  if (typeof Worker === 'undefined') return null;
  let worker;
  try { worker = new Worker(new URL('./season-pile.worker.js', import.meta.url), { type: 'module' }); }
  catch { return null; }

  const batches = [];
  let settle, timeout, ended = false, failure = 'pending';
  const result = new Promise(resolve => { settle = resolve; });
  function finish (data, reason) {
    if (!worker) return;
    clearTimeout(timeout);
    worker.terminate();
    worker = null;
    failure = reason;
    settle(data);
  }
  function post (data) {
    if (!worker) return;
    try { worker.postMessage(data); }
    catch { finish(null, 'post'); }
  }
  const producer = createPileCommands(cell, data => {
    // These commands also rebuild the same geometry if the worker stops.
    batches.push(data);
    post(data);
  });
  worker.onmessage = ({ data }) => {
    const counts = producer.counts;
    const valid = ended && Number.isFinite(data?.ms) && Number.isSafeInteger(data.reused) &&
      data.reused >= 0 && data.reused <= counts.size && Array.isArray(data.cells) && data.cells.length === counts.size &&
      data.cells.every(({ k, n, p, c, a, index }) =>
        counts.get(k) === n && p instanceof Float32Array && c instanceof Uint8Array && a instanceof Uint8Array &&
        p.length % 3 === 0 && p.length === c.length && a.length === p.length / 3 * 4 &&
        (index === null ? p.length === n * 3 :
          (index instanceof Uint16Array || index instanceof Uint32Array) && index.length === n));
    const cells = valid && new Map(data.cells.map(row => [row.k, row]));
    finish(cells && cells.size === counts.size ? { cells, ms: data.ms, reused: data.reused } : null, 'response');
  };
  worker.onerror = event => { event.preventDefault(); finish(null, 'worker'); };
  worker.onmessageerror = () => finish(null, 'message');
  timeout = setTimeout(() => finish(null, 'timeout'), 120000);
  post({ kind: 'init', cell, wood, raised });
  if (!worker) return null;

  return {
    cell,
    producer,
    get failure () { return failure; },
    prepack () {
      if (!worker || ended) return;
      producer.flush();
      post({ kind: 'prepack' });
    },
    dispatch () {
      if (ended) return;
      producer.flush();
      ended = true;
      post({ kind: 'finish' });
    },
    take () {
      if (worker) { clearTimeout(timeout); timeout = setTimeout(() => finish(null, 'timeout'), 160); }
      return { wait: result, sync: () => { finish(null, 'sync'); return null; }, label: 'деревья', traceName: 'seasons.pileWait' };
    },
    recover (pile) {
      const apply = applyPileCommands(pile);
      for (const data of batches) apply(data);
    },
    clear () { finish(null, 'closed'); batches.length = 0; producer.counts.clear(); },
  };
}
