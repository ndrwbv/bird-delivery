import assert from 'node:assert/strict';
import {createLandCover,intersectTriangle} from '../src/game/landcover.js';
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
for(let i=0;i<80;i++){
  const t=Array.from({length:3},()=>[rand()*14-2,rand()*14-2]),C=createLandCover();
  C.triangle(...t.flat());
  const cut=C.cut(square),intersection=intersectTriangle(square,i%2?t.slice().reverse():t);
  assert.ok(Math.abs(sum(cut)+area(intersection)-100)<1e-7,'Части исходной сетки и их вырезы покрывают её полностью');
}
console.log('landcover: пересечение с исходной сеткой — без потерянной площади');
{
  const C=createLandCover(4);rect(C,2,2,2,6);rect(C,4.02,2,3.98,6);
  const points=C.breaks(0,5,10,5).sort((a,b)=>a-b);
  assert.ok(points.every(Number.isFinite));
  const gap=points.some((a,i)=>i&&Math.abs(points[i-1]-.4)<1e-9&&Math.abs(a-.402)<1e-9);
  assert.ok(gap,'Двухсантиметровый разрыв найден точно, без шагового пропуска');
  for(let i=1;i<points.length;i++)if(points[i]-points[i-1]>1e-9){
    const x=(points[i]+points[i-1])*5;
    assert.equal(C.covered(x,5),(x>=2&&x<=4)||(x>=4.02&&x<=8));
  }
}
console.log('landcover: точные интервалы для бордюров, включая узкие разрывы');
{
  const C=createLandCover(4);rect(C,2,2,6,6,.2);
  C.triangles[0].rgb=[17,81,139];C.triangles[0].initial=true;
  const points=Array.from({length:400},()=>[rand()*12-1,rand()*12-1]);
  const snapshot=points.map(p=>C.height(...p)),before=sum(C.cut(square)),breaks=C.breaks(0,5,10,5).sort((a,b)=>a-b);
  C.compact();
  assert.deepEqual(points.map(p=>C.height(...p)),snapshot,'Сжатый контур сохраняет все запросы высоты');
  assert.equal(sum(C.cut(square)),before);assert.deepEqual(C.breaks(0,5,10,5).sort((a,b)=>a-b),breaks);
  assert.deepEqual([...C.triangles][0].rgb,[17,81,139]);assert.equal([...C.triangles][0].initial,true);
  rect(C,0,0,1,1,.3);assert.equal(C.height(.5,.5),.3);assert.equal(C.count,4);
  C.compact();assert.equal(C.height(.5,.5),.3);assert.equal(C.height(5,5),.2);
  assert.ok(Math.abs(sum(C.cut(square))-63)<1e-8);
  C.clear();rect(C,-1,-1,2,2,.4);C.compact();assert.equal(C.count,2);assert.equal(C.height(0,0),.4);
}
console.log('landcover: компактное хранение сохраняет геометрию, высоты, цвет и последующие добавления');
{
  const C=createLandCover();C.triangle(8,8,12,8,8,12);
  const p=[[0,0],[10,0],[0,10]];
  assert.deepEqual(C.cut(p),[p],'Чужое покрытие не дробит землю из-за пересечения одних только рамок');
  C.compact();assert.deepEqual(C.cut(p),[p]);
}
console.log('landcover: непересекающиеся покрытия оставляют землю цельной');
{
  const C=createLandCover(),n=33001;
  for(let i=0;i<n;i++){
    const x=i%256*2,z=Math.floor(i/256)*2,t=C.triangle(x,z,x+1,z,x,z+1,i/100000);
    t.rgb=[i%256,81,139];t.initial=i%3===0;if(i%4000===3999)C.compact();
  }
  C.compact();assert.equal(C.count,n);assert.ok(C.storageBytes<n*92*.8,'Упаковка действительно сокращает объём новых контуров');
  const ids=[0,3999,4000,16383,16384,32767,32768,33000],found=new Map();
  for(const t of C.triangles)if(ids.includes(t.id))found.set(t.id,t);
  for(const id of ids){
    const x=id%256*2,z=Math.floor(id/256)*2,t=found.get(id);
    assert.equal(C.height(x+.2,z+.2),id/100000,'Высота точна после дополнения частичного блока');
    assert.deepEqual(t.p,[[x,z],[x+1,z],[x,z+1]]);assert.deepEqual(t.rgb,[id%256,81,139]);assert.equal(t.initial,id%3===0);
    assert.ok(C.inBox([x+.1,z+.1,x+.3,z+.3]).some(t=>t.id===id),'Индекс клетки сохраняет границы блоков');
  }
  C.clear();C.triangle(-0,-0,1,0,0,1,-0);C.triangle(3,0,4,0,3,1,0);C.compact();
  assert.ok(Object.is(C.height(.1,.1),-0)&&Object.is(C.height(3.1,.1),0),'Палитра не округляет высоты и различает знаковый ноль');
  assert.ok(Object.is([...C.triangles][0].p[0][0],-0));assert.equal(C.count,2);
}
console.log('landcover: индексы общих вершин, точная палитра высот и несколько дополняемых блоков — проверены');
{
  const C=createLandCover(),wanted=[];
  for(let i=0;i<321;i++){
    const t=C.triangle(i*2,0,i*2+1,0,i*2,1,i/10000);t.rgb=[i&255,i>>8,17];t.initial=i%5===0;
    if(t.initial)wanted.push(i);
    if(i%64===63)C.compact();
  }
  for(const compact of[false,true]){
    if(compact)C.compact();C.clearReadCache();
    assert.deepEqual([...C.initialTriangles].map(t=>t.id),wanted,'Выбор исходных площадок сохраняет порядок в упакованной и сырой части');
    for(const t of C.triangles){assert.equal(t.lift,t.id/10000);assert.deepEqual(t.rgb,[t.id&255,t.id>>8,17]);assert.equal(t.initial,t.id%5===0);}
  }
  C.clear();assert.deepEqual([...C.initialTriangles],[]);
}
console.log('landcover: переход палитр через 256 значений, очистка временного чтения и прямой обход площадок — проверены');
{
  const target=createLandCover(),source=createLandCover(),reference=createLandCover();
  const add=(C,i,base=false)=>{const x=base?i*2:i%128*2,z=base?0:Math.floor(i/128)*2,t=C.triangle(x,z,x+1,z,x,z+1,base ? .1 : .2+(i%7)/100);t.rgb=[i&255,71,141];t.initial=i%10===0;};
  for(let i=0;i<17;i++){add(target,i,true);add(reference,i,true);}
  for(let i=0;i<35000;i++){add(source,i);add(reference,i);if(i%4000===3999)source.compact();}
  target.absorb(source);assert.equal(source.count,0);assert.equal(target.count,35017);
  for(const C of[target,reference])C.triangle(800,0,801,0,800,1,.31);
  target.compact();source.triangle(900,0,901,0,900,1,-0);reference.triangle(900,0,901,0,900,1,-0);target.absorb(source);reference.compact();
  assert.equal(target.count,35019);assert.equal(source.count,0);
  const expected=reference.triangles[Symbol.iterator]();
  for(const t of target.triangles){const r=expected.next().value;assert.deepEqual(t.p,r.p);assert.ok(Object.is(t.lift,r.lift));assert.deepEqual(t.rgb,r.rgb);assert.equal(t.initial,r.initial);}
  assert.equal(expected.next().done,true);
  assert.deepEqual([...target.initialTriangles].map(t=>t.p),[...reference.initialTriangles].map(t=>t.p));
  for(let i=0;i<100;i++){const x=i%128*2+.2,z=Math.floor(i/128)*2+.2;assert.equal(target.height(x,z),reference.height(x,z));}
  assert.deepEqual(target.cut([[0,0],[8,0],[8,8],[0,8]]),reference.cut([[0,0],[8,0],[8,8],[0,8]]));
  assert.deepEqual(target.breaks(-1,.3,20,.3),reference.breaks(-1,.3,20,.3));
  assert.throws(()=>target.absorb(target));assert.throws(()=>target.absorb(createLandCover(4)));
  target.clear();assert.equal(target.triangle(0,0,1,0,0,1).id,0);
}
console.log('landcover: перенос готовых страниц, неполные блоки, индекс клеток, повторное дополнение и исходные площадки — проверены');
{
  const C=createLandCover(4),positions=[[-32768,-32768],[32767,32767],[-1,0],[0,-1],[0,0],[-32769,32768],[32768,-32769]];
  for(const[i,j]of positions)C.triangle(i*4+.5,j*4+.5,i*4+1.5,j*4+.5,i*4+.5,j*4+1.5,i+j+.25);
  assert.deepEqual([...C.cells()],positions.map(([i,j])=>[i*4,j*4,(i+1)*4,(j+1)*4]),'Порядок клеток и знаковые координаты сохранены');
  C.compact();for(const[i,j]of positions)assert.equal(C.height(i*4+.7,j*4+.7),i+j+.25,'Далёкие клетки не накладываются на числовые ключи');
}
console.log('landcover: числовые клетки, отрицательные индексы и отдельный путь за пределами ±32768 — проверены');
