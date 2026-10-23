/* ──────────────────────────────────────────────────────────────────────────
   Отбиться от гопников — сжимающееся кольцо (12ао, автор 18.10.2026; docs/CAREER.md «Мзда за доставку…»).
   Гопники держат машину у адреса и просят мзду (world.js gangTalk). В окне разговора — «заплатить» или «отбиться».
   «Отбиться» — эта мини-игра: лист накладной посреди экрана, в нём круг-цель (пунктир) и кольцо, которое
   сжимается от края к центру. Жми, когда кольцо легло на круг: A на геймпаде (Дека), Enter / пробел / клик на
   компьютере, тап по листу на телефоне. Одна попытка: попал — отбился (не платишь, машину не мнут); нажал рано /
   поздно или не нажал — промах, платишь мзду, как при «заплатить».
   Во взрослой (ADULT) кольцо — «очко»: со складками к центру, подпись «Сожми очко!» (намёк формой и словом, без
   анатомии); в детской — просто круг и «Соберись!».
   Мир идёт (как в разговоре), руль из рук — DLG.hold (game.js видит isOpen()).
   Числа — RING ниже: сначала LEAD с «готовься», потом кольцо идёт от FROM к центру со скоростью SPEED (доля
   радиуса в секунду); попал — |кольцо − AT| ≤ WIN. Кольцо до цели — ~1,2 с, окно «попал» — ~0,3 с.

     const ok = await RF.play({ adult, sfx: name => … })   // → true (попал) / false (промах)
   Отладка: __dlv.RF — { RING, state(), play(o) }.
   ────────────────────────────────────────────────────────────────────────── */
import './ringfight.css';
import { t } from '../i18n/index.js';
import { pad as PAD } from '../input/gamepad.js';
import { keyHTML, refreshKeys, inputKind } from '../input/glyphs.js';
import * as DLG from './dialog.js';
import * as CL from '../platform/crashlog.js';

export const RING = { LEAD: 0.75, FROM: 1, AT: 0.42, WIN: 0.075, SPEED: 0.5, SHOW: 1.1 };

const R0 = 88;                                   // радиус кольца в начале, в точках viewBox (−100…100)
const CREASE = 10;                               // складок у «очка» (взрослая)
let root = null, cur = null;

function build () {
  root = document.createElement('div');
  root.id = 'ringfight';
  root.hidden = true;
  root.innerHTML = '<section class="rf-box pp-sheet pp-tilt-r">' +
    '<header class="pp-head"><span class="rf-what"></span><b class="rf-sum"></b></header>' +
    '<div class="rf-stage"><svg viewBox="-100 -100 200 200" aria-hidden="true">' +
    '<circle class="rf-target" r="' + (R0 * RING.AT) + '"/>' +
    '<g class="rf-ring"><circle class="rf-o" r="' + R0 + '"/><g class="rf-cr"></g></g>' +
    '</svg><div class="rf-seal pp-seal" hidden></div></div>' +
    '<p class="rf-title"></p><p class="rf-hint pp-hint"></p></section>';
  // складки «очка»: короткие штрихи от кольца к центру, чуть закручены
  let cr = '';
  for (let i = 0; i < CREASE; i++) {
    const a = i / CREASE * Math.PI * 2, w = i % 2 ? 0.7 : 0.86;      // через одну — короче: складки, не спицы
    const p = (r, an) => (Math.sin(an) * r).toFixed(1) + ' ' + (-Math.cos(an) * r).toFixed(1);
    cr += '<path d="M' + p(R0 * 0.07, a + 0.5) + ' Q' + p(R0 * 0.42, a + 0.38) + ' ' + p(R0 * w, a) + '"/>';
  }
  root.querySelector('.rf-cr').innerHTML = cr;
  (document.getElementById('game') || document.body).appendChild(root);
}

export const state = () => cur ? { st: cur.st, r: +cur.r.toFixed(3), res: cur.res } : null;

export function play (o = {}) {
  if (cur) return Promise.resolve(false);
  CL.transFor('кольцо гопников', 2000);           // метка перехода (crashlog.js, 0п48)
  if (!root) build();
  const adult = !!o.adult, $ = s => root.querySelector(s);
  const sfx = n => { try { if (o.sfx) o.sfx(n); } catch (e) { /* — */ } };
  root.classList.toggle('rf-adult', adult);
  $('.rf-what').textContent = adult ? t('не очкуй') : t('не трусь');
  $('.rf-sum').textContent = o.sum ? '−' + o.sum : '';
  $('.rf-title').textContent = adult ? t('Сожми очко!') : t('Соберись!');
  $('.rf-hint').innerHTML = keyHTML('ok') + '<span></span>';
  $('.rf-hint span').textContent = t('жми, когда кольцо ляжет на круг');
  refreshKeys(root);
  const seal = $('.rf-seal'), ring = $('.rf-ring');
  seal.hidden = true; seal.className = 'rf-seal pp-seal';
  root.classList.remove('rf-hot', 'rf-hit', 'rf-miss');
  ring.setAttribute('transform', 'scale(1)');
  root.hidden = false;
  requestAnimationFrame(() => root.classList.add('on'));
  DLG.hold(true);

  return new Promise(done => {
    const c = cur = { st: 'lead', r: RING.FROM, res: '', t: 0 };
    let last = performance.now(), raf = 0, padA = !!PAD.a, kind = inputKind().kind;     // A уже держат (нажали «отбиться») — ждём, пока отпустят
    const inWin = () => Math.abs(c.r - RING.AT) <= RING.WIN;
    const finish = hit => {
      if (c.st === 'end') return;
      c.st = 'end'; c.t = 0; c.res = hit ? 'hit' : 'miss';
      root.classList.remove('rf-hot');
      root.classList.add(hit ? 'rf-hit' : 'rf-miss');
      seal.textContent = hit ? t('отбился!') : (adult ? t('очканул') : t('промах'));
      seal.classList.add(hit ? 'pp-seal-green' : 'pp-seal-red');
      seal.hidden = false;
      sfx(hit ? 'hit' : 'miss');
    };
    const press = () => { if (c.st === 'go') finish(inWin()); };
    const close = () => {
      cancelAnimationFrame(raf);
      removeEventListener('keydown', key, true);
      root.onpointerdown = null;
      root.classList.remove('on');
      setTimeout(() => { if (!cur) root.hidden = true; }, 180);
      cur = null;
      DLG.hold(false);
      done(c.res === 'hit');
    };
    const tick = now => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      c.t += dt;
      if (c.st === 'lead' && c.t >= RING.LEAD) { c.st = 'go'; c.t = 0; }
      else if (c.st === 'go') {
        c.r = Math.max(0, c.r - RING.SPEED * dt);
        ring.setAttribute('transform', 'scale(' + c.r.toFixed(4) + ')');
        root.classList.toggle('rf-hot', inWin());
        if (c.r < RING.AT - RING.WIN) finish(false);            // проскочило — промах
      } else if (c.st === 'end' && c.t >= RING.SHOW) { close(); return; }
      if (PAD.connected) { const a = !!PAD.a; if (a && !padA) press(); padA = a; }
      const k = inputKind().kind; if (k !== kind) { kind = k; refreshKeys(root); }   // значок [A] / Enter / без значка — чем играют сейчас
    };
    const key = e => {
      const k = e.code;
      if (k === 'Space' || k === 'Enter' || k === 'NumpadEnter' || k === 'KeyE') {
        e.preventDefault(); e.stopPropagation();
        if (!e.repeat) press();
      }
    };
    addEventListener('keydown', key, true);
    root.onpointerdown = e => { e.preventDefault(); press(); };   // клик мышью / тап — по всему листу и вокруг
    raf = requestAnimationFrame(tick);
  });
}

/* отладка: __dlv.RF (probe memtrans.js — память окна кольца) */
if (typeof window !== 'undefined') setTimeout(() => { if (window.__dlv) window.__dlv.RF = { RING, state, play }; }, 0);
