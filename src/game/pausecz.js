/* Пауза — карусель карточек (04.10.2026), как главное меню и настройки (carousel.js): без
   прокрутки на любом экране. Правила — docs/CAREER.md «Пауза».

   Карточки: продолжить · чек смены (до конца смены, респект, сколько развёз) · накладная заказа ·
   карта района · настройки (те же, что в главном меню, settings.js) · управление · закончить смену.
   Кнопки и листки — те же элементы из index.html (#pm-go, #pm-stats, #pm-order, #pm-map,
   #pm-keys, #pm-menu): модуль только раскладывает их по карточкам, обработчики — в game.js.
   Открыл паузу — в центре «продолжить».

     PZ.init(elPause, { settings }) — из game.js один раз
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
  const host = document.createElement('div');
  host.className = 'pz-host';
  el.append(head, host);
  // «настройки» — новая кнопка; звук — теперь в настройках
  const set = document.createElement('button');
  set.type = 'button'; set.id = 'pm-set';
  set.addEventListener('click', () => { if (A.settings) A.settings(); });
  if ($('pm-sfx')) $('pm-sfx').hidden = true;
  const wrap = (key, node, cls) => {
    const c = document.createElement('div');
    c.className = 'pz-card' + (cls ? ' ' + cls : '');
    c.dataset.key = key;
    if (node) c.appendChild(node);
    return c;
  };
  const btnCard = (key, btn) => { const c = wrap(key, btn, 'pz-btn'); btn.setAttribute('data-main', ''); return c; };
  const stillCard = (key, node) => { const c = wrap(key, node, 'pz-still'); node.setAttribute('data-pad', ''); node.setAttribute('data-main', ''); node.tabIndex = -1; return c; };
  const cards = [
    btnCard('go', $('pm-go')),
    stillCard('stats', $('pm-stats')),
    stillCard('order', $('pm-order')),
    btnCard('map', $('pm-map')),
    btnCard('set', set),
    stillCard('keys', $('pm-keys')),
    btnCard('end', $('pm-menu')),
  ];
  CZ = carousel(host, { cls: 'pz-cz', onChange: () => { if (A.navReset) A.navReset(); } });
  CZ.set(cards, 0);
  if (desk) desk.hidden = true;
  label();
}
export function label () { const b = $('pm-set'); if (b) b.textContent = t('настройки'); }
export function reset () { if (CZ) { CZ.go(0, true); label(); } }
export const on = () => !!(CZ && root && !root.hidden);
export function flip (d) { return on() && CZ.flip(d); }
export const DEBUG = { flip, reset, get key () { return CZ && CZ.card() ? CZ.card().dataset.key : null; } };
