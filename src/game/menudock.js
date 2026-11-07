/* №8-15. Док iOS 6 / старой macOS: объёмные предметные иконки на полочке. Оболочка меню,
   настоящие кнопки, заказ и чек остаются у существующих модулей. */
import './menudock.css';
import { t } from '../i18n/index.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tx = s => esc(t(s));

function bounceOnActivation (track) {
  let pending = null, replay = null;
  track.addEventListener('click', event => {
    const button = event.target.closest('button[data-main]');
    if (!button || button === replay || button.disabled || button.closest('.off')) return;
    const card = button.closest('.cz-card');
    const icon = card?.querySelector('.rf-icon-image');
    if (!icon?.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    pending?.cancel();
    const bounce = icon.animate([
      { transform: 'translateY(0)', easing: 'ease-out' },
      { transform: 'translateY(-20px)', offset: .34, easing: 'ease-in' },
      { transform: 'translateY(0)', offset: .67, easing: 'ease-out' },
      { transform: 'translateY(-5px)', offset: .81, easing: 'ease-in' },
      { transform: 'translateY(0)' },
    ], { duration: 320 });
    pending = bounce;
    bounce.finished.then(() => {
      if (pending !== bounce) return;
      pending = null;
      if (!button.isConnected || button.closest('[hidden]') || !card.classList.contains('on')) return;
      replay = button;
      try { button.click(); } finally { replay = null; }
    }, () => {});
  }, true);
}

function dockFrame (paused) {
  const frame = document.createElement('section');
  frame.className = 'rf-window' + (paused ? ' rf-window-pause' : '');
  frame.innerHTML = '<div class="rf-site-head"><div class="rf-bar-left"><strong>' + tx('Солнечный') + '</strong><span>' + tx(paused ? 'пауза' : 'главное меню') + '</span></div><div class="rf-foot-hint"></div><div class="rf-bar-context"></div><div class="rf-head-right"></div><div class="rf-bar-meta"></div></div><div class="rf-body"></div>';
  return frame;
}

export function mountStart (root) {
  root.classList.add('rf-menu');
  const frame = dockFrame(false);
  frame.querySelector('.rf-head-right').append(root.querySelector('.crm-me'));
  const body = frame.querySelector('.rf-body');
  body.innerHTML = '<section class="rf-start-actions rf-dock"></section>';
  body.querySelector('.rf-start-actions').append(root.querySelector('.crm-car'));
  frame.querySelector('.rf-foot-hint').append(root.querySelector('.crm-hint'));
  frame.querySelector('.rf-bar-meta').append(root.querySelector('.crm-meta'));
  frame.querySelector('.rf-bar-context').append(root.querySelector('.crm-upd'));
  root.append(frame);
  decorateCards(root, '.crm-card', '.crm-ico');
  const track = root.querySelector('.crm-car .cz-track');
  bounceOnActivation(track);
  new MutationObserver(() => decorateCards(root, '.crm-card', '.crm-ico')).observe(track, { childList: true });
}

function decorateCards (root, selector, target) {
  const files = { go: 'pizza-game', quick: 'quick', garage: 'garage-game', ride: 'map', honor: 'honor', board: 'honor', collect: 'collect', settings: 'settings', quit: 'end', map: 'map', set: 'settings', end: 'end', keys: 'controls', music: 'music', replay: 'quick' };
  for (const card of root.querySelectorAll(selector)) {
    const icon = card.querySelector(target);
    const file = card.dataset.key === 'go' && target === '.rf-pause-icon' ? 'resume' : files[card.dataset.key];
    if (icon && file) icon.innerHTML = '<img class="rf-icon-image" src="./concepts/dock/' + file + '.webp" alt="" draggable="false">';
  }
  root.querySelector('.rf-dock')?.style.setProperty('--dock-count', root.querySelectorAll(selector).length);
  const district = root.querySelector('.crm-card .crm-sub');
  if (district) {
    root.querySelector('.rf-bar-context .crm-sub')?.remove();
    root.querySelector('.rf-bar-context').append(district);
  } else root.querySelector('.rf-bar-context .crm-sub')?.remove();
}

export function mountPause (root) {
  root.classList.add('rf-pause');
  const frame = dockFrame(true);
  frame.querySelector('.rf-head-right').innerHTML = '<div class="rf-paused-pill"><i></i>' + tx('Игра на паузе') + '</div>';
  const body = frame.querySelector('.rf-body');
  body.innerHTML = '<section class="rf-pause-sheets"></section><section class="rf-pause-dock rf-dock"></section>';
  body.querySelector('.rf-pause-dock').append(root.querySelector('.pz-host'));
  body.querySelector('.rf-pause-sheets').append(root.querySelector('.pz-top'));
  frame.querySelector('.rf-foot-hint').append(root.querySelector('.pz-hint'));
  const version = root.querySelector('.pm-ver');
  if (version) frame.querySelector('.rf-bar-meta').append(version);
  root.append(frame);
  for (const card of root.querySelectorAll('.pz-card')) {
    const icon = document.createElement('i');
    icon.className = 'rf-pause-icon'; icon.setAttribute('aria-hidden', 'true');
    card.append(icon);
  }
  decorateCards(root, '.pz-card', '.rf-pause-icon');
  bounceOnActivation(root.querySelector('.pz-host .cz-track'));
}
