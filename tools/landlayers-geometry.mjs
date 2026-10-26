import assert from 'node:assert/strict';
import {createLandCover} from '../src/game/landcover.js';
import {landPaintEdges,shoreLine} from '../src/game/landlayers.js';
import {landLift} from '../src/game/landheight.js';
const g=createLandCover(),rect=(x0,z0,x1,z1)=>[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
const paint=(p,h)=>{g.triangle(...p[0],...p[1],...p[3],h);g.triangle(...p[2],...p[3],...p[1],h);};
paint(rect(4,2,8,8),.1);paint(rect(6,3,9,7),.2);
const plot=rect(0,0,10,10),area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0))/2;
const bare=g.cut(plot),painted=g.inside(plot);
const visible=[...g.triangles].map(t=>({t,parts:g.cut(t.p,t.lift,u=>u.lift>t.lift||u.id>t.id)}));
assert.ok(Math.abs(visible.reduce((s,r)=>s+r.parts.reduce((n,p)=>n+area(p),0),0)-28)<1e-8,'Сами цветные газоны тоже не дублируют скрытые нижние поверхности');
for(let x=.125;x<10;x+=.25)for(let z=.125;z<10;z+=.25){
  const contains=p=>p.every((a,i)=>{const b=p[(i+1)%p.length];return(b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0])>=-1e-9;});
  const hits=visible.flatMap(r=>r.parts.filter(contains).map(()=>r.t.lift));
  if(hits.length)assert.equal(Math.max(...hits),g.height(x,z),'Видимый слой совпадает с высотой опоры');
  assert.equal(hits.length>0,g.covered(x,z),'Удаление скрытых слоёв не создаёт отверстий');
}
assert.ok(Math.abs(bare.reduce((s,p)=>s+area(p),0)+painted.reduce((s,p)=>s+area(p),0)-100)<1e-8,'Без скрытого нижнего слоя площадь открытой земли и газона сохраняется');
assert.ok(Math.abs(bare.reduce((s,p)=>s+area(p),0)-72)<1e-8,'Под окрашенным участком нет дублирующей поверхности');
const equal=createLandCover();
for(let copy=0;copy<2;copy++)for(const ids of [[0,1,2],[0,2,3]])equal.triangle(...ids.flatMap(i=>plot[i]),.1);
const equalAreas=[...equal.triangles].map(t=>equal.cut(t.p,t.lift,u=>u.lift>t.lift||u.id>t.id).reduce((s,p)=>s+area(p),0));
assert.deepEqual(equalAreas,[0,0,50,50],'Совпадающие цветные плоскости одной высоты оставляют один верхний слой без отверстий');
const mask={sides:()=>[true,true]},edges=bare.flatMap(p=>[...landPaintEdges(p,g,mask)]);
assert.ok(Math.abs(edges.reduce((s,e)=>s+Math.hypot(e.b[0]-e.a[0],e.b[1]-e.a[1]),0)-22)<1e-8,'Торцы закрывают весь внешний край окрашенной области, без внутренних диагоналей');
assert.ok(edges.every(e=>e.height===.1||e.height===.2),'Высота торца совпадает с видимым окрашенным слоем');
assert.equal(bare.flatMap(p=>[...landPaintEdges(p,g,{sides:()=>[true,false]})]).length,0,'Край мощения уже закрыт бордюром');
const pieces=shoreLine([0,0,-.4],[10,0,1.2]);assert.equal(pieces.length,3);
for(const[a,b]of pieces)for(const t of[.17,.5,.83]){
  const h=a[2]+(b[2]-a[2])*t,drawn=a[2]+landLift(a[2])+(b[2]+landLift(b[2])-a[2]-landLift(a[2]))*t;
  assert.ok(Math.abs(drawn-h-landLift(h))<1e-10,'Торец у берега совпадает с поднятой землёй внутри грани');
}
assert.deepEqual(shoreLine([0,0,2],[1,0,3]),[[[0,0,2],[1,0,3]]]);
console.log('landlayers: единая площадь без скрытого слоя, закрытые торцы, перекрытие газонов и берег — OK');
