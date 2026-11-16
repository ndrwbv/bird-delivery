import { t } from '../i18n/index.js';
import { createMinimap } from './vk-minimap.js';
import './vk-hud.css';

function icon (shape) {
  return '<svg class="vk-icon" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">' + shape + '</svg>';
}
const nitroIcon = icon('<path d="M11.2 2.1 4.9 10.9h4.5l-.6 7 6.3-8.8h-4.4z"/>');
const coldIcon = icon('<path d="M10 2.8v14.4M3.8 6.4l12.4 7.2M3.8 13.6l12.4-7.2M8 4.5l2 2 2-2M8 15.5l2-2 2 2"/>');
const timerIcon = icon('<circle cx="10" cy="11.1" r="6.05"/><path d="M8.2 1.9h3.6M10 2v2.9M14.5 6.8l1.4-1.4M10 8.1v3l1.8 1.2"/>');
const pauseIcon = icon('<path d="M7 4.5v11M13 4.5v11" stroke-width="2.1"/>');
const pedalIcons = {
  gas: icon('<path d="m5.5 11 4.5-4.5 4.5 4.5m-9 4 4.5-4.5 4.5 4.5"/>'),
  brake: icon('<path d="M5 7.5h10M5 12.5h10"/>'),
  nitro: nitroIcon,
  hand: icon('<circle cx="10" cy="10" r="7"/><path d="M8.1 13.5V6.7h2.5a1.8 1.8 0 0 1 0 3.6H8.1"/>'),
};

let nav, updateMinimap, pause, clock, digits, payment, gain, shift, nitro, pizza;
let shownTime;
let payTimer;

function meter (root, kind, icon, label) {
  const el = document.createElement('div');
  el.className = 'vk-meter vk-' + kind;
  el.setAttribute('role', 'meter');
  el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-valuemax', '100');
  el.setAttribute('aria-label', label);
  el.title = label;
  el.innerHTML = '<div class="vk-meter-track" aria-hidden="true"><i></i></div>' + icon;
  root.append(el);
  return el;
}

export function init (radar, left, right, buildings, onPause) {
  nav = document.createElement('button');
  nav.className = 'vk-nav';
  nav.type = 'button';
  nav.title = t('карта района');
  nav.setAttribute('aria-label', nav.title);
  nav.hidden = true;
  nav.innerHTML = '<canvas class="vk-minimap vk-minimap-outer" aria-hidden="true"></canvas>' +
    '<canvas class="vk-minimap vk-minimap-center" aria-hidden="true"></canvas>';
  updateMinimap = createMinimap(nav.lastElementChild, nav.firstElementChild, buildings);

  clock = document.createElement('div');
  clock.className = 'vk-countdown';
  clock.hidden = true;
  clock.setAttribute('role', 'timer');
  clock.innerHTML = timerIcon + '<strong aria-hidden="true"></strong>';
  digits = clock.lastElementChild;
  radar.append(nav);
  left.append(clock);

  payment = document.createElement('div');
  payment.className = 'vk-payment';
  payment.hidden = true;
  payment.setAttribute('role', 'status');
  payment.innerHTML = '<strong></strong><span></span>';
  [gain, shift] = payment.children;
  left.append(payment);

  const meters = document.createElement('div');
  meters.className = 'vk-meters';
  nitro = meter(meters, 'nitro', nitroIcon, t('Запас нитро'));
  pizza = meter(meters, 'pizza', coldIcon, t('Остывание пиццы'));
  pizza.hidden = true;
  pause = document.createElement('button');
  pause.type = 'button';
  pause.className = 'vk-pause';
  pause.hidden = true;
  pause.innerHTML = pauseIcon + '<span></span>';
  pause.lastElementChild.textContent = t('Пауза');
  pause.addEventListener('click', onPause);
  right.prepend(pause, meters);

  for (const button of document.querySelectorAll('#touchpad button[data-k]')) {
    const key = button.dataset.k;
    if (!pedalIcons[key]) continue;
    if (key === 'hand') {
      button.setAttribute('aria-label', t('ручник'));
      button.replaceChildren();
    }
    button.insertAdjacentHTML('afterbegin', pedalIcons[key]);
  }
}

function setText (el, value) {
  if (el.textContent !== value) el.textContent = value;
}

export function routeStep (car, playing, target, route, time) {
  nav.hidden = !playing;
  pause.hidden = !playing;
  updateMinimap(playing, car, target, route);
  clock.hidden = !target || time === null;
  if (clock.hidden || time === shownTime) return;
  const minutes = String(Math.floor(time / 60)).padStart(2, '0');
  const seconds = String(time % 60).padStart(2, '0');
  const display = minutes + ':' + seconds;
  setText(digits, display);
  clock.setAttribute('aria-label', time === 0 ? t('Время вышло') : t('Осталось') + ' ' + display);
  clock.classList.toggle('urgent', time <= 10);
  shownTime = time;
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
}

export function cooling (carried, value, coldAt) {
  pizza.hidden = !carried;
  if (!carried) return;
  // Как в исходной шкале: столбик растёт по мере остывания.
  const cold = value >= coldAt;
  setLevel(pizza, Math.round(value * 100));
  pizza.classList.toggle('cold', cold);
  pizza.classList.toggle('warm', value > 0 && !cold);
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
