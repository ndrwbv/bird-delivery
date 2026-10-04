/* Заработок смены на хаде (карьера, docs/CAREER.md «Хад»): пачка купюр, нарисованная кодом, и крупно —
   сколько заработано за эту смену (S.money, как «заработано» в итогах). Своей зелёной плашкой под
   копилкой-свиньёй (piggy.js, розовая плашка; обе — в #cash слева под сердцами), без подписи — только
   пачка и сумма. В конце смены пачка перетекает в копилку (shiftend.js).
   В покое плашка полупрозрачная; деньги пришли или ушли — heat(): непрозрачная и крупнее, потом обратно.
   Каждая оплата — 3—8 купюр (мелочь — монетками) вылетают из кучки денег под машиной (нет кучки — из
   низа экрана по центру) и по дуге летят в пачку; каждая долетевшая — пачка «пухнет», сумма прибавляет
   её долю, на первой — «+сумма» под блоком. Вычет — красная купюра падает из блока вниз, «−сумма».
   Анимация — Web Animations (только transform/opacity), без работы в кадре.
   Видно только во время смены (не в свободной езде и не в меню). */
import './shiftcash.css';

const UP_T = 1.1;          // «+сумма» всплывает столько секунд
const MIN = 1;             // меньше — не всплывает (копейки от округления)
const FLY = {
  T: 0.7,                  // полёт одной купюры, с
  SPREAD: 0.3,             // купюры вылетают одна за другой в пределах стольких секунд
  DELAY: 0.2,              // сначала кучка падает под машину, потом из неё вылетают
  N0: 200,                 // 3 купюры — до 400 ₽, каждое удвоение суммы — ещё одна, не больше 8
  COIN: 400,               // оплата меньше — одни монетки; больше — каждая третья монетка
  DROP: 0.9,               // вычет: красная купюра падает из блока столько секунд
};

/* пачка: три купюры со сдвигом и бумажная банковская лента поперёк; пиксельно, без сглаживания */
const BILL = (x, y, a = '#3f8f3a', b = '#6cc25a', c = '#58ad48', d = '#a8e88e') =>
  `<rect x="${x}" y="${y}" width="26" height="14" fill="${a}"/>` +
  `<rect x="${x + 1}" y="${y + 1}" width="24" height="12" fill="${b}"/>` +
  `<rect x="${x + 3}" y="${y + 3}" width="20" height="8" fill="${c}"/>` +
  `<rect x="${x + 10}" y="${y + 4}" width="6" height="6" fill="${d}"/>` +
  `<rect x="${x + 12}" y="${y + 5}" width="2" height="4" fill="${a}"/>`;
const ICON = '<svg class="sc-ico" viewBox="0 0 32 24" shape-rendering="crispEdges" aria-hidden="true">' +
  BILL(4, 1) + BILL(2, 5) + BILL(0, 9) +
  '<rect x="8" y="8" width="5" height="16" fill="#33210c"/><rect x="9" y="9" width="3" height="14" fill="#fff3d6"/>' +
  '<rect x="9" y="14" width="3" height="2" fill="#e04848"/>' +
  '</svg>';
const SVG = (w, h, body) => `<svg viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>`;
const FLY_BILL = SVG(26, 14, BILL(0, 0));
const FLY_RED = SVG(26, 14, BILL(0, 0, '#7a1e1e', '#e04848', '#c53a3a', '#ff9a9a'));
export const FLY_COIN = SVG(10, 10, '<rect x="2" y="0" width="6" height="10" fill="#8a5a14"/><rect x="0" y="2" width="10" height="6" fill="#8a5a14"/>' +
  '<rect x="1" y="2" width="8" height="6" fill="#ffd85e"/><rect x="2" y="1" width="6" height="8" fill="#ffd85e"/>' +
  '<rect x="3" y="2" width="2" height="2" fill="#fff0a8"/><rect x="4" y="4" width="2" height="3" fill="#c99a2e"/>');

/* кошелёк — копилка-свинья (piggy.js; конец смены — shiftend.js), нарисована кодом пикселями */
export const PIGGY = '<svg class="pg-ico" viewBox="0 0 32 24" shape-rendering="crispEdges" aria-hidden="true">' +
  [[6, 3, 18, 18], [4, 5, 22, 14], [3, 7, 24, 10], [25, 8, 5, 7], [19, 1, 4, 4], [7, 19, 4, 5], [19, 19, 4, 5], [1, 9, 3, 2]]
    .map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#7a2e48"/>`).join('') +
  [[7, 4, 16, 16], [5, 6, 20, 12], [4, 8, 22, 8], [20, 2, 2, 2], [8, 20, 2, 3], [20, 20, 2, 3]]
    .map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f39ab4"/>`).join('') +
  '<rect x="26" y="9" width="3" height="5" fill="#ffb3c8"/><rect x="27" y="10" width="1" height="1" fill="#7a2e48"/>' +
  '<rect x="27" y="12" width="1" height="1" fill="#7a2e48"/><rect x="8" y="6" width="6" height="2" fill="#ffd0de"/>' +
  '<rect x="6" y="15" width="18" height="2" fill="#d9779a"/><rect x="21" y="8" width="2" height="2" fill="#33210c"/>' +
  '<rect x="12" y="5" width="6" height="1" fill="#33210c"/><rect x="13" y="0" width="4" height="4" fill="#c99a2e"/>' +
  '<rect x="14" y="0" width="2" height="3" fill="#ffd85e"/></svg>';

/* акцент плашки денег: непрозрачная и крупнее (класс hot, shiftcash.css) на ms, потом обратно */
export function heat (el, ms) {
  if (!el) return;
  el.classList.add('hot');
  clearTimeout(el._hotT);
  el._hotT = setTimeout(() => el.classList.remove('hot'), ms);
}

let A = null, EL = null, NUM = null, ICO = null;
const ST = { real: 0, shown: 0, pend: 0, on: false, txt: '', fly: new Set() };

/* api: money(n) — сумма, как её видит игрок; S — состояние игры (S.money — за смену) */
export function init (api) {
  A = api;
  const w = document.getElementById('money'), host = w && w.parentNode;
  if (!host || EL) return;
  EL = document.createElement('div');
  EL.id = 'shiftcash';
  EL.className = 'mb';
  EL.hidden = true;
  EL.innerHTML = ICON + '<div class="sc-txt"><b>0</b></div>';
  NUM = EL.querySelector('b'); ICO = EL.querySelector('.sc-ico');
  host.insertBefore(EL, w.nextSibling);
}

/* каждый кадр (из хада карьеры); on — идёт смена */
export function step (dt, on) {
  if (!EL) return;
  if (on !== ST.on) {
    ST.on = on; EL.hidden = !on;
    clearFly();
    if (on) { ST.real = ST.shown = Math.round(A.S.money || 0); ST.txt = ''; }
  }
  if (!on) return;
  const m = Math.round(A.S.money || 0);
  if (m !== ST.real) {
    const d = m - ST.real;
    ST.real = m;
    if (d >= MIN) fly(d);
    else if (d <= -MIN) { drop(); pop(d); }
  }
  const goal = m - ST.pend;   // докручивается только до того, что уже долетело
  ST.shown = Math.abs(goal - ST.shown) < 2 ? goal : ST.shown + (goal - ST.shown) * Math.min(1, dt * 8);
  const v = Math.round(ST.shown), txt = (v < 0 ? '−' : '') + A.money(Math.abs(v));
  if (txt !== ST.txt) { ST.txt = txt; NUM.textContent = txt; }
}

/* откуда летят: кучка денег под машиной (game.js popPay), если она на экране; иначе — низ экрана по центру */
function source () {
  const p = document.querySelector('#payfx:not([hidden]) .pf-pile');
  const r = p && p.getBoundingClientRect();
  if (r && r.width > 0) return [r.left + r.width / 2, r.top + r.height / 2];
  return [innerWidth / 2, innerHeight * 0.8];
}

function flyer (html, cls, x, y) {
  const e = document.createElement('i');
  e.className = 'sc-fly' + cls; e.innerHTML = html;
  e.style.left = x + 'px'; e.style.top = y + 'px';
  document.body.appendChild(e); ST.fly.add(e);
  return e;
}

/* оплата: n купюр по дуге в пачку; сумма делится между ними и прибавляется по прилёту */
function fly (d) {
  const n = Math.max(3, Math.min(8, Math.round(2 + Math.log2(Math.max(1, d) / FLY.N0))));
  const r = ICO.getBoundingClientRect(), tx = r.left + r.width / 2, ty = r.top + r.height / 2;
  if (!(r.width > 0)) { pop(d); return; }
  const [sx, sy] = source(), dx = tx - sx, dy = ty - sy;
  heat(EL, (FLY.DELAY + FLY.SPREAD + FLY.T) * 1000 + 800);
  ST.pend += d;
  let left = d, first = true;
  for (let k = 0; k < n; k++) {
    const share = k === n - 1 ? left : Math.round(d / n); left -= share;
    const coin = d < FLY.COIN || k % 3 === 2;
    const e = flyer(coin ? FLY_COIN : FLY_BILL, coin ? ' c' : '', sx, sy);
    // дуга: квадратичная кривая, вершина — сначала вверх и вбок (у каждой купюры своя), потом в пачку
    const cx = dx * 0.1 + (Math.random() - 0.5) * 160, cy = dy - 40 - Math.random() * 50;
    const r0 = (Math.random() - 0.5) * 60, r1 = r0 + (Math.random() < 0.5 ? -1 : 1) * (200 + Math.random() * 160);
    const fr = [];
    for (let i = 0; i <= 8; i++) {
      const q = i / 8, a = 2 * (1 - q) * q, b = q * q;
      fr.push({ transform: `translate(${(a * cx + b * dx).toFixed(1)}px,${(a * cy + b * dy).toFixed(1)}px) rotate(${(r0 + (r1 - r0) * q).toFixed(0)}deg) scale(${(1.25 - 0.65 * q).toFixed(2)})`,
                opacity: q > 0.95 ? 0 : 1 });
    }
    const delay = (FLY.DELAY + (n > 1 ? k * FLY.SPREAD / (n - 1) : 0)) * 1000;
    let done = false;
    const land = () => {
      if (done) return; done = true;
      e.remove(); ST.fly.delete(e);
      ST.pend = Math.max(0, ST.pend - share);
      puff();
      if (first) { first = false; pop(d); }
    };
    const an = e.animate(fr, { duration: FLY.T * 1000, delay, easing: 'cubic-bezier(.45,0,.75,1)', fill: 'both' });
    an.onfinish = land;
    setTimeout(land, delay + FLY.T * 1000 + 400);   // на всякий случай: анимации не идут (вкладка спрятана) — всё равно долетела
  }
}

/* вычет: красная купюра выпадает из пачки вниз */
function drop () {
  heat(EL, FLY.DROP * 1000 + 900);
  const r = ICO.getBoundingClientRect();
  if (!(r.width > 0)) return;
  const e = flyer(FLY_RED, ' neg', r.left + r.width / 2, r.top + r.height / 2);
  const rot = (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 50);
  const an = e.animate([
    { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
    { transform: `translate(${rot * 0.3}px,30px) rotate(${rot * 0.5}deg)`, opacity: 1, offset: 0.4 },
    { transform: `translate(${rot * 0.5}px,80px) rotate(${rot}deg)`, opacity: 0 },
  ], { duration: FLY.DROP * 1000, easing: 'ease-in', fill: 'both' });
  const end = () => { e.remove(); ST.fly.delete(e); };
  an.onfinish = end; setTimeout(end, FLY.DROP * 1000 + 400);
}

/* долетела купюра — пачка пухнет */
function puff () {
  ICO.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25,1.3)', offset: 0.35 }, { transform: 'scale(1)' }],
    { duration: 220, easing: 'ease-out' });
}

function clearFly () {
  for (const e of ST.fly) e.remove();
  ST.fly.clear(); ST.pend = 0;
}

/* «+сумма» под блоком; вычет — ещё и число краснеет */
function pop (d) {
  const e = document.createElement('i');
  e.className = 'sc-pop' + (d < 0 ? ' neg' : '');
  e.textContent = (d > 0 ? '+' : '−') + A.money(Math.abs(d));
  EL.appendChild(e);
  setTimeout(() => e.remove(), UP_T * 1000);
  EL.classList.remove('bump', 'hurt'); void EL.offsetWidth; EL.classList.add(d > 0 ? 'bump' : 'hurt');
}

/* отладка: что сейчас на хаде; flying — сколько купюр в воздухе, pend — сколько денег ещё летит */
export const DEBUG = {
  get text () { return EL && !EL.hidden ? NUM.textContent : null; }, get real () { return ST.real; },
  get shown () { return Math.round(ST.shown); }, get pend () { return ST.pend; }, get flying () { return ST.fly.size; },
  get hot () { return !!(EL && EL.classList.contains('hot')); }, get el () { return EL; },
};
