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
