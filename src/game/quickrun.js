/* Быстрый заезд (03.10.2026, IDEAS блок 7; правила — docs/CAREER.md «Быстрый заезд»).
   Отдельный режим из главного меню карьеры: выбрал сезон, длину смены, одну из своих машин и
   открытый район — и поехал. Заказы, деньги, сердца — как в смене, но:
     • деньги в копилку (кошелёк карьеры) не идут, прогресс карьеры не меняется — ни смены, ни районы,
       ни звёзды, ни уровень курьера, ни мотор машины, ни рейтинг пиццерии, ни таблица рекордов;
     • сюжетных и геройских глав нет (story.js nextOrder молчит);
     • в конце — свой «чек заезда» (без гаража, донатов и «депнуть»).

   Вид (09.10.2026, UI-REVIEW.md пачка П2) — бумага «как накладная» (src/styles/paper.css):
     • выбор — «ПУТЕВОЙ ЛИСТ»: строки-поля СЕЗОН ◀ ▶ · ПОГОДА ◀ ▶ (только допустимая для сезона) ·
       ДЛИНА ◀ ▶ · МАШИНА и РАЙОН — только если вариантов больше одного. ↑↓ — по строкам, ←→ / LB RB —
       значение сразу; A из любой строки — «ПОЕХАЛИ», B — назад. Касание — ◀ ▶ пальцем;
     • итог — чек с печатью «ЗАЕЗД» (и «РЕКОРД», если побил прошлый рекорд > 0), штамп «ЕЩЁ ЗАЕЗД [A]» —
       сразу с теми же условиями, [X] — поменять условия, [B] — в меню.

   Как сохранение остаётся нетронутым: на время заезда хранилище площадки (Platform.store) получает
   «песочницу» — всё, что игра пишет, ложится в память (Map) и читается оттуда же, а в конце заезда
   выбрасывается. Закрыли игру посреди заезда — тоже ничего не записано. Мимо песочницы пишутся только
   настройки и то, что не про карьеру (PASS): звук, язык, имя, достижения, знакомства с героями,
   выбор и рекорд быстрого заезда (dlv-quick). Уровень курьера (dlv-msk-xp) на заезде заморожен (FREEZE):
   сборные — как на твоём уровне, «новый уровень» не выскакивает.

     QR.init(api)      — из game.js (что нужно — см. ниже)
     QR.on()           — идёт быстрый заезд (career.js, orders.js, story.js, game.js — точечные проверки)
     QR.len()          — длина смены заезда ({ id, slow } из ECON.SHIFT.LENGTHS)
     QR.openSetup()    — путевой лист (кнопка «быстрый заезд» в меню), QR.root() / QR.back() — геймпад и Esc
     QR.pad(p)         — из game.js padStep до padMenu: ←→ / LB RB — значение строки, A — поехали, X — условия
     QR.finish(r)      — из career.js showEnd: заезд кончился → песочницу выбросить, показать чек

   api: Platform, Store { get, set }, S, Snd, money(n), cars() → cars.js (list), seasons { value(), forced(), set(v, forced),
        name(v) }, weather — weather.js (IDS, NAME, CHANCES, bucket, force), startRun(), toMenu(), afterQuick() — вернуть машину,
        пиццерию и сюжет к сохранённым. */
import './quickrun.css';
import { t } from '../i18n/index.js';
import { SHIFT, handlingK } from './econ.js';
import * as DIST from './districts.js';
import { keyHTML, refreshKeys, matchKey } from '../input/glyphs.js';
import * as PFX from './paperfx.js';

const KEY = 'dlv-quick';
const PASS = new Set(['dlv-sound', 'dlv-vol-music', 'dlv-vol-sfx', 'dlv-vol-eng', 'dlv-lang', 'dlv-edition', 'dlv-name', 'dlv-map', 'dlv-ach', 'dlv-heroes', 'dlv-heroq', 'dlv-crashlog', KEY]);
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
const num = n => '№ ' + String(Math.max(1, n | 0)).padStart(4, '0');
const blip = (f = 880) => { try { A.Snd.click && A.Snd.click(f, 0.05, 0.04); } catch (e) { /* — */ } };

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
/* погода, допустимая для сезона: «по календарю» + варианты из шансов сезона (weather.js CHANCES) —
   зима: обычная и снежная; лето: обычная, жара, дождь, гроза, ураган; и т. д. Жары зимой не бывает */
function seasonBucket (id) {
  const W = A.weather;
  if (id !== 'now') return id;
  try { return W && W.bucket ? W.bucket() : 'summer'; } catch (e) { return 'summer'; }
}
function weathers (seasonId) {
  const W = A.weather;
  if (!W) return [];
  const tab = W.CHANCES && W.CHANCES[seasonBucket(seasonId)];
  return ['auto', ...W.IDS.filter(id => !tab || tab[id] !== undefined)];
}
function choices () {
  const s = saved(), cars = ownedCars(), open = DIST.has() ? DIST.opened() : 1;
  const curCar = (cars.find(c => c.current) || cars[0] || {}).id;
  const season = SEASONS.some(x => x.id === s.season) ? s.season : 'now';
  return {
    season,
    weather: weathers(season).includes(s.weather) ? s.weather : 'auto',
    len: SHIFT.LENGTHS.some(l => l.id === s.len) ? s.len : 'medium',
    car: cars.some(c => c.id === s.car) ? s.car : curCar,
    dist: s.dist === 'city' && DIST.allOpen() ? 'city' : Number.isFinite(+s.dist) && +s.dist >= 0 && +s.dist < open ? +s.dist : (DIST.city() ? 'city' : DIST.cur()),
  };
}

/* ── путевой лист ── */
let SEL = null;
/* строки листа: { key, label, opts: [{ v, name, sub }] }; строка с одним вариантом не показывается */
function fields () {
  const S = A.seasons, mins = l => Math.round(SHIFT.BASE_S * l.slow / 60);
  const f = [
    { key: 'season', label: t('сезон'), opts: SEASONS.map(s => s.id === 'now'
      ? { v: 'now', name: t('как в карьере'), sub: S.name(S.value()) }
      : { v: s.id, name: SEASON_NAME[s.id](), sub: '' }) },
  ];
  if (A.weather) {
    f.push({ key: 'weather', label: t('погода'), opts: weathers(SEL.season).map(id => id === 'auto'
      ? { v: 'auto', name: t('по календарю'), sub: t('как выпадет') }
      : { v: id, name: A.weather.NAME[id](), sub: id === 'hurricane' ? t('уносит дома') : '' }) });
  }
  f.push({ key: 'len', label: t('длина'), opts: SHIFT.LENGTHS.map(l => ({ v: l.id, name: LEN_NAME[l.id] ? LEN_NAME[l.id]() : l.id, sub: t('~{n} мин', { n: mins(l) }) })) });
  f.push({ key: 'car', label: t('машина'), opts: ownedCars().map(c => ({ v: c.id, name: c.name,
    sub: t('{kmh} км/ч · руль {h}/10', { kmh: Math.round((c.vmax || 0) * 3.6), h: handlingK(c.handling).h }) })) });
  if (DIST.has()) {
    f.push({ key: 'dist', label: t('район'), opts: [
      ...(DIST.allOpen() ? [{ v: 'city', name: t('весь город'), sub: t('заказы во всех районах') }] : []),
      ...DIST.list().slice(0, DIST.opened()).map((d, i) => ({ v: i, name: t(d.name), sub: '' })),
    ] });
  }
  return f.filter(x => x.opts.length > 1);
}
const fieldOf = key => fields().find(f => f.key === key);
const optOf = f => f.opts.find(o => String(o.v) === String(SEL[f.key])) || f.opts[0];

function setupBox () {
  if (box) return box;
  box = document.createElement('div');
  box.id = 'qr-setup';
  box.className = 'pp-desk qr-desk';
  box.hidden = true;
  ($('game') || document.body).appendChild(box);
  box.addEventListener('click', e => {
    if (e.target === box) { back(); return; }
    const ar = e.target.closest('.qr-ar');
    if (ar) { flip(ar.closest('.qr-f').dataset.f, +ar.dataset.d); return; }
    if (e.target.closest('.qr-go')) { go(); return; }
    if (e.target.closest('.qr-back')) back();
  });
  return box;
}
function rowHTML (f, i) {
  const o = optOf(f);
  return '<div class="qr-f" data-pad tabindex="-1" data-f="' + f.key + '"' + (i === 0 ? ' data-pad-main' : '') + '>' +
    '<span class="qr-fl">' + esc(f.label) + '</span>' +
    '<button type="button" class="qr-ar" data-pad-skip data-d="-1" aria-label="◀">◀</button>' +
    '<span class="qr-fv"><b>' + esc(o.name) + '</b><small>' + esc(o.sub || '') + '</small></span>' +
    '<button type="button" class="qr-ar" data-pad-skip data-d="1" aria-label="▶">▶</button></div>';
}
function render () {
  const runs = +saved().runs || 0;
  box.innerHTML =
    '<section class="pp-sheet pp-in qr-sheet">' +
      '<header class="pp-head"><span>' + esc(t('путевой лист')) + '</span><b>' + num(runs + 1) + '</b></header>' +
      '<div class="qr-fields">' + fields().map(rowHTML).join('') + '</div>' +
      '<p class="qr-warn">' + esc(t('в копилку не идёт, сюжета нет')) + '</p>' +
      '<button type="button" class="pp-stamp qr-go">' + keyHTML('ok') + esc(t('поехали')) + '</button>' +
    '</section>' +
    '<nav class="pp-margin"><button type="button" class="pp-note qr-back">' + keyHTML('back') + esc(Q.setupFrom === 'end' ? t('в меню') : t('назад')) + '</button></nav>';
  refreshKeys(box);
  fit(box);
}
/* значение строки key — на d вперёд (по кругу); сезон сменился — погода не к сезону → «по календарю» */
function flip (key, d) {
  const f = fieldOf(key);
  if (!f || !d) return;
  const i = Math.max(0, f.opts.findIndex(o => String(o.v) === String(SEL[key])));
  const o = f.opts[(i + d + f.opts.length) % f.opts.length];
  SEL[key] = key === 'dist' && o.v !== 'city' ? +o.v : o.v;
  if (key === 'season' && !weathers(SEL.season).includes(SEL.weather)) SEL.weather = 'auto';
  blip(d > 0 ? 880 : 740);
  // строки на месте (курсор геймпада не теряется) — меняются только значения
  for (const g of fields()) {
    const row = box.querySelector('.qr-f[data-f="' + g.key + '"]');
    if (!row) continue;
    const v = optOf(g), b = row.querySelector('.qr-fv b'), s = row.querySelector('.qr-fv small');
    if (b.textContent === v.name && s.textContent === (v.sub || '')) continue;
    b.textContent = v.name; s.textContent = v.sub || '';
    row.dataset.dir = d > 0 ? 'r' : 'l';
    PFX.replay(row.querySelector('.qr-fv'), 'qr-turn');
  }
}
export function openSetup (from = 'menu') {
  if (!A || !available()) return false;
  setupBox();
  hideEnd();
  Q.setupFrom = from;
  SEL = choices();
  render();
  box.hidden = false;
  return true;
}
function closeSetup () { if (box) box.hidden = true; }
export const root = () => (box && !box.hidden ? box : endBox && !endBox.hidden ? endBox : null);
/* назад: из путевого листа — в меню; с чека — в меню */
export function back () {
  if (box && !box.hidden) {
    closeSetup();
    if (Q.setupFrom === 'end') A.toMenu();
    return true;
  }
  if (endBox && !endBox.hidden) { hideEnd(); A.toMenu(); return true; }
  return false;
}

/* геймпад (game.js padStep, до padMenu и career padPre): на путевом листе ←→ и LB/RB меняют значение
   строки под курсором, A из любой строки — «поехали» (на пометке «назад» — её); на чеке X — поменять условия.
   Курсора нет (играли мышью) — первое ←→ только зажигает его (padmenu.js), A — сразу главное */
export function pad (p) {
  const r = root();
  if (!r || !p) return;
  const sel = r.querySelector('.padsel');
  if (r === box) {
    const row = sel && sel.closest('.qr-f');
    const d = (p.menuRight || p.pageR ? 1 : 0) - (p.menuLeft || p.pageL ? 1 : 0);
    if (d && sel) {
      if (row) flip(row.dataset.f, d);
      p.menuLeft = p.menuRight = p.pageL = p.pageR = false;
    }
    if (p.menuOk && (!sel || row)) { p.menuOk = false; PFX.press(box.querySelector('.qr-go')); go(); }
  } else if (r === endBox) {
    if (p.btnX) { p.btnX = false; changeConds(); }
  }
}
/* клавиатура: раньше career.js (этот модуль грузится первым) — ←→ / A D / Q E по строке, Enter — поехали, X — условия;
   ↑↓ и Esc — как везде (career.js KB) */
function onKey (e) {
  const r = root();
  if (!r || e.repeat && /Enter|Space/.test(e.code)) return;
  const tg = e.target;
  if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return;
  const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
  const sel = r.querySelector('.padsel');
  if (r === box) {
    const d = /ArrowRight|KeyD|KeyE/.test(e.code) ? 1 : /ArrowLeft|KeyA|KeyQ/.test(e.code) ? -1 : 0;
    const row = sel && sel.closest('.qr-f');
    if (d && row) { stop(); flip(row.dataset.f, d); return; }
    if (d && sel) { stop(); return; }
    if (matchKey('ok', e) && (!sel || row)) { stop(); go(); }
  } else if (r === endBox && matchKey('x', e)) { stop(); changeConds(); }
}
if (typeof addEventListener === 'function') addEventListener('keydown', onKey, true);

/* лист не влез (длинный язык, маленький экран) — весь стол чуть меньше (zoom, не меньше 0,7).
   Мерим по offsetTop/offsetHeight: лист ещё влетает (transform), scrollHeight врёт */
function fit (desk) {
  for (const c of desk.children) c.style.zoom = '';
  requestAnimationFrame(() => {
    if (desk.hidden || !desk.children.length) return;
    let top = Infinity, bot = -Infinity;
    for (const c of desk.children) { top = Math.min(top, c.offsetTop); bot = Math.max(bot, c.offsetTop + c.offsetHeight); }
    const cs = getComputedStyle(desk), H = desk.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (bot - top > H + 2) {
      const k = Math.max(0.7, H / (bot - top)).toFixed(3);
      for (const c of desk.children) c.style.zoom = k;
    }
  });
}

/* ── заезд ── */
function go () {
  if (Q.on || !SEL) return;
  const o = { ...SEL };
  if (!ownedCars().some(c => c.id === o.car)) return;
  const s = saved();
  try { A.Store.set(KEY, { ...s, season: o.season, weather: o.weather, len: o.len, car: o.car, dist: o.dist, runs: (+s.runs || 0) + 1 }); } catch (e) { /* — */ }
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
  if (A.weather) A.weather.force(o.weather && o.weather !== 'auto' ? o.weather : null);   // startRun → weather.shiftStart
  A.Snd.boot && A.Snd.boot();
  A.startRun();
}
/* выйти из заезда: песочницу — выбросить, сезон, волну, машину, пиццерию — как были */
function stop () {
  if (!Q.on) return;
  Q.on = false;
  sandbox(false);
  if (A.weather) A.weather.force(null);
  A.seasons.set(Q.sea, Q.seaForced);
  if (DIST.has()) DIST.setPace(Q.pace);
  try { A.afterQuick(); } catch (e) { console.error('[quickrun] afterQuick', e); }
}

/* ── чек заезда ── */
let endTok = 0;
function endUI () {
  if (endBox) return endBox;
  endBox = document.createElement('div');
  endBox.id = 'qr-end';
  endBox.className = 'pp-desk qr-desk';
  endBox.hidden = true;
  ($('game') || document.body).appendChild(endBox);
  endBox.addEventListener('click', e => {
    if (e.target.closest('.qr-again')) again();
    else if (e.target.closest('.qr-change')) changeConds();
    else if (e.target.closest('.qr-menu')) { hideEnd(); A.toMenu(); }
  });
  return endBox;
}
function hideEnd () { if (endBox) endBox.hidden = true; endTok++; }
/* «ещё заезд» — сразу, с теми же условиями (последний выбор лежит в dlv-quick) */
function again () {
  if (Q.on || !available()) return;
  SEL = choices();
  PFX.press(endBox && endBox.querySelector('.qr-again'));
  go();
}
function changeConds () { if (!Q.on) openSetup('end'); }
const clock = h => { const m = Math.floor(((h % 24) + 24) % 24 * 60); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* r: { title, why, money, delivered, tips, hits, fine, people, t0h, endH } — из career.js */
export function finish (r = {}) {
  const o = Q.opt || {}, car = ownedCars().find(c => c.id === o.car);
  const carName = car ? car.name : '';
  const seaName = A.seasons.name(A.seasons.value());
  const distName = o.dist === 'city' ? t('весь город') : DIST.has() ? t((DIST.list()[+o.dist] || {}).name || '') : '';
  stop();
  // рекорд быстрого заезда — свой, мимо карьеры (dlv-quick.best). Печать «РЕКОРД» — только если был прошлый рекорд
  const s = saved(), money = Math.max(0, Math.round(r.money || 0)), prev = +s.best || 0, rec = money > prev;
  if (rec) { try { A.Store.set(KEY, { ...s, best: money }); } catch (e) { /* — */ } }
  const showRec = rec && prev > 0;
  // сняли с заезда / сорвался — печать красная, кончился сам или по времени — зелёная
  const bad = r.kind ? r.kind === 'pulled' || r.kind === 'dead' : r.title === t('сняли с заезда') || r.title === t('заезд сорвался');   // kind — career.js quickEnd
  endUI();
  const row = (k, v, cls = '') => '<p class="pp-row"><span>' + esc(k) + '</span><i></i><b' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(v) + '</b></p>';
  const rows = [
    row(t('доставлено'), String(r.delivered || 0)),
    r.tips > 0 ? row(t('чаевые'), '+' + A.money(r.tips), 'pp-plus') : '',
    row(t('ударов'), String(r.hits || 0)),
    r.people ? row(t('прохожих сбито'), String(r.people)) : '',
    r.fine ? row(t('штраф за клиента'), '−' + A.money(r.fine), 'pp-minus') : '',
    r.back ? row(t('опоздал обратно'), '−' + A.money(r.back), 'pp-minus') : '',
  ].join('');
  const cond = [seaName, carName, distName, clock(r.t0h ?? 9) + '—' + clock(r.endH ?? 9)].filter(Boolean).map(x => '<span>' + esc(x) + '</span>').join(' · ');
  endBox.innerHTML =
    '<section class="pp-receipt pp-in qr-check">' +
      '<header class="pp-head"><span>' + esc(t('чек заезда')) + '</span><b>' + num(+saved().runs || 1) + '</b></header>' +
      '<div class="qr-top"><div><p class="qr-title">' + esc(r.title || t('заезд окончен')) + '</p>' +
      (r.why ? '<p class="pp-hint qr-why">' + esc(r.why) + '</p>' : '') + '</div>' +
      '<div class="pp-seal ' + (bad ? 'pp-seal-red' : 'pp-seal-green') + ' qr-seal" style="visibility: hidden">' + esc(t('заезд')) + '</div></div>' +
      '<div class="qr-rows">' + rows + '</div>' +
      '<div class="qr-tot"><p class="pp-row pp-total"><span>' + esc(t('заработано')) + '</span><i></i><b class="pp-plus qr-sum">' + esc(A.money(0)) + '</b></p>' +
      (showRec ? '<div class="pp-seal pp-seal-pink pp-seal-inline qr-rec" style="visibility: hidden">' + esc(t('рекорд')) + '</div>' : '') + '</div>' +
      (!rec && prev > 0 ? '<p class="pp-hint qr-best">' + esc(t('рекорд заезда — {m}', { m: A.money(prev) })) + '</p>' : '') +
      '<p class="pp-hint qr-cond">' + cond + '</p>' +
      '<p class="qr-warn">' + esc(t('в копилку не идёт, сюжета нет')) + '</p>' +
      '<button type="button" class="pp-stamp qr-again" autofocus data-pad-main>' + keyHTML('ok') + esc(t('ещё заезд')) + '</button>' +
    '</section>' +
    '<nav class="pp-margin">' +
      '<button type="button" class="pp-note qr-change">' + keyHTML('x') + esc(t('поменять условия')) + '</button>' +
      '<button type="button" class="pp-note qr-menu">' + keyHTML('back') + esc(t('в меню')) + '</button>' +
    '</nav>';
  refreshKeys(endBox);
  endBox.hidden = false;
  fit(endBox);
  try { endBox.querySelector('.qr-again').focus({ preventScroll: true }); } catch (e) { /* — */ }
  A.Snd.coin && A.Snd.coin();
  show(++endTok, money, showRec);
}
/* акценты по очереди: чек влетел → строки допечатались → деньги щёлкнули → печать хлопнула → штамп шлёпнул */
async function show (tok, money, rec) {
  const live = () => tok === endTok && endBox && !endBox.hidden;
  const rows = endBox.querySelectorAll('.qr-rows .pp-row, .pp-total');
  PFX.stagger(rows, 0.07, 0.3);
  await sleep(300 + rows.length * 70);
  if (!live()) return;
  const sum = endBox.querySelector('.qr-sum');
  await PFX.countUp(sum, 0, money, { ms: money > 0 ? 700 : 0, fmt: n => (n > 0 ? '+' : '') + A.money(n) });
  if (!live()) return;
  const seal = endBox.querySelector('.qr-seal');
  seal.style.visibility = ''; PFX.replay(seal, 'pp-seal');
  const rs = endBox.querySelector('.qr-rec');
  if (rs) { rs.style.setProperty('--pp-delay', '.18s'); rs.style.visibility = ''; PFX.replay(rs, 'pp-seal'); }
  if (rec) PFX.burst(sum, { kind: 'confetti' });
  else if (money > 0) PFX.burst(sum, { kind: 'coins', n: 8 });
  await sleep(rs ? 420 : 260);
  if (!live()) return;
  PFX.slam(endBox.querySelector('.qr-again'));
}

/* отладка: __dlv.QR — start({ season, len, car, dist }) без окна, sandbox — что легло в песочницу */
const DEBUG = {
  on, opts, len, available, openSetup, back, root, pad, weathers: s => weathers(s), fields: () => (SEL ? fields() : null), sel: () => SEL,
  start: (o = {}) => { const c = choices(); start({ ...c, ...o }); return Q.opt; },
  sandbox: () => (Q.over ? Object.fromEntries(Q.over) : null),
  choices: () => choices(),
};
