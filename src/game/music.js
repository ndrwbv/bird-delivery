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
     has()         — есть ли хоть один трек (настройки: пометка «скоро» у ползунка — только если нет)
     level()       — 0…1, насколько сейчас слышна музыка (для фона города)
     DEBUG         — __dlv.Snd.MUS: state, STATS, list, force(slot), MUS */

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
};

const BASE = 'music/';
export const SLOTS = ['menu', 'day', 'night', 'tense', 'shiftend'];
const FALL = { menu: ['menu'], day: ['day', 'night'], night: ['night', 'day'], tense: ['tense'], shiftend: ['shiftend', 'menu'] };
const isRadio = s => typeof s === 'string' && s.startsWith('radio-');   // станции радио (radio.js): radio-disco, radio-retro, radio-night

let A = null, LIST = {}, D = null;            // D — регулятор приглушения перед шиной «музыка»
let CUR = null;                                // { slot, file, el, src, g, t0 }
const OLD = [];                                // гаснущие
const NEXT = {};                               // слот → номер следующего варианта
const BAD = new Set();                         // файлы, что не играют
const ST = { want: null, night: false, tenseT: 0, duck: 1, dg: 1, forced: null, last: 0, radio: null };
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
  if (typeof setInterval === 'function') setInterval(() => { try { tick(); } catch (e) { STATS.errors.push('tick: ' + ((e && e.message) || e)); } }, MUS.TICK);
}

const files = slot => (LIST[slot] || []).filter(f => !BAD.has(f));
export const has = () => Object.keys(LIST).some(s => files(s).length > 0);

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

function start (slot, secs = MUS.XF) {
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
  const c = A.Snd.ctx, t = c.currentTime, g = ch.g.gain;
  g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + secs);
  OLD.push(ch);
  setTimeout(() => stop(ch), secs * 1000 + 300);
}
function stop (ch) {
  const i = OLD.indexOf(ch);
  if (i >= 0) OLD.splice(i, 1);
  try { ch.el.pause(); ch.el.removeAttribute('src'); ch.el.load(); } catch (e) { /* — */ }
  try { ch.src.disconnect(); ch.g.disconnect(); } catch (e) { /* — */ }
}

/* перейти на слот (или на следующий вариант того же) с плавным переходом */
function swap (slot, secs = MUS.XF) {
  const was = CUR;
  if (was) fade(was, secs);
  CUR = slot ? start(slot, secs) : null;
  STATS.switches++;
  note((was ? was.slot : '—') + ' → ' + (slot || '—') + (CUR ? ' (' + CUR.file + ')' : ''));
  if (CUR && A.radio && A.radio.onSong) try { A.radio.onSong(CUR.slot, CUR.file); } catch (e) { /* — */ }
}

function tick () {
  if (!A) return;
  const t = now(), dt = ST.last ? Math.min(1, (t - ST.last) / 1000) : 0;
  ST.last = t;
  const Snd = A.Snd;
  if (!Snd || !Snd.ctx || !Snd.musicBus) return;
  const slot = Snd.on ? resolve(wantSlot(dt)) : null;
  ST.want = slot;
  if (!slot) { if (CUR) swap(null, Snd.on ? MUS.XF : MUS.OUT); }
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
  if (A.S.paused) k = Math.min(k, MUS.DUCK.pause);
  if (D && Math.abs(k - ST.dg) > 0.001) {
    const g = D.gain, tc = Snd.ctx.currentTime;
    g.cancelScheduledValues(tc); g.setTargetAtTime(k, tc, MUS.DUCK_T);
    ST.dg = k;
  }
  ST.duck = k;
}

export const DEBUG = {
  MUS, STATS,
  get list () { return JSON.parse(JSON.stringify(LIST)); },
  get bad () { return [...BAD]; },
  get state () {
    return {
      want: ST.want, radio: ST.radio, slot: CUR ? CUR.slot : null, file: CUR ? CUR.file : null, night: ST.night, tense: +ST.tenseT.toFixed(1),
      duck: ST.duck, level: +level().toFixed(3), fading: OLD.length,
      gain: CUR ? +CUR.g.gain.value.toFixed(3) : 0, duckGain: D ? +D.gain.value.toFixed(3) : 1,
      bus: A && A.Snd && A.Snd.musicBus ? +A.Snd.musicBus.gain.value.toFixed(3) : null,
      t: CUR ? +CUR.el.currentTime.toFixed(2) : 0, dur: CUR && Number.isFinite(CUR.el.duration) ? +CUR.el.duration.toFixed(1) : null, paused: CUR ? CUR.el.paused : null,
    };
  },
  /* держать слот (проверки): 'day' | 'night' | 'tense' | 'menu' | 'shiftend' | 'radio-disco' …; null — снова по игре */
  force (slot) { ST.forced = slot && (SLOTS.includes(slot) || isRadio(slot)) ? slot : null; return ST.forced; },
  reload: () => load(),
};
