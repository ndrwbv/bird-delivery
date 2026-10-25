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

export function createLandCover(cell=32) {
  const grid=new Map(),all=[];
  const key=(i,j)=>i+','+j;
  const stats={triangles:0,queries:0,cut:0,parts:0};
  function each(bounds,fn){
    const seen=new Set();
    for(let i=Math.floor(bounds[0]/cell);i<=Math.floor(bounds[2]/cell);i++)
      for(let j=Math.floor(bounds[1]/cell);j<=Math.floor(bounds[3]/cell);j++)
        for(const t of grid.get(key(i,j))||[])if(!seen.has(t)&&overlaps(bounds,t.box)){seen.add(t);fn(t);}
  }
  function triangle(ax,az,bx,bz,cx,cz,lift=0){
    if(![ax,az,bx,bz,cx,cz,lift].every(Number.isFinite))throw new Error('Нечисловая точка покрытия');
    let p=[[ax,az],[bx,bz],[cx,cz]];
    const signed=area2(p);if(Math.abs(signed)<EPS)return;
    if(signed<0)p=[p[0],p[2],p[1]];
    const bounds=box(p),t={p,box:bounds,lift};all.push(t);
    for(let i=Math.floor(bounds[0]/cell);i<=Math.floor(bounds[2]/cell);i++)
      for(let j=Math.floor(bounds[1]/cell);j<=Math.floor(bounds[3]/cell);j++){
        const k=key(i,j);let list=grid.get(k);if(!list)grid.set(k,list=[]);list.push(t);
      }
    stats.triangles++;
    return t;
  }
  function height(x,z){
    let h=-Infinity;
    for(const t of grid.get(key(Math.floor(x/cell),Math.floor(z/cell)))||[]){
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
        if(!overlaps(box(part),t.box)){next.push(part);continue;}
        next.push(...subtract(part,t.p));
      }
      parts=next;if(!parts.length)break;
    }
    stats.queries++;if(hits.length)stats.cut++;stats.parts+=parts.length;
    return parts;
  }
  return {triangle,height,covered:(x,z)=>height(x,z)>-Infinity,cut,stats,
    get count(){return all.length;},get triangles(){return all;},clear(){grid.clear();all.length=0;}};
}
