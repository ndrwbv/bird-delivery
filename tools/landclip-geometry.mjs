import assert from 'node:assert/strict';
import {clippedMesher} from '../src/game/landclip.js';
globalThis.location={search:'?curbtrace'};
const C=await import('../src/game/curbs.js');
const mesh=()=>{
  const triangles=[],calls=[];let color;
  const M={triangles,calls,color(c){color=c;},
    tri(...v){triangles.push({p:[v.slice(0,3),v.slice(3,6),v.slice(6,9)],color,normal:v.slice(9)});calls.push(['tri',...v]);},
    up(...v){calls.push(['up',...v]);triangles.push({p:[v.slice(0,3),v.slice(3,6),v.slice(6,9)],color,normal:[0,1,0]});},
    quad(...v){calls.push(['quad',...v]);triangles.push({p:[v.slice(0,3),v.slice(3,6),v.slice(6,9)],color,normal:v.slice(12)},{p:[v.slice(0,3),v.slice(6,9),v.slice(9,12)],color,normal:v.slice(12)});},
  };return M;
};
const normal=([a,b,c])=>{const u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);return [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];};
const area=t=>Math.hypot(...normal(t.p))/2,sum=ts=>ts.reduce((n,t)=>n+area(t),0);
// Не меняем исходные вызовы, когда геометрия целиком в участке.
const direct=mesh(),wrapped=mesh(),clip=clippedMesher(wrapped,[-10,-10,10,10]);
for(const M of[direct,clip]){
  M.color('#abc');M.up(0,2,0,1,2,0,0,3,1);
  M.quad(0,0,0,2,0,0,2,4,2,0,2,2,0,1,0);
}
assert.deepEqual(wrapped.calls,direct.calls);assert.deepEqual(wrapped.triangles,direct.triangles);
// Неплоская четвёрка, наклонный треугольник, вертикальный торец
// прямо на границе и обратный обход: каждый кусок остаётся на плоскости
// своего исходного треугольника, а не заново натягивается на весь полигон.
const geometry=M=>{
  M.color('#123');M.quad(-4,0,-4,6,1,-4,6,4,6,-4,2,6);
  M.color('#456');M.up(-3,5,1,4,7,-3,5,6,5);
  M.color('#789');M.quad(1,0,-3,1,3,-3,1,4,5,1,0,5,1,0,0);
  M.color('#fed');M.tri(5,3,5,-3,1,4,2,0,-3);
};
const full=mesh();geometry(full);
const tiled=mesh();
for(const [x,X]of [[-10,1],[1,10]])for(const[z,Z]of [[-10,2],[2,10]])geometry(clippedMesher(tiled,[x,z,X,Z]));
assert.ok(Math.abs(sum(tiled.triangles)-sum(full.triangles))<1e-9,'Суммарная площадь в 3D сохранена, в том числе на вертикальном шве');
for(const t of tiled.triangles){
  const center=t.p[0].map((v,i)=>(v+t.p[1][i]+t.p[2][i])/3);
  assert.ok(full.triangles.some(orig=>{
    if(orig.color!==t.color)return false;
    const n=normal(orig.p),len=Math.hypot(...n),dot=p=>p.reduce((s,v,i)=>s+(v-orig.p[0][i])*n[i],0)/len;
    if(t.p.some(p=>Math.abs(dot(p))>1e-9))return false;
    const nt=normal(t.p);if(n.reduce((s,v,i)=>s+v*nt[i],0)<=0)return false;
    // Центр должен остаться внутри своего исходного треугольника.
    const k=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs))),axis=[0,1,2].filter(i=>i!==k),p=orig.p.map(v=>axis.map(i=>v[i])),q=axis.map(i=>center[i]);
    const turns=p.map((a,i)=>{const b=p[(i+1)%3];return(b[0]-a[0])*(q[1]-a[1])-(b[1]-a[1])*(q[0]-a[0]);});
    return turns.every(v=>v>=-1e-9)||turns.every(v=>v<=1e-9);
  }),'Обход, цвет и плоскость каждого отрезанного треугольника сохранены');
}
const wall=mesh();clippedMesher(wall,[0,0,1,1]).quad(1,0,0,1,1,0,1,1,1,1,0,1);assert.equal(wall.triangles.length,0);
clippedMesher(wall,[0,0,1,1],{includeMaxX:true,includeMaxZ:true}).quad(1,0,0,1,1,0,1,1,1,1,0,1);assert.equal(wall.triangles.length,2);
assert.throws(()=>clippedMesher(mesh(),[1,0,0,1]),/границы/);

const ring=[[0,0],[10,0],[10,10],[0,10]],edges=ring.map((a,i)=>({a,b:ring[(i+1)%ring.length],lift:.085}));
const api=M=>({LITM:M,contours:()=>edges,groundH:(x,z)=>20+x*.03+z*.05,landTopAt:()=>.46});
const old=mesh();for(const _ of C.build({...api(old),rebuild:true})){}
const saved={api:C.DEBUG.api,segs:C.DEBUG.segs,cells:C.DEBUG.cells,trace:[...C.DEBUG.trace],topology:JSON.stringify(C.DEBUG.traceTopology),berm:C.DEBUG.berm,bumps:{...C.DEBUG.BS},runs:C.ST.runs};
const streamed=mesh();
for(const[x,X]of [[-1,5],[5,11]])for(const[z,Z]of [[-1,5],[5,11]]){
  for(const _ of C.build({...api(clippedMesher(streamed,[x,z,X,Z])),visualOnly:true,rebuild:true})){}
}
assert.ok(Math.abs(sum(streamed.triangles)-sum(old.triangles))<1e-8,'Рисунок замкнутых углов совпадает после потоковой сборки');
assert.strictEqual(C.DEBUG.api,saved.api);assert.strictEqual(C.DEBUG.segs,saved.segs);assert.equal(C.DEBUG.cells,saved.cells);
assert.deepEqual(C.DEBUG.trace,saved.trace);assert.equal(JSON.stringify(C.DEBUG.traceTopology),saved.topology);
assert.equal(C.DEBUG.berm,saved.berm);assert.deepEqual(C.DEBUG.BS,saved.bumps);assert.ok(C.ST.runs>saved.runs);
assert.equal(C.near(4,-.03,.2),true,'Существующий индекс камня остаётся включённым');
assert.throws(()=>[...C.build({visualOnly:true})],/контур/);
console.log('landclip: грани и углы без дыр и дублей, высота/цвет/обход сохранены; потоковый рисунок не меняет общую опору и журнал — OK');
