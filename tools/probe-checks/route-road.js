/* 0п123: реальный маршрут, ширина и смещение всей полосы — только на автомобильных дорогах.
   Проверка независима от roadwayAt: собственная сетка по CITY.roads, без пешеходок/обрывков.
   Steam Deck: npm run probe -- --mode=steam --size=deck --cpu=3 --q='gfx=high&gfxdev=deck' --eval=tools/probe-checks/route-road.js */
await onShift(); autopilot(false);
await until(() => !d.LATE.busy(), 90000);
d.CITYOPEN.unlockAll(); d.districtLocks(); d.setPause(true);
const W = [20,16,13.5,11,9,7,5,5.5], CELL = 40, grid = new Map(), segments = [];
for (const road of d.CITY.roads) {
  if (road.x || road.c === 6) continue;
  for (let i = 1; i < road.p.length; i++) {
    const a=road.p[i-1],b=road.p[i],w=(road.w||W[road.c])/2;
    if(Math.hypot(b[0]-a[0],b[1]-a[1])<.1)continue;
    const seg={ax:a[0],az:a[1],bx:b[0],bz:b[1],w,road};segments.push(seg);
    for(let x=Math.floor((Math.min(a[0],b[0])-w)/CELL);x<=Math.floor((Math.max(a[0],b[0])+w)/CELL);x++)
      for(let z=Math.floor((Math.min(a[1],b[1])-w)/CELL);z<=Math.floor((Math.max(a[1],b[1])+w)/CELL);z++){
        const key=x+','+z;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(seg);
      }
  }
}
const offRoad = (x,z) => {
  let out=Infinity;
  for(const s of grid.get(Math.floor(x/CELL)+','+Math.floor(z/CELL))||[]){
    const dx=s.bx-s.ax,dz=s.bz-s.az,t=Math.max(0,Math.min(1,((x-s.ax)*dx+(z-s.az)*dz)/(dx*dx+dz*dz)));
    out=Math.min(out,Math.hypot(x-s.ax-dx*t,z-s.az-dz*t)-s.w);
  }
  return out;
};
const origin={x:d.V.x,z:d.V.z,h:d.V.h},target0=d.S.target,ride0=d.S.ride,sync0=d.RT.sync;
const pz=d.PZ_CUR,spots=d.SPOTS.filter(p=>Math.hypot(p.x-pz.x,p.z-pz.z)>30).sort((a,b)=>Math.hypot(a.x-pz.x,a.z-pz.z)-Math.hypot(b.x-pz.x,b.z-pz.z));
const shop=d.SIGNS.find(s=>/кулёк/i.test(s.nk||s.n||s.n0||''))||d.SIGNS.find(s=>Math.hypot(s.x-pz.x,s.z-pz.z)>50);
const gennady=d.STORY_DBG.homeOf('gennady'),bridge=segments.find(s=>s.road.b&&Math.hypot(s.bx-s.ax,s.bz-s.az)>10);
const tests=[];
for(const p of spots.slice(0,6))tests.push({kind:'обычный адрес',from:pz,to:p});
for(let i=1;i<Math.min(spots.length,120);i+=12)tests.push({kind:'разные дворы',from:spots[i],to:spots[(i+31)%spots.length]});
if(shop)tests.push({kind:'магазин',from:pz,to:{x:shop.x+(shop.nx||0)*2,z:shop.z+(shop.nz||0)*2}});
if(gennady)tests.push({kind:'Геннадий',from:pz,to:gennady});
if(bridge)tests.push({kind:'мост',from:{x:bridge.ax,z:bridge.az,h:Math.atan2(bridge.bx-bridge.ax,bridge.bz-bridge.az)},to:{x:bridge.bx,z:bridge.bz},deck:true});
tests.push({kind:'несколько адресов 1',from:pz,to:spots[2]},{kind:'несколько адресов 2',from:spots[2],to:spots[5]},{kind:'возврат в пиццерию',from:spots[5],to:pz});
const edge=segments.find(s=>s.w>4&&Math.hypot(s.ax-pz.x,s.az-pz.z)<200&&Math.hypot(s.bx-s.ax,s.bz-s.az)>20);
if(edge){const dx=edge.bx-edge.ax,dz=edge.bz-edge.az,l=Math.hypot(dx,dz);tests.push({kind:'у края полотна',from:{x:(edge.ax+edge.bx)/2-dz/l*(edge.w-.1),z:(edge.az+edge.bz)/2+dx/l*(edge.w-.1),h:Math.atan2(dx,dz)},to:spots[4]});}
const maxX=Math.max(...segments.map(s=>Math.max(s.ax,s.bx)));
tests.push({kind:'нет дороги у старта',from:{x:maxX+10000,z:pz.z},to:pz,empty:true});
tests.push({kind:'нет дороги у цели',from:pz,to:{x:maxX+10000,z:pz.z},empty:true});
const atNode=new Map(d.NODES.map((n,i)=>[n.x+','+n.z,i]));
if(edge&&gennady)tests.push({kind:'несвязанные компоненты',from:{x:(edge.ax+edge.bx)/2,z:(edge.az+edge.bz)/2,h:Math.atan2(edge.bx-edge.ax,edge.bz-edge.az)},to:gennady,isolated:edge});
const rows=[],fail=[];
const supported=(a,b,s)=>{
  const dx=s.bx-s.ax,dz=s.bz-s.az,ll=dx*dx+dz*dz;
  return [a,b].every(p=>{const t=((p[0]-s.ax)*dx+(p[1]-s.az)*dz)/ll;return t>=-.001&&t<=1.001&&Math.hypot(p[0]-s.ax-dx*t,p[1]-s.az-dz*t)<.05;});
};
function checkPoint(row,x,z,kind){
  row.samples++;
  const off=offRoad(x,z);
  row.maxOutside=Math.max(row.maxOutside,off);
  if(off>.15&&row.bad.length<5)row.bad.push({kind,x:+x.toFixed(2),z:+z.toFixed(2),out:+off.toFixed(3)});
  if(kind==='route'&&d.inHouse(x,z)&&row.bad.length<5){
    const arch=d.ARCHES.some(a=>{const dx=x-a.mx,dz=z-a.mz,l=dx*a.ix+dz*a.iz,w=dx*a.ux+dz*a.uz;return l>-1&&l<a.t+1&&Math.abs(w)<2.2;});
    if(!arch)row.bad.push({kind:'house',x:+x.toFixed(2),z:+z.toFixed(2)});
  }
}
try{
  d.S.ride=false;d.RT.sync=true;
  for(const job of tests){
    const fx=[];
    if(job.isolated){
      const a=atNode.get(job.isolated.ax+','+job.isolated.az),b=atNode.get(job.isolated.bx+','+job.isolated.bz);
      for(const [n,other]of[[a,b],[b,a]]){fx.push([n,d.NODES[n].fx]);d.NODES[n].fx=new Set(d.NODES[n].nb.filter(v=>v!==other));}
      d.RP.sa=d.RP.sb=-1;
    }
    const V=d.V;V.x=job.from.x;V.z=job.from.z;V.h=job.from.h||0;V.vx=V.vz=0;V.y=job.deck?d.surfaceAt(V.x,V.z,100):d.groundH(V.x,V.z);
    const target={x:job.to.x,z:job.to.z,name:job.kind};d.S.target=target;d.S.state=job.kind==='возврат в пиццерию'?'back':'drive';
    d.RP.cur=null;d.rebuildRoutePath(true);
    d.updateRouteLine(1);d.updateRouteLine(1);
    const P=d.route,row={kind:job.kind,points:P.length,samples:0,maxOutside:0,bad:[],ribbon:0,goalDistance:P.length?+Math.hypot(P.at(-1)[0]-target.x,P.at(-1)[1]-target.z).toFixed(2):null};
    if(P.length<2&&!job.empty){
      const raw=d.drivingPath(V.x,V.z,target.x,target.z,V.h,!!job.deck);
      row.atRoadStop=raw.length>1&&raw.every(p=>Math.hypot(p[0]-raw[0][0],p[1]-raw[0][1])<.011);
      if(!row.atRoadStop)row.empty={from:[V.x,V.z],to:[target.x,target.z],raw};
    }
    if(job.empty){if(P.length||d.routeOn)fail.push(job.kind+': нарисован выдуманный путь');}
    else if(P.length<2&&!row.atRoadStop)fail.push(job.kind+': нет маршрута');
    if(d.S.target!==target||target.x!==job.to.x||target.z!==job.to.z)fail.push(job.kind+': цель доставки изменилась');
    for(let i=1;i<P.length;i++){
      const a=P[i-1],b=P[i],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.5));
      const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],near=grid.get(Math.floor(mid[0]/CELL)+','+Math.floor(mid[1]/CELL))||[];
      if(!near.some(s=>supported(a,b,s))&&row.bad.length<5)row.bad.push({kind:'нет ребра между точками',a,b});
      for(let k=0;k<=n;k++)checkPoint(row,a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n,'route');
    }
    if(job.isolated&&!P.every(p=>supported(p,p,job.isolated)))fail.push(job.kind+': прыжок в недостижимую компоненту');
    for(const slot of d.ROUTE_LINE.slots){
      if(!slot.m.visible)continue;
      const {pos,dist,U}=slot,vertices=[];
      const car=U.uCar.value,blend=U.uBlend.value,off=U.uOff.value;
      for(let i=0;i<slot.n*2;i++){
        let t=Math.max(0,Math.min(1,(dist[i]-car)/blend));t=1-t*t*(3-2*t);
        vertices.push([pos[i*3]+off.x*t,pos[i*3+2]+off.y*t]);
      }
      const ix=slot.geo.index.array;
      for(let i=0;i<slot.geo.drawRange.count;i+=3){
        const [a,b,c]=[vertices[ix[i]],vertices[ix[i+1]],vertices[ix[i+2]]];
        const n=Math.max(1,Math.ceil(Math.max(Math.hypot(a[0]-b[0],a[1]-b[1]),Math.hypot(a[0]-c[0],a[1]-c[1]))/.5));
        for(let u=0;u<=n;u++)for(let v=0;v<=n-u;v++){
          checkPoint(row,a[0]+(b[0]-a[0])*u/n+(c[0]-a[0])*v/n,a[1]+(b[1]-a[1])*u/n+(c[1]-a[1])*v/n,'ribbon');row.ribbon++;
        }
      }
    }
    row.maxOutside=+row.maxOutside.toFixed(3);if(row.bad.length)fail.push(job.kind+': полоса вне дороги');rows.push(row);
    for(const[n,old]of fx){if(old===undefined)delete d.NODES[n].fx;else d.NODES[n].fx=old;}
  }
}finally{
  d.S.target=target0;d.S.ride=ride0;d.RT.sync=sync0;Object.assign(d.V,origin);d.V.vx=d.V.vz=0;d.RP.cur=null;d.setPause(false);
}
if(!shop||!gennady||!bridge)fail.push('не найдены обязательные магазин/Геннадий/мост');
return{ok:!fail.length&&!d.crashlog.count(),fail,rows,crashes:d.crashlog.count()};
