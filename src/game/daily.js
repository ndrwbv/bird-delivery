/* Задания на день (10.10.2026; правила словами — docs/CAREER.md «Задания на день», числа — econ.js DAILY).
   Автор: «должны быть дейли задания — типа отвезти несколько заказов сразу, или отвезти и не сбить клиента,
   или не сбить никого по пути, или не поцарапать машину. Выполняешь — получаешь деньги».

   На смену карьеры — 1—3 задания из набора, не те, что были в прошлую смену (сохранение dlv-daily-last);
   смены 1—4 — без заданий, с 5-й — одно, с 8-й — два, с 12-й — три (econ.js DAILY.FROM / COUNT, автор 23.10.2026). Выполнил — галочка, звук task-done и плашка «+N ₽» сверху по центру
   (в общей очереди уведомлений notifyq.js — после чека оплаты, Толика и рейтинга), деньги — купюрами в пачку «за смену».
   Где видно: в начале смены — записка сверху (сама уходит через 7 с, не окно), в паузе — список с галочками
   (записка под накладной, pauseSheet), в чеке смены — строка «задания: 2 из 3 ··· +N ₽» (career.js endRows).

     DAILY.init(api)            — из game.js: { S, Snd, money, addWallet, nos: () => горит ли кофе, shiftOn }
     DAILY.shiftStart({ n })    — смена началась (career.js onShiftStart): n — какая по счёту
     DAILY.step(dt)             — каждый кадр: удары, сбитые, кофе; записка в начале смены
     DAILY.deliver({ o, st, onTime, tier, last }) — отдал адрес (game.js checkArrival, рядом с ACH.deliver)
     DAILY.pauseSheet(after)    — пауза: записка «задания на день» с галочками под накладной (after — #pm-order)
     DAILY.endRow()             — строка чека смены или null; DAILY.earned() — сколько пришло за задания
   «Угарные» (11.10.2026, wild в econ.js DAILY.TASKS): сбей прохожих, бургеров, взорви машины, снеси лавочки…
   Счёт — приростом счётчиков смены (havoc.js counts, S.wrecks) и событий tally(kind) из game.js / rivals.js /
   festivals.js (бургер, стайка голубей, самосвал); «за заказ» (per: 'order') — с той минуты, как взял заказ.
     DAILY.tally(kind)          — событие: 'burger' | 'pigeon' | 'dump'
   В отладке — __dlv.DAILY: D (состояние), set(['bundle', …]), done(id), tally(kind, n). */
import './daily.css';
import * as ECON from './econ.js';
import * as NQ from './notifyq.js';
import * as QR from './quickrun.js';
import * as DIST from './districts.js';
import * as HAV from './havoc.js';
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
  nocoffee: n => tn(n, '{n} заказ подряд — без нитро|{n} заказа подряд — без нитро|{n} заказов подряд — без нитро'),
  ontime: n => tn(n, '{n} заказ подряд — вовремя|{n} заказа подряд — все вовремя|{n} заказов подряд — все вовремя'),
  fast: n => tn(n, '«А ты харош!» {n} раз — за полсрока|«А ты харош!» {n} раза — за полсрока|«А ты харош!» {n} раз — за полсрока'),
  // «угарные» (11.10.2026)
  peds: n => tn(n, 'сбей {n} прохожего — Толик не одобрит, но заплатит|сбей {n} прохожих — Толик не одобрит, но заплатит|сбей {n} прохожих — Толик не одобрит, но заплатит'),
  burgers: n => (A && A.adult
    ? tn(n, 'сбей {n} бургер — роллы тоже в зачёт|сбей {n} бургера — роллы тоже в зачёт|сбей {n} бургеров — роллы тоже в зачёт')
    : tn(n, 'растолкай {n} бургер — роллы тоже в зачёт|растолкай {n} бургера — роллы тоже в зачёт|растолкай {n} бургеров — роллы тоже в зачёт')),
  wrecks: n => tn(n, 'взорви {n} машину — страховая плачет|взорви {n} машины — страховая плачет|взорви {n} машин — страховая плачет'),
  benches: n => tn(n, 'снеси {n} лавочку — бабушки постоят|снеси {n} лавочки — бабушки постоят|снеси {n} лавочек — бабушки постоят'),
  posts: n => tn(n, 'снеси {n} столб — горсвет попотеет|снеси {n} столба — горсвет попотеет|снеси {n} столбов — горсвет попотеет'),
  stops: n => tn(n, 'снеси {n} остановку — автобус подождёт|снеси {n} остановки — автобус подождёт|снеси {n} остановок — автобус подождёт'),
  bloodrun: n => tn(n, 'доставь, сбив по пути {n} человека — с огоньком|доставь, сбив по пути {n} человека — с огоньком|доставь, сбив по пути {n} человек — с огоньком'),
  rampage: n => t('полный разнос — {n} чего угодно за один заказ', { n }),
  dents: n => tn(n, 'помни {n} чужую машину — автосервис скажет спасибо|помни {n} чужие машины — автосервис скажет спасибо|помни {n} чужих машин — автосервис скажет спасибо'),
  dump: n => (n <= 1 ? t('взорви самосвал со стройки — щебень летит красиво')
    : tn(n, 'взорви {n} самосвал со стройки|взорви {n} самосвала со стройки|взорви {n} самосвалов со стройки')),
  pigeons: n => tn(n, 'распугай {n} стайку голубей — пусть разомнутся|распугай {n} стайки голубей — пусть разомнутся|распугай {n} стаек голубей — пусть разомнутся'),
  bins: n => tn(n, 'снеси {n} урну — дворник простит|снеси {n} урны — дворник простит|снеси {n} урн — дворник простит'),
  fences: n => tn(n, 'снеси {n} забор — дворы станут проходными|снеси {n} забора — дворы станут проходными|снеси {n} заборов — дворы станут проходными'),
};

let A = null;
const D = { list: [], earned: 0, cur: { o: null, dirty: {}, acc: {} }, hurt: 0, ppl: 0, noted: false, waitT: 0, len: 0,
  ev: { burger: 0, pigeon: 0, dump: 0 }, prev: null, tickT: 0 };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const label = q => (LABEL[q.id] ? LABEL[q.id](q.n) : q.id);

export function init (api) {
  A = api;
  setTimeout(() => { if (window.__dlv) window.__dlv.DAILY = DEBUG; }, 0);
}

/* ── смена началась: выбрать задания ── */
export function shiftStart ({ n = 1 } = {}) {
  hideNote();
  D.list = []; D.earned = 0; D.cur = { o: null, dirty: {}, acc: {} }; D.noted = false; D.waitT = 0;
  if (!A) return;
  const S = A.S;
  D.hurt = S.hurt || 0; D.ppl = (S.people || 0) + (S.scoots || 0);
  D.prev = snap();
  if (QR.on()) return;                                  // быстрый заезд — без заданий
  const count = ECON.dailyCount(n);
  if (!count) return;
  const len = ECON.shiftLen(Math.max(0, n - 1)).id;
  D.len = len === 'short' ? 0 : len === 'medium' ? 1 : 2;
  let last = [];
  try { const v = A.Store.get(LAST_KEY, []); last = Array.isArray(v) ? v : String(v || '').split(' '); } catch (e) { /* — */ }
  set(pick(count, last, n <= ECON.DAILY.FROM));   // первое в жизни задание (5-я смена) — спокойное: не «сбей 4 человека» (ревью 23.10, Р23-11)
  A.Store.set(LAST_KEY, D.list.map(q => q.id));
}
/* можно ли дать задание: версия (взрослая / детская), стройка в районе для самосвала */
function avail (id) {
  const T = ECON.DAILY.TASKS[id];
  if (!T) return false;
  if (T.who === 'adult' && !A.adult) return false;
  if (T.who === 'kids' && A.adult) return false;
  if (T.need === 'build') {
    const sites = (A.sites && A.sites()) || [];
    if (!sites.some(s => !DIST.has() || DIST.mine(s.dist))) return false;
  }
  return true;
}
const clash = (a, b) => (ECON.DAILY.CLASH || []).some(g => (g[0] === a && g.includes(b)) || (g[0] === b && g.includes(a)));
/* count заданий: каждое место — «угарное» с шансом WILD_P (нет таких — обычное, и наоборот); сначала те, что
   не были в прошлую смену; не ставим в одну смену мешающие друг другу (CLASH); calm — только обычные (первый день заданий) */
function pick (count, last = [], calm0 = false) {
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const ids = Object.keys(ECON.DAILY.TASKS).filter(avail);
  const order = list => shuffle(list.filter(id => !last.includes(id))).concat(shuffle(list.filter(id => last.includes(id))));
  const calm = order(ids.filter(id => !ECON.DAILY.TASKS[id].wild)), wild = order(ids.filter(id => ECON.DAILY.TASKS[id].wild));
  const out = [];
  const take = src => { const i = src.findIndex(id => !out.some(o => clash(o, id))); if (i < 0) return false; out.push(src.splice(i, 1)[0]); return true; };
  for (let k = 0; k < count; k++) {
    const w = !calm0 && Math.random() < (ECON.DAILY.WILD_P ?? 0.5);
    if (!take(w ? wild : calm)) take(w ? calm : wild);
  }
  return out;
}
function set (ids) {
  const payK = DIST.has() ? DIST.pay() : 1;
  D.list = ids.filter(id => ECON.DAILY.TASKS[id]).map(id => {
    const T = ECON.DAILY.TASKS[id];
    return { id, n: Math.max(1, T.n[D.len] || T.n[0] || 1), got: 0, done: false, pay: ECON.dailyPay(id, payK), src: T.src || null, per: T.per || null };
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
  NQ.push({ kind: 'daily', text: label(q), ms: 4300, wait: 60, fresh: 2.5, show: () => showPop(q), hide: hidePop });
}

/* ── каждый кадр смены ── */
export function step (dt) {
  if (!A || !D.list.length || !(A.shiftOn && A.shiftOn())) return;
  const S = A.S;
  if (S.paused) return;
  if (S.order && S.order !== D.cur.o) newOrder(S.order);   // новый заказ: «по пути» — с этого момента
  const hu = S.hurt || 0;
  if (hu > D.hurt + 0.05) fail('hit');                 // удар по машине (game.js hurtCar: S.hurt → 0,9), как career.js SH.hits
  D.hurt = hu;
  const p = (S.people || 0) + (S.scoots || 0);
  if (p > D.ppl) fail('kill');                         // сбил прохожего или самокатчика
  D.ppl = p;
  if (A.nos && A.nos()) fail('nos');                   // жмёт кофе
  if ((D.tickT += dt) >= 0.2) { D.tickT = 0; tick(); }  // «угарные»: прирост счётчиков — 5 раз в секунду
  // записка в начале смены: когда поехал с первым заказом и на экране тихо
  if (!D.noted && S.state === 'drive' && S.order) {
    D.waitT += dt;
    if (D.waitT > 1.2) { D.noted = true; NQ.push({ kind: 'note', text: t('задания на день'), ms: 7300, wait: 25, fresh: 4, show: showNote, hide: hideNote }); }
  }
}

/* ── «угарные»: что считаем (всё — счётчики, которые только растут; упали — новая смена, считаем с нового) ── */
function snap () {
  const S = A.S, h = HAV.counts();
  const c = { ppl: h.people || 0, car: h.car || 0, stop: h.stop || 0, bench: h.bench || 0, post: h.post || 0, fence: h.fence || 0,
    bin: h.bin || 0, other: h.other || 0, wreck: S.wrecks || 0, burger: D.ev.burger, pigeon: D.ev.pigeon, dump: D.ev.dump };
  c.all = c.ppl + c.car + c.stop + c.bench + c.post + c.fence + c.bin + c.other + c.burger;   // «полный разнос»: всё снесённое и сбитое
  return c;
}
function newOrder (o) { D.cur = { o, dirty: {}, acc: {} }; for (const q of D.list) if (q.per === 'order' && !q.done) q.got = 0; }
function tick () {
  const c = snap(), p = D.prev || c;
  D.prev = c;
  for (const q of D.list) {
    if (!q.src || q.done) continue;
    const d = Math.max(0, c[q.src] - (p[q.src] || 0));
    if (!d) continue;
    if (q.per === 'order') {
      if (!D.cur.o || !A.S.order) continue;            // «по пути» — только с заказом на руках
      D.cur.acc[q.src] = (D.cur.acc[q.src] || 0) + d;
      q.got = Math.min(q.n, D.cur.acc[q.src]);         // видно в паузе: «2/3» — в этом заказе; засчитают на последнем адресе
    } else {
      q.got = Math.min(q.n, q.got + d);
      if (q.got >= q.n) complete(q);
    }
  }
}
/* событие из game.js / rivals.js / festivals.js: сбил бургер или маскота, вспугнул стайку голубей, взорвал самосвал */
export function tally (kind, n = 1) {
  if (!A || !(kind in D.ev)) return;
  D.ev[kind] += n;
}

/* ── отдал адрес ── */
export function deliver ({ o, st, onTime, tier, last } = {}) {
  if (!A || !D.list.length || !o || !o.ord || o.tut || o.ord.type === 'staff' || o.ord.story) return;
  tick();                                              // сбитое за последние доли секунды — тоже в зачёт
  if (D.cur.o !== o) newOrder(o);
  if (st && st.bumped) fail('bump');
  if (!onTime) fail('late');
  if (onTime && tier === 2) inc('fast');
  if (!last) return;
  for (const q of D.list) if (FAIL[q.id] && !D.cur.dirty[FAIL[q.id]]) inc(q.id);
  for (const q of D.list) if (q.per === 'order' && !q.done && (D.cur.acc[q.src] || 0) >= q.n) complete(q);   // «сбив по пути», «полный разнос»
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
let NOTE = null, noteT = 0, noteRaf = 0, noteGen = 0;
function showNote () {
  D.noted = true;
  if (typeof document === 'undefined') return;
  hideNote();
  if (!NOTE) { NOTE = document.createElement('div'); NOTE.id = 'daily-note'; NOTE.className = 'pp-ride'; document.body.appendChild(NOTE); }
  NOTE.innerHTML = '<div class="dl-pz-t">' + esc(t('задания на день')) + '</div>' + D.list.map(q =>
    '<div class="dl-row"><i class="dl-box"></i><span>' + esc(label(q)) + '</span><b>+' + esc(A.money(q.pay)) + '</b></div>').join('');
  NOTE.hidden = false;
  const gen = ++noteGen;
  noteRaf = requestAnimationFrame(() => { noteRaf = 0; if (gen === noteGen && NOTE) NOTE.classList.add('on'); });
  clearTimeout(noteT);
  noteT = setTimeout(hideNote, 7000);
}
function hideNote () {
  const gen = ++noteGen;
  clearTimeout(noteT); noteT = 0;
  if (noteRaf) { cancelAnimationFrame(noteRaf); noteRaf = 0; }
  if (!NOTE) return;
  NOTE.classList.remove('on');
  setTimeout(() => { if (gen === noteGen && NOTE && !NOTE.classList.contains('on')) NOTE.hidden = true; }, 300);
}

/* ── выполнил: галочка, звук, «+N ₽» ── */
let POPEL = null, popT = 0, popRaf = 0, popGen = 0;
function hidePop () {
  popGen++;
  clearTimeout(popT); popT = 0;
  if (popRaf) { cancelAnimationFrame(popRaf); popRaf = 0; }
  if (POPEL) POPEL.classList.remove('on');
}
function showPop (q) {
  hidePop();
  if (NOTE) hideNote();
  if (!POPEL) { POPEL = document.createElement('div'); POPEL.id = 'daily-pop'; POPEL.className = 'pp-ride'; document.body.appendChild(POPEL); }
  POPEL.innerHTML = '<i class="dl-box"></i><div><small>' + esc(t('задание выполнено')) + '</small><span>' + esc(label(q)) + '</span></div><b>+' + esc(A.money(q.pay)) + '</b>';
  POPEL.hidden = false;
  POPEL.classList.remove('on');
  const gen = popGen;
  popRaf = requestAnimationFrame(() => { popRaf = 0; if (gen === popGen && POPEL) POPEL.classList.add('on'); });
  // sfx-names: task-done
  try { A.Snd.fx('task-done', s => [784, 1046, 1568].forEach((f, i) => setTimeout(() => s.blip(f, i === 2 ? 0.22 : 0.09, 'triangle', 0.12), i * 80))); } catch (e) { /* — */ }
  clearTimeout(popT);
  popT = setTimeout(hidePop, 4000);
}

const DEBUG = {
  D, LABEL, label,
  set: ids => { set(ids); D.noted = true; return D.list; },
  start: n => { shiftStart({ n }); return D.list.map(q => q.id + ' ' + q.n + ' ' + q.pay); },
  pick, avail, snap, tick, tally, deliver,
  done: id => { const q = D.list.find(x => x.id === id); if (q && !q.done) complete(q); return q; },
  note: showNote, hideNote, pause: pauseHTML, row: endRow,
};
