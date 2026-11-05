/* Production-query admission: readonly acceptance snapshots and real DOM/input only, no debug namespace. */
const api=window.__addressAcceptance17b,trace=window.__startupTrace,host=window.__startupHost;
if(!api?.ready||!trace?.enabled||window.__dlv)throw Error('Readonly production acceptance port required, without __dlv');
const before=api.capture(),initialReport=api.report(),admission=host?.admission,settled=admission?.mode==='settled';
if(before.testTools!==false||before.state!=='title'||before.firstControl)throw Error('Ordinary untouched title required');
if(before.district.current!==0||before.district.opened!==1||before.district.city!==false||before.district.partySeen!==false)throw Error('Fresh district/party state required');
const startConditions={state:before.state,queueFullAt:initialReport.marks?.['queue.full']?.at??null,bootFull:window.__boot?.full??null,preexistingControl:!!before.firstControl};
if(settled&&(!startConditions.bootFull||!Number.isFinite(startConditions.queueFullAt)))throw Error('Settled queue not complete');
const visible=b=>b&&!b.closest('[hidden]')&&!b.disabled&&b.getBoundingClientRect().width>0&&getComputedStyle(b).visibility!=='hidden';
const shiftStart='.rf-shift-app .rf-shift-start';
if(document.querySelector('#cr-menu.rf-menu'))await until(()=>document.querySelector(shiftStart),5000);
const go=document.querySelector(shiftStart)||document.querySelector('.crm-card[data-key="go"] .crm-cb');
if(!visible(go))throw Error('Visible real Go button missing');
const start=performance.now();go.click();
const limit=settled?admission.controlWaitMs:240000,deadline=start+limit;let dialogClicks=0;
if(settled&&(limit!==420000||admission.movementWaitMs!==30000))throw Error('Unexpected settled allowance');
while(performance.now()<deadline&&!api.capture().firstControl){
 if(document.querySelector('#cr-city')||document.querySelector('#cr-dpick:not([hidden])'))throw Error('Unexpected mature party/district picker in fresh career');
 const root=document.querySelector('#dlg:not([hidden])'),yes=root?.querySelector('.dlg-yes');
 const button=visible(yes)?yes:Array.from(root?.querySelectorAll('button')||[]).find(visible);
 if(button){button.click();dialogClicks++;}
 await wait(50);
}
const ready=api.capture(),report=api.report(),control=report.marks?.['first.control'];
if(!ready.firstControl||!control||ready.testTools!==false||window.__dlv)throw Error('No clean controllable production frame: '+JSON.stringify(ready));
if(control.data.guardVersion!==2||control.data.state!=='drive'||control.data.held!==false||control.data.paused!==false||control.data.mapOpen!==false||control.data.localReady!==true||control.data.supportReady!==true)throw Error('Invalid fresh guardVersion2 frame');
const position=ready.position;
document.dispatchEvent(new KeyboardEvent('keydown',{key:'w',code:'KeyW',bubbles:true,cancelable:true}));
const movementStart=performance.now();
try{
 if(settled){do{await wait(50);}while(Math.hypot(api.capture().position.x-position.x,api.capture().position.z-position.z)<=.05&&performance.now()<movementStart+admission.movementWaitMs);}
 else await wait(600);
}finally{document.dispatchEvent(new KeyboardEvent('keyup',{key:'w',code:'KeyW',bubbles:true}));}
const after=api.capture(),moved=Math.hypot(after.position.x-position.x,after.position.z-position.z);
if(!(moved>.05)||after.testTools!==false||window.__dlv)throw Error('No real production W acceleration');
const bootstrap=window.__startupBootGuard;
if(!bootstrap?.markerWrites||!bootstrap.bootAbsentAtMarker||bootstrap.earlyBootSeen||!window.__boot)throw Error('Bootstrap marker ordering changed');
const details=api.details(),crash=api.crashes(); // Large descriptor clone exactly once, after the input/control check.
if(crash.length)throw Error('Address startup crash: '+JSON.stringify(crash));
let queryProof={checked:false,matched:false};
if(details.early?.queries){
 const current=api.queries(),early=details.early.queries;
 if(!current||JSON.stringify(current.queriesExact)!==JSON.stringify(early.queriesExact)||JSON.stringify(current.counts)!==JSON.stringify(early.counts)||current.sourceRawSha256!==early.sourceRawSha256)throw Error('Early immutable queries differ from real legacy queries after replay');
 queryProof={checked:true,matched:true,counts:current.counts,sourceRawSha256:current.sourceRawSha256};
}
return{ok:true,protocolVersion:2,report,moved,crash,bootstrap,host,noDebugNamespace:!window.__dlv,
 district:{before:{district:before.district.current,opened:before.district.opened,city:before.district.city,partySeen:before.district.partySeen},actual:after.district.current,atControl:after.district.atControl,pizzaIndex:after.district.pizzaIndex,pizza:after.district.pizza,position:{x:control.data.x,z:control.data.z},pickerClicks:0,dialogClicks},
 acceptanceBefore:before,acceptanceAfter:after,startConditions,address:{details,queryProof},
 firstControlFromClickMs:control.at-start,conditions:{url:location.href,lang:document.documentElement.lang,physicalDeck:false,graphics:after.graphics}};
