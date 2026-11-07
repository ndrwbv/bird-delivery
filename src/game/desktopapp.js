/* Общая рамка приложений рабочего стола. Содержимое и ввод остаются у самих приложений. */
import './desktopapp.css';
import { t } from '../i18n/index.js';

export function titlebar (title, icon, close) {
  const bar = document.createElement('header');
  bar.className = 'rf-app-titlebar';
  bar.innerHTML = '<div class="rf-app-lights"><button type="button" data-pad-skip>×</button><i aria-hidden="true"></i><i aria-hidden="true"></i></div><span class="rf-app-title"><img alt=""><b></b></span>';
  bar.querySelector('b').textContent = title;
  bar.querySelector('img').src = icon ? './concepts/dock/' + icon + '.webp' : './brand/logo-px.png';
  const button = bar.querySelector('button');
  button.setAttribute('aria-label', t('закрыть'));
  bar.addEventListener('click', event => { event.stopPropagation(); if (event.target === button) close(); });
  return bar;
}

export function mountApp (layer, key, title, icon, close, frame = layer.querySelector(':scope > .rf-app-frame')) {
  if (document.body.classList.contains('touch')) return null;
  if (!frame) {
    frame = document.createElement('section');
    frame.append(...layer.children);
    layer.append(frame);
  }
  layer.dataset.rfApp = key;
  frame.classList.add('rf-app-frame');
  frame.querySelector(':scope > .rf-app-titlebar')?.remove();
  frame.prepend(titlebar(title, icon, close));
  return frame;
}

export function clearApp (layer) {
  if (!layer.dataset.rfApp) return;
  delete layer.dataset.rfApp;
  layer.querySelector(':scope > .rf-app-frame > .rf-app-titlebar')?.remove();
}
