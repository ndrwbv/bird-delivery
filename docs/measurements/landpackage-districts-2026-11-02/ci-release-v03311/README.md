# Релиз v0.33.11: доказательства подготовки и упакованного запуска

**Завершено:** [релиз v0.33.11](https://github.com/ndrwbv/bird-delivery/releases/tag/v0.33.11) опубликован **2026-11-02T01:47:41Z**. [Релизный CI](https://github.com/ndrwbv/bird-delivery/actions/runs/41371474851) — SUCCESS; подготовка, Linux, Windows, выпуск и шаг выгрузки Pages завершены. Отдельное [развёртывание Pages](https://github.com/ndrwbv/bird-delivery/actions/runs/41374375401) — SUCCESS на gh-pages `c4eb6202e02ce7dd4f2b87405d0b732e5a5e7fb6`. Это отдельное подтверждение развёртывания, а не только push в gh-pages. Предыдущий парный dynamic-run отменён; его небольшая исходная metadata сохранена.

## Какая версия проверена

- Коммит релиза: `93667c1d160deec5eb4c27ba5f29822f0182d7b1`.
- Функциональный sourceHash из **CI receipt**, не из текущего checkout: `36e181620e38931f15cd1fb40cb296e1c8751cefc60332c28cc094a6e752d679`.
- BuildHash подготовительной Steam-сборки: `f5de55c855090af8e380510b40c05ab9a8b9794186dafa88144e3936745a6d76`.
- Текущие незакоммиченные модули каталога адресов/кодека сюда не относятся. Локальный source capture для этого архива не запускался; исходная CI-инвентаризация находится в `prepared-land-proof/export-receipt.json`.

## Подготовка данных: 8/8

Каталог v2 содержит ровно **0/mid, 0/high, 3/high, 7/high**. Каждое сочетание экспортировано двумя независимыми cold-процессами с отдельными session/output. Все восемь использовали `--fresh`, без `--seed` и внешнего init-script. Для 3/7 — явные зрелые сохранения: 40 смен, восемь открытых районов, согласованные счётчики, подтверждённый праздник, city=false. Ручных singleprogress-маркеров/владельцев в fixtures нет.

Во всех восьми отчётах зафиксированы фактические district/PIZZA до LATE, неизменные координаты выбранной пиццерии и title во время экспорта. Графика и viewport соответствуют слоту, 1280×800. Descriptor подтверждает private ordinary EDL, baseSeed=0x5EED и host seed=null. cleanCalls=1; randomCalls=0 — счётчик синхронных возобновлений очистки, без отдельной инструментализации Worker RNG. CI round-trip сообщает byteExact=true/repeated=true; рабочий мир при проверке не восстанавливался.

У восьми результатов одинаковые exact precleanHash и SHA исходного файла; каталог естественно ссылается на одну entry для четырёх slots:

| Данные | Значение |
|---|---|
| precleanHash | `c7ac523ca000f3baea4d6d0e94aa122a9bccd4cf813cdb0919ca459b3a1d4dd4` |
| Raw bytes | 74952828 |
| Raw SHA256 | `24bdea536a1a6491a06e2a531f588b1606ac21b0bae2529ea83b5644226be01c` |
| CI gzip bytes | 34231572 |
| CI gzip SHA256 | `278b3223bc7420a119af4e1198e2a57068dd8f850daa5386ef04c3c2fe806744` |
| ASAR/emit catalog SHA256 | `5e70bb50c2b139570b8f61e695019364f84b669a3d72305962afaf00bf33772e` |

Сжатый SHA относится именно к этому CI-пакету. Побайтовое равенство с локальными `.gz` не заявляется; сравнение распакованных данных опирается на указанный raw SHA. Большие `.land/.gz` не скачивались и не читались при создании архива. Локальный offline-аудит проверил исходные report/fixture/log SHA и metadata; actual byteExact/repeated — результат CI, не повторная локальная работа с файлом земли.

## Linux и Windows: готовая ASAR и реальное управление

Обе CI-проверки читают каталог/asset из настоящего `resources/app.asar/dist/steam`. ASAR proof связывает sourceHash, catalog SHA и упакованный gzip SHA. Затем штатное меню → Go → guardVersion2/готовая земля → настоящее W-движение. Контрольный район здесь **0**, high, Deck viewport1280×800, CPU×1, seed=null. Проверки отдельных районов 3/7 в этом архиве — menu-only экспорты; они не выдаются за packaged UI-приёмку этих районов.

| Платформа | Реальное движение W | Очистка | Активация/выравнивание | Ошибки |
|---|---:|---:|---:|---:|
| Linux | 0.163266544 м | 0 | 1 / 1 | 0 |
| Windows | 0.163266544 м | 0 | 1 / 1 | 0 |

Cache restored, bufferHeld=false, fatal=false; wire/raw SHA совпадают с выбранной entry и v2-slot. Bootstrap observer подтвердил создание маркера до `__boot`. Это **settled admission** после готовой очереди, не серия сравнения времени, не оценка ускорения и не физическая Steam Deck. Времена из raw-отчётов не интерпретируются как новые A/B-медианы.

## Состав и воспроизведение аудита

- `prepared-land-proof/`: оригинальные 36 небольших файлов CI — подготовка, receipt, восемь raw-отчётов, fixtures, stdout/stderr.
- `land-package-runtime-linux/`, `land-package-runtime-win/`: по шесть оригинальных файлов — ASAR proof, run/raw, fixture, logs.
- `*-observed.json`, `*-final.json`, `pages-latest.json`: исходные ответы GitHub API, включая первоначальные pending и окончательные success. `release-workflow-93667c1.yml` декодирован из ответа contents с точным ref коммита; исходный ответ тоже сохранён.
- `original-files.json`: исходные artifact id/name, ZIP SHA (сверен с GitHub artifact digest), SHA/размер каждого из 48 оригинальных файлов. ZIP-обёртки хранятся только вне репозитория в `/tmp`.
- `derived/catalog-reconstructed-compact.json`: явно производный compact JSON из каталога внутри preparation; его SHA совпадает с ASAR/emit SHA. Это не объявляется отдельно скачанным исходным файлом. Первоначальная ошибка разработки offline-аудита «pretty вместо compact emit» исправлена; CI-отчёты не менялись.
- `audit.mjs`, `validation.json`: независимый metadata-only аудит; запускается `node docs/measurements/landpackage-districts-2026-11-02/ci-release-v03311/audit.mjs`. Он не импортирует текущие игровые/проверочные модули и не читает большие assets.
- `archive-index.json`: размер и SHA всех файлов архива, кроме самого индекса.

Здесь нет release-бинарников, ZIP сборок, подготовленного файла земли, нового запуска игры или захвата текущего WIP-источника. Четыре релизных asset присутствуют только как authoritative metadata в release JSON.
