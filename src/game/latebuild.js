/* Поздняя сборка города — меню раньше (docs/AGENTS.md → «Запуск до меню»).

   Раньше весь город строился при загрузке, до первого кадра меню: 5,3 с на обычном компьютере,
   ~14 с на Деке. Теперь сразу строится только то, что видно в меню: земля, дороги, бордюры,
   разметка, мосты, дома, пиццерии. Остальное (жизнь дворов, подъезды, деревья, лавочки, знаки,
   фонари, гаражи, сугробы, точки конкурентов, пустыри…) — очередью после первого кадра меню,
   кусок за куском, в том же порядке, что и раньше: каждый кусок видит всё, что было до него.

   Пока очередь не пуста, мир и камера за меню стоят, город перерисовывается раз в 0,8 с (game.js
   lateFrame). Нажал карточку меню или «сменить профиль» — экран загрузки, остаток разом, потом то же
   нажатие; смена, заезд и смена профиля сами достраивают до начала. Выключить — ?nolate (всё разом,
   как раньше). Что сразу, что потом и замеры — docs/AGENTS.md → «Запуск до меню».

   add(name, fn) — пока поздняя сборка включена и не закончена, кладёт в очередь, иначе
   выполняет сразу. Долгий кусок может вернуть итератор (function* … yield): тогда он идёт шагами —
   между шагами браузер рисует кадр и ловит ввод (подъезды, сугробы: на Деке по 0,6—1,3 с одним куском).
   Шаги — в тех же местах при ?nolate и без: зерно --seed — перед каждым шагом (имя#номер). start() — начать разбор очереди (после первого кадра меню), flush() —
   достроить всё сейчас, flushAsync(cb) — достроить под экраном загрузки тиками с передышкой (память телефона, 0п48),
   busy() — ещё строится, onDone(fn) — когда всё. */
import * as CL from '../platform/crashlog.js';
import { MOB } from './mobile.js';

const Q = [];
let STARTED = false, DONE = true, T0 = 0;
const WAIT = [];
export const T = {};                       // сколько мс шёл каждый кусок — для отладки (__boot.late)
export const MAX = {};                     // самый долгий шаг куска, мс (кусок без шагов — он сам целиком)
export const STEPS = {};                   // мс по шагам у кусков с шагами — найти, какой шаг долгий
const MEMHOOK = typeof window !== 'undefined' && typeof window.__lateMem === 'function';
const BUDGET = 16;                         // мс подряд на мелкие куски, потом — отдать кадр (12 → 16, 23.10.2026: кадров меню за дымкой меньше — город достраивается раньше; больше — длиннее провалы кадров)
/* мобильный режим: пауза между тиками 30 мс — сборщик мусора Safari успевает убрать отходы поздней сборки; пик памяти
   страницы в Safari (симулятор iPhone, iOS 16) 1,2 ГБ → ~1,05, город достраивается на ~5 с дольше. ?lateidle=N — своя пауза */
const IDLE_Q = typeof location !== 'undefined' ? (location.search.match(/[?&]lateidle=(\d+)/) || [])[1] : undefined;
const IDLE = IDLE_Q !== undefined ? +IDLE_Q : MOB.on ? 30 : 0;

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
  if (end) { Q.shift(); T[n] = Math.round(T[n]); if (MEMHOOK) window.__lateMem(n); }   // probe --mem: память по кускам
  if (!Q.length) finish();
  return end ? T[n] : 0;                   // кусок кончился — сколько мс он шёл всего (передышка после тяжёлых, RUSH)
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
  if (MEMHOOK && window.__lateHold) { setTimeout(tick, 50); return; }   // probe --mem ?latesnap: стоим, пока снимается куча
  const t0 = performance.now(), bud = RUSH ? RUSH_BUDGET : BUDGET;
  let rest = 0;
  do {
    const e = one();
    if (RUSH && REST_K > 0 && e > REST_FROM) { rest = Math.min(REST_MAX, e * REST_K); break; }   // тяжёлый кусок кончился — его отходы убрать до следующего
  } while (Q.length && performance.now() - t0 < bud && !(MEMHOOK && window.__lateHold));
  if (!DONE) setTimeout(next, Math.max(IDLE, rest));   // через таймер: сначала кадр (rAF), потом следующий кусок
}

export function start () {
  if (STARTED || DONE) return;
  STARTED = true; T0 = performance.now();
  if (MEMHOOK) window.__lateMem('(меню)');
  if (!Q.length) { finish(); return; }
  next();
}
/* достроить остаток под экраном загрузки — тиками, не разом (0п48, автор 24.10.2026: «переход в загрузку заставляет
   перезагружаться вебвью»). Разом (flush) — один длинный кусок без передышки: отходы поздней сборки не успевают убраться,
   след страницы на телефоне боком 930 → 1300 МБ, а следом ещё начало смены — и iOS выгружает вкладку. Тиками по RUSH_BUDGET мс
   с той же паузой IDLE (мобильный режим — 30 мс: сборщик мусора успевает) и передышкой после тяжёлых кусков, в конце — ещё SETTLE мс тишины, потом cb
   (game.js: повторить нажатие карточки меню). На компьютере пауз нет — то же время, что разом */
let RUSH = false;
const RUSH_Q = typeof location !== 'undefined' ? (location.search.match(/[?&]rushms=(\d+)/) || [])[1] : undefined;
/* кусок подряд под экраном загрузки: мобильный режим — как за меню (16 мс): пик следа на телефоне боком 1 330 → 1 290 МБ
   (по 2 прогона), экран загрузки на ~4 с дольше (11 → 15 с с запуска); компьютер — 48 (пауз там нет, мельче — только дольше).
   ?rushms=N — свой */
const RUSH_BUDGET = RUSH_Q !== undefined ? +RUSH_Q : MOB.on ? BUDGET : 48;
const SETTLE = MOB.on ? 250 : 0;
/* мобильный режим: после тяжёлого куска (шёл дольше REST_FROM мс) — передышка REST_K × его время, не дольше REST_MAX мс:
   сборщик мусора убирает его отходы до следующего (дворы, лабиринт, сугробы — по 100—500 мс на куске). ?rushrest=K,MAX — свои */
const REST_Q = typeof location !== 'undefined' ? (location.search.match(/[?&]rushrest=([\d.]+),(\d+)/) || []) : [];
const REST_K = REST_Q[1] !== undefined ? +REST_Q[1] : MOB.on ? 0.5 : 0, REST_MAX = REST_Q[2] !== undefined ? +REST_Q[2] : 200, REST_FROM = 40;
export function flushAsync (cb) {
  if (DONE) { cb(); return; }
  RUSH = true;
  CL.trans('достройка города');
  onDone(() => { RUSH = false; CL.transEnd('достройка города'); if (SETTLE) setTimeout(cb, SETTLE); else cb(); });
  if (!STARTED) start();
}
export function flush () {
  if (DONE) return;
  CL.trans('достройка города разом');
  if (!STARTED) { STARTED = true; T0 = performance.now(); if (MEMHOOK) window.__lateMem('(меню)'); }
  const t0 = performance.now();
  while (Q.length) one();
  finish();
  T.flush = Math.round(performance.now() - t0);
  CL.transEnd('достройка города разом');
}
