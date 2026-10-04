/* Навигация по меню геймпадом.

   На Steam Deck мышь — только тачпад, поэтому заставка («поехали», «просто покататься»,
   магазин), пауза, обед, магазин и коллекции должны листаться крестовиной или стиком и
   нажиматься A. Модуль держит выбранный элемент, подсвечивает его классом `padsel`
   (стиль — padmenu.css) и жмёт по menuOk.

     import { makePadMenu } from '../input/padmenu.js';
     const menu = makePadMenu({ onBack: () => …, onText: el => … });
     // в кадре: menu(pollPad(), видимыйЭкранИлиNull)

   ↑↓ (и ←→ на обычных кнопках) — предыдущий/следующий, ←→ на ползунке и списке меняют
   значение, A — нажать (галочку переключает), B — onBack(). onText(el) зовётся на A по
   текстовому полю — туда удобно повесить экранную клавиатуру Steam (Platform.steam.textInput).
   Подсветка появляется только когда играют на геймпаде (pad.active), мышью — не мешает. */

const FOCUSABLE = 'button, a[href], select, input:not([type=hidden]), textarea, .btn, [data-pad]';

const shown = el => {
  if (el.hidden || el.disabled || el.closest('[hidden]') || el.closest('[data-pad-skip]')) return false;   // data-pad-skip — соседние карточки карусели (carousel.js)
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};
const isText = el => el && ((el.tagName === 'INPUT' && /^(text|search|email|number|)$/.test(el.type)) || el.tagName === 'TEXTAREA');

export function makePadMenu (opts = {}) {
  let sel = null, lastRoot = null;

  const mark = el => {
    if (sel === el) return;
    if (sel) sel.classList.remove('padsel');
    sel = el;
    if (sel) {
      sel.classList.add('padsel');
      // в текстовое поле фокус не ставим: на Deck это сразу поднимает клавиатуру
      if (!isText(sel)) { try { sel.focus({ preventScroll: true }); } catch (e) { /* — */ } }
      sel.scrollIntoView?.({ block: 'nearest' });
    }
  };

  function update (p, root) {
    if (root !== lastRoot) { mark(null); lastRoot = root; }
    if (!root || !p.connected || !p.active) { if (sel) mark(null); return; }
    const items = Array.prototype.filter.call(root.querySelectorAll(FOCUSABLE), shown);
    if (!items.length) { mark(null); return; }

    let i = items.indexOf(sel);
    if (i < 0) { mark(items.find(el => el.hasAttribute('autofocus')) || items[0]); i = items.indexOf(sel); }

    const t = sel.tagName === 'INPUT' ? sel.type : sel.tagName === 'SELECT' ? 'select' : '';
    const horiz = (p.menuRight ? 1 : 0) - (p.menuLeft ? 1 : 0);
    let step = (p.menuDown ? 1 : 0) - (p.menuUp ? 1 : 0);

    // ←→ на ползунке и списке меняют значение, на остальном — листают как ↑↓
    if (horiz && t === 'range') {
      const sv = +sel.step || 1;
      sel.value = String(Math.min(+sel.max || 100, Math.max(+sel.min || 0, +sel.value + horiz * sv)));
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (horiz && t === 'select') {
      const n = sel.options.length;
      if (n) { sel.selectedIndex = (sel.selectedIndex + horiz + n) % n; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    } else if (horiz && !step) step = horiz;

    if (step) { mark(items[(i + step + items.length) % items.length]); return; }

    if (p.menuOk && sel) {
      if (t === 'checkbox' || t === 'radio') { sel.checked = t === 'radio' ? true : !sel.checked; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      else if (isText(sel)) { if (opts.onText) opts.onText(sel); else sel.focus(); }
      else sel.click();
    } else if (p.menuBack && opts.onBack) opts.onBack(root);
  }
  update.clear = () => { mark(null); lastRoot = null; };
  update.selected = () => sel;
  return update;
}
