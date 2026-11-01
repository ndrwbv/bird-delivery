/* №12: чистая взрослая Steam-сессия; отсутствие редактирования, полезная статистика,
   подтверждённый сброс одной карьеры и запуск клавиатурой/геймпадом. Старую миграцию проверяет singleprogress отдельно.
   npm run probe -- --mode=steam --fresh --size=deck --q='gfx=high&gfxdev=deck&mock-steam=deck' --eval=tools/probe-checks/single-hero-ui.js --max=0 --errors
   Второй запуск с --lang=en проверяет единый перевод Zhenya; сохранение probe временное. */
const out={fail:[],steps:[]},check=(v,s)=>{if(!v)out.fail.push(s);};
const shots=new URLSearchParams(location.search).get('heroshots');
const $=s=>document.querySelector(s), name=document.documentElement.lang==='ru'?'Женя':'Zhenya';
const click=selector=>{const el=$(selector);if(!el)throw Error(JSON.stringify({missing:selector,state:d.S.state,paused:d.S.paused,panelHidden:$('#panel')?.hidden,panelKind:$('#panel')?.dataset.kind,buttons:Array.from(document.querySelectorAll('#panel button')).map(b=>({id:b.id,text:b.textContent,hidden:b.hidden}))}));const card=el.closest('.cz-card');if(card&&!card.classList.contains('on'))el.click();el.click();};
await until(()=>d.CAREERM&&d.S.state==='title',90000);
const oldName='Старое имя профиля';
d.Store.set('dlv-name',oldName);d.CAREERM.menu();
check(d.S.name===name,'state hero name differs from localized source');
check($('.crm-who b')?.textContent===name,'menu uses old profile/Steam name');
check(!$('#st-name')&&!$('#crm-name')&&!$('#crm-prof')&&!$('.crm-swap')&&!$('[data-a="profile"]'),'profile/name UI remains');
document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyY',key:'y',bubbles:true,cancelable:true}));
document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyY',key:'y',bubbles:true}));
const oldPads=navigator.getGamepads;
const gp={id:'Acceptance pad',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))};
try{navigator.getGamepads=()=>[gp];gp.buttons[3]={pressed:true,touched:true,value:1};await wait(180);gp.buttons[3]={pressed:false,touched:false,value:0};await wait(120);}finally{navigator.getGamepads=oldPads;}
check(!$('#crm-prof')&&!$('#crm-name')&&!$('#courier-card'),'Y still opens a profile/name route');
out.steps.push('no name prompt and no Y profile route');
if(shots){await wait(800);await shot(shots+'-menu.png');}
const seeded={'dlv-shifts':7,'dlv-delivered':31,'dlv-msk-best':12340,'dlv-msk-wallet':23450};
for(const[k,v]of Object.entries(seeded))d.Store.set(k,v);
click('.crm-stats');
const card=$('#courier-card');
check(card?.getAttribute('role')==='dialog'&&$('.cc-name')?.textContent===name,'courier card missing/wrong name');
check(card&&!card.querySelector('input')&&!/переименовать|создать профиль|delete profile|new profile/i.test(card.textContent),'card retains profile management');
const values=Array.from(card?.querySelectorAll('dd')||[]).map(e=>e.textContent.replace(/\D/g,''));
check(values.some(v=>v.includes('31'))&&values.some(v=>v.includes('12340'))&&values.some(v=>v.includes('23450')),'current career statistics lost');
if(shots){await wait(800);await shot(shots+'-card.png');}
click('.cc-back');check(!$('#courier-card'),'card back did not close');
click('.crm-card.k-settings .crm-cb');
check(!$('#set-name')&&!$('#set-prof'),'settings still offers name/profile controls');
click('#set-hero');check(!!$('#courier-card'),'settings courier card unavailable');click('.cc-back');
check(!!$('#set-reset'),'settings return did not restore focus path');
const oldAchievement=d.Store.get('dlv-ach',null),oldBoard=d.Store.get('dlv-lb-local',null);
click('#set-reset');
check(document.activeElement?.id==='rs-no'||!!$('#rs-no[autofocus]'),'reset defaults to destructive action');
if(shots){await wait(800);await shot(shots+'-reset.png');}
click('#rs-no');check(d.Store.get('dlv-msk-wallet')===23450,'cancel reset changed career');
click('#set-reset');click('#rs-yes');
check(await until(()=>$('#panel')?.hidden&&d.Store.get('dlv-shifts',0)===0,15000),'confirmed reset did not finish');
check(d.wallet()===0&&d.S.name===name,'reset lost hero name or retained money');
check(JSON.stringify(d.Store.get('dlv-ach',null))===JSON.stringify(oldAchievement),'reset lost shared achievements');
check(JSON.stringify(d.Store.get('dlv-lb-local',null))===JSON.stringify(oldBoard),'reset erased historical local table');
d.CAREERM.menu();
check($('.crm-who b')?.textContent===name&&!$('#crm-name'),'reset reopened name prompt');
out.steps.push('stats retained; cancel safe; confirmed reset retains settings/achievements/history');
// Настоящая карточка «на смену» после сброса без обязательного текстового ввода.
click('.crm-card.k-go .crm-cb');
check(await until(()=>['brief','drive','loading'].includes(d.S.state),15000),'start still depends on a name');
check(d.S.name===name,'shift uses Steam/profile name');
out.steps.push('real menu start without name input');
out.crash=d.crashlog.entries();check(!out.crash.length,'runtime crash');out.ok=!out.fail.length;
if(!out.ok)throw Error(JSON.stringify(out));return out;
