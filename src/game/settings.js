/* Настройки (04.10.2026): карусель карточек-разделов, как главное меню и гараж (carousel.js).
   Один и тот же экран — из главного меню и из паузы (game.js renderSettings → SET.render).
   Правила словами — docs/CAREER.md «Настройки».

   Карточки: звук · графика (качество и 7 пунктов, gfx.js) · язык · управление (какие кнопки за
   что — геймпад, клавиатура или палец) · профиль (имя, профили; карьера) · игра (версия 18+ /
   детская, сбросить прогресс, тестовые районы) · версия и обновление (update.js).
   Что перезагружает игру (язык, профиль, версия 18+/детская, сброс) — только в главном меню:
   в паузе на этих карточках подпись «— в главном меню». Графика и звук из паузы — сразу.

     SET.init(api)    — из game.js (что нужно — ниже, в render)
     SET.render(focus) — нарисовать в окно #panel; focus — id кнопки, на которой встать (её карточка — в центре)
     SET.flip(±1)     — листать (←→, стик, крестовина, LB/RB — game.js padStep, career.js onKey)
     SET.on()         — настройки на экране */
import './settings.css';
import { t } from '../i18n/index.js';
import { carousel } from './carousel.js';
import * as UPD from './update.js';

let A = null, CZ = null, lastKey = 'snd';
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => '&#' + c.charCodeAt(0) + ';');

export function init (api) {
  A = api;
  UPD.onChange(() => { if (on() && CZ.card() && CZ.card().dataset.key === 'ver') render(focusId()); });
}
export const on = () => !!(A && CZ && CZ.el.isConnected && A.kind() === 'settings' && !A.panel().hidden);
export function flip (d) { return on() && CZ.flip(d); }
const focusId = () => { const e = A.selected && A.selected(); return (e && e.id) || undefined; };

function card (key, title, html) {
  const c = document.createElement('div');
  c.className = 'set-card';
  c.dataset.key = key; c.dataset.title = title;
  c.innerHTML = '<div class="set-ct">' + esc(title) + '</div><div class="set-cb">' + html + '</div>';
  return c;
}
const row = (label, val, id, focus, opt = {}) => '<div class="set-row"><span>' + label + (opt.extra || '') + '</span><button type="button" id="' + id + '"' +
  (id === focus ? ' autofocus' : '') + (opt.main ? ' data-main' : '') + (opt.cls ? ' class="' + opt.cls + '"' : '') + '>' + val + '</button></div>';
const note = s => '<div class="pn-n">' + s + '</div>';
/* карточка без кнопок (управление, версия в браузере): геймпад встаёт на неё саму (data-pad), A — ничего */
const still = html => '<div class="set-still" data-pad data-main tabindex="-1">' + html + '</div>';

export function render (focus) {
  if (!A) return;
  const P = A.panel(), body = A.body();
  P.dataset.kind = 'settings'; P.dataset.back = ''; P.dataset.sub = '';
  const menu = A.inMenu();                          // из главного меню (не посреди смены)
  const onlyMenu = t('меняется в главном меню');
  const cards = [];

  // звук
  cards.push(card('snd', t('звук'), row(t('звук'), A.Snd.on ? t('вкл') : t('выкл'), 'set-snd', focus, { main: true }) +
    note(t('M на клавиатуре, R3 на геймпаде — звук вкл / выкл прямо в игре'))));

  // графика (gfx.js рисует сама: качество и семь пунктов)
  const g = card('gfx', t('графика'), '');
  A.GFX.panel(g.querySelector('.set-cb'), focus, true);
  cards.push(g);

  // язык: сетка языков; смена — перезагрузка, поэтому только в меню
  cards.push(card('lang', t('язык'), menu
    ? '<div class="lang-grid">' + A.langs.map(l => '<button type="button" lang="' + l + '" data-l="' + l + '" id="set-l-' + l + '"' +
        (l === A.lang() ? ' class="cur" data-main' : '') + ('set-l-' + l === focus ? ' autofocus' : '') + '>' + A.langNames[l] + '</button>').join('') + '</div>'
    : still('<b class="set-big">' + esc(A.langNames[A.lang()]) + '</b>' + note(onlyMenu))));

  // управление: что за что — тем, чем сейчас играют
  cards.push(card('ctrl', t('управление'), still('<div class="set-keys">' + A.keys() + '</div>')));

  // профиль (карьера): имя курьера и профили
  if (A.career) {
    const name = A.name();
    let h = menu ? row(t('имя'), esc(name || '—'), 'set-name', focus, { main: true }) : still('<b class="set-big">' + esc(name || '—') + '</b>' + note(onlyMenu));
    if (menu && A.prof.on()) h += row(t('профиль'), esc(A.prof.curName()) + (A.prof.list().length > 1 ? ' · ' + t('сменить') : ''), 'set-prof', focus) +
      note(t('у каждого профиля свой прогресс: кошелёк, машины, районы'));
    cards.push(card('prof', t('профиль'), h));
  }

  // игра: версия 18+ / детская, тестовые районы, сброс прогресса — только в меню
  {
    let h = '';
    if (A.adult.on) h += menu ? row(t('версия'), A.adult.adult ? t('взрослая 18+') : t('детская'), 'set-ed', focus, { main: true })
      : still('<b class="set-big">' + t('версия') + ': ' + (A.adult.adult ? t('взрослая 18+') : t('детская')) + '</b>' + note(onlyMenu));
    // ТЕСТ: «открыть все районы» — в релизе (BUILD_VERSION, __RELEASE__) нет, с ?debug — есть
    if (menu && A.unlock.on()) h += row(t('районы') + ' <small class="set-msg">' + t('для тестов') + '</small>', A.unlock.all() ? t('все открыты') : t('открыть все районы'), 'set-unlock', focus);
    if (menu && A.canReset()) h += '<button type="button" id="set-reset" class="set-danger"' + (h ? '' : ' data-main') + ('set-reset' === focus ? ' autofocus' : '') + '>' + t('сбросить прогресс') + '</button>';
    if (!menu) h += note(t('сбросить прогресс — в главном меню'));
    if (h) cards.push(card('game', t('игра'), h.includes('data-main') ? h : h.replace('<div class="pn-n">', '<div class="pn-n" data-pad data-main tabindex="-1">')));
  }

  // версия и обновление
  {
    const st = UPD.state(), v = UPD.version();
    let h = '<div class="set-ver">' + t('стоит') + ' <b>' + esc(v || '—') + '</b>' + (st.latest && st.latest !== v ? ' · ' + t('вышла') + ' <b>' + esc(st.latest) + '</b>' : '') + '</div>';
    if (UPD.on()) {
      const can = st.st === 'newer' && st.updatable;
      h += row(can ? '<b>' + esc(UPD.line()) + '</b>' : t('обновления с GitHub'), can ? t('обновить до {v}', { v: esc(st.latest) }) : st.st === 'wait' ? t('проверяю…') : t('проверить обновления'),
        can ? 'set-upd-go' : 'set-upd', focus, { main: true, extra: !can && UPD.line() ? '<small class="set-msg">' + esc(UPD.line()) + '</small>' : '' });
    } else h = still(h + note(A.steam ? t('игру обновляет Стим') : t('в браузере — всегда последняя версия')));
    cards.push(card('ver', t('версия игры'), h));
  }

  body.innerHTML = '<div class="pn-t">' + t('настройки') + '</div><div class="set-czh"></div>' +
    // единственная подпись OSM в игре (лицензия ODbL требует) — в самом низу, мелко, но читаемо
    '<div class="pn-n set-cred">' + t('карта — © участники OpenStreetMap, лицензия ODbL. Рельеф — SRTM (NASA).') + '</div>';
  CZ = carousel(body.querySelector('.set-czh'), { cls: 'set-cz', onChange: (i, c) => { lastKey = c.dataset.key; A.navReset(); } });
  let i = focus ? cards.findIndex(c => c.querySelector('#' + CSS.escape(focus))) : -1;
  if (i < 0) i = Math.max(0, cards.findIndex(c => c.dataset.key === lastKey));
  CZ.set(cards, i);
  lastKey = cards[i].dataset.key;
  if (focus && body.querySelector('#' + CSS.escape(focus))) cards[i].querySelectorAll('[data-main]').forEach(m => { if (m.id !== focus) m.removeAttribute('autofocus'); });
  wire(body);
}

function wire (body) {
  const $ = id => body.querySelector('#' + id);
  $('set-snd').onclick = () => { A.Snd.set(!A.Snd.on); render('set-snd'); };
  body.querySelectorAll('[data-l]').forEach(b => b.addEventListener('click', () => A.setLang(b.dataset.l)));
  if ($('set-name')) $('set-name').onclick = () => A.askName(() => render('set-name'));
  if ($('set-prof')) $('set-prof').onclick = () => A.openProfiles();
  if ($('set-ed')) $('set-ed').onclick = () => A.adult.toggle();
  if ($('set-unlock')) $('set-unlock').onclick = () => A.unlock.run();
  if ($('set-reset')) $('set-reset').onclick = () => A.reset();
  if ($('set-upd')) $('set-upd').onclick = () => { UPD.check(true); render('set-upd'); };
  if ($('set-upd-go')) $('set-upd-go').onclick = () => { UPD.apply(); render(); };
}

export const DEBUG = { render, flip, on, get idx () { return CZ ? CZ.idx() : -1; }, get key () { return CZ && CZ.card() ? CZ.card().dataset.key : null; } };
