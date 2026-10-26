import assert from 'node:assert/strict';
import {mergeLandPieces} from '../src/game/landpieces.js';
import {createLandCover} from '../src/game/landcover.js';
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0))/2;
const square=[[0,0],[4,0],[4,4],[0,4]];
const split=[[square[0],square[1],square[2]],[square[0],square[2],square[3]]];
assert.deepEqual(mergeLandPieces(split).map(area),[16]);
assert.equal(mergeLandPieces(split)[0].length,4);
const before=structuredClone(split);mergeLandPieces(split);assert.deepEqual(split,before,'Исходные точки не меняются');
const inside=(p,x,z)=>p.every((a,i)=>{const b=p[(i+1)%p.length];return(b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0])>=0;});
for(const hole of[false,true])for(const origin of[[0,0],[5000,-5000]]){
  const pieces=[];
  for(let x=0;x<5;x++)for(let z=0;z<5;z++){
    if(hole&&x===2&&z===2)continue;
    const q=[[x,z],[x+1,z],[x+1,z+1],[x,z+1]].map(p=>[p[0]+origin[0],p[1]+origin[1]]);
    pieces.push([q[0],q[1],q[2]],[q[0],q[2],q[3]]);
  }
  const result=mergeLandPieces(pieces);
  assert.equal(result.reduce((s,p)=>s+area(p),0),hole?24:25);
  assert.ok(result.reduce((s,p)=>s+p.length-2,0)<pieces.length,'Внутреннее дробление действительно убрано');
  for(let x=.17;x<5;x+=.5)for(let z=.29;z<5;z+=.5){
    const wanted=hole&&x>2&&x<3&&z>2&&z<3?0:1;
    assert.equal(result.filter(p=>inside(p,x+origin[0],z+origin[1])).length,wanted,'Сохраняются отверстия и ровно одна поверхность');
  }
  for(const p of result)for(const v of p)assert.ok(pieces.some(q=>q.some(w=>v===w)),'Внешние точки берутся из исходных, без сдвига');
}
const gap=[...split, ...split.map(p=>p.map(v=>[v[0]+4.000001,v[1]]))];
assert.equal(mergeLandPieces(gap).length,2,'Даже микроскопический разрыв не склеивается');
let seed=127;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(const origin of[[0,0],[5000,-5000]])for(let trial=0;trial<40;trial++){
  const C=createLandCover(),plot=[[0,0],[10,0],[10,10],[0,10]].map(p=>[p[0]+origin[0],p[1]+origin[1]]);
  for(let n=0;n<5;n++){const x=origin[0]+rand()*9,z=origin[1]+rand()*9,w=rand()*4,h=rand()*4;C.triangle(x,z,x+w,z,x,z+h);}
  const source=C.cut(plot),result=mergeLandPieces(source);
  assert.ok(Math.abs(source.reduce((s,p)=>s+area(p),0)-result.reduce((s,p)=>s+area(p),0))<1e-7,'Площадь случайных вырезов сохраняется');
  for(let n=0;n<100;n++){
    const x=origin[0]+rand()*10,z=origin[1]+rand()*10;
    assert.equal(result.filter(p=>inside(p,x,z)).length,source.filter(p=>inside(p,x,z)).length,'Нет новых отверстий, мостов или перекрытий');
  }
}
console.log('landpieces: точные общие края, сохранение площади и отверстий, отсутствие перекрытий и сдвига точек — OK');
