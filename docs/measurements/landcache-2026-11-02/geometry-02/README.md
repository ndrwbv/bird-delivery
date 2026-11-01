# №17а — geometry attempt02: generated + locked cache PASS

2026-11-02. Ровно один новый generated process, затем один cache process на его закреплённых samples, после принятой root узкой правки BENCHES fixture. Оба exit0, outer.ok=true, result.ok=true; errors=[], uncaught0, crash0. Это отдельная приёмка вне startup timing, не дополнительные точки A/B/медиан и не физический Steam Deck.

Условия: один immutable /tmp/bird-landcache17a-protocol2-1102/steam, оригинальная newbie-1 fixture, явно --fresh, gfx high/deck1280×800/CPU×3/bootcpu/seed7/mute. В manifest.json точные argv, хэши eval/init/fixture и доверенный SHA cache. World/source/tools/probe/startup-ready не менялись. Eval заморожен на dd46fbf693c9e7649d382a32fc269d271e892cda0b29d42e46e02c0bdb23dd56 для обоих процессов.

| Проверка | Generated | Cache |
|---|---:|---:|
| Газон / мощение: реальные стоянки | 3 / 2 | 3 / 2 |
| Проезды: 2 границы +1 ready-cell стык в обе стороны | 6 | 6 |
| Local contour segments, плохие/узкие | 12,0/0 | 12,0/0 |
| Props / benches | 8 / 4 | 8 / 4 |
| SMASH benches с retained CPU range | 4 | 4 |
| Максимальный шаг кузова, м (порог<0.12) | 0.065580 | 0.089468 |
| Максимальное боковое отклонение, м (порог<0.75) | 0.009525 | 0.005114 |
| Максимальная ошибка высоты мощения, м (порог<=0.03) | 0.000000226 | 0.000000225 |
| Bumps / потеря HP | 0 / 0 | 0 / 0 |
| Activate / align calls | 1 / 1 | 1 / 1 |

Полный samples объект совпадает точно. Selected draw/query digest совпадает: 2dfb7542fb0021e7e4ad1265b5813894071feede82e9cc3d9aefe1d286f98c1b. Предикаты query взяты из existing landcache-accept.js; normalize сохраняет undefined/non-finite/-0. Это выбранные CPU inputs, rendered=false; полный GPU byte-exact не заявляется.

Максимальная разница Y props=0, benchY=0, min/max/mean Y SMASH ranges=0. Availability CPU ranges одинакова и доступна у всех четырёх; тихого downgrade не было. Высоты поддержки по обе стороны выбранного стыка клеток совпали точно. Обе ветки localReady/supportReady, failed cells0. По выбранным width-лучам результат2м — верхний предел этой проверки, не глобальный минимум всего города.

Cache: source=cache, restored/hit/cleaned, cleanCalls0, bytes74735068. Observed/expected SHA оба 1d37b7f3c446150e8ad81b1047da9c97ed630d7e7f4edc3d785a1857199b7793.

Сырьё: generated.json/cache.json. Строгие independent result checks: generated-validation.json/cache-validation.json. summary.json — численные сравнения; manifest.json — происхождение/команды. locked-init.js получен existing geometry-init helper из УСПЕШНОГО generated report, без чтения cache до процесса. Копии eval/helper/малого actual-shape контракта и diff сохранены здесь. Никаких негативных игровых запусков этот агент не выполнял; слот возвращён root.

Предыдущий /tmp/bird-landcache17a-geometry-1102-steering-01 сохранён без перезаписи: fixture failure в BENCHES selector (предположение, что у всех prop есть pivot), outer exit0 ошибочно не принят из-за result.ok=false. Это не cache regression; cache там не запускался. Root разрешил attempt02 только после диагностики/узкого исправления/actual-shape contract и diff review.
