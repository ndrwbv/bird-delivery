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
     Диалог в одну кнопку, дальше сам (DLG auto, ~2—4 с).
   - step(): каждый кадр — поручение кончилось любым путём (выполнил, опоздал, смена, меню) —
     клиента и отдающего отпускаем (p.errand снимается, идут дальше). */
import { t } from '../i18n/index.js';
import * as DLG from './dialog.js';
import { makePerson } from './people.js';
import { SIDE_TIPS, ORDER_TYPES } from './orders.config.js';

/* где ищем отдающего: подъезд в MIN—MAX м от клиента; OFF — на сколько м от двери он стоит */
export const GIVE = { MIN: 60, MAX: 380, OFF: 1.4 };

let A = null;
const TR = { client: null, giver: null };
/* api: { S, V, CITY, ADULT, alive, makeGuest, clearGuest, afterDrop, releaseIdle, pushOut, rehuman, pinFront, zoneOk,
        money(n) — сумма строкой, wallet() — сколько в кошельке, spend(n) — взять из кошелька → сколько взяли } */
export function init (api) { A = api; }

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
    if (d < GIVE.MIN || d > GIVE.MAX) continue;
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
  const name = firstOf(p.person) + ' · ' + t(g.who), base = { person: p.person, name, emo: g.emo || undefined, fillers: false, color: ORDER_TYPES.side.color };
  if (!tk) return { k: 'give' };
  const cost = tk.cost || 0;
  const r = await DLG.say({ ...base, text: t(tk.line), accept: t(tk.yes) + (cost ? ' (−' + A.money(cost) + ')' : ''), decline: t(tk.no) });
  let yes = r === true;
  let paid = 0;
  if (yes && cost) { if (A.wallet() >= cost) paid = A.spend(cost); else yes = false; }   // денег в кошельке нет — как «нет»
  const oc = wpick(yes ? tk.onYes : tk.onNo);
  await DLG.say({ ...base, text: t(oc.say), auto: true, emo: oc.k === 'none' ? 'angry' : undefined });
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
    DLG.say({ person: Sd.person, name: firstOf(Sd.person), text: t(q.say), auto: true, emo: q.emo || undefined, fillers: false, color: ORDER_TYPES.side.color });
    return { tip: 0, k: q.pay || 0 };
  }
  const L = SIDE_TIPS.filter(q => (A.ADULT ? !q.kids : !q.adult));
  const q = L.length ? wpick(L) : null;
  const th = t(s.thanks), tip = q ? q.tip : 0;
  const text = q ? th + (/[.!?…—]$/.test(th) ? ' ' : ', ') + t(q.say) : th;
  DLG.say({ person: Sd.person, name: firstOf(Sd.person), text, auto: true, emo: 'happy', fillers: false, color: ORDER_TYPES.side.color });
  return { tip, k: 1 };
}

/* ── отпустить ── */
function release (p) {
  if (!p) return;
  p.errand = false;
  if (p.guest && !p.served) A.clearGuest(p);      // с пиццей в руках — постоит p.freeT и пойдёт сам (game.js guestStep)
}
export function step () {
  if (!A) return;
  const Sd = A.S.side;
  if (TR.client && (!Sd || Sd.ped !== TR.client)) { release(TR.client); TR.client = null; }
  if (TR.giver && (!Sd || Sd.giverPed !== TR.giver || (Sd.stage !== 'shop' && Sd.stage !== 'talk'))) { release(TR.giver); TR.giver = null; }
}

export const DEBUG = { TR, GIVE };
