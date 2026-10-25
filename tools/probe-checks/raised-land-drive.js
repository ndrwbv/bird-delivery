/* 0п68: медленный заезд и съезд по настоящей границе газона, ?raisedland. */
await ride(); await until(() => !d.LATE.busy(), 90000);
d.acceptOrder(); await wait(800);
d.CITYOPEN.unlockAll(); d.districtLocks();
const L = d.RLAND, V = d.V, IN = d.IN, home = [V.x,V.z], candidates = [];
if (!L?.ST.built) throw Error('Нужна собранная поднятая земля');
for (const t of L.cover.triangles) {
  if (t.lift >= .49) continue;
  for (let i = 0; i < 3; i++) {
    const a=t.p[i],b=t.p[(i+1)%3],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
    if(len<10)continue;
    const x=(a[0]+b[0])/2,z=(a[1]+b[1])/2,nx=-dz/len,nz=dx/len;
    if(Math.hypot(x-home[0],z-home[1])>800||d.RLAND_BASE(x,z)<1)continue;
    for(const sign of [-1,1]){
      const ux=nx*sign,uz=nz*sign;
      if(![.15,1,3].every(r=>L.onLand(x+ux*r,z+uz*r)&&!L.onLand(x-ux*r,z-uz*r)))continue;
      if([-4,-2,0,2,4].some(r=>d.inHouse(x+ux*r,z+uz*r,3)))continue;
      if(candidates.some(q=>Math.hypot(q.x-x,q.z-z)<35))continue;
      candidates.push({x,z,ux,uz});break;
    }
  }
  if(candidates.length>=3)break;
}
if(candidates.length<2)throw Error('Не найдены независимые широкие границы');
const rows=[];
for(const edge of candidates)for(const direction of [1,-1]){
  const {x,z,ux,uz}=edge,fx=ux*direction,fz=uz*direction,sx=x-fx*3.8,sz=z-fz*3.8;
  IN.gas=IN.brake=IN.left=IN.right=IN.hand=IN.nitro=IN.joy=0;
  tp(sx,sz,Math.atan2(fx,fz));V.x=sx;V.z=sz;V.y=d.surfaceAt(sx,sz);V.vx=fx;V.vz=fz;V.air=false;V.roof=false;V.pitch=V.roll=V.steer=V.kickW=0;
  await wait(100);d.S.paused=false;
  const start=performance.now(),bumps=d.CURBS.ST.bumps,hp=d.S.hp,trace=[];
  let previous=d.car.position.y,maxStep=0;
  while(performance.now()-start<6000){
    const speed=V.vx*fx+V.vz*fz;
    IN.gas=speed<2.5?1:0;
    await wait(16);
    const y=d.car.position.y;maxStep=Math.max(maxStep,Math.abs(y-previous));previous=y;
    trace.push({s:(V.x-sx)*fx+(V.z-sz)*fz,v:speed,y,pitch:V.pitch,roll:V.roll});
    if(trace.at(-1).s>8)break;
  }
  IN.gas=0;
  const distance=(V.x-sx)*fx+(V.z-sz)*fz,lateral=Math.abs((V.x-sx)*fz-(V.z-sz)*fx);
  rows.push({edge,direction,distance:+distance.toFixed(2),lateral:+lateral.toFixed(2),bumps:d.CURBS.ST.bumps-bumps,maxStep:+maxStep.toFixed(3),crossing:trace.filter(p=>p.s>1.5&&p.s<6).filter((p,i)=>i%6===0).map(p=>({s:+p.s.toFixed(2),v:+p.v.toFixed(2),y:+p.y.toFixed(3),pitch:+p.pitch.toFixed(3),roll:+p.roll.toFixed(3)})),hpBefore:hp,hpAfter:d.S.hp});
}
IN.gas=0;
return {complete:false,ok:rows.every(r=>r.distance>=8&&r.lateral<.75&&r.maxStep<.12&&r.hpAfter===r.hpBefore)&&!d.crashlog.count(),rows,crash:d.crashlog.count()};
