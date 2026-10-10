/* ──────────────────────────────────────────────────────────────────────────
   Люди — генератор выдуманных прохожих и клиентов.

   Раньше по улицам ходили настоящие коллеги с фотографиями вместо лиц.
   Для продажи игры это не годится, поэтому каждого человека собираем из
   зерна: имя и фамилия из списков под язык игры, должность, внешность
   (кожа, причёска, борода, головной убор, очки, форма лица, глаза, брови,
   нос, губы, уши, веснушки), фигура и одежда. Всё детерминировано от
   зерна: один и тот же человек одинаков и в карточке заказа, и на улице.

   makePerson()          — запись человека { id, name, first, last, acc, gen, … look }
   createHumanFactory()  — makeHuman(person, o) для игры: три.js-группа
   faceDataURL(person)   — портрет в PNG для HTML-карточек (кэш; faceSoon — дорисовать заранее, в спокойные кадры)
   setPeopleLocale(lang) — какие имена раздавать (по умолчанию язык игры)
   setPeopleSeason(w)    — как одеваться: 0 лето … 1 зима (seasons.js)

   Особые черты (10.10.2026, встречи у двери — encounter-scenes.js): жребий их
   не раздаёт, их ставят руками поверх look (Object.assign(p.look, {...}), как
   у героев сюжета) — поэтому все прежние люди остались такими же:
     scar: 'cheek' | 'eye' | 'brow'   — шрам на щеке / через глаз / через бровь
     sleeve: 'L' | 'R'                — пустой рукав (руки нет), подколот
     broad: true                      — широкие плечи (туловище и руки шире)
     nose: 'huge', noseC: '#…'        — огромный нос; цвет носа (красный — пьющий)
     eyes: 'bulge' | 'alien'          — выпученные (торчат из лица) / огромные чёрные
     bags: true                       — мешки под глазами
     bristle: true                    — щетина «три дня» (гуще обычной)
     beard: 'horseshoe'               — усы-подкова
     cig: true                        — сигарета во рту
     bottle: '#…'                     — бутылка в руке (цвет стекла; белая — кефир)
     cup: '#…'                        — стакан кофе с крышкой в руке
     earring: true                    — серьга в ухе
     antenna: '#…'                    — антенны на голове (цвет шариков)
   ────────────────────────────────────────────────────────────────────────── */

import { t, lang } from '../i18n/index.js';

/* ─────────────── случайность от зерна ─────────────── */
function rng (seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let q = a;
    q = Math.imul(q ^ (q >>> 15), q | 1);
    q ^= q + Math.imul(q ^ (q >>> 7), q | 61);
    return ((q ^ (q >>> 14)) >>> 0) / 4294967296;
  };
}
const P = (r, a) => a[(r() * a.length) | 0];
/* взвешенный жребий: { вариант: вес } */
function W (r, o) {
  let s = 0;
  for (const k in o) s += o[k];
  let x = r() * s;
  for (const k in o) if ((x -= o[k]) < 0) return k;
  return Object.keys(o)[0];
}
const newSeed = () => (Math.random() * 4294967296) >>> 0;

/* ─────────────── имена ───────────────
   Списки по семьям языков. Фамилии и имена подобраны так, чтобы не
   складываться в известных людей; у ru/uk/pl есть падежи: «сбил Анну
   Петрову», «улица Герасимова». Русские имена — ещё для be/kk/uz. */
const L = s => s.split(' ').map(w => w.replace(/_/g, ' '));
const NAMES = {
  ru: {
    m: L('Александр Алексей Андрей Антон Арсений Артём Артур Богдан Борис Вадим Валентин Василий Виктор Виталий Владислав Всеволод Геннадий Георгий Глеб Григорий Даниил Денис Дмитрий Егор Захар Иван Игорь Илья Кирилл Константин Лев Леонид Макар Максим Марат Марк Матвей Михаил Никита Николай Олег Павел Пётр Роман Ростислав Руслан Рустам Савва Семён Сергей Станислав Степан Тимофей Тимур Филипп Эдуард Эльдар Юрий Ярослав'),
    f: L('Алёна Алина Алиса Алия Анастасия Ангелина Анна Валерия Варвара Василиса Вера Вероника Виктория Галина Гульнара Дарья Диана Диляра Ева Евгения Екатерина Елена Елизавета Зарина Злата Зоя Инна Ирина Камила Карина Кира Кристина Ксения Лариса Лейла Лидия Людмила Майя Малика Маргарита Марина Мария Милана Надежда Наталья Нина Оксана Ольга Полина Раиса Регина Светлана София Таисия Тамара Ульяна Эльвира Юлия Яна'),
    // фамилии в мужской форме, женскую и падежи выводим правилами (ruLast)
    s: L('Белов Бархатов Вязьмин Ветров Голованов Гладышев Дроздов Ершов Дубинин Зимин Карасёв Клюев Корнеев Кедров Лапин Мирошин Лосев Лукин Нефёдов Овчаров Пестов Родин Пряхин Селиванов Сомов Соколов Субботин Уткин Резников Цветков Чижов Шубин Щукин Юдин Грачёв Воронин Евсеев Кочетов Тарханов Мохов Баранов Блинов Вешняков Глухов Шестаков Дьячков Ерёмин Жилин Завьялов Брагин Гусаров Капустин Ермаков Мухин Овсянников Кирсанов Рогов Тетерин Мезенцев Хромов Чистяков Шилов Якимов Анисимов Бурмистров Гусельников Дорофеев Елагин Журбин Назаров Оленин Полозов Ракитин Ремизов Фирсов Черепанов Щеглов Горский Каменский Левицкий Липский Озерский Покровский Сосновский Белецкий Ольховский Заславский Ясенский Лесной Боровой Заречный Нагорный Гончаренко Марченко Руденко Савенко Опанасенко Ткаченко Павленко Коваленко Остапенко Черных Белых Долгих Седых Беридзе Гелашвили Арутюнян Саркисян Манукян Мкртчян Григорян Ковальчук Мельничук Савчук Гнатюк Гарипов Ахметов Валиев Хабибуллин Сафин Рахимов Турсунов Жумабаев Исмаилов Алимов Гринберг Розенфельд Шмидт Бергман Фишер Кауфман'),
  },
  uk: {
    m: L('Олександр Андрій Богдан Василь Віктор Дмитро Тарас Остап Назар Максим Юрій Роман Олег Ігор Святослав Ярослав Микола Петро Степан Орест Денис Артем Олексій Євген Іван'),
    f: L('Оксана Олена Ірина Наталія Соломія Мар’яна Ганна Катерина Олеся Христина Дарина Софія Тетяна Ярина Юлія Людмила Галина Вікторія Зоряна Леся Анастасія Марта Уляна Надія Валентина'),
    s: L('Коваленко Павленко Остапенко Марченко Лисенко Гончаренко Приходько Руденко Гордієнко Савченко Ткачук Савчук Гнатюк Поліщук Гуменюк Мельник Мороз Вовк Дячук Бойчук Ковальський Левицький Яремчук Кушнір Климчук Стасюк Литвинчук Мацюк Грищук Кучер Тимошук Бабенко Сидорчук Олійник Захарчук'),
  },
  en: {
    m: L('Oliver Jack Harry George Noah Leo Oscar Henry Liam Ethan Mason Lucas Owen Ryan Nathan Adam Sam Max Luke Aaron Dylan Evan Kevin Tom Callum Isaac Jamie Rory Toby Finn'),
    f: L('Olivia Emma Ava Mia Chloe Grace Lily Ella Sophie Ruby Zoe Hannah Lucy Amber Megan Holly Isla Freya Jade Nora Clara Poppy Imogen Esme Tilly Maisie Evie Alice Rosie Beth'),
    s: L('Walker Wright Robinson Thompson Hughes Turner Hill Cooper Ward Morris Baker Harper Fletcher Carter Mitchell Parker Bennett Foster Griffin Hayes Palmer Reed Webb Wells Porter Barnes Holt Marsh Doyle Quinn Lowe Hale Pike Rowe Sutton Dixon Lambert Gibbs Kemp Sharp'),
  },
  tr: {
    m: L('Emre Can Mert Kerem Arda Onur Oğuz Serkan Volkan Deniz Umut Barış Kaan Efe Tolga Selim Yusuf Mehmet Mustafa Hakan Murat Baran Alper Eren Koray Batuhan'),
    f: L('Elif Zeynep Ayşe Merve Selin Ece Defne Buse Derya Esra Gizem İrem Melis Nazlı Pelin Seda Tuğçe Yağmur Ebru Aslı Ceren Damla Duygu Özge Sinem'),
    s: L('Yılmaz Kaya Demir Şahin Çelik Yıldız Yıldırım Öztürk Aydın Özdemir Arslan Doğan Kılıç Aslan Çetin Kara Koç Kurt Özkan Şimşek Polat Korkmaz Güneş Aksoy Tekin Erdem Taş Aktaş Keskin Bulut'),
  },
  de: {
    m: L('Lukas Jonas Felix Leon Paul Maximilian Tim Jan Niklas Moritz Tobias Florian Stefan Markus Sebastian Dirk Uwe Karsten Matthias Benedikt Henrik Lars Timo Fabian Ole'),
    f: L('Anna Lena Laura Julia Hannah Lea Sophie Marie Katharina Sabine Claudia Anja Petra Jana Mia Emma Leonie Greta Nina Frieda Ines Birgit Carla Svenja Merle'),
    s: L('Müller Schmidt Schneider Fischer Weber Meyer Wagner Becker Schulz Hoffmann Koch Richter Klein Wolf Schröder Neumann Schwarz Zimmermann Braun Krüger Hofmann Hartmann Lange Werner Krause Köhler Maier Huber Kaiser Vogel Brandt Seidel Winkler Lorenz'),
  },
  es: {
    m: L('Pablo Javier Diego Sergio Álvaro Adrián Mario Iván Rubén Andrés Marcos Jorge Óscar Daniel Alejandro Manuel Tomás Gonzalo Íñigo Víctor Nacho Unai Rodrigo Joaquín'),
    f: L('Lucía Sofía María Paula Carmen Laura Marta Sara Elena Irene Alba Nerea Claudia Andrea Julia Noelia Rocío Pilar Inés Beatriz Ainhoa Lorena Celia Olga Eva'),
    s: L('García Martínez López Sánchez Pérez Gómez Martín Jiménez Ruiz Hernández Díaz Moreno Muñoz Álvarez Romero Navarro Torres Domínguez Vázquez Gil Serrano Molina Castro Ortega Rubio Marín Sanz Medina Garrido Cortés Lozano Prieto'),
  },
  pt: {
    m: L('João Pedro Lucas Gabriel Rafael Bruno Felipe Gustavo Rodrigo Tiago Vitor Caio Mateus Leonardo Henrique Ricardo Paulo Miguel Nuno Rui Duarte Hugo Samuel Otávio'),
    f: L('Ana Beatriz Mariana Larissa Camila Juliana Fernanda Letícia Gabriela Carolina Inês Rita Catarina Luana Bianca Raquel Joana Patrícia Sofia Clara Marta Helena Vitória Lívia'),
    s: L('Santos Oliveira Souza Rodrigues Ferreira Alves Pereira Lima Gomes Ribeiro Martins Carvalho Almeida Lopes Soares Vieira Rocha Dias Nunes Moreira Cardoso Teixeira Correia Mendes Pinto Araújo Monteiro Machado Freitas Batista'),
  },
  fr: {
    m: L('Lucas Hugo Louis Gabriel Arthur Jules Théo Nathan Antoine Maxime Julien Nicolas Romain Baptiste Mathis Clément Victor Guillaume Adrien Bastien Quentin Loïc Yanis Rémi'),
    f: L('Emma Léa Chloé Manon Camille Inès Sarah Juliette Louise Jade Zoé Lucie Margaux Pauline Mathilde Élise Claire Océane Amélie Anaïs Maëlle Justine Noémie Clémence'),
    s: L('Martin Bernard Dubois Robert Richard Petit Durand Leroy Moreau Simon Laurent Lefebvre Michel David Bertrand Roux Vincent Fournier Morel Girard Mercier Dupont Lambert Bonnet Legrand Garnier Faure Rousseau Blanc Guérin Roussel Perrin Lemoine Chevalier Masson'),
  },
  it: {
    m: L('Luca Marco Matteo Alessandro Lorenzo Andrea Davide Simone Federico Riccardo Stefano Giorgio Tommaso Giacomo Francesco Nicola Pietro Emanuele Fabio Michele Enrico Filippo Samuele Diego'),
    f: L('Giulia Chiara Francesca Sara Martina Alessia Elena Valentina Federica Silvia Alice Giorgia Aurora Beatrice Ilaria Marta Serena Laura Anna Noemi Elisa Camilla Greta Irene'),
    s: L('Russo Ferrari Esposito Bianchi Romano Colombo Ricci Marino Greco Bruno Gallo Conti De_Luca Costa Giordano Mancini Rizzo Lombardi Moretti Barbieri Fontana Santoro Mariani Rinaldi Caruso Ferrara Galli Martini Leone Longo Gentile Vitale'),
  },
  pl: {
    m: L('Jan Piotr Tomasz Paweł Michał Krzysztof Marcin Łukasz Kamil Jakub Wojciech Mateusz Adam Bartosz Szymon Filip Kacper Maciej Rafał Grzegorz Damian Hubert Igor Oskar'),
    f: L('Anna Katarzyna Magdalena Agnieszka Joanna Monika Ewa Zofia Natalia Julia Aleksandra Karolina Marta Paulina Weronika Justyna Dominika Maja Oliwia Alicja Hanna Ilona Kinga Beata'),
    s: L('Wiśniewski Kamiński Dąbrowski Kozłowski Jankowski Sadowski Borkowski Wróblewski Górecki Michalski Pawłowski Jabłoński Majewski Olszewski Nowak Wójcik Kowalczyk Woźniak Mazur Zając Król Pietrzak Baran Adamczyk Kaczor Wilk Nowicki Sobczak Czarnecki Zawadzki'),
  },
  ja: {
    m: L('健太 翔太 大輔 拓也 直樹 和也 亮 悠斗 陽翔 蓮 大和 湊 誠 浩二 隆 海斗 颯太 智也 慎吾 航'),
    f: L('美咲 陽菜 さくら 結衣 葵 凛 真由美 恵 彩 七海 優子 愛 明美 由美 美月 千尋 遥 杏奈 舞 夏美'),
    s: L('佐藤 鈴木 高橋 田中 伊藤 渡辺 山本 中村 小林 加藤 吉田 山田 佐々木 山口 松本 井上 木村 林 清水 山崎 森 池田 橋本 阿部 石川 前田 藤田 岡田 後藤 長谷川'),
  },
  zh: {
    m: L('伟 强 磊 军 勇 杰 涛 超 浩然 子轩 宇航 俊杰 志强 建华 文博 一鸣 思远 嘉豪 天佑 明轩'),
    f: L('芳 敏 静 丽 婷 雪 慧 颖 欣怡 梓涵 诗琪 雨桐 佳怡 晓雯 若曦 梦瑶 思琪 语嫣 雅婷 心悦'),
    s: L('王 李 张 刘 陈 杨 黄 赵 吴 周 徐 孙 马 朱 胡 郭 何 高 林 罗 郑 梁 谢 宋 唐'),
  },
};
/* на всякий случай — сочетания, которые всё же складываются в известных людей */
const BLOCK = new Set(['李娜', '王菲', '刘翔', '李宁', '刘洋', '张杰', '杨超', 'Adam Walker', 'Kevin Hayes']);

const FAMILY = { ru: 'ru', be: 'ru', kk: 'ru', uz: 'ru', uk: 'uk', en: 'en', tr: 'tr', de: 'de', es: 'es', pt: 'pt', fr: 'fr', it: 'it', pl: 'pl', ja: 'ja', zh: 'zh' };
let LOCALE = null;
/* какие имена раздавать; без вызова — по языку игры */
export function setPeopleLocale (l) { LOCALE = FAMILY[l] ? l : null; }
const family = l => FAMILY[l || LOCALE || lang()] || 'en';

/* ── падежи ──
   Возвращают [винительный, родительный, дательный]. Беглые гласные
   (Лев → Льва, Павел → Павла) — таблицей, остальное правилами. */
const RU_STEM = { 'Лев': 'Льв', 'Павел': 'Павл', 'Пётр': 'Петр' };
const hush = s => /[гкхжшчщ]$/.test(s);
function ruFirst (n, f) {
  const s = n.slice(0, -1);
  if (/ия$/.test(n)) return [s + 'ю', s + 'и', s + 'и'];
  if (/я$/.test(n)) return [s + 'ю', s + 'и', s + 'е'];
  if (/а$/.test(n)) return [s + 'у', s + (hush(s) ? 'и' : 'ы'), s + 'е'];
  if (f) return [n, n, n];
  if (/[йь]$/.test(n)) return [s + 'я', s + 'я', s + 'ю'];
  const st = RU_STEM[n] || n;
  return [st + 'а', st + 'а', st + 'у'];
}
/* фамилия: [именительный, винительный, родительный, дательный] */
function ruLast (m, f) {
  if (/(ов|ев|ёв|ин|ын)$/.test(m)) return f ? [m + 'а', m + 'у', m + 'ой', m + 'ой'] : [m, m + 'а', m + 'а', m + 'у'];
  if (/(ий|ый|ой)$/.test(m)) {
    const s = m.slice(0, -2);
    return f ? [s + 'ая', s + 'ую', s + 'ой', s + 'ой'] : [m, s + 'ого', s + 'ого', s + 'ому'];
  }
  if (/[оеиуюых]$/.test(m) || /их$/.test(m)) return [m, m, m, m];          // -енко, -дзе, -швили, -ых, -их
  if (/[бвгджзклмнпрстфхцчшщ]$/.test(m)) return f ? [m, m, m, m] : [m, m + 'а', m + 'а', m + 'у'];
  return [m, m, m, m];
}
const UK_STEM = { 'Ігор': 'Ігор' };
function ukFirst (n, f) {
  const s = n.slice(0, -1);
  if (/ія$/.test(n)) return [s + 'ю', s + 'ї', s + 'ї'];
  if (/я$/.test(n)) return [s + 'ю', s + 'і', s + 'і'];
  if (/а$/.test(n)) return [s + 'у', s + 'и', s + 'і'];
  if (f) return [n, n, n];
  if (n in UK_STEM) return [n + 'я', n + 'я', n + 'ю'];
  if (/о$/.test(n)) return [s + 'а', s + 'а', s + 'ові'];
  if (/[йь]$/.test(n)) return [s + 'я', s + 'я', s + 'ю'];
  return [n + 'а', n + 'а', n + 'ові'];
}
function ukLast (m, f) {
  if (/о$/.test(m)) return [m, m, m, m];
  if (/(ський|цький)$/.test(m)) {
    const s = m.slice(0, -2);
    return f ? [s + 'а', s + 'у', s + 'ої', s + 'ій'] : [m, s + 'ого', s + 'ого', s + 'ому'];
  }
  if (/[бвгґджзклмнпрстфхцчшщ]$/.test(m)) return f ? [m, m, m, m] : [m, m + 'а', m + 'а', m + 'у'];
  return [m, m, m, m];
}
const PL_STEM = { 'Paweł': 'Pawł', 'Kacper': 'Kacpr' };
function plFirst (n, f) {
  if (!f) { const s = PL_STEM[n] || n; return [s + 'a', s + 'a', n]; }
  const s = n.slice(0, -1);
  if (n === 'Maja') return ['Maję', 'Mai', n];
  return [s + 'ę', /[ij]a$/.test(n) ? s + 'i' : /[kg]a$/.test(n) ? s + 'i' : s + 'y', n];
}
function plLast (m, f) {
  if (/(ski|cki)$/.test(m)) {
    const s = m.slice(0, -1);
    return f ? [s + 'a', s + 'ą', s + 'iej', s + 'a'] : [m, s + 'iego', s + 'iego', m];
  }
  return f ? [m, m, m, m] : [m, m + 'a', m + 'a', m];          // дательный по-польски не нужен — оставляем как есть
}
const DECL = { ru: [ruFirst, ruLast], uk: [ukFirst, ukLast], pl: [plFirst, plLast] };

/* ── должности ──
   Нейтральные выдуманные занятия, по-русски; если есть женская форма —
   второй элемент. Перевод — через t(), POSITIONS — для выгрузки строк. */
const POS = /*i18n*/ [
  ['бариста'], ['дизайнер'], ['программист'], ['врач'], ['учитель', 'учительница'], ['студент', 'студентка'],
  ['инженер'], ['бухгалтер'], ['менеджер'], ['юрист'], ['архитектор'], ['фотограф'], ['повар'], ['аналитик'],
  ['стоматолог'], ['фармацевт'], ['тренер'], ['флорист'], ['маркетолог'], ['электрик'], ['библиотекарь'],
  ['ветеринар'], ['операционист банка'], ['переводчик', 'переводчица'], ['журналист', 'журналистка'],
  ['музыкант'], ['парикмахер'], ['администратор'], ['продавец', 'продавщица'], ['тестировщик', 'тестировщица'],
  ['преподаватель', 'преподавательница'], ['медбрат', 'медсестра'], ['пенсионер', 'пенсионерка'],
  ['пекарь'], ['таксист'], ['сантехник'], ['геолог'], ['актёр', 'актриса'],
  ['художник', 'художница'], ['блогер'], ['экономист'], ['лаборант'], ['почтальон'], ['кассир'],
  ['официант', 'официантка'], ['механик'], ['садовник'], ['риелтор'], ['психолог'], ['диспетчер'],
];
export const POSITIONS = [...new Set(POS.flat())];

/* ─────────────── человек ─────────────── */
/* opts: { seed, fem, fat, locale, pos } — всё необязательно */
export function makePerson (opts = {}) {
  const seed = opts.seed !== undefined ? opts.seed >>> 0 : newSeed();
  const look = makeLook(seed, opts);
  const f = look.f;
  const fam = family(opts.locale);
  const N = NAMES[fam], r = rng(seed ^ 0x9E3779B9);
  let first, last, name;
  for (let k = 0; k < 6; k++) {
    first = P(r, f ? N.f : N.m); last = P(r, N.s);
    name = fam === 'ja' ? last + ' ' + first : fam === 'zh' ? last + first : first + ' ' + last;
    if (!BLOCK.has(name) && first !== last) break;
  }
  // свой человек (сюжет, учебный клиент): имя и фамилия заданы — падежи ниже считаются от них
  if (opts.first) { first = opts.first; last = opts.last || ''; name = last ? first + ' ' + last : first; }
  let acc = name, gen = name, dat = name, fAcc = first, fGen = first, fDat = first;
  // падежи — только когда и язык игры такой: у be/kk/uz имена русские, но
  // фразы вокруг не русские — там именительный
  const D = DECL[opts.locale || LOCALE || lang()];
  if (D) {
    const [fa, fg, fd] = D[0](first, f), [ln, la, lg, ld] = D[1](last, f);
    last = ln; name = first + ' ' + ln;
    acc = fa + ' ' + la; gen = fg + ' ' + lg; dat = fd + ' ' + ld;
    fAcc = fa; fGen = fg; fDat = fd;
  }
  const pp = P(r, POS);
  const posRu = opts.pos || (f && pp[1]) || pp[0];
  return {
    id: 'g' + seed.toString(36), seed, name, first, last, acc, gen, dat,
    firstAcc: fAcc, firstGen: fGen, firstDat: fDat, f, pos: t(posRu), posRu, look,
  };
}

/* ─────────────── внешность ─────────────── */
const SKINS = ['#f6d7bd', '#f0c8a0', '#e8bb92', '#d9a878', '#c38e62', '#a8764e', '#8a5a3a', '#6b4430', '#4f3224'];
/* доли оттенков кожи — под московскую улицу; площадка может передать свои */
const SKIN_W = { 0: 13, 1: 17, 2: 15, 3: 13, 4: 10, 5: 8, 6: 6, 7: 4, 8: 3 };
const HAIR_LIGHT = { '#1a1a1a': 12, '#2a1d16': 18, '#4a3020': 16, '#6b4a2e': 12, '#a57a4a': 7, '#d9b36a': 8, '#e8cf8f': 3, '#8a3b22': 6 };
const HAIR_DARK = { '#141414': 30, '#1a1a1a': 20, '#2a1d16': 20, '#4a3020': 6 };
const HAIR_DYE = ['#d9537a', '#3f7fd6', '#59b06a', '#8e6fd0', '#e0703f'];
const SHIRTS = ['#d95d5d', '#4f7fd6', '#59b06a', '#e0b13f', '#8e6fd0', '#e08a4f', '#3fa8a0', '#f4f1ea', '#2b2a30',
  '#c9476b', '#7fb3e0', '#a3c46a', '#f2d0a0', '#6b4a8a', '#b8b2aa', '#e86f9a', '#355e3b', '#9a3b2e'];
const PANTS = ['#39405c', '#2f3540', '#5a4a3a', '#46506b', '#1f2328', '#6b6560', '#8a7a5a', '#2e4a6b', '#4a3a2e'];
const SKIRTS = ['#6b2e4a', '#2f3540', '#8a6b3a', '#3b5a8a', '#c9476b', '#2b2a30', '#5a7a4a', '#e0b13f'];
const JACKETS = ['#2b2a30', '#5a4a3a', '#3b4a5a', '#6b2e2e', '#3f5a3a', '#8a7a5a', '#d9d2c2', '#2e4a6b'];
const SHOES = ['#1f1c1a', '#f4f1ea', '#5a3a22', '#8a2a2a', '#2e4a8a', '#6b6560', '#1f1c1a'];
const HEADC = ['#d95d5d', '#2b2a30', '#4f7fd6', '#e0b13f', '#59b06a', '#f4f1ea', '#8e6fd0', '#e08a4f', '#c9476b', '#3b4a5a'];
const GLASSC = ['#1d1a1f', '#1d1a1f', '#1d1a1f', '#6b3a22', '#c23a3a', '#3f7fd6', '#b8a060'];
const LIPSTICK = ['#c23a4a', '#d9608a', '#8a2a3a', '#e0707a'];
const BG = ['#8fb8de', '#f2c57c', '#a8d5a2', '#e8a0a8', '#c3a6e0', '#9fd3cf', '#f0b48a', '#b8c4d6'];

function makeLook (seed, o = {}) {
  const r = rng(seed), C = p => r() < p;
  const f = o.fem !== undefined ? !!o.fem : C(0.5);
  const age = W(r, { young: 35, adult: 50, old: 15 });
  const si = +W(r, o.skinW || SKIN_W), skin = SKINS[si];
  let hairC = age === 'old' && C(0.7) ? P(r, ['#b8b2aa', '#d4d0ca', '#9a948c']) : W(r, si >= 5 ? HAIR_DARK : HAIR_LIGHT);
  if (age !== 'old' && C(0.05)) hairC = P(r, HAIR_DYE);
  const hair = f
    ? W(r, { long: 22, bangs: 8, ponytail: 14, bun: 10, bob: 12, curly: 8, afro: si >= 5 ? 8 : 2, short: 5, pixie: 6, pigtails: age === 'young' ? 5 : 1, braid: 4 })
    : W(r, { short: 22, buzz: 12, side: 12, spiky: 6, curly: 7, afro: si >= 5 ? 6 : 1, mohawk: age === 'young' ? 3 : 0.5, bald: age === 'old' ? 14 : 5,
      receding: age === 'old' ? 16 : 3, bowl: 4, long: 3, ponytail: 2, bun: 2 });
  const beard = f ? 'none' : W(r, { none: 58, stubble: 12, mustache: age === 'old' ? 12 : 5, goatee: 7, full: 12, chin: 4 });
  const head = W(r, { none: 60, cap: 10, beanie: 8, hat: age === 'old' ? 8 : 3, headband: f ? 5 : 1.5, hood: age === 'young' ? 7 : 2, bandana: 2 });
  const fat = o.fat !== undefined ? !!o.fat : C(age === 'young' ? 0.12 : 0.2);
  const shape = W(r, fat ? { thin: 5, normal: 30, chubby: 65 } : { thin: 28, normal: 50, chubby: 22 });
  const top = W(r, { tee: 40, long: 28, jacket: 16, stripe: 9, dress: f ? 10 : 0 });
  const bottom = top === 'dress' ? 'skirt' : f ? W(r, { pants: 55, skirt: 40, shorts: 5 }) : W(r, { pants: 85, shorts: 15 });
  const hsSlim = (0.86 + r() * 0.26) * (f ? 0.95 : 1), hsFat = (0.86 + r() * 0.14) * (f ? 0.95 : 1);
  const wsSlim = C(0.22) ? 0.86 + r() * 0.08 : 0.95 + r() * 0.13, wsFat = 1.35 + r() * 0.25;
  const brow = hairC === '#e8cf8f' || hairC === '#d9b36a' ? '#a57a4a' : hairC.startsWith('#d4') || HAIR_DYE.includes(hairC) ? '#4a3020' : hairC;
  return {
    seed, f, age, skin, hairC, hair, beard, head,
    headC: P(r, HEADC), capBack: C(0.25), pompom: C(0.35), tieC: P(r, HEADC), part: C(0.5) ? 1 : -1,
    glasses: W(r, { none: age === 'old' ? 55 : 76, round: 9, square: 10, sun: 5 }), glassC: P(r, GLASSC),
    shape, eyes: W(r, { round: 34, white: 30, narrow: 12, sleepy: 10, lashes: f ? 22 : 0 }),
    eyeC: W(r, { '#1d1a1f': 50, '#4a2e1c': 25, '#2f6fb8': 10, '#3f8a4a': 8, '#6b7780': 7 }), gaze: C(0.5) ? 1 : 0,
    brows: W(r, { thin: 25, thick: f ? 8 : 25, angry: 10, sad: 8, uni: f ? 0 : 4, raised: 12, arched: f ? 18 : 3 }), browC: brow,
    nose: W(r, { small: 30, long: 18, wide: 20, button: 20, big: 12 }),
    mouth: W(r, { line: 28, smile: 30, small: 15, full: f ? 18 : 6, smirk: 10, open: 4, frown: 6 }),
    lip: f && C(0.35) ? P(r, LIPSTICK) : null,
    ears: W(r, { normal: 70, big: 20, small: 10 }),
    freckles: C(si <= 3 ? 0.16 : 0.04), blush: C(f ? 0.35 : 0.12), mole: C(0.08) ? (r() * 3) | 0 : -1,
    stubble: beard === 'stubble', wrinkles: age === 'old',
    fat, hsSlim, hsFat, wsSlim, wsFat, pace0: 0.5 + r() * 0.12,
    top, bottom, shirt: P(r, SHIRTS), jacket: P(r, JACKETS), stripe: P(r, SHIRTS), pants: P(r, PANTS), skirt: P(r, SKIRTS),
    legs: C(0.5) ? skin : P(r, ['#2b2a30', '#3a3036', '#c9b8a8']), shoes: P(r, SHOES),
    pack: C(age === 'young' ? 0.22 : 0.08) ? P(r, HEADC) : null, bg: P(r, BG),
  };
}

/* ─────────────── одежда по сезону ───────────────
   setPeopleSeason(w): насколько на улице холодно, 0 — лето, 1 — зима
   (считает seasons.js). Каждый новый человек одевается по погоде: у
   каждого своя зябкость от зерна, поэтому в межсезонье на одной улице
   кто-то ещё в футболке, а кто-то уже в куртке. */
let WARM = 0, DIRTY = false, REDRESS = null, HSET = null;
export function setPeopleSeason (w) {
  const v = Math.max(0, Math.min(1, +w || 0));
  if (Math.abs(v - WARM) > 0.005) DIRTY = true;
  WARM = v;
}
/* Переодеть тех, кто уже на улице, — понемногу и только вне кадра: дальше
   dFar от камеры или за спиной. За вызов — не больше max человек.
   cam — позиция камеры, fx/fz — куда она смотрит. */
export function redressHumans (cx, cz, fx, fz, max = 3, dFar = 60) {
  if (!DIRTY || !REDRESS || !HSET) return 0;
  let n = 0, stale = 0;
  for (const g of HSET) {
    const u = g.userData;
    if (!u.look || Math.abs((u.warm || 0) - WARM) < 0.005) continue;
    stale++;
    if (n >= max) continue;
    const p = g.parent && !g.parent.isScene ? g.parent.position : g.position;
    const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
    if (d < dFar && !(d > 10 && dx * fx + dz * fz < 0)) continue;
    REDRESS(g);
    n++;
  }
  if (!stale) DIRTY = false;
  return n;
}
/* человек из запаса (humanpool.js) собран раньше: одет не по нынешней погоде — такого не выдают, собирают заново
   (переодеть, как redressHumans, — не то же: голову с капюшоном и шапкой тот не пересобирает) */
export function humanStale (g) {
  const u = g.userData;
  return !!u.look && Math.abs((u.warm || 0) - WARM) >= 0.005;
}
const COATS = ['#2b2a30', '#3b4a5a', '#1f2328', '#5a3a2e', '#6b2e2e', '#2e4a6b', '#3f5a3a', '#8a2a3a', '#d9d2c2', '#4a4550', '#c9476b', '#e0b13f', '#3fa8a0'];
const SCARVES = ['#d95d5d', '#e0b13f', '#f4f1ea', '#4f7fd6', '#59b06a', '#c9476b', '#8e6fd0', '#2b2a30'];
const FURS = ['#5a4a3a', '#3a3036', '#6b5a48', '#8a7a68', '#2b2a30'];
/* уровень: 0 — лето, 1 — прохладно (длинный рукав, без шорт), 2 — куртка, 3 — зима (пуховик, шапка, шарф) */
function wearOf (Lk, o) {
  const r = rng(Lk.seed ^ 0x5EA5011);
  const cold = WARM + (r() - 0.5) * 0.36 + (Lk.age === 'old' ? 0.08 : 0);
  const lvl = o.summer || WARM < 0.04 ? 0 : cold < 0.22 ? 0 : cold < 0.48 ? 1 : cold < 0.76 ? 2 : 3;   // o.summer — одет по-летнему в любой сезон (nightlife.js)
  const coat = o.shirt || P(r, COATS), scarf = r() < 0.7 ? P(r, SCARVES) : null, fur = P(r, FURS);
  const hx = r();
  let head = null;
  if (!o.cap) {
    if (lvl === 3) head = hx < (Lk.age === 'young' ? 0.12 : 0.34) ? 'ushanka' : hx < 0.8 ? 'beanie' : hx < 0.9 ? 'hood' : Lk.head === 'hat' ? 'hat' : 'beanie';
    else if (lvl === 2 && Lk.head === 'none' && hx < 0.28) head = 'beanie';
    else if (lvl === 0 && Lk.head === 'beanie') head = 'cap';               // летом без шапки
  }
  return { lvl, coat, scarf, fur, head, mitt: P(r, ['#2b2a30', '#6b2e2e', '#3b4a5a', '#e0b13f', '#f4f1ea']) };
}

/* ─────────────── цвета ─────────────── */
const hexRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function mix (a, b, k) {
  const x = hexRgb(a), y = hexRgb(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('');
}

/* ─────────────── сборка тела ───────────────
   Человек — набор коробок по частям: 0 левая нога, 1 правая, 2 туловище,
   3 левая рука, 4 правая, 5 волосы, борода и убор, 6 голова с носом и ушами.
   Коробки частей — от их шарнира (бедро, плечо, центр головы), чтобы
   rotation.x махал от бедра и плеча. Та же раскладка рисует и портрет:
   вид спереди — это проекция тех же коробок, так что лицо в карточке
   совпадает с человеком на улице. Пиксель лица — 3,5 см. */
const U = 0.035, HY = 1.58, T = 0.28;
const HEAD_W = { thin: 14, normal: 16, chubby: 18 };            // ширина головы в пикселях лица
const HEAD_D = { thin: 0.28, normal: 0.3, chubby: 0.33 };
/* o: { fem, fat, h, skin, shirt, pants, cap } — как у старого makeHuman */
function buildSpec (Lk, o = {}) {
  const r = rng(Lk.seed ^ 0x51AB5EED);
  const fat = o.fat !== undefined ? !!o.fat : Lk.fat;
  const ws = fat ? Lk.wsFat : Lk.wsSlim;
  const hs = o.h || (fat ? Lk.hsFat : Lk.hsSlim);
  const skin = o.skin || Lk.skin;
  const shirt = o.shirt || Lk.shirt, pants = o.pants || Lk.pants;
  const uniform = !!o.shirt;
  const Wr = wearOf(Lk, o);
  let top = uniform ? (Lk.top === 'long' ? 'long' : 'tee') : Lk.top;
  let bottom = o.pants ? 'pants' : Lk.bottom;
  if (Wr.lvl >= 1) { if (bottom === 'shorts') bottom = 'pants'; if (top === 'tee' || (uniform && Wr.lvl >= 1)) top = 'long'; }
  if (Wr.lvl === 2 && !uniform) top = 'jacket';
  const coat = Wr.lvl === 3;                     // пуховик до бёдер, шарф, варежки
  const topC = coat ? Wr.coat : top === 'jacket' ? Lk.jacket : top === 'dress' ? Lk.skirt : shirt;
  const legC = bottom === 'skirt' ? (Wr.lvl >= 1 && Lk.legs === skin ? '#3a3036' : Lk.legs) : pants;
  const Wp = HEAD_W[fat && Lk.shape === 'thin' ? 'normal' : Lk.shape], Wd = Wp * U, D = HEAD_D[Lk.shape], F = D / 2;
  const parts = [[], [], [], [], [], [], []];
  const bx = (p, w, h, d, x, y, z, c) => parts[p].push([w, h, d, x, y, z, c]);
  const tw = 0.44 * ws * (Lk.broad ? 1.42 : 1), td = 0.26 * (fat ? ws * 1.15 : 1) * (Lk.broad ? 1.12 : 1);
  const lw = fat ? 0.2 : ws < 0.95 ? 0.15 : 0.16, lx = fat ? 0.15 : 0.12, ax = tw / 2 + (Lk.broad ? 0.09 : 0.07);
  // ноги: брюки или колготки под юбкой, шорты, ботинки
  for (const p of [0, 1]) {
    if (bottom === 'shorts') { bx(p, lw + 0.02, 0.3, lw + 0.02, 0, -0.15, 0, pants); bx(p, lw - 0.03, 0.4, lw - 0.03, 0, -0.5, 0, skin); }
    else bx(p, lw, 0.7, lw, 0, -0.35, 0, legC);
    if (coat) bx(p, lw + 0.05, 0.24, lw + 0.1, 0, -0.6, 0.025, Lk.shoes === '#f4f1ea' ? '#5a3a22' : Lk.shoes);   // зимние ботинки
    else bx(p, lw + 0.03, 0.1, lw + 0.1, 0, -0.65, 0.035, Lk.shoes);
  }
  // туловище
  if (coat) {
    // пуховик: шире и ниже пояса, стёжка полосами, шарф
    const cw = tw + 0.1, cd = td + 0.1, dk = mix(Wr.coat, '#000000', 0.22);
    bx(2, cw, 0.82, cd, 0, 0.92, 0, Wr.coat);
    if (fat) bx(2, cw * 0.88, 0.34, cd + 0.1, 0, 0.86, 0.03, Wr.coat);
    for (const y of [1.08, 0.84, 0.62]) bx(2, cw + 0.02, 0.035, cd + (fat && y < 1 ? 0.12 : 0.02), 0, y, fat && y < 1 ? 0.03 : 0, dk);
    bx(2, 0.03, 0.76, 0.02, 0, 0.93, cd / 2 + (fat ? 0.06 : 0.01), dk);          // молния
    if (Wr.scarf) { bx(2, tw * 0.66, 0.12, cd + 0.06, 0, 1.33, 0, Wr.scarf); bx(2, 0.1, 0.32, 0.04, tw * 0.16, 1.14, cd / 2 + (fat ? 0.1 : 0.03), Wr.scarf); }
    else bx(2, tw * 0.62, 0.1, cd * 0.9, 0, 1.33, 0, Wr.coat);                  // воротник
  } else {
    bx(2, tw, 0.6, td, 0, 1.0, 0, topC);
    if (fat) bx(2, tw * 0.86, 0.3, td + 0.12, 0, 0.9, 0.03, topC);                 // живот
    if (bottom !== 'skirt') bx(2, tw + 0.01, 0.08, td + 0.01, 0, 0.74, 0, pants);  // пояс брюк
    if (Wr.lvl === 2 && Wr.scarf && !uniform && Lk.seed % 3 === 0) bx(2, tw * 0.62, 0.1, td + 0.05, 0, 1.3, 0, Wr.scarf);
  }
  if (top === 'jacket' && !coat) {                                              // распахнутая куртка, под ней футболка
    if (fat) { bx(2, tw * 0.3, 0.3, 0.02, 0, 1.15, td / 2 + 0.01, shirt); bx(2, tw * 0.26, 0.28, 0.02, 0, 0.9, td / 2 + 0.1, shirt); }
    else bx(2, tw * 0.3, 0.56, 0.02, 0, 1.01, td / 2 + 0.01, shirt);
  }
  if (top === 'stripe' && !coat) for (const y of [1.12, 0.96, 0.82]) bx(2, tw + 0.01, 0.06, td + (fat && y < 1.05 ? 0.13 : 0.01), 0, y, fat && y < 1.05 ? 0.03 : 0, Lk.stripe);
  if (bottom === 'skirt') { bx(2, tw * 0.95, 0.2, td * 1.1, 0, 0.7, 0, Lk.skirt); bx(2, tw * 1.15, 0.22, td * 1.35, 0, 0.5, 0, Lk.skirt); }
  if (Lk.pack && !uniform) {
    const pz = td / 2 + (coat ? 0.05 : 0);
    bx(2, tw * 0.7, 0.4, 0.14, 0, 1.03, -pz - 0.07, Lk.pack);
    if (!fat) for (const s of [-1, 1]) bx(2, 0.05, 0.5, 0.02, s * tw * 0.26, 1.05, pz + 0.005, mix(Lk.pack, '#000000', 0.3));
  }
  // руки: короткий рукав и голое предплечье или длинный рукав и кисть
  const sleeve = coat ? Wr.coat : top === 'jacket' ? Lk.jacket : topC;
  for (const p of [3, 4]) {
    if (Lk.sleeve && p === (Lk.sleeve === 'R' ? 4 : 3)) {                       // пустой рукав: руки нет, рукав сплющен и подколот к боку
      const sc = coat ? Wr.coat : sleeve, pin = mix(sc, '#000000', 0.25);
      if (!coat && (top === 'tee' || top === 'dress')) bx(p, 0.14, 0.15, 0.1, 0, -0.08, 0, sc);
      else { bx(p, 0.12, 0.3, 0.06, 0, -0.16, 0, sc); bx(p, 0.1, 0.14, 0.05, 0, -0.27, 0.035, pin); bx(p, 0.03, 0.03, 0.02, 0, -0.22, 0.065, '#c8ccd2'); }
      continue;
    }
    if (coat) { bx(p, 0.16, 0.48, 0.16, 0, -0.235, 0, sleeve); bx(p, 0.12, 0.1, 0.13, 0, -0.52, 0, Wr.mitt); }   // варежки
    else if (top === 'tee' || top === 'dress') { bx(p, 0.14, 0.2, 0.14, 0, -0.1, 0, sleeve); bx(p, 0.11, 0.35, 0.11, 0, -0.375, 0, skin); }
    else { bx(p, 0.13, 0.47, 0.13, 0, -0.235, 0, sleeve); bx(p, 0.11, 0.08, 0.11, 0, -0.51, 0, skin); }
    if (Lk.broad) bx(p, 0.17, 0.2, 0.17, 0, -0.08, 0, coat ? Wr.coat : sleeve);    // плечо-шар
    if (Lk.bottle && p === (Lk.sleeve === 'R' ? 3 : 4)) {                        // бутылка в кулаке: горлышком вверх
      const gl = Lk.bottle;
      bx(p, 0.08, 0.2, 0.08, 0, -0.56, 0.07, gl); bx(p, 0.035, 0.09, 0.035, 0, -0.42, 0.07, gl);
      bx(p, 0.082, 0.06, 0.082, 0, -0.58, 0.07, gl === '#f4f1ea' ? '#3f7fd6' : '#e8dcb0');      // этикетка
    }
    if (Lk.cup && !Lk.bottle && p === (Lk.sleeve === 'R' ? 3 : 4)) {            // стакан кофе с крышкой
      bx(p, 0.09, 0.15, 0.09, 0, -0.55, 0.08, Lk.cup); bx(p, 0.1, 0.025, 0.1, 0, -0.465, 0.08, '#2b2a30'); bx(p, 0.092, 0.05, 0.092, 0, -0.56, 0.08, '#8a5a3a');
    }
  }
  // голова: волосы, убор, борода, нос, уши
  const hw = o.cap ? 'cap' : Wr.head || Lk.head, hc = o.cap || Lk.headC;
  const H = [];
  hairBoxes(Lk, Wd, D, r, H);
  const covers = hw === 'cap' || hw === 'beanie' || hw === 'bandana' || hw === 'hood' || hw === 'ushanka';
  for (const b of H) {
    const k = b[0];
    if ((covers || hw === 'hat') && k === 'top') continue;
    if (covers && hw !== 'hood' && k === 'fringe') continue;
    if (hw === 'hood' && (k === 'back' || k === 'side' || k === 'tail')) continue;
    bx(5, ...b.slice(1));
  }
  const dk = c => mix(c, '#000000', 0.3);
  if (hw === 'cap') { bx(5, Wd + 0.04, 0.13, D + 0.05, 0, T + 0.05, 0, hc); bx(5, Wd - 0.08, 0.03, 0.2, 0, T - 0.005, (Lk.capBack && !o.cap ? -1 : 1) * (F + 0.1), dk(hc)); }
  if (hw === 'beanie') {
    bx(5, Wd + 0.06, 0.2, D + 0.06, 0, T + 0.06, 0, hc); bx(5, Wd + 0.08, 0.07, D + 0.08, 0, T - 0.05, 0, mix(hc, '#000000', 0.15));
    if (Lk.pompom) bx(5, 0.1, 0.1, 0.1, 0, T + 0.2, 0, Lk.tieC);
  }
  if (hw === 'hat') { bx(5, Wd + 0.3, 0.03, D + 0.3, 0, T, 0, hc); bx(5, Wd - 0.04, 0.2, D - 0.04, 0, T + 0.11, 0, hc); bx(5, Wd - 0.02, 0.05, D - 0.02, 0, T + 0.04, 0, mix(hc, '#000000', 0.45)); }
  if (hw === 'ushanka') {                        // ушанка: мех, отворот спереди, уши вниз
    const fd = mix(Wr.fur, '#000000', 0.25);
    bx(5, Wd + 0.1, 0.2, D + 0.1, 0, T + 0.07, 0, Wr.fur); bx(5, Wd + 0.14, 0.11, 0.06, 0, T + 0.02, F + 0.06, fd);
    for (const s of [-1, 1]) bx(5, 0.07, 0.3, D * 0.62, s * (Wd / 2 + 0.05), T - 0.16, -0.01, Wr.fur);
  }
  if (hw === 'headband') bx(5, Wd + 0.03, 0.05, D + 0.03, 0, T - 0.07, 0, hc);
  if (hw === 'bandana') { bx(5, Wd + 0.04, 0.12, D + 0.04, 0, T + 0.02, 0, hc); bx(5, 0.08, 0.14, 0.06, 0, T - 0.08, -F - 0.04, hc); }
  if (hw === 'hood') {
    const c = coat ? Wr.coat : top === 'jacket' ? Lk.jacket : topC;
    bx(5, Wd + 0.12, 0.08, D + 0.14, 0, T + 0.06, -0.02, c); bx(5, Wd + 0.12, 0.66, 0.08, 0, T - 0.28, -F - 0.06, c);
    for (const s of [-1, 1]) bx(5, 0.06, 0.6, D + 0.1, s * (Wd / 2 + 0.05), T - 0.28, -0.01, c);
  }
  const bc = o.face === false ? null : Lk.hairC, mus = () => bx(5, 0.22, 0.04, 0.03, 0, -0.1225, F + 0.015, bc);
  // бакенбарды — ниже глаз и тонкие: высокие закрывали пол-лица (автор 10.10.2026, Стёпа в катсцене: «лицо закрыто волосами»)
  const jaw = () => { for (const s of [-1, 1]) bx(5, 0.04, 0.2, D * 0.6, s * (Wd / 2 - 0.0), -0.17, F + 0.005 - D * 0.3, bc); };
  // бороды нет под маской (вор) — там и лица нет
  if (bc && Lk.beard === 'mustache') mus();
  if (bc && Lk.beard === 'goatee') { mus(); bx(5, 0.12, 0.1, 0.04, 0, -0.235, F + 0.01, bc); }
  if (bc && Lk.beard === 'full') { mus(); jaw(); bx(5, Wd - 0.04, 0.125, 0.05, 0, -0.2375, F - 0.005, bc); bx(5, Wd - 0.06, 0.06, D * 0.8, 0, -T - 0.02, 0, bc); }
  if (bc && Lk.beard === 'chin') { jaw(); bx(5, Wd - 0.04, 0.07, 0.05, 0, -0.26, F - 0.005, bc); }
  if (bc && Lk.beard === 'horseshoe') { mus(); for (const s of [-1, 1]) bx(5, 0.04, 0.17, 0.03, s * 0.1, -0.2, F + 0.015, bc); }   // усы-подкова: до подбородка
  // особые черты (шапка файла): только у тех, кому их поставили руками
  if (Lk.cig) { bx(5, 0.13, 0.026, 0.026, 0.07, -0.135, F + 0.05, '#f4f1ea'); bx(5, 0.028, 0.03, 0.03, 0.145, -0.135, F + 0.05, '#e0503f'); }
  if (Lk.earring) bx(5, 0.03, 0.05, 0.03, Wd / 2 + 0.035, -0.1, -0.01, '#e8c040');
  if (Lk.antenna) for (const s of [-1, 1]) { bx(5, 0.025, 0.24, 0.025, s * 0.09, T + 0.12, 0, '#3a4a3a'); bx(5, 0.07, 0.07, 0.07, s * 0.1, T + 0.26, 0, Lk.antenna); }
  if (Lk.eyes === 'bulge') for (const s of [-1, 1]) {                           // глаза-плошки торчат из лица
    bx(5, 0.13, 0.12, 0.05, s * 3 * U, 0.035, F + 0.025, '#f4f1ea');
    bx(5, 0.045, 0.045, 0.012, s * 3 * U + (Lk.gaze ? 0.02 : -0.01), 0.03, F + 0.056, Lk.eyeC || '#1d1a1f');
  }
  const NS = { small: [0.07, 0.07, 0.05], long: [0.07, 0.12, 0.06], wide: [0.12, 0.07, 0.05], button: [0.08, 0.06, 0.07], big: [0.1, 0.11, 0.08], huge: [0.13, 0.19, 0.17] }[Lk.nose];
  // череп, нос, уши и второй подбородок — часть 6, один меш со своим
  // материалом цвета кожи: игра перекрашивает голову целиком
  bx(6, Wd, 0.56, D, 0, 0, 0, skin);
  bx(6, NS[0], NS[1], NS[2], 0, -NS[1] / 2, F + NS[2] / 2, mix(skin, '#7a3a2a', 0.12));
  if (Lk.noseC) bx(5, NS[0] + 0.004, NS[1] * 0.55, NS[2] + 0.004, 0, -NS[1] * 0.72, F + NS[2] / 2, Lk.noseC);   // кончик носа другого цвета (голова красится целиком — поэтому в части 5)
  const hid = hw === 'hood' || hw === 'ushanka' || ['long', 'bangs', 'bob', 'afro'].includes(Lk.hair);          // уши под волосами
  if (!hid) {
    const E = { normal: [0.05, 0.12, 0.08], big: [0.07, 0.16, 0.09], small: [0.04, 0.09, 0.06] }[Lk.ears];
    for (const s of [-1, 1]) bx(6, E[0], E[1], E[2], s * (Wd / 2 + E[0] / 2), 0, -0.01, skin);
  }
  if (Lk.shape === 'chubby') bx(6, Wd - 0.12, 0.06, D - 0.08, 0, -T - 0.02, 0.01, skin);   // второй подбородок
  const piv = [[-lx, 0.7, 0], [lx, 0.7, 0], [0, 0, 0], [-ax, 1.3, 0], [ax, 1.3, 0], [0, HY, 0], [0, HY, 0]];
  const pace = fat ? Lk.pace0 : hs < 0.92 ? 0.82 : 1;
  return { parts, piv, Wp, W: Wd, D, skin, shirt: coat ? Wr.coat : shirt, pants, hs, fat, pace, fem: Lk.f, face: faceKey(Lk, skin, Wp) };
}

/* Причёски — коробки в осях головы: [вид, w, h, d, x, y, z, цвет].
   Вид нужен головному убору: кепка прячет макушку и чёлку, капюшон — всё,
   кроме чёлки, шляпа — только макушку. */
function hairBoxes (Lk, Wd, D, r, out) {
  const c = Lk.hairC, F = D / 2;
  const top = (e = 0.04, h = 0.1) => out.push(['top', Wd + e, h, D + e, 0, T + 0.03, 0, c]);
  const fringe = (h = 0.07, w = Wd + 0.02, x = 0) => out.push(['fringe', w, h, 0.04, x, T - h / 2 + 0.005, F + 0.01, c]);
  const back = h => out.push(['back', Wd + 0.04, h, 0.06, 0, T + 0.04 - h / 2, -F - 0.02, c]);
  const sides = (h, w = 0.04) => { for (const s of [-1, 1]) out.push(['side', w, h, D * 0.7, s * (Wd / 2 + w / 2 - 0.005), T + 0.02 - h / 2, -D * 0.12, c]); };
  const long = (fh, fw) => {
    top(); fringe(fh, fw);
    out.push(['back', Wd + 0.04, 0.74, 0.1, 0, T - 0.33, -F - 0.04, c]);
    // пряди по бокам — не до самого лица: от ~трети глубины головы назад (автор 10.10.2026: «лицо у Стёпы закрыто волосами»)
    for (const s of [-1, 1]) out.push(['side', 0.07, 0.56, D * 0.55, s * (Wd / 2 + 0.03), T - 0.24, -D * 0.24, c]);
  };
  switch (Lk.hair) {
    case 'bald':
      if (Lk.age === 'old') {                     // подкова вокруг лысины
        out.push(['back', Wd + 0.02, 0.16, 0.04, 0, T - 0.16, -F - 0.01, c]);
        for (const s of [-1, 1]) out.push(['side', 0.03, 0.14, D * 0.6, s * (Wd / 2 + 0.01), T - 0.14, -0.04, c]);
      }
      break;
    case 'buzz':
      out.push(['top', Wd + 0.02, 0.05, D + 0.02, 0, T + 0.01, 0, c]);
      out.push(['back', Wd + 0.02, 0.28, 0.03, 0, T - 0.12, -F - 0.01, c]); sides(0.16, 0.02); break;
    case 'short': top(); fringe(0.05); back(0.32); sides(0.2); break;
    case 'side':
      top(); out.push(['top', Wd * 0.55, 0.06, D + 0.06, Lk.part * Wd * 0.22, T + 0.1, 0.01, c]);
      fringe(0.07, Wd * 0.7, Lk.part * Wd * 0.15); back(0.32); sides(0.2); break;
    case 'spiky':
      top();
      for (let k = 0; k < 5; k++) out.push(['top', 0.1, 0.12 + r() * 0.08, 0.1, (r() - 0.5) * (Wd - 0.1), T + 0.12, (r() - 0.5) * (D - 0.06), c]);
      fringe(0.04); back(0.3); sides(0.18); break;
    case 'curly':
      top(0.08, 0.12);
      for (const i of [-1, 0, 1]) for (const j of [-1, 1]) out.push(['top', 0.16, 0.14, 0.16, i * Wd * 0.33, T + 0.11, j * D * 0.3, c]);
      fringe(0.08); back(0.36); sides(0.26, 0.07); break;
    case 'afro':
      out.push(['top', Wd + 0.26, 0.36, D + 0.3, 0, T + 0.11, -0.05, c]);
      for (const s of [-1, 1]) out.push(['side', 0.15, 0.36, D + 0.14, s * (Wd / 2 + 0.06), T - 0.2, -0.05, c]);
      out.push(['back', Wd + 0.24, 0.5, 0.14, 0, T - 0.12, -F - 0.08, c]); break;
    case 'mohawk':
      out.push(['top', Wd + 0.01, 0.03, D + 0.01, 0, T + 0.005, 0, mix(c, Lk.skin, 0.5)]);
      out.push(['top', 0.1, 0.2, D + 0.12, 0, T + 0.1, -0.02, c]);
      out.push(['back', Wd + 0.02, 0.2, 0.03, 0, T - 0.08, -F - 0.01, mix(c, Lk.skin, 0.5)]); break;
    case 'receding':
      out.push(['top', Wd + 0.03, 0.08, D * 0.55, 0, T + 0.02, -D * 0.24, c]); back(0.3); sides(0.18); break;
    case 'bowl': top(0.06, 0.12); fringe(0.12, Wd + 0.04); back(0.36); sides(0.3, 0.05); break;
    case 'long': long(0.06); break;
    case 'bangs': long(0.12, Wd + 0.04); break;
    case 'ponytail':
      top(); fringe(0.06); back(0.28); sides(0.2);
      out.push(['tail', 0.13, 0.44, 0.12, 0, T - 0.26, -F - 0.1, c], ['tail', 0.15, 0.05, 0.14, 0, T - 0.04, -F - 0.08, Lk.tieC]); break;
    case 'bun': top(); fringe(0.05); back(0.3); sides(0.2); out.push(['top', 0.22, 0.18, 0.22, 0, T + 0.13, -0.07, c]); break;
    case 'bob':
      top(); fringe(0.1, Wd + 0.04);
      out.push(['back', Wd + 0.06, 0.44, 0.08, 0, T - 0.18, -F - 0.03, c]);
      for (const s of [-1, 1]) out.push(['side', 0.07, 0.44, D + 0.04, s * (Wd / 2 + 0.035), T - 0.18, 0, c]); break;
    case 'pigtails':
      top(); fringe(0.06); back(0.3); sides(0.22);
      for (const s of [-1, 1]) out.push(['tail', 0.12, 0.3, 0.12, s * (Wd / 2 + 0.1), T - 0.14, -0.05, c], ['tail', 0.14, 0.05, 0.14, s * (Wd / 2 + 0.1), T + 0.02, -0.05, Lk.tieC]);
      break;
    case 'pixie': top(); fringe(0.09, Wd * 0.75, Lk.part * Wd * 0.12); back(0.26); sides(0.16); break;
    case 'braid': top(); fringe(0.05); back(0.3); sides(0.22); out.push(['tail', 0.11, 0.62, 0.1, 0, T - 0.42, -F - 0.07, c]); break;
  }
}

/* ─────────────── лицо ───────────────
   Пиксель-арт на передней грани головы: Wp×16 пикселей, прозрачный фон
   (кожа — это сама голова, поэтому покрасневший от злости водитель
   краснеет целиком, а лицо остаётся). Игра рисует в половину разрешения
   с крупным пикселем — поэтому глаза и брови по два пикселя, без полутонов. */
const faceKey = (Lk, skin, Wp) => [Wp, skin, Lk.eyes, Lk.eyeC, Lk.gaze, Lk.brows, Lk.browC, Lk.mouth, Lk.lip, Lk.glasses, Lk.glassC,
  Lk.freckles, Lk.blush, Lk.mole, Lk.stubble && Lk.hairC, Lk.wrinkles].join('|') +
  (Lk.scar || Lk.bags || Lk.bristle ? '|' + [Lk.scar, Lk.bags, Lk.bristle && Lk.hairC].join('|') : '');   // особые черты — только у кого есть
/* fx — живое лицо (катсцены actorlife.js, портреты talkface.js): { blink — глаза закрыты, half — рот приоткрыт,
   talk — рот открыт (кадры речи: закрыт → приоткрыт → открыт) } */
const TALK_OPEN = { smile: 'laugh', open: 'oo', o: 'oo', frown: 'shout', grit: 'oo' };
const TALK_HALF = { smile: 'grin', open: 'open', o: 'o', frown: 'frownH', grit: 'gritH' };
function drawFace (x, Lk, skin, Wp, ox, oy, fx) {
  const px = (c, X, Y, w = 1, h = 1) => { x.fillStyle = c; x.fillRect(ox + X, oy + Y, w, h); };
  const cx = Wp / 2, e1 = cx - 4, e2 = cx + 2;
  const dark = mix(skin, '#1a0f0a', 0.35);
  if (Lk.stubble) { const sc = mix(skin, Lk.hairC, 0.4); for (let Y = 11; Y < 16; Y++) for (let X = 2; X < Wp - 2; X++) if ((X + Y) % 2 === 0) px(sc, X, Y); }
  if (Lk.wrinkles) { px(mix(skin, '#000000', 0.18), e1, 8, 2); px(mix(skin, '#000000', 0.18), e2, 8, 2); }
  if (Lk.blush) { const bc = mix(skin, '#ff5f75', 0.4); px(bc, cx - 6, 10, 2); px(bc, cx + 4, 10, 2); }
  if (Lk.freckles) { const fc = mix(skin, '#8a4a2a', 0.45); for (const [X, Y] of [[-5, 9], [-4, 10], [-3, 9], [2, 9], [3, 10], [4, 9]]) px(fc, cx + X, Y); }
  if (Lk.mole >= 0) px(mix(skin, '#2a1810', 0.6), ...[[cx + 3, 11], [cx - 4, 11], [cx + 2, 3]][Lk.mole]);
  // особые черты (шапка файла): щетина «три дня», мешки под глазами, шрам
  if (Lk.bristle) { const sc = mix(skin, Lk.hairC, 0.42); for (let Y = 10; Y < 16; Y++) for (let X = 2; X < Wp - 2; X++) if ((X + Y) % 2 === 0 || (X * 5 + Y * 3) % 7 === 0) px(sc, X, Y); }
  if (Lk.bags) { const bg = mix(skin, '#4a2a5a', 0.3); px(bg, e1, 8, 2); px(bg, e2, 8, 2); px(mix(skin, '#4a2a5a', 0.18), e1, 9, 2); px(mix(skin, '#4a2a5a', 0.18), e2, 9, 2); }
  if (Lk.scar) {
    const sc = mix(skin, '#8a2a2a', 0.5), st = mix(skin, '#f4e0d0', 0.5);
    const L = Lk.scar === 'eye' ? [[e2 + 1, 3], [e2 + 1, 4], [e2 + 1, 5], [e2 + 1, 8], [e2 + 1, 9], [e2 + 1, 10]]
      : Lk.scar === 'brow' ? [[e1 - 1, 2], [e1, 3], [e1 + 1, 4], [e1 + 2, 5]]
        : [[cx + 3, 8], [cx + 4, 9], [cx + 4, 10], [cx + 5, 11], [cx + 5, 12]];
    for (const [X, Y] of L) px(sc, X, Y);
    if (Lk.scar === 'cheek') { px(st, cx + 3, 10); px(st, cx + 6, 11); }          // стежки
  }
  // глаза
  const ec = Lk.eyeC;
  for (const [e, side] of [[e1, -1], [e2, 1]]) {
    if (fx && fx.blink) { px(dark, e, 7, 2, 1); if (Lk.eyes === 'lashes') px('#1d1a1f', side < 0 ? e - 1 : e + 2, 6); continue; }   // моргнул
    if (Lk.eyes === 'bulge') { px('#f4f1ea', e - 1, 5, 4, 3); px(ec, e + (Lk.gaze ? 1 : 0), 6); }
    if (Lk.eyes === 'alien') { px('#101014', side < 0 ? e - 2 : e, 5, 4, 3); px('#101014', side < 0 ? e - 1 : e, 8, 3); px('#e8f4ff', side < 0 ? e - 1 : e + 1, 5); }
    if (Lk.eyes === 'round' || Lk.eyes === 'lashes') px(ec, e, 6, 2, 2);
    if (Lk.eyes === 'lashes') px('#1d1a1f', side < 0 ? e - 1 : e + 2, 5);
    if (Lk.eyes === 'white') { px('#f4f1ea', e, 6, 2, 2); px(ec, e + Lk.gaze, 6, 1, 2); }
    if (Lk.eyes === 'narrow') px(ec, e, 7, 2, 1);
    if (Lk.eyes === 'sleepy') { px(dark, e, 6, 2, 1); px(ec, e, 7, 2, 1); }
  }
  // брови
  const bc = Lk.browC;
  for (const [e, s] of [[e1, -1], [e2, 1]]) {
    const inX = s < 0 ? e + 1 : e, outX = s < 0 ? e - 1 : e + 2;          // внутренний и внешний край
    switch (Lk.brows) {
      case 'thin': px(bc, e, 4, 2); break;
      case 'thick': px(bc, Math.min(e, outX), 3, 3, 2); break;
      case 'angry': px(bc, outX, 3); px(bc, s < 0 ? e : e + 1, 3); px(bc, inX, 4); break;       // внутрь и вниз — хмурится
      case 'sad': px(bc, outX, 4); px(bc, e, 3, 2); break;
      case 'raised': px(bc, e, 2, 2); break;
      case 'arched': px(bc, e, 3, 2); px(bc, outX, 4); break;
      case 'uni': if (s < 0) px(bc, e1 - 1, 4, e2 - e1 + 4); break;
    }
  }
  // рот
  const lc = Lk.lip || mix(skin, '#5a1f1f', 0.5), hole = '#3a1a1a', teeth = '#f4f1ea';
  // говорит: рот открыт — какой, зависит от выражения (смеётся, кричит, ахает)
  const mouth = fx && fx.talk ? (TALK_OPEN[Lk.mouth] || 'talk') : fx && fx.half ? (TALK_HALF[Lk.mouth] || 'half') : Lk.mouth;
  switch (mouth) {
    case 'talk': px(hole, cx - 2, 12, 4, 2); px(lc, cx - 2, 14, 4); break;
    case 'half': px(hole, cx - 2, 12, 4); px(lc, cx - 2, 13, 4); break;                                          // приоткрыт
    case 'grin': px(lc, cx - 3, 11); px(lc, cx + 2, 11); px(teeth, cx - 2, 12, 4); px(lc, cx - 2, 13, 4); break;   // улыбка с зубами
    case 'frownH': px(hole, cx - 2, 12, 4); px(lc, cx - 3, 13, 6); break;
    case 'gritH': px(teeth, cx - 2, 12, 4); px(hole, cx - 2, 13, 4); px(lc, cx - 3, 12, 1, 2); px(lc, cx + 2, 12, 1, 2); break;
    case 'laugh': px(lc, cx - 3, 11); px(lc, cx + 2, 11); px(hole, cx - 2, 12, 4, 2); px(teeth, cx - 2, 12, 4); break;
    case 'shout': px(hole, cx - 2, 12, 4, 3); px(teeth, cx - 2, 12, 4); px(lc, cx - 3, 13); px(lc, cx + 2, 13); break;
    case 'oo': px(hole, cx - 1, 11, 2, 3); px(lc, cx - 2, 12, 1, 1); px(lc, cx + 1, 12, 1, 1); break;
    case 'o': px(hole, cx - 1, 12, 2, 2); break;
    case 'grit': px(teeth, cx - 2, 12, 4); px(lc, cx - 3, 12); px(lc, cx + 2, 12); px(mix(teeth, '#000000', 0.35), cx - 1, 12); px(mix(teeth, '#000000', 0.35), cx + 1, 12); break;
    case 'line': px(lc, cx - 2, 12, 4); break;
    case 'smile': px(lc, cx - 2, 12, 4); px(lc, cx - 3, 11); px(lc, cx + 2, 11); break;
    case 'small': px(lc, cx - 1, 12, 2); break;
    case 'full': px(lc, cx - 2, 12, 4); px(mix(lc, '#ffffff', 0.15), cx - 1, 13, 2); break;
    case 'smirk': px(lc, cx - 2, 12, 4); px(lc, cx + 2, 11); break;
    case 'open': px('#3a1a1a', cx - 1, 12, 2, 2); px('#f4f1ea', cx - 1, 12, 2); break;
    case 'frown': px(lc, cx - 2, 12, 4); px(lc, cx - 3, 13); px(lc, cx + 2, 13); break;
  }
  // очки поверх глаз: оправа 4×4 и перемычка, дужки до краёв лица
  if (Lk.glasses !== 'none') {
    const gc = Lk.glassC;
    for (const e of [e1, e2]) {
      const X = e - 1;
      px(gc, X, 5, 4); px(gc, X, 8, 4); px(gc, X, 6, 1, 2); px(gc, X + 3, 6, 1, 2);
      if (Lk.glasses === 'round') { x.clearRect(ox + X, oy + 5, 1, 1); x.clearRect(ox + X + 3, oy + 5, 1, 1); x.clearRect(ox + X, oy + 8, 1, 1); x.clearRect(ox + X + 3, oy + 8, 1, 1); }
      if (Lk.glasses === 'sun') { px('#1d1a1f', X + 1, 6, 2, 2); px('#8a9aa8', X + 1, 6); }
    }
    px(gc, cx - 1, 6, 2); px(gc, 0, 6, cx - 5); px(gc, cx + 5, 6, Wp - cx - 5);
  }
}

/* текстуры лиц: одна на сочетание черт, общая для всех таких людей */
const FACE_CAP = 240;

/* ─────────────── человек в три.js ───────────────
   Фабрика, потому что общий материал и множество людей живут в игре.
   Вызовов отрисовки на человека восемь: две ноги, туловище, две руки,
   голова, лицо и всё, что на голове, одним мешем; плюс дальний вариант
   одним мешем (виден вместо остальных дальше 45 метров). */
export function createHumanFactory ({ THREE, HUMAN_VC, HUMANS }) {
  const B = new THREE.BoxGeometry(1, 1, 1);
  const BP = B.attributes.position.array, BN = B.attributes.normal.array, BI = B.index.array;
  const lin = new Map();
  const col = hex => {
    let c = lin.get(hex);
    if (!c) { const k = new THREE.Color(hex); c = [k.r, k.g, k.b]; lin.set(hex, c); }
    return c;
  };
  /* склейка коробок сразу в буферы — без сотни BoxGeometry на человека */
  function geo (lists) {
    let n = 0;
    for (const [l] of lists) n += l.length;
    const pos = new Float32Array(n * 72), nor = new Float32Array(n * 72), cl = new Float32Array(n * 72), idx = new Uint16Array(n * 36);
    let b = 0;
    for (const [l, ox, oy, oz] of lists) for (const [w, h, d, x, y, z, hex] of l) {
      const c = col(hex), o = b * 72;
      for (let v = 0; v < 72; v += 3) {
        pos[o + v] = BP[v] * w + x + ox; pos[o + v + 1] = BP[v + 1] * h + y + oy; pos[o + v + 2] = BP[v + 2] * d + z + oz;
        nor[o + v] = BN[v]; nor[o + v + 1] = BN[v + 1]; nor[o + v + 2] = BN[v + 2];
        cl[o + v] = c[0]; cl[o + v + 1] = c[1]; cl[o + v + 2] = c[2];
      }
      for (let k = 0; k < 36; k++) idx[b * 36 + k] = BI[k] + b * 24;
      b++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  }
  const FACES = new Map();
  function faceMat (Lk, S) {
    let m = FACES.get(S.face);
    if (m) { FACES.delete(S.face); FACES.set(S.face, m); return m; }       // свежие — в конец очереди
    const c = document.createElement('canvas');
    c.width = S.Wp; c.height = 16;
    drawFace(c.getContext('2d'), Lk, S.skin, S.Wp, 0, 0);
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.magFilter = tx.minFilter = THREE.NearestFilter;
    tx.generateMipmaps = false;
    m = new THREE.MeshLambertMaterial({ map: tx, alphaTest: 0.5 });
    m.userData.keep = true;                       // общий: dropMesh его не трогает
    FACES.set(S.face, m);
    if (FACES.size > FACE_CAP) {                  // самые давние — вон; если кто-то ещё с ним ходит, три.js зальёт заново
      const [k, old] = FACES.entries().next().value;
      FACES.delete(k); old.map.dispose(); old.dispose();
    }
    return m;
  }
  /* o: { fem, fat, h, skin, shirt, pants, cap, face: false — без лица (маска), summer — без зимней одежды } */
  HSET = HUMANS;
  /* та же фигура и лицо, одежда — по нынешнему сезону */
  REDRESS = g => {
    const u = g.userData, S = buildSpec(u.look, u.o || {});
    for (let i = 0; i < 5; i++) { const m = u.parts[i]; m.geometry.dispose(); m.geometry = geo([[S.parts[i], 0, 0, 0]]); }
    if (u.hair) { u.hair.geometry.dispose(); if (S.parts[5].length) u.hair.geometry = geo([[S.parts[5], 0, 0, 0]]); else { u.head.remove(u.hair); u.hair = null; } }
    else if (S.parts[5].length) { u.hair = new THREE.Mesh(geo([[S.parts[5], 0, 0, 0]]), HUMAN_VC); u.head.add(u.hair); }
    u.lod.geometry.dispose(); u.lod.geometry = geo(S.parts.map((l, i) => [l, ...S.piv[i]]));
    u.colors.shirt = S.shirt; u.colors.pants = S.pants; u.warm = WARM;
  };
  /* сборка по шагам (запас людей, humanpool.js, — понемногу в спокойные кадры): yield между кусками,
     человек — в return. makeHuman — то же разом. Внешность одна и та же: шаги ничего не решают сами */
  function* steps (person, o = {}) {
    const Lk = person && person.look ? person.look : makeLook(newSeed(), { fem: o.fem });
    const S = buildSpec(Lk, o), w0 = WARM;
    yield;
    const g = new THREE.Group();
    const mk = (i, parent = g) => {
      const m = new THREE.Mesh(geo([[S.parts[i], 0, 0, 0]]), HUMAN_VC);
      m.position.set(...S.piv[i]);
      parent.add(m);
      return m;
    };
    const legL = mk(0), legR = mk(1), bodyM = mk(2);
    yield;
    const armL = mk(3), armR = mk(4);
    // голова: свой материал цвета кожи — игра красит его (злой водитель, вор в маске)
    const head = new THREE.Mesh(geo([[S.parts[6], 0, 0, 0]]), new THREE.MeshLambertMaterial({ color: S.skin, flatShading: true }));
    head.position.set(0, HY, 0);
    g.add(head);
    yield;
    if (o.face !== false) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(S.W, 0.56), faceMat(Lk, S));
      face.position.z = S.D / 2 + 0.002;
      head.add(face);
      yield;
    }
    const hair = S.parts[5].length ? new THREE.Mesh(geo([[S.parts[5], 0, 0, 0]]), HUMAN_VC) : null;
    if (hair) head.add(hair);
    // дальний вариант: весь человек одним мешем
    const lod = new THREE.Mesh(geo(S.parts.map((l, i) => [l, ...S.piv[i]])), HUMAN_VC);
    lod.visible = false;
    g.add(lod);
    g.scale.setScalar(S.hs);
    g.userData = { legL, legR, armL, armR, head, faceM: head.children.find(m => m.geometry && m.geometry.type === 'PlaneGeometry') || null, faceS: { skin: S.skin, Wp: S.Wp }, colors: { skin: S.skin, shirt: S.shirt, pants: S.pants }, person, fem: S.fem, fat: S.fat, pace: S.pace,
      lod, parts: [legL, legR, bodyM, armL, armR, head], far: false, look: Lk, o, hair, warm: w0 };
    HUMANS.add(g);
    return g;
  }
  const makeHuman = (person, o = {}) => { const it = steps(person, o); let r = it.next(); while (!r.done) r = it.next(); return r.value; };
  makeHuman.steps = steps;
  return makeHuman;
}

/* ─────────────── портрет ───────────────
   Вид спереди тех же коробок, 32×32 пикселя лица, по дальности
   (что ближе к зрителю — поверх), дальние чуть темнее; по краю —
   тёмный контур, фон — пастельный по зерну. */
const PORTRAITS = new Map();
/* настроение (экран оплаты заказа, game.js popPay): те же черты, другие брови и рот.
   Выражения реплик в катсценах (story.js { emo }, actorlife.js) — те же: радуется, злится,
   грустит, пугается (глаза-плошки, сжатые зубы), удивляется (глаза-плошки, рот «о») */
export const EMO_FACE = {
  happy: { brows: 'raised', mouth: 'smile' },
  angry: { brows: 'angry', mouth: 'frown' },
  sad: { brows: 'sad', mouth: 'frown' },
  scared: { brows: 'sad', mouth: 'grit', eyes: 'white', gaze: 0 },
  surprised: { brows: 'raised', mouth: 'o', eyes: 'white', gaze: 0 },
};
const MOOD_FACE = { ...EMO_FACE, ok: { brows: 'thin', mouth: 'line' } };
/* лицо одним кадром — для живых лиц катсцен (actorlife.js): Wp×16, прозрачный фон */
export function drawFaceFrame (ctx, Lk, skin, Wp, fx) {
  ctx.clearRect(0, 0, Wp, 16);
  drawFace(ctx, Lk, skin, Wp, 0, 0, fx);
}
/* Портреты — дорогие (рисование + PNG): кэш по человеку × размеру × выражению × кадру рта, самые давно не нужные — вон
   (FACE_CAP_P). Холсты — свои, общие, «для чтения» (willReadFrequently): так они живут в памяти процессора, и чтение
   пикселей (контур) и PNG не ждут видеокарту — было 2—5 мс за портрет на «Деке», стало ~0,5 (docs/AGENTS.md
   «Граффити и портреты»). faceSoon — дорисовать заранее, в спокойные кадры (requestIdleCallback): кадры рта
   говорящего (talkface.js), настроения мини-карточек заказа (ordertags.js). Картинки — пиксель в пиксель прежние. */
const FACE_CAP_P = 500;
export const FACE_STATS = { n: 0, hit: 0, miss: 0, ms: 0, max: 0, soon: 0, soonMs: 0, soonMax: 0, evict: 0 };
let PCV = null;
const portraitCanvas = () => {
  if (PCV) return PCV;
  const c = document.createElement('canvas'), out = document.createElement('canvas');
  c.width = c.height = 32;
  PCV = { c, x: c.getContext('2d', { willReadFrequently: true }), out, o: out.getContext('2d', { willReadFrequently: true }) };
  return PCV;
};
const faceLook = (person, mood) => {
  const Lk = person.look || makeLook(person.seed >>> 0 || 1);
  return MOOD_FACE[mood] ? Object.assign({}, Lk, MOOD_FACE[mood]) : Lk;
};
const portraitKey = (person, Lk, size, mood, talk) => (person.id || Lk.seed) + ':' + size + (mood ? ':' + mood : '') + (talk ? ':t' + talk : '');
/* talk — кадр речи (talkface.js): 0 — рот как у выражения, 1 — приоткрыт, 2 — открыт */
export function faceDataURL (person, size = 128, mood = '', talk = 0) {
  if (!person) return '';
  FACE_STATS.n++;
  const Lk = faceLook(person, mood), key = portraitKey(person, Lk, size, mood, talk);
  const hit = PORTRAITS.get(key);
  if (hit) { FACE_STATS.hit++; PORTRAITS.delete(key); PORTRAITS.set(key, hit); return hit; }      // свежие — в конец очереди
  const t0 = performance.now(), url = drawPortrait(Lk, size, talk), e = performance.now() - t0;
  FACE_STATS.miss++; FACE_STATS.ms += e; if (e > FACE_STATS.max) FACE_STATS.max = e;
  keepPortrait(key, url);
  return url;
}
function keepPortrait (key, url) {
  PORTRAITS.set(key, url);
  if (PORTRAITS.size > FACE_CAP_P) { PORTRAITS.delete(PORTRAITS.keys().next().value); FACE_STATS.evict++; }
}
function drawPortrait (Lk, size, talk) {
  const S = buildSpec(Lk);
  const G = 32, PY = 14;
  const { c, x, out, o } = portraitCanvas();
  c.width = G;                                    // чистый холст и настройки по умолчанию — как у нового
  const rects = [];
  const add = (w, h, d, bx, by, bz, hex) => rects.push({
    x0: Math.round(G / 2 + (bx - w / 2) / U), x1: Math.round(G / 2 + (bx + w / 2) / U),
    y0: Math.round(PY - (by + h / 2 - HY) / U), y1: Math.round(PY - (by - h / 2 - HY) / U), z: bz + d / 2, hex,
  });
  S.parts.forEach((l, i) => { const [ox, oy, oz] = S.piv[i]; for (const [w, h, d, bx, by, bz, hex] of l) add(w, h, d, bx + ox, by + oy, bz + oz, hex); });
  rects.push({ face: true, z: S.D / 2 + 0.002 });
  rects.sort((a, b) => a.z - b.z);
  for (const q of rects) {
    if (q.face) { drawFace(x, Lk, S.skin, S.Wp, G / 2 - S.Wp / 2, PY - 8, talk ? { talk: talk === 2, half: talk === 1 } : undefined); continue; }
    if (q.x1 <= q.x0 || q.y1 <= q.y0) continue;
    x.fillStyle = q.z < S.D / 2 - 0.04 ? mix(q.hex, '#000000', 0.18) : q.hex;
    x.fillRect(q.x0, q.y0, q.x1 - q.x0, q.y1 - q.y0);
  }
  // контур: прозрачный пиксель рядом с непрозрачным — тёмный
  const im = x.getImageData(0, 0, G, G), a = im.data, edge = [];
  for (let yy = 0; yy < G; yy++) for (let xx = 0; xx < G; xx++) {
    const i = yy * G + xx;
    if (a[i * 4 + 3]) continue;
    if ((xx > 0 && a[i * 4 - 1] > 0) || (xx < G - 1 && a[i * 4 + 7] > 0) || (yy > 0 && a[(i - G) * 4 + 3] > 0) || (yy < G - 1 && a[(i + G) * 4 + 3] > 0)) edge.push(i);
  }
  for (const i of edge) { a[i * 4] = 0x33; a[i * 4 + 1] = 0x21; a[i * 4 + 2] = 0x0c; a[i * 4 + 3] = 255; }
  // увеличить до size «по пикселям» на фоне — руками, как это делала видеокарта (drawImage без сглаживания): пиксель под
  // центром нового. При дробном увеличении (48 из 32) центр иногда ровно на границе двух — тогда в первых 3/8 стороны
  // берётся левый (верхний), дальше и в последней строке (столбце) — правый (нижний); так картинка 48 совпадает с прежней
  // пиксель в пиксель (tools/probe-checks/portraits.js). Холст в памяти процессора сам увеличил бы иначе
  out.width = out.height = size;
  if (size % G === 0) {                           // целое увеличение — холст делает то же самое сам, быстрее
    x.putImageData(im, 0, 0);
    o.fillStyle = Lk.bg; o.fillRect(0, 0, size, size);
    o.imageSmoothingEnabled = false;
    o.drawImage(c, 0, 0, size, size);
    return out.toDataURL('image/png');
  }
  const big = o.createImageData(size, size), B = big.data, bg = hexRgb(Lk.bg);
  const map = (last) => { const m = new Int32Array(size); for (let X = 0; X < size; X++) { const v = (X + 0.5) * G / size, c = Math.ceil(v); m[X] = Math.min(G - 1, Math.max(0, c === v && (last || v * 8 > G * 3) ? c : c - 1)); } return m; };
  const sx = map(false), sxL = map(true);
  for (let Y = 0, p = 0; Y < size; Y++) {
    const cols = Y === size - 1 ? sxL : sx, row = sx[Y] * G, rowL = sxL[Y] * G;   // последний столбец берёт строку как «последний»
    for (let X = 0; X < size; X++, p += 4) {
      const q = ((X === size - 1 ? rowL : row) + cols[X]) * 4, al = a[q + 3];
      if (al === 255) { B[p] = a[q]; B[p + 1] = a[q + 1]; B[p + 2] = a[q + 2]; }
      else if (!al) { B[p] = bg[0]; B[p + 1] = bg[1]; B[p + 2] = bg[2]; }
      else { const k = al / 255; B[p] = Math.round(bg[0] + (a[q] - bg[0]) * k); B[p + 1] = Math.round(bg[1] + (a[q + 1] - bg[1]) * k); B[p + 2] = Math.round(bg[2] + (a[q + 2] - bg[2]) * k); }
      B[p + 3] = 255;
    }
  }
  o.putImageData(big, 0, 0);
  return out.toDataURL('image/png');
}
/* дорисовать заранее: кадры talks (по умолчанию — закрыт, приоткрыт, открыт) для каждого выражения moods.
   Рисуется в спокойные кадры, по портрету, пока у кадра есть запас > 3 мс; не успели за 1 с — по одному */
const SOON = [];
let soonOn = false;
export function faceSoon (person, size = 128, moods = [''], talks = [0, 1, 2]) {
  if (!person) return;
  for (const m of moods) for (const k of talks) if (SOON.length < 240) SOON.push([person, size, m || '', k]);
  if (!soonOn && SOON.length) { soonOn = true; idle(soonStep); }
}
const idle = fn => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 1000 }) : setTimeout(() => fn(null), 60));
function soonStep (dl) {
  let n = 0;
  while (SOON.length && (dl ? dl.timeRemaining() > 3 || (dl.didTimeout && !n) : !n)) {
    const [person, size, mood, talk] = SOON.shift(), Lk = faceLook(person, mood), key = portraitKey(person, Lk, size, mood, talk);
    if (PORTRAITS.has(key)) continue;
    const t0 = performance.now(), url = drawPortrait(Lk, size, talk), e = performance.now() - t0;
    FACE_STATS.soon++; FACE_STATS.soonMs += e; if (e > FACE_STATS.soonMax) FACE_STATS.soonMax = e;
    keepPortrait(key, url);
    n++;
  }
  if (SOON.length) idle(soonStep); else soonOn = false;
}
/* готов ли кадр (без рисования) — talkface.js: не готов — пока показывает закрытый рот */
export function faceReady (person, size = 128, mood = '', talk = 0) {
  if (!person) return '';
  const Lk = faceLook(person, mood), key = portraitKey(person, Lk, size, mood, talk), u = PORTRAITS.get(key);
  if (u) { PORTRAITS.delete(key); PORTRAITS.set(key, u); }
  return u || '';
}
faceDataURL.soon = faceSoon;
export const FACE_DEBUG = { S: FACE_STATS, url: faceDataURL, soon: faceSoon, ready: faceReady, size: () => PORTRAITS.size, queue: () => SOON.length, clear: () => { PORTRAITS.clear(); SOON.length = 0; }, CAP: FACE_CAP_P };
