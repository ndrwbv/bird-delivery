# №17б ordinary: отдельная n1 пара памяти — НЕ запускалась

Подготовлен только /tmp черновик. До GO root никаких команд ниже не выполнять. Проект/source/tools не менялись; не было syntax/unit/probe/build/import prepared gate или чтения больших binary. Это адаптация существующих /tmp/bird-landcache17a/memory/{memory-eval.js,pair-gate.mjs}, прежние17а raw/helpers не меняются.

## Фиксированные условия

Один immutable final build: /tmp/bird-ordinary17b-final-1102, source0fd44d87acaaefeef93da4ac376070cd5a22474af7c4ffbf7c75e557704ec07e. Fixture СУЩЕСТВУЮЩАЯ /tmp/bird-ordinary17b-prepare-1102/high-1-fixture.json: сохранённый Deck high, языкru/звукfalse. Query не форсирует gfx и не меняет контент/мир. Оба процесса ordinary owned EDL, host.seed=null, без --seed/внешнего RNG/init-script; gfxdev=deck остаётся только эмуляцией устройства. Steam1280×800, CPU3/bootcpu/--mem/--fresh, отдельные пустые Chromium sessions. Не физическая Deck и не timing series.

Generated отличается ТОЛЬКО landpackage=0; cache — штатная включённая ветка. Expected preclean c7ac523ca000f3baea4d6d0e94aa122a9bccd4cf813cdb0919ca459b3a1d4dd4; gzip wire34231591 bytes/SHA2ecd942570b7955f82c20fe7e11bfbcfd006b00c382e5ab044e095a2834dc8bd; raw74952828 bytes/SHA13b2851eaeb32e49d3f2865448a87b191ec6ef3839d747a597365e2e689aa89c. Маленький каталог фактически прочитан из final build при подготовке; payload НЕ читался. Полные условия/metadata digests — conditions.json/pins.json.

## Что делает eval

Существующие --mem/PRELUDE watch/unwatch/memProc/mem/memLate/GLMEM, без нового профайлера. Не начинает смену, не нажимает меню, не переносит машину, не вызывает prepare/finishSurface/GC при запуске. Остаётся title/menu, full late queue завершена, supportReady и ready832/640, failed0. Затем ровно49 естественно готовых IDs стабильно500мс; IDs проверяются до/после GC и между вариантами. Не увеличивать радиус/менять49 ради PASS.

macOS startup footprint watch открывается в начале eval и закрывается ДО mem(). На mainwork и наблюдённых фазах (generated-clean либо read/copy/hash/decompress/decode/prepare) только memProc(label,false), т.е. БЕЗ GC. Опрос50мс может пропустить короткую фазу; missedPhaseMarkers отражает пропуски, это не ошибка и не фазовые пики. Максимум по footprint в watch доступен только существующему macOS helper. Затем существующий mem('steady-after-ready') вызывает ровно две GC с его прежней паузой; отсутствие gc — failure этого протокола. После checkpoint записываются heap/GL/glJs/geo/tex/prog/process/memLate и trace.

Лишь ПОСЛЕ startup watch и steady2GC eval fetch-читает небольшой catalog.json и проверяет его SHA/source/entry против фиксированных metadata. Это добавленная metadata-observation, не I/O payload и не часть startup/steady замера. Большой land.gz повторно не читается. Она имеет отдельные clocks; продолжающийся raw.memPeak после gc/metadata нельзя выдавать за startup peak.

Честные меры: raw.memPeak page/gpu working-set200мс; startupWindow footprint с переменной частотой/n/ms/exact; phase points noGC; steady heap/GL/glJs/working-set после2GC. Разные меры/моменты НЕ складывать. Структурные limits1GiB не превращаются в RAM budget; bufferHeld=false не доказывает native освобождение. Один n1 не даёт точной экономии; geo/tex/prog различия явно выводить (pair gate их показывает, не притворяется byte-exact геометрией). Доказательство геометрии — отдельная приёмка, не этот protocol.

## Исполнение только после GO

Сначала generated, затем ТОЛЬКО после strict outer/result/errors/crash/memory-stage PASS cache. Любой неожиданный провал: сохранить report/stdout/stderr/run record/partial, СТОП без cache/повтора/ослабления порогов. Статус running/NOT_STARTED — неуспех. Отдельный новый каталог попытки нужен для реального повтора по разрешению root; существующие raw не перезаписывать.

Команды (не выполнялись):

~~~sh
npm run probe -- --mode=steam --dir=/tmp/bird-ordinary17b-final-1102 --startup-trace --startup-cold --startup-fixture=/tmp/bird-ordinary17b-prepare-1102/high-1-fixture.json --fresh --early --mem --size=deck --cpu=3 --bootcpu --eval=/tmp/bird-ordinary17b-memory/memory-eval.js --bootwait=300 --timeout=600 --max=0 --errors --startup-session=lp17bmem-generated-1102-a '--q=gfxdev=deck&mute&startupdistrict=0&landpackage=0' --report=/tmp/bird-ordinary17b-memory/generated.json > /tmp/bird-ordinary17b-memory/generated.stdout.log 2> /tmp/bird-ordinary17b-memory/generated.stderr.log
~~~

~~~sh
npm run probe -- --mode=steam --dir=/tmp/bird-ordinary17b-final-1102 --startup-trace --startup-cold --startup-fixture=/tmp/bird-ordinary17b-prepare-1102/high-1-fixture.json --fresh --early --mem --size=deck --cpu=3 --bootcpu --eval=/tmp/bird-ordinary17b-memory/memory-eval.js --bootwait=300 --timeout=600 --max=0 --errors --startup-session=lp17bmem-cache-1102-a '--q=gfxdev=deck&mute&startupdistrict=0' --report=/tmp/bird-ordinary17b-memory/cache.json > /tmp/bird-ordinary17b-memory/cache.stdout.log 2> /tmp/bird-ordinary17b-memory/cache.stderr.log
~~~

Никаких landcache17a manifest/seed/file hooks и gfx=high в query. Будущая syntax-проверка eval выполняется как body existing probe async evaluator (есть top-level return), не node --check обычного script. Gate — обычный mjs. Сейчас НИ ОДНА проверка не запускалась.

## Record/SHA/pair gate

Reuse прежнюю host запись memory-run: templates generated-run.template.json и cache-run.template.json содержат argv+pins, но явно NOT_STARTED, null statuses и provenanceUnchanged=false. Это НЕ отчёты запуска. Root в своих существующих host helpers фиксирует actual argv, cwd, pid, start/end epochs, returned/processStatus0/signal/spawnError, exact raw/stdout/stderrSHA, sourceHash/buildDir, hashes до/после и provenanceUnchanged=true. Заполнять поля только фактами; не копировать template как PASS. Финальный build не traversed этой подготовкой: его immutable body/provenance уже подтверждает root, index SHA — лишь дополнительный pin, не замена full build proof.

pair-gate.mjs экспортирует validateMemoryPair(generatedRawText,cacheRawText,{generatedRun,cacheRun,observedHashes}). Входы — ОРИГИНАЛЬНЫЕ raw JSON texts, чтобы проверить точные raw byte SHA. observedHashes root вычисляет из маленьких текущих eval/pairGate/fixture/catalog/index/probe/probePage (ключи ровно эти), без payload/build traversal. Это pure offline hash/JSON admission без FS/game/profiling внутри. До GO импорт/запуск не делался.

Gate требует все raw/process/result/error/uncaught/crash успехи, actual commands строго безseed/init/qualityoverride, source/catalog/fixture/tools SHA, разные cold sessions/processes, same URL кромеlandpackage, ordinary initial+final descriptors и host.seednull, actual high viewport, trace full/overflow0/no error flags/work reconciliation, menu full/support/localready49sameIDs, noGC marker/GC/watch chronology, generated clean1 или cache clean0 + wire/raw hashes + no workers, activate/align1. Missing GC/process peak/steadyGL — fail; footprint недоступен честно отмечается, не ноль. Геометрические счётчики выводятся observedSceneCounts; нельзя скрыть их различия за равными readyIDs.

Сначала offline gate + root review; никакой серии и новых условий автоматически не запускается.
