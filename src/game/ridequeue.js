/* Очередь того, что всплывает в езде (docs/UI-REVIEW.md № 41, docs/CAREER.md «Вручение пиццы — по очереди»).
   Раньше за 3 с вручения на экран лезло всё сразу: чек оплаты, деньги в пачку, тост «возвращайся»,
   Толик в чате, подсказка, достижение. Теперь — по одному:

     чек оплаты ~1,5 с → деньги летят в пачку (до 2,5 с) → Толик в чате (держит 1,5 с) →
     подсказка → достижение.

   Кто занимает экран — зовёт hold(ms): «следующим не высовываться ms миллисекунд». Подсказка
   (hints.js) ждёт busy() === false; пока занято, текущая подсказка прячется и её время стоит.
   Достижение (achievements.js) ждёт quiet(): не занято и подсказки на экране нет (mark('hint')); показалось —
   само держит экран 4,3 с, следующая подсказка ждёт его.

     RQ.hold(ms)          — занять экран на ms (popPay, Толик после вручения)
     RQ.busy()            — занято ли сейчас
     RQ.mark(id, on)      — «на экране висит id» (подсказка); quiet() ждёт, пока снимут
     RQ.quiet()           — не занято и ничего не висит
     RQ.whenQuiet(fn, maxMs, also) — позвать fn, когда станет тихо (и also(), если дано; проверка раз в 250 мс,
                            не дольше maxMs = 20 с) */

let until = 0;
const on = new Set();
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function hold (ms) { until = Math.max(until, now() + (ms || 0)); }
export function busy () { return now() < until; }
export function mark (id, v) { if (v) on.add(id); else on.delete(id); }
export function quiet () { return !busy() && on.size === 0; }
export function whenQuiet (fn, maxMs = 20000, also) {
  const t0 = now();
  const tick = () => { if ((quiet() && (!also || also())) || now() - t0 > maxMs) fn(); else setTimeout(tick, 250); };
  tick();
}
export const DEBUG = { get until () { return Math.max(0, until - now()); }, get on () { return [...on]; } };
