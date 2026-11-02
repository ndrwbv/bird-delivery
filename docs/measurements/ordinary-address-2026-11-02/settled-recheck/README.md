# Финальная проверка подготовки — 02.11.2026

Итоговый source: `ad8d466780cab3b6224b5b00d8e392c55b83c79c06d8ae9ae3791d3b4eb31820`, код выпуска — `2d37b8a5f247dfc09cd4a8746fb655be2bb5c77d`.

После первого отказа CI только процедура экспорта переведена на существующую settled-приёмку: настоящее готовое меню и ожидание реального движения до 30 с. Прежний ранний измерительный сценарий и legacy B1 не изменены. Во время адаптации исправлена проверка числовой метки __boot.full; промежуточный отказ сохранён [отдельно](../settled-gate-failure/archive-manifest.json).

Все четыре независимых экспорта mid/high прошли. Повторно проверены полные таблицы меню и функциональных запросов reader/generated, содержимое нового ASAR, ordinary mid/high без debug с точными ранними запросами, generated opt-out и функциональное сравнение без trace. Все процессы вернули exit 0 / signal null, все сохранённые gates — PASS. Файлы адресов по 413 028 байт. Состав: 1174 дома, 3699 сгенерированных входов, 5283 точки доставки, 12 исходных входов. Ранние 5061 адресный и 7608 этажных запросов совпали с действующими функциями игры.

| Пресет | Input SHA | Wire SHA |
|---|---|---|
| mid | `c30334cdeed08314c0a211e4904fc0d9617603e1f832908322394bec9a2d5af4` | `7f5f3a6fc2870bb0ec57350f340b815e895ecccbd2227d5181fc6081887b6f1a` |
| high | `0c38e941cc6617ad62be4cd8aad1983a432c803998aebb0faed665b662811783` | `64c19f60afb25b8c419d99c9b9bd4f703b5eedfadd4b5febc0854ed0b35765be` |

[Подготовка](evidence/preparation.json), [reader/generated и ASAR](evidence/consumer-protocol.json), [ASAR verifier](evidence/actual-asar.json), [mid](evidence/runtime-mid/run.json), [high](evidence/runtime-high/run.json), [generated](evidence/runtime-generated/run.json), [no-trace](evidence/notrace-protocol.json) и [серия после подготовки](runtime-series.json) содержат действительные команды и исходы. ASAR SHA: `7bfac71b39b68044ff5ce5b6f53f81987d324fdd0659fe118c87e3520e4bf6dc`, размер — 43486197 байт. Большой ASAR в репозиторий не включён.

[Сравнение исходников](source-comparison.json) подтверждает: все игровые файлы, Vite и нормализованные зависимости побайтно те же, что в первой общей проверке 43 пунктов. Поменялся producer, который входит в ключ источника. Общая игровая проверка не повторялась и не переназвана; после изменения отдельно прошли address-prepare (56 сценариев), startup-admission и address-smoke. Их фактические логи сохранены в evidence/focused-check.*.log.gz; наблюдённый root код завершения — 0.

[Архивный манифест](archive-manifest.json) проверяет байты, SHA и gzip roundtrip. Его границы те же, что в [первой записи](../README.md): эмуляция Deck на macOS, звук выключен, никаких новых выводов о скорости запуска. Поддержанный адресный вход ограничен первой свежей русской карьерой Deck mid/high. Глобальная очередь и правила выбора заказов сохранены. CI выпуска проверяет собственные Linux/Windows пакеты отдельно.
