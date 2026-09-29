/* Экономика карьеры (Стим). Все числа — здесь, чтобы крутить баланс в одном
   месте; расчёт и логика — в docs/CAREER.md. Модули смены, заказов, машин и
   города берут цифры только отсюда.

   Цель: полный город (все машины, обе цели доната) — часов за 15–16 игры,
   первая новая машина — на 2–3-й смене, дальше каждая дороже. Игрок всегда
   чуть-чуть не дотягивает до следующей покупки, но видит, что растёт. */

/* ── смена: 9:00—24:00 на тех же сутках, что и раньше (DAY_LEN = 480 с) ──
   Фазы неба не трогаем, подписываем их часами:
     ENV.t 0.06 → 9:00 (начало дня),  0.66 → 18:00 (вечер),  0.75 → 21:00 (ночь),
     ночь 0.75…0.96 — это 21:00…5:00, значит 24:00 → 0.75 + 3/8 · 0.21 = 0.82875.
   Смена — ENV.t от 0.06 до 0.82875: 0.76875 суток × 480 с ≈ 369 с — это ~3 заказа,
   мало: заказ «в конец города» (7,4 км) один идёт ~11 минут. Поэтому во время смены
   сутки идут в SLOW раз медленнее: 369 × 2,5 ≈ 922 с ≈ 15 мин, ~8 заказов. */
export const SHIFT = {
  T0: 0.06, T_END: 0.82875, SLOW: 2.5,
  KEYS: [[0.06, 9], [0.66, 18], [0.75, 21], [0.96, 29]],   // ENV.t → час (29 = 5:00 следующего дня)
  LUNCH_H: 14,                 // обед — в 14:00, один раз
  EVENING_H: 18,               // «вечер» для бандитских районов
};
/* ENV.t → часы (9…24), и обратно */
export function hourOf (t) {
  const K = SHIFT.KEYS;
  if (t < K[0][0]) t += 1;
  for (let i = 1; i < K.length; i++) if (t <= K[i][0]) {
    const [t0, h0] = K[i - 1], [t1, h1] = K[i];
    return h0 + (t - t0) / (t1 - t0) * (h1 - h0);
  }
  return K[K.length - 1][1];
}
export function tOfHour (h) {
  const K = SHIFT.KEYS;
  for (let i = 1; i < K.length; i++) if (h <= K[i][1]) {
    const [t0, h0] = K[i - 1], [t1, h1] = K[i];
    return (t0 + (h - h0) / (h1 - h0) * (t1 - t0)) % 1;
  }
  return K[K.length - 1][0];
}
export const clock = h => { const m = Math.floor(((h % 24) + 24) % 24 * 60); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };

/* ── оплата заказа ──
   база + за метр маршрута, × район, × срочность; рост с уровнем курьера.
   1 км по городу ≈ 80 + 140 = 220 ₽. Опоздал — 45 % (как раньше). */
export const PAY = {
  BASE: 80, PER_M: 0.14,
  ZONE: { rich: 1.25, normal: 1, poor: 0.85, garage: 0.95, ind: 1, gang: 1.3 },
  URGENT: 1.8,                 // срочный: мало времени, далеко (≥ 1,8 км)
  URGENT_MIN_M: 1800, URGENT_TIME: 0.62,     // времени — 62 % от обычного
  EDGE: 1.4,                   // «в конец города»
  LATE: 0.45,
  LEVEL_STEP: 0.03, LEVEL_MAX: 0.6,          // +3 % за уровень курьера, до +60 %
  SPEED_BONUS: [0, 0.15, 0.3],               // «шустро» / «а ты харош» — доля от оплаты
};
export function orderPay (meters, zone, { urgent = false, edge = false, level = 0 } = {}) {
  let p = (PAY.BASE + PAY.PER_M * meters) * (PAY.ZONE[zone] || 1);
  if (urgent) p *= PAY.URGENT;
  if (edge) p *= PAY.EDGE;
  p *= 1 + Math.min(PAY.LEVEL_MAX, level * PAY.LEVEL_STEP);
  return Math.round(p / 10) * 10;
}

/* ── чаевые: шанс и сколько (доля от оплаты) ── */
export const TIPS = {
  CHANCE: 0.25, AMOUNT: [0.1, 0.4],
  ZONE_CHANCE: { rich: 0.35, poor: -0.1, gang: -0.05 },
  RICH_AMOUNT: [0.3, 1.0],
  LUNCH_CHANCE: 0.2, LUNCH_MUL: 1.3,         // обед «бизнес-ланч»
  CLEAN_CHANCE: 0.1,                          // город вычищен от мусора — люди добрее
};
export function tipFor (fee, zone, { lunch = false, clean = 0, rnd = Math.random } = {}) {
  let ch = TIPS.CHANCE + (TIPS.ZONE_CHANCE[zone] || 0) + (lunch ? TIPS.LUNCH_CHANCE : 0) + TIPS.CLEAN_CHANCE * clean;
  if (rnd() > ch) return 0;
  const [a, b] = zone === 'rich' ? TIPS.RICH_AMOUNT : TIPS.AMOUNT;
  return Math.round(fee * (a + rnd() * (b - a)) * (lunch ? TIPS.LUNCH_MUL : 1) / 10) * 10;
}

/* ── смена: что обязательно попадает в заказы ── */
export const ORDERS = {
  QUEUE_SHOW: 2,               // видно следующие два заказа
  ZONES_MIN: 3,                // за смену — хотя бы три разных района
  EDGE_MIN: 1, URGENT_MIN: 1,  // хотя бы один «в конец города» и один срочный
  SIDE_EVERY: [3, 5],          // доп. заказ (фиолетовый) — раз в 3–5 заказов
  SIDE_PAY: [150, 400],
  STAFF_CHANCE: 0.2,           // в конце смены — развезти работников пиццерии
  STAFF_PAY: 200, STAFF_STARS: [1, 3],       // за каждого — ₽, за всех — звёзды
  STORY_EVERY: 4,              // сюжетный заказ — не чаще раза в 4 смены
  STORY_STARS: [2, 5],
  COLORS: { pizza: '#ff8a2b', side: '#a15bff', staff: '#ffd23f', story: '#ff3ea5', urgent: '#ff2d4a' },
};

/* ── обед: одно из трёх до конца смены ── */
export const LUNCH = {
  nitro: { tank: 1.5 },        // бак нитро ×1,5 и полный
  tips: {},                    // TIPS.LUNCH_*
  hp: { hearts: 1 },
};

/* ── сбил своего клиента: смена продолжается, но половина заработанного за неё
   отнимается (LOSE: 1 — всё). Со смены не снимают. ── */
export const CLIENT_KILL = { LOSE: 0.5, END_SHIFT: false };

/* ── бандитские районы: вечером, с доставкой туда ── */
export const GANG = {
  CHANCE: 0.6,                 // 6 из 10 — подойдут
  BRIBE_BASE: 300, BRIBE_SHARE: 0.1,         // мзда: 300 ₽ + 10 % заработанного за смену
  SMASH_HEARTS: 2, SMASH_BREAK: 0.4,         // не заплатил: −2 сердца, 40 % — машина хуже заводится
  ZONE_R: 300,                 // радиус района, м (сжимается донатом)
};

/* ── донаты: цели города ── */
export const DONATE = {
  trash: { goal: 60000, step: 500 },         // вычистить кучи мусора
  gang: { goal: 80000, step: 500 },          // выдавить бандитов: районы сжимаются, шанс падает вдвое
};

/* ── слот-машина (только взрослая версия): ставка — любая сумма из кошелька,
   шагом STEP ₽; раз за смену ── */
export const SLOT = { WIN: 0.1, MUL: 2, STEP: 10 };

/* ── поломки ──
   Ломучесть L: 0…10. За заказ машина глохнет с шансом L/10 (у «Семёрки» L = 3 —
   каждый третий заказ). Удар — 40 %, что L +1 (до 9). Яма — отдельная проверка
   L/10 × 0,25. Дядя Женя: L −1 за 300 + 100·L ₽. */
export const BREAK = {
  PER_ORDER: 0.1,              // × L
  HIT_WORSE: 0.4, MAX_L: 9,
  POTHOLE: 0.025,              // × L
  REPAIR_BASE: 300, REPAIR_PER_L: 100,
  MINIGAME_HITS: 3,            // сколько раз попасть по зелёному
  MINIGAME_ZONE: L => Math.max(0.1, 0.26 - L * 0.015),   // ширина зелёного, доля полосы
};

/* ── звёзды пиццерии (вторая валюта) ── */
export const STARS = { CLEAN_SHIFT: 1 };      // смена без единого удара — +1

/* ── машины: 10 штук. hp — сердца, L — ломучесть, vmax/acc — как в CARS игры ──
   Скорость у всех подняли на 20 % (30.09.2026): было 44…58 м/с, стало 53…70.
   Цены растут примерно в 1,5 раза: 5 → 11 → 19 → 30 → 45 → 65 → 90 → 125 → 180 тыс.
   Сумма ≈ 570 тыс. ₽ + 17 ★. При доходе 3–6 тыс. за смену — это ~120 смен.
   Прокачка на каждую машину: броня (+1 сердце) и мотор (+4 % скорости), по три
   ступени, ступень — 15 % цены машины (у бесплатной «Семёрки» — от 800 ₽). */
export const CAR_LIST = [
  { id: 'semerka', price: 0,      stars: 0,  hp: 4,  L: 3,   vmax: 53, acc: 41 },
  { id: 'matiz',   price: 5000,   stars: 0,  hp: 3,  L: 2,   vmax: 56, acc: 48 },
  { id: 'kopeyka', price: 11000,  stars: 0,  hp: 5,  L: 4,   vmax: 54, acc: 42 },
  { id: 'priora',  price: 19000,  stars: 0,  hp: 5,  L: 2,   vmax: 60, acc: 47 },
  { id: 'buhanka', price: 30000,  stars: 0,  hp: 8,  L: 5,   vmax: 50, acc: 37 },
  { id: 'niva',    price: 45000,  stars: 0,  hp: 6,  L: 3,   vmax: 58, acc: 46, offroad: true },
  { id: 'volga',   price: 65000,  stars: 0,  hp: 7,  L: 2,   vmax: 62, acc: 46 },
  { id: 'cruze',   price: 90000,  stars: 0,  hp: 6,  L: 1,   vmax: 67, acc: 52 },
  { id: 'vesta',   price: 125000, stars: 5,  hp: 7,  L: 1,   vmax: 70, acc: 54 },
  { id: 'patriot', price: 180000, stars: 12, hp: 10, L: 0.3, vmax: 68, acc: 50, offroad: true },
];
export const UPGRADE = { STEPS: 3, SHARE: 0.15, MIN: 800, HP: 1, VMAX: 0.04 };
export const upgradePrice = (car, step) => Math.max(UPGRADE.MIN, Math.round(car.price * UPGRADE.SHARE / 100) * 100) * (step + 1);
