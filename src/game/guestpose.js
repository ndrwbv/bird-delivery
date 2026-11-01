/* Клиент ждёт со свободными руками, перед коробкой поднимает их и после ловли
   опускает вместе с коробкой. qpeople.js использует тот же флаг для локтей модели. */
export const RECEIVE = { ARM: -0.95, ELB: -0.9, IN: 0.1, UP: 9, DOWN: 5 };

export function reach (ped) {
  if (ped && !ped.dead && ped.grp) ped.grp.userData.qReceive = true;
}
export function caught (ped) {
  if (ped && ped.grp) ped.grp.userData.qReceive = false;
}
export function clear (ped) {
  if (ped && ped.grp) { ped.grp.userData.qReceive = false; ped.grp.userData.qGuestRest = false; }
}

export function rest (ped, dt) {
  const u = ped.grp.userData, holding = !!(ped.hold || ped.preBox), up = !!u.qReceive;
  u.qGuestRest = !holding;
  const x = up ? RECEIVE.ARM : holding ? -0.5 : 0.03;
  const side = up || holding ? RECEIVE.IN : -0.06;
  const k = 1 - Math.exp(-(up ? RECEIVE.UP : RECEIVE.DOWN) * dt);
  for (const [arm, sign] of [[u.armL, 1], [u.armR, -1]]) {
    arm.rotation.x += (x - arm.rotation.x) * k;
    arm.rotation.y += -arm.rotation.y * k;
    arm.rotation.z += (side * sign - arm.rotation.z) * k;
  }
}
