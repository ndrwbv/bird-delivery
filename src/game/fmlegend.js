/* Легенда полной карты (#fullmap .fm-leg в index.html, UI-REVIEW № 38): только то, что сейчас есть на
   карте. game.js при запуске прячет строки, которых в этом режиме не бывает вовсе (data-fm); здесь —
   каждый раз, как карту открыли: «заказ» — только когда везёшь заказ, «бандиты» — когда на карте есть их
   круги, «район закрыт» — пока открыты не все районы. Прячем классом .lg-off (delivery.css).
   Подключён из menu.js (карьера); в Москве легенда — как была.
   С 09.10.2026 (UI-REVIEW № 47) карта — бумажная: лист со сгибами, легенда штампиками (fullmap.css);
   в подсказке сверху «закрыть» — значком кнопки того, чем играют ([B] / Esc; пальцем — тап).
   Телефон стоя (узко, ≤ 600 px): легенда занимала 5 строк над картой — теперь спрятана за пометкой
   «легенда ▾» под картой, тап — раскрыть / свернуть (класс .leg-open на #fullmap, fullmap.css).
   Каждое открытие карты — снова свёрнута. На Деке, компьютере и телефоне боком — как была. */
import './fullmap.css';
import { t } from '../i18n/index.js';
import { keyHTML, inputKind, onInput } from '../input/glyphs.js';
import * as ORD from './orders.js';
import * as ZN from './zones.js';
import * as DIST from './districts.js';

const RULES = {
  'lg-to': () => ORD.activeStops().length > 0,
  'lg-gang': () => ZN.gangZones().length > 0,
  'lg-lock': () => DIST.has() && DIST.opened() < DIST.count(),
};
function sync (box) {
  for (const sp of box.querySelectorAll('.fm-leg > span')) {
    const i = sp.querySelector('i'), k = i && [...i.classList].find(c => RULES[c]);
    if (!k) continue;
    let on = true;
    try { on = !!RULES[k](); } catch (e) { on = true; }
    sp.classList.toggle('lg-off', !on);
  }
}
/* подсказка сверху: зум и «двигать» — словами, «закрыть» — значком кнопки (game.js ставит текст, мы — после него) */
function hint (box) {
  const h = box.querySelector('.fm-top span');
  if (!h) return;
  const k = inputKind().kind;
  if (k === 'touch') return;                      // пальцем — как пишет game.js: «щипок — зум · тяни — двигать · тап — закрыть»
  // курки — по геймпаду: у Xbox и Деки LT/RT, у PlayStation L2/R2 (правило 10 — значки по вводу)
  const trig = inputKind().family === 'ps' ? 'L2/R2' : 'LT/RT';
  h.innerHTML = esc(k === 'pad' ? t('L2/R2 — зум · стик — двигать').replace('L2/R2', trig) : t('колесо или +/− — зум · тяни — двигать')) +
    '<em class="fm-close">' + keyHTML('back') + esc(t('закрыть')) + '</em>';
}
function legLabel (box, btn) { btn.textContent = t('легенда') + (box.classList.contains('leg-open') ? ' ▴' : ' ▾'); }
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
if (typeof document !== 'undefined') {
  const boot = () => {
    const box = document.getElementById('fullmap');
    if (!box) return;
    const leg = box.querySelector('.fm-leg');
    let btn = null;
    if (leg) {                                    // «легенда ▾» — видна только на телефоне стоя (fullmap.css)
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fm-legbtn';
      leg.before(btn);
      btn.addEventListener('click', e => {
        e.stopPropagation();                      // клик по карте закрывает её (game.js) — эту кнопку не считаем
        box.classList.toggle('leg-open');
        legLabel(box, btn);
      });
    }
    new MutationObserver(() => {
      if (box.hidden) return;
      sync(box); hint(box);
      box.classList.remove('leg-open');
      if (btn) legLabel(box, btn);
    }).observe(box, { attributes: true, attributeFilter: ['hidden'] });
    onInput(() => { if (!box.hidden) hint(box); });
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
}
