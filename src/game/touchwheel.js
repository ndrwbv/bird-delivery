/* ──────────────────────────────────────────────────────────────────────────
   Руль на телефоне (11.10.2026, автор: «кнопки вправо-влево заменить на руль, чтобы гибче
   поворачивать»). Правила словами — docs/CAREER.md «Управление на телефоне».

   Круг-руль слева внизу. Палец кладёшь куда угодно на руль — это «прямо»; ведёшь вбок — руль
   поворачивается вслед за пальцем, колёса — пропорционально: 8 % хода у центра — мёртвая зона,
   полный поворот — на 70 px вбок (WHEEL.R). Вращать по ободу сверху — то же самое (палец уходит
   вбок). Вверх-вниз — ничего. Отпустил — руль сам возвращается в центр.
   Это аналог стика геймпада: игра читает IN.joy / IN.jx (как gamepad.js applyToIN), поэтому
   поворот плавный, а не «до упора». Свой палец (pointer capture) — руль и газ жмутся разом.
   ────────────────────────────────────────────────────────────────────────── */
import './touchwheel.css';

export const WHEEL = {
  R: 70,          // px вбок — полный поворот
  DEAD: 0.08,     // мёртвая зона у центра (доля полного)
  DEG: 120,       // на сколько градусов поворачивается картинка руля при полном повороте
  K: 1.35,        // физика крутит на −jx·1.35 (game.js), делим — край руля ровно полный замок
};

const W = { id: null, ox: 0, s: 0, el: null, rim: null, IN: null, onDown: null, wrote: false };

/* руль пиксельный: обод с обмоткой, три спицы, ступица с птичкой-меткой, метка «12 часов» */
const SVG =
  '<svg class="tw-svg" viewBox="0 0 64 64" aria-hidden="true" shape-rendering="crispEdges">' +
    '<circle cx="32" cy="32" r="28" fill="none" stroke="#33210c" stroke-width="9"/>' +
    '<circle cx="32" cy="32" r="28" fill="none" stroke="#5a3a1c" stroke-width="5"/>' +
    '<circle cx="32" cy="32" r="28" fill="none" stroke="#7a5230" stroke-width="5" stroke-dasharray="3 3"/>' +
    '<rect x="29" y="3" width="6" height="7" fill="#f0522a" stroke="#33210c" stroke-width="1"/>' +
    '<path d="M32 32 L6 36 M32 32 L58 36 M32 32 L32 58" stroke="#33210c" stroke-width="7"/>' +
    '<path d="M32 32 L6 36 M32 32 L58 36 M32 32 L32 58" stroke="#8c8a94" stroke-width="3"/>' +
    '<circle cx="32" cy="32" r="10" fill="#33210c"/>' +
    '<circle cx="32" cy="32" r="8" fill="#ffb347"/>' +
    '<rect x="28" y="28" width="8" height="8" fill="#f0522a"/>' +
    '<rect x="30" y="30" width="2" height="2" fill="#fff3d6"/>' +
  '</svg>';

function setS (s) {
  W.s = s;
  if (W.rim) W.rim.style.transform = 'rotate(' + (s * WHEEL.DEG).toFixed(1) + 'deg)';
}
/** отклонение пальца (px) → поворот −1…1: мёртвая зона у центра, дальше — линейно до R */
export function steerOf (dx) {
  const a = Math.min(1, Math.abs(dx) / WHEEL.R);
  if (a <= WHEEL.DEAD) return 0;
  return Math.sign(dx) * (a - WHEEL.DEAD) / (1 - WHEEL.DEAD);
}

function release () {
  if (W.id === null) return;
  W.id = null;
  if (W.el) W.el.classList.remove('on');
  setS(0);
  if (W.IN && W.wrote) { W.IN.joy = 0; W.IN.jx = 0; W.IN.left = 0; W.IN.right = 0; }
  W.wrote = false;
}

/** el — контейнер руля (#touchpad .tp-left), IN — ввод игры, onDown — первое касание (звук) */
export function init (el, IN, onDown) {
  if (!el) return;
  W.el = el; W.IN = IN; W.onDown = onDown || null;
  el.innerHTML = '<div class="tw-wheel">' + SVG + '</div>';
  W.rim = el.querySelector('.tw-wheel');
  el.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (W.id !== null) return;                     // второй палец на руле — не перехватывает
    if (W.onDown) W.onDown();
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* — */ }
    W.id = e.pointerId; W.ox = e.clientX;
    el.classList.add('on');
    setS(0);
    apply();
  });
  el.addEventListener('pointermove', e => {
    if (e.pointerId !== W.id) return;
    setS(steerOf(e.clientX - W.ox));
    apply();
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'])
    el.addEventListener(ev, e => { if (e.pointerId === W.id) release(); });
  el.addEventListener('contextmenu', e => e.preventDefault());
}

/** держишь руль — подтверждаем ввод каждый кадр (пауза и диалоги обнуляют IN); не держишь — ничего */
export function apply () {
  if (W.id === null || !W.IN) return false;
  const s = W.s, IN = W.IN;
  IN.joy = 1; IN.jx = s / WHEEL.K;
  IN.left = s < -0.2 ? 1 : 0; IN.right = s > 0.2 ? 1 : 0;
  W.wrote = true;
  return true;
}
/** руль спрятан (пауза, карта, меню) — отпустить */
export function reset () { release(); }
export const held = () => W.id !== null;
export const value = () => W.s;
if (typeof window !== 'undefined') window.__wheel = { W, WHEEL, steerOf };
