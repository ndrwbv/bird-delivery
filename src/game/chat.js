/* Чат управляющего: «Жека управляющий» пишет справа сверху, как в iMessage —
   аватарка, имя, пузырь. Сначала 0,5 с «печатает…» (три точки), потом текст.
   Видно сразу не больше трёх сообщений (четвёртое выталкивает самое старое),
   каждое висит 4 с + 1 с на каждые 25 букв (не дольше 8 с) и уезжает вправо.
   Ввод не перехватывает. Место — под колонкой хада справа (кошелёк, часы смены,
   «закончить смену», на телефоне — радар и кнопки); не влезает по высоте — слева от неё.
   Что и когда пишет — docs/ORDERS.md «Жека управляющий».

   Из game.js:
     CHAT.init({ face, person, adult })   — face(person, size) → картинка; adult — взрослая версия (мат)
     CHAT.react(kind, onShow?)            — kind: 'fast' | 'slow' | 'late' | 'bump' | 'kill' | 'bundle' | 'urgent';
                                            onShow() — в момент, когда текст появился (списание денег)
     CHAT.say(text, onShow?)              — своё сообщение
     CHAT.clear()                         — убрать всё (конец смены, меню) */
import { t, N_ } from '../i18n/index.js';

const TYPE_S = 0.5, MAX = 3;
const hold = s => Math.min(8, 4 + s.length / 25);

/* фразы: общие и взрослые/детские (мат — только во взрослой) */
const LINES = {
  fast: /*i18n*/ [N_('молодец)'), N_('красава, так держать'), N_('вот это скорость! клиент в шоке'),
    N_('огонь. ещё бы все так возили'), N_('быстро! премию не дам, но горжусь'), N_('молодец, Шумахер')],
  slow: /*i18n*/ [N_('успел впритык. постарайся побыстрее'), N_('ну такое… постарайся'),
    N_('клиент уже звонил, где пицца. постарайся'), N_('пицца приехала тёплой, а не горячей. постарайся')],
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

const C = { el: null, face: null, person: null, adult: false, items: [], last: {} };

export function init ({ face, person, adult }) {
  C.face = face; C.person = person; C.adult = !!adult;
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
  clearTimeout(m.t1); clearTimeout(m.t2);
  shown(m);                                               // убрали, не дождавшись текста, — списание всё равно
  m.el.classList.add('out');
  setTimeout(() => m.el.remove(), 350);
}

function shown (m) {
  const f = m.onShow;
  m.onShow = null;
  if (f) try { f(); } catch (e) { console.warn('[chat]', e); }
}

export function say (text, onShow) {
  const el = box();
  place();
  while (C.items.length >= MAX) drop(C.items[0]);
  const row = document.createElement('div');
  row.className = 'cm';
  const ava = C.person && C.face ? '<img src="' + C.face(C.person, 48) + '" alt="">' : '<i></i>';
  row.innerHTML = ava + '<div class="cm-b"><b>' + t('Жека управляющий') + '</b><p class="typing"><span></span><span></span><span></span></p></div>';
  el.appendChild(row);
  const m = { el: row, onShow };
  C.items.push(m);
  m.t1 = setTimeout(() => {
    const p = row.querySelector('p');
    p.className = '';
    p.textContent = text;
    shown(m);
    m.t2 = setTimeout(() => drop(m), hold(text) * 1000);
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
  return say(t(pool[k]), onShow);
}

export function clear () { for (const m of C.items.slice()) drop(m); }
