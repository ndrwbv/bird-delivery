import assert from 'node:assert/strict';
import {ShapeUtils,Vector2} from '../src/vendor/three.module.min.js';
globalThis.location={search:'?raisedland'};
const indices=(outer,holes=[])=>ShapeUtils.triangulateShape(outer.map(p=>new Vector2(...p)),holes.map(h=>h.map(p=>new Vector2(...p))));
const triangulate=(outer,holes=[])=>({points:[...outer,...holes.flat()],triangles:indices(outer,holes)});
const rect=(x,z,X,Z)=>[[x,z],[X,z],[X,Z],[x,Z]];
const terrain={g:8,nx:17,nz:17,x0:0,z0:0},groundH=(x,z)=>20+x*.01+z*.02;
const heights=Float32Array.from({length:17*17},(_,i)=>groundH(i%17*8,Math.floor(i/17)*8));
const buildings=[{p:rect(85,85,102,105)}];
const mesh=()=>{
  const triangles=[];let gradient=null,color=[0,0,0];
  const M={triangles,
    grad(g){gradient=g;},color(hex){const n=parseInt(hex.slice(1),16);color=[n>>16,n>>8&255,n&255];},
    up(...v){
      const points=[v.slice(0,3),v.slice(3,6),v.slice(6,9)],colors=points.map(p=>{const c=[...color];gradient?.(p[0],p[2],c,0);return c;});
      triangles.push({points,colors});
    },quad(...v){M.up(...v.slice(0,9));M.up(...v.slice(0,3),...v.slice(6,12));},
    poly(p,h){for(const f of indices(p))M.up(...f.flatMap(i=>[p[i][0],groundH(...p[i])+h,p[i][1]]));},
  };return M;
};
const run=async (deferDraw,tiles=false)=>{
  const L=await import('../src/game/raisedland.js?defer-test='+deferDraw+'&tiles='+tiles);
  const record=(p,h,rgb,initial=false)=>{for(const f of indices(p))L.record(...p[f[0]],...p[f[1]],...p[f[2]],h,...rgb,initial);};
  // Две узкие зелёные щели должны заполниться соседним мощением.
  record(rect(0,0,31.8,64),.085,[180,175,170]);
  record(rect(32.2,0,64,64),.11,[160,155,150]);
  record(rect(0,64.3,64,80),.13,[170,150,140]);
  record(rect(27,20,37,30),.15,[80,150,70]);
  record(rect(70,15,98,55),.08,[190,175,120],true);
  L.prepare(buildings,indices);
  const initialBefore=L.cover.inBox([0,0,128,128]).filter(t=>t.initial).length;
  const cleaned=mesh();for(const _ of L.cleanContours({M:cleaned,terrain,groundH,triangulate,deferDraw})){}
  L.activate();
  assert.ok(L.ST.fillTriangles>0,'В проверке действительно есть заполненные щели');
  if(deferDraw){
    assert.equal(cleaned.triangles.length,0,'Очистка не рисует ни одного отложенного треугольника');
    assert.equal(L.ST.fillDraw,0);
    assert.equal([...L.cover.initialTriangles].length,initialBefore+L.ST.fillTriangles,'Все заполнения и песок сохраняются для отложенной отрисовки');
  }else assert.ok(cleaned.triangles.length>0);
  const drawn=mesh();
  const bounds=tiles?[[0,0,64,64],[64,0,128,64],[0,64,64,128],[64,64,128,128]]:[null];
  for(const region of bounds)for(const _ of L.build({M:drawn,terrain,heights,groundH,groundHex:()=> '#829867',buildings,triangulate:indices,curbed:true,bounds:region})){}
  return {L,triangles:[...cleaned.triangles,...drawn.triangles],cleaned:cleaned.triangles};
};
const immediate=await run(false),deferred=await run(true);
const geometry=L=>[...L.cover.triangles].map(({p,lift,rgb})=>({p,lift,rgb}));
assert.deepEqual(geometry(immediate.L),geometry(deferred.L),'Все опорные покрытия, высоты и цвета совпадают побитно');
assert.deepEqual(immediate.L.finalMask.segments,deferred.L.finalMask.segments);
assert.equal(immediate.L.ST.fillTriangles,deferred.L.ST.fillTriangles);
assert.equal(immediate.L.ST.cleanedArea,deferred.L.ST.cleanedArea);
const area=({points:[a,b,c]})=>Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))/2;
const byColor=ts=>{
  const totals=new Map();
  for(const t of ts){assert.deepEqual(t.colors[0],t.colors[1]);assert.deepEqual(t.colors[0],t.colors[2]);const k=t.colors[0].join(',');totals.set(k,(totals.get(k)||0)+area(t));}
  return totals;
};
const before=byColor(immediate.triangles),after=byColor(deferred.triangles);
assert.deepEqual([...before.keys()].sort(),[...after.keys()].sort());
for(const[k,a]of before)assert.ok(Math.abs(a-after.get(k))<1e-6,`Площадь цвета ${k} совпадает: ${a}/${after.get(k)}`);
const visible=(ts,x,z)=>{
  let best=null;
  for(const t of ts){
    const[a,b,c]=t.points,det=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(det)<1e-10)continue;
    const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/det,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/det;
    if(u<-1e-9||v<-1e-9||u+v>1+1e-9)continue;
    const y=u*a[1]+v*b[1]+(1-u-v)*c[1];if(!best||y>best.y+1e-8)best={y,rgb:t.colors[0]};
  }
  return best;
};
const points=[];
for(let i=0;i<700;i++)points.push([((i*1543)%12800)/100+.003,((i*2399)%12800)/100+.007]);
// Дополнительно попадаем непосредственно внутрь каждой заполненной щели.
for(const t of immediate.cleaned)points.push([t.points.reduce((s,p)=>s+p[0],0)/3,t.points.reduce((s,p)=>s+p[2],0)/3]);
for(const[x,z]of points){
  assert.equal(immediate.L.onLand(x,z),deferred.L.onLand(x,z));
  const a=visible(immediate.triangles,x,z),b=visible(deferred.triangles,x,z);assert.equal(!!a,!!b);
  if(a){assert.ok(Math.abs(a.y-b.y)<1e-7);assert.deepEqual(a.rgb,b.rgb);}
}
const streamed=await run(true,true),tileAreas=byColor(streamed.triangles);
for(const[k,a]of before)assert.ok(Math.abs(a-tileAreas.get(k))<1e-6,`Площадь цвета ${k} совпадает при загрузке участками`);
for(const[x,z]of points){
  const a=visible(immediate.triangles,x,z),b=visible(streamed.triangles,x,z);assert.equal(!!a,!!b);
  if(a){assert.ok(Math.abs(a.y-b.y)<1e-7);assert.deepEqual(a.rgb,b.rgb);}
}
console.log(`landfill deferred: ${immediate.L.ST.fillTriangles} заполнений сохраняют опору, площадь, цвет и высоту; песок остаётся, двойной отрисовки нет — OK`);
