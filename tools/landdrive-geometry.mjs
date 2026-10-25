import assert from 'node:assert/strict';
import {landCarSupport} from '../src/game/landdrive.js';
const offset=(x,z)=>z>=0?.46:0;
for(const direction of [1,-1]){
  const V={x:0,z:-4*direction,h:direction>0?0:Math.PI};
  let previous=direction>0?0:.46,maxStep=0;
  for(let i=0;i<240;i++){
    V.z+=direction*2.5/60;
    const p=landCarSupport(V,offset,1/60),height=offset(V.x,V.z)+p.delta;
    maxStep=Math.max(maxStep,Math.abs(height-previous));previous=height;
    assert.ok(height>=-1e-9&&height<=.46+1e-9);
  }
  assert.ok(maxStep<.06,'Кузов не перескакивает целиком на другой уровень');
  assert.ok(Math.abs(previous-(direction>0?.46:0))<1e-5,'Высота на ровном газоне и дороге сохранена');
  V.z=direction>0?-30:30;
  const p=landCarSupport(V,offset,1/60);
  assert.ok(Math.abs(p.delta)<1e-8,'Перенос машины сбрасывает старую опору');
}
const flat=landCarSupport({x:0,z:0,h:.5},()=>0,1/60);
assert.deepEqual(flat,{delta:0,front:0,back:0,left:0,right:0});
console.log('landdrive: постепенный подъём и съезд, точная высота на плоскости и сброс после переноса — OK');
