# Ordinary12 attempt01 — сохранённый отказ метаданных

Первый generated/cold runtime завершился успешно, но серия остановилась с `actual gate body differs`: `land-package-smoke.mjs` перезаписал provenance `record.gate={file,sha256}` результатом проверки `{ok,reasons}`. Источник0fd44d87… и final build2a4474c9… прежние. Это ошибка инструмента приёмки, не отрицательный результат игрового кеша.

Исходные manifest/raw/run/logs/frozen Node harness сохранены byte-exact; archive-inventory.json фиксирует SHA. Абсолютные пути в исходных JSON намеренно не переписаны. Assets и runtime game.js сюда не копировались. Серия остаётся failed, итоговых медиан нет; следующий запуск — отдельная попытка.

`tools/startup-ordinary-test.mjs` обязан отвергать исходный overwritten record. Для положительной проверки только в памяти создаётся явно помеченный syntheticProtocolCorrect record: исходный startupValidation переносится в собственное поле, gate pin восстанавливается из measured-harness. Игровой raw не меняется; это не настоящий новый run и не переклассификация attempt01.
