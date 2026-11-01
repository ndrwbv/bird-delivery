/* №0п120: exact catch endpoint agrees with carried-box wrist support in world space. */
import assert from 'node:assert/strict';
import * as THREE from '../src/vendor/three.module.min.js';
import { buildQ, qPose } from '../src/game/qpeople.js';
import { catchPoint } from '../src/game/catchpoint.js';
import * as GPOSE from '../src/game/guestpose.js';
let now = 1000; globalThis.performance = { now: () => now };
const rows = [];
for (const fam of ['M', 'F', 'A']) for (const lvl of [0, 3]) {
  const g = new THREE.Group(); g.position.set(13, .43, -9); g.rotation.y = 1.7;
  const bone = () => { const b = new THREE.Object3D(); g.add(b); return b; };
  const u = { armL: bone(), armR: bone(), legL: bone(), legR: bone(), head: bone(), parts: [null, null, bone()] };
  const { skin } = buildQ(g, { fam, head: 0, body: 0, legs: 0, feet: 0, all: 0, seed: 7 },
    { skin: '#ddb599', shirt: '#447799', pants: '#333333', lvl, hw: 'beanie' },
    { seed: 7, f: fam !== 'M', hairC: '#332211' }, new THREE.MeshLambertMaterial());
  g.userData = u; u.skin = skin;
  const ped = { grp: g }; GPOSE.reach(ped);
  for (let i = 0; i < 60; i++) { now += 1000 / 60; GPOSE.rest(ped, 1 / 60); g.updateMatrixWorld(true); qPose(skin); }
  const to = catchPoint(ped), box = new THREE.Group(); box.userData.pbox = 1; g.add(box); qPose(skin);
  const actual = box.getWorldPosition(new THREE.Vector3());
  const error = actual.distanceTo(new THREE.Vector3(to.x, to.y, to.z));
  assert(error < .002, `${fam}/${lvl}: flight-to-held discontinuity ${error}`);
  assert(to.y > 1.6, `${fam}/${lvl}: uses raised hands rather than old ground + 1.15`);
  rows.push({ fam, lvl, catchY: +to.y.toFixed(3), error });
}
console.log(JSON.stringify({ ok: true, cases: rows.length, rows }));
