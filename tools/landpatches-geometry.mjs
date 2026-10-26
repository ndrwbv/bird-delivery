import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ShapeUtils,Vector2} from '../src/vendor/three.module.min.js';
import {createLandCover} from '../src/game/landcover.js';
import {mergeLandPieces} from '../src/game/landpieces.js';
import {landSurfacePieces} from '../src/game/landpatches.js';
const triangulate=(outer,holes)=>({points:[...outer,...holes.flat()],triangles:ShapeUtils.triangulateShape(outer.map(p=>new Vector2(...p)),holes.map(h=>h.map(p=>new Vector2(...p))))});
const area=p=>{const a=p[0];let s=0;for(let i=1;i<p.length-1;i++)s+=(p[i][0]-a[0])*(p[i+1][1]-a[1])-(p[i][1]-a[1])*(p[i+1][0]-a[0]);return Math.abs(s)/2;};
const contains=(p,x,z)=>p.every((a,i)=>{const b=p[(i+1)%p.length];return (b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0])>=-1e-10;});
const covered=(parts,x,z)=>parts.some(p=>contains(p,x,z));
const triangleCount=parts=>parts.reduce((s,p)=>s+p.length-2,0);
const square=(x,z,w,h=w)=>[[x,z],[x+w,z],[x+w,z+h],[x,z+h]];
const split=p=>[[p[0],p[1],p[2]],[p[0],p[2],p[3]]];
for(const [ox,oz]of[[0,0],[5120,-5120],[-5120,5120]]){
  const parts=[];
  for(let x=0;x<20;x++)for(let z=0;z<20;z++){
    if(x>=7&&x<12&&z>=8&&z<13)continue;
    parts.push(...split(square(ox+x,oz+z,1)));
  }
  const before=structuredClone(parts),out=landSurfacePieces(parts,triangulate);
  assert.deepEqual(parts,before,'Исходные фигуры не меняются');
  assert.ok(triangleCount(out)<20,'Уходит внутреннее дробление, в том числе больше 128 частей');
  assert.ok(Math.abs(out.reduce((s,p)=>s+area(p),0)-375)<1e-8,'Отверстие сохраняет площадь');
  for(let x=.13;x<20;x+=.41)for(let z=.27;z<20;z+=.39)assert.equal(covered(out,ox+x,oz+z),covered(parts,ox+x,oz+z),'Сохранены внешняя граница и отверстие');
  const gap=1e-6,apart=[...parts,...parts.map(p=>p.map(v=>[v[0]+20+gap,v[1]]))],joined=landSurfacePieces(apart,triangulate);
  assert.equal(covered(joined,ox+20+gap/2,oz+.5),false,'Микроскопический зазор не становится мостиком');
  for(const p of out)for(const v of p)assert.ok(parts.some(q=>q.some(w=>v===w)),'Без пересечений внешние вершины взяты из исходных, без округления');
}
let seed=731;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(const shift of[0,5120,-5120])for(let trial=0;trial<120;trial++){
  const C=createLandCover();
  for(let i=0;i<7;i++){const x=shift+random()*9,z=shift+random()*9,w=.1+random()*4,h=.1+random()*4;C.triangle(x,z,x+w,z,x,z+h);}
  const parts=mergeLandPieces(C.cut(square(shift,shift,12))),out=landSurfacePieces(parts,triangulate);
  assert.ok(triangleCount(out)<=triangleCount(parts),'Представление не становится тяжелее');
  assert.ok(Math.abs(parts.reduce((s,p)=>s+area(p),0)-out.reduce((s,p)=>s+area(p),0))<2e-6,'Площадь случайных вырезов сохранена');
  for(let n=0;n<200;n++){const x=shift+random()*12,z=shift+random()*12;assert.equal(covered(out,x,z),covered(parts,x,z),'Нет новых отверстий, мостов и закрытых вырезов');}
}
const real=JSON.parse(fs.readFileSync(new URL('./fixtures/land-surface-hole.json',import.meta.url)));
const result=landSurfacePieces(real,triangulate);
assert.notEqual(result,real,'Случай из города действительно объединяется');
assert.ok(Math.abs(real.reduce((s,p)=>s+area(p),0)-result.reduce((s,p)=>s+area(p),0))<1e-7,'Почти совпавшие края не заставляют Earcut перекрыть отверстие');
const xs=real.flat().map(p=>p[0]),zs=real.flat().map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);
for(let i=0;i<150;i++)for(let j=0;j<150;j++){const x=x0+(x1-x0)*(i+.37)/150,z=z0+(z1-z0)*(j+.29)/150;assert.equal(covered(result,x,z),covered(real,x,z),'Реальный участок сохраняет покрытие по плотной независимой сетке');}
console.log('landpatches: внешние точки, отверстия, зазоры, ±5 км, случайные вырезы и реальное потерянное отверстие — OK');
