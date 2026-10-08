/* ─────────────── Вступление первого запуска («как в ГТА») ───────────────
   С 08.10.2026 само не показывается (IDEAS № 9: первая минута учит подсказками, hints.js) —
   только с ?intro, для съёмки. Тогда: самая первая смена за всё время (учебный заказ Степана
   ещё не отвезён, флага 'dlv-intro' нет): перед накладной — короткая катсцена. Чёрные полосы сверху и
   снизу, камера летает, крупные косые плашки и субтитры от первого лица:
     1) пиццерия            — «вот пиццерия — сюда я устроился курьером»;
     2) перелёт к Степану   — сидит на лавочке с кальяном (в детской — самовар), облака;
     3) перелёт к машине    — на хаде мигают сердца и кольцо нитро вокруг радара;
     4) сердца              — директор Валерий Палыч (лицо в облачке у сердец, стрелка на них):
                              «а это твои хп — врезаешься куда-то, теряешь сердце (легонько —
                              половинку)»; на хаде гаснет сердце, потом половинка (только показ);
     5) капот крупно        — дым из-под капота, машина кашляет: «а ещё она может ломаться».
   Всего ~25 с: план с репликой висит не меньше, чем её прочитать (readTime в dialog.js:
   1,5 с + 0,06 с на букву, не меньше 3 с). Enter, пробел, клик, A — следующий план;
   «пропустить», Esc, B, Start — сразу к накладной. Мир стоит, как в катсценах story.js (дышат только дым и Степан);
   камера и угол обзора после — прежние. Флаг ставится, когда вступление кончилось
   или его пропустили; «сбросить прогресс» стирает 'dlv-intro' — покажется снова.

     FIRST.init(api)          — один раз из game.js
     FIRST.wants(order)       — показать ли вступление перед этой накладной
     FIRST.play(order, done)  — запустить; done() — когда кончилось или пропустили
     FIRST.frame(dt)          — каждый кадр; true — идёт вступление (мир стоит)
     FIRST.on(), FIRST.next(), FIRST.skip() — для геймпада (game.js padStep)
   api: THREE, cam, V, S, Store, Snd, ADULT, car(), pizza(), brand(), carName(),
        puff, camClear, groundH, guestStep, hud, hearts */
import './intro.css';
import { t } from '../i18n/index.js';
import { makePerson, faceDataURL } from './people.js';
import { BOSS } from './orders.config.js';
import { readTime } from './dialog.js';

const KEY = 'dlv-intro';
let A = null, P = null, L = null, T1 = null, T2 = null;
const CUT = { on: false, t: 0, i: -1, segs: [], done: null, el: null, fov0: 60, guest: null, carY: 0, coughT: [], puffT: 0, shake: 0, swallow: '', side: 1, demo: -1 };
let BOSS_P = null;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = k => k * k * k * (k * (k * 6 - 15) + 10);           // мягко трогается и мягко встаёт
const lerp = (a, b, k) => a + (b - a) * k;

export function init (api) {
  A = api;
  P = new A.THREE.Vector3(); L = new A.THREE.Vector3();
  T1 = new A.THREE.Vector3(); T2 = new A.THREE.Vector3();
  if (typeof window !== 'undefined') window.setTimeout(() => { if (window.__dlv) window.__dlv.FIRST = DEBUG; }, 0);
}
export const on = () => CUT.on;
export function wants (order) {
  if (!A || CUT.on || !order || !order.tut || A.S.ride) return false;
  // с 08.10.2026 (IDEAS № 9 «первая минута без стены текста») само не идёт: учат подсказки делом
  // (hints.js). Осталось для съёмки роликов — только с ?intro
  if (!new URLSearchParams(location.search).has('intro')) return false;
  return !A.Store.get(KEY, 0);
}

/* ─── планы камеры: pose(k, P, L), k — 0…1 за время плана ─── */
function pizzaShot () {
  const Z = A.pizza();
  let nx = Z.wx - Z.bx, nz = Z.wz - Z.bz, l = Math.hypot(nx, nz);
  if (l < 0.5) { nx = Z.x - Z.bx; nz = Z.z - Z.bz; l = Math.hypot(nx, nz) || 1; }
  nx /= l; nz /= l;
  const tx = nz, tz = -nx, wy = Z.wy;
  // откуда фасад видно: камера не в доме на всём пролёте
  let D = 0, s = 1;
  find: for (const d of [27, 22, 17]) for (const sd of [1, -1]) {
    let ok = true;
    for (let k = 0; k <= 1; k += 0.25) {
      const x = Z.wx + nx * (d - 7 * k) + tx * (-11 + 17 * k) * sd, z = Z.wz + nz * (d - 7 * k) + tz * (-11 + 17 * k) * sd;
      if (!A.camClear(x, z)) { ok = false; break; }
    }
    if (ok) { D = d; s = sd; break find; }
  }
  const high = !D;                                  // всюду стены — смотрим поверх крыш
  if (high) D = 26;
  return (k, p, lk) => {
    const e = ease(k), d = D - 7 * e, o = (-11 + 17 * e) * s;
    const x = Z.wx + nx * d + tx * o, z = Z.wz + nz * d + tz * o;
    p.set(x, Math.max(lerp(wy + 9, wy + 4.5, e) + (high ? 22 : 0), A.groundH(x, z) + 2.5), z);
    lk.set(Z.wx + tx * o * 0.15, wy + 2.4, Z.wz + tz * o * 0.15);
  };
}
/* облёт вокруг точки (x, z) на высоте y0: угол от a0 до a1 (от «лица» f), радиус, высота */
function orbit (cx, cz, y0, fh, a0, a1, r0, r1, h0, h1, ly, fwd) {
  const fx = Math.sin(fh), fz = Math.cos(fh), rx = Math.cos(fh), rz = -Math.sin(fh);
  return (k, p, lk) => {
    const e = ease(k), a = lerp(a0, a1, e), r = lerp(r0, r1, e);
    const x = cx + (fx * Math.cos(a) + rx * Math.sin(a)) * r, z = cz + (fz * Math.cos(a) + rz * Math.sin(a)) * r;
    p.set(x, Math.max(y0 + lerp(h0, h1, e), A.groundH(x, z) + 0.8), z);
    lk.set(cx + fx * fwd, y0 + ly, cz + fz * fwd);
  };
}
/* сторона облёта, где камера не в стене: проверяем весь пролёт */
function clearSide (cx, cz, fh, a0, a1, r0, r1) {
  const fx = Math.sin(fh), fz = Math.cos(fh), rx = Math.cos(fh), rz = -Math.sin(fh);
  for (const s of [1, -1]) {
    let ok = true;
    for (let k = 0; k <= 1; k += 0.2) {
      const a = lerp(a0, a1, k) * s, r = lerp(r0, r1, k);
      if (!A.camClear(cx + (fx * Math.cos(a) + rx * Math.sin(a)) * r, cz + (fz * Math.cos(a) + rz * Math.sin(a)) * r)) { ok = false; break; }
    }
    if (ok) return s;
  }
  return 0;
}
function clientShot (p) {
  const b = p.sitAt, fh = b ? b.ry : p.grp.rotation.y;
  const y0 = A.groundH(p.x, p.z);
  let s = clearSide(p.x, p.z, fh, 0.8, 0.2, 6.5, 5.2), R = 1;
  if (!s) { s = clearSide(p.x, p.z, fh, 0.8, 0.2, 4.6, 3.8) || 1; R = 0.72; }
  return orbit(p.x, p.z, y0, fh, 0.8 * s, 0.2 * s, 6.5 * R, 5.2 * R, 2.7, 1.8, 1.05, 0.5);
}
function carShot () {
  const V = A.V;
  const s = clearSide(V.x, V.z, V.h, 0.45, 1.45, 7.2, 6) || 1;
  CUT.side = s;
  return orbit(V.x, V.z, V.y, V.h, 0.45 * s, 1.45 * s, 7.2, 6, 2.6, 1.9, 0.85, 0);
}
/* план «сердца»: облёт машины продолжается с того места, где кончился прошлый, и камера
   поднимается краном — над заборами и припаркованными машинами */
function hpShot () {
  const V = A.V, s = CUT.side;
  return orbit(V.x, V.z, V.y, V.h, 1.45 * s, 1.8 * s, 6, 8, 1.9, 5.2, 0.6, 0);
}
function hoodShot () {
  const V = A.V;
  const s = clearSide(V.x, V.z, V.h, 0.42, 0.3, 4.9, 4.1) || 1;
  return orbit(V.x, V.z, V.y, V.h, 0.42 * s, 0.3 * s, 4.9, 4.1, 1.55, 1.3, 0.85, 1.3);
}
/* перелёт: от конца прошлого плана к началу следующего, дугой над крышами */
function fly (from, to, arc) {
  const pa = new A.THREE.Vector3(), la = new A.THREE.Vector3(), pb = new A.THREE.Vector3(), lb = new A.THREE.Vector3();
  from(1, pa, la); to(0, pb, lb);
  const top = arc + Math.min(30, pa.distanceTo(pb) * 0.12);
  return (k, p, lk) => {
    const e = ease(k);
    p.lerpVectors(pa, pb, e); p.y += Math.sin(Math.PI * e) * top;
    lk.lerpVectors(la, lb, e);
  };
}

/* ─── экран ─── */
function ui () {
  if (CUT.el) return CUT.el;
  const el = document.createElement('div');
  el.id = 'intro-cut';
  el.innerHTML = '<div class="ic-bar ic-top"><button type="button" class="ic-skip"></button></div>' +
    '<div class="ic-card"><em></em><b></b><small></small></div>' +
    '<div class="ic-bar ic-bot"><div class="ic-sub"></div></div>' +
    '<div class="ic-tip"><img alt=""><div><em></em><p></p></div></div>';
  (document.getElementById('game') || document.body).appendChild(el);
  el.querySelector('.ic-skip').addEventListener('click', e => { e.stopPropagation(); skip(); });
  // клики и пальцы до игры не доходят: ни руля, ни карты по радару
  for (const ev of ['pointerdown', 'touchstart', 'mousedown', 'click']) el.addEventListener(ev, e => { if (!e.target.closest('.ic-skip')) { e.stopPropagation(); } }, { passive: true });
  el.addEventListener('click', e => { if (!e.target.closest('.ic-skip')) next(); });   // клик или тап — следующий план
  CUT.el = el;
  return el;
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// сердечко рисуем фигурой: в пиксельном шрифте такого символа нет
const hearts = s => esc(s).replace(/♥/g, '<i class="ic-hrt"></i>');
function card (kicker, title, sub, red, dur) {
  const c = CUT.el.querySelector('.ic-card');
  c.style.animationDuration = (dur || 3.3) + 's';           // плашка гаснет вместе с планом
  c.querySelector('em').textContent = kicker || '';
  c.querySelector('b').textContent = title || '';
  c.querySelector('small').textContent = sub || '';
  c.classList.toggle('red', !!red);
  c.classList.remove('on'); void c.offsetWidth; c.classList.add('on');
}
function subtitle (text) {
  const s = CUT.el.querySelector('.ic-sub');
  s.innerHTML = hearts(text);
  s.classList.remove('on'); void s.offsetWidth; s.classList.add('on');
}
function hideText () {
  CUT.el.querySelector('.ic-card').classList.remove('on');
  CUT.el.querySelector('.ic-sub').classList.remove('on');
}
/* облачко директора под сердцами: лицо, имя, реплика; стрелка смотрит на сердца */
function tip (text) {
  const el = CUT.el.querySelector('.ic-tip');
  if (!text) { el.classList.remove('on'); return; }
  if (!BOSS_P) BOSS_P = makePerson({ seed: BOSS.seed, first: t(BOSS.first), last: t(BOSS.last), fem: !!BOSS.fem });
  const img = el.querySelector('img');
  if (!img.getAttribute('src')) img.src = faceDataURL(BOSS_P, 96);
  el.querySelector('em').textContent = BOSS_P.name + ' · ' + t(BOSS.role);
  el.querySelector('p').textContent = text;
  // ставим под сердцами по раскладке (без масштаба мигания): на телефоне хад ниже
  const hl = document.getElementById('hud-left'), hs = document.getElementById('hearts');
  if (hl && hs) {
    el.style.top = (hl.offsetTop + hs.offsetTop + hs.offsetHeight + 18) + 'px';
    el.style.left = Math.max(12, hl.offsetLeft - 4) + 'px';
  }
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
}
/* показ на хаде: гаснет последнее сердце, потом половинка соседнего. Настоящее
   здоровье не трогаем — после плана хад перерисовывается как был (api.hearts) */
function demoHearts (step) {
  const lit = [...document.querySelectorAll('#hearts i')].filter(i => !i.classList.contains('off'));
  const h = lit[lit.length - 1];
  if (!h) return;
  if (step === 1) { h.classList.remove('half'); h.classList.add('off'); }
  else if (step === 2) { h.classList.remove('off'); h.classList.add('half'); }
  h.classList.remove('ic-lost'); void h.offsetWidth; h.classList.add('ic-lost');
  const s = Snd(); if (s) { s.noise(0.18, 0.2); s.blip(step === 1 ? 70 : 110, 0.12, 'square', 0.1); }
}
function demoOff () {
  if (CUT.demo < 0) return;
  CUT.demo = -1;
  if (A.hearts) A.hearts();
}
const hudMode = m => {
  document.body.classList.toggle('ic-hud', !!m);
  document.body.classList.toggle('ic-hp', m === 'hp' || m === 'both');
  document.body.classList.toggle('ic-nos', m === 'both');
};

/* ─── звук: всё из синтезатора игры ─── */
const Snd = () => A.Snd || null;
function whoosh () { const s = Snd(); if (s) s.noise(0.55, 0.1); }
function sting (hi) {
  const s = Snd(); if (!s) return;
  s.blip(hi ? 147 : 98, 0.28, 'sawtooth', 0.13);
  setTimeout(() => s.blip(hi ? 294 : 196, 0.32, 'square', 0.07), 110);
}
function cough () {
  const s = Snd(); if (s) { s.noise(0.12, 0.22); s.blip(80 + Math.random() * 30, 0.14, 'sawtooth', 0.16); }
  CUT.shake = 0.07;
  const car = A.car();
  if (car) car.position.y = CUT.carY + 0.07;
}

/* ─── вход в планы ─── */
function enter (seg) {
  if (seg.id !== 'hp') { tip(''); demoOff(); }
  switch (seg.id) {
    case 'pizza': {
      const Z = A.pizza(), name = String(Z.name || '');
      const at = name.split(' · ').slice(1).join(' · ');
      card(at || t('пиццерия'), A.brand(), '', false, seg.d);
      subtitle(seg.text);
      sting(false);
      break;
    }
    case 'client': {
      const p = CUT.guest, pr = p && p.person;
      card(t('первый заказ'), pr ? pr.name : '', pr && pr.desc ? pr.desc : '', false, seg.d);
      subtitle(seg.text);
      sting(true);
      break;
    }
    case 'car':
      card(t('моя тачка'), A.carName(), '', false, seg.d);
      subtitle(seg.text);
      if (A.hud) A.hud();
      hudMode('on');
      sting(false);
      break;
    case 'hp':
      // директор показывает на сердца: облачко у сердец, сердца мигают, одно гаснет, потом половинка
      hideText();
      if (A.hud) A.hud();
      if (A.hearts) A.hearts();
      hudMode('hp');
      tip(seg.text);
      CUT.demo = 0;
      sting(true);
      break;
    case 'hood':
      hudMode(null);
      card('', t('кхе-кхе'), '', true, seg.d);
      subtitle(seg.text);
      CUT.coughT = [0.25, 0.85, 1.5, 2.1];
      CUT.puffT = 0.15;
      whoosh();
      break;
    default:
      hideText();
      whoosh();
  }
}
function stepSeg (seg, st, dt) {
  if (seg.id === 'car') {
    // сердца — сразу, кольцо нитро — когда дошли до «и нитро»
    hudMode(st > 1.5 ? 'both' : st > 0.45 ? 'hp' : 'on');
    if (A.hud) A.hud();
  } else if (seg.id === 'hp') {
    hudMode('hp');
    if (CUT.demo === 0 && st > 1.3) { CUT.demo = 1; demoHearts(1); }
    else if (CUT.demo === 1 && st > 3) { CUT.demo = 2; demoHearts(2); }
  } else if (seg.id === 'hood') {
    const V = A.V, fx = Math.sin(V.h), fz = Math.cos(V.h);
    if ((CUT.puffT -= dt) <= 0) {
      CUT.puffT = 0.11;
      A.puff(V.x + fx * 1.9 + (Math.random() - 0.5) * 0.6, 1.15, V.z + fz * 1.9 + (Math.random() - 0.5) * 0.6, st > 1.1, 0.3 + Math.random() * 0.3);
    }
    while (CUT.coughT.length && st >= CUT.coughT[0]) { CUT.coughT.shift(); cough(); }
    const car = A.car();
    if (car && car.position.y > CUT.carY) car.position.y = Math.max(CUT.carY, car.position.y - dt * 0.6);
  }
}

/* реплика плана: её длина задаёт, сколько план висит (readTime, dialog.js) */
function lineOf (id) {
  switch (id) {
    case 'pizza': return t('вот пиццерия — сюда я устроился курьером');
    case 'client': {
      const pr = CUT.guest && CUT.guest.person;
      return pr && pr.stepan ? (A.ADULT ? t('первый заказ — Степану Тугареву: заядлый кальянщик и бизнесмен — бизнес вот-вот будет')
        : t('первый заказ — Степану Тугареву: любитель самовара и бизнесмен — бизнес вот-вот будет'))
        : t('первый заказ — вот он, ждёт пиццу');
    }
    case 'car': return t('вот моя тачка: у неё есть жизни ♥ и бак кофе');
    case 'hp': return t('а это твои хп — врезаешься куда-то, теряешь сердце (легонько — половинку)');
    case 'hood': return t('а ещё она может ломаться');
  }
  return '';
}
/* план с репликой: не короче, чем её прочитать; перелёты — как были */
const plan = (id, d, pose) => { const text = lineOf(id); return { id, d: text ? Math.max(d, readTime(text)) : d, pose, text }; };

/* ─── запуск, кадр, конец ─── */
export function play (order, done) {
  if (!A) { if (done) done(); return; }
  const st = order.stops && order.stops[0], g = st && st.peds && st.peds[0];
  CUT.guest = g && g.grp ? g : null;
  if (CUT.guest && CUT.guest.guest && A.guestStep) A.guestStep(CUT.guest, 0);     // сел на лавочку — до первого кадра
  const sP = pizzaShot();
  const sC = CUT.guest ? clientShot(CUT.guest) : null;
  const sK = carShot(), sH = hoodShot();
  const segs = [plan('pizza', 3.3, sP)];
  if (sC) segs.push(plan('fly', 1.15, fly(sP, sC, 18)), plan('client', 3.7, sC), plan('fly', 1.15, fly(sC, sK, 16)));
  else segs.push(plan('fly', 1.15, fly(sP, sK, 14)));
  segs.push(plan('car', 3.1, sK), plan('hp', 4.8, hpShot()), plan('hood', 2.9, sH));
  CUT.segs = segs; CUT.i = -1; CUT.t = 0; CUT.done = done; CUT.on = true; CUT.shake = 0;
  const car = A.car();
  CUT.carY = car ? car.position.y : 0;
  CUT.fov0 = A.cam.fov;
  const V = A.V;
  V.vx = V.vz = 0;
  const s = Snd(); if (s && s.engine) s.engine(0);
  const el = ui();
  el.querySelector('.ic-skip').textContent = t('пропустить ▸▸ esc');
  hideText();
  document.body.classList.add('intro-cut');
  requestAnimationFrame(() => el.classList.add('on'));
  addEventListener('keydown', onKey, true);
  addEventListener('keyup', onKeyUp, true);
}
export function frame (dt) {
  if (!CUT.on) return false;
  CUT.t += dt;
  let acc = 0, i = 0;
  for (; i < CUT.segs.length; i++) { if (CUT.t < acc + CUT.segs[i].d) break; acc += CUT.segs[i].d; }
  if (i >= CUT.segs.length) { finish(); return true; }
  const seg = CUT.segs[i], st = CUT.t - acc;
  if (i !== CUT.i) { CUT.i = i; enter(seg); }
  stepSeg(seg, st, dt);
  seg.pose(clamp(st / seg.d, 0, 1), P, L);
  if (CUT.shake > 0) { P.x += (Math.random() - 0.5) * CUT.shake; P.y += (Math.random() - 0.5) * CUT.shake; CUT.shake = Math.max(0, CUT.shake - dt * 0.25); }
  const cam = A.cam;
  cam.position.copy(P);
  cam.lookAt(L);
  const fov = seg.id === 'hood' ? 44 : 50;
  if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 5); cam.updateProjectionMatrix(); }
  // Степан сидит и дышит, кальян дымит; остальной мир стоит
  if (CUT.guest && CUT.guest.guest && A.guestStep) A.guestStep(CUT.guest, dt);
  return true;
}
export function skip () { if (CUT.on) finish(); }
/* дальше: A, Enter, пробел, клик — сразу к следующему плану (субтитры не печатаются по буквам —
   допечатывать нечего); на последнем — конец. Esc, B, Start, «пропустить» — всё вступление */
export function next () {
  if (!CUT.on) return;
  let acc = 0;
  for (let i = 0; i < CUT.segs.length; i++) {
    acc += CUT.segs[i].d;
    if (CUT.t < acc) { CUT.t = acc; if (i === CUT.segs.length - 1) finish(); return; }
  }
  finish();
}
function finish () {
  if (!CUT.on) return;
  CUT.on = false;
  A.Store.set(KEY, 1);
  removeEventListener('keydown', onKey, true);
  // клавиша, которой пропустили, отпускается уже над накладной — до игры не доходит
  setTimeout(() => { removeEventListener('keyup', onKeyUp, true); CUT.swallow = ''; }, 600);
  hudMode(null);
  hideText();
  tip(''); demoOff();
  const el = CUT.el;
  if (el) el.classList.remove('on');
  document.body.classList.remove('intro-cut');
  const car = A.car();
  if (car) car.position.y = CUT.carY;
  const cam = A.cam;
  cam.fov = CUT.fov0; cam.updateProjectionMatrix();
  CUT.segs = []; CUT.guest = null;
  const d = CUT.done; CUT.done = null;
  if (document.activeElement && document.activeElement.blur && el && el.contains(document.activeElement)) document.activeElement.blur();
  if (d) d();
}
const onKey = e => {
  if (!CUT.on) return;
  if (/^F\d+$/.test(e.code)) return;                       // F11, F12 — браузеру
  e.stopImmediatePropagation();
  if (/^(Escape|Enter|NumpadEnter|Space)$/.test(e.code)) {
    e.preventDefault();
    if (!e.repeat) { CUT.swallow = e.code; if (e.code === 'Escape') skip(); else next(); }
  }
};
const onKeyUp = e => { if (e.code === CUT.swallow) { e.preventDefault(); e.stopImmediatePropagation(); CUT.swallow = ''; } };

/* для ?debug */
export const DEBUG = { CUT, wants, skip, next };
