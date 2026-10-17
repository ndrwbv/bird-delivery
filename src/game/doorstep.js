/* Мини-игры у клиента (IDEAS блок 13, 09.10.2026): домофон (minigames/intercom.js), подъезд — подняться на этаж
   (minigames/stairs.js) и разговор у двери (minigames/smalltalk.js, реплики — minigames/smalltalk-lines.js).
   Правила словами — docs/ORDERS.md «Домофон у подъезда», «Подъезд: подняться на этаж» и «Разговор с клиентом»,
   числа — ECON.DOOR, ECON.STAIRS и ECON.TALK (econ.js).

   Когда (автор 10.10.2026): общие часы настоящего времени — одна мини-игра раз в 5—10 минут игры на смене (ECON.DOORGAME);
   подошли — на следующем подходящем адресе (обычная пицца, вовремя), какая — по месту: подъезд многоэтажки — домофон
   или подъезд, клиент у двери — разговор (в одном заказе — что-то одно). Первая смена новичка — без мини-игр.
   Решается заранее (автор 11.10.2026: «чел сидит на лавке, а я звоню в домофон»): при выдаче заказа (plan, из game.js
   showOrderCard) — адрес и вид помечены в st.mgPlan; домофон и подъезд — клиент дома: game.js guestIn уводит его за
   дверь подъезда (снаружи его нет), после мини-игры guestOut — он у двери, вручение как обычно.
   «Клиент не дома» (домофон, mode 'away', 11.10.2026): набрал верно — клиент зовёт на другой адрес в D.AWAY.R м
   (тот же открытый район); game.js guestMove переносит его туда (пин, маршрут, адрес), срок + путь туда.
   Как встроено: подъехал к клиенту (orders.js onArrive, до вручения) — 2D-экран поверх игры. Руль стоит
   (game.js: DOOR.on() — ввод езды обнулён, машина тормозит), а срок заказа идёт: своего таймера у мини-игр нет.
   Квартира клиента — в накладной с начала заказа (homeOf; лист — ordersheet.js, он же в домофоне и подъезде).
   Кончилась — вручение как обычно; итог — в st.door / st.talk / st.stairs, деньги правит payStop
   (DOOR.payAdjust: «домофон с первого раза» +FAST_BONUS; срок вышел — доставка опоздавшая, как обычно;
   DOOR.talkAdjust: «поболтал с клиентом» +KEEP_TIP, «торопил клиента» — чаевые × RUSH_K, смешной — +FUN_TIP или без чаевых).

     DOOR.init(api)     — game.js после ORD.init: { ORD, S, Store, ADULT, Snd, money, root(), paused(), entranceLv(x, z), shiftsDone(), onShiftStart,
                          respect(why), hintFind() → { name, where, m } | null — ближайшая ненайденная находка (и отметить на карте),
                          guestIn(st) → bool — клиент дома (за дверью подъезда), guestOut(st) — вышел к двери,
                          guestMove(st, x, z) — клиент ждёт в другом месте (пин, адрес, маршрут), SPOTS — точки адресов,
                          nearestRoad(x, z, r, k), routeLen(x0, z0, x1, z1) }
     DOOR.plan(order)   — game.js showOrderCard: часы подошли — пометить адрес и вид мини-игры заранее (st.mgPlan)
     DOOR.on()          — мини-игра на экране (game.js: руль стоит, кнопки геймпада — её)
     DOOR.step(dt)      — каждый кадр мира (пауза и карта её стоят): часы мини-игр и сама мини-игра
     DOOR.homeOf(st, lv) — квартира остановки (game.js showOrderCard): { lv, per, entr, floor, door, flat } | null
     DOOR.pad(p)        — кнопки геймпада (game.js padStep), пока on()
     DOOR.enabled() / DOOR.setEnabled(on) — настройка «мини-игры у клиента» (settings.js, ключ dlv-doorgames)
     DOOR.payAdjust(st, fee, bonus, tip) → { bonus, tip, add, cut } — orders.js payStop (домофон)
     DOOR.talkAdjust(st, fee, tip) → { add, cut, kind, win } — orders.js payStop (разговор)
     DOOR.meetDone(st, res) — итог встречи-катсцены (encounters.js) при вручении: в st.talk, как у разговора (тепло — респект)
     DOOR.stairsAdjust(st, fee, bonus, tip) → { add, cut, gop } — orders.js payStop (подъезд)
     DOOR.ZHENYA_KEY    — ключ сохранения: скидка на следующий ремонт у Дяди Жени (доля; cars.js offer)
     DOOR.talkSfx(name) — звук разговора: 'blab' (бормочет по буквам), 'pick', 'coin', 'sad' — и для окна разговора (dialog.js)
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
import * as NICK from './nicks.js';             // подпись у двери — ник клиента из приложения (лицо — живое)
import { awayLine } from './minigames/intercom.js';
import * as DIST from './districts.js';
import * as ZN from './zones.js';
import * as LIKES from './likes.js';           // что нравится игроку: вес вида мини-игры — выбор и часы (likes.js, econ.js LIKES)
import * as CHAT from './chat.js';             // Толик: его лицо — у подсказки первого раза (learn)

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
  LIKES.init(api.Store);
  if (api.ORD && api.ORD.onArrive) api.ORD.onArrive(arrive);
  if (api.onShiftStart) api.onShiftStart(() => { G.n = 0; TG.n = 0; SG.n = 0; });
}
export const enabled = () => !A || !A.Store || String(A.Store.get(KEY, '1')) !== '0';

/* ── первый раз с каждым видом (за всё время, сохранение LEARN.KEY; ECON.DOORGAME.LEARN, автор 12.10.2026: «первый раз в
   мини-игре — всегда онбординг, и времени много дают»): Толик в ленте пишет, что делать (кнопками того, чем играешь), эталон
   «быстро» × LEARN.K, к сроку заказа + LEARN.ADD[вид] с. Вид простой: домофон — просто набрать, подъезд — без гопников ── */
const LN = MG.LEARN;
function learnSeen () {
  let v = null;
  try { v = A && A.Store ? A.Store.get(LN.KEY, null) : null; } catch (e) { v = null; }
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
  return v && typeof v === 'object' ? v : {};
}
/* первая встреча с видом kind → { person, name, add, k } (и сразу помечен как виденный; к сроку заказа — add с) | null */
function learnFirst (kind) {
  const seen = learnSeen();
  if (seen[kind]) return null;
  seen[kind] = 1;
  try { if (A && A.Store) A.Store.set(LN.KEY, seen); } catch (e) { /* без сохранения — подсказка будет и в следующий раз */ }
  const add = (LN.ADD && LN.ADD[kind]) || 0, S = A && A.S;
  if (add > 0 && S && !S.free && Number.isFinite(S.time) && S.time > 0) { S.time += add; S.timeMax += add; }
  let person = null;
  try { person = CHAT.person ? CHAT.person() : null; } catch (e) { person = null; }
  G.learnN = (G.learnN || 0) + 1;
  G.learnLast = { kind, add };
  return { person, name: t('Толик'), add, k: LN.K || 1 };
}
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
// что нравится игроку (likes.js): пропускал все виды — окно до ×LIKES.MG_SLOW, всё нравится — до ×MG_FAST
function fired () { TM.t = 0; TM.k = LIKES.slow('mg'); TM.next = rand(MG.EVERY[0], MG.EVERY[1]) * TM.k; }
/* итог мини-игры — в вес вида (likes.js): прошёл / поддержал разговор — «нравится»; поторопил клиента, нажал «пусть сам
   спустится» или простоял, ничего не нажав, до конца срока — «не нравится»; не успел, ошибся, срок кончился в игре, заказ
   сорвался — не в счёт. force — тоже не в счёт */
function like (kind, res, forced) {
  if (forced || !res || res.aborted) return;
  if (kind === 'talk') { if (res.kind === 'rush') LIKES.no('mg', 'talk'); else if (res.kind === 'keep' || res.kind === 'fun') LIKES.yes('mg', 'talk'); return; }
  if (res.self) LIKES.no('mg', kind);                 // отказался своей кнопкой (и у «не дома» — тоже)
  else if (res.ok) LIKES.yes('mg', kind);
  else if (res.idle) LIKES.no('mg', kind);
}
/* «пусть сам спустится» (ECON.DOORGAME.SELF): жребий чаевых — сразу, при отказе (чек и проверки видят один и тот же итог);
   у «не дома» клиента дома нет — чаевые не при чём */
function selfTip (res) { if (res && res.self && !res.away) res.tipKeep = Math.random() < MG.SELF.TIP_KEEP; return res; }

/* заранее, при выдаче заказа (game.js showOrderCard): часы подошли — первый подходящий адрес заказа и вид по месту —
   в st.mgPlan ('door' | 'stairs' | 'talk'); домофон и подъезд — клиент дома (guestIn), на улице и лавочке его нет.
   __dlv.DOOR.force() / stairs() — тоже сразу: клиент дома с выдачи */
export function plan (o) {
  if (!A || !o || o.mgPlanned || !o.stops) return null;
  o.mgPlanned = true;
  const forced = G.force ? 'door' : SG.force ? 'stairs' : TG.force ? 'talk' : '';
  if (forced) {
    if (forced === 'talk') return null;
    const st = o.stops.find(q => !q.done && q.peds && q.peds.length === 1 && !q.pickup && !q.surf);
    if (st && A.guestIn && A.guestIn(st)) st.mgIn = true;
    return null;
  }
  if (!due() || o.mg || A.shiftsDone() < MG.FROM_SHIFT || !planOk(o)) return null;
  for (const st of o.stops) {
    if (st.done || !stopOk(o, st)) continue;
    const kind = pickKind({ order: o, stop: st, x: (st.at || st.peds[0]).x, z: (st.at || st.peds[0]).z });
    if (!kind) continue;
    st.mgPlan = kind;
    G.lastKind = kind;
    if (kind !== 'talk' && A.guestIn && A.guestIn(st)) st.mgIn = true;   // домофон, подъезд — клиент дома
    fired();
    return kind;
  }
  return null;
}
/* заказ, на котором бывают мини-игры (без force; «вовремя» — уже на месте, arrive) */
function planOk (o) {
  const sp = o.ord;
  if (!sp || !enabled() || o.tut) return false;
  return sp.type === 'pizza' && !sp.urgent && !sp.beach && !sp.fest && !sp.story;
}
const stopOk = (o, st) => !!(st.peds && st.peds.length && !st.beach && !st.fest && !st.pickup && !st.surf && (st.zone || o.ord.zone) !== 'gang');
/* клиент дома — вышел к двери за пиццей (после мини-игры, или она не случилась) */
function out (st) { if (st && st.mgIn) { st.mgIn = false; if (A.guestOut) A.guestOut(st); } }

/* подъехал к клиенту: адрес помечен заранее (plan) и вовремя — Promise (вручение ждёт), нет — ничего.
   Не успел (опоздал, срока меньше MIN_LEFT, мини-игры выключили) — часы снова «подошли»: следующий заказ.
   __dlv.DOOR.force() / talk() / stairs() — без часов и правил места */
function arrive (ev) {
  if (!A || G.cur) return;
  const st = ev.stop;
  const forced = !!(G.force || SG.force || TG.force);
  let r = null;
  if (G.force) r = door(ev, true) || talk(ev, true);
  else if (SG.force) r = stairs(ev, true);
  else if (TG.force) r = talk(ev, true);
  else if (st.mgPlan) {
    const k = st.mgPlan;
    st.mgPlan = null;
    const late = !ev.onTime || (A.S && !A.S.free && A.S.time < MG.MIN_LEFT);
    if (late || !enabled() || ev.order.mg) TM.t = Math.max(TM.t, TM.next);   // не сыграли — часы снова подошли
    else r = k === 'door' ? door(ev) : k === 'stairs' ? stairs(ev) : talk(ev);
  }
  if (!r) { out(st); return; }
  // домофон и подъезд — клиент за дверью; после мини-игры (не «не дома») — выходит к двери за пиццей
  if (G.cur && G.cur.type !== 'talk' && !st.mgIn && A.guestIn && A.guestIn(st)) st.mgIn = true;
  const kind = G.cur ? G.cur.type : '';
  return r.then(() => { like(kind, kind ? st[kind] : null, forced); if (!(st.door && st.door.away)) out(st); });
}
/* какая — по месту: у подъезда дома от DOOR.LV этажей — домофон, от STAIRS.LV — и подъезд; клиент у двери — разговор */
function pickKind (ev) {
  const lv = A.entranceLv(ev.x, ev.z), st = ev.stop;
  const person = st.persons && st.persons[0], ped = st.peds && st.peds[0];
  const one = !!st.peds && st.peds.length === 1;          // компания на улице (групповой) — только разговор: домой её не уведёшь
  const can = { door: one && lv >= D.LV, stairs: one && lv >= SR.LV, talk: !!person && !(ped && ped.dead) };
  let ks = Object.keys(can).filter(k => can[k] && (MG.W[k] || 0) > 0);
  if (ks.length > 1 && ks.includes(G.lastKind)) ks = ks.filter(k => k !== G.lastKind);   // не подряд одна и та же (автор 16.10.2026)
  if (!ks.length) return null;
  // что нравится игроку (likes.js): вес места × вес вида; всё, что подходит месту, не нравится (лучший вес < 1) —
  // с долей 1 − лучший вес мини-игры здесь нет, часы ждут следующего адреса
  const lw = k => MG.W[k] * LIKES.w('mg', k);
  const best = Math.min(1, Math.max(...ks.map(k => LIKES.w('mg', k))));
  if (Math.random() >= best) { G.likeSkip = (G.likeSkip || 0) + 1; return null; }
  let sum = ks.reduce((a, k) => a + lw(k), 0), r = Math.random() * sum;
  for (const k of ks) { r -= lw(k); if (r <= 0) return k; }
  return ks[0] || null;
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
  const ln = learnFirst('door');                                 // первый домофон — просто набрать, с подсказкой и запасом
  return play(st, ln && (!fm || fm === true) ? 'dial' : pickMode(fm), Math.max(lv, 5), o, ln);
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
  const ln = learnFirst('stairs');                               // первый подъезд — без гопников, с подсказкой и запасом
  const gop = fo.gop !== undefined ? !!fo.gop : !ln && A.shiftsDone() >= SR.GOP_FROM && Math.random() < SR.GOP_P;
  // квартира — та же, что в накладной (homeOf); дом ниже SR.LV или квартиры нет (force) — своя
  const lvH = Math.max(lv, SR.LV);
  let h = st.home && st.home.lv >= SR.LV && st.home.floor >= 2 ? st.home : null;
  if (!h || fo.floor || fo.lv || fo.per || fo.entr) { st.home = Object.assign(STAIRS_PLAN(Object.assign({ lv: lvH }, fo, { gop: false })), { lv: fo.lv || lvH }); st.home.flat = String(st.home.flat); h = st.home; }
  const opt = Object.assign({}, fo, { lv: h.lv, floor: h.floor, per: h.per, entr: h.entr, door: h.door, gop });
  if (ln) { opt.learn = ln; opt.time = STAIRS_PLAN(Object.assign({}, opt, { time: fo.time })).time * ln.k; }
  return playStairs(st, o, opt);
}

function playStairs (st, order, opt) {
  return new Promise(resolve => {
    const h = host();
    const person = st.persons && st.persons[0];
    const cur = G.cur = { type: 'stairs', st, order, mode: 'stairs', resolve, off: null, done: false };
    const end = res => {
      if (cur.done) return;
      cur.done = true;
      st.stairs = Object.assign({ mode: 'stairs' }, selfTip(res) || { ok: false, aborted: true });
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
      addr: st.addr || '', who: person ? (person.app ? NICK.label(person) : person.first || person.name) : '', person, sheet: sheetOf(order), clock,
      bonus: '+' + money(r10(fee * SR.FAST_BONUS)), gopPay: '−' + money(r10(fee * SR.GOP_PAY)), selfWait: MG.SELF.WAIT,
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
  const ln = learnFirst('talk');                                 // первый разговор — подсказка, к сроку запас
  const fem = person.fem !== undefined ? !!person.fem : ped && ped.grp && ped.grp.userData ? !!ped.grp.userData.fem : null;
  return playTalk(st, o, person, fem, typeof sit === 'string' ? sit : '', ln);
}

function host () {
  let h = A.root().querySelector('#doorgame');
  if (!h) { h = document.createElement('div'); h.id = 'doorgame'; A.root().appendChild(h); }
  G.host = h;
  return h;
}

function playTalk (st, order, person, fem, sit, ln) {
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
      sit, person, fem, who: (person.app ? NICK.label(person) : person.first) || '', learn: ln || null,
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

/* звуки разговора: бормотание по буквам, выбор, монетка / вздох (файлы public/sfx, без них — синтез);
   тот же звук — у окна разговора (dialog.js, game.js DLG.init sfx: DOOR.talkSfx) */
export function talkSfx (name) { talkSound(name); }
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

/* что выпало: с AWAY.FROM-й смены — клиент не дома, с SMUDGE_FROM-й смены — пятно на цифре, с TYPO_FROM-й — опечатка, с BROKEN_FROM-й — сломан */
function pickMode (forced) {
  if (forced && forced !== true) return forced;
  const n = A.shiftsDone();
  if (n >= D.AWAY.FROM && Math.random() < D.AWAY.P) return 'away';
  if (n >= D.BROKEN_FROM && Math.random() < D.BROKEN_P) return 'broken';
  if (n >= D.TYPO_FROM && Math.random() < D.TYPO_P) return 'typo';
  if (n >= D.SMUDGE_FROM && Math.random() < D.SMUDGE_P) return 'smudge';
  return 'dial';
}

function play (st, mode, lv, order, ln) {
  // квартира — из накладной (homeOf); у force не у подъезда — своя
  const h = homeOf(st, lv) || (st.home = { lv, flat: String(rint(12, 98)) });
  const shown = String(h.flat);
  // не дома: куда зовёт — точка в D.AWAY.R м в том же открытом районе; не нашлась — обычный домофон
  const aw = mode === 'away' ? awaySpot(st) : null;
  if (mode === 'away' && !aw) mode = 'dial';
  if ((mode === 'typo' || mode === 'smudge') && (shown.length < 2 || (mode === 'typo' && swapDigits(shown) === shown))) mode = 'dial';
  const flat = mode === 'typo' ? swapDigits(shown) : shown;
  const time = (mode === 'broken' ? D.T.knock : (flat.length >= 3 ? D.T.three : D.T.two) + (mode === 'typo' ? D.T.typo : 0) + (mode === 'smudge' ? D.T.smudge : 0)) * (ln ? ln.k : 1);
  const fee = feeOf(order, st);
  return new Promise(resolve => {
    const hh = host();
    const person = st.persons && st.persons[0];
    const cur = G.cur = { type: 'door', st, order, mode, resolve, off: null, done: false };
    const end = res => {
      if (cur.done) return;
      cur.done = true;
      st.door = Object.assign({ mode }, selfTip(res) || { ok: false, aborted: true });
      G.last = st.door;
      if (aw && res && res.away) moveAway(st, aw);
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
      addr: st.addr || '', who: person ? (person.app ? NICK.label(person) : person.first || person.name) : '', person,
      sheet: sheetOf(order), bonus: '+' + money(r10(fee * D.FAST_BONUS)), clock,
      away: aw ? { addr: aw.addr, say: awayLine(!!A.ADULT) } : null, learn: ln || null, selfWait: MG.SELF.WAIT,
    }, sceneOf(order, st)), api);
    sound('ring');
  });
}

/* «клиент не дома»: точка в D.AWAY.R м (по прямой) от адреса — в том же районе, открытая (как orders.js openSpot: у
   ближайшей дороги и на кольце 25 м район открыт), не у бандитов; путь по дорогам — не дальше 2 × по прямой (или R). → { x, z, addr, L } | null */
const OPEN_R = 25;
function openAt (x, z) {
  if (!DIST.has()) return true;
  const ok = (px, pz) => DIST.isOpen(DIST.at(px, pz));
  const r = A.nearestRoad ? A.nearestRoad(x, z, 60, 1) : null;
  if (r && !ok(r.x, r.z)) return false;
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; if (!ok(x + Math.cos(a) * OPEN_R, z + Math.sin(a) * OPEN_R)) return false; }
  return true;
}
function awaySpot (st) {
  const at = st.at || (st.peds && st.peds[0]), SP = A.SPOTS || [];
  if (!at || !SP.length || !A.guestMove) return null;
  const [r0, r1] = D.AWAY.R, di = DIST.has() ? DIST.at(at.x, at.z) : -1;
  const cand = [];
  for (const q of SP) {
    const d = Math.hypot(q.x - at.x, q.z - at.z);
    if (d < r0 || d > r1) continue;
    if (di >= 0 && DIST.at(q.x, q.z) !== di) continue;
    cand.push(q);
  }
  for (let k = 0; k < 14 && cand.length; k++) {
    const q = cand.splice((Math.random() * cand.length) | 0, 1)[0];
    if (!openAt(q.x, q.z) || ZN.zoneAt(q.x, q.z) === 'gang') continue;
    const L = A.routeLen ? A.routeLen(at.x, at.z, q.x, q.z) : Math.hypot(q.x - at.x, q.z - at.z) * 1.4;
    if (!Number.isFinite(L) || L > Math.max(2 * Math.hypot(q.x - at.x, q.z - at.z), r1)) continue;   // по дорогам — не в объезд через полрайона
    return { x: q.x, z: q.z, L, addr: A.realAddress ? A.realAddress(q.x, q.z) : '' };
  }
  return null;
}
/* клиент переехал: game.js guestMove — он там на улице (пин, маршрут, адрес); в накладной старый адрес зачёркнут
   (st.addrWas), квартиры больше нет. Срок — + путь туда по дорогам (честно; опоздал уже — опоздал) */
function moveAway (st, aw) {
  const flat = st.home && st.home.flat;
  st.addrWas = (st.addr || '') + (flat ? ', ' + t('кв. {n}', { n: flat }) : '');
  st.home = null;
  st.mgIn = false;
  A.guestMove(st, aw.x, aw.z);
  if (aw.addr && !st.addr) st.addr = aw.addr;
  const S = A.S;
  if (S && !S.free && S.time > 0) {
    const add = Math.round(aw.L / D.AWAY.V * D.AWAY.SLACK + D.AWAY.ADD);
    S.time += add; S.timeMax += add;
    st.door.add = add;
  }
  st.door.to = { x: +aw.x.toFixed(1), z: +aw.z.toFixed(1), addr: st.addr, L: Math.round(aw.L) };
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

/* деньги: быстро и с первого раза — +FAST_BONUS от цены адреса; не успел — «за скорость» и чаевые × SLOW_K;
   «пусть сам спустится» — без бонуса, чаевые остались с шансом SELF.TIP_KEEP (не остались — минус чаевые, «спускался сам») */
export function payAdjust (st, fee, bonus, tip) {
  const r = st && st.door;
  if (!r || r.aborted) return { bonus, tip, add: 0, cut: 0 };
  if (r.self) return { bonus, tip, add: 0, cut: r.tipKeep === false ? tip : 0 };
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

/* встреча-катсцена у двери (encounters.js) прошла как вручение заказа: итог — туда же, где итог разговора (st.talk),
   и дальше всё как у разговора: talkAdjust → payStop, строка в чеке (row), лицо на карточке оплаты (mood; person — герой).
   res — { kind, win, out, row, mood, person, … } или null (пропустили до ответа — денег не меняет) */
export function meetDone (st, res) {
  if (!st) return;
  st.talk = res || { aborted: true, enc: true };
  TG.last = st.talk;
  if (res && res.kind === 'keep' && A && A.respect && !(A.S && A.S.freeRun)) A.respect('chat');   // тепло — респект +1
}

/* деньги подъезда: дошёл с первого раза и быстро — +FAST_BONUS цены адреса; не успел — «за скорость» и чаевые × SLOW_K;
   откупился от гопников — GOP_PAY цены адреса; «пусть сам спустится» — чаевые остались с шансом SELF.TIP_KEEP */
export function stairsAdjust (st, fee, bonus, tip) {
  const r = st && st.stairs;
  if (!r || r.aborted) return { add: 0, cut: 0, gop: 0 };
  const r10 = v => Math.round(v / 10) * 10;
  return {
    add: r.ok && r.fast ? r10(fee * SR.FAST_BONUS) : 0,
    cut: r.timeout ? r10((bonus + tip) * (1 - SR.SLOW_K)) : r.self && r.tipKeep === false ? tip : 0,
    gop: r.gop === 'pay' ? r10(fee * SR.GOP_PAY) : 0,
  };
}

export const DEBUG = {
  /* общие часы мини-игр: сколько набежало и когда следующая, с; due() — «подошло», следующий подходящий адрес — мини-игра по месту */
  get timer () { return { t: +TM.t.toFixed(1), next: +TM.next.toFixed(1), due: due() }; },
  due: () => { TM.t = TM.next; return true; },
  setNext: s => { TM.next = +s; return TM.next; },          // проверки: когда часы подойдут (с с начала окна)
  /* следующий подъезд (любой обычный адрес) — домофон этого вида: 'dial' | 'smudge' | 'typo' | 'broken' | true (как выпадет) */
  force: (mode = true) => { G.force = mode; return mode; },   // ещё 'away' — клиент не дома
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
    else if (b.classList.contains('sx')) b.__solve(arg);   // подъезд: '' — пройти, 'pay' — откупиться от гопников, 'wrong' — сначала чужая дверь, 'late' — не успеть, 'self' — «пусть сам спустится»
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
  /* что помечено заранее у текущего заказа: [{ addr, plan, inside }] */
  get planned () { const o = A && A.S && A.S.order; return o && o.stops ? o.stops.map(st => ({ addr: st.addr, plan: st.mgPlan || null, inside: !!st.mgIn, was: st.addrWas || null })) : null; },
  get talkN () { return TG.n; },
  /* что нравится игроку (likes.js): веса видов, во сколько раз реже часы, сколько раз место пропустили из-за веса */
  get likes () { return { w: { door: LIKES.w('mg', 'door'), stairs: LIKES.w('mg', 'stairs'), talk: LIKES.w('mg', 'talk') }, k: +LIKES.slow('mg').toFixed(2), skip: G.likeSkip || 0 }; },
  pickKind: ev => pickKind(ev),
  /* первый раз (ECON.DOORGAME.LEARN): какие виды уже видел, сколько подсказок показано, последняя { kind, add }; reset() — как новичок */
  get learn () { return { seen: learnSeen(), n: G.learnN || 0, last: G.learnLast || null }; },
  learnReset: () => { try { if (A && A.Store) A.Store.set(LN.KEY, {}); } catch (e) { /* — */ } return true; },
  get sit () { const b = G.host && G.host.querySelector('.tk'); return b ? b.__sit : null; },
};
