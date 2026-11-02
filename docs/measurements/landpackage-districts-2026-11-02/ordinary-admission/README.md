# Coverage v2: ordinary admission, шесть фактических запусков

Одна immutable production сборка `/tmp/bird-landcoverage-v2-final-1102/production-steam`, root build34394 exit0, source fingerprint `36e181620e38931f15cd1fb40cb296e1c8751cefc60332c28cc094a6e752d679`. Шесть closed actual процессов: district3/7 high по одной cache/generated паре, district0 mid/high по одному cache случаю. Все CPU3/bootcpu/early, cold fresh, ordinary host seed=null, ru, 1280×800 device=deck. Это эмуляция на компьютере, не физический Steam Deck.

## Actual Go / picker / контроль / W

| Случай | Variant | Actual picker clicks | cleanCalls | navigation→control, мс | actual движение, м |
|---|---|---:|---:|---:|---:|
| d0-high-cache | cache | 0 | 0 | 65377.5 | 5.018806 |
| d0-mid-cache | cache | 0 | 0 | 64328.7 | 5.020099 |
| d3-cache | cache | 1 | 0 | 65849.9 | 4.979379 |
| d3-generated | generated | 1 | 1 | 81277.1 | 4.979236 |
| d7-cache | cache | 1 | 0 | 56608.3 | 5.850821 |
| d7-generated | generated | 1 | 1 | 71978.7 | 5.306032 |

Все original raw/run: processStatus0/signal=null, startupValidation PASS, console errors0/uncaught0/crash0, guardVersion2/drive/localReady/supportReady и held/paused/mapOpen=false. У районов3/7 до Go настоящий settled saved district с8 открытыми районами и acknowledged party; выбран один actual district picker. Район0 — fresh с одним открытым районом, без picker. Actual DIST/atControl/PZ index соответствуют target, затем подтверждено реальное движение W. Массивы/позиция не переставлялись тестом вручную; использован pinned действующий startup-ready harness, exact argv сохранены в каждом run.json.

Cache случаи: restored/hit=true, fatal=false/reason=null, cleaned=true/bufferHeld=false, cleanCalls0, coverageSlot соответствует actual district/graphics. Generated случаи включены явно через `landpackage=0`: landPackage=null и cleanCalls1; это контролируемый сравнительный путь, не скрытый fallback. Пары3/7 имеют один fixture/preset/build, отличаются вариантом/своей session; actual PIZZA одинаковая внутри пары.

**Каждый вариант — n1.** Это допуск правильного запуска/UI, не серия производительности и не медианы. Две наблюдавшиеся пары navigation→control: district3 cache65 849,9 / generated81 277,1 мс; district7 cache56 608,3 / generated71 978,7 мс. Ни диапазон, ни общий процент ускорения по этим единичным наблюдениям не заявляется.

## Payload SHA и report SHA — разные поля

Везде один точный catalog SHA `562eea6bb6a116ae0b583c4d300b6c52a9863879623ff37bcf0d128d7e6a5192`, catalog version2/source36e. Cache wire payload **34 231 572 bytes**, SHA `f6e2c6b18c6ec026bca34c910f0c142d0d4856cd9ee124a29421774a91fa5d41`; decompressed payload SHA `24bdea536a1a6491a06e2a531f588b1606ac21b0bae2529ea83b5644226be01c`. Оба actual=expected в reader meta. Это binary payload hashes. Поле `run.rawSha256` — SHA JSON отчёта: в независимой сводке оно называется `rawReportSha256`, отдельно от `rawPayloadSha256`/`wirePayloadSha256`. Ни land/gzip содержимое, ни декодер при архивации не читались/не запускались.

## Честная принадлежность production build

До запусков smoke пинил catalog+fixture+harness. Полного production content hash preflight **не было**. Root сообщает, что новый external Viteout после build34394 не изменялся весь период. Один lightweight inventory95 files снят после первых4, до завершения остальных2: paths/bytes/mtime и точный SHA малого catalog. Его metadataInventorySha256 не является полным build hash.

После всех6 closed root один раз снял full content pins: `provenance/post-admission-pins.json`, capturedAt **2026-11-02T01:08:56.165Z**, full production build hash **`fa39c62257b663c7f1fabf692dedfc80fdae557f310b737bebeb38cf00bede52`**. Это **post-series**, не предварительная гарантия и не ретроактивная подмена preflight. Offline audit сверил источник/95 path+size rows с lightweight inventory, catalog/wire hashes и то, что все finishedAt предшествуют capture. Сам повторно payload/compiled assets не хешировал. Prepare build f5de из отдельного source receipt НЕ присвоен production build.

## Сохранённые доказательства

Для каждого случая физически скопированы exact raw.json/run.json/stdout.log/stderr.log и точный явно заданный fixture (для d0 это его собственный runtime fixture). Dedup stdout в этом архиве не применяется. Original CI/local paths не переписаны. All measured harness SHA сохранены в каждом run: probe/eval/observer/report gate/admission/admission settings/district gate; текущая версия кода вместо измеренной не подставлялась. Source/readers exact36e snapshots находятся в соседнем coverage-v2-final; здесь сохранены full post-source pins.

Production build stdout/stderr34394 завершены и сохранены. Partial broad maincheck87296 не копировался. Повторная проверка только небольших доказательств: `node docs/measurements/landpackage-districts-2026-11-02/ordinary-admission/offline-admission-audit.mjs 6`. Она не запускает игру, не читает payload/build/source tree. Первоначальный4-case PASS сохранён отдельно, затем выполнен6-case audit с новыми случаями/post-series pins.

Планы, общий README/perf и source/tools не изменялись. Большие assets, сборка и land не включены в архив. Полные paths/bytes/SHA — archive-index.json и copy-records.json; integrity — SHA256SUMS.
