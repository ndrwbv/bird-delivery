/* ──────────────────────────────────────────────────────────────────────────
   Герои города, этап 2 — механики (docs/ORDERS.md «Герои города», числа — econ.js HEROQ).
   Подменяет реплики встречи героев (heroes.js setLineHook) и вмешивается в «депнуть»
   (career.js spin). Работает только в карьере: init зовёт career.js.

   Совет Лёхи Арбуза (только взрослая — «депнуть» есть только там): первая встреча с ним за
     смену — совет на ставку после этой смены (игра — depGame(): автомат «крути», рулетка —
     цвет, теннис — игрок; в теннисе Лёха верит Игорьку на слово). Совет счастливый с шансом
     LEHA.GOOD: шанс выиграть +UP, иначе −DOWN (MIN…MAX). Пошёл против совета — шанс обычный.
     Совет — на первую прокрутку после смены; после исхода — строка «Лёха был прав!» /
     «Лёха опять слил» с цифрой удачи.
   «Наоборот» Игорька: на каждый матч у него прогноз — «всех порву» или «проиграю» (50/50,
     хранится до матча). Матч: Игорёк побеждает с шансом FLIP, если сказал «проиграю», и
     1 − FLIP, если «всех порву»; остальное поровну Андрюше и Настюше. Прогноз — при первой
     встрече за смену, дальше с шансом IGOR.TALK. Слышал прогноз — после матча строка «как
     всегда, наоборот».
   Жека про машину: первая встреча за смену — всегда, дальше с шансом ZHEKA.TALK. Китайская
     (HEROQ.CHINA) — ругает, жёлтая (покраска или заводской) — ругает цвет, и то и другое —
     отдельные реплики, отечественная/старая (HEROQ.HOME) — хвалит, остальные — «ну, ездит».
   Стёпа: с шансом STEPA.SAW на встречу хочет распилить твою машину болгаркой (по имени).

   init({ A, cars, depGame, shiftN, shiftOn }) — career.js
   tipFor(game) → { text, pick } | null — совет Лёхи для окна «депнуть»
   roll({ game, pick, base, first }) → { win, chance, champ, tip, claim } — исход ставки
   verdict(r) → [строки] — что сказать после исхода
   отладка: __dlv.HEROQ
   ────────────────────────────────────────────────────────────────────────── */
import { t, N_ } from '../i18n/index.js';
import * as HEROES from './heroes.js';
import { HEROQ } from './econ.js';

const KEY = 'dlv-heroq';               // сохранение: прогноз Игорька на ближайший матч { claim, heard }
const TENNIS = ['andr', 'igor', 'nast'];
const WHO_ACC = { andr: N_('на Андрюшу'), igor: N_('на Игорька'), nast: N_('на Настюшу') };
const WHO = { andr: N_('Андрюша'), igor: N_('Игорёк'), nast: N_('Настюша') };

/* ── реплики ── */
const LEHA_TIP = {
  slot: [
    N_('Слушай сюда: сегодня автомат даст. Чую. Крути.'),
    N_('Однорукий сегодня добрый, отвечаю. После смены — крути.'),
    N_('Я вчера весь автомат прогрел. Сегодня он твой. Крути.'),
  ],
  red: [N_('После смены ставь на красное. Это не совет, это наука.'), N_('Красное. Я вчера ставил на чёрное — мимо. Значит, сегодня красное.')],
  black: [N_('После смены ставь на чёрное. Это не совет, это наука.'), N_('Чёрное. Я вчера ставил на красное — мимо. Значит, сегодня чёрное.')],
  igorWin: [N_('Игорёк сказал — всех порвёт. Ставь на Игорька, это верняк.'), N_('Игорёк в форме, сам сказал. Ставь на него, я уже поставил.')],
  igorLose: [N_('Игорёк сказал, что проиграет. Значит, ставь {who}. Верняк.'), N_('Раз Игорёк сам говорит «проиграю» — ставь {who}. Логика!')],
};
const LEHA_REMIND = [N_('Не забудь: {tip}. Я чую.'), N_('Помнишь? {tip}. Отвечаю.'), N_('Я тебе говорил: {tip}. Не подведи.')];
const TIP_SHORT = { slot: N_('крути автомат'), red: N_('на красное'), black: N_('на чёрное') };
const LEHA_VERDICT = {
  goodWin: N_('Лёха был прав! Его совет принёс удачу ({k}).'),
  goodLose: N_('Лёха был прав, совет был счастливый ({k}) — но даже он не вытянул.'),
  badLose: N_('Лёха опять слил. Его совет сглазил ставку ({k}).'),
  badWin: N_('Лёха опять слил — совет сглазил ({k}), а ты выиграл ему назло.'),
  skipGood: N_('Лёху не послушал — а совет был счастливый.'),
  skipBad: N_('Лёху не послушал — и правильно: совет был гнилой.'),
};
const IGOR_SAY = {
  lose: [
    N_('Всё, я проиграю. Точно проиграю. Сто процентов.'),
    N_('На матче мне конец. Даже не смотри.'),
    N_('Ракетка кривая, нога болит, принтер сломался. Проиграю.'),
    N_('Не ставь на меня. Я серьёзно. Проиграю.'),
  ],
  win: [
    N_('Матч — мой. Кубок я уже напечатал.'),
    N_('Я на пике. Андрюша с Настюшей могут не приходить.'),
    N_('Ставь на меня. На этот раз точно.'),
  ],
  winAdult: [N_('Ща всех разъебу. Вот увидишь.'), N_('На матче всех порву нахуй. Ставь на меня.')],
  winKids: [N_('Ща всех обыграю. Вот увидишь.'), N_('На матче всех порву. Ставь на меня.')],
};
const IGOR_VERDICT = {
  lose: N_('Игорёк говорил «проиграю» — и выиграл. Как всегда, наоборот.'),
  win: N_('Игорёк обещал всех порвать — и проиграл. Как всегда, наоборот.'),
  winAdult: N_('Игорёк обещал всех разъебать — и слил. Как всегда, наоборот.'),
  same: N_('Игорёк впервые в жизни сказал правду.'),
};
const ZHEKA = {
  china: [
    N_('{car}? Это не машина, это телефон на колёсах. Китайский.'),
    N_('{car} — пластик и обещания. Как наша премия.'),
    N_('Китайская? {car}? Через год развалится. Через два — точно.'),
    N_('Машина у тебя — {car}. Батя увидел — перекрестился.'),
    N_('{car}… Ты бы ещё самокат с алиэкспресса взял.'),
  ],
  chinaAdult: [N_('{car}? Бля, ну ты даёшь. Китайская же.'), N_('{car} — это не тачка, это хуйня с маркетплейса.')],
  yellow: [
    N_('{car} — норм. Но жёлтая? Ты такси или цыплёнок?'),
    N_('Покрасил в жёлтый? Батя бы не одобрил. Батя и не одобряет.'),
    N_('Жёлтый — цвет одуванчиков и китайских машин. Перекрась.'),
    N_('{car} хорошая. Была. До жёлтой краски.'),
    N_('Издалека увидел: жёлтое едет. Думал, такси. А это ты.'),
  ],
  yellowAdult: [N_('Жёлтая? Ну ёб твою мать. Перекрась, пока батя не увидел.')],
  both: [
    N_('{car}, да ещё жёлтая. Два греха в одной машине.'),
    N_('Китайская и жёлтая. {car} — это прям всё, что я не люблю, сразу.'),
    N_('{car}, жёлтая. К гаражу не подъезжай — батя не переживёт.'),
    N_('Жёлтая китайская… Ты это нарочно, да?'),
  ],
  bothAdult: [N_('Китайская, да ещё жёлтая — бля, ты специально?')],
  home: [
    N_('{car}! Вот это машина. Батя одобряет.'),
    N_('{car} — наша, родная. Ключ на 13 — и поехала.'),
    N_('Машина у тебя — {car}. Уважаю. Китайцы так не умеют.'),
    N_('{car} — железо настоящее. Сто лет ещё проездишь.'),
    N_('Вот {car} — это машина. А не телефон на колёсах.'),
  ],
  homeAdult: [N_('{car}! Охуенная тачка. Без всякой китайщины.')],
  other: [
    N_('{car}? Ну… ездит. Не китайская — уже хорошо.'),
    N_('{car} — нормально. Но «Нивка» лучше. Всё лучше, если это «Нивка».'),
    N_('{car} — ни то ни сё. Зато не жёлтая.'),
    N_('Машина у тебя — {car}. Батя сказал: «сойдёт».'),
  ],
};
const STEPA_SAW = [
  N_('{car} — отличная машина. Была бы ещё лучше в двух частях.'),
  N_('Слушай, {car} — это ж два кабриолета. Болгарка с собой.'),
  N_('{car}? Вжух болгаркой — и пикап. Бесплатно, по-братски.'),
  N_('Машина у тебя — {car}. Можно я её чуть-чуть распилю? Чуть-чуть.'),
  N_('Вижу: {car}. Слышу: «распили меня». Ну раз она просит…'),
];
const STEPA_SAW_ADULT = [N_('{car}, бля, прям просится под болгарку. Я ж не виноват.')];

/* ── состояние ── */
let A = null, CARS = () => null, GAME_OF = () => 'slot', SHIFT_N = () => 0, SHIFT_ON = () => false;
const M = {
  tip: null,            // { n, game, pick, good, used, text }
  claim: null,          // { claim: 'win' | 'lose', heard }
  seen: {},             // id → номер смены, когда герой уже говорил про своё (первая встреча за смену)
  last: null,
  stats: { tips: 0, igor: 0, zheka: 0, stepa: 0, rolls: 0 },
};
const pick = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const adult = () => !!(A && A.ADULT);
function load () {
  try { const v = A.Store.get(KEY, null); if (v && (v.claim === 'win' || v.claim === 'lose')) M.claim = { claim: v.claim, heard: !!v.heard }; } catch (e) { /* — */ }
}
function save () { try { A.Store.set(KEY, M.claim); } catch (e) { /* — */ } }

/* ── Игорёк: прогноз на ближайший матч ── */
function claim () {
  if (!M.claim) { M.claim = { claim: Math.random() < 0.5 ? 'win' : 'lose', heard: false }; save(); }
  return M.claim;
}
/** шансы на победу в матче: { andr, igor, nast } (с учётом прогноза Игорька) */
export function tennisOdds () {
  const F = HEROQ.IGOR.FLIP, c = claim().claim;
  const ig = c === 'lose' ? F : 1 - F, rest = (1 - ig) / 2;
  return { andr: rest, igor: ig, nast: rest };
}
function igorLine () {
  const c = claim();
  c.heard = true; save();
  M.stats.igor++;
  if (c.claim === 'lose') return t(pick(IGOR_SAY.lose));
  return t(pick(IGOR_SAY.win.concat(adult() ? IGOR_SAY.winAdult : IGOR_SAY.winKids)));
}

/* ── Лёха: совет на ставку после этой смены ── */
function makeTip () {
  const game = GAME_OF(), good = Math.random() < HEROQ.LEHA.GOOD;
  let p = null, text;
  if (game === 'roulette') { p = Math.random() < 0.5 ? 'red' : 'black'; text = t(pick(LEHA_TIP[p])); }
  else if (game === 'tennis') {
    // Лёха верит Игорьку на слово: сказал «порву» — ставь на Игорька, «проиграю» — на другого
    if (claim().claim === 'win') { p = 'igor'; text = t(pick(LEHA_TIP.igorWin)); }
    else { p = Math.random() < 0.5 ? 'andr' : 'nast'; text = t(pick(LEHA_TIP.igorLose), { who: t(WHO_ACC[p]) }); }
  } else text = t(pick(LEHA_TIP.slot));
  M.tip = { n: SHIFT_N(), game, pick: p, good, used: false, text };
  M.stats.tips++;
  return text;
}
const tipShort = tp => t(tp.game === 'tennis' ? WHO_ACC[tp.pick] : TIP_SHORT[tp.pick || 'slot']);
const tipLive = () => (M.tip && M.tip.n === SHIFT_N() && !M.tip.used ? M.tip : null);
function lehaLine (first) {
  if (!adult() || !SHIFT_ON()) return null;
  const tp = tipLive();
  if (!tp || tp.game !== GAME_OF()) return makeTip();
  if (!first && Math.random() < HEROQ.LEHA.REPEAT) return t(pick(LEHA_REMIND), { tip: tipShort(tp) });
  return null;
}
/** совет Лёхи для окна «депнуть» этой игры: { text, pick } или null */
export function tipFor (game) {
  const tp = tipLive();
  if (!tp || tp.game !== game) return null;
  return { pick: tp.pick, text: t('Лёха Арбуз советует: {tip}', { tip: tipShort(tp) }) };
}

/* ── Жека и Стёпа: про твою машину ── */
function yellow (hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return false;
  const n = parseInt(m[1], 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 0.2 || mx !== r && mx !== g) return false;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? 60 * (((g - b) / d) % 6) : 60 * ((b - r) / d + 2);
  if (h < 0) h += 360;
  return h >= 40 && h <= 64 && s > 0.55 && l > 0.3 && l < 0.8;
}
function car () {
  try { const C = CARS(); const c = C && C.current && C.current(); return c && c.id ? c : null; } catch (e) { return null; }
}
/** что Жека думает о машине: 'china' | 'yellow' | 'both' | 'home' | 'other' */
export function carKind (c = car()) {
  if (!c) return null;
  const ch = HEROQ.CHINA.includes(c.id), y = yellow(c.hex);
  return ch && y ? 'both' : ch ? 'china' : y ? 'yellow' : HEROQ.HOME.includes(c.id) ? 'home' : 'other';
}
function zhekaLine (first) {
  const c = car();
  if (!c || (!first && Math.random() >= HEROQ.ZHEKA.TALK)) return null;
  const k = carKind(c);
  M.stats.zheka++;
  return t(pick(ZHEKA[k].concat(adult() ? ZHEKA[k + 'Adult'] || [] : [])), { car: c.name });
}
function stepaLine () {
  const c = car();
  if (!c || Math.random() >= HEROQ.STEPA.SAW) return null;
  M.stats.stepa++;
  return t(pick(STEPA_SAW.concat(adult() ? STEPA_SAW_ADULT : [])), { car: c.name });
}

/* ── реплика встречи (heroes.js setLineHook): null — обычная ── */
function hook (h) {
  if (!h || !h.met || h.grudge) return null;     // знакомство и обида — сначала они
  const n = SHIFT_N(), first = M.seen[h.id] !== n;
  let s = null;
  if (h.id === 'leha') s = lehaLine(first);
  else if (h.id === 'igor') s = first || Math.random() < HEROQ.IGOR.TALK ? igorLine() : null;
  else if (h.id === 'zheka') s = zhekaLine(first);
  else if (h.id === 'stepa') s = stepaLine();
  if (s) M.seen[h.id] = n;
  return s;
}

/* ── ставка: исход (career.js spin) ── */
export function roll ({ game, pick: p = null, base = 0.1, first = false }) {
  const L = HEROQ.LEHA;
  const cl = game === 'tennis' ? { ...claim() } : null;
  let chance = game === 'tennis' ? tennisOdds()[p] || 1 / 3 : base;
  const plain = chance;
  const tp = tipLive();
  let tip = null;
  if (tp && tp.game === game) {
    const follow = !tp.pick || tp.pick === p;
    if (follow) chance = tp.good ? Math.max(chance, clamp(chance + L.UP, L.MIN, L.MAX)) : Math.min(chance, clamp(chance - L.DOWN, L.MIN, L.MAX));
    tp.used = true;
    tip = { good: tp.good, follow, pick: tp.pick, d: chance - plain };
  }
  const win = !!first || Math.random() < chance;
  let champ = null;
  if (game === 'tennis') {
    if (win) champ = p;
    else {
      const o = tennisOdds(), rest = TENNIS.filter(id => id !== p), sum = rest.reduce((a, id) => a + o[id], 0);
      let r = Math.random() * sum;
      champ = rest.find(id => (r -= o[id]) < 0) || rest[rest.length - 1];
    }
    M.claim = null; save();                        // матч сыгран — у следующего свой прогноз
  }
  M.stats.rolls++;
  M.last = { game, pick: p, win, chance, plain, champ, tip, claim: cl };
  return M.last;
}
const pct = d => (d >= 0 ? '+' : '−') + Math.round(Math.abs(d) * 100) + ' %';
/** строки после исхода: совет Лёхи и «наоборот» Игорька */
export function verdict (r = M.last) {
  const out = [];
  if (!r) return out;
  if (r.tip) {
    const k = pct(r.tip.d);
    if (!r.tip.follow) out.push(t(r.tip.good ? LEHA_VERDICT.skipGood : LEHA_VERDICT.skipBad));
    else out.push(t(LEHA_VERDICT[(r.tip.good ? 'good' : 'bad') + (r.win ? 'Win' : 'Lose')], { k }));
  }
  if (r.claim && r.claim.heard && r.champ) {
    const igWon = r.champ === 'igor';
    if (r.claim.claim === 'lose' ? igWon : !igWon) out.push(t(r.claim.claim === 'lose' ? IGOR_VERDICT.lose : adult() ? IGOR_VERDICT.winAdult : IGOR_VERDICT.win));
    else out.push(t(IGOR_VERDICT.same));
  }
  return out;
}

export function init (o) {
  A = o.A;
  if (o.cars) CARS = o.cars;
  if (o.depGame) GAME_OF = o.depGame;
  if (o.shiftN) SHIFT_N = o.shiftN;
  if (o.shiftOn) SHIFT_ON = o.shiftOn;
  load();
  HEROES.setLineHook(hook);
  if (typeof window !== 'undefined') window.setTimeout(() => { if (window.__dlv) window.__dlv.HEROQ = DEBUG; }, 0);
}

/* отладка: __dlv.HEROQ */
const DEBUG = {
  M, HEROQ, tipFor, roll, verdict, tennisOdds, carKind, yellow, hook,
  tip: (good) => { M.tip = null; const s = makeTip(); if (good != null) M.tip.good = !!good; return { text: s, ...M.tip }; },
  setClaim: (c, heard = true) => { M.claim = c ? { claim: c, heard } : null; save(); return M.claim; },
  newShift: () => { M.seen = {}; },
  /* реплика героя без встречи (как при встрече): first — первая за смену */
  line: (id, first = true) => { if (first) delete M.seen[id]; return hook({ id, met: true, grudge: false }); },
  pools: { LEHA_TIP, IGOR_SAY, ZHEKA, STEPA_SAW },
  name: id => t(WHO[id]),
};
