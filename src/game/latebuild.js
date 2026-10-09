/* Поздняя сборка города — меню раньше (docs/AGENTS.md → «Запуск до меню»).

   Раньше весь город строился при загрузке, до первого кадра меню: 5,3 с на обычном компьютере,
   ~14 с на Деке. Теперь сразу строится только то, что видно в меню: земля, дороги, бордюры,
   разметка, мосты, дома, пиццерии. Остальное (жизнь дворов, подъезды, деревья, лавочки, знаки,
   фонари, гаражи, сугробы, точки конкурентов, пустыри…) — очередью после первого кадра меню,
   кусок за куском, в том же порядке, что и раньше: каждый кусок видит всё, что было до него.

   Пока очередь не пуста, мир и камера за меню стоят, город перерисовывается раз в 0,2 с (game.js
   lateFrame). Нажал карточку меню или «сменить профиль» — экран загрузки, остаток разом, потом то же
   нажатие; смена, заезд и смена профиля сами достраивают до начала. Выключить — ?nolate (всё разом,
   как раньше). Что сразу, что потом и замеры — docs/AGENTS.md → «Запуск до меню».

   add(name, fn) — пока поздняя сборка включена и не закончена, кладёт в очередь, иначе
   выполняет сразу. Долгий кусок может вернуть итератор (function* … yield): тогда он идёт шагами —
   между шагами браузер рисует кадр и ловит ввод (подъезды, сугробы: на Деке по 0,6—1,3 с одним куском).
   Шаги — в тех же местах при ?nolate и без: зерно --seed — перед каждым шагом (имя#номер). start() — начать разбор очереди (после первого кадра меню), flush() —
   достроить всё сейчас, busy() — ещё строится, onDone(fn) — когда всё. */
import * as CL from '../platform/crashlog.js';

const Q = [];
let STARTED = false, DONE = true, T0 = 0;
const WAIT = [];
export const T = {};                       // сколько мс шёл каждый кусок — для отладки (__boot.late)
export const MAX = {};                     // самый долгий шаг куска, мс (кусок без шагов — он сам целиком)
export const STEPS = {};                   // мс по шагам у кусков с шагами — найти, какой шаг долгий
const BUDGET = 12;                         // мс подряд на мелкие куски, потом — отдать кадр

export function enable (on) { DONE = !on; }
export const busy = () => !DONE;
export const left = () => Q.length;

// probe --seed: перед каждым куском — своё зерно Math.random, чтобы сравнить город с ?nolate и без один в один
const seed = n => { if (typeof window !== 'undefined' && window.__lateSeed) window.__lateSeed(n); };
const isIt = r => !!r && typeof r.next === 'function';
export function add (name, fn) {
  if (DONE) {
    seed(name);
    const it = fn();
    if (isIt(it)) for (let k = 0; !it.next().done;) seed(name + '#' + ++k);   // по шагам — с тем же зерном, что и в очереди
    return;
  }
  Q.push([name, fn, null, 0]);
}
export function onDone (fn) { if (DONE) fn(); else WAIT.push(fn); }

// один шаг: кусок целиком или следующий шаг итератора (первый шаг — вызов fn и его первый next)
function one () {
  const q = Q[0], n = q[0];
  seed(q[3] ? n + '#' + q[3] : n);
  const t0 = performance.now();
  let end = true, lab;
  try {
    if (!q[2]) { const r = q[1](); if (isIt(r)) q[2] = r; }
    if (q[2]) { const r = q[2].next(); end = r.done; lab = r.value; q[3]++; }
  } catch (e) { end = true; console.error('[latebuild]', n, e); try { CL.report('late:' + n, e, 'error'); } catch (e2) { /* — */ } }
  const ms = performance.now() - t0;
  T[n] = (T[n] || 0) + ms;
  if (!(MAX[n] >= ms)) MAX[n] = Math.round(ms);
  if (q[2]) (STEPS[n] || (STEPS[n] = [])).push(lab ? lab + ':' + Math.round(ms) : Math.round(ms));   // yield 'имя' — подпись шага
  if (end) { Q.shift(); T[n] = Math.round(T[n]); }
  if (!Q.length) finish();
}
function finish () {
  if (DONE) return;
  DONE = true;
  T.total = Math.round(performance.now() - T0);
  for (const f of WAIT.splice(0)) { try { f(); } catch (e) { console.error('[latebuild] onDone', e); } }
}
// MessageChannel — без задержки 4 мс у вложенных setTimeout; между задачами браузер рисует кадр и ловит ввод
const MC = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
const next = () => { if (MC) MC.port2.postMessage(0); else setTimeout(tick, 0); };
if (MC) MC.port1.onmessage = () => tick();
function tick () {
  if (DONE) return;
  const t0 = performance.now();
  do one(); while (Q.length && performance.now() - t0 < BUDGET);
  if (!DONE) setTimeout(next, 0);          // через таймер: сначала кадр (rAF), потом следующий кусок
}

export function start () {
  if (STARTED || DONE) return;
  STARTED = true; T0 = performance.now();
  if (!Q.length) { finish(); return; }
  next();
}
export function flush () {
  if (DONE) return;
  if (!STARTED) { STARTED = true; T0 = performance.now(); }
  const t0 = performance.now();
  while (Q.length) one();
  finish();
  T.flush = Math.round(performance.now() - t0);
}
