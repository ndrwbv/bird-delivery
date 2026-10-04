/* Главное меню карьеры (Стим). С 04.10.2026 — карусель карточек, как выбор машины в гараже
   (carousel.js): в центре крупная карточка, соседи по краям; листать — свайп, ◀ ▶, ←→, стик и
   крестовина, LB/RB; выбрать — A / Enter / тап. За меню — город, камера медленно облетает пиццерию.
   Сверху — логотип, профиль и (сборка с GitHub) плашка «есть новая версия — обновить» (update.js),
   внизу справа — номер версии. Правила — docs/CAREER.md «Главное меню».

     MENU.init(api)   — из career.js (api — тот же, что у карьеры, + crew() и garage())
     MENU.show()      — из showTitle: собрать карточки, рейтинг, при первом запуске — «как тебя зовут?»
     MENU.flip(±1)    — листать (career.js padPre / onKey); MENU.focus() — фокус на карточке в центре
     MENU.askName(cb) — из настроек: сменить имя
     MENU.cam(cam, P, tG) — камера заставки
     MENU.modal()     — открытое окно (имя или выбор района: геймпад, клавиатура) или null; MENU.back() — закрыть
     Район (districts.js): карточка «район: …» открывает список; открытые — выбрать, закрытые — сколько смен ещё
     Таблица рекордов (board.js): карточка только в Стим-сборке, окно — тоже modal()

   В Яндексе и Москве (?nocareer) модуль не работает: его зовёт только career.js. */
import './menu.css';
import { t, tn } from '../i18n/index.js';
import * as DIST from './districts.js';
import * as CITY from './cityopen.js';
import * as GROW from './growth.js';             // ступень пиццерии в списке районов (growth.js)
import { DISTRICT, SHIFT, clock } from './econ.js';
import * as BOARD from './board.js';
import * as PROF from './profiles.js';           // профили: у каждого свой прогресс (profiles.js)
import * as QR from './quickrun.js';             // быстрый заезд: сезон, длина смены, машина — без копилки и сюжета
import * as UPD from './update.js';              // плашка «есть новая версия — обновить» (update.js)
import { carousel } from './carousel.js';

let A = null, el = null, md = null, dm = null, nameCb = null, nameFirst = false, CZ = null, curKey = 'go';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function init (api) { A = api; UPD.onChange(() => { if (el) upd(); }); }

function build () {
  if (el) return el;
  const big = $('big');
  if (!big) return null;
  el = document.createElement('div');
  el.id = 'cr-menu';
  el.innerHTML =
    '<div class="crm-top">' +
      '<div class="crm-head"><div class="crm-logo"></div><div class="crm-tag"></div>' +
        '<button type="button" class="crm-prof" data-a="profile" hidden></button></div>' +
    '</div>' +
    '<button type="button" class="crm-upd" data-a="update" hidden></button>' +
    '<div class="crm-car"></div>' +
    '<div class="crm-hint"></div>' +
    '<div class="crm-ver"></div>';
  big.appendChild(el);
  el.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => act(b.dataset.a)));
  CZ = carousel(el.querySelector('.crm-car'), { cls: 'crm-cz', onChange: (i, c) => { curKey = c.dataset.key; navReset(); if (A.Snd && A.Snd.blip) try { A.Snd.blip(520, 0.03, 'square', 0.04); } catch (e) { /* — */ } } });
  return el;
}
/* после листания подсветка геймпада и клавиатуры встаёт на карточку в центре */
function navReset () { if (A.padClear) A.padClear(); if (A.kbClear) A.kbClear(); }

function act (a) {
  if ((md && !md.hidden) || (dm && !dm.hidden) || BOARD.root() || QR.root() || PROF.root() || CITY.root()) return;
  A.Snd.boot && A.Snd.boot();
  if (a === 'go') A.menuGo();
  else if (a === 'district') openDistricts();
  else if (a === 'quick') { if (QR.available()) QR.openSetup(); }
  else if (a === 'profile') openProfiles();
  else if (a === 'ride') A.menuRide();
  else if (a === 'garage') A.garage(() => show());
  else if (a === 'collect') A.openCollect();
  else if (a === 'board') BOARD.open();
  else if (a === 'settings') A.openSettings();
  else if (a === 'update') UPD.apply();
  else if (a === 'quit') A.quit();
}

/* карточка: одна большая кнопка (data-main — на неё встаёт геймпад) */
function card (key, ico, title, sub, cls) {
  const c = document.createElement('div');
  c.className = 'crm-card k-' + key + (cls ? ' ' + cls : '');
  c.dataset.key = key; c.dataset.title = title;
  c.innerHTML = '<button type="button" class="crm-cb" data-a="' + key + '" data-main><i class="crm-ico" aria-hidden="true">' + ico + '</i>' +
    '<b>' + esc(title) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</button>';
  c.querySelector('button').addEventListener('click', () => act(key));
  return c;
}

export function show () {
  if (!A || !build()) return;
  const logo = $('big-t') ? $('big-t').textContent : '';
  el.querySelector('.crm-logo').textContent = logo || t('Птица Пицца');
  el.querySelector('.crm-tag').textContent = $('big-s') ? $('big-s').textContent : '';
  const n = (+A.Store.get('dlv-shifts', 0) || 0) + 1;
  // круглосуточная пиццерия (со второго района): смена с того часа, когда кончилась прошлая (career.js)
  const allDay = DIST.has() && DIST.cur() >= (SHIFT.ALLDAY_FROM ?? 99);
  const from0 = clock(A.Store.get('dlv-clock', '') === '' || A.Store.get('dlv-clock', null) == null ? 9 : +A.Store.get('dlv-clock', 9) || 0);
  const goSub = DIST.has() && DIST.city()
    ? (allDay ? t('смена {n} · весь город · с {from}, круглосуточно', { n, from: from0 }) : t('смена {n} · весь город · {from}—{to}', { n, from: '9:00', to: '24:00' }))
    : allDay
    ? t('смена {n} · район «{name}» · с {from}, круглосуточно', { n, name: t(DIST.list()[DIST.cur()].name), from: from0 })
    : DIST.has()
    ? t('смена {n} · район «{name}» · {from}—{to}', { n, name: t(DIST.list()[DIST.cur()].name), from: '9:00', to: '24:00' })
    : t('смена {n} · {from}—{to}', { n, from: '9:00', to: '24:00' });
  const cards = [card('go', '▶', t('на смену'), goSub, 'main')];
  if (DIST.has()) cards.push(distCard());
  const qr = card('quick', '»', t('быстрый заезд'), QR.available() ? t('сезон, машина, длина смены · без копилки и сюжета') : t('откроется после первой смены'));
  if (!QR.available()) qr.classList.add('off');
  cards.push(qr,
    card('garage', '⌂', t('гараж'), t('машины, броня, мотор, покраска')),
    card('ride', '~', t('покататься'), t('без заказов и без часов смены')),
    rankCard());
  if (BOARD.on()) cards.push(card('board', '★', t('таблица рекордов'), t('лучшая смена — у тебя и в мире')));   // только Стим-сборка (board.js)
  cards.push(card('collect', '◆', t('мои находки'), t('предметы, разбросанные по району')),
    card('settings', '⚙', t('настройки'), t('звук, графика, язык, управление, версия')));
  if (A.canQuit) cards.push(card('quit', '✕', t('выйти'), t('закрыть игру')));
  const keep = cards.findIndex(c => c.dataset.key === curKey);
  CZ.set(cards, keep >= 0 ? keep : 0);
  curKey = CZ.card() ? CZ.card().dataset.key : 'go';
  profButton();
  upd();
  el.querySelector('.crm-hint').textContent = t('листай ◀ ▶ · выбрать — A, Enter или тап');
  if (!String(A.Store.get('dlv-name', '') || '').trim()) askName(null, true);
  else CITY.check(() => show());                  // открыт весь город, а праздника ещё не было — сейчас (cityopen.js)
}
/** листать карточки меню: true — пролистнули */
export function flip (d) { return !!(CZ && el && !modal() && CZ.flip(d)); }
export const shown = () => !!(el && el.isConnected && !el.closest('[hidden]'));
/** фокус и подсветка — на карточку в центре (после окон поверх меню: праздник, выбор) */
export function focus () {
  navReset();
  const b = CZ && CZ.card() && CZ.card().querySelector('[data-main]');
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
  el.querySelector('.crm-ver').textContent = v ? t('версия {v}', { v }) : '';
}

/* ── профиль: кнопка «профиль: Вася» под логотипом и окно профилей (profiles.js) ── */
function profButton () {
  const b = el.querySelector('.crm-prof');
  b.hidden = !PROF.on();
  if (b.hidden) return;
  b.innerHTML = esc(t('профиль')) + ': <b>' + esc(PROF.curName()) + '</b>' + (PROF.list().length > 1 ? ' · ' + esc(t('сменить')) : '');
}
/* подпись профиля в списке: «смена 12 · 340 000 ₽ · районов 3 из 8» (читается Store профиля — PROF.peek) */
function profInfo () {
  const sh = +A.Store.get('dlv-shifts', 0) || 0;
  const parts = [sh ? t('смен: {n}', { n: sh }) : t('ещё не работал'), A.money(+A.Store.get('dlv-msk-wallet', 0) || 0)];
  if (DIST.has()) parts.push(DIST.allOpen() ? t('весь город') : t('районов {k} из {n}', { k: DIST.opened(), n: DIST.count() }));
  return parts.join(' · ');
}
export function openProfiles () {
  PROF.open({ money: A.money, info: profInfo, setName: n => A.setName(n), Snd: A.Snd, onClose: () => { if (el) { profButton(); show(); } } });
}

/* ── рейтинг пиццерии: карточка в карусели — ты и курьеры, по заработку за всё время ── */
function rankCard () {
  const c = card('rank', '#', t('рейтинг пиццерии'), '', 'rank');
  const rows = A.crew();
  const me = rows.findIndex(r => r.me);
  const up = me > 0 ? rows[me - 1] : null;
  const b = c.querySelector('button');
  b.insertAdjacentHTML('beforeend', '<ol>' + rows.slice(0, 7).map((r, i) =>
    '<li' + (r.me ? ' class="me"' : '') + '><em>' + (i + 1) + '</em>' +
    (r.face ? '<img src="' + r.face + '" alt="">' : '<i' + (r.hex ? ' style="background:' + r.hex + '"' : '') + '></i>') +
    '<b>' + esc(r.name) + '</b><span>' + esc(A.money(r.total)) + '</span></li>').join('') + '</ol>' +
    '<small>' + esc(up ? t('до {who} — {money}', { who: up.gen || up.name, money: A.money(Math.max(0, up.total - rows[me].total)) }) : t('ты лучший курьер пиццерии')) + '</small>');
  return c;
}

/* ── район: карточка в меню и список районов ──
   карточка: «район: Юг» и под ним «открыто 2 из 8 · до «Проспекта» ещё 1 смена» */
function distCard () {
  const i = DIST.cur(), open = DIST.opened(), n = DIST.count();
  return card('district', '◎', DIST.city() ? t('район: {name}', { name: t('весь город') }) : t('район: {name}', { name: t(DIST.list()[i].name) }),
    open < n ? t('открыто {k} из {n}', { k: open, n }) + ' · ' + nextLine() : t('открыты все районы'));
}
/* до следующего района: сколько смен ещё и где */
function nextLine () {
  const p = DIST.opened() - 1;
  if (p >= DIST.count() - 1) return '';
  const left = Math.max(1, DIST.need(p) - DIST.shiftsIn(p));
  return tn(left, 'до района «{next}» — {n} смена в районе «{prev}»|до района «{next}» — {n} смены в районе «{prev}»|до района «{next}» — {n} смен в районе «{prev}»',
    { next: t(DIST.list()[p + 1].name), prev: t(DIST.list()[p].name) });
}
function distBox () {
  if (dm) return dm;
  dm = document.createElement('div');
  dm.id = 'crm-dist';
  dm.hidden = true;
  dm.innerHTML = '<div class="crm-dbox"><div class="crm-dt"></div><div class="crm-dl"></div><div class="crm-dn"></div><button type="button" class="crm-dclose"></button></div>';
  ($('big') || document.body).appendChild(dm);
  dm.querySelector('.crm-dclose').addEventListener('click', () => closeDistricts());
  dm.addEventListener('click', e => { if (e.target === dm) closeDistricts(); });
  return dm;
}
const pct = k => '+' + Math.round((k - 1) * 100) + ' %';
function openDistricts () {
  if (DIST.allOpen()) { CITY.picker(() => show(), false); return; }   // всё открыто: «весь город» или пиццерия (cityopen.js)
  distBox();
  const cur = DIST.cur(), open = DIST.opened();
  dm.querySelector('.crm-dt').textContent = t('где работаешь');
  dm.querySelector('.crm-dn').textContent = nextLine() || t('открыты все районы');
  dm.querySelector('.crm-dclose').textContent = t('назад');
  const list = dm.querySelector('.crm-dl');
  list.innerHTML = DIST.list().map((d, i) => {
    const locked = i >= open, sh = DIST.shiftsIn(i), need = DIST.need(i);
    const sub = locked ? t('закрыт')
      : [i ? t('машина {s} · оплата {p}', { s: pct(DISTRICT.SPEED[i]), p: pct(DISTRICT.PAY[i]) }) : t('маленький, заказы рядом'),
        need && (i === open - 1 || sh >= need) ? t('{have} из {need} смен', { have: Math.min(sh, need), need }) : tn(sh, '{n} смена|{n} смены|{n} смен'), GROW.label(i)].join(' · ');
    return '<button type="button" class="crm-di' + (i === cur ? ' cur' : '') + (locked ? ' lock' : '') + '" data-i="' + i + '"' + (locked ? ' disabled' : '') + (i === cur ? ' autofocus' : '') + '>' +
      '<em>' + (i + 1) + '</em><b>' + esc(t(d.name)) + '</b><span>' + esc(sub) + '</span></button>';
  }).join('');
  list.querySelectorAll('.crm-di').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.i;
    if (!DIST.isOpen(i)) return;
    DIST.set(i);
    A.Snd.coin && A.Snd.coin();
    closeDistricts();
    show();
  }));
  dm.hidden = false;
}
function closeDistricts () { if (dm) dm.hidden = true; focus(); }

/* ── имя: один раз при первом запуске, потом — из настроек ── */
function nameBox () {
  if (md) return md;
  md = document.createElement('div');
  md.id = 'crm-name';
  md.hidden = true;
  md.innerHTML = '<form class="crm-nbox" autocomplete="off"><label for="crm-nin"></label>' +
    '<input id="crm-nin" type="text" maxlength="24" autocomplete="off" spellcheck="false">' +
    '<div class="crm-nbtns"><button type="button" class="crm-ncancel"></button><button type="submit" class="crm-nok" autofocus></button></div>' +
    '<div class="crm-nn"></div></form>';
  ($('big') || document.body).appendChild(md);
  const inp = md.querySelector('input'), ok = md.querySelector('.crm-nok');
  inp.addEventListener('input', () => { ok.disabled = !inp.value.trim(); });
  md.querySelector('form').addEventListener('submit', e => { e.preventDefault(); saveName(); });
  md.querySelector('.crm-ncancel').addEventListener('click', () => back());
  return md;
}
export function askName (cb, first) {
  if (!A) return;
  nameBox();
  nameCb = cb || null; nameFirst = !!first;
  const cur = String(A.Store.get('dlv-name', '') || '').trim() || String(A.playerName() || '').trim();
  md.querySelector('label').textContent = t('как тебя зовут?');
  md.querySelector('.crm-nok').textContent = t('готово');
  md.querySelector('.crm-ncancel').textContent = t('отмена');
  md.querySelector('.crm-ncancel').hidden = nameFirst;
  md.querySelector('.crm-nn').textContent = nameFirst ? t('так тебя будут звать в пиццерии. поменять можно в настройках') : '';
  const inp = md.querySelector('input');
  inp.placeholder = t('имя и фамилия');
  inp.value = cur;
  md.querySelector('.crm-nok').disabled = !cur;
  md.hidden = false;
  // пустое поле — сразу в него; имя уже есть (ник в Steam) — достаточно «готово»
  if (!cur) setTimeout(() => { try { inp.focus(); } catch (e) { /* — */ } }, 50);
}
function saveName () {
  const v = md.querySelector('input').value.trim().slice(0, 24);
  if (!v) { md.querySelector('input').focus(); return; }
  A.setName(v);
  A.Store.flush();
  md.querySelector('input').blur();
  md.hidden = true;
  A.Snd.coin && A.Snd.coin();
  const cb = nameCb; nameCb = null;
  if (el && shown() && !cb) { show(); focus(); }        // первый запуск: имя есть — рейтинг с ним, фокус на «на смену»
  if (cb) cb(v);
}
export const modal = () => (md && !md.hidden && !md.closest('[hidden]') ? md : dm && !dm.hidden && !dm.closest('[hidden]') ? dm : PROF.root() || BOARD.root());   // заставку спрятали (поехали) — окна нет
/* назад: из настроек — отмена; при первом запуске окно не закрывается, ждём имя */
export function back () {
  if (!modal()) return false;
  if (modal() === dm) { closeDistricts(); return true; }
  if (modal() === PROF.root()) return PROF.back();
  if (modal() === BOARD.root()) return BOARD.close();
  if (nameFirst) return true;
  md.querySelector('input').blur();
  md.hidden = true;
  nameCb = null;
  focus();
  return true;
}
export function submitName () { if (PROF.root() && modal() === PROF.root()) PROF.submit(); else if (modal() === md) saveName(); }

/* ── камера заставки: медленный облёт на высоте, пиццерия — в правой половине кадра,
   слева колонка меню. Стоймя — пиццерия по центру, чуть выше середины ── */
export function cam (c, P, tG) {
  const a = tG * 0.035 + 0.8;
  const R = 92 + Math.sin(tG * 0.021) * 8, H = 46 + Math.sin(tG * 0.027) * 5;
  const x = P.bx + Math.sin(a) * R, z = P.bz + Math.cos(a) * R;
  c.position.set(x, P.by + H, z);
  let fx = P.bx - x, fz = P.bz - z;
  const l = Math.hypot(fx, fz) || 1;
  fx /= l; fz /= l;
  const wide = c.aspect > 1.15;
  const k = wide ? l * 0.3 : 0;                   // вправо в кадре = (−fz, fx); смотрим левее пиццерии
  c.lookAt(P.bx + fz * k, P.by + (wide ? 2 : -10), P.bz - fx * k);
}
