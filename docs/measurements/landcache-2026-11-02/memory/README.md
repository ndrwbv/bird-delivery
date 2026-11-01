# №17 а: отдельная пара измерений памяти, 02.11.2026

**Два процесса и pure pair-gate PASS.** Это один **n=1 memory pair**, не статистическая оценка: generated, затем cache, Steam high 1280×800/CPU×3 с bootcpu/seed7 на macOS. Не физическая Deck. Runtime build `382750…760a`, source identity `fdb692…6fcce`; исходники/инструменты между процессами не менялись.

В обоих случаях меню/title, очередь завершена, supportReady, один и тот же набор **49 из 1776 участков** в радиусе 832 м у той же пиццерии. IDs неизменны до/после checkpoint и совпадают между вариантами. Только после закрытия startup watch выполнены две существующие GC; `gcAvailable=true`. cleanCalls=1/0, ошибок 0, пропущенных фазовых меток нет. Геометрия и реальное движение проверены отдельно, не этим сценарием.

| Мера, МиБ по существующему probe | Generated | Cache |
|---|---:|---:|
| Footprint peak внутри startup watch (exact=true) |2055|1847|
| Working-set peak renderer внутри watch |2788|2524|
| Working-set peak GPU внутри watch |853|861|
| JS heap после двух GC |839,7|836,8|
| Tracked WebGL после GC |503,4|502,7|
| Копии WebGL-массивов в JS после GC |28,7|28,0|
| Footprint после GC |1605|1335|
| Renderer working-set после GC |2776|2508|

Наблюдённый footprint peak ниже на 208 МиБ. Это **не точная экономия памяти игрока**, не доказательство полной изоляции всех мировых аллокаций и не гарантия отсутствия утечек на маршруте. Дополнительного существенного ухудшения в этой паре не наблюдали; небольшой GPU-разброс не превращаем в обещание.

Ресурсы в checkpoint немного различаются: geometries **6507/6473**, textures **64/58**, shader programs 228/228. Причина **не установлена**; возможен разный прогрев/пулы. Поэтому малую разницу tracked GL не приписываем исключительно чтению файла.

Глобальный sampled GPUpeak **885 МиБ** у generated появился на probeT=127309 мс, **после окончания eval=127307 мс и закрытого startup watch**; это не startup GPUpeak. У cache глобальный 861 МиБ. Полные PEAK renderer/GPU:2789/885 против 2524/861, n=624/545; максимумы разных процессов не складывать. Номинальный процессный опрос 200 мс. Footprint watch: n=1265 / 117046 мс и n=1100 / 100699 мс (средний интервал≈92,5/91,5 мс), exact=true при выросшем lifecyclepeak; фазовые точки сохраняют requested/completed clocks и не являются точными пиками стадий.

Footprint, process working-set, JS heap и tracked WebGL — разные меры. Предел manifest 1 GiB / default 512 MiB остаётся структурным потолком, не измеренным heap/RSS/Deck budget. cleaned/bufferHeld=false не доказывает освобождение native in-flight WebCrypto/fetch копий после отмены. Время этих --mem процессов не подставлять в тайминговые 36 A/B: здесь дополнительный радиус 832 м, измерения процессов и GC.

`summary.json` — компактные поля/дельты/фазы; raw `generated.json`/`cache.json` и их stdout/stderr сохранены. `*-run.json` фиксирует actual argv, статус 0 / signal null и SHA eval/init/fixture/manifest/raw. `pair-validation.json` — PASS. `actual-commands.*` — фактические команды с исходными путями; `protocol-prepared.md` — сохранённая подготовка до выполнения. Точные измеренные входы скопированы в inputs и memory-eval.js/pair-gate.mjs; их соответствие журналу проверено. Бинарныйcache/buildassets в этот архив не включены. `SHA256SUMS` покрывает все перечисленные файлы, кроме самого списка.
