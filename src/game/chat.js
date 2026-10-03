/* Чат управляющего: «Толик управляющий» пишет справа сверху, как в iMessage —
   аватарка, имя, пузырь. Сначала 0,5 с «печатает…» (три точки), потом текст.
   Текст приходит крупно **на своём месте** (не по центру): «бам» — строка раздувается от своего
   правого верхнего угла влево-вниз (×1,8, не вылезая за экран, с отскоком и звуком), держится 1,2 с
   + 1 с на 150 букв (не дольше 2 с) и за 0,45 с уменьшается до обычной. Пришло новое — прежнее
   крупное сразу уменьшается. prefers-reduced-motion — без увеличения, просто появляется.
   Видно сразу не больше трёх сообщений (четвёртое выталкивает самое старое),
   каждое висит (после крупного) 4 с + 1 с на каждые 25 букв (не дольше 8 с) и уезжает вправо.
   Ввод не перехватывает. Место — под колонкой хада справа (кошелёк, часы смены,
   «закончить смену», на телефоне — радар и кнопки); не влезает по высоте — слева от неё.
   Пишет только на плохое и на очень хорошее, обычные доставки — молча.
   Что и когда пишет — docs/ORDERS.md «Толик управляющий».

   Из game.js:
     CHAT.init({ face, person, adult, blip }) — face(person, size) → картинка; adult — взрослая версия (мат);
                                            blip(f, d, type, v) — звук (Snd.blip)
     CHAT.react(kind, onShow?)            — kind: 'fast' | 'late' | 'bump' | 'kill' | 'bundle' | 'urgent';
                                            onShow() — в момент, когда текст появился (списание денег)
     CHAT.say(text, onShow?)              — своё сообщение
     CHAT.clear()                         — убрать всё (конец смены, меню)
     CHAT.later(ms, fn)                   — отложенное сообщение; пока не вышло — чат «занят»
     CHAT.busy() / CHAT.idle(cb, max)     — есть ли отложенное, «печатает…» или крупное; cb — когда всё
                                            показано и уменьшилось (не дольше max мс) — конец смены ждёт
     CHAT.waiting()                       — идёт idle(): отложенная похвала всё равно показывается
   Из shiftend.js (экран Толика в конце смены):
     CHAT.avatar(size)                    — его лицо картинкой ('' — нет)
     CHAT.shiftLine(mood)                 — что он пишет после смены: mood 'bad' | 'ok' | 'great' */
import { t, N_ } from '../i18n/index.js';

const TYPE_S = 0.5, MAX = 3;
const hold = s => Math.min(8, 4 + s.length / 25);
/* крупно: во сколько раз, сколько держится, выскок и уменьшение (мс) */
const BIG = { S: 1.8, MIN: 1.2, PER: 150, MAX: 2, IN: 380, OUT: 450 };
const bigHold = s => Math.min(BIG.MAX, BIG.MIN + s.length / BIG.PER);
const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

/* фразы: общие и взрослые/детские (мат — только во взрослой) */
const LINES = {
  fast: /*i18n*/ [N_('молодец)'), N_('красава, так держать'), N_('вот это скорость! клиент в шоке'),
    N_('огонь. ещё бы все так возили'), N_('быстро! премию не дам, но горжусь'), N_('молодец, Шумахер')],
  bundle: /*i18n*/ [N_('весь развоз вовремя! Палыч доволен, я тоже'), N_('все адреса в срок. ты машина'), N_('развоз закрыт. уважуха')],
};
const ADULT_LINES = {
  late: /*i18n*/ [N_('какого хера ты проебал заказ?? теперь пиццерия должна этому сукиному сыну ещё одну пиццу, вычитаю из твоей зп'),
    N_('ты где шлялся, блядь?? клиент орёт в трубку. пицца на замену — за твой счёт'),
    N_('опять опоздал, сука. новую пиццу этому козлу везём за твои деньги'),
    N_('ну ёб твою мать, холодная пицца. минус из зарплаты, гений')],
  bump: /*i18n*/ [N_('ты чё, клиента бампером?? чаевых не жди, придурок'), N_('нахрена ты клиента машиной толкнул, ебанутый?')],
  kill: /*i18n*/ [N_('ТЫ СБИЛ КЛИЕНТА?! охренеть. штраф, и молись, чтобы он не писал отзыв'),
    N_('клиент лежит на асфальте, а пицца у тебя. ты больной, блин?')],
  urgent: /*i18n*/ [N_('СРОЧНЫЙ, блядь! русским же языком написано. клиент отказался, штраф с тебя'),
    N_('ты срочный заказ проебал, гонщик хренов. минус из зп')],
};
const KIDS_LINES = {
  late: /*i18n*/ [N_('какого лешего ты проспал заказ?! теперь пиццерия должна этому вредному дядьке ещё одну пиццу, вычитаю из твоей зарплаты'),
    N_('ты где катался?! клиент кричит в трубку. пицца на замену — за твой счёт'),
    N_('опять опоздал! новую пиццу этому ворчуну везём за твои денежки'),
    N_('ну ёлки-палки, пицца остыла. минус из зарплаты, гений')],
  bump: /*i18n*/ [N_('ты что, клиента бампером?! чаевых не жди'), N_('зачем ты клиента машиной толкнул?! ну ты даёшь…')],
  kill: /*i18n*/ [N_('ТЫ СБИЛ КЛИЕНТА?! ну всё, штраф. и пусть он только не пишет отзыв'),
    N_('клиент лежит на асфальте, а пицца у тебя. ты в своём уме?')],
  urgent: /*i18n*/ [N_('там же было написано СРОЧНО! клиент отказался, штраф с тебя'),
    N_('срочный заказ упустил, гонщик. минус из зарплаты')],
};

const C = { el: null, face: null, person: null, adult: false, blip: null, items: [], last: {}, wait: 0 };
const PEND = new Set();                                  // отложенные сообщения (later)
const ANGRY = new Set(['late', 'bump', 'kill', 'urgent']);

export function init ({ face, person, adult, blip }) {
  C.face = face; C.person = person; C.adult = !!adult; C.blip = blip || null;
}

/* звук «пришло сообщение»: два коротких тона, ругань — ниже */
function ding (angry) {
  if (!C.blip) return;
  const f = angry ? [620, 470] : [1320, 1760];
  f.forEach((x, i) => setTimeout(() => { try { C.blip(x, 0.12, 'triangle', 0.13); } catch (e) { /* — */ } }, i * 95));
}

/* где пузырь крупно: на своём месте — строка раздувается от правого верхнего угла своего содержимого
   (аватарка + пузырь) влево и вниз; не больше BIG.S, не за левый и нижний край экрана */
function bigTf (m) {
  const row = m.el, b = row.querySelector('.cm-b'), c = C.el.getBoundingClientRect();
  const x0 = row.offsetLeft, x1 = b ? b.offsetLeft + b.offsetWidth : x0 + row.offsetWidth;
  const cw = Math.max(1, x1 - x0), h = Math.max(1, row.offsetHeight);
  const s = Math.max(1, Math.min(BIG.S, (c.left + x1 - 10) / cw, (innerHeight - 10 - c.top - row.offsetTop) / h));
  return { origin: cw.toFixed(1) + 'px 0px', s, dx: 0, dy: 0 };
}
const tf = (g, k) => 'translate(' + (g.dx * k).toFixed(1) + 'px, ' + (g.dy * k).toFixed(1) + 'px) scale(' + (1 + (g.s - 1) * k).toFixed(3) + ')';

function grow (m) {
  if (!m.el.animate || calm()) return false;
  for (const o of C.items) if (o !== m && o.big) shrink(o);
  const g = bigTf(m);
  m.el.style.transformOrigin = g.origin;
  m.el.classList.add('big');
  m.big = true;
  m.anim = m.el.animate([
    { transform: 'none', opacity: 0.6 },
    { transform: tf(g, 1.06), opacity: 1, offset: 0.62 },
    { transform: tf(g, 0.97), offset: 0.82 },
    { transform: tf(g, 1) },
  ], { duration: BIG.IN, easing: 'cubic-bezier(.2, .8, .3, 1)', fill: 'forwards' });
  return true;
}
function shrink (m) {
  if (!m.big) return;
  m.big = false;
  clearTimeout(m.t3);
  const a = m.anim, from = getComputedStyle(m.el).transform;
  m.anim = m.el.animate([{ transform: from === 'none' ? 'none' : from }, { transform: 'none' }],
    { duration: BIG.OUT, easing: 'cubic-bezier(.45, 0, .25, 1)', fill: 'forwards' });
  if (a) a.cancel();
  const done = m.anim;
  done.onfinish = () => { if (m.anim === done) { m.el.classList.remove('big'); done.cancel(); m.anim = null; } };
}

function box () {
  if (C.el) return C.el;
  const el = document.createElement('div');
  el.id = 'chat';
  document.body.appendChild(el);
  C.el = el;
  addEventListener('resize', place);
  return el;
}

/* под колонкой хада справа; не влезает — слева от неё */
function place () {
  if (!C.el) return;
  const W = innerWidth, H = innerHeight;
  const ids = ['hud-right', 'cr-clock'].concat(document.body.classList.contains('touch') ? ['radar', 'ctrls'] : []);
  let top = 1e9, bottom = 0, left = W, right = 0;
  for (const id of ids) {
    const e = document.getElementById(id);
    if (!e || e.hidden) continue;
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height || r.right < W / 2) continue;
    top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom); left = Math.min(left, r.left); right = Math.max(right, r.right);
  }
  if (!right) { top = bottom = 10; left = right = W - 10; }
  const below = H - bottom > Math.min(260, H * 0.42);
  C.el.style.top = Math.round(below ? bottom + 8 : top) + 'px';
  C.el.style.right = Math.round(below ? Math.max(10, W - right) : W - left + 8) + 'px';
  C.el.style.width = Math.round(Math.max(150, Math.min(270, (below ? W : left) - 24))) + 'px';
}

function drop (m) {
  const i = C.items.indexOf(m);
  if (i < 0) return;
  C.items.splice(i, 1);
  clearTimeout(m.t1); clearTimeout(m.t2); clearTimeout(m.t3);
  m.big = false;
  if (m.anim) { m.anim.cancel(); m.anim = null; }
  m.el.classList.remove('big');
  shown(m);                                               // убрали, не дождавшись текста, — списание всё равно
  m.el.classList.add('out');
  setTimeout(() => m.el.remove(), 350);
}

function shown (m) {
  const f = m.onShow;
  m.onShow = null;
  if (f) try { f(); } catch (e) { console.warn('[chat]', e); }
}

export function say (text, onShow, angry) {
  const el = box();
  place();
  while (C.items.length >= MAX) drop(C.items[0]);
  const row = document.createElement('div');
  row.className = 'cm';
  const ava = C.person && C.face ? '<img src="' + C.face(C.person, 48) + '" alt="">' : '<i></i>';
  row.innerHTML = ava + '<div class="cm-b"><b>' + t('Толик управляющий') + '</b><p class="typing"><span></span><span></span><span></span></p></div>';
  el.appendChild(row);
  const m = { el: row, onShow };
  C.items.push(m);
  m.t1 = setTimeout(() => {
    const p = row.querySelector('p');
    p.className = '';
    p.textContent = text;
    m.said = true;
    shown(m);
    ding(angry);
    const big = grow(m) ? bigHold(text) : 0;
    if (big) m.t3 = setTimeout(() => shrink(m), big * 1000);
    m.t2 = setTimeout(() => drop(m), (big + hold(text)) * 1000);
  }, TYPE_S * 1000);
  return m;
}

/* случайная фраза, не та же, что в прошлый раз */
export function react (kind, onShow) {
  const pool = LINES[kind] || (C.adult ? ADULT_LINES : KIDS_LINES)[kind];
  if (!pool || !pool.length) return null;
  let k = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && k === C.last[kind]) k = (k + 1) % pool.length;
  C.last[kind] = k;
  return say(t(pool[k]), onShow, ANGRY.has(kind));
}

/* ── экран Толика в конце смены (shiftend.js): одна фраза по смене, «мдаа» — тоже фраза ── */
const SHIFT_LINES = {
  bad: /*i18n*/ [N_('мдаа'), N_('мдаа… это что сейчас было'), N_('ну такое. завтра чтоб без этого'),
    N_('я даже не знаю, что Палычу сказать'), N_('мдаа. клиенты голодные, я седой')],
  ok: /*i18n*/ [N_('норм. завтра давай бодрее'), N_('ну пойдёт. не шедевр, но пойдёт'), N_('смена как смена. иди отдыхай'),
    N_('мм. сойдёт')],
  great: /*i18n*/ [N_('вот это смена! красава)'), N_('ты сегодня зверь. так держать'), N_('Палыч доволен, я тоже. молодец)'),
    N_('кухня не успевала за тобой. уважуха')],
};
const SHIFT_ADULT = {
  bad: /*i18n*/ [N_('мдаа. пиздец, а не смена')],
  ok: /*i18n*/ [N_('ну такое, бля. сойдёт')],
  great: /*i18n*/ [N_('охуенно отработал, без шуток')],
};
export const avatar = size => (C.person && C.face ? C.face(C.person, size) : '');
export function shiftLine (mood) {
  const k = SHIFT_LINES[mood] ? mood : 'ok';
  const pool = SHIFT_LINES[k].concat(C.adult ? SHIFT_ADULT[k] : []);
  return t(pool[Math.floor(Math.random() * pool.length)]);
}

export function clear () { for (const m of C.items.slice()) drop(m); }

/* отложенное сообщение: пока таймер не вышел, чат «занят» (конец смены его подождёт); clear() его не
   отменяет — вычет за опоздание должен случиться и после конца смены */
export function later (ms, fn) {
  const id = setTimeout(() => { PEND.delete(id); try { fn(); } catch (e) { console.warn('[chat]', e); } }, ms);
  PEND.add(id);
  return id;
}
export const busy = () => PEND.size > 0 || C.items.some(m => !m.said || m.big || m.anim);
export const waiting = () => C.wait > 0;
export function idle (cb, max = 6000) {
  const t0 = performance.now();
  C.wait++;
  const tick = () => {
    if (busy() && performance.now() - t0 < max) { setTimeout(tick, 80); return; }
    C.wait--;
    try { cb(); } catch (e) { console.error('[chat] idle', e); }
  };
  tick();
}
