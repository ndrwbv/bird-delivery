/* №0п68: земля над мощёным. ?oldland — прежний вариант для сравнения.
   Контур берём из тех же треугольников, которыми нарисовано покрытие. */
import {createLandCover,intersectTriangle,intersectConvex} from './landcover.js';
import {LAND_LIFT,landLift,shoreParts} from './landheight.js';
import {landBoundary} from './landboundary.js';
import {landCleanTileRegion,landCleanTile,landWidth,contourWidth,LAND_MIN_WIDTH} from './landclean.js';
import {createLandMask} from './landmask.js';
import {landPaintEdges,shoreLine} from './landlayers.js';
import {mergeLandPieces} from './landpieces.js';
import {landSurfacePieces,SURFACE_STATS} from './landpatches.js';
import {createLandCleaner} from './landcleanpool.js';
export const ON = typeof location!=='undefined'&&!new URLSearchParams(location.search).has('oldland');
export const LIFT=LAND_LIFT;
export const cover=ON?createLandCover():null,green=ON?createLandCover():null;
const rawLand=(x,z)=>green.height(x,z)>cover.height(x,z)||!cover.covered(x,z);
export const finalMask=ON?createLandMask(rawLand,(...args)=>[...cover.breaks(...args),...green.breaks(...args)]):null;
export const ST={paving:0,green:0,top:0,walls:0,built:false,supportReady:false,surface:SURFACE_STATS};
export function compact(){if(ON){cover.compact();green.compact();}}
export function clearReadCaches(){if(ON){cover.clearReadCache();green.clearReadCache();finalMask.kept.clearReadCache();}}
export function boundaries(options){return finalMask?.ready?finalMask.boundaries({floorAt:(x,z)=>{const p=cover.height(x,z);return Number.isFinite(p)?p:.085;},floorBreaks:(...args)=>cover.breaks(...args,.49),...options,accept:(x,z)=>!outside?.(x,z)&&(!options?.accept||options.accept(x,z))}):landBoundary(cover,green,options);}
// Проверка ширины не добавляет технологический заход мощения на шов.
export function widthPatches(core){return landCleanTile(cover,green,core,LAND_MIN_WIDTH,0);}
export function widthAt(edge,t){return finalMask?.ready?contourWidth(finalMask,edge,t):landWidth(cover,green,edge,t);}
let building=false, outside=null;
export function activate(skip=null){
  if(!ON)return;
  if(!finalMask.ready)throw Error('Область земли ещё не готова');
  outside=skip;ST.supportReady=true;
}
function classifiedLand(x,z){return finalMask?.ready?finalMask.contains(x,z):rawLand(x,z);}
export function boundaryAt(x,z,nx,nz){
  return [.12,.25,.5].some(r=>classifiedLand(x+nx*r,z+nz*r)&&!classifiedLand(x-nx*r,z-nz*r));
}
export function boundaryRanges(P,ux,uz,nx,nz,start,end){
  const cuts=[start,end],length=end-start;
  if(length<=0)return [];
  for(const r of [.12,.25,.5])for(const side of [-1,1]){
    const ax=P[0]+ux*start+nx*r*side,az=P[1]+uz*start+nz*r*side,bx=P[0]+ux*end+nx*r*side,bz=P[1]+uz*end+nz*r*side;
    for(const C of finalMask?.ready?[finalMask]:[cover,green])for(const t of C.breaks(ax,az,bx,bz))cuts.push(start+t*length);
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
  const g=green.height(x,z);
  // Готовый контур уже решил, где находится газон. Камень спрашивает
  // высоту на каждом торце: повторно искать мощение здесь не нужно.
  return landLift(h)+(finalMask?.ready?Math.max(0,g):g>cover.height(x,z)?Math.max(0,g):0);
}
export function onLand(x,z){
  if(!(ST.supportReady||ST.built)||outside?.(x,z))return false;
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
  if(!ON||building||ST.supportReady||ST.built||lift<.015||lift>.5)return;
  // Существующие зелёные вставки поверх плитки сохраняются как островки земли.
  const lawn=g>r*1.14&&g>b*1.14;
  const C=lawn?green:cover,t=C.triangle(ax,az,bx,bz,cx,cz,lift);
  if(t){
    t.rgb=[r,g,b];t.initial=initial;if(lawn)ST.green++;else ST.paving++;
    // Не держим промежуточные объекты всего города до конца загрузки.
    if(C.rawCount>=16384)C.compact();
    return lawn;
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
export function* cleanContours({M,triangulate,skip,terrain,groundH,deferDraw=false}){
  const fills=createLandCover();
  ST.minWidth=LAND_MIN_WIDTH;ST.cleanedArea=0;ST.fillTriangles=0;ST.fillDraw=0;ST.cleanTiles=0;
  const distance=(x,z,a,b)=>{
    const dx=b[0]-a[0],dz=b[1]-a[1],k=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
    return Math.hypot(x-a[0]-dx*k,z-a[1]-dz*k);
  };
  const fillPatch=patch=>{
    const {points,triangles}=triangulate(patch.outer,patch.holes);
    const layers=deferDraw?null:new Map();
    for(const ids of triangles){
      const p=ids.map(i=>points[i]),x=(p[0][0]+p[1][0]+p[2][0])/3,z=(p[0][1]+p[1][1]+p[2][1])/3;
      const area=Math.abs((p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[1][1]-p[0][1])*(p[2][0]-p[0][0]))/2;
      if(area<1e-6)continue;
      let closest=null,best=Infinity;
      for(const t of cover.inBox([x-2,z-2,x+2,z+2])){
        if(t.lift>=.49||!t.rgb)continue;
        const d=Math.min(...t.p.map((a,i)=>distance(x,z,a,t.p[(i+1)%3])));
        if(d<best){best=d;closest=t;}
      }
      const box=[Math.min(...p.map(q=>q[0])),Math.min(...p.map(q=>q[1])),Math.max(...p.map(q=>q[0])),Math.max(...p.map(q=>q[1]))];
      let floor=(closest?.lift||.085)+.001;
      for(const t of green.inBox(box))floor=Math.max(floor,t.lift+.001);
      const rgb=closest?.rgb||[177,173,159];
      const t=fills.triangle(...p[0],...p[1],...p[2],floor);if(!t)continue;
      t.rgb=rgb;
      if(deferDraw){
        // Опора нужна сразу всему городу, рисунок заполнения — только
        // загруженному участку. Та же отметка, что у песка площадок,
        // сохраняется в компактных страницах и рисуется в build().
        t.initial=true;
      }else{
        const key=floor+'|'+rgb.join(',');let layer=layers.get(key);
        if(!layer)layers.set(key,layer={floor,rgb,parts:[]});layer.parts.push(t.p);
      }
      ST.cleanedArea+=area;ST.fillTriangles++;
      if(fills.rawCount>=16384)fills.compact();
    }
    // Одноцветное заполнение тоже не должно хранить внутренние
    // диагонали исходной триангуляции под видом отдельных поверхностей.
    for(const {floor,rgb,parts}of layers?.values()||[]){
      M.grad((x,z,c,o)=>{c[o]=rgb[0];c[o+1]=rgb[1];c[o+2]=rgb[2];});
      for(const p of mergeLandPieces(parts))for(const q of terrainParts(p,terrain))for(let i=1;i<q.length-1;i++){
        const a=q[0],b=q[i],c=q[i+1];
        if(Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))<1e-8)continue;
        M.up(a[0],groundH(...a)+floor,a[1],b[0],groundH(...b)+floor,b[1],c[0],groundH(...c)+floor,c[1]);ST.fillDraw++;
      }
      M.grad(null);
    }
  };
  let cleaner=null;
  building=true;
  try{
    const cores=[];
    for(const core of cover.cells()){
      finalMask.reserve(core);
      const [x0,z0,x1,z1]=core;
      if(skip&&[[x0,z0],[x1,z0],[x1,z1],[x0,z1],[(x0+x1)/2,(z0+z1)/2]].every(p=>skip(...p)))continue;
      cores.push(core);
    }
    cleaner=createLandCleaner({cover,green,cores,stats:ST});
    for(let batch=0;batch<cleaner.batches;batch++){
      const request=cleaner.take(batch),results=Array.isArray(request)?request:yield request;
      for(let i=0;i<results.length;i++){
        const core=cores[batch*cleaner.batchSize+i],cleaned=results[i];
        finalMask.add(core,cleaned.kept,triangulate);
        for(const patch of cleaned.removed)fillPatch(patch);
        ST.cleanTiles++;
        yield 'цельные газоны';
      }
    }
    cleaner.close();cleaner=null;
    // Все клетки считают исходный город: добавляем исправления в общий
    // контур только после обхода, чтобы порядок клеток не влиял на форму.
    yield* finalMask.finishSteps();
    for(let i=0;i<finalMask.removedRegions.length;i++){
      fillPatch(finalMask.removedRegions[i]);finalMask.removedRegions[i]=null;
      if(i%64===63)yield 'завершённые покрытия';
    }
    finalMask.removedRegions.length=0;
    fills.compact();
    // Заполнение уже упаковано: переносим готовые страницы, не создавая
    // снова полмиллиона треугольников и временных массивов их точек.
    cover.absorb(fills);
    cover.compact();ST.maskTriangles=finalMask.count;ST.maskEdges=finalMask.segments.length/4;ST.cleanedArea=Math.round(ST.cleanedArea*100)/100;
  }finally{cleaner?.close();fills.clear();building=false;M.grad(null);}
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
// Небольшие поверхности можно собирать независимо после общей очистки
// и activate(): опора города при этом уже окончательная. Границы — в
// координатах мира; лучше совмещать их с блоками рельефа (4 × terrain.g).
// Счётчики накапливаются, готовность всего рисунка объявляет планировщик.
export function finishSurface(){ST.built=true;}
export function* build({M,terrain,heights,groundH,groundHex,skip,buildings,triangulate,curbed=false,flushThrough,bounds=null}){
  if(!ON)return;
  building=true;outside=skip;M.grad(null);
  try {
    // Под зданием сохраняем исходный пол, без поднятого газона в дверях.
    prepare(buildings,triangulate);
    const {g,nx,nz,x0,z0}=terrain;
    if(bounds&&(!(bounds.length===4)||!bounds.every(Number.isFinite)||bounds[0]>=bounds[2]||bounds[1]>=bounds[3]))throw Error('Неверные границы участка земли');
    const frame=bounds?[[bounds[0],bounds[1]],[bounds[2],bounds[1]],[bounds[2],bounds[3]],[bounds[0],bounds[3]]]:null;
    const clip=p=>!frame||p.every(v=>v[0]>=bounds[0]&&v[0]<=bounds[2]&&v[1]>=bounds[1]&&v[1]<=bounds[3])?p:intersectConvex(p,frame);
    const intersects=p=>!bounds||Math.min(...p.map(v=>v[0]))<=bounds[2]&&Math.max(...p.map(v=>v[0]))>=bounds[0]&&Math.min(...p.map(v=>v[1]))<=bounds[3]&&Math.max(...p.map(v=>v[1]))>=bounds[1];
    const tessellate=(outer,holes)=>({points:[...outer,...holes.flat()],triangles:triangulate(outer,holes)});
    const surfaceParts=(parts,extra=0)=>landSurfacePieces(mergeLandPieces(parts),tessellate,(a,b)=>{
      const y=p=>{const h=groundH(...p);return Math.fround(h+landLift(h)+extra);};
      return Math.fround(a[0])===Math.fround(b[0])&&Math.fround(a[1])===Math.fround(b[1])&&y(a)===y(b);
    });
    const draw=(p,extra=0,raise=true)=>{
      const points=p.map(q=>[q[0],q[1],groundH(...q)]);
      for(const part of raise?shoreParts(points):[points])for(let i=1;i<part.length-1;i++){
        const a=part[0],b=part[i],c=part[i+1];
        if(Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))<1e-8)continue;
        const y=q=>q[2]+(raise?landLift(q[2]):0)+extra;
        M.up(a[0],y(a),a[1],b[0],y(b),b[1],c[0],y(c),c[1]);ST.top++;
      }
    };
    const stride=bounds?1:128;
    let work=0;if(!bounds)ST.paintWalls=0;else ST.paintWalls??=0;
    // Окрашенные участки и голая земля не перекрываются. Записываем
    // цветные части первыми: готовый ряд затем отдаётся целиком,
    // без второй склейки той же клетки и без копий всей голой земли.
    // Цветные вставки используют ту же береговую сетку и тот же закон высоты.
    let paintWork=0;
    for(const t of bounds?green.inBox(bounds):green.triangles){
      const rgb=t.rgb;
      // У наложенных газонов остаётся только верхняя поверхность;
      // равные по высоте используют последний записанный цвет.
      const localTriangle=clip(t.p);if(!localTriangle.length)continue;
      const visible=green.cut(localTriangle,t.lift,u=>u.lift>t.lift||u.id>t.id);
      for(const piece of visible)for(const local of terrainParts(piece,terrain)){
        for(const part of surfaceParts([...(finalMask.ready?finalMask.parts(local,q=>cover.cut(q,t.lift)):cover.cut(local,t.lift))],t.lift)){
          M.grad((x,z,c,o)=>{c[o]=rgb[0];c[o+1]=rgb[1];c[o+2]=rgb[2];});
          draw(part,t.lift);M.grad(null);
        }
        if(++paintWork%stride===0)yield 'газоны';
      }
      if(++work%stride===0)yield 'газоны';
    }
    const paintTop=ST.top;
    // За оградой сохраняем прежнюю крупную сетку и её высоту; под водой — дно.
    const i0=bounds?Math.max(0,Math.floor((bounds[0]-x0)/(g*4))*4):0,j0=bounds?Math.max(0,Math.floor((bounds[1]-z0)/(g*4))*4):0;
    const i1=bounds?Math.min(nx-1,Math.ceil((bounds[2]-x0)/(g*4))*4):nx-1,j1=bounds?Math.min(nz-1,Math.ceil((bounds[3]-z0)/(g*4))*4):nz-1;
    for(let bj=j0;bj<j1;bj+=4)for(let bi=i0;bi<i1;bi+=4){
      if(bi===i0&&flushThrough)yield* flushThrough(z0+bj*g);
      const ei=Math.min(bi+4,nx-1),ej=Math.min(bj+4,nz-1),ax=x0+bi*g,az=z0+bj*g,bx=x0+ei*g,bz=z0+ej*g;
      if(skip?.(ax,az)&&skip(bx,az)&&skip(ax,bz)&&skip(bx,bz)&&skip((ax+bx)/2,(az+bz)/2)){
        const h=(i,j)=>heights[j*nx+i]-.3;
        if(!bounds){
          M.color(groundHex((h(bi,bj)+h(ei,bj)+h(bi,ej))/3));M.up(ax,h(bi,bj),az,bx,h(ei,bj),az,ax,h(bi,ej),bz);
          M.color(groundHex((h(ei,ej)+h(ei,bj)+h(bi,ej))/3));M.up(bx,h(ei,ej),bz,ax,h(bi,ej),bz,bx,h(ei,bj),az);ST.top+=2;
          continue;
        }
        for(const ids of [[[bi,bj],[ei,bj],[bi,ej]],[[ei,ej],[bi,ej],[ei,bj]]]){
          const tri=ids.map(([i,j])=>[x0+i*g,z0+j*g]),hs=ids.map(([i,j])=>h(i,j)),p=clip(tri);if(!p.length)continue;
          const [a,b,c]=tri,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
          const y=q=>{const u=((b[1]-c[1])*(q[0]-c[0])+(c[0]-b[0])*(q[1]-c[1]))/den,v=((c[1]-a[1])*(q[0]-c[0])+(a[0]-c[0])*(q[1]-c[1]))/den;return u*hs[0]+v*hs[1]+(1-u-v)*hs[2];};
          M.color(groundHex((hs[0]+hs[1]+hs[2])/3));
          for(let k=1;k<p.length-1;k++){M.up(p[0][0],y(p[0]),p[0][1],p[k][0],y(p[k]),p[k][1],p[k+1][0],y(p[k+1]),p[k+1][1]);ST.top++;}
        }
        continue;
      }
      for(let j=bj;j<ej;j++)for(let i=bi;i<ei;i++){
        const x=x0+i*g,z=z0+j*g;
        for(const tri of [[[x,z],[x+g,z],[x,z+g]],[[x+g,z+g],[x,z+g],[x+g,z]]]){
          const local=clip(tri);if(!local.length)continue;
          const raised=!tri.every(q=>skip?.(...q));
          const parts=raised?(finalMask.ready?finalMask.parts(local,q=>cover.cut(q)):cover.cut(local)):[local];
          const bareParts=surfaceParts([...parts].flatMap(p=>raised?green.cut(p):[p]));
          const hex=groundHex(groundH((tri[0][0]+tri[1][0]+tri[2][0])/3,(tri[0][1]+tri[1][1]+tri[2][1])/3));
          // Под цветным слоем нет второй скрытой поверхности земли.
          for(const bare of bareParts){
            M.color(hex);draw(bare,0,raised);
            if(!raised)continue;
            for(const edge of landPaintEdges(bare,green,finalMask.ready?finalMask:null)){
              const a=[...edge.a,groundH(...edge.a)],b=[...edge.b,groundH(...edge.b)];M.color('#829867');
              for(const [u,v] of shoreLine(a,b)){
                const yu=u[2]+landLift(u[2]),yv=v[2]+landLift(v[2]);
                M.quad(u[0],yu,u[1],v[0],yv,v[1],v[0],yv+edge.height,v[1],u[0],yu+edge.height,u[1]);ST.paintWalls++;
              }
            }
          }
        }
        if(++work%stride===0)yield 'земля';
      }
    }
    if(flushThrough)yield* flushThrough(Infinity);
    ST.baseTop=(bounds?(ST.baseTop||0):0)+ST.top-paintTop;
    // Вертикальный торец есть только на настоящей границе газона.
    // Внутренние диагонали и наложенные зелёные слои стенок не создают.
    for(const edge of curbed?[]:boundaries({includeWalls:true})){
      if(!edge){yield 'торцы земли';continue;}
      let {a,b}=edge;const {lift}=edge;
      if(bounds){
        const dx=b[0]-a[0],dz=b[1]-a[1];let lo=0,hi=1;
        for(const [p,d,min,max]of [[a[0],dx,bounds[0],bounds[2]],[a[1],dz,bounds[1],bounds[3]]]){
          if(!d){if(p<min||p>max){hi=-1;break;}continue;}
          const u=(min-p)/d,v=(max-p)/d;lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));
        }
        if(hi-lo<1e-9)continue;
        const start=a;a=[start[0]+dx*lo,start[1]+dz*lo];b=[start[0]+dx*hi,start[1]+dz*hi];
        // Совпавший с границей торец принадлежит соседу справа/снизу.
        if(a[0]===bounds[2]&&b[0]===bounds[2]&&bounds[2]<x0+(nx-1)*g||a[1]===bounds[3]&&b[1]===bounds[3]&&bounds[3]<z0+(nz-1)*g)continue;
      }
      const x=(a[0]+b[0])/2,z=(a[1]+b[1])/2;
      const extra=Math.max(0,green.height(x,z));
      if(lift>=landLift(groundH(x,z))+extra)continue;
      const ha=groundH(...a),hb=groundH(...b);
      M.color('#829867');
      M.quad(a[0],ha+lift,a[1],b[0],hb+lift,b[1],b[0],hb+topOffset(...b,hb),b[1],a[0],ha+topOffset(...a,ha),a[1]);ST.walls++;
    }
    // Песок площадок и другие незелёные участки исходной земли — тоже пол,
    // поэтому они остаются в своих вырезах на прежней высоте.
    for(const t of bounds?cover.inBox(bounds).filter(t=>t.initial):cover.initialTriangles){
      const rgb=t.rgb;
      M.grad((x,z,c,o)=>{c[o]=rgb[0];c[o+1]=rgb[1];c[o+2]=rgb[2];});
      const local=clip(t.p);
      if(local.length)for(const p of terrainParts(local,terrain))draw(p,t.lift,false);
      M.grad(null);
      if(++work%stride===0)yield 'площадки';
    }
    M.color('#9f9d8e');
    for(const b of buildings)if(b.p?.length>=3&&intersects(b.p)){
      if(!bounds)M.poly(b.p,0);
      else for(const ids of triangulate(b.p,[])){
        const p=clip(ids.map(i=>b.p[i]));if(p.length)M.poly(p,0);
      }
      if(bounds&&++work%stride===0)yield 'пол зданий';
    }
    M.grad(null);if(bounds)ST.surfaceTiles=(ST.surfaceTiles||0)+1;else finishSurface();
  }finally{building=false;M.grad(null);}
}
