/* Обучение в гараже: первый раз за всё время, когда открыли экран гаража (из меню
   или с итогов смены), Дядя Женя за 6 шагов показывает, что тут где. Каждый шаг —
   подсветка настоящей части экрана (всё вокруг затемнено) и облачко с его лицом.

     TOUR.need(Store)          — ещё не показывали (флаг 'dlv-garage-tut' нет)
     TOUR.start(host, api)     — host — #cr-garage; api: { Store, face() → dataURL, Snd }
     TOUR.on(), TOUR.root()    — для геймпада и клавиатуры: пока идёт, garage.root() — это облачко
     TOUR.skip()               — «пропустить» (и Esc / B — garage.close() во время обучения)

   Дальше — кнопка «дальше», Enter / пробел, A, клик по облачку. Пропустить — кнопка,
   Esc / Backspace, B. Досмотрел или пропустил — флаг ставится, больше не покажется;
   «сбросить прогресс» его стирает (PROGRESS_KEYS в game.js). */
import './garagetour.css';
import { t } from '../i18n/index.js';
import { keyHTML } from '../input/glyphs.js';     // [A] дальше · [B] пропустить — по вводу

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const KEY = 'dlv-garage-tut';
const N_ = s => s;
/* что подсвечиваем (селектор внутри гаража) и что говорит Дядя Женя */
const STEPS = [
  { sel: '.gr-card.on .gr-pic', text: N_('здорово! я Дядя Женя, это мой гараж. тачки стоят тут — листай ◀ ▶, какая глянется, ту и бери') },
  { sel: '.gr-wallet', text: N_('это твоя копилка и звёзды ★. звёзды дают за хорошие смены. без звёзд крутую тачку не продам, хоть мешок денег принеси') },
  { sel: '.gr-card.on .gr-acts', text: N_('тут кнопки: купить, выбрать на смену, броня (+1 ♥) и мотор (быстрее едет). прокачиваю только свои тачки — чужое не трогаю') },
  { sel: '.gr-card.on .gr-row', text: N_('надоел цвет — перекрашу за денежку, жми «покрасить». надоела тачка — куплю за полцены, только не ту, на которой ездишь') },
  { sel: '.gr-card.on .gr-stats', text: N_('а это мотор и ресурс. мотор изнашивается от езды и ударов, ниже 70 % — начнёт глохнуть. заезжай в мой гараж на районе (ключик на радаре) — подтяну до ресурса за денежку. но ресурс с каждым ремонтом меньше — кончится, бери новую') },
  { sel: '.gr-back', text: N_('насмотрелся — жми «назад». заходи ещё, чайник всегда горячий') },
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
  try { img.src = (A.face && A.face()) || ''; } catch (e) { img.src = ''; }
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
  box.querySelector('.gt-bub p').textContent = t(s.text);
  box.querySelector('.gt-n').textContent = (i + 1) + '/' + STEPS.length;
  box.querySelector('.gt-next').innerHTML = keyHTML('ok') + esc(i === STEPS.length - 1 ? t('понял, Дядь Жень') : t('дальше') + ' ▸');
  box.querySelector('.gt-skip').hidden = i === STEPS.length - 1;
  box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
  place();
  setTimeout(place, 380);                          // карточки ещё доезжают — переставить по месту
}

/* дырка — по рамке цели; облачко — где больше места: снизу, сверху, справа, слева,
   а если нигде не влезает — внизу экрана поверх (на телефоне стоя) */
function place () {
  if (!live) return;
  const hr = H.getBoundingClientRect();
  const tg = H.querySelector(STEPS[i].sel);
  const r = tg && tg.getBoundingClientRect();
  const P = 8, G = 14, M = 12;
  let R = null;
  if (r && r.width > 0) {
    R = { l: r.left - hr.left - P, t: r.top - hr.top - P, w: r.width + P * 2, h: r.height + P * 2 };
    Object.assign(hole.style, { left: R.l + 'px', top: R.t + 'px', width: R.w + 'px', height: R.h + 'px' });
    hole.hidden = false;
  } else hole.hidden = true;
  const W = hr.width, Hh = hr.height, bw = box.offsetWidth, bh = box.offsetHeight;
  const clampX = x => Math.max(M, Math.min(W - bw - M, x));
  const clampY = y => Math.max(M, Math.min(Hh - bh - M, y));
  let x = (W - bw) / 2, y = Hh - bh - M;
  if (R) {
    const cx = R.l + R.w / 2, cy = R.t + R.h / 2;
    if (Hh - (R.t + R.h) - G >= bh + M) { x = clampX(cx - bw / 2); y = R.t + R.h + G; }
    else if (R.t - G >= bh + M) { x = clampX(cx - bw / 2); y = R.t - G - bh; }
    else if (W - (R.l + R.w) - G >= bw + M) { x = R.l + R.w + G; y = clampY(cy - bh / 2); }
    else if (R.l - G >= bw + M) { x = R.l - G - bw; y = clampY(cy - bh / 2); }
    else y = cy > Hh / 2 ? M : Hh - bh - M;          // нигде не влезает — с другой стороны от цели, поверх
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
