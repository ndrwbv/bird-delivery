/* ──────────────────────────────────────────────────────────────────────────
   Путь солнца (2г2, второй круг, 25.10.2026; рефы 6, 9, 10 — «низкое тёплое солнце, длинные тени»). Правила словами —
   docs/CAREER.md «Город: как выглядит» → «Настоящие тени от солнца» → «Путь солнца».

   Было (game.js updateEnv): солнце всегда высоко — 47—60° над горизонтом, тени короткие (½ высоты дома).
   Стало: солнце встаёт на северо-востоке около 5:20 (ENV.t ≈ PATH.RISE), к ~14:30 — на юге на PATH.TOP° (35°),
   садится на северо-западе около 23:40 (PATH.SET): днём 30—35°, утром и вечером 8—20° — тени домов вечером 60—100 м.
   Высота — синус по доле светового дня, азимут ходит от +AZ° до −AZ° (от востока через юг к западу; в мире игры +x —
   восток, +z — юг, как у прежнего солнца). Не ниже PATH.MIN° (свет из-под горизонта не бывает): в сумерках солнце
   «лежит» на горизонте, его и так нет (сила по SKY_KEYS). Ночью — как было (лунный свет сверху): направление плавно
   переходит к прежнему по ENV.night.
   Цвет и сила солнца — не здесь (game.js SKY_KEYS, softcity.js, sky.js); здесь — только откуда светит.
   ?oldsun (и ?oldlook) — прежний путь.
   ────────────────────────────────────────────────────────────────────────── */
const Q = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
export const ON = !Q.has('oldsun') && !Q.has('oldlook');

export const PATH = {
  RISE: 0.97,   // ENV.t восхода (0 — 6:00, шаг 1/24 — час): 0,97 ≈ 5:17
  SET: 0.735,   // заката: ≈ 23:38 (SKY_KEYS: вечер 0,70, ночь с 0,77)
  TOP: 35,      // высота в середине дня, °
  MIN: 5,       // не ниже, °
  AZ: 115,      // азимут восхода и заката от юга, ° (к востоку — утром, к западу — вечером)
  DIST: 200,    // солнце — столько м от цели (важно только направление)
  NIGHT0: 0.5,  // ночь (ENV.night) больше этой — направление плавно уходит к прежнему (лунный свет сверху)
};
const D2R = Math.PI / 180;

/* направление на солнце (x, y, z, единичное) в момент t суток при ночи night (0…1) → out */
export function dir (t, night, out) {
  const span = (PATH.SET - PATH.RISE + 1) % 1;
  const u = ((t - PATH.RISE + 1) % 1) / span;          // доля светового дня: 0 — восход, 1 — закат, > 1 — ночь
  const el = Math.max(PATH.MIN, u <= 1 ? PATH.TOP * Math.sin(Math.PI * u) : 0) * D2R;
  const az = (0.5 - Math.min(1, u)) * 2 * PATH.AZ * D2R;   // от юга: + к востоку
  let x = Math.cos(el) * Math.sin(az), y = Math.sin(el), z = Math.cos(el) * Math.cos(az);
  if (night > 0) {
    // прежнее солнце (луна ночью): game.js до 25.10.2026 — (cos(sa)·160, 60 + max(0, sin(sa/2 + 0,3))·140, 90)
    const sa = t * Math.PI * 2;
    let ox = Math.cos(sa) * 160, oy = 60 + Math.max(0, Math.sin(sa * 0.5 + 0.3)) * 140, oz = 90;
    const ol = Math.hypot(ox, oy, oz); ox /= ol; oy /= ol; oz /= ol;
    const n = Math.min(1, Math.max(0, (night - PATH.NIGHT0) / (1 - PATH.NIGHT0))), w = n * n * (3 - 2 * n);   // сумерки — ещё низкое солнце, глубокая ночь — прежнее
    x += (ox - x) * w; y += (oy - y) * w; z += (oz - z) * w;
    const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l;
  }
  out.x = x; out.y = y; out.z = z;
  return out;
}

/* поставить солнце (DirectionalLight) над точкой (cx, cy, cz): true — поставлено, false — путь прежний (?oldsun) */
const T = { x: 0, y: 0, z: 0 };
export function place (sun, t, night, cx, cy, cz) {
  if (!ON) return false;
  dir(t, night, T);
  sun.position.set(cx + T.x * PATH.DIST, cy + T.y * PATH.DIST, cz + T.z * PATH.DIST);
  sun.target.position.set(cx, cy, cz); sun.target.updateMatrixWorld();
  return true;
}
