/* Мини-игры у клиента (IDEAS блок 13, 09.10.2026): домофон (minigames/intercom.js), подъезд — подняться на этаж
   (minigames/stairs.js) и разговор у двери (minigames/smalltalk.js, реплики — minigames/smalltalk-lines.js).
   Правила словами — docs/ORDERS.md «Домофон у подъезда», «Подъезд: подняться на этаж» и «Разговор с клиентом»,
   числа — ECON.DOOR, ECON.STAIRS и ECON.TALK (econ.js).

   Как встроено: подъехал к клиенту (orders.js onArrive, до вручения) — иногда у подъезда многоэтажки вместо
   вручения сразу — 2D-экран домофона поверх игры; не выпал домофон — иногда подъезд (лифт сломан, бегом на этаж), не выпал
   и он — иногда клиент заводит разговор (в одном заказе — что-то одно). Руль стоит (game.js: DOOR.on() — ввод езды обнулён, машина тормозит), а время заказа идёт.
   Кончилась — вручение как обычно; итог — в st.door / st.talk, деньги правит payStop
   (DOOR.payAdjust: «домофон с первого раза» +FAST_BONUS, «спускался сам» — «за скорость» и чаевые × SLOW_K;
   DOOR.talkAdjust: «поболтал с клиентом» +KEEP_TIP, «торопил клиента» — чаевые × RUSH_K, смешной — +FUN_TIP или без чаевых).

     DOOR.init(api)     — game.js после ORD.init: { ORD, S, Store, ADULT, Snd, root(), paused(), entranceLv(x, z), shiftsDone(), onShiftStart,
                          respect(why), hintFind() → { name, where, m } | null — ближайшая ненайденная находка (и отметить на карте) }
     DOOR.on()          — мини-игра на экране (game.js: руль стоит, кнопки геймпада — её)
     DOOR.step(dt)      — каждый кадр мира (пауза и карта её стоят)
     DOOR.pad(p)        — кнопки геймпада (game.js padStep), пока on()
     DOOR.enabled() / DOOR.setEnabled(on) — настройка «мини-игры у клиента» (settings.js, ключ dlv-doorgames)
     DOOR.payAdjust(st, fee, bonus, tip) → { bonus, tip, add, cut } — orders.js payStop (домофон)
     DOOR.talkAdjust(st, fee, tip) → { add, cut, kind, win } — orders.js payStop (разговор)
     DOOR.stairsAdjust(st, fee, bonus, tip) → { add, cut, gop } — orders.js payStop (подъезд)
     DOOR.ZHENYA_KEY    — ключ сохранения: скидка на следующий ремонт у Дяди Жени (доля; cars.js offer)
     DOOR.DEBUG         — __dlv.DOOR: force(mode), talk(id), stairs(o), solve(wrong | 'rush' | 'keep' | 'fun' | 'pay' | 'late'), last, lastTalk, lastStairs,
                          n, talkN, stairsN, stairsState() */
import { t } from '../i18n/index.js';
import * as ECON from './econ.js';
import INTERCOM from './minigames/intercom.js';
import SMALLTALK from './minigames/smalltalk.js';
import STAIRS from './minigames/stairs.js';
import { BONUS } from './minigames/smalltalk-lines.js';
import { faceDataURL } from './people.js';

const D = ECON.DOOR;
const TK = ECON.TALK;
const SR = ECON.STAIRS;
export const ZHENYA_KEY = 'dlv-zhenya-off';
const KEY = 'dlv-doorgames';
let A = null;
const G = { cur: null, step: null, pad: null, force: null, n: 0, lastAt: -99, last: null, host: null };
const TG = { force: null, n: 0, lastAt: -99, last: null };   // разговор: сколько за смену, на каком заказе был прошлый
const SG = { force: null, n: 0, lastAt: -99, last: null };   // подъезд: то же
const rand = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rand(a, b + 1));

export function init (api) {
  A = api;
  if (api.ORD && api.ORD.onArrive) api.ORD.onArrive(arrive);
  if (api.onShiftStart) api.onShiftStart(() => { G.n = 0; G.lastAt = -99; TG.n = 0; TG.lastAt = -99; SG.n = 0; SG.lastAt = -99; });
}
export const enabled = () => !A || !A.Store || String(A.Store.get(KEY, '1')) !== '0';
export function setEnabled (on) { if (A && A.Store) A.Store.set(KEY, on ? '1' : '0'); }
export const on = () => !!G.cur;

/* сколько заказов отдано — счётчик для «не чаще раза в GAP заказов» */
const doneN = () => (A && A.S ? A.S.done || 0 : 0);

/* подъехал к клиенту: выпал домофон, подъезд или разговор — Promise (вручение ждёт), нет — ничего.
   Порядок: домофон → подъезд → разговор; __dlv.DOOR.talk() / stairs() — другие не перебивают */
function arrive (ev) {
  if (!A || G.cur) return;
  if (G.force) return door(ev) || talk(ev);
  if (SG.force) return stairs(ev);
  if (TG.force) return talk(ev);
  return door(ev) || stairs(ev) || talk(ev);
}

/* обычная пицца, на которой бывают мини-игры (без force) */
function plain (ev) {
  const o = ev.order, st = ev.stop, sp = o.ord;
  if (!enabled() || !ev.onTime) return false;
  if (ev.type !== 'pizza' || sp.urgent || sp.beach || sp.fest || sp.story) return false;
  if (o.tut || st.beach || st.fest || (st.zone || sp.zone) === 'gang') return false;   // бандиты у подъезда — им не до разговоров
  return true;
}

function door (ev) {
  const o = ev.order, st = ev.stop, sp = o && o.ord;
  if (!sp || !st || st.door) return;
  const forced = G.force;
  if (!forced) {
    if (!plain(ev) || o.mg) return;                            // в этом заказе уже был разговор
    if (A.shiftsDone() < D.FROM_SHIFT) return;                 // первая смена новичка — без мини-игр
    if (doneN() < G.lastAt) G.lastAt = -99;                    // счётчик заказов обнулился (новая смена)
    if (G.n >= D.MAX || doneN() - G.lastAt < D.GAP) return;
  } else if (ev.type === 'staff' || sp.story) return;
  const lv = A.entranceLv(ev.x, ev.z);
  if (!forced && lv < D.LV) return;
  if (!forced && Math.random() >= D.CHANCE) return;
  G.force = null;
  G.n++; G.lastAt = doneN();
  o.mg = 'door';
  return play(st, pickMode(forced), Math.max(lv, 5), o);
}

/* подъезд: дом от SR.LV этажей у двери подъезда, в заказе не было домофона и разговора; шанс CHANCE, не чаще GAP, не больше MAX;
   гопники на площадке — с GOP_FROM-й смены, шанс GOP_P */
function stairs (ev) {
  const o = ev.order, st = ev.stop, sp = o && o.ord;
  if (!sp || !st || st.door || st.talk || st.stairs) return;
  const forced = SG.force;
  if (!forced) {
    if (!plain(ev) || o.mg) return;
    if (A.shiftsDone() < SR.FROM_SHIFT) return;                // первая смена новичка — без мини-игр
    if (doneN() < SG.lastAt) SG.lastAt = -99;
    if (SG.n >= SR.MAX || doneN() - SG.lastAt < SR.GAP) return;
  } else if (ev.type === 'staff' || sp.story) return;
  const lv = A.entranceLv(ev.x, ev.z);
  if (!forced && lv < SR.LV) return;
  if (!forced && Math.random() >= SR.CHANCE) return;
  SG.force = null;
  SG.n++; SG.lastAt = doneN();
  o.mg = 'stairs';
  const fo = forced && typeof forced === 'object' ? forced : {};
  const gop = fo.gop !== undefined ? !!fo.gop : A.shiftsDone() >= SR.GOP_FROM && Math.random() < SR.GOP_P;
  return playStairs(st, o, Object.assign({ lv: Math.max(lv, SR.LV) }, fo, { gop }));
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
    cur.off = STAIRS.mount(h, Object.assign({ addr: st.addr || '', who: person ? person.name : '' }, opt), api);
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

/* разговор у двери: клиент есть и жив, в заказе не было домофона; шанс CHANCE, не чаще GAP, не больше MAX за смену */
function talk (ev) {
  const o = ev.order, st = ev.stop, sp = o && o.ord;
  if (!sp || !st || st.talk || st.door || st.stairs) return;
  const person = st.persons && st.persons[0], ped = st.peds && st.peds[0];
  if (!person || (ped && ped.dead)) return;
  const forced = TG.force;
  if (!forced) {
    if (!plain(ev) || o.mg) return;
    if (A.shiftsDone() < TK.FROM_SHIFT) return;                // первая смена новичка — без мини-игр
    if (doneN() < TG.lastAt) TG.lastAt = -99;
    if (TG.n >= TK.MAX || doneN() - TG.lastAt < TK.GAP) return;
    if (Math.random() >= TK.CHANCE) return;
  } else if (ev.type === 'staff' || sp.story) return;
  TG.force = null;
  TG.n++; TG.lastAt = doneN();
  o.mg = 'talk';
  const fem = person.fem !== undefined ? !!person.fem : ped && ped.grp && ped.grp.userData ? !!ped.grp.userData.fem : null;
  return playTalk(st, o, person, fem, typeof forced === 'string' ? forced : '');
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

/* что выпало: с TYPO_FROM-й смены — опечатка, с BROKEN_FROM-й — сломан */
function pickMode (forced) {
  if (forced && forced !== true) return forced;
  const n = A.shiftsDone();
  if (n >= D.BROKEN_FROM && Math.random() < D.BROKEN_P) return 'broken';
  if (n >= D.TYPO_FROM && Math.random() < D.TYPO_P) return 'typo';
  return 'dial';
}
/* номер квартиры: в домах от LV3 этажей — бывает трёхзначный; для опечатки — две разные цифры */
function flatFor (mode, lv) {
  const three = mode !== 'typo' && lv >= D.LV3 && Math.random() < 0.5;
  for (let k = 0; k < 20; k++) {
    const n = three ? rint(100, Math.min(999, lv * 4 * 6)) : rint(12, 98);
    const s = String(n);
    if (mode === 'typo' && (s[0] === s[1] || s.includes('0'))) continue;
    return s;
  }
  return '47';
}

function play (st, mode, lv, order) {
  const flat = flatFor(mode, lv);
  const time = mode === 'broken' ? D.T.knock : (flat.length >= 3 ? D.T.three : D.T.two) + (mode === 'typo' ? D.T.typo : 0);
  return new Promise(resolve => {
    const h = host();
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
    cur.off = INTERCOM.mount(h, { mode, flat, time, knocks: D.KNOCKS, fast: D.FAST, fastPad: D.FAST_PAD, addr: st.addr || '', who: person ? person.name : '' }, api);
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
  /* следующий подъезд (любой обычный адрес) — домофон этого вида: 'dial' | 'typo' | 'broken' | true (как выпадет) */
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
  get talkN () { return TG.n; },
  get sit () { const b = G.host && G.host.querySelector('.tk'); return b ? b.__sit : null; },
};
