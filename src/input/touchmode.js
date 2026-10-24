/* ──────────────────────────────────────────────────────────────────────────
   Экранное управление (руль, педали, кнопки на картинке) — когда правда трогают экран (0п67, автор 24.10.2026:
   «на ноутбуке не получается вертеть камерой, т. к. появляется управление через экран»).

   - Телефон (палец — главный указатель, мыши нет) — сразу с экранным управлением, как раньше.
   - Ноутбук с сенсорным экраном (есть и мышь / тачпад) — с начала клавиатура и мышь; экранное управление
     появляется с первым касанием экрана и прячется снова, как только двигают мышь (больше MOUSE_PX точек),
     крутят колесо или жмут клавишу (не в поле ввода — экранная клавиатура телефона не в счёт).
   - Держит body.touch (по нему — стили и «телефонные» подсказки) и сообщает подписчикам (game.js, glyphs.js).
   ────────────────────────────────────────────────────────────────────────── */
const W = typeof window !== 'undefined' && typeof document !== 'undefined';
const mm = q => { try { return matchMedia(q).matches; } catch (e) { return false; } };
export const MOUSE_PX = 12;                       // столько точек мышью подряд — значит, играют мышью
/** умеет ли устройство касания вообще */
export const CAN = W && (mm('(pointer: coarse)') || (navigator.maxTouchPoints > 0 && 'ontouchstart' in window));
/** с чего начинаем: телефон / планшет — по имени браузера (iPhone, iPad, Android; iPad «как Мак») или палец главный и
    наведения нет / точного указателя нет. Ноутбук с тачскрином: главный — мышь (pointer: fine, hover: hover) — не телефон */
const UA = W ? (navigator.userAgent || '') : '';
const PHONE = CAN && (/iPhone|iPad|iPod|Android/i.test(UA) || (/Macintosh/.test(UA) && (navigator.maxTouchPoints || 0) > 1)
  || (mm('(pointer: coarse)') && (mm('(hover: none)') || !mm('(any-pointer: fine)'))));
let on = PHONE;
const subs = new Set();

/** экранное управление сейчас включено? */
export const touchOn = () => on;
/** подписаться: fn(on) — при каждой смене; вернёт «отписаться» */
export function onTouchMode (fn) { subs.add(fn); return () => subs.delete(fn); }

/** включить / выключить (сам — по событиям; руками — проверки: __dlv) */
export function setTouch (v) {
  v = !!v;
  if (v === on) return;
  on = v;
  if (W && document.body) document.body.classList.toggle('touch', on);
  for (const fn of subs) { try { fn(on); } catch (e) { /* — */ } }
}

if (W) {
  const typing = t => !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''));
  let px = 0;
  // capture: раньше игры — первое же касание уже идёт как касание (руль, взгляд пальцем)
  addEventListener('pointerdown', e => { if (e.pointerType === 'touch') { px = 0; setTouch(true); } }, true);
  addEventListener('pointermove', e => {
    if (!on || e.pointerType !== 'mouse') return;
    px += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
    if (px >= MOUSE_PX) { px = 0; setTouch(false); }
  }, true);
  addEventListener('wheel', () => { if (on) setTouch(false); }, { capture: true, passive: true });
  addEventListener('keydown', e => { if (on && !typing(e.target)) setTouch(false); }, true);
  const boot = () => document.body.classList.toggle('touch', on);
  if (document.body) boot(); else addEventListener('DOMContentLoaded', boot, { once: true });
}
