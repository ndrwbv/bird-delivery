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
   Подсветка видна, пока геймпад — последнее, чем трогали игру (мышь, тач, клавиши — гасят её);
   от простоя на открытом меню не гаснет. При показе экрана курсор сразу стоит на главном
   действии — кнопке с autofocus (или data-pad-main), нет такой — на первой. Если подсветки не было
   (меню показали, пока играли мышью), первое ↑↓←→ только зажигает её, никуда не уводя; A — жмёт,
   только если курсор на главном (не глядя — всегда «главное»). */

const FOCUSABLE = 'button, a[href], select, input:not([type=hidden]), textarea, .btn, [data-pad]';

const shown = el => {
  if (el.hidden || el.disabled || el.closest('[hidden]') || el.closest('[data-pad-skip]')) return false;   // data-pad-skip — соседние карточки карусели (carousel.js)
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};
const MAIN = '[autofocus], [data-pad-main]';

/* когда последний раз трогали мышь, тач или клавиши: позже геймпада — подсветку геймпада прячем.
   mousemove — только настоящий сдвиг: Хромиум шлёт «пустые» при смене экрана под стоящим курсором */
let lastOther = 0;
const DIMS = new Set();     // меню на геймпаде: при мыши / клавишах гасим сразу, до чужих обработчиков (KB карьеры)
if (typeof addEventListener === 'function') {
  const other = () => { lastOther = performance.now(); for (const f of DIMS) f(); };
  const o = { capture: true, passive: true };
  let mx = null, my = 0;
  for (const ev of ['pointerdown', 'wheel', 'keydown']) addEventListener(ev, other, o);
  addEventListener('mousemove', e => {
    if (mx !== null && Math.abs(e.screenX - mx) + Math.abs(e.screenY - my) <= 3) return;
    if (mx !== null) other();
    mx = e.screenX; my = e.screenY;
  }, o);
}
/** видна ли подсветка геймпада: подключён и трогали его позже мыши и клавиш (без lastUse — p.active, KB карьеры) */
export const padLit = p => !!(p && p.connected && (p.lastUse == null ? p.active : p.lastUse > 0 && p.lastUse >= lastOther));

const isText = el => el && ((el.tagName === 'INPUT' && /^(text|search|email|number|)$/.test(el.type)) || el.tagName === 'TEXTAREA');

export function makePadMenu (opts = {}) {
  let sel = null, lit = false, lastRoot = null;

  const mark = el => {
    if (sel === el && lit === !!el) return;
    if (sel) sel.classList.remove('padsel');
    sel = el; lit = !!el;
    if (sel) {
      sel.classList.add('padsel');
      // в текстовое поле фокус не ставим: на Deck это сразу поднимает клавиатуру
      if (!isText(sel)) { try { sel.focus({ preventScroll: true }); } catch (e) { /* — */ } }
      sel.scrollIntoView?.({ block: 'nearest' });
    }
  };
  const dim = () => { if (lit && sel) sel.classList.remove('padsel'); lit = false; };   // спрятать, место помнить

  function update (p, root) {
    if (root !== lastRoot) { mark(null); lastRoot = root; }
    if (p.lastUse != null) DIMS.add(dim);        // настоящий геймпад (у KB карьеры lastUse нет — его не гасим)
    if (!root || !p.connected) { if (sel) mark(null); return; }
    if (!padLit(p)) { dim(); return; }
    const items = Array.prototype.filter.call(root.querySelectorAll(FOCUSABLE), shown);
    if (!items.length) { mark(null); return; }

    const main = items.find(el => el.matches(MAIN)) || items[0];
    const woke = !lit;                           // подсветки не было — это нажатие только будит
    let i = items.indexOf(sel);
    if (i < 0) mark(main); else if (woke) mark(sel);
    i = items.indexOf(sel);
    if (woke) {
      if (p.menuOk && sel === main && !isText(sel)) sel.click();   // A не глядя — всегда главное
      else if (p.menuBack && opts.onBack) opts.onBack(root);
      return;
    }

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
  update.select = el => mark(el);               // поставить курсор самому (сетка «мои находки» — ↑↓ по рядам, collect.js)
  return update;
}
