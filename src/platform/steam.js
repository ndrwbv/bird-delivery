/* steam: Electron-оболочка из electron/, мост window.birdSteam из preload.cjs.
   Рекламы нет, ссылки наружу выключены, кнопка «выйти из игры» есть. Без моста (обычный
   браузер, `vite --mode steam`) всё работает на заглушках — так режим можно гонять без Электрона.
   Таблица рекордов: таблица Стима BEST_SHIFT (лучшая смена, docs/STEAM.md §4.2), копия всегда
   пишется и в локальную; Стим не запущен или не ответил — локальная (лучшие смены на этом ПК).
   ?mock-steam (только без настоящего моста, для проверки в probe) — подделка моста: steam-mock.js.
   Язык: выбор игрока → язык игры в Steam → системный → en. */
import { SUPPORTED_LANGS, LANG_KEY, mapLang, localStore, localBoard, pauseHub, timeout } from './common.js';

const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const bridge = typeof window === 'undefined' ? undefined
  : window.birdSteam || (Q.has('mock-steam') ? (await import('./steam-mock.js')).mockBridge(Q.get('mock-steam')) : undefined);
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

/* ── таблицы лидеров Стима: имя таблицы — как в Steamworks; null — Стим не ответил ── */
export const LB_NAME = 'BEST_SHIFT';
const LB_WAIT = 15000;
const lbOn = () => !!(bridge && sw.available && sw.lb && bridge.steam.lbEntries);
const lbAsk = (what, p) => timeout(p, LB_WAIT, what).then(r => r ?? null, e => { console.warn('[steam] таблица:', e && e.message); return null; });
// строка Стима → строка игры (как у localBoard): details = [заказов, уровень]
const lbRow = r => ({ rank: r.rank, name: r.name || '', score: r.score, delivered: (r.details && r.details[0]) || 0, level: (r.details && r.details[1]) || 0, me: !!r.me });
const lbRows = rows => (Array.isArray(rows) ? rows.map(lbRow) : null);
const steamBoard = {
  get available () { return lbOn(); },
  /** лучший результат (Стим оставляет лучший) → { ok, score, changed, rank, prev } | null */
  upload: (name, score, details = []) => (lbOn() ? lbAsk('upload', bridge.steam.lbUpload(name, Math.max(0, Math.round(+score || 0)), details)) : Promise.resolve(null)),
  /** места 1…n во всём мире */
  top: (name, n = 10) => (lbOn() ? lbAsk('top', bridge.steam.lbEntries(name, 'global', 1, Math.max(1, n))).then(lbRows) : Promise.resolve(null)),
  /** друзья в Стиме (и ты), места — среди всех */
  friends: name => (lbOn() ? lbAsk('friends', bridge.steam.lbEntries(name, 'friends', 0, 0)).then(lbRows) : Promise.resolve(null)),
  /** ты и n соседей сверху и снизу; [] — тебя ещё нет в таблице */
  around: (name, n = 2) => (lbOn() ? lbAsk('around', bridge.steam.lbEntries(name, 'around', -n, n)).then(lbRows) : Promise.resolve(null)),
};

/* Контракт Platform.leaderboard (game.js LB, Москва): Стим, а без него — локальная */
const local = localBoard(store, 'dlv-lb-local', () => player.name);
const leaderboard = {
  /** последний ответ Стима на отправку — для экрана итогов */
  last: null,
  async submit (score, extra = {}) {
    score = Math.max(0, Math.round(+score || 0));
    await local.submit(score, extra);
    leaderboard.last = null;
    if (!lbOn()) return true;                      // без Стима таблица — локальная, туда записали
    const r = await steamBoard.upload(LB_NAME, score, [extra.delivered || 0, extra.level || 0]);
    leaderboard.last = r;
    return !!(r && r.ok);
  },
  /** топ-n; тебя в топе нет — твоя строка последней (me: true) */
  async top (n = 10) {
    if (!lbOn()) return local.top(n);
    const top = await steamBoard.top(LB_NAME, n);
    if (!top) return local.top(n);
    if (top.some(r => r.me)) return top;
    const me = ((await steamBoard.around(LB_NAME, 0)) || []).find(r => r.me);
    return me ? top.concat(me) : top;
  },
  async mine () {
    if (!lbOn()) return local.mine();
    const me = ((await steamBoard.around(LB_NAME, 0)) || []).find(r => r.me);
    return me ? { rank: me.rank, score: me.score } : local.mine();
  },
  /** сверх контракта: друзья (только Стим) → строки | null */
  friends: () => steamBoard.friends(LB_NAME),
  local,
};

const Platform = {
  id: 'steam',
  lang: 'en',
  features: { ads: false, leaderboard: lbOn() ? 'remote' : 'local', externalLinks: false, nameInput: true, gore: true, adult: true, quit: true },

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
  leaderboard,
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
    /** Таблицы лидеров Стима: upload(name, score, details), top(name, n), friends(name),
        around(name, n). Ответ null — Стим не запущен или не ответил: берите Platform.leaderboard
        (он сам падает на локальную). */
    leaderboard: steamBoard,
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
