# Steam и Steam Deck

Steam-бандл — это `vite build --mode steam` (→ `dist/steam`) внутри Electron-оболочки
`electron/`. Платформенный слой — `src/platform/steam.js`, мост в Electron — `window.birdSteam`
из `electron/preload.cjs`. Рекламы нет, таблица лидеров локальная, есть «выйти из игры».

## 1. Сборка

| команда | что получается |
| --- | --- |
| `npm run electron` | собрать `dist/steam` и открыть в Электроне (`-- --windowed --log`) |
| `npm run dist:deck` | `release/linux-unpacked/` + `release/bird-pizza-deck.tar.gz` |
| `npm run dist:win` | `release/BirdPizza-*.zip` (собирать на Windows, см. ниже) |
| `npm run dist:mac` | `release/mac*/BirdPizza.app` — только для проверки |

Флаги запуска: `--windowed`, `--log`, `--page=pad.html` (диагностика геймпада), `--steam`,
`--no-update`, `--steam-overlay`. `F11` / `Alt+Enter` — полный экран.

**CI:** [.github/workflows/release.yml](../.github/workflows/release.yml), ручной запуск
(Actions → «Релиз»). Linux собирается на ubuntu, Windows — на windows-раннере (правка иконки
и версии `.exe` на Linux требует wine). В гит-релиз идут `bird-pizza-deck.tar.gz`,
`bird-pizza-win.zip`, `install-deck.sh`; отдельно артефактом — zip для Яндекс Игр.

**Сначала надо создать репозиторий релизов** `ndrwbv/bird-delivery` (уже создан; если сменится — поменять константу
`REPO` в `electron/main.cjs` и `tools/install-deck.sh`). Автообновление читает
`/releases/latest` оттуда, установщик качается с `raw.githubusercontent.com/<REPO>/main/tools/`.
Если репозиторий приватный — обновления и `curl | bash` работать не будут.

**Иконки** — пока нет, `.exe` получит иконку Электрона. Положить `build/icon.ico` (256×256)
и `build/icon.png` (512×512): electron-builder подхватит их сам. Для ярлыка на Deck
`install-deck.sh` ищет `resources/icon.png` — добавить в `build.extraResources`
`{ "from": "build/icon.png", "to": "icon.png" }`.

## 2. Steamworks: разово

1. Партнёрский аккаунт <https://partner.steamgames.com>, взнос Steam Direct (сейчас 100 $,
   возвращается после 1000 $ выручки), налоговая форма и банк. Суммы и сроки сверять на сайте.
2. Создать приложение → **App ID**. Положить его в `steam_appid.txt` в корне репозитория
   (только для локального запуска мимо Steam; в депот этот файл **не** класть) или в env
   `STEAM_APP_ID`.
3. **SteamPipe → Depots**: два депота — `<appid>+1` Windows, `<appid>+2` Linux, у каждого своя ОС.
4. **Installation → Launch Options**, по строке на платформу:

   | ОС | Executable | Arguments |
   | --- | --- | --- |
   | Windows | `BirdPizza.exe` | `--steam` |
   | Linux (SteamOS) | `bird-pizza.sh` | `--steam` |

   `--steam` выключает автообновление с GitHub (Steam обновляет сам). Без него оболочка
   определяет Steam по `SteamAppId`/`SteamGameId`, но явный флаг надёжнее.
   Linux-сборка нативная — Proton не нужен, и это плюс к Deck Verified.
5. **Steam Cloud** (App Admin → Cloud): квота ~10 МБ, файлов ~100. Сохранения — это
   localStorage Электрона в `userData` (путь закреплён в `main.cjs`, от productName не зависит).
   Root Overrides по ОС:

   | ОС | корень | подпуть |
   | --- | --- | --- |
   | Windows | `WinAppDataRoaming` | `BirdPizza/Local Storage` |
   | Linux | `LinuxHome` | `.config/BirdPizza/Local Storage` |
   | macOS | `MacAppSupport` | `BirdPizza/Local Storage` |

   Паттерн `*`, рекурсивно. Внутри — LevelDB (несколько файлов), синк работает, но конфликт
   двух машин решается «кто последний», слияния нет. Надёжнее позже писать сохранения одним
   JSON-файлом через steamworks.js `cloud.writeFile` — это TODO.
6. Страница магазина: описание, скриншоты, трейлер, возрастной рейтинг — в игре кровь и
   сбитые прохожие (`features.gore: true`), указать честно.

## 3. Заливка: SteamPipe

Steamworks SDK → `tools/ContentBuilder`. `scripts/app_build.vdf`:

```
"appbuild"
{
  "appid" "<APPID>"
  "desc"  "Bird Pizza <тег>"
  "buildoutput" "..\\output\\"
  "contentroot" "..\\content\\"
  "setlive" ""
  "depots" { "<APPID+1>" "depot_win.vdf"  "<APPID+2>" "depot_linux.vdf" }
}
```

`depot_linux.vdf` (Windows — то же со своим id и папкой):

```
"DepotBuild"
{
  "DepotID" "<APPID+2>"
  "contentroot" "..\\content\\linux\\"
  "FileMapping" { "LocalPath" "*" "DepotPath" "." "recursive" "1" }
  "FileExclusion" "steam_appid.txt"
}
```

В `content/linux/` — содержимое `linux-unpacked/` из `bird-pizza-deck.tar.gz` (вместе с
`bird-pizza.sh`; метки `.github-install` там нет — её ставит только установщик).
В `content/win/` — распакованный `bird-pizza-win.zip`. Дальше:

```bash
steamcmd +login <билд-аккаунт> +run_app_build ../scripts/app_build.vdf +quit
```

Steamworks → **Builds** → выкатить на ветку `beta`, проверить на Windows и Deck, потом `default`.

## 4. Steamworks в игре (steamworks.js)

Подключён **необязательной** зависимостью (`optionalDependencies`, prebuilt под win/linux/mac,
`asarUnpack` в package.json). `main.cjs` грузит его в `try/catch`: нет модуля, нет Steam или
App ID — игра идёт без достижений. Что проброшено в рендерер:

```js
Platform.steam.available                // Steam поднялся
Platform.steam.deck                     // Steam Deck
Platform.steam.achievement('FIRST_ORDER')
Platform.steam.setStat('orders', 42)    // int-статы, сразу store()
Platform.steam.getStat('orders')
Platform.steam.textInput('Имя', 24, '') // экранная клавиатура → строка | null
Platform.shell.info() / checkUpdate(manual) / setFullscreen(on)
```

Язык: выбор игрока (`dlv-lang`) → язык игры в Steam (`apps.currentGameLanguage`) → системный → en.
Имя игрока: `dlv-name`, пока не введено — ник в Steam.

TODO: завести достижения в Steamworks (App Admin → Stats & Achievements) и расставить вызовы
в игре; ID — латиницей, те же, что в админке.

## 5. Steam Deck Verified — что проверить

* **Только контроллер.** Вся игра — заставка, выбор машины, магазин, пауза, обед, карточки
  клиентов, карта — проходится с геймпада (`src/input/gamepad.js` + `padmenu.js`).
  Подсветка выбранного пункта — класс `.padsel`. Нигде не требуется тач или мышь.
* **Глифы.** Подсказки на экране при игре с геймпада должны показывать кнопки геймпада,
  а не `W`/`Shift`/`Tab` (гайд `#guide` — сейчас клавиатура и тач). TODO.
* **Текст при 1280×800.** Минимум ~9 px по высоте строчной буквы на экране Deck'а. Проверить
  адреса в HUD (`#addr`), реплики в карточке выбора, строки таблицы, подписи магазина.
* **Экранная клавиатура для имени.** Поле `#st-name`: по A вызывать
  `Platform.steam.textInput('Как тебя зовут', 24, текущее)` и подставить результат. Если
  вернулось `null` (не Big Picture / нет Steam) — либо фокус в поле (Steam сам поднимет
  клавиатуру по STEAM+X), либо на Deck брать ник из Steam и не спрашивать имя вовсе
  (`Platform.player.name` уже так и делает, пока `dlv-name` пуст).
* **Раскладка по умолчанию.** Опубликовать официальную Steam Input-раскладку «Gamepad»;
  без неё сторонняя раскладка «Gamepad with Mouse Trackpad» тоже работает.
* **Пауза при выходе в меню Steam** — `onPause` срабатывает на blur окна и скрытие вкладки.
* **Производительность:** 60 fps при 1280×800 на Deck, иначе — понижать pixel ratio.
* **Выход:** есть `Platform.quit()` (`features.quit`) — кнопка «выйти из игры» в меню.

## 6. Чего Electron не умеет

* **Оверлей Steam** (Shift+Tab) с Chromium обычно не работает: оверлей хукает графику в
  процессе игры, а Electron рисует в отдельном GPU-процессе. Нет оверлея — нет скриншотов
  Steam, браузера и приглашений поверх игры. `--steam-overlay` пробует
  `electronEnableSteamOverlay()` из steamworks.js (in-process-gpu + перерисовка каждый кадр) —
  на Windows иногда помогает, может стоить fps. Для Verified оверлей не обязателен.
  `showGamepadTextInput` работает без оверлея только в Big Picture / на Deck.
* **Steam Input** работает: Deck и любые геймпады приходят через Gamepad API.

## 7. Раскладка геймпада

| кнопка | в езде | в меню |
| --- | --- | --- |
| левый стик | руль (аналог, мёртвая зона 12 %, кривая 1.6) | выбор |
| RT | газ (аналог) | — |
| LT | тормоз, на месте — назад | — |
| A | ручник | нажать, «принять» заказ |
| B | ручник | назад |
| X или RB | нитро (держать) | — |
| Y, Back/View | карта района | закрыть карту |
| Start | пауза | продолжить |
| крестовина ← ↑ → | ответ 1 / 2 / 3 на карточке клиента | выбор |
| R3 | звук вкл/выкл | — |

Разбираются стандартная раскладка и «сырая» (запуск мимо Steam из десктоп-режима Deck'а).
Отдача на аварии — `rumble(strength, ms)`. Проверить, что приезжает: `--page=pad.html`.

## 8. Установка на Deck мимо Steam (тестеры)

В Konsole (десктоп-режим):

```bash
curl -fsSL https://raw.githubusercontent.com/ndrwbv/bird-delivery/main/tools/install-deck.sh | bash
```

Игра встанет в `./bird-pizza`, ярлык «Птица Пицца» появится в меню; в Steam — Add a Non-Steam
Game → `bird-pizza.sh`, Proton не включать. Такая установка сама предлагает обновления
(метка `.github-install`, тег из `electron/build-tag.json` против последнего релиза).
Сохранения — `~/.config/BirdPizza`, обновление их не трогает.

## 9. Что осталось

* Создать репозиторий релизов, иконки, `steam_appid.txt`.
* Подключить в `moscow.js`: `pollPad()` + `applyToIN()` в цикле, `pause/map/accept/choice*`,
  `makePadMenu()` для `#pausem`, `#choice.big`, `#big` (заставка), `#panel`, `#fullmap`;
  `rumble()` на аварии; `padmenu.css` рядом с `delivery.css`.
* Карточка выбора на паузе (обед): крестовина и так листает меню — там `choice*` не слушать.
* Глифы геймпада в гайде и подсказках (`pad.active`).
* Экранная клавиатура для имени, кнопка «выйти из игры», достижения.
* Cloud: переход с LevelDB на один JSON через `cloud.writeFile`.
* Страница магазина, beta-ветка, заявка на Deck Verified.
