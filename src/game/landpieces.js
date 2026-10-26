/* Соседние выпуклые части одной плоскости. Убираем только общий внутренний
   край с точно одинаковыми координатами; внешние точки не сдвигаются. */
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
export function mergeLandPieces(parts){
  if(parts.length<2||parts.length>128)return parts;
  // Идентичность точек — как раньше, по строке точных координат, но
  // строка строится один раз. Слияние переставляет только исходные точки.
  const vertices=new Map(),ids=new WeakMap();
  const id=p=>{let n=ids.get(p);if(n!==undefined)return n;const k=p[0]+','+p[1];n=vertices.get(k);if(n===undefined){n=vertices.size;vertices.set(k,n);}ids.set(p,n);return n;};
  for(const p of parts)for(const v of p)id(v);
  const base=vertices.size;
  const edge=(a,b)=>a*base+b;
  const clean=ring=>{
    const p=ring.filter((v,i)=>id(v)!==id(ring[(i+ring.length-1)%ring.length]));
    return p.filter((v,i)=>cross(p[(i+p.length-1)%p.length],v,p[(i+1)%p.length])!==0);
  };
  const polygons=parts.slice(),edges=new Map(),history=[],marks=[];
  let start=0;
  for(;;){
    let merged=false;
    search:for(let i=start;i<polygons.length;i++){
      marks[i]=history.length;
      const p=polygons[i];if(!p)continue;
      for(let j=0;j<p.length;j++){
        const a=id(p[j]),b=id(p[(j+1)%p.length]);if(a===b)continue;
        const other=edges.get(edge(b,a));
        if(other&&other.i!==i){
          const q=polygons[other.i],ring=[];
          for(let k=0;k<p.length;k++)ring.push(p[(j+1+k)%p.length]);
          for(let k=0;k<q.length-2;k++)ring.push(q[(other.j+2+k)%q.length]);
          // Отверстия и вогнутые края не перекрываем диагональю веера.
          const check=clean(ring);
          if(check.length>=3&&new Set(check.map(id)).size===check.length&&check.every((v,k)=>cross(v,check[(k+1)%check.length],check[(k+2)%check.length])>0)){
            polygons[i]=ring;polygons[other.i]=null;
            // Всё до поглощённой фигуры неизменно и уже проверено.
            // Возвращаем индекс к тому же состоянию, что получил бы
            // прежний полный обход, включая перезаписанные рёбра.
            start=other.i;
            while(history.length>marks[start]){const [k,old]=history.pop();if(old===undefined)edges.delete(k);else edges.set(k,old);}
            merged=true;break search;
          }
        }
        const k=edge(a,b);history.push([k,edges.get(k)]);edges.set(k,{i,j});
      }
    }
    if(!merged)break;
  }
  return polygons.filter(Boolean).map(clean);
}
