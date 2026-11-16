import { t } from '../i18n/index.js';
import './vk-hud.css';

const arrowIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2 18 16l-8-3-8 3Z" fill="currentColor"/></svg>';
const mapIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 5.5 7.5 3l5 2.5 5-2.5v11.5l-5 2.5-5-2.5-5 2.5zM7.5 3v11.5m5-9V17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
const nitroIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m11 1-7 10h5l-1 8 8-11h-5z" fill="currentColor"/></svg>';
const coldIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2v16M3 6l14 8M3 14l14-8M7.5 3.5 10 6l2.5-2.5m-5 13L10 14l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

let arrow, direction, map, name, eta, payment, gain, shift, nitro, pizza;
let nextRoute = 0, previousTarget, previousRoute, distance = 0, bearing = 0, arrowAngle = 0;
let payTimer;

function meter (root, kind, icon, label) {
  const el = document.createElement('div');
  el.className = 'vk-meter vk-' + kind;
  el.setAttribute('role', 'meter');
  el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-valuemax', '100');
  el.setAttribute('aria-label', label);
  el.title = label;
  el.innerHTML = '<div class="vk-meter-track"><i></i></div>' + icon;
  root.append(el);
  return el;
}

export function init (radar, left, right) {
  const nav = document.createElement('button');
  nav.className = 'vk-nav';
  nav.type = 'button';
  nav.title = t('карта района');
  nav.innerHTML = '<span class="vk-nav-arrow" hidden>' + arrowIcon + '</span><span class="vk-nav-map">' + mapIcon + '</span><span class="vk-nav-name"></span><span class="vk-nav-eta" hidden></span>';
  [arrow, map, name, eta] = nav.children;
  direction = arrow.firstElementChild;
  eta.title = t('примерное время в пути');
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
  nitro = meter(meters, 'nitro', nitroIcon, t('нитро'));
  pizza = meter(meters, 'pizza', coldIcon, t('остывание пиццы'));
  pizza.hidden = true;
  right.prepend(meters);
}

// The route starts next to the car. A short look-ahead points along the road through turns.
function readRoute (car, target, route) {
  let x = car.x, z = car.z;
  let ahead = 15;
  distance = 0;
  for (let i = 0; i <= route.length; i++) {
    const point = route[i];
    const px = point ? point[0] : target.x, pz = point ? point[1] : target.z;
    const dx = px - x, dz = pz - z, length = Math.hypot(dx, dz);
    if (ahead > 0 && length >= ahead) bearing = Math.atan2(x + dx * ahead / length - car.x, z + dz * ahead / length - car.z);
    ahead -= length;
    distance += length;
    x = px; z = pz;
  }
  if (ahead > 0 && distance > 0.5) bearing = Math.atan2(target.x - car.x, target.z - car.z);
}

function setText (el, value) {
  if (el.textContent !== value) el.textContent = value;
}

export function routeStep (dt, car, target, route, recipient) {
  arrow.hidden = !target;
  eta.hidden = !target;
  map.hidden = !!target;
  setText(name, target ? recipient : t('карта района'));
  if (!target) {
    previousTarget = null;
    return;
  }
  nextRoute -= dt;
  if (nextRoute <= 0 || previousTarget !== target || previousRoute !== route) {
    readRoute(car, target, route);
    // Estimate with a typical city speed, so the arrival time remains useful at a stop.
    const seconds = Math.ceil(distance / 12 / 5) * 5;
    setText(eta, '≈ ' + Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'));
    previousTarget = target;
    previousRoute = route;
    nextRoute = 0.2;
  }
  const turn = bearing - car.h - arrowAngle;
  arrowAngle += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, dt * 12);
  direction.style.rotate = arrowAngle.toFixed(3) + 'rad';
}

function level (el, value) {
  const percent = String(Math.round(value * 100));
  if (el.getAttribute('aria-valuenow') === percent) return;
  el.setAttribute('aria-valuenow', percent);
  el.style.setProperty('--vk-level', percent + '%');
}

export function fuel (value) {
  level(nitro, value);
}

export function cooling (carried, value, cold) {
  pizza.hidden = !carried;
  if (!carried) return;
  level(pizza, value);
  pizza.classList.toggle('cold', cold);
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
