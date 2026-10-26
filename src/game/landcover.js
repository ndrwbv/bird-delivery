/* Контур мощёного для поднятой земли. Принимает фактические треугольники
   покрытий, а не расстояния до осей дорог: закруглённый тупик, парковка и
   наложение дорожек дают ту же границу в геометрии и в запросе высоты.
   Вычитание выпуклого треугольника оставляет выпуклые части, без мостиков
   через отверстия и без отдельной триангуляции многоугольников с дырками. */
const EPS = 1e-8;
const PAGE=16384;
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
  return intersectConvex(p,triangle);
}
export function intersectConvex(p,polygon){
  const tri=area2(polygon)<0?polygon.slice().reverse():polygon;
  let rest=p;
  for(let i=0;i<tri.length&&rest.length>=3;i++)rest=half(rest,tri[i],tri[(i+1)%tri.length],true);
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
    const b=packed.blocks[Math.floor(id/PAGE)],j=id%PAGE,i=j*3,a=b.xy,v=b.indices,meta=b.meta[j];
    const ax=a[v[i]*2],az=a[v[i]*2+1],bx=a[v[i+1]*2],bz=a[v[i+1]*2+1],cx=a[v[i+2]*2],cz=a[v[i+2]*2+1];
    t={id,p:[[ax,az],[bx,bz],[cx,cz]],lift:b.heights[b.heightIndex[j]],box:[Math.min(ax,bx,cx),Math.min(az,bz,cz),Math.max(ax,bx,cx),Math.max(az,bz,cz)],initial:!!(meta&0x1000000)};
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
            const b=packed.blocks[Math.floor(id/PAGE)],i=id%PAGE*3,a=b.xy,v=b.indices;
            const ax=a[v[i]*2],az=a[v[i]*2+1],bx=a[v[i+1]*2],bz=a[v[i+1]*2+1],cx=a[v[i+2]*2],cz=a[v[i+2]*2+1];
            if(bounds[0]>Math.max(ax,bx,cx)+EPS||bounds[2]<Math.min(ax,bx,cx)-EPS||bounds[1]>Math.max(az,bz,cz)+EPS||bounds[3]<Math.min(az,bz,cz)-EPS)continue;
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
        const b=packed.blocks[Math.floor(item/PAGE)],j=item%PAGE,i=j*3,a=b.xy,v=b.indices;
        const ax=a[v[i]*2],az=a[v[i]*2+1],bx=a[v[i+1]*2],bz=a[v[i+1]*2+1],cx=a[v[i+2]*2],cz=a[v[i+2]*2+1];
        if(x<Math.min(ax,bx,cx)-EPS||x>Math.max(ax,bx,cx)+EPS||z<Math.min(az,bz,cz)-EPS||z>Math.max(az,bz,cz)+EPS)continue;
        if((bx-ax)*(z-az)-(bz-az)*(x-ax)>=-EPS&&(cx-bx)*(z-bz)-(cz-bz)*(x-bx)>=-EPS&&(ax-cx)*(z-cz)-(az-cz)*(x-cx)>=-EPS)h=Math.max(h,b.heights[b.heightIndex[j]]);
        continue;
      }
      const t=item;
      if(x<t.box[0]-EPS||x>t.box[2]+EPS||z<t.box[1]-EPS||z>t.box[3]+EPS)continue;
      const p=[x,z];if(t.p.every((a,i)=>cross(a,t.p[(i+1)%3],p)>=-EPS))h=Math.max(h,t.lift);
    }
    return h;
  }
  function cut(p,minLift=-Infinity,accept=null){
    const bounds=box(p),hits=[];each(bounds,t=>{if(t.lift>=minLift&&(!accept||accept(t)))hits.push(t);});
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
  function inside(p){
    const hits=[];each(box(p),t=>hits.push(t));
    const original=area2(p)<0?p.slice().reverse():p;
    let rest=[original];const result=[];
    for(const t of hits){
      const next=[];
      for(const part of rest){
        const hit=intersectTriangle(part,t.p);
        if(!hit.length){next.push(part);continue;}
        result.push(hit);next.push(...subtract(part,t.p));
      }
      // Полностью закрытый участок остаётся исходным многоугольником:
      // внутренние диагонали маски не должны становиться швами земли.
      rest=next;if(!rest.length)return [original];
    }
    return result;
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
  function breaks(ax,az,bx,bz,minLift=-Infinity){
    const out=[0,1],dx=bx-ax,dz=bz-az;
    each([Math.min(ax,bx),Math.min(az,bz),Math.max(ax,bx),Math.max(az,bz)],t=>{
      if(t.lift<minLift)return;
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
    const n=count(),numberKey=v=>Object.is(v,-0)?'-0':String(v);
    if(!packed)packed={n:0,blocks:[]};
    for(let start=0;start<all.length;){
      const page=Math.floor(all[start].id/PAGE),old=packed.blocks[page],end=Math.min(all.length,start+PAGE-all[start].id%PAGE),size=(old?.n||0)+end-start;
      const xy=old?Array.from(old.xy):[],heights=old?Array.from(old.heights):[],vertices=new Map(),levels=new Map();
      for(let i=0;i<xy.length;i+=2)vertices.set(numberKey(xy[i])+','+numberKey(xy[i+1]),i/2);
      for(let i=0;i<heights.length;i++)levels.set(numberKey(heights[i]),i);
      const indices=new Uint16Array(size*3),heightIndex=new Uint16Array(size),meta=new Uint32Array(size);
      if(old){indices.set(old.indices);heightIndex.set(old.heightIndex);meta.set(old.meta);}
      for(let i=start;i<end;i++){
        const t=all[i],id=t.id%PAGE;
        for(let v=0;v<3;v++){
          const p=t.p[v],k=numberKey(p[0])+','+numberKey(p[1]);let index=vertices.get(k);
          if(index===undefined){index=xy.length/2;vertices.set(k,index);xy.push(...p);}indices[id*3+v]=index;
        }
        const k=numberKey(t.lift);let index=levels.get(k);if(index===undefined){index=heights.length;levels.set(k,index);heights.push(t.lift);}heightIndex[id]=index;
        meta[id]=(t.initial?0x1000000:0)|(t.rgb?0x2000000|(t.rgb[0]<<16)|(t.rgb[1]<<8)|t.rgb[2]:0);
      }
      // Общие вершины и палитра высот экономят память без округления:
      // сами координаты и высоты по-прежнему хранятся в Float64.
      packed.blocks[page]={n:size,xy:Float64Array.from(xy),heights:Float64Array.from(heights),indices,heightIndex,meta};start=end;
    }
    for(const [k,list] of grid)if(Array.isArray(list))grid.set(k,Uint32Array.from(list,t=>typeof t==='number'?t:t.id));
    packed.n=n;all.length=0;cache.clear();
  }
  return {triangle,height,covered:(x,z)=>height(x,z)>-Infinity,sideHeights,cut,inside,breaks,compact,stats,
    inBox(bounds){const out=[];each(bounds,t=>out.push(t));return out;},
    *cells(){for(const k of grid.keys()){const [i,j]=k.split(',').map(Number);yield [i*cell,j*cell,(i+1)*cell,(j+1)*cell];}},
    get storageBytes(){return packed?packed.blocks.reduce((s,b)=>s+b.xy.byteLength+b.heights.byteLength+b.indices.byteLength+b.heightIndex.byteLength+b.meta.byteLength,0):0;},
    get count(){return count();},get rawCount(){return all.length;},get triangles(){
      if(!packed)return all;
      return {[Symbol.iterator]:function*(){for(let i=0;i<packed.n;i++)yield read(i);yield* all;}};
    },clear(){grid.clear();all.length=0;packed=null;cache.clear();}};
}
