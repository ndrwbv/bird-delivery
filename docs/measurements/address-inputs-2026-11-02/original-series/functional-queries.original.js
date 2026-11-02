const functionalQueries=(()=>{
 const need=(ok,why)=>{if(!ok)throw Error('functionalQueries:'+why);};
 const json=v=>JSON.stringify(v),same=(a,b,why)=>need(json(a)===json(b),why);
 const Q=d.ADDRESS_QUERY,O=d.ORDM?.DEBUG;
 need(document.documentElement.lang==='ru','RU oracle requires actual document.lang=ru');
 need(Q&&typeof Q.realAddress==='function'&&typeof Q.entranceLv==='function','actual ADDRESS_QUERY missing');
 need(typeof d.DOOR?.lv==='function'&&typeof d.STORY_DBG?.homeOf==='function','actual door/story query missing');
 need(O&&Array.isArray(O.POOL)&&O.POOL.length>0&&Array.isArray(O.USED),'normal start did not create actual POOL/USED');
 const startedAt=performance.now();
 const savedKeys=['dlv-used-addr','dlv-story','dlv-shifts','dlv-stars','dlv-district','dlv-dist-shifts','dlv-dist-open','dlv-city-mode','dlv-route-mem','dlv-clock','dlv-don-trash','dlv-don-gang'];
 const saved=()=>savedKeys.map(key=>[key,d.Store.get(key,null)]);
 const arrays=()=>({houses:d.HOUSES,generated:d.GEN_ENTR,entrances:d.CITY.entrances,spots:d.SPOTS,buildings:d.CITY.buildings,pool:O.POOL,used:O.USED});
 const beforeArrays=arrays(),rowRefs=Object.fromEntries(Object.entries(beforeArrays).map(([name,rows])=>[name,rows.slice()]));
 const values=()=>({houses:d.HOUSES,generated:d.GEN_ENTR,entrances:d.CITY.entrances,spots:d.SPOTS,pool:O.POOL,used:O.USED,buildingIds:d.CITY.buildings.map(b=>b.id??null)});
 const beforeJSON=json(values()),savedBeforeJSON=json(saved()),rngBeforeJSON=json(d.LAND_RNG?.()??null);
 const beforePizza=d.PZ_CUR,beforeDistrict=[d.DIST.cur(),d.DIST.opened(),d.DIST.city()];
 const houses=d.HOUSES.map((h,index)=>({index,x:h.x,z:h.z,addr:h.addr,lv:h.lv}));
 // Independent expected results over owned scalar inputs. Actual functions are ALWAYS invoked separately.
 const houseNear=(x,z,limit=Infinity)=>{
  let distance=limit,index=-1;
  for(let i=0;i<houses.length;i++){
   const h=houses[i],dx=x-h.x,dz=z-h.z,squared=dx*dx+dz*dz;
   if(squared<distance){distance=squared;index=i;}
  }
  return {index,distance};
 };
 const rawCount=owned.rawEntranceCount,doorR=d.ECON.DOOR.DOOR_R;
 need(Number.isFinite(doorR)&&doorR>0,'invalid actual door radius');
 const nearDoors=(x,z,radius=doorR)=>d.CITY.entrances.some(e=>(e[0]-x)**2+(e[1]-z)**2<radius*radius);
 const addressExpected=(x,z)=>{const h=houseNear(x,z);return {value:h.index<0?(d.MAP.fallbackAddr||''):houses[h.index].addr,house:h.index};};
 const levelExpected=(x,z,radius=doorR)=>{
  const near=nearDoors(x,z,radius),h=houseNear(x,z,60*60);
  return {value:near&&h.index>=0?(houses[h.index].lv||0):0,nearEntrance:near,house:h.index};
 };
 const inputs=[];
 houses.forEach(h=>inputs.push(['house',h.index,h.x,h.z]));
 d.CITY.entrances.forEach((e,i)=>inputs.push([i<rawCount?'rawDoorFront':'generatedDoorFront',i,e[0]+e[2]*3,e[1]+e[3]*3]));
 d.SPOTS.forEach((s,i)=>{if(i%31===0)inputs.push(['spot',i,s.x,s.z]);});
 inputs.push(['origin',0,0,0]);
 // Only report a tie if exact distances to the globally nearest real houses prove it.
 const tieWitnesses=[];
 for(let i=1;i<Math.min(houses.length,256)&&tieWitnesses.length<4;i++){
  const a=houses[i-1],b=houses[i],x=(a.x+b.x)/2,z=(a.z+b.z)/2,h=houseNear(x,z);
  if(h.index<0)continue;
  const tied=houses.filter(v=>(v.x-x)**2+(v.z-z)**2===h.distance).map(v=>v.index);
  if(tied.length>1){tieWitnesses.push({x,z,houses:tied,winner:h.index,squaredDistance:h.distance});inputs.push(['exactTie',tieWitnesses.length-1,x,z]);}
 }
 const addressRows=inputs.map(([kind,index,x,z])=>{
  const expected=addressExpected(x,z),actual=Q.realAddress(x,z);
  need(actual===expected.value,'realAddress '+kind+':'+index);
  return {kind,index,x,z,actual,expected:expected.value,house:expected.house};
 });
 const lvInputs=d.CITY.entrances.map((e,i)=>[i<rawCount?'rawDoor':'generatedDoor',i,e[0],e[1]]);
 d.CITY.entrances.forEach((e,i)=>lvInputs.push([i<rawCount?'rawDoorFront':'generatedDoorFront',i,e[0]+e[2]*3,e[1]+e[3]*3]));
 d.SPOTS.forEach((s,i)=>{if(i%31===0)lvInputs.push(['spot',i,s.x,s.z]);});
 const far={x:Math.max(...houses.map(h=>h.x),...d.CITY.entrances.map(e=>e[0]))+10000,z:Math.max(...houses.map(h=>h.z),...d.CITY.entrances.map(e=>e[1]))+10000};
 need(!nearDoors(far.x,far.z),'far witness is not outside entrances');lvInputs.push(['verifiedFar',0,far.x,far.z]);
 const radiusWitnesses=[],house60Witnesses=[];
 for(let i=0;i<Math.min(d.CITY.entrances.length,256)&&radiusWitnesses.length<4;i++){
  const e=d.CITY.entrances[i];
  for(const sign of [-1,1]){
   const x=e[0]+sign*doorR,z=e[1],eps=1e-6;
   if((x-e[0])**2+(z-e[1])**2!==doorR*doorR||nearDoors(x,z))continue;
   const inside=[e[0]+sign*(doorR-eps),z],outside=[e[0]+sign*(doorR+eps),z];
   if(levelExpected(...inside).value<=0||levelExpected(...outside).value!==0)continue;
   radiusWitnesses.push({door:i,x,z,radius:doorR,epsilon:eps});
   for(const [kind,p] of [['radiusInside',inside],['radiusExact',[x,z]],['radiusOutside',outside]])lvInputs.push([kind,radiusWitnesses.length-1,...p]);
  }
 }
 // A 60m boundary requires BOTH an exactly 60m nearest house AND a real nearby door.
 for(let i=0;i<Math.min(houses.length,256)&&house60Witnesses.length<2;i++){
  const h=houses[i],x=h.x+60,z=h.z,n=houseNear(x,z);
  if(n.distance===3600&&nearDoors(x,z)){
   house60Witnesses.push({house:i,x,z,nearest:n.index,squaredDistance:n.distance});lvInputs.push(['house60Exact',house60Witnesses.length-1,x,z]);
  }
 }
 const levelRows=lvInputs.map(([kind,index,x,z])=>{
  const expected=levelExpected(x,z),actual=Q.entranceLv(x,z),viaDoor=d.DOOR.lv(x,z);
  need(actual===expected.value&&viaDoor===actual,'entranceLv/DOOR.lv '+kind+':'+index);
  return {kind,index,x,z,actual,viaDoor,expected:expected.value,nearEntrance:expected.nearEntrance,house:expected.house};
 });
 // Fixed Gennady home is inspected; no order creation, place callbacks, or story reset.
 const story=d.STORY_DBG.STORIES.find(s=>s.id==='gennady');
 need(story&&typeof story.home==='object'&&story.home&&!story.place,'gennady no longer has a fixed declarative home');
 const home1=d.STORY_DBG.homeOf('gennady'),home2=d.STORY_DBG.homeOf('gennady');
 need(home1&&home1===home2,'actual home memo identity');
 const hm=story.home;
 let buildingIndex=hm.addr?d.CITY.buildings.findIndex(b=>b.a&&b.a[0]===hm.addr[0]&&b.a[1]===hm.addr[1]):-1;
 const centroid=b=>b.p.reduce((sum,q)=>[sum[0]+q[0]/b.p.length,sum[1]+q[1]/b.p.length],[0,0]);
 if(buildingIndex<0&&hm.near){let best=Infinity;d.CITY.buildings.forEach((b,i)=>{if(!b.a||(!hm.any&&b.st!=='panel'))return;const c=centroid(b),v=(c[0]-hm.near[0])**2+(c[1]-hm.near[1])**2;if(v<best){best=v;buildingIndex=i;}});}
 need(buildingIndex>=0,'story expected building missing');
 const b=d.CITY.buildings[buildingIndex],[cx,cz]=centroid(b),xs=b.p.map(q=>q[0]),zs=b.p.map(q=>q[1]);
 const box=[Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)];
 let entranceIndex=-1,bestEntrance=Infinity;
 d.CITY.entrances.forEach((e,i)=>{const inBox=e[0]>box[0]-4&&e[0]<box[2]+4&&e[1]>box[1]-4&&e[1]<box[3]+4;const score=(e[0]-cx)**2+(e[1]-cz)**2+(inBox?0:1e9);if(score<bestEntrance){bestEntrance=score;entranceIndex=i;}});
 need(entranceIndex>=0,'story expected entrance missing');
 const [ex,ez,nx0,nz0]=d.CITY.entrances[entranceIndex],length=Math.hypot(nx0,nz0)||1,nx=nx0/length,nz=nz0/length,want4={x:ex+nx*4,z:ez+nz*4};
 let spotIndex=-1,bestSpot=900;
 d.SPOTS.forEach((s,i)=>{const distance=(s.x-want4.x)**2+(s.z-want4.z)**2;if(distance<bestSpot){bestSpot=distance;spotIndex=i;}});
 const spot=spotIndex>=0?d.SPOTS[spotIndex]:want4;
 const expectedHome={ex,ez,nx,nz,sx:-nz,sz:nx,x:spot.x,z:spot.z,addr:b.a?addressExpected(ex+nx*2,ez+nz*2).value:''};
 const homeKeys=['ex','ez','nx','nz','sx','sz','x','z','addr'],actualHome=Object.fromEntries(homeKeys.map(k=>[k,home1[k]]));
 same(actualHome,expectedHome,'actual story home scalar');
 need(actualHome.addr===(b.a?Q.realAddress(ex+nx*2,ez+nz*2):''),'actual home/address helper link');
 const home={id:'gennady',actual:actualHome,expected:expectedHome,memoSameReference:true,building:buildingIndex,sourceId:b.id??null,entrance:entranceIndex,spot:spotIndex,fallbackWant4:spotIndex<0};
 // POOL remains a runtime overlay. Expected projection is not substituted for actual POOL.
 const opened=d.DIST.opened(),hasDistricts=d.DIST.list().length>0,di=hasDistricts&&!d.DIST.city()?d.DIST.cur():-1;
 const isOpen=(x,z)=>{const district=d.DIST.at(x,z);return district>=0&&district<opened;};
 const expectedOpen=(s)=>{
  if(!hasDistricts)return true;
  const road=d.nearestRoad(s.x,s.z,60,1);
  if(road&&!isOpen(road.x,road.z))return false;
  for(let i=0;i<8;i++){const angle=i*Math.PI/4;if(!isOpen(s.x+Math.cos(angle)*25,s.z+Math.sin(angle)*25))return false;}
  return true;
 };
 const entrySet=new Set(d.CITY.entrances.map(e=>Math.round((e[0]+e[2]*3)*4)+','+Math.round((e[1]+e[3]*3)*4)));
 const expectedIndices=[];
 d.SPOTS.forEach((s,i)=>{if(di<0||d.DIST.at(s.x,s.z)===di&&expectedOpen(s))expectedIndices.push(i);});
 const key4m=(x,z)=>[Math.round(x/4).toString(36),Math.round(z/4).toString(36)].join('.');
 const poolRows=O.POOL.map((p,i)=>({index:i,x:p.x,z:p.z,entr:p.entr,key:p.key,zone:p.zone,d:p.d}));
 need(poolRows.length===expectedIndices.length,'ordered POOL length');
 const pool=poolRows.map((actual,i)=>{
  const sourceSPOTSindex=expectedIndices[i],s=d.SPOTS[sourceSPOTSindex],P=d.PZ_CUR||{x:0,z:0};
  const expected={index:i,x:s.x,z:s.z,entr:entrySet.has(Math.round(s.x*4)+','+Math.round(s.z*4)),key:key4m(s.x,s.z),zone:d.ZN.zoneAt(s.x,s.z),d:Math.hypot(s.x-P.x,s.z-P.z)};
  same(actual,expected,'ordered POOL row '+i);return {sourceSPOTSindex,actual,expected};
 });
 const rawSavedUsed=d.Store.get('dlv-used-addr',[]),expectedUsed=Array.isArray(rawSavedUsed)?rawSavedUsed.filter(k=>typeof k==='string'):typeof rawSavedUsed==='string'?rawSavedUsed.split(' ').filter(Boolean):[];
 same(O.USED,expectedUsed,'actual USED loading compatibility');
 const used=O.USED.map((key,index)=>({index,key,poolIndices:poolRows.filter(p=>p.key===key).map(p=>p.index)}));
 const afterArrays=arrays();
 for(const [name,rows] of Object.entries(beforeArrays)){
  need(afterArrays[name]===rows,'array reference changed '+name);
  need(rows.length===rowRefs[name].length&&rows.every((row,i)=>row===rowRefs[name][i]),'row reference/order changed '+name);
 }
 need(json(values())===beforeJSON,'exact live rows/POOL/USED changed');
 need(json(saved())===savedBeforeJSON,'saved progress keys changed');
 need(json(d.LAND_RNG?.()??null)===rngBeforeJSON,'RNG descriptor changed');
 need(d.PZ_CUR===beforePizza,'pizza reference changed');same([d.DIST.cur(),d.DIST.opened(),d.DIST.city()],beforeDistrict,'district changed');
 same(catalog.checkLinks(),links,'owner links changed');need(catalog.snapshot()===owned,'owned catalog reference changed');
 return {version:1,actualQueries:true,oracleLanguage:'ru',outsideStartupTiming:true,elapsedMs:performance.now()-startedAt,
  counts:{realAddress:addressRows.length,entranceLv:levelRows.length,doorWrapper:levelRows.length,pool:pool.length,used:used.length},
  addresses:addressRows,levels:levelRows,home,pool,used,rawSavedUsed,savedKeysBefore:JSON.parse(savedBeforeJSON),savedKeysAfter:saved(),
  witnesses:{ties:tieWitnesses,radius:radiusWitnesses,house60:house60Witnesses,far,missingWitnesses:{ties:!tieWitnesses.length,radius:!radiusWitnesses.length,house60:!house60Witnesses.length}},
  unchanged:{arrayAndRowReferences:true,exactRows:true,pool:true,used:true,savedKeys:true,district:true,pizzaReference:true,ownerSnapshotReference:true,rngDescriptor:true},
  limits:['HOME private memo population is allowed','No write or simulated delivery: USED aging/selection is not exercised','Legacy raw files have no actual functional query transcript','RNG descriptor invariance is not a count of Math.random calls']};
})();