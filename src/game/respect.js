/* Внутренний респект: накопление, сохранение, лимиты и преимущества сохраняются; интерфейса нет (Понятнее №13). */
import { t, N_ } from '../i18n/index.js';
import { RESPECT as R } from './econ.js';
import * as TEL from './telemetry.js';          // анонимная статистика: новое звание (telemetry.js)

const KEY = 'dlv-respect';
let A = {};
let val = 0;
let inShift = 0;
const capUsed = {};                                // why → сколько уже дали за эту смену (RESPECT.CAP)
const subs = new Set();
const log = [];

function load () {
  try { const v = Number(A.Store ? A.Store.get(KEY, 0) : 0); return Number.isFinite(v) && v > 0 ? Math.round(v) : 0; } catch (e) { return 0; }
}
function save () { try { if (A.Store) A.Store.set(KEY, val); } catch (e) { /* без сохранения — не страшно */ } }

export function init (api) { A = api || {}; val = load(); }

/* звания — по порядку econ.js RESPECT.LEVELS */
const RANKS = [N_('Тень с коробкой'), N_('Свой пацан'), N_('Гроза перекрёстков'), N_('Пицца-авторитет'),
  N_('Крёстный отец пепперони'), N_('Легенда Солнечного')];

export function get () { return val; }
export function shift () { return inShift; }
export function shiftReset () { inShift = 0; for (const k in capUsed) delete capUsed[k]; }

export function level (v = val) {
  const L = R.LEVELS;
  let i = 0;
  for (let k = 0; k < L.length; k++) if (v >= L[k].at) i = k;
  const nx = L[i + 1];
  return { ...L[i], i, name: t(RANKS[i] || RANKS[RANKS.length - 1]), next: nx ? nx.at : null };
}
export function perk (name) { const p = R.LEVELS[level().i]; return p ? p[name] : undefined; }

export function onChange (fn) { subs.add(fn); return () => subs.delete(fn); }

export function gain (why) { return add(null, why); }

export function add (n, why, quiet) {
  if (n === null || n === undefined) n = R.GAIN[why] || 0;
  n = Math.round(Number(n) || 0);
  // лимит за смену (бургеры-пешеходы: их много, иначе респект набивается кругами по площади)
  const cap = R.CAP && R.CAP[why];
  if (n > 0 && cap) { const used = capUsed[why] || 0; n = Math.min(n, cap - used); capUsed[why] = used + Math.max(0, n); }
  if (!n) return val;
  const before = level().i;
  const nv = Math.max(0, val + n);
  const d = nv - val;
  val = nv; inShift += d;
  save();
  log.push({ n, why: why || '', v: val });
  if (log.length > 40) log.shift();
  const lv = level();
  if (lv.i !== before) TEL.ev('rank', { i: lv.i, up: lv.i > before ? 1 : 0, why: why || '' });
  for (const fn of subs) { try { fn(val, d, why, lv); } catch (e) { /* подписчик не ломает остальных */ } }
  return val;
}

/* Совместимость отладки: визуального респекта больше нет. */
export const DEBUG = {
  set (n) { val = Math.max(0, Math.round(n)); save(); for (const fn of subs) fn(val, 0, 'debug', level()); return val; },
  reset () { val = 0; inShift = 0; save(); return 0; },
  reload () { val = load(); return val; },
  log, get text () { return null; }, get flying () { return 0; }, get pend () { return 0; }, get el () { return null; },
};
