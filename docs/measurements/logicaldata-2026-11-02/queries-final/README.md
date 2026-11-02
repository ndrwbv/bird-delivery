# Адресные запросы: два fresh-экспорта и saved-key case

Три завершённых фактических процесса на одной immutable Steam high сборке: ru, district0, обычный EDL, host seed=null, Deck 1280×800, CPU3 эмуляция. Это функциональная приёмка, не startup A/B и не физический Steam Deck. Первый startup guard2 и движение получены через штатную кнопку Go; запросы выполнены после startup/owner/graph packet proof.

## Принадлежность и процессные данные

Измеренный source fingerprint `b26caf3f59baa1bcf694fcd0336b4608b58e46447d5bd2d54c60beb746c41d85`; build fingerprint `db818ab44b1a87d9ad2c4fa1c0ee4a8939e682dd3f4df5d383355b428b35a634`. Это хеши входов, не Git-коммиты. `33be110` — названный root Git-коммит harness, не SHA файла. Файл probe.cjs имеет SHA256 `54b8156913fa04b036676c4ebb87045361bbbec5fdfd41beae7e2f3541072abd`; probe-page.cjs — `f4de01a97466fb109319b86a82bbe47f9f498ef410c976df76e85cb94005d9dd`.

Точные executed argv и exit0 взяты из root tool transcription: build session97694; query1 session81251; query2 session64001; savedkeys session82929. Signal инструмент не предоставлял. Это не самостоятельно снятая дочерним recorder argv/status telemetry. Harness pins в protocol явно обозначены как after-runs filesystem capture при frozen source; они не происходят из raw.startupHost.

`source/` содержит 8 измеренных src-файлов (в том числе actual ADDRESS_QUERY integration и исправление defensive identity copy) и 6 unit-файлов, а также probe/probe-page. Src SHA сверены с measured source inventory. Полная сборка не копируется. Eval один во всех трёх процессах: SHA256 `bee99bb14c491c347208a8aaedf97ffbc3894db63941f5da1d194bcb0c782cee`; init SHA `2b86ab2f274c5ac2778b33978e6ac8cf79b4fbe971a94965a51db98a9b7d5342`.

## Проверено по actual raw

| Случай | actual realAddress | entranceLv + DOOR.lv | ordered POOL | USED | После control: запросы, мс | Движение, м |
|---|---:|---:|---:|---:|---:|---:|
| query1 | 5061 | 7608 + 7608 | 1214 | 0 | 692.3 | 4.784460 |
| query2 | 5061 | 7608 + 7608 | 1214 | 0 | 689.0 | 4.553242 |
| savedkeys | 5061 | 7608 + 7608 | 1214 | 5 | 687.8 | 4.551861 |

Все три actual raw: guardVersion2, drive/localReady/supportReady, без pause/map/hold, console errors0/uncaught0/crash0. Функциональные времена — отдельные диагностические synchronous main JS elapsed после first.control; это не OS CPU time и не вывод о startup-ускорении.

- Два независимых fresh-процесса дали полное EXACT совпадение logical, owned catalog, wire и functional object, исключая только functional elapsedMs. Независимость подтверждается разными processEpoch/navigationEpoch и root run/session данными.
- Saved-case оставил все четыре legacy-раздела graph/addresses/aliases/roadQueries, каталог, graph packet и actual таблицы адресов/этажности/home/POOL/witnesses EXACT относительно fresh. Старые baseline/purepair не переименованы в actual query proof и не изменены.
- Readonly actual `ADDRESS_QUERY.realAddress/entranceLv`, `DOOR.lv`, `STORY_DBG.homeOf`, `ORDM.DEBUG.POOL/USED` не подменены копией функции. Независимый offline nearest oracle повторно проверил actual таблицы по ordered HOUSES и CITY.entrances. POOL проверен по sourceSPOTSindex, порядку, 4m key, отдельной quarter-metre entr классификации и расстоянию до actual PIZZA. zone/eligibility expected вычислены при live eval действующими ZN/DIST/nearestRoad; offline не изобретает копию этих world helpers.
- Найдены настоящие witnesses: четыре exact nearest ties с first-wins, четыре невакуозных R=9 inside/exact/outside и два точных house60 при существующей соседней двери. Отсутствующих witnesses в этих измерениях нет.
- Геннадий: building ordinal229 / source id118892081, entrance477, SPOT363, actual адрес «улица Царевского, 2». Два вызова вернули одну memo-ссылку. HOME private memo population разрешена и не выдаётся за полное отсутствие внутренних изменений.
- До/после запросов exact rows, ordered POOL/USED, 12 наблюдаемых saved keys, district/pizza/owner snapshot и captured array/row references сохранились. Это не утверждение, что весь обычный bootstrap не записывает прогресс: штатный старт, например, может записать route memory. JSON replay проверяет значения; ссылочную идентичность доказал original live eval. Инвариант RNG descriptor не равен счётчику вызовов Math.random.

## Пять прежних ключей

Новый fixture отличается от fresh high fixture только `dlv-used-addr`: `["ly.kd","kj.gx","nr.db","lu.bx","c4.7x"]`. Его SHA256 `67d53f57494c20845135154ae81ece0236f6e116557b0cbfbd9d29df56476c54`. Actual USED/Store сохранили все пять строк в исходном порядке. POOL mappings: `[[0],[6],[389],[404],[]]`. Пятый ключ относится к измеренному SPOT index1 вне текущего POOL, не к выдуманному адресу. Проверено чтение/совместимость ключей; markUsed/старение/следующая выдача заказа не тестировались.

Первоначальный однострочный offline валидатор ошибочно ожидал USED как массив строк, хотя eval намеренно возвращает `{index,key,poolIndices}`. Исправлена только проекция валидатора `.map(row=>row.key)`. Raw/eval/game/пять ожидаемых ключей не изменены, игровой повтор не выполнялся. Сообщение об этой ошибке явно сохранено в root-evidence/saved-key-summary.json; точная исходная faulty one-line команда отдельно не была захвачена данным архиватором.

## Хранение и повторная offline-проверка

Raw трёх случаев и общий извлечённый graph packet упакованы gzip level6 с проверкой точного roundtrip/SHA. Graph SHA `a64d843e741592f93be9707c8ecd9a577ab9df767002e5febebfbd68675a0c34`. Пакет действительно извлечён из base64 actual raw, а не скопирован с несуществующего original .graph path.

Все три stdout физически НЕ скопированы: при архивации каждый точный original stdout прошёл byte equality с UTF-8 `JSON.stringify(raw.result)+"\n"`. Raw paths остаются исходными. Original stdout bytes/SHA и правило восстановления — raw-records.json. Для восстановления: `node .../harness/reconstruct-stdout.mjs query1 /tmp/query1-reconstructed.stdout.log` (выходной файл должен отсутствовать). Хеш самого reconstruction script записан в archive-index/SHA256SUMS.

Из корня checkout: `node docs/measurements/logicaldata-2026-11-02/queries-final/harness/offline-query-audit.mjs`. Gate version1 проверяет actual raw, full pair/triple exact comparisons, independent scalar oracles, saved mappings, root argv/status/after-run pins и восстановление stdout. Это offline audit, не запуск игры или project test suite.

Полные original paths, байты, SHA, сжатие и provenance каждого артефакта — archive-index.json; точные измеренные source files — source-snapshot.json. Отдельные snapshots/scripts первоначального аудита/плана сохранены как исторические evidence, их старые absolute /tmp paths намеренно не переписаны. Самодостаточный текущий архивный audit — harness/offline-query-audit.mjs.
