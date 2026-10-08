/* ──────────────────────────────────────────────────────────────────────────
   Клиентка заигрывает при вручении (только взрослая версия; правила — docs/ORDERS.md
   «Клиентка заигрывает», docs/CONTENT.md). Без подробностей: одна фраза — и вежливый отказ.

   Когда: вручение вовремя (не опоздал, не задел клиента машиной), клиент — женщина, заказ не
     сюжетный и не учебный, у клиента нет «Сдачи не надо!» богача. Тогда с шансом P (8 %, ≈ 1 из 12
     таких вручений; женщин среди клиентов около половины — в среднем ≈ 1 из 25 вручений вообще).
   Что: через SAY (0,4 с, коробка уже в руках) — окно диалога, как в сюжете (dialog.js): лицо клиентки,
     её фраза из CLIENT печатается по буквам, внизу — два ответа курьера на выбор (две разные фразы из
     COURIER; обе — вежливый отказ, итог один). Пока окно открыто, мир стоит (как в сюжетных диалогах
     у двери), следующий заказ не берётся; ответил — едешь дальше.
     Посреди езды игру не останавливаем: если к этому моменту машина уже едет (быстрее STILL 6 м/с — как порог «приехал») или открыт
     другой диалог (поручение клиента), — по-старому облачками: над клиенткой (розовая обводка, HOLD 3,2 с),
     через REPLY (1,6 с) над машиной ответ курьера (2,6 с).
     Одна и та же фраза два раза подряд не бывает.
   В детской (Яндекс, ?kids) модуль не вызывается вовсе (game.js: только при ADULT).

   Из game.js: FLIRT.onHand(st, onTime, api) — после handOver; api = { car: () => группа машины,
     speed: () => м/с, hold: on => держать вручение (не брать следующий заказ), person: человек клиентки }
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t, N_ } from '../i18n/index.js';
import * as DIRECTOR from './director.js';
import * as TALK from './talk.js';             // облачка реплик (talk.js)
import * as DLG from './dialog.js';            // окно диалога, как в сюжете

export const FLIRT = { P: 0.08, SAY: 0.4, HOLD: 3.2, REPLY: 1.6, REPLY_HOLD: 2.6, STILL: 6 };   // STILL — м/с: медленнее — диалог (как «приехал» в game.js), быстрее — облачка

const CLIENT = /*i18n*/ [
  N_('зайдёшь? поедим пиццу… и не только'),
  N_('муж в командировке, а пицца большая…'),
  N_('ой, я в халате… заходи, погреешься'),
  N_('у меня кран течёт. ты же мужчина?'),
  N_('а десерт в заказ не входит? могу предложить'),
  N_('чаевые наличными… или зайдёшь на чай?'),
  N_('одна большую пиццу не осилю. поможешь?'),
];
const COURIER = /*i18n*/ [
  N_('меня ждёт работа'),
  N_('не могу, заказы горят'),
  N_('простите, я на смене'),
  N_('пицца — да, остальное — не по тарифу'),
  N_('Толик считает минуты, извините'),
  N_('я только до двери. хорошего вечера!'),
];

const ST = { hands: 0, fem: 0, rolled: 0, shown: 0, dialogs: 0, bubbles: 0, last: '', reply: '' };
const LAST = { c: -1, r: -1 };
function bubble (grp, text, col, y, hold) {
  const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: TALK.tex(text, col), transparent: true, depthWrite: false }));
  b.position.set(0, y, 0);
  grp.add(b);
  TALK.track(b);                                   // читаемая плашка, размер по расстоянию (talk.js)
  setTimeout(() => { if (b.parent) b.parent.remove(b); b.material.dispose(); }, hold * 1000);
  return b;
}

const pickNew = (pool, key) => {
  let k = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && k === LAST[key]) k = (k + 1) % pool.length;
  LAST[key] = k;
  return t(pool[k]);
};

/* подходит ли вручение и выпал ли шанс */
export function roll (st, onTime) {
  ST.hands++;
  const p = st && st.peds && st.peds[0];
  if (!onTime || !p || p.dead || p.surf || st.bumped || !p.grp || !p.grp.userData.fem) return false;
  if (st.pay && (st.pay.story || st.pay.rich)) return false;
  ST.fem++;
  if (DEBUG.force) return true;
  return Math.random() < FLIRT.P && DIRECTOR.can('flirt');   // режиссёр: приглашение — лёгкое, не в первые заказы сессии
}

export function onHand (st, onTime, api) {
  if (!roll(st, onTime)) return false;
  ST.rolled++;
  DIRECTOR.start('flirt', 8);                      // режиссёр: приглашение — лёгкое событие, ~8 с
  const p = st.peds[0];
  const person = (api && api.person) || p.person || null;
  setTimeout(() => {
    if (p.dead || !p.grp.parent) return;
    ST.shown++;
    ST.last = pickNew(CLIENT, 'c');
    const still = !api || !api.speed || api.speed() < FLIRT.STILL;
    if (still && person && !DLG.isOpen()) dialog(p, person, api);
    else bubbles(p, api);
  }, FLIRT.SAY * 1000);
  return true;
}

/* окно диалога: она — фраза, курьер — один из двух отказов */
function dialog (p, person, api) {
  ST.dialogs++;
  const a = pickNew(COURIER, 'r');
  const b = pickNew(COURIER, 'r');                  // pickNew не повторяет прошлую — b ≠ a
  if (api && api.hold) api.hold(true);
  const name = person.first || String(person.name || '').split(/\s+/)[0];
  const end = r => { ST.reply = r === false ? b : a; if (api && api.hold) api.hold(false); };
  DLG.say({ person, name, text: ST.last, accept: a, decline: b, mood: 'shy', color: '#d6457a' }).then(end, end);
}

/* по-старому, облачками над головами: машина уже едет — игру не останавливаем */
function bubbles (p, api) {
  ST.bubbles++;
  bubble(p.grp, ST.last, '#d6457a', 2.9, FLIRT.HOLD);
  setTimeout(() => {
    const car = api && api.car && api.car();
    if (!car || !car.parent) return;
    ST.reply = pickNew(COURIER, 'r');
    bubble(car, ST.reply, '#3a6fb0', 2.7, FLIRT.REPLY_HOLD);
  }, FLIRT.REPLY * 1000);
}

/* для probe: d.FLIRT.force = 1 — заигрывает каждая подходящая; ST — счётчики */
export const DEBUG = { FLIRT, ST, force: 0, CLIENT, COURIER, roll: (st, ok) => roll(st, ok),
  /* показать окно приглашения сейчас: person — человек (people.js) с лицом */
  dialog: (person, api) => { ST.last = pickNew(CLIENT, 'c'); dialog(null, person, api); return ST.last; } };
