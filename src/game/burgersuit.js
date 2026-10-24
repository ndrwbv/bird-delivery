/* Бургеры на улицах — люди в ростовых костюмах (12ап, автор 18.10.2026; docs/CAREER.md «Бургеры — люди в костюмах»).

   Раньше по тротуарам ходили «живые» бургеры на ножках (булка с глазами). Теперь это обычный человек (модель Quaternius,
   game.js makeHuman) в надетом костюме-бургере: снизу торчат ноги, бургер — от бёдер до макушки (нижняя булка, котлета,
   сыр, салат, помидор, верхняя булка куполом с кунжутом), лицо видно в прорези спереди, над прорезью — нарисованные глаза.
   Ходят и толпятся там же, где ходили бургеры (game.js PEDS: по тротуарам и сходка у ТЦ), за сбитого — как за бургер
   (+1 респекта, задание «сбей N бургеров»), но сбитый — человек: отлетает, как все (hits.js), костюм — на нём; иногда
   (SUIT.OFF) костюм слетает и кувыркается отдельно, а человек летит без него.

     SUIT.dress(A, grp)       — надеть костюм на группу человека (один меш, общая геометрия и материал на всех)
     SUIT.hit(A, p, vx, vz, o) — сбит (машиной, взрывом, конкурентом): человек отлетает (A.gibHuman), костюм — на нём или слетает;
                                o — как у hits.js hit: { up, one, back } (game.js burgerHit)
     SUIT.sign(A, grp)        — табличка зазывалы у бургерной (0п70)
     SUIT.step(dt)            — каждый кадр: слетевшие костюмы падают, лежат и тают
     SUIT.STATS               — сколько надето, сбито, слетело костюмов
   A — { THREE, scene, put, mergeGeos, gibHuman, groundH }. Геометрия — при первом костюме (поздняя сборка, после buildCity:
   вещи three.js до стройки города сдвигают «зерно», docs/AGENTS.md). */

/* 0п70 (автор 24.10.2026: «людей в костюмах бургеров слишком много; их должно быть меньше, и они обитают около бургерных
   в основном»): по тротуарам — один на всю округу (прохожих вокруг машины ~44: примерно 1 на 45), на сходке у ТЦ — 4,
   а у точек «Королевы Бургеров» (rivals.js) — зазывалы с табличкой на палке: у каждой ближней точки 1—3 (PER, жребий —
   по месту), всего BARK на город; уехал — зазывалы переходят к точкам рядом с тобой (за кадром, дальше BARK_FAR м) */
export const SUIT = {
  N: 1,             // ходят по тротуарам (было 28; до 23.10 — 40 бургеров)
  HANG: 4,          // на сходке у ТЦ (было 12)
  BARK: 6, PER: [1, 3], BARK_FAR: 200,   // зазывал у бургерных всего; у одной точки; переводить к другой — когда дальше BARK_FAR м от машины
  OFF: 0.45,        // доля сбитых, у кого костюм слетает
  LIE: 14,          // с — слетевший костюм лежит, потом тает (последняя секунда)
};
export const STATS = { dressed: 0, hit: 0, off: 0 };

let GEO = null, MAT = null;
const FLY = [];
const rand = (a, b) => a + Math.random() * (b - a);

/* костюм в осях человека: ноги до 0,75 м голые, прорезь для лица 1,5—1,84 м спереди (+Z). Рост модели ~1,85 м, голова — 1,58 */
function build (A) {
  const T = A.THREE, P = A.put, L = [];
  const R = 0.5;
  P(L, new T.CylinderGeometry(0.52, 0.45, 0.25, 14), '#e8b563', 0, 0.875, 0);                 // нижняя булка
  P(L, new T.CylinderGeometry(0.54, 0.54, 0.13, 14), '#7a4526', 0, 1.065, 0);                 // котлета
  P(L, new T.BoxGeometry(0.98, 0.04, 0.98), '#ffd34d', 0, 1.15, 0, 0, Math.PI / 4);           // сыр уголками
  P(L, new T.CylinderGeometry(0.56, 0.53, 0.07, 14), '#5fbf4a', 0, 1.2, 0);                   // салат
  P(L, new T.CylinderGeometry(0.5, 0.5, 0.06, 12), '#e04836', 0, 1.265, 0);                   // помидор
  P(L, new T.CylinderGeometry(R, R, 0.2, 14, 1, true), '#e8a84f', 0, 1.4, 0);                 // верхняя булка: низ кольцом
  // прорезь для лица: ±0,45 рад спереди (~0,43 м шириной), 1,5—1,84 м
  P(L, new T.CylinderGeometry(R, R, 0.34, 14, 1, true, 0.45, Math.PI * 2 - 0.9), '#e8a84f', 0, 1.67, 0);
  // край прорези — тёмный кант (сверху и снизу)
  for (const y of [1.505, 1.835]) P(L, new T.CylinderGeometry(R + 0.012, R + 0.012, 0.03, 4, 1, true, -0.47, 0.94), '#b9772f', 0, y, 0);
  const dome = new T.SphereGeometry(R, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, 0.62, 1);
  P(L, dome, '#e8a84f', 0, 1.84, 0);                                                          // купол
  for (let i = 0; i < 9; i++) {                                                               // кунжут
    const a = i * 2.39, r = 0.12 + (i % 3) * 0.1;
    P(L, new T.SphereGeometry(0.03, 5, 4), '#fff3d6', Math.cos(a) * r, 1.84 + 0.62 * Math.sqrt(Math.max(0, R * R - r * r)) + 0.01, Math.sin(a) * r);
  }
  for (const s of [-1, 1]) {                                                                  // нарисованные глаза над прорезью
    P(L, new T.SphereGeometry(0.075, 8, 6), '#ffffff', 0.14 * s, 1.95, 0.44);
    P(L, new T.SphereGeometry(0.035, 6, 5), '#1b1410', 0.14 * s, 1.95, 0.51);
  }
  GEO = A.mergeGeos(L);
  GEO.userData.shared = true;                      // одна на все костюмы: тело сбитого (hits.js dispose) её не освобождает
  // изнутри прорези видна внутренность костюма — две стороны; общий материал не выбрасывать (dropMesh, куски — userData.keep)
  MAT = new T.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: T.DoubleSide });
  MAT.userData.keep = true;
}

/* табличка зазывалы на палке (у правого плеча, над костюмом): жёлтая с синим кантом, на ней — бургер полосками */
let SGEO = null;
export function sign (A, grp) {
  if (!GEO) build(A);
  if (!SGEO) {
    const P = A.put, L = [];
    P(L, new A.THREE.BoxGeometry(0.05, 1.7, 0.05), '#8a6b4e', 0.62, 1.6, 0.1);               // палка
    P(L, new A.THREE.BoxGeometry(0.78, 0.5, 0.05), '#1d3f8f', 0.62, 2.5, 0.12);              // кант
    P(L, new A.THREE.BoxGeometry(0.7, 0.42, 0.06), '#f4c430', 0.62, 2.5, 0.12);              // табличка
    for (const [y, h, c] of [[2.6, 0.08, '#e8a84f'], [2.53, 0.04, '#5fbf4a'], [2.48, 0.06, '#7a4526'], [2.42, 0.06, '#e8a84f']])
      P(L, new A.THREE.BoxGeometry(0.3, h, 0.07), c, 0.62, y, 0.12);                         // бургер полосками
    SGEO = A.mergeGeos(L);
    SGEO.userData.shared = true;
  }
  const m = new A.THREE.Mesh(SGEO, MAT);
  m.name = 'burger-sign';
  grp.add(m);
  return m;
}

export function dress (A, grp) {
  if (!GEO) build(A);
  const m = new A.THREE.Mesh(GEO, MAT);
  m.name = 'burger-suit';
  grp.add(m);
  grp.userData.suit = m;
  STATS.dressed++;
  return m;
}

/* сбит: костюм на нём — тело hits.js копирует то, что надето на группу (qpeople.js corpseQ); слетает — тело без него,
   костюм — своим куском: вверх и вперёд по удару, кувырком */
export function hit (A, p, vx, vz, o = {}) {
  STATS.hit++;
  const s = p.grp && p.grp.userData.suit;
  const off = s && !o.up && Math.random() < SUIT.OFF;   // упал и встал (o.up) — костюм на нём
  if (off) s.userData.noDecor = true;
  A.gibHuman(p, vx, vz, o);
  if (!off) return;
  s.userData.noDecor = false;
  STATS.off++;
  const k = p.grp.scale.x || 1, m = new A.THREE.Mesh(GEO, MAT);
  m.scale.setScalar(k);
  const fl = A.groundH(p.x, p.z);
  m.position.set(p.x, fl + 0.1, p.z);
  m.rotation.y = p.grp.rotation.y;
  A.scene.add(m);
  const l = Math.hypot(vx, vz) || 1, sp = Math.min(14, l * 0.6 + 2);
  FLY.push({ m, A, fl, vx: vx / l * sp + rand(-1.5, 1.5), vy: rand(4, 7), vz: vz / l * sp + rand(-1.5, 1.5), sx: rand(-7, 7), sz: rand(-5, 5), life: SUIT.LIE, rest: 0 });
}

export function step (dt) {
  for (let i = FLY.length - 1; i >= 0; i--) {
    const f = FLY[i], m = f.m;
    if (!f.rest) {
      f.vy -= 19 * dt;
      m.position.x += f.vx * dt; m.position.y += f.vy * dt; m.position.z += f.vz * dt;
      m.rotation.x += f.sx * dt; m.rotation.z += f.sz * dt;
      const fl = f.A.groundH(m.position.x, m.position.z);
      if (m.position.y < fl + 0.05 && f.vy < 0) {
        m.position.y = fl + 0.05; f.vy *= -0.3; f.vx *= 0.5; f.vz *= 0.5; f.sx *= 0.5; f.sz *= 0.5;
        if (Math.abs(f.vy) < 1.2) { f.rest = 1; m.rotation.set(Math.PI / 2, m.rotation.y, 0); m.position.y = fl + 0.52 * m.scale.x; }   // лёг на бок
      }
    }
    if ((f.life -= dt) < 1) m.scale.setScalar(Math.max(0.001, f.life) * (f.k || (f.k = m.scale.x)));
    if (f.life <= 0) { f.A.scene.remove(m); FLY.splice(i, 1); }   // геометрия и материал — общие, не выбрасываем
  }
}

export const DEBUG = { SUIT, STATS, FLY };
