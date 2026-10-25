// Geometric invariants of the soft-city roof builder, independent of rendering.
import assert from 'node:assert/strict';
import CITY from '../src/maps/seversk/city-data.js';
import { corners, roofRim, flatRoof, pitchedRoof, lawnEdge, inside } from '../src/game/softcity.js';
const area = p => p.reduce((s,a,i) => { const b=p[(i+1)%p.length]; return s+a[0]*b[1]-b[0]*a[1]; },0)/2;
const shapes = [ [[0,0],[12,0],[12,8],[0,8]], [[0,0],[12,0],[12,4],[4,4],[4,12],[0,12]], [[0,0],[8,0],[8,8],[5,8],[5,3],[3,3],[3,8],[0,8]] ];
let roofs=0;
for(const shape of shapes) for(const p of [shape,shape.slice().reverse()]) {
  const saved=JSON.stringify(p), c=corners(p,area(p)>0), r=roofRim(p,c,area(p)>0);
  assert(r, 'Valid roomy polygon must have a rim');
  assert.equal(JSON.stringify(p),saved,'Must not change map outline');
  for(const v of r.inner) assert(inside(p,v));
  assert(Math.abs(area(r.inner))<Math.abs(area(r.outer)));
  const faces=[], M={up:(...v)=>faces.push(v),poly:(ring,y)=>{assert.equal(ring,r.inner);assert.equal(y,10);}};
  flatRoof(M,r,10);
  assert.equal(faces.length,r.outer.length*2);
  for(const f of faces) for(let i=0;i<f.length;i+=3) {assert(f.slice(i,i+3).every(Number.isFinite));assert(f[i+1]>=9.92&&f[i+1]<=10);}
  roofs++;
}
assert.equal(roofRim([[0,0],[5,0],[5,.1],[0,.1]],null,true),null,'Narrow roof must fall back, not invert');
assert.equal(corners(shapes[0],true,new Set([0]))[0],null,'Opening guard must keep corner');
for(const hipped of [false,true]) {
  const tris=[];
  const M={color(){},quad:(a,b,c,d,e,f,g,h,i,j,k,l)=>{tris.push([a,b,c,d,e,f,g,h,i],[a,b,c,g,h,i,j,k,l]);},tri:(...v)=>tris.push(v)};
  pitchedRoof(M,[[0,0],[12,0],[12,8],[0,8]],hipped?[[3,4],[9,4]]:[[0,4],[12,4]],[0,1],10,13,4,'#555555','#cccccc',hipped);
  const edges=new Map();
  for(const t of tris){ assert(t.every(Number.isFinite));for(let i=0;i<3;i++){const a=t.slice(i*3,i*3+3).map(x=>x.toFixed(7)).join(','),b=t.slice((i+1)%3*3,(i+1)%3*3+3).map(x=>x.toFixed(7)).join(',');const k=[a,b].sort().join('|');edges.set(k,(edges.get(k)||0)+1);}}
  // Only the four eaves are open: no holes in the ridge or either end.
  assert.equal([...edges.values()].filter(n=>n===1).length,4);
  assert([...edges.values()].every(n=>n<=2));
}
let gradient=null;const samples=[];
lawnEdge({grad(fn){gradient=fn;},quad(){for(const [x,z] of [[0,0],[10,0],[0,1],[10,1]]){const c=[];gradient(x,z,c,0);samples.push(c);}}},[0,0],[10,0],[0,1],[10,1],.2,.2,0,0);
assert.equal(gradient,null,'Gradient must not leak into next object');
assert.deepEqual(samples[2],samples[3],'Far edge must match unchanged grass');
console.log(`OK: ${roofs} roof outlines, both windings, narrow fallback, guarded opening, watertight ridges, grass continuity`);

let mapRoofs=0, fallback=0;
for(const b of CITY.buildings){const p=b.p, positive=area(p)>0, r=roofRim(p,corners(p,positive),positive);if(!r){fallback++;continue;}mapRoofs++;for(const q of [...r.inner,...r.outer]) assert(inside(p,q),`Roof outside building ${b.id}`);}
console.log(`Map: ${mapRoofs} valid outlines, ${fallback} safe fallbacks, no roof outside original footprint`);

const { outline, prepare, endOutline, endRibbon, contains, roadSeam } = await import('../src/game/softsurfaces.js');
const { boxPositions } = await import('../src/game/softcity.js');
const rectangle = [[0,0],[10,0],[10,8],[0,8]], rounded=outline(rectangle);
assert(rounded.soft);assert.equal(rounded.original,rectangle);
assert(rounded.every(p=>inside(rectangle,p)));assert(!contains(rounded,0,0));assert(contains(rounded,0,0,.3));
assert(contains(rounded,5,4));
const city={lots:[{k:'park',p:rectangle}],green:[{k:'play',p:rectangle}],roads:[]};
prepare(city,()=>false);
for(const item of [...city.lots,...city.green]) {assert.equal(item.p,rectangle,'Layout outline must remain unchanged');assert(item.softP.soft,'Paving and curbs need a shared rounded outline');}
let roadOutline; endRibbon({poly(p){roadOutline=p;}},[0,0],[10,0],4,.1,false,true);
const cap=endOutline([10,0],[0,0],4);
for(const p of cap.filter(p=>p[0]>9)) assert(roadOutline.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<1e-8),'Cap and pavement disagree');
const pin=outline(rectangle,.65,new Set([0,1]));assert.deepEqual(pin.slice(0,2),rectangle.slice(0,2),'Entrance must stay open and square');
for(const dims of [[1,2,3],[.12,5,1],[8,.2,4]]) {
  const pos=boxPositions(...dims),edges=new Map();assert.equal(pos.length,44*9);
  for(let k=0;k<pos.length;k+=9){const p=Array.from(pos.slice(k,k+9));for(let i=0;i<9;i++)assert(Math.abs(p[i])<=dims[i%3]/2+1e-6);
    const u=p.slice(3,6).map((v,i)=>v-p[i]),v=p.slice(6,9).map((v,i)=>v-p[i]);const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    assert(n.reduce((s,x,i)=>s+x*p[i],0)>0,'Box face points inward');
    for(let i=0;i<3;i++){const a=p.slice(i*3,i*3+3).map(v=>v.toFixed(6)).join(','),b=p.slice((i+1)%3*3,(i+1)%3*3+3).map(v=>v.toFixed(6)).join(',');const key=[a,b].sort().join('|');edges.set(key,(edges.get(key)||0)+1);}}
  assert([...edges.values()].every(n=>n===2),'Box must be closed');
}
assert.equal(boxPositions(.04,1,2),null,'Thin details stay intact');
let grad=null;let roadArea=0;let seenTint=false;
const seamMesher={grad(fn){grad=fn;},dtri(ax,az,bx,bz,cx,cz,y){roadArea+=Math.abs((bx-ax)*(cz-az)-(bz-az)*(cx-ax))/2;assert.equal(y,.15);if(grad){const col=[];grad(15,3,col,0);assert(col.every(Number.isFinite));seenTint ||= col[0]>40;}}};
roadSeam(seamMesher,[0,0],[30,0],null,null,3,.15,'#606060','#cccccc',null);
assert(Math.abs(roadArea-180)<1e-7,'Seam leaves a hole or adds overlapping area');assert.equal(grad,null);assert(seenTint);
console.log('OK: shared cap outline, parking entrance, rounded-box bounds/winding/manifold, road seam coverage and reset');
