/* Actual tiny recorder + immutable codec + native SHA. No game, scene, build or real asset file. */
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {createAddressCatalogRecorder} from '../src/game/addresscatalog.js';
import {encodeAddressCatalog} from '../src/game/addresscodec17b.js';
import {checkAddressPackageCatalog,createAddressPackagePreloader} from '../src/game/addresspackage17b.js';
const identity={mapId:'fixture',mapHash:'a'.repeat(64),editsHash:'b'.repeat(64),sourceHash:'c'.repeat(64),inputHash:'d'.repeat(64)};
const targets={buildings:[{id:'дом😀'},{id:-0}],houses:[],generatedDoors:[],entrances:[[-0,0,1,0]],spots:[]};
const record=createAddressCatalogRecorder(targets);
record.acceptHouse(targets.buildings[0],{x:-0,z:1,mx:2,mz:3,addr:'Первая, 1',name:'Имя',lv:5});
record.acceptHouse(targets.buildings[1],{x:10,z:11,mx:12,mz:13,addr:'Вторая, 2',name:'',lv:9});
record.acceptDoor(targets.buildings[1],[4,5,-0,1],true);record.mergeDoorsOnce();targets.spots.push({x:-0,z:7});record.sealSpots();
const source=record.snapshot(),wire=encodeAddressCatalog(source,identity),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const catalog=()=>({version:1,kind:'address-package17b',identity:{...identity},entry:{path:'address-data/'+sha(wire)+'.addr',bytes:wire.length,sha256:sha(wire)}});
const response=(bytes=wire,headers=true)=>new Response(bytes,headers?{headers:{'content-length':String(bytes.length)}}:undefined);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const options=(extra={})=>({enabled:true,catalog:catalog(),baseURL:'app://g/index.html',...extra});
let checks=0;
async function test(name,fn){await fn();checks++;}
function cleanMiss(p){const m=p.meta();assert.equal(m.phase,'generated');assert.equal(m.held,false);assert.equal(p.take(identity),null);return m;}
const native=Object.getOwnPropertyDescriptor(globalThis,'crypto');Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
try{
 await test('disabled preloader never validates/fetches or accepts a candidate',async()=>{
  let calls=0;const p=createAddressPackagePreloader({fetchAsset:()=>{calls++;assert.fail('disabled fetch');}}),m=await p.preload({enabled:false,catalog:{bad:true}});
  assert.deepEqual(m,{phase:'off',reason:null,wireHash:null,wireBytes:0,held:false,consumed:false});assert.equal(calls,0);assert.equal(p.take(identity),null);assert.equal(p.meta().held,false);
 });
 await test('valid native SHA/codec hit is single-flight, consumed once, immutable and detached',async()=>{
  let calls=0;const p=createAddressPackagePreloader({fetchAsset:async(url,opts)=>{calls++;assert.equal(url,'app://g/'+catalog().entry.path);assert.equal(opts.cache,'default');assert.ok(opts.signal instanceof AbortSignal);return response();}});
  const [a,b]=await Promise.all([p.preload(options()),p.preload(options())]);assert.deepEqual(a,b);assert.equal(calls,1);assert.equal(p.meta().phase,'prepared');assert.equal(p.meta().held,true);assert.equal(p.meta().wireHash,sha(wire));assert.equal(p.meta().wireBytes,wire.length);
  const hit=p.take(identity);assert.deepEqual(hit.snapshot,source);assert.notEqual(hit.snapshot,source);assert.equal(Object.is(hit.snapshot.houses[0].x,-0),true);assert.equal(hit.snapshot.generatedDoors[0],hit.snapshot.entrances[hit.snapshot.rawEntranceCount]);
  assert.equal(Object.isFrozen(hit),true);assert.equal(Object.isFrozen(hit.catalog.identity),true);assert.equal(Object.isFrozen(hit.snapshot.spots[0]),true);assert.throws(()=>hit.snapshot.generatedDoors[0].push(0),TypeError);
  assert.equal(p.take(identity),null);assert.equal(p.meta().held,false);assert.equal(p.meta().phase,'consumed');await p.preload(options());assert.equal(calls,1);
 });
 for(const key of Object.keys(identity))await test('take rejects different '+key+' identity once',async()=>{
  const p=createAddressPackagePreloader({fetchAsset:async()=>response()});await p.preload(options());const wrong={...identity,[key]:key==='mapId'?'elsewhere':'e'.repeat(64)};
  assert.equal(p.take(wrong),null);assert.equal(p.meta().phase,'generated');assert.equal(p.meta().reason,'input-mismatch');assert.equal(p.meta().held,false);assert.equal(p.take(identity),null);
 });
 await test('catalog identity differing from payload is refused by actual decoder after SHA',async()=>{
  const c=catalog();c.identity.inputHash='e'.repeat(64);const p=createAddressPackagePreloader({fetchAsset:async()=>response()});await p.preload(options({catalog:c}));assert.match(cleanMiss(p).reason,/IDENTITY_MISMATCH/);
 });
 await test('wire corruption fails native hash and publishes no partial snapshot',async()=>{
  const bad=wire.slice();bad[bad.length-1]^=1;const p=createAddressPackagePreloader({fetchAsset:async()=>response(bad)});await p.preload(options());assert.match(cleanMiss(p).reason,/FILE_SHA/);assert.equal(p.meta().wireHash,sha(bad));assert.deepEqual(encodeAddressCatalog(source,identity),wire);
 });
 await test('coherently rehashed codec corruption is still rejected',async()=>{
  const bad=wire.slice();bad[bad.length-1]^=1;const c=catalog();c.entry.sha256=sha(bad);c.entry.path='address-data/'+sha(bad)+'.addr';const p=createAddressPackagePreloader({fetchAsset:async()=>response(bad)});await p.preload(options({catalog:c}));assert.match(cleanMiss(p).reason,/CRC|CHECKSUM/);
 });
 await test('HTTP404 refuses without partial state',async()=>{
  const p=createAddressPackagePreloader({fetchAsset:async()=>new Response(null,{status:404})});await p.preload(options());assert.match(cleanMiss(p).reason,/HTTP_404/);assert.equal(p.meta().wireHash,null);
 });
 await test('Content-Length mismatch is rejected before stream reader access',async()=>{
  let readers=0;const p=createAddressPackagePreloader({fetchAsset:async()=>({ok:true,headers:{get:()=>String(wire.length+1)},body:{getReader(){readers++;assert.fail('length-invalid reader');}}})});await p.preload(options());assert.match(cleanMiss(p).reason,/CONTENT_LENGTH/);assert.equal(readers,0);
 });
 await test('oversized stream refuses without allocating advertised giant body',async()=>{
  const bad=new Uint8Array(wire.length+1);bad.set(wire);const p=createAddressPackagePreloader({fetchAsset:async()=>response(bad,false)});await p.preload(options());assert.match(cleanMiss(p).reason,/SIZE/);
 });
 await test('truncated stream refuses rather than treating EOF as success',async()=>{
  const p=createAddressPackagePreloader({fetchAsset:async()=>response(wire.subarray(0,-1),false)});await p.preload(options());assert.match(cleanMiss(p).reason,/SHORT_FILE/);
 });
 await test('body reader rejection is a clean miss',async()=>{
  let cancelled=0;const p=createAddressPackagePreloader({fetchAsset:async()=>({ok:true,headers:{get:()=>null},body:{getReader:()=>({read:async()=>{throw Error('original disk read');},cancel(){cancelled++;},releaseLock(){}})}})});
  await p.preload(options());assert.match(cleanMiss(p).reason,/original disk read/);assert.equal(cancelled,1);
 });
 await test('same-origin root URL only; traversal/foreign protocol never fetch',async()=>{
  for(const baseURL of ['file:///tmp/index.html','app://g/sub/index.html','ftp://g/index.html']){let calls=0;const p=createAddressPackagePreloader({fetchAsset:()=>{calls++;assert.fail('unsupported location fetch');}});await p.preload(options({baseURL}));assert.match(cleanMiss(p).reason,/LOCAL_URL/);assert.equal(calls,0);}
 });
 await test('catalog is an owned snapshot before asynchronous fetch; caller mutations cannot rebind it',async()=>{
  const c=catalog(),pending=deferred(),started=deferred();const p=createAddressPackagePreloader({fetchAsset:async()=>{started.resolve();return pending.promise;}}),run=p.preload(options({catalog:c}));await started.promise;
  c.identity.inputHash='f'.repeat(64);c.entry.sha256='0'.repeat(64);c.entry.path='https://example.invalid/foreign';pending.resolve(response());await run;
  const hit=p.take(identity);assert.ok(hit);assert.equal(hit.catalog.identity.inputHash,identity.inputHash);assert.equal(hit.catalog.entry.sha256,sha(wire));assert.equal(Object.isFrozen(c),false);assert.equal(Object.isFrozen(hit.catalog.entry),true);
 });
 await test('take during in-flight fetch drops eventual candidate without becoming a late hit',async()=>{
  const pending=deferred(),started=deferred();const p=createAddressPackagePreloader({fetchAsset:async()=>{started.resolve();return pending.promise;}}),run=p.preload(options());await started.promise;assert.equal(p.take(identity),null);pending.resolve(response());await run;
  assert.equal(p.meta().phase,'generated');assert.match(p.meta().reason,/CONSUMED_EARLY/);assert.equal(p.meta().held,false);assert.equal(p.meta().consumed,true);assert.equal(p.take(identity),null);
 });
 await test('timeout is bounded when fetch ignores abort; late fetch cannot mutate terminal metadata',async()=>{
  const pending=deferred(),started=deferred();let signal;const p=createAddressPackagePreloader({timeoutMs:2,fetchAsset:async(_url,o)=>{signal=o.signal;started.resolve();return pending.promise;}}),run=p.preload(options());await started.promise;await run;
  assert.equal(signal.aborted,true);const terminal={...p.meta()};assert.match(terminal.reason,/TIMEOUT/);assert.equal(terminal.phase,'generated');assert.equal(terminal.held,false);
  pending.resolve(response());await tick();assert.deepEqual(p.meta(),terminal);assert.equal(p.take(identity),null);
 });
 await test('timeout with a late fetch rejection is handled without terminal mutation',async()=>{
  const pending=deferred();const p=createAddressPackagePreloader({timeoutMs:2,fetchAsset:()=>pending.promise});await p.preload(options());const terminal={...p.meta()};assert.match(terminal.reason,/TIMEOUT/);pending.reject(Error('late fetch error'));await tick();assert.deepEqual(p.meta(),terminal);
 });
 await test('timeout does not await a never-settling stream cancel or read',async()=>{
  const pending=deferred(),started=deferred();let cancels=0,releases=0;const p=createAddressPackagePreloader({timeoutMs:2,fetchAsset:async()=>({ok:true,headers:{get:()=>null},body:{getReader:()=>({read(){started.resolve();return pending.promise;},cancel(){cancels++;return new Promise(()=>{});},releaseLock(){releases++;}})}})}),run=p.preload(options());await started.promise;await run;
  const terminal={...p.meta()};assert.match(terminal.reason,/TIMEOUT/);assert.equal(cancels,1);assert.equal(releases,1);pending.resolve({done:false,value:wire});await tick();assert.deepEqual(p.meta(),terminal);assert.equal(p.take(identity),null);
 });
 await test('late native hash resolution cannot publish, set wireHash, or hold a candidate after timeout',async()=>{
  const pending=deferred(),started=deferred();let observed;
  const p=createAddressPackagePreloader({timeoutMs:2,fetchAsset:async()=>response(),digestBytes:bytes=>{observed=bytes;started.resolve();return pending.promise;}}),run=p.preload(options());await started.promise;await run;
  const terminal={...p.meta()};assert.match(terminal.reason,/TIMEOUT/);assert.equal(terminal.wireHash,null);assert.equal(terminal.held,false);
  // Resolve with actual native SHA of the exact bytes; it would have been a genuine hit without cancellation.
  const nativeHash=Buffer.from(await webcrypto.subtle.digest('SHA-256',observed)).toString('hex');pending.resolve(nativeHash);await tick();assert.deepEqual(p.meta(),terminal);assert.equal(p.take(identity),null);
 });
 await test('late hash rejection is handled and does not replace timeout reason',async()=>{
  const pending=deferred(),started=deferred();const p=createAddressPackagePreloader({timeoutMs:2,fetchAsset:async()=>response(),digestBytes:()=>{started.resolve();return pending.promise;}}),run=p.preload(options());await started.promise;await run;const terminal={...p.meta()};pending.reject(Error('late crypto error'));await tick();assert.deepEqual(p.meta(),terminal);
 });
 await test('early take during hash cannot make the valid late digest a hit',async()=>{
  const pending=deferred(),started=deferred();let bytes;const p=createAddressPackagePreloader({fetchAsset:async()=>response(),digestBytes:input=>{bytes=input;started.resolve();return pending.promise;}}),run=p.preload(options());await started.promise;assert.equal(p.take(identity),null);pending.resolve(Buffer.from(await webcrypto.subtle.digest('SHA-256',bytes)).toString('hex'));await run;
  assert.match(p.meta().reason,/CONSUMED_EARLY/);assert.equal(p.meta().held,false);assert.equal(p.meta().consumed,true);
 });
 await test('invalid catalog/options refuse before fetch',async()=>{
  for(const mutate of [c=>c.extra=true,c=>c.entry.bytes=16*1024*1024+1,c=>c.entry.bytes=0,c=>c.entry.path='../outside.addr',c=>c.identity.inputHash='bad']){const c=catalog();mutate(c);let calls=0;const p=createAddressPackagePreloader({fetchAsset:()=>{calls++;assert.fail('invalid catalog fetch');}});await p.preload(options({catalog:c}));cleanMiss(p);assert.equal(calls,0);}
  for(const timeoutMs of [0,-1,1.5,30001,Infinity]){let calls=0;const p=createAddressPackagePreloader({timeoutMs,fetchAsset:()=>calls++});await p.preload(options());assert.match(cleanMiss(p).reason,/TIMEOUT/);assert.equal(calls,0);}
 });
 await test('catalog validator returns frozen detached identity and entry',async()=>{const c=catalog(),checked=checkAddressPackageCatalog(c);assert.deepEqual(checked,c);assert.notEqual(checked.identity,c.identity);assert.notEqual(checked.entry,c.entry);assert.equal(Object.isFrozen(checked),true);c.identity.mapId='other';assert.equal(checked.identity.mapId,'fixture');});
 console.log(JSON.stringify({ok:true,checks,wireBytes:wire.length,actualRecorder:true,actualCodec:true,nativeCrypto:true,pendingTimeoutMs:2,noGame:true}));
}finally{if(native)Object.defineProperty(globalThis,'crypto',native);else delete globalThis.crypto;}
