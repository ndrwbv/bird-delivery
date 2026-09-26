/* yandex: Яндекс Игры, SDK v2 (<script src="/sdk.js"> вставляет vite.config.js).
   Любой отказ SDK (нет скрипта, таймаут, ошибка) не роняет игру: она запускается
   как web без рекламы, сохранения — в localStorage, таблица — локальная.

   Таблица лидеров: в консоли разработчика создать лидерборд с ТЕХНИЧЕСКИМ именем
   `shift` (LB_NAME), тип «числовой», сортировка по убыванию, очки = деньги за смену.
   Без него setScore/getEntries отвечают ошибкой, и игра молча уходит на локальную. */
import { SUPPORTED_LANGS, LANG_KEY, mapLang, lsGet, lsSet, lsDump, localBoard, pauseHub, hardenPage, timeout } from './common.js';

export const LB_NAME = 'shift';

const INIT_MS = 8000;            // YaGames.init() дольше — играем без SDK
const SAVE_DEBOUNCE_MS = 3000;   // setData не чаще раза в 3 с (у SDK свой лимит запросов)
const AD_GAP_MS = 61000;         // полноэкранная не чаще раза в 60 с (SDK и сам отказывает)
const AD_WAIT_MS = 8000;         // реклама не открылась за это время — считаем, что её нет
const TS_KEY = 'dlv-__ts';       // когда менялись сохранения: у кого новее — тот и прав

let ysdk = null, ypl = null, have = SUPPORTED_LANGS;
const hub = pauseHub();

/* ── хранилище: синхронный кеш → localStorage сразу, облако с дебаунсом ── */

const cache = lsDump();
let dirty = false, saveT = 0, saving = null;

function pushCloud (now) {
  clearTimeout(saveT); saveT = 0;
  if (!ypl || !dirty) return saving || Promise.resolve();
  dirty = false;
  saving = Promise.resolve(ypl.setData({ ...cache }, !!now))
    .catch(e => { dirty = true; console.warn('[yandex] setData:', e); })
    .finally(() => { saving = null; });
  return saving;
}

const store = {
  get (k, d) { return k in cache && cache[k] !== undefined ? cache[k] : d; },
  set (k, v) {
    if (v === undefined) delete cache[k]; else cache[k] = v;
    cache[TS_KEY] = Date.now();
    lsSet(k, v); lsSet(TS_KEY, cache[TS_KEY]);
    dirty = true;
    if (!saveT) saveT = setTimeout(pushCloud, SAVE_DEBOUNCE_MS);
  },
  /** Отправить в облако сейчас (конец смены, покупка, уход со страницы). */
  flush () { dirty = dirty || !!saveT; return pushCloud(true); },
};

// облако и локальная копия: целиком берём более свежую, дыры добиваем из другой
async function loadCloud () {
  if (!ypl) return;
  let cloud = {};
  try { cloud = (await timeout(ypl.getData(), 5000, 'getData')) || {}; } catch (e) { console.warn('[yandex] getData:', e); return; }
  const local = { ...cache };
  const cloudNewer = (+cloud[TS_KEY] || 0) > (+local[TS_KEY] || 0);
  const merged = cloudNewer ? { ...local, ...cloud } : { ...cloud, ...local };
  for (const k of Object.keys(cache)) delete cache[k];
  Object.assign(cache, merged);
  for (const [k, v] of Object.entries(merged)) lsSet(k, v);
  if (!cloudNewer && JSON.stringify(cloud) !== JSON.stringify(merged)) { dirty = true; pushCloud(); }
}

addEventListener('visibilitychange', () => { if (document.hidden) store.flush(); });
addEventListener('pagehide', () => store.flush());

/* ── игрок ── */

const player = {
  name: '', avatar: '', authorized: false, id: '',
  /** Только по кнопке игрока («войти, чтобы попасть в таблицу»). → true, если вошёл. */
  async auth () {
    if (!ysdk || !ysdk.auth) return false;
    hub.pause('auth');
    try { await ysdk.auth.openAuthDialog(); } catch (e) { /* закрыл окно */ } finally { hub.resume('auth'); }
    await loadPlayer();
    await loadCloud();     // у вошедшего игрока своё облако — сливаем с тем, что наиграно
    return player.authorized;
  },
};

async function loadPlayer () {
  try {
    ypl = await timeout(ysdk.getPlayer({ scopes: false }), 5000, 'getPlayer');
    player.authorized = typeof ypl.isAuthorized === 'function' ? ypl.isAuthorized() : ypl.getMode() !== 'lite';
    player.name = (player.authorized && ypl.getName()) || '';
    player.avatar = (player.authorized && ypl.getPhoto('medium')) || '';
    player.id = ypl.getUniqueID ? ypl.getUniqueID() : '';
  } catch (e) { console.warn('[yandex] getPlayer:', e); }
}

/* ── таблица: новое API ysdk.leaderboards, иначе старое getLeaderboards() ── */

const local = localBoard(store, 'dlv-lb-local', () => player.name);
let lbApi = null;          // { set, entries, mine } под любую версию SDK
let lastScoreAt = 0;

async function loadBoards () {
  const n = ysdk.leaderboards;
  if (n && typeof n.setScore === 'function') {
    lbApi = {
      set: (s, x) => n.setScore(LB_NAME, s, x),
      entries: o => n.getEntries(LB_NAME, o),
      mine: () => n.getPlayerEntry(LB_NAME),
    };
  } else if (typeof ysdk.getLeaderboards === 'function') {
    const lb = await timeout(ysdk.getLeaderboards(), 5000, 'getLeaderboards');
    lbApi = {
      set: (s, x) => lb.setLeaderboardScore(LB_NAME, s, x),
      entries: o => lb.getLeaderboardEntries(LB_NAME, o),
      mine: () => lb.getLeaderboardPlayerEntry(LB_NAME),
    };
  }
}

const row = e => ({
  rank: e.rank,
  name: (e.player && e.player.publicName) || '',     // пусто — игрок скрыл имя; игра пишет «аноним»
  avatar: (e.player && e.player.getAvatarSrc && e.player.getAvatarSrc('small')) || '',
  score: e.score,
  level: (() => { try { return JSON.parse(e.extraData || '{}').level || 0; } catch (x) { return 0; } })(),
  me: !!player.id && !!e.player && e.player.uniqueID === player.id,
});

const leaderboard = {
  async submit (score, extra = {}) {
    score = Math.max(0, Math.round(+score || 0));
    await local.submit(score, extra);
    if (!lbApi || !player.authorized) return false;             // без входа setScore не работает
    const wait = 1100 - (Date.now() - lastScoreAt);            // лимит SDK — раз в секунду
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastScoreAt = Date.now();
    try { await timeout(lbApi.set(score, JSON.stringify({ level: extra.level || 0, delivered: extra.delivered || 0 }).slice(0, 128)), 8000, 'setScore'); return true; }
    catch (e) { console.warn('[yandex] setScore:', e); return false; }
  },
  /** Топ-n; если игрока в топе нет — его строка последней, с me: true. */
  async top (n = 10) {
    if (!lbApi) return local.top(n);
    try {
      const r = await timeout(lbApi.entries({ quantityTop: n, includeUser: player.authorized, quantityAround: player.authorized ? 1 : 0 }), 8000, 'getEntries');
      const all = (r.entries || []).map(row);
      const top = all.filter(e => e.rank <= n);
      const me = all.find(e => e.me && e.rank > n);
      return me ? top.concat(me) : top;
    } catch (e) { console.warn('[yandex] getEntries:', e); return local.top(n); }
  },
  async mine () {
    if (!lbApi || !player.authorized) return local.mine();
    try { const e = await timeout(lbApi.mine(), 8000, 'getPlayerEntry'); return e ? { rank: e.rank, score: e.score } : null; }
    catch (e) { return null; }        // LEADERBOARD_PLAYER_NOT_PRESENT — ещё не играл
  },
};

/* ── реклама: пауза на время показа, промис резолвится после закрытия ── */

let lastAdAt = 0, adBusy = false;

function runAd (method, onReward) {
  return new Promise(resolve => {
    let opened = false, done = false;
    const end = () => {
      if (done) return; done = true;
      clearTimeout(guard);
      hub.resume('ad');
      resolve();
    };
    const guard = setTimeout(() => { if (!opened) end(); }, AD_WAIT_MS);
    hub.pause('ad');
    try {
      ysdk.adv[method]({
        callbacks: {
          onOpen: () => { opened = true; clearTimeout(guard); },
          onRewarded: () => onReward && onReward(),
          onClose: () => end(),
          onError: e => { console.warn('[yandex] ' + method + ':', e); end(); },
          onOffline: () => end(),
        },
      });
    } catch (e) { console.warn('[yandex] ' + method + ':', e); end(); }
  });
}

/* ── разметка геймплея: во время паузы GameplayAPI.stop, после — снова start ── */

let wantPlay = false, playing = false;
const gp = on => {
  const api = ysdk && ysdk.features && ysdk.features.GameplayAPI;
  if (!api || on === playing) return;
  playing = on;
  try { on ? api.start() : api.stop(); } catch (e) { /* — */ }
};
hub.onPause(() => gp(false));
hub.onResume(() => gp(wantPlay));

/* ── сам объект ── */

const Platform = {
  id: 'yandex',
  lang: 'ru',
  features: { ads: false, leaderboard: 'local', externalLinks: false, nameInput: false, gore: false, quit: false },
  sdk: null,            // сырой ysdk — на крайний случай, игре лучше не трогать

  /** opts.langs — языки, для которых реально есть словари (по умолчанию SUPPORTED_LANGS). */
  async init (opts = {}) {
    if (Array.isArray(opts.langs) && opts.langs.length) have = opts.langs;
    hardenPage();
    hub.watchVisibility();
    if (!window.YaGames && import.meta.env.DEV) await import('./yandex-mock.js');   // npm run dev:yandex без прокси
    try {
      if (!window.YaGames) throw new Error('нет window.YaGames — /sdk.js не загрузился');
      ysdk = Platform.sdk = await timeout(window.YaGames.init(), INIT_MS, 'YaGames.init');
    } catch (e) {
      console.warn('[yandex] играем без SDK:', e.message || e);
      const saved = lsGet(LANG_KEY, '');
      Platform.lang = mapLang(have.includes(saved) ? saved : navigator.language, have);
      return Platform;
    }
    ysdk.on && ysdk.on('game_api_pause', () => hub.pause('sdk'));
    ysdk.on && ysdk.on('game_api_resume', () => hub.resume('sdk'));
    // язык: сам выбрал в меню → он; иначе язык Яндекса (так требует модерация)
    const saved = lsGet(LANG_KEY, '');
    Platform.lang = mapLang(have.includes(saved) ? saved : ysdk.environment && ysdk.environment.i18n && ysdk.environment.i18n.lang, have);
    Platform.features.ads = !!ysdk.adv;
    await Promise.all([
      loadPlayer().then(loadCloud),
      loadBoards().catch(e => console.warn('[yandex] таблица:', e)),
    ]);
    if (lbApi) Platform.features.leaderboard = 'remote';
    return Platform;
  },
  setLang (l) { Platform.lang = mapLang(l, have); store.set(LANG_KEY, Platform.lang); },

  /** Игра загрузилась и готова к вводу — снимает экран загрузки Яндекса. Один раз. */
  ready () {
    try { ysdk && ysdk.features && ysdk.features.LoadingAPI && ysdk.features.LoadingAPI.ready(); } catch (e) { /* — */ }
    Platform.ready = () => {};
  },
  /** Начало/конец активного геймплея: смена, не меню и не экран итогов. */
  gameplayStart () { wantPlay = true; if (!hub.paused) gp(true); },
  gameplayStop () { wantPlay = false; gp(false); },

  /** Между сменами. Чаще раза в 60 с не показываем, без SDK — мгновенно. */
  async showInterstitial () {
    if (!ysdk || !ysdk.adv || adBusy || Date.now() - lastAdAt < AD_GAP_MS) return;
    adBusy = true;
    try { await runAd('showFullscreenAdv'); } finally { lastAdAt = Date.now(); adBusy = false; }
  },
  /** Только по кнопке игрока «смотреть рекламу → награда». true — выдать награду. */
  async showRewarded () {
    if (!ysdk || !ysdk.adv || adBusy) return false;
    adBusy = true;
    let got = false;
    try { await runAd('showRewardedVideo', () => { got = true; }); } finally { adBusy = false; }
    return got;
  },

  onPause: hub.onPause,
  onResume: hub.onResume,
  get paused () { return hub.paused; },

  store,
  player,
  leaderboard,
  quit () {},
};

export default Platform;
