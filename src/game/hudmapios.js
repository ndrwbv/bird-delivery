/* Внешняя карта HUD: живой радар остаётся слева, запас нитро читается делениями. */
import './hudmapios.css';
import { t } from '../i18n/index.js';

let bars = null;
let pizzaEl = null, pizzaState = '';
const pizzaMark = () => '<span class="hios-pizza" role="img" aria-label="' + t('Пицца горячая') + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 9 5 12 9-10M4 8q7-4 16 2M8 7l1 2M16 8l-1 2M10 13h.1M13 16h.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path class="hios-pizza-heat" d="M8 4V1m5 3V1m5 4V2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path class="hios-pizza-snow" d="M18 1v7m-3-5 6 3m-6 0 6-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>';
const point = p => Array.isArray(p) ? p : [p?.x, p?.z];

/* Обзор заказа: масштаб считается по всему пути, включая машину и адрес. */
export function overview (canvas, { route = [], roads = [], origin, target } = {}) {
  if (!canvas || route.length < 2) return false;
  const path = route.map(point).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (path.length < 2) return false;
  const start = point(origin || path[0]), end = point(target || path[path.length - 1]);
  const fullPath = [start, ...path, end];
  const all = fullPath;
  const xs = all.map(p => p[0]), zs = all.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const W = canvas.width, H = canvas.height, margin = 26;
  const scale = Math.min((W - margin * 2) / Math.max(35, x1 - x0), (H - margin * 2) / Math.max(35, z1 - z0));
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const at = p => [W / 2 + (p[0] - cx) * scale, H / 2 + (p[1] - cz) * scale];
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.fillStyle = '#f0ead8'; ctx.fillRect(0, 0, W, H);
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const s of roads) {
    if (Math.max(s.x1, s.x2) < x0 - 80 || Math.min(s.x1, s.x2) > x1 + 80 ||
        Math.max(s.z1, s.z2) < z0 - 80 || Math.min(s.z1, s.z2) > z1 + 80) continue;
    const a = at([s.x1, s.z1]), b = at([s.x2, s.z2]);
    ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b);
    ctx.strokeStyle = s.c <= 3 ? '#eac47c' : '#faf8ed'; ctx.lineWidth = s.c <= 3 ? 5 : 3; ctx.stroke();
  }
  const trace = (pts, color, width) => {
    ctx.beginPath(); pts.forEach((p, i) => { const a = at(p); i ? ctx.lineTo(...a) : ctx.moveTo(...a); });
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  };
  trace(fullPath, '#fffdf4', 13); trace(fullPath, '#3185b6', 7);
  const a = at(start), b = at(end);
  // Синяя машина стоит в точном положении игрока; красный пин — у двери клиента.
  ctx.beginPath(); ctx.arc(...a, 12, 0, Math.PI * 2); ctx.fillStyle = '#267db4'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillRect(a[0] - 6, a[1] - 2, 12, 6);
  ctx.fillRect(a[0] - 4, a[1] - 5, 8, 4);
  ctx.fillStyle = '#267db4'; ctx.fillRect(a[0] - 4, a[1] - 1, 3, 2); ctx.fillRect(a[0] + 1, a[1] - 1, 3, 2);
  ctx.beginPath(); ctx.arc(b[0], b[1] - 3, 10, 0, Math.PI * 2); ctx.fillStyle = '#d95037'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(b[0] - 7, b[1] + 3); ctx.lineTo(b[0], b[1] + 13); ctx.lineTo(b[0] + 7, b[1] + 3); ctx.fillStyle = '#d95037'; ctx.fill();
  ctx.beginPath(); ctx.arc(b[0], b[1] - 3, 3, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  return true;
}

export function routePreview (radar, data) {
  if (!radar) return;
  if (!data?.route || data.route.length < 2) { radar.querySelector('.hios-route-overview')?.remove(); return; }
  let canvas = radar.querySelector('.hios-route-overview');
  if (!canvas) { canvas = document.createElement('canvas'); canvas.className = 'hios-route-overview'; canvas.width = 380; canvas.height = 272; radar.appendChild(canvas); }
  if (!overview(canvas, data)) canvas.remove();
}
export function init (radar) {
  if (!radar || bars) return;
  const el = document.createElement('div'); el.className = 'hios-fuel';
  el.setAttribute('aria-label', t('нитро'));
  el.innerHTML = '<svg viewBox="0 0 22 22" aria-hidden="true"><path d="M4 3h10v16H4zM7 6h4v5H7zM14 7h2l3 3v6c0 2-3 2-3 0v-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg><span class="hios-bars">' + '<i></i>'.repeat(6) + '</span>';
  el.innerHTML += pizzaMark();
  pizzaEl = el.querySelector('.hios-pizza'); pizzaEl.hidden = true;
  (document.getElementById('game') || document.body).appendChild(el);
  bars = [...el.querySelectorAll('.hios-bars i')];
}
export function fuel (value) {
  if (!bars) return;
  const count = Math.ceil(Math.max(0, Math.min(1, value)) * bars.length);
  bars.forEach((bar, i) => bar.classList.toggle('on', i < count));
}
export function pizza ({ carried = false, cooling = 0, cold = false } = {}) {
  if (!pizzaEl) return;
  const state = !carried ? 'empty' : cold ? 'cold' : cooling > 0 ? 'cooling' : 'warm';
  if (state === pizzaState) return;
  pizzaState = state; pizzaEl.hidden = !carried;
  pizzaEl.classList.toggle('cold', state === 'cold'); pizzaEl.classList.toggle('cooling', state === 'cooling');
  const label = cold ? t('Пицца остыла') : cooling > 0 ? t('Пицца остывает') : t('Пицца горячая');
  pizzaEl.setAttribute('aria-label', label); pizzaEl.title = label;
}

/* Макет внешней карты для изолированного просмотра телефона в ui.html. */
export function demoMap () {
  let el = document.getElementById('hios-demo');
  if (el) return el;
  el = document.createElement('div'); el.id = 'hios-demo'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<div class="hios-demo-map"><svg viewBox="0 0 240 240" preserveAspectRatio="xMidYMid slice">
    <rect width="240" height="240" fill="#f4ebd2"/><path fill="#aede82" d="M0 0h80l-5 76H0zm198 0h42v87l-38-12zM0 182l77-13 9 71H0z"/>
    <path d="M-10 64 250 114M-10 191 250 147M44-10l63 260M176-10l-13 260" stroke="#d5d2c7" stroke-width="26" fill="none"/>
    <path d="M-10 64 250 114M-10 191 250 147M44-10l63 260M176-10l-13 260" stroke="#f9f7eb" stroke-width="20" fill="none"/>
    <path d="M-9 225 247 15M35-8l174 259" stroke="#d3b67e" stroke-width="22" fill="none"/>
    <path d="M-9 225 247 15M35-8l174 259" stroke="#ffbd4c" stroke-width="18" fill="none"/>
    <g fill="#d6d4c9" stroke="#a7a89f"><path d="m80 12 31-3 4 25-29 4zM130 16l32-5-2 30-28 4zM12 91l31 5 2 30-31-4zM60 88l29 6 4 32-32-5zM115 89l33-6 4 34-34 5zM183 100l29-3 4 30-30 4zM10 145l30 5 3 26-30-1zM68 149l30 5 3 30-29-1zM118 154l35-5 2 31-33 4zM192 166l31-4 2 31-32 4zM102 207l30-4 3 27-30 3z"/></g>
    <g fill="#5e625f" stroke="#f8f7f0" stroke-width="2.5" paint-order="stroke" font-family="Arial" font-size="9"><text x="5" y="84" transform="rotate(12 5 84)">ул. Царевского</text><text x="147" y="214" transform="rotate(-11 147 214)">пр. Коммунистический</text></g>
    <path d="M102 186 112 150 161 130 171 101" stroke="#2686c5" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <circle cx="102" cy="186" r="10" fill="#2789e7" opacity=".25"/><circle cx="102" cy="186" r="5" fill="#2789e7" stroke="#fff" stroke-width="2"/>
    <path d="M171 85c-9 0-14 5-14 14 0 10 14 23 14 23s14-13 14-23c0-9-5-14-14-14z" fill="#e94b38" stroke="#fff" stroke-width="2"/><circle cx="171" cy="99" r="4" fill="white"/>
    </svg></div><div class="hios-fuel"><svg viewBox="0 0 22 22"><path d="M4 3h10v16H4zM7 6h4v5H7zM14 7h2l3 3v6c0 2-3 2-3 0v-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg><span class="hios-bars"><i class="on"></i><i class="on"></i><i class="on"></i><i></i><i></i></span></div>
    `;
  el.querySelector('.hios-fuel').insertAdjacentHTML('beforeend', pizzaMark());
  (document.getElementById('game') || document.body).appendChild(el);
  return el;
}
export function hideDemo () { document.getElementById('hios-demo')?.remove(); }
