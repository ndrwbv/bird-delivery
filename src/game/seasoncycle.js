/* ──────────────────────────────────────────────────────────────────────────
   Смена сезонов по кругу (автор 17.10.2026: «Смену сезонов надо делать, но начинать надо с зимы и менять. Сделай
   такую систему, чтобы игроку было всегда интересно, что будет дальше»). Правила словами и цифрами — docs/CAREER.md
   «Сезоны».

   Год карьеры — 16 смен: зима (3; в первый год — 4) → оттепель (переход) → весна (3) → лето (4) → листопад (переход)
   → осень (3) → первый снег (переход) → зима… Новая игра и старые сохранения без отметки dlv-cycle — с первой смены
   зимы. Место в году — от числа законченных смен (dlv-shifts − base), поэтому прерванная смена год не сдвигает.

   Сюрприз (CYC.SURPRISE): на стыке сезонов прогноз Толика иногда врёт — вставляется одна смена «не по прогнозу»:
     зима → весна: «зима не сдаётся» (снежная зима вместо оттепели);   весна → лето: снег в мае;
     лето → осень: опять жара;   осень → зима: бабье лето (золотая осень вместо первого снега).
   Решается жребием от зерна сохранения (seed), в первый год на первом стыке — никогда (сначала прогноз сбывается).

   Праздник сезона — по плану: Новый год — во вторую смену зимы (в первый год — в четвёртую, после 3 смен новичка),
   Хэллоуин — в последнюю смену осени. holidays.js спрашивает holiday().

   Что дразнит:
     • чек смены — календарик (receipt): «до весны — 2 смены», что придёт («весна: ручьи и лужи, сирень, первые
       шашлыки»), клетки следующих смен по цвету сезона, звезда на празднике, «до Нового года — 3 смены»;
     • Толик за смену до стыка — прогноз (CYC.FORECAST_AT с после начала);
     • первая смена сезона / перехода / сюрприза — объявление Толика (CYC.SAY_AT с), в первой смене сезона —
       сезонный заказ (perk): часть пицц — сезонные, оплата × CYC.PERK.k.

   Из weather.js: shiftStart(done) — шаг этой смены карьеры ({ key, sea, v, wx, … }), clear() — смена не карьеры.
   Из holidays.js: holiday() — id праздника этой смены, '' — без, undefined — круг сейчас не решает.
   Из orders.js: perk() — пометка сезонного заказа или null. Из career.js: receipt() — календарик в чек.
   Из game.js: init(api), announce() — после праздника.  api: Store, chat(text), playing(), ADULT
   Отладка: __dlv.CYCLE — at(pos), plan(n), sim(n), info(), receipt(), CUR.
   ────────────────────────────────────────────────────────────────────────── */
import { t, tn, N_ } from '../i18n/index.js';
import './seasoncycle.css';

export const CYC = {
  ON: true,               // false — как до 17.10: сезон каждой смены — weather.js SEASON_W (сейчас там зима 100 %)
  KEY: 'dlv-cycle',       // { base: законченных смен на момент первой смены круга, seed: зерно сюрпризов }
  LEN: { winter: 3, spring: 3, summer: 4, autumn: 3 },    // смен в сезоне
  LEN0: { winter: 4 },    // первый год: зима на смену длиннее — Новый год встаёт после 3 смен новичка
  NY_AT: 1, NY_AT0: 3,    // Новый год — какая по счёту смена зимы (с нуля); в первый год — 3 (четвёртая)
  SURPRISE: 0.2,          // шанс сюрприза на стыке (4 стыка в год — в среднем 0,8 сюрприза в год)
  PERK: { share: 0.35, k: 1.15 },   // первая смена сезона: доля сезонных пицц и множитель оплаты
  SAY_AT: 6,              // с — объявление Толика в начале смены (праздник говорит в 2,5 с)
  FORECAST_AT: [45, 75],  // с — прогноз Толика за смену до стыка
  CAL: 8,                 // клеток календарика в чеке
  HOL_SOON: 7,            // «до Нового года — N смен» — когда праздник в пределах стольких смен
};

/* сезоны: что придёт (в чеке), имя, «до …» (родительный, плюралы), сезонный заказ, объявление в первой смене */
const SEA = {
  winter: {
    name: N_('зима'), what: N_('горки, хоккей во дворах, снеговики и Новый год'),
    until: N_('до зимы — {n} смена|до зимы — {n} смены|до зимы — {n} смен'),
    perk: { item: N_('пицца «Горячая ватрушка»'), why: N_('зимний заказ: хоккеистам с коробки — горячее · оплата ×{k}') },
    hello: N_('зима пришла! горки залили, во дворах хоккей и снеговики. сегодня все берут «Горячую ватрушку» — платят лучше'),
  },
  spring: {
    name: N_('весна'), what: N_('ручьи и лужи, сирень, первые шашлыки'),
    until: N_('до весны — {n} смена|до весны — {n} смены|до весны — {n} смен'),
    perk: { item: N_('пицца «Грачи прилетели»'), why: N_('весенний заказ: к первому шашлыку · оплата ×{k}') },
    hello: N_('весна! почки, лужи, во дворах первые шашлыки. сегодня берут «Грачи прилетели» — платят лучше'),
  },
  summer: {
    name: N_('лето'), what: N_('пляж, теннис на кортах, шашлыки и домино'),
    until: N_('до лета — {n} смена|до лета — {n} смены|до лета — {n} смен'),
    perk: { item: N_('пицца «Окрошка»'), why: N_('летний заказ: на пляж и к домино · оплата ×{k}') },
    hello: N_('лето! пляж открыли, на кортах теннис, во дворах шашлык и домино. сегодня берут «Окрошку» — платят лучше'),
  },
  autumn: {
    name: N_('осень'), what: N_('листопад, золотая осень и Хэллоуин'),
    until: N_('до осени — {n} смена|до осени — {n} смены|до осени — {n} смен'),
    perk: { item: N_('пицца «Лукошко» с грибами'), why: N_('осенний заказ: грибники вернулись с добычей · оплата ×{k}') },
    hello: N_('осень. грибники вернулись из леса и заказывают «Лукошко» с грибами — платят лучше. лужи объезжай'),
  },
};
const ORDER = ['winter', 'spring', 'summer', 'autumn'];

/* шаги года. sea — сезон (шансы погоды weather.js CHANCES, цвет клетки); v — где в seasons.js (0—1 лето, 1—2 осень,
   2—3 зима, 3—4 весна; у сезона — от и до, смены идут по порядку); wx — своя погода шага (иначе — шансы сезона);
   to — переход: в какой сезон; name — как зовём (переход, сюрприз) */
const STEP = {
  winter: { sea: 'winter', v: [2.22, 2.8], cast: N_('завтра зима всерьёз: сугробы, горки, хоккей во дворах') },
  thaw: { sea: 'spring', v: [2.99, 3.05], from: 'winter', to: 'spring', wx: { thaw: 100 }, name: N_('оттепель'),
    hint: N_('снег тает, во дворах лужи и ручьи'),
    hello: N_('оттепель! снег тает, во дворах лужи и ручьи по колено. машину помоешь потом'),
    cast: N_('синоптики обещают оттепель: снег поплывёт, во дворах ручьи. готовь резину') },
  spring: { sea: 'spring', v: [3.18, 3.72], cast: N_('завтра весна по-настоящему: листья, сирень, первые шашлыки во дворах') },
  summer: { sea: 'summer', v: [0.12, 0.82], cast: N_('по радио обещают лето: тепло, пляж открывают. шорты достал?') },
  leaffall: { sea: 'autumn', v: [1.18, 1.3], from: 'summer', to: 'autumn', wx: { golden: 45, clear: 40, rain: 15 }, name: N_('листопад'),
    hint: N_('кроны желтеют, на асфальте листья'),
    hello: N_('листопад пошёл: кроны жёлтые, дворники метут, а листья всё летят'),
    cast: N_('синоптики говорят, лето всё: завтра похолодание и листопад') },
  autumn: { sea: 'autumn', v: [1.42, 1.88], cast: N_('завтра осень всерьёз: куртки, лужи, голые деревья') },
  firstsnow: { sea: 'winter', v: [2.02, 2.06], from: 'autumn', to: 'winter', wx: { firstsnow: 100 }, name: N_('первый снег'),
    hint: N_('всё белое, тормози заранее'),
    hello: N_('первый снег! всё белое, народ в шоке, как будто первый раз. тормози заранее — скользко'),
    cast: N_('обещают первый снег. летнюю резину — на балкон, если что') },
  // сюрпризы: прогноз был на следующий шаг, а пришло это (одна смена)
  frost: { sea: 'winter', v: [2.74, 2.8], wx: { snowy: 100 }, surprise: true, name: N_('зима не сдаётся'),
    hello: N_('синоптики соврали: обещали оттепель — а намело по колено. зима не сдаётся, ещё смена') },
  maysnow: { sea: 'spring', v: [3.6, 3.7], wx: { maysnow: 100 }, surprise: true, name: N_('снег в мае'),
    hello: N_('ну синоптики… обещали лето — выпал снег. в мае! сирень в снегу, народ опять в пуховиках') },
  hotagain: { sea: 'summer', v: [0.8, 0.86], wx: { heat: 100 }, surprise: true, name: N_('опять жара'),
    hello: N_('обещали похолодание — а там +33. лето не отпускает, ещё смена жары') },
  indian: { sea: 'autumn', v: [1.4, 1.5], wx: { golden: 100 }, surprise: true, name: N_('бабье лето'),
    hello: N_('обещали первый снег — а тут бабье лето: тепло, всё золотое. наслаждайся, пока дают') },
};
/* стыки: после какого сезона, какой сюрприз может встать перед следующим шагом */
const SEAMS = [{ after: 'winter', surprise: 'frost' }, { after: 'spring', surprise: 'maysnow' }, { after: 'summer', surprise: 'hotagain' }, { after: 'autumn', surprise: 'indian' }];
/* праздник: прогноз накануне */
const HOL_CAST = {
  newyear: N_('завтра 31-е! готовь багажник под мандарины'),
  halloween: N_('завтра Хэллоуин: по городу тыквы и привидения. не пугайся — это клиенты'),
};
const HOL_NAME = { newyear: N_('Новый год'), halloween: N_('Хэллоуин') };
const HOL_UNTIL = {
  newyear: N_('до Нового года — {n} смена|до Нового года — {n} смены|до Нового года — {n} смен'),
  halloween: N_('до Хэллоуина — {n} смена|до Хэллоуина — {n} смены|до Хэллоуина — {n} смен'),
};

let A = null;
let CUR = null;                          // шаг идущей смены карьеры (или null)
const YEARS = new Map();                 // seed:год → шаги года

function h01 (a, b) {
  let h = Math.imul((a | 0) ^ 0x5bd1e995, 0x9E3779B1) ^ Math.imul((b | 0) + 0x27d4eb2d, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* шаги года y: [{ key, sea, v, wx, trans, surprise, first, idx, len, hol, y }] */
function year (seed, y) {
  const k = seed + ':' + y;
  if (YEARS.has(k)) return YEARS.get(k);
  const out = [];
  const main = (sea, len, hol) => {
    const S = STEP[sea];
    for (let i = 0; i < len; i++) {
      const f = (i + 0.5) / len, j = (h01(seed, y * 97 + out.length) - 0.5) * 0.08;
      out.push({ key: sea, sea, v: S.v[0] + (S.v[1] - S.v[0]) * Math.min(1, Math.max(0, f + j)), idx: i, len, first: i === 0, hol: hol && hol[0] === i ? hol[1] : '', y });
    }
  };
  const one = (key, b) => {
    const S = STEP[key];
    out.push({ key, sea: S.sea, v: S.v[0] + (S.v[1] - S.v[0]) * h01(seed, y * 131 + b), wx: S.wx || null, trans: S.to || '', surprise: !!S.surprise, idx: 0, len: 1, first: false, hol: '', y });
  };
  const seam = b => { if (!(y === 0 && b === 0) && h01(seed ^ 0x51ce, y * 7 + b) < CYC.SURPRISE) one(SEAMS[b].surprise, b + 10); };
  const L = { ...CYC.LEN, ...(y === 0 ? CYC.LEN0 : {}) };
  main('winter', L.winter, [Math.min(L.winter - 1, y === 0 ? CYC.NY_AT0 : CYC.NY_AT), 'newyear']);
  seam(0); one('thaw', 0);
  main('spring', L.spring);
  seam(1);
  main('summer', L.summer);
  seam(2); one('leaffall', 2);
  main('autumn', L.autumn, [L.autumn - 1, 'halloween']);
  seam(3); one('firstsnow', 3);
  YEARS.set(k, out);
  return out;
}
/* шаг по месту в круге (pos — смен круга до этой) */
export function at (pos, seed = 1) {
  let y = 0, p = Math.max(0, pos | 0);
  for (;;) {
    const Y = year(seed, y);
    if (p < Y.length) return { ...Y[p], pos };
    p -= Y.length; y++;
    if (y > 500) return { ...Y[Y.length - 1], pos };
  }
}
/* что игрок ждёт с pos: n шагов по плану — сюрпризы (с pos и дальше) не видны */
export function planned (pos, seed = 1, n = CYC.CAL) {
  const out = [];
  for (let p = pos; out.length < n && p < pos + n * 3; p++) { const s = at(p, seed); if (!s.surprise) out.push(s); }
  return out;
}

/* ─────────────── сохранение ─────────────── */
function load () {
  if (!A) return null;
  try {
    const v = A.Store.get(CYC.KEY, null);
    const o = typeof v === 'string' ? JSON.parse(v) : v;
    if (o && typeof o === 'object' && Number.isFinite(+o.base)) return { base: +o.base, seed: (+o.seed | 0) || 1 };
  } catch (e) { /* испорчено — заново */ }
  return null;
}
/* отметка круга: нет — заводим сейчас (новая игра и старые сохранения — с первой смены зимы) */
function cycle (done) {
  let c = load();
  if (!c) {
    c = { base: Math.max(0, done | 0), seed: 1 + Math.floor(Math.random() * 2147483000) };
    try { A.Store.set(CYC.KEY, JSON.stringify(c)); } catch (e) { /* без сохранения — не страшно */ }
  }
  return c;
}
const doneNow = () => (A ? +A.Store.get('dlv-shifts', 0) || 0 : 0);

export function init (api) {
  A = api;
  setTimeout(() => { if (window.__dlv) window.__dlv.CYCLE = DEBUG; }, 0);
}

/* ─────────────── смена ─────────────── */
/** смена карьеры началась (weather.js): done — законченных смен → шаг этой смены */
export function shiftStart (done = doneNow()) {
  CUR = null;
  if (!CYC.ON || !A) return null;
  const c = cycle(done), pos = Math.max(0, done - c.base);
  const st = at(pos, c.seed), prev = pos > 0 ? at(pos - 1, c.seed) : null;
  st.afterSurprise = !!(prev && prev.surprise);
  st.next = planned(pos + 1, c.seed, 1)[0] || null;       // что Толик пообещает накануне (сюрприз он не знает)
  st.seed = c.seed; st.done = done;
  CUR = st;
  return st;
}
/** смена не карьеры («покататься», быстрый заезд, ?season=) — круг молчит */
export function clear () { CUR = null; }
export const current = () => CUR;

/** праздник этой смены по плану: id, '' — без праздника, undefined — решает старый жребий holidays.js */
export function holiday () {
  if (!CUR) return undefined;
  return CUR.hol || '';
}

/** сезонный заказ (orders.js): в первую смену сезона часть пицц — сезонные. → пометка как у праздника или null */
export function perk () {
  if (!CUR || !CUR.first || CUR.surprise || (CUR.y === 0 && CUR.sea === 'winter')) return null;
  const S = SEA[CUR.sea];
  if (!S || Math.random() >= CYC.PERK.share) return null;
  return { kind: 'season', k: CYC.PERK.k, item: t(S.perk.item), why: S.perk.why, label: N_('сезонный заказ'), name: S.name };
}

/* ─────────────── Толик: объявление и прогноз ─────────────── */
function later (token, sec, fn) {
  const go = () => {
    if (CUR !== token || !A) return;
    if (A.playing && !A.playing()) { setTimeout(go, 3000); return; }   // пауза, диалог, меню — подождать
    fn();
  };
  setTimeout(go, sec * 1000);
}
const say = s => { if (A && A.chat && s) A.chat(s); };
/** что Толик скажет в начале этой смены ('' — ничего) */
export function hello (st = CUR) {
  if (!st || st.done < 1) return '';                     // первая смена новичка — своё обучение
  const S = STEP[st.key];
  if (st.surprise) return t(S.hello);
  if (st.trans) return (st.afterSurprise ? t('вот теперь точно: ') : '') + t(S.hello);
  if (st.first && SEA[st.sea]) return (st.afterSurprise ? t('вот теперь точно: ') : '') + t(SEA[st.sea].hello);
  return '';
}
/** прогноз накануне ('' — завтра то же самое) */
export function forecast (st = CUR) {
  if (!st || !st.next) return '';
  const n = st.next;
  if (n.hol && HOL_CAST[n.hol]) return t(HOL_CAST[n.hol]);
  if (n.trans || (n.first && n.key !== st.key)) return STEP[n.key] && STEP[n.key].cast ? (st.surprise ? t('теперь синоптики клянутся: ') : '') + t(STEP[n.key].cast) : '';
  return '';
}
/** из game.js после праздника: объявление и прогноз в чат */
export function announce () {
  const st = CUR;
  if (!st) return;
  const h = hello(st), f = forecast(st);
  if (h) later(st, CYC.SAY_AT, () => say(h));
  if (f) later(st, CYC.FORECAST_AT[0] + Math.random() * (CYC.FORECAST_AT[1] - CYC.FORECAST_AT[0]), () => say(f));
}

/* ─────────────── чек смены: календарик ─────────────── */
const nameOf = s => (s.trans || s.surprise ? t(STEP[s.key].name) : t(SEA[s.sea].name));
/** календарик в чек (career.js) — после того как смена засчитана (dlv-shifts уже +1). → { text, sub, hol, cells } или null */
export function receipt (done = doneNow()) {
  if (!CYC.ON || !A) return null;
  const c = load();
  if (!c) return null;
  const P = planned(Math.max(0, done - c.base), c.seed, CYC.CAL);
  if (!P.length) return null;
  const p0 = P[0];
  let text = '', sub = '';
  if (p0.trans) {
    text = t('следующая смена — {name}!', { name: t(STEP[p0.key].name) });
    sub = t(STEP[p0.key].hint) + ' · ' + t('потом {season}: {what}', { season: t(SEA[p0.trans].name), what: t(SEA[p0.trans].what) });
  } else if (p0.first) {
    text = t('следующая смена — {name}!', { name: t(SEA[p0.sea].name) });
    sub = t('{season}: {what}', { season: t(SEA[p0.sea].name), what: t(SEA[p0.sea].what) });
  } else {
    let j = 1;
    while (j < P.length && P[j].sea === p0.sea && !P[j].trans) j++;
    const nx = P[j] || null, to = nx ? nx.trans || nx.sea : ORDER[(ORDER.indexOf(p0.sea) + 1) % 4];
    text = tn(j, SEA[to].until, { n: j });
    sub = t('{season}: {what}', { season: t(SEA[to].name), what: t(SEA[to].what) });
  }
  let hol = null;
  for (let k = 0; k < Math.min(P.length, CYC.HOL_SOON); k++) {
    if (!P[k].hol || !HOL_NAME[P[k].hol]) continue;
    hol = { text: k === 0 ? t('следующая смена — {name}!', { name: t(HOL_NAME[P[k].hol]) }) : tn(k, HOL_UNTIL[P[k].hol], { n: k }), id: P[k].hol };
    break;
  }
  const cells = P.map((s, i) => ({ sea: (s.trans && STEP[s.key].from) || s.sea, to: s.trans || '', hol: s.hol || '', next: i === 0, name: nameOf(s) }));
  return { text, sub, hol, cells };
}

/* ═════════════════════ отладка: __dlv.CYCLE ═════════════════════ */
const short = s => s.key + (s.hol ? '+' + s.hol : '') + (s.first ? '*' : '');
export const DEBUG = {
  CYC, STEP, SEA, at, planned, year, hello, forecast, receipt,
  get CUR () { return CUR; },
  get save () { return load(); },
  /* n смен с новой игры при зерне seed: ключи шагов (* — первая смена сезона, +праздник) */
  plan: (n = 16, seed = (load() || { seed: 1 }).seed) => Array.from({ length: n }, (_, i) => short(at(i, seed))),
  /* на N случайных зёрен: сколько сюрпризов в год, длина года, праздников в год */
  sim: (N = 500) => {
    let sur = 0, len = 0, hol = 0;
    for (let i = 0; i < N; i++) { const Y = year(1000 + i * 7919, 1); len += Y.length; sur += Y.filter(s => s.surprise).length; hol += Y.filter(s => s.hol).length; }
    return { years: N, len: +(len / N).toFixed(2), surprises: +(sur / N).toFixed(2), holidays: +(hol / N).toFixed(2) };
  },
  info: () => ({ cur: CUR ? short(CUR) : null, save: load(), done: doneNow(), receipt: receipt() }),
};
