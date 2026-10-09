/* Весь город открыт (карьера с районами). Правила — docs/CAREER.md «Весь город открыт»,
   числа — econ.js CITY (дальность, премия за дальний), режим и «твой район» — districts.js
   (city / setCity / mine).

   1) Праздник: открыты все районы — один раз за всё время (dlv-city-party) экран «ты открыл весь
      город!»: салют и конфетти на canvas, фанфары, Толик управляющий одной фразой, внизу «ура!».
      Показывается перед следующей сменой или в меню (beforeShift / check), сразу — после тестовой
      кнопки «открыть все районы» в настройках.
   2) Перед каждой сменой — выбор (picker): «весь город» или любая из 8 пиццерий. «Весь город» —
      заказы во всех районах от пиццерии, где стоишь; после заказа — назад в ближайшую (game.js
      backToBase → nearest); за дальние — премия (ECON.cityFar, orders.js setup).

     CITY.init(api)          — из game.js: { Store, Snd, money, pizzerias(), routeLen(x1, z1, x2, z2) }
     CITY.beforeShift(go)    — «на смену» / «ещё раз»: всё открыто — праздник (если не было) и выбор,
                               потом go(); true — перехватили (go позовут сами), false — сразу смена;
                               с экрана конца смены выбора нет — тот же район, что в прошлую смену
     CITY.check(done?)       — меню: всё открыто, а праздника не было — показать
     CITY.party(done?)       — праздник (отладка — показать ещё раз)
     CITY.picker(done, start) — выбор, где работать; done(true) — выбрали, done(false) — «назад»
     CITY.nearest(x, z)      — номер ближайшей по дорогам пиццерии (режим «весь город»)
     CITY.unlockAll()        — ТЕСТ: открыть все районы (кнопка в настройках; в релизной
                               сборке её нет, только с ?debug — game.js testTools)
     CITY.root() / CITY.back() — открытое окно (геймпад, клавиатура: career.js padRoot / back) */
import './cityopen.css';
import { t, N_ } from '../i18n/index.js';
import * as DIST from './districts.js';
import * as CHAT from './chat.js';
import * as DP from './distpick.js';             // выбор перед сменой — карусель карточек районов
import { CITY as C, DISTRICT, cityFar } from './econ.js';
import { keyHTML } from '../input/glyphs.js';     // «[A] ура!» — значок по вводу

const SEEN = 'dlv-city-party';
let A = null, el = null, PARTY = null;
const $c = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const host = () => document.getElementById('game') || document.body;

export function init (api) { A = api; repair(); }

/* ── ложное «весь город открыт» (04.10.2026) ──
   В v0.3.0 тестовая кнопка «открыть все районы» стояла в настройках релиза, сразу под «проверить
   обновления»; на Деке настройки не влезали в экран, и её жали вместо обновления: все районы
   «открывались» и показывался праздник. Честно открыть все районы нельзя быстрее, чем за сумму
   OPEN_OLD смен (26; сейчас — 40), а «смен» (dlv-shifts) у такого сохранения меньше. Тогда откатываем:
   районы — заново из числа смен (districts.js rebuild), праздник и «весь город» — снять.
   И просто: районы открыты не все, а праздник отмечен или включён «весь город» — снять.
   С ?debug и в dev (A.debug — там есть тестовая кнопка) не трогаем. force — проверка в probe. */
const MIN_ALL = () => (DISTRICT.OPEN_OLD || DISTRICT.OPEN).reduce((a, b) => a + b, 0);
export function repair (force) {
  if (!A || !DIST.has() || (A.debug && !force)) return null;
  const shifts = +A.Store.get('dlv-shifts', 0) || 0;
  let fixed = '';
  if (DIST.allOpen() && shifts < MIN_ALL()) { DIST.rebuild(shifts); fixed = 'rebuild'; }
  if (!DIST.allOpen()) {
    if (+A.Store.get(SEEN, 0)) { A.Store.set(SEEN, 0); fixed = fixed || 'seen'; }
    if (+A.Store.get('dlv-city-mode', 0)) { DIST.setCity(false); A.Store.set('dlv-city-mode', 0); fixed = fixed || 'city'; }
  }
  if (fixed) A.Store.flush && A.Store.flush();
  return fixed || null;
}
export const seen = () => !!(A && +A.Store.get(SEEN, 0));
const ready = () => !!A && DIST.has() && DIST.allOpen();

/* Толик: коротко и смешно; во взрослой — своя строка в пуле */
const LINES = [
  N_('всё, город кончился. дальше только тайга и лоси, а им пицца не положена. теперь сам решай, где работать'),
  N_('я позвонил директору. он сказал: «у нас что, город закончился?» да, Палыч. закончился. весь твой'),
  N_('открыл весь город. мэр нервничает: у него районов меньше, чем у тебя'),
];
const pick = a => a[Math.floor(Math.random() * a.length)];

/* ── 1) праздник ── */
export function party (done) {
  if (!A) { if (done) done(); return; }
  if (PARTY) PARTY.close(false);
  A.Store.set(SEEN, 1);
  A.Store.flush && A.Store.flush();
  const root = $c('div'); root.id = 'cr-city';
  const cv = $c('canvas', 'cy-fx');
  const stage = $c('div', 'cy-stage');
  const ava = CHAT.avatar(128);
  const n = DIST.count();
  stage.innerHTML =
    '<div class="cy-title">' + esc(t('ты открыл весь город!')) + '</div>' +
    '<div class="cy-sub">' + esc(t('все {n} районов Солнечного — твои', { n })) + '</div>' +
    '<div class="en-tolik cy-tolik">' + (ava ? '<img alt="" src="' + esc(ava) + '">' : '<i></i>') +
      '<div class="en-tb"><b>' + esc(t('Толик управляющий')) + '</b><p>' + esc(t(pick(LINES))) + '</p></div></div>' +
    '<ul class="cy-perks">' +
      '<li>' + esc(t('перед сменой — выбор: любая пиццерия или весь город сразу')) + '</li>' +
      '<li>' + esc(t('весь город: заказы во всех районах, за дальние — премия до +{max}', { max: A.money(C.FAR_MAX) })) + '</li>' +
    '</ul>';
  const go = $c('button', 'dep-go cy-go');
  go.type = 'button';
  go.innerHTML = keyHTML('ok') + esc(t('ура!'));
  go.setAttribute('data-pad-main', '');
  root.append(cv, stage, go);
  host().appendChild(root);

  /* салют и конфетти: частицы на canvas, ~7 с залпов, потом только конфетти */
  const x = cv.getContext('2d');
  const P = [];                                   // { x, y, vx, vy, life, max, col, kind: 'spark' | 'conf' | 'rocket', w, h, a, va }
  const COLS = ['#ffd85e', '#f0522a', '#5ee0ff', '#8dff6a', '#ff7ad9', '#fff3d6'];
  let W = 0, H = 0, raf = 0, t0 = performance.now(), last = t0, nextVolley = 0, closed = false;
  const fit = () => { const r = root.getBoundingClientRect(), k = Math.min(2, window.devicePixelRatio || 1); W = r.width; H = r.height; cv.width = Math.max(1, W * k); cv.height = Math.max(1, H * k); x.setTransform(k, 0, 0, k, 0, 0); };
  fit();
  const boom = () => { if (A.Snd && A.Snd.fx) try { A.Snd.fx('firework', s => { s.noise(0.25, 0.18); s.blip(160 + Math.random() * 80, 0.18, 'triangle', 0.1); }); } catch (e) { /* — */ } };
  const rocket = () => P.push({ kind: 'rocket', x: W * (0.15 + Math.random() * 0.7), y: H + 10, vx: (Math.random() - 0.5) * 60, vy: -(H * (0.9 + Math.random() * 0.35)), life: 0, max: 0.75 + Math.random() * 0.35, col: pick(COLS) });
  const burst = (bx, by, col) => {
    const k = 60 + (Math.random() * 40 | 0), sp = 150 + Math.random() * 150;
    for (let i = 0; i < k; i++) { const a = i / k * Math.PI * 2 + Math.random() * 0.2, v = sp * (0.6 + Math.random() * 0.5);
      P.push({ kind: 'spark', x: bx, y: by, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 1 + Math.random() * 0.6, col: Math.random() < 0.25 ? '#fff3d6' : col }); }
    boom();
  };
  const confetti = k => { for (let i = 0; i < k; i++) P.push({ kind: 'conf', x: Math.random() * W, y: -20 - Math.random() * H * 0.5, vx: (Math.random() - 0.5) * 40, vy: 60 + Math.random() * 90, life: 0, max: 99, col: pick(COLS), w: 5 + Math.random() * 6, h: 3 + Math.random() * 4, a: Math.random() * 6, va: (Math.random() - 0.5) * 10 }); };
  confetti(140);
  // фанфары: до-ми-соль-до, потом аккорд
  if (A.Snd && A.Snd.fx) try { A.Snd.fx('fanfare', s => [[523, 0], [659, 140], [784, 280], [1047, 430], [784, 640], [1047, 760]].forEach(([f, ms]) => setTimeout(() => { if (!closed) s.blip(f, ms >= 640 ? 0.35 : 0.14, 'square', 0.12); }, ms))); } catch (e) { /* — */ }
  setTimeout(() => { if (!closed && A.Snd && A.Snd.coin) A.Snd.coin(); }, 1000);
  const frame = now => {
    const dt = Math.min(0.05, (now - last) / 1000), el2 = (now - t0) / 1000;
    last = now;
    if (el2 < 7 && now >= nextVolley) { rocket(); if (Math.random() < 0.5) rocket(); nextVolley = now + 300 + Math.random() * 350; }
    if (el2 < 12 && P.filter(p => p.kind === 'conf').length < 90) confetti(4);
    x.clearRect(0, 0, W, H);
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.life += dt;
      if (p.kind === 'rocket') {
        p.vy += 420 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        x.fillStyle = '#fff3d6'; x.fillRect(p.x - 1.5, p.y - 4, 3, 8);
        if (p.life >= p.max || p.vy > -40) { burst(p.x, p.y, p.col); P.splice(i, 1); }
        continue;
      }
      if (p.kind === 'spark') {
        p.vx *= 1 - 1.6 * dt; p.vy = p.vy * (1 - 1.6 * dt) + 90 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        const k = 1 - p.life / p.max;
        if (k <= 0) { P.splice(i, 1); continue; }
        const r = 2 + 2 * k; x.globalAlpha = k; x.fillStyle = p.col; x.fillRect(p.x - r, p.y - r, r * 2, r * 2); x.globalAlpha = 1;
        continue;
      }
      p.x += (p.vx + Math.sin(p.life * 3 + p.a) * 30) * dt; p.y += p.vy * dt; p.a += p.va * dt;
      if (p.y > H + 20) { P.splice(i, 1); continue; }
      x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.col; x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.a * 1.7))); x.restore();
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  addEventListener('resize', fit);

  const guard = performance.now() + 700;        // не пролистать случайным нажатием, которое открыло экран
  const close = call => {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    removeEventListener('resize', fit);
    root.classList.add('out');
    setTimeout(() => root.remove(), 200);
    if (PARTY && PARTY.el === root) PARTY = null;
    if (call && done) { try { done(); } catch (e) { console.error('[cityopen] done', e); } }
    // управление — назад меню: подсветка геймпада и клавиатуры сброшена, фокус на карточке меню
    if (A.refocus) setTimeout(() => { try { A.refocus(); } catch (e) { /* — */ } }, 0);
  };
  go.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); if (performance.now() < guard) return; close(true); });
  // тап / клик где угодно по празднику (после защитных 0,7 с) — тоже «ура!»
  root.addEventListener('click', () => { if (performance.now() >= guard) close(true); });
  PARTY = { el: root, close, ok: () => { if (performance.now() >= guard) close(true); } };
  requestAnimationFrame(() => root.classList.add('on'));
}

/* ── 2) выбор перед сменой: весь город или пиццерия — карусель карточек (distpick.js) ── */
let PICK_DONE = null, PICK_ON = false;
export function picker (done, start = true) {
  if (!ready()) { if (done) done(true); return; }
  PICK_DONE = done || null; PICK_ON = true;
  const city = DIST.city(), cur = DIST.cur();
  const btn = start ? t('на смену здесь') : t('работать здесь');
  const far = [2000, 3000, 4000].map(m => '+' + A.money(cityFar(m))).join(' / ');
  DP.open({
    title: start ? t('где работаешь эту смену?') : t('где работаешь'),
    cards: [DP.cityCard({ btn, on: city, far }), ...DP.districtCards({ btn, cur, noCur: city })],
    idx: city ? 0 : cur + 1,
    onFlip: () => { if (A.padClear) A.padClear(); if (A.kbClear) A.kbClear(); },
    onPick: k => { PICK_ON = false; choose(k); },
    onBack: () => { PICK_ON = false; closePick(false); },
  });
}
/** выбрать: 'city' — весь город, '0'…'7' — пиццерия района */
export function choose (k) {
  if (k === 'city') DIST.setCity(true);
  else { DIST.setCity(false); DIST.set(+k); }
  if (A.Snd && A.Snd.coin) A.Snd.coin();
  closePick(true);
}
function closePick (ok) {
  if (PICK_ON) { PICK_ON = false; DP.close(); }
  const cb = PICK_DONE; PICK_DONE = null;
  if (cb) cb(ok);
}

/* «на смену» / «ещё раз»: всё открыто — сначала праздник (один раз), потом выбор, потом смена */
export function beforeShift (go) {
  if (!ready()) return false;
  // с экрана конца смены («на новую смену») — без выбора: тот же район или весь город, что в прошлую смену
  // (сменить — в меню). Праздник, если его ещё не было, — всё равно сначала (UI-REVIEW.md № 7, П1)
  const fromEnd = !!(document.getElementById('over') && !document.getElementById('over').hidden);
  if (fromEnd && seen()) return false;
  const pickNow = () => picker(ok => { if (ok) go(); });
  if (!seen()) party(pickNow);
  else pickNow();
  return true;
}
/* меню: открыто всё, праздника ещё не было — показать сейчас */
export function check (done) {
  if (!ready() || seen() || PARTY) return false;
  party(done);
  return true;
}

/* ближайшая по дорогам пиццерия (весь город): три ближних по прямой — по дорогам */
export function nearest (px, pz) {
  const L = A ? A.pizzerias() : [];
  const c = L.map((P, i) => (P ? { i, d: Math.hypot(P.x - px, P.z - pz), P } : null)).filter(Boolean).sort((a, b) => a.d - b.d).slice(0, 3);
  if (!c.length) return DIST.cur();
  let best = c[0], bl = Infinity;
  for (const q of c) { const l = A.routeLen ? A.routeLen(px, pz, q.P.x, q.P.z) : q.d; if (l < bl) { bl = l; best = q; } }
  return best.i;
}

/* ТЕСТ: открыть все районы (кнопка в настройках; в релизной сборке её нет, только с ?debug — game.js testTools) */
export function unlockAll () {
  if (!DIST.has()) return false;
  DIST.DEBUG.unlockAll();
  return true;
}

export function root () {
  if (PARTY && !PARTY.el.isConnected) PARTY = null;   // окно уже снято — меню не держим
  return PARTY ? PARTY.el : PICK_ON && DP.root() ? DP.root() : null;
}
export function back () {
  if (PARTY) { PARTY.ok(); return true; }
  if (PICK_ON && DP.root()) return DP.back();
  return false;
}
export const DEBUG = { party, picker, choose, check, beforeShift, nearest, unlockAll, seen, cityFar, root, repair,
  reset () { if (A) { A.Store.set(SEEN, 0); DIST.setCity(false); } } };
