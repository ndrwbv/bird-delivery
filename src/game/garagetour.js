/* Обучение в гараже: первый раз за всё время, когда открыли экран гаража (из меню
   или с итогов смены), Дядя Женя за 6 шагов показывает, что тут где. Каждый шаг —
   подсветка настоящей части экрана (всё вокруг затемнено) и облачко с его лицом.

     TOUR.need(Store)          — ещё не показывали (флаг 'dlv-garage-tut' нет)
     TOUR.start(host, api)     — host — #cr-garage; api: { Store, face() → dataURL, person() → он сам (портрет говорит ртом), Snd }
   Новая подсказка — лицо Дяди Жени говорит ртом (talkface.js), сколько «читает вслух» текст: 0,7—2,6 с.
     TOUR.on(), TOUR.root()    — для геймпада и клавиатуры: пока идёт, garage.root() — это облачко
     TOUR.skip()               — «пропустить» (и Esc / B — garage.close() во время обучения)

   Дальше — кнопка «дальше», Enter / пробел, A, клик по облачку. Пропустить — кнопка,
   Esc / Backspace, B. Досмотрел или пропустил — флаг ставится, больше не покажется;
   «сбросить прогресс» его стирает (PROGRESS_KEYS в game.js). */
import './garagetour.css';
import { t } from '../i18n/index.js';
import { keyHTML } from '../input/glyphs.js';     // [A] дальше · [B] пропустить — по вводу
import * as TF from './talkface.js';              // Дядя Женя говорит ртом

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const KEY = 'dlv-garage-tut';
const N_ = s => s;
/* что подсвечиваем (селектор внутри гаража) и что говорит Дядя Женя — коротко, строка на одну мысль
   (автор, 10.10.2026: «не надо лишних слов — мотор лучше, и т.д.») */
const STEPS = [
  { sel: '.gr-card.on .gr-pic', text: [N_('здорово! я Дядя Женя, это мой гараж'), N_('листай ◀ ▶, выбирай тачку')] },
  { sel: '.gr-wallet', text: [N_('копилка — твои деньги'), N_('крутым тачкам нужны ещё звёзды ★'), N_('звёзды — за хорошие смены')] },
  { sel: '.gr-card.on .gr-acts', text: [N_('выбрать — едешь на ней'), N_('броня — +1 ♥'), N_('мотор лучше — быстрее едет')] },
  { sel: '.gr-card.on .gr-row', text: [N_('надоел цвет — перекрашу'), N_('продать — за полцены')] },
  { sel: '.gr-card.on .gr-stats', text: [N_('мотор изнашивается'), N_('ниже 70 % — глохнет'), N_('чиню на районе — ключ на радаре'), N_('ресурс с каждым ремонтом меньше')] },
  { sel: '.gr-back', text: [N_('насмотрелся — жми «назад»'), N_('заходи ещё!')] },
];

let H = null, A = null, box = null, hole = null, i = 0, live = false;
export const on = () => live;
export const root = () => (live ? box : null);
export const need = Store => !!Store && !Store.get(KEY, 0) && !new URLSearchParams(location.search).has('sandbox');

export function start (host, api) {
  if (live || !host) return;
  H = host; A = api || {}; i = 0; live = true;
  const wrap = document.createElement('div');
  wrap.className = 'gt';
  wrap.innerHTML = '<div class="gt-hole"></div>' +
    '<div class="gt-box" role="dialog"><div class="gt-row"><div class="gt-head"><img alt=""><b></b></div>' +
    '<div class="gt-bub"><p></p></div></div>' +
    '<div class="gt-btns"><i class="gt-n"></i><button type="button" class="gt-skip"></button><button type="button" class="gt-next" autofocus></button></div></div>';
  H.appendChild(wrap);
  box = wrap.querySelector('.gt-box');
  hole = wrap.querySelector('.gt-hole');
  const img = box.querySelector('.gt-head img');
  let who = null;
  try { who = A.person ? A.person() : null; } catch (e) { who = null; }
  if (!TF.bind(img, who, 160)) try { img.src = (A.face && A.face()) || ''; } catch (e) { img.src = ''; }
  img.hidden = !img.src;
  box.querySelector('.gt-head b').textContent = t('Дядя Женя');
  box.querySelector('.gt-skip').innerHTML = keyHTML('back') + esc(t('пропустить'));
  box.querySelector('.gt-skip').addEventListener('click', e => { e.stopPropagation(); skip(); });
  box.querySelector('.gt-next').addEventListener('click', e => { e.stopPropagation(); next(); });
  box.querySelector('.gt-bub').addEventListener('click', () => next());
  wrap.addEventListener('pointerdown', e => e.stopPropagation());     // карусель под затемнением не листается
  addEventListener('resize', place);
  show();
  requestAnimationFrame(() => wrap.classList.add('on'));
}

function show () {
  const s = STEPS[i];
  box.querySelector('.gt-bub p').innerHTML = s.text.map(x => '<span>' + esc(t(x)) + '</span>').join('');
  TF.talk(box.querySelector('.gt-head img'), TF.talkTime(s.text.map(x => t(x)).join(' ')));
  box.querySelector('.gt-n').textContent = (i + 1) + '/' + STEPS.length;
  box.querySelector('.gt-next').innerHTML = keyHTML('ok') + esc(i === STEPS.length - 1 ? t('понял, Дядь Жень') : t('дальше') + ' ▸');
  box.querySelector('.gt-skip').hidden = i === STEPS.length - 1;
  box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
  place();
  setTimeout(place, 380);                          // карточки ещё доезжают — переставить по месту
  setTimeout(place, 900);                          // и ещё раз: на медленном (Дека) доезжают дольше
}

/* цель в листе, который листается внутри себя (гараж не влез по высоте), — докрутить лист, чтобы цель была видна */
function reveal (tg) {
  const sc = tg && tg.closest('.gr-card.on');
  if (!sc || sc.scrollHeight <= sc.clientHeight + 1) return;
  const c = sc.getBoundingClientRect(), r = tg.getBoundingClientRect(), pad = 12;
  if (r.height > c.height - pad * 2 || r.top < c.top + pad) sc.scrollTop += r.top - c.top - pad;
  else if (r.bottom > c.bottom - pad) sc.scrollTop += r.bottom - c.bottom + pad;
}
/* дырка — по рамке цели (обрезана краем экрана и листа); облачко — целиком на экране, где есть место:
   снизу, сверху, справа, слева от цели; нигде не влезает — туда, где меньше всего закрывает цель */
function place () {
  if (!live) return;
  const hr = H.getBoundingClientRect();
  const tg = H.querySelector(STEPS[i].sel);
  reveal(tg);
  const r = tg && tg.getBoundingClientRect();
  const P = 8, G = 14, M = 12;
  const W = hr.width, Hh = hr.height, bw = box.offsetWidth, bh = box.offsetHeight;
  let R = null;
  if (r && r.width > 0) {
    let l = r.left - hr.left - P, tp = r.top - hr.top - P, rr = r.right - hr.left + P, bb = r.bottom - hr.top + P;
    const sc = tg.closest('.gr-card.on');
    if (sc && sc.scrollHeight > sc.clientHeight + 1) {          // часть цели за краем листа — её не видно, не обводим
      const c = sc.getBoundingClientRect();
      tp = Math.max(tp, c.top - hr.top); bb = Math.min(bb, c.bottom - hr.top);
    }
    l = Math.max(2, l); tp = Math.max(2, tp); rr = Math.min(W - 2, rr); bb = Math.min(Hh - 2, bb);
    R = { l, t: tp, w: Math.max(0, rr - l), h: Math.max(0, bb - tp) };
    Object.assign(hole.style, { left: R.l + 'px', top: R.t + 'px', width: R.w + 'px', height: R.h + 'px' });
    hole.hidden = false;
  } else hole.hidden = true;
  const clampX = x => Math.max(M, Math.min(W - bw - M, x));
  const clampY = y => Math.max(M, Math.min(Hh - bh - M, y));
  let x = clampX((W - bw) / 2), y = clampY(Hh - bh - M);
  if (R) {
    const cx = R.l + R.w / 2, cy = R.t + R.h / 2;
    if (Hh - (R.t + R.h) - G >= bh + M) { x = clampX(cx - bw / 2); y = R.t + R.h + G; }
    else if (R.t - G >= bh + M) { x = clampX(cx - bw / 2); y = R.t - G - bh; }
    else if (W - (R.l + R.w) - G >= bw + M) { x = R.l + R.w + G; y = clampY(cy - bh / 2); }
    else if (R.l - G >= bw + M) { x = R.l - G - bw; y = clampY(cy - bh / 2); }
    else {
      // нигде не влезает целиком — из углов и краёв экрана берём место, где облачко меньше всего закрывает цель
      const over = (ax, ay) => Math.max(0, Math.min(ax + bw, R.l + R.w) - Math.max(ax, R.l)) * Math.max(0, Math.min(ay + bh, R.t + R.h) - Math.max(ay, R.t));
      let best = Infinity;
      for (const ax of [M, clampX(cx - bw / 2), W - bw - M]) for (const ay of [M, clampY(cy - bh / 2), Hh - bh - M]) {
        const o = over(clampX(ax), clampY(ay));
        if (o < best - 1) { best = o; x = clampX(ax); y = clampY(ay); }
      }
    }
  }
  box.style.left = Math.round(x) + 'px';
  box.style.top = Math.round(y) + 'px';
}

function next () {
  if (!live) return;
  if (A.Snd && A.Snd.click) A.Snd.click(620 + i * 40, 0.05, 0.04);
  if (++i >= STEPS.length) return end();
  show();
}
export function skip () { if (live) end(); }
function end () {
  live = false;
  removeEventListener('resize', place);
  try { A.Store.set(KEY, 1); if (A.Store.flush) A.Store.flush(); } catch (e) { console.error('[garage tour]', e); }
  const wrap = box && box.parentElement;
  box = hole = null;
  if (wrap) { wrap.classList.remove('on'); setTimeout(() => wrap.remove(), 180); }
  if (A.onEnd) try { A.onEnd(); } catch (e) { console.error('[garage tour]', e); }
}
