/* Журнал ошибок и зависаний (docs/CRASHES.md).

   • ловит window error / unhandledrejection и ошибки из цикла кадра (game.js frame → report);
   • кольцо из последних MAX записей, одинаковые (вид + где + текст + начало стека) — одна запись
     со счётчиком n; к каждой новой — снимок состояния игры (snapshot из game.js), версия сборки,
     fps, выключенные «предохранителем» шаги и последние 20 событий игры;
   • предохранитель: step(name, fn, …) — шаг мира под try/catch; 3 исключения подряд — шаг
     выключается до конца сессии, игра идёт без него, внизу плашка «что-то споткнулось»;
   • сторож: смена идёт, не пауза, не карта/диалог/катсцена, кадры зовутся, а мир 3 с не
     продвигается (want без done) — запись «freeze»;
   • хранение: localStorage (последние записи, коротко) и в Электроне — файл
     userData/logs/crash-ГГГГ-ММ-ДД.log (JSON-строки) через window.birdSteam.log.

   На счастливом пути (ошибок нет) — ни одной аллокации за кадр. */
import { t as $t } from '../i18n/index.js';

const MAX = 50;                 // записей в памяти
const KEEP = 30;                // … в localStorage
const STACK = 1500;             // символов стека в записи
const KEY = 'dlv-crashlog';
const FREEZE_MS = 3000;
const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : '';
const bridge = typeof window !== 'undefined' ? window.birdSteam : undefined;
const T0 = Date.now();
const SESSION = T0.toString(36) + Math.random().toString(36).slice(2, 6);

const LOG = [];                 // записи, новые — в конце
const BYKEY = new Map();
let snapFn = null, toastFn = null, inited = false;
let dirty = false, saveT = 0, nId = 0;

/* где сейчас кадр — для ошибок вне предохранителя: game.js ставит перед кусками кадра */
export const at = { ph: '' };

/* ── последние события игры: кольцо из 20, без аллокаций, пока событие то же ── */
const EV = new Array(20), EVT = new Float64Array(20);
let evN = 0, lastState = '';
export function event (s) {
  const i = evN++ % EV.length;
  EV[i] = String(s).slice(0, 120); EVT[i] = Date.now();
}
/* смена состояния S.state — событие (сравнение строк, аллокация только при смене) */
export function track (state) { if (state !== lastState) { event('state ' + lastState + ' → ' + state); lastState = state; } }
function events () {
  const out = [];
  for (let k = Math.max(0, evN - EV.length); k < evN; k++) { const i = k % EV.length; out.push('+' + ((EVT[i] - T0) / 1000).toFixed(1) + 's ' + EV[i]); }
  return out;
}

/* ── fps: скользящее среднее по времени кадра ── */
let lastBeat = 0, ftAvg = 16.7;
let frames = 0;

/* ── предохранитель ── */
const FUSES = new Map();        // name → { fails, streak, off }
/* замер шагов (tools/perf.cjs --play): PROF.fn(name, мс) после каждого шага; без замера — null */
export const PROF = { fn: null };
export function step (name, fn, a, b, c, d) {
  const pf = PROF.fn, t0 = pf !== null ? performance.now() : 0;
  const f = FUSES.get(name);
  if (f !== undefined) {
    if (f.off) return;
    try { fn(a, b, c, d); f.streak = 0; } catch (e) { blow(name, f, e); }
  } else {
    try { fn(a, b, c, d); } catch (e) { const nf = { fails: 0, streak: 0, off: false }; FUSES.set(name, nf); blow(name, nf, e); }
  }
  if (pf !== null) pf(name, performance.now() - t0);
}
function blow (name, f, e) {
  f.fails++; f.streak++;
  if (f.streak >= 3 && !f.off) {
    f.off = true;
    report('fuse:' + name, e, 'fuse');
    toast();
  } else report('step:' + name, e, 'step');
}
export const disabled = () => [...FUSES].filter(([, f]) => f.off).map(([k]) => k);

/* ── сторож ── мир хотели продвинуть (want) — и продвинули (done) */
let wantT = 0, progT = 0, lastTG = -Infinity, frozen = false;
export function beat (now) {
  frames++;
  if (lastBeat) { const ft = now - lastBeat; if (ft > 0 && ft < 1000) ftAvg += (ft - ftAvg) * 0.05; }
  lastBeat = now;
}
export function want (now, playing) {
  if (!playing) { wantT = 0; return; }
  if (!wantT || now - wantT > 500) progT = now;   // только что из паузы / меню — отсчёт заново
  wantT = now;
  if (!frozen && now - progT > FREEZE_MS) {
    frozen = true;
    const last = LOG.length ? LOG[LOG.length - 1] : null;
    report('watchdog', { message: 'мир стоит ' + ((now - progT) / 1000).toFixed(1) + ' с, кадры идут', stack: '' }, 'freeze',
      last ? { lastError: last.where + ': ' + last.msg + ' ×' + last.n } : null);
  }
}
export function done (tG) {
  if (tG > lastTG) { lastTG = tG; progT = wantT; if (frozen) { frozen = false; event('мир снова идёт'); } }
}

/* ── запись ── */
function snapshot () {
  const s = {
    build: BUILD, platform: (document.documentElement && document.documentElement.dataset.platform) || '',
    up: +((Date.now() - T0) / 1000).toFixed(1), fps: Math.round(1000 / ftAvg), frames, phase: at.ph,
    screen: (typeof innerWidth === 'number' ? innerWidth + '×' + innerHeight : ''), url: location.search.slice(0, 120),
  };
  if (snapFn) { try { Object.assign(s, snapFn()); } catch (e) { s.snapErr = String(e && e.message || e).slice(0, 200); } }
  const off = disabled(); if (off.length) s.off = off;
  s.events = events();
  return s;
}
/* where — что бросило (fuse:hits, step:hits, frame, window, promise, watchdog); kind — error | step | fuse | frame | freeze | rejection */
export function report (where, e, kind = 'error', extra = null) {
  try {
    const msg = String((e && (e.message || e.reason)) || e || '?').slice(0, 400);
    const stack = String((e && e.stack) || '').slice(0, STACK);
    const key = kind + '|' + where + '|' + msg + '|' + stack.split('\n').slice(0, 2).join('|');
    const now = Date.now();
    let r = BYKEY.get(key);
    if (r) {
      r.n++; r.last = new Date(now).toISOString();
      if (kind === 'fuse') r.kind = 'fuse';
      dirty = true; schedule();
      return r;
    }
    r = { id: SESSION + '-' + (++nId), session: SESSION, kind, where, msg, stack, n: 1,
      first: new Date(now).toISOString(), last: new Date(now).toISOString(), snap: snapshot() };
    if (extra) Object.assign(r, extra);
    BYKEY.set(key, r);
    LOG.push(r);
    if (LOG.length > MAX) { const old = LOG.shift(); for (const [k, v] of BYKEY) if (v === old) { BYKEY.delete(k); break; } }
    event('ошибка ' + where + ': ' + msg.slice(0, 60));
    try { console.error('[crashlog]', kind, where, msg); } catch (x) { /* — */ }
    writeFile(r);
    dirty = true; schedule(true);
    if (kind === 'frame' || kind === 'error' || kind === 'freeze') toast();
    refreshButton();
    return r;
  } catch (x) { return null; }
}

/* ── хранение ── */
let past = [];                                     // записи прошлых запусков (localStorage)
function load () {
  try { const j = JSON.parse(localStorage.getItem(KEY) || '[]'); if (Array.isArray(j)) past = j.filter(r => r && r.session !== SESSION).slice(-KEEP); } catch (e) { past = []; }
}
const lastWrite = new WeakMap();
function writeFile (r) {
  if (!bridge || !bridge.log) return;
  lastWrite.set(r, r.n);
  try { bridge.log(JSON.stringify(r)); } catch (e) { /* — */ }
}
function schedule (now) {
  if (saveT) { if (!now) return; clearTimeout(saveT); }
  saveT = setTimeout(save, now ? 50 : 5000);
}
function save () {
  saveT = 0;
  if (!dirty) return;
  dirty = false;
  // счётчики выросли — в файл ещё строку с той же id (читающий берёт последнюю)
  for (const r of LOG) if (lastWrite.has(r) && lastWrite.get(r) !== r.n) writeFile(r);
  try {
    const keep = past.concat(LOG).slice(-KEEP).map(r => (r.stack.length > 600 ? { ...r, stack: r.stack.slice(0, 600) } : r));
    localStorage.setItem(KEY, JSON.stringify(keep));
  } catch (e) { /* полный localStorage — не страшно */ }
}

/* ── чтение ── */
export const entries = () => past.concat(LOG);
export const count = () => past.length + LOG.length;
export const session = () => LOG.slice();
export function clear () {
  past = []; LOG.length = 0; BYKEY.clear();
  try { localStorage.removeItem(KEY); } catch (e) { /* — */ }
  refreshButton();
}
/* текст для Claude: шапка и по записи в строке (JSON) */
export function text () {
  const head = 'BirdPizza crashlog · ' + BUILD + ' · ' + ((document.documentElement && document.documentElement.dataset.platform) || '') + ' · ' + new Date().toISOString() + ' · ' + navigator.userAgent;
  return [head, ...entries().map(r => JSON.stringify(r))].join('\n');
}
export const openDir = () => (bridge && bridge.openLogs ? bridge.openLogs() : Promise.resolve(false));
export const logDir = () => (bridge && bridge.logDir ? bridge.logDir() : Promise.resolve(''));

/* ── плашка «что-то споткнулось» — раз в 20 с, не чаще ── */
let toastAt = 0;
function toast () {
  const now = Date.now();
  if (now - toastAt < 20000) return;
  toastAt = now;
  const s = $t('что-то споткнулось — отчёт сохранён');
  if (toastFn) { try { toastFn(s); return; } catch (e) { /* — */ } }
  try {
    let el = document.getElementById('crash-toast');
    if (!el) { el = document.createElement('div'); el.id = 'crash-toast'; document.body.appendChild(el); }
    el.textContent = s; el.classList.add('on');
    setTimeout(() => el.classList.remove('on'), 4000);
  } catch (e) { /* — */ }
}

/* ── кнопка «отчёт об ошибке» в углу паузы и окно с записями ── */
export function refreshButton (closeBox) {
  const b = document.getElementById('pm-crash');
  if (b) b.hidden = !count();
  const box = closeBox && document.getElementById('pm-crash-box');
  if (box) box.hidden = true;
}
function fmt (r) {
  const w = r.kind === 'freeze' ? $t('зависание') : r.kind === 'fuse' ? $t('выключено') : $t('ошибка');
  const d = new Date(r.last), p2 = v => String(v).padStart(2, '0');
  const when = isNaN(d) ? '' : d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
  return when + ' · ' + w + ' · ' + r.where + (r.n > 1 ? ' ×' + r.n : '') + '\n  ' + r.msg;
}
function openPanel () {
  let p = document.getElementById('pm-crash-box');
  if (!p) {
    p = document.createElement('div');
    p.id = 'pm-crash-box';
    p.innerHTML = '<div class="pc-t"></div><pre class="pc-list"></pre><div class="pc-path"></div><div class="pc-btns">' +
      '<button type="button" data-a="copy"></button><button type="button" data-a="dir" hidden></button>' +
      '<button type="button" data-a="clear"></button><button type="button" data-a="close"></button></div>';
    (document.getElementById('pausem') || document.body).appendChild(p);
    p.addEventListener('click', e => {
      const a = e.target && e.target.dataset && e.target.dataset.a;
      if (a === 'copy') copy(text()).then(ok => { e.target.textContent = ok ? $t('скопировано') : $t('не вышло — выдели текст'); });
      else if (a === 'dir') openDir();
      else if (a === 'clear') { clear(); p.hidden = true; }
      else if (a === 'close') p.hidden = true;
    });
  }
  p.querySelector('.pc-t').textContent = $t('отчёт об ошибке') + ' · ' + BUILD;
  p.querySelector('.pc-list').textContent = entries().slice(-12).reverse().map(fmt).join('\n');
  const btn = a => p.querySelector('[data-a="' + a + '"]');
  btn('copy').textContent = $t('скопировать');
  btn('clear').textContent = $t('очистить');
  btn('close').textContent = $t('закрыть');
  const dir = btn('dir');
  dir.textContent = $t('открыть папку с отчётами');
  dir.hidden = !(bridge && bridge.openLogs);
  const path = p.querySelector('.pc-path');
  path.textContent = '';
  logDir().then(d => { path.textContent = d || ''; }).catch(() => {});
  p.hidden = false;
}
async function copy (s) {
  try { await navigator.clipboard.writeText(s); return true; } catch (e) { /* — */ }
  try {
    const ta = document.createElement('textarea'); ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch (e) { return false; }
}

/* ── подключение: main.js — как можно раньше; game.js — снимок и плашка ── */
export function init () {
  if (inited || typeof window === 'undefined') return;
  inited = true;
  load();
  addEventListener('error', e => {
    // ресурс не загрузился (картинка, звук) — не ошибка кода
    if (!e || (!e.error && !e.message)) return;
    report('window', e.error || { message: e.message, stack: (e.filename || '') + ':' + (e.lineno || 0) + ':' + (e.colno || 0) }, 'error');
  });
  addEventListener('unhandledrejection', e => { report('promise', (e && e.reason) || '?', 'rejection'); });
  addEventListener('pagehide', save);
  const hook = () => {
    const b = document.getElementById('pm-crash');
    if (b && !b.dataset.on) { b.dataset.on = '1'; b.addEventListener('click', ev => { ev.stopPropagation(); openPanel(); }); }
    refreshButton();
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', hook); else hook();
}
export function setSnapshot (fn) { snapFn = fn; }
export function setToast (fn) { toastFn = fn; }

export default { PROF, init, report, step, beat, want, done, track, event, at, entries, count, session, clear, text, disabled, openDir, logDir, setSnapshot, setToast, refreshButton };
