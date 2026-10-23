/* Пауза (04.10.2026): сверху — чек смены (до конца смены, доставлено, заработано, респект…) и
   накладная (текущий заказ, адрес, сколько до точки), внизу — полоса кнопок-карточек, как в главном
   меню (carousel.js): продолжить · карта района · [повтор последних 10 с (replay.js) — только если он включён, с 23.10.2026 выкл] · музыка: трек (music.js) · настройки (те же, что в главном меню, settings.js)
   · управление (настройки сразу на табе «управление») · закончить смену. Без прокрутки на любом
   экране; листок, который не влез, листается внутри себя. Правила — docs/CAREER.md «Пауза».
   Кнопки и листки — те же элементы из index.html (#pm-go, #pm-stats, #pm-order, #pm-map, #pm-menu):
   модуль только раскладывает их, обработчики — в game.js. Открыл паузу — в центре «продолжить».
   Стиль (09.10.2026, UI-REVIEW № 45): кнопки — бумажные ярлычки с дыркой под нитку, «продолжить» —
   красный штамп; «пауза» — жёлтый стикер. Значка кнопки [A] / [Enter] на ярлычках нет (автор, 10.10.2026):
   как выбрать — одной строкой внизу, как в главном меню («листай ◀ ▶ · выбрать [Enter]», по вводу — glyphs.js).

     PZ.init(elPause, { settings(tab), navReset, replay, music(), musicLabel() }) — из game.js один раз
     PZ.reset()      — при открытии паузы: в центр «продолжить»
     PZ.flip(±1), PZ.on() — листать (game.js padStep, career.js onKey)
     PZ.more()       — после renderPause: лист не влез — внизу «ещё ▼» (Р23-14) */
import './pausecz.css';
import { t } from '../i18n/index.js';
import { carousel } from './carousel.js';
import { keyHTML, onInput, inputKind } from '../input/glyphs.js';

let root = null, CZ = null, A = null;
const $ = id => document.getElementById(id);

export function init (el, api) {
  if (!el || CZ) return;
  root = el; A = api || {};
  const desk = el.querySelector('.pm-desk');
  const title = el.querySelector('.pm-t');
  const head = document.createElement('div');
  head.className = 'pz-head';
  if (title) head.appendChild(title);
  // сверху — чек смены и накладная: просто листки, геймпад на них не встаёт
  const top = document.createElement('div');
  top.className = 'pz-top';
  for (const id of ['pm-stats', 'pm-order']) { const n = $(id); if (n) { const w = document.createElement('div'); w.className = 'pz-sheet'; w.appendChild(n); top.appendChild(w); moreTab(w); } }
  addEventListener('resize', () => { if (on()) more(); });
  const host = document.createElement('div');
  host.className = 'pz-host';
  const hint = document.createElement('div');
  hint.className = 'pz-hint';
  el.append(head, top, host, hint);
  // «настройки» и «управление» — новые кнопки; звук — теперь в настройках
  const mk = (id, tab) => {
    const b = document.createElement('button');
    b.type = 'button'; b.id = id;
    b.addEventListener('click', () => { if (A.settings) A.settings(tab); });
    return b;
  };
  const set = mk('pm-set'), ctrl = mk('pm-ctrl', 'ctrl');
  // «повтор последних 10 с» (replay.js): пауза закрывается, после повтора — снова пауза
  const rp = document.createElement('button');
  rp.type = 'button'; rp.id = 'pm-replay';
  rp.addEventListener('click', () => { if (A.replay) A.replay(); });
  if ($('pm-sfx')) $('pm-sfx').hidden = true;
  // «музыка: трек» (music.js): нажал — следующий трек, после последнего — «выкл», ещё раз — снова играет (телефон: без клавиш)
  const mu = document.createElement('button');
  mu.type = 'button'; mu.id = 'pm-music';
  mu.addEventListener('click', () => { if (A.music) A.music(); });
  const btnCard = (key, btn) => {
    const c = document.createElement('div');
    c.className = 'pz-card pz-btn';
    c.dataset.key = key;
    btn.setAttribute('data-main', '');
    c.appendChild(btn);
    return c;
  };
  const cards = [
    btnCard('go', $('pm-go')),
    btnCard('map', $('pm-map')),
    ...(A.replay ? [btnCard('replay', rp)] : []),   // повтор выключен (replay.js RP.ON) — пункта нет
    btnCard('music', mu),
    btnCard('set', set),
    btnCard('keys', ctrl),
    btnCard('end', $('pm-menu')),
  ];
  CZ = carousel(host, { cls: 'pz-cz', scales: [1, 0.86, 0.74], reach: 3, onChange: () => { if (A.navReset) A.navReset(); } });
  CZ.set(cards, 0);
  if (desk) desk.hidden = true;
  label();
}
/* подписи ярлычков; game.js renderPause меняет текст «закончить смену» / «в главное меню» и зовёт label().
   Значка кнопки на ярлычках нет — строка внизу (hint) */
export function label () {
  const b = $('pm-set'); if (b) b.textContent = t('настройки');
  const c = $('pm-ctrl'); if (c) c.textContent = t('управление');
  const r = $('pm-replay'); if (r) r.textContent = t('повтор последних 10 с');
  const m = $('pm-music'); if (m) m.textContent = (A && A.musicLabel ? A.musicLabel() : t('музыка')) + ' ▶';
  for (const id of ['pm-go', 'pm-map', 'pm-replay', 'pm-music', 'pm-set', 'pm-ctrl', 'pm-menu']) {
    const n = $(id);
    if (n) for (const k of n.querySelectorAll('.pp-key')) k.remove();
  }
  hint();
}
/* подсказка внизу — как в главном меню (menu.js hint): значком того, чем играют сейчас; пальцем — «свайп · тап» */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function hint () {
  const h = root && root.querySelector('.pz-hint');
  if (!h) return;
  h.innerHTML = inputKind().kind === 'touch' ? esc(t('листай свайпом · выбрать — тап'))
    : esc(t('листай ◀ ▶')) + ' · ' + esc(t('выбрать')) + ' ' + keyHTML('ok');
}
onInput(() => hint());
/* лист не влез (телефон боком, ревью 23.10 Р23-14): полоска прокрутки на телефоне почти не видна, и «звание», «сбито»
   терялись под обрезом. Пока лист не долистан до конца — внизу листа бумажная плашка «ещё ▼» поверх светлого
   затухания (прилипает к низу листа); тап по ней — лист листается вниз. Долистал — плашки нет.
   PZ.more() — после renderPause (game.js) и на повороте экрана */
function moreTab (w) {
  const b = document.createElement('div');
  b.className = 'pz-more-b';
  b.setAttribute('aria-hidden', 'true');
  b.addEventListener('click', e => { e.stopPropagation(); w.scrollBy({ top: Math.max(40, w.clientHeight * 0.7), behavior: 'smooth' }); });
  w.appendChild(b);
  w.addEventListener('scroll', () => moreOne(w), { passive: true });
  // портреты в накладной догружаются позже — высота листа меняется после renderPause
  if (typeof ResizeObserver === 'function' && w.firstElementChild) new ResizeObserver(() => moreOne(w)).observe(w.firstElementChild);
}
function moreOne (w) {
  const b = w.querySelector('.pz-more-b');
  if (b) b.innerHTML = '<span>' + esc(t('ещё ▼')) + '</span>';
  w.classList.toggle('pz-more', w.scrollHeight - w.scrollTop - w.clientHeight > 6);
}
export function more () { if (root) for (const w of root.querySelectorAll('.pz-sheet')) { w.scrollTop = 0; moreOne(w); } }
export function reset () { if (CZ) { CZ.go(0, true); label(); } }
export const on = () => !!(CZ && root && !root.hidden);
export function flip (d) { return on() && CZ.flip(d); }
export const DEBUG = { flip, reset, get key () { return CZ && CZ.card() ? CZ.card().dataset.key : null; } };
