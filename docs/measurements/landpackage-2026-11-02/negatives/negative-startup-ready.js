/* Unmodified existing startup-ready, followed by negative assertions. */
const result=await(async()=>{
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
/* Appended after the unchanged startup-ready body has returned result. */
const negative=window.__landPackageNegative;
if(!negative||negative.error)throw Error('Negative observer failed: '+JSON.stringify(negative));
const meta=d.LAND_PACKAGE?.meta(),report=result.report;
const row=name=>report.rows.find(r=>r.name===name),steps=name=>row(name)?.steps||0;
if(!meta||meta.source!=='generated'||meta.hit!==false||meta.phase!=='fallback'||meta.fatal!==false||!meta.cleaned||meta.bufferHeld)throw Error('Fallback not clean: '+JSON.stringify(meta));
if(report.counters['raisedland.cleanCalls']!==1||steps('raisedland.activate')!==1||steps('raisedland.alignObjects')!==1)throw Error('Fallback clean/activate/align counts: '+JSON.stringify({counters:report.counters,activate:row('raisedland.activate'),align:row('raisedland.alignObjects')}));
if(steps('raisedland.cache.commit')||report.marks['raisedland.package.restored'])throw Error('Failed cache published a restore');
if(report.flags['queue.error']||report.flags['queue.workerRejected']||report.flags['landPackage.fatal'])throw Error('Unexpected scheduler failure: '+JSON.stringify(report.flags));
if(result.host?.seed!==null||result.rng?.ordinaryAtImport!==true||result.rng?.hookOwned!==true||result.rng?.provider!=='edl-owned-fnv1a-mulberry32-v1')throw Error('Not ordinary RNG: '+JSON.stringify(result.rng));
if(result.host.cpuThrottle!==3||result.host.bootcpu!==true||result.conditions.lang!=='ru'||result.conditions.graphics.preset!=='high'||result.conditions.graphics.device!=='deck'||innerWidth!==1280||innerHeight!==800)throw Error('Wrong Deck-high CPU3 conditions: '+JSON.stringify(result.conditions));
if(negative.kind==='missing-asset'){
 if(negative.injections!==1||negative.assetCalls!==1||!meta.reason.endsWith(':READ_HTTP_404'))throw Error('Missing injection/reason: '+JSON.stringify({negative,meta}));
}
if(negative.kind==='wrong-wire-sha'){
 if(negative.injections!==1||negative.assetCalls!==1||!negative.wrongFileChanged||!meta.reason.endsWith(':FILE_HASH_MISMATCH')||meta.wireSha256===meta.expectedWireSha256)throw Error('Wire SHA injection/reason: '+JSON.stringify({negative,meta}));
}
if(negative.kind==='cancel-preparing'){
 if(!negative.cancelled||negative.injections!==1||!negative.baselineCaptured||!negative.unchangedAtCancel||!meta.reason.endsWith(':ACCEPTANCE_CANCEL_PREPARING'))throw Error('Cancellation not proven: '+JSON.stringify({negative,meta}));
 for(const flags of [negative.cancelBefore,negative.cancelAfter])if(flags.built||flags.supportReady||flags.maskReady||flags.maskCells||flags.maskCount||flags.published||flags.cacheCommitSteps)throw Error('Partial readiness/publication at cancellation: '+JSON.stringify(flags));
 if(!negative.cancelAfter.meta.cleaned||negative.cancelAfter.meta.bufferHeld||negative.cancelAfter.meta.hit)throw Error('Cancellation cleanup did not precede return');
 if(!steps('raisedland.cache.decode')||!steps('raisedland.cache.prepareRestore'))throw Error('Cancel did not reach real decode/prepare');
}
if(negative.kind==='input-miss'){
 if(negative.assetCalls!==0||negative.injections!==0||meta.reason!=='input-miss'||meta.precleanHash==="c7ac523ca000f3baea4d6d0e94aa122a9bccd4cf813cdb0919ca459b3a1d4dd4"||d.WIDEN.STATS.off!==true)throw Error('Real nowiden input miss not proven: '+JSON.stringify({negative,meta,widen:d.WIDEN.STATS}));
}
if(negative.kind!=='cancel-preparing'&&(steps('raisedland.cache.decode')||steps('raisedland.cache.prepareRestore')))throw Error('Rejected input reached decoder');
// Streaming can legitimately publish additional cells. Check cache-specific late writes, not a frozen global cell count.
const refs=()=>{const c=d.RLAND.cover.snapshot(),g=d.RLAND.green.snapshot();return[c.packed,c.grid,g.packed,g.grid,d.RLAND.finalMask.kept,d.RLAND.ST];};
const after=refs(),terminal=JSON.stringify(meta);await wait(300);
if(after.some((ref,i)=>ref!==refs()[i])||JSON.stringify(d.LAND_PACKAGE.meta())!==terminal||window.__startupTrace.report().rows.some(r=>r.name==='raisedland.cache.commit'&&r.steps>0)||window.__startupTrace.report().marks['raisedland.package.restored'])throw Error('Late cache publication after generated control');
return {...result,negative:{...negative,ok:true,partialPublication:0,lateCachePublication:0,expectedConsole404:0,cacheMeta:meta}};
