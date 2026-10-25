/* №0п68: земля над мощёным. До завершения физики — только ?raisedland.
   Контур берём из тех же треугольников, которыми нарисовано покрытие. */
import {createLandCover,intersectTriangle} from './landcover.js';
import {LAND_LIFT,landLift,shoreParts} from './landheight.js';
import {landBoundary} from './landboundary.js';
export const ON = typeof location!=='undefined'&&new URLSearchParams(location.search).has('raisedland');
export const LIFT=LAND_LIFT;
export const cover=ON?createLandCover():null,green=ON?createLandCover():null;
export const ST={paving:0,green:0,top:0,walls:0,built:false};
export function compact(){if(ON){cover.compact();green.compact();}}
export function boundaries(options){return landBoundary(cover,green,options);}
let building=false, outside=null;
function classifiedLand(x,z){return green.height(x,z)>cover.height(x,z)||!cover.covered(x,z);}
export function boundaryAt(x,z,nx,nz){
  return [.12,.25,.5].some(r=>classifiedLand(x+nx*r,z+nz*r)&&!classifiedLand(x-nx*r,z-nz*r));
}
export function boundaryRanges(P,ux,uz,nx,nz,start,end){
  const cuts=[start,end],length=end-start;
  if(length<=0)return [];
  for(const r of [.12,.25,.5])for(const side of [-1,1]){
    const ax=P[0]+ux*start+nx*r*side,az=P[1]+uz*start+nz*r*side,bx=P[0]+ux*end+nx*r*side,bz=P[1]+uz*end+nz*r*side;
    for(const C of [cover,green])for(const t of C.breaks(ax,az,bx,bz))cuts.push(start+t*length);
  }
  cuts.sort((a,b)=>a-b);
  const out=[];
  for(let i=1;i<cuts.length;i++){
    const a=cuts[i-1],b=cuts[i];if(b-a<1e-7)continue;
    const mid=(a+b)/2;if(!boundaryAt(P[0]+ux*mid,P[1]+uz*mid,nx,nz))continue;
    const last=out.at(-1);if(last&&a-last[1]<1e-7)last[1]=b;else out.push([a,b]);
  }
  return out;
}
export function topOffset(x,z,h){
  const g=green.height(x,z),p=cover.height(x,z);
  return landLift(h)+(g>p?Math.max(0,g):0);
}
export function onLand(x,z){
  if(!ST.built||outside?.(x,z))return false;
  return classifiedLand(x,z);
}
export function offset(x,z,h){return onLand(x,z)?landLift(h):0;}

export function alignObjects({lists,items,props,benches,baseH}){
  const delta=(x,z)=>offset(x,z,baseH(x,z));
  for(const list of lists)for(const g of list){
    if(!g.landAnchor)continue;
    const d=delta(...g.landAnchor),a=g.p||g.attributes.position.array;
    if(d&&a)for(let i=1;i<a.length;i+=3)a[i]+=d;
    if(d&&!g.p){g.boundingBox=null;g.boundingSphere=null;}
    delete g.landAnchor;
  }
  for(const it of items){
    const d=delta(it.x,it.z),attr=it.mesh?.geometry.attributes.position;
    if(!d||!attr?.array)continue;
    for(let i=it.v0;i<it.v0+it.nv;i++)attr.array[i*3+1]+=d;
    attr.addUpdateRange(it.v0*3,it.nv*3);attr.needsUpdate=true;
  }
  for(const p of props)p.pivot.position.y+=delta(p.x,p.z);
  for(const b of benches)b.y+=delta(b.x,b.z);
  return delta;
}
export function record(ax,az,bx,bz,cx,cz,lift,r,g,b,initial=false){
  if(!ON||building||ST.built||lift<.015||lift>.5)return;
  // Существующие зелёные вставки поверх плитки сохраняются как островки земли.
  const lawn=g>r*1.14&&g>b*1.14;
  const C=lawn?green:cover,t=C.triangle(ax,az,bx,bz,cx,cz,lift);
  if(t){
    t.rgb=[r,g,b];t.initial=initial;if(lawn)ST.green++;else ST.paving++;
    // Не держим промежуточные объекты всего города до конца загрузки.
    if(C.rawCount>=16384)C.compact();
  }
}
let prepared=false;
export function prepare(buildings,triangulate){
  if(!ON||prepared)return;
  for(const b of buildings){
    const p=b.p;if(!p||p.length<3)continue;
    for(const [a,c,d] of triangulate(p))cover.triangle(...p[a],...p[c],...p[d],.5);
  }
  prepared=true;
  compact();
}
function* terrainParts(p,{g,nx,nz,x0,z0}){
  const clamp=(v,n)=>Math.max(0,Math.min(n-2,v));
  const i0=clamp(Math.floor((Math.min(...p.map(v=>v[0]))-x0)/g),nx),i1=clamp(Math.floor((Math.max(...p.map(v=>v[0]))-x0)/g),nx);
  const j0=clamp(Math.floor((Math.min(...p.map(v=>v[1]))-z0)/g),nz),j1=clamp(Math.floor((Math.max(...p.map(v=>v[1]))-z0)/g),nz);
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
    const x=x0+i*g,z=z0+j*g;
    for(const tri of [[[x,z],[x+g,z],[x,z+g]],[[x+g,z+g],[x,z+g],[x+g,z]]]){
      const part=intersectTriangle(p,tri);if(part.length)yield part;
    }
  }
}
export function* build({M,terrain,heights,groundH,groundHex,skip,buildings,triangulate}){
  if(!ON)return;
  building=true;outside=skip;M.grad(null);
  try {
    // Под зданием сохраняем исходный пол, без поднятого газона в дверях.
    prepare(buildings,triangulate);
    const {g,nx,nz,x0,z0}=terrain;
    const visibleLand=(x,z)=>!skip?.(x,z)&&(green.height(x,z)>cover.height(x,z)||!cover.covered(x,z));
    const draw=(p,extra=0,raise=true)=>{
      const points=p.map(q=>[q[0],q[1],groundH(...q)]);
      for(const part of raise?shoreParts(points):[points])for(let i=1;i<part.length-1;i++){
        const a=part[0],b=part[i],c=part[i+1];
        if(Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))<1e-8)continue;
        const y=q=>q[2]+(raise?landLift(q[2]):0)+extra;
        M.up(a[0],y(a),a[1],b[0],y(b),b[1],c[0],y(c),c[1]);ST.top++;
      }
    };
    const walls=(p,extra=0)=>{
      for(let i=0;i<p.length;i++){
        const a=p[i],b=p[(i+1)%p.length],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
        if(len<1e-5)continue;
        const x=(a[0]+b[0])/2,z=(a[1]+b[1])/2,ox=-dz/len*.0001,oz=dx/len*.0001;
        if(visibleLand(x+ox,z+oz)===visibleLand(x-ox,z-oz))continue;
        const floor=cover.height(x,z);
        if(!Number.isFinite(floor)||floor>=landLift(groundH(x,z))+extra)continue;
        M.color('#829867');
        const ha=groundH(...a),hb=groundH(...b);
        M.quad(a[0],ha+floor,a[1],b[0],hb+floor,b[1],b[0],hb+landLift(hb)+extra,b[1],a[0],ha+landLift(ha)+extra,a[1]);ST.walls++;
      }
    };
    let work=0;
    // За оградой сохраняем прежнюю крупную сетку и её высоту; под водой — дно.
    for(let bj=0;bj<nz-1;bj+=4)for(let bi=0;bi<nx-1;bi+=4){
      const ei=Math.min(bi+4,nx-1),ej=Math.min(bj+4,nz-1),ax=x0+bi*g,az=z0+bj*g,bx=x0+ei*g,bz=z0+ej*g;
      if(skip?.(ax,az)&&skip(bx,az)&&skip(ax,bz)&&skip(bx,bz)&&skip((ax+bx)/2,(az+bz)/2)){
        const h=(i,j)=>heights[j*nx+i]-.3;
        M.color(groundHex((h(bi,bj)+h(ei,bj)+h(bi,ej))/3));M.up(ax,h(bi,bj),az,bx,h(ei,bj),az,ax,h(bi,ej),bz);
        M.color(groundHex((h(ei,ej)+h(ei,bj)+h(bi,ej))/3));M.up(bx,h(ei,ej),bz,ax,h(bi,ej),bz,bx,h(ei,bj),az);ST.top+=2;
        continue;
      }
      for(let j=bj;j<ej;j++)for(let i=bi;i<ei;i++){
        const x=x0+i*g,z=z0+j*g;
        for(const tri of [[[x,z],[x+g,z],[x,z+g]],[[x+g,z+g],[x,z+g],[x+g,z]]]){
          const raised=!tri.every(q=>skip?.(...q));
          const parts=raised?cover.cut(tri):[tri];
          for(const p of parts){
            M.color(groundHex(groundH((tri[0][0]+tri[1][0]+tri[2][0])/3,(tri[0][1]+tri[1][1]+tri[2][1])/3)));
            draw(p,0,raised);if(raised)walls(p);
          }
        }
        if(++work%128===0)yield 'земля';
      }
    }
    // Цветные вставки используют ту же береговую сетку и тот же закон высоты.
    for(const t of green.triangles){
      const rgb=t.rgb;
      for(const p of cover.cut(t.p,t.lift))for(const part of terrainParts(p,terrain)){
        M.grad((x,z,c,o)=>{c[o]=rgb[0];c[o+1]=rgb[1];c[o+2]=rgb[2];});
        draw(part,t.lift);M.grad(null);walls(part,t.lift);
      }
      if(++work%128===0)yield 'газоны';
    }
    // Песок площадок и другие незелёные участки исходной земли — тоже пол,
    // поэтому они остаются в своих вырезах на прежней высоте.
    for(const t of cover.triangles)if(t.initial){
      const rgb=t.rgb;
      M.grad((x,z,c,o)=>{c[o]=rgb[0];c[o+1]=rgb[1];c[o+2]=rgb[2];});
      for(const p of terrainParts(t.p,terrain))draw(p,t.lift,false);
      M.grad(null);
      if(++work%128===0)yield 'площадки';
    }
    M.color('#9f9d8e');
    for(const b of buildings)if(b.p?.length>=3)M.poly(b.p,0);
    M.grad(null);ST.built=true;
  }finally{building=false;M.grad(null);}
}
