const startup=await (async()=>{
/* №17ж: actual menu action -> non-held physics + completed visible frame + ready local support.
   Use --early --startup-trace --startup-session=... --startup-fixture=... --cpu=3 --bootcpu --seed=7 --size=deck.
   The test never changes graphics, phase/state, ground support, or calls startRun directly. */
const trace=window.__startupTrace;
if(!trace?.enabled)throw Error('startuptrace instrumentation is required');
const targetValue=new URLSearchParams(location.search).get('startupdistrict');
const expectedDistrict=targetValue===null?null:Number(targetValue);
const before={district:d.DIST.cur(),opened:d.DIST.opened(),city:d.DIST.city(),partySeen:d.CITYOPEN.seen()};
if(expectedDistrict!==null&&(before.district!==expectedDistrict||before.opened<=expectedDistrict||before.city))throw Error('Invalid real saved district before menu: '+JSON.stringify(before));
if(expectedDistrict===7&&(before.opened!==8||!before.partySeen))throw Error('Far fixture must have honestly open districts and an already acknowledged party');
const button=document.querySelector('.crm-card[data-key="go"] .crm-cb');
if(!button)throw Error('Real shift button missing');
const start=performance.now();button.click();
const limit=240000,deadline=start+limit;
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
if(!control)throw Error('No controllable rendered frame within '+limit+'ms: '+JSON.stringify(report));
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
await wait(600);
document.dispatchEvent(new KeyboardEvent('keyup',{key:'w',code:'KeyW',bubbles:true}));
const moved=Math.hypot(d.V.x-pos.x,d.V.z-pos.z);
if(!(moved>.05))throw Error('Control marker did not permit real acceleration: '+moved);
const bootstrap=window.__startupBootGuard;
if(!bootstrap?.markerWrites||!bootstrap.bootAbsentAtMarker||bootstrap.earlyBootSeen||!window.__boot)throw Error('Legacy __boot bootstrap semantics changed: '+JSON.stringify(bootstrap));
const crash=d.crashlog.entries();if(crash.length)throw Error('Startup crash: '+JSON.stringify(crash));
const cache=window.__landCache17a?.meta?.()||null;
if(new URLSearchParams(location.search).has('landcache')&&(!cache||cache.source!=='cache'||cache.phase!=='restored'||!cache.hit||cache.cleanCalls!==0||cache.reason||cache.bufferHeld))throw Error('Control did not follow a clean cache restore: '+JSON.stringify(cache));
return {ok:true,protocolVersion:2,district,cache,landPackage:d.LAND_PACKAGE?.meta()||null,rng:d.LAND_RNG?.()||null,bootstrap,host:window.__startupHost||null,report,moved,crash,land:{...d.LAND_STREAM?.stats},raised:{...d.RLAND.ST},late:{...d.LATE.T},
  firstControlFromClickMs:control.at-start,firstControlFromNavigationMs:control.at,
  conditions:{lang:document.documentElement.lang,seed:window.__startupHost?.seed??null,url:location.href,physicalDeck:false,graphics:{preset:d.GFX.preset,device:d.GFX.dev,width:innerWidth,height:innerHeight}}};

})();

const roadIndex=new Map(d.CITY.roads.map((r,i)=>[r,i]));
const edgeRows=[...d.EDGES.entries()],edgeIndex=new Map(edgeRows.map(([,e],i)=>[e,i]));
const R=d.RCHAIN.RC;
const graph={
 nodes:d.NODES.map(n=>[n.x,n.z,[...n.nb],n.out??null]),
 edges:edgeRows.map(([key,e])=>[key,e.a,e.b,e.len,e.ux,e.uz,e.rx,e.rz,e.w,e.w0,e.c,e.ok,e.oneway,e.lanes,roadIndex.get(e.road),e.tA,e.tB,e.stopAt,e.two??null,e.uturn??null,e.trap??null]),
 segments:d.RSEG.map(s=>[s.x1,s.z1,s.x2,s.z2,s.c,s.w,s.name??null,s.b,s.x,s.g??null,s.na??null,s.nb??null,s.arch??null]),
 routechain:R?{seq:R.SEQ.map(v=>[...v]),soft:[...R.soft],sc:[...R.SC],sp:[...R.SP],ef:R.EF.map(v=>v.map(e=>edgeIndex.get(e))),eb:R.EB.map(v=>v.map(e=>edgeIndex.get(e))),out:R.OUT.map(v=>v.map(o=>o.c<0?[o.c,o.to,edgeIndex.get(o.e)]:[o.c,o.p0,o.dir,o.end,o.to]))}:null,
 routes:Array.from({length:12},(_,i)=>{const a=Math.floor(i*d.NODES.length/13),b=Math.floor((12-i)*d.NODES.length/13);return[a,b,d.RCHAIN.routeNodes(a,b)];})
};
const entranceIndex=new Map(d.CITY.entrances.map((e,i)=>[e,i]));
const addresses={houses:d.HOUSES.map(h=>[h.x,h.z,h.mx,h.mz,h.addr??null,h.name??null,h.lv]),generated:d.GEN_ENTR.map(e=>[...e]),entrances:d.CITY.entrances.map(e=>[...e]),spots:d.SPOTS.map(s=>[s.x,s.z])};
const aliases={generatedInCity:d.GEN_ENTR.map(e=>entranceIndex.get(e)),edgeRoadAllPresent:edgeRows.every(([,e])=>roadIndex.has(e.road)),chainRefsAllPresent:!R||R.EF.concat(R.EB).every(row=>row.every(e=>edgeIndex.has(e)))&&R.OUT.every(row=>row.every(o=>o.c>=0||edgeIndex.has(o.e)))};
if(!aliases.edgeRoadAllPresent||!aliases.chainRefsAllPresent||aliases.generatedInCity.some(i=>i===undefined))throw Error('Logical alias missing');
const segmentIndex=new Map(d.RSEG.map((s,i)=>[s,i]));
const roadQueries=d.SPOTS.filter((_,i)=>i%31===0).map(s=>{const r=d.nearestRoad(s.x,s.z,7,1);return[s.x,s.z,r?[segmentIndex.get(r.seg),r.d,r.x,r.z,r.t]:null];});
const catalog=d.ADDRESS_CATALOG;
if(!catalog||catalog.phase!=='sealed')throw Error('Address catalog did not seal at its real barrier');
const owned=catalog.snapshot(),links=catalog.checkLinks();
for(const row of owned.houseLinks.concat(owned.doorLinks)){
 const b=catalog.resolveBuilding(row.building);
 if(b!==d.CITY.buildings[row.building]||!Object.is(b.id??null,row.sourceId))throw Error('Catalog source building link differs');
}
for(let i=0;i<owned.generatedDoors.length;i++)if(owned.generatedDoors[i]!==owned.entrances[owned.rawEntranceCount+i])throw Error('Owned door alias changed');
const exported=d.STREET_GRAPH_EXPORT;
if(!exported||exported.graph.nodes!==d.NODES||exported.graph.edges!==d.EDGES)throw Error('Gameplay did not use the restored graph');
const wire=exported.bytes,parts=[];
for(let i=0;i<wire.length;i+=16384)parts.push(String.fromCharCode(...wire.subarray(i,i+16384)));
const wireBase64=btoa(parts.join(''));
const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',wire));
const wireSha256=[...digest].map(b=>b.toString(16).padStart(2,'0')).join('');
exported.release();
return {...startup,logical:{version:1,graph,addresses,aliases,roadQueries},addressCatalog:{links,owned},graphExport:{meta:exported.meta(),wireSha256,wireBase64,actualGameplayAliases:true}};
