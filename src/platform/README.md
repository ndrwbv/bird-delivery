# Платформенный слой

Игра (`src/game/*`) ничего не знает о Яндексе, Стиме и Электроне. Всё, что зависит
от площадки, идёт через объект `Platform` (`src/platform/index.js`), который
выбирается при сборке по `import.meta.env.MODE`:

| режим | файл | где живёт |
|---|---|---|
| `web` (dev) | `web.js` | локальный запуск, `npm run dev` |
| `yandex` | `yandex.js` | Яндекс Игры, SDK v2 (`/sdk.js`) |
| `steam` | `steam.js` | Electron-оболочка из `electron/`, мост `window.birdSteam` из `preload.cjs` |

## Контракт

```js
Platform = {
  id: 'web' | 'yandex' | 'steam',
  lang: 'ru',                         // язык после init(): из SDK / системы / сохранённый
  features: {
    ads: bool,                        // есть полноэкранная и видеореклама
    leaderboard: 'remote' | 'local',  // таблица площадки или локальная
    externalLinks: bool,              // можно ли ссылки наружу (в Яндексе — нельзя)
    nameInput: bool,                  // спрашивать имя (в Яндексе имя берём из профиля)
    gore: bool,                       // кровь по умолчанию (в Яндексе выключена)
    quit: bool,                       // есть кнопка «выйти из игры» (Стим)
  },
  async init(),                       // до загрузки игры: SDK, язык, облачные сохранения
  ready(),                            // игра загрузилась и её можно показывать (LoadingAPI.ready)
  gameplayStart(), gameplayStop(),    // разметка геймплея (GameplayAPI)
  async showInterstitial(),           // полноэкранная реклама; резолвится после закрытия
  async showRewarded(),               // видео за награду → true, если награду надо выдать
  onPause(cb), onResume(cb),          // площадка сама ставит паузу (реклама, свернули вкладку)
  store: { get(key, def), set(key, value), flush() },   // синхронный кеш + облако
  player: { name, avatar, authorized, async auth() },
  leaderboard: {
    async submit(score, extra),       // extra: { delivered, level } — что влезет
    async top(n),                     // → [{ rank, name, score, level, me }]
    async mine(),                     // → { rank, score } | null
  },
  quit(),
}
```

Сохранения: все ключи игры (`dlv-*`) идут через `Platform.store`. В `web` и
`steam` это `localStorage` (в Электроне он и так лежит в `userData`). В
`yandex` — `player.setData` c дебаунсом плюс копия в `localStorage` на случай,
если SDK не ответил.
