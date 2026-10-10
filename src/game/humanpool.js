/* ──────────────────────────────────────────────────────────────────────────
   Запас готовых людей (docs/AGENTS.md → «Люди из запаса»).

   Человек (makeHuman, people.js) — семь мешей, склейка коробок и лицо на холсте: на «Деке» 1—2 мс,
   толпа у подъезда или футбол — 5—12 мс в одном кадре. Раньше всех, кто рождается на ходу (прохожие,
   парочки, толпы, курьеры конкурентов, медики, компании, мопедисты, гости веранд…), собирали в тот же
   кадр. Теперь — заранее:

   - запас по «ключу» — каким человека просят: без имени (makeHuman(null, o)) или новый человек с именем
     (fresh(o, po) вместо makePerson(po) + makeHuman(person, o)), и с какими o (форма, цвет, толщина…).
     В запасе лежат люди, собранные ровно так же, как собрал бы вызов, — внешность та же, просто раньше;
   - при загрузке (поздняя сборка, latebuild.js) — первые по частым ключам (prefill);
   - потом — понемногу в спокойные кадры (step): не больше ~0,5 мс за кадр, по шагам сборки (people.js
     steps: тело, руки и голова, лицо, волосы и дальний вариант), и только если кадр сам был коротким;
   - каждый ключ сам узнаёт, сколько держать: сколько раз его просили за один кадр (футбол — 6 разом),
     промах — +1 (до 6); ключ, которого не просили 4 минуты, забываем, его людей — вон; всего не больше 48;
   - сменилась погода (сезон: одежда, шапки, капюшоны) или язык (имя) — собранных раньше не выдаём: их — вон,
     запас соберёт заново (people.js humanStale); проверка — при выдаче и раз в ~4 с.

   Свой человек (сюжет, герои, кальянщики по лавочке, богач с правленой внешностью) — собирается как раньше.
   ?nopool — без запаса (сравнить). Числа — __dlv.HPOOL: S (собрано на ходу, мс, из запаса, пополнено),
   snap(), keys().
   ────────────────────────────────────────────────────────────────────────── */
import { lang } from '../i18n/index.js';

let BUILD = null, STEPS = null, MAKEP = null, DROP = null, STALE = null;
const Q = new Map();                  // ключ → { key, kind: 'a' | 'p', o, po, list: [{ g, lang }], want, last, f, burst, n, hit, miss }
let JOB = null;                       // собирается сейчас: { r, it, lang }
let FRAME = 0, POOLED = 0, READY = false;   // READY — город достроен: до этого собираем как раньше и спрос не считаем (загрузка рождает пачками)
const CAP_KEY = 6, CAP_ALL = 48, IDLE = 240e3;
const BUDGET = 0.5, QUIET = 14;       // мс на пополнение за кадр (шаг сборки — 0,03—0,1 мс на «Деке»); кадр дольше QUIET мс — не пополняем
const QS = typeof location !== 'undefined' ? location.search : '';
let ON = !/[?&]nopool\b/.test(QS);
const TRACE = /[?&]hptrace\b/.test(QS);
export const S = { on: ON, built: 0, buildMs: 0, buildMax: 0, taken: 0, refill: 0, refillMs: 0, refillMax: 0, refillOver: 0, dropped: 0, who: {} };

export function init (api) {
  BUILD = api.build; STEPS = api.steps; MAKEP = api.makePerson; DROP = api.drop; STALE = api.stale;
}

/* ключ опций: { fat: true, shirt: '#fff' } → 'fat=1;shirt=#fff;'. Значение-объект — такого не храним (null) */
function okey (o) {
  if (!o) return '';
  let k = '';
  for (const n of Object.keys(o).sort()) {
    const v = o[n];
    if (v === undefined) continue;
    if (v !== null && typeof v === 'object') return null;
    k += n + '=' + (v === true ? 1 : v === false ? 0 : v) + ';';
  }
  return k;
}
const now = () => performance.now();
function note (key, ms) {
  S.built++; S.buildMs += ms; if (ms > S.buildMax) S.buildMax = ms;
  const w = S.who[key] || (S.who[key] = [0, 0, 0]);
  w[0]++; w[1] += ms; if (ms > w[2]) w[2] = ms;
}
function caller () {
  const L = String(new Error().stack || '').split('\n');
  for (let i = 3; i < L.length; i++) { const m = L[i].match(/at (\S+)/); if (m && !/makeHuman|freshHuman|human|fresh|direct/.test(m[1])) return m[1]; }
  return '?';
}
/* собрать сейчас, как раньше (промах запаса или свой человек) */
function direct (key, person, o, po) {
  const t0 = now();
  if (po) person = MAKEP(po);
  const g = BUILD(person, o);
  note(TRACE && key[0] === 'x' ? 'x:' + caller() : key, now() - t0);
  return g;
}
function rec (key, kind, o, po) {
  let r = Q.get(key);
  if (!r) { r = { key, kind, o: o ? { ...o } : {}, po: po ? { ...po } : {}, list: [], want: 0, last: now(), f: -1, burst: 0, n: 0, hit: 0, miss: 0 }; Q.set(key, r); }
  return r;
}
function take (key, kind, o, po) {
  if (!READY) return direct(key, null, o, kind === 'p' ? po || {} : null);
  const r = rec(key, kind, o, po);
  r.last = now(); r.n++;
  if (r.f === FRAME) r.burst++; else { r.f = FRAME; r.burst = 1; }
  if (r.want < r.burst) r.want = Math.min(CAP_KEY, r.burst);
  if (!ON) return direct(key, null, o, kind === 'p' ? po || {} : null);
  const L = lang();
  while (r.list.length) {
    const e = r.list.shift(); POOLED--;
    if ((kind === 'p' && e.lang !== L) || STALE(e.g)) { DROP(e.g); S.dropped++; continue; }   // имя — на прежнем языке, одет не по погоде
    S.taken++; r.hit++;
    return e.g;
  }
  r.miss++;
  if (r.n > 1 && r.want < CAP_KEY) r.want++;
  if (JOB && JOB.r === r) {                         // как раз собирается — достроить сейчас (дешевле, чем заново)
    const t0 = now(), j = JOB;
    JOB = null;
    const g = drain(j);
    note(key, now() - t0);
    if (!STALE(g) && (kind !== 'p' || j.lang === L)) return g;
    DROP(g);
  }
  return direct(key, null, o, kind === 'p' ? po || {} : null);
}

/* makeHuman(person, o): без человека — из запаса, свой — как раньше */
export function human (person, o) {
  if (person) return direct('x', person, o);
  const k = okey(o);
  return k === null ? direct('x', null, o) : take('a' + k, 'a', o, null);
}
/* новый человек с именем и телом: makePerson(po) + makeHuman(person, o). Человек — grp.userData.person */
export function fresh (o, po) {
  const k = okey(o), pk = okey(po);
  if (k === null || pk === null) return direct('x', null, o, po || {});
  return take('p' + pk + '|' + k, 'p', o, po);
}

/* кому собирать: ключ с самой большой нехваткой (среди равных — кого просили позже) */
function deficit () {
  if (POOLED >= CAP_ALL) return null;
  let best = null, bd = 0;
  for (const r of Q.values()) {
    const d = r.want - r.list.length;
    if (d > bd || (d === bd && d > 0 && best && r.last > best.last)) { best = r; bd = d; }
  }
  return best;
}
/* сборка для запаса — по шагам: 0 — сам человек (makePerson: внешность, имя), дальше — шаги people.js steps */
function start (r) { return { r, it: null, i: 0, lang: lang() }; }
function advance (j) {                              // один шаг; готов — человек, нет — null
  j.i++;
  if (!j.it) { j.it = STEPS(j.r.kind === 'p' ? MAKEP({ ...j.r.po }) : null, { ...j.r.o }); return null; }
  const x = j.it.next();
  return x.done ? x.value : null;
}
function drain (j) { let g = null; while (!g) g = advance(j); return g; }
const EST = [];                                     // сколько мс обычно идёт шаг i — не начинать шаг, который не влезет
function put (r, g, L) { r.list.push({ g, lang: L }); POOLED++; S.refill++; }
/* забыть ключи, которых давно не просили, и их людей; одетых не по погоде и с именем на прежнем языке — вон */
function sweep () {
  const t = now(), L = lang();
  for (const [k, r] of Q) {
    for (let i = r.list.length - 1; i >= 0; i--) {
      const e = r.list[i];
      if ((r.kind === 'p' && e.lang !== L) || STALE(e.g)) { DROP(e.g); S.dropped++; POOLED--; r.list.splice(i, 1); }
    }
    if (t - r.last < IDLE) continue;
    if (JOB && JOB.r === r) JOB = null;
    for (const e of r.list) { DROP(e.g); S.dropped++; POOLED--; }
    Q.delete(k);
  }
}

/* раз в кадр, после отрисовки: wk — мс, что занял кадр. Короткий кадр — дособрать запас, ≤ BUDGET мс */
export function step (wk) {
  FRAME++;
  if (!ON || !STEPS || !READY) return;
  if ((FRAME & 255) === 0) sweep();
  if (wk > QUIET) return;
  const t0 = now();
  let did = false;
  for (;;) {
    if (!JOB) { const r = deficit(); if (!r) break; JOB = start(r); }
    const i = JOB.i, s0 = now();
    if (did && s0 - t0 + (EST[i] || 0.1) > BUDGET) break;
    const g = advance(JOB), ms = now() - s0;
    EST[i] = EST[i] === undefined ? ms : EST[i] * 0.9 + ms * 0.1;
    did = true;
    if (g) { put(JOB.r, g, JOB.lang); JOB = null; }
  }
  if (!did) return;
  const ms = now() - t0;
  S.refillMs += ms; if (ms > S.refillMax) S.refillMax = ms;
  if (ms > 1) S.refillOver++;                        // кадров, где пополнение вышло дольше 1 мс
}

/* при загрузке (поздняя сборка): [kind, o, po, сколько] — по человеку за шаг */
export function* prefill (plan) {
  if (!ON || !STEPS) return;
  for (const [kind, o, po, n] of plan) {
    const key = kind === 'p' ? 'p' + okey(po) + '|' + okey(o) : 'a' + okey(o);
    const r = rec(key, kind, o, po);
    r.want = Math.max(r.want, n);
    while (r.list.length < n && POOLED < CAP_ALL) {
      const j = start(r);
      put(r, drain(j), j.lang);
      yield key;
    }
  }
}

/* город достроен (latebuild onDone): с этого кадра — запас и счёт; что собрано при загрузке — не в счёт */
export function ready () {
  READY = true;
  Object.assign(S, { built: 0, buildMs: 0, buildMax: 0, taken: 0, refill: 0, refillMs: 0, refillMax: 0, refillOver: 0, dropped: 0, who: {} });
}
export function snap () {
  return { ...S, left: POOLED, keys: Q.size, who: Object.fromEntries(Object.entries(S.who).map(([k, v]) => [k, v.slice()])) };
}
export const DEBUG = {
  S, snap, get ready () { return READY; }, get on () { return ON; }, set on (v) { ON = S.on = !!v; },
  /* сколько мс каждый шаг сборки (n человек, потом — вон): [в среднем, худший] по шагам */
  bench (n = 30, o = {}) {
    const T = [];
    for (let k = 0; k < n; k++) {
      const it = STEPS(MAKEP({}), { ...o });
      for (let i = 0; ; i++) {
        const t0 = now(), x = it.next(), ms = now() - t0, s = T[i] || (T[i] = [0, 0]);
        s[0] += ms; if (ms > s[1]) s[1] = ms;
        if (x.done) { DROP(x.value); break; }
      }
    }
    return T.map(([a, m]) => [+(a / n).toFixed(2), +m.toFixed(2)]);
  },
  keys: () => [...Q.values()].map(r => [r.key, r.list.length, r.want, r.n, r.hit, r.miss]).sort((a, b) => b[3] - a[3]),
};
