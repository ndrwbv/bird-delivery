/* Перевод в новую пиццерию (автор 12.10.2026: «мне никто не сказал, что меня перевели в новую пиццерию»).
   Правила — docs/CAREER.md «Районы» → «Перевод — Толик говорит в начале смены».

   Открылся следующий район — следующая смена сразу там (districts.js countShift). Раньше об этом была только
   фраза Толика на стикере чека и жёлтая строка «район открыт!» — их пролистывали и не замечали. Теперь в
   начале первой смены в новой пиццерии Толик говорит окном разговора (dialog.js, ждёт «понял», мир не стоит):
   куда перевели (район и адрес пиццерии), почему (открылся район — повысили) и куда теперь возвращаться
   (на радаре и карте — уже эта пиццерия). Один раз на каждый перевод.

     TR.mark(Store, to, from)   — конец смены (career.js): открылся район to, работал в from
     TR.atStart(o)              — начало смены (career.js startShift): o = { Store, cur, city, addr(i) → адрес
                                  пиццерии района i, name(i) → название района, person — Толик (chat.js) }.
                                  Работаешь там, куда перевели, — Толик говорит; выбрал другой район или «весь город» —
                                  молча снимаем (в меню пропуск района и так всё показал)
     TR.pending(Store)          — { to, from } или null (отладка) */
import { t } from '../i18n/index.js';
import * as CHAT from './chat.js';

const KEY = 'dlv-transfer';
const SAY_DELAY = 900;                 // мс после старта смены: машина встала у пиццерии, мотор схватил

export function pending (Store) {
  const v = Store && Store.get(KEY, null);
  return v && Number.isFinite(+v.to) && +v.to >= 0 ? { to: +v.to, from: Number.isFinite(+v.from) ? +v.from : -1 } : null;
}

export function mark (Store, to, from) {
  if (!Store || !(to >= 0)) return;
  Store.set(KEY, { to, from: from >= 0 ? from : -1 });
}

/* текст Толика: район, адрес пиццерии, почему и куда возвращаться */
export function text ({ name, addr, from }) {
  const head = from
    ? t('короче, тебя повысили: отпахал своё в районе «{from}» — открылся район «{name}». с этой смены ты работаешь там.', { from, name })
    : t('короче, тебя повысили: открылся район «{name}». с этой смены ты работаешь там.', { name });
  const place = addr ? ' ' + t('новая пиццерия — {addr}, ты как раз у неё.', { addr }) : '';
  const back = ' ' + t('заказы теперь отсюда, и после каждого возвращайся сюда, а не в старую: на радаре и карте пиццерия уже эта.');
  const menu = from ? ' ' + t('захочешь обратно в район «{from}» — в меню «сменить район».', { from }) : '';
  return head + place + back + menu;
}

let LAST = '';                         // последняя сказанная фраза — для проверки (probe)
export const last = () => LAST;

export function atStart (o) {
  const p = pending(o && o.Store);
  if (!p) return false;
  o.Store.set(KEY, null);
  if (o.city || p.to !== o.cur) return false;   // ушёл в другой район или во «весь город» — перевод уже не новость
  const words = text({ name: o.name(p.to), addr: o.addr ? o.addr(p.to) : '', from: p.from >= 0 && p.from !== p.to ? o.name(p.from) : '' });
  LAST = words;
  setTimeout(() => {
    if (o.still && !o.still()) return;          // смену уже закончили / вышли в меню
    CHAT.say(words);
  }, SAY_DELAY);
  return true;
}
