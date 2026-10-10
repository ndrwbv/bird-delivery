/* ──────────────────────────────────────────────────────────────────────────
   Встречи у двери (docs/IDEAS.md трек 10, п. 9—10; docs/ORDERS.md «Встречи у двери»).
   Автор, 10.10.2026: «как сейчас катсцены показываются для бабы Зины — вот так же и будут эти
   микрогерои в стиле No, I'm Not a Human»; «подъезд погружает в то, что за персонаж тебе попадётся:
   разъёбаный подъезд, крысы, бутылки — или красивый, где всё аккуратно; контраст — игра про него».

   Встреча — короткая катсцена на движке сюжета (story.js play, живые лица и жесты actorlife.js):
   машина у подъезда, чёрные полосы, курьер идёт с коробкой, из двери выходит герой; к двери
   пристроен тамбур с открытой дверью — за ней кусок квартиры героя (бардак и бутылки, фольга и
   аквариумы, портрет и флаги — а на кровати бонг); у подъезда — свой антураж (мусор, крысы, мигающая
   лампа — или цветы и коврик). Реплика портретом (рот говорит), два коротких ответа столбиком
   (story.js ['ask'] → dialog.js stack: курсор ▶, ↑ ↓ / крестовина, Enter / A), реакция (реплики без ответа листаются
   сами — autoSay), курьер уходит. 8—12 секунд, B / Esc — пропустить.

   Тексты: свои (у каждого героя одна «фирменная» встреча, под его квартиру) + встречи агента
   «диалог у двери» из minigames/smalltalk-lines.js (SITS с полем who, файл не правим — берём что есть).

   В игре встречи пока НЕ выпадают (автор смотрит в песочнице): истории помечены kind: 'meet' и
   ready: () => false — очередь глав story.js их не берёт, флаг архива сюжета (heroes.js HERO.STORY)
   их не касается. Песочница игры (`npm run sandbox`) → раздел «Встречи».

     ENC.init(api)              — один раз из game.js: { THREE, scene, CITY, V, ADULT, groundH, inHouse, makeHuman, people() — списки прохожих }
     ENC.list()                 — герои и их встречи (для песочницы)
     ENC.play(id, i) → Promise  — проиграть встречу i героя id у ближайшего подъезда (машина встаёт сама)
   отладка: __dlv.ENC
   ────────────────────────────────────────────────────────────────────────── */
import { t, N_ } from '../i18n/index.js';
import * as STORY from './story.js';
import * as LIFE from './actorlife.js';
import { makePerson } from './people.js';
import { makeCatModel, FURS } from './cats.js';
import * as LINES from './minigames/smalltalk-lines.js';

export const EN = {
  NEAR: 320,          // подъезд для встречи — ближе стольких метров к машине
  DEPTH: 0.75,        // тамбур перед дверью подъезда, м (за открытой дверью — кусок квартиры)
  OPEN_W: 1.2,        // проём двери тамбура, м
  MAX_MEETS: 3,       // встреч у героя, не больше
  RATS: 3,            // крыс у разбитого подъезда
  HOST_AT: 0.9,       // герой выходит из двери через столько секунд после начала (курьер ещё идёт от машины)
  LOOK: 1.2,          // столько секунд камера заглядывает в квартиру за героем
  NOD: 0.5,           // реакция без хлопка дверью: кивок / пожал плечами — столько секунд на плане 'two'
  LEAVE: 0.8,         // курьер уходит к машине — столько секунд, и встреча кончается (не ждём, пока дойдёт)
  CPS: 50,            // букв в секунду в репликах встречи (сюжет — 42)
};

/* ─────────────── герои ───────────────
   who — ключ WHO из smalltalk-lines.js: оттуда поправки к портрету и их встречи с этим человеком.
   look — поверх (особые черты people.js: шрам, пустой рукав, бутылка…), kidsLook — в детской ещё поверх.
   char — характер для actorlife.js (походка, жест, пока говорит), decor — подъезд и квартира (DECOR ниже).
   own — своя встреча героя, в формате smalltalk-lines.js: { id, emo, say, a, b, kids? } */
const HEROES = [
  { id: 'alkash', who: 'alcoholic_onearm', name: N_('Валера'), seed: 0x0a1c, fem: false, decor: 'wreck', lean: true,
    look: { age: 'adult', hair: 'receding', hairC: '#4a3020', beard: 'none', stubble: false, bristle: true, bags: true, head: 'beanie', headC: '#3b4a5a',
      eyes: 'sleepy', brows: 'sad', mouth: 'smirk', noseC: '#d9605a', sleeve: 'L', bottle: '#2f6b3a', top: 'tee', shirt: '#e8e4d8', pants: '#46506b', shoes: '#5a3a22', glasses: 'none', fat: false, shape: 'normal', pack: null },
    kidsLook: { bottle: '#f4f1ea' },                              // в детской — кефир
    char: { walk: { speed: 0.7, step: 5.5, leg: 0.45, arm: 0.9, sway: 0.16, drag: 0.5, stoop: 0.1 }, talk: 'spread', idle: 'sway' },
    own: { id: 'alkash-fall', emo: 'sad',
      say: N_('Ик… Пицца? Я, бля, не заказывал… Или заказывал? Давай.'),
      a: { me: N_('Распишитесь тут'), re: N_('Левой распишусь. Правую на бургерной войне оставил.'), mood: 'sad', out: '0' },
      b: { me: N_('Проспитесь, дядь'), re: N_('Я с девяносто восьмого не сплю. Пиздуй, малой.'), mood: 'angry', out: '0', slam: true },
      kids: { say: N_('Ик… Пицца? Я не заказывал… Или заказывал? Давай.'),
        b: { me: N_('Проспитесь, дядь'), re: N_('Я с девяносто восьмого не сплю. Иди, малой.'), mood: 'angry', out: '0', slam: true } } } },

  { id: 'granny', who: 'angry_granny', name: N_('баба Галя'), seed: 0x6a1a, fem: true, decor: 'granny',
    look: { age: 'old', wrinkles: true, bags: true, hairC: '#d4d0ca', hair: 'bun', head: 'bandana', headC: '#6b2e4a', brows: 'angry', mouth: 'frown', eyes: 'narrow',
      top: 'long', bottom: 'skirt', shirt: '#6b5a7a', skirt: '#3a3036', legs: '#c9b8a8', shape: 'chubby', fat: true, glasses: 'none', lip: null, pack: null },
    char: { walk: { speed: 0.75, step: 11, leg: 0.22, arm: 0.25, drag: 1, stoop: 0.18 }, talk: 'wag', idle: 'still' },
    own: { id: 'granny-mat', emo: 'angry',
      say: N_('Ноги вытер? Я этот коврик тридцать лет стерегу.'),
      a: { me: N_('Вытер'), re: N_('Врёшь. Но пиццу давай.'), mood: 'angry', out: '0' },
      b: { me: N_('Это просто коврик'), re: N_('Это — память. Пошёл вон.'), mood: 'angry', out: 'none', slam: true } } },

  { id: 'cop', who: 'corrupt_cop', name: N_('старлей Пахомов'), seed: 0xc0b, fem: false, decor: 'cop',
    look: { age: 'adult', hair: 'buzz', hairC: '#2a1d16', head: 'cap', headC: '#3b4a5a', capBack: false, beard: 'horseshoe', broad: true, scar: 'cheek', brows: 'thick', mouth: 'smirk', eyes: 'narrow',
      top: 'long', shirt: '#4a5a6b', pants: '#2f3540', shoes: '#1f1c1a', fat: true, shape: 'chubby', glasses: 'none', pack: null },
    char: { walk: { speed: 0.9, step: 7, leg: 0.5, arm: 0.3 }, talk: 'point', idle: 'still' },
    own: { id: 'cop-boxes', emo: 'ok',
      say: N_('Коробки видишь? Это не взятки. Это подарки от благодарных граждан.'),
      a: { me: N_('Понимаю'), re: N_('Понятливый. Далеко пойдёшь. Свободен.'), mood: 'happy', out: 'tip' },
      b: { me: N_('А чек есть?'), re: N_('Чек… Фамилию свою скажи. Медленно.'), mood: 'angry', out: '0', slam: true } } },

  { id: 'dandy', who: 'dandy_coffee', name: N_('Арсений'), seed: 0xda4d, fem: false, decor: 'loft',
    look: { age: 'young', hair: 'side', hairC: '#6b4a2e', beard: 'mustache', glasses: 'round', glassC: '#6b3a22', head: 'beanie', headC: '#e08a4f', pompom: false, earring: true, cup: '#f4f1ea',
      top: 'stripe', shirt: '#f4f1ea', stripe: '#2e4a6b', bottom: 'pants', pants: '#8a7a5a', shoes: '#f4f1ea', mouth: 'smirk', brows: 'raised', fat: false, shape: 'thin', pack: null },
    char: { walk: { speed: 1, step: 9, leg: 0.45, arm: 0.4, sway: 0.08 }, talk: 'shrug', idle: 'sway' },
    own: { id: 'dandy-sour', emo: 'ok',
      say: N_('Пицца на закваске? Я без закваски не ем. Принципиально.'),
      a: { me: N_('На закваске'), re: N_('Чувствую ложь. Но красивую. Держи.'), mood: 'happy', out: 'tip' },
      b: { me: N_('На тесте'), re: N_('…Тесто. Как у всех. Грустно.'), mood: 'sad', out: '0' } } },

  { id: 'alien', who: 'alien', name: N_('жилец из 66-й'), seed: 0xa11e, decor: 'foil',
    look: { skin: '#9fd47a', hair: 'bald', head: 'none', beard: 'none', stubble: false, eyes: 'alien', brows: 'thin', browC: '#5a8a4a', mouth: 'small', nose: 'small', ears: 'small', antenna: '#ff3ea5',
      glasses: 'none', freckles: false, blush: false, mole: -1, wrinkles: false, top: 'long', bottom: 'pants', shirt: '#c8ccd2', pants: '#c8ccd2', shoes: '#8a9aa8', fat: false, shape: 'thin', lip: null, pack: null },
    char: { walk: { speed: 0.9, step: 12, leg: 0.25, arm: 0.1, hop: 0.06 }, talk: 'flap', idle: 'bounce' },
    own: { id: 'alien-round', emo: 'surprised',
      say: N_('Ваша еда… круглая. Как наши корабли. Земляне милые.'),
      a: { me: N_('Это пицца'), re: N_('Пицца. Записываю. Ты меня не запомнишь… Уже не помнишь.'), mood: 'happy', out: 'tip' },
      b: { me: N_('Кристаллы не берём'), re: N_('Тогда — рубли. Сам напечатал. Очень похожи.'), mood: 'happy', out: '0' } } },

  { id: 'hikan', who: 'hikan', name: N_('Тёмыч'), seed: 0x41ca, fem: false, decor: 'dark',
    look: { age: 'young', head: 'hood', hair: 'buzz', hairC: '#1a1a1a', eyes: 'narrow', brows: 'angry', mouth: 'line', scar: 'brow', bristle: true, bags: true, cig: true,
      top: 'long', shirt: '#2b2a30', pants: '#2b2a30', shoes: '#f4f1ea', beard: 'none', stubble: false, glasses: 'none', fat: false, shape: 'thin', pack: null },
    kidsLook: { cig: false },
    char: { walk: { speed: 1.1, step: 8, leg: 0.5, arm: 0.3, stoop: 0.14 }, talk: 'small', idle: 'fidget' },
    own: { id: 'hikan-bar', emo: 'angry',
      say: N_('Чё так долго? Я на турнике вишу, пока ты едешь.'),
      a: { me: N_('Пробки'), re: N_('Пробки — для слабых. Сдачи не надо.'), mood: 'ok', out: 'tip' },
      b: { me: N_('Сам бы сходил'), re: N_('Я в капюшоне, бля. Мне на улицу нельзя.'), mood: 'angry', out: '0', slam: true },
      kids: { b: { me: N_('Сам бы сходил'), re: N_('Я в капюшоне. Мне на улицу нельзя.'), mood: 'angry', out: '0', slam: true } } } },

  { id: 'grandpa', who: 'kind_oldman_cat', name: N_('Пётр Ильич'), seed: 0x9e7a, fem: false, decor: 'nice', cat: true,
    look: { age: 'old', wrinkles: true, hair: 'receding', hairC: '#d4d0ca', beard: 'mustache', glasses: 'round', glassC: '#6b3a22', mouth: 'smile', brows: 'raised', eyes: 'sleepy',
      head: 'none', top: 'jacket', jacket: '#8a6b3a', shirt: '#f4f1ea', pants: '#5a4a3a', shoes: '#5a3a22', fat: false, shape: 'normal', blush: true, pack: null },
    char: { walk: { speed: 0.75, step: 9, leg: 0.25, arm: 0.25, drag: 0.8, stoop: 0.12 }, talk: 'small', idle: 'still' },
    own: { id: 'grandpa-time', emo: 'happy',
      say: N_('Минута в минуту! Барсик, смотри — пицца приехала.'),
      a: { me: N_('Приятного!'), re: N_('И вам! Заходите на чай — у Нины пирог.'), mood: 'happy', out: 'tip' },
      b: { me: N_('Барсику кусочек'), re: N_('Он у нас гурман: только корочки. Держите на чай.'), mood: 'happy', out: 'tip' } } },

  { id: 'patriot', who: 'twofaced_patriot', name: N_('Геннадий Палыч'), seed: 0x9a71, fem: false, decor: 'order',
    look: { age: 'adult', hair: 'side', hairC: '#2a1d16', beard: 'mustache', glasses: 'square', glassC: '#1d1a1f', head: 'none', brows: 'thick', mouth: 'line', eyes: 'round',
      top: 'jacket', jacket: '#2b2a30', shirt: '#f4f1ea', pants: '#2b2a30', shoes: '#1f1c1a', fat: true, shape: 'chubby', pack: null },
    char: { walk: { speed: 0.95, step: 7, leg: 0.55, arm: 0.15 }, talk: 'point', idle: 'still' },
    own: { id: 'patriot-bed', emo: 'ok',
      say: N_('Ровно в срок. Уважаю. В городе должен быть порядок — во всём.'),
      a: { me: N_('Так точно'), re: N_('Наш человек. Свободен.'), mood: 'happy', out: 'tip' },
      b: { me: N_('А что у вас на кровати?'), re: N_('Это ваза. Для цветов. Государственная. Свободен, бля!'), mood: 'scared', out: '0', slam: true },
      kids: { b: { me: N_('А что у вас на кровати?'), re: N_('Это… вещдоки. Изъял у внуков. Свободен!'), mood: 'scared', out: '0', slam: true } } } },
];

/* ─────────────── состояние ─────────────── */
let A = null;
const M = { on: false, hero: null, spot: null, decor: null, t: 0, slam: false, doorK: 0, stats: { played: 0, skipped: 0, last: null } };
const SID = h => 'meet-' + h.id;

/* встречи героя: своя + из smalltalk-lines.js по полю who (с учётом взрослой / детской) */
function meetsOf (h) {
  const adult = !!(A && A.ADULT);
  const theirs = (Array.isArray(LINES.SITS) ? LINES.SITS : []).filter(s => s && s.who === h.who && s.a && s.b && (!s.adult || adult));
  return [h.own].concat(theirs).filter(s => !s.adult || adult).slice(0, EN.MAX_MEETS).map(s => kidsOf(s, adult));
}
function kidsOf (s, adult) {
  if (adult || !s.kids) return s;
  return Object.assign({}, s, { say: s.kids.say || s.say, a: Object.assign({}, s.a, s.kids.a || {}), b: Object.assign({}, s.b, s.kids.b || {}) });
}
function lookOf (h) {
  const W = (LINES.WHO && LINES.WHO[h.who] && LINES.WHO[h.who].look) || {};
  return Object.assign({}, W, h.look, A && !A.ADULT ? h.kidsLook || {} : {});
}
const PEOPLE = new Map();
function personOf (h) {
  if (PEOPLE.has(h.id)) return PEOPLE.get(h.id);
  const p = makePerson({ seed: h.seed, fem: h.fem });
  Object.assign(p.look, lookOf(h));
  const name = t(h.name);
  Object.assign(p, { id: 'meet-' + h.id + (A && A.ADULT ? '' : '-k'), name, first: name, last: '', acc: name, gen: name, dat: name, pos: '' });
  PEOPLE.set(h.id, p);
  return p;
}

/* ─────────────── сценарий встречи ─────────────── */
const ACT_OF = { tip: 'nod', big: 'joy', cut: 'shake', none: 'shake', 0: 'shrug' };
function scriptOf (h, s) {
  const out = [
    ['do', o => setDecor(o)],
    ['shot', 'establish', { cut: true }],
    ['walk', 'courier', 'front', { wait: false }],
    ['do', o => courierTo(o, false)],             // курьер встаёт не по центру, а сбоку от двери (камера видит героя мимо него)
    ['wait', EN.HOST_AT],                         // курьер ещё идёт — а герой уже выходит
    ['walk', 'zina', 'out'],
    ['do', o => hostTo(o)],                       // герой — чуть к камере: за ним видно квартиру
    ['shot', 'cat', { cut: true }],               // заглянуть за дверь: квартира героя (план 'cat' — свой, у встреч кота нет)
    ['wait', EN.LOOK],
    ['do', o => courierTo(o, true)],              // курьер дошёл (обычно уже стоит)
    ['shot', 'zina', { cut: true }],
    ['ask', 'zina', s.say, { yes: s.a.me, no: s.b.me, emo: s.emo === 'ok' ? '' : s.emo }],
  ];
  for (const [r, ans] of [[s.a, 'yes'], [s.b, 'no']]) {
    out.push(['shot', 'two', { ans }]);
    if (r.re) out.push(['say', 'zina', r.re, { emo: r.mood === 'ok' ? '' : r.mood, ans }]);
    out.push(['give', { ans }]);
    if (r.slam) {
      out.push(['do', () => { M.slam = true; return null; }, { ans }]);
      out.push(['walk', 'zina', 'in', { wait: false, ans }]);
      out.push(['wait', 0.5, { ans }]);
    } else out.push(['act', 'zina', ACT_OF[r.out] || 'nod', 1, { ans }], ['wait', EN.NOD, { ans }]);
  }
  out.push(['shot', 'establish'], ['walk', 'courier', 'car', { wait: false }], ['wait', EN.LEAVE]);
  // конец: не ждём, пока курьер дойдёт до машины и герой скроется (story.js ждал бы до 3 с) — сцена кончается тут
  out.push(['do', o => { for (const n of ['courier', 'zina']) { const a = o.actor(n); if (a) a.to = null; } return null; }]);
  return out;
}

/* курьер — к своему месту у двери: 1,8 м от стены и 1,1 м вбок, сбоку (со стороны камеры — она смотрит через его плечо, а за героем
   видно квартиру); wait — дождаться, пока дойдёт */
function courierTo (o, wait) {
  const a = o.actor('courier'), h = o.home;
  if (!a || !h) return null;
  const cs = -((STORY.DEBUG.CUT && STORY.DEBUG.CUT.side) || 1);
  const x = h.ex - h.sx * cs * 1.1 + h.nx * 1.8, z = h.ez - h.sz * cs * 1.1 + h.nz * 1.8;
  if (o.skip) { a.x = x; a.z = z; a.to = null; return null; }
  a.to = { x, z };
  if (!wait) return null;
  return (async () => { for (let k = 0; k < 50 && a.to; k++) await o.wait(0.1); })();
}

/* герой из двери — на шаг к стороне камеры (0,2 м): проём за ним открыт */
function hostTo (o) {
  const a = o.actor('zina'), h = o.home;
  if (!a || !h) return null;
  const cs = -((STORY.DEBUG.CUT && STORY.DEBUG.CUT.side) || 1);
  const x = h.ex - h.sx * cs * 0.2 + h.nx * 0.95, z = h.ez - h.sz * cs * 0.2 + h.nz * 0.95;
  if (o.skip) { a.x = x; a.z = z; return null; }
  a.to = { x, z };
  return null;
}

function register () {
  for (const h of HEROES) {
    // характер героя (actorlife.js) — по id истории; свой ключ, общий CHAR не трогаем
    LIFE.CHAR[SID(h)] = h.char;
    const meets = meetsOf(h);
    h.meets = meets;
    const p = personOf(h);
    STORY.register({
      id: SID(h), kind: 'meet', name: h.name,
      who: { seed: h.seed, fem: h.fem, look: p.look },
      items: N_('пицца'),
      chapters: meets.map(s => ({ name: s.id, stars: 0, money: 0, noReward: true, script: scriptOf(h, s) })),
      model: () => modelOf(h),
      place: () => M.spot,
      shot: meetShot,                 // свои планы камеры (story.js shotPose): герой с квартирой за спиной
      autoSay: true,                  // реплики без ответов листаются сами (пауза 1,2—2,5 с по длине; Enter — сразу)
      cps: EN.CPS,
      ready: () => false,             // в очередь глав не ходит: встречу зовут ENC.play (песочница; в игре — потом)
      onDone: () => { const q = STORY.progOf(SID(h)); q.ch = 0; STORY.persist(); },
    });
  }
}

/* планы камеры встречи: 'zina' (герой крупно) — мимо плеча курьера; 'cat' — заглянуть за дверь, в квартиру героя
   (кота во встречах нет — имя плана свободно); 'two' — реакция, оба сбоку; 'establish' — подъезд целиком поближе
   (мусор, крысы, цветы). 'courier' и 'car' — как у story.js */
/* план 'zina' (герой крупно, 10.10.2026 — автор: «голова курьера сбоку закрывает героя»): камера в (px — вбок, «+» — к курьеру;
   pz — от стены; py — высота), смотрит в (lx, lz, ly). Курьер — в (1,1; 1,8), герой — в (0,2; 0,95): камера с другой стороны оси
   двери и в 5,4 м от стены — курьер краем кадра сбоку (спина и плечо), герой целиком от пояса до макушки над окном реплики */
export const SHOT_ZINA = { px: -0.7, pz: 5.4, py: 1.6, lx: 0.2, lz: 0.95, ly: 0.92 };
function meetShot (name, h, side, gy) {
  const cs = -side;
  const W = (lx, lz) => [h.ex - h.sx * lx + h.nx * lz, h.ez - h.sz * lx + h.nz * lz];
  if (name === 'zina') {                 // через плечо курьера: он — краем кадра сбоку, герой целиком по пояс, над окном реплики
    const [px, pz] = W(cs * SHOT_ZINA.px, SHOT_ZINA.pz), [lx, lz] = W(cs * SHOT_ZINA.lx, SHOT_ZINA.lz);
    return [[px, gy + SHOT_ZINA.py, pz], [lx, gy + SHOT_ZINA.ly, lz], [-h.nx * 0.03, 0, -h.nz * 0.03]];
  }
  if (name === 'cat') {                // story.js пускает только свои имена планов — 'cat' у встреч = «заглянуть в квартиру»
    const [px, pz] = W(-cs * 0.1, 4.0), [lx, lz] = W(-cs * 0.5, 0.3);
    return [[px, gy + 1.7, pz], [lx, gy + 0.98, lz], [h.sx * side * -0.06, 0.01, h.sz * side * -0.06]];
  }
  if (name === 'two') {                // реакция: оба сбоку, с дальней от курьера стороны
    const [px, pz] = W(-cs * 2.6, 3.5), [lx, lz] = W(cs * 0.55, 1.3);
    return [[px, gy + 1.85, pz], [lx, gy + 1.15, lz], [h.nx * 0.04, 0, h.nz * 0.04]];
  }
  if (name === 'establish') {
    const [px, pz] = W(cs * 3.6, 7.6), [lx, lz] = W(0, 1.1);
    return [[px, gy + 3.1, pz], [lx, gy + 1.15, lz], [h.sx * side * -0.12, 0, h.sz * side * -0.12]];
  }
  return null;
}

/* 3D-модель героя: человек; у деда — кот Барсик на плече */
function modelOf (h) {
  const g = A.makeHuman(personOf(h));
  if (h.cat) {
    const c = makeCatModel(A.THREE, FURS[0], true);
    c.scale.setScalar(0.62);
    c.position.set(0.22, 1.36, -0.04);
    c.rotation.y = Math.PI / 2;
    g.add(c);
    g.userData.cat = c;
  }
  g.rotation.order = 'YXZ';           // наклон пьяного (rotation.x) — в его собственных осях
  return g;
}

/* ─────────────── где: ближайший подъезд ─────────────── */
function spotNear (x, z) {
  const E = (A.CITY && A.CITY.entrances) || [];
  let best = null, bd = EN.NEAR * EN.NEAR;
  for (const q of E) {
    const d = (q[0] - x) ** 2 + (q[1] - z) ** 2;
    if (d >= bd) continue;
    let [ex, ez, nx, nz] = q;
    const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    // перед дверью свободно: тамбур, курьер и камера не в стене
    if (A.inHouse && (A.inHouse(ex + nx * 1.2, ez + nz * 1.2, 0.5) || A.inHouse(ex + nx * 3, ez + nz * 3, 0.8) || A.inHouse(ex + nx * 6, ez + nz * 6, 1))) continue;
    bd = d; best = { ex, ez, nx, nz, sx: -nz, sz: nx, x: ex + nx * 5, z: ez + nz * 5, addr: '' };
  }
  return best;
}

/* ─────────────── антураж: кубики одним мешем ─────────────── */
function Kit (T) {
  const L = { lam: [], glow: [], glass: [], room: [] };
  let roomZ = -1, roomX = 0;              // квартира за дверью: коробки внутри тамбура — без теней, «свет горит» (room)
  const setRoom = (z, x) => { roomZ = z; roomX = x; };
  const BX = new T.BoxGeometry(1, 1, 1), BP = BX.attributes.position.array, BN = BX.attributes.normal.array, BI = BX.index.array;
  const mx = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), s = new T.Vector3(), p = new T.Vector3(), nm = new T.Matrix3();
  const col = new T.Color();
  /* коробка: размеры, центр, цвет; r — поворот [x, y, z] (рад); kind — lam | glow (светится) | glass (прозрачное) */
  const box = (w, h, d, x, y, z, c, r, kind = 'lam') => {
    if (kind === 'lam' && z < roomZ && Math.abs(x) < roomX) kind = 'room';
    L[kind].push([w, h, d, x, y, z, c, r || null]);
  };
  function mesh (kind, mat) {
    const list = L[kind];
    if (!list.length) return null;
    const n = list.length, pos = new Float32Array(n * 72), nor = new Float32Array(n * 72), cl = new Float32Array(n * 72), idx = new Uint32Array(n * 36);
    list.forEach(([w, h, d, x, y, z, c, r], b) => {
      e.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0); q.setFromEuler(e);
      mx.compose(p.set(x, y, z), q, s.set(w, h, d)); nm.setFromMatrix4(mx.clone().makeRotationFromQuaternion(q));
      col.set(c);
      const o = b * 72;
      for (let k = 0; k < 72; k += 3) {
        v.set(BP[k], BP[k + 1], BP[k + 2]).applyMatrix4(mx); pos[o + k] = v.x; pos[o + k + 1] = v.y; pos[o + k + 2] = v.z;
        v.set(BN[k], BN[k + 1], BN[k + 2]).applyMatrix3(nm); nor[o + k] = v.x; nor[o + k + 1] = v.y; nor[o + k + 2] = v.z;
        // без света (квартира): грани светлее / темнее по направлению — объём без ламп
        const sh = kind !== 'room' ? 1 : v.y > 0.5 ? 0.95 : v.y < -0.5 ? 0.55 : Math.abs(v.z) > 0.5 ? 0.85 : 0.7;
        cl[o + k] = col.r * sh; cl[o + k + 1] = col.g * sh; cl[o + k + 2] = col.b * sh;
      }
      for (let k = 0; k < 36; k++) idx[b * 36 + k] = BI[k] + b * 24;
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.BufferAttribute(nor, 3));
    g.setAttribute('color', new T.BufferAttribute(cl, 3));
    g.setIndex(new T.BufferAttribute(idx, 1));
    list.length = 0;
    return new T.Mesh(g, mat);
  }
  return { box, mesh, setRoom, done: () => BX.dispose() };
}

/* текстура из холста (граффити, коврик, портрет, флаг, вывеска) — крупный пиксель */
function canvasTex (T, w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  draw(x, w, h);
  const tx = new T.CanvasTexture(c);
  tx.colorSpace = T.SRGBColorSpace;
  tx.magFilter = T.NearestFilter; tx.minFilter = T.LinearFilter; tx.generateMipmaps = false;
  return tx;
}
const font = (px, b) => (b ? 'bold ' : '') + px + 'px "Trebuchet MS", Arial, sans-serif';
function scrawl (x, s, X, Y, px, c, rot = 0) {
  x.save(); x.translate(X, Y); x.rotate(rot);
  x.font = font(px, true); x.fillStyle = c; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(s, 0, 0);
  x.restore();
}

/* палитры тамбура: стена, низ стены (краска), пол, дверь, наличник, козырёк, стена квартиры за дверью */
const PAL = {
  wreck: { wall: '#7f8f7a', low: '#4f6a52', floor: '#5a544c', door: '#5a3a2a', frame: '#3a3430', roof: '#8a8a84', back: '#8a7a5a', lamp: '#ffe9a8' },
  nice: { wall: '#efe4d0', low: '#9cc2a8', floor: '#c86a4a', door: '#8a5a3a', frame: '#f4f1ea', roof: '#f4f1ea', back: '#f2d7b0', lamp: '#ffd79a' },
  granny: { wall: '#c8b8d0', low: '#6b5a7a', floor: '#7a5a4a', door: '#6b2e2e', frame: '#4a3a3a', roof: '#b8b2aa', back: '#d9c4a0', lamp: '#fff0c0' },
  cop: { wall: '#9aa6b0', low: '#3b4a5a', floor: '#6b6560', door: '#2b2a30', frame: '#1f2328', roof: '#9a948c', back: '#d8d2c2', lamp: '#e8f4ff' },
  loft: { wall: '#a8563a', low: '#7a3a26', floor: '#3a3036', door: '#6fc2b0', frame: '#1f1c1a', roof: '#1f1c1a', back: '#a8563a', lamp: '#ffc070' },
  foil: { wall: '#5a6a7a', low: '#3a4a5a', floor: '#3a4048', door: '#3a4a5a', frame: '#c8ccd2', roof: '#6b7780', back: '#c8ccd2', lamp: '#b8ffb0' },
  dark: { wall: '#3a3a44', low: '#22222a', floor: '#26262c', door: '#1f1f24', frame: '#15151a', roof: '#4a4a52', back: '#2a2a32', lamp: '#8fb8ff' },
  order: { wall: '#ece8dc', low: '#2e4a6b', floor: '#8a6a4a', door: '#7a3a2a', frame: '#e0c060', roof: '#ece8dc', back: '#f4f1ea', lamp: '#fff4d0' },
};

/* антураж ставится шагом ['do'] в начале встречи: тамбур к двери подъезда, кусок квартиры, подъезд вокруг */
function setDecor (o) {
  clearDecor();
  const h = o.home, H = M.hero;
  if (!h || !H || !A) return null;
  const T = A.THREE, K = Kit(T), P = PAL[H.decor] || PAL.wreck;
  const side = (STORY.DEBUG.CUT && STORY.DEBUG.CUT.side) || 1;
  const cs = -side;                    // в осях тамбура (x — вдоль стены, z — от стены): камера — на стороне cs
  const D = EN.DEPTH, OW = EN.OPEN_W, WW = OW + 0.8, HT = 2.5, hw = WW / 2, ow = OW / 2;
  const g = new T.Group();
  g.name = 'enc-decor';
  g.position.set(h.ex, A.groundH(h.ex + h.nx * 0.6, h.ez + h.nz * 0.6), h.ez);
  g.rotation.y = Math.atan2(h.nx, h.nz);
  const mats = [], texs = [], anim = { blink: [], rats: [], fish: [], cat: null };
  const lam = new T.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const glowM = new T.MeshBasicMaterial({ vertexColors: true });
  const glassM = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false });
  mats.push(lam, glowM, glassM);
  const plane = (w, hh, x, y, z, ry, tex, o2 = {}) => {
    const inRoom = z < D - 0.02 && Math.abs(x) < hw - 0.11 && !ry;          // в квартире за дверью — без теней, как с включённым светом
    const m = new (inRoom ? T.MeshBasicMaterial : T.MeshLambertMaterial)({ map: tex, transparent: !!o2.alpha, alphaTest: o2.alpha ? 0.4 : 0, side: T.DoubleSide });
    if (inRoom) m.color.setScalar(0.85);
    if (o2.glow && !inRoom) { m.emissive = new T.Color('#ffffff'); m.emissiveMap = tex; m.emissiveIntensity = o2.glow; }
    mats.push(m); texs.push(tex);
    const pl = new T.Mesh(new T.PlaneGeometry(w, hh), m);
    pl.position.set(x, y, z); pl.rotation.y = ry || 0;
    g.add(pl);
    return pl;
  };
  const { box } = K;
  K.setRoom(D - 0.02, hw - 0.11);
  const roomM = new T.MeshBasicMaterial({ vertexColors: true });
  mats.push(roomM);
  const R = (a, b) => a + Math.random() * (b - a);

  // ── тамбур: пол, боковые стены, передняя стена с проёмом, козырёк, стена квартиры за дверью
  box(WW + 0.1, 0.08, D + 0.1, 0, 0.04, D / 2, P.floor);
  box(WW + 0.5, 0.12, 0.7, 0, 0.06, D + 0.35, '#9a948c');                                  // крыльцо
  for (const sx of [-1, 1]) {
    box(0.1, HT, D, sx * (hw - 0.05), HT / 2, D / 2, P.wall);
    box(0.104, 1.0, D + 0.004, sx * (hw - 0.05), 0.5, D / 2, P.low);                       // низ стены — краской
    box((hw - ow), HT, 0.12, sx * (ow + (hw - ow) / 2), HT / 2, D, P.wall);                 // передняя стена у проёма
    box((hw - ow) + 0.004, 1.0, 0.124, sx * (ow + (hw - ow) / 2), 0.5, D, P.low);
    box(0.07, 2.12, 0.16, sx * (ow + 0.035), 1.06, D, P.frame);                             // наличник
  }
  box(OW + 0.14, HT - 2.12, 0.12, 0, 2.12 + (HT - 2.12) / 2, D, P.wall);
  box(OW + 0.14, 0.07, 0.16, 0, 2.15, D, P.frame);
  box(WW + 0.7, 0.12, D + 0.9, 0, HT + 0.06, D / 2 + 0.3, P.roof);                         // козырёк
  box(WW - 0.1, HT - 0.1, 0.04, 0, HT / 2, 0.03, P.back);                                  // стена квартиры (на стене дома)
  box(WW - 0.1, 0.04, D, 0, HT - 0.02, D / 2, mix(P.back, '#000000', 0.25));               // потолок тамбура
  // лампа под козырьком: светится (разбитый подъезд — мигает)
  const lampM = new T.MeshBasicMaterial({ color: P.lamp });
  mats.push(lampM);
  const lamp = new T.Mesh(new T.BoxGeometry(0.16, 0.12, 0.16), lampM);
  lamp.position.set(0, HT - 0.08, D + 0.45);
  g.add(lamp);
  box(0.03, 0.12, 0.03, 0, HT - 0.0, D + 0.45, '#2b2a30');
  anim.blink.push({ m: lampM, base: new T.Color(P.lamp), flicker: H.decor === 'wreck' || H.decor === 'dark' });
  const lampIn = new T.MeshBasicMaterial({ color: P.lamp });
  mats.push(lampIn);
  const bulb = new T.Mesh(new T.BoxGeometry(0.1, 0.1, 0.1), lampIn);
  bulb.position.set(-cs * 0.3, HT - 0.18, D * 0.45);
  g.add(bulb);
  anim.blink.push({ m: lampIn, base: new T.Color(P.lamp), flicker: H.decor === 'wreck' });

  // ── дверь тамбура: петли со стороны камеры, распахнута наружу почти до стены — не закрывает квартиру
  const door = new T.Group();
  door.position.set(cs * ow, 0, D + 0.07);
  const dk = Kit(T);
  dk.box(OW - 0.04, 2.06, 0.05, -cs * (OW / 2 - 0.02), 1.03, 0, P.door);
  dk.box(0.05, 0.12, 0.08, -cs * (OW - 0.14), 1.02, 0.04, '#d9b36a');                      // ручка
  dk.box(0.18, 0.12, 0.012, -cs * (OW / 2), 1.7, 0.03, '#d9b36a');                           // номер
  if (H.decor === 'wreck') for (let k = 0; k < 5; k++) dk.box(R(0.08, 0.2), R(0.1, 0.3), 0.012, -cs * R(0.15, OW - 0.15), R(0.3, 1.9), 0.031, k % 2 ? '#8a6a4a' : '#c8b088');   // дерматин порван
  if (H.decor === 'cop') for (const y of [0.5, 1.0, 1.5]) dk.box(OW - 0.12, 0.03, 0.012, -cs * (OW / 2), y, 0.031, '#4a4a52');
  const dm = dk.mesh('lam', lam); dk.done();
  door.add(dm);
  door.rotation.y = 0;
  g.add(door);
  anim.door = door; anim.doorOpen = cs * 2.9;          // на сколько открыта (рад): наружу, почти к стене

  // ── квартира за дверью и подъезд вокруг — по герою
  const ctx = { T, g, box, plane, cs, D, OW, WW, HT, hw, ow, P, R, adult: !!A.ADULT, anim, texs, mats, canvasTex: (w, hh, f) => canvasTex(T, w, hh, f) };
  try { (DECOR[H.decor] || DECOR.wreck)(ctx); } catch (e) { console.warn('[encounters] decor', e); }

  if (anim.fish.length) {                // рыбки в аквариумах — своими мешами (плавают)
    const fm = new T.MeshBasicMaterial({ color: '#ff8a3a' });
    mats.push(fm);
    for (const f of anim.fish) { f.m = new T.Mesh(new T.BoxGeometry(0.06, 0.035, 0.02), fm); f.m.position.set(f.x, f.y, f.z + 0.02); g.add(f.m); }
  }
  for (const [kind, m] of [['lam', lam], ['room', roomM], ['glow', glowM], ['glass', glassM]]) { const ms = K.mesh(kind, m); if (ms) g.add(ms); }
  K.done();
  // крысы — каждая своим мешем (бегают)
  for (const r of anim.rats) g.add(r.g);
  A.scene.add(g);
  M.decor = { g, mats, texs, anim };
  M.t = 0; M.slam = false; M.doorK = 0;
  return null;
}
function clearDecor () {
  const d = M.decor;
  if (!d) return;
  if (d.g.parent) d.g.parent.remove(d.g);
  d.g.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
  for (const m of d.mats) m.dispose();
  for (const tx of d.texs) tx.dispose();
  M.decor = null;
}
function mix (a, b, k) {
  const h = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
  const x = h(a), y = h(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('');
}

/* крыса: туловище, голова, уши, хвост (своим мешем — бегает вдоль стены) */
function rat (c, x, z) {
  const k = Kit(c.T);
  k.box(0.2, 0.08, 0.09, 0, 0.05, 0, '#6b6560');
  k.box(0.08, 0.07, 0.08, 0.13, 0.055, 0, '#7a746e');
  for (const s of [-1, 1]) k.box(0.02, 0.035, 0.03, 0.12, 0.1, s * 0.03, '#d9a0a0');
  k.box(0.015, 0.015, 0.015, 0.175, 0.06, 0, '#2a1d16');
  k.box(0.24, 0.015, 0.015, -0.21, 0.03, 0, '#d9a0a0');
  const m = k.mesh('lam', c.mats[0]); k.done();
  const g = new c.T.Group(); g.add(m);
  g.position.set(x, 0.01, z);
  return { g, x, z, to: x, wait: Math.random() * 1.5, sp: 2.2 + Math.random() * 1.2 };
}

/* ─────────────── подъезды и квартиры ───────────────
   c: box(w,h,d,x,y,z,цвет,[поворот],kind), plane(w,h,x,y,z,ry,текстура,{alpha,glow}), cs — сторона камеры (x),
   D — глубина тамбура (квартира: z от 0 до D, стена квартиры — z≈0.05), снаружи — z > D; adult — взрослая */
const DECOR = {
  /* а) разбитый подъезд: облезлые стены, граффити, мусор, бутылки, крысы, мигающая лампа; за дверью — бардак, телевизор, бутылки */
  wreck (c) {
    const { box, plane, cs, D, hw, ow, R, adult } = c;
    // облезлая краска: пятна бетона
    for (let k = 0; k < 9; k++) { const sx = k % 2 ? 1 : -1; box(R(0.1, 0.3), R(0.08, 0.25), 0.01, sx * R(ow + 0.05, hw - 0.05), R(0.3, 2.2), D + 0.066, '#a9a59a'); }
    // граффити на передней стене и боках
    const tags = [t('Здесь был Вася'), t('ВИТЯ + ЛЕНА'), adult ? t('Толик — лох') : t('Толик — зануда')];
    const gtx = c.canvasTex(128, 96, (x, w, hh) => {
      x.clearRect(0, 0, w, hh);
      scrawl(x, tags[0], 64, 22, 15, '#d9342c', -0.08);
      scrawl(x, tags[1], 60, 50, 14, '#2e4a8a', 0.06);
      scrawl(x, tags[2], 66, 78, 13, '#1d1a1f', -0.04);
    });
    plane(0.5, 0.38, cs * (hw - 0.01), 1.45, D / 2, cs * Math.PI / 2, gtx, { alpha: true });
    const g2 = c.canvasTex(96, 96, (x, w, hh) => {
      x.clearRect(0, 0, w, hh);
      if (adult) scrawl(x, t('ХУЙ'), 48, 30, 26, '#1d1a1f', 0.1);
      else scrawl(x, t('Я ТУТ БЫЛ'), 48, 30, 15, '#1d1a1f', 0.1);
      x.strokeStyle = '#3f8a4a'; x.lineWidth = 3; x.beginPath();
      for (let k = 0; k < 8; k++) x.lineTo(10 + k * 10, 70 + Math.sin(k * 1.7) * 12);
      x.stroke();
    });
    plane(0.32, 0.32, -cs * (ow + (hw - ow) / 2), 1.3, D + 0.067, 0, g2, { alpha: true });
    // объявление «лифт не работает»
    const note = c.canvasTex(64, 48, (x, w, hh) => { x.fillStyle = '#f4efe2'; x.fillRect(0, 0, w, hh); scrawl(x, t('ЛИФТ НЕ'), 32, 16, 10, '#1d1a1f'); scrawl(x, t('РАБОТАЕТ'), 32, 32, 10, '#d9342c'); });
    plane(0.22, 0.16, cs * (ow + (hw - ow) / 2), 1.6, D + 0.067, 0, note);
    // мусор у подъезда: пакеты, бутылки, банки, окурки, лужа, покрышка
    for (const [x, z, s] of [[-cs * 1.25, D + 0.4, 1], [-cs * 1.5, D + 0.7, 0.8], [-cs * 1.1, D + 0.8, 0.7]]) box(0.42 * s, 0.4 * s, 0.38 * s, x, 0.2 * s, z, '#1f1f24', [0, R(-0.5, 0.5), R(-0.15, 0.15)]);
    for (let k = 0; k < 9; k++) {
      const lie = k % 3 !== 0, x = (k % 2 ? cs : -cs) * R(0.8, 2.2), z = D + R(0.2, 1.8);
      const gc = ['#2f6b3a', '#6b3a1a', '#3a5a2a'][k % 3];
      if (lie) box(0.07, 0.07, 0.24, x, 0.04, z, gc, [0, R(0, 3), 0]);
      else { box(0.07, 0.22, 0.07, x, 0.11, z, gc); box(0.03, 0.07, 0.03, x, 0.25, z, gc); }
    }
    for (let k = 0; k < 6; k++) box(0.06, 0.1, 0.06, (k % 2 ? cs : -cs) * R(0.6, 2.4), 0.03, D + R(0.3, 2), ['#c23a3a', '#c8ccd2', '#3f7fd6'][k % 3], [Math.PI / 2, R(0, 3), 0]);
    for (let k = 0; k < 12; k++) box(0.04, 0.012, 0.012, R(-1.2, 1.2), 0.006, D + R(0.2, 1.4), '#f4efe2', [0, R(0, 3), 0]);
    box(1.0, 0.01, 0.7, cs * 0.9, 0.005, D + 1.4, '#3a4048');
    box(0.56, 0.18, 0.56, -cs * 2.1, 0.09, D + 1.3, '#1f1f24', [0, 0.4, 0]);
    // крысы
    for (let k = 0; k < EN.RATS; k++) c.anim.rats.push(rat(c, R(-2.2, 2.2), D + 0.2 + k * 0.18));
    // квартира: обои с пятнами, телевизор на табуретке, бутылки рядами, матрас, часы стоят
    const wp = c.canvasTex(64, 64, (x, w, hh) => {
      x.fillStyle = '#8a7a5a'; x.fillRect(0, 0, w, hh);
      x.fillStyle = '#7a6a4a'; for (let yy = 0; yy < hh; yy += 8) for (let xx = (yy / 8) % 2 * 4; xx < w; xx += 8) x.fillRect(xx, yy, 3, 3);
      x.fillStyle = 'rgba(40,30,20,.45)'; x.beginPath(); x.ellipse(20, 40, 14, 10, 0, 0, 7); x.fill();
      x.fillStyle = '#b8a888'; x.fillRect(44, 8, 14, 22);                                     // ободрано
    });
    plane(c.WW - 0.14, c.HT - 0.14, 0, c.HT / 2, 0.055, 0, wp);
    box(0.36, 0.38, 0.32, -cs * 0.45, 0.19, 0.3, '#5a3a22');                                  // табуретка
    box(0.5, 0.4, 0.36, -cs * 0.45, 0.58, 0.28, '#2b2a30');                                   // телевизор
    box(0.4, 0.3, 0.01, -cs * 0.45, 0.6, 0.465, '#5a8ad9', null, 'glow');
    c.anim.tv = true;
    for (let k = 0; k < 7; k++) box(0.06, 0.24, 0.06, cs * (0.1 + k * 0.08), 0.12, 0.14, ['#2f6b3a', '#6b3a1a'][k % 2]);
    box(0.6, 0.12, 0.5, cs * 0.35, 0.06, 0.4, '#8a8a7a', [0, 0.2, 0]);                     // матрас
    box(0.3, 0.12, 0.3, cs * 0.25, 0.16, 0.45, '#4f7fd6', [0.2, 0.6, 0.3]);                // куча одежды
    box(0.18, 0.18, 0.03, cs * 0.5, 1.9, 0.07, '#f4f1ea'); box(0.02, 0.07, 0.01, cs * 0.5, 1.93, 0.09, '#1d1a1f');
  },

  /* б) красивый подъезд: чисто, цветы, коврик «добро пожаловать», тёплый свет; за дверью — уют, фото, полка, миски Барсика */
  nice (c) {
    const { box, plane, cs, D, hw, R } = c;
    const mat = c.canvasTex(96, 48, (x, w, hh) => {
      x.fillStyle = '#8a5a3a'; x.fillRect(0, 0, w, hh); x.strokeStyle = '#e0b13f'; x.lineWidth = 3; x.strokeRect(4, 4, w - 8, hh - 8);
      scrawl(x, t('Добро пожаловать'), 48, 24, 10, '#f4efe2');
    });
    const mp = plane(0.9, 0.45, 0, 0.13, D + 0.45, 0, mat); mp.rotation.x = -Math.PI / 2;
    for (const [x, z, fc] of [[-1.25, D + 0.25, '#d9342c'], [-1.6, D + 0.25, '#ffd23f'], [1.25, D + 0.25, '#e86f9a'], [1.6, D + 0.25, '#8e6fd0']]) {
      box(0.26, 0.24, 0.26, x, 0.12, z, '#c86a4a'); box(0.28, 0.04, 0.28, x, 0.25, z, '#a8563a');
      box(0.18, 0.12, 0.18, x, 0.33, z, '#3f8a4a');
      for (let k = 0; k < 4; k++) box(0.07, 0.07, 0.07, x + R(-0.09, 0.09), R(0.4, 0.5), z + R(-0.09, 0.09), fc);
    }
    box(0.12, 0.05, 0.12, cs * 0.75, 0.15, D + 0.55, '#4f7fd6'); box(0.12, 0.05, 0.12, cs * 0.92, 0.15, D + 0.55, '#d9342c');   // миски кота
    box(0.04, 0.9, 0.04, -cs * (hw + 0.2), 0.45, D + 0.2, '#8a6b3a', [0, 0, 0.15]); box(0.22, 0.2, 0.06, -cs * (hw + 0.27), 0.08, D + 0.2, '#e0b13f');   // веник
    // квартира: обои в цветочек, фото в рамках, полка с цветами, вешалка, ковровая дорожка
    const wp = c.canvasTex(64, 64, (x, w, hh) => {
      x.fillStyle = '#f2d7b0'; x.fillRect(0, 0, w, hh);
      for (let yy = 4; yy < hh; yy += 16) for (let xx = (yy / 16) % 2 * 8 + 4; xx < w; xx += 16) { x.fillStyle = '#e8a0a8'; x.fillRect(xx, yy, 4, 4); x.fillStyle = '#9cc2a8'; x.fillRect(xx + 1, yy + 4, 2, 3); }
    });
    plane(c.WW - 0.14, c.HT - 0.14, 0, c.HT / 2, 0.055, 0, wp);
    for (const [x, y, w2, h2] of [[-cs * 0.5, 1.6, 0.26, 0.2], [-cs * 0.2, 1.75, 0.18, 0.22], [cs * 0.45, 1.6, 0.24, 0.18]]) {
      box(w2, h2, 0.03, x, y, 0.08, '#8a6b3a'); box(w2 - 0.05, h2 - 0.05, 0.01, x, y, 0.098, ['#8fb8de', '#a8d5a2', '#f2c57c'][Math.abs(Math.round(x * 10)) % 3]);
    }
    box(0.7, 0.04, 0.22, -cs * 0.45, 1.15, 0.16, '#8a6b3a');
    for (let k = 0; k < 3; k++) { box(0.1, 0.1, 0.1, -cs * (0.25 + k * 0.2), 1.22, 0.16, '#c86a4a'); box(0.12, 0.14, 0.12, -cs * (0.25 + k * 0.2), 1.34, 0.16, '#59b06a'); }
    box(0.04, 1.7, 0.04, cs * 0.62, 0.85, 0.35, '#5a3a22'); box(0.3, 0.5, 0.18, cs * 0.62, 1.4, 0.35, '#6b2e4a');   // вешалка с пальто
    box(0.7, 0.012, D - 0.1, 0, 0.088, D / 2, '#c9476b');                                    // дорожка
  },

  /* злая бабка: «вытирай ноги!», банки с огурцами, искусственные цветы; за дверью — ковёр на стене, телевизор орёт */
  granny (c) {
    const { box, plane, cs, D, ow, hw, adult } = c;
    const mat = c.canvasTex(96, 48, (x, w, hh) => { x.fillStyle = '#5a4a3a'; x.fillRect(0, 0, w, hh); scrawl(x, t('ВЫТИРАЙ НОГИ!'), 48, 24, 11, '#f4efe2'); });
    const mp = plane(0.9, 0.45, 0, 0.13, D + 0.45, 0, mat); mp.rotation.x = -Math.PI / 2;
    const sign = c.canvasTex(80, 48, (x, w, hh) => {
      x.fillStyle = '#f4efe2'; x.fillRect(0, 0, w, hh); x.strokeStyle = '#d9342c'; x.lineWidth = 3; x.strokeRect(2, 2, w - 4, hh - 4);
      scrawl(x, t('Курьерам —'), 40, 16, 9, '#1d1a1f'); scrawl(x, t('звонить 1 раз!'), 40, 32, 9, '#d9342c');
    });
    plane(0.3, 0.18, cs * (ow + (hw - ow) / 2), 1.5, D + 0.067, 0, sign);
    box(0.36, 0.42, 0.36, -cs * 1.2, 0.21, D + 0.3, '#8a6b3a');                               // табуретка
    for (let k = 0; k < 3; k++) { box(0.11, 0.18, 0.11, -cs * (1.08 + k * 0.12), 0.51, D + 0.3, '#a8d5a2', null, 'glass'); box(0.08, 0.1, 0.08, -cs * (1.08 + k * 0.12), 0.48, D + 0.3, '#3f8a4a'); box(0.12, 0.03, 0.12, -cs * (1.08 + k * 0.12), 0.615, D + 0.3, '#c8a040'); }
    box(0.12, 0.3, 0.12, cs * 1.2, 0.15, D + 0.3, '#4f7fd6');                                 // ваза с искусственными цветами
    for (let k = 0; k < 5; k++) box(0.06, 0.06, 0.06, cs * (1.14 + (k % 3) * 0.05), 0.36 + (k % 2) * 0.06, D + 0.28 + (k % 2) * 0.05, ['#d9342c', '#ffd23f', '#e86f9a'][k % 3]);
    // ковёр на стене
    const rug = c.canvasTex(64, 48, (x, w, hh) => {
      x.fillStyle = '#8a1f2a'; x.fillRect(0, 0, w, hh); x.fillStyle = '#e0b13f'; x.fillRect(3, 3, w - 6, 2); x.fillRect(3, hh - 5, w - 6, 2);
      for (let k = 0; k < 4; k++) { x.fillStyle = k % 2 ? '#2e4a6b' : '#f4efe2'; x.beginPath(); x.moveTo(8 + k * 14, 24); x.lineTo(14 + k * 14, 14); x.lineTo(20 + k * 14, 24); x.lineTo(14 + k * 14, 34); x.fill(); }
    });
    plane(c.WW - 0.2, c.HT - 0.14, 0, c.HT / 2, 0.055, 0, c.canvasTex(8, 8, (x) => { x.fillStyle = '#d9c4a0'; x.fillRect(0, 0, 8, 8); }));
    plane(1.1, 0.8, 0, 1.45, 0.06, 0, rug);
    box(0.5, 0.4, 0.36, -cs * 0.45, 0.78, 0.25, '#3a3036'); box(0.42, 0.3, 0.01, -cs * 0.45, 0.8, 0.435, '#7ad9a0', null, 'glow');   // телевизор
    box(0.6, 0.58, 0.36, -cs * 0.45, 0.29, 0.24, '#6b4a2e');                                  // тумба
    c.anim.tv = true;
    box(0.2, 0.06, 0.1, cs * 0.3, 0.11, 0.5, '#d95d5d'); box(0.2, 0.06, 0.1, cs * 0.08, 0.11, 0.52, '#d95d5d');   // тапки
    if (adult) box(0.1, 0.06, 0.1, -cs * 0.6, 1.06, 0.25, '#f4f1ea');                      // корвалол
  },

  /* продажный мент: стальная дверь, коробки с новой техникой; за дверью — плазма во всю стену, фуражка на гвозде, сейф */
  cop (c) {
    const { box, plane, cs, D, R } = c;
    const lbl = (s1, s2, col) => c.canvasTex(64, 48, (x, w, hh) => { x.fillStyle = col; x.fillRect(0, 0, w, hh); scrawl(x, s1, 32, 18, 12, '#1d1a1f'); scrawl(x, s2, 32, 34, 9, '#d9342c'); });
    const boxes = [[-cs * 1.25, D + 0.35, 0.7, 0.5, 0.18, lbl(t('ПЛАЗМА'), '65″', '#e8dcb0')], [-cs * 1.3, D + 0.35, 0.5, 0.4, 0.4, lbl(t('СВЧ'), t('новая'), '#d9d2c2')], [cs * 1.3, D + 0.3, 0.45, 0.45, 0.45, lbl(t('ТЕЛЕФОН'), '×12', '#e8dcb0')]];
    let y0 = { };
    for (const [x, z, w, hh, d, tx] of boxes) {
      const k = x.toFixed(1), y = y0[k] || 0;
      box(w, hh, d, x, y + hh / 2, z, '#c8a878');
      plane(w * 0.8, hh * 0.7, x, y + hh / 2, z + d / 2 + 0.005, 0, tx);
      y0[k] = y + hh;
    }
    for (let k = 0; k < 4; k++) box(0.5, 0.18, 0.5, cs * 2.0, 0.09 + k * 0.18, D + 0.9, '#1f1f24', [0, k * 0.2, 0]);   // новые покрышки
    // квартира: плазма во всю стену, фуражка на гвозде, сейф, ещё коробки
    box(1.0, 0.6, 0.06, -cs * 0.25, 1.35, 0.08, '#1d1a1f'); box(0.94, 0.54, 0.01, -cs * 0.25, 1.35, 0.115, '#59b0e0', null, 'glow');
    c.anim.tv = true;
    box(0.26, 0.06, 0.26, cs * 0.55, 1.75, 0.15, '#3b4a5a'); box(0.2, 0.08, 0.2, cs * 0.55, 1.81, 0.15, '#3b4a5a'); box(0.28, 0.02, 0.12, cs * 0.55, 1.72, 0.27, '#1f1c1a');   // фуражка
    box(0.4, 0.5, 0.36, -cs * 0.45, 0.25, 0.25, '#4a4a52'); box(0.08, 0.08, 0.02, -cs * 0.45, 0.3, 0.44, '#c8ccd2');   // сейф
    for (let k = 0; k < 3; k++) box(R(0.3, 0.4), R(0.25, 0.35), 0.3, cs * (0.15 + k * 0.25), 0.15 + (k === 1 ? 0.3 : 0), 0.3, '#c8a878');
  },

  /* модник с кофе: кирпич, гирлянда с лампочками, монстера, «пятая кофейня»; за дверью — пластинки, кофемашина, лампы Эдисона */
  loft (c) {
    const { box, plane, cs, D, hw, R } = c;
    const brick = c.canvasTex(64, 64, (x, w, hh) => {
      x.fillStyle = '#d9c4a0'; x.fillRect(0, 0, w, hh);
      for (let yy = 0; yy < hh; yy += 8) for (let xx = -((yy / 8) % 2) * 8; xx < w; xx += 16) { x.fillStyle = ['#a8563a', '#9a4a30', '#b8603e'][(xx + yy) % 3 & 3] || '#a8563a'; x.fillRect(xx + 1, yy + 1, 14, 6); }
    });
    for (const s of [-1, 1]) plane(hw - c.ow, c.HT - 0.1, s * (c.ow + (hw - c.ow) / 2), c.HT / 2, D + 0.065, 0, brick);
    plane(c.WW - 0.14, c.HT - 0.14, 0, c.HT / 2, 0.055, 0, brick);
    for (let k = 0; k < 9; k++) box(0.06, 0.08, 0.06, -hw - 0.2 + k * ((c.WW + 0.4) / 8), c.HT - 0.12 - Math.sin(k / 8 * Math.PI) * 0.18, D + 0.62, '#ffd27a', null, 'glow');   // гирлянда
    box(0.34, 0.34, 0.34, -cs * 1.25, 0.17, D + 0.3, '#f4f1ea');
    for (let k = 0; k < 6; k++) box(0.34, 0.03, 0.18, -cs * 1.25 + R(-0.12, 0.12), R(0.45, 0.9), D + 0.3 + R(-0.12, 0.12), '#3f8a4a', [R(-0.6, 0.6), R(0, 3), R(-0.5, 0.5)]);   // монстера
    const board = c.canvasTex(64, 80, (x, w, hh) => { x.fillStyle = '#2b2a30'; x.fillRect(0, 0, w, hh); scrawl(x, t('КОФЕ'), 32, 18, 13, '#f4efe2'); scrawl(x, t('5-я кофейня'), 32, 40, 8, '#ffd27a'); scrawl(x, t('на улице'), 32, 54, 8, '#ffd27a'); scrawl(x, '★★★★★', 32, 68, 8, '#f4efe2'); });
    const bp = plane(0.4, 0.5, cs * 1.25, 0.32, D + 0.35, cs * -0.3, board); bp.rotation.x = -0.12;
    box(0.5, 0.5, 0.36, cs * 1.85, 0.25, D + 0.4, '#8a6b3a');                                // ящик пластинок
    for (let k = 0; k < 4; k++) box(0.04, 0.32, 0.32, cs * (1.68 + k * 0.1), 0.6, D + 0.4, ['#1d1a1f', '#d9342c', '#ffd23f', '#3f7fd6'][k]);
    // квартира: полка с пластинками, кофемашина (хром), лампочки Эдисона на проводах
    box(0.8, 0.04, 0.2, -cs * 0.35, 1.1, 0.15, '#3a3036');
    for (let k = 0; k < 8; k++) box(0.03, 0.3, 0.28, -cs * (0.05 + k * 0.08), 1.27, 0.15, ['#1d1a1f', '#d9342c', '#f4f1ea', '#3f7fd6'][k % 4]);
    box(0.36, 0.4, 0.3, cs * 0.45, 0.85, 0.2, '#c8ccd2'); box(0.38, 0.6, 0.32, cs * 0.45, 0.32, 0.2, '#3a3036');
    box(0.06, 0.06, 0.06, cs * 0.38, 0.92, 0.36, '#d9342c');
    for (const x of [-0.35, 0.05, 0.4]) { box(0.01, 0.4, 0.01, cs * x, c.HT - 0.25, 0.4, '#1d1a1f'); box(0.07, 0.1, 0.07, cs * x, c.HT - 0.5, 0.4, '#ffb050', null, 'glow'); }
  },

  /* инопланетянин: фольга на окнах и стенах, антенна, провода; за дверью — аквариумы светятся, под простынёй мигает зелёное */
  foil (c) {
    const { box, plane, cs, D, hw, R } = c;
    const foil = c.canvasTex(64, 64, (x, w, hh) => {
      x.fillStyle = '#b8bec6'; x.fillRect(0, 0, w, hh);
      for (let k = 0; k < 90; k++) { x.fillStyle = Math.random() < 0.5 ? '#e8eef4' : '#8a929c'; x.fillRect((Math.random() * w) | 0, (Math.random() * hh) | 0, 3 + ((Math.random() * 5) | 0), 2 + ((Math.random() * 4) | 0)); }
    });
    for (const s of [-1, 1]) plane(hw - c.ow - 0.02, 1.2, s * (c.ow + (hw - c.ow) / 2), 1.5, D + 0.066, 0, foil, { glow: 0.15 });
    plane(c.WW - 0.14, c.HT - 0.14, 0, c.HT / 2, 0.055, 0, foil, { glow: 0.12 });
    box(0.04, 0.6, 0.04, cs * 1.2, c.HT + 0.4, D + 0.2, '#c8ccd2'); box(0.4, 0.05, 0.4, cs * 1.2, c.HT + 0.7, D + 0.2, '#c8ccd2', [0.6, 0, 0]);   // тарелка на козырьке
    for (let k = 0; k < 3; k++) box(0.02, 0.02, 1.4, cs * (0.9 + k * 0.08), 0.02, D + 0.6, ['#d9342c', '#ffd23f', '#3f7fd6'][k], [0, R(-0.3, 0.3), 0]);   // провода
    box(0.3, 0.32, 0.3, -cs * 1.3, 0.16, D + 0.4, '#6b7780'); box(0.26, 0.02, 0.26, -cs * 1.3, 0.3, D + 0.4, '#7aff6a', null, 'glow');   // ведро — что-то светится
    // квартира: два аквариума, рыбки, простыня — под ней мигает зелёное
    for (const [x, y] of [[-cs * 0.45, 1.05], [cs * 0.45, 0.6]]) {
      box(0.5, 0.36, 0.3, x, y, 0.22, '#59c2d9', null, 'glass');
      box(0.52, 0.04, 0.32, x, y + 0.2, 0.22, '#2b2a30'); box(0.52, 0.04, 0.32, x, y - 0.2, 0.22, '#2b2a30');
      box(0.48, 0.03, 0.28, x, y - 0.16, 0.22, '#e0c080');
      for (let k = 0; k < 3; k++) c.anim.fish.push({ x, y: y + R(-0.1, 0.1), z: 0.22, ph: R(0, 6), sp: R(1, 2) });
    }
    box(0.5, 0.56, 0.3, cs * 0.45, 0.2, 0.22, '#3a4048');
    box(0.5, 0.36, 0.4, -cs * 0.35, 0.18, 0.45, '#f4f1ea', [0, 0.2, 0]);                     // простыня
    box(0.46, 0.02, 0.36, -cs * 0.35, 0.01, 0.45, '#7aff6a', null, 'glow');
    c.anim.green = true;
  },

  /* хикан: темно, банки энергетиков, окурки, турник в проёме; за дверью — монитор светит синим, геймерское кресло */
  dark (c) {
    const { box, plane, cs, D, ow, R, adult } = c;
    for (let k = 0; k < 10; k++) box(0.07, 0.13, 0.07, (k % 2 ? cs : -cs) * R(0.7, 2.2), 0.065, D + R(0.2, 1.6), ['#7aff6a', '#3f7fd6', '#ffd23f'][k % 3], k % 3 ? [Math.PI / 2, R(0, 3), 0] : null);
    if (adult) for (let k = 0; k < 14; k++) box(0.04, 0.012, 0.012, R(-1.3, 1.3), 0.006, D + R(0.15, 1.2), '#f4efe2', [0, R(0, 3), 0]);
    const tag = c.canvasTex(96, 48, (x, w, hh) => { x.clearRect(0, 0, w, hh); scrawl(x, t('НЕ ПОДХОДИ'), 48, 24, 12, '#d9342c', -0.06); });
    plane(0.4, 0.2, cs * (ow + 0.2), 1.6, D + 0.067, 0, tag, { alpha: true });
    box(c.OW - 0.1, 0.04, 0.04, 0, 2.0, D - 0.06, '#c8ccd2');                                 // турник в проёме
    // квартира: монитор, кресло, банки пирамидой, плакат
    box(0.56, 0.36, 0.04, -cs * 0.4, 1.0, 0.1, '#1d1a1f'); box(0.5, 0.3, 0.01, -cs * 0.4, 1.0, 0.125, '#5a8aff', null, 'glow');
    c.anim.tv = true;
    box(0.7, 0.04, 0.4, -cs * 0.4, 0.72, 0.22, '#2b2a30'); box(0.04, 0.7, 0.04, -cs * 0.1, 0.35, 0.22, '#2b2a30'); box(0.04, 0.7, 0.04, -cs * 0.7, 0.35, 0.22, '#2b2a30');
    box(0.4, 0.5, 0.1, -cs * 0.35, 0.75, 0.55, '#d9342c'); box(0.44, 0.08, 0.42, -cs * 0.35, 0.45, 0.4, '#1d1a1f');   // кресло
    for (let r = 0; r < 3; r++) for (let k = 0; k <= 2 - r; k++) box(0.07, 0.13, 0.07, cs * (0.3 + k * 0.08 + r * 0.04), 0.065 + r * 0.13, 0.2, '#7aff6a');
  },

  /* «за власть»: чисто, флажки города, табличка «образцовый порядок»; за дверью — портрет в рамке, лозунг, флаги,
     а на кровати — бонг (во взрослой) или гора фантиков (в детской) */
  order (c) {
    const { box, plane, cs, D, hw, ow, R, adult } = c;
    const flag = c.canvasTex(48, 32, (x, w, hh) => {
      x.fillStyle = '#2e4a8a'; x.fillRect(0, 0, w, hh); x.fillStyle = '#ffd23f';
      x.beginPath(); x.arc(24, 16, 7, 0, 7); x.fill();
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; x.fillRect(24 + Math.cos(a) * 10 - 1, 16 + Math.sin(a) * 10 - 1, 3, 3); }
    });
    for (const s of [-1, 1]) {
      box(0.03, 1.4, 0.03, s * (hw + 0.15), 0.7 + 0.6, D + 0.15, '#e0c060', [0, 0, s * 0.35]);
      plane(0.42, 0.28, s * (hw + 0.42), 1.95, D + 0.15, 0, flag);
    }
    const plaq = c.canvasTex(96, 40, (x, w, hh) => { x.fillStyle = '#e0c060'; x.fillRect(0, 0, w, hh); x.fillStyle = '#7a5a20'; x.fillRect(3, 3, w - 6, hh - 6); scrawl(x, t('ДОМ ОБРАЗЦОВОГО'), 48, 14, 8, '#ffe9a8'); scrawl(x, t('ПОРЯДКА'), 48, 27, 10, '#ffe9a8'); });
    plane(0.36, 0.15, cs * (ow + (hw - ow) / 2), 1.55, D + 0.067, 0, plaq);
    for (const s of [-1, 1]) { box(0.3, 0.3, 0.3, s * 1.3, 0.15, D + 0.25, '#f4f1ea'); box(0.28, 0.28, 0.28, s * 1.3, 0.45, D + 0.25, '#3f8a4a'); }   // стриженые кусты
    const mat = c.canvasTex(32, 16, (x, w, hh) => { x.fillStyle = '#2e4a6b'; x.fillRect(0, 0, w, hh); x.fillStyle = '#e0c060'; x.fillRect(2, 2, w - 4, 1); x.fillRect(2, hh - 3, w - 4, 1); });
    const mp = plane(0.9, 0.45, 0, 0.13, D + 0.45, 0, mat); mp.rotation.x = -Math.PI / 2;
    // квартира: портрет начальства в золотой рамке, лозунг, флажки, кровать с покрывалом; на ней — бонг / фантики
    const por = c.canvasTex(32, 40, (x, w, hh) => {
      x.fillStyle = '#6b8aa8'; x.fillRect(0, 0, w, hh);
      x.fillStyle = '#2b2a30'; x.fillRect(6, 26, 20, 14);                                    // китель
      x.fillStyle = '#e0c060'; x.fillRect(9, 30, 2, 2); x.fillRect(13, 30, 2, 2); x.fillRect(9, 34, 2, 2);   // медали
      x.fillStyle = '#e8bb92'; x.fillRect(10, 10, 12, 15);                                   // лицо
      x.fillStyle = '#2a1d16'; x.fillRect(10, 8, 12, 3); x.fillRect(12, 15, 3, 1); x.fillRect(17, 15, 3, 1); x.fillRect(13, 21, 6, 1);   // строгий
      x.fillStyle = '#2b2a30'; x.fillRect(7, 4, 18, 5); x.fillRect(5, 8, 22, 2);              // фуражка
    });
    box(0.42, 0.52, 0.03, -cs * 0.42, 1.65, 0.07, '#e0c060');
    plane(0.36, 0.46, -cs * 0.42, 1.65, 0.087, 0, por);
    const slog = c.canvasTex(128, 24, (x, w, hh) => { x.fillStyle = '#c23a3a'; x.fillRect(0, 0, w, hh); scrawl(x, t('ПОРЯДОК — ВО ВСЁМ'), 64, 12, 11, '#ffe9a8'); });
    plane(1.1, 0.2, 0, 2.15, 0.07, 0, slog);
    for (const x of [-cs * 0.62, cs * 0.25]) { box(0.02, 0.5, 0.02, x, 1.6, 0.1, '#e0c060', [0, 0, 0.4]); plane(0.22, 0.14, x + 0.11, 1.85, 0.1, 0, flag); }
    // кровать — на дальней от камеры стороне (её видно рядом с героем в проёме)
    const bx = -cs * 0.45;
    box(0.7, 0.32, 0.6, bx, 0.16, 0.38, '#5a3a22'); box(0.68, 0.1, 0.58, bx, 0.37, 0.38, '#2e4a6b'); box(0.3, 0.1, 0.2, bx - cs * 0.15, 0.45, 0.18, '#f4f1ea');
    if (adult) {
      // бонг: колба, горлышко, чашечка — зелёное стекло
      const bz = 0.56, bb = bx + cs * 0.14;
      box(0.15, 0.15, 0.15, bb, 0.5, bz, '#7ad9a0', null, 'glass');
      box(0.08, 0.42, 0.08, bb, 0.78, bz, '#7ad9a0', null, 'glass');
      box(0.09, 0.03, 0.09, bb, 0.99, bz, '#59b06a');
      box(0.025, 0.14, 0.025, bb + cs * 0.08, 0.53, bz, '#c8ccd2', [0, 0, cs * 0.7]);
      box(0.05, 0.04, 0.05, bb + cs * 0.13, 0.6, bz, '#5a3a22');
      box(0.1, 0.05, 0.07, bx + cs * 0.12, 0.08, 0.66, '#3f8a4a');                         // пакетик у кровати
    } else {
      for (let k = 0; k < 22; k++) box(0.06, 0.02, 0.04, bx + R(-0.2, 0.25), 0.44 + R(0, 0.08), 0.38 + R(-0.18, 0.18), ['#d9342c', '#ffd23f', '#3f7fd6', '#e86f9a', '#59b06a'][k % 5], [R(-0.4, 0.4), R(0, 3), R(-0.4, 0.4)]);
    }
  },
};

/* ─────────────── кадр: лампа мигает, крысы бегают, дверь, пьяный качается ─────────────── */
function frame (dt, on) {
  if (!M.on) return;
  const d = M.decor, CUT = STORY.DEBUG.CUT;
  M.t += dt;
  const a = CUT && CUT.actors && CUT.actors.zina;
  // прохожие у двери на время встречи — прочь из кадра (мир стоит; после сцены игра сама вернёт видимость)
  const sp = M.spot;
  if (sp && A.people) for (const list of A.people() || []) for (const p of list) {
    if (p && p.grp && p.grp.visible && !p.dead && (p.x - sp.ex) ** 2 + (p.z - sp.ez) ** 2 < 100) p.grp.visible = false;
  }
  if (d) {
    const an = d.anim;
    for (const b of an.blink) {
      let k = 1;
      if (b.flicker) { b.k = b.k === undefined ? 1 : b.k; if (Math.random() < dt * 5) b.k = Math.random() < 0.35 ? 0.08 : 0.6 + Math.random() * 0.4; k = b.k; }
      b.m.color.copy(b.base).multiplyScalar(k);
    }
    if (an.tv && Math.random() < dt * 8) d.mats[1].color.setScalar(0.7 + Math.random() * 0.3);   // экран телевизора мерцает
    for (const f of an.fish) { const k = Math.sin(M.t * f.sp + f.ph); f.m.position.x = f.x + k * 0.18; f.m.rotation.y = Math.cos(M.t * f.sp + f.ph) > 0 ? 0 : Math.PI; }
    for (const r of an.rats) {
      if (r.wait > 0) { r.wait -= dt; continue; }
      const dx = r.to - r.x;
      if (Math.abs(dx) < 0.05) { r.wait = Math.random() < 0.5 ? 0.2 + Math.random() * 1.6 : 0; r.to = (Math.random() * 4.4 - 2.2); continue; }
      r.x += Math.sign(dx) * Math.min(Math.abs(dx), r.sp * dt);
      r.g.position.x = r.x;
      r.g.rotation.y = dx > 0 ? 0 : Math.PI;
      r.g.position.y = 0.01 + Math.abs(Math.sin(M.t * 30 + r.z * 10)) * 0.012;
    }
    // дверь тамбура: открывается, когда герой выходит; хлопок — после «ушёл» (slam)
    if (an.door) {
      const want = M.slam && a && a.hidden ? 0 : a && !a.hidden ? 1 : 0;
      const sp = M.slam && want === 0 ? 14 : 3.2;
      M.doorK += (want - M.doorK) * Math.min(1, dt * sp);
      an.door.rotation.y = an.doorOpen * M.doorK;
    }
  }
  if (a && M.hero) {
    // пьяный: качается, а когда вываливается из двери — клюёт вперёд
    if (M.hero.lean) a.grp.rotation.x = 0.1 + Math.sin(M.t * 1.7) * 0.07 + (a.to ? 0.22 : 0);
    const c = a.grp.userData.cat;
    if (c && c.userData.tail) c.userData.tail.rotation.y = Math.sin(M.t * 3) * 0.5;
  }
}

/* ─────────────── снаружи ─────────────── */
/* для песочницы: какой подъезд и квартира (по-русски, игроку не показывается) */
const DECOR_NAME = { wreck: 'разбитый подъезд, крысы, бутылки', nice: 'чисто, цветы, коврик', granny: '«вытирай ноги!», ковёр на стене', cop: 'коробки с техникой, плазма',
  loft: 'кирпич, гирлянда, пластинки', foil: 'фольга, аквариумы', dark: 'темно, энергетики, турник', order: 'флаги, портрет — и бонг на кровати' };
export function list () {
  return HEROES.map(h => ({ id: h.id, name: t(h.name), who: h.who, decor: DECOR_NAME[h.decor] || h.decor, meets: (h.meets || []).map((s, i) => ({ i, id: s.id, say: t(s.say), a: t(s.a.me), b: t(s.b.me) })) }));
}

export function play (id, i = 0, o = {}) {
  const h = HEROES.find(q => q.id === id);
  if (!A || !h || STORY.active() || M.on) return Promise.resolve(null);
  const sp = o.spot || spotNear(A.V.x, A.V.z);
  if (!sp) return Promise.resolve(null);
  M.hero = h; M.spot = sp; M.on = true; M.slam = false; M.doorK = 0;
  const t0 = performance.now(), n0 = A.scene.children.length;
  M.stats.played++;
  const vi = Math.max(0, Math.min((h.meets || []).length - 1, +i || 0));
  return STORY.play(SID(h), vi, { teleport: true }).then(() => {
    const CUT = STORY.DEBUG.CUT;
    if (CUT.skip) M.stats.skipped++;
    M.stats.last = { id, meet: h.meets[vi].id, ans: CUT.ans || null, skip: !!CUT.skip, ms: Math.round(performance.now() - t0) };
    return M.stats.last;
  }).finally(() => {
    clearDecor();
    M.on = false; M.hero = null;
    // осталось ли что-то от встречи в сцене (антураж, актёры): должно быть 0
    M.stats.leak = A.scene.children.filter(o => o.name === 'enc-decor').length + (STORY.DEBUG.CUT.actors && Object.keys(STORY.DEBUG.CUT.actors).length || 0);
    M.stats.sceneDelta = A.scene.children.length - n0;  // для сведения: город вокруг сам достраивается (окна, прохожие)
  });
}

export function init (api) {
  A = api;
  if (M.ready) return;
  M.ready = true;
  register();
  STORY.onFrame(frame);
  if (typeof window !== 'undefined') window.setTimeout(() => { if (window.__dlv) window.__dlv.ENC = DEBUG; }, 0);
}

const DEBUG = { EN, SHOT_ZINA, M, HEROES, list, play, get scene () { return A && A.scene; }, spotNear: (x, z) => spotNear(x, z), skip: () => STORY.DEBUG.skip(), get decor () { return M.decor; } };
