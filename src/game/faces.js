/* ──────────────────────────────────────────────────────────────────────────
   Знакомые лица района (docs/IDEAS.md трек 11 п. 5; docs/ORDERS.md «Знакомые лица района: Глеб»).
   Автор, 11.10.2026: «Давай сразу сделаешь этого оппозиционера. Одного и всё» — житель первого района, который
   встречается снова и снова, с маленькой историей на 4 появления: «а что с ним будет дальше?».

   Глеб — оппозиционер (лет 30, очки, свитер, листовки; квартира — книги, плакат «Снесите забор», кот). Один и тот же
   подъезд в первом районе (запоминается на первом появлении). По одному появлению за смену, со 2-й смены игрока,
   только в первом районе — их ставит ритм смены (rhythm.js) раньше обычных встреч у двери, как заказ, где клиент — он:
     1 — встреча у двери: петиция против забора («Подпишу» / «Мне нельзя») — ответ запоминаем;
     2 — заказ ему, при вручении — поручение: забрать у товарища пачку листовок в другом подъезде (orders.config.js
         SIDE_ORDERS 'gleb-leaflets', errands.js: товарищ нервный — отдаёт или «за мной следят, уходи»);
     3 — встреча у двери: он на нервах, во дворе — чёрная машина без номеров; реплика — по ответу в 1-м;
     4 — заказ на его адрес (в накладной — он), дверь открывает жена: «Его вчера забрали…»; дальше он не появляется,
         на двери его подъезда — плакат «Вернись, Глеб».
   Прогресс — в сохранении профиля 'dlv-faces' (сброс прогресса его стирает). Пропустил смену или не доехал — история ждёт.
   Детская версия — мягче: без «органов» и «посадят» (чужая машина во дворе, «отправили в командировку»).

   Отсюда encounters.js берёт героев (FACE_HEROES: Глеб и Лена, их встречи — only), подъезды и квартиры (FACE_DECOR,
   FACE_PAL) и сообщает, что встреча сыграна (met). rhythm.js спрашивает want(смена) — есть ли появление в этой смене;
   orders.js ставит адрес (spot), просит поручение (asked).
     init(api)     — game.js: { Store, THREE, scene, groundH, ADULT }; плакат у подъезда, если история кончилась
     reload()      — смена профиля (game.js reprofile): плакат заново
   отладка: __dlv.FACES — state, reset(), step(n, sign) — поставить шаг истории
   ────────────────────────────────────────────────────────────────────────── */
import { t, N_ } from '../i18n/index.js';

export const FC = {
  KEY: 'dlv-faces',      // сохранение профиля: { gleb: { step, last, sign, … } }
  STEPS: 4,              // появлений у Глеба
  POSTER: { side: 0.12, y: 1.45, off: 0.12, w: 0.42, h: 0.58 },   // плакат «Вернись, Глеб» — на двери подъезда: сдвиг вдоль стены, высота центра, от стены, размер
};

/* ─────────────── Глеб и Лена: внешность, характер, встречи (формат smalltalk-lines.js) ─────────────── */
const PETITION = { id: 'gleb-petition', emo: 'ok',
  say: N_('Я Глеб, с третьего. Петиция против забора вокруг города. Подпишешь? Не посадят. Почти.'),
  a: { me: N_('Подпишу'), re: N_('Спасибо. Ты второй. Первый — я.'), mood: 'happy', out: 'tip', row: N_('подписал петицию') },
  b: { me: N_('Мне нельзя'), re: N_('Всем нельзя. Поэтому и забор.'), mood: 'sad', out: '0' },
  kids: { say: N_('Я Глеб, с третьего. Петиция против забора вокруг города. Подпишешь? Это не больно.') } };
const CAR_YES = { id: 'gleb-car-signed', emo: 'scared',
  say: N_('Чёрная машина без номеров. Третий день стоит. Ты подписал — ты тоже в списке.'),
  a: { me: N_('Ну и пусть'), re: N_('Вот это по-нашему. Сдачи не надо — пусть видят, что мы платим.'), mood: 'happy', out: 'tip', row: N_('вместе в списке') },
  b: { me: N_('Вычеркни меня'), re: N_('Из этого списка не вычёркивают. Иди. И не оглядывайся.'), mood: 'sad', out: '0', slam: true },
  kids: { say: N_('Во дворе чужая машина. Третий день стоит. Ты подписал — тебя тоже запомнили.'),
    a: { me: N_('Ну и пусть'), re: N_('Вот это по-нашему. Держи, сдачи не надо.'), mood: 'happy', out: 'tip', row: N_('вместе в списке') },
    b: { me: N_('Вычеркни меня'), re: N_('Уже не вычеркнуть. Иди. И не оглядывайся.'), mood: 'sad', out: '0', slam: true } } };
const CAR_NO = { id: 'gleb-car-nosign', emo: 'scared',
  say: N_('Чёрная машина без номеров. Третий день стоит. Правильно, что ты не подписал.'),
  a: { me: N_('Может, это такси?'), re: N_('Такси с антенной на крыше? Ну-ну. Держи, за оптимизм.'), mood: 'ok', out: 'tip', row: N_('за оптимизм') },
  b: { me: N_('Я передумал'), re: N_('Поздно. Лист уже у них. Езжай.'), mood: 'scared', out: '0', slam: true },
  kids: { say: N_('Во дворе чужая машина. Третий день стоит. Хорошо, что ты не подписал.'),
    a: { me: N_('Может, это такси?'), re: N_('Такси с антенной? Ну-ну. Держи, за оптимизм.'), mood: 'ok', out: 'tip', row: N_('за оптимизм') },
    b: { me: N_('Я передумал'), re: N_('Поздно. Листок уже забрали. Езжай.'), mood: 'scared', out: '0', slam: true } } };
const WIFE_A = { me: N_('Оставьте себе'), re: N_('Спасибо. Вот его чаевые. Он всегда давал.'), mood: 'sad', out: 'tip', row: N_('чаевые Глеба') };
const WIFE_B = { me: N_('Сколько с вас?'), re: N_('Нисколько. Он оплатил заранее. Он всё делал заранее.'), mood: 'sad', out: 'none', slam: true, row: N_('по счёту') };
const WIFE_YES = { id: 'gleb-wife-signed', emo: 'sad',
  say: N_('Его вчера забрали. Пицца на его имя. Он про вас говорил: «второй подписавший».'),
  a: WIFE_A, b: WIFE_B,
  kids: { say: N_('Его вчера срочно отправили в командировку. Далеко. Он про вас говорил: «второй подписавший».') } };
const WIFE_NO = { id: 'gleb-wife-nosign', emo: 'sad',
  say: N_('Его вчера забрали. Пицца на его имя. Заказал заранее — он всё делал заранее.'),
  a: WIFE_A, b: { ...WIFE_B, re: N_('Нисколько. Оплачено. Он не любил быть должным.') },
  kids: { say: N_('Его вчера срочно отправили в командировку. Далеко. А пицца на его имя.') } };

/* герои для encounters.js (поля — как у HEROES там; only — его встречи вместо своей и из smalltalk-lines.js;
   face — чья история: в случайные встречи у двери не попадают) */
export const FACE_HEROES = [
  { id: 'gleb', face: 'gleb', who: 'oppositionist', name: N_('Глеб'), seed: 0x61eb, fem: false, decor: 'oppo',
    look: { age: 'adult', hair: 'curly', hairC: '#3a2a1e', beard: 'goatee', stubble: false, glasses: 'square', glassC: '#1d1a1f', head: 'none',
      eyes: 'round', brows: 'raised', mouth: 'line', top: 'long', shirt: '#7a3a4a', sweater: '#e8dcc0', bottom: 'pants', pants: '#3a4048',
      shoes: '#5a3a22', leaflets: '#f4f1ea', fat: false, shape: 'thin', pack: null },
    char: { walk: { speed: 1.05, step: 9, leg: 0.45, arm: 0.35, stoop: 0.08 }, talk: 'point', idle: 'fidget' },
    only: [PETITION, CAR_YES, CAR_NO] },
  { id: 'glebwife', face: 'gleb', who: 'oppositionist_wife', name: N_('Лена'), seed: 0x1e7a, fem: true, decor: 'search',
    look: { age: 'adult', hair: 'ponytail', hairC: '#6b4a2e', eyes: 'sleepy', bags: true, brows: 'sad', mouth: 'line', head: 'none', glasses: 'none',
      top: 'long', shirt: '#8a9aa8', bottom: 'pants', pants: '#3a3036', shoes: '#5a3a22', fat: false, shape: 'thin', lip: null, pack: null },
    char: { walk: { speed: 0.8, step: 8, leg: 0.3, arm: 0.15, stoop: 0.1 }, talk: 'small', idle: 'still' },
    only: [WIFE_YES, WIFE_NO] },
];

/* ─────────────── подъезд и квартира (encounters.js setDecor: c — box, plane, canvasTex, scrawl, cs, D, hw, ow, R, adult, meet) ─────────────── */
export const FACE_PAL = {
  oppo: { wall: '#b8b2a0', low: '#5a6b5a', floor: '#6b5a4a', door: '#4a5a6b', frame: '#3a3430', roof: '#9a948c', back: '#e8dcc0', lamp: '#fff0c0' },
  search: { wall: '#b8b2a0', low: '#5a6b5a', floor: '#6b5a4a', door: '#4a5a6b', frame: '#3a3430', roof: '#9a948c', back: '#d8ccb0', lamp: '#dde6ff' },
};
export const FACE_DECOR_NAME = { oppo: 'книги, «Снесите забор», кот, листовки', search: 'после обыска: книги на полу, его свитер, кот' };

const FUR = '#8a8580';
/* кот сидит, смотрит на дверь */
function cat (c, x, z) {
  const { box } = c;
  box(0.18, 0.2, 0.26, x, 0.1, z, FUR);
  box(0.16, 0.14, 0.14, x, 0.29, z + 0.1, FUR);
  for (const s of [-1, 1]) {
    box(0.04, 0.05, 0.03, x + s * 0.05, 0.38, z + 0.1, FUR);
    box(0.025, 0.02, 0.01, x + s * 0.04, 0.3, z + 0.172, '#e0c040', null, 'glow');
  }
  box(0.04, 0.04, 0.26, x + 0.09, 0.03, z - 0.06, FUR, [0, 0.4, 0]);
}
/* полка с книгами (или книги на полу — после обыска) */
function books (c, x, fallen, sw = 0.52) {
  const top = 1.2;                                                       // невысокая: над ней — плакат
  const { box, R } = c, cols = ['#d9342c', '#2e4a8a', '#3f8a4a', '#e0b13f', '#6b2e4a', '#f4f1ea', '#1d1a1f'];
  if (!fallen) {
    box(sw, top, 0.03, x, top / 2, 0.08, '#6b4a2e');
    for (const y of [0.05, 0.43, 0.81, top]) box(sw, 0.03, 0.26, x, y, 0.2, '#7a5a3a');
    for (const y of [0.07, 0.45, 0.83]) {
      let bxx = x - sw / 2 + 0.03;
      for (let k = 0; k < 12 && bxx < x + sw / 2 - 0.08; k++) { const w = R(0.035, 0.06), h = R(0.24, 0.38); box(w, h, 0.2, bxx + w / 2, y + h / 2, 0.2, cols[(k * 3 + Math.round(y * 10)) % cols.length]); bxx += w + 0.004; }
    }
    return;
  }
  box(0.52, 0.03, 1.8, x, 0.25, 0.4, '#6b4a2e', [1.25, 0, 0.2]);          // полка лежит наискось
  for (let k = 0; k < 26; k++) box(R(0.04, 0.07), R(0.22, 0.32), 0.18, x + R(-0.3, 0.45), 0.03, R(0.15, 0.65), cols[k % cols.length], [Math.PI / 2, R(0, 3), 0]);
}
/* плакат «Снесите забор» (стоймя, сбоку от проёма — его видно рядом с героем): надпись, под ней забор и крест поверх;
   torn — сорван наполовину (после обыска) */
function fencePoster (c, x, torn, y = 1.42) {
  const tx = c.canvasTex(64, 88, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#f4efe2'; g.fillRect(0, 0, w, h);
    c.scrawl(g, t('СНЕСИТЕ'), 32, 13, 11, '#1d1a1f'); c.scrawl(g, t('ЗАБОР'), 32, 27, 13, '#d9342c');
    g.fillStyle = '#5a4a3a';
    for (let k = 0; k < 6; k++) g.fillRect(6 + k * 10, 44, 5, 34);
    g.fillRect(4, 52, 56, 3); g.fillRect(4, 68, 56, 3);
    g.strokeStyle = '#d9342c'; g.lineWidth = 5; g.beginPath(); g.moveTo(6, 40); g.lineTo(58, 82); g.moveTo(58, 40); g.lineTo(6, 82); g.stroke();
    if (torn) { g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.moveTo(w, 0); g.lineTo(w * 0.3, 0); for (let y = 8; y <= h; y += 8) g.lineTo(w * (0.25 + Math.random() * 0.2) + y * 0.3, y); g.lineTo(w, h); g.fill(); g.globalCompositeOperation = 'source-over'; }
  });
  c.plane(0.32, 0.44, x, y, 0.1, 0, tx, { alpha: true });
}
/* листовка на стене подъезда */
function leaflet (c, x, y, z, rot) {
  const tx = c.canvasTex(32, 44, (g, w, h) => {
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h);
    c.scrawl(g, t('НЕТ'), 16, 9, 9, '#d9342c'); c.scrawl(g, t('ЗАБОРУ!'), 16, 20, 7, '#d9342c');
    g.fillStyle = '#8a8580'; for (let k = 0; k < 4; k++) g.fillRect(4, 28 + k * 4, 24 - (k % 2) * 6, 2);
  });
  const p = c.plane(0.15, 0.21, x, y, z, 0, tx);
  p.rotation.z = rot || 0;
}
/* чёрная машина без номеров во дворе — вдоль стены, ближним концом к двери */
function blackCar (c, cx, cz, dir) {
  const { box } = c, K = '#1b1b20', G = '#0b0b0e';
  box(4.1, 0.62, 1.72, cx, 0.52, cz, K);
  box(2.2, 0.55, 1.5, cx - dir * 0.2, 1.1, cz, K);
  box(2.24, 0.34, 1.54, cx - dir * 0.2, 1.12, cz, G);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.62, 0.62, 0.26, cx + sx * 1.35, 0.31, cz + sz * 0.78, '#0e0e10');
  box(0.02, 0.55, 0.02, cx - dir * 0.9, 1.6, cz - 0.5, '#2b2a30');                       // антенна
  const end = cx + dir * 2.05;                                                             // ближний к двери конец: номера нет — пустая рамка
  box(0.03, 0.13, 0.5, end, 0.48, cz, '#2b2a30');
  for (const s of [-1, 1]) box(0.03, 0.1, 0.2, end, 0.7, cz + s * 0.66, '#7a1a1a', null, 'glow');
}

export const FACE_DECOR = {
  /* Глеб: чисто, но бедно; листовки на стене, коробка листовок у двери; за дверью — полка книг, плакат «Снесите
     забор», кот сидит, лампа. Во встрече «машина без номеров» — во дворе чёрная машина без номеров */
  oppo (c) {
    const { box, cs, D, hw, ow } = c;
    leaflet(c, cs * (ow + (hw - ow) / 2), 1.45, D + 0.068, 0.08);
    leaflet(c, -cs * (ow + (hw - ow) / 2), 1.3, D + 0.068, -0.12);
    const car = /car/.test(c.meet || '');
    if (!car) {                                                                            // коробка листовок (во встрече с машиной — там машина)
      box(0.4, 0.3, 0.32, -cs * 1.25, 0.15, D + 0.3, '#c8a878');
      for (let k = 0; k < 3; k++) box(0.3, 0.02, 0.22, -cs * 1.25, 0.31 + k * 0.022, D + 0.3, '#f4f1ea', [0, k * 0.2, 0]);
    }
    // квартира: сбоку от него (сторона двери — её и видно) — полка книг, над ней плакат; с другой — кот и торшер
    books(c, cs * 0.5, false, 0.62);
    fencePoster(c, cs * 0.47, false, 1.56);
    cat(c, -cs * 0.42, 0.42);
    box(0.06, 0.4, 0.06, -cs * 0.78, 0.2, 0.2, '#2b2a30'); box(0.14, 0.08, 0.14, -cs * 0.78, 0.43, 0.2, '#ffd27a', null, 'glow');   // торшер
    if (car) blackCar(c, -cs * 3.6, 1.25, cs);
  },
  /* после обыска (жена): книги на полу, полка лежит, плакат сорван наполовину, его свитер на вешалке, кот — тот же;
     у подъезда — листовки рассыпаны по земле */
  search (c) {
    const { box, cs, D, R } = c;
    for (let k = 0; k < 16; k++) box(0.15, 0.006, 0.21, R(-2.2, 2.2), 0.004, D + R(0.2, 2), '#f4f1ea', [0, R(0, 3), 0]);
    box(0.4, 0.2, 0.32, -cs * 1.3, 0.1, D + 0.45, '#c8a878', [0.3, 0.6, 0.2]);            // коробка вспорота, лежит
    books(c, -cs * 0.45, true);
    fencePoster(c, cs * 0.42, true, 1.62);
    cat(c, -cs * 0.4, 0.5);
    box(0.04, 1.7, 0.04, cs * 0.78, 0.85, 0.2, '#5a3a22');                                 // вешалка — на ней его свитер
    box(0.3, 0.5, 0.14, cs * 0.8, 1.2, 0.22, '#7a3a4a'); box(0.31, 0.06, 0.15, cs * 0.8, 1.27, 0.22, '#e8dcc0');
    box(0.4, 0.15, 0.3, cs * 0.1, 0.08, 0.5, '#8a6b3a', [0, 0.5, 0]);                      // ящик комода — на полу
  },
};

/* ─────────────── состояние истории ─────────────── */
let A = null, PLANNED = 0;
const LOG = [];
function get (k, d) { try { return A && A.Store ? A.Store.get(k, d) : d; } catch (e) { return d; } }
function set (k, v) { try { if (A && A.Store) A.Store.set(k, v); } catch (e) { /* без сохранения — не страшно */ } }
const cur = () => (+get('dlv-shifts', 0) || 0) + 1;            // номер идущей смены (как rhythm.js R.shift)
function load () {
  let v = get(FC.KEY, null);
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
  return v && typeof v === 'object' ? v : {};
}
function gleb () {
  return Object.assign({ step: 0, last: 0, sign: '', side: '', car: '', end: '', key: '', x: 0, z: 0, door: null }, load().gleb || {});
}
function put (g) { const v = load(); v.gleb = g; set(FC.KEY, v); }
function note (s) { LOG.push('смена ' + cur() + ': ' + s); if (LOG.length > 30) LOG.shift(); }

export const sideId = () => (A && !A.ADULT ? 'gleb-leaflets-k' : 'gleb-leaflets');
const WHAT = ['встреча: петиция', 'поручение: листовки', 'встреча: машина без номеров', 'жена: «его забрали»'];

/** rhythm.js slot: появление знакомого лица в этой смене → { face, step, kind: 'meet' | 'errand', id, i, name, what, key, side } | null.
    Одно за смену; после 4-го — никогда. Адрес — его подъезд (key; пока не запомнен — пусто: выберут, как встрече, и запомнят) */
export function want (shift) {
  if (!A) return null;
  const g = gleb();
  if (g.step >= FC.STEPS || g.last === shift || PLANNED === shift) return null;
  const signed = g.sign === 'yes';
  const s = [{ kind: 'meet', id: 'gleb', i: 0 }, { kind: 'errand', id: 'gleb', i: 0 },
    { kind: 'meet', id: 'gleb', i: signed ? 1 : 2 }, { kind: 'meet', id: 'glebwife', i: signed ? 0 : 1 }][g.step];
  return { face: 'gleb', step: g.step, ...s, name: t(N_('Глеб')), what: (g.step + 1) + '/4 ' + WHAT[g.step], key: g.key, side: sideId() };
}
/** rhythm.js: появление поставлено на заказ этой смены / не вышло (нет адреса) */
export function planned (shift) { PLANNED = shift; }
export function unplan () { PLANNED = 0; }

function remember (g, spot, door) {
  if (spot && spot.key && !g.key) { g.key = spot.key; g.x = Math.round(spot.x * 10) / 10; g.z = Math.round(spot.z * 10) / 10; }
  if (door && !g.door) g.door = [door.ex, door.ez, door.nx, door.nz].map(v => Math.round(v * 1000) / 1000);
}
function advance (g, what) {
  note(WHAT[g.step] + (what ? ' — ' + what : ''));
  g.step++;
  g.last = cur();
  PLANNED = 0;
  put(g);
  if (g.step >= FC.STEPS) poster();
}
/** encounters.js: встреча знакомого лица сыграна на заказе. ans — 'yes' (верхний) / 'no' (нижний) / null (пропустил до вопроса);
    spot — адрес заказа { key, x, z }; door — подъезд сцены { ex, ez, nx, nz } */
export function met (id, ans, spot, door) {
  const g = gleb();
  if (g.step >= FC.STEPS || g.step === 1) return;
  if (g.step === 0) g.sign = ans === 'yes' ? 'yes' : 'no';      // промолчал (пропустил) — не подписал
  if (g.step === 2) g.car = ans || '';
  if (g.step === 3) g.end = ans || '';
  remember(g, spot, door);
  advance(g, ans ? (ans === 'yes' ? 'верхний ответ' : 'нижний ответ') : 'пропустил');
}
/** orders.js: на 2-м появлении Глеб попросил поручение (взял ты его или нет — история идёт дальше) */
export function asked (spot) {
  const g = gleb();
  if (g.step !== 1) return;
  g.side = 'asked';
  remember(g, spot);
  advance(g);
}

/* ─────────────── плакат «Вернись, Глеб» у его подъезда (после 4-го появления) ─────────────── */
let POSTER = null;
function drawGleb (g, X, Y, s) {
  const r = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(X + x * s, Y + y * s, w * s, h * s); };
  r(2, 14, 14, 6, '#4a4a4a');                                          // свитер
  r(5, 2, 8, 11, '#c8c8c8');                                           // лицо (ксерокопия — серое)
  r(4, 0, 10, 3, '#2a2a2a'); r(3, 1, 2, 5, '#2a2a2a'); r(13, 1, 2, 5, '#2a2a2a');   // кудри
  r(5, 5, 3, 2, '#1d1a1f'); r(10, 5, 3, 2, '#1d1a1f'); r(8, 5, 2, 1, '#1d1a1f');    // очки
  r(7, 9, 4, 1, '#2a2a2a'); r(8, 10, 2, 2, '#2a2a2a');                 // бородка
}
function poster () {
  clearPoster();
  const g = gleb();
  if (!A || !A.THREE || !A.scene || g.step < FC.STEPS || !g.door) return;
  const T = A.THREE, [ex, ez, nx, nz] = g.door, P = FC.POSTER;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 88;
  const x = c.getContext('2d');
  x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, 64, 88);
  x.fillStyle = '#e0c060'; x.globalAlpha = 0.7; x.fillRect(0, 0, 12, 6); x.fillRect(52, 0, 12, 6); x.globalAlpha = 1;   // скотч
  drawGleb(x, 14, 10, 2);
  x.font = 'bold 11px "Trebuchet MS", Arial, sans-serif'; x.textAlign = 'center'; x.fillStyle = '#d9342c';
  x.fillText(t('ВЕРНИСЬ,'), 32, 64); x.fillText(t('ГЛЕБ'), 32, 76);
  x.font = '7px "Trebuchet MS", Arial, sans-serif'; x.fillStyle = '#1d1a1f'; x.fillText(t('кот ждёт'), 32, 85);
  const tx = new T.CanvasTexture(c);
  tx.colorSpace = T.SRGBColorSpace; tx.magFilter = T.NearestFilter; tx.generateMipmaps = false; tx.minFilter = T.LinearFilter;
  const m = new T.MeshLambertMaterial({ map: tx });
  const mesh = new T.Mesh(new T.PlaneGeometry(P.w, P.h), m);
  const sx = -nz, sz = nx, px = ex + sx * P.side + nx * P.off, pz = ez + sz * P.side + nz * P.off;
  mesh.position.set(px, (A.groundH ? A.groundH(ex + nx * 0.6, ez + nz * 0.6) : 0) + P.y, pz);
  mesh.rotation.y = Math.atan2(nx, nz);
  mesh.rotation.z = 0.04;
  mesh.name = 'gleb-poster';
  mesh.matrixAutoUpdate = false;                                       // город заморожен (cull.js): матрицу — сразу и один раз
  mesh.updateMatrix();
  A.scene.add(mesh);
  mesh.updateMatrixWorld(true);
  POSTER = { mesh, m, tx };
}
function clearPoster () {
  if (!POSTER) return;
  if (POSTER.mesh.parent) POSTER.mesh.parent.remove(POSTER.mesh);
  POSTER.mesh.geometry.dispose(); POSTER.m.dispose(); POSTER.tx.dispose();
  POSTER = null;
}

export function init (api) {
  A = api;
  reload();
  if (typeof window !== 'undefined') window.setTimeout(() => { if (window.__dlv) window.__dlv.FACES = DEBUG; }, 0);
}
/** смена профиля (game.js reprofile) и запуск: плакат — по сохранению этого профиля */
export function reload () { PLANNED = 0; try { poster(); } catch (e) { console.warn('[faces] poster', e); } }

export const DEBUG = {
  FC, LOG, FACE_HEROES,
  get state () { const g = gleb(); return { ...g, shift: cur(), planned: PLANNED, next: g.step < FC.STEPS ? WHAT[g.step] : 'всё', poster: !!POSTER }; },
  /** с начала: история Глеба заново (адрес тоже) */
  reset () { const v = load(); delete v.gleb; set(FC.KEY, v); PLANNED = 0; clearPoster(); LOG.length = 0; return this.state; },
  /** поставить шаг истории (0—4) и ответ в 1-м ('yes' / 'no'); last — 0, чтобы появление было уже в этой смене */
  step (n, sign) { const g = gleb(); g.step = Math.max(0, Math.min(FC.STEPS, +n || 0)); if (sign) g.sign = sign; g.last = 0; PLANNED = 0; put(g); poster(); return this.state; },
  poster: () => { poster(); return !!POSTER; },
  get mesh () { return POSTER && POSTER.mesh; },
};
