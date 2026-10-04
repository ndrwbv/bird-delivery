/* Подделка моста Стима (window.birdSteam из electron/preload.cjs) — для проверки без Стима:
   npm run probe -- --mode=steam --q=mock-steam ...  Включается в steam.js только по ?mock-steam
   и только когда настоящего моста нет (в Электроне игры он есть всегда).

     ?mock-steam        Стим есть, таблицы работают: 30 игроков в мире, трое из них — друзья
     ?mock-steam=nolb   Стим есть, таблиц нет (koffi не поднялся) — игра берёт локальную
     ?mock-steam=fail   таблицы есть, но Стим не отвечает (null) — тоже локальная
     ?mock-steam=deck   как на Steam Deck (экранная клавиатура по фокусу поля): большая клавиатура
                        сразу возвращается пустой (не поднялась), плавающая — 'float'
     ?mock-steam=deck-hang   большая клавиатура не отвечает никогда (Стим её «открыл», но её нет)
     ?mock-steam=deck-text   большая клавиатура вернула текст «Вася Пупкин»

   ?mock-update=v9.9.9 — вышла новая версия (плашка «обновить» в меню); textInput и floatKeyboard
   (экранная клавиатура) тоже пишутся в calls.
   Все вызовы пишутся в window.__steamMock.calls: [имя, ...аргументы]. */
export function mockBridge (mode = '') {
  const calls = [];
  const me = { steamId: '76561198000000002', name: 'Я из Стима' };
  const world = Array.from({ length: 30 }, (_, i) => ({
    steamId: String(76561198000000100n + BigInt(i)), name: 'Игрок ' + (i + 1), score: 300000 - i * 9000, details: [40 - i, 5 - Math.floor(i / 8)],
  }));
  const FRIENDS = new Set([world[2].steamId, world[11].steamId, world[25].steamId]);
  const mine = {};                                   // таблица → { score, details } — лучшая смена игрока
  const list = name => {
    const l = world.slice();
    if (mine[name]) l.push({ ...me, ...mine[name] });
    l.sort((a, b) => b.score - a.score);
    return l.map((r, i) => ({ ...r, rank: i + 1, me: r.steamId === me.steamId, details: r.details.slice() }));
  };
  const later = v => new Promise(r => setTimeout(() => r(v), 30));
  const log = (...a) => { calls.push(a); return a; };
  const steam = {
    available: true, deck: /deck/.test(mode), launched: true, lang: 'russian', name: me.name,
    achievement: id => (log('achievement', id), later(true)),
    achieved: id => (log('achieved', id), later(false)),
    clearAchievement: id => (log('clearAchievement', id), later(true)),
    getStat: n => (log('getStat', n), later(null)),
    setStat: (n, v) => (log('setStat', n, v), later(true)),
    richPresence: (k, v) => (log('richPresence', k, v), later(true)),
    textInput: (...a) => (log('textInput', ...a), /hang/.test(mode) ? new Promise(() => {}) : later(/text/.test(mode) ? 'Вася Пупкин' : null)),
    lb: mode !== 'nolb',
    lbUpload (name, score, details) {
      log('lbUpload', name, score, details);
      if (mode === 'fail') return later(null);
      const prev = (list(name).find(r => r.me) || {}).rank || 0;
      const changed = !mine[name] || score > mine[name].score;
      if (changed) mine[name] = { score, details: (details || []).slice() };
      const rank = list(name).find(r => r.me).rank;
      return later({ ok: true, score, changed, rank, prev });
    },
    lbEntries (name, kind, from, to) {
      log('lbEntries', name, kind, from, to);
      if (mode === 'fail') return later(null);
      const l = list(name);
      if (kind === 'global') return later(l.filter(r => r.rank >= from && r.rank <= to));
      if (kind === 'friends') return later(l.filter(r => r.me || FRIENDS.has(r.steamId)));
      if (kind === 'around') {
        const i = l.findIndex(r => r.me);
        return later(i < 0 ? [] : l.slice(Math.max(0, i + from), i + to + 1));
      }
      return later(null);
    },
  };
  const off = async () => false;
  /* обновление: ?mock-update=v9.9.9 — вышла новая (кнопка «обновить» в меню), без него — стоит последняя */
  const Q = new URLSearchParams(location.search), upd = Q.get('mock-update');
  const cur = 'v0.4.0';
  let onUpd = null;
  const bridge = {
    info: async () => ({ tag: cur, updatable: !!upd, steam: true }),
    checkUpdate: async () => ({ state: 'off' }),
    latestUpdate: async force => (log('latestUpdate', !!force), later(upd ? { state: 'newer', current: cur, latest: upd, updatable: true, platform: 'linux' } : { state: 'fresh', current: cur, latest: cur, updatable: true, platform: 'linux' })),
    applyUpdate: async () => { log('applyUpdate'); if (onUpd) setTimeout(() => onUpd({ stage: 'download', p: 0.4 }), 30); return true; },
    onUpdate: cb => { onUpd = cb; },
    floatKeyboard: (...a) => (log('floatKeyboard', ...a), later('float')),
    quit: off,
    setFullscreen: off, isFullscreen: off, log () {}, logDir: async () => '', openLogs: off,
    steam,
  };
  window.__steamMock = { mode, calls, mine, me, bridge };
  return bridge;
}
