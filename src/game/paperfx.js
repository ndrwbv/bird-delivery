/* Движение-акцент для стиля «как накладная» (src/styles/paper.css): короткие вспышки на событии —
   счётчик денег, монетки и конфетти, шлепок штампа, хлопок печати, вдавливание кнопки.
   Длится доли секунды и затихает. В езде (узел внутри .pp-ride) и при «меньше движения»
   (prefers-reduced-motion, body.calm-fx) — тихо: счётчик сразу к числу, ни тряски, ни конфетти.

     import * as PFX from './paperfx.js';
     PFX.stagger(sheet.querySelectorAll('.pp-row'));          // строки чека допечатываются по одной
     await PFX.countUp(sumEl, 0, 5261, { fmt: money });        // деньги щёлкают вверх
     PFX.burst(sumEl, { kind: 'coins' });                      // монетки из числа (хороший итог)
     PFX.slam(stampEl);                                        // штамп шлёпнул: тряска стола и пыль
     PFX.replay(sealEl, 'pp-seal');                            // печать хлопает заново
     PFX.press(btn);                                           // вдавить кнопку (A с геймпада) */

const calm = el => (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  || document.body.classList.contains('calm-fx') || !!(el && el.closest && el.closest('.pp-ride'));

/** перезапустить CSS-анимацию класса cls на el */
export function replay (el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;            // сброс анимации
  el.classList.add(cls);
}

/** строки допечатываются по очереди: класс .pp-print с задержкой step секунд */
export function stagger (els, step = 0.08, from = 0) {
  let i = 0;
  for (const el of els) { el.style.setProperty('--pp-delay', (from + i++ * step).toFixed(2) + 's'); replay(el, 'pp-print'); }
}

/** число в el щёлкает от from до to за ms; fmt(n) → текст. Промис — когда досчитал */
export function countUp (el, from, to, { ms = 900, fmt = n => String(Math.round(n)) } = {}) {
  if (!el) return Promise.resolve();
  if (calm(el) || ms <= 0) { el.textContent = fmt(to); return Promise.resolve(); }
  return new Promise(res => {
    const t0 = performance.now();
    let last = -1, lastTick = 0;
    const step = now => {
      const k = Math.min(1, (now - t0) / ms);
      const v = from + (to - from) * (1 - Math.pow(1 - k, 3));
      const r = Math.round(v);
      if (r !== last) {
        last = r; el.textContent = fmt(r);
        if (now - lastTick > 70) { lastTick = now; replay(el, 'pp-tick'); }    // щелчок — не чаще 14 в секунду
      }
      if (k < 1 && el.isConnected) requestAnimationFrame(step); else { el.textContent = fmt(to); res(); }
    };
    requestAnimationFrame(step);
  });
}

const COLORS = ['var(--pp-yellow)', 'var(--pp-pink)', 'var(--pp-lime)', 'var(--pp-orange)', 'var(--pp-red)'];

/** монетки или конфетти из середины el (или из точки { x, y } в пикселях экрана) */
export function burst (el, { kind = 'confetti', n = kind === 'coins' ? 14 : 26, spread = 1 } = {}) {
  const src = el && el.getBoundingClientRect ? el : null;
  if (calm(src)) return;
  const r = src ? src.getBoundingClientRect() : { left: el.x, top: el.y, width: 0, height: 0 };
  const box = document.createElement('div');
  box.className = 'pp-burst';
  box.style.position = 'fixed';
  box.style.left = (r.left + r.width / 2) + 'px';
  box.style.top = (r.top + r.height / 2) + 'px';
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    const a = Math.random() * Math.PI * 2, d = (60 + Math.random() * 120) * spread;
    if (kind === 'coins') p.className = 'coin';
    else p.style.setProperty('--c', COLORS[i % COLORS.length]);
    p.style.setProperty('--dx', Math.round(Math.cos(a) * d) + 'px');
    p.style.setProperty('--dy', Math.round(Math.sin(a) * d * 0.7 + 50 * spread) + 'px');   // разлетаются и чуть падают
    p.style.setProperty('--r', Math.round((Math.random() - 0.5) * 720) + 'deg');
    p.style.setProperty('--t', (0.6 + Math.random() * 0.45).toFixed(2) + 's');
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 1200);
}

/** штамп шлёпнул: пружина, пыль, стол вздрогнул */
export function slam (el) {
  if (!el) return;
  replay(el, 'pp-slam');
  if (calm(el)) return;
  replay(el, 'pp-dust');
  const desk = el.closest('.pp-desk');
  if (desk) replay(desk, 'pp-shake');
  setTimeout(() => el.classList.remove('pp-dust'), 520);
}

/** вдавить кнопку (нажатие с геймпада, где нет :active): вниз — и отпружинила */
export function press (el, ms = 110) {
  if (!el) return;
  el.classList.add('pp-down');
  setTimeout(() => el.classList.remove('pp-down'), ms);
}
