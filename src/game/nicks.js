/* ──────────────────────────────────────────────────────────────────────────
   Ники и аватарки клиентов (автор 16.10.2026: «аватарки у людей рандомные — знак вопроса, бэтмен, жирный чел,
   мазня, член; имена дурацкие — мистер Челибанистер, баронесса, Бобби за пенис; иногда просто Ирина или Алексей
   Андреевич; иногда с ошибкой»). Правила — docs/ORDERS.md «Ники и аватарки клиентов».

   Это то, что клиент поставил себе в приложении доставки: накладная, мини-карточка у радара, оплата, карта,
   накладная в домофоне и на лестнице, подпись у двери. Живой человек у двери — со своим настоящим лицом
   (people.js faceDataURL), ник — только подписью.

   Один человек — один ник и одна аватарка навсегда: всё выводится из его зерна (person.seed), так что тот же
   клиент в другой смене — с тем же ником (язык ников — по языку игры в момент заказа).
   Без тёзок (автор 18.10.2026: «ник Шпашка два раза попался, но это разные заказы»): у разных клиентов подпись в
   приложении не повторяется в этой смене и в NK.WIN прошлых — журнал «подпись → чьё зерно, в какой смене»
   (сохранение NK.KEY). Выпало занятое — другое того же вида: обычное имя — другое обычное имя (другая форма или с
   ошибкой), ник — свободный ник; ников свободных нет — обычное имя; совсем ничего — повтор (на 200 заказах подряд — 0).
   Тот же человек в окне — та же подпись.

     NICK.init({ adult, store })   — один раз из game.js (взрослое — только при ADULT; store — Store игры: журнал
                                     подписей и номер смены dlv-shifts)
     NICK.tagOrder(order)          — заказ принят (game.js newOrder): получателям — ник и аватарка (person.app)
     NICK.of(person)               — { nick, kind: 'nick' | 'name' | 'typo', av: 'face' | 'q' | 'bat' | … } (и ставит person.app)
     NICK.label(person, fallback)  — что написано в приложении: ник, если клиент заказа; иначе — имя
     NICK.avatar(person, size, mood) — картинка аватарки (dataURL); «face» — обычный портрет; мазня — 64 px,
                                     у мини-карточки и оплаты в углу — наклейка настроения (ok / angry / happy)
   Доли — NK ниже. Отладка: __dlv.NICK (NK, stats, of, roll(n) — доли на n случайных клиентов).
   ────────────────────────────────────────────────────────────────────────── */
import { lang } from '../i18n/index.js';
import { faceDataURL } from './people.js';

export const NK = {
  NICK: 0.55,        // дурацкий ник
  NAME: 0.35,        // обычное имя («Ирина», «Алексей Андреевич», «Света Н.»)
  // остальное (0,10) — обычное имя с ошибкой («Ирниа», «серега», капсом, не та раскладка)
  FACE: 0.40,        // аватарка — обычное лицо; остальное — мазня по весам AV
  PX: 64,            // мазня рисуется в 64 × 64
  CAP: 160,          // картинок мазни в кэше (самые давно не нужные — вон)
  WIN: 5,            // подпись не повторяется у разных клиентов в этой смене и в стольких прошлых
  KEY: 'dlv-nicks',  // сохранение профиля: журнал подписей [[подпись, зерно, смена], …]
};
/* мазня: вид → вес (среди 60 % не-лиц). dick — только во взрослой */
const AV = { q: 12, bat: 7, fat: 7, scribble: 9, cat: 9, car: 6, sunset: 7, eye: 5, pix: 7, dark: 6, flower: 6, dick: 5 };

let ADULT = false, STORE = null;
export const stats = { tagged: 0, drawn: 0, hit: 0, swapped: 0 };
export function init (o = {}) { ADULT = !!o.adult; STORE = o.store || null; REG.loaded = false; }

/* ─────────────── журнал подписей: без тёзок в окне смен ───────────────
   by — подпись (нормализованная: маленькими, «ё» → «е») → { s: зерно, sh: смена, n: подпись как есть };
   of — зерно → подпись (нормализованная). Номер смены — dlv-shifts (career.js: идёт смена n, в конце n + 1). */
const REG = { by: new Map(), of: new Map(), loaded: false, sh: -1 };
const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const shiftNow = () => { try { return STORE ? (+STORE.get('dlv-shifts', 0) || 0) : 0; } catch (e) { return 0; } };
function regLoad () {
  REG.by.clear(); REG.of.clear(); REG.loaded = true;
  let v = null;
  try { v = STORE ? STORE.get(NK.KEY, null) : null; } catch (e) { v = null; }
  const cut = shiftNow() - NK.WIN;
  if (Array.isArray(v)) for (const e of v) if (Array.isArray(e) && typeof e[0] === 'string' && (+e[2] || 0) >= cut) regPut(e[0], e[1] >>> 0, +e[2] || 0);
}
function regPut (nick, seed, sh) {
  const k = norm(nick), old = REG.of.get(seed);
  if (old !== undefined && old !== k && REG.by.get(old) && REG.by.get(old).s === seed) REG.by.delete(old);
  REG.by.set(k, { s: seed, sh, n: nick });
  REG.of.set(seed, k);
}
function regSave () {
  if (!STORE) return;
  const cut = shiftNow() - NK.WIN, out = [];
  for (const [k, e] of REG.by) { if (e.sh < cut) { REG.by.delete(k); if (REG.of.get(e.s) === k) REG.of.delete(e.s); } else out.push([e.n, e.s, e.sh]); }
  try { STORE.set(NK.KEY, out); } catch (e) { /* — */ }
}
const taken = (nick, seed) => { const e = REG.by.get(norm(nick)); return !!e && e.s !== seed && e.sh >= shiftNow() - NK.WIN; };
/* подпись клиента заказа: своя из журнала (тот же человек в окне), иначе — от зерна; занята другим — свободная */
function claim (p, a, seed) {
  if (STORE || !REG.loaded) regLoad();   // из сохранения каждый раз (раз на клиента): сменил профиль без перезагрузки — журнал его
  const sh = shiftNow();
  const mine = REG.of.get(seed), e = mine !== undefined && REG.by.get(mine);
  if (e && e.s === seed && e.sh >= sh - NK.WIN) { a.nick = e.n; if (e.sh !== sh) { e.sh = sh; regSave(); } return; }
  if (taken(a.nick, seed)) {
    const r = rng(seed ^ 0xA11CE5), fem = !!p.f;
    const free = list => list.filter(n => !taken(n, seed));
    let nick = '';
    if (a.kind !== 'nick') for (let k = 0; k < 8 && !nick; k++) { const n = a.kind === 'typo' ? typo(plainName(p, r), r) : plainName(p, r); if (n && !taken(n, seed)) nick = n; }
    if (!nick) { const f = free(fitList(ruFam() ? RU : EN, fem)); if (f.length) { nick = P(r, f); a.kind = 'nick'; } }
    for (let k = 0; k < 8 && !nick; k++) { const n = plainName(p, r); if (n && !taken(n, seed)) { nick = n; a.kind = 'name'; } }   // ники кончились — обычное имя
    if (nick) { a.nick = nick; stats.swapped++; }
  }
  regPut(a.nick, seed, sh);
  regSave();
}

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
function W (r, o) {
  let s = 0;
  for (const k in o) s += o[k];
  let x = r() * s;
  for (const k in o) if ((x -= o[k]) < 0) return k;
  return Object.keys(o)[0];
}

/* ─────────────── ники ───────────────
   Пометки: «f:» — только у женщин, «m:» — только у мужчин, «a:» — только во взрослой (можно вместе: «af:»).
   Список автора (16.10) + свои в том же духе, «как ники со Стима с русского форума». Чужие герои и бренды —
   слегка переделаны (Шрутов, Скоттт, Макдолнальд, Бетмэн_86). Ники — имена, не переводятся. */
const L = s => s.split('|').map(x => x.trim()).filter(Boolean);
const RU = L(`
  Ричкид | a:Кидсловер | m:Братислав | m:Робинслав | f:Баронесса | m:Бригадир66 | m:Дуайт Шрутов | m:Майкл Гэри Скоттт |
  m:Райан | m:Кевин Мэлоунов | m:Джим Халпертов | Смелкид | Драконий кашель | m:Старый безумец | m:Хозяин ситуации |
  f:Хозяйка ситуации | Ямайкаси | m:Колдун | a:Пердун | Стакан семок | Какомелон | Кокодемон | m:Пиджак | m:Волосач |
  Барбос | m:Борода | f:Келли | f:ДаШка | Шпашка | a:Какашка | a:Мега_срака | a:Боль в жопе | a:Анальная трещина |
  Банановый расколбас | Коалкдадкд | f:Лолка | Кеклик | a:Спермабак | a:Спермособака | Эушта | m:Калужский |
  m:Северский типок | Макдолнальд | Рональд Далбодольнадь | a:m:Владимир Гутлер | a:Расист | m:Мистер Челибанистер |
  a:Бобби за пенис |

  m:Бетмэн_86 | Нагибатор3000 | xX_УбиВаШкА_Xx | m:Тракторист | m:ДедМакар | Пельмень | Злой Бублик | m:Шаурмен |
  Картофан | Пупсик | f:Зайка_моя | f:Кисуля | Танкист_95 | m:Сантехник Валера | m:Олег из подъезда | Кот Борис |
  НЕ ЗВОНИТЬ | Оставьте у двери | f:Мама | m:Сынуля | f:Жена | . | f:Бабуля 2007 | m:Батя в здании |
  Пончик_Любви | Кефирчик | Колбасный цех | ГлавБух | m:Лёха Ракета | Шрэкъ | ВасяПупкин | Ночной жор | Анонимус |
  Пользователь 3329 | user4815162 | Птица Говорун | Тролль_обыкновенный | m:Комбайнёр | Сосед сверху | Слоупок |
  f:КиберБабка | m:Геральд из Северска | m:Гарри Поттеров | Таноз_грустный | Капитан Очевидность |
  a:Хрен Моржовый | a:Писюнчик | a:Жопкинс | a:Чебурашка_ебурашка | a:Сиськи_Пиписькин | a:Бухой_Ёжик |
  f:Королева_Бензоколонки | m:Принц Самокатный | Шашлычок | Синий трактор | f:Милашка_93 | m:Вован_Сила
`);
const EN = L(`
  Richkid | a:KidsLover | m:Bratislav | f:Baroness | m:Brigadier66 | m:Dwight Shrutt | m:Michael Gary Scottt | m:Ryan |
  m:Kevin Malonee | m:Jim Halpertt | Smellkid | Dragon Cough | m:Old Madman | m:Master of the Situation |
  f:Mistress of the Situation | a:Farty | Bag of Seeds | Kakomelon | m:Wizard | Jacket | m:Hairy | m:Beard |
  f:Kelly | f:DaSHka | a:Poopy | a:MegaButt | a:Pain In The Ass | a:Anal Fissure | Banana Bonanza | Koalkdadkd |
  f:Lolka | Keklik | a:Sperm Whale Jr | McDolnald | Ronald Dumbdonaldd | a:m:Vladimir Gutler | a:Racist |
  m:Mr Chellybanister | a:Bobby4Penis |

  m:Batmaan_86 | xX_Sn1per_Xx | Destroyer3000 | m:TractorGuy | Dumpling | Angry Bagel | m:Shawarma Man | Potato |
  DO NOT CALL | leave at door | f:Mom | f:Wife | . | f:Grandma2007 | m:Big Daddy | Donut_of_Love | Night Snack |
  Anonymous | user4815162 | Captain Obvious | Slowpoke | m:Pickle Rikk | m:Harry Potterr | Thanoss_sad |
  a:Big Dick Energy | a:Butt Pirate | f:Gas Station Queen | m:Scooter Prince | f:Cutie_93
`);
/* русские отчества: [м, ж] */
const PATR = [['Андреевич', 'Андреевна'], ['Сергеевич', 'Сергеевна'], ['Петрович', 'Петровна'], ['Иванович', 'Ивановна'],
  ['Николаевич', 'Николаевна'], ['Владимирович', 'Владимировна'], ['Александрович', 'Александровна'], ['Викторович', 'Викторовна'],
  ['Юрьевич', 'Юрьевна'], ['Михайлович', 'Михайловна'], ['Геннадьевич', 'Геннадьевна'], ['Олегович', 'Олеговна'],
  ['Анатольевич', 'Анатольевна'], ['Валерьевич', 'Валерьевна'], ['Борисович', 'Борисовна']];
/* уменьшительные: как подписываются в приложении («Света Н.», «серега») */
const DIM = {
  'Александр': 'Саша', 'Алексей': 'Лёша', 'Андрей': 'Андрюха', 'Антон': 'Тоха', 'Артём': 'Тёма', 'Борис': 'Боря', 'Вадим': 'Вадик',
  'Василий': 'Вася', 'Виктор': 'Витя', 'Виталий': 'Виталик', 'Владислав': 'Влад', 'Геннадий': 'Гена', 'Георгий': 'Жора',
  'Григорий': 'Гриша', 'Даниил': 'Даня', 'Денис': 'Дэн', 'Дмитрий': 'Дима', 'Егор': 'Егорка', 'Иван': 'Ваня', 'Игорь': 'Игорёк',
  'Илья': 'Илюха', 'Кирилл': 'Киря', 'Константин': 'Костя', 'Максим': 'Макс', 'Михаил': 'Миша', 'Никита': 'Никитос',
  'Николай': 'Коля', 'Олег': 'Олежка', 'Павел': 'Паша', 'Пётр': 'Петя', 'Роман': 'Рома', 'Сергей': 'Серёга', 'Степан': 'Стёпа',
  'Юрий': 'Юра', 'Ярослав': 'Слава', 'Анастасия': 'Настя', 'Анна': 'Аня', 'Валерия': 'Лера', 'Варвара': 'Варя', 'Галина': 'Галя',
  'Дарья': 'Даша', 'Евгения': 'Женя', 'Екатерина': 'Катя', 'Елена': 'Лена', 'Елизавета': 'Лиза', 'Ирина': 'Ира', 'Ксения': 'Ксюша',
  'Людмила': 'Люда', 'Мария': 'Маша', 'Наталья': 'Наташа', 'Ольга': 'Оля', 'Светлана': 'Света', 'Софья': 'Соня', 'Татьяна': 'Таня',
  'Юлия': 'Юля', 'Алёна': 'Алёнка', 'Вероника': 'Ника', 'Виктория': 'Вика', 'Маргарита': 'Рита', 'Надежда': 'Надя', 'Любовь': 'Люба',
  'William': 'Bill', 'Robert': 'Bob', 'James': 'Jim', 'Michael': 'Mike', 'Thomas': 'Tom', 'Daniel': 'Dan', 'Elizabeth': 'Liz',
  'Katherine': 'Kate', 'Jennifer': 'Jen', 'Samantha': 'Sam', 'Christopher': 'Chris', 'Matthew': 'Matt', 'Joseph': 'Joe',
};
/* русская раскладка → та же клавиша в латинской («забыл переключить»: Ирина → Bhbyf) */
const KB_RU = 'йцукенгшщзхъфывапролджэячсмитьбю', KB_EN = 'qwertyuiop[]asdfghjkl;\'zxcvbnm,.';
const KB = {};
for (let i = 0; i < KB_RU.length; i++) KB[KB_RU[i]] = KB_EN[i];
const wrongLayout = s => s.split('').map(c => { const lo = c.toLowerCase(), k = KB[lo === 'ё' ? 'е' : lo]; return k ? (c !== lo ? k.toUpperCase() : k) : c; }).join('');

const ruFam = () => /^(ru|be|kk|uz|uk)$/.test(lang());
const firstOf = p => (p && (p.first || String(p.name || '').split(/\s+/)[0])) || '';
const lastOf = p => (p && (p.last || String(p.name || '').split(/\s+/).slice(1).join(' '))) || '';
const fitList = (list, fem) => list.filter(s => {
  const m = /^([afm]+):/.exec(s); if (!m) return true;
  if (m[1].includes('a') && !ADULT) return false;
  if (m[1].includes('f') && !fem) return false;
  if (m[1].includes('m') && fem) return false;
  return true;
}).map(s => s.replace(/^([afm]+:)+/, ''));

/* обычное имя, как подписываются: «Ирина» / «Алексей Андреевич» / «Света Н.» / «Ирина Белова» */
function plainName (p, r) {
  const first = firstOf(p), last = lastOf(p), ru = ruFam() && /[а-яё]/i.test(first);
  const k = r();
  if (k < 0.32 || !first) return first || String(p.name || '');
  if (ru && k < 0.58) return first + ' ' + P(r, PATR)[p.f ? 1 : 0];
  if (k < 0.8) return (DIM[first] || first) + (last ? ' ' + last[0] + '.' : '');
  return last ? first + ' ' + last : first;
}
/* с ошибкой: переставил буквы, пропустил, удвоил, маленькими, капсом, не та раскладка */
function typo (s, r) {
  const kind = W(r, { swap: 3, drop: 2, dbl: 1, low: 3, caps: 2, kb: 1 });
  const ix = () => 1 + ((r() * Math.max(1, s.length - 3)) | 0);
  const letter = i => /\p{L}/u.test(s[i] || '') && /\p{L}/u.test(s[i + 1] || '');
  if (kind === 'low') return s.toLowerCase().replace(/ё/g, 'е').replace(/\s+\S\.$/, '');
  if (kind === 'caps') return s.toUpperCase();
  if (kind === 'kb' && /[а-яё]/i.test(s)) return wrongLayout(s);
  for (let n = 0; n < 8; n++) {
    const i = ix();
    if (!letter(i)) continue;
    if (kind === 'swap' && s[i] !== s[i + 1]) return s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2);
    if (kind === 'drop') return s.slice(0, i) + s.slice(i + 1);
    if (kind === 'dbl') return s.slice(0, i) + s[i] + s.slice(i);
  }
  return s.toLowerCase();
}

/* ник и аватарка человека — от зерна, раз и навсегда (кэш — person.app) */
export function of (p, dry) {
  if (!p) return null;
  if (p.app && p.app.adult === ADULT) return p.app;
  const seed = (p.seed !== undefined ? p.seed : hashStr(String(p.id || p.name || ''))) >>> 0;
  const r = rng(seed ^ 0x5EED1C4);
  const x = r();
  let nick, kind;
  if (x < NK.NICK) { kind = 'nick'; nick = P(r, fitList(ruFam() ? RU : EN, !!p.f)); }
  else if (x < NK.NICK + NK.NAME) { kind = 'name'; nick = plainName(p, r); }
  else { kind = 'typo'; nick = typo(plainName(p, r), r); }
  const av = r() < NK.FACE ? 'face' : W(r, ADULT ? AV : Object.assign({}, AV, { dick: 0 }));
  const a = { nick: nick || String(p.name || ''), kind, av, avSeed: (r() * 4294967296) >>> 0, adult: ADULT };
  if (!dry) { claim(p, a, seed); a.sh = shiftNow(); }
  p.app = a;
  return a;
}
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/* заказ принят: всем получателям — ник и аватарка. Сюжетные и учебный — со своими именами (не зовём) */
export function tagOrder (order) {
  if (!order || !order.stops) return;
  for (const st of order.stops) for (const p of st.persons || []) {
    if (!p) continue;
    if (!p.app) { of(p); stats.tagged++; continue; }
    // тот же человек снова клиент (другая смена — журнал мог забыть его подпись или её взял другой): перепроверить
    if (p.app.sh !== shiftNow()) { const seed = (p.seed !== undefined ? p.seed : hashStr(String(p.id || p.name || ''))) >>> 0; claim(p, p.app, seed); p.app.sh = shiftNow(); }
  }
}
/* отладка: журнал подписей — [[подпись, зерно, смена], …] */
export const journal = () => { if (!REG.loaded) regLoad(); return [...REG.by.values()].map(e => [e.n, e.s, e.sh]); };

/* что написано в приложении: клиент заказа — ник; кто-то другой — его имя как есть */
export function label (p, fallback = '') {
  if (!p) return fallback;
  return p.app ? of(p).nick : (p.name || fallback);
}
/* коротко (мини-карточка у радара): ник целиком, обычное имя — только имя, как было */
export function short (p, fallback = '') {
  if (!p) return fallback;
  if (!p.app) return p.first || String(p.name || '').split(/\s+/)[0] || fallback;
  return of(p).nick;
}

/* ─────────────── аватарки ─────────────── */
const PICS = new Map();
let CV = null, CX = null;
function canvas () {
  if (!CV) {
    CV = document.createElement('canvas'); CV.width = CV.height = NK.PX;
    CX = CV.getContext('2d', { willReadFrequently: true });
  }
  return CX;
}

/* аватарка клиента: «face» — портрет (people.js), иначе мазня 64 px (в кэше по виду × зерну × настроению) */
export function avatar (p, size = 128, mood = '') {
  if (!p) return '';
  const a = p.app ? of(p) : null;
  if (!a || a.av === 'face') return faceDataURL(p, size, mood);
  const m = mood === 'ok' || mood === 'angry' || mood === 'happy' ? mood : '';
  const key = a.av + ':' + a.avSeed + ':' + m;
  const hit = PICS.get(key);
  if (hit) { stats.hit++; PICS.delete(key); PICS.set(key, hit); return hit; }
  const url = draw(a.av, a.avSeed, m);
  PICS.set(key, url);
  if (PICS.size > NK.CAP) PICS.delete(PICS.keys().next().value);
  stats.drawn++;
  return url;
}
/* мазня? (портрет говорит ртом — только у «face») */
export const isFace = p => !p || !p.app || of(p).av === 'face';

const BGS = ['#8fb8de', '#f2c57c', '#a8d5a2', '#e8a0a8', '#c3a6e0', '#9fd3cf', '#f0b48a', '#b8c4d6', '#e6e1d3'];
const INKS = ['#1d3fbf', '#c62828', '#2e7d32', '#111111', '#7b1fa2', '#ef6c00'];

function draw (av, seed, mood) {
  const x = canvas(), S = NK.PX, r = rng(seed);
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.clearRect(0, 0, S, S);
  x.lineCap = 'round'; x.lineJoin = 'round'; x.globalAlpha = 1;
  const fill = (c, f) => { x.fillStyle = c; x.beginPath(); f(); x.fill(); };
  const stroke = (c, w, f) => { x.strokeStyle = c; x.lineWidth = w; x.beginPath(); f(); x.stroke(); };
  const bg = c => { x.fillStyle = c; x.fillRect(0, 0, S, S); };
  const circ = (cx, cy, rr) => x.arc(cx, cy, rr, 0, Math.PI * 2);
  const ell = (cx, cy, rx, ry) => x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  switch (av) {
    case 'q': {                              // знак вопроса на сером — «аватарку не поставил»
      const g = x.createLinearGradient(0, 0, 0, S); g.addColorStop(0, '#d6d6d6'); g.addColorStop(1, '#a9a9a9');
      bg(g);
      fill('#8d8d8d', () => { circ(32, 26, 12); }); fill('#8d8d8d', () => { ell(32, 62, 24, 20); });
      x.fillStyle = '#ffffff'; x.font = 'bold 40px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('?', 33, 34);
      break;
    }
    case 'bat': {                            // «Бетмэн»: человек в маске летучей мыши (свой рисунок)
      bg(P(r, ['#f2c94c', '#3b4a6b', '#6b6b7a', '#9fb3d1']));
      fill('#2b2b33', () => { ell(32, 70, 30, 18); });                    // плечи-плащ
      fill('#2b2b33', () => {                                                // маска с ушами
        x.moveTo(16, 50); x.lineTo(14, 22); x.lineTo(18, 6); x.lineTo(23, 18); x.lineTo(41, 18); x.lineTo(46, 6);
        x.lineTo(50, 22); x.lineTo(48, 50); x.closePath();
      });
      fill('#e8bb92', () => { x.moveTo(20, 38); x.lineTo(44, 38); x.lineTo(42, 52); x.quadraticCurveTo(32, 58, 22, 52); x.closePath(); });
      fill('#ffffff', () => { x.moveTo(20, 30); x.lineTo(29, 31); x.lineTo(27, 34); x.closePath(); x.moveTo(44, 30); x.lineTo(35, 31); x.lineTo(37, 34); x.closePath(); });
      stroke('#6b3a22', 1.6, () => { x.moveTo(27, 47); x.quadraticCurveTo(32, 45 + r() * 3, 37, 47); });
      break;
    }
    case 'fat': {                            // мультяшный толстяк в шапке-ушанке
      bg(P(r, ['#9fd3cf', '#a8d5a2', '#f0b48a', '#c3a6e0']));
      const coat = P(r, ['#c62828', '#1d3fbf', '#5d4037', '#2e7d32']);
      fill(coat, () => { ell(32, 68, 34, 24); });
      const hat = P(r, ['#5d4037', '#3e2723', '#6d4c41', '#37474f']), fur = P(r, ['#8d6e63', '#a1887f', '#795548']);
      fill(hat, () => { ell(8, 40, 6, 12); ell(56, 40, 6, 12); });           // уши ушанки висят
      fill('#f6d7bd', () => { ell(32, 38, 24, 19); });
      fill('#f6d7bd', () => { ell(32, 51, 16, 6); });                        // второй подбородок
      stroke('#c9a184', 1.2, () => { x.moveTo(19, 49); x.quadraticCurveTo(32, 56, 45, 49); });
      fill(hat, () => { x.moveTo(8, 28); x.quadraticCurveTo(32, -2, 56, 28); x.closePath(); });
      fill(fur, () => { x.rect(7, 22, 50, 8); });                              // мех козырька
      stroke('rgba(0,0,0,.25)', 1, () => { for (let i = 0; i < 9; i++) { x.moveTo(9 + i * 5.5, 23); x.lineTo(10 + i * 5.5, 29); } });
      fill('#ffffff', () => { ell(26, 37, 4, 3.6); ell(38, 37, 4, 3.6); });
      fill('#111', () => { circ(26.5, 37.5, 1.5); circ(37.5, 37.5, 1.5); });
      fill('#ef9a9a', () => { circ(18, 43, 4); circ(46, 43, 4); });
      stroke('#6b3a22', 1.5, () => { x.moveTo(28, 45); x.quadraticCurveTo(32, 47, 36, 45); });
      break;
    }
    case 'scribble': {                       // каракули ручкой
      bg(P(r, ['#ffffff', '#fffbe6', '#f1f1f1']));
      const n = 2 + ((r() * 2) | 0);
      for (let k = 0; k < n; k++) {
        stroke(P(r, INKS), 1.5 + r() * 2.5, () => {
          let px = 8 + r() * 48, py = 8 + r() * 48;
          x.moveTo(px, py);
          for (let i = 0; i < 14 + r() * 16; i++) {
            const nx = 4 + r() * 56, ny = 4 + r() * 56;
            x.quadraticCurveTo(px + (r() - 0.5) * 30, py + (r() - 0.5) * 30, nx, ny); px = nx; py = ny;
          }
        });
      }
      break;
    }
    case 'cat': {                            // котик
      bg(P(r, ['#f2c57c', '#a8d5a2', '#e8a0a8', '#b8c4d6']));
      const fur = P(r, ['#f0a040', '#8d8d8d', '#3a3a3a', '#f5f5f5', '#c97b3a']);
      fill(fur, () => { x.moveTo(12, 30); x.lineTo(16, 6); x.lineTo(28, 20); x.closePath(); x.moveTo(52, 30); x.lineTo(48, 6); x.lineTo(36, 20); x.closePath(); });
      fill(fur, () => { ell(32, 38, 23, 20); });
      fill('#ffb6c1', () => { x.moveTo(17, 22); x.lineTo(18, 12); x.lineTo(24, 20); x.closePath(); x.moveTo(47, 22); x.lineTo(46, 12); x.lineTo(40, 20); x.closePath(); });
      fill('#c5e86c', () => { ell(24, 34, 4.5, 5); ell(40, 34, 4.5, 5); });
      fill('#111', () => { ell(24, 34, 1.4, 4.2); ell(40, 34, 1.4, 4.2); });
      fill('#f48fb1', () => { x.moveTo(29, 41); x.lineTo(35, 41); x.lineTo(32, 44); x.closePath(); });
      stroke('#333', 1, () => { x.moveTo(32, 44); x.quadraticCurveTo(29, 48, 26, 46); x.moveTo(32, 44); x.quadraticCurveTo(35, 48, 38, 46);
        for (const s of [-1, 1]) for (const dy of [-2, 1, 4]) { x.moveTo(32 + s * 8, 43); x.lineTo(32 + s * 24, 41 + dy); } });
      break;
    }
    case 'car': {                            // машина (фото своей ласточки)
      const g = x.createLinearGradient(0, 0, 0, S); g.addColorStop(0, '#9fd0f0'); g.addColorStop(0.62, '#e8f4fb'); g.addColorStop(0.62, '#7a7a7a'); g.addColorStop(1, '#5a5a5a');
      bg(g);
      const body = P(r, ['#e53935', '#f5f5f5', '#212121', '#1e88e5', '#43a047', '#fdd835', '#8e6fd0']);
      fill(body, () => { x.moveTo(6, 46); x.lineTo(8, 34); x.lineTo(20, 32); x.lineTo(26, 22); x.lineTo(44, 22); x.lineTo(50, 32); x.lineTo(59, 35); x.lineTo(59, 46); x.closePath(); });
      fill('#bfe3f5', () => { x.moveTo(23, 32); x.lineTo(28, 25); x.lineTo(34, 25); x.lineTo(34, 32); x.closePath(); x.moveTo(37, 32); x.lineTo(37, 25); x.lineTo(43, 25); x.lineTo(47, 32); x.closePath(); });
      fill('#1a1a1a', () => { circ(18, 47, 6.5); }); fill('#1a1a1a', () => { circ(47, 47, 6.5); });
      fill('#bdbdbd', () => { circ(18, 47, 2.6); }); fill('#bdbdbd', () => { circ(47, 47, 2.6); });
      fill('#fff59d', () => { x.rect(56, 37, 3, 3); });
      break;
    }
    case 'sunset': {                         // закат на море
      const g = x.createLinearGradient(0, 0, 0, 40); g.addColorStop(0, P(r, ['#3b1f5a', '#2a3766', '#5a1f4a'])); g.addColorStop(1, '#ff8a3d');
      x.fillStyle = g; x.fillRect(0, 0, S, 40);
      fill('#ffd54f', () => { x.arc(32, 40, 13, Math.PI, 0); });
      fill('#1f3a5a', () => { x.rect(0, 40, S, 24); });
      for (let i = 0; i < 5; i++) stroke('#ffb74d', 1.5, () => { const w = 18 - i * 3; x.moveTo(32 - w, 44 + i * 4); x.lineTo(32 + w, 44 + i * 4); });
      if (r() < 0.6) {                       // пальма
        stroke('#1a1a1a', 2.4, () => { x.moveTo(10, 64); x.quadraticCurveTo(14, 36, 9, 22); });
        fill('#1a1a1a', () => { for (const a of [-2.6, -2.0, -1.3, -0.6, 0]) { x.moveTo(9, 22); x.quadraticCurveTo(9 + Math.cos(a) * 10, 22 + Math.sin(a) * 10 - 4, 9 + Math.cos(a) * 18, 22 + Math.sin(a) * 18 + 6); x.lineTo(9, 23); } });
      }
      break;
    }
    case 'eye': {                            // глаз крупно
      bg(P(r, ['#f0c8a0', '#e8bb92', '#d9a878', '#f6d7bd']));
      fill('#ffffff', () => { x.moveTo(4, 32); x.quadraticCurveTo(32, 6, 60, 32); x.quadraticCurveTo(32, 56, 4, 32); });
      const iris = P(r, ['#2e7d32', '#1565c0', '#6d4c41', '#607d8b', '#8d6e63']);
      fill(iris, () => { circ(32, 32, 13); });
      fill('#111', () => { circ(32, 32, 6); });
      fill('#ffffff', () => { circ(36, 28, 2.6); });
      stroke('#e57373', 0.8, () => { x.moveTo(8, 32); x.lineTo(16, 30); x.moveTo(56, 33); x.lineTo(48, 35); });
      stroke('#2b1d16', 2.2, () => { x.moveTo(4, 32); x.quadraticCurveTo(32, 6, 60, 32); for (let i = 0; i < 7; i++) { const t = 0.15 + i * 0.12, bx = 4 + 56 * t, by = 32 - 26 * 4 * t * (1 - t) * 0.5; x.moveTo(bx, by); x.lineTo(bx - 2 + i * 0.6, by - 6); } });
      break;
    }
    case 'pix': {                            // пиксельный смайл 8 × 8
      bg(P(r, ['#5c6bc0', '#26a69a', '#ec407a', '#212121', '#8d6e63']));
      const G = ['..YYYY..', '.YYYYYY.', 'YYKYYKYY', 'YYYYYYYY', 'YKYYYYKY', 'YYKKKKYY', '.YYYYYY.', '..YYYY..'];
      const yel = P(r, ['#ffeb3b', '#ffca28', '#cddc39']);
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
        const c = G[j][i]; if (c === '.') continue;
        x.fillStyle = c === 'K' ? '#111' : yel; x.fillRect(i * 8, j * 8, 8, 8);
      }
      break;
    }
    case 'dark': {                           // тёмная аватарка: серый силуэт «без фото» на тёмном (был чёрный квадрат — читался как
      // недорисованный портрет, автор 23.10)
      bg(P(r, ['#23252d', '#2a2631', '#262b2a']));
      const sil = P(r, ['#6a6e7c', '#75707f', '#6b7772']);
      fill(sil, () => { circ(32, 25, 11.5); });
      fill(sil, () => { ell(32, 64, 23, 19); });
      if (r() < 0.5) { x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(4 + r() * 8, 4 + r() * 8, 3, 3); }
      break;
    }
    case 'flower': {                         // розы — «аватарка тётушки»
      bg(P(r, ['#fff3e0', '#fce4ec', '#e8f5e9']));
      stroke('#388e3c', 3, () => { x.moveTo(32, 64); x.quadraticCurveTo(30, 46, 32, 34); x.moveTo(20, 64); x.quadraticCurveTo(18, 50, 18, 42); x.moveTo(46, 64); x.quadraticCurveTo(48, 50, 46, 42); });
      fill('#66bb6a', () => { ell(24, 52, 6, 3); ell(40, 50, 6, 3); });
      const pet = P(r, ['#d81b60', '#e53935', '#fdd835', '#ff7043']);
      for (const [cx, cy, rr] of [[32, 26, 12], [17, 38, 8], [47, 38, 8]]) {
        fill(pet, () => { circ(cx, cy, rr); });
        stroke('rgba(0,0,0,.35)', 1.2, () => { x.arc(cx, cy, rr * 0.55, 0.4, 5.6); x.moveTo(cx + rr * 0.25, cy); x.arc(cx, cy, rr * 0.25, 0, 4.5); });
      }
      x.fillStyle = '#ffeb3b'; x.font = 'bold 9px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
      if (r() < 0.6) { x.fillText('✿', 54, 12); x.fillText('✿', 9, 14); }
      break;
    }
    case 'dick': {                           // взрослое: член мелом на заборе
      bg('#6d4c2f');
      for (let i = 0; i < 4; i++) { x.fillStyle = i % 2 ? '#7a5636' : '#6a492c'; x.fillRect(i * 16, 0, 15, S); }
      x.fillStyle = 'rgba(0,0,0,.35)'; for (let i = 1; i < 4; i++) x.fillRect(i * 16 - 1, 0, 1.5, S);
      const tilt = (r() - 0.5) * 0.5, ch = 'rgba(245,245,240,.92)';
      x.translate(32, 34); x.rotate(tilt); x.translate(-32, -34);
      stroke(ch, 2.6, () => {
        x.moveTo(26, 50); x.lineTo(26, 18); x.quadraticCurveTo(32, 6, 38, 18); x.lineTo(38, 50);
        x.moveTo(26, 19); x.quadraticCurveTo(32, 23, 38, 19);
        x.moveTo(32, 9); x.lineTo(32, 13);
        x.moveTo(26 + 9, 52); x.arc(26, 52, 9, 0, Math.PI * 2);
        x.moveTo(38 + 9, 52); x.arc(38, 52, 9, 0, Math.PI * 2);
      });
      stroke(ch, 1.2, () => { for (let i = 0; i < 6; i++) { const a = Math.PI * (0.9 + i * 0.25), cx = i < 3 ? 26 : 38; x.moveTo(cx + Math.cos(a) * 9, 52 + Math.sin(a) * 9); x.lineTo(cx + Math.cos(a) * 12.5, 52 + Math.sin(a) * 12.5); } });
      x.setTransform(1, 0, 0, 1, 0, 0);
      break;
    }
    default: bg('#999');
  }
  if (mood) moodSticker(x, mood);
  return CV.toDataURL('image/png');
}

/* наклейка настроения в углу мазни (у мини-карточки и оплаты лицо-настроение — тут его нет) */
function moodSticker (x, mood) {
  // крупнее (ревью 17.10): на мини-карточке аватарка ~30 px, и наклейка R 11 из 64 была точкой в 5 px — настроения не видно
  const cx = 47, cy = 47, R = 11, k = 15 / R;            // рисуем в мерке R 11, увеличено до 15
  x.setTransform(k, 0, 0, k, cx * (1 - k), cy * (1 - k));
  x.fillStyle = mood === 'angry' ? '#e53935' : mood === 'happy' ? '#43a047' : '#fbc02d';
  x.strokeStyle = '#ffffff'; x.lineWidth = 2;
  x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill(); x.stroke();
  x.fillStyle = '#1a1a1a';
  x.beginPath(); x.arc(cx - 4, cy - 2.5, 1.6, 0, Math.PI * 2); x.arc(cx + 4, cy - 2.5, 1.6, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#1a1a1a'; x.lineWidth = 1.8; x.beginPath();
  if (mood === 'happy') x.arc(cx, cy + 1, 5, 0.15 * Math.PI, 0.85 * Math.PI);
  else if (mood === 'angry') { x.arc(cx, cy + 8, 5, 1.2 * Math.PI, 1.8 * Math.PI); x.moveTo(cx - 7, cy - 7); x.lineTo(cx - 2, cy - 4.5); x.moveTo(cx + 7, cy - 7); x.lineTo(cx + 2, cy - 4.5); }
  else { x.moveTo(cx - 4.5, cy + 4); x.lineTo(cx + 4.5, cy + 4); }
  x.stroke();
  x.setTransform(1, 0, 0, 1, 0, 0);
}

/* отладка: доли на n случайных людей (зерна подряд) — { nick, name, typo, face, av: { q: …, … } } */
export function roll (n = 1000, mk) {
  const out = { nick: 0, name: 0, typo: 0, face: 0, av: {} };
  for (let i = 0; i < n; i++) {
    const p = mk ? mk(i) : { seed: (i * 2654435761) >>> 0, first: 'Ирина', last: 'Белова', name: 'Ирина Белова', f: i % 2 === 0 };
    const a = of(p, true);
    out[a.kind]++;
    if (a.av === 'face') out.face++; else out.av[a.av] = (out.av[a.av] || 0) + 1;
  }
  return out;
}
