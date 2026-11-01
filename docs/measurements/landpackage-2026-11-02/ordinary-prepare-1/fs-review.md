# №17б: независимое чтение FS/pipeline/Vite/probe

02.11.2026. Прочитаны только небольшие tools/land-package-{files,build,prepare}.mjs, vite.config.js и места интеграции tools/probe.cjs. Прямое чтение файлов без shell/дочерних процессов, без tests/build/probe/Git, без source edits и чтения больших binaries. Текущая preparation у root не менялась.

Критических стоп-блокеров по прочитанному не найдено.

- Source key ацикличен: all src + Vite, dependency lock с исключением только root release version, фактические clipper bytes/package hash и preparation helpers. Generated outputs/catalog/build inventory не входят в input key. Хеш собственного текста helper допустим: значение hash не записывается внутрь исходника.
- LF для распознанных UTF8 text проверяется, raw binary bytes остаются точными; POSIX relative paths и стабильная сортировка. Build/source capture до/после подготовки и receipt revalidation до/после pull связывают заявленные inputs с конкретной immutable build. Новая key/canonical source tree копия не создаётся. Межплатформенный source/runtime результат пока не доказан этой проверкой.
- Probe ordinary setup запрещает --seed (включая0), произвольный init-script и профилировщики; host сам инжектирует лишь readonly wrapper base/limits/receiptHash. EDL guard различает OWN-at-import и текущий own hook. --fresh + own cold session + language/sound fixture; default-mid и saved-high сверяются по фактическим conditions. Нет forceStart/смены состояния.
- Каждый процесс и report/result/console/uncaught/crash проверяется; первая неудача прерывает цепочку, journal сохраняется. Две независимые попытки на preset сравниваются по полным manifest/identity/rawSHA/bytes. Разные preset могут дать разные preclean; один exact preclean обязан дать один resultSHA. Исходный failed report не подменяется retry.
- Каталог строится только из реально экспортированных exact inputs; transport gzip SHA и raw SHA/bytes разделены. Node gzip roundtrip byte-exact. Это ещё не замер стоимости renderer native inflate или доказательство памяти Deck.
- verifyLandPackage проверяет текущий source key, локальный asset path, полный transport SHA/bytes, bounded gunzip/rawSHA, header identity и настоящий codec с доверенными product limits. Vite plugin повторно сверяет asset SHA при emission; каталог в define и emitted catalog имеют один проверенный объект. Полный build/package hash остаётся внешним provenance.
- Host output path доверенный CLI, вне repo/dist, symlink ancestors проверяются; temp+fsync+hardlink не перезаписывают предыдущий final. Receipt перепроверяется перед публикацией; первичная ошибка сохраняется при cleanup. Renderer не получает файлового write API.

Реальная неточность reporttruth: preparation compression.decodeMs измеряет span от начала gunzipSync до ПОСЛЕ back.equals(raw), sha256(wire), построения entry и fs.writeFileSync(gzip). Значение — combined decode+verify+hash+disk, не pure decode. Root уведомлён и принял: текущий raw сохранить/подписать честно, после процесса переименовать будущий field без повторения этой попытки.

Оставшиеся gates не объявлены выполненными: результат текущих4 ordinary exports, renderer gzip/read memory/time, финальная build+packaged app:// SHA/read, Linux/Windows/physical Deck, CI release integration. Сейчас CI ещё не интегрирован. Создание каталога и source reader не заменяет эти проверки.
