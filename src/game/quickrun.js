/* Быстрый заезд (03.10.2026, IDEAS блок 7; правила — docs/CAREER.md «Быстрый заезд»).
   Отдельный режим из главного меню карьеры: выбрал сезон, длину смены, одну из своих машин и
   открытый район — и поехал. Заказы, деньги, сердца — как в смене, но:
     • деньги в копилку (кошелёк карьеры) не идут, прогресс карьеры не меняется — ни смены, ни районы,
       ни звёзды, ни уровень курьера, ни мотор машины, ни рейтинг пиццерии, ни таблица рекордов;
     • сюжетных и геройских глав нет (story.js nextOrder молчит);
     • в конце — свой экран «итоги заезда» (без гаража, донатов и «депнуть»).

   Как сохранение остаётся нетронутым: на время заезда хранилище площадки (Platform.store) получает
   «песочницу» — всё, что игра пишет, ложится в память (Map) и читается оттуда же, а в конце заезда
   выбрасывается. Закрыли игру посреди заезда — тоже ничего не записано. Мимо песочницы пишутся только
   настройки и то, что не про карьеру (PASS): звук, язык, имя, достижения, знакомства с героями,
   выбор и рекорд быстрого заезда (dlv-quick). Уровень курьера (dlv-msk-xp) на заезде заморожен (FREEZE):
   сборные — как на твоём уровне, «новый уровень» не выскакивает.

     QR.init(api)      — из game.js (что нужно — см. ниже)
     QR.on()           — идёт быстрый заезд (career.js, orders.js, story.js, game.js — точечные проверки)
     QR.len()          — длина смены заезда ({ id, slow } из ECON.SHIFT.LENGTHS)
     QR.openSetup()    — окно выбора (кнопка «быстрый заезд» в меню), QR.root() / QR.back() — геймпад и Esc
     QR.finish(r)      — из career.js showEnd: заезд кончился → песочницу выбросить, показать итоги

   api: Platform, Store { get, set }, S, Snd, money(n), cars() → cars.js (list), seasons { value(), forced(), set(v, forced),
        name(v) }, startRun(), toMenu(), afterQuick() — вернуть машину, пиццерию и сюжет к сохранённым. */
import './quickrun.css';
import { t } from '../i18n/index.js';
import { SHIFT, handlingK } from './econ.js';
import * as DIST from './districts.js';

const KEY = 'dlv-quick';
const PASS = new Set(['dlv-sound', 'dlv-lang', 'dlv-edition', 'dlv-name', 'dlv-map', 'dlv-ach', 'dlv-heroes', 'dlv-heroq', 'dlv-crashlog', KEY]);
const FREEZE = new Set(['dlv-msk-xp']);
/* сезоны на выбор: «как сейчас в карьере» и середина каждого (seasons.js: 0 — начало лета, год — 4) */
const SEASONS = [{ id: 'now' }, { id: 'summer', v: 0.5 }, { id: 'autumn', v: 1.5 }, { id: 'winter', v: 2.5 }, { id: 'spring', v: 3.5 }];
const SEASON_NAME = { summer: () => t('лето'), autumn: () => t('осень'), winter: () => t('зима'), spring: () => t('весна') };
const LEN_NAME = { short: () => t('короткая'), medium: () => t('средняя'), long: () => t('длинная') };

let A = null, box = null, endBox = null;
const Q = { on: false, opt: null, orig: null, over: null, sea: 0, seaForced: false, pace: 'normal', setupFrom: 'menu' };
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const copy = v => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);

export function init (api) {
  A = api;
  setTimeout(() => { if (window.__dlv) window.__dlv.QR = DEBUG; }, 0);
}
export const on = () => Q.on;
export const opts = () => Q.opt;
export const len = () => SHIFT.LENGTHS.find(l => l.id === (Q.opt && Q.opt.len)) || SHIFT.LENGTHS[1];
/* быстрый заезд — после первой смены карьеры (учебный заказ и вступление уже позади) */
export const available = () => !!A && (+A.Store.get('dlv-shifts', 0) || 0) >= 1;

/* ── песочница сохранения ── */
function sandbox (onOff) {
  const st = A.Platform.store;
  if (onOff) {
    if (Q.orig) return;
    const o = Q.orig = { get: st.get, set: st.set }, ov = Q.over = new Map();
    st.get = (k, d) => {
      if (!ov.has(k)) return o.get.call(st, k, d);
      const v = ov.get(k);
      return v === undefined || v === null ? d : copy(v);
    };
    st.set = (k, v) => {
      if (PASS.has(k)) return o.set.call(st, k, v);
      if (FREEZE.has(k)) return undefined;
      ov.set(k, copy(v));
      return undefined;
    };
  } else if (Q.orig) {
    st.get = Q.orig.get; st.set = Q.orig.set;
    Q.orig = null; Q.over = null;
  }
}

/* выбор: прошлый (dlv-quick) или по умолчанию — как сейчас в карьере */
function saved () {
  const v = A.Store.get(KEY, null);
  return v && typeof v === 'object' ? v : {};
}
function ownedCars () {
  let l = [];
  try { l = (A.cars() && A.cars().list()) || []; } catch (e) { l = []; }
  return l.filter(c => c.owned);
}
function choices () {
  const s = saved(), cars = ownedCars(), open = DIST.has() ? DIST.opened() : 1;
  const curCar = (cars.find(c => c.current) || cars[0] || {}).id;
  const o = {
    season: SEASONS.some(x => x.id === s.season) ? s.season : 'now',
    len: SHIFT.LENGTHS.some(l => l.id === s.len) ? s.len : 'medium',
    car: cars.some(c => c.id === s.car) ? s.car : curCar,
    dist: s.dist === 'city' && DIST.allOpen() ? 'city' : Number.isFinite(+s.dist) && +s.dist >= 0 && +s.dist < open ? +s.dist : (DIST.city() ? 'city' : DIST.cur()),
  };
  return o;
}

/* ── окно выбора ── */
function setupBox () {
  if (box) return box;
  box = document.createElement('div');
  box.id = 'qr-setup';
  box.hidden = true;
  box.innerHTML = '<div class="qr-box"><div class="qr-t"></div><div class="qr-sub"></div><div class="qr-body"></div>' +
    '<div class="qr-btns"><button type="button" class="qr-back"></button><button type="button" class="qr-go" autofocus></button></div></div>';
  ($('game') || document.body).appendChild(box);
  box.querySelector('.qr-back').addEventListener('click', () => back());
  box.querySelector('.qr-go').addEventListener('click', () => go());
  box.addEventListener('click', e => { if (e.target === box) back(); });
  return box;
}
let SEL = null;
function group (key, title, items) {
  return '<div class="qr-g" data-g="' + key + '"><div class="qr-gt">' + esc(title) + '</div><div class="qr-row">' +
    items.map(it => '<button type="button" class="qr-o' + (String(SEL[key]) === String(it.v) ? ' on' : '') + '" data-g="' + key + '" data-v="' + esc(it.v) + '">' +
      '<b>' + esc(it.name) + '</b>' + (it.sub ? '<span>' + esc(it.sub) + '</span>' : '') + '</button>').join('') + '</div></div>';
}
function render () {
  const S = A.seasons, cars = ownedCars();
  const body = box.querySelector('.qr-body');
  const mins = l => Math.round(SHIFT.BASE_S * l.slow / 60);
  body.innerHTML =
    group('season', t('сезон'), SEASONS.map(s => s.id === 'now'
      ? { v: 'now', name: t('как в карьере'), sub: S.name(S.value()) }
      : { v: s.id, name: SEASON_NAME[s.id](), sub: S.name(s.v) })) +
    group('len', t('длина смены'), SHIFT.LENGTHS.map(l => ({ v: l.id, name: LEN_NAME[l.id] ? LEN_NAME[l.id]() : l.id, sub: t('~{n} мин', { n: mins(l) }) }))) +
    group('car', t('машина'), cars.map(c => ({ v: c.id, name: c.name,
      sub: t('{kmh} км/ч · руль {h}/10', { kmh: Math.round((c.vmax || 0) * 3.6), h: handlingK(c.handling).h }) }))) +
    (DIST.has() ? group('dist', t('район'), [
      ...(DIST.allOpen() ? [{ v: 'city', name: t('весь город'), sub: t('заказы во всех районах') }] : []),
      ...DIST.list().slice(0, DIST.opened()).map((d, i) => ({ v: i, name: t(d.name), sub: t('открыт') })),
    ]) : '');
  body.querySelectorAll('.qr-o').forEach(b => b.addEventListener('click', () => {
    const g = b.dataset.g, v = b.dataset.v;
    SEL[g] = g === 'dist' && v !== 'city' ? +v : v;
    A.Snd.blip && A.Snd.blip(880, 0.04, 'square', 0.05);
    body.querySelectorAll('.qr-o[data-g="' + g + '"]').forEach(x => x.classList.toggle('on', x === b));
  }));
}
export function openSetup (from = 'menu') {
  if (!A || !available()) return false;
  setupBox();
  hideEnd();
  Q.setupFrom = from;
  SEL = choices();
  box.querySelector('.qr-t').textContent = t('быстрый заезд');
  box.querySelector('.qr-sub').textContent = t('деньги в копилку не идут, карьера не меняется, сюжета нет — просто покатать заказы');
  box.querySelector('.qr-back').textContent = t('назад');
  box.querySelector('.qr-go').textContent = t('поехали');
  render();
  box.hidden = false;
  return true;
}
function closeSetup () { if (box) box.hidden = true; }
export const root = () => (box && !box.hidden ? box : endBox && !endBox.hidden ? endBox : null);
/* назад: из окна выбора — в меню (или к итогам, если открыли с них); с итогов — в меню */
export function back () {
  if (box && !box.hidden) {
    closeSetup();
    if (Q.setupFrom === 'end') A.toMenu();
    return true;
  }
  if (endBox && !endBox.hidden) { hideEnd(); A.toMenu(); return true; }
  return false;
}

/* ── заезд ── */
function go () {
  if (Q.on) return;
  const o = { ...SEL };
  if (!ownedCars().some(c => c.id === o.car)) return;
  try { A.Store.set(KEY, { ...saved(), season: o.season, len: o.len, car: o.car, dist: o.dist }); } catch (e) { /* — */ }
  closeSetup();
  hideEnd();
  start(o);
}
function start (o) {
  Q.opt = o;
  Q.sea = A.seasons.value(); Q.seaForced = A.seasons.forced();
  Q.pace = DIST.has() ? DIST.pace().id : 'normal';
  sandbox(true);
  Q.on = true;
  // всё ниже — в песочнице: машина, район, режим «весь город»
  A.Store.set('dlv-car-cur', o.car);
  if (DIST.has()) {
    if (DIST.allOpen()) DIST.setCity(o.dist === 'city');
    if (o.dist !== 'city') DIST.set(+o.dist);
  }
  const sv = SEASONS.find(s => s.id === o.season);
  A.seasons.set(sv && sv.v !== undefined ? sv.v : Q.sea, true);   // forced: startRun сезон не сдвигает
  A.Snd.boot && A.Snd.boot();
  A.startRun();
}
/* выйти из заезда: песочницу — выбросить, сезон, волну, машину, пиццерию — как были */
function stop () {
  if (!Q.on) return;
  Q.on = false;
  sandbox(false);
  A.seasons.set(Q.sea, Q.seaForced);
  if (DIST.has()) DIST.setPace(Q.pace);
  try { A.afterQuick(); } catch (e) { console.error('[quickrun] afterQuick', e); }
}

/* ── итоги заезда ── */
function endUI () {
  if (endBox) return endBox;
  endBox = document.createElement('div');
  endBox.id = 'qr-end';
  endBox.hidden = true;
  endBox.innerHTML = '<div class="qr-box"><div class="qr-t"></div><div class="qr-sub"></div><div class="qr-earn"></div><div class="qr-rec" hidden></div>' +
    '<div class="qr-stats"></div><div class="qr-note"></div>' +
    '<div class="qr-btns"><button type="button" class="qr-menu"></button><button type="button" class="qr-again" autofocus></button></div></div>';
  ($('game') || document.body).appendChild(endBox);
  endBox.querySelector('.qr-menu').addEventListener('click', () => { hideEnd(); A.toMenu(); });
  endBox.querySelector('.qr-again').addEventListener('click', () => { openSetup('end'); });
  return endBox;
}
function hideEnd () { if (endBox) endBox.hidden = true; }
const clock = h => { const m = Math.floor(((h % 24) + 24) % 24 * 60); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
/* r: { title, why, money, delivered, tips, hits, fine, people, t0h, endH } — из career.js */
export function finish (r = {}) {
  const o = Q.opt || {}, car = ownedCars().find(c => c.id === o.car);
  const carName = car ? car.name : '';
  const seaName = A.seasons.name(A.seasons.value());
  const distName = o.dist === 'city' ? t('весь город') : DIST.has() ? t((DIST.list()[+o.dist] || {}).name || '') : '';
  stop();
  // рекорд быстрого заезда — свой, мимо карьеры (dlv-quick.best)
  const s = saved(), money = Math.max(0, Math.round(r.money || 0)), rec = money > (+s.best || 0);
  if (rec) { try { A.Store.set(KEY, { ...s, best: money }); } catch (e) { /* — */ } }
  endUI();
  endBox.querySelector('.qr-t').textContent = r.title || t('заезд окончен');
  endBox.querySelector('.qr-sub').textContent = r.why || '';
  endBox.querySelector('.qr-earn').innerHTML = '<span>' + esc(t('заработано за заезд')) + '</span><b>' + esc(A.money(money)) + '</b>';
  const recEl = endBox.querySelector('.qr-rec');
  recEl.hidden = !(rec && money > 0);
  recEl.textContent = t('новый рекорд быстрого заезда!');
  const rows = [
    [t('доставлено заказов'), String(r.delivered || 0)],
    r.tips > 0 ? [t('чаевые'), A.money(r.tips)] : null,
    [t('ударов'), String(r.hits || 0)],
    r.people ? [t('прохожих сбито'), String(r.people)] : null,
    r.fine ? [t('штраф за клиента'), '−' + A.money(r.fine)] : null,
    [t('на заезде'), clock(r.t0h ?? 9) + ' — ' + clock(r.endH ?? 9)],
    [t('машина'), carName],
    [t('сезон'), seaName],
    distName ? [t('район'), distName] : null,
    [t('лучший быстрый заезд'), A.money(Math.max(money, +s.best || 0))],
  ].filter(Boolean);
  endBox.querySelector('.qr-stats').innerHTML = rows.map(([k, v]) => '<div class="qr-r"><span>' + esc(k) + '</span><i></i><b>' + esc(v) + '</b></div>').join('');
  endBox.querySelector('.qr-note').textContent = t('быстрый заезд: в копилку не идёт, карьера не меняется');
  endBox.querySelector('.qr-menu').textContent = t('в меню');
  endBox.querySelector('.qr-again').textContent = t('ещё заезд');
  endBox.hidden = false;
  A.Snd.coin && A.Snd.coin();
}

/* отладка: __dlv.QR — start({ season, len, car, dist }) без окна, sandbox — что легло в песочницу */
const DEBUG = {
  on, opts, len, available, openSetup, back, root,
  start: (o = {}) => { const c = choices(); start({ ...c, ...o }); return Q.opt; },
  sandbox: () => (Q.over ? Object.fromEntries(Q.over) : null),
  choices: () => choices(),
};
