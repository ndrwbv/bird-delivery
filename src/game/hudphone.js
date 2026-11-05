/* iPhone 4 в HUD: текущий заказ, итог доставки, сообщения и рейтинг — в телефоне.
   Снаружи слева остаются карта и запас нитро. */
import './hudphone.css';
import { t } from '../i18n/index.js';
import * as HUDMAP from './hudmapios.js';
import { heroName } from './playername.js';

const H = { root: null, device: null, thread: null, modal: null,
  visible: false, app: 'courier', order: null, messages: [], rating: null,
  shrink: 0, messageTimer: 0, enterTimer: 0, resourcesKey: '', rankKey: '',
  moneyElement: null, moneyParent: null, payment: null, paymentModal: null, currentAvatar: '',
  channel: 'crew', members: [], membersKey: '', replies: [], conversation: false, conversationHost: null };

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
  clearTimeout(H.shrink); clearTimeout(H.messageTimer);
  H.root.classList.remove('hp-focus-latest', 'hp-app-launching');
  setApp(app);
  H.root.classList.add('hp-expanded');
  if (app === 'courier') $('.hp-courier-scroll').scrollTop = 0;
  if (app === 'messages') requestAnimationFrame(() => { H.thread.scrollTop = H.thread.scrollHeight; });
}

export function dock () {
  if (!H.root) return;
  if (H.payment || H.conversation) return; // результат и выбор обеда остаются раскрыты
  clearTimeout(H.shrink);
  clearTimeout(H.messageTimer);
  H.modal.hidden = true;
  document.body.classList.remove('hp-order-open');
  setApp('courier');
  H.root.classList.remove('hp-expanded', 'hp-new-message', 'hp-focus-latest', 'hp-app-launching', 'hp-notifying');
}

function drawMessage ({ name, role = '', text, avatar = '', outgoing = false, system = false, earlier = false }) {
  if (!H.root) return;
  H.thread.querySelector('.hp-chat-empty')?.remove();
  H.thread.querySelector('.hp-message.latest')?.classList.remove('latest');
  const row = document.createElement('div'); row.className = 'hp-message latest' + (outgoing ? ' hp-outgoing' : '') + (system ? ' hp-system-message' : '');
  const meta = document.createElement('div'); meta.className = 'hp-message-meta';
  if (avatar) { const img = document.createElement('img'); img.src = avatar; img.alt = ''; meta.appendChild(img); }
  const who = document.createElement('b'); who.textContent = name;
  const stamp = earlier ? t('до смены') : t('сейчас');
  const time = document.createElement('small'); time.textContent = role ? role + ' · ' + stamp : stamp;
  const labels = document.createElement('span'); labels.append(who, time); meta.appendChild(labels);
  const bubble = document.createElement('p'); bubble.textContent = text;
  row.append(meta, bubble); H.thread.appendChild(row);
  while (H.thread.children.length > 40) H.thread.firstChild.remove();
  H.thread.scrollTop = H.thread.scrollHeight;
}
function addMessage (message) {
  const entry = { ...message, channel: message.channel === 'direct' ? 'direct' : 'crew' };
  H.messages.push(entry);
  if (H.messages.length > 80) H.messages.shift();
  if (entry.channel === H.channel) drawMessage(entry);
  return entry;
}
export function recordMessage (message) { if (H.root) return addMessage(message); }
export function clearReplies () { H.replies = []; }
function setChannel (channel) {
  H.channel = channel === 'direct' ? 'direct' : 'crew';
  for (const button of H.root.querySelectorAll('[data-hp-channel]')) {
    const selected = button.dataset.hpChannel === H.channel;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  }
  H.thread.replaceChildren();
  const messages = H.messages.filter(m => m.channel === H.channel).slice(-40);
  messages.forEach(drawMessage);
  if (!messages.length) {
    const empty = document.createElement('p'); empty.className = 'hp-chat-empty';
    empty.textContent = H.channel === 'direct' ? t('Личных сообщений пока нет') : t('Сообщения смены появятся здесь');
    H.thread.appendChild(empty);
  }
  drawMembers();
}
function drawMembers () {
  if (!H.root) return;
  const members = H.channel === 'crew' ? H.members : H.members.filter(m => m.me || m.manager);
  $('.hp-chat-summary').textContent = H.channel === 'crew' ? t('Курьерский чат') + ' · ' + members.filter(m => !m.manager).length : t('Ирина Сергеевна');
  const list = $('.hp-chat-roster'); list.replaceChildren(); list.hidden = true;
  for (const member of members) {
    const row = document.createElement('div'); row.className = 'hp-chat-member';
    const face = document.createElement('span'); face.className = 'hp-chat-member-face';
    if (member.avatar) { const img = document.createElement('img'); img.src = member.avatar; img.alt = ''; face.appendChild(img); }
    else face.textContent = member.name.slice(0, 1).toUpperCase();
    const labels = document.createElement('span'), name = document.createElement('b'), role = document.createElement('small');
    name.textContent = member.name; role.textContent = member.manager ? t('управляющая') : member.me ? t('ты') : t('курьер');
    labels.append(name, role); row.append(face, labels); list.appendChild(row);
  }
}
export function members ({ couriers = [], managerAvatar = '' } = {}) {
  if (!H.root) return;
  const names = [heroName(), ...couriers.map(m => m.name)];
  const key = names.join('|') + '|' + managerAvatar;
  if (key === H.membersKey) return;
  H.membersKey = key;
  H.members = [{ name: heroName(), me: true }, ...couriers, { name: t('Ирина Сергеевна'), manager: true, avatar: managerAvatar }];
  drawMembers();
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
        <div class="hp-home" data-hp-app="home" hidden><div class="hp-wallpaper"></div><div class="hp-home-head">${t('Солнечный')}</div>
          <div class="hp-app-grid"><button type="button" data-open="messages">${icon('messages')}<span>${t('Сообщения')}</span></button><button type="button" data-open="courier">${icon('courier')}<span>${t('Птица Пицца')}</span></button></div>
          <div class="hp-home-dock"><button type="button" data-open="courier">${icon('courier')}</button><button type="button" data-open="messages">${icon('messages')}</button></div>
        </div>
        <section class="hp-app hp-courier-app" data-hp-app="courier"><header class="hp-nav"><b>${t('Птица Пицца')}</b></header>
          <div class="hp-courier-scroll">
            <div class="hp-current" hidden><span class="hp-current-avatar"><img alt=""></span><span class="hp-current-copy"><b class="hp-current-title"></b><span class="hp-current-distance"></span></span><span class="hp-current-time"></span></div>
            <button class="hp-competition" type="button" data-open="rating"><span class="hp-rank-heading"><b>${t('ЛИДЕРЫ СМЕНЫ')}</b><span class="hp-rank-arrow">›</span></span><span class="hp-rank-list"></span></button>
            <div class="hp-shift-earn"><small>${t('ЗАРАБОТАНО ЗА СМЕНУ')}</small><strong class="hp-earned">0 ₽</strong></div>
            <div class="hp-last-rating" hidden><small>${t('РЕЙТИНГ ПОСЛЕ ЗАКАЗА')}</small><b></b></div>
          </div>
          <nav class="hp-courier-nav"><button type="button" data-open="courier">${t('Смена')}</button><button type="button" data-open="messages">${t('Сообщения')}</button></nav>
        </section>
        <section class="hp-app hp-messages" data-hp-app="messages" hidden><header class="hp-nav"><button type="button" data-open="courier" aria-label="${t('назад')}">‹ <span>${t('Назад')}</span></button><b>${t('Сообщения')}</b><span class="hp-nav-space"></span></header><nav class="hp-chat-tabs"><button type="button" data-hp-channel="crew">${t('Курьеры')}</button><button type="button" data-hp-channel="direct">${t('Личные')}</button></nav><div class="hp-chat-context"><button class="hp-chat-members" type="button"><span class="hp-chat-summary"></span><span aria-hidden="true">⌄</span></button><div class="hp-chat-roster" hidden></div></div><div class="hp-thread"></div></section>
        <section class="hp-app hp-rating-app" data-hp-app="rating" hidden><header class="hp-nav"><button type="button" data-open="courier" aria-label="${t('назад')}">‹ <span>${t('Смена')}</span></button><b>${t('Рейтинг смены')}</b><span class="hp-nav-space"></span></header><div class="hp-rating-head"><small>${t('ПОСЛЕ ЗАКАЗА')}</small><strong class="hp-rating-place"></strong><span>${t('Заработано за смену')} <b class="hp-rating-money"></b></span></div><div class="hp-rating-rows"></div></section>
        <div class="hp-order-modal" hidden><div class="hp-order-dialog" role="dialog" aria-label="${t('Новый заказ')}"><div class="hp-order-title"><small>${t('Птица Пицца')}</small><b>${t('Новый заказ')} <span class="hp-order-no"></span></b></div><div class="hp-order-list"><div class="hp-order-recipient"><span class="hp-order-avatar"><img alt="" hidden></span><div><small>${t('получатель')}</small><b class="hp-order-name"></b></div></div><div class="hp-order-map"><canvas width="520" height="214"></canvas></div><div class="hp-order-details"></div></div><div class="hp-order-go"><kbd>W</kbd><span>${t('поехать — принять заказ')}</span></div></div></div>
      </div><button class="hp-home-button" type="button" aria-label="${t('домой')}"></button>
    </div>`;
  (document.getElementById('game') || document.body).appendChild(root);
  H.root = root; H.device = root.querySelector('.hp-device'); H.thread = root.querySelector('.hp-thread');
  H.modal = root.querySelector('.hp-order-modal');
  root.addEventListener('click', e => {
    if (H.payment) { if (e.target.closest('.hp-paid-close')) finishPayment(); return; }
    if (H.conversation || root.classList.contains('hp-shift-chat')) return;
    if (!H.modal.hidden) return;
    const channel = e.target.closest('[data-hp-channel]');
    if (channel) { clearTimeout(H.shrink); setChannel(channel.dataset.hpChannel); return; }
    if (e.target.closest('.hp-chat-members')) { clearTimeout(H.shrink); const list = $('.hp-chat-roster'); list.hidden = !list.hidden; return; }
    const b = e.target.closest('[data-open]');
    if (b) { H.modal.hidden = true; open(b.dataset.open); return; }
    if (e.target.closest('.hp-home-button')) { H.modal.hidden = true; if (H.app === 'home') dock(); else open('home'); return; }
    if (e.target.closest('.hp-device') && !root.classList.contains('hp-expanded')) open('courier');
  });
  members(); setChannel('crew'); setApp('courier'); setVisible(visible);
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
export function resources ({ hp, hpMax, money, order, hasOrder = !!order }) {
  if (!H.root) return;
  const { name = '', avatar = '', distance = '', time = '', urgency = '' } = order || {};
  const key = [hp, hpMax, money, name, distance, time, urgency, hasOrder].join('|');
  if (key === H.resourcesKey && avatar === H.currentAvatar) return;
  H.resourcesKey = key; H.currentAvatar = avatar;
  $('.hp-health').textContent = '♥ ' + hp + '/' + hpMax;
  $('.hp-money-fallback').textContent = money;
  $('.hp-earned').textContent = money;
  const card = $('.hp-current'); card.hidden = !order;
  card.classList.toggle('warn', urgency === 'warn'); card.classList.toggle('low', urgency === 'low');
  $('.hp-current-title').textContent = name || t('клиент');
  $('.hp-current-title').title = name;
  $('.hp-current-distance').textContent = distance;
  const face = $('.hp-current-avatar'), img = face.querySelector('img');
  if (avatar) {
    if (img) { if (img.getAttribute('src') !== avatar) img.src = avatar; }
    else { const image = document.createElement('img'); image.src = avatar; image.alt = ''; face.replaceChildren(image); }
  } else face.textContent = (name || t('клиент')).slice(0, 1).toUpperCase();
  $('.hp-current-time').textContent = time ? '◷ ' + time : '';
  $('.hp-current-time').hidden = !time;
  if (!hasOrder && H.order) clearOrder();
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
export function beginShiftChat (history) {
  if (!H.root) return;
  setVisible(true);
  H.root.classList.add('hp-shift-chat');
  $('.hp-messages .hp-nav b').textContent = t('Общий чат');
  setChannel('crew');
  history.forEach(addMessage);
  open('messages');
}
export function endShiftChat () {
  if (!H.root) return;
  H.root.classList.remove('hp-shift-chat');
  $('.hp-messages .hp-nav b').textContent = t('Сообщения');
  dock();
}
export function receive (o) {
  if (!active()) return false;
  clearTimeout(H.shrink); clearTimeout(H.messageTimer);
  const message = addMessage(o);
  if (o.manager ?? (o.role === t('управляющая'))) H.replies.push({ message, t: 0 });
  if (H.payment) { H.payment.message = o; return true; }
  if (H.conversation) return true;
  setChannel(message.channel);
  showLatestMessage();
  return true;
}
function showLatestMessage () {
  if (!H.root || !H.visible) return;
  if (H.payment || H.conversation) return;
  clearTimeout(H.messageTimer);
  H.root.classList.remove('hp-notifying');
  setApp('messages');
  H.root.classList.remove('hp-focus-latest');
  H.root.classList.add('hp-expanded', 'hp-new-message', 'hp-app-launching');
  requestAnimationFrame(() => { H.thread.scrollTop = H.thread.scrollHeight; });
  H.messageTimer = setTimeout(() => H.root?.classList.remove('hp-app-launching'), 550);
  const latest = H.thread.querySelector('.hp-message.latest p')?.textContent || '';
  H.shrink = setTimeout(dock, Math.max(9000, Math.min(16000, 7000 + latest.length * 65)));
}
/* Один результат доставки вместо россыпи денег, перелёта и карточки слева.
   Время игровое: пауза и сцены не съедают время чтения; отмена не начисляет деньги. */
export function showPayment ({ name = '', avatar = '', mood = 'ok', amount = '', money = '', zero = '0 ₽', breakdown = [], done, touch, ready, duration = 5.5 } = {}) {
  if (!active()) return false;
  hidePayment();
  clearTimeout(H.shrink); clearTimeout(H.messageTimer);
  H.modal.hidden = true;
  document.body.classList.remove('hp-order-open');
  open('courier');
  H.root.classList.remove('hp-notifying', 'hp-new-message');
  if (!H.paymentModal) {
    const modal = document.createElement('section'); modal.className = 'hp-paid-modal';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-label', t('Заказ доставлен!'));
    modal.innerHTML = '<div class="hp-paid-confetti" aria-hidden="true">' + '<i></i>'.repeat(14) + '</div>' +
      '<header class="hp-paid-head"><span aria-hidden="true">★</span><b>' + t('Заказ доставлен!') + '</b><strong class="hp-paid-praise"></strong></header>' +
      '<div class="hp-paid-scroll"><div class="hp-paid-guest"><span class="hp-paid-avatar"></span><div><b class="hp-paid-name"></b><span class="hp-paid-reaction"></span></div></div>' +
      '<div class="hp-paid-receipt"></div><div class="hp-paid-bottom"><span>' + t('Выплата') + '</span><strong class="hp-paid-gain"></strong></div>' +
      '<div class="hp-paid-shift"><span>' + t('За смену') + '</span><b class="hp-paid-total"></b></div></div>' +
      '<button type="button" class="hp-paid-close">' + t('Дальше') + '</button>';
    modal.querySelectorAll('.hp-paid-confetti i').forEach((bit, i) => bit.style.setProperty('--i', i));
    $('.hp-glass').appendChild(modal); H.paymentModal = modal;
  }
  const modal = H.paymentModal;
  modal.querySelector('.hp-paid-praise').textContent = mood === 'angry' ? t('Заказ завершён') : t('Молодец!');
  const face = modal.querySelector('.hp-paid-avatar');
  if (avatar) { const img = document.createElement('img'); img.src = avatar; img.alt = ''; face.replaceChildren(img); }
  else face.replaceChildren((name || t('клиент')).slice(0, 1).toUpperCase());
  modal.querySelector('.hp-paid-name').textContent = name || t('клиент');
  const reaction = modal.querySelector('.hp-paid-reaction');
  reaction.textContent = mood === 'happy' ? '♥ ' + t('Клиент в восторге') : mood === 'angry' ? '✕ ' + t('Клиент недоволен') : '✓ ' + t('Нормально');
  reaction.className = 'hp-paid-reaction ' + mood;
  const receipt = modal.querySelector('.hp-paid-receipt'); receipt.replaceChildren();
  const lines = breakdown.some(r => r.kind === 'tip') ? breakdown : [...breakdown, { label: t('чаевые'), amount: zero, kind: 'tip' }];
  for (const line of lines) {
    const row = document.createElement('div'); row.className = 'hp-paid-line ' + (line.kind || '');
    const label = document.createElement('span'); label.textContent = line.label;
    const value = document.createElement('b'); value.textContent = line.amount;
    row.append(label, value); receipt.appendChild(row);
  }
  modal.querySelector('.hp-paid-gain').textContent = amount;
  modal.querySelector('.hp-paid-total').textContent = money;
  modal.classList.toggle('negative', amount.startsWith('−'));
  modal.hidden = false;
  modal.querySelector('.hp-paid-scroll').scrollTop = 0;
  H.payment = { t: 0, duration, done, touch, ready, message: null };
  return true;
}
function finishPayment () {
  const payment = H.payment;
  if (!payment || (payment.ready && !payment.ready())) return;
  hidePayment();
  payment.done?.();
  if (payment.message) receiveAfterPayment(payment.message);
  else dock();
}
function receiveAfterPayment (message) {
  setChannel(message.channel); showLatestMessage();
}
export const conversationActive = () => H.conversation;
export function conversationHost () {
  if (!active()) return null;
  clearTimeout(H.shrink); clearTimeout(H.messageTimer);
  H.root.classList.remove('hp-notifying', 'hp-focus-latest', 'hp-app-launching');
  setChannel('crew'); open('messages');
  H.conversation = true;
  if (!H.conversationHost) { const host = document.createElement('div'); host.className = 'hp-dialog-host'; $('.hp-glass').appendChild(host); H.conversationHost = host; }
  H.conversationHost.hidden = false;
  return H.conversationHost;
}
export function endConversation (show = true) {
  if (!H.conversation) return;
  H.conversation = false;
  if (H.conversationHost) H.conversationHost.hidden = true;
  if (show) { setChannel('crew'); showLatestMessage(); } else dock();
}
export function hidePayment () {
  H.payment = null;
  if (H.paymentModal) H.paymentModal.hidden = true;
}
export function step (dt) {
  if (!H.payment && !H.conversation && active() && H.replies.length) {
    const reply = H.replies[0]; reply.t += dt;
    if (reply.t >= 1.1) { H.replies.shift(); addMessage({ name: heroName(), text: t('Ок'), outgoing: true, channel: reply.message.channel }); }
  }
  const p = H.payment;
  if (!p) return;
  p.touch?.();
  if (p.ready && !p.ready()) return;
  p.t += dt;
  if (p.t >= p.duration) finishPayment();
}
export function rank ({ place = 1, total = 1, rows = [] } = {}) {
  if (!H.root) return;
  const top = rows.slice(0, 3);
  const key = place + '/' + total + '/' + top.map(r => [r.n, r.d, r.money, r.me].join(':')).join('|');
  if (key === H.rankKey) return;
  H.rankKey = key;
  const list = $('.hp-rank-list'); list.replaceChildren();
  top.forEach((r, i) => {
    const line = document.createElement('span'); line.className = 'hp-rank-line' + (r.me ? ' me' : '');
    const no = document.createElement('i'); no.textContent = String(i + 1);
    const name = document.createElement('b'); name.textContent = r.n || t('ты');
    const score = document.createElement('small'); score.textContent = t('{n} зак.', { n: r.d || 0 }) + (r.money ? ' · ' + r.money : '');
    line.append(no, name, score); list.appendChild(line);
  });
  $('.hp-competition').setAttribute('aria-label', t('Рейтинг смены') + ': ' + t('место {i} из {n}', { i: place, n: total }));
}
export function showRating ({ rows, money }, autoOpen = true) {
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
  rank({ place: me + 1, total: rows.length, rows });
  if (autoOpen) open('rating');
  return true;
}
export function hideRating () { if (H.root && H.app === 'rating') dock(); }
export function reset () {
  if (!H.root) return;
  hidePayment();
  H.replies = []; H.conversation = false;
  if (H.conversationHost) H.conversationHost.hidden = true;
  clearTimeout(H.shrink);  clearTimeout(H.messageTimer);
  H.root.classList.remove('hp-notifying', 'hp-new-message');
  H.thread.replaceChildren(); H.messages = []; H.rating = null; clearOrder(); dock(); H.resourcesKey = ''; H.rankKey = '';
  setChannel('crew');
  $('.hp-last-rating').hidden = true;
}
/* Песочница: фиксированные состояния для сравнимых скриншотов без ожидания таймеров. */
export function demo (phase = 'dock', text = 'Клиент уже ждёт. Ты где?', avatar = '') {
  reset(); setVisible(true);
  resources({ hp: 5.5, hpMax: 6, money: '3 200 ₽', order: { name: 'Света Т.', avatar, distance: t('{n} м', { n: 320 }), time: '02:15' } });
  rank({ place: 3, total: 8, rows: [
    { n: t('Вася'), d: 4, money: '4 100 ₽' },
    { n: t('Олег'), d: 3, money: '3 600 ₽' },
    { n: t('ты'), d: 3, money: '3 200 ₽', me: true },
  ] });
  addMessage({ name: t('Ирина Сергеевна'), role: t('управляющая'), text: t('Женя, новый заказ. Забери пиццу и выезжай.') });
  addMessage({ name: t('Ирина Сергеевна'), role: t('управляющая'), text });
  if (phase === 'order') showOrder({ number: 7, name: 'Света Т.', html: '<table class="oc-inv"><tbody><tr data-k="who"><th>' + t('получатель') + '</th><td><b>Света Т.</b></td></tr><tr data-k="addr"><th>' + t('адрес') + '</th><td><b>' + t('ул. Царевского, 2') + '</b></td></tr><tr data-k="items"><th>' + t('заказ') + '</th><td><b>' + t('Пепперони') + ' × 1</b></td></tr><tr data-k="pay"><th>' + t('оплата') + '</th><td><b class="oc-pay">3 200 ₽</b></td></tr></tbody></table>' });
  else if (phase === 'rating') showRating({ rows: [{ n: 'Вася', d: 4, money: '4 100 ₽' }, { n: t('ты'), d: 3, money: '3 200 ₽', me: true }, { n: 'Олег', d: 2, money: '2 600 ₽' }], money: '3 200 ₽' });
  else if (phase === 'home') open('home');
  else if (phase === 'message' || phase === 'banner' || phase === 'big') { open('messages'); H.root.classList.add('hp-new-message'); }
  else if (phase === 'courier') open('courier');
  else dock();
}
