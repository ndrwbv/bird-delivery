/* Прежняя очередь вручения (docs/UI-REVIEW.md № 41) — теперь обёртка над общей очередью уведомлений notifyq.js
   (автор 18.10.2026: «одно уведомление за раз», docs/CAREER.md «Одно уведомление за раз»). Чек оплаты, Толик,
   подсказки, достижения, задания, таблица рейтинга встают в notifyq сами; здесь — то, чем ещё пользуется game.js:

     RQ.hold(ms)          — больше ничего не делает (очередь сама держит экран, пока уведомление видно)
     RQ.busy()            — на экране уведомление или пауза между ними (NQ.busy)
     RQ.mark(id, on)      — больше ничего не делает
     RQ.quiet()           — не занято и никто не ждёт (NQ.idle)
     RQ.whenQuiet(fn, maxMs, also) — позвать fn, когда станет тихо (и also(), если дано; проверка раз в 250 мс,
                            не дольше maxMs = 20 с) */
import * as NQ from './notifyq.js';

export function hold () { /* очередь notifyq держит экран сама */ }
export const busy = () => NQ.busy();
export function mark () { /* — */ }
export const quiet = () => NQ.idle();
export function whenQuiet (fn, maxMs = 20000, also) {
  const t0 = Date.now();
  const tick = () => { if ((quiet() && (!also || also())) || Date.now() - t0 > maxMs) fn(); else setTimeout(tick, 250); };
  tick();
}
export const DEBUG = { get until () { return 0; }, get on () { return NQ.showing() ? [NQ.showing()] : []; }, NQ: NQ.DEBUG };
