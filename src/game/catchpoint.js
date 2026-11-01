/* The endpoint of a thrown box is the same wrist support used by qpeople's carried box.
   Force a fresh pose even when the customer was culled in the previous frame. */
import * as THREE from '../vendor/three.module.min.js';
import { qPose, CARRY } from './qpeople.js';
import { BOX } from './pizzabox.js';
const L = new THREE.Vector3(), R = new THREE.Vector3(), P = new THREE.Vector3();
export function catchPoint (ped) {
  const g = ped.grp, u = g.userData, skin = u.skin, st = skin?.userData.q;
  g.updateWorldMatrix(true, true);
  if (st && st.F.J.handL >= 0 && st.F.J.handR >= 0) {
    qPose(skin);
    st.bones[st.F.J.handL].getWorldPosition(L); g.worldToLocal(L);
    st.bones[st.F.J.handR].getWorldPosition(R); g.worldToLocal(R);
  } else if (u.armL && u.armR) {
    u.armL.localToWorld(L.set(0, -0.58, 0)); g.worldToLocal(L);
    u.armR.localToWorld(R.set(0, -0.58, 0)); g.worldToLocal(R);
  } else { L.set(-0.15, 1.12, 0.45); R.set(0.15, 1.12, 0.45); }
  P.set((L.x + R.x) / 2, (L.y + R.y) / 2 + BOX.H / 2 + CARRY.Y, Math.max((L.z + R.z) / 2 + 0.03, CARRY.ZMIN));
  g.localToWorld(P);
  return { x: P.x, y: P.y, z: P.z };
}
