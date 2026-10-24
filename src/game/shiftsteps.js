/* ──────────────────────────────────────────────────────────────────────────
   Конец смены — в несколько экранов (11бе, автор 24.10.2026: «финальная смена в несколько экранов: сначала
   сколько денег заработал — копилка наполняется; следующий — какой ты в рейтинге курьеров; потом — какая
   ситуация по тачке, какой износ; потом — саммари, как сейчас; экраны меняются с анимацией, и надо жать
   „дальше“». И: «первый раз игроку одна из частей — „давай депнем“: сразу уже стоит игра и можно нажать
   „Деп“; сумма — четверть зп»). Правила словами — docs/CAREER.md «Конец смены — экраны по очереди».

   11бн (автор 24.10.2026: «не на белом фоне с рамкой и табличным интерфейсом — на чёрном, яркие и праздничные, если хорошо;
   а если плохо — это отображали»): листы — без бумаги и рамки, на чёрном; настроение листа (toneOf: good / meh / bad)
   красит фон и сыплет своё — золото, конфетти и салют, или дождь, трещины и тусклые цвета.

   Листы по очереди на чёрном (шрифт и палитра — paper.css, свой — shiftsteps.css):
     cash — «заработано за смену»: строки (заказы, чаевые, задания, бонус, премия, штрафы) допечатываются,
            сумма растёт с каждой, монеты летят в копилку-свинью, свинья наполняется, «в копилке» щёлкает;
     dep  — «давай депнем?» (только взрослая): сразу окно «депнуть» (dep.js) — игра этой смены (рулетка, бандит…),
            ставка ¼ заработанного уже стоит, «ДЕП» крутит, «не сейчас» — дальше (0п60; CFG.DEP_DIRECT = false — билет
            «ДЕП · N ₽» и «не сейчас», как было);
     rank — рейтинг смены: строки коллег, твоя «въезжает» справа на своё место, премия первому;
     car  — «акт осмотра»: машина сверху, битое закрашено (перекос / болтается / отлетело, стёкла, фары),
            сердца, мотор и ресурс, что отлетело, «ремонт мотора у Дяди Жени — N ₽».
   Потом — нынешний чек смены (career.js showEnd → shiftend.js). Лист улетает влево, следующий влетает справа.

   Управление: A / Enter / пробел / тап — «дальше» (идёт анимация — сначала показать сразу); B / Esc —
   «пропустить всё» (сразу чек); на «давай депнем?» A — «Деп», X — «не сейчас». Значков на кнопках нет —
   как управлять, пишет полоска внизу (пальцем — нет). Новый лист первые ARM мс не жмётся.

     SS.play({ host, screens, head, no, money, Snd, onDep }, done)   host — #over; screens — [{ id, … }] (career.js)
     SS.active(), SS.root()    — идёт ли; career.js padRoot — это (геймпад и клавиши — сюда)
     SS.ok(), SS.alt(), SS.skip() — A, X, B
     SS.carState(g)            — машина: детали по ступеням, стёкла, фары, вмятины, что отлетело (carwreck.js, cardent.js)
   ?oldend — как было: сразу чек. Отладка: __dlv.CAREERM.SSTEPS (state, ok, alt, skip, CFG, carState).
   ────────────────────────────────────────────────────────────────────────── */
import './shiftsteps.css';
import { t, tn, N_ } from '../i18n/index.js';
import * as PFX from './paperfx.js';
import { keyHTML, inputKind, onInput } from '../input/glyphs.js';
import { state as wreckState } from './carwreck.js';

export const CFG = {
  DEP_SHARE: 0.25,     // «давай депнем?»: ставка — четверть заработанного за смену
  DEP_DIRECT: true,    // «давай депнем?» — сразу окно игры (dep.js), не билет с кнопкой (0п60); false — билет, как было
  DEP_CHANCE: 0.3,     // после первого раза — с таким шансом, когда есть деньги, и не две смены подряд
  PIG_K: 60000,        // копилка: уровень = в копилке / (в копилке + PIG_K) — 15 000 ₽ ≈ ⅕, 60 000 ≈ ½, 240 000 ≈ ⅘
  ARM: 320,            // мс: новый лист первые столько не жмётся (кто долбил A, не пролистает не глядя)
  OUT: 360,            // мс: лист улетает влево
  ROW: 330,            // мс: строка денег / рейтинга за строкой
  ROWS_PH: 5,          // рейтинг на телефоне боком: ты и соседи (±2)
};
export const OFF = typeof location !== 'undefined' && /[?&]oldend\b/.test(location.search || '');
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const calm = () => (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) || document.body.classList.contains('calm-fx');

const TAB = { cash: N_('деньги'), dep: N_('деп'), rank: N_('рейтинг'), car: N_('машина'), end: N_('итог') };

let R = null;           // идущий показ
const alive = () => { if (R && (!R.host.isConnected || R.host.hidden)) end(true); return !!R; };
export const active = () => alive();
export const root = () => (alive() ? R.el : null);

/* ── настроение листа (11бн): good — праздник, meh — спокойно, bad — мрачно ── */
function carVerdict (c) {
  const off = (c.lost || []).filter(k => !['fl', 'fr', 'rl', 'rr'].includes(k));
  const G = c.glass || {}, gc = Object.values(G).filter(v => v === 1).length, gb = Object.values(G).filter(v => v >= 2).length;
  const body = c.dents || gc || gb || Object.values(c.parts || {}).some(v => v > 0);
  return c.hp <= 0 || off.length >= 3 ? ['red', t('в хлам')] : body || c.hits ? ['rust', t('помята')] : ['green', t('целая')];
}
export function toneOf (s) {
  if (!s) return 'meh';
  if (s.id === 'cash') return s.total > 0 && s.rows && s.rows.some(r => r.n > 0) ? 'good' : 'bad';
  if (s.id === 'rank') {
    const place = (s.rows || []).findIndex(r => r.me) + 1, n = (s.rows || []).length;
    return place === 1 && s.delivered > 0 ? 'good' : place === n && n > 2 ? 'bad' : 'meh';
  }
  if (s.id === 'car') { const v = carVerdict(s.car)[0]; return v === 'green' ? 'good' : v === 'red' ? 'bad' : 'meh'; }
  return 'meh';
}
/* фон листа: хорошо — сверху сыплются золото и конфетти; плохо — дождь и трещины по углам (calm — без движения, но трещины и цвет остаются) */
const CRACK_P = '<path d="M0 0L38 30L52 22L74 62L66 70L98 118M38 30L20 54L26 90M74 62L120 54"/>';
const CRACK = '<svg class="ss-crack ss-crack-a" viewBox="0 0 120 120" aria-hidden="true">' + CRACK_P + '</svg>' +
  '<svg class="ss-crack ss-crack-b" viewBox="0 0 120 120" aria-hidden="true">' + CRACK_P + '</svg>';
function fxFor (tone) {
  if (!R) return;
  const box = R.el.querySelector('.ss-fx');
  if (!box) return;
  R.el.dataset.tone = tone;
  box.innerHTML = '';
  if (tone === 'meh') return;
  let h = '';
  if (tone === 'bad') h += CRACK;
  if (!calm()) {
    const n = tone === 'good' ? 26 : 46, cols = ['#ffd85e', '#ff5fa2', '#4fd65a', '#ff8a2b', '#fff6b8'];
    for (let i = 0; i < n; i++) {
      const d = (Math.random() * 6).toFixed(2), x = Math.round(Math.random() * 100), dur = tone === 'good' ? (3.4 + Math.random() * 3).toFixed(2) : (0.7 + Math.random() * 0.6).toFixed(2);
      h += tone === 'good'
        ? '<i class="ss-fall" style="left:' + x + '%;--d:' + d + 's;--t:' + dur + 's;--c:' + cols[i % cols.length] + ';--w:' + (6 + (i % 3) * 3) + 'px;--r:' + Math.round(Math.random() * 360) + 'deg' + (i % 4 === 0 ? ';border-radius:50%' : '') + '"></i>'
        : '<i class="ss-drop" style="left:' + x + '%;--d:' + d + 's;--t:' + dur + 's;--h:' + (14 + (i % 4) * 8) + 'px"></i>';
    }
  }
  box.innerHTML = h;
}
/* коротко: фанфара или мрачный спуск */
const sting = tone => {
  if (tone === 'good') [523, 659, 784, 1046].forEach((f, i) => later(i * 90, () => blip('ss-good', f, 0.16, 'triangle', 0.07)));
  else if (tone === 'bad') [196, 156, 117].forEach((f, i) => later(i * 190, () => blip('ss-bad', f, 0.34, 'sawtooth', 0.05)));
};
/* салют: несколько залпов конфетти из разных мест листа */
function salute (sh) {
  if (calm()) return;
  const r = sh.getBoundingClientRect();
  [[0.2, 0.3], [0.8, 0.25], [0.5, 0.15], [0.3, 0.6], [0.7, 0.55]].forEach(([x, y], i) => later(i * 260, () => {
    PFX.burst({ x: r.left + r.width * x, y: r.top + r.height * y }, { kind: 'confetti', n: 30, spread: 1.6 });
    blip('whoosh', 700 + i * 90, 0.08, 'sine', 0.03);
  }));
}

/* ── показ ── */
export function play (o, done) {
  if (R) end(true);
  const host = o.host, screens = (o.screens || []).filter(Boolean);
  if (!host || !screens.length) { done && done(); return; }
  const el = document.createElement('div');
  el.id = 'cr-steps';
  el.className = 'ss pp-desk';
  const tabs = screens.map(s => s.id).concat('end');
  el.innerHTML = '<div class="ss-fx" aria-hidden="true"></div><nav class="ss-tabs">' + tabs.map((k, i) => '<i data-k="' + k + '"><b>' + (i + 1) + '</b><span>' + esc(t(TAB[k])) + '</span></i>').join('') + '</nav>' +
    '<div class="ss-deck"></div>' +
    '<nav class="ss-foot"><button type="button" class="pp-note ss-skip">' + esc(t('пропустить всё')) + '</button></nav>' +
    '<div class="ss-keys"></div>';
  host.appendChild(el);
  host.classList.add('ss-on');
  R = { o, host, el, screens, i: -1, done, busy: false, anim: null, armAt: 0, timers: [], sheet: null };
  el.querySelector('.ss-skip').addEventListener('click', e => { e.stopPropagation(); skip(true); });
  el.addEventListener('pointerdown', onTap, true);
  addEventListener('resize', fit);
  next();
}

function onTap (e) {
  if (!R || e.target.closest('button')) return;      // кнопки жмутся сами (click)
  if (R.screens[R.i] && R.screens[R.i].id === 'dep') return;   // на «давай депнем?» мимо кнопок — ничего (не поставить нечаянно)
  e.preventDefault();
  ok();
}

const later = (ms, f) => { if (R) R.timers.push(setTimeout(f, ms)); };
const clearT = () => { if (R) { R.timers.forEach(clearTimeout); R.timers.length = 0; } };
const blip = (name, f, d, ty, v) => { const S = R && R.o.Snd; if (S && S.fx) try { S.fx(name, s => s.blip(f, d, ty, v)); } catch (e) { /* — */ } };
const coin = () => { const S = R && R.o.Snd; if (S && S.coin) try { S.coin(); } catch (e) { /* — */ } };

/** A / Enter / тап: идёт анимация — показать сразу; иначе — дальше */
export function ok () {
  if (!alive() || R.busy || performance.now() < R.armAt) return;
  if (R.anim) { R.anim(); return; }
  const s = R.screens[R.i];
  if (s && s.id === 'dep') { depGo(); return; }
  next();
}
/** X: на «давай депнем?» — «не сейчас» */
export function alt () {
  if (!alive() || R.busy || performance.now() < R.armAt) return;
  const s = R.screens[R.i];
  if (s && s.id === 'dep') { if (R.anim) R.anim(); next(); }
}
/** B / Esc / «пропустить всё» — сразу чек смены */
export function skip (click) {
  if (!alive() || R.busy) return;
  if (!click && performance.now() < R.armAt) return;
  R.i = R.screens.length - 1;
  next();
}

/* следующий лист: старый улетает влево, новый влетает справа; после последнего — чек смены (done) */
function next () {
  if (!R) return;
  clearT(); R.anim = null;
  const old = R.sheet, deck = R.el.querySelector('.ss-deck');
  R.i++;
  if (old) {
    old.classList.remove('ss-in'); old.classList.add('ss-out');
    blip('whoosh', 300, 0.12, 'sine', 0.04);
    const gone = old; setTimeout(() => gone.remove(), calm() ? 0 : CFG.OUT + 40);
  }
  if (R.i >= R.screens.length) {
    R.busy = true;
    tabsOn('end');
    setTimeout(() => end(false), old && !calm() ? CFG.OUT - 80 : 0);
    return;
  }
  const s = R.screens[R.i];
  const sh = document.createElement('section');
  sh.className = 'ss-sheet ss-' + s.id + (old ? ' ss-in' : ' ss-first');
  sh.innerHTML = BUILD[s.id](s);
  deck.appendChild(sh);
  R.sheet = sh;
  const tone = toneOf(s);
  sh.dataset.tone = tone;
  fxFor(tone);
  sting(tone);
  R.armAt = performance.now() + CFG.ARM;
  tabsOn(s.id);
  const go = sh.querySelector('.ss-go');
  if (go) {
    go.setAttribute('data-pad-main', '');
    go.addEventListener('click', e => { e.stopPropagation(); ok(); });
  }
  const no = sh.querySelector('.ss-no');
  if (no) no.addEventListener('click', e => { e.stopPropagation(); alt(); });
  if (R.o.padClear) try { R.o.padClear(); } catch (e) { /* — */ }
  keys();
  fit();
  ANIM[s.id](sh, s);
  // «давай депнем?» — сразу сама игра (0п60, автор 24.10.2026: «экран депа — это буквально то, что показывается, когда
  // заходишь в деп»): окно «депнуть» (dep.js) с рулеткой или бандитом, ставка ¼ смены уже стоит — крути или «не сейчас»
  if (s.id === 'dep' && CFG.DEP_DIRECT && R.o.onDep) depGo(false);
}

function tabsOn (k) {
  if (!R) return;
  let seen = false;
  R.el.querySelectorAll('.ss-tabs > i').forEach(i => { const on = i.dataset.k === k; i.classList.toggle('on', on); i.classList.toggle('was', !seen && !on); if (on) seen = true; });
}

function end (quiet) {
  if (!R) return;
  const r = R;
  clearT();
  R = null;
  removeEventListener('resize', fit);
  r.el.removeEventListener('pointerdown', onTap, true);
  r.host.classList.remove('ss-on');
  r.el.remove();
  if (!quiet && r.done) try { r.done(); } catch (e) { console.error('[shiftsteps]', e); }
}

/* как управлять — полоска внизу (как у чека смены); пальцем — нет */
function keys () {
  if (!R) return;
  const h = R.el.querySelector('.ss-keys'), s = R.screens[R.i];
  if (!h) return;
  if (inputKind().kind === 'touch') { h.hidden = true; return; }
  h.hidden = false;
  const dep = s && s.id === 'dep';
  h.innerHTML = (dep ? [keyHTML('ok') + esc(t('деп')), keyHTML('x') + esc(t('не сейчас')), keyHTML('back') + esc(t('пропустить всё'))]
    : [keyHTML('ok') + esc(t('дальше')), keyHTML('back') + esc(t('пропустить всё'))]).join('<i>·</i>');
}
onInput(() => keys());

/* не влезло (длинный язык, низкий экран) — лист чуть уменьшается (не меньше 0,6), как чек смены */
function fit () {
  if (!R || !R.sheet) return;
  const sh = R.sheet, el = R.el, deck = el.querySelector('.ss-deck'), cs = getComputedStyle(el);
  sh.style.zoom = '';
  const gap = parseFloat(cs.rowGap) || 0, tabs = el.querySelector('.ss-tabs'), foot = el.querySelector('.ss-foot');
  const room = el.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0) - (tabs ? tabs.offsetHeight : 0) - (foot ? foot.offsetHeight : 0) - 2 * gap;
  const k = Math.min(room / Math.max(1, sh.offsetHeight + 14), deck.clientWidth / Math.max(1, sh.offsetWidth));
  if (k < 1) sh.style.zoom = Math.max(0.6, Math.floor(k * 100) / 100);
}

/* общий низ листа: красный штамп «дальше» */
const goBtn = (txt = t('дальше')) => '<button type="button" class="pp-stamp ss-go">' + esc(txt) + ' ▸</button>';

/* ── счётчик денег (свой: на одном узле подряд несколько — каждый продолжает с того, где стоит) ── */
function tween (el, from, to, ms, fmt) {
  if (!el) return;
  if (el._tw) cancelAnimationFrame(el._tw);
  if (calm() || ms <= 0) { el.textContent = fmt(to); el._v = to; return; }
  const t0 = performance.now();
  let lastTick = 0;
  const step = now => {
    const k = Math.min(1, (now - t0) / ms), v = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    if (v !== el._v) { el._v = v; el.textContent = fmt(v); if (now - lastTick > 70) { lastTick = now; PFX.replay(el, 'pp-tick'); } }
    if (k < 1 && el.isConnected) el._tw = requestAnimationFrame(step); else { el._tw = 0; el._v = to; el.textContent = fmt(to); }
  };
  el._tw = requestAnimationFrame(step);
}
const stopTween = (el, v, fmt) => { if (!el) return; if (el._tw) cancelAnimationFrame(el._tw); el._tw = 0; el._v = v; el.textContent = fmt(v); };

/* монетка летит из from в to (дугой): снаружи — по x, внутри — по y с «гравитацией» */
function flyCoin (from, to, delay = 0, bad = false) {
  if (calm() || !R || !from || !to) return;
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect ? to.getBoundingClientRect() : to;
  const x0 = a.left + a.width * (0.6 + Math.random() * 0.3), y0 = a.top + a.height / 2;
  const x1 = b.left + b.width * (to.fx ?? 0.5), y1 = b.top + b.height * (to.fy ?? 0.4);
  const c = document.createElement('i');
  c.className = 'ss-coin' + (bad ? ' bad' : '');
  c.style.left = x0 + 'px'; c.style.top = y0 + 'px';
  c.style.setProperty('--dx', Math.round(x1 - x0) + 'px');
  c.style.setProperty('--dy', Math.round(y1 - y0) + 'px');
  c.style.setProperty('--d', (delay / 1000).toFixed(2) + 's');
  c.innerHTML = '<b>₽</b>';
  document.body.appendChild(c);
  setTimeout(() => c.remove(), delay + 900);
}

/* ═════════════ 1. деньги: копилка наполняется ═════════════ */
const PIG_BODY = [[7, 4, 16, 16], [5, 6, 20, 12], [4, 8, 22, 8]];
const rects = (a, fill, cls = '') => a.map(([x, y, w, h]) => '<rect' + (cls ? ' class="' + cls + '"' : '') + ' x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + fill + '"/>').join('');
/* свинья — та же, что на хаде (shiftcash.js PIGGY), крупно; живот — окошко, в нём монеты поднимаются (--f 0…1) */
function pigSVG () {
  let coins = '';
  for (let y = 4; y < 22; y += 3) for (let x = 3 + (y % 2) * 2; x < 28; x += 4) coins += '<rect x="' + x + '" y="' + y + '" width="3" height="2" fill="#d99a1e"/>';
  return '<svg class="ss-pig" viewBox="0 -7 32 31" shape-rendering="crispEdges" aria-hidden="true">' +
    '<defs><clipPath id="ss-pigc">' + rects(PIG_BODY, '#000') + '</clipPath></defs>' +
    rects([[6, 3, 18, 18], [4, 5, 22, 14], [3, 7, 24, 10], [25, 8, 5, 7], [19, 1, 4, 4], [7, 19, 4, 5], [19, 19, 4, 5], [1, 9, 3, 2]], '#7a2e48') +
    rects([[7, 4, 16, 16], [5, 6, 20, 12], [4, 8, 22, 8], [20, 2, 2, 2], [8, 20, 2, 3], [20, 20, 2, 3]], '#f39ab4') +
    '<g clip-path="url(#ss-pigc)"><g class="ss-pig-fill"><rect x="0" y="4" width="32" height="20" fill="#ffd85e"/>' + coins + '<rect x="0" y="4" width="32" height="1" fill="#fff6b8"/></g></g>' +
    '<rect x="26" y="9" width="3" height="5" fill="#ffb3c8"/><rect x="27" y="10" width="1" height="1" fill="#7a2e48"/>' +
    '<rect x="27" y="12" width="1" height="1" fill="#7a2e48"/><rect x="8" y="6" width="6" height="2" fill="#ffd0de" opacity=".8"/>' +
    '<rect x="21" y="8" width="2" height="2" fill="#33210c"/><rect x="12" y="4" width="7" height="2" fill="#33210c"/>' +
    '<g class="ss-pig-drop"><rect x="13" y="-6" width="5" height="5" fill="#c99a2e"/><rect x="14" y="-6" width="3" height="4" fill="#ffd85e"/></g></svg>';
}
const pigLevel = w => Math.max(0, w) / (Math.max(0, w) + CFG.PIG_K);

function buildCash (s) {
  const m = s.money;
  return '<header class="pp-head"><span>' + esc(s.head) + '</span><b>' + esc(t('заработано')) + '</b></header>' +
    '<div class="ss-cash-grid"><div class="ss-cash-l">' +
      '<p class="ss-cap">' + esc(t('за смену')) + '</p><p class="ss-sum ' + (s.total < 0 ? 'pp-minus' : 'pp-plus') + '">' + esc(s.fmt(0)) + '</p>' +
      '<div class="ss-rows">' + s.rows.map(r => '<p class="pp-row"><span>' + esc(r.k) + '</span><i></i><b class="' + (r.n < 0 ? 'pp-minus' : r.n > 0 ? 'pp-plus' : 'cr-rc-no') + '">' +
        esc(r.v != null ? r.v : (r.n > 0 ? '+' : r.n < 0 ? '−' : '') + m(Math.abs(r.n))) + '</b></p>').join('') + '</div>' +
    '</div><div class="ss-cash-r">' + pigSVG() +
      '<p class="ss-wal"><span>' + esc(t('в копилке')) + '</span><b>' + esc(m(s.before)) + '</b></p>' +
    '</div></div>' + goBtn();
}
function animCash (sh, s) {
  const sum = sh.querySelector('.ss-sum'), rows = [...sh.querySelectorAll('.ss-rows .pp-row')], pig = sh.querySelector('.ss-pig'),
    fill = sh.querySelector('.ss-pig-fill'), wal = sh.querySelector('.ss-wal b'), go = sh.querySelector('.ss-go');
  const m = s.money, f0 = pigLevel(s.before), f1 = pigLevel(s.after);
  const setF = f => { if (fill) fill.style.setProperty('--f', f.toFixed(3)); };
  setF(f0);
  rows.forEach(r => { r.style.visibility = 'hidden'; });
  go.classList.add('ss-wait');
  const slot = { getBoundingClientRect: () => pig.getBoundingClientRect(), fx: 15.5 / 32, fy: 4 / 31 };
  let cur = 0;
  const T0 = 420;
  const fin = () => {                     // всё сразу
    clearT(); R.anim = null;
    rows.forEach(r => { r.style.visibility = ''; r.classList.remove('pp-print'); });
    stopTween(sum, s.total, s.fmt); stopTween(wal, s.after, m);
    if (fill) fill.classList.add('ss-now');
    setF(f1);
    go.classList.remove('ss-wait');
    R.armAt = performance.now() + 200;
  };
  R.anim = fin;
  rows.forEach((r, i) => later(T0 + i * CFG.ROW, () => {
    const row = s.rows[i];
    r.style.visibility = ''; PFX.replay(r, 'pp-print');
    blip('receipt', 620 + i * 60, 0.03, 'square', 0.035);
    if (row.n) {
      tween(sum, cur, cur + row.n, 280, s.fmt); cur += row.n;
      const n = row.n > 0 ? Math.min(5, 2 + Math.round(Math.log10(Math.max(10, row.n)) - 2)) : 1;
      for (let k = 0; k < n; k++) flyCoin(r.querySelector('b'), slot, k * 70, row.n < 0);
      if (row.n > 0) later(420, coin);
    }
  }));
  const tWal = T0 + rows.length * CFG.ROW + 250;
  later(tWal, () => {
    stopTween(sum, s.total, s.fmt);
    tween(wal, s.before, s.after, 800, m);
    setF(f1);
    if (s.total > 0) { PFX.replay(pig, 'ss-bump'); PFX.burst(pig, { kind: 'coins', n: 14, spread: 1 }); PFX.burst(sum, { kind: 'confetti', n: 34, spread: 1.5 }); }
  });
  later(tWal + 900, () => { R.anim = null; go.classList.remove('ss-wait'); PFX.slam(go); blip('stamp', 90, 0.09, 'square', 0.1); });
}

/* ═════════════ 2. «давай депнем?» ═════════════ */
const GAME_ART = {
  slot: () => '<i class="ss-dg ss-dg-slot"><b>7</b><b>7</b><b>7</b></i>',
  roulette: () => '<i class="ss-dg ss-dg-roul"><i></i></i>',
  tennis: () => '<i class="ss-dg ss-dg-ten"><i></i><b></b></i>',
};
function buildDep (s) {
  const m = s.money;
  return '<header class="pp-head"><span>' + esc(t('давай депнем?')) + '</span><b>×' + esc(s.mul) + '</b></header>' +
    '<p class="ss-say">' + esc(s.say) + '</p>' +
    '<div class="ss-ticket">' + (GAME_ART[s.game] || GAME_ART.slot)() + '<div class="ss-tk-t"><b>' + esc(s.name) + '</b>' +
      '<span>' + esc(t('выигрыш ×{k}', { k: s.mul })) + '</span></div></div>' +
    '<p class="pp-row"><span>' + esc(t('ставка — четверть смены')) + '</span><i></i><b>' + esc(m(s.stake)) + '</b></p>' +
    '<p class="pp-row"><span>' + esc(t('в копилке')) + '</span><i></i><b>' + esc(m(s.wallet)) + ' → ' + esc(m(s.wallet - s.stake)) + '</b></p>' +
    '<div class="ss-dep-go"><button type="button" class="pp-stamp ss-go">' + esc(t('ДЕП · {money}', { money: m(s.stake) })) + '</button>' +
    '<button type="button" class="pp-note ss-no">' + esc(t('не сейчас')) + ' ▸</button></div>';
}
function animDep (sh) {
  const tk = sh.querySelector('.ss-ticket');
  if (tk) { tk.style.setProperty('--pp-delay', '.25s'); PFX.replay(tk, 'pp-print'); }
}
function depGo (spin = true) {
  if (!R) return;
  const s = R.screens[R.i];
  if (!s || s.id !== 'dep' || !R.o.onDep) { next(); return; }
  const go = R.sheet && R.sheet.querySelector('.ss-go');
  if (go && spin) PFX.press(go);
  R.busy = true;                                    // пока открыто окно «депнуть» — листы не листаются
  const r = R;
  try {
    R.o.onDep(s.stake, () => { if (R === r) { R.busy = false; R.armAt = performance.now() + CFG.ARM; next(); } }, spin);
  } catch (e) { console.error('[shiftsteps]', e); R.busy = false; next(); }
}

/* ═════════════ 3. рейтинг смены: твоя строка въезжает ═════════════ */
const BOX = '<svg class="ss-box" viewBox="0 0 8 7" shape-rendering="crispEdges" aria-hidden="true"><rect x="0" y="1" width="8" height="6" fill="#33210c"/><rect x="1" y="2" width="6" height="4" fill="#f0a24a"/><rect x="1" y="0" width="6" height="2" fill="#33210c"/><rect x="2" y="3" width="4" height="1" fill="#c0392b"/></svg>';
function buildRank (s) {
  const m = s.money, rows = s.rows, me = rows.findIndex(r => r.me);
  const cap = s.phone ? Math.min(rows.length, CFG.ROWS_PH) : rows.length;
  const lo = Math.max(0, Math.min(me - (cap >> 1), rows.length - cap)), hi = lo + cap - 1;
  let body = '';
  for (let i = lo; i <= hi; i++) {
    const r = rows[i];
    body += '<div class="ss-rk' + (r.me ? ' me' : '') + (r.out ? ' out' : '') + (i === 0 ? ' first' : '') + '"><em>' + (i + 1) + '</em>' +
      (r.me ? '<i class="ss-you"></i>' : r.face ? '<img src="' + esc(r.face) + '" alt="">' : '<i class="ss-you" style="background:' + esc(r.hex || '#8a6b4e') + '"></i>') +
      '<b>' + (r.me ? '<span class="pp-mark">' + esc(r.n) + '</span>' : r.out ? '<s>' + esc(r.n) + '</s>' : esc(r.n)) + '</b>' +
      '<span class="ss-d">' + BOX + (r.d || 0) + '</span><span class="ss-m">' + esc(m(r.m)) + '</span></div>';
  }
  const P = s.prize, place = me + 1;
  let prize;
  if (P.win > 0) prize = '<p class="pp-row ss-prize"><span>' + esc(t('премия первому')) + '</span><i></i><b class="pp-plus">+' + esc(m(P.win)) + '</b></p>';
  else if (place === 1) prize = '<p class="pp-row ss-prize"><span>' + esc(t('премия первому')) + '</span><i></i><b class="cr-rc-no">' + esc(s.delivered ? t('только до конца') : t('без заказов — нет')) + '</b></p>';
  else prize = '<p class="pp-row ss-prize"><span>' + esc(t('премия первому — у {who}', { who: P.topGen || P.top })) + '</span><i></i><b>' + esc(m(P.sum)) + '</b></p>' +
    (P.gap > 0 ? '<p class="pp-hint ss-gap">' + esc(tn(P.gap, 'до первого места — {n} заказ|до первого места — {n} заказа|до первого места — {n} заказов')) + '</p>' : '');
  const seal = place === 1 ? '<div class="pp-seal pp-seal-green ss-seal">' + esc(t('1-е место')) + '</div>'
    : place === rows.length ? '<div class="pp-seal pp-seal-red ss-seal">' + esc(t('последний')) + '</div>' : '';
  return '<header class="pp-head"><span>' + esc(t('рейтинг смены')) + '</span><b>' + esc(t('место {i} из {n}', { i: place, n: rows.length })) + '</b></header>' +
    '<div class="ss-rkbox"><div class="ss-rk-list">' + body + '</div>' + seal + '</div>' + prize + goBtn();
}
function animRank (sh) {
  const rows = [...sh.querySelectorAll('.ss-rk')], meRow = sh.querySelector('.ss-rk.me'), seal = sh.querySelector('.ss-seal'),
    prize = [...sh.querySelectorAll('.ss-prize, .ss-gap')], go = sh.querySelector('.ss-go');
  rows.forEach(r => { if (r !== meRow) r.style.visibility = 'hidden'; });
  if (meRow) meRow.classList.add('ss-park');           // за краем листа справа — потом въезжает
  prize.forEach(p => { p.style.visibility = 'hidden'; });
  if (seal) seal.style.visibility = 'hidden';
  go.classList.add('ss-wait');
  const fin = () => {
    clearT(); R.anim = null;
    rows.forEach(r => { r.style.visibility = ''; r.classList.remove('pp-print', 'ss-park', 'ss-drive'); });
    prize.forEach(p => { p.style.visibility = ''; });
    if (seal) { seal.style.visibility = ''; seal.style.animation = 'none'; }
    go.classList.remove('ss-wait');
    R.armAt = performance.now() + 200;
  };
  R.anim = fin;
  const others = rows.filter(r => r !== meRow);
  others.forEach((r, i) => later(300 + i * 160, () => { r.style.visibility = ''; PFX.replay(r, 'pp-print'); blip('receipt', 600 + i * 50, 0.03, 'square', 0.03); }));
  const tMe = 300 + others.length * 160 + 200;
  later(tMe, () => { if (meRow) { meRow.classList.remove('ss-park'); PFX.replay(meRow, 'ss-drive'); } blip('whoosh', 420, 0.2, 'sawtooth', 0.04); });
  later(tMe + 700, () => {
    prize.forEach(p => { p.style.visibility = ''; PFX.replay(p, 'pp-print'); });
    if (seal) { seal.style.visibility = ''; PFX.replay(seal, 'pp-seal'); blip('seal', 150, 0.12, 'square', 0.12); }
    if (sh.dataset.tone === 'good') salute(sh);
    if (sh.querySelector('.ss-prize b.pp-plus')) { PFX.burst(sh.querySelector('.ss-prize b'), { kind: 'coins', n: 12 }); later(150, coin); }
  });
  later(tMe + 1100, () => { R.anim = null; go.classList.remove('ss-wait'); PFX.slam(go); blip('stamp', 90, 0.09, 'square', 0.1); });
}

/* ═════════════ 4. машина: акт осмотра ═════════════ */
/* детали в плане сверху (нос вверх; левый борт машины — слева): x, y, w, h в клетках 120 × 220 */
const ZONES = {
  bf: [20, 4, 80, 11], hood: [24, 17, 72, 44], trunk: [24, 160, 72, 38], br: [20, 201, 80, 11],
  dfl: [8, 70, 14, 42], drl: [8, 114, 14, 40], dfr: [98, 70, 14, 42], drr: [98, 114, 14, 40],
  fl: [24, 14, 18, 7], fr: [78, 14, 18, 7], rl: [24, 196, 18, 6], rr: [78, 196, 18, 6],
};
const GLASS = { f: [30, 62, 60, 16], b: [32, 143, 56, 14], l: [24, 82, 6, 58], r: [90, 82, 6, 58] };
const PART_NAME = {
  hood: N_('капот'), trunk: N_('багажник'), bf: N_('передний бампер'), br: N_('задний бампер'),
  dfl: N_('дверь'), drl: N_('дверь'), dfr: N_('дверь'), drr: N_('дверь'), fl: N_('фара'), fr: N_('фара'), rl: N_('фонарь'), rr: N_('фонарь'),
  mirror: N_('зеркало'), hub: N_('колпак'),
};
/* что с машиной сейчас: { parts: { key: 0…3 }, glass: { f, b, l, r: 0…2 }, dents, bumps, lost: [key] } — своя «Семёрка» и коробочные */
export function carState (g) {
  const out = { parts: {}, glass: {}, dents: 0, bumps: 0, lost: [] };
  const u = g && g.userData;
  if (!u) return out;
  const P = out.parts, up = (k, v) => { if (v > (P[k] || 0)) P[k] = v; };
  let ws = {};
  try { ws = wreckState(g) || {}; } catch (e) { ws = {}; }
  const MAP = { dl: 'dfl', dr: 'dfr', rdoor: 'trunk' };
  for (const k in ws) { const st = +String(ws[k]).split('/')[0] || 0; up(MAP[k] || k, st); }
  const L = u.lost || {};
  const LOST = { hood: 'hood', trunk: 'trunk', rdoor: 'trunk', doorR: 'dfl', doorL: 'dfr', bumperF: 'bf', bumperR: 'br', dl: 'dfl', dr: 'dfr' };
  const lost = new Set();
  for (const k in L) {
    const z = LOST[k] || (k in ZONES ? k : '');
    if (z) { up(z, 3); lost.add(z); } else if (/^mirror/i.test(k)) lost.add('mirror'); else if (/^hub/i.test(k)) lost.add('hub');
  }
  for (const k in P) if (P[k] >= 3) lost.add(k);
  if (u.lamps) for (const k of ['fl', 'fr', 'rl', 'rr']) { const c = u.lamps[k]; if (c) up(k, c.st ? 2 : c.cr ? 1 : 0); }
  if (u.cg && u.cg.panes) for (const p of u.cg.panes) out.glass[p.k] = Math.max(out.glass[p.k] || 0, Math.min(2, p.st || 0));
  out.dents = Math.max(0, u.dents || 0);
  out.bumps = Math.max(0, u.bumps || 0);            // удары по кузову (cardent.js hit) — у «Семёрки» вмятин коробочный кузов не считает
  out.lost = [...lost];
  return out;
}
function carSVG (c) {
  const P = c.parts || {}, G = c.glass || {};
  const cls = st => (st >= 3 ? 'off' : st === 2 ? 'hang' : st === 1 ? 'skew' : 'ok');
  let z = '';
  // колёса и кузов под деталями
  z += '<rect class="ss-wheel" x="2" y="38" width="10" height="26"/><rect class="ss-wheel" x="108" y="38" width="10" height="26"/>' +
    '<rect class="ss-wheel" x="2" y="156" width="10" height="26"/><rect class="ss-wheel" x="108" y="156" width="10" height="26"/>' +
    '<rect class="ss-body" x="10" y="10" width="100" height="198" rx="14"/><rect class="ss-roof" x="30" y="80" width="60" height="62" rx="4"/>';
  for (const k of ['hood', 'trunk', 'bf', 'br', 'dfl', 'drl', 'dfr', 'drr']) {
    const [x, y, w, h] = ZONES[k], st = P[k] || 0;
    z += '<rect class="ss-part ' + cls(st) + '" data-k="' + k + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="3"/>';
    if (st >= 3) z += '<path class="ss-x" d="M' + (x + 4) + ' ' + (y + 4) + 'L' + (x + w - 4) + ' ' + (y + h - 4) + 'M' + (x + w - 4) + ' ' + (y + 4) + 'L' + (x + 4) + ' ' + (y + h - 4) + '"/>';
  }
  for (const k in GLASS) {
    const [x, y, w, h] = GLASS[k], st = G[k] || 0;
    z += '<rect class="ss-glass g' + st + '" data-k="g' + k + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="2"/>';
    if (st === 1) z += '<path class="ss-crack" d="M' + (x + w * 0.3) + ' ' + y + 'l' + (w * 0.12) + ' ' + (h * 0.45) + 'l' + (-w * 0.08) + ' ' + (h * 0.25) + 'l' + (w * 0.2) + ' ' + (h * 0.3) +
      'M' + (x + w * 0.42) + ' ' + (y + h * 0.45) + 'l' + (w * 0.3) + ' ' + (-h * 0.2) + '"/>';
    if (st >= 2) z += '<path class="ss-x" d="M' + (x + 2) + ' ' + (y + 2) + 'L' + (x + w - 2) + ' ' + (y + h - 2) + 'M' + (x + w - 2) + ' ' + (y + 2) + 'L' + (x + 2) + ' ' + (y + h - 2) + '"/>';
  }
  for (const k of ['fl', 'fr', 'rl', 'rr']) {
    const [x, y, w, h] = ZONES[k], st = P[k] || 0;
    z += '<rect class="ss-lamp ' + (k[0] === 'r' ? 'rear ' : '') + 'l' + Math.min(3, st) + '" data-k="' + k + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="2"/>';
  }
  return '<svg class="ss-carsvg" viewBox="0 0 120 216" aria-hidden="true">' + z + '</svg>';
}
const listNames = keys => {
  const n = {};
  for (const k of keys) { const w = t(PART_NAME[k] || k); n[w] = (n[w] || 0) + 1; }
  return Object.entries(n).map(([w, c]) => (c > 1 ? w + ' ×' + c : w)).join(', ');
};
function buildCar (s) {
  const c = s.car, m = s.money, rows = [];
  const hearts = c.hpMax > 0 ? '<span class="ss-hp">' + '♥'.repeat(Math.max(0, Math.min(12, Math.ceil(c.hp)))) + '<i>' + '♥'.repeat(Math.max(0, Math.min(12, Math.ceil(c.hpMax) - Math.ceil(c.hp)))) + '</i></span>' : '';
  if (hearts) rows.push([t('сердца'), hearts, c.hp <= 0 ? 'pp-minus' : '', true]);
  if (c.cond != null) {
    const d = c.cond0 != null ? Math.round(c.cond - c.cond0) : 0;
    rows.push([t('мотор · ресурс'), Math.round(c.cond) + ' %' + (d < 0 ? ' (−' + Math.abs(d) + ')' : '') + ' · ' + Math.round(c.ceil) + ' %', c.cond < 50 ? 'pp-minus' : c.cond < 70 ? 'ss-warn' : '']);
  }
  if (c.km > 0.05) rows.push([t('проехал за смену'), t('{n} км', { n: c.kmText || String(Math.round(c.km * 10) / 10) }), '']);
  rows.push(c.dents ? [t('удары · вмятины'), (c.hits || 0) + ' · ' + c.dents, ''] : [t('удары'), String(c.hits || 0), c.hits ? '' : 'pp-plus']);
  const G = c.glass || {}, gc = Object.values(G).filter(v => v === 1).length, gb = Object.values(G).filter(v => v >= 2).length;
  if (gc || gb) rows.push([t('стёкла'), [gb ? tn(gb, '{n} разбито|{n} разбито|{n} разбито') : '', gc ? tn(gc, '{n} в трещинах|{n} в трещинах|{n} в трещинах') : ''].filter(Boolean).join(', '), gb ? 'pp-minus' : 'ss-warn']);
  const lamps = ['fl', 'fr', 'rl', 'rr'].filter(k => (c.parts[k] || 0) >= 2);
  if (lamps.length) rows.push([t('фары и фонари'), tn(lamps.length, '{n} разбит|{n} разбито|{n} разбито'), 'pp-minus']);
  const off = (c.lost || []).filter(k => !['fl', 'fr', 'rl', 'rr'].includes(k));
  if (off.length) rows.push([t('отлетело'), listNames(off), 'pp-minus']);
  const hang = Object.keys(c.parts).filter(k => c.parts[k] === 2 && ZONES[k] && !['fl', 'fr', 'rl', 'rr'].includes(k));
  if (hang.length) rows.push([t('болтается'), listNames(hang), 'ss-warn']);
  const repair = c.repair > 0
    ? '<p class="pp-row pp-total ss-fix"><span>' + esc(t('ремонт мотора у Дяди Жени')) + '</span><i></i><b class="pp-minus">' + esc(m(c.repair)) + '</b></p>'
    : '<p class="pp-row pp-total ss-fix"><span>' + esc(t('мотор')) + '</span><i></i><b class="pp-plus">' + esc(t('чинить нечего')) + '</b></p>';
  const body = c.dents || gc || gb || Object.values(c.parts).some(v => v > 0);
  const seal = carVerdict(c);
  return '<header class="pp-head"><span>' + esc(t('акт осмотра')) + '</span><b>' + esc(c.name || '') + '</b></header>' +
    '<div class="ss-car-grid"><div class="ss-car-l">' + carSVG(c) +
      '<p class="ss-legend"><span><i class="skew"></i>' + esc(t('перекос')) + '</span><span><i class="hang"></i>' + esc(t('болтается')) + '</span><span><i class="off"></i>' + esc(t('отлетело')) + '</span></p>' +
      '<div class="pp-seal pp-seal-' + seal[0] + ' pp-seal-inline ss-seal">' + esc(seal[1]) + '</div></div>' +
    '<div class="ss-car-r"><div class="ss-car-rows">' + rows.map(([k, v, cls, html]) => '<p class="pp-row"><span>' + esc(k) + '</span><i></i><b class="' + (cls || '') + '">' + (html ? v : esc(v)) + '</b></p>').join('') + '</div>' +
      repair + (body ? '<p class="pp-hint">' + esc(t('кузов, стёкла и фары к новой смене соберут заново — даром')) + '</p>' : '') +
      '</div></div>' + goBtn(t('итог'));
}
function animCar (sh) {
  const parts = [...sh.querySelectorAll('.ss-part:not(.ok), .ss-glass:not(.g0), .ss-lamp:not(.l0)')], rows = [...sh.querySelectorAll('.ss-car-rows .pp-row, .ss-fix, .ss-car-r > .pp-hint')],
    seal = sh.querySelector('.ss-seal'), go = sh.querySelector('.ss-go');
  rows.forEach(r => { r.style.visibility = 'hidden'; });
  parts.forEach(p => p.classList.add('ss-hide'));
  if (seal) seal.style.visibility = 'hidden';
  go.classList.add('ss-wait');
  const fin = () => {
    clearT(); R.anim = null;
    rows.forEach(r => { r.style.visibility = ''; r.classList.remove('pp-print'); });
    parts.forEach(p => p.classList.remove('ss-hide', 'ss-pop'));
    if (seal) { seal.style.visibility = ''; seal.style.animation = 'none'; }
    go.classList.remove('ss-wait');
    R.armAt = performance.now() + 200;
  };
  R.anim = fin;
  parts.forEach((p, i) => later(350 + i * 120, () => { p.classList.remove('ss-hide'); PFX.replay(p, 'ss-pop'); blip('ui-click', 300 - Math.min(i, 8) * 15, 0.05, 'square', 0.05); }));
  const t1 = 350 + parts.length * 120 + 100;
  rows.forEach((r, i) => later(t1 + i * 110, () => { r.style.visibility = ''; PFX.replay(r, 'pp-print'); blip('receipt', 620 + i * 50, 0.03, 'square', 0.03); }));
  const t2 = t1 + rows.length * 110 + 200;
  later(t2, () => { if (seal) { seal.style.visibility = ''; PFX.replay(seal, 'pp-seal'); blip('seal', 150, 0.12, 'square', 0.12); } });
  later(t2 + 350, () => { R.anim = null; go.classList.remove('ss-wait'); PFX.slam(go); blip('stamp', 90, 0.09, 'square', 0.1); });
}

const BUILD = { cash: buildCash, dep: buildDep, rank: buildRank, car: buildCar };
const ANIM = { cash: animCash, dep: animDep, rank: animRank, car: animCar };

export const DEBUG = {
  CFG, ok, alt, skip, carState,
  get state () { return R ? { on: true, i: R.i, id: R.screens[R.i] ? R.screens[R.i].id : 'end', ids: R.screens.map(s => s.id), anim: !!R.anim, busy: R.busy } : { on: false }; },
};
