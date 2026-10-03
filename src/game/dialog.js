/* Диалог по центру экрана: большая голова того, кто говорит, облачко «изо
   рта», текст печатается по буквам — с «ну», «э-э» и запинками, как живая
   речь. Договорил — кнопки «принять» / «отказаться» (или одна «дальше»).
   Пропустить: клик по облачку, пробел, Enter, A на геймпаде — первый раз
   допечатывает, второй — жмёт выбранную кнопку. Крестовина или стик ←→ (↑↓)
   выбирают кнопку, выбранная обведена (.padsel, как в меню); B — отказаться.

     DLG.init({ pause: on => …, face: (person, size) => dataURL })   — один раз из game.js
     const r = await DLG.say({
       person, name, text,             // text — уже переведённый ($t)
       accept: 'беру', decline: 'не-а', // decline не задан — одна кнопка
       mood: 'calm' | 'nervous' | 'drunk' | 'shy',  // сколько мычит и запинается
       color: '#a15bff',               // полоса сверху — цвет активности
       fillers: true,                  // вставлять «ну» и «э-э» (для катсцен можно false)
       timer: 8,                       // секунд на ответ после того, как договорил (полоска)
       timeoutText: t('ну лан (('),    // не успел — он это говорит и уходит
       meters: [{ name, v, p, color }] // полоски под текстом (Дядя Женя: мотор и ресурс), p — 0…1
     });                               // → true (принял) / false (отказался) / null (не успел)
   Очередь: несколько say подряд показываются по одному. */
import './dialog.css';
import { t } from '../i18n/index.js';
import { pad as PAD } from '../input/gamepad.js';

const N_ = s => s;
const FILL = /*i18n*/ [N_('ну'), N_('э-э'), N_('короче'), N_('как бы'), N_('это самое'), N_('в общем'), N_('слушай')];
const MOOD = { calm: [0.08, 0.03], nervous: [0.22, 0.14], drunk: [0.28, 0.08], shy: [0.16, 0.12] };   // [мычание, запинка]

let API = { pause: () => {}, face: null };
let root = null, queue = Promise.resolve(), open = 0;

export function init (api) { API = { ...API, ...api }; }
export const isOpen = () => open > 0;
/* закрыть текущую реплику сразу (катсцена пропущена: story.js) — say вернёт null */
let CUR = null;
export function dismiss () { if (CUR) CUR(); }

function build () {
  root = document.createElement('div');
  root.id = 'dlg';
  root.hidden = true;
  root.innerHTML = '<div class="dlg-box"><div class="dlg-bar"></div><div class="dlg-row">' +
    '<div class="dlg-head"><img alt=""><b class="dlg-name"></b></div>' +
    '<div class="dlg-bubble"><p class="dlg-text"></p><div class="dlg-meters"></div><span class="dlg-skip"></span></div></div>' +
    '<div class="dlg-timer"><i></i></div><div class="dlg-btns"><button type="button" class="dlg-no"></button><button type="button" class="dlg-yes"></button></div></div>';
  (document.getElementById('game') || document.body).appendChild(root);
}

/* живая речь: иногда «ну…» перед фразой, «э-э» посреди, запинка на первой букве */
export function speechify (text, mood = 'calm', rnd = Math.random) {
  const [pf, ps] = MOOD[mood] || MOOD.calm;
  const words = text.split(' ');
  const out = [];
  for (let i = 0; i < words.length; i++) {
    let w = words[i];
    // не внутри числа и не между числом и его знаком: «6 000 ₽», «70 %», «90 км/ч» — после цифры и перед «%», «₽» не мычим
    if (i && rnd() < pf && !/[.!?…]$/.test(out[out.length - 1] || '') && !/\d$/.test(words[i - 1]) && /^[\p{L}\d«"(]/u.test(w)) out.push(t(FILL[Math.floor(rnd() * FILL.length)]) + '…');
    if (w.length > 3 && rnd() < ps && /^[\p{L}]/u.test(w) && !/\d$/.test(words[i - 1] || '')) w = w[0] + '-' + (rnd() < 0.3 ? w[0].toLowerCase() + '-' : '') + w;
    out.push(w);
  }
  if (rnd() < pf * 1.5) out.unshift(t(FILL[0]) + '…');
  return out.join(' ');
}

export function say (o) {
  const run = () => new Promise(res => show(o, res));
  const p = queue.then(run);
  queue = p.catch(() => {});
  return p;
}

function show (o, done) {
  if (!root) build();
  open++;
  API.pause(true);
  const $ = s => root.querySelector(s);
  const two = !!o.decline;
  $('.dlg-bar').style.background = o.color || '#ff8a2b';
  const img = $('.dlg-head img');
  img.src = o.face || (API.face && o.person ? API.face(o.person, 256) : '');
  img.hidden = !img.src;
  $('.dlg-name').textContent = o.name || '';
  const yes = $('.dlg-yes'), no = $('.dlg-no');
  yes.textContent = o.accept || t('дальше');
  no.textContent = o.decline || '';
  no.hidden = !two;
  $('.dlg-btns').classList.remove('on');
  $('.dlg-skip').textContent = t('пропустить ▸');
  const ms = Array.isArray(o.meters) ? o.meters : [], mel = $('.dlg-meters'), esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  mel.hidden = !ms.length;
  mel.innerHTML = ms.map(m => '<div class="dlg-m"><span>' + esc(m.name) + '</span><i><i style="width:' + (Math.max(0, Math.min(1, +m.p || 0)) * 100).toFixed(1) + '%;background:' + esc(m.color || '#ff8a2b') + '"></i></i><b>' + esc(m.v) + '</b></div>').join('');
  const full = o.fillers === false ? o.text : speechify(o.text, o.mood);
  const el = $('.dlg-text');
  el.textContent = '';
  root.hidden = false;
  requestAnimationFrame(() => root.classList.add('on'));

  let i = 0, typed = false, closed = false, raf = 0, last = performance.now(), acc = 0, padPrev = {};
  let pick = yes;                                // что нажмёт A: по умолчанию «принять»
  const mark = on => { yes.classList.toggle('padsel', on && pick === yes); no.classList.toggle('padsel', on && pick === no); };
  const CPS = o.cps || 38;                       // букв в секунду; на многоточии — пауза
  const bar = $('.dlg-timer'), barI = bar.querySelector('i');
  bar.classList.remove('on'); barI.style.transform = 'scaleX(1)';
  let left = 0, waiting = false;
  const finish = () => {
    if (typed) return; typed = true; el.textContent = full; $('.dlg-btns').classList.add('on'); $('.dlg-skip').textContent = '';
    if (o.timer) { left = o.timer; bar.classList.add('on'); }
  };
  // не успел ответить: он говорит своё «ну лан» и уходит сам
  const timeUp = () => {
    waiting = true; bar.classList.remove('on'); $('.dlg-btns').classList.remove('on');
    el.textContent = o.timeoutText || t('ну лан ((');
    setTimeout(() => close(null), 1400);
  };
  const close = v => {
    if (closed) return; closed = true;
    if (CUR === dismissMe) CUR = null;
    cancelAnimationFrame(raf);
    removeEventListener('keydown', key, true);
    mark(false);
    root.classList.remove('on');
    setTimeout(() => { if (!open) root.hidden = true; }, 180);   // следующая реплика из очереди уже открылась — не прячем её
    open--;
    if (!open) API.pause(false);
    done(v);
  };
  const tick = now => {
    raf = requestAnimationFrame(tick);
    if (!typed) {
      acc += (now - last) / 1000 * CPS;
      while (acc >= 1 && i < full.length) {
        const c = full[i++];
        acc -= c === '…' || c === '.' || c === '!' || c === '?' ? 7 : c === ',' ? 3 : 1;   // знак препинания — вдох
        el.textContent = full.slice(0, i);
      }
      if (i >= full.length) finish();
    } else if (o.timer && !waiting && !closed) {
      left -= (now - last) / 1000;
      barI.style.transform = 'scaleX(' + Math.max(0, left / o.timer).toFixed(3) + ')';
      bar.classList.toggle('low', left < o.timer * 0.3);
      if (left <= 0) timeUp();
    }
    last = now;
    // геймпад: A — пропустить / принять, B — отказаться
    // раскладку (Xbox, сырой Deck) разбирает input/gamepad.js
    if (PAD.connected) {
      const a = PAD.a, b = PAD.b;
      if (two && typed && (PAD.menuLeft || PAD.menuUp)) pick = no;          // «отказаться» — слева
      if (two && typed && (PAD.menuRight || PAD.menuDown)) pick = yes;
      mark(PAD.active && typed && !waiting);
      if (a && !padPrev.a && !waiting) { if (!typed) finish(); else close(pick !== no); }
      if (b && !padPrev.b && typed && !waiting) close(two ? false : true);
      padPrev = { a, b };
    }
  };
  raf = requestAnimationFrame(tick);
  const dismissMe = () => close(null);
  CUR = dismissMe;
  const key = e => {
    if (waiting) return;
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') { e.preventDefault(); e.stopPropagation(); if (!typed) finish(); else if (!two || e.code !== 'Space') close(true); }
    else if (e.code === 'Escape' || e.code === 'Backspace') { e.preventDefault(); e.stopPropagation(); if (!typed) finish(); else close(two ? false : true); }
  };
  addEventListener('keydown', key, true);
  $('.dlg-bubble').onclick = () => { if (!typed) finish(); };
  yes.onclick = () => { if (typed && !waiting) close(true); };
  no.onclick = () => { if (typed && !waiting) close(false); };
}
