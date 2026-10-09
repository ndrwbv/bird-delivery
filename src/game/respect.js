/* Респект — уважение на районе, копится через все смены профиля (docs/CAREER.md «Респект и войны
   брендов»). Числа — econ.js RESPECT: сколько за что (GAIN), шесть званий и что они дают (LEVELS).

     RESPECT.init(api)        — api: { Store, toast(text), adult, from() → [x, y] — откуда летят значки }; зовёт game.js
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
   стирает). Хад — чип «★ 42» третьей плашкой под копилкой и пачкой «за смену» (#cash): респект
   вылетает значками с места (машина на экране — api.from) и летит в чип, как деньги в пачку;
   «+3 респект · сбил конкурента» справа от чипа (respect.css). Звание — в паузе. */
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
  chat: N_('поболтал с клиентом'),
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
  if (!quiet && d) pop(d, why);
  else paint(d);
  if (lv.i !== before && A.toast) A.toast(lv.i > before ? t('новое звание: {name}', { name: lv.name }) : t('звание упало: {name}', { name: lv.name }));
  for (const fn of subs) { try { fn(val, d, why, lv); } catch (e) { /* подписчик не ломает остальных */ } }
  return val;
}

/* ── хад: чип респекта — третья плашка в #cash (под копилкой и пачкой «за смену», как они: значок и число,
   в покое полупрозрачная, пришло — непрозрачная и крупнее, shiftcash.js heat). Видно во время смены
   карьеры (hud(on) — из game.js walletHud). Пришёл респект — 1—4 значка вылетают с места (машина на экране,
   api.from()) и по дуге летят в чип, число докручивается по прилёту, «+3 · за что» справа от плашки.
   Ушёл — красный значок выпадает из чипа вниз, «−5 · за что». quiet (бургер +1) — без полёта и подписи. ── */
const STAR = (a, b) => '<svg viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true">' +
  '<polygon points="12,1 15,8.5 23,9 17,14.5 19,23 12,18.5 5,23 7,14.5 1,9 9,8.5" fill="' + a + '" stroke="#33210c" stroke-width="2" stroke-linejoin="round"/>' +
  '<polygon points="12,5 13.8,10 18,10.3 14.6,13.4 12,12" fill="' + b + '"/></svg>';
const ICON = STAR('#ff9a3c', '#ffd85e'), ICON_NEG = STAR('#c53a3a', '#ff9a9a');
const FLY = { T: 0.75, SPREAD: 0.3, DROP: 0.9 };
let EL = null, NUM = null, ICO = null, ON = false, SHOWN = '', PEND = 0;
const FLYING = new Set();
function mount () {
  if (EL || typeof document === 'undefined') return;
  const host = document.getElementById('cash');
  if (!host) return;
  EL = document.createElement('div');
  EL.id = 'respect';
  EL.className = 'mb';
  EL.hidden = true;
  EL.innerHTML = '<i class="rs-ico">' + ICON + '</i><b>0</b>';
  NUM = EL.querySelector('b'); ICO = EL.querySelector('.rs-ico');
  host.appendChild(EL);
}
function paint (d) {
  if (!EL) return;
  const txt = String(Math.max(0, val - PEND));
  if (txt !== SHOWN) { SHOWN = txt; NUM.textContent = txt; }
  if (d) { EL.classList.remove('bump', 'hurt'); void EL.offsetWidth; EL.classList.add(d > 0 ? 'bump' : 'hurt'); }
}
export function hud (on) {
  if (!EL) { mount(); if (!EL) return; paint(); }
  on = !!on;
  if (on !== ON) { ON = on; EL.hidden = !on; if (!on) clearFly(); }
}
function heat (ms) {
  EL.classList.add('hot');
  clearTimeout(EL._hotT);
  EL._hotT = setTimeout(() => EL.classList.remove('hot'), ms);
}
function clearFly () { for (const e of FLYING) e.remove(); FLYING.clear(); PEND = 0; paint(); }
function flyer (html, x, y) {
  const e = document.createElement('i');
  e.className = 'rs-fly'; e.innerHTML = html;
  e.style.left = x + 'px'; e.style.top = y + 'px';
  document.body.appendChild(e); FLYING.add(e);
  return e;
}
/* откуда: машина на экране (api.from() → [x, y]), иначе — низ экрана по центру */
function source () {
  try { const p = A.from && A.from(); if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) return p; } catch (e) { /* — */ }
  return [innerWidth / 2, innerHeight * 0.7];
}
/* пришёл / ушёл респект: полёт в чип или выпадение из него; без чипа на экране — подпись сверху справа */
function pop (n, why) {
  if (typeof document === 'undefined') return;
  const r = EL && !EL.hidden && ICO.getBoundingClientRect();
  if (!r || !(r.width > 0)) { label(n, why, true); return; }
  if (n < 0) { drop(r); label(n, why); paint(n); return; }
  const k = Math.max(1, Math.min(4, Math.round(Math.abs(n) / 2)));
  const [sx, sy] = source(), tx = r.left + r.width / 2, ty = r.top + r.height / 2, dx = tx - sx, dy = ty - sy;
  heat((FLY.SPREAD + FLY.T) * 1000 + 900);
  PEND += n; paint();
  let left = n, first = true;
  for (let i = 0; i < k; i++) {
    const share = i === k - 1 ? left : Math.round(n / k); left -= share;
    const e = flyer(ICON, sx, sy);
    const cx = dx * 0.1 + (Math.random() - 0.5) * 140, cy = dy - 50 - Math.random() * 60;
    const r0 = (Math.random() - 0.5) * 40, r1 = r0 + (Math.random() < 0.5 ? -1 : 1) * (160 + Math.random() * 140);
    const fr = [];
    for (let j = 0; j <= 8; j++) {
      const q = j / 8, a = 2 * (1 - q) * q, b = q * q;
      fr.push({ transform: `translate(${(a * cx + b * dx).toFixed(1)}px,${(a * cy + b * dy).toFixed(1)}px) rotate(${(r0 + (r1 - r0) * q).toFixed(0)}deg) scale(${(1.6 - 0.8 * q).toFixed(2)})`,
                opacity: q > 0.95 ? 0 : 1 });
    }
    const delay = (k > 1 ? i * FLY.SPREAD / (k - 1) : 0) * 1000;
    let done = false;
    const land = () => {
      if (done) return; done = true;
      e.remove(); FLYING.delete(e);
      PEND = Math.max(0, PEND - share);
      paint(first ? n : 0);
      if (ICO.animate) ICO.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 240, easing: 'ease-out' });
      if (first) { first = false; label(n, why); }
    };
    if (e.animate) { const an = e.animate(fr, { duration: FLY.T * 1000, delay, easing: 'cubic-bezier(.45,0,.75,1)', fill: 'both' }); an.onfinish = land; }
    setTimeout(land, delay + FLY.T * 1000 + 400);   // анимации не идут (вкладка спрятана) — всё равно долетел
  }
}
/* ушёл: красный значок выпадает из чипа вниз */
function drop (r) {
  heat(FLY.DROP * 1000 + 900);
  const e = flyer(ICON_NEG, r.left + r.width / 2, r.top + r.height / 2);
  const rot = (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 50);
  const end = () => { e.remove(); FLYING.delete(e); };
  if (e.animate) {
    const an = e.animate([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${rot * 0.3}px,30px) rotate(${rot * 0.5}deg)`, opacity: 1, offset: 0.4 },
      { transform: `translate(${rot * 0.5}px,80px) rotate(${rot}deg)`, opacity: 0 },
    ], { duration: FLY.DROP * 1000, easing: 'ease-in', fill: 'both' });
    an.onfinish = end;
  }
  setTimeout(end, FLY.DROP * 1000 + 400);
}
/* «+3 · сбил курьера конкурента» — справа от чипа, всплывает и тает; free — без чипа, сверху справа */
function label (n, why, free) {
  const e = document.createElement('div');
  e.className = 'rs-pop' + (n < 0 ? ' neg' : '') + (free ? ' free' : '');
  const w = whyText(why);
  e.textContent = (n > 0 ? t('+{n} респект', { n }) : t('−{n} респект', { n: Math.abs(n) })) + (w ? ' · ' + w : '');
  if (!free) e.style.marginTop = (-5 + 12 * EL.querySelectorAll('.rs-pop').length) + 'px';   // две подряд — одна под другой
  (free ? document.body : EL).appendChild(e);
  setTimeout(() => e.remove(), 2300);
}

export const DEBUG = {
  set (n) { val = Math.max(0, Math.round(n)); save(); paint(); for (const fn of subs) fn(val, 0, 'debug', level()); return val; },
  reset () { val = 0; inShift = 0; save(); paint(); return 0; },
  reload () { val = load(); paint(); return val; },
  log,
  get text () { return EL && !EL.hidden ? NUM.textContent : null; },
  get flying () { return FLYING.size; }, get pend () { return PEND; },
  get el () { return EL; },
};
