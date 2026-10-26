/* №15: поисковая сетка маски мельче, но её область, опора и границы
   остаются прежними. Время диагностическое: без порога для разных CPU. */
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {ShapeUtils,Vector2} from '../src/vendor/three.module.min.js';
import {createLandMask} from '../src/game/landmask.js';

const triangulate=(outer,holes=[])=>({points:[...outer,...holes.flat()],triangles:ShapeUtils.triangulateShape(outer.map(p=>new Vector2(...p)),holes.map(h=>h.map(p=>new Vector2(...p))))});
const rect=(x,z,w,h)=>[[x,z],[x+w,z],[x+w,z+h],[x,z+h]];
const area=p=>{const a=p[0];let sum=0;for(let i=1;i<p.length-1;i++)sum+=(p[i][0]-a[0])*(p[i+1][1]-a[1])-(p[i][1]-a[1])*(p[i+1][0]-a[0]);return Math.abs(sum)/2;};
let seed=15;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const fallback=(x,z)=>x+z<0,fallbackBreaks=()=>[.25,.75];
const before=createLandMask(fallback,fallbackBreaks,32),after=createLandMask(fallback,fallbackBreaks);
for(let i=-8;i<8;i++)for(let j=-8;j<8;j++){
  const x=i*32,z=j*32,core=[x,z,x+32,z+32];
  for(const mask of [before,after])mask.reserve(core);
  if((i-j)%7===0)continue; // Пропущенная область использует исходную землю.
  const outer=[[x+.4,z+.6],[x+12.3,z+.6],[x+12.3,z+3.1],[x+18.6,z+3.1],[x+18.6,z+.6],[x+31.6,z+.6],[x+31.6,z+31.4],[x+.4,z+31.4]];
  const holes=[rect(x+4.2,z+9.4,6.5,12.3).reverse(),rect(x+19.1,z+8.3,8.2,17.2).reverse()];
  for(const mask of [before,after])mask.add(core,structuredClone([{outer,holes}]),triangulate);
}
before.finish();after.finish();
assert.equal(after.cells,before.cells,'Размер области не зависит от поисковой сетки');
assert.equal(after.count,before.count,'Поисковая сетка не создаёт новые грани');
assert.deepEqual(after.segments,before.segments,'Исходные внешние контуры побитно совпадают');
assert.deepEqual([...after.kept.triangles],[...before.kept.triangles],'Исходная геометрия опоры побитно совпадает');
const points=Array.from({length:6000},()=>[random()*576-288,random()*576-288]);
// Точные стороны клетки, внешний край и близость к углу.
for(let i=-8;i<8;i++)for(const e of[-1e-8,0,1e-8])points.push([i*32+e,17],[i*32+.4+e,i*32+.6]);
for(const [x,z]of points){
  assert.equal(after.cellState(x,z),before.cellState(x,z));
  assert.equal(after.contains(x,z),before.contains(x,z),'Опора совпадает, включая края и пропущенные области');
  assert.deepEqual(after.sides(x,z,.6,.8),before.sides(x,z,.6,.8),'Стороны границы совпадают');
}
const surfaces=[];
for(let i=0;i<700;i++){
  const x=random()*544-272,z=random()*544-272,w=1+random()*35,h=1+random()*35;
  const p=rect(x,z,w,h);surfaces.push(p);
  const a=[...before.parts(p)],b=[...after.parts(p)];
  assert.ok(Math.abs(a.reduce((s,p)=>s+area(p),0)-b.reduce((s,p)=>s+area(p),0))<1e-7,'Площадь видимой земли не меняется от порядка поиска');
  // Запросы через множество мелких клеток сохраняют разрезы луча.
  assert.deepEqual(after.breaks(x,z,x+w,z+h).sort((a,b)=>a-b),before.breaks(x,z,x+w,z+h).sort((a,b)=>a-b));
}
assert.deepEqual([...after.boundaries()].filter(Boolean),[...before.boundaries()].filter(Boolean),'Положение и высота всех бордюров побитно совпадают');
// Рисунок земли запрашивает половинки 16-метровых клеток рельефа;
// колёса и торцы камня — отдельные точки.
const terrain=Array.from({length:700},()=>{const x=Math.floor(random()*32-16)*16,z=Math.floor(random()*32-16)*16;return [[x,z],[x+16,z],[x,z+16]];});
for(const p of terrain){const a=[...before.parts(p)],b=[...after.parts(p)];assert.ok(Math.abs(a.reduce((s,p)=>s+area(p),0)-b.reduce((s,p)=>s+area(p),0))<1e-7);}
const run=mask=>{let n=0;for(const p of points)n+=mask.contains(...p);for(const p of terrain)n+=[...mask.parts(p)].length;return n;};
for(let i=0;i<3;i++){run(before);run(after);}
const times={before:[],after:[]};
for(let i=0;i<5;i++)for(const [name,mask]of i%2?[['after',after],['before',before]]:[['before',before],['after',after]]){
  const start=performance.now();run(mask);times[name].push(performance.now()-start);
}
const median=a=>a.sort((a,b)=>a-b)[2],oldMs=median(times.before),newMs=median(times.after);
console.log(JSON.stringify({ok:true,triangles:after.count,points:points.length,surfaces:surfaces.length,terrain:terrain.length,beforeMs:+oldMs.toFixed(1),afterMs:+newMs.toFixed(1),speedup:+(oldMs/newMs).toFixed(2)}));
