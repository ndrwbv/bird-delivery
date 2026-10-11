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
     шейдеров не держим до конца игры (warmup.js), окна пиццерий без зала (pizzadome.js), большие
     холсты-атласы (вывески, щиты, стройки, муралы) после загрузки в видеокарту — без копии в странице.
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
  pinPrograms: false,              // держать программы шейдеров до конца игры (на компьютере — да)
  storyFaces: false,               // портреты реплик историй заранее при загрузке
  hall: false,                     // зал за окнами пиццерий-куполов
  freeCanvas: true,                // атласы: после загрузки в видеокарту холст в странице — 1×1
};

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
if (typeof window !== 'undefined') window.__mobile = { MOB, STATS, get on () { return ON; } };
