/* ──────────────────────────────────────────────────────────────────────────
   Мобильный режим (11.10.2026, автор: «пусть определяет, что это мобилка, и сразу убирает всё лишнее,
   чтобы вывозила»). Правила словами и цифры памяти — docs/IOS.md «Память на телефоне»,
   как мерить — docs/AGENTS.md «Память на телефоне».

   Определяется один раз при запуске, до сборки города: телефон или планшет — iPhone / iPad / iPod,
   iPad, который притворяется Маком (Macintosh + больше одного касания), Android, палец без мыши
   (pointer: coarse и нет ни одного точного указателя), маленький экран с касаниями (меньше 500 точек
   по короткой стороне). Стим (компьютер и Дека) — никогда. ?mobile — включить на компьютере
   (проверить), ?mobile=0 — выключить на телефоне (сравнить «как было»).

   Что делает режим (каждый модуль читает MOB сам):
   - графика по умолчанию «низкая» (gfx.js: устройство 'phone'), игрок может поднять руками;
   - бюджет памяти: запас людей до 12 (humanpool.js), портретов в кэше до 120, лиц-текстур до 80
     (people.js), портреты заранее — только получатели заказа и Толик (faceahead.js), программы
     шейдеров держим до потолка MOB.programs (warmup.js), окна пиццерий без зала (pizzadome.js), большие
     холсты-атласы (вывески, щиты, стройки, муралы) после загрузки в видеокарту — без копии в странице;
   - видеокарта (18.10.2026, docs/AGENTS.md «Провалы на телефоне»): тыквы Хэллоуина проще и клетками по 250 м
     (holidays.js PUMPKIN.CELL_MOB / SEG_MOB), лесочки дворов 4 из 10 (groveKeep);
   - чистая картинка (24.10.2026, 11бз, CLEAN ниже): мелочь реже или нет, путь, пин, своя машина, конкуренты — крупнее и ярче.
   Игру режим не меняет: машины, люди, клиенты, физика — как на любой графике.
   ────────────────────────────────────────────────────────────────────────── */

const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');

function detect () {
  if (QS.has('mobile')) return QS.get('mobile') !== '0';
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  try { if (import.meta.env.MODE === 'steam') return false; } catch (e) { /* — */ }
  if (import.meta.env.MODE === 'ios') return true;
  const ua = navigator.userAgent || '', mtp = navigator.maxTouchPoints || 0;
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
  if (/Macintosh/.test(ua) && mtp > 1) return true;                       // iPad «как Мак» (Safari по умолчанию)
  const mm = q => { try { return matchMedia(q).matches; } catch (e) { return false; } };
  if (mm('(pointer: coarse)') && !mm('(any-pointer: fine)')) return true;  // палец, мыши нет
  const sh = Math.min(screen.width || 0, screen.height || 0);
  if (mtp > 0 && sh > 0 && sh < 500) return true;
  return false;
}

export const ON = detect();

/* бюджет памяти: что сколько держит в мобильном режиме (на компьютере — прежние числа в модулях) */
export const MOB = {
  on: ON,
  humans: 12, humansKey: 3,        // запас готовых людей (было 48 / 6 на ключ)
  portraits: 120,                  // кэш портретов-картинок (было 500)
  faceMats: 80,                    // лица-текстуры людей (было 240)
  pinPrograms: false,              // держать программы шейдеров до конца игры без потолка (на компьютере — да)
  programs: 150,                   // 18.10.2026: собранные на ходу всё же держим, пока живых программ не больше (при загрузке ~100):
                                   // иначе материал, который заводится заново, каждый раз собирал программу (рывок в Сафари)
  storyFaces: false,               // портреты реплик историй заранее при загрузке
  hall: false,                     // зал за окнами пиццерий-куполов
  freeCanvas: true,                // атласы: после загрузки в видеокарту холст в странице — 1×1
  groveKeep: 0.4,                  // лесочки дворов (yardmaze.js) — 4 из 10 (17.10.2026: куча JS на телефоне; ~6 800 деревьев
                                   // лесочков держали ~40 МБ вершин в странице, пока их не увидишь; на месте остальных — пусто)
};

/* Чистая картинка на телефоне (11бз, автор 24.10.2026: «на телефоне много деталей, которые в кашу превращаются — выключать
   лишнее, чтобы картинка была проще и понятнее»). Мелочь — реже или нет, главное (дорога, путь, пин, своя машина, клиент,
   конкуренты) — крупнее и ярче. Дальность и туман — как были. Правила словами — docs/CAREER.md «Мобильный режим» →
   «Чистая картинка». ?mobclean=0 — телефон с прежним набором (сравнить); на компьютере ничего не меняется (город — бит в бит). */
export const CLEAN = ON && !/[?&]mobclean=0(&|$)/.test(typeof location !== 'undefined' ? location.search : '') ? {
  // мелочь газона (lawnprops.js): доля, что остаётся (по жребию экземпляра — равномерно); 0 — нет совсем
  lawn: { grass: 0.3, dand: 0.3, lit: 0, bottle: 0, weed: 0.35, tall: 0.6, reed: 0.6, hog: 0.6 },
  binTrash: 0,                     // мусор у баков газона — нет
  rail: 0.5,                       // оградки из гнутых труб вдоль улиц — вдвое реже
  pinHide: 10, pinHideBig: 12,     // у пина и клиента мелочь газона прячется в 10 / 12 м (было 6 / 9)
  leaflets: 1,                     // листовок на тумбе — одна (было 3—6)
  litter: 0.35,                    // мусор у подъездов — у трети прежних (junk.js), у контейнеров — без мешков рядом
  padLitter: 0,
  fillR: 6.5,                      // дворы (yardfill.js): заполняем только пустые куски от Ø 13 м (было Ø 9) — вещей реже
  fillCap: 14,                     // и не больше 14 на клетку (было 40)
  yardLife: 0.4,                   // сцен и гуляющих во дворах — 0,4 от компьютера (было 0,6)
  grit: 0,                         // пятна, зерно и потёки на всём «Ламберте» (grit.js) — нет
  balcKitR: 40,                    // прутья решёток и рёбра профлиста балконов — ближе 40 м (было 95; дальше — каркас с поручнем)
  fencePlain: 1,                   // заборы (fencevar.js): оградки — дуги или рамка, без ржавчины и облупленной краски; твёрдые — без износа; мелочь этапа 2 — простые формы (FV.ITEM PLAIN), без износа
  lawnCalm: 1,                     // газон (lawn.js): проплешин меньше, пятна мягче
  route: { op: 0.92, w: 5.2, night: 0.85, body: '#ff8a3a', chev: '#fff1c8' },   // путь навигатора: плотнее, шире, ярче (было 0,62 / 4,2 м / ночью 0,6)
  pin: 1.35, beam: 0.28,           // пин адреса крупнее, столб света плотнее (было 0,22)
  plate: 1.45,                     // табличка над машиной конкурента крупнее
  outline: 0.035,                  // своя машина — тонкая мягкая обводка кузова, м (mobview.js)
} : null;

/* холст большой неизменной текстуры — после загрузки в видеокарту больше не нужен: в мобильном режиме
   сжимаем его до 1×1 (память страницы; на телефоне холст 2048×2028 — это 16 МБ). Текстуру после этого
   не перерисовывать (needsUpdate) — вернётся пустой. */
export function freeAfterUpload (tex) {
  if (!ON || !MOB.freeCanvas || !tex) return tex;
  const prev = tex.onUpdate;
  tex.onUpdate = t => {
    if (prev) prev(t);
    const c = t.image;
    if (c && typeof c.getContext === 'function' && c.width > 1) { STATS.freed += c.width * c.height * 4; c.width = c.height = 1; }
    t.onUpdate = prev || null;
  };
  return tex;
}

export const STATS = { freed: 0 };
if (typeof document !== 'undefined' && document.body) document.body.classList.toggle('mobile', ON);
else if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => document.body.classList.toggle('mobile', ON));
if (typeof window !== 'undefined') window.__mobile = { MOB, CLEAN, STATS, get on () { return ON; } };
