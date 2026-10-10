/* ──────────────────────────────────────────────────────────────────────────
   Путь на дороге: первая смена и вопрос «оставить?» (10.10.2026, docs/CAREER.md
   «Путь на дороге»). Сама полоса (оранжевая к клиенту, зелёная в пиццерию) —
   game.js updateRouteLine; здесь — только «горит или нет» и окно вопроса.

   Правило:
     • всю первую смену карьеры (законченных смен — 0, ключ dlv-shifts) путь горит всегда,
       что бы ни стояло в настройке;
     • дальше — по настройке «путь на дороге: вкл / выкл» (настройки → игра), ключ dlv-route
       ('1' / '0'); нет ключа (старые сохранения, кого не спрашивали) — как было до 10.10:
       только первые TUT заказов за всё время;
     • после первой смены, когда чек смены допечатался и поверх ничего нет, — окно «Оставить
       путь на дороге?» [оставить] / [убрать]; выбор пишется в ту же настройку. Спрашиваем один
       раз на профиль: dlv-route-ask '1' — первая смена с путём была, ещё не спросили (ушёл с чека
       раньше — спросим на следующем чеке), '2' — спросили. «Сбросить прогресс» стирает флаг.
   Управление окном: мышь / палец — по кнопке; геймпад и клавиатура — ◀ ▶ (↑ ↓, WASD) между
   кнопками, A / Enter / пробел — нажать выбранную, B / Esc — «убрать». Значков клавиш на
   кнопках нет — одна строка подсказки внизу (на телефоне её нет).

     init(api)   — game.js: { Store, Snd, CAREER, TUT, shifts() → законченных смен, endReady() → чек
                   допечатан и поверх него ничего }
     wanted(xp)  — горит ли путь сейчас (xp — доставлено за всё время, dlv-msk-xp)
     pref() / setPref(on) — настройка (null — не задана)
     shiftEnd()  — CAREERM.onShiftEnd: после первой смены — поставить вопрос в очередь
     root() / pad(p) — окно открыто (для геймпада game.js padStep — до всего остального)
     DEBUG       — __dlv.RASK: { open(), pick(i), state }
   ────────────────────────────────────────────────────────────────────────── */
import './routeask.css';
import { t } from '../i18n/index.js';
import { keyHTML } from '../input/glyphs.js';
import * as PFX from './paperfx.js';

const KEY = 'dlv-route', ASK = 'dlv-route-ask';
let A = null;
const M = { el: null, i: 0, timer: 0, armAt: 0, picked: null, asks: 0 };

export function init (api) {
  A = api;
  addEventListener('keydown', onKey, true);        // окно поверх чека: клавиши — его, до career.js и game.js
  if (askState() === '1') watch();                 // вышли из игры с чека, не ответив, — спросим на следующем чеке
}

const askState = () => (A && A.Store ? String(A.Store.get(ASK, '') || '') : '');
export function pref () {
  if (!A || !A.Store) return null;
  const v = A.Store.get(KEY, null);
  return v == null || v === '' ? null : String(v) === '1';
}
export function setPref (on) {
  if (!A || !A.Store) return;
  A.Store.set(KEY, on ? '1' : '0');
  if (A.Store.flush) A.Store.flush();
}
export const firstShift = () => !!(A && A.CAREER && A.shifts() === 0);
/** горит ли путь: первая смена — всегда; дальше — настройка; не задана — первые TUT заказов */
export function wanted (xp) {
  if (!A) return false;
  if (firstShift()) return true;
  const p = pref();
  return p !== null ? p : (xp || 0) < (A.TUT || 3);
}

/** конец смены (CAREERM.onShiftEnd; dlv-shifts уже +1): кончилась первая — спросить */
export function shiftEnd () {
  if (!A || !A.CAREER) return;
  if (A.shifts() === 1 && !askState()) { A.Store.set(ASK, '1'); if (A.Store.flush) A.Store.flush(); }
  if (askState() === '1') watch();
}

/* ждём, пока чек допечатается и поверх ничего (гаража, трат, «депнуть»): тогда — окно */
function watch () {
  if (M.timer) return;
  M.timer = setInterval(() => {
    if (askState() !== '1') { clearInterval(M.timer); M.timer = 0; return; }
    if (M.el || !A.endReady()) return;
    clearInterval(M.timer); M.timer = 0;
    open();
  }, 120);
}

const ROAD = '<svg class="ra-pic" viewBox="0 0 240 64" aria-hidden="true">' +
  '<rect x="0" y="6" width="240" height="52" rx="4" fill="#5b5f66" stroke="#33210c" stroke-width="3"/>' +
  '<path d="M8 32h224" stroke="#e9e3cf" stroke-width="2" stroke-dasharray="12 10"/>' +
  '<rect x="0" y="22" width="240" height="20" fill="#ff8a2b" opacity=".9"/>' +
  Array.from({ length: 9 }, (_, i) => '<path d="M' + (14 + i * 26) + ' 25l9 7-9 7" fill="none" stroke="#fff3d6" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>').join('') +
  '</svg>';

function open () {
  if (M.el || !A) return;
  M.asks++;
  M.picked = null;
  const host = document.getElementById('game') || document.body;
  const el = document.createElement('div');
  el.className = 'pp-desk ra-desk';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = '<section class="pp-sheet pp-in ra-sheet">' +
    '<header class="pp-head"><span>' + t('навигатор') + '</span><b>' + t('первая смена позади') + '</b></header>' +
    '<h2 class="ra-q">' + t('Оставить путь на дороге?') + '</h2>' + ROAD +
    '<p class="pp-hint ra-why">' + t('всю первую смену к клиенту вела оранжевая полоса, назад в пиццерию — зелёная') + '</p>' +
    '<div class="ra-btns"><button type="button" class="pp-stamp ra-yes" data-i="0">' + t('оставить') + '</button>' +
    '<button type="button" class="pp-stamp ra-no" data-i="1">' + t('убрать') + '</button></div>' +
    '<p class="pp-hint ra-set">' + t('если что — поменять можно в настройках: игра → путь на дороге') + '</p>' +
    '<p class="ra-keys">◀ ▶ ' + t('выбрать') + ' · ' + keyHTML('ok') + t('нажать') + ' · ' + keyHTML('back') + t('убрать') + '</p>' +
    '</section>';
  host.appendChild(el);
  M.el = el;
  el.querySelectorAll('.ra-btns button').forEach(b => {
    b.addEventListener('click', () => pick(+b.dataset.i));
    b.addEventListener('pointerenter', () => focus(+b.dataset.i));
  });
  // первые 0,4 с кнопки не жмутся: кто долбил A, допечатывая чек, не ответит не глядя
  M.armAt = performance.now() + 400;
  focus(0);
  if (A.Snd && A.Snd.click) try { A.Snd.click(620); } catch (e) { /* — */ }
}

function focus (i) {
  if (!M.el) return;
  M.i = i ? 1 : 0;
  M.el.querySelectorAll('.ra-btns button').forEach((b, k) => {
    b.classList.toggle('pp-focus', k === M.i);
    if (k === M.i) try { b.focus({ preventScroll: true }); } catch (e) { /* — */ }
  });
}

/** 0 — оставить, 1 — убрать */
function pick (i) {
  if (!M.el || M.picked != null || performance.now() < M.armAt) return;
  const keep = i === 0;
  M.picked = i;
  setPref(keep);
  A.Store.set(ASK, '2');
  if (A.Store.flush) A.Store.flush();
  const b = M.el.querySelector(keep ? '.ra-yes' : '.ra-no');
  PFX.press(b);
  if (A.Snd && A.Snd.click) try { A.Snd.click(keep ? 760 : 420); } catch (e) { /* — */ }
  // печать на листе — что выбрал, и окно уходит; чек под ним — как был
  const seal = document.createElement('div');
  seal.className = 'pp-seal ' + (keep ? 'pp-seal-green' : 'pp-seal-rust') + ' ra-seal';
  seal.textContent = keep ? t('оставили') : t('убрали');
  M.el.querySelector('.ra-sheet').appendChild(seal);
  M.el.querySelectorAll('.ra-btns button').forEach(x => { x.disabled = true; });
  const el = M.el;
  setTimeout(() => { el.classList.add('ra-out'); }, 650);
  setTimeout(() => { el.remove(); if (M.el === el) M.el = null; refocusEnd(); }, 900);
}

/* окно ушло — курсор снова на штампе чека «на новую смену» */
function refocusEnd () {
  const b = document.getElementById('ov-again');
  if (b && b.offsetParent) try { b.focus({ preventScroll: true }); } catch (e) { /* — */ }
}

export const root = () => M.el;
/** геймпад (game.js padStep): ◀ ▶ ↑ ↓ — между кнопками, A — нажать, B — «убрать» */
export function pad (p) {
  if (!M.el) return;
  if (p.menuLeft || p.menuUp) focus(0);
  else if (p.menuRight || p.menuDown) focus(1);
  else if (p.menuOk || p.accept) { PFX.press(M.el.querySelectorAll('.ra-btns button')[M.i]); pick(M.i); }
  else if (p.menuBack) pick(1);
}

function onKey (e) {
  if (!M.el || e.ctrlKey || e.metaKey || e.altKey) return;
  const c = e.code;
  let used = true;
  if (c === 'ArrowLeft' || c === 'ArrowUp' || c === 'KeyA' || c === 'KeyW') focus(0);
  else if (c === 'ArrowRight' || c === 'ArrowDown' || c === 'KeyD' || c === 'KeyS' || c === 'Tab') focus(M.i ? 0 : 1);
  else if (c === 'Enter' || c === 'NumpadEnter' || c === 'Space') { if (!e.repeat) pick(M.i); }
  else if (c === 'Escape' || c === 'Backspace') { if (!e.repeat) pick(1); }
  else used = false;
  // окно поверх чека: ничего не уходит под него (Enter не жмёт «на новую смену», Esc — «в меню»)
  if (used || c !== 'KeyM') { e.preventDefault(); e.stopImmediatePropagation(); }
}

export const DEBUG = {
  open, pick, focus, watch,
  get state () { return { open: !!M.el, i: M.i, pref: pref(), ask: askState(), first: firstShift(), asks: M.asks, watching: !!M.timer }; },
};
