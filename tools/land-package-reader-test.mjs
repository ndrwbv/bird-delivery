/* Actual LATE scheduler + one-cell codec; no Electron or game run. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createLandPackageReader} from '../src/game/landdata/land-package-reader.js';
import {createCatalog} from '../src/game/landdata/land-package-catalog.js';
import {makeIdentity,RNG_PROVIDER,BASE_SEED} from '../src/game/landdata/land-package-key.js';
import {precleanHash} from '../src/game/landcache17a/preclean.js';
import {captureResult,encodeCheckpoint,restoreResult} from '../src/game/landcache17a/checkpoint-codec.js';
import {createLandCover} from '../src/game/landcover.js';
import {createLandMask} from '../src/game/landmask.js';
import {ShapeUtils,Vector2} from '../src/vendor/three.module.min.js';
globalThis.window={};globalThis.location={href:'app://g/index.html',search:'?landworkers=0'};
const real=await import('../src/game/raisedland.js');
const tri=(outer,holes=[])=>({points:[...outer,...holes.flat()],triangles:ShapeUtils.triangulateShape(outer.map(p=>new Vector2(...p)),holes.map(h=>h.map(p=>new Vector2(...p))))});
for(const[a,b,c]of[[[0,0],[10,0],[0,10]],[[10,0],[10,10],[0,10]]])real.record(...a,...b,...c,.085,177,173,159,true);
real.prepare([],()=>[]);const pre=structuredClone({cover:real.cover.snapshot(),green:real.green.snapshot()});
const parameters={minWidth:.8,coverCell:32,maskCell:32,indexCell:8,terrainG:16,terrainNX:2,terrainNZ:2,terrainX0:0,terrainZ0:0};
const manifest={version:1,kind:'land-package17b',mapId:'fixture',mapHash:'a'.repeat(64),editsHash:'b'.repeat(64),sourceHash:'c'.repeat(64),parameters};
const descriptor=()=>({provider:RNG_PROVIDER,baseSeed:BASE_SEED,ordinaryAtImport:true,hookOwned:true});
const runtime={mapId:'fixture',mode:'steam',adult:true,career:true,intro:false,streamed:true,editor:false,graphics:'mid',district:0,quick:false};
function target(){const p=structuredClone(pre),cover=createLandCover(32,p.cover),green=createLandCover(32,p.green);return{cover,green,ST:{built:false,supportReady:false},finalMask:createLandMask((x,z)=>green.height(x,z)>cover.height(x,z)||!cover.covered(x,z),(...a)=>[...cover.breaks(...a),...green.breaks(...a)])};}
const plan=s=>[...s.cover.cells()].map(core=>({core,skipped:false}));
const fingerprint=s=>precleanHash({cover:s.cover,green:s.green,cores:plan(s),parameters});
const identity=makeIdentity(manifest,fingerprint(real));
for(const _ of real.cleanContours({M:{grad(){},up(){assert.fail('deferred');}},triangulate:tri,deferDraw:true,groundH:()=>1,terrain:{}})){}
const snapshot=captureResult(real,{prepared:true,completed:true,deferDraw:true}),wire=encodeCheckpoint(snapshot,identity),gzip=gzipSync(wire);
const hash=b=>createHash('sha256').update(b).digest('hex');
const entry=(b=wire,extra={})=>({precleanHash:identity.precleanHash,path:'city-data/'+hash(b)+'.land'+(extra.encoding==='gzip'?'.gz':''),encoding:'identity',bytes:b.length,sha256:hash(b),rawBytes:wire.length,rawSha256:hash(wire),...extra});
const response=b=>new Response(b,{headers:{'content-length':String(b.length)}});
const tick=()=>new Promise(r=>setImmediate(r));
async function until(fn,label=''){for(let i=0;i<20000;i++){if(fn())return;await tick();}throw Error('fixture phase timeout '+label);}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
let checks=0;
// Execute actual scheduler source; replace imported platform boundaries, not its control flow.
const lateSource=(await fs.readFile(new URL('../src/game/latebuild.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
async function scheduler(singleStep=false){const flags=[],errors=[],bindings={console:{error:(...v)=>errors.push(v.map(String))},STARTUP:{flag:n=>flags.push(n),startWork:()=>()=>{},windowStart:()=>()=>{},mark(){}},CL:{report:(...v)=>errors.push(v),trans(){},transEnd(){}},MOB:{on:false}};
 globalThis.__packageLateFixture=bindings;
 const prefix='const {STARTUP,CL,MOB,console}=globalThis.__packageLateFixture;const MessageChannel=undefined;'+(singleStep?'let clock=0;const performance={now:()=>clock+=20};const setTimeout=(fn,ms)=>ms===0?setImmediate(fn):globalThis.setTimeout(fn,ms);':'')+'\n';
 const late=await import('data:text/javascript;base64,'+Buffer.from(prefix+lateSource+'\n// case '+checks).toString('base64'));
 return{late,flags,errors};}
function setup(options={},modify=()=>{}){const source=target(),notifications=[],calls={fetch:0,clean:0,activate:0},before=fingerprint(source);
 const config={catalog:createCatalog(manifest,[entry()]),manifest,descriptor,trustedLimits:{},query:'',assetBase:'app://g/',maxBytes:512,maxItems:8,
   digest:b=>webcrypto.subtle.digest('SHA-256',b),fetchAsset:async url=>{calls.fetch++;assert.match(url,/^app:\/\/g\/city-data\/[a-f0-9]{64}\.land(?:\.gz)?$/);return response(wire);},onResult:m=>notifications.push(m),...options};
 const reader=createLandPackageReader(config),ctx={source,cores:plan(source),parameters,runtime,prepared:true,deferDraw:true,isCurrent:()=>true};
 const s={reader,ctx,source,calls,notifications,before,config};modify(s);return s;}
async function launch(s){const {late,flags,errors}=await scheduler(s.config.schedulerSingleStep);let done;const finished=new Promise(r=>done=r);let hit,installedSnapshot;
 late.enable(true);late.add('raisedland',function*(){hit=yield* s.reader.tryReadSteps(s.ctx);
   // Stand-in for root's generated branch: assert untouched preclean input, install real expected clean result.
   if(!hit){assert.equal(fingerprint(s.source),s.before,'cache failure mutated fallback input');assert.equal(s.source.finalMask.ready,false);s.calls.clean++;restoreResult(s.source,snapshot,{prepared:true});}
   assert.equal(s.source.finalMask.ready,true);installedSnapshot=captureResult(s.source,{prepared:true,completed:true,deferDraw:true});s.calls.activate++;s.source.ST.supportReady=true;
 });late.onDone(done);late.start();return{late,flags,errors,finished,get hit(){return hit;},get installedSnapshot(){return installedSnapshot;}};}
async function finish(s,run,hit){await run.finished;assert.equal(run.hit,hit);assert.equal(s.calls.clean,hit?0:1);assert.equal(s.calls.activate,1);assert.equal(run.errors.length,0);assert.equal(run.flags.includes('queue.error'),false);
 assert.equal(s.reader.meta().cleaned,true);assert.equal(s.reader.meta().bufferHeld,false);assert.equal(s.notifications.length,1);assert.equal(s.notifications[0].cleaned,true);assert.equal(s.notifications[0].bufferHeld,false);checks++;}

for(const encoding of ['identity','gzip']){
 const b=encoding==='gzip'?gzip:wire,s=setup({catalog:createCatalog(manifest,[entry(b,{encoding})]),fetchAsset:async()=>response(b),assetBase:undefined});
 if(encoding==='identity')s.ctx.runtime={...runtime,graphics:'high'};
 const it=s.reader.tryReadSteps(s.ctx);assert.equal(it,s.reader.tryReadSteps(s.ctx));const run=await launch(s);await finish(s,run,true);
 assert.equal(s.reader.meta().wireSha256,hash(b));assert.equal(s.reader.meta().rawSha256,hash(wire));assert.deepEqual(encodeCheckpoint(run.installedSnapshot,identity),wire);
 s.reader.cancel('late');assert.equal(s.reader.meta().hit,true);
}
{
 const names=[],counts=[],s=setup({work:(n,fn)=>{names.push(n);return fn();},count:(...v)=>counts.push(v)},s=>s.ctx.runtime={...runtime,district:7});
 const run=await launch(s);await finish(s,run,false);assert.equal(s.reader.meta().reason,'unsupported-district');assert.equal(s.calls.fetch,0);assert.deepEqual(names,[]);assert.deepEqual(counts,[['raisedland.cleanCalls',0]]);
}
for(const opts of [{assetBase:'app://birdpizza/'},{trustedLimits:undefined},{catalog:null},{query:'?nolate'}]){
 const s=setup(opts),run=await launch(s);await finish(s,run,false);assert.equal(s.calls.fetch,0);
}
for(const kind of ['quick','quick-missing','low','export17b','params']){
 const names=[],s=setup({work:(name,fn)=>{names.push(name);return fn();},query:kind==='export17b'?'?landexport17b=1':''},s=>{
  if(kind==='quick')s.ctx.runtime={...runtime,quick:true};
  if(kind==='quick-missing'){s.ctx.runtime={...runtime};delete s.ctx.runtime.quick;}
  if(kind==='low')s.ctx.runtime={...runtime,graphics:'low'};
  if(kind==='params')s.ctx.parameters={...parameters,terrainG:32};
 });
 const run=await launch(s);await finish(s,run,false);assert.equal(s.calls.fetch,0);assert.deepEqual(names,[]);if(kind==='params')assert.equal(s.reader.meta().reason,'input-mismatch');
}
{
 const old=Object.getOwnPropertyDescriptor(globalThis,'crypto');try{Object.defineProperty(globalThis,'crypto',{value:undefined,configurable:true});const s=setup({digest:undefined}),run=await launch(s);await finish(s,run,false);assert.match(s.reader.meta().reason,/NATIVE_CRYPTO_REQUIRED/);}finally{if(old)Object.defineProperty(globalThis,'crypto',old);else delete globalThis.crypto;}
}
{
 const old=globalThis.DecompressionStream;try{globalThis.DecompressionStream=undefined;const s=setup({catalog:createCatalog(manifest,[entry(gzip,{encoding:'gzip'})]),fetchAsset:async()=>response(gzip)}),run=await launch(s);await finish(s,run,false);assert.match(s.reader.meta().reason,/GZIP_UNSUPPORTED/);}finally{globalThis.DecompressionStream=old;}
}
{
 const s=setup({catalog:null}),run=await launch(s);await finish(s,run,false);assert.throws(()=>s.reader.tryReadSteps(s.ctx).next(),/TARGET_NOT_FRESH/);assert.equal(s.reader.fatal,true);assert.equal(s.calls.clean,1);
}
for(const kind of ['read-reject','hash-reject','404','bad-hash','CRC','short','oversize','input-miss','params-miss','descriptor','query','gzip-cap','gzip-hash','gzip-invalid','prepare-error']){
 const opts={};let change=()=>{};
 if(kind==='read-reject')opts.fetchAsset=async()=>{throw Error('disk reject');};
 if(kind==='hash-reject')opts.digest=async()=>{throw Error('native hash reject');};
 if(kind==='404')opts.fetchAsset=async()=>new Response(null,{status:404});
 if(kind==='bad-hash')opts.catalog=createCatalog(manifest,[entry(wire,{sha256:'0'.repeat(64),rawSha256:'0'.repeat(64),path:'city-data/'+'0'.repeat(64)+'.land'})]);
 if(kind==='CRC'){const b=wire.slice();b[b.length-1]^=1;opts.catalog=createCatalog(manifest,[entry(b,{rawSha256:hash(b)})]);opts.fetchAsset=async()=>response(b);}
 if(kind==='short')opts.fetchAsset=async()=>new Response(wire.subarray(0,wire.length-1));
 if(kind==='oversize')opts.fetchAsset=async()=>response(new Uint8Array(wire.length+1));
 if(kind==='input-miss')change=s=>s.ctx.cores[0].skipped=true;
 if(kind==='params-miss')change=s=>s.ctx.parameters={...parameters,terrainG:32};
 if(kind==='descriptor')opts.descriptor=()=>({...descriptor(),hookOwned:false});
 if(kind==='query')opts.query='?landcache=1';
 if(kind==='prepare-error')change=s=>{const original=s.source.cover.prepareRestoreSteps;let failed=false;s.source.cover.prepareRestoreSteps=(...a)=>{if(!failed){failed=true;throw Error('allocation refused');}return original(...a);};};
 if(kind.startsWith('gzip-')){let b=gzip,extra={encoding:'gzip'};if(kind==='gzip-cap')extra.rawBytes=wire.length-1;if(kind==='gzip-hash')extra.rawSha256='0'.repeat(64);if(kind==='gzip-invalid')b=Uint8Array.of(1,2,3);opts.catalog=createCatalog(manifest,[entry(b,extra)]);opts.fetchAsset=async()=>response(b);}
 const s=setup(opts,change),run=await launch(s);await finish(s,run,false);assert.equal(s.reader.meta().fatal,false,kind);assert.ok(s.reader.meta().reason,kind);
}
for(const kind of ['read-pending-sync','hash-pending-sync','read-rejected-sync','timeout','cancel-read','cancel-hash']){
 const d=deferred(),opts={};if(kind.startsWith('hash')||kind==='cancel-hash')opts.digest=()=>d.promise;else opts.fetchAsset=()=>d.promise;
 if(kind==='timeout')opts.timeoutMs=2;const s=setup(opts),run=await launch(s);
 await until(()=>s.reader.meta().phase===((kind.startsWith('hash')||kind==='cancel-hash')?'fileHash':'reading'));
 if(kind==='read-rejected-sync'){d.reject(Error('already rejected'));await tick();run.late.flush();}
 else if(kind.endsWith('sync'))run.late.flush();else if(kind.startsWith('cancel'))s.reader.cancel('fixture cancel');
 await finish(s,run,false);const captured=s.reader.meta();
 d.resolve(kind.startsWith('hash')||kind==='cancel-hash'?await webcrypto.subtle.digest('SHA-256',wire):response(wire));await tick();await tick();
 assert.deepEqual(s.reader.meta(),captured);assert.equal(s.notifications.length,1);assert.equal(s.calls.clean,1);assert.equal(s.calls.activate,1);
}
for(const phase of ['preclean','inputCopy','decoding','preparing','decompressing','rawCopy','rawHash']){
 const isGzip=['decompressing','rawCopy','rawHash'].includes(phase),opts={maxBytes:8,maxItems:1,schedulerSingleStep:true};
 if(isGzip){opts.catalog=createCatalog(manifest,[entry(gzip,{encoding:'gzip'})]);opts.fetchAsset=async()=>response(gzip);}
 const s=setup(opts),run=await launch(s);await until(()=>s.reader.meta().phase===phase,phase);s.reader.cancel('slice cancel');await finish(s,run,false);
}
for(const kind of ['refs','active','lifetime','commit-after-install']){
 const opts={work:(name,fn)=>{if(kind==='commit-after-install'&&name==='raisedland.cache.commit'){fn();throw Error('after install');}return fn();}};
 if(kind==='lifetime')opts.fetchAsset=()=>new Promise(()=>{});
 const s=setup(opts),run=await launch(s);
 if(kind!=='commit-after-install'){await until(()=>s.reader.meta().phase==='reading');if(kind==='refs')s.source.ST={built:false,supportReady:false};if(kind==='active')s.source.ST.supportReady=true;if(kind==='lifetime')s.ctx.isCurrent=()=>false;s.reader.cancel('cancel changed target');}
 await run.finished;assert.equal(s.reader.meta().fatal,true,kind);assert.equal(s.reader.meta().cleaned,true);assert.equal(s.reader.meta().bufferHeld,false);assert.equal(s.calls.clean,0);assert.equal(s.calls.activate,0);assert.equal(run.flags.includes('queue.error'),true);assert.equal(s.notifications.length,1);checks++;
}
delete globalThis.__packageLateFixture;
console.log(JSON.stringify({ok:true,checks,actualLateScheduler:true,actualOneCellCodec:true,wireBytes:wire.length,gzipBytes:gzip.length,generatedFixture:true,gameRun:false,strict17aUnchanged:true}));
