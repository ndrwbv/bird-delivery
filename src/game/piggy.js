/* Копилка-свинья на хаде (карьера, docs/CAREER.md «Хад»): кошелёк — свинья, нарисованная кодом, и сумма,
   своей розовой плашкой слева под сердцами, над пачкой «за смену» (shiftcash.js, зелёная плашка).
   Куда текут деньги:
     — во время смены копилка показывает кошелёк БЕЗ заработанного за эту смену: оплата, чаевые, находки
       летят купюрами в пачку, а в копилку всё это падает в конце смены (shiftend.js, «деньги кучей» —
       куча перетекает в свинью, сумма копилки докручивается);
     — траты из кошелька (мзда, воскрешение, ремонт и покупки, турель…) — монеты вылетают из свиньи,
       «−сумма» красным; вычет больше, чем в пачке, — остаток тоже из свиньи;
     — приход в кошелёк не через смену (выигрыш ставки, продажа машины) — монеты летят в свинью.
   В покое плашка полупрозрачная; деньги пришли или ушли — непрозрачная и крупнее (SC.heat), потом обратно.
   Анимация — Web Animations (transform/opacity), без работы в кадре.

     init({ el, money, wallet, S, shiftOn, playing }) — el — #money; step(dt) — каждый кадр */
import { heat, FLY_COIN, PIGGY } from './shiftcash.js';

const FLY = { T: 0.65, SPREAD: 0.25, OUT: 0.8 };   // полёт монеты в свинью / из неё, с
const UP_T = 1.1;

let A = null, EL = null, NUM = null, ICO = null;
const PG = { last: undefined, shown: 0, pend: 0, held: null, quiet: 0, txt: '', fly: new Set() };

export function init (api) {
  A = api; EL = api.el;
  if (!EL) return;
  EL.classList.add('mb');
  EL.innerHTML = PIGGY + '<b>0</b>';
  NUM = EL.querySelector('b'); ICO = EL.querySelector('.pg-ico');
}

/* сколько показывает копилка: в смене — кошелёк минус заработанное за смену (оно ещё в пачке) */
function target () {
  const w = Math.round(+A.wallet() || 0);
  return PG.held ? Math.max(0, w - Math.max(0, Math.round(A.S.money || 0))) : w;
}

export function step (dt) {
  if (!EL) return;
  const held = !!A.shiftOn();
  if (held !== PG.held) { PG.held = held; PG.quiet = 0.5; }   // смена началась / кончилась — без полёта (экран итогов сам покажет)
  const v = target();
  if (PG.last === undefined) PG.last = PG.shown = v;
  if (v !== PG.last) {
    const d = v - PG.last;
    PG.last = v;
    const live = PG.quiet <= 0 && (held || A.playing()) && Math.abs(d) >= 1;
    if (!live) { clearFly(); PG.shown = v; }
    else if (d > 0) flyIn(d);
    else giveOut(d);
  }
  if (PG.quiet > 0) PG.quiet -= dt;
  const goal = v - PG.pend;
  PG.shown = Math.abs(goal - PG.shown) < 2 ? goal : PG.shown + (goal - PG.shown) * Math.min(1, dt * 7);
  const txt = A.money(Math.round(PG.shown));
  if (txt !== PG.txt) { PG.txt = txt; NUM.textContent = txt; }
}

function flyer (x, y) {
  const e = document.createElement('i');
  e.className = 'sc-fly c pg-fly'; e.innerHTML = FLY_COIN;
  e.style.left = x + 'px'; e.style.top = y + 'px';
  document.body.appendChild(e); PG.fly.add(e);
  return e;
}
const coinsFor = d => Math.max(3, Math.min(6, Math.round(1 + Math.log2(Math.max(1, Math.abs(d)) / 300))));

/* приход: монеты из низа экрана по дуге в свинью, сумма прибавляется по прилёту */
function flyIn (d) {
  const r = ICO.getBoundingClientRect();
  if (!(r.width > 0)) { PG.shown = PG.last; return; }
  const n = coinsFor(d), tx = r.left + r.width / 2, ty = r.top + r.height / 2;
  const sx = innerWidth / 2, sy = innerHeight * 0.8, dx = tx - sx, dy = ty - sy;
  heat(EL, (FLY.SPREAD + FLY.T) * 1000 + 800);
  PG.pend += d;
  let left = d, first = true;
  for (let k = 0; k < n; k++) {
    const share = k === n - 1 ? left : Math.round(d / n); left -= share;
    const e = flyer(sx, sy);
    const cx = dx * 0.1 + (Math.random() - 0.5) * 140, cy = dy - 40 - Math.random() * 40;
    const fr = [];
    for (let i = 0; i <= 8; i++) {
      const q = i / 8, a = 2 * (1 - q) * q, b = q * q;
      fr.push({ transform: `translate(${(a * cx + b * dx).toFixed(1)}px,${(a * cy + b * dy).toFixed(1)}px) scale(${(1.3 - 0.6 * q).toFixed(2)})`, opacity: q > 0.95 ? 0 : 1 });
    }
    const delay = (n > 1 ? k * FLY.SPREAD / (n - 1) : 0) * 1000;
    let done = false;
    const land = () => {
      if (done) return; done = true;
      e.remove(); PG.fly.delete(e);
      PG.pend = Math.max(0, PG.pend - share);
      puff();
      if (first) { first = false; pop(d); }
    };
    const an = e.animate(fr, { duration: FLY.T * 1000, delay, easing: 'cubic-bezier(.45,0,.75,1)', fill: 'both' });
    an.onfinish = land;
    setTimeout(land, delay + FLY.T * 1000 + 400);
  }
}

/* трата: свинья вздрагивает, монеты выскакивают из неё вверх и падают вниз, «−сумма» красным */
function giveOut (d) {
  const r = ICO.getBoundingClientRect();
  heat(EL, FLY.OUT * 1000 + 900);
  pop(d);
  ICO.animate([{ transform: 'none' }, { transform: 'translateX(-2px) rotate(-8deg)', offset: 0.2 }, { transform: 'translateX(2px) rotate(8deg)', offset: 0.45 },
    { transform: 'translateX(-1px) rotate(-4deg)', offset: 0.7 }, { transform: 'none' }], { duration: 420, easing: 'linear' });
  if (!(r.width > 0)) return;
  const n = coinsFor(d), sx = r.left + r.width * 0.5, sy = r.top + r.height * 0.2;
  for (let k = 0; k < n; k++) {
    const e = flyer(sx, sy);
    const vx = (Math.random() - 0.5) * 120 + 30, up = 30 + Math.random() * 30, fall = 90 + Math.random() * 60;
    const an = e.animate([
      { transform: 'translate(0,0) scale(.8)', opacity: 1 },
      { transform: `translate(${(vx * 0.4).toFixed(0)}px,${-up.toFixed(0)}px) scale(1.15)`, opacity: 1, offset: 0.35 },
      { transform: `translate(${vx.toFixed(0)}px,${fall.toFixed(0)}px) scale(1)`, opacity: 0 },
    ], { duration: FLY.OUT * 1000, delay: k * 70, easing: 'cubic-bezier(.3,.2,.6,1)', fill: 'both' });
    const end = () => { e.remove(); PG.fly.delete(e); };
    an.onfinish = end; setTimeout(end, FLY.OUT * 1000 + k * 70 + 400);
  }
}

function puff () {
  ICO.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.3,1.25)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
}

function pop (d) {
  const e = document.createElement('i');
  e.className = 'sc-pop' + (d < 0 ? ' neg' : '');
  e.textContent = (d > 0 ? '+' : '−') + A.money(Math.abs(d));
  EL.appendChild(e);
  setTimeout(() => e.remove(), UP_T * 1000);
  EL.classList.remove('bump', 'hurt'); void EL.offsetWidth; EL.classList.add(d > 0 ? 'bump' : 'hurt');
}

function clearFly () {
  for (const e of PG.fly) e.remove();
  PG.fly.clear(); PG.pend = 0;
}

/* отладка: что показывает копилка; held — смена идёт (заработок ещё в пачке) */
export const DEBUG = {
  get text () { return NUM ? NUM.textContent : null; }, get shown () { return Math.round(PG.shown); }, get target () { return PG.last; },
  get held () { return PG.held; }, get flying () { return PG.fly.size; }, get hot () { return !!(EL && EL.classList.contains('hot')); }, get el () { return EL; },
};
