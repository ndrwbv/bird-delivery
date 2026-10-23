/* Мини-игра у клиента: домофон (IDEAS блок 13, 09.10.2026; трек 10 п. 5, 10.10.2026). Правила словами — docs/ORDERS.md «Домофон».
   Когда она выпадает и что даёт деньгами — doorstep.js (числа — ECON.DOOR); здесь — только сам экран.

   Автор 10.10.2026: время — общее с доставкой (своего таймера нет: в шапке часы заказа, как на приборке, и фитиль
   срока); реплики — не на экранчике домофона, а сообщениями, как у Толика, с лицом того, кто говорит; слева —
   та же накладная, что в начале заказа (ordersheet.js), и на ней по ходу игры пометки: пятно на цифре, зачёркнутый
   номер и исправление клиента, неверные номера ручкой, «+N ₽» за «с первого раза».

   Формат мини-игры песочницы (src/uilab/minigames.js): export default { id, name, note, knobs, mount }.
   mount(root, o, api) → убрать за собой.
     o: { mode: 'dial' | 'typo' | 'smudge' | 'broken' | 'away' (клиент не дома: набрал верно — зовёт на o.away.addr,
          реплика o.away.say или случайная из AWAY; итог { ok: true, away: true, addr }), flat: '47' (верный номер), print: '74' (что в накладной при опечатке),
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
   стираешь и набираешь заново. Сломан — стучать: A / пробел / Enter / тап быстро, KNOCKS раз.
   Отказ — «пусть сам спустится» (doorkit.js selfHTML: Q / RB / тап по пометке под заданием): клиент спускается сам, ждёшь
   o.selfWait с (срок заказа идёт), итог { ok: false, self: true }; у «не дома» — сразу его ответ, куда ехать (self: true). */
import './intercom.css';
import { inputKind, onInput } from '../../input/glyphs.js';
import * as OS from '../ordersheet.js';
import * as KIT from './doorkit.js';
import { DOOR } from '../econ.js';
import * as SC from './doorscene.js';
import * as COACH from './doorcoach.js';     // обучение первого раза: пауза, подсветка кнопок, «поехали!»
import { faceDataURL } from '../people.js';
import * as NICK from '../nicks.js';            // накладная: аватарка и ник клиента из приложения (nicks.js)

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
/* «клиент не дома» (11.10.2026): набрал верно — отвечает сам клиент, он не дома и зовёт на другой адрес ({addr}).
   adult — только во взрослой. Без глаголов в роде — подходит и ему, и ей */
export const AWAY = [
  { say: N_('Ой, я не дома! Я у тёщи, {addr}. Подъезжай туда!') },
  { say: N_('А я не дома… Я у кума в гараже, {addr}. Вези сюда!') },
  { say: N_('Ой, а я с собакой гуляю! {addr}. Догоняй!') },
  { say: N_('Я в бане! {addr}. Выйду в полотенце — не пугайся.') },
  { say: N_('Я у мамы, {addr}! Она тоже пиццу хочет. Давай туда.') },
  { say: N_('Я в очереди в поликлинику, {addr}. Вези, тут все голодные.') },
  { say: N_('Я в гостях, {addr}. Не спрашивай. Просто вези.') },
  { say: N_('Ой, я же в бильярдной, {addr}! Подъезжай, сыграем.') },
  { say: N_('Я на работе, {addr}! Начальник не отпускает — вези сюда.') },
  { say: N_('Бля, я не дома. Я у любовницы, {addr}. Жене — ни слова!'), adult: true },
  { say: N_('Я в отделении, {addr}. Отпустят через час, а жрать охота — вези, сука, сюда.'), adult: true },
  { say: N_('Ёпт, я в гараже у кума, {addr}. Бухаем. Вези, родной!'), adult: true },
  { say: N_('Я у бывшей, {addr}. Долгая, блядь, история. Вези быстрее.'), adult: true },
  { say: N_('Слышь, я на хате у кента, {addr}. Звони два раза и не ссы — тут свои.'), adult: true },
  { say: N_('Нахуй дом, я на рыбалке, {addr}! Подъезжай, удочку подержишь.'), adult: true },
];
export function awayLine (adult) {
  const pool = AWAY.filter(a => !a.adult || adult);
  return pool[(Math.random() * pool.length) | 0].say;
}
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'call'];
const DT_MAX = 0.1;

export function swapDigits (s) {
  const a = String(s).split('');
  for (let i = a.length - 1; i > 0; i--) if (a[i] !== a[i - 1]) { [a[i], a[i - 1]] = [a[i - 1], a[i]]; return a.join(''); }
  return String((+s % 9) + 1) + String(s).slice(1);
}

export default {
  id: 'intercom', name: 'домофон',
  note: 'Набрать квартиру из накладной и нажать «вызов». Своего таймера нет — идёт срок заказа (часы в шапке). Пятно: цифру вспомнить (после 2 ошибок оттирается). Опечатка: клиент пишет верный номер, в накладной — зачёркнуто и исправлено. Сломан — стучать быстро. Клиент не дома: набрал верно — клиент зовёт на другой адрес, в накладной адрес зачёркнут, рядом новый. Геймпад: крестовина + A, B стереть, Y вызов; клавиатура: цифры, Backspace, Enter.',
  knobs: [
    { k: 'mode', label: 'вид', type: 'sel', def: 'dial', opts: [['dial', 'набрать номер'], ['smudge', 'пятно на цифре'], ['typo', 'опечатка в накладной'], ['broken', 'сломан — стучать'], ['away', 'клиент не дома']] },
    { k: 'awayAddr', label: 'куда зовёт (не дома)', type: 'text', def: 'улица Курчатова, 9' },
    { k: 'flat', label: 'квартира (в накладной)', type: 'num', def: 47, min: 1, max: 999, step: 1 },
    { k: 'clockS', label: 'срок заказа, с', type: 'num', def: 40, min: 3, max: 120, step: 1 },
    { k: 'time', label: 'эталон «быстро», с', type: 'num', def: 5, min: 2, max: 30, step: 0.5 },
    { k: 'knocks', label: 'стуков (сломан)', type: 'num', def: 12, min: 3, max: 30, step: 1 },
    { k: 'look', label: 'подъезд', type: 'sel', def: 'shabby', opts: [['shabby', 'обшарпанный'], ['clean', 'чистый с цветами'], ['auto', 'по адресу']] },
    { k: 'entr', label: 'номер подъезда', type: 'num', def: 2, min: 1, max: 6, step: 1 },
    { k: 'learnOn', label: 'первый раз (подсказка Толика)', type: 'bool', def: false },
  ],
  mount (root, o, api) {
    const t = api.t;
    let mode = ['typo', 'broken', 'smudge', 'away'].includes(o.mode) ? o.mode : 'dial';
    // не дома: куда зовёт клиент (в игре — doorstep.js нашёл точку рядом; в песочнице — ручка) и его реплика
    const awayAddr = mode === 'away' ? String((o.away && o.away.addr) || o.awayAddr || t('улица Курчатова, 9')) : '';
    const awaySay = mode === 'away' ? ((o.away && o.away.say) || awayLine(api.ADULT)) : '';
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
    const short = person ? (person.app ? NICK.label(person) : person.first || person.name || '') : '';
    let faceUrl = '';
    try { faceUrl = person ? NICK.avatar(person, 48) : ''; } catch (e) { /* — */ }   // плашка накладной — аватарка из приложения

    const box = document.createElement('div');
    box.className = 'mk-full dg dg-' + mode + ' dg-' + look;
    box.innerHTML =
      '<canvas class="mk-cv"></canvas>' +
      '<div class="mk-top">' + KIT.dashHTML() + '<div class="mk-fuse" aria-hidden="true"><i></i></div>' +
        '<div class="mk-task"><b class="mk-goal">' + esc(mode === 'broken' ? t('домофон сломан — стучи, пока не откроют') : t('набери квартиру из накладной и жми «вызов»')) + '</b>' +
        '<span class="mk-sub">' + (o.addr ? '<em>' + esc(o.addr) + '</em>' : '') + '</span></div>' +
        KIT.selfHTML(t) +
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
    const elMini = q('.mk-mini'), mini = KIT.miniBind(elMini), elInv = mini.body;
    const keyEls = [...box.querySelectorAll('.dg-k')];
    const elSelf = q('.mk-self'), elGoal = q('.mk-goal');
    const msgs = KIT.feed(q('.dg-feed'), { max: 3 });
    const cv = KIT.sceneCanvas(box), g = cv.getContext('2d');   // холст сцены — один на все заходы (doorkit.js, 0п48)
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
      KIT.miniSide(elMini, W, H, D, pnl);              // накладная — справа от двери, рядом с панелью
      placeSelf(L.plate, W);
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
    /* пометка «пусть сам спустится» лежит под заданием справа и на Деке закрывала табличку подъезда с квартирами
       (UI-REVIEW Р15, 17.10.2026): легла на табличку — сдвинуть вправо от неё, не влезает — влево, иначе — ниже таблички */
    function placeSelf (pl, W) {
      if (!elSelf || elSelf.hidden || !pl) return;
      const k = [Math.round(W), Math.round(pl.x), Math.round(pl.y), elSelf.textContent.length, elSelf.className].join(',');
      if (elSelf.__pk === k) return;
      elSelf.__pk = k;
      elSelf.style.left = ''; elSelf.style.top = '';
      const b = box.getBoundingClientRect(), r = elSelf.getBoundingClientRect();
      const x0 = r.left - b.left, y0 = r.top - b.top, x1 = x0 + r.width, y1 = y0 + r.height, gap = 12, pad = 14;
      if (x1 <= pl.x - 4 || x0 >= pl.x + pl.w + 4 || y1 <= pl.y - 4 || y0 >= pl.y + pl.h + 4) return;   // не на табличке
      let dx = 0, dy = 0;
      if (pl.x + pl.w + gap + r.width <= W - pad) dx = pl.x + pl.w + gap - x0;
      else if (pl.x - gap - r.width >= pad) dx = pl.x - gap - r.width - x0;
      else dy = pl.y + pl.h + 6 - y0;
      elSelf.style.position = 'relative';
      elSelf.style.left = Math.round(dx) + 'px'; elSelf.style.top = Math.round(dy) + 'px';
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
      KIT.selfGlyph(elSelf, k, inputKind().family);
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
      elSelf.hidden = true;
      // «быстро»: геймпадом (крестовина — 6—8 нажатий на двузначный номер) порог мягче — fastPad (80 %), клавиатурой и пальцем — fast (55 %)
      const fast = ok && !timeout && st.tries === 0 && st.t <= limit * (st.pad ? (+o.fastPad || 0.8) : (+o.fast || 0.55));
      // idle — простоял, ничего не нажав, пока не кончился срок: по своей воле не стал играть (likes.js — вес домофона ниже)
      st.res = { ok, timeout: !!timeout, fast, tries: st.tries, t: +st.t.toFixed(2), mode, idle: !ok && !!timeout && !st.tries && !st.typed && !st.knocks };
      st.endT = 1.3;
      if (mode === 'away') { away(); return; }
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

    /* не дома: отвечает сам клиент (с лицом) — он в другом месте; адрес в накладной зачёркнут, рядом от руки новый.
       И на «срок вышел» — тоже (дома-то его нет): ехать всё равно туда */
    function away () {
      st.res.ok = true; st.res.fast = false; st.res.away = true; st.res.addr = awayAddr;
      st.endT = 3.6;                                   // успеть прочитать, куда ехать
      box.classList.add('dg-ok', 'dg-away');
      const seal = document.createElement('div');
      seal.className = 'pp-seal pp-seal-rust mk-seal';
      seal.textContent = t('не дома');
      elSheet.appendChild(seal);
      msgs.say({ person, name: client(), text: t(awaySay, { addr: awayAddr }), mood: 'surprised' });
      setTimeout(() => { if (st.phase === 'end') msgs.say({ out: true, text: t('Понял, еду…') }); }, 1700);
      OS.move(elInv, 0, awayAddr);
      mini.peek(3.2);
      sfx('wrong');
      cursor();
      api.log && api.log('клиент не дома → ' + awayAddr);
    }

    /* «пусть сам спустится» (econ.js DOORGAME.SELF): отказ своей кнопкой — клиент спускается сам, курьер ждёт у подъезда
       o.selfWait с (срок заказа идёт), потом вручение как обычно (без бонуса «быстро»); «не дома» — он и так не дома: сразу
       его ответ, куда ехать */
    function selfDown () {
      if (st.phase !== 'play') return;
      st.res = { ok: false, timeout: false, fast: false, self: true, tries: st.tries, t: +st.t.toFixed(2), mode, idle: false };
      msgs.say({ out: true, text: t('Спуститесь сами, пожалуйста! Я у подъезда.') });
      sfx('key');
      if (mode === 'away') { st.phase = 'end'; elSelf.hidden = true; away(); return; }
      st.phase = 'self';
      st.selfT = KIT.selfWait(o); st.replyT = 0.7;
      box.classList.add('dg-self');
      elGoal.textContent = t('клиент спускается сам — жди у подъезда');
      KIT.selfOn(elSelf, t, st.selfT);
      const seal = document.createElement('div');
      seal.className = 'pp-seal pp-seal-rust mk-seal';
      seal.textContent = t('сам спустится');
      elSheet.appendChild(seal);
      cursor();
      api.log && api.log('пусть сам спустится: ждать ' + st.selfT.toFixed(1) + ' с');
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
      if (fake && (st.phase === 'play' || st.phase === 'self')) fake.step(dt);
      tick();
      // лампа над козырьком у обшарпанного подъезда иногда мигает
      flick = Math.random() < 0.03 ? Math.random() * 0.1 : Math.min(1, flick + dt * 6);
      draw();
      if (st.phase === 'learn') { if (coach) coach.layout(); return; }   // обучение первого раза: всё стоит, срок тоже
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
      } else if (st.phase === 'self') {               // «пусть сам спустится»: ждёшь у подъезда, часы заказа идут
        st.selfT -= dt;
        if (st.replyT > 0 && (st.replyT -= dt) <= 0) msgs.say({ person, name: client(), text: t('Ладно, щас спущусь. Жди.'), mood: 'angry' });
        KIT.selfOn(elSelf, t, st.selfT);
        if (st.selfT <= 0) {
          st.phase = 'end'; st.endT = 0.7;
          msgs.say({ person, name: client(), text: t('Ну, давай пиццу.'), cls: 'mk-good' });
          sfx('open');
        }
      } else if (st.phase === 'end') {
        st.endT -= dt;
        if (st.endT <= 0) { st.phase = 'done'; api.done && api.done(st.res); }
      }
    }

    function pad (p) {
      if (st.phase === 'learn') { if (coach) coach.pad(p); return; }
      if (st.phase !== 'play') return;
      if (KIT.selfPad(p)) { st.pad = true; selfDown(); return; }   // RB / R1 — «пусть сам спустится»
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
      else if (KIT.selfCode(c)) k = 'self';
      else if (c === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); return; }   // карта — не во время домофона
      if (!k) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat && k !== 'del' && !ARROW[k]) return;
      if (k === 'inv') { mini.toggle(); return; }
      if (k === 'self') { selfDown(); return; }
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
      if (b.classList.contains('mk-self')) selfDown();
      else if (b.classList.contains('dg-door')) knock();
      else if (b.dataset.i !== undefined) { st.cur = +b.dataset.i; press(KEYS[st.cur]); cursor(); }
    });

    root.appendChild(box);
    draw();
    screen();
    glyphs();
    tick();
    /* первый раз (doorstep.js learnFirst, ECON.DOORGAME.LEARN; doorcoach.js, автор 18.10.2026): домофон стоит, срок заказа
       тоже (api.hold) — по шагам подсвечено, что жать: номер в накладной, цифры, вызов (сломан — дверь); «поехали!» — игра */
    const ln = o.learn || (o.learnOn ? { name: t('Толик'), add: 15, k: 2 } : null);
    let coach = null;
    if (ln) {
      const KB = COACH.kbd, L = (s, keys, v) => KIT.keysLine(t, s, keys || {}, v || {});
      const ps = () => inputKind().family === 'ps', A = () => (ps() ? '✕' : 'A');
      const digit = c => /^(Digit|Numpad)\d$/.test(c);
      const steps = mode === 'broken' ? [
        { el: () => elDoor,
          text: k => (k === 'touch' ? L(N_('Домофон сломан — тапай по двери быстро, {n} раз, пока не откроют.'), {}, { n: need })
            : L(N_('Домофон сломан — стучи в дверь: жми {ok} быстро, {n} раз, пока не откроют.'), { ok: k === 'pad' ? KB(A()) : KB('Space', 1) }, { n: need })),
          keys: k => (k === 'pad' ? [[A()]] : [['Space', 1]]),
          hit: c => c === 'Space' || c === 'Enter' || c === 'NumpadEnter', pad: p => !!(p.menuOk || p.accept || p.btnY) },
      ] : [
        { el: () => (elMini.classList.contains('open') ? elInv.querySelector('.os-flat') || q('.mk-mini-body') : q('.mk-mini-tab')),
          text: k => (k === 'touch' ? L(N_('Номер квартиры — в накладной: тут кв. {f}. Накладная — плашка в углу, тап — раскрыть.'), {}, { f: shown })
            : L(N_('Номер квартиры — в накладной: тут кв. {f}. Свернуть или раскрыть накладную — {x}.'), { x: k === 'pad' ? KB(ps() ? '□' : 'X') : KB('X', 1) }, { f: shown })),
          keys: k => (k === 'pad' ? [[ps() ? '□' : 'X']] : [['X', 1]]),
          hit: c => c === 'KeyX', pad: p => !!p.btnX },
        { el: () => q('.dg-keys'),
          text: k => (k === 'touch' ? L(N_('Тапай цифры на домофоне — номер появится на экранчике.'))
            : k === 'pad' ? L(N_('Крестовиной — к цифре, {ok} — нажать. Номер появится на экранчике.'), { ok: KB(A()) })
              : L(N_('Набери номер цифрами на клавиатуре — он появится на экранчике домофона.'))),
          keys: k => (k === 'pad' ? [[A()]] : [['0…9', 1]]),
          hit: digit, pad: p => !!(p.menuOk || p.accept || p.menuUp || p.menuDown || p.menuLeft || p.menuRight) },
        { el: () => q('.dg-k-call'),
          text: k => (k === 'touch' ? L(N_('Набрал — 🔔, вызов. Ошибся цифрой — ⌫.'))
            : L(N_('Набрал — {call}, вызов. Ошибся цифрой — {del}.'), k === 'pad' ? { call: KB(ps() ? '△' : 'Y'), del: KB(ps() ? '○' : 'B') } : { call: KB('Enter', 1), del: KB('Bksp', 1) })),
          keys: k => (k === 'pad' ? [[ps() ? '△' : 'Y']] : [['Enter', 1]]),
          hit: c => c === 'Enter' || c === 'NumpadEnter', pad: p => !!p.btnY },
      ];
      steps.push({ go: true,
        text: (k, fam) => L(N_('Готов? Жмёшь «поехали» — и пошёл срок заказа.')) + ' ' +
          (k === 'touch' ? L(N_('Не хочешь набирать — «пусть сам спустится» под заданием, но без бонуса за скорость.'))
            : L(N_('Не хочешь набирать — {self} «пусть сам спустится», но без бонуса за скорость.'), { self: KB(KIT.selfKey(k, fam), k === 'kb') })) + KIT.learnAdd(ln, t) });
      st.phase = 'learn';
      cursor();                                                   // рамка выбора — только когда домофон пошёл
      if (api.hold) api.hold(true);
      coach = COACH.coach(box, {
        t, ln, steps, paused: () => !!(api.paused && api.paused()),
        onEnd: skipped => {
          st.phase = 'play';
          if (api.hold) api.hold(false);
          cursor();
          api.log && api.log('обучение ' + (skipped ? 'пропущено' : 'пройдено'));
        },
      });
    }
    const offInput = onInput(() => { glyphs(); });
    let raf = 0, last = 0;
    if (api.setStep) api.setStep(step);
    else {
      const loop = now => { raf = requestAnimationFrame(loop); step(last ? (now - last) / 1000 : 0); last = now; };
      raf = requestAnimationFrame(loop);
    }
    if (api.setPad) api.setPad(pad);
    // для проверок (probe): решить как игрок — верный номер и «вызов» / нужное число стуков
    box.__solve = (wrong) => {
      if (coach && coach.on()) coach.skip();                      // обучение первого раза — пропустить, как кнопкой
      if (wrong === 'self') { selfDown(); return; }               // «пусть сам спустится»
      if (mode === 'broken') { while (st.phase === 'play') knock(); return; }
      if (wrong) { for (const ch of shown === flat ? '1' + flat : shown) press(ch); press('call'); }
      press('del'); press('del'); press('del'); press('del');
      for (const ch of flat) press(ch);
      press('call');
    };
    box.__coach = () => (coach && coach.on() ? coach.state() : null);
    box.__st = () => ({ mode, awayAddr, flat, shown, blot: blotAt, wiped: st.wiped, tries: st.tries, typed: st.typed, phase: st.phase, t: +st.t.toFixed(2), limit, res: st.res,
      selfT: st.phase === 'self' ? +st.selfT.toFixed(2) : null });
    return () => {
      removeEventListener('keydown', onKey, true);
      offInput();
      if (coach) coach.off();
      msgs.clear();
      mini.off();
      if (raf) cancelAnimationFrame(raf);
      if (api.setStep) api.setStep(null);
      if (api.setPad) api.setPad(null);
      KIT.sceneCanvasOff(cv);
      box.remove();
    };
  },
};
