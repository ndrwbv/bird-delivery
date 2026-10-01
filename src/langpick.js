/* Выбор языка при самом первом запуске — до загрузки игры, поэтому без перезагрузки.
   Показывается, только если игрок язык ещё не выбирал (нет dlv-lang) и это не Яндекс:
   там язык задаёт площадка. Догадка (Steam, система) — уже выделена, хватит нажать A / Enter.
   Мышь, палец, клавиатура (стрелки, Enter) и геймпад (крестовина или стик, A). */
import { pollPad } from './input/gamepad.js';
import { makePadMenu } from './input/padmenu.js';

export function pickLang (langs, names, guess) {
  return new Promise(done => {
    const el = document.createElement('div');
    el.id = 'langpick';
    el.innerHTML = '<div class="lp-box"><div class="lp-t">🌐 Язык · Language</div><div class="lang-grid">' +
      langs.map(l => '<button type="button" lang="' + l + '" data-l="' + l + '"' + (l === guess ? ' class="cur" autofocus' : '') + '>' + names[l] + '</button>').join('') +
      '</div></div>';
    document.body.appendChild(el);
    const btns = [...el.querySelectorAll('[data-l]')];
    const menu = makePadMenu();
    let raf = 0;
    const finish = l => {
      cancelAnimationFrame(raf);
      removeEventListener('keydown', onKey);
      el.remove();
      done(l);
    };
    btns.forEach(b => b.addEventListener('click', () => finish(b.dataset.l)));
    // клавиатура: стрелки ходят по сетке, Enter — выбрать
    const onKey = e => {
      const i = Math.max(0, btns.indexOf(document.activeElement));
      const cols = Math.max(1, Math.round(el.querySelector('.lang-grid').clientWidth / btns[0].offsetWidth));
      const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.code];
      if (step) { e.preventDefault(); btns[(i + step + btns.length) % btns.length].focus(); }
    };
    addEventListener('keydown', onKey);
    (btns.find(b => b.dataset.l === guess) || btns[0]).focus();
    const tick = () => { const p = pollPad(); document.body.classList.toggle('pad', !!p.active); menu(p, el); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
  });
}
