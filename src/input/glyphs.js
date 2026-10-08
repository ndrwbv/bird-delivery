/* Значки кнопок по текущему вводу (правило 10 «стиля накладной», docs/CAREER.md):
   на штампе и пометках — одна кнопка того, чем играют сейчас, а не «A, Enter или тап» сразу.

     import { glyph, keyHTML, onInput } from '../input/glyphs.js';
     glyph('ok')            → 'A' (геймпад) · 'Enter' (клавиатура) · '' (касание)
     btn.innerHTML = keyHTML('ok') + t('на новую смену');
     // <kbd class="pp-key" data-pp-key="ok">A</kbd> — значок сам меняется, когда игрок сменил ввод
     matchKey('x', e)       → true, если keydown e — клавиатурная пара действия (KeyX и т. п.)

   Действия: ok (главное, штамп) · back (назад) · x · y (пометки на полях) · lb · rb (страницы) ·
   pause. Ввод: 'pad' (Xbox / Steam Deck — A B X Y LB RB; PlayStation — ✕ ○ □ △ L1 R1),
   'kb' (клавиатура и мышь), 'touch' (палец — значков нет, жмут сам штамп).

   Как понимаем, чем играют: первое же нажатие геймпада (game.js padStep → setInput('pad'), по
   gamepad.js pad.lastUse; без game.js — body.pad) — «геймпад»; клавиша или мышь — «клавиатура»;
   касание — «касание». От простоя геймпада значок не гаснет: остаётся последний ввод.
   Песочница (без game.js) переключает руками: setInput('pad' | 'kb' | 'touch', 'xbox' | 'ps'). */

const PAD = {
  xbox: { ok: 'A', back: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', pause: '☰' },
  ps: { ok: '✕', back: '○', x: '□', y: '△', lb: 'L1', rb: 'R1', pause: '☰' },
};
// клавиатура: что нарисовано на значке и какие e.code его жмут (matchKey)
const KB = {
  ok: ['Enter', ['Enter', 'NumpadEnter', 'Space']],
  back: ['Esc', ['Escape', 'Backspace']],
  x: ['X', ['KeyX']],
  y: ['Y', ['KeyY']],
  lb: ['Q', ['KeyQ']],
  rb: ['E', ['KeyE']],
  pause: ['Esc', ['Escape']],
};

let kind = matchMedia('(pointer: coarse)').matches ? 'touch' : 'kb';
let family = 'xbox';
const subs = new Set();

const padFamily = () => {
  try {
    const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(Boolean);
    return gp && /054c|playstation|dualsense|dualshock|sony/i.test(gp.id) ? 'ps' : 'xbox';
  } catch (e) { return 'xbox'; }
};

/** значок действия act для ввода (по умолчанию — текущего); '' — не рисовать */
export function glyph (act, k = kind, fam = family) {
  if (k === 'touch') return '';
  if (k === 'pad') return (PAD[fam] || PAD.xbox)[act] || '';
  return KB[act] ? KB[act][0] : '';
}

/** разметка значка: <kbd class="pp-key" data-pp-key="ok">A</kbd>; пустой при касании (CSS прячет) */
export function keyHTML (act) {
  return `<kbd class="pp-key" data-pp-key="${act}">${glyph(act)}</kbd>`;
}

/** нажатие клавиатуры e — это клавиша действия act? */
export function matchKey (act, e) {
  return !!(KB[act] && e && KB[act][1].includes(e.code));
}

/** чем играют сейчас: { kind: 'pad' | 'kb' | 'touch', family: 'xbox' | 'ps' } */
export const inputKind = () => ({ kind, family });

/** подписаться на смену ввода: fn({ kind, family }); вернёт «отписаться» */
export function onInput (fn) { subs.add(fn); return () => subs.delete(fn); }

/** перерисовать все значки [data-pp-key] внутри root */
export function refreshKeys (root = document) {
  for (const el of root.querySelectorAll('[data-pp-key]')) {
    const g = glyph(el.dataset.ppKey);
    if (el.textContent !== g) el.textContent = g;
    el.classList.toggle('pp-key-kb', kind === 'kb');
  }
}

/** сменить ввод (сам — по событиям; руками — песочница и проверки) */
export function setInput (k, fam) {
  const f = k === 'pad' ? (fam || padFamily()) : family;
  if (k === kind && f === family) return;
  kind = k; family = f;
  if (typeof document === 'undefined') return;
  document.body.dataset.input = kind;            // body[data-input=pad|kb|touch] — для стилей
  refreshKeys();
  for (const fn of subs) { try { fn({ kind, family }); } catch (e) { /* — */ } }
}

if (typeof window !== 'undefined') {
  const boot = () => {
    document.body.dataset.input = kind;
    refreshKeys();
    // геймпад: game.js / langpick.js держат body.pad, пока его трогают
    new MutationObserver(() => { if (document.body.classList.contains('pad')) setInput('pad'); })
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });
  };
  if (document.body) boot(); else addEventListener('DOMContentLoaded', boot, { once: true });
  addEventListener('keydown', () => setInput('kb'), true);
  addEventListener('pointerdown', e => setInput(e.pointerType === 'touch' || e.pointerType === 'pen' ? 'touch' : 'kb'), true);
  addEventListener('gamepadconnected', () => { if (kind === 'pad') setInput('pad', padFamily()); });
}
