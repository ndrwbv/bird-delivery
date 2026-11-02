/* Synthetic host envelopes are explicitly labelled; payload is a real tiny recorder/codec, never game proof. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createAddressCatalogRecorder} from '../src/game/addresscatalog.js';
import {encodeAddressCatalog} from '../src/game/addresscodec17b.js';
import {RNG_PROVIDER,BASE_SEED} from '../src/game/landdata/land-package-key.js';
import {ADDRESS_EXPORT_QUERY,FRESH_ADDRESS_EXPORT_QUERY,addressPreparationFixture,freshAddressPreparationFixture,parseAddressPreparationArgs,addressPreparationSchedule,addressProductCatalog,checkAddressExport,checkAddressRepeats,earlyQueryArtifact,earlyQueryInit} from './address-package-prepare.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),base={mapId:'fixture',mapHash:'a'.repeat(64),editsHash:'b'.repeat(64),sourceHash:'c'.repeat(64)},identity={...base,inputHash:'d'.repeat(64)};
function exact(v){if(v===null)return['null'];if(v===undefined)return['undefined'];if(typeof v==='number'){const b=Buffer.alloc(8);b.writeDoubleLE(v);return['number',b.toString('hex')];}if(['string','boolean'].includes(typeof v))return[typeof v,v];if(Array.isArray(v))return['array',v.map(exact)];return['object',Object.keys(v).map(k=>[k,exact(v[k])])];}
const targets={buildings:[{id:-0}],houses:[],generatedDoors:[],entrances:[[-0,0,1,0]],spots:[]},rec=createAddressCatalogRecorder(targets);
rec.acceptHouse(targets.buildings[0],{x:-0,z:1,mx:2,mz:3,addr:'Проверка, 1',name:'',lv:5});rec.acceptDoor(targets.buildings[0],[3,4,-0,1],true);rec.mergeDoorsOnce();targets.spots.push({x:-0,z:7});rec.sealSpots();
const snapshot=rec.snapshot(),wire=Buffer.from(encodeAddressCatalog(snapshot,identity)),url='app://g/index.html?debug&mute&nolb&lang=ru&startuptrace&'+ADDRESS_EXPORT_QUERY;
const query=[...new URL(url).searchParams].sort(([a],[b])=>a<b?-1:a>b?1:0);
const descriptorRNG=()=>({provider:RNG_PROVIDER,baseSeed:BASE_SEED,ordinaryAtImport:true,hookOwned:true});
function fixture(){
 const initial={phase:'before-city-syncBuild',at:1,mapId:'fixture',mode:'steam',adult:true,career:true,intro:false,editor:false,language:'ru',season:{value:2.5,forced:false,saved:2.5},donation:{trashRaw:0,trashGoal:480000,trashFraction:0},district:{current:0,opened:8,city:false},car:{id:'semerka'},graphics:{preset:'high',device:'deck'},ordinary:descriptorRNG()};
 const normalized={...initial};delete normalized.at;
 const descriptor={version:1,base:{...base},initial:normalized,progress:{values:{absent:undefined,signedZero:-0,'dlv-money-x8':1,'dlv-msk-wallet':240000},presentKeys:['signedZero','dlv-money-x8','dlv-msk-wallet']},query:{raw:new URL(url).search,entries:query},counts:{buildings:1}};
 const p={version:1,case:'B1',initial,menuExact:exact(snapshot),fixedQueriesExact:exact({addresses:[['house',0,-0,1]],levels:[['rawDoor',0,-0,0]]}),exactQueryTables:exact({address:['Проверка, 1'],levels:[5],home:[-0,1],pool:[0]}),ownedAliases:true,unchanged:{menuOwnerSnapshot:true,arrayReferencesThroughGo:true},functionalQueries:{actualQueries:true,unchanged:{arrayAndRowReferences:true,savedKeys:true,rngDescriptor:true}}};
 const r={ok:true,protocolVersion:2,report:{enabled:true,dropped:0,overflow:{rows:0,marks:0,flags:0,counters:0},flags:{},resourceCapture:{truncatedCount:0},marks:{'city.syncBuilt':{at:5},'first.control':{at:10,data:{state:'drive',held:false,localReady:true,supportReady:true,guardVersion:2,paused:false,mapOpen:false}}},rows:[],workUnionMs:0,counters:{'raisedland.cleanCalls':1}},moved:.163,bootstrap:{markerWrites:1,bootAbsentAtMarker:true,earlyBootSeen:false},crash:[],district:{actual:0,atControl:0,pizzaIndex:0,pizza:{bx:1,bz:2},position:{x:1,z:2},pickerClicks:1,before:{opened:8,city:false}},host:{seed:null,cpuThrottle:1,bootcpu:true},rng:descriptorRNG(),conditions:{url,lang:'ru',graphics:{preset:'high',device:'deck',width:1280,height:800}},landPackage:null,cache:null,addressClosure:p,addressExport:{version:1,meta:{phase:'sealed',preVisual:{phase:'before-city-syncBuild',at:2,before:{houses:0,generatedDoors:0,spots:0,rawEntrances:1},after:{houses:0,generatedDoors:0,spots:0,rawEntrances:1},lateWorkStarted:false,inputHash:identity.inputHash},input:{eligible:true,identity:{...identity},descriptor},preload:{phase:'generated',reason:'address-package17b:CATALOG',held:false,consumed:true}},inputDescriptorExact:exact(descriptor),preparedReplay:false,wire:{bytes:wire.length,sha256:hash(wire),base64:wire.toString('base64')},oracleBody:{kind:'historical-oracle-body-not-runtime-identity',sha256:'e'.repeat(64)}}};
 // Real probe JSON erases undefined/-0 in generic objects. Only inputDescriptorExact/menuExact remain authoritative.
 return JSON.parse(JSON.stringify({fixtureKind:'synthetic-host-contract-not-game-observation',ok:true,errors:[],uncaught:0,evalErr:null,startupHost:{seed:null},result:r}));
}
function freshFixture(graphics='mid'){
 const v=fixture(),r=v.result,p=r.addressClosure,initial=p.initial;
 r.host.admission={...addressPreparationSchedule(true)};v.startupHost.admission={...r.host.admission};
 r.startConditions={state:'title',queueBusy:false,queueFullAt:4,bootFull:5,preexistingControl:false};
 initial.season.saved=null;initial.district.opened=1;initial.car.inputs=Object.fromEntries(['dlv-car-owned','dlv-car-cur','dlv-car-up','dlv-car-L','dlv-car-paint','dlv-car-eng'].map(k=>[k,null]));initial.graphics.preset=graphics;
 r.district.pickerClicks=0;r.district.before.opened=1;r.conditions.graphics.preset=graphics;
 const raw='?debug&mute&nolb&startuptrace&'+FRESH_ADDRESS_EXPORT_QUERY;r.conditions.url='app://g/index.html'+raw;r.freshEnvironment={userAgent:'Mozilla/5.0 Steam Deck SteamOS',rawQuery:raw};
 p.case='fresh-'+graphics;p.profile='ordinary-first-career';p.repairNoop={district:0,opened:1,city:false,partySeen:false};
 const own={...initial};delete own.at;
 const descriptor={version:2,profile:'fresh-v1',base:{...base},initial:own,progress:{values:{'dlv-money-x8':1},presentKeys:['dlv-money-x8']},query:{normalization:'fresh-diagnostics-v1',raw:'',entries:[]},diagnosticQuery:{raw,entries:[...new URL(r.conditions.url).searchParams].sort(([a],[b])=>a<b?-1:a>b?1:0)},counts:{buildings:1}};
 const id={...identity,inputHash:(graphics==='mid'?'d':'e').repeat(64)},bytes=Buffer.from(encodeAddressCatalog(snapshot,id));
 r.addressExport.meta.input={eligible:true,identity:id,descriptor};r.addressExport.inputDescriptorExact=exact(descriptor);r.addressExport.meta.preVisual.inputHash=id.inputHash;
 r.addressExport.wire={bytes:bytes.length,sha256:hash(bytes),base64:bytes.toString('base64')};r.addressExport.oracleBody.kind='fresh-proof-with-original-functional-oracles';
 return JSON.parse(JSON.stringify(v));
}
let count=0;async function test(name,fn){await fn();count++;}
await test('exact B1 literal keeps legacy money migration and has no fabricated service markers',()=>{
 const f=addressPreparationFixture();assert.equal(hash(Buffer.from(JSON.stringify(f,null,2)+'\n')),'befff63fde0ebb4936291884fbaa605b02f135006b19761f923775568ce1f95f');assert.equal(f['dlv-msk-wallet'],30000);assert.equal(f['dlv-money-x8'],undefined);assert.equal(Object.keys(f).some(k=>k.startsWith('dlv-single-')||k==='dlv-profiles'),false);f['dlv-car-owned'].push('alien');assert.deepEqual(addressPreparationFixture()['dlv-car-owned'],['semerka']);
});
await test('valid synthetic host envelope admits actual codec/native SHA and retains exact descriptor absence/sign',async()=>{
 const value=fixture(),a=await checkAddressExport(value,{base});assert.deepEqual(a.snapshot,snapshot);assert.ok(a.bytes.equals(wire));assert.equal(Object.is(a.snapshot.houses[0].x,-0),true);const descriptor=a.descriptorExact;assert.ok(JSON.stringify(descriptor).includes('undefined'));assert.ok(JSON.stringify(descriptor).includes('0000000000000080'));assert.equal(value.fixtureKind,'synthetic-host-contract-not-game-observation');
});
for(const [name,change,pattern]of [
 ['zero exit equivalent with resultfalse',v=>v.result.ok=false,/STARTUP/],['console error',v=>v.errors.push('actual renderer error'),/STARTUP/],['uncaught',v=>v.uncaught=1,/STARTUP/],['guard v1',v=>v.result.report.marks['first.control'].data.guardVersion=1,/STARTUP/],['no real W',v=>v.result.moved=0,/STARTUP/],['no picker',v=>v.result.district.pickerClicks=0,/ACTUAL_MATURE_PICKER/],['external seed',v=>v.startupHost.seed='7',/ORDINARY_HOST/],['wrong graphics',v=>v.result.conditions.graphics.width=1024,/GRAPHICS/],['bundled land',v=>v.result.landPackage={hit:true},/UNBUNDLED/],['no ordinary clean',v=>v.result.report.counters['raisedland.cleanCalls']=0,/UNBUNDLED/],['changed exact query',v=>v.result.conditions.url+='&extra=1',/ACTUAL_QUERY/],['prepared replay',v=>v.result.addressExport.preparedReplay=true,/GENERATED_EXPORT/],['ineligible key',v=>v.result.addressExport.meta.input.eligible=false,/GENERATED_EXPORT/],['source hash mismatch',v=>v.result.addressExport.meta.input.identity.sourceHash='e'.repeat(64),/SOURCE_BASE/],['truncated base64',v=>v.result.addressExport.wire.base64=v.result.addressExport.wire.base64.slice(4),/WIRE_BUDGET/],['oversize bytes before decode',v=>v.result.addressExport.wire.bytes=16*1024*1024+1,/WIRE_BUDGET/],['wrong outer SHA',v=>v.result.addressExport.wire.sha256='f'.repeat(64),/WIRE_SHA/],['menu differs from actual wire',v=>v.result.addressClosure.menuExact=exact({wrong:true}),/MENU_WIRE_SNAPSHOT/],['late work before input',v=>v.result.addressExport.meta.preVisual.lateWorkStarted=true,/PREVISUAL_PHASE/],['populated early houses',v=>{v.result.addressExport.meta.preVisual.before.houses=1;v.result.addressExport.meta.preVisual.after.houses=1;},/PREVISUAL_UNCHANGED/],['raw prefix changed early',v=>v.result.addressExport.meta.preVisual.after.rawEntrances=2,/PREVISUAL_UNCHANGED/],['wrong previsual input hash',v=>v.result.addressExport.meta.preVisual.inputHash='e'.repeat(64),/PREVISUAL_PHASE/],['mislabel old runtime',v=>v.result.addressExport.oracleBody.kind='current-runtime-875',/ORACLE_BODY_LABEL/]
])await test('synthetic rejects '+name,async()=>{const v=fixture();change(v);await assert.rejects(checkAddressExport(v,{base}),pattern);});
await test('coherent transport hash cannot hide corrupt actual codec bytes',async()=>{const b=Buffer.from(wire);b[b.length-1]^=1;const v=fixture();Object.assign(v.result.addressExport.wire,{base64:b.toString('base64'),sha256:hash(b)});await assert.rejects(checkAddressExport(v,{base}),/CRC|CHECKSUM/);});
await test('descriptor exact is checked against actual previsual observer and query',async()=>{const v=fixture(),d=structuredClone(v.result.addressClosure.initial);delete d.at;d.season.value=.5;v.result.addressExport.inputDescriptorExact=exact({version:1,base,initial:d,progress:{values:{},presentKeys:[]},query:{raw:new URL(url).search,entries:query},counts:{}});await assert.rejects(checkAddressExport(v,{base}),/ACTUAL_PREVISUAL_DESCRIPTOR/);});
await test('two independent payloads must match the entire descriptor and bytes',async()=>{
 const a=await checkAddressExport(fixture(),{base}),b=await checkAddressExport(fixture(),{base});assert.doesNotThrow(()=>checkAddressRepeats(a,b));
 assert.throws(()=>checkAddressRepeats(a,{...b,descriptorExact:exact({different:true})}),/INPUT_DIFFERENCE/);const mutated=Buffer.from(b.bytes);mutated[mutated.length-1]^=1;assert.throws(()=>checkAddressRepeats(a,{...b,bytes:mutated}),/WIRE_DIFFERENCE/);
 assert.throws(()=>checkAddressRepeats(a,{...b,proof:{...b.proof,exactQueryTables:exact(['different'])}}),/INDEPENDENT_QUERY/);
});
await test('sidecar carries only first actual proof points, not a key; full original observer and SHA survive init',async()=>{
 const checked=await checkAddressExport(fixture(),{base}),sourceRawSha256='f'.repeat(64),artifact=earlyQueryArtifact(checked,sourceRawSha256),observer=fs.readFileSync(new URL('./probe-checks/startup-bootstrap-observe.js',import.meta.url),'utf8'),body=earlyQueryInit(artifact,observer);
 assert.equal(body.includes(observer),true);assert.equal(artifact.sourceRawSha256,sourceRawSha256);assert.deepEqual(Object.keys(artifact),['version','identity','sourceRawSha256','fixedQueriesExact']);assert.equal(body.includes('inputHash='),false);
 const context=vm.createContext({window:{},Storage:class {setItem(){}}});vm.runInContext(body,context);
 assert.equal(vm.runInContext('Object.isFrozen(window.__addressPackage17bEarlyQueryInput.fixedQueriesExact)',context),true);assert.equal(vm.runInContext('Object.getOwnPropertyDescriptor(window,"__addressPackage17bEarlyQueryInput").writable',context),false);
 assert.equal(context.window.__addressPackage17bEarlyQueryObserver.sha256,hash(Buffer.from(observer)));assert.equal(context.window.__startupBootGuard.markerWrites,0);
 const originalExact=JSON.stringify(checked.proof.fixedQueriesExact);assert.equal(JSON.stringify(context.window.__addressPackage17bEarlyQueryInput.fixedQueriesExact),originalExact);
});
await test('outer exact helper and reviewed Kalinina 96 story-address oracle stay pinned',()=>{
 const body=fs.readFileSync(new URL('./probe-checks/address-package-export.js',import.meta.url),'utf8'),at=body.lastIndexOf('function toExact(value){'),end=body.indexOf('const needExport=',at),helper=body.slice(at,end);
 const input=Object.assign(Object.create(null),{missing:undefined,zero:-0,nested:Object.assign(Object.create(null),{value:1})});
 const actual=new Function('input',helper+';return toExact(input);')(input);assert.deepEqual(actual,exact(input));
 const prefix='const proof=await(async()=>{\n',start=body.indexOf(prefix)+prefix.length,finish=body.lastIndexOf('\n})();\nfunction toExact');assert.ok(start>0&&finish>start);assert.equal(hash(Buffer.from(body.slice(start,finish))),'1903b37d448f0bfe479932d13dee5dcdd3fe589bef356acfcd10afed508a845a');
});
await test('Node exact repeat comparison accepts null-prototype identity records',async()=>{
 const a=await checkAddressExport(fixture(),{base}),b=await checkAddressExport(fixture(),{base});b.identity=Object.assign(Object.create(null),b.identity);assert.doesNotThrow(()=>checkAddressRepeats(a,b));
});
await test('proof query indices may be negative preserved safe integers',async()=>{
 const checked=await checkAddressExport(fixture(),{base});checked.proof.fixedQueriesExact=exact({addresses:[['far',-1,-0,2]],levels:[['edge',-1,3,4]]});const artifact=earlyQueryArtifact(checked,'f'.repeat(64));assert.deepEqual(artifact.fixedQueriesExact,checked.proof.fixedQueriesExact);
});
await test('unmigrated wallet cannot masquerade as B1 actual input',async()=>{
 const v=fixture();const d={version:1,base,initial:{...v.result.addressClosure.initial},progress:{values:{'dlv-money-x8':1,'dlv-msk-wallet':30000},presentKeys:['dlv-money-x8','dlv-msk-wallet']},query:{raw:new URL(url).search,entries:query},counts:{}};delete d.initial.at;v.result.addressExport.inputDescriptorExact=exact(d);await assert.rejects(checkAddressExport(v,{base}),/POST_MIGRATION_B1_PROGRESS/);
});
await test('ordinary CLI is explicit and preserves the legacy --out path',()=>{
 assert.deepEqual(parseAddressPreparationArgs(['--out=/tmp/new']),{ordinary:false,out:'/tmp/new'});assert.deepEqual(parseAddressPreparationArgs(['--ordinary','--out=/tmp/new']),{ordinary:true,out:'/tmp/new'});
 assert.deepEqual(parseAddressPreparationArgs(['--out=/tmp/new','--ordinary']),{ordinary:true,out:'/tmp/new'});
 for(const args of [[],['--ordinary'],['--out='],['--out=/tmp/a','--out=/tmp/b'],['--ordinary','--ordinary','--out=/tmp/a'],['--ordinary=1','--out=/tmp/a']])assert.throws(()=>parseAddressPreparationArgs(args),/CLI_OUT/);
});
await test('ordinary settled budget and actual CLI path preserve legacy B1 early allowances',()=>{
 assert.deepEqual(addressPreparationSchedule(true),{mode:'settled',early:false,bootWaitSec:1200,controlWaitMs:420000,probeTimeoutSec:1740,hardTimeoutMs:1800000,movementWaitMs:30000});
 assert.deepEqual(addressPreparationSchedule(false),{mode:'early',early:true,bootWaitSec:360,controlWaitMs:240000,probeTimeoutSec:900,hardTimeoutMs:950000,movementWaitMs:600});
 const source=fs.readFileSync(new URL('./address-package-prepare.mjs',import.meta.url),'utf8'),expression=source.match(/const args=(\[[^\n]+\]);/)[1];
 const build=new Function('path','repo','process','dist','session','fixtureFile','report','ordinary','schedule','FRESH_ADDRESS_EXPORT_QUERY','ADDRESS_EXPORT_QUERY','return '+expression),path={join:(...parts)=>parts.join('/')};
 for(const ordinary of [false,true]){
  const schedule=addressPreparationSchedule(ordinary),args=build(path,'repo',{platform:'darwin'},'dist','session','fixture','raw',ordinary,schedule,FRESH_ADDRESS_EXPORT_QUERY,ADDRESS_EXPORT_QUERY);
  assert.equal(args.includes('--early'),!ordinary);assert.equal(args.includes('--startup-admission=settled'),ordinary);
  assert.ok(args.includes('--bootwait='+schedule.bootWaitSec));assert.ok(args.includes('--timeout='+schedule.probeTimeoutSec));
 }
 const harness=JSON.parse(source.match(/const HARNESS=(\[[^\n]+\]);/)[1].replaceAll("'",'"'));
 assert.ok(harness.includes('tools/startup-admission.cjs'));assert.equal(Object.isFrozen(addressPreparationSchedule(true)),true);
});
await test('fresh fixture seeds only ordinary language and optional saved high setting',()=>{
 assert.deepEqual(freshAddressPreparationFixture('mid'),{'dlv-lang':'ru'});assert.deepEqual(freshAddressPreparationFixture('high'),{'dlv-lang':'ru','dlv-gfx':{deck:{p:'high',rv:2}}});
 for(const graphics of ['mid','high']){const f=freshAddressPreparationFixture(graphics);for(const key of ['dlv-sound','dlv-shifts','dlv-msk-wallet','dlv-msk-guide','dlv-msk-nostut','dlv-car-cur','dlv-money-x8','dlv-single-marker-v1'])assert.equal(Object.hasOwn(f,key),false);}
 assert.throws(()=>freshAddressPreparationFixture('low'),/FRESH_PRESET/);
});
for(const graphics of ['mid','high'])await test('fresh '+graphics+' host gate supports native absence and actual first Go',async()=>{
 const v=freshFixture(graphics),a=await checkAddressExport(v,{base,ordinary:true,graphics});assert.deepEqual(a.snapshot,snapshot);assert.equal(a.identity.inputHash,(graphics==='mid'?'d':'e').repeat(64));
});
for(const [name,change,pattern]of [
 ['missing settled host',v=>delete v.startupHost.admission,/SETTLED_HOST/],
 ['wrong movement allowance',v=>v.result.host.admission.movementWaitMs=600,/SETTLED_HOST/],
 ['unfinished title queue',v=>v.result.startConditions.queueBusy=true,/SETTLED_START/],
 ['boolean boot completion is not the real timestamp',v=>v.result.startConditions.bootFull=true,/SETTLED_START/],
 ['missing boot completion',v=>v.result.startConditions.bootFull=false,/SETTLED_START/],
 ['preexisting control',v=>v.result.startConditions.preexistingControl=true,/SETTLED_START/],
 ['missing completed queue evidence',v=>v.result.startConditions.queueFullAt=null,/SETTLED_START/],
 ['zero actual W movement despite settled allowance',v=>v.result.moved=0,/STARTUP/],
 ['mature picker in fresh',v=>v.result.district.pickerClicks=1,/ACTUAL_FRESH_START/],
 ['opened eight in initial',v=>v.result.addressClosure.initial.district.opened=8,/ACTUAL_PREVISUAL_DESCRIPTOR/],
 ['sound or world override query',v=>v.result.conditions.url+='&gfxdev=deck',/ACTUAL_QUERY/],
 ['empty normalized query missing profile version',v=>{const d=JSON.parse(JSON.stringify(v.result.addressExport.meta.input.descriptor));d.version=1;v.result.addressExport.inputDescriptorExact=exact(d);},/FRESH_NORMALIZED_QUERY/],
 ['fake guide progress',v=>{const d=structuredClone(v.result.addressExport.meta.input.descriptor);d.progress.values['dlv-msk-guide']=1;v.result.addressExport.inputDescriptorExact=exact(d);},/NO_FAKE_FRESH_MARKERS/],
 ['nonzero wallet before fresh generation',v=>{const d=structuredClone(v.result.addressExport.meta.input.descriptor);d.progress.values['dlv-msk-wallet']=1;v.result.addressExport.inputDescriptorExact=exact(d);},/ACTUAL_FRESH_PROGRESS/],
 ['no actual Steam Deck UA',v=>v.result.freshEnvironment.userAgent='ordinary PC',/ACTUAL_DECK_ENVIRONMENT/],
 ['repair not no-op',v=>v.result.addressClosure.repairNoop.partySeen=true,/FRESH_REPAIR_NOOP/]
])await test('fresh rejects '+name,async()=>{const v=freshFixture();change(v);await assert.rejects(checkAddressExport(v,{base,ordinary:true,graphics:'mid'}),pattern);});
await test('product needs four independent per-preset repeats, keeps different profile identities/bytes',async()=>{
 const rows=[];for(const graphics of ['mid','high'])for(const repeat of [1,2])rows.push({graphics,repeat,session:graphics+'-'+repeat,checked:await checkAddressExport(freshFixture(graphics),{base,ordinary:true,graphics})});
 const product=addressProductCatalog(rows);assert.equal(product.version,2);assert.deepEqual(product.slots.map(s=>s.graphics),['mid','high']);assert.notEqual(product.slots[0].identity.inputHash,product.slots[1].identity.inputHash);assert.notEqual(product.slots[0].entry.path,product.slots[1].entry.path);
 assert.throws(()=>addressProductCatalog(rows.slice(1)),/FOUR_INDEPENDENT/);assert.throws(()=>addressProductCatalog(rows.map((r,i)=>i===1?{...r,session:rows[0].session}:r)),/FOUR_INDEPENDENT/);
 assert.throws(()=>addressProductCatalog(rows.map(r=>({...r,graphics:'mid'}))),/PRESET_REPEATS/);
 assert.throws(()=>addressProductCatalog(rows.map((r,i)=>i===1?{...r,repeat:1}:r)),/PRESET_REPEATS/);
});
await test('fresh eval preserves actual functional oracle body and compiles without running game',()=>{
 const fresh=fs.readFileSync(new URL('./probe-checks/address-package-fresh-export.js',import.meta.url),'utf8'),old=fs.readFileSync(new URL('./probe-checks/address-package-export.js',import.meta.url),'utf8'),start=old.indexOf('const functionalQueries=(()=>{'),end=old.indexOf('\n})();',start)+'\n})();'.length,body=old.slice(start,end);
 assert.ok(fresh.includes(body));const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;new AsyncFunction('d','until','wait',fresh);assert.ok(fresh.includes('async function addressFreshProof17b()'));assert.ok(!fresh.includes('const EXPECTED={'));
});
console.log(JSON.stringify({ok:true,checks:count,realRecorderCodec:true,nativeSHA:true,syntheticHostEnvelopes:true,noGame:true}));
