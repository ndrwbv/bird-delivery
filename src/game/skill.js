/* ──────────────────────────────────────────────────────────────────────────
   Умение курьера — динамическая сложность заказов (17.10.2026; docs/ORDERS.md «Умение курьера», числа — SKILL в econ.js).
   Автор 12.10: «если я нормально вожу заказы простые, то начать давать сложнее… повышая сложность, пока я не начну ошибаться,
   взрываться… Начинаешь с простого, а потом сложность выше и выше».

   Умение — число 0…SKILL.MAX (сохранение SKILL.KEY: { u, shift }). Растёт от чистых доставок, падает от опозданий, сорванного
   срочного, взрыва машины, опоздания обратно (SKILL.GAIN). Новая смена — с умения × CARRY. Новая игра — с START (0), старое
   сохранение без умения — с START_OLD (как было до 17.10.2026). Быстрый заезд — QUICK, не меняется; «покататься» — не считается.
   От умения — только заказы (физика, урон, цены — те же): точки SKILL.STEPS, между ними — по прямой:
     cap  — потолок напряжения ритма смены (rhythm.js k): дальность подъёма, сборные (с 0,2, пицц до 2 + 5k), срочные «по шансу» (с 0,5);
     time — срок × (с полом «доехать реально»); с 24.10.2026 только «новичку больше» (1,2 → 1 к умению 5), срок мастеру
            ужимает press.js (серия чистых — короче, до −30 %; ошибка — отпускает);
     hard — доля сложных: вес сборных, шанс срочного и окраины, вес бандитских адресов, срочный в кульминации;
     far  — «хочется» по дорогам × (orders.js arcTarget);
     size — самое большее пицц в сборном.
   Срочные — с умения URGENT_FROM (новичок первые чистые доставки срочных не видит).
   Толик в чате изредка говорит, что заказы стали сложнее или проще (SAY_*).

   Из game.js: init({ Store, S, adult, career, quick() }), hurt(сердец) — удар снял сердца, wreck() — машина всё / под лёд,
     urgent() — срочный сорван, back() — опоздал обратно.
   Из orders.js: beginShift() — новая смена, cur() — умение для этого заказа, k(k) — напряжение с потолком, time(…), hard(), far(),
     begin() — заказ выдан (Толик, если пора), stop(onTime, bumped, bundle) — адрес отдан.
   Отладка: __dlv.SKILL — state, log, set(u), at(u) — что даёт умение u.
   ────────────────────────────────────────────────────────────────────────── */
import { SKILL as C } from './econ.js';
import { t, N_ } from '../i18n/index.js';
import * as CHAT from './chat.js';
import * as DIRECTOR from './director.js';
import * as PRESS from './press.js';          // ужатие срока: серия чистых — срок короче, ошибка — отпускает (press.js, 24.10.2026)

let A = null;
const K = { lost: 0, n: 0, gap: 3, saidAt: 0, told: null, log: [], sim: null };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
function get (k, d) { try { return A && A.Store ? A.Store.get(k, d) : d; } catch (e) { return d; } }
function set (k, v) { try { if (A && A.Store) A.Store.set(k, v); } catch (e) { /* без сохранения — не страшно */ } }
const shiftNo = () => (+get('dlv-shifts', 0) || 0) + 1;
function note (s) {
  K.log.push('#' + K.n + ' ' + s);
  if (K.log.length > 60) K.log.splice(0, K.log.length - 60);
}

export function init (api) {
  A = api;
  PRESS.init(api);
  if (typeof window !== 'undefined' && window.__dlv) window.__dlv.SKILL = DEBUG;
}

/* сохранение: { u, shift }; нет — новая игра с START, старое сохранение — с START_OLD */
function load () {
  let v = get(C.KEY, null);
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
  if (v && typeof v === 'object' && Number.isFinite(+v.u)) return { u: clamp(+v.u, 0, C.MAX), shift: +v.shift || 0 };
  const old = (+get('dlv-shifts', 0) || 0) >= C.OLD_SHIFTS;
  return { u: old ? C.START_OLD : C.START, shift: 0 };
}
const save = v => set(C.KEY, { u: +v.u.toFixed(2), shift: v.shift });

/* умение не считается: не карьера, «покататься», быстрый заезд (там — QUICK) */
const off = () => !A || !A.career || !A.S || A.S.ride || A.S.free;
const quick = () => { try { return !!(A && A.quick && A.quick()); } catch (e) { return false; } };

/** умение для заказа (прогон без езды — K.sim) */
export function cur () {
  if (K.sim !== null) return K.sim;
  if (!A || !A.career) return C.START_OLD;
  if (quick()) return C.QUICK;
  return load().u;
}

/* что даёт умение u: точки STEPS, между ними — по прямой */
export function at (u) {
  const S = C.STEPS;
  if (u <= S[0].u) return { ...S[0], u };
  for (let i = 1; i < S.length; i++) {
    if (u <= S[i].u) {
      const a = S[i - 1], b = S[i], f = (u - a.u) / (b.u - a.u), L = k => +(a[k] + (b[k] - a[k]) * f).toFixed(3);
      return { u, cap: L('cap'), time: L('time'), hard: L('hard'), far: L('far'), size: Math.round(L('size')) };
    }
  }
  return { ...S[S.length - 1], u };
}
const now = () => at(cur());

/** напряжение ритма с потолком умения (orders.js genSpec) */
export const k = v => Math.min(v, now().cap);
/** доля сложных × (orders.js: вес сборных, шанс срочного и окраины, бандитские адреса) */
export const hard = () => now().hard;
/** срочные (обязательный, «по шансу», в кульминации) — с умения URGENT_FROM */
export const urgentOk = () => cur() >= C.URGENT_FROM;
/** самое большее пицц в сборном (orders.js bundleSpec) */
export const size = () => now().size;
/** «хочется» по дорогам × (orders.js arcTarget) */
export const far = () => now().far;
/** срок: tm — как посчитан, L — путь по дорогам (сборный — весь развоз), n — адресов. Срочному строже не делаем */
export function time (tm, L, n = 1, urgent = false) {
  let m = now().time * PRESS.k();                            // ужатие срока (press.js): от × 1 до × 0,7
  if (urgent && m < 1) m = 1;
  if (m === 1) return tm;
  const out = tm * m;
  if (m > 1) return out;
  const floor = L / 19 * C.TIME_FLOOR + 5 + 4 * n;           // доехать реально, если не плутать (как BUNDLE.TIME_FLOOR)
  return Math.max(out, Math.min(tm, floor));
}

/** новая смена (orders.js resetShift): умение × CARRY, один раз за смену */
export function beginShift () {
  K.lost = 0; K.n = 0; K.gap = Math.round(rnd(C.SAY_GAP[0], C.SAY_GAP[1])); K.saidAt = 0; K.told = null;
  PRESS.beginShift();
  if (off() || quick()) return;
  const v = load(), no = shiftNo();
  if (v.shift !== no) {
    const was = v.u;
    if (v.shift) v.u = +(v.u * C.CARRY).toFixed(2);           // первая смена с умением — как есть
    v.shift = no; save(v);
    note('смена ' + no + ': умение ' + was.toFixed(1) + ' → ' + v.u.toFixed(1));
  }
  K.told = v.u;
}

/* сдвинуть умение на d */
function add (d, why) {
  if (off() || quick() || !d) return;
  const v = load(), was = v.u;
  v.u = clamp(+(v.u + d).toFixed(2), 0, C.MAX);
  if (!v.shift) v.shift = shiftNo();
  save(v);
  note(why + ' ' + (d > 0 ? '+' : '') + d + ' → ' + v.u.toFixed(1) + (v.u === was ? ' (предел)' : ''));
}

/** заказ выдан (orders.js setup): считаем сердца с нуля; Толик — если умение заметно сдвинулось */
export function begin () {
  K.lost = 0;
  PRESS.begin();
  if (off() || quick()) return;
  K.n++;
  say();
}
/** удар снял сердца (game.js hurtCar) */
export function hurt (h) { if (!off() && h > 0) K.lost += h; }
/** адрес отдан (orders.js payStop) */
export function stop (onTime, bumped, bundle) {
  const G = C.GAIN, m = bundle ? C.BUNDLE_K : 1;
  let d, why;
  if (!onTime) { d = G.LATE; why = 'опоздал'; }
  else if (K.lost > C.LOST_OK) { d = G.BATTERED; why = 'вовремя, но −' + K.lost + ' ♥'; }
  else if (K.lost > 0 || bumped) { d = G.SCRATCH; why = 'вовремя, ' + (bumped ? 'задел клиента' : '−' + K.lost + ' ♥'); }
  else { d = G.CLEAN; why = 'чисто'; }
  K.lost = 0;
  add(+(d * m).toFixed(2), why + (bundle ? ' (сборный)' : ''));
}
/** машина взорвалась / провалилась под лёд (game.js gameOver) */
export function wreck () { K.lost = 0; add(C.GAIN.WRECK, 'машина всё'); PRESS.rate(false, 'машина всё'); }
/** срочный сорван (game.js urgentFail) */
export function urgent () { add(C.GAIN.URGENT, 'срочный сорван'); PRESS.rate(false, 'срочный сорван'); }
/** «рейтинг клиентов» вручения (orders.js payStop): вовремя, не холодная, клиента не задел — хорошо (press.js) */
export const rated = (good, why, bundle) => PRESS.rate(good, why, bundle);
/** множитель ужатия срока сейчас (прогон simShift) */
export const pressK = () => PRESS.k();
/** опоздал обратно (game.js) */
export function back () { add(C.GAIN.BACK, 'опоздал обратно'); }

/* ── Толик: «справляешься — дам посложнее» / «полегче, раз так» ── */
const UP = /*i18n*/ [N_('справляешься — дам посложнее'), N_('смотрю, втянулся. держи заказы пожирнее'),
  N_('раз такой шустрый — сроки подрежу'), N_('ну всё, пойдёшь у меня на дальние')];
const DOWN = /*i18n*/ [N_('полегче, раз так. дам попроще — отдышись'), N_('ладно, пока попроще. соберись'),
  N_('сроки чуть отпущу. но ты давай без этого')];
const DOWN_ADULT = /*i18n*/ [N_('так, хватит херню творить. даю попроще — разомнись')];
const pick = a => a[(Math.random() * a.length) | 0];
function say () {
  if (K.told === null || K.n - K.saidAt < K.gap) return;
  const u = load().u, d = u - K.told;
  const up = d >= C.SAY_UP, down = -d >= C.SAY_DOWN;
  if (!up && !down) return;
  if (DIRECTOR.quiet() || CHAT.busy()) return;                // окно «покататься» или Толик уже пишет — на следующем заказе
  const line = up ? pick(UP) : pick(A && A.adult ? DOWN.concat(DOWN_ADULT) : DOWN);
  K.told = u; K.saidAt = K.n; K.gap = Math.round(rnd(C.SAY_GAP[0], C.SAY_GAP[1]));
  note('Ирина Сергеевна: ' + line);
  CHAT.later(3500, () => { if (!CHAT.busy()) CHAT.say(t(line)); });   // после накладной
}

export const DEBUG = {
  C, PRESS: PRESS.DEBUG,
  get state () { const v = load(); return { u: cur(), saved: v, at: now(), lost: K.lost, n: K.n, told: K.told, gap: K.gap, saidAt: K.saidAt }; },
  get log () { return K.log; },
  at,
  set (u) { const v = load(); v.u = clamp(+u, 0, C.MAX); if (!v.shift) v.shift = shiftNo(); save(v); K.told = v.u; return DEBUG.state; },
  /* сдвинуть умение, как будто доставка (Толик заметит на следующих заказах); begin() — как будто выдан заказ */
  bump (x) { add(+x, 'отладка'); return DEBUG.state; },
  begin: () => { begin(); return DEBUG.state; },
  /* прогон без езды (orders.js simShift): умение u для genSpec, null — снять */
  sim (u) { K.sim = u === null || u === undefined ? null : clamp(+u, 0, C.MAX); return K.sim; },
  /* сдвиг умения по исходу, как в игре, но без сохранения (для прогона): вернёт новое u */
  step (u, kind, lost = 0, bundle = false) {
    const G = C.GAIN, m = bundle ? C.BUNDLE_K : 1;
    const d = kind === 'late' ? G.LATE : kind === 'urgent' ? G.URGENT : kind === 'wreck' ? G.WRECK : kind === 'back' ? G.BACK
      : lost > C.LOST_OK ? G.BATTERED : lost > 0 ? G.SCRATCH : G.CLEAN;
    return clamp(+(u + d * (kind === 'wreck' || kind === 'urgent' || kind === 'back' ? 1 : m)).toFixed(2), 0, C.MAX);
  },
};
