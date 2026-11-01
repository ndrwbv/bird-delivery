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
