import assert from 'node:assert/strict';
import {webcrypto,createHash} from 'node:crypto';
import {createLandReader,LAND_CACHE_ASSET} from '../src/game/landcache17a/landcache-reader.js';
import {captureResult,encodeCheckpoint} from '../src/game/landcache17a/checkpoint-codec.js';
import {precleanHash} from '../src/game/landcache17a/preclean.js';
import {makeInputIdentity} from '../src/game/landcache17a/landcache-identity.js';
import {createLandCover} from '../src/game/landcover.js';
import {createLandMask} from '../src/game/landmask.js';
import {ShapeUtils,Vector2} from '../src/vendor/three.module.min.js';
globalThis.location={search:'?landworkers=0'};
const real=await import('../src/game/raisedland.js');
const tri=(outer,holes=[])=>({points:[...outer,...holes.flat()],triangles:ShapeUtils.triangulateShape(outer.map(p=>new Vector2(...p)),holes.map(h=>h.map(p=>new Vector2(...p))))});
for(const[a,b,c]of[[[0,0],[10,0],[0,10]],[[10,0],[10,10],[0,10]]])real.record(...a,...b,...c,.085,177,173,159,true);
for(const[a,b,c]of[[[4,0],[4.2,0],[4,8]],[[4.2,0],[4.2,8],[4,8]]])real.record(...a,...b,...c,.12,50,150,40,false);
real.prepare([],()=>[]);
const pre=structuredClone({cover:real.cover.snapshot(),green:real.green.snapshot()});
function target(){const copy=structuredClone(pre),cover=createLandCover(32,copy.cover),green=createLandCover(32,copy.green);return{cover,green,finalMask:createLandMask((x,z)=>green.height(x,z)>cover.height(x,z)||!cover.covered(x,z),(...args)=>[...cover.breaks(...args),...green.breaks(...args)]),ST:{built:false,supportReady:false}};}
const parameters={minWidth:.8,coverCell:32,maskCell:32,indexCell:8};
const runtime={mapId:'fixture',mode:'steam',adult:true,career:true,intro:false,streamed:true,graphics:'high',editor:false,district:0,season:2.5,seasonForced:false,quick:false,donationTrash:0,externalSeed:true};
const manifest={version:1,mode:'steam',mapId:'fixture',seed:7,mapHash:'a'.repeat(64),editsHash:'b'.repeat(64),sourceHash:'c'.repeat(64),buildHash:'d'.repeat(64),manifestHash:'e'.repeat(64),limits:{}};
const query='?landcache=1&gfx=high&gfxdev=deck&startupdistrict=0&nointro&lang=ru&mute';
const plan=t=>[...t.cover.cells()].map(core=>({core,skipped:false}));
const fingerprint=t=>precleanHash({cover:t.cover,green:t.green,cores:plan(t),parameters});
const identity=makeInputIdentity({manifest,preclean:fingerprint(real),runtime,query,parameters});
for(const step of real.cleanContours({M:{grad(){},up(){assert.fail('deferDraw');}},triangulate:tri,deferDraw:true,groundH:()=>1,terrain:{}}))assert.equal(typeof step,'string');
const wire=encodeCheckpoint(captureResult(real,{prepared:true,completed:true,deferDraw:true}),identity);
const hostFor=bytes=>({seed:'7',bootcpu:true,landCacheManifestHash:manifest.manifestHash,landCacheSha256:createHash('sha256').update(bytes).digest('hex')});
const response=bytes=>new Response(bytes,{headers:{'content-length':String(bytes.length)}});
let checks=0;const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const tick=()=>new Promise(r=>setImmediate(r));
function setup(extra={}){const source=target(),failures=[],phases=[],counts=[],calls={fetch:0,restore:0};let api;
  const prepare=source.cover.prepareRestoreSteps;source.cover.prepareRestoreSteps=(...args)=>{calls.restore++;return prepare(...args);};
  const reader=createLandReader({query,manifest,host:hostFor(wire),expose:v=>api=v,onFailure:v=>failures.push(v),work:(name,fn)=>{phases.push(name);return fn();},steps:(name,iterator)=>{phases.push(name);return iterator;},awaited:(name,_kind,fn)=>{phases.push(name);return fn();},digest:bytes=>webcrypto.subtle.digest('SHA-256',bytes),count:(...v)=>counts.push(v),fetchAsset:async url=>{assert.equal(url,LAND_CACHE_ASSET);calls.fetch++;return response(wire);},...extra});
  const input={source,cores:plan(source),parameters,runtime,query};return{reader,input,source,failures,phases,counts,calls,api};}
async function drive(iterator,reader){let input;for(;;){const result=iterator.next(input);if(result.done){reader.assertReady();return result.value;}const value=result.value;if(value?.wait){assert.ok(['cacheIO','cacheHash'].includes(value.traceKind));assert.equal(value.traceName,value.traceKind==='cacheIO'?'queue.cacheReadWait':'queue.cacheHashWait');try{input=await value.wait;}catch{input=value.sync();}}else{input=undefined;await tick();}}}
async function until(fn){for(let i=0;i<20000;i++){if(fn())return;await tick();}throw Error('fixture phase not reached');}
async function rejectCase(name,options={},mutate=()=>{},pattern){const state=setup(options),before=fingerprint(state.source);mutate(state);const flags={built:state.source.ST.built,supportReady:state.source.ST.supportReady};let downstream=0;
  await assert.rejects(drive(state.reader.readSteps(state.input),state.reader),pattern);assert.equal(state.reader.failed,true,name);assert.equal(state.reader.meta().cleanCalls,0);assert.equal(state.reader.meta().bufferHeld,false);
  assert.equal(fingerprint(state.source),before,name+' source changed');assert.equal(state.source.finalMask.ready,false);assert.deepEqual({built:state.source.ST.built,supportReady:state.source.ST.supportReady},flags);
  assert.throws(()=>{state.reader.assertReady();downstream++;});assert.equal(downstream,0);assert.equal(state.failures.length,1);assert.equal(state.failures[0].cleaned,true);assert.equal(state.failures[0].bufferHeld,false);assert.deepEqual(state.failures[0],state.reader.meta());checks++;return state;}

const success=setup(),first=success.reader.readSteps(success.input);assert.equal(first,success.reader.readSteps(success.input));const result=await drive(first,success.reader);
assert.equal(result.cleanCalls,0);assert.equal(success.calls.fetch,1);assert.equal(success.calls.restore,1);assert.equal(success.reader.ready,true);assert.equal(success.reader.meta().bufferHeld,false);
assert.equal(success.reader.readSteps(success.input),first);assert.equal(success.reader.sync(),result);assert.equal(success.reader.assertReady(),result);
assert.deepEqual(encodeCheckpoint(captureResult(success.source,{prepared:true,completed:true,deferDraw:true}),identity),wire);
assert.equal(success.source.finalMask.contains(5,5),real.finalMask.contains(5,5));assert.equal(success.source.ST.supportReady,false);assert.equal(success.source.ST.built,false);
assert.ok(['raisedland.cache.precleanHash','raisedland.cache.read','raisedland.cache.fileHash','raisedland.cache.decode','raisedland.cache.prepareRestore','raisedland.cache.commit'].every(name=>success.phases.includes(name)));checks++;
const wrongHash=await rejectCase('wrong trusted file SHA',{host:{...hostFor(wire),landCacheSha256:'0'.repeat(64)}},()=>{},/FILE_HASH_MISMATCH/);assert.equal(wrongHash.phases.includes('raisedland.cache.decode'),false);assert.equal(wrongHash.calls.restore,0);assert.equal(wrongHash.reader.meta().fileSha256,hostFor(wire).landCacheSha256);
await rejectCase('missing trusted file SHA',{host:{...hostFor(wire),landCacheSha256:undefined}},()=>{},/FILE_HASH_REQUIRED/);
await rejectCase('missing asset',{fetchAsset:async()=>new Response(null,{status:404})},()=>{},/READ_HTTP_404/);
await rejectCase('read error',{fetchAsset:async()=>{throw Error('disk unavailable');}},()=>{},/disk unavailable/);
await rejectCase('truncated',{host:hostFor(wire.subarray(0,wire.length-1)),fetchAsset:async()=>response(wire.subarray(0,wire.length-1))},()=>{},/PAYLOAD_LENGTH/);
const corrupt=wire.slice();corrupt[corrupt.length-1]^=1;
await rejectCase('CRC',{host:hostFor(corrupt),fetchAsset:async()=>response(corrupt)},()=>{},/BLOCK_CRC/);
const version=wire.slice();version[8]=9;
await rejectCase('version',{host:hostFor(version),fetchAsset:async()=>response(version)},()=>{},/VERSION/);
await rejectCase('preclean mismatch',{},state=>state.input.cores[0].skipped=true,/IDENTITY_MISMATCH/);
await rejectCase('season mismatch',{},state=>state.input.runtime={...runtime,season:1},/IDENTITY_MISMATCH/);
await rejectCase('query mismatch',{},state=>state.input.query=query+'&slowboot=1',/IDENTITY_MISMATCH/);
await rejectCase('manifest mismatch',{manifest:{...manifest,sourceHash:'f'.repeat(64)}},()=>{},/IDENTITY_MISMATCH/);
await rejectCase('host manifest binding',{host:{seed:'7',bootcpu:true,landCacheManifestHash:'f'.repeat(64)}},()=>{},/HOST_MANIFEST_BINDING/);
await rejectCase('wrong seed',{host:{seed:'8',bootcpu:true}},()=>{},/UNVERIFIED_RNG/);
await rejectCase('editor mode',{},state=>state.input.runtime={...runtime,editor:true},/UNSUPPORTED_MODE/);
await rejectCase('unprepared target',{},state=>state.source.ST.supportReady=true,/RESTORE_PHASE/).catch(error=>{throw error;});
await rejectCase('late prepare failure',{},state=>{state.source.finalMask.prepareRestoreSteps=()=>{throw Error('allocation failed');};},/allocation failed/);
await rejectCase('oversize declared',{fetchAsset:async()=>({ok:true,headers:{get:()=>String(200*1024*1024)},body:{getReader(){assert.fail('must reject before body');}}})},()=>{},/CONTENT_LENGTH/);
await rejectCase('short body',{fetchAsset:async()=>new Response(wire,{headers:{'content-length':String(wire.length+10)}})},()=>{},/SHORT_FILE/);
await rejectCase('bad chunk',{fetchAsset:async()=>({ok:true,headers:{get:()=>null},body:{getReader:()=>({read:async()=>({done:false,value:[]}),releaseLock(){}})}})},()=>{},/READ_CHUNK/);
await rejectCase('empty body',{fetchAsset:async()=>response(new Uint8Array())},()=>{},/CONTENT_LENGTH/);

for(const kind of ['cancel-fetch','sync-fetch','cancel-chunk','timeout']){
  const wait=deferred();let n=0;
  const state=setup({timeoutMs:kind==='timeout'?2:30000,fetchAsset:kind==='cancel-chunk'?async()=>({ok:true,headers:{get:()=>null},body:{getReader:()=>({read:async()=>++n===1?{done:false,value:wire.subarray(0,8)}:wait.promise,releaseLock(){}})}}):()=>wait.promise});
  const before=fingerprint(state.source),pending=drive(state.reader.readSteps(state.input),state.reader);await until(()=>state.reader.meta().phase==='reading'||state.reader.failed);await tick();
  if(kind==='sync-fetch')assert.throws(()=>state.reader.sync(),/ASYNC_READ_NOT_READY/);else if(kind!=='timeout')state.reader.cancel('FIXTURE_CANCELLED');
  await assert.rejects(pending,/CANCELLED|ASYNC_READ_NOT_READY|READ_TIMEOUT/);assert.equal(state.reader.meta().bufferHeld,false);
  wait.resolve(kind==='cancel-chunk'?{done:false,value:wire.subarray(8)}:response(wire));await tick();await tick();
  assert.equal(fingerprint(state.source),before);assert.equal(state.calls.restore,0);assert.equal(state.reader.meta().cleanCalls,0);assert.equal(state.failures.length,1);assert.equal(state.failures[0].cleaned,true);assert.equal(state.failures[0].bufferHeld,false);assert.deepEqual(state.failures[0],state.reader.meta());assert.throws(()=>state.reader.assertReady());checks++;
}
for(const invalid of ['?landcache=0','?landcache=1&landcache=1','?landcache=1&landexport17a=1'])await rejectCase('explicit flag',{query:invalid},()=>{},/EXPLICIT_FLAG_REQUIRED/);
assert.equal(result.fileSha256,createHash('sha256').update(wire).digest('hex'));
const cryptoDescriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');
try{Object.defineProperty(globalThis,'crypto',{value:undefined,configurable:true});await rejectCase('native crypto absent',{digest:undefined},()=>{},/NATIVE_CRYPTO_REQUIRED/);}
finally{if(cryptoDescriptor)Object.defineProperty(globalThis,'crypto',cryptoDescriptor);else delete globalThis.crypto;}
await rejectCase('stream body limit',{manifest:{...manifest,limits:{maxPayloadBytes:1024,maxHeaderBytes:64}},fetchAsset:async()=>({ok:true,headers:{get:()=>null},body:{getReader:()=>({read:async()=>({done:false,value:new Uint8Array(1109)}),releaseLock(){}})}})},()=>{},/READ_LIMIT/);
for(const phase of ['preclean','inputCopy','decoding','preparing']){
 const state=setup({maxBytes:8,maxItems:1}),before=fingerprint(state.source),pending=drive(state.reader.readSteps(state.input),state.reader);
 await until(()=>state.reader.meta().phase===phase);state.reader.cancel('SLICE_CANCELLED');await assert.rejects(pending,/SLICE_CANCELLED/);
 assert.equal(fingerprint(state.source),before);assert.equal(state.source.finalMask.ready,false);assert.equal(state.reader.meta().bufferHeld,false);assert.equal(state.failures.length,1);assert.equal(state.failures[0].cleaned,true);assert.equal(state.failures[0].bufferHeld,false);assert.deepEqual(state.failures[0],state.reader.meta());checks++;
}
let prepared=false;
const beforeCommit=setup({steps:(name,it)=>name==='raisedland.cache.prepareRestore'?(function*(){const commit=yield* it;prepared=true;yield 'fixture before commit';return commit;})():it});
const beforeCommitHash=fingerprint(beforeCommit.source),commitRun=drive(beforeCommit.reader.readSteps(beforeCommit.input),beforeCommit.reader);
await until(()=>prepared);beforeCommit.reader.cancel('BEFORE_COMMIT');await assert.rejects(commitRun,/BEFORE_COMMIT/);assert.equal(fingerprint(beforeCommit.source),beforeCommitHash);assert.equal(beforeCommit.source.finalMask.ready,false);assert.equal(beforeCommit.failures[0].cleaned,true);assert.equal(beforeCommit.failures[0].bufferHeld,false);assert.deepEqual(beforeCommit.failures[0],beforeCommit.reader.meta());checks++;
const digestWait=deferred(),hashState=setup({digest:()=>digestWait.promise}),hashBefore=fingerprint(hashState.source),hashRun=drive(hashState.reader.readSteps(hashState.input),hashState.reader);
await until(()=>hashState.reader.meta().phase==='fileHash');hashState.reader.cancel('HASH_CANCELLED');await assert.rejects(hashRun,/HASH_CANCELLED/);digestWait.resolve(await webcrypto.subtle.digest('SHA-256',wire));await tick();assert.equal(fingerprint(hashState.source),hashBefore);assert.equal(hashState.reader.meta().bufferHeld,false);assert.equal(hashState.failures.length,1);assert.equal(hashState.failures[0].cleaned,true);assert.equal(hashState.failures[0].bufferHeld,false);assert.deepEqual(hashState.failures[0],hashState.reader.meta());checks++;
console.log(JSON.stringify({ok:true,checks,actualOneCell:true,wireBytes:wire.length,singleFlight:true,cleanCalls:0,latePromisesIgnored:true,failedPublication:0,realGameRun:false}));
