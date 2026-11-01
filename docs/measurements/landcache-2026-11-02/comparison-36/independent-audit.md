# Независимый offline аудит36 — №17а

36/36 PASS; 18 собственных cold/warm пар, 18 различных сессий; все сырые SHA, actual argv, full identity и статусы совпали. Очерёдность generated/cache меняется на втором повторе; n=3 в каждой из12 ячеек.

| Сценарий | Кеш процесса | Generated, с | Cache, с | Выигрыш, с | % |
|---|---|---:|---:|---:|---:|
| newbie | cold | 80.998 | 65.037 | 15.962 | 19.71 |
| newbie | warm | 80.593 | 65.168 | 15.425 | 19.14 |
| saved-near | cold | 81.311 | 65.720 | 15.591 | 19.17 |
| saved-near | warm | 81.044 | 65.381 | 15.663 | 19.33 |
| saved-far | cold | 71.907 | 55.905 | 16.002 | 22.25 |
| saved-far | warm | 71.864 | 55.874 | 15.990 | 22.25 |

Это медианы navigation→control, не paired-difference и не проверка физической Deck. Пересчитаны также process→control/click→control, сырые тройки/min/max и все 192 stage aggregates из comparison-summary.json.

Источник `fdb6923c13afc8f369b8c02931174fb953706d52fb5d3f347683dab0f2f6fcce`; build `382750aa2e2bf4cbfc5943c08b05c1b333f65ac419668c6f5c0d3917ba17760a`.

Во всех36: свежие guards v2, реальное движение W4.553–5.852м, localReady/supportReady, activate/align1; cache clean0/no worker и trusted SHA, generated clean1. У saved-near/far ровно один видимый picker action, район/пиццерия/координаты подтверждены. Шесть вручную просмотренных сырых примеров сохранены в audit JSON.

Ограничения:
- No asset/binary reads, source/build hash traversal or game launch: source/build authenticity is bound to saved shared preflight, not recomputed here.
- This is seed7 probe EDL on macOS arm64 Electron33/Chromium130, high/1280x800 CPU3; not ordinary production EDL or physical Steam Deck.
- Cold means owned Chromium cache/storage cleared; OS/driver caches uncontrolled; warm is a new process reusing its pair session.
- n=3 per cell; scripted menu/picker response and polling affect wall time. Import wall is not parse/CPU; app:// ResourceTiming is unavailable.
- Timing reports are not byte-exact geometry or memory proof; separate accepted geometry02 and root memory audit remain separate.

Реальных дефектов приёмки/данных в этой проверке не найдено. Память проверяет root отдельно. Binary assets и source/build traversal не читались; проект не менялся, новых игровых запусков нет.
