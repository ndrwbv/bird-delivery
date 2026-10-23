/* Одно уведомление за раз (автор 18.10.2026: «привёз пиццу — сначала покажи, что он молодец, и чаевые, потом сообщение
   менеджера, потом что-то другое; иначе игрок не успеет обработать столько инфы»). Правила словами — docs/CAREER.md
   «Одно уведомление за раз». Заменяет прежнюю очередь вручения (ridequeue.js — теперь тонкая обёртка над этой).

   Всё, что всплывает поверх езды, — в одну очередь: на экране одно уведомление, между ними пауза Q.GAP с.
     что                                   вид     важность
     срочное (urgent: «опаздываешь», «поторопись!», «гонится за тобой», «заглохла!») — перебивает текущее
     чек оплаты, «+N ₽», чаевые (popPay)    pay     1 — перебивает всё несрочное (cut)
     Толик: чат, реплика на ходу            boss/line 2
     таблица рейтинга после вручения        rank    3
     грамота достижения, задание выполнено  ach/daily 4
     тосты, подсказки, записка заданий      toast/hint/note 5
     коллеги и Толик про рейтинг в чате     crew    6 — самое неважное
   Порядок — по важности, при равной — кто раньше. Каждое держит экран своё время (по длине текста — считает тот, кто
   зовёт). Ждёт дольше своего wait — устарело, выбрасывается (drop). Пока игра не идёт поверх езды (пауза, окно
   разговора, накладная, мини-игра у двери, катсцена, карта, повтор, «воскреснуть?») — очередь стоит: ждущие не
   стареют, время текущего тоже стоит (после окна следующее не наложится на недоигравшее). Вне смены (меню, чек смены) — очередь идёт, но тосты, подсказки, реплики, рейтинг и коллеги,
   оставшиеся от смены, выбрасываются (OUT_DROP).

   Два способа:
     NQ.push({ kind, text, ms, show, hide, drop, wait, urgent, cut, key, group, max, ready, stale, once, manual })
       — показать, когда дойдёт очередь: show(it) рисует; ms — сколько держит экран (manual — до NQ.done(it));
       hide(it, again) — перебили (срочное, чек) или убрали; again — перебили почти сразу (раньше it.fresh / Q.FRESH с):
       встанет обратно и покажется заново целиком; drop(it) — выброшено, так и не показав (устарело, лишнее, clear);
       key — такое же уже ждёт или на экране — новое не ставим; group + max — из группы ждут не больше max
       (лишние, самые старые, — drop); ready() — пока false, ждёт (время идёт); stale() — true — выбросить;
       once — перебитое не повторять (чат: сообщение уже в ленте). → it (или null, если не поставили)
     NQ.claim(kind, soft) / NQ.release(kind) — для тех, кто рисует сам каждый кадр (подсказки, таблица рейтинга):
       claim → true — экран твой (зови каждый кадр, пока показываешь; перестал звать на 0,4 с — отпущен сам);
       false — занято или перебили: спрячься. soft — перебивает любое более важное из очереди (подсказка).
     NQ.done(it)          — manual-уведомление ушло само (реплика на ходу допечаталась и отвисела, клик)
     NQ.clear(kinds, keep) — выбросить ждущих этих видов (и снять текущее, если оно из них и не keep)
     NQ.busy()            — на экране что-то есть или идёт пауза между
     NQ.idle()            — не занято и никто не ждёт
     NQ.waiting(kind)     — сколько ждёт этого вида
     NQ.init({ phase })   — game.js: phase() → 'ride' (едешь — идёт) | 'wait' (окно поверх — стоит) | 'out' (не смена)
   Отладка: window.__NQ (с ?debug и в dev) — log, stats(), Q, cur. */

export const Q = {
  GAP: 0.5,         // с — пауза между уведомлениями
  WAIT: 20,         // с — по умолчанию: ждёт дольше — устарело
  SAFE: 30,         // с — manual держит экран дольше — снимаем (предохранитель; реплика в 200 букв — ~20 с)
  FRESH: 1,         // с — перебитое раньше этого — встаёт обратно в очередь, покажется целиком (у каждого может быть своё: it.fresh)
  CUT_GAP: 0.3,     // с — перебили несрочным (чек): перебитому — погаснуть (тост гаснет 0,25 с), новое — после
  CUT_POLL: 0.4,    // с — то же, если перебили того, кто рисует сам (таблица рейтинга сворачивается 0,35 с, подсказка)
  LEASE: 0.4,       // с — claim не звали столько — экран отпущен
};
export const PRIO = { urgent: 0, pay: 1, boss: 2, line: 2, rank: 3, ach: 4, daily: 4, toast: 5, hint: 5, note: 5, crew: 6 };
/* вне смены выбрасываем — устарело вместе со сменой */
const OUT_DROP = new Set(['toast', 'hint', 'note', 'rank', 'crew', 'line']);

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
let API = { phase: () => 'out' };
let cur = null, gapUntil = 0, timer = 0, lastPhase = 'out', seq = 0, lastPump = 0;
const LIST = [];
const LOG = [];
const ST = { shown: {}, dropped: {}, cut: 0, stale: 0, maxWait: 0 };

export function init (api) { API = { ...API, ...api }; }
const phase = () => { try { return API.phase() || 'out'; } catch (e) { return 'out'; } };
const prioOf = it => (it.urgent ? PRIO.urgent : PRIO[it.kind] !== undefined ? PRIO[it.kind] : 5);
function log (act, it, extra) {
  LOG.push({ t: +now().toFixed(2), act, kind: it.kind, text: String(it.text || '').slice(0, 70), ...(extra || {}) });
  if (LOG.length > 300) LOG.shift();
}
const call = (f, it) => { if (f) try { f(it); } catch (e) { console.warn('[notifyq]', e); } };

function dropIt (it, why) {
  const i = LIST.indexOf(it);
  if (i >= 0) LIST.splice(i, 1);
  ST.dropped[it.kind] = (ST.dropped[it.kind] || 0) + 1;
  if (why === 'stale') ST.stale++;
  log('drop:' + why, it);
  call(it.drop, it);
}

export function push (o) {
  const it = { kind: 'toast', ms: 2500, wait: Q.WAIT, ...o, id: ++seq, at: now(), age: 0 };
  it.prio = prioOf(it);
  if (it.key && ((cur && !cur.poll && cur.it.key === it.key) || LIST.some(x => x.key === it.key))) { log('dup', it); call(it.drop, it); return null; }
  LIST.push(it);
  if (it.group && it.max >= 0) {
    const g = LIST.filter(x => x.group === it.group);
    while (g.length > it.max) dropIt(g.shift(), 'extra');
    if (!LIST.includes(it)) return null;
  }
  pump();
  return it;
}

/* показать it сейчас */
function start (it) {
  const i = LIST.indexOf(it);
  if (i >= 0) LIST.splice(i, 1);
  const t = now();
  ST.maxWait = Math.max(ST.maxWait, t - it.at);
  cur = { it, kind: it.kind, prio: it.prio, t0: t, end: it.manual ? t + Q.SAFE : t + (it.ms || 0) / 1000 };
  ST.shown[it.kind] = (ST.shown[it.kind] || 0) + 1;
  log('show', it, { waited: +(t - it.at).toFixed(1) });
  call(it.show, it);
  arm();
}
/* текущее ушло */
function finish () {
  if (!cur) return;
  if (!cur.poll) log('end', cur.it);
  cur = null;
  gapUntil = now() + Q.GAP;
  arm();
}
/* перебить текущее: спрятать; почти не видели — обратно в очередь */
function cutCur () {
  if (!cur) return;
  ST.cut++;
  if (cur.poll) { cur.cut = true; log('cut', { kind: cur.kind }); cur = null; return; }
  const it = cur.it, seen = now() - cur.t0, again = seen < (it.fresh || Q.FRESH) && !it.once;
  cur = null;
  log('cut', it, { seen: +seen.toFixed(1), again });
  if (it.hide) try { it.hide(it, again); } catch (e) { console.warn('[notifyq]', e); }
  if (again) LIST.unshift(it);
}

function best () {
  let b = null;
  for (const it of LIST) {
    if (it.ready && !it.ready()) continue;
    if (!b || it.prio < b.prio || (it.prio === b.prio && it.at < b.at)) b = it;
  }
  return b;
}

function pump () {
  const t = now(), ph = phase(), dt = Math.min(0.5, Math.max(0, t - (lastPump || t)));
  lastPump = t;
  if (ph === 'out' && lastPhase !== 'out') for (const it of LIST.slice()) if (OUT_DROP.has(it.kind)) dropIt(it, 'out');
  lastPhase = ph;
  // окно поверх (пауза, разговор…): ждущие не стареют, у текущего время стоит — после окна следующее не наложится
  // на недоигравшее (тост под паузой, чек под разговором)
  if (ph === 'wait') { if (cur && !cur.poll) cur.end += dt; if (gapUntil > t) gapUntil += dt; }
  else for (const it of LIST) it.age += dt;
  // устарело: прождало (без окон) дольше своего wait или само сказало stale()
  for (const it of LIST.slice()) {
    let st = false;
    try { st = (it.stale && it.stale()) || it.age > it.wait; } catch (e) { st = true; }
    if (st) dropIt(it, 'stale');
  }
  if (cur) {
    if (cur.poll ? t - cur.seen > Q.LEASE : t >= cur.end) finish();
  }
  if (ph === 'wait') { arm(); return; }
  const b = best();
  if (b && cur) {
    // срочное перебивает всё несрочное; оплата (cut) — всё менее важное; подсказку (soft) — любое более важное
    if ((b.urgent && cur.prio > 0) || (b.cut && b.prio < cur.prio) || (cur.soft && b.prio < cur.prio)) {
      const poll = cur.poll;
      cutCur();
      if (!b.urgent) gapUntil = Math.max(gapUntil, t + (poll ? Q.CUT_POLL : Q.CUT_GAP));   // перебитое гаснет, таблица сворачивается
    }
  }
  if (!cur && b && (t >= gapUntil || b.urgent)) start(b);
  arm();
}
function arm () {
  if (timer) return;
  if (!cur && !LIST.length) { lastPump = 0; return; }
  timer = setTimeout(() => { timer = 0; pump(); }, 100);
}

/* рисует сам каждый кадр (подсказка, таблица рейтинга): true — экран твой */
export function claim (kind, soft) {
  const t = now();
  if (cur && cur.poll && cur.kind === kind) { cur.seen = t; return true; }
  if (cur || phase() === 'wait' || t < gapUntil) return false;
  const p = PRIO[kind] !== undefined ? PRIO[kind] : 5;
  if (LIST.some(it => it.prio <= p && (!it.ready || it.ready()))) { pump(); return false; }
  cur = { poll: true, kind, prio: p, soft: !!soft, t0: t, seen: t };
  ST.shown[kind] = (ST.shown[kind] || 0) + 1;
  log('claim', { kind });
  arm();
  return true;
}
export function release (kind) {
  if (cur && cur.poll && cur.kind === kind) { log('release', { kind }); finish(); }
}
export function done (it) {
  if (cur && !cur.poll && cur.it === it) { finish(); pump(); }
}
export function clear (kinds, keep) {
  const ks = kinds ? new Set([].concat(kinds)) : null;
  for (const it of LIST.slice()) if (!ks || ks.has(it.kind)) dropIt(it, 'clear');
  if (!keep && cur && !cur.poll && (!ks || ks.has(cur.kind))) { const it = cur.it; cur = null; call(it.hide, it); gapUntil = 0; }
}
export const busy = () => !!cur || now() < gapUntil;
export const idle = () => !busy() && !LIST.length;
export const waiting = kind => LIST.filter(it => !kind || it.kind === kind).length;
/* текущее на экране: вид ('' — ничего) */
export const showing = () => (cur ? cur.kind : '');

export const DEBUG = {
  Q, PRIO, LIST, LOG, ST,
  get cur () { return cur ? { kind: cur.kind, poll: !!cur.poll, text: cur.it ? cur.it.text : '', left: cur.poll ? null : +(cur.end - now()).toFixed(1) } : null; },
  stats: () => ({ shown: { ...ST.shown }, dropped: { ...ST.dropped }, cut: ST.cut, stale: ST.stale, maxWait: +ST.maxWait.toFixed(1), waiting: LIST.length,
    drops: LOG.filter(e => e.act.startsWith('drop')).slice(-20).map(e => e.act.slice(5) + ' ' + e.kind + ': ' + e.text),
    cuts: LOG.filter(e => e.act === 'cut').slice(-20).map(e => e.kind + (e.seen !== undefined ? ' ' + e.seen + ' с' : '') + (e.again ? ' ↺' : '') + ': ' + e.text) }),
  log: (n = 60) => LOG.slice(-n),
  phase,
};
try { if (typeof window !== 'undefined' && (import.meta.env.DEV || /[?&]debug\b/.test(location.search))) window.__NQ = DEBUG; } catch (e) { /* — */ }
