# №17б: наблюдавшиеся адресные input axes

Измеренный source fingerprint `875182ea37bc3dae1fdd5969e96106aab30ff1915bd7386c96a6278c679cf88b`, immutable build fingerprint `3b144028a7f2497037273f8ff83068f4a2282a566f72461c0773501c548c71d3`. Root before/after content pins exact и охватывают все пять actual процессов. Это fingerprints измеренных входов, не Git-коммиты. Сняты точные game/addressinput hook/addresscatalog/layout/orders/story/econ и пять pinned harness файлов; будущие codec/provider WIP сюда не включены и не переименованы в875.

## Пять процессов, а не две независимые серии

| Actual процесс | Root tool session | Child status | Наблюдавшаяся ось |
|---|---:|---|---|
| B1 | 24379 | exit0 | baseline season2.5 / actual trash0 |
| B2 | 64470 | exit0 | независимый повтор B1 |
| S | 1288 | exit0 | actual season0.5, forced=false |
| T первоначальный | 22001 | exit1 | fixture не прошёл actual trash assertion; observer result не возвращён |
| T targeted correction | 44583 | exit0 | legacy raw60000 → actual trash480000 / fraction1 |

Первоначальные config/audit/raw/logs/fixtures/eval сохранены отдельно в `original-series/`, включая audit.ok=false и неудачный T. `targeted-money-fix/` — точная новая конфигурация, которая **наследует прежние B1/B2/S raw SHA/commands/status/logs**, а не запускает их заново. Дополнительно был разрешён и выполнен только один T. Итого **4 PASS + 1 сохранённый FAIL**, не восемь новых запусков и не скрытый retry всей серии. Root parent tool status явно отделён от actual child command/PID/status записей.

## Результат и его предел

В четырёх passing случаях настоящие Go/picker/guard2/W, ordinary seed=null, high1280×800/deck, CPU1/bootcpu, ru. District0/opened8/city=false, машина semerka, остальные fixture/observed axes зафиксированы. Actual queries: **5061 realAddress, 7608 entranceLv + 7608 DOOR.lv, 1241 ordered POOL**; исходный functional oracle и direct helpers сохранены, не заменены copied lookup алгоритмом.

B1/B2 повторяемы; S и исправленный T имеют **EXACT menu data и exact query tables относительно B1**, включая фиксированные B1 query coordinates. Числа меню/координат/таблиц представлены точными IEEE754 little-endian hex; independent audit проверил exact codec roundtrip без округления/uint32 преобразования ID. Menu SHA `74aa716529b176bafa3a9aa75f08cd2c8c04609ba274cf879c3c0aed7a4e227a`, query tables SHA `b746e5416c83edcfefac875d4c215aed96b02703672fe4ffa852931b6144504c`. Saved keys/USED/случайный первый заказ проверяются внутри своего процесса; между процессами они не приравниваются.

Это наблюдение двух конкретных one-axis изменений: season2.5→0.5 и trash0→goal при остальных pinned inputs. **Нет earlyReady, reader, all-axes closure, RNG call-count proof, медиан или физического Steam Deck.** Readonly later arrays не являются ранним input key. Прочие данные мира/геометрии/визуала не объявлены одинаковыми по совпадению адресных таблиц.

## Ошибка исходного T и единственная коррекция

Первоначальный fixture задавал `dlv-don-trash=480000` без `dlv-money-x8`. Обычная MONEY_K8 migration обработала legacy input. Failed raw действительно содержит только `evalErr="addressClosure:actual trash input"`, observer/result отсутствует. Значение3840000 из unchanged source ×8 — **явно INFERRED root diagnosis**, не captured actual donation. Исходная diagnosis JSON сохранена дословно.

В targeted fixture изменено только `dlv-don-trash` на60000; marker не придуман и не добавлен. Теперь actual observer непосредственно вернул480000, fraction1. Это исправление тестового входа под реальную миграцию, не правка game/oracle/ожидаемой цели. Original failed fixture/raw/audit не переписаны.

## Артефакты и проверка

Functional body lineage: original SHA `eefafb2f9f082a6afe99ff162d453caec6a073cc0e03af14f1eb2e38f375216e`; adapted SHA `e62111d2746ede6f1754facb914dd3ea80a589a7f461eaf67cc09f0e68550644`. Exact adapter patch добавляет только B1 locked query inputs и ceiling60000 actual calls; исходные actual calls/oracles остаются. Full eval/locked eval/config/expected/fixtures/exact-values/source provenance сохранены, большие файлы gzip6 с проверкой byte-exact roundtrip. Пакеты данных/полная сборка не копировались.

Четыре passing stdout физически не скопированы: каждый byte-exact равен UTF-8 `JSON.stringify(raw.result)+"\n"`, original paths/bytes/SHA — stdout-records.json. Failed T stdout действительно пуст и сохранён как физический zero-byte файл. Восстановление passing примера: `node .../harness/reconstruct-stdout.mjs original-series:B1 /tmp/B1-reconstructed.stdout.log` (новый выходной путь).

Повторная archive-only проверка: `node docs/measurements/address-inputs-2026-11-02/harness/offline-audit.mjs`. Использует archived pinned startup-report, не текущее src/новые WIP файлы. Проверяет все actual raw SHA, команды/fixtures/eval hashes, inheritance, before/after pins, actual оси, точные таблицы/числа, сохранённый FAIL, stdout и source snapshots. Не запускает игру/build/probe и не изменяет оригинальные серии.

Завершённый root check40084 log сохранён полностью: web/steam builds, адресные8 tiny checks, Steam high CPU3 smoke317м/p95 20мс/crash0, одно предупреждение i18n256; длительность69с. Это отдельная проверка сборки, не новая серия axes/performance. Общие планы/документы и source/tools при архивации не изменялись. Полные SHA/байты/original path mappings — archive-index.json/copy-records.json/source-pins.json/SHA256SUMS.
