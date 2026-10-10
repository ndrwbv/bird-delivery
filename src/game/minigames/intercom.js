/* Мини-игра у клиента: домофон (IDEAS блок 13, 09.10.2026; трек 10 п. 5, 10.10.2026). Правила словами — docs/ORDERS.md «Домофон».
   Когда она выпадает и что даёт деньгами — doorstep.js (числа — ECON.DOOR); здесь — только сам экран.

   Автор 10.10.2026: время — общее с доставкой (своего таймера нет: в шапке часы заказа, как на приборке, и фитиль
   срока); реплики — не на экранчике домофона, а сообщениями, как у Толика, с лицом того, кто говорит; слева —
   та же накладная, что в начале заказа (ordersheet.js), и на ней по ходу игры пометки: пятно на цифре, зачёркнутый
   номер и исправление клиента, неверные номера ручкой, «+N ₽» за «с первого раза».

   Формат мини-игры песочницы (src/uilab/minigames.js): export default { id, name, note, knobs, mount }.
   mount(root, o, api) → убрать за собой.
     o: { mode: 'dial' | 'typo' | 'smudge' | 'broken', flat: '47' (верный номер), print: '74' (что в накладной при опечатке),
          blot: 1 (какая цифра под пятном), time: 5 (с — эталон «быстро»), fast: 0.55, fastPad: 0.8 (доли эталона: клавиатура
          и палец / геймпад), knocks: 12 (стук), wipeAfter: 2 (после стольких ошибок пятно оттирают), sheet (HTML листа
          ordersheet.js), person (клиент — лицо), who, addr, bonus ('+120 ₽' — приписка за «с первого раза»),
          clock() → { s, k, now, label, due, lvl } (часы заказа; нет — свои, ручка «срок») }
     api: t, tn, ADULT, log(текст), done(итог) — кончилась (итог: { ok, timeout, fast, tries, t, mode });
          в игре ещё: setStep(fn(dt)) — время идёт кадрами игры (пауза его стоит; без него — свой rAF),
          setPad(fn(p)) — кнопки геймпада (gamepad.js: menuUp/Down/Left/Right, menuOk, menuBack, btnX, btnY),
          paused() — игра на паузе (клавиши не жмутся), sfx(имя) — звук (key, ring, open, wrong, knock, fail).
   Как играют: набрать номер квартиры из накладной и нажать «вызов». Геймпад — крестовина / стик + A, B — стереть,
   Y — вызов; клавиатура — цифры, Backspace, Enter; палец — тап по кнопкам. Ошибся — жилец смешно отвечает,
   стираешь и набираешь заново. Сломан — стучать: A / пробел / Enter / тап быстро, KNOCKS раз. */
import './intercom.css';
import { inputKind, onInput } from '../../input/glyphs.js';
import * as OS from '../ordersheet.js';
import * as KIT from './doorkit.js';
import { DOOR } from '../econ.js';
import * as SC from './doorscene.js';
import { faceDataURL } from '../people.js';

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

export function swapDigits (s) {
  const a = String(s).split('');
  for (let i = a.length - 1; i > 0; i--) if (a[i] !== a[i - 1]) { [a[i], a[i - 1]] = [a[i - 1], a[i]]; return a.join(''); }
  return String((+s % 9) + 1) + String(s).slice(1);
}

export default {
  id: 'intercom', name: 'домофон',
  note: 'Набрать квартиру из накладной и нажать «вызов». Своего таймера нет — идёт срок заказа (часы в шапке). Пятно: цифру вспомнить (после 2 ошибок оттирается). Опечатка: клиент пишет верный номер, в накладной — зачёркнуто и исправлено. Сломан — стучать быстро. Геймпад: крестовина + A, B стереть, Y вызов; клавиатура: цифры, Backspace, Enter.',
  knobs: [
    { k: 'mode', label: 'вид', type: 'sel', def: 'dial', opts: [['dial', 'набрать номер'], ['smudge', 'пятно на цифре'], ['typo', 'опечатка в накладной'], ['broken', 'сломан — стучать']] },
    { k: 'flat', label: 'квартира (в накладной)', type: 'num', def: 47, min: 1, max: 999, step: 1 },
    { k: 'clockS', label: 'срок заказа, с', type: 'num', def: 40, min: 3, max: 120, step: 1 },
    { k: 'time', label: 'эталон «быстро», с', type: 'num', def: 5, min: 2, max: 30, step: 0.5 },
    { k: 'knocks', label: 'стуков (сломан)', type: 'num', def: 12, min: 3, max: 30, step: 1 },
    { k: 'look', label: 'подъезд', type: 'sel', def: 'shabby', opts: [['shabby', 'обшарпанный'], ['clean', 'чистый с цветами'], ['auto', 'по адресу']] },
    { k: 'entr', label: 'номер подъезда', type: 'num', def: 2, min: 1, max: 6, step: 1 },
  ],
  mount (root, o, api) {
    const t = api.t;
    let mode = ['typo', 'broken', 'smudge'].includes(o.mode) ? o.mode : 'dial';
    // песочница: номер из ручки — он и в накладной; опечатка — верный другой
    const shown = String(o.print || o.flat || 47);
    if ((mode === 'typo' || mode === 'smudge') && shown.length < 2) mode = 'dial';
    const flat = o.print ? String(o.flat) : mode === 'typo' ? swapDigits(shown) : shown;
    const blotAt = mode === 'smudge' ? (o.blot !== undefined ? Math.min(+o.blot, shown.length - 1) : (Math.random() * shown.length) | 0) : -1;
    const limit = Math.max(1, +o.time || 5), need = Math.max(1, Math.round(+o.knocks || 12)), wipeAfter = Math.max(1, +o.wipeAfter || 2);
    const st = { pad: false, t: 0, typed: '', tries: 0, knocks: 0, cur: 4, phase: 'play', endT: 0, res: null, lastWrong: -1, wiped: false, nav: false, fixT: mode === 'typo' ? 0.7 : -1 };
    const sfx = n => { try { if (api.sfx) api.sfx(n); } catch (e) { /* — */ } };
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => '&#' + c.charCodeAt(0) + ';');
    let fake = null, clock = o.clock;
    if (typeof clock !== 'function') { fake = KIT.fakeClock(o.clockS || 40, t); clock = fake.get; }
    let person = o.person || null, sheet = o.sheet, bonus = o.bonus;
    if (!sheet) {   // песочница: заказ-образец на 1 000 ₽
      const ord = KIT.fakeOrder(api, { home: { flat: shown } });
      person = person || ord.stops[0].persons[0] || null;
      sheet = OS.html(ord, { extra: ord.extra, t });
      if (!o.range && o.entr) o = Object.assign({}, o, { range: t('кв. {a}—{b}', { a: (o.entr - 1) * 36 + 1, b: o.entr * 36 }) });
      bonus = bonus || '+' + (api.money ? api.money(Math.round(1000 * DOOR.FAST_BONUS)) : Math.round(1000 * DOOR.FAST_BONUS) + ' ₽');
    }

    // сцена: дверь подъезда снаружи (doorscene.js), обшарпанная или чистая — по дому
    const look = o.look === 'clean' || o.look === 'shabby' ? o.look : SC.lookOf(SC.hashStr(o.addr || shown), o.zone);
    const seed = +o.seed || SC.hashStr((o.addr || '') + '|' + shown);
    const short = person ? person.first || person.name || '' : '';
    let faceUrl = '';
    try { faceUrl = person ? faceDataURL(person, 48) : ''; } catch (e) { /* — */ }

    const box = document.createElement('div');
    box.className = 'mk-full dg dg-' + mode + ' dg-' + look;
    box.innerHTML =
      '<canvas class="mk-cv"></canvas>' +
      '<div class="mk-top">' + KIT.dashHTML() + '<div class="mk-fuse" aria-hidden="true"><i></i></div>' +
        '<div class="mk-task"><b class="mk-goal">' + esc(mode === 'broken' ? t('домофон сломан — стучи, пока не откроют') : t('набери квартиру из накладной и жми «вызов»')) + '</b>' +
        '<span class="mk-sub">' + (o.addr ? '<em>' + esc(o.addr) + '</em>' : '') + '</span></div>' +
      '</div>' +
      '<div class="mk-say dg-feed"></div>' +
      (mode === 'broken' ? '<button type="button" tabindex="-1" class="dg-door"><b>' + esc(t('тук!')) + '</b><span class="dg-dots"></span></button>' : '') +
      '<div class="dg-unit">' +
        '<div class="dg-grill" aria-hidden="true"><i></i><span class="dg-led"></span></div>' +
        '<div class="dg-scr"><b class="dg-typed"></b></div>' +
        (mode === 'broken'
          ? '<div class="dg-sign">' + esc(t('не работает')) + '</div>'
          : '<div class="dg-keys">' + KEYS.map((k, i) => '<button type="button" tabindex="-1" data-i="' + i + '" class="dg-k dg-k-' + (/\d/.test(k) ? 'd' : k) + '">' +
              (k === 'del' ? '⌫' : k === 'call' ? '🔔' : k) + '</button>').join('') + '</div>') +
        '<span class="dg-brand">' + esc(t('домофон')) + '</span>' +
      '</div>' +
      KIT.miniHTML(sheet, { t, short, face: faceUrl }) +
      '<p class="mk-help"></p>';
    const q = s => box.querySelector(s);
    const elFuse = q('.mk-fuse i'), elTyped = q('.dg-typed'), elHelp = q('.mk-help'), elSheet = box, elUnit = q('.dg-unit'), elDoor = q('.dg-door');
    const mini = KIT.miniBind(q('.mk-mini')), elInv = mini.body;
    const keyEls = [...box.querySelectorAll('.dg-k')];
    const msgs = KIT.feed(q('.dg-feed'), { max: 3 });
    const cv = q('.mk-cv'), g = cv.getContext('2d');
    let flick = 1;
    /* сцена: перерисовать (размер поменялся, лампа мигнула) и поставить панель домофона на дверь */
    function draw () {
      const r = box.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.max(50, r.width), H = Math.max(50, r.height);
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.imageSmoothingEnabled = false;
      const L = SC.entrance(g, W, H, { look, seed, entr: o.entr, range: o.range, t, flicker: flick });
      const pnl = L.panel, D = L.door;
      const ph = mode === 'broken' ? pnl.h * 0.42 : pnl.h;
      const key = [pnl.x, pnl.y, pnl.w, ph].map(Math.round).join(',');
      if (elUnit.__k !== key) {
        elUnit.__k = key;
        Object.assign(elUnit.style, { left: Math.round(pnl.x) + 'px', top: Math.round(pnl.y) + 'px', width: Math.round(pnl.w) + 'px', height: Math.round(ph) + 'px' });
        elUnit.style.setProperty('--pw', Math.round(pnl.w) + 'px');
        if (elDoor) {
          const narrow = W < 640;
          Object.assign(elDoor.style, narrow
            ? { left: Math.round(D.x) + 'px', top: Math.round(pnl.y + ph + 10) + 'px', width: Math.round(D.w) + 'px', height: Math.round(D.y + D.h - pnl.y - ph - 16) + 'px' }
            : { left: Math.round(D.x) + 'px', top: Math.round(D.y) + 'px', width: Math.round(pnl.x - D.x - 8) + 'px', height: Math.round(D.h) + 'px' });
        }
      }
    }
    const dots = q('.dg-dots');
    if (dots) dots.innerHTML = '<i></i>'.repeat(need);
    if (blotAt >= 0) { OS.blot(elInv, 0, blotAt); mini.peek(2.4); }
    const tick = () => KIT.dashSet(box, clock(), elFuse);

    /* подсказка по вводу — одной строкой внизу; на кнопках значков нет */
    const glyphs = () => {
      const k = inputKind().kind, ps = inputKind().family === 'ps';
      box.dataset.input = k;
      const A = ps ? '✕' : 'A', key = (s, kb) => '<kbd class="pp-key' + (kb ? ' pp-key-kb' : '') + '">' + esc(s) + '</kbd>';
      const X = k === 'pad' ? ' · ' + key(ps ? '□' : 'X') + esc(t('накладная')) : k === 'kb' ? ' · ' + key('X', 1) + esc(t('накладная')) : '';
      mini.key(k === 'pad' ? (ps ? '□' : 'X') : k === 'kb' ? 'X' : '');
      elHelp.innerHTML = (mode === 'broken'
        ? (k === 'pad' ? key(A) + esc(t('жми быстро')) : k === 'kb' ? key('Space', 1) + esc(t('жми быстро')) : esc(t('тапай по двери быстро')))
        : k === 'pad' ? esc(t('крестовина — выбор')) + ' · ' + key(A) + esc(t('нажать')) + ' · ' + key(ps ? '○' : 'B') + esc(t('стереть')) + ' · ' + key(ps ? '△' : 'Y') + esc(t('вызов'))
        : k === 'kb' ? esc(t('цифры — набрать')) + ' · ' + key('Bksp', 1) + esc(t('стереть')) + ' · ' + key('Enter', 1) + esc(t('вызов'))
        : esc(t('набери номер и жми 🔔')) + ' · ' + esc(t('накладная — в углу'))) + X;
      cursor();
    };
    // рамка выбора — у геймпада и после стрелок на клавиатуре
    const cursor = () => keyEls.forEach((b, i) => b.classList.toggle('pp-focus', (inputKind().kind === 'pad' || st.nav) && st.phase === 'play' && i === st.cur));
    const screen = () => { elTyped.textContent = st.typed || '—'; };
    const pop = el => { if (!el) return; el.classList.remove('dg-pop'); void el.offsetWidth; el.classList.add('dg-pop'); };
    const client = () => o.who || (person && person.first) || t('клиент');

    function finish (ok, timeout) {
      if (st.phase !== 'play') return;
      st.phase = 'end';
      // «быстро»: геймпадом (крестовина — 6—8 нажатий на двузначный номер) порог мягче — fastPad (80 %), клавиатурой и пальцем — fast (55 %)
      const fast = ok && !timeout && st.tries === 0 && st.t <= limit * (st.pad ? (+o.fastPad || 0.8) : (+o.fast || 0.55));
      st.res = { ok, timeout: !!timeout, fast, tries: st.tries, t: +st.t.toFixed(2), mode };
      st.endT = 1.3;
      box.classList.add(ok ? 'dg-ok' : 'dg-late');
      const seal = document.createElement('div');
      seal.className = 'pp-seal ' + (ok ? 'pp-seal-green' : 'pp-seal-rust') + ' mk-seal';
      seal.textContent = ok ? (fast ? t('с первого раза!') : t('открыто')) : t('сам спустится');
      elSheet.appendChild(seal);
      if (ok) msgs.say({ person, name: client(), text: mode === 'broken' ? t('Иду, иду! Дверь не ломай!') : t('Открываю, поднимайтесь!'), mood: 'happy', cls: 'mk-good' });
      else msgs.say({ person, name: client(), text: t('Да стой ты там, сам спущусь…'), mood: 'angry', cls: 'mk-bad' });
      if (fast && bonus) { OS.pen(elInv, 'pay', bonus + ' · ' + t('с первого раза'), 'os-plus'); mini.peek(); }
      sfx(ok ? 'open' : 'fail');
      cursor();
      api.log && api.log((ok ? 'открыли' : 'срок вышел') + ' за ' + st.res.t + ' с, ошибок ' + st.tries + (fast ? ', быстро' : ''));
    }

    function press (k) {
      if (st.phase !== 'play') return;
      if (k === 'del') { st.typed = st.typed.slice(0, -1); sfx('key'); }
      else if (k === 'call') {
        if (!st.typed) { pop(elTyped); return; }
        if (st.typed === flat) { finish(true, false); return; }
        st.tries++;
        const pool = WRONG.map((w, j) => j).filter(j => (!WRONG[j].adult || api.ADULT) && j !== st.lastWrong);
        const i = pool[(Math.random() * pool.length) | 0];
        st.lastWrong = i;
        const who = WRONG[i].who;
        msgs.say({ person: KIT.stranger(who), kind: who, name: t('кв. {n}', { n: st.typed }) + ' · ' + t(who), text: t(WRONG[i].say), mood: 'angry', cls: 'mk-bad' });
        // неверный номер — ручкой на листе, зачёркнутым (последние три)
        const pens = elInv.querySelectorAll('.os-pen.os-x');
        if (pens.length >= 3) pens[0].remove();
        OS.pen(elInv, 'flat', st.typed, 'os-x');
        mini.peek();
        // пятно: после wipeAfter ошибок курьер оттирает его рукавом — цифра видна
        if (blotAt >= 0 && !st.wiped && st.tries >= wipeAfter) {
          st.wiped = true;
          OS.wipe(elInv, 0);
          setTimeout(() => { if (st.phase === 'play') msgs.say({ out: true, text: t('Так… оттёр пятно рукавом.') }); }, 450);
        }
        st.typed = '';
        box.classList.remove('dg-shake'); void box.offsetWidth; box.classList.add('dg-shake');
        sfx('wrong');
      } else if (/^\d$/.test(k)) {
        if (st.typed.length >= 4) return;
        st.typed += k;
        sfx('key');
      }
      screen();
      const kel = keyEls[KEYS.indexOf(k)];
      if (kel) { kel.classList.add('dn'); setTimeout(() => kel.classList.remove('dn'), 130); }
    }
    function knock () {
      if (st.phase !== 'play') return;
      st.knocks++;
      sfx('knock');
      pop(elDoor);
      const ds = dots ? dots.children : [];
      if (ds[st.knocks - 1]) ds[st.knocks - 1].className = 'on';
      if (st.knocks >= need) finish(true, false);
    }

    function step (dt) {
      dt = Math.min(DT_MAX, Math.max(0, dt));
      if (fake && st.phase === 'play') fake.step(dt);
      tick();
      // лампа над козырьком у обшарпанного подъезда иногда мигает
      flick = Math.random() < 0.03 ? Math.random() * 0.1 : Math.min(1, flick + dt * 6);
      draw();
      if (st.phase === 'play') {
        st.t += dt;
        // опечатка: клиент пишет верный номер, в накладной — зачёркнуто его ручкой и исправлено
        if (st.fixT > 0) {
          st.fixT -= dt;
          if (st.fixT <= 0) {
            msgs.say({ person, name: client(), text: t('Я в {n}-й! В накладной напутали.', { n: flat }), mood: 'surprised' });
            OS.fix(elInv, 0, flat + '!');
            mini.peek(2.4);
          }
        }
        const c = clock();
        if (c && c.s <= 0) finish(false, true);   // срок заказа кончился — клиент спускается сам
      } else if (st.phase === 'end') {
        st.endT -= dt;
        if (st.endT <= 0) { st.phase = 'done'; api.done && api.done(st.res); }
      }
    }

    function pad (p) {
      if (st.phase !== 'play') return;
      if (p.menuOk || p.accept || p.menuBack || p.btnX || p.btnY || p.menuUp || p.menuDown || p.menuLeft || p.menuRight) st.pad = true;
      if (p.btnX) { mini.toggle(); return; }                     // X — накладная
      if (mode === 'broken') { if (p.menuOk || p.accept || p.btnY) knock(); return; }
      const c = st.cur % 3, r = (st.cur / 3) | 0;
      if (p.menuLeft && c > 0) st.cur--;
      if (p.menuRight && c < 2) st.cur++;
      if (p.menuUp && r > 0) st.cur -= 3;
      if (p.menuDown && r < 3) st.cur += 3;
      if (p.menuLeft || p.menuRight || p.menuUp || p.menuDown) cursor();
      if (p.menuOk) press(KEYS[st.cur]);
      else if (p.menuBack) press('del');
      else if (p.btnY) press('call');
    }

    /* клавиатура — раньше игры (capture): цифры, Backspace, Enter, пробел (стук); стрелки — как крестовина; Esc — пауза игры, не наша */
    const ARROW = { ArrowLeft: 'menuLeft', ArrowRight: 'menuRight', ArrowUp: 'menuUp', ArrowDown: 'menuDown' };
    const onKey = e => {
      if (st.phase !== 'play' || (api.paused && api.paused())) return;
      const c = e.code;
      let k = null;
      if (/^(Digit|Numpad)\d$/.test(c)) k = c.slice(-1);
      else if (c === 'Backspace' || c === 'Delete' || c === 'NumpadDecimal') k = 'del';
      else if (c === 'Enter' || c === 'NumpadEnter') k = 'call';
      else if (c === 'Space') k = 'knock';
      else if (ARROW[c]) k = c;
      else if (c === 'KeyX') k = 'inv';
      else if (c === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); return; }   // карта — не во время домофона
      if (!k) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat && k !== 'del' && !ARROW[k]) return;
      if (k === 'inv') { mini.toggle(); return; }
      if (mode === 'broken') { if (k === 'knock' || k === 'call') knock(); return; }
      if (ARROW[k]) { const was = st.pad; st.nav = true; pad({ [ARROW[k]]: true }); st.pad = was; return; }
      if (k === 'knock') { press(KEYS[st.cur]); return; }   // пробел — нажать кнопку под рамкой (после стрелок)
      press(k);
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
    draw();
    screen();
    glyphs();
    tick();
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
      if (wrong) { for (const ch of shown === flat ? '1' + flat : shown) press(ch); press('call'); }
      press('del'); press('del'); press('del'); press('del');
      for (const ch of flat) press(ch);
      press('call');
    };
    box.__st = () => ({ mode, flat, shown, blot: blotAt, wiped: st.wiped, tries: st.tries, typed: st.typed, phase: st.phase, t: +st.t.toFixed(2), res: st.res });
    return () => {
      removeEventListener('keydown', onKey, true);
      offInput();
      msgs.clear();
      mini.off();
      if (raf) cancelAnimationFrame(raf);
      if (api.setStep) api.setStep(null);
      if (api.setPad) api.setPad(null);
      box.remove();
    };
  },
};
