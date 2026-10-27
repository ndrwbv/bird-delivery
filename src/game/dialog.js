/* Единый обработчик разговоров. У квартиры по умолчанию компактная панель под 3D-сценой.
   «диалоги в одном стиле и с одной озвучкой, как те, где штамп ставится»): шапка капсом (что это — поручение,
   гараж…, справа — срок заказа, как на часах хада), слева полароид того, кто говорит (говорит ртом), под ним имя
   и сумма предложения отдельной строкой (pay); справа — облачко, текст печатается по буквам с «ну», «э-э» и
   запинками и бормочет тем же звуком, что у двери (sfx 'blab'). Договорил — кнопки «принять» / «отказаться»
   (или одна «дальше» / «понятно»).
   ТАЙМЕРОВ НЕТ (автор 12.10 и 16.10.2026): окно стоит, пока игрок не нажмёт. Пропустить: клик / тап по облачку,
   пробел, Enter, A на геймпаде — первый раз допечатывает, второй — жмёт кнопку (одна кнопка — закрыть).
   Крестовина или стик ←→ (↑↓) выбирают кнопку, выбранная обведена (.padsel, как в меню); B — отказаться.
   МИР НЕ СТОИТ: часы заказа и смены идут (срок — в шапке); руль из рук — game.js держит машину на месте,
   пока isOpen() (как у мини-игр у двери).

     DLG.init({ pause: on => …, face: (person, size) => dataURL, sfx: name => …, clock: () => { label, at, lvl } | null })
                                       — один раз из game.js; sfx — звуки разговора ('blab' — бормочет по буквам,
                                       'pick' — ответил: doorstep.js talkSound); clock — срок активного заказа
     const r = await DLG.say({
       person, name, text,             // text — уже переведённый ($t)
       accept: 'беру', decline: 'не-а', // decline не задан — одна кнопка
       mood: 'calm' | 'nervous' | 'drunk' | 'shy',  // сколько мычит и запинается
       color: '#a15bff',               // полоска шапки — цвет активности
       head: t('поручение'),           // шапка листа слева (нет — «разговор»)
       pay: '+2 000 ₽', payLabel: t('заплатят'),   // сумма предложения — крупно под портретом («−» в начале — красным)
       fillers: true,                  // вставлять «ну» и «э-э» (для катсцен можно false)
       meters: [{ name, v, p, color }], // полоски под текстом (Дядя Женя: мотор и ресурс), p — 0…1
       plain: true,                    // обе кнопки одного вида (приглашение клиентки: оба ответа — отказы)
       alt: true,                      // второй ответ — на X (геймпад) / X (клавиатура), а не на B / Esc: в катсцене
                                       // B и Esc — «пропустить сцену» (story.js ['ask'], учебный Стёпа)
       stack: true,                    // два ответа столбиком (вопрос в катсцене, story.js ['ask']): курсор ▶ у выбранного,
                                       // ↑ ↓ / W S / крестовина — выбрать, Enter / пробел / A — ответить, 1 / 2 — сразу
                                       // верхний / нижний, X — нижний; подсказка одной строкой внизу, на кнопках значков нет
       emo: 'angry',                   // выражение лица на портрете (people.js EMO_FACE; катсцены story.js { emo })
       onTyped: () => …,               // допечаталась (story.js: 3D-актёр закрывает рот)
       onShow: () => …,                // окно этой реплики открылось, печать пошла (doorcast.js: 3D-человек открывает рот)
     });                               // → true (принял) / false (отказался) / null (закрыли снаружи: dismiss)
   Прежние timer / timeoutText / auto (ответ по таймеру, реплика листается сама) больше не работают — окно ждёт нажатия.
   Очередь: несколько say подряд показываются по одному.
   В катсцене (body.story-cut) окно — внизу экрана, над чёрной полосой, компактнее (dialog.css).
   Лицо говорящего — крупно (11х, 23.10.2026): большой полароид слева, будто он говорит прямо тебе; ответы — рядом, под
   облачком (.dlg-col), крупными кнопками: в ряд, а stack — столбиком с курсором ▶. Телефон боком — полароид выглядывает
   над листом, лист остаётся низкой полосой.
   Портрет говорит ртом (talkface.js), пока текст печатается; допечатался — рот закрыт. o.face (готовая
   картинка) — без рта, как было.
   На кнопках — значок, что жать: [A] / [B] на геймпаде, Enter / Esc на клавиатуре, на тач-экране без
   значков. Подсветка геймпада от простоя не гаснет (гасят мышь и клавиши, padmenu.js padLit); если её
   не было, первое ←→↑↓ только зажигает её (A без подсветки — «принять»).

   Реплика на ходу (события посреди езды — вместо плашки сверху экрана, docs/CAREER.md «Реплики на ходу»):
     DLG.line({ person, name, text, color, urgent, onShow })   // → Promise, когда ушла (true) или выброшена (false);
                                               // onShow — в момент показа (звук монетки)
   Сообщение как в iMessage (круглая аватарка, имя, серый пузырь — как чат Толика, chat.css), сверху по
   центру, без затемнения и кнопок; пузырь сразу по размеру всего текста, буквы проявляются в нём: мир НЕ стоит,
   клавиши и геймпад не перехватывает (пробел — ручник, A — нитро). Допечаталась — висит
   lineTime(текст) (2,5 с + 0,06 с на букву, не меньше 4 с — успеть прочитать на ходу) и уходит сама; клик — убрать
   сразу. Аватарка говорит ртом, пока буквы проявляются (talkface.js).
   Очередь — общая очередь уведомлений (notifyq.js): по одной, после чека оплаты, ждут не больше LIVE.Q (лишние — самые
   старые — выбрасываются) и не дольше LIVE.WAIT с; o.urgent — срочная, перебивает то, что на экране.
   isOpen() её не считает. */
import './dialog.css';
import * as TEL from './telemetry.js';          // анонимная статистика: ответ в окне с двумя кнопками (telemetry.js)
import { t } from '../i18n/index.js';
import { pad as PAD } from '../input/gamepad.js';
import { padLit } from '../input/padmenu.js';
import { keyHTML, refreshKeys, inputKind, glyph } from '../input/glyphs.js';
import * as TF from './talkface.js';            // портрет говорит ртом, пока печатается
import * as NQ from './notifyq.js';             // реплика на ходу — в общей очереди уведомлений (одно за раз)

/* значок кнопки — общий .pp-key (glyphs.js keyHTML, paper.css): геймпад — A / B (PlayStation — ✕ / ○),
   клавиатура — Enter / Esc, касание — без значка; меняется сам, когда игрок сменил ввод */

const N_ = s => s;
const FILL = /*i18n*/ [N_('ну'), N_('э-э'), N_('короче'), N_('как бы'), N_('это самое'), N_('в общем'), N_('слушай')];
/* [мычание, запинка]. Пьяный — без запинок «п-пицца» и без лишнего мычания (автор 12.10.2026: «пьяных через
   заикания не надо показывать»): говорит обычным текстом, пьяность — в словах самих реплик.
   Запинаются только нервный и смущённый (автор 18.10: «с-с-сиги» у спокойного — раздражает): спокойный — без запинок.
   Кто нервный — mood в записи реплики (orders.config.js SIDE_ORDERS): нервные — кто правда боится (кота, бывшей, тёщи) */
const MOOD = { calm: [0.08, 0], nervous: [0.22, 0.14], drunk: [0.08, 0], shy: [0.16, 0.12] };

/* сколько реплика висит сама, если катсцена идёт по таймеру (intro.js; пузыри героев):
   1,5 с + 0,06 с на букву (~15 букв в секунду), но не меньше 3 с. Печатается по буквам —
   отсчёт после того, как допечаталась. Диалог выше (say) ждёт нажатия и сам не листается. */
export const READ = { BASE: 1.5, PER_CHAR: 0.06, MIN: 3 };
export const readTime = text => Math.max(READ.MIN, READ.BASE + READ.PER_CHAR * String(text == null ? '' : text).length);
/* реплика на ходу (line): читаешь краем глаза, пока рулишь — дольше: 2,5 с + 0,06 с на букву, не меньше 4 с */
export const LINE_READ = { BASE: 2.5, PER_CHAR: 0.06, MIN: 4 };
export const lineTime = text => Math.max(LINE_READ.MIN, LINE_READ.BASE + LINE_READ.PER_CHAR * String(text == null ? '' : text).length);
/* после того как допечаталась — столько с ответы не жмутся (кто долбил Enter, допечатывая, не ответит не глядя) */
export const ARM = 0.3;
const BLAB = 0.09;                               // с: бормочет по буквам — звук раз в столько (как у двери, smalltalk.js)

let API = { pause: () => {}, face: null, sfx: null, clock: null };
const sfx = n => { try { if (API.sfx) API.sfx(n); } catch (e) { /* — */ } };
let root = null, queue = Promise.resolve(), open = 0;

export function init (api) { API = { ...API, ...api }; }
export const isOpen = () => open > 0;
/* своё окно поверх игры, которое для игры — как разговор (руль из рук, isOpen(), чат Толика не мешает):
   кольцо «отбиться» у гопников (ringfight.js). hold(true) — открыли, hold(false) — закрыли */
export function hold (on) {
  if (on) { open++; API.pause(true); document.body.classList.add('dlg-open'); return; }
  if (open <= 0) return;
  open--;
  if (!open) { API.pause(false); document.body.classList.remove('dlg-open'); if (root && !root.classList.contains('on')) root.hidden = true; }   // лист разговора под ним уже ушёл — не держать пустой слой поверх хада
}
/* закрыть текущую реплику сразу (катсцена пропущена: story.js) — say вернёт null */
let CUR = null;
export function dismiss () { if (CUR) CUR(); }

function build () {
  root = document.createElement('div');
  root.id = 'dlg';
  root.hidden = true;
  // .dlg-bar — цвет активности (шапке — полоской через --pp-accent; его же читает автопилот probe: красный — гопники)
  root.innerHTML = '<div class="dlg-box pp-sheet"><div class="dlg-bar"></div>' +
    '<header class="pp-head dlg-top"><span class="dlg-what"></span><b class="dlg-clock"></b></header><div class="dlg-row">' +
    '<figure class="dlg-head pp-tilt-l"><img class="pp-polaroid" alt=""><b class="dlg-name"></b><p class="dlg-pay" hidden><span></span><b></b></p></figure>' +
    '<div class="dlg-col"><div class="dlg-bubble"><p class="dlg-text"></p><div class="dlg-meters"></div><span class="dlg-skip"></span></div></div></div>' +
    '<div class="dlg-btns">' +
    '<button type="button" class="dlg-no">' + keyHTML('back') + '<span></span></button>' +
    '<button type="button" class="dlg-yes">' + keyHTML('ok') + '<span></span></button></div><p class="dlg-hint" hidden></p></div>';
  (document.getElementById('game') || document.body).appendChild(root);
}

/* живая речь: иногда «ну…» перед фразой, «э-э» посреди, запинка на первой букве */
export function speechify (text, mood = 'calm', rnd = Math.random) {
  const [pf, ps] = MOOD[mood] || MOOD.calm;
  const words = text.split(' ');
  const out = [];
  for (let i = 0; i < words.length; i++) {
    let w = words[i];
    // не внутри числа и не между числом и его знаком: «6 000 ₽», «70 %», «90 км/ч» — после цифры и перед «%», «₽» не мычим
    // и не после предлога / союза в 1—2 буквы: «а десерт в как бы… заказ» (ревью 23.10, Р23-12)
    if (i && rnd() < pf && !/[.!?…]$/.test(out[out.length - 1] || '') && !/\d$/.test(words[i - 1]) && !/^\p{L}{1,2}$/u.test(words[i - 1]) && /^[\p{L}\d«"(]/u.test(w)) out.push(t(FILL[Math.floor(rnd() * FILL.length)]) + '…');
    if (w.length > 3 && rnd() < ps && /^[\p{L}]/u.test(w) && !/\d$/.test(words[i - 1] || '')) w = w[0] + '-' + (rnd() < 0.3 ? w[0].toLowerCase() + '-' : '') + w;
    out.push(w);
  }
  if (rnd() < pf * 1.5) out.unshift(t(FILL[0]) + '…');
  return out.join(' ').replace(/(\d) (?=\d|[%₽$€])/g, '$1\u00a0');   // «85 %», «8 300 ₽» не рвутся переносом строки
}

/* подпись под портретом: клиент заказа подписан в приложении ником (nicks.js person.app) — лицо живое, а подпись —
   ник («Анальная трещина» — милая бабушка). Подменяем, только если звали по имени (имя или имя-фамилия) */
const appName = o => {
  if (o.canonicalName) return o.name || '';
  const p = o.person, ap = p && p.app, n = o.name || '';
  return ap && ap.nick && n && (n === p.name || n === p.first) ? ap.nick : n;
};

/* o.skip() — спросить, когда подошла очередь: реплика ещё к месту? true — не показывать, say вернёт null
   (обед Толика стоял в очереди за другим разговором, а смена тем временем кончилась — career.js) */
/* перед окном (handcam.js, 11бд): gate(o) → Promise — сначала сцена вручения (курьер отдаёт коробку клиенту), потом окно */
let GATE = null;
export function gate (fn) { GATE = typeof fn === 'function' ? fn : null; }
export function say (o) {
  const go = () => (o.skip && o.skip() ? null : new Promise(res => show(o, res)));
  const run = () => { const g = GATE ? GATE(o) : null; return g && typeof g.then === 'function' ? g.then(go, go) : go(); };
  const p = queue.then(run);
  queue = p.catch(() => {});
  // два ответа (поручение, приглашение, гопники, Толик…) — в статистику: шапка и ответ (1 принял, 0 отказался, -1 закрыли)
  if (o.decline) p.then(r => TEL.ev('choice', { h: String(o.head || '').slice(0, 40), r: r === true ? 1 : r === false ? 0 : -1 }), () => {});
  return p;
}

function show (o, done) {
  if (!root) build();
  open++;
  API.pause(true);                               // руль из рук (game.js); мир при этом идёт
  const $ = s => root.querySelector(s);
  const two = !!o.decline;
  const stack = two && !!o.stack;                // столбиком: верхний — accept, нижний — decline, курсор ▶
  const btns = $('.dlg-btns'), hintEl = $('.dlg-hint'), box = $('.dlg-box');
  root.classList.toggle('compact', o.compact !== false && !o.door2d);
  root.classList.toggle('door2d', !!o.door2d);
  const col = o.color || '#ff8a2b';
  $('.dlg-bar').style.background = col;
  box.style.setProperty('--pp-accent', col);
  $('.dlg-what').textContent = o.head || t('разговор');
  const img = $('.dlg-head img');
  TF.stop(img);
  if (o.face || !TF.bind(img, o.person, 256, o.emo)) img.src = o.face || (API.face && o.person ? API.face(o.person, 256) : '');
  img.hidden = !img.src;
  $('.dlg-name').textContent = appName(o);
  // сумма предложения — отдельной строкой под портретом (автор 12.10.2026), «−…» — красным (отдать, заплатить)
  const payEl = $('.dlg-pay'), payS = o.pay == null ? '' : String(o.pay);
  payEl.hidden = !payS;
  payEl.classList.toggle('pp-minus', /^[−-]/.test(payS)); payEl.classList.toggle('pp-plus', !!payS && !/^[−-]/.test(payS));
  payEl.querySelector('span').textContent = payS ? (o.payLabel || '') : '';
  payEl.querySelector('b').textContent = payS;
  const yes = $('.dlg-yes'), no = $('.dlg-no');
  yes.querySelector('span').textContent = o.accept || t('дальше');
  no.querySelector('span').textContent = o.decline || '';
  no.hidden = !two;
  const noKey = no.querySelector('[data-pp-key]');
  if (noKey) noKey.dataset.ppKey = o.alt ? 'x' : 'back';   // alt: второй ответ — на X
  btns.classList.remove('on');
  btns.classList.toggle('plain', !!o.plain);
  btns.classList.toggle('stack', stack);
  btns.classList.toggle('one', !two);
  // ответы и подсказка — всегда под облачком, рядом с крупным портретом (11х, 23.10.2026: «как будто говорит прямо тебе»);
  // столбиком (stack) — друг под другом с курсором ▶, иначе — в ряд справа
  box.classList.toggle('stack', stack);
  $('.dlg-col').append(btns, hintEl);
  hintEl.hidden = true; hintEl.textContent = '';
  const glyphs = () => refreshKeys(root);           // значки [A]/[B] — по тому, чем сейчас играют (glyphs.js)
  glyphs();
  $('.dlg-skip').textContent = t('пропустить ▸');
  const ms = Array.isArray(o.meters) ? o.meters : [], mel = $('.dlg-meters'), esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  mel.hidden = !ms.length;
  mel.innerHTML = ms.map(m => '<div class="dlg-m"><span>' + esc(m.name) + '</span><i><i style="width:' + (Math.max(0, Math.min(1, +m.p || 0)) * 100).toFixed(1) + '%;background:' + esc(m.color || '#ff8a2b') + '"></i></i><b>' + esc(m.v) + '</b></div>').join('');
  const full = o.fillers === false ? o.text : speechify(o.text, o.mood);
  const el = $('.dlg-text');
  el.textContent = '';
  root.hidden = false;
  document.body.classList.add('dlg-open');      // на низком экране чат Толика не ложится на лист (dialog.css)
  box.classList.remove('dlg-pop'); void box.offsetWidth; box.classList.add('dlg-pop');
  requestAnimationFrame(() => root.classList.add('on'));

  // срок активного заказа в шапке — теми же словами и часами, что на хаде (game.js clock); нет заказа — пусто
  const clockEl = $('.dlg-clock');
  let clockKey = null;
  const clock = () => {
    let c = null;
    try { c = API.clock ? API.clock() : null; } catch (e) { c = null; }
    const k = c ? c.label + '|' + c.at + '|' + c.lvl : '';
    if (k === clockKey) return;
    clockKey = k;
    clockEl.textContent = c ? (c.at ? c.label + ' ' + c.at : c.label) : '';
    clockEl.className = 'dlg-clock' + (c && c.lvl ? ' dlg-' + c.lvl : '');
  };
  clock();

  let i = 0, typed = false, closed = false, raf = 0, last = performance.now(), acc = 0, padPrev = {}, armT = 0, blabT = 0;
  let pick = yes;                                // что нажмёт A: по умолчанию «принять»
  let lit = false;                               // подсветка видна: первое ←→↑↓ без неё только будит
  const armed = () => typed && armT >= ARM;      // ответы жмутся не сразу после того, как допечаталась
  const mark = on => {
    if (stack) { yes.classList.toggle('dlg-cur', pick === yes); no.classList.toggle('dlg-cur', pick === no); yes.classList.remove('padsel'); no.classList.remove('padsel'); return; }
    yes.classList.toggle('padsel', on && pick === yes); no.classList.toggle('padsel', on && pick === no);
  };
  // столбиком: подсказка управления одной строкой внизу — геймпад / клавиатура / палец (как разговор у двери, smalltalk.js)
  let hintKind = '';
  const hint = () => {
    if (!stack || !typed) return;
    const k = inputKind().kind;
    if (k === hintKind) return;
    hintKind = k; root.dataset.input = k;
    hintEl.textContent = k === 'pad' ? t('крестовина — выбрать · {a} — ответить', { a: glyph('ok') })
      : k === 'touch' ? t('нажми на ответ') : t('↑ ↓ — выбрать · Enter — ответить');
    hintEl.hidden = false;
  };
  const CPS = o.cps || 38;                       // букв в секунду; на многоточии — пауза
  const finish = () => {
    if (typed) return; typed = true; armT = 0; el.textContent = full; $('.dlg-btns').classList.add('on'); $('.dlg-skip').textContent = '';
    TF.stop(img); root.classList.remove('dlg-talking');
    if (o.onTyped) try { o.onTyped(); } catch (e) { console.warn('[dlg] onTyped', e); }
    if (stack) { mark(true); hint(); }
  };
  const close = v => {
    if (closed) return; closed = true;
    if (CUR === dismissMe) CUR = null;
    cancelAnimationFrame(raf);
    removeEventListener('keydown', key, true);
    TF.stop(img); root.classList.remove('dlg-talking');
    mark(false);
    yes.classList.remove('dlg-cur'); no.classList.remove('dlg-cur');
    hintEl.hidden = true;
    root.classList.remove('on');
    if (v !== null) sfx('pick');
    setTimeout(() => { if (!open) { root.hidden = true; document.body.classList.remove('dlg-open'); } }, 180);   // следующая реплика из очереди уже открылась — не прячем её
    open--;
    if (!open) API.pause(false);
    done(v);
  };
  // ответить: допечатывается — сначала допечатать; допечаталась только что — ждём ARM
  const answer = v => { if (o.paused && o.paused()) return; if (!typed) finish(); else if (armed()) close(v); };
  const tick = now => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000);
    if (o.paused && o.paused()) { last = now; return; }
    if (!typed) {
      acc += dt * CPS;
      while (acc >= 1 && i < full.length) {
        const c = full[i++];
        acc -= c === '…' || c === '.' || c === '!' || c === '?' ? 7 : c === ',' ? 3 : 1;   // знак препинания — вдох
        el.textContent = full.slice(0, i);
      }
      if ((blabT -= dt) <= 0) { blabT = BLAB; if (/\S/.test(full[i - 1] || '')) sfx('blab'); }   // бормочет, как у двери
      if (i >= full.length) finish();
    } else armT += dt;
    last = now;
    clock();
    // геймпад: A — пропустить / принять, B — отказаться
    // раскладку (Xbox, сырой Deck) разбирает input/gamepad.js
    glyphs();
    if (stack) hint();
    if (PAD.connected && stack) {                 // столбиком: крестовина / стик ↑↓ — курсор, A — ответить, X — нижний
      const a = PAD.a, x = !!PAD.x;
      if (typed) {
        if (PAD.menuUp) { pick = yes; mark(true); }
        if (PAD.menuDown) { pick = no; mark(true); }
      }
      if (a && !padPrev.a) answer(pick !== no);
      if (x && !padPrev.x) answer(false);
      padPrev = { a, b: PAD.b, x };
    } else if (PAD.connected) {
      const a = PAD.a, b = PAD.b;
      const on = padLit(PAD) && typed;
      if (on && lit && two && (PAD.menuLeft || PAD.menuUp)) pick = no;      // «отказаться» — слева
      if (on && lit && two && (PAD.menuRight || PAD.menuDown)) pick = yes;
      lit = on;
      mark(on);
      if (a && !padPrev.a) answer(pick !== no);
      if (b && !padPrev.b && !o.alt) answer(two ? false : true);   // alt: B — пропустить сцену (story.js), не ответ
      const x = !!PAD.x;
      if (o.alt && two && x && !padPrev.x) answer(false);
      padPrev = { a, b, x };
    }
  };
  raf = requestAnimationFrame(tick);
  TF.talk(img);                                  // говорит, пока печатается (finish — замолчал)
  if (o.onShow) try { o.onShow(); } catch (e) { console.warn('[dlg] onShow', e); }
  root.classList.add('dlg-talking');
  const dismissMe = () => close(null);
  CUR = dismissMe;
  const key = e => {
    if (o.paused && o.paused()) return;
    if (stack) {                                 // столбиком: стрелки / W S — курсор, Enter / пробел — ответить, 1 / 2 — сразу
      const c = e.code, eat = () => { e.preventDefault(); e.stopPropagation(); };
      if (c === 'Space' || c === 'Enter' || c === 'NumpadEnter' || c === 'KeyE') { eat(); if (!e.repeat) answer(pick !== no); }
      else if (c === 'ArrowUp' || c === 'KeyW' || c === 'ArrowDown' || c === 'KeyS') { eat(); if (typed) { pick = (c === 'ArrowUp' || c === 'KeyW') ? yes : no; mark(true); } }
      else if (c === 'Digit1' || c === 'Numpad1') { eat(); if (typed && armed()) close(true); }
      else if (c === 'Digit2' || c === 'Numpad2' || c === 'KeyX') { eat(); if (!e.repeat) answer(false); }
      return;                                    // Esc / Backspace — «пропустить сцену» (story.js)
    }
    const eat = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'KeyE') { eat(); if (e.repeat) return; if (!typed) finish(); else if (!two || e.code !== 'Space') answer(true); }
    else if (o.alt && two && e.code === 'KeyX') { eat(); if (!e.repeat) answer(false); }
    else if (o.alt && (e.code === 'Escape' || e.code === 'Backspace')) return;   // alt: Esc — пропустить сцену (story.js), не ответ
    else if (e.code === 'Escape' || e.code === 'Backspace') { eat(); if (!e.repeat) answer(two ? false : true); }
  };
  addEventListener('keydown', key, true);
  // клик / тап по облачку: допечатать; одна кнопка — дальше (две — отвечают кнопкой)
  $('.dlg-bubble').onclick = () => { if (o.paused && o.paused()) return; if (!typed) finish(); else if (!two && armed()) close(true); };
  yes.onclick = () => { if (o.paused && o.paused()) return; if (armed()) close(true); };
  no.onclick = () => { if (o.paused && o.paused()) return; if (armed()) close(false); };
}

/* ── реплика на ходу (line) ── */
export const LIVE = { Q: 2, CPS: 40, WAIT: 20 };
let lroot = null, lcur = null;
const lq = [];
export const lineOpen = () => !!lcur;
/* Реплика — в общей очереди уведомлений (notifyq.js, автор 18.10.2026: «одно уведомление за раз»): важность
   «менеджер» — после чека оплаты, до рейтинга и достижений; ждут не больше LIVE.Q (лишние, самые старые, выбрасываются),
   ждёт дольше LIVE.WAIT с — устарела. o.urgent — срочное («опаздываешь», «поторопись!»): перебивает то, что на экране */
export function line (o) {
  return new Promise(res => {
    const it = { o, res };
    lq.push(it);
    const q = NQ.push({
      kind: 'line', text: o.text, manual: true, fresh: 2, group: 'line', max: LIVE.Q, wait: LIVE.WAIT, urgent: !!o.urgent, key: o.key,
      show: n => { it.nq = n; lineNext(it); if (o.onShow) try { o.onShow(); } catch (e) { console.warn('[dlg]', e); } },
      hide: () => { if (lcur && lcur.it === it) lcur.close(); },
      drop: () => { const i = lq.indexOf(it); if (i >= 0) lq.splice(i, 1); res(false); },
    });
    if (!q) { const i = lq.indexOf(it); if (i >= 0) lq.splice(i, 1); }
  });
}
function lineNext (it) {
  const i0 = lq.indexOf(it);
  if (i0 >= 0) lq.splice(i0, 1);
  if (lcur) lcur.close();
  if (!lroot) {
    lroot = document.createElement('div');
    lroot.id = 'dlg-live';
    lroot.hidden = true;
    lroot.innerHTML = '<div class="dlg-bar"></div><div class="dll-row"><img alt=""><div class="dll-b"><b></b><p></p></div></div>';
    (document.getElementById('game') || document.body).appendChild(lroot);
  }
  const o = it.o, $ = s => lroot.querySelector(s);
  $('.dlg-bar').style.background = o.color || '#3fae5a';
  const img = $('img');
  TF.stop(img);
  if (o.face || !TF.bind(img, o.person, 128, o.emo)) img.src = o.face || (API.face && o.person ? API.face(o.person, 128) : '');
  img.hidden = !img.src;
  $('b').textContent = appName(o);
  const el = $('p'), full = String(o.text == null ? '' : o.text);
  // пузырь сразу во весь текст: ещё не напечатанное стоит невидимым (.dll-rest) — пузырь не растёт по буквам
  const shown = document.createElement('span'), rest = document.createElement('span');
  rest.className = 'dll-rest'; rest.textContent = full;
  el.replaceChildren(shown, rest);
  lroot.hidden = false;
  requestAnimationFrame(() => lroot.classList.add('on'));
  let i = 0, acc = 0, last = performance.now(), left = -1, raf = 0, done = false;
  const close = () => {
    if (done) return; done = true;
    cancelAnimationFrame(raf);
    TF.stop(img);
    lroot.classList.remove('on');
    lroot.onclick = null;
    setTimeout(() => { if (!lcur) lroot.hidden = true; }, 200);
    lcur = null;
    it.res(true);
    if (it.nq) NQ.done(it.nq);                   // ушла — следующее уведомление после паузы (notifyq.js)
  };
  const tick = now => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (i < full.length) {
      acc += dt * LIVE.CPS;
      while (acc >= 1 && i < full.length) { const c = full[i++]; acc -= c === '.' || c === '!' || c === '?' || c === '…' ? 5 : 1; }
      shown.textContent = full.slice(0, i); rest.textContent = full.slice(i);
      if (i >= full.length) { left = lineTime(full); TF.stop(img); }
    } else if ((left -= dt) <= 0) close();
  };
  lcur = { close, it };
  lroot.onclick = close;
  raf = requestAnimationFrame(tick);
  TF.talk(img);                                  // говорит, пока буквы проявляются
}
/* убрать реплику на ходу и очередь (конец смены, меню) */
export function lineClear () { NQ.clear('line'); while (lq.length) lq.shift().res(false); if (lcur) lcur.close(); }
/* для ?debug (__dlv.DLG.TALKDBG): говорящие портреты — state(img) → { mouth: 0 закрыт | 1 приоткрыт | 2 открыт, talking } */
export const TALKDBG = TF.DEBUG;
