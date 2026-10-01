/* Районы карьеры (зоны доставки) и волны щедрости. Числа — econ.js (DISTRICT, PACE),
   правила — docs/CAREER.md («Районы» и «Волны щедрости»).

   Город поделён на районы (MAP.career.districts: list — по порядку открытия, у
   каждого name и pizza — точка дома с пиццерией; at(x, z) → номер района).
   Смена идёт в одном районе: пиццерия, заказы, кофе и аптечки — его.

     DIST.init({ MAP, Store })   — один раз из game.js
     DIST.list() → [{ id, name, pizza }], DIST.at(x, z) → номер района, DIST.count()
     DIST.cur() / DIST.set(i)    — район, где работаешь (только открытый); сохраняется
     DIST.opened()               — сколько районов открыто (1…8)
     DIST.shiftsIn(i)            — сколько смен засчитано району
     DIST.need(i)                — сколько смен надо в районе i, чтобы открылся следующий (0 — последний)
     DIST.countShift(delivered)  — конец смены: засчитать нынешнему району → { counted, opened: номер нового или -1 }
     DIST.speed() / pay() / dist() — надбавки и дальность заказов нынешнего района
     DIST.onChange(cb)           — сменили район (game.js переставляет пиццерию)

   Волны — по сменам этой сессии (с запуска игры): DIST.beginShift() в начале смены
   ставит режим по кругу PACE.WAVE, DIST.pace() → { id, …PACE.MODES[id] }. */
import { DISTRICT, PACE } from './econ.js';

let A = null;
const KEY = 'dlv-district', KEY_N = 'dlv-dist-shifts', KEY_O = 'dlv-dist-open';
const cbs = [];

export function init (api) { A = api; }
const D = () => (A && A.MAP.career && A.MAP.career.districts) || null;
export const has = () => !!(D() && D().list && D().list.length);
export const list = () => (has() ? D().list : []);
export const count = () => list().length;
export function at (x, z) {
  if (!has()) return 0;
  const i = D().at(x, z);
  return Number.isFinite(i) ? Math.max(0, Math.min(count() - 1, i | 0)) : 0;
}

function counts () {
  const v = A ? A.Store.get(KEY_N, []) : [];
  const a = Array.isArray(v) ? v.map(n => Math.max(0, +n || 0)) : [];
  while (a.length < count()) a.push(0);
  return a;
}
export const shiftsIn = i => counts()[i] || 0;
export const need = i => (i < count() - 1 ? DISTRICT.OPEN[Math.min(i, DISTRICT.OPEN.length - 1)] || 0 : 0);
/* открыт первый и каждый следующий, если в предыдущем отъезжено need(i) смен.
   Сколько уже открыто — запоминаем (KEY_O): когда числа OPEN растут, открытое не закрывается.
   Старое сохранение (KEY_O ещё нет) — считаем по старым числам OPEN_OLD; в KEY_O это
   записывается в конце первой же смены (countShift), не раньше: облако Яндекса может
   догрузиться позже, чем игра впервые спросит opened(). */
const OLD = DISTRICT.OPEN_OLD || DISTRICT.OPEN;
const needOld = i => (i < count() - 1 ? OLD[Math.min(i, OLD.length - 1)] || 0 : 0);
function base () {
  const v = A ? A.Store.get(KEY_O, null) : null;
  if (v != null) return Math.max(1, Math.min(count(), +v || 1));
  const c = counts();
  let n = 1;
  while (n < count() && c[n - 1] >= needOld(n - 1)) n++;
  return n;
}
export function opened () {
  if (!has()) return 1;
  const c = counts();
  let n = base();
  while (n < count() && c[n - 1] >= need(n - 1)) n++;
  return n;
}
export const isOpen = i => i >= 0 && i < opened();

export function cur () {
  if (!has()) return 0;
  const i = A ? +A.Store.get(KEY, 0) || 0 : 0;
  return Math.max(0, Math.min(opened() - 1, i | 0));
}
export function set (i) {
  if (!has() || !isOpen(i)) return false;
  const was = cur();
  A.Store.set(KEY, i);
  A.Store.flush && A.Store.flush();
  if (was !== i) for (const cb of cbs) { try { cb(i, was); } catch (e) { console.error('[districts]', e); } }
  return true;
}
export function onChange (cb) { if (typeof cb === 'function') cbs.push(cb); }

/* конец смены: засчитать району; открылся новый — сразу туда (вернуться можно из меню) */
export function countShift (delivered) {
  if (!has()) return { counted: false, opened: -1 };
  if ((delivered || 0) < DISTRICT.COUNT_MIN) return { counted: false, opened: -1 };
  const i = cur(), before = opened(), c = counts();
  c[i] = (c[i] || 0) + 1;
  A.Store.set(KEY_N, c);
  const after = opened();
  A.Store.set(KEY_O, after);
  let fresh = -1;
  if (after > before) { fresh = after - 1; set(fresh); }
  A.Store.flush && A.Store.flush();
  return { counted: true, opened: fresh };
}

const pick = (arr, i) => arr[Math.max(0, Math.min(arr.length - 1, i))];
export const speed = (i = cur()) => pick(DISTRICT.SPEED, i);
export const pay = (i = cur()) => pick(DISTRICT.PAY, i);
export const dist = (i = cur()) => pick(DISTRICT.DIST, i);

/* ── волны щедрости ── */
let SESSION = 0, MODE = 'generous';
export function beginShift () {
  SESSION++;
  MODE = PACE.WAVE[(SESSION - 1) % PACE.WAVE.length];
  return MODE;
}
export const session = () => SESSION;
export const pace = () => ({ id: MODE, ...PACE.MODES[MODE] });
/** отладка, песочница: setPace('tight') */
export function setPace (id) { if (PACE.MODES[id]) MODE = id; }

/* отладка: __dlv.DIST */
export const DEBUG = {
  list, at, cur, set, opened, shiftsIn, need, countShift, speed, pay, dist, pace, setPace, beginShift, session,
  unlockAll () { if (!A) return; A.Store.set(KEY_N, list().map((_, i) => need(i))); A.Store.set(KEY_O, count()); A.Store.flush && A.Store.flush(); },
  reset () { if (!A) return; A.Store.set(KEY_N, []); A.Store.set(KEY_O, 1); A.Store.set(KEY, 0); A.Store.flush && A.Store.flush(); },
};
