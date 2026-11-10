import { STARTUP } from '../startuptrace.js';
import { shaderManifest } from './deck-shader-format.js';

export function primeDeckShaders (entry, sourceHash) {
  if (!shaderManifest(entry, sourceHash) || typeof Worker === 'undefined' || document.hidden) return null;
  let worker;
  try { worker = new Worker(new URL('./deck-shaders.worker.js', import.meta.url), { type: 'module' }); }
  catch { return null; }
  const timeout = setTimeout(stop, 45000);
  function stop () {
    if (!worker) return;
    clearTimeout(timeout);
    worker.terminate();
    worker = null;
  }
  worker.onmessage = ({ data }) => {
    if (data?.stage === 'dispatched') {
      STARTUP.mark('gpu.deckShaders.dispatched');
      return;
    }
    if (data?.stage === 'done') {
      STARTUP.worker('gpu.deckShaders', data.ms);
      STARTUP.count('gpu.deckShaders.programs', data.count);
      if (data.errors) STARTUP.count('gpu.deckShaders.failed', data.errors);
      STARTUP.mark('gpu.deckShaders.done');
    } else STARTUP.flag('gpu.deckShaders.unavailable');
    stop();
  };
  worker.onerror = event => {
    event.preventDefault();
    STARTUP.flag('gpu.deckShaders.unavailable');
    stop();
  };
  worker.onmessageerror = stop;
  try {
    worker.postMessage({ entry, url: new URL(entry.path, location.href).href });
    STARTUP.mark('gpu.deckShaders.started');
  } catch { stop(); }
  return stop;
}
