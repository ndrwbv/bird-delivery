/* Заработок смены на хаде (карьера, docs/CAREER.md «Хад»): пачка купюр, нарисованная кодом, и крупно —
   сколько заработано за эту смену (S.money, как «заработано» в итогах). Отдельным блоком над кошельком.
   Каждая оплата — число докручивается, пачка подпрыгивает, рядом всплывает «+сумма» (вычет — красное «−»).
   Видно только во время смены (не в свободной езде и не в меню). */
import './shiftcash.css';
import { t } from '../i18n/index.js';

const UP_T = 1.1;          // «+сумма» всплывает столько секунд
const MIN = 1;             // меньше — не всплывает (копейки от округления)

/* пачка: три купюры со сдвигом и бумажная банковская лента поперёк; пиксельно, без сглаживания */
const BILL = (x, y) =>
  `<rect x="${x}" y="${y}" width="26" height="14" fill="#3f8f3a"/>` +
  `<rect x="${x + 1}" y="${y + 1}" width="24" height="12" fill="#6cc25a"/>` +
  `<rect x="${x + 3}" y="${y + 3}" width="20" height="8" fill="#58ad48"/>` +
  `<rect x="${x + 10}" y="${y + 4}" width="6" height="6" fill="#a8e88e"/>` +
  `<rect x="${x + 12}" y="${y + 5}" width="2" height="4" fill="#3f8f3a"/>`;
const ICON = '<svg class="sc-ico" viewBox="0 0 32 24" shape-rendering="crispEdges" aria-hidden="true">' +
  BILL(4, 1) + BILL(2, 5) + BILL(0, 9) +
  '<rect x="8" y="8" width="5" height="16" fill="#33210c"/><rect x="9" y="9" width="3" height="14" fill="#fff3d6"/>' +
  '<rect x="9" y="14" width="3" height="2" fill="#e04848"/>' +
  '</svg>';

let A = null, EL = null, NUM = null;
const ST = { real: 0, shown: 0, on: false, txt: '' };

/* api: money(n) — сумма, как её видит игрок; S — состояние игры (S.money — за смену) */
export function init (api) {
  A = api;
  const host = document.getElementById('hud-right'), w = document.getElementById('money');
  if (!host || EL) return;
  EL = document.createElement('div');
  EL.id = 'shiftcash';
  EL.hidden = true;
  EL.innerHTML = ICON + '<div class="sc-txt"><span></span><b>0</b></div>';
  NUM = EL.querySelector('b');
  host.insertBefore(EL, w || host.firstChild);
}

/* каждый кадр (из хада карьеры); on — идёт смена */
export function step (dt, on) {
  if (!EL) return;
  if (on !== ST.on) {
    ST.on = on; EL.hidden = !on;
    if (on) { ST.real = ST.shown = Math.round(A.S.money || 0); ST.txt = ''; }
  }
  if (!on) return;
  const cap = EL.querySelector('span'), c = t('за смену');
  if (cap.textContent !== c) cap.textContent = c;
  const m = Math.round(A.S.money || 0);
  if (m !== ST.real) {
    const d = m - ST.real;
    ST.real = m;
    if (Math.abs(d) >= MIN) pop(d);
  }
  ST.shown = Math.abs(m - ST.shown) < 2 ? m : ST.shown + (m - ST.shown) * Math.min(1, dt * 6);
  const v = Math.round(ST.shown), txt = (v < 0 ? '−' : '') + A.money(Math.abs(v));
  if (txt !== ST.txt) { ST.txt = txt; NUM.textContent = txt; }
}

/* «+сумма» над блоком и прыжок пачки */
function pop (d) {
  const e = document.createElement('i');
  e.className = 'sc-pop' + (d < 0 ? ' neg' : '');
  e.textContent = (d > 0 ? '+' : '−') + A.money(Math.abs(d));
  EL.appendChild(e);
  setTimeout(() => e.remove(), UP_T * 1000);
  EL.classList.remove('bump', 'hurt'); void EL.offsetWidth; EL.classList.add(d > 0 ? 'bump' : 'hurt');
}

/* отладка: что сейчас на хаде */
export const DEBUG = { get text () { return EL && !EL.hidden ? NUM.textContent : null; }, get real () { return ST.real; } };
