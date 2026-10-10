/* web: локальный запуск и отладка. Всё в localStorage, реклама — плашка-заглушка,
   таблица — лучшие смены на этом устройстве. Язык: ?lang= → выбор игрока → браузер. */
import { SUPPORTED_LANGS, LANG_KEY, mapLang, localStore, localBoard, pauseHub, fakeAd } from './common.js';

const store = localStore();
const hub = pauseHub();
let have = SUPPORTED_LANGS;

const player = {
  get name () { return store.get('dlv-name', '') || ''; },
  avatar: '',
  authorized: false,
  async auth () { return false; },
};

const Platform = {
  id: 'web',
  lang: 'ru',
  features: { ads: false, leaderboard: 'local', externalLinks: true, nameInput: true, gore: true, adult: true, quit: false },   // реклама — только в Яндексе (автор 10.10.2026), в браузере её нет совсем

  /** opts.langs — языки, для которых реально есть словари (по умолчанию SUPPORTED_LANGS). */
  async init (opts = {}) {
    if (Array.isArray(opts.langs) && opts.langs.length) have = opts.langs;
    const q = new URLSearchParams(location.search).get('lang');
    const saved = store.get(LANG_KEY, '');
    Platform.lang = mapLang(q || (have.includes(saved) ? saved : '') || navigator.language, have);
    Platform.langChosen = !!q || have.includes(saved);   // нет — при первом запуске спросим (main.js)
    hub.watchVisibility();
    return Platform;
  },
  /** Игрок сам выбрал язык в меню — запоминаем. */
  setLang (l) { Platform.lang = mapLang(l, have); store.set(LANG_KEY, Platform.lang); },

  ready () {},
  gameplayStart () {},
  gameplayStop () {},

  async showInterstitial () {
    hub.pause('ad');
    await fakeAd('реклама (заглушка)');
    hub.resume('ad');
  },
  async showRewarded () {
    hub.pause('ad');
    await fakeAd('реклама за награду (заглушка)');
    hub.resume('ad');
    return true;
  },

  onPause: hub.onPause,
  onResume: hub.onResume,
  get paused () { return hub.paused; },

  store,
  player,
  leaderboard: localBoard(store, 'dlv-lb-local', () => player.name),
  quit () {},
};

export default Platform;
