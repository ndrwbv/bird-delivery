/* ──────────────────────────────────────────────────────────────────────────
   Достижения (docs/STEAM.md → «Достижения»). Одна таблица на Стим и (потом) Game Center.

   Как работает:
     • счётчики за всё время (stat) — копятся здесь, в сохранении KEY (dlv-ach): заказы, смены,
       сбитые прохожие, фонари… Сброс прогресса их НЕ стирает (как и достижения в Стиме);
     • достижение получено, когда счётчик дошёл до need. Получено — навсегда: запись в got
       и вызов Platform.steam.achievement(id) (мост в Steamworks, docs/STEAM.md §4);
     • в Стиме всплывашку рисует сам Стим; без Стима (браузер, Яндекс, Стим без App ID) —
       своя маленькая плашка снизу слева на 4 с, не перекрывает хад и не ловит клики;
     • adult — только во взрослой версии (ADULT): в детской счётчик копится, а достижение
       не выдаётся (переключил на взрослую — выдастся на следующем событии);
     • при запуске всё полученное раньше ещё раз отправляем в Стим (вдруг тогда Стима не было).

   Откуда события (точечные хуки):
     game.js  — deliver() при вручении (checkArrival), over() в gameOver, add('mafia'|'moose'|
                'rivals'|'errands'), init + step в кадре;
     career.js — shiftEnd через CAREERM.onShiftEnd (mood — оценка Толика), dep() в «депнуть»;
     сами опрашиваем (step, раз в 0,5 с): S.people / S.scoots / S.stops, фонари (SL.STATS.down),
       машину (AUTO.current, заглохла ли и где), районы (DIST.opened), сюжет бабы Зины.
     «Весь город открыт» — cityOpen(): сами видим по DIST.opened() ≥ DIST.count(); праздник
       «ты открыл весь город» (если появится) может звать ACH.cityOpen() — повтор безвреден.
   ────────────────────────────────────────────────────────────────────────── */
import Platform from '../platform/index.js';
import { t, N_ } from '../i18n/index.js';
import * as DIST from './districts.js';
import * as AUTO from './cars.js';
import * as SL from './streetlamps.js';
import * as STORY from './story.js';
import { HERO } from './heroes.js';                // HERO.STORY — сюжет героев в архиве (10.10.2026)
import * as RQ from './ridequeue.js';               // плашка достижения — после чека, Толика и подсказки (ridequeue.js)

export const KEY = 'dlv-ach';

/* Таблица. id — API Name в Steamworks (латиница, как в админке). stat/need — счётчик и порог.
   group: progress / skill / chaos / fun. hidden — «скрытое» в Стиме (описание видно после получения). */
export const LIST = [
  // ── прогресс ──
  { id: 'FIRST_ORDER', group: 'progress', stat: 'orders', need: 1, name: N_('Первая пицца'), desc: N_('Доставить первый заказ') },
  { id: 'ORDERS_10', group: 'progress', stat: 'orders', need: 10, name: N_('Втянулся'), desc: N_('Доставить 10 заказов') },
  { id: 'ORDERS_100', group: 'progress', stat: 'orders', need: 100, name: N_('Сотка'), desc: N_('Доставить 100 заказов') },
  { id: 'ORDERS_1000', group: 'progress', stat: 'orders', need: 1000, name: N_('Тысяча и одна пицца'), desc: N_('Доставить 1000 заказов') },
  { id: 'SHIFT_FULL', group: 'progress', stat: 'fullShifts', need: 1, name: N_('Смена закрыта'), desc: N_('Отработать смену до конца') },
  { id: 'SHIFTS_10', group: 'progress', stat: 'shifts', need: 10, name: N_('Свой человек'), desc: N_('Отработать 10 смен') },
  { id: 'SHIFTS_50', group: 'progress', stat: 'shifts', need: 50, name: N_('Старожил'), desc: N_('Отработать 50 смен') },
  { id: 'DISTRICT_2', group: 'progress', stat: 'districts', need: 2, name: N_('Новый район'), desc: N_('Открыть второй район') },
  { id: 'CITY_OPEN', group: 'progress', stat: 'city', need: 1, name: N_('Весь Солнечный'), desc: N_('Открыть все районы города') },
  // ── мастерство ──
  { id: 'PERFECT_SHIFT', group: 'skill', stat: 'perfect', need: 1, name: N_('Минута в минуту'), desc: N_('Отработать смену до конца без единого опоздания (от 5 заказов)') },
  { id: 'CLEAN_SHIFT', group: 'skill', stat: 'clean', need: 1, name: N_('Ни царапины'), desc: N_('Отработать смену до конца без единого удара') },
  { id: 'LIGHTNING', group: 'skill', stat: 'lightning', need: 1, name: N_('Молния'), desc: N_('Доставить заказ, когда осталось 90 % срока') },
  { id: 'BUNDLE_5', group: 'skill', stat: 'bundle5', need: 1, name: N_('Пять адресов'), desc: N_('Развезти сборный заказ на 5 адресов — все вовремя') },
  { id: 'URGENT', group: 'skill', stat: 'urgent', need: 1, name: N_('Горит!'), desc: N_('Успеть со срочным заказом') },
  { id: 'NIGHT_ORDER', group: 'skill', stat: 'night', need: 1, name: N_('Ночной курьер'), desc: N_('Доставить заказ между полуночью и пятью утра') },
  { id: 'ERRANDS_10', group: 'skill', stat: 'errands', need: 10, name: N_('На побегушках'), desc: N_('Выполнить 10 поручений клиентов') },
  // ── хаос ──
  { id: 'PEDS_1', group: 'chaos', stat: 'peds', need: 1, adult: true, name: N_('Пешеход, вы не правы'), desc: N_('Сбить прохожего') },
  { id: 'PEDS_100', group: 'chaos', stat: 'peds', need: 100, adult: true, name: N_('Гроза тротуаров'), desc: N_('Сбить 100 прохожих') },
  { id: 'SCOOTERS_10', group: 'chaos', stat: 'scoots', need: 10, adult: true, name: N_('Самокатный вопрос'), desc: N_('Сбить 10 самокатчиков') },
  { id: 'MAFIA_3', group: 'chaos', stat: 'mafia', need: 3, adult: true, name: N_('Предложение, от которого не отказываются'), desc: N_('Сбить троих мафиози') },
  { id: 'RIVALS_5', group: 'chaos', stat: 'rivals', need: 5, name: N_('Здоровая конкуренция'), desc: N_('Выбить 5 курьеров-конкурентов') },
  { id: 'LAMPS_100', group: 'chaos', stat: 'lamps', need: 100, name: N_('Света нет'), desc: N_('Снести 100 фонарей') },
  { id: 'STOPS_10', group: 'chaos', stat: 'stops', need: 10, name: N_('Остановка по требованию'), desc: N_('Снести 10 остановок') },
  { id: 'CAR_BOOM', group: 'chaos', stat: 'boom', need: 1, hidden: true, name: N_('Пицца с дымком'), desc: N_('Взорвать свою машину') },
  // ── смешные ──
  { id: 'MOOSE', group: 'fun', stat: 'moose', need: 1, name: N_('Лось не уступил'), desc: N_('Врезаться в лося') },
  { id: 'DROWNED', group: 'fun', stat: 'drowned', need: 1, hidden: true, name: N_('Подводная доставка'), desc: N_('Утопить машину') },
  { id: 'POTHOLE', group: 'fun', stat: 'pothole', need: 1, name: N_('Яма с историей'), desc: N_('Заглохнуть в яме') },
  { id: 'SEMERKA_50', group: 'fun', stat: 'semerka', need: 50, name: N_('Верность Семёрке'), desc: N_('Доставить 50 заказов на «Семёрке»') },
  { id: 'BUHANKA_20', group: 'fun', stat: 'buhanka', need: 20, name: N_('Хлебовоз'), desc: N_('Доставить 20 заказов на «Буханке»') },
  { id: 'ALL_IN', group: 'fun', stat: 'allin', need: 1, hidden: true, name: N_('Всё на красное'), desc: N_('Депнуть всю копилку и проиграть') },
  { id: 'TOLIK_MDAA', group: 'fun', stat: 'mdaa', need: 1, name: N_('Мдаа'), desc: N_('Услышать от Толика «мдаа» в конце смены') },
  // в архиве, автор 10.10.2026: сюжет героев убран (heroes.js HERO.STORY) — глав бабы Зины нет, достижение спрятано
  // (story: true — только при HERO.STORY; уже полученное остаётся в сохранении и в Стиме, на доске почёта — видно)
  { id: 'ZINA', group: 'fun', stat: 'zina', need: 1, story: true, name: N_('Для внука'), desc: N_('Пройти историю бабы Зины до конца') },
];
const BY_ID = new Map(LIST.map(a => [a.id, a]));

let A = { adult: true, career: false, S: null, hour: null };
let D = null;                       // { got: { id: ts }, n: { stat: число } }
let dirty = false, saveT = 0, pollT = 0, synced = false;
const LAST = {};                    // прошлые значения опрашиваемых счётчиков (сброс на смене — не минус)
const SH = { late: 0, n: 0 };       // эта смена: опозданий, доставок
const SENT = [];                    // что отправили в Стим (для проверки: __dlv.ACH.DEBUG.sent)
let stallWas = false;

function load () {
  if (D) return D;
  let v = null;
  try { v = Platform.store.get(KEY); } catch (e) { v = null; }
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
  D = v && typeof v === 'object' ? v : {};
  if (!D.got || typeof D.got !== 'object') D.got = {};
  if (!D.n || typeof D.n !== 'object') D.n = {};
  return D;
}
function save () {
  dirty = false; saveT = 0;
  try { Platform.store.set(KEY, load()); } catch (e) { console.warn('[ach] save', e); }
}

/* в Стим: мост вызывается и тогда, когда Стима нет (там заглушка), — так проверяется в probe */
function send (id) {
  const sw = Platform.steam;
  SENT.push(id);
  if (!sw || typeof sw.achievement !== 'function') return;
  try { const r = sw.achievement(id); if (r && typeof r.catch === 'function') r.catch(() => {}); } catch (e) { console.warn('[ach] steam', e); }
}

/* своя плашка — только без Стима. Маленькая «грамота» сверху по центру (на телефоне — между часами и
   радаром), не на радаре и не на руле (UI-REVIEW № 30). В езде — после чека оплаты, денег в пачку,
   Толика и подсказки (ridequeue.js whenQuiet): одна вещь за раз; одно короткое проявление, без тряски */
let TOAST = null, toastQ = [], toastOn = false;
function chip (a) {
  if (typeof document === 'undefined') return;
  if (!TOAST) {
    const st = document.createElement('style');
    st.textContent = '#ach-toast{position:fixed;left:50%;top:46px;z-index:60;pointer-events:none;display:flex;gap:8px;align-items:center;'
      + 'max-width:min(320px,calc(100vw - 24px));padding:6px 10px;border:2px solid #33210c;border-radius:3px;background:#fff3d6;color:#33210c;'
      + 'font:12px/1.3 inherit;box-shadow:0 4px 0 #33210c;opacity:0;transform:translate(-50%,-8px);transition:opacity .25s,transform .25s}'
      + '#ach-toast.on{opacity:1;transform:translate(-50%,0)}#ach-toast i{flex:none;width:18px;height:18px;border-radius:50%;border:2px solid #33210c;background:radial-gradient(circle at 35% 35%,#ffe58a,#e0a21a 60%,#9c6a08)}'
      + '#ach-toast small{display:block;color:#8a3b22;font-size:11px;text-transform:lowercase}#ach-toast b{font-weight:normal}'
      // доска почёта открыта — плашку не показываем: ложилась на её ярлычок «достижения», а грамота и так на доске
      + 'body:has(#honor:not([hidden])) #ach-toast{display:none}'
      // пауза открылась, пока плашка висит, — прячем (поверх паузы не нужна)
      + 'body:has(#pausem:not([hidden])) #ach-toast{display:none}'
      // телефон стоя: справа под радаром (слева — деньги с подписями); там же чат Толика — плашка ждёт, пока он уйдёт
      + '@media (max-width:560px){#ach-toast{left:auto;right:16px;top:116px;max-width:min(170px,44vw);transform:translateY(-8px);font-size:10px;padding:5px 7px}'
      + '#ach-toast.on{transform:none}#ach-toast small{font-size:10px}'
      // чек смены на телефоне: под радаром (116 px) плашка закрывала шапку чека «ЧЕК СМЕНЫ · № 0004» — радара там нет, плашку выше
      + 'body:has(#over:not([hidden])) #ach-toast{top:max(8px,env(safe-area-inset-top))}}';
    document.head.appendChild(st);
    TOAST = document.createElement('div');
    TOAST.id = 'ach-toast';
    document.body.appendChild(TOAST);
  }
  toastQ.push(a);
  if (!toastOn) { toastOn = true; RQ.whenQuiet(nextChip, 20000, chatGone); }
}
/* на узком экране плашка там же, где чат Толика (под радаром) — ждём, пока его сообщения уйдут */
// и не поверх паузы (автор 10.10.2026: «Ни царапины» висела поверх паузы) — ждёт, пока игру снимут с паузы, и показывается один раз
const chatGone = () => !(A && A.S && A.S.paused) && (innerWidth > 560 || !document.querySelector('#chat .cm:not(.out)'));
function nextChip () {
  if (A && A.S && A.S.paused) { setTimeout(nextChip, 400); return; }   // пауза — ждём, не поверх неё
  const a = toastQ.shift();
  if (!a) { toastOn = false; return; }
  toastOn = true;
  TOAST.innerHTML = '<i></i><div><small></small><b></b></div>';
  TOAST.querySelector('small').textContent = t('достижение');
  TOAST.querySelector('b').textContent = t(a.name);
  requestAnimationFrame(() => TOAST.classList.add('on'));
  RQ.hold(4300);                                   // пока плашка висит — следующая подсказка ждёт (ridequeue.js)
  setTimeout(() => { TOAST.classList.remove('on'); setTimeout(() => RQ.whenQuiet(nextChip, 20000, chatGone), 350); }, 4000);
}

function grant (a) {
  const d = load();
  if (d.got[a.id]) return false;
  if (a.adult && !A.adult) return false;
  d.got[a.id] = Date.now();
  save();
  send(a.id);
  if (!(Platform.steam && Platform.steam.available)) chip(a);
  return true;
}
/* проверить всё, что висит на этом счётчике */
function check (stat) {
  const v = load().n[stat] || 0;
  for (const a of LIST) if (a.stat === stat && v >= a.need) grant(a);
}

/** +n к счётчику за всё время */
export function add (stat, n = 1) {
  if (!(n > 0)) return;
  const d = load();
  d.n[stat] = (d.n[stat] || 0) + n;
  dirty = true;
  check(stat);
}
/** счётчик = max(старое, v) — для «сколько районов открыто» */
export function setMax (stat, v) {
  const d = load();
  if (!(v > (d.n[stat] || 0))) return;
  d.n[stat] = v;
  dirty = true;
  check(stat);
}
/** выдать по id (отладка и разовые события) */
export function unlock (id) { const a = BY_ID.get(id); return a ? grant(a) : false; }
/** «весь город открыт» — праздник может звать сам; повтор безвреден */
export function cityOpen () { setMax('city', 1); }

/* ── хуки из игры ── */
/** game.js: { career, adult, S, hour: () => час игры } */
export function init (api = {}) {
  A = { ...A, ...api };
  load();
  // всё полученное раньше — ещё раз в Стим (Стима могло не быть); через 3 с, когда мост поднялся
  if (!synced) {
    synced = true;
    setTimeout(() => { for (const id in load().got) if (BY_ID.has(id) && !(BY_ID.get(id).adult && !A.adult)) send(id); }, 3000);
  }
  // переключили на взрослую — выдать то, что уже набрано
  for (const s of new Set(LIST.map(a => a.stat))) check(s);
}

/** game.js checkArrival: вручили на одном адресе.
    o: { n — пицц на адресе, onTime, left — доля срока 0…1, free — без срока, last — последний адрес заказа,
         stops — адресов в заказе, bundle, allOnTime — все адреса вовремя, urgent } */
export function deliver (o = {}) {
  const n = Math.max(1, o.n | 0);
  add('orders', n);
  SH.n += n;
  if (!o.onTime) SH.late++;
  if (o.onTime && !o.free && o.left >= 0.9) add('lightning');
  if (o.last && o.bundle && o.stops >= 5 && o.allOnTime) add('bundle5');
  if (o.urgent && o.onTime) add('urgent');
  const h = A.hour ? A.hour() : NaN;
  if (Number.isFinite(h)) { const hh = ((h % 24) + 24) % 24; if (hh < 5) add('night'); }
  if (A.career) {
    let id = '';
    try { id = AUTO.current().id; } catch (e) { id = ''; }
    if (id === 'semerka') add('semerka', n);
    else if (id === 'buhanka') add('buhanka', n);
  }
}
/** career.js onShiftStart */
export function shiftStart () { SH.late = 0; SH.n = 0; }
/** career.js onShiftEnd: { why, delivered, hits, full, mood } */
export function shiftEnd (e = {}) {
  add('shifts');
  if (e.full && (e.delivered || 0) > 0) {        // до полуночи и хоть один заказ (просто простоять смену — не в счёт)
    add('fullShifts');
    if (!SH.late && (e.delivered || 0) >= 5) add('perfect');
    if (e.hits === 0 && (e.delivered || 0) > 0) add('clean');
  }
  if (e.mood === 'bad') add('mdaa');
  SH.late = 0; SH.n = 0;
  poll();
  save();
}
/** game.js gameOver(why) */
export function over (why) {
  if (why === 'машина всё') add('boom');
  else if (why === 'утонул') add('drowned');
}
/** career.js «депнуть»: проиграл, поставив всё (в кошельке не осталось и шага ставки) */
export function dep (win, allIn) { if (!win && allIn) add('allin'); }

/* опрос: счётчики игры, что сбрасываются на новой смене, — копим только прирост */
function delta (k, v) {
  v = +v || 0;
  if (LAST[k] === undefined || v < LAST[k]) { LAST[k] = v; return; }
  if (v > LAST[k]) { add(k, v - LAST[k]); LAST[k] = v; }
}
function poll () {
  const S = A.S;
  if (S) { delta('peds', S.people); delta('scoots', S.scoots); delta('stops', S.stops); }
  delta('lamps', SL.STATS.down);
  if (!A.career) return;
  try {
    if (DIST.has()) {
      const o = DIST.opened();
      setMax('districts', o);
      if (o >= DIST.count()) cityOpen();
    }
  } catch (e) { /* районов нет */ }
  try {
    const z = STORY.progress().zina, s = STORY.STORIES.find(q => q.id === 'zina');
    if (z && s && z.ch >= s.chapters.length) setMax('zina', 1);
  } catch (e) { /* сюжета нет */ }
}

/** каждый кадр (game.js, CL.step): опрос раз в 0,5 с, сохранение счётчиков раз в 5 с */
export function step (dt) {
  // заглохла в яме — по фронту «заглохла»
  if (A.career) {
    let on = false;
    try { on = AUTO.stalled(); } catch (e) { on = false; }
    if (on && !stallWas) { let why = ''; try { why = AUTO.stallInfo().why; } catch (e) { why = ''; } if (why === 'pothole') add('pothole'); }
    stallWas = on;
  }
  if ((pollT += dt) >= 0.5) { pollT = 0; poll(); }
  if (dirty && (saveT += dt) >= 5) save();
}

/* ── для __dlv.ACH ── */
export function stats () { return { ...load().n }; }
export function got () { return Object.keys(load().got); }
export function list () {
  const d = load();
  return LIST.filter(a => !a.story || HERO.STORY || d.got[a.id]).map(a => ({ id: a.id, name: t(a.name), got: !!d.got[a.id], at: d.got[a.id] || 0, have: Math.min(d.n[a.stat] || 0, a.need), need: a.need, adult: !!a.adult, hidden: !!a.hidden }));
}
/* доска почёта (honor.js): какие полученные игрок ещё не видел на доске — они «прилетают» при открытии.
   Отметка — в том же сохранении (dlv-ach, общее на устройство, сброс прогресса не стирает) */
export function unseen () {
  const d = load(), s = d.seen || {};
  return Object.keys(d.got).filter(id => BY_ID.has(id) && !s[id]);
}
export function markSeen () {
  const d = load();
  d.seen = d.seen && typeof d.seen === 'object' ? d.seen : {};
  let ch = false;
  for (const id in d.got) if (!d.seen[id]) { d.seen[id] = 1; ch = true; }
  if (ch) save();
}
export const DEBUG = {
  LIST, SH, LAST, sent: SENT, stats, got, list, unlock, add, cityOpen, unseen, markSeen,
  get platform () { return Platform; },
  /** стереть только локальную запись (в Стиме — Platform.steam.clearAchievement руками) */
  wipe () { D = { got: {}, n: {}, seen: {} }; for (const k in LAST) delete LAST[k]; save(); },
};
