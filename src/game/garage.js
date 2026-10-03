/* Гараж на весь экран (карьера): карусель больших карточек машин.

     GARAGE.init(api)      — из career.js: { cars() → cars.js, A (кошелёк, Snd, carChanged, money), stars() }
     GARAGE.open(onClose)  — из меню и с экрана итогов
     GARAGE.close()
     GARAGE.isOpen(), GARAGE.root() — для геймпада и клавиатуры (career.js)
     GARAGE.flip(±1)       — листать: ◀ ▶, стрелки, LB/RB, крестовина, свайп, перетаскивание мышью

   Первый раз за всё время — обучение Дяди Жени (garagetour.js): пока идёт, root() — его
   облачко (геймпад и клавиатура жмут «дальше» / «пропустить»), close() — пропустить, flip — нет.

   Своя машина: «покрасить» открывает палитру (10 цветов + заводской, цена — econ.js PAINT),
   «продать» спрашивает «точно?» (да / нет; цена — econ.js SELL). Текущую и «Семёрку» не продать.
   Листнул — палитра и вопрос закрываются.

   В фокусе одна большая карточка, соседи по бокам — меньше и темнее. Крутится
   только картинка в фокусе, остальные — готовые кадры из кэша (PIC). */
import './garage.css';
import * as ECON from './econ.js';
import { t } from '../i18n/index.js';
import * as TOUR from './garagetour.js';

let D = null, el = null, idx = 0, list = [], onCloseCb = null;
let MODE = null;                       // у карточки в фокусе: null | 'paint' (палитра) | 'sell' («точно продать?»)
const PIC = new Map();                 // id → неподвижная картинка (canvas)
let SPIN = null;                       // { id, cv } — крутящаяся картинка карточки в фокусе
const PW = 640, PH = 400;              // один размер на все картинки: общий WebGL не меняет размер
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function init (api) { D = api; }
export const isOpen = () => !!(el && !el.hidden);
export const root = () => (isOpen() ? TOUR.root() || el : null);

function build () {
  if (el) return el;
  el = document.createElement('div');
  el.id = 'cr-garage';
  el.hidden = true;
  el.innerHTML =
    '<div class="gr-top"><button type="button" class="gr-back"></button><div class="gr-t"></div><div class="gr-wallet"></div></div>' +
    '<div class="gr-stage"><div class="gr-arrow l" role="button" aria-label="prev">◀</div><div class="gr-track"></div><div class="gr-arrow r" role="button" aria-label="next">▶</div></div>' +
    '<div class="gr-dots"></div>';
  ($('game') || document.body).appendChild(el);
  el.querySelector('.gr-back').addEventListener('click', close);
  el.querySelector('.gr-arrow.l').addEventListener('click', () => flip(-1));
  el.querySelector('.gr-arrow.r').addEventListener('click', () => flip(1));
  dragInit(el.querySelector('.gr-stage'));
  return el;
}
const $ = id => document.getElementById(id);

export function open (onClose) {
  if (!D) return;
  build();
  onCloseCb = onClose || null;
  el.querySelector('.gr-back').textContent = '◀ ' + t('назад');
  el.querySelector('.gr-t').textContent = t('гараж');
  load();
  MODE = null;
  idx = Math.max(0, list.findIndex(c => c.current));
  el.querySelector('.gr-track').innerHTML = '';
  el.hidden = false;
  render();
  requestAnimationFrame(() => el.classList.add('on'));
  if (TOUR.need(D.A.Store)) TOUR.start(el, { Store: D.A.Store, Snd: D.A.Snd, face: zhenyaFace });
}
/* лицо Дяди Жени — того же, что стоит в гаражах (cars.js); гаражей нет — такой же по сиду */
function zhenyaFace () {
  if (!D.A.face) return '';
  const C = D.cars(), g = C && C.garage ? C.garage() : null;
  const p = (g && g.zh && g.zh.person) || (D.A.person ? D.A.person({ seed: 0x2E1A, fem: false, fat: true }) : null);
  return p ? D.A.face(p, 160) : '';
}
export function close () {
  if (!el || el.hidden) return;
  if (TOUR.on()) { TOUR.skip(); return; }       // Esc / B / «назад» посреди обучения — только пропустить его
  stopSpin();
  el.classList.remove('on');
  el.hidden = true;
  const cb = onCloseCb; onCloseCb = null;
  if (cb) try { cb(); } catch (e) { console.error('[garage]', e); }
}

function load () {
  const C = D.cars();
  try { list = (C && C.list()) || []; } catch (e) { console.error('[garage] list', e); list = []; }
}

/* ── потолки для полосок: что выжмет самая быстрая и самая крепкая машина с прокачкой ── */
const U = ECON.UPGRADE;
const vmaxTop = () => Math.max(1, ...ECON.CAR_LIST.map(c => c.vmax * (1 + U.STEPS * U.VMAX)));
const hpTop = () => Math.max(1, ...ECON.CAR_LIST.map(c => c.hp + U.STEPS * U.HP));
const handleWord = h => { h = ECON.handlingK(h).h; return h <= 2 ? t('баржа') : h <= 4 ? t('тугая') : h <= 6 ? t('обычная') : h <= 8 ? t('вёрткая') : t('резкая'); };
const statsOf = c => [
  { k: 'speed', name: t('скорость'), v: t('{n} км/ч', { n: Math.round((c.vmax || 0) * 3.6) }), p: (c.vmax || 0) / vmaxTop() },
  // управляемость 1…10 (econ.js HANDLING): 1—2 баржа, 3—4 тугая, 5—6 обычная, 7—8 вёрткая, 9—10 резкая
  { k: 'handle', name: t('управляемость'), v: handleWord(c.handling) + ' · ' + ECON.handlingK(c.handling).h + '/10', p: ECON.handlingK(c.handling).h / 10 },
  // своя — мотор и ресурс (econ.js BREAK); в продаже — как быстро изнашивается мотор
  ...(c.owned ? [
    { k: 'break', name: t('мотор'), v: Math.round(c.cond ?? 100) + ' %', p: (c.cond ?? 100) / 100 },
    { k: 'res', name: t('ресурс'), v: Math.round(c.ceil ?? 100) + ' %', p: (c.ceil ?? 100) / 100 },
  ] : [
    { k: 'break', name: t('износ мотора'), v: (c.wearK || 1) <= 0.6 ? t('медленный') : (c.wearK || 1) <= 1 ? t('средний') : t('быстрый'), p: Math.min(1, (c.wearK || 1) / 1.4) },
  ]),
  { k: 'hp', name: t('сердца'), v: String(Math.round(c.hp || 0)), p: (c.hp || 0) / hpTop() },
];

/* ── карточки ── */
function render () {
  const tr = el.querySelector('.gr-track');
  if (tr.children.length !== list.length) {
    tr.innerHTML = list.map((c, i) => '<div class="gr-card" data-i="' + i + '"><div class="gr-pic"></div><div class="gr-info"></div></div>').join('');
    tr.querySelectorAll('.gr-card').forEach(card => card.addEventListener('click', e => {
      const i = +card.dataset.i;
      if (i !== idx && !DRAG.moved) { e.preventDefault(); go(i); }
    }));
  }
  list.forEach((c, i) => fill(tr.children[i], c, i === idx));
  wallet();
  dots();
  place();
  pics();
}
function wallet () {
  const w = el.querySelector('.gr-wallet');
  w.innerHTML = '<span>' + esc(t('в кошельке')) + '</span> <b>' + esc(D.A.money(D.A.wallet())) + '</b> <em>★ ' + D.stars() + '</em>';
}
function dots () {
  const d = el.querySelector('.gr-dots');
  d.innerHTML = list.map((c, i) => '<i class="' + (i === idx ? 'on ' : '') + (c.current ? 'cur ' : c.owned ? 'own' : '') + '" data-i="' + i + '"></i>').join('');
  d.querySelectorAll('i').forEach(b => b.addEventListener('click', () => go(+b.dataset.i)));
}
/* соседи по бокам: сдвиг на долю ширины карточки, меньше и темнее; дальше второго — не видно */
function place () {
  const tr = el.querySelector('.gr-track');
  [...tr.children].forEach((card, i) => {
    const o = i - idx, a = Math.abs(o);
    card.style.setProperty('--o', o);
    card.style.setProperty('--s', a === 0 ? 1 : a === 1 ? 0.78 : 0.62);
    card.classList.toggle('on', o === 0);
    card.classList.toggle('side', a === 1);
    card.classList.toggle('far', a >= 2);
    card.classList.toggle('gone', a > 2);
    card.setAttribute('aria-hidden', o === 0 ? 'false' : 'true');
  });
  el.querySelector('.gr-arrow.l').classList.toggle('off', idx <= 0);
  el.querySelector('.gr-arrow.r').classList.toggle('off', idx >= list.length - 1);
}

/* что на карточке: имя, сердца, три полоски и кнопки (кнопки — только у той, что в фокусе) */
function fill (card, c, focus, oldP) {
  const st = statsOf(c);
  const info = card.querySelector('.gr-info');
  const hearts = '<em class="gr-hp">' + '♥'.repeat(Math.max(0, Math.round(c.hp || 0))) + '</em>';
  const bars = '<div class="gr-stats">' + st.map((s, j) =>
    '<div class="gr-st gr-st-' + s.k + '"><span>' + esc(s.name) + '</span><i class="gr-bar"><i style="width:' + ((oldP ? oldP[j] : s.p) * 100).toFixed(1) + '%"></i></i><b>' + esc(s.v) + '</b></div>').join('') + '</div>';
  card.classList.toggle('cur', !!c.current);
  card.classList.toggle('own', !!c.owned);
  info.innerHTML = '<div class="gr-name">' + esc(c.name) + '</div>' + hearts +
    (c.note ? '<div class="gr-note">' + esc(c.note) + '</div>' : '') + bars +
    '<div class="gr-acts">' + (focus ? acts(c) : ghostActs(c)) + '</div>';
  if (focus) wire(card, c);
  if (oldP) requestAnimationFrame(() => requestAnimationFrame(() => {
    card.querySelectorAll('.gr-st .gr-bar > i').forEach((b, j) => {
      if (st[j].p > oldP[j] + 0.001) b.parentElement.parentElement.classList.add('up');
      b.style.width = (st[j].p * 100).toFixed(1) + '%';
    });
  }));
}
const pips = lv => '●'.repeat(lv) + '○'.repeat(Math.max(0, U.STEPS - lv));
function upPrice (c, kind) {
  const lv = (c.up && c.up[kind]) || 0;
  if (lv >= U.STEPS) return null;
  if (c.upPrice && c.upPrice[kind] != null) return c.upPrice[kind];
  const e = ECON.CAR_LIST.find(q => q.id === c.id) || { price: c.price || 0 };
  return ECON.upgradePrice(e, lv);
}
function acts (c) {
  const cash = D.A.wallet(), st = D.stars(), money = D.A.money;
  let h = '';
  if (!c.owned) {
    const needSt = (c.stars || 0) > st, needM = cash < (c.price || 0);
    h += '<button type="button" class="gr-btn buy" data-a="buy" autofocus' + (needSt || needM ? ' disabled' : '') + '>' +
      esc(t('купить за {money}', { money: money(c.price) })) + (c.stars ? ' <i>· ★ ' + c.stars + '</i>' : '') + '</button>';
    const why = needSt ? t('нужно ★ {n}, у тебя ★ {have}', { n: c.stars, have: st }) : needM ? t('не хватает {money}', { money: money(c.price - cash) }) : '';
    h += '<div class="gr-why">' + esc(why || t('броня и мотор — после покупки')) + '</div>';
    return h;
  }
  h += c.current ? '<button type="button" class="gr-btn cur" disabled>' + esc(t('на смене')) + '</button>'
    : '<button type="button" class="gr-btn pick" data-a="pick" autofocus>' + esc(t('выбрать')) + '</button>';
  for (const [kind, name, gain] of [
    ['armor', t('добавить броню'), t('+1 ♥')],
    ['engine', t('улучшить мотор'), t('+{n} % к скорости', { n: Math.round(U.VMAX * 100) })],
  ]) {
    const lv = (c.up && c.up[kind]) || 0, pr = upPrice(c, kind);
    if (pr == null) h += '<button type="button" class="gr-btn up max" disabled><b>' + esc(name) + '</b><span>' + esc(t('до упора')) + '</span><i>' + pips(lv) + '</i></button>';
    else h += '<button type="button" class="gr-btn up" data-a="' + kind + '" autofocus' + (cash < pr ? ' disabled' : '') + '><b>' + esc(name) + '</b><span>' + esc(gain + ' · ' + money(pr)) + '</span><i>' + pips(lv) + '</i></button>';
  }
  return h + extraActs(c);
}
/* покраска и продажа — один ряд; открытая палитра или «точно продать?» встают на его место */
function extraActs (c) {
  const cash = D.A.wallet(), money = D.A.money, pp = c.paintPrice || 0;
  if (MODE === 'paint') {
    const C = D.cars(), cur = String(c.hex || '').toLowerCase();
    const sw = [{ hex: c.hexBase, name: t('заводской'), base: true }].concat((C && C.PAINTS) || []);
    let first = true;
    const btns = sw.filter((p, i) => !(i > 0 && String(p.hex).toLowerCase() === String(c.hexBase).toLowerCase())).map(p => {
      const on = String(p.hex).toLowerCase() === cur, af = !on && first ? (first = false, ' autofocus') : '';
      return '<button type="button" class="gr-sw' + (on ? ' on' : '') + (p.base ? ' base' : '') + '" data-a="paint" data-hex="' + esc(p.hex) + '" style="--c:' + esc(p.hex) + '"' +
        ' title="' + esc(p.base ? p.name : t(p.name)) + '" aria-label="' + esc(p.base ? p.name : t(p.name)) + '"' + af + (on || cash < pp ? ' disabled' : '') + '></button>';
    }).join('');
    return '<div class="gr-paint"><div class="gr-paint-t"><span>' + esc(t('покраска · {money}', { money: money(pp) })) + '</span>' +
      '<button type="button" class="gr-btn gr-x" data-a="close">' + esc(t('готово')) + '</button></div><div class="gr-sws">' + btns + '</div>' +
      (cash < pp ? '<div class="gr-why">' + esc(t('не хватает {money}', { money: money(pp - cash) })) + '</div>' : '') + '</div>';
  }
  if (MODE === 'sell') {
    return '<div class="gr-ask"><span>' + esc(t('продать «{name}» за {money}?', { name: c.name, money: money(c.sellPrice) })) + '</span>' +
      '<div class="gr-row"><button type="button" class="gr-btn sell" data-a="sell">' + esc(t('да, продать')) + '</button>' +
      '<button type="button" class="gr-btn" data-a="close" autofocus>' + esc(t('нет')) + '</button></div></div>';
  }
  const sellLbl = c.sellable ? t('продать · {money}', { money: money(c.sellPrice) }) : !c.price ? t('машину пиццерии не продать') : t('на ней на смене — не продать');
  return '<div class="gr-row">' +
    '<button type="button" class="gr-btn gr-paint-b" data-a="paintOpen">' + esc(t('покрасить · {money}', { money: money(pp) })) + '</button>' +
    '<button type="button" class="gr-btn gr-sell-b" data-a="sellAsk"' + (c.sellable ? '' : ' disabled') + '>' + esc(sellLbl) + '</button></div>';
}
/* у соседей — те же места под кнопки, но без кнопок: высота карточек одна, геймпад их не видит */
function ghostActs (c) {
  if (!c.owned) return '<div class="gr-ghost">' + esc(t('купить за {money}', { money: D.A.money(c.price) })) + (c.stars ? ' · ★ ' + c.stars : '') + '</div>';
  return '<div class="gr-ghost">' + esc(c.current ? t('на смене') : t('выбрать')) + '</div>';
}

function wire (card, c) {
  const C = D.cars();
  card.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const a = b.dataset.a;
    // открыть / закрыть палитру и «точно продать?» — без денег, просто перерисовать карточку
    const to = { paintOpen: 'paint', sellAsk: 'sell', close: null }[a];
    if (to !== undefined) {
      MODE = to;
      fill(card, c, true);
      D.A.Snd.blip(to ? 660 : 440, 0.04, 'square', 0.05);
      return;
    }
    const oldP = statsOf(c).map(s => s.p);
    const fn = a === 'buy' ? () => C.buy(c.id) : a === 'pick' ? () => C.select(c.id)
      : a === 'paint' ? () => C.paint(c.id, b.dataset.hex) : a === 'sell' ? () => C.sell(c.id) : () => C.upgrade(c.id, a);
    let r;
    try { r = fn(); } catch (err) { console.error('[garage]', err); r = false; }
    Promise.resolve(r).then(v => {
      const bad = v === false || (v && v.ok === false);
      if (bad) {
        card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
        D.A.Snd.blip(220, 0.12, 'square', 0.1);
        const w = card.querySelector('.gr-why');
        const WHY = { money: t('не хватает денег'), stars: t('не хватает звёзд'), max: t('прокачано до упора'), current: t('на ней на смене — не продать'), start: t('машину пиццерии не продать') };
        if (w && v && WHY[v.why]) w.textContent = WHY[v.why];
        return;
      }
      D.A.Store.flush();
      D.A.carChanged();
      D.A.Snd.coin();
      PIC.delete(c.id);                       // броня, мотор и цвет видны на картинке
      if (a === 'sell') MODE = null;          // палитра остаётся открытой — можно перебрать цвета
      load();
      const nc = list[idx];
      render();
      const nCard = el.querySelector('.gr-track').children[idx];
      if (a !== 'pick' && nCard) fill(nCard, nc, true, oldP);      // полоски доезжают до нового
      if (nCard) {
        nCard.classList.remove('pop'); void nCard.offsetWidth; nCard.classList.add('pop');
        const gain = a === 'armor' ? '+1 ♥' : a === 'engine' ? '+' + Math.round(U.VMAX * 100) + ' %' : a === 'buy' || a === 'paint' ? '✓'
          : a === 'sell' ? '+' + D.A.money(v && v.price || 0) : '';
        if (gain) floatText(nCard, gain);
      }
      restartSpin();
      if (D.onChange) D.onChange();
    });
  }));
}
function floatText (card, txt) {
  const f = document.createElement('div');
  f.className = 'gr-float';
  f.textContent = txt;
  card.appendChild(f);
  setTimeout(() => f.remove(), 1100);
}

/* ── листать ── */
export function flip (d) { if (!TOUR.on()) go(idx + d); }
function go (i) {
  i = Math.max(0, Math.min(list.length - 1, i));
  if (i === idx || !isOpen()) { if (isOpen() && i === idx) bump(); return; }
  const tr = el.querySelector('.gr-track');
  const was = idx;
  idx = i;
  MODE = null;
  stopSpin();
  fill(tr.children[was], list[was], false);
  fill(tr.children[idx], list[idx], true);
  dots();
  place();
  pics();
  D.A.Snd.blip(520 + idx * 18, 0.04, 'square', 0.05);
  if (D.onFlip) D.onFlip();
}
function bump () {                            // край ленты — карточка вздрагивает
  const c = el.querySelector('.gr-card.on');
  if (!c) return;
  c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
}

/* ── картинки: кэш неподвижных, крутится только та, что в фокусе ── */
function staticPic (id) {
  let cv = PIC.get(id);
  if (!cv) {
    const C = D.cars();
    try { cv = C && C.previewCanvas ? C.previewCanvas(id, { w: PW, h: PH }) : null; } catch (e) { cv = null; }
    if (!cv) { cv = document.createElement('canvas'); cv.width = PW; cv.height = PH; }
    PIC.set(id, cv);
  }
  return cv;
}
function pics () {
  const tr = el.querySelector('.gr-track');
  list.forEach((c, i) => {
    if (Math.abs(i - idx) > 2) return;               // дальних не рисуем, пока не подлистали
    const box = tr.children[i].querySelector('.gr-pic');
    if (i === idx) { startSpin(box, c.id); return; }
    const cv = staticPic(c.id);
    if (box.firstChild !== cv) { box.innerHTML = ''; box.appendChild(cv); }
  });
}
function startSpin (box, id) {
  if (SPIN && SPIN.id === id && SPIN.cv.parentNode === box) return;
  stopSpin();
  const C = D.cars();
  let cv = null;
  try { cv = C && C.previewCanvas ? C.previewCanvas(id, { w: PW, h: PH, spin: true }) : null; } catch (e) { cv = null; }
  if (!cv) cv = staticPic(id);
  box.innerHTML = '';
  box.appendChild(cv);
  SPIN = { id, cv };
}
/* снятая с экрана крутилка сама останавливается (cars.js) — на её место неподвижный кадр */
function stopSpin () {
  if (!SPIN) return;
  const { id, cv } = SPIN;
  SPIN = null;
  if (cv.parentNode) { const st = staticPic(id); if (st !== cv) cv.replaceWith(st); }
}
function restartSpin () {
  stopSpin();
  const card = el.querySelector('.gr-track').children[idx];
  if (card) startSpin(card.querySelector('.gr-pic'), list[idx].id);
}

/* ── свайп пальцем и перетаскивание мышью ── */
const DRAG = { id: null, x0: 0, dx: 0, moved: false };
function dragInit (stage) {
  const tr = () => el.querySelector('.gr-track');
  stage.addEventListener('pointerdown', e => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('button, .gr-arrow, input')) return;
    DRAG.id = e.pointerId; DRAG.x0 = e.clientX; DRAG.dx = 0; DRAG.moved = false;
  });
  stage.addEventListener('pointermove', e => {
    if (e.pointerId !== DRAG.id) return;
    DRAG.dx = e.clientX - DRAG.x0;
    if (!DRAG.moved && Math.abs(DRAG.dx) > 8) {
      DRAG.moved = true;
      try { stage.setPointerCapture(e.pointerId); } catch (_) { /* — */ }
      tr().classList.add('drag');
    }
    if (DRAG.moved) tr().style.setProperty('--drag', DRAG.dx + 'px');
  });
  const end = e => {
    if (e.pointerId !== DRAG.id) return;
    DRAG.id = null;
    tr().classList.remove('drag');
    tr().style.setProperty('--drag', '0px');
    if (DRAG.moved && Math.abs(DRAG.dx) > 50) flip(DRAG.dx < 0 ? 1 : -1);
    setTimeout(() => { DRAG.moved = false; }, 0);    // клик после перетаскивания — не выбор соседа
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
}
