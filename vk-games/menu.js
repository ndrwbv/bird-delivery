/* Главное меню VK: одна кнопка смены в исходном бумажном оформлении. */
import { STARTUP } from './startuptrace.js';
import './menu.css';
import { t } from '../i18n/index.js';
import * as DIST from './districts.js';
import './fmlegend.js';
import * as CCARD from './couriercard.js';
import * as UPD from './update.js';
import * as STORYTEST from './storytest.js';

let A, el, go, garage, debug, faceUrl = '';
const $ = id => document.getElementById(id);

export function init (api) {
  A = api;
  STORYTEST.setMenuShift(() => (A.menuStoryGo || A.menuGo)());
  STORYTEST.onPanelChange(updateDebug);
}

function build () {
  el = document.createElement('div');
  el.id = 'cr-menu';
  el.className = 'vk-start-menu';
  el.innerHTML = `
    <div class="crm-top">
      <div class="crm-head"><img class="crm-mark" src="./brand/logo-px.png" alt=""><div class="crm-logo"></div></div>
    </div>
    <div class="crm-sky"></div>
    <div class="vk-start-actions">
      <div class="crm-card main k-go on">
        <button type="button" class="crm-cb" data-a="go" data-main autofocus>
          <i class="crm-ico" aria-hidden="true">▶</i><b></b>
        </button>
      </div>
      <button type="button" class="vk-start-garage pp-note" data-a="garage"></button>
    </div>
    <div class="crm-meta"><button type="button" class="crm-debug" hidden></button><div class="crm-ver"></div></div>
  `;
  go = el.querySelector('[data-a="go"]');
  garage = el.querySelector('[data-a="garage"]');
  debug = el.querySelector('.crm-debug');
  debug.hidden = !new URLSearchParams(location.search).has('debug');
  go.addEventListener('click', () => activate('go'));
  garage.addEventListener('click', () => activate('garage'));
  debug.addEventListener('click', () => { if (!modal() || STORYTEST.panelRoot()) STORYTEST.togglePanel(); });
  $('big').append(el);
}

function activate (action) {
  if (A.launchSelect) { A.launchSelect(action); return; }
  if ((A.canNavigate && !A.canNavigate()) || modal()) return;
  if (action === 'garage') {
    A.garage(() => { show(); focus(); });
    return;
  }
  STARTUP.request({ menuKey: 'go', district: DIST.cur() });
  A.menuGo();
}

function updateDebug () {
  if (!debug || debug.hidden) return;
  const open = STORYTEST.panelOpen();
  debug.textContent = open ? t('Дебаг оверлей: скрыть') : t('Дебаг оверлей: показать');
  debug.setAttribute('aria-expanded', String(open));
}

export function show () {
  if (!A) return;
  if (!el) build();
  const logo = ($('big-t').textContent || t('Птица Пицца')).trim();
  el.querySelector('.crm-logo').replaceChildren(...logo.split(/\s+/).map(word => {
    const line = document.createElement('span');
    line.textContent = word;
    return line;
  }));
  go.querySelector('b').textContent = t('на смену');
  garage.textContent = t('гараж');
  const version = UPD.version();
  el.querySelector('.crm-ver').textContent = version ? t('версия {v}', { v: String(version).replace(/^v(?=\d)/, '') }) : '';
  updateDebug();
}

export function launchMenu ({ Store, pollPad }) {
  return new Promise(resolve => {
    let frame;
    A = { Store, launchSelect: action => { cancelAnimationFrame(frame); el.inert = true; resolve(action); } };
    const pad = () => {
      frame = requestAnimationFrame(pad);
      if (pollPad().menuOk) go.click();
    };
    show();
    focus();
    frame = requestAnimationFrame(pad);
  });
}

export function resumeLaunch (action, ready) {
  if (!el) return false;
  el.inert = false;
  if (action !== 'go') { activate(action); return false; }
  if (A.canNavigate && !A.canNavigate()) return false;
  STARTUP.request({ menuKey: 'go', district: DIST.cur() });
  A.menuGo(false, ready);
  return true;
}

export const hot = () => false;
export const shiftWindow = () => null;
export const flip = () => false;
export const shown = () => !!(el && el.isConnected && !el.closest('[hidden]'));

export function focus () {
  A?.padClear?.();
  A?.kbClear?.();
  if (shown()) go.focus({ preventScroll: true });
}

export function face () {
  if (!faceUrl && A?.person && A?.face) {
    try { faceUrl = A.face(A.person({ seed: (0x51ED + 0x9E3779B1) >>> 0 }), 96); } catch { /* портрет необязателен */ }
  }
  return faceUrl;
}

export function openStats (after) {
  CCARD.open({ Store: A.Store, money: A.money, face: face(), onClose: () => {
    if (after) after(); else { show(); focus(); }
  } });
}

export const modal = () => CCARD.root() || (A?.S?.state === 'title' ? STORYTEST.panelRoot() : null);
export function back () {
  if (CCARD.root()) { CCARD.close(); return true; }
  if (STORYTEST.panelRoot()) { STORYTEST.togglePanel(false); focus(); return true; }
  return false;
}

/* ── камера заставки: медленный облёт на высоте; меню — полосой внизу, поэтому пиццерия —
   по центру в верхней половине кадра (смотрим ниже её) ── */
export function cam (c, P, tG) {
  const a = tG * 0.035 + 0.8;
  const R = 92 + Math.sin(tG * 0.021) * 8, H = 46 + Math.sin(tG * 0.027) * 5;
  const x = P.bx + Math.sin(a) * R, z = P.bz + Math.cos(a) * R;
  c.position.set(x, P.by + H, z);
  c.lookAt(P.bx, P.by - (c.aspect > 1.15 ? 26 : 18), P.bz);
}
