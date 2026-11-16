import bridge from '@vkontakte/vk-bridge';
import { decode, hardenPage, localBoard, pauseHub } from './common.js';

const hub = pauseHub();
const viewerId = new URLSearchParams(location.search).get('vk_user_id');
const prefix = /^\d+$/.test(viewerId ?? '') ? `bird-vk:${viewerId}:` : 'bird-vk:local:';
const storage = createStorage(prefix);
const store = {
  get (key, fallback) {
    try {
      const value = decode(storage.getItem(key));
      return value === undefined ? fallback : value;
    } catch { return fallback; }
  },
  set (key, value) {
    try {
      if (value === undefined) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(value));
    } catch { /* A blocked or full browser store must not interrupt a shift. */ }
  },
  flush () {},
};

function createStorage (prefix) {
  let local;
  try {
    local = window.localStorage;
    const probe = `${prefix}available`;
    local.setItem(probe, '1');
    local.removeItem(probe);
  } catch {
    local = null;
  }
  const memory = new Map();
  const keys = () => !local ? Array.from(memory.keys()) : Array.from({ length: local.length }, (_, index) => local.key(index))
    .filter(key => key?.startsWith(prefix)).map(key => key.slice(prefix.length));
  return {
    get length () { return keys().length; },
    key (index) { return keys()[index] ?? null; },
    getItem (key) { return local ? local.getItem(prefix + key) : memory.get(key) ?? null; },
    setItem (key, value) {
      if (local) local.setItem(prefix + key, value);
      else memory.set(key, String(value));
    },
    removeItem (key) {
      if (local) local.removeItem(prefix + key);
      else memory.delete(key);
    },
  };
}

function deadline (promise, ms) {
  let timer;
  return Promise.race([promise, new Promise(resolve => { timer = setTimeout(resolve, ms); })])
    .finally(() => clearTimeout(timer));
}

function lockPageZoom () {
  const capture = { capture: true, passive: false };
  const preventZoom = event => event.preventDefault();
  // Safari и встроенный WebView могут обрабатывать щипок поверх страницы.
  for (const type of ['gesturestart', 'gesturechange']) {
    document.addEventListener(type, preventZoom, capture);
  }
  document.addEventListener('wheel', event => {
    if (event.ctrlKey || event.metaKey) event.preventDefault();
  }, capture);

  // Старый WebKit может увеличивать статичные участки даже с touch-action.
  let lastTap = null;
  document.addEventListener('touchend', event => {
    const target = event.target;
    if (event.touches.length || event.changedTouches.length !== 1 ||
        target?.closest?.('button, a, input, select, textarea, [role="button"], [role="slider"], [contenteditable]')) {
      lastTap = null;
      return;
    }
    const { clientX: x, clientY: y } = event.changedTouches[0], time = event.timeStamp;
    if (lastTap && time - lastTap.time < 300 && Math.hypot(x - lastTap.x, y - lastTap.y) < 24) {
      event.preventDefault();
      lastTap = null;
      return;
    }
    lastTap = { x, y, time };
  }, capture);
}

let adPending = false;
const reward = { ad_format: 'reward' };
const Platform = {
  id: 'vk',
  lang: 'ru',
  langChosen: true,
  features: { ads: false, leaderboard: 'local', externalLinks: false, nameInput: false, gore: false, adult: false, quit: false },
  storage,
  store,
  player: { name: '', avatar: '', authorized: false, async auth () { return false; } },
  leaderboard: localBoard(store),

  async init () {
    hardenPage();
    lockPageZoom();
    hub.watchVisibility();
    if (!bridge.isEmbedded() && !bridge.isWebView()) return;

    bridge.subscribe(({ detail }) => {
      if (detail.type === 'VKWebAppViewHide') hub.pause('vk');
      if (detail.type === 'VKWebAppViewRestore') hub.resume('vk');
    });
    try {
      const response = await deadline(bridge.send('VKWebAppInit'), 2500);
      Platform.features.ads = response?.result === true &&
        (await deadline(bridge.supportsAsync('VKWebAppShowNativeAds'), 1000)) === true;
    } catch {
      // The game can start when opened directly from its host or when the bridge is unavailable.
    }
  },

  ready () {},
  setLang () {},
  gameplayStart () {},
  gameplayStop () {},
  async showRewarded () {
    if (!Platform.features.ads || adPending) return false;
    adPending = true;
    hub.pause('ad');
    try {
      const available = await deadline(bridge.send('VKWebAppCheckNativeAds', reward), 5000);
      if (!available?.result) return false;
      const shown = await deadline(bridge.send('VKWebAppShowNativeAds', reward), 120000);
      return shown?.result === true;
    } catch {
      return false;
    } finally {
      adPending = false;
      hub.resume('ad');
    }
  },

  onPause: hub.onPause,
  onResume: hub.onResume,
  get paused () { return hub.paused; },
  quit () {},
};

export default Platform;
