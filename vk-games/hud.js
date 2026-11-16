import { t } from '../i18n/index.js';
import { createMinimap } from './vk-minimap.js';
import './vk-hud.css';

const nitroIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m11 1-7 10h5l-1 8 8-11h-5z" fill="currentColor"/></svg>';
const coldIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2v16M3 6l14 8M3 14l14-8M7.5 3.5 10 6l2.5-2.5m-5 13L10 14l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

let nav, updateMinimap, clock, clockLabel, digits, payment, gain, shift, nitro, pizza;
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

export function init (radar, left, right, buildings) {
  nav = document.createElement('button');
  nav.className = 'vk-nav';
  nav.type = 'button';
  nav.title = t('карта района');
  nav.setAttribute('aria-label', nav.title);
  nav.hidden = true;
  nav.innerHTML = '<canvas class="vk-minimap" aria-hidden="true"></canvas>';
  updateMinimap = createMinimap(nav.firstElementChild, buildings);

  clock = document.createElement('div');
  clock.className = 'vk-countdown';
  clock.hidden = true;
  clock.setAttribute('role', 'timer');
  clock.innerHTML = '<span></span><strong></strong>';
  [clockLabel, digits] = clock.children;
  radar.append(nav, clock);

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
  right.prepend(meters);
}

function setText (el, value) {
  if (el.textContent !== value) el.textContent = value;
}

export function routeStep (car, playing, target, route, time) {
  nav.hidden = !playing;
  updateMinimap(playing, car, target, route);
  clock.hidden = !target || time === null;
  if (clock.hidden || time === shownTime) return;
  const minutes = String(Math.floor(time / 60)).padStart(2, '0');
  const seconds = String(time % 60).padStart(2, '0');
  setText(digits, minutes + ':' + seconds);
  setText(clockLabel, time === 0 ? t('Время вышло') : t('Осталось'));
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
