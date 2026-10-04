/* Экранная клавиатура Стима для полей ввода текста (имя, новый профиль, переименовать) —
   docs/CAREER.md → «Экранная клавиатура Стима».

   Поле получило фокус (тап, A геймпада, окно само поставило фокус) — в Стим-сборке на Деке, с
   геймпадом или касанием поднимаем клавиатуру Стима. Сначала большая (showGamepadTextInput): что
   ввёл — в поле. Вернулась пустой быстрее 0,4 с — значит, не поднялась (Стим не запущен, ярлык
   «сторонней игры»): тогда плавающая над полем (буквы идут в поле нажатиями клавиш) или
   steam://open/keyboard (electron/main.cjs steam:floatKeyboard). Отменил сам — больше не лезем.
   Мышью и клавиатурой на компьютере — не мешаем.

   Пока плавающая клавиатура открыта нами (OSK.open — поле, над которым она висит):
   • автоповтор гасим: клавиша, пришедшая с повтором (e.repeat) или снова до своего отпускания
     (keyup), в поле не попадает; та же буква вставкой (beforeinput) чаще раза за 35 мс без
     отпускания между ними — тоже. Клавиатура Стима под gamescope отпускает клавишу с опозданием,
     и Chromium дописывал букву автоповтором («одно нажатие — много букв», Дека, v0.8.0);
   • второй раз клавиатуру не поднимаем — ни по возврату фокуса в окно, ни по A геймпада;
   • геймпад игре не отдаём (padGate): на Деке игра читает контроллер напрямую, и кнопки, которыми
     жмут буквы, листали бы меню и снова звали клавиатуру. B — «клавиатуру закрыл»: геймпад снова
     у игры (само нажатие B проглатываем).
   Закрытой клавиатура считается, когда фокус ушёл из поля внутри окна, нажали Enter / Esc / Tab,
   B на геймпаде или поле пропало со страницы. Обычная клавиатура компьютера (зажатая буква,
   Backspace с повтором) работает как раньше: фильтр включается только при нашей клавиатуре. */
import Platform from '../platform/index.js';
import { t as $t } from '../i18n/index.js';
import { pad as PAD } from '../input/gamepad.js';

const REPEAT_MS = 35;            // та же буква вставкой чаще — повтор
const HELD_MS = 1000;            // нажатие без отпускания: столько ещё считаем её зажатой (если keyup не пришёл вовсе)

export const OSK = { busy: false, el: null, t: 0, open: null, held: new Map(), ups: 0, ins: { data: '', t: 0, ups: -1 }, dropped: 0 };

export const isTextField = el => !!el && ((el.tagName === 'INPUT' && /^(text|search|email|)$/.test(el.type)) || el.tagName === 'TEXTAREA');
const wanted = () => Platform.id === 'steam' && !!Platform.steam && (!!Platform.steam.deck || !!PAD.active || matchMedia('(pointer: coarse)').matches);

/** клавиатура, открытая нами, ещё висит над этим полем */
function openOn () {
  const el = OSK.open;
  if (!el) return null;
  if (!el.isConnected || document.activeElement !== el) { close(); return null; }
  return el;
}
function close () { OSK.open = null; OSK.held.clear(); OSK.ins.t = 0; }

export function keyboard (el, force) {
  if (!isTextField(el) || !Platform.steam || !Platform.steam.textInput || OSK.busy) return;
  if (openOn() === el) return;                                       // уже висит над этим полем — не поднимаем вторую
  if (!force && !wanted()) return;
  if (OSK.el === el && performance.now() - OSK.t < 800) return;      // тот же фокус второй раз подряд
  OSK.busy = true; OSK.el = el;
  const t0 = performance.now(), max = el.maxLength > 0 ? el.maxLength : 24;
  const r = el.getBoundingClientRect(), k = devicePixelRatio || 1;
  Promise.resolve(Platform.steam.textInput(el.placeholder || $t('имя'), max, el.value || ''))
    .then(v => {
      if (typeof v === 'string') { el.value = v.slice(0, max); el.dispatchEvent(new Event('input', { bubbles: true })); return null; }
      if (performance.now() - t0 > 400) return null;                     // отменил сам
      try { if (el.isConnected) el.focus({ preventScroll: true }); } catch (e) { /* — */ }
      return Platform.steam.floatKeyboard && Platform.steam.floatKeyboard(Math.round(r.left * k), Math.round(r.top * k), Math.round(r.width * k), Math.round(r.height * k));
    })
    .then(how => { if (how && el.isConnected && document.activeElement === el) { OSK.open = el; OSK.held.clear(); } })
    .catch(() => {})
    .then(() => { OSK.busy = false; OSK.t = performance.now(); });
}

/** геймпад игре не отдаём: true — кадр геймпада проглочен (padStep выходит) */
export function padGate (p) {
  if (OSK.busy) return true;                                         // большая клавиатура Стима поверх
  if (!openOn()) return false;
  if (p.menuBack) close();                                           // B — клавиатуру закрыли, дальше геймпад у игры
  return true;
}

function drop (e) { e.preventDefault(); e.stopImmediatePropagation(); OSK.dropped++; }
function onKeyDown (e) {
  const el = openOn();
  if (!el || e.target !== el) return;
  if (e.isComposing || e.key === 'Process') return;
  const id = e.code + '|' + e.key, now = performance.now(), h = OSK.held.get(id);
  if (e.repeat) { if (h) h.t = now; else OSK.held.set(id, { t: now }); drop(e); return; }
  if (h && now - h.t < HELD_MS) { h.t = now; drop(e); return; }     // снова нажата, а отпускания не было — повтор
  OSK.held.set(id, { t: now });
  if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab') close();
}
function onKeyUp (e) {
  if (!OSK.open) return;
  // отпустили клавишу — её нажатия больше не «зажаты» (по коду: Shift мог смениться между down и up)
  for (const id of OSK.held.keys()) {
    const [c, k] = id.split('|');
    if (e.code ? c === e.code : k === e.key) OSK.held.delete(id);
  }
  OSK.ups++;
}
function onBeforeInput (e) {
  const el = openOn();
  if (!el || e.target !== el || e.inputType !== 'insertText' || !e.data) return;
  const now = performance.now(), I = OSK.ins;
  if (I.data === e.data && I.ups === OSK.ups && now - I.t < REPEAT_MS) { I.t = now; drop(e); return; }
  I.data = e.data; I.t = now; I.ups = OSK.ups;
}

let ready = false;
export function init () {
  if (ready) return;
  ready = true;
  addEventListener('keydown', onKeyDown, true);                      // раньше игры: повтор не доходит ни до поля, ни до меню
  addEventListener('keyup', onKeyUp, true);
  addEventListener('beforeinput', onBeforeInput, true);
  document.addEventListener('focusin', e => { if (isTextField(e.target)) keyboard(e.target); });
  // фокус ушёл из поля внутри окна — клавиатура своё отработала; ушло всё окно (клавиатура Стима
  // перехватила фокус) — поле в фокусе остаётся, клавиатура считается открытой
  document.addEventListener('focusout', e => { if (e.target === OSK.open) setTimeout(openOn, 0); });
}
