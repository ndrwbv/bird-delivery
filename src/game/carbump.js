/* Толчки машины от мелких ударов (16.10.2026, автор: «столбы слегка стопят игрока, как и кусты»;
   «сбил человека — немного стопает машину и рандомно может её отклонять в сторону, как когда врезаешься»).

   Сбил человека (и самокатчика, и бургер), снёс столб (фонарь, знак, выбивалку, бельевой столб), снёс куст —
   машина теряет долю скорости и коротко уводится в сторону. Урона машине это не добавляет.

   Сколько скорости теряешь: LOSS + PER / скорость (м/с), но не больше MAX — на малой скорости заметнее:
     человек  — 80 км/ч: −11 %, 40 км/ч: −14 %, 25 км/ч: −18 %;
     столб    — 80 км/ч: −19 %, 40 км/ч: −23 %, 25 км/ч: −28 %;
     куст     — 80 км/ч: −6 %,  40 км/ч: −8 %,  15 км/ч: −12 %.
   Увод: кузов поворачивает на YAW градусов (случайно от и до, влево или вправо — жребий) за долю секунды
   (TAU — постоянная затухания, ~90 % поворота за 0,25 с); скорость поворачивается вслед на FOLLOW доли
   угла, остальное — короткий снос, который гасит сцепление. Для сравнения: авария вскользь о стоящую машину
   под 15—45° меняет курс на 12—34° (обычно ~20°), о стену — больше; поэтому человек — 4—9°, столб — 5—11°
   (в 2—3 раза слабее), куст — до 1,5°. */
export const BUMP = {
  person: { LOSS: 0.08, PER: 0.7, MAX: 0.3, YAW: [4, 9] },
  post: { LOSS: 0.14, PER: 1.0, MAX: 0.3, YAW: [5, 11] },
  bush: { LOSS: 0.05, PER: 0.3, MAX: 0.12, YAW: [0, 1.5] },
};
export const YAW = { TAU: 0.11, FOLLOW: 0.6 };

/* что сбивается в SMASH (game.js smashAdd) и считается столбом / кустом; остальное (заборы, урны, конусы…) —
   по-старому, своим it.slow */
const POST_KINDS = { lamp: 1, sign: 1, beater: 1, line: 1 };
export const kindOf = k => (POST_KINDS[k] ? 'post' : k === 'bush' ? 'bush' : null);

export const STATS = { n: { person: 0, post: 0, bush: 0 }, last: null };

/* удар: V — машина (vx, vz, kickW), kind — 'person' | 'post' | 'bush'. Скорость теряет сразу, увод копится в V.kickW */
export function hit (V, kind) {
  const c = BUMP[kind];
  if (!c) return 1;
  const sp = Math.hypot(V.vx, V.vz);
  if (sp < 0.5) return 1;
  const k = 1 - Math.min(c.MAX, c.LOSS + c.PER / sp);
  V.vx *= k; V.vz *= k;
  const deg = (c.YAW[0] + Math.random() * (c.YAW[1] - c.YAW[0])) * (Math.random() < 0.5 ? -1 : 1);
  if (deg) V.kickW = (V.kickW || 0) + deg * Math.PI / 180 / YAW.TAU;
  STATS.n[kind]++;
  STATS.last = { kind, kmh: Math.round(sp * 3.6), after: Math.round(sp * k * 3.6), deg: +deg.toFixed(1) };
  return k;
}

/* шаг физики: сколько повернуть кузов за dt (рад); скорость (vx, vz) поворачивает сам на FOLLOW */
export function step (V, dt) {
  const w = V.kickW;
  if (!w) return 0;
  const e = Math.exp(-dt / YAW.TAU), dh = w * YAW.TAU * (1 - e);
  V.kickW = Math.abs(w * e) < 0.01 ? 0 : w * e;
  const a = dh * YAW.FOLLOW, c = Math.cos(a), s = Math.sin(a), vx = V.vx;
  V.vx = vx * c + V.vz * s; V.vz = V.vz * c - vx * s;
  return dh;
}
