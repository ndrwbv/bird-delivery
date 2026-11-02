/* Synthetic host envelopes are explicitly labelled; payload is a real tiny recorder/codec, never game proof. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createAddressCatalogRecorder} from '../src/game/addresscatalog.js';
import {encodeAddressCatalog} from '../src/game/addresscodec17b.js';
import {RNG_PROVIDER,BASE_SEED} from '../src/game/landdata/land-package-key.js';
import {ADDRESS_EXPORT_QUERY,addressPreparationFixture,checkAddressExport,checkAddressRepeats,earlyQueryArtifact,earlyQueryInit} from './address-package-prepare.mjs';
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
await test('outer export helper accepts null-prototype exact descriptor without altering historical oracle body',()=>{
 const body=fs.readFileSync(new URL('./probe-checks/address-package-export.js',import.meta.url),'utf8'),at=body.lastIndexOf('function toExact(value){'),end=body.indexOf('const needExport=',at),helper=body.slice(at,end);
 const input=Object.assign(Object.create(null),{missing:undefined,zero:-0,nested:Object.assign(Object.create(null),{value:1})});
 const actual=new Function('input',helper+';return toExact(input);')(input);assert.deepEqual(actual,exact(input));
 const prefix='const proof=await(async()=>{\n',start=body.indexOf(prefix)+prefix.length,finish=body.lastIndexOf('\n})();\nfunction toExact');assert.ok(start>0&&finish>start);assert.equal(hash(Buffer.from(body.slice(start,finish))),'a246e97e024ba99add1a9911775ed6c8f0543aa9b563372497351ecd3f64fdb0');
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
console.log(JSON.stringify({ok:true,checks:count,realRecorderCodec:true,nativeSHA:true,syntheticHostEnvelopes:true,noGame:true}));
