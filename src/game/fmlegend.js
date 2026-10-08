/* Легенда полной карты (#fullmap .fm-leg в index.html, UI-REVIEW № 38): только то, что сейчас есть на
   карте. game.js при запуске прячет строки, которых в этом режиме не бывает вовсе (data-fm); здесь —
   каждый раз, как карту открыли: «заказ» — только когда везёшь заказ, «бандиты» — когда на карте есть их
   круги, «район закрыт» — пока открыты не все районы. Прячем классом .lg-off (delivery.css).
   Подключён из menu.js (карьера); в Москве легенда — как была. */
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
if (typeof document !== 'undefined') {
  const boot = () => {
    const box = document.getElementById('fullmap');
    if (!box) return;
    new MutationObserver(() => { if (!box.hidden) sync(box); }).observe(box, { attributes: true, attributeFilter: ['hidden'] });
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
}
