/* Заглушка SDK Яндекс Игр для `npm run dev:yandex`. Подключается из yandex.js,
   только в dev и только если window.YaGames нет (прокси sdk-dev-proxy не запущен).
   В сборку не попадает. Всё хранит в localStorage под ключами ya-mock-*.

   Параметры страницы:
     ?lang=de           — ysdk.environment.i18n.lang
     ?mock-auth         — игрок сразу авторизован (иначе lite, вход — через auth())
     ?mock-old-lb       — только старое API getLeaderboards(), без ysdk.leaderboards
     ?mock-noads        — реклама всегда onError
     ?mock-fail         — YaGames.init() никогда не резолвится (проверка таймаута)
   Сбросить всё: localStorage ключи ya-mock-* (cloud, lb, auth). */
(() => {
  if (window.YaGames) return;
  const q = new URLSearchParams(location.search);
  const LS = (k, d) => { try { const v = localStorage.getItem('ya-mock-' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const SS = (k, v) => { try { localStorage.setItem('ya-mock-' + k, JSON.stringify(v)); } catch (e) { /* — */ } };
  const later = (v, ms = 150) => new Promise(r => setTimeout(() => r(v), ms));
  const log = (...a) => console.info('%c[ya-mock]', 'color:#fc0', ...a);
  if (q.has('mock-auth')) SS('auth', true);

  const listeners = {};
  const emit = ev => (listeners[ev] || []).forEach(f => f());

  const overlay = (text, ms) => new Promise(res => {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;'
      + 'background:rgba(20,10,0,.9);color:#fc0;font:16px/1.4 monospace;text-align:center;white-space:pre';
    document.body.appendChild(el);
    setTimeout(() => { el.remove(); res(); }, ms);
  });

  let lastFs = 0;
  const adv = {
    showFullscreenAdv ({ callbacks: cb = {} } = {}) {
      if (q.has('mock-noads')) return setTimeout(() => cb.onError && cb.onError(new Error('mock: нет рекламы')), 100);
      if (Date.now() - lastFs < 60000) { log('fullscreen: рано, onClose(false)'); return setTimeout(() => cb.onClose && cb.onClose(false), 50); }
      lastFs = Date.now();
      emit('game_api_pause'); cb.onOpen && cb.onOpen();
      overlay('Яндекс: полноэкранная реклама\n(mock, 1.5 с)', 1500).then(() => { cb.onClose && cb.onClose(true); emit('game_api_resume'); });
    },
    showRewardedVideo ({ callbacks: cb = {} } = {}) {
      if (q.has('mock-noads')) return setTimeout(() => cb.onError && cb.onError(new Error('mock: нет рекламы')), 100);
      emit('game_api_pause'); cb.onOpen && cb.onOpen();
      overlay('Яндекс: видео за награду\n(mock, 1.5 с)', 1500).then(() => { cb.onRewarded && cb.onRewarded(); cb.onClose && cb.onClose(); emit('game_api_resume'); });
    },
    showBannerAdv: () => later({ stickyAdvIsShowing: false }),
    hideBannerAdv: () => later({ stickyAdvIsShowing: false }),
  };

  const ID = 'mock-player-1';
  const authed = () => !!LS('auth', false);
  const mkPlayer = () => ({
    getMode: () => (authed() ? '' : 'lite'),
    isAuthorized: () => authed(),
    getName: () => (authed() ? 'Тестовый Игрок' : ''),
    getPhoto: () => '',
    getUniqueID: () => ID,
    getData: keys => later(keys ? Object.fromEntries(keys.map(k => [k, LS('cloud', {})[k]])) : LS('cloud', {})),
    setData: (data, flush) => { log('setData', flush ? '(flush)' : '', Object.keys(data).length + ' ключей'); SS('cloud', data); return later(); },
    getStats: () => later(LS('stats', {})),
    setStats: s => { SS('stats', s); return later(); },
  });

  // таблица: [{ id, name, score, extraData }]
  const board = () => LS('lb', [
    { id: 'bot-1', name: 'Курьер Петя', score: 4200, extraData: '{"level":7}' },
    { id: 'bot-2', name: '', score: 1800, extraData: '{"level":3}' },
  ]);
  const entry = (r, i) => ({
    rank: i + 1, score: r.score, formattedScore: String(r.score), extraData: r.extraData,
    player: { publicName: r.name, uniqueID: r.id, lang: 'ru', getAvatarSrc: () => '', scopePermissions: {} },
  });
  const sorted = () => board().slice().sort((a, b) => b.score - a.score);
  const noAuth = () => Promise.reject(Object.assign(new Error('mock: нужен вход'), { code: 'NOT_AUTHORIZED' }));
  const lb = {
    setScore (name, score, extraData) {
      if (!authed()) return noAuth();
      log('setScore', name, score, extraData);
      const l = board().filter(r => r.id !== ID);
      const old = board().find(r => r.id === ID);
      l.push(old && old.score > score ? old : { id: ID, name: 'Тестовый Игрок', score, extraData: extraData || '' });
      SS('lb', l); return later();
    },
    getEntries (name, o = {}) {
      const s = sorted().map(entry);
      const top = s.slice(0, o.quantityTop || 5);
      const me = s.find(e => e.player.uniqueID === ID);
      const entries = o.includeUser && authed() && me && !top.includes(me) ? top.concat(me) : top;
      return later({ leaderboard: { name }, ranges: [], userRank: me ? me.rank : 0, entries });
    },
    getPlayerEntry () {
      if (!authed()) return noAuth();
      const me = sorted().map(entry).find(e => e.player.uniqueID === ID);
      return me ? later(me) : Promise.reject(Object.assign(new Error('нет записи'), { code: 'LEADERBOARD_PLAYER_NOT_PRESENT' }));
    },
    getDescription: name => later({ name, title: { ru: 'Смена' }, description: { score_format: { type: 'numeric' }, invert_sort_order: false } }),
  };

  const ysdk = {
    environment: { app: { id: 'mock' }, i18n: { lang: q.get('lang') || 'ru', tld: 'ru' }, payload: q.get('payload') || null },
    deviceInfo: { type: /Mobi/.test(navigator.userAgent) ? 'mobile' : 'desktop', isMobile: () => /Mobi/.test(navigator.userAgent) },
    features: {
      LoadingAPI: { ready: () => log('LoadingAPI.ready()') },
      GameplayAPI: { start: () => log('GameplayAPI.start()'), stop: () => log('GameplayAPI.stop()') },
    },
    on: (ev, f) => { (listeners[ev] = listeners[ev] || []).push(f); },
    off: (ev, f) => { listeners[ev] = (listeners[ev] || []).filter(x => x !== f); },
    adv,
    auth: {
      openAuthDialog: () => overlay('Яндекс: вход (mock)\nигрок авторизован', 800).then(() => { SS('auth', true); log('вошёл'); }),
    },
    getPlayer: () => later(mkPlayer()),
    serverTime: () => Date.now(),
    isAvailableMethod: m => later(!m.startsWith('leaderboards') || authed()),
  };
  if (!q.has('mock-old-lb')) ysdk.leaderboards = lb;
  ysdk.getLeaderboards = () => later({
    setLeaderboardScore: lb.setScore, getLeaderboardEntries: lb.getEntries,
    getLeaderboardPlayerEntry: lb.getPlayerEntry, getLeaderboardDescription: lb.getDescription,
  });

  window.YaGames = { init: () => (q.has('mock-fail') ? new Promise(() => {}) : later(ysdk, 300)) };
  log('подключён: window.YaGames — заглушка');
})();
