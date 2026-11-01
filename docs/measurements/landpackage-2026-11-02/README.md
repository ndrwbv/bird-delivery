# №17б: обычные данные земли — 2 ноября 2026

Первый пакет контуров принят локально. Обычный EDL, район0; source key `0fd44d87acaaefeef93da4ac376070cd5a22474af7c4ffbf7c75e557704ec07e`. Это ключ исходников/алгоритма, не Git-коммит. База изменения — `baa44252`, метка локальной сборки `0.33.10`. Все прогоны без звука, Steam; macOS arm64, эмуляция Deck1280×800. Физическая Deck и фактические Linux/Windows release artifacts пока не проверены.

## Обычная подготовка

[Все исходные отчёты, receipt и точный harness](ordinary-prepare-1/archive-index.json). Одна prepare-сборка; четыре независимых cold-процесса без `--seed` и внешнего init/RNG: два настоящих default Deck mid, два с сохранённым high. Только device-эмуляция `gfxdev=deck`, без изменения обычного жребия. Каждый report подтверждает owned EDL, clean1/RNG0, byte-exact/repeated round-trip, `liveRestored=false`. Все четыре процесса — exit0/signalnull, ошибок0, без повторов.

Все четыре результата совпали: preclean key `c7ac523ca000f3baea4d6d0e94aa122a9bccd4cf813cdb0919ca459b3a1d4dd4`; raw74 952 828байт, SHA `13b2851eaeb32e49d3f2865448a87b191ec6ef3839d747a597365e2e689aa89c`. Поэтому mid/high в **этих входах** используют один файл. Другие районы/донаты/сезоны этим не объявлены эквивалентными.

Gzip level6: **34 231 591байт (32,65МиБ)**, SHA `2ecd942570b7955f82c20fe7e11bfbcfd006b00c382e5ab044e095a2834dc8bd`. Raw и gzip не включены в Git: внешние пути/длины/SHA сохранены. Каталог, snapshot identity и итоговая упаковка разделены; full buildHash не входит в identity. Сжатие lossless; renderer проверяет wire SHA, bounded inflate, raw SHA и codec до установки.

В исходном `preparation.json` поле `compression.decodeMs` фактически охватывает **gunzip + byte equality + wire hash + запись файла**. Это combined span, не чистая распаковка и не стоимость в renderer. Число не переписано; следующий tool называет его `decodeVerifyHashWriteMs`. [Первая осуществимость на старом seed7 файле](gzip-lab-feasibility.json) также только host Node CPU×1, не обычный запуск/Deck.

Две реальные находки независимого ревью exporter исправлены до подготовки: dirty finalMask раньше принималась, а afterClean мог принять другой source с ключом первого. Теперь fresh mask/семь исходных stats и context/source/refs/lifetime проверяются на всех стадиях. Exporter38/host22, reader47, shared13, build8 — малые проверки прошли; это не замена приёмки настоящего города.

## Первые обычные запуски

Одна окончательная сборка `/tmp/bird-ordinary17b-final-1102` с тем же source key и локальным gzip. Без тестового зерна, высокая/стандартная графика берутся из обычного сохранения; CPU×3 с навигации, fresh. Каждый случай — один пилот, **не медиана**:

| Сценарий | Navigation→control, с | Источник / cleanCalls | Настоящий W, м |
|---|---:|---|---:|
| High, cache | 64,513 | cache /0 | 4,784 |
| Mid, cache | 62,935 | cache /0 | 4,786 |
| High, generated, та же сборка | 79,519 | generated /1 | 5,019 |
| High, synthetic ASAR cache | 64,416 | cache /0 | 4,554 |

Все четыре — errors0/uncaught0, свежий guardVersion2, правильная пиццерия/опора/местные участки, очистка owned buffers; wire/raw SHA совпадают. Одиночная high-пара показывает около15с разницы; до итоговой серии ускорение обычного пути не оценивается по медиане.

ASAR построен локально из точного final dist. Проверены фактические packaged bytes/SHA и полный список `city-data`, затем Electron probe действительно прочитал данные из `app.asar/dist/steam` и дал обычное управление. Это **synthetic data-container proof**, не запуск production main и не ещё не созданные release artifacts. Первый Node admission остановился с ENOTDIR **до запуска Electron**: Node сам не читает виртуальную папку ASAR. Первый stderr и старый admission сохранены; повтор использует внешний уже сверенный каталог, а данные читает Electron из архива. Код игры/сборка между ними не менялись.

## Геометрия, отказы и память

[Четыре integration negatives](negatives/summary.md) — PASS без повторов: точный-path404, изменённый байт packaged fetch stream, отмена в настоящем preparing и `?nowiden` как реально другой вход. Везде ordinary Go/W, clean1/activate1/align1, ошибок0, без cache commit/частичной/поздней публикации. При отмене до и сразу после — mask/support/built/published0, исходные preclean данные не изменены, owned buffers освобождены **до** fallback. Nowiden дал другой preclean key и fetch0.

[Геометрия](geometry/README.md): attempt2 generated/cache PASS на одних закреплённых точках, CPU draw/query digest совпал. Пять стоянок, шесть медленных пересечений,12 границ,8 props и4 SMASH benches; height/retained CPU ranges предметов совпали, урона/bump нет. Это не full-GPU byte-exact. Attempt1 остановился на fixture-guard: обычный EDL сам устанавливает `__lateSeed`, а проверка ошибочно запрещала его наличие. Первый raw/code/diagnosis сохранён; в новом eval изменено ровно одно условие, private ownership/host.seednull сохранены. Runtime и сборка не менялись.

[Отдельная ordinary n1 память](memory/summary.md): те же49 участков/832м в title, watch закрыт перед двумя GC. Footprint peak2091→1859МиБ, after-GC heap839→836,1МиБ, tracked GL505,4→504,9МиБ. Существенного ухудшения в этой паре не увидели; **точную экономию не обещаем**. Geometries6504/6493 различаются (textures65/65, programs228/228); причина не установлена. Глобальный GPU888 generated возник после окна, его не выдаём за startup peak. Разные меры не складываются; native in-flight копии и пропущенные короткие phase markers раскрыты в отчёте. Это macOS-эмуляция, не физическая Deck и не утечка-проверка большого маршрута.

## Итоговая обычная серия

Первая Ordinary12 попытка остановилась после одного runtime PASS из-за служебной ошибки admission: поле `gate` с file/SHA было перезаписано результатом проверки. [Весь первый набор](ordinary12-attempt01/README.md) остался failed, без медиан и переклассификации. Исправлено только имя поля результата (`startupValidation`); SHA gate не ослаблялся. Регрессия использует настоящий ошибочный record: он отвергается, protocol-correct counterfactual явно synthetic и только в памяти теста.33 pure cases и независимое ревью прошли. [Новая полная серия](ordinary12-attempt02/README.md) выполнена в отдельном каталоге на прежней сборке0fd/2a447: **12/12PASS**, без повторов; source/runtime/data не менялись. Три повтора каждой группы, шесть собственных cold/warm сессий, порядок generated/cache чередуется. Navigation→actual control: cold81,312→66,035с (−15,278с,18,79%), warm81,443→65,657с (−15,786с,19,38%). Обычный EDL, host.seednull, high Deck1280×800, CPU×3, свежая готовность и настоящий W во всех12; raw/команды/SHA сохранены. Work spans — elapsed JS, не OS CPU; пересекающиеся окна не складываются, OS/driver cache не контролируется. Цель5–10с этим не достигнута.

До выпуска остаются CI-подготовка и actual packaged Linux+Windows. Общая проверка завершена: [первый check](check-first-tooling-failure.log) и [адресный повтор](check-failed-parts-followup.log). Первый общий check: все малые проверки/web прошли, Steam остановился на правильном guard editor+package, поскольку probe-build сам включает BIRD_EDITOR. Непрошедшие build/probes повторены без package-env и прошли за179с; сам ordinary package отдельно подтверждён12 и synthetic ASAR. Guard не ослаблялся, результаты первого запуска сохранены. Дальние районы отсекаются до preclean hash; остальные неподходящие входы возвращаются к обычному clean без частичной публикации. Каталог адресов/дорожный граф и остальное покрытие №17б остаются в беклоге идей.

Независимый [offline audit](ordinary12-attempt02/independent-audit.md):12 actual raw/commands/status/SHA и6 собственных сессий совпали; Python независимо пересчитал3408 тройки/медианы/min/max, shared pure rebuild дал byte-equal полную сводку. Находок нет.

Итоговый smoke: web350м/p95 18,5мс, Steam Deck high CPU×3 328м/p95 22,1мс, console errors0/crashlog пуст. Shift-loading: реальный вход26,2с/33из1776участков,101м и новый район15,8с — отдельный CPU×1 seed7 сценарий, не медиана обычной12.256 отложенных переводов — предупреждение; языки кромеru/en, телефоны и kids не проверялись.
