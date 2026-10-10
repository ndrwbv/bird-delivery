/* ──────────────────────────────────────────────────────────────────────────
   «Депнуть» (только взрослая версия) — три азартные игры, у каждой свой экран и цвет, как в
   настоящем казино (docs/CAREER.md «Депнуть», числа — ECON.SLOT, исход — heroquests.js):
     slot     — однорукий бандит: неон, автомат с лампочками, три барабана, рычаг — ×2 за 777
     roulette — красное или чёрное: зелёное сукно, колесо с номерами и шариком, фишки — ×2
     tennis   — теннис один на один: корт, табло, Игорёк против Андрюши или Настюши — ×2
   Игра меняется по кругу (ECON.SLOT.GAMES), каждая смена — следующая.

   Управление (геймпад / клавиатура / касание):
     A / Enter — главная кнопка: «ДЕП» (крутить), после прокрутки — «пора на работу»; курсор сразу на ней
     X / Y     — выбрать красное / чёрное или первого / второго игрока (сразу, без крестовины);
                 после прокрутки X — «крутить ещё» (та же ставка и выбор, курсор — на «ДЕП»)
     LB RB, ←→ — ставка −/+ (≈1/20 кошелька), «всё» — курсором; B / Esc — назад.
     Значков клавиш на кнопках нет — как управлять, пишет строка внизу (.dep-keys), как в меню
   Выбор стоит сразу: совет Лёхи, иначе прошлый выбор в этой игре, иначе первый вариант.
   Выигрыш — «бах»: вспышка, печать «ВЫИГРЫШ ×N», монетки фонтаном, сумма щёлкает вверх.

   career.js: init({ A, SH, kbClear, refreshWallet, refreshTabs, refreshEnd, closeSpend }),
   open(), close(), root(), busy(), stake(±1), x(), y(), back(), game(), label(g), reprofile().
   отладка: __dlv.CAREERM.openDep / closeDep, __dlv.DEP
   ────────────────────────────────────────────────────────────────────────── */
import './dep.css';
import * as ECON from './econ.js';
import * as ACH from './achievements.js';          // «Всё на красное» (achievements.js)
import * as HEROES from './heroes.js';             // теннисисты — герои города: те же лица
import * as HQ from './heroquests.js';             // совет Лёхи, «наоборот» Игорька, кто играет матч
import * as PFX from './paperfx.js';
import { keyHTML, inputKind } from '../input/glyphs.js';
import { t, N_ } from '../i18n/index.js';

let A = null, SH = { slot: false, n: 0 }, H = {};
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const NAME = { slot: N_('однорукий бандит'), roulette: N_('красное или чёрное'), tennis: N_('теннис: кто выиграет матч') };
const PLAYER = {
  andr: { name: N_('Андрюша'), seed: 41027, fem: false },
  igor: { name: N_('Игорёк'), seed: 77311, fem: false },
  nast: { name: N_('Настюша'), seed: 50923, fem: true },
};
const COLOR = { red: N_('красное'), black: N_('чёрное') };
const SYM = ['7', '★', '♥', '₽', '◆', '♣'];
const SYM_C = ['#ff3b6b', '#ffd85e', '#ff7fd0', '#6dff8a', '#5fe8ff', '#c9a0ff'];
// настоящий порядок номеров на колесе с одним зеро: красное и чёрное через одно (нечётный индекс — красное)
const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const WHEEL_N = WHEEL.length;
const wheelColor = i => (i === 0 ? 'zero' : i % 2 ? 'red' : 'black');
const PILE_MAX = 24;

let STAKE = 0, DEP_SESSION = 0, PICK = null, GAME = 'slot', SPINNING = false, MATCH = [];
const LAST_PICK = {};                              // прошлый выбор в каждой игре (за сессию)

const stepDown = n => Math.floor(Math.max(0, n) / ECON.SLOT.STEP) * ECON.SLOT.STEP;
/** какая игра в «депнуть» на этой смене: по кругу от номера смены */
export const game = () => { const G = ECON.SLOT.GAMES; return G[((SH.n || 0) % G.length + G.length) % G.length]; };
export const mul = g => (ECON.SLOT[g] && ECON.SLOT[g].mul) || ECON.SLOT.MUL;
/** «однорукий бандит · ×2» — подсказка у пометки «депнуть» на чеке смены */
export const label = (g = game()) => t(NAME[g]) + ' · ×' + mul(g);
/** картинка плитки «депнуть» в «гараже и тратах» (career.js): пачки купюр и монеты — стиль в dep.css (.cr-t-dep) */
export const tileArt = () => '<i class="dep-loot" aria-hidden="true">' +
  '<i class="dep-stack s1"></i><i class="dep-stack s2"></i><i class="dep-stack s3"></i>' +
  '<i class="dep-coin c1">₽</i><i class="dep-coin c2">₽</i><i class="dep-coin c3">₽</i><i class="dep-coin c4">₽</i></i>';
export const root = () => { const m = $('cr-dep'); return m && !m.hidden ? m : null; };
export const busy = () => SPINNING;
/** сменили профиль без перезагрузки (game.js reprofile): первая ставка сессии — снова первая */
export function reprofile () { DEP_SESSION = 0; STAKE = 0; PICK = null; for (const k in LAST_PICK) delete LAST_PICK[k]; }

export function init (o) {
  A = o.A; SH = o.SH || SH; H = o;
  if (typeof window !== 'undefined') setTimeout(() => { if (window.__dlv) window.__dlv.DEP = DEBUG; }, 0);
}

/* варианты ставки: рулетка — цвета, теннис — двое на корте (Игорёк и его соперник, heroquests.js) */
const options = g => (g === 'roulette' ? ['red', 'black'] : g === 'tennis' ? MATCH : []);
const optName = (g, p) => t(g === 'roulette' ? COLOR[p] : PLAYER[p].name);

function box () {
  let md = $('cr-dep');
  if (md) return md;
  md = document.createElement('div');
  md.id = 'cr-dep';
  md.hidden = true;
  md.innerHTML = '<div class="dep-bg"></div><div class="dep-box">' +
    '<div class="dep-head"><div class="dep-t"></div><div class="dep-g"></div></div>' +
    '<div class="dep-main">' +
      '<div class="dep-left"><div class="dep-stage"></div><div class="dep-res"></div></div>' +
      '<div class="dep-side">' +
        '<div class="dep-tip" hidden></div>' +
        '<div class="dep-sum"><div class="dep-pile"></div><b></b><span></span></div>' +
        // автор 10.10.2026: без «¼ · ½» и без значков клавиш на кнопках — как управлять, пишет строка внизу (.dep-keys)
        '<div class="dep-stake"><button type="button" class="dep-btn dep-minus">−</button><input type="range"><button type="button" class="dep-btn dep-plus">+</button></div>' +
        '<div class="dep-quick"><button type="button" class="dep-btn" data-k="1"></button></div>' +
        '<button type="button" class="dep-go"></button>' +
        '<div class="dep-foot"><button type="button" class="dep-again" hidden></button><button type="button" class="dep-btn dep-close"></button></div>' +
      '</div>' +
    '</div>' +
    '<div class="dep-keys"></div>' +
  '</div><div class="dep-stamp" hidden></div><div class="dep-flash"></div>';
  ($('game') || document.body).appendChild(md);
  md.querySelector('.dep-close').addEventListener('click', () => close());
  const range = md.querySelector('input');
  range.addEventListener('input', () => setStake(+range.value || 0));
  md.querySelector('.dep-minus').addEventListener('click', () => setStake(STAKE - stakeStep()));
  md.querySelector('.dep-plus').addEventListener('click', () => setStake(STAKE + stakeStep()));
  md.querySelectorAll('.dep-quick button').forEach(b => b.addEventListener('click', () => setStake(stepDown(stepDown(A.wallet()) * +b.dataset.k))));
  // «ДЕП», а после прокрутки — «пора на работу»: сразу на новую смену; «крутить ещё» — новый раунд с той же ставкой
  md.querySelector('.dep-go').addEventListener('click', () => { if (SH.slot) toWork(); else spin(); });
  md.querySelector('.dep-again').addEventListener('click', () => again());
  return md;
}
/* как управлять — одной строкой внизу, как в меню и паузе; значки — по вводу (glyphs.js); after — раунд сыгран */
function keysHint (after) {
  const h = $('cr-dep') && $('cr-dep').querySelector('.dep-keys');
  if (!h) return;
  if (inputKind().kind === 'touch') { h.hidden = true; return; }
  h.hidden = false;
  const k = n => keyHTML(n);
  const pick = GAME !== 'slot' ? k('x') + k('y') + esc(t('выбор')) : '';
  h.innerHTML = after
    ? [k('ok') + esc(t('на работу')), k('x') + esc(t('крутить ещё')), k('back') + esc(t('назад'))].join('<i>·</i>')
    : [k('lb') + k('rb') + esc(t('ставка')), pick, k('ok') + esc(t('деп')), k('back') + esc(t('назад'))].filter(Boolean).join('<i>·</i>');
}
/* шаг кнопок −/+: ~1/20 кошелька, круглым числом */
function stakeStep () {
  const w = A.wallet(), raw = Math.max(ECON.SLOT.STEP, w / 20), p = 10 ** Math.floor(Math.log10(raw));
  return Math.max(ECON.SLOT.STEP, Math.round(raw / p) * p);
}
/** LB / RB, ←→: ставка на шаг вниз / вверх */
export function stake (d) { if (root() && !SH.slot && !SPINNING && d) setStake(STAKE + d * stakeStep()); }

/* ── сцены игр ── */
const cell = s => '<i style="--c:' + SYM_C[s] + '">' + SYM[s] + '</i>';
const keyFor = () => '';                           // значков X / Y на выборе нет — они в строке внизу
function face (id) {
  try { if (A.person && A.face) return A.face(HEROES.person(id) || A.person({ seed: PLAYER[id].seed, fem: PLAYER[id].fem }), 64); } catch (e) { /* — */ }
  return '';
}
function stageHTML (g) {
  if (g === 'slot') {
    const bulbs = n => Array.from({ length: n }, (_, i) => '<i style="--i:' + i + '"></i>').join('');
    return '<div class="dep-machine">' +
      '<div class="dep-marquee"><div class="dep-bulbs">' + bulbs(14) + '</div><b>7 7 7</b><div class="dep-bulbs">' + bulbs(14) + '</div></div>' +
      '<div class="dep-window"><div class="dep-reels">' +
        [0, 1, 2].map(i => '<div class="dep-reel"><div class="dep-strip" data-r="' + i + '">' + cell((i * 2 + 1) % SYM.length) + '</div></div>').join('') +
      '</div><i class="dep-line"></i></div>' +
      '<div class="dep-pay">' + cell(0) + cell(0) + cell(0) + '<span>×' + mul('slot') + '</span></div>' +
      '<div class="dep-tray"></div>' +
      '<i class="dep-lever"><b></b></i>' +
    '</div>';
  }
  const picks = '<div class="dep-picks">' + options(g).map((p, i) => {
    if (g === 'roulette') return '<button type="button" class="dep-pick dep-c-' + p + '" data-p="' + p + '">' + keyFor(i) + '<span>' + esc(optName(g, p)) + '</span><em class="dep-chips"></em></button>';
    const f = face(p);
    return '<button type="button" class="dep-pick dep-pl" data-p="' + p + '">' + keyFor(i) + (f ? '<img src="' + f + '" alt="">' : '<i></i>') + '<span>' + esc(optName(g, p)) + '</span><em class="dep-chips"></em></button>';
  }).join('') + '</div>';
  if (g === 'roulette') {
    const seg = 360 / WHEEL_N, stops = [];
    let nums = '';
    for (let i = 0; i < WHEEL_N; i++) {
      const c = { zero: '#1f9e4f', red: '#d9342c', black: '#1d1a22' }[wheelColor(i)];
      stops.push(c + ' ' + (i * seg).toFixed(2) + 'deg ' + ((i + 1) * seg).toFixed(2) + 'deg');
      nums += '<span style="transform:rotate(' + ((i + 0.5) * seg).toFixed(2) + 'deg)"><b>' + WHEEL[i] + '</b></span>';
    }
    return '<div class="dep-table"><div class="dep-rl"><div class="dep-rim"></div>' +
      '<div class="dep-wheel"><div class="dep-sectors" style="background:conic-gradient(' + stops.join(',') + ')"></div>' + nums + '<i class="dep-hub"></i></div>' +
      '<div class="dep-track"><i class="dep-rball"></i></div><div class="dep-ptr"></div></div>' + picks + '</div>';
  }
  // теннис: табло, корт сверху, двое по краям и мячик
  const [a, b] = MATCH, fa = face(a), fb = face(b);
  return '<div class="dep-arena">' +
    '<div class="dep-board"><span>' + esc(optName(g, a)) + '</span><b class="dep-score">0 : 0</b><span>' + esc(optName(g, b)) + '</span></div>' +
    '<div class="dep-court"><i class="dep-lines"></i><i class="dep-net"></i>' +
      '<i class="dep-p dep-pa">' + (fa ? '<img src="' + fa + '" alt="">' : '') + '</i><i class="dep-p dep-pb">' + (fb ? '<img src="' + fb + '" alt="">' : '') + '</i>' +
      '<i class="dep-ball"></i></div>' + picks + '</div>';
}

export function open () {
  const md = box();
  GAME = game();
  MATCH = GAME === 'tennis' ? HQ.match() : [];
  const max = stepDown(A.wallet());
  STAKE = Math.min(max, stepDown(A.S.money || 0) || stepDown(max / 4) || max);
  md.dataset.game = GAME;
  md.querySelector('.dep-t').textContent = t(NAME[GAME]);
  md.querySelector('.dep-g').textContent = t('депнуть') + ' · ' + t('выигрыш ×{k}', { k: mul(GAME) });
  md.querySelector('.dep-quick [data-k="1"]').textContent = t('всё');
  md.querySelector('.dep-close').textContent = t('назад');
  keysHint();
  md.querySelector('.dep-stage').innerHTML = stageHTML(GAME);
  md.querySelectorAll('.dep-pick').forEach(b => b.addEventListener('click', () => choose(b.dataset.p)));
  // совет Лёхи Арбуза (раз за смену, heroquests.js) — строкой над ставкой; выбор сразу стоит на его совете
  // у трёх семёрок Лёхи нет — ни совета, ни «Лёха опять слил» (автор 10.10.2026)
  const tip = GAME === 'slot' ? null : HQ.tipFor(GAME), tipEl = md.querySelector('.dep-tip');
  tipEl.textContent = tip ? tip.text : ''; tipEl.hidden = !tip;
  const opts = options(GAME);
  PICK = !opts.length ? null : [tip && tip.pick, LAST_PICK[GAME]].find(p => opts.includes(p)) || opts[0];
  const r = md.querySelector('input');
  r.min = max ? ECON.SLOT.STEP : 0; r.max = max; r.step = ECON.SLOT.STEP;
  newRound(md);
  md.hidden = false;
  requestAnimationFrame(() => md.classList.add('on'));
}
/* раунд с чистого листа: та же сцена, ставка и выбор остаются */
function newRound (md) {
  SH.slot = false;
  md.classList.remove('spun', 'won', 'lost');
  md.querySelector('.dep-pile').innerHTML = '';
  md.querySelector('.dep-res').innerHTML = ''; md.querySelector('.dep-res').className = 'dep-res';
  md.querySelector('.dep-again').hidden = true;
  md.querySelector('.dep-stamp').hidden = true;
  md.querySelector('.dep-close').disabled = false;
  md.querySelectorAll('.dep-pick').forEach(b => { b.disabled = false; b.classList.remove('champ', 'out'); });
  md.querySelectorAll('.dep-tray i').forEach(c => c.remove());
  markPick(md);
  setStake(STAKE, true);
  aim();
}
function markPick (md) {
  md.querySelectorAll('.dep-pick').forEach(q => q.classList.toggle('on', q.dataset.p === PICK));
}
function choose (p) {
  const md = root();
  if (!md || SH.slot || SPINNING || !options(GAME).includes(p)) return;
  if (p !== PICK) A.Snd.click(660, 0.06, 0.05);
  PICK = p; LAST_PICK[GAME] = p;
  markPick(md);
  const b = md.querySelector('.dep-pick.on');
  if (b) PFX.press(b);
  setStake(STAKE, true);
  aim();
}
/** [X]: до прокрутки — первый вариант (красное / первый игрок), после — «крутить ещё» */
export function x () { if (!root() || SPINNING) return; if (SH.slot) { const b = root().querySelector('.dep-again'); if (b && !b.hidden) { PFX.press(b); again(); } } else choose(options(GAME)[0]); }
/** [Y]: второй вариант (чёрное / второй игрок) */
export function y () { if (root() && !SH.slot && !SPINNING) choose(options(GAME)[1]); }
/* курсор геймпада и клавиатуры ([data-pad-main], padmenu.js) — всегда на главной кнопке */
function aim () {
  const md = root() || $('cr-dep');
  if (!md) return;
  md.querySelectorAll('[data-pad-main]').forEach(b => b.removeAttribute('data-pad-main'));
  md.querySelector('.dep-go').setAttribute('data-pad-main', '');
  if (A.padClear) A.padClear();
  if (H.kbClear) H.kbClear();
}
function again () {
  const md = root();
  if (!md || SPINNING || !SH.slot || stepDown(A.wallet()) <= 0) return;
  keysHint();
  if (GAME === 'tennis') {                         // новый матч — новый соперник у Игорька
    MATCH = HQ.match();
    md.querySelector('.dep-stage').innerHTML = stageHTML(GAME);
    md.querySelectorAll('.dep-pick').forEach(b => b.addEventListener('click', () => choose(b.dataset.p)));
    if (!MATCH.includes(PICK)) PICK = MATCH.includes(LAST_PICK.tennis) ? LAST_PICK.tennis : MATCH[0];
  }
  const tipEl = md.querySelector('.dep-tip'); tipEl.hidden = true;   // совет Лёхи — на первую прокрутку
  const r = md.querySelector('input'), max = stepDown(A.wallet());
  r.min = max ? ECON.SLOT.STEP : 0; r.max = max;
  newRound(md);
}
function toWork () {
  if (SPINNING) return;
  close(); if (H.closeSpend) H.closeSpend();
  const b = $('ov-again'); if (b) b.click();
}
export function close () {
  const md = $('cr-dep');
  if (!md || md.hidden) return false;
  md.classList.remove('on'); md.hidden = true;
  if (H.refreshWallet) H.refreshWallet();
  if (H.refreshTabs) H.refreshTabs();
  if (H.refreshEnd) H.refreshEnd();
  return true;
}
/** B / Esc: посреди прокрутки не закрывает — дождись итога */
export function back () { return SPINNING ? true : close(); }

/* ставка: цифры, ползунок и кучка фишек / монет / купюр (их столько, какая доля кошелька) */
function setStake (v, quiet) {
  const md = box(), max = stepDown(A.wallet()), done = SH.slot;
  STAKE = Math.max(max ? ECON.SLOT.STEP : 0, Math.min(max, stepDown(v)));
  const r = md.querySelector('input');
  r.value = STAKE; r.disabled = done || max <= 0;
  if (done) return;                                  // раунд сыгран — цифры итога не трогаем
  md.querySelector('.dep-sum b').textContent = A.money(STAKE);
  md.querySelector('.dep-sum span').textContent = max <= 0 ? t('нечего ставить') : t('из копилки −{money} · останется {left}', { money: A.money(STAKE), left: A.money(A.wallet() - STAKE) });
  md.querySelectorAll('.dep-stake button, .dep-quick button').forEach(b => { b.disabled = max <= 0; });
  const go = md.querySelector('.dep-go');
  go.innerHTML = '<span>' + esc(t('ДЕП · {money}', { money: A.money(STAKE) })) + '</span>';
  go.disabled = STAKE <= 0 || STAKE > A.wallet();
  const n = max ? Math.max(1, Math.round(PILE_MAX * STAKE / max)) : 0;
  pile(n, quiet);
  // фишки на выбранном цвете / игроке: 1…5 по доле кошелька
  md.querySelectorAll('.dep-chips').forEach(c => { c.innerHTML = ''; });
  const on = md.querySelector('.dep-pick.on .dep-chips');
  if (on && n) on.innerHTML = '<i></i>'.repeat(Math.max(1, Math.round(5 * n / PILE_MAX)));
}
function pile (n, quiet) {
  const el = box().querySelector('.dep-pile');
  const have = el.querySelectorAll('i:not(.gone)');
  if (have.length < n) {
    for (let k = have.length; k < n; k++) {
      const b = document.createElement('i');
      const col = k % 8, row = Math.floor(k / 8);
      b.style.left = (2 + col * 12 + (row % 2) * 4 + (Math.random() * 3 - 1.5)) + '%';
      b.style.bottom = (row * 12 + Math.random() * 3) + '%';
      b.style.setProperty('--r', (Math.random() * 30 - 15).toFixed(0) + 'deg');
      b.style.animationDelay = quiet ? '0s' : ((k - have.length) * 0.03).toFixed(3) + 's';
      b.textContent = '₽';
      el.appendChild(b);
    }
    if (!quiet) A.Snd.fx('chip', s => s.blip(520 + n * 12, 0.04, 'square', 0.05));
  } else for (let k = have.length - 1; k >= n; k--) { const b = have[k]; b.classList.add('gone'); setTimeout(() => b.remove(), 300); }
}

/* ── прокрутка: исход решается сразу (heroquests.js), анимация его только показывает ── */
function spin () {
  const md = box();
  const st = Math.min(STAKE, stepDown(A.wallet()));
  if (SH.slot || SPINNING || st <= 0 || (GAME !== 'slot' && !PICK)) return;
  SH.slot = true; SPINNING = true;
  DEP_SESSION++;
  const cfg = ECON.SLOT[GAME] || {};
  const R = HQ.roll({ game: GAME, pick: PICK, base: cfg.win != null ? cfg.win : ECON.SLOT.WIN, first: ECON.SLOT.FIRST_WIN && DEP_SESSION === 1 });
  const win = R.win;
  A.addWallet(-st);
  const allIn = stepDown(A.wallet()) <= 0;        // поставил всё — для достижения ALL_IN (achievements.js)
  A.Store.flush();
  if (H.refreshWallet) H.refreshWallet();
  md.classList.add('spun');                       // фишки уезжают в игру
  // пока крутится — не жмётся ничего, и «назад» тоже
  md.querySelectorAll('.dep-stake button, .dep-quick button, .dep-go, .dep-close, .dep-pick').forEach(b => { b.disabled = true; });
  md.querySelector('input').disabled = true;
  md.querySelector('.dep-sum span').textContent = t('из копилки −{money} · останется {left}', { money: A.money(st), left: A.money(A.wallet()) });
  A.Snd.fx('bet', s => s.blip(220, 0.12, 'square', 0.08));
  const finish = txt => {
    ACH.dep(win, allIn);                          // проиграл всё — «Всё на красное» (после анимации, не раньше)
    const res = md.querySelector('.dep-res');
    // у трёх семёрок «Лёха опять слил» не пишем (автор 10.10.2026: «убери»)
    const heroTxt = HQ.verdict(R).filter(() => GAME !== 'slot').map(s => '<span class="dep-hq">' + esc(s) + '</span>').join('');   // «Лёха был прав!» / «Лёха опять слил»
    md.querySelector('.dep-pile').innerHTML = '';
    const sumB = md.querySelector('.dep-sum b');
    if (win) {
      const prize = st * mul(GAME);
      A.addWallet(prize);
      A.Store.flush();
      res.innerHTML = '<b>' + esc(txt) + '</b>' + heroTxt;
      res.className = 'dep-res win';
      md.classList.remove('spun'); md.classList.add('won');
      boom(md, prize);
      PFX.countUp(sumB, 0, prize - st, { ms: 1100, fmt: n => '+' + A.money(n) });   // чистый выигрыш: ставка вернулась и сверху столько же
    } else {
      res.innerHTML = '<b>' + esc(txt) + '</b><span class="dep-miss">' + esc(t('мимо · −{money}', { money: A.money(st) })) + '</span>' + heroTxt;
      res.className = 'dep-res lose';
      md.classList.add('lost');
      sumB.textContent = '−' + A.money(st);
      stamp(md, t('мимо'), false);
      A.Snd.fail && A.Snd.fail();
    }
    md.querySelector('.dep-sum span').textContent = t('в копилке {money}', { money: A.money(A.wallet()) });
    SPINNING = false;
    const go = md.querySelector('.dep-go');
    go.innerHTML = '<span>' + esc(t('пора на работу')) + '</span>'; go.disabled = false;
    md.querySelector('.dep-close').disabled = false;
    const ag = md.querySelector('.dep-again');
    ag.textContent = t('крутить ещё'); keysHint(true); ag.hidden = stepDown(A.wallet()) <= 0;   // [X] — нарочно мелко (dep.css)
    if (H.refreshWallet) H.refreshWallet();
    if (H.refreshTabs) H.refreshTabs();
    aim();
  };
  if (GAME === 'roulette') spinWheel(md, win, finish);
  else if (GAME === 'tennis') playMatch(md, win, finish, R.champ);
  else spinReels(md, win, finish);
}
/* печать итога поверх игры: «ВЫИГРЫШ ×2» (зелёная, с хлопком) или «МИМО» (серая) */
function stamp (md, txt, good) {
  const s = md.querySelector('.dep-stamp');
  s.textContent = txt;
  s.className = 'dep-stamp ' + (good ? 'good' : 'bad');
  s.hidden = false;
  PFX.replay(s, 'go');
}
/* бах: вспышка, тряска, печать, монетки фонтаном из игры и из суммы, звон */
function boom (md, prize) {
  PFX.replay(md.querySelector('.dep-flash'), 'go');
  PFX.replay(md.querySelector('.dep-box'), 'pp-shake');
  stamp(md, t('выигрыш ×{k}', { k: mul(GAME) }), true);
  const stage = md.querySelector('.dep-stage');
  PFX.burst(stage, { kind: 'coins', n: 34, spread: 2.6 });
  setTimeout(() => PFX.burst(stage, { kind: 'confetti', n: 40, spread: 2.2 }), 160);
  setTimeout(() => PFX.burst(md.querySelector('.dep-sum b'), { kind: 'coins', n: 16, spread: 1.2 }), 420);
  pile(PILE_MAX, false);                           // полная куча обратно
  if (GAME === 'slot') {                           // монеты сыплются в лоток автомата
    const tray = md.querySelector('.dep-tray');
    for (let i = 0; i < 14; i++) {
      const c = document.createElement('i');
      c.style.left = (8 + Math.random() * 80) + '%';
      c.style.animationDelay = (i * 0.06).toFixed(2) + 's';
      tray.appendChild(c);
    }
  }
  [0, 1, 2, 3, 4, 5].forEach(i => setTimeout(() => A.Snd.coin(), i * 120));
}
function spinReels (md, win, finish) {
  let out;
  if (win) out = [0, 0, 0];
  else { do out = [0, 1, 2].map(() => (Math.random() * SYM.length) | 0); while (out[0] === out[1] && out[1] === out[2]); }
  const strips = [...md.querySelectorAll('.dep-strip')];
  const fill = (el, last) => { let h = ''; for (let i = 0; i < 29; i++) h += cell((Math.random() * SYM.length) | 0); el.innerHTML = h + cell(last); };
  strips.forEach((el, i) => { fill(el, out[i]); el.style.transform = 'translateY(0)'; delete el.dataset.stopped; });
  const H0 = strips[0].firstChild ? strips[0].firstChild.getBoundingClientRect().height || 72 : 72;
  const t0 = performance.now(), STOP = [1300, 1900, 2600];
  let tickN = 0;
  const anim = now => {
    const e = now - t0;
    let all = true;
    strips.forEach((el, i) => {
      const k = Math.min(1, e / STOP[i]);
      if (k < 1) all = false;
      el.style.transform = 'translateY(' + (-(1 - (1 - k) ** 3) * 29 * H0).toFixed(1) + 'px)';
      if (k >= 1 && !el.dataset.stopped) { el.dataset.stopped = '1'; el.parentNode.classList.add('stop'); A.Snd.fx('reel-stop', s => s.blip(420 + i * 120, 0.09, 'square', 0.1)); }
    });
    if (((e / 90) | 0) > tickN) { tickN = (e / 90) | 0; if (!all) A.Snd.fx('reel-tick', s => s.blip(900 + (tickN % 3) * 60, 0.02, 'square', 0.03)); }
    if (!all && md.isConnected) requestAnimationFrame(anim);
    else { md.querySelectorAll('.dep-reel').forEach(r => r.classList.remove('stop')); finish(win ? t('три семёрки!') : t('не сошлось')); }
  };
  requestAnimationFrame(anim);
}
/* колесо: выигрыш — сектор выбранного цвета, проигрыш — другого или зеро; шарик бежит навстречу и встаёт под стрелку */
function spinWheel (md, win, finish) {
  const other = PICK === 'red' ? 'black' : 'red';
  const want = win ? PICK : (Math.random() < 1 / 19 ? 'zero' : other);
  const cand = [];
  for (let i = 0; i < WHEEL_N; i++) if (wheelColor(i) === want) cand.push(i);
  const i = cand[(Math.random() * cand.length) | 0], seg = 360 / WHEEL_N;
  const deg = 360 * 6 - (i + 0.5) * seg;             // сектор i встаёт под стрелку сверху
  const w = md.querySelector('.dep-wheel'), tr = md.querySelector('.dep-track');
  for (const [el, to] of [[w, deg], [tr, -360 * 4]]) {
    el.style.transition = 'none'; el.style.transform = 'rotate(0deg)';
    void el.offsetWidth;
    el.style.transition = 'transform 3.2s cubic-bezier(.12, .7, .15, 1)';
    el.style.transform = 'rotate(' + to + 'deg)';
  }
  tr.classList.add('run');
  let n = 0;
  const tick = setInterval(() => { const f = 1000 - n * 20; A.Snd.fx('reel-tick', s => s.blip(f, 0.015, 'square', 0.03)); if (++n > 34) clearInterval(tick); }, 90);
  setTimeout(() => {
    clearInterval(tick);
    tr.classList.remove('run');
    A.Snd.fx('reel-stop', s => s.blip(300, 0.06, 'square', 0.08));
    const name = { red: t('красное'), black: t('чёрное'), zero: t('зеро') }[want];
    finish(t('выпало: {what}', { what: WHEEL[i] + ' ' + name }));
  }, 3350);
}
/* матч один на один: мячик летает между игроками, счёт тикает к 6 : 2…4 в пользу победителя */
function playMatch (md, win, finish, champId) {
  const [a, b] = MATCH;
  const champ = MATCH.includes(champId) ? champId : win ? PICK : MATCH.find(p => p !== PICK);
  const lose = 2 + ((Math.random() * 3) | 0), seq = [];
  for (let k = 0; k < 5; k++) seq.push(champ);   // последний гейм — победителя
  for (let k = 0; k < lose; k++) seq.push(champ === a ? b : a);
  for (let k = seq.length - 1; k > 0; k--) { const j = (Math.random() * (k + 1)) | 0; [seq[k], seq[j]] = [seq[j], seq[k]]; }
  seq.push(champ);
  const court = md.querySelector('.dep-court'), score = md.querySelector('.dep-score');
  court.classList.add('play');
  let sa = 0, sb = 0, k = 0;
  const STEP = 2900 / seq.length;
  const iv = setInterval(() => {
    if (k >= seq.length) return;
    if (seq[k] === a) sa++; else sb++;
    score.textContent = sa + ' : ' + sb;
    PFX.replay(score, 'pp-tick');
    { const f = k % 2 ? 380 : 520; A.Snd.fx('ball', s => s.blip(f, 0.03, 'square', 0.05)); }
    k++;
  }, STEP);
  setTimeout(() => {
    clearInterval(iv);
    court.classList.remove('play');
    score.textContent = (champ === a ? 6 : lose) + ' : ' + (champ === b ? 6 : lose);
    md.querySelectorAll('.dep-pl').forEach(q => { q.classList.toggle('champ', q.dataset.p === champ); q.classList.toggle('out', q.dataset.p !== champ); });
    court.classList.add(champ === a ? 'won-a' : 'won-b');
    const who = PLAYER[champ];
    finish(who.fem ? t('матч выиграла {who}', { who: t(who.name) }) : t('матч выиграл {who}', { who: t(who.name) }));
    setTimeout(() => court.classList.remove('won-a', 'won-b'), 2400);
  }, 2950);
}

/* отладка: __dlv.DEP */
const DEBUG = {
  open, close, x, y, stake, game, label, again,
  get state () { return { game: GAME, pick: PICK, stake: STAKE, match: MATCH, done: SH.slot, spinning: SPINNING, session: DEP_SESSION }; },
};
