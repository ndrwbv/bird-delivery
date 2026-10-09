/* Мини-игра у клиента: подъезд — найти квартиру и подняться на этаж (IDEAS блок 13, 09.10.2026).
   Правила словами — docs/ORDERS.md «Подъезд: подняться на этаж». Когда выпадает и что даёт деньгами — doorstep.js
   (числа — ECON.STAIRS, econ.js); здесь — только сам экран.

   Формат мини-игры песочницы (src/uilab/minigames.js): export default { id, name, note, knobs, mount }.
   mount(root, o, api) → убрать за собой.
     o: { lv (этажей в доме), floor (нужный этаж; 0 — случайный), per (квартир на этаже; 0 — случайно), entr (подъезд; 0 — случайно),
          gop (гопники на площадке), time (с на всё; 0 — по формуле ECON.STAIRS.T), addr, who, K (числа; по умолчанию ECON.STAIRS) }
     api: t, ADULT, log(текст), done(итог) — кончилась (итог: { ok, timeout, fast, tries, t, floor, flat, gop: '' | 'dodge' | 'pay', mode: 'stairs' });
          в игре ещё: setStep(fn(dt)) — время идёт кадрами игры (пауза его стоит; без него — свой rAF),
          setPad(fn(p)) — кнопки геймпада (gamepad.js: a, b, up, down — держат; menuOk, menuUp/Down/Left/Right, menuBack, btnY — нажали),
          paused() — игра на паузе (клавиши не жмутся), sfx(имя) — звук (step, puff, ring, wrong, open, gop, beat, dodge, pay, fail).
   Как играют: схема подъезда сбоку, лифт сломан. Вверх — A / ↑ / пробел / ▲ часто (держать — дыхалка тает, «одышка»),
   вниз — B / ↓ / ▼. На площадке ← → — к двери, A / Enter / тап по двери — позвонить. Табличка на площадке — какие там квартиры.
   Гопники: ← / → в такт стрелкам — обойти; Y / Enter — отдать «чаевые». Бабка в окне комментирует. */
import './stairs.css';
import { inputKind, onInput } from '../../input/glyphs.js';
import { STAIRS as K0 } from '../econ.js';

const N_ = s => s;
const DT_MAX = 0.1;
const X0 = 0.6, X1 = 0.9;            // доли ширины: низ пролёта (площадка) и промежуточная площадка с окном
const rand = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rand(a, b + 1));
const pick = a => a[(Math.random() * a.length) | 0];
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* чужая дверь: кто открыл и что сказал — по тому, где нужная квартира (выше / ниже / на этой же площадке); adult — только во взрослой */
const WRONG = {
  same: [
    { who: N_('бабка'), say: N_('Не нам! Соседняя дверь, касатик.') },
    { who: N_('студент'), say: N_('Не, мы роллы ждём. Это к соседям.') },
    { who: N_('кот'), say: N_('Мяу. (смотрит на соседнюю дверь)') },
  ],
  up: [
    { who: N_('дед'), say: N_('Выше, выше, молодой человек! Тут пенсионеры.') },
    { who: N_('мама'), say: N_('Тише! Ребёнок только уснул! Вам выше.') },
    { who: N_('мужик'), say: N_('Ты чё трезвонишь, я с ночной! Выше иди, бля!'), adult: true },
  ],
  down: [
    { who: N_('соседка'), say: N_('Проскочил! Это ниже, милок.') },
    { who: N_('ребёнок'), say: N_('Ма-ам, дядя заблудился! …Вам ниже!') },
    { who: N_('мужик'), say: N_('Ниже, ёпт! Глаза разуй!'), adult: true },
  ],
};
/* бабка в окне напротив: что говорит на событиях */
const BABKA = {
  start: [N_('Опять лифт сломан! Третий год чинят.'), N_('Пешочком, сынок, пешочком!'), N_('Лифт у нас для красоты, милок.')],
  slow: [N_('Ползёт, как пенсия по почте…'), N_('Шевелись, пицца стынет!')],
  puff: [N_('Молодой, а пыхтит, как паровоз!'), N_('Дыши, касатик, дыши!')],
  over: [N_('Проскочил, торопыга!'), N_('Куда полетел? Мимо!')],
  wrong: [N_('Ну кто ж так звонит…'), N_('Табличку читай, грамотей!')],
  gop: [N_('Опять эти на площадке сидят! Милиции на них нет!')],
  pay: [N_('Тьфу! Откупился!')],
  dodge: [N_('Ловко! Как мой Петя в молодости.')],
  win: [N_('Мне бы такого внучка!'), N_('Вот это я понимаю — доставка!')],
  late: [N_('Всё, проворонил! Сам спускается.')],
};
const GOP = {
  ask: N_('Слышь, есть закурить?'),
  askKid: N_('Слышь, курьер, а пицца с чем? Поделись!'),
  miss: [N_('Куда пошёл? Мы не договорили!'), N_('Э, стоять!')],
  missAdult: [N_('Э, ты чё, самый умный, бля?')],
  pass: N_('Ну и вали, курьер!'),
  paid: N_('Во, нормальный пацан!'),
};

/* пиксельные спрайты (смотрят вправо, низ — ступни): буква — цвет из PAL, точка — пусто */
const PAL = {
  R: '#d8402f', S: '#f2c08a', K: '#33210c', O: '#ff8a2b', x: '#8a5a2a', X: '#d9a25a', B: '#3b4a7a', b: '#1d1a24', W: '#9fdcff',
  G: '#24306a', g: '#141519', w: '#f4f0e6', k: '#1a1a1a', c: '#fff6e0', P: '#c8405e', p: '#f2d36b', C: '#6a5a8a', M: '#7a2a2a',
};
const TOP = [
  '...RRRR...',
  '..RRRRRRR.',
  '...SSSS...',
  '...SSKS...',
  '...SSSS...',
  '..OOOOxXXx',
  '.OOOOOXXXX',
  '.OOOOSXXXX',
  '.OOOOxXXXx',
  '..OOO.....',
  '..BBBB....',
  '..BBBB....',
];
const MAN = {
  stand: TOP.concat(['..BB.BB...', '..BB.BB...', '..BB.BB...', '..bb.bbb..']),
  w1: TOP.concat(['.BB...BB..', '.BB...BB..', 'BB.....BB.', 'bb.....bbb']),
  w2: TOP.concat(['..BBBBB...', '..BB..B...', '..BB......', '..bbb.....']),
  puff: [
    '..........', '..........', '....RRRR..', '...RRRRRRR', '....SSSS..', '..W.SSKS..', '...OSSSS..', '..OOOOxXXx',
    '.OOOOOXXXX', '.OOOOSXXXX', '..OOOxXXXx', '..BBBB....', '..BB.BB...', '..BB.BB...', '..BB.BB...', '..bb.bbb..',
  ],
};
const GOPNIK = [
  '...kkkk...',
  '..kkkkkkk.',
  '...SSSS...',
  '...SSKS...',
  '...SSSS...',
  '..GGGGGG..',
  '.GwGGGGwG.',
  '.GGGGGGGS.',
  'GGGGGGGG..',
  'GwGGGGwG..',
  'GG....GG..',
  'bb....bb..',
];
const BABKA_SPR = [
  '..PPPP..',
  '.PpPPpP.',
  'PPSSSSPP',
  'PSKSSKSP',
  'PSSSSSSP',
  'PSSKKSSP',
  '.PSSSSP.',
  '..CCCC..',
  '.CCCCCC.',
];

/* дом и квартира: этажей lv, квартир на этаже per, подъезд entr (квартиры нумеруются через весь дом), нужный этаж и дверь */
export function plan (o = {}, K = K0) {
  const lv = clamp(Math.round(+o.lv || 9), 2, 30);
  const per = clamp(Math.round(+o.per || pick(K.PER)), 2, 8);
  const entr = clamp(Math.round(+o.entr || rint(1, K.ENTR)), 1, 12);
  const fMax = Math.min(lv, K.FLOOR[1]), fMin = Math.min(K.FLOOR[0], fMax);
  const floor = clamp(Math.round(+o.floor || rint(fMin, fMax)), 1, lv);
  const door = o.door !== undefined ? clamp(+o.door, 0, per - 1) : rint(0, per - 1);
  const first = (entr - 1) * lv * per + 1;                    // первая квартира подъезда
  const flat = first + (floor - 1) * per + door;
  const gopAt = o.gop && floor >= 3 ? rint(1, floor - 2) : 0;  // площадка с гопниками: ниже нужной, не первый этаж
  const time = +o.time > 0 ? +o.time : K.T.base + K.T.floor * (floor - 1) + (gopAt ? K.T.gop : 0);
  return { lv, per, entr, floor, door, first, flat, gopAt, time };
}

export default {
  id: 'stairs', name: 'подъезд: подняться на этаж',
  note: 'Лифт сломан: вверх — A / ↑ / пробел / ▲ часто (держать — дыхалка тает), вниз — B / ↓. На площадке ← → к двери, A / Enter / тап — позвонить. Табличка — какие квартиры на этаже. Гопники: ← → в такт или Y / Enter — откупиться. 5—10 с.',
  knobs: [
    { k: 'lv', label: 'этажей в доме', type: 'num', def: 9, min: 5, max: 16, step: 1 },
    { k: 'floor', label: 'нужный этаж (0 — случайно)', type: 'num', def: 0, min: 0, max: 16, step: 1 },
    { k: 'per', label: 'квартир на этаже (0 — случайно)', type: 'num', def: 0, min: 0, max: 6, step: 1 },
    { k: 'entr', label: 'подъезд (0 — случайно)', type: 'num', def: 0, min: 0, max: 6, step: 1 },
    { k: 'gop', label: 'гопники на площадке', type: 'bool', def: false },
    { k: 'time', label: 'секунд на всё (0 — по формуле)', type: 'num', def: 0, min: 0, max: 30, step: 0.5 },
  ],
  mount (root, o, api) {
    const t = api.t, K = Object.assign({}, K0, o.K || {});
    const P = plan(o, K);
    const { lv, per, floor, flat, first, time: limit } = P;
    const tgt = floor - 1;                                      // площадка нужного этажа (0 — первый этаж)
    const flatAt = (f, i) => first + f * per + i;
    const sfx = n => { try { if (api.sfx) api.sfx(n); } catch (e) { /* — */ } };
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => '&#' + c.charCodeAt(0) + ';');
    const st = {
      t: 0, phase: 'play', y: 0, v: 0, breath: 1, puff: 0, door: -1, walk: 0, lock: 0, arm: 0.35, tries: 0, lastTap: -9,
      upHold: 0, stride: 0, leg: 0, bounce: 0, side: 0, sideT: 0, endT: 0, res: null, sayT: 0, babT: 0, babSay: 0, slowT: 0,
      saidOver: false, cam: -0.12, pad: false, armA: false, last: {},
    };
    const gop = P.gopAt ? { at: P.gopAt, done: false, how: '', state: '', i: 0, dirs: [], w: 0, tt: 0, arm: 0, flash: 0 } : null;
    const doors = new Map();                                    // квартира → { kind: 'wrong' | 'right', t, open }
    const keys = { up: false, down: false, act: false };
    const touch = { up: false, down: false };
    const padH = { up: false, down: false, a: false };

    const box = document.createElement('div');
    box.className = 'sx';
    box.innerHTML =
      '<section class="pp-sheet sx-sheet pp-in">' +
        '<header class="pp-head"><span>' + esc(t('подъезд · лифт не работает')) + '</span><b class="sx-left"></b></header>' +
        '<div class="sx-fuse" aria-hidden="true"><i></i></div>' +
        '<div class="sx-body">' +
          '<div class="sx-slip pp-tilt-l">' +
            '<span class="pp-label">' + esc(t('накладная')) + (o.addr ? ' · ' + esc(o.addr) : '') + '</span>' +
            '<b class="sx-flat" style="--n:' + t('кв. {n}', { n: flat }).length + '">' + esc(t('кв. {n}', { n: flat })) + '</b>' +
            (P.entr > 1 ? '<span class="sx-entr">' + esc(t('подъезд {n}', { n: P.entr })) + '</span>' : '') +
            '<p class="sx-note">' + esc(t('лифт сломан (как всегда)')) + '</p>' +
            '<span class="pp-hint sx-task">' + esc(t('этаж — по табличкам на площадках')) + '</span>' +
          '</div>' +
          '<div class="sx-scene">' +
            '<canvas class="sx-cv"></canvas>' +
            '<div class="sx-breath"><span>' + esc(t('дыхалка')) + '</span><i><b></b></i></div>' +
            '<div class="sx-say" hidden></div>' +
            '<div class="sx-babka" hidden></div>' +
          '</div>' +
        '</div>' +
        '<div class="sx-bar sx-bar-go">' +
          '<button type="button" tabindex="-1" data-a="down" class="sx-b sx-b-down">▼<kbd class="sx-g" data-g="down"></kbd></button>' +
          '<button type="button" tabindex="-1" data-a="up" class="sx-b sx-b-up">▲ ' + esc(t('вверх')) + '<kbd class="sx-g" data-g="up"></kbd></button>' +
          '<button type="button" tabindex="-1" data-a="left" class="sx-b">◀</button>' +
          '<button type="button" tabindex="-1" data-a="right" class="sx-b">▶</button>' +
          '<button type="button" tabindex="-1" data-a="ring" class="sx-b sx-b-ring">🔔<kbd class="sx-g" data-g="ring"></kbd></button>' +
        '</div>' +
        '<div class="sx-bar sx-bar-gop" hidden>' +
          '<button type="button" tabindex="-1" data-a="left" class="sx-b sx-b-dir">◀</button>' +
          '<button type="button" tabindex="-1" data-a="right" class="sx-b sx-b-dir">▶</button>' +
          '<button type="button" tabindex="-1" data-a="pay" class="sx-b sx-b-pay">' + esc(t('отдать «чаевые» −{n} %', { n: Math.round(K.GOP_PAY * 100) })) + '<kbd class="sx-g" data-g="pay"></kbd></button>' +
        '</div>' +
        '<p class="sx-help"></p>' +
      '</section>';
    const q = s => box.querySelector(s);
    const elFuse = q('.sx-fuse i'), elLeft = q('.sx-left'), elSay = q('.sx-say'), elBab = q('.sx-babka'), elHelp = q('.sx-help'), elSheet = q('.sx-sheet');
    const elBreath = q('.sx-breath'), elBreathBar = q('.sx-breath b'), barGo = q('.sx-bar-go'), barGop = q('.sx-bar-gop');
    const cv = q('.sx-cv'), g = cv.getContext('2d');

    /* значки и подсказка по вводу */
    const glyphs = () => {
      const k = inputKind().kind, ps = inputKind().family === 'ps';
      box.dataset.input = k;
      const A = ps ? '✕' : 'A', B = ps ? '○' : 'B', Y = ps ? '△' : 'Y';
      const G = { pad: { up: A, down: B, ring: A, pay: Y }, kb: { up: '↑', down: '↓', ring: 'Enter', pay: 'Enter' } }[k] || {};
      for (const el of box.querySelectorAll('.sx-g')) el.textContent = G[el.dataset.g] || '';
      const kbd = (s, kb) => '<kbd class="pp-key' + (kb ? ' pp-key-kb' : '') + '">' + esc(s) + '</kbd>';
      if (st.phase === 'gop') {
        elHelp.innerHTML = k === 'pad' ? kbd('◀ ▶') + esc(t('в такт — обойти')) + ' · ' + kbd(Y) + esc(t('откупиться'))
          : k === 'kb' ? kbd('← →', 1) + esc(t('в такт — обойти')) + ' · ' + kbd('Enter', 1) + esc(t('откупиться'))
            : esc(t('жми ◀ ▶ в такт — или откупись'));
      } else {
        elHelp.innerHTML = k === 'pad' ? kbd(A) + esc(t('вверх — жми часто')) + ' · ' + kbd(B) + esc(t('вниз')) + ' · ' + kbd('◀ ▶') + esc(t('к двери')) + ' · ' + kbd(A) + esc(t('у двери — звонок'))
          : k === 'kb' ? kbd('↑', 1) + esc(t('вверх — жми часто')) + ' · ' + kbd('↓', 1) + esc(t('вниз')) + ' · ' + kbd('← →', 1) + esc(t('к двери')) + ' · ' + kbd('Enter', 1) + esc(t('звонок'))
            : esc(t('жми ▲ часто · дверь — тап'));
      }
    };
    const pop = el => { if (!el) return; el.classList.remove('sx-pop'); void el.offsetWidth; el.classList.add('sx-pop'); };
    const say = (who, text, cls, dur) => {
      elSay.hidden = false;
      elSay.className = 'sx-say ' + (cls || '');
      elSay.innerHTML = (who ? '<em>' + esc(who) + ':</em> ' : '') + esc(text);
      st.sayT = dur || 2.2;
      pop(elSay);
    };
    const babka = (key, force) => {
      if (!force && st.babT > 0) return;
      const pool = BABKA[key];
      if (!pool) return;
      let s = pick(pool);
      if (pool.length > 1 && s === st.last.bab) s = pool.find(x => x !== s);
      st.last.bab = s;
      elBab.hidden = false;
      elBab.innerHTML = '<em>' + esc(t('бабка')) + ':</em> ' + esc(t(s));
      st.babT = 2.6; st.babSay = 1.2;
      pop(elBab);
    };

    /* ── управление ── */
    function tapUp () {
      if (st.phase !== 'play' || st.arm > 0 || st.lock > 0) return;
      if (st.door >= 0) st.door = -1;
      const gap = st.t - st.lastTap;
      st.lastTap = st.t;
      const vmax = st.puff > 0 ? K.PUFF_V : K.VMAX;
      st.v = Math.min(vmax, Math.max(st.v, 0) + K.TAP * (gap < K.MASH ? K.MASH_K : 1));
      st.breath -= K.BREATH.tap;
      st.bounce = 1;
    }
    function tapDown () {
      if (st.phase !== 'play' || st.arm > 0 || st.lock > 0) return;
      st.door = -1;
      st.lastTap = st.t;
      st.v = Math.max(-K.DOWN_V * 1.2, Math.min(st.v, 0) - K.DOWN_TAP);
    }
    function side (dir) {
      if (st.phase === 'gop') { gopPress(dir); return; }
      if (st.phase !== 'play' || st.arm > 0 || st.lock > 0) return;
      const f = Math.round(st.y);
      if (Math.abs(st.y - f) > K.SNAP) return;                 // посреди пролёта дверей нет
      st.y = f; st.v = 0;
      if (st.door < 0) { if (dir < 0) st.door = per - 1; }
      else { const n = st.door + dir; st.door = n >= per ? -1 : Math.max(0, n); }
    }
    function action () {
      if (st.phase !== 'play') return;
      if (st.door >= 0) ring(); else tapUp();
    }
    function ring () {
      if (st.phase !== 'play' || st.arm > 0 || st.lock > 0 || st.door < 0) return;
      const f = Math.round(st.y), n = flatAt(f, st.door);
      sfx('ring');
      if (n === flat) { doors.set(n, { kind: 'right', t: 99, open: 0 }); finish(true, false); return; }
      st.tries++;
      st.lock = K.WRONG_T;
      doors.set(n, { kind: 'wrong', t: K.WRONG_T + 0.5, open: 0 });
      const rel = f === tgt ? 'same' : f < tgt ? 'up' : 'down';
      const pool = WRONG[rel].filter(w => !w.adult || api.ADULT);
      let w = pick(pool);
      if (pool.length > 1 && w === st.last.wrong) w = pool.find(x => x !== w);
      st.last.wrong = w;
      say(t('кв. {n}', { n }) + ' · ' + t(w.who), t(w.say), 'sx-bad', 2.4);
      setTimeout(() => sfx('wrong'), 180);
      if (Math.random() < 0.5) babka('wrong');
      pop(q('.sx-scene'));
    }

    /* ── гопники ── */
    const setBars = () => { barGo.hidden = st.phase === 'gop'; barGop.hidden = st.phase !== 'gop'; glyphs(); };   // в конце кнопки остаются бледными — лист не прыгает
    function startGop () {
      st.phase = 'gop';
      st.v = 0; st.door = -1;
      gop.state = 'ask'; gop.tt = 0.9; gop.arm = 0.3; gop.i = 0;
      gop.dirs = Array.from({ length: K.GOP_STEPS }, () => (Math.random() < 0.5 ? -1 : 1));
      say(t('гопник'), t(api.ADULT ? GOP.ask : GOP.askKid), 'sx-gop', 2.4);
      babka('gop', true);
      sfx('gop');
      setBars();
    }
    function gopBeat () { gop.state = 'beat'; gop.w = K.GOP_WIN; sfx('beat'); }
    function gopMiss () {
      gop.state = 'miss'; gop.tt = K.GOP_MISS;
      gop.dirs[gop.i] = Math.random() < 0.5 ? -1 : 1;
      say(t('гопник'), t(pick(GOP.miss.concat(api.ADULT ? GOP.missAdult : []))), 'sx-gop', 1.6);
      st.sideT = 0;
      sfx('wrong');
    }
    function gopPress (dir) {
      if (!gop || st.phase !== 'gop' || gop.state !== 'beat') return;
      if (dir !== gop.dirs[gop.i]) { gopMiss(); return; }
      gop.i++; gop.flash = 0.25;
      st.side = dir; st.sideT = 0.28;
      sfx('dodge');
      if (gop.i >= gop.dirs.length) { gopPass('dodge'); return; }
      gop.state = 'ok'; gop.tt = 0.12;
    }
    function pay () {
      if (!gop || st.phase !== 'gop' || gop.arm > 0) return;
      gopPass('pay');
    }
    function gopPass (how) {
      gop.done = true; gop.how = how; gop.state = '';
      st.phase = 'play';
      st.y = gop.at + 0.04; st.v = how === 'dodge' ? 0.9 : 0.6;
      st.lastTap = st.t;
      say(t('гопник'), t(how === 'pay' ? GOP.paid : GOP.pass), 'sx-gop', 1.6);
      babka(how === 'pay' ? 'pay' : 'dodge', true);
      sfx(how === 'pay' ? 'pay' : 'dodge');
      setBars();
    }
    function gopStep (dt) {
      gop.arm -= dt;
      if (gop.flash > 0) gop.flash -= dt;
      if (gop.state === 'ask' || gop.state === 'miss' || gop.state === 'ok') { gop.tt -= dt; if (gop.tt <= 0) gopBeat(); }
      else if (gop.state === 'beat') { gop.w -= dt; if (gop.w <= 0) gopMiss(); }
    }

    /* ── конец ── */
    function finish (ok, timeout) {
      if (st.phase === 'end' || st.phase === 'done') return;
      st.phase = 'end';
      const fast = ok && !timeout && st.tries === 0 && st.t <= limit * K.FAST;
      st.res = { ok, timeout: !!timeout, fast, tries: st.tries, t: +st.t.toFixed(2), limit: +limit.toFixed(2), floor, flat, gop: gop ? gop.how : '', mode: 'stairs' };
      st.endT = 1.4;
      setBars();
      box.classList.add(ok ? 'sx-ok' : 'sx-late');
      const seal = document.createElement('div');
      seal.className = 'pp-seal ' + (ok ? 'pp-seal-green' : 'pp-seal-rust') + ' sx-seal';
      seal.textContent = ok ? (fast ? t('с ветерком!') : t('дошёл')) : t('сам спустится');
      elSheet.appendChild(seal);
      if (ok) say(t('клиент'), t('О, пицца! Даже не запыхался?'), 'sx-good', 9);
      else say(t('клиент'), t('Да стой ты там, сам спущусь…'), 'sx-bad', 9);
      babka(ok ? 'win' : 'late', true);
      sfx(ok ? 'open' : 'fail');
      api.log && api.log((ok ? 'дошёл' : 'не успел') + ' за ' + st.res.t + ' из ' + st.res.limit + ' с, этаж ' + floor + ', ошибок ' + st.tries + (fast ? ', быстро' : '') + (gop ? ', гопники: ' + (gop.how || '—') : ''));
    }

    /* ── шаг ── */
    const held = k => k === 'up'
      ? keys.up || (keys.act && st.door < 0) || padH.up || (padH.a && st.armA && st.door < 0) || touch.up
      : keys.down || padH.down || touch.down;
    function climb (dt) {
      const lock = st.lock > 0;
      if (lock) st.lock -= dt;
      const up = !lock && st.arm <= 0 && held('up'), down = !lock && st.arm <= 0 && held('down');
      st.upHold = up ? st.upHold + dt : 0;
      const puffing = st.puff > 0;
      if (puffing) { st.puff -= dt; st.breath += K.BREATH.rest * dt; }
      if (down) {
        st.v += (-K.DOWN_V - st.v) * Math.min(1, 10 * dt);
        if (st.door >= 0) st.door = -1;
      } else if (up && st.upHold > K.HOLD_MIN && st.door < 0) {
        const want = puffing ? K.PUFF_V : K.HOLD_V;
        if (st.v < want) st.v += (want - st.v) * Math.min(1, 6 * dt); else st.v *= Math.exp(-K.DECAY * dt);
        st.breath -= K.BREATH.hold * dt;
      } else {
        st.v *= Math.exp(-K.DECAY * dt);
        const fr = st.y - Math.round(st.y);
        // не жмёшь — у площадки сам останавливаешься (проскочить можно только с разгона)
        if (st.t - st.lastTap > 0.2 && Math.abs(fr) < 0.12 && Math.abs(st.v) < 1) st.v *= Math.exp(-12 * dt);
        if (Math.abs(st.v) < 0.04) st.v = 0;
        if (!puffing && st.v <= 0.2) st.breath += K.BREATH.rest * dt;
      }
      if (puffing && st.v > K.PUFF_V) st.v = K.PUFF_V;
      st.breath = clamp(st.breath, 0, 1);
      if (st.breath <= 0 && !puffing) {
        st.puff = K.PUFF_T;
        say(t('курьер'), t('уф… уф… щас…'), 'sx-me', 1.4);
        babka('puff');
        sfx('puff');
      }
      const y0 = st.y;
      if (Math.abs(st.walk) < 0.01 || st.door >= 0) st.y += st.v * dt;   // от двери сначала дойти до лестницы
      else if (st.door < 0 && st.v !== 0) st.leg += dt;
      if (st.y < 0) { st.y = 0; st.v = Math.max(0, st.v); }
      if (st.y > lv - 1) { st.y = lv - 1; st.v = Math.min(0, st.v); }
      if (gop && !gop.done && y0 < gop.at && st.y >= gop.at) { st.y = gop.at; startGop(); return; }
      if (Math.abs(st.v) > 0.05 && st.door >= 0) st.door = -1;
      st.stride += Math.abs(st.y - y0);
      st.leg += Math.abs(st.y - y0);
      if (st.stride > 0.25) { st.stride -= 0.25; sfx('step'); }
      if (!st.saidOver && st.y > tgt + 0.6) { st.saidOver = true; babka('over', true); }
      if (st.y < tgt - 0.5 && Math.abs(st.v) < 0.15 && st.t > 1.5 && !lock) st.slowT += dt; else if (st.slowT > 0) st.slowT = 0;
      if (st.slowT > 1.6) { babka('slow'); st.slowT = -4; }
    }

    function step (dt) {
      dt = clamp(dt, 0, DT_MAX);
      if (st.phase === 'done') return;
      if (st.sayT > 0) { st.sayT -= dt; if (st.sayT <= 0) elSay.hidden = true; }
      if (st.babT > 0) { st.babT -= dt; if (st.babT <= 0) elBab.hidden = true; }
      if (st.babSay > 0) st.babSay -= dt;
      for (const [n, d] of doors) {
        d.t -= dt;
        d.open += ((d.t > 0 ? (d.kind === 'right' ? 1 : 0.42) : 0) - d.open) * Math.min(1, dt * 9);
        if (d.t <= 0 && d.open < 0.02) doors.delete(n);
      }
      if (st.phase === 'end') {
        st.endT -= dt;
        anim(dt); draw();
        if (st.endT <= 0) { st.phase = 'done'; api.done && api.done(st.res); }
        return;
      }
      st.t += dt; st.arm -= dt;
      const left = Math.max(0, limit - st.t);
      elFuse.style.transform = 'scaleX(' + (left / limit).toFixed(3) + ')';
      elFuse.parentNode.classList.toggle('sx-hot', left < limit * 0.3);
      elLeft.textContent = t('{n} с', { n: left.toFixed(1).replace('.', ',') });
      if (left <= 0) { finish(false, true); anim(dt); draw(); return; }
      if (st.phase === 'gop') gopStep(dt); else climb(dt);
      elBreathBar.style.transform = 'scaleX(' + st.breath.toFixed(3) + ')';
      elBreath.classList.toggle('sx-low', st.breath < 0.3 || st.puff > 0);
      elBreath.classList.toggle('sx-puff', st.puff > 0);
      anim(dt); draw();
    }

    /* анимация: курьер идёт к двери и обратно, ноги, отскок */
    function anim (dt) {
      const want = st.door >= 0 ? doorX(st.door) - X0 : 0;
      const d = want - st.walk, sp = 1.6 * dt;
      st.walk = Math.abs(d) <= sp ? want : st.walk + Math.sign(d) * sp;
      if (Math.abs(d) > 0.001) st.leg += sp * 0.9;
      if (st.bounce > 0) st.bounce = Math.max(0, st.bounce - dt * 7);
      if (st.sideT > 0) st.sideT -= dt;
      const camWant = clamp(st.y - 0.45, -0.12, Math.max(-0.12, lv - 1.6));
      st.cam += (camWant - st.cam) * Math.min(1, dt * 7);
    }

    /* ── рисование: подъезд в разрезе ── */
    let W = 0, H = 0, FH = 1, U = 2, dpr = 1;
    const doorX = i => 0.03 + (i + 0.5) * 0.53 / per;          // середина двери, доля ширины
    const sy = h => H * 0.86 - (h - st.cam) * FH;
    const hash = n => { let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
    function spr (rows, cx, by, u, flip, pal) {
      const h = rows.length, w = rows[0].length;
      const L = Math.round(cx - w * u / 2), T = Math.round(by - h * u);
      for (let r = 0; r < h; r++) {
        const row = rows[r];
        for (let c = 0; c < w; c++) {
          const ch = row[c];
          if (ch === '.') continue;
          g.fillStyle = (pal && pal[ch]) || PAL[ch];
          g.fillRect(L + (flip ? w - 1 - c : c) * u, T + r * u, u, u);
        }
      }
    }
    const font = px => g.font = Math.round(px) + 'px "Press Start 2P", ui-monospace, monospace';
    function flight (xa, ha, xb, hb, n, fill, nose, rail) {
      const dx = (xb - xa) / n, dh = (hb - ha) / n, th = 0.1;
      g.beginPath();
      g.moveTo(xa, sy(ha));
      for (let i = 0; i < n; i++) { const x = xa + dx * i, h = ha + dh * (i + 1); g.lineTo(x, sy(h)); g.lineTo(x + dx, sy(h)); }
      g.lineTo(xb, sy(hb - th)); g.lineTo(xa, sy(ha - th)); g.closePath();
      g.fillStyle = fill; g.fill();
      g.fillStyle = nose;
      for (let i = 0; i < n; i++) { const x = xa + dx * i, h = ha + dh * (i + 1); g.fillRect(Math.min(x, x + dx), sy(h), Math.abs(dx), Math.max(1, U * 0.6)); }
      // перила: балясины и поручень
      g.fillStyle = '#2d2a26';
      for (let i = 1; i < n; i += 2) { const x = xa + dx * (i + 0.5), h = ha + dh * (i + 1); g.fillRect(x - U * 0.3, sy(h + 0.3), Math.max(1, U * 0.6), sy(h) - sy(h + 0.3)); }
      g.strokeStyle = rail; g.lineWidth = Math.max(2, U * 1.1); g.lineCap = 'round';
      g.beginPath(); g.moveTo(xa, sy(ha + 0.3)); g.lineTo(xb, sy(hb + 0.3)); g.stroke();
    }
    function door (f, i) {
      const n = flatAt(f, i), cx = doorX(i) * W;
      const dw = Math.min(W * 0.38 / per, FH * 0.3), top = sy(f + 0.5), bot = sy(f), dh = bot - top;
      const L = cx - dw / 2;
      const kinds = ['#7a3b2a', '#5b4636', '#7f858c', '#6b2f3f', '#4a5b3a'];
      const col = kinds[(hash(n) * kinds.length) | 0];
      g.fillStyle = '#33210c'; g.fillRect(L - U, top - U, dw + 2 * U, dh + U);       // коробка
      const d = doors.get(n), open = d ? d.open : 0;
      if (open > 0.01) {
        g.fillStyle = '#120c08'; g.fillRect(L, top, dw, dh);
        if (d.kind === 'wrong') { g.fillStyle = '#fff6e0'; g.fillRect(L + dw * 0.12, top + dh * 0.3, U, U); g.fillRect(L + dw * 0.12 + U * 2, top + dh * 0.3, U, U); }
        else spr(['.SSSS.', 'SSKSKS', 'SSSSSS', 'SKSSKS', '.SKKS.', '.OOOO.', 'OOOOOO', 'OOOOOO', 'OOOOOO'], L + dw * 0.3, bot - dh * 0.15, Math.max(1, U * 0.9), false);
      }
      const w = dw * (1 - open * 0.85);
      g.fillStyle = col; g.fillRect(L + dw - w, top, w, dh);
      if (w > dw * 0.5) {
        // дерматин с гвоздиками, ручка, табличка с номером
        g.fillStyle = 'rgba(0,0,0,.18)';
        for (let yy = top + dh * 0.12; yy < bot - dh * 0.08; yy += dh * 0.16) for (let xx = L + dw * 0.2; xx < L + dw * 0.85; xx += dw * 0.3) g.fillRect(xx, yy, Math.max(1, U * 0.6), Math.max(1, U * 0.6));
        g.fillStyle = '#ffd85e'; g.fillRect(L + dw * 0.8, top + dh * 0.52, U * 1.2, U * 0.8);
        const s = String(n), fs = Math.max(5 * dpr, Math.min(clamp(FH * 0.06, 8 * dpr, 13 * dpr), W * 0.5 / per / (s.length + 0.4)));   // узкие двери (6 на этаже, телефон) — мельче, но номер целиком
        font(fs);
        const tw = g.measureText(s).width;
        g.fillStyle = '#fff3d6'; g.fillRect(cx - tw / 2 - U, top + dh * 0.1, tw + 2 * U, fs + 2 * U);
        g.fillStyle = '#33210c'; g.textAlign = 'center'; g.textBaseline = 'top';
        g.fillText(s, cx, top + dh * 0.1 + U * 1.2);
      }
      // выбранная дверь — жёлтая обводка (геймпад и клавиатура)
      if (st.door === i && Math.round(st.y) === f && st.phase !== 'gop') {
        g.strokeStyle = '#ffd85e'; g.lineWidth = Math.max(2, U * 1.2);
        g.strokeRect(L - U * 2, top - U * 2, dw + U * 4, dh + U * 2);
      }
    }
    function wall (f) {
      const top = sy(f + 1), bot = sy(f);
      g.fillStyle = '#efe6cf'; g.fillRect(0, top, W, bot - top);
      const pan = sy(f + 0.42);
      g.fillStyle = '#6f9a7a'; g.fillRect(0, pan, W, bot - pan);
      g.fillStyle = '#4c7356'; g.fillRect(0, pan, W, Math.max(2, U * 0.8));
      // окно на промежуточной площадке
      const wx = W * (X0 + X1) / 2, ww = W * 0.12, wt = sy(f + 0.92), wb = sy(f + 0.58);
      g.fillStyle = '#33210c'; g.fillRect(wx - ww / 2 - U, wt - U, ww + 2 * U, wb - wt + 2 * U);
      g.fillStyle = '#ffb36b'; g.fillRect(wx - ww / 2, wt, ww, wb - wt);
      g.fillStyle = '#ff8a5e'; g.fillRect(wx - ww / 2, wt + (wb - wt) * 0.55, ww, (wb - wt) * 0.45);
      g.fillStyle = '#33210c'; g.fillRect(wx - U * 0.5, wt, U, wb - wt); g.fillRect(wx - ww / 2, wt + (wb - wt) * 0.45, ww, U);
      // этаж — трафаретом, табличка «кв. a—b» над дверями
      const fsN = clamp(FH * 0.12, 12 * dpr, 28 * dpr);
      font(fsN); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.fillStyle = 'rgba(160, 50, 40, .55)'; g.fillText(String(f + 1), W * 0.012, sy(f + 0.62));
      const a = flatAt(f, 0), b = flatAt(f, per - 1);
      const txt = t('кв. {a}—{b}', { a, b }), fs = clamp(FH * 0.075, 9 * dpr, 16 * dpr);
      font(fs);
      const tw = g.measureText(txt).width, cx = W * 0.285, sTop = sy(f + 0.74);
      g.fillStyle = '#33210c'; g.fillRect(cx - tw / 2 - U * 3, sTop - U, tw + U * 6, fs + U * 6);
      g.fillStyle = f === Math.round(st.y) ? '#2f5fb0' : '#284f92'; g.fillRect(cx - tw / 2 - U * 2, sTop, tw + U * 4, fs + U * 4);
      g.fillStyle = '#fff6e0'; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(txt, cx, sTop + U * 2);
      for (let i = 0; i < per; i++) door(f, i);
      if (f === 0) {   // входная дверь подъезда
        const L = W * 0.925, w = W * 0.06, tp = sy(0.48);
        g.fillStyle = '#33210c'; g.fillRect(L - U, tp - U, w + 2 * U, bot - tp + U);
        g.fillStyle = '#4b5a66'; g.fillRect(L, tp, w, bot - tp);
        g.fillStyle = '#9fdcff'; g.fillRect(L + w * 0.25, tp + (bot - tp) * 0.12, w * 0.5, (bot - tp) * 0.2);
      }
    }
    function draw () {
      const r = cv.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(50, Math.round(r.width * dpr)), h = Math.max(50, Math.round(r.height * dpr));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      W = w; H = h; FH = H / 2.35; U = Math.max(2, Math.round(FH / 44));
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#2a1d14'; g.fillRect(0, 0, W, H);
      const fLo = Math.max(0, Math.floor(st.cam - 0.5)), fHi = Math.min(lv - 1, Math.ceil(st.cam + 2.3));
      for (let f = fLo; f <= fHi; f++) wall(f);
      // крыша над последним этажом, подвал под первым
      if (sy(lv) > 0) { g.fillStyle = '#3a2a1e'; g.fillRect(0, 0, W, sy(lv)); g.fillStyle = '#8a7f72'; g.fillRect(0, sy(lv) - U * 2, W, U * 3); }
      if (sy(0) < H) { g.fillStyle = '#3a2a1e'; g.fillRect(0, sy(0), W, H - sy(0)); }
      // промежуточные площадки и пролёты: дальний (назад к площадке выше) — темнее, за курьером
      const n = 7, fr = st.y - Math.floor(st.y), onBack = fr >= 0.5 && st.phase !== 'gop';
      for (let f = fLo; f <= Math.min(fHi, lv - 2); f++) {
        g.fillStyle = '#8a7f72'; g.fillRect(W * X1, sy(f + 0.5), W * (1 - X1), FH * 0.07);
        flight(W * X1, f + 0.5, W * X0, f + 1, n, '#6e675e', '#7f786e', '#4a3220');
      }
      if (onBack) man();
      for (let f = fLo; f <= Math.min(fHi, lv - 2); f++) flight(W * X0, f, W * X1, f + 0.5, n, '#a39a8c', '#c4bba9', '#6b4426');
      for (let f = fLo; f <= fHi; f++) {
        g.fillStyle = '#8a7f72'; g.fillRect(0, sy(f), W * X0 + U, FH * 0.07);
        g.fillStyle = '#5e564c'; g.fillRect(0, sy(f) + FH * 0.07 - U * 0.6, W * X0 + U, U * 0.6);
      }
      if (gop) gopniks();
      if (!onBack) man();
      if (gop && st.phase === 'gop') arrows();
      babkaWin();
    }
    function man () {
      const y = st.y, f = Math.floor(y), fr = y - f;
      let x = fr < 0.5 ? lerp(X0, X1, fr / 0.5) : lerp(X1, X0, (fr - 0.5) / 0.5);
      let flip = fr >= 0.5;                                     // вверх по ближнему пролёту — вправо, по дальнему — влево
      if (fr < 0.02 && st.phase !== 'gop') {
        const want = st.door >= 0 ? doorX(st.door) - X0 : 0;
        x = X0 + st.walk;
        if (st.walk < -0.001) flip = want < st.walk - 0.001 || (st.door >= 0 && Math.abs(want - st.walk) <= 0.002);   // к двери и у двери — лицом к ней
      }
      if (st.phase === 'gop') x = X0 - 0.07;                    // гопники сидят на ступеньках — стоит перед ними
      let px = x * W;
      if (st.sideT > 0) px += st.side * U * 4 * Math.sin((1 - st.sideT / 0.28) * Math.PI);
      const moving = Math.abs(st.v) > 0.08 || Math.abs(st.walk - (st.door >= 0 ? doorX(st.door) - X0 : 0)) > 0.002;
      const frame = st.puff > 0 ? MAN.puff : moving ? ((st.leg * 14) | 0) % 2 ? MAN.w1 : MAN.w2 : MAN.stand;
      const lift = st.bounce * U * 1.5;
      spr(frame, px, sy(y) - lift, U, flip);
    }
    function gopniks () {
      const f = gop.at, base = sy(f);
      const xa = W * X0 + U * 3, xb = W * X0 + W * 0.085;
      const g1 = api.ADULT ? GOPNIK.map((r, i) => (i === 4 ? '...SSSSc..' : r)) : GOPNIK;
      spr(g1, xa, base, U, true);
      spr(GOPNIK, xb, sy(f + 0.12), U, true, { G: '#141519', w: '#e8e8e8' });
      if (api.ADULT) {   // дымок сигареты
        g.fillStyle = 'rgba(240,240,240,.5)';
        const tt = st.t * 2;
        for (let i = 0; i < 3; i++) g.fillRect(xa - U * (2 + i) + Math.sin(tt + i) * U, base - U * (13 + i * 2.2) - ((tt * 4) % (U * 2)), U, U);
      }
    }
    function arrows () {
      if (gop.state !== 'beat' && gop.state !== 'ok' && gop.state !== 'miss') return;
      const cx = W * X0 + W * 0.04, cy = sy(gop.at) - FH * 0.62;
      const R = U * 9, k = gop.state === 'beat' ? Math.max(0, gop.w / K.GOP_WIN) : 1;
      const dir = gop.dirs[Math.min(gop.i, gop.dirs.length - 1)];
      g.fillStyle = gop.state === 'miss' ? 'rgba(217,52,44,.9)' : '#fff3d6';
      g.strokeStyle = '#33210c'; g.lineWidth = Math.max(2, U);
      g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill(); g.stroke();
      if (gop.state === 'beat') {   // кольцо сжимается — сколько осталось на эту стрелку
        g.strokeStyle = k < 0.35 ? '#d9342c' : '#ff8a2b'; g.lineWidth = Math.max(3, U * 1.4);
        g.beginPath(); g.arc(cx, cy, R + U * 2 + R * 1.2 * k, 0, Math.PI * 2); g.stroke();
      }
      g.fillStyle = gop.state === 'miss' ? '#fff3d6' : '#33210c';
      g.beginPath();
      const a = R * 0.55;
      g.moveTo(cx + dir * a, cy); g.lineTo(cx - dir * a * 0.6, cy - a); g.lineTo(cx - dir * a * 0.6, cy + a); g.closePath(); g.fill();
      // точки: сколько уже обошёл
      for (let i = 0; i < gop.dirs.length; i++) {
        g.fillStyle = i < gop.i ? '#4fd65a' : 'rgba(255,243,214,.6)';
        g.fillRect(cx - (gop.dirs.length * 4 * U) / 2 + i * 4 * U + U, cy + R + U * 3, U * 2.4, U * 2.4);
      }
    }
    function babkaWin () {
      const u = Math.max(2, Math.round(U * 1.2)), fw = 12 * u, fh = 12 * u, L = U * 3, T = H - fh - U * 3;
      g.fillStyle = '#33210c'; g.fillRect(L - u, T - u, fw + 2 * u, fh + 2 * u);
      g.fillStyle = '#ffcf8a'; g.fillRect(L, T, fw, fh);
      const rows = st.babSay > 0 && ((st.t * 8) | 0) % 2 ? BABKA_SPR.map((r, i) => (i === 5 ? 'PSSMMSSP' : r)) : BABKA_SPR;
      spr(rows, L + fw / 2, T + fh, u, false);
      g.fillStyle = '#ff5fa2'; g.fillRect(L, T, u * 2, fh); g.fillRect(L + fw - u * 2, T, u * 2, fh);   // занавески
      g.fillStyle = '#8a5a2a'; g.fillRect(L - u * 2, T + fh, fw + 4 * u, u * 1.5);                       // подоконник
      elBab.style.setProperty('--sx-bab-l', ((L + fw + u * 3) / dpr) + 'px');
    }

    /* ── ввод ── */
    const onKey = e => {
      if ((st.phase !== 'play' && st.phase !== 'gop') || (api.paused && api.paused())) return;
      const c = e.code;
      let k = null;
      if (c === 'ArrowUp' || c === 'KeyW') k = 'up';
      else if (c === 'ArrowDown' || c === 'KeyS') k = 'down';
      else if (c === 'ArrowLeft' || c === 'KeyA') k = 'left';
      else if (c === 'ArrowRight' || c === 'KeyD') k = 'right';
      else if (c === 'Space') k = 'act';
      else if (c === 'Enter' || c === 'NumpadEnter' || c === 'KeyE') k = 'ring';
      else if (c === 'KeyY') k = 'pay';
      else if (c === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); return; }   // карта — не во время мини-игры
      if (!k) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat) return;
      if (k === 'up') { keys.up = true; tapUp(); }
      else if (k === 'down') { keys.down = true; tapDown(); }
      else if (k === 'left') side(-1);
      else if (k === 'right') side(1);
      else if (k === 'act') { keys.act = true; if (st.phase === 'play') action(); }
      else if (k === 'ring') { if (st.phase === 'gop') pay(); else action(); }
      else if (k === 'pay') pay();
    };
    const onKeyUp = e => {
      const c = e.code;
      if (c === 'ArrowUp' || c === 'KeyW') keys.up = false;
      else if (c === 'ArrowDown' || c === 'KeyS') keys.down = false;
      else if (c === 'Space') keys.act = false;
    };
    const onBlur = () => { keys.up = keys.down = keys.act = false; touch.up = touch.down = false; };
    addEventListener('keydown', onKey, true);
    addEventListener('keyup', onKeyUp, true);
    addEventListener('blur', onBlur);

    function pad (p) {
      if (st.phase !== 'play' && st.phase !== 'gop') return;
      if (!p.a) st.armA = true;                                 // A держали ещё в машине (нитро) — не считаем, пока не отпустят
      padH.a = !!p.a; padH.up = !!p.up; padH.down = !!(p.b || p.down);
      if (p.menuOk || p.menuBack || p.btnY || p.menuUp || p.menuDown || p.menuLeft || p.menuRight) st.pad = true;
      if (st.phase === 'gop') {
        if (p.menuLeft) side(-1);
        if (p.menuRight) side(1);
        if (p.btnY) pay();
        return;
      }
      if (p.menuOk && st.armA) action();
      else if (p.menuUp) tapUp();
      if (p.menuDown || p.menuBack) tapDown();
      if (p.menuLeft) side(-1);
      if (p.menuRight) side(1);
    }

    /* палец и мышь: кнопки внизу (▲ ▼ держать можно), тап по двери своей площадки — подойти и позвонить, тап по лестнице — вверх */
    const BTN = { up: () => { touch.up = true; tapUp(); }, down: () => { touch.down = true; tapDown(); }, left: () => side(-1), right: () => side(1),
      ring: () => (st.door >= 0 ? ring() : side(-1)), pay: () => pay() };
    const release = () => { touch.up = false; touch.down = false; };
    box.addEventListener('pointerdown', e => {
      if (api.paused && api.paused()) return;
      const b = e.target.closest('button');
      if (b && BTN[b.dataset.a]) { e.preventDefault(); BTN[b.dataset.a](); pop(b); return; }
      if (e.target !== cv || st.phase !== 'play') return;
      e.preventDefault();
      const r = cv.getBoundingClientRect(), px = (e.clientX - r.left) * dpr, py = (e.clientY - r.top) * dpr;
      const f = Math.round(st.y);
      if (Math.abs(st.y - f) <= K.SNAP && py < sy(f) && py > sy(f + 0.62)) {
        for (let i = 0; i < per; i++) {
          const cx = doorX(i) * W, dw = Math.min(W * 0.38 / per, FH * 0.3);
          if (Math.abs(px - cx) < dw / 2 + U * 3) {
            if (st.arm > 0 || st.lock > 0) return;
            st.y = f; st.v = 0; st.door = i; ring();
            return;
          }
        }
      }
      touch.up = true; tapUp();
    });
    addEventListener('pointerup', release, true);
    addEventListener('pointercancel', release, true);

    root.appendChild(box);
    glyphs();
    const offInput = onInput(glyphs);
    let raf = 0, last = 0;
    if (api.setStep) api.setStep(step);
    else {
      const loop = now => { raf = requestAnimationFrame(loop); step(last ? (now - last) / 1000 : 0); last = now; };
      raf = requestAnimationFrame(loop);
    }
    if (api.setPad) api.setPad(pad);
    babka('start', true);
    draw();

    // для проверок (probe): пройти как игрок — гопников обойти (arg 'pay' — откупиться), подняться на нужный этаж и позвонить;
    // 'wrong' — сначала позвонить в чужую дверь; 'late' — не успеть
    box.__solve = arg => {
      if (st.phase !== 'play' && st.phase !== 'gop') return;
      st.arm = 0; st.lock = 0;
      if (gop && !gop.done) { if (st.phase !== 'gop') { st.y = gop.at; startGop(); } gop.arm = 0; if (arg === 'pay') pay(); else gopPass('dodge'); }
      if (arg === 'late') { st.t = limit; return; }
      st.y = tgt; st.v = 0;
      if (arg === 'wrong' && per > 1) { st.door = (P.door + 1) % per; ring(); st.lock = 0; }
      st.door = P.door;
      ring();
    };
    box.__st = () => ({ phase: st.phase, y: +st.y.toFixed(3), v: +st.v.toFixed(3), breath: +st.breath.toFixed(3), puff: st.puff > 0, door: st.door,
      t: +st.t.toFixed(2), limit, floor, flat, per, lv, entr: P.entr, want: P.door, gopAt: P.gopAt, gop: gop ? { state: gop.state, i: gop.i, dir: gop.dirs[gop.i], done: gop.done, how: gop.how } : null, res: st.res });
    return () => {
      removeEventListener('keydown', onKey, true);
      removeEventListener('keyup', onKeyUp, true);
      removeEventListener('blur', onBlur);
      removeEventListener('pointerup', release, true);
      removeEventListener('pointercancel', release, true);
      offInput();
      if (raf) cancelAnimationFrame(raf);
      if (api.setStep) api.setStep(null);
      if (api.setPad) api.setPad(null);
      box.remove();
    };
  },
};
