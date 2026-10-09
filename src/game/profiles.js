/* Профили (03.10.2026, IDEAS блок 7; правила — docs/CAREER.md «Профили»).
   До 5 профилей на устройстве, у каждого свой прогресс: кошелёк, машины, районы, «весь город»,
   смены, сюжет и герои, обучение, рекорд. Общие на устройство — настройки (язык, звук, версия),
   достижения и их счётчики, таблица рекордов на устройстве и служебное (SHARED).

   Как хранится: всё идёт через Platform.store (localStorage в web и Стиме; Стим Cloud синкает
   папку целиком). install() один раз в main.js подменяет у Platform.store get/set: ключ прогресса
   («dlv-msk-wallet») уходит в ключ профиля. У профиля 1 — ключи как были, без приставки
   («dlv-msk-wallet»), у профиля N — «dlv-pN-…» («dlv-p2-msk-wallet»). Поэтому старое сохранение
   и есть профиль 1 — миграция ничего не переносит, только заводит список «dlv-profiles».
   Игра ключей профилей не знает: она пишет «dlv-shifts», а куда это легло — решает этот модуль.
   Яндекс: профилей нет (install не вызывается) — облако Яндекса не растёт.

     PROF.install(Platform)  — main.js, сразу после Platform.init, до загрузки игры
     PROF.on()               — профили включены
     PROF.cur() / curName()  — текущий профиль (id 1…5) / его имя
     PROF.list()             — [{ id, name, cur }]
     PROF.create(name) / rename(id, name) / remove(id) / use(id)  — use и create переключают игру: api.swap()
                             из окна (game.js reprofile) — без перезагрузки; без swap — перезагрузка
     PROF.keys()             — ключи прогресса текущего профиля (для «сбросить прогресс» в game.js)
     PROF.peek(id, fn)       — fn() так, будто текущий — профиль id (подписи в списке профилей)
     PROF.open(api) / root() / back() / submit()  — окно «профили» из главного меню (menu.js)
       api: { money(n), info() → строка-подпись профиля (читает Store), face(id) → портрет, setName(n), Snd, onClose(), swap() } */
import './profiles.css';
import { t } from '../i18n/index.js';
import { keyHTML } from '../input/glyphs.js';

export const MAX = 5;
export const META = 'dlv-profiles';
/* общее на всё устройство; всё остальное «dlv-*» — у каждого профиля своё */
export const SHARED = new Set([
  META, 'dlv-lang', 'dlv-sound', 'dlv-gfx', 'dlv-edition', 'dlv-map',  // настройки (dlv-gfx — графика, gfx.js)
  'dlv-vol-music', 'dlv-vol-sfx', 'dlv-vol-eng',           // громкость: музыка, звуки, мотор (game.js Snd.setVol)
  'dlv-ach',                // достижения и их счётчики — как в Стиме, на весь аккаунт
  'dlv-lb-local',           // таблица рекордов на устройстве — все профили по именам
  'dlv-money-x8', 'dlv-__ts', 'dlv-crashlog',               // служебное
]);
/* ключи прогресса, которые стираем у профиля, даже если перебор localStorage не сработал */
const KNOWN = ['dlv-name', 'dlv-msk-wallet', 'dlv-msk-cars', 'dlv-msk-car', 'dlv-msk-best', 'dlv-msk-xp', 'dlv-msk-col', 'dlv-msk-tut',
  'dlv-msk-guide', 'dlv-msk-nostut', 'dlv-intro', 'dlv-garage-tut', 'dlv-shifts', 'dlv-stars', 'dlv-crew', 'dlv-story', 'dlv-season',
  'dlv-used-addr', 'dlv-boss', 'dlv-clock', 'dlv-rev-sale', 'dlv-car-owned', 'dlv-car-cur', 'dlv-car-up', 'dlv-car-L', 'dlv-car-eng',
  'dlv-car-paint', 'dlv-district', 'dlv-dist-shifts', 'dlv-dist-open', 'dlv-city-mode', 'dlv-city-party', 'dlv-knocked', 'dlv-heroes',
  'dlv-heroq', 'dlv-quick', 'dlv-don-trash', 'dlv-don-gang', 'dlv-respect', 'dlv-pz-grow', 'dlv-delivered', 'dlv-honor'];

let st = null, raw = null, meta = null, view = null;
const OTHER = /^dlv-p\d+-/;                       // ключ чужого профиля (2…5)
const isGame = k => typeof k === 'string' && k.startsWith('dlv-');
export const shared = k => !isGame(k) || SHARED.has(k);
const prefix = id => (id === 1 ? 'dlv-' : 'dlv-p' + id + '-');
/** логический ключ игры → настоящий ключ в хранилище у профиля id */
export const phys = (k, id = cur()) => (shared(k) ? k : prefix(id) + k.slice(4));
/** настоящий ключ → логический у профиля id (или null — не его) */
function logical (k, id) {
  if (!isGame(k) || SHARED.has(k)) return null;
  if (id === 1) return OTHER.test(k) ? null : k;
  const p = prefix(id);
  return k.startsWith(p) ? 'dlv-' + k.slice(p.length) : null;
}
const rget = (k, d) => { const v = raw.get.call(st, k); return v === undefined || v === null ? d : v; };
const rset = (k, v) => raw.set.call(st, k, v);
const flush = () => { try { return st.flush && st.flush(); } catch (e) { return null; } };
const clean = s => String(s == null ? '' : s).trim().slice(0, 24);

export const on = () => !!st;
export const cur = () => (meta ? meta.cur : 1);
export const list = () => (meta ? meta.list.map(p => ({ id: p.id, name: p.name, cur: p.id === meta.cur })) : [{ id: 1, name: '', cur: true }]);
export const label = p => clean(p && p.name) || t('профиль {n}', { n: p ? p.id : 1 });
export const curName = () => label(meta && meta.list.find(p => p.id === meta.cur));

/* список профилей: { v, cur, list: [{ id, name }] }; битый — чиним, нет — миграция */
function load () {
  const m = rget(META, null);
  if (m && typeof m === 'object' && Array.isArray(m.list)) {
    const seen = new Set();
    const l = m.list.filter(p => p && Number.isInteger(+p.id) && +p.id >= 1 && +p.id <= MAX && !seen.has(+p.id) && seen.add(+p.id))
      .map(p => ({ id: +p.id, name: clean(p.name) }));
    if (l.length) return { v: 1, cur: l.some(p => p.id === +m.cur) ? +m.cur : l[0].id, list: l };
  }
  // миграция: профилей ещё нет — всё, что уже сохранено (ключи без приставки), и есть профиль 1
  return { v: 1, cur: 1, list: [{ id: 1, name: clean(rget('dlv-name', '')) }] };
}
function save () { rset(META, meta); }

export function install (Platform) {
  if (st || !Platform || !Platform.store) return;
  st = Platform.store;
  raw = { get: st.get, set: st.set };
  meta = load();
  save();
  // подмена на месте (а не новым объектом): web.js / steam.js держат этот же store — имя игрока
  // и локальная таблица тоже читают через профиль. quickrun.js потом кладёт свою песочницу сверху.
  st.get = (k, d) => raw.get.call(st, phys(k), d);
  st.set = (k, v) => {
    const r = raw.set.call(st, phys(k), v);
    if (k === 'dlv-name') { const p = meta.list.find(x => x.id === meta.cur); if (p && p.name !== clean(v)) { p.name = clean(v); save(); } }
    return r;
  };
  // отладка: __dlv.PROF (появляется вместе с игрой, только с ?debug и в dev)
  let n = 0;
  const hook = () => { if (window.__dlv) window.__dlv.PROF = DEBUG; else if (++n < 150) setTimeout(hook, 200); };
  if (typeof window !== 'undefined') hook();
}
/** переразобрать список (для проверки миграции в probe) */
export function reload () { if (st) { meta = load(); save(); } return list(); }

/** ключи прогресса профиля id (логические, без приставки): то, что лежит в хранилище, и известные */
export function keys (id = cur()) {
  const out = new Set(KNOWN);
  try {
    for (let i = 0; i < localStorage.length; i++) { const k = logical(localStorage.key(i), id); if (k) out.add(k); }
  } catch (e) { /* — */ }
  // профили выключены (Яндекс, песочница): все ключи игры, кроме чужих профилей и их списка
  if (!st) { try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (isGame(k) && !OTHER.test(k) && k !== META) out.add(k); } } catch (e) { /* — */ } }
  return [...out];
}
/** fn() так, будто текущий — профиль id; в хранилище ничего не пишется */
export function peek (id, fn) {
  if (!meta || id === meta.cur) return fn();
  const was = meta.cur;
  meta.cur = id;
  try { return fn(); } finally { meta.cur = was; }
}
function wipe (id) { for (const k of keys(id)) rset(phys(k, id), undefined); }
/* переключились: без перезагрузки страницы — игра пересчитывает только то, что у профиля своё
   (A.swap = game.js reprofile: сохранение, машина, районы, сюжет, подсказки; город тот же).
   swap нет или упал — как раньше, перезагрузка */
function go (reload) {
  save(); flush();
  if (reload === false) return;
  const sw = A && A.swap;
  setTimeout(() => {
    let ok = false;
    if (sw) { try { ok = sw() !== false; } catch (e) { console.error('[profiles] swap', e); } }
    if (!ok) { location.reload(); return; }
    close();
  }, sw ? 30 : 150);
}
/** новый профиль с именем → id (и сразу на него; null — уже MAX) */
export function create (name, reload) {
  if (!meta || meta.list.length >= MAX) return null;
  let id = 1;
  while (meta.list.some(p => p.id === id)) id++;
  wipe(id);                                        // на всякий случай: хвосты удалённого профиля с тем же номером
  meta.list.push({ id, name: clean(name) });
  meta.list.sort((a, b) => a.id - b.id);
  rset(phys('dlv-name', id), clean(name));
  meta.cur = id;
  go(reload);
  return id;
}
export function rename (id, name) {
  const p = meta && meta.list.find(x => x.id === id);
  if (!p || !clean(name)) return false;
  p.name = clean(name);
  rset(phys('dlv-name', id), p.name);
  save(); flush();
  return true;
}
/** удалить профиль и весь его прогресс; последний не удаляется. Удалили текущий — на первый оставшийся */
export function remove (id, reload) {
  if (!meta || meta.list.length <= 1 || !meta.list.some(p => p.id === id)) return false;
  wipe(id);
  meta.list = meta.list.filter(p => p.id !== id);
  if (meta.cur === id) { meta.cur = meta.list[0].id; go(reload); } else { save(); flush(); }
  return true;
}
export function use (id, reload) {
  if (!meta || !meta.list.some(p => p.id === id)) return false;
  if (id === meta.cur) return true;
  meta.cur = id;
  go(reload);
  return true;
}

/* ── окно «профили»: список, «новый профиль», переименовать, удалить (с подтверждением) ── */
let box = null, A = null;
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function build () {
  if (box) return box;
  box = document.createElement('div');
  box.id = 'crm-prof';
  box.hidden = true;
  box.innerHTML = '<div class="prf-box"></div>';
  (document.getElementById('big') || document.body).appendChild(box);
  box.addEventListener('click', e => { if (e.target === box) back(); });
  return box;
}
export const root = () => (box && !box.hidden && !box.closest('[hidden]') ? box : null);
export function open (api) {
  if (!st) return;
  A = api || A || {};
  build();
  view = { k: 'list' };
  render();
  box.hidden = false;
}
function close () {
  if (!box) return;
  const inp = box.querySelector('input'); if (inp) inp.blur();
  box.hidden = true; view = null;
  if (A && A.onClose) A.onClose();
}
/** назад: из имени или подтверждения — к списку, из списка — закрыть */
export function back () {
  if (!root()) return false;
  if (view && view.k !== 'list') { view = { k: 'list', focus: view.id }; render(); } else close();
  return true;
}
/** Enter в поле имени (career.js ловит клавиши сам) */
export function submit () { if (root() && view && view.k === 'name') saveName(); }
/* портрет профиля (menu.js face): у каждого профиля своё лицо */
const ava = id => { let u = ''; try { u = A && A.face ? A.face(id) : ''; } catch (e) { u = ''; } return u ? '<img class="prf-ava" src="' + u + '" alt="">' : ''; };
const info = id => { try { return A && A.info ? peek(id, A.info) : ''; } catch (e) { return ''; } };
const snd = k => { try { if (A && A.Snd && A.Snd[k]) A.Snd[k](); } catch (e) { /* — */ } };

function render () {
  const b = box.querySelector('.prf-box');
  if (view.k === 'name') {
    const p = view.id && meta.list.find(x => x.id === view.id);
    b.innerHTML = '<form class="prf-form" autocomplete="off"><label for="prf-in">' + esc(p ? t('новое имя профиля') : t('новый профиль — как тебя зовут?')) + '</label>' +
      '<input id="prf-in" type="text" maxlength="24" autocomplete="off" spellcheck="false" placeholder="' + esc(t('имя и фамилия')) + '" value="' + esc(p ? p.name : '') + '">' +
      (p ? '' : '<div class="prf-note">' + esc(t('новый профиль начинает с первой смены: своя копилка, машины и районы. настройки — общие')) + '</div>') +
      '<div class="prf-btns"><button type="button" class="prf-no">' + keyHTML('back') + esc(t('отмена')) + '</button>' +
      '<button type="submit" class="prf-ok"' + (p && p.name ? '' : ' disabled') + '>' + keyHTML('ok') + esc(p ? t('готово') : t('создать')) + '</button></div></form>';
    const inp = b.querySelector('input'), ok = b.querySelector('.prf-ok');
    inp.addEventListener('input', () => { ok.disabled = !inp.value.trim(); });
    b.querySelector('form').addEventListener('submit', e => { e.preventDefault(); saveName(); });
    b.querySelector('.prf-no').addEventListener('click', () => back());
    setTimeout(() => { try { inp.focus(); } catch (e) { /* — */ } }, 50);
    return;
  }
  if (view.k === 'del') {
    const p = meta.list.find(x => x.id === view.id);
    b.innerHTML = '<div class="prf-t">' + esc(t('удалить профиль «{name}»?', { name: label(p) })) + '</div>' +
      '<div class="prf-note">' + esc(info(p.id)) + '</div>' +
      '<div class="prf-warn">' + esc(t('весь его прогресс сотрётся: копилка, машины, районы, сюжет. вернуть будет нельзя. другие профили не тронет')) + '</div>' +
      '<div class="prf-btns"><button type="button" class="prf-no" autofocus>' + keyHTML('back') + esc(t('отмена')) + '</button>' +
      '<button type="button" class="prf-yes">' + esc(t('да, удалить')) + '</button></div>';
    b.querySelector('.prf-no').addEventListener('click', () => back());
    b.querySelector('.prf-yes').addEventListener('click', () => {
      const wasCur = p.id === meta.cur;
      if (!remove(p.id)) return;
      snd('crash');
      if (wasCur) { b.innerHTML = '<div class="prf-t">' + esc(t('загружаю профиль…')) + '</div>'; return; }
      view = { k: 'list' }; render();
    });
    return;
  }
  const rows = meta.list.map(p => {
    const c = p.id === meta.cur;
    return '<div class="prf-row' + (c ? ' cur' : '') + '">' +
      '<button type="button" class="prf-pick" data-id="' + p.id + '"' + (c && !view.focus ? ' autofocus' : '') + '>' + ava(p.id) + '<i class="prf-pt"><b>' + esc(label(p)) + '</b>' +
      '<span>' + esc((c ? t('играешь сейчас') + ' · ' : '') + info(p.id)) + '</span></i></button>' +
      '<button type="button" class="prf-ren" data-id="' + p.id + '" title="' + esc(t('переименовать')) + '"' + (view.focus === p.id ? ' autofocus' : '') + '>' + esc(t('имя')) + '</button>' +
      (meta.list.length > 1 ? '<button type="button" class="prf-del" data-id="' + p.id + '" title="' + esc(t('удалить')) + '">✕</button>' : '') +
      '</div>';
  }).join('');
  // трудовая книжка (UI-REVIEW № 45): шапка капсом, у каждого профиля — запись с портретом-полароидом
  b.innerHTML = '<header class="pp-head prf-head"><span>' + esc(t('трудовая книжка')) + '</span><b>' + esc(t('профили')) + '</b></header>' +
    '<div class="prf-l">' + rows + '</div>' +
    (meta.list.length < MAX ? '<button type="button" class="prf-new">+ ' + esc(t('новый профиль')) + '</button>' : '') +
    '<div class="prf-note">' + esc(t('у каждого профиля своя копилка, машины, районы и сюжет. язык, звук и достижения — общие. до {n} профилей', { n: MAX })) + '</div>' +
    '<button type="button" class="prf-close">' + keyHTML('back') + esc(t('назад')) + '</button>';
  b.querySelectorAll('.prf-pick').forEach(x => x.addEventListener('click', () => {
    const id = +x.dataset.id;
    if (id === meta.cur) { close(); return; }
    snd('coin');
    b.innerHTML = '<div class="prf-t">' + esc(t('загружаю профиль…')) + '</div>';
    use(id);
  }));
  b.querySelectorAll('.prf-ren').forEach(x => x.addEventListener('click', () => { view = { k: 'name', id: +x.dataset.id }; render(); }));
  b.querySelectorAll('.prf-del').forEach(x => x.addEventListener('click', () => { view = { k: 'del', id: +x.dataset.id }; render(); }));
  const nb = b.querySelector('.prf-new');
  if (nb) nb.addEventListener('click', () => { view = { k: 'name' }; render(); });
  b.querySelector('.prf-close').addEventListener('click', () => close());
  view.focus = null;
}
function saveName () {
  const inp = box.querySelector('#prf-in');
  const v = clean(inp && inp.value);
  if (!v) { if (inp) inp.focus(); return; }
  if (inp) inp.blur();
  if (view.id) {
    const id = view.id;
    if (id === meta.cur && A && A.setName) A.setName(v);   // текущий: и имя в игре (S.name, поле имени)
    rename(id, v);
    snd('coin');
    view = { k: 'list', focus: id };
    render();
    return;
  }
  snd('coin');
  box.querySelector('.prf-box').innerHTML = '<div class="prf-t">' + esc(t('загружаю профиль…')) + '</div>';
  create(v);
}

const DEBUG = { on, cur, curName, list, keys, peek, phys, shared, create, rename, remove, use, open: a => open(a), root, back, reload: () => reload(), get meta () { return meta; } };
