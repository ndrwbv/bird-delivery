/* ──────────────────────────────────────────────────────────────────────────
   Курьер за рулём — человек как на улице (0ае, 23.10.2026; автор: «курьер в машине заметно ниже прохожего»).
   Правила словами — docs/CARS3D.md «Что есть у машины с настоящей моделью».

   Был коробочный (realcar.js driver): мельче и ниже людей Quaternius (1,75—1,85 м). Теперь в «Семёрке» за рулём —
   тот же человек, что в катсценах (story.js courierPerson: оранжевая куртка пиццерии), той же модели и того же
   роста, что прохожие (makeHuman), в позе «сидит»: бёдра вперёд (LEG), голени вниз, руки к рулю (ARM) и чуть
   поворачивают его вслед за рулём (STEER). Сидит на сиденье водителя: X, Y, Z — где группа человека в осях машины
   (м; бёдра — на ~0,7 м выше неё, на подушке сиденья модели). Из-за руля (V) не виден: машину прячет вид кабины.
   ?qp=0 (старые коробочные люди) и ?oldcar — по-старому, коробочный курьер.

     init(api)              — game.js: { makeHuman(person, o), person() — человек курьера }
     step(car, steer)       — каждый кадр после REALCAR.step: посадить (раз на машину) и позу
   ────────────────────────────────────────────────────────────────────────── */
export const DRV = { X: 0.43, Y: 0.17, Z: -0.08, LEG: -1.45, ARM: -0.8, STEER: 0.15 };
export const ST = { built: 0, skip: 0 };
const SEAT = new WeakMap();                        // машина → человек за рулём (null — не вышло, остаётся коробочный)
let A = null;
export function init (api) { A = api; }

export function step (car, steer) {
  const u = car && car.userData, R = u && u.real;
  if (!R || !A) return;
  let g = SEAT.get(car);
  if (g === null) return;
  if (!g) {
    const p = A.person();
    g = p ? A.makeHuman(p, { shirt: p.look && p.look.shirt, pants: p.look && p.look.pants }) : null;
    if (!g || !g.userData.q) { SEAT.set(car, null); ST.skip++; return; }   // люди коробочные (?qp=0) — пусть сидит прежний
    g.position.set(DRV.X, DRV.Y, DRV.Z);
    car.add(g);
    if (R.driver) R.driver.visible = false;
    SEAT.set(car, g);
    ST.built++;
  }
  const h = g.userData, s = steer || 0;
  h.legL.rotation.x = DRV.LEG; h.legR.rotation.x = DRV.LEG;
  h.armL.rotation.x = DRV.ARM - s * DRV.STEER; h.armR.rotation.x = DRV.ARM + s * DRV.STEER;
}

export const DEBUG = { DRV, ST, of: car => SEAT.get(car) || null };
