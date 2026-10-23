/* ──────────────────────────────────────────────────────────────────────────
   Ужатие срока — срок под игрока (24.10.2026; docs/ORDERS.md «Ужатие срока», числа — PRESS в econ.js).
   Автор 24.10: «если игрок хорошо справляется с доставками и всегда у него получается — начинать давать меньше времени;
   как только у него рейтинг клиентов упадёт — ослабить, пока не вернётся, и так балансировать».

   Ступень lv 0…MAX: срок заказа × (1 − STEP × lv) — от 100 % до 70 %. «Рейтинг клиентов» (оценок звёздами пока нет) — по
   вручениям: плохое — опоздал, пицца холодная (COLD_BAD), задел клиента, срочный сорван, машина всё; остальное — хорошее.
     хорошее, рейтинг в порядке — +1 к серии; серия RUN — ступень вверх (срок короче), серия с нуля;
     плохое — ступень вниз сразу, серия с нуля, рейтинг «упал» на RATE_N вручений;
     хорошее, пока рейтинг не вернулся — ещё ступень вниз (отпускает быстрее, чем ужимало), рейтинг ближе к норме на 1.
   За один заказ — не больше одной ступени (без скачков от заказа к заказу). Адрес сборного — вполовину (BUNDLE_K).
   Новая смена — ступень вниз на SHIFT_DROP, серия и рейтинг — с нуля. Первая смена новичка (отработано < FROM_DONE),
   «покататься», быстрый заезд — без ужатия и не считаются. Сохранение — KEY (у каждого профиля своё).

   Из skill.js: init(api), beginShift(), begin() — заказ выдан, rate(good, why, bundle) — вручение / провал, k() — множитель срока.
   Отладка: __dlv.PRESS — state, log, set(lv), step(st, good, w) — шаг без сохранения (прогон simShift), sim(st|null).
   ────────────────────────────────────────────────────────────────────────── */
import { PRESS as C } from './econ.js';

let A = null;
const K = { p0: null, log: [], sim: null };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function get (k, d) { try { return A && A.Store ? A.Store.get(k, d) : d; } catch (e) { return d; } }
function set (k, v) { try { if (A && A.Store) A.Store.set(k, v); } catch (e) { /* без сохранения — не страшно */ } }
function note (s) {
  K.log.push(s);
  if (K.log.length > 60) K.log.splice(0, K.log.length - 60);
}

export function init (api) {
  A = api;
  if (typeof window !== 'undefined' && window.__dlv) window.__dlv.PRESS = DEBUG;
}

function load () {
  let v = get(C.KEY, null);
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
  if (v && typeof v === 'object') return { lv: clamp(Math.round(+v.lv || 0), 0, C.MAX), run: +v.run || 0, debt: +v.debt || 0 };
  return { lv: 0, run: 0, debt: 0 };
}
const save = v => set(C.KEY, { lv: v.lv, run: +v.run.toFixed(2), debt: +v.debt.toFixed(2) });

const quick = () => { try { return !!(A && A.quick && A.quick()); } catch (e) { return false; } };
/* не считается: не карьера, «покататься», быстрый заезд, первая смена новичка */
const off = () => !A || !A.career || !A.S || A.S.ride || A.S.free || quick() || (+get('dlv-shifts', 0) || 0) < C.FROM_DONE;

/** шаг «рейтинга» без сохранения: st = { lv, run, debt, p0 } (p0 — ступень на начале заказа), good — вручение без
    ошибок, w — вес (адрес сборного — BUNDLE_K). Возвращает st (тот же объект) */
export function step (st, good, w = 1) {
  const p0 = Number.isFinite(st.p0) ? st.p0 : st.lv;
  const down = () => { st.lv = clamp(st.lv - 1, Math.max(0, p0 - 1), C.MAX); };
  if (!good) { st.run = 0; st.debt = C.RATE_N; down(); }
  else if (st.debt > 0) { st.debt = Math.max(0, +(st.debt - w).toFixed(2)); down(); }
  else {
    st.run = +(st.run + w).toFixed(2);
    if (st.run >= C.RUN - 1e-6) { st.run = +(st.run - C.RUN).toFixed(2); st.lv = clamp(st.lv + 1, 0, Math.min(C.MAX, p0 + 1)); }
  }
  return st;
}

/** множитель срока сейчас: 1 − STEP × ступень (без ужатия — 1) */
export function k () {
  if (K.sim) return +(1 - C.STEP * K.sim.lv).toFixed(3);
  if (off()) return 1;
  return +(1 - C.STEP * load().lv).toFixed(3);
}

/** новая смена: ступень вниз на SHIFT_DROP, серия и рейтинг — с нуля */
export function beginShift () {
  K.p0 = null;
  if (off()) return;
  const v = load(), was = v.lv;
  v.lv = Math.max(0, v.lv - C.SHIFT_DROP); v.run = 0; v.debt = 0;
  save(v);
  note('смена: ступень ' + was + ' → ' + v.lv);
}
/** заказ выдан: за этот заказ — не больше одной ступени */
export function begin () { K.p0 = off() ? null : load().lv; }
/** вручение (good — вовремя, не холодная, клиента не задел) или провал (срочный сорван, машина всё) */
export function rate (good, why, bundle = false) {
  if (off()) return;
  const v = load(), was = v.lv;
  v.p0 = K.p0 === null ? v.lv : K.p0;
  step(v, !!good, bundle ? C.BUNDLE_K : 1);
  save(v);
  note((good ? 'хорошо' : 'плохо: ' + why) + (bundle ? ' (сборный)' : '') + ' · ступень ' + was + (v.lv !== was ? ' → ' + v.lv : '') +
    ' · серия ' + v.run + (v.debt > 0 ? ' · рейтинг вернётся через ' + v.debt : '') + ' · срок ×' + (1 - C.STEP * v.lv).toFixed(2));
}

export const DEBUG = {
  C,
  get state () { const v = load(); return { ...v, k: k(), off: off(), p0: K.p0 }; },
  get log () { return K.log; },
  set (lv) { const v = load(); v.lv = clamp(Math.round(+lv), 0, C.MAX); save(v); return DEBUG.state; },
  step: (st, good, w) => step(st, good, w),
  /* прогон без езды (orders.js simShift): st — { lv, … } — от него k(); null — снять */
  sim (st) { K.sim = st || null; return K.sim; },
};
