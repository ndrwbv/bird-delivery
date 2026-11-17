import bridge from '@vkontakte/vk-bridge';
import { decode, hardenPage, localBoard, pauseHub } from './common.js';
import { connectSave, createStorage, vkRequest } from './vk-cloud-save.js';
import { chooseSave, confirmConsent, loadingError, syncStatus } from './vk-moderation-ui.js';

const hub = pauseHub();
let storage;
let cloud;
let consentScope;
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
  flush () { cloud?.flush(); },
};

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
  get storage () { return storage; },
  store,
  player: { name: '', avatar: '', authorized: false, async auth () { return false; } },
  leaderboard: localBoard(store),

  async init () {
    hardenPage();
    lockPageZoom();
    hub.watchVisibility();
    const params = new URLSearchParams(location.search);
    const embedded = bridge.isEmbedded() || bridge.isWebView();
    const inVK = embedded || params.has('vk_app_id') || params.has('sign');
    const viewer = params.get('vk_user_id');
    consentScope = inVK ? (/^[0-9]{1,20}$/.test(viewer ?? '') ? viewer : null) : 'local';
    const consent = await confirmConsent(consentScope, inVK);
    if (!inVK) { storage = createStorage('bird-vk:local:'); return; }

    bridge.subscribe(({ detail }) => {
      if (detail.type === 'VKWebAppViewHide') hub.pause('vk');
      if (detail.type === 'VKWebAppViewRestore') hub.resume('vk');
    });
    try {
      const bridgeReady = embedded ? deadline(bridge.send('VKWebAppInit'), 4000).catch(() => null) : null;
      let launch = params;
      if (!launch.has('sign') && embedded) {
        const data = (await bridgeReady)?.result && await deadline(bridge.send('VKWebAppGetLaunchParams'), 2000);
        if (!data?.sign) throw Object.assign(new Error('No VK launch parameters'), { status: 401 });
        launch = new URLSearchParams(Object.entries(data).filter(([key]) => key === 'sign' || key.startsWith('vk_')));
      }
      const session = await vkRequest('session', 'POST', { launch: launch.toString(), consent });
      cloud = await connectSave(session, chooseSave, syncStatus);
      storage = cloud.storage;
      Platform.player.authorized = true;
      if ((await bridgeReady)?.result) {
        Platform.features.ads = (await deadline(bridge.supportsAsync('VKWebAppShowNativeAds'), 1500).catch(() => false)) === true;
      }
    } catch (error) {
      const message = error.status === 401 ? 'Не удалось подтвердить вход. Закройте игру и снова откройте её из ВКонтакте.'
        : error.status === 503 ? 'Вход из ВКонтакте пока недоступен. Попробуйте позже.'
          : 'Не удалось загрузить сохранение из ВКонтакте. Проверьте соединение и попробуйте ещё раз.';
      loadingError(message);
      throw error;
    }
  },

  async removeData () {
    if (cloud) await cloud.remove();
    else for (const key of storage.keys()) storage.removeItem(key);
    try {
      if (consentScope) localStorage.removeItem('bird-vk:accepted:' + consentScope);
      localStorage.removeItem('bird-vk-crashlog');
      localStorage.removeItem('bird-vk-trans');
    } catch { /* Storage may be unavailable. */ }
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
