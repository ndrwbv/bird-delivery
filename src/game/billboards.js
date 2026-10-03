/* ──────────────────────────────────────────────────────────────────────────
   Щиты со смешной рекламой у больших дорог (блок 6 docs/IDEAS.md,
   CAREER.md → «Город: билборды»).

   • Где: вдоль проспектов и главных улиц (класс 1—2) — не ближе 380 м друг
     к другу, вдоль улиц класса 3 — не ближе 650 м; за тротуаром (5,5 м от
     края проезжей части), не в доме, не на другой дороге и не у мостов.
     Сторона дороги — жребий по месту. В Солнечном выходит ~40—60 щитов.
   • Какие: стойка на бетонной тумбе, щит 6 × 3 м на высоте 5—8 м, две
     стороны. Лицевая повёрнута к тем, кто едет по ближней полосе (на 30°
     к дороге), обратная — ко встречным.
   • Реклама: 30 шуток (кальянная Стёпы, «Королева Бургеров», «Вселенная
     суши», ставки, «Птица Пицца», бизнес «скоро открытие», город Солнечный,
     комбинат, лоси, гараж, такси…), рисунок и надпись — кодом на холсте,
     на языке игры (t). Кальян, ставки и займы — только во взрослой.
     Каждая сторона меняет рекламу раз в 35—75 с.
   • Не сбиваются: стальная стойка на тумбе — препятствие, как стена.
   Всё на одной текстуре-атласе 1536 × 1536 (клетка 384 × 192), все стороны всех
   щитов — один меш (один вызов отрисовки); стойки и рамы — в общей склейке LIT.
   Всё нужное из игры — объектом api (bbApi в game.js).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t, N_ } from '../i18n/index.js';

const hash = (x, z, k = 0) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
const rand = (a, b) => a + Math.random() * (b - a);

export const DEBUG = { boards: 0, faces: 0, ads: 0, swaps: 0, tried: 0, ms: 0, list: [] };

/* ═════════════ реклама ═════════════
   h — заголовок, s — подпись, pic — рисунок, bg/fg/ac — фон, текст, акцент */
const ADS = [
  { h: N_('Кальянная «У Стёпы»'), s: N_('Дымим с 9 до 24. Бизнесмен угощает'), pic: 'hookah', bg: '#2b1e3f', fg: '#f4e6ff', ac: '#c88bff', adult: 1 },
  { h: N_('Кальянная «У Стёпы»'), s: N_('Новый вкус: дыня с пломбиром'), pic: 'hookah', bg: '#3a2b18', fg: '#ffe8c0', ac: '#ffb347', adult: 1 },
  { h: N_('Королева Бургеров'), s: N_('Корона — бесплатно. Бургер — нет'), pic: 'burger', bg: '#f4c430', fg: '#1d3f8f', ac: '#1d3f8f' },
  { h: N_('Королева Бургеров'), s: N_('Двойной сыр. Двойная королева'), pic: 'burger', bg: '#1d3f8f', fg: '#ffd84a', ac: '#ffd84a' },
  { h: N_('Вселенная суши'), s: N_('Роллы со скоростью света'), pic: 'sushi', bg: '#1b6fa8', fg: '#ffffff', ac: '#9be3ff' },
  { h: N_('Вселенная суши'), s: N_('Васаби — как сверхновая. Осторожно'), pic: 'sushi', bg: '#0e2a4a', fg: '#c9f0ff', ac: '#7fe07a' },
  { h: N_('Птица Пицца'), s: N_('Долетим за 30 минут. Или быстрее'), pic: 'pizza', bg: '#f07a2a', fg: '#ffffff', ac: '#ffe27a' },
  { h: N_('Птица Пицца'), s: N_('Ищем курьеров. Права — желательно'), pic: 'bird', bg: '#fff3dc', fg: '#d9531e', ac: '#f07a2a' },
  { h: N_('Ставки «ЛосьБет»'), s: N_('Ставь на лося. Лось не подведёт'), pic: 'moose', bg: '#0f4d2e', fg: '#ffffff', ac: '#f5d22e', adult: 1 },
  { h: N_('Ставки «ЛосьБет»'), s: N_('Проиграл? Это была инвестиция'), pic: 'dice', bg: '#151515', fg: '#f5d22e', ac: '#f5d22e', adult: 1 },
  { h: N_('Займы «Дотяни»'), s: N_('До зарплаты. И ещё чуть-чуть. И ещё'), pic: 'coins', bg: '#e8f4e8', fg: '#1d5a2e', ac: '#2f9e5a', adult: 1 },
  { h: N_('Скоро открытие!'), s: N_('Открываемся с 2009 года'), pic: 'crane', bg: '#ffd23f', fg: '#1d1d1b', ac: '#1d1d1b' },
  { h: N_('Здесь будет ТЦ'), s: N_('Сдача — вчера. Аренда — уже'), pic: 'crane', bg: '#e9e4da', fg: '#c8323a', ac: '#c8323a' },
  { h: N_('Бизнес-центр «Вот-вот»'), s: N_('Офисы от 2 м². Почти готово'), pic: 'house', bg: '#3c4a5c', fg: '#ffffff', ac: '#8fd0ff' },
  { h: N_('Солнечный'), s: N_('У нас всегда солнечно*  *кроме зимы'), pic: 'sun', bg: '#7ec4e8', fg: '#1d3460', ac: '#ffd23f' },
  { h: N_('Солнечный'), s: N_('Закрытый город — открытые сердца'), pic: 'heart', bg: '#ffe3e3', fg: '#a8252f', ac: '#e04a5a' },
  { h: N_('Комбинат приглашает'), s: N_('Стабильная зарплата. Стабильный изотоп'), pic: 'atom', bg: '#dff1fa', fg: '#1f4f8a', ac: '#d8382f' },
  { h: N_('Мирный атом'), s: N_('Светим с 1949 года. Не руками'), pic: 'atom', bg: '#1f4f8a', fg: '#ffffff', ac: '#ffd23f' },
  { h: N_('Осторожно, лоси!'), s: N_('Они тоже спешат на работу'), pic: 'moose', bg: '#ffd23f', fg: '#1d1d1b', ac: '#c8323a' },
  { h: N_('Лось — не машина'), s: N_('Уступи. Он сильнее'), pic: 'moose', bg: '#e9f2e1', fg: '#2f5a3a', ac: '#6b4630' },
  { h: N_('Гараж дяди Жени'), s: N_('Ремонт любой сложности. Сложно — дороже'), pic: 'wrench', bg: '#2a3b4c', fg: '#ffd84a', ac: '#c9d2da' },
  { h: N_('Шиномонтаж «Круглый»'), s: N_('Колёса круглые. Гарантия'), pic: 'tire', bg: '#f4f4f0', fg: '#1d1d1b', ac: '#e8892e' },
  { h: N_('Автошкола «Педаль»'), s: N_('Научим ездить. Парковка — за доплату'), pic: 'car', bg: '#c8e6ff', fg: '#13406e', ac: '#d8382f' },
  { h: N_('Такси «Шашечки»'), s: N_('Быстро, дёшево, с музыкой. Выбери два'), pic: 'taxi', bg: '#1d1d1b', fg: '#ffd23f', ac: '#ffd23f' },
  { h: N_('Стоматология «Зуб да зуб»'), s: N_('Улыбайтесь, пока бесплатно'), pic: 'tooth', bg: '#e6f7f7', fg: '#1a6a7a', ac: '#3fb8c8' },
  { h: N_('Качалка №1'), s: N_('Первое занятие бесплатно. Последнее тоже'), pic: 'dumbbell', bg: '#d8382f', fg: '#ffffff', ac: '#1d1d1b' },
  { h: N_('Шаурма «Ночной дожор»'), s: N_('Открыто, пока вы голодны'), pic: 'shawarma', bg: '#5a2a14', fg: '#ffe0a8', ac: '#ffb347' },
  { h: N_('ЖК «Почти центр»'), s: N_('10 минут до центра. На вертолёте'), pic: 'house', bg: '#eef0e6', fg: '#3a5a2a', ac: '#7aa84a' },
  { h: N_('Баня «Пар-Паром»'), s: N_('Пар костей не ломит. Веник в подарок'), pic: 'steam', bg: '#8a5a3a', fg: '#fff3dc', ac: '#ffd8a8' },
  { h: N_('Вайбкодинг за 3 дня'), s: N_('Пиши игры, не читая код. Курсы Андрюши'), pic: 'laptop', bg: '#14182a', fg: '#7fffb0', ac: '#7fffb0' },
];

/* ═════════════ рисунки: в квадрате s×s от (0, 0) ═════════════ */
function circle (x, cx, cy, r, col) { x.fillStyle = col; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); }
function poly (x, pts, col) { x.fillStyle = col; x.beginPath(); x.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]); x.closePath(); x.fill(); }
function line (x, pts, w, col) { x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath(); x.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]); x.stroke(); }
function rrect (x, x0, y0, w, h, r, col) { x.fillStyle = col; x.beginPath(); x.roundRect ? x.roundRect(x0, y0, w, h, r) : x.rect(x0, y0, w, h); x.fill(); }

/* рисунки в квадрате 100×100 (масштаб — снаружи) */
const PICS = {
  hookah (x, a) {
    for (let i = 0; i < 3; i++) circle(x, 62 + i * 9, 20 - i * 6, 8 + i * 3, 'rgba(255,255,255,0.35)');
    poly(x, [44, 18, 56, 18, 54, 30, 46, 30], '#c9a14a');
    line(x, [50, 30, 50, 62], 7, '#c9a14a');
    circle(x, 50, 76, 20, a);
    line(x, [62, 62, 84, 70, 90, 88], 4, '#e6e6e6');
    poly(x, [36, 94, 64, 94, 58, 98, 42, 98], '#c9a14a');
  },
  burger (x, a) {
    poly(x, [30, 22, 38, 8, 46, 18, 50, 4, 54, 18, 62, 8, 70, 22], '#ffd84a');   // корона
    rrect(x, 18, 26, 64, 22, 14, '#e8a54a');
    rrect(x, 14, 48, 72, 8, 4, '#5fb04a');
    rrect(x, 16, 56, 68, 6, 3, '#ffcf3a');
    rrect(x, 16, 62, 68, 12, 6, '#7a3f22');
    rrect(x, 18, 74, 64, 14, 7, '#e8a54a');
  },
  sushi (x, a) {
    for (let i = 0; i < 6; i++) circle(x, 8 + i * 17, 10 + (i * 37) % 30, 2, '#ffffff');
    circle(x, 50, 58, 34, '#1d1d1b'); circle(x, 50, 58, 27, '#ffffff'); circle(x, 50, 58, 12, '#f07a5a'); circle(x, 46, 54, 5, '#7fd06a');
    line(x, [74, 18, 96, 70], 4, '#d8b07a'); line(x, [82, 16, 100, 66], 4, '#d8b07a');
  },
  pizza (x, a) {
    poly(x, [10, 20, 90, 20, 50, 96], '#f9e08a');
    line(x, [10, 20, 90, 20], 12, '#c77b3a');
    for (const [cx, cy, r] of [[36, 36, 8], [62, 38, 9], [50, 58, 7], [48, 78, 5]]) circle(x, cx, cy, r, '#cc3b2c');
  },
  bird (x, a) {
    poly(x, [10, 60, 50, 42, 78, 58, 46, 72], '#f07a2a');
    poly(x, [36, 52, 62, 14, 58, 60], '#e2561f');
    circle(x, 78, 52, 12, '#f07a2a'); poly(x, [88, 48, 100, 54, 88, 58], '#ffcf3a'); circle(x, 81, 49, 3, '#1d2433');
    poly(x, [40, 78, 66, 78, 53, 98], '#f6c35b'); circle(x, 52, 84, 3, '#c8382c');
  },
  moose (x, a) {
    const M = '#6b4630';
    poly(x, [12, 46, 66, 42, 68, 70, 16, 72], M);
    for (const lx of [18, 28, 56, 64]) line(x, [lx, 70, lx, 96], 6, M);
    poly(x, [60, 46, 76, 20, 86, 24, 74, 52], M);
    poly(x, [74, 18, 96, 24, 96, 36, 78, 32], M);
    line(x, [76, 20, 66, 4, 58, 8], 4, '#e6d2a6'); line(x, [82, 18, 90, 2, 98, 4], 4, '#e6d2a6');
  },
  dice (x, a) {
    rrect(x, 8, 30, 46, 46, 8, '#ffffff'); rrect(x, 50, 18, 42, 42, 8, '#d8382f');
    for (const [cx, cy] of [[20, 42], [31, 53], [42, 64]]) circle(x, cx, cy, 4, '#1d1d1b');
    for (const [cx, cy] of [[61, 29], [81, 29], [61, 49], [81, 49]]) circle(x, cx, cy, 4, '#ffffff');
    for (let i = 0; i < 3; i++) { circle(x, 30 + i * 22, 88, 9, '#f5d22e'); circle(x, 30 + i * 22, 88, 5, '#c9a10e'); }
  },
  coins (x, a) {
    for (let i = 0; i < 5; i++) rrect(x, 14, 80 - i * 10, 40, 9, 4, i % 2 ? '#e8c64a' : '#f5d86a');
    for (let i = 0; i < 3; i++) rrect(x, 56, 80 - i * 10, 34, 9, 4, i % 2 ? '#e8c64a' : '#f5d86a');
    line(x, [20, 30, 50, 18, 80, 30], 5, a); poly(x, [74, 22, 86, 30, 74, 36], a);
  },
  crane (x, a) {
    line(x, [30, 96, 30, 10], 7, '#f2a51a'); line(x, [10, 14, 92, 14], 6, '#f2a51a');
    line(x, [30, 14, 14, 30], 3, '#f2a51a'); line(x, [80, 14, 80, 54], 2, '#1d1d1b');
    rrect(x, 70, 54, 20, 12, 2, '#8a8a8a');
    for (let i = 0; i < 3; i++) rrect(x, 46, 96 - (i + 1) * 12, 40, 11, 1, i % 2 ? '#b8b0a4' : '#cfc7bb');
  },
  house (x, a) {
    rrect(x, 20, 16, 60, 82, 2, '#d9d4c8');
    for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) rrect(x, 26 + c * 13, 22 + r * 12, 8, 7, 1, (r + c) % 3 ? '#8fb0cc' : '#ffe9a8');
    line(x, [84, 96, 84, 40], 3, '#7a7a7a'); poly(x, [84, 40, 98, 46, 84, 52], a);
  },
  sun (x, a) {
    circle(x, 50, 48, 22, '#ffd23f');
    for (let i = 0; i < 10; i++) { const g = i / 10 * Math.PI * 2; line(x, [50 + Math.cos(g) * 28, 48 + Math.sin(g) * 28, 50 + Math.cos(g) * 40, 48 + Math.sin(g) * 40], 5, '#ffd23f'); }
    for (let i = 0; i < 5; i++) rrect(x, 4 + i * 20, 82 - (i % 3) * 8, 16, 18 + (i % 3) * 8, 1, '#4a5a7a');
  },
  heart (x, a) {
    circle(x, 36, 40, 18, a); circle(x, 64, 40, 18, a); poly(x, [19, 46, 81, 46, 50, 82], a);
    for (let i = 0; i < 6; i++) rrect(x, 4 + i * 16, 86, 12, 12, 1, '#9a968c');
    line(x, [0, 86, 100, 86], 2, '#3b3a3f');
  },
  atom (x, a) {
    x.save(); x.translate(50, 52);
    for (const g of [0, Math.PI / 3, -Math.PI / 3]) { x.save(); x.rotate(g); x.strokeStyle = a; x.lineWidth = 4; x.beginPath(); x.ellipse(0, 0, 44, 15, 0, 0, Math.PI * 2); x.stroke(); x.restore(); }
    circle(x, 0, 0, 9, '#d8382f');
    x.restore();
  },
  wrench (x, a, bg) {
    line(x, [22, 82, 70, 30], 12, a);
    circle(x, 76, 24, 16, a); circle(x, 84, 16, 8, bg);               // зев ключа — цветом фона
    line(x, [30, 30, 76, 76], 8, '#e8892e'); rrect(x, 62, 62, 24, 24, 4, '#e8892e');
  },
  tire (x, a) {
    circle(x, 50, 50, 42, '#1d1d1b'); circle(x, 50, 50, 22, '#9a9a9a'); circle(x, 50, 50, 8, '#5a5a5a');
    for (let i = 0; i < 16; i++) { const g = i / 16 * Math.PI * 2; line(x, [50 + Math.cos(g) * 34, 50 + Math.sin(g) * 34, 50 + Math.cos(g) * 41, 50 + Math.sin(g) * 41], 3, '#3a3a3a'); }
  },
  car (x, a) {
    rrect(x, 8, 48, 84, 24, 6, a); poly(x, [24, 48, 34, 30, 68, 30, 80, 48], a);
    poly(x, [30, 47, 37, 34, 50, 34, 50, 47], '#cfe9ff'); poly(x, [54, 47, 54, 34, 66, 34, 75, 47], '#cfe9ff');
    circle(x, 28, 74, 10, '#1d1d1b'); circle(x, 72, 74, 10, '#1d1d1b');
    rrect(x, 40, 10, 20, 16, 2, '#ffffff'); poly(x, [43, 23, 57, 23, 50, 13], '#d8382f');   // знак «учебная»
  },
  taxi (x, a) {
    rrect(x, 8, 48, 84, 24, 6, '#ffd23f'); poly(x, [24, 48, 34, 30, 68, 30, 80, 48], '#ffd23f');
    for (let i = 0; i < 8; i++) rrect(x, 10 + i * 10, 56 + (i % 2) * 5, 5, 5, 0, '#1d1d1b');
    rrect(x, 40, 22, 20, 8, 2, '#1d1d1b');
    circle(x, 28, 74, 10, '#3a3a3a'); circle(x, 72, 74, 10, '#3a3a3a');
  },
  tooth (x, a) {
    x.fillStyle = '#ffffff'; x.beginPath(); x.moveTo(20, 30); x.quadraticCurveTo(20, 10, 38, 12); x.quadraticCurveTo(50, 18, 62, 12); x.quadraticCurveTo(80, 10, 80, 30);
    x.quadraticCurveTo(80, 50, 70, 60); x.lineTo(64, 92); x.quadraticCurveTo(58, 96, 54, 88); x.lineTo(50, 66); x.lineTo(46, 88); x.quadraticCurveTo(42, 96, 36, 92); x.lineTo(30, 60); x.quadraticCurveTo(20, 50, 20, 30); x.fill();
    line(x, [64, 22, 70, 30], 4, a);
    circle(x, 40, 34, 3, '#1d1d1b'); circle(x, 60, 34, 3, '#1d1d1b'); line(x, [42, 44, 50, 48, 58, 44], 3, '#1d1d1b');
  },
  dumbbell (x, a) {
    line(x, [16, 50, 84, 50], 8, '#9a9a9a');
    for (const cx of [16, 26, 74, 84]) rrect(x, cx - 5, 26, 10, 48, 3, '#1d1d1b');
  },
  shawarma (x, a) {
    x.save(); x.translate(50, 54); x.rotate(-0.5);
    rrect(x, -18, -40, 36, 80, 16, '#f2d29a');
    rrect(x, -14, -44, 28, 16, 8, '#5fb04a'); circle(x, -6, -40, 6, '#cc3b2c'); circle(x, 6, -42, 5, '#ffffff');
    line(x, [-14, -10, 14, 0], 3, '#c9a066'); line(x, [-14, 10, 14, 20], 3, '#c9a066');
    x.restore();
  },
  steam (x, a) {
    rrect(x, 10, 64, 80, 30, 4, '#c8935a');
    for (let i = 0; i < 4; i++) line(x, [10, 70 + i * 7, 90, 70 + i * 7], 2, '#8a5a3a');
    for (const cx of [30, 50, 70]) line(x, [cx, 58, cx - 8, 44, cx, 30, cx - 8, 14], 5, '#ffffff');
    line(x, [80, 60, 96, 20], 4, '#7a5a2a'); circle(x, 96, 16, 9, '#5fb04a');
  },
  laptop (x, a) {
    rrect(x, 16, 18, 68, 46, 4, '#3a3f4a'); rrect(x, 21, 23, 58, 36, 2, '#0a0d14');
    for (let i = 0; i < 4; i++) rrect(x, 25 + (i % 2) * 6, 27 + i * 8, 20 + ((i * 13) % 24), 4, 1, a);
    poly(x, [8, 68, 92, 68, 98, 78, 2, 78], '#5a606c');
  },
};

/* ═════════════ атлас ═════════════ */
const CW = 384, CH = 192, COLS = 4, ROWS = 8, AW = CW * COLS, AH = CH * ROWS;
const FONT = (w, fs) => `${w} ${fs}px "Arial Black", Impact, "Helvetica Neue", Arial, sans-serif`;

/* строки по словам в ширину maxW; шрифт уменьшается, пока не влезет в maxL строк */
function fitText (x, text, maxW, fs0, fsMin, maxL, weight) {
  for (let fs = fs0; fs >= fsMin; fs -= 2) {
    x.font = FONT(weight, fs);
    const words = text.split(/\s+/), lines = [];
    let cur = '';
    for (const w of words) {
      const t2 = cur ? cur + ' ' + w : w;
      if (x.measureText(t2).width <= maxW || !cur) cur = t2; else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (lines.length <= maxL && lines.every(l => x.measureText(l).width <= maxW)) return { fs, lines };
  }
  x.font = FONT(weight, fsMin);
  return { fs: fsMin, lines: [text] };
}

function drawAd (x, ad) {
  x.fillStyle = ad.bg; x.fillRect(0, 0, CW, CH);
  x.fillStyle = ad.ac; x.fillRect(0, CH - 10, CW, 10);
  // рисунок слева
  x.save(); x.translate(10, 20); x.scale(1.5, 1.5); PICS[ad.pic](x, ad.ac, ad.bg); x.restore();
  // текст справа
  const tx = 172, tw = CW - tx - 12;
  x.fillStyle = ad.fg; x.textAlign = 'left'; x.textBaseline = 'top';
  const H = fitText(x, t(ad.h), tw, 34, 16, 2, 900);
  let y = 16;
  for (const l of H.lines) { x.font = FONT(900, H.fs); x.fillText(l, tx, y); y += H.fs * 1.08; }
  y += 8;
  x.fillStyle = ad.ac; x.fillRect(tx, y - 5, 46, 4);
  x.fillStyle = ad.fg;
  const S = fitText(x, t(ad.s), tw, 22, 11, 3, 700);
  for (const l of S.lines) { x.font = FONT(700, S.fs); x.fillText(l, tx, y + 2); y += S.fs * 1.18; }
}

let TEX = null, LIST = null;
function atlas (adult) {
  if (TEX) return TEX;
  LIST = ADS.filter(a => adult || !a.adult);
  const c = document.createElement('canvas');
  c.width = AW; c.height = AH;
  const x = c.getContext('2d');
  LIST.slice(0, COLS * ROWS).forEach((ad, i) => {
    x.save(); x.translate((i % COLS) * CW, ((i / COLS) | 0) * CH);
    x.beginPath(); x.rect(0, 0, CW, CH); x.clip();
    drawAd(x, ad);
    x.restore();
  });
  TEX = new THREE.CanvasTexture(c);
  TEX.colorSpace = THREE.SRGBColorSpace;
  TEX.anisotropy = 4;
  DEBUG.ads = Math.min(LIST.length, COLS * ROWS);
  return TEX;
}
/* клетка атласа i → u0, v0, u1, v1 (с отступом в пиксель: соседи не просвечивают) */
function cell (i) {
  const c = i % COLS, r = (i / COLS) | 0, e = 1.5;
  return [(c * CW + e) / AW, 1 - ((r + 1) * CH - e) / AH, ((c + 1) * CW - e) / AW, 1 - (r * CH + e) / AH];
}

/* ═════════════ щиты ═════════════ */
const BOARDS = [];                 // { x, z }
const P = [];                      // вершины сторон щитов до сборки меша
const FACES = [];                  // { v: индекс первой вершины, ad, t }
let MESH = null, UVA = null;
const BW = 6, BH = 3, POLE_H = 5.2;

function place (A, x, z, fx, fz) {
  const gy = A.groundH(x, z), ry = Math.atan2(fx, fz), rx = fz, rz = -fx;   // rx/rz — вправо, если смотреть на лицевую сторону
  A.box(A.LIT, 1.3, 0.5, 1.3, '#a9a59c', x, gy + 0.2, z, ry);                  // тумба
  A.box(A.LIT, 0.5, POLE_H, 0.5, '#5b5f66', x, gy + POLE_H / 2, z, ry);        // стойка
  A.box(A.LIT, BW + 0.4, BH + 0.4, 0.3, '#3d4148', x, gy + POLE_H + BH / 2, z, ry);   // рама
  A.box(A.LIT, BW, 0.08, 0.7, '#5b5f66', x + fx * 0.45, gy + POLE_H - 0.15, z + fz * 0.45, ry);   // мостик
  for (const s of [-1.8, 1.8]) A.box(A.LIT, 0.25, 0.18, 0.6, '#2f3338', x + rx * s + fx * 0.5, gy + POLE_H + BH + 0.35, z + rz * s + fz * 0.5, ry);   // прожекторы
  A.obb(x, z, 0.65, 0.65, ry);
  const y0 = gy + POLE_H + 0.0, y1 = y0 + BH;
  for (const side of [1, -1]) {
    const nx = fx * side, nz = fz * side, ox = x + nx * 0.16, oz = z + nz * 0.16;
    const qx = rx * side * BW / 2, qz = rz * side * BW / 2;          // вправо для смотрящего на эту сторону
    FACES.push({ v: P.length / 3, ad: -1, t: rand(35, 75) });
    P.push(ox - qx, y0, oz - qz, ox + qx, y0, oz + qz, ox + qx, y1, oz + qz, ox - qx, y1, oz - qz);
  }
  BOARDS.push({ x, z });
}

/* пройти по большим улицам и поставить щиты */
export function build (A) {
  const t0 = performance.now();
  const MIN = c => (c <= 2 ? 380 : 650), STEP = 60;
  const far = (x, z, m) => BOARDS.every(b => (b.x - x) ** 2 + (b.z - z) ** 2 > m * m);
  const roads = A.CITY.roads.filter(r => r.c >= 1 && r.c <= 3 && !r.b).sort((a, b) => a.c - b.c);
  for (const r of roads) {
    const w = A.roadWidth(r), off = w / 2 + 5.5;
    let acc = STEP * 0.5;
    for (let i = 1; i < r.p.length; i++) {
      const [x1, z1] = r.p[i - 1], [x2, z2] = r.p[i];
      const L = Math.hypot(x2 - x1, z2 - z1);
      if (L < 1) continue;
      const ux = (x2 - x1) / L, uz = (z2 - z1) / L;
      for (; acc < L; acc += STEP) {
        const cx = x1 + ux * acc, cz = z1 + uz * acc;
        if (!far(cx, cz, MIN(r.c))) continue;
        DEBUG.tried++;
        // справа или слева по ходу +u (справа — (-uz, ux), как у рёбер графа)
        const sd = hash(cx, cz, 4) < 0.5 ? 1 : -1, nx = -uz * sd, nz = ux * sd;
        const x = cx + nx * off, z = cz + nz * off;
        if (!A.inBounds(x, z, 40) || A.inHouse(x, z, 4)) continue;
        const rr = A.nearestRoad(x, z, 7, 1);
        if (rr && (rr.seg.b || rr.d < rr.seg.w / 2 + 2.5)) continue;
        const rb = A.nearestRoad(x, z, 5, 2);
        if (rb && rb.seg.b && rb.d < 40) continue;                  // у моста — нет
        // лицом к тем, кто едет по ближней полосе: навстречу им и на 30° к дороге
        const dx = ux * sd, dz = uz * sd, ca = Math.cos(0.52), sa = Math.sin(0.52);
        const fx = -dx * ca - nx * sa, fz = -dz * ca - nz * sa;
        const rx = fz, rz = -fx;
        if (A.inHouse(x + rx * 3.4, z + rz * 3.4, 1.5) || A.inHouse(x - rx * 3.4, z - rz * 3.4, 1.5)) continue;
        if (Math.abs(A.groundH(x, z) - A.groundH(cx, cz)) > 2.5) continue;   // в овраге и на круче — нет
        place(A, x, z, fx, fz);
      }
      acc -= L;
    }
  }
  if (!FACES.length) return;
  const tex = atlas(A.ADULT);
  const n = LIST.length;
  const g = new THREE.BufferGeometry(), idx = [];
  const uv = new Float32Array(FACES.length * 8);
  for (let i = 0; i < FACES.length; i++) {
    const v = FACES[i].v;
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    // соседние щиты и две стороны одного — разная реклама
    FACES[i].ad = (i * 7 + ((i * 13) >> 1)) % n;
    if (i & 1 && FACES[i].ad === FACES[i - 1].ad) FACES[i].ad = (FACES[i].ad + 1) % n;
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  UVA = new THREE.BufferAttribute(uv, 2);
  UVA.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('uv', UVA);
  g.setIndex(idx);
  g.computeBoundingSphere();
  for (let i = 0; i < FACES.length; i++) setUV(i);
  const m = new THREE.MeshBasicMaterial({ map: tex });
  m.userData.glow = 1;                             // не темнить вместе со склейками: щиты ночью подсвечены
  MESH = new THREE.Mesh(g, m);
  MESH.matrixAutoUpdate = false;
  MESH.name = 'billboards';
  A.scene.add(MESH);
  P.length = 0;
  DEBUG.boards = BOARDS.length; DEBUG.faces = FACES.length;
  DEBUG.list = BOARDS.map(b => [Math.round(b.x), Math.round(b.z)]);
  DEBUG.ms = Math.round(performance.now() - t0);
}
function setUV (i) {
  const [u0, v0, u1, v1] = cell(FACES[i].ad), a = UVA.array, o = i * 8;
  a[o] = u0; a[o + 1] = v0; a[o + 2] = u1; a[o + 3] = v0; a[o + 4] = u1; a[o + 5] = v1; a[o + 6] = u0; a[o + 7] = v1;
}

/* смена рекламы: каждая сторона раз в 35—75 с; ночью щиты чуть темнее дня, но светятся */
let night = -1;
export function step (dt, A) {
  if (!MESH) return;
  let dirty = false;
  const n = LIST.length;
  for (let i = 0; i < FACES.length; i++) {
    const f = FACES[i];
    if ((f.t -= dt) > 0) continue;
    f.t = rand(35, 75);
    const other = FACES[i ^ 1].ad;
    let k = f.ad;
    for (let tries = 0; tries < 6 && (k === f.ad || k === other); tries++) k = (Math.random() * n) | 0;
    f.ad = k; setUV(i); dirty = true; DEBUG.swaps++;
  }
  if (dirty) UVA.needsUpdate = true;
  const nt = A.ENV ? A.ENV.night : 0;
  if (Math.abs(nt - night) > 0.02) { night = nt; MESH.material.color.setScalar(1 - 0.3 * nt); }
}
