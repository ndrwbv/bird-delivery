/* №15: результат оптимизированной склейки побитно равен прежнему,
   включая порядок фигур/вершин. Время — диагностическое, без хрупкого порога. */
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {mergeLandPieces} from '../src/game/landpieces.js';
import {createLandCover} from '../src/game/landcover.js';

// Эталон до ускорения: намеренно независимый полный обход.
/* Соседние выпуклые части одной плоскости. Убираем только общий внутренний
   край с точно одинаковыми координатами; внешние точки не сдвигаются. */
const point=p=>p[0]+','+p[1];
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
function clean(ring){
  const p=ring.filter((v,i)=>point(v)!==point(ring[(i+ring.length-1)%ring.length]));
  return p.filter((v,i)=>cross(p[(i+p.length-1)%p.length],v,p[(i+1)%p.length])!==0);
}
function reference(parts){
  if(parts.length<2||parts.length>128)return parts;
  const polygons=parts.slice();
  for(;;){
    const edges=new Map();let merged=false;
    search:for(let i=0;i<polygons.length;i++){
      const p=polygons[i];if(!p)continue;
      for(let j=0;j<p.length;j++){
        const a=point(p[j]),b=point(p[(j+1)%p.length]);if(a===b)continue;
        const other=edges.get(b+':'+a);
        if(other&&other.i!==i){
          const q=polygons[other.i],ring=[];
          for(let k=0;k<p.length;k++)ring.push(p[(j+1+k)%p.length]);
          for(let k=0;k<q.length-2;k++)ring.push(q[(other.j+2+k)%q.length]);
          // Отверстия и вогнутые края не перекрываем диагональю веера.
          const check=clean(ring);
          if(check.length>=3&&new Set(check.map(point)).size===check.length&&check.every((v,k)=>cross(v,check[(k+1)%check.length],check[(k+2)%check.length])>0)){
            polygons[i]=ring;polygons[other.i]=null;merged=true;break search;
          }
        }
        edges.set(a+':'+b,{i,j});
      }
    }
    if(!merged)break;
  }
  return polygons.filter(Boolean).map(clean);
}

let seed=127;
const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const shuffle=p=>{p=p.slice();for(let i=p.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[p[i],p[j]]=[p[j],p[i]];}return p;};
function grid(n,hole=false,origin=[0,0]){
  const out=[];
  for(let x=0;x<n;x++)for(let z=0;z<n;z++){
    if(hole&&x>1&&x<n-2&&z>1&&z<n-2)continue;
    const q=[[x,z],[x+1,z],[x+1,z+1],[x,z+1]].map(p=>[p[0]+origin[0],p[1]+origin[1]]);
    out.push([q[0],q[1],q[2]],[q[0],q[2],q[3]]);
  }
  return out;
}
const cases=[[],[[[0,0],[1,0],[0,1]]],Array.from({length:129},()=>[[0,0],[1,0],[0,1]])];
for(const origin of [[0,0],[5000.123456789,-5000.987654321]])for(const hole of [false,true]){
  const g=grid(8,hole,origin);cases.push(g,g.slice().reverse());
  for(let i=0;i<12;i++)cases.push(shuffle(g));
  // Повторные направленные рёбра проверяют восстановление перезаписей.
  cases.push([...g.slice(0,30),...g.slice(0,12),...g.slice(30,80)]);
}
for(let trial=0;trial<200;trial++){
  const C=createLandCover(),x=trial%2?5000.123456789:0,z=trial%2?-5000.987654321:0;
  for(let n=0;n<8;n++){const a=x+rand()*12-1,b=z+rand()*12-1,w=rand()*5,h=rand()*5;C.triangle(a,b,a+w,b,a,b+h);}
  const p=C.cut([[x,z],[x+10,z],[x+10,z+10],[x,z+10]]);cases.push(p,shuffle(p));
}
// Коллинеарные и повторённые точки, отрицательный ноль и микрозазор.
cases.push([[[0,0],[1,0],[2,0],[2,2],[0,2]],[[2,0],[4,0],[4,2],[2,2]]]);
cases.push([[[-0,0],[1,0],[1,1],[1,1]],[[0,0],[1,1],[0,1]]]);
cases.push([[[0,0],[1,0],[1,1]],[[0,0],[1,1],[0,1]],[[1.000000001,0],[2,0],[2,1]]]);
for(const parts of cases){
  const input=structuredClone(parts),expected=reference(parts),actual=mergeLandPieces(parts);
  assert.deepEqual(actual,expected,'Порядок фигур и точные координаты совпадают с прежним алгоритмом');
  assert.deepEqual(parts,input,'Исходные фигуры не изменяются');
  for(let i=0;i<actual.length;i++)for(let j=0;j<actual[i].length;j++)assert.equal(actual[i][j],expected[i][j],'Сохраняются ссылки на те же исходные точки');
}
const sample=[grid(8),grid(8,true),shuffle(grid(8)),cases[80],cases[220]];
for(let n=0;n<5;n++)for(const f of [reference,mergeLandPieces])for(const c of sample)f(c);
const measure=f=>{const t=performance.now();for(let n=0;n<30;n++)for(const c of sample)f(c);return performance.now()-t;};
const before=measure(reference),after=measure(mergeLandPieces);
console.log(JSON.stringify({ok:true,cases:cases.length,beforeMs:+before.toFixed(1),afterMs:+after.toFixed(1),speedup:+(before/after).toFixed(2)}));
