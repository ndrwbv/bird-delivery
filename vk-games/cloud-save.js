const API = new URL('./api/', document.baseURI);
const LOCAL_ONLY = /^(?:dlv-(?:ach|crashlog|trans|gfx|lang|lb-local|sound|tel(?:-.*)?|vol-(?:eng|music|sfx)))$/;
const isProgress = key => /^dlv-[a-zA-Z0-9_-]{1,75}$/.test(key) && !LOCAL_ONLY.test(key);
const META = 'vk-sync';
const SAVE_DELAY = 500;
const RETRY_DELAY = 10000;

export function createStorage (prefix, changed = () => {}) {
  const values = new Map();
  let local;
  try {
    local = window.localStorage;
    for (let i = 0; i < local.length; i++) {
      const key = local.key(i);
      if (key?.startsWith(prefix)) values.set(key.slice(prefix.length), local.getItem(key));
    }
  } catch { local = null; }
  return {
    get length () { return values.size; },
    key (index) { return Array.from(values.keys())[index] ?? null; },
    getItem (key) { return values.get(key) ?? null; },
    setItem (key, value) {
      const raw = String(value);
      if (values.get(key) === raw) return;
      values.set(key, raw);
      try { local?.setItem(prefix + key, raw); } catch { /* Continue in memory. */ }
      changed(key);
    },
    removeItem (key) {
      if (!values.delete(key)) return;
      try { local?.removeItem(prefix + key); } catch { /* Continue in memory. */ }
      changed(key);
    },
    keys () { return [...values.keys()]; },
  };
}

export async function vkRequest (endpoint, method, body, token) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const abort = new AbortController();
  const deadline = setTimeout(() => abort.abort(), 9500);
  try {
    const response = await fetch(new URL(endpoint, API), {
      method, headers, body: body && JSON.stringify(body), signal: abort.signal,
      credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
    });
    if (!response.ok) throw Object.assign(new Error('VK save request failed'), { status: response.status });
    return await response.json();
  } finally { clearTimeout(deadline); }
}

function snapshotOf (storage) {
  return Object.fromEntries(storage.keys().filter(isProgress).sort().map(key => [key, storage.getItem(key)]));
}

function stateOf (storage) {
  try { return JSON.parse(storage.getItem(META)) || {}; } catch { return {}; }
}

export async function connectSave (session, chooseSave, report) {
  let active = false;
  let pending = false;
  let stopped = false;
  let deleting = false;
  let queued;
  let inFlight = null;
  let revision = session.revision;
  const storage = createStorage('bird-vk:' + session.player + ':', key => {
    if (!active || !isProgress(key)) return;
    if (!pending) {
      pending = true;
      remember();
    }
    schedule(SAVE_DELAY);
  });
  const remember = () => storage.setItem(META, JSON.stringify({ revision, pending }));
  const local = snapshotOf(storage);
  const previous = stateOf(storage);
  if (previous.pending && previous.revision === revision) {
    pending = true;
  } else if (previous.pending && JSON.stringify(local) !== JSON.stringify(session.snapshot)) {
    pending = await chooseSave();
  } else if (!revision && previous.revision === undefined) {
    // Import the existing local pilot save the first time this account connects.
    pending = Object.keys(local).length > 0;
  }
  if (!pending) {
    for (const key of storage.keys().filter(isProgress)) storage.removeItem(key);
    for (const [key, raw] of Object.entries(session.snapshot)) storage.setItem(key, raw);
  }
  remember();
  active = true;

  function schedule (delay) {
    if (!queued && !stopped && !deleting && pending) queued = setTimeout(flush, delay);
  }

  function flush () {
    clearTimeout(queued);
    queued = undefined;
    if (!pending || stopped || deleting || inFlight) return;
    const snapshot = snapshotOf(storage);
    let delay = SAVE_DELAY;
    inFlight = vkRequest('progress', 'PUT', { revision, snapshot }, session.token)
      .then(saved => {
        revision = saved.revision;
        pending = JSON.stringify(snapshot) !== JSON.stringify(snapshotOf(storage));
        remember();
        report('');
      })
      .catch(error => {
        delay = RETRY_DELAY;
        if (error.status === 409 || error.status === 401) {
          stopped = true;
          report(error.status === 409
            ? 'Есть новое сохранение на другом устройстве. Откройте игру заново, чтобы выбрать прогресс.'
            : 'Сеанс VK завершён. Откройте игру заново, чтобы сохранить прогресс.');
        } else {
          report('Пока не удалось сохранить прогресс в VK. На этом устройстве игра продолжится.');
        }
      })
      .finally(() => {
        inFlight = null;
        schedule(delay);
      });
  }

  function retry () { flush(); }
  function onVisibility () { if (document.hidden) flush(); }
  window.addEventListener('online', retry);
  document.addEventListener('visibilitychange', onVisibility);
  schedule(SAVE_DELAY);
  return {
    storage,
    flush,
    async remove () {
      deleting = true;
      clearTimeout(queued);
      queued = undefined;
      try {
        await inFlight;
        await vkRequest('progress', 'DELETE', undefined, session.token);
        active = false;
        stopped = true;
        window.removeEventListener('online', retry);
        document.removeEventListener('visibilitychange', onVisibility);
        for (const key of storage.keys()) storage.removeItem(key);
      } finally {
        deleting = false;
        schedule(RETRY_DELAY);
      }
    },
  };
}
