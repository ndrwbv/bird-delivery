import assert from 'node:assert/strict';
import {landLift,shoreParts,LAND_LIFT} from '../src/game/landheight.js';
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0))/2;
let samples=0;
for(const levels of [[-1,.4,2],[-2,-1,-.1],[.1,.3,.6],[1,2,3],[0,.8,2],[0,0,.8]])for(const extra of [0,.04]){
  const p=[[0,0,levels[0]],[20,0,levels[1]],[0,20,levels[2]]],parts=shoreParts(p);
  assert.ok(Math.abs(parts.reduce((s,q)=>s+area(q),0)-area(p))<1e-8,'Берег не теряет и не дублирует площадь');
  for(const q of parts)for(let i=1;i<q.length-1;i++){
    const t=[q[0],q[i],q[i+1]];
    if(area(t)<1e-10)continue;
    for(const w of [[1/3,1/3,1/3],[.1,.2,.7],[.7,.2,.1]]){
      const h=t.reduce((s,v,j)=>s+v[2]*w[j],0);
      const rendered=t.reduce((s,v,j)=>s+(v[2]+landLift(v[2])+extra)*w[j],0);
      assert.ok(Math.abs(rendered-(h+landLift(h)+extra))<1e-9,'Нарисованный берег и поверхность движения совпадают внутри грани');
      samples++;
    }
  }
}
assert.equal(landLift(-1),0);assert.equal(landLift(0),0);assert.equal(landLift(.8),LAND_LIFT);assert.equal(landLift(30),LAND_LIFT);
console.log(`landheight: берег и поверхность движения совпадают; ${samples} внутренних точек, дно и уровень воды сохранены`);
