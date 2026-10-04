/* ──────────────────────────────────────────────────────────────────────────
   Клиентка заигрывает при вручении (только взрослая версия; правила — docs/ORDERS.md
   «Клиентка заигрывает», docs/CONTENT.md). Без подробностей: одна фраза — и вежливый отказ.

   Когда: вручение вовремя (не опоздал, не задел клиента машиной), клиент — женщина, заказ не
     сюжетный и не учебный, у клиента нет «Сдачи не надо!» богача. Тогда с шансом P (8 %, ≈ 1 из 12
     таких вручений; женщин среди клиентов около половины — в среднем ≈ 1 из 25 вручений вообще).
   Что: через SAY (0,9 с, коробка уже в руках) над клиенткой облачко с розовой обводкой (talk.js) с фразой из CLIENT
     (висит HOLD 3,2 с), через REPLY (1,6 с) после неё над машиной — ответ курьера из COURIER
     (висит 2,6 с). Курьер всегда отказывает. Одна и та же фраза два раза подряд не бывает.
   В детской (Яндекс, ?kids) модуль не вызывается вовсе (game.js: только при ADULT).

   Из game.js: FLIRT.onHand(st, onTime, api) — после handOver; api = { car: () => группа машины }
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t, N_ } from '../i18n/index.js';
import * as DIRECTOR from './director.js';
import * as TALK from './talk.js';             // облачка реплик (talk.js)   // режиссёр событий (director.js)

export const FLIRT = { P: 0.08, SAY: 0.9, HOLD: 3.2, REPLY: 1.6, REPLY_HOLD: 2.6 };

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

const ST = { hands: 0, fem: 0, rolled: 0, shown: 0, last: '' , reply: '' };
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
  DIRECTOR.start('flirt', FLIRT.SAY + FLIRT.REPLY + FLIRT.REPLY_HOLD);
  const p = st.peds[0];
  setTimeout(() => {
    if (p.dead || !p.grp.parent) return;
    ST.shown++;
    ST.last = pickNew(CLIENT, 'c');
    bubble(p.grp, ST.last, '#d6457a', 2.9, FLIRT.HOLD);
    setTimeout(() => {
      const car = api && api.car && api.car();
      if (!car || !car.parent) return;
      ST.reply = pickNew(COURIER, 'r');
      bubble(car, ST.reply, '#3a6fb0', 2.7, FLIRT.REPLY_HOLD);
    }, FLIRT.REPLY * 1000);
  }, FLIRT.SAY * 1000);
  return true;
}

/* для probe: d.FLIRT.force = 1 — заигрывает каждая подходящая; ST — счётчики */
export const DEBUG = { FLIRT, ST, force: 0, CLIENT, COURIER, roll: (st, ok) => roll(st, ok) };
