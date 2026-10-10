/* Карьера (Стим): смена 9:00—24:00, обед, конец смены, экран итогов,
   донаты и слот-машина, рейтинг пиццерии, звёзды ★. Числа — только из econ.js,
   расчёт — docs/CAREER.md.

     CAREERM.init(api)       — один раз из game.js (что нужно — см. init)
     CAREERM.startShift()    — из startRun, когда это смена, а не «просто покататься»
     CAREERM.step(dt)        — каждый кадр: часы, полночь, удары
     CAREERM.atBase(next)    — вернулся в пиццерию: обед (с 14:00) или развоз смены (после полуночи)
     CAREERM.showEnd(why, whyText) — экран итогов вместо прежнего #over
     CAREERM.clientKilled(victim, fee) — сбил своего клиента: штраф в цену его заказа (CLIENT_KILL)

     CAREERM.menu()          — из showTitle: главное меню (menu.js), menuCam — камера заставки
     CAREERM.padRoot/padPre/back — геймпад: окно имени, гараж (garage.js), «потратить»

   Для других модулей: addStars(n, why), stars(), hour(), isEvening(),
   onShiftStart(cb), onShiftEnd(cb), shiftOn(), crewSeed(i), crewBoard(). В отладке — __dlv.CAREERM.

   Всё здесь работает только в карьере: game.js зовёт модуль под флагом CAREER. */
import * as RESPECT from './respect.js';
import './career.css';
import * as ECON from './econ.js';
import * as GARAGE from './garage.js';
import { PIGGY } from './shiftcash.js';           // копилка — та же свинья, что на хаде и в гараже
import * as MENU from './menu.js';
import * as HONOR from './honor.js';            // доска почёта (honor.js): геймпад и «доставлено всего» профиля
import * as DLG from './dialog.js';
import * as DIST from './districts.js';
import * as CITY from './cityopen.js';
import * as DP from './distpick.js';             // выбор района — карусель карточек (листать с геймпада и клавиш)
import * as GROW from './growth.js';             // пиццерия растёт: ступень на итогах смены (growth.js)
import { farEarned } from './orders.js';
import * as END from './shiftend.js';
import * as CHAT from './chat.js';
import * as DEP from './dep.js';                // «депнуть»: однорукий бандит, рулетка, теннис — свои экраны (dep.js)
import * as HQ from './heroquests.js';           // герои, этап 2: совет Лёхи на ставке, «наоборот» Игорька, Жека про машину
import * as RAID from './raid.js';               // «потратить» → ёлка-турель у точки (raid.js)
import * as QR from './quickrun.js';             // быстрый заезд: своя длина смены, с 9:00, свои итоги (quickrun.js)
import { makePadMenu } from '../input/padmenu.js';
import { keyHTML, matchKey, inputKind, onInput } from '../input/glyphs.js';   // значки кнопок: полоска «как управлять» внизу чека смены, «гараж и траты»
import * as PFX from './paperfx.js';
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
  lunch: false, hits: 0, lastHurt: 0, fine: 0, back: 0, stars: 0, t0h: 9, endH: 9,
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
  A.Snd.coin();                                     // без плашки «+N ★»: звёзды называет тот, кто их дал (реплика Толика: глава, развоз смены)
  refreshWallet();
  return v;
}
/* часы мира: на смене — без скачка через полночь (смена с 21:00 кончается в «36» = 12:00),
   вне смены — 9…33. ECON.clock сам берёт по модулю 24 */
export function hour () {
  if (!A) return ECON.SHIFT.KEYS[0][1];
  const h = ECON.hourOf(A.env().t);
  return SH.on && h < SH.t0h - 0.01 ? h + 24 : h;
}
/* сколько суток (ENV.t) прошло со старта смены: смена — SPAN, как 9:00—24:00 */
const SPAN = ECON.SHIFT.T_END - ECON.SHIFT.T0;
function elapsed () {
  if (!A || !SH.on) return 0;
  const e = A.env().t - SH.tStart;
  return e < -1e-9 ? e + 1 : e;
}
/* «часы по расписанию» 9…24: где смена, как если бы она шла 9:00—24:00. На них — обед, полночь
   (конец смены), обязательные заказы и срочные (orders.js). В Юге совпадают с часами мира */
export function schedHour () { return SH.on ? ECON.hourOf(ECON.SHIFT.T0 + Math.min(elapsed(), SPAN + 0.1)) : hour(); }
/* вечер для бандитов: с 18:00 до 6 утра по часам мира */
export const isEvening = () => { const d = hour() % 24; return d >= ECON.SHIFT.EVENING_H || d < 6; };
/* круглосуточная пиццерия: со второго района (ECON.SHIFT.ALLDAY_FROM) */
export const allDay = (i = DIST.cur()) => DIST.has() && i >= (ECON.SHIFT.ALLDAY_FROM ?? 99);
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
  api.kbClear = () => KB.clear();                  // меню-карусель: после листания подсветка — на карточку в центре
  MENU.init(api);
  DEP.init({ A, SH, kbClear: () => KB.clear(), refreshWallet, refreshTabs, refreshEnd, closeSpend });
  HQ.init({ A, cars: carsApi, depGame: DEP.game, shiftN: () => SH.n, shiftOn: () => SH.on });
  addEventListener('keydown', onKey, true);
  addEventListener('keyup', onKeyUp, true);
  addEventListener('pointerdown', () => KB.clear(), true);        // мышью — клавиатурная подсветка уходит
  // часы смены и «сняться со смены» на хаде больше не ставим (04.10.2026): «до конца смены» и кнопка — в паузе
  setTimeout(() => { if (window.__dlv) window.__dlv.CAREERM = DEBUG; }, 0);
}

/* ── смена ── */
export function startShift () {
  closeSpend();
  if (!A) return;
  const S = A.S;
  // круглосуточная пиццерия (со второго района): смена с того часа, когда кончилась прошлая (dlv-clock);
  // в Юге — всегда с 9:00
  // быстрый заезд (quickrun.js) — всегда с 9:00
  const cv = A.Store.get('dlv-clock', null), day = allDay() && !QR.on(), c0 = cv == null || cv === '' ? 9 : +cv;
  const h0 = day && Number.isFinite(c0) ? ((c0 % 24) + 24) % 24 : ECON.SHIFT.KEYS[0][1];
  A.env().t = ECON.tOfHour(h0 < ECON.SHIFT.KEYS[0][1] ? h0 + 24 : h0);
  SH.tStart = A.env().t; SH.allDay = day;
  S.lunch = null;
  SH.on = true; SH.phase = ''; SH.home = false; SH.lunch = false; SH.hits = 0; SH.lastHurt = S.hurt || 0; SH.fine = 0; SH.back = 0; SH.stars = 0;
  SH.slot = false; SH.forceMood = ''; SH.lost = 0; SH.m = S.money || 0; S.tips = 0; SH.t0h = ECON.hourOf(A.env().t); SH.endH = SH.t0h; SH.n = +A.Store.get('dlv-shifts', 0) || 0;
  SH.len = QR.on() ? QR.len() : ECON.shiftLen(SH.n);   // быстрый заезд — длина, что выбрал игрок
  // волна щедрости: 1-я смена сессии — щедрая (econ.js PACE); быстрый заезд — обычная и волну не двигает
  SH.pace = QR.on() ? (DIST.setPace('normal'), 'normal') : DIST.beginShift();
  SH.district = DIST.cur();
  SH.city = DIST.city();                          // «весь город» (cityopen.js): итоги — без района, с премией за дальние
  SH.opened = -1;
  lunchClass(false);
  fire(startCbs, { n: SH.n + 1 });
  const L = SH.len, P = SH.pace;
  // попапа «на смене · до конца смены ~N мин» нет: сколько осталось — в паузе
  // час пик — говорим прямо (платят больше); щедрую смену не объявляем — плашка ложилась на накладную
  const pm = ECON.PACE.MODES[P];
  const pace = P === 'tight' ? [t('час пик'), t('заказы дальше, кофе меньше — зато платят ×{k}', { k: fmtK(pm.pay) })] : null;
  if (pace) setTimeout(() => { if (SH.on && SH.len === L) A.popBonus(pace[0], pace[1]); }, 5600);
  if (day) setTimeout(() => { if (SH.on && SH.len === L) A.toast(t('пиццерия круглосуточная — смена с {time}', { time: ECON.clock(SH.t0h) })); }, 2600);
}
/** волна этой смены: 'generous' | 'normal' | 'tight' */
export const pace = () => SH.pace || 'normal';
/* длина смены: короткая / средняя / длинная (ECON.SHIFT.LENGTHS) */
/** во сколько раз медленнее идут сутки, пока идёт смена (game.js, orders.js) */
export const shiftSlow = () => (SH.on && SH.len ? SH.len.slow : ECON.SHIFT.SLOW);

export function clockText () { return ECON.clock(hour()); }

/* Часы на экране — словами: «до конца смены 6:12» (настоящие минуты до полуночи) и,
   пока везёшь, «до конца заказа 0:45». Часы игры (09:00) — мелко сбоку. Длину смены
   (короткая / средняя / длинная) игроку не пишем. */
const mmss = sec => { sec = Math.max(0, Math.ceil(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
/** сколько настоящих секунд осталось до полуночи */
export function shiftLeft () {
  // по доле суток, а не по часам: ночью часы бегут вдвое быстрее дня, и прежний расчёт по часам
  // показывал «осталось 1:13», когда до конца было 0:38
  const perSec = 1 / ((A.DAY_LEN || 480) * shiftSlow()) + (FAST > 1 ? (FAST - 1) / (A.DAY_LEN || 480) : 0);   // долей суток в секунду
  return Math.max(0, (SPAN - elapsed()) / perSec);
}
let clockPrev = '';
function clockStep () {
  const el = $('cr-clock'), es = $('endshift');
  if (!el || !es) return;
  const show = !es.hidden && SH.on;
  if (el.hidden === show) el.hidden = !show;
  if (!show) return;
  const S = A.S, h = hour(), left = shiftLeft();
  const ord = !S.free && S.order && ['drive', 'side'].includes(S.state) && S.timeMax > 0 ? Math.max(0, S.time) : -1;
  const key = mmss(left) + '|' + (ord >= 0 ? mmss(ord) : '') + '|' + ECON.clock(h);
  if (key === clockPrev) return;
  clockPrev = key;
  const rs = el.querySelector('.ck-s'), ro = el.querySelector('.ck-o');
  rs.querySelector('em').textContent = t('до конца смены');
  rs.querySelector('b').textContent = mmss(left);
  ro.hidden = ord < 0;
  if (ord >= 0) { ro.querySelector('em').textContent = t('до конца заказа'); ro.querySelector('b').textContent = mmss(ord); }
  ro.classList.toggle('low', ord >= 0 && ord < 10);
  el.querySelector('small').textContent = ECON.clock(h);
  const d = h % 24;                                // смена круглосуточной пиццерии может идти через полночь
  el.classList.toggle('eve', d >= ECON.SHIFT.EVENING_H && d < 21);
  el.classList.toggle('night', d >= 21 || d < 6);
  el.classList.toggle('late', left < 60);
}

export function step (dt) {
  if (!A) return;
  const S = A.S;
  if (!$('choice') || $('choice').hidden) lunchClass(false);
  if (SH.on) watchMoney(S);
  if (!SH.on || S.ride || !A.isPlaying()) { clockStep(); return; }
  if (SH.phase === 'late') lateGuard(dt);
  // висит карточка заказа или грузится пицца — часы идут, и в полночь смена кончается и тут
  if (S.state === 'loading' || S.state === 'brief') { if (SH.phase === '' && schedHour() >= 24) midnight(); clockStep(); return; }
  if (FAST > 1 && SH.phase === '') { const E = A.env(); E.t = (E.t + dt * (FAST - 1) / A.DAY_LEN) % 1; }
  // удар — S.hurt подскакивает до 0,9 в hurtCar; считаем такие скачки
  const hu = S.hurt || 0;
  if (hu > SH.lastHurt + 0.05) SH.hits++;
  SH.lastHurt = hu;
  const h = schedHour();                          // по расписанию 9…24 (в круглосуточной смена может идти с ночи)
  if (SH.phase === '' && h >= 24) midnight();
  clockStep();
}

/* все вычеты за смену (штраф за клиента, опоздания, сорванный срочный, выбил своего) — для чека смены:
   «за смену» стало меньше, чем в прошлый кадр, — это вычет (строки «штраф за клиента», «опоздания и штрафы») */
function watchMoney (S) {
  const m = S.money || 0;
  if (m < SH.m) SH.lost += SH.m - m;
  SH.m = m;
}

/* ── вернулся в пиццерию (game.js: «отдал заказ и доехал назад», handover без заказа) ──
   После полуночи — развоз смены, если ждут (orders.js staffHere). С 14:00 — обед, раз за смену: Толик
   управляющий диалогом «на, похавай», потом выбор. true — ход забрали: next() (следующий заказ) — потом */
const LUNCH_SAY = /*i18n*/ [
  'о, вернулся. на, похавай — что будешь?',
  'стоять! обед. на, похавай, потом поедешь',
  'два часа уже. на, похавай — за счёт заведения',
];
export function atBase (next) {
  if (!A || !SH.on || A.S.ride) return false;
  if (SH.phase === 'late') {
    if (ORD && ORD.staffHere && ORD.staffHere()) return true;
    // полночь застала в дороге (midnight): последний заказ отвёз и доехал до пиццерии — вот теперь смена всё
    if (SH.home) { SH.home = false; endLate(); return true; }
    return false;
  }
  if (SH.lunch || SH.phase !== '') return false;
  const h = schedHour();
  if (h < ECON.SHIFT.LUNCH_H || h >= 24) return false;
  SH.lunch = true;
  A.S.handT = 1e9;                                  // пока обедаешь — следующий заказ не берём
  const go = () => { if (SH.on && A.S.state === 'handover' && !A.S.order) showLunch(next); };
  const p = CHAT.person && CHAT.person();
  if (!p) { go(); return true; }
  DLG.say({ person: p, name: t('Толик управляющий'), text: t(LUNCH_SAY[Math.floor(Math.random() * LUNCH_SAY.length)]),
    accept: t('давай'), mood: 'calm', color: '#3fae5a' }).then(go, go);
  return true;
}

/* ── обед (с 14:00, в пиццерии): одно из трёх до конца смены; next — после выбора ── */
function lunchClass (on) { const c = $('choice'); if (c) c.classList.toggle('cr-lunch', on); }
function showLunch (next) {
  SH.lunch = true;
  const S = A.S, L = ECON.LUNCH, T = ECON.TIPS;
  const opts = [
    { id: 'nitro', label: t('двойной раф'), sub: t('кофе: бак ×{k} и сразу полный', { k: fmtK(L.nitro.tank) }),
      fn () { S.nosEff = (S.nosEff || 1) / L.nitro.tank; A.NOS.tank = 1; } },
    { id: 'tips', label: t('бизнес-ланч'), sub: t('чаевые: шанс +{p} %, сумма ×{k}', { p: Math.round(T.LUNCH_CHANCE * 100), k: fmtK(T.LUNCH_MUL) }),
      fn () { /* orders.js читает S.lunch === 'tips' */ } },
    { id: 'hp', label: t('шаурма у ларька'), sub: tn(L.hp.hearts, '+{n} сердце|+{n} сердца|+{n} сердец'),
      fn () { S.hpMax += L.hp.hearts; S.hp += L.hp.hearts; A.hudHearts(); } },
  ];
  A.showChoice({
    title: t('обед'), sub: t('{time} — перерыв. что берёшь до конца смены?', { time: ECON.clock(hour()) }),
    pause: true, row: true, okLabel: t('взять'),
    opts: opts.map(o => ({ label: o.label, sub: o.sub, fn: () => {
      S.lunch = o.id;
      lunchClass(false);
      o.fn();
      if (next) next();
    } })),
  });
  lunchClass(true);
  A.Snd.order();
}
const fmtK = k => Number(k).toLocaleString(lang() === 'zh' ? 'zh-CN' : lang());

/* ── полночь: сначала, может быть, развоз смены, потом итоги ── */
async function midnight () {
  SH.phase = 'late'; SH.lateT = 0;
  const S = A.S;
  let ride = false;
  // развоз — только если едешь: в полночь на карточке заказа или на погрузке смена просто кончается
  const moving = ['drive', 'back', 'handover'].includes(S.state);
  if (moving && ORD && typeof ORD.staffRide === 'function' && Math.random() < ECON.ORDERS.STAFF_CHANCE) {
    A.hideChoice();
    try { ride = await ORD.staffRide(); } catch (e) { console.error('[career] staffRide', e); }
  }
  if (!SH.on || S.state === 'over' || S.state === 'title' || S.state === 'dying') return;   // смена уже кончилась иначе
  // полночь застала в дороге (без развоза): смена не обрывается посреди улицы — довози, что везёшь, и
  // возвращайся; кончится, когда доедешь до пиццерии (atBase). Новых заказов нет. Сколько бы ни ехал — смена ждёт
  // (автор 10.10.2026: «всегда надо дать игроку доехать обратно и только потом показывать конец смены»); бросить — «сняться» в паузе
  if (!ride && homeward(S)) {
    SH.home = true;
    A.toast(S.state === 'back' ? t('заказов больше нет — возвращайся в пиццерию') : t('это последний заказ — довези и возвращайся в пиццерию'));
    return;
  }
  endLate(ride);
}
/* в дороге после полуночи: везёшь заказ, поручение, отдаёшь у двери или едешь назад */
const homeward = S => ['back', 'drive', 'side'].includes(S.state) || (S.state === 'handover' && !!(S.order || S.side));
function endLate (ride) {
  A.toast(SH.allDay ? (ride ? t('всех развёз — смена всё') : t('смена всё — {time}', { time: ECON.clock(hour()) }))
    : ride ? t('полночь — всех развёз, смена всё') : t('полночь — смена всё'));
  A.endShift('время');
}

/* после полуночи: идёт развоз (заказ staff) или открыт диалог — ждём; иначе через 6 с
   смена кончается сама — чтобы она не повисла, что бы ни случилось с развозом */
function lateGuard (dt) {
  const S = A.S, riding = S.order && S.order.ord && S.order.ord.type === 'staff';
  if (riding || DLG.isOpen() || A.choiceOpen() || (ORD && ORD.staffWaiting && ORD.staffWaiting())) { SH.lateT = 0; return; }   // едет за ними в пиццерию — ждём
  // последний рейс после полуночи: ждём, пока доедешь до пиццерии (handover у пиццерии → atBase закрывает смену)
  if (SH.home && (homeward(S) || S.state === 'handover')) { SH.lateT = 0; return; }
  if ((SH.lateT = (SH.lateT || 0) + dt) < 6) return;
  SH.lateT = -1e9;
  endLate();
}

/* ── сбил своего клиента ── */
/* fee — цена заказа этого клиента (game.js clientFee): штраф = fee × CLIENT_KILL.FINE,
   из «за смену» (не ниже нуля) и из кошелька (сколько есть) */
export function clientKilled (victim, fee = 0) {
  if (!A) return;
  const S = A.S;
  const loss = Math.max(0, Math.round((fee || 0) * ECON.CLIENT_KILL.FINE / 10) * 10);
  if (loss) {
    S.money = Math.max(0, (S.money || 0) - loss);
    A.addWallet(-Math.min(loss, Math.max(0, A.wallet())));
  }
  SH.fine += loss;
  if (ECON.CLIENT_KILL.END_SHIFT) return;          // дальше — прежний game over, итоги покажет showEnd
  // плашки «сбил своего клиента» нет: Толик пишет в чат (CHAT.react('kill')), штраф — красной купюрой
  A.Snd.fail && A.Snd.fail();
  A.dropOrder();
}

/* ── опоздал обратно в пиццерию (game.js backLate, econ.js BACK_FINE): сколько вычли — для строки
   «опоздал обратно» в чеке смены (сами деньги game.js уже снял) ── */
export function backLate (loss) { if (loss > 0) SH.back += Math.round(loss); }

/* ── экран итогов ── */
const TITLE = {
  'смена окончена': () => t('снялся со смены'),
  'время': () => t('смена закончена'),
  'сбил клиента': () => t('сняли со смены'),
};
/* строка мелко под шапкой чека — почему кончилась смена (полночь в Юге — без строки: печать и так скажет) */
const WHY = {
  'смена окончена': () => '',
  'время': () => (SH.allDay ? t('пиццерия круглосуточная — следующая смена с {time}', { time: ECON.clock(SH.endH) }) : ''),
  'сбил клиента': () => t('тебя сняли со смены: сбил своего клиента'),
};

/* сбито прохожих за всю карьеру (сохранение dlv-knocked, стирается сбросом прогресса) */
const KNOCKED = 'dlv-knocked';
const knocked = () => Math.max(0, +A.Store.get(KNOCKED, 0) || 0);
/* итог смены — ОДНО правило (econ.js BOSS_MOOD): из него и фраза Толика на стикере, и печать на чеке.
   плохая — сняли за сбитого клиента, машина разбита / утонул, или заказов меньше BAD_BELOW[длина];
   хорошая — досидел до конца, без штрафа за клиента, заказов не меньше GREAT[длина]; остальное — так себе */
function moodOf (why, full) {
  if (SH.forceMood) return SH.forceMood;            // песочница интерфейса (src/uilab) — настроение руками
  const d = A.S.delivered || 0, M = ECON.BOSS_MOOD, len = (SH.len && SH.len.id) || 'medium';
  const at = (v, def) => (typeof v === 'number' ? v : v && v[len] != null ? v[len] : def);
  if (why === 'сбил клиента' || !TITLE[why] || d < at(M.BAD_BELOW, 3)) return 'bad';
  if (full && !SH.fine && d >= at(M.GREAT, 6)) return 'great';
  return 'ok';
}
/* печать на чеке: слово — как кончилась смена, цвет — настроение (то же, что у Толика); монетки — не на плохой */
function sealOf (why, full, mood) {
  const text = full ? (mood === 'great' ? t('отличная смена') : t('смена закрыта'))
    : why === 'смена окончена' ? t('снялся') : why === 'сбил клиента' ? t('сняли') : t('списан');
  const color = mood === 'great' ? 'green' : mood === 'bad' ? 'red' : full ? 'green' : 'rust';
  return { text, color, party: mood === 'great' ? 'both' : mood === 'ok' && full ? 'coins' : '' };
}

/* Конец смены — «чек смены» (docs/CAREER.md «Конец смены», UI-REVIEW.md П1): на затемнённом городе чек
   «ЧЕК СМЕНЫ № 7 · Юг» влетает, строки допечатываются (доставлено, чаевые, удары, штрафы, сбито, бонус),
   итог «+N» крупно щёлкает, печать хлопает (то же правило, что настроение Толика), сбоку — стикер Толика.
   Под итогом мелко: «в копилке теперь …», одна строка про район, новости (звание, пиццерия, место).
   Внизу чека — штамп «НА НОВУЮ СМЕНУ [A]» (курсор сразу на нём), на полях — [Y] гараж и траты,
   [X] депнуть (взрослая), [B] в меню. Отрисовка и движение — shiftend.js.
   held — уже подождали Толика: сообщение, что пришло под конец смены (похвала за последний заказ, вычет за
   опоздание), сначала показывается крупно в чате и уменьшается, только потом этот экран (≤ 6 с) */
export function showEnd (why, whyText, held) {
  if (!A) return;
  const S = A.S;
  if (QR.on()) { quickEnd(why, whyText); return; }
  if (!held && SH.on && CHAT.busy()) { CHAT.idle(() => { if (A.S.state === 'over') showEnd(why, whyText, true); }); return; }
  CHAT.clear();
  const wasOn = SH.on;
  if (wasOn) { SH.endH = hour(); watchMoney(S); }
  SH.bonus = 0;
  SH.on = false; SH.phase = 'done';
  lunchClass(false);
  $('cr-clock') && ($('cr-clock').hidden = true);
  const full = why === 'время';
  const rankWas = RESPECT.level(RESPECT.get() - RESPECT.shift()).i;   // звание до смены — «новое звание» строкой
  let placeWas = 0;
  if (wasOn) {
    A.Store.set('dlv-shifts', SH.n + 1);
    A.Store.set('dlv-clock', +(((SH.endH % 24) + 24) % 24).toFixed(2));   // часы мира: круглосуточная следующая смена — с этого часа
    // район: смена засчитана (отвёз хотя бы DISTRICT.COUNT_MIN), открылся следующий — сразу туда
    const r = DIST.countShift(S.delivered || 0);
    SH.counted = r.counted; SH.opened = r.opened;
    // бонус за смену — только досидел до конца (econ.js SHIFT_BONUS), сразу в кошелёк
    SH.bonus = full ? ECON.shiftBonus(S.delivered || 0, DIST.has() ? (SH.city ? ECON.CITY.PAY : DIST.pay(SH.district >= 0 ? SH.district : DIST.cur())) : 1) : 0;
    if (SH.bonus) A.addWallet(SH.bonus);
    // сбито прохожих за всю карьеру — Толик шутит про них при переводе в новый район
    A.Store.set(KNOCKED, knocked() + (S.people || 0));
    HONOR.shiftEnd(A.Store, S.delivered || 0);      // доставлено за всю карьеру профиля — рекорд на доске почёта
    SH.mood = moodOf(why, full);
    if (full && SH.hits === 0 && (S.delivered || 0) > 0) addStars(ECON.STARS.CLEAN_SHIFT, t('смена без единого удара'));
    placeWas = crewPlace();
    crewRecord(S.money || 0, full);
    fire(endCbs, { why, money: S.money || 0, delivered: S.delivered || 0, hits: SH.hits, fine: SH.fine, full, mood: SH.mood });
  }
  A.Store.flush();

  const ov = $('over');
  ov.classList.add('cr');
  $('ov-t').textContent = TITLE[why] ? TITLE[why]() : t('смена сорвалась');   // под чеком не видно (career.css) — для чтения экрана
  $('ov-why').textContent = '';
  $('ov-extra').hidden = true;
  $('st-note2').textContent = '';                   // сюда board.js допишет «лучшая смена! ты #N в мире» (строка в чеке)
  $('ov-stats').replaceChildren();
  $('ov-best').textContent = '';
  buildEnd();
  closeSpend(); DEP.close();
  const again = $('ov-again');
  again.textContent = t('на новую смену');           // значков на кнопках нет (автор 10.10.2026) — как управлять, пишет полоска внизу (endKeys)
  again.className = 'pp-stamp';
  again.setAttribute('autofocus', ''); again.setAttribute('data-pad-main', '');
  $('ov-menu').textContent = t('в меню');
  $('ov-menu').className = 'pp-note';
  refreshEnd();
  // пока чек печатается — штампа и пометок не видно и не нажать (любое нажатие — «допечатать сразу»)
  ov.classList.add('wait');
  ov.hidden = false;
  const opened = DIST.has() && SH.opened >= 0 ? t(DIST.list()[SH.opened].name) : '';
  const seal = wasOn ? sealOf(why, full, SH.mood) : null;
  const total = (S.money || 0) + (SH.bonus || 0);
  const stage = endStage();
  // строка «лучшая смена» прошлого чека — вынуть из него, пока play не стёр старый чек вместе с ней (вернётся в новый — noteIn)
  const note0 = $('st-note2');
  if (note0 && stage.contains(note0)) stage.after(note0);
  END.play({
    host: stage, tap: ov, money: A.money, Snd: A.Snd, stamp: again,
    head: wasOn ? t('чек смены') + ' · ' + (SH.city ? t('весь город') : DIST.has() ? t(DIST.list()[SH.district >= 0 ? SH.district : DIST.cur()].name) : t('Солнечный'))
      : t('покатался'),
    no: wasOn ? SH.n + 1 : 0,
    why: wasOn ? (WHY[why] ? WHY[why]() : whyText || '') : '',
    rows: wasOn ? endRows(full) : [],
    total: wasOn ? { k: t('за смену'), n: total, fmt: n => (n > 0 ? '+' : '') + A.money(n), cls: total > 0 ? 'pp-plus' : '' } : null,
    hints: endHints(wasOn, rankWas, placeWas),
    seal, party: seal && total > 0 ? seal.party : '',
    sticker: wasOn ? { line: END.tolikLine({ mood: SH.mood || 'ok', opened, killed: knocked(), adult: !!A.ADULT }) } : null,
  }, quick => {
    noteIn();
    fitEnd();
    setTimeout(() => { ov.classList.remove('wait'); KB.clear(); fitEnd(); }, quick ? 350 : 0);
  });
  // «лучшая смена! ты #N в мире» (board.js) — строкой в чеке; переносим сразу, а не в конце печати: пока строка лежала
  // под чеком, высота экрана была другой, и размер под экран (fitEnd) менялся в конце — лист прыгал
  function noteIn () {
    const note = $('st-note2'), col = stage.querySelector('.cr-rc-hints');
    if (note && col && note.parentNode !== col) { note.className = 'ov-note pp-hint'; col.appendChild(note); }
  }
  noteIn();
  fitEnd();
}

/* строки чека: [подпись, значение, класс]. Сходится: доставлено + чаевые − штрафы + бонус = итог «за смену».
   «доставлено» — всё, что пришло за смену, кроме чаевых (заказы, премия за развоз, поручения); штрафы —
   все вычеты за смену (career.js watchMoney): за клиента и «опоздал обратно» — своими строками, остальное — «опоздания и штрафы» */
function endRows (full) {
  const S = A.S, m = A.money, d = S.delivered || 0;
  const tips = Math.max(0, Math.round(S.tips || 0)), lost = Math.max(0, Math.round(SH.lost || 0));
  const fine = Math.min(lost, Math.max(0, Math.round(SH.fine || 0)));
  const back = Math.min(lost - fine, Math.max(0, Math.round(SH.back || 0))), other = lost - fine - back;
  const got = Math.max(0, (S.money || 0) - tips + lost);
  const rows = [[d ? tn(d, '{n} заказ доставлен|{n} заказа доставлено|{n} заказов доставлено') : t('заказов не доставлено'), (got ? '+' : '') + m(got), got ? 'pp-plus' : '']];
  if (tips) rows.push([t('чаевые и за скорость'), '+' + m(tips), 'pp-plus']);
  rows.push([t('удары'), String(SH.hits || 0), SH.hits ? '' : 'pp-plus']);
  if (fine) rows.push([t('штраф за клиента'), '−' + m(fine), 'pp-minus']);
  if (back) rows.push([t('опоздал обратно'), '−' + m(back), 'pp-minus']);
  if (other) rows.push([t('опоздания и штрафы'), '−' + m(other), 'pp-minus']);
  if (S.people) rows.push([t('прохожих сбито'), String(S.people), '']);
  rows.push(full ? [t('бонус за смену'), '+' + m(SH.bonus || 0), 'pp-plus'] : [t('бонус за смену'), t('только до конца'), 'cr-rc-no']);
  return rows;
}

/* мелко под итогом: копилка, одна строка про район, новости смены (жёлтым маркером) — не больше трёх новостей */
function endHints (wasOn, rankWas, placeWas) {
  const out = [{ text: t('в копилке теперь'), wal: true, n: A.wallet() }];
  if (!wasOn) return out;
  const dl = districtLine();
  if (dl) out.push(dl);
  const news = [];
  const lv = RESPECT.level();
  if (lv.i > rankWas) news.push({ text: t('новое звание: {name}', { name: lv.name }), mark: true });
  else if (lv.i < rankWas) news.push({ text: t('звание упало: {name}', { name: lv.name }) });
  for (const [k, v, where] of GROW.rows()) if (where === 'new') news.push({ text: k + (v ? ' · ' + v : ''), mark: true });   // «пиццерия «Юг» выросла · ★★★☆☆»
  const place = crewPlace();
  if (placeWas > 0 && place > 0 && place < placeWas) news.push({ text: t('ты #{n} среди курьеров', { n: place }) });
  return out.concat(news.slice(0, 3));
}

/* одна строка про район: «открыт новый район: «Кольцо»», «до района «Кольцо» — ещё 3 смены»,
   «для района «Кольцо» не в зачёт: 2 из 3 заказов · ещё 3 смены»; всё открыто или «весь город» — без строки */
function districtLine () {
  if (!DIST.has()) return null;
  if (SH.opened >= 0) return { text: t('открыт новый район: «{name}»', { name: t(DIST.list()[SH.opened].name) }), mark: true };
  if (SH.city) return null;
  const last = DIST.opened() - 1;
  if (last >= DIST.count() - 1) return null;
  const next = t(DIST.list()[last + 1].name), left = Math.max(1, DIST.need(last) - DIST.shiftsIn(last));
  const here = SH.district >= 0 ? SH.district : DIST.cur();
  if (here !== last) {
    return { text: tn(left, 'до района «{name}» — ещё {n} смена в районе «{where}»|до района «{name}» — ещё {n} смены в районе «{where}»|до района «{name}» — ещё {n} смен в районе «{where}»',
      { name: next, where: t(DIST.list()[last].name) }) };
  }
  const leftTxt = tn(left, 'ещё {n} смена|ещё {n} смены|ещё {n} смен');
  if (!SH.counted) {
    return { text: t('для района «{name}» не в зачёт: {have} из {need} заказов', { name: next, have: A.S.delivered || 0, need: ECON.DISTRICT.COUNT_MIN }) + ' · ' + leftTxt };
  }
  return { text: tn(left, 'до района «{name}» — ещё {n} смена|до района «{name}» — ещё {n} смены|до района «{name}» — ещё {n} смен', { name: next }) };
}

/* быстрый заезд кончился (полночь, снялся, сгорел): карьере ничего — ни смены, ни бонуса, ни района, ни звёзд,
   ни рейтинга; итоги заезда и выход из песочницы сохранения — quickrun.js */
const QTITLE = { 'смена окончена': () => t('ты сам закончил заезд'), 'время': () => t('заезд окончен'), 'сбил клиента': () => t('сняли с заезда') };
function quickEnd (why, whyText) {
  const S = A.S;
  CHAT.clear();
  if (SH.on) SH.endH = hour();
  SH.on = false; SH.phase = 'done'; SH.bonus = 0;
  lunchClass(false);
  $('cr-clock') && ($('cr-clock').hidden = true);
  closeSpend();
  QR.finish({
    title: QTITLE[why] ? QTITLE[why]() : t('заезд сорвался'),
    // причина конца признаком, а не текстом: 'time' — по времени, 'quit' — сам, 'pulled' — сняли, 'dead' — машина / утонул
    kind: why === 'время' ? 'time' : why === 'смена окончена' ? 'quit' : why === 'сбил клиента' ? 'pulled' : 'dead',
    why: why === 'время' ? t('полночь — пиццерия закрылась') : why === 'смена окончена' ? '' : whyText || '',
    money: S.money || 0, delivered: S.delivered || 0, tips: typeof S.tips === 'number' ? S.tips : 0,
    hits: SH.hits, fine: SH.fine, back: SH.back, people: S.people || 0, t0h: SH.t0h, endH: SH.endH,
  });
}

/* чек смены и стикер Толика (shiftend.js); под ними — пометки на полях (.ov-btns) */
function endStage () {
  let s = $('cr-stage');
  if (s) return s;
  s = document.createElement('div');
  s.id = 'cr-stage';
  $('ov-why').after(s);
  return s;
}
/* без прокрутки: вёрстка и так под 1280×720, Деку и телефон; если всё равно не влезло (длинный язык,
   много строк) — весь экран чуть уменьшается (zoom, не меньше 0,6) */
function fitEnd () {
  const ov = $('over'), box = ov && ov.querySelector('.ov-box');
  if (!box || ov.hidden || !ov.classList.contains('cr')) return;
  box.style.zoom = '';
  // высота — по раскладке (offsetTop / offsetHeight), не scrollHeight: пока чек въезжает снизу (transform), scrollHeight
  // раздут на 70vh — экран уменьшался до 0,7, а через 2 с прыгал в настоящий размер (автор 10.10.2026: «сначала мелко, потом крупно»)
  const k = ov.clientHeight / Math.max(1, layoutH(box));
  if (k < 1) box.style.zoom = Math.max(0.6, Math.floor(k * 100) / 100);
}
/* сколько места по высоте занимает содержимое box без transform-движения: от верха первого до низа последнего
   (display: contents — по детям; абсолютные полоски вроде .cr-keys не в счёт) + поля box и тень листа */
function layoutH (box) {
  const items = [];
  const walk = el => { for (const c of el.children) {
    const cs = getComputedStyle(c);
    if (cs.display === 'contents') walk(c);
    else if (cs.display !== 'none' && cs.position !== 'absolute' && cs.position !== 'fixed') items.push(c);
  } };
  walk(box);
  if (!items.length) return box.scrollHeight;
  // верх по раскладке — сумма offsetTop до страницы (у кого-то offsetParent — #cr-stage, у кого-то #over); transform в неё не входит
  const absTop = el => { let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y; };
  let top = Infinity, bot = -Infinity;
  for (const c of items) {
    const y = absTop(c);
    top = Math.min(top, y); bot = Math.max(bot, y + c.offsetHeight + (parseFloat(getComputedStyle(c).marginBottom) || 0));
  }
  const cs = getComputedStyle(box);
  return bot - top + (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) + 10;
}
/* «потратить деньги» — так же (раскрытая вкладка доната может и прокрутиться — там список) */
function fitBox (box) {
  if (!box) return;
  box.style.zoom = '';
  // высота по раскладке, а не scrollHeight: пока лист влетает снизу (pp-in, transform), scrollHeight раздут
  const cs = getComputedStyle(box), kids = [...box.children].filter(k => k.offsetParent);
  const need = kids.reduce((h, k) => h + k.offsetHeight, 0) + (parseFloat(cs.rowGap) || 0) * Math.max(0, kids.length - 1) +
    (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) + 10;   // + тень листа
  const k = box.clientHeight / Math.max(1, need);
  if (k < 1) box.style.zoom = Math.max(0.6, Math.floor(k * 100) / 100);
}
addEventListener('resize', () => {
  if (!A) return;
  fitEnd();
  const md = $('cr-spend');
  if (md && !md.hidden && !TAB) fitBox(md.querySelector('.cr-sp-box'));
});

/* когда откроется следующий район — строки [что, текст] для итогов смены и паузы (game.js renderPause):
   «новый район · «Кольцо» через 2 смены» и «смена в зачёт · от 3 заказов · сейчас 1».
   delivered — сколько отвёз за эту смену (на паузе), иначе без «сейчас». Всё открыто — [] */
export function districtNext (delivered) {
  if (!DIST.has()) return [];
  const last = DIST.opened() - 1;
  if (last >= DIST.count() - 1) return [];
  const left = Math.max(1, DIST.need(last) - DIST.shiftsIn(last)), next = t(DIST.list()[last + 1].name);
  const where = DIST.cur() !== last ? ' ' + t('в районе «{name}»', { name: t(DIST.list()[last].name) }) : '';
  const min = ECON.DISTRICT.COUNT_MIN;
  return [
    [t('новый район'), tn(left, '«{name}» через {n} смену|«{name}» через {n} смены|«{name}» через {n} смен', { name: next }) + where],
    [t('смена в зачёт'), tn(min, 'от {n} заказа|от {n} заказов|от {n} заказов') + (delivered != null ? ' · ' + t('сейчас {n}', { n: delivered }) : '')],
  ];
}

/* кошелёк и звёзды — строкой под заработком */
function refreshWallet () {
  const w = $('cr-wallet');
  if (!w) return;
  // строка чека «[свинья] в копилке ··· 227 600 ₽», звёзды — в шапке справа, что это — мелко под строкой
  w.innerHTML = '<p class="pp-row pp-total"><span>' + PIGGY + esc(t('в копилке')) + '</span><i></i><b class="pp-plus">' + esc(A.money(A.wallet())) + '</b></p>' +
    '<p class="pp-hint">' + esc(t('звёзды — за хорошие смены, открывают крутые машины')) + '</p>';
  const st = $('cr-spend') && $('cr-spend').querySelector('.cr-sp-stars');
  if (st) st.textContent = '★ ' + tn(stars(), '{n} звезда|{n} звезды|{n} звёзд');
}

/* «потратить деньги» — с экрана конца смены, на весь экран поверх него: кошелёк и звёзды, донаты городу
   (мусор, насилие) и ёлка-турель; «на новую смену» — сразу работать, «назад» — к экрану конца смены.
   «Депнуть» — не здесь, а своей кнопкой на экране конца смены. */
function spendBox () {
  let md = $('cr-spend');
  if (md) return md;
  md = document.createElement('div');
  md.id = 'cr-spend';
  md.hidden = true;
  // бумага, как чек смены и гараж (UI-REVIEW): лист «ГАРАЖ И ТРАТЫ ··· ★ 3» с перфорацией, строка «в копилке ··· 227 600 ₽»,
  // плитки — бланки с цветной полоской, внизу листа — красный штамп «[X] на новую смену», под листом — пометка «[B] назад»
  md.innerHTML = '<div class="cr-sp-box"><section class="cr-sp-sheet pp-sheet pp-in"><header class="pp-head cr-sp-head"><span class="cr-sp-sum"></span><b class="cr-sp-stars"></b></header>' +
    '<div id="cr-wallet"></div><div class="cr-sp-body"></div><button type="button" id="cr-sp-go" class="pp-stamp"></button></section>' +
    '<nav class="pp-margin"><button type="button" id="cr-sp-close" class="pp-note"></button></nav></div>';
  ($('game') || document.body).appendChild(md);
  md.querySelector('#cr-sp-close').addEventListener('click', () => closeSpend());
  md.querySelector('#cr-sp-go').addEventListener('click', () => { const b = $('ov-again'); if (b) b.click(); });
  return md;
}
function openSpend () {
  const md = spendBox();
  md.querySelector('.cr-sp-sum').textContent = t('гараж и траты');
  // [X] на новую смену · [B] назад · [Y] в гараж (плитки — ещё курсором и A; курсор сразу на «гараже»)
  md.querySelector('#cr-sp-go').innerHTML = keyHTML('x') + esc(t('на новую смену'));
  md.querySelector('#cr-sp-close').innerHTML = keyHTML('back') + esc(t('назад'));
  md.hidden = false;
  const sh = md.querySelector('.cr-sp-sheet');      // лист влетает заново при каждом открытии
  sh.classList.remove('pp-in'); void sh.offsetWidth; sh.classList.add('pp-in');
  refreshWallet(); openTab('');
  fitBox(md.querySelector('.cr-sp-box'));
  requestAnimationFrame(() => md.classList.add('on'));
}
function closeSpend () {
  const md = $('cr-spend');
  if (md && !md.hidden) { md.classList.remove('on'); md.hidden = true; }
  refreshEnd();
}
/* пометки на полях чека смены: [Y] гараж и траты — всегда (гараж смотреть можно и без денег), [X] депнуть —
   только взрослая версия и есть что ставить. «В копилке теперь» — сколько сейчас (после ставки, гаража, донатов) */
function refreshEnd () {
  if (!A) return;
  const w = A.wallet(), dep = $('ov-dep'), sp = $('ov-spend');
  if (dep) {
    dep.hidden = !A.ADULT || w < ECON.SLOT.STEP;
    dep.className = 'pp-note pp-red';
    dep.textContent = t('депнуть');
    dep.title = DEP.label();
  }
  if (sp) { sp.className = 'pp-note'; sp.textContent = t('гараж и траты'); sp.hidden = false; }   // гараж — первой плиткой
  END.wallet(w);
  endKeys();
}
/* чек смены: как управлять — одна бумажная полоска внизу экрана, как в меню, паузе и «депнуть» (.dep-keys):
   «[A] на новую смену · [Y] гараж и траты · [X] депнуть · [B] в меню»; значки — того, чем играют (glyphs.js), пальцем — нет */
function endKeys () {
  const ov = $('over');
  if (!ov || !ov.classList.contains('cr')) return;
  let h = ov.querySelector('.cr-keys');
  if (!h) { h = document.createElement('div'); h.className = 'cr-keys'; ov.appendChild(h); }
  if (inputKind().kind === 'touch') { h.hidden = true; return; }
  h.hidden = false;
  const dep = $('ov-dep');
  h.innerHTML = [keyHTML('ok') + esc(t('на новую смену')), keyHTML('y') + esc(t('гараж и траты')),
    dep && !dep.hidden ? keyHTML('x') + esc(t('депнуть')) : '', keyHTML('back') + esc(t('в меню'))].filter(Boolean).join('<i>·</i>');
}
onInput(() => endKeys());

/* гараж — отдельно: с экрана конца смены и из меню, на весь экран (garage.js) */
function openGarage (onClose) { GARAGE.open(onClose); }

let TAB = '';
const SPEND_MORE = false;   // «гараж и траты»: донаты городу и ёлка-турель — пока скрыты (автор, 09.10.2026)
function buildEnd () {
  // пометки на полях: [Y] гараж и траты · [X] депнуть · [B] в меню («гараж» отдельно и «покататься» убраны 09.10.2026:
  // гараж — первая плитка «гаража и трат», покататься — в меню)
  if (!$('ov-dep')) {
    const mk = (id, fn) => { const b = document.createElement('button'); b.type = 'button'; b.id = id; b.addEventListener('click', fn); return b; };
    $('ov-menu').before(mk('ov-spend', openSpend), mk('ov-dep', () => { A.Snd.boot && A.Snd.boot(); DEP.open(); }));
  }
  let el = $('cr-end');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cr-end';
    spendBox().querySelector('.cr-sp-body').appendChild(el);
  }
  // 05.10.2026: у каждой плитки — что даёт (было только «0 % цели города»); гараж — тоже сюда: главная трата.
  // 09.10.2026 (автор): пока только две плитки — «перейти в гараж» и «депнуть»; донаты (мусор, насилие) и ёлка-турель
  // скрыты флагом SPEND_MORE — код на месте, вернуть — SPEND_MORE = true
  const tabs = [
    ['garage', t('перейти в гараж'), '', t('машины, броня, мотор, покраска')],
    !SPEND_MORE && A.ADULT ? ['dep', t('депнуть'), '', ''] : null,
    SPEND_MORE ? ['trash', t('борьба с мусором'), 'bar', t('меньше мусора у подъездов и на дорогах')] : null,
    SPEND_MORE ? ['gang', t('борьба с насилием'), 'bar', t('бандитские круги меньше, гопники подходят реже')] : null,
    SPEND_MORE && RAID.ready() ? ['turret', t('ёлка-турель'), '', ''] : null,
  ].filter(Boolean);
  // значки: [Y] у гаража — всегда (Y жмёт его сразу), [A] — у плитки под курсором геймпада / клавиатуры
  el.innerHTML = '<div class="cr-tabs n' + tabs.length + '">' + tabs.map(([k, name, bar, what]) =>
    '<button type="button" class="cr-tab cr-t-' + k + '" data-tab="' + k + '"><b>' + (k === 'garage' ? keyHTML('y') : '') + '<span class="cr-ok">' + keyHTML('ok') + '</span>' + esc(name) + '</b>' +
    (what ? '<span class="cr-what">' + esc(what) + '</span>' : '') +
    (bar ? '<i class="cr-bar"><i></i></i><span class="cr-sub"></span>' : '<span class="cr-sub"></span>') + (k === 'dep' ? DEP.tileArt() : '') + '</button>').join('') + '</div><div id="cr-pane"></div>';
  el.querySelectorAll('.cr-tab').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.tab === 'garage') { openGarage(() => { rerender(); refreshEnd(); }); return; }
    if (b.dataset.tab === 'dep') { A.Snd.boot && A.Snd.boot(); DEP.open(); return; }   // окно «депнуть» — поверх (dep.js), «назад» — сюда
    openTab(b.dataset.tab === TAB ? '' : b.dataset.tab);
  }));
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
    if (sub) sub.textContent = A.donated(k) >= 1 ? t('цель собрана') : t('собрано {have} из {goal}', { have: A.money(+A.Store.get('dlv-don-' + k, 0) || 0), goal: A.money(ECON.DONATE[k].goal) });
  }
  const dp = el.querySelector('.cr-t-dep');           // «депнуть»: какая игра сегодня; нечего ставить — плитка не жмётся
  if (dp) {
    const can = A.wallet() >= ECON.SLOT.STEP;
    dp.disabled = !can;
    dp.querySelector('.cr-sub').textContent = can ? DEP.label() : t('в копилке меньше {money}', { money: A.money(ECON.SLOT.STEP) });
  }
  const tu = el.querySelector('.cr-t-turret .cr-sub');
  if (tu) tu.textContent = RAID.spendTab(A.money).sub;
  el.querySelectorAll('.cr-tab').forEach(b => b.classList.toggle('cur', b.dataset.tab === TAB));
}
function openTab (k) {
  TAB = k;
  const p = $('cr-pane');
  p.className = k ? 'on cr-p-' + k : '';
  p.innerHTML = '';
  if (k === 'trash' || k === 'gang') paneDonate(p, k);
  else if (k === 'turret') RAID.spendPane(p, { wallet: A.wallet, addWallet: A.addWallet, money: A.money, Snd: A.Snd }, rerender);
  refreshTabs();
}
function rerender () { refreshWallet(); refreshTabs(); openTab(TAB); }

/* ── рейтинг пиццерии: ты и курьеры (RIVAL_SPEC), по заработку за всё время ──
   dlv-crew = { me, n, crew: [{ seed, total }] }. У курьеров — постоянные зерна:
   имена и лица те же и в меню, и на смене. Твой заработок — из каждой смены;
   их — сколько они заработали на этой смене (R.money), а если не ездили — около
   твоего среднего ×0,6…1,3: догнать можно, но не даром. */
const CREW_KEY = 'dlv-crew';
const CREW_START = [12000, 5600, 17600, 2400];   // ×8 с 01.10.2026 (econ.js MONEY_K)        // фора в начале: сразу есть кого обгонять
const CREW_FLOOR = 7200;                           // средняя смена, пока своих смен нет
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
/** главное меню на экране и ничего поверх (панель настроек — отдельно, game.js) */
const menuOn = () => A && A.S.state === 'title' && !(A.panelOpen && A.panelOpen()) && MENU.shown() && !$('big').hidden;
/** после окна поверх меню (праздник, выбор): подсветка клавиатуры сброшена, фокус — на карточке меню */
export function refocus () { KB.clear(); MENU.focus(); }
export const kbClear = () => KB.clear();
export const openProfiles = after => MENU.openProfiles(after);
export const menuCam = (cam, P, tG) => MENU.cam(cam, P, tG);
export const askName = cb => MENU.askName(cb);
const spendOpen = () => { const m = $('cr-spend'); return m && !m.hidden ? m : null; };
/** непрозрачный экран поверх города (гараж, «потратить») — кадр мира можно не рисовать */
export const covered = () => GARAGE.isOpen() || !!spendOpen() || !!DEP.root();
/** что сейчас листает геймпад: окно имени, гараж, «депнуть», «потратить» — или null */
export function padRoot () { return QR.root() || END.root() || CITY.root() || MENU.modal() || GARAGE.root() || DEP.root() || spendOpen(); }
/** до makePadMenu: в гараже ←→ и LB/RB листают машины, B — закрыть то, что сверху */
export function padPre (p) {
  if (!A) return;
  if (END.active()) {                               // конец смены (деньги, Толик): любая кнопка — показать сразу / «продолжить»
    if (p.any || p.menuOk || p.menuBack || p.accept) END.skip();
    p.menuOk = p.menuBack = p.menuUp = p.menuDown = p.menuLeft = p.menuRight = false;
    return;
  }
  if (endOn()) {                                    // чек смены, поверх ничего: Y / X / B жмут свою пометку сразу (крестовина не нужна)
    const hit = p.btnY ? $('ov-spend') : p.btnX ? $('ov-dep') : p.menuBack ? $('ov-menu') : null;
    if (hit && !hit.hidden) { PFX.press(hit); hit.click(); }
    if (hit) { p.menuOk = p.menuBack = p.menuUp = p.menuDown = p.menuLeft = p.menuRight = false; return; }
  }
  if (HONOR.root()) HONOR.pad(p);                   // доска почёта: свой курсор по сетке, LB/RB — страницы (honor.js); B — ниже, back()
  if (DP.isOpen()) {                                // выбор района — карусель (distpick.js): ←→, LB/RB — листать
    const d = (p.menuRight || p.pageR ? 1 : 0) - (p.menuLeft || p.pageL ? 1 : 0);
    if (d) DP.flip(d);
    p.menuLeft = p.menuRight = false;
  } else if (GARAGE.isOpen() && !MENU.modal()) {
    // LB/RB — листать машины всегда; ←→ — тоже, а в палитре — ходить по цветам (padmenu: ←→ как ↑↓)
    const paint = GARAGE.mode() === 'paint';
    const d = (p.pageR || (!paint && p.menuRight) ? 1 : 0) - (p.pageL || (!paint && p.menuLeft) ? 1 : 0);
    if (d) GARAGE.flip(d);
    if (!paint) p.menuLeft = p.menuRight = false;
    if (p.btnX) GARAGE.act('armor');                 // [X] броня, [Y] мотор — прямо, без курсора
    else if (p.btnY) GARAGE.act('engine');
  } else if (!padRoot() && menuOn()) {                // главное меню: ←→, LB/RB — листать карточки (menu.js)
    const d = (p.menuRight || p.pageR ? 1 : 0) - (p.menuLeft || p.pageL ? 1 : 0);
    if (d) MENU.flip(d);
    p.menuLeft = p.menuRight = false;
    if ((p.btnY && MENU.hot('y')) || (p.btnX && MENU.hot('x'))) { p.menuOk = p.menuBack = p.menuUp = p.menuDown = false; return; }   // [Y] профиль, [X] район
  } else if (DEP.root() && !MENU.modal()) {         // в «депнуть» ←→ и LB/RB — ставка, X / Y — цвет или игрок, после — X «крутить ещё»
    const d = (p.menuRight || p.pageR ? 1 : 0) - (p.menuLeft || p.pageL ? 1 : 0);
    if (d) DEP.stake(d);
    p.menuLeft = p.menuRight = false;
    if (p.btnX) DEP.x(); else if (p.btnY) DEP.y();
  } else if (spendOpen() && padRoot() === spendOpen() && (p.btnX || p.btnY)) {   // «гараж и траты»: X — на новую смену, Y — в гараж
    const go = p.btnX ? $('cr-sp-go') : document.querySelector('#cr-spend .cr-t-garage'); if (go) { PFX.press(go); go.click(); }
    p.menuOk = false;
  }
  if (p.menuBack && back()) p.menuBack = false;
}
/** чек смены на экране, допечатан, и поверх него ничего (гаража, трат, «депнуть», выбора района) */
function endOn () {
  const ov = $('over');
  return !!(A && ov && !ov.hidden && ov.classList.contains('cr') && !ov.classList.contains('wait') && !END.active() && !padRoot() && !DP.isOpen());
}
/** назад: окно имени → гараж → «потратить»; true — что-то закрыли */
export function back () {
  if (QR.root()) return QR.back();
  if (CITY.root()) return CITY.back();
  if (MENU.modal()) return MENU.back();
  if (GARAGE.isOpen()) return GARAGE.back();       // палитра / «точно продать?» — закрыть их, иначе выйти
  if (DEP.root()) return DEP.back();               // посреди прокрутки B не закрывает — дождись итога
  if (spendOpen()) { closeSpend(); return true; }
  return false;
}
/* клавиатура: ↑↓ (и WASD) — по кнопкам, Enter/пробел — нажать, Esc — назад;
   в гараже ←→ листают машины. Та же подсветка, что у геймпада (padmenu.js) */
const KB = makePadMenu({});
function kbRoot () {
  const r = padRoot();
  if (r) return r;
  if (A.panelOpen && A.panelOpen()) return $('panel');
  if (A.S.paused) { const pm = $('pausem'); if (pm && !pm.hidden) return pm; }   // пауза — карусель (pausecz.js): ←→ листать, ↑↓ Enter
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
  if (END.active()) { if (!e.repeat) END.skip(); e.preventDefault(); e.stopPropagation(); return; }   // конец смены — любая клавиша: показать сразу / «продолжить»
  if (endOn()) {                                    // чек смены: Y — гараж и траты, X — депнуть, Esc — в меню (как [Y] [X] [B] геймпада)
    const hit = matchKey('y', e) ? $('ov-spend') : matchKey('x', e) ? $('ov-dep') : matchKey('back', e) ? $('ov-menu') : null;
    if (hit) { e.preventDefault(); e.stopPropagation(); if (!e.repeat && !hit.hidden) { PFX.press(hit); hit.click(); } return; }
  }
  const root = kbRoot();
  if (!root) return;
  // «депнуть»: Q / E — ставка, X / Y — цвет или игрок (после — X «крутить ещё»); «гараж и траты»: X — на новую смену (как геймпад)
  if (DEP.root() && root === DEP.root() && !MENU.modal()) {
    const g = matchKey('lb', e) ? () => DEP.stake(-1) : matchKey('rb', e) ? () => DEP.stake(1)
      : matchKey('x', e) ? DEP.x : matchKey('y', e) ? DEP.y : null;
    if (g) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) g(); return; }
  }
  if (spendOpen() && root === spendOpen() && (matchKey('x', e) || matchKey('y', e))) {   // X — на новую смену, Y — в гараж
    e.preventDefault(); e.stopPropagation();
    const go = matchKey('x', e) ? $('cr-sp-go') : document.querySelector('#cr-spend .cr-t-garage'); if (go && !e.repeat) { PFX.press(go); go.click(); }
    return;
  }
  // гараж: X — броня, Y — мотор, Q / E — листать (как [X] [Y] [LB] [RB] геймпада)
  if (GARAGE.isOpen() && root === GARAGE.root() && !MENU.modal()) {
    const g = matchKey('x', e) ? () => GARAGE.act('armor') : matchKey('y', e) ? () => GARAGE.act('engine')
      : matchKey('lb', e) ? () => GARAGE.flip(-1) : matchKey('rb', e) ? () => GARAGE.flip(1) : null;
    if (g) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) g(); return; }
  }
  const tg = e.target, typing = tg && ((tg.tagName === 'INPUT' && /^(text|search|)$/.test(tg.type)) || tg.tagName === 'TEXTAREA');
  const top = padRoot();                          // окно поверх всего — клавиши игре не отдаём
  if (typing) {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); if (MENU.modal()) MENU.submitName(); }
    else if (e.code === 'Escape') { e.preventDefault(); tg.blur(); MENU.back(); }
    e.stopPropagation();
    return;
  }
  if (!top && root.id === 'cr-menu' && !e.repeat && ((matchKey('y', e) && MENU.hot('y')) || (matchKey('x', e) && MENU.hot('x')))) { e.preventDefault(); e.stopPropagation(); return; }   // меню: Y — профиль, X — район
  const k = KEYS[e.code];
  if (!k) { if (top && e.code !== 'KeyM') e.stopPropagation(); return; }
  if ((root.id === 'panel' || root.id === 'pausem') && k === 'menuBack') return;   // окно настроек/находок и паузу закрывает сама игра (Esc)
  e.preventDefault(); e.stopPropagation();
  if (e.repeat && k === 'menuOk') return;
  if (DP.isOpen() && root === DP.root() && (k === 'menuLeft' || k === 'menuRight')) { DP.flip(k === 'menuLeft' ? -1 : 1); return; }   // выбор района
  if (GARAGE.isOpen() && root === GARAGE.root() && (k === 'menuLeft' || k === 'menuRight') && GARAGE.mode() !== 'paint') { GARAGE.flip(k === 'menuLeft' ? -1 : 1); return; }
  if (DEP.root() && root === DEP.root() && (k === 'menuLeft' || k === 'menuRight')) { DEP.stake(k === 'menuLeft' ? -1 : 1); return; }   // ←→ — ставка
  if (k === 'menuBack') { back(); return; }
  if (root.id === 'cr-menu' && (k === 'menuLeft' || k === 'menuRight')) { MENU.flip(k === 'menuLeft' ? -1 : 1); return; }   // меню-карусель
  if ((root.id === 'panel' || root.id === 'pausem') && (k === 'menuLeft' || k === 'menuRight') && A.cardFlip && A.cardFlip(root, k === 'menuLeft' ? -1 : 1)) return;   // настройки и пауза — карусели
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

/* ── депнуть (взрослая версия) — своё окно на весь экран: dep.js (три игры, свои экраны) ── */
/** сменили профиль без перезагрузки (game.js reprofile): первая ставка сессии — снова первая */
export function reprofile () { DEP.reprofile(); }

/* отладка: __dlv.CAREERM.skipTo(13.9) — к обеду, skipTo(23.95) — к полуночи */
const DEBUG = {
  get SH () { return SH; }, shiftSlow, pace, DIST: DIST.DEBUG, stars, addStars, hour, isEvening, clockText, shiftOn, phase, onShiftStart, onShiftEnd, startShift, showEnd, clientKilled,
  hasOrders: () => !!(ORD && ORD.staffRide), hasCars: () => !!carsApi(),
  // перемотка за обед — обед считается прошедшим (иначе он всплывает в любом пресете песочницы)
  // h — по расписанию смены (9…24): в круглосуточной смене с ночи «23,9» — это тоже «почти конец смены»
  schedHour, allDay, districtNext, shiftLeft,
  skipTo (h) { if (A) { A.env().t = SH.on ? (SH.tStart + ECON.tOfHour(h) - ECON.SHIFT.T0) % 1 : ECON.tOfHour(h); if (h > ECON.SHIFT.LUNCH_H + 0.05) SH.lunch = true; else if (h < ECON.SHIFT.LUNCH_H) SH.lunch = false; } },
  useCars (api) { CARS_MOCK = api || null; },
  showLunch,                                        // обед сразу — проверить карточку (стрелки, Enter)
  crewBoard, crewLoad: () => (A ? crewLoad() : null), openDep: DEP.open, closeDep: DEP.close, openGarage, closeGarage: GARAGE.close, garageFlip: GARAGE.flip, openSpend, menu, askName, back,
};
