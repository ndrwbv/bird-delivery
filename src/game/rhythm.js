/* ──────────────────────────────────────────────────────────────────────────
   Ритм смены (трек 11 п. 1, 11.10.2026; docs/CAREER.md «Ритм смены», числа — RHYTHM в econ.js).
   Автор: «первый заказ простой, потом другие по возрастанию напряжения и дальности, и потом последний
   лёгкий… давать ему и кататься, и наваливать приколов… постоянно вопрос: а что будет дальше?»

   Дуга смены (доля смены — по настоящим секундам до полуночи, CAREERM.shiftLeft):
     open — 1-й заказ: близко, один человек, без событий;
     rise — дальше дальность и напряжение (k от 0 до 1 к доле RAMP) растут: кольцо района шире,
            сборные крупнее, срочные — со второй половины подъёма (orders.js genSpec);
     peak — не раньше 3-го заказа, когда прошла доля PEAK_AT смены или осталось на «ещё один и последний»
            (LAST_S + PEAK_LEFT средних заказов): самый тяжёлый — срочный, «в конец района» или большой сборный;
     last — до конца смены меньше LAST_S с: последний заказ — лёгкий и близкий, без событий.
   События смены («удары»): встреча у двери (encounters.js), мини-игра у клиента (doorstep.js), поручение
   (orders.js ERR), уличная сценка (средние и крупные режиссёра: банда, марш, мафиози, налёт, восстание).
     — не на первом и не на последнем заказе; на одном заказе — одно;
     — после события — окно «просто покататься» QUIET с: ни событий (и лёгких сценок), ни лишнего чата Толика;
     — встреча — только если на прошлом заказе события не было (её ставит сам ритм, заранее);
     — не больше BUDGET за смену, каждого вида — не больше MAX; сценки — с напряжения SCENE_K.
     — «малые» (мини-игра, поручение — SMALL, 17.10.2026): бюджет не тратят, окно «покататься» ждут не дольше SMALL_GAP с.
   Таймеры мини-игр и поручений идут как шли: подошёл срок — ждут, пока ритм пустит.
   Встречи у двери ставит ритм: только в районе MEET.DIST (первом), с MEET.FROM законченных смен, не в быстром
   заезде; разные герои, без героев прошлой смены (сохранение MEET.KEY).
   Знакомое лицо (faces.js, Глеб): там же и тогда же, что встречи, — первым на первом заказе подъёма, где можно встречу;
   одно появление за смену: встреча у двери (как встреча) или заказ ему с поручением (в счёт поручения).
   Жители Юга (locals.js, 17.10.2026): там же и так же, но с 1-й смены игрока — после Глеба, раньше случайной встречи;
   окно разговора у двери — как встреча (faceOn / faceOff), поручение — в счёт поручений, катсцена — встреча.

   Из director.js: init(api), begin(ride), why(kind), started(kind), ended(kind), step(dt, live), quiet().
   Из orders.js: slot(n, left) → { n, role, k, meet } | null (null — ритма нет: «покататься», не карьера),
     meetFailed() — встречу не поставили (нет подъезда), ordered(spec) — заказ собран (в журнал).
   Из encounters.js: provide({ heroes, person(id), door(x, z) }), meetOn(id), meetOff().
   Из game.js (через director): planned('mini') — мини-игра помечена у заказа (doorstep.js plan).
   Отладка: __dlv.RHY — state, log (журнал смены по минутам), why(kind), plan (заказы смены).
   ────────────────────────────────────────────────────────────────────────── */
import { RHYTHM as C } from './econ.js';
import * as DIST from './districts.js';

let A = null;          // { Store, S, career, quick(), doorOn(), errAsked() } — из game.js через director.init
const PROV = { heroes: [], person: null, door: null };
const R = {
  on: false, t: 0, len: 0, n: 0, role: '', k: 0, f: 0, peak: false,
  last: -9, quietTo: 0, calmAt: -999, act: [], pend: '', beats: {}, total: 0, budget: 0,
  meetMax: 0, used: [], prev: [], shift: 0, door: false, side: false, err: 0, face: false, lcHere: false,
  log: [], plan: [],
};

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = v => Math.max(0, Math.min(1, v));
const mmss = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function get (k, d) { try { return A && A.Store ? A.Store.get(k, d) : d; } catch (e) { return d; } }
function set (k, v) { try { if (A && A.Store) A.Store.set(k, v); } catch (e) { /* без сохранения — не страшно */ } }
function note (s) {
  R.log.push(mmss(R.t) + ' ' + s);
  if (R.log.length > C.LOG) R.log.splice(0, R.log.length - C.LOG);
}
/* «малые» события (мини-игра, поручение — RHYTHM.SMALL): бюджет смены не тратят, окно «покататься» ждут не дольше SMALL_GAP с */
const small = kind => (C.SMALL || []).includes(kind);
const errN = () => { try { return A && A.errAsked ? +A.errAsked() || 0 : 0; } catch (e) { return 0; } };

export function init (api) { A = api; }
/** encounters.js: герои встреч { id, name, n — сколько встреч }, person(id) — человек героя, door(x, z) — у адреса есть подъезд для сцены */
export function provide (p) { Object.assign(PROV, p || {}); }

/* встречи в этой смене: первый район (не «весь город»), не первая смена новичка, не быстрый заезд */
function meetsHere (quick) {
  if (quick || !PROV.heroes.length || !DIST.has() || DIST.city() || DIST.cur() !== C.MEET.DIST) return false;
  return (+get('dlv-shifts', 0) || 0) >= C.MEET.FROM;
}
function loadMeets () {
  let v = get(C.MEET.KEY, null);
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
  return v && typeof v === 'object' ? v : { shift: 0, cur: [], prev: [], seen: {} };
}

/* начало смены (director.shiftStart) */
export function begin (ride) {
  const quick = !!(A && A.quick && A.quick());
  Object.assign(R, { on: !!(A && A.career) && !ride, t: 0, len: 0, n: 0, role: '', k: 0, f: 0, peak: false,
    last: -9, quietTo: 0, calmAt: -999, act: [], pend: '', beats: {}, total: 0, budget: C.BUDGET[0], used: [], log: [], plan: [],
    door: false, side: !!(A && A.S && A.S.side), err: errN() });
  if (!R.on) return;
  R.shift = (+get('dlv-shifts', 0) || 0) + 1;
  const m = loadMeets();
  R.prev = m.shift === R.shift ? (m.prev || []) : (m.cur || []);     // та же смена заново (перезапуск) — её «прошлая» остаётся
  R.meetMax = meetsHere(quick) ? C.MAX.meet : 0;
  R.lcHere = !quick && DIST.has() && !DIST.city() && DIST.cur() === C.MEET.DIST;   // жители Юга (locals.js) — с 1-й смены
  note('смена ' + R.shift + (R.meetMax ? ' · встречи у двери: до ' + R.meetMax + (R.prev.length ? ', не ' + R.prev.join(', ') : '') : ''));
}

/* ── план заказа (orders.js genSpec, когда заказ собирается): роль на дуге, напряжение, встреча ── */
export function slot (n, left) {
  if (!R.on) return null;
  if (R.pend) R.pend = '';                          // прошлый заказ кончился: несыгранная встреча / мини-игра так и не случилась
  if (!R.len && left > 0) {
    R.len = left;
    R.budget = left < 300 ? C.BUDGET[0] : left < 420 ? C.BUDGET[1] : C.BUDGET[2];
  }
  const f = R.len > 0 && left >= 0 ? clamp(1 - left / R.len) : 0;
  R.n = n + 1;
  let role = 'rise';
  if (n === 0) role = 'open';
  else if (left >= 0 && left < C.LAST_S) role = 'last';
  else if (!R.peak && n >= 2 && (f >= C.PEAK_AT || (left >= 0 && left < C.LAST_S + C.PEAK_LEFT * avgOrder(left, n)))) { role = 'peak'; R.peak = true; }
  const k = role === 'open' || role === 'last' ? 0 : role === 'peak' ? 1 : Math.min(1, f / C.RAMP);
  R.role = role; R.k = k; R.f = f;
  R.face = false;
  return { n: R.n, role, k, f, meet: null };
}

/* средний заказ этой смены, с (сколько прошло смены / сколько заказов было); в начале — 55 с */
const avgOrder = (left, n) => (n > 0 && R.len > left ? (R.len - left) / n : 55);

/* герой встречи: не тот, что уже был в этой смене или в прошлой; встреча героя — по кругу (сохранение seen) */
function pickHero () {
  const ban = new Set(R.used.concat(R.prev));
  let list = PROV.heroes.filter(h => !ban.has(h.id));
  if (!list.length) list = PROV.heroes.filter(h => !R.used.includes(h.id));
  if (!list.length) return null;
  const h = list[Math.floor(Math.random() * list.length)];
  const seen = loadMeets().seen || {};
  const i = (+seen[h.id] || 0) % Math.max(1, h.n || 1);
  let person = null;
  try { person = PROV.person ? PROV.person(h.id) : null; } catch (e) { person = null; }
  return { id: h.id, i, name: h.name, person };
}
function saveMeets () {
  const m = loadMeets();
  if (m.shift !== R.shift) { m.prev = m.cur || []; m.shift = R.shift; }
  m.cur = R.used.slice();
  set(C.MEET.KEY, m);
}
/** orders.js: у встречи нет подъезда — заказ обычный, встреча не в счёт */
export function meetFailed () {
  if (R.pend !== 'meet' && R.pend !== 'face') return;
  const kind = R.pend === 'face' ? 'errand' : 'meet';
  R.pend = '';
  R.beats[kind] = Math.max(0, (R.beats[kind] || 0) - 1); if (!small(kind)) R.total = Math.max(0, R.total - 1);
  R.last = R.lastWas;
  if (R.face) { R.face = false; return; }
  R.used.pop(); saveMeets();
  note('встречу не поставили: нет подъезда');
}
/** у адреса — подъезд, где можно сыграть встречу (encounters.js spotNear) */
export const doorOk = (x, z) => { try { return !PROV.door || !!PROV.door(x, z); } catch (e) { return false; } };

const ROLE = { open: 'начало', rise: 'подъём', peak: 'кульминация', last: 'последний' };
const KIND = { solo: 'один человек', group: 'компания', bundle: 'сборный', urgent: 'срочный' };
/** orders.js finishSpec: заказ собран — в журнал смены (дальность по дорогам, вид, встреча) */
export function ordered (sp) {
  if (!R.on || !sp) return;
  const m = (sp.m || []).reduce((a, b) => a + b, 0);
  const kind = sp.urgent ? 'срочный' : sp.edge ? 'в конец района' : sp.bundle ? 'сборный ×' + sp.stops.length : sp.fest ? 'фестиваль' : sp.beach ? 'пляж' : KIND[sp.kind] || sp.kind;
  const st = sp.stops && sp.stops[0];
  const rim = st && typeof DIST.rim === 'function' && DIST.has() ? +DIST.rim(st.x, st.z).toFixed(2) : 0;   // окраина района (districts.js)
  const e = { n: sp.n, t: Math.round(R.t), role: R.role, k: +R.k.toFixed(2), kind, m, rim, meet: sp.meet ? sp.meet.id : '', face: sp.face || (sp.meet && sp.meet.face) ? (sp.face || sp.meet).what : '' };
  R.plan.push(e);
  note('заказ ' + sp.n + ' · ' + (ROLE[R.role] || R.role) + (R.role === 'rise' ? ' ' + e.k : '') + ' · ' + kind + ' · ' + m + ' м' +
    (rim > 0 ? ' · окраина ' + rim : '') + (sp.meet ? ' · встреча: ' + sp.meet.name : '') +
    ((sp.meet || sp.face) && (sp.meet || sp.face).face ? ' · знакомое лицо ' + (sp.meet || sp.face).what : ''));
}

/* событие случилось на этом заказе (в счёт бюджета) */
function register (kind) {
  R.lastWas = R.last;
  R.last = R.n;
  R.beats[kind] = (R.beats[kind] || 0) + 1;
  if (!small(kind)) R.total++;                    // мини-игра и поручение бюджет смены не тратят
}
/* событие идёт (машина встала, сценка на улице, едешь по поручению) */
function begin2 (kind, name) {
  if (R.pend === kind) R.pend = '';
  else if (R.last !== R.n || kind === 'scene') register(kind);
  R.act.push(kind);
  note(name || kind);
}
/* событие кончилось — окно «просто покататься» */
function end2 (kind) {
  const i = R.act.indexOf(kind);
  if (i < 0) return;
  R.act.splice(i, 1);
  if (R.act.length) return;
  const w = rand(C.QUIET[0], C.QUIET[1]);
  R.quietTo = Math.max(R.quietTo, R.t + w);
  R.calmAt = R.t;
  note('окно «покататься» ' + Math.round(w) + ' с (до ' + mmss(R.quietTo) + ')');
}

/* почему событие kind сейчас нельзя ('' — можно). kind: meet | mini | errand | scene | light */
export function why (kind) {
  if (!R.on) return '';
  if (R.role === '' || R.role === 'open') return 'ритм: первый заказ — без событий';
  // малые (мини-игра, поручение) ждут окно не дольше SMALL_GAP с после конца события
  const calm = small(kind) ? Math.min(R.quietTo, R.calmAt + (C.SMALL_GAP || 0)) : R.quietTo;
  if (R.t < calm - (kind === 'meet' || kind === 'mini' ? C.AHEAD : 0)) return 'ритм: окно «покататься» ещё ' + Math.ceil(calm - R.t) + ' с';
  if (kind === 'light') return '';
  if (R.role === 'last') return 'ритм: последний заказ — лёгкий';
  if (R.act.length) return 'ритм: идёт ' + R.act.join(', ');
  if (R.last === R.n) return 'ритм: на этом заказе событие уже было';
  if (kind === 'meet' && R.n - R.last < 2) return 'ритм: событие было на прошлом заказе';
  if (!small(kind) && R.total >= R.budget) return 'ритм: события смены кончились (' + R.budget + ')';
  if ((R.beats[kind] || 0) >= (C.MAX[kind] || 1)) return 'ритм: ' + kind + ' за смену уже ' + R.beats[kind];
  if (kind === 'scene' && R.k < C.SCENE_K) return 'ритм: рано для сценки (' + R.k.toFixed(2) + ')';
  return '';
}
/** окно «покататься»: Толик молчит, кроме штрафов (game.js) */
export const quiet = () => R.on && R.t < R.quietTo;

/** director.start / end: средние и крупные события — уличная сценка */
export function started (kind) { if (R.on) begin2('scene', 'сценка: ' + kind); }
export function ended (kind) { if (R.on && R.act.includes('scene')) { note('сценка кончилась: ' + kind); end2('scene'); } }
/** director.start лёгкого — только в журнал */
export function light (kind) { if (R.on) note('лёгкое: ' + kind); }
/** game.js: мини-игра помечена у этого заказа (doorstep.js plan) */
export function planned (kind) { if (R.on && kind) { register('mini'); R.pend = 'mini'; note('мини-игра помечена: ' + kind); } }
/** encounters.js: встреча-катсцена началась / кончилась */
export function meetOn (id) {
  if (!R.on) return;
  const m = loadMeets(); m.seen = m.seen || {}; m.seen[id] = (+m.seen[id] || 0) + 1; set(C.MEET.KEY, m);
  begin2('meet', 'встреча у двери: ' + id);
}
export function meetOff (res) { if (R.on) { if (res) note('встреча: ' + res); end2('meet'); } }
/** locals.js: окно разговора жителя у двери открылось / закрылось (как встреча: после — окно «покататься») */
export function faceOn (name) { if (R.on) begin2('meet', 'житель у двери: ' + name); }
export function faceOff (res) { if (R.on) { if (res) note('житель: ' + res); end2('meet'); } }

/* каждый кадр (director.step): часы смены (только пока смена идёт), мини-игры и поручения — по переменам */
export function step (dt, live) {
  if (!R.on || !A) return;
  if (live) R.t += dt;
  const dOn = !!(A.doorOn && A.doorOn());
  if (dOn !== R.door) { R.door = dOn; if (dOn) begin2('mini', 'мини-игра у клиента'); else end2('mini'); }
  const e = errN();
  if (e > R.err) { R.err = e; if (R.last !== R.n) register('errand'); note('поручение: клиент попросил'); }
  const side = !!(A.S && A.S.side);
  if (side !== R.side) {
    R.side = side;
    if (side) { R.act.push('errand'); note('поручение: поехал'); } else { note('поручение кончилось'); end2('errand'); }
  }
}

export const DEBUG = {
  C, R, PROV,
  get state () {
    return { on: R.on, t: Math.round(R.t), len: Math.round(R.len), n: R.n, role: R.role, k: +R.k.toFixed(2), f: +R.f.toFixed(2),
      quiet: Math.max(0, Math.ceil(R.quietTo - R.t)), act: R.act.slice(), beats: { ...R.beats }, total: R.total, budget: R.budget,
      meetMax: R.meetMax, used: R.used.slice(), prev: R.prev.slice(), face: R.face };
  },
  get log () { return R.log; },
  get plan () { return R.plan; },
  why: k => why(k),
};
