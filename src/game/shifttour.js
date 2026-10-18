/* Обучение на чеке смены (11.10.2026, автор: «после конца смены надо сделать онбординг в этот интерфейс.
   Сказать, что вот гараж есть, вот тут депнуть можно»). Один раз на профиль: когда чек первой смены
   допечатался, Толик облачками (как Дядя Женя в гараже — garagetour.js, тот же вид garagetour.css)
   за 3—4 шага показывает, что тут где. Каждый шаг — подсветка настоящей кнопки чека (всё вокруг
   затемнено) и одна строка; портрет Толика говорит ртом (talkface.js).

     1. итог «за смену»            — «это чек — сколько заработал»
     2. «гараж и траты» (#ov-spend) — «гараж и траты — тут машины, броня и ремонт»
     3. «депнуть» (#ov-dep)         — «депнуть — если чешутся руки» (только взрослая версия и есть что ставить)
     4. штамп «на новую смену»     — «на новую смену — когда готов»

     TOUR.need(Store)        — ещё не показывали (флага 'dlv-shift-tut' нет; не в песочнице)
     TOUR.start(host, api)   — host — #over; api: { Store, Snd, person() → Толик (портрет говорит ртом), face() → dataURL, onEnd }
     TOUR.on(), TOUR.root()  — пока идёт, career.js padRoot() — это облачко: геймпад и клавиатура жмут его кнопки
     TOUR.skip()             — «пропустить» (career.js back(): B / Esc / Backspace)

   Дальше — кнопка «дальше», A / Enter / пробел, тап по облачку. Пропустить — кнопка, B / Esc. Значков
   на кнопках нет — как управлять, пишет полоска внизу чека (career.js endKeys: «[A] дальше · [B] пропустить»).
   Досмотрел или пропустил — флаг ставится, больше не покажется; «сбросить прогресс» его стирает
   (PROGRESS_KEYS в game.js). Вопрос «оставить путь на дороге?» (routeask.js) ждёт, пока обучение не кончится. */
import './garagetour.css';
import { t } from '../i18n/index.js';
import * as TF from './talkface.js';              // Толик говорит ртом
import * as TEL from './telemetry.js';          // анонимная статистика: обучение досмотрел / пропустил — воронка (telemetry.js)

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const KEY = 'dlv-shift-tut';
const N_ = s => s;
/* что подсвечиваем (селектор внутри #over) и что говорит Толик — строка на шаг */
const STEPS = [
  { sel: '.cr-rc .cr-rc-end > .pp-total', alt: '.cr-rc', text: N_('это чек — сколько заработал') },
  { sel: '#ov-spend', text: N_('гараж и траты — тут машины, броня и ремонт') },
  { sel: '#ov-dep', text: N_('депнуть — если чешутся руки'), opt: true },
  { sel: '#ov-again', text: N_('на новую смену — когда готов') },
];

let H = null, A = null, box = null, hole = null, i = 0, live = false, steps = STEPS, armAt = 0;
const ARM = 450;                                   // мс: новое облачко первые 0,45 с не жмётся — кто долбил A, допечатывая чек, не пролистает не глядя
/* чек убрали (новая смена, меню), а обучение не досмотрели — считаем показанным, ввод не держим */
const alive = () => { if (live && (!H || !H.isConnected || H.hidden)) end(); return live; };
export const on = () => alive();
export const root = () => (alive() ? box : null);
export const need = Store => !!Store && !Store.get(KEY, 0) && !new URLSearchParams(location.search).has('sandbox');

const vis = el => !!(el && !el.hidden && el.offsetParent !== null && el.getClientRects().length);
const target = s => { const a = H && H.querySelector(s.sel); return vis(a) ? a : (s.alt ? H.querySelector(s.alt) : a); };

export function start (host, api) {
  if (live || !host) return;
  H = host; A = api || {}; i = 0; armAt = performance.now() + ARM;
  steps = STEPS.filter(s => !s.opt || vis(host.querySelector(s.sel)));   // «депнуть» спрятан (детская, нечего ставить) — без этого шага
  live = true;
  const wrap = document.createElement('div');
  wrap.className = 'gt st-tour';
  wrap.innerHTML = '<div class="gt-hole"></div>' +
    '<div class="gt-box" role="dialog"><div class="gt-row"><div class="gt-head"><img alt=""><b></b></div>' +
    '<div class="gt-bub"><p></p></div></div>' +
    '<div class="gt-btns"><i class="gt-n"></i><button type="button" class="gt-skip"></button><button type="button" class="gt-next" autofocus></button></div></div>';
  H.appendChild(wrap);
  H.classList.add('st-on');
  box = wrap.querySelector('.gt-box');
  hole = wrap.querySelector('.gt-hole');
  const img = box.querySelector('.gt-head img');
  let who = null;
  try { who = A.person ? A.person() : null; } catch (e) { who = null; }
  if (!TF.bind(img, who, 160)) try { img.src = (A.face && A.face()) || ''; } catch (e) { img.src = ''; }
  img.hidden = !img.src;
  box.querySelector('.gt-head b').textContent = t('Толик');
  box.querySelector('.gt-skip').textContent = t('пропустить');
  box.querySelector('.gt-skip').addEventListener('click', e => { e.stopPropagation(); skip(); });
  box.querySelector('.gt-next').addEventListener('click', e => { e.stopPropagation(); next(); });
  box.querySelector('.gt-bub').addEventListener('click', () => next());
  wrap.addEventListener('pointerdown', e => e.stopPropagation());     // под затемнением ничего не жмётся
  wrap.addEventListener('click', e => e.stopPropagation());
  addEventListener('resize', place);
  show();
  requestAnimationFrame(() => wrap.classList.add('on'));
  if (A.onStart) try { A.onStart(); } catch (e) { console.error('[shift tour]', e); }
}

function show () {
  const s = steps[i];
  box.querySelector('.gt-bub p').innerHTML = '<span>' + esc(t(s.text)) + '</span>';
  TF.talk(box.querySelector('.gt-head img'), TF.talkTime(t(s.text)));
  box.querySelector('.gt-n').textContent = (i + 1) + '/' + steps.length;
  box.querySelector('.gt-next').textContent = i === steps.length - 1 ? t('понял') : t('дальше') + ' ▸';
  box.querySelector('.gt-skip').hidden = i === steps.length - 1;
  box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
  try { box.querySelector('.gt-next').focus({ preventScroll: true }); } catch (e) { /* — */ }
  place();
  setTimeout(place, 380);
}

/* дырка — по рамке цели; облачко — целиком на экране, где есть место: снизу, сверху, справа, слева от цели */
function place () {
  if (!live) return;
  const hr = H.getBoundingClientRect();
  const tg = target(steps[i]);
  const r = tg && tg.getBoundingClientRect();
  const P = 8, G = 14, M = 12;
  const W = hr.width, Hh = hr.height, bw = box.offsetWidth, bh = box.offsetHeight;
  let R = null;
  if (r && r.width > 0) {
    let l = r.left - hr.left - P, tp = r.top - hr.top - P, rr = r.right - hr.left + P, bb = r.bottom - hr.top + P;
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
    if (R.t - G >= bh + M) { x = clampX(cx - bw / 2); y = R.t - G - bh; }                 // чек внизу экрана — облачко над целью
    else if (Hh - (R.t + R.h) - G >= bh + M) { x = clampX(cx - bw / 2); y = R.t + R.h + G; }
    else if (W - (R.l + R.w) - G >= bw + M) { x = R.l + R.w + G; y = clampY(cy - bh / 2); }
    else if (R.l - G >= bw + M) { x = R.l - G - bw; y = clampY(cy - bh / 2); }
    else {
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
  if (!live || performance.now() < armAt) return;
  armAt = performance.now() + 200;
  if (A.Snd && A.Snd.click) try { A.Snd.click(620 + i * 40, 0.05, 0.04); } catch (e) { /* — */ }
  if (++i >= steps.length) return end();
  show();
}
export function skip () { if (live && performance.now() >= armAt) end(); }
function end () {
  live = false;
  TEL.first('tour.shift', { step: Math.min(i + 1, steps.length), of: steps.length, skip: i + 1 < steps.length ? 1 : 0 });
  removeEventListener('resize', place);
  try { A.Store.set(KEY, 1); if (A.Store.flush) A.Store.flush(); } catch (e) { console.error('[shift tour]', e); }
  const wrap = box && box.parentElement;
  box = hole = null;
  if (H) H.classList.remove('st-on');
  if (wrap) { wrap.classList.remove('on'); setTimeout(() => wrap.remove(), 180); }
  if (A.onEnd) try { A.onEnd(); } catch (e) { console.error('[shift tour]', e); }
}

export const DEBUG = {
  get state () { return { on: live, step: i, steps: steps.map(s => s.sel), seen: !!(A && A.Store && A.Store.get(KEY, 0)) }; },
  next, skip,
};
