# Логические данные №17б — точное совпадение после выделения модулей

02.11.2026. Generated baseline и generated candidate прошли startup guard2, настоящий Go/W, high/Deck1280×800/CPU×3/bootcpu/mute, fresh district0. Обычный EDL-owned жребий base0x5EED, host.seed=null; внешний `--seed` не использовался. В обоих errors[], uncaught0 и crash[]. Это приёмка точности узкого рефактора, **не performance A/B, не медианы и не физический Steam Deck**. Контрольные запуски n1 и n1 диагностические; полной GPU byte-exact проверки здесь нет.

| Данные | Baseline | Candidate | Результат |
|---|---:|---:|---|
| NODES / EDGES / RSEG | 15009 / 31764 / 16596 | 15009 / 31764 / 16596 | Точный упорядоченный JSON |
| HOUSES / GEN_ENTR / CITY.entrances / SPOTS | 1174 / 3699 / 3711 / 5283 | 1174 / 3699 / 3711 / 5283 | Точный упорядоченный JSON |
| Routechain + реальные routeNodes queries | RC + 12 | RC + 12 | Точное совпадение |
| nearestRoad queries по выбранным SPOTS | 171 | 171 | Точные segment index / distance / projection |
| Общие ссылки | GEN_ENTR→CITY, edge→road, EF/EB/OUT→edge | Те же ссылки | Проверены через индексы оригинальных объектов |

SHA256 разделов вычислен над `JSON.stringify(section)` в Node после разбора сырых результатов:

| Раздел | SHA256 |
|---|---|
| graph | `81ed459df8598a27dbfc83de61880bf4ecf04cacf9975e347345837894fa87dc` |
| addresses | `767421960390d1be9e7d8b95502336a3d46f926be699fed7bc482df0c8dbe24a` |
| aliases | `95a11a5ca47292c6cace4a940582bbaa30cb80a7280c24a9ed8f8aebef0630dc` |
| roadQueries | `f5d1fb0ecc3252df25432f394addaa7f6a32ae12b70e19318bac498c8eb69bf6` |

Raw-файлы хешируются **по исходным байтам** `createHash.update(Buffer)`. Ранее выведенный root хеш от `JSON.stringify(Buffer)` неверен для этого назначения и здесь не используется. `pair/baseline.json.gz` восстанавливает 8821382 исходных байта, SHA `bbbf5dde9446334538cd9a743c4103b65d41c31d6a7a389c265f20815ebe14bf`; candidate — 8821814 байт, SHA `4fbf3232eca39470b9553ea8cde3e1a899c599cc3b045bb9340efb27e0ea319c`. Gzip level6, byte-exact распаковка проверена; исходные большие JSON не добавлены. Большие stdout также сохранены lossless gzip.

Происхождение измеренных сборок, без повторного хеширования build assets при архивировании:

| Стадия | Source key | Build tree hash |
|---|---|---|
| N1 trace и baseline — до выделения модулей | `6b90c550087f18b25fbd3bb7b3b9196aab64d102b8ae287fa3f4be2eb893f97a` | `6cd35dbd6f3638fe1b476dae41886468e7772cdce21438f8cb0c73d703731975` |
| Candidate — после выделения | `2891bbe16bd501f5536d4bd760b2e0c1aef84526c365b4233a10f80cc7567219` | `40961edfe08a2070200ad7ef1e3b2b435919f77a743d7ed58d135dc3fa0f7225` |

Сохранены `provenance/`, оба build log, fixture, eval и небольшой harness. `trace/n1/run.json` — настоящий child record со своими argv/status/signal и pins. Для двух logical processes отдельного child record не было: `pair/protocol.json` честно транскрибирует root exec inputs и exitCode0 сессий13599/50282. Сигнал tool не предоставил; null-сигнал и child-captured argv не выдумывались. Фактические host/conditions и guard находятся в самих raw. Абсолютные пути в оригиналах сохранены.

`source/trace-before.patch` — прежняя инструментальная правка до выделения модулей. `game.before.js.gz` реконструирован root из `git show bec86a9` + этого patch; его SHA `c1aaabd4549b1eb978431cf8d95b49c060a43f70132ca42fcf3c63184693b0ce` точно совпал с measured baseline inventory. `game.after.js.gz` — снимок candidate с SHA `afa410b1c8a56ce40b69f00e75b091bdaed5135e013424ce050edf384eafad49`, тоже проверенным по inventory. `extraction.diff` получен из этих двух точных снимков. Оба новых pure-модуля и самостоятельные тесты с frozen old references сохранены рядом; тесты здесь повторно не запускались.

Отдельный начальный n1 trace показал: addresses.buildSpots111.5мс /15 resumes /max15мс, buildCollect35.3мс, смешанный housesVisualAndLayout1373мс. Граф имеет собственные строки в summary.json; это наблюдения одного запуска, не обещание ускорения от файла. Рефактор сохраняет прежние генерацию/yields/порядок и пока не включает готовый каталог/граф до визуальных builders. Чтение, валидацию, память и реальную пользу будущего пакета предстоит измерить отдельно по беклогу.

`compression.json` хранит wire/raw bytes/SHA каждого gzip, `summary.json` — точность и trace, `archive-audit.json` — проверку копий/распаковки. `archive-index.json` фиксирует SHA/bytes payload файлов, исключая себя и top-level SHA256SUMS; последний включает index. Полные сборки и игровые assets не копировались; runtime/tools/backlog при архивировании не менялись.


## Каталог/бинарный граф и реальные запросы

[Первый cold-barrier pilot](catalog-graph-pilot1/README.md): binary3,14МБ, живоймир используетdecodedграф, references/byte-exact/data инвариантыPASS. [Final три случая](queries-final/README.md): дваindependentexports одногоb26/db818 иодинsaved5keys.5061actualrealAddress/7608entranceLv+DOOR/1214POOL, Gennadyhome, настоящиеboundary/tie свидетели. Wire/catalog/staticdata/querytables совпали; пятьстарыхключейсохраненывпорядке, включаяoutsidePOOL. ОднаofflineпроверкаUSEDпервоначальноожидалане туформупроекции; correctedбезповтораигры, журналсохранён.

[Общийcheck](main-check.log) PASS411с: web238м/p9518,5мс; DeckhighCPU×3 337м/p9520,7мс; console/crashlog0, warning256переводов. ЭтоmacOSэмуляция/диагностическиеn1, неOSCPU/physicalDeck/latencymedians. Defaultcatalogreader не включён; [inputclosure](functional-input-closure.md) ещёне доказан. Пакетдлярайонов3/7 — [следующийплан](district-tail-plan.md), неужеисполненныеэкспорты.
