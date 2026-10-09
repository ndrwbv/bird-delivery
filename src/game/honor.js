/* ──────────────────────────────────────────────────────────────────────────
   Доска почёта (09.10.2026, IDEAS П6; правила — docs/CAREER.md «Доска почёта»).

   Пункт главного меню карьеры. Пробковая доска в деревянной раме, сверху красная табличка
   «ДОСКА ПОЧЁТА» и полароид курьера; две страницы:
     • достижения — грамоты на кнопках-гвоздиках: полученные яркие, закрытые бледные с полоской
       прогресса; у скрытого закрытого — «???» и намёк. Список — один на всё: achievements.js LIST,
       тот же, что уходит в Стим (те же id, те же условия). Взрослые — только во взрослой версии;
     • рекорды — фото на доске: лучшая смена, быстрый заезд, доставлено и сбито всего, смен, районов.
   Внизу — записка с подробностями того, на чём курсор (как открыть, сколько осталось, когда получено).

   Движение — акцентом: доска влетает; новые грамоты (полученные после прошлого просмотра,
   achievements.js unseen) по одной слетают на доску, шлёпаются, конфетти и печать «НОВАЯ»;
   на рекордах числа щёлкают счётчиком, новый рекорд смены / заезда — печать «РЕКОРД».

   Управление: геймпад — крестовина / стик по сетке, LB RB (и LT RT) — страницы, B — назад;
   клавиатура — стрелки / WASD, Q E (Tab) — страницы, Esc — назад; мышь — наведение и клик;
   палец — тап по грамоте, вкладки сверху. Свой курсор (.hb-on): общий padmenu.js сюда не ходит
   (data-pad-skip), иначе ↑↓ шагали бы по 32 грамотам подряд, а не по сетке.

     HONOR.open({ api, face, name, onClose })  — menu.js (api — то же, что у меню карьеры)
     HONOR.root() / close()                     — menu.js modal() / back()
     HONOR.pad(p)                               — career.js padPre (геймпад, до padMenu)
     HONOR.badge(cardEl)                        — menu.js: «+N» на карточке, если есть новые грамоты
     HONOR.shiftEnd(Store, delivered)           — career.js конец смены: доставлено за всю карьеру профиля

   Сохранение (у каждого профиля своё): dlv-delivered — доставлено за всю карьеру (до 09.10.2026 не
   считали: у старого сохранения с одним профилем — берём счётчик достижений «заказы»);
   dlv-honor — какие рекорды игрок уже видел (для печати «РЕКОРД»). Рекорды берутся из
   dlv-msk-best (лучшая смена), dlv-quick.best (быстрый заезд), dlv-knocked (сбито), dlv-shifts,
   районы — districts.js. Отметка «видел грамоту» — в dlv-ach (общем, как и сами достижения).
   ────────────────────────────────────────────────────────────────────────── */
import './honor.css';
import Platform from '../platform/index.js';
import { t, N_, lang } from '../i18n/index.js';
import { keyHTML, matchKey, onInput, refreshKeys } from '../input/glyphs.js';
import * as ACH from './achievements.js';
import * as DIST from './districts.js';
import * as PROF from './profiles.js';
import * as PFX from './paperfx.js';

const DELIV = 'dlv-delivered', SEEN = 'dlv-honor';
const GROUP = { progress: N_('прогресс'), skill: N_('мастерство'), chaos: N_('хаос'), fun: N_('смешные') };
/* значок на медали: цифра порога или символ */
const ICO = {
  FIRST_ORDER: '1', ORDERS_10: '10', ORDERS_100: '100', ORDERS_1000: '1K', SHIFT_FULL: '✓', SHIFTS_10: '10', SHIFTS_50: '50',
  DISTRICT_2: '2', CITY_OPEN: '★', PERFECT_SHIFT: '◷', CLEAN_SHIFT: '◇', LIGHTNING: 'ϟ', BUNDLE_5: '5', URGENT: '!', NIGHT_ORDER: '☾',
  ERRANDS_10: '10', PEDS_1: '1', PEDS_100: '100', SCOOTERS_10: '10', MAFIA_3: '3', RIVALS_5: '5', LAMPS_100: '100', STOPS_10: '10',
  CAR_BOOM: '✸', MOOSE: 'Ψ', DROWNED: '≈', POTHOLE: '◎', SEMERKA_50: '7', BUHANKA_20: '20', ALL_IN: '♦', TOLIK_MDAA: '…', ZINA: '♥',
};
/* скрытые (в Стиме описание видно только после получения) — до получения намёк вместо условия */
const SECRET = {
  CAR_BOOM: N_('секрет: машине бывает очень, очень плохо'),
  DROWNED: N_('секрет: Солнечный стоит у воды'),
  ALL_IN: N_('секрет: Толик знает, где играют по-крупному'),
};

let H = null, box = null;
const S = { tab: 'ach', i: { ach: 0, rec: 0 }, fresh: [], timers: [] };
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = n => String(Math.max(0, Math.round(+n || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const A = () => (H && H.api) || {};
const get = (k, d) => { try { const v = A().Store.get(k, d); return v == null ? d : v; } catch (e) { return d; } };
const set = (k, v) => { try { A().Store.set(k, v); } catch (e) { /* — */ } };
const money = n => (A().money ? A().money(n) : num(n));
const snd = (f, d = 0.05) => { try { A().Snd && A().Snd.click && A().Snd.click(f, 0.05, d); } catch (e) { /* — */ } };
const adult = () => A().ADULT !== false;

/* ── счётчики профиля ── */
/** один профиль на устройстве (или профилей нет) — счётчик достижений «заказы» можно считать его */
const solo = () => { try { return !PROF.on() || PROF.list().length <= 1; } catch (e) { return true; } };
/** доставлено за всю карьеру профиля; у старого сохранения (ключа ещё нет, смены были) — из достижений */
function delivered (Store = A().Store, atEnd = false, extra = 0) {
  const v = Store.get(DELIV, null);
  if (v != null && v !== '') return Math.max(0, +v || 0);
  // смен ДО этой: в конце смены dlv-shifts уже с ней (после сброса прогресса — 0, старый счётчик не берём)
  const shifts = (+Store.get('dlv-shifts', 0) || 0) - (atEnd ? 1 : 0);
  if (shifts <= 0 || !solo()) return 0;
  return Math.max(0, (+ACH.stats().orders || 0) - extra);
}
/** career.js конец смены карьеры (после записи dlv-shifts): +доставлено этой смены */
export function shiftEnd (Store, d) {
  if (!Store) return;
  d = Math.max(0, d | 0);
  try { Store.set(DELIV, delivered(Store, true, d) + d); } catch (e) { /* — */ }
}

/* ── данные страниц ── */
function achList () {
  return ACH.list().filter(a => !a.adult || adult()).map(a => ({ ...a, def: ACH.LIST.find(x => x.id === a.id) }));
}
function records () {
  const q = get('dlv-quick', null);
  const quick = q && typeof q === 'object' ? Math.max(0, +q.best || 0) : 0;
  const best = Math.max(0, +get('dlv-msk-best', 0) || 0);
  const shifts = Math.max(0, +get('dlv-shifts', 0) || 0);
  const rows = [
    { id: 'best', ico: '₽', c: 'lime', label: N_('лучшая смена'), v: best, fmt: money, none: N_('ещё не было'),
      note: N_('больше всего денег за одну смену карьеры. быстрый заезд не в счёт') },
    { id: 'quick', ico: '»', c: 'pink', label: N_('быстрый заезд'), v: quick, fmt: money, none: shifts ? N_('ещё не ездил') : N_('после первой смены'),
      note: N_('больше всего денег за один быстрый заезд') },
    { id: 'deliv', ico: '▤', c: 'orange', label: N_('доставлено всего'), v: delivered(), fmt: num, none: '0',
      note: N_('заказов за все смены карьеры этого профиля') },
  ];
  if (adult()) {
    rows.push({ id: 'hit', ico: '✖', c: 'red', label: N_('сбито всего'), v: Math.max(0, +get('dlv-knocked', 0) || 0), fmt: num, none: '0',
      note: N_('прохожих за все смены карьеры этого профиля') });
  } else {
    rows.push({ id: 'lamps', ico: '¡', c: 'red', label: N_('фонарей снесено'), v: Math.max(0, +ACH.stats().lamps || 0), fmt: num, none: '0',
      note: N_('за всё время на этом устройстве') });
  }
  rows.push({ id: 'shifts', ico: '☼', c: 'yellow', label: N_('смен отработано'), v: shifts, fmt: num, none: '0',
    note: N_('смен карьеры этого профиля — и коротких, и до полуночи') });
  if (DIST.has()) {
    const k = DIST.opened(), n = DIST.count();
    rows.push({ id: 'dist', ico: '⌂', c: 'sky', label: N_('районов открыто'), v: k, fmt: v => (k >= n ? t('весь город') : t('{k} из {n}', { k: v, n })), none: '1',
      note: N_('новый район открывается за смены в последнем открытом') });
  }
  return rows;
}

/* ── окно ── */
function build () {
  if (box) return box;
  box = document.createElement('div');
  box.id = 'honor';
  box.hidden = true;
  box.setAttribute('data-pad-skip', '');             // свой курсор по сетке (pad), общий padmenu сюда не ходит
  box.innerHTML =
    '<div class="hb-board">' +
      '<header class="hb-top">' +
        '<div class="hb-plaque"><b></b><small></small></div>' +
        '<nav class="hb-tabs"><button type="button" class="hb-tab" data-tab="ach"></button><button type="button" class="hb-tab" data-tab="rec"></button></nav>' +
        '<figure class="hb-me"><img alt=""><figcaption></figcaption></figure>' +
      '</header>' +
      '<div class="hb-body"><div class="hb-grid"></div></div>' +
      '<footer class="hb-foot"><div class="hb-cap"></div><button type="button" class="pp-note hb-back"></button></footer>' +
    '</div>';
  (document.getElementById('game') || document.body).appendChild(box);
  box.querySelector('.hb-back').addEventListener('click', () => close());
  box.addEventListener('click', e => { if (e.target === box) close(); });
  box.querySelectorAll('.hb-tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  const grid = box.querySelector('.hb-grid');
  grid.addEventListener('pointerover', e => { const c = e.target.closest('.hb-it'); if (c && e.pointerType === 'mouse') pick(+c.dataset.i, true); });
  grid.addEventListener('click', e => { const c = e.target.closest('.hb-it'); if (c) { pick(+c.dataset.i, true); poke(); } });
  return box;
}

/** открыть доску. o: { api, face, name, onClose } */
export function open (o = {}) {
  H = o;
  if (!A().Store) return;
  build();
  S.timers.forEach(clearTimeout); S.timers = [];
  const list = achList();
  const vis = new Set(list.map(a => a.id));
  S.fresh = ACH.unseen().filter(id => vis.has(id));
  ACH.markSeen();
  S.tab = 'ach';
  const first = S.fresh.length ? list.findIndex(a => a.id === S.fresh[0]) : list.findIndex(a => !a.got);
  S.i = { ach: Math.max(0, first), rec: 0 };
  box.querySelector('.hb-plaque b').textContent = t('доска почёта');
  const img = box.querySelector('.hb-me img');
  img.hidden = !o.face; if (o.face) img.src = o.face;
  box.querySelector('.hb-me figcaption').textContent = o.name || t('курьер');
  box.querySelector('.hb-back').innerHTML = keyHTML('back') + esc(t('назад'));
  box.hidden = false;
  const board = box.querySelector('.hb-board');
  PFX.replay(board, 'pp-in');
  render(true);
  try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) { /* — */ }   // карточка меню под доской не жмётся Enter / пробелом
}
export function close () {
  if (!box || box.hidden) return false;
  box.hidden = true;
  S.timers.forEach(clearTimeout); S.timers = [];
  const cb = H && H.onClose; if (H) H.onClose = null;
  if (cb) cb();
  return true;
}
/** открытое окно (menu.js modal(): геймпад, клавиатура) или null */
export const root = () => (box && !box.hidden && !box.closest('[hidden]') ? box : null);

/** menu.js: на карточку «доска почёта» — «+N», если есть грамоты, которых игрок ещё не видел */
export function badge (card) {
  if (!card) return;
  let n = 0;
  try { const vis = new Set(ACH.list().filter(a => !a.adult || adult()).map(a => a.id)); n = ACH.unseen().filter(id => vis.has(id)).length; } catch (e) { n = 0; }
  const btn = card.querySelector('button') || card;
  if (n > 0) btn.insertAdjacentHTML('beforeend', '<em class="hb-badge">+' + n + '</em>');
}
/** подпись карточки меню: «достижения 7 из 32 · рекорды» */
export function sub (api) {
  if (api) H = { ...(H || {}), api };
  let l = [];
  try { l = achList(); } catch (e) { l = []; }
  return t('достижения {k} из {n} · рекорды', { k: l.filter(a => a.got).length, n: l.length });
}

function setTab (tab) {
  if (!root() || tab === S.tab || (tab !== 'ach' && tab !== 'rec')) return;
  S.tab = tab;
  snd(tab === 'ach' ? 520 : 660, 0.04);
  render(false);
}
const flipTab = d => setTab(d > 0 ? 'rec' : 'ach');

function render (first) {
  S.timers.forEach(clearTimeout); S.timers = [];
  const ach = S.tab === 'ach';
  const list = achList();
  const got = list.filter(a => a.got).length;
  const steam = Platform.id === 'steam';
  box.querySelector('.hb-plaque small').textContent = ach
    ? (steam ? t('те же достижения, что в Стиме') : t('общие для всех профилей'))
    : t('рекорды профиля «{name}»', { name: (H && H.name) || t('курьер') });
  const tabs = box.querySelectorAll('.hb-tab');
  tabs[0].innerHTML = keyHTML('lb') + '<span>' + esc(t('достижения')) + '</span><em>' + got + '/' + list.length + '</em>';
  tabs[1].innerHTML = '<span>' + esc(t('рекорды')) + '</span>' + keyHTML('rb');
  tabs.forEach(b => b.classList.toggle('cur', b.dataset.tab === S.tab));
  const grid = box.querySelector('.hb-grid');
  grid.className = 'hb-grid ' + (ach ? 'hb-ach' : 'hb-rec');
  box.querySelector('.hb-body').scrollTop = 0;
  if (ach) {
    const fresh = new Set(S.fresh);
    grid.innerHTML = list.map((a, i) => achTile(a, i, fresh.has(a.id), first)).join('');
    if (first && S.fresh.length) landFresh(grid);
    else if (!first) PFX.stagger(grid.children, 0.012);
  } else {
    const rows = records();
    const seen = get(SEEN, null);
    const was = seen && typeof seen === 'object' ? seen : null;
    grid.innerHTML = rows.map((r, i) => recTile(r, i)).join('');
    PFX.stagger(grid.children, 0.06);
    rows.forEach((r, i) => {
      const el = grid.children[i].querySelector('.hb-rv');
      if (r.v > 0 && r.fmt !== undefined && r.id !== 'dist') PFX.countUp(el, 0, r.v, { ms: 800, fmt: r.fmt });
      // новый рекорд смены / заезда с прошлого раза — печать «РЕКОРД»
      if ((r.id === 'best' || r.id === 'quick') && was && r.v > (+was[r.id] || 0) && (+was[r.id] || 0) >= 0 && r.v > 0) {
        S.timers.push(setTimeout(() => {
          const ph = grid.children[i] && grid.children[i].querySelector('.hb-photo');
          if (!ph || !root()) return;
          ph.insertAdjacentHTML('beforeend', '<div class="pp-seal pp-seal-pink hb-seal">' + esc(t('рекорд')) + '</div>');
          PFX.burst(ph, { kind: 'confetti', n: 22 });
          try { A().Snd.coin && A().Snd.coin(); } catch (e) { /* — */ }
        }, 900 + i * 120));
      }
    });
    set(SEEN, Object.fromEntries(rows.map(r => [r.id, r.v])));
  }
  refreshKeys(box);
  pick(S.i[S.tab], false);
}

function achTile (a, i, fresh, wait) {
  const d = a.def || {};
  const g = d.group || 'progress';
  const secret = a.hidden && !a.got;
  const bar = !a.got && a.need > 1 ? '<span class="hb-bar"><i style="width:' + Math.round(100 * a.have / a.need) + '%"></i></span>' : '';
  return '<button type="button" class="hb-it hb-a g-' + g + (a.got ? ' got' : ' lock') + (secret ? ' secret' : '') + (fresh && wait ? ' hb-wait' : '') + '" data-i="' + i + '">' +
    '<i class="hb-pin" aria-hidden="true"></i>' +
    '<span class="hb-med" aria-hidden="true"><b>' + esc(secret ? '?' : ICO[a.id] || '★') + '</b></span>' +
    '<span class="hb-nm">' + esc(secret ? '???' : a.name) + '</span>' + bar +
    (fresh && !wait ? '<em class="pp-seal pp-seal-pink hb-new">' + esc(t('новая')) + '</em>' : '') + '</button>';
}
function recTile (r, i) {
  const val = r.v > 0 ? (r.id === 'dist' ? r.fmt(r.v) : r.fmt(0)) : t(r.none);
  return '<button type="button" class="hb-it hb-r c-' + r.c + (r.v > 0 ? '' : ' none') + '" data-i="' + i + '">' +
    '<i class="hb-pin" aria-hidden="true"></i>' +
    '<span class="hb-photo" aria-hidden="true"><b>' + esc(r.ico) + '</b></span>' +
    '<span class="hb-rl">' + esc(t(r.label)) + '</span><b class="hb-rv">' + esc(val) + '</b></button>';
}

/* новые грамоты слетают на доску по одной: шлепок, конфетти, печать «НОВАЯ»; больше восьми — остальные сразу */
function landFresh (grid) {
  const ids = S.fresh.slice();
  const list = achList();
  ids.forEach((id, k) => {
    const i = list.findIndex(a => a.id === id);
    const el = grid.children[i];
    if (!el) return;
    const go = () => {
      if (!root() || !el.isConnected) return;
      el.classList.remove('hb-wait');
      PFX.replay(el, 'hb-fly');
      S.timers.push(setTimeout(() => {
        if (!el.isConnected) return;
        el.insertAdjacentHTML('beforeend', '<em class="pp-seal pp-seal-pink hb-new">' + esc(t('новая')) + '</em>');
        PFX.burst(el, { kind: 'confetti', n: 18, spread: 0.7 });
        const desk = box.querySelector('.hb-board');
        if (desk) PFX.replay(desk, 'pp-shake');
        snd(880 + Math.min(k, 6) * 110, 0.08);
      }, 380));
    };
    if (k < 8) S.timers.push(setTimeout(go, 520 + k * 330));
    else { el.classList.remove('hb-wait'); el.insertAdjacentHTML('beforeend', '<em class="pp-seal pp-seal-pink hb-new">' + esc(t('новая')) + '</em>'); }
  });
  if (ids.length) S.timers.push(setTimeout(() => { try { root() && A().Snd.coin && A().Snd.coin(); } catch (e) { /* — */ } }, 520 + Math.min(ids.length, 8) * 330 + 200));
}

/* ── курсор и подпись ── */
const items = () => (box ? [...box.querySelectorAll('.hb-grid .hb-it')] : []);
function pick (i, quiet) {
  const els = items();
  if (!els.length) { caption(null); return; }
  i = Math.max(0, Math.min(els.length - 1, i | 0));
  const was = S.i[S.tab];
  S.i[S.tab] = i;
  els.forEach((el, j) => el.classList.toggle('hb-on', j === i));
  if (quiet !== false && was !== i) snd(560 + (i % 8) * 30, 0.025);
  const el = els[i];
  if (el.scrollIntoView) {
    const b = box.querySelector('.hb-body');
    if (b.scrollHeight > b.clientHeight + 2) el.scrollIntoView({ block: 'nearest', behavior: quiet === false ? 'auto' : 'smooth' });
  }
  caption(i);
}
function poke () {
  const el = items()[S.i[S.tab]];
  if (!el) return;
  PFX.replay(el, 'hb-poke');
  if (S.tab === 'ach' && el.classList.contains('got')) snd(1046, 0.06);
  else snd(330, 0.05);
}
function caption (i) {
  const cap = box.querySelector('.hb-cap');
  if (i == null) { cap.innerHTML = ''; return; }
  if (S.tab === 'ach') {
    const a = achList()[i];
    if (!a) return;
    const d = a.def || {};
    const secret = a.hidden && !a.got;
    const how = a.got ? t(d.desc) : secret ? t(SECRET[a.id] || N_('секрет: откроется само, когда случится')) : t('как открыть: {how}', { how: t(d.desc) });
    let st;
    if (a.got) {
      let when = '';
      try { when = a.at ? new Date(a.at).toLocaleDateString(lang() === 'ru' ? 'ru-RU' : undefined, { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''; } catch (e) { when = ''; }
      st = '<em class="hb-st ok">' + esc(when ? t('получено {date}', { date: when }) : t('получено')) + '</em>';
    } else st = '<em class="hb-st">' + esc(a.need > 1 ? t('{have} из {need}', { have: num(a.have), need: num(a.need) }) : t('ещё нет')) + '</em>';
    cap.className = 'hb-cap g-' + (d.group || 'progress') + (a.got ? ' got' : ' lock');
    cap.innerHTML = '<span class="hb-med" aria-hidden="true"><b>' + esc(secret ? '?' : ICO[a.id] || '★') + '</b></span>' +
      '<div class="hb-ct"><p><b>' + esc(secret ? '???' : a.name) + '</b><small>' + esc(t(GROUP[d.group] || '')) + '</small></p><span>' + esc(how) + '</span></div>' + st;
  } else {
    const r = records()[i];
    if (!r) return;
    cap.className = 'hb-cap rec c-' + r.c;
    cap.innerHTML = '<span class="hb-med" aria-hidden="true"><b>' + esc(r.ico) + '</b></span>' +
      '<div class="hb-ct"><p><b>' + esc(t(r.label)) + '</b></p><span>' + esc(t(r.note)) + '</span></div>' +
      '<em class="hb-st ok">' + esc(r.v > 0 ? r.fmt(r.v) : t(r.none)) + '</em>';
  }
}
/* ←→ — соседняя по порядку; ↑↓ — ближайшая в ряду выше / ниже (по раскладке на экране) */
function move (dx, dy) {
  const els = items();
  if (!els.length) return;
  let i = S.i[S.tab];
  if (dx) i = Math.max(0, Math.min(els.length - 1, i + dx));
  else if (dy) {
    const a = els[i].getBoundingClientRect(), cx = a.left + a.width / 2;
    let best = -1, bd = Infinity;
    els.forEach((el, j) => {
      const b = el.getBoundingClientRect(), dv = (b.top - a.top) * dy;
      if (dv < a.height * 0.5) return;
      const dd = dv * 3 + Math.abs(b.left + b.width / 2 - cx);
      if (dd < bd) { bd = dd; best = j; }
    });
    if (best < 0) return;
    i = best;
  }
  if (i !== S.i[S.tab]) pick(i, true);
}

/** career.js padPre: геймпад, пока доска открыта. B — там же (back → menu.js → close) */
export function pad (p) {
  if (!root() || !p) return;
  const pg = (p.pageR || p.trigR ? 1 : 0) - (p.pageL || p.trigL ? 1 : 0);
  if (pg) flipTab(pg);
  const dx = (p.menuRight ? 1 : 0) - (p.menuLeft ? 1 : 0), dy = (p.menuDown ? 1 : 0) - (p.menuUp ? 1 : 0);
  if (dx || dy) move(dx, dy);
  if (p.menuOk) poke();
  p.menuUp = p.menuDown = p.menuLeft = p.menuRight = p.menuOk = p.pageL = p.pageR = p.trigL = p.trigR = false;
}

/* клавиатура: раньше career.js (модуль грузится раньше его init) — стрелки / WASD, Q E и Tab, Enter, Esc */
const NAV = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
function onKey (e) {
  if (!root()) return;
  const tg = e.target;
  if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return;
  const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
  if (NAV[e.code]) { stop(); move(NAV[e.code][0], NAV[e.code][1]); return; }
  if (matchKey('lb', e) || matchKey('rb', e) || e.code === 'Tab') {
    stop();
    if (!e.repeat) { if (e.code === 'Tab') setTab(S.tab === 'ach' ? 'rec' : 'ach'); else flipTab(matchKey('rb', e) ? 1 : -1); }
    return;
  }
  if (matchKey('back', e)) { stop(); if (!e.repeat) { PFX.press(box.querySelector('.hb-back')); close(); } return; }
  if (matchKey('ok', e)) { stop(); if (!e.repeat) poke(); }
}
if (typeof addEventListener === 'function') addEventListener('keydown', onKey, true);
onInput(() => { if (root()) refreshKeys(box); });

/* для проверки: __dlv.HONOR */
export const DEBUG = { open, close, root, pad, records, achList, delivered: () => delivered(), get S () { return S; }, setTab, move };
if (typeof window !== 'undefined') setTimeout(() => { if (window.__dlv) window.__dlv.HONOR = DEBUG; }, 0);
