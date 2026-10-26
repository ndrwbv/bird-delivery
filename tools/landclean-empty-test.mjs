/* №15: пустые клетки рамок диагональных фигур не требуют Clipper.
   Сверяем полный ответ с прежним алгоритмом, а не только площадь. */
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import Clipper from 'clipper-lib';
import {createLandCover} from '../src/game/landcover.js';
import {landCleanTileRegion,cleanLandRegion,LAND_MIN_WIDTH} from '../src/game/landclean.js';
const SCALE=10000;
const path=p=>p.map(v=>({X:Math.round(v[0]*SCALE),Y:Math.round(v[1]*SCALE)}));
const polygon=p=>p.map(v=>[v.X/SCALE,v.Y/SCALE]);
const rectangle=b=>[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]];
function clip(subject,other,type){
  const c=new Clipper.Clipper(),result=[];
  c.AddPaths(subject,Clipper.PolyType.ptSubject,true);
  if(other.length)c.AddPaths(other,Clipper.PolyType.ptClip,true);
  c.Execute(type,result,Clipper.PolyFillType.pftNonZero,Clipper.PolyFillType.pftNonZero);return result;
}
// Версия до короткого пути: все операции производятся даже в пустой клетке.
function reference(cover,green,core,width=LAND_MIN_WIDTH,overlap=.005){
  const pad=width*2,bounds=[core[0]-pad,core[1]-pad,core[2]+pad,core[3]+pad],frame=[path(rectangle(bounds))];
  const paving=cover.inBox(bounds),groups=new Map();
  const paved=clip(paving.map(t=>path(t.p)),frame,Clipper.ClipType.ctIntersection),pieces=clip(frame,paved,Clipper.ClipType.ctDifference);
  for(const t of green.inBox(bounds)){let p=groups.get(t.lift);if(!p)groups.set(t.lift,p=[]);p.push(path(t.p));}
  for(const [height,paths]of groups){
    const local=clip(paths,frame,Clipper.ClipType.ctIntersection),blockers=paving.filter(t=>t.lift>=height).map(t=>path(t.p));
    pieces.push(...clip(local,blockers,Clipper.ClipType.ctDifference));
  }
  return cleanLandRegion(pieces.map(polygon),core,width,overlap);
}
const cases=[];
const add=(core,polys=[],lawns=[],width=.8,overlap=.005)=>{
  const cover=createLandCover(),green=createLandCover();
  for(const [p,h]of polys)cover.triangle(...p[0],...p[1],...p[2],h);
  for(const [p,h]of lawns)green.triangle(...p[0],...p[1],...p[2],h);
  cover.compact();green.compact();cases.push({cover,green,core,width,overlap});
};
for(const [x,z]of[[0,0],[-5120,-4096],[5000.123456789,-5000.987654321]])for(const width of[0,.1,.4,.8,1.6])for(const overlap of[0,.005]){
  const core=[x,z,x+32,z+32],pad=width*2;
  add(core,[],[],width,overlap);
  // Рамка пересекает клетку, диагональный треугольник — нет.
  add(core,[[[[x-100,z-100],[x+90,z-100],[x-100,z+90]],.1]],[],width,overlap);
  const lawns=[[[[x+1,z+1],[x+30,z+1],[x+1,z+30]],.2],[[[x+5,z+5],[x+25,z+5],[x+5,z+25]],.5]];
  add(core,[],lawns,width,overlap);
  // Точное касание, узкая полоска по краю запаса, граница округления.
  for(const e of[-.00006,-.00001,0,.00001,.00006,.01,1,3]){
    const at=x-pad+e;
    add(core,[[[[at,z-10],[at,z+50],[at-8,z+20]],.1]],lawns,width,overlap);
  }
  // Мощение и пол здания действительно внутри клетки: короткий путь запрещён.
  add(core,[[[[x+2,z+2],[x+16,z+2],[x+2,z+24]],.1],[[[x+8,z+5],[x+28,z+5],[x+8,z+28]],.5]],lawns,width,overlap);
}
let seed=193;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(let k=0;k<120;k++){
  const x=random()*12000-6000,z=random()*12000-6000,p=[];
  for(let n=0;n<3;n++)p.push([Array.from({length:3},()=>[x+random()*120-60,z+random()*120-60]),n===2?.5:.1]);
  add([x,z,x+32,z+32],p,[]);
}
for(const c of cases)assert.deepEqual(landCleanTileRegion(c.cover,c.green,c.core,c.width,c.overlap),reference(c.cover,c.green,c.core,c.width,c.overlap),'Контуры, порядок вершин и серое заполнение совпадают с прежним расчётом');
const empty=createLandCover(),green=createLandCover(),bbox=createLandCover();
bbox.triangle(-100,-100,90,-100,-100,90,.1);bbox.compact();
const sample=[empty,bbox],core=[0,0,32,32],run=f=>{const start=performance.now();for(let i=0;i<200;i++)for(const cover of sample)f(cover,green,core);return performance.now()-start;};
run(reference);run(landCleanTileRegion);
const beforeMs=run(reference),afterMs=run(landCleanTileRegion);
console.log(JSON.stringify({ok:true,cases:cases.length,beforeMs:+beforeMs.toFixed(1),afterMs:+afterMs.toFixed(1),speedup:+(beforeMs/afterMs).toFixed(2)}));
