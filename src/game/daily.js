/* Задания на день (10.10.2026; правила словами — docs/CAREER.md «Задания на день», числа — econ.js DAILY).
   Автор: «должны быть дейли задания — типа отвезти несколько заказов сразу, или отвезти и не сбить клиента,
   или не сбить никого по пути, или не поцарапать машину. Выполняешь — получаешь деньги».

   На смену карьеры — 2—3 задания из набора, не те, что были в прошлую смену (сохранение dlv-daily-last);
   первая смена новичка — без заданий. Выполнил — галочка, звук task-done и плашка «+N ₽» сверху по центру
   (в очереди ridequeue.js — после чека оплаты, денег и Толика), деньги — купюрами в пачку «за смену».
   Где видно: в начале смены — записка сверху (сама уходит через 7 с, не окно), в паузе — список с галочками
   (записка под накладной, pauseSheet), в чеке смены — строка «задания: 2 из 3 ··· +N ₽» (career.js endRows).

     DAILY.init(api)            — из game.js: { S, Snd, money, addWallet, nos: () => горит ли кофе, shiftOn }
     DAILY.shiftStart({ n })    — смена началась (career.js onShiftStart): n — какая по счёту
     DAILY.step(dt)             — каждый кадр: удары, сбитые, кофе; записка в начале смены
     DAILY.deliver({ o, st, onTime, tier, last }) — отдал адрес (game.js checkArrival, рядом с ACH.deliver)
     DAILY.pauseSheet(after)    — пауза: записка «задания на день» с галочками под накладной (after — #pm-order)
     DAILY.endRow()             — строка чека смены или null; DAILY.earned() — сколько пришло за задания
   В отладке — __dlv.DAILY: D (состояние), set(['bundle', …]), done(id). */
import './daily.css';
import * as ECON from './econ.js';
import * as RQ from './ridequeue.js';
import * as QR from './quickrun.js';
import * as DIST from './districts.js';
import { t, tn } from '../i18n/index.js';

/* что срывает «подряд»: удар по машине, задел клиента, сбил кого-то, кофе, опоздал */
const FAIL = { gentle: 'bump', nokill: 'kill', noscratch: 'hit', nocoffee: 'nos', ontime: 'late' };
const LAST_KEY = 'dlv-daily-last';
/* подписи — как задание звучит игроку */
const LABEL = {
  bundle: () => t('сборный заказ — все адреса вовремя'),
  gentle: n => tn(n, '{n} заказ подряд — не задев клиента|{n} заказа подряд — не задев клиента|{n} заказов подряд — не задев клиента'),
  nokill: n => (n <= 1 ? t('заказ — никого не сбив по пути')
    : tn(n, '{n} заказ подряд — никого не сбив|{n} заказа подряд — никого не сбив|{n} заказов подряд — никого не сбив')),
  noscratch: n => tn(n, '{n} заказ подряд — без единого удара|{n} заказа подряд — без единого удара|{n} заказов подряд — без единого удара'),
  nocoffee: n => tn(n, '{n} заказ подряд — без кофе|{n} заказа подряд — без кофе|{n} заказов подряд — без кофе'),
  ontime: n => tn(n, '{n} заказ подряд — вовремя|{n} заказа подряд — все вовремя|{n} заказов подряд — все вовремя'),
  fast: n => tn(n, '«А ты харош!» {n} раз — за полсрока|«А ты харош!» {n} раза — за полсрока|«А ты харош!» {n} раз — за полсрока'),
};

let A = null;
const D = { list: [], earned: 0, cur: { o: null, dirty: {} }, hurt: 0, ppl: 0, noted: false, waitT: 0, len: 0 };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const label = q => (LABEL[q.id] ? LABEL[q.id](q.n) : q.id);

export function init (api) {
  A = api;
  setTimeout(() => { if (window.__dlv) window.__dlv.DAILY = DEBUG; }, 0);
}

/* ── смена началась: выбрать задания ── */
export function shiftStart ({ n = 1 } = {}) {
  hideNote();
  D.list = []; D.earned = 0; D.cur = { o: null, dirty: {} }; D.noted = false; D.waitT = 0;
  if (!A) return;
  const S = A.S;
  D.hurt = S.hurt || 0; D.ppl = (S.people || 0) + (S.scoots || 0);
  if (QR.on()) return;                                  // быстрый заезд — без заданий
  const count = ECON.dailyCount(n);
  if (!count) return;
  const len = ECON.shiftLen(Math.max(0, n - 1)).id;
  D.len = len === 'short' ? 0 : len === 'medium' ? 1 : 2;
  let last = [];
  try { const v = A.Store.get(LAST_KEY, []); last = Array.isArray(v) ? v : String(v || '').split(' '); } catch (e) { /* — */ }
  const ids = Object.keys(ECON.DAILY.TASKS);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const fresh = shuffle(ids.filter(id => !last.includes(id))), old = shuffle(ids.filter(id => last.includes(id)));
  set(fresh.concat(old).slice(0, count));
  A.Store.set(LAST_KEY, D.list.map(q => q.id));
}
function set (ids) {
  const payK = DIST.has() ? DIST.pay() : 1;
  D.list = ids.filter(id => ECON.DAILY.TASKS[id]).map(id => {
    const T = ECON.DAILY.TASKS[id];
    return { id, n: Math.max(1, T.n[D.len] || T.n[0] || 1), got: 0, done: false, pay: ECON.dailyPay(id, payK) };
  });
}

/* сорвалось «подряд»: счёт заново; этот заказ уже не в зачёт */
function fail (key) {
  D.cur.dirty[key] = 1;
  for (const q of D.list) if (!q.done && FAIL[q.id] === key) q.got = 0;
}
function inc (id) {
  const q = D.list.find(x => x.id === id);
  if (!q || q.done) return;
  q.got++;
  if (q.got >= q.n) complete(q);
}
function complete (q) {
  q.done = true; q.got = q.n;
  const S = A.S;
  S.money = (S.money || 0) + q.pay;                    // купюрами в пачку «за смену» (shiftcash.js следит за S.money)
  if (!S.freeRun) A.addWallet(q.pay);
  D.earned += q.pay;
  POP.push(q);
  if (!popOn) { popOn = true; RQ.whenQuiet(nextPop, 20000, () => !A.S.paused); }
}

/* ── каждый кадр смены ── */
export function step (dt) {
  if (!A || !D.list.length || !(A.shiftOn && A.shiftOn())) return;
  const S = A.S;
  if (S.paused) return;
  if (S.order && S.order !== D.cur.o) D.cur = { o: S.order, dirty: {} };   // новый заказ: «по пути» — с этого момента
  const hu = S.hurt || 0;
  if (hu > D.hurt + 0.05) fail('hit');                 // удар по машине (game.js hurtCar: S.hurt → 0,9), как career.js SH.hits
  D.hurt = hu;
  const p = (S.people || 0) + (S.scoots || 0);
  if (p > D.ppl) fail('kill');                         // сбил прохожего или самокатчика
  D.ppl = p;
  if (A.nos && A.nos()) fail('nos');                   // жмёт кофе
  // записка в начале смены: когда поехал с первым заказом и на экране тихо
  if (!D.noted && S.state === 'drive' && S.order) {
    D.waitT += dt;
    if (D.waitT > 1.2 && RQ.quiet()) showNote();
  }
}

/* ── отдал адрес ── */
export function deliver ({ o, st, onTime, tier, last } = {}) {
  if (!A || !D.list.length || !o || !o.ord || o.tut || o.ord.type === 'staff' || o.ord.story) return;
  if (D.cur.o !== o) D.cur = { o, dirty: {} };
  if (st && st.bumped) fail('bump');
  if (!onTime) fail('late');
  if (onTime && tier === 2) inc('fast');
  if (!last) return;
  for (const q of D.list) if (FAIL[q.id] && !D.cur.dirty[FAIL[q.id]]) inc(q.id);
  if (o.ord.bundle && o.stops.length > 1 && o.stops.every(q => q.pay && !q.pay.late)) inc('bundle');
}

/* ── пауза: список с галочками — записка под накладной (after — #pm-order) ── */
export function pauseHTML () {
  if (!D.list.length) return '';
  return '<div class="dl-pz-t">' + esc(t('задания на день')) + '</div>' + D.list.map(q =>
    '<div class="dl-row' + (q.done ? ' done' : '') + '"><i class="dl-box"></i><span>' + esc(label(q)) +
    (q.n > 1 && !q.done ? ' <small>' + q.got + '/' + q.n + '</small>' : '') + '</span><b>+' + esc(A.money(q.pay)) + '</b></div>').join('');
}
export function pauseSheet (after) {
  if (typeof document === 'undefined' || !after || !after.parentNode) return;
  let el = document.getElementById('pm-daily');
  const html = pauseHTML();
  if (!el) { if (!html) return; el = document.createElement('div'); el.id = 'pm-daily'; }
  if (el.previousElementSibling !== after) after.after(el);
  el.hidden = !html;
  el.innerHTML = html;
}

/* ── чек смены: «задания: 2 из 3 ··· +N ₽» ── */
export function endRow () {
  if (!D.list.length) return null;
  const got = D.list.filter(q => q.done).length;
  return [t('задания: {got} из {all}', { got, all: D.list.length }), D.earned ? '+' + A.money(D.earned) : A.money(0), D.earned ? 'pp-plus' : 'cr-rc-no'];
}
export const earned = () => D.earned;

/* ── записка в начале смены (сверху, не окно: сама уходит) ── */
let NOTE = null, noteT = 0;
function showNote () {
  D.noted = true;
  if (typeof document === 'undefined') return;
  if (!NOTE) { NOTE = document.createElement('div'); NOTE.id = 'daily-note'; NOTE.className = 'pp-ride'; document.body.appendChild(NOTE); }
  NOTE.innerHTML = '<div class="dl-pz-t">' + esc(t('задания на день')) + '</div>' + D.list.map(q =>
    '<div class="dl-row"><i class="dl-box"></i><span>' + esc(label(q)) + '</span><b>+' + esc(A.money(q.pay)) + '</b></div>').join('');
  NOTE.hidden = false;
  requestAnimationFrame(() => NOTE && NOTE.classList.add('on'));
  RQ.mark('daily', true);                              // грамота достижения ждёт, пока записка уйдёт (то же место)
  clearTimeout(noteT);
  noteT = setTimeout(hideNote, 7000);
}
function hideNote () {
  clearTimeout(noteT);
  RQ.mark('daily', false);
  if (!NOTE) return;
  NOTE.classList.remove('on');
  setTimeout(() => { if (NOTE && !NOTE.classList.contains('on')) NOTE.hidden = true; }, 300);
}

/* ── выполнил: галочка, звук, «+N ₽» ── */
let POPEL = null, popOn = false;
const POP = [];
function nextPop () {
  if (A.S.paused) { setTimeout(nextPop, 400); return; }
  const q = POP.shift();
  if (!q) { popOn = false; return; }
  if (NOTE && NOTE.classList.contains('on')) hideNote();
  if (!POPEL) { POPEL = document.createElement('div'); POPEL.id = 'daily-pop'; POPEL.className = 'pp-ride'; document.body.appendChild(POPEL); }
  POPEL.innerHTML = '<i class="dl-box"></i><div><small>' + esc(t('задание выполнено')) + '</small><span>' + esc(label(q)) + '</span></div><b>+' + esc(A.money(q.pay)) + '</b>';
  POPEL.hidden = false;
  POPEL.classList.remove('on');
  requestAnimationFrame(() => POPEL && POPEL.classList.add('on'));
  // sfx-names: task-done
  try { A.Snd.fx('task-done', s => [784, 1046, 1568].forEach((f, i) => setTimeout(() => s.blip(f, i === 2 ? 0.22 : 0.09, 'triangle', 0.12), i * 80))); } catch (e) { /* — */ }
  RQ.hold(4300);
  setTimeout(() => { POPEL.classList.remove('on'); setTimeout(() => RQ.whenQuiet(nextPop, 20000, () => !A.S.paused), 350); }, 4000);
}

const DEBUG = {
  D, LABEL, label,
  set: ids => { set(ids); D.noted = true; return D.list; },
  start: n => { shiftStart({ n }); return D.list.map(q => q.id + ' ' + q.n + ' ' + q.pay); },
  done: id => { const q = D.list.find(x => x.id === id); if (q && !q.done) complete(q); return q; },
  note: showNote, pause: pauseHTML, row: endRow,
};
