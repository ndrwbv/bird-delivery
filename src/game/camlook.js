/* ──────────────────────────────────────────────────────────────────────────
   Осмотреться в езде (12ак, автор 18.10 и 21.10.2026: «чтобы вертеть головой можно было в машине»).
   Правила словами — docs/CAREER.md «Камера: три вида» → «Осмотреться».

   Из-за руля — поворачивает голову курьера (camview.js cab), сзади — крутит камеру вокруг машины
   (camview.js near, game.js camStep). Руль, газ и машина — как ехали: это только взгляд.

     мышь       — зажать ПРАВУЮ кнопку на картинке и вести (левая кнопка — руль-джойстик мышью, как была);
     геймпад    — правый стик (был свободен; в меню он листает длинные листы — padmenu.js, это не тронуто):
                  куда отклонил, туда и смотришь — вбок до 110°, вниз (на себя) — назад через плечо, вверх — чуть вверх;
     телефон    — провести пальцем по свободной части экрана (не по рулю и не по кнопкам и не ближе 40 px от них —
                  touchwheel.js nearPad; палец у руля — это руль).
   Отпустил (кнопку, палец, стик в центре) — взгляд плавно возвращается вперёд ровно за LOOK.BACK с.

     LK.init({ canvas, pad, can(), padCan() })   — game.js; can — можно смотреть (езда, не пауза, не карта, не разговор)
     LK.step(dt, kind)  — раз в кадр из camStep: kind 'cab' (голова, вправо до 160°, влево до 125°) / 'orbit' (камера, до 180°)
     LK.yaw / LK.pitch  — поворот взгляда, рад: yaw > 0 — влево, pitch > 0 — вверх
     LK.reset()         — сразу вперёд (смерть, катсцена, смена вида — не обязательно: отпущенное само вернётся)
   ────────────────────────────────────────────────────────────────────────── */

import { nearPad } from './touchwheel.js';   // руль и педали на телефоне: палец у них — не «осмотреться»

const D2R = Math.PI / 180;
export const LOOK = {
  SIDE: 110 * D2R,          // стик вбок до упора — голова на 110°: видно боковое окно и чуть назад
  CAB_R: 160 * D2R,         // из-за руля вправо (через правое плечо, между сиденьями) — до 160°: заднее стекло
  CAB_L: 125 * D2R,         // влево — до 125°: за плечом своё сиденье и стойка
  ORBIT: 180 * D2R,         // сзади — камера обходит машину целиком, до вида спереди
  UP: 0.28, DOWN: 0.22,     // вверх / вниз, рад
  BACK: 0.5,                // отпустил — вперёд за 0,5 с (плавно: медленно-быстро-медленно)
  MOUSE: 0.0055,            // рад на точку экрана мышью
  TOUCH: 0.0085,            // рад на точку экрана пальцем
  PAD_K: 12,                // стик: как быстро взгляд догоняет отклонение
  PAD_FULL: 0.8,            // стик отклонён на 80 % — уже полный поворот
  NECK: 0.09,               // глаза — на 9 см впереди шеи: голова поворачивается вокруг шеи, а не вокруг глаз
  LEAN: 0.24,               // оглядываясь через правое плечо, курьер подаётся к середине салона, м
  SIDE_DN: 0.1,             // из-за руля, глядя вбок и назад, — взгляд на 0,1 рад ниже: в кадре край двери и полка
};

export const LK = {
  yaw: 0, pitch: 0,
  src: '',                  // кто крутит сейчас: 'mouse' / 'touch' / 'pad' / '' — никто
  relT: -1, y0: 0, p0: 0,   // возврат: сколько прошло с отпускания, откуда возвращаемся
  max: LOOK.ORBIT, maxR: LOOK.ORBIT,
  touchId: null, tx: 0, ty: 0, mouse: false, mx: null, my: null,
};
let A = null;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const ease = k => k * k * k * (k * (k * 6 - 15) + 10);   // плавно с места и плавно в ноль

function grab (src) { LK.src = src; LK.relT = -1; }
function release (src) {
  if (src && LK.src !== src) return;
  LK.src = '';
  LK.relT = 0; LK.y0 = LK.yaw; LK.p0 = LK.pitch;
}
function drag (dx, dy, k) {
  LK.yaw = clamp(LK.yaw - dx * k, -LK.maxR, LK.max);
  LK.pitch = clamp(LK.pitch - dy * k, -LOOK.DOWN, LOOK.UP);
}

export function init (api) {
  A = api;
  const cv = A.canvas;
  if (!cv || typeof addEventListener !== 'function') return;
  // мышь: правая кнопка на картинке. mousedown приходит на каждую кнопку (pointerdown — только на первую из зажатых)
  cv.addEventListener('mousedown', e => {
    if (e.button !== 2 || !A.can()) return;
    e.preventDefault();
    LK.mouse = true; LK.mx = e.clientX; LK.my = e.clientY;
    grab('mouse');
  });
  addEventListener('mousemove', e => {
    if (!LK.mouse) return;
    if (!(e.buttons & 2)) { LK.mouse = false; release('mouse'); return; }   // отпустили за окном
    const dx = e.clientX - LK.mx, dy = e.clientY - LK.my;
    LK.mx = e.clientX; LK.my = e.clientY;
    if (LK.src !== 'mouse') grab('mouse');
    drag(dx, dy, LOOK.MOUSE);
  });
  addEventListener('mouseup', e => { if (e.button === 2 && LK.mouse) { LK.mouse = false; release('mouse'); } });
  // меню по правой кнопке на картинке не нужно; и общий сброс ввода на contextmenu (game.js) — тоже: меню не открылось
  cv.addEventListener('contextmenu', e => { if (A.can()) { e.preventDefault(); e.stopPropagation(); } });
  // палец по свободной части экрана (на картинке, не на руле и не на кнопках)
  cv.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || LK.touchId !== null || (A.touch && !A.touch()) || !A.can()) return;
    // у руля и педалей (40 px от края) — это промах мимо руля, а не взгляд (0п44, 24.10.2026): палец у руля game.js отдаёт рулю
    if (nearPad(e.clientX, e.clientY)) return;
    LK.touchId = e.pointerId; LK.tx = e.clientX; LK.ty = e.clientY;
    try { cv.setPointerCapture(e.pointerId); } catch (_) { /* — */ }
    grab('touch');
  });
  cv.addEventListener('pointermove', e => {
    if (e.pointerId !== LK.touchId) return;
    const dx = e.clientX - LK.tx, dy = e.clientY - LK.ty;
    LK.tx = e.clientX; LK.ty = e.clientY;
    drag(dx, dy, LOOK.TOUCH);
  });
  const up = e => { if (e.pointerId === LK.touchId) { LK.touchId = null; release('touch'); } };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) cv.addEventListener(ev, up);
  addEventListener('blur', () => { LK.mouse = false; LK.touchId = null; if (LK.src) release(); });
}

/** стик → куда смотреть: вверх — вперёд (и чуть вверх), вбок — до SIDE, вниз — назад через плечо */
function stick (rx, ry, maxL, maxR) {
  const m = Math.min(1, Math.hypot(rx, ry));
  const w = Math.min(1, m / LOOK.PAD_FULL);
  const a = Math.atan2(rx, -ry);                 // 0 — вперёд, +90° — вправо, ±180° — назад (ровно вниз — через правое плечо)
  const s = Math.abs(a), sg = a > 0 ? -1 : 1;    // yaw > 0 — влево
  const lim = sg > 0 ? maxL : maxR;
  const yaw = s <= Math.PI / 2 ? s / (Math.PI / 2) * LOOK.SIDE : LOOK.SIDE + (s - Math.PI / 2) / (Math.PI / 2) * (lim - LOOK.SIDE);
  return { yaw: sg * Math.min(yaw, lim) * w, pitch: ry < 0 && s < Math.PI / 2 ? -ry * LOOK.UP * Math.cos(a) : 0 };
}

export function step (dt, kind) {
  LK.max = kind === 'cab' ? LOOK.CAB_L : LOOK.ORBIT;
  LK.maxR = kind === 'cab' ? LOOK.CAB_R : LOOK.ORBIT;
  const can = A && A.can();
  if (!can) {                                     // пауза, карта, разговор: отпустить всё, взгляд — домой
    if (LK.mouse) LK.mouse = false;
    if (LK.touchId !== null) LK.touchId = null;
    if (LK.src) release();
  }
  // геймпад: правый стик
  const p = A && A.pad;
  const pr = can && p && p.connected && (!A.padCan || A.padCan()) ? Math.hypot(p.rx || 0, p.ry || 0) : 0;
  if (pr > 0.01 && LK.src !== 'mouse' && LK.src !== 'touch') {
    if (LK.src !== 'pad') grab('pad');
    const s = stick(p.rx, p.ry, LK.max, LK.maxR);
    const k = 1 - Math.exp(-LOOK.PAD_K * dt);
    LK.yaw += (s.yaw - LK.yaw) * k;
    LK.pitch += (s.pitch - LK.pitch) * k;
  } else if (LK.src === 'pad') release('pad');
  LK.yaw = clamp(LK.yaw, -LK.maxR, LK.max);
  // отпустил — домой ровно за BACK с
  if (!LK.src && LK.relT >= 0) {
    LK.relT += dt;
    const e = ease(Math.min(1, LK.relT / LOOK.BACK));
    LK.yaw = LK.y0 * (1 - e); LK.pitch = LK.p0 * (1 - e);
    if (LK.relT >= LOOK.BACK) { LK.yaw = LK.pitch = 0; LK.relT = -1; }
  }
}

export function reset () { LK.yaw = LK.pitch = 0; LK.relT = -1; LK.src = ''; LK.mouse = false; LK.touchId = null; }
export const active = () => !!LK.src || LK.relT >= 0 || LK.yaw !== 0 || LK.pitch !== 0;

export const DEBUG = {
  LOOK, LK,
  get yawDeg () { return +(LK.yaw / D2R).toFixed(1); },
  /** для probe: «держать» взгляд руками (как мышью) и отпустить */
  hold (yawDeg, pitch = 0) { grab('mouse'); LK.yaw = clamp(yawDeg * D2R, -LK.maxR, LK.max); LK.pitch = clamp(pitch, -LOOK.DOWN, LOOK.UP); },
  release () { release(); },
};
