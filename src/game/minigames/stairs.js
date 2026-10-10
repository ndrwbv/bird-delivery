/* Мини-игра у клиента: подъезд — подняться на этаж (IDEAS блок 13, 09.10.2026; трек 10 п. 6, 10.10.2026).
   Правила словами — docs/ORDERS.md «Подъезд: подняться на этаж». Когда выпадает и что даёт деньгами — doorstep.js
   (числа — ECON.STAIRS, econ.js); здесь — только сам экран.

   Автор 10.10.2026: «бабку убрать, интерфейс по ширине, в центре курьер, который поднимается, и явно прописанное
   задание — поднимись и отдай заказ; накладная такая же, как вначале». Экран: сверху крупно задание (этаж, квартира,
   подъезд, где ты сейчас) и рядом та же накладная (ordersheet.js; по ходу — ручкой: чужая дверь, «−N ₽ гопникам»,
   «+N ₽ взбежал быстро»); ниже на всю ширину — подъезд в разрезе: лестница посередине (курьер всегда в центре),
   двери квартир слева и справа на каждой площадке. Своего таймера нет — в шапке часы заказа (doorkit.js), реплики —
   сообщениями с лицом того, кто говорит (жилец за дверью, гопник, клиент; свои — синие справа).

   Формат мини-игры песочницы (src/uilab/minigames.js): export default { id, name, note, knobs, mount }.
   mount(root, o, api) → убрать за собой.
     o: { lv (этажей в доме), floor (нужный этаж; 0 — случайный), per (квартир на этаже; 0 — случайно), entr (подъезд; 0 — случайно),
          door (какая дверь на площадке), gop (гопники на площадке), time (с — эталон «быстро»; 0 — по формуле ECON.STAIRS.T),
          addr, who, person (клиент), sheet (HTML листа ordersheet.js), clock() (часы заказа; нет — свои, ручка «срок»),
          bonus ('+100 ₽'), gopPay ('−100 ₽'), K (числа; по умолчанию ECON.STAIRS) }
     api: t, ADULT, log(текст), done(итог) — кончилась (итог: { ok, timeout, fast, tries, t, floor, flat, gop: '' | 'dodge' | 'pay', mode: 'stairs' });
          в игре ещё: setStep(fn(dt)) — время идёт кадрами игры (пауза его стоит; без него — свой rAF),
          setPad(fn(p)) — кнопки геймпада (gamepad.js: a, b, up, down — держат; menuOk, menuUp/Down/Left/Right, menuBack, btnY — нажали),
          paused() — игра на паузе (клавиши не жмутся), sfx(имя) — звук (step, puff, ring, wrong, open, gop, beat, dodge, pay, fail).
   Как играют: лифт сломан. Вверх — A / ↑ / пробел / ▲ часто (держать — дыхалка тает, «одышка»), вниз — B / ↓ / ▼.
   На площадке ← → — к двери, A / Enter / тап по двери — позвонить. Табличка на площадке — какие там квартиры.
   Гопники: ← / → в такт стрелкам — обойти; Y / Enter — отдать «чаевые». */
import './stairs.css';
import { inputKind, onInput } from '../../input/glyphs.js';
import { STAIRS as K0 } from '../econ.js';
import { faceDataURL } from '../people.js';
import * as OS from '../ordersheet.js';
import * as KIT from './doorkit.js';
import * as SC from './doorscene.js';

const N_ = s => s;
const DT_MAX = 0.1;
/* мир подъезда — в долях высоты этажа (FH): лестница посередине (курьер всегда в центре кадра), двери слева и справа */
const XA = -0.3, XB = 0.3, XM = 0.56;          // низ пролёта (площадка), промежуточная площадка с окном (от XB до XM)
const GAP = 0.44, DL0 = -0.82, DR0 = 0.92;     // шаг дверей, ближняя к лестнице слева и справа
const DW = 0.27, DH = 0.58;                    // дверь: ширина и высота
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
const GOP = {
  ask: N_('Слышь, есть закурить?'),
  askKid: N_('Слышь, курьер, а пицца с чем? Поделись!'),
  miss: [N_('Куда пошёл? Мы не договорили!'), N_('Э, стоять!')],
  missAdult: [N_('Э, ты чё, самый умный, бля?')],
  pass: N_('Ну и вали, курьер!'),
  paid: N_('Во, нормальный пацан!'),
};

/* пиксельные спрайты крупно (смотрят вправо, низ — ступни): буква — цвет из PAL, точка — пусто */
const PAL = {
  R: '#d8402f', r: '#9a2a22', S: '#f2c08a', s: '#d39a66', K: '#33210c', O: '#ff8a2b', o: '#c8641c', Y: '#ffe36a', X: '#d9a25a', x: '#a8743a', L: '#d8402f',
  B: '#3b4a7a', b: '#283458', k: '#1d1a24', W: '#9fdcff', G: '#24306a', g: '#141519', w: '#f4f0e6', c: '#fff6e0', H: '#3a2a1e', h: '#5a4030',
};
const TOP = [
  '...RRRRR....',
  '..RRRRRRRr..',
  '..rrrrRRRRRR',
  '...HSSSSS...',
  '...SSSKSS...',
  '...sSSSSs...',
  '....SSSS....',
  '..OOOOOXXXXX',
  '.OOOOOOXLLLX',
  '.OYYYOOXXXXX',
  '.OOOOOSSxxxx',
  '.ooOOOO.....',
  '..OOOOO.....',
  '..YYYYY.....',
  '..BBBBB.....',
];
const MAN = {
  stand: TOP.concat(['..BB..BB....', '..BB..BB....', '..BB..BB....', '..bb..bb....', '..kk..kkk...']),
  w1: TOP.concat(['.BBB...BB...', '.BB.....BB..', 'BB.......BB.', 'bb.......bb.', 'kk.......kkk']),
  w2: TOP.concat(['..BBBBBB....', '..BB..BB....', '..BB...BB...', '..bb...bb...', '..kkk..kkk..']),
};
MAN.puff = ['............'].concat(TOP.slice(0, TOP.length - 1).map((r, i) => (i === 4 ? '.W' + r.slice(2) : r)), MAN.stand.slice(TOP.length));
/* гопник сидит на ступеньке */
const GOPNIK = [
  '...kkkkk....',
  '..kkkkkkkk..',
  '...SSSSS....',
  '...SSKSS....',
  '...sSSSS....',
  '..GGGGGGG...',
  '.GwGGGGGwG..',
  '.GGGGGGGGS..',
  '.GwGGGGGG...',
  '.GGGGGGGGGG.',
  '.GwGGGGGGwG.',
  '......GG.GG.',
  '......GG.GG.',
  '......gg.gg.',
];
const CAT = ['k...k.....', 'kk.kk.....', 'kkkkk....k', 'kWkWk...k.', 'kkkkkkkkk.', '.kkkkkkkk.', '.k.k..k.k.'];

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
  note: 'Задание крупно: «поднимись на N-й этаж и отдай заказ», рядом та же накладная. Лифт сломан: вверх — A / ↑ / пробел / ▲ часто (держать — дыхалка тает), вниз — B / ↓. На площадке ← → к двери, A / Enter / тап — позвонить. Гопники: ← → в такт или Y / Enter — откупиться. Своего таймера нет — идёт срок заказа.',
  knobs: [
    { k: 'lv', label: 'этажей в доме', type: 'num', def: 9, min: 5, max: 16, step: 1 },
    { k: 'floor', label: 'нужный этаж (0 — случайно)', type: 'num', def: 0, min: 0, max: 16, step: 1 },
    { k: 'per', label: 'квартир на этаже (0 — случайно)', type: 'num', def: 0, min: 0, max: 6, step: 1 },
    { k: 'entr', label: 'подъезд (0 — случайно)', type: 'num', def: 0, min: 0, max: 6, step: 1 },
    { k: 'gop', label: 'гопники на площадке', type: 'bool', def: false },
    { k: 'clockS', label: 'срок заказа, с', type: 'num', def: 45, min: 3, max: 120, step: 1 },
    { k: 'look', label: 'подъезд', type: 'sel', def: 'shabby', opts: [['shabby', 'обшарпанный'], ['clean', 'чистый с цветами'], ['auto', 'по адресу']] },
    { k: 'time', label: 'эталон «быстро», с (0 — по формуле)', type: 'num', def: 0, min: 0, max: 30, step: 0.5 },
  ],
  mount (root, o, api) {
    const t = api.t, K = Object.assign({}, K0, o.K || {});
    const P = plan(o, K);
    const { lv, per, floor, flat, first, time: limit } = P;
    const tgt = floor - 1;                                      // площадка нужного этажа (0 — первый этаж)
    const nl = Math.ceil(per / 2), nr = per - nl;               // дверей слева и справа от лестницы
    const flatAt = (f, i) => first + f * per + i;
    const sfx = n => { try { if (api.sfx) api.sfx(n); } catch (e) { /* — */ } };
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => '&#' + c.charCodeAt(0) + ';');
    let fake = null, clock = o.clock;
    if (typeof clock !== 'function') { fake = KIT.fakeClock(o.clockS || 45, t); clock = fake.get; }
    let person = o.person || null, sheet = o.sheet, bonus = o.bonus, gopPay = o.gopPay;
    if (!sheet) {   // песочница: заказ-образец на 1 000 ₽ с этой квартирой
      const ord = KIT.fakeOrder(api, { home: { flat: String(flat) } });
      person = person || ord.stops[0].persons[0] || null;
      sheet = OS.html(ord, { extra: ord.extra, t });
      const m = v => (api.money ? api.money(v) : v + ' ₽');
      bonus = bonus || '+' + m(Math.round(1000 * K.FAST_BONUS));
      gopPay = gopPay || '−' + m(Math.round(1000 * K.GOP_PAY));
    }
    const st = {
      t: 0, phase: 'play', y: 0, v: 0, breath: 1, puff: 0, door: -1, walk: 0, lock: 0, arm: 0.35, tries: 0, lastTap: -9,
      upHold: 0, stride: 0, leg: 0, bounce: 0, side: 0, sideT: 0, endT: 0, res: null, cam: -0.12, pad: false, armA: false,
      last: {}, fl: -1,
    };
    const gop = P.gopAt ? { at: P.gopAt, done: false, how: '', state: '', i: 0, dirs: [], w: 0, tt: 0, arm: 0, flash: 0 } : null;
    const doors = new Map();                                    // квартира → { kind: 'wrong' | 'right', t, open }
    const keys = { up: false, down: false, act: false };
    const touch = { up: false, down: false };
    const padH = { up: false, down: false, a: false };
    const client = () => o.who || (person && person.first) || t('клиент');

    // подъезд по виду: обшарпанный или чистый — по дому (doorscene.js), стиль — общий с домофоном
    const look = o.look === 'clean' || o.look === 'shabby' ? o.look : SC.lookOf(SC.hashStr(o.addr || String(flat)), o.zone);
    const C = SC.PAL[look], seed = +o.seed || SC.hashStr((o.addr || '') + '|' + flat);
    let faceUrl = '';
    try { faceUrl = person ? faceDataURL(person, 48) : ''; } catch (e) { /* — */ }

    const box = document.createElement('div');
    box.className = 'mk-full sx sx-' + look;
    box.innerHTML =
      '<canvas class="mk-cv sx-cv"></canvas>' +
      '<div class="mk-top">' + KIT.dashHTML() + '<div class="mk-fuse" aria-hidden="true"><i></i></div>' +
        '<div class="mk-task sx-task"><b class="mk-goal">' + esc(t('Поднимись на {n}-й этаж и отдай заказ', { n: floor })) + '</b>' +
          '<span class="mk-sub"><i>' + esc(t('кв. {n}', { n: flat })) + '</i>' + (P.entr > 1 ? '<i>' + esc(t('подъезд {n}', { n: P.entr })) + '</i>' : '') +
          '<em class="sx-now"></em><span class="sx-breath"><span>' + esc(t('дыхалка')) + '</span><i><b></b></i></span></span>' +
        '</div>' +
      '</div>' +
      '<div class="mk-say sx-feed"></div>' +
      KIT.miniHTML(sheet, { t, short: t('кв. {n}', { n: flat }), face: faceUrl }) +
      '<div class="sx-bar sx-bar-go">' +
        '<button type="button" tabindex="-1" data-a="down" class="sx-b sx-b-down">▼</button>' +
        '<button type="button" tabindex="-1" data-a="up" class="sx-b sx-b-up">▲ ' + esc(t('вверх')) + '</button>' +
        '<button type="button" tabindex="-1" data-a="left" class="sx-b">◀</button>' +
        '<button type="button" tabindex="-1" data-a="right" class="sx-b">▶</button>' +
        '<button type="button" tabindex="-1" data-a="ring" class="sx-b sx-b-ring">🔔</button>' +
      '</div>' +
      '<div class="sx-bar sx-bar-gop" hidden>' +
        '<button type="button" tabindex="-1" data-a="left" class="sx-b sx-b-dir">◀</button>' +
        '<button type="button" tabindex="-1" data-a="right" class="sx-b sx-b-dir">▶</button>' +
        '<button type="button" tabindex="-1" data-a="pay" class="sx-b sx-b-pay">' + esc(t('отдать «чаевые» −{n} %', { n: Math.round(K.GOP_PAY * 100) })) + '</button>' +
      '</div>' +
      '<p class="mk-help"></p>';
    const q = s => box.querySelector(s);
    const elFuse = q('.mk-fuse i'), elHelp = q('.mk-help'), elSheet = box, elNow = q('.sx-now'), elTask = q('.sx-task');
    const mini = KIT.miniBind(q('.mk-mini')), elInv = mini.body;
    const elBreath = q('.sx-breath'), elBreathBar = q('.sx-breath b'), barGo = q('.sx-bar-go'), barGop = q('.sx-bar-gop');
    const cv = q('.sx-cv'), g = cv.getContext('2d');
    const msgs = KIT.feed(q('.sx-feed'), { max: 3 });
    const say = m => msgs.say(m);

    /* где ты сейчас: «ты на 3-м этаже» → «твой этаж! кв. 47» */
    const where = () => {
      const f = Math.round(st.y);
      if (f === st.fl) return;
      st.fl = f;
      const here = f === tgt;
      elTask.classList.toggle('mk-here', here);
      elNow.textContent = here ? t('твой этаж! ищи кв. {n}', { n: flat }) : f > tgt ? t('ты на {n}-м — проскочил, ниже!', { n: f + 1 }) : t('ты на {n}-м этаже', { n: f + 1 });
    };

    /* подсказка по вводу — одной строкой внизу; на кнопках значков нет */
    const glyphs = () => {
      const k = inputKind().kind, ps = inputKind().family === 'ps';
      box.dataset.input = k;
      const A = ps ? '✕' : 'A', B = ps ? '○' : 'B', Y = ps ? '△' : 'Y';
      const kbd = (s, kb) => '<kbd class="pp-key' + (kb ? ' pp-key-kb' : '') + '">' + esc(s) + '</kbd>';
      mini.key(k === 'pad' ? (ps ? '□' : 'X') : k === 'kb' ? 'X' : '');
      if (st.phase === 'gop') {
        elHelp.innerHTML = k === 'pad' ? kbd('◀ ▶') + esc(t('в такт — обойти')) + ' · ' + kbd(Y) + esc(t('откупиться'))
          : k === 'kb' ? kbd('← →', 1) + esc(t('в такт — обойти')) + ' · ' + kbd('Enter', 1) + esc(t('откупиться'))
            : esc(t('жми ◀ ▶ в такт — или откупись'));
      } else {
        elHelp.innerHTML = k === 'pad' ? kbd(A) + esc(t('вверх — жми часто')) + ' · ' + kbd(B) + esc(t('вниз')) + ' · ' + kbd('◀ ▶') + esc(t('к двери')) + ' · ' + kbd(A) + esc(t('у двери — звонок')) + ' · ' + kbd(ps ? '□' : 'X') + esc(t('накладная'))
          : k === 'kb' ? kbd('↑', 1) + esc(t('вверх — жми часто')) + ' · ' + kbd('↓', 1) + esc(t('вниз')) + ' · ' + kbd('← →', 1) + esc(t('к двери')) + ' · ' + kbd('Enter', 1) + esc(t('звонок')) + ' · ' + kbd('X', 1) + esc(t('накладная'))
            : esc(t('жми ▲ часто · дверь — тап'));
      }
    };
    const pop = el => { if (!el) return; el.classList.remove('sx-pop'); void el.offsetWidth; el.classList.add('sx-pop'); };

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
    /* на площадке: ← → по ряду [двери слева … лестница … двери справа] */
    function side (dir) {
      if (st.phase === 'gop') { gopPress(dir); return; }
      if (st.phase !== 'play' || st.arm > 0 || st.lock > 0) return;
      const f = Math.round(st.y);
      if (Math.abs(st.y - f) > K.SNAP) return;                 // посреди пролёта дверей нет
      st.y = f; st.v = 0;
      let p = st.door < 0 ? nl : st.door < nl ? st.door : st.door + 1;
      p = clamp(p + dir, 0, per);
      st.door = p === nl ? -1 : p < nl ? p : p - 1;
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
      const rel = f === tgt ? 'same' : f < tgt ? 'up' : 'down';
      const pool = WRONG[rel].filter(w => !w.adult || api.ADULT);
      let w = pick(pool);
      if (pool.length > 1 && w === st.last.wrong) w = pool.find(x => x !== w);
      st.last.wrong = w;
      doors.set(n, { kind: 'wrong', t: K.WRONG_T + 0.5, open: 0, who: w.who });
      say({ person: KIT.stranger(w.who), kind: w.who, name: t('кв. {n}', { n }) + ' · ' + t(w.who), text: t(w.say), mood: 'angry', cls: 'mk-bad' });
      const pens = elInv.querySelectorAll('.os-pen.os-x');
      if (pens.length >= 3) pens[0].remove();
      OS.pen(elInv, 'flat', String(n), 'os-x');                 // чужая дверь — ручкой на листе, зачёркнутой
      mini.peek();
      setTimeout(() => sfx('wrong'), 180);
      pop(q('.sx-scene'));
    }

    /* ── гопники ── */
    const setBars = () => { barGo.hidden = st.phase === 'gop'; barGop.hidden = st.phase !== 'gop'; glyphs(); };   // в конце кнопки остаются бледными — лист не прыгает
    const gopP = () => KIT.stranger('гопник');
    function startGop () {
      st.phase = 'gop';
      st.v = 0; st.door = -1;
      gop.state = 'ask'; gop.tt = 0.9; gop.arm = 0.3; gop.i = 0;
      gop.dirs = Array.from({ length: K.GOP_STEPS }, () => (Math.random() < 0.5 ? -1 : 1));
      say({ person: gopP(), name: t('гопник'), text: t(api.ADULT ? GOP.ask : GOP.askKid), mood: 'angry' });
      sfx('gop');
      setBars();
    }
    function gopBeat () { gop.state = 'beat'; gop.w = K.GOP_WIN; sfx('beat'); }
    function gopMiss () {
      gop.state = 'miss'; gop.tt = K.GOP_MISS;
      gop.dirs[gop.i] = Math.random() < 0.5 ? -1 : 1;
      say({ person: gopP(), name: t('гопник'), text: t(pick(GOP.miss.concat(api.ADULT ? GOP.missAdult : []))), mood: 'angry', cls: 'mk-bad' });
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
      say({ person: gopP(), name: t('гопник'), text: t(how === 'pay' ? GOP.paid : GOP.pass), mood: how === 'pay' ? 'happy' : 'angry' });
      if (how === 'pay' && gopPay) { OS.pen(elInv, 'pay', gopPay + ' · ' + t('гопникам'), 'os-minus'); mini.peek(); }
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
      st.endT = 1.5;
      where();
      setBars();
      box.classList.add(ok ? 'sx-ok' : 'sx-late');
      const seal = document.createElement('div');
      seal.className = 'pp-seal ' + (ok ? 'pp-seal-green' : 'pp-seal-rust') + ' mk-seal';
      seal.textContent = ok ? (fast ? t('с ветерком!') : t('дошёл')) : t('сам спустится');
      elSheet.appendChild(seal);
      if (ok) say({ person, name: client(), text: t('О, пицца! Даже не запыхался?'), mood: 'happy', cls: 'mk-good' });
      else say({ person, name: client(), text: t('Да стой ты там, сам спущусь…'), mood: 'angry', cls: 'mk-bad' });
      if (fast && bonus) { OS.pen(elInv, 'pay', bonus + ' · ' + t('взбежал быстро'), 'os-plus'); mini.peek(); }
      sfx(ok ? 'open' : 'fail');
      api.log && api.log((ok ? 'дошёл' : 'срок вышел') + ' за ' + st.res.t + ' с (быстро — до ' + (limit * K.FAST).toFixed(1) + '), этаж ' + floor + ', ошибок ' + st.tries + (fast ? ', быстро' : '') + (gop ? ', гопники: ' + (gop.how || '—') : ''));
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
        say({ out: true, text: t('уф… уф… щас…') });
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
    }

    function step (dt) {
      dt = clamp(dt, 0, DT_MAX);
      if (st.phase === 'done') return;
      if (fake && (st.phase === 'play' || st.phase === 'gop')) fake.step(dt);
      KIT.dashSet(box, clock(), elFuse);
      for (const [n, d] of doors) {
        d.t -= dt;
        d.open += ((d.t > 0 ? (d.kind === 'right' ? 1 : 0.62) : 0) - d.open) * Math.min(1, dt * 9);
        if (d.t <= 0 && d.open < 0.02) doors.delete(n);
      }
      if (st.phase === 'end') {
        st.endT -= dt;
        anim(dt); draw();
        if (st.endT <= 0) { st.phase = 'done'; api.done && api.done(st.res); }
        return;
      }
      st.t += dt; st.arm -= dt;
      const c = clock();
      if (c && c.s <= 0) { finish(false, true); anim(dt); draw(); return; }   // срок заказа кончился — клиент спускается сам
      if (st.phase === 'gop') gopStep(dt); else climb(dt);
      elBreathBar.style.transform = 'scaleX(' + st.breath.toFixed(3) + ')';
      elBreath.classList.toggle('sx-low', st.breath < 0.3 || st.puff > 0);
      elBreath.classList.toggle('sx-puff', st.puff > 0);
      where();
      anim(dt); draw();
    }

    /* ── мир подъезда (в долях этажа FH) и камера: едет за курьером вверх-вниз и вбок ── */
    const doorX = i => (i < nl ? DL0 - (nl - 1 - i) * GAP : DR0 + (i - nl) * GAP);
    const standX = i => doorX(i) + (doorX(i) < XA ? 0.21 : -0.21);    // где встаёт курьер у двери — сбоку, лицом к ней
    const WL = Math.min(doorX(0) - 0.42, XA - 0.7), WR = Math.max(doorX(per - 1) + 0.42, XM + 0.55);
    const hsh = (...n) => { let x = seed ^ 0x9e3779b9; for (const v of n) { x = Math.imul(x ^ (v + 0x7f4a7c15), 0x85ebca6b); x ^= x >>> 13; } x = Math.imul(x, 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
    const flickF = Math.floor(hsh(99) * lv);                          // на этом этаже лампа мигает (обшарпанный)
    st.camX = 0; st.cam = 0;
    function manX () {
      const y = st.y, fr = y - Math.floor(y);
      if (st.phase === 'gop') return XA - 0.1;
      if (fr < 0.02) return XA + st.walk;
      return fr < 0.5 ? lerp(XA, XB, fr / 0.5) : lerp(XB, XA, (fr - 0.5) / 0.5);
    }
    function anim (dt) {
      const want = st.door >= 0 ? standX(st.door) - XA : 0;
      const d = want - st.walk, sp = 1.9 * dt;
      st.walk = Math.abs(d) <= sp ? want : st.walk + Math.sign(d) * sp;
      if (Math.abs(d) > 0.001) st.leg += sp * 0.8;
      if (st.bounce > 0) st.bounce = Math.max(0, st.bounce - dt * 7);
      if (st.sideT > 0) st.sideT -= dt;
      st.cam += (clamp(st.y, 0, lv - 1) - st.cam) * Math.min(1, dt * 6);
      const half = W / 2 / Math.max(1, FH);
      const cx = WR - WL <= 2 * half ? (WL + WR) / 2 : clamp(manX(), WL + half, WR - half);
      st.camX += (cx - st.camX) * Math.min(1, dt * 5);
    }

    /* ── рисование: крупный кадр одного-двух пролётов, пиксель U ── */
    let W = 0, H = 0, FH = 1, U = 2, Pp = 2, dpr = 1;
    const SX = x => W / 2 + (x - st.camX) * FH;
    const SY = h => H * 0.68 - (h - st.cam) * FH;
    const R = (x, y, w, h, c) => SC.rect(g, x, y, w, h, c);
    const faceImgs = new Map();
    const faceOf = kind => {
      if (faceImgs.has(kind)) return faceImgs.get(kind);
      let im = null;
      const p = kind === 'client' ? person : KIT.stranger(kind);
      if (p) { im = new Image(); try { im.src = faceDataURL(p, 64, kind === 'client' ? 'happy' : 'angry'); } catch (e) { im = null; } }
      faceImgs.set(kind, im);
      return im;
    };
    function flight (xa, ha, xb, hb, n, fill, nose, rail) {
      const dx = (xb - xa) / n, dh = (hb - ha) / n, th = 0.09;
      g.beginPath();
      g.moveTo(SX(xa), SY(ha));
      for (let i = 0; i < n; i++) { const x = xa + dx * i, h = ha + dh * (i + 1); g.lineTo(SX(x), SY(h)); g.lineTo(SX(x + dx), SY(h)); }
      g.lineTo(SX(xb), SY(hb - th)); g.lineTo(SX(xa), SY(ha - th)); g.closePath();
      g.fillStyle = fill; g.fill();
      for (let i = 0; i < n; i++) { const x = xa + dx * i, h = ha + dh * (i + 1); R(Math.min(SX(x), SX(x + dx)), SY(h), Math.abs(dx) * FH, Math.max(2, U * 0.7), nose); }
      // перила: балясины и деревянный поручень
      g.fillStyle = '#2d2a26';
      for (let i = 0; i < n; i += 2) { const x = xa + dx * (i + 0.5), h = ha + dh * (i + 1); R(SX(x) - U * 0.35, SY(h + 0.3), Math.max(2, U * 0.7), SY(h) - SY(h + 0.3), '#2d2a26'); }
      g.strokeStyle = rail; g.lineWidth = Math.max(3, U * 1.3); g.lineCap = 'round';
      g.beginPath(); g.moveTo(SX(xa), SY(ha + 0.31)); g.lineTo(SX(xb), SY(hb + 0.31)); g.stroke();
    }
    function door (f, i) {
      const n = flatAt(f, i), x = doorX(i);
      const L = SX(x - DW / 2), T = SY(f + DH), w = DW * FH, h = DH * FH;
      R(L - U * 1.5, T - U * 1.5, w + U * 3, h + U * 1.5, C.frame);
      const d = doors.get(n), open = d ? d.open : 0;
      if (open > 0.01) {   // за дверью: тёплый свет квартиры и тот, кто открыл
        R(L, T, w, h, '#2a1a10'); R(L + U, T + U, w - 2 * U, h * 0.9, '#6a4628');
        const im = d.kind === 'right' ? faceOf('client') : d.who && faceOf(d.who);
        const s = Math.min(w * 0.62, h * 0.34);
        if (im && im.complete && im.naturalWidth) { g.drawImage(im, L + (w - s) / 2, T + h * 0.2, s, s); R(L + (w - s) / 2, T + h * 0.2 + s, s, h * 0.3, '#8a4a5a'); }
        else if (d.who) SC.text(g, d.who === 'собака' ? '🐕' : d.who === 'кот' ? '🐈' : '?', L + w / 2, T + h * 0.62, s * 0.7, '#fff');
      }
      const lw = w * (1 - open * 0.86), lx = L + w - lw;
      const kind = hsh(n, 3);
      const steel = look === 'clean' ? kind < 0.45 : kind < 0.25;
      const DCOL = look === 'clean' ? ['#7a4a2a', '#5b4636', '#6b2f3f', '#3f5a6b'] : ['#7a3b2a', '#4a3a30', '#6b2f3f', '#3a4a30', '#5a2f2a'];
      const col = steel ? '#8a9096' : DCOL[(hsh(n, 4) * DCOL.length) | 0];
      R(lx, T, lw, h, col);
      if (lw > w * 0.55) {
        if (steel) {
          R(lx + U * 2, T + U * 2, lw - U * 4, h * 0.42, 'rgba(255,255,255,.1)'); R(lx + U * 2, T + h * 0.5, lw - U * 4, h * 0.46, 'rgba(0,0,0,.1)');
        } else {   // дерматин: стёжка ромбами, гвоздики
          g.fillStyle = 'rgba(0,0,0,.22)';
          for (let yy = T + h * 0.08; yy < T + h * 0.94; yy += h * 0.12) for (let xx = lx + lw * 0.15; xx < lx + lw * 0.9; xx += lw * 0.24) {
            const off = (((yy - T) / (h * 0.12)) | 0) % 2 ? lw * 0.12 : 0;
            g.fillRect(Math.round(xx + off), Math.round(yy), Math.max(2, U * 0.7), Math.max(2, U * 0.7));
          }
          if (look === 'shabby' && hsh(n, 5) < 0.5) R(lx + lw * 0.2, T + h * 0.62, lw * 0.3, h * 0.14, '#c9a46a');   // порван — торчит поролон
        }
        // номерок, глазок, ручка, замок
        const s = String(n), fs = Math.min(FH * 0.045, lw * 0.9 / (s.length + 0.6));
        R(lx + lw / 2 - fs * (s.length * 0.55 + 0.4), T + h * 0.12, fs * (s.length * 1.1 + 0.8), fs * 1.8, '#d9b25a');
        SC.text(g, s, lx + lw / 2, T + h * 0.12 + fs * 0.95, fs, '#33210c');
        R(lx + lw / 2 - U, T + h * 0.34, U * 2, U * 2, '#1a1410');
        R(lx + lw * 0.78, T + h * 0.52, U * 2.4, U * 1.2, '#e8d07a'); R(lx + lw * 0.8, T + h * 0.6, U * 1.2, U * 1.6, '#33210c');
      }
      if (st.door === i && Math.round(st.y) === f && st.phase !== 'gop') {   // выбранная — жёлтая рамка
        g.strokeStyle = '#ffd85e'; g.lineWidth = Math.max(3, U * 1.3);
        g.strokeRect(Math.round(L - U * 3), Math.round(T - U * 3), Math.round(w + U * 6), Math.round(h + U * 3));
      }
    }
    function lamp (f, x) {
      const on = !(C.flicker && f === flickF) || ((st.t * 7) | 0) % 9 > 1;
      SC.bulb(g, SX(x), SY(f + 0.9), Math.max(2, U * 0.8), on, false);
      return on;
    }
    function wall (f) {
      const top = SY(f + 1), bot = SY(f);
      R(0, top, W, bot - top, C.wallTop);
      const gr = g.createLinearGradient(0, top, 0, top + FH * 0.25);   // копоть у потолка
      gr.addColorStop(0, 'rgba(40,30,20,' + (0.12 + C.grime * 0.5) + ')'); gr.addColorStop(1, 'rgba(40,30,20,0)');
      g.fillStyle = gr; g.fillRect(0, top, W, FH * 0.25);
      const pan = SY(f + 0.42);
      R(0, pan, W, bot - pan, C.wallLow); R(0, pan, W, Math.max(3, U), C.stripe);
      if (C.grime > 0.2) for (let i = 0; i < 6; i++) {   // трещины и пятна
        const x = WL + hsh(f, i, 1) * (WR - WL), y = f + 0.1 + hsh(f, i, 2) * 0.8;
        R(SX(x), SY(y), U * (2 + hsh(f, i, 3) * 8), U, 'rgba(50,40,30,.35)'); R(SX(x) + U * 3, SY(y) + U, U, U * 3, 'rgba(50,40,30,.3)');
      }
      // торцы клетки — тёмные
      R(0, top, Math.max(0, SX(WL)), bot - top, '#2a211a'); R(SX(WR), top, Math.max(0, W - SX(WR)), bot - top, '#2a211a');
      // лестничная клетка посередине: окно над промежуточной площадкой, батарея под ним
      R(SX(XA - 0.06), top, (XM - XA + 0.1) * FH, bot - top, 'rgba(51,33,12,.07)');
      const wx = (XB + XM) / 2, ww = 0.22, wt = SY(f + 0.95), wb = SY(f + 0.62);
      R(SX(wx - ww / 2) - U * 2, wt - U * 2, ww * FH + U * 4, wb - wt + U * 4, '#3a2a1e');
      const sky = g.createLinearGradient(0, wt, 0, wb); sky.addColorStop(0, '#2b3a6b'); sky.addColorStop(1, '#f4a35a');
      g.fillStyle = sky; g.fillRect(Math.round(SX(wx - ww / 2)), Math.round(wt), Math.round(ww * FH), Math.round(wb - wt));
      R(SX(wx) - U * 0.6, wt, U * 1.2, wb - wt, '#3a2a1e'); R(SX(wx - ww / 2), wt + (wb - wt) * 0.42, ww * FH, U * 1.2, '#3a2a1e');
      if (C.grime > 0.2 && hsh(f, 7) < 0.5) R(SX(wx - ww / 2) + U * 2, wt + U * 2, ww * FH * 0.4, (wb - wt) * 0.3, 'rgba(230,240,255,.35)');   // треснуло
      R(SX(wx - ww / 2) - U * 3, wb + U * 2, ww * FH + U * 6, U * 2, '#9a9284');      // подоконник
      if (C.flowers) SC.plant(g, SX(wx - 0.05), wb + U * 2, Math.max(2, U * 0.55), f % 3);
      else { R(SX(wx + 0.03), wb - U * 3, U * 4, U * 5, 'rgba(200,220,200,.6)'); R(SX(wx + 0.03), wb - U * 1.5, U * 4, U * 3.5, '#8a7a5a'); }   // банка с окурками
      // табличка этажа у лестницы: номер крупно и «кв. a—b»; нужный этаж — жёлтая рамка
      const here = f === tgt, px = XA - 0.23, pw = 0.17, ptop = SY(f + 0.56), pb = SY(f + 0.3);   // на уровне глаз у лестницы
      R(SX(px - pw / 2) - U, ptop - U, pw * FH + 2 * U, pb - ptop + 2 * U, here ? '#ffd85e' : '#f4efe2');
      R(SX(px - pw / 2), ptop, pw * FH, pb - ptop, '#2f5fb0');
      SC.text(g, String(f + 1), SX(px), ptop + (pb - ptop) * 0.42, (pb - ptop) * 0.5, '#fff6e0');
      SC.text(g, t('кв. {a}—{b}', { a: flatAt(f, 0), b: flatAt(f, per - 1) }), SX(px), ptop + (pb - ptop) * 0.82, Math.min((pb - ptop) * 0.15, pw * FH / 11), '#fff6e0');
      // над дверями: щиток, объявления, граффити (обшарпанный), картинка и почтовые ящики (первый этаж)
      const slots = [];
      for (let i = 0; i + 1 < nl; i++) slots.push((doorX(i) + doorX(i + 1)) / 2);
      for (let i = nl; i + 1 < per; i++) slots.push((doorX(i) + doorX(i + 1)) / 2);
      slots.push(WL + 0.2, WR - 0.2);
      slots.forEach((x, k) => {
        const r = hsh(f, k, 11);
        if (f === 0 && k === slots.length - 2) {   // почтовые ящики у входа
          for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) R(SX(x - 0.12 + a * 0.08), SY(f + 0.62 - b * 0.07), 0.07 * FH, 0.06 * FH, b ? '#4f6f94' : '#5a7fa8');
          return;
        }
        if (k === slots.length - 2) {   // щиток с проводами
          R(SX(x - 0.07), SY(f + 0.62), 0.14 * FH, 0.22 * FH, '#7d858c'); R(SX(x - 0.06), SY(f + 0.6), 0.12 * FH, 0.18 * FH, '#6a7178');
          R(SX(x - 0.01), SY(f + 1), U, SY(f + 0.62) - SY(f + 1), '#1d1a16'); R(SX(x + 0.03), SY(f + 1), U, SY(f + 0.62) - SY(f + 1), '#1d1a16');
          SC.text(g, '⚡', SX(x), SY(f + 0.5), FH * 0.05, '#ffd85e');
          return;
        }
        if (C.graffiti && r < 0.35) SC.graffiti(g, t(SC.GRAFFITI[(hsh(f, k, 12) * SC.GRAFFITI.length) | 0]), SX(x), SY(f + 0.8), FH * 0.028, ['#c8402e', '#2f5fb0', '#2a2622'][k % 3], -0.1 + r * 0.3);
        else if (r < 0.7) SC.poster(g, SX(x - 0.07), SY(f + 0.9), 0.14 * FH, 0.14 * FH, Math.max(2, U * 0.5), SC.ADS[(hsh(f, k, 13) * SC.ADS.length) | 0], t);
        else if (C.flowers) { R(SX(x - 0.07) - U, SY(f + 0.92) - U, 0.14 * FH + 2 * U, 0.12 * FH + 2 * U, '#8a6b4e'); R(SX(x - 0.07), SY(f + 0.92), 0.14 * FH, 0.12 * FH, '#9fc8e8'); R(SX(x - 0.07), SY(f + 0.85), 0.14 * FH, 0.05 * FH, '#6fa86a'); }
      });
      for (let i = 0; i < per; i++) door(f, i);
    }
    function floorItems (f) {
      const y = SY(f);
      for (let i = 0; i < per; i++) {   // коврики у дверей
        const x = doorX(i), r = hsh(f, i, 21);
        if (r < (look === 'clean' ? 0.85 : 0.5)) R(SX(x - DW * 0.42), y - U * 1.4, DW * 0.84 * FH, U * 1.6, ['#a8324a', '#5a3a2a', '#3f6a8a', '#6a8a3a'][(r * 40 | 0) % 4]);
      }
      const spots = [WL + 0.12, WR - 0.12, (doorX(0) + WL) / 2 + 0.05];
      spots.forEach((x, k) => {
        const r = hsh(f, k, 31);
        if (C.trash && r < 0.45) {   // мусор: бутылка, пакет, коробка из-под пиццы конкурента
          if (k % 3 === 0) { R(SX(x), y - U * 7, U * 2.4, U * 7, '#3f7a4a'); R(SX(x) + U * 0.6, y - U * 9, U * 1.2, U * 2, '#3f7a4a'); }
          else if (k % 3 === 1) { R(SX(x) - U * 4, y - U * 6, U * 8, U * 6, '#d8d2c4'); R(SX(x) - U * 2, y - U * 7.5, U * 4, U * 2, '#d8d2c4'); }
          else { R(SX(x) - U * 6, y - U * 2.4, U * 12, U * 2.4, '#c8a46a'); R(SX(x) - U * 3, y - U * 2.4, U * 4, U, '#d8402f'); }
        } else if (C.flowers && r < 0.6) SC.plant(g, SX(x), y, Math.max(2, U * 0.75), k);
      });
      if (hsh(f, 41) < 0.18) SC.spr(g, CAT, SX(WR - 0.3), y, Math.max(2, Math.round(U * 0.9)), hsh(f, 42) < 0.5, { k: '#2a2622', W: '#ffd85e' });   // кот
    }
    function draw () {
      const r = cv.getBoundingClientRect();
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const cw = Math.max(50, Math.round(r.width * dpr)), ch = Math.max(50, Math.round(r.height * dpr));
      if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.imageSmoothingEnabled = false;
      W = cw / dpr; H = ch / dpr;
      FH = Math.min(H / 1.45, W / 1.5); U = Math.max(2, Math.round(FH / 64)); Pp = U;
      R(0, 0, W, H, '#120c08');
      const hBot = st.cam - (H * 0.32) / FH - 0.2, hTop = st.cam + (H * 0.68) / FH;
      const fLo = Math.max(0, Math.floor(hBot)), fHi = Math.min(lv - 1, Math.floor(hTop));
      for (let f = fLo; f <= fHi; f++) wall(f);
      if (SY(lv) > 0) { R(0, 0, W, SY(lv), '#2a211a'); R(0, SY(lv) - U * 3, W, U * 3, '#8a7f72'); }
      if (SY(0) < H) { R(0, SY(0), W, H - SY(0), '#2a211a'); }
      // пролёты: дальний (назад к площадке выше) — темнее, за курьером
      const n = 9, fr = st.y - Math.floor(st.y), onBack = fr >= 0.5 && st.phase !== 'gop';
      for (let f = Math.max(0, fLo - 1); f <= Math.min(fHi, lv - 2); f++) {
        R(SX(XB), SY(f + 0.5), (XM - XB) * FH, FH * 0.06, '#8a7f72');
        R(SX(XM - 0.12), SY(f + 0.58), 0.18 * FH, 0.07 * FH, look === 'clean' ? '#c9c2b0' : '#a39a8c');           // батарея
        flight(XB, f + 0.5, XA, f + 1, n, '#6e675e', '#7f786e', '#4a3220');
      }
      if (onBack) man();
      for (let f = Math.max(0, fLo - 1); f <= Math.min(fHi, lv - 2); f++) flight(XA, f, XB, f + 0.5, n, '#a39a8c', '#c4bba9', '#6b4426');
      for (let f = fLo; f <= Math.min(lv - 1, fHi + 1); f++) {   // площадки — на всю клетку; выше первого — с проёмом лестницы (от XA до XM)
        const slab = (a, b2) => { R(SX(a), SY(f), (b2 - a) * FH, FH * 0.07, '#8a7f72'); R(SX(a), SY(f) + FH * 0.07 - U, (b2 - a) * FH, U, '#5e564c'); };
        if (f === 0) slab(WL, WR); else { slab(WL, XA + 0.02); slab(XM, WR); }
        if (f <= fHi) floorItems(f);
      }
      if (gop) gopniks();
      if (!onBack) man();
      if (gop && st.phase === 'gop') arrows();
      // свет: лампочки на площадках, по краям — темнота
      for (let f = fLo; f <= fHi; f++) for (const x of [(DL0 + XA) / 2 - 0.12, DR0 + 0.05]) {
        if (lamp(f, x)) SC.glow(g, SX(x), SY(f + 0.82), FH * 0.75, C.light, 0.22 * C.lamp);
      }
      SC.vignette(g, W, H, look === 'clean' ? 0.45 : 0.62);
    }
    function man () {
      const y = st.y, fr = y - Math.floor(y);
      let flip = fr >= 0.5;                                     // вверх по ближнему пролёту — вправо, по дальнему — влево
      if (fr < 0.02 && st.phase !== 'gop') {
        const want = st.door >= 0 ? standX(st.door) - XA : 0, d = want - st.walk;
        if (Math.abs(d) > 0.002) flip = d < 0;
        else if (st.door >= 0) flip = doorX(st.door) < XA + st.walk;
        else flip = false;
      }
      if (st.phase === 'gop') flip = false;
      let px = SX(manX());
      if (st.sideT > 0) px += st.side * U * 5 * Math.sin((1 - st.sideT / 0.28) * Math.PI);
      const moving = Math.abs(st.v) > 0.08 || Math.abs(st.walk - (st.door >= 0 ? standX(st.door) - XA : 0)) > 0.002;
      const frame = st.puff > 0 ? MAN.puff : moving ? ((st.leg * 14) | 0) % 2 ? MAN.w1 : MAN.w2 : MAN.stand;
      // тень под ногами
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(Math.round(px - U * 5), Math.round(SY(y) - U * 0.5), U * 10, U);
      SC.spr(g, frame, px, SY(y) - st.bounce * U * 1.5, U, flip, PAL);
    }
    function gopniks () {
      const f = gop.at, U2 = U;
      const g1 = api.ADULT ? GOPNIK.map((r, i) => (i === 4 ? '...sSSSSc...' : r)) : GOPNIK;
      SC.spr(g, g1, SX(XA + 0.07), SY(f + 0.06), U2, true, PAL);
      SC.spr(g, GOPNIK, SX(XA + 0.19), SY(f + 0.17), U2, true, Object.assign({}, PAL, { G: '#141519', w: '#e8e8e8' }));
      if (api.ADULT) {   // дымок сигареты
        g.fillStyle = 'rgba(240,240,240,.5)';
        const tt = st.t * 2, bx = SX(XA + 0.07) - U * 5, by = SY(f + 0.06) - U * 11;
        for (let i = 0; i < 3; i++) g.fillRect(Math.round(bx - U * i + Math.sin(tt + i) * U), Math.round(by - U * i * 2.2 - ((tt * 4) % (U * 2))), U, U);
      }
    }
    function arrows () {
      if (gop.state !== 'beat' && gop.state !== 'ok' && gop.state !== 'miss') return;
      const cx = SX(XA + 0.13), cy = SY(gop.at + 0.5);
      const Rr = FH * 0.07, k = gop.state === 'beat' ? Math.max(0, gop.w / K.GOP_WIN) : 1;
      const dir = gop.dirs[Math.min(gop.i, gop.dirs.length - 1)];
      g.fillStyle = gop.state === 'miss' ? 'rgba(217,52,44,.92)' : '#fff3d6';
      g.strokeStyle = '#33210c'; g.lineWidth = Math.max(3, U);
      g.beginPath(); g.arc(cx, cy, Rr, 0, Math.PI * 2); g.fill(); g.stroke();
      if (gop.state === 'beat') {   // кольцо сжимается — сколько осталось на эту стрелку
        g.strokeStyle = k < 0.35 ? '#d9342c' : '#ff8a2b'; g.lineWidth = Math.max(4, U * 1.5);
        g.beginPath(); g.arc(cx, cy, Rr + U * 2 + Rr * 1.2 * k, 0, Math.PI * 2); g.stroke();
      }
      g.fillStyle = gop.state === 'miss' ? '#fff3d6' : '#33210c';
      g.beginPath();
      const a = Rr * 0.55;
      g.moveTo(cx + dir * a, cy); g.lineTo(cx - dir * a * 0.6, cy - a); g.lineTo(cx - dir * a * 0.6, cy + a); g.closePath(); g.fill();
      for (let i = 0; i < gop.dirs.length; i++) R(cx - (gop.dirs.length * 4 * U) / 2 + i * 4 * U + U, cy + Rr + U * 4, U * 2.4, U * 2.4, i < gop.i ? '#4fd65a' : 'rgba(255,243,214,.7)');
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
      else if (c === 'KeyX') k = 'inv';
      else if (c === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); return; }   // карта — не во время мини-игры
      if (!k) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat) return;
      if (k === 'inv') { mini.toggle(); return; }
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
      if (p.btnX) mini.toggle();                                // X — накладная
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
      const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      const f = Math.round(st.y);
      if (Math.abs(st.y - f) <= K.SNAP && py < SY(f) && py > SY(f + DH)) {
        for (let i = 0; i < per; i++) {
          if (Math.abs(px - SX(doorX(i))) < DW * FH / 2 + U * 3) {
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
    where();
    KIT.dashSet(box, clock(), elFuse);
    const offInput = onInput(glyphs);
    let raf = 0, last = 0;
    if (api.setStep) api.setStep(step);
    else {
      const loop = now => { raf = requestAnimationFrame(loop); step(last ? (now - last) / 1000 : 0); last = now; };
      raf = requestAnimationFrame(loop);
    }
    if (api.setPad) api.setPad(pad);
    say({ person, name: client(), text: t('Лифт опять сломан — поднимайтесь пешком!') });
    draw();

    // для проверок (probe): пройти как игрок — гопников обойти (arg 'pay' — откупиться), подняться на нужный этаж и позвонить;
    // 'wrong' — сначала позвонить в чужую дверь; 'late' — не успеть (срок вышел)
    box.__solve = arg => {
      if (st.phase !== 'play' && st.phase !== 'gop') return;
      st.arm = 0; st.lock = 0;
      if (gop && !gop.done) { if (st.phase !== 'gop') { st.y = gop.at; startGop(); } gop.arm = 0; if (arg === 'pay') pay(); else gopPass('dodge'); }
      if (arg === 'late') { finish(false, true); return; }
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
      msgs.clear();
      mini.off();
      if (raf) cancelAnimationFrame(raf);
      if (api.setStep) api.setStep(null);
      if (api.setPad) api.setPad(null);
      box.remove();
    };
  },
};
