/* Главное меню карьеры (Стим). С 04.10.2026 — карусель карточек, как выбор машины в гараже
   (carousel.js); с 04.10 вечера — компактная полоса внизу экрана, верх — под живой город (камера
   медленно облетает пиццерию). Листать — свайп, ◀ ▶, ←→, стик и крестовина, LB/RB; выбрать —
   A / Enter / тап — как выбрать, подсказывает только строка внизу (на карточках значка кнопки нет, автор 10.10.2026).
   Сверху слева — логотип бренда: квадратная птица с пиццей (public/brand/logo-px.png) и «Птица Пицца» жирным
   Rubik Mono One (в переводе — как в словаре, t('Птица Пицца')), справа — Женя и карточка статистики курьера; (сборка с GitHub) плашка «есть новая версия — обновить» (update.js),
   внизу справа — номер версии. Правила — docs/CAREER.md «Главное меню».

     MENU.init(api)   — из career.js (api — тот же, что у карьеры, + crew() и garage())
     MENU.show({ openShift }) — собрать карточки. При входе в меню выбрать «На смену» и открыть окно района.
     MENU.flip(±1)    — листать (career.js padPre / onKey); MENU.focus() — фокус на карточке в центре
     MENU.cam(cam, P, tG) — камера заставки
     MENU.modal()     — открытое окно (статистика или выбор района: геймпад, клавиатура) или null; MENU.back() — закрыть
     Район (districts.js): карточки района нет; открыто больше одного (не все) — на карточке «на смену»
       кнопка «сменить район» (карусель районов distpick.js: открытые — «на смену здесь», закрытые — что там
       и сколько смен до открытия); открыто всё —
       выбор перед каждой сменой (cityopen.js picker)
     MENU.face()      — постоянный портрет курьера (data:URL)
     Таблица рекордов (board.js): карточка только в Стим-сборке, окно — тоже modal()
     Доска почёта (honor.js): достижения и рекорды карьеры, окно — тоже modal()

   В Яндексе и Москве (?nocareer) модуль не работает: его зовёт только career.js. */
import { STARTUP } from './startuptrace.js';
import './menu.css';
import { t } from '../i18n/index.js';
import { heroName } from './playername.js';
import * as DIST from './districts.js';
import * as CITY from './cityopen.js';
import { keyHTML, onInput, inputKind } from '../input/glyphs.js';   // значки кнопок по текущему вводу
import './fmlegend.js';                       // легенда полной карты — только то, что сейчас на карте
import * as BOARD from './board.js';
import * as HONOR from './honor.js';            // доска почёта: достижения и рекорды (honor.js)
import * as CCARD from './couriercard.js';      // статистика одной карьеры, без выбора/переименования
import * as QR from './quickrun.js';             // быстрый заезд: сезон, длина смены, машина — без копилки и сюжета
import * as UPD from './update.js';              // плашка «есть новая версия — обновить» (update.js)
import { carousel } from './carousel.js';
import * as PFX from './paperfx.js';
import * as DP from './distpick.js';            // выбор района — карусель карточек (distpick.js)
import * as STORYTEST from './storytest.js';      // отладочная панель сюжета у номера версии
import { mountStart } from './menudock.js';
import * as SHIFTAPP from './shiftapp.js';

let A = null, el = null, CZ = null, curKey = 'go';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function init (api) {
  A = api;
  STORYTEST.setMenuShift(() => (A.menuStoryGo || A.menuGo)());
  STORYTEST.onPanelChange(() => { if (el) syncDebugButton(); });
  UPD.onChange(() => { if (el) upd(); });
}

function build () {
  if (el) return el;
  const big = $('big');
  if (!big) return null;
  el = document.createElement('div');
  el.id = 'cr-menu';
  el.innerHTML =
    '<div class="crm-top">' +
      '<div class="crm-head"><img class="crm-mark" src="./brand/logo-px.png" alt=""><div class="crm-logo"></div></div>' +
      '<div class="crm-me"><img class="crm-ava" alt=""><div class="crm-who"><small></small><b></b></div>' +
        '<button type="button" class="crm-stats" data-a="stats"></button></div>' +
    '</div>' +
    '<button type="button" class="crm-upd" data-a="update" hidden></button>' +
    '<div class="crm-sky"></div>' +
    '<div class="crm-car"></div>' +
    '<div class="crm-hint"></div>' +
    '<div class="crm-meta"><button type="button" class="crm-debug" data-a="storytest"></button><div class="crm-ver"></div></div>';
  big.appendChild(el);
  el.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => act(b.dataset.a)));
  CZ = carousel(el.querySelector('.crm-car'), { cls: 'crm-cz', grid: true, scales: [1, 0.86, 0.74], reach: 3, onChange: (i, c) => { curKey = c.dataset.key; navReset(); if (A.Snd && A.Snd.click) try { A.Snd.click(520); } catch (e) { /* — */ } } });
  mountStart(el);
  return el;
}
/* после листания подсветка геймпада и клавиатуры встаёт на карточку в центре */
function navReset () { if (A.padClear) A.padClear(); if (A.kbClear) A.kbClear(); }

function openShiftApp () {
  const current = DIST.cur();
  const district = DIST.city() ? t('весь город') : t(DIST.list()[current]?.name || 'Солнечный');
  SHIFTAPP.open(el.querySelector('.rf-body'), { district, preview: A.shiftPreview(current), onClose: focus, onStart: () => {
    if (A.canNavigate && !A.canNavigate()) return;
    STARTUP.request({ menuKey: 'go', district: DIST.cur() }); A.menuGo(true);
  } });
}

function act (a) {
  if (A.canNavigate && !A.canNavigate()) return;
  if (a !== 'go') SHIFTAPP.close(false);
  if (a === 'storytest') {
    if (DP.root() || BOARD.root() || HONOR.root() || QR.root() || CCARD.root() || CITY.root()) return;
    STORYTEST.togglePanel();
    return;
  }
  if (DP.root() || BOARD.root() || HONOR.root() || QR.root() || CCARD.root() || CITY.root() || STORYTEST.panelRoot()) return;
  A.Snd.boot && A.Snd.boot();
  if (a === 'go') {
    openShiftApp();
    navReset();
  }
  else if (a === 'district') openDistricts();
  else if (a === 'quick') { if (QR.available()) QR.openSetup(); }
  else if (a === 'stats') openStats();
  else if (a === 'ride') A.menuRide();
  else if (a === 'garage') A.garage(() => show());
  else if (a === 'collect') A.openCollect();
  else if (a === 'board') BOARD.open();
  else if (a === 'honor') HONOR.open({ api: A, face: face(), name: heroName(), onClose: () => { show(); focus(); } });
  else if (a === 'settings') A.openSettings();
  else if (a === 'update') UPD.apply();
  else if (a === 'quit') A.quit();
}

/* карточка: одна большая кнопка (data-main — на неё встаёт геймпад) — бумажка на доске (UI-REVIEW № 45):
   лист накладной, значок в цветном кружке, название, подпись. «На смену» — такая же бумажка,
   только крупнее и с красным (без пропуска, номера смены, района и минут — автор, 10.10.2026) */
function card (key, ico, title, sub, cls) {
  const c = document.createElement('div');
  c.className = 'crm-card k-' + key + (cls ? ' ' + cls : '');
  c.dataset.key = key; c.dataset.title = title;
  c.innerHTML = '<button type="button" class="crm-cb" data-a="' + key + '" data-main>' +
    '<i class="crm-ico" aria-hidden="true">' + ico + '</i><b>' + esc(title) + '</b>' +
    (sub ? '<span>' + esc(sub) + '</span>' : '') + '</button>';
  c.querySelector('button').addEventListener('click', () => act(key));
  return c;
}

export function show ({ openShift = false } = {}) {
  if (!A || !build()) return;
  SHIFTAPP.close(false);
  // надпись логотипа — название пиццерии на языке игрока (brands.js OWN.pizza → #big-t), по слову в строку
  const logo = ($('big-t') ? $('big-t').textContent : '') || t('Птица Пицца');
  el.querySelector('.crm-logo').innerHTML = logo.trim().split(/\s+/).map(w => '<span>' + esc(w) + '</span>').join('');
  const go = card('go', '▶', t('на смену'), '', 'main');
  // вернуться в прежний район, пока открыты не все (открыто всё — выбор и так перед каждой сменой)
  if (DIST.has() && DIST.opened() > 1 && !DIST.allOpen()) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'crm-sub'; b.innerHTML = keyHTML('x') + esc(t('сменить район'));
    b.addEventListener('click', () => act('district'));
    go.appendChild(b);
  }
  const cards = [go];
  const qr = card('quick', '»', t('быстрый заезд'), QR.available() ? t('сезон, машина, длина смены · без копилки и сюжета') : t('откроется после первой смены'));
  if (!QR.available()) qr.classList.add('off');
  cards.push(qr,
    card('garage', '⌂', t('гараж'), t('машины, броня, мотор, покраска')),
    card('ride', '~', t('покататься'), t('без заказов и без часов смены')));
  const hon = card('honor', '♛', t('доска почёта'), HONOR.sub(A));
  HONOR.badge(hon);                                // «+N» — новые грамоты, которых ещё не видел
  cards.push(hon);
  if (BOARD.on()) cards.push(card('board', '★', t('таблица рекордов'), t('лучшая смена — у тебя и в мире')));   // только Стим-сборка (board.js)
  cards.push(card('collect', '◆', t('мои находки'), t('предметы, разбросанные по району')),
    card('settings', '⚙', t('настройки'), t('звук, графика, язык, управление, версия')));
  if (A.canQuit) cards.push(card('quit', '✕', t('выйти'), t('закрыть игру')));
  const keep = openShift ? 0 : cards.findIndex(c => c.dataset.key === curKey);
  CZ.set(cards, keep >= 0 ? keep : 0);
  curKey = CZ.card() ? CZ.card().dataset.key : 'go';
  heroButton();
  upd();
  syncDebugButton();
  hint();
  if (CITY.check(() => show({ openShift }))) return;   // сначала праздник открытия города
  if (openShift) requestAnimationFrame(() => {
    // Повторная сборка меню или выбор игрока до первого кадра отменяют открытие.
    if (!go.isConnected || !shown() || curKey !== 'go' || A.S.state !== 'title' || A.panelOpen?.() || QR.root() || CITY.root() || modal()) return;
    openShiftApp();
  });
}
/* подсказка внизу — значком того, чем играют сейчас (glyphs.js): [A] / [Enter]; пальцем — «свайп · тап» */
function hint () {
  const h = el && el.querySelector('.crm-hint');
  if (!h) return;
  h.innerHTML = inputKind().kind === 'touch' ? esc(t('листай свайпом · выбрать — тап'))
    : esc(t('листай ◀ ▶')) + ' · ' + esc(t('выбрать')) + ' ' + keyHTML('ok');
}
onInput(() => hint());
/** горячие кнопки меню (значки — на самих кнопках): X — сменить район (если кнопка есть).
    Зовут career.js padPre (геймпад) и onKey (клавиатура X); true — нажали */
export function hot (k) {
  if (!el || !shown() || modal()) return false;
  const b = k === 'x' && curKey === 'go' ? el.querySelector('.crm-sub') : null;
  if (!b || b.hidden) return false;
  PFX.press(b);
  b.click();
  return true;
}
/** листать карточки меню: true — пролистнули */
export function flip (d) { return !!(CZ && el && !modal() && CZ.flip(d)); }
export const shown = () => !!(el && el.isConnected && !el.closest('[hidden]'));
/** фокус и подсветка — на карточку в центре (после окон поверх меню: праздник, выбор) */
export function focus () {
  navReset();
  const b = (SHIFTAPP.root() || CZ?.card())?.querySelector('[data-main]');
  if (b && shown()) try { b.focus({ preventScroll: true }); } catch (e) { /* — */ }
}

/* ── обновление: плашка сверху (только сборка с GitHub в Электроне) и номер версии внизу ── */
function upd () {
  const b = el.querySelector('.crm-upd'), st = UPD.state();
  b.hidden = !UPD.newer();
  if (!b.hidden) {
    b.innerHTML = '<i aria-hidden="true">⬇</i><span>' + esc(UPD.line()) + '</span>' + (st.st === 'download' && st.p > 0 ? '<em style="width:' + Math.round(st.p * 100) + '%"></em>' : '');
    b.disabled = !(st.st === 'newer' && st.updatable);
    b.classList.toggle('busy', st.st === 'download' || st.st === 'restart');
  }
  const v = UPD.version();
  el.querySelector('.crm-ver').textContent = v ? t('версия {v}', { v: String(v).replace(/^v(?=\d)/, '') }) : '';
}
function syncDebugButton () {
  const b = el?.querySelector('.crm-debug');
  if (!b) return;
  const open = STORYTEST.panelOpen();
  b.textContent = open ? t('Дебаг оверлей: скрыть') : t('Дебаг оверлей: показать');
  b.setAttribute('aria-expanded', String(open));
}

/* Портрет и карточка единственного курьера. Лицо постоянно, имя — общий источник Жени. */
let FACE = '';
export function face () {
  if (!FACE && A?.person && A?.face) {
    try { FACE = A.face(A.person({ seed: (0x51ED + 0x9E3779B1) >>> 0 }), 96); } catch (e) { /* — */ }
  }
  return FACE;
}
function heroButton () {
  const m = el.querySelector('.crm-me'), img = m.querySelector('.crm-ava'), u = face();
  img.hidden = !u;
  if (u) img.src = u;
  m.querySelector('small').textContent = t('курьер');
  m.querySelector('b').textContent = heroName();
  m.querySelector('.crm-stats').textContent = t('карточка курьера');
}
export function openStats (after) {
  CCARD.open({ Store: A.Store, money: A.money, face: face(), onClose: () => {
    if (after) after(); else { show(); focus(); }
  } });
}

/* ── район: карусель карточек районов (distpick.js; кнопка «сменить район» на карточке «на смену») ──
   выбрал открытый — сразу смена в нём; «назад» — в меню */
function openDistricts () {
  if (DIST.allOpen()) { CITY.picker(() => show(), false); return; }   // всё открыто: «весь город» или пиццерия (cityopen.js)
  DP.open({
    title: t('где работаешь'),
    cards: DP.districtCards({ btn: t('на смену здесь') }),
    idx: DIST.cur(),
    onFlip: navReset,
    onPick: k => { DIST.set(+k); A.Snd.coin && A.Snd.coin(); show(); A.menuGo(); },
    onBack: () => focus(),
  });
}

export const modal = () => SHIFTAPP.root() || DP.root() || CCARD.root() || BOARD.root() || HONOR.root() || (A?.S.state === 'title' ? STORYTEST.panelRoot() : null);
export function back () {
  const root = modal();
  if (!root) return false;
  if (root === SHIFTAPP.root()) return SHIFTAPP.close();
  if (root === DP.root()) return DP.back();
  if (root === CCARD.root()) { CCARD.close(); return true; }
  if (root === BOARD.root()) return BOARD.close();
  if (root === HONOR.root()) return HONOR.close();
  if (root === STORYTEST.panelRoot()) { STORYTEST.togglePanel(false); focus(); return true; }
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
