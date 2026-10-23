/* ──────────────────────────────────────────────────────────────────────────
   Облегчение тяжёлого кадра — вместо «мыла» (автор 18.10.2026: «FPS улучшаешь — и на Деке смотри;
   может, не блюр делать, а что-то другое»). Правила словами — docs/CAREER.md «Настройки графики» →
   «Тяжёлое место»; замеры — docs/AGENTS.md «Дека: хвост по местам».

   Картинка остаётся резкой: когда кадр не успевает, ненадолго и плавно убираем то, что дорого и
   далеко, а потом так же плавно возвращаем. Одно число k: 0 — полный вид, 1 — самый лёгкий.
     дальность (туман и край кадра)     ×1 → ×FAR   (туман подползает — дальние дома и деревья
                                                      уходят в дымку, а не исчезают)
     люди видны до                       ×1 → ×PEOPLE (на краю человек и так сжимается в точку —
     машины (поток, стоящие) видны до    ×1 → ×CARS    game.js farShrink: граница едет — сжимаются плавно)
     подробный человек ближе             ×1 → ×LOD
     комнаты за окнами видны ближе       ×1 → ×ROOMS  (комната к краю и так плавно уходит в ровное окно)
     мелочь газона (трава, одуванчики)   ×1 → ×SMALL  (у края мелочь и так растёт из земли)
     машины и люди вдали считаются       раз в N кадров → раз в N + 1 (с k ≥ 0,5; дальше 110 м — не видно)

   Когда «тяжело» (смотрим последние WIN кадров, тяжёлых ≥ NEED):
     - код игры с отрисовкой дольше HI бюджета кадра (1/60 с; при ограничении 30 / 40 к/с — 1/30, 1/40);
     - видеокарта рисовала дольше HI бюджета (таймер видеокарты — dynres.js, есть в Хроме / Электроне,
       и на Деке; ответ через 2—4 кадра);
     - таймера нет: промежуток между кадрами дольше GAP бюджета, а код занял меньше его половины
       (ждали видеокарту, а не нас).
   Тяжело — k растёт: от нуля до единицы за RISE с. Спокойно (в окне не больше одного тяжёлого кадра и в
   среднем кадр короче CALM_FIT бюджета) CALM с — k плавно назад за FALL с; два тяжёлых из восьми — держим. Вернули, а через
   PUMP_T с снова тяжело — следующая пауза перед возвратом вдвое дольше (до CALM_MAX с), 30 с
   без тяжёлого — снова CALM: качели «туман туда-сюда» не идут.
   Одиночный долгий кадр (рождение, сборщик мусора) — не повод: нужно NEED из WIN.

   Только в смене (не в меню, не в паузе, не в повторе); первые WARM с смены и после паузы не
   смотрим. Вне смены k плавно уходит к нулю. Медленная страховка дальности (cull.js govern: 2 с
   долгих кадров — ступень 0,85 / 0,72) осталась под ней: на сильной долгой нагрузке включается и она.
   «Мыло» (dynres.js) — отдельно, по умолчанию вкл (автор 18.10.2026: «по дефолту ставить блюр вместо рывка»).

   Отладка: __dlv.TUNE — ST (k, тяжёлых в окне, источник, доли), T — числа, pin = 0…1 — держать k,
   off — выключить; ?notune — выкл на этот запуск. game.js зовёт step() после отрисовки.
   ────────────────────────────────────────────────────────────────────────── */

export const T = {
  HI: 0.9,           // доля бюджета: кадр «тяжёлый» (код или видеокарта): 15 мс при 60 к/с
  GAP: 1.4,          // без таймера видеокарты: промежуток длиннее 1,4 бюджета при коде < половины промежутка
  WIN: 8, NEED: 3,   // из последних 8 кадров тяжёлых не меньше 3 — давит
  RISE: 1.5,         // с: от полного вида до самого лёгкого
  FALL: 6,           // с: обратно
  CALM: 1.5, CALM_MAX: 24, PUMP_T: 8, RESET_T: 30,   // с: спокойно до возврата; качели — вдвое дольше; сброс
  CALM_FIT: 0.8,     // спокойный кадр — короче 0,8 бюджета (в среднем)
  WARM: 2,           // с после начала смены / паузы не смотрим
  GPU_OLD: 0.25,     // с: замер видеокарты старше — не в счёт
  FAR: 0.8, PEOPLE: 0.7, CARS: 0.72, LOD: 0.7, SMALL: 0.7, ROOMS: 0.6,
};
const OFF_Q = typeof location !== 'undefined' && /[?&]notune(&|$)/.test(location.search);

let k = 0, win = 0, ema = 0.5, calm = 0, calmNeed = T.CALM, warm = T.WARM, clock = 0, upAt = -1e9, lastHeavy = -1e9, gpuAt = -1e9, gpuMs = -1;
export const ST = { k: 0, heavy: 0, src: '', frames: 0, tuned: 0, lightest: 0, rises: 0, falls: 0, by: { js: 0, gpu: 0, gap: 0 }, calm: T.CALM, gpu: -1 };
export const DEBUG = { pin: null, off: OFF_Q };

/* множители для потребителей (gfx.js viewR / detail, cull.js, game.js туман) — читаются каждый кадр */
export const M = { far: 1, people: 1, cars: 1, lod: 1, small: 1, win: 1, extraLag: 0 };
function apply () {
  M.far = 1 - (1 - T.FAR) * k;
  M.people = 1 - (1 - T.PEOPLE) * k;
  M.cars = 1 - (1 - T.CARS) * k;
  M.lod = 1 - (1 - T.LOD) * k;
  M.small = 1 - (1 - T.SMALL) * k;
  M.win = 1 - (1 - T.ROOMS) * k;
  M.extraLag = k >= 0.5 ? 1 : 0;
  ST.k = +k.toFixed(3);
}
export const level = () => k;

/* свежий замер видеокарты (мс) — dynres.js, когда пришёл ответ таймера */
export function gpu (ms) { gpuMs = ms; gpuAt = clock; ST.gpu = +ms.toFixed(2); }

/* после отрисовки кадра: raw — промежуток с прошлого кадра (с), work — код игры с отрисовкой (мс),
   active — идёт смена (не меню, не пауза), B — бюджет кадра (мс), timer — есть таймер видеокарты */
export function step (raw, work, active, B, timer) {
  if (DEBUG.pin !== null) { k = Math.max(0, Math.min(1, +DEBUG.pin || 0)); apply(); return; }
  if (DEBUG.off) { if (k) { k = 0; apply(); } return; }
  if (!active || !(raw > 0) || raw > 0.25) {
    warm = Math.max(warm, active ? 0.5 : T.WARM);
    if (!active && k > 0 && raw > 0 && raw < 0.25) { k = Math.max(0, k - raw / T.FALL); apply(); }
    return;
  }
  clock += raw;
  if (warm > 0) { warm -= raw; win = 0; return; }
  ST.frames++;
  const gap = raw * 1000;
  const gpuFresh = timer && clock - gpuAt < T.GPU_OLD && gpuMs >= 0;
  let src = '';
  if (work > T.HI * B) src = 'js';
  else if (gpuFresh && gpuMs > T.HI * B) src = 'gpu';
  else if (!timer && gap > T.GAP * B && work < gap * 0.5) src = 'gap';
  if (gpuFresh) gpuMs = -1;                        // каждый замер считаем один раз
  win = ((win << 1) | (src ? 1 : 0)) & ((1 << T.WIN) - 1);
  let n = 0; for (let w = win; w; w &= w - 1) n++;
  ST.heavy = n;
  const load = Math.max(work, timer && clock - gpuAt < 1 ? ST.gpu : 0) / B;   // средняя нагрузка: код или видеокарта — что дольше
  ema += (load - ema) * 0.05;
  if (src) { ST.by[src]++; ST.src = src; }
  if (n >= T.NEED) {
    if (k < 1) {
      if (k === 0) { ST.rises++; if (clock - upAt < T.PUMP_T) calmNeed = Math.min(T.CALM_MAX, calmNeed * 2); }
      k = Math.min(1, k + raw / T.RISE); apply();
    }
    calm = 0; lastHeavy = clock;
  } else if (n <= 1 && ema < T.CALM_FIT) {          // редкий одиночный долгий кадр возврату не мешает
    calm += raw;
    if (clock - lastHeavy > T.RESET_T) calmNeed = T.CALM;
    if (k > 0 && calm >= calmNeed) {
      if (calm - raw < calmNeed) { upAt = clock; ST.falls++; }
      k = Math.max(0, k - raw / T.FALL); apply();
    }
  }                                                  // два тяжёлых из восьми — держим как есть
  ST.calm = calmNeed;
  if (k > 0.02) ST.tuned++;
  if (k > 0.98) ST.lightest++;
}

Object.defineProperty(DEBUG, 'k', { get () { return k; }, enumerable: true });   // геттер, а не значение на момент Object.assign
Object.assign(DEBUG, {
  ST, T, M,
  /* доля кадров с облегчением, сколько раз включалось и откатывалось */
  summary () { return { k: +k.toFixed(2), frames: ST.frames, tunedShare: ST.frames ? +(ST.tuned / ST.frames).toFixed(3) : 0, lightestShare: ST.frames ? +(ST.lightest / ST.frames).toFixed(3) : 0, rises: ST.rises, falls: ST.falls, by: { ...ST.by }, calm: ST.calm }; },
  reset () { k = 0; win = 0; calm = 0; calmNeed = T.CALM; ST.frames = ST.tuned = ST.lightest = ST.rises = ST.falls = 0; ST.by = { js: 0, gpu: 0, gap: 0 }; apply(); },
});
