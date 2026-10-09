/* Мини-игры у клиента (IDEAS блок 13, 09.10.2026): пока одна — домофон (minigames/intercom.js).
   Правила словами — docs/ORDERS.md «Домофон у подъезда», числа — ECON.DOOR (econ.js).

   Как встроено: подъехал к клиенту (orders.js onArrive, до вручения) — иногда у подъезда многоэтажки вместо
   вручения сразу — 2D-экран домофона поверх игры. Руль стоит (game.js: DOOR.on() — ввод езды обнулён, машина
   тормозит), а время заказа идёт. Кончилась — вручение как обычно; итог — в st.door, деньги правит payStop
   (DOOR.payAdjust: «домофон с первого раза» +FAST_BONUS, «спускался сам» — «за скорость» и чаевые × SLOW_K).

     DOOR.init(api)     — game.js после ORD.init: { ORD, S, Store, ADULT, Snd, root(), paused(), entranceLv(x, z), shiftsDone(), onShiftStart }
     DOOR.on()          — мини-игра на экране (game.js: руль стоит, кнопки геймпада — её)
     DOOR.step(dt)      — каждый кадр мира (пауза и карта её стоят)
     DOOR.pad(p)        — кнопки геймпада (game.js padStep), пока on()
     DOOR.enabled() / DOOR.setEnabled(on) — настройка «мини-игры у клиента» (settings.js, ключ dlv-doorgames)
     DOOR.payAdjust(st, fee, bonus, tip) → { bonus, tip, add, cut } — orders.js payStop
     DOOR.DEBUG         — __dlv.DOOR: force(mode), solve(wrong), last, n */
import { t } from '../i18n/index.js';
import * as ECON from './econ.js';
import INTERCOM from './minigames/intercom.js';

const D = ECON.DOOR;
const KEY = 'dlv-doorgames';
let A = null;
const G = { cur: null, step: null, pad: null, force: null, n: 0, lastAt: -99, last: null, host: null };
const rand = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rand(a, b + 1));

export function init (api) {
  A = api;
  if (api.ORD && api.ORD.onArrive) api.ORD.onArrive(arrive);
  if (api.onShiftStart) api.onShiftStart(() => { G.n = 0; G.lastAt = -99; });
}
export const enabled = () => !A || !A.Store || String(A.Store.get(KEY, '1')) !== '0';
export function setEnabled (on) { if (A && A.Store) A.Store.set(KEY, on ? '1' : '0'); }
export const on = () => !!G.cur;

/* сколько заказов отдано — счётчик для «не чаще раза в GAP заказов» */
const doneN = () => (A && A.S ? A.S.done || 0 : 0);

/* подъехал к клиенту: выпал домофон — Promise (вручение ждёт), нет — ничего */
function arrive (ev) {
  if (!A || G.cur) return;
  const o = ev.order, st = ev.stop, sp = o && o.ord;
  if (!sp || !st || st.door) return;
  const forced = G.force;
  if (!forced) {
    if (!enabled() || !ev.onTime) return;
    if (ev.type !== 'pizza' || sp.urgent || sp.beach || sp.fest || sp.story) return;
    if (o.tut || st.beach || st.fest || (st.zone || sp.zone) === 'gang') return;   // бандиты у подъезда — им не до домофона
    if (A.shiftsDone() < D.FROM_SHIFT) return;                 // первая смена новичка — без мини-игр
    if (doneN() < G.lastAt) G.lastAt = -99;                    // счётчик заказов обнулился (новая смена)
    if (G.n >= D.MAX || doneN() - G.lastAt < D.GAP) return;
  } else if (ev.type === 'staff' || sp.story) return;
  const lv = A.entranceLv(ev.x, ev.z);
  if (!forced && lv < D.LV) return;
  if (!forced && Math.random() >= D.CHANCE) return;
  G.force = null;
  G.n++; G.lastAt = doneN();
  return play(st, pickMode(forced), Math.max(lv, 5), o);
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
    let host = A.root().querySelector('#doorgame');
    if (!host) { host = document.createElement('div'); host.id = 'doorgame'; A.root().appendChild(host); }
    G.host = host;
    const person = st.persons && st.persons[0];
    const cur = G.cur = { st, order, mode, resolve, off: null, done: false };
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
    cur.off = INTERCOM.mount(host, { mode, flat, time, knocks: D.KNOCKS, fast: D.FAST, fastPad: D.FAST_PAD, addr: st.addr || '', who: person ? person.name : '' }, api);
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

export const DEBUG = {
  /* следующий подъезд (любой обычный адрес) — домофон этого вида: 'dial' | 'typo' | 'broken' | true (как выпадет) */
  force: (mode = true) => { G.force = mode; return mode; },
  /* решить открытый, как игрок: верно (wrong — сначала одна ошибка) */
  solve: wrong => { const b = G.host && G.host.querySelector('.dg'); if (b && b.__solve) { b.__solve(wrong); return true; } return false; },
  on,
  lv: (x, z) => (A ? A.entranceLv(x, z) : 0),           // этажей у подъезда (0 — не у подъезда)
  get last () { return G.last; },
  get n () { return G.n; },
  get mode () { return G.cur ? G.cur.mode : null; },
};
