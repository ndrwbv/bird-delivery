/* Телефон в HUD: один и тот же экран в игре и в песочнице ui.html.
   Сообщения остаются в истории, карта игры вставляется внутрь приложения «Карты».
   Модуль не управляет очередью событий: chat.js и notifyq.js решают, когда пришло сообщение. */
import './hudphone.css';
import { t } from '../i18n/index.js';

const H = { root: null, device: null, banner: null, thread: null, map: null, mock: null,
  messages: [], shrink: 0, bannerTimer: 0, enterTimer: 0, mapElement: null, mapParent: null,
  radarElement: null, radarParent: null, onRadarMove: null, moneyElement: null, moneyParent: null,
  closeMap: null, onMapZoom: null, visible: false, app: 'glance', order: null, resourcesKey: '' };

const icon = kind => '<span class="hp-icon hp-icon-' + kind + '" aria-hidden="true"><i></i></span>';
const demoMap = `<svg viewBox="0 0 284 416" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <rect width="284" height="416" fill="#e9e4d6"/>
  <path fill="#c9e1aa" d="M0 0h85l-7 99H0zm214 0h70v159l-42-9-17-71zM0 304l85-11 8 123H0zM229 303l55 8v105h-61z"/>
  <path fill="#b4d797" d="M0 19 72 5 62 52 2 76zm241 13 43 10v80l-34-7zM1 335l50-12 16 63-66 28z"/>
  <path d="M-18 78 302 151M-18 251 302 211M52-14l84 447M199-20l-20 456" stroke="#d5d2c7" stroke-width="31" fill="none"/>
  <path d="M-18 78 302 151M-18 251 302 211M52-14l84 447M199-20l-20 456" stroke="#f9f7eb" stroke-width="24" fill="none"/>
  <path d="M-10 342 292 33M32-10l235 435" stroke="#d3b67e" stroke-width="24" fill="none"/>
  <path d="M-10 342 292 33M32-10l235 435" stroke="#f3c574" stroke-width="20" fill="none"/>
  <g fill="#d6d4c9" stroke="#a7a89f" stroke-width="1.2">
    <path d="m82 20 32-4 7 26-31 5zM132 12l42-5-3 34-36 3zM10 118l30 5 2 37-30-5zM57 120l32 5 8 30-34-4zM116 113l35-7 5 32-36 9zM188 106l30-5 9 37-35 4zM242 171l32 5-4 27-29-4zM8 186l36 6-1 32-31-4zM67 183l35 7 4 33-31-4zM138 184l27-7 5 26-30 9zM212 233l46-5 2 40-42 7zM11 271l31-4 4 31-33 3zM97 270l31-5 5 30-31 5zM154 276l38-6 2 30-35 7zM102 346l29-5 4 37-31 4zM208 349l42-5 4 30-41 4z"/>
  </g>
  <path fill="#c5c9c6" stroke="#a7a89f" stroke-width="1.2" d="m13 11 31-5 6 37-33 7zM220 14l40 3-5 30-33-2zM7 352l40-7 7 36-42 9z"/>
  <g fill="#7a7c74" font-family="Arial,sans-serif" font-size="7"><text x="93" y="35">2</text><text x="145" y="29">6</text><text x="20" y="143">12</text><text x="71" y="142">14</text><text x="127" y="127">18</text><text x="200" y="124">22</text><text x="19" y="207">5</text><text x="83" y="207">9</text><text x="225" y="253">27</text><text x="107" y="283">11</text><text x="167" y="292">15</text></g>
  <g fill="#5e625f" stroke="#f8f7f0" stroke-width="2.5" paint-order="stroke" font-family="Arial,sans-serif" font-size="10"><text x="9" y="105" transform="rotate(13 9 105)">ул. Царевского</text><text x="184" y="319" transform="rotate(-12 184 319)">пр. Коммунистический</text><text x="46" y="384" transform="rotate(-44 46 384)">ул. Мира</text></g>
  <path d="M128 296 123 241 179 212 177 160" stroke="#2d88c9" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M128 296 123 241 179 212 177 160" stroke="#85caec" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <circle cx="128" cy="296" r="15" fill="#2789e7" opacity=".18"/><circle cx="128" cy="296" r="7" fill="#2789e7" stroke="white" stroke-width="3"/>
  <path d="M177 145c-11 0-18 7-18 18 0 13 18 29 18 29s18-16 18-29c0-11-7-18-18-18z" fill="#e94b38" stroke="white" stroke-width="3"/><circle cx="177" cy="162" r="5" fill="white"/>
  </svg>`;

function setApp (app) {
  if (!H.root) return;
  H.app = app;
  H.device.dataset.app = app;
  for (const el of H.device.querySelectorAll('[data-hp-app]')) el.hidden = el.dataset.hpApp !== app;
  const home = H.device.querySelector('.hp-home');
  home.hidden = app !== 'home';
}

function open (app = 'messages') {
  if (!H.root || !H.visible) return;
  clearTimeout(H.shrink);
  setApp(app);
  H.root.classList.add('hp-expanded');
}

function dock () {
  if (!H.root) return;
  clearTimeout(H.shrink);
  H.root.classList.remove('hp-order-brief');
  setApp('glance');
  H.root.classList.remove('hp-expanded');
}
export { dock };

function banner (name, text, hold = 2600) {
  if (!H.root || !H.visible) return;
  H.banner.querySelector('.hp-banner-name').textContent = name;
  H.banner.querySelector('.hp-banner-text').textContent = text;
  H.root.classList.add('hp-notifying');
  clearTimeout(H.bannerTimer);
  if (hold) H.bannerTimer = setTimeout(() => H.root.classList.remove('hp-notifying'), hold);
}

function addMessage ({ name, role = '', text, avatar = '' }) {
  if (!H.root) return;
  H.messages.push({ name, role, text });
  if (H.messages.length > 24) H.messages.shift();
  H.device.querySelectorAll('.hp-contact-name').forEach(el => { el.textContent = name; });
  const face = H.device.querySelector('.hp-contact-avatar');
  if (avatar) { face.src = avatar; face.hidden = false; } else face.hidden = true;
  H.thread.replaceChildren();
  for (const m of H.messages) {
    const row = document.createElement('div'); row.className = 'hp-message';
    const meta = document.createElement('small'); meta.textContent = m.name + (m.role ? ' · ' + m.role : '') + ' · ' + t('сейчас');
    const bubble = document.createElement('p'); bubble.textContent = m.text;
    row.append(meta, bubble); H.thread.appendChild(row);
  }
  H.thread.scrollTop = H.thread.scrollHeight;
}

export function init ({ mapElement = null, radarElement = null, onRadarMove = null, closeMap = null, onMapZoom = null, visible = false } = {}) {
  if (H.root) return H.root;
  const root = document.createElement('div'); root.id = 'hud-phone';
  root.innerHTML = `<div class="hp-backdrop"></div>
    <div class="hp-device" role="group" aria-label="${t('телефон курьера')}">
      <i class="hp-mute-switch" aria-hidden="true"></i><i class="hp-volume hp-volume-up" aria-hidden="true"></i><i class="hp-volume hp-volume-down" aria-hidden="true"></i>
      <div class="hp-camera"></div><div class="hp-speaker"></div>
      <div class="hp-glass">
        <div class="hp-status"><span class="hp-health">♥ 6/6</span><span class="hp-clock">9:41</span><span class="hp-money-slot"><span class="hp-money-fallback">0 ₽</span></span></div>
        <button class="hp-banner" type="button" aria-label="${t('открыть сообщение')}">${icon('messages')}<span class="hp-banner-copy"><b>${t('Сообщения')} <em>${t('сейчас')}</em></b><strong class="hp-banner-name"></strong><span class="hp-banner-text"></span></span></button>
        <div class="hp-home"><div class="hp-wallpaper"></div><div class="hp-home-head">${t('Солнечный')}</div>
          <div class="hp-app-grid"><button type="button" data-open="messages">${icon('messages')}<span>${t('Сообщения')}</span></button><button type="button" data-open="map">${icon('map')}<span>${t('Карты')}</span></button><button type="button" data-open="courier">${icon('courier')}<span>${t('Курьер')}</span></button></div>
          <div class="hp-home-dock"><button type="button" data-open="glance">${icon('courier')}</button><button type="button" data-open="messages">${icon('messages')}</button><button type="button" data-open="map">${icon('map')}</button></div>
        </div>
        <section class="hp-app hp-glance" data-hp-app="glance"><header class="hp-nav hp-glance-head"><b>${t('Птица Пицца')}</b><button type="button" data-open="messages" aria-label="${t('Сообщения')}">${icon('messages')}</button></header>
          <div class="hp-glance-map"><div class="hp-glance-map-mock">${demoMap}</div><div class="hp-radar-slot"></div><span class="hp-glance-map-label">${t('Карта')} ›</span></div>
          <button class="hp-glance-order" type="button" data-open="courier"><small>${t('ТЕКУЩИЙ ЗАКАЗ')} <span class="hp-glance-time"></span></small><b class="hp-glance-order-title">${t('Нет активного заказа')}</b><span class="hp-glance-order-address">${t('Заказы в приложении «Курьер»')}</span><em>›</em></button>
          <div class="hp-glance-foot"><span>${t('Солнечный')}</span><span>● ${t('на связи')}</span></div>
        </section>
        <section class="hp-app hp-messages" data-hp-app="messages" hidden><header class="hp-nav"><button type="button" data-open="home" aria-label="${t('назад')}">‹ <span>${t('Сообщения')}</span></button><b class="hp-contact-name">${t('Ирина Сергеевна')}</b><span class="hp-nav-space"></span></header><div class="hp-contact"><img class="hp-contact-avatar" alt="" hidden><b class="hp-contact-name">${t('Ирина Сергеевна')}</b><small>${t('управляющая')}</small></div><div class="hp-thread"></div><div class="hp-compose"><span>＋</span><p>${t('Сообщение')}</p><span>◉</span></div></section>
        <section class="hp-app hp-map-app" data-hp-app="map" hidden><header class="hp-nav"><button type="button" data-open="home" aria-label="${t('назад')}">‹ <span>${t('Назад')}</span></button><b>${t('Солнечный')}</b><span class="hp-nav-space"></span></header><div class="hp-map-search">⌕ <span>${t('Поиск по карте')}</span></div><div class="hp-map-body"><div class="hp-real-map"></div><div class="hp-mock-map">${demoMap}</div><div class="hp-map-zoom"><button type="button" data-hp-zoom="in" aria-label="${t('увеличить карту')}">+</button><button type="button" data-hp-zoom="out" aria-label="${t('уменьшить карту')}">−</button></div><div class="hp-map-chip">● ${t('ты')} <i></i> ● ${t('заказ')}</div></div><div class="hp-map-footer"><button type="button" data-open="glance"><span>▤</span>${t('Сводка')}</button><button type="button" data-open="courier"><span>➤</span>${t('Маршрут')}</button><button type="button" data-open="messages"><span>✉</span>${t('Сообщения')}</button><button type="button" data-open="map" class="hp-selected"><span>▦</span>${t('Карта')}</button></div></section>
        <section class="hp-app hp-courier-app" data-hp-app="courier" hidden><header class="hp-nav"><button type="button" data-open="glance" aria-label="${t('назад')}">‹ <span>${t('Сводка')}</span></button><b>${t('Курьер')}</b><span class="hp-nav-space"></span></header>
          <div class="hp-courier-scroll"><div class="hp-courier-brand">${icon('courier')}<div><b>${t('Птица Пицца')}</b><span>${t('Курьерская служба')}</span></div></div>
            <div class="hp-order-sheet"><div class="hp-order-title"><span>${t('НАКЛАДНАЯ')}</span><b class="hp-order-no">№ 0000</b></div><div class="hp-order-list">${t('Нет активного заказа')}</div></div></div>
          <nav class="hp-courier-nav"><button type="button" data-open="glance">${t('Сводка')}</button><button type="button" data-open="map">${t('Карта')}</button></nav>
        </section>
      </div><button class="hp-home-button" type="button" aria-label="${t('домой')}"></button>
    </div>`;
  (document.getElementById('game') || document.body).appendChild(root);
  H.root = root; H.device = root.querySelector('.hp-device'); H.banner = root.querySelector('.hp-banner');
  H.thread = root.querySelector('.hp-thread'); H.mock = root.querySelector('.hp-mock-map');
  H.map = root.querySelector('.hp-real-map'); H.mapElement = mapElement; H.mapParent = mapElement && mapElement.parentNode; H.closeMap = closeMap; H.onMapZoom = onMapZoom;
  H.radarElement = radarElement; H.radarParent = radarElement && radarElement.parentNode; H.onRadarMove = onRadarMove;
  root.addEventListener('click', e => {
    const zoom = e.target.closest('[data-hp-zoom]');
    if (zoom) {
      if (H.onMapZoom && H.mapElement && !H.mapElement.hidden) H.onMapZoom(zoom.dataset.hpZoom === 'in' ? 1.6 : 1 / 1.6);
      else { const mock = H.root.querySelector('.hp-mock-map'); mock.classList.toggle('hp-mock-zoomed', zoom.dataset.hpZoom === 'in'); }
      return;
    }
    if (e.target.closest('.hp-banner')) { root.classList.remove('hp-notifying'); open('messages'); return; }
    if (e.target.closest('.hp-glance-map')) {
      if (e.target.closest('#radar')) return;  // настоящий радар сам открывает карту
      if (H.mapElement && H.closeMap) H.closeMap(true); else open('map');
      return;
    }
    const b = e.target.closest('[data-open]');
    if (b) {
      const app = b.dataset.open;
      if (H.app === 'map' && app !== 'map' && H.closeMap) H.closeMap();
      if (app === 'map' && H.mapElement && H.mapElement.hidden) { H.closeMap && H.closeMap(true); return; }
      open(app); return;
    }
    if (e.target.closest('.hp-home-button')) {
      if (H.app === 'map' && H.closeMap) H.closeMap();
      if (H.app === 'home') dock(); else open('home');
      return;
    }
    if (e.target.closest('.hp-device') && !root.classList.contains('hp-expanded')) open(H.app);
  });
  setApp('glance');
  setVisible(visible);
  return root;
}

export function active () { return !!(H.root && H.visible && !document.body.classList.contains('touch')); }
export function setVisible (on) {
  if (!H.root || H.visible === !!on) return;
  H.visible = !!on;
  if (H.visible) setApp('glance');
  H.root.classList.toggle('hp-visible', H.visible);
  clearTimeout(H.enterTimer);
  H.root.classList.toggle('hp-enter', H.visible);
  if (H.visible) H.enterTimer = setTimeout(() => H.root.classList.remove('hp-enter'), 680);
  if (H.mapElement) (H.visible ? H.map : H.mapParent).appendChild(H.mapElement);
  if (H.radarElement) {
    (H.visible ? H.root.querySelector('.hp-radar-slot') : H.radarParent).appendChild(H.radarElement);
    if (H.onRadarMove) H.onRadarMove();
  }
  if (H.moneyElement) (H.visible ? H.root.querySelector('.hp-money-slot') : H.moneyParent).appendChild(H.moneyElement);
  document.body.classList.toggle('hud-phone-active', H.visible);
}
export function mountMoney (el) {
  if (!H.root || !el) return;
  H.moneyElement = el; H.moneyParent = el.parentNode;
  H.root.querySelector('.hp-money-fallback').hidden = true;
  if (H.visible) H.root.querySelector('.hp-money-slot').appendChild(el);
}
export function resources ({ hp, hpMax, money, order, time }) {
  if (!H.root) return;
  const title = order ? order.title : t('Нет активного заказа');
  const address = order ? order.address : t('Заказы в приложении «Курьер»');
  const key = [hp, hpMax, money, title, address, time].join('|');
  if (key === H.resourcesKey) return;
  H.resourcesKey = key;
  H.root.querySelector('.hp-health').textContent = '♥ ' + hp + '/' + hpMax;
  H.root.querySelector('.hp-money-fallback').textContent = money;
  H.root.querySelector('.hp-glance-order-title').textContent = title;
  H.root.querySelector('.hp-glance-order-address').textContent = address;
  H.root.querySelector('.hp-glance-time').textContent = order && time ? time : '';
  if (!order && H.order) clearOrder();
}
export function showOrder ({ number, html }) {
  if (!H.root || document.body.classList.contains('touch')) return false;
  setVisible(true);
  H.order = { number, html };
  H.root.querySelector('.hp-order-no').textContent = '№ ' + String(number).padStart(4, '0');
  H.root.querySelector('.hp-order-list').innerHTML = html;
  H.root.classList.add('hp-order-brief');
  const sheet = H.root.querySelector('.hp-order-sheet');
  sheet.classList.remove('hp-arrive'); void sheet.offsetWidth; sheet.classList.add('hp-arrive');
  open('courier');
  return true;
}
export function hasOrder () { return !!H.order; }
export function clearOrder () {
  if (!H.root) return;
  H.order = null;
  H.root.querySelector('.hp-order-no').textContent = '';
  H.root.querySelector('.hp-order-list').textContent = t('Нет активного заказа');
}
export function receive (o) {
  if (!active()) return false;
  addMessage(o);
  banner(o.name, o.text);
  open('messages');
  H.shrink = setTimeout(dock, 4100);
  return true;
}
export function showMap (on) {
  if (!H.root) return;
  H.root.classList.toggle('hp-real-map-open', !!on && !!H.mapElement);
  if (on) { setVisible(true); open('map'); }
  else dock();
}
export function reset () {
  if (!H.root) return;
  clearTimeout(H.shrink); clearTimeout(H.bannerTimer);
  H.root.classList.remove('hp-notifying', 'hp-real-map-open', 'hp-order-brief');
  H.mock.classList.remove('hp-mock-zoomed');
  H.messages = []; H.thread.replaceChildren(); clearOrder(); dock(); H.resourcesKey = '';
}
/* Песочница: фиксированные состояния для сравнимых скриншотов без ожидания таймеров. */
export function demo (phase = 'big', text = 'Клиент уже ждёт. Ты где?') {
  reset(); setVisible(true);
  resources({ hp: 5.5, hpMax: 6, money: '3 200 ₽', order: { title: t('Заказ № 0007'), address: t('ул. Царевского, 2') }, time: '02:15' });
  showOrder({ number: 7, html: '<table class="oc-inv"><tbody><tr><th>' + t('получатель') + '</th><td><b>Света Т.</b></td></tr><tr><th>' + t('адрес') + '</th><td><b>' + t('ул. Царевского, 2') + '</b></td></tr><tr><th>' + t('заказ') + '</th><td><b>' + t('Пепперони') + ' × 1</b></td></tr><tr><th>' + t('оплата') + '</th><td><b class="oc-pay">3 200 ₽</b></td></tr></tbody></table>' });
  addMessage({ name: t('Ирина Сергеевна'), role: t('управляющая'), text: t('Женя, новый заказ. Забери пиццу и выезжай.') });
  addMessage({ name: t('Ирина Сергеевна'), role: t('управляющая'), text });
  if (phase === 'order') open('courier');
  else if (phase === 'map') open('map');
  else if (phase === 'home') open('home');
  else { open('messages'); if (phase === 'dock') dock(); if (phase === 'banner') banner(t('Ирина Сергеевна'), text, 0); }
}
