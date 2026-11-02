/* Synthetic protocol faults plus the real DOM eval in a tiny fake page. Never spawns Electron. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {parseAddressSmokeArgs,validateAddressRuntimeAdmission} from './address-package-smoke.mjs';
const {admissionSettings}=createRequire(import.meta.url)('./startup-admission.cjs');
const base={mapId:'seversk',mapHash:'a'.repeat(64),editsHash:'b'.repeat(64),sourceHash:'c'.repeat(64)};
const slot=(graphics,c)=>({graphics,identity:{...base,inputHash:c.repeat(64)},entry:{path:'address-data/'+c.repeat(64)+'.addr',bytes:1000,sha256:c.repeat(64)}});
const catalog={version:2,kind:'address-package17b',slots:[slot('mid','d'),slot('high','e')]};
const ordinary={provider:'edl-owned-fnv1a-mulberry32-v1',ordinaryAtImport:true,hookOwned:true,baseSeed:0x5EED};
const pizza={x:0,z:0,bx:0,bz:0},counts={houses:0,generatedDoors:0,spots:0,rawEntrances:1};
function details(preset='high',variant='cache'){
 const s=catalog.slots.find(s=>s.graphics===preset);
 const shared={rng:{...ordinary},preLate:{phase:'city-pizzeria-before-late',district:0,pizzaIndex:0,pizza:{...pizza},lateWorkStarted:false}};
 if(variant==='generated')return{...shared,input:{eligible:false,reason:'unsupported-fresh-query'},status:{phase:'generated',reason:'unsupported-fresh-query'},preload:{phase:'off',held:false,wireHash:null,wireBytes:0},provider:null,early:null};
 return{...shared,input:{eligible:true,identity:{...s.identity},descriptor:{version:2,profile:'fresh-v1',initial:{graphics:{preset}}}},status:{phase:'private-ready',reason:null},
  provider:{phase:'sealed',privateReady:true,fatal:false,auditRetained:false},preload:{phase:'consumed',consumed:true,held:false,reason:null,catalogVersion:2,selectedGraphics:preset,wireHash:s.entry.sha256,wireBytes:s.entry.bytes},
  preVisual:{phase:'before-city-syncBuild',at:1,before:{...counts},after:{...counts},lateWorkStarted:false,inputHash:s.identity.inputHash},early:{phase:'before-city-syncBuild',at:2,before:{...counts},after:{...counts},provider:{privateReady:true},queries:null}};
}
const control=()=>({at:100,data:{state:'drive',held:false,paused:false,mapOpen:false,localReady:true,supportReady:true,guardVersion:2,x:0,z:0}});
function report(){return{enabled:true,dropped:0,overflow:{rows:0,marks:0,flags:0,counters:0},flags:{},resourceCapture:{truncatedCount:0},marks:{'first.control':control(),'city.syncBuilt':{at:50},'queue.full':{at:40}},rows:[{name:'synthetic',exclusiveWorkMs:1}],workUnionMs:1};}
function raw(preset='high',variant='cache',admission='settled'){
 const h={seed:null,cpuThrottle:1,bootcpu:true,environment:{productionQuery:true,noLanguage:true,deck:true},userAgent:{actual:'Synthetic Steam Deck'},...(admission==='settled'?{admission:admissionSettings('settled')}:{})};
 const before={state:'title',testTools:false,firstControl:null},after={state:'drive',testTools:false};
 return{ok:true,evalErr:null,uncaught:0,errors:[],result:{ok:true,protocolVersion:2,crash:[],bootstrap:{markerWrites:1,bootAbsentAtMarker:true,earlyBootSeen:false},host:h,report:report(),moved:.1,noDebugNamespace:true,
  district:{before:{district:0,opened:1,city:false,partySeen:false},actual:0,atControl:0,pizzaIndex:0,pizza:{...pizza},position:{x:0,z:0},pickerClicks:0},acceptanceBefore:before,acceptanceAfter:after,startConditions:{state:'title',bootFull:40,queueFullAt:40,preexistingControl:false},
  address:{details:details(preset,variant),queryProof:{checked:false,matched:false}},conditions:{url:'app://g/index.html?mute&startuptrace'+(variant==='generated'?'&addresspackage17b=0':''),lang:'ru',physicalDeck:false,graphics:{preset,device:'deck',width:1280,height:800}}}};
}
let checks=0;async function test(name,fn){try{await fn();checks++;}catch(e){e.message=name+': '+e.message;throw e;}}
const validate=(value,extra={})=>validateAddressRuntimeAdmission(value,{catalog,preset:'high',...extra});
await test('strict CLI defaults use cache/settled and real explicit output',()=>assert.deepEqual(parseAddressSmokeArgs(['--dir=/tmp/build','--out=/tmp/new']),{dir:'/tmp/build',out:'/tmp/new',preset:'high',variant:'cache',admission:'settled'}));
for(const argv of [[],['--dir=a','--out=b','--seed=7'],['--dir=a','--out=b','--out=c'],['--dir=a','--out=b','--preset=low'],['--dir=a','--out=b','--variant=bad'],['--dir=a','--out=b','--admission=unknown']])await test('reject invalid CLI',()=>assert.throws(()=>parseAddressSmokeArgs(argv)));
for(const preset of ['mid','high'])for(const variant of ['cache','generated'])for(const admission of ['early','settled'])await test('synthetic admitted '+[preset,variant,admission].join('/'),()=>assert.equal(validateAddressRuntimeAdmission(raw(preset,variant,admission),{catalog,preset,variant,admission}).ok,true));
for(const [name,change]of [
 ['renderer failure',v=>v.evalErr='failed'],['debug namespace',v=>v.result.noDebugNamespace=false],['test tools',v=>v.result.acceptanceAfter.testTools=true],['no W',v=>v.result.moved=0],['bad guard',v=>v.result.report.marks['first.control'].data.guardVersion=1],['wrong district',v=>v.result.district.actual=3],['mature opened',v=>v.result.district.before.opened=8],['party seen',v=>v.result.district.before.partySeen=true],['fake picker',v=>v.result.district.pickerClicks=1],['seed override',v=>v.result.host.seed='7'],['missing production host',v=>v.result.host.environment.productionQuery=false],['wrong actual UA',v=>v.result.host.userAgent.actual='Desktop'],['wrong graphics',v=>v.result.conditions.graphics.preset='mid'],['small viewport',v=>v.result.conditions.graphics.height=720],['debug query',v=>v.result.conditions.url+='&debug'],['language query',v=>v.result.conditions.url+='&lang=ru'],['forced world',v=>v.result.conditions.url+='&gfxdev=deck'],['not settled',v=>v.result.startConditions.bootFull=null],
 ['wrong selected profile',v=>v.result.address.details.preload.selectedGraphics='mid'],['wrong catalog version',v=>v.result.address.details.preload.catalogVersion=1],['wrong wire SHA',v=>v.result.address.details.preload.wireHash='f'.repeat(64)],['wrong byte count',v=>v.result.address.details.preload.wireBytes=999],['still held',v=>v.result.address.details.preload.held=true],['wrong actual input',v=>v.result.address.details.input.identity.inputHash='f'.repeat(64)],['no actual identity',v=>delete v.result.address.details.input.identity],['old mature key profile',v=>v.result.address.details.input.descriptor.profile='B1'],['unsealed replay',v=>v.result.address.details.provider.phase='collecting'],['fatal replay',v=>v.result.address.details.provider.fatal=true],['retained audit',v=>v.result.address.details.provider.auditRetained=true],['live prepopulated',v=>v.result.address.details.early.before.houses=1],['late before hash',v=>v.result.address.details.preVisual.lateWorkStarted=true],['bad preLate PZ',v=>v.result.address.details.preLate.pizzaIndex=3],['RNG replaced',v=>v.result.address.details.rng.hookOwned=false],
])await test('reject synthetic '+name,()=>{const v=raw();change(v);assert.equal(validate(v).ok,false);});
await test('generated refuses a held/private provider despite explicit optout',()=>{const v=raw('high','generated');v.result.address.details.provider={privateReady:true};assert.equal(validate(v,{variant:'generated'}).ok,false);});
await test('optional query proof is mandatory only when requested',()=>{const v=raw();assert.equal(validate(v).ok,true);assert.equal(validate(v,{requireQueries:true}).ok,false);v.result.address.details.early.queries={sourceRawSha256:'f'.repeat(64)};v.result.address.queryProof={checked:true,matched:true,sourceRawSha256:'f'.repeat(64)};assert.equal(validate(v,{requireQueries:true}).ok,true);v.result.address.queryProof.matched=false;assert.equal(validate(v,{requireQueries:true}).ok,false);});
await test('invalid expected product catalog never admits',()=>assert.equal(validateAddressRuntimeAdmission(raw(),{catalog:{version:1},preset:'high'}).ok,false));

const source=fs.readFileSync(new URL('./probe-checks/address-package-ready.js',import.meta.url),'utf8');
async function fakePage({movementError=false}={}){
 let now=60,active=false,dialog=false,moving=false,x=0,detailsCalls=0,goClicks=0,yesClicks=0,downs=0,ups=0;
 const base=raw().result,h=base.host,win={__startupTrace:{enabled:true},__startupHost:h,__boot:{full:40},__startupBootGuard:base.bootstrap};
 const capture=()=>({state:active?'drive':'title',position:{x,z:0},testTools:false,firstControl:active?control():null,district:{current:0,opened:1,city:false,partySeen:false,pizzaIndex:0,pizza:{...pizza},atControl:active?0:null},graphics:base.conditions.graphics});
 win.__addressAcceptance17b={ready:true,capture,report:()=>{const r=report();if(!active)delete r.marks['first.control'];return r;},details:()=>{detailsCalls++;return structuredClone(base.address.details);},queries:()=>null,crashes:()=>[]};
 const button=click=>({disabled:false,closest:()=>null,getBoundingClientRect:()=>({width:10}),click});
 const go=button(()=>{goClicks++;dialog=true;}),yes=button(()=>{yesClicks++;dialog=false;active=true;});
 const doc={documentElement:{lang:'ru'},querySelector:selector=>selector.startsWith('.crm-card')?go:selector==='#dlg:not([hidden])'&&dialog?{querySelector:()=>yes,querySelectorAll:()=>[yes]}:null,dispatchEvent:event=>{if(event.type==='keydown'){moving=true;downs++;}if(event.type==='keyup'){moving=false;ups++;}}};
 const wait=async ms=>{now+=ms;if(moving){if(movementError)throw Error('synthetic movement wait');x+=.02;}};
 let result,error;try{result=await vm.runInNewContext('(async()=>{'+source+'})()',{window:win,document:doc,location:{href:base.conditions.url},performance:{now:()=>now},getComputedStyle:()=>({visibility:'visible'}),KeyboardEvent:class{constructor(type,options){this.type=type;Object.assign(this,options);}},wait});}catch(e){error=e;}
 return{result,error,detailsCalls,goClicks,yesClicks,downs,ups};
}
await test('actual DOM eval body uses Go/tutorial/W and one large details read without debug API',async()=>{const page=await fakePage();assert.equal(page.error,undefined);assert.equal(page.goClicks,1);assert.equal(page.yesClicks,1);assert.equal(page.downs,1);assert.equal(page.ups,1);assert.equal(page.detailsCalls,1);assert.equal(page.result.noDebugNamespace,true);assert.ok(page.result.moved>.05);const v=JSON.parse(JSON.stringify({ok:true,evalErr:null,errors:[],uncaught:0,result:page.result}));assert.equal(validate(v).ok,true);});
await test('actual DOM eval releases W even when movement wait throws',async()=>{const page=await fakePage({movementError:true});assert.match(page.error.message,/synthetic movement wait/);assert.equal(page.downs,1);assert.equal(page.ups,1);assert.equal(page.detailsCalls,0);});
console.log(JSON.stringify({ok:true,checks,pureGate:true,realEvalBody:true,noElectronSpawn:true,noWorldOrBuild:true}));
