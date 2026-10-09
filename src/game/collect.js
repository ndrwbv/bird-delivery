/* «Мои находки» — окно меню (game.js openPanel('collect')): лист «как накладная» (paper.css).
   Шапка «НАХОДКИ КУРЬЕРА ··· 3 / 10», полоска «сколько собрал», сетка карточек: найденное — фото
   на бумаге с подписью и зелёной галочкой, ненайденное — пунктирный конверт с «?». Под сеткой —
   записка про карточку под курсором (что это или где искать: во дворах у пиццерии / за рекой /
   подальше), внизу — пометка «[B] назад» и «за каждую — 5 000 ₽».
   Геймпад: курсор по карточкам (padmenu.js), ↑↓ — на ряд вверх-вниз, ←→ — соседняя; B — назад.
   Пальцем и мышью — то же: тап или наведение показывает записку.

     COLM.render(body, { items, got, icon, prize })   — нарисовать в #pn-body
     COLM.pad(p, menu, root)                           — в кадре геймпада: ↑↓ — по рядам сетки
     COLM.sync(el)                                     — после хода курсора: записка про карточку под ним
                                                         (фокус-события без фокуса окна не приходят) */
import './collect.css';
import { t } from '../i18n/index.js';
import { keyHTML } from '../input/glyphs.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// где искать — по тому, куда кладёт buildCollect (game.js): near — дворы у пиццерии, far — за рекой, прочее — далеко
const where = c => (c.near ? t('во дворах рядом с пиццерией') : c.far ? t('за рекой') : t('подальше от пиццерии, на этом берегу'));

let ITEMS = [], GOT = [], PRIZE = '', SHOW = null;

export function render (body, o) {
  ITEMS = o.items; GOT = o.got; PRIZE = o.prize;
  const n = ITEMS.filter(c => GOT.includes(c.id)).length, all = ITEMS.length;
  body.innerHTML =
    '<div class="pn-t col-head"><span>' + esc(t('находки курьера')) + '</span><b id="col-count">' + n + ' / ' + all + '</b></div>' +
    '<div class="col-bar" aria-hidden="true"><i style="width:' + Math.round(n / Math.max(1, all) * 100) + '%"></i></div>' +
    '<div id="col-grid"></div>' +
    '<p class="col-note" aria-live="polite"></p>' +
    '<div class="col-foot"><button type="button" class="pp-note col-close">' + keyHTML('back') + esc(t('назад')) + '</button>' +
    '<span>' + esc(t('предметы разбросаны по району, часть — во дворах у пиццерии. За каждый — {money}', { money: PRIZE })) + '</span></div>';
  const grid = body.querySelector('#col-grid');
  ITEMS.forEach((c, i) => {
    const have = GOT.includes(c.id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'col-c' + (have ? ' have' : '');
    b.dataset.i = String(i);
    if (i === 0) b.dataset.padMain = '';
    b.setAttribute('aria-label', have ? c.name : t('ещё не нашёл'));
    if (have) {
      const ph = document.createElement('i'); ph.className = 'col-ph'; ph.appendChild(o.icon(c, true)); b.appendChild(ph);
      const nm = document.createElement('span'); nm.textContent = c.name; b.appendChild(nm);
    } else b.innerHTML = '<i class="col-ph"><b>?</b></i><span>' + esc(t('не найдено')) + '</span>';
    grid.appendChild(b);
  });
  const note = body.querySelector('.col-note');
  const show = b => {
    const c = ITEMS[+b.dataset.i];
    if (!c) return;
    for (const x of grid.querySelectorAll('.col-c.on')) x.classList.remove('on');
    b.classList.add('on');
    note.innerHTML = GOT.includes(c.id)
      ? '<b>' + esc(c.name) + '</b><em class="pp-plus">' + esc(t('нашёл · +{money}', { money: PRIZE })) + '</em>'
      : '<b>' + esc(t('ещё не нашёл')) + '</b><em>' + esc(t('искать: {where}', { where: where(c) })) + '</em>';
  };
  grid.addEventListener('focusin', e => { const b = e.target.closest('.col-c'); if (b) show(b); });
  grid.addEventListener('pointerover', e => { const b = e.target.closest('.col-c'); if (b) show(b); });
  grid.addEventListener('click', e => {
    const b = e.target.closest('.col-c'); if (!b) return;
    show(b);
    b.classList.remove('col-bump'); void b.offsetWidth; b.classList.add('col-bump');   // A по карточке — подпрыгнула
  });
  SHOW = show;
  const first = grid.querySelector('.col-c');
  if (first) show(first);
  body.querySelector('.col-close').addEventListener('click', () => { const x = document.getElementById('pn-close'); if (x) x.click(); });
}

/* ↑↓ — на ряд вверх-вниз по сетке (padmenu сам ходит только по списку); с нижнего ряда ↓ — на «назад» */
export function pad (p, menu, root) {
  const d = (p.menuDown ? 1 : 0) - (p.menuUp ? 1 : 0);
  if (!d || !menu.select) return;
  const grid = root.querySelector('#col-grid'), cur = menu.selected();
  if (!grid || !cur || !cur.classList.contains('padsel')) return;   // курсор погашен — первое нажатие его только будит (padmenu.js)
  const cells = [...grid.querySelectorAll('.col-c')], close = root.querySelector('.col-close');
  const cols = Math.max(1, cells.filter(c => c.offsetTop === cells[0].offsetTop).length);   // сколько в ряду — по раскладке (на телефоне меньше)
  let next = null;
  if (cur === close) next = d < 0 ? cells[Math.max(0, cells.length - cols)] : cells[0];
  else {
    const i = cells.indexOf(cur);
    if (i < 0) return;
    const j = i + d * cols;
    next = j < 0 ? close : j >= cells.length ? (Math.floor(i / cols) < Math.floor((cells.length - 1) / cols) ? cells[cells.length - 1] : close) : cells[j];
  }
  if (next) { menu.select(next); p.menuDown = p.menuUp = false; }
}

/* курсор геймпада встал на карточку — записка про неё (focusin без фокуса окна не приходит) */
export function sync (el) {
  if (SHOW && el && el.classList.contains('col-c') && !el.classList.contains('on')) SHOW(el);
}
