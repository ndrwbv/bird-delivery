/* Музыка (М5, 09.10.2026). Правила словами, промпты для Suno и имена файлов — docs/MUSIC.md.

   Автор кладёт треки в public/music: menu.ogg, day.ogg (или day-1.ogg, day-2.ogg …), night.ogg,
   shiftend.ogg, tense.ogg. Игра один раз читает music/index.json (его строит плагин в vite.config.js
   из папки — tools/sfx-index.mjs, как у звуков) и не стучится за именами наугад. Файлов нет — тишина.

   Какой трек (слот) играет — по состоянию игры:
     menu      — главное меню (и гараж, карта, профили из меню)
     day       — смена, день;            night — смена, ночь (ENV.night > NIGHT_ON, назад — ниже NIGHT_OFF)
     tense     — налёт на точку, восстание, мафиози, погоня, ураган (держится ещё TENSE_HOLD с после)
     shiftend  — чек конца смены
   Нет файла у слота — запасной (FALL): ночь ↔ день, напряжённо → день / ночь, конец смены → меню.

   Звучит потоком: <audio> → MediaElementSource → свой регулятор → шина «музыка» (ползунок) → общий
   (вкл / выкл, ?mute). Файл целиком в память не раскодируется. Трек кончается — за XF с до конца
   вступает следующий вариант слота (day-1, day-2 … по очереди, без повтора подряд; один вариант —
   он же сначала): бесшовная петля автору не нужна, только без тишины в конце.
   Смена слота — плавный переход XF с. Приглушение: катсцена, диалог, Толик пишет (печатает или
   крупное сообщение), пауза — громкость ниже (DUCK). Фон города (ambience.js) при музыке — тише (AMB).

   Работает от своего таймера (TICK), не от кадра мира: в паузе, в меню и на чеке кадры мира не идут.

   Радио в машине (М6, radio.js): в смене вместо day / night играет слот станции «radio-<id>»
   (radio-disco-1.mp3 …); нет файлов станции — день / ночь игры; станция «выкл» — тишина. Напряжённая
   важнее радио. Новая песня — radio.onSong (ведущий говорит на стыке песен).

     load()        — прочитать список файлов (из game.js сразу при загрузке)
     init(api)     — { Snd, S, ENV, isPlaying, tense, cut, dialog, chat, radio }: Snd.ctx / musicBus / vol / on;
                     radio — radio.js (slot(): null | 'off' | 'radio-<id>', onSong)
     has()         — есть ли музыка: свой синтез (MUS.CHIP) или хоть один файл (настройки: пометка «скоро» у ползунка — только если нет)
     level()       — 0…1, насколько сейчас слышна музыка (для фона города)
     DEBUG         — __dlv.Snd.MUS: state, STATS, list, force(slot), MUS, chip (chiptunes.js)

   Своя музыка кодом (18.10.2026, chiptunes.js): у места нет файлов — играет синтез, 6 треков по кругу.
   Трек — по настроению (chipMood): меню, день, ночь, зима, лето, Новый год; кончился — следующий того же
   настроения; настроение сменилось (стемнело, другой сезон) — плавно на трек нового. Выбранный игроком
   («следующий трек») доигрывает до конца, потом снова по настроению.
     next()        — следующий трек (клавиша F / крестовина ↓, пока радио скрыто; строка в настройках)
     toggle()      — музыка вкл / выкл (клавиша B, L3; настройки); сохраняется (dlv-music), звуки не трогает
     cycle()       — пауза, карточка «музыка»: следующий трек → … → после последнего «выкл» → снова первый
     label()       — «музыка: Тёплый асфальт» / «музыка: выкл» (пауза, меню, настройки); title() — только название */

export const MUS = {
  XF: 2.5,            // с — переход между треками (и между вариантами одного слота)
  GAIN: 0.4,          // громкость трека при ползунке 100 %: Suno сводит громко, музыка — под звуками
  OUT: 0.6,           // с — погасить, когда звук выключили
  DUCK: { cut: 0.35, dialog: 0.5, chat: 0.75, pause: 0.4 },   // множитель громкости: катсцена, диалог, Толик пишет, пауза
  DUCK_T: 0.25,       // с — постоянная приглушения (до конца ~0,8 с)
  NIGHT_ON: 0.6, NIGHT_OFF: 0.4,   // ENV.night: выше — ночная музыка, ниже — снова дневная
  TENSE_HOLD: 6,      // с — после конца события напряжённая ещё держится
  AMB: 0.3,           // фон города тише на столько при музыке на 100 %
  TICK: 100,          // мс — как часто решаем
  RADIO_XF: 0.7,      // с — переход между станциями радио (крутишь ручку — быстрее, чем смена дня и ночи)
  CHIP: true,         // своя музыка кодом (chiptunes.js), когда у места нет файлов; false — тишина, как до 18.10
  NEXT_XF: 1.2,       // с — переход, когда игрок сам жмёт «следующий трек»
};

import * as CHIPT from './chiptunes.js';
import { t } from '../i18n/index.js';

const BASE = 'music/';
export const SLOTS = ['menu', 'day', 'night', 'tense', 'shiftend'];
const FALL = { menu: ['menu'], day: ['day', 'night'], night: ['night', 'day'], tense: ['tense'], shiftend: ['shiftend', 'menu'] };
const isRadio = s => typeof s === 'string' && s.startsWith('radio-');   // станции радио (radio.js): radio-disco, radio-retro, radio-night

let A = null, LIST = {}, D = null;            // D — регулятор приглушения перед шиной «музыка»
let CUR = null;                                // { slot, file, el, src, g, t0 }
const OLD = [];                                // гаснущие
const NEXT = {};                               // слот → номер следующего варианта
const BAD = new Set();                         // файлы, что не играют
const ST = { want: null, night: false, tenseT: 0, duck: 1, dg: 1, forced: null, last: 0, radio: null,
  off: false, pin: false, chipLast: -1, cyc: 0, mood: '', skip: false, plated: -1 };
const KEY_ON = 'dlv-music';
export const STATS = { listed: 0, started: {}, switches: 0, errors: [], log: [] };

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const note = s => { STATS.log.push(Math.round(now() / 100) / 10 + 'с ' + s); if (STATS.log.length > 30) STATS.log.splice(0, STATS.log.length - 30); };

export function load () {
  if (typeof fetch !== 'function') return;
  fetch(BASE + 'index.json', { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : {}))
    .then(j => {
      LIST = {};
      if (j && typeof j === 'object') for (const k of Object.keys(j)) if ((SLOTS.includes(k) || isRadio(k)) && Array.isArray(j[k]) && j[k].length) LIST[k] = j[k].slice();
      STATS.listed = Object.values(LIST).reduce((s, a) => s + a.length, 0);
    })
    .catch(() => { /* списка нет (старая сборка, файл открыт с диска) — без музыки */ });
}

export function init (api) {
  A = api;
  try { ST.off = !!(A.Store && String(A.Store.get(KEY_ON, '1')) === '0'); } catch (e) { /* — */ }
  if (typeof setInterval === 'function') setInterval(() => { try { tick(); } catch (e) { STATS.errors.push('tick: ' + ((e && e.message) || e)); } }, MUS.TICK);
}

const files = slot => (LIST[slot] || []).filter(f => !BAD.has(f));
export const has = () => MUS.CHIP || Object.keys(LIST).some(s => files(s).length > 0);   // своя музыка кодом — тоже музыка (пометки «скоро» нет)

/** насколько сейчас слышна музыка: 0…1 (ползунок «музыка» × приглушение), 0 — не играет */
export function level () {
  if (!CUR || !A || !A.Snd || !A.Snd.on) return 0;
  const v = Math.max(0, Math.min(100, +A.Snd.vol.music || 0)) / 100;
  return v * v * ST.duck;
}

/* какой слот нужен сейчас (до запасных) */
function wantSlot (dt) {
  const S = A.S;
  ST.radio = null;
  if (ST.forced) return ST.forced;
  if (S.state === 'title') return 'menu';
  if (S.state === 'over') return 'shiftend';
  if (!A.isPlaying() && S.state !== 'dying') return null;
  const n = (A.ENV && A.ENV.night) || 0;
  if (n > MUS.NIGHT_ON) ST.night = true; else if (n < MUS.NIGHT_OFF) ST.night = false;
  let tense = false;
  try { tense = !!(A.tense && A.tense()); } catch (e) { /* — */ }
  if (tense) ST.tenseT = MUS.TENSE_HOLD; else ST.tenseT = Math.max(0, ST.tenseT - dt);
  const drive = ST.night ? 'night' : 'day';
  if (ST.tenseT > 0 && files('tense').length) return 'tense';
  let r = null;
  try { r = A.radio ? A.radio.slot() : null; } catch (e) { /* — */ }
  ST.radio = r;
  if (r === 'off') return null;                  // радио: станция «выкл» — тишина
  return r || drive;
}
// у станции радио нет файлов — день / ночь игры
const fall = slot => FALL[slot] || (isRadio(slot) ? [slot].concat(ST.night ? ['night', 'day'] : ['day', 'night']) : [slot]);
const resolve = slot => (slot ? fall(slot).find(s => files(s).length > 0) || null : null);

/* следующий вариант слота: по очереди с случайного, подряд не повторяется */
function nextFile (slot) {
  const arr = files(slot);
  if (!arr.length) return null;
  if (arr.length === 1) return arr[0];
  let i = NEXT[slot];
  if (i == null) i = (Math.random() * arr.length) | 0;
  const f = arr[i % arr.length];
  NEXT[slot] = (i + 1) % arr.length;
  return CUR && CUR.file === f ? arr[(i + 1) % arr.length] : f;
}

function bus () {
  const Snd = A.Snd;
  if (!D) { D = Snd.ctx.createGain(); D.gain.value = 1; D.connect(Snd.musicBus); }
  return D;
}

/* своя музыка: трек i — плеер синтеза в ту же шину (приглушение, ползунок) */
function startChip (i, secs) {
  let pl;
  try { pl = CHIPT.play(A.Snd.ctx, bus(), i, secs); } catch (e) { STATS.errors.push('chip: ' + ((e && e.message) || e)); MUS.CHIP = false; return null; }   // не вышло — тишина, без повторов
  ST.chipLast = pl.i;
  STATS.started.chip = (STATS.started.chip || 0) + 1;
  return { slot: 'chip', file: null, chip: pl, track: pl.i, t0: now() };
}

function start (slot, secs = MUS.XF, track) {
  if (slot === 'chip') return startChip(track, secs);
  const f = nextFile(slot);
  if (!f) return null;
  const c = A.Snd.ctx, el = new Audio();
  el.preload = 'auto';
  el.src = BASE + encodeURIComponent(f);
  let src;
  try { src = c.createMediaElementSource(el); } catch (e) { STATS.errors.push(f + ': ' + ((e && e.message) || e)); return null; }
  const g = c.createGain();
  g.gain.value = 0;
  src.connect(g); g.connect(bus());
  const ch = { slot, file: f, el, src, g, t0: now() };
  el.addEventListener('error', () => {
    BAD.add(f);
    STATS.errors.push(f + ': не играет (' + ((el.error && el.error.code) || '?') + ')');
    if (CUR === ch) { fade(ch, 0.2); CUR = null; }
  });
  el.addEventListener('ended', () => { if (CUR === ch) swap(slot); });
  const p = el.play();
  if (p && p.catch) p.catch(e => { if (CUR === ch) STATS.errors.push(f + ': play — ' + ((e && e.message) || e)); });
  const t = c.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(MUS.GAIN, t + secs);
  STATS.started[slot] = (STATS.started[slot] || 0) + 1;
  return ch;
}

function fade (ch, secs) {
  if (ch.chip) ch.chip.fade(secs);
  else { const c = A.Snd.ctx, t = c.currentTime, g = ch.g.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + secs); }
  OLD.push(ch);
  setTimeout(() => stop(ch), secs * 1000 + 300);
}
function stop (ch) {
  const i = OLD.indexOf(ch);
  if (i >= 0) OLD.splice(i, 1);
  if (ch.chip) { ch.chip.stop(); return; }
  try { ch.el.pause(); ch.el.removeAttribute('src'); ch.el.load(); } catch (e) { /* — */ }
  try { ch.src.disconnect(); ch.g.disconnect(); } catch (e) { /* — */ }
}

/* перейти на слот (или на следующий вариант того же) с плавным переходом */
function swap (slot, secs = MUS.XF, track) {
  const was = CUR;
  if (was) fade(was, secs);
  CUR = slot ? start(slot, secs, track) : null;
  STATS.switches++;
  note((was ? was.slot : '—') + ' → ' + (slot || '—') + (CUR ? ' (' + (CUR.chip ? CUR.chip.id : CUR.file) + ')' : ''));
  if (CUR && CUR.chip && ST.plated !== STATS.switches) chipPlate();
  if (CUR && A.radio && A.radio.onSong) try { A.radio.onSong(CUR.slot, CUR.file); } catch (e) { /* — */ }
}

function tick () {
  if (!A) return;
  const t = now(), dt = ST.last ? Math.min(1, (t - ST.last) / 1000) : 0;
  ST.last = t;
  const Snd = A.Snd;
  if (!Snd || !Snd.ctx || !Snd.musicBus) return;
  const want = Snd.on && !ST.off ? wantSlot(dt) : null;
  let slot = resolve(want);
  if (!slot && want && MUS.CHIP) slot = 'chip';     // у места нет файлов — своя музыка кодом
  ST.want = slot;
  if (!slot) { if (CUR) swap(null, Snd.on && !ST.off ? MUS.XF : MUS.OUT); ST.pin = false; }
  else if (slot === 'chip') chipTick(want);
  else if (!CUR || CUR.slot !== slot) swap(slot, CUR && isRadio(CUR.slot) && isRadio(slot) ? MUS.RADIO_XF : MUS.XF);
  else {
    // к концу трека — следующий вариант (или он же сначала), с переходом
    const d = CUR.el.duration, left = d - CUR.el.currentTime;
    if (Number.isFinite(d) && d > MUS.XF * 3 && left < MUS.XF) swap(slot);
  }
  // приглушение: катсцена, диалог, Толик пишет, пауза — берём самое тихое
  const q = k => { try { return !!(A[k] && A[k]()); } catch (e) { return false; } };
  let k = 1;
  if (q('cut')) k = Math.min(k, MUS.DUCK.cut);
  if (q('dialog')) k = Math.min(k, MUS.DUCK.dialog);
  if (q('chat')) k = Math.min(k, MUS.DUCK.chat);
  if (q('indoors')) k = 0;
  if (A.S.paused) k = Math.min(k, MUS.DUCK.pause);
  if (D && Math.abs(k - ST.dg) > 0.001) {
    const g = D.gain, tc = Snd.ctx.currentTime;
    g.cancelScheduledValues(tc); g.setTargetAtTime(k, tc, MUS.DUCK_T);
    ST.dg = k;
  }
  ST.duck = k;
  try { CHIPT.step(); } catch (e) { STATS.errors.push('chip step: ' + ((e && e.message) || e)); }
  menuStrip();
}

/* ═════════════ своя музыка: настроение и смена треков ═════════════ */
/* настроение: Новый год → зима / лето → ночь → день; в меню и на чеке — по сезону, без ночи */
function chipMood (want) {
  let hol = '', sea = -1;
  try { hol = (A.hol && A.hol()) || ''; } catch (e) { /* — */ }
  try { sea = A.sea ? Math.floor(((+A.sea() % 4) + 4) % 4) : -1; } catch (e) { /* — */ }
  const menu = want === 'menu' || want === 'shiftend';
  if (hol === 'newyear') return 'newyear';
  if (sea === 2) return !menu && ST.night ? 'winterNight' : 'winter';      // seasons.js: 0 лето, 1 осень, 2 зима, 3 весна
  if (!menu && ST.night) return 'night';
  if (sea === 0) return 'summer';
  return menu ? 'menu' : 'day';
}
function chipTick (want) {
  const mood = chipMood(want);
  ST.mood = mood;
  if (!CUR || CUR.slot !== 'chip') { swap('chip', MUS.XF, CHIPT.pick(mood, ST.chipLast)); return; }
  const P = CHIPT.pool(mood);
  if (!ST.pin && !P.includes(CUR.track)) { swap('chip', MUS.XF, CHIPT.pick(mood, CUR.track)); return; }
  if (CUR.chip.left() < MUS.XF) { ST.pin = false; swap('chip', MUS.XF, CHIPT.after(mood, CUR.track)); }
}
/* плашка «♪ трек» — в езде (в меню и на паузе название и так на виду) */
function chipPlate () {
  ST.plated = STATS.switches;
  if (!A || !A.S || A.S.paused || A.S.state === 'title' || !CUR || !CUR.chip) return;
  CHIPT.plate(CHIPT.name(CUR.track));
}
/* полоска в главном меню (мышь, палец): «♪ трек ▶ | выкл» */
let STRIP_API = null;
function menuStrip () {
  let on = false;
  try { on = !!(A.strip && A.strip()); } catch (e) { /* — */ }
  if (!on) { CHIPT.strip(false); return; }
  if (!STRIP_API) STRIP_API = { next: () => next(), toggle: () => toggle() };
  CHIPT.strip(true, ST.off || !A.Snd.on ? t('музыка выкл') : title() || t('музыка'), STRIP_API, ST.off);
}

/* ═════════════ кнопки ═════════════ */
export const on = () => !ST.off;
/** название того, что играет: трек своей музыки; файл автора — «файл» без расширения; ничего — '' */
export function title () {
  if (!CUR) return '';
  if (CUR.chip) return CHIPT.name(CUR.track);
  return String(CUR.file || '').replace(/\.[a-z0-9]+$/i, '');
}
/** «музыка: Тёплый асфальт» / «музыка: выкл» */
export function label () {
  if (ST.off) return t('музыка: выкл');
  const n = title();
  return n ? t('музыка: {name}', { name: n }) : t('музыка: вкл');
}
/** следующий трек (своя музыка — по кругу всех шести, файлы — следующий вариант места) */
export function next (quiet) {
  if (!A || !A.Snd) return false;
  A.Snd.boot && A.Snd.boot(); A.Snd.resume && A.Snd.resume();
  if (ST.off) { toggle(); return true; }
  if (!A.Snd.ctx || !CUR) return false;
  ST.plated = STATS.switches + 1;                 // своя плашка ниже, не из swap
  if (CUR.chip) {
    ST.pin = true;
    swap('chip', MUS.NEXT_XF, (CUR.track + 1) % CHIPT.count());
  } else swap(CUR.slot, MUS.NEXT_XF);
  ST.cyc++;
  if (!quiet && CUR) CHIPT.plate(title() || t('музыка'), t('следующий трек'));
  return true;
}
/** музыка вкл / выкл (звуки и мотор не трогает; общий звук — M / R3) */
export function toggle () {
  ST.off = !ST.off;
  ST.cyc = 0; ST.pin = false;
  try { if (A && A.Store) A.Store.set(KEY_ON, ST.off ? '0' : '1'); } catch (e) { /* — */ }
  if (A && A.Snd) { A.Snd.boot && A.Snd.boot(); A.Snd.resume && A.Snd.resume(); }
  ST.plated = STATS.switches + 1;                 // своя плашка ниже, не из swap
  try { tick(); } catch (e) { /* — */ }
  if (ST.off) CHIPT.plate(t('музыка выкл'));
  else CHIPT.plate(title() || t('музыка вкл'), A && A.Snd && A.Snd.on ? '' : t('звук выключен — M'));
  return !ST.off;
}
/** одна кнопка на всё (пауза, телефон): следующий трек → … → после последнего «выкл» → снова вкл */
export function cycle () {
  if (ST.off) { toggle(); return; }
  const n = CUR && CUR.chip ? CHIPT.count() : Math.max(1, files(CUR ? CUR.slot : '').length);
  if (ST.cyc >= n - 1 || !CUR) { toggle(); return; }
  next();
}

export const DEBUG = {
  MUS, STATS,
  get list () { return JSON.parse(JSON.stringify(LIST)); },
  chip: CHIPT.DEBUG, next, toggle, cycle, label,
  get bad () { return [...BAD]; },
  get state () {
    return {
      want: ST.want, radio: ST.radio, slot: CUR ? CUR.slot : null, file: CUR ? CUR.file : null, night: ST.night, tense: +ST.tenseT.toFixed(1),
      duck: ST.duck, level: +level().toFixed(3), fading: OLD.length,
      off: ST.off, mood: ST.mood, pin: ST.pin, track: CUR && CUR.chip ? CUR.chip.id : null, title: title(), chip: CUR && CUR.chip ? CUR.chip.pos() : null,
      gain: CUR ? (CUR.chip ? CUR.chip.gain : +CUR.g.gain.value.toFixed(3)) : 0, duckGain: D ? +D.gain.value.toFixed(3) : 1,
      bus: A && A.Snd && A.Snd.musicBus ? +A.Snd.musicBus.gain.value.toFixed(3) : null,
      t: CUR && CUR.el ? +CUR.el.currentTime.toFixed(2) : 0, dur: CUR && CUR.el && Number.isFinite(CUR.el.duration) ? +CUR.el.duration.toFixed(1) : null, paused: CUR && CUR.el ? CUR.el.paused : null,
    };
  },
  /* держать слот (проверки): 'day' | 'night' | 'tense' | 'menu' | 'shiftend' | 'radio-disco' …; null — снова по игре */
  force (slot) { ST.forced = slot && (SLOTS.includes(slot) || isRadio(slot)) ? slot : null; return ST.forced; },
  /* своя музыка: сыграть трек i (0…5) сразу, держать до конца */
  play (i) { if (!A || !A.Snd.ctx) return null; ST.pin = true; swap('chip', MUS.NEXT_XF, i); return CUR && CUR.chip ? CUR.chip.id : null; },
  seek (bar) { if (CUR && CUR.chip) CUR.chip.seek(bar); return CUR && CUR.chip ? CUR.chip.pos() : null; },
  reload: () => load(),
};
