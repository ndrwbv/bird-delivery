# Каталог адресов и граф: диагностический pilot 1

Один фактический запуск Steam high / Deck 1280×800, эмуляция CPU3, ru, обычный EDL, host seed=null. Root tool session 7193 завершилась exit0; signal инструмент не сообщил. Это транскрипция команды и результата root, а не самостоятельно снятая дочерним recorder process telemetry. Build session 4767 exit0. Точные argv и BUILD_VERSION находятся в `run/protocol.json`.

Это измеренная диагностическая интеграция: восстановленный граф использовался живой игрой, каталог собирался на прежних барьерах. Это не A/B запуска, не физический Steam Deck, не production reader и не доказательство ранней готовности адресов. Source/build inventories сняты сразу после spawn и внесли диагностическую нагрузку в запуск.

## Неизменяемая принадлежность

`source fingerprint ebe1c7a1cf3cb5c8479039d71e478657f1972fc6532b6a69043de9cf1b28538c`; `build fingerprint de6c06cb29ea1adb6fb06aaf663931b315ffeff3e65d67c5177640bfd2fa0d4a`. Это хеши измеренных входов, не обозначения Git-коммитов. `source/` содержит ровно 8 измеренных src-файлов (включая game и SHA helper), 6 содержательных unit-файлов и probe/probe-page. Крупный game сохранён gzip6. Их исходные пути/байты/SHA и соответствие inventory записаны в `source-snapshot.json`. Полная сборка не дублируется.

## Проверено

- Offline gate повторно сравнил все 4 legacy-раздела с существующим `../pair/baseline.json.gz` по полному ordered JSON: graph, addresses, aliases, roadQueries — EXACT. Старый pure pair и его документы не изменены. Полные SHA/размеры разделов — `offline-gate.json`.
- Graph: 3 143 227 bytes, SHA256 `75b41dbbb19bcfe7d32f617036aeac3c1c75fda2aa3bc4f5d964bf295ac950c2`; inputHash `3051e064902d3bce71a966259071c13d666f8e9c875dcef7073de3f3821d4fb5`. 15 009 nodes / 31 764 edges / 2 047 roads. Live eval проверил actual `d.NODES/EDGES === decoded`, road refs, node index и byte-exact roundtrip. После extract освобождён wire buffer (`bufferHeld=false`), рабочие graph world refs остаются.
- Owner sealed: buildings 2 481 / houses 1 174 / GEN 3 699 / raw entrances 12 / entrances 3 711 / SPOTS 5 283. Live eval проверил resolveBuilding/source id и owned door aliases. Replay JSON проверяет данные и индексы; объектную идентичность после сериализации повторно доказать нельзя.
- Actual menu Go, first.control guard2 с ready/supportReady и без paused/map/held, движение 4.785729 м, console errors0 / uncaught0 / crash0. В исходниках eval нет force states или прямого startRun.

## Наблюдённые стадии

Это synchronous main JS elapsed, а не OS CPU time. По одному диагностическому наблюдению, без медиан и без обещания выигрыша:

| Стадия | Main JS elapsed, мс |
|---|---:|
| roads.graphInput | 26.8 |
| roads.graphExport.encode | 325.1 |
| roads.graphExport.decode | 195.8 |
| roads.graphExport.exact | 375.1 |
| addresses.sealCatalog | 18.3 |

Декодер 195,8 мс превышает ориентир свежего среза 60 мс; такой синхронный decoder нельзя называть неблокирующим. Полный startup включает encode/decode/reencode proof, поэтому не сопоставляем его с обычным запуском как ускорение. Полные поля trace остались в raw.

## Повторная offline-проверка

Из корня checkout: `node docs/measurements/logicaldata-2026-11-02/catalog-graph-pilot1/harness/offline-gate.mjs`. Она читает только архив и старый baseline, без игры, build и обхода source. Gate version1; проверяет фактический raw, четыре exact-раздела, graph file SHA/base64, catalog rows/links и сохранённые source snapshots.

Raw/stdout/graph упакованы gzip level6 с byte-exact распаковкой; оригинальные пути/байты/SHA и compressed SHA записаны в copy-records и archive-index. Ни один original raw не редактировался.

Прямые actual realAddress/entranceLv/story-home/ordered POOL/USED запросы в этом pilot не снимались. План следующей функциональной приёмки находится в `notes/`; его наличие не означает выполненные проверки.
