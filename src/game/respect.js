/* Респект — уважение на районе, копится через все смены профиля (docs/CAREER.md «Респект и войны
   брендов»). Числа — econ.js RESPECT: сколько за что (GAIN), шесть званий и что они дают (LEVELS).

     RESPECT.init(api)        — api: { Store, toast(text), adult }; зовёт game.js при запуске
     RESPECT.add(n, why)      — n может быть отрицательным; why — ключ причины (econ.js RESPECT.GAIN):
                                подпись во всплывашке и лимит за смену (RESPECT.CAP). n не задано
                                (null) — берётся RESPECT.GAIN[why]. Возвращает новое значение.
     RESPECT.gain(why)        — то же, что add(null, why): «сколько положено за это»
     RESPECT.get()            — сколько сейчас (не меньше 0)
     RESPECT.level()          — звание: { i, id, name, at, next, tipK, garageOff, turret }
     RESPECT.perk(name)       — что даёт текущее звание: 'tipK' | 'garageOff' | 'turret'
     RESPECT.onChange(fn)     — fn(value, delta, why, level) после каждого add; возвращает «отписаться»
     RESPECT.shift()          — сколько набрано за текущую смену (итоги); shiftReset() — в начале смены
     RESPECT.hud(on)          — каждый кадр: показать чип на хаде (во время смены карьеры)
     RESPECT.DEBUG            — { set(n), reset(), log, get text }

   Хранится в профильном ключе «dlv-respect» (profiles.js сам префиксует; «сбросить прогресс»
   стирает). Хад — чип «★ 42 · Свой пацан» под кошельком, всплывашка «+3 респект · сбил конкурента»
   под ним (respect.css). */
import './respect.css';
import { t, N_ } from '../i18n/index.js';
import { RESPECT as R } from './econ.js';

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

export function init (api) { A = api || {}; val = load(); mount(); paint(); }

/* подписи причин — ключи econ.js RESPECT.GAIN */
const WHY_TEXT = {
  rivalCourier: N_('сбил курьера конкурента'),
  rivalCar: N_('взорвал машину конкурента'),
  rivalShop: N_('разнёс точку конкурента'),
  rivalMascot: N_('сбил маскота конкурента'),
  rivalFighter: N_('сбил бойца конкурента'),
  burger: N_('бургер угнетён'),
  helpCrew: N_('помог избиваемому коллеге'),
  honkCrew: N_('спугнул нападавших сигналом'),
  defend: N_('отбил налёт на точку'),
  thief: N_('наказал похитителя пиццы'),
  ownCourier: N_('сбил своего курьера'),
  ownCrew: N_('сбил своего коллегу'),
  passCrew: N_('проехал мимо — своих били'),
  noDefend: N_('не помог отбиться'),
  marcher: N_('сбил митингующего'),
};
export const whyText = why => (WHY_TEXT[why] ? t(WHY_TEXT[why]) : '');

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
  if (!quiet) pop(n, why);
  paint(d);
  if (lv.i !== before && A.toast) A.toast(lv.i > before ? t('новое звание: {name}', { name: lv.name }) : t('звание упало: {name}', { name: lv.name }));
  for (const fn of subs) { try { fn(val, d, why, lv); } catch (e) { /* подписчик не ломает остальных */ } }
  return val;
}

/* ── хад: чип под кошельком ── */
let EL = null, NUM = null, RANK = null, ON = false, SHOWN = '';
function mount () {
  if (EL || typeof document === 'undefined') return;
  const host = document.getElementById('hud-right');
  if (!host) return;
  EL = document.createElement('div');
  EL.id = 'respect';
  EL.hidden = true;
  EL.innerHTML = '<i class="rs-ico">★</i><b>0</b><span></span>';
  NUM = EL.querySelector('b'); RANK = EL.querySelector('span');
  const money = document.getElementById('money');
  host.insertBefore(EL, money ? money.nextSibling : host.firstChild);
}
function paint (d) {
  if (!EL) return;
  const lv = level(), txt = String(val) + '|' + lv.name;
  if (txt !== SHOWN) { SHOWN = txt; NUM.textContent = String(val); RANK.textContent = lv.name; }
  if (d) { EL.classList.remove('bump', 'hurt'); void EL.offsetWidth; EL.classList.add(d > 0 ? 'bump' : 'hurt'); }
}
export function hud (on) {
  if (!EL) { mount(); if (!EL) return; paint(); }
  on = !!on;
  if (on !== ON) { ON = on; EL.hidden = !on; }
}
/* «+3 респект · сбил конкурента» — под чипом, всплывает и тает (2,2 с); видно и без чипа — у верха экрана */
function pop (n, why) {
  if (typeof document === 'undefined') return;
  const e = document.createElement('div');
  e.className = 'rs-pop' + (n < 0 ? ' neg' : '');
  const w = whyText(why);
  e.textContent = (n > 0 ? t('+{n} респект', { n }) : t('−{n} респект', { n: Math.abs(n) })) + (w ? ' · ' + w : '');
  (EL && !EL.hidden ? EL : document.body).appendChild(e);
  if (!EL || EL.hidden) e.classList.add('free');
  setTimeout(() => e.remove(), 2300);
}

export const DEBUG = {
  set (n) { val = Math.max(0, Math.round(n)); save(); paint(); for (const fn of subs) fn(val, 0, 'debug', level()); return val; },
  reset () { val = 0; inShift = 0; save(); paint(); return 0; },
  reload () { val = load(); paint(); return val; },
  log,
  get text () { return EL && !EL.hidden ? NUM.textContent + ' ' + RANK.textContent : null; },
  get el () { return EL; },
};
