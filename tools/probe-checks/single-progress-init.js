/* INIT SCRIPT only, main-world CDP before loadURL. Probe already owns an isolated ephemeral userData/session.
   Example AFTER integration: --init-script=.../legacy-bootstrap.js --q='gfx=high&gfxdev=deck&singlefail=journal'
   --js='return window.__singleNativeVerify()'. Run again --lang=en&singlefail=marker (CLI uses separate --lang=en).
   This fixture never opens/reads the author's browser/session and does not reload the renderer. */
(() => {
  if (location.protocol !== 'app:' || !/\/index\.html$/.test(location.pathname)) return;
  const MARKER='dlv-single-marker-v1', JOURNAL='dlv-single-journal-v1', BACKUP='dlv-single-legacy-backup-v1';
  const q=new URLSearchParams(location.search), mode=q.get('singlefail')==='marker'?'marker':'journal', language=q.get('lang')||'ru';
  const realSet=Storage.prototype.setItem, realRemove=Storage.prototype.removeItem;
  const seed={};
  const put=(key,value)=>{seed[key]=JSON.stringify(value);realSet.call(localStorage,key,seed[key]);};
  for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key?.startsWith('dlv-'))realRemove.call(localStorage,key);}
  put('dlv-lang',language);put('dlv-money-x8',1);put('dlv-sound',false);put('dlv-vol-music',.37);
  put('dlv-ach',{got:{},n:{orders:17}});put('dlv-lb-local',[{name:'Женя',score:9999,ts:1},{name:'Other historical courier',score:8888,ts:2}]);
  put('dlv-profiles',{v:1,cur:2,list:[{id:1,name:'Old Root Courier'},{id:2,name:'Old Active Courier'}]});
  for(const [id,prefix,wallet,car,chapter,shifts,district] of [[1,'dlv-',1111,'semerka',0,2,0],[2,'dlv-p2-',34567,'matiz',1,7,2]]){
    put(prefix+'name','Old Courier '+id);put(prefix+'msk-wallet',wallet);put(prefix+'msk-best',wallet+100);
    put(prefix+'car-owned',id===2?['semerka','matiz']:['semerka']);put(prefix+'car-cur',car);
    put(prefix+'story',{gennady:{ch:chapter,last:shifts,flags:{fixtureProfile:id}}});
    put(prefix+'shifts',shifts);put(prefix+'delivered',id*13);put(prefix+'district',district);
    put(prefix+'dist-open',id===2?3:1);put(prefix+'dist-shifts',id===2?[8,8,0,0,0,0,0,0]:[0,0,0,0,0,0,0,0]);
    put(prefix+'msk-guide',1);put(prefix+'msk-tut','1');put(prefix+'msk-nostut',1);put(prefix+'shift-tut',1);
  }
  put('dlv-root-only-future',{wrongProfile:true});put('dlv-p2-future-system',{chapter:23,proof:'unknown-key-survives'});
  const state=window.__singleBootFixture={mode,language,seed,failed:0,observed:false,retryClicks:0,errors:[]};
  Storage.prototype.setItem=function(key,value){
    if(this===localStorage&&!state.failed&&key===(mode==='marker'?MARKER:JOURNAL)){
      state.failed++;state.failedKey=key;throw new DOMException('single-progress native fixture','QuotaExceededError');
    }
    return realSet.call(this,key,value);
  };
  let waiting=false, finished=false;
  const observer=new MutationObserver(watch);
  function watch(){
    if(finished||waiting)return;
    const panel=document.querySelector('.boot-save-error'),button=panel?.querySelector('button');
    if(!button)return;
    waiting=true;state.observed=true;state.blocked=!window.__dlv&&!window.__boot;
    state.text=panel.textContent;state.markerBeforeRetry=localStorage.getItem(MARKER);
    state.walletBeforeRetry=localStorage.getItem('dlv-msk-wallet');
    const raw=localStorage.getItem(JOURNAL);state.journalBeforeRetry=raw?JSON.parse(raw).data:null;
    setTimeout(()=>{
      state.stillBlocked=!window.__dlv&&!window.__boot&&document.querySelector('.boot-save-error button')===button;
      state.retryClicks++;button.click();finished=true;observer.disconnect();
    },120);
  }
  observer.observe(document,{childList:true,subtree:true});watch();
  window.__singleNativeVerify=()=>{
    Storage.prototype.setItem=realSet;
    const fail=[],check=(v,s)=>{if(!v)fail.push(s);},d=window.__dlv;
    check(state.failed===1&&state.failedKey===(mode==='marker'?MARKER:JOURNAL),'native failure was not injected exactly once');
    check(state.observed&&state.blocked&&state.stillBlocked&&state.retryClicks===1,'real boot Retry was bypassed or never observed');
    check(state.text.includes(language==='en'?'Retry':'Повторить'),'boot error was not localized');
    check(!document.querySelector('.boot-save-error')&&!!d,'normal game did not load after real Retry');
    if(!d)throw Error(JSON.stringify({fail,state}));
    const get=key=>d.Store.get(key,null),marker=JSON.parse(localStorage.getItem(MARKER)||'null')?.data;
    const backup=JSON.parse(localStorage.getItem(BACKUP)||'null')?.data;
    check(marker?.sourceProfile===2&&!!marker?.saveId&&marker.resets===0,'committed identity/source profile');
    check(get('dlv-msk-wallet')===34567&&d.wallet()===34567,'active p2 wallet not selected');
    check(JSON.stringify(get('dlv-car-owned'))===JSON.stringify(['semerka','matiz'])&&get('dlv-car-cur')==='matiz'&&d.car.userData.careerId==='matiz','active p2 cars not selected');
    check(get('dlv-story')?.gennady?.ch===1&&d.STORY.progress().gennady.ch===1,'active p2 story not selected');
    check(get('dlv-district')===2&&get('dlv-shifts')===7,'active p2 district/shifts not selected');
    check(get('dlv-root-only-future')===null&&get('dlv-future-system')?.chapter===23,'unknown key inherited from p1 or p2 key lost');
    check(get('dlv-ach')?.n?.orders===17&&get('dlv-vol-music')===.37,'shared achievements/settings changed');
    check(JSON.stringify(get('dlv-lb-local'))===seed['dlv-lb-local'],'historical leaderboard changed');
    for(const key of ['dlv-msk-wallet','dlv-story','dlv-p2-msk-wallet','dlv-p2-story','dlv-profiles']){
      check(backup?.entries?.[key]===seed[key],'immutable legacy backup mismatch: '+key);
    }
    check(localStorage.getItem('dlv-p2-msk-wallet')===seed['dlv-p2-msk-wallet'],'inactive p2 reserve deleted');
    check(!d.crashlog.entries().length,'runtime crash after bootstrap');
    const result={ok:!fail.length,fail,mode,language,bootBlocked:state.blocked,failed:state.failed,retryClicks:state.retryClicks,saveId:marker?.saveId,sourceProfile:marker?.sourceProfile,wallet:d.wallet(),car:d.car.userData.careerId,storyChapter:get('dlv-story')?.gennady?.ch};
    if(fail.length)throw Error(JSON.stringify(result));return result;
  };
})();
