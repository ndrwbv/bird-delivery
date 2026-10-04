/* Карусель карточек (04.10.2026): главное меню карьеры (menu.js) и настройки (settings.js) —
   как выбор машины в гараже (garage.js): крупная карточка в центре, соседи по краям меньше и
   темнее, дальше второй — не видно. Правила — docs/CAREER.md «Главное меню» и «Настройки».

     const C = carousel(host, { cls, onChange(i, card), wrap, scales, reach })
       scales — размер карточки в центре, у соседа, у второго ([1, .8, .64]); reach — сколько соседей
       видно с каждой стороны (2; дальше — прозрачные)
     C.set(cards, i)    — карточки (элементы; у каждой может быть data-key), какая в центре
     C.go(i) / C.flip(±1) / C.idx() / C.card() / C.find(key) → номер
     C.el               — корень: стрелки ◀ ▶, сцена, точки внизу

   Листать: свайп пальцем или мышью (перетаскивание дальше 50 px), стрелки ◀ ▶ по краям,
   точки, клик по соседней карточке; клавиши ←→ и геймпад (стик, крестовина, LB/RB) — зовут
   C.flip снаружи (career.js padPre / onKey, game.js padStep). Кнопки соседних карточек
   геймпад и клавиатура не видят (data-pad-skip, padmenu.js), а клик по соседней только листает.
   У кнопки в центральной карточке, отмеченной data-main, ставится autofocus — на неё встаёт
   подсветка геймпада после листания. */
import './carousel.css';

export function carousel (host, opts = {}) {
  const el = document.createElement('div');
  el.className = 'cz' + (opts.cls ? ' ' + opts.cls : '');
  el.innerHTML = '<div class="cz-arr l" role="button" aria-label="prev">◀</div>' +
    '<div class="cz-stage"><div class="cz-track"></div></div>' +
    '<div class="cz-arr r" role="button" aria-label="next">▶</div><div class="cz-dots"></div>';
  host.appendChild(el);
  const stage = el.querySelector('.cz-stage'), track = el.querySelector('.cz-track'), dotsEl = el.querySelector('.cz-dots');
  let cards = [], idx = 0;
  const SC = opts.scales || [1, 0.8, 0.64], REACH = opts.reach || 2;
  const DRAG = { id: null, x0: 0, y0: 0, dx: 0, moved: false };

  function place (instant) {
    if (instant) track.classList.add('drag');
    cards.forEach((c, i) => {
      const o = i - idx, a = Math.abs(o);
      c.style.setProperty('--o', o);
      c.style.setProperty('--s', SC[Math.min(a, SC.length - 1)]);
      c.classList.toggle('on', o === 0);
      c.classList.toggle('side', a === 1);
      c.classList.toggle('far', a >= 2);
      c.classList.toggle('gone', a > REACH);
      c.setAttribute('aria-hidden', o === 0 ? 'false' : 'true');
      if (o === 0) c.removeAttribute('data-pad-skip'); else c.setAttribute('data-pad-skip', '');
      c.querySelectorAll('button, input, select, textarea, a[href]').forEach(b => {
        if (o === 0) b.removeAttribute('tabindex'); else b.setAttribute('tabindex', '-1');
        if (b.hasAttribute('data-main')) { if (o === 0) b.setAttribute('autofocus', ''); else b.removeAttribute('autofocus'); }
      });
    });
    el.querySelector('.cz-arr.l').classList.toggle('off', !opts.wrap && idx <= 0);
    el.querySelector('.cz-arr.r').classList.toggle('off', !opts.wrap && idx >= cards.length - 1);
    [...dotsEl.children].forEach((d, i) => d.classList.toggle('on', i === idx));
    if (instant) { void track.offsetWidth; track.classList.remove('drag'); }
  }
  function dots () {
    dotsEl.innerHTML = cards.map((c, i) => '<i data-i="' + i + '" title="' + (c.dataset.title || '').replace(/"/g, '&quot;') + '"></i>').join('');
  }
  function set (list, i = 0) {
    cards = list.slice();
    track.innerHTML = '';
    for (const c of cards) { c.classList.add('cz-card'); track.appendChild(c); }
    idx = Math.max(0, Math.min(cards.length - 1, i | 0));
    dots();
    place(true);
  }
  function go (i, quiet) {
    const n = cards.length;
    if (!n) return;
    i = opts.wrap ? (i % n + n) % n : Math.max(0, Math.min(n - 1, i));
    if (i === idx) return;
    idx = i;
    place();
    if (!quiet && opts.onChange) try { opts.onChange(idx, cards[idx]); } catch (e) { console.error('[carousel]', e); }
  }
  const flip = d => { const was = idx; go(idx + d); return idx !== was; };

  el.querySelector('.cz-arr.l').addEventListener('click', () => flip(-1));
  el.querySelector('.cz-arr.r').addEventListener('click', () => flip(1));
  dotsEl.addEventListener('click', e => { const i = e.target && e.target.dataset && e.target.dataset.i; if (i != null) go(+i); });
  // клик по соседней карточке — только листать к ней (её кнопки не жмутся)
  track.addEventListener('click', e => {
    const c = e.target.closest && e.target.closest('.cz-card');
    if (!c) return;
    const i = cards.indexOf(c);
    if (DRAG.moved || (i >= 0 && i !== idx)) { e.preventDefault(); e.stopPropagation(); if (!DRAG.moved && i >= 0) go(i); }
  }, true);

  /* свайп: тянешь — карточки едут за пальцем, отпустил дальше 50 px — следующая */
  stage.addEventListener('pointerdown', e => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    DRAG.id = e.pointerId; DRAG.x0 = e.clientX; DRAG.y0 = e.clientY; DRAG.dx = 0; DRAG.moved = false;
  });
  stage.addEventListener('pointermove', e => {
    if (e.pointerId !== DRAG.id) return;
    DRAG.dx = e.clientX - DRAG.x0;
    if (!DRAG.moved && Math.abs(DRAG.dx) > 10 && Math.abs(DRAG.dx) > Math.abs(e.clientY - DRAG.y0)) {
      DRAG.moved = true;
      try { stage.setPointerCapture(e.pointerId); } catch (_) { /* — */ }
      track.classList.add('drag');
    }
    if (DRAG.moved) track.style.setProperty('--drag', DRAG.dx + 'px');
  });
  const end = e => {
    if (e.pointerId !== DRAG.id) return;
    DRAG.id = null;
    track.classList.remove('drag');
    track.style.setProperty('--drag', '0px');
    if (DRAG.moved && Math.abs(DRAG.dx) > 50) flip(DRAG.dx < 0 ? 1 : -1);
    setTimeout(() => { DRAG.moved = false; }, 0);    // клик после перетаскивания — не нажатие
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  // колесо мыши и тачпад вбок — листать
  let wheelT = 0;
  stage.addEventListener('wheel', e => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
    if (!d || performance.now() - wheelT < 250) return;
    wheelT = performance.now();
    flip(d > 0 ? 1 : -1);
  }, { passive: true });

  return {
    el, set, go, flip,
    idx: () => idx,
    count: () => cards.length,
    card: () => cards[idx] || null,
    find: key => cards.findIndex(c => c.dataset.key === key),
    cards: () => cards.slice(),
  };
}
