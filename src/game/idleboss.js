/* ──────────────────────────────────────────────────────────────────────────
   Управляющий замечает простой (23.10.2026, IDEAS 11я; правила словами — docs/CAREER.md «Простой», числа —
   econ.js IDLE_BOSS). Автор: «отвёз пару заказов, всё остальное время просто стоял, опоздав обратно — менеджер
   должен подмечать».

   Простой — на смене карьеры машина стоит (медленнее STAND м/с), пока везёшь заказ (drive, поручение side) или едешь
   назад в пиццерию (back); и всё время после того, как срок «вернуться до» вышел, — едешь или нет. Не простой: у двери
   и в пиццерии (handover, погрузка, накладная), окно разговора, мини-игра у двери, катсцена, карта, пауза.
   Подряд AT[0] с — Толик пишет в чат «ты где?», AT[1] — «пицца стынет», AT[2] — «ещё минута — и отдам заказ другому»;
   дальше молчит (штрафа нет). Поехал по делу дольше MOVE с — счёт заново (снова с «ты где?»).
   В чек смены — строка «простой · 3:20» (career.js endRows): куски простоя от GRACE с подряд, всего от ROW с.
   Не в первой (учебной) смене, не после полуночи (развоз и дорога домой), не в быстром заезде, не «покататься».

     IDLEB.init({ S, V, busy() → окно / мини-игра / катсцена / карта, ok() → смена карьеры, где можно, chat(text, angry) })
     IDLEB.shiftStart()  — смена началась (career.js onShiftStart)
     IDLEB.step(dt)      — каждый кадр мира (game.js CL.step 'idleboss')
     IDLEB.total()       — сколько секунд простоя за смену (для чека)
     IDLEB.endRow()      — строка чека [подпись, значение, класс] или null
   Отладка: __dlv.IDLEB — D (состояние), fire(i) — сказать i-ю фразу сейчас.
   ────────────────────────────────────────────────────────────────────────── */
import * as ECON from './econ.js';
import { t, N_ } from '../i18n/index.js';

/* что пишет Толик: по ступеням; с заказом и без (едешь назад / опоздал обратно) */
const LINES = [
  { order: /*i18n*/ [N_('ты где? клиент ждёт'), N_('алло, ты где? стоишь, что ли?')],
    none: /*i18n*/ [N_('ты где?'), N_('алло, ты где? заказы ждут')] },
  { order: /*i18n*/ [N_('пицца стынет, а ты стоишь'), N_('пицца стынет, клиент звонит')],
    none: /*i18n*/ [N_('тут пиццы стынут, а тебя нет'), N_('пицца стынет. ты едешь?')] },
  { order: /*i18n*/ [N_('ещё минута — и отдам заказ другому'), N_('ещё минута — и твой заказ повезёт другой')],
    none: /*i18n*/ [N_('ещё минута — и отдам заказ другому'), N_('ещё минута — и твои заказы уйдут другому')] },
];

let A = null;
const D = { t: 0, said: 0, move: 0, total: 0, on: false };   // on — смена карьеры не первая (учебная — без простоя)

export function init (api) {
  A = api;
  setTimeout(() => { if (window.__dlv) window.__dlv.IDLEB = DEBUG; }, 0);
}
/** n — какая по счёту смена (career.js onShiftStart: законченных + 1); первая учебная — без простоя */
export function shiftStart ({ n = 1 } = {}) { D.t = 0; D.said = 0; D.move = 0; D.total = 0; D.on = n > 1; }

const pick = a => a[Math.floor(Math.random() * a.length)];
function say (i, withOrder) {
  const L = LINES[Math.min(i, LINES.length - 1)];
  try { A.chat(t(pick(withOrder ? L.order : L.none)), i > 0); } catch (e) { console.warn('[idleboss]', e); }
}
/* кусок простоя кончился: в счёт смены, если был не короче GRACE */
function flush () {
  if (D.t >= ECON.IDLE_BOSS.GRACE) D.total += D.t;
  D.t = 0; D.said = 0;
}

export function step (dt) {
  if (!A || !D.on) return;
  const S = A.S, V = A.V, C = ECON.IDLE_BOSS;
  if (!A.ok()) { if (D.t) flush(); D.move = 0; return; }
  if (A.busy() || S.paused) return;                              // окно поверх — счёт стоит, не сбрасывается
  const st = S.state, sp = Math.sqrt((V.vx || 0) * (V.vx || 0) + (V.vz || 0) * (V.vz || 0));
  const road = st === 'drive' || st === 'back' || st === 'side';
  const staff = !!(S.order && S.order.ord && S.order.ord.type === 'staff');
  const late = st === 'back' && !S.free && S.time < 0;           // срок «вернуться до» вышел
  const idle = road && !staff && (late || sp < C.STAND);
  if (idle) {
    D.move = 0;
    D.t += dt;
    if (D.said < C.AT.length && D.t >= C.AT[D.said]) { say(D.said, st !== 'back'); D.said++; }
    return;
  }
  if (!D.t) return;
  D.move += dt;                                                  // едет по делу (или у двери, в пиццерии)
  if (D.move >= C.MOVE || !road) { D.why = st + ' ' + sp.toFixed(1); flush(); D.move = 0; }   // why — отладка: чем кончился кусок
}

/** секунды простоя за смену (кусок, что идёт, — тоже, если уже не короче GRACE) */
export const total = () => D.total + (D.t >= ECON.IDLE_BOSS.GRACE ? D.t : 0);
const mmss = s => { s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
/** строка чека смены: «простой · 3:20» — если простоя набралось от ROW с */
export function endRow () {
  const s = total();
  return s >= ECON.IDLE_BOSS.ROW ? [t('простой'), mmss(s), ''] : null;    // без штрафа — не красным
}

const DEBUG = { D, get total () { return total(); }, fire: (i = 0, order = true) => say(i, order), LINES };
