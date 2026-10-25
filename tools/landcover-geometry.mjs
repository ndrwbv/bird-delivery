import assert from 'node:assert/strict';
import {createLandCover} from '../src/game/landcover.js';
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0))/2;
const sum=ps=>ps.reduce((s,p)=>s+area(p),0);
const rect=(C,x,z,w,h,lift=0)=>{C.triangle(x,z,x+w,z,x+w,z+h,lift);C.triangle(x,z,x+w,z+h,x,z+h,lift);};
const square=[[0,0],[10,0],[10,10],[0,10]];
for(const reverse of [false,true]){
  const C=createLandCover(4);rect(C,2,2,6,6,.1);
  assert.ok(Math.abs(sum(C.cut(reverse?square.slice().reverse():square))-64)<1e-6);
  assert.equal(C.height(5,5),.1);assert.equal(C.covered(1,1),false);
  assert.equal(C.covered(2,2),true);assert.equal(C.covered(8,8),true);
  for(const part of C.cut(square)){
    const x=part.reduce((s,p)=>s+p[0],0)/part.length,z=part.reduce((s,p)=>s+p[1],0)/part.length;
    assert.equal(C.covered(x,z),false,'Оставшаяся земля не должна перекрывать мощёное');
  }
  // Повторные и перекрывающиеся покрытия — единое отверстие, не повторное вычитание площади.
  rect(C,2,2,6,6,.2);rect(C,5,0,3,10,.1);
  assert.ok(Math.abs(sum(C.cut(square))-52)<1e-6);assert.equal(C.height(5,5),.2);
}
{
  const C=createLandCover(4);rect(C,-4,-4,4,4);rect(C,0,-4,4,4);
  assert.equal(C.covered(0,-2),true,'Общий шов не оставляет щели');
  assert.ok(Math.abs(sum(C.cut([[-8,-8],[8,-8],[8,8],[-8,8]]))-224)<1e-6);
  C.triangle(0,0,1,1,2,2);assert.equal(C.count,4,'Нулевые треугольники не становятся покрытием');
  C.clear();assert.equal(C.covered(0,-2),false);
}
{
  const C=createLandCover();rect(C,-100,-100,200,200);
  assert.deepEqual(C.cut(square),[]);assert.deepEqual(C.cut([[101,101],[102,101],[101,102]]),[[[101,101],[102,101],[101,102]]]);
}
console.log('landcover: отверстия, перекрытия, общие швы, оба обхода и отрицательные клетки — проверены');
// Независимая проверка по лучу: каждый оставшийся участок принадлежит ровно
// одной части земли, а объединение мощёного не перекрывается ни одной частью.
const inside=(p,x,z)=>{
  let on=false;
  for(let i=0,j=p.length-1;i<p.length;j=i++){
    const a=p[i],b=p[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])on=!on;
  }
  return on;
};
let seed=18;
const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(const origin of [[0,0],[4123,-5071]])for(let trial=0;trial<12;trial++){
  const tris=Array.from({length:5},()=>Array.from({length:3},()=>[origin[0]+rand()*12-1,origin[1]+rand()*12-1]));
  const C=createLandCover(4),D=createLandCover(4);
  for(const t of tris)C.triangle(...t.flat());
  for(const t of tris.slice().reverse())D.triangle(...t.slice().reverse().flat());
  const p=square.map(q=>[q[0]+origin[0],q[1]+origin[1]]),parts=C.cut(p);
  assert.ok(Math.abs(sum(parts)-sum(D.cut(p)))<1e-5,'Площадь не зависит от порядка наложения и обхода');
  for(const part of parts)for(const q of part)assert.ok(q[0]>=origin[0]-1e-7&&q[0]<=origin[0]+10+1e-7&&q[1]>=origin[1]-1e-7&&q[1]<=origin[1]+10+1e-7);
  for(let i=0;i<100;i++){
    const x=origin[0]+rand()*10,z=origin[1]+rand()*10,covered=tris.some(t=>inside(t,x,z));
    assert.equal(C.covered(x,z),covered);
    assert.equal(parts.filter(q=>inside(q,x,z)).length,covered?0:1,'В земле нет перекрытий или потерянных областей');
  }
}
console.log('landcover: случайные пересечения и координаты карты — 2400 независимых точек');
