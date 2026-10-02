/* Главное меню карьеры (Стим): колонка слева, справа — город, камера медленно
   облетает пиццерию. Имя спрашиваем один раз, рейтинг пиццерии — сбоку.

     MENU.init(api)   — из career.js (api — тот же, что у карьеры, + crew() и garage())
     MENU.show()      — из showTitle: собрать кнопки, рейтинг, при первом запуске — «как тебя зовут?»
     MENU.askName(cb) — из настроек: сменить имя
     MENU.cam(cam, P, tG) — камера заставки
     MENU.modal()     — открытое окно (имя или выбор района: геймпад, клавиатура) или null; MENU.back() — закрыть
     Район (districts.js): кнопка «район: …» открывает список; открытые — выбрать, закрытые — сколько смен ещё

   В Яндексе и Москве (?nocareer) модуль не работает: его зовёт только career.js. */
import './menu.css';
import { t, tn } from '../i18n/index.js';
import * as DIST from './districts.js';
import { DISTRICT, SHIFT, clock } from './econ.js';

let A = null, el = null, md = null, dm = null, nameCb = null, nameFirst = false;
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function init (api) { A = api; }

function build () {
  if (el) return el;
  const big = $('big');
  if (!big) return null;
  el = document.createElement('div');
  el.id = 'cr-menu';
  el.innerHTML =
    '<div class="crm-col">' +
      '<div class="crm-head"><div class="crm-logo"></div><div class="crm-tag"></div></div>' +
      '<nav class="crm-btns">' +
        '<button type="button" class="crm-go" data-a="go" autofocus><b></b><span></span></button>' +
        '<button type="button" class="crm-b crm-dist" data-a="district" hidden><b></b><span></span></button>' +
        '<button type="button" class="crm-b" data-a="garage"></button>' +
        '<button type="button" class="crm-b" data-a="ride"></button>' +
        '<button type="button" class="crm-b" data-a="settings"></button>' +
        '<button type="button" class="crm-link" data-a="collect"></button>' +
      '</nav>' +
      '<div class="crm-foot"><button type="button" class="crm-quit" data-a="quit" hidden></button></div>' +
    '</div>' +
    '<aside class="crm-rank"><div class="crm-rt"></div><ol></ol><div class="crm-rn"></div></aside>';
  big.appendChild(el);
  el.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => act(b.dataset.a)));
  return el;
}

function act (a) {
  if ((md && !md.hidden) || (dm && !dm.hidden)) return;
  A.Snd.boot && A.Snd.boot();
  if (a === 'go') A.menuGo();
  else if (a === 'district') openDistricts();
  else if (a === 'ride') A.menuRide();
  else if (a === 'garage') A.garage(() => show());
  else if (a === 'collect') A.openCollect();
  else if (a === 'settings') A.openSettings();
  else if (a === 'quit') A.quit();
}

export function show () {
  if (!A || !build()) return;
  const logo = $('big-t') ? $('big-t').textContent : '';
  el.querySelector('.crm-logo').textContent = logo || t('Птица Пицца');
  el.querySelector('.crm-tag').textContent = $('big-s') ? $('big-s').textContent : '';
  const n = (+A.Store.get('dlv-shifts', 0) || 0) + 1;
  el.querySelector('.crm-go b').textContent = t('на смену');
  // круглосуточная пиццерия (со второго района): смена с того часа, когда кончилась прошлая (career.js)
  const allDay = DIST.has() && DIST.cur() >= (SHIFT.ALLDAY_FROM ?? 99);
  el.querySelector('.crm-go span').textContent = allDay
    ? t('смена {n} · район «{name}» · с {from}, круглосуточно', { n, name: t(DIST.list()[DIST.cur()].name), from: clock(A.Store.get('dlv-clock', '') === '' || A.Store.get('dlv-clock', null) == null ? 9 : +A.Store.get('dlv-clock', 9) || 0) })
    : DIST.has()
    ? t('смена {n} · район «{name}» · {from}—{to}', { n, name: t(DIST.list()[DIST.cur()].name), from: '9:00', to: '24:00' })
    : t('смена {n} · {from}—{to}', { n, from: '9:00', to: '24:00' });
  distButton();
  el.querySelector('[data-a="garage"]').textContent = t('гараж');
  el.querySelector('[data-a="ride"]').textContent = t('покататься');
  el.querySelector('[data-a="settings"]').textContent = t('настройки');
  el.querySelector('[data-a="collect"]').textContent = t('мои находки');
  const q = el.querySelector('[data-a="quit"]');
  q.textContent = t('выйти');
  q.hidden = !A.canQuit;
  rank();
  if (!String(A.Store.get('dlv-name', '') || '').trim()) askName(null, true);
}

/* ── рейтинг пиццерии: ты и курьеры, по заработку за всё время ── */
function rank () {
  const box = el.querySelector('.crm-rank');
  const rows = A.crew();
  box.querySelector('.crm-rt').textContent = t('рейтинг пиццерии');
  box.querySelector('ol').innerHTML = rows.map((r, i) =>
    '<li' + (r.me ? ' class="me"' : '') + '><em>' + (i + 1) + '</em>' +
    (r.face ? '<img src="' + r.face + '" alt="">' : '<i' + (r.hex ? ' style="background:' + r.hex + '"' : '') + '></i>') +
    '<b>' + esc(r.name) + '</b><span>' + esc(A.money(r.total)) + '</span></li>').join('');
  const me = rows.findIndex(r => r.me);
  const up = me > 0 ? rows[me - 1] : null;
  box.querySelector('.crm-rn').textContent = up ? t('до {who} — {money}', { who: up.gen || up.name, money: A.money(Math.max(0, up.total - rows[me].total)) })
    : t('ты лучший курьер пиццерии');
}

/* ── район: кнопка в меню и список районов ──
   кнопка: «район: Юг» и под ним «открыто 2 из 8 · до «Проспекта» ещё 1 смена» */
function distButton () {
  const b = el.querySelector('.crm-dist');
  b.hidden = !DIST.has();
  if (b.hidden) return;
  const i = DIST.cur(), open = DIST.opened(), n = DIST.count();
  b.querySelector('b').textContent = t('район: {name}', { name: t(DIST.list()[i].name) });
  b.querySelector('span').textContent = open < n ? t('открыто {k} из {n}', { k: open, n }) + ' · ' + nextLine() : t('открыты все районы');
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
        need && (i === open - 1 || sh >= need) ? t('{have} из {need} смен', { have: Math.min(sh, need), need }) : tn(sh, '{n} смена|{n} смены|{n} смен')].join(' · ');
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
function closeDistricts () { if (dm) dm.hidden = true; }

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
  if (el) rank();
  const cb = nameCb; nameCb = null;
  if (cb) cb(v);
}
export const modal = () => (md && !md.hidden && !md.closest('[hidden]') ? md : dm && !dm.hidden && !dm.closest('[hidden]') ? dm : null);   // заставку спрятали (поехали) — окна нет
/* назад: из настроек — отмена; при первом запуске окно не закрывается, ждём имя */
export function back () {
  if (!modal()) return false;
  if (modal() === dm) { closeDistricts(); return true; }
  if (nameFirst) return true;
  md.querySelector('input').blur();
  md.hidden = true;
  nameCb = null;
  return true;
}
export function submitName () { if (modal()) saveName(); }

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
