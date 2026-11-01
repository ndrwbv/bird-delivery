/* Карточка единственной карьеры: только чтение статистики, без смены и редактирования героя. */
import './couriercard.css';
import { t, tn } from '../i18n/index.js';
import { keyHTML } from '../input/glyphs.js';
import { heroName } from './playername.js';
import * as DIST from './districts.js';

let box = null, after = null;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => '&#' + c.charCodeAt(0) + ';');
const num = n => String(Math.max(0, Math.round(+n || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export function open ({ Store, money, face, onClose } = {}) {
  close(false);
  const get = (k, d = 0) => Store.get(k, d) ?? d;
  const shifts = Math.max(0, +get('dlv-shifts') || 0);
  const value = (k, v) => '<div class="cc-stat"><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>';
  const district = DIST.has() ? (DIST.allOpen() ? t('весь город') : t('районов {k} из {n}', { k: DIST.opened(), n: DIST.count() })) : '';
  box = document.createElement('div');
  box.id = 'courier-card';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'courier-card-title');
  box.innerHTML = '<section class="cc-sheet"><header><img src="brand/logo-256.jpg" alt=""><div><small>' + esc(t('Птица Пицца')) +
    '</small><h2 id="courier-card-title">' + esc(t('карточка курьера')) + '</h2></div></header>' +
    '<div class="cc-person">' + (face ? '<img class="cc-photo" src="' + esc(face) + '" alt="">' : '') +
    '<div><b class="cc-name">' + esc(heroName()) + '</b><p>' + esc(t('курьер')) + (district ? ' · ' + esc(district) : '') + '</p></div></div>' +
    '<dl class="cc-stats">' + value(t('стаж'), shifts ? tn(shifts, '{n} смена|{n} смены|{n} смен') : t('новичок')) +
      value(t('доставлено'), num(get('dlv-delivered'))) +
      value(t('лучшая смена'), +get('dlv-msk-best') > 0 ? money(+get('dlv-msk-best')) : t('ещё не было')) +
      value(t('в копилке'), money(+get('dlv-msk-wallet') || 0)) + '</dl>' +
    '<button type="button" class="pp-note cc-back" autofocus>' + keyHTML('back') + esc(t('назад')) + '</button></section>';
  after = onClose;
  (document.getElementById('game') || document.body).appendChild(box);
  box.querySelector('.cc-back').addEventListener('click', () => close());
  box.addEventListener('click', e => { if (e.target === box) close(); });
  box.querySelector('.cc-back').focus({ preventScroll: true });
}
export const root = () => box && box.isConnected ? box : null;
export function close (notify = true) {
  const cb = after;
  after = null;
  if (box) box.remove();
  box = null;
  if (notify && cb) cb();
}
