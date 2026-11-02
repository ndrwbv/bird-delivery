# Меню-экспорты районов: pilot source2a

Пять фактических экспортов на одной исходной immutable сборке: два независимых повторения района3, два района7, отдельный fresh high контроль района0. Проверен selected PIZZA до поздней сборки. Игра осталась в title/menu: Go, выбор района через интерфейс, W и reader-cache приёмка здесь НЕ выполнялись.

Измеренный source fingerprint `2a72a0737403b5153a7ce813cd096217299e92d33066de2aa8332a2aa0df80ca`; build fingerprint `8277c68c61fe4aff80c60af3b4b2c1b8a3ca7acec4db8827bb66857393a933c4`. Это хеши измеренных входов, не Git-коммиты. Receipt/hash/source-before/harness pins сохранены. Исходный compiled build и пять больших .land в репозиторий не включены.

## Что измерено

Все raw показывают high, device deck, 1280×800, ordinary EDL, host seed=null. Фактический host cpuThrottle=1/bootcpu=false: это CPU1 экспорт на компьютере, не CPU3-эмуляция и не физический Steam Deck. Никаких latency-медиан, выигрыша запуска или поддержки reader во всех районах из этого пилота не следует.

| Случай | Actual district / PZ index | preLate.at, мс | Actual PZ x / z | clean / RNG |
|---|---|---:|---|---|
| district3-1 | 3 / 3 | 2624.6 | 995.388511 / -477.407839 | 1 / 0 |
| district7-1 | 7 / 7 | 2621.7 | -2372.633066 / -185.603771 | 1 / 0 |
| district3-2 | 3 / 3 | 2673.1 | 995.388511 / -477.407839 | 1 / 0 |
| district7-2 | 7 / 7 | 2682.5 | -2372.633066 / -185.603771 | 1 / 0 |
| district0-control | 0 / 0 | 2667.2 | 3127.602429 / 2075.734038 | 1 / 0 |

Pre-late snapshot находится в phase `city-pizzeria-before-late`, `lateWorkStarted=false`, frozen/nonwritable проверены живым eval. Actual DIST.cur/PZ_CUR и целевая PIZZERIAS ссылка/координаты до и после экспорта совпали. У районов0/3/7 разные реальные PZ координаты. Время снимка — диагностическая navigation-relative отметка, не результат сравнения загрузки.

Все raw: phase ready, source generated, cleanCalls1/randomCalls0, byteExact/repeated/queryPoints27, console errors0/uncaught0/crash0. Actual meta.conditions.district и типизированный host expectedDistrict (number) строго совпали с target; identity/manifest/receipt/provenance согласованы между renderer/host. Ordinary descriptor принадлежит EDL, baseSeed24301. Worker RNG не инструментирован (`workerRngInstrumented=false`), поэтому нулевой счётчик не переименован в доказательство всех возможных Worker вызовов.

## Полные payload-файлы

У всех пяти binary payload один precleanHash `c7ac523ca000f3baea4d6d0e94aa122a9bccd4cf813cdb0919ca459b3a1d4dd4`, одинаковый полный SHA256 `5c9de2b05148a3703d6e5967061300a57a3c84d9838211afd74c87e747aad668` и размер 74 952 828 bytes. Это равенство полных .land, не равенство raw JSON: JSON содержат разные district/PZ/time/process metadata.

Независимый offline audit реально прочитал каждый из пяти внешних файлов один раз, строго последовательно, bounded stream чанками 256KiB; проверены native SHA/count и соответствие host path. Файлы не декодировались, повторный город не запускался. В archive только `payload-records.json` с исходными внешними путями, размером и SHA; физической копии payload нет. Original stream audit script/output сохранены; повторный `harness/offline-metadata-audit.mjs` читает лишь архив и НЕ перечитывает внешние payload.

Acceptance summary `liveRestored=false`, `activated=false`, `rendered=false`: export roundtrip не восстанавливал игровой мир и не доказывал рендер. Selected draw inputs/27 queries — ограничения прежней приёмки экспортёра.

## Измеренные исходники и последующие правки

В `source-pins.json` перечислены measured expected SHA из source-before/preflight и результат точечного сравнения с текущим файлом. В source/ скопированы ТОЛЬКО совпавшие версии game/exporter/key/editlayer/codec/preclean/accept, probe/district eval/host. Крупный game упакован gzip6. Изменённые текущие reader/catalog не объявлены source2a. Старый catalog восстановлен из ранее существовавшего `/tmp/bird-production17b-shared/land-package-catalog.js` и включён только после точного совпадения с measured SHA5094beb3; current SHA и путь исторической копии записаны отдельно. Reader и три preparation helper тоже восстановлены из root beforecopies (root указал происхождение Git9c8be0e), затем каждый файл независимо сверен с measured source-before/helper SHA. Эти точные исторические байты включены; текущие изменённые файлы не подменяли измеренные. Child Git не выполнял. Полная root reconstruction.json сохранена. Для probe-page нет measured pin в receipt/harness, поэтому нынешняя версия не выдана за подтверждённый snapshot. Полный inventory старого source сохранён отдельно; это не обещание полного rebuild bundle.

Этот pilot использует прежний `land-package17b-v1` receipt/key и не сертифицирует новый production coverage. На момент проверки reader ещё пропускал district!=0. Последующий v2/source change требует нового common build/receipt и fresh prepare; старый файл нельзя молча выдавать за новый source.

## Stdout и повторная offline проверка

Все пять stdout намеренно не скопированы физически: каждый оригинал байт-в-байт совпал с UTF-8 `JSON.stringify(raw.result)+"\n"`. Пути/байты/SHA/правило — stdout-records.json. Восстановление, например: `node .../harness/reconstruct-stdout.mjs district3-1 /tmp/district3-1-reconstructed.log` (выходной путь должен отсутствовать). Script SHA зафиксирован в archive-index/SHA256SUMS.

Полные raw неизменны, stderr/logs/fixtures/receipt/harness и исходные пути сохранены. Общие README/план и прежние измерения не изменены. Runtime/source/tools/Git/probe/build/project tests при архивации не запускались и не менялись.

## Протокол выполненных команд

`provenance/root-protocol.json` содержит точные root-transcribed argv/environment и завершённые exit0: build73056; district3-1 session68846; district7-1 session96315; district3-2 session74934; district7-2 session6554; district0-control session64434. Signal инструмент не предоставлял; null не обозначает самостоятельную дочернюю process telemetry. Control fixture скопирован с точного указанного пути `/tmp/bird-ordinary17b-prepare-1102/high-1-fixture.json`. Архивный metadata audit сверил actual args/targets/cold/fresh/fixture, preflight harness pins и исторические source copies, не перечитывая binary assets.

Для проверки только архива: `node docs/measurements/landpackage-districts-2026-11-02/pilot-source2a/harness/offline-metadata-audit.mjs`. Original external-payload audit требует исходных `/tmp/*.land` и не запускается этим metadata gate автоматически.
