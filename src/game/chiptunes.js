/* Своя музыка кодом (автор 18.10.2026: «Добавь музыку. Сам напиши какую-то чил-музыку, чтобы можно было
   переключать и выключать… Не громкая должна быть»). Правила словами — docs/MUSIC.md «Своя музыка кодом».

   Маленький синтезатор на WebAudio, без файлов и библиотек: тёплый lo-fi с чиптюн-лидом — мягкие пэды
   (пила через фильтр, «дышат» медленно), электропиано (синус с FM-звоном), «мурлыка»-лид (квадрат 25 %
   через фильтр, лёгкое вибрато), бас, тихие барабаны из шума и синусов, колокольчики, бубенцы, шорох
   винила, сайдчейн-«дыхание» пэдов от бочки, эхо и (на компьютере) короткий зал. Лёгкое «плавание» плёнки.

   Шесть треков (TRACKS) по 2,5—3 мин: свои аккорды и мелодия (ноты — ступени лада, см. mel()), форма
   «вступление — A — B — A с вариацией — проигрыш-арпеджио — B — A — концовка». Каждый раз чуть по-своему:
   украшения мелодии, перебивки барабанов, арпеджио — от зерна на этот проигрыш.

   Играет, когда для места в public/music нет файлов (music.js: файлы автора важнее). Громкость — CHIP.GAIN
   перед шиной «музыка» (ползунок, приглушение в катсцене / паузе — как у файлов).

   Нагрузка: ноты планируются вперёд (CHIP.LOOK с, при редком таймере — до LOOK_MAX), из таймера music.js
   (100 мс), не из кадра мира. Пэды, бас и лид — постоянные голоса (меняется только высота и громкость),
   новые узлы — только на удар (барабан, аккорд пиано, колокольчик). Телефон (палец) — LITE: голосов меньше,
   без FM, без зала, хэты реже.

     play(ctx, dest, i, secs)  → плеер { i, fade(secs), stop(), left(), pos() }; вступает за secs с
     step()                    — из таймера music.js: планировать ноты у всех живых плееров
     pool(mood) / pick(mood, not) / after(mood, cur) — треки под настроение: menu, day, night, winter, summer, newyear
     name(i), count()          — название трека (на языке игрока), сколько треков
     plate(text) / strip(on, label, api) — плашка «♪ трек» в езде и полоска в главном меню
     DEBUG                     — __dlv.Snd.MUS.chip: STATS, live, render(i, secs) — отрисовать трек без звука (числа) */
import './chiptunes.css';
import { t, N_ } from '../i18n/index.js';

export const CHIP = {
  GAIN: 0.1,           // громкость синтеза перед шиной «музыка» (файлы — music.js MUS.GAIN 0.4); замер — docs/MUSIC.md
  LOOK: 0.35,          // с — ноты планируем вперёд не меньше этого
  LOOK_MAX: 2.5,       // с — и не больше этого (вкладка в фоне: таймер реже — планируем дальше)
  LITE: null,          // null — по устройству (палец — телефон); true / false — силой (проверки)
  PLATE: 2.6,          // с — плашка с названием трека
  TAIL: 1.6,           // с — хвост после последнего такта (пэды гаснут)
  LITE_K: 0.8,         // на телефоне голосов меньше — громкость × столько, чтобы на слух так же
};

/* ═════════════ ноты ═════════════
   Аккорд — римской цифрой от тоники (мажорная гамма): заглавная — мажор, строчная — минор; b — на полтона ниже.
     IVmaj7, iii7, ii9, Vsus, V13, bVIImaj7, iv6, III7 …  Один аккорд — один такт.
   Мелодия — 8 восьмых в такте, такты через «|»: 1…7 — ступень лада трека, b / # — полтона вниз / вверх,
     ' — октава вверх, , — вниз; «-» — тянуть, «.» — пауза. Каждая часть — две фразы по 4 такта.
   Форма: i — вступление (аккорды A, без барабанов и мелодии), A / B — части с мелодией, «+» — с вариацией
     (украшения, тихий подголосок, колокольчики вторят), R / S — проигрыш-арпеджио на аккордах A / B,
     o — концовка (последний аккорд — тоника). Число — сколько тактов. */
const TRACKS = [
  {
    id: 'asphalt', name: N_('Тёплый асфальт'), mood: N_('день, лёгкий бит'),
    bpm: 84, key: 62, mode: 'major', sw: 0.16, lead: 'pulse', leadCut: 2300, keys: 'ep', drums: 'boom', bass: 'lofi',
    comp: 'x.........x.....',
    chords: { A: 'IVmaj7 iii7 ii7 Vsus', B: 'vi7 IVmaj7 ii9 V13' },
    mel: {
      A: ["3 - 5 - 6 - 5 3 | 2 - 3 - . 5 3 2 | 1 - 2 3 - - 2 1 | 5, - - - . . 6, 7,",
        "3 - 5 - 6 - 1' 7 | 6 5 - 3 - . 2 3 | 4 - 3 - 2 - 1 - | 2 - - - . . . ."],
      B: ["6 - 5 6 - 1' - 6 | 5 - 3 - - . 3 5 | 6 - 5 - 4 - 3 - | 2 - - - 5, - 7, -",
        "6 - 1' - 2' - 1' 6 | 5 - - 3 - 5 6 - | 1' - 7 - 6 - 5 - | 6 - - - - - . ."],
    },
    form: 'i4 A8 B8 A8+ R8 B8+ A8 o4',
  },
  {
    id: 'rain', name: N_('Двор после дождя'), mood: N_('день, неспешно'),
    bpm: 76, key: 65, mode: 'major', sw: 0.12, lead: 'soft', leadCut: 2000, keys: 'ep', drums: 'lazy', bass: 'lofi2',
    comp: 'x.......x.......',
    chords: { A: 'Imaj9 IVmaj7 iii7 vi7', B: 'ii7 Vsus Imaj7 bVIImaj7' },
    mel: {
      A: ["5 - - 3 2 - 1 - | 6 - 5 - 3 - - . | 3 - 5 - 7 - 5 - | 6 - - 5 6 - 1' -",
        "1' - 7 - 5 - 3 - | 4 - 6 - 5 - 3 - | 2 - 3 - 5 - 3 2 | 1 - - - . . . ."],
      B: ["2 - 4 - 6 - 5 4 | 5 - - - 4 - 2 - | 3 - 5 - 7 - 1' - | b7 - 6 - 4 - 2 -",
        "6 - 5 - 4 - 2 - | 1 - 2 - 4 - 5 - | 3 - - - 2 - 1 - | 2 - - - - - . ."],
    },
    form: 'i2 A8 B8 A8+ S4 B8 A8 o2',
  },
  {
    id: 'lanterns', name: N_('Фонари на проспекте'), mood: N_('ночь, медленно и глубоко'),
    bpm: 68, key: 69, mode: 'minor', sw: 0.1, lead: 'pulse', leadCut: 1500, keys: 'ep', drums: 'night', bass: 'pulse',
    comp: 'x...............', padCut: 850, echo: 0.42,
    chords: { A: 'i9 bVImaj7 bIIImaj7 bVII6', B: 'iv9 i7 bVImaj7 Vsus' },
    mel: {
      A: ['5 - - - 3 - 2 - | 3 - - - - - 1 - | 2 - 3 - 5 - - - | 4 - - - 3 2 - -',
        '5 - - 6 5 - 3 - | 3 - - - 5 - 6 - | 7 - - - 5 - 3 - | 2 - - - - - . .'],
      B: ['6 - 5 - 4 - 3 - | 1 - - - 3 - 5 - | 6 - - - 5 - 3 - | 4 - - - 2 - - -',
        "1' - 7 - 6 - 4 - | 5 - - - - - 3 5 | 6 - 7 - 1' - 6 - | 5 - - - - - . ."],
    },
    form: 'i4 A8 B8 R8 A8+ B8 o4',
  },
  {
    id: 'snow', name: N_('Снег на антенне'), mood: N_('зима, колокольчики'),
    bpm: 74, key: 67, mode: 'major', sw: 0.12, lead: 'soft', leadCut: 2200, keys: 'ep', drums: 'winter', bass: 'slow',
    comp: 'x.......x.......', bells: true, dbl: true,
    chords: { A: 'Imaj7 iii7 IVmaj7 iv6', B: 'vi7 ii7 Vsus V7' },
    mel: {
      A: ["5 - 3 - 5 - 1' - | 7 - 6 - 5 - 3 - | 6 - 5 - 3 - 2 - | b6, - - - 5, - - .",
        "1' - 7 - 5 - 3 - | 2 - 3 - 5 - 6 - | 5 - - - 3 - 2 - | 1 - - - . . . ."],
      B: ["6 - 5 - 6 - 7 - | 1' - 7 - 6 - 5 - | 4 - 5 - 4 - 2 - | 3 - - - 2 - 7, -",
        "3 - 5 - 6 - 1' - | 2' - 1' - 6 - 5 - | 4 - - - 5 - 6 - | 5 - - - - - . ."],
    },
    form: 'i4 A8 B8+ R8 A8+ B8 o4',
  },
  {
    id: 'beach', name: N_('Пляж на речке'), mood: N_('лето, светло'),
    bpm: 92, key: 60, mode: 'major', sw: 0.05, lead: 'pulse', leadCut: 3000, keys: 'marimba', drums: 'bossa', bass: 'bossa',
    comp: 'x..x..x...x..x..',
    chords: { A: 'Imaj7 II7 ii7 V7', B: 'IVmaj7 iii7 vi9 Vsus' },
    mel: {
      A: ["3 - 5 1' - 7 5 - | #4 - 6 - 1' - 6 - | 4 - 6 - 5 4 3 - | 2 - - 7, 1 2 - -",
        "5 - 3 5 - 6 5 3 | #4 - - 6 - 1' 2' - | 1' - 6 - 4 - 2 - | 7, - - - - - . ."],
      B: ["6 - 5 - 3 - 5 - | 5 - 3 - 2 - 3 - | 1 - 3 - 5 - 7 - | 1' - - - 6 - 5 -",
        "1' - 7 - 6 - 5 - | 3 - 5 - 7 - 5 - | 6 - 5 - 3 - 1 - | 2 - - - - - . ."],
    },
    form: 'i4 A8 B8 A8+ R8 B8+ A8 o4',
  },
  {
    id: 'mandarins', name: N_('Мандарины и куранты'), mood: N_('Новый год'),
    bpm: 88, key: 65, mode: 'major', sw: 0.18, lead: 'pulse', leadCut: 2500, keys: 'ep', drums: 'xmas', bass: 'walk',
    comp: '..x...x...x...x.', bells: true, dbl: true, dblAll: true,
    chords: { A: 'Imaj7 III7 vi7 II7', B: 'IVmaj7 iv6 Imaj7 Vsus' },
    mel: {
      A: ["5 - 3 5 6 5 3 - | 3 - #5 - 7 - 2' - | 6 - 5 - 6 - 1' - | 2' - 1' - 6 - #4 -",
        "5 - 3 5 6 5 1' - | 7 - #5 - 3 - 2 - | 1 - 2 - 3 - 6 - | 5 - - - . . . ."],
      B: ["4 - 6 - 1' - 3' - | 2' - 1' - b6 - 5 - | 3 - 5 - 1' - 3' - | 2' - - - 1' - 5 -",
        "6 - 1' - 3' - 2' 1' | 2' - - b6 - - 4 - | 5 - 3 - 1 - 3 - | 1 - - - - - . ."],
    },
    form: 'i4 A8 B8 A8+ S8 B8+ A8+ o4',
  },
];

/* какие треки под какое настроение (music.js выбирает настроение по месту, времени суток, сезону и празднику) */
const POOL = {
  menu: ['asphalt', 'rain'], day: ['asphalt', 'rain'], night: ['lanterns', 'rain'],
  winter: ['snow', 'asphalt'], winterNight: ['snow', 'lanterns'], summer: ['beach', 'asphalt'], newyear: ['mandarins', 'snow'],
};

/* барабаны на 16 шагов такта: цифра — сила удара (1…9), «.» — тишина.
   k — бочка, s — малый (мягкий), r — римшот, h — хэт, j — бубенцы */
const DRUMS = {
  boom: { k: '9.....6..7......', s: '....8.......8...', h: '6.3.6.3.6.3.6.35' },
  lazy: { k: '8......6..7.....', s: '....7.......7...', h: '5.2.5.2.5.2.5.2.' },
  night: { k: '7.........6.....', r: '........7.......', h: '..3...3...3...3.' },
  winter: { k: '7.......6.......', s: '....5.......5...', j: '4.2.4.2.4.2.4.2.' },
  bossa: { k: '7..5..7.7..5..7.', r: '..6..6....6..6..', h: '3.3.3.3.3.3.3.3.' },
  xmas: { k: '9.....7.9.......', s: '....8.......8...', j: '5.3.5.3.5.3.5.3.' },
};
/* бас на 8 восьмых: R — тоника аккорда, 3 — терция, 5 — квинта, 8 — октава, A — подход к следующему аккорду */
const BASS = {
  lofi: 'R - - 5 . R - A', lofi2: 'R - - - . 5 R -', pulse: 'R - - - - - 5 -',
  slow: 'R - - - 5 - - -', bossa: 'R - . 5 R - . 5', walk: 'R - 3 - 5 - A -',
};
/* арпеджио: номера нот аккорда по восьмым (поочерёдно по 2 такта, выбор — от зерна) */
const ARP = [[0, 1, 2, 3, 2, 1, 2, 1], [0, 2, 1, 3, 2, 1, 0, 1], [3, 2, 1, 0, 1, 2, 3, 2], [0, 1, 2, 1, 3, 2, 1, 2]];

const MODES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const ROMAN = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
const QU = { '': [0, 4, 7], maj7: [0, 4, 7, 11], maj9: [0, 4, 7, 11, 14], 6: [0, 4, 7, 9], 7: [0, 4, 7, 10], 9: [0, 4, 7, 10, 14],
  13: [0, 4, 10, 14, 21], sus: [0, 5, 7, 10], add9: [0, 4, 7, 14] };
const QL = { '': [0, 3, 7], 7: [0, 3, 7, 10], 9: [0, 3, 7, 10, 14], 11: [0, 3, 7, 10, 14, 17], 6: [0, 3, 7, 9], dim: [0, 3, 6, 9] };

const MTOF = new Float32Array(128);
for (let i = 0; i < 128; i++) MTOF[i] = 440 * Math.pow(2, (i - 69) / 12);
const mtof = n => MTOF[Math.max(0, Math.min(127, n | 0))];

function chord (tok, key) {
  const m = /^(b|#)?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/.exec(tok);
  if (!m) throw new Error('аккорд? ' + tok);
  const up = m[2] === m[2].toUpperCase();
  const root = (ROMAN[m[2].toUpperCase()] + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0) + 12) % 12;
  const iv = (up ? QU : QL)[m[3]];
  if (!iv) throw new Error('аккорд? ' + tok);
  const pc = (key + root) % 12;
  // пэд: до 4 нот в окне D3—C#4 (квинта уходит первой — бас и так держит тонику), бас — A1…G#2
  let tones = iv.slice();
  while (tones.length > 4) { const i5 = tones.indexOf(7); tones.splice(i5 > 0 ? i5 : 1, 1); }
  const pad = tones.map(i => { let n = pc + i; while (n < 50) n += 12; while (n >= 62) n -= 12; return n; }).sort((a, b) => a - b);
  return { pc, iv, pad, bass: 33 + ((pc - 9 + 12) % 12) };
}
function mel (str, mode) {
  return str.split('|').map(bar => {
    const tk = bar.trim().split(/\s+/), out = [];
    let last = null;
    for (let e = 0; e < 8; e++) {
      const s = tk[e] || '.';
      if (s === '-') { if (last) last.len += 2; continue; }
      if (s === '.') { last = null; continue; }
      const m = /^(b|#)?([1-7])([',]*)$/.exec(s);
      if (!m) throw new Error('нота? ' + s);
      let n = MODES[mode][+m[2] - 1] + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0);
      for (const c of m[3]) n += c === "'" ? 12 : -12;
      last = { s: e * 2, n, len: 2 };              // в 16-х: начало и длина
      out.push(last);
    }
    return out;
  });
}
/* разобрать трек один раз */
function prep (T) {
  if (T._p) return T._p;
  const ch = k => T.chords[k].split(/\s+/).map(c => chord(c, T.key));
  const A = ch('A'), B = ch('B');
  const O = A.slice(0, 3).concat([chord(T.mode === 'minor' ? 'i9' : 'Imaj9', T.key)]);
  const M = { A: T.mel.A.map(p => mel(p, T.mode)), B: T.mel.B.map(p => mel(p, T.mode)) };
  const form = T.form.split(/\s+/).map(s => { const m = /^([iABRSo])(\d+)(\+?)$/.exec(s); return { k: m[1], n: +m[2], plus: !!m[3] }; });
  const bars = form.reduce((s, f) => s + f.n, 0);
  const pat = s => [...s].map(c => (c === '.' ? 0 : +c / 9));
  const D = DRUMS[T.drums], drums = {};
  for (const k of ['k', 's', 'r', 'h', 'j']) drums[k] = D[k] ? pat(D[k]) : null;
  T._p = { A, B, O, M, form, bars, drums, bass: BASS[T.bass].split(/\s+/), comp: [...T.comp].map(c => c === 'x') };
  return T._p;
}

const rng = seed => { let s = seed | 0; return () => { s = (s + 0x6D2B79F5) | 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; };

/* план проигрыша: на каждый такт — аккорд, что играет, мелодия по шагам (с вариациями этого раза) */
function plan (T, rnd) {
  const p = prep(T), out = [];
  const seen = { A: 0, B: 0 };
  for (const f of p.form) {
    const chords = f.k === 'B' || f.k === 'S' ? p.B : f.k === 'o' ? p.O : p.A;
    const melKey = f.k === 'A' || f.k === 'B' ? f.k : null;
    const vary = melKey ? seen[melKey]++ > 0 || f.plus : false;
    const arpPat = [];
    for (let b = 0; b < f.n; b++) {
      if (!(b & 1)) arpPat[b] = ARP[(rnd() * ARP.length) | 0];
      const bar = {
        k: f.k, plus: f.plus, ch: chords[b % 4], first: b === 0, last: b === f.n - 1, idx: b, n: f.n,
        pad: f.k === 'i' || f.k === 'o' ? 0.9 : f.k === 'R' || f.k === 'S' ? 0.75 : 0.6,
        drums: f.k === 'A' || f.k === 'B' ? 2 : f.k === 'R' || f.k === 'S' ? 1 : 0,
        bass: f.k === 'i' ? (b >= 2 ? 1 : 0) : f.k === 'o' ? (b === f.n - 1 ? 2 : 1) : 1,
        keys: f.k === 'i' || f.k === 'o' ? 1 : 2,
        arp: f.k === 'R' || f.k === 'S' ? 2 : f.plus || ((f.k === 'i' || f.k === 'o') && T.bells) ? 1 : 0,
        arpPat: arpPat[b & ~1],
        dbl: !!(T.dbl && melKey && (f.plus || T.dblAll)),
        fill: (f.k === 'A' || f.k === 'B') && b === f.n - 1 && rnd() < 0.55,
        mel: null,
      };
      if (melKey) {
        const ph = p.M[melKey][(b >> 2) & 1], src = ph[b & 3];
        const at = new Array(16).fill(null);
        for (const e of src) {
          let s = e.s, len = e.len;
          // вариация: подтолкнуть ноту на 16-ю раньше (если перед ней тихо) или украсить нотой-форшлагом сверху
          if (vary && s > 0 && !at[s - 1] && rnd() < 0.14) { s -= 1; len += 1; }
          if (vary && len >= 4 && s > 0 && !at[s - 1] && rnd() < 0.16) at[s - 1] = { n: e.n + (rnd() < 0.5 ? 2 : 1), len: 1, grace: true };
          at[s] = { n: e.n, len };
        }
        // лид — один голос: нота не тянется дальше начала следующей
        let prev = null;
        for (let s = 0; s < 16; s++) if (at[s]) { if (prev && prev.s + prev.e.len > s) prev.e.len = s - prev.s; prev = { s, e: at[s] }; }
        bar.mel = at;
      }
      out.push(bar);
    }
  }
  return out;
}

/* ═════════════ общие буферы на звуковой контекст ═════════════ */
const BUFS = new WeakMap();
function bufs (c) {
  let b = BUFS.get(c);
  if (b) return b;
  const sr = c.sampleRate;
  const mk = (sec, ch = 1) => c.createBuffer(ch, Math.max(1, Math.floor(sr * sec)), sr);
  const noise = mk(1);
  { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  // винил: тёмный шорох + редкие щелчки, петля 4 с
  const vinyl = mk(4);
  {
    const d = vinyl.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < d.length; i++) { lp += (Math.random() * 2 - 1 - lp) * 0.06; d[i] = lp * 0.09; }
    const clicks = 26;
    for (let k = 0; k < clicks; k++) {
      const p = (Math.random() * (d.length - 80)) | 0, a = (0.08 + 0.45 * Math.pow(Math.random(), 3)) * (Math.random() < 0.5 ? -1 : 1);
      for (let j = 0; j < 60; j++) d[p + j] += a * Math.exp(-j / 5);
    }
  }
  // квадрат 25 % для «мурлыки»: гармоники до 16-й, верх приглушён — тёплый чиптюн
  const N = 17, re = new Float32Array(N), im = new Float32Array(N);
  for (let n = 1; n < N; n++) re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * 0.25) / (1 + (n / 9) * (n / 9));
  const pulse = c.createPeriodicWave(re, im);
  b = { noise, vinyl, pulse, ir: null };
  BUFS.set(c, b);
  return b;
}
/* короткий зал (только компьютер): 1,6 с затухающего шума, к концу темнее */
function irOf (c) {
  const b = bufs(c);
  if (b.ir) return b.ir;
  const sr = c.sampleRate, len = Math.floor(sr * 1.6), ir = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) { const x = i / len, k = 0.5 - 0.42 * x; lp += (Math.random() * 2 - 1 - lp) * k; d[i] = lp * Math.pow(1 - x, 2.6) * 0.6; }
  }
  b.ir = ir;
  return ir;
}

export const STATS = { plays: 0, steps: 0, notes: 0, nodes: 0, ms: 0, maxMs: 0, ticks: 0, resync: 0, errors: [] };
const LIVE = [];
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const isLite = () => (CHIP.LITE != null ? !!CHIP.LITE
  : typeof matchMedia === 'function' && (matchMedia('(pointer: coarse)').matches || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 && 'ontouchstart' in window)));

/* ═════════════ плеер одного трека ═════════════ */
function make (c, dest, i, lite, seed) {
  const T = TRACKS[i], p = prep(T), rnd = rng(seed);
  const B = bufs(c);
  const P = { i, T, c, lite, rnd, bars: plan(T, rnd), dt: 60 / T.bpm / 4, step: 0, next: 0, t0: 0, total: p.bars * 16, done: false, dead: false,
    lastWall: 0, oscs: [], nodes: [], endT: Infinity, prevMel: null, offline: false };
  const keep = n => { P.nodes.push(n); return n; };
  const gain = v => { const n = c.createGain(); n.gain.value = v; return keep(n); };
  const filt = (type, f, q) => { const n = c.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return keep(n); };
  const osc = (type, f) => { const o = c.createOscillator(); if (type === 'pulse') o.setPeriodicWave(B.pulse); else o.type = type; o.frequency.value = f; P.oscs.push(o); return keep(o); };

  P.out = gain(0); P.out.connect(dest);
  const tone = filt('lowpass', lite ? 5200 : 7800, 0.5); tone.connect(P.out);
  const mix = gain(1); mix.connect(tone);
  const sc = gain(1); sc.connect(mix); P.sc = sc.gain;                      // сайдчейн: пэды и пиано «дышат» от бочки
  // эхо (на три 16-х) и зал
  const dl = keep(c.createDelay(2)); dl.delayTime.value = P.dt * 3;
  const fb = gain(T.echo || 0.3), dlp = filt('lowpass', 2200, 0.3), dwet = gain(0.5);
  dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(dwet); dwet.connect(mix);
  let verb = null;
  if (!lite) { verb = keep(c.createConvolver()); verb.buffer = irOf(c); const w = gain(0.3); verb.connect(w); w.connect(mix); }
  const send = (src, toDl, toVerb) => {
    if (toDl) { const s = gain(toDl); src.connect(s); s.connect(dl); }
    if (toVerb && verb) { const s = gain(toVerb); src.connect(s); s.connect(verb); }
  };
  // «плавание» плёнки — общий медленный сдвиг высоты (центы)
  const wow = osc('sine', 0.29), wowG = gain(lite ? 0 : 6); wow.connect(wowG);

  // пэды: постоянные голоса, меняется только высота
  const padBus = gain(0), padLP = filt('lowpass', T.padCut || 1100, 0.6);
  P.padG = gain(1); padBus.connect(padLP); padLP.connect(P.padG); P.padG.connect(sc); send(P.padG, 0, 0.5);
  const breath = osc('sine', 0.08), brG = gain(T.padCut ? 180 : 260); breath.connect(brG); brG.connect(padLP.frequency);
  P.pad = [];
  const NV = lite ? 3 : 4;
  for (let v = 0; v < NV; v++) {
    const vg = gain(lite ? 0.085 : 0.045);
    const a = osc(lite ? 'triangle' : 'sawtooth', 220); a.detune.value = lite ? 0 : -7; a.connect(vg); wowG.connect(a.detune);
    let b = null;
    if (!lite) { b = osc('sawtooth', 220); b.detune.value = 7; b.connect(vg); wowG.connect(b.detune); }
    vg.connect(padBus);
    P.pad.push({ a, b });
  }
  P.padBus = padBus;
  // бас: постоянный голос — треугольник (+ саб на компьютере)
  const bLP = filt('lowpass', 480, 0.7), bEnv = gain(0); P.bassG = gain(1); bLP.connect(P.bassG); P.bassG.connect(mix); bEnv.connect(bLP);
  P.bo = osc('triangle', 55); P.bo.connect(bEnv);
  if (!lite) { P.bs = osc('sine', 55); const sg = gain(0.7); P.bs.connect(sg); sg.connect(bEnv); }
  P.bEnv = bEnv.gain;
  // лид: постоянный голос, квадрат 25 % или треугольник, вибрато
  const lBus = gain(T.lead === 'pulse' ? 0.55 : 0.75), lLP = filt('lowpass', T.leadCut || 2400, 0.9), lEnv = gain(0);
  P.lBus = lBus; lEnv.connect(lBus); lBus.connect(lLP); lLP.connect(mix); send(lLP, 0.28, 0.22);
  P.lo = osc(T.lead === 'pulse' ? 'pulse' : 'triangle', 440); P.lo.connect(lEnv); wowG.connect(P.lo.detune);
  if (!lite) { const vib = osc('sine', 5.1), vg = gain(8); vib.connect(vg); vg.connect(P.lo.detune); }
  P.lEnv = lEnv.gain;
  // пиано / маримба и колокольчики — узлы на каждую ноту, шины общие
  P.keys = gain(T.keys === 'marimba' ? 0.5 : 0.42); P.keys.connect(sc); send(P.keys, 0.16, 0.3);
  P.bell = gain(0.6); P.bell.connect(mix); send(P.bell, 0.3, 0.45);
  // барабаны
  P.drum = gain(0.55); P.drum.connect(mix);
  P.hp = filt('highpass', 7000, 0.7); P.hp.connect(P.drum);
  P.bpS = filt('bandpass', 1700, 0.7); P.bpS.connect(P.drum);
  P.bpR = filt('bandpass', 3300, 3.5); P.bpR.connect(P.drum);
  P.bpJ = filt('bandpass', 8800, 1.6); P.bpJ.connect(P.drum);
  // винил — петля
  const vin = keep(c.createBufferSource()); vin.buffer = B.vinyl; vin.loop = true;
  const vinG = gain(0.65); vin.connect(vinG); vinG.connect(P.out); P.vinG = vinG;
  P.vin = vin;
  return P;
}

/* ── голоса ── */
function padChord (P, notes, tt) {
  const n = notes.length;
  for (let v = 0; v < P.pad.length; v++) {
    const f = mtof(notes[v % n] + 12 * Math.floor(v / n));
    P.pad[v].a.frequency.setTargetAtTime(f, tt, 0.05);
    if (P.pad[v].b) P.pad[v].b.frequency.setTargetAtTime(f, tt, 0.05);
  }
}
function bassNote (P, n, tt, dur, vel) {
  const f = mtof(n);
  P.bo.frequency.setValueAtTime(f, tt);
  if (P.bs) P.bs.frequency.setValueAtTime(f, tt);
  P.bEnv.setTargetAtTime(0.13 * vel, tt, 0.006);
  P.bEnv.setTargetAtTime(0.085 * vel, tt + 0.05, 0.14);
  P.bEnv.setTargetAtTime(0, tt + dur * 0.9, 0.035);
  STATS.notes++;
}
function leadNote (P, n, tt, dur, vel, legato) {
  const f = mtof(n);
  if (legato) P.lo.frequency.setTargetAtTime(f, tt, 0.022); else P.lo.frequency.setValueAtTime(f, tt);
  P.lEnv.setTargetAtTime(0.3 * vel, tt, 0.014);
  P.lEnv.setTargetAtTime(0.21 * vel, tt + 0.09, 0.22);
  P.lEnv.setTargetAtTime(0, tt + Math.max(0.05, dur - 0.03), 0.045);
  STATS.notes++;
}
const unhook = n => () => { try { n.disconnect(); } catch (e) { /* — */ } };
function keyNote (P, n, tt, dur, vel) {
  const c = P.c, f = mtof(n), mar = P.T.keys === 'marimba';
  const env = c.createGain(), o = c.createOscillator();
  o.type = P.lite && !mar ? 'triangle' : 'sine'; o.frequency.value = f;
  const end = tt + (mar ? 0.7 : dur + 0.7);
  env.gain.setValueAtTime(0, tt);
  env.gain.linearRampToValueAtTime(0.16 * vel, tt + (mar ? 0.003 : 0.006));
  if (mar) env.gain.setTargetAtTime(0, tt + 0.005, 0.16);
  else { env.gain.setTargetAtTime(0.06 * vel, tt + 0.01, 0.5); env.gain.setTargetAtTime(0, tt + dur, 0.14); }
  o.connect(env); env.connect(P.keys);
  STATS.nodes += 2;
  if (!P.lite && !mar) {                         // FM-звон электропиано: модулятор той же частоты, индекс гаснет
    const m = c.createOscillator(), mg = c.createGain();
    m.frequency.value = f;
    mg.gain.setValueAtTime(f * 1.3 * vel, tt); mg.gain.setTargetAtTime(f * 0.12, tt, 0.22);
    m.connect(mg); mg.connect(o.frequency);
    m.start(tt); m.stop(end);
    STATS.nodes += 2;
  }
  o.onended = unhook(env);
  o.start(tt); o.stop(end);
  STATS.notes++;
}
function bellNote (P, n, tt, vel) {
  const c = P.c, f = mtof(n);
  const parts = P.lite ? 1 : 2;
  for (let k = 0; k < parts; k++) {
    const o = c.createOscillator(), e = c.createGain(), fr = k ? f * 2.76 : f, d = k ? 0.35 : 1.1, v = (k ? 0.35 : 1) * 0.2 * vel;
    o.frequency.value = fr;
    e.gain.setValueAtTime(0, tt); e.gain.linearRampToValueAtTime(v, tt + 0.003); e.gain.setTargetAtTime(0, tt + 0.004, d * 0.4);
    o.connect(e); e.connect(P.bell);
    o.onended = unhook(e);
    o.start(tt); o.stop(tt + d * 2.4);
    STATS.nodes += 2;
  }
  STATS.notes++;
}
function noiseHit (P, dst, tt, vol, dec) {
  const c = P.c, s = c.createBufferSource(), e = c.createGain();
  s.buffer = bufs(c).noise;
  e.gain.setValueAtTime(vol, tt); e.gain.setTargetAtTime(0, tt + 0.002, dec);
  s.connect(e); e.connect(dst);
  s.onended = unhook(e);
  s.start(tt, P.rnd() * 0.6); s.stop(tt + dec * 7 + 0.01);
  STATS.nodes += 2;
}
function kick (P, tt, vel) {
  const c = P.c, o = c.createOscillator(), e = c.createGain();
  o.frequency.setValueAtTime(118, tt); o.frequency.exponentialRampToValueAtTime(44, tt + 0.12);
  e.gain.setValueAtTime(0.0001, tt); e.gain.linearRampToValueAtTime(0.85 * vel, tt + 0.004); e.gain.setTargetAtTime(0, tt + 0.03, 0.09);
  o.connect(e); e.connect(P.drum);
  o.onended = unhook(e);
  o.start(tt); o.stop(tt + 0.5);
  P.sc.setTargetAtTime(0.5, tt, 0.006); P.sc.setTargetAtTime(1, tt + 0.04, 0.16);   // «дыхание»
  STATS.nodes += 2;
}
function snare (P, tt, vel, brush) {
  noiseHit(P, P.bpS, tt, 0.32 * vel, brush ? 0.09 : 0.055);
  if (!P.lite && !brush) {
    const c = P.c, o = c.createOscillator(), e = c.createGain();
    o.frequency.setValueAtTime(190, tt); o.frequency.exponentialRampToValueAtTime(140, tt + 0.06);
    e.gain.setValueAtTime(0.18 * vel, tt); e.gain.setTargetAtTime(0, tt + 0.002, 0.035);
    o.connect(e); e.connect(P.drum); o.onended = unhook(e);
    o.start(tt); o.stop(tt + 0.25);
    STATS.nodes += 2;
  }
}

/* один 16-й шаг: k — номер от начала, tt — когда */
function stepAt (P, k, tt) {
  const bi = (k / 16) | 0, s = k % 16, bar = P.bars[bi];
  if (!bar) return;
  const T = P.T, p = prep(T), dt = P.dt, r = P.rnd;
  const sw = (s & 1) ? T.sw * dt : 0;                         // свинг на нечётные 16-е
  const hum = () => r() * 0.008;                               // «живая» рука: до 8 мс позже
  const v = x => x * (0.92 + r() * 0.16);
  STATS.steps++;
  if (s === 0) {
    padChord(P, bar.ch.pad, tt);
    P.padBus.gain.setTargetAtTime(bar.pad * (bar.k === 'o' && bar.last ? 0.7 : 1), tt, 0.7);
  }
  // барабаны: в проигрыше без малого, в лёгком режиме хэты через один
  if (bar.drums) {
    const D = p.drums;
    if (D.k && D.k[s]) kick(P, tt + sw, v(D.k[s]));
    if (bar.drums > 1 && D.s && D.s[s]) snare(P, tt + sw + hum(), v(D.s[s]), T.drums === 'winter');
    if (D.r && D.r[s] && bar.drums > 1) noiseHit(P, P.bpR, tt + sw + hum(), 0.42 * v(D.r[s]), 0.02);
    if (D.h && D.h[s] && !(P.lite && (s & 1))) noiseHit(P, P.hp, tt + sw + hum(), 0.14 * v(D.h[s]), 0.022);
    if (D.j && D.j[s] && !(P.lite && (s & 2))) { noiseHit(P, P.bpJ, tt + sw + hum(), 0.16 * v(D.j[s]), 0.05); if (!P.lite) noiseHit(P, P.bpJ, tt + sw + 0.028, 0.08 * v(D.j[s]), 0.04); }
    if (bar.fill && s >= 13 && bar.drums > 1) snare(P, tt + sw + hum(), 0.22 + 0.08 * (s - 13), true);
  }
  // бас по восьмым
  if (bar.bass && !(s & 1)) {
    const e = s >> 1, tok = bar.bass === 2 ? (e === 0 ? 'R' : '-') : p.bass[e];
    if (tok !== '-' && tok !== '.') {
      let len = 1;
      const pat = bar.bass === 2 ? null : p.bass;
      while (e + len < 8 && (pat ? pat[e + len] === '-' : true)) len++;
      const nb = P.bars[bi + 1], ch = bar.ch;
      let n = ch.bass;
      if (tok === '5') n += 7; else if (tok === '8') n += 12; else if (tok === '3') n += ch.iv[1];
      else if (tok === 'A') n = nb && nb.ch.bass !== ch.bass ? nb.ch.bass - 1 : ch.bass + 7;
      bassNote(P, n, tt + hum(), len * 2 * dt, v(e === 0 ? 1 : 0.85));
    }
  }
  // пиано: аккорд по рисунку трека (во вступлении и концовке — только раз в такт)
  if (bar.keys && (bar.keys > 1 ? p.comp[s] : s === 0)) {
    let len = 1;
    while (s + len < 16 && !p.comp[s + len]) len++;
    const dur = (bar.keys > 1 ? len : 16) * dt;
    const notes = bar.ch.pad, nn = P.lite ? Math.min(3, notes.length) : notes.length;
    for (let j = notes.length - nn; j < notes.length; j++) keyNote(P, notes[j] + 12, tt + sw + j * 0.008 + hum(), dur, v(s === 0 ? 0.9 : 0.7) * (bar.keys > 1 ? 1 : 0.8));
  }
  // мелодия
  if (bar.mel) {
    const e = bar.mel[s];
    if (e) {
      const n = T.key + e.n, dur = e.len * dt, vel = v(e.grace ? 0.55 : s % 8 === 0 ? 1 : 0.85);
      const legato = P.prevMel != null && P.prevEnd >= k - 0.01;
      if (T.lead === 'ep') keyNote(P, n, tt + hum(), dur, vel);
      else leadNote(P, n, tt + hum(), dur, vel, legato);
      if (bar.dbl && !e.grace) bellNote(P, n + 12, tt + hum(), vel * 0.55);
      P.prevMel = n; P.prevEnd = k + e.len;
    }
  }
  // арпеджио (колокольчики, если есть, иначе пиано): в проигрыше — восьмыми, в вариации — тихо четвертями
  if (bar.arp && !(s & 1) && (bar.arp > 1 || !(s & 2))) {
    const e = s >> 1, notes = bar.ch.pad, pat = bar.arpPat || ARP[0];
    const rest = bar.arp > 1 ? (e & 1 ? 0.3 : 0.08) : 0.25;
    if (r() >= rest) {
      const n = notes[pat[e] % notes.length] + (T.bells ? 24 : 12);
      const vel = v(bar.arp > 1 ? 0.8 : 0.45);
      if (T.bells) bellNote(P, n, tt + sw + hum(), vel); else keyNote(P, n, tt + sw + hum(), 2 * dt, vel * 0.8);
    }
  }
}

function startP (P, at, secs) {
  P.t0 = at; P.next = at;
  const g = P.out.gain;
  g.setValueAtTime(0, at); g.linearRampToValueAtTime(CHIP.GAIN * (P.lite ? CHIP.LITE_K : 1), at + Math.max(0.05, secs));
  for (const o of P.oscs) o.start(at);
  P.vin.start(at, Math.random() * 3);
  P.endT = at + P.total * P.dt;
}
function finish (P) {
  P.done = true;
  const e = P.endT;
  P.padBus.gain.setTargetAtTime(0, e, CHIP.TAIL / 4);
  P.lEnv.setTargetAtTime(0, e, 0.1);
  P.bEnv.setTargetAtTime(0, e, 0.2);
}
function tickP (P) {
  const c = P.c;
  if (!P.offline && c.state !== 'running') return;
  const w0 = now(), tnow = c.currentTime;
  const gap = P.lastWall ? (w0 - P.lastWall) / 1000 : 0.1;
  P.lastWall = w0;
  const look = Math.min(CHIP.LOOK_MAX, Math.max(CHIP.LOOK, gap * 1.8 + 0.1));
  // звук стоял (вкладка в фоне, площадка заглушила) — догнать время без нот прошлого
  if (P.next < tnow - 0.1) {
    const skip = Math.ceil((tnow - P.next) / P.dt);
    P.step += skip; P.next = P.t0 + P.step * P.dt; STATS.resync++;
    if (P.step >= P.total && !P.done) finish(P);
  }
  let n = 0;
  while (!P.done && P.next < tnow + look && n++ < 512) {
    try { stepAt(P, P.step, P.next); } catch (e) { if (STATS.errors.length < 20) STATS.errors.push(String((e && e.message) || e)); }
    P.step++;
    P.next = P.t0 + P.step * P.dt;
    if (P.step >= P.total) finish(P);
  }
  const ms = now() - w0;
  STATS.ms += ms; STATS.ticks++;
  if (ms > STATS.maxMs) STATS.maxMs = ms;
}

/* ═════════════ наружу ═════════════ */
let SEED = (Math.random() * 1e9) | 0;
/** сыграть трек i в dest (вступает за secs с) → плеер */
export function play (c, dest, i, secs = 2.5) {
  const P = make(c, dest, ((i % TRACKS.length) + TRACKS.length) % TRACKS.length, isLite(), SEED = (Math.imul(SEED, 1103515245) + 12345) | 0);
  startP(P, c.currentTime + 0.06, secs);
  LIVE.push(P);
  STATS.plays++;
  tickP(P);
  return {
    i: P.i,
    get id () { return P.T.id; },
    fade (s) {
      const g = P.out.gain, t0 = c.currentTime;
      g.cancelScheduledValues(t0); g.setValueAtTime(g.value, t0); g.linearRampToValueAtTime(0, t0 + Math.max(0.05, s));
    },
    stop () { stopP(P); },
    left: () => Math.max(0, P.endT + CHIP.TAIL - c.currentTime),
    pos: () => ({ bar: (P.step / 16) | 0, bars: P.bars.length, t: +(c.currentTime - P.t0).toFixed(1), dur: +(P.total * P.dt).toFixed(1), sec: (P.bars[(P.step / 16) | 0] || {}).k || '' }),
    get gain () { return +P.out.gain.value.toFixed(3); },
    /* проверки: перескочить на такт bar (конец трека — не ждать 2,5 мин) */
    seek (bar) { const t1 = c.currentTime + 0.05; P.step = Math.max(0, Math.min(P.total - 1, bar * 16)); P.t0 = t1 - P.step * P.dt; P.next = t1; P.endT = P.t0 + P.total * P.dt; },
    get lite () { return P.lite; },
  };
}
function stopP (P) {
  if (P.dead) return;
  P.dead = true;
  for (const o of P.oscs) try { o.stop(); } catch (e) { /* — */ }
  try { P.vin.stop(); } catch (e) { /* — */ }
  for (const n of P.nodes) try { n.disconnect(); } catch (e) { /* — */ }
  P.oscs.length = 0; P.nodes.length = 0;
  const k = LIVE.indexOf(P);
  if (k >= 0) LIVE.splice(k, 1);
}
/** из таймера music.js: планировать ноты */
export function step () { for (let k = LIVE.length - 1; k >= 0; k--) tickP(LIVE[k]); }

export const count = () => TRACKS.length;
export const name = i => (TRACKS[i] ? t(TRACKS[i].name) : '');
const idx = id => TRACKS.findIndex(x => x.id === id);
/** номера треков настроения */
export const pool = mood => (POOL[mood] || POOL.day).map(idx).filter(i => i >= 0);
/** трек под настроение (первый из пула, кроме not) */
export function pick (mood, not = -1) { const P = pool(mood); return P.find(i => i !== not) ?? P[0]; }
/** следующий после cur: по кругу в пуле настроения (cur не в пуле — первый) */
export function after (mood, cur) { const P = pool(mood), k = P.indexOf(cur); return P.length < 2 ? P[0] : P[(k + 1) % P.length]; }

/* ═════════════ плашка и полоска ═════════════ */
let PL = null, PL_T = 0;
/** маленькая плашка «♪ трек» слева внизу (в езде не мешает), на CHIP.PLATE с */
export function plate (text, sub = '') {
  if (typeof document === 'undefined') return;
  if (!PL || !PL.isConnected) {
    PL = document.createElement('div');
    PL.id = 'chip-plate';
    PL.setAttribute('aria-live', 'polite');
    PL.innerHTML = '<i aria-hidden="true">♪</i><b></b><small></small>';
    (document.getElementById('game') || document.body).appendChild(PL);
  }
  PL.querySelector('b').textContent = text;
  const sm = PL.querySelector('small');
  sm.textContent = sub; sm.hidden = !sub;
  PL.classList.remove('on'); void PL.offsetWidth; PL.classList.add('on');
  clearTimeout(PL_T);
  PL_T = setTimeout(() => PL.classList.remove('on'), CHIP.PLATE * 1000);
}
let SP = null;
/** полоска в главном меню: «♪ трек ▶ | выкл»; on — показать; api — { next(), toggle() } */
export function strip (on, label, api, isOff) {
  if (typeof document === 'undefined') return;
  if (!on) { if (SP) SP.hidden = true; return; }
  if (!SP || !SP.isConnected) {
    SP = document.createElement('div');
    SP.id = 'chip-strip';
    SP.innerHTML = '<button type="button" class="cs-next"><i aria-hidden="true">♪</i><b></b><em aria-hidden="true">▶</em></button><button type="button" class="cs-off"></button>';
    SP.querySelector('.cs-next').addEventListener('click', e => { e.stopPropagation(); if (SP._api) SP._api.next(); e.currentTarget.blur(); });
    SP.querySelector('.cs-off').addEventListener('click', e => { e.stopPropagation(); if (SP._api) SP._api.toggle(); e.currentTarget.blur(); });
    document.body.appendChild(SP);
  }
  SP._api = api;
  SP.hidden = false;
  SP.classList.toggle('off', !!isOff);
  const b = SP.querySelector('b'), off = SP.querySelector('.cs-off');
  if (b.textContent !== label) b.textContent = label;
  const ol = isOff ? t('вкл') : t('выкл');
  if (off.textContent !== ol) off.textContent = ol;
  const nb = SP.querySelector('.cs-next');
  nb.title = t('следующий трек'); off.title = isOff ? t('музыка вкл') : t('музыка выкл');
}

/* ═════════════ проверки без звука ═════════════ */
export const DEBUG = {
  CHIP, STATS,
  get TRACKS () { return TRACKS.map(x => ({ id: x.id, name: x.name, bpm: x.bpm, bars: prep(x).bars, sec: Math.round(prep(x).bars * 240 / x.bpm) })); },
  get live () { return LIVE.map(P => ({ id: P.T.id, step: P.step, total: P.total, done: P.done, nodes: P.nodes.length, lite: P.lite })); },
  pool, pick, after,
  /** отрисовать трек i в тишине (OfflineAudioContext) на secs с: громкость (RMS, пик) по секундам и время на планирование.
      Вернёт Promise. sfx — для сравнения: монетка игры (тот же синтез, что у звуков) */
  async render (i = 0, secs = 20, o = {}) {
    const sr = o.sr || 22050, oc = new OfflineAudioContext(1, Math.floor(sr * secs), sr);
    const was = CHIP.LITE; CHIP.LITE = o.lite != null ? !!o.lite : was;
    const P = make(oc, oc.destination, i, isLite(), o.seed || 7);
    CHIP.LITE = was;
    P.offline = true;
    // соло / без инструментов (проверка сведения): o.only — только эти шины, o.mute — без этих
    const BUS = { drum: P.drum, keys: P.keys, bell: P.bell, lead: P.lBus, bass: P.bassG, pad: P.padG, vin: P.vinG };
    for (const k in BUS) if ((o.only && !o.only.includes(k)) || (o.mute && o.mute.includes(k))) BUS[k].gain.value = 0;
    startP(P, 0, 0.05);
    const n0 = STATS.nodes, w0 = now();
    while (!P.done && P.next < secs) { stepAt(P, P.step, P.next); P.step++; P.next = P.t0 + P.step * P.dt; if (P.step >= P.total) finish(P); }
    const ms = now() - w0, nodes = STATS.nodes - n0, steps = P.step;
    const buf = await oc.startRendering();
    const d = buf.getChannelData(0);
    let sum = 0, peak = 0;
    const per = [];
    for (let s0 = 0; s0 < d.length; s0 += sr) {
      let ss = 0;
      const e = Math.min(d.length, s0 + sr);
      for (let j = s0; j < e; j++) { const x = d[j]; ss += x * x; if (Math.abs(x) > peak) peak = Math.abs(x); }
      sum += ss;
      per.push(+Math.sqrt(ss / (e - s0)).toFixed(4));
    }
    stopP(P);
    return { id: TRACKS[i].id, lite: P.lite, rms: +Math.sqrt(sum / d.length).toFixed(4), peak: +peak.toFixed(3), per, schedMs: +ms.toFixed(1), steps, nodes };
  },
};
