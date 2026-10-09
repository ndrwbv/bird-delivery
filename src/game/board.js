/* ──────────────────────────────────────────────────────────────────────────
   Таблица рекордов «лучшая смена» — в Стим-сборке (docs/STEAM.md §4.2).

   • конец смены карьеры (CAREERM.onShiftEnd): заработок смены уходит в таблицу Стима BEST_SHIFT
     (Стим сам оставляет лучший результат игрока) и в локальную таблицу этого компьютера.
     Не пишем: ?nolb (проверочные прогоны), смена без заработка. На экране итогов — строка
     «смена в таблице рекордов · #N в мире»;
   • меню карьеры (menu.js): кнопка «таблица рекордов» → окно с вкладками «весь мир / друзья».
     Стим не запущен или не ответил — без вкладок, лучшие смены на этом компьютере.
   В web и Яндексе модуль молчит (on() — false): там всё как было.
   Мост — Platform.steam.leaderboard и Platform.leaderboard (src/platform/steam.js).
   ────────────────────────────────────────────────────────────────────────── */
import './board.css';
import Platform from '../platform/index.js';
import { t } from '../i18n/index.js';
import { keyHTML } from '../input/glyphs.js';   // «[B] назад» — значком того, чем играют

export const LB_NAME = 'BEST_SHIFT';
const TOP = 10;
let A = null, box = null, tab = 'world', seq = 0, onClose = null;
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SB = () => (Platform.steam && Platform.steam.leaderboard) || null;
const steamOn = () => !!(SB() && SB().available);

/** только Стим-сборка */
export const on = () => Platform.id === 'steam';

/** game.js: { nolb, level(), money(n) } */
export function init (api) { A = api; }

/** career.js onShiftEnd: { money, delivered, … } — смена в таблицу */
export function shiftEnd (r) {
  if (!A || !on() || A.nolb || !r || !(r.money > 0)) return;
  const name = String(Platform.player.name || '').trim();
  Platform.leaderboard.submit(r.money, { name, delivered: r.delivered || 0, level: A.level() }).then(ok => {
    const last = Platform.leaderboard.last;
    const line = !ok ? t('Стим не ответил — смена записана на этом компьютере')
      : last && last.rank > 0 ? (last.changed ? t('лучшая смена! ты #{n} в мире', { n: last.rank }) : t('смена в таблице рекордов · ты #{n} в мире', { n: last.rank }))
      : t('смена в таблице рекордов');
    const ov = $('over'), note = $('st-note2');
    if (ov && !ov.hidden && note) { note.textContent = line; note.classList.toggle('bad', !ok); }
  }).catch(e => console.warn('[board] submit:', e));
}

/* ── окно ── */
function build () {
  if (box) return box;
  box = document.createElement('div');
  box.id = 'crm-lb';
  box.hidden = true;
  box.innerHTML = '<div class="crm-dbox lbd-box"><div class="crm-dt"></div>' +
    '<div class="lbd-tabs"><button type="button" data-tab="world"></button><button type="button" data-tab="friends"></button></div>' +
    '<div class="lbd-sub"></div><ol class="lbd-list"></ol><div class="crm-dn lbd-me"></div>' +
    '<button type="button" class="crm-dclose"></button></div>';
  ($('big') || document.body).appendChild(box);
  box.querySelector('.crm-dclose').addEventListener('click', () => close());
  box.addEventListener('click', e => { if (e.target === box) close(); });
  box.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { if (tab !== b.dataset.tab) { tab = b.dataset.tab; load(); } }));
  return box;
}

export function open (cb) {
  if (!on()) return;
  build();
  onClose = cb || null;
  box.querySelector('.crm-dt').textContent = t('лучшая смена');
  box.querySelector('[data-tab="world"]').textContent = t('весь мир');
  box.querySelector('[data-tab="friends"]').textContent = t('друзья');
  box.querySelector('.crm-dclose').innerHTML = keyHTML('back') + esc(t('назад'));
  box.hidden = false;
  load();
}
export function close () {
  if (!box || box.hidden) return false;
  box.hidden = true;
  seq++;
  const cb = onClose; onClose = null;
  if (cb) cb();
  return true;
}
/** открытое окно (геймпад, клавиатура — menu.js modal()) или null */
export const root = () => (box && !box.hidden && !box.closest('[hidden]') ? box : null);

const row = r => '<li' + (r.me ? ' class="me"' : '') + '><em>' + (r.rank || '') + '</em><b>' + esc(r.name || t('курьер')) + '</b>' +
  (r.level ? '<i title="' + esc(t('уровень курьера')) + '">' + r.level + '</i>' : '<i class="none"></i>') + '<span>' + esc(A ? A.money(r.score) : r.score) + '</span></li>';

function paint (rows, sub, me) {
  const list = box.querySelector('.lbd-list');
  if (!rows) { list.innerHTML = '<li class="empty">' + esc(t('загружаю…')) + '</li>'; return; }
  const top = rows.filter(r => !r.extra);
  const tail = rows.filter(r => r.extra);
  list.innerHTML = (top.map(row).join('') + (tail.length ? '<li class="gap">…</li>' + tail.map(row).join('') : ''))
    || '<li class="empty">' + esc(t('пока пусто — съезди смену, и ты первый')) + '</li>';
  box.querySelector('.lbd-sub').textContent = sub || '';
  box.querySelector('.lbd-me').textContent = me || '';
}

async function load () {
  const my = ++seq;
  const steam = steamOn();
  const tabs = box.querySelector('.lbd-tabs');
  tabs.hidden = !steam;
  tabs.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('cur', b.dataset.tab === tab));
  box.querySelector('.lbd-sub').textContent = '';
  box.querySelector('.lbd-me').textContent = '';
  paint(null);
  let rows = null, sub = '', me = '';
  if (steam) {
    if (tab === 'friends') {
      rows = await SB().friends(LB_NAME);
      if (rows && rows.length <= 1) sub = t('друзей в таблице пока нет — позови их в Солнечный');
    } else {
      rows = await SB().top(LB_NAME, TOP);
      if (rows && !rows.some(r => r.me)) {
        const around = await SB().around(LB_NAME, 0);
        const mine = around && around.find(r => r.me);
        if (mine) rows = rows.concat({ ...mine, extra: true });
      }
    }
    if (my !== seq) return;
    if (rows) {
      const mine = rows.find(r => r.me);
      me = mine ? t('ты — {n}-й, {money}', { n: mine.rank, money: A ? A.money(mine.score) : mine.score }) : t('тебя в таблице ещё нет — отработай смену');
    } else {
      tabs.hidden = true;
      sub = t('Стим не ответил — лучшие смены на этом компьютере');
    }
  }
  if (!rows) {
    const lb = Platform.leaderboard;
    rows = await (lb.local ? lb.local.top(TOP) : lb.top(TOP));
    if (my !== seq) return;
    if (!sub) sub = t('лучшие смены на этом компьютере');
  }
  paint(rows, sub, me);
}
