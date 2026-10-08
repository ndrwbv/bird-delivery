/* Выбор района — карусель карточек (05.10.2026, docs/IDEAS.md № 12; правила — docs/CAREER.md «Районы»).
   Было: список строк «машина +20 % · оплата +15 % · 4 из 4 смен · загибается ★☆☆☆☆» — игроку непонятно.
   Стало: как главное меню и гараж — одна крупная карточка района в центре, соседи по бокам; на карточке
   словами: где это, далеко ли заказы, на сколько больше платят, на сколько резвее машина, есть ли бандиты,
   как растёт пиццерия; внизу — большая кнопка «на смену здесь». Закрытые районы — тоже карточки (видно,
   что там ждёт), кнопка серая, под ней — сколько смен до открытия.

     DP.open({ title, cards, idx, onPick(key), onBack(), onFlip() }) — показать (cards — districtCards / cityCard)
     DP.districtCards({ btn, cur, closed }) — карточки 8 районов; btn — надпись кнопки; cur — номер, где работаешь
     DP.cityCard({ btn, on, far }) — карточка «весь город» (cityopen.js)
     DP.root() / DP.isOpen() / DP.back() / DP.flip(±1) / DP.close()

   Кто зовёт: menu.js («сменить район» на карточке «на смену») и cityopen.js (всё открыто — выбор перед
   сменой). Листать — свайп, ◀ ▶, ←→, стик, крестовина, LB/RB (career.js padPre / onKey зовут DP.flip),
   выбрать — A / Enter / тап по кнопке, назад — B / Esc / «назад». */
import './distpick.css';
import { t, tn, N_ } from '../i18n/index.js';
import * as DIST from './districts.js';
import * as GROW from './growth.js';
import * as ZN from './zones.js';
import { DISTRICT, PAY, CITY } from './econ.js';
import { carousel } from './carousel.js';

let el = null, CZ = null, ON = null;
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pc = k => Math.round((k - 1) * 100);
const km = m => String(Math.round(m / 100) / 10).replace('.', ',');

/* где это — по id района карты Солнечного (src/maps/seversk/index.js); другой карты — без строки */
const WHERE = {
  south: N_('южный край города, у кольца — всё рядом'),
  ring: N_('от кольца до Солнечной, вдоль реки'),
  avenue: N_('середина города, улица Калинина'),
  center: N_('у площади Ленина, самые людные улицы'),
  old: N_('северо-запад: старые кварталы'),
  east: N_('за железкой: особняки богачей, промзона, тракт'),
  north: N_('север: гаражи и заводы, ехать далеко'),
  west: N_('запад за речкой: частные дома'),
};

function build () {
  if (el) return el;
  el = document.createElement('div');
  el.id = 'cr-dpick';
  el.hidden = true;
  el.innerHTML = '<div class="dp-t"></div><div class="dp-car"></div><div class="dp-bot"><button type="button" class="dp-back"></button></div>';
  (document.getElementById('game') || document.body).appendChild(el);
  CZ = carousel(el.querySelector('.dp-car'), { cls: 'dp-cz', scales: [1, 0.84, 0.7], reach: 2,
    onChange: () => { if (ON && ON.onFlip) try { ON.onFlip(); } catch (e) { /* — */ } } });
  el.querySelector('.dp-back').addEventListener('click', () => back());
  return el;
}

const row = (cls, k, v) => '<div class="dp-r' + (cls ? ' ' + cls : '') + '"><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>';
function card (key, cls, num, name, where, rows, foot, btn, locked) {
  const c = document.createElement('div');
  c.className = 'dp-card' + (cls ? ' ' + cls : '');
  c.dataset.key = key; c.dataset.title = name;
  c.innerHTML = '<div class="dp-h"><em>' + esc(num) + '</em><b>' + esc(name) + '</b>' +
      (cls.includes('cur') ? '<i>' + esc(t('ты здесь')) + '</i>' : locked ? '<i class="lk">' + esc(t('закрыт')) + '</i>' : '') + '</div>' +
    (where ? '<div class="dp-w">' + esc(where) + '</div>' : '') +
    '<dl class="dp-rows">' + rows.join('') + '</dl>' +
    (foot ? '<div class="dp-f">' + esc(foot) + '</div>' : '') +
    '<button type="button" class="dp-go" data-main' + (locked ? ' disabled' : '') + '>' + esc(locked ? t('пока закрыт') : btn) + '</button>';
  if (!locked) c.querySelector('.dp-go').addEventListener('click', () => pick(key));
  return c;
}

/* бандиты в районе i — есть ли круг (с учётом доната) */
const gangIn = i => { try { return ZN.gangZones().some(g => DIST.at(g.x, g.z) === i); } catch (e) { return false; } };

/* строки «что даёт район» — одинаковые для открытых и закрытых (закрытые — посмотреть, что впереди) */
function distRows (i) {
  const [, far] = DISTRICT.DIST[Math.min(i, DISTRICT.DIST.length - 1)];
  const p = pc(DISTRICT.PAY[i] || 1), s = pc(DISTRICT.SPEED[i] || 1);
  const r = [
    row('', t('заказы'), t('до {km} км от пиццерии', { km: km(far) })),
    row(p ? 'up' : '', t('оплата'), p ? t('на {p} % больше за каждый заказ', { p }) : t('обычная')),
    row(s ? 'up' : '', t('машина'), s ? t('едет и разгоняется на {s} % быстрее', { s }) : t('обычная скорость')),
  ];
  if (gangIn(i)) r.push(row('warn', t('бандиты'), t('есть: у них платят на {p} % больше, но берут мзду', { p: pc(PAY.ZONE.gang || 1) })));
  const left = GROW.toNext(i);
  r.push(row('', t('пиццерия'), GROW.label(i) + (left ? ' · ' + tn(left, 'вырастет через {n} доставку|вырастет через {n} доставки|вырастет через {n} доставок') : '')));
  return r;
}

/** карточки 8 районов: открытые — с кнопкой btn, закрытые — серые, со сроком открытия */
export function districtCards ({ btn, cur = DIST.cur(), noCur = false } = {}) {
  const open = DIST.opened(), L = DIST.list(), last = open - 1;
  return L.map((d, i) => {
    const locked = i >= open, name = t(d.name), sh = DIST.shiftsIn(i);
    let foot = '';
    if (locked) {
      foot = i === open ? tn(Math.max(1, DIST.need(last) - DIST.shiftsIn(last)), 'откроется через {n} смену в районе «{prev}»|откроется через {n} смены в районе «{prev}»|откроется через {n} смен в районе «{prev}»', { prev: t(L[last].name) })
        : t('откроется после района «{prev}»', { prev: t(L[i - 1].name) });
    } else if (i === last && i < L.length - 1) {
      foot = tn(Math.max(1, DIST.need(i) - sh), 'до района «{next}» — ещё {n} смена здесь|до района «{next}» — ещё {n} смены здесь|до района «{next}» — ещё {n} смен здесь', { next: t(L[i + 1].name) }) +
        ' · ' + tn(DISTRICT.COUNT_MIN, 'в зачёт — от {n} заказа за смену|в зачёт — от {n} заказов за смену|в зачёт — от {n} заказов за смену');
    } else foot = sh ? tn(sh, 'ты отработал тут {n} смену|ты отработал тут {n} смены|ты отработал тут {n} смен') : '';
    return card(String(i), (!noCur && i === cur ? 'cur' : '') + (locked ? ' lock' : ''), String(i + 1), name, WHERE[d.id] ? t(WHERE[d.id]) : '', distRows(i), foot, btn, locked);
  });
}
/** «весь город» (всё открыто, cityopen.js): far — премии за 2 / 3 / 4 км строкой */
export function cityCard ({ btn, on, far }) {
  const rows = [
    row('', t('заказы'), t('во всех районах; после заказа — в ближайшую пиццерию')),
    row('up', t('оплата'), t('на {p} % больше за каждый заказ', { p: pc(CITY.PAY) })),
    row('up', t('за дальние'), t('премия: 2 / 3 / 4 км — {far}', { far })),
    row('up', t('машина'), t('едет и разгоняется на {s} % быстрее', { s: pc(CITY.SPEED) })),
  ];
  return card('city', 'city' + (on ? ' cur' : ''), '★', t('весь город'), t('все 8 районов сразу'), rows, '', btn, false);
}

export function open ({ title, cards, idx = 0, onPick, onBack, onFlip, back: backTxt }) {
  build();
  ON = { onPick, onBack, onFlip };
  el.querySelector('.dp-t').textContent = title;
  el.querySelector('.dp-back').textContent = backTxt || t('назад');
  el.hidden = false;
  CZ.set(cards, idx);
  requestAnimationFrame(() => fit());
}
/* не влезает по высоте (телефон боком, Дека с крупным шрифтом) — уменьшить карточки целиком */
function fit () {
  if (!el || el.hidden) return;
  for (const c of CZ.cards()) c.style.zoom = '';
  const st = el.querySelector('.cz-stage'), h = st ? st.clientHeight : 0;
  const hi = Math.max(...CZ.cards().map(c => c.offsetHeight));
  if (h && hi > h) { const k = Math.max(0.55, Math.floor(h / hi * 100) / 100); for (const c of CZ.cards()) c.style.zoom = k; }
}
addEventListener('resize', () => fit());

function pick (key) {
  const cb = ON && ON.onPick;
  close();
  if (cb) cb(key);
}
export function close () { if (el) el.hidden = true; ON = null; }
export const isOpen = () => !!(el && !el.hidden && el.isConnected);
export const root = () => (isOpen() ? el : null);
export function back () {
  if (!isOpen()) return false;
  const cb = ON && ON.onBack;
  close();
  if (cb) cb();
  return true;
}
/** листать (геймпад, клавиши); true — пролистнули */
export const flip = d => !!(isOpen() && CZ && CZ.flip(d));
export const DEBUG = { open, close, flip, districtCards, cityCard, root };
