/* ──────────────────────────────────────────────────────────────────────────
   Жители Юга (docs/IDEAS.md трек 11 п. 5 «Знакомые лица района»; docs/ORDERS.md «Жители Юга»).
   Автор: «5—8 жителей первого района, которые встречаются снова (заказ → поручение → встреча у двери), у каждого
   маленькая история на 3—4 появления». Первый район — самый важный: зацепить игрока, «а что будет дальше?».

   Пятеро, у каждого — свой подъезд в Юге (запоминается на первом появлении) и история на 4 появления разного вида:
     door   — заказ к его двери, при вручении — окно разговора (реплики, два ответа, ответ в ответ);
     errand — заказ ему, при вручении он просит поручение (orders.config.js SIDE_ORDERS, face: его герой) — в магазин
              или к человеку у подъезда (встреча на улице);
     meet   — заказ к его подъезду, вместо вручения — встреча-катсцена у подъезда (encounters.js, герои LOCAL_HEROES);
     развязка — последнее появление: дверь открывает другой человек (мама, новый жилец) или он сам — уже другой.
   Ответы в некоторых появлениях запоминаются: от них зависит развязка (by).

   Когда: только карьера, только первый район («Юг», не «весь город», не быстрый заезд), с 1-й смены игрока. Ставит
   ритм смены (rhythm.js localSlot) — как встречу у двери: заказ подъёма, на прошлом заказе события не было, не в окно
   «покататься», в счёт встреч смены (поручение — в счёт поручений). Не больше LC.PER_SHIFT появлений за смену, один
   житель — не чаще раза в смену. Очередь: знакомства и продолжение самой продвинутой истории
   вперемешку (want) — за 4 смены Юга игрок знакомится с 3—4 жителями и видит одну историю почти до конца. Пропустил, не доехал, смена кончилась
   — история ждёт: появление засчитывается, только когда случилось.

     init(api)   — game.js: { Store, ADULT, rehuman(p, person), pay(n, row, person), money(n) }
     want(shift) — rhythm.js: появление в этой смене → { face, local, kind, id, i, side, key, avoid, step, what, name } | null
     planned(id) / unplan() — rhythm.js: поставлено на заказ / не вышло (нет адреса)
     met(local, ans, spot, door) — encounters.js: катсцена сыграна; asked(face, spot) / missed(face) — orders.js: поручение
     hand(st, onTime, o, api, ctx) — oddfolk.js при вручении: окно разговора (door) → 'door' | 'errand' | ''
   отладка: __dlv.LOCALS — state, list, reset(), step(id, n), force(id) — следующее появление его, play(id, n) — окно сейчас
   ────────────────────────────────────────────────────────────────────────── */
import { t, N_ } from '../i18n/index.js';
import * as DIRECTOR from './director.js';
import * as RHY from './rhythm.js';
import { makePerson } from './people.js';
import * as DCAST from './doorcast.js';        // кто говорит — стоит у двери в 3D и говорит ртом (doorcast.js)

export const LC = {
  ON: true,
  KEY: 'dlv-locals',     // сохранение профиля: { p: { id: { step, last, ans, key, x, z, miss } }, n — сколько появлений было }
  PER_SHIFT: 2,          // появлений жителей за смену, не больше (обычно ритм пускает 1—2)
  MISS: 2,               // поручение не вышло столько раз (нет магазина / человека рядом) — история идёт дальше без него
  SAY: 0.6,              // окно разговора — через столько секунд после вручения
  COL: '#2e8a6b',        // шапка окна
};

/* окно разговора (как regulars.js): s — реплики { s, e — лицо, w — кто (0 — сам житель, 1… — crew) },
   a — два ответа курьера { a, r — ответ, e, w, tip — чаевые ₽ как видит игрок, row — строка чека } */
const L = (s, e, w) => ({ s, e: e || 'ok', w: w || 0 });
const A2 = (a, r, e, w, tip, row) => ({ a, r, e: e || 'ok', w: w || 0, tip: tip || 0, row: row || '' });

/* Жители. look — внешность (people.js), char — походка и жесты в катсцене (actorlife.js), decor — подъезд в катсцене
   (encounters.js), crew — другие люди его истории (мама и т. п.). steps — появления по порядку:
     { kind: 'door', talk | talks: [если ответ 0, если ответ 1], by — номер появления, чей ответ, swap — к двери выходит crew[n-1] }
     { kind: 'errand', side — id поручения в SIDE_ORDERS }
     { kind: 'meet', hero — герой катсцены (по умолчанию сам), i | by + i: [если 0, если 1] — встреча героя по счёту } */
const LOCALS = /*i18n*/ [
  /* Людмила Петровна — пенсионерка, которую обрабатывают телефонные мошенники («майор Ковалёв из службы безопасности») */
  { id: 'ludmila', name: N_('Людмила Петровна'), fem: true, seed: 0x1d3a, decor: 'granny', who: 'local_ludmila',
    look: { age: 'old', wrinkles: true, hair: 'bun', hairC: '#d4d0ca', glasses: 'round', glassC: '#6b3a22', head: 'none', eyes: 'round', brows: 'sad', mouth: 'small',
      top: 'long', shirt: '#7a5a8a', sweater: '#e8dcc0', bottom: 'skirt', skirt: '#4a3a4a', pants: '#4a3a4a', shoes: '#3a2a22', fat: false, shape: 'normal', blush: true, pack: null },
    char: { walk: { speed: 0.7, step: 9, leg: 0.22, arm: 0.2, drag: 0.6, stoop: 0.16 }, talk: 'small', idle: 'fidget' },
    steps: [
      { kind: 'door', what: 'у двери: «вы не из банка?»',
        talk: { s: [L(N_('Вы не из банка? Мне звонили из службы безопасности. Сказали никому не открывать.'), 'scared'),
          L(N_('…Но про пиццу ничего не говорили. Давайте.'))],
        a: [A2(N_('Я из пиццерии'), N_('Вот и хорошо. А то майор Ковалёв сказал: вокруг одни мошенники. Кроме него.')),
          A2(N_('Не верьте звонкам'), N_('Майор так и сказал: «Не верьте тем, кто скажет не верить». Умный человек.'), 'happy')] } },
      { kind: 'errand', side: 'lc-ludmila-sim', what: 'поручение: новая симка' },
      { kind: 'meet', i: 0, what: 'у подъезда: «ты от майора?»' },
      { kind: 'meet', hero: 'lc-tenant', by: 2, i: [1, 0], what: 'развязка: новый жилец' },
    ] },

  /* Серёга — двенадцать лет на КПП закрытого города, сам ни разу не выезжал */
  { id: 'guard', name: N_('Серёга'), fem: false, seed: 0x6a2d, decor: 'nice', who: 'local_guard',
    look: { age: 'adult', hair: 'buzz', hairC: '#3a2a1e', beard: 'mustache', head: 'none', glasses: 'none', eyes: 'narrow', brows: 'thick', mouth: 'line', broad: true,
      top: 'jacket', jacket: '#5a6b4a', shirt: '#c8ccb8', bottom: 'pants', pants: '#3a4038', shoes: '#1f1c1a', fat: false, shape: 'normal', pack: null },
    char: { walk: { speed: 0.95, step: 7, leg: 0.5, arm: 0.2 }, talk: 'point', idle: 'still' },
    steps: [
      { kind: 'door', what: 'у двери: «пропуск»',
        talk: { s: [L(N_('Пропуск. …Тьфу. Двенадцать лет на КПП — даже пиццу хочется досмотреть.'))],
        a: [A2(N_('Досматривайте'), N_('Так… сыр, колбаса, грибы. Запрещённого нет. Проходи. То есть уходи. То есть спасибо.'), 'happy'),
          A2(N_('Только не открывайте'), N_('Закрытая коробка… Всю жизнь их открываю. Ладно. На доверии. Первый раз.'), 'surprised')] } },
      { kind: 'errand', side: 'lc-guard-atlas', what: 'поручение: атлас' },
      { kind: 'meet', i: 0, what: 'у подъезда: отпуск за забор' },
      { kind: 'door', what: 'развязка: вернулся',
        talk: { s: [L(N_('Вернулся. На день раньше.'), 'sad'),
          L(N_('Там всё то же самое. Только без забора. Идёшь — и никто не проверяет. Жуть.'), 'scared')],
        a: [A2(N_('Привыкнете'), N_('Не хочу привыкать. Завтра на смену. Там хоть понятно, где всё кончается.')),
          A2(N_('А как Томск?'), N_('Большой. Я там троих досмотрел. Рефлекс. Один даже спасибо сказал.'), 'happy')] } },
    ] },

  /* Петя — шестиклассник, мама в две смены на комбинате, дома он и рыбка */
  { id: 'petya', name: N_('Петя'), fem: false, seed: 0x9e7c, decor: 'dark', who: 'local_petya',
    look: { age: 'young', hair: 'bowl', hairC: '#8a5a2e', head: 'none', glasses: 'none', beard: 'none', stubble: false, freckles: true, eyes: 'round', brows: 'raised', mouth: 'small',
      top: 'stripe', shirt: '#e0b13f', stripe: '#2e4a8a', bottom: 'pants', pants: '#3a4a6b', shoes: '#d9342c', fat: false, shape: 'thin', pack: null },
    char: { walk: { speed: 1.1, step: 11, leg: 0.4, arm: 0.35, hop: 0.03 }, talk: 'shrug', idle: 'fidget' },
    crew: [{ name: N_('Ирина, мама Пети'), fem: true,
      look: { age: 'adult', hair: 'ponytail', hairC: '#8a5a2e', bags: true, eyes: 'sleepy', brows: 'sad', mouth: 'line', head: 'none', glasses: 'none',
        top: 'jacket', jacket: '#3b4a5a', shirt: '#c8ccd2', bottom: 'pants', pants: '#2f3540', fat: false, shape: 'thin', pack: null } }],
    steps: [
      { kind: 'door', what: 'у двери: «ты же пицца»',
        talk: { s: [L(N_('Мама сказала никому не открывать. Но ты же не «никто», ты пицца.'), 'happy'),
          L(N_('Деньги на тумбочке были. Мама оставила. На неделю. Вот — пицца на неделю.'))],
        a: [A2(N_('А мама где?'), N_('На комбинате. В две смены. Говорит, это пока. Пока уже два года.'), 'sad'),
          A2(N_('Приятного аппетита'), N_('Ага. Я её на семь кусков режу. По одному на день.'), 'happy')] } },
      { kind: 'errand', side: 'lc-petya-fish', what: 'поручение: корм для рыбки' },
      { kind: 'meet', i: 0, what: 'у подъезда: свет отключили' },
      { kind: 'door', swap: 1, what: 'развязка: дверь открывает мама',
        talk: { s: [L(N_('Это вы ему пиццу возите? Он сказал, у него друг — курьер.'), 'sad', 1),
          L(N_('…Единственный друг. Я думала, он про рыбку.'), 'sad', 1)],
        a: [A2(N_('Он хороший пацан'), N_('Я знаю. Я его почти не вижу. Он спит, когда я дома.'), 'sad', 1),
          A2(N_('Ему одиноко'), N_('Мне тоже. Держите. Это с премии. Премию дали за переработку.'), 'ok', 1, 500, N_('от мамы Пети'))] } },
    ] },

  /* Костя — блогер с пляжа: снимает «Солнечный — лучший город» на конкурс, где приз — пропуск на выезд насовсем */
  { id: 'blogger', name: N_('Костя'), fem: false, seed: 0xb10a, decor: 'loft', who: 'local_blogger',
    look: { age: 'young', hair: 'spiky', hairC: '#e0c060', head: 'cap', headC: '#ff3ea5', capBack: true, glasses: 'none', beard: 'none', stubble: false, earring: true, eyes: 'round', brows: 'raised', mouth: 'smile',
      top: 'long', shirt: '#6fc2b0', bottom: 'pants', pants: '#2b2a30', shoes: '#f4f1ea', fat: false, shape: 'thin', pack: null },
    char: { walk: { speed: 1.1, step: 10, leg: 0.45, arm: 0.45, sway: 0.06 }, talk: 'flap', idle: 'bounce' },
    crew: [{ name: N_('мама Кости'), fem: true,
      look: { age: 'adult', hair: 'bob', hairC: '#6b4a2e', eyes: 'round', brows: 'sad', mouth: 'smile', head: 'none', glasses: 'square', glassC: '#6b3a22',
        top: 'long', shirt: '#c9476b', bottom: 'skirt', skirt: '#3a3036', fat: true, shape: 'chubby', pack: null } }],
    steps: [
      { kind: 'door', what: 'у двери: «скажи в камеру»',
        talk: { s: [L(N_('Стой! Не двигайся, я снимаю. Скажи в камеру: «В Солнечном лучшая пицца»!'), 'happy'),
          L(N_('Конкурс «Мой закрытый город». Победителю — пропуск на выезд. Насовсем.'))],
        a: [A2(N_('В Солнечном лучшая пицца!'), N_('Огонь! Двенадцать подписчиков увидят. Тринадцать — если мама с двух аккаунтов.'), 'happy'),
          A2(N_('Не снимай меня'), N_('Понял. Лицо замажу. Будешь «таинственный курьер». Так даже лучше.'))] } },
      { kind: 'errand', side: 'lc-blogger-lamp', what: 'поручение: лампа у Димаса' },
      { kind: 'meet', i: 0, what: 'у подъезда: «день сорок»' },
      { kind: 'door', swap: 1, by: 0, what: 'развязка: мама — «он уехал»',
        talks: [
          { s: [L(N_('Вы курьер из видео? «В Солнечном лучшая пицца». Миллион просмотров. Костю позвали в Москву.'), 'happy', 1),
            L(N_('Дали пропуск. В одну сторону. Пиццу вам заказал — оплатил оттуда.'), 'sad', 1)],
          a: [A2(N_('Передайте привет'), N_('Передам. Он по субботам звонит. Я всю неделю жду субботу.'), 'sad', 1),
            A2(N_('Вы рады?'), N_('Рада. Комната пустая. Лампа его горит — я не выключаю.'), 'sad', 1)] },
          { s: [L(N_('Вы — «таинственный курьер»? Видео набрало миллион. Костю позвали в Москву.'), 'happy', 1),
            L(N_('Дали пропуск. В одну сторону. Пиццу вам заказал — оплатил оттуда.'), 'sad', 1)],
          a: [A2(N_('Передайте привет'), N_('Передам. Он по субботам звонит. Я всю неделю жду субботу.'), 'sad', 1),
            A2(N_('Вы рады?'), N_('Рада. Комната пустая. Лампа его горит — я не выключаю.'), 'sad', 1)] },
        ] },
    ] },

  /* Олеся — «почти бриллиантовый директор»: продаёт фильтры для воды по сетевой схеме, в долгах */
  { id: 'olesya', name: N_('Олеся'), fem: true, seed: 0x01e5, decor: 'foil', who: 'local_olesya',
    look: { age: 'adult', hair: 'long', hairC: '#e0c060', head: 'none', glasses: 'none', eyes: 'round', brows: 'raised', mouth: 'smile', lip: '#d9342c',
      top: 'jacket', jacket: '#ff7ab0', shirt: '#f4f1ea', bottom: 'skirt', skirt: '#2b2a30', shoes: '#f4f1ea', fat: false, shape: 'thin', pack: null },
    char: { walk: { speed: 1.05, step: 9, leg: 0.4, arm: 0.4, sway: 0.1 }, talk: 'point', idle: 'sway' },
    steps: [
      { kind: 'door', what: 'у двери: «хочешь зарабатывать?»',
        talk: { s: [L(N_('Привет! Хочешь зарабатывать, не выходя из машины? Не пицца — лучше! Фильтры для воды.'), 'happy'),
          L(N_('Вода из-под комбината — на выходе как из Альп. Сама пью третий месяц. Почти не свечусь.'), 'happy')],
        a: [A2(N_('Сколько стоит?'), N_('Сорок тысяч. Это не цена — это вход в команду. Подумай. Я тебе напишу. Сто раз.'), 'happy'),
          A2(N_('Мне не надо'), N_('Всем надо. Просто не все ещё знают. Я подожду. Я умею.'))] } },
      { kind: 'errand', side: 'lc-olesya-filter', what: 'поручение: возврат у Тани' },
      { kind: 'meet', i: 0, what: 'у подъезда: аквариумы' },
      { kind: 'door', what: 'развязка: «ты не коллектор»',
        talk: { s: [L(N_('Кредиты закрыла. Ну, как закрыла — дверь закрыла. Не открываю. Тебе открыла: ты не коллектор.'), 'scared'),
          L(N_('Возьми фильтр вместо чаевых. Возьми два. Возьми все сорок — они в ванной до потолка.'))],
        a: [A2(N_('Возьму один'), N_('Спасибо. Ты теперь в команде. Ты и я. Нас двое.'), 'happy'),
          A2(N_('Не надо, спасибо'), N_('Все так говорят. Сорок раз сказали.'), 'sad')] } },
    ] },
];

/* встречи-катсцены у подъезда (формат encounters.js / smalltalk-lines.js: say, a / b — { me, re, mood, out, row, slam }) */
const MEETS = /*i18n*/ {
  ludmila: [
    { id: 'lc-ludmila-major', emo: 'scared',
      say: N_('Майор Ковалёв велел снять всё с книжки и отдать курьеру. Ты курьер. Ты от майора?'),
      a: { me: N_('Нет! Не отдавайте!'), re: N_('Майор предупреждал, что придёт ненастоящий курьер. Иди, милок.'), mood: 'sad', out: '0', slam: true },
      b: { me: N_('Я с пиццей'), re: N_('С пиццей… Значит, другой придёт. Майор сказал — к семи. На вот, на чай.'), mood: 'ok', out: 'tip', row: N_('на чай от Людмилы Петровны') } },
  ],
  tenant: [
    { id: 'lc-tenant-warned', emo: 'ok',
      say: N_('Людмила Петровна тут больше не живёт. Квартиру продала. Говорят, какой-то курьер её отговаривал. Не послушала.'),
      a: { me: N_('Где она?'), re: N_('У сестры в Томске. Или в доме престарелых. Майор не уточнял.'), mood: 'ok', out: '0' },
      b: { me: N_('Приятного аппетита'), re: N_('Спасибо. Хорошая квартира. Даже ковёр оставила.'), mood: 'happy', out: 'tip', row: N_('чаевые нового жильца') } },
    { id: 'lc-tenant-safe', emo: 'ok',
      say: N_('Людмила Петровна тут больше не живёт. Квартира теперь «безопасная». Пицца на её имя? Оплачено с её карты — давай.'),
      a: { me: N_('Где она?'), re: N_('У сестры в Томске. Или в доме престарелых. Майор не уточнял.'), mood: 'ok', out: '0' },
      b: { me: N_('Приятного аппетита'), re: N_('Спасибо. Хорошая квартира. Даже ковёр оставила.'), mood: 'happy', out: 'tip', row: N_('чаевые нового жильца') } },
  ],
  guard: [
    { id: 'lc-guard-leave', emo: 'surprised',
      say: N_('Взял отпуск. Первый за двенадцать лет. Сам себе пропуск подписал — рука дрожала.'),
      a: { me: N_('Удачи там!'), re: N_('Главное — чтобы обратно пустили. Я себя знаю: я бы не пустил.'), mood: 'happy', out: 'tip', row: N_('на удачу от Серёги') },
      b: { me: N_('А зачем?'), re: N_('Посмотреть, от чего охраняю. Или кого.'), mood: 'ok', out: '0' } },
  ],
  petya: [
    { id: 'lc-petya-dark', emo: 'ok',
      say: N_('Свет отключили. За неуплату. Мама в ночную. У меня фонарик в телефоне. Тридцать процентов.'),
      a: { me: N_('Хочешь, посижу?'), re: N_('Тебе работать. Ты же не мама. Мама тоже не может.'), mood: 'sad', out: '0' },
      b: { me: N_('Позвони маме'), re: N_('Ей на смене нельзя. Её поругают. А меня некому.'), mood: 'sad', out: '0' } },
  ],
  blogger: [
    { id: 'lc-blogger-day40', emo: 'sad',
      say: N_('День сорок. Видео «Солнечный — лучший город» — триста просмотров. Один комментарий: «а как отсюда уехать?»'),
      a: { me: N_('Не сдавайся'), re: N_('Не сдамся. Сниму очередь за пропуском. Это же весело? Это весело.'), mood: 'ok', out: 'tip', row: N_('за поддержку от Кости') },
      b: { me: N_('Может, бросить?'), re: N_('И на комбинат? Отец тридцать лет на комбинате. Он себе даже снится на комбинате.'), mood: 'angry', out: '0' } },
  ],
  olesya: [
    { id: 'lc-olesya-fish', emo: 'happy',
      say: N_('Видишь аквариумы? Вода — через мой фильтр. Рыбки довольны. Две всплыли, но это от счастья.'),
      a: { me: N_('Красиво'), re: N_('Правда? Ты первый за месяц. Остальные говорят: «Олеся, верни деньги».'), mood: 'happy', out: 'tip', row: N_('от бриллиантового директора') },
      b: { me: N_('Рыбки же умерли'), re: N_('Не умерли. Ушли на повышение. Как у нас в команде.'), mood: 'angry', out: '0', slam: true } },
  ],
};

/* герои катсцен для encounters.js (поля — как у HEROES там; face — чей заказ, local — чья история; в случайные встречи
   не попадают; swap — после катсцены к двери за пиццей выходит он, а не тот, кто в накладной) */
export const LOCAL_HEROES = LOCALS.map(h => ({ id: 'lc-' + h.id, face: 'lc-' + h.id, local: h.id, who: h.who, name: h.name, seed: h.seed, fem: h.fem,
  decor: h.decor, look: h.look, char: h.char, only: MEETS[h.id] || [] })).concat([
  { id: 'lc-tenant', face: 'lc-ludmila', local: 'ludmila', swap: true, who: 'local_tenant', name: N_('новый жилец'), seed: 0x7e4a, fem: false, decor: 'cop',
    look: { age: 'adult', hair: 'buzz', hairC: '#1a1a1a', head: 'none', beard: 'none', bristle: true, glasses: 'none', eyes: 'narrow', brows: 'thick', mouth: 'smirk', broad: true,
      top: 'stripe', shirt: '#2b2a30', stripe: '#f4f1ea', bottom: 'pants', pants: '#2b2a30', shoes: '#f4f1ea', fat: false, shape: 'normal', pack: null },
    char: { walk: { speed: 0.9, step: 7, leg: 0.5, arm: 0.3 }, talk: 'shrug', idle: 'still' },
    only: MEETS.tenant },
]);

const BY = {};
for (const h of LOCALS) BY[h.id] = h;

/* ─────────────── состояние ─────────────── */
let A = null, CUR = '', CURS = 0, FORCE = '';
const LOG = [];
function get (k, d) { try { return A && A.Store ? A.Store.get(k, d) : d; } catch (e) { return d; } }
function set (k, v) { try { if (A && A.Store) A.Store.set(k, v); } catch (e) { /* без сохранения — не страшно */ } }
const cur = () => (+get('dlv-shifts', 0) || 0) + 1;            // номер идущей смены (как rhythm.js R.shift)
function load () {
  let v = get(LC.KEY, null);
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
  return v && typeof v === 'object' && v.p ? v : { p: {}, n: 0 };
}
function save (v) { set(LC.KEY, v); }
function rec (sv, id) {
  const r = Object.assign({ step: 0, last: 0, ans: [], key: '', x: 0, z: 0, miss: 0 }, sv.p[id] || {});
  if (r.last > cur()) r.last = 0;                               // прогресс сбросили — старые отметки не держат
  return r;
}
function note (s) { LOG.push('смена ' + cur() + ': ' + s); if (LOG.length > 40) LOG.shift(); }
const pool = () => LOCALS;                                     // все пятеро — и во взрослой, и в детской (без мата)

/* какой вариант появления: by — по ответу в появлении № by (нет ответа — второй вариант) */
const pickBy = (st, r, arr) => (Array.isArray(arr) ? arr[st.by !== undefined && r.ans[st.by] === 0 ? 0 : arr.length > 1 ? 1 : 0] : arr);

/** rhythm.js: появление жителя в этой смене (или null). Очередь: первые два появления — знакомства, дальше через раз
    (знакомство ↔ продолжение самой продвинутой начатой истории; нет нужного — другое): Л1 С1 Л2 П1 Л3 К1 Л4 О1, потом
    продолжения. Короткие первые смены дают ~1 появление — за 4 смены Юга игрок знакомится с тремя-четырьмя */
export function want (shift) {
  if (!A || !LC.ON) return null;
  const sv = load();
  if (CUR && CURS !== shift) CUR = '';                           // поставлено в прошлой смене и не случилось — забыть
  if (CUR) return null;                                          // уже поставлено на заказ — ждём, случится ли
  const all = pool().map(h => ({ h, r: rec(sv, h.id) }));
  const here = all.filter(q => q.r.last === shift).length;       // уже были в этой смене
  const L2 = all.filter(q => q.r.step < q.h.steps.length);
  if (FORCE) {                                                   // отладка: его — без очереди и лимита (снимается, когда поставили)
    const q = L2.find(x => x.h.id === FORCE);
    if (q) return slotOf(q.h, q.r, sv);
    FORCE = '';
  }
  if (here >= LC.PER_SHIFT) return null;
  const ok = L2.filter(q => q.r.last < shift);
  if (!ok.length) return null;
  const fresh = ok.filter(q => q.r.step === 0);
  const going = ok.filter(q => q.r.step > 0).sort((a, b) => (b.r.step - a.r.step) || (a.r.last - b.r.last));
  const n = +sv.n || 0, fresh1 = n < 2 || n % 2 === 1;          // знакомства: 1-е, 2-е, 4-е, 6-е, 8-е появление; между — продолжение
  const q = fresh1 ? fresh[0] || going[0] : going[0] || fresh[0];
  return q ? slotOf(q.h, q.r, sv) : null;
}
function slotOf (h, r, sv) {
  const st = h.steps[r.step];
  const avoid = [];
  for (const k in sv.p) if (k !== h.id && sv.p[k].key) avoid.push(sv.p[k].key);     // у каждого свой подъезд
  const s = { face: 'lc-' + h.id, local: h.id, step: r.step, kind: st.kind, name: t(h.name), key: r.key, avoid,
    what: (r.step + 1) + '/' + h.steps.length + ' ' + t(h.name) + ' — ' + st.what };
  if (st.kind === 'meet') { s.id = st.hero || 'lc-' + h.id; s.i = pickBy(st, r, st.i) || 0; }
  else { s.id = 'lc-' + h.id; s.i = 0; }
  if (st.kind === 'errand') s.side = st.side;
  return s;
}
/** rhythm.js: появление поставлено на заказ / не вышло (адрес занят, нет подъезда) */
export function planned (id) { CUR = id || ''; CURS = cur(); if (FORCE === id) FORCE = ''; }
export function unplan () { CUR = ''; }

function remember (r, spot) {
  if (spot && spot.key && !r.key) { r.key = spot.key; r.x = Math.round(spot.x * 10) / 10; r.z = Math.round(spot.z * 10) / 10; }
}
/* появление случилось: следующее — по порядку */
function advance (id, how, spot) {
  const sv = load(), h = BY[id], r = rec(sv, id);
  remember(r, spot);
  note(t(h.name) + ' ' + (r.step + 1) + '/' + h.steps.length + ': ' + h.steps[r.step].what + (how ? ' — ' + how : ''));
  r.step++; r.last = cur(); r.miss = 0;
  sv.p[id] = r; sv.n = (+sv.n || 0) + 1;
  save(sv);
  if (CUR === id) CUR = '';
  return r.step - 1;
}
function answer (id, step, ans) {
  const sv = load(), r = rec(sv, id);
  r.ans[step] = ans === 0 || ans === 1 ? ans : null;
  sv.p[id] = r; save(sv);
}

/** encounters.js: катсцена жителя сыграна на заказе. ans — 'yes' / 'no' / null (пропустил); spot — адрес заказа */
export function met (id, ans, spot) {
  const h = BY[id];
  if (!h) return;
  const r = rec(load(), id);
  if (r.step >= h.steps.length || h.steps[r.step].kind !== 'meet') return;
  const n = advance(id, ans ? (ans === 'yes' ? 'верхний ответ' : 'нижний ответ') : 'пропустил', spot);
  answer(id, n, ans === 'yes' ? 0 : ans === 'no' ? 1 : null);
}
/** orders.js: житель попросил своё поручение (взял ты его или нет — история идёт дальше) */
export function asked (f, spot) {
  if (!f || !BY[f.local]) return;
  const r = rec(load(), f.local);
  if (r.step !== f.step) return;
  advance(f.local, 'попросил', spot);
}
/** orders.js: поручение не вышло (нет магазина или человека рядом) — LC.MISS раз подряд — история идёт дальше без него */
export function missed (f) {
  if (!f || !BY[f.local]) return;
  const sv = load(), r = rec(sv, f.local);
  if (r.step !== f.step) return;
  r.miss = (r.miss || 0) + 1;
  sv.p[f.local] = r; save(sv);
  if (CUR === f.local) CUR = '';
  note(t(BY[f.local].name) + ': поручение не вышло (' + r.miss + ')');
  if (r.miss >= LC.MISS) advance(f.local, 'поручение пропущено: рядом нет магазина / человека');
}

/* ─────────────── окно разговора у двери ─────────────── */
const seedOf = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const PEOPLE = {};
/** человек жителя — с настоящим именем «в приложении» (nicks.js: ник = имя, аватарка — лицо), чтобы в окнах и накладной
    был «Людмила Петровна», а не случайный ник. rhythm.js зовёт для клиента заказа, тут — для своих окон */
export function own (p, name) {
  if (p && (!p.app || p.app.adult !== !!(A && A.ADULT) || p.app.nick !== name)) p.app = { nick: name, kind: 'name', av: 'face', avSeed: (p.seed >>> 0) || 1, adult: !!(A && A.ADULT) };
  return p;
}
/* человек жителя для окон: та же внешность, что в накладной и в катсцене (то же зерно и look, что у encounters.js personOf) */
function personOf (h) {
  if (PEOPLE[h.id]) return PEOPLE[h.id];
  const p = makePerson({ seed: h.seed, fem: h.fem });
  Object.assign(p.look, h.look);
  const name = t(h.name);
  Object.assign(p, { id: 'lc-' + h.id, name, first: name, last: '', acc: name, gen: name, dat: name, pos: '' });
  return (PEOPLE[h.id] = own(p, name));
}
function crewOf (h, w) {
  const c = (h.crew || [])[w - 1] || {}, key = h.id + '-' + w;
  if (!PEOPLE[key]) {
    const p = makePerson({ seed: seedOf('lc-' + key), fem: !!c.fem });
    Object.assign(p.look, c.look || {});
    if (c.look && c.look.hairC && !c.look.browC) p.look.browC = c.look.hairC;
    const name = t(c.name || h.name);
    Object.assign(p, { id: 'lc-' + key, name, first: name, last: '', acc: name, gen: name, dat: name, pos: '' });
    PEOPLE[key] = own(p, name);
  }
  return PEOPLE[key];
}
function speaker (h, w) {
  if (!w) return { person: personOf(h), name: t(h.name) };
  const c = (h.crew || [])[w - 1] || {};
  return { person: crewOf(h, w), name: t(c.name || h.name) };
}
const ST = { plays: 0, paid: 0, last: null };
/* актёры в мире (doorcast.js): w0 — кто открыл (клиент у двери: сам житель или crew при swap), остальные — рядом с ним */
function castFor (h, m, ped, w0) {
  if (!ped) return null;
  const who = { [w0]: DCAST.client(ped) }, own = [];
  let n = 0;
  const add = w => { if (!ped.grp || !ped.grp.parent) return null; const a = DCAST.extra(speaker(h, w).person, ped, n++, 2); if (a) own.push(a); return a; };
  for (const w of new Set(m.s.map(l => l.w || 0).concat(m.a.map(q => q.w || 0)))) if (!(w in who)) who[w] = add(w);
  return { get: w => (w in who ? who[w] : null), done: () => { for (const a of own) DCAST.leave(a); DCAST.leave(who[w0]); } };
}
/** окна разговора по очереди → { ans: 0 | 1 | null, tip }; cast — актёры в мире (castFor) или null */
async function talk (h, m, ctx, cast) {
  try { return await talkWin(h, m, ctx, cast); } finally { if (cast) cast.done(); }
}
async function talkWin (h, m, ctx, cast) {
  const who = w => (cast ? cast.get(w || 0) : null);
  ST.plays++;
  const base = { head: t('у двери'), color: LC.COL, fillers: false, mood: 'calm' };
  const last = m.s.length - 1;
  for (let i = 0; i < last; i++) {
    const l = m.s[i];
    const r = await DCAST.say(who(l.w), Object.assign({}, base, speaker(h, l.w), { emo: l.e, text: t(l.s), accept: t('… промолчать') }));
    if (r === null) return { ans: null, tip: 0 };
  }
  const l = m.s[last];
  const r = await DCAST.say(who(l.w), Object.assign({}, base, speaker(h, l.w), { emo: l.e, text: t(l.s), stack: true, accept: t(m.a[0].a), decline: t(m.a[1].a) }));
  if (r === null) return { ans: null, tip: 0 };
  const ans = r === true ? 0 : 1, q = m.a[ans], sq = speaker(h, q.w);
  const money = (ctx && ctx.money) || (A && A.money);
  const tipS = q.tip ? '+' + (money ? money(q.tip) : q.tip + ' ₽') : null;
  const r2 = await DCAST.say(who(q.w), Object.assign({}, base, sq, { emo: q.e, text: t(q.r), accept: q.tip ? t('взять') : t('пока'), pay: tipS, payLabel: q.tip ? t('чаевые') : '' }));
  let tip = 0;
  const pay = (ctx && ctx.pay) || (A && A.pay);
  if (r2 !== null && q.tip && pay) { tip = pay(q.tip, t(q.row || 'чаевые'), sq.person) || 0; ST.paid += tip; }
  return { ans, tip };
}
const talkOf = (h, step, r) => { const st = h.steps[step]; return st.talks ? pickBy(st, r, st.talks) : st.talk; };

/** oddfolk.js, при вручении: заказ жителя. door — окно разговора (через LC.SAY с, держит вручение), errand — поручение
    попросит orders.js delivered (тут — только «занято»: ни героя автора, ни приглашения). → 'door' | 'errand' | '' */
export function hand (st, onTime, o, api, ctx) {
  const f = o && o.ord && o.ord.face;
  if (!A || !f || !f.local || !BY[f.local]) return '';
  if (f.kind === 'errand') return 'errand';
  if (f.kind !== 'door' || !st || st.lcDone) return '';
  const h = BY[f.local], sv = load(), r = rec(sv, f.local);
  if (r.step !== f.step || h.steps[r.step].kind !== 'door') return '';
  st.lcDone = true;
  const step = r.step, stp = h.steps[step], m = talkOf(h, step, r);
  const p = st.peds && st.peds[0];
  // к двери выходит другой человек (мама): в накладной — он, открывает она
  if (stp.swap && p && !p.dead && A.rehuman) { try { A.rehuman(p, crewOf(h, stp.swap)); if (st.persons) st.persons[0] = p.person; } catch (e) { console.warn('[locals] rehuman', e); } }
  advance(f.local, '', o.ord.stops && o.ord.stops[0]);
  ST.last = { id: f.local, step, res: null };
  DIRECTOR.start('odd', 60);
  try { RHY.faceOn(t(h.name) + ' ' + (step + 1) + '/' + h.steps.length); } catch (e) { /* — */ }
  const hold = on => { try { if (api && api.hold) api.hold(on); } catch (e) { /* — */ } };
  setTimeout(() => {
    hold(true);                                                  // вручение уже идёт: следующий заказ не берётся, пока окно открыто
    talk(h, m, ctx, castFor(h, m, st.peds && st.peds[0], stp.swap || 0)).then(res => { ST.last.res = res; answer(f.local, step, res.ans); }, e => console.warn('[locals] talk', e))
      .finally(() => { hold(false); DIRECTOR.end('odd'); try { RHY.faceOff(ST.last && ST.last.res ? (ST.last.res.ans === null ? 'без ответа' : ST.last.res.ans === 0 ? 'верхний ответ' : 'нижний ответ') : ''); } catch (e) { /* — */ } });
  }, LC.SAY * 1000);
  return 'door';
}

export function init (api) {
  A = api;
  reload();
  if (typeof window !== 'undefined') window.setTimeout(() => { if (window.__dlv) window.__dlv.LOCALS = DEBUG; }, 0);
}
/** смена профиля (game.js reprofile): ничего не поставлено */
export function reload () { CUR = ''; FORCE = ''; }

/* для probe и песочницы: __dlv.LOCALS */
export const DEBUG = {
  LC, LOG, LOCALS, MEETS, ST,
  get state () {
    const sv = load();
    return { n: sv.n || 0, shift: cur(), cur: CUR, force: FORCE,
      p: Object.fromEntries(pool().map(h => { const r = rec(sv, h.id); return [h.id, { step: r.step, of: h.steps.length, last: r.last, ans: r.ans, key: r.key,
        next: r.step < h.steps.length ? h.steps[r.step].kind + ': ' + h.steps[r.step].what : 'всё' }]; })) };
  },
  get list () { return pool().map(h => h.id + ' — ' + t(h.name) + ': ' + h.steps.map(s => s.kind).join(' → ')); },
  /** с начала: все истории заново (адреса тоже) */
  reset () { save({ p: {}, n: 0 }); CUR = ''; FORCE = ''; LOG.length = 0; return this.state; },
  /** поставить шаг истории жителя (0…4) и ответы; last — 0, чтобы появление было уже в этой смене */
  step (id, n, ans) { const sv = load(); if (!BY[id]) return null; const r = rec(sv, id); r.step = Math.max(0, Math.min(BY[id].steps.length, +n || 0)); r.last = 0; if (ans) r.ans = ans; sv.p[id] = r; save(sv); CUR = ''; return this.state; },
  /** следующее появление жителя (на заказе подъёма, где ритм пускает встречу) — его, без очереди и лимита смены */
  force (id) { FORCE = BY[id] ? id : ''; CUR = ''; return FORCE; },
  /** окно разговора появления n жителя сейчас (без заказа, без денег) → { ans, tip } */
  play: (id, n) => { const h = BY[id]; if (!h) return null; const st = h.steps[+n || 0]; if (!st || st.kind !== 'door') return null; const r = rec(load(), id); return talk(h, talkOf(h, +n || 0, r), { pay: () => 0 }).then(res => (ST.last = { id, step: n, res })); },
  /** тексты появления (для проверки и доков) */
  lines (id, n) {
    const h = BY[id], st = h && h.steps[+n || 0];
    if (!st) return null;
    if (st.kind === 'errand') return { kind: 'errand', side: st.side };
    if (st.kind === 'meet') { const hero = LOCAL_HEROES.find(q => q.id === (st.hero || 'lc-' + id)); return { kind: 'meet', hero: hero.id, meets: hero.only.map(s => t(s.say) + ' | ' + t(s.a.me) + ' → ' + t(s.a.re) + ' | ' + t(s.b.me) + ' → ' + t(s.b.re)) }; }
    const ms = st.talks || [st.talk];
    return { kind: 'door', talks: ms.map(m => ({ s: m.s.map(l => speaker(h, l.w).name + ': ' + t(l.s)), a: m.a.map(q => t(q.a) + ' → ' + t(q.r) + (q.tip ? ' (+' + q.tip + ')' : '')) })) };
  },
};
