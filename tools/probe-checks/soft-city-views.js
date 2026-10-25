/* --seed=7 --q=noview&season=0.4&weather=clear&softshots=/absolute/prefix
   Fixed close views: roof and arch. noview required after moving the camera. */
const q = new URLSearchParams(location.search), prefix = q.get('softshots');
if (!prefix || !q.has('noview')) throw Error('Use softshots=/absolute/prefix and noview');
await ride(); await until(() => !d.LATE.busy(), 60000);
d.ENV.t = 0.3; d.ENV.rain = d.ENV.rainWant = 0; await wait(500);
d.S.paused = true;
const home = [d.V.x,d.V.z], dist = p => Math.hypot(p[0]-home[0],p[1]-home[1]);
const camera = async (pos,target,name) => {
  d.cam.position.set(...pos); d.cam.lookAt(...target); d.cam.updateMatrixWorld();d.CULLREFRESH();
  d.renderer.render(d.scene,d.cam); await wait(100); await shot(prefix+'-'+name+'.png');
};
const house = d.CITY.buildings.filter(b=>b._top && b.p.length>=4 && b.p.length<12 && (!b.roof || b.roof==='f')).sort((a,b)=>dist(a.p[0])-dist(b.p[0]))[0];
if(!house)throw Error('No flat-roof house');
const p=house.p[0], cx=house.p.reduce((s,p)=>s+p[0],0)/house.p.length, cz=house.p.reduce((s,p)=>s+p[1],0)/house.p.length;
const len=Math.hypot(p[0]-cx,p[1]-cz)||1,ux=(p[0]-cx)/len,uz=(p[1]-cz)/len;
await camera([p[0]+ux*14,house._top+6,p[1]+uz*14],[p[0],house._top-0.6,p[1]],'roof');
const arch=d.ARCHES.slice().sort((a,b)=>dist([a.mx,a.mz])-dist([b.mx,b.mz]))[0];
if(!arch)throw Error('No arch');
const y=d.groundH(arch.mx,arch.mz);
await camera([arch.mx-arch.ix*13,y+4.5,arch.mz-arch.iz*13],[arch.mx+arch.ix*2,y+2.5,arch.mz+arch.iz*2],'arch');
return {house:house.id, arch:[arch.mx,arch.mz], stats:d.SOFTCITY.STATS};
