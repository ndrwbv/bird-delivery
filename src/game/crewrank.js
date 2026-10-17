/* ──────────────────────────────────────────────────────────────────────────
   Рейтинг смены: ты среди своих курьеров (автор 16.10.2026: «тебе постоянно должны писать, что ты
   отстаёшь в пиццерии по заказам или наоборот; игроку надо показывать, что он в рейтинге и
   поднимается или падает»). Правила словами — docs/CAREER.md «Рейтинг смены».

   1. Хад: строка «место 2 из 5» (game.js rivalsStep → hud). Место сменилось — строка на миг
      вспыхивает (зелёным вверх, красным вниз) и рядом штампом шлёпается стрелка ↑ / ↓; всё —
      1,4 с, без звука, дальше — как было.
   2. Чат пиццерии (chat.js, справа сверху): пишут сами коллеги (их лица и имена) и Толик —
      обогнал коллегу, тебя обогнали, стал первым, стал последним, среди коллег сменился первый
      (подкалывают друг друга); и время от времени — как
      идёшь («отстаёшь от Вити на 2 заказа», «ты первый, Гоша дышит в спину»). Не чаще раза
      в RANK.GAP с; сводка — раз в RANK.EVERY с; первые RANK.GRACE с смены — молча.
      Фраза не повторяется подряд (последние RANK.MEM не берутся).

   Место — по деньгам за смену (как таблица в паузе); «на 2 заказа» — разница в деньгах,
   делённая на средний заказ коллег этой смены.

   Из game.js: CR.init({ adult }); CR.reset() — новая смена; CR.tick(dt) — каждый кадр смены;
   CR.update(el, rows, live) — раз в 0,5 с: rows — rivalBoard() (у коллег поле R), live —
   можно писать (едешь, не учебный заказ). Отладка: __dlv.CREWRANK (log, moves).
   ────────────────────────────────────────────────────────────────────────── */
import './crewrank.css';
import { t, tn, N_ } from '../i18n/index.js';
import * as CHAT from './chat.js';

export const RANK = {
  GAP: 30,            // с — не чаще одной фразы про рейтинг
  GAP_PH: 60,         // с — то же на телефоне (чат там узкой колонкой над педалями — реже; ревью 17.10, Р12)
  EVERY: [120, 180],  // с — сводка «как идёшь», если ничего не случилось
  GRACE: 40,          // с — начало смены: все по нулям, молчат
  LEAD: 100,          // с — коллеги подкалывают друг друга (сменился первый среди них) не чаще
  STALE: 20,          // с — событие (обогнал / обогнали) не успели сказать — старое, не говорим
  CLOSE: 0.75,        // меньше стольких заказов — «рядом», «дышит в спину»
  FEE: 1300,          // ₽ — средний заказ, пока никто из коллег не довёз
  MEM: 4,             // последние столько фраз подряд не повторяются
  OWN: 0.4,           // доля сводок, когда вместо неё коллега пишет свою фразу (у каждого 1—2 своих — crewcast.js)
  FLASH: 1400,        // мс — вспышка строки и стрелка на хаде
};

/* ── фразы. s — кто пишет: boss — Толик, them — коллега из события, other — другой коллега (подкалывает);
   f — та же фраза, если коллега из события — женщина. В тексте: {who} — имя, {gen} — «от кого» (Вити),
   {gap} — «2 заказа». adult — только во взрослой (мат). ── */
const L = {
  pass: [   // ты обогнал коллегу {who}
    { k: 'p1', s: 'them', m: N_('ну обогнал, ну молодец. посмотрим, кто кого к концу смены') },
    { k: 'p2', s: 'boss', m: N_('{who} теперь позади тебя. так держать)') },
    { k: 'p3', s: 'other', m: N_('{who}, тебя новенький обогнал))) позорище') },
    { k: 'p4', s: 'them', m: N_('эй! это вообще-то был мой заказ') },
    { k: 'p5', s: 'them', adult: true, m: N_('сука, обогнал всё-таки. ладно, ещё не вечер') },
  ],
  passed: [ // коллега {who} обогнал тебя
    { k: 'd1', s: 'them', m: N_('пока-пока) не скучай там сзади') },
    { k: 'd2', s: 'them', m: N_('сорян, на кухне у меня свои люди') },
    { k: 'd3', s: 'boss', m: N_('{who} тебя обошёл. не спим, не спим'), f: N_('{who} тебя обошла. не спим, не спим') },
    { k: 'd4', s: 'other', m: N_('смотри, как {who} тебя сделал. учись'), f: N_('смотри, как {who} тебя сделала. учись') },
    { k: 'd5', s: 'them', adult: true, m: N_('посторонись, лошара. профи едет') },
  ],
  first: [  // ты стал первым; {who} — теперь второй
    { k: 'f1', s: 'boss', m: N_('ты первый по смене. не расслабляйся') },
    { k: 'f2', s: 'them', m: N_('первый, значит. ну-ну, я рядом') },
    { k: 'f3', s: 'other', m: N_('новенький всех обогнал. нам конец') },
    { k: 'f4', s: 'boss', adult: true, m: N_('первый, мать его. Палыч не верит') },
  ],
  last: [   // ты стал последним; {who} — тот, кто прямо перед тобой
    { k: 'l1', s: 'boss', m: N_('последний по смене. Палыч уже спрашивает, кто это такой') },
    { k: 'l2', s: 'them', m: N_('ты там живой? мы уже по второму кругу') },
    { k: 'l3', s: 'other', m: N_('кто последний — моет кухню. правила такие)') },
    { k: 'l4', s: 'them', adult: true, m: N_('последний, бля. может, тебе велик выдать?') },
  ],
  lead: [  // среди коллег сменился первый (ты не первый): {who} — новый первый, {loser} — бывший; пишут друг другу
    { k: 'g1', s: 'them', m: N_('{loser}, подвинься. теперь я первый'), f: N_('{loser}, подвинься. теперь я первая') },
    { k: 'g2', s: 'loser', m: N_('{who}, ты по встречке, что ли, гоняешь?') },
    { k: 'g3', s: 'boss', m: N_('{who} теперь первый среди наших. а ты?'), f: N_('{who} теперь первая среди наших. а ты?') },
    { k: 'g4', s: 'them', m: N_('кто тут быстрее всех? правильно)') },
  ],
  /* сводка: sit — когда подходит. firstNear / firstFar — ты первый ({who} — второй, ближе / дальше
     CLOSE заказа); upNear / upFar — кто-то впереди ({who} — прямо перед тобой); downNear — {who} прямо
     за тобой ближе CLOSE; last — ты последний ({who} — прямо перед тобой) */
  status: [
    { k: 's1', sit: 'firstNear', s: 'boss', m: N_('ты первый, {who} дышит в спину') },
    { k: 's2', sit: 'firstNear', s: 'them', m: N_('догоняю, слышишь? я прямо за тобой') },
    { k: 's3', sit: 'firstFar', s: 'boss', m: N_('ты первый, отрыв — {gap}. красиво идёшь') },
    { k: 's4', sit: 'firstFar', s: 'other', m: N_('{who}, проснись. новенький на {gap} впереди') },
    { k: 's5', sit: 'upFar', s: 'boss', m: N_('отстаёшь от {gen} на {gap}. поднажми') },
    { k: 's6', sit: 'upFar', s: 'them', m: N_('я впереди на {gap}. догоняй)') },
    { k: 's7', sit: 'upNear', s: 'boss', m: N_('до {gen} — ползаказа. рви') },
    { k: 's8', sit: 'downNear', s: 'them', m: N_('я за тобой, не тормози') },
    { k: 's9', sit: 'downNear', s: 'other', m: N_('ставлю косарь, что {who} тебя обгонит') },
    { k: 's10', sit: 'last', s: 'boss', m: N_('последний. до {gen} — {gap}. Палыч уже спрашивает') },
    { k: 's11', sit: 'last', s: 'other', m: N_('ну что, последний, кофе нам принесёшь?') },
  ],
};

const ST = { leadT: -1e9, adult: false, clock: 0, last: -1e9, next: 0, above: null, place: 0, n: 0, ev: null, recent: [], key: '', lead: null };
export const DEBUG = { log: [], moves: [], L, RANK, ST };

export function init ({ adult } = {}) { ST.adult = !!adult; }

/** новая смена: всё с нуля */
export function reset () {
  ST.clock = 0; ST.last = -1e9; ST.next = RANK.GRACE + rnd(RANK.EVERY[0], RANK.EVERY[1]) * 0.5;
  ST.leadT = -1e9; ST.above = null; ST.place = 0; ST.n = 0; ST.ev = null; ST.key = ''; ST.lead = null;
  DEBUG.log.length = 0; DEBUG.moves.length = 0;
}
export function tick (dt) { ST.clock += dt; }

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];

/* ── хад: «место 2 из 5»; сменилось — вспышка и стрелка (crewrank.css) ── */
const ARROW = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 .8 9.4 5.6H6.6V9.2H3.4V5.6H.6Z"/></svg>';
function hud (el, place, n) {
  const key = place + '/' + n;
  if (key === ST.key) return;
  const was = ST.key ? +ST.key.split('/')[0] : 0, sameN = ST.key && +ST.key.split('/')[1] === n;
  ST.key = key;
  const dir = was && sameN && place !== was ? (place < was ? 'up' : 'down') : '';
  el.innerHTML = '<li class="me' + (dir ? ' cr-' + dir : '') + '"><i class="you"></i><b>' + t('место {i} из {n}', { i: place, n }) + '</b>' +
    (dir ? '<em class="cr-arr">' + ARROW + '</em>' : '') + '</li>';
  if (dir) DEBUG.moves.push({ t: Math.round(ST.clock), from: was, to: place, n });
}

/* ── чат ── */
function avgFee (rows) {
  let m = 0, d = 0;
  for (const r of rows) if (r.R && r.R.done) { m += r.R.money; d += r.R.done; }
  return d ? m / d : RANK.FEE;
}
const gapText = n => tn(n, '{n} заказ|{n} заказа|{n} заказов');

/* сказать фразу из pool (уже отобранной по ситуации): who — коллега из события (row) */
function speak (cands, rows) {
  const ok = cands.filter(c => (!c.l.adult || ST.adult) && !ST.recent.includes(c.l.k));
  const list = ok.length ? ok : cands.filter(c => !c.l.adult || ST.adult);
  if (!list.length) return false;
  const c = pick(list), l = c.l, R = c.who && c.who.R;
  let by = null;
  if (l.s === 'them') by = R;
  else if (l.s === 'other') by = c.other;
  else if (l.s === 'loser') by = c.loser;
  if (l.s !== 'boss' && !by) return false;
  const fem = R && R.person && R.person.f;
  const text = t(fem && l.f ? l.f : l.m, {
    loser: c.loser ? c.loser.name : '', who: R ? R.name : '', gen: R ? (R.person && R.person.firstGen) || R.name : '', gap: c.gap ? gapText(c.gap) : '',
  });
  CHAT.say(text, null, false, by ? { name: by.name, person: by.person } : null);
  ST.last = ST.clock; ST.next = ST.clock + rnd(RANK.EVERY[0], RANK.EVERY[1]);
  ST.recent.push(l.k); while (ST.recent.length > RANK.MEM) ST.recent.shift();
  DEBUG.log.push({ t: Math.round(ST.clock), k: l.k, by: by ? by.name : t('Толик управляющий'), text });
  if (DEBUG.log.length > 200) DEBUG.log.shift();
  return true;
}

/* своя фраза коллеги (R.lines — crewcast.js): вместо сводки, когда сказать про рейтинг нечего */
function own (rows) {
  const cs = [];
  for (const r of rows) if (r.R && !r.out && r.R.lines) r.R.lines.forEach((m, i) => { const k = 'own:' + r.R.name + i; if (!ST.recent.includes(k)) cs.push({ R: r.R, m, k }); });
  if (!cs.length) return false;
  const c = pick(cs);
  CHAT.say(c.m, null, false, { name: c.R.name, person: c.R.person });
  ST.last = ST.clock; ST.next = ST.clock + rnd(RANK.EVERY[0], RANK.EVERY[1]);
  ST.recent.push(c.k); while (ST.recent.length > RANK.MEM) ST.recent.shift();
  DEBUG.log.push({ t: Math.round(ST.clock), k: c.k, by: c.R.name, text: c.m });
  if (DEBUG.log.length > 200) DEBUG.log.shift();
  return true;
}

/* другой коллега, не R (подкалывает); нет — null (в смене один коллега) */
function otherThan (rows, R) {
  const o = rows.filter(r => r.R && r.R !== R && !r.out && (!R || r.R.name !== R.name));   // тёзка подкалывает тёзку — путаница
  return o.length ? pick(o).R : null;
}
const cands = (pool, who, rows, gap) => pool.map(l => ({ l, who, gap, other: l.s === 'other' ? otherThan(rows, who && who.R) : null }))
  .filter(c => c.l.s !== 'other' || c.other);

/* событие ещё правда? (место могло вернуться, пока чат был занят) */
function stillTrue (ev, rows, me) {
  const i = rows.findIndex(r => r.R && r.R === ev.who.R);
  if (i < 0) return false;
  if (ev.kind === 'first') return me === 0;
  if (ev.kind === 'last') return me === rows.length - 1;
  if (ev.kind === 'pass') return i > me;
  if (ev.kind === 'passed') return i < me;
  if (ev.kind === 'lead') return me > 0 && rows.find(r => r.R) === rows[i];
  return false;
}

function status (rows, me) {
  const fee = avgFee(rows), n = rows.length, my = rows[me];
  const out = [];
  const add = (sit, who, gapM) => {
    const g = Math.max(0, gapM) / fee;
    out.push(...cands(L.status.filter(l => l.sit === sit), who, rows, Math.max(1, Math.round(g))));
  };
  if (me === 0) { const g = (my.m - rows[1].m) / fee; add(g < RANK.CLOSE ? 'firstNear' : 'firstFar', rows[1], my.m - rows[1].m); }
  else if (me === n - 1) add('last', rows[me - 1], rows[me - 1].m - my.m);
  else {
    const up = rows[me - 1], dn = rows[me + 1];
    add((up.m - my.m) / fee < RANK.CLOSE ? 'upNear' : 'upFar', up, up.m - my.m);
    if ((my.m - dn.m) / fee < RANK.CLOSE) add('downNear', dn, my.m - dn.m);
  }
  return out;
}

/** раз в 0,5 с: хад и, если можно, фраза в чат */
export function update (el, rows, live) {
  const me = rows.findIndex(r => r.me), n = rows.length;
  if (me < 0) return;
  if (el) hud(el, me + 1, n);
  // кто впереди тебя: сравнить с прошлым разом — кого обогнал, кто обогнал
  const above = new Set(rows.slice(0, me).map(r => r.R));
  if (ST.above && ST.n === n) {
    const passed = rows.slice(me + 1).find(r => ST.above.has(r.R));    // был впереди — теперь сзади
    const got = rows.slice(0, me).find(r => !ST.above.has(r.R));       // был сзади — теперь впереди
    let ev = null;
    if (me === 0 && ST.place !== 1 && n > 1) ev = { kind: 'first', who: rows[1] };
    else if (me === n - 1 && ST.place !== n && n > 1) ev = { kind: 'last', who: rows[me - 1] };
    else if (passed) ev = { kind: 'pass', who: passed };
    else if (got) ev = { kind: 'passed', who: got };
    if (ev) { ev.at = ST.clock; ST.ev = ev; }
  }
  // среди коллег сменился первый (не из-за тебя): подкалывают друг друга — если сказать больше нечего
  const top = rows.find(r => r.R);
  if (top && ST.lead && top.R !== ST.lead && me > 0 && top.m > 0 && !ST.ev && ST.clock - ST.leadT > RANK.LEAD && top.R.name !== ST.lead.name) ST.ev = { kind: 'lead', who: top, loser: ST.lead, at: ST.clock };
  ST.lead = top ? top.R : null;
  ST.above = above; ST.place = me + 1; ST.n = n;

  if (!live || n < 2 || ST.clock < RANK.GRACE || ST.clock - ST.last < (CHAT.phone() ? RANK.GAP_PH : RANK.GAP) || CHAT.busy()) return;
  const ev = ST.ev;
  if (ev) {
    ST.ev = null;
    const cs = cands(L[ev.kind], ev.who, rows);
    if (ev.loser) for (const c of cs) c.loser = ev.loser;
    if (ST.clock - ev.at <= RANK.STALE && stillTrue(ev, rows, me) && speak(cs, rows)) { if (ev.kind === 'lead') ST.leadT = ST.clock; return; }
  }
  if (ST.clock >= ST.next) {
    if (!((Math.random() < RANK.OWN && own(rows)) || speak(status(rows, me), rows))) ST.next = ST.clock + 15;
  }
}
