/* ──────────────────────────────────────────────────────────────────────────
   Телефон — только боком (автор 11.10.2026: «в целом игра на мобиле должна быть горизонтальной,
   вертикально не поддерживать»). Правила словами — docs/IOS.md «Телефон боком и PWA».

   - На касаниях (как body.touch в game.js) и в мобильном режиме (mobile.js), когда экран стоит (выше, чем шире), —
     поверх всего заставка «поверни телефон»: бордовый фон, логотип, телефон, который сам ложится набок.
     Смена в это время на паузе (game.js touchpadStep зовёт blocked()); меню и стройка города за меню
     идут как шли — кадры не останавливаем. Повернул обратно — заставка уходит, пауза остаётся
     (продолжить — кнопкой, чтобы машина не рванула сама).
   - Стим (компьютер и Дека) — никогда. ?portrait — пустить стоя (проверки probe --size=phone).
   - Где умеет браузер (Android: PWA и полный экран) — замок ориентации «боком» (screen.orientation.lock);
     не умеет (iPhone, обычная вкладка) — молча ничего.
   - PWA на iPhone: после поворота Safari иногда отдаёт старый размер окна и сдвигает страницу вниз на
     высоту строки статуса — сверху чёрная полоса. Лечится в index.html (viewport-fit=cover, строка статуса
     black-translucent) и тут: после поворота страницу — в 0,0 и ещё два пересчёта размера (0,12 и 0,5 с).
   ────────────────────────────────────────────────────────────────────────── */
import './orient.css';
import { ON as MOBILE } from './mobile.js';
import { touchOn } from '../input/touchmode.js';

const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
let STEAM = false;
try { STEAM = import.meta.env.MODE === 'steam'; } catch (e) { /* — */ }
const ALLOW = QS.has('portrait') || STEAM;
const MQ = typeof matchMedia === 'function' ? matchMedia('(orientation: portrait)') : null;

let EL = null;
// ноутбук с тачскрином — не телефон, пока не тронули экран (touchmode.js, 0п67)
const phoneLike = () => MOBILE || touchOn() || (!!document.body && document.body.classList.contains('touch'));
/** стоит ли сейчас телефон «стоя» и закрыт ли экран заставкой */
export function blocked () {
  return !ALLOW && !!MQ && MQ.matches && phoneLike();
}

function build () {
  if (EL || typeof document === 'undefined' || !document.body) return;
  EL = document.createElement('div');
  EL.id = 'turn';
  EL.setAttribute('aria-live', 'polite');
  // телефон: корпус, экран, кнопка; анимация — ложится набок и встаёт обратно (orient.css)
  EL.innerHTML =
    '<img class="tn-logo" src="./brand/logo-px.png" alt="">' +
    '<div class="tn-box"><svg class="tn-ph" viewBox="0 0 40 64" aria-hidden="true" shape-rendering="crispEdges">' +
      '<rect x="4" y="2" width="32" height="60" rx="5" fill="#1e0600"/>' +
      '<rect x="7" y="8" width="26" height="44" fill="#ffb347"/>' +
      '<rect x="10" y="38" width="8" height="8" fill="#5a1608"/><rect x="22" y="34" width="8" height="12" fill="#5a1608"/>' +
      '<rect x="16" y="55" width="8" height="3" rx="1" fill="#5a1608"/>' +
    '</svg>' +
    '<svg class="tn-arr" viewBox="0 0 64 64" aria-hidden="true" shape-rendering="crispEdges">' +
      '<path d="M14 36a20 20 0 0 1 34-18" fill="none" stroke="#fff3d6" stroke-width="5"/>' +
      '<path d="M40 8h14v14z" fill="#fff3d6"/>' +
    '</svg></div>' +
    '<b class="tn-t" data-i18n>поверни телефон</b>' +
    '<span class="tn-s" data-i18n>Птица Пицца играется только боком</span>';
  document.body.appendChild(EL);
}

let shown = null;
function update () {
  if (!EL) build();
  const on = blocked();
  if (EL && on !== shown) { shown = on; EL.classList.toggle('on', on); document.body.classList.toggle('turn-on', on); }
}

/* замок «боком»: Android в PWA и в полном экране; iPhone не умеет — ошибка молча */
function lock () {
  if (ALLOW || !phoneLike()) return;
  try {
    const o = screen.orientation;
    if (o && typeof o.lock === 'function') { const p = o.lock('landscape'); if (p && p.catch) p.catch(() => {}); }
  } catch (e) { /* — */ }
}

/* поворот: страница — в 0,0 (iOS PWA сдвигает её на строку статуса), размер — пересчитать ещё раз
   чуть позже: Safari сразу после поворота отдаёт старые innerWidth / innerHeight */
let fixT1 = 0, fixT2 = 0;
function settle () {
  try { if (scrollX || scrollY) scrollTo(0, 0); } catch (e) { /* — */ }
  update();
}
function rotated () {
  settle();
  clearTimeout(fixT1); clearTimeout(fixT2);
  const again = () => { settle(); try { dispatchEvent(new Event('resize')); } catch (e) { /* — */ } };
  fixT1 = setTimeout(again, 120);
  fixT2 = setTimeout(again, 500);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const start = () => {
    update();
    lock();
    addEventListener('resize', settle);
    addEventListener('orientationchange', rotated);
    if (MQ) { if (MQ.addEventListener) MQ.addEventListener('change', rotated); else if (MQ.addListener) MQ.addListener(rotated); }
    if (window.visualViewport) visualViewport.addEventListener('resize', settle);
    try { if (screen.orientation) screen.orientation.addEventListener('change', rotated); } catch (e) { /* — */ }
    // замок работает только после касания / в полном экране — пробуем ещё раз на первом касании и при входе в полный экран
    addEventListener('pointerdown', lock, { once: true, capture: true });
    document.addEventListener('fullscreenchange', lock);
    // body.touch ставит игра позже (game.js) — пересмотреть, когда она загрузится
    setTimeout(update, 0);
    // 0п36: и при запуске PWA, и при возврате в неё iOS сперва отдаёт размеры окна со строкой статуса — то же, что после поворота
    rotated();
    addEventListener('pageshow', rotated);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') rotated(); });
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  window.__orient = { blocked, update, get shown () { return shown; } };
}

/** зовёт игра раз в кадр (game.js touchpadStep): body.touch мог появиться позже — показать заставку */
export function step () { if (shown !== blocked()) update(); }
