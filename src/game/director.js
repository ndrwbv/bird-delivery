/* ──────────────────────────────────────────────────────────────────────────
   Режиссёр событий (docs/CAREER.md «Режиссёр событий», числа — econ.js DIRECTOR,
   что такое сессия — docs/TERMS.md).

   Сессия — игрок сел играть: первый запуск за календарный день или после GAP_H (4 ч) без игры.
   Время последней игры — в сохранении 'dlv-last-play' (пишется раз в минуту, пока игра открыта),
   сделанные доставки и смены сессии — 'dlv-session' (перезапуск внутри сессии её не обнуляет).

   Уровни событий и с какой доставки сессии они открываются (OPEN):
     light  — концерт во дворе, драка компаний, гопники, приглашение клиентки, лоси бодаются/любятся
     story  — главы сюжета и героев, поручения (без счёта «одновременно»: это сами заказы)
     medium — банда у пина, марш протеста, мафиози
     major  — налёт на точку, восстание (драки ступени 4), фестиваль, ураган
   Фестиваль и ураган выбираются в начале смены — в первую смену сессии их нет (PLANNED_SHIFT).
   Одновременно — не больше MAX каждого уровня; после крупного — PAUSE с игры без крупных и средних.
   «Покататься»: лёгкие можно сразу (доставок там нет), остальное — как обычно.

   Модули событий:
     DIRECTOR.can(kind)        — можно ли начать сейчас (перед своим жребием или сразу после него)
     DIRECTOR.start(kind, ttl) — началось (ttl, с — само кончится: мгновенные вроде приглашения)
     DIRECTOR.end(kind)        — кончилось
     DIRECTOR.going([kinds])   — идёт ли что-то из них (музыка, music.js)
     DIRECTOR.sessionShifts()  — сколько смен в сессии (поручения — со 2-й, orders.js)
   Из game.js: init({ Store, S, career, quick(), doorOn(), errAsked() }), shiftStart(ride), delivered(), step(dt).
   Ритм смены (rhythm.js, трек 11): дуга смены и события по ней — режиссёр спрашивает его в can (средние и крупные —
   «сценка», поручение, мини-игра — 'mini', лёгкие — только окна и первый заказ); quiet() — окно «покататься».
   Отладка: __dlv.DIRECTOR — state (сессия, уровни, что идёт, пауза), log (разрешения и отказы),
     relaunch(минут назад) — как будто игру перезапустили через столько минут, setN(n), reset().
   ────────────────────────────────────────────────────────────────────────── */
import { DIRECTOR as C } from './econ.js';
import * as TEL from './telemetry.js';          // анонимная статистика: какое событие началось (telemetry.js)
import * as RHY from './rhythm.js';          // ритм смены: дуга, окна «покататься», бюджет событий (rhythm.js)

export const KINDS = {
  gig: 'light', crew: 'light', thugs: 'light', flirt: 'light', moose: 'light', odd: 'light',   // odd — сценка у двери (oddfolk.js)
  story: 'story', errand: 'story',
  gang: 'medium', march: 'medium', mafia: 'medium',
  raid: 'major', riot: 'major', fest: 'major', hurricane: 'major',
};
const PLANNED = ['fest', 'hurricane'];            // выбираются на смену и идут до её конца
const LIVE = ['drive', 'back', 'handover', 'side'];

let A = null;
const SES = { n: 0, shifts: 0, at: 0, fresh: true };   // n — доставок за сессию, shifts — смен
const ACT = [];                                    // что идёт: { kind, tier, age, ttl }
const LOG = [];
const ST = { pause: 0, writeT: 0, ride: false, last: {}, clock: 0 };

const dayOf = ms => { const d = new Date(ms); return d.getFullYear() * 1000 + d.getMonth() * 40 + d.getDate(); };
function get (k, d) { try { return A && A.Store ? A.Store.get(k, d) : d; } catch (e) { return d; } }
function set (k, v) { try { if (A && A.Store) A.Store.set(k, v); } catch (e) { /* без сохранения — не страшно */ } }
function save () { set('dlv-session', { n: SES.n, shifts: SES.shifts, at: SES.at }); }
function stamp () { set('dlv-last-play', Date.now()); }
function note (s) {
  LOG.push(Math.round(ST.clock) + 'с #' + SES.n + ' ' + s);
  if (LOG.length > C.LOG) LOG.splice(0, LOG.length - C.LOG);
}

/* новая сессия или продолжение — по времени последней игры */
function boot (now = Date.now()) {
  const last = +get('dlv-last-play', 0) || 0;
  let sv = get('dlv-session', null);
  if (typeof sv === 'string') { try { sv = JSON.parse(sv); } catch (e) { sv = null; } }
  const fresh = !last || !sv || now - last >= C.GAP_H * 3600e3 || dayOf(last) !== dayOf(now);
  if (fresh) Object.assign(SES, { n: 0, shifts: 0, at: now, fresh: true });
  else Object.assign(SES, { n: +sv.n || 0, shifts: +sv.shifts || 0, at: +sv.at || now, fresh: false });
  ACT.length = 0; ST.pause = 0; ST.last = {};
  note((fresh ? 'новая сессия' : 'та же сессия') + (last ? ', без игры ' + Math.round((now - last) / 60000) + ' мин' : ', первый запуск'));
  save(); stamp();
}

export function init (api) {
  A = api;
  RHY.init(api);
  boot();
  if (typeof window !== 'undefined' && window.__dlv) window.__dlv.DIRECTOR = DEBUG;
}

/** сменили профиль без перезагрузки (game.js reprofile): сессия — по сохранению нового профиля */
export function reload () { if (A) boot(); }

/* начало смены: идущие события прошлой смены — кончились */
export function shiftStart (ride) {
  ACT.length = 0;
  ST.ride = !!ride;
  if (!ride) { SES.shifts++; save(); }
  RHY.begin(ride);
  stamp();
  note('смена ' + SES.shifts + ' сессии' + (ride ? ' (покататься)' : ''));
}

/* доставка (вручение одного адреса) */
export function delivered () {
  SES.n++;
  save(); stamp();
  note('доставка ' + SES.n);
}

/** сколько смен в этой сессии, считая идущую («покататься» — не в счёт): поручения — со 2-й (orders.js, econ.js ERRAND) */
export const sessionShifts = () => SES.shifts;

/** ритм смены (rhythm.js): мини-игра помечена у заказа (game.js после DOOR.plan); окно «покататься» — Толик молчит */
export const planned = kind => RHY.planned(kind);
export const quiet = () => RHY.quiet();

const count = tier => ACT.reduce((a, e) => a + (e.tier === tier ? 1 : 0), 0);

/* поручение хочет это вручение (orders.js: счёт заказов дошёл, econ.js ERRAND.EVERY_N) — мини-игру и сценку у двери на нём
   не ставим, они — на следующем (24.10.2026: раньше просьбу почти каждый раз съедала сценка или мини-игра у той же двери) */
let ERRW = null;
export function errandWants (f) { ERRW = typeof f === 'function' ? f : null; }
const errWants = () => { try { return !!(ERRW && ERRW()); } catch (e) { return false; } };

function why (kind) {
  if ((kind === 'mini' || kind === 'odd') && errWants()) return 'вручение — под поручение';
  if (kind === 'mini') return RHY.why('mini');     // мини-игра у клиента: часы doorstep.js подошли — ждёт, пока ритм пустит
  const tier = KINDS[kind];
  if (!tier) return '';                            // незнакомое — не сдерживаем
  if (tier === 'light' && ST.ride) return count('light') >= C.MAX.light ? 'лёгких уже ' + C.MAX.light : '';
  if (SES.n < C.OPEN[tier]) return 'рано: доставок ' + SES.n + ' из ' + C.OPEN[tier];
  if (PLANNED.includes(kind) && SES.shifts < C.PLANNED_SHIFT) return 'первая смена сессии';
  if (kind === 'errand') return RHY.why('errand');
  if (tier === 'story') return '';
  if (count(tier) >= C.MAX[tier]) return tier + ' уже идёт: ' + ACT.filter(e => e.tier === tier).map(e => e.kind).join(', ');
  if (ST.pause > 0 && (tier === 'major' || tier === 'medium')) return 'пауза после крупного ' + Math.ceil(ST.pause) + ' с';
  if (PLANNED.includes(kind)) return '';         // фестиваль и ураган — на всю смену, их ритм не дозирует
  return RHY.why(tier === 'light' ? 'light' : 'scene');
}

export function can (kind) {
  const w = why(kind);
  if (ST.last[kind] !== w) {                       // в лог — только перемены: модули спрашивают хоть каждый кадр
    ST.last[kind] = w;
    note((w ? 'нет ' : 'можно ') + kind + (w ? ': ' + w : ''));
  }
  return !w;
}

export function start (kind, ttl = 0) {
  const tier = KINDS[kind];
  TEL.ev('event', { k: kind });
  TEL.count('ev.' + kind);
  if (!tier || tier === 'story') return;
  ACT.push({ kind, tier, age: 0, ttl: ttl || (PLANNED.includes(kind) ? 0 : C.AGE) });
  ST.last[kind] = undefined;
  note('начало ' + kind);
  if (tier === 'light') RHY.light(kind);
  else if (!PLANNED.includes(kind)) RHY.started(kind);
}

export function end (kind) {
  const i = ACT.findIndex(e => e.kind === kind);
  if (i < 0) return;
  const e = ACT.splice(i, 1)[0];
  if (e.tier === 'major' && !PLANNED.includes(kind)) ST.pause = C.PAUSE;
  ST.last[kind] = undefined;
  note('конец ' + kind);
  if (e.tier !== 'light' && !PLANNED.includes(kind)) RHY.ended(kind);
}

/** идёт ли хоть одно из событий kinds (музыка: напряжённый трек — music.js) */
export const going = kinds => ACT.some(e => kinds.includes(e.kind));

export function step (dt) {
  if (!A) return;
  ST.clock += dt;
  if ((ST.writeT -= dt) <= 0) { ST.writeT = 60; stamp(); }
  const S = A.S;
  RHY.step(dt, !!S && LIVE.includes(S.state) && !S.paused);
  if (!S || !LIVE.includes(S.state)) return;
  if (ST.pause > 0) ST.pause = Math.max(0, ST.pause - dt);
  for (let i = ACT.length - 1; i >= 0; i--) {
    const e = ACT[i];
    e.age += dt;
    if (e.ttl && e.age >= e.ttl) { ACT.splice(i, 1); if (e.tier === 'major') ST.pause = C.PAUSE; note('само кончилось ' + e.kind); if (e.tier !== 'light') RHY.ended(e.kind); }
  }
}

export const DEBUG = {
  C, KINDS,
  get state () {
    const open = {};
    for (const t of Object.keys(C.OPEN)) open[t] = SES.n >= C.OPEN[t];
    return { session: { ...SES }, open, ride: ST.ride, pause: Math.ceil(ST.pause),
      active: ACT.map(e => e.kind + ':' + Math.round(e.age)), lastPlay: get('dlv-last-play', 0) };
  },
  log: LOG,
  RHY: RHY.DEBUG,
  can: k => can(k),
  why: k => why(k),
  /* как будто игру закрыли min минут назад и запустили снова */
  relaunch: (min = 0) => { set('dlv-last-play', Date.now() - min * 60000); boot(); return DEBUG.state; },
  setN: n => { SES.n = n; save(); return DEBUG.state; },
  reset: () => { set('dlv-last-play', 0); boot(); return DEBUG.state; },
};
