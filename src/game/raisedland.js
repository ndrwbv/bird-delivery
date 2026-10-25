/* №0п68: земля над мощёным. До завершения физики — только ?raisedland.
   Контур берём из тех же треугольников, которыми нарисовано покрытие. */
import {createLandCover} from './landcover.js';
export const ON = typeof location!=='undefined'&&new URLSearchParams(location.search).has('raisedland');
export const LIFT=.46;
export const cover=ON?createLandCover():null,green=ON?createLandCover():null;
export const ST={paving:0,green:0,top:0,walls:0,built:false};
let building=false, outside=null;
export function onLand(x,z){
  if(!ST.built||outside?.(x,z))return false;
  return green.height(x,z)>cover.height(x,z)||!cover.covered(x,z);
}
export function offset(x,z,h){return onLand(x,z)?LIFT*Math.max(0,Math.min(1,h/.8)):0;}

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
export function record(ax,az,bx,bz,cx,cz,lift,r,g,b){
  if(!ON||building||ST.built||lift<.015||lift>.5)return;
  // Существующие зелёные вставки поверх плитки сохраняются как островки земли.
  const lawn=g>r*1.14&&g>b*1.14;
  const t=(lawn?green:cover).triangle(ax,az,bx,bz,cx,cz,lift);
  if(t){t.rgb=[r,g,b];if(lawn)ST.green++;else ST.paving++;}
}
export function* build({M,terrain,heights,groundH,groundHex,skip,buildings,triangulate}){
  if(!ON)return;
  building=true;outside=skip;
  try {
    // Под зданием грунт не поднимается в дверные проёмы и пол первого этажа.
    for(const b of buildings){
      const p=b.p;if(!p||p.length<3)continue;
      for(const [a,c,d] of triangulate(p))cover.triangle(...p[a],...p[c],...p[d],.5);
    }
    const {g,nx,nz,x0,z0}=terrain;
    const topH=(x,z)=>{const h=groundH(x,z);return h+LIFT*Math.max(0,Math.min(1,h/.8));};
    const walls=p=>{
      for(let i=0;i<p.length;i++){
        const a=p[i],b=p[(i+1)%p.length],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
        if(len<1e-5)continue;
        const x=(a[0]+b[0])/2,z=(a[1]+b[1])/2,ox=-dz/len*.0001,oz=dx/len*.0001;
        if(cover.covered(x+ox,z+oz)===cover.covered(x-ox,z-oz))continue;
        const floor=cover.height(x,z);if(!Number.isFinite(floor)||floor>=LIFT)continue;
        M.color('#829867');
        M.quad(a[0],groundH(...a)+floor,a[1],b[0],groundH(...b)+floor,b[1],b[0],topH(...b),b[1],a[0],topH(...a),a[1]);ST.walls++;
      }
    };
    let work=0;
    for(let j=0;j<nz-1;j++)for(let i=0;i<nx-1;i++){
      const x=x0+i*g,z=z0+j*g,k=j*nx+i;
      if(skip?.(x,z)&&skip(x+g,z)&&skip(x,z+g)&&skip(x+g,z+g))continue;
      if(Math.max(heights[k],heights[k+1],heights[k+nx],heights[k+nx+1])<=0)continue;
      for(const tri of [[[x,z],[x+g,z],[x,z+g]],[[x+g,z+g],[x,z+g],[x+g,z]]]){
        for(const p of cover.cut(tri)){
          M.color(groundHex(groundH((tri[0][0]+tri[1][0]+tri[2][0])/3,(tri[0][1]+tri[1][1]+tri[2][1])/3)));
          for(let v=1;v<p.length-1;v++){const a=p[0],b=p[v],c=p[v+1];M.up(a[0],topH(...a),a[1],b[0],topH(...b),b[1],c[0],topH(...c),c[1]);ST.top++;}
          walls(p);
        }
      }
      if(++work%128===0)yield 'земля';
    }
    // Цветные газоны не теряют форму и цвет; более высокое мощёное вырезается и в них.
    for(const t of green.triangles){
      const rgb=t.rgb;
      M.grad((x,z,c,o)=>{c[o]=rgb[0];c[o+1]=rgb[1];c[o+2]=rgb[2];});
      for(const p of cover.cut(t.p,t.lift))for(let v=1;v<p.length-1;v++){M.dtri(...p[0],...p[v],...p[v+1],t.lift+LIFT);ST.top++;}
      if(++work%128===0)yield 'газоны';
    }
    M.grad(null);ST.built=true;
  }finally{building=false;M.grad(null);}
}
