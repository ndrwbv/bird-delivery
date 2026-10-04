/* Заказы карьеры (Стим): очередь, план смены, без повторов, оплата и
   чаевые, поручения, развоз смены, сюжетные заказы. Что бывает — в
   orders.config.js, сколько стоит — econ.js, как собирается — docs/ORDERS.md.
   Работает только при CAREER (game.js); Яндекс и ?nocareer идут старым путём.

   Из game.js:
     ORD.init(api)                   — один раз после ZN.init
     ORD.nextPlan()                  — очередной заказ вместо planOrder() → { kind, stops: [{ peds }], why, ord }
     ORD.setup(plan)                 — после S.order: цена, срок, цвет
     ORD.card(order)                 — полоса цвета на карточке (очередь «дальше» игроку не показываем)
     ORD.pickStop(o)                 — из syncTarget (заказ начался, после вручения): в сборном цель — ближайший по дорогам неотданный адрес
     ORD.reachStop(o)                — каждый кадр в drive: в сборном подъехал к другому неотданному адресу — он цель (true — цель сменилась)
     ORD.activeStops()               — все неотданные адреса текущего заказа для пинов карты: [{ x, z, color, current, name, addr }]
     ORD.arrive(o, st, onTime)       — подъехал к клиенту; true — дальше не идти (развоз смены, ждём onArrive)
     ORD.payStop(o, st, onTime, tier) → сколько заплатили за остановку (ECON.orderPay / tipFor); разбивку (заказ, скорость, чаевые) кладёт в st.pay — её рисует popPay
     ORD.delivered(o, st, onTime)    — заказ весь отдан: поручение, STORY.onDeliver
     ORD.step(dt)                    — каждый кадр: посадка работников, рамка срочного
     ORD.targetColor(), ORD.tintMarker(marker), ORD.radarRing(ctx, a, b), ORD.bagMesh(bag)
   Пины всех адресов сборного на радаре и карте рисует game.js (eachTarget): o.stops[idx …) с st.done === false.
   Для других модулей:
     ORD.onArrive(cb)   — «только подъехал к клиенту, до вручения»: cb({ order, stop, zone, type, x, z, hour });
                          вернул Promise — вручение ждёт, пока он не решится (бандиты, катсцена)
     ORD.staffRide()    — развоз смены (career.js в 24:00): Promise → { ok, people, pay, stars } или false (отказался);
                          спрашивают только в пиццерии: не там — едешь назад, staffWaiting() — ждут, staffHere() — вернулся
     ORD.resetShift()   — новая смена (career.js onShiftStart; сам ловит и по S.orders)
     ORD.force(spec)    — песочница: сделать заказ текущим сейчас. spec — сюжетная (STORY.orderFor)
                          или { kind: 'urgent' | 'edge' | 'gang' | 'pizza', zone?, near?: { x, z }, r?, dist? }
     ORD.forceSide(id)  — песочница: диалог поручения id из SIDE_ORDERS с клиентом или ближайшим прохожим
   Сюжет (story.js, если есть): STORY.nextOrder({ shift, hour, x, z, … }) → спецификация или null —
   спрашиваем перед каждой обычной пиццей. Заказ стал текущим — STORY.stage(spec), отдали —
   STORY.onDeliver(spec) (катсцена и награда — его), сорвался или выпал из очереди — STORY.onCancel(spec).
   Спецификация (всё необязательно): { storyId, x, z | zone, dist: { min, max }, person, addr, items,
   note, why, pay, time, timeK (срок × от обычного), color, reach, noGuest }. why/items/note — уже переведённые; noGuest — человека
   у двери ставит story.js, прохожего не зовём (иначе ждёт прохожий, person — его лицо). */
import * as RESPECT from './respect.js';
import { t, tn } from '../i18n/index.js';
import * as ECON from './econ.js';
import * as DLG from './dialog.js';
import * as ZN from './zones.js';
import * as DIST from './districts.js';
import * as FEST from './festivals.js';
import * as HURR from './hurricane.js';          // дома, унесённые ураганом: их адреса не выдаём (hurricane.js blocked)
import * as DIRECTOR from './director.js';   // режиссёр событий (director.js)
import * as GROW from './growth.js';            // пиццерия растёт: оплата, чаевые, размер сборных по ступени (econ.js GROWTH)
import { makePerson } from './people.js';
import { ORDER_TYPES, SHIFT_PLAN, SIDE_ORDERS, STAFF_RIDE, BOSS } from './orders.config.js';

const N_ = s => s;
const { PAY, ORDERS, TIPS, BUNDLE } = ECON;

/* необязательные соседи: карьера (часы, звёзды) и сюжет — их пишут отдельно */
const OPT = import.meta.glob(['./career.js', './story.js']);
let CAR = null, STORY = null;

let A = null, S = null, V = null;
const rand = (a, b) => a + Math.random() * (b - a);
const rint = r => Array.isArray(r) ? Math.round(rand(r[0], r[1])) : r;
const chance = p => Math.random() < p;
const pick = a => a[(Math.random() * a.length) | 0];
const wpick = w => {                                    // { key: вес } → ключ
  let sum = 0;
  for (const k in w) sum += Math.max(0, w[k]);
  if (sum <= 0) return null;
  let r = Math.random() * sum;
  for (const k in w) if ((r -= Math.max(0, w[k])) <= 0) return k;
  return Object.keys(w)[0];
};
const typeColor = k => (ORDER_TYPES[k] && ORDER_TYPES[k].color) || ORDERS.COLORS[k] || ORDER_TYPES.pizza.color;

export const ZONE_LABEL = {
  rich: N_('особняки'), gang: N_('бандитский район'), garage: N_('гаражи'),
  ind: N_('промзона'), poor: N_('частный сектор'), normal: N_('город'),
};

/* ─────────────── init ─────────────── */
export function init (api) {
  A = api; S = api.S; V = api.V;
  for (const [k, f] of Object.entries(OPT)) f().then(m => { if (k.includes('career')) hookCareer(m); else STORY = m; }).catch(e => console.warn('[orders]', k, e));
  loadUsed();
  css();
}

/* смена началась — новый план; кончилась — развоз, если висит, снимаем */
function hookCareer (m) {
  CAR = m;
  if (typeof m.onShiftStart === 'function') m.onShiftStart(() => { staffAbort(); resetShift(); });
  if (typeof m.onShiftEnd === 'function') m.onShiftEnd(() => staffAbort());
}

/* ─────────────── часы смены ─────────────── */
let HOUR_OVERRIDE = null, SIM = false;                              // для прогона смен без езды (DEBUG.simShift)
function hourNow () {
  if (HOUR_OVERRIDE !== null) return HOUR_OVERRIDE;
  // часы по расписанию смены (9…24): в круглосуточной пиццерии смена может идти с ночи, а обязательные
  // и срочные считаются от её начала, как в смене 9:00—24:00 (career.js schedHour)
  try { if (CAR && typeof (CAR.schedHour || CAR.hour) === 'function') { const h = (CAR.schedHour || CAR.hour)(); if (Number.isFinite(h)) return h; } } catch (e) { /* — */ }
  return ECON.hourOf(A.ENV.t);
}

/* номер очередного заказа за всё время: доставленные (dlv-msk-xp, в сборном — каждая
   пицца) + 1. От него — сборные заказы и поручения (econ.js BUNDLE) */
let LIFE_OVERRIDE = null;                                           // прогон смен (DEBUG.simShift)
function lifeN () {
  if (LIFE_OVERRIDE !== null) return LIFE_OVERRIDE;
  return (+A.Store.get('dlv-msk-xp', 0) || 0) + 1;
}

/* ─────────────── без повторов за всю игру ───────────────
   Ключ адреса — точка, округлённая до 4 м, в base36: «1k3.-9f». Массив в
   сохранении — от давнего к свежему: кончились адреса — берём самый давний. */
const USED_KEY = (SHIFT_PLAN.noRepeat && SHIFT_PLAN.noRepeat.key) || 'dlv-used-addr';
let USED = [], UIDX = new Map();
const keyOf = (x, z) => Math.round(x / 4).toString(36) + '.' + Math.round(z / 4).toString(36);
function loadUsed () {
  const v = A.Store.get(USED_KEY, []);
  USED = Array.isArray(v) ? v.filter(k => typeof k === 'string') : typeof v === 'string' ? v.split(' ').filter(Boolean) : [];
  reindex();
}
function reindex () { UIDX = new Map(); USED.forEach((k, i) => UIDX.set(k, i)); }
/* быстрый заезд кончился (quickrun.js): адреса заезда не в счёт — список снова из сохранения */
export const reloadUsed = () => { if (A) loadUsed(); };
function markUsed (key) {
  if (!key || (SHIFT_PLAN.noRepeat && SHIFT_PLAN.noRepeat.wholeGame === false)) return;
  if (UIDX.has(key)) { USED.splice(UIDX.get(key), 1); USED.push(key); reindex(); }
  else { UIDX.set(key, USED.length); USED.push(key); }
  A.Store.set(USED_KEY, USED);
}

/* ─────────────── пул адресов ───────────────
   Все точки SPOTS; подъезды (точка в трёх метрах перед дверью) — в первую
   очередь, дворовые дорожки — когда свежих подъездов не осталось. Район и
   расстояние считаем раз за смену: круги бандитов сжимаются донатом.
   ZMIN — ближайший к пиццерии адрес района (дальше dist.min). */
let POOL = [], ENTR = null, ZMIN = {}, POOL_AT = null;
function buildPool () {
  if (!ENTR) {
    ENTR = new Set();
    for (const [x, z, nx, nz] of A.CITY.entrances) ENTR.add(Math.round((x + nx * 3) * 4) + ',' + Math.round((z + nz * 3) * 4));
  }
  // районы (districts.js): заказы — только в том, где работаешь; «весь город» (cityopen.js) — во всех
  // (там всё открыто — openSpot не нужен)
  const di = DIST.has() && !DIST.city() ? DIST.cur() : -1;
  const src = di >= 0 ? A.SPOTS.filter(s => DIST.at(s.x, s.z) === di && openSpot(s.x, s.z)) : A.SPOTS;
  POOL = src.map(s => ({ x: s.x, z: s.z, entr: ENTR.has(Math.round(s.x * 4) + ',' + Math.round(s.z * 4)), key: keyOf(s.x, s.z), zone: ZN.zoneAt(s.x, s.z), d: 0 }));
  return rebase();
}
/* расстояния пула — от пиццерии, где стоишь. В режиме «весь город» вернуться можно в любую
   (game.js backToBase → ближайшая) — тогда пересчитываем, адреса те же */
function rebase () {
  const P = A.PIZZA || { x: 0, z: 0 }, D = distRing();
  POOL_AT = A.PIZZA;
  for (const q of POOL) q.d = Math.hypot(q.x - P.x, q.z - P.z);
  ZMIN = {};
  for (const q of POOL) if (q.d >= D.min && !(q.d >= ZMIN[q.zone])) ZMIN[q.zone] = q.d;
  // «в конец района» — дальше этого от пиццерии (DISTRICT.EDGE_TOP самых далёких адресов)
  const ds = POOL.map(q => q.d).sort((a, b) => a - b);
  EDGE_D = ds.length ? ds[Math.floor((ds.length - 1) * (1 - ECON.DISTRICT.EDGE_TOP))] : 0;
  return POOL;
}
let EDGE_D = 0;
/* адрес у границы закрытого района — не наш: в районе, но ближайшая к нему улица или двор в
   OPEN_R метрах уже за перекрытием (заказ «падал в закрытый район»). Нужен открытый район и у
   ближайшей дороги, и на кольце OPEN_R вокруг (8 точек) */
const OPEN_R = 25;
function openSpot (x, z) {
  if (!DIST.has()) return true;
  const ok = (px, pz) => DIST.isOpen(DIST.at(px, pz));
  const r = A.nearestRoad ? A.nearestRoad(x, z, 60, 1) : null;
  if (r && !ok(r.x, r.z)) return false;
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; if (!ok(x + Math.cos(a) * OPEN_R, z + Math.sin(a) * OPEN_R)) return false; }
  return true;
}
/* дальность обычного заказа: у района своя (DISTRICT.DIST), волна её растягивает или сжимает */
function distRing () {
  const base = DIST.has() ? DIST.dist() : null;
  const D = base ? { min: base[0], max: base[1] } : (SHIFT_PLAN.dist || { min: 300, max: 1500 });
  const k = DIST.pace().dist || 1;
  return { min: Math.round(D.min * Math.min(1, k)), max: Math.round(D.max * k) };
}

/* ─────────────── смена ─────────────── */
const SH = { far: 0, last: 0, gen: 0, sideOwed: false, zones: new Set(), must: {}, h0: 9, done: 0, log: [], reserved: new Set(), pts: [], breather: false, k: 0, sz: 1, ones: 0 };
const Q = [];                                          // заказы наперёд (песочница может положить); в игре — собираем по одному, когда нужен

export function resetShift () {
  staffAbort();
  dropQueue();
  SH.last = 0;
  SH.gen = 0; SH.sideOwed = false;
  SH.zones = new Set(); SH.must = {}; SH.done = 0; SH.log = []; SH.reserved = new Set(); SH.pts = []; SH.breather = false;
  SH.k = 0; SH.sz = 1; SH.ones = 0; SH.far = 0;
  SH.h0 = hourNow();
  buildPool();
}

/* сколько заказов в час смены: по факту, а пока данных нет — прикидка по часам
   смены: туда и обратно ~1,1 км на RUN_V 19 м/с плюс погрузка (≈ 0,2 в час) */
function rate () {
  const h = hourNow() - SH.h0;
  const slow = CAR && typeof CAR.shiftSlow === 'function' ? CAR.shiftSlow() : ECON.SHIFT.SLOW;
  const hps = (24 - ECON.SHIFT.KEYS[0][1]) / ((ECON.SHIFT.T_END - ECON.SHIFT.T0) * (A.DAY_LEN || 480) * slow);   // часов смены в секунду
  const prior = 1 / ((2 * 1100 / 19 + 18) * hps);
  const est = h > 1 && SH.done > 0 ? (SH.done + prior) / (h + 1) : prior;
  return Math.min(1.5, Math.max(0.1, est));
}

/* подходящий адрес: район, кольцо от точки, не был, не в очереди.
   Кончились — самый давний из подходящих; нет и таких — ослабляем условия */
function pickSpot (o = {}) {
  if ((o.grow || 0) > 6) return null;
  // фестиваль кальянщиков (festivals.js): все адреса смены — рядом с ним
  const fn = !o.near && !SIM ? FEST.near() : null;
  if (fn) o = { ...o, near: fn, r: fn.r, dmin: undefined, dmax: undefined, zone: null };
  const c = o.from || A.PIZZA;
  const fit = s => (!o.zone || s.zone === o.zone) && !SH.reserved.has(s.key) && !HURR.blocked(s.x, s.z) &&   // у унесённого ураганом дома — не возим
    (o.near ? Math.hypot(s.x - o.near.x, s.z - o.near.z) <= o.r : true) &&
    (o.dmin === undefined || Math.hypot(s.x - c.x, s.z - c.z) >= o.dmin) &&
    (o.dmax === undefined || Math.hypot(s.x - c.x, s.z - c.z) <= o.dmax);
  const ok = POOL.filter(fit);
  if (!ok.length) {
    if (o.zone && o.relax !== false) return pickSpot({ ...o, zone: null });
    if (o.near && o.r < 3000) return pickSpot({ ...o, r: o.r * 1.8 });
    if (o.dmin !== undefined || o.dmax !== undefined) return pickSpot({ ...o, dmin: o.dmin !== undefined ? o.dmin * 0.6 : undefined, dmax: o.dmax !== undefined ? o.dmax * 1.5 : undefined, zone: null, grow: (o.grow || 0) + 1 });
    return null;
  }
  let fresh = ok.filter(s => !UIDX.has(s.key));
  // не в соседний подъезд того же дома, где уже был за смену: заметно как повтор
  const apart = fresh.filter(s => !SH.pts.some(q => Math.abs(q.x - s.x) < 45 && Math.abs(q.z - s.z) < 45));
  if (apart.length) fresh = apart;
  const door = fresh.filter(s => s.entr);                // подъезд лучше дорожки во дворе
  if (door.length) return pick(door);
  if (fresh.length) return pick(fresh);
  let best = null, bi = Infinity;                        // все были — самый давний
  for (const s of ok) { const i = UIDX.get(s.key); if (i < bi) { bi = i; best = s; } }
  return best;
}

/* веса районов. Район, до которого в кольце dist не дотянуться (бандитские
   круги в Северске — за 4 км), остаётся, но с весом ×(dist.max / до него)²:
   иногда туда всё же ведёт заказ — на ближайшие его адреса */
function zoneWeights (dmin, dmax, only) {
  const w = {};
  for (const z in SHIFT_PLAN.zoneWeights) {
    if (only && !only(z)) continue;
    if (!(ZMIN[z] >= 0)) continue;
    const k = ZMIN[z] <= dmax ? 1 : (dmax / ZMIN[z]) ** 2;
    // все адреса района уже видели — реже: повторы только когда совсем некуда
    const lo = ZMIN[z] <= dmax ? dmin : ZMIN[z], hi = ZMIN[z] <= dmax ? dmax : ZMIN[z] + 600;
    const fresh = POOL.some(s => s.zone === z && s.d >= lo && s.d <= hi && !UIDX.has(s.key) && !SH.reserved.has(s.key));
    w[z] = SHIFT_PLAN.zoneWeights[z] * k * (fresh ? 1 : 0.15);
  }
  return w;
}

function stopOf (s, n = 1) {
  return { x: s.x, z: s.z, key: s.key, zone: s.zone, n, addr: A.realAddress(s.x, s.z) };
}

/* одна спецификация заказа: кто, куда, какой вид */
/* разминка: первые заказы смены (PACE.WARMUP, в щедрую — WARMUP_GEN) — близко к
   пиццерии, один адрес, без поручений, срочных и сюжета. И передышка: после
   срочного или «в конец района» следующий — тоже близкий */
const warmCount = () => (DIST.pace().id === 'generous' ? ECON.PACE.WARMUP_GEN : ECON.PACE.WARMUP);
function easySpec () {
  const warm = SH.gen < warmCount();
  if (!warm && !SH.breather) return null;
  const [a, b] = ECON.PACE.WARM_DIST;
  const s = pickSpot({ dmin: a, dmax: b });
  if (!s) return null;
  SH.breather = false;
  return { type: 'pizza', kind: 'solo', easy: true, stops: [stopOf(s)] };
}

function genSpec () {
  if (SH.gen === 0 && !POOL.length) buildPool();
  else if (POOL_AT !== A.PIZZA) rebase();                 // «весь город»: вернулся в другую пиццерию
  const D = distRing();
  // фестиваль кальянщиков: первый заказ смены и часть остальных — на сам фестиваль, к проходу (festivals.js)
  const fp = SIM ? null : FEST.passSpec(SH.gen);
  if (fp) return finishSpec({ type: 'pizza', kind: 'solo', fest: fp, stops: [{ x: fp.x, z: fp.z, key: keyOf(fp.x, fp.z), zone: ZN.zoneAt(fp.x, fp.z), n: 1, addr: fp.addr }] }, null, hourNow());
  const easy = easySpec();
  if (easy) return finishSpec(easy, null, hourNow());
  const ahead = (A.S.order ? 1 : 0) + Q.length;          // сколько заказов до этого
  const hAt = hourNow() + ahead / rate();
  let forced = null;
  // срочные и «в конец района» — не раньше PACE hardFrom: в щедрую смену — с 16:00
  if (hAt >= (DIST.pace().hardFrom || 0)) for (const r of SHIFT_PLAN.must || []) {
    const have = r.what === 'zones' ? SH.zones.size : SH.must[r.what] || 0;
    if (have >= r.count) continue;
    const need = r.count - have, slots = (r.byHour - hAt) * rate();
    if (slots <= need + 0.5 || chance(need / Math.max(1, slots))) { forced = r.what; break; }
  }
  // и сверх обязательного — иногда ещё срочный (econ.js URGENT: CHANCE, не больше MAX за смену)
  if (!forced && hAt >= (DIST.pace().hardFrom || 0) && (SH.must.urgent || 0) < ECON.URGENT.MAX && chance(ECON.URGENT.CHANCE)) forced = 'urgent';
  let spec = null;
  if (forced === 'edge') {
    const s = edgeSpot();
    if (s) spec = { type: 'pizza', kind: 'solo', edge: true, stops: [stopOf(s)] };
  } else if (forced === 'urgent') {
    const best = urgentSpot();
    if (best) spec = { type: 'urgent', kind: 'solo', urgent: true, stops: [stopOf(best)] };
  }
  if (!spec && !forced && !SIM && STORY && typeof STORY.nextOrder === 'function') {
    let s = null;
    try { s = STORY.nextOrder(storyCtx()); } catch (e) { console.warn('[orders] STORY.nextOrder', e); }
    if (s && typeof s.then !== 'function') {
      spec = storyNear(s) ? storySpec(s) : null;
      if (!spec) storyCancel(s);                           // дом героя далеко от района — глава подождёт
    }
  }
  const life = lifeN();
  // сборный: n пицц на n адресов разом (econ.js BUNDLE) — с 8-го заказа за всё время
  if (!spec && !forced) spec = bundleSpec(life, D);
  if (!spec) {
    // обычная пицца: район по весам (или новый, если надо добрать районы), вид по kinds
    const w = forced === 'zones' ? zoneWeights(D.min, D.max, z => !SH.zones.has(z)) : zoneWeights(D.min, D.max);
    const zone = wpick(w) || wpick(zoneWeights(D.min, D.max)) || null;
    // первые заказы за всё время — по одному человеку на адрес
    const kind = life < BUNDLE.FROM ? 'solo' : wpick(SHIFT_PLAN.kinds || { solo: 1 }) || 'solo';
    const far = zone && ZMIN[zone] > D.max;                // район за кольцом — его ближние адреса
    const s = far ? pickSpot({ zone, dmin: ZMIN[zone], dmax: ZMIN[zone] + 600 }) : pickSpot({ zone, dmin: D.min, dmax: D.max });
    if (!s) return null;
    spec = { type: 'pizza', kind, stops: [] };
    if (kind === 'group') spec.stops.push(stopOf(s, rint(SHIFT_PLAN.groupSize || [2, 3])));
    else spec.stops.push(stopOf(s));
    // поручение — с BUNDLE.SIDE_FROM-го заказа, шанс растёт (BUNDLE.SIDE); клиент попросит при вручении
    if (SH.sideOwed || chance(ECON.sideChance(life))) { spec.side = true; SH.sideOwed = false; }
  }
  return finishSpec(spec, forced, hAt);
}

/* сборный заказ: ступень по номеру заказа за всё время (BUNDLE.STEPS). Самый первый —
   всегда и ровно две пиццы, перед ним — директор (BOSS). Новая ступень впервые —
   столько пицц, сколько она даёт по максимуму, и реплика директора, если есть.
   Адреса — по всему кольцу района, порядок в спецификации — ближайший следующий
   от пиццерии (по нему считаются отрезки, оплата и срок), игрок развозит как хочет. */
function bundleSpec (life, D) {
  const step = ECON.bundleStep(life);
  if (!step) return null;
  let n = sizeRoll(Math.max(1, Math.min(7, (step.max || 2) + GROW.sizeAdd())));   // сколько пицц — «вперемешку» (SHIFT_PLAN.sizes); ступень пиццерии ± (GROWTH.SIZE)
  if (n < 2) return null;                                  // одна — обычная пицца
  const told = toldGet();                                 // сколько пицц директор уже объявил
  let boss = null;
  if (told < 2) { n = 2; boss = 2; }                       // самый первый — знакомство, ровно две
  else if (n > told) {                                     // столько разом впервые — директор скажет, если есть что
    for (const k in BOSS.lines) if (+k > told && +k <= n) boss = +k;
    if (!boss) boss = -n;                                  // реплики нет — просто запомнить
  }
  const pts = [];
  // «весь город» (econ.js CITY): остальные адреса — кучкой у первого, не через весь город
  const city = DIST.has() && DIST.city();
  for (let i = 0; i < n; i++) {
    const s = pickSpot(city && pts.length ? { near: pts[0], r: ECON.CITY.BUNDLE_R } : { dmin: D.min, dmax: D.max });
    if (!s) break;
    SH.reserved.add(s.key); SH.pts.push({ x: s.x, z: s.z });
    pts.push(s);
  }
  if (pts.length < 2) { for (const s of pts) SH.reserved.delete(s.key); return null; }
  // ближайший следующий от пиццерии — по дорогам
  const order = [];
  let at = A.PIZZA;
  while (pts.length) {
    let bi = 0, bl = Infinity;
    pts.forEach((s, i) => { const L = A.routeLen(at.x, at.z, s.x, s.z); if (L < bl) { bl = L; bi = i; } });
    at = pts.splice(bi, 1)[0];
    order.push(at);
  }
  return { type: 'pizza', kind: 'bundle', bundle: { n: order.length, time: step.time, boss }, stops: order.map(s => stopOf(s)) };
}

/* сколько пицц в очередном заказе (SHIFT_PLAN.sizes): по весам, но потолок растёт с каждым
   заказом смены (rampStart + rampStep × сколько уже было после разминки), не больше ступени
   курьера (max), не выше прошлого + maxJump, после большого — маленький, после ones одиночных
   подряд — хотя бы два. 1 — обычная пицца */
function sizeRoll (max) {
  const Z = SHIFT_PLAN.sizes || {}, W = Z.weights || { 1: 1, 2: 1 };
  let cap = Math.min(max, (Z.rampStart || 2) + Math.floor(SH.k * (Z.rampStep === undefined ? 1 : Z.rampStep)));
  cap = Math.min(cap, (SH.sz || 1) + (Z.maxJump || 3));
  if ((SH.sz || 1) >= (Z.big || 4)) cap = Math.min(cap, Z.afterBig || 2);
  const lo = Math.min(cap, SH.ones >= (Z.ones || 2) ? 2 : 1);
  const w = {};
  for (let k = lo; k <= cap; k++) w[k] = W[k] || 0;
  return +wpick(w) || lo;
}

/* «в конец района»: адрес из самых далёких от пиццерии района (EDGE_D), но по дорогам
   не дальше farMax() — в огромном районе иначе выходило 5 км */
function edgeSpot () {
  if (!EDGE_D) return null;
  let best = null, bl = Infinity;
  for (let k = 0; k < 6; k++) {
    const s = pickSpot({ dmin: EDGE_D * (k < 3 ? 1 : 0.7), relax: false }) || pickSpot({ dmin: EDGE_D * 0.6 });
    if (!s) break;
    const L = A.routeLen(A.PIZZA.x, A.PIZZA.z, s.x, s.z);
    if (L <= farMax()) return s;
    if (L < bl) { bl = L; best = s; }
  }
  return best;
}
/* дальше этого по дорогам срочные и «в конец района» не ведут: DISTRICT.FAR_K × дальность района */
const farMax = () => (DIST.has() ? DIST.dist()[1] * ECON.DISTRICT.FAR_K : Infinity);
/* срочный — средняя дальность по дорогам: в районе — URGENT.DIST × его дальности (не ближе URGENT.MIN_M),
   без районов — не ближе PAY.URGENT_MIN_M */
const urgentRange = () => {
  if (!DIST.has()) return [PAY.URGENT_MIN_M, Infinity];
  const d = DIST.dist()[1], U = ECON.URGENT;
  return [Math.max(U.MIN_M, d * U.DIST[0]), Math.max(U.MIN_M + 150, d * U.DIST[1])];
};
/* адрес срочного: путь по дорогам в urgentRange(); не нашли — ближайший к середине из кандидатов */
function urgentSpot (zone) {
  const [lo, hi] = urgentRange(), mid = Number.isFinite(hi) ? (lo + hi) / 2 : lo * 1.2;
  let best = null, bd = Infinity;
  for (let k = 0; k < 8; k++) {
    const s = pickSpot({ dmin: lo * 0.7, dmax: Number.isFinite(hi) ? hi : undefined, zone: zone || undefined });
    if (!s) break;
    const L = A.routeLen(A.PIZZA.x, A.PIZZA.z, s.x, s.z);
    if (L > farMax()) continue;                            // слишком далеко по дорогам
    if (L >= lo && L <= hi) return s;
    if (Math.abs(L - mid) < bd) { bd = Math.abs(L - mid); best = s; }
  }
  return best;
}
/* сюжет: дом героя не дальше 1,6 × дальности района от пиццерии (иначе глава ждёт района поближе) */
function storyNear (s) {
  if (!DIST.has() || !Number.isFinite(s.x) || !Number.isFinite(s.z) || !A.PIZZA) return true;
  if (!openSpot(s.x, s.z)) return false;                  // дом героя в закрытом районе — глава ждёт
  return Math.hypot(s.x - A.PIZZA.x, s.z - A.PIZZA.z) <= DIST.dist()[1] * 1.6;
}

/* спецификация готова: резерв адресов, метры по дорогам, номер, лог */
function finishSpec (spec, forced, hAt) {
  // считаем сразу: очередь — это уже план смены
  for (const st of spec.stops) { SH.reserved.add(st.key); SH.zones.add(st.zone); SH.pts.push({ x: st.x, z: st.z }); }
  if (spec.edge) SH.must.edge = (SH.must.edge || 0) + 1;
  if (spec.urgent) SH.must.urgent = (SH.must.urgent || 0) + 1;
  if ((spec.edge || spec.urgent) && ECON.PACE.WARMUP >= 0) SH.breather = true;      // после тяжёлого — близкий
  // метры по дорогам: от пиццерии до первого, дальше — от прошлого адреса
  spec.m = spec.stops.map((st, i) => {
    const a = i ? spec.stops[i - 1] : A.PIZZA;
    return Math.round(A.routeLen(a.x, a.z, st.x, st.z));
  });
  spec.zone = spec.stops[0].zone;
  spec.color = spec.color || typeColor(spec.type);
  spec.forced = forced;
  // День угнетения бургеров (festivals.js): часть заказов — «вместо бургера», оплата ×FEST.BURGER_K
  if (!spec.story && !SIM) { const bk = FEST.burgerRoll(); if (bk) spec.burger = bk; }
  spec.n = ++SH.gen;
  // ритм размеров (sizeRoll): сколько было после разминки, сколько пицц в прошлом, сколько одиночных подряд
  const size = spec.bundle ? spec.stops.length : 1;
  if (!spec.easy) SH.k++;
  SH.sz = size; SH.ones = size === 1 ? SH.ones + 1 : 0;
  spec.hour = +hAt.toFixed(2);
  SH.log.push({ n: spec.n, h: spec.hour, type: spec.type, kind: spec.kind, zone: spec.zone, edge: !!spec.edge, urgent: !!spec.urgent, side: !!spec.side, story: !!spec.story, m: spec.m.reduce((a, b) => a + b, 0), keys: spec.stops.map(s => s.key), forced });
  return spec;
}

function storyCtx () {
  return {
    shift: (+A.Store.get('dlv-shifts', 0) || 0) + 1, hour: hourNow(), x: V.x, z: V.z, shiftOrders: SH.gen, queue: Q.map(q => ({ type: q.type, zone: q.zone })),
    level: A.level(), adult: A.ADULT, pizza: A.PIZZA ? { x: A.PIZZA.x, z: A.PIZZA.z } : null,
    zoneAt: ZN.zoneAt, pickSpot: o => pickSpot(o || {}),
  };
}
function storySpec (s) {
  const D = distRing();
  let sp = null;
  if (Number.isFinite(s.x) && Number.isFinite(s.z)) sp = { x: s.x, z: s.z, key: keyOf(s.x, s.z), zone: ZN.zoneAt(s.x, s.z) };
  else sp = pickSpot({ zone: s.zone || null, dmin: (s.dist && s.dist.min) || D.min, dmax: (s.dist && s.dist.max) || D.max });
  if (!sp) return null;
  const st = stopOf(sp);
  if (s.addr) st.addr = s.addr;
  return { type: 'story', kind: 'solo', story: s, color: s.color || typeColor('story'), stops: [st] };
}

/* очередь выбросили (новая смена, развоз): сюжетные главы — обратно story.js */
function dropQueue () {
  for (const q of Q) if (q.story) storyCancel(q.story);
  Q.length = 0;
}
function storyCancel (s) {
  try { if (STORY && typeof STORY.onCancel === 'function') STORY.onCancel(s); } catch (e) { console.warn('[orders] STORY.onCancel', e); }
}

/* ─────────────── очередной заказ: спецификация → живые люди ─────────────── */
export function nextPlan () {
  if (!A) return null;
  if (S.orders <= SH.last) resetShift();                // S.orders сбросился — новая смена
  SH.last = S.orders;
  let spec;
  if (FORCE) { spec = FORCE; FORCE = null; }
  else spec = Q.length ? Q.shift() : genSpec();         // собираем, когда нужен: очередь «дальше» не показываем
  return bindSpec(spec);
}
function bindSpec (spec) {
  if (!spec) return null;
  if (spec.story && (spec.story.noGuest || !A.alive().length)) return { story: true, kind: 'solo', stops: [], why: whyOf(spec), ord: spec };
  const all = A.alive().filter(p => !p.guest);
  if (!all.length) return null;
  const taken = new Set();
  const d2 = (p, c) => (p.x - c.x) ** 2 + (p.z - c.z) ** 2;
  const place = (p, x, z) => {
    if (p.idle) A.releaseIdle(p);
    p.path = null; p.w = null; p.x = x; p.z = z;
    taken.add(p);
    return p;
  };
  const free = () => all.filter(p => !taken.has(p));
  const stops = [];
  for (const st of spec.stops) {
    const f = free();
    if (!f.length) break;
    f.sort((a, b) => d2(a, st) - d2(b, st));
    const p = place(f[(Math.random() * Math.min(4, f.length)) | 0], st.x, st.z);
    if (spec.story && spec.story.person && stops.length === 0) A.rehuman(p, spec.story.person);
    const peds = [p];
    for (let i = 1; i < st.n; i++) {                   // групповой: остальные — рядом с первым, не на асфальте
      const b = free().sort((a, c) => d2(a, st) - d2(c, st))[0];
      if (!b) break;
      place(b, st.x, st.z);
      for (let k = 0; k < 8; k++) {
        b.x = st.x + rand(-2.5, 2.5); b.z = st.z + rand(-2.5, 2.5);
        const r = A.nearestRoad(b.x, b.z, 7, 1);
        if (!r || r.d > r.seg.w / 2 + 1) break;
      }
      A.pushOut(b, 0.5);
      peds.push(b);
    }
    stops.push({ peds, key: st.key, zone: st.zone, ...(spec.fest ? { fixAddr: st.addr, fest: true } : {}) });   // фестиваль: адрес — «… проход», не дом рядом
  }
  if (!stops.length) return null;
  spec.stops = spec.stops.slice(0, stops.length);
  if (spec.bundle && stops.length < 2) spec.bundle = null;  // прохожих не хватило — обычный заказ
  return { kind: spec.bundle ? 'bundle' : stops.length > 1 ? 'chain' : spec.kind === 'chain' || spec.kind === 'bundle' ? 'solo' : spec.kind, stops, why: whyOf(spec), ord: spec };
}

function whyOf (sp) {
  if (sp.story) return sp.story.why || t('особый заказ');
  if (sp.fest) return sp.fest.why;
  const z = t(ZONE_LABEL[sp.zone] || ZONE_LABEL.normal);
  if (sp.urgent) return t('срочно: времени в обрез · оплата ×{k} · не успеешь — штраф', { k: fmtK(PAY.URGENT) });
  if (sp.edge) return t('в самый конец района · оплата ×{k}', { k: fmtK(PAY.EDGE) });
  if (sp.bundle) return tn(sp.stops.length, 'сборный: {n} адрес, порядок выбираешь сам|сборный: {n} адреса, порядок выбираешь сам|сборный: {n} адресов, порядок выбираешь сам');
  if (sp.kind === 'group') return t('групповой: заказали на всех сразу') + ' · ' + z;
  if (sp.kind === 'chain') return tn(sp.stops.length, 'цепочка: {n} адрес по очереди|цепочка: {n} адреса по очереди|цепочка: {n} адресов по очереди') + ' · ' + z;
  const mul = PAY.ZONE[sp.zone] || 1;
  if (mul !== 1) return t('{zone} · оплата ×{k}', { zone: z, k: fmtK(mul) });
  sp.plain = true;                                       // обычный заказ: в накладной пометку не пишем
  return pick([t('один адрес'), t('по пути из пиццерии'), t('клиент ждёт')]) + ' · ' + z;
}
const fmtK = k => String(+k.toFixed(2)).replace('.', ',');

/* цена и срок: после того, как game.js собрал S.order */
export function setup (plan) {
  const o = S.order, sp = plan.ord;
  o.ord = sp;
  const level = A.level();
  const opts = { urgent: !!sp.urgent, edge: !!sp.edge, level };
  // район платит больше (DISTRICT.PAY), час пик — тоже (PACE pay)
  const mul = (DIST.has() ? DIST.pay() : 1) * (DIST.pace().pay || 1), city = DIST.has() && DIST.city();
  sp.fees = o.stops.map((st, i) => {
    const m = sp.m[i] || 0, zone = sp.stops[i] ? sp.stops[i].zone : sp.zone, n = Math.max(1, st.peds.length);
    if (sp.story && Number.isFinite(sp.story.pay)) return Math.round(sp.story.pay / o.stops.length);
    // групповой: за каждого следующего — ещё одна база
    const g = sp.stops[i] ? GROW.payK(sp.stops[i].x, sp.stops[i].z) : GROW.payK();   // ступень пиццерии района (econ.js GROWTH.PAY)
    return Math.round((ECON.orderPay(m, zone, opts) + (n - 1) * ECON.orderPay(0, zone, opts)) * mul * g / 10) * 10;
  });
  // «весь город» (econ.js CITY): премия за дальний — за путь по дорогам сверх FAR_FROM, в цене остановки
  sp.far = o.stops.map((st, i) => (city && !sp.story ? ECON.cityFar(sp.m[i] || 0) : 0));
  sp.fees = sp.fees.map((f, i) => f + sp.far[i]);
  // «вместо бургера» (День угнетения бургеров): надбавка — в цене остановки
  sp.burgerAdd = sp.burger ? sp.fees.map(f => Math.round(f * (sp.burger - 1) / 10) * 10) : null;
  if (sp.burgerAdd) sp.fees = sp.fees.map((f, i) => f + sp.burgerAdd[i]);
  S.fee = sp.fees.reduce((a, b) => a + b, 0);
  // оплата и район — на самой остановке: в сборном игрок развозит в своём порядке, o.stops переставляются
  o.stops.forEach((st, i) => { st.fee = sp.fees[i]; st.far = sp.far[i]; if (!st.zone && sp.stops[i]) st.zone = sp.stops[i].zone; st.done = false; });
  const L = A.routeLen(V.x, V.z, S.target.x, S.target.z);
  S.timeMax = sp.story && Number.isFinite(sp.story.time) ? sp.story.time
    : sp.urgent ? (DIST.has() ? Math.max(ECON.URGENT.MIN_T, L / ECON.URGENT.V + ECON.URGENT.ADD) : A.orderTime(L, 1, 1) * PAY.URGENT_TIME)
      // сборный: срок один на весь развоз — путь ближайшим следующим от пиццерии × ступень (BUNDLE.STEPS time)
      : sp.bundle ? bundleTime(sp.m.reduce((a, b) => a + b, 0), o.stops.length, sp.bundle.time || 1)
        : A.orderTime(L, 1, S.orders);
  if (!(sp.story && Number.isFinite(sp.story.time))) S.timeMax *= DIST.pace().time || 1;   // щедрая — времени больше
  if (sp.story && Number.isFinite(sp.story.timeK)) S.timeMax *= sp.story.timeK;             // глава героя: «успеть» / крюк (herostories.js)
  S.time = S.timeMax;
  if (sp.bundle && sp.bundle.boss) bossSays(sp.bundle.boss);
}

/* срок сборного: как у обычного заказа на весь путь × ступень, но доехать реально (BUNDLE.TIME_FLOOR) */
const RUN_V = 19;                                         // как в game.js orderTime: средняя скорость по городу, м/с
function bundleTime (L, n, k) {
  return Math.max(A.orderTime(L, n, S.orders) * k, L / RUN_V * BUNDLE.TIME_FLOOR + 5 + n * 4);
}

/* директор пиццерии: «ты растёшь — бери два сразу» (BOSS в orders.config.js). Диалог
   поверх накладной; запоминаем, сколько пицц уже объявлено (dlv-boss) */
let BOSS_P = null, SIM_TOLD = 0;
const toldGet = () => (SIM ? SIM_TOLD : +A.Store.get('dlv-boss', 0) || 0);
function bossSays (k) {
  A.Store.set('dlv-boss', Math.max(toldGet(), Math.abs(k)));
  const line = k > 0 && BOSS.lines[k];
  if (!line) return;
  if (!BOSS_P) BOSS_P = makePerson({ seed: BOSS.seed, first: t(BOSS.first), last: t(BOSS.last), fem: !!BOSS.fem });
  DLG.say({ person: BOSS_P, name: BOSS_P.name + ' · ' + t(BOSS.role), text: t(line), accept: t(BOSS.ok), mood: 'calm', fillers: false, color: typeColor('pizza') });
}

/* сюжетный заказ без прохожего: у двери его человек (story.js), game.js зовёт вместо сборки S.order */
const CUR = { order: null, story: null, done: false };
export function startStory (plan) {
  const sp = plan.ord, s = sp.story, stp = sp.stops[0];
  // пин — перед дверью на свободном месте (game.js pinFront), человек сюжета — у самой двери
  const at = A.pinFront ? A.pinFront(stp.x, stp.z) : { x: stp.x, z: stp.z };
  const st = { peds: [], persons: s.person ? [s.person] : [], at, key: stp.key, zone: stp.zone,
    addr: stp.addr, note: s.note || '', reach: s.reach || 6 };
  S.order = { kind: 'solo', tut: false, surf: false, stops: [st], idx: 0, why: plan.why, items: s.items || '1 × ' + t('пицца'), ord: sp };
  S.state = 'brief';
  A.syncTarget();
  setup(plan);
  A.rebuildRoutePath();
  A.showOrderCard(S.order);
  A.gameplayStop();
  A.Snd.order();
}
function trackStory () {
  const sp = S.order && S.order.ord;
  if (sp && sp.story && CUR.order !== S.order) {
    CUR.order = S.order; CUR.story = sp.story; CUR.done = false;
    try { if (STORY && typeof STORY.stage === 'function') STORY.stage(sp.story); } catch (e) { console.warn('[orders] STORY.stage', e); }
  } else if (CUR.order && CUR.order !== S.order) {
    if (!CUR.done) storyCancel(CUR.story);
    CUR.order = null; CUR.story = null;
  }
}

/* ─────────────── карточка ─────────────── */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function card (order) {
  const el = document.getElementById('phone');
  if (!el) return;
  css();                                    // песочница (ui.html) init не зовёт — стили накладной ставим и тут
  const sp = order.ord;
  el.classList.add('ord-typed');
  el.classList.toggle('ord-urgent', !!(sp && sp.urgent));
  // срочный — красная печать «СРОЧНО» наискось в углу накладной
  let stamp = el.querySelector(':scope > .oc-stamp');
  if (sp && sp.urgent) {
    if (!stamp) { stamp = document.createElement('div'); stamp.className = 'oc-stamp'; el.appendChild(stamp); }
    stamp.textContent = t('СРОЧНО');
  } else if (stamp) stamp.remove();
  el.style.setProperty('--ord', sp ? sp.color : typeColor('pizza'));
  // сборный на 3+ адреса: получатели и фото мельче, фото — в две колонки (иначе накладная не влезает)
  const many = !!(sp && sp.bundle && order.stops.length > 2);
  el.classList.toggle('ord-many', many);
  const ph = el.querySelector('.oc-photos');
  if (ph) ph.classList.toggle('many', many && order.stops.length > 3);
  if (!sp) return;
  const kind = document.getElementById('ph-kind');
  if (kind && sp.type !== 'pizza') kind.textContent = t(ORDER_TYPES[sp.type] ? ORDER_TYPES[sp.type].label : sp.type) + ' · ' + kind.textContent;
}
/* строки накладной на карточке (game.js showOrderCard): район, оплата; очередь «дальше» на карточке не показываем */
export function cardRows (order) {
  const sp = order.ord;
  if (!sp) return [];
  // «весь город»: район — тот, где адрес; премия за дальний — отдельной строкой (она уже в оплате)
  const at = S.target || sp.stops[0];
  const di = !DIST.has() ? -1 : DIST.city() && at ? DIST.at(at.x, at.z) : DIST.cur();
  const far = (sp.far || []).reduce((a, b) => a + b, 0);
  const brg = (sp.burgerAdd || []).reduce((a, b) => a + b, 0);
  return [
    [t('район'), esc(t(ZONE_LABEL[sp.zone] || ZONE_LABEL.normal)) + (di >= 0 ? ' · ' + esc(t(DIST.list()[di].name)) : '')],
    [t('оплата'), A.money(S.fee) + (sp.urgent ? ' · <b class="oc-urg">' + t('срочно') + '</b>' : '')],
    ...(far > 0 ? [[t('за дальний'), '<b class="oc-far">+' + A.money(far) + '</b>' + ' · ' + esc(t('премия, уже в оплате'))]] : []),
    ...(brg > 0 ? [[t('вместо бургера'), '<b class="oc-far">+' + A.money(brg) + '</b>' + ' · ' + esc(t('День угнетения бургеров, уже в оплате'))]] : []),
  ];
}

/* ─────────────── подъехал ─────────────── */
const ARRIVE = [];
export function onArrive (cb) { if (typeof cb === 'function') ARRIVE.push(cb); return () => { const i = ARRIVE.indexOf(cb); if (i >= 0) ARRIVE.splice(i, 1); }; }

export function arrive (o, st, onTime) {
  if (o.ord && o.ord.type === 'staff') { staffArrive(o, st); return true; }
  if (st.hold) return true;
  if (!st.arrived) {
    st.arrived = true;
    const at = st.at || st.peds[0];
    const ev = { order: o, stop: st, zone: st.zone || o.ord.zone, type: o.ord.type, x: at.x, z: at.z, hour: hourNow(), onTime };
    const wait = [];
    for (const cb of ARRIVE.slice()) {
      try { const r = cb(ev); if (r && typeof r.then === 'function') wait.push(r); } catch (e) { console.warn('[orders] onArrive', e); }
    }
    if (wait.length) {
      st.hold = Promise.allSettled(wait).then(() => { st.hold = null; });
      return true;
    }
  }
  return false;
}

/* оплата остановки: ECON.orderPay (посчитана в setup), скорость, чаевые */
export function payStop (o, st, onTime, tier) {
  const sp = o.ord, fee = st.fee || (sp.fees && sp.fees[o.idx]) || Math.round(S.fee / o.stops.length);
  const zone = st.zone || sp.zone;
  markUsed(st.key);
  st.done = true;                                         // отдали: пины карты и накладная в паузе
  SH.done += o.idx === o.stops.length - 1 ? 1 : 0;
  if (st.far) SH.far += onTime ? st.far : Math.round(st.far * PAY.LATE);   // «весь город»: премия за дальние за смену (итоги)
  if (!onTime) { st.pay = { fee, bonus: 0, tip: 0, late: true, story: !!sp.story }; return Math.round(fee * PAY.LATE); }
  const bonus = tier ? Math.round(fee * (PAY.SPEED_BONUS[tier] || 0)) : 0;
  const lunch = S.lunch === 'tips';
  const pc = DIST.pace();
  const gTip = st.x !== undefined ? GROW.tipAdd(st.x, st.z) : GROW.tipAdd();   // ступень пиццерии (econ.js GROWTH.TIP)
  let tip = ECON.tipFor(fee, zone, { lunch, clean: A.donated('trash'), extra: (pc.tipChance || 0) + gTip, mul: pc.tipMul || 1 }), rich = zone === 'rich' && tip > 0;
  // богач рядом (LIFE.richTip) — клиент считается как из особняков: чаевые по-богатому
  if (!tip && zone !== 'rich' && A.LIFE && A.LIFE.richTip(st.peds, fee)) {
    const [a, b] = TIPS.RICH_AMOUNT;
    tip = Math.round(fee * rand(a, b) * (lunch ? TIPS.LUNCH_MUL : 1) * (pc.tipMul || 1) / 10) * 10;
    rich = true;
  }
  if (tip > 0) tip = Math.round(tip * (RESPECT.perk('tipK') || 1) / 10) * 10;   // звание по респекту — чаевые больше (econ.js RESPECT.LEVELS)
  if (st.bumped) tip = 0;                                 // задел клиента машиной (game.js clientBump, ECON.CLIENT_HIT) — без чаевых
  // из чего сложилась оплата — game.js покажет кучкой денег и чеком (popPay); сюжет — катсцена сама покажет награду
  st.pay = { fee, bonus, tip, rich: rich && tip > 0, late: false, story: !!sp.story };
  return fee + bonus + tip;
}

/* весь заказ отдан: сюжет, поручение */
export function delivered (o, st, onTime) {
  const sp = o.ord;
  // сборный: все адреса вовремя — ещё BUNDLE.ALL_BONUS от оплаты развоза
  if (sp.bundle && o.stops.every(q => q.pay && !q.pay.late)) {
    const bonus = Math.round(o.stops.reduce((a, q) => a + (q.fee || 0), 0) * BUNDLE.ALL_BONUS / 10) * 10;
    if (bonus > 0) {
      S.money += bonus;
      if (!S.freeRun) A.addWallet(bonus);
      A.popBonus(t('весь развоз вовремя!'), '+' + A.money(bonus));
    }
  }
  if (sp.story && STORY && typeof STORY.onDeliver === 'function') {
    if (CUR.order === o) CUR.done = true;
    if (A.marker) A.marker.visible = false;               // в катсцене столб маркера не нужен
    sp.story.late = !onTime;                              // условие «успеть» у глав героев (herostories.js)
    try { STORY.onDeliver(sp.story); } catch (e) { console.warn('[orders] STORY.onDeliver', e); }
  }
  if (sp.side) {
    if (onTime && !S.ride && st.persons[0] && st.peds[0] && !st.peds[0].dead && DIRECTOR.can('errand') && offerSide(st.peds[0], st.persons[0])) return;
    SH.sideOwed = true;                                   // не вышло — попросит следующий
  }
}

/* ─────────────── поручения ─────────────── */
function sideOpts (ped) {
  return SIDE_ORDERS.filter(s => (!s.adult || A.ADULT) && (!s.kids || !A.ADULT))
    .map(s => ({ s, shop: A.errandShop({ kinds: s.shop.kinds || [], prefer: s.shop.prefer || /$^/, anyKind: !!s.shop.anyKind }, ped) }))
    .filter(o => o.shop);
}
function offerSide (ped, person, only) {
  const opts = sideOpts(ped).filter(o => !only || o.s.id === only);
  if (!opts.length) return false;
  const { s, shop } = pick(opts);
  S.handT = 1e9;                                          // пока думаешь — дальше не едем
  ped.freeT = 1e9;
  const pay = rint(s.pay || ORDERS.SIDE_PAY);
  const what = t(s.what);
  DLG.say({
    person, name: person.first || person.name.split(/\s+/)[0], text: t(s.ask) + ' (+' + A.money(pay) + ')',
    accept: t(s.accept), decline: t(s.decline), mood: s.mood || 'calm', color: typeColor('side'),
    timer: s.timer || 8, timeoutText: t(s.timeout || N_('ну лан ((')),
  }).then(r => {
    if (r === true && S.state === 'handover' && !ped.dead) A.startSide(ped, person, shop, { id: s.id, ask: what, what, gotIt: t('купил: {what}', { what }), pay, bag: s.bag, side: true });
    else A.declineSide(ped);
  });
  return true;
}

/* ── пакет-майка: полупрозрачный, в нём видно, что везём ──
   Геометрии и материалы — общие на всех, группа — новая (её уносит flyBox). */
let BAG = null;
const ITEM_HEX = { bottle: '#5fb86a', bottle2: '#c07a2a', wrap: '#e6cf9a', box: '#e4e6ea', tin: '#3a6fd8' };
export function bagMesh (bag = {}) {
  const T = A.THREE;
  if (!BAG) {
    BAG = {
      body: new T.BoxGeometry(0.46, 0.5, 0.26), top: new T.BoxGeometry(0.46, 0.06, 0.26),
      handle: new T.TorusGeometry(0.09, 0.016, 4, 10, Math.PI),
      bottle: new T.CylinderGeometry(0.065, 0.065, 0.3, 8), neck: new T.CylinderGeometry(0.022, 0.04, 0.12, 6),
      wrap: new T.CylinderGeometry(0.075, 0.07, 0.34, 8), box: new T.BoxGeometry(0.28, 0.18, 0.14), tin: new T.CylinderGeometry(0.1, 0.1, 0.045, 14),
      mats: new Map(),
    };
  }
  const mat = (hex, op = 1) => {
    const k = hex + op;
    if (!BAG.mats.has(k)) {
      const m = new T.MeshLambertMaterial({ color: hex, transparent: op < 1, opacity: op, depthWrite: op >= 1, side: op < 1 ? T.DoubleSide : T.FrontSide });
      m.userData.keep = true;
      BAG.mats.set(k, m);
    }
    return BAG.mats.get(k);
  };
  const g = new T.Group();
  const col = bag.color || '#f4f4f0', dark = /^#[0-3]/.test(col);
  const body = new T.Mesh(BAG.body, mat(col, dark ? 0.72 : 0.42));
  body.position.y = 0.25;
  const rim = new T.Mesh(BAG.top, mat(col, dark ? 0.85 : 0.6));
  rim.position.y = 0.5;
  g.add(body, rim);
  for (const s of [-1, 1]) {                             // ручки-«майка»
    const h = new T.Mesh(BAG.handle, mat(col, dark ? 0.85 : 0.6));
    h.position.set(0.14 * s, 0.53, 0);
    g.add(h);
  }
  const it = bag.item || 'box', hex = bag.itemColor || ITEM_HEX[it] || '#e4e6ea';
  const put = (geo, x, y, z, rx = 0, rz = 0, h = hex) => { const m = new T.Mesh(geo, mat(h)); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); g.add(m); };
  if (it === 'bottle' || it === 'bottle2') {
    const xs = it === 'bottle2' ? [-0.09, 0.09] : [0];
    for (const x of xs) { put(BAG.bottle, x, 0.17, 0); put(BAG.neck, x, 0.38, 0); }
  } else if (it === 'wrap') put(BAG.wrap, 0, 0.2, 0, 0, 0.35);
  else if (it === 'tin') { put(BAG.tin, 0, 0.05, 0); put(BAG.tin, 0, 0.1, 0, 0, 0, '#dfe3ea'); }
  else put(BAG.box, 0, 0.1, 0);
  g.scale.setScalar(1.25);
  return g;
}

/* ─────────────── развоз смены ─────────────── */
/* Спрашивают только в пиццерии (04.10.2026): полночь застала в дороге — заказ снимаем, «заедь в пиццерию»,
   маршрут назад (зелёный); вернулся — game.js (handover без заказа) → career.atBase → staffHere() — диалог.
   Не вернулся за STAFF_WAIT с — ушли пешком (false), смена кончается. */
const STAFF = { p: null, res: null, crew: null, board: null, drops: [], pay: 0, wait: false, waitT: 0 };
const STAFF_WAIT = 150;
export function staffRide () {
  if (!A) return Promise.resolve(false);
  if (STAFF.p) return STAFF.p;
  STAFF.p = new Promise(res => { STAFF.res = res; });
  const n = rint(STAFF_RIDE.people || [2, 3]);
  const crew = Array.from({ length: n }, () => makePerson());
  STAFF.crew = crew; STAFF.pay = 0;
  const P = A.PIZZA, here = !S.order && !S.side && S.state === 'handover' && P && Math.hypot(V.x - P.x, V.z - P.z) < 25;
  if (here) staffAsk();
  else {
    STAFF.wait = true; STAFF.waitT = 0;
    if (S.side) { if (!S.side.ped.dead) S.side.ped.freeT = 3; S.side = null; }
    A.hidePhone(); A.clearGate();
    if (A.backToBase) A.backToBase();
    A.toast(t('полночь — заедь в пиццерию: смену надо развезти'));
  }
  return STAFF.p;
}
function staffAsk () {
  const crew = STAFF.crew;
  STAFF.wait = false;
  S.handT = 1e9;                                          // пока спрашивают — следующий заказ не берём
  DLG.say({
    person: crew[0], name: crew[0].first + ' · ' + t('пиццерия'), text: t(STAFF_RIDE.ask),
    accept: t(STAFF_RIDE.accept), decline: t(STAFF_RIDE.decline), mood: 'shy', color: typeColor('staff'),
  }).then(r => { if (r === true && STAFF.crew === crew) beginStaff(crew); else staffDone(false); });
}
/** развоз ждёт, пока вернёшься в пиццерию (career.js lateGuard не закрывает смену) */
export const staffWaiting = () => !!(STAFF.p && STAFF.wait);
/** вернулся в пиццерию (career.atBase): ждали — спрашиваем; true — ход забрали */
export function staffHere () {
  if (!STAFF.p || !STAFF.wait) return false;
  staffAsk();
  return true;
}
/* смена оборвалась (снялся, новая смена): развоз снимаем, обещание — false */
function staffAbort () {
  if (!STAFF.p) return;
  if (STAFF.board) for (const p of STAFF.board.peds) { A.clearGuest(p); if (!p.dead) { A.rehuman(p); A.walkSpawn(p, 150, 400); } }
  if (S.order && S.order.ord && S.order.ord.type === 'staff') { S.order = null; S.target = null; }
  staffDone(false);
}
function staffDone (r) {
  const res = STAFF.res;
  STAFF.p = null; STAFF.res = null; STAFF.board = null; STAFF.crew = null; STAFF.wait = false;
  if (res) res(r);
}
function beginStaff (crew) {
  // что было — снимаем: смена кончилась
  if (S.side) { if (!S.side.ped.dead) S.side.ped.freeT = 3; S.side = null; }
  if (S.order) for (const st of S.order.stops) for (const p of st.peds) if (!p.served) A.clearGuest(p);
  A.hidePhone(); A.clearGate();
  dropQueue();
  if (!POOL.length) buildPool();
  const homes = [];
  for (let i = 0; i < crew.length; i++) {
    const prev = homes[i - 1];
    const s = prev ? pickSpot({ from: prev, dmin: ORDERS.STAFF_DIST[2], dmax: ORDERS.STAFF_DIST[3] }) : pickSpot({ dmin: ORDERS.STAFF_DIST[0], dmax: ORDERS.STAFF_DIST[1] });
    if (!s) break;
    SH.reserved.add(s.key);
    homes.push(s);
  }
  if (!homes.length) { staffDone(false); return; }
  crew.length = homes.length;
  const P = A.PIZZA;
  const far = Math.hypot(V.x - P.x, V.z - P.z) > 25;
  const stops = [];
  if (far) stops.push({ peds: [], persons: crew.slice(), at: { x: P.x, z: P.z }, pickup: true, addr: P.name, note: '' });
  homes.forEach((h, i) => stops.push({ peds: [], persons: [crew[i]], at: { x: h.x, z: h.z }, key: h.key, zone: h.zone, addr: A.realAddress(h.x, h.z), note: '', reach: 7 }));
  S.order = { kind: 'chain', stops, idx: 0, why: t('развоз смены'), items: '', ord: { type: 'staff', kind: 'chain', color: typeColor('staff'), zone: homes[0].zone, stops: homes.map(h => ({ key: h.key, zone: h.zone })), m: [] } };
  // срок — путь по дорогам на средней скорости (RUN_V) × ORDERS.STAFF_TIME + 6 с на остановку
  // (было 900 с: после полуночи смена тянулась до 15 минут — «смена не кончается»)
  let L = 0, at = { x: V.x, z: V.z };
  for (const q of stops) { L += A.routeLen(at.x, at.z, q.at.x, q.at.z); at = q.at; }
  S.timeMax = S.time = Math.round(L / RUN_V * (ORDERS.STAFF_TIME || 1.5) + 6 * stops.length + 10);
  if (far) {
    S.state = 'drive';
    A.syncTarget(); A.rebuildRoutePath();
    A.toast(t('заедь за ними в пиццерию'));
  } else boardCrew();
}
/* работники выходят из пиццерии, доходят до машины и «садятся» — пропадают */
function boardCrew () {
  const P = A.PIZZA, crew = STAFF.crew || [];
  S.state = 'loading';
  V.vx = V.vz = 0;
  const free = A.alive().filter(p => !p.guest && !p.dead).sort((a, b) => ((a.x - P.x) ** 2 + (a.z - P.z) ** 2) - ((b.x - P.x) ** 2 + (b.z - P.z) ** 2));
  const peds = [];
  crew.forEach((person, i) => {
    const p = free[i];
    if (!p) return;
    if (p.idle) A.releaseIdle(p);
    p.path = null; p.w = null;
    A.rehuman(p, person);
    p.x = (P.wx !== undefined ? P.wx : P.x) + rand(-1.2, 1.2); p.z = (P.wz !== undefined ? P.wz : P.z) + rand(-1.2, 1.2);
    A.pushOut(p, 0.5);
    A.makeGuest(p, { x: V.x + rand(-1, 1), z: V.z + rand(-1, 1) });
    peds.push(p);
  });
  STAFF.board = { peds, t: 0 };
  A.toast(t('садитесь — развезу'));
}
function staffArrive (o, st) {
  if (st.pickup) { o.idx++; boardCrew(); return; }
  const pay = ORDERS.STAFF_PAY;
  S.money += pay; STAFF.pay += pay;
  if (!S.freeRun) A.addWallet(pay);
  markUsed(st.key);
  // выходит у своего подъезда
  const P = st.persons[0];
  const p = A.alive().filter(q => !q.guest && !q.dead).sort((a, b) => ((a.x - V.x) ** 2 + (a.z - V.z) ** 2) - ((b.x - V.x) ** 2 + (b.z - V.z) ** 2))[0];
  const line = t(pick(STAFF_RIDE.lines));
  if (p) {
    if (p.idle) A.releaseIdle(p);
    p.path = null; p.w = null;
    A.rehuman(p, P);
    p.x = V.x + Math.cos(V.h) * 1.9; p.z = V.z - Math.sin(V.h) * 1.9;
    A.pushOut(p, 0.5);
    A.makeGuest(p, { x: st.at.x, z: st.at.z });
    const b = A.sayBubble(p.grp, line, '#8a6a00', 2.7);
    STAFF.drops.push({ p, b, t: 7 });
  }
  A.toast(line + ' · +' + A.money(pay));
  A.Snd.coin();
  o.idx++;
  if (o.idx < o.stops.length) {
    A.syncTarget(); A.rebuildRoutePath();
    return;
  }
  const stars = rint(ORDERS.STAFF_STARS);
  try { if (CAR && typeof CAR.addStars === 'function') CAR.addStars(stars); } catch (e) { console.warn('[orders] addStars', e); }
  A.popBonus(t('развёз смену!'), t('+{money} · +{n} ★', { money: A.money(STAFF.pay), n: stars }));
  const n = o.stops.filter(s => !s.pickup).length, total = STAFF.pay;
  S.order = null; S.target = null;
  // в полночь career.js сразу закрывает смену; если развоз позвали посреди смены (песочница) — следующий заказ
  S.state = 'handover'; S.handT = 0.8;
  A.rebuildRoutePath();
  staffDone({ ok: true, people: n, pay: total, stars });
}

/* ─────────────── каждый кадр ─────────────── */
let urgOn = null;
export function step (dt) {
  if (!A) return;
  if (window.__dlv && !window.__dlv.ORD) window.__dlv.ORD = DEBUG;
  // посадка работников: дошёл до машины — пропал (в машине)
  const B = STAFF.board;
  if (B) {
    B.t += dt;
    for (let i = B.peds.length - 1; i >= 0; i--) {
      const p = B.peds[i];
      if (p.dead || Math.hypot(p.x - V.x, p.z - V.z) < 1.8 || B.t > 6) {
        A.clearGuest(p);
        if (!p.dead) { A.rehuman(p); A.walkSpawn(p, 150, 400); }
        B.peds.splice(i, 1);
      }
    }
    if (!B.peds.length) {
      STAFF.board = null;
      S.state = 'drive';
      A.syncTarget(); A.rebuildRoutePath();
      A.toast(t('все сели — по домам'));
      A.Snd.blip(760, 0.1, 'square', 0.13);
    }
  }
  for (let i = STAFF.drops.length - 1; i >= 0; i--) {
    const d = STAFF.drops[i];
    if ((d.t -= dt) > 0 && !d.p.dead) continue;
    if (d.b.parent) d.b.parent.remove(d.b);
    d.b.material.dispose();
    A.clearGuest(d.p);
    STAFF.drops.splice(i, 1);
  }
  // ждут в пиццерии, а ты не едешь — ушли пешком
  if (STAFF.p && STAFF.wait && (STAFF.waitT += dt) > STAFF_WAIT) {
    A.toast(t('не дождались — ушли пешком'));
    staffDone(false);
  }
  // развоз не успел: работники выходят и идут пешком — обещание false, career.js закрывает смену
  if (STAFF.p && S.order && S.order.ord && S.order.ord.type === 'staff' && S.time < 0 && ['drive', 'loading'].includes(S.state)) {
    A.toast(t('не успел развезти — дальше они пешком'));
    staffAbort();
  }
  // смена оборвалась посреди развоза
  if (STAFF.p && STAFF.crew && (S.state === 'over' || S.state === 'title' || S.state === 'dying') && !(S.order && S.order.ord && S.order.ord.type === 'staff')) staffDone(false);
  trackStory();
  hud();
}

/* рамка срочного у часов; список «дальше» на HUD убран — следующие заказы игроку не показываем */
function hud () {
  const urg = !!(S.state === 'drive' && S.order && S.order.ord && S.order.ord.urgent);
  if (urg !== urgOn) {
    urgOn = urg; document.body.classList.toggle('ord-urgent', urg);
    const tw = document.getElementById('timewrap');
    if (tw) tw.dataset.urg = t('СРОЧНО');               // «СРОЧНО» красным слева от часов (css ниже)
  }
}

/* ─────────────── цвета: радар, карта, кольцо ─────────────── */
export function targetColor () {
  if (S.state === 'side') return typeColor('side');
  if (S.state === 'back') return '#3fd15e';                // в пиццерию — зелёный, как путь (game.js ROUTE_HEX)
  const st0 = S.order && S.order.stops && S.order.stops[S.order.idx];
  if (st0 && st0.pickup) return '#3fd15e';                 // развоз смены: сначала заехать за ними в пиццерию
  const sp = S.order && S.order.ord;
  return sp ? sp.color : typeColor('pizza');
}
let tintHex = '';
const TMP = { c: null };
export function tintMarker (marker) {
  const hex = targetColor();
  if (hex === tintHex) return;
  tintHex = hex;
  const T = A.THREE;
  TMP.c = TMP.c || new T.Color();
  const u = marker.userData, beam = marker.children[2];
  TMP.c.set(hex);
  u.pin.material.color.copy(TMP.c);
  u.ring.material.color.copy(TMP.c);
  u.ball.material.color.copy(TMP.c).lerp(new T.Color(0xffffff), 0.25);
  if (beam && beam.material) beam.material.color.copy(TMP.c).lerp(new T.Color(0xffffff), 0.45);
}
/* ─────────────── сборный заказ: все адреса разом, порядок выбирает игрок ───────────────
   o.stops[0 … idx) — отданные, [idx …) — ещё нет. Все адреса — неподвижные пины (st.at). Цель
   (o.stops[idx] → S.target, маршрут rebuildRoutePath) выбирается, только когда заказ начался и
   после каждого вручения — ближайший по дорогам неотданный (pickStop, из syncTarget); пока едешь,
   сама не перескакивает. Подъехал к любому другому неотданному — он и становится целью
   (reachStop, каждый кадр в drive), вручение как обычно (checkArrival). */
const stopAt = st => st.at || st.peds[0];
function swapStop (o, i) {
  if (i === o.idx) return false;
  const a = o.stops;
  [a[o.idx], a[i]] = [a[i], a[o.idx]];
  return true;
}
export function reachStop (o) {
  if (!o || !o.ord || !o.ord.bundle || o.stops.length - o.idx < 2) return false;
  for (let i = o.idx; i < o.stops.length; i++) {           // у текущего — уже он
    const st = o.stops[i], p = stopAt(st);
    if (p && Math.hypot(p.x - V.x, p.z - V.z) <= (st.reach || 6) + 2) return swapStop(o, i);
  }
  return false;
}
export function pickStop (o) {
  if (!o || !o.ord || !o.ord.bundle || o.stops.length - o.idx < 2) return;
  let bi = o.idx, bl = Infinity;
  for (let i = o.idx; i < o.stops.length; i++) {
    const p = stopAt(o.stops[i]);
    if (!p) continue;
    const L = A.routeLen(V.x, V.z, p.x, p.z);
    if (L < bl) { bl = L; bi = i; }
  }
  swapStop(o, bi);
}
/* все неотданные адреса текущего заказа — для пинов на радаре и карте (current — тот, куда
   ведёт маршрут, он же S.target). Поручение и «в пиццерию» — пусто: там одна цель S.target */
export function activeStops () {
  const o = S.order;
  if (!o || !o.stops || S.state === 'side' || S.state === 'back' || S.state === 'handover') return [];
  const col = o.ord ? o.ord.color : typeColor('pizza'), out = [];
  for (let i = o.idx; i < o.stops.length; i++) {
    const st = o.stops[i], p = stopAt(st);
    if (!p || st.pickup) continue;
    out.push({ x: p.x, z: p.z, color: col, current: i === o.idx, name: st.persons && st.persons[0] ? st.persons[0].name : '', addr: st.addr || '' });
  }
  return out;
}
/* красная обводка срочного на радаре */
export function radarRing (ctx, a, b) {
  const sp = S.order && S.order.ord;
  if (!sp || !sp.urgent || S.state !== 'drive') return;
  const k = (performance.now() / 700) % 1;
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255, 45, 74, ' + (1 - k).toFixed(2) + ')';
  ctx.beginPath(); ctx.arc(a, b, 5 + k * 6, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1.2; ctx.strokeStyle = '#fff';
  ctx.strokeRect(a - 4.6, b - 4.6, 9.2, 9.2);
}

/* ─────────────── стили: одна вставка, без правки delivery.css ─────────────── */
function css () {
  if (document.getElementById('orders-css')) return;
  const s = document.createElement('style');
  s.id = 'orders-css';
  s.textContent = `
#phone.ord-typed { border-top: 6px solid var(--ord, #ff8a2b); }
#phone.ord-typed .ph-top { box-shadow: inset 0 -5px 0 var(--ord, #ff8a2b); }
#phone.ord-typed .ph-dot { background: var(--ord, #ff8a2b); }
#phone.ord-urgent { outline: 3px solid #ff2d4a; outline-offset: 2px; }
.oc-pay { font-size: 8px; line-height: 1.8; color: #7f8cc0; text-align: center; }
.oc-pay b { color: #ff2d4a; font-weight: normal; }
#phone.ord-many .oc-inv tr:first-child td b { font-size: clamp(10px, 1.15vw, 16px); }
#phone.ord-many .oc-inv tr:first-child td small { margin: 0 0 4px; }
#phone.ord-many .oc-inv th, #phone.ord-many .oc-inv td { padding-top: clamp(3px, .6vh, 7px); padding-bottom: clamp(3px, .6vh, 7px); }
#phone .oc-photos.many { display: grid; grid-template-columns: repeat(2, auto); gap: 6px; }
#phone .oc-photos.many .oc-p img, #phone .oc-photos.many .oc-p i { width: clamp(44px, 5vw, 76px); height: clamp(44px, 5vw, 76px); border-width: 4px; border-bottom-width: 9px; }
body.ord-urgent #timewrap { outline: 2px solid #ff2d4a; box-shadow: 0 0 10px #ff2d4a; animation: ord-urg 0.9s ease-in-out infinite; }
body.ord-urgent #timewrap::before { content: attr(data-urg); order: -1; background: #ff2d4a; color: #fff; font-size: 11px; letter-spacing: .08em;
  padding: 3px 5px 2px; border-radius: 3px; box-shadow: 0 2px 0 #7a0f1e; }
#phone > .oc-stamp { position: absolute; top: 46px; right: 18px; z-index: 3; pointer-events: none; transform: rotate(-11deg);
  color: #e0182f; border: 4px solid #e0182f; border-radius: 6px; padding: 5px 12px 3px; font-size: clamp(18px, 2.4vw, 30px);
  letter-spacing: .12em; line-height: 1; background: rgba(255, 243, 214, .6); opacity: .9;
  box-shadow: inset 0 0 0 2px rgba(224, 24, 47, .35); animation: oc-stamp .35s cubic-bezier(.2, 1.6, .5, 1) both; }
@keyframes oc-stamp { from { transform: rotate(-11deg) scale(2.2); opacity: 0; } }
@keyframes ord-urg { 50% { box-shadow: 0 0 2px #ff2d4a; } }
`;
  document.head.appendChild(s);
}

/* ─────────────── песочница: заказ и поручение прямо сейчас ─────────────── */
let FORCE = null;
function dropCurrent () {
  if (S.side) { if (!S.side.ped.dead) S.side.ped.freeT = 3; S.side = null; }
  if (S.order) for (const st of S.order.stops) for (const p of st.peds) if (!p.served) A.clearGuest(p);
  S.order = null;
  A.hidePhone(); A.clearGate();
}
export function force (spec = {}) {
  if (!A || !['drive', 'back', 'handover', 'brief', 'loading', 'side'].includes(S.state)) return null;
  if (!POOL.length) buildPool();
  const D = distRing();
  let sp = null;
  if (spec.storyId || spec.type === 'story' || spec.kind === 'story') sp = storySpec(spec);
  else {
    const k = spec.kind || 'pizza';
    let s = null;
    if (spec.near) s = pickSpot({ near: spec.near, r: spec.r || 350, zone: spec.zone || null });
    else if (k === 'edge') { if (!POOL.length) buildPool(); s = edgeSpot(); }
    else if (k === 'urgent') s = urgentSpot(spec.zone);
    else if (k === 'gang' || spec.zone) {
      const z = spec.zone || 'gang';
      s = ZMIN[z] >= 0 ? pickSpot({ zone: z, relax: false, dmin: ZMIN[z], dmax: ZMIN[z] + 800 }) : null;
      if (!s && z === 'gang') { const g = ZN.gangZones()[0]; if (g) s = pickSpot({ near: g, r: g.r }); }
    } else s = pickSpot({ dmin: (spec.dist && spec.dist.min) || D.min, dmax: (spec.dist && spec.dist.max) || D.max });
    if (s) sp = { type: k === 'urgent' ? 'urgent' : 'pizza', kind: 'solo', urgent: k === 'urgent', edge: k === 'edge', stops: [stopOf(s)] };
  }
  if (!sp) { A.toast(t('нет подходящего адреса')); return null; }
  sp.m = sp.stops.map(st => Math.round(A.routeLen(A.PIZZA.x, A.PIZZA.z, st.x, st.z)));
  sp.zone = sp.stops[0].zone; sp.color = sp.color || typeColor(sp.type); sp.n = ++SH.gen; sp.forced = 'force';
  for (const st of sp.stops) SH.reserved.add(st.key);
  dropCurrent();
  A.Store.set('dlv-msk-tut', '1');                       // учебный не нужен: карьерный план
  FORCE = sp;
  if (S.orders <= SH.last) SH.last = S.orders - 1;       // не считать это новой сменой
  A.newOrder();
  return S.order;
}
export function forceSide (id) {
  if (!A || !['drive', 'back', 'handover', 'brief', 'side'].includes(S.state)) return false;
  let ped = null, person = null;
  const st = S.order && S.order.stops[S.order.idx];
  if (st && st.peds[0] && !st.peds[0].dead) { ped = st.peds[0]; person = st.persons[0] || ped.person; }
  else {
    const near = A.alive().filter(p => !p.guest && !p.dead).sort((a, b) => ((a.x - V.x) ** 2 + (a.z - V.z) ** 2) - ((b.x - V.x) ** 2 + (b.z - V.z) ** 2))[0];
    if (near) { ped = near; person = near.person; }
  }
  if (!ped || !person) return false;
  const keep = S.order && S.order.stops.some(q => q.peds.includes(ped));
  if (keep) { for (const q of S.order.stops) for (const p of q.peds) if (p !== ped && !p.served) A.clearGuest(p); S.order = null; A.hidePhone(); A.clearGate(); }
  else { dropCurrent(); A.makeGuest(ped); }
  if (S.side) S.side = null;
  S.state = 'handover';
  if (!offerSide(ped, person, id)) { A.toast(t('рядом нет нужного магазина')); S.handT = 0.2; return false; }
  return true;
}

/* ─────────────── отладка: __dlv.ORD ─────────────── */
/* simShift(n, h0, h1, life, told): прогнать смену без езды — n заказов с часами от h0 до h1,
   каждый «доставлен» (адрес — в dlv-used-addr). life — номер первого заказа за всё время
   (по умолчанию — настоящий), told — сколько пицц директор уже объявил (по умолчанию —
   из сохранения); сохранение счётчиков не трогает. Возвращает журнал. */
function simShift (n = 10, h0 = 9, h1 = 23.5, life = null, told = null) {
  LIFE_OVERRIDE = life !== null ? life : lifeN();
  SIM_TOLD = told !== null ? told : +A.Store.get('dlv-boss', 0) || 0;
  HOUR_OVERRIDE = h0; SIM = true;
  resetShift();
  const out = [];
  for (let i = 0; i < n; i++) {
    HOUR_OVERRIDE = h0 + (h1 - h0) * i / Math.max(1, n - 1);
    const sp = genSpec();
    if (!sp) break;
    for (const st of sp.stops) markUsed(st.key);
    SH.done++;
    const lvl = { urgent: !!sp.urgent, edge: !!sp.edge, level: A.level() };
    out.push({ n: sp.n, life: LIFE_OVERRIDE, h: +HOUR_OVERRIDE.toFixed(1), type: sp.type, kind: sp.kind, zone: sp.zone, stops: sp.stops.length, edge: !!sp.edge, urgent: !!sp.urgent, side: !!sp.side, forced: sp.forced, m: sp.m, keys: sp.stops.map(s => s.key),
      boss: sp.bundle ? sp.bundle.boss : null, fee: sp.stops.reduce((a, st, k) => a + ECON.orderPay(sp.m[k] || 0, st.zone, lvl), 0),
      far: DIST.has() && DIST.city() ? sp.m.map(ECON.cityFar) : null });
    if (sp.bundle && sp.bundle.boss) SIM_TOLD = Math.max(SIM_TOLD, Math.abs(sp.bundle.boss));
    LIFE_OVERRIDE += sp.bundle ? sp.stops.length : 1;
  }
  LIFE_OVERRIDE = null; HOUR_OVERRIDE = null; SIM = false;
  dropQueue();
  SH.last = 0;
  return out;
}
/** «весь город»: премия за дальние, заработанная за эту смену (итоги смены, career.js) */
export const farEarned = () => SH.far || 0;
export const DEBUG = {
  farEarned, Q, SH, get POOL () { return POOL; }, get USED () { return USED; }, STAFF, ARRIVE, simShift, resetShift, genSpec, pickSpot, staffRide, bagMesh,
  get CAR () { return CAR; }, get STORY () { return STORY; }, hourNow, offerSide, sideOpts, force, forceSide, nextPlan, card, onArrive,
  lifeN, bundleSpec, activeStops, pickStop, reachStop,
  clearUsed () { USED = []; reindex(); A.Store.set(USED_KEY, USED); },
};
