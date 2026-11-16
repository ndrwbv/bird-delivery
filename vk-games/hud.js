import { t } from '../i18n/index.js';
import { createMinimap } from './vk-minimap.js';
import './vk-hud.css';

const mapIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 5.5 7.5 3l5 2.5 5-2.5v11.5l-5 2.5-5-2.5-5 2.5zM7.5 3v11.5m5-9V17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
const nitroIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m11 1-7 10h5l-1 8 8-11h-5z" fill="currentColor"/></svg>';

let updateMinimap, destination, details, name, deadline, payment, gain, shift, nitro, charge, pizza, heat;
let shownTime;
let payTimer;

export function init (radar, left, right, buildings, roads, driveMax) {
  const nav = document.createElement('button');
  nav.className = 'vk-nav';
  nav.type = 'button';
  nav.title = t('карта района');
  nav.innerHTML = '<span class="vk-nav-heading"><span class="vk-nav-map">' + mapIcon + '</span><span class="vk-nav-copy"><strong class="vk-nav-destination"></strong><span class="vk-nav-details" hidden><span class="vk-nav-name"></span><span class="vk-nav-deadline"></span></span></span></span><canvas class="vk-minimap" aria-hidden="true" hidden></canvas>';
  destination = nav.querySelector('.vk-nav-destination');
  details = nav.querySelector('.vk-nav-details');
  [name, deadline] = details.children;
  updateMinimap = createMinimap(nav.lastElementChild, buildings, roads, driveMax);
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
  meters.innerHTML = '<div class="vk-meter vk-nitro"><div class="vk-meter-caption" aria-hidden="true">' + nitroIcon + '<span></span><b></b></div><div class="vk-meter-track" aria-hidden="true"><i></i></div></div>'
    + '<div class="vk-meter vk-pizza" hidden><span class="vk-meter-caption"></span><div class="vk-heat-track" aria-hidden="true"><i></i><i></i><i></i></div></div>';
  [nitro, pizza] = meters.children;
  const nitroLabel = t('Запас нитро');
  nitro.setAttribute('role', 'meter');
  nitro.setAttribute('aria-label', nitroLabel);
  nitro.setAttribute('aria-valuemin', '0');
  nitro.setAttribute('aria-valuemax', '100');
  nitro.querySelector('.vk-meter-caption span').textContent = nitroLabel;
  charge = nitro.querySelector('b');
  heat = pizza.firstElementChild;
  pizza.title = t('Пицца остывает, если машина повреждена');
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

export function routeStep (car, playing, target, route, address, recipient, time) {
  updateMinimap(playing, car, target, route);
  details.hidden = !target || (!recipient && time === null);
  name.hidden = !recipient;
  deadline.hidden = time === null;
  destination.classList.toggle('active', !!target);
  setText(destination, target ? address : t('карта района'));
  if (!target) return;
  setText(name, recipient);
  if (time !== shownTime) {
    setText(deadline, timeLabel(time));
    deadline.classList.toggle('urgent', time !== null && time <= 10);
    shownTime = time;
  }
}

export function fuel (value) {
  const percent = String(Math.round(value * 100));
  if (nitro.getAttribute('aria-valuenow') === percent) return;
  nitro.setAttribute('aria-valuenow', percent);
  nitro.style.setProperty('--vk-level', percent + '%');
  setText(charge, percent + '%');
}

export function cooling (carried, value, cold) {
  pizza.hidden = !carried;
  if (!carried) return;
  const state = cold ? 'cold' : value > 0 ? 'warm' : 'hot';
  if (pizza.dataset.heat === state) return;
  pizza.dataset.heat = state;
  setText(heat, cold ? t('Пицца: холодная') : state === 'warm' ? t('Пицца: тёплая') : t('Пицца: горячая'));
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
