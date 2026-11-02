/* Ordinary first-career proof. Real functions/oracles retained from the B1 proof; no mature fixture or forced skip. */
async function addressFreshProof17b(){
function toExact(value){
 if(value===null)return['null'];
 if(typeof value==='number'){if(!Number.isFinite(value))throw Error('Nonfinite exact scalar');const bytes=new Uint8Array(8),view=new DataView(bytes.buffer);view.setFloat64(0,value,true);return['number',[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('')];}
 if(typeof value==='undefined')return['undefined'];
 if(typeof value==='string'||typeof value==='boolean')return[typeof value,value];
 if(Array.isArray(value))return['array',value.map(toExact)];
 if(value&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null))return['object',Object.keys(value).map(key=>[key,toExact(value[key])])];
 throw Error('Unsupported exact value');
}
function fromExact(value){
 const [type,data]=value;if(type==='null')return null;if(type==='undefined')return undefined;
 if(type==='number'){if(!/^[a-f0-9]{16}$/.test(data))throw Error('Bad exact number');const bytes=Uint8Array.from(data.match(/../g),s=>parseInt(s,16));return new DataView(bytes.buffer).getFloat64(0,true);}
 if(type==='string'||type==='boolean')return data;
 if(type==='array')return data.map(fromExact);if(type==='object')return Object.fromEntries(data.map(([key,row])=>[key,fromExact(row)]));throw Error('Bad exact type');
}


const need=(ok,why)=>{if(!ok)throw Error('address-fresh17b:'+why);};
const bounded=(value,label)=>{need(new TextEncoder().encode(JSON.stringify(value)).length<=32*1024*1024,label+' 32MiB ceiling');return value;};
const LOCKED=null,LOCKED_EXACT=null,graphics=d.GFX.preset;
need(['mid','high'].includes(graphics),'actual mid/high required');
const q=new URLSearchParams(location.search),allowed=new Set(['debug','mute','nolb','startuptrace','addressexport17b','addressclosure17b']);
need(q.has('mute')&&q.has('addressclosure17b')&&[...q].every(([key,value])=>allowed.has(key)&&value===''),'only reviewed bare diagnostic query tokens');
const initial=window.__addressClosure17bInitial,property=Object.getOwnPropertyDescriptor(window,'__addressClosure17bInitial');
need(initial&&property?.value===initial&&!property.writable&&!property.configurable&&Object.isFrozen(initial),'immutable actual initial observer');
need(initial.phase==='before-city-syncBuild'&&initial.mode==='steam'&&initial.adult===true&&initial.career===true&&initial.intro===false&&initial.editor===false&&initial.language==='ru','actual fresh runtime');
need(initial.season?.value===2.5&&initial.season.forced===false&&initial.season.saved===null,'native default initial season');
need(initial.donation?.trashRaw===0&&initial.donation.trashFraction===0,'no trash donation');
need(initial.district?.current===0&&initial.district.opened===1&&initial.district.city===false&&d.CITYOPEN.seen()===false,'fresh repair is no-op');
const carKeys=['dlv-car-owned','dlv-car-cur','dlv-car-up','dlv-car-L','dlv-car-paint','dlv-car-eng'];
need(initial.car?.id==='semerka'&&carKeys.every(key=>initial.car.inputs?.[key]===null),'native car defaults, not injected car progress');
need(initial.graphics?.device==='deck'&&initial.graphics.preset===graphics,'actual Deck preset');
need(initial.ordinary?.ordinaryAtImport===true&&initial.ordinary.hookOwned===true,'ordinary RNG ownership');
const preLate=window.__landPackage17bPreLate;
need(preLate&&Object.isFrozen(preLate)&&preLate.phase==='city-pizzeria-before-late'&&preLate.district===0&&preLate.pizzaIndex===0&&!preLate.lateWorkStarted,'actual pre-late first pizzeria');
need(d.S.state==='title'&&!window.__startupTrace?.firstControl,'untouched fresh menu');
const catalog=d.ADDRESS_CATALOG;need(catalog,'actual address recorder');
need(await until(()=>catalog.phase==='sealed',300000),'real address sealSpots barrier');
need(d.S.state==='title'&&!window.__startupTrace.firstControl,'capture menu before actual Go');
const owned=catalog.snapshot(),links=catalog.checkLinks(),menuExact=bounded(toExact(owned),'menu snapshot'),initialExact=toExact(initial);
const arrays={houses:d.HOUSES,generated:d.GEN_ENTR,entrances:d.CITY.entrances,spots:d.SPOTS,buildings:d.CITY.buildings},pizza=d.PZ_CUR;
for(let i=0;i<owned.generatedDoors.length;i++)need(owned.generatedDoors[i]===owned.entrances[owned.rawEntranceCount+i],'owned door suffix alias');
for(const row of owned.houseLinks.concat(owned.doorLinks)){const b=catalog.resolveBuilding(row.building);need(b===d.CITY.buildings[row.building]&&Object.is(b.id??null,row.sourceId),'actual building owner');}
const repairNoop={district:d.DIST.cur(),opened:d.DIST.opened(),city:d.DIST.city(),partySeen:d.CITYOPEN.seen()};
const startup=await(async()=>{
/* №17ж: actual menu action -> non-held physics + completed visible frame + ready local support.
   Use --early --startup-trace --startup-session=... --startup-fixture=... --cpu=3 --bootcpu --seed=7 --size=deck.
   The test never changes graphics, phase/state, ground support, or calls startRun directly. */
const trace=window.__startupTrace;
if(!trace?.enabled)throw Error('startuptrace instrumentation is required');
const admission=window.__startupHost?.admission,settled=admission?.mode==='settled';
if(admission&&!['early','settled'].includes(admission.mode))throw Error('Unknown startup admission');
const startConditions=settled?{state:d.S.state,queueBusy:d.LATE.busy(),queueFullAt:trace.report().marks['queue.full']?.at??null,bootFull:window.__boot?.full??null,preexistingControl:!!trace.firstControl}:null;
if(settled&&(startConditions.state!=='title'||startConditions.queueBusy||!startConditions.bootFull||!Number.isFinite(startConditions.queueFullAt)||startConditions.preexistingControl))throw Error('Settled packaging admission did not start from a completed, untouched title: '+JSON.stringify(startConditions));
const captureFailure=reason=>{
  const safe=fn=>{try{return fn()??null;}catch(error){return{unknown:String(error?.message||error).slice(0,160)};}};
  const read=(api,key)=>typeof api?.[key]==='function'?safe(()=>api[key]()):typeof api?.[key]==='boolean'?api[key]:null;
  window.__startupFailureState={reason,at:performance.now(),state:d.S.state,paused:d.S.paused??null,externalPaused:d.EXT?.paused??null,mapOpen:d.FM?.open??null,
    holds:{door:read(d.DOOR,'on'),dialog:read(d.DLG,'isOpen'),handcam:read(d.HCAM,'busy'),handcamPhase:d.HCAM?.ph??null,firstPerson:read(d.FPD,'busy'),firstPersonPhase:d.FPD?.ph??null,stairs:read(d.ST3,'on'),replay:read(d.REPLAY,'on')},
    late:{busy:safe(()=>d.LATE.busy()),queueFullAt:trace.report().marks['queue.full']?.at??null},
    supportReady:d.RLAND?.ST?.supportReady??null,localReady:safe(()=>d.LAND_STREAM?.readyAt(d.V.x,d.V.z,640)),landStats:safe(()=>({...d.LAND_STREAM?.stats})),
    cache:safe(()=>d.LAND_PACKAGE?.meta()),crash:safe(()=>d.crashlog.entries()),
    dom:{booting:document.body.classList.contains('booting'),lateWait:!!document.querySelector('.late-wait'),dialog:!!document.querySelector('#dlg:not([hidden])'),districtPicker:!!document.querySelector('#cr-dpick:not([hidden])'),cityParty:!!document.querySelector('#cr-city')}};
};
const targetValue=new URLSearchParams(location.search).get('startupdistrict');
const expectedDistrict=targetValue===null?null:Number(targetValue);
const before={district:d.DIST.cur(),opened:d.DIST.opened(),city:d.DIST.city(),partySeen:d.CITYOPEN.seen()};
if(expectedDistrict!==null&&(before.district!==expectedDistrict||before.opened<=expectedDistrict||before.city))throw Error('Invalid real saved district before menu: '+JSON.stringify(before));
if(expectedDistrict===7&&(before.opened!==8||!before.partySeen))throw Error('Far fixture must have honestly open districts and an already acknowledged party');
const button=document.querySelector('.crm-card[data-key="go"] .crm-cb');
if(!button)throw Error('Real shift button missing');
const start=performance.now();button.click();
const limit=settled?admission.controlWaitMs:240000,deadline=start+limit;
if(settled&&limit!==420000)throw Error('Unexpected settled control allowance');
let dialogEnd=null,pickerEnd=null,pickerClicks=0,dialogClicks=0,pickerObservedAt=null,pickerClickedAt=null;
const visible=b=>b&&!b.closest('[hidden]')&&!b.disabled&&b.getBoundingClientRect().width>0&&getComputedStyle(b).visibility!=='hidden';
while(performance.now()<deadline&&!trace.firstControl){
  // A saved fully-open career asks its normal district picker before starting.
  if(document.querySelector('#cr-city'))throw Error('Unexpected unlock party; fixture does not describe a settled saved career');
  const target=targetValue;
  const picker=document.querySelector('#cr-dpick:not([hidden])');
  const picked=target===null?null:picker?.querySelector('.dp-card[data-key="'+target+'"] .dp-go');
  if(picker&&visible(picked)){
    if(pickerClicks)throw Error('District picker reopened after its one successful action');
    if(!picked.closest('.dp-card')?.classList.contains('on'))throw Error('Fixture district is not the visible selected card');
    pickerObservedAt=performance.now();pickerEnd=trace.windowStart('external.scriptedDistrict','external');
    await new Promise(resolve=>requestAnimationFrame(resolve));
    if(!visible(picked))throw Error('District picker disappeared before its visible action');
    pickerClickedAt=performance.now();picked.click();pickerClicks++;
    if(!picker.hidden)throw Error('The one visible district action did not close the picker');
    pickerEnd();pickerEnd=null;
  }
  // Scripted response to a real tutorial/dialog is external input, never attributed to CPU.
  const dialog=d.DLG;
  if(dialog?.isOpen?.()){
    if(!dialogEnd)dialogEnd=trace.windowStart('external.scriptedDialog','external');
    const root=document.querySelector('#dlg:not([hidden])');
    const yes=root?.querySelector('.dlg-yes');
    const b=visible(yes)?yes:Array.from(root?.querySelectorAll('button')||[]).find(visible);if(b){b.click();dialogClicks++;}
  }else if(dialogEnd){dialogEnd();dialogEnd=null;}
  await wait(50);
}
if(dialogEnd)dialogEnd();
if(pickerEnd)pickerEnd();
const report=trace.firstReport||trace.report(),control=report.marks['first.control'];
if(!control){captureFailure('control deadline');throw Error('No controllable rendered frame within '+limit+'ms: '+JSON.stringify(report));}
if(report.dropped)throw Error('Trace aggregate limit reached; report is incomplete');
if(report.resourceCapture?.truncatedCount)throw Error('Resource list truncated; this report is not a complete pilot');
if(!control.data.localReady||!control.data.supportReady||control.data.state!=='drive'||control.data.held)throw Error('False first-control marker');
if(control.data.guardVersion!==2||control.data.paused!==false||control.data.mapOpen!==false)throw Error('Fresh guardVersion2 control state was not proven');
const P=d.PZ_CUR,actualDistrict=d.DIST.cur();
const district={before,actual:actualDistrict,atControl:d.DIST.at(control.data.x,control.data.z),pizzaIndex:d.PIZZERIAS.indexOf(P),pizza:{x:P?.x,z:P?.z,bx:P?.bx,bz:P?.bz},position:{x:control.data.x,z:control.data.z},pickerClicks,pickerObservedAt,pickerClickedAt,dialogClicks};
if(expectedDistrict!==null&&(actualDistrict!==expectedDistrict||district.pizzaIndex!==expectedDistrict||district.atControl!==expectedDistrict))throw Error('Selected district did not become the physical start: '+JSON.stringify(district));
if(expectedDistrict!==null&&expectedDistrict>0&&!pickerClicks)throw Error('Saved district did not pass through its real picker');
const pos={x:d.V.x,z:d.V.z};
document.dispatchEvent(new KeyboardEvent('keydown',{key:'w',code:'KeyW',bubbles:true,cancelable:true}));
const movementStart=performance.now();
try{
  if(settled){const until=movementStart+admission.movementWaitMs;do{await wait(50);}while(Math.hypot(d.V.x-pos.x,d.V.z-pos.z)<=.05&&performance.now()<until);}
  else await wait(600);
}finally{document.dispatchEvent(new KeyboardEvent('keyup',{key:'w',code:'KeyW',bubbles:true}));}
const moved=Math.hypot(d.V.x-pos.x,d.V.z-pos.z);
if(!(moved>.05)){captureFailure('real acceleration');throw Error('Control marker did not permit real acceleration: '+moved);}
const bootstrap=window.__startupBootGuard;
if(!bootstrap?.markerWrites||!bootstrap.bootAbsentAtMarker||bootstrap.earlyBootSeen||!window.__boot)throw Error('Legacy __boot bootstrap semantics changed: '+JSON.stringify(bootstrap));
const crash=d.crashlog.entries();if(crash.length)throw Error('Startup crash: '+JSON.stringify(crash));
const cache=window.__landCache17a?.meta?.()||null;
if(new URLSearchParams(location.search).has('landcache')&&(!cache||cache.source!=='cache'||cache.phase!=='restored'||!cache.hit||cache.cleanCalls!==0||cache.reason||cache.bufferHeld))throw Error('Control did not follow a clean cache restore: '+JSON.stringify(cache));
return {ok:true,protocolVersion:2,district,cache,landPackage:d.LAND_PACKAGE?.meta()||null,rng:d.LAND_RNG?.()||null,bootstrap,host:window.__startupHost||null,startConditions,report,moved,movementHoldMs:performance.now()-movementStart,crash,land:{...d.LAND_STREAM?.stats},raised:{...d.RLAND.ST},late:{...d.LATE.T},
  firstControlFromClickMs:control.at-start,firstControlFromNavigationMs:control.at,
  conditions:{lang:document.documentElement.lang,seed:window.__startupHost?.seed??null,url:location.href,physicalDeck:false,graphics:{preset:d.GFX.preset,device:d.GFX.dev,width:innerWidth,height:innerHeight}}};

})();
need(startup.district.actual===0&&startup.district.pizzaIndex===0&&startup.district.atControl===0,'actual physical fresh district');
need(startup.district.pickerClicks===0,'first career must not require mature district picker');
need(pizza===d.PZ_CUR,'pizzeria through real Go');
for(const [key,ref]of Object.entries(arrays))need(ref===({houses:d.HOUSES,generated:d.GEN_ENTR,entrances:d.CITY.entrances,spots:d.SPOTS,buildings:d.CITY.buildings})[key],'legacy array reference through Go '+key);
need(JSON.stringify(toExact(initial))===JSON.stringify(initialExact)&&JSON.stringify(toExact(catalog.snapshot()))===JSON.stringify(menuExact),'initial/menu data unchanged through Go');
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
 if(LOCKED)inputs.splice(0,inputs.length,...LOCKED.addresses.map(row=>row.slice()));
 need(inputs.length<=60000,'address query ceiling');
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
 if(LOCKED)lvInputs.splice(0,lvInputs.length,...LOCKED.levels.map(row=>row.slice()));
 need(inputs.length+2*lvInputs.length<=60000,'total real query ceiling');
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
const exactSame=(actual,expected,why)=>need(JSON.stringify(toExact(actual))===JSON.stringify(toExact(expected)),why);
for(const row of functionalQueries.addresses)exactSame(row.actual,row.expected,'exact actual address oracle');
for(const row of functionalQueries.levels){exactSame(row.actual,row.expected,'exact entrance level oracle');exactSame(row.viaDoor,row.actual,'exact door wrapper');}
exactSame(functionalQueries.home.actual,functionalQueries.home.expected,'exact Float64 home oracle');
for(const row of functionalQueries.pool)exactSame(row.actual,row.expected,'exact ordered POOL oracle');
const fixedQueries={addresses:functionalQueries.addresses.map(r=>[r.kind,r.index,r.x,r.z]),levels:functionalQueries.levels.map(r=>[r.kind,r.index,r.x,r.z])};
need(fixedQueries.addresses.length+2*fixedQueries.levels.length<=60000,'60000 actual query ceiling');
if(LOCKED)need(JSON.stringify(toExact(fixedQueries))===JSON.stringify(LOCKED_EXACT),'query coordinates not byte-exact B1 lock');
const exactQueryTables=bounded(toExact({addresses:functionalQueries.addresses,levels:functionalQueries.levels,home:functionalQueries.home,pool:functionalQueries.pool}),'exact query tables');
const after={seasonStored:d.Store.get('dlv-season',null),district:d.DIST.cur(),carId:d.CARSM.current().id,graphics:d.GFX.preset};

return {...startup,addressClosure:{version:1,case:'fresh-'+graphics,profile:'ordinary-first-career',initial,initialExact,preLate,menuExact,links,after,repairNoop,fixedQueriesExact:bounded(toExact(fixedQueries),'fixed queries'),exactQueryTables,functionalQueries,ownedAliases:true,unchanged:{menuOwnerSnapshot:true,arrayReferencesThroughGo:true},claims:{earlyReady:false,readerEnabled:false,allAxesClosed:false}},freshEnvironment:{userAgent:navigator.userAgent,rawQuery:location.search},freshProofSource:{kind:'fresh-proof-with-original-functional-oracles',functionalSha256:'e62111d2746ede6f1754facb914dd3ea80a589a7f461eaf67cc09f0e68550644',startupSha256:'6936e604198b5f3b59865181a1df646645ee42c07e11ff809c2d8230b015bd52'}};
}
const proof=await addressFreshProof17b();
function toExact(value){
 if(value===null)return['null'];
 if(typeof value==='number'){if(!Number.isFinite(value))throw Error('Nonfinite exact scalar');const bytes=new Uint8Array(8),view=new DataView(bytes.buffer);view.setFloat64(0,value,true);return['number',[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('')];}
 if(typeof value==='undefined')return['undefined'];
 if(typeof value==='string'||typeof value==='boolean')return[typeof value,value];
 if(Array.isArray(value))return['array',value.map(toExact)];
 if(value&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null))return['object',Object.keys(value).map(key=>[key,toExact(value[key])])];
 throw Error('Unsupported exact value');
}
function fromExact(value){
 const [type,data]=value;if(type==='null')return null;if(type==='undefined')return undefined;
 if(type==='number'){if(!/^[a-f0-9]{16}$/.test(data))throw Error('Bad exact number');const bytes=Uint8Array.from(data.match(/../g),s=>parseInt(s,16));return new DataView(bytes.buffer).getFloat64(0,true);}
 if(type==='string'||type==='boolean')return data;
 if(type==='array')return data.map(fromExact);if(type==='object')return Object.fromEntries(data.map(([key,row])=>[key,fromExact(row)]));throw Error('Bad exact type');
}


const needExport=(ok,why)=>{if(!ok)throw Error('address-fresh-export:'+why);};
const api=d.ADDRESS_EXPORT17B,meta=api?.meta();
needExport(api&&meta?.phase==='sealed'&&meta.input?.eligible===true&&meta.input.identity&&meta.input.descriptor,'actual fresh input '+JSON.stringify(meta?.input||null));
needExport(!d.ADDRESS_PREPARED17&&!meta.preload?.held&&!['prepared','consumed'].includes(meta.preload?.phase),'unbundled generated fresh export');
const inputDescriptorExact=toExact(meta.input.descriptor),bytes=api.bytes();needExport(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=16*1024*1024,'16MiB wire ceiling');
const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
const parts=[];for(let at=0;at<bytes.length;at+=16384)parts.push(String.fromCharCode(...bytes.subarray(at,at+16384)));
return {...proof,addressExport:{version:1,meta,inputDescriptorExact,preparedReplay:false,wire:{bytes:bytes.length,sha256,base64:btoa(parts.join(''))},oracleBody:{kind:'fresh-proof-with-original-functional-oracles',sha256:'e62111d2746ede6f1754facb914dd3ea80a589a7f461eaf67cc09f0e68550644'}}};
