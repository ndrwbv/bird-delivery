# №17 а: отдельная проверка памяти — черновик, не запускался

Только после 36 A/B и разрешения root: два новых cold-процесса, generated и cache. Одинаковые newbie fixture, seed7, Steam high, Deck1280×800, CPU3/bootcpu, build382… и manifest sourcefdb…/combinedinit8ef…. Это измерение на текущем macOS-host, не физическая Deck и не тайминговая серия. Source/probe/tools/config не менять.

`memory-eval.js` использует существующие `--mem`, PEAK, watch/unwatch, memProc, mem, memLate/GLMEM (docs/AGENTS.md:193,991–1000,1513–1520). Остаётся в меню: очередь полна, supportReady, естественно подготовлен радиус 832 и 500 мс неизменных клеток. Затем один steady checkpoint. Смену/поездку/перенос не запускает; управление и геометрия проверены отдельно.

До готовности — mainwork-menu и наблюдённые generated-clean либо decoding/preparing. `memProc` снимает процессы **без принудительного GC**; сохраняются requested/completed page+epoch clocks и phaseAfter. Наблюдение раз в 50 мс может пропустить краткую фазу: `missedPhaseMarkers` честно перечисляет пропуски. Это точки, не точные фазовые пики. Сначала закрывается startup watch, затем `mem()` делает две GC, если доступен window.gc. Никаких новых query msecs/mlate/lategc/latesnap: они изменят identity; lategc ещё исказит естественный пик.

Ожидаемые поля:

- `raw.memPeak`: page/gpu working-set пики, pageT/gpuT от probeT0, n; номинальный опрос 200 мс. Это два процесса, не суммарный пик всех процессов Electron. Максимумы в разные моменты не складывать.
- `result.startupWindow`: foot0/peak/exact/sampled/peakT/foot1/life0/life1/page/gpu/n/ms. Частота footprint непостоянна; n/ms сохраняются. exact означает рост lifecycle-пика в окне. Недоступный footprint — unavailable, не ноль.
- `result.steady`: heap, gl/glJs, geo/tex/prog, proc{page,gpu,pagePriv?,foot?,footPeak?}; доступность GC и время checkpoint. `memLate` — исходные tuples name/deltaGL/deltaHeap/endHeap без принудительного GC, glmem.heapPeak — опрос 100 мс плюс концы поздних кусков.

Автоматический PEAK продолжается во время GC: максимум после gcCheckpointStarted нельзя выдавать за чистый startup-пик. JS heap, tracked WebGL, working-set и macOS footprint — разные меры; ArrayBuffer/native allocations отражены в них по-разному. Effective manifest ceiling1GiB и кодовый default512MiB — структурные пределы, не измеренный heap/RSS/Deck budget. `bufferHeld=false`/cleaned не доказывают освобождения native in-flight WebCrypto/fetch копий после отмены; эти два запуска отмену не исследуют. Телефонные пороги не применять.

Pure offline `pair-gate.mjs` экспортирует validateMemoryPair(generatedRaw,cacheRaw). Требует одинаковые source/build/manifest/URL без landcache, high1280×800, разные процессы, title/full/support/ready832, стабильные ready IDs до/после checkpoint и равные между вариантами, отсутствие ошибок, clean1 против clean0+точный file SHA. При несовпадении стадии/покрытия память не сравнивать. Отдельные недоступные footprint/GC поля помечаются явно. Прогоны не запускались; новых профайлеров/хуков нет.

## Две подготовленные команды

```sh
npm run probe -- --mode=steam --dir=/tmp/bird-landcache17a-protocol2-1102/steam --startup-trace --startup-cold --startup-fixture=/tmp/bird-startup17-series-5a20287/newbie-1-fixture.json --fresh --early --mem --size=deck --cpu=3 --bootcpu --seed=7 --init-script=/tmp/bird-landcache17a-reportfix-1102/combined-init.js --land-export-manifest=/tmp/bird-landcache17a-reportfix-1102/manifest.json --eval=/tmp/bird-landcache17a/memory/memory-eval.js --bootwait=300 --timeout=600 --max=0 --errors --startup-session=lc17mem-f87c07db-7015-490f-be17-84b52f1bff42 '--q=gfx=high&gfxdev=deck&mute&startupdistrict=0' --report=/tmp/bird-landcache17a/memory/generated.json > /tmp/bird-landcache17a/memory/generated.stdout.log 2> /tmp/bird-landcache17a/memory/generated.stderr.log
```

```sh
npm run probe -- --mode=steam --dir=/tmp/bird-landcache17a-protocol2-1102/steam --startup-trace --startup-cold --startup-fixture=/tmp/bird-startup17-series-5a20287/newbie-1-fixture.json --fresh --early --mem --size=deck --cpu=3 --bootcpu --seed=7 --init-script=/tmp/bird-landcache17a-reportfix-1102/combined-init.js --land-export-manifest=/tmp/bird-landcache17a-reportfix-1102/manifest.json --eval=/tmp/bird-landcache17a/memory/memory-eval.js --bootwait=300 --timeout=600 --max=0 --errors --startup-session=lc17mem-a9386d81-bd4e-40cf-aa5b-e7d49cc3655a '--q=gfx=high&gfxdev=deck&mute&startupdistrict=0&landcache=1' --report=/tmp/bird-landcache17a/memory/cache.json --land-cache-file=/tmp/bird-landcache17a-reportfix-1102/city.land --land-cache-sha=40d8f28821b28ed37330fb23485ca8306cab17931e2ecfd09093b293aa367e08 > /tmp/bird-landcache17a/memory/cache.stdout.log 2> /tmp/bird-landcache17a/memory/cache.stderr.log
```
