# Ordinary12 attempt02 — 12/12 PASS

2026-11-02. Одна законченная серия на неизменяемой финальной Steam-сборке. Все12 процессов PASS: outer/inner status0, signalnull, errors[], uncaught0, crash[]. Ровно6 собственных профилей: три generated cold→warm пары и три cache cold→warm пары. Порядок вариантов по повтору G-C / C-G / G-C; попыток сверх12, retry и resume нет. Полный source/build preflight выполнен ровно один раз до серии; между процессами проверялись только небольшие pins, файлы игровых assets повторно не хешировались.

Медианы `first.control` от renderer/navigation origin, секунды; по3 наблюдения в каждой группе:

| Фаза | Generated | Cache | Меньше, с | Меньше, % | n generated / cache |
|---|---:|---:|---:|---:|---:|
| cold | 81.3124 | 66.0348 | 15.2776 | 18.79% | 3 / 3 |
| warm | 81.4429 | 65.6566 | 15.7863 | 19.38% | 3 / 3 |

Это четыре медианы одной серии для fresh newbie district0, stored high graphics, Deck viewport1280×800, CPU×3/bootcpu/mute, обычного EDL-owned жребия base0x5EED без `--seed`. Generated добавляет только `landpackage=0`; cache работает по обычному default пакету. Host — macOS arm64 в тестовом Electron; physicalDeck=false. Cold очищает собственную Chromium-сессию; warm запускает новый процесс на её кеше с той же исходной fixture. Системный и драйверный кеш не контролируются. n3 — малая серия, не оценка распределения всех компьютеров, сезонов, районов или сохранений. Память и геометрия проверялись отдельно; fullGpuByteExact=false. Измеренное ускорение не обещает тот же процент каждому игроку.

Source key `0fd44d87acaaefeef93da4ac376070cd5a22474af7c4ffbf7c75e557704ec07e`; build tree `2a4474c94d92bb413ed7dd132391044cef8ac89d671bc63e9c37d7be340d04b1`. Полные значения navigation/process/click timings и перекрывающихся work/wait стадий сохранены в исходных summary.json/manifest.json; их суммы не складываются. ResourceTiming app:// может быть пустым и не доказывает отсутствие I/O.

`manifest.json` хранит все12 результатов, actual probe argv, sessions/order, process statuses/signals, source/build/config/harness bindings; `runs/` — неизменённые raw/run/logs. `measured-harness/`, fixture/config/catalog и source-receipt/build-tree — небольшие протокольные файлы и инвентаризации, без build/binary/.land/.gz. Абсолютные пути в исходных JSON намеренно сохранены. `archive-audit.json` подтверждает копии, raw/record/harness SHA и обе группы статусов; `archive-inventory.json` хранит SHA/bytes всех payload файлов, исключая себя и top-level SHA256SUMS. Последний включает inventory.

Первая серия остаётся отдельно в ordinary12-attempt01: failed после первого успешного runtime из-за перезаписи метаданных gate pin. Она не переписана и не включена в эти медианы. Root разрешил только узкое разделение gate pin и startupValidation, после independent pure33 PASS запустил новую полную серию.

Отдельная находка финального main check (по отчёту root): tiny/web PASS, Steam build остановился на ожидаемом production guard `editor+package`. Причина — probe-build.cjs сам принудительно задаёт BIRD_EDITOR=1, поэтому удаление этой переменной из внешнего окружения не помогает. Source/helper/guard ради проверки не менялись. Root сохраняет первый check failure отдельно и повторяет только непрошедшие build-steam/shift-loading/progress-boot/smoke/crashlog без BIRD_LAND_DATA_DIR: это проверка штатной generated-ветки. Обычная package-ветка имеет отдельные ordinary12/ASAR proofs и собирается в CI обычным Vite. Эта инструментальная ошибка не меняет исходные результаты данной12-серии и не ослабляет production guard. См. main-check-tooling-note.json.
