# Финальная подготовка coverage v2: восемь экспортов

Успешный fresh prepare8: два независимых экспорта каждого из четырёх слотов `(district0, mid)`, `(district0, high)`, `(district3, high)`, `(district7, high)`. Exact journal `preparation.json` содержит actual child argv/PID/start/end/status/signal и hashes: один prepare build и восемь exporter процессов, все status returned / exit0 / signal=null. Root дополнительно сообщил terminal session4744 exit0; это отдельно обозначенное root evidence, не подмена child journal.

Source fingerprint **`36e181620e38931f15cd1fb40cb296e1c8751cefc60332c28cc094a6e752d679`**, prepare-build fingerprint `f5de55c855090af8e380510b40c05ab9a8b9794186dafa88144e3936745a6d76`, receiptHash `dcd3a40efe608907149d8ea80fec3d2fe70b96e5fa4efa75a06d1b4db064e16a`. Это хеши измеренных входов, не Git-коммиты. Во время подготовки/source capture bodies frozen; `source/` содержит 11 relevant src (включая game, reader, v2 catalog, exporter и shared codec helpers) и 8 точных preparation/harness files. Все 19 SHA независимо сверены с receipt/journal pins. Ничего не сжималось при архивации; plain snapshots дают около1,6MB.

## Независимо проверено

| Слот | Actual независимых процессов | preLate district / PZ index | FULL raw SHA |
|---|---:|---|---|
| district0 / mid | 2 | 0 / 0 | 24bdea…e01c |
| district0 / high | 2 | 0 / 0 | 24bdea…e01c |
| district3 / high | 2 | 3 / 3 | 24bdea…e01c |
| district7 / high | 2 | 7 / 7 | 24bdea…e01c |

Все восемь raw/fixtures/recorded args соответствуют слоту и повтору, имеют разные processEpoch и session IDs. Нативный source — ordinary EDL, baseSeed24301, host seed=null; CPU1/bootcpu=false. Actual PZ снята в `city-pizzeria-before-late`, `lateWorkStarted=false`; target/index/finite координаты и current PZ ссылка/координаты совпали до/после экспорта. Renderer остаётся title/menu.

Все exporter meta: generated/ready, cleanCalls1/randomCalls0, errors0/uncaught0/crash0, byteExact/repeated/queryPoints27, liveRestored=false/rendered=false. Host typed expectedDistrict и conditions/manifest/identity/receipt/source/build согласованы с actual. Frozen/reference assertions выполнял настоящий live eval; offline JSON audit не выдаёт повторное сравнение значений за новое доказательство JS reference identity. Worker RNG не инструментирован (`workerRngInstrumented=false`), scope нулевого счётчика не расширяется.

Catalog **version2**, четыре coverage rows, **один deduplicated input**. Все четыре слота и все восемь полных binary payload имеют exact precleanHash `c7ac523ca000f3baea4d6d0e94aa122a9bccd4cf813cdb0919ca459b3a1d4dd4`. Binary codec identity contract остаётся `land-package17b-v1`; это не означает старую версию coverage catalog.

## Внешние payload и размер

- Raw: **74 952 828 bytes**, SHA256 `24bdea536a1a6491a06e2a531f588b1606ac21b0bae2529ea83b5644226be01c`. Независимый audit действительно прочитал все8 внешних .land по одному bounded stream 256KiB и подтвердил SHA/байты. Ни один .land не включён в Git-архив.
- Gzip package: **34 231 572 bytes (32,65 MiB)**, SHA256 `f6e2c6b18c6ec026bca34c910f0c142d0d4856cd9ee124a29421774a91fa5d41`. SHA взят из exact preparation journal/catalog, physical size сверён stat; gzip content в этом audit не перечитывался и не распаковывался. Исходная подготовка записала свой byteExact gzip roundtrip.
- От опубликованного v0.33.10 (34 231 591 bytes) отличие — **−19 bytes**, тот же округлённый размер32,65 MiB. Это не новая степень сжатия, не выигрыш памяти и не ускорение. Host compression timings остаются в journal с исходным CPU1 component scope; renderer/Deck latency из них не выводится.

## Граница приёмки и хранение

Этот subtree доказывает подготовку данных, coverage/repeats и export roundtrip. Он **не содержит actual Go/W, production reader cache-hit/UI или latency A/B proof**, не является проверкой на физическом Steam Deck. Последующие runtime проверки root выполняются отдельно. Production build34394 и его потенциально in-flight logs сюда намеренно не копировались. Полные prepare/production builds, raw8 .land и package gzip не включены.

После измерений root сообщил portability follow-up только в `.gitattributes`: exact LF для нового district exporter helper. Измеренные helper bytes/pins/source36e не изменены; это не новый повтор подготовки и не отдельное cross-OS runtime доказательство.

Все8 stdout физически не скопированы: original bytes точно равны UTF-8 `JSON.stringify(raw.result)+"\n"`; совпадение с journal stdoutSha проверено. Пути/байты/SHA — stdout-records.json. Восстановление, например: `node .../harness/reconstruct-stdout.mjs mid-1 /tmp/mid-1-reconstructed.log` (выходной файл должен отсутствовать). Восстановитель/его SHA входят в archive-index. Raw/log/fixture original paths сохранены.

Проверка только архива: `node docs/measurements/landpackage-districts-2026-11-02/coverage-v2-final/harness/offline-metadata-audit.mjs`. Она не обращается к external payload/build/source tree, не запускает decode/gzip/игру. Original external payload audit/script сохранены отдельно и без явного запуска не перечитывают600MB payload. Планы/общие README/статусы и source/tools при архивации не менялись.
