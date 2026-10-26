/* Соседние выпуклые части одной плоскости. Убираем только общий внутренний
   край с точно одинаковыми координатами; внешние точки не сдвигаются. */
const point=p=>p[0]+','+p[1];
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
function clean(ring){
  const p=ring.filter((v,i)=>point(v)!==point(ring[(i+ring.length-1)%ring.length]));
  return p.filter((v,i)=>cross(p[(i+p.length-1)%p.length],v,p[(i+1)%p.length])!==0);
}
export function mergeLandPieces(parts){
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
