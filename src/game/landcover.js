import {drainSteps,sliceBudget,copyTypedSteps} from './landcache17a/cooperative.js';
/* Контур мощёного для поднятой земли. Принимает фактические треугольники
   покрытий, а не расстояния до осей дорог: закруглённый тупик, парковка и
   наложение дорожек дают ту же границу в геометрии и в запросе высоты.
   Вычитание выпуклого треугольника оставляет выпуклые части, без мостиков
   через отверстия и без отдельной триангуляции многоугольников с дырками. */
const EPS = 1e-8;
const PAGE=16384;
const POINT_DIVISIONS=8, POINT_MIN_TRIANGLES=48, POINT_CACHE_CELLS=128, POINT_WARMUP=20;
const POINT_STRIDE=11;
const COVER_DATA=new WeakMap();
const cross = (a, b, p) => (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const containsPoint = (x,z,ax,az,bx,bz,cx,cz) =>
  (bx-ax)*(z-az)-(bz-az)*(x-ax)>=-EPS &&
  (cx-bx)*(z-bz)-(cz-bz)*(x-bx)>=-EPS &&
  (ax-cx)*(z-cz)-(az-cz)*(x-cx)>=-EPS;
const area2 = p => p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0);
const box = p => {
  let ax=Infinity,az=Infinity,bx=-Infinity,bz=-Infinity;
  for(const v of p){ax=Math.min(ax,v[0]);az=Math.min(az,v[1]);bx=Math.max(bx,v[0]);bz=Math.max(bz,v[1]);}
  return [ax,az,bx,bz];
};
const outsideTriangle=(p,t)=>{
  for(let i=0;i<3;i++){
    const a=t[i],b=t[(i+1)%3];let outside=true;
    for(const v of p)if(cross(a,b,v)>0){outside=false;break;}
    if(outside)return true;
  }
  return false;
};
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
  // The inside remainder is the intersection. If it has zero area,
  // keep the original polygon instead of keeping artificial cuts.
  return rest.length>=3&&Math.abs(area2(rest))>EPS?parts:[p];
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

// Preserve insertion order and distinguish signed zero just as the wire
// encoder does. Float64 bits avoid string conversion on every vertex.
function vertexIds(xy, limit) {
  let size=64;
  while(size<limit*2)size*=2;
  const table=new Uint32Array(size), mask=size-1;
  const point=new Float64Array(2), bits=new Uint32Array(point.buffer);
  function slotFor(x,z) {
    point[0]=x;point[1]=z;
    let hash=Math.imul(bits[0],0x9e3779b1)^Math.imul(bits[1],0x85ebca6b)^Math.imul(bits[2],0xc2b2ae35)^Math.imul(bits[3],0x27d4eb2f);
    hash^=hash>>>15;hash=Math.imul(hash,0x2c1b3c6d);hash^=hash>>>12;
    let slot=hash&mask;
    while(table[slot]){
      const at=(table[slot]-1)*2;
      if(Object.is(xy[at],x)&&Object.is(xy[at+1],z))break;
      slot=(slot+1)&mask;
    }
    return slot;
  }
  for(let at=0;at<xy.length;at+=2)table[slotFor(xy[at],xy[at+1])]=at/2+1;
  return (x,z)=>{
    const slot=slotFor(x,z), found=table[slot];
    if(found)return found-1;
    const id=xy.length/2;
    xy.push(x,z);table[slot]=id+1;
    return id;
  };
}

export function createLandCover(cell=32,snapshot=null) {
  let grid=snapshot?.grid||new Map(),all=[],cache=new Map(),dirtyCells=new Set();
  // n — число фигур; end — следующий id. Перенос готовых страниц
  // сохраняет неполный блок, поэтому после него id могут иметь пропуски.
  let packed=snapshot?.packed||null;
  // Клетки города — пара знаковых 16-битных индексов. Вне этого
  // диапазона сохраняем строковый ключ, без наложения далёких областей.
  const key=(i,j)=>i>=-32768&&i<=32767&&j>=-32768&&j<=32767?(i<<16)|(j&65535):i+','+j;
  const stats={triangles:0,queries:0,cut:0,parts:0};
  const pointCache=new Map(), pointCell=cell/POINT_DIVISIONS;
  let pointCacheOn=false;
  const pointSubcell=(at,origin)=>Math.max(0,Math.min(POINT_DIVISIONS-1,Math.floor((at-origin)/pointCell)));
  const count=()=>all.length+(packed?.n||0);
  function read(id){
    let t=cache.get(id);if(t)return t;
    const b=packed.blocks[Math.floor(id/PAGE)],j=id%PAGE,i=j*3,a=b.xy,v=b.indices,meta=b.metaValues[b.meta[j]];
    const ax=a[v[i]*2],az=a[v[i]*2+1],bx=a[v[i+1]*2],bz=a[v[i+1]*2+1],cx=a[v[i+2]*2],cz=a[v[i+2]*2+1];
    t={id,p:[[ax,az],[bx,bz],[cx,cz]],lift:b.heights[b.heightIndex[j]],box:[Math.min(ax,bx,cx),Math.min(az,bz,cz),Math.max(ax,bx,cx),Math.max(az,bz,cz)],initial:!!(meta&0x1000000)};
    if(meta&0x2000000)t.rgb=[(meta>>16)&255,(meta>>8)&255,meta&255];
    if(cache.size>=2048)cache.delete(cache.keys().next().value);cache.set(id,t);return t;
  }
  function each(bounds,fn,minLift=-Infinity){
    const x0=Math.floor((bounds[0]-EPS)/cell),x1=Math.floor((bounds[2]+EPS)/cell);
    const z0=Math.floor((bounds[1]-EPS)/cell),z1=Math.floor((bounds[3]+EPS)/cell);
    const seen=x0===x1&&z0===z1?null:new Set();
    for(let i=x0;i<=x1;i++)
      for(let j=z0;j<=z1;j++)
        for(const item of grid.get(key(i,j))||[]){
          const id=typeof item==='number'?item:item.id;
          if(seen){if(seen.has(id))continue;seen.add(id);}
          if(typeof item==='number'){
            const b=packed.blocks[Math.floor(id/PAGE)],j=id%PAGE,i=j*3,a=b.xy,v=b.indices;
            if(b.heights[b.heightIndex[j]]<minLift)continue;
            const ax=a[v[i]*2],az=a[v[i]*2+1],bx=a[v[i+1]*2],bz=a[v[i+1]*2+1],cx=a[v[i+2]*2],cz=a[v[i+2]*2+1];
            if(bounds[0]>Math.max(ax,bx,cx)+EPS||bounds[2]<Math.min(ax,bx,cx)-EPS||bounds[1]>Math.max(az,bz,cz)+EPS||bounds[3]<Math.min(az,bz,cz)-EPS)continue;
            if(fn(read(id))===false)return false;
          }else if(item.lift>=minLift&&overlaps(bounds,item.box)&&fn(item)===false)return false;
        }
  }
  function triangle(ax,az,bx,bz,cx,cz,lift=0){
    if(!Number.isFinite(ax)||!Number.isFinite(az)||!Number.isFinite(bx)||!Number.isFinite(bz)||
      !Number.isFinite(cx)||!Number.isFinite(cz)||!Number.isFinite(lift))throw new Error('Нечисловая точка покрытия');
    // Keep the operation order of area2 so even nearly collinear inputs
    // take the same winding and degenerate paths as the polygon code.
    const signed=0+ax*bz-az*bx+bx*cz-bz*cx+cx*az-cz*ax;
    if(Math.abs(signed)<EPS)return;
    const a=[ax,az],b=[bx,bz],c=[cx,cz],p=signed<0?[a,c,b]:[a,b,c];
    const bounds=[Math.min(ax,bx,cx),Math.min(az,bz,cz),Math.max(ax,bx,cx),Math.max(az,bz,cz)];
    const t={id:(packed?.end||0)+all.length,p,box:bounds,lift};all.push(t);
    for(let i=Math.floor(bounds[0]/cell);i<=Math.floor(bounds[2]/cell);i++)
      for(let j=Math.floor(bounds[1]/cell);j<=Math.floor(bounds[3]/cell);j++){
        const k=key(i,j);let list=grid.get(k);
        if(!list)grid.set(k,list=[]);else if(!Array.isArray(list))grid.set(k,list=Array.from(list));list.push(t);dirtyCells.add(k);
      }
    stats.triangles++;
    return t;
  }
  function pointIndex(ix,iz,k,source){
    if(!pointCacheOn||Array.isArray(source)||source.length<POINT_MIN_TRIANGLES)return null;
    let entry=pointCache.get(k);
    if(entry?.source!==source){
      if(pointCache.size>=POINT_CACHE_CELLS)pointCache.delete(pointCache.keys().next().value);
      entry={source,cells:null,points:null,queries:0};
      pointCache.set(k,entry);
    }
    if(entry.cells)return entry;
    if(++entry.queries<POINT_WARMUP)return null;
    const x0=ix*cell,z0=iz*cell,points=new Float64Array(source.length*POINT_STRIDE);
    const cells=Array.from({length:POINT_DIVISIONS**2},()=>[]);
    for(let index=0;index<source.length;index++){
      const id=source[index],b=packed.blocks[Math.floor(id/PAGE)],j=id%PAGE,i=j*3,a=b.xy,v=b.indices;
      const ax=a[v[i]*2],az=a[v[i]*2+1],bx=a[v[i+1]*2],bz=a[v[i+1]*2+1],cx=a[v[i+2]*2],cz=a[v[i+2]*2+1];
      const minX=Math.min(ax,bx,cx)-EPS,maxX=Math.max(ax,bx,cx)+EPS;
      const minZ=Math.min(az,bz,cz)-EPS,maxZ=Math.max(az,bz,cz)+EPS;
      const offset=index*POINT_STRIDE;
      points[offset]=b.heights[b.heightIndex[j]];
      points[offset+1]=minX;points[offset+2]=maxX;points[offset+3]=minZ;points[offset+4]=maxZ;
      points[offset+5]=ax;points[offset+6]=az;points[offset+7]=bx;
      points[offset+8]=bz;points[offset+9]=cx;points[offset+10]=cz;
      const xMin=pointSubcell(minX,x0),xMax=pointSubcell(maxX,x0);
      const zMin=pointSubcell(minZ,z0),zMax=pointSubcell(maxZ,z0);
      for(let rz=zMin;rz<=zMax;rz++)for(let rx=xMin;rx<=xMax;rx++)cells[rz*POINT_DIVISIONS+rx].push(offset);
    }
    entry.cells=cells;entry.points=points;
    return entry;
  }
  function height(x,z){
    const ix=Math.floor(x/cell),iz=Math.floor(z/cell),k=key(ix,iz),source=grid.get(k);
    let h=-Infinity;
    if(!source)return h;
    const index=pointIndex(ix,iz,k,source);
    if(index){
      const points=index.points,sub=pointSubcell(z,iz*cell)*POINT_DIVISIONS+pointSubcell(x,ix*cell);
      for(const at of index.cells[sub]){
        const lift=points[at];
        if(lift<=h||x<points[at+1]||x>points[at+2]||z<points[at+3]||z>points[at+4])continue;
        const ax=points[at+5],az=points[at+6],bx=points[at+7],bz=points[at+8],cx=points[at+9],cz=points[at+10];
        if(containsPoint(x,z,ax,az,bx,bz,cx,cz))h=lift;
      }
      return h;
    }
    for(const item of source){
      if(typeof item==='number'){
        const b=packed.blocks[Math.floor(item/PAGE)],j=item%PAGE,i=j*3,a=b.xy,v=b.indices;
        const lift=b.heights[b.heightIndex[j]];
        if(lift<=h)continue;
        const ax=a[v[i]*2],az=a[v[i]*2+1],bx=a[v[i+1]*2],bz=a[v[i+1]*2+1],cx=a[v[i+2]*2],cz=a[v[i+2]*2+1];
        if(x<Math.min(ax,bx,cx)-EPS||x>Math.max(ax,bx,cx)+EPS||z<Math.min(az,bz,cz)-EPS||z>Math.max(az,bz,cz)+EPS)continue;
        if(containsPoint(x,z,ax,az,bx,bz,cx,cz))h=lift;
        continue;
      }
      const t=item;if(t.lift<=h)continue;
      if(x<t.box[0]-EPS||x>t.box[2]+EPS||z<t.box[1]-EPS||z>t.box[3]+EPS)continue;
      const a=t.p[0],b=t.p[1],c=t.p[2];
      if(containsPoint(x,z,a[0],a[1],b[0],b[1],c[0],c[1]))h=t.lift;
    }
    return h;
  }
  function cut(p,minLift=-Infinity,accept=null){
    const bounds=box(p),original=area2(p)<0?p.slice().reverse():p;
    let parts=[original],found=false;
    each(bounds,t=>{
      if(accept&&!accept(t))return;
      found=true;
      const next=[];
      for(const part of parts){
        // Пересечение рамок ещё не означает пересечения фигур. Иначе даже
        // чужая дорожка дробит нетронутую землю на лишние внутренние части.
        if(!overlaps(part===original?bounds:box(part),t.box)||outsideTriangle(part,t.p)){next.push(part);continue;}
        next.push(...subtract(part,t.p));
      }
      parts=next;
      if(!parts.length)return false;
    },minLift);
    stats.queries++;if(found)stats.cut++;stats.parts+=parts.length;
    return parts;
  }
  function inside(p){
    const bounds=box(p),original=area2(p)<0?p.slice().reverse():p;
    let rest=[original];const result=[];
    each(bounds,t=>{
      const next=[];
      for(const part of rest){
        if(!overlaps(part===original?bounds:box(part),t.box)||outsideTriangle(part,t.p)){next.push(part);continue;}
        const hit=intersectTriangle(part,t.p);
        if(!hit.length){next.push(part);continue;}
        result.push(hit);next.push(...subtract(part,t.p));
      }
      rest=next;
      if(!rest.length)return false;
    });
    // Полностью закрытый участок остаётся исходным многоугольником:
    // внутренние диагонали маски не должны становиться швами земли.
    return rest.length?result:[original];
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
    },minLift);
    return out;
  }
  function compact(){
    if(!all.length)return;
    const n=count(),numberKey=v=>Object.is(v,-0)?'-0':v;
    if(!packed)packed={n:0,end:0,blocks:[]};
    for(let start=0;start<all.length;){
      const page=Math.floor(all[start].id/PAGE),old=packed.blocks[page],end=Math.min(all.length,start+PAGE-all[start].id%PAGE),size=(old?.n||0)+end-start;
      const xy=old?Array.from(old.xy):[],heights=old?Array.from(old.heights):[],metaValues=old?Array.from(old.metaValues):[],levels=new Map(),attributes=new Map();
      const vertexId=vertexIds(xy,xy.length/2+(end-start)*3);
      for(let i=0;i<heights.length;i++)levels.set(numberKey(heights[i]),i);
      for(let i=0;i<metaValues.length;i++)attributes.set(metaValues[i],i);
      const indices=new Uint16Array(size*3),heightIndex=new Uint16Array(size),meta=new Uint16Array(size);
      if(old){indices.set(old.indices);heightIndex.set(old.heightIndex);meta.set(old.meta);}
      for(let i=start;i<end;i++){
        const t=all[i],id=t.id%PAGE;
        for(let v=0;v<3;v++){
          const p=t.p[v];indices[id*3+v]=vertexId(p[0],p[1]);
        }
        const k=numberKey(t.lift);let index=levels.get(k);if(index===undefined){index=heights.length;levels.set(k,index);heights.push(t.lift);}heightIndex[id]=index;
        const value=(t.initial?0x1000000:0)|(t.rgb?0x2000000|(t.rgb[0]<<16)|(t.rgb[1]<<8)|t.rgb[2]:0);
        let attribute=attributes.get(value);if(attribute===undefined){attribute=metaValues.length;attributes.set(value,attribute);metaValues.push(value);}meta[id]=attribute;
      }
      // Общие вершины и палитра высот экономят память без округления:
      // сами координаты и высоты по-прежнему хранятся в Float64.
      packed.blocks[page]={n:size,xy:Float64Array.from(xy),heights:Float64Array.from(heights),indices,heightIndex:heights.length<=256?Uint8Array.from(heightIndex):heightIndex,meta:metaValues.length<=256?Uint8Array.from(meta):meta,metaValues:Uint32Array.from(metaValues)};start=end;
    }
    // Упакованные клетки не менялись: не обходим весь город при каждой странице.
    for(const k of dirtyCells)grid.set(k,Uint32Array.from(grid.get(k),t=>typeof t==='number'?t:t.id));
    dirtyCells.clear();
    packed.n=n;packed.end=all.at(-1).id+1;all.length=0;cache.clear();
  }
  const api={get cell(){return cell;},triangle,height,covered:(x,z)=>height(x,z)>-Infinity,sideHeights,cut,inside,breaks,compact,stats,
    // postMessage копирует готовые числовые страницы и индекс за один
    // проход; миллионы промежуточных объектов треугольников не нужны.
    snapshot(){compact();return {version:1,cell,packed,grid};},
    cachePointQueries(){pointCacheOn=true;},
    // All validation/allocation precedes commit; cancelling this generator leaves live state intact.
    *prepareRestoreSteps(snapshot,options={},takeOwnership=false){
      if(snapshot?.version!==1||snapshot.cell!==cell||!(snapshot.grid instanceof Map))throw Error('Invalid cover checkpoint');
      const preflight=()=>{if(Object.isFrozen(all)||['triangles','queries','cut','parts'].some(k=>!Object.getOwnPropertyDescriptor(stats,k)?.writable))throw Error('Invalid cover target');};preflight();
      const nextGrid=takeOwnership?snapshot.grid:new Map();
      let next=snapshot.packed||null;
      if(!takeOwnership){
        const batch=sliceBudget(options);
        for(const[k,v]of snapshot.grid){nextGrid.set(k,yield* copyTypedSteps(v,batch));if(batch.charge())yield 'index';}
        if(next){
          next={n:snapshot.packed.n,end:snapshot.packed.end,blocks:[]};
          for(const b of snapshot.packed.blocks){const copy={};for(const[k,v]of Object.entries(b)){copy[k]=ArrayBuffer.isView(v)?yield* copyTypedSteps(v,batch):v;if(batch.charge())yield 'page';}next.blocks.push(copy);}
        }
      }
      const nextAll=[],nextCache=new Map(),nextDirty=new Set();let committed=false;preflight();
      const commit=()=>{if(committed)return api;committed=true;grid=nextGrid;packed=next;all=nextAll;cache=nextCache;pointCache.clear();dirtyCells=nextDirty;stats.triangles=packed?.n||0;stats.queries=stats.cut=stats.parts=0;return api;};commit.preflight=preflight;return commit;
    },
    prepareRestore(snapshot,options={}){return drainSteps(api.prepareRestoreSteps(snapshot,options));},
    restore(snapshot){return api.prepareRestore(snapshot)();},
    absorb(other){
      const inspect=COVER_DATA.get(other);if(!inspect||other===api)throw Error('Неверное поле для переноса');
      if(inspect().cell!==cell)throw Error('Разные клетки полей');
      compact();other.compact();const incoming=inspect();if(!incoming.packed?.n)return;
      if(!packed)packed={n:0,end:0,blocks:[]};
      // Источник опустошается; координаты и палитры переезжают без
      // распаковки. Меняются только id в пространственном индексе.
      const offset=packed.blocks.length*PAGE;
      packed.blocks.push(...incoming.packed.blocks);
      for(const[k,list]of incoming.grid){
        const previous=grid.get(k),n=previous?.length||0,joined=new Uint32Array(n+list.length);
        if(previous)joined.set(previous);
        for(let i=0;i<list.length;i++)joined[n+i]=list[i]+offset;
        grid.set(k,joined);
      }
      packed.n+=incoming.packed.n;packed.end=offset+incoming.packed.end;stats.triangles+=incoming.packed.n;
      other.clear();cache.clear();pointCache.clear();
    },
    clearReadCache(){cache.clear();},
    inBox(bounds){const out=[];each(bounds,t=>out.push(t));return out;},
    *cells(){for(const k of grid.keys()){const [i,j]=typeof k==='number'?[k>>16,k<<16>>16]:k.split(',').map(Number);yield [i*cell,j*cell,(i+1)*cell,(j+1)*cell];}},
    get storageBytes(){return packed?packed.blocks.reduce((s,b)=>s+b.xy.byteLength+b.heights.byteLength+b.indices.byteLength+b.heightIndex.byteLength+b.meta.byteLength+b.metaValues.byteLength,0):0;},
    get initialTriangles(){return {[Symbol.iterator]:function*(){
      if(packed)for(let page=0;page<packed.blocks.length;page++){const b=packed.blocks[page];for(let i=0;i<b.n;i++)if(b.metaValues[b.meta[i]]&0x1000000)yield read(page*PAGE+i);}
      for(const t of all)if(t.initial)yield t;
    }};},
    get count(){return count();},get rawCount(){return all.length;},get triangles(){
      if(!packed)return all;
      return {[Symbol.iterator]:function*(){for(let page=0;page<packed.blocks.length;page++)for(let i=0;i<packed.blocks[page].n;i++)yield read(page*PAGE+i);yield* all;}};
    },clear(){grid.clear();dirtyCells.clear();all.length=0;packed=null;cache.clear();pointCache.clear();}};
  COVER_DATA.set(api,()=>({packed,grid,cell}));return api;
}
