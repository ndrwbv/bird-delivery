# Приёмник анонимной статистики (Yandex Cloud)

Что и зачем — [docs/ANALYTICS.md](../../docs/ANALYTICS.md). Здесь — как развернуть заново и поменять.

**Только личный профиль:** все команды — `yc --profile personal …`. Профиль `default` — рабочий (чужая компания),
его не трогать и не делать активным. В каталоге `default` личного облака — чужие проекты автора (`arbuz-api`,
`digest-reactions`), их не трогать: всё статистики — в каталоге `bird-pizza`.

| файл | что |
|---|---|
| `cloud.json` | имена и адреса: каталог, база, таблица, функция (секретов нет) |
| `function/index.js`, `function/package.json` | Cloud Function `bird-ingest`: принимает пачку, проверяет, пишет в YDB |
| `deploy.sh` | новая версия функции из `function/` + публичный вызов |
| `setup.mjs` | таблица `events` (идемпотентно) |
| `ydb.mjs` | подключение к базе для скриптов: токен `yc --profile personal iam create-token` или ключ `telemetry-reader.local.json` |
| `stats.mjs` | сводка → `docs/STATS.md` (`npm run stats`); копия выгрузки — `.cache/events.json` (в .gitignore), из базы — только новые дни |

Зависимость одна — `ydb-sdk` (в `tools/telemetry/package.json`, ставится сама при `npm run stats`; для скриптов
вручную — `npm --prefix tools/telemetry install`). Функции её ставит само облако по `function/package.json`.

## Развернуть с нуля

```bash
P="yc --profile personal"
# 1. каталог
$P resource-manager folder create --name bird-pizza --description "Птица Пицца: анонимная статистика игры"
F=$($P resource-manager folder get bird-pizza --format json | node -p "JSON.parse(require('fs').readFileSync(0)).id")
# 2. база — только serverless (бесплатный уровень: 1 млн операций и 1 ГБ в месяц); создаётся ~10 мин
$P ydb database create --folder-id $F --name bird-stats --serverless
$P ydb database get bird-stats --folder-id $F      # endpoint и database → в cloud.json
# 3. таблица
npm --prefix tools/telemetry install && node tools/telemetry/setup.mjs
# 4. сервисный аккаунт функции: только запись в эту базу
$P iam service-account create --folder-id $F --name bird-ingest
SA=$($P iam service-account get bird-ingest --folder-id $F --format json | node -p "JSON.parse(require('fs').readFileSync(0)).id")
$P ydb database add-access-binding bird-stats --folder-id $F --role ydb.editor --service-account-id $SA
# 5. функция и её первая версия (публичная)
$P serverless function create --folder-id $F --name bird-ingest
tools/telemetry/deploy.sh                           # печатает адрес → URL_INGEST в src/game/telemetry.js
```

Новый адрес функции — в `src/game/telemetry.js` (`URL_INGEST`) и в docs/ANALYTICS.md.

## Поменять приёмник

Правка `function/index.js` → `tools/telemetry/deploy.sh` (новая версия, адрес тот же). Проверить:

```bash
U=https://functions.yandexcloud.net/d4eu40ddb8ngvb0aqjp6
curl -s -w '%{http_code}\n' -X POST -H 'Content-Type: text/plain' \
  --data '{"k":"bp1","i":"curltest0001","s":"curlsess0001","v":"dev-curl","b":"web","d":"desktop","t":true,"e":[[1,'$(node -p 'Date.now()')',"session_start",{"via":"curl"}]]}' $U   # 204
npm run stats -- --test --print
```

Таблица: ключ `(day, install_id, session_id, ts, seq)` — день события первым (сводка читает только нужные дни).
Поменять схему — `DROP TABLE events` и `node tools/telemetry/setup.mjs` (данные пропадут), функция пишет те же столбцы.

Ответы: 204 — записано; 400 `size` / `json` / `key` / `id` / `version` / `events` — мусор, не записано; 503 — база не
ответила (игра попробует через минуту). Журнал функции **выключен** (`--no-logging`): облачный журнал платный сверх
малого объёма, а системные строки пишутся на каждый вызов. Разбираться с ошибкой — временно включить:
`yc --profile personal serverless function version create … --log-group-id <группа>` (или задеплоить без
`--no-logging`), посмотреть `yc --profile personal serverless function logs bird-ingest --folder-id <каталог>`, выключить обратно.

Игра шлёт протокол `bp1` (`GAME_KEY` в telemetry.js). Сменился формат пачки — новый ключ (`bp2`) в игре и в
`GAME_KEYS` в deploy.sh (`bp1,bp2`, пока старые версии игры живы).

## Ключ для чтения на другой машине

На машине автора скрипты берут токен у `yc --profile personal` сами. Где `yc` нет — сервисный аккаунт-читатель:

```bash
$P iam service-account create --folder-id $F --name bird-reader
R=$($P iam service-account get bird-reader --folder-id $F --format json | node -p "JSON.parse(require('fs').readFileSync(0)).id")
$P ydb database add-access-binding bird-stats --folder-id $F --role ydb.viewer --service-account-id $R
$P iam key create --service-account-id $R --output telemetry-reader.local.json   # в корне проекта; *.local.json — в .gitignore
```

## Чистка

Проверочные события (`test = true`) сводка по умолчанию не считает. Стереть их:

```bash
node -e "import('./tools/telemetry/ydb.mjs').then(async m => { const d = await m.connect(); await m.q(d, 'DELETE FROM events WHERE test = true;'); await d.destroy(); })"
```

## Деньги

Бесплатный уровень (18.10.2026): Cloud Functions — 1 млн вызовов и 10 ГБ×ч в месяц; YDB serverless — 1 млн
операций (RU) и 1 ГБ в месяц. Игра шлёт пачку раз в минуту (плюс при сворачивании и закрытии) → ~1 вызов на минуту
игры, ~16 тыс. часов игры в месяц до платного по вызовам. Запись в базу — ~0,5 операции на событие (замер
18.10.2026), при 3—6 событиях в минуту — ~5,5—11 тыс. часов игры в месяц; расчёт — docs/ANALYTICS.md «Сколько это
стоит». Публичных IP, ВМ и кластеров нет. Таблица стирает строки старше года.
