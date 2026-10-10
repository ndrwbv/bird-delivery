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
       meters: [{ name, v, p, color }], // полоски под текстом (Дядя Женя: мотор и ресурс), p — 0…1
       plain: true,                    // обе кнопки одного вида (приглашение клиентки: оба ответа — отказы)
       alt: true,                      // второй ответ — на X (геймпад) / X (клавиатура), а не на B / Esc: в катсцене
                                       // B и Esc — «пропустить сцену» (story.js ['ask'], учебный Стёпа)
       emo: 'angry',                   // выражение лица на портрете (people.js EMO_FACE; катсцены story.js { emo })
       onTyped: () => …,               // допечаталась (story.js: 3D-актёр закрывает рот)
     });                               // → true (принял) / false (отказался) / null (не успел)
   Очередь: несколько say подряд показываются по одному.
   Портрет говорит ртом (talkface.js), пока текст печатается; допечатался — рот закрыт. o.face (готовая
   картинка) — без рта, как было.
   На кнопках — значок, что жать: [A] / [B] на геймпаде, Enter / Esc на клавиатуре, на тач-экране без
   значков. Подсветка геймпада от простоя не гаснет (гасят мышь и клавиши, padmenu.js padLit); если её
   не было, первое ←→↑↓ только зажигает её (A без подсветки — «принять»).

   Реплика на ходу (события посреди езды — вместо плашки сверху экрана, docs/CAREER.md «Реплики на ходу»):
     DLG.line({ person, name, text, color })   // → Promise, когда ушла
   Сообщение как в iMessage (круглая аватарка, имя, серый пузырь — как чат Толика, chat.css), сверху по
   центру, без затемнения и кнопок; пузырь сразу по размеру всего текста, буквы проявляются в нём: мир НЕ стоит,
   клавиши и геймпад не перехватывает (пробел — ручник, A — нитро). Допечаталась — висит
   readTime(текст) (1,5 с + 0,06 с на букву, не меньше 3 с) и уходит сама; клик — убрать сразу. Аватарка говорит
   ртом, пока буквы проявляются (talkface.js).
   Своя очередь: по одной, ждут не больше LIVE.Q (лишние — самые старые — выбрасываются).
   isOpen() её не считает. */
import './dialog.css';
import { t } from '../i18n/index.js';
import { pad as PAD } from '../input/gamepad.js';
import { padLit } from '../input/padmenu.js';
import { keyHTML, refreshKeys } from '../input/glyphs.js';
import * as TF from './talkface.js';            // портрет говорит ртом, пока печатается

/* значок кнопки — общий .pp-key (glyphs.js keyHTML, paper.css): геймпад — A / B (PlayStation — ✕ / ○),
   клавиатура — Enter / Esc, касание — без значка; меняется сам, когда игрок сменил ввод */

const N_ = s => s;
const FILL = /*i18n*/ [N_('ну'), N_('э-э'), N_('короче'), N_('как бы'), N_('это самое'), N_('в общем'), N_('слушай')];
const MOOD = { calm: [0.08, 0.03], nervous: [0.22, 0.14], drunk: [0.28, 0.08], shy: [0.16, 0.12] };   // [мычание, запинка]

/* сколько реплика висит сама, если катсцена идёт по таймеру (intro.js; пузыри героев):
   1,5 с + 0,06 с на букву (~15 букв в секунду), но не меньше 3 с. Печатается по буквам —
   отсчёт после того, как допечаталась. Диалог выше (say) ждёт нажатия и сам не листается. */
export const READ = { BASE: 1.5, PER_CHAR: 0.06, MIN: 3 };
export const readTime = text => Math.max(READ.MIN, READ.BASE + READ.PER_CHAR * String(text == null ? '' : text).length);

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
    '<div class="dlg-timer"><i></i></div><div class="dlg-btns">' +
    '<button type="button" class="dlg-no">' + keyHTML('back') + '<span></span></button>' +
    '<button type="button" class="dlg-yes">' + keyHTML('ok') + '<span></span></button></div></div>';
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
  return out.join(' ').replace(/(\d) (?=\d|[%₽$€])/g, '$1\u00a0');   // «85 %», «8 300 ₽» не рвутся переносом строки
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
  TF.stop(img);
  if (o.face || !TF.bind(img, o.person, 256, o.emo)) img.src = o.face || (API.face && o.person ? API.face(o.person, 256) : '');
  img.hidden = !img.src;
  $('.dlg-name').textContent = o.name || '';
  const yes = $('.dlg-yes'), no = $('.dlg-no');
  yes.querySelector('span').textContent = o.accept || t('дальше');
  no.querySelector('span').textContent = o.decline || '';
  no.hidden = !two;
  const noKey = no.querySelector('[data-pp-key]');
  if (noKey) noKey.dataset.ppKey = o.alt ? 'x' : 'back';   // alt: второй ответ — на X
  $('.dlg-btns').classList.remove('on');
  $('.dlg-btns').classList.toggle('plain', !!o.plain);
  const glyphs = () => refreshKeys(root);           // значки [A]/[B] — по тому, чем сейчас играют (glyphs.js)
  glyphs();
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
  let lit = false;                               // подсветка видна: первое ←→↑↓ без неё только будит
  const mark = on => { yes.classList.toggle('padsel', on && pick === yes); no.classList.toggle('padsel', on && pick === no); };
  const CPS = o.cps || 38;                       // букв в секунду; на многоточии — пауза
  const bar = $('.dlg-timer'), barI = bar.querySelector('i');
  bar.classList.remove('on'); barI.style.transform = 'scaleX(1)';
  let left = 0, waiting = false;
  const finish = () => {
    if (typed) return; typed = true; el.textContent = full; $('.dlg-btns').classList.add('on'); $('.dlg-skip').textContent = '';
    TF.stop(img);
    if (o.onTyped) try { o.onTyped(); } catch (e) { console.warn('[dlg] onTyped', e); }
    if (o.timer) { left = o.timer; bar.classList.add('on'); }
  };
  // не успел ответить: он говорит своё «ну лан» и уходит сам
  const timeUp = () => {
    waiting = true; bar.classList.remove('on'); $('.dlg-btns').classList.remove('on');
    el.textContent = o.timeoutText || t('ну лан ((');
    TF.talk(img, TF.talkTime(el.textContent));
    setTimeout(() => close(null), 1400);
  };
  const close = v => {
    if (closed) return; closed = true;
    if (CUR === dismissMe) CUR = null;
    cancelAnimationFrame(raf);
    removeEventListener('keydown', key, true);
    TF.stop(img);
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
    glyphs();
    if (PAD.connected) {
      const a = PAD.a, b = PAD.b;
      const on = padLit(PAD) && typed && !waiting;
      if (on && lit && two && (PAD.menuLeft || PAD.menuUp)) pick = no;      // «отказаться» — слева
      if (on && lit && two && (PAD.menuRight || PAD.menuDown)) pick = yes;
      lit = on;
      mark(on);
      if (a && !padPrev.a && !waiting) { if (!typed) finish(); else close(pick !== no); }
      if (b && !padPrev.b && typed && !waiting && !o.alt) close(two ? false : true);   // alt: B — пропустить сцену (story.js), не ответ
      const x = !!PAD.x;
      if (o.alt && two && x && !padPrev.x && !waiting) { if (!typed) finish(); else close(false); }
      padPrev = { a, b, x };
    }
  };
  raf = requestAnimationFrame(tick);
  TF.talk(img);                                  // говорит, пока печатается (finish — замолчал)
  const dismissMe = () => close(null);
  CUR = dismissMe;
  const key = e => {
    if (waiting) return;
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') { e.preventDefault(); e.stopPropagation(); if (!typed) finish(); else if (!two || e.code !== 'Space') close(true); }
    else if (o.alt && two && e.code === 'KeyX') { e.preventDefault(); e.stopPropagation(); if (!typed) finish(); else close(false); }
    else if (o.alt && (e.code === 'Escape' || e.code === 'Backspace')) return;   // alt: Esc — пропустить сцену (story.js), не ответ
    else if (e.code === 'Escape' || e.code === 'Backspace') { e.preventDefault(); e.stopPropagation(); if (!typed) finish(); else close(two ? false : true); }
  };
  addEventListener('keydown', key, true);
  $('.dlg-bubble').onclick = () => { if (!typed) finish(); };
  yes.onclick = () => { if (typed && !waiting) close(true); };
  no.onclick = () => { if (typed && !waiting) close(false); };
}

/* ── реплика на ходу (line) ── */
export const LIVE = { Q: 2, CPS: 40 };
let lroot = null, lcur = null;
const lq = [];
export const lineOpen = () => !!lcur;
export function line (o) {
  return new Promise(res => {
    lq.push({ o, res });
    while (lq.length > LIVE.Q) lq.shift().res(false);
    if (!lcur) lineNext();
  });
}
function lineNext () {
  const it = lq.shift();
  if (!it) { lcur = null; return; }
  if (!lroot) {
    lroot = document.createElement('div');
    lroot.id = 'dlg-live';
    lroot.hidden = true;
    lroot.innerHTML = '<div class="dlg-bar"></div><div class="dll-row"><img alt=""><div class="dll-b"><b></b><p></p></div></div>';
    (document.getElementById('game') || document.body).appendChild(lroot);
  }
  const o = it.o, $ = s => lroot.querySelector(s);
  $('.dlg-bar').style.background = o.color || '#3fae5a';
  const img = $('img');
  TF.stop(img);
  if (o.face || !TF.bind(img, o.person, 128, o.emo)) img.src = o.face || (API.face && o.person ? API.face(o.person, 128) : '');
  img.hidden = !img.src;
  $('b').textContent = o.name || '';
  const el = $('p'), full = String(o.text == null ? '' : o.text);
  // пузырь сразу во весь текст: ещё не напечатанное стоит невидимым (.dll-rest) — пузырь не растёт по буквам
  const shown = document.createElement('span'), rest = document.createElement('span');
  rest.className = 'dll-rest'; rest.textContent = full;
  el.replaceChildren(shown, rest);
  lroot.hidden = false;
  requestAnimationFrame(() => lroot.classList.add('on'));
  let i = 0, acc = 0, last = performance.now(), left = -1, raf = 0, done = false;
  const close = () => {
    if (done) return; done = true;
    cancelAnimationFrame(raf);
    TF.stop(img);
    lroot.classList.remove('on');
    lroot.onclick = null;
    setTimeout(() => { if (!lcur) lroot.hidden = true; }, 200);
    lcur = null;
    it.res(true);
    setTimeout(() => { if (!lcur) lineNext(); }, 220);
  };
  const tick = now => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (i < full.length) {
      acc += dt * LIVE.CPS;
      while (acc >= 1 && i < full.length) { const c = full[i++]; acc -= c === '.' || c === '!' || c === '?' || c === '…' ? 5 : 1; }
      shown.textContent = full.slice(0, i); rest.textContent = full.slice(i);
      if (i >= full.length) { left = readTime(full); TF.stop(img); }
    } else if ((left -= dt) <= 0) close();
  };
  lcur = { close };
  lroot.onclick = close;
  raf = requestAnimationFrame(tick);
  TF.talk(img);                                  // говорит, пока буквы проявляются
}
/* убрать реплику на ходу и очередь (конец смены, меню) */
export function lineClear () { while (lq.length) lq.shift().res(false); if (lcur) lcur.close(); }
/* для ?debug (__dlv.DLG.TALKDBG): говорящие портреты — state(img) → { mouth: 0 закрыт | 1 приоткрыт | 2 открыт, talking } */
export const TALKDBG = TF.DEBUG;
