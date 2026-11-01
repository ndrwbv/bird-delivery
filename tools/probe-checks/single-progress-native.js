/* Native DOM/API proof after real bootstrap. Optional legacy-bootstrap init-script verifies both in one run.
   No renderer reload: interrupted/restarted storage operations are exhaustively covered by Node units.
   Marker writes fail until final Retry, so keyboard-triggered retries cannot prematurely unlock this fixture.
   Only the EXACT handled injected '[reset] storage' log is captured; every other console error is forwarded. */
autopilot(false);
const out={fail:[],attempts:[],handledExpectedErrors:[]},check=(v,s)=>{if(!v)out.fail.push(s);};
if(window.__singleNativeVerify)out.boot=window.__singleNativeVerify();
const S=d.S,$=s=>document.querySelector(s),MARKER='dlv-single-marker-v1',JOURNAL='dlv-single-journal-v1',RESET_BACKUP='dlv-single-reset-backup-v1',LEGACY_BACKUP='dlv-single-legacy-backup-v1';
const raw=k=>localStorage.getItem(k),data=k=>JSON.parse(raw(k)||'null')?.data;
const openCard=selector=>{
  const el=$(selector);if(!el)throw Error(JSON.stringify({missing:selector,state:S.state}));
  const card=el.closest('.cz-card');
  if(card&&!card.classList.contains('on')){el.click();check(card.classList.contains('on'),'first menu click did not select '+selector);}
  el.click();
};
check(await until(()=>S.state==='title'&&$('.crm-card.k-settings .crm-cb'),20000),'ordinary hero menu unavailable');
if(out.fail.length)throw Error(JSON.stringify(out));
// Use ordinary persisted career keys, then rerender the real menu; no private reset/continuation calls.
d.Store.set('dlv-msk-wallet',45678);d.Store.set('dlv-shifts',7);d.Store.set('dlv-delivered',31);
d.Store.set('dlv-future-reset-proof',{shouldDisappear:true});d.CAREERM.menu();
const before={marker:raw(MARKER),saveId:data(MARKER)?.saveId,resets:data(MARKER)?.resets||0,legacy:raw(LEGACY_BACKUP),achievement:raw('dlv-ach'),board:raw('dlv-lb-local'),lang:raw('dlv-lang'),state:S.state,orders:S.orders};
openCard('.crm-card.k-settings .crm-cb');
check(await until(()=>$('#set-reset'),3000),'real settings reset route missing');$('#set-reset')?.click();
check(!!$('#rs-yes')&&!!$('#rs-no'),'real confirmation missing');
if(out.fail.length)throw Error(JSON.stringify(out));
const realSet=Storage.prototype.setItem,realConsoleError=console.error;
let enabled=true,faults=0;
Storage.prototype.setItem=function(key,value){if(enabled&&this===localStorage&&key===MARKER){faults++;throw new DOMException('single-reset native fixture','QuotaExceededError');}return realSet.call(this,key,value);};
console.error=(...args)=>{
  if(args[0]==='[reset] storage'&&args[1]?.name==='ProgressStorageError'&&args[1]?.key===MARKER&&faults){out.handledExpectedErrors.push({code:args[1].code,key:args[1].key});return;}
  return realConsoleError.apply(console,args);
};
const tap=code=>{for(const type of ['keydown','keyup'])dispatchEvent(new KeyboardEvent(type,{code,key:code,bubbles:true,cancelable:true}));};
const stateCheck=label=>{
  check(S.state===before.state&&S.orders===before.orders&&!S.order,label+': game started from partially published storage');
  check($('#panel')&&!$('#panel').hidden&&$('#rs-no')?.disabled&&$('#pn-close')?.disabled,label+': pending reset panel was released');
  check(raw(MARKER)===before.marker,label+': failed native marker write reported success');
  out.attempts.push({label,state:S.state,active:document.activeElement?.id||document.activeElement?.className||'',faults});
};
try{
  $('#rs-yes').click();
  check(await until(()=>faults>0&&!$('#rs-yes')?.disabled,4000),'native reset failure did not expose actual Retry');
  check(raw('dlv-msk-wallet')===null,'fixture did not reach partial canonical publication before marker rejection');
  const pending=data(JOURNAL),request=pending?.nextMarker?.lastResetRequest,tx=pending?.tx,reserve=raw(RESET_BACKUP);
  check(pending?.op==='reset'&&!!request&&pending.parent===data(MARKER)?.tx,'pending reset request not journaled');
  check(data(RESET_BACKUP)?.entries?.['dlv-msk-wallet']==='45678','reset reserve lacks original career');
  stateCheck('initial native failure');
  tap('Tab');tap('Escape');tap('Backspace');await wait(120);stateCheck('Tab/Escape/Backspace');
  // Programmatic focus/click on actual background controls exercises capture and transition guards,
  // including paths that inert normally prevents the user's pointer/tab navigation from reaching.
  for(const selector of ['.crm-card.k-go .crm-cb','.crm-card.k-ride .crm-cb','.crm-card.k-quick .crm-cb']){
    const button=$(selector);check(!!button,'background control missing: '+selector);if(!button)continue;
    button.focus();button.click();await wait(80);stateCheck('background '+selector);
  }
  const behind=$('.crm-card.k-go .crm-cb');behind?.focus();tap('Enter');tap('Space');await wait(160);stateCheck('Enter/Space after background focus');
  const attemptsBefore=faults;$('#rs-yes')?.click();
  check(await until(()=>faults>attemptsBefore&&!$('#rs-yes')?.disabled,4000),'real public Retry did not reattempt native commit');
  stateCheck('public Retry still blocked by native failure');
  check(data(JOURNAL)?.tx===tx&&data(JOURNAL)?.nextMarker?.lastResetRequest===request,'keyboard/public retry replaced transaction/requestId');
  check(raw(RESET_BACKUP)===reserve,'public retry replaced reserve with partly erased career');
  check(document.activeElement?.id==='rs-yes','pending reset did not retain retry focus');
  // Actual Retry, same confirmation closure/request, now allowed to persist the commit.
  enabled=false;Storage.prototype.setItem=realSet;
  $('#rs-yes')?.click();
  check(await until(()=>$('#panel')?.hidden===true&&d.wallet()===0,12000),'same-request public Retry did not finish/reset UI remained locked');
  const after=data(MARKER);
  check(after?.saveId===before.saveId&&after.resets===before.resets+1&&after.lastResetRequest===request,'duplicate reset or changed identity on Retry');
  check(raw(RESET_BACKUP)===reserve,'successful retry overwrote original reset reserve');
  check(raw(LEGACY_BACKUP)===before.legacy,'inactive legacy reserve changed');
  check(d.Store.get('dlv-future-reset-proof',null)===null&&d.Store.get('dlv-shifts',0)===0,'unknown progress key survived reset');
  check(raw('dlv-ach')===before.achievement&&raw('dlv-lb-local')===before.board&&raw('dlv-lang')===before.lang,'reset changed shared achievements/history/language');
  check(!$('#big')?.inert&&!$('#over')?.inert,'successful reset left old background inert');
  check(out.handledExpectedErrors.length===faults&&faults>0,'unexpected/missing handled native-error diagnostics');
  check(!!$('.crm-card.k-go .crm-cb'),'normal start button unavailable after reset');openCard('.crm-card.k-go .crm-cb');
  const startedAt=Date.now(),loaded=()=>['brief','loading','drive'].includes(S.state)&&!!S.order;
  out.startLoading={bootSeen:!!document.querySelector('#boot.late-wait'),samples:[]};
  let sampledAt=0;
  while(!loaded()&&Date.now()-startedAt<90000){
    const now=Date.now();out.startLoading.bootSeen ||= !!document.querySelector('#boot.late-wait');
    if(now-sampledAt>=1000){
      const place=d.PZ_CUR||d.PIZZA,stream=d.LAND_STREAM;
      out.startLoading.samples.push({ms:now-startedAt,state:S.state,boot:!!document.querySelector('#boot.late-wait'),
        stats:stream?{...stream.stats}:null,ready:stream&&place?stream.readyAt(place.bx??place.x,place.bz??place.z,640):null});
      sampledAt=now;
    }
    await wait(50);
  }
  out.startLoading.ms=Date.now()-startedAt;
  out.startLoading.finalStats=d.LAND_STREAM?{...d.LAND_STREAM.stats}:null;
  check(loaded(),'ordinary menu start failed after successful Retry: '+JSON.stringify({state:S.state,orders:S.orders,boot:out.startLoading.bootSeen,land:out.startLoading.finalStats}));
  check(S.orders===1,'ordinary start count '+S.orders+' differs from one');
  check(d.wallet()===0,'normal start restored the old profile wallet');
  out.final={state:S.state,orders:S.orders,saveId:after?.saveId,resets:after?.resets,requestId:request,faults};
}finally{enabled=false;Storage.prototype.setItem=realSet;console.error=realConsoleError;}
out.crash=d.crashlog.entries();check(!out.crash.length,'runtime crash during native reset proof');out.ok=!out.fail.length;
if(!out.ok)throw Error(JSON.stringify(out));return out;
