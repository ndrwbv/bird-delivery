/* Перезапуск CSS-анимации без принудительной раскладки страницы (docs/AGENTS.md → «Достройка города на Деке, второй заход»,
   23.10.2026).

   Было: el.classList.remove(c); void el.offsetWidth; el.classList.add(c). Чтение размера посреди кадра смены, когда хад
   в этом же кадре уже менялся, заставляет браузер разложить всю страницу заново — на Деке 1—5 мс в одном шаге мира
   (респект за сбитого митингующего, удар — сердца, деньги, бирки заказа). Теперь класс снимается сразу, а ставится
   через кадр (двойной requestAnimationFrame: между ними точно был пересчёт стилей, анимация начнётся заново) — на
   кадр-два позже, на глаз то же.

     restart(el, cls, ...also)  — снять cls (и also), через кадр поставить cls; второй вызов до того — побеждает последний
     afterPaint(fn)             — fn сразу после ближайшей отрисовки кадра: раскладка свежая, чтение размеров дёшево */
const Q = new Map();
let on = false;
function flush () {
  on = false;
  const L = [...Q];
  Q.clear();
  for (const [el, c] of L) el.classList.add(c);
}
export function restart (el, cls, ...also) {
  if (!el) return;
  el.classList.remove(cls, ...also);
  Q.set(el, cls);
  if (!on) { on = true; requestAnimationFrame(() => requestAnimationFrame(flush)); }
}
export function afterPaint (fn) {
  requestAnimationFrame(() => setTimeout(fn, 0));
}
