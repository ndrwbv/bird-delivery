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
       api: { money(n), info() → строка-подпись профиля (читает Store), face(id) → портрет, setName(n), Snd, onClose(), swap() }

   Окно (10.10.2026): слева — карточка сотрудника «Птицы Пиццы» текущего профиля (шапка с логотипом,
   фото, имя, должность, звание, место работы, стаж, доставлено, лучшая смена, копилка, штрихкод с
   табельным номером, подпись и печать), под ней «переименовать» / «удалить»; справа — «трудовая
   книжка»: другие профили (нажал — играешь им), «+ новый профиль», «назад». Геймпад и клавиатура —
   общий padmenu.js по порядку кнопок; курсор сразу на «назад» (A не глядя — закрыть, как раньше). */
import './profiles.css';
import { t, tn } from '../i18n/index.js';
import { keyHTML } from '../input/glyphs.js';
import * as DIST from './districts.js';             // карточка: район и сколько открыто (читает Store профиля — через peek)
import { level as rankOf } from './respect.js';     // карточка: звание по респекту профиля

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
  'dlv-heroq', 'dlv-quick', 'dlv-don-trash', 'dlv-don-gang', 'dlv-respect', 'dlv-pz-grow', 'dlv-delivered', 'dlv-honor', 'dlv-route-ask'];

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
  b.classList.toggle('prf-wide', view.k === 'list');   // список — стол: карточка сотрудника и трудовая книжка
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
      if (wasCur) { loading(b); return; }
      view = { k: 'list' }; render();
    });
    return;
  }
  // другие профили — записи «трудовой книжки» справа; текущий — карточкой сотрудника слева
  const rows = meta.list.filter(p => p.id !== meta.cur).map(p =>
    '<div class="prf-row">' +
      '<button type="button" class="prf-pick" data-id="' + p.id + '">' + ava(p.id) + '<i class="prf-pt"><b>' + esc(label(p)) + '</b>' +
      '<span>' + esc(info(p.id)) + '</span></i></button>' +
      '<button type="button" class="prf-ren" data-id="' + p.id + '" title="' + esc(t('переименовать')) + '"' + (view.focus === p.id ? ' autofocus' : '') + '>' + esc(t('имя')) + '</button>' +
      '<button type="button" class="prf-del" data-id="' + p.id + '" title="' + esc(t('удалить')) + '">✕</button>' +
    '</div>').join('');
  const me = meta.list.find(p => p.id === meta.cur);
  const many = meta.list.length > 1;
  b.innerHTML =
    '<div class="prf-mine">' + card(me) +
      '<div class="prf-acts">' +
        '<button type="button" class="prf-ren" data-id="' + me.id + '"' + (view.focus === me.id ? ' autofocus' : '') + '>' + esc(t('переименовать')) + '</button>' +
        (many ? '<button type="button" class="prf-del" data-id="' + me.id + '">✕ ' + esc(t('удалить')) + '</button>' : '') +
      '</div>' +
    '</div>' +
    // трудовая книжка (UI-REVIEW № 45): шапка капсом, у каждого профиля — запись с портретом-полароидом
    '<section class="prf-side">' +
      '<header class="pp-head prf-head"><span>' + esc(t('трудовая книжка')) + '</span><b>' + meta.list.length + ' / ' + MAX + '</b></header>' +
      (rows ? '<div class="prf-sub">' + esc(t('другие профили')) + '</div>' : '') +
      (rows ? '<div class="prf-l">' + rows + '</div>' : '<div class="prf-empty">' + esc(t('пока ты один. позови друга — у нового профиля будет своя карточка')) + '</div>') +
      (meta.list.length < MAX ? '<button type="button" class="prf-new">+ ' + esc(t('новый профиль')) + '</button>' : '') +
      '<div class="prf-note">' + esc(t('у каждого профиля своя копилка, машины, районы и сюжет. язык, звук и достижения — общие. до {n} профилей', { n: MAX })) + '</div>' +
      '<button type="button" class="prf-close"' + (view.focus ? '' : ' autofocus') + '>' + keyHTML('back') + esc(t('назад')) + '</button>' +
    '</section>';
  b.querySelectorAll('.prf-pick').forEach(x => x.addEventListener('click', () => {
    const id = +x.dataset.id;
    if (id === meta.cur) { close(); return; }
    snd('coin');
    loading(b);
    use(id);
  }));
  b.querySelectorAll('.prf-ren').forEach(x => x.addEventListener('click', () => { view = { k: 'name', id: +x.dataset.id }; render(); }));
  b.querySelectorAll('.prf-del').forEach(x => x.addEventListener('click', () => { view = { k: 'del', id: +x.dataset.id }; render(); }));
  const nb = b.querySelector('.prf-new');
  if (nb) nb.addEventListener('click', () => { view = { k: 'name' }; render(); });
  b.querySelector('.prf-close').addEventListener('click', () => close());
  view.focus = null;
}
/* «загружаю профиль…» — обычный лист (карточка и книжка уходят) */
function loading (b) {
  b.classList.remove('prf-wide');
  b.innerHTML = '<div class="prf-t">' + esc(t('загружаю профиль…')) + '</div>';
}

/* ── карточка сотрудника: всё читается из сохранения профиля (peek), новых счётчиков нет ── */
const num = n => String(Math.max(0, Math.round(+n || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const money = n => { try { return A && A.money ? A.money(n) : num(n) + ' ₽'; } catch (e) { return num(n); } };
/* число из строки — одно и то же для профиля: табельный номер, штрихкод, роспись */
function hash (s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function stats (id) {
  return peek(id, () => {
    const g = (k, d) => { try { const v = st.get(k, d); return v == null || v === '' ? d : v; } catch (e) { return d; } };
    const dl = g('dlv-delivered', null);
    let place = '', dist = '';
    try {
      if (DIST.has()) {
        const L = DIST.list(), k = DIST.opened(), n = DIST.count(), d = L[DIST.cur()];
        place = g('dlv-city-mode', false) ? t('весь город') : d && d.name ? t('район «{name}»', { name: t(d.name) }) : '';
        dist = k >= n ? t('весь город') : t('районов {k} из {n}', { k, n });
      }
    } catch (e) { /* — */ }
    let rank = '';
    try { rank = rankOf(Math.max(0, +g('dlv-respect', 0) || 0)).name; } catch (e) { rank = ''; }
    return {
      shifts: Math.max(0, +g('dlv-shifts', 0) || 0),
      wallet: Math.max(0, +g('dlv-msk-wallet', 0) || 0),
      best: Math.max(0, +g('dlv-msk-best', 0) || 0),
      deliv: Math.max(0, +(dl != null ? dl : g('dlv-msk-xp', 0)) || 0),
      respect: Math.max(0, +g('dlv-respect', 0) || 0),
      rank, place, dist,
    };
  });
}
/* штрихкод: полоски 1…3 ед. из табельного номера, по краям — длинные «стоп»-полоски */
function barcode (seed) {
  let h = seed, x = 0, out = '';
  const bar = (w, tall) => { out += '<rect x="' + x + '" y="0" width="' + w + '" height="' + (tall ? 30 : 26) + '"/>'; x += w; };
  bar(1, 1); x += 1; bar(1, 1); x += 2;
  for (let i = 0; i < 26; i++) { h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; bar(1 + (h & 3) % 3); x += 1 + ((h >>> 3) & 1); }
  x += 1; bar(1, 1); x += 1; bar(1, 1);
  return '<svg class="prf-bar" viewBox="0 0 ' + x + ' 30" preserveAspectRatio="none" aria-hidden="true">' + out + '</svg>';
}
/* роспись: волнистая петля из имени — у каждого своя */
function scribble (seed) {
  let h = seed, d = 'M4 22';
  for (let i = 0; i < 6; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    const x = 10 + i * 17, up = 4 + (h % 12), dn = 22 + ((h >>> 5) % 8);
    d += ' C' + (x - 6) + ' ' + up + ',' + (x + 8) + ' ' + up + ',' + (x + 2) + ' ' + dn;
  }
  d += ' Q 112 30, 124 14';
  return '<svg class="prf-sig" viewBox="0 0 128 34" aria-hidden="true"><path d="' + d + '"/></svg>';
}
/* круглая печать пиццерии: по кругу — название и город, в середине — должность */
function seal () {
  const ring = (t('Птица Пицца') + ' · ' + t('Солнечный') + ' · ' + t('отдел кадров') + ' ·').toUpperCase();
  const mid = t('курьер').toUpperCase();
  const fs = Math.min(11, Math.floor(64 / Math.max(1, mid.length)));
  return '<svg class="prf-seal" viewBox="0 0 120 120" aria-hidden="true">' +
    '<defs><path id="prf-arc" d="M60 60 m-43 0 a43 43 0 1 1 86 0 a43 43 0 1 1 -86 0"/></defs>' +
    '<circle cx="60" cy="60" r="56" fill="none" stroke-width="4"/><circle cx="60" cy="60" r="33" fill="none" stroke-width="2"/>' +
    '<text font-size="8.5"><textPath href="#prf-arc" textLength="266" lengthAdjust="spacing">' + esc(ring) + '</textPath></text>' +
    '<text x="60" y="' + (61 + fs / 2) + '" text-anchor="middle" font-size="' + fs + '">' + esc(mid) + '</text>' +
    '<text x="60" y="' + (47 - fs / 4) + '" text-anchor="middle" font-size="8">★</text><text x="60" y="' + (82 + fs / 4) + '" text-anchor="middle" font-size="8">★</text>' +
    '</svg>';
}
function card (p) {
  const s = stats(p.id), name = label(p);
  const no = String(1000 + (hash('dlv-prof-' + p.id) % 9000));
  const face = (() => { try { return A && A.face ? A.face(p.id) : ''; } catch (e) { return ''; } })();
  const field = (k, v, cls) => (v ? '<div class="prf-fd' + (cls ? ' ' + cls : '') + '"><dt>' + esc(k) + '</dt><dd>' + v + '</dd></div>' : '');
  const cell = (k, v, cls) => '<div class="prf-st' + (cls ? ' ' + cls : '') + '"><small>' + esc(k) + '</small><b>' + esc(v) + '</b></div>';
  return '<article class="prf-card">' +
    '<header class="prf-ct"><img class="prf-logo" src="brand/logo-256.jpg" alt="">' +
      '<div class="prf-brand"><b>' + esc(t('Птица Пицца')) + '</b><small>' + esc(t('удостоверение курьера')) + '</small></div>' +
      '<span class="prf-on">' + esc(t('на смене')) + '</span></header>' +
    '<div class="prf-cb">' +
      '<figure class="prf-photo">' + (face ? '<img src="' + face + '" alt="">' : '<i></i>') + seal() + '</figure>' +
      '<dl class="prf-fields">' +
        field(t('фамилия, имя'), esc(name), 'prf-name') +
        field(t('должность'), esc(t('курьер'))) +
        field(t('звание'), s.rank ? esc(s.rank) + (s.respect ? ' <em>★ ' + num(s.respect) + '</em>' : '') : '') +
        field(t('место работы'), s.place ? esc(s.place) + (s.dist ? ' <em>' + esc(s.dist) + '</em>' : '') : '') +
      '</dl>' +
    '</div>' +
    '<div class="prf-stats">' +
      cell(t('стаж'), s.shifts ? tn(s.shifts, '{n} смена|{n} смены|{n} смен') : t('новичок')) +
      cell(t('доставлено'), num(s.deliv)) +
      cell(t('лучшая смена'), s.best ? money(s.best) : t('ещё не было'), s.best ? 'prf-money' : '') +
      cell(t('в копилке'), money(s.wallet), 'prf-money') +
    '</div>' +
    '<footer class="prf-cf">' +
      '<div class="prf-code">' + barcode(hash(no + name)) + '<small>' + esc(t('табель № {n}', { n: no })) + '</small></div>' +
      '<div class="prf-sign">' + scribble(hash(name || no)) + '<small>' + esc(t('подпись')) + '</small></div>' +
    '</footer>' +
  '</article>';
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
  loading(box.querySelector('.prf-box'));
  create(v);
}

const DEBUG = { on, cur, curName, list, keys, peek, phys, shared, create, rename, remove, use, open: a => open(a), root, back, reload: () => reload(), get meta () { return meta; } };
