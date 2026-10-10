/* Лист накладной — одна сборка на всех (автор, 10.10.2026: «в домофоне показана накладная, как в начале»):
   game.js showOrderCard (накладная в начале заказа), домофон (minigames/intercom.js) и подъезд (minigames/stairs.js),
   песочница (uilab/screens/hud.js). В листе: получатель (у сборного — «1. имя» и под ним адрес), адрес с квартирой
   (если дом многоэтажный — doorstep.js homeOf), заказ, оплата и строки вида (orders.js cardRows → extra), фото на скрепке.
   Вёрстка и стили листа — delivery.css (.oc-*); пометки ручкой и пятна — ordersheet.css.

     OS.html(order, { extra, t })        → '<div class="oc-sheet">…</div>' (строки — <tr data-k="who|addr|items|pay|x1…">)
     OS.flatText(st, t)                  → 'кв. 47' | '' — квартира остановки (st.home), как в накладной
     OS.blot(root, i, digit)             — пятно на цифре digit квартиры остановки i (не прочитать)
     OS.wipe(root, i)                    — пятно оттёрли: цифра видна, обведена ручкой
     OS.fix(root, i, text)               — номер зачёркнут ручкой, рядом от руки верный
     OS.pen(root, k, text, cls)          — приписка ручкой у строки k: 'flat' (у квартиры остановки 0) | 'pay' | 'addr' | …;
                                           cls: 'os-x' зачёркнуто, 'os-plus' зелёным, 'os-minus' красным */
import './ordersheet.css';
import { t as T0 } from '../i18n/index.js';
import { faceDataURL } from './people.js';

const name = (p, t) => (p && p.name) || t('Иван Иванов');

export function flatText (st, t = T0) {
  const h = st && st.home;
  return h && h.flat ? t('кв. {n}', { n: '<span class="os-n">' + h.flat + '</span>' }) : '';
}
const flatHTML = (st, i, t) => {
  const f = flatText(st, t);
  return f ? '<span class="os-flat" data-i="' + i + '">' + f + '</span>' : '';
};

/* строки листа: [ключ, подпись, значение] */
export function rows (order, o = {}) {
  const t = o.t || T0, stops = order.stops || [], many = stops.length > 1;
  const bundle = !!(order.ord && order.ord.bundle);
  const persons = stops.flatMap(st => st.persons || []);
  const who = bundle
    ? stops.map((st, i) => '<b>' + (i + 1) + '. ' + (st.persons || []).map(p => name(p, t)).join(', ') + '</b><small>' + st.addr +
        (flatText(st, t) ? ', ' + flatHTML(st, i, t) : '') + '</small>').join('')
    : persons.map(p => '<b>' + name(p, t) + '</b>').join('');   // у получателя — только имя (автор, 10.10.2026)
  const st0 = stops[0] || {};
  const addr = (st0.addr || '') + (flatText(st0, t) ? ', ' + flatHTML(st0, 0, t) : '') + (many ? ' → ' + t('ещё {n}', { n: stops.length - 1 }) : '');
  const extra = (o.extra || []).map((r, i) => [String(r[1]).includes('oc-pay') ? 'pay' : 'x' + i, r[0], r[1]]);
  return [
    ['who', t('получатель'), who],
    bundle ? null : ['addr', t('адрес'), addr],
    ['items', t('заказ'), order.items || ''],
    ...extra,
    // «пометки» и «комментария курьера» нет (автор, 10.10.2026: «убери пометки и комментарии курьеров вообще из интерфейса»)
  ].filter(Boolean);
}

export function html (order, o = {}) {
  const stops = order.stops || [], many = stops.length > 1;
  const persons = stops.flatMap(st => st.persons || []);
  const face = (p, n) => '<div class="oc-p">' + (n ? '<em>' + n + '</em>' : '') + (p ? '<img src="' + faceDataURL(p) + '" alt="">' : '<i></i>') + '</div>';
  const pics = stops.flatMap((st, i) => (st.persons || []).map(p => face(p, many ? i + 1 : 0))).join('');
  return '<div class="oc-sheet"><table class="oc-inv">' +
    rows(order, o).map(([k, th, td]) => '<tr data-k="' + k + '"><th>' + th + '</th><td>' + td + '</td></tr>').join('') + '</table>' +
    '<div class="oc-photos' + (persons.length > 2 ? ' small' : '') + '"><i class="oc-clip"></i>' + pics + '</div></div>';
}

/* ── пометки по ходу мини-игры ── */
const flatEl = (root, i = 0) => root && root.querySelector('.os-flat[data-i="' + i + '"]');
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => '&#' + c.charCodeAt(0) + ';');

export function blot (root, i, digit) {
  const n = flatEl(root, i) && flatEl(root, i).querySelector('.os-n');
  if (!n) return false;
  const s = n.dataset.v || n.textContent;
  n.dataset.v = s;
  n.innerHTML = s.split('').map((c, j) => (j === digit ? '<i class="os-blot">' + esc(c) + '</i>' : esc(c))).join('');
  return true;
}
export function wipe (root, i) {
  const b = flatEl(root, i) && flatEl(root, i).querySelector('.os-blot');
  if (!b) return false;
  b.className = 'os-wiped';
  return true;
}
export function fix (root, i, text) {
  const el = flatEl(root, i);
  if (!el) return false;
  el.classList.add('os-struck');
  let f = el.nextElementSibling;
  if (!f || !f.classList.contains('os-fix')) { f = document.createElement('em'); f.className = 'os-fix'; el.after(f); }
  f.textContent = text;
  return true;
}
export function pen (root, k, text, cls = '') {
  if (!root) return null;
  const at = k === 'flat' ? flatEl(root, 0) : null;
  const td = at ? null : root.querySelector('tr[data-k="' + k + '"] > td');
  if (!at && !td) return null;
  const e = document.createElement('em');
  e.className = 'os-pen ' + (at ? '' : 'os-row ') + cls;
  e.textContent = text;
  if (at) {
    // приписки у квартиры — по порядку, после исправления, если оно есть
    let last = at;
    while (last.nextElementSibling && /os-(fix|pen)/.test(last.nextElementSibling.className)) last = last.nextElementSibling;
    last.after(e);
  } else td.appendChild(e);
  return e;
}
