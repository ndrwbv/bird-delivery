/* Snow adds a small compliant offset to the existing solid-ground suspension.
   Rendering readiness and terrain/curb lift never enter this calculation. */
export function createSnowSuspension(sampleDepth) {
  const heights = new Float64Array(4);
  const pose = { lift: 0, front: 0, back: 0, left: 0, right: 0 };
  let lastX = NaN, lastZ = NaN, model = null;
  return function update(V, car, dt, active) {
    if (!active || model !== car || Math.hypot(V.x - lastX, V.z - lastZ) > 8) heights.fill(0);
    model = car; lastX = V.x; lastZ = V.z;
    const fx = Math.sin(V.h), fz = Math.cos(V.h), wheels = car?.userData?.wheels;
    const blend = 1 - Math.exp(-12 * dt), limit = 0.4 * dt;
    for (let i = 0; i < 4; i++) {
      const p = wheels?.[i]?.parent?.position || wheels?.[i]?.position;
      const local = p && Number.isFinite(p.x) && Number.isFinite(p.z) && Math.abs(p.x) > 0.2 && Math.abs(p.x) <= 3 && Math.abs(p.z) <= 5;
      const side = local ? p.x : (i % 2 ? 0.89 : -0.89), fore = local ? p.z : (i < 2 ? 1.4 : -1.45);
      const x = V.x + fz * side + fx * fore, z = V.z - fx * side + fz * fore;
      const target = active ? Math.max(0, Math.min(0.16, sampleDepth(x, z, V.y))) : 0;
      heights[i] += Math.max(-limit, Math.min(limit, (target - heights[i]) * blend));
    }
    pose.front = (heights[0] + heights[1]) / 2;
    pose.back = (heights[2] + heights[3]) / 2;
    pose.left = (heights[1] + heights[3]) / 2;
    pose.right = (heights[0] + heights[2]) / 2;
    pose.lift = (pose.front + pose.back) / 2;
    return pose;
  };
}
