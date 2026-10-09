/* ──────────────────────────────────────────────────────────────────────────
   Герои города (docs/ORDERS.md «Герои города», план — docs/IDEAS.md).
   Этап 1: внешность, места в городе и реплики при встрече.

   Кто: Лёха Арбуз, Жека, Игорёк, Стёпа Тугарев, Настюша, Ариша, Андрюша — у каждого
   своя модель (люди из people.js + приметы кодом: химзавивка, облака электронки,
   каблуки, болгарка, кот на руках, ноутбук, ракетка) и имя над головой.

   Где: у каждого свои виды мест (DEFS[].places): гараж дяди Жени, спортплощадка
   (кортов в городе нет — теннисисты тренируются у коробок), кальянщики на лавочке,
   банкомат, пиццерия, кафе, магазин, АЗС, «рядом со Стёпой». Место выбирается в
   начале смены: в открытом районе и не дальше HERO.FAR (900 м) от пиццерии, где
   работаешь; иначе — ближайшее к ней. Постоял HERO.STAND (40—100 с) — гуляет по
   тротуару HERO.ROAM (8—28 м) в сторону и обратно.

   Встреча: машина ближе HERO.TALK_R (10 м) и медленнее HERO.TALK_KMH (15 км/ч) —
   пузырь с репликой на HERO.SAY_T (5 с). Один и тот же герой — не чаще раза в
   HERO.GAP (20 с), два разных — не чаще раза в HERO.GAP_ALL (4 с). Реплики —
   «мешком»: пока не сказал все, не повторяется, и одна и та же — никогда подряд.
   Первая встреча за всё время — знакомство (intro). Детская версия — только
   lines + kids, взрослая — lines + adult (мат — только в adult).

   Сбить: как прохожего (hits.js). Быстрее 20 км/ч — сбит (взрослая — лежит или
   разорвало, детская — полежал со звёздочками и ушёл); вернётся через HERO.BACK
   (120 с) на своё место, когда машина дальше HERO.BACK_R (80 м) — и при следующей
   встрече первым делом обида (hurt). Медленнее — упал и встал, сразу «эй!» (bump).

   Для следующих этапов (механики, главы):
     HEROES.list() / HEROES.get(id)   — где он, жив ли, у какого места стоит
     HEROES.sayLine(id, text)         — сказать своё (совет Лёхи, «наоборот» Игорька…)
     HEROES.setLineHook(fn)           — fn(hero) → строка или null: подменить реплику встречи
     HEROES.onMeet(fn)                — fn(hero, text) после каждой реплики встречи
     HEROES.person(id), HEROES.look(id) — человек и внешность (портреты, катсцены)
   Этап 2 (совет Лёхи, «наоборот» Игорька, Жека и Стёпа про твою машину) — heroquests.js:
   он подменяет реплики встречи через setLineHook. Прогноз Игорька на матч («проиграю» /
   «всех порву») живёт там же, поэтому в его обычных репликах его нет.
   api (game.js heroesApi): V, S, scene, CAREER, ADULT, CAR_L, CAR_W, Store, makeHuman,
     dropMesh, gibHuman, groundH, curbAt, inHouse, inBounds, nearestRoad, pushOut, emote,
     fxAdd, puffGeo, Snd, onRunOver, PIZZA, PIZZERIAS, PITCHES, BENCHES, CITY, garages, hookahSpots
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t, N_ } from '../i18n/index.js';
import * as DIST from './districts.js';
import * as HITS from './hits.js';
import * as TALK from './talk.js';             // облачка реплик (talk.js)
import { readTime } from './dialog.js';         // сколько читать реплику
import { makePerson } from './people.js';
import { makeCatModel, FURS } from './cats.js';

export const HERO = {
  SPAWN_R: 260, DROP_R: 330,       // модель в сцене, только пока машина ближе SPAWN_R; дальше DROP_R — убираем
  TALK_R: 10, TALK_KMH: 15,        // подъехал ближе 10 м и медленнее 15 км/ч — говорит
  SAY_T: 5,                        // пузырь висит, с
  GAP: 20,                         // один и тот же герой — не чаще, с
  GAP_ALL: 4,                      // два разных героя подряд — не чаще, с
  NAME_R: 45,                      // имя над головой — ближе, м
  BACK: 120, BACK_R: 80,           // сбит: вернётся через BACK с, когда машина дальше BACK_R м от его места
  FAR: 900,                        // место — не дальше, м от пиццерии, где работаешь
  APART: 30,                       // два героя не стоят ближе (кроме «рядом со Стёпой»), м
  STAND: [40, 100], ROAM: [8, 28], WALK: 1.1,
  // 04.10.2026: герои — сюжетные, на улице их нет. Место на смену по-прежнему выбирается (у него — дом
  // главы, herostories.js), но модель не ставится, встреч и реплик нет; сам герой — только в катсцене
  // своей главы. true — снова стоят и гуляют по городу, как в этапе 1
  STREET: false,
};
const KEY = 'dlv-heroes';           // сохранение: met — знакомы, grudge — кто обижен (сбил)

/* ─────────────── кто есть кто ─────────────── */
export const DEFS = [
  {
    id: 'leha', name: N_('Лёха Арбуз'), color: '#3f8a3a', seed: 0x1e4a0b, fem: false, h: 1.0,
    places: [['bank', 2], ['pizzeria', 2], ['shop', 1]],
    look: { age: 'young', hair: 'curly', hairC: '#6b4a2e', beard: 'stubble', stubble: true, head: 'none', glasses: 'none',
      shape: 'normal', fat: false, top: 'stripe', shirt: '#3f8a3a', stripe: '#1f4a24', bottom: 'pants', pants: '#2f3540',
      shoes: '#f4f1ea', mouth: 'smirk', brows: 'raised', pack: null, skin: '#f0c8a0', freckles: false, mole: -1, bg: '#a8d5a2' },
    intro: N_('Лёха Арбуз. Ставлю на всё, что шевелится.'),
    introKids: N_('Лёха Арбуз. Спорим, ты меня запомнишь?'),
    lines: [
      N_('Чувствую — сегодня мой день. Вчера тоже чувствовал.'),
      N_('Главное — вовремя остановиться. Я пока не понял когда.'),
      N_('Спорим, ты сейчас уедешь? …Я так и знал.'),
      N_('Я в плюсе. Если не считать минусы.'),
      N_('Поспорил, что дождя не будет. Зонт не взял. Принципиально.'),
    ],
    adult: [
      N_('Экспресс из двенадцати. Одиннадцать зашло. ОДИННАДЦАТЬ.'),
      N_('Нажал кэшаут — и они тут же забили. Назло мне.'),
      N_('Вчера поднял сорок косарей. Сегодня должен тридцать.'),
      N_('Всё, завязал. До пятницы.'),
      N_('Игорёк сказал, что всех порвёт. Я поставил. Ну ты понял.'),
      N_('Бля, опять минус. Ничего, отыграюсь.'),
      N_('Один заход — и я на Мальдивах. Или в жопе. Пятьдесят на пятьдесят.'),
      N_('Пиццу в долг привезёшь? С выигрыша верну. С какого-нибудь.'),
    ],
    kids: [
      N_('Поспорил на шоколадку, что Игорёк выиграет. Теперь я без шоколадки.'),
      N_('Спорим на щелбан, что угадаю счёт? …Ай.'),
      N_('Выиграл у Жеки три фантика! Проиграл четыре. Но три-то выиграл!'),
      N_('Всё, больше не спорю. До пятницы.'),
      N_('Один удачный спор — и я король двора. Или опять с щелбаном.'),
    ],
    hurt: [N_('Ты меня сбил! Чувствовал же — не мой день.')],
    hurtAdult: [N_('Ты меня сбил! А я ставил, что не собьёшь. Минус.'), N_('Ещё раз — и я на тебя ставить перестану.'), N_('Ты охуел? Я на тебя ставил!')],
    hurtKids: [N_('Ты меня сбил! А я спорил, что не собьёшь. Щелбан мне.'), N_('Эй! Я на тебя спорил!')],
  },
  {
    id: 'zheka', name: N_('Жека'), color: '#2e6bb8', seed: 0x2e6a11, fem: false, h: 1.02,
    places: [['garage', 3], ['fuel', 1]],
    look: { age: 'young', hair: 'short', hairC: '#a57a4a', browC: '#6b4a2e', beard: 'none', stubble: false, head: 'none', glasses: 'none',
      shape: 'normal', fat: false, top: 'jacket', jacket: '#2e4a6b', shirt: '#b8b2aa', bottom: 'pants', pants: '#39405c',
      shoes: '#1f1c1a', mouth: 'smile', brows: 'thick', pack: null, skin: '#f0c8a0', freckles: false, mole: -1, bg: '#8fb8de' },
    intro: N_('Я Жека. Батя мой — дядя Женя, гараж его знаешь.'),
    lines: [
      N_('На заводе опять премию обещали. Третий год обещают.'),
      N_('На АЭС экскурсию водили. Ничего не светится, я проверял.'),
      N_('Машину по звуку узнаю. Твою — по стуку.'),
      N_('Батя говорит, у тебя подвеска плачет. Я тоже слышу.'),
      N_('Китайские машины — это не машины, а телефоны на колёсах.'),
      N_('Жёлтая машина — это такси или цыплёнок. Ты не такси?'),
      N_('Смена с восьми до восьми. Зато в столовой котлеты — огонь.'),
      N_('Масло менял? По глазам вижу, что нет.'),
      N_('Коплю на «Ниву». Третий год. Как премию дадут.'),
      N_('Стуканёт — приезжай к бате. Только не в обед.'),
    ],
    adult: [
      N_('На проходной опять шмон. Будто я реактор домой вынесу.'),
      N_('Мастер орёт, как будто сам что-то делает. Заебал.'),
    ],
    kids: [
      N_('На проходной опять проверяют. Будто я реактор в кармане вынесу.'),
      N_('Мастер ворчит, как будто сам что-то делает.'),
    ],
    hurt: [N_('Батя узнает — тормоза тебе поменяет. Бесплатно. Обидно.'), N_('Ездишь, как на китайской.'), N_('Ты чё, тормоза пропил?')],
  },
  {
    id: 'igor', name: N_('Игорёк'), color: '#d9762c', seed: 77311, fem: false, h: 0.84,
    places: [['pitch', 3], ['shop', 1]],
    look: { age: 'young', hair: 'spiky', hairC: '#8a3b22', browC: '#8a3b22', freckles: true, beard: 'none', stubble: false, head: 'cap', headC: '#f4f1ea',
      capBack: true, glasses: 'none', top: 'tee', shirt: '#f4f1ea', bottom: 'shorts', pants: '#2b2a30', shoes: '#f4f1ea',
      mouth: 'open', brows: 'raised', skin: '#f6d7bd', shape: 'thin', fat: false, pack: null, mole: -1, bg: '#f2c57c' },
    intro: N_('Игорёк. Теннис, 3D-печать и облака — это всё я.'),
    introKids: N_('Игорёк. Теннис, 3D-печать и мыльные пузыри — это всё я.'),
    lines: [
      N_('Напечатал на 3D-принтере ракетку. Сломалась на первой подаче.'),
      N_('Печатаю себе кубок. Заранее. Чтоб не ждать.'),
      N_('Принтер печатал всю ночь. Должна была быть ладья.'),
      N_('Завтра матч. Я не готов. Я никогда не готов.'),
      N_('Сегодня я в форме. В смысле, в шортах.'),
      N_('Настюша говорит, что я подаю как бабушка. Бабушки сильные.'),
      N_('Напечатал брелок в виде себя. Похож. Только выше.'),
    ],
    adult: [
      N_('Затяжка — подача. Затяжка — подача. Это система.'),
      N_('Электронка — это не курение, это облачные технологии.'),
      N_('Андрюшу порву. Ну или он меня. Кто-то кого-то порвёт точно.'),
    ],
    kids: [
      N_('Пузырь — подача. Пузырь — подача. Это система.'),
      N_('Мыльные пузыри — это не баловство, это облачные технологии.'),
      N_('Андрюшу обыграю. Ну или он меня. Кто-то кого-то точно.'),
    ],
    hurt: [N_('Ты меня сбил! Теперь я точно проиграю. …Значит, выиграю?'), N_('Ничего, напечатаю себе новую ногу.')],
  },
  {
    id: 'stepa', name: N_('Стёпа Тугарев'), color: '#8a3b9a', seed: 0x5e7a11, fem: false, h: 1.18,
    places: [['hookah', 3], ['garage', 1]],
    look: { age: 'adult', hair: 'long', hairC: '#2a1d16', browC: '#2a1d16', beard: 'full', stubble: false, head: 'none', glasses: 'none',
      top: 'long', shirt: '#6b2e2e', bottom: 'pants', pants: '#2f3540', shoes: '#5a3a22', mouth: 'smile', brows: 'thick',
      skin: '#e8bb92', shape: 'normal', fat: false, pack: null, mole: -1, freckles: false, bg: '#c3a6e0' },
    intro: N_('Стёпа Тугарев. Кальяны, бизнес и болгарка — обращайся.'),
    introKids: N_('Стёпа Тугарев. Самовары, бизнес и болгарка — обращайся.'),
    lines: [
      N_('Бизнес вот-вот запустим. Осталось придумать какой.'),
      N_('Слушай, давай машину твою болгаркой распилим? Чисто посмотреть.'),
      N_('Помочь? Я всем помогаю. Болгарка с собой.'),
      N_('Инвестор уже почти согласился. Он просто пока не знает.'),
      N_('Из твоей машины выйдет два отличных кабриолета.'),
      N_('Бизнес-план готов. Пункт первый — бизнес.'),
      N_('Ариша просила собрать кровать. Собрал. Шесть лишних болтов — это запас.'),
      N_('Носки? Какие носки? Это бизнес-носки.'),
      N_('Всё будет, брат. Вот-вот. Чуть-чуть.'),
    ],
    adult: [
      N_('Открываю кальянную на колёсах. Твоя машина подойдёт, только крышу снимем.'),
      N_('Новый табак замешал: «Пепперони». Будущее, брат.'),
      N_('Нахуя машине крыша? Болгаркой — вжух, и кабриолет.'),
    ],
    kids: [
      N_('Открываю чайную на колёсах. Твоя машина подойдёт, только крышу снимем.'),
      N_('Новый чай заварил: «Пепперони». Будущее, брат.'),
      N_('Зачем машине крыша? Болгаркой — вжух, и кабриолет.'),
    ],
    hurt: [N_('Сбил — ладно. Но машину я тебе распилю, по-братски.'), N_('За такое болгарка — вне очереди.')],
    hurtAdult: [N_('Ах ты ж сука! Я ж тебе помогать хотел!')],
    hurtKids: [N_('Ну ты даёшь! Я ж тебе помогать хотел!')],
  },
  {
    id: 'nast', name: N_('Настюша'), color: '#d9406f', seed: 50923, fem: true, h: 0.84, heels: true,
    places: [['pitch', 2], ['cafe', 2]],
    look: { age: 'young', hair: 'ponytail', hairC: '#141414', browC: '#141414', tieC: '#e86f9a', head: 'none', glasses: 'none',
      top: 'dress', skirt: '#e86f9a', shirt: '#f4f1ea', bottom: 'skirt', legs: '#f0c8a0', shoes: '#c23a4a', eyes: 'lashes',
      lip: '#d9608a', blush: true, mouth: 'smile', brows: 'arched', skin: '#f0c8a0', shape: 'thin', fat: false, pack: null,
      freckles: false, mole: -1, bg: '#e8a0a8' },
    intro: N_('Настюша. Нет, каблуки не мешают. Ни теннису, ни танцам.'),
    lines: [
      N_('С утра теннис, вечером танцы. Ноги? Какие ноги?'),
      N_('Подаю двести в час. Ну, сто. Ну, сколько-то.'),
      N_('Каблуки на корт нельзя? А кто сказал?'),
      N_('Игорёк опять говорит, что проиграет. Не верь ему.'),
      N_('Выучила новую связку: бачата с подачей.'),
      N_('Я не маленькая, я компактная.'),
      N_('Танцы — это теннис, только без мячика.'),
      N_('Сломала каблук об сетку. Зато эйс!'),
      N_('Андрюша опять вайбкодит вместо тренировки.'),
      N_('Кто придумал удобную обувь? Скучный человек.'),
    ],
    adult: [
      N_('Вчера в клубе танцевала до шести. Утром — корт. Кофе, спаси.'),
      N_('Тренер сказал «колени мягче». Сам бы попробовал на шпильках, блин.'),
    ],
    kids: [
      N_('Вчера танцевала до ночи. Утром — корт. Какао, спаси.'),
      N_('Тренер сказал «колени мягче». Сам бы попробовал на каблуках!'),
    ],
    hurt: [N_('Каблук сломала из-за тебя! Новый — с тебя.'), N_('Хорошо, что я танцую. Упала красиво.')],
  },
  {
    id: 'arisha', name: N_('Ариша'), color: '#2f9a8a', seed: 0xa215a, fem: true, h: 1.1,
    places: [['stepa', 2], ['grocery', 2], ['pharm', 1]],
    look: { age: 'young', hair: 'long', hairC: '#a57a4a', browC: '#6b4a2e', head: 'none', glasses: 'none', top: 'long', shirt: '#7fb3e0',
      bottom: 'pants', pants: '#46506b', shoes: '#f4f1ea', mouth: 'smile', eyes: 'lashes', brows: 'thin', skin: '#f6d7bd',
      shape: 'thin', fat: false, pack: null, lip: null, freckles: false, mole: -1, bg: '#9fd3cf' },
    intro: N_('Ариша. А это Луша. Бизнес дома, у него сегодня не выходной.'),
    lines: [
      N_('Луша опять спала на пицце. Пицца не возражала.'),
      N_('Бизнес — это кот. Не путать со Стёпиным бизнесом: мой хотя бы есть.'),
      N_('Стёпа, носки! Носки, Стёпа!'),
      N_('Кровать собираем третий месяц. Пока спим на инструкции.'),
      N_('Бизнес съел провод от зарядки. Теперь он заряжен.'),
      N_('Луша — девочка. Бизнес — мальчик. Носки — Стёпины.'),
      N_('Увидишь Стёпу — передай: кровать сама себя не соберёт.'),
      N_('Коты не любят болгарку. Я тоже.'),
      N_('Пиццу не на пол! Там Бизнес. Он уже вышел на позицию.'),
      N_('Луша умеет открывать холодильник. Бизнес — закрывать. Командная работа.'),
    ],
    adult: [N_('Стёпа, блин, носки — в корзину. Это не бизнес-идея, это просьба.'), N_('Стёпа сказал «щас соберу». Это было в марте, сука.')],
    kids: [N_('Стёпа, ну носки же — в корзину! Это не бизнес-идея, это просьба.'), N_('Стёпа сказал «щас соберу». Это было в марте.')],
    hurt: [N_('Ты меня сбил! Хорошо, что Луша была на руках, а не под колёсами.'), N_('Коты такого не прощают. И я не прощу. До пятницы.')],
  },
  {
    id: 'andr', name: N_('Андрюша'), color: '#4a5ad0', seed: 41027, fem: false, h: 1.03,
    places: [['cafe', 2], ['pitch', 2]],
    look: { age: 'young', hair: 'long', hairC: '#4a3020', browC: '#4a3020', beard: 'stubble', stubble: true, head: 'none', glasses: 'square',
      glassC: '#1d1a1f', top: 'long', shirt: '#2b2a30', bottom: 'pants', pants: '#39405c', shoes: '#f4f1ea', mouth: 'smirk',
      brows: 'thick', skin: '#e8bb92', shape: 'normal', fat: false, pack: '#3f7fd6', freckles: false, mole: -1, bg: '#b8c4d6' },
    intro: N_('Андрюша. Я не программист, я вайбкодер. Разница — в вайбе.'),
    lines: [
      N_('Попросил нейросеть написать игру. Она написала. Про пиццу.'),
      N_('Я не пишу код. Я его вайблю.'),
      N_('Пять минут вайбкодинга — и два часа читать, что он там навайбил.'),
      N_('Сказал «сделай красиво» — сделала. Не запускается, зато красиво.'),
      N_('Тренировка? Сейчас, только агент допишет.'),
      N_('Делаю стартап: приложение, которое делает приложения.'),
      N_('Ракетка — в рюкзаке, ноутбук — в руках. Приоритеты.'),
      N_('Код пишет нейросеть, тесты — тоже нейросеть. Я — вайб.'),
      N_('Игорёк говорит, что проиграет. В коде такое зовут «баг-фича».'),
      N_('Отдал агенту задачу и пошёл гулять. Агент, похоже, тоже.'),
    ],
    adult: [N_('Нейронка опять снесла прод. Да и хуй с ним, вайб важнее.')],
    kids: [N_('Нейросеть опять всё удалила. Ну и ладно, вайб важнее.')],
    hurt: [N_('Ты меня сбил! Хорошо, что ноутбук цел. Я — потом.'), N_('Надо было вайбкодить дома.')],
  },
];
/* лёгкий толчок (упал и встал) — сразу, без очереди */
const BUMP = [N_('Эй! Смотри, куда едешь!'), N_('Аккуратней! Я вообще-то герой!'), N_('Ты чего толкаешься?')];
const BUMP_ADULT = [N_('Ты чё, бля?!')];
const BUMP_KIDS = [N_('Ну ты чего?!')];

const BY_ID = new Map(DEFS.map(d => [d.id, d]));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

let A = null;
const M = {
  ready: false, heroes: [], session: null, pz: null, gapAll: 0, checkT: 0,
  save: { met: {}, grudge: {} }, hook: null, meet: [], held: {},
  stats: { said: 0, hits: 0, falls: 0, back: 0, built: 0 },
};

/* ─────────────── человек и внешность ─────────────── */
const PERSONS = new Map();
export function person (id) {
  const d = BY_ID.get(id);
  if (!d) return null;
  let p = PERSONS.get(id);
  if (!p) {
    p = makePerson({ seed: d.seed, fem: d.fem, first: t(d.name) });
    Object.assign(p.look, d.look);
    p.hero = id;
    PERSONS.set(id, p);
  }
  return p;
}
export const look = id => (BY_ID.has(id) ? Object.assign({}, BY_ID.get(id).look) : null);

/* общие материалы реквизита: dropMesh их не трогает (keep) */
const MATS = new Map();
const mat = (hex, o = {}) => {
  const k = hex + JSON.stringify(o);
  let m = MATS.get(k);
  if (!m) { m = new THREE.MeshLambertMaterial(Object.assign({ color: hex, flatShading: true }, o)); m.userData.keep = true; MATS.set(k, m); }
  return m;
};
const bx = (w, h, d, hex, x, y, z, parent, o) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(hex, o));
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
};
/* ракетка: ручка, обод, струны. В группе — ручка вниз от начала координат */
function racket (hex) {
  const g = new THREE.Group();
  bx(0.035, 0.24, 0.035, '#2b2a30', 0, -0.12, 0, g);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 4, 14), mat(hex));
  rim.position.set(0, -0.38, 0); rim.rotation.y = Math.PI / 2;
  g.add(rim);
  bx(0.008, 0.24, 0.22, '#f4f1ea', 0, -0.38, 0, g);
  return g;
}

/* приметы каждого: что держит и что на нём. u — userData модели (руки, голова) */
const EXTRA = {
  leha (H, u) {
    // химзавивка: мелкие кудри шапкой поверх «кудрявой» причёски
    const c = H.def.look.hairC;
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2, r = i % 2 ? 0.27 : 0.22;
      bx(0.12, 0.12, 0.12, c, Math.cos(a) * r, 0.33 + (i % 3) * 0.04, Math.sin(a) * r - 0.02, u.head);
    }
    for (let i = 0; i < 5; i++) bx(0.13, 0.13, 0.13, c, (i - 2) * 0.1, 0.43, -0.02 + (i % 2) * 0.08, u.head);
    // телефон с купоном
    H.phone = bx(0.08, 0.14, 0.02, '#1b1b20', 0, -0.58, 0.07, u.armR);
    bx(0.06, 0.1, 0.004, '#7fe08a', 0, -0.58, 0.082, u.armR, { emissive: '#2a6a30' });
  },
  zheka (H, u) {
    // пропуск завода на груди
    bx(0.09, 0.06, 0.01, '#e0b13f', 0.1, 1.17, 0.145, H.grp);
    bx(0.07, 0.025, 0.012, '#f4f1ea', 0.1, 1.165, 0.147, H.grp);
  },
  igor (H, u) {
    const r = racket('#e0703f');
    r.position.set(0, -0.5, 0.05);
    u.armL.add(r);
    if (A.ADULT) {                                     // электронка
      bx(0.04, 0.11, 0.025, '#3f7fd6', 0, -0.58, 0.07, u.armR);
      bx(0.03, 0.03, 0.03, '#1b1b20', 0, -0.5, 0.07, u.armR);
    } else {                                           // палочка для мыльных пузырей
      bx(0.02, 0.22, 0.02, '#e86f9a', 0, -0.62, 0.07, u.armR);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 4, 10), mat('#e86f9a'));
      ring.position.set(0, -0.76, 0.07);
      u.armR.add(ring);
    }
  },
  stepa (H, u) {
    // болгарка: корпус, рукоять, круг и кожух
    const g = new THREE.Group();
    bx(0.08, 0.08, 0.3, '#e0703f', 0, 0, 0, g);
    bx(0.05, 0.05, 0.12, '#2b2a30', 0, 0, -0.2, g);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.012, 12), mat('#9a9aa2'));
    disc.position.set(0.06, 0, 0.12); disc.rotation.z = Math.PI / 2;
    g.add(disc);
    bx(0.03, 0.14, 0.09, '#4a4f58', 0.08, 0.05, 0.12, g);
    g.position.set(0, -0.58, 0.12);
    u.armR.add(g);
    H.grinder = g; H.disc = disc;
  },
  nast (H, u) {
    // оочень высокие каблуки: под каждой ногой шпилька и подошва под углом, вся модель выше
    for (const leg of [u.legL, u.legR]) {
      bx(0.035, 0.25, 0.035, '#c23a4a', 0, -0.825, -0.07, leg);        // шпилька под пяткой
      bx(0.13, 0.25, 0.08, '#c23a4a', 0, -0.825, 0.12, leg);           // платформа под носком; между ними — просвет
    }
    H.lift = 0.25;
    const r = racket('#59b06a');
    r.position.set(0, -0.5, 0.05);
    u.armR.add(r);
  },
  arisha (H, u) {
    // кот на руках: Луша (серая) или Бизнес (рыжий) — по смене
    const fur = FURS[H.cat % FURS.length] || FURS[0];
    const cat = makeCatModel(THREE, fur, true);
    cat.scale.setScalar(0.85);
    cat.position.set(0, 0.86, 0.22);
    cat.rotation.y = Math.PI / 2;
    H.grp.add(cat);
    H.catM = cat;
  },
  andr (H, u) {
    // открытый ноутбук в руках и ракетка из рюкзака
    const g = new THREE.Group();
    bx(0.36, 0.02, 0.24, '#3a3d44', 0, 0, 0, g);
    const lid = new THREE.Group();
    lid.position.set(0, 0.01, -0.12); lid.rotation.x = -0.35;
    bx(0.36, 0.24, 0.015, '#3a3d44', 0, 0.12, 0, lid);
    bx(0.32, 0.2, 0.004, '#7fd0ff', 0, 0.12, 0.01, lid, { emissive: '#2a5a8a' });
    g.add(lid);
    g.position.set(0, 0.95, 0.34);
    H.grp.add(g);
    const r = racket('#3f7fd6');
    r.position.set(0.1, 1.55, -0.22); r.rotation.z = 0.25;
    H.grp.add(r);
  },
};

/* ─────────────── надписи: имя и пузырь ─────────────── */
const FONT = '"Press Start 2P", sans-serif';
const TAGS = new Map();
function tagTex (H) {
  const k = H.def.id;
  if (TAGS.has(k)) return TAGS.get(k);
  const c = document.createElement('canvas');
  c.width = 256; c.height = 56;
  const x = c.getContext('2d');
  const name = t(H.def.name);
  let fs = 24;
  x.font = 'bold ' + fs + 'px ' + FONT;
  while (fs > 12 && x.measureText(name).width > 228) { fs -= 2; x.font = 'bold ' + fs + 'px ' + FONT; }
  const w = Math.min(248, x.measureText(name).width + 24);
  x.fillStyle = 'rgba(20,20,26,0.72)';
  x.beginPath(); x.roundRect(128 - w / 2, 6, w, 44, 12); x.fill();
  x.fillStyle = H.def.color; x.fillRect(128 - w / 2 + 8, 44, w - 16, 3);
  x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(name, 128, 28);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  TAGS.set(k, tx);
  return tx;
}
function dropBubble (H) {
  if (!H.bubble) return;
  if (H.grp) H.grp.remove(H.bubble);
  H.bubble.material.dispose();                     // текстура — общая из talk.js
  H.bubble = null;
}
/* сказать: пузырь над головой на HERO.SAY_T с — длинную реплику дольше, пока не прочитать (readTime) */
function say (H, text, ttl = HERO.SAY_T) {
  if (!H.grp || !text) return false;
  dropBubble(H);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: TALK.tex(String(text), H.def.color, t(H.def.name)), transparent: true, depthWrite: false }));
  sp.position.set(0, 2.85 + (H.lift || 0), 0);
  H.grp.add(sp);
  TALK.track(sp);                                  // читаемая плашка с именем, размер по расстоянию (talk.js)
  H.bubble = sp; H.bubT = Math.max(ttl, readTime(text)); H.talk = Math.min(ttl, 2.5);
  H.log.push(text);
  if (H.log.length > 40) H.log.shift();
  if (A.Snd && A.Snd.fx) A.Snd.fx(H.def.fem ? 'talk-f' : 'talk-m', s => s.blip(H.def.fem ? 640 : 380, 0.06, 'triangle', 0.08));
  return true;
}

/* ─────────────── реплики ─────────────── */
const poolOf = d => d.lines.concat(A.ADULT ? d.adult || [] : d.kids || []);
const hurtOf = d => d.hurt.concat(A.ADULT ? d.hurtAdult || [] : d.hurtKids || []);
function bagLine (H) {
  const pool = poolOf(H.def);
  if (!H.bag.length) {
    H.bag = pool.map((_, i) => i);
    for (let i = H.bag.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [H.bag[i], H.bag[j]] = [H.bag[j], H.bag[i]]; }
    // новый мешок не начинается с той, что была последней
    if (H.bag.length > 1 && H.bag[H.bag.length - 1] === H.last) [H.bag[0], H.bag[H.bag.length - 1]] = [H.bag[H.bag.length - 1], H.bag[0]];
  }
  H.last = H.bag.pop();
  return pool[H.last];
}
function meetLine (H) {
  const d = H.def, id = d.id;
  if (M.hook) { try { const s = M.hook(api(H)); if (s) return { text: s, kind: 'hook' }; } catch (e) { console.error('[heroes] hook', e); } }
  if (M.save.grudge[id]) { delete M.save.grudge[id]; save(); return { text: t(pick(hurtOf(d))), kind: 'hurt' }; }
  if (!M.save.met[id]) { M.save.met[id] = 1; save(); return { text: t(!A.ADULT && d.introKids ? d.introKids : d.intro), kind: 'intro' }; }
  return { text: t(bagLine(H)), kind: 'line' };
}
function load () {
  try {
    const v = A.Store && A.Store.get(KEY, null);
    if (v && typeof v === 'object') M.save = { met: Object.assign({}, v.met), grudge: Object.assign({}, v.grudge) };
  } catch (e) { /* — */ }
}
function save () { try { if (A.Store) A.Store.set(KEY, M.save); } catch (e) { /* — */ } }
/** сменили профиль без перезагрузки (game.js reprofile): знакомства и обиды — нового профиля */
export function reloadSave () { M.save = { met: {}, grudge: {} }; if (A) load(); }

/* ─────────────── места ─────────────── */
/* точка на тротуаре у улицы рядом с (x, z): лицом к дороге; tx/tz — вдоль улицы (гулять) */
function curbSpot (x, z, along = 0) {
  const r = A.nearestRoad(x, z, 5, 4);
  if (!r) return null;
  const s = r.seg, sl = Math.hypot(s.x2 - s.x1, s.z2 - s.z1) || 1, tx = (s.x2 - s.x1) / sl, tz = (s.z2 - s.z1) / sl;
  let nx = -tz, nz = tx;
  if ((x - r.x) * nx + (z - r.z) * nz < 0) { nx = -nx; nz = -nz; }
  const off = s.w / 2 + 1.6;
  for (const k of [0, 1, -1, 2, -2]) {
    const a = along + k * 4;
    const px = r.x + nx * off + tx * a, pz = r.z + nz * off + tz * a;
    if (A.inHouse(px, pz, 0.6) || !A.inBounds(px, pz, 5)) continue;
    return { x: px, z: pz, h: Math.atan2(-nx, -nz), tx, tz };
  }
  return null;
}
/* свободная точка рядом с (x, z), лицом к (fx, fz); вдоль — по ближайшей улице */
function freeSpot (x, z, lookX, lookZ) {
  if (A.inHouse(x, z, 0.6) || !A.inBounds(x, z, 5)) return null;
  const r = A.nearestRoad(x, z, 5, 4);
  if (r && r.d < r.seg.w / 2 + 0.8) return null;
  let tx = 1, tz = 0;
  if (r) { const s = r.seg, sl = Math.hypot(s.x2 - s.x1, s.z2 - s.z1) || 1; tx = (s.x2 - s.x1) / sl; tz = (s.z2 - s.z1) / sl; }
  return { x, z, h: Math.atan2(lookX - x, lookZ - z), tx, tz };
}
const POI_KIND = { bank: ['bank'], shop: ['shop'], cafe: ['cafe', 'food'], grocery: ['grocery'], pharm: ['pharm'], fuel: ['fuel'] };
const CANDS = new Map();
function cands (kind) {
  if (CANDS.has(kind)) return CANDS.get(kind);
  const out = [];
  const push = s => { if (s) { s.kind = kind; out.push(s); } };
  if (kind === 'garage') {
    for (const g of (A.garages && A.garages()) || []) {
      const x = g.ox + g.fx * 2.5 + g.rx * 4.4, z = g.oz + g.fz * 2.5 + g.rz * 4.4;
      push(freeSpot(x, z, x + g.fx, z + g.fz) || freeSpot(g.ox + g.fx * 3, g.oz + g.fz * 3, g.ox + g.fx * 9, g.oz + g.fz * 9));
    }
  } else if (kind === 'pitch') {
    for (const p of A.PITCHES || []) {
      // со стороны, что ближе к улице: за заборчиком, лицом к полю
      const opts = [[p.nx, p.nz, p.W / 2 + 3], [-p.nx, -p.nz, p.W / 2 + 3], [p.ux, p.uz, p.L / 2 + 3], [-p.ux, -p.uz, p.L / 2 + 3]]
        .map(([ax, az, k]) => [p.cx + ax * k, p.cz + az * k])
        .map(([x, z]) => ({ x, z, r: A.nearestRoad(x, z, 5, 4) }))
        .sort((a, b) => (a.r ? a.r.d : 999) - (b.r ? b.r.d : 999));
      for (const o of opts) { const s = freeSpot(o.x, o.z, p.cx, p.cz); if (s) { push(s); break; } }
    }
  } else if (kind === 'hookah') {
    for (const s of (A.hookahSpots && A.hookahSpots()) || []) {
      const b = s.b;
      for (const a of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
        const an = (b.ry || 0) + a, x = b.x + Math.sin(an) * 2.6, z = b.z + Math.cos(an) * 2.6;
        const sp = freeSpot(x, z, b.x, b.z);
        if (sp) { sp.bench = b; push(sp); break; }
      }
    }
  } else if (kind === 'pizzeria') {
    for (const p of A.PIZZERIAS || []) if (p) push(curbSpot(p.x, p.z, 12) || curbSpot(p.x, p.z, -12));
  } else if (POI_KIND[kind]) {
    for (const p of A.CITY.pois || []) if (POI_KIND[kind].includes(p.k)) push(curbSpot(p.p[0], p.p[1], rand(-3, 3)));
  }
  CANDS.set(kind, out);
  return out;
}
const pzPos = () => { const P = A.PIZZA; return P ? { x: P.x, z: P.z } : { x: A.V.x, z: A.V.z }; };
const openAt = (x, z) => !DIST.has() || DIST.isOpen(DIST.at(x, z));
/* место героя на эту смену */
function choose (H, taken) {
  const d = H.def, pz = pzPos();
  const far = (x, z) => Math.hypot(x - pz.x, z - pz.z);
  const free = s => taken.every(o => Math.hypot(o.x - s.x, o.z - s.z) > HERO.APART);
  const opts = [];
  for (const [kind, w] of d.places) {
    let list;
    if (kind === 'stepa') {
      const st = M.heroes.find(h => h.def.id === 'stepa');
      const s = st && (st.next || st.home);
      list = s ? [freeSpot(s.x + s.tx * 2.2, s.z + s.tz * 2.2, s.x, s.z) || freeSpot(s.x - s.tx * 2.2, s.z - s.tz * 2.2, s.x, s.z)].filter(Boolean).map(q => Object.assign(q, { kind })) : [];
    } else list = cands(kind).filter(s => free(s) && openAt(s.x, s.z) && far(s.x, s.z) < HERO.FAR);
    if (list.length) opts.push({ list, w, kind });
  }
  if (opts.length) {
    let r = Math.random() * opts.reduce((s, o) => s + o.w, 0);
    let o = opts[0];
    for (const q of opts) if ((r -= q.w) < 0) { o = q; break; }
    // ближние к пиццерии — чаще: из четырёх ближайших
    const near = o.list.slice().sort((a, b) => far(a.x, a.z) - far(b.x, b.z)).slice(0, 4);
    return pick(near);
  }
  // ничего рядом: ближайшее своё в открытом районе — или тротуар у пиццерии
  let best = null, bd = Infinity;
  for (const [kind] of d.places) for (const s of kind === 'stepa' ? [] : cands(kind)) {
    if (!openAt(s.x, s.z) || !free(s)) continue;
    const v = far(s.x, s.z);
    if (v < bd) { bd = v; best = s; }
  }
  if (best) return best;
  const i = DEFS.indexOf(d);
  const s = curbSpot(pz.x, pz.z, (i - 3) * 14);
  if (s) s.kind = 'street';
  return s;
}
function repick () {
  const taken = [];
  for (const H of M.heroes) {
    const s = choose(H, taken.filter(q => !(H.def.id === 'arisha' && q.hero === 'stepa')));
    if (s) { s.hero = H.def.id; taken.push(s); }
    H.next = s || H.home;
    if (!H.grp) place(H);
  }
}
/* переехать на новое место — только когда его не видно */
function place (H) {
  if (!H.next) return;
  H.home = H.next; H.next = null;
  H.x = H.home.x; H.z = H.home.z; H.h = H.home.h;
  H.st = 'stand'; H.t = rand(...HERO.STAND); H.target = null;
  if (H.def.id === 'arisha') H.cat = (H.cat || 0) + 1;
}

/* ─────────────── модель ─────────────── */
function build (H) {
  const p = person(H.def.id);
  const grp = A.makeHuman(p, { h: H.def.h });
  H.grp = grp; H.u = grp.userData; H.lift = 0;
  H.phone = H.grinder = H.disc = H.catM = null;
  try { EXTRA[H.def.id] && EXTRA[H.def.id](H, H.u); } catch (e) { console.error('[heroes] extra', e); }
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex(H), transparent: true, depthWrite: false }));
  tag.scale.set(1.9, 0.42, 1);
  tag.position.set(0, 2.3 + H.lift, 0);
  grp.add(tag);
  H.tag = tag;
  A.scene.add(grp);
  H.live = true;
  M.stats.built++;
  pose(H, 0);
}
function unbuild (H) {
  if (!H.grp) return;
  dropBubble(H);
  A.dropMesh(H.grp);
  H.grp = null; H.u = null; H.tag = null; H.live = false; H.fall = null;
}

/* ─────────────── шаг ─────────────── */
function pose (H, dt) {
  const u = H.u, V = A.V;
  const d = Math.hypot(V.x - H.x, V.z - H.z);
  const walk = H.st === 'walk';
  H.ph += dt * (walk ? 7 : 1.6);
  const sw = walk ? Math.sin(H.ph) * 0.6 : 0;
  u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
  const talk = H.talk > 0;
  let aL = walk ? sw * 0.5 : 0, aR = walk ? -sw * 0.5 : 0;
  if (talk) aL = -0.9 + Math.sin(H.ph * 5) * 0.35;                   // машет рукой, пока говорит
  u.head.rotation.x = 0;
  const id = H.def.id;
  if (id === 'leha') { aR = talk ? -0.5 : -1.05; if (!talk && d > 12) u.head.rotation.x = 0.25; }
  else if (id === 'igor') {
    aL = -0.35;
    const k = H.drag > 0 ? Math.sin(Math.min(1, (1.4 - H.drag) / 0.5) * Math.PI / 2) : 0;
    aR = -0.4 - k * 1.9;
  } else if (id === 'stepa') {
    aR = talk ? -1.2 + Math.sin(H.ph * 4) * 0.2 : -0.45;
    if (H.disc) H.disc.rotation.y += dt * (talk ? 60 : 0);
  } else if (id === 'nast') {
    aR = -0.3;
    if (!walk) H.grp.rotation.z = talk ? Math.sin(H.ph * 6) * 0.06 : 0;    // пританцовывает
  } else if (id === 'arisha') {
    aL = aR = -1.15;
    if (H.catM) { const cu = H.catM.userData; if (cu.tail) cu.tail.rotation.z = Math.sin(H.ph * 1.7) * 0.5; if (cu.head) cu.head.rotation.y = Math.sin(H.ph * 0.6) * 0.5; }
  } else if (id === 'andr') {
    aL = aR = -1.0;
    if (!talk && d > 14) u.head.rotation.x = 0.35;                         // уткнулся в ноутбук
  }
  u.armL.rotation.x = aL; u.armR.rotation.x = aR;
  // смотрит на машину, если она рядом; иначе — куда шёл или на улицу
  let want = H.home ? H.home.h : H.h;
  if (walk && H.target) want = Math.atan2(H.target.x - H.x, H.target.z - H.z);
  else if (d < 25) want = Math.atan2(V.x - H.x, V.z - H.z);
  H.h = damp(H.h, H.h + wrap(want - H.h), 5, dt);
  H.grp.position.set(H.x, A.groundH(H.x, H.z) + (A.curbAt ? A.curbAt(H.x, H.z) : 0) + H.lift * H.grp.scale.y, H.z);
  H.grp.rotation.y = H.h;
}
/* облако электронки (взрослая) или мыльные пузыри (детская) — изо рта, вперёд */
let BUBBLE_GEO = null;
function exhale (H) {
  if (!A.fxAdd || !H.grp) return;
  const fx = Math.sin(H.h), fz = Math.cos(H.h), s = H.grp.scale.y;
  const y = A.groundH(H.x, H.z) + 1.5 * s;
  if (A.ADULT) {
    for (let k = 0; k < 9; k++) {
      const m = new THREE.Mesh(A.puffGeo, new THREE.MeshBasicMaterial({ color: k % 3 ? 0xeceae6 : 0xf8f7f4, transparent: true, opacity: 0.65, depthWrite: false }));
      m.position.set(H.x + fx * (0.3 + k * 0.1), y + rand(-0.05, 0.12), H.z + fz * (0.3 + k * 0.1));
      m.scale.setScalar(rand(0.45, 0.7));
      // облако больше кальянного: к концу метра четыре, уже прозрачное
      A.fxAdd(m, { vx: fx * rand(0.6, 1.2) + rand(-0.4, 0.4), vz: fz * rand(0.6, 1.2) + rand(-0.4, 0.4), vy: rand(0.4, 0.8), life: rand(3, 4.5), max: 4.5, grow: 0.55 });
    }
  } else {
    if (!BUBBLE_GEO) BUBBLE_GEO = new THREE.SphereGeometry(0.1, 8, 6);
    const cols = [0xbfe6ff, 0xffd1ec, 0xd8ffd0, 0xfff3b0];
    for (let k = 0; k < 10; k++) {
      const m = new THREE.Mesh(BUBBLE_GEO, new THREE.MeshBasicMaterial({ color: cols[k % 4], transparent: true, opacity: 0.55, depthWrite: false }));
      m.position.set(H.x + fx * 0.6, y - 0.1, H.z + fz * 0.6);
      m.scale.setScalar(rand(0.6, 1.6));
      A.fxAdd(m, { vx: fx * rand(0.4, 1.2) + rand(-0.6, 0.6), vz: fz * rand(0.4, 1.2) + rand(-0.6, 0.6), vy: rand(0.2, 0.6), life: rand(2.5, 4), max: 4, grow: 0 });
    }
  }
}

function knock (H, kmh) {
  const V = A.V;
  M.stats.hits++;
  dropBubble(H);
  A.gibHuman({ x: H.x, z: H.z, grp: H.grp }, V.vx, V.vz, kmh);
  unbuild(H);
  if (A.onRunOver) A.onRunOver();
  H.down = HERO.BACK;
  M.save.grudge[H.def.id] = 1; save();
}

function heroStep (H, dt) {
  const V = A.V, sp = Math.hypot(V.vx, V.vz), kmh = sp * 3.6;
  const d = Math.hypot(V.x - H.x, V.z - H.z);
  H.sayCd = Math.max(0, H.sayCd - dt);
  H.talk = Math.max(0, H.talk - dt);
  if (H.bubble && (H.bubT -= dt) <= 0) dropBubble(H);
  if (H.tag) H.tag.visible = !H.bubble && d < HERO.NAME_R;

  // упал от лёгкого толчка: лежит и встаёт (hits.js), потом «эй!»
  if (H.fall) {
    if (HITS.fallStep(H, dt)) return;
    H.grp.rotation.z = 0;
    say(H, t(pick(BUMP.concat(A.ADULT ? BUMP_ADULT : BUMP_KIDS))), 3);
    H.sayCd = HERO.GAP;
  }

  // гуляет: постоял — прошёлся вдоль улицы и обратно (если машины рядом нет)
  H.t -= dt;
  if (H.st === 'stand' && H.t <= 0 && d > 25 && H.home) {
    const back = Math.hypot(H.x - H.home.x, H.z - H.home.z) > 2;
    let tg = back ? { x: H.home.x, z: H.home.z } : null;
    for (let k = 0; !tg && k < 6; k++) {
      const a = rand(...HERO.ROAM) * (Math.random() < 0.5 ? -1 : 1);
      const x = H.home.x + H.home.tx * a, z = H.home.z + H.home.tz * a;
      if (!A.inHouse(x, z, 0.6) && A.inBounds(x, z, 5)) tg = { x, z };
    }
    if (tg) { H.st = 'walk'; H.target = tg; } else H.t = rand(...HERO.STAND);
  } else if (H.st === 'walk') {
    const dx = H.target.x - H.x, dz = H.target.z - H.z, l = Math.hypot(dx, dz);
    if (l < 0.3 || d < 9) { H.st = 'stand'; H.t = d < 9 ? 6 : rand(...HERO.STAND); }    // машина подъехала — остановился
    else {
      const st = Math.min(l, HERO.WALK * dt);
      H.x += dx / l * st; H.z += dz / l * st;
      if (A.pushOut) A.pushOut(H, 0.4);
    }
  }

  // Игорёк: затяжка (взрослая) или мыльные пузыри (детская) раз в 3—6 с
  if (H.def.id === 'igor') {
    H.drag = Math.max(0, (H.drag || 0) - dt);
    if ((H.puffT = (H.puffT || rand(1, 3)) - dt) <= 0) {
      H.puffT = rand(3, 6); H.drag = 1.4;
      H.exT = 0.9;
    }
    if (H.exT > 0 && (H.exT -= dt) <= 0 && d < 120) exhale(H);
  }

  pose(H, dt);

  // встреча: подъехал близко и медленно
  if (d < HERO.TALK_R && kmh < HERO.TALK_KMH && H.sayCd <= 0 && M.gapAll <= 0 && A.S.state !== 'over' && A.S.state !== 'dying') {
    const L = meetLine(H);
    if (say(H, L.text)) {
      H.sayCd = HERO.GAP; M.gapAll = HERO.GAP_ALL; M.stats.said++;
      H.kinds.push(L.kind); if (H.kinds.length > 40) H.kinds.shift();
      for (const f of M.meet) { try { f(api(H), L.text, L.kind); } catch (e) { console.error('[heroes] meet', e); } }
    }
  }

  // наезд — тем же прямоугольником кузова, что и прохожие (game.js underCar)
  const fx = Math.sin(V.h), fz = Math.cos(V.h), ex = H.x - V.x, ez = H.z - V.z;
  const al = ex * fx + ez * fz, ac = ex * fz - ez * fx;
  const HL = (A.CAR_L || 2.2) + 0.5, HW = (A.CAR_W || 1) + 0.35;
  if (Math.abs(al) < HL && Math.abs(ac) < HW) {
    if (kmh >= HITS.TIER.FALL) { knock(H, kmh); return; }
    if (sp > 3 && !H.fall) { M.stats.falls++; dropBubble(H); HITS.fall(H, V.vx, V.vz); return; }
    // ползком — машина его отодвигает, а не проезжает сквозь
    const outW = HW - Math.abs(ac) + 0.05, outL = HL - Math.abs(al) + 0.05;
    if (outW <= outL) { const k = ac >= 0 ? outW : -outW; H.x += fz * k; H.z -= fx * k; }
    else { const k = al >= 0 ? outL : -outL; H.x += fx * k; H.z += fz * k; }
    if (A.pushOut) A.pushOut(H, 0.4);
  }
}

function init () {
  if (M.ready) return true;
  if (!A.garages || !(A.PITCHES || []).length && !(A.CITY.pois || []).length) return false;
  load();
  M.heroes = DEFS.map(def => ({
    def, home: null, next: null, x: 0, z: 0, h: 0, st: 'stand', t: 0, target: null, ph: Math.random() * 9,
    grp: null, u: null, tag: null, bubble: null, bubT: 0, talk: 0, sayCd: 0, live: false, down: 0, fall: null,
    bag: [], last: -1, log: [], kinds: [], lift: 0, cat: (Math.random() * 2) | 0,
  }));
  M.ready = true;
  return true;
}

export function step (dt, api) {
  if (api) A = api;
  if (!A) return;
  if (typeof window !== 'undefined' && window.__dlv && !window.__dlv.HEROES) window.__dlv.HEROES = DEBUG;
  const S = A.S;
  if (!S || S.state === 'title') return;
  if (!init()) return;
  // новая смена или другая пиццерия — новые места
  const ses = DIST.session(), pz = A.PIZZA;
  if (ses !== M.session || pz !== M.pz) { M.session = ses; M.pz = pz; repick(); }
  M.gapAll = Math.max(0, M.gapAll - dt);
  const V = A.V;
  if ((M.checkT -= dt) <= 0) {
    M.checkT = 0.5;
    for (const H of M.heroes) {
      if (H.down > 0) {
        H.down -= 0.5;
        if (H.down <= 0) {
          const back = H.home ? Math.hypot(H.home.x - V.x, H.home.z - V.z) : 0;
          if (back < HERO.BACK_R) H.down = 0.5;                 // на глазах из воздуха не появляется
          else { M.stats.back++; if (!H.next) H.next = H.home; place(H); }
        }
        continue;
      }
      if (!HERO.STREET || M.held[H.def.id]) { if (H.grp) unbuild(H); continue; }   // на улице не стоят (HERO.STREET) / играет в главе (herostories.js)
      if (!H.home && H.next) place(H);
      if (!H.home) continue;
      const d = Math.hypot(H.x - V.x, H.z - V.z);
      if (!H.grp && d < HERO.SPAWN_R) { if (H.next) place(H); build(H); }
      else if (H.grp && d > HERO.DROP_R) { unbuild(H); if (H.next) place(H); }
    }
  }
  for (const H of M.heroes) if (H.grp) heroStep(H, dt);
}

/* ─────────────── для механик и глав ─────────────── */
function api (H) {
  return { id: H.def.id, name: t(H.def.name), x: H.x, z: H.z, place: H.home ? H.home.kind : null, live: !!H.grp, down: H.down > 0, met: !!M.save.met[H.def.id], grudge: !!M.save.grudge[H.def.id] };
}
const byId = id => M.heroes.find(H => H.def.id === id) || null;
export const list = () => M.heroes.map(api);
export const get = id => { const H = byId(id); return H ? api(H) : null; };
export function sayLine (id, text, ttl) { const H = byId(id); return H ? say(H, text, ttl) : false; }
export function setLineHook (fn) { M.hook = typeof fn === 'function' ? fn : null; }
export function onMeet (fn) { if (typeof fn === 'function') M.meet.push(fn); }
/* глава истории (herostories.js): герой ждёт у подъезда актёром катсцены — на улице его прячем */
export function hold (id, on) {
  if (!!M.held[id] === !!on) return;
  if (on) M.held[id] = 1; else delete M.held[id];
  const H = byId(id);
  if (on && H && H.grp) unbuild(H);
}
/* модель героя со всеми приметами (болгарка, кот, химзавивка…) — без имени над головой: для катсцен */
export function model (id) {
  const d = BY_ID.get(id);
  if (!d || !A) return null;
  const F = { def: d, grp: A.makeHuman(person(id), { h: d.h }), cat: 2, lift: 0 };
  F.u = F.grp.userData;
  try { EXTRA[id] && EXTRA[id](F, F.u); } catch (e) { console.error('[heroes] model', e); }
  return F.grp;
}

/* отладка: __dlv.HEROES */
export const DEBUG = {
  M, HERO, DEFS, get, sayLine,
  list: () => M.heroes.map(H => ({ ...api(H), kind: H.home && H.home.kind, x: +H.x.toFixed(1), z: +H.z.toFixed(1), said: H.log.length, kinds: H.kinds.slice() })),
  log: id => { const H = byId(id); return H ? H.log.slice() : null; },
  pool: (id, adult) => { const d = BY_ID.get(id); return d ? d.lines.concat(adult ? d.adult || [] : d.kids || []) : null; },
  hurtPool: (id, adult) => { const d = BY_ID.get(id); return d ? d.hurt.concat(adult ? d.hurtAdult || [] : d.hurtKids || []) : null; },
  say: id => { const H = byId(id); if (!H || !H.grp) return null; const L = meetLine(H); say(H, L.text); return L; },
  free: id => { for (const H of M.heroes) H.sayCd = !id || H.def.id === id ? 0 : 30; M.gapAll = 0; },   // id — говорит только он
  hit: id => { const H = byId(id); if (!H || !H.grp) return false; knock(H, 60); return true; },
  repick: () => { M.session = null; return true; },
  /* сохранить «знакомы со всеми», чтобы проверять обычные реплики */
  meetAll: () => { for (const d of DEFS) M.save.met[d.id] = 1; save(); },
};
