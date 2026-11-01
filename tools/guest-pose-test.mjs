/* №0п121: actual Quaternius bones, including winter clothes; no renderer or browser. */
import assert from 'node:assert/strict';
import * as THREE from '../src/vendor/three.module.min.js';
import { buildQ } from '../src/game/qpeople.js';
import * as GPOSE from '../src/game/guestpose.js';

let now = 1000;
globalThis.performance = { now: () => now };
const rows = [];
for (const fam of ['M', 'F', 'A']) for (const lvl of [0, 3]) {
  const g = new THREE.Group();
  const bone = () => { const b = new THREE.Object3D(); g.add(b); return b; };
  const u = { armL: bone(), armR: bone(), legL: bone(), legR: bone(), head: bone(), parts: [null, null, bone()] };
  const { skin } = buildQ(g, { fam, head: 0, body: 0, legs: 0, feet: 0, all: 0, seed: 7 },
    { skin: '#ddb599', shirt: '#447799', pants: '#333333', lvl, hw: 'beanie' },
    { seed: 7, f: fam !== 'M', hairC: '#332211' }, new THREE.MeshLambertMaterial());
  g.userData = u;
  const ped = { grp: g }, st = skin.userData.q;
  const frame = () => { now += 1000 / 60; GPOSE.rest(ped, 1 / 60); g.updateMatrixWorld(true); skin.onBeforeRender(); };
  const hands = () => ['handL', 'handR'].map(k => st.bones[st.F.J[k]].getWorldPosition(new THREE.Vector3()));
  u.armL.rotation.set(1, 1, 1); u.armR.rotation.set(-1, -1, -1);
  for (let i = 0; i < 120; i++) frame();
  const waiting = hands(), torso = [];
  for (let i = 0; i < st.C.nV; i++) if (st.C.vcls[i] === 5) {
    const v = new THREE.Vector3(); skin.getVertexPosition(i, v); skin.localToWorld(v);
    if (Math.abs(v.y - waiting[0].y) < 0.08) torso.push(v);
  }
  assert(torso.length, `${fam}/${lvl}: body cross section exists`);
  assert(waiting[0].x < Math.min(...torso.map(v => v.x)) && waiting[1].x > Math.max(...torso.map(v => v.x)), `${fam}/${lvl}: wrists outside body/clothes`);
  assert(Math.abs(u.armL.rotation.y) < 0.001 && Math.abs(u.armR.rotation.y) < 0.001, `${fam}/${lvl}: old gesture reset`);
  GPOSE.reach(ped);
  for (let i = 0; i < 36; i++) frame();
  const raised = hands();
  assert(raised.every((v, i) => v.y > waiting[i].y + 0.1), `${fam}/${lvl}: hands raised before box`);
  const box = new THREE.Group(); box.userData.pbox = 1; g.add(box); ped.hold = box;
  GPOSE.caught(ped);
  const heights = [];
  for (let i = 0; i < 60; i++) { frame(); heights.push(hands()[0].y); }
  const lowered = hands();
  assert(lowered.every((v, i) => v.y < raised[i].y - 0.02), `${fam}/${lvl}: hands lower with box`);
  assert(heights.every((v, i) => !i || v <= heights[i - 1] + 0.002), `${fam}/${lvl}: lowering is gradual`);
  assert(heights.every((v, i) => !i || heights[i - 1] - v < 0.05), `${fam}/${lvl}: no sudden hand drop`);
  assert(Math.abs(box.position.y - ((lowered[0].y + lowered[1].y) / 2 + 0.08)) < 1e-6, `${fam}/${lvl}: box stays on wrists`);
  GPOSE.clear(ped);
  assert(!u.qReceive && !u.qGuestRest, `${fam}/${lvl}: state cleared when released`);
  rows.push({ fam, lvl, actual: st.F.fam, rise: +(raised[0].y - waiting[0].y).toFixed(3), lower: +(raised[0].y - lowered[0].y).toFixed(3) });
}
console.log(JSON.stringify({ ok: true, cases: rows.length, rows }));
