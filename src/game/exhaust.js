/* ──────────────────────────────────────────────────────────────────────────
   Дым из выхлопной трубы по мотору (09.10.2026, группа М1 docs/IDEAS.md).
   Правила словами — docs/CAREER.md «Мотор и ресурс» → «Дым из выхлопа».

   Своя машина: по выхлопу видно, что мотор сдаёт и пора к Дяде Жене, без
   цифр. Дым из-под капота — это сердца (game.js), он остаётся как был.
     мотор EXH.OK % и выше — лёгкий прозрачный дымок; зимой (снег лежит) —
                             белый пар, его больше;
     EXH.MID…EXH.OK %      — серый дым;
     EXH.LOW…EXH.MID %     — густой серый, а на газу — хлопки (звук «пах»,
                             вспышка) и чёрные клубы;
     ниже EXH.LOW %        — чёрный шлейф за машиной, на газу тоже хлопки.
   Бист-мод (рога-бонус) — оранжевый дым, цвет бонуса, пока действует (автор 10.10.2026).
   На ходу дым рассеивается (FADE): к 60 км/ч клуб живёт втрое меньше, вдвое прозрачнее, шире и бледнее —
   на месте и медленно дым заметен, на скорости — лёгкий шлейф; хлопки и чихи — как были.
   Перед тем как заглохнуть на заказе (cars.js stallIn — меньше EXH.SNEEZE с
   езды до поломки) — «чихи»: мотор кашляет чёрным клубом с хлопком раз в
   ~0,7 с. Заглохла — дыма из трубы нет (из-под капота — свой, cars.js).
   Без карьеры (детская) мотора нет — всегда лёгкий дымок.

   Поток: у старых седанов и хэтчбеков (не китайцы, не джипы) иногда (раз в несколько секунд одна из ближних,
   с шансом EXH.OLD_P) — пара секунд чёрного выхлопа. Дёшево: один проход по
   потоку раз в EXH.OLD_EVERY с, без своих мешей.

   Частицы — второй, прозрачный пул pixfx.js (одна отрисовка на весь дым).
   Переменных игры модуль не видит: всё — через api (exhApi в game.js).
   ────────────────────────────────────────────────────────────────────────── */
import * as PIX from './pixfx.js';

/* OK / MID / LOW — пороги мотора, %; SNEEZE — с до поломки, когда начинает чихать;
   POP — хлопков в секунду на газу (густой и чёрный дым); OLD_* — поток */
export const EXH = { OK: 70, MID: 50, LOW: 30, SNEEZE: 3.5, POP: 0.7, OLD_EVERY: 2.5, OLD_P: 0.3, OLD_R: 60, OLD_T: 2.2 };
export const STATS = { grade: '', puffs: 0, pops: 0, sneezes: 0, old: 0, lift: 0, fade: 0 };

/* вид дыма по ступени: every — с между клубками, gap — на ходу не реже, чем через столько метров (шлейф без дыр), s — размер (м, круглый мягкий клуб pixfx.js), grow — м/с,
   life, cols, a — прозрачность клуба, n — клубков за раз. Клубы мелкие: шлейф — цепочка, машину не закрывает */
const LOOK = {
  ok:    { every: 0.13, gap: 0.6, s: [0.1, 0.15], grow: 0.4, life: [0.5, 0.8], cols: [0xe9e7e3, 0xdcd9d4], a: 0.3, n: 1 },
  steam: { every: 0.06, gap: 0.4, s: [0.14, 0.2], grow: 0.75, life: [0.9, 1.4], cols: [0xf6f8fa, 0xe8edf2], a: 0.38, n: 1 },
  mid:   { every: 0.07, gap: 0.4, s: [0.14, 0.2], grow: 0.55, life: [0.8, 1.15], cols: [0xa8a6a2, 0x8f8d8a], a: 0.42, n: 1 },
  low:   { every: 0.05, gap: 0.28, s: [0.16, 0.22], grow: 0.7, life: [0.9, 1.3], cols: [0x77746f, 0x5f5c59], a: 0.5, n: 1 },
  // бист-мод (бонус-рога, game.js FXS.beastT): из трубы — оранжевый дым, цвет бонуса (автор 10.10.2026)
  beast: { every: 0.03, gap: 0.2, s: [0.16, 0.24], grow: 0.8, life: [0.7, 1.1], cols: [0xff8a1c, 0xffa443, 0xff6a10], a: 0.55, n: 1 },
  dead:  { every: 0.035, gap: 0.2, s: [0.17, 0.24], grow: 0.85, life: [1.0, 1.5], cols: [0x2b282a, 0x3b3739, 0x232123], a: 0.5, n: 1 },
};
const BLACK = [0x231f21, 0x2e2a2c, 0x3a3537];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
/* ночью светлый дым не светится: цвет темнее (частицы без света) */
function dim (hex) {
  const k = 1 - 0.55 * (A.night() || 0);
  if (k > 0.98) return hex;
  return (((hex >> 16) & 255) * k) << 16 | (((hex >> 8) & 255) * k) << 8 | ((hex & 255) * k);
}

let A = null;

const ST = { c: 100, dual: false, readT: 0, acc: 0, popT: 0, sneezeT: 0, side: 1, oldT: 1, old: null, oldLeft: 0 };

/* мотор — раз в полсекунды из cars.js (там сохранение) */
function readEngine () {
  if (!A.career) { ST.c = 100; return; }
  try {
    ST.c = A.auto.engine().c;
    const cur = A.auto.current();
    ST.dual = !!(cur && cur.up && cur.up.engine >= 2);
  } catch (e) { ST.c = 100; }
}
export const grade = c => (c >= EXH.OK ? 'ok' : c >= EXH.MID ? 'mid' : c >= EXH.LOW ? 'low' : 'dead');

/* труба своей машины в мире: x, y, z и куда «назад» (bx, bz). Где труба — car.userData.pipe (carrear.js рисует её
   там же): одна — сзади справа (−X, как у настоящей «семёрки»), там же пламя нитро; двойная — по краям */
const PIPE = { x: 0, y: 0, z: 0, bx: 0, bz: 0 };
function pipe (car, h, hl, side) {
  const fx = Math.sin(h), fz = Math.cos(h), lx = fz, lz = -fx;
  const pp = car.userData && car.userData.pipe;
  const dual = pp ? pp.dual : ST.dual;
  const off = dual ? (pp ? pp.x : 0.25) * side : pp ? pp.x : -0.42;
  const back = pp ? pp.z : -(hl + 0.12);
  PIPE.x = car.position.x + fx * back + lx * off;
  PIPE.z = car.position.z + fz * back + lz * off;
  PIPE.y = car.position.y + (pp ? pp.y : 0.36);
  PIPE.bx = -fx; PIPE.bz = -fz;
  return PIPE;
}

/* на ходу дым рассеивается (автор 10.10.2026: «заметен только, когда едет медленно или стоит» — так и надо):
   до FADE.V0 м/с — как есть, к FADE.V1 (60 км/ч) и быстрее — клуб живёт ×LIFE, прозрачность ×A, шире ×S, растёт быстрее ×GROW
   и бледнее (цвет на PALE к светло-серому). Хлопки и чихи (pop) — не трогаем, они заметны всегда */
export const FADE = { V0: 2, V1: 16.7, LIFE: 0.35, A: 0.5, S: 1.4, GROW: 1.6, PALE: 0.35, TO: 0xe6e4e0 };
/** насколько рассеян дым на скорости v (м/с): 0 — стоит или ползёт, 1 — 60 км/ч и быстрее (плавно) */
export function fadeAt (v) {
  const x = Math.min(1, Math.max(0, (Math.abs(v) - FADE.V0) / (FADE.V1 - FADE.V0)));
  return x * x * (3 - 2 * x);
}
const mix = (a, b, k) => ((((a >> 16) & 255) * (1 - k) + ((b >> 16) & 255) * k) << 16) | ((((a >> 8) & 255) * (1 - k) + ((b >> 8) & 255) * k) << 8) |
  (((a & 255) * (1 - k) + (b & 255) * k) | 0);
/* f — fadeAt(скорость) своей машины; поток — 0 (чёрный выхлоп старых машин виден и на ходу) */
function puff (P, L, vx, vz, k = 1, f = 0) {
  const sp = rnd(0.7, 1.5) * k;
  const lk = 1 + (FADE.LIFE - 1) * f, ak = 1 + (FADE.A - 1) * f, sk = 1 + (FADE.S - 1) * f, gk = 1 + (FADE.GROW - 1) * f;
  let hex = pick(L.cols);
  if (f > 0.01) hex = mix(hex, FADE.TO, FADE.PALE * f);
  PIX.spawn(P.x + rnd(-0.07, 0.07), P.y + rnd(-0.04, 0.04), P.z + rnd(-0.07, 0.07), {
    vx: P.bx * sp + vx * 0.25 + rnd(-0.4, 0.4), vy: rnd(0.4, 0.9), vz: P.bz * sp + vz * 0.25 + rnd(-0.4, 0.4),
    s: rnd(L.s[0], L.s[1]) * sk, grow: L.grow * gk, life: rnd(L.life[0], L.life[1]) * lk, hex: dim(hex), drag: 1.6, soft: true, a: L.a * ak,
  });
  STATS.puffs++;
  STATS.fade = f;
}
/* хлопок: «пах», оранжевая искра и чёрный клуб из трубы — горсть мелких клубов веером, не один большой */
function pop (P, vx, vz, n = 6, loud = 1) {
  for (let i = 0; i < n * 1.5; i++) {
    const sp = rnd(1.2, 3.4);
    PIX.spawn(P.x, P.y, P.z, {
      vx: P.bx * sp + vx * 0.3 + rnd(-0.8, 0.8), vy: rnd(0.2, 1.0), vz: P.bz * sp + vz * 0.3 + rnd(-0.8, 0.8),
      s: rnd(0.13, 0.22), grow: rnd(0.5, 0.8), life: rnd(0.8, 1.3), hex: dim(pick(BLACK)), drag: 2.4, soft: true, a: rnd(0.5, 0.7), spin: rnd(-3, 3),
    });
  }
  for (let i = 0; i < 2; i++) PIX.spawn(P.x, P.y, P.z, { vx: P.bx * 4 + vx * 0.5, vy: rnd(0, 0.4), vz: P.bz * 4 + vz * 0.5, s: rnd(0.1, 0.16), life: 0.09, hex: i ? 0xffc23a : 0xff7a1f });
  const Snd = A.snd;
  if (Snd && loud && Snd.fx) Snd.fx('backfire', s => { s.noise(0.05, 0.2 * loud); s.blip(58, 0.07, 'square', 0.1 * loud); }, { eng: 1 }, loud);
  STATS.pops++;
}

/* каждый кадр: vf — скорость вдоль машины, м/с; api — exhApi в game.js */
export function step (dt, vf, api) {
  if (!(A = api)) return;
  const car = A.car(), V = A.V;
  if ((ST.readT -= dt) <= 0) { ST.readT = 0.5; readEngine(); }
  if (car && A.live() && !V.air && V.sink === undefined && !(A.career && A.auto.stalled())) own(dt, vf, car, V);
  else STATS.grade = '';
  oldCars(dt);
}

function own (dt, vf, car, V) {
  const g = grade(ST.c), gas = !!A.gas();
  const winter = g === 'ok' && A.snow() > 0.25;
  const beast = !!(A.beast && A.beast());
  const L = LOOK[beast ? 'beast' : winter ? 'steam' : g];
  STATS.grade = beast ? 'beast' : winter ? 'steam' : g;
  const hl = (car.userData && car.userData.hl) || 2.1, low = PIX.low();
  // ровный дым: на газу гуще (чаще), на скорости — тоже чаще, иначе шлейф рвётся; на холостых — реже
  if ((ST.acc -= dt) <= 0) {
    const k = (gas ? 0.65 : Math.abs(vf) < 1.5 ? 1.6 : 1) * (Math.abs(vf) > 8 ? 0.75 : 1) * (low ? 2 : 1);   // стоит без газа — реже
    ST.acc = Math.min(L.every * k, L.gap / Math.max(1, Math.abs(vf)) * (low ? 2 : 1));
    ST.side = -ST.side;
    const P = pipe(car, V.h, hl, ST.side);
    const f = fadeAt(vf);                         // на ходу — лёгкий шлейф, на месте и медленно — заметный дым
    for (let i = 0; i < L.n; i++) puff(P, L, V.vx, V.vz, gas ? 1.4 : 1, f);
  }
  // хлопки на газу: густой серый и чёрный
  if ((g === 'low' || g === 'dead') && gas && Math.abs(vf) > 1.5) {
    if ((ST.popT -= dt) <= 0) {
      ST.popT = rnd(0.6, 1.8) / EXH.POP;
      pop(pipe(car, V.h, hl, ST.side), V.vx, V.vz, low ? 4 : 6);
    }
  }
  // «чихи» перед тем, как заглохнуть
  const left = A.career ? A.auto.stallIn() : 0;
  if (left > 0 && left < EXH.SNEEZE) {
    if ((ST.sneezeT -= dt) <= 0) {
      ST.sneezeT = rnd(0.45, 0.95);
      pop(pipe(car, V.h, hl, ST.side), V.vx, V.vz, low ? 5 : 8, 1.3);
      if (A.snd && A.snd.engineCut) A.snd.engineCut(rnd(0.12, 0.22));   // гул мотора на миг пропадает (motor.js)
      STATS.sneezes++;
    }
  } else ST.sneezeT = 0;
}

/* хлопок на сбросе газа с высоких оборотов (motor.js): огонёк и «пах» из трубы своей машины; loud 0…1 — громкость.
   false — не к месту (в воздухе, тонет, заглохла, без смены) */
export function liftPop (loud = 0.8) {
  if (!A) return false;
  const car = A.car(), V = A.V;
  if (!car || !A.live() || V.air || V.sink !== undefined || (A.career && A.auto.stalled())) return false;
  pop(pipe(car, V.h, (car.userData && car.userData.hl) || 2.1, ST.side), V.vx, V.vz, PIX.low() ? 1.5 : 2.5, loud);
  STATS.lift++;
  return true;
}

/* поток: старые седаны и хэтчбеки иногда коптят чёрным */
function oldCars (dt) {
  const T = A.ACT || A.TRAFFIC, cam = A.cam;          // без стоящих у бордюра (trafficgrid.js): коптят только едущие
  if (ST.old) {
    const t = ST.old;
    if ((ST.oldLeft -= dt) <= 0 || t.wreck || t.knock || t.parked || !t.mesh || !t.mesh.parent) { ST.old = null; return; }
    if ((ST.acc2 = (ST.acc2 || 0) - dt) > 0) return;
    ST.acc2 = PIX.low() ? 0.12 : 0.06;
    const fx = Math.sin(t.h), fz = Math.cos(t.h), lx = fz, lz = -fx, hl = t.hl || 2.1;
    const sp = t.speed || 0;
    const P = { x: t.x - fx * (hl + 0.1) - lx * 0.4, y: t.mesh.position.y + 0.35, z: t.z - fz * (hl + 0.1) - lz * 0.4, bx: -fx, bz: -fz };   // труба справа, как у своей
    puff(P, LOOK.dead, fx * sp, fz * sp);
    return;
  }
  if ((ST.oldT -= dt) > 0) return;
  ST.oldT = EXH.OLD_EVERY * rnd(0.7, 1.3);
  if (!T || !T.length || !cam || Math.random() > EXH.OLD_P) return;
  // одна случайная из старых (седан или хэтчбек, не такси), что едут рядом с камерой
  const cx = cam.position.x, cz = cam.position.z, R2 = EXH.OLD_R * EXH.OLD_R;
  let t = null, n = 0;
  for (const o of T) {
    if ((o.model !== 'sedan' && o.model !== 'hatch') || o.parked || o.wreck || o.knock || o.svc || o.taxi || !(o.speed > 3)) continue;
    if ((o.x - cx) ** 2 + (o.z - cz) ** 2 > R2) continue;
    if (Math.random() * ++n < 1) t = o;            // равновероятно из подходящих, без массива
  }
  if (!t) return;
  ST.old = t; ST.oldLeft = EXH.OLD_T * rnd(0.7, 1.4); STATS.old++;
}

export const DEBUG = { EXH, FADE, STATS, ST, grade, fadeAt };
