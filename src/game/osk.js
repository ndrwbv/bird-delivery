/* Экранная клавиатура Стима для полей ввода текста (имя, новый профиль, переименовать) —
   docs/CAREER.md → «Экранная клавиатура Стима».

   Поле получило фокус (тап, окно само поставило фокус) или A геймпада на поле — в Стим-сборке на
   Деке, с геймпадом или касанием поднимаем клавиатуру Стима. Сначала большая
   (showGamepadTextInput): что ввёл — в поле. Вернулась пустой быстрее 0,4 с или молчит 1,5 с
   (Стим не запущен, ярлык «сторонней игры», оверлея нет) — не поднялась: тогда плавающая над
   полем (буквы идут в поле нажатиями клавиш) или steam://open/keyboard (electron/main.cjs
   steam:floatKeyboard). Отменил сам — больше не лезем. Мышью и клавиатурой на компьютере — не мешаем.
   A на поле поднимает клавиатуру всегда, даже если мы думаем, что она уже висит (её могли закрыть
   самим Стимом — игра этого не видит).

   Автоповтор гасим (буквы — в любом поле Стим-сборки на Деке, с геймпадом или касанием, даже если
   клавиатуру поднял сам Стим, Steam + X; Backspace и стрелки — только при нашей): клавиша с повтором
   (e.repeat), снова до своего отпускания (keyup, в течение 1 с), та же буква чаще 60 мс или парой
   «отпустил — нажал» ближе 8 мс (так приходит автоповтор под gamescope: флага repeat нет) — в поле не
   попадает; та же буква вставкой (beforeinput) чаще 60 мс — тоже. Первое нажатие клавиши проходит
   всегда. Клавиатура Стима под gamescope отпускает клавишу с опозданием, и Chromium дописывал букву
   автоповтором («одно нажатие — много букв», Дека, v0.8.0; снова «одну букву 10 раз» — 23.10.2026,
   фильтр был только при нашей клавиатуре и пропускал повтор парой).
   Пока плавающая клавиатура открыта нами (OSK.open — поле, над которым она висит):
   • по возврату фокуса в окно второй раз не поднимаем;
   • геймпад игре не отдаём (padGate) — но только пока клавиатура заведомо на экране: ждём ответа
     большой (≤ 1,5 с), 1,5 с после того, как подняли плавающую, и 1,5 с после каждой буквы с неё.
     Дальше геймпад снова у игры: A на поле — поднять заново, стрелки — уйти с поля, B — «клавиатуру
     закрыл» и это же нажатие идёт игре: окно имени закрывается с первого B (09.10.2026; было — B
     проглатывали, и закрыть окно можно было только вторым B).
   Закрытой клавиатура считается, когда фокус ушёл из поля внутри окна, нажали Enter / Esc / Tab,
   B на геймпаде, поле пропало со страницы или плавающая Стима сама сказала, что её закрыли.
   Обычная клавиатура компьютера (зажатая буква, Backspace с повтором) работает как раньше: фильтр
   включается только при нашей клавиатуре. */
import Platform from '../platform/index.js';
import { t as $t } from '../i18n/index.js';
import { pad as PAD } from '../input/gamepad.js';

const FAST_MS = 60;              // та же буква чаще — повтор (автоповтор 20—30 раз в секунду, пальцем так не нажать)
const PAIR_MS = 8;               // «отпустил» и снова «нажал» ближе — автоповтор парой событий, не палец
const HELD_MS = 1000;            // нажатие без отпускания: столько ещё считаем её зажатой (если keyup не пришёл вовсе)
const BIG_MS = 1500;             // большая клавиатура молчит столько — считаем, что не поднялась
const GATE_MS = 1500;            // геймпад — клавиатуре: столько после её подъёма и после каждой буквы
const AGAIN_MS = 300;            // A на поле второй раз за это время — то же нажатие, не поднимаем снова

export const OSK = { busy: false, el: null, t: 0, t0: 0, seq: 0, open: null, since: 0, key: 0, held: new Map(), ups: 0, ins: { data: '', t: 0, ups: -1 }, dropped: 0 };

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

/** плавающая клавиатура над полем (или steam://open/keyboard) — открытой считаем сразу, не дожидаясь
    ответа: плавающая Стима отвечает, только когда её закроют */
function floatOn (el) {
  if (!el.isConnected || !Platform.steam.floatKeyboard) return;
  try { el.focus({ preventScroll: true }); } catch (e) { /* — */ }
  const r = el.getBoundingClientRect(), k = devicePixelRatio || 1, t1 = performance.now();
  OSK.open = el; OSK.since = t1; OSK.held.clear(); OSK.ins.t = 0;
  Promise.resolve()
    .then(() => Platform.steam.floatKeyboard(Math.round(r.left * k), Math.round(r.top * k), Math.round(r.width * k), Math.round(r.height * k)))
    .then(how => {
      if (OSK.open !== el) return;
      if (!how) close();                                                  // не поднялась ни так, ни ссылкой
      else if (how === 'float' && performance.now() - t1 > 400) close();  // плавающая Стима ответила не сразу — её уже закрыли
    }, () => { if (OSK.open === el) close(); });
}

export function keyboard (el, force) {
  if (!isTextField(el) || !Platform.steam || !Platform.steam.textInput || OSK.busy) return;
  if (!force && !wanted()) return;
  const now = performance.now();
  if (OSK.el === el && now - OSK.t < (force ? AGAIN_MS : 800)) return;   // то же нажатие / тот же фокус второй раз подряд
  if (!force && openOn() === el) return;                                // фокус вернулся в окно — вторую не поднимаем; A — поднимаем всегда
  const id = ++OSK.seq, max = el.maxLength > 0 ? el.maxLength : 24;
  OSK.busy = true; OSK.el = el; OSK.t0 = now; OSK.t = now;
  let done = false, blurred = false;
  const onBlur = () => { blurred = true; };
  addEventListener('blur', onBlur);
  const finish = () => {
    removeEventListener('blur', onBlur);
    if (OSK.seq === id) { OSK.busy = false; OSK.t = performance.now(); }
  };
  // большая молчит 1,5 с: геймпад игре вернуть; окно фокус не теряло — значит, её и нет: плавающая
  const timer = setTimeout(() => { if (done) return; done = true; finish(); if (!blurred) floatOn(el); }, BIG_MS);
  Promise.resolve()
    .then(() => Platform.steam.textInput(el.placeholder || $t('имя'), max, el.value || ''))
    .then(v => {
      const late = done;
      done = true; clearTimeout(timer);
      if (typeof v === 'string') {                                       // ввёл в большой — в поле (даже если ответ пришёл поздно)
        if (el.isConnected) { el.value = v.slice(0, max); el.dispatchEvent(new Event('input', { bubbles: true })); }
        if (OSK.open === el) close();
        finish(); return;
      }
      if (late) return;
      finish();
      if (performance.now() - now > 400) return;                         // отменил сам
      floatOn(el);
    })
    .catch(() => { if (done) return; done = true; clearTimeout(timer); finish(); floatOn(el); });
}

/** геймпад игре не отдаём: true — кадр геймпада проглочен (padStep выходит) */
export function padGate (p) {
  if (OSK.busy) return true;                                         // ждём большую клавиатуру Стима (не дольше 1,5 с)
  if (!openOn()) return false;
  if (p.menuBack) { close(); return false; }                         // B — клавиатуру закрыли, и то же B — игре (закрыть окно)
  return performance.now() - Math.max(OSK.since, OSK.key) < GATE_MS; // только подняли или по ней печатают — кнопки её; иначе — игре
}

function drop (e) { e.preventDefault(); e.stopImmediatePropagation(); OSK.dropped++; }
/* фильтр повторов — над полем, где печатают экранной клавиатурой: нашей (OSK.open) или любой на Деке / с геймпадом /
   касанием (Стим-сборка) — её могли поднять и самим Стимом (Steam + X), игра этого не видит */
const guarded = el => !!el && (openOn() === el || (wanted() && isTextField(el) && document.activeElement === el));
const isChar = e => !!e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
function onKeyDown (e) {
  const el = e.target;
  if (!guarded(el)) return;
  if (e.isComposing || e.key === 'Process') return;
  const id = e.code + '|' + e.key, now = performance.now(), h = OSK.held.get(id), ours = OSK.open === el;
  if (ours) OSK.key = now;                                           // по клавиатуре печатают — геймпад её
  // повтор — только то, что пришло после первого нажатия этой клавиши: первое (даже с флагом repeat — Стим мог
  // поднять клавиатуру посреди нажатия) проходит всегда. Буква — ещё и повтор парой «отпустил-нажал» (меньше
  // PAIR_MS между ними: так автоповтор приходит под gamescope — флага repeat нет, keyup есть) и та же буква
  // чаще FAST_MS; прочие клавиши (Backspace, стрелки) — как раньше, только при нашей клавиатуре
  const rep = h && now - h.t < HELD_MS && (e.repeat || h.held || (isChar(e) && (now - h.t < FAST_MS || now - h.up < PAIR_MS)));
  if (rep && (ours || isChar(e))) { h.t = now; h.held = true; drop(e); return; }
  OSK.held.set(id, { t: now, up: -1e9, held: true });
  if (ours && (e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab')) close();
}
function onKeyUp (e) {
  if (!OSK.held.size) return;
  // отпустили клавишу — её нажатия больше не «зажаты» (по коду: Shift мог смениться между down и up)
  const now = performance.now();
  for (const [id, h] of OSK.held) {
    const [c, k] = id.split('|');
    if (e.code ? c === e.code : k === e.key) { h.held = false; h.up = now; }
  }
  OSK.ups++;
}
function onBeforeInput (e) {
  const el = e.target;
  if (e.inputType !== 'insertText' || !e.data || !guarded(el)) return;
  // та же буква вставкой чаще FAST_MS — повтор (и без нажатий клавиш: вставкой текста)
  const now = performance.now(), I = OSK.ins;
  if (I.data === e.data && now - I.t < FAST_MS) { I.t = now; drop(e); return; }
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
