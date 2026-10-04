/* Карьера (Стим): смена 9:00—24:00, обед, конец смены, экран итогов,
   донаты и слот-машина, рейтинг пиццерии, звёзды ★. Числа — только из econ.js,
   расчёт — docs/CAREER.md.

     CAREERM.init(api)       — один раз из game.js (что нужно — см. init)
     CAREERM.startShift()    — из startRun, когда это смена, а не «просто покататься»
     CAREERM.step(dt)        — каждый кадр: часы, обед, полночь, удары
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
import * as MENU from './menu.js';
import * as DLG from './dialog.js';
import * as DIST from './districts.js';
import * as CITY from './cityopen.js';
import * as GROW from './growth.js';             // пиццерия растёт: ступень на итогах смены (growth.js)
import { farEarned } from './orders.js';
import * as END from './shiftend.js';
import * as CHAT from './chat.js';
import * as ACH from './achievements.js';          // достижения: «Всё на красное» в «депнуть» (achievements.js)
import * as HEROES from './heroes.js';           // теннисисты в «депнуть» — герои города: те же лица
import * as HQ from './heroquests.js';           // герои, этап 2: совет Лёхи на ставке, «наоборот» Игорька, Жека про машину
import * as RAID from './raid.js';               // «потратить» → ёлка-турель у точки (raid.js)
import * as QR from './quickrun.js';             // быстрый заезд: своя длина смены, с 9:00, свои итоги (quickrun.js)
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
  MENU.init(api);
  HQ.init({ A, cars: carsApi, depGame, shiftN: () => SH.n, shiftOn: () => SH.on });
  addEventListener('keydown', onKey, true);
  addEventListener('keyup', onKeyUp, true);
  addEventListener('pointerdown', () => KB.clear(), true);        // мышью — клавиатурная подсветка уходит
  // часы смены и «сняться со смены» на хаде больше не ставим (04.10.2026): «до конца смены» и кнопка — в паузе
  setTimeout(() => { if (window.__dlv) window.__dlv.CAREERM = DEBUG; }, 0);
}

/* ── смена ── */
export function startShift () {
  closeSpend(false);
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
  SH.on = true; SH.phase = ''; SH.lunch = false; SH.hits = 0; SH.lastHurt = S.hurt || 0; SH.fine = 0; SH.stars = 0;
  SH.slot = false; STAKE = 0; SH.t0h = ECON.hourOf(A.env().t); SH.endH = SH.t0h; SH.n = +A.Store.get('dlv-shifts', 0) || 0;
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
    title: t('обед'), sub: t('{time} — перерыв. что берёшь до конца смены?', { time: ECON.clock(hour()) }),
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
  A.toast(SH.allDay ? (ride ? t('всех развёз — смена всё') : t('смена всё — {time}', { time: ECON.clock(hour()) }))
    : ride ? t('полночь — всех развёз, смена всё') : t('полночь — смена всё'));
  A.endShift('время');
}

/* после полуночи: идёт развоз (заказ staff) или открыт диалог — ждём; иначе через 6 с
   смена кончается сама — чтобы она не повисла, что бы ни случилось с развозом */
function lateGuard (dt) {
  const S = A.S, riding = S.order && S.order.ord && S.order.ord.type === 'staff';
  if (riding || DLG.isOpen() || A.choiceOpen()) { SH.lateT = 0; return; }
  if ((SH.lateT = (SH.lateT || 0) + dt) < 6) return;
  SH.lateT = -1e9;
  A.toast(SH.allDay ? t('смена всё — {time}', { time: ECON.clock(hour()) }) : t('полночь — смена всё'));
  A.endShift('время');
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
  A.popBonus(t('сбил своего клиента'), loss ? t('заказ сорван · штраф −{money}', { money: A.money(loss) }) : t('заказ сорван'));
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
  'смена окончена': () => (SH.counted || !DIST.has() ? t('заработанное — в кошельке, смена засчитана') : t('заработанное — в кошельке')),
  'время': () => (SH.allDay ? t('смена отработана — пиццерия круглосуточная, следующая смена с {time}', { time: ECON.clock(SH.endH) }) : t('полночь — пиццерия закрылась')),
  'сбил клиента': () => t('тебя сняли со смены: сбил своего клиента'),
};

/* сбито прохожих за всю карьеру (сохранение dlv-knocked, стирается сбросом прогресса) */
const KNOCKED = 'dlv-knocked';
const knocked = () => Math.max(0, +A.Store.get(KNOCKED, 0) || 0);
/* какая смена для директора: плохая / так себе / хорошая (econ.js BOSS_MOOD) */
function moodOf (why, full) {
  const d = A.S.delivered || 0, M = ECON.BOSS_MOOD;
  if (why === 'сбил клиента' || d < M.BAD_BELOW) return 'bad';
  if (full && !SH.fine && d >= (M.GREAT[(SH.len && SH.len.id) || 'medium'] || 6)) return 'great';
  return 'ok';
}
function bossCard () {
  const b = END.boss({ A, mood: SH.mood || 'ok', opened: DIST.has() && SH.opened >= 0 ? t(DIST.list()[SH.opened].name) : '', killed: knocked() });
  return (b.face ? '<img alt="" src="' + esc(b.face) + '">' : '') + '<div><b>' + esc(b.name) + '</b><p>' + esc(b.text) + '</p></div>';
}

/* held — уже подождали Толика управляющего: сообщение, что пришло под конец смены (похвала за последний заказ,
   вычет за опоздание), сначала показывается крупно и уменьшается, только потом итоги (≤ 6 с) */
export function showEnd (why, whyText, held) {
  if (!A) return;
  const S = A.S;
  if (QR.on()) { quickEnd(why, whyText); return; }
  if (!held && SH.on && CHAT.busy()) { CHAT.idle(() => { if (A.S.state === 'over') showEnd(why, whyText, true); }); return; }
  CHAT.clear();
  const wasOn = SH.on;
  if (wasOn) SH.endH = hour();
  SH.bonus = 0;
  SH.on = false; SH.phase = 'done';
  lunchClass(false);
  $('cr-clock') && ($('cr-clock').hidden = true);
  const full = why === 'время';
  if (wasOn) {
    A.Store.set('dlv-shifts', SH.n + 1);
    A.Store.set('dlv-clock', +(((SH.endH % 24) + 24) % 24).toFixed(2));   // часы мира: круглосуточная следующая смена — с этого часа
    // район: смена засчитана (отвёз хотя бы DISTRICT.COUNT_MIN), открылся следующий — сразу туда
    const r = DIST.countShift(S.delivered || 0);
    SH.counted = r.counted; SH.opened = r.opened;
    // бонус за смену — только досидел до конца (econ.js SHIFT_BONUS), сразу в кошелёк
    SH.bonus = full ? ECON.shiftBonus(S.delivered || 0, DIST.has() ? (SH.city ? ECON.CITY.PAY : DIST.pay(SH.district >= 0 ? SH.district : DIST.cur())) : 1) : 0;
    if (SH.bonus) A.addWallet(SH.bonus);
    // сбито прохожих за всю карьеру — для директора при переводе в новый район
    A.Store.set(KNOCKED, knocked() + (S.people || 0));
    SH.mood = moodOf(why, full);
    if (full && SH.hits === 0 && (S.delivered || 0) > 0) addStars(ECON.STARS.CLEAN_SHIFT, t('смена без единого удара'));
    crewRecord(S.money || 0, full);
    fire(endCbs, { why, money: S.money || 0, delivered: S.delivered || 0, hits: SH.hits, fine: SH.fine, full, mood: SH.mood });
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
  // [подпись, число, как показать, где]: big — крупно наверху рядом с директором, info — мелкой строкой
  // под плитками (район и что дальше), new — там же жёлтой плашкой; без пометки — плитка
  const rows = [
    [t('заработано'), S.money || 0, A.money, 'big'],
    SH.bonus ? [t('бонус за смену'), SH.bonus, n => '+' + A.money(n)] : null,
    [t('доставлено заказов'), S.delivered || 0, cnt],
    typeof S.tips === 'number' && S.tips > 0 ? [t('чаевые'), S.tips, A.money] : null,
    [t('на смене'), SH.endH, h => ECON.clock(SH.t0h) + ' — ' + ECON.clock(SH.t0h + (SH.endH - SH.t0h) * Math.min(1, h / (SH.endH || 1)))],
    [t('ударов'), SH.hits, cnt],
    SH.fine ? [t('штраф за клиента'), SH.fine, n => '−' + A.money(n)] : null,
    S.people ? [t('прохожих сбито'), S.people, cnt] : null,
    RESPECT.shift() || RESPECT.get() ? [t('респект за смену'), RESPECT.shift(), n => (n < 0 ? '−' : '+') + Math.abs(Math.round(n)) + ' · ' + RESPECT.level().name] : null,
    SH.stars ? [t('звёзд за смену'), SH.stars, n => '+' + Math.round(n) + ' ★'] : null,
    DIST.has() ? [...districtRow(), 'info'] : null,
    ...GROW.rows().map(([k, v, where]) => [k, 1, () => v, where]),   // «пиццерия «Юг» · растёт ★★★☆☆» (growth.js)
    SH.city && farEarned() > 0 ? [t('премия за дальние'), farEarned(), n => '+' + A.money(n)] : null,
    DIST.has() && SH.opened >= 0 ? [t('открыт новый район'), 1, () => t(DIST.list()[SH.opened].name), 'new'] : null,
    ...(DIST.has() && SH.opened < 0 ? districtNext().map(([k, v]) => [k, 1, () => v, 'info']) : []),
  ].filter(Boolean);
  const box = $('ov-stats'), head = endHead(), info = endInfo();
  const rowEl = (r, i) => {
    const e = document.createElement('div');
    e.className = 'ov-row' + (r[3] ? ' ' + r[3] : '');
    e.dataset.i = i;
    e.innerHTML = '<span>' + esc(r[0]) + '</span><b>' + esc(r[2](r[1])) + '</b>';    // сначала итоговые — по ним меряем экран (fitEnd)
    return e;
  };
  const els = rows.map(rowEl);
  head.querySelector('#cr-earn').replaceChildren(...els.filter((e, i) => rows[i][3] === 'big'));
  box.replaceChildren(...els.filter((e, i) => !rows[i][3]));
  info.replaceChildren(...els.filter((e, i) => rows[i][3] === 'info' || rows[i][3] === 'new'));
  info.hidden = !info.children.length;
  const rowsGo = () => {
    if (DIST.has() && SH.opened >= 0) setTimeout(() => { if ($('over') && !$('over').hidden) A.Snd.coin(); }, 200 + rows.length * 220);
    rows.forEach((r, i) => setTimeout(() => {
      const row = els[i];
      if (!row) return;
      row.classList.add('on');
      A.countUp(row.querySelector('b'), r[1], r[2], 600);
      if (r[1]) A.Snd.blip(700 + i * 90, 0.06, 'square', 0.06);
    }, 200 + i * 220));
  };
  // директор: похвала по смене или перевод в новый район (shiftend.js)
  SH.boss = wasOn ? bossCard() : '';
  const bc = $('cr-boss');
  bc.innerHTML = SH.boss; bc.hidden = !SH.boss;
  // место в пиццерии: «ты #2 среди курьеров · до Саши 1 200 ₽»
  const board = crewBoard(), me = board.findIndex(r => r.me);
  const up = me > 0 ? board[me - 1] : null;
  $('ov-best').innerHTML = me < 0 ? '' : '<b>' + esc(t('ты #{n} среди курьеров', { n: me + 1 })) + '</b>' +
    (up ? '<span>' + esc(t('до {who} — {money}', { who: up.gen || up.name, money: A.money(Math.max(0, up.total - board[me].total)) })) + '</span>' : '<span>' + esc(t('ты лучший курьер пиццерии')) + '</span>');
  buildEnd();
  // цифры докрутились — поверх всплывает заработок и на что потратить, если есть что тратить
  closeSpend(false);
  clearTimeout(SPEND_T);
  // сначала деньги кучей (заработок, потом бонус за смену) → «продолжить» → Толик управляющий и его фраза →
  // «продолжить» → цифры итогов и «потратить» (shiftend.js)
  const after = () => {
    rowsGo();
    SPEND_T = setTimeout(() => { if (A.wallet() > 0 && $('over') && !$('over').hidden) openSpend(); else reopenBtn(); }, 200 + rows.length * 220 + 700);
  };
  if (wasOn) setTimeout(() => END.play({ earned: S.money || 0, bonus: SH.bonus || 0, wallet: A.wallet(), money: A.money, Snd: A.Snd, mood: SH.mood || 'ok' }, after), 60);
  else after();
  // кнопки: на новую смену (главная) / потратить / гараж / покататься / в меню
  $('ov-again').textContent = t('на новую смену');
  $('ov-again').setAttribute('autofocus', '');
  $('ov-menu').textContent = t('в меню');
  ov.hidden = false;
  fitEnd();
  for (let i = 0; i < rows.length; i++) els[i].querySelector('b').textContent = rows[i][2](0);
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
  closeSpend(false);
  QR.finish({
    title: QTITLE[why] ? QTITLE[why]() : t('заезд сорвался'),
    why: why === 'время' ? t('полночь — пиццерия закрылась') : why === 'смена окончена' ? '' : whyText || '',
    money: S.money || 0, delivered: S.delivered || 0, tips: typeof S.tips === 'number' ? S.tips : 0,
    hits: SH.hits, fine: SH.fine, people: S.people || 0, t0h: SH.t0h, endH: SH.endH,
  });
}

/* наверху итогов: крупный заработок и директор рядом (на узком — друг под другом);
   под плитками — строка района (что засчитано, что откроется) */
function endHead () {
  let h = $('cr-head');
  if (h) return h;
  h = document.createElement('div');
  h.id = 'cr-head';
  h.innerHTML = '<div id="cr-earn"></div><div id="cr-boss" hidden></div>';
  $('ov-why').after(h);
  return h;
}
function endInfo () {
  let e = $('cr-info');
  if (e) return e;
  e = document.createElement('div');
  e.id = 'cr-info';
  $('ov-stats').after(e);
  return e;
}
/* итоги без прокрутки: вёрстка и так сжата под 1280×720, Деку и телефон; если всё равно не влезло
   (длинный язык, много строк) — весь экран итогов чуть уменьшается (zoom, не меньше 0,6) */
function fitEnd () {
  const ov = $('over'), box = ov && ov.querySelector('.ov-box');
  if (!box || ov.hidden || !ov.classList.contains('cr')) return;
  box.style.zoom = '';
  const k = ov.clientHeight / Math.max(1, ov.scrollHeight);
  if (k < 1) box.style.zoom = Math.max(0.6, Math.floor(k * 100) / 100);
}
/* «потратить» — так же: открылся район, длинная реплика директора — чуть меньше, но без прокрутки
   (раскрытая вкладка доната может и прокрутиться — там список) */
function fitBox (box) {
  if (!box) return;
  box.style.zoom = '';
  const k = box.clientHeight / Math.max(1, box.scrollHeight);
  if (k < 1) box.style.zoom = Math.max(0.6, Math.floor(k * 100) / 100);
}
addEventListener('resize', () => {
  if (!A) return;
  fitEnd();
  const md = $('cr-spend');
  if (md && !md.hidden && !TAB) fitBox(md.querySelector('.cr-sp-box'));
});

/* район на экране итогов: «Юг · 2 из 2 смен» или «Юг · смена не засчитана (меньше 2 заказов)» */
function districtRow () {
  if (SH.city) return [t('район'), 1, () => t('весь город')];
  const i = SH.district >= 0 ? SH.district : DIST.cur(), name = t(DIST.list()[i].name), need = DIST.need(i), have = DIST.shiftsIn(i);
  const txt = !SH.counted ? name + ' · ' + tn(ECON.DISTRICT.COUNT_MIN, 'не засчитана: меньше {n} заказа|не засчитана: меньше {n} заказов|не засчитана: меньше {n} заказов')
    : need && i === DIST.opened() - 1 + (SH.opened >= 0 ? -1 : 0) ? name + ' · ' + t('{have} из {need} смен', { have: Math.min(have, need), need })
      : name + ' · ' + tn(have, '{n} смена|{n} смены|{n} смен');
  return [t('район'), 1, () => txt];
}

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
  md.innerHTML = '<div class="cr-sp-box"><div class="cr-sp-head"><div class="cr-sp-sum"></div><div id="cr-wallet"></div></div><div class="cr-sp-new" hidden></div><div class="cr-sp-boss" hidden></div>' +
    '<button type="button" id="cr-sp-go"></button>' +
    '<div class="cr-sp-body"></div><button type="button" id="cr-sp-close"></button></div>';
  ($('game') || document.body).appendChild(md);
  md.querySelector('#cr-sp-close').addEventListener('click', () => closeSpend(true));
  md.querySelector('#cr-sp-go').addEventListener('click', () => { const b = $('ov-again'); if (b) b.click(); });
  return md;
}
function openSpend () {
  const md = spendBox();
  const earned = Math.round(A.S.money || 0) + (SH.bonus || 0);
  md.querySelector('.cr-sp-sum').textContent = (earned >= 0 ? '+' : '−') + A.money(Math.abs(earned));
  md.querySelector('#cr-sp-go').textContent = t('на новую смену');
  md.querySelector('#cr-sp-close').textContent = t('не тратить');
  // открылся новый район — крупно, над кнопкой: следующая смена уже там
  const nw = md.querySelector('.cr-sp-new');
  nw.hidden = !(DIST.has() && SH.opened >= 0);
  if (!nw.hidden) nw.innerHTML = '<b>' + esc(t('открыт район «{name}»', { name: t(DIST.list()[SH.opened].name) })) + '</b><span>' +
    esc(t('следующая смена — там: машина {s}, оплата {p}. вернуться можно из меню', { s: '+' + Math.round((ECON.DISTRICT.SPEED[SH.opened] - 1) * 100) + ' %', p: '+' + Math.round((ECON.DISTRICT.PAY[SH.opened] - 1) * 100) + ' %' })) + '</span>';
  const bs = md.querySelector('.cr-sp-boss');
  bs.innerHTML = SH.boss || ''; bs.hidden = !SH.boss;
  md.hidden = false;
  fitBox(md.querySelector('.cr-sp-box'));
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
    RAID.ready() ? ['turret', t('ёлка-турель'), ''] : null,
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
  const tu = el.querySelector('.cr-t-turret .cr-sub');
  if (tu) tu.textContent = RAID.spendTab(A.money).sub;
  const s = el.querySelector('.cr-t-slot .cr-sub');
  if (s) s.textContent = A.wallet() >= ECON.SLOT.STEP ? t(GAME_NAME[depGame()]) + ' · ×' + gameMul(depGame()) : t('нечего ставить');
  el.querySelectorAll('.cr-tab').forEach(b => b.classList.toggle('cur', b.dataset.tab === TAB));
}
function openTab (k) {
  TAB = k;
  const p = $('cr-pane');
  p.className = k ? 'on cr-p-' + k : '';
  p.innerHTML = '';
  if (k === 'trash' || k === 'gang') paneDonate(p, k);
  else if (k === 'turret') RAID.spendPane(p, { wallet: A.wallet, addWallet: A.addWallet, money: A.money, Snd: A.Snd }, rerender);
  else if (k === 'slot') { TAB = ''; p.className = ''; openDep(); }   // депнуть — своё окно на весь экран
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
export const menuCam = (cam, P, tG) => MENU.cam(cam, P, tG);
export const askName = cb => MENU.askName(cb);
const spendOpen = () => { const m = $('cr-spend'); return m && !m.hidden ? m : null; };
/** непрозрачный экран поверх города (гараж, «потратить») — кадр мира можно не рисовать */
export const covered = () => GARAGE.isOpen() || !!spendOpen() || !!depOpen();
/** что сейчас листает геймпад: окно имени, гараж, «депнуть», «потратить» — или null */
export function padRoot () { return QR.root() || END.root() || CITY.root() || MENU.modal() || GARAGE.root() || depOpen() || spendOpen(); }
/** до makePadMenu: в гараже ←→ и LB/RB листают машины, B — закрыть то, что сверху */
export function padPre (p) {
  if (!A) return;
  if (END.active()) {                               // конец смены (деньги, Толик): любая кнопка — показать сразу / «продолжить»
    if (p.any || p.menuOk || p.menuBack || p.accept) END.skip();
    p.menuOk = p.menuBack = p.menuUp = p.menuDown = p.menuLeft = p.menuRight = false;
    return;
  }
  if (GARAGE.isOpen() && !MENU.modal()) {
    const d = (p.menuRight || p.pageR ? 1 : 0) - (p.menuLeft || p.pageL ? 1 : 0);
    if (d) GARAGE.flip(d);
    p.menuLeft = p.menuRight = false;
  } else if (depOpen() && !MENU.modal()) {          // в «депнуть» ←→ и LB/RB — ставка
    const d = (p.menuRight || p.pageR ? 1 : 0) - (p.menuLeft || p.pageL ? 1 : 0);
    if (d && !SH.slot) setStake(STAKE + d * stakeStep());
    p.menuLeft = p.menuRight = false;
  }
  if (p.menuBack && back()) p.menuBack = false;
}
/** назад: окно имени → гараж → «потратить»; true — что-то закрыли */
export function back () {
  if (QR.root()) return QR.back();
  if (CITY.root()) return CITY.back();
  if (MENU.modal()) return MENU.back();
  if (GARAGE.isOpen()) { GARAGE.close(); return true; }
  if (depOpen()) return closeDep();
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
  if (END.active()) { if (!e.repeat) END.skip(); e.preventDefault(); e.stopPropagation(); return; }   // конец смены — любая клавиша: показать сразу / «продолжить»
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
  if (depOpen() && root === depOpen() && (k === 'menuLeft' || k === 'menuRight')) { if (!SH.slot) setStake(STAKE + (k === 'menuLeft' ? -1 : 1) * stakeStep()); return; }   // ←→ — ставка
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

/* ── депнуть (взрослая версия) — своё окно на весь экран ──
   Игра меняется по кругу (ECON.SLOT.GAMES), каждая смена — следующая:
     slot     — однорукий бандит: три барабана, три семёрки — ×2
     roulette — красное или чёрное: выбираешь цвет, крутится колесо (есть зеро) — ×2
     tennis   — Андрюша, Игорёк или Настюша: выбираешь, кто выиграет матч — ×3
   Исход решает heroquests.js: совет Лёхи Арбуза (встретил его в смену) — ± к удаче на первую
   прокрутку, в теннисе — «наоборот» Игорька (прогноз на матч сбывается наоборот в 85 %).
   Ставка общая: ползунок шагом SLOT.STEP, кнопки −/+ и ¼ · ½ · всё (сначала стоит
   заработанное за смену). Сколько ставишь — столько купюр высыпается кучей рядом,
   и строкой: «из кошелька −N ₽ · останется M ₽». «ДЕП» — купюры уезжают в игру.
   Первый деп за сессию (с запуска игры) выигрывает всегда (SLOT.FIRST_WIN). Раз за смену. */
const SYM = ['7', '★', '♥', '₽', '◆', '♣'];
const SYM_C = ['#ff4d5e', '#ffd85e', '#ff7fa8', '#7fe08a', '#6fd3ff', '#c9a0ff'];
const N_ = s => s;
const TENNIS = [
  { id: 'andr', name: N_('Андрюша'), seed: 41027, fem: false },
  { id: 'igor', name: N_('Игорёк'), seed: 77311, fem: false },
  { id: 'nast', name: N_('Настюша'), seed: 50923, fem: true },
];
const GAME_NAME = { slot: N_('однорукий бандит'), roulette: N_('красное или чёрное'), tennis: N_('теннис: кто выиграет матч') };
const stepDown = n => Math.floor(Math.max(0, n) / ECON.SLOT.STEP) * ECON.SLOT.STEP;
let STAKE = 0, DEP_SESSION = 0, PICK = null, GAME = 'slot';
const BILLS_MAX = 36;
/** какая игра в «депнуть» на этой смене: по кругу от номера смены */
export const depGame = () => { const G = ECON.SLOT.GAMES; return G[((SH.n || 0) % G.length + G.length) % G.length]; };
const gameMul = g => (ECON.SLOT[g] && ECON.SLOT[g].mul) || ECON.SLOT.MUL;
function depBox () {
  let md = $('cr-dep');
  if (md) return md;
  md = document.createElement('div');
  md.id = 'cr-dep';
  md.hidden = true;
  md.innerHTML = '<div class="dep-box">' +
    '<div class="dep-t"></div><div class="dep-g"></div><div class="dep-tip" hidden></div>' +
    '<div class="dep-main"><div class="dep-stage"></div><div class="dep-pile"></div></div>' +
    '<div class="dep-res"></div>' +
    '<div class="dep-sum"><b></b><span></span></div>' +
    '<div class="dep-stake"><button type="button" class="cr-btn dep-minus">−</button><input type="range"><button type="button" class="cr-btn dep-plus">+</button></div>' +
    '<div class="cr-quick dep-quick">' + [[0.25, '¼'], [0.5, '½'], [1, '']].map(([k, l]) => '<button type="button" class="cr-btn" data-k="' + k + '">' + esc(l) + '</button>').join('') + '</div>' +
    '<button type="button" class="dep-go"></button>' +
    '<div class="dep-foot"><button type="button" class="dep-again" hidden></button><button type="button" class="cr-btn dep-close"></button></div>' +
  '</div>';
  ($('game') || document.body).appendChild(md);
  md.querySelector('.dep-close').addEventListener('click', () => closeDep());
  const range = md.querySelector('input');
  range.addEventListener('input', () => setStake(+range.value || 0));
  md.querySelector('.dep-minus').addEventListener('click', () => setStake(STAKE - stakeStep()));
  md.querySelector('.dep-plus').addEventListener('click', () => setStake(STAKE + stakeStep()));
  md.querySelectorAll('.dep-quick button').forEach(b => b.addEventListener('click', () => setStake(stepDown(stepDown(A.wallet()) * +b.dataset.k))));
  // «ДЕП», а после прокрутки — «пора на работу»: сразу на новую смену; «крутить ещё» — новый раунд
  md.querySelector('.dep-go').addEventListener('click', () => { if (SH.slot) toWork(); else spin(); });
  md.querySelector('.dep-again').addEventListener('click', () => { if (SPINNING) return; SH.slot = false; openDep(); });
  return md;
}
/* шаг кнопок −/+: ~1/20 кошелька, круглым числом */
function stakeStep () {
  const w = A.wallet(), raw = Math.max(ECON.SLOT.STEP, w / 20), p = 10 ** Math.floor(Math.log10(raw));
  return Math.max(ECON.SLOT.STEP, Math.round(raw / p) * p);
}
const depOpen = () => { const m = $('cr-dep'); return m && !m.hidden ? m : null; };
const cell = s => '<i style="color:' + SYM_C[s] + '">' + SYM[s] + '</i>';

/* ── сцены игр ── */
const WHEEL_N = 37;                               // 0 — зеро (зелёное), дальше красное и чёрное через одно
const wheelColor = i => (i === 0 ? 'zero' : i % 2 ? 'red' : 'black');
function stageHTML (g) {
  if (g === 'slot') return '<div class="dep-machine"><div class="dep-top">777</div><div class="cr-reels">' +
    [0, 1, 2].map(i => '<div class="cr-reel"><div class="cr-strip" data-r="' + i + '">' + cell((i * 2 + 1) % SYM.length) + '</div></div>').join('') +
    '</div><div class="dep-slit"></div><i class="dep-lever"><b></b></i></div>';
  if (g === 'roulette') {
    const seg = 360 / WHEEL_N, stops = [];
    for (let i = 0; i < WHEEL_N; i++) { const c = { zero: '#2f9e4f', red: '#d9342c', black: '#1d1a22' }[wheelColor(i)]; stops.push(c + ' ' + (i * seg).toFixed(2) + 'deg ' + ((i + 1) * seg).toFixed(2) + 'deg'); }
    return '<div class="dep-rl"><div class="dep-ptr"></div><div class="dep-wheel" style="background:conic-gradient(' + stops.join(',') + ')"><i></i></div></div>' +
      '<div class="dep-picks">' + [['red', t('красное')], ['black', t('чёрное')]].map(([k, l]) => '<button type="button" class="dep-pick dep-c-' + k + '" data-p="' + k + '">' + esc(l) + '</button>').join('') + '</div>';
  }
  // теннис: корт, мячик и три игрока — кого выберешь, за того и болеешь
  return '<div class="dep-court"><i class="dep-ball"></i><b class="dep-score">0 : 0</b></div><div class="dep-picks dep-players">' + TENNIS.map(p => {
    let face = '';
    try { if (A.person && A.face) face = A.face(HEROES.person(p.id) || A.person({ seed: p.seed, fem: p.fem }), 64); } catch (e) { face = ''; }   // тот же человек, что в городе (heroes.js)
    return '<button type="button" class="dep-pick dep-pl" data-p="' + p.id + '">' + (face ? '<img src="' + face + '" alt="">' : '<i></i>') + '<span>' + esc(t(p.name)) + '</span></button>';
  }).join('') + '</div>';
}
function openDep () {
  const md = depBox();
  GAME = depGame(); PICK = null;
  const max = stepDown(A.wallet());
  STAKE = Math.min(max, stepDown(A.S.money || 0) || stepDown(max / 4) || max);
  md.dataset.game = GAME;
  md.querySelector('.dep-t').textContent = t('депнуть');
  md.querySelector('.dep-g').textContent = t(GAME_NAME[GAME]) + ' · ×' + gameMul(GAME);
  md.querySelector('.dep-quick [data-k="1"]').textContent = t('всё');
  md.querySelector('.dep-close').textContent = t('назад');
  md.querySelector('.dep-pile').innerHTML = '';
  md.querySelector('.dep-res').textContent = ''; md.querySelector('.dep-res').className = 'dep-res';
  md.querySelector('.dep-stage').innerHTML = stageHTML(GAME);
  // совет Лёхи Арбуза (встретил его в эту смену) — строкой под названием игры (heroquests.js)
  const tip = HQ.tipFor(GAME), tipEl = md.querySelector('.dep-tip');
  tipEl.textContent = tip ? tip.text : ''; tipEl.hidden = !tip;
  md.querySelectorAll('.dep-pick').forEach(b => b.addEventListener('click', () => {
    if (SH.slot) return;
    PICK = b.dataset.p;
    md.querySelectorAll('.dep-pick').forEach(q => q.classList.toggle('on', q === b));
    A.Snd.blip(660, 0.05, 'square', 0.06);
    setStake(STAKE, true);
  }));
  md.classList.remove('spun');
  SH.slot = false;
  md.querySelector('.dep-again').hidden = true;
  const r = md.querySelector('input');
  r.min = max ? ECON.SLOT.STEP : 0; r.max = max; r.step = ECON.SLOT.STEP;
  md.hidden = false;
  requestAnimationFrame(() => md.classList.add('on'));
  setStake(STAKE, true);
}
function toWork () {
  if (SPINNING) return;
  closeDep(); closeSpend(false);
  const b = $('ov-again'); if (b) b.click();
}
let SPINNING = false;
function closeDep () {
  const md = $('cr-dep');
  if (!md || md.hidden) return false;
  md.classList.remove('on'); md.hidden = true;
  refreshWallet(); refreshTabs();
  return true;
}
/* ставка: цифры, ползунок и куча купюр рядом с игрой (их столько, какая доля кошелька) */
function setStake (v, quiet) {
  const md = depBox(), max = stepDown(A.wallet()), done = SH.slot;
  STAKE = Math.max(max ? ECON.SLOT.STEP : 0, Math.min(max, stepDown(v)));
  const r = md.querySelector('input');
  r.value = STAKE; r.disabled = done || max <= 0;
  md.querySelector('.dep-sum b').textContent = A.money(STAKE);
  if (done) return;                                  // раунд сыгран — цифры итога не трогаем
  md.querySelector('.dep-sum span').textContent = max <= 0 ? t('нечего ставить') : t('из кошелька −{money} · останется {left}', { money: A.money(STAKE), left: A.money(A.wallet() - STAKE) });
  md.querySelectorAll('.dep-stake button, .dep-quick button').forEach(b => { b.disabled = done || max <= 0; });
  const go = md.querySelector('.dep-go'), need = GAME !== 'slot' && !PICK;
  go.textContent = need ? (GAME === 'roulette' ? t('выбери цвет') : t('выбери, кто выиграет')) : t('ДЕП · {money}', { money: A.money(STAKE) });
  go.disabled = need || STAKE <= 0 || STAKE > A.wallet();
  pile(max ? Math.max(1, Math.round(BILLS_MAX * STAKE / max)) : 0, quiet);
}
function pile (n, quiet) {
  const box = depBox().querySelector('.dep-pile');
  const have = box.querySelectorAll('i:not(.gone)');
  if (have.length < n) {
    for (let k = have.length; k < n; k++) {
      const b = document.createElement('i');
      const row = Math.floor(k / 6), col = k % 6;
      b.style.left = (6 + col * 14 + (row % 2) * 6 + (Math.random() * 6 - 3)) + '%';
      b.style.bottom = (4 + row * 9 + Math.random() * 3) + '%';
      b.style.setProperty('--r', (Math.random() * 40 - 20).toFixed(0) + 'deg');
      b.style.animationDelay = quiet ? '0s' : ((k - have.length) * 0.035).toFixed(3) + 's';
      b.textContent = '₽';
      box.appendChild(b);
    }
    if (!quiet) A.Snd.blip(520 + n * 12, 0.04, 'square', 0.05);
  } else for (let k = have.length - 1; k >= n; k--) { const b = have[k]; b.classList.add('gone'); setTimeout(() => b.remove(), 300); }
}

/* ── прокрутка: исход решается сразу, анимация его только показывает ── */
function spin () {
  const md = depBox();
  const st = Math.min(STAKE, stepDown(A.wallet()));
  if (SH.slot || st <= 0 || (GAME !== 'slot' && !PICK)) return;
  SH.slot = true; SPINNING = true;
  DEP_SESSION++;
  const cfg = ECON.SLOT[GAME] || {};
  // исход — в heroquests.js: совет Лёхи (± к удаче), в теннисе — «наоборот» Игорька
  const R = HQ.roll({ game: GAME, pick: PICK, base: cfg.win != null ? cfg.win : ECON.SLOT.WIN, first: ECON.SLOT.FIRST_WIN && DEP_SESSION === 1 });
  const win = R.win;
  A.addWallet(-st);
  const allIn = stepDown(A.wallet()) <= 0;        // поставил всё — для достижения ALL_IN (achievements.js)
  A.Store.flush();
  refreshWallet();
  md.classList.add('spun');                       // купюры уезжают в игру
  md.querySelectorAll('.dep-stake button, .dep-quick button, .dep-go').forEach(b => { b.disabled = true; });
  md.querySelector('input').disabled = true;
  md.querySelector('.dep-sum span').textContent = t('из кошелька −{money} · останется {left}', { money: A.money(st), left: A.money(A.wallet()) });
  A.Snd.blip(220, 0.12, 'square', 0.08);
  const finish = (txt) => {
    ACH.dep(win, allIn);                          // проиграл всё — «Всё на красное» (после анимации, не раньше)
    const res = md.querySelector('.dep-res');
    const heroTxt = HQ.verdict(R).map(s => '<br><span class="dep-hq">' + esc(s) + '</span>').join('');   // «Лёха был прав!» / «Лёха опять слил»
    md.querySelector('.dep-pile').innerHTML = '';
    if (win) {
      const prize = st * gameMul(GAME);
      A.addWallet(prize);
      A.Store.flush();
      res.innerHTML = esc(txt) + '<br>' + esc(t('×{k}! +{money}', { k: gameMul(GAME), money: A.money(prize - st) })) + heroTxt;
      res.className = 'dep-res win';
      md.classList.remove('spun');
      pile(BILLS_MAX, false);                      // выигрыш — полная куча обратно
      [0, 1, 2].forEach(i => setTimeout(() => A.Snd.coin(), i * 160));
      md.querySelector('.dep-sum b').textContent = '+' + A.money(prize);
    } else {
      res.innerHTML = esc(txt) + '<br>' + esc(t('мимо · −{money}', { money: A.money(st) })) + heroTxt;
      res.className = 'dep-res lose';
      A.Snd.fail && A.Snd.fail();
    }
    md.querySelector('.dep-sum span').textContent = t('в кошельке {money}', { money: A.money(A.wallet()) });
    SPINNING = false;
    const go = md.querySelector('.dep-go');
    go.textContent = t('пора на работу'); go.disabled = false;
    const again = md.querySelector('.dep-again');
    again.textContent = t('крутить ещё'); again.hidden = stepDown(A.wallet()) <= 0;
    refreshWallet(); refreshTabs();
  };
  if (GAME === 'roulette') spinWheel(md, win, finish);
  else if (GAME === 'tennis') playMatch(md, win, finish, R.champ);
  else spinReels(md, win, finish);
}
function spinReels (md, win, finish) {
  let out;
  if (win) out = [0, 0, 0];
  else { do out = [0, 1, 2].map(() => (Math.random() * SYM.length) | 0); while (out[0] === out[1] && out[1] === out[2]); }
  const strips = [...md.querySelectorAll('.cr-strip')];
  const fill = (el, last) => { let h = ''; for (let i = 0; i < 29; i++) h += cell((Math.random() * SYM.length) | 0); el.innerHTML = h + cell(last); };
  strips.forEach((el, i) => { fill(el, out[i]); el.style.transform = 'translateY(0)'; delete el.dataset.stopped; });
  const H = strips[0].firstChild ? strips[0].firstChild.getBoundingClientRect().height || 56 : 56;
  const t0 = performance.now(), STOP = [1300, 1900, 2600];
  let tickN = 0;
  const anim = now => {
    const e = now - t0;
    let all = true;
    strips.forEach((el, i) => {
      const k = Math.min(1, e / STOP[i]);
      if (k < 1) all = false;
      el.style.transform = 'translateY(' + (-(1 - (1 - k) ** 3) * 29 * H).toFixed(1) + 'px)';
      if (k >= 1 && !el.dataset.stopped) { el.dataset.stopped = '1'; A.Snd.blip(420 + i * 120, 0.09, 'square', 0.1); }
    });
    if (((e / 90) | 0) > tickN) { tickN = (e / 90) | 0; if (!all) A.Snd.blip(900 + (tickN % 3) * 60, 0.02, 'square', 0.03); }
    if (!all) requestAnimationFrame(anim);
    else finish(win ? t('три семёрки!') : t('не сошлось'));
  };
  requestAnimationFrame(anim);
}
/* колесо: выигрыш — сектор выбранного цвета, проигрыш — другого или зеро */
function spinWheel (md, win, finish) {
  const other = PICK === 'red' ? 'black' : 'red';
  const want = win ? PICK : (Math.random() < 1 / 19 ? 'zero' : other);
  const cand = [];
  for (let i = 0; i < WHEEL_N; i++) if (wheelColor(i) === want) cand.push(i);
  const i = cand[(Math.random() * cand.length) | 0], seg = 360 / WHEEL_N;
  // указатель сверху: сектор i встаёт под него, если колесо повернуть на −(середина сектора)
  const deg = 360 * 6 - (i + 0.5) * seg;
  const w = md.querySelector('.dep-wheel');
  w.style.transition = 'none'; w.style.transform = 'rotate(0deg)';
  void w.offsetWidth;
  w.style.transition = 'transform 3.2s cubic-bezier(.12, .7, .15, 1)';
  w.style.transform = 'rotate(' + deg + 'deg)';
  let n = 0;
  const tick = setInterval(() => { A.Snd.blip(1000 - n * 20, 0.015, 'square', 0.03); if (++n > 34) clearInterval(tick); }, 90);
  setTimeout(() => {
    clearInterval(tick);
    const name = { red: t('красное'), black: t('чёрное'), zero: t('зеро') }[want];
    finish(t('выпало: {what}', { what: name }));
  }, 3350);
}
/* матч: мячик летает по корту, счёт тикает; побеждает выбранный (выигрыш) или другой */
function playMatch (md, win, finish, champId) {
  const others = TENNIS.filter(p => p.id !== PICK);
  const champ = TENNIS.find(p => p.id === champId) || (win ? TENNIS.find(p => p.id === PICK) : others[(Math.random() * others.length) | 0]);
  const court = md.querySelector('.dep-court'), score = md.querySelector('.dep-score');
  court.classList.add('play');
  let a = 0, b = 0, k = 0;
  const iv = setInterval(() => {
    if (Math.random() < 0.5) a++; else b++;
    score.textContent = Math.min(6, a) + ' : ' + Math.min(6, b);
    A.Snd.blip(k % 2 ? 380 : 520, 0.03, 'square', 0.05);
    k++;
  }, 260);
  setTimeout(() => {
    clearInterval(iv);
    court.classList.remove('play');
    score.textContent = '6 : ' + (2 + ((Math.random() * 3) | 0));
    md.querySelectorAll('.dep-pl').forEach(q => q.classList.toggle('champ', q.dataset.p === champ.id));
    finish(champ.fem ? t('матч выиграла {who}', { who: t(champ.name) }) : t('матч выиграл {who}', { who: t(champ.name) }));
  }, 2900);
}

/* отладка: __dlv.CAREERM.skipTo(13.9) — к обеду, skipTo(23.95) — к полуночи */
const DEBUG = {
  get SH () { return SH; }, shiftSlow, pace, DIST: DIST.DEBUG, stars, addStars, hour, isEvening, clockText, shiftOn, phase, onShiftStart, onShiftEnd, startShift, showEnd, clientKilled,
  hasOrders: () => !!(ORD && ORD.staffRide), hasCars: () => !!carsApi(),
  // перемотка за обед — обед считается прошедшим (иначе он всплывает в любом пресете песочницы)
  // h — по расписанию смены (9…24): в круглосуточной смене с ночи «23,9» — это тоже «почти конец смены»
  schedHour, allDay, districtNext, shiftLeft,
  skipTo (h) { if (A) { A.env().t = SH.on ? (SH.tStart + ECON.tOfHour(h) - ECON.SHIFT.T0) % 1 : ECON.tOfHour(h); if (h > ECON.SHIFT.LUNCH_H + 0.05) SH.lunch = true; else if (h < ECON.SHIFT.LUNCH_H) SH.lunch = false; } },
  useCars (api) { CARS_MOCK = api || null; },
  crewBoard, crewLoad: () => (A ? crewLoad() : null), openDep, closeDep, openGarage, closeGarage: GARAGE.close, garageFlip: GARAGE.flip, openSpend, menu, askName, back,
};
