/* Car-local outlet: sedan lid, hatch/van rear door, or a fixed rear cargo compartment.
   rdoor.p is its CLOSED position: the outlet must not move with the opening flap. */
export function cargoAnchor (car, out) {
  const u = car.userData, tr = u.trunk, door = u.rdoor;
  if (tr) return out.set(0, tr.py, tr.pz);
  if (door) {
    if (!door.p) door.p = door.m.position.clone();
    return out.set(door.p.x, door.p.y, door.p.z + 0.17);
  }
  const half = u.hl || (u.spec?.L || 4) / 2;
  return out.set(0, (u.y0 || 0.65) + (u.spec?.h || 0.4) / 4, -half + 0.17);
}
