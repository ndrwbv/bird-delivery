# CI attempt04: опубликованный v0.33.10

Workflow [41366554426](https://github.com/ndrwbv/bird-delivery/actions/runs/41366554426) завершён success. [Релиз v0.33.10](https://github.com/ndrwbv/bird-delivery/releases/tag/v0.33.10) опубликован **2026-11-02 00:38:28 UTC**, Git commit `2bd815edfedefe8edc2b68ea72a57592677655e1`. В архиве сохранены фактически полученные GitHub JSON с jobs и release assets/body: required meta/prepare-land/windows/linux/release/pages — success, yandex — skipped. Бинарные release assets не скачивались и не копировались.

Измеренные Windows/Linux smoke запускают Steam из **app.asar**, cold fresh high, CPU1, admission=settled. Это функциональная проверка CI, не физический Steam Deck и не startup A/B. Сохранены original raw/run/fixture/stdout/stderr без переписывания CI путей, actual argv/PID/status/signal, raw/fixture/harness SHA. Независимый offline audit повторно сверил SHA с run-record, ASAR/catalog/cache и actual viewport/control/movement.

| Proof | Linux | Windows |
|---|---|---|
| Process status / renderer errors / uncaught / crash | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| Actual CDP viewport / DPR | 1280×800 / 1 | 1280×800 / 1 |
| Native content size | 1280×800 | 1024×720 |
| Пакет / cleanCalls | cache restored / 0 | cache restored / 0 |
| Actual движение после контроля, м | 0.16326654360358986 | 0.34689210233132256 |

Оба first.control имеют guardVersion2, drive/localReady/supportReady и paused/map/held=false, получены после настоящего shift.request menuKey=go. Движение положительное и соответствует original run/raw; это минимальное CI-свидетельство перемещения, не полноценный заезд или геометрическая приёмка. Streaming supportReady=true; built=false не переименовано в готовность всего terrain. Native Windows window не объявлено 1280×800: CDP actual viewport и nativeContentSize сохранены раздельно.

Оба ASAR proof показывают одинаковый catalog SHA `f8a181903273368d7fcf96598061886cbdae3ec0e0f481ef5d21e3a6fd917f04`, gzip asset **34 231 591 bytes**, wire SHA `965ebbc0994bfe82e2943d1ee3f733a4cc8a273d4100adda8f0f0d649c32f9a4`, raw SHA `13b2851eaeb32e49d3f2865448a87b191ec6ef3839d747a597365e2e689aa89c`. Expected/actual hashes совпали; hit=true, reason=null, fatal=false, cleaned=true, bufferHeld=false, cleanCalls0. Подготовленный package source fingerprint `0fd44d87acaaefeef93da4ac376070cd5a22474af7c4ffbf7c75e557704ec07e` — отдельная величина, не release Git commit 2bd815e.

Exact stderr оставлен целиком: Linux содержит нативные D-Bus сообщения, Windows — нативное GPU сообщение при завершении. Их не скрыли и не приравняли к renderer exception; recorded console errors/uncaught/crash — ноль. Harness pins Windows/Linux сохранены отдельно; текущий код вместо измеренного CI harness не подставлялся.

Для повторной проверки только этих небольших доказательств: `node docs/measurements/landpackage-2026-11-02/ci-attempt04/offline-proof-audit.mjs`. Скрипт не запускает игру, не обращается к GitHub и не читает ASAR/большие assets. Исходные download paths/байты/SHA — copy-records.json и archive-index.json; итоговая integrity — SHA256SUMS. Предыдущие CI attempts и общие документы не изменены.
