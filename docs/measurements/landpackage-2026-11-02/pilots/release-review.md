# №17б: независимое чтение release integration

02.11.2026. Прочитаны .github/workflows/release.yml, tools/land-package-smoke.mjs, tools/land-package-verify-asar.mjs; дополнительно небольшие места probe/platform flags и .gitattributes. Только прямое чтение: shell/tests/build/probe/Git/source edits и binary/source traversal не выполнялись.

Публикационных блокеров в прочитанном не найдено.

- Порядок needs: meta → prepare-land → build Linux+Windows → release; fail-fast=false не разрешает release при ошибке одной OS. Steam artifacts загружаются после успешных ASAR/runtime gates; runtime proof upload always не делает failed job успешным.
- prepare-land один раз на Ubuntu/Xvfb выполняет build+4 ordinary exports, отдаёт только package/catalog+payload. build jobs скачивают его в runner.temp, npm version исключена из source key, затем Vite source/body/codec verification. LF-контракт src/Vite/source-key helpers/lock задан .gitattributes; path separators нормализуются в captureSource. Node actual dependency digest отдельно проверяется: несовпадение на Windows честно остановит сборку, не выдаст false hit. Число source key не пересчитывал, новые review-файлы вне source closure; я его не менял.
- Linux smoke под xvfb-run и no-sandbox child flags, Windows shell bash передаёт относительные forward-slash ASAR пути и quoted runner.temp output в Node. Яндекс по default false не собирается, отдельный job не получает land env/artifact. Pages mode=web и без build-job BIRD_LAND_DATA_DIR, поэтому land data туда не добавляется.
- upload prepared-land-data/proof и land-package-runtime-* не совпадают с release download pattern bird-pizza-*; в релиз попадают прежние четыре игровых файла. Неподготовленный/неполный пакет не пройдёт Vite source/asset check.
- ASAR verifier читает настоящий встроенный catalog, требует совпадения expected catalog, проверяет packed-only/no-link stat/bytes/SHA каждого payload и точную city-data file inventory. Лишние, отсутствующие, linked/unpacked или изменённые bytes отклоняются до release. Внешний --catalog у smoke нужен Node, который не понимает вложенный ASAR path; фактическую ASAR dist читает Electron.
- Smoke gate проверяет process/report/result, console/uncaught/crash, trace overflow/resource truncation, fresh control v2, W movement, ordinary owned EDL/seed=null/actual high Deck viewport, catalog wire/raw binding, clean0/no worker, activate+align1. Explicit per-OS runtime failure блокирует release. Файловая целостность raw/codecs уже проверена до bundle, ASAR wire equality сохраняет эту проверку для упакованных bytes.

Два ограничения/неблокирующих замечания:

1. Это packaged-dist smoke: node_modules Electron + tools/probe.cjs запускают renderer assets внутри выпускаемого ASAR. Он НЕ запускает release executable/electron/main.cjs, production app://birdpizza handler/native Steam bridge/installer. Не расширять вывод до полного installed-app acceptance или физической Deck. Root уведомлён.
2. В tools/land-package-smoke.mjs --phase=warm без --session сейчас создаёт новую UUID-сессию и не является warm reuse. CI использует default cold, поэтому текущий релизный gate не затронут. Для будущего warm CLI нужен explicit existing session guard; не повторять нынешние cold pilots из-за этого. Root уведомлён; source frozen, ничего не исправлял.

Предыдущая неточность preparation compression.decodeMs остаётся combined decode+verify+hash+disk span, renderer стоимость отдельно не доказана. CI YAML parser/реальный ASAR pilot сообщены root; эту проверку я не выполнял.
