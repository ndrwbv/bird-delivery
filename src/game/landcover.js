/* Контур мощёного для поднятой земли. Принимает фактические треугольники
   покрытий, а не расстояния до осей дорог: закруглённый тупик, парковка и
   наложение дорожек дают ту же границу в геометрии и в запросе высоты.
   Вычитание выпуклого треугольника оставляет выпуклые части, без мостиков
   через отверстия и без отдельной триангуляции многоугольников с дырками. */
const EPS = 1e-8;
const cross = (a, b, p) => (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const area2 = p => p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0);
const box = p => [Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))];
const overlaps = (a,b) => a[0]<=b[2]+EPS&&a[2]>=b[0]-EPS&&a[1]<=b[3]+EPS&&a[3]>=b[1]-EPS;
function half(p,a,b,inside) {
  const out=[];
  for(let i=0;i<p.length;i++){
    const v=p[i],w=p[(i+1)%p.length],dv=cross(a,b,v),dw=cross(a,b,w);
    const vi=inside?dv>=0:dv<=0,wi=inside?dw>=0:dw<=0;
    if(vi)out.push(v);
    if(vi!==wi){const t=dv/(dv-dw);out.push([v[0]+(w[0]-v[0])*t,v[1]+(w[1]-v[1])*t]);}
  }
  return out;
}
function subtract(p,tri) {
  let rest=p;const parts=[];
  for(let i=0;i<3&&rest.length>=3;i++){
    const a=tri[i],b=tri[(i+1)%3],outside=half(rest,a,b,false);
    if(outside.length>=3&&Math.abs(area2(outside))>EPS)parts.push(outside);
    rest=half(rest,a,b,true);
  }
  return parts;
}

export function intersectTriangle(p,triangle){
  const tri=area2(triangle)<0?triangle.slice().reverse():triangle;
  let rest=p;
  for(let i=0;i<3&&rest.length>=3;i++)rest=half(rest,tri[i],tri[(i+1)%3],true);
  return rest.length>=3&&Math.abs(area2(rest))>EPS?rest:[];
}

export function createLandCover(cell=32) {
  const grid=new Map(),all=[],cache=new Map();
  let packed=null;
  const key=(i,j)=>i+','+j;
  const stats={triangles:0,queries:0,cut:0,parts:0};
  const count=()=>all.length+(packed?.n||0);
  function read(id){
    let t=cache.get(id);if(t)return t;
    const a=packed.data,o=id*11,meta=packed.meta[id];
    t={id,p:[[a[o],a[o+1]],[a[o+2],a[o+3]],[a[o+4],a[o+5]]],lift:a[o+6],box:[a[o+7],a[o+8],a[o+9],a[o+10]],initial:!!(meta&0x1000000)};
    if(meta&0x2000000)t.rgb=[(meta>>16)&255,(meta>>8)&255,meta&255];
    if(cache.size>=2048)cache.delete(cache.keys().next().value);cache.set(id,t);return t;
  }
  function each(bounds,fn){
    const seen=new Set();
    for(let i=Math.floor((bounds[0]-EPS)/cell);i<=Math.floor((bounds[2]+EPS)/cell);i++)
      for(let j=Math.floor((bounds[1]-EPS)/cell);j<=Math.floor((bounds[3]+EPS)/cell);j++)
        for(const item of grid.get(key(i,j))||[]){
          const id=typeof item==='number'?item:item.id;if(seen.has(id))continue;seen.add(id);
          if(typeof item==='number'){
            const a=packed.data,o=id*11;
            if(bounds[0]>a[o+9]+EPS||bounds[2]<a[o+7]-EPS||bounds[1]>a[o+10]+EPS||bounds[3]<a[o+8]-EPS)continue;
            fn(read(id));
          }else if(overlaps(bounds,item.box))fn(item);
        }
  }
  function triangle(ax,az,bx,bz,cx,cz,lift=0){
    if(![ax,az,bx,bz,cx,cz,lift].every(Number.isFinite))throw new Error('Нечисловая точка покрытия');
    let p=[[ax,az],[bx,bz],[cx,cz]];
    const signed=area2(p);if(Math.abs(signed)<EPS)return;
    if(signed<0)p=[p[0],p[2],p[1]];
    const bounds=box(p),t={id:count(),p,box:bounds,lift};all.push(t);
    for(let i=Math.floor(bounds[0]/cell);i<=Math.floor(bounds[2]/cell);i++)
      for(let j=Math.floor(bounds[1]/cell);j<=Math.floor(bounds[3]/cell);j++){
        const k=key(i,j);let list=grid.get(k);
        if(!list)grid.set(k,list=[]);else if(!Array.isArray(list))grid.set(k,list=Array.from(list));list.push(t);
      }
    stats.triangles++;
    return t;
  }
  function height(x,z){
    let h=-Infinity;
    for(const item of grid.get(key(Math.floor(x/cell),Math.floor(z/cell)))||[]){
      if(typeof item==='number'){
        const a=packed.data,o=item*11;
        if(x<a[o+7]-EPS||x>a[o+9]+EPS||z<a[o+8]-EPS||z>a[o+10]+EPS)continue;
        const ax=a[o],az=a[o+1],bx=a[o+2],bz=a[o+3],cx=a[o+4],cz=a[o+5];
        if((bx-ax)*(z-az)-(bz-az)*(x-ax)>=-EPS&&(cx-bx)*(z-bz)-(cz-bz)*(x-bx)>=-EPS&&(ax-cx)*(z-cz)-(az-cz)*(x-cx)>=-EPS)h=Math.max(h,a[o+6]);
        continue;
      }
      const t=item;
      if(x<t.box[0]-EPS||x>t.box[2]+EPS||z<t.box[1]-EPS||z>t.box[3]+EPS)continue;
      const p=[x,z];if(t.p.every((a,i)=>cross(a,t.p[(i+1)%3],p)>=-EPS))h=Math.max(h,t.lift);
    }
    return h;
  }
  function cut(p,minLift=-Infinity){
    const bounds=box(p),hits=[];each(bounds,t=>{if(t.lift>=minLift)hits.push(t);});
    let parts=[area2(p)<0?p.slice().reverse():p];
    for(const t of hits){
      const next=[];
      for(const part of parts){
        // Пересечение рамок ещё не означает пересечения фигур. Иначе даже
        // чужая дорожка дробит нетронутую землю на лишние внутренние части.
        if(!overlaps(box(part),t.box)||!intersectTriangle(part,t.p).length){next.push(part);continue;}
        next.push(...subtract(part,t.p));
      }
      parts=next;if(!parts.length)break;
    }
    stats.queries++;if(hits.length)stats.cut++;stats.parts+=parts.length;
    return parts;
  }
  // Высота непосредственно по обе стороны линии в точке (x,z).
  // Проба с отступом перескакивала через тонкую полоску другого покрытия:
  // здесь сторону определяют полуплоскости треугольника, без шага в метрах.
  function sideHeights(x,z,nx,nz){
    let left=-Infinity,right=-Infinity;
    each([x-EPS,z-EPS,x+EPS,z+EPS],t=>{
      let l=true,r=true;
      for(let i=0;i<3;i++){
        const a=t.p[i],b=t.p[(i+1)%3],dx=b[0]-a[0],dz=b[1]-a[1];
        const f=dx*(z-a[1])-dz*(x-a[0]),tol=EPS*Math.max(1,Math.hypot(dx,dz));
        if(f < -tol)return;
        if(Math.abs(f)<=tol){
          const d=dx*nz-dz*nx;
          if(d < -1e-12)l=false;
          if(d > 1e-12)r=false;
        }
      }
      if(l)left=Math.max(left,t.lift);
      if(r)right=Math.max(right,t.lift);
    });
    return [left,right];
  }
  function breaks(ax,az,bx,bz){
    const out=[0,1],dx=bx-ax,dz=bz-az;
    each([Math.min(ax,bx),Math.min(az,bz),Math.max(ax,bx),Math.max(az,bz)],t=>{
      let lo=0,hi=1;
      for(let i=0;i<3;i++){
        const a=t.p[i],b=t.p[(i+1)%3],f=cross(a,b,[ax,az]),d=(b[0]-a[0])*dz-(b[1]-a[1])*dx;
        // Совпадающие рёбра после поворота могут отличаться на долю
        // миллиардной метра. Допуск параллельности зависит от длин обоих
        // отрезков; иначе ошибка заметнее на дальнем краю большой карты.
        const edgeLength=Math.hypot(b[0]-a[0],b[1]-a[1]);
        if(Math.abs(d)<1e-12*Math.max(1,edgeLength*Math.hypot(dx,dz))){if(f < -EPS*Math.max(1,edgeLength))return;continue;}
        const at=-f/d;if(d>0)lo=Math.max(lo,at);else hi=Math.min(hi,at);
        if(lo>hi)return;
      }
      if(hi>=0&&lo<=1){out.push(Math.max(0,lo),Math.min(1,hi));}
    });
    return out;
  }
  function compact(){
    if(!all.length)return;
    const n=count(),data=new Float64Array(n*11),meta=new Uint32Array(n);
    if(packed){data.set(packed.data);meta.set(packed.meta);}
    for(const t of all){
      data.set([...t.p[0],...t.p[1],...t.p[2],t.lift,...t.box],t.id*11);
      meta[t.id]=(t.initial?0x1000000:0)|(t.rgb?0x2000000|(t.rgb[0]<<16)|(t.rgb[1]<<8)|t.rgb[2]:0);
    }
    for(const [k,list] of grid)grid.set(k,Uint32Array.from(list,t=>typeof t==='number'?t:t.id));
    packed={n,data,meta};all.length=0;cache.clear();
  }
  return {triangle,height,covered:(x,z)=>height(x,z)>-Infinity,sideHeights,cut,breaks,compact,stats,
    inBox(bounds){const out=[];each(bounds,t=>out.push(t));return out;},
    *cells(){for(const k of grid.keys()){const [i,j]=k.split(',').map(Number);yield [i*cell,j*cell,(i+1)*cell,(j+1)*cell];}},
    get count(){return count();},get rawCount(){return all.length;},get triangles(){
      if(!packed)return all;
      return {[Symbol.iterator]:function*(){for(let i=0;i<packed.n;i++)yield read(i);yield* all;}};
    },clear(){grid.clear();all.length=0;packed=null;cache.clear();}};
}
