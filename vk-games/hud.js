import { t } from '../i18n/index.js';
import { createMinimap } from './vk-minimap.js';
import './vk-hud.css';

const nitroIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m11 1-7 10h5l-1 8 8-11h-5z" fill="currentColor"/></svg>';

let nav, updateMinimap, details, name, deadline, payment, gain, shift, nitro, charge, pizza;
let shownTime;
let payTimer;

export function init (radar, left, right, buildings) {
  nav = document.createElement('button');
  nav.className = 'vk-nav';
  nav.type = 'button';
  nav.title = t('карта района');
  nav.setAttribute('aria-label', nav.title);
  nav.setAttribute('aria-describedby', 'vk-nav-details');
  nav.hidden = true;
  nav.innerHTML = '<canvas class="vk-minimap" aria-hidden="true"></canvas><span class="vk-nav-details" id="vk-nav-details" hidden><span class="vk-nav-name"></span><span class="vk-nav-deadline"></span></span>';
  details = nav.querySelector('.vk-nav-details');
  [name, deadline] = details.children;
  updateMinimap = createMinimap(nav.firstElementChild, buildings);
  radar.append(nav);

  payment = document.createElement('div');
  payment.className = 'vk-payment';
  payment.hidden = true;
  payment.setAttribute('role', 'status');
  payment.innerHTML = '<strong></strong><span></span>';
  [gain, shift] = payment.children;
  left.append(payment);

  const meters = document.createElement('div');
  meters.className = 'vk-meters';
  meters.innerHTML = '<div class="vk-meter vk-nitro"><span class="vk-meter-track" aria-hidden="true"><i></i></span>' + nitroIcon + '<b aria-hidden="true"></b></div>'
    + '<div class="vk-meter vk-pizza" hidden><span class="vk-meter-track" aria-hidden="true"><i></i></span><span class="vk-pizza-icon" aria-hidden="true">🍕</span><b aria-hidden="true"></b></div>';
  [nitro, pizza] = meters.children;
  for (const [meter, label] of [[nitro, t('Запас нитро')], [pizza, t('пицца')]]) {
    meter.setAttribute('role', 'meter');
    meter.setAttribute('aria-label', label);
    meter.setAttribute('aria-valuemin', '0');
    meter.setAttribute('aria-valuemax', '100');
    meter.title = label;
  }
  charge = nitro.querySelector('b');
  pizza.querySelector('b').textContent = t('пицца');
  right.prepend(meters);
}

function setText (el, value) {
  if (el.textContent !== value) el.textContent = value;
}

function timeLabel (seconds) {
  if (seconds === null) return '';
  if (seconds === 0) return t('Время вышло');
  if (seconds < 60) return t('Осталось {s} с', { s: seconds });
  return t('Осталось {m} мин {s} с', { m: Math.floor(seconds / 60), s: String(seconds % 60).padStart(2, '0') });
}

export function routeStep (car, playing, target, route, recipient, time) {
  nav.hidden = !playing;
  updateMinimap(playing, car, target, route);
  details.hidden = !target || (!recipient && time === null);
  name.hidden = !recipient;
  deadline.hidden = time === null;
  if (!target) return;
  setText(name, recipient);
  if (time !== shownTime) {
    setText(deadline, timeLabel(time));
    deadline.classList.toggle('urgent', time !== null && time <= 10);
    shownTime = time;
  }
}

function setLevel (meter, percent) {
  const value = String(percent);
  if (meter.getAttribute('aria-valuenow') === value) return;
  meter.setAttribute('aria-valuenow', value);
  meter.style.setProperty('--vk-level', value + '%');
}

export function fuel (value) {
  const percent = Math.round(value * 100);
  setLevel(nitro, percent);
  setText(charge, percent + '%');
}

export function cooling (carried, value, coldAt) {
  pizza.hidden = !carried;
  if (!carried) return;
  // Нижняя треть термометра соответствует холодной пицце по правилам заказа.
  const cold = value >= coldAt;
  const percent = cold ? 30 * (1 - value) / (1 - coldAt) : 100 - 70 * value / coldAt;
  setLevel(pizza, Math.round(percent));
  const label = cold ? t('Пицца: холодная') : value > 0 ? t('Пицца: тёплая') : t('Пицца: горячая');
  if (pizza.getAttribute('aria-valuetext') === label) return;
  pizza.setAttribute('aria-valuetext', label);
  pizza.title = label;
}

export function delivery (amount, total) {
  setText(gain, amount);
  setText(shift, t('за смену') + ' · ' + total);
  payment.hidden = false;
  clearTimeout(payTimer);
  payTimer = setTimeout(hidePayment, 3200);
}

export function hidePayment () {
  clearTimeout(payTimer);
  payment.hidden = true;
}
