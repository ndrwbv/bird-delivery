import { t } from '../i18n/index.js';
import './vk-hud.css';

const mapIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 5.5 7.5 3l5 2.5 5-2.5v11.5l-5 2.5-5-2.5-5 2.5zM7.5 3v11.5m5-9V17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
const nitroIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m11 1-7 10h5l-1 8 8-11h-5z" fill="currentColor"/></svg>';

const PROJECTION = { width: 240, height: 72, range: 64, stride: 3.2 };
let projection, paint, destination, details, name, deadline, payment, gain, shift, nitro, charge, pizza, heat;
let shownTime, previousTarget, previousRoute, drawnX, drawnZ, drawnHeading;
let payTimer;

export function init (radar, left, right) {
  const nav = document.createElement('button');
  nav.className = 'vk-nav';
  nav.type = 'button';
  nav.title = t('карта района');
  nav.innerHTML = '<span class="vk-nav-map">' + mapIcon + '</span><span class="vk-nav-copy"><strong class="vk-nav-destination"></strong><span class="vk-nav-details" hidden><span class="vk-nav-name"></span><span class="vk-nav-deadline"></span></span></span><canvas class="vk-nav-route" aria-hidden="true" hidden></canvas>';
  destination = nav.querySelector('.vk-nav-destination');
  details = nav.querySelector('.vk-nav-details');
  [name, deadline] = details.children;
  projection = nav.lastElementChild;
  projection.width = PROJECTION.width * 2;
  projection.height = PROJECTION.height * 2;
  paint = projection.getContext('2d');
  paint.scale(2, 2);
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
  const nitroLabel = t('Нитро');
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

// Snap to the start of the current route as the car moves between route recalculations.
function nearbyPoint (car, route) {
  let [x, z] = route[0];
  let end = 1, travelled = 0, best = Math.hypot(x - car.x, z - car.z);
  for (let i = 1; i < route.length && travelled < 24; i++) {
    const [ax, az] = route[i - 1], [bx, bz] = route[i];
    const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
    if (!length) continue;
    const u = Math.max(0, Math.min(1, ((car.x - ax) * dx + (car.z - az) * dz) / (length * length)));
    const px = ax + dx * u, pz = az + dz * u;
    const distance = Math.hypot(px - car.x, pz - car.z);
    if (travelled + u * length > 28) break;
    if (distance < best) { best = distance; x = px; z = pz; end = i; }
    travelled += length;
  }
  return { x, z, end };
}

function drawProjection (car, route) {
  const { width, height, range, stride } = PROJECTION;
  paint.clearRect(0, 0, width, height);
  const sin = Math.sin(car.h), cos = Math.cos(car.h);
  const project = (x, z, travelled) => {
    const dx = x - car.x, dz = z - car.z;
    const depth = dx * sin + dz * cos;
    const scale = 33 / (33 + Math.max(-15, depth) * 0.78);
    return {
      x: width / 2 + (dx * cos - dz * sin) * scale * 2.8,
      y: height - 17 - depth * scale * 1.8,
      width: 5.4 * scale,
      travelled,
    };
  };

  const start = nearbyPoint(car, route);
  const points = [];
  let x = car.x, z = car.z, travelled = 0;
  points.push(project(x, z, 0));
  for (let i = start.end - 1; i < route.length && travelled < range; i++) {
    const [px, pz] = i === start.end - 1 ? [start.x, start.z] : route[i];
    const dx = px - x, dz = pz - z;
    const length = Math.hypot(dx, dz);
    const span = Math.min(length, range - travelled);
    const n = Math.ceil(span / stride);
    for (let j = 1; j <= n; j++) {
      const d = span * j / n;
      points.push(project(x + dx * d / length, z + dz * d / length, travelled + d));
    }
    travelled += span;
    x = px; z = pz;
  }

  paint.lineCap = 'round';
  const fade = Math.max(6, travelled);
  for (const outline of [true, false]) {
    paint.strokeStyle = outline ? '#102e40' : '#b5f6ff';
    for (let i = points.length - 1; i > 0; i--) {
      const a = points[i - 1], b = points[i];
      const progress = (a.travelled + b.travelled) / (2 * fade);
      const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      const edge = Math.max(0, Math.min(1, Math.min(x, width - x, y, height - y) / 14));
      paint.globalAlpha = Math.pow(1 - progress, 1.65) * edge * (outline ? 0.58 : 0.86);
      paint.lineWidth = (a.width + b.width) / 2 + (outline ? 2 : 0);
      paint.beginPath();
      paint.moveTo(a.x, a.y);
      paint.lineTo(b.x, b.y);
      paint.stroke();
    }
  }
  paint.globalAlpha = 1;
}

function setText (el, value) {
  if (el.textContent !== value) el.textContent = value;
}

export function routeStep (car, target, route, address, recipient, time) {
  projection.hidden = !target || route.length < 2;
  details.hidden = !target || (!recipient && time === null);
  name.hidden = !recipient;
  deadline.hidden = time === null;
  destination.classList.toggle('active', !!target);
  setText(destination, target ? address : t('карта района'));
  if (!target) {
    previousTarget = null;
    return;
  }
  setText(name, recipient);
  if (time !== shownTime) {
    const clock = time > 0 ? Math.floor(time / 60) + ':' + String(time % 60).padStart(2, '0') : '';
    setText(deadline, time === null ? '' : time === 0 ? t('Время вышло') : t('Осталось {n}', { n: clock }));
    deadline.classList.toggle('urgent', time !== null && time <= 10);
    shownTime = time;
  }
  const changed = previousTarget !== target || previousRoute !== route;
  if (!projection.hidden && (changed || Math.hypot(car.x - drawnX, car.z - drawnZ) > 0.12 || Math.abs(car.h - drawnHeading) > 0.008)) {
    drawProjection(car, route);
    drawnX = car.x; drawnZ = car.z; drawnHeading = car.h;
  }
  previousTarget = target;
  previousRoute = route;
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
