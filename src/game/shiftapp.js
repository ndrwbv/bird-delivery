/* Окно «На смену» в концепте дока №8-15. Район и настоящий запуск передаёт menu.js. */
import './shiftapp.css';
import { t } from '../i18n/index.js';

let active = null;
export const root = () => active?.node.isConnected && !active.node.closest('[hidden]') ? active.node : null;

export function close (restoreFocus = true) {
  if (!active) return false;
  const { node, onClose } = active;
  active = null;
  node.remove();
  if (restoreFocus) onClose?.();
  return true;
}

export function open (host, { district, preview, onStart, onClose }) {
  if (!host) return;
  const existing = root();
  if (existing) { existing.querySelector('.rf-shift-start').focus({ preventScroll: true }); return; }
  close(false);
  const node = document.createElement('section');
  node.className = 'rf-shift-app';
  node.setAttribute('role', 'dialog');
  node.setAttribute('aria-labelledby', 'rf-shift-app-title');
  node.innerHTML = `
    <header class="rf-shift-header">
      <div class="rf-shift-lights"><button class="rf-shift-close" type="button" data-pad-skip>×</button><i aria-hidden="true"></i><i aria-hidden="true"></i></div>
      <span id="rf-shift-app-title"></span>
    </header>
    <div class="rf-shift-main">
      <div class="rf-shift-album">
        <div class="rf-shift-heading"><p class="rf-shift-label"></p><h2 class="rf-shift-district"></h2><p class="rf-shift-address"></p></div>
        <div class="rf-shift-gallery">
          <figure class="rf-shift-print rf-shift-print-map"><canvas class="rf-shift-map" width="432" height="272" role="img"></canvas></figure>
          <figure class="rf-shift-print rf-shift-print-street"><canvas class="rf-shift-photo" width="432" height="272" role="img"></canvas></figure>
          <figure class="rf-shift-print rf-shift-print-roof"><canvas class="rf-shift-photo" width="432" height="272" role="img"></canvas></figure>
          <div class="rf-shift-seal" aria-hidden="true"><img src="./brand/logo-px.png" alt=""></div>
        </div>
      </div>
      <div class="rf-shift-side">
        <div class="rf-shift-crew">
          <div class="rf-shift-manager"><img alt=""><div><small></small><b></b></div></div>
          <div class="rf-shift-count"><b></b><small></small></div>
          <div class="rf-shift-count"><b></b><small></small></div>
        </div>
        <button class="rf-shift-start" type="button" autofocus data-main><span></span><i aria-hidden="true">›</i></button>
      </div>
    </div>`;
  const closeButton = node.querySelector('.rf-shift-close');
  const startButton = node.querySelector('.rf-shift-start');
  closeButton.setAttribute('aria-label', t('закрыть'));
  node.querySelector('#rf-shift-app-title').textContent = t('Птица Пицца');
  node.querySelector('.rf-shift-label').textContent = t('Текущий район');
  node.querySelector('.rf-shift-district').textContent = district;
  node.querySelector('.rf-shift-address').textContent = preview.address;
  const descriptions = [t('Карта района'), t('Пиццерия с улицы'), t('Пиццерия сверху')];
  node.querySelectorAll('.rf-shift-gallery canvas').forEach((canvas, i) => {
    canvas.setAttribute('aria-label', descriptions[i]);
  });
  const manager = node.querySelector('.rf-shift-manager');
  manager.querySelector('small').textContent = t('управляющая');
  manager.querySelector('b').textContent = preview.manager.name;
  if (preview.manager.avatar) manager.querySelector('img').src = preview.manager.avatar;
  else manager.querySelector('img').hidden = true;
  const counts = node.querySelectorAll('.rf-shift-count');
  counts[0].querySelector('small').textContent = t('Курьеров на смене');
  counts[0].querySelector('b').textContent = preview.onShift;
  counts[1].querySelector('small').textContent = t('Коллег в команде');
  counts[1].querySelector('b').textContent = preview.roster;
  startButton.querySelector('span').textContent = t('Начать смену');
  closeButton.addEventListener('click', () => close());
  startButton.addEventListener('click', () => {
    if (active?.node !== node) return;
    close(false);
    onStart();
  });
  active = { node, onClose };
  host.append(node);
  preview.map(node.querySelector('.rf-shift-map'));
  preview.photos([...node.querySelectorAll('.rf-shift-photo')]);
  startButton.focus({ preventScroll: true });
}
