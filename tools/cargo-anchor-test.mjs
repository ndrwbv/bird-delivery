/* №0п120: real local trunk/door anchors survive body length, lowering, opening and world rotation. */
import assert from 'node:assert/strict';
import * as THREE from '../src/vendor/three.module.min.js';
import { cargoAnchor } from '../src/game/cargo-anchor.js';
import { step as rearStep } from '../src/game/carrear.js';
const rows=[];
for(const kind of ['sedan','hatch','fixed']){
 const car=new THREE.Group();car.position.set(12,.25,-9);car.rotation.y=1.6;
 car.userData={hl:1.75,y0:.66,spec:{L:3.5,h:.5}};
 if(kind==='sedan')car.userData.trunk={py:1.18,pz:-1.12};
 if(kind==='hatch'){
  const m=new THREE.Object3D();m.position.set(0,.82,-1.776);car.add(m);
  car.userData.rdoor={m,h:.4,a:0,ajar:0,want:1.2,p:null};
 }
 const local=cargoAnchor(car,new THREE.Vector3()),from=car.localToWorld(local.clone());
 assert(local.z < -.9,kind+': source is at the rear, not body center');
 if(kind==='hatch'){
  for(let i=0;i<45;i++)rearStep(1/60,car,0);
  assert(car.userData.rdoor.a>1.1,'delivery opens actual rear hatch');
  const open=cargoAnchor(car,new THREE.Vector3());assert(open.distanceTo(local)<1e-12,'outlet follows opening panel instead of cargo bay');
  car.userData.rdoor.want=0;for(let i=0;i<60;i++)rearStep(1/60,car,0);
  assert(car.userData.rdoor.a<.006,'delivery closes actual rear hatch');
 }
 rows.push({kind,local:local.toArray(),world:from.toArray()});
}
console.log(JSON.stringify({ok:true,cases:rows.length,rows}));
