/* ─────────────── Сюжетные заказы и катсцены (карьера, Стим) ───────────────
   История — это человек и несколько глав. Глава — доставка ему домой,
   с условиями (с какой смены, в какие часы), а вручение — катсцена:
   чёрные полосы сверху и снизу, камера на человеке у подъезда, реплики
   через dialog.js (большая голова), простые действия (помахал, ушёл в
   подъезд, вышел кот). Esc или «пропустить» — сразу к награде.

   Кто и с какой смены — STORY_PEOPLE в orders.config.js; главы, реплики и
   сценарии — ниже, в STORIES. Прогресс — в сохранении 'dlv-story'.

   Для orders.js:
     STORY.nextOrder({ shift, hour, x, z })   → спецификация заказа или null
     STORY.stage(order)                        — поставить человека у двери (необязательно)
     await STORY.onDeliver(order)              — катсцена + награда → { stars, money }
     STORY.onCancel(order)                     — заказ сорвался: глава снова в очереди
   Для game.js:
     STORY.init(api)                            — один раз, после сборки города
     STORY.frame(dt, car)                       — каждый кадр; true — идёт катсцена (мир стоит)

   Формат сценария — список шагов [что, ...аргументы]:
     ['title']                       — плашка «имя · глава N · название»
     ['shot', имя, { cut }]          — план камеры (см. SHOTS); cut — склейкой, иначе наездом
     ['say', кто, N_('текст'), { mood }]
     ['walk', кто, куда, { wait }]   — куда: front | door | in | out | car | side
     ['act', кто, действие, сек]     — wave | nod | shake | shrug | give | joy | hug | sad | think
     ['face', кто, на кого]
     ['give']                        — коробка из рук курьера — в руки хозяину
     ['cat', что]                    — out | sit | rub | meow | in
     ['emote', кто, heart | note | star, n]
     ['scarf']                       — шарф на машину (и насовсем, в сохранении)
     ['wait', сек]
   Последним аргументом шага можно дать условия: { if: 'ok' | 'bad' } — только если условие
   главы выполнено / провалено (успеть, не разбить, заехать по пути — herostories.js),
   { adult: true | false } — только во взрослой / только в детской, { when: () => bool } — своё условие
   (например, на какой машине приехал), у 'say' — { vars: () => ({ car }) } — подстановки в текст. Кто: 'courier' — курьер,
   любое другое имя (zina, stepa, host…) — хозяин истории.

   Другие истории (герои города — herostories.js) добавляются через register(story):
     who: { seed, fem, look }    — внешность для портрета; model() — своя 3D-модель (герой с болгаркой)
     name                        — имя, если человека нет в STORY_PEOPLE
     home: { addr, near, any }   — или функция → то же: дом выбирается заново (герой стоит где хочет)
     ready(ctx, prog, shift)     — вместо fromShift/every: пора ли следующей главе
     decorate(order, ch, idx)    — дописать заказ (время, хрупкое, заезд по пути)
     cond(order) → 'ok' | 'bad'  — как прошло условие главы; глава: moneyBad — награда при 'bad'
     onDone(idx, cond, order)    — после награды (мелкий бонус)
     kids: { items }, глава kids: { name, note, why } — для детской версии
     catFur                      — номер окраса кота из cats.js FURS для ['cat', …] */
import './story.css';
import { t, N_ } from '../i18n/index.js';
import * as ECON from './econ.js';
import * as DLG from './dialog.js';
import { STORY_PEOPLE, ORDER_TYPES } from './orders.config.js';
import { makePerson } from './people.js';
import { makeCatModel, FURS } from './cats.js';
import * as DIRECTOR from './director.js';   // режиссёр событий (director.js)
import * as QR from './quickrun.js';             // быстрый заезд: глав нет

// career.js пишет другой агент: берём, если он уже есть, и не падаем, если нет
const CAREER_MOD = import.meta.glob('./career.js', { eager: true })['./career.js'] || null;
const careerMod = async () => CAREER_MOD;

export const COLOR = (ORDER_TYPES.story && ORDER_TYPES.story.color) || ECON.ORDERS.COLORS.story || '#ff3ea5';

/* ─────────────── истории ─────────────── */
/* look — поверх внешности из зерна: так человек одинаковый всегда и везде */
const ZINA_LOOK = {
  f: true, age: 'old', hairC: '#d4d0ca', hair: 'bun', head: 'bandana', headC: '#c9476b', beard: 'none',
  glasses: 'round', glassC: '#6b3a22', wrinkles: true, shape: 'chubby', fat: true, blush: true,
  top: 'long', bottom: 'skirt', shirt: '#8e6fd0', jacket: '#6b2e4a', skirt: '#5a4a3a', legs: '#c9b8a8', shoes: '#5a3a22',
  mouth: 'smile', brows: 'raised', eyes: 'sleepy', lip: null, pack: null, bg: '#e8a0a8', freckles: false, mole: -1,
};
const COURIER_LOOK = {
  f: false, age: 'young', hair: 'short', hairC: '#4a3020', head: 'cap', headC: '#ff6a13', capBack: false, beard: 'stubble', stubble: true,
  glasses: 'none', shape: 'normal', fat: false, top: 'tee', bottom: 'pants', shirt: '#ff6a13', pants: '#2f3540', shoes: '#1f1c1a',
  mouth: 'smile', brows: 'thick', wrinkles: false, pack: null, bg: '#f2c57c',
};

export const STORIES = [
  {
    id: 'zina',
    who: { seed: 0x2a1a, fem: true, look: ZINA_LOOK },
    // панельная пятиэтажка на Ленинградской; нет такого дома в карте — ближайшая панелька к точке
    home: { addr: ['Ленинградская улица', '21'], near: [3099, 2876] },
    items: N_('пицца «Пепперони», большая'),
    chapters: [
      {
        name: N_('Для внука'), hours: [10, 17], stars: 2, money: 1200,
        note: N_('бабушка, 5 этаж, лифта нет. сказала: «для внука»'),
        why: N_('баба Зина заказала пиццу для внука'),
        script: [
          ['title'],
          ['shot', 'establish', { cut: true }],
          ['walk', 'courier', 'front', { wait: false }],
          ['wait', 1.2],
          ['walk', 'zina', 'out'],
          ['shot', 'two'],
          ['act', 'zina', 'wave', 1.2],
          ['say', 'zina', N_('Ой, приехал! Пицца, да? Это внучку моему, Серёженьке. Он у меня в Томске, программист.')],
          ['shot', 'courier', { cut: true }],
          ['say', 'courier', N_('Добрый день! Пепперони, большая. Приятного аппетита внуку!')],
          ['shot', 'zina', { cut: true }],
          ['say', 'zina', N_('Он обещал к обеду заехать. С колбаской, как он любит. Сама-то я её не ем: от неё изжога и мысли.')],
          ['give'],
          ['cat', 'out'],
          ['shot', 'cat'],
          ['cat', 'meow'],
          ['wait', 0.8],
          ['shot', 'two'],
          ['face', 'zina', 'cat'],
          ['say', 'zina', N_('Барсик, брысь! Это не тебе. Барсик у меня за старшего, пока Серёжи нет. Командует.')],
          ['face', 'zina', 'courier'],
          ['act', 'zina', 'give', 1],
          ['say', 'zina', N_('На вот, сынок, за труды. И конфетку возьми — «Коровка», свежая, я её с Нового года берегла.')],
          ['shot', 'courier', { cut: true }],
          ['act', 'courier', 'nod', 1],
          ['say', 'courier', N_('Спасибо… Передавайте Серёже привет.')],
          ['shot', 'establish'],
          ['cat', 'in'],
          ['walk', 'zina', 'in', { wait: false }],
          ['walk', 'courier', 'car', { wait: false }],
          ['wait', 1.6],
        ],
      },
      {
        name: N_('Внук не пришёл'), hours: [17, 22], stars: 3, money: 1600,
        note: N_('опять та бабушка. просила не звонить в домофон: «Барсик пугается»'),
        why: N_('баба Зина снова заказала — «для внука»'),
        script: [
          ['title'],
          ['shot', 'establish', { cut: true }],
          ['walk', 'courier', 'front', { wait: false }],
          ['cat', 'out'],
          ['wait', 1],
          ['walk', 'zina', 'out'],
          ['shot', 'two'],
          ['say', 'zina', N_('А, это ты! Опять ты. Хорошо, что ты — ты хоть приезжаешь.')],
          ['act', 'zina', 'sad', 1.6],
          ['shot', 'zina', { cut: true }],
          ['say', 'zina', N_('Серёжа опять не смог. У него там дедлайн. Это у них вроде посевной — все бегают, а урожая не видно.')],
          ['shot', 'courier', { cut: true }],
          ['act', 'courier', 'shrug', 1.2],
          ['say', 'courier', N_('А прошлая пицца как же?')],
          ['shot', 'cat'],
          ['cat', 'rub'],
          ['say', 'zina', N_('Барсик съел. Всю. Коробку тоже пытался, но коробка оказалась сильнее.')],
          ['shot', 'two'],
          ['give'],
          ['say', 'courier', N_('А может, вы сами попробуете? Она правда вкусная.')],
          ['act', 'zina', 'think', 1.4],
          ['say', 'zina', N_('Сама?.. Ну разве что кусочек. Для пробы. Чтобы Серёже рассказать, какую я ему не оставила.')],
          ['shot', 'zina', { cut: true }],
          ['say', 'zina', N_('Слушай, а шея у тебя какого размера? Да так, просто спрашиваю. Бабушкин интерес.')],
          ['shot', 'courier', { cut: true }],
          ['act', 'courier', 'shake', 1],
          ['say', 'courier', N_('Э-э… обычного?')],
          ['shot', 'two'],
          ['act', 'zina', 'nod', 1.2],
          ['say', 'zina', N_('Обычного, значит. Запомнила. Ну, езжай, езжай, у тебя работа. Шапку надень!')],
          ['emote', 'zina', 'heart', 3],
          ['cat', 'in'],
          ['walk', 'zina', 'in', { wait: false }],
          ['walk', 'courier', 'car', { wait: false }],
          ['shot', 'establish'],
          ['wait', 1.6],
        ],
      },
      {
        name: N_('Внучок'), hours: [9, 15], stars: 5, money: 4000,
        note: N_('баба Зина. в комментарии: «ПОЗВОНИ, КОГДА БУДЕШЬ. ВЫЙДУ САМА»'),
        why: N_('баба Зина ждёт у подъезда — сама вышла'),
        script: [
          ['title'],
          ['shot', 'establish', { cut: true }],
          ['walk', 'zina', 'out', { wait: false }],
          ['cat', 'out'],
          ['walk', 'courier', 'front'],
          ['shot', 'two'],
          ['act', 'zina', 'joy', 1.4],
          ['say', 'zina', N_('Серёжа звонил! Сказал: «Ба, закажи себе пиццу, я оплачу». Вот я и заказала. Себе! Первый раз в жизни.')],
          ['give'],
          ['shot', 'courier', { cut: true }],
          ['say', 'courier', N_('Ну наконец-то! Приятного аппетита вам. И Барсику — только немного.')],
          ['shot', 'zina', { cut: true }],
          ['say', 'zina', N_('Стой, стой, не убегай. Я тебе связала. Шея у тебя, конечно, оказалась так себе…')],
          ['act', 'zina', 'give', 1.2],
          ['say', 'zina', N_('…так что я связала на машину. Двенадцать метров. Барсик помогал, так что узелки — это его.')],
          ['shot', 'car'],
          ['scarf'],
          ['wait', 1.4],
          ['shot', 'courier', { cut: true }],
          ['say', 'courier', N_('На… машину?')],
          ['shot', 'two'],
          ['say', 'zina', N_('А что ей, мёрзнуть? В Солнечном зима девять месяцев, а остальное время — ждём зиму.')],
          ['act', 'courier', 'nod', 1],
          ['say', 'courier', N_('Спасибо, баб Зин.')],
          ['shot', 'zina', { cut: true }],
          ['act', 'zina', 'joy', 1.2],
          ['say', 'zina', N_('Слышал, Барсик? «Баб Зин»! Внучок у нас теперь есть. Настоящий, с доставкой.')],
          ['shot', 'cat'],
          ['cat', 'meow'],
          ['emote', 'zina', 'heart', 5],
          ['shot', 'two'],
          ['act', 'zina', 'hug', 1.6],
          ['emote', 'courier', 'heart', 3],
          ['say', 'zina', N_('Заезжай в четверг. Я пиццу закажу, а пирожки тебе и так дам.')],
          ['shot', 'establish'],
          ['cat', 'in'],
          ['walk', 'zina', 'in', { wait: false }],
          ['walk', 'courier', 'car', { wait: false }],
          ['wait', 1.8],
        ],
      },
    ],
  },
];

/* ─────────────── прогресс ─────────────── */
const KEY = 'dlv-story';
let API = null;
const ST = { data: null, issued: {} };     // issued: storyId → смена, в которую глава уже ушла в очередь

function load () {
  if (ST.data) return ST.data;
  let d = null;
  try { d = API && API.Store ? API.Store.get(KEY, null) : null; } catch (e) { d = null; }
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
  ST.data = d && typeof d === 'object' ? d : {};
  return ST.data;
}
function save () { try { if (API && API.Store) API.Store.set(KEY, ST.data); } catch (e) { /* — */ } }
const prog = id => { const d = load(); return d[id] || (d[id] = { ch: 0, last: -99 }); };

/* быстрый заезд кончился: прогресс — заново из сохранения (встречи с героями на заезде не в счёт) */
export function reload () { ST.data = null; }
export function progress () { return JSON.parse(JSON.stringify(load())); }
/* для herostories.js: живой прогресс истории и запись */
export const progOf = id => prog(id);
export const persist = () => save();
/* ещё одна история (герои города): в конец списка, по id без повторов */
export function register (story) {
  if (!story || !story.id || STORIES.some(s => s.id === story.id)) return false;
  STORIES.push(story);
  return true;
}
const frameHooks = [];
/** fn(dt, cutsceneOn) — каждый кадр из STORY.frame (herostories.js следит за заказом) */
export function onFrame (fn) { if (typeof fn === 'function') frameHooks.push(fn); }
export function reset (id) { const d = load(); if (id) delete d[id]; else for (const k in d) delete d[k]; ST.issued = {}; save(); }
/* для песочницы: истории и главы */
export function list () {
  return STORIES.map(s => ({ id: s.id, name: t(personCfg(s).name || s.id), done: prog(s.id).ch, chapters: s.chapters.map((c, i) => ({ i, name: t(c.name), hours: c.hours || null, minShift: c.minShift || 0 })) }));
}

const personCfg = s => STORY_PEOPLE.find(p => p.id === s.id) || { id: s.id, name: s.name || s.id, fromShift: 1, every: ECON.ORDERS.STORY_EVERY };
const kidsOf = o => (o && API && !API.ADULT && o.kids) || {};
const hostModel = s => (s.model && s.model()) || API.makeHuman(storyPerson(s));
const PEOPLE_CACHE = new Map();
function storyPerson (s) {
  if (PEOPLE_CACHE.has(s.id)) return PEOPLE_CACHE.get(s.id);
  const p = makePerson({ seed: s.who.seed, fem: s.who.fem });
  Object.assign(p.look, s.who.look);
  const name = t(personCfg(s).name);
  Object.assign(p, { id: 'story-' + s.id, name, first: name, last: '', acc: name, gen: name, dat: name, pos: '', story: s.id });
  PEOPLE_CACHE.set(s.id, p);
  return p;
}
function courierPerson () {
  if (PEOPLE_CACHE.has('_courier')) return PEOPLE_CACHE.get('_courier');
  const p = makePerson({ seed: 0xc0de, fem: false });
  Object.assign(p.look, COURIER_LOOK);
  Object.assign(p, { id: 'story-courier', name: t('ты'), first: t('ты'), last: '', pos: '' });
  PEOPLE_CACHE.set('_courier', p);
  return p;
}
/* песочница интерфейса (src/uilab): портреты для реплик без катсцены — хозяин истории и курьер */
export const PERSON = { host: id => { const s = STORIES.find(q => q.id === id); return s ? storyPerson(s) : null; }, courier: () => courierPerson() };

/* ─────────────── где живёт ─────────────── */
const HOME = new Map();
function homeOf (s) {
  // своё место (Стёпа на лавочке, stepabench.js): { ex, ez, nx, nz, sx, sz, x, z, addr } — «дверь» = где он сидит
  if (typeof s.place === 'function') return s.place();
  // home-функция: дом выбирают заново (герой города — у подъезда рядом с тем местом, где стоит)
  const HM = typeof s.home === 'function' ? s.home() : s.home;
  if (!HM) return null;
  const hk = s.id + (HM.near ? ':' + HM.near.map(Math.round).join(',') : '');
  if (HOME.has(hk)) return HOME.get(hk);
  const C = API.CITY, B = C.buildings || [];
  const want = HM.addr;
  let b = want ? B.find(q => q.a && q.a[0] === want[0] && q.a[1] === want[1]) : null;
  if (!b && HM.near) {               // нет в карте — ближайшая панелька к точке (any — любой дом с адресом)
    let bd = Infinity;
    for (const q of B) {
      if (!q.a || (!HM.any && q.st !== 'panel')) continue;
      const c = centroid(q.p), d = (c[0] - HM.near[0]) ** 2 + (c[1] - HM.near[1]) ** 2;
      if (d < bd) { bd = d; b = q; }
    }
  }
  if (!b) return null;
  const [cx, cz] = centroid(b.p);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const q of b.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
  // подъезд этого дома: из карты или сгенерированный; первый по списку — всегда тот же
  let e = null, ed = Infinity;
  for (const q of C.entrances) {
    const inBox = q[0] > x0 - 4 && q[0] < x1 + 4 && q[1] > z0 - 4 && q[1] < z1 + 4;
    const d = (q[0] - cx) ** 2 + (q[1] - cz) ** 2 + (inBox ? 0 : 1e9);
    if (d < ed) { ed = d; e = q; }
  }
  if (!e) return null;
  let [ex, ez, nx, nz] = e;
  const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
  // куда ставить машину: точка доставки во дворе рядом с подъездом (SPOTS), иначе — перед дверью
  const want4 = { x: ex + nx * 4, z: ez + nz * 4 };
  let spot = null, sd = 30 * 30;
  for (const q of API.SPOTS || []) {
    const d = (q.x - want4.x) ** 2 + (q.z - want4.z) ** 2;
    if (d < sd) { sd = d; spot = q; }
  }
  if (!spot) spot = want4;
  const h = { ex, ez, nx, nz, sx: -nz, sz: nx, x: spot.x, z: spot.z, addr: b.a ? API.realAddress(ex + nx * 2, ez + nz * 2) : '' };
  HOME.set(hk, h);
  return h;
}
const centroid = p => p.reduce((a, q) => [a[0] + q[0] / p.length, a[1] + q[1] / p.length], [0, 0]);

/* ─────────────── для orders.js ─────────────── */
const hourOk = (c, h) => !c.hours || h === undefined || h === null || (h >= c.hours[0] && h < c.hours[1]);

/* ctx: { shift, hour, x, z } — номер смены (с 1), час игры (9…24), где курьер */
export function nextOrder (ctx = {}) {
  if (!API || QR.on()) return null;
  if (!DIRECTOR.can('story')) return null;                        // режиссёр: главы — не раньше 3-го заказа сессии                              // быстрый заезд — без сюжета и глав героев (quickrun.js)
  // номер смены: orders.js его не передаёт — тогда берём из сохранения (API.shift)
  const shift = +ctx.shift || (API.shift ? +API.shift() || 0 : 0);
  for (const s of STORIES) {
    const cfg = personCfg(s), p = prog(s.id);
    const c = s.chapters[p.ch];
    if (!c) continue;
    if (ST.issued[s.id] === shift) continue;                      // эта смена уже дала главу
    if (s.ready) {                                                 // свои правила (герои города: встречи и смены)
      if (!s.ready(ctx, p, shift)) continue;
    } else {
      const every = Math.max(cfg.every || 0, 1);
      if (shift < (cfg.fromShift || 1) || shift < (c.minShift || 0)) continue;
      if (p.ch > 0 && shift - p.last < every) continue;
    }
    if (!hourOk(c, ctx.hour)) continue;
    const o = orderFor(s.id, p.ch);
    if (!o) continue;
    o.shift = shift;
    ST.issued[s.id] = shift;
    return o;
  }
  return null;
}

/* спецификация заказа для главы — без проверки условий (песочница, orders.js) */
export function orderFor (storyId, chapter) {
  const s = STORIES.find(q => q.id === storyId);
  const c = s && s.chapters[chapter];
  const h = s && API && homeOf(s);
  if (!c || !h) return null;
  const person = storyPerson(s), K = kidsOf(c), KS = kidsOf(s);
  const o = {
    kind: 'story', type: 'story', storyId, chapter, color: COLOR,
    x: h.x, z: h.z, door: { x: h.ex, z: h.ez, nx: h.nx, nz: h.nz }, addr: h.addr,
    person, name: person.name,
    title: t(K.name || c.name), items: t(K.items || c.items || KS.items || s.items), note: t(K.note || c.note), why: t(K.why || c.why),
    reward: { stars: starsOf(c), money: c.money || 0 },
    reach: 6,
  };
  if (s.decorate) { try { s.decorate(o, c, chapter); } catch (e) { console.warn('[story] decorate', e); } }
  return o;
}
const starsOf = c => { const [a, b] = ECON.ORDERS.STORY_STARS; return Math.max(a, Math.min(b, c.stars || a)); };

/* заказ сорвался (опоздал, отказался, конец смены) — глава снова может выпасть, но не в эту смену */
export function onCancel (order) { if (order && order.storyId) unstage(); }

/* ─────────────── актёры ─────────────── */
const CUT = { on: false, t: 0, skip: false, actors: {}, cat: null, cam: null, waits: [], shot: null, staged: null, el: null, lastCar: null, scarfOn: false };
export const active = () => CUT.on;

function actor (grp, x, z, h) {
  return { grp, x, z, h, want: h, to: null, speed: 1.6, ph: 0, act: null, done: null, hidden: false, hold: null };
}
function placeActor (a) {
  const y = API.groundH(a.x, a.z);
  a.grp.position.set(a.x, y + (a.lift || 0), a.z);
  a.grp.rotation.y = a.h;
}
const angTo = (a, x, z) => Math.atan2(x - a.x, z - a.z);
const dAng = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/* у подъезда: стоит лицом на улицу и ждёт — видно, пока подъезжаешь */
export function stage (order) {
  if (!API || !order || !order.storyId) return;
  const s = STORIES.find(q => q.id === order.storyId), h = s && homeOf(s);
  if (!h) return;
  if (CUT.staged && CUT.staged.id === s.id) return;
  unstage();
  const g = hostModel(s);
  API.scene.add(g);
  const a = s.sit ? actor(g, h.ex, h.ez, Math.atan2(h.nx, h.nz)) : actor(g, h.ex + h.nx * 0.9, h.ez + h.nz * 0.9, Math.atan2(h.nx, h.nz));
  if (s.sit) {                               // сидит (лавочка): высота сиденья, м; ноги вперёд
    a.sit = a.lift = s.sit;
    const u = g.userData;
    if (u.legL) { u.legL.rotation.x = -1.45; u.legR.rotation.x = -1.45; }
  }
  placeActor(a);
  CUT.staged = { id: s.id, a };
}
export function unstage () {
  if (!CUT.staged || CUT.on) return;
  API.dropMesh(CUT.staged.a.grp);
  CUT.staged = null;
}

/* кот Барсик: рыжий с белым, из коробок (модель — cats.js, свои геометрии: dropMesh их освобождает) */
function makeCat () { return makeCatModel(API.THREE, FURS[(CUT.story && CUT.story.catFur) || 0] || FURS[0], true); }

/* шарф на машину: полосатый, через крышу, два хвоста свисают с борта */
const SCARF_C = ['#d9342c', '#f4efe6', '#ffd23f', '#4f7fd6', '#f4efe6'];
/* Габарит кузова в осях машины — только сама машина: без шарфа, без крыльев и сияния оживления
   (game.js вешает их на новую машину до того, как сюда дойдёт кадр: шарф выходил шириной 9 м
   и висел в воздухе), без спрятанного и прозрачного (тень). Матрицы — свои, от машины вниз:
   не важно, где машина стоит и пересчитаны ли её мировые матрицы в этом кадре. */
function carBox (car) {
  const T = API.THREE, bb = new T.Box3();
  const walk = (o, P) => {
    if (!o.visible || (o.userData && (o.userData.scarf || o.userData.noBox))) return;
    if (o.matrixAutoUpdate) o.updateMatrix();
    const M = new T.Matrix4().multiplyMatrices(P, o.matrix);
    if (o.isMesh && o.geometry && !(o.material && o.material.transparent)) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox.clone().applyMatrix4(M);
      if (b.max.y - b.min.y < 6) bb.union(b);
    }
    for (const c of o.children) walk(c, M);
  };
  for (const c of car.children) walk(c, new T.Matrix4());
  if (bb.isEmpty()) bb.set(new T.Vector3(-1, 0, -2), new T.Vector3(1, 1.5, 2));
  // страховка: самая широкая машина — 2,4 м с зеркалами, самая высокая — 2,5 м
  bb.min.x = Math.max(bb.min.x, -1.3); bb.max.x = Math.min(bb.max.x, 1.3); bb.max.y = Math.min(bb.max.y, 2.7);
  return bb;
}
function makeScarf (car) {
  const T = API.THREE;
  const bb = carBox(car);
  const g = new T.Group();
  g.userData.scarf = true;
  const top = bb.max.y, w = bb.max.x - bb.min.x, zc = (bb.min.z + bb.max.z) / 2 - (bb.max.z - bb.min.z) * 0.06;
  const mats = SCARF_C.map(c => new T.MeshLambertMaterial({ color: c, flatShading: true }));
  const seg = 0.16;
  // поперёк крыши
  let i = 0;
  for (let x = -w / 2 - 0.02; x < w / 2 + 0.02; x += seg, i++) {
    const m = new T.Mesh(new T.BoxGeometry(seg, 0.1, 0.42), mats[i % mats.length]);
    m.position.set(bb.min.x + w / 2 + x + seg / 2, top + 0.04, zc);
    g.add(m);
  }
  // вниз по бортам — обмотан
  for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) {
    const m = new T.Mesh(new T.BoxGeometry(0.1, seg, 0.42), mats[(i + k) % mats.length]);
    m.position.set(bb.min.x + w / 2 + sd * (w / 2 + 0.05), top - seg * (k + 0.5), zc);
    g.add(m);
  }
  // два хвоста с бахромой — с левого борта, развеваются
  const tails = [];
  for (const dz of [-0.13, 0.13]) {
    const tl = new T.Group();
    tl.position.set(bb.min.x - 0.06, top - 0.1, zc + dz);
    for (let k = 0; k < 7; k++) {
      const m = new T.Mesh(new T.BoxGeometry(0.06, 0.2, 0.18), mats[(k + (dz > 0 ? 2 : 0)) % mats.length]);
      m.position.set(-0.02, -0.12 - k * 0.2, 0);
      tl.add(m);
    }
    tl.rotation.z = -0.25; tl.rotation.x = dz > 0 ? 0.35 : 0.15;
    g.add(tl);
    tails.push(tl);
  }
  g.userData.tails = tails;
  return g;
}
function scarfStep (car, t) {
  const sc = CUT.scarf;
  if (!sc || sc.parent !== car) return;
  sc.userData.tails.forEach((tl, i) => { tl.rotation.x = (i ? 0.35 : 0.15) + Math.sin(t * 5 + i) * 0.12; tl.rotation.z = -0.25 - Math.abs(Math.sin(t * 3.1 + i)) * 0.15; });
}
/* шарф получен — вешаем на любую машину (и при смене машины) */
export function decorate (car) {
  if (!car || !API) return;
  const want = !!(load().zina && load().zina.scarf);
  const has = car.children.find(c => c.userData && c.userData.scarf);
  if (want && !has) car.add(CUT.scarf = makeScarf(car));
  else if (!want && has) { car.remove(has); CUT.scarf = null; }
  else CUT.scarf = has || null;
}

/* ─────────────── камера ─────────────── */
const V3 = () => new API.THREE.Vector3();
let CP = null, CL = null, CPW = null, CLW = null;
function shotPose (name) {
  const h = CUT.home, A = CUT.actors, V = API.V;
  const gy = API.groundH(h.ex + h.nx * 2, h.ez + h.nz * 2);
  const z = A.zina, c = A.courier;
  const zx = z && !z.hidden ? z.x : h.ex + h.nx * 0.9, zz = z && !z.hidden ? z.z : h.ez + h.nz * 0.9;
  const cx = c ? c.x : h.ex + h.nx * 2.4, cz = c ? c.z : h.ez + h.nz * 2.4;
  const sd = CUT.side, sx = h.sx * sd, sz = h.sz * sd, nx = h.nx, nz = h.nz;
  const mx = (zx + cx) / 2, mz = (zz + cz) / 2;
  switch (name) {
    case 'establish': return [[h.ex + nx * 15 + sx * 6, gy + 5.5, h.ez + nz * 15 + sz * 6], [h.ex + nx * 2, gy + 2.2, h.ez + nz * 2], [-sx * 0.25, 0, -sz * 0.25]];
    // лица — в верхней половине кадра: низ закрывает диалог
    case 'two': return [[mx + sx * 5.2 + nx * 2.2, gy + 1.95, mz + sz * 5.2 + nz * 2.2], [mx, gy + 1.05, mz], [nx * 0.08, 0.02, nz * 0.08]];
    case 'zina': return [[cx + nx * 2.3 + sx * 2.1, gy + 2.05, cz + nz * 2.3 + sz * 2.1], [zx, gy + 1.2, zz], [sx * 0.05, 0, sz * 0.05]];
    case 'courier': return [[zx + nx * 0.35 + sx * 3.3, gy + 1.9, zz + nz * 0.35 + sz * 3.3], [cx, gy + 1.15, cz], [-sx * 0.05, 0, -sz * 0.05]];
    case 'cat': {
      const k = CUT.cat ? CUT.cat : { x: zx + sx * 0.7, z: zz + sz * 0.7 };
      return [[k.x + nx * 1.9 + sx * 0.9, gy + 0.75, k.z + nz * 1.9 + sz * 0.9], [k.x, gy + 0.35, k.z], [sx * 0.08, 0.01, sz * 0.08]];
    }
    case 'car': {                              // машина крупно: камера между подъездом и машиной, сбоку, курьер за кадром
      const dx = h.ex - V.x, dz = h.ez - V.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
      const k = Math.min(4.5, d * 0.5), px = -uz * sd, pz = ux * sd, cy = API.groundH(V.x, V.z);
      return [[V.x + ux * k + px * 3.6, cy + 2.3, V.z + uz * k + pz * 3.6], [V.x, cy + 0.9, V.z], [px * 0.1, 0.02, pz * 0.1]];
    }
    default: return shotPose('two');
  }
}
function setShot (name, cut) {
  const [p, l, drift] = shotPose(name);
  CUT.shot = { name, p, l, drift, t: 0 };
  CPW.set(...p); CLW.set(...l);
  if (cut) { CP.copy(CPW); CL.copy(CLW); }
}
function camStep (dt) {
  const s = CUT.shot, cam = API.cam;
  if (!s) return;
  s.t += dt;
  const [p, l] = shotPose(s.name);           // актёры ходят — план едет за ними
  CPW.set(p[0] + s.drift[0] * s.t, p[1] + s.drift[1] * s.t, p[2] + s.drift[2] * s.t);
  CLW.set(...l);
  const k = 1 - Math.exp(-3.2 * dt);
  CP.lerp(CPW, k); CL.lerp(CLW, 1 - Math.exp(-4.5 * dt));
  cam.position.copy(CP);
  cam.lookAt(CL);
  if (Math.abs(cam.fov - 52) > 0.05) { cam.fov += (52 - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix(); }
}

/* ─────────────── катсцена ─────────────── */
function ui () {
  if (CUT.el) return CUT.el;
  const el = document.createElement('div');
  el.id = 'story-cut';
  el.innerHTML = '<div class="sc-bar sc-top"><div class="sc-title"><em></em><b></b></div>' +
    '<button type="button" class="sc-skip"></button></div><div class="sc-bar sc-bot"></div>';
  (document.getElementById('game') || document.body).appendChild(el);
  el.querySelector('.sc-skip').addEventListener('click', e => { e.stopPropagation(); skip(); });
  CUT.el = el;
  return el;
}
function skip () {
  if (!CUT.on || CUT.skip) return;
  CUT.skip = true;
  if (DLG.dismiss) DLG.dismiss();
  for (const w of CUT.waits.splice(0)) w();
}
const onKey = e => {
  if (!CUT.on) return;
  if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) skip(); }
  // руль, нитро и карта в катсцене не работают — до игры клавиши не доходят
  else if (!DLG.isOpen() && !/^F\d+$/.test(e.code)) { e.stopImmediatePropagation(); }
};
function wait (sec) {
  if (CUT.skip) return Promise.resolve();
  return new Promise(res => { const until = CUT.t + sec; const w = () => { CUT.waits = CUT.waits.filter(q => q !== w); res(); }; w.until = until; CUT.waits.push(w); });
}
function until (fn, max = 8) {
  if (CUT.skip) return Promise.resolve();
  return new Promise(res => { const w = () => { CUT.waits = CUT.waits.filter(q => q !== w); res(); }; w.until = CUT.t + max; w.fn = fn; CUT.waits.push(w); });
}

function spot (where, who) {
  const h = CUT.home, V = API.V;
  switch (where) {
    case 'out': return who === 'courier' ? spot('front', who) : [h.ex + h.nx * 0.9, h.ez + h.nz * 0.9];
    case 'door': return [h.ex + h.nx * 0.2, h.ez + h.nz * 0.2];
    case 'in': return [h.ex - h.nx * 0.5, h.ez - h.nz * 0.5];
    case 'front': return [h.ex + h.nx * 2.3, h.ez + h.nz * 2.3];
    case 'side': return [h.ex + h.nx * 1.4 + h.sx * CUT.side * 0.9, h.ez + h.nz * 1.4 + h.sz * CUT.side * 0.9];
    case 'car': { const d = Math.hypot(V.x - h.ex, V.z - h.ez); return d < 16 ? [V.x, V.z] : [h.ex + h.nx * 9, h.ez + h.nz * 9]; }
    default: return [h.ex + h.nx * 2, h.ez + h.nz * 2];
  }
}

function walk (who, where, o = {}) {
  const a = CUT.actors[who];
  if (!a) return Promise.resolve();
  const [x, z] = spot(where, who);
  a.hidden = false; a.grp.visible = true;
  if (CUT.skip) { a.x = x; a.z = z; placeActor(a); return Promise.resolve(); }
  a.to = { x, z, hide: where === 'in' || (where === 'car' && who === 'courier') };
  const p = until(() => !a.to, 12);
  return o.wait === false ? Promise.resolve() : p;
}

const ACTS = { wave: 1.4, nod: 1, shake: 1, shrug: 1.2, give: 1, joy: 1.4, hug: 1.6, sad: 1.6, think: 1.4 };
function act (who, kind, sec) {
  const a = CUT.actors[who];
  if (!a) return;
  a.act = { kind, t: 0, dur: sec || ACTS[kind] || 1 };
  if (kind === 'hug') {                 // обнять: подходит вплотную
    const o = CUT.actors[who === 'zina' ? 'courier' : 'zina'];
    if (o) { const dx = o.x - a.x, dz = o.z - a.z, d = Math.hypot(dx, dz) || 1; a.hugFrom = [a.x, a.z]; a.to = { x: a.x + dx / d * Math.max(0, d - 0.75), z: a.z + dz / d * Math.max(0, d - 0.75), keep: true }; }
  }
}

function actorStep (a, dt) {
  const u = a.grp.userData;
  if (a.to) {
    const dx = a.to.x - a.x, dz = a.to.z - a.z, d = Math.hypot(dx, dz);
    if (d < 0.06) {
      a.x = a.to.x; a.z = a.to.z;
      if (a.to.hide) { a.hidden = true; a.grp.visible = false; }
      a.to = null;
    } else {
      const st = Math.min(d, a.speed * dt);
      a.x += dx / d * st; a.z += dz / d * st;
      a.want = Math.atan2(dx, dz);
      a.ph += dt * 8;
    }
  } else if (a.look) a.want = angTo(a, a.look.x, a.look.z);
  a.h += dAng(a.h, a.want) * Math.min(1, dt * 7);
  placeActor(a);
  const walking = !!a.to;
  const sw = walking ? Math.sin(a.ph) * 0.6 : 0;
  if (u.legL) { u.legL.rotation.x = a.sit ? -1.45 : sw; u.legR.rotation.x = a.sit ? -1.45 : -sw; }
  let aL = walking ? -sw * 0.6 : 0, aR = walking ? sw * 0.6 : 0, zL = 0, zR = 0, hx = 0, hy = 0, lift = 0;
  if (a.hold) aL = aR = -1.15;
  const q = a.act;
  if (q) {
    q.t += dt;
    const k = q.t / q.dur, env = Math.sin(Math.min(1, k) * Math.PI);
    switch (q.kind) {
      case 'wave': aR = -2.7; zR = 0.25 + Math.sin(q.t * 11) * 0.35; break;
      case 'nod': hx = Math.sin(q.t * 9) * 0.28 * env; break;
      case 'shake': hy = Math.sin(q.t * 11) * 0.4 * env; break;
      case 'shrug': zL = -0.6 * env; zR = 0.6 * env; aL = aR = -0.5 * env; break;
      case 'give': aR = -1.4 * env; if (!a.hold) aL = -0.3 * env; break;
      case 'joy': lift = Math.abs(Math.sin(q.t * 9)) * 0.18 * env; aL = aR = -2.6 * env; zL = -0.3 * env; zR = 0.3 * env; break;
      case 'hug': aL = aR = -1.45 * env; zL = 0.35 * env; zR = -0.35 * env; if (k >= 1 && a.hugFrom) { a.to = { x: a.hugFrom[0], z: a.hugFrom[1] }; a.hugFrom = null; } break;
      case 'sad': hx = 0.3 * env; aL = aR = 0.08 * env; break;
      case 'think': aR = -1.9 * env; zR = 0.5 * env; hx = -0.15 * env; hy = 0.2 * env; break;
    }
    if (k >= 1) a.act = null;
  }
  // говорит — чуть кивает в такт
  if (a.talk && !q) hx += Math.sin(CUT.t * 7.3) * 0.05;
  if (a.sit) lift += a.sit;                  // сидит на лавочке
  if (u.armL) { u.armL.rotation.x = aL; u.armR.rotation.x = aR; u.armL.rotation.z = zL; u.armR.rotation.z = zR; }
  if (u.head) { u.head.rotation.x = hx; u.head.rotation.y = hy; }
  a.lift = lift;
}

function catStep (dt) {
  const k = CUT.cat;
  if (!k) return;
  const u = k.grp.userData;
  if (k.to) {
    const dx = k.to.x - k.x, dz = k.to.z - k.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { k.x = k.to.x; k.z = k.to.z; if (k.to.hide) { k.grp.visible = false; } k.to = null; }
    else { const st = Math.min(d, (k.fast ? 2.2 : 1.2) * dt); k.x += dx / d * st; k.z += dz / d * st; k.h += dAng(k.h, Math.atan2(dx, dz)) * Math.min(1, dt * 8); k.ph += dt * 14; }
  } else if (k.orbit) {                  // трётся о ноги: круги вокруг бабушки
    const z = CUT.actors.zina;
    k.oa += dt * 1.6;
    const tx = z.x + Math.sin(k.oa) * 0.45, tz = z.z + Math.cos(k.oa) * 0.45;
    k.h = Math.atan2(tx - k.x, tz - k.z) || k.h; k.x = tx; k.z = tz; k.ph += dt * 10;
  }
  k.grp.position.set(k.x, API.groundH(k.x, k.z) + (k.sit ? -0.05 : Math.abs(Math.sin(k.ph)) * 0.02), k.z);
  k.grp.rotation.y = k.h;
  u.tail.rotation.y = Math.sin(CUT.t * 3.2) * 0.5;
  u.tail.rotation.x = k.sit ? 0.6 : 0;
  u.head.rotation.y = k.to ? 0 : Math.sin(CUT.t * 1.3) * 0.35;
  u.body.rotation.x = k.sit ? -0.35 : 0;
  u.body.position.y = k.sit ? 0.3 : 0.25;
}
async function cat (what) {
  const h = CUT.home;
  if (what === 'out') {
    if (!CUT.cat) {
      const g = makeCat();
      API.scene.add(g);
      CUT.cat = { grp: g, x: h.ex - h.nx * 0.3, z: h.ez - h.nz * 0.3, h: Math.atan2(h.nx, h.nz), ph: 0, oa: 0 };
    }
    const k = CUT.cat;
    k.grp.visible = true; k.sit = false; k.orbit = false;
    const x = h.ex + h.nx * 1.1 + h.sx * CUT.side * 0.75, z = h.ez + h.nz * 1.1 + h.sz * CUT.side * 0.75;
    if (CUT.skip) { k.x = x; k.z = z; return; }
    k.to = { x, z };
    await until(() => !k.to, 4);
    k.sit = true;
  } else if (what === 'sit') { if (CUT.cat) { CUT.cat.sit = true; CUT.cat.orbit = false; } }
  else if (what === 'rub') { if (CUT.cat) { CUT.cat.sit = false; CUT.cat.orbit = true; CUT.cat.oa = Math.atan2(CUT.cat.x - CUT.actors.zina.x, CUT.cat.z - CUT.actors.zina.z); } }
  else if (what === 'meow') {
    const k = CUT.cat;
    if (!k) return;
    k.sit = true; k.orbit = false;
    if (CUT.skip) return;
    const b = API.sayBubble(k.grp, t('мяу!'), '#e0873f', 1.05);
    b.scale.set(1.3, 0.65, 1);
    API.Snd && API.Snd.blip && API.Snd.blip(900, 0.12, 'triangle', 0.08);
    setTimeout(() => API.Snd && API.Snd.blip && API.Snd.blip(700, 0.18, 'triangle', 0.07), 120);
    await wait(1.1);
    k.grp.remove(b); b.material.dispose();
  } else if (what === 'in') {
    const k = CUT.cat;
    if (!k) return;
    k.sit = false; k.orbit = false; k.fast = true;
    k.to = { x: h.ex - h.nx * 0.5, z: h.ez - h.nz * 0.5, hide: true };
  }
}

function give () {
  const c = CUT.actors.courier, z = CUT.actors.zina;
  if (!c || !z || !c.hold) return;
  const box = c.hold;
  c.grp.remove(box); z.grp.add(box);
  z.hold = box; c.hold = null;
  API.Snd && API.Snd.blip && API.Snd.blip(880, 0.08, 'triangle', 0.1);
}

function emote (who, kind, n) {
  const a = CUT.actors[who];
  if (!a || CUT.skip) return;
  API.emote(a.x, 2.1, a.z, kind, n || 3);
}

function scarf () {
  const d = load();
  d.zina = d.zina || { ch: 0, last: -99 };
  d.zina.scarf = true;
  save();
  decorate(API.car);
  if (!CUT.skip) {
    API.emote(API.V.x, 2.4, API.V.z, 'heart', 6);
    API.Snd && API.Snd.blip && API.Snd.blip(520, 0.2, 'triangle', 0.1);
  }
}

const SHOTS_OWN = ['establish', 'two', 'car'];
async function say (who, text, o = {}) {
  if (CUT.skip) return;
  const a = CUT.actors[who];
  const person = who === 'courier' ? courierPerson() : storyPerson(CUT.story);
  if (a) { a.talk = true; for (const k in CUT.actors) if (k !== who && CUT.actors[k]) CUT.actors[k].talk = false; }
  await DLG.say({ person, name: person.name, text: t(text, typeof o.vars === 'function' ? o.vars() : o.vars), color: COLOR, fillers: false, mood: o.mood || 'calm', cps: 42 });
  if (a) a.talk = false;
}

function face (who, target) {
  const a = CUT.actors[who];
  if (!a) return;
  const b = target === 'cat' ? CUT.cat : CUT.actors[target];
  a.look = b ? { x: b.x, z: b.z } : null;
}

const isOpt = a => a && typeof a === 'object' && !Array.isArray(a);
const ROLE = n => (n === 'courier' || n === 'cat' ? n : 'zina');          // хозяин истории в CUT.actors — всегда 'zina'
async function run (s, c, idx) {
  for (const step of c.script) {
    if (CUT.skip) break;
    const o = step.slice(1).find(isOpt) || {};
    if (o.if && o.if !== CUT.cond) continue;                               // только при выполненном / проваленном условии
    if (o.adult === true && !API.ADULT) continue;
    if (o.adult === false && API.ADULT) continue;
    if (typeof o.when === 'function') { let ok = false; try { ok = !!o.when(); } catch (e) { /* — */ } if (!ok) continue; }   // своё условие (машина у Жеки)
    const op = step[0], args = step.slice(1);
    if (op === 'shot') { if (args[0] !== 'courier' && args[0] !== 'cat' && SHOTS_OWN.indexOf(args[0]) < 0) args[0] = 'zina'; }
    else if (op === 'say' || op === 'walk' || op === 'act' || op === 'emote') args[0] = ROLE(args[0]);
    else if (op === 'face') { args[0] = ROLE(args[0]); args[1] = ROLE(args[1]); }
    switch (op) {
      case 'title': title(s, c, idx); break;
      case 'shot': setShot(args[0], args[1] && args[1].cut); break;
      case 'say': await say(args[0], args[1], args[2]); break;
      case 'walk': await walk(args[0], args[1], args[2]); break;
      case 'act': act(args[0], args[1], args[2]); break;
      case 'face': face(args[0], args[1]); break;
      case 'give': give(); break;
      case 'cat': await cat(args[0]); break;
      case 'emote': emote(args[0], args[1], args[2]); break;
      case 'scarf': scarf(); break;
      case 'wait': await wait(args[0]); break;
    }
  }
  // пропустили — всё, что осталось сделать по сюжету насовсем, всё равно делаем
  if (CUT.skip && c.script.some(q => q[0] === 'scarf')) scarf();
}

function title (s, c, idx) {
  const el = ui().querySelector('.sc-title');
  el.querySelector('em').textContent = t('{who} · глава {n} из {m}', { who: storyPerson(s).name, n: idx + 1, m: s.chapters.length });
  el.querySelector('b').textContent = '«' + t(kidsOf(c).name || c.name) + '»';
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
}

async function reward (s, c) {
  const stars = starsOf(c), cash = (CUT.cond === 'bad' && Number.isFinite(c.moneyBad) ? c.moneyBad : c.money) || 0;
  let given = false;
  try {
    if (API.addStars) { API.addStars(stars, 'story'); given = true; }
    else {
      const m = await careerMod();
      if (m && typeof m.addStars === 'function') { m.addStars(stars, 'story'); given = true; }
    }
  } catch (e) { console.warn('[story] addStars:', e); }
  if (!given) { const d = load(); d._stars = (d._stars || 0) + stars; save(); }   // карьеры ещё нет — копим, заберёт career.js
  if (cash) {
    try { if (API.addMoney) API.addMoney(cash, 'story'); } catch (e) { console.warn('[story] addMoney:', e); }
  }
  if (API.popBonus) API.popBonus(c.label ? t(kidsOf(c).label || c.label) : t('глава «{name}»', { name: t(kidsOf(c).name || c.name) }), '+' + stars + ' ★' + (cash ? ' · +' + (API.money ? API.money(cash) : cash + ' ₽') : ''));
  return { stars, money: cash };
}

/* ── вручение: катсцена, потом награда ── */
let RUNNING = null;
/* order — наша спецификация или заказ orders.js (S.order: спецификация в order.ord.story) */
const specOf = o => !o ? null : o.storyId ? o : o.ord && o.ord.story && o.ord.story.storyId ? o.ord.story : o.story && o.story.storyId ? o.story : null;
export function onDeliver (order) {
  if (RUNNING) return RUNNING;
  const sp = specOf(order);
  if (!sp) return Promise.resolve({ stars: 0, money: 0 });
  // гость, который ждал у точки (orders.js переодел прохожего в бабу Зину), — в катсцене его играет актёр
  const guest = order && order.stops && order.stops[0] && order.stops[0].peds ? order.stops[0].peds[0] : null;
  RUNNING = play(sp.storyId, sp.chapter, { order: sp, shift: sp.shift, guest }).finally(() => { RUNNING = null; });
  return RUNNING;
}

/* play — катсцена главы без заказа (песочница): машина сама встаёт у подъезда */
export async function play (storyId, chapter, o = {}) {
  const s = STORIES.find(q => q.id === storyId);
  const idx = chapter === undefined || chapter === null ? prog(storyId).ch : +chapter;
  const c = s && s.chapters[idx];
  if (!API || !c) return { stars: 0, money: 0 };
  const h = homeOf(s);
  if (!h) return { stars: 0, money: 0 };
  const V = API.V;
  // камера сбоку от двери — с той стороны, где нет стены
  const clear = sd => { let n = 0; for (const k of [2.5, 4.6, 6.5]) if (!API.inHouse(h.ex + h.nx * 2 + h.sx * sd * k, h.ez + h.nz * 2 + h.sz * sd * k, 0.6)) n++; return n; };
  CUT.side = clear(-1) > clear(1) ? -1 : 1;
  if (o.teleport || !o.order) {
    // песочница: машина во дворе перед подъездом, сбоку — не с той стороны, откуда смотрит камера
    V.x = h.ex + h.nx * 6.5 - h.sx * CUT.side * 4.5; V.z = h.ez + h.nz * 6.5 - h.sz * CUT.side * 4.5;
    if (API.inHouse(V.x, V.z, 1.5)) { V.x = h.x; V.z = h.z; }
    V.h = Math.atan2(h.sx * CUT.side, h.sz * CUT.side);
    V.y = API.surfaceAt ? API.surfaceAt(V.x, V.z) : API.groundH(V.x, V.z);
    if (API.car) { API.car.position.set(V.x, V.y, V.z); API.car.rotation.y = V.h; }
  } else {
    // машина встала с той стороны, откуда смотрит камера, — смотрим с другой, если там не стена
    const dot = (V.x - h.ex) * h.sx + (V.z - h.ez) * h.sz;
    if (dot * CUT.side > 0 && clear(-CUT.side) >= 2) CUT.side = -CUT.side;
  }
  V.vx = V.vz = 0;
  if (API.IN) for (const k in API.IN) API.IN[k] = 0;
  if (API.Snd && API.Snd.engine) API.Snd.engine(0);

  CUT.story = s; CUT.home = h; CUT.skip = false; CUT.t = 0; CUT.waits = []; CUT.on = true;
  // условие главы (успеть, не разбить, заехать по пути): как прошло — свои реплики и награда
  CUT.cond = 'ok';
  if (s.cond) { try { CUT.cond = s.cond(o.order || {}) === 'bad' ? 'bad' : 'ok'; } catch (e) { console.warn('[story] cond', e); } }
  if (o.cond === 'ok' || o.cond === 'bad') CUT.cond = o.cond;
  if (!CP) { CP = V3(); CL = V3(); CPW = V3(); CLW = V3(); }
  CP.copy(API.cam.position);
  const dir = V3(); API.cam.getWorldDirection(dir); CL.copy(API.cam.position).addScaledVector(dir, 10);

  // актёры: бабушка (уже стоит у двери или выходит из подъезда), курьер из машины с коробкой
  let za;
  if (CUT.staged && CUT.staged.id === s.id) { za = CUT.staged.a; CUT.staged = null; }
  else {
    const g = hostModel(s);
    API.scene.add(g);
    za = actor(g, h.ex - h.nx * 0.4, h.ez - h.nz * 0.4, Math.atan2(h.nx, h.nz));
  }
  // в первых главах она выходит из подъезда: сначала её нет
  const first = c.script.find(q => q[0] === 'walk' && q[1] !== 'courier');
  if (first && first[2] === 'out') { za.x = h.ex - h.nx * 0.4; za.z = h.ez - h.nz * 0.4; za.hidden = true; za.grp.visible = false; }
  if (s.sit) { za.x = h.ex; za.z = h.ez; za.h = za.want = Math.atan2(h.nx, h.nz); za.sit = s.sit; za.hidden = false; za.grp.visible = true; }
  za.speed = 1.1;
  za.look = null;
  const cg = API.makeHuman(courierPerson(), { shirt: COURIER_LOOK.shirt, pants: COURIER_LOOK.pants });
  API.scene.add(cg);
  const fromCar = Math.hypot(V.x - h.ex, V.z - h.ez) < 16;
  const cx = fromCar ? V.x + Math.cos(V.h) * 1.4 : h.ex + h.nx * 9, cz = fromCar ? V.z - Math.sin(V.h) * 1.4 : h.ez + h.nz * 9;
  const ca = actor(cg, cx, cz, Math.atan2(h.ex - cx, h.ez - cz));
  ca.speed = 2.0;
  const box = API.pizzaBox();
  box.scale.setScalar(0.75); box.position.set(0, 1.12, 0.34);
  cg.add(box); ca.hold = box;
  CUT.actors = { zina: za, courier: ca };
  placeActor(za); placeActor(ca);
  if (o.guest && o.guest.grp) o.guest.grp.visible = false;

  document.body.classList.add('story-cut');
  const el = ui();
  el.querySelector('.sc-skip').textContent = t('пропустить ▸▸ esc');
  el.querySelector('.sc-title').classList.remove('on');
  requestAnimationFrame(() => el.classList.add('on'));
  addEventListener('keydown', onKey, true);
  setShot('establish', true);

  let r = { stars: 0, money: 0 };
  try {
    await run(s, c, idx);
    // последние шаги — уходят; коротко даём доиграть, если не пропускали
    if (!CUT.skip) await until(() => !CUT.actors.courier.to && !CUT.actors.zina.to, 3);
  } catch (e) { console.error('[story]', e); }
  finally {
    removeEventListener('keydown', onKey, true);
    el.classList.remove('on');
    document.body.classList.remove('story-cut');
    for (const k in CUT.actors) if (CUT.actors[k]) API.dropMesh(CUT.actors[k].grp);
    if (CUT.cat) { API.dropMesh(CUT.cat.grp); CUT.cat = null; }
    CUT.actors = {}; CUT.on = false; CUT.shot = null;
    for (const w of CUT.waits.splice(0)) w();
    // бабушка ушла домой: прохожий, который её играл, уходит в другой квартал другим человеком
    if (o.guest) { try { if (API.retirePed) API.retirePed(o.guest); else if (o.guest.grp) o.guest.grp.visible = true; } catch (e) { console.warn('[story] retirePed', e); } }
    // курьер снова в машине: камера — сразу за спиной
    V.camX = V.x - Math.sin(V.h) * 11; V.camZ = V.z - Math.cos(V.h) * 11; V.camH = V.h; V.camY = V.y + 6;
  }
  // прогресс: глава пройдена (в песочнице — только если это следующая по счёту)
  const p = prog(s.id);
  if (idx >= p.ch) {
    const sh = o.shift !== undefined && o.shift !== null ? +o.shift : API.shift ? +API.shift() : NaN;
    p.ch = idx + 1; p.last = Number.isFinite(sh) ? sh : p.last; p.at = Date.now(); save();
  }
  r = await reward(s, c);
  if (s.onDone) { try { s.onDone(idx, CUT.cond, o.order || null); } catch (e) { console.warn('[story] onDone', e); } }
  r.cond = CUT.cond;
  return r;
}

/* каждый кадр из game.js: шарф на новой машине; идёт катсцена — шаг и true */
export function frame (dt, car) {
  for (const f of frameHooks) { try { f(dt, CUT.on); } catch (e) { console.warn('[story] frame hook', e); } }
  if (car && car !== CUT.lastCar) { CUT.lastCar = car; decorate(car); }
  CUT.scarfT = (CUT.scarfT || 0) + dt;
  if (CUT.scarf) scarfStep(car, CUT.scarfT);          // хвосты шарфа развеваются
  if (!CUT.on) return false;
  CUT.t += dt;
  for (const k in CUT.actors) if (CUT.actors[k]) actorStep(CUT.actors[k], dt);
  catStep(dt);
  for (const w of CUT.waits.slice()) if (CUT.t >= w.until || (w.fn && w.fn())) w();
  camStep(dt);
  return true;
}

/* из game.js, один раз: что нужно от игры */
export function init (api) {
  API = api;
  ST.data = null;
  load();
  if (API.car) { CUT.lastCar = API.car; decorate(API.car); }
}

/* для ?debug и песочницы */
export const DEBUG = { CUT, STORIES, homeOf: id => homeOf(STORIES.find(s => s.id === id)), skip, get running () { return !!RUNNING; } };
