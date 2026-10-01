/* steam: Electron-оболочка из electron/, мост window.birdSteam из preload.cjs.
   Рекламы нет, таблица — локальная (лучшие смены на этом ПК), ссылки наружу выключены,
   кнопка «выйти из игры» есть. Без моста (обычный браузер, `vite --mode steam`) всё работает
   на заглушках — так режим можно гонять без Электрона.
   Язык: выбор игрока → язык игры в Steam → системный → en. */
import { SUPPORTED_LANGS, LANG_KEY, mapLang, localStore, localBoard, pauseHub } from './common.js';

const bridge = typeof window !== 'undefined' ? window.birdSteam : undefined;
const sw = (bridge && bridge.steam) || { available: false, deck: false, launched: false, lang: '', name: '' };
const store = localStore();
const hub = pauseHub();
let have = SUPPORTED_LANGS;

// Steam отдаёт язык словом (API language code), не ISO
const STEAM_LANGS = {
  russian: 'ru', english: 'en', turkish: 'tr', german: 'de', spanish: 'es', latam: 'es',
  portuguese: 'pt', brazilian: 'pt', french: 'fr', italian: 'it', polish: 'pl', ukrainian: 'uk',
  japanese: 'ja', schinese: 'zh', tchinese: 'zh',
};

const player = {
  // имя из поля ввода игры; пока не ввёл — ник в Steam
  get name () { return store.get('dlv-name', '') || sw.name || ''; },
  avatar: '',
  get authorized () { return !!sw.available; },
  async auth () { return !!sw.available; },
};

const noop = async () => false;

const Platform = {
  id: 'steam',
  lang: 'en',
  features: { ads: false, leaderboard: 'local', externalLinks: false, nameInput: true, gore: true, adult: true, quit: true },

  /** opts.langs — языки, для которых реально есть словари (по умолчанию SUPPORTED_LANGS). */
  async init (opts = {}) {
    if (Array.isArray(opts.langs) && opts.langs.length) have = opts.langs;
    const saved = store.get(LANG_KEY, '');
    const fromSteam = STEAM_LANGS[sw.lang] || '';
    Platform.lang = mapLang((have.includes(saved) ? saved : '') || fromSteam || navigator.language, have);
    Platform.langChosen = have.includes(saved);   // нет — при первом запуске спросим (main.js)
    hub.watchVisibility();
    // окно потеряло фокус (Alt+Tab, оверлей Steam, кнопка STEAM на Deck) — тоже пауза
    addEventListener('blur', () => hub.pause('blur'));
    addEventListener('focus', () => hub.resume('blur'));
    return Platform;
  },
  /** Игрок сам выбрал язык в меню — запоминаем. */
  setLang (l) { Platform.lang = mapLang(l, have); store.set(LANG_KEY, Platform.lang); },

  ready () {},
  gameplayStart () {},
  gameplayStop () {},
  async showInterstitial () {},
  async showRewarded () { return false; },

  onPause: hub.onPause,
  onResume: hub.onResume,
  get paused () { return hub.paused; },

  store,
  player,
  leaderboard: localBoard(store, 'dlv-lb-local', () => player.name),
  quit () { if (bridge) bridge.quit(); else window.close(); },

  /* ── сверх контракта: только Steam, игра проверяет Platform.steam?.available ── */
  steam: {
    available: !!sw.available,
    deck: !!sw.deck,
    launched: !!sw.launched,
    achievement: id => (bridge ? bridge.steam.achievement(id) : noop()),
    getStat: name => (bridge ? bridge.steam.getStat(name) : Promise.resolve(null)),
    setStat: (name, v) => (bridge ? bridge.steam.setStat(name, v) : noop()),
    richPresence: (k, v) => (bridge ? bridge.steam.richPresence(k, v) : noop()),
    /** Экранная клавиатура Steam для поля имени. null — отменили или Steam недоступен
        (тогда остаётся обычное поле ввода). */
    textInput: (desc, max = 24, text = '') => (bridge && sw.available ? bridge.steam.textInput(desc, max, text) : Promise.resolve(null)),
  },
  /** Оболочка: версия, обновления, полный экран. В браузере — пустышки. */
  shell: {
    info: () => (bridge ? bridge.info() : Promise.resolve({ tag: '', updatable: false, steam: false })),
    checkUpdate: manual => (bridge ? bridge.checkUpdate(manual) : Promise.resolve({ state: 'off' })),
    setFullscreen: on => {
      if (bridge) return bridge.setFullscreen(on);
      try { return on ? document.documentElement.requestFullscreen() : document.exitFullscreen(); } catch (e) { return Promise.resolve(false); }
    },
    isFullscreen: () => (bridge ? bridge.isFullscreen() : Promise.resolve(!!document.fullscreenElement)),
  },
};

export default Platform;
