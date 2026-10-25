/* №0п68, ?raisedland: общий контур земли и поверхности движения. */
await onShift();await wait(500);
const L=d.RLAND;if(!L?.ST.built)throw new Error('Поднятая земля не собрана');
let previews=0;d.scene.traverse(o=>{if(o.userData.landPreview)previews++;});
if(previews||!L.ST.baseDisposed)throw new Error('Старая земля осталась на сцене');
d.CITYOPEN.unlockAll();d.districtLocks();
const home=[d.V.x,d.V.z],rows=[],edges=[],base=d.RLAND_BASE;
for(const t of L.cover.triangles){
  if(edges.length>=4)break;
  if(t.lift>=.5)continue;
  for(let i=0;i<3&&edges.length<4;i++){
    const a=t.p[i],b=t.p[(i+1)%3],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
    if(len<4)continue;
    const x=(a[0]+b[0])/2,z=(a[1]+b[1])/2,nx=-dz/len,nz=dx/len;
    if(Math.hypot(x-home[0],z-home[1])>700)continue;
    const p=[x+nx*.7,z+nz*.7],q=[x-nx*.7,z-nz*.7];
    if(base(...p)<1||base(...q)<1||d.inHouse(...p)||d.inHouse(...q))continue;
    if(L.onLand(...p)===L.onLand(...q))continue;
    const land=L.onLand(...p)?p:q,paved=land===p?q:p;
    const rise=d.groundH(...land)-base(...land),flat=d.groundH(...paved)-base(...paved);
    if(Math.abs(rise-L.LIFT)>1e-5||Math.abs(flat)>1e-5)throw new Error('Геометрия и поверхность движения не совпадают');
    rows.push({land,paved,rise:+rise.toFixed(3),flat:+flat.toFixed(3)});
    if(edges.every(e=>Math.hypot(e.land[0]-land[0],e.land[1]-land[1])>30))edges.push({land,paved});
  }
}
if(edges.length<3)throw new Error('Недостаточно независимых границ для проверки');
const poses=[];
for(const e of edges){
  const p=e.land;tp(...p);
  d.V.x=p[0];d.V.z=p[1];d.V.vx=d.V.vz=0;
  await wait(500);
  if(Math.hypot(d.V.x-p[0],d.V.z-p[1])>3||!L.onLand(d.V.x,d.V.z))throw new Error('Место проверки занято препятствием');
  const gap=d.car.position.y-d.groundH(d.V.x,d.V.z);
  if(!Number.isFinite(gap)||gap<-.08||gap>.65)throw new Error('Машина под газоном или над ним: '+gap);
  poses.push({x:+d.V.x.toFixed(2),z:+d.V.z.toFixed(2),gap:+gap.toFixed(3)});
}
return {ok:true,stats:L.ST,previews,edges:rows.slice(0,12),poses,crash:d.crashlog.count()};
