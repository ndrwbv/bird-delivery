/* Карьера (Стим): смена 9:00—24:00, обед, конец смены, экран итогов,
   донаты и слот-машина, рейтинг пиццерии, звёзды ★. Числа — только из econ.js,
   расчёт — docs/CAREER.md.

     CAREERM.init(api)       — один раз из game.js (что нужно — см. init)
     CAREERM.startShift()    — из startRun, когда это смена, а не «просто покататься»
     CAREERM.step(dt)        — каждый кадр: часы, обед, полночь, удары
     CAREERM.showEnd(why, whyText) — экран итогов вместо прежнего #over
     CAREERM.clientKilled(victim)  — сбил своего клиента (CLIENT_KILL)

     CAREERM.menu()          — из showTitle: главное меню (menu.js), menuCam — камера заставки
     CAREERM.padRoot/padPre/back — геймпад: окно имени, гараж (garage.js), «потратить»

   Для других модулей: addStars(n, why), stars(), hour(), isEvening(),
   onShiftStart(cb), onShiftEnd(cb), shiftOn(), crewSeed(i), crewBoard(). В отладке — __dlv.CAREERM.

   Всё здесь работает только в карьере: game.js зовёт модуль под флагом CAREER. */
import './career.css';
import * as ECON from './econ.js';
import * as GARAGE from './garage.js';
import * as MENU from './menu.js';
import { makePadMenu } from '../input/padmenu.js';
import { t, tn, lang } from '../i18n/index.js';

/* соседние модули карьеры — если уже есть: заказы (развоз смены) и машины (гараж) */
const ORD = import.meta.glob('./orders.js', { eager: true })['./orders.js'] || null;
const CARM = import.meta.glob('./cars.js', { eager: true })['./cars.js'] || null;
let CARS_MOCK = null;                            // отладка: __dlv.CAREERM.useCars({ list, buy, … })
const carsApi = () => CARS_MOCK || (CARM && (CARM.list ? CARM : CARM.CARS || CARM.default)) || null;

const Q = new URLSearchParams(location.search);
/* ?fastshift[=N] — сутки в N раз быстрее, пока идёт смена (проверка: обед, полночь) */
const FAST = Q.has('fastshift') ? Math.max(1, +Q.get('fastshift') || 8) : 1;

let A = null;
const SH = {
  on: false, phase: '',          // '' | 'late' (после полуночи, развоз смены) | 'done'
  lunch: false, hits: 0, lastHurt: 0, fine: 0, stars: 0, t0h: 9, endH: 9,
  slot: false, n: 0,
};
const startCbs = [], endCbs = [];
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ── то, на что смотрят другие модули ── */
export const stars = () => (A ? +A.Store.get('dlv-stars', 0) || 0 : 0);
export function addStars (n, why) {
  n = Math.round(n || 0);
  if (!A || !n) return stars();
  const v = Math.max(0, stars() + n);
  A.Store.set('dlv-stars', v);
  A.Store.flush();
  if (n > 0) SH.stars += n;
  if (A.isPlaying()) A.popBonus('+' + n + ' ★', why || t('звезда пиццерии'));
  else A.Snd.coin();
  refreshWallet();
  return v;
}
export function hour () { return A ? ECON.hourOf(A.env().t) : ECON.SHIFT.KEYS[0][1]; }
export const isEvening = () => hour() >= ECON.SHIFT.EVENING_H;
export const shiftOn = () => SH.on;
export const phase = () => SH.phase;
export function onShiftStart (cb) { if (typeof cb === 'function') startCbs.push(cb); }
export function onShiftEnd (cb) { if (typeof cb === 'function') endCbs.push(cb); }
const fire = (list, arg) => { for (const cb of list) { try { cb(arg); } catch (e) { console.error('[career]', e); } } };

/* api из game.js:
   S, NOS, Store { get, set, flush }, env() → ENV, Snd, ADULT, money(n), wallet(), addWallet(n),
   toast, popBonus, showChoice, hideChoice, choiceOpen(), hudHearts, isPlaying(), countUp,
   endShift(why), rideOn(), dropOrder(), openShop(), carChanged(), donated(k);
   меню: menuGo(), menuRide(), openCollect(), openSettings(), panelOpen(), quit(), canQuit,
   playerName(), setName(n); рейтинг: rivalSpec() → [{ hex, fem }], rivals() → [{ i, money }],
   person({ seed, fem }), face(person, size) */
export function init (api) {
  A = api;
  document.body.classList.add('career');
  GARAGE.init({ cars: carsApi, A, stars, onChange: () => { refreshWallet(); refreshTabs(); } });
  api.crew = crewBoard; api.garage = openGarage;       // getter-ы api (DAY_LEN) не трогаем: они живые
  MENU.init(api);
  addEventListener('keydown', onKey, true);
  addEventListener('keyup', onKeyUp, true);
  addEventListener('pointerdown', () => KB.clear(), true);        // мышью — клавиатурная подсветка уходит
  const es = $('endshift');
  if (es) {
    const sp = es.querySelector('span');
    if (sp) sp.textContent = t('сняться со смены');
    const ck = document.createElement('div');
    ck.id = 'cr-clock';
    ck.hidden = true;
    ck.innerHTML = '<i></i><b>09:00</b>';
    es.parentNode.insertBefore(ck, es);
  }
  setTimeout(() => { if (window.__dlv) window.__dlv.CAREERM = DEBUG; }, 0);
}

/* ── смена ── */
export function startShift () {
  closeSpend(false);
  if (!A) return;
  const S = A.S;
  A.env().t = ECON.SHIFT.T0;
  S.lunch = null;
  SH.on = true; SH.phase = ''; SH.lunch = false; SH.hits = 0; SH.lastHurt = S.hurt || 0; SH.fine = 0; SH.stars = 0;
  SH.slot = false; STAKE = 0; SH.t0h = hour(); SH.endH = SH.t0h; SH.n = +A.Store.get('dlv-shifts', 0) || 0;
  lunchClass(false);
  fire(startCbs, { n: SH.n + 1 });
}

export function clockText () { return ECON.clock(hour()); }

let clockPrev = '';
function clockStep () {
  const el = $('cr-clock'), es = $('endshift');
  if (!el || !es) return;
  const show = !es.hidden && SH.on;
  if (el.hidden === show) el.hidden = !show;
  if (!show) return;
  const h = hour(), txt = ECON.clock(h);
  if (txt !== clockPrev) {
    clockPrev = txt;
    el.querySelector('b').textContent = txt;
    el.classList.toggle('eve', h >= ECON.SHIFT.EVENING_H && h < 21);
    el.classList.toggle('night', h >= 21);
    el.classList.toggle('late', h >= 23);
  }
}

export function step (dt) {
  if (!A) return;
  const S = A.S;
  if (!$('choice') || $('choice').hidden) lunchClass(false);
  if (!SH.on || S.ride || !A.isPlaying()) { clockStep(); return; }
  if (S.state === 'loading' || S.state === 'brief') { clockStep(); return; }
  if (FAST > 1 && SH.phase === '') { const E = A.env(); E.t = (E.t + dt * (FAST - 1) / A.DAY_LEN) % 1; }
  // удар — S.hurt подскакивает до 0,9 в hurtCar; считаем такие скачки
  const hu = S.hurt || 0;
  if (hu > SH.lastHurt + 0.05) SH.hits++;
  SH.lastHurt = hu;
  const h = hour();
  if (!SH.lunch && h >= ECON.SHIFT.LUNCH_H && h < 24 && ['drive', 'back', 'handover', 'side'].includes(S.state) && !A.choiceOpen()) showLunch();
  if (SH.phase === '' && h >= 24) midnight();
  clockStep();
}

/* ── обед в 14:00: одно из трёх до конца смены ── */
function lunchClass (on) { const c = $('choice'); if (c) c.classList.toggle('cr-lunch', on); }
function showLunch () {
  SH.lunch = true;
  const S = A.S, L = ECON.LUNCH, T = ECON.TIPS;
  const opts = [
    { id: 'nitro', label: t('двойной раф'), sub: t('нитро: бак ×{k} и сразу полный', { k: fmtK(L.nitro.tank) }),
      fn () { S.nosEff = (S.nosEff || 1) / L.nitro.tank; A.NOS.tank = 1; } },
    { id: 'tips', label: t('бизнес-ланч'), sub: t('чаевые: шанс +{p} %, сумма ×{k}', { p: Math.round(T.LUNCH_CHANCE * 100), k: fmtK(T.LUNCH_MUL) }),
      fn () { /* orders.js читает S.lunch === 'tips' */ } },
    { id: 'hp', label: t('шаурма у ларька'), sub: tn(L.hp.hearts, '+{n} сердце|+{n} сердца|+{n} сердец'),
      fn () { S.hpMax += L.hp.hearts; S.hp += L.hp.hearts; A.hudHearts(); } },
  ];
  A.showChoice({
    title: t('обед'), sub: t('{time} — перерыв. что берёшь до конца смены?', { time: ECON.clock(ECON.SHIFT.LUNCH_H) }),
    pause: true,
    opts: opts.map(o => ({ label: o.label, sub: o.sub, fn: () => {
      S.lunch = o.id;
      lunchClass(false);
      o.fn();
      A.popBonus(t('обед: {what}', { what: o.label }), o.sub);
    } })),
  });
  lunchClass(true);
  A.Snd.order();
}
const fmtK = k => Number(k).toLocaleString(lang() === 'zh' ? 'zh-CN' : lang());

/* ── полночь: сначала, может быть, развоз смены, потом итоги ── */
async function midnight () {
  SH.phase = 'late';
  const S = A.S;
  let ride = false;
  if (ORD && typeof ORD.staffRide === 'function' && Math.random() < ECON.ORDERS.STAFF_CHANCE) {
    A.hideChoice();
    try { ride = await ORD.staffRide(); } catch (e) { console.error('[career] staffRide', e); }
  }
  if (!SH.on || S.state === 'over' || S.state === 'title' || S.state === 'dying') return;   // смена уже кончилась иначе
  A.toast(ride ? t('полночь — всех развёз, смена всё') : t('полночь — смена всё'));
  A.endShift('время');
}

/* ── сбил своего клиента ── */
export function clientKilled (victim) {
  if (!A) return;
  const S = A.S;
  const loss = Math.max(0, Math.round((S.money || 0) * ECON.CLIENT_KILL.LOSE / 10) * 10);
  if (loss) {
    S.money -= loss;
    A.addWallet(-Math.min(loss, A.wallet()));
  }
  SH.fine += loss;
  if (ECON.CLIENT_KILL.END_SHIFT) return;          // дальше — прежний game over, итоги покажет showEnd
  A.popBonus(t('сбил своего клиента'), loss ? t('минус {money}', { money: A.money(loss) }) : t('заказ сорван'));
  A.Snd.fail && A.Snd.fail();
  A.dropOrder();
}

/* ── экран итогов ── */
const TITLE = {
  'смена окончена': () => t('снялся со смены'),
  'время': () => t('смена закончена'),
  'сбил клиента': () => t('сняли со смены'),
};
const WHY = {
  'смена окончена': () => t('заработанное — в кошельке, смена засчитана'),
  'время': () => t('полночь — пиццерия закрылась'),
  'сбил клиента': () => t('тебя сняли со смены: сбил своего клиента'),
};

export function showEnd (why, whyText) {
  if (!A) return;
  const S = A.S;
  const wasOn = SH.on;
  SH.on = false; SH.phase = 'done'; SH.endH = hour();
  lunchClass(false);
  $('cr-clock') && ($('cr-clock').hidden = true);
  const full = why === 'время';
  if (wasOn) {
    A.Store.set('dlv-shifts', SH.n + 1);
    if (full && SH.hits === 0 && (S.delivered || 0) > 0) addStars(ECON.STARS.CLEAN_SHIFT, t('смена без единого удара'));
    crewRecord(S.money || 0, full);
    fire(endCbs, { why, money: S.money || 0, delivered: S.delivered || 0, hits: SH.hits, fine: SH.fine, full });
  }
  A.Store.flush();

  const ov = $('over');
  ov.classList.add('cr');
  const lost = !TITLE[why];
  $('ov-t').textContent = TITLE[why] ? TITLE[why]() : t('смена сорвалась');
  $('ov-t').classList.toggle('win', !lost && why !== 'сбил клиента');
  $('ov-why').textContent = WHY[why] ? WHY[why]() : whyText || '';
  $('ov-extra').hidden = true;
  $('st-note2').textContent = '';
  const cnt = n => String(Math.round(n));
  const rows = [
    [t('заработано'), S.money || 0, A.money, true],
    [t('доставлено заказов'), S.delivered || 0, cnt],
    typeof S.tips === 'number' && S.tips > 0 ? [t('чаевые'), S.tips, A.money] : null,
    [t('на смене'), SH.endH, h => ECON.clock(SH.t0h) + ' — ' + ECON.clock(SH.t0h + (Math.min(SH.endH, 29) - SH.t0h) * Math.min(1, h / (SH.endH || 1)))],
    [t('ударов'), SH.hits, cnt],
    SH.fine ? [t('штраф за клиента'), SH.fine, n => '−' + A.money(n)] : null,
    S.people ? [t('прохожих сбито'), S.people, cnt] : null,
    SH.stars ? [t('звёзд за смену'), SH.stars, n => '+' + Math.round(n) + ' ★'] : null,
  ].filter(Boolean);
  const box = $('ov-stats');
  box.innerHTML = rows.map((r, i) => '<div class="ov-row' + (r[3] ? ' big' : '') + '" data-i="' + i + '"><span>' + esc(r[0]) + '</span><b>' + esc(r[2](0)) + '</b></div>').join('');
  rows.forEach((r, i) => setTimeout(() => {
    const row = box.children[i];
    if (!row) return;
    row.classList.add('on');
    A.countUp(row.querySelector('b'), r[1], r[2], 600);
    if (r[1]) A.Snd.blip(700 + i * 90, 0.06, 'square', 0.06);
  }, 200 + i * 220));
  // место в пиццерии: «ты #2 среди курьеров · до Саши 1 200 ₽»
  const board = crewBoard(), me = board.findIndex(r => r.me);
  const up = me > 0 ? board[me - 1] : null;
  $('ov-best').innerHTML = me < 0 ? '' : '<b>' + esc(t('ты #{n} среди курьеров', { n: me + 1 })) + '</b>' +
    (up ? '<span>' + esc(t('до {who} — {money}', { who: up.gen || up.name, money: A.money(Math.max(0, up.total - board[me].total)) })) + '</span>' : '<span>' + esc(t('ты лучший курьер пиццерии')) + '</span>');
  buildEnd();
  // цифры докрутились — поверх всплывает заработок и на что потратить, если есть что тратить
  closeSpend(false);
  clearTimeout(SPEND_T);
  SPEND_T = setTimeout(() => { if (A.wallet() > 0 && $('over') && !$('over').hidden) openSpend(); else reopenBtn(); }, 200 + rows.length * 220 + 700);
  // кнопки: на новую смену (главная) / потратить / гараж / покататься / в меню
  $('ov-again').textContent = t('на новую смену');
  $('ov-again').setAttribute('autofocus', '');
  $('ov-menu').textContent = t('в меню');
  ov.hidden = false;
}

/* кошелёк и звёзды — строкой под заработком */
function refreshWallet () {
  const w = $('cr-wallet');
  if (w) w.innerHTML = '<span>' + esc(t('в кошельке')) + '</span> <b>' + esc(A.money(A.wallet())) + '</b> <em>★ ' + stars() + '</em>';
}

/* Заработок и «на что потратить» — на весь экран поверх итогов: крупно сколько за смену,
   три кнопки (мусор, насилие, депнуть), главная — «на новую смену». «не тратить» — к итогам,
   там остаётся кнопка «потратить деньги». */
let SPEND_T = 0;
function spendBox () {
  let md = $('cr-spend');
  if (md) return md;
  md = document.createElement('div');
  md.id = 'cr-spend';
  md.hidden = true;
  md.innerHTML = '<div class="cr-sp-box"><div class="cr-sp-head"><div class="cr-sp-sum"></div><div id="cr-wallet"></div></div>' +
    '<button type="button" id="cr-sp-go"></button>' +
    '<div class="cr-sp-body"></div><button type="button" id="cr-sp-close"></button></div>';
  ($('game') || document.body).appendChild(md);
  md.querySelector('#cr-sp-close').addEventListener('click', () => closeSpend(true));
  md.querySelector('#cr-sp-go').addEventListener('click', () => { const b = $('ov-again'); if (b) b.click(); });
  return md;
}
function openSpend () {
  const md = spendBox();
  const earned = Math.round(A.S.money || 0);
  md.querySelector('.cr-sp-sum').textContent = (earned >= 0 ? '+' : '−') + A.money(Math.abs(earned));
  md.querySelector('#cr-sp-go').textContent = t('на новую смену');
  md.querySelector('#cr-sp-close').textContent = t('не тратить');
  md.hidden = false;
  if (earned > 0) A.countUp(md.querySelector('.cr-sp-sum'), earned, n => '+' + A.money(n), 700);
  refreshWallet(); refreshTabs();
  requestAnimationFrame(() => md.classList.add('on'));
  const b = $('ov-spend'); if (b) b.hidden = true;
}
function closeSpend (showBtn) {
  const md = $('cr-spend');
  if (md) { md.classList.remove('on'); md.hidden = true; }
  if (showBtn) reopenBtn();
}
function reopenBtn () {
  let b = $('ov-spend');
  if (!b) {
    b = document.createElement('button');
    b.type = 'button'; b.id = 'ov-spend';
    b.addEventListener('click', openSpend);
    $('ov-again').after(b);
  }
  b.textContent = t('потратить деньги');
  b.hidden = !(A.wallet() > 0);
}

/* гараж — отдельно: с экрана итогов и из меню, на весь экран (garage.js) */
function openGarage (onClose) { GARAGE.open(onClose); }

let TAB = '';
function buildEnd () {
  let el = $('cr-end');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cr-end';
    spendBox().querySelector('.cr-sp-body').appendChild(el);
    const ride = document.createElement('button');
    ride.type = 'button'; ride.id = 'ov-ride';
    ride.addEventListener('click', () => { A.Snd.boot && A.Snd.boot(); A.rideOn(); });
    $('ov-menu').before(ride);
    const gar = document.createElement('button');
    gar.type = 'button'; gar.id = 'ov-garage';
    gar.addEventListener('click', () => openGarage(() => reopenBtn()));
    ride.before(gar);
  }
  $('ov-ride').textContent = t('покататься');
  $('ov-garage').textContent = t('гараж');
  const tabs = [
    ['trash', t('борьба с мусором'), 'bar'],
    ['gang', t('борьба с насилием'), 'bar'],
    A.ADULT ? ['slot', t('депнуть'), ''] : null,
  ].filter(Boolean);
  el.innerHTML = '<div class="cr-tabs n' + tabs.length + '">' + tabs.map(([k, name, bar]) =>
    '<button type="button" class="cr-tab cr-t-' + k + '" data-tab="' + k + '"><b>' + esc(name) + '</b>' +
    (bar ? '<i class="cr-bar"><i></i></i><span class="cr-sub"></span>' : '<span class="cr-sub"></span>') + '</button>').join('') + '</div><div id="cr-pane"></div>';
  el.querySelectorAll('.cr-tab').forEach(b => b.addEventListener('click', () => openTab(b.dataset.tab === TAB ? '' : b.dataset.tab)));
  TAB = '';
  refreshWallet();
  refreshTabs();
  openTab('');
}
function refreshTabs () {
  const el = $('cr-end');
  if (!el) return;
  for (const k of ['trash', 'gang']) {
    const b = el.querySelector('.cr-t-' + k + ' .cr-bar i');
    if (b) b.style.width = (A.donated(k) * 100).toFixed(1) + '%';
    const sub = el.querySelector('.cr-t-' + k + ' .cr-sub');
    if (sub) sub.textContent = A.donated(k) >= 1 ? t('цель собрана') : t('{p} % цели города', { p: Math.floor(A.donated(k) * 100) });
  }
  const s = el.querySelector('.cr-t-slot .cr-sub');
  if (s) s.textContent = SH.slot ? t('уже крутил') : A.wallet() >= ECON.SLOT.STEP ? t('любая ставка до {money} · выигрываешь ×{n}', { money: A.money(A.wallet()), n: ECON.SLOT.MUL }) : t('нечего ставить');
  el.querySelectorAll('.cr-tab').forEach(b => b.classList.toggle('cur', b.dataset.tab === TAB));
}
function openTab (k) {
  TAB = k;
  const p = $('cr-pane');
  p.className = k ? 'on cr-p-' + k : '';
  p.innerHTML = '';
  if (k === 'trash' || k === 'gang') paneDonate(p, k);
  else if (k === 'slot') paneSlot(p);
  refreshTabs();
}
function rerender () { refreshWallet(); refreshTabs(); openTab(TAB); }

/* ── рейтинг пиццерии: ты и курьеры (RIVAL_SPEC), по заработку за всё время ──
   dlv-crew = { me, n, crew: [{ seed, total }] }. У курьеров — постоянные зерна:
   имена и лица те же и в меню, и на смене. Твой заработок — из каждой смены;
   их — сколько они заработали на этой смене (R.money), а если не ездили — около
   твоего среднего ×0,6…1,3: догнать можно, но не даром. */
const CREW_KEY = 'dlv-crew';
const CREW_START = [1500, 700, 2200, 300];        // фора в начале: сразу есть кого обгонять
const CREW_FLOOR = 900;                            // средняя смена, пока своих смен нет
function crewLoad () {
  let c = A.Store.get(CREW_KEY, null);
  if (typeof c === 'string') { try { c = JSON.parse(c); } catch (e) { c = null; } }
  if (!c || typeof c !== 'object' || !Array.isArray(c.crew)) c = { me: 0, n: 0, crew: [] };
  const spec = (A.rivalSpec && A.rivalSpec()) || [];
  let grew = false;
  for (let i = c.crew.length; i < spec.length; i++) { c.crew.push({ seed: (Math.random() * 2147483647) >>> 0, total: CREW_START[i % CREW_START.length] }); grew = true; }
  if (grew) A.Store.set(CREW_KEY, c);
  return c;
}
const PEOPLE = new Map();
function crewPerson (i, c) {
  const spec = (A.rivalSpec && A.rivalSpec()) || [];
  const m = c.crew[i];
  if (!m || !A.person) return null;
  const key = m.seed + ':' + lang();
  if (!PEOPLE.has(key)) { try { PEOPLE.set(key, A.person({ seed: m.seed, fem: !!(spec[i] && spec[i].fem) })); } catch (e) { PEOPLE.set(key, null); } }
  return PEOPLE.get(key);
}
/** зерно курьера i — чтобы на смене он был тем же человеком, что в рейтинге */
export function crewSeed (i) {
  if (!A) return undefined;
  const c = crewLoad();
  return c.crew[i] ? c.crew[i].seed : undefined;
}
function crewRecord (earned, full) {
  const c = crewLoad();
  earned = Math.max(0, Math.round(earned || 0));
  c.me = (c.me || 0) + earned;
  c.n = (c.n || 0) + 1;
  const avg = Math.max(CREW_FLOOR, c.me / c.n);
  const real = new Map(((A.rivals && A.rivals()) || []).map(r => [r.i, Math.round(r.money || 0)]));
  c.crew.forEach((m, i) => {
    const got = real.get(i) || 0;
    // смену сняли раньше полуночи — курьеры доработали до конца: добавляем недостающее по среднему
    const sim = Math.round(avg * (0.6 + Math.random() * 0.7) / 10) * 10;
    m.total = (m.total || 0) + (got > 0 ? (full ? got : Math.max(got, sim)) : sim);
  });
  A.Store.set(CREW_KEY, c);
}
export function crewBoard () {
  if (!A) return [];
  const c = crewLoad(), spec = (A.rivalSpec && A.rivalSpec()) || [];
  const rows = c.crew.map((m, i) => {
    const p = crewPerson(i, c);
    let face = '';
    if (p && A.face) { try { face = A.face(p, 44); } catch (e) { face = ''; } }
    return { name: p ? p.first : t('курьер'), gen: p ? p.firstGen || p.first : '', total: m.total || 0, hex: spec[i] && spec[i].hex, face };
  });
  rows.push({ name: String(A.Store.get('dlv-name', '') || '').trim() || t('ты'), total: c.me || 0, me: true });
  rows.sort((a, b) => b.total - a.total || (a.me ? -1 : 1));
  return rows;
}
export function crewPlace () { const b = crewBoard(); return b.findIndex(r => r.me) + 1; }

/* ── меню и экраны поверх: геймпад и клавиатура ── */
export function menu () { KB.clear(); MENU.show(); }
export const menuCam = (cam, P, tG) => MENU.cam(cam, P, tG);
export const askName = cb => MENU.askName(cb);
const spendOpen = () => { const m = $('cr-spend'); return m && !m.hidden ? m : null; };
/** непрозрачный экран поверх города (гараж, «потратить») — кадр мира можно не рисовать */
export const covered = () => GARAGE.isOpen() || !!spendOpen();
/** что сейчас листает геймпад: окно имени, гараж, «потратить» — или null */
export function padRoot () { return MENU.modal() || GARAGE.root() || spendOpen(); }
/** до makePadMenu: в гараже ←→ и LB/RB листают машины, B — закрыть то, что сверху */
export function padPre (p) {
  if (!A) return;
  if (GARAGE.isOpen() && !MENU.modal()) {
    const d = (p.menuRight || p.pageR ? 1 : 0) - (p.menuLeft || p.pageL ? 1 : 0);
    if (d) GARAGE.flip(d);
    p.menuLeft = p.menuRight = false;
  }
  if (p.menuBack && back()) p.menuBack = false;
}
/** назад: окно имени → гараж → «потратить»; true — что-то закрыли */
export function back () {
  if (MENU.modal()) return MENU.back();
  if (GARAGE.isOpen()) { GARAGE.close(); return true; }
  if (spendOpen()) { closeSpend(true); return true; }
  return false;
}
/* клавиатура: ↑↓ (и WASD) — по кнопкам, Enter/пробел — нажать, Esc — назад;
   в гараже ←→ листают машины. Та же подсветка, что у геймпада (padmenu.js) */
const KB = makePadMenu({});
function kbRoot () {
  const r = padRoot();
  if (r) return r;
  if (A.panelOpen && A.panelOpen()) return $('panel');
  const ov = $('over');
  if (ov && !ov.hidden && ov.classList.contains('cr')) return ov;
  const big = $('big');
  if (big && !big.hidden && A.S.state === 'title') return $('cr-menu');
  return null;
}
const KEYS = { ArrowUp: 'menuUp', KeyW: 'menuUp', ArrowDown: 'menuDown', KeyS: 'menuDown', ArrowLeft: 'menuLeft', KeyA: 'menuLeft',
  ArrowRight: 'menuRight', KeyD: 'menuRight', Enter: 'menuOk', NumpadEnter: 'menuOk', Space: 'menuOk', Escape: 'menuBack', Backspace: 'menuBack' };
function onKey (e) {
  if (!A) return;
  const root = kbRoot();
  if (!root) return;
  const tg = e.target, typing = tg && ((tg.tagName === 'INPUT' && /^(text|search|)$/.test(tg.type)) || tg.tagName === 'TEXTAREA');
  const top = padRoot();                          // окно поверх всего — клавиши игре не отдаём
  if (typing) {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); if (MENU.modal()) MENU.submitName(); }
    else if (e.code === 'Escape') { e.preventDefault(); tg.blur(); MENU.back(); }
    e.stopPropagation();
    return;
  }
  const k = KEYS[e.code];
  if (!k) { if (top && e.code !== 'KeyM') e.stopPropagation(); return; }
  if (root.id === 'panel' && k === 'menuBack') return;             // окно настроек/находок закрывает сама игра
  e.preventDefault(); e.stopPropagation();
  if (e.repeat && k === 'menuOk') return;
  if (GARAGE.isOpen() && root === GARAGE.root() && (k === 'menuLeft' || k === 'menuRight')) { GARAGE.flip(k === 'menuLeft' ? -1 : 1); return; }
  if (k === 'menuBack') { back(); return; }
  const p = { connected: true, active: true, menuUp: false, menuDown: false, menuLeft: false, menuRight: false, menuOk: false, menuBack: false };
  const sel = KB.selected();
  if (!sel || !sel.isConnected || !root.contains(sel) || !sel.classList.contains('padsel')) {
    KB.clear();
    KB(p, root);                                    // первое нажатие — только подсветить (на смену / autofocus)
    if (k !== 'menuOk') return;
  }
  p[k] = true;
  KB(p, root);
}
function onKeyUp (e) {
  if (!A || !kbRoot()) return;
  const tg = e.target;
  if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return;
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); }
}

/* ── донаты: цель города, ползунок шагами ── */
function paneDonate (p, k) {
  const D = ECON.DONATE[k], key = 'dlv-don-' + k;
  const have = +A.Store.get(key, 0) || 0, left = Math.max(0, D.goal - have);
  const max = Math.floor(Math.min(A.wallet(), left) / D.step) * D.step;
  const pct = A.donated(k);
  p.innerHTML = '<div class="cr-goal"><i class="cr-bar big"><i style="width:' + (pct * 100).toFixed(1) + '%"></i></i>' +
    '<span>' + esc(A.money(have)) + ' / ' + esc(A.money(D.goal)) + '</span></div>' +
    (left <= 0 ? '<div class="cr-done">✓</div>' :
      '<div class="cr-don"><input type="range" min="' + (max ? D.step : 0) + '" max="' + max + '" step="' + D.step + '" value="' + Math.min(max, D.step * 4) + '"' + (max ? '' : ' disabled') + '>' +
      '<button type="button" class="cr-btn buy"></button></div>');
  if (left <= 0) return;
  const r = p.querySelector('input'), b = p.querySelector('button');
  const sync = () => { const v = +r.value || 0; b.textContent = t('задонатить {money}', { money: A.money(v) }); b.disabled = v <= 0 || v > A.wallet(); };
  r.addEventListener('input', sync);
  sync();
  b.onclick = () => {
    const v = Math.min(+r.value || 0, Math.floor(Math.min(A.wallet(), Math.max(0, D.goal - (+A.Store.get(key, 0) || 0))) / D.step) * D.step);
    if (v <= 0) return;
    A.addWallet(-v);
    A.Store.set(key, (+A.Store.get(key, 0) || 0) + v);
    A.Store.flush();
    A.Snd.coin();
    rerender();
  };
}

/* ── слот-машина (взрослая версия): ставка — любая сумма из кошелька (ползунок,
   ¼ · ½ · всё; сначала стоит заработанное за смену), 1 из 10 удваивает ── */
const SYM = ['7', '★', '♥', '₽', '◆', '♣'];
const SYM_C = ['#ff4d5e', '#ffd85e', '#ff7fa8', '#7fe08a', '#6fd3ff', '#c9a0ff'];
const stepDown = n => Math.floor(Math.max(0, n) / ECON.SLOT.STEP) * ECON.SLOT.STEP;
let STAKE = 0;
function paneSlot (p) {
  const max = stepDown(A.wallet());
  STAKE = Math.min(max, STAKE || stepDown(Math.max(A.S.money || 0, max / 4)) || max);
  p.innerHTML = '<div class="cr-slot"><div class="cr-reels">' + [0, 1, 2].map(i => '<div class="cr-reel"><div class="cr-strip" data-r="' + i + '"></div></div>').join('') + '</div>' +
    '<div class="cr-sres"></div>' +
    (SH.slot || max <= 0 ? '' : '<div class="cr-stake"><input type="range" min="' + ECON.SLOT.STEP + '" max="' + max + '" step="' + ECON.SLOT.STEP + '" value="' + STAKE + '">' +
      '<div class="cr-quick">' + [[0.25, '¼'], [0.5, '½'], [1, t('всё')]].map(([k, l]) => '<button type="button" class="cr-btn" data-k="' + k + '">' + esc(l) + '</button>').join('') + '</div></div>') +
    '<button type="button" class="cr-btn buy cr-spin"></button></div>';
  const range = p.querySelector('.cr-stake input');
  const label = () => {
    btn.textContent = SH.slot ? t('уже крутил') : t('крутить · ставка {money}', { money: A.money(STAKE) });
    btn.disabled = SH.slot || STAKE <= 0 || STAKE > A.wallet();
  };
  if (range) {
    range.addEventListener('input', () => { STAKE = +range.value || 0; label(); });
    p.querySelectorAll('.cr-quick button').forEach(b => b.addEventListener('click', () => {
      STAKE = Math.max(ECON.SLOT.STEP, stepDown(max * +b.dataset.k)); range.value = STAKE; label();
    }));
  }
  const strips = [...p.querySelectorAll('.cr-strip')];
  const cell = s => '<i style="color:' + SYM_C[s] + '">' + SYM[s] + '</i>';
  // лента: 30 случайных символов, последний — тот, на котором встанет барабан
  const fill = (el, last) => { let h = ''; for (let i = 0; i < 29; i++) h += cell((Math.random() * SYM.length) | 0); el.innerHTML = h + cell(last); };
  strips.forEach((el, i) => { el.innerHTML = cell((i * 2 + 1) % SYM.length); });
  const btn = p.querySelector('.cr-spin'), res = p.querySelector('.cr-sres');
  label();
  btn.onclick = () => {
    const st = Math.min(STAKE, stepDown(A.wallet()));
    if (SH.slot || st <= 0) return;
    const stake = p.querySelector('.cr-stake');
    if (stake) stake.remove();
    SH.slot = true;
    btn.disabled = true;
    const win = Math.random() < ECON.SLOT.WIN;
    let out;
    if (win) out = [0, 0, 0];
    else { do out = [0, 1, 2].map(() => (Math.random() * SYM.length) | 0); while (out[0] === out[1] && out[1] === out[2]); }
    A.addWallet(-st);
    A.Store.flush();
    refreshWallet();
    res.textContent = ''; res.className = 'cr-sres';
    strips.forEach((el, i) => fill(el, out[i]));
    const H = strips[0].firstChild ? strips[0].firstChild.getBoundingClientRect().height || 48 : 48;
    const t0 = performance.now(), STOP = [1100, 1700, 2300];
    let tickN = 0;
    const anim = now => {
      const e = now - t0;
      let all = true;
      strips.forEach((el, i) => {
        const k = Math.min(1, e / STOP[i]);
        if (k < 1) all = false;
        const y = (1 - (1 - k) ** 3) * 29 * H;           // замедляется к концу
        el.style.transform = 'translateY(' + (-y).toFixed(1) + 'px)';
        if (k >= 1 && !el.dataset.stopped) { el.dataset.stopped = '1'; A.Snd.blip(420 + i * 120, 0.09, 'square', 0.1); }
      });
      if (((e / 90) | 0) > tickN) { tickN = (e / 90) | 0; if (!all) A.Snd.blip(900 + (tickN % 3) * 60, 0.02, 'square', 0.03); }
      if (!all) requestAnimationFrame(anim);
      else {
        if (win) {
          A.addWallet(st * ECON.SLOT.MUL);
          A.Store.flush();
          res.textContent = t('×{k}! +{money}', { k: ECON.SLOT.MUL, money: A.money(st * (ECON.SLOT.MUL - 1)) });
          res.classList.add('win');
          A.Snd.coin();
        } else {
          res.textContent = t('мимо · −{money}', { money: A.money(st) });
          res.classList.add('lose');
          A.Snd.fail && A.Snd.fail();
        }
        btn.textContent = t('уже крутил');
        refreshWallet(); refreshTabs();
      }
    };
    strips.forEach(el => { delete el.dataset.stopped; el.style.transform = 'translateY(0)'; });
    requestAnimationFrame(anim);
  };
}

/* отладка: __dlv.CAREERM.skipTo(13.9) — к обеду, skipTo(23.95) — к полуночи */
const DEBUG = {
  get SH () { return SH; }, stars, addStars, hour, isEvening, clockText, shiftOn, phase, onShiftStart, onShiftEnd, startShift, showEnd, clientKilled,
  hasOrders: () => !!(ORD && ORD.staffRide), hasCars: () => !!carsApi(),
  // перемотка за обед — обед считается прошедшим (иначе он всплывает в любом пресете песочницы)
  skipTo (h) { if (A) { A.env().t = ECON.tOfHour(h); if (h > ECON.SHIFT.LUNCH_H + 0.05) SH.lunch = true; else if (h < ECON.SHIFT.LUNCH_H) SH.lunch = false; } },
  useCars (api) { CARS_MOCK = api || null; },
  crewBoard, crewLoad: () => (A ? crewLoad() : null), openGarage, closeGarage: GARAGE.close, garageFlip: GARAGE.flip, openSpend, menu, askName, back,
};
