/* Мини-игры у клиента (IDEAS блок 13, 09.10.2026): домофон (minigames/intercom.js), подъезд — подняться на этаж
   (minigames/stairs.js) и разговор у двери (minigames/smalltalk.js, реплики — minigames/smalltalk-lines.js).
   Правила словами — docs/ORDERS.md «Домофон у подъезда», «Подъезд: подняться на этаж» и «Разговор с клиентом»,
   числа — ECON.DOOR, ECON.STAIRS и ECON.TALK (econ.js).

   Когда (автор 10.10.2026): общие часы настоящего времени — одна мини-игра раз в 5—10 минут игры на смене (ECON.DOORGAME);
   подошли — на следующем подходящем адресе (обычная пицца, вовремя), какая — по месту: подъезд многоэтажки — домофон
   или подъезд, клиент у двери — разговор (в одном заказе — что-то одно). Первая смена новичка — без мини-игр.
   Как встроено: подъехал к клиенту (orders.js onArrive, до вручения) — 2D-экран поверх игры. Руль стоит
   (game.js: DOOR.on() — ввод езды обнулён, машина тормозит), а срок заказа идёт: своего таймера у мини-игр нет.
   Квартира клиента — в накладной с начала заказа (homeOf; лист — ordersheet.js, он же в домофоне и подъезде).
   Кончилась — вручение как обычно; итог — в st.door / st.talk / st.stairs, деньги правит payStop
   (DOOR.payAdjust: «домофон с первого раза» +FAST_BONUS; срок вышел — доставка опоздавшая, как обычно;
   DOOR.talkAdjust: «поболтал с клиентом» +KEEP_TIP, «торопил клиента» — чаевые × RUSH_K, смешной — +FUN_TIP или без чаевых).

     DOOR.init(api)     — game.js после ORD.init: { ORD, S, Store, ADULT, Snd, money, root(), paused(), entranceLv(x, z), shiftsDone(), onShiftStart,
                          respect(why), hintFind() → { name, where, m } | null — ближайшая ненайденная находка (и отметить на карте) }
     DOOR.on()          — мини-игра на экране (game.js: руль стоит, кнопки геймпада — её)
     DOOR.step(dt)      — каждый кадр мира (пауза и карта её стоят): часы мини-игр и сама мини-игра
     DOOR.homeOf(st, lv) — квартира остановки (game.js showOrderCard): { lv, per, entr, floor, door, flat } | null
     DOOR.pad(p)        — кнопки геймпада (game.js padStep), пока on()
     DOOR.enabled() / DOOR.setEnabled(on) — настройка «мини-игры у клиента» (settings.js, ключ dlv-doorgames)
     DOOR.payAdjust(st, fee, bonus, tip) → { bonus, tip, add, cut } — orders.js payStop (домофон)
     DOOR.talkAdjust(st, fee, tip) → { add, cut, kind, win } — orders.js payStop (разговор)
     DOOR.stairsAdjust(st, fee, bonus, tip) → { add, cut, gop } — orders.js payStop (подъезд)
     DOOR.ZHENYA_KEY    — ключ сохранения: скидка на следующий ремонт у Дяди Жени (доля; cars.js offer)
     DOOR.DEBUG         — __dlv.DOOR: timer, due(), force(mode), talk(id), stairs(o), solve(wrong | 'rush' | 'keep' | 'fun' | 'pay' | 'late'),
                          last, lastTalk, lastStairs, n, talkN, stairsN, stairsState(), doorState(), homeOf */
import { t } from '../i18n/index.js';
import * as ECON from './econ.js';
import INTERCOM from './minigames/intercom.js';
import SMALLTALK from './minigames/smalltalk.js';
import STAIRS, { plan as STAIRS_PLAN } from './minigames/stairs.js';
import { swapDigits } from './minigames/intercom.js';
import * as OS from './ordersheet.js';
import * as SC from './minigames/doorscene.js';
import { BONUS } from './minigames/smalltalk-lines.js';
import { faceDataURL } from './people.js';

const D = ECON.DOOR;
const TK = ECON.TALK;
const SR = ECON.STAIRS;
const MG = ECON.DOORGAME;
export const ZHENYA_KEY = 'dlv-zhenya-off';
const KEY = 'dlv-doorgames';
let A = null;
const G = { cur: null, step: null, pad: null, force: null, n: 0, last: null, host: null };
const TG = { force: null, n: 0, last: null };   // разговор: сколько за смену
const SG = { force: null, n: 0, last: null };   // подъезд: то же
const rand = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rand(a, b + 1));

export function init (api) {
  A = api;
  if (api.ORD && api.ORD.onArrive) api.ORD.onArrive(arrive);
  if (api.onShiftStart) api.onShiftStart(() => { G.n = 0; TG.n = 0; SG.n = 0; });
}
export const enabled = () => !A || !A.Store || String(A.Store.get(KEY, '1')) !== '0';
export function setEnabled (on) { if (A && A.Store) A.Store.set(KEY, on ? '1' : '0'); }
export const on = () => !!G.cur;

/* ── когда (автор 10.10.2026: «мини-игра показывается раз в 5—10 минут»): общие часы настоящего времени ──
   Идут только на смене (не пауза, не карта, не меню; первая смена новичка — не считается), раз в DOORGAME.EVERY с
   (случайно в окне). Подошли — мини-игра на следующем подходящем адресе, какая — по месту (pickKind). */
const TM = { t: 0, next: rand(MG.EVERY[0], MG.EVERY[1]) };
const LIVE = new Set(['brief', 'drive', 'back', 'handover', 'side']);
function tick (dt) {
  const S = A.S;
  if (!S || !LIVE.has(S.state) || S.freeRun || (A.paused && A.paused()) || A.shiftsDone() < MG.FROM_SHIFT) return;
  TM.t += dt;
}
const due = () => TM.t >= TM.next;
function fired () { TM.t = 0; TM.next = rand(MG.EVERY[0], MG.EVERY[1]); }

/* подъехал к клиенту: подошли часы и место подходит — Promise (вручение ждёт), нет — ничего.
   __dlv.DOOR.force() / talk() / stairs() — без часов и правил места */
function arrive (ev) {
  if (!A || G.cur) return;
  if (G.force) return door(ev, true) || talk(ev, true);
  if (SG.force) return stairs(ev, true);
  if (TG.force) return talk(ev, true);
  if (!due() || !plain(ev) || ev.order.mg || A.shiftsDone() < MG.FROM_SHIFT) return;
  if (A.S && !A.S.free && A.S.time < MG.MIN_LEFT) return;    // срок почти вышел — не до мини-игр (часы ждут следующего адреса)
  const kind = pickKind(ev);
  const r = kind === 'door' ? door(ev) : kind === 'stairs' ? stairs(ev) : kind === 'talk' ? talk(ev) : null;
  if (r) fired();
  return r;
}
/* какая — по месту: у подъезда дома от DOOR.LV этажей — домофон, от STAIRS.LV — и подъезд; клиент у двери — разговор */
function pickKind (ev) {
  const lv = A.entranceLv(ev.x, ev.z), st = ev.stop;
  const person = st.persons && st.persons[0], ped = st.peds && st.peds[0];
  const can = { door: lv >= D.LV, stairs: lv >= SR.LV, talk: !!person && !(ped && ped.dead) };
  const ks = Object.keys(can).filter(k => can[k] && (MG.W[k] || 0) > 0);
  let sum = ks.reduce((a, k) => a + MG.W[k], 0), r = Math.random() * sum;
  for (const k of ks) { r -= MG.W[k]; if (r <= 0) return k; }
  return ks[0] || null;
}

/* обычная пицца, на которой бывают мини-игры (без force) */
function plain (ev) {
  const o = ev.order, st = ev.stop, sp = o.ord;
  if (!enabled() || !ev.onTime) return false;
  if (ev.type !== 'pizza' || sp.urgent || sp.beach || sp.fest || sp.story) return false;
  if (o.tut || st.beach || st.fest || (st.zone || sp.zone) === 'gang') return false;   // бандиты у подъезда — им не до разговоров
  return true;
}

/* квартира остановки — с самого начала заказа (game.js showOrderCard пишет её в накладную): подъезд, этаж, дверь —
   как в подъезде (stairs.js plan); дом ниже DOOR.LV этажей или не у подъезда — квартиры нет */
export function homeOf (st, lv) {
  if (!st) return null;
  if (st.home !== undefined) return st.home;
  st.home = lv >= D.LV ? Object.assign(STAIRS_PLAN({ lv, gop: false }), { lv }) : null;
  if (st.home) st.home.flat = String(st.home.flat);
  return st.home;
}

/* цена адреса — как в orders.js payStop: для приписок на листе («+120 ₽ · с первого раза», «−100 ₽ гопникам») */
function feeOf (o, st) {
  const sp = o.ord || {};
  const S = A.S || {};
  return st.fee || (sp.fees && sp.fees[o.idx]) || Math.round((S.fee || 0) / Math.max(1, o.stops.length));
}
const r10 = v => Math.round(v / 10) * 10;
const money = v => (A.money ? A.money(v) : v + ' ₽');

/* какой подъезд по виду (doorscene.js): обшарпанный или чистый — по адресу и району; номер подъезда и его квартиры */
function sceneOf (order, st) {
  const h = st.home || {}, seed = SC.hashStr(st.addr || '');
  const range = h.first && h.per && h.lv ? t('кв. {a}—{b}', { a: h.first, b: h.first + h.lv * h.per - 1 }) : '';
  return { look: SC.lookOf(seed, st.zone || (order.ord && order.ord.zone)), seed, entr: h.entr || 0, range };
}

/* лист накладной — тот же, что в начале заказа (ordersheet.js) */
function sheetOf (o) {
  try { return OS.html(o, { extra: A.ORD && A.ORD.cardRows ? A.ORD.cardRows(o) : [], t }); } catch (e) { return ''; }
}
/* часы заказа, как на приборке (game.js dashStep: #dash-now, #dash-due) — мини-игра своего таймера не держит */
function clock () {
  const S = A.S;
  if (!S || S.free || !(S.timeMax > 0) || !Number.isFinite(S.time)) return null;
  const now = document.getElementById('dash-now'), dd = document.getElementById('dash-due'), w = document.getElementById('timewrap');
  const k = S.time / S.timeMax;
  const lvl = S.time <= 0 ? 'late' : (k <= 0.18 || S.time < 10) ? 'low' : k <= 0.4 ? 'warn' : '';
  return { s: S.time, k, now: now ? now.textContent : '', label: dd && dd.firstChild ? dd.firstChild.textContent : t('доставить до'),
    due: dd && dd.lastChild ? dd.lastChild.textContent : '', lvl: w && w.classList.contains('late') ? 'late' : lvl };
}

function door (ev, forced) {
  const o = ev.order, st = ev.stop, sp = o && o.ord;
  if (!sp || !st || st.door) return;
  if (forced) { if (ev.type === 'staff' || sp.story) return; }
  else if (A.shiftsDone() < D.FROM_SHIFT) return;              // первая смена новичка — без мини-игр
  const lv = A.entranceLv(ev.x, ev.z);
  if (!forced && lv < D.LV) return;
  const fm = G.force;
  G.force = null;
  G.n++;
  o.mg = 'door';
  return play(st, pickMode(fm), Math.max(lv, 5), o);
}

/* подъезд: дом от SR.LV этажей у двери подъезда; гопники на площадке — с GOP_FROM-й смены, шанс GOP_P */
function stairs (ev, forced) {
  const o = ev.order, st = ev.stop, sp = o && o.ord;
  if (!sp || !st || st.door || st.talk || st.stairs) return;
  if (forced) { if (ev.type === 'staff' || sp.story) return; }
  else if (A.shiftsDone() < SR.FROM_SHIFT) return;             // первая смена новичка — без мини-игр
  const lv = A.entranceLv(ev.x, ev.z);
  if (!forced && lv < SR.LV) return;
  const fo = SG.force && typeof SG.force === 'object' ? SG.force : {};
  SG.force = null;
  SG.n++;
  o.mg = 'stairs';
  const gop = fo.gop !== undefined ? !!fo.gop : A.shiftsDone() >= SR.GOP_FROM && Math.random() < SR.GOP_P;
  // квартира — та же, что в накладной (homeOf); дом ниже SR.LV или квартиры нет (force) — своя
  const lvH = Math.max(lv, SR.LV);
  let h = st.home && st.home.lv >= SR.LV && st.home.floor >= 2 ? st.home : null;
  if (!h || fo.floor || fo.lv || fo.per || fo.entr) { st.home = Object.assign(STAIRS_PLAN(Object.assign({ lv: lvH }, fo, { gop: false })), { lv: fo.lv || lvH }); st.home.flat = String(st.home.flat); h = st.home; }
  return playStairs(st, o, Object.assign({}, fo, { lv: h.lv, floor: h.floor, per: h.per, entr: h.entr, door: h.door, gop }));
}

function playStairs (st, order, opt) {
  return new Promise(resolve => {
    const h = host();
    const person = st.persons && st.persons[0];
    const cur = G.cur = { type: 'stairs', st, order, mode: 'stairs', resolve, off: null, done: false };
    const end = res => {
      if (cur.done) return;
      cur.done = true;
      st.stairs = Object.assign({ mode: 'stairs' }, res || { ok: false, aborted: true });
      SG.last = st.stairs;
      if (typeof cur.off === 'function') cur.off();
      if (G.cur === cur) { G.cur = null; G.step = null; G.pad = null; }
      resolve();
    };
    cur.end = end;
    const api = {
      t, ADULT: !!A.ADULT,
      log: () => {},
      done: res => end(res),
      setStep: fn => { G.step = fn; },
      setPad: fn => { G.pad = fn; },
      paused: () => !!(A.paused && A.paused()),
      sfx: name => stairsSound(name),
    };
    const fee = feeOf(order, st);
    cur.off = STAIRS.mount(h, Object.assign({
      addr: st.addr || '', who: person ? person.first || person.name : '', person, sheet: sheetOf(order), clock,
      bonus: '+' + money(r10(fee * SR.FAST_BONUS)), gopPay: '−' + money(r10(fee * SR.GOP_PAY)),
    }, sceneOf(order, st), opt), api);
  });
}

/* звуки подъезда: файлы public/sfx (docs/SOUNDS.md, stairs-*), без них — синтез */
function stairsSound (name) {
  const Snd = A && A.Snd;
  if (!Snd || !Snd.fx) return;
  const SY = {
    step: s => s.blip(150 + Math.random() * 50, 0.035, 'square', 0.025),
    puff: s => (s.noise ? s.noise(0.3, 0.05) : s.blip(200, 0.2, 'triangle', 0.04)),
    ring: s => { s.blip(1320, 0.1, 'square', 0.05); setTimeout(() => s.blip(990, 0.16, 'square', 0.05), 110); },
    wrong: s => { s.blip(260, 0.1, 'square', 0.06); setTimeout(() => s.blip(200, 0.16, 'square', 0.06), 110); },
    open: s => [523, 659, 784].forEach((f, i) => setTimeout(() => s.blip(f, 0.1, 'square', 0.06), i * 80)),
    gop: s => s.blip(110, 0.28, 'sawtooth', 0.06),
    beat: s => s.blip(880, 0.03, 'square', 0.04),
    dodge: s => (s.noise ? s.noise(0.08, 0.06) : s.blip(600, 0.05, 'triangle', 0.05)),
    pay: s => [1046, 784].forEach((f, i) => setTimeout(() => s.blip(f, 0.08, 'square', 0.05), i * 70)),
    fail: s => s.blip(240, 0.25, 'triangle', 0.08),
  };
  if (!SY[name]) return;
  try { Snd.fx('stairs-' + name, SY[name]); } catch (e) { /* — */ }
}

/* разговор у двери: клиент есть и жив, в заказе не было домофона и подъезда */
function talk (ev, forced) {
  const o = ev.order, st = ev.stop, sp = o && o.ord;
  if (!sp || !st || st.talk || st.door || st.stairs) return;
  const person = st.persons && st.persons[0], ped = st.peds && st.peds[0];
  if (!person || (ped && ped.dead)) return;
  if (forced) { if (ev.type === 'staff' || sp.story) return; }
  else if (A.shiftsDone() < TK.FROM_SHIFT) return;              // первая смена новичка — без мини-игр
  const sit = TG.force;
  TG.force = null;
  TG.n++;
  o.mg = 'talk';
  const fem = person.fem !== undefined ? !!person.fem : ped && ped.grp && ped.grp.userData ? !!ped.grp.userData.fem : null;
  return playTalk(st, o, person, fem, typeof sit === 'string' ? sit : '');
}

function host () {
  let h = A.root().querySelector('#doorgame');
  if (!h) { h = document.createElement('div'); h.id = 'doorgame'; A.root().appendChild(h); }
  G.host = h;
  return h;
}

function playTalk (st, order, person, fem, sit) {
  return new Promise(resolve => {
    const h = host();
    const cur = G.cur = { type: 'talk', st, order, mode: 'talk', resolve, off: null, done: false };
    const end = res => {
      if (cur.done) return;
      cur.done = true;
      st.talk = res || { aborted: true };
      TG.last = st.talk;
      // поддержал разговор (или кивал молча) — респект; в «покататься» — нет
      if (res && res.kind === 'keep' && A.respect && !(A.S && A.S.freeRun)) A.respect('chat');
      if (typeof cur.off === 'function') cur.off();
      if (G.cur === cur) { G.cur = null; G.step = null; G.pad = null; }
      resolve();
    };
    cur.end = end;
    const pct = k => Math.round(k * 100);
    const api = {
      t, ADULT: !!A.ADULT, faceDataURL,
      log: () => {},
      done: res => end(res),
      setStep: fn => { G.step = fn; },
      setPad: fn => { G.pad = fn; },
      paused: () => !!(A.paused && A.paused()),
      sfx: name => talkSound(name),
      bonus,
    };
    cur.off = SMALLTALK.mount(h, {
      sit, person, fem, who: person.first || '',
      T: TK.T, p: { rushNone: TK.RUSH_NONE, funWin: TK.FUN_P, bonusP: TK.BONUS_P },
      pct: { rush: pct(1 - TK.RUSH_K), keep: pct(TK.KEEP_TIP), fun: pct(TK.FUN_TIP), zhenya: pct(TK.ZHENYA_OFF) },
      clock: () => (A.S && !A.S.free && Number.isFinite(A.S.time) && A.S.timeMax > 0 ? { s: A.S.time, k: A.S.time / A.S.timeMax } : null),
    }, api);
  });
}

/* бонус «поддержать»: подсказка, где находка (game.js hintFind отмечает её на карте), нет находок — скидка у Дяди Жени */
function bonus (kind) {
  if (kind === 'find' && A.hintFind) {
    const f = A.hintFind();
    if (f) return { kind: 'find', line: t(BONUS.find, { what: f.name, where: f.where, m: Math.max(50, Math.round(f.m / 50) * 50) }), note: t('находка — на карте') };
  }
  const n = Math.round(TK.ZHENYA_OFF * 100);
  try { if (A.Store) A.Store.set(ZHENYA_KEY, TK.ZHENYA_OFF); } catch (e) { /* — */ }
  return { kind: 'zhenya', line: t(BONUS.zhenya, { n }), note: t('у Дяди Жени −{n} %', { n }) };
}

/* звуки разговора: бормотание по буквам, выбор, монетка / вздох (файлы public/sfx, без них — синтез) */
function talkSound (name) {
  const Snd = A && A.Snd;
  if (!Snd || !Snd.fx) return;
  if (name === 'coin' && Snd.coin) { try { Snd.coin(); } catch (e) { /* — */ } return; }
  const SY = {
    blab: s => s.blip(330 + Math.random() * 260, 0.035, 'square', 0.025),
    pick: s => s.blip(980, 0.06, 'square', 0.06),
    sad: s => { s.blip(330, 0.12, 'triangle', 0.07); setTimeout(() => s.blip(247, 0.2, 'triangle', 0.07), 120); },
  };
  if (!SY[name]) return;
  try { Snd.fx('talk-' + name, SY[name]); } catch (e) { /* — */ }
}

/* что выпало: с SMUDGE_FROM-й смены — пятно на цифре, с TYPO_FROM-й — опечатка, с BROKEN_FROM-й — сломан */
function pickMode (forced) {
  if (forced && forced !== true) return forced;
  const n = A.shiftsDone();
  if (n >= D.BROKEN_FROM && Math.random() < D.BROKEN_P) return 'broken';
  if (n >= D.TYPO_FROM && Math.random() < D.TYPO_P) return 'typo';
  if (n >= D.SMUDGE_FROM && Math.random() < D.SMUDGE_P) return 'smudge';
  return 'dial';
}

function play (st, mode, lv, order) {
  // квартира — из накладной (homeOf); у force не у подъезда — своя
  const h = homeOf(st, lv) || (st.home = { lv, flat: String(rint(12, 98)) });
  const shown = String(h.flat);
  if ((mode === 'typo' || mode === 'smudge') && (shown.length < 2 || (mode === 'typo' && swapDigits(shown) === shown))) mode = 'dial';
  const flat = mode === 'typo' ? swapDigits(shown) : shown;
  const time = mode === 'broken' ? D.T.knock : (flat.length >= 3 ? D.T.three : D.T.two) + (mode === 'typo' ? D.T.typo : 0) + (mode === 'smudge' ? D.T.smudge : 0);
  const fee = feeOf(order, st);
  return new Promise(resolve => {
    const hh = host();
    const person = st.persons && st.persons[0];
    const cur = G.cur = { type: 'door', st, order, mode, resolve, off: null, done: false };
    const end = res => {
      if (cur.done) return;
      cur.done = true;
      st.door = Object.assign({ mode }, res || { ok: false, aborted: true });
      G.last = st.door;
      if (typeof cur.off === 'function') cur.off();
      if (G.cur === cur) { G.cur = null; G.step = null; G.pad = null; }
      resolve();
    };
    cur.end = end;
    const api = {
      t, ADULT: !!A.ADULT,
      log: () => {},
      done: res => end(res),
      setStep: fn => { G.step = fn; },
      setPad: fn => { G.pad = fn; },
      paused: () => !!(A.paused && A.paused()),
      sfx: name => sound(name),
    };
    cur.off = INTERCOM.mount(hh, Object.assign({
      mode, flat, print: shown, time, knocks: D.KNOCKS, fast: D.FAST, fastPad: D.FAST_PAD, wipeAfter: D.WIPE_AFTER,
      addr: st.addr || '', who: person ? person.first || person.name : '', person,
      sheet: sheetOf(order), bonus: '+' + money(r10(fee * D.FAST_BONUS)), clock,
    }, sceneOf(order, st)), api);
    sound('ring');
  });
}

/* звуки домофона: файлы public/sfx (docs/SOUNDS.md), без них — синтез */
function sound (name) {
  const Snd = A && A.Snd;
  if (!Snd || !Snd.fx) return;
  const SY = {
    key: s => s.blip(1250, 0.05, 'square', 0.06),
    ring: s => { s.blip(660, 0.18, 'square', 0.05); setTimeout(() => s.blip(520, 0.22, 'square', 0.05), 200); },
    open: s => { s.blip(180, 0.5, 'sawtooth', 0.06); },
    wrong: s => { s.blip(300, 0.1, 'square', 0.07); setTimeout(() => s.blip(220, 0.16, 'square', 0.07), 110); },
    knock: s => s.noise ? s.noise(0.05, 0.16) : s.blip(110, 0.05, 'square', 0.1),
    fail: s => s.blip(240, 0.25, 'triangle', 0.08),
  };
  try { Snd.fx('intercom-' + name, SY[name]); } catch (e) { /* — */ }
}

export function step (dt) {
  if (A) tick(dt);
  const c = G.cur;
  if (!c) return;
  const S = A.S;
  // заказ сорвался, смена кончилась, машина взорвалась — мини-игру убираем, вручение не ждёт
  if (S.state !== 'drive' || S.order !== c.order) { c.end({ ok: false, aborted: true }); return; }
  if (G.step) G.step(dt);
}
export function pad (p) { if (G.cur && G.pad) G.pad(p); }

/* деньги: быстро и с первого раза — +FAST_BONUS от цены адреса; не успел — «за скорость» и чаевые × SLOW_K */
export function payAdjust (st, fee, bonus, tip) {
  const r = st && st.door;
  if (!r || r.aborted) return { bonus, tip, add: 0, cut: 0 };
  if (r.ok && r.fast) return { bonus, tip, add: Math.round(fee * D.FAST_BONUS / 10) * 10, cut: 0 };
  if (r.timeout) {
    const cut = Math.round((bonus + tip) * (1 - D.SLOW_K) / 10) * 10;
    return { bonus, tip, add: 0, cut };
  }
  return { bonus, tip, add: 0, cut: 0 };
}

/* деньги разговора: поторопил — чаевые × RUSH_K (или без них), поддержал — +KEEP_TIP цены адреса,
   смешной — зашло: +FUN_TIP, не зашло — без чаевых */
export function talkAdjust (st, fee, tip) {
  const r = st && st.talk;
  if (!r || r.aborted || !r.kind) return { add: 0, cut: 0, kind: '', win: false };
  const r10 = v => Math.round(v / 10) * 10;
  if (r.kind === 'rush') return { add: 0, cut: tip > 0 ? (r.none ? tip : r10(tip * (1 - TK.RUSH_K))) : 0, kind: 'rush', win: false };
  if (r.kind === 'fun') return r.win ? { add: r10(fee * TK.FUN_TIP), cut: 0, kind: 'fun', win: true } : { add: 0, cut: tip, kind: 'fun', win: false };
  return { add: r10(fee * TK.KEEP_TIP), cut: 0, kind: 'keep', win: false };
}

/* деньги подъезда: дошёл с первого раза и быстро — +FAST_BONUS цены адреса; не успел — «за скорость» и чаевые × SLOW_K;
   откупился от гопников — GOP_PAY цены адреса */
export function stairsAdjust (st, fee, bonus, tip) {
  const r = st && st.stairs;
  if (!r || r.aborted) return { add: 0, cut: 0, gop: 0 };
  const r10 = v => Math.round(v / 10) * 10;
  return {
    add: r.ok && r.fast ? r10(fee * SR.FAST_BONUS) : 0,
    cut: r.timeout ? r10((bonus + tip) * (1 - SR.SLOW_K)) : 0,
    gop: r.gop === 'pay' ? r10(fee * SR.GOP_PAY) : 0,
  };
}

export const DEBUG = {
  /* общие часы мини-игр: сколько набежало и когда следующая, с; due() — «подошло», следующий подходящий адрес — мини-игра по месту */
  get timer () { return { t: +TM.t.toFixed(1), next: +TM.next.toFixed(1), due: due() }; },
  due: () => { TM.t = TM.next; return true; },
  /* следующий подъезд (любой обычный адрес) — домофон этого вида: 'dial' | 'smudge' | 'typo' | 'broken' | true (как выпадет) */
  force: (mode = true) => { G.force = mode; return mode; },
  /* решить открытый, как игрок: верно (wrong — сначала одна ошибка) */
  /* следующий обычный адрес — разговор: true (случайная ситуация) или id ситуации (smalltalk-lines.js) */
  talk: (id = true) => { TG.force = id; return id; },
  /* следующий обычный адрес — подъезд: true или { gop: true | false, lv, floor, per, entr, time } (без шанса и правил) */
  stairs: (o = true) => { SG.force = o; return o; },
  /* решить открытое, как игрок: домофон — верно (wrong — сначала одна ошибка); разговор — 'rush' (по умолчанию) | 'keep' | 'fun' */
  solve: arg => {
    const b = G.host && G.host.querySelector('.dg, .tk, .sx');
    if (!b || !b.__solve) return false;
    if (b.classList.contains('tk')) b.__solve(typeof arg === 'string' ? arg : 'rush');
    else if (b.classList.contains('sx')) b.__solve(arg);   // подъезд: '' — пройти, 'pay' — откупиться от гопников, 'wrong' — сначала чужая дверь, 'late' — не успеть
    else b.__solve(arg);
    return true;
  },
  on,
  lv: (x, z) => (A ? A.entranceLv(x, z) : 0),           // этажей у подъезда (0 — не у подъезда)
  get last () { return G.last; },
  get n () { return G.n; },
  get mode () { return G.cur ? G.cur.mode : null; },
  get lastTalk () { return TG.last; },
  get lastStairs () { return SG.last; },
  get stairsN () { return SG.n; },
  stairsState: () => { const b = G.host && G.host.querySelector('.sx'); return b && b.__st ? b.__st() : null; },
  doorState: () => { const b = G.host && G.host.querySelector('.dg'); return b && b.__st ? b.__st() : null; },
  homeOf,
  get talkN () { return TG.n; },
  get sit () { const b = G.host && G.host.querySelector('.tk'); return b ? b.__sit : null; },
};
