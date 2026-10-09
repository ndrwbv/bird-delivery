/* Мини-игра у клиента: домофон (IDEAS блок 13, 09.10.2026). Правила словами — docs/ORDERS.md «Домофон».
   Когда она выпадает и что даёт деньгами — doorstep.js (числа — ECON.DOOR); здесь — только сам экран.

   Формат мини-игры песочницы (src/uilab/minigames.js): export default { id, name, note, knobs, mount }.
   mount(root, o, api) → убрать за собой.
     o: { mode: 'dial' | 'typo' | 'broken', flat: 47, time: 5 (с на всё), knocks: 12 (стук), fast: 0.55, fastPad: 0.8 (доля времени «быстро»: клавиатура и палец / геймпад), print: 74 (опечатка в
          накладной; без неё — переставленные цифры), addr, who (имя клиента) }
     api: t, tn, ADULT, log(текст), done(итог) — кончилась (итог: { ok, timeout, fast, tries, t, mode });
          в игре ещё: setStep(fn(dt)) — время идёт кадрами игры (пауза его стоит; без него — свой rAF),
          setPad(fn(p)) — кнопки геймпада (gamepad.js: menuUp/Down/Left/Right, menuOk, menuBack, btnX, btnY),
          paused() — игра на паузе (клавиши не жмутся), sfx(имя) — звук (key, ring, open, wrong, knock, fail).
   Как играют: набрать номер квартиры из накладной и нажать «вызов». Геймпад — крестовина / стик + A, B — стереть,
   Y — вызов; клавиатура — цифры, Backspace, Enter; палец — тап по кнопкам. Ошибся — жилец смешно отвечает,
   стираешь и набираешь заново. Сломан — стучать: A / пробел / Enter / тап быстро, KNOCKS раз. */
import './intercom.css';
import { inputKind, onInput } from '../../input/glyphs.js';

const N_ = s => s;
/* кто отвечает из чужой квартиры: { who, say }; adult — только во взрослой */
const WRONG = [
  { who: N_('бабка'), say: N_('Какая ещё пицца?! Сейчас милицию вызову, хулиган!') },
  { who: N_('ребёнок'), say: N_('Ма-а-ам, тут пицца! …Мама сказала чужим не открывать.') },
  { who: N_('собака'), say: N_('ГАВ! ГАВ-ГАВ-ГАВ! Р-р-р-р…') },
  { who: N_('дед'), say: N_('Алё? Алё?! Говорите громче, я на одно ухо!') },
  { who: N_('студент'), say: N_('Это не нам. Но если лишняя — заносите!') },
  { who: N_('соседка'), say: N_('Опять не туда! Петровы этажом выше, сколько можно!') },
  { who: N_('мужик'), say: N_('Ты на часы смотрел, мудила? Я с ночной!'), adult: true },
];
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'call'];
const DT_MAX = 0.1;

function swapDigits (s) {
  const a = s.split('');
  for (let i = a.length - 1; i > 0; i--) if (a[i] !== a[i - 1]) { [a[i], a[i - 1]] = [a[i - 1], a[i]]; return a.join(''); }
  return String((+s % 9) + 1) + s.slice(1);
}

export default {
  id: 'intercom', name: 'домофон',
  note: 'Набрать квартиру из накладной и нажать «вызов» (3—6 с). Опечатка: верный номер — в пометке клиента. Сломан — стучать быстро. Геймпад: крестовина + A, B стереть, Y вызов; клавиатура: цифры, Backspace, Enter.',
  knobs: [
    { k: 'mode', label: 'вид', type: 'sel', def: 'dial', opts: [['dial', 'набрать номер'], ['typo', 'опечатка в накладной'], ['broken', 'сломан — стучать']] },
    { k: 'flat', label: 'квартира', type: 'num', def: 47, min: 1, max: 999, step: 1 },
    { k: 'time', label: 'секунд на всё', type: 'num', def: 5, min: 2, max: 30, step: 0.5 },
    { k: 'knocks', label: 'стуков (сломан)', type: 'num', def: 12, min: 3, max: 30, step: 1 },
  ],
  mount (root, o, api) {
    const t = api.t, mode = ['typo', 'broken'].includes(o.mode) ? o.mode : 'dial';
    const flat = String(Math.max(1, Math.round(+o.flat || 47)));
    const print = mode === 'typo' ? String(o.print || swapDigits(flat)) : flat;
    const limit = Math.max(1, +o.time || 5), need = Math.max(1, Math.round(+o.knocks || 12));
    const st = { pad: false, t: 0, typed: '', tries: 0, knocks: 0, cur: 4, phase: 'play', endT: 0, res: null, sayT: 0, lastWrong: -1 };
    const sfx = n => { try { if (api.sfx) api.sfx(n); } catch (e) { /* — */ } };
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => '&#' + c.charCodeAt(0) + ';');

    const box = document.createElement('div');
    box.className = 'dg dg-' + mode;
    box.innerHTML =
      '<section class="pp-sheet dg-sheet pp-in">' +
        '<header class="pp-head"><span>' + esc(t('домофон')) + '</span><b class="dg-left"></b></header>' +
        '<div class="dg-fuse" aria-hidden="true"><i></i></div>' +
        '<div class="dg-body">' +
          '<div class="dg-slip pp-tilt-l">' +
            '<span class="pp-label">' + esc(t('накладная')) + (o.addr ? ' · ' + esc(o.addr) : '') + '</span>' +
            '<b class="dg-flat">' + esc(t('кв. {n}', { n: print })) + '</b>' +
            (mode === 'typo' ? '<p class="dg-note">' + esc(t('кв. {n}, не {m}!', { n: flat, m: print })) + '</p>' : '') +
            '<span class="pp-hint dg-task"></span>' +
          '</div>' +
          '<div class="dg-unit">' +
            '<div class="dg-scr"><b class="dg-typed"></b><span class="dg-say" hidden></span></div>' +
            (mode === 'broken'
              ? '<div class="dg-sign">' + esc(t('не работает')) + '</div>' +
                '<button type="button" tabindex="-1" class="dg-door"><b>' + esc(t('тук!')) + '</b><span class="dg-dots"></span></button>'
              : '<div class="dg-keys">' + KEYS.map((k, i) => '<button type="button" tabindex="-1" data-i="' + i + '" class="dg-k dg-k-' + (/\d/.test(k) ? 'd' : k) + '">' +
                  (k === 'del' ? '⌫' : k === 'call' ? '🔔' : k) + '<kbd class="dg-g" data-g="' + k + '"></kbd></button>').join('') + '</div>') +
          '</div>' +
        '</div>' +
        '<p class="dg-help"></p>' +
      '</section>';
    const q = s => box.querySelector(s);
    const elFuse = q('.dg-fuse i'), elLeft = q('.dg-left'), elTyped = q('.dg-typed'), elSay = q('.dg-say'), elHelp = q('.dg-help'), elSheet = q('.dg-sheet');
    const keyEls = [...box.querySelectorAll('.dg-k')];
    q('.dg-task').textContent = mode === 'broken' ? t('домофон сломан — стучи, пока не откроют') : t('набери квартиру и жми «вызов»');
    const dots = q('.dg-dots');
    if (dots) dots.innerHTML = '<i></i>'.repeat(need);

    /* значки кнопок по вводу: геймпад — B стереть, Y вызов (A — нажать); клавиатура — Backspace / Enter; палец — без значков */
    const glyphs = () => {
      const k = inputKind().kind, ps = inputKind().family === 'ps';
      box.dataset.input = k;
      for (const g of box.querySelectorAll('.dg-g')) g.textContent = k === 'pad' ? (g.dataset.g === 'del' ? (ps ? '○' : 'B') : g.dataset.g === 'call' ? (ps ? '△' : 'Y') : '') :
        k === 'kb' ? (g.dataset.g === 'del' ? 'Bksp' : g.dataset.g === 'call' ? 'Enter' : '') : '';
      const A = ps ? '✕' : 'A';
      elHelp.innerHTML = mode === 'broken'
        ? (k === 'pad' ? '<kbd class="pp-key">' + A + '</kbd>' + esc(t('жми быстро')) : k === 'kb' ? '<kbd class="pp-key pp-key-kb">Space</kbd>' + esc(t('жми быстро')) : esc(t('тапай по двери быстро')))
        : k === 'pad' ? esc(t('крестовина — выбор')) + ' · <kbd class="pp-key">' + A + '</kbd>' + esc(t('нажать')) + ' · <kbd class="pp-key">' + (ps ? '○' : 'B') + '</kbd>' + esc(t('стереть')) + ' · <kbd class="pp-key dg-ky">' + (ps ? '△' : 'Y') + '</kbd>' + esc(t('вызов'))
        : k === 'kb' ? esc(t('цифры — набрать')) + ' · <kbd class="pp-key pp-key-kb">Bksp</kbd>' + esc(t('стереть')) + ' · <kbd class="pp-key pp-key-kb">Enter</kbd>' + esc(t('вызов'))
        : '';
      cursor();
    };
    const cursor = () => keyEls.forEach((b, i) => b.classList.toggle('pp-focus', inputKind().kind === 'pad' && st.phase === 'play' && i === st.cur));
    const screen = () => { elTyped.textContent = st.typed || '—'; };
    const pop = el => { if (!el) return; el.classList.remove('dg-pop'); void el.offsetWidth; el.classList.add('dg-pop'); };
    const say = (who, text, cls) => {
      elSay.hidden = false;
      elSay.className = 'dg-say ' + (cls || '');
      elSay.innerHTML = (who ? '<em>' + esc(who) + '</em>' : '') + esc(text);
      st.sayT = 2.2;
      pop(elSay);
    };

    function finish (ok, timeout) {
      if (st.phase !== 'play') return;
      st.phase = 'end';
      // «быстро»: геймпадом (крестовина — 6—8 нажатий на двузначный номер) порог мягче — fastPad (80 %), клавиатурой и пальцем — fast (55 %)
      const fast = ok && !timeout && st.tries === 0 && st.t <= limit * (st.pad ? (+o.fastPad || 0.8) : (+o.fast || 0.55));
      st.res = { ok, timeout: !!timeout, fast, tries: st.tries, t: +st.t.toFixed(2), mode };
      st.endT = 1.1;
      box.classList.add(ok ? 'dg-ok' : 'dg-late');
      const seal = document.createElement('div');
      seal.className = 'pp-seal ' + (ok ? 'pp-seal-green' : 'pp-seal-rust') + ' dg-seal';
      seal.textContent = ok ? (fast ? t('с первого раза!') : t('открыто')) : t('сам спустится');
      elSheet.appendChild(seal);
      elTyped.hidden = true;
      if (ok) say('', mode === 'broken' ? t('Иду, иду! Дверь не ломай!') : t('Открываю, поднимайтесь!'), 'dg-good');
      else say(t('клиент'), t('Да стой ты там, сам спущусь…'), 'dg-bad');
      st.sayT = 9;
      sfx(ok ? 'open' : 'fail');
      cursor();
      api.log && api.log((ok ? 'открыли' : 'не успел') + ' за ' + st.res.t + ' с, ошибок ' + st.tries + (fast ? ', быстро' : ''));
    }

    function press (k) {
      if (st.phase !== 'play') return;
      if (k === 'del') { st.typed = st.typed.slice(0, -1); sfx('key'); }
      else if (k === 'call') {
        if (!st.typed) { pop(elTyped); return; }
        if (st.typed === flat) { finish(true, false); return; }
        st.tries++;
        let i = 0;
        const pool = WRONG.map((w, j) => j).filter(j => (!WRONG[j].adult || api.ADULT) && j !== st.lastWrong);
        i = pool[(Math.random() * pool.length) | 0];
        st.lastWrong = i;
        say(t('кв. {n}', { n: st.typed }) + ' · ' + t(WRONG[i].who) + ': ', t(WRONG[i].say), 'dg-bad');
        st.typed = '';
        box.classList.remove('dg-shake'); void box.offsetWidth; box.classList.add('dg-shake');
        sfx('wrong');
      } else if (/^\d$/.test(k)) {
        if (st.typed.length >= 4) return;
        st.typed += k;
        sfx('key');
      }
      screen();
      const el = keyEls[KEYS.indexOf(k)];
      pop(el);
    }
    function knock () {
      if (st.phase !== 'play') return;
      st.knocks++;
      sfx('knock');
      const d = q('.dg-door');
      pop(d);
      const ds = dots ? dots.children : [];
      if (ds[st.knocks - 1]) ds[st.knocks - 1].className = 'on';
      if (st.knocks >= need) finish(true, false);
    }

    function step (dt) {
      dt = Math.min(DT_MAX, Math.max(0, dt));
      if (st.phase === 'play') {
        st.t += dt;
        const left = Math.max(0, limit - st.t);
        elFuse.style.transform = 'scaleX(' + (left / limit).toFixed(3) + ')';
        elFuse.parentNode.classList.toggle('dg-hot', left < limit * 0.3);
        elLeft.textContent = t('{n} с', { n: left.toFixed(1).replace('.', ',') });
        if (st.sayT > 0) { st.sayT -= dt; if (st.sayT <= 0) elSay.hidden = true; }
        if (left <= 0) finish(false, true);
      } else if (st.phase === 'end') {
        st.endT -= dt;
        if (st.endT <= 0) { st.phase = 'done'; api.done && api.done(st.res); }
      }
    }

    function pad (p) {
      if (st.phase !== 'play') return;
      if (p.menuOk || p.accept || p.menuBack || p.btnX || p.btnY || p.menuUp || p.menuDown || p.menuLeft || p.menuRight) st.pad = true;
      if (mode === 'broken') { if (p.menuOk || p.accept || p.btnX || p.btnY) knock(); return; }
      const c = st.cur % 3, r = (st.cur / 3) | 0;
      if (p.menuLeft && c > 0) st.cur--;
      if (p.menuRight && c < 2) st.cur++;
      if (p.menuUp && r > 0) st.cur -= 3;
      if (p.menuDown && r < 3) st.cur += 3;
      if (p.menuLeft || p.menuRight || p.menuUp || p.menuDown) cursor();
      if (p.menuOk) press(KEYS[st.cur]);
      else if (p.menuBack || p.btnX) press('del');
      else if (p.btnY) press('call');
    }

    /* клавиатура — раньше игры (capture): цифры, Backspace, Enter, пробел (стук); Esc — пауза игры, не наша */
    const onKey = e => {
      if (st.phase !== 'play' || (api.paused && api.paused())) return;
      const c = e.code;
      let k = null;
      if (/^(Digit|Numpad)\d$/.test(c)) k = c.slice(-1);
      else if (c === 'Backspace' || c === 'Delete' || c === 'NumpadDecimal') k = 'del';
      else if (c === 'Enter' || c === 'NumpadEnter') k = 'call';
      else if (c === 'Space') k = 'knock';
      else if (c === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); return; }   // карта — не во время домофона
      if (!k) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat && k !== 'del') return;
      if (mode === 'broken') { if (k === 'knock' || k === 'call') knock(); return; }
      if (k !== 'knock') press(k);
    };
    addEventListener('keydown', onKey, true);
    /* палец и мышь — сразу по нажатию (pointerdown), не по click: быстрее и без двойных */
    box.addEventListener('pointerdown', e => {
      const b = e.target.closest('button');
      if (!b || (api.paused && api.paused())) return;
      e.preventDefault();
      if (b.classList.contains('dg-door')) knock();
      else if (b.dataset.i !== undefined) { st.cur = +b.dataset.i; press(KEYS[st.cur]); cursor(); }
    });

    root.appendChild(box);
    screen();
    glyphs();
    const offInput = onInput(glyphs);
    let raf = 0, last = 0;
    if (api.setStep) api.setStep(step);
    else {
      const loop = now => { raf = requestAnimationFrame(loop); step(last ? (now - last) / 1000 : 0); last = now; };
      raf = requestAnimationFrame(loop);
    }
    if (api.setPad) api.setPad(pad);
    // для проверок (probe): решить как игрок — верный номер и «вызов» / нужное число стуков
    box.__solve = (wrong) => {
      if (mode === 'broken') { while (st.phase === 'play') knock(); return; }
      if (wrong) { for (const ch of print === flat ? '1' + flat : print) press(ch); press('call'); }
      press('del'); press('del'); press('del'); press('del');
      for (const ch of flat) press(ch);
      press('call');
    };
    return () => {
      removeEventListener('keydown', onKey, true);
      offInput();
      if (raf) cancelAnimationFrame(raf);
      if (api.setStep) api.setStep(null);
      if (api.setPad) api.setPad(null);
      box.remove();
    };
  },
};
