/* Поручения «сгоняй за…»: кто ждёт и кто отдаёт (docs/ORDERS.md «Поручения»).
   Сам выбор поручения и диалог-просьба — orders.js (offerSide, SIDE_ORDERS в orders.config.js),
   езда туда-обратно — game.js (startSide / sideArrival / sideEnd). Здесь — люди:

   - Клиент, который попросил, ЖДЁТ ТАМ ЖЕ, где взял пиццу (баг 11.10.2026: после покупки пин уезжал
     за район — клиент с пиццей уходил в подъезд, и прохожий-«он» возрождался в 90—400 м другим человеком,
     а цель ставилась на его новое место). hold() — помечает его p.errand: стоит с пиццей и не уходит;
     ensureClient() — когда едешь обратно: если его всё-таки сдвинули или подменили — возвращает на место
     тем же человеком. Цель обратно — пин перед его точкой (Sd.at), а не его координаты.
   - Человек у подъезда (giver в SIDE_ORDERS: сестра, бывшая, сосед): giverSpot() — подъезд в том же районе
     в GIVE.MIN—GIVE.MAX м от клиента, spawnGiver() — ставит туда прохожего этим человеком (дальнего от
     камеры, чтобы не телепортировался на глазах); подъехал — giverTalk(): его реплика и два ответа, исход —
     отдаёт / отдаёт не то / ничего не даёт / просит взамен (talk в SIDE_ORDERS). Едешь к клиенту в любом случае.
   - thanks(): при вручении клиент говорит одну реплику: привёз — thanks и чаевые сленгом из SIDE_TIPS
     («на тебе фиолет» — +500 ₽); не то или ни с чем — back (злится, смеётся, даёт за попытку).
     Диалог в одну кнопку «понятно» — закрывает игрок (таймера нет, автор 16.10.2026); чаевые — под портретом.
   - step(): каждый кадр — поручение кончилось любым путём (выполнил, опоздал, смена, меню) —
     клиента и отдающего отпускаем (p.errand снимается, идут дальше).
   - bump(): сбил того, кто ждёт поручения (клиента или отдающего; автор 16.10.2026: «лучше бы он сбивался, но не
     умирал») — падает без крови, полежал ~2 с, встаёт и ругается репликой над головой (OUCH, каждый раз другой);
     поручение идёт дальше, он остаётся на своём месте. */
import { t, N_ } from '../i18n/index.js';
import * as DLG from './dialog.js';
import { makePerson } from './people.js';
import { SIDE_TIPS, ORDER_TYPES } from './orders.config.js';
import * as DCAST from './doorcast.js';        // кот у ног клиента, когда ему привезли корм / забрали от ветеринара (doorcast.js)

/* где ищем отдающего: подъезд в MIN—MAX м от клиента; OFF — на сколько м от двери он стоит */
export const GIVE = { MIN: 60, MAX: 380, OFF: 1.4 };
/* песочница (docs/SANDBOX.md «Поручения»): near — магазин и отдающий не дальше near м (0 — как в игре, до 380);
   force — исход у отдающего: 'give' | 'wrong' | 'none' (null — как выпадет); talk / paid — что было в последнем
   разговоре и вручении (n — номер по счёту), их читает журнал песочницы */
export const SBX = { near: 0, force: null, talk: null, paid: null, n: 0 };

let A = null;
const TR = { client: null, giver: null };
/* сбил ждущего (bump): что он скажет, когда встанет. client — тот, кто попросил; giver — человек у подъезда.
   adult — взрослая (мат), kids — детская. SAY — через сколько с после удара (встаёт — hits.js fallStep, ~2,7 с),
   SHOW — сколько с висит облачко */
const OUCH = {
  SAY: 2.4, SHOW: 2.8,
  adult: {
    client: [
      N_('ты охуел?! я тебя за делом послал, а не меня давить'),
      N_('сука, я ж тебя тут жду! не на капоте же'),
      N_('ёб твою мать… цел. всё, гони давай, я тут стою'),
      N_('опять?! ты специально, что ли, блядь'),
      N_('нормально, нормально… полежал — и хватит. гони уже'),
      N_('я тебя не за этим звал, долбоёб'),
      N_('хуй ты меня собьёшь, я девяностые пережил'),
      N_('бля, спина… ладно, жду. только объезжай меня, сука'),
    ],
    giver: [
      N_('ты чё, бля?! я тебе тут вещи отдаю, а ты давишь'),
      N_('сука, жду его, жду — и он меня же сбивает'),
      N_('ну пиздец. кто тебе права продал?'),
      N_('ещё раз — и я тебе сам фары разобью, понял?'),
      N_('ёпта… ладно, живы будем. подъезжай нормально'),
    ],
  },
  kids: {
    client: [
      N_('ой! осторожнее, я же тебя жду!'),
      N_('эй! я просил сгонять, а не сбивать'),
      N_('опять?! смотри на дорогу!'),
      N_('ничего, ничего, мне не больно. почти. давай быстрее!'),
      N_('ну ты даёшь! чуть коленку не разбил'),
      N_('ай-ай… ну и водитель! я тут подожду'),
    ],
    giver: [
      N_('ой! я же тут тебя жду!'),
      N_('эй! кто тебя водить учил?'),
      N_('осторожнее! я тут стою вообще-то'),
      N_('ай! ну и курьер пошёл…'),
    ],
  },
};
const DECK = { client: [], giver: [], last: { client: '', giver: '' } };
const OUCHQ = [];                                  // { p, t, line, b } — ждёт, когда встанет / облачко висит
/* api: { S, V, CITY, ADULT, alive, makeGuest, clearGuest, afterDrop, releaseIdle, pushOut, rehuman, pinFront, zoneOk,
        money(n) — сумма строкой, wallet() — сколько в кошельке, spend(n) — взять из кошелька → сколько взяли,
        fall(p, vx, vz) — упал и встал (hits.js), sayBubble(grp, text, col, y), toast(text) } */
export function init (api) {
  A = api;
  if (typeof window !== 'undefined') window.setTimeout(() => { if (window.__dlv) window.__dlv.ERRS = DEBUG; }, 0);
}

const d2 = (a, x, z) => (a.x - x) ** 2 + (a.z - z) ** 2;
const firstOf = p => (p && (p.first || (p.name || '').split(/\s+/)[0])) || '';

/* ── клиент ждёт ── */
export function hold (Sd) {
  const p = Sd.ped;
  Sd.home = { x: p.x, z: p.z };
  Sd.at = A.pinFront(p.x, p.z);
  p.errand = true;
  if (p.after) A.afterDrop(p, true);
  if (!p.guest) A.makeGuest(p, { x: p.x, z: p.z });
  TR.client = p;
}
/* едешь обратно: клиент на своём месте и тем же человеком */
export function ensureClient (Sd) {
  const p = Sd.ped, h = Sd.home;
  if (!p || p.dead || !h) return;
  if (p.person !== Sd.person && A.rehuman) { A.rehuman(p, Sd.person); p.hold = null; }
  if (!p.guest || Math.hypot(p.x - h.x, p.z - h.z) > 4) {
    if (p.after) A.afterDrop(p, true);
    if (p.idle) A.releaseIdle(p);
    if (p.guest) A.clearGuest(p);
    p.path = null; p.w = null;
    p.x = h.x; p.z = h.z;
    A.makeGuest(p, { x: h.x, z: h.z });
  }
  p.errand = true;
  TR.client = p;
}

/* ── человек у подъезда отдаёт пакет ── */
export function giverSpot (spec, ped) {
  const E = A && A.CITY && A.CITY.entrances;
  if (!E || !E.length || !spec.giver) return null;
  const near = [], far = [];
  for (const e of E) {
    const d = Math.hypot(e[0] - ped.x, e[1] - ped.z);
    if (d < GIVE.MIN || d > (SBX.near || GIVE.MAX)) continue;
    const x = e[0] + e[2] * GIVE.OFF, z = e[1] + e[3] * GIVE.OFF;
    if (A.zoneOk && !A.zoneOk(x, z)) continue;      // в районе, где работаешь, и не за перекрытием
    (d < 220 ? near : far).push({ x, z, nx: e[2], nz: e[3], e });
  }
  const L = near.length ? near : far;
  if (!L.length) return null;
  const q = L[Math.floor(Math.random() * L.length)];
  return { ...q, n: t(spec.giver.who), giver: spec.giver };
}
function personFor (g) {
  let p = null;
  for (let i = 0; i < 16; i++) {
    p = makePerson({ fem: !!g.fem });
    const old = p.look && p.look.age === 'old';
    if (g.old ? old : !old) break;
  }
  return p;
}
export function spawnGiver (spot) {
  const V = A.V;
  const pool = A.alive().filter(p => !p.dead && !p.guest && !p.after && !p.party && p.base !== undefined && p.grp);
  if (!pool.length) return null;
  pool.sort((a, b) => d2(b, V.x, V.z) - d2(a, V.x, V.z));   // самый дальний от камеры — появится не на глазах
  const p = pool[0];
  if (p.idle) A.releaseIdle(p);
  p.path = null; p.w = null;
  A.rehuman(p, personFor(spot.giver));
  p.hold = null;
  p.x = spot.x; p.z = spot.z;
  A.pushOut(p, 0.5);
  A.makeGuest(p, { x: p.x, z: p.z });
  p.errand = true;
  TR.giver = p;
  return p;
}
/* подъехал к отдающему: короткий разговор (SIDE_ORDERS talk) — его реплика и два ответа, потом его ответ.
   → Promise { k: 'give' | 'wrong' | 'none', item?, cost? } — что везёшь клиенту (cost — уже отдал из кошелька) */
function wpick (L) {
  const sum = L.reduce((a, q) => a + (q.w || 1), 0);
  let r = Math.random() * sum;
  for (const q of L) { r -= q.w || 1; if (r <= 0) return q; }
  return L[L.length - 1];
}
export async function giverTalk (Sd) {
  const p = Sd.giverPed, g = Sd.shop && Sd.shop.giver, s = Sd.it && Sd.it.spec, tk = s && s.talk;
  if (!p || !g || p.dead) return { k: 'none' };
  const name = firstOf(p.person) + ' · ' + t(g.who), base = { person: p.person, name, head: t('поручение'), emo: g.emo || undefined, fillers: false, color: ORDER_TYPES.side.color };
  if (!tk) return { k: 'give' };
  const cost = tk.cost || 0;
  // просит взамен — сумма под портретом, красным (автор 12.10.2026: «сумма отдельно под аватаркой»)
  const r = await DLG.say({ ...base, text: t(tk.line), accept: t(tk.yes), decline: t(tk.no), ...(cost ? { pay: '−' + A.money(cost), payLabel: t('отдать') } : {}) });
  let yes = r === true;
  let paid = 0;
  if (yes && cost && A.wallet() < cost) yes = false;   // денег в кошельке нет — как «нет»
  let L = yes ? tk.onYes : tk.onNo, mine = true;
  if (SBX.force) {                                     // песочница: исход задан — из ветки ответа, нет в ней — из другой
    const a = L.filter(q => q.k === SBX.force), b = (yes ? tk.onNo : tk.onYes).filter(q => q.k === SBX.force);
    if (a.length) L = a; else if (b.length) { L = b; mine = false; }
  }
  if (yes && cost && mine) paid = A.spend(cost);
  const oc = wpick(L);
  SBX.talk = { n: ++SBX.n, id: s.id, ans: r === true ? 'yes' : r === false ? 'no' : 'none', k: oc.k, item: oc.item ? t(oc.item) : '', cost: paid, force: SBX.force };
  await DLG.say({ ...base, text: t(oc.say), accept: t('понятно'), emo: oc.k === 'none' ? 'angry' : undefined });
  return { k: oc.k, item: oc.item ? t(oc.item) : '', cost: paid };
}

/* ── вручение: реплика и деньги по исходу ──
   → { tip, k } — k: доля оплаты поручения (1 — целиком); tip — чаевые, ₽ (как видит игрок).
   Привёз, что просил: thanks + фраза чаевых (SIDE_TIPS). Не то или ни с чем: реплика back (злится, смеётся,
   даёт за попытку) и pay из неё. Без реплик (Яндекс, старый путь) — { tip: 0, k: 1 } */
export function thanks (Sd) {
  const s = Sd.it && Sd.it.spec;
  if (!s || !s.thanks) return { tip: 0, k: 1 };
  const oc = Sd.outcome || { k: 'give' }, b = s.back || {};
  if (oc.k !== 'give') {
    const q = oc.k === 'wrong' ? (b.wrong || { say: s.thanks, pay: 1 }) : wpick([].concat(b.none || { say: s.thanks, pay: 0, emo: 'angry' }));
    DLG.say({ person: Sd.person, name: firstOf(Sd.person), head: t('поручение'), text: t(q.say), accept: t('понятно'), emo: q.emo || undefined, fillers: false, color: ORDER_TYPES.side.color });
    paidLog(Sd, oc.k, q.pay || 0, 0);
    return { tip: 0, k: q.pay || 0 };
  }
  const L = SIDE_TIPS.filter(q => (A.ADULT ? !q.kids : !q.adult));
  const q = L.length ? wpick(L) : null;
  const th = t(s.thanks), tip = q ? q.tip : 0;
  const text = q ? th + (/[.!?…—]$/.test(th) ? ' ' : ', ') + t(q.say) : th;
  // pet — к кому это (кот): выходит к ногам клиента, «Мяу» (doorcast.js) — «Барсик, жри» говорят тому, кого видно
  const pet = s.pet === 'cat' && Sd.ped && !Sd.ped.dead ? DCAST.cat(Sd.ped) : null;
  if (pet) setTimeout(() => pet.go(), 7000);
  DLG.say({ person: Sd.person, name: firstOf(Sd.person), head: t('поручение'), text, accept: t('понятно'), emo: 'happy', fillers: false, color: ORDER_TYPES.side.color,
    ...(tip > 0 ? { pay: '+' + A.money(tip), payLabel: t('чаевые') } : {}) });
  paidLog(Sd, 'give', 1, tip);
  return { tip, k: 1 };
}
/* для журнала песочницы: сколько заплатили — та же формула, что в game.js sideArrival */
function paidLog (Sd, k, share, tip) {
  const base = (Sd.it && Sd.it.pay) || 1000;
  SBX.paid = { n: ++SBX.n, id: Sd.it && Sd.it.spec && Sd.it.spec.id, k, share, tip, base, pay: Math.round(base * share) + tip };
}

/* ── сбил ждущего: падает и встаёт ──
   p — человек, которого задела машина (или взрыв); vx, vz — куда толкнули. true — это ждущий поручения: он упал
   (hits.js fall — как от лёгкого удара: без крови, без «сбит», без скорой), дальше с ним ничего не делать.
   Сбить можно сколько угодно раз — каждый раз встаёт; реплики идут колодой: подряд одна и та же не выпадает */
function nextLine (who) {
  const L = OUCH[A.ADULT ? 'adult' : 'kids'][who];
  let D = DECK[who];
  if (!D.length) {
    D = DECK[who] = L.slice().sort(() => Math.random() - 0.5);
    if (D.length > 1 && D[D.length - 1] === DECK.last[who]) D.unshift(D.pop());   // берём с конца: прошлая — не первой
  }
  return (DECK.last[who] = D.pop());
}
export function bump (p, vx, vz) {
  if (!A || !p || !p.errand || p.dead) return false;
  const who = p === TR.client ? 'client' : p === TR.giver ? 'giver' : null;
  if (!who) return false;
  if (p.fall) return true;                         // ещё лежит — второй раз не роняем
  if (p.idle) A.releaseIdle(p);
  A.fall(p, vx, vz);
  p.shock = 0;
  p.ouch = (p.ouch || 0) + 1;
  for (let i = OUCHQ.length - 1; i >= 0; i--) if (OUCHQ[i].p === p) { unsay(OUCHQ[i]); OUCHQ.splice(i, 1); }
  OUCHQ.push({ p, t: OUCH.SAY, line: t(nextLine(who)), b: null, who });
  SBX.ouch = { n: ++SBX.n, who, line: OUCHQ[OUCHQ.length - 1].line, times: p.ouch };
  return true;
}
function unsay (q) {
  if (!q.b) return;
  if (q.b.parent) q.b.parent.remove(q.b);
  if (q.b.material) q.b.material.dispose();
  q.b = null;
}
function ouchStep (dt) {
  for (let i = OUCHQ.length - 1; i >= 0; i--) {
    const q = OUCHQ[i];
    if (q.p.dead) { unsay(q); OUCHQ.splice(i, 1); continue; }
    q.t -= dt;
    if (!q.b && q.t <= 0) {                        // встаёт — ругается
      q.b = A.sayBubble ? A.sayBubble(q.p.grp, q.line, '#d9342c', 2.7) : null;
      if (A.toast) A.toast(t('{who}: «{line}»', { who: firstOf(q.p.person) || (q.who === 'giver' ? t('отдающий') : t('клиент')), line: q.line }));
      q.t = OUCH.SHOW;
      if (!q.b) { OUCHQ.splice(i, 1); continue; }
    } else if (q.b && q.t <= 0) { unsay(q); OUCHQ.splice(i, 1); }
  }
}

/* ── отпустить ── */
function release (p) {
  if (!p) return;
  p.errand = false;
  if (p.guest && !p.served) A.clearGuest(p);      // с пиццей в руках — постоит p.freeT и пойдёт сам (game.js guestStep)
}
export function step (dt = 1 / 60) {
  if (!A) return;
  if (OUCHQ.length) ouchStep(dt);
  const Sd = A.S.side;
  if (TR.client && (!Sd || Sd.ped !== TR.client)) { release(TR.client); TR.client = null; }
  if (TR.giver && (!Sd || Sd.giverPed !== TR.giver || (Sd.stage !== 'shop' && Sd.stage !== 'talk'))) { release(TR.giver); TR.giver = null; }
}

export const DEBUG = { TR, GIVE, SBX, OUCH, OUCHQ, bump };
