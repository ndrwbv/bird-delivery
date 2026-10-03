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
                               потом go(); true — перехватили (go позовут сами), false — сразу смена
     CITY.check(done?)       — меню: всё открыто, а праздника не было — показать
     CITY.party(done?)       — праздник (отладка — показать ещё раз)
     CITY.picker(done, start) — выбор, где работать; done(true) — выбрали, done(false) — «назад»
     CITY.nearest(x, z)      — номер ближайшей по дорогам пиццерии (режим «весь город»)
     CITY.unlockAll()        — ТЕСТ: открыть все районы (кнопка в настройках — перед публикацией
                               убрать или спрятать за ?debug, см. game.js renderSettings)
     CITY.root() / CITY.back() — открытое окно (геймпад, клавиатура: career.js padRoot / back) */
import './cityopen.css';
import { t, N_ } from '../i18n/index.js';
import * as DIST from './districts.js';
import * as CHAT from './chat.js';
import { CITY as C, DISTRICT, cityFar } from './econ.js';

const SEEN = 'dlv-city-party';
let A = null, el = null, pk = null, PARTY = null;
const $c = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const host = () => document.getElementById('game') || document.body;
const pct = k => '+' + Math.round((k - 1) * 100) + ' %';

export function init (api) { A = api; }
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
  go.textContent = t('ура!');
  root.append(cv, stage, go);
  host().appendChild(root);

  /* салют и конфетти: частицы на canvas, ~7 с залпов, потом только конфетти */
  const x = cv.getContext('2d');
  const P = [];                                   // { x, y, vx, vy, life, max, col, kind: 'spark' | 'conf' | 'rocket', w, h, a, va }
  const COLS = ['#ffd85e', '#f0522a', '#5ee0ff', '#8dff6a', '#ff7ad9', '#fff3d6'];
  let W = 0, H = 0, raf = 0, t0 = performance.now(), last = t0, nextVolley = 0, closed = false;
  const fit = () => { const r = root.getBoundingClientRect(), k = Math.min(2, window.devicePixelRatio || 1); W = r.width; H = r.height; cv.width = Math.max(1, W * k); cv.height = Math.max(1, H * k); x.setTransform(k, 0, 0, k, 0, 0); };
  fit();
  const blip = (f, d, ty, v) => { if (A.Snd) try { A.Snd.blip(f, d, ty, v); } catch (e) { /* — */ } };
  const boom = () => { if (A.Snd && A.Snd.noise) try { A.Snd.noise(0.25, 0.18); } catch (e) { /* — */ } blip(160 + Math.random() * 80, 0.18, 'triangle', 0.1); };
  const rocket = () => P.push({ kind: 'rocket', x: W * (0.15 + Math.random() * 0.7), y: H + 10, vx: (Math.random() - 0.5) * 60, vy: -(H * (0.9 + Math.random() * 0.35)), life: 0, max: 0.75 + Math.random() * 0.35, col: pick(COLS) });
  const burst = (bx, by, col) => {
    const k = 44 + (Math.random() * 30 | 0), sp = 120 + Math.random() * 120;
    for (let i = 0; i < k; i++) { const a = i / k * Math.PI * 2 + Math.random() * 0.2, v = sp * (0.6 + Math.random() * 0.5);
      P.push({ kind: 'spark', x: bx, y: by, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 1 + Math.random() * 0.6, col: Math.random() < 0.25 ? '#fff3d6' : col }); }
    boom();
  };
  const confetti = k => { for (let i = 0; i < k; i++) P.push({ kind: 'conf', x: Math.random() * W, y: -20 - Math.random() * H * 0.5, vx: (Math.random() - 0.5) * 40, vy: 60 + Math.random() * 90, life: 0, max: 99, col: pick(COLS), w: 5 + Math.random() * 6, h: 3 + Math.random() * 4, a: Math.random() * 6, va: (Math.random() - 0.5) * 10 }); };
  confetti(140);
  // фанфары: до-ми-соль-до, потом аккорд
  [[523, 0], [659, 140], [784, 280], [1047, 430], [784, 640], [1047, 760]].forEach(([f, ms]) => setTimeout(() => { if (!closed) blip(f, ms >= 640 ? 0.35 : 0.14, 'square', 0.12); }, ms));
  setTimeout(() => { if (!closed && A.Snd && A.Snd.coin) A.Snd.coin(); }, 1000);
  const frame = now => {
    const dt = Math.min(0.05, (now - last) / 1000), el2 = (now - t0) / 1000;
    last = now;
    if (el2 < 7 && now >= nextVolley) { rocket(); if (Math.random() < 0.5) rocket(); nextVolley = now + 380 + Math.random() * 420; }
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
        x.globalAlpha = k; x.fillStyle = p.col; x.fillRect(p.x - 2, p.y - 2, 4, 4); x.globalAlpha = 1;
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
    if (call && done) done();
  };
  go.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); if (performance.now() < guard) return; close(true); });
  PARTY = { el: root, close, ok: () => { if (performance.now() >= guard) close(true); } };
  requestAnimationFrame(() => root.classList.add('on'));
}

/* ── 2) выбор перед сменой: весь город или пиццерия ── */
function pickBox () {
  if (pk) return pk;
  pk = $c('div'); pk.id = 'cr-cityp'; pk.hidden = true;
  pk.innerHTML = '<div class="crm-dbox"><div class="crm-dt"></div><div class="crm-dl"></div><div class="crm-dn"></div><button type="button" class="crm-dclose"></button></div>';
  host().appendChild(pk);
  return pk;
}
let PICK_DONE = null;
export function picker (done, start = true) {
  if (!ready()) { if (done) done(true); return; }
  pickBox();
  PICK_DONE = done || null;
  const city = DIST.city(), cur = DIST.cur();
  pk.querySelector('.crm-dt').textContent = start ? t('где работаешь эту смену?') : t('где работаешь');
  pk.querySelector('.crm-dn').textContent = t('весь город: возвращаешься в ближайшую пиццерию, за дальние (от {km} км по дорогам) — премия', { km: String(C.FAR_FROM / 1000).replace('.', ',') });
  pk.querySelector('.crm-dclose').textContent = t('назад');
  const row = (key, em, name, sub, on) => '<button type="button" class="crm-di' + (key === 'city' ? ' cy-all' : '') + (on ? ' cur' : '') + '" data-k="' + key + '"' + (on ? ' autofocus' : '') + '>' +
    '<em>' + em + '</em><b>' + esc(name) + '</b><span>' + esc(sub) + '</span></button>';
  const far = [2000, 3000, 4000].map(m => '+' + A.money(cityFar(m))).join(' / ');
  pk.querySelector('.crm-dl').innerHTML =
    row('city', '★', t('весь город'), t('заказы во всех районах · машина {s} · оплата {p} · за 2 / 3 / 4 км: {far}', { s: pct(C.SPEED), p: pct(C.PAY), far }), city) +
    DIST.list().map((d, i) => row(String(i), String(i + 1), t('пиццерия · {name}', { name: t(d.name) }),
      i ? t('заказы только в районе · машина {s} · оплата {p}', { s: pct(DISTRICT.SPEED[i]), p: pct(DISTRICT.PAY[i]) }) : t('заказы только в районе · маленький, всё рядом'), !city && i === cur)).join('');
  pk.querySelectorAll('.crm-di').forEach(b => b.addEventListener('click', () => choose(b.dataset.k)));
  pk.querySelector('.crm-dclose').onclick = () => closePick(false);
  pk.onclick = e => { if (e.target === pk) closePick(false); };
  pk.hidden = false;
}
/** выбрать: 'city' — весь город, '0'…'7' — пиццерия района */
export function choose (k) {
  if (k === 'city') DIST.setCity(true);
  else { DIST.setCity(false); DIST.set(+k); }
  if (A.Snd && A.Snd.coin) A.Snd.coin();
  closePick(true);
}
function closePick (ok) {
  if (!pk || pk.hidden) return;
  pk.hidden = true;
  const cb = PICK_DONE; PICK_DONE = null;
  if (cb) cb(ok);
}

/* «на смену» / «ещё раз»: всё открыто — сначала праздник (один раз), потом выбор, потом смена */
export function beforeShift (go) {
  if (!ready()) return false;
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

/* ТЕСТ: открыть все районы (кнопка в настройках). Перед публикацией — убрать или спрятать за ?debug */
export function unlockAll () {
  if (!DIST.has()) return false;
  DIST.DEBUG.unlockAll();
  return true;
}

export const root = () => (PARTY ? PARTY.el : pk && !pk.hidden ? pk : null);
export function back () {
  if (PARTY) { PARTY.ok(); return true; }
  if (pk && !pk.hidden) { closePick(false); return true; }
  return false;
}
export const DEBUG = { party, picker, choose, check, beforeShift, nearest, unlockAll, seen, cityFar, root,
  reset () { if (A) { A.Store.set(SEEN, 0); DIST.setCity(false); } } };
