export const playable = Object.freeze({ x0: 2330, x1: 3860, z0: 1335, z1: 2820 });

export function inDeliveryZone (x, z, margin = 0) {
  return Number.isFinite(x) && Number.isFinite(z) &&
    x > playable.x0 + margin && x < playable.x1 - margin &&
    z > playable.z0 + margin && z < playable.z1 - margin;
}
