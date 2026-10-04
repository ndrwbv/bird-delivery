/* Пауза (04.10.2026): сверху — чек смены (до конца смены, доставлено, заработано, респект…) и
   накладная (текущий заказ, адрес, сколько до точки), внизу — полоса кнопок-карточек, как в главном
   меню (carousel.js): продолжить · карта района · настройки (те же, что в главном меню, settings.js)
   · управление (настройки сразу на табе «управление») · закончить смену. Без прокрутки на любом
   экране; листок, который не влез, листается внутри себя. Правила — docs/CAREER.md «Пауза».
   Кнопки и листки — те же элементы из index.html (#pm-go, #pm-stats, #pm-order, #pm-map, #pm-menu):
   модуль только раскладывает их, обработчики — в game.js. Открыл паузу — в центре «продолжить».

     PZ.init(elPause, { settings(tab), navReset }) — из game.js один раз
     PZ.reset()      — при открытии паузы: в центр «продолжить»
     PZ.flip(±1), PZ.on() — листать (game.js padStep, career.js onKey) */
import './pausecz.css';
import { t } from '../i18n/index.js';
import { carousel } from './carousel.js';

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
  for (const id of ['pm-stats', 'pm-order']) { const n = $(id); if (n) { const w = document.createElement('div'); w.className = 'pz-sheet'; w.appendChild(n); top.appendChild(w); } }
  const host = document.createElement('div');
  host.className = 'pz-host';
  el.append(head, top, host);
  // «настройки» и «управление» — новые кнопки; звук — теперь в настройках
  const mk = (id, tab) => {
    const b = document.createElement('button');
    b.type = 'button'; b.id = id;
    b.addEventListener('click', () => { if (A.settings) A.settings(tab); });
    return b;
  };
  const set = mk('pm-set'), ctrl = mk('pm-ctrl', 'ctrl');
  if ($('pm-sfx')) $('pm-sfx').hidden = true;
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
    btnCard('set', set),
    btnCard('keys', ctrl),
    btnCard('end', $('pm-menu')),
  ];
  CZ = carousel(host, { cls: 'pz-cz', scales: [1, 0.86, 0.74], reach: 3, onChange: () => { if (A.navReset) A.navReset(); } });
  CZ.set(cards, 0);
  if (desk) desk.hidden = true;
  label();
}
export function label () {
  const b = $('pm-set'); if (b) b.textContent = t('настройки');
  const c = $('pm-ctrl'); if (c) c.textContent = t('управление');
}
export function reset () { if (CZ) { CZ.go(0, true); label(); } }
export const on = () => !!(CZ && root && !root.hidden);
export function flip (d) { return on() && CZ.flip(d); }
export const DEBUG = { flip, reset, get key () { return CZ && CZ.card() ? CZ.card().dataset.key : null; } };
