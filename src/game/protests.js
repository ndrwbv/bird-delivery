/* ──────────────────────────────────────────────────────────────────────────
   Жизнь города: протест по ступеням и концерты во дворах (docs/IDEAS.md, блок 11;
   правила словами и цифрами — docs/CAREER.md «Жизнь города»). Только в карьере.

   ПРОТЕСТ — один на весь город (не на район: проблема у горожан общая), растёт по
   законченным сменам (dlv-shifts). Цикл — PROT.STAGES смен на ступени 1…5:
     1) листовки на столбах-тумбах вдоль улиц, баннеры на домах;
     2) + граффити на стенах;
     3) + марши: колонна с плакатами идёт по проезжей части, машины потока стоят и ждут
        (trafficHold — хук в updateTraffic); сбил митингующего — RESPECT.GAIN.marcher;
     4) восстание: + драки на тротуарах (кучки по 2—3), марши злее;
     5) власть сменилась: Толик пишет смешной указ, город в флагах и плакатах «мы победили».
   Потом — новая проблема (не из последних 4) и снова ступень 1. Состояние — dlv-protest.
   «Свои дурацкие проблемы» (продам гараж, как объяснить ребёнку…) висят на тумбах всегда.

   Декор — клетками PROT.CELL м вокруг машины: в клетке всё (тумбы, листовки, баннеры,
   граффити, флаги) — одна склейка с одной текстурой-атласом → одна отрисовка на клетку.

   КОНЦЕРТЫ И СХОДКИ (GIG): у лавочек во дворах и скверах (не на парковках ТЦ — там
   фестивали), гитарист, группа на помосте или собрание жильцов + 10—20 слушателей
   (инстансами — 2 отрисовки). Днём — раз в GIG.DAY с, вечером — чаще и до двух сразу.

   Переменных игры модуль не видит — всё приходит в api (protApi в game.js).
   Отладка: __dlv.PROT (info, stage(n, problemId), march(), riot(), gig(kind), sim()).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t, N_ } from '../i18n/index.js';
import * as DIST from './districts.js';
import { TIER } from './hits.js';
import { hourOf } from './econ.js';
import * as RESPECT from './respect.js';
import * as FEST from './festivals.js';
import * as DIRECTOR from './director.js';   // режиссёр событий: концерт — лёгкое, марш — среднее, восстание — крупное

export const PROT = {
  FROM: 1,                   // с какой законченной смены протест (первая смена новичка — тихая)
  STAGES: [2, 2, 2, 1, 1],   // сколько смен длится ступень 1…5 (цикл — 8 смен)
  CELL: 200, NEAR: 1, KEEP: 2,   // клетки декора: строим в радиусе NEAR клеток, убираем дальше KEEP
  POST: [40, 70],            // м между тумбами вдоль улицы
  BANNER: [0.06, 0.22, 0.3, 0.4, 0.45, 0.4],   // шанс баннера на доме у шага (по ступени 0…5)
  GRAFF: [0, 0, 0.35, 0.5, 0.6, 0.35],         // шанс граффити
  MARCH: { FIRST: [8, 20], EVERY: [30, 60], R: [60, 160], N: [12, 20], V: 1.3, LEN: [50, 160], RALLY: 18, FAR: 280 },
  RIOT: { N: 2, R: [45, 150], MEN: [2, 3], LIFE: [40, 70], FAR: 220, GAP: [4, 12] },
  YIELD: { REACH: 18, HALF: 1.6, GAP: 2.5, SOFT: 6 },   // как машины потока ждут колонну
  // тумбы сбиваются (04.10.2026: машина проезжала сквозь): быстрее KNOCK м/с — валится по ходу удара,
  // машина теряет SLOW скорости, урона нет; медленнее — упирается, как в столб. Лежит LIE с, уходит в землю SINK с
  HIT: { R: 0.12, KNOCK: 2.5, SLOW: 0.92, LIE: 25, SINK: 2, FALL: 0.45 },
};
export const GIG = {
  DAY: [60, 120], EVE: [20, 45], NIGHT: [150, 260],   // с между концертами
  EVE_H: [17, 24], NIGHT_H: [1, 8],                     // часы вечера и ночи
  MAX: 1, MAX_EVE: 2,
  R: [45, 170], LIFE: [100, 160], FAR: 260, CROWD: [10, 20], SPACING: 70,
};

/* ── проблемы горожан ── */
const PROBLEMS = [
  { id: 'burger', title: N_('Бургеры заебали — требуют прав!'), kids: N_('Бургеры надоели — требуют прав!'),
    slog: [N_('Бургерам — никаких прав!'), N_('Булки — вон из Солнечного!'), N_('Хотим пиццу, а не котлету в хлебе!')],
    chant: [N_('Бур-ге-ры — до-мой!'), N_('Нет — булкам без повода!')],
    win: N_('власть сменилась! новый мэр выдал бургерам права. без прописки и без кетчупа'), col: ['#d9342c', '#f2c230'] },
  { id: 'moose', title: N_('Верните лосям лес!'),
    slog: [N_('Лес — лосям, асфальт — машинам'), N_('Ельник не трогать!'), N_('Лось тоже человек')],
    chant: [N_('Ло-сям — лес!'), N_('Ру-ки прочь от ель-ни-ка!')],
    win: N_('власть сменилась! новый мэр — лось Борис. первый указ: лес вернуть, асфальт — по выходным'), col: ['#2f7a3a', '#f4f1ea'] },
  { id: 'round', title: N_('Пицца должна быть круглой!'),
    slog: [N_('Квадратная пицца — позор'), N_('Круг — это закон'), N_('Нет углам!')],
    chant: [N_('Круг! Круг! Круг!'), N_('Долой углы!')],
    win: N_('власть сменилась! квадратную пиццу запретили. треугольные куски — пока можно'), col: ['#e8781e', '#2b2a30'] },
  { id: 'pineapple', title: N_('Ананас — не начинка!'),
    slog: [N_('Ананасы — домой, на пальмы'), N_('Сладкое — отдельно'), N_('Пицца без компота!')],
    chant: [N_('Без а-на-на-са!'), N_('Пиц-ца — не де-серт!')],
    win: N_('власть сменилась! все ананасы выслали обратно на пальмы. пальм в Солнечном нет — разбираются'), col: ['#f2c230', '#2f7a3a'] },
  { id: 'puddles', title: N_('Долой лужи!'),
    slog: [N_('Лужа — не озеро'), N_('Хватит плавать до работы'), N_('Асфальт без дыр!')],
    chant: [N_('Су-хо! Су-хо!'), N_('Ас-фальт! Ас-фальт!')],
    win: N_('власть сменилась! лужи объявили озёрами. проблема решена, ловим рыбу'), col: ['#2f6fd8', '#f4f1ea'] },
  { id: 'roadworks', title: N_('Хватит перекладывать асфальт!'),
    slog: [N_('Третий ремонт за лето — хватит!'), N_('Яма — тоже памятник'), N_('Отдайте улицы людям')],
    chant: [N_('Хва-тит ко-пать!'), N_('Ру-ки от до-рог!')],
    win: N_('власть сменилась! новый мэр перекрыл все улицы сразу. зато один раз и честно'), col: ['#e8781e', '#f4f1ea'] },
  { id: 'cats', title: N_('Котов — в депутаты!'),
    slog: [N_('Кот не врёт'), N_('Барсика — в мэры!'), N_('Мурчать — не воровать')],
    chant: [N_('Бар-сик! Бар-сик!'), N_('Мяу — это аргумент!')],
    win: N_('власть сменилась! новый мэр — кот Барсик. работает лёжа, приём граждан — по настроению'), col: ['#7a5ad0', '#f2c230'] },
  { id: 'hookah', adult: true, title: N_('Кальянщиков — в резервацию!'),
    slog: [N_('Хватит облаков во дворах'), N_('Дым — только в трубу'), N_('Стёпа, верни воздух!')],
    chant: [N_('Без ды-ма!'), N_('Сте-па, ухо-ди!')],
    win: N_('власть сменилась! все кальянные стали музеями. экскурсии — с дымом'), col: ['#3fa8c9', '#2b2a30'] },
  { id: 'winter', title: N_('Зиму — покороче!'),
    slog: [N_('Хватит снега в мае'), N_('Лето — на полгода!'), N_('Сугроб — не парковка')],
    chant: [N_('Ле-то! Ле-то!'), N_('До-лой су-гро-бы!')],
    win: N_('власть сменилась! зиму сократили до февраля. февраль продлили до мая'), col: ['#8ec7e8', '#1d3f8f'] },
  { id: 'pigeons', title: N_('Голуби обнаглели!'),
    slog: [N_('Не на машину!'), N_('Голубям — туалеты!'), N_('Хватит красть шаурму')],
    chant: [N_('Кыш! Кыш! Кыш!'), N_('Го-лу-бей — к от-ве-ту!')],
    win: N_('власть сменилась! голубям выдали туалеты. голуби не пользуются'), col: ['#5a6070', '#f4f1ea'] },
  { id: 'trolley', title: N_('Верните троллейбус!'),
    slog: [N_('Провода есть — троллейбуса нет'), N_('Рога — троллейбусу!'), N_('Ездить — не стыдно')],
    chant: [N_('Трол-лей-бус! Трол-лей-бус!'), N_('Вер-ни-те ро-га!')],
    win: N_('власть сменилась! троллейбус вернули. без проводов — его толкают'), col: ['#1d3f8f', '#f2c230'] },
  { id: 'couriers', title: N_('Курьеров — под контроль!'),
    slog: [N_('Курьер — не гонщик'), N_('Тише едешь — пицца целее'), N_('Хватит гонять по дворам')],
    chant: [N_('Ти-ше! Ти-ше!'), N_('Пеш-ком, пеш-ком!')],
    win: N_('власть сменилась! курьерам выдали мигалки. теперь гонять можно официально'), col: ['#59b06a', '#2b2a30'] },
];
/* свои дурацкие проблемы — листовки на тумбах, всегда */
const KID_N = [N_('гараж'), N_('айфон'), N_('трактор'), N_('третий кот'), N_('абонемент в качалку'), N_('самокат за двести тысяч'), N_('кальян')];
const KID_Z = [N_('счастья'), N_('поступления в садик'), N_('пятёрки по физре'), N_('хорошего сна'), N_('уважения во дворе'), N_('нормальной жизни')];
const OWN = [N_('Продам гараж. Дорого'), N_('Сосед сверлит шестой год. Помогите'), N_('Пропал кот. Не ищите — ушёл сам'),
  N_('Ищу смысл жизни. Вознаграждение'), N_('Куплю время. Дорого'), N_('Кто взял мой самокат — верни, я всё прощу'),
  N_('Сниму квартиру. Без соседей сверху'), N_('Потерян пульт от телевизора. Жена в ярости')];
const OWN_ADULT = [N_('Отдам тёщу в хорошие руки'), N_('Сосед, сука, верни дрель')];
const OWN_BAN = [N_('ПРОДАМ ГАРАЖ'), N_('Сосед, верни дрель!')];
const GRAFF = [N_('Тут был Стёпа'), N_('Пицца > бургер'), N_('Солнечный — наш!'), N_('Жека, верни долг')];
const RIOT_L = [N_('Получай!'), N_('Ты за кого вообще?'), N_('Это наш двор!'), N_('Сам такой!'), N_('За Солнечный!')];
const RIOT_ADULT = [N_('Иди нахуй!'), N_('Ща втащу, блядь!'), N_('Ты чё, охуел?')];
const MARCH_ADULT = [N_('Достали, блядь!'), N_('Сколько можно, ёпта!')];
const MARCH_HIT = [N_('Убийца!'), N_('Давят!'), N_('Это провокация!')];
const BANDS = [N_('Ржавый Жигуль'), N_('Сырный Бортик'), N_('Северный Сквозняк'), N_('Тёплый Подъезд'), N_('Пятый Этаж')];
const GIG_L = [N_('Следующая — про пиццу!'), N_('Эту я написал в армии'), N_('Подпевайте, кто знает!'), N_('Спасибо, Солнечный!'), N_('Три аккорда — и вся правда')];
const MEET_L = [N_('Повестка: кто поставил машину на газон?'), N_('Голосуем! Кто за — руки!'), N_('Слово имеет бабушка с пятого'),
  N_('Скидываемся на шлагбаум'), N_('Предлагаю — гаражи покрасить'), N_('Курьеры по двору гоняют — это раз!')];
const ANNOUNCE = [null,
  null,                                   // листовки — без сообщения в чат (автор 08.10)
  N_('уже и стены расписали: «{title}». к выходным пойдут маршем'),
  N_('сегодня марши: «{title}». колонны идут прямо по улицам, машины стоят — объезжай. митингующих не дави, респект потеряешь'),
  N_('в городе бардак: «{title}» — дерутся прямо на улицах. смотри по сторонам'),
];
const SHIRTS = ['#d9342c', '#2f6fd8', '#f2c230', '#59b06a', '#e8eef2', '#2b2a30', '#c95a8a', '#e8781e', '#7a5ad0', '#3a8a8a', '#8a6a4a', '#f4f1ea'];
const SKINS = ['#f1c9a5', '#e8bb92', '#d9a37a', '#c48a5c', '#a96e44', '#f6d9bd'];
const HL = 2.6, HW = 1.3;            // кузов для наезда

const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
function mulberry (a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let q = Math.imul(a ^ a >>> 15, 1 | a); q = q + Math.imul(q ^ q >>> 7, 61 | q) ^ q; return ((q ^ q >>> 14) >>> 0) / 4294967296; }; }

let A = null;
const ST = { session: -1, stage: 0, p: 0, cycle: 0, force: null, forceP: null, annT: -1, annKey: '', atlasP: -1, atlasAdult: null };
const STATS = { chunks: 0, quads: 0, marches: 0, marchKo: 0, held: 0, riots: 0, riotKo: 0, gigs: 0, gigKo: 0 };
const prob = () => PROBLEMS[ST.p] || PROBLEMS[0];
const title = p => t(!A.ADULT && p.kids ? p.kids : p.title);

/* ─────────────── ступень: по законченным сменам ─────────────── */
const KEY = 'dlv-protest';
function load () { try { return JSON.parse(A.Store.get(KEY, '') || '{}') || {}; } catch (e) { return {}; } }
function save (o) { try { A.Store.set(KEY, JSON.stringify(o)); } catch (e) { /* без сохранения — не страшно */ } }
/* k — смен с начала цикла → ступень 1…5, 0 — цикл кончился (или k < 0) */
export function stageAt (k) {
  if (k < 0) return 0;
  let c = 0;
  for (let i = 0; i < PROT.STAGES.length; i++) { c += PROT.STAGES[i]; if (k < c) return i + 1; }
  return 0;
}
const okProb = i => !!PROBLEMS[i] && (A.ADULT || !PROBLEMS[i].adult);
function pickProblem (used) {
  const pool = PROBLEMS.map((p, i) => i).filter(i => okProb(i) && !used.includes(i));
  return pool.length ? pick(pool) : PROBLEMS.findIndex((p, i) => okProb(i));
}
function resolve () {
  const shifts = +A.Store.get('dlv-shifts', 0) || 0;
  const o = load();
  if (!okProb(o.p)) { o.p = pickProblem(o.used || []); o.c0 = Math.max(shifts, PROT.FROM); }
  if (shifts < PROT.FROM) { save(o); return { stage: 0, p: o.p, cycle: o.n || 0 }; }
  if (o.c0 === undefined) o.c0 = shifts;
  let st = stageAt(shifts - o.c0);
  if (!st) {                                         // цикл кончился — новая проблема
    o.used = [...(o.used || []), o.p].slice(-4);
    o.p = pickProblem(o.used); o.c0 = shifts; o.n = (o.n || 0) + 1; st = 1;
  }
  save(o);
  return { stage: st, p: o.p, cycle: o.n || 0 };
}

/* ─────────────── атлас: баннеры, граффити, листовки, флаг ───────────────
   2048², ячейки 512×256 (4 × 8): 0 — главный лозунг, 1…3 — лозунги, 4…5 — свои баннеры,
   6 — «мы победили», 7 — флаг, 8…15 — граффити (прозрачные), 16…31 — по две листовки
   256×256: 0…13 — протестные, 14…29 — свои проблемы, 31 — серый (тумба). */
const AT = 2048, CW = 512, CH = 256;
let MAT = null, CMAT = null, TEX = null;
const cellUV = i => { const x = (i % 4) * CW, y = ((i / 4) | 0) * CH; return [x / AT, 1 - (y + CH) / AT, (x + CW) / AT, 1 - y / AT]; };
const leafUV = L => { const c = 16 + (L >> 1), x = (c % 4) * CW + (L & 1) * 256, y = ((c / 4) | 0) * CH; return [x / AT, 1 - (y + CH) / AT, (x + 256) / AT, 1 - y / AT]; };
function wrapText (g, s, w) {
  const out = []; let cur = '';
  for (const wd of String(s).split(' ')) { const tst = cur ? cur + ' ' + wd : wd; if (cur && g.measureText(tst).width > w) { out.push(cur); cur = wd; } else cur = tst; }
  if (cur) out.push(cur);
  return out;
}
function textBox (g, lines, x, y, w, h, fg, fs, font = '900', stroke) {
  let rows;
  for (;;) {
    g.font = font + ' ' + fs + 'px system-ui, sans-serif';
    rows = [];
    for (const s of lines) rows.push(...wrapText(g, s, w));
    if ((rows.length * fs * 1.12 <= h && rows.every(r => g.measureText(r).width <= w)) || fs <= 12) break;
    fs -= 2;
  }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const y0 = y + h / 2 - (rows.length - 1) * fs * 1.12 / 2;
  rows.forEach((r, i) => {
    if (stroke) { g.lineWidth = fs * 0.22; g.strokeStyle = stroke; g.lineJoin = 'round'; g.strokeText(r, x + w / 2, y0 + i * fs * 1.12); }
    g.fillStyle = fg; g.fillText(r, x + w / 2, y0 + i * fs * 1.12);
  });
}
function atlas () {
  const P = prob();
  if (ST.atlasP === ST.p && ST.atlasAdult === A.ADULT && TEX) return;
  ST.atlasP = ST.p; ST.atlasAdult = A.ADULT;
  const c = document.createElement('canvas');
  c.width = c.height = AT;
  const g = c.getContext('2d');
  const at = i => [(i % 4) * CW, ((i / 4) | 0) * CH];
  const ban = (i, txt, bg, fg, sub) => {
    const [x, y] = at(i);
    g.fillStyle = bg; g.fillRect(x, y, CW, CH);
    g.fillStyle = 'rgba(0,0,0,0.08)'; for (let k = 0; k < 6; k++) g.fillRect(x + k * 90 + 20, y, 10, CH);   // складки ткани
    g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(x + 10, y + 10, CW - 20, CH - 20);
    textBox(g, sub ? [txt, sub] : [txt], x + 30, y + 24, CW - 60, CH - 48, fg, 74);
  };
  const [b0, f0] = P.col;
  ban(0, title(P), b0, f0);
  P.slog.forEach((s, i) => ban(1 + i, t(s), i === 1 ? f0 : '#f4f1ea', i === 1 ? b0 : i === 0 ? b0 : '#2b2a30'));
  ban(4, t(OWN_BAN[0]) + ' · 8-913-…', '#f4f1ea', '#2b2a30');
  ban(5, t(OWN_BAN[1]), '#f2c230', '#2b2a30');
  ban(6, t('Мы победили!'), b0, f0, title(P));
  { // флаг: полосы цветов проблемы и солнце
    const [x, y] = at(7);
    g.fillStyle = b0; g.fillRect(x, y, CW, CH / 2); g.fillStyle = f0; g.fillRect(x, y + CH / 2, CW, CH / 2);
    g.fillStyle = '#ffd84a'; g.beginPath(); g.arc(x + CW / 2, y + CH / 2, 70, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ffd84a'; g.lineWidth = 10;
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; g.beginPath(); g.moveTo(x + CW / 2 + Math.cos(a) * 85, y + CH / 2 + Math.sin(a) * 85); g.lineTo(x + CW / 2 + Math.cos(a) * 115, y + CH / 2 + Math.sin(a) * 115); g.stroke(); }
  }
  // граффити: прозрачный фон, баллончик с обводкой и подтёками
  const sprays = ['#ff3b6b', '#3bd1ff', '#9dff3b', '#ffd23b', '#c86bff', '#ff8a3b', '#ffffff', '#3bff9d'];
  const gtxt = [title(P), ...P.slog.map(s => t(s)), ...GRAFF.map(s => t(s))];
  for (let i = 0; i < 8; i++) {
    const [x, y] = at(8 + i);
    g.save(); g.beginPath(); g.rect(x, y, CW, CH); g.clip();
    g.translate(x + CW / 2, y + CH / 2); g.rotate(-0.07 + (i % 3) * 0.05);
    textBox(g, [gtxt[i]], -CW / 2 + 24, -CH / 2 + 20, CW - 48, CH - 60, sprays[i], 80, 'italic 900', '#1b1b20');
    g.fillStyle = sprays[i];
    for (let k = 0; k < 6; k++) g.fillRect(-180 + k * 70 + (i * 13) % 30, 40 + (k % 2) * 10, 5, 30 + ((k * 37 + i * 11) % 50));
    g.restore();
  }
  // листовки
  const PAPER = ['#f4f1ea', '#fff7c2', '#e3f0ff', '#ffe3e8', '#e8ffe3'];
  const leaf = (L, lines, bg, fg, tabs) => {
    const c2 = 16 + (L >> 1), x = (c2 % 4) * CW + (L & 1) * 256, y = ((c2 / 4) | 0) * CH;
    g.fillStyle = bg; g.fillRect(x + 4, y + 4, 248, 248);
    textBox(g, lines, x + 16, y + 14, 224, tabs ? 170 : 226, fg, 40, '800');
    if (tabs) { g.strokeStyle = '#8a8a8a'; g.lineWidth = 2; for (let k = 0; k < 8; k++) { g.strokeRect(x + 8 + k * 30, y + 192, 30, 58); } }
  };
  const PS = [title(P), ...P.slog.map(s => t(s))];
  for (let L = 0; L < 14; L++) leaf(L, L % 2 ? [PS[L % PS.length]] : [t('ВСЕ НА МИТИНГ!'), PS[(L >> 1) % PS.length]], L % 3 ? b0 : '#f4f1ea', L % 3 ? f0 : b0);
  const own = [...OWN, ...(A.ADULT ? OWN_ADULT : [])];
  const nKid = KID_N.filter(n => A.ADULT || n !== KID_N[6]);
  for (let L = 14; L < 30; L++) {
    const k = L - 14;
    const s = k % 2 === 0
      ? t('Как объяснить ребёнку, что ему нужен {n} для {z}?', { n: t(nKid[(k >> 1) % nKid.length]), z: t(KID_Z[(k * 5 + 1) % KID_Z.length]) })
      : t(own[(k >> 1) % own.length]);
    leaf(L, [s], PAPER[k % PAPER.length], '#2b2a30', k % 2 === 1);
  }
  { const c2 = 31, x = (c2 % 4) * CW + 256, y = ((c2 / 4) | 0) * CH; g.fillStyle = '#6f7378'; g.fillRect(x, y, 256, 256); }
  if (TEX) TEX.dispose();
  TEX = new THREE.CanvasTexture(c);
  TEX.anisotropy = 4;
  if ('colorSpace' in TEX) TEX.colorSpace = THREE.SRGBColorSpace;
  if (!MAT) {
    MAT = new THREE.MeshLambertMaterial({ map: TEX, alphaTest: 0.45, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    CMAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    MAT.userData.keep = CMAT.userData.keep = true;
  } else { MAT.map = TEX; MAT.needsUpdate = true; }
}

/* ─────────────── декор клетками ─────────────── */
class Quads {
  constructor () { this.p = []; this.u = []; this.n = []; this.i = []; }
  // вертикальный прямоугольник лицом по (nx, nz); с лица текст читается слева направо
  add (cx, cy, cz, nx, nz, w, h, uv) {
    const b = this.p.length / 3, tx = nz, tz = -nx, hw = w / 2, hh = h / 2;
    const P = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]], U = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
    for (let k = 0; k < 4; k++) {
      this.p.push(cx + tx * P[k][0], cy + P[k][1], cz + tz * P[k][0]);
      this.u.push(U[k][0], U[k][1]); this.n.push(nx, 0, nz);
    }
    this.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  geo () {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    return g;
  }
}
let SEGS = null, BUCKET = null, ENDS = null;
const ekey = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2);
function segs () {
  if (SEGS) return;
  SEGS = (A.segs() || []).filter(s => s.c <= 4 && !s.x && !s.b);
  BUCKET = new Map(); ENDS = new Map();
  for (const s of SEGS) {
    const k = Math.floor((s.x1 + s.x2) / 2 / PROT.CELL) + ',' + Math.floor((s.z1 + s.z2) / 2 / PROT.CELL);
    if (!BUCKET.has(k)) BUCKET.set(k, []);
    BUCKET.get(k).push(s);
    for (const e of [ekey(s.x1, s.z1), ekey(s.x2, s.z2)]) { if (!ENDS.has(e)) ENDS.set(e, []); ENDS.get(e).push(s); }
  }
}
const CHUNKS = new Map();
function wallHit (x0, z0, sx, sz) {
  for (let k = 1; k < 45; k++) {
    if (!A.inHouse(x0 + sx * k, z0 + sz * k, 0)) continue;
    let lo = k - 1, hi = k;
    for (let r = 0; r < 5; r++) { const m = (lo + hi) / 2; if (A.inHouse(x0 + sx * m, z0 + sz * m, 0)) hi = m; else lo = m; }
    return lo;
  }
  return -1;
}
/* стена дома от улицы: ровная на ±1,6 м — иначе null */
function wallFrom (rx, rz, sx, sz, w, ux, uz) {
  const o = w / 2 + 1.5, x0 = rx + sx * o, z0 = rz + sz * o;
  if (A.inHouse(x0, z0, 0)) return null;
  const k0 = wallHit(x0, z0, sx, sz);
  if (k0 < 0) return null;
  const ka = wallHit(x0 + ux * 1.6, z0 + uz * 1.6, sx, sz), kb = wallHit(x0 - ux * 1.6, z0 - uz * 1.6, sx, sz);
  if (ka < 0 || kb < 0 || Math.abs(ka - k0) > 1.3 || Math.abs(kb - k0) > 1.3) return null;
  let tx = (ux * 3.2 + sx * (ka - kb)), tz = (uz * 3.2 + sz * (ka - kb));
  const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
  let nx = tz, nz = -tx;
  if (nx * sx + nz * sz > 0) { nx = -nx; nz = -nz; }
  const hx = x0 + sx * k0, hz = z0 + sz * k0;
  return { x: hx + nx * 0.06, z: hz + nz * 0.06, nx, nz, gh: A.groundH(hx + nx * 0.6, hz + nz * 0.6) };
}
function okPost (x, z) {
  if (!A.inBounds(x, z, 4) || A.inHouse(x, z, 0.5) || FEST.blocks(x, z, 2)) return false;
  const r = A.nearestRoad(x, z);
  return !r || r.d > (r.seg.w || 7) / 2 + 0.5;
}
function pole (q, x, z, gh, h) {
  const uv = leafUV(31);
  for (const [nx, nz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) q.add(x + nx * 0.07, gh + h / 2, z + nz * 0.07, nx, nz, 0.14, h, uv);
}
function buildChunk (ci, cj) {
  const key = ci + ',' + cj, st = ST.stage;
  const rng = mulberry((ci * 73856093) ^ (cj * 19349663) ^ (ST.cycle * 83492791) ^ ST.p);
  const q = new Quads(), cnt = { posts: 0, banners: 0, graff: 0, tries: 0 }, posts = [];
  for (const s of BUCKET.get(key) || []) {
    const dx = s.x2 - s.x1, dz = s.z2 - s.z1, L = Math.hypot(dx, dz);
    if (L < 14) continue;
    const ux = dx / L, uz = dz / L, w = s.w || 7;
    let d = 4 + rng() * 22;
    while (d < L - 4) {
      // все броски — заранее и всегда: места не прыгают от ступени к ступени
      const side = rng() < 0.5 ? 1 : -1, rb = rng(), rg = rng(), r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng();
      const sx = uz * side, sz = -ux * side;
      const rx = s.x1 + ux * d, rz = s.z1 + uz * d;
      const px = rx + sx * (w / 2 + 1.0), pz = rz + sz * (w / 2 + 1.0);
      if (okPost(px, pz)) {
        const gh = A.groundH(px, pz) + (A.curbAt ? A.curbAt(px, pz) : 0);
        cnt.posts++;
        const v0 = q.p.length / 3;
        if (st === 5) {                                       // власть сменилась: флаги
          pole(q, px, pz, gh, 4.6);
          q.add(px + ux * 0.85, gh + 4.1, pz + uz * 0.85, -sx, -sz, 1.6, 0.8, cellUV(7));
        } else {
          pole(q, px, pz, gh, 2.6);
          const n = 3 + ((r1 * 4) | 0);
          for (let k = 0; k < n; k++) {
            const f = (k + ((r2 * 4) | 0)) % 4, nx = [1, 0, -1, 0][f], nz = [0, 1, 0, -1][f];
            const rr = (r3 * 1000 + k * 7.31) % 1;
            const L2 = st >= 1 && st <= 4 && rr < 0.6 ? ((rr * 23 + k) | 0) % 14 : 14 + (((r4 * 16) | 0) + k * 5) % 16;
            q.add(px + nx * 0.075, gh + 1.05 + ((k * 0.37 + r2) % 1) * 1.0, pz + nz * 0.075, nx, nz, 0.3, 0.3, leafUV(L2));
          }
        }
        posts.push({ x: px, z: pz, gh, v0, nv: q.p.length / 3 - v0, down: 0 });   // вершины тумбы — сбить (postHit)
      }
      if (rb < PROT.BANNER[st]) {
        cnt.tries++;
        const W = wallFrom(rx, rz, sx, sz, w, ux, uz) || wallFrom(rx, rz, -sx, -sz, w, ux, uz);
        if (W) {
          cnt.banners++;
          const cell = st === 0 ? 4 + ((r1 * 2) | 0) : st === 5 ? (r1 < 0.6 ? 6 : 7) : r1 < 0.12 ? 4 + ((r2 * 2) | 0) : ((r2 * 4) | 0);
          q.add(W.x, W.gh + 3 + r3 * 1.2, W.z, W.nx, W.nz, 3.6, 1.8, cellUV(cell));
        }
      }
      if (rg < PROT.GRAFF[st]) {
        const W = wallFrom(rx + ux * 4, rz + uz * 4, -sx, -sz, w, ux, uz) || wallFrom(rx + ux * 4, rz + uz * 4, sx, sz, w, ux, uz);
        if (W) cnt.graff++;
        if (W) q.add(W.x + W.nx * 0.02, W.gh + 1.15, W.z + W.nz * 0.02, W.nx, W.nz, 2.8, 1.4, cellUV(8 + ((r3 * 8) | 0)));
      }
      d += PROT.POST[0] + rng() * (PROT.POST[1] - PROT.POST[0]);
    }
  }
  let mesh = null;
  if (q.i.length) {
    mesh = new THREE.Mesh(q.geo(), MAT);
    mesh.matrixAutoUpdate = false;
    A.scene.add(mesh);
    STATS.quads += q.i.length / 6;
  }
  CHUNKS.set(key, { mesh, ci, cj, cnt, posts });
  STATS.chunks++;
}
function dropChunk (key) {
  const c = CHUNKS.get(key);
  if (c && c.mesh) { A.scene.remove(c.mesh); STATS.quads -= c.mesh.geometry.index.count / 6; c.mesh.geometry.dispose(); }
  CHUNKS.delete(key);
  STATS.chunks--;
}
function dropAllChunks () { for (const k of [...CHUNKS.keys()]) dropChunk(k); ST.knocked = 0; }

/* ── тумбы сбиваются ──
   Тумба с листовками — кусок склейки клетки (v0…v0+nv). Сбил — её вершины уходят под землю,
   а вместо неё своя копия валится по ходу удара, лежит и уходит в землю. Медленно — упёрся. */
const FALLEN = [];
function postsCar () {
  const V = A.V, H = PROT.HIT;
  if (!V || !A.CAR_W) return;
  const fx = Math.sin(V.h), fz = Math.cos(V.h), L = A.CAR_L * 0.55, rr = A.CAR_W + H.R;
  const ci = Math.floor(V.x / PROT.CELL), cj = Math.floor(V.z / PROT.CELL);
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
    const c = CHUNKS.get(i + ',' + j);
    if (!c || !c.mesh) continue;
    for (const P of c.posts) {
      if (P.down || Math.abs(P.x - V.x) > 6 || Math.abs(P.z - V.z) > 6) continue;
      for (const k of [1, -1]) {
        const cx = V.x + fx * L * k, cz = V.z + fz * L * k;
        let nx = cx - P.x, nz = cz - P.z;
        const d = Math.hypot(nx, nz);
        if (d >= rr) continue;
        const sp = Math.hypot(V.vx, V.vz);
        if (sp > H.KNOCK) { postHit(c, P, V.vx / sp, V.vz / sp, sp); V.vx *= H.SLOW; V.vz *= H.SLOW; break; }
        // медленно — как столб: выталкиваем и гасим скорость в тумбу
        if (d < 1e-4) { nx = -fx * k; nz = -fz * k; } else { nx /= d; nz /= d; }
        V.x += nx * (rr - d); V.z += nz * (rr - d);
        const vn = V.vx * nx + V.vz * nz;
        if (vn < 0) { V.vx -= vn * nx; V.vz -= vn * nz; }
        break;
      }
    }
  }
}
function postHit (c, P, dx, dz, sp) {
  P.down = 1; ST.knocked = (ST.knocked || 0) + 1; STATS.posts = (STATS.posts || 0) + 1;
  const pos = c.mesh.geometry.attributes.position, a = pos.array;
  // копия тумбы — от основания, чтобы валить вокруг него
  const n = P.nv, pp = new Float32Array(n * 3), uv = new Float32Array(n * 2), nn = new Float32Array(n * 3), idx = [];
  const ua = c.mesh.geometry.attributes.uv.array, na = c.mesh.geometry.attributes.normal.array;
  for (let i = 0; i < n; i++) {
    const v = P.v0 + i;
    pp[i * 3] = a[v * 3] - P.x; pp[i * 3 + 1] = a[v * 3 + 1] - P.gh; pp[i * 3 + 2] = a[v * 3 + 2] - P.z;
    uv[i * 2] = ua[v * 2]; uv[i * 2 + 1] = ua[v * 2 + 1];
    nn[i * 3] = na[v * 3]; nn[i * 3 + 1] = na[v * 3 + 1]; nn[i * 3 + 2] = na[v * 3 + 2];
    a[v * 3] = P.x; a[v * 3 + 1] = P.gh - 2; a[v * 3 + 2] = P.z;
  }
  pos.needsUpdate = true;
  for (let b = 0; b < n; b += 4) idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  const ry = Math.atan2(dx, dz);                   // валится по ходу машины: наклон по своей оси X
  g.rotateY(-ry);                                  // листовки остаются там, где висели
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, MAT);
  m.position.set(P.x, P.gh, P.z);
  m.rotation.order = 'YXZ';
  m.rotation.y = ry;
  A.scene.add(m);
  FALLEN.push({ m, t: 0, T: PROT.HIT.FALL * (sp > 12 ? 0.6 : 1) });
  if (A.sparks) A.sparks(P.x, 0.9, P.z, 4, dx, dz);
  if (A.Snd && A.Snd.fx) A.Snd.fx('smash', s => s.noise(0.16, 0.2), { x: P.x, z: P.z });
  if (A.S) A.S.shake = Math.max(A.S.shake || 0, 0.15);
}
function fallenStep (dt) {
  const H = PROT.HIT;
  for (let i = FALLEN.length - 1; i >= 0; i--) {
    const f = FALLEN[i];
    f.t += dt;
    const k = Math.min(1, f.t / f.T);
    f.m.rotation.x = (Math.PI / 2 - 0.06) * k * k;    // с ускорением, как падает столб
    const sink = f.t - H.LIE;
    if (sink > 0) f.m.position.y -= dt * 0.25;
    if (sink > H.SINK) { A.scene.remove(f.m); f.m.geometry.dispose(); FALLEN.splice(i, 1); }
  }
}
function chunksStep () {
  const V = A.V, ci = Math.floor(V.x / PROT.CELL), cj = Math.floor(V.z / PROT.CELL);
  for (const [k, c] of CHUNKS) if (Math.abs(c.ci - ci) > PROT.KEEP || Math.abs(c.cj - cj) > PROT.KEEP) dropChunk(k);
  // за кадр — одна клетка, сначала ближняя
  for (let r = 0; r <= PROT.NEAR; r++) {
    for (let i = ci - r; i <= ci + r; i++) {
      for (let j = cj - r; j <= cj + r; j++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || CHUNKS.has(i + ',' + j)) continue;
        buildChunk(i, j);
        return;
      }
    }
  }
}

/* ─────────────── толпа инстансами (марш, слушатели) ─────────────── */
let BODY = null, HEAD = null, MBODY = null, PLAC = null;
function crowdGeo () {
  if (BODY) return;
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const legs = () => { const b = []; A.put(b, B(0.16, 0.8, 0.18), '#4a4a52', -0.11, 0.4, 0); A.put(b, B(0.16, 0.8, 0.18), '#4a4a52', 0.11, 0.4, 0); A.put(b, B(0.46, 0.62, 0.26), '#ffffff', 0, 1.1, 0); return b; };
  const b = legs();
  A.put(b, B(0.12, 0.58, 0.14), '#ffffff', -0.3, 1.12, 0, 0, 0, -0.12);
  A.put(b, B(0.12, 0.58, 0.14), '#ffffff', 0.3, 1.12, 0, 0, 0, 0.12);
  BODY = A.mergeGeos(b);
  const m = legs();                                   // митингующий: правая рука вверх, древко плаката
  A.put(m, B(0.12, 0.58, 0.14), '#ffffff', -0.3, 1.12, 0, 0, 0, -0.12);
  A.put(m, B(0.12, 0.58, 0.14), '#ffffff', 0.3, 1.6, 0.04);
  A.put(m, B(0.05, 1.3, 0.05), '#8a6a4a', 0.3, 1.95, 0.1);
  MBODY = A.mergeGeos(m);
  const h = [];
  A.put(h, B(0.26, 0.28, 0.26), '#ffffff', 0, 1.56, 0);
  A.put(h, B(0.28, 0.08, 0.28), '#3a2a20', 0, 1.72, -0.01);
  HEAD = A.mergeGeos(h);
  PLAC = [0, 1, 2, 3].map(i => {
    const g = new THREE.PlaneGeometry(0.9, 0.45);
    const uv = cellUV(i), a = g.attributes.uv;
    for (let k = 0; k < a.count; k++) a.setXY(k, a.getX(k) ? uv[2] : uv[0], a.getY(k) ? uv[3] : uv[1]);
    g.translate(0.3, 2.55, 0.12);
    return g;
  });
}
const M4 = new THREE.Matrix4(), R4 = new THREE.Matrix4(), COL = new THREE.Color();
function inst (geo, mat, n) { const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); m.count = n; m.frustumCulled = false; A.scene.add(m); return m; }
function setInst (meshes, i, x, y, z, ry, s) {
  R4.makeRotationY(ry); M4.makeScale(s, s, s).premultiply(R4); M4.setPosition(x, y, z);
  for (const m of meshes) if (m) m.setMatrixAt(i, M4);
}
function hideInst (meshes, i) { M4.makeScale(0, 0, 0); for (const m of meshes) if (m) m.setMatrixAt(i, M4); }
function dropInst (m) { if (!m) return; A.scene.remove(m); m.dispose(); }

/* наезд: в кузове? → { al, ac, fx, fz } */
function inCar (x, z) {
  const V = A.V, fx = Math.sin(V.h), fz = Math.cos(V.h), ex = x - V.x, ez = z - V.z, al = ex * fx + ez * fz, ac = ex * fz - ez * fx;
  if (Math.abs(al) >= HL || Math.abs(ac) >= HW) return null;
  return { al, ac, fx, fz };
}
function pushOut (c) {
  const outW = HW - Math.abs(c.ac) + 0.05, outL = HL - Math.abs(c.al) + 0.05;
  if (outW <= outL) { const k = c.ac >= 0 ? outW : -outW; return [c.fz * k, -c.fx * k]; }
  const k = c.al >= 0 ? outL : -outL; return [c.fx * k, c.fz * k];
}
const fast = () => Math.hypot(A.V.vx, A.V.vz) * 3.6 >= TIER.FALL;
/* сбит инстанс: на его месте — настоящий человек, и по общим правилам (hits.js) */
function knockInst (x, z, ry, shirt) {
  const g = A.makeHuman(null, { shirt });
  g.position.set(x, A.groundH(x, z), z); g.rotation.y = ry;
  A.scene.add(g);
  A.dropMesh(g);
  A.gibHuman({ x, z, grp: g }, A.V.vx, A.V.vz);
  if (A.onRunOver) A.onRunOver();
}
function knockHuman (m) {
  m.dead = 1; unsay(m);
  A.dropMesh(m.grp);
  A.gibHuman({ x: m.x, z: m.z, grp: m.grp }, A.V.vx, A.V.vz);
  if (A.onRunOver) A.onRunOver();
}
function say (m, text, col, y) {
  if (!A.sayBubble || !m || m.dead) return;
  unsay(m);
  m.bubble = A.sayBubble(m.grp, text, col || '#5a4a9a', y || 2.7);
  m.bubT = 2.8;
}
function unsay (m) { if (m && m.bubble) { m.grp.remove(m.bubble); m.bubble.material.dispose(); m.bubble = null; } }
const ground = (x, z) => A.groundH(x, z) + (A.curbAt ? A.curbAt(x, z) : 0);

/* ─────────────── марш ─────────────── */
let MA = null;
const MS = { cd: 0 };
function pathFrom (s0, fwd) {
  let a = fwd ? [s0.x1, s0.z1] : [s0.x2, s0.z2], b = fwd ? [s0.x2, s0.z2] : [s0.x1, s0.z1];
  const pts = [{ x: a[0], z: a[1], d: 0 }], used = new Set([s0]);
  let len = 0, w = s0.w || 7;
  for (let k = 0; k < 10; k++) {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    len += l; pts.push({ x: b[0], z: b[1], d: len });
    if (len >= PROT.MARCH.LEN[1]) break;
    const ux = (b[0] - a[0]) / (l || 1), uz = (b[1] - a[1]) / (l || 1);
    let best = null, bd = 0.8;
    for (const q of ENDS.get(ekey(b[0], b[1])) || []) {
      if (used.has(q)) continue;
      const st = Math.hypot(q.x1 - b[0], q.z1 - b[1]) < 1;
      const nb = st ? [q.x2, q.z2] : [q.x1, q.z1], ql = Math.hypot(nb[0] - b[0], nb[1] - b[1]) || 1;
      const dot = ((nb[0] - b[0]) * ux + (nb[1] - b[1]) * uz) / ql;
      if (dot > bd) { bd = dot; best = { q, nb }; }
    }
    if (!best) break;
    used.add(best.q); w = Math.min(w, best.q.w || 7);
    a = b; b = best.nb;
  }
  return { pts, len, w };
}
function posAt (P, s) {
  const p = P.pts;
  s = clamp(s, 0, P.len);
  let i = 0;
  while (i < p.length - 2 && p[i + 1].d < s) i++;
  const a = p[i], b = p[i + 1], l = (b.d - a.d) || 1, k = (s - a.d) / l;
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, ux: (b.x - a.x) / l, uz: (b.z - a.z) / l };
}
function spawnMarch (force) {
  if (MA) clearMarch();
  segs(); atlas(); crowdGeo();
  const V = A.V, C = PROT.MARCH, sp = Math.hypot(V.vx, V.vz), h = sp > 3 ? Math.atan2(V.vx, V.vz) : V.h;
  const ci = Math.floor(V.x / PROT.CELL), cj = Math.floor(V.z / PROT.CELL), cand = [];
  for (let i = ci - 1; i <= ci + 1; i++) {
    for (let j = cj - 1; j <= cj + 1; j++) {
      for (const s of BUCKET.get(i + ',' + j) || []) {
        if ((s.w || 7) < 6) continue;
        const mx = (s.x1 + s.x2) / 2, mz = (s.z1 + s.z2) / 2, d = Math.hypot(mx - V.x, mz - V.z);
        if (d < C.R[0] * (force ? 0.4 : 1) || d > C.R[1] * (force ? 1.5 : 1) || FEST.blocks(mx, mz, 10)) continue;
        const ahead = Math.cos(Math.atan2(mx - V.x, mz - V.z) - h);
        cand.push({ s, k: ahead + Math.random() * 0.8 });
      }
    }
  }
  cand.sort((a, b) => b.k - a.k);
  for (const c of cand.slice(0, 12)) {
    const P = pathFrom(c.s, Math.random() < 0.5);
    if (P.len < C.LEN[0]) continue;
    buildMarch(P);
    return true;
  }
  return false;
}
function buildMarch (P) {
  const C = PROT.MARCH, n = Math.round(rand(C.N[0], C.N[1]));
  const cols = P.w >= 9 ? 4 : 3, rows = Math.ceil(n / cols);
  const pl = [0, 0, 0, 0], M = [];
  for (let i = 0; i < n; i++) {
    const v = i % 4;
    M.push({ row: (i / cols) | 0, lat: ((i % cols) - (cols - 1) / 2) * 1.05 + rand(-0.15, 0.15), ox: 0, oz: 0, dead: 0, ph: rand(0, 6), v, j: pl[v]++, shirt: pick(SHIRTS), x: 0, z: 0, ry: 0 });
  }
  const body = inst(MBODY, CMAT, n), head = inst(HEAD, CMAT, n), plac = PLAC.map((g, v) => inst(g, MAT, pl[v]));
  M.forEach((m, i) => { body.setColorAt(i, COL.set(m.shirt)); head.setColorAt(i, COL.set(pick(SKINS))); });
  // ведущий с мегафоном — настоящий человек: кричит речёвки
  const lg = A.makeHuman(null, { shirt: prob().col[0] });
  const u = lg.userData;
  if (u.armR) { const g = []; A.put(g, new THREE.CylinderGeometry(0.07, 0.16, 0.34, 8), '#f2f2f0', 0, -0.62, 0.12, Math.PI / 2); u.armR.add(new THREE.Mesh(A.mergeGeos(g), A.HUMAN_VC)); }
  A.scene.add(lg);
  DIRECTOR.start('march');
  MA = { P, st: 'walk', S: rows * 1.5 + 3, t: 0, M, body, head, plac, rows, cols, half: (cols - 1) / 2 * 1.05 + 0.5,
    lead: { grp: lg, u, x: 0, z: 0, dead: 0, bubble: null, bubT: 0, ph: 0 }, sayT: 1, rowPts: [], cx: P.pts[0].x, cz: P.pts[0].z, rad: 0, heldNow: 0, held: 0, ko: 0 };
  STATS.marches++;
}
function clearMarch () {
  if (!MA) return;
  DIRECTOR.end('march');
  dropInst(MA.body); dropInst(MA.head); for (const m of MA.plac) dropInst(m);
  if (!MA.lead.dead) { unsay(MA.lead); A.dropMesh(MA.lead.grp); }
  MA = null;
}
function marchStep (dt) {
  const C = PROT.MARCH, V = A.V, P = MA.P;
  MA.t += dt;
  MA.held = MA.heldNow; MA.heldNow = 0;
  if (MA.st === 'walk') { MA.S += C.V * dt; if (MA.S >= P.len) { MA.S = P.len; MA.st = 'rally'; MA.t = 0; } }
  const dC = Math.hypot(V.x - MA.cx, V.z - MA.cz);
  if (dC > C.FAR || (MA.st === 'rally' && MA.t > C.RALLY && (dC > 70 || MA.t > C.RALLY + 40))) { clearMarch(); MS.cd = rand(C.EVERY[0], C.EVERY[1]); return; }
  const near = dC < 60, hit = near && fast();
  // ведущий — впереди колонны
  const L = MA.lead;
  if (!L.dead) {
    const p = posAt(P, MA.S + 0.2);
    L.x = p.x; L.z = p.z;
    const ry = Math.atan2(p.ux, p.uz);
    L.ph += dt * (MA.st === 'walk' ? 7 : 2);
    const sw = MA.st === 'walk' ? Math.sin(L.ph) * 0.5 : 0, u = L.u;
    if (u.legL) { u.legL.rotation.x = sw; u.legR.rotation.x = -sw; }
    if (u.armR) u.armR.rotation.x = -1.9;
    if (L.bubble && (L.bubT -= dt) <= 0) unsay(L);
    if ((MA.sayT -= dt) <= 0) {
      MA.sayT = rand(2.6, 4.2);
      const pool = [...prob().chant, ...prob().slog, ...(A.ADULT ? MARCH_ADULT : [])];
      say(L, t(pick(pool)), prob().col[0]);
    }
    const c = near && inCar(L.x, L.z);
    if (c && hit) { knockHuman(L); MA.ko++; STATS.marchKo++; try { RESPECT.add(null, 'marcher'); } catch (e) { /* без респекта */ } }
    else { L.grp.position.set(L.x, ground(L.x, L.z), L.z); L.grp.rotation.y = ry; }
  }
  // колонна
  let sx = 0, sz = 0, cnt = 0;
  const beat = MA.t * (MA.st === 'walk' ? 7 : 4);
  for (let i = 0; i < MA.M.length; i++) {
    const m = MA.M[i];
    if (m.dead) continue;
    const p = posAt(P, MA.S - 2.2 - m.row * 1.5);
    m.ox = damp(m.ox, 0, 0.5, dt); m.oz = damp(m.oz, 0, 0.5, dt);
    m.x = p.x + p.uz * m.lat + m.ox; m.z = p.z - p.ux * m.lat + m.oz;
    m.ry = Math.atan2(p.ux, p.uz);
    if (near) {
      const c = inCar(m.x, m.z);
      if (c) {
        if (hit) {
          m.dead = 1; hideInst([MA.body, MA.head], i); hideInst([MA.plac[m.v]], m.j);
          knockInst(m.x, m.z, m.ry, m.shirt); MA.ko++; STATS.marchKo++;
          try { RESPECT.add(null, 'marcher'); } catch (e) { /* без респекта */ }
          if (!L.dead) say(L, t(pick(MARCH_HIT)), '#d9342c');
          continue;
        }
        const [ex, ez] = pushOut(c); m.ox += ex; m.oz += ez; m.x += ex; m.z += ez;
      }
    }
    const y = ground(m.x, m.z) + Math.abs(Math.sin(beat + m.ph)) * 0.07;
    setInst([MA.body, MA.head], i, m.x, y, m.z, m.ry, 1);
    setInst([MA.plac[m.v]], m.j, m.x, y + Math.max(0, Math.sin(beat * 0.5 + m.ph)) * 0.18, m.z, m.ry, 1);
    sx += m.x; sz += m.z; cnt++;
  }
  MA.body.instanceMatrix.needsUpdate = MA.head.instanceMatrix.needsUpdate = true;
  for (const pm of MA.plac) pm.instanceMatrix.needsUpdate = true;
  // где колонна — для машин потока: середина каждого ряда и ведущий
  MA.rowPts.length = 0;
  for (let r = -1; r < MA.rows; r++) { const p = posAt(P, MA.S - 2.2 - r * 1.5); MA.rowPts.push(p); }
  if (cnt) { MA.cx = sx / cnt; MA.cz = sz / cnt; } else { const p = posAt(P, MA.S); MA.cx = p.x; MA.cz = p.z; }
  MA.rad = MA.rows * 1.5 + 4;
  if (!cnt && L.dead) { clearMarch(); MS.cd = rand(C.EVERY[0], C.EVERY[1]); }
}
/* хук в updateTraffic: машина потока перед колонной тормозит и ждёт (1 — едет, 0 — стоит) */
export function trafficHold (t) {
  if (!MA || !MA.rowPts.length) return 1;
  if (Math.abs(t.x - MA.cx) > MA.rad + 22 || Math.abs(t.z - MA.cz) > MA.rad + 22) return 1;
  const hx = Math.sin(t.h), hz = Math.cos(t.h), Y = PROT.YIELD;
  let slow = 1;
  for (const p of MA.rowPts) {
    const dx = p.x - t.x, dz = p.z - t.z, fw = dx * hx + dz * hz;
    if (fw <= -1 || fw > Y.REACH || Math.abs(-hz * dx + hx * dz) > Y.HALF + MA.half) continue;
    slow = Math.min(slow, clamp((fw - (t.hl || 2) - Y.GAP) / Y.SOFT, 0, 1));
  }
  if (slow < 0.05) { MA.heldNow++; STATS.held = Math.max(STATS.held, MA.heldNow); }
  return slow;
}

/* ─────────────── драки (ступень 4) ─────────────── */
const RIOTS = [];
const RS = { cd: 0 };
function sideSpot (minD, maxD) {
  const V = A.V, sp = Math.hypot(V.vx, V.vz), h = sp > 3 ? Math.atan2(V.vx, V.vz) : V.h;
  for (let k = 0; k < 30; k++) {
    const a = h + rand(-1.3, 1.3), d = rand(minD, maxD), x = V.x + Math.sin(a) * d, z = V.z + Math.cos(a) * d;
    const r = A.nearestRoad(x, z, 4, 2);
    if (!r || r.d > 35 || r.seg.b) continue;
    let nx = x - r.x, nz = z - r.z;
    const nl = Math.hypot(nx, nz);
    if (nl < 0.2) { const sx = r.seg.x2 - r.seg.x1, sz = r.seg.z2 - r.seg.z1, sl = Math.hypot(sx, sz) || 1; nx = sz / sl; nz = -sx / sl; } else { nx /= nl; nz /= nl; }
    const off = (r.seg.w || 7) / 2 + rand(2.2, 3.6), px = r.x + nx * off, pz = r.z + nz * off;
    if (!A.inBounds(px, pz, 8) || A.inHouse(px, pz, 1.6) || FEST.blocks(px, pz, 4)) continue;
    const r2 = A.nearestRoad(px, pz);
    if (r2 && r2.d < (r2.seg.w || 7) / 2 + 1.2) continue;
    if (RIOTS.some(o => Math.hypot(o.x - px, o.z - pz) < 40)) continue;
    return { x: px, z: pz, nx, nz };
  }
  return null;
}
function spawnRiot (force) {
  const s = sideSpot(PROT.RIOT.R[0] * (force ? 0.5 : 1), PROT.RIOT.R[1]);
  if (!s) return false;
  const n = Math.round(rand(PROT.RIOT.MEN[0], PROT.RIOT.MEN[1] + 0.49)), P = prob(), men = [];
  for (let i = 0; i < n; i++) {
    const side = i % 2, grp = A.makeHuman(null, { shirt: side ? P.col[0] : pick(['#5a6070', '#2b2a30', '#8a6a4a']) });
    A.scene.add(grp);
    const a = i / n * Math.PI * 2 + rand(-0.3, 0.3), r = rand(0.5, 0.8);
    men.push({ grp, u: grp.userData, x: s.x + Math.sin(a) * r, z: s.z + Math.cos(a) * r, bx: s.x + Math.sin(a) * r, bz: s.z + Math.cos(a) * r, h: 0, ph: rand(0, 6), dead: 0, bubble: null, bubT: 0, punch: 0, pT: rand(0.3, 1.2), jx: 0, jz: 0 });
  }
  RIOTS.push({ x: s.x, z: s.z, men, t: 0, life: rand(PROT.RIOT.LIFE[0], PROT.RIOT.LIFE[1]), sayT: 0.5, smokeT: 1 });
  if (RIOTS.length === 1) DIRECTOR.start('riot');   // восстание — одно событие, сколько бы кучек ни дралось
  STATS.riots++;
  return true;
}
function clearRiot (R) { for (const m of R.men) if (!m.dead) { unsay(m); A.dropMesh(m.grp); } R.men.length = 0; }
function riotStep (dt) {
  const V = A.V;
  for (let k = RIOTS.length - 1; k >= 0; k--) {
    const R = RIOTS[k];
    R.t += dt;
    const dC = Math.hypot(V.x - R.x, V.z - R.z), alive = R.men.filter(m => !m.dead);
    if (dC > PROT.RIOT.FAR || alive.length < 1 || (R.t > R.life && dC > 50)) { clearRiot(R); RIOTS.splice(k, 1); if (!RIOTS.length) DIRECTOR.end('riot'); continue; }
    if ((R.sayT -= dt) <= 0 && alive.length) {
      R.sayT = rand(2, 3.5);
      const pool = [...RIOT_L, ...prob().chant, ...(A.ADULT ? RIOT_ADULT : [])];
      say(pick(alive), t(pick(pool)), '#d9342c');
    }
    if ((R.smokeT -= dt) <= 0 && dC < 150) { R.smokeT = rand(1.5, 3); if (A.puff) A.puff(R.x + rand(-2, 2), 0.4, R.z + rand(-2, 2), true, rand(0.5, 0.9)); }
    const hit = dC < 30 && fast();
    for (const m of alive) {
      const u = m.u;
      if (m.bubble && (m.bubT -= dt) <= 0) unsay(m);
      const foe = alive.length > 1 ? alive[(alive.indexOf(m) + 1) % alive.length] : null;
      if (foe) m.h = damp(m.h, m.h + wrap(Math.atan2(foe.x - m.x, foe.z - m.z) - m.h), 6, dt);
      m.punch = Math.max(0, m.punch - dt * 4);
      if ((m.pT -= dt) <= 0) { m.pT = rand(0.5, 1.3); m.punch = 1; if (foe) { foe.jx += Math.sin(m.h) * 0.25; foe.jz += Math.cos(m.h) * 0.25; } }
      m.jx = damp(m.jx, 0, 3, dt); m.jz = damp(m.jz, 0, 3, dt);
      m.x = m.bx + m.jx; m.z = m.bz + m.jz;
      m.ph += dt * 6;
      if (u.armR) u.armR.rotation.x = -0.6 - 1.2 * m.punch;
      if (u.armL) u.armL.rotation.x = -0.9 + Math.sin(m.ph) * 0.2;
      if (u.legL) { u.legL.rotation.x = Math.sin(m.ph) * 0.25; u.legR.rotation.x = -Math.sin(m.ph) * 0.25; }
      const c = dC < 30 && inCar(m.x, m.z);
      if (c) {
        if (hit) { knockHuman(m); STATS.riotKo++; continue; }
        const [ex, ez] = pushOut(c); m.bx += ex; m.bz += ez; m.x += ex; m.z += ez;
      }
      m.grp.position.set(m.x, ground(m.x, m.z), m.z);
      m.grp.rotation.y = m.h;
    }
  }
}
function clearRiots () { for (const R of RIOTS) clearRiot(R); if (RIOTS.length) DIRECTOR.end('riot'); RIOTS.length = 0; }

/* ─────────────── концерты и сходки ─────────────── */
const GIGS = [];
const GS = { cd: 0 };
function clearAt (x, z, r) {
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
    if (!A.inBounds(px, pz, 4) || A.inHouse(px, pz, 0.3)) return false;
    const rd = A.nearestRoad(px, pz, 9, 1);
    if (rd && rd.d < (rd.seg.w || 6) / 2 + 1.5) return false;
  }
  return !A.inHouse(x, z, 1);
}
function gigSpot (force) {
  const V = A.V, B = A.BENCHES || [];
  if (!B.length) return null;
  const lo = GIG.R[0] * (force ? 0.3 : 1), hi = force ? GIG.FAR - 30 : GIG.R[1];
  const near = B.filter(b => { const d = Math.hypot(b.x - V.x, b.z - V.z); return d > lo && d < hi; });
  for (let k = 0; k < Math.min(60, near.length * 2); k++) {
    const b = near[(Math.random() * near.length) | 0];
    if (FEST.blocks(b.x, b.z, 20) || GIGS.some(g => Math.hypot(g.x - b.x, g.z - b.z) < GIG.SPACING)) continue;
    const a = rand(0, Math.PI * 2), x = b.x + Math.sin(a) * 4, z = b.z + Math.cos(a) * 4;
    if (!clearAt(x, z, 4.5) || !clearAt(x, z, 2.5)) continue;
    // лицом к ближайшей улице: слушатели — между сценой и улицей, видно с дороги
    const r = A.nearestRoad(x, z);
    let fx = r ? r.x - x : 1, fz = r ? r.z - z : 0;
    const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    return { x, z, fx, fz };
  }
  return null;
}
function guitar (col) {
  const g = [];
  A.put(g, new THREE.BoxGeometry(0.36, 0.44, 0.1), col, 0, 0, 0);
  A.put(g, new THREE.BoxGeometry(0.06, 0.6, 0.05), '#3a2a20', 0, 0.5, 0);
  const m = new THREE.Mesh(A.mergeGeos(g), A.HUMAN_VC);
  m.position.set(0.02, 1.0, 0.2); m.rotation.z = 0.9;
  return m;
}
function spawnGig (force, kind) {
  const s = gigSpot(force);
  if (!s) return false;
  crowdGeo();
  const h = clockH(), eve = h >= GIG.EVE_H[0] && h < GIG.EVE_H[1];
  kind = kind || (Math.random() < (eve ? 0.45 : 0.25) ? 'band' : Math.random() < 0.6 ? 'guitar' : 'meet');
  const { x, z, fx, fz } = s, ry = Math.atan2(fx, fz), rx = fz, rz = -fx;     // rx/rz — вправо от сцены
  const gh = A.groundH(x, z), sg = [], musicians = [];
  const P = (lx, lf) => [x + rx * lx + fx * lf, z + rz * lx + fz * lf];
  let top = 0;
  if (kind === 'band') {
    top = 0.35;
    A.put(sg, new THREE.BoxGeometry(4.4, 0.35, 2.6), '#3a3a42', x, gh + 0.175, z, 0, ry);
    for (const sd of [-1, 1]) { const [px, pz] = P(sd * 2.6, 0.3); A.put(sg, new THREE.BoxGeometry(0.6, 1.2, 0.5), '#1b1b20', px, gh + 0.6, pz, 0, ry); }
    const [dx, dz] = P(0, -0.7);
    A.put(sg, new THREE.CylinderGeometry(0.38, 0.38, 0.35, 12), '#c9452a', dx, gh + top + 0.4, dz, Math.PI / 2, ry);
    A.put(sg, new THREE.CylinderGeometry(0.22, 0.22, 0.14, 10), '#e8eef2', dx + rx * 0.5, gh + top + 0.65, dz + rz * 0.5);
  } else if (kind === 'guitar') {
    const [ax, az] = P(0.8, 0.1);
    A.put(sg, new THREE.BoxGeometry(0.5, 0.45, 0.3), '#2b2a30', ax, gh + 0.225, az, 0, ry);
  } else {
    top = 0.4;
    A.put(sg, new THREE.BoxGeometry(0.7, 0.4, 0.6), '#8a6a4a', x, gh + 0.2, z, 0, ry);
  }
  { const [mx, mz] = P(-0.4, 0.5); A.put(sg, new THREE.BoxGeometry(0.04, 1.4, 0.04), '#1b1b20', mx, gh + top + 0.7, mz, 0, ry); }   // стойка микрофона
  const stage = new THREE.Mesh(A.mergeGeos(sg), CMAT);
  A.scene.add(stage);
  const add = (lx, lf, role, shirt) => {
    const grp = A.makeHuman(null, { shirt });
    if (role === 'guitar' || role === 'bass') grp.add(guitar(role === 'bass' ? '#2f6fd8' : '#c9873a'));
    const [px, pz] = P(lx, lf);
    grp.position.set(px, gh + top, pz); grp.rotation.y = ry;
    A.scene.add(grp);
    musicians.push({ grp, u: grp.userData, x: px, z: pz, role, dead: 0, bubble: null, bubT: 0, ph: rand(0, 6) });
  };
  if (kind === 'band') { add(-1.2, 0.3, 'guitar', '#2b2a30'); add(1.2, 0.3, 'bass', '#d9342c'); add(0, -1.1, 'drums', '#e8eef2'); }
  else if (kind === 'guitar') add(0, 0, 'guitar', pick(SHIRTS));
  else add(0, 0, 'speak', pick(SHIRTS));
  // слушатели: полукругом перед сценой (на сходке — кругом)
  const n = Math.round(rand(GIG.CROWD[0], GIG.CROWD[1])), L = [];
  for (let k = 0; k < n * 6 && L.length < n; k++) {
    const ang = kind === 'meet' ? rand(-2.4, 2.4) : rand(-1.1, 1.1), r = kind === 'band' ? rand(3, 7.5) : rand(2, 5.5);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const lx = x + (fx * ca + rx * sa) * r, lz = z + (fz * ca + rz * sa) * r;
    if (A.inHouse(lx, lz, 0.3) || L.some(q => (q.x - lx) ** 2 + (q.z - lz) ** 2 < 0.45)) continue;
    const rd = A.nearestRoad(lx, lz, 9, 1);
    if (rd && rd.d < (rd.seg.w || 6) / 2 + 0.6) continue;
    L.push({ x: lx, z: lz, y: A.groundH(lx, lz), ry: Math.atan2(x - lx, z - lz) + rand(-0.4, 0.4), s: rand(0.88, 1.08), ph: rand(0, 6.28), amp: Math.random() < 0.6 ? rand(0.06, 0.22) : 0.02, hop: 0, vx: 0, vz: 0, dead: 0, shirt: pick(SHIRTS) });
  }
  const body = inst(BODY, CMAT, L.length), head = inst(HEAD, CMAT, L.length);
  L.forEach((q, i) => { body.setColorAt(i, COL.set(q.shirt)); head.setColorAt(i, COL.set(pick(SKINS))); });
  const band = t(pick(BANDS));
  DIRECTOR.start('gig');
  GIGS.push({ kind, x, z, fx, fz, stage, musicians, L, body, head, t: 0, life: rand(GIG.LIFE[0], GIG.LIFE[1]), st: 'on', sayT: 1.5, noteT: 0.5, band });
  STATS.gigs++;
  return true;
}
function clearGig (G) {
  DIRECTOR.end('gig');
  A.scene.remove(G.stage); G.stage.geometry.dispose();
  for (const m of G.musicians) if (!m.dead) { unsay(m); A.dropMesh(m.grp); }
  dropInst(G.body); dropInst(G.head);
}
function gigStep (dt) {
  const V = A.V, sp = Math.hypot(V.vx, V.vz);
  for (let k = GIGS.length - 1; k >= 0; k--) {
    const G = GIGS[k];
    G.t += dt;
    const dC = Math.hypot(V.x - G.x, V.z - G.z);
    if (dC > GIG.FAR || (G.t > G.life && (dC > 60 || G.t > G.life + 40)) || (G.st === 'run' && G.t > 7)) { clearGig(G); GIGS.splice(k, 1); continue; }
    const music = G.kind !== 'meet' && G.st === 'on', near = dC < 40, hit = near && sp * 3.6 >= TIER.FALL;
    // музыканты
    const live = G.musicians.filter(m => !m.dead);
    if (G.st === 'on' && G.musicians.length && !live.length) { G.st = 'run'; G.t = 0; }
    if (G.st === 'on' && (G.sayT -= dt) <= 0 && live.length) {
      G.sayT = G.kind === 'meet' ? rand(3, 5) : rand(6, 10);
      const pool = G.kind === 'meet' ? MEET_L : GIG_L, m = live[0];
      say(m, G.kind === 'band' && Math.random() < 0.3 ? t('Мы — группа «{band}»!', { band: G.band }) : t(pick(pool)), G.kind === 'meet' ? '#5a4a9a' : '#2f8f5b');
    }
    if (music && dC < 120 && (G.noteT -= dt) <= 0 && live.length && A.emote) { G.noteT = rand(0.7, 1.2); const m = pick(live); A.emote(m.x, 2.4, m.z, 'note', 1); }
    for (const m of live) {
      const u = m.u;
      if (m.bubble && (m.bubT -= dt) <= 0) unsay(m);
      m.ph += dt;
      if (G.st !== 'on') continue;
      if (m.role === 'guitar' || m.role === 'bass') { if (u.armR) u.armR.rotation.x = -0.7 + Math.sin(m.ph * 14) * 0.3; if (u.armL) u.armL.rotation.x = -1.1; }
      else if (m.role === 'drums') { if (u.armR) u.armR.rotation.x = -0.9 + Math.sin(m.ph * 11) * 0.45; if (u.armL) u.armL.rotation.x = -0.9 - Math.sin(m.ph * 11) * 0.45; }
      else { if (u.armR) u.armR.rotation.x = -1.2 - Math.max(0, Math.sin(m.ph * 2)) * 1.2; }
      if (near && inCar(m.x, m.z) && hit) { knockHuman(m); STATS.gigKo++; }
    }
    // слушатели
    const beat = G.t * 4.2;
    for (let i = 0; i < G.L.length; i++) {
      const q = G.L[i];
      if (q.dead) continue;
      if (near) {
        const dx = q.x - V.x, dz = q.z - V.z, d = Math.hypot(dx, dz);
        if (d < 4.2 && sp > 2 && q.hop <= 0.2) { const kk = 7 / (d || 1); q.vx = dx * kk; q.vz = dz * kk; q.hop = 0.6; }
        const c = d < 3.5 && inCar(q.x, q.z);
        if (c && hit) { q.dead = 1; hideInst([G.body, G.head], i); knockInst(q.x, q.z, q.ry, q.shirt); STATS.gigKo++; continue; }
      }
      if (G.st === 'run' && !q.vx && !q.vz) { const dx = q.x - G.x, dz = q.z - G.z, d = Math.hypot(dx, dz) || 1; q.vx = dx / d * 4.5; q.vz = dz / d * 4.5; q.ry = Math.atan2(dx, dz); }
      if (q.hop > 0) { q.hop = Math.max(0, q.hop - dt); q.x += q.vx * dt; q.z += q.vz * dt; q.vx *= 0.9; q.vz *= 0.9; }
      else if (G.st === 'run') { q.x += q.vx * dt; q.z += q.vz * dt; }
      const y = q.y + (music ? Math.max(0, Math.sin(beat + q.ph)) * q.amp : 0) + (q.hop > 0 ? Math.sin(q.hop / 0.6 * Math.PI) * 0.8 : 0);
      setInst([G.body, G.head], i, q.x, y, q.z, q.ry + (music ? Math.sin(beat * 0.25 + q.ph) * 0.15 : 0), q.s);
    }
    G.body.instanceMatrix.needsUpdate = G.head.instanceMatrix.needsUpdate = true;
  }
}
function clearGigs () { for (const G of GIGS) clearGig(G); GIGS.length = 0; }
const clockH = () => (A.ENV ? hourOf(A.ENV.t) % 24 : 12);
function gigEvery () {
  const h = clockH();
  if (h >= GIG.EVE_H[0] && h < GIG.EVE_H[1]) return GIG.EVE;
  if (h >= GIG.NIGHT_H[0] && h < GIG.NIGHT_H[1]) return GIG.NIGHT;
  return GIG.DAY;
}
const gigMax = () => { const h = clockH(); return h >= GIG.EVE_H[0] && h < GIG.EVE_H[1] ? GIG.MAX_EVE : GIG.MAX; };

/* ─────────────── кадр ─────────────── */
function live () {
  const S = A.S;
  return S && ['drive', 'back', 'handover', 'side'].includes(S.state);
}
function apply (r) {
  const prevP = ST.p, prevSt = ST.stage;
  ST.stage = ST.force !== null ? ST.force : r.stage;
  ST.p = ST.forceP !== null ? ST.forceP : r.p;
  ST.cycle = r.cycle;
  if (prevP !== ST.p || prevSt !== ST.stage || !CHUNKS.size) { atlas(); dropAllChunks(); }
  if (MA) clearMarch();
  clearRiots();
}
function announce () {
  const st = ST.stage, P = prob(), key = ST.cycle + ':' + ST.p + ':' + st;
  if (!st || ST.annKey === key) return;
  ST.annKey = key;
  const o = load(); if (o.ann === key && ST.force === null) return;
  o.ann = key; save(o);
  if (st === 5) {
    if (A.chat) A.chat(t(P.win));
  } else if (A.chat && ANNOUNCE[st]) A.chat(t(ANNOUNCE[st], { title: title(P) }));
}
export function step (dt, api) {
  if (api) A = api;
  if (!A || !A.CAREER) return;
  if (typeof window !== 'undefined' && window.__dlv && !window.__dlv.PROT) window.__dlv.PROT = DEBUG;
  const S = A.S;
  const ses = DIST.session();
  if (ses !== ST.session) {
    ST.session = ses;
    segs();
    if (ST.knocked) dropAllChunks();               // новая смена — тумбы снова стоят
    apply(resolve());
    ST.annT = S && !S.ride ? 4.5 : -1;
    MS.cd = rand(PROT.MARCH.FIRST[0], PROT.MARCH.FIRST[1]); RS.cd = rand(5, 15); GS.cd = rand(15, 40);
    clearGigs();
  }
  if (!S || S.state === 'title') { if (MA) clearMarch(); if (RIOTS.length) clearRiots(); if (GIGS.length) clearGigs(); return; }
  chunksStep();
  postsCar();                                      // тумбы: сбиваются или держат (PROT.HIT)
  if (FALLEN.length) fallenStep(dt);
  if (!live()) return;
  if (ST.annT > 0 && (ST.annT -= dt) <= 0) announce();
  // марш (ступени 3—4)
  if (MA) marchStep(dt);
  else if (ST.stage >= 3 && ST.stage <= 4 && (MS.cd -= dt) <= 0) { if (!DIRECTOR.can('march') || !spawnMarch()) MS.cd = 3; }
  // драки (ступень 4)
  if (RIOTS.length) riotStep(dt);
  if (ST.stage === 4 && RIOTS.length < PROT.RIOT.N && (RS.cd -= dt) <= 0) RS.cd = (RIOTS.length || DIRECTOR.can('riot')) && spawnRiot() ? rand(PROT.RIOT.GAP[0], PROT.RIOT.GAP[1]) : 3;
  // концерты и сходки
  if (GIGS.length) gigStep(dt);
  if (GIGS.length < gigMax() && (GS.cd -= dt) <= 0) { const e = gigEvery(); GS.cd = DIRECTOR.can('gig') && spawnGig() ? rand(e[0], e[1]) : 5; }
}

/* где сейчас толпа — для гула толпы (ambience.js): марш, драки, концерты во дворах */
export function crowds () {
  const out = [];
  if (MA) out.push({ x: MA.cx, z: MA.cz, k: 1, kind: 'march' });
  for (const r of RIOTS) out.push({ x: r.x, z: r.z, k: 0.8, kind: 'riot' });
  for (const g of GIGS) out.push({ x: g.x, z: g.z, k: 0.7, kind: 'gig' });
  return out;
}

export const DEBUG = {
  PROT, GIG, ST, STATS,
  problems: () => PROBLEMS.map(p => p.id),
  /* стадия сейчас (n = 0…5, null — по сменам) и проблема (id) */
  stage (n = null, id) {
    ST.force = n;
    if (id !== undefined) { const i = PROBLEMS.findIndex(p => p.id === id); ST.forceP = i >= 0 ? i : null; }
    apply(resolve()); ST.annKey = ''; announce();
    return this.info;
  },
  march: () => spawnMarch(true),
  get MA () { return MA; }, get GIGS () { return GIGS; },
  riot: () => spawnRiot(true),
  gig: kind => spawnGig(true, kind),
  clear: () => { clearMarch(); clearRiots(); clearGigs(); },
  /* тумбы рядом: [{ x, z, down }] — проверить, что сбиваются (PROT.HIT) */
  posts: (x, z, r = 60) => [...CHUNKS.values()].flatMap(c => c.posts || []).filter(P => Math.hypot(P.x - x, P.z - z) < r).map(P => ({ x: P.x, z: P.z, down: P.down })),
  get FALLEN () { return FALLEN.length; },
  fallen: () => FALLEN.map(f => ({ p: f.m.position.toArray().map(Math.round), rx: +f.m.rotation.x.toFixed(2), ry: +f.m.rotation.y.toFixed(2), r: +f.m.geometry.boundingSphere.radius.toFixed(2), c: f.m.geometry.boundingSphere.center.toArray().map(v => +v.toFixed(2)), vis: f.m.visible, n: f.m.geometry.attributes.position.count })),
  /* прогон ступеней: номер законченной смены → ступень (цикл по 8 смен) */
  sim (n = 20) { const out = []; let c0 = PROT.FROM; for (let s = 0; s < n; s++) { if (s < PROT.FROM) { out.push(0); continue; } let st = stageAt(s - c0); if (!st) { c0 = s; st = 1; } out.push(st); } return out; },
  get info () {
    return {
      stage: ST.stage, problem: prob().id, title: A ? title(prob()) : '', cycle: ST.cycle, chunks: CHUNKS.size, quads: STATS.quads,
      decor: [...CHUNKS.values()].reduce((a, c) => { for (const k in c.cnt) a[k] = (a[k] || 0) + c.cnt[k]; return a; }, {}),
      march: MA ? { st: MA.st, S: Math.round(MA.S), len: Math.round(MA.P.len), n: MA.M.filter(m => !m.dead).length, held: MA.held, x: Math.round(MA.cx), z: Math.round(MA.cz), ko: MA.ko } : null,
      riots: RIOTS.map(R => ({ x: Math.round(R.x), z: Math.round(R.z), men: R.men.filter(m => !m.dead).length })),
      gigs: GIGS.map(G => ({ kind: G.kind, x: Math.round(G.x), z: Math.round(G.z), crowd: G.L.filter(q => !q.dead).length, st: G.st })),
      stats: { ...STATS },
    };
  },
};
