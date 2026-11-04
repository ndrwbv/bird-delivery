/* iPhone 4 в HUD: сообщения, заказ и рейтинг живут на одном экране телефона.
   Карта и текущая карточка заказа остаются снаружи, в левом углу игры. */
import './hudphone.css';
import { t } from '../i18n/index.js';
import * as HUDMAP from './hudmapios.js';

const H = { root: null, device: null, thread: null, banner: null, modal: null,
  visible: false, app: 'courier', order: null, messages: [], rating: null,
  shrink: 0, bannerTimer: 0, enterTimer: 0, resourcesKey: '',
  moneyElement: null, moneyParent: null };

const icon = kind => '<span class="hp-icon hp-icon-' + kind + '" aria-hidden="true"><i></i></span>';
const $ = s => H.root && H.root.querySelector(s);

function setApp (app) {
  if (!H.device) return;
  H.app = app;
  H.device.dataset.app = app;
  for (const el of H.device.querySelectorAll('[data-hp-app]')) el.hidden = el.dataset.hpApp !== app;
}

function open (app = 'messages') {
  if (!H.root || !H.visible) return;
  clearTimeout(H.shrink);
  setApp(app);
  H.root.classList.add('hp-expanded');
  if (app === 'messages') requestAnimationFrame(() => { H.thread.scrollTop = H.thread.scrollHeight; });
}

export function dock () {
  if (!H.root) return;
  clearTimeout(H.shrink);
  H.modal.hidden = true;
  document.body.classList.remove('hp-order-open');
  setApp('courier');
  H.root.classList.remove('hp-expanded', 'hp-new-message');
}

function banner (name, text) {
  $('.hp-banner-name').textContent = name;
  $('.hp-banner-text').textContent = text;
  H.root.classList.add('hp-notifying');
  clearTimeout(H.bannerTimer);
  H.bannerTimer = setTimeout(() => H.root.classList.remove('hp-notifying'), 3500);
}

function addMessage ({ name, role = '', text, avatar = '' }) {
  if (!H.root) return;
  H.messages.push({ name, role, text, avatar });
  if (H.messages.length > 40) H.messages.shift();
  H.thread.querySelector('.hp-message.latest')?.classList.remove('latest');
  const row = document.createElement('div'); row.className = 'hp-message latest';
  const meta = document.createElement('div'); meta.className = 'hp-message-meta';
  if (avatar) { const img = document.createElement('img'); img.src = avatar; img.alt = ''; meta.appendChild(img); }
  const who = document.createElement('b'); who.textContent = name;
  const time = document.createElement('small'); time.textContent = role ? role + ' · ' + t('сейчас') : t('сейчас');
  const labels = document.createElement('span'); labels.append(who, time); meta.appendChild(labels);
  const bubble = document.createElement('p'); bubble.textContent = text;
  row.append(meta, bubble); H.thread.appendChild(row);
  while (H.thread.children.length > 40) H.thread.firstChild.remove();
  H.thread.scrollTop = H.thread.scrollHeight;
}

function drawOrderMap (routeOverview) {
  if (!H.root) return;
  const canvas = $('.hp-order-map canvas');
  if (HUDMAP.overview(canvas, routeOverview)) return;
  const source = document.getElementById('radarc');
  if (!source || !source.width || !canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = source.width, h = w * canvas.height / canvas.width;
  ctx.drawImage(source, 0, (source.height - h) / 2, w, h, 0, 0, canvas.width, canvas.height);
}

export function init ({ visible = false } = {}) {
  if (H.root) return H.root;
  const root = document.createElement('div'); root.id = 'hud-phone';
  root.innerHTML = `<div class="hp-backdrop"></div>
    <div class="hp-device" role="group" aria-label="${t('телефон курьера')}">
      <i class="hp-mute-switch" aria-hidden="true"></i><i class="hp-volume hp-volume-up" aria-hidden="true"></i><i class="hp-volume hp-volume-down" aria-hidden="true"></i>
      <div class="hp-camera"></div><div class="hp-speaker"></div>
      <div class="hp-glass">
        <div class="hp-status"><span class="hp-health">♥ 6/6</span><span class="hp-clock">9:41</span><span class="hp-money-slot"><span class="hp-money-fallback">0 ₽</span></span></div>
        <button class="hp-banner" type="button" aria-label="${t('открыть сообщение')}">${icon('messages')}<span class="hp-banner-copy"><b>${t('Новое сообщение')} <em>${t('сейчас')}</em></b><strong class="hp-banner-name"></strong><span class="hp-banner-text"></span></span></button>
        <div class="hp-home" data-hp-app="home" hidden><div class="hp-wallpaper"></div><div class="hp-home-head">${t('Солнечный')}</div>
          <div class="hp-app-grid"><button type="button" data-open="messages">${icon('messages')}<span>${t('Сообщения')}</span></button><button type="button" data-open="courier">${icon('courier')}<span>${t('Птица Пицца')}</span></button></div>
          <div class="hp-home-dock"><button type="button" data-open="courier">${icon('courier')}</button><button type="button" data-open="messages">${icon('messages')}</button></div>
        </div>
        <section class="hp-app hp-courier-app" data-hp-app="courier"><header class="hp-nav"><b>${t('Птица Пицца')}</b><button type="button" data-open="messages" aria-label="${t('Сообщения')}">${icon('messages')}</button></header>
          <div class="hp-courier-scroll">
            <div class="hp-shift-earn"><small>${t('ЗАРАБОТАНО ЗА СМЕНУ')}</small><strong class="hp-earned">0 ₽</strong></div>
            <div class="hp-current"><small>${t('ТЕКУЩИЙ ЗАКАЗ')}</small><b class="hp-current-title">${t('Нет активного заказа')}</b><span class="hp-current-address"></span><span class="hp-current-time"></span></div>
            <div class="hp-last-rating" hidden><small>${t('РЕЙТИНГ ПОСЛЕ ЗАКАЗА')}</small><b></b></div>
          </div>
          <nav class="hp-courier-nav"><button type="button" data-open="courier">${t('Смена')}</button><button type="button" data-open="messages">${t('Сообщения')}</button></nav>
        </section>
        <section class="hp-app hp-messages" data-hp-app="messages" hidden><header class="hp-nav"><button type="button" data-open="courier" aria-label="${t('назад')}">‹ <span>${t('Птица Пицца')}</span></button><b>${t('Сообщения')}</b><span class="hp-nav-space"></span></header><div class="hp-thread"></div><div class="hp-compose"><span>＋</span><p>${t('Сообщение')}</p><span>◉</span></div></section>
        <section class="hp-app hp-rating-app" data-hp-app="rating" hidden><header class="hp-nav"><button type="button" data-open="courier" aria-label="${t('назад')}">‹ <span>${t('Смена')}</span></button><b>${t('Рейтинг смены')}</b><span class="hp-nav-space"></span></header><div class="hp-rating-head"><small>${t('ПОСЛЕ ЗАКАЗА')}</small><strong class="hp-rating-place"></strong><span>${t('Заработано за смену')} <b class="hp-rating-money"></b></span></div><div class="hp-rating-rows"></div></section>
        <div class="hp-order-modal" hidden><div class="hp-order-dialog" role="dialog" aria-label="${t('Новый заказ')}"><div class="hp-order-title"><small>${t('Птица Пицца')}</small><b>${t('Новый заказ')} <span class="hp-order-no"></span></b></div><div class="hp-order-list"><div class="hp-order-recipient"><span class="hp-order-avatar"><img alt="" hidden></span><div><small>${t('получатель')}</small><b class="hp-order-name"></b></div></div><div class="hp-order-map"><canvas width="520" height="214"></canvas><i aria-hidden="true"></i></div><div class="hp-order-details"></div></div><div class="hp-order-go"><kbd>W</kbd><span>${t('поехать — принять заказ')}</span></div></div></div>
      </div><button class="hp-home-button" type="button" aria-label="${t('домой')}"></button>
    </div>`;
  (document.getElementById('game') || document.body).appendChild(root);
  H.root = root; H.device = root.querySelector('.hp-device'); H.thread = root.querySelector('.hp-thread');
  H.banner = root.querySelector('.hp-banner'); H.modal = root.querySelector('.hp-order-modal');
  root.addEventListener('click', e => {
    if (!H.modal.hidden) return;
    if (e.target.closest('.hp-banner')) { root.classList.remove('hp-notifying'); open('messages'); return; }
    const b = e.target.closest('[data-open]');
    if (b) { H.modal.hidden = true; open(b.dataset.open); return; }
    if (e.target.closest('.hp-home-button')) { H.modal.hidden = true; if (H.app === 'home') dock(); else open('home'); return; }
    if (e.target.closest('.hp-device') && !root.classList.contains('hp-expanded')) open('courier');
  });
  setApp('courier'); setVisible(visible);
  return root;
}

export function active () { return !!(H.root && H.visible && !document.body.classList.contains('touch')); }
export function setVisible (on) {
  if (!H.root || H.visible === !!on) return;
  H.visible = !!on;
  H.root.classList.toggle('hp-visible', H.visible);
  clearTimeout(H.enterTimer);
  H.root.classList.toggle('hp-enter', H.visible);
  if (H.visible) H.enterTimer = setTimeout(() => H.root.classList.remove('hp-enter'), 680);
  if (H.moneyElement) (H.visible ? $('.hp-money-slot') : H.moneyParent).appendChild(H.moneyElement);
  document.body.classList.toggle('hud-phone-active', H.visible);
}
export function mountMoney (el) {
  if (!H.root || !el) return;
  H.moneyElement = el; H.moneyParent = el.parentNode;
  $('.hp-money-fallback').hidden = true;
  if (H.visible) $('.hp-money-slot').appendChild(el);
}
export function resources ({ hp, hpMax, money, order, time }) {
  if (!H.root) return;
  const title = order ? order.title : t('Нет активного заказа');
  const address = order ? order.address : '';
  const key = [hp, hpMax, money, title, address, time].join('|');
  if (key === H.resourcesKey) return;
  H.resourcesKey = key;
  $('.hp-health').textContent = '♥ ' + hp + '/' + hpMax;
  $('.hp-money-fallback').textContent = money;
  $('.hp-earned').textContent = money;
  $('.hp-current-title').textContent = title;
  $('.hp-current-address').textContent = address;
  $('.hp-current-time').textContent = order && time ? '◷ ' + time : '';
  if (!order && H.order) clearOrder();
}
export function showOrder ({ number, html, name = '', avatar = '', many = false, routeOverview, driveKey = 'W' }) {
  if (!H.root || document.body.classList.contains('touch')) return false;
  setVisible(true);
  H.order = { number, html };
  H.modal.classList.toggle('hp-order-many', many);
  $('.hp-order-no').textContent = '№ ' + String(number).padStart(4, '0');
  $('.hp-order-go kbd').textContent = driveKey;
  $('.hp-order-name').textContent = name || t('клиент');
  const face = $('.hp-order-avatar');
  face.textContent = (name || t('клиент')).slice(0, 1).toUpperCase();
  if (avatar) { const img = document.createElement('img'); img.src = avatar; img.alt = ''; face.replaceChildren(img); }
  $('.hp-order-details').innerHTML = html;
  $('.hp-order-list').scrollTop = 0;
  const preview = $('.hp-order-map');
  preview.querySelector('svg')?.remove();
  const demo = document.querySelector('#hios-demo .hios-demo-map svg');
  if (demo) { preview.appendChild(demo.cloneNode(true)); preview.querySelector('canvas').hidden = true; }
  else preview.querySelector('canvas').hidden = false;
  H.modal.hidden = false;
  document.body.classList.add('hp-order-open');
  const dialog = $('.hp-order-dialog');
  dialog.classList.remove('hp-arrive'); void dialog.offsetWidth; dialog.classList.add('hp-arrive');
  open('courier');
  if (!demo) drawOrderMap(routeOverview);
  return true;
}
export function hasOrder () { return !!H.order; }
export function clearOrder () { if (!H.root) return; H.order = null; H.modal.hidden = true; document.body.classList.remove('hp-order-open'); $('.hp-order-details').replaceChildren(); }
export function receive (o) {
  if (!active()) return false;
  addMessage(o); banner(o.name, o.text);
  open('messages');
  H.root.classList.add('hp-new-message');
  H.shrink = setTimeout(dock, Math.max(8500, Math.min(15000, 6200 + String(o.text).length * 55)));
  return true;
}
export function showRating ({ rows, money }) {
  if (!active() || !rows?.length) return false;
  const me = rows.findIndex(r => r.me);
  if (me < 0) return false;
  H.rating = { rows, money };
  $('.hp-rating-place').textContent = t('место {i} из {n}', { i: me + 1, n: rows.length });
  $('.hp-rating-money').textContent = money;
  $('.hp-last-rating').hidden = false;
  $('.hp-last-rating b').textContent = t('место {i} из {n}', { i: me + 1, n: rows.length });
  const list = $('.hp-rating-rows'); list.replaceChildren();
  rows.forEach((r, i) => {
    const row = document.createElement('div'); row.className = 'hp-rating-row' + (r.me ? ' me' : '');
    const num = document.createElement('span'); num.textContent = String(i + 1);
    const name = document.createElement('b'); name.textContent = r.n;
    const details = document.createElement('small'); details.textContent = t('{n} зак.', { n: r.d || 0 }) + ' · ' + (r.money || '');
    row.append(num, name, details); list.appendChild(row);
  });
  open('rating');
  return true;
}
export function hideRating () { if (H.root && H.app === 'rating') dock(); }
export function reset () {
  if (!H.root) return;
  clearTimeout(H.shrink); clearTimeout(H.bannerTimer);
  H.root.classList.remove('hp-notifying', 'hp-new-message');
  H.thread.replaceChildren(); H.messages = []; H.rating = null; clearOrder(); dock(); H.resourcesKey = '';
  $('.hp-last-rating').hidden = true;
}
/* Песочница: фиксированные состояния для сравнимых скриншотов без ожидания таймеров. */
export function demo (phase = 'dock', text = 'Клиент уже ждёт. Ты где?') {
  reset(); setVisible(true);
  resources({ hp: 5.5, hpMax: 6, money: '3 200 ₽', order: { title: t('Заказ № 0007'), address: t('ул. Царевского, 2') }, time: '02:15' });
  addMessage({ name: t('Ирина Сергеевна'), role: t('управляющая'), text: t('Женя, новый заказ. Забери пиццу и выезжай.') });
  addMessage({ name: t('Ирина Сергеевна'), role: t('управляющая'), text });
  if (phase === 'order') showOrder({ number: 7, name: 'Света Т.', html: '<table class="oc-inv"><tbody><tr data-k="who"><th>' + t('получатель') + '</th><td><b>Света Т.</b></td></tr><tr data-k="addr"><th>' + t('адрес') + '</th><td><b>' + t('ул. Царевского, 2') + '</b></td></tr><tr data-k="items"><th>' + t('заказ') + '</th><td><b>' + t('Пепперони') + ' × 1</b></td></tr><tr data-k="pay"><th>' + t('оплата') + '</th><td><b class="oc-pay">3 200 ₽</b></td></tr></tbody></table>' });
  else if (phase === 'rating') showRating({ rows: [{ n: 'Вася', d: 4, money: '4 100 ₽' }, { n: t('ты'), d: 3, money: '3 200 ₽', me: true }, { n: 'Олег', d: 2, money: '2 600 ₽' }], money: '3 200 ₽' });
  else if (phase === 'home') open('home');
  else if (phase === 'message' || phase === 'banner' || phase === 'big') { open('messages'); H.root.classList.add('hp-new-message'); if (phase === 'banner') banner(t('Ирина Сергеевна'), text); }
  else if (phase === 'courier') open('courier');
  else dock();
}
