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
    gore: bool,                       // (устарело, см. adult)
    adult: bool,                      // можно взрослую версию 18+: Стим и web — да, Яндекс — только детская
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

Сброс прогресса (настройки → «сбросить прогресс», `resetProgress()` в game.js) идёт тоже через
`Platform.store`: каждому ключу прогресса `set(key, undefined)` (в Яндексе — `null`, чтобы пустая
локальная копия была новее облака и не «воскресла» при слиянии), потом `await flush()` (не дольше 4 с)
и перезагрузка. Что стирается и что остаётся — docs/CAREER.md, «Настройки и сброс прогресса».

## Что сверх контракта (web.js, yandex.js)

- `init({ langs })` — список языков, для которых есть словари; язык выбирается
  через `mapLang()` (`common.js`): неизвестный → `en`, `be/kk/uz/uk` без словаря → `ru`.
- `setLang(code)` — игрок сам выбрал язык, запоминается в `dlv-lang` и важнее языка площадки.
- `paused` — сейчас пауза от площадки. `onPause/onResume(cb)` получают причину:
  `'ad' | 'sdk' | 'hidden' | 'auth'`; вложенные паузы схлопываются (одна пара событий).
  Звук глушить в `onPause`, включать в `onResume`.
- `store` хранит значения JSON-ом: `get` возвращает числа/массивы/объекты, старые
  сырые строки из localStorage читаются как есть (`'1234'` → `1234`, `'Вася'` → `'Вася'`).
- `leaderboard.top(n)` в Яндексе: `name` бывает пустым (игрок скрыл имя) — писать «аноним»;
  если игрок вне топа, его строка идёт последней с `me: true`. `avatar` — URL или `''`.
- `gameplayStart/Stop` в Яндексе сами гасят `GameplayAPI` на время паузы и включают обратно.
- `showInterstitial()` в Яндексе не чаще раза в 60 с; без SDK — сразу резолвится.
- `yandex.js` в `init()` запрещает выделение текста, контекстное меню и перетаскивание
  (`hardenPage()` из `common.js`) — требование модерации.
- Таблица Яндекса: лидерборд с техническим именем `shift` (`LB_NAME`) создаётся в консоли руками.
- Проверка без Яндекса: `npm run dev:yandex` → заглушка `yandex-mock.js`
  (`?mock-auth`, `?mock-old-lb`, `?mock-noads`, `?mock-fail`, `?lang=de`).
