/* ──────────────────────────────────────────────────────────────────────────
   События пиццерий (12бж, автор 24.10.2026: «в каждой пиццерии ещё должен быть свой ивент какой-то, который происходит
   в тот момент»). Правила словами — docs/CAREER.md «События пиццерий», числа общие — econ.js PZEV, окна и надбавки
   каждого события — таблица EVENTS ниже.

   Одно событие на смену, привязано к пиццерии района, где работаешь (DIST.cur()). В пиццерии, где его ещё не видел, — всегда;
   дальше — с шансом PZEV.CHANCE, и каждый раз со своим «поворотом» (twist: другая надбавка, другая реплика; два подряд
   одинаковых не бывает). Нет в первую смену игры, в быстрый заезд, в «покататься», в праздник и в фестиваль.
   Как идёт: через PZEV.SAY_AT с управляющая пишет в чат; в окне часов события (from…to) часть заказов — «заказ события»
   (share, не больше PZEV.MAX за смену): оплата × k (надбавка в цене остановки, отдельной строкой в накладной), клиент
   у двери говорит про событие; в начале окна — ещё строка в чат; после PZEV.DONE_AT вручений — «спасибо» в чат.
   Мир не трогает: ни перекрытий, ни людей на дороге (это хвост 12бж — docs/plan/new.md).

     init(api)               — game.js (после города); api: Store, S, ADULT, hour(), chat(text), sayBubble
     shiftStart({ ride, quick, busy, dist, shifts }) — начало смены; busy — идёт праздник или фестиваль
     step(dt)                — каждый кадр (CL.step 'pzevents')
   для orders.js:
     tag()                   — пометка заказа события { k, why, label, name } или null (и счёт)
     onArrive(ev)            — приехал к клиенту (подписка сама)
   Отладка: __dlv.PZ — info(), force(distIdx, twist) (событие сейчас, окно открыто), stop(), table.
   ────────────────────────────────────────────────────────────────────────── */
import { PZEV } from './econ.js';
import { t, N_ } from '../i18n/index.js';

/* Таблица: ключ — номер района (карта seversk: 0 Юг, 1 Кольцо, 2 Проспект …). У каждого события:
   name — как назвать; label — строка в накладной; twists — повороты. У поворота: from…to — окно по часам мира (9—33),
   share — доля заказов в окне, k — оплата ×, say — объявление, go — строка в начале окна, done — «спасибо»,
   lines — реплики клиентов у двери, why — пометка заказа в накладной ({k}) */
export const EVENTS = {
  0: {
    id: 'roadwork', name: N_('дорожники на обеде'), label: N_('дорожникам'),
    twists: [
      {
        from: 12, to: 15, share: 0.4, k: 1.3,
        say: N_('на Победы с утра копают дорогу. в 12 у дорожников обед — будут заказы с надбавкой'),
        go: N_('дорожники сели обедать. заказы от них — с надбавкой'),
        done: N_('дорожники довольны, один даже сказал спасибо. почти'),
        lines: [N_('бригада голодная, давай сюда'), N_('мы тут асфальт кладём, а ты с пиццей. красавчик'), N_('только не по свежему асфальту, ладно?')],
        why: N_('обед у дорожников · оплата ×{k}'),
      },
      {
        from: 11.5, to: 14.5, share: 0.3, k: 1.5,
        say: N_('бригадир дорожников угощает всю смену. в обед — заказы, платит хорошо'),
        go: N_('бригадир открыл кошелёк. заказы от дорожников — дорого'),
        done: N_('бригадир доволен. записал тебя в «наши»'),
        lines: [N_('бригадир платит, бери сдачу'), N_('мы за день дорогу не сделаем, зато поедим'), N_('на всю бригаду, и не жмись')],
        why: N_('бригадир угощает · оплата ×{k}'),
      },
    ],
  },
  1: {
    id: 'wedding', name: N_('свадьба на Кольце'), label: N_('на свадьбу'),
    twists: [
      {
        from: 15, to: 20, share: 0.4, k: 1.35,
        say: N_('на Коммунистическом свадьба. кортеж с лентами гудит с трёх, гости закажут пиццу'),
        go: N_('кортеж проехал. гости проголодались — заказы со свадьбы с надбавкой'),
        done: N_('молодожёны передали спасибо. и ленту на зеркало'),
        lines: [N_('горько!'), N_('мы на свадьбе, а торт кончился. пицца — тоже праздник'), N_('жених, не спи, пицца приехала')],
        why: N_('гости на свадьбе · оплата ×{k}'),
      },
      {
        from: 16, to: 21, share: 0.35, k: 1.5,
        say: N_('на Кольце свадьба, жених потерялся. гости нервничают и заказывают — платят хорошо'),
        go: N_('жених всё ещё не нашёлся. гости заедают нервы — заказы с надбавкой'),
        done: N_('жениха нашли. в гараже. гости передали спасибо'),
        lines: [N_('жениха не видел? ладно, давай пиццу'), N_('горе у нас, но пицца — это святое'), N_('невеста плачет, ей две пепперони')],
        why: N_('свадьба без жениха · оплата ×{k}'),
      },
    ],
  },
  2: {
    id: 'marathon', name: N_('марафон на Калинина'), label: N_('бегунам'),
    twists: [
      {
        from: 10, to: 13.5, share: 0.4, k: 1.25,
        say: N_('на Калинина сегодня марафон. после финиша бегуны голодные — заказы с десяти'),
        go: N_('первые добежали. голодные бегуны заказывают — с надбавкой'),
        done: N_('бегуны довольны. кто-то пытался убежать, не заплатив. не вышло'),
        lines: [N_('я десять километров пробежал, мне две'), N_('финиш был вон там. не спрашивай, как я дошёл'), N_('главное — участие. и пицца')],
        why: N_('марафон: бегуны на финише · оплата ×{k}'),
      },
      {
        from: 11, to: 15, share: 0.3, k: 1.3,
        say: N_('на Калинина забег студентов. после него — заказы в общагу, платят с надбавкой'),
        go: N_('студенты добежали до общаги. заказы с надбавкой'),
        done: N_('студенты передали спасибо. и номер зачётки'),
        lines: [N_('мы всей группой бежали, нам зачёт поставят'), N_('стипендии нет, но на пиццу нашли'), N_('физрук обещал автомат за забег. мы заслужили пиццу')],
        why: N_('забег студентов · оплата ×{k}'),
      },
    ],
  },
};

const KEY = 'dlv-pzev';
let A = null;
let CUR = null;                 // идущее событие: { dist, ev, tw, ti, n (помечено), got (вручено), went (окно началось), said, seen }
let tick = 0;
const pick = a => a[(Math.random() * a.length) | 0];

function load () { try { return JSON.parse(A.Store.get(KEY, '') || '{}') || {}; } catch (e) { return {}; } }
function save (o) { try { A.Store.set(KEY, JSON.stringify(o)); } catch (e) { /* без сохранения — не страшно */ } }

export function init (api) {
  A = api;
  if (A.onArrive) A.onArrive(onArrive);
  setTimeout(() => { if (window.__dlv) window.__dlv.PZ = DEBUG; }, 0);
}

function chat (text) { if (A && A.chat && text) A.chat(t(text)); }

function begin (dist, ti) {
  const ev = EVENTS[dist];
  if (!ev) return false;
  const tw = ev.twists[ti % ev.twists.length];
  CUR = { dist, ev, tw, ti, n: 0, got: 0, went: false, said: false, seen: new Set() };
  tick = 0;
  const id = CUR;
  setTimeout(() => { if (CUR === id) chat(tw.say); }, PZEV.SAY_AT * 1000);
  return true;
}

/** начало смены: решить, будет ли событие пиццерии */
export function shiftStart (o = {}) {
  CUR = null;
  if (!A || o.ride || o.quick || o.busy) return;
  if ((o.shifts || 0) < PZEV.FROM) return;
  const dist = o.dist | 0, ev = EVENTS[dist];
  if (!ev) return;
  const sv = load();
  sv.seen = sv.seen || {}; sv.tw = sv.tw || {};
  const first = !sv.seen[dist];
  if (!first && Math.random() >= PZEV.CHANCE) return;
  // поворот: первый раз — первый; потом — не тот же, что в прошлый раз
  const n = ev.twists.length, last = sv.tw[dist];
  const ti = first || n < 2 ? 0 : pick([...Array(n).keys()].filter(i => i !== last));
  sv.seen[dist] = (sv.seen[dist] || 0) + 1; sv.tw[dist] = ti;
  save(sv);
  begin(dist, ti);
}

/** каждый кадр: окно события началось — строка в чат */
export function step (dt) {
  if (!CUR || CUR.went) return;
  if ((tick -= dt) > 0) return;
  tick = PZEV.TICK;
  if (A.hour() >= CUR.tw.from) { CUR.went = true; chat(CUR.tw.go); }
}

const inWindow = () => { if (!CUR) return false; const h = A.hour(); return h >= CUR.tw.from && h < CUR.tw.to; };

/** orders.js: пометка заказа события или null */
export function tag () {
  if (!CUR || CUR.n >= PZEV.MAX || !inWindow() || Math.random() >= CUR.tw.share) return null;
  CUR.n++;
  return { k: CUR.tw.k, why: t(CUR.tw.why, { k: String(CUR.tw.k).replace('.', ',') }), label: t(CUR.ev.label), name: t(CUR.ev.name), ev: CUR.ev.id };
}

/** приехал к клиенту (orders.js onArrive): счёт вручений, реплика клиента, «спасибо» в чат */
function onArrive (ev) {
  if (!CUR || !ev || !ev.stop) return;
  const o = ev.order, sp = o && o.ord;
  if (!sp || !sp.pz || CUR.seen.has(o)) return;
  CUR.seen.add(o); CUR.got++;
  const p = ev.stop.peds && ev.stop.peds[0];
  if (p && p.grp && !p.dead && A.sayBubble && Math.random() < PZEV.LINE_P) {
    const id = CUR, text = t(pick(CUR.tw.lines));
    setTimeout(() => { if (p.grp && !p.dead && CUR === id) A.sayBubble(p.grp, text, '#a8600c', 2.75, 1); }, 350);
  }
  if (!CUR.said && CUR.got >= PZEV.DONE_AT) { CUR.said = true; setTimeout(() => chat(CUR && CUR.tw.done), 2500); }
}

export const active = () => (CUR ? CUR.ev.id : '');

export const DEBUG = {
  info: () => (CUR ? { dist: CUR.dist, id: CUR.ev.id, twist: CUR.ti, from: CUR.tw.from, to: CUR.tw.to, tagged: CUR.n, got: CUR.got, went: CUR.went, hour: A.hour() } : null),
  force: (dist = 0, ti = 0) => begin(dist | 0, ti | 0),
  stop: () => { CUR = null; },
  table: EVENTS,
  tag,
};
