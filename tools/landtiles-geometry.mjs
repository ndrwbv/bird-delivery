import assert from 'node:assert/strict';
import {ShapeUtils,Vector2} from '../src/vendor/three.module.min.js';
globalThis.location={search:'?raisedland'};
const L=await import('../src/game/raisedland.js');
const indices=(outer,holes=[])=>ShapeUtils.triangulateShape(outer.map(p=>new Vector2(...p)),holes.map(h=>h.map(p=>new Vector2(...p))));
const triangulate=(outer,holes=[])=>({points:[...outer,...holes.flat()],triangles:indices(outer,holes)});
const rect=(x,z,X,Z)=>[[x,z],[X,z],[X,Z],[x,Z]];
const record=(p,lift,rgb,initial=false)=>{for(const f of indices(p))L.record(...p[f[0]],...p[f[1]],...p[f[2]],lift,...rgb,initial);};
record(rect(100,0,132,256),.1,[180,175,170]);
record(rect(50,20,180,200),.14,[90,150,80]);
record(rect(75,60,110,110),.2,[70,130,60]);
record(rect(165,60,200,110),.08,[190,175,120],true);
const terrain={g:16,nx:17,nz:17,x0:0,z0:0},heights=Float32Array.from({length:17*17},(_,i)=>20+(i%17)*.03+Math.floor(i/17)*.07),groundH=()=>20,skip=(x,z)=>x>=192;
const buildings=[{p:[[32,210],[155,210],[155,230],[88,230],[88,245],[32,245]]}];
const mesh=()=>{
  const triangles=[];
  const M={triangles,grad(){},color(){},
    up(...v){triangles.push([v.slice(0,3),v.slice(3,6),v.slice(6,9)]);},
    quad(...v){M.up(...v.slice(0,9));M.up(...v.slice(0,3),...v.slice(6,12));},
    poly(p,h){for(const f of indices(p))M.up(...f.flatMap(i=>[p[i][0],groundH(...p[i])+h,p[i][1]]));}
  };return M;
};
L.prepare(buildings,indices);
for(const _ of L.cleanContours({M:mesh(),terrain,groundH,skip,triangulate})){}
L.activate(skip);
const run=(M,bounds,curbed=true)=>{for(const _ of L.build({M,terrain,heights,groundH,groundHex:()=> '#888888',skip,buildings,triangulate:indices,curbed,bounds})){}return M.triangles;};
const tileMesh=mesh();
for(let z=0;z<256;z+=128)for(let x=0;x<256;x+=128)run(tileMesh,[x,z,x+128,z+128]);
assert.equal(L.ST.built,false,'Четыре нарисованных участка не объявляют весь город готовым');
assert.equal(L.ST.surfaceTiles,4);assert.ok(L.ST.paintWalls>0);assert.ok(L.ST.baseTop>0);
const afterTiles={top:L.ST.top,baseTop:L.ST.baseTop,paintWalls:L.ST.paintWalls};
const whole=run(mesh());
assert.equal(L.ST.built,true,'Прежняя полная сборка сохраняет контракт готовности');
assert.ok(L.ST.top>afterTiles.top,'Счётчик поверхностей накапливает выполненную работу');
const area=t=>Math.abs((t[1][0]-t[0][0])*(t[2][2]-t[0][2])-(t[1][2]-t[0][2])*(t[2][0]-t[0][0]))/2;
const sum=ts=>ts.reduce((n,t)=>n+area(t),0);
assert.ok(Math.abs(sum(tileMesh.triangles)-sum(whole))<1e-6,'Нет дыр или двойной площади между участками');
const height=(ts,x,z)=>{
  const hits=[];
  for(const [a,b,c]of ts){
    const det=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(det)<1e-10)continue;
    const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/det,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/det;
    if(u>=-1e-9&&v>=-1e-9&&u+v<=1+1e-9)hits.push(u*a[1]+v*b[1]+(1-u-v)*c[1]);
  }
  return hits.length?Math.max(...hits):null;
};
const compare=ts=>{
  for(let i=0;i<900;i++){
    const x=((i*1543)%25600)/100+.003,z=((i*2399)%25600)/100+.007,a=height(whole,x,z),b=height(ts,x,z);
    assert.equal(a===null,b===null,`Покрытие ${x},${z}`);if(a!==null)assert.ok(Math.abs(a-b)<1e-7,`Высота ${x},${z}: ${a} / ${b}`);
  }
};
compare(tileMesh.triangles);
// Неровный край области тоже закрыт: это нужно для последнего участка
// карты и позволяет независимо от размеров мешера ограничить поверхность.
const odd=mesh();
for(const [x,X]of [[0,100],[100,193],[193,256]])for(const[z,Z]of [[0,117],[117,256]])run(odd,[x,z,X,Z]);
assert.ok(Math.abs(sum(odd.triangles)-sum(whole))<1e-6);compare(odd.triangles);
for(const t of run(mesh(),[100,117,193,256]))for(const p of t){assert.ok(p[0]>=100-1e-7&&p[0]<=193+1e-7);assert.ok(p[2]>=117-1e-7&&p[2]<=256+1e-7);}
assert.throws(()=>run(mesh(),[1,1,0,0]),/границы/);
console.log('landtiles: цветные слои, площадки, пол зданий и дальняя земля совпадают целиком и по участкам; швы закрыты; счётчики суммируются — OK');
