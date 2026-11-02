/* Tiny real-recorder/codec/provider contracts. No scene, game, files, GPU or timers. */
import assert from 'node:assert/strict';
import {createPreparedAddressProvider} from '../src/game/addressprovider17b.js';
import {createAddressCatalogRecorder} from '../src/game/addresscatalog.js';
import {encodeAddressCatalog,decodeAddressCatalog} from '../src/game/addresscodec17b.js';
const H=[
 {x:-1,z:0,mx:-2,mz:1,addr:'Первый, 1',name:'А',lv:3},
 {x:1,z:0,mx:2,mz:1,addr:'Второй, 2',name:'Б',lv:9},
],D=[10,0,0,1],S=[{x:3,z:0},{x:-0,z:4}];
const ID={mapId:'tiny',mapHash:'a'.repeat(64),editsHash:'b'.repeat(64),sourceHash:'c'.repeat(64),inputHash:'d'.repeat(64)};
function buildings(){return[{id:'first'},{id:-0},{}];}
function arrays(raw=[[0,0,1,0]]){return{houses:[],generatedDoors:[],entrances:raw,spots:[],buildings:buildings()};}
function record(raw){const t=arrays(raw),r=createAddressCatalogRecorder(t);r.acceptHouse(t.buildings[0],{...H[0]});r.acceptDoor(t.buildings[1],D.slice(),true);r.acceptHouse(t.buildings[1],{...H[1]});r.mergeDoorsOnce();for(const row of S)t.spots.push({...row});r.sealSpots();return r.snapshot();}
const encoded=encodeAddressCatalog(record(),ID),catalog=decodeAddressCatalog(encoded,ID);
function setup(options={}){
 const t=arrays(),source=options.catalog||catalog;let current=true;
 const config={catalog:source,targets:t,isCurrent:()=>current,fallbackAddress:'Нет адреса',doorRadius:1,...options};
 const p=createPreparedAddressProvider(config);return{p,t,source,config,setCurrent:v=>current=v};
}
function house(s,i){const row=s.p.acceptHouse(s.t.buildings[i],{...H[i]});s.t.houses.push(row);return row;}
function door(s){const row=s.p.acceptDoor(s.t.buildings[1],D.slice(),true);s.t.generatedDoors.push(row);return row;}
function beforeMerge(s){house(s,0);door(s);house(s,1);}
function merge(s){return s.p.mergeDoorsOnce(()=>{for(const row of s.t.generatedDoors)s.t.entrances.push(row);return 1;});}
function spots(s){for(const row of S){const canonical=s.p.acceptSpot({...row});s.t.spots.push(canonical);}}
function fatal(fn,pattern){assert.throws(fn,error=>error.addressPackageFatal===true&&(!pattern||pattern.test(error.message)));}
function plain(fn,pattern){assert.throws(fn,error=>!error.addressPackageFatal&&(!pattern||pattern.test(error.message)));}
// Frozen legacy reference, separately evaluated over supplied arrays rather than private provider data.
function oldAddress(houses,x,z,fallback='Нет адреса'){let best=null,bd=Infinity;for(const h of houses){const d=(h.x-x)**2+(h.z-z)**2;if(d<bd){bd=d;best=h;}}return best?best.addr:fallback;}
function oldLevel(houses,entrances,x,z,r=1){let best=null,bd=r*r;for(const e of entrances){const d=(e[0]-x)**2+(e[1]-z)**2;if(d<bd){bd=d;best=e;}}if(!best)return 0;best=null;bd=3600;for(const h of houses){const d=(h.x-x)**2+(h.z-z)**2;if(d<bd){bd=d;best=h;}}return best?best.lv||0:0;}
let checks=0;const test=(name,fn)=>{fn();checks++;};
test('detached hydration and private publication never prepopulate/freeze legacy arrays',()=>{
 const s=setup(),refs={...s.t},prefix=s.t.entrances[0],snapshot=encodeAddressCatalog(s.source,ID);assert.equal(s.p.meta().privateReady,false);
 s.p.publishPrivate();assert.equal(s.p.meta().privateReady,true);
 for(const key of Object.keys(refs))assert.equal(s.t[key],refs[key]);assert.deepEqual(s.t.houses,[]);assert.deepEqual(s.t.generatedDoors,[]);assert.deepEqual(s.t.spots,[]);assert.equal(s.t.entrances.length,1);assert.equal(s.t.entrances[0],prefix);assert.equal(Object.isFrozen(prefix),false);
 assert.equal(oldAddress(s.t.houses,0,0),'Нет адреса');assert.equal(s.p.queryAddress(0,0),'Первый, 1');assert.equal(oldLevel(s.t.houses,s.t.entrances,0,0),0);assert.equal(s.p.queryEntranceLevel(0,0),3);
 assert.deepEqual(encodeAddressCatalog(s.source,ID),snapshot);
});
test('actual recorder and provider coexist with one caller push, old barriers and exact codec snapshot',()=>{
 const s=setup(),q=createAddressCatalogRecorder(s.t),refs={...s.t},raw=s.t.entrances[0];s.p.publishPrivate();
 const h0=s.p.acceptHouse(s.t.buildings[0],{...H[0]});assert.equal(s.t.houses.length,0);q.acceptHouse(s.t.buildings[0],h0);
 assert.notEqual(h0,s.source.houses[0]);assert.equal(Object.isFrozen(h0),false);
 assert.equal(oldAddress(s.t.houses,1,0),'Первый, 1');assert.equal(s.p.queryAddress(1,0),'Второй, 2');
 const d=s.p.acceptDoor(s.t.buildings[1],D.slice(),true);assert.equal(s.t.generatedDoors.length,0);q.acceptDoor(s.t.buildings[1],d,true);
 q.acceptHouse(s.t.buildings[1],s.p.acceptHouse(s.t.buildings[1],{...H[1]}));assert.equal(s.t.entrances.length,1);
 let calls=0;assert.equal(s.p.mergeDoorsOnce(()=>{calls++;return q.mergeDoorsOnce();}),1);assert.equal(calls,1);assert.equal(s.t.entrances.length,2);assert.equal(s.t.entrances[0],raw);assert.equal(s.t.entrances[1],d);assert.equal(d,s.t.generatedDoors[0]);
 for(const candidate of S){const before=s.t.spots.length,row=s.p.acceptSpot({...candidate});assert.equal(s.t.spots.length,before);s.t.spots.push(row);}
 q.sealSpots();assert.equal(s.p.sealSpots(),2);assert.equal(s.p.meta().auditRetained,false);assert.equal(s.p.meta().phase,'sealed');
 for(const key of Object.keys(refs))assert.equal(s.t[key],refs[key]);assert.deepEqual(encodeAddressCatalog(q.snapshot(),ID),encoded);assert.equal(Object.is(s.t.spots[1].x,-0),true);
});
test('private literal queries preserve first ties, strict door/60m limits and argument semantics',()=>{
 const s=setup();s.p.publishPrivate();
 for(const [x,z]of [[0,0],[-0,0],[0,1],[0,1-1e-9],[0,1+1e-9],[61,0],[61-1e-9,0],[61+1e-9,0],[10000,10000],[NaN,0],[Infinity,0]]){
  assert.equal(s.p.queryAddress(x,z),oldAddress(catalog.houses,x,z));for(const r of [0,1,1+1e-9,-1,Infinity,NaN])assert.equal(s.p.queryEntranceLevel(x,z,r),oldLevel(catalog.houses,catalog.entrances,x,z,r));
 }
 assert.equal(s.p.queryAddress(0,0),'Первый, 1');assert.equal(s.p.queryEntranceLevel(0,1,1),0);assert.equal(s.p.queryEntranceLevel(61,0,Infinity),0);assert.equal(s.p.queryEntranceLevel(61-1e-9,0,Infinity),9);
});
test('explicit address formatting and empty fallback stay private',()=>{
 const s=setup({formatAddress:raw=>'['+raw+']'});s.p.publishPrivate();assert.equal(s.p.queryAddress(0,0),'[Первый, 1]');assert.equal(s.p.queryAddress(NaN,0),'[Нет адреса]');
});
test('publish checks lifetime immediately and leaves old arrays untouched',()=>{const s=setup();s.setCurrent(false);plain(()=>s.p.publishPrivate(),/LIFETIME_CHANGED/);assert.equal(s.p.meta().published,false);assert.equal(s.t.houses.length,0);assert.equal(s.t.entrances.length,1);});
test('cancel before publish is nonfatal/idempotent and never rolls live data',()=>{const s=setup();assert.equal(s.p.cancel(),true);assert.equal(s.p.cancel(),false);plain(()=>s.p.publishPrivate(),/PUBLISH_PHASE/);assert.equal(s.p.meta().privateReady,false);assert.equal(s.t.entrances.length,1);assert.equal(s.t.houses.length,0);});
test('lifetime loss after publication is fatal',()=>{const s=setup();s.p.publishPrivate();s.setCurrent(false);fatal(()=>s.p.queryAddress(0,0),/LIFETIME_CHANGED/);assert.equal(s.p.meta().fatal,true);assert.equal(s.t.houses.length,0);});
test('post-publication cancel does not become a generated fallback',()=>{const s=setup();s.p.publishPrivate();fatal(()=>s.p.cancel('STOP'),/STOP/);assert.equal(s.p.meta().published,true);assert.equal(s.p.meta().fatal,true);});
test('replacement array before publish rejects without touching original arrays',()=>{const s=setup(),old=s.t.houses;s.t.houses=[];plain(()=>s.p.publishPrivate(),/TARGET_REFERENCES_CHANGED/);assert.equal(old.length,0);assert.equal(s.t.houses.length,0);});
test('replacement raw prefix before publication refuses',()=>{const s=setup();s.t.entrances[0]=s.t.entrances[0].slice();plain(()=>s.p.publishPrivate(),/PREFIX_CHANGED/);assert.equal(s.t.generatedDoors.length,0);});
test('raw prefix scalar mutation between prepare/publish refuses, including minus zero',()=>{const s=setup();s.t.entrances[0][0]=-0;plain(()=>s.p.publishPrivate(),/PREFIX_CHANGED/);});
test('whole building reference and raw source ID identity are checked before publication',()=>{for(const change of [s=>s.t.buildings[1]={id:-0},s=>s.t.buildings[1].id=0]){const s=setup();change(s);plain(()=>s.p.publishPrivate(),/BUILDING_CHANGED/);assert.equal(s.t.houses.length,0);}});
test('bad target freshness/appendability rejects before private publication',()=>{for(const change of [t=>t.houses.push({...H[0]}),t=>Object.freeze(t.generatedDoors),t=>t.spots=t.houses]){const t=arrays();change(t);plain(()=>createPreparedAddressProvider({catalog,targets:t,doorRadius:1}));assert.equal(t.entrances.length,1);}});
test('constructor does not execute source ID accessor',()=>{const t=arrays();let calls=0;Object.defineProperty(t.buildings[0],'id',{get(){calls++;return'first';}});plain(()=>createPreparedAddressProvider({catalog,targets:t,doorRadius:1}),/SOURCE_ID/);assert.equal(calls,0);});
test('mutable/unlinked catalog is not admitted as codec-owned snapshot',()=>{const c=structuredClone(catalog);plain(()=>setup({catalog:c}),/CATALOG/);});
test('unexpected house scalar rejects before caller push',()=>{const s=setup();s.p.publishPrivate();fatal(()=>s.p.acceptHouse(s.t.buildings[0],{...H[0],lv:4}),/HOUSE_MISMATCH/);assert.equal(s.t.houses.length,0);assert.equal(s.p.meta().fatal,true);});
test('house emission source ordering is exact',()=>{const s=setup();s.p.publishPrivate();fatal(()=>s.p.acceptHouse(s.t.buildings[1],{...H[0]}),/SOURCE_BUILDING_ORDER/);assert.equal(s.t.houses.length,0);});
test('missing caller house push is caught by the following emission',()=>{const s=setup();s.p.publishPrivate();s.p.acceptHouse(s.t.buildings[0],{...H[0]});fatal(()=>s.p.acceptDoor(s.t.buildings[1],D.slice(),true),/LIVE_COUNTS/);assert.equal(s.t.houses.length,0);});
test('missing caller door push is caught before another house',()=>{const s=setup();s.p.publishPrivate();house(s,0);s.p.acceptDoor(s.t.buildings[1],D.slice(),true);fatal(()=>s.p.acceptHouse(s.t.buildings[1],{...H[1]}),/LIVE_COUNTS/);});
test('door grand flag/coordinates must match exactly',()=>{for(const [d,g]of [[D.slice(),false],[[10,0,-0,1],true]]){const s=setup();s.p.publishPrivate();house(s,0);fatal(()=>s.p.acceptDoor(s.t.buildings[1],d,g),/DOOR_MISMATCH/);assert.equal(s.t.generatedDoors.length,0);}});
test('candidate accessors and extra fields cannot silently disappear during hydration',()=>{for(const kind of ['getter','extra']){const s=setup();s.p.publishPrivate();let calls=0;const candidate={...H[0]};if(kind==='getter')Object.defineProperty(candidate,'x',{get(){calls++;return-1;}});else candidate.newField=1;fatal(()=>s.p.acceptHouse(s.t.buildings[0],candidate));assert.equal(calls,0);assert.equal(s.t.houses.length,0);}});
test('caller must insert the canonical house, not its identical candidate clone',()=>{const s=setup();s.p.publishPrivate();const c={...H[0]};s.p.acceptHouse(s.t.buildings[0],c);s.t.houses.push(c);door(s);house(s,1);fatal(()=>merge(s),/HOUSE_CHANGED/);assert.equal(s.t.entrances.length,1);});
test('incomplete replay cannot merge or create extra entrances',()=>{const s=setup();s.p.publishPrivate();house(s,0);let calls=0;fatal(()=>s.p.mergeDoorsOnce(()=>calls++),/INCOMPLETE_EMISSIONS/);assert.equal(calls,0);assert.equal(s.t.entrances.length,1);});
test('missing/noop/duplicate legacy merge cannot pass provider audit',()=>{for(const callback of [null,()=>{},s=>{for(const row of s.t.generatedDoors)s.t.entrances.push(row.slice());},s=>{for(const row of s.t.generatedDoors)s.t.entrances.push(row,row);}]){const s=setup();s.p.publishPrivate();beforeMerge(s);fatal(()=>s.p.mergeDoorsOnce(callback?()=>callback(s):undefined));}});
test('void old merge callback is accepted exactly once; a repeat never invokes it',()=>{const s=setup();s.p.publishPrivate();beforeMerge(s);let n=0;const cb=()=>{n++;s.t.entrances.push(s.t.generatedDoors[0]);};assert.equal(s.p.mergeDoorsOnce(cb),1);assert.equal(n,1);fatal(()=>s.p.mergeDoorsOnce(cb),/COLLECT_PHASE/);assert.equal(n,1);assert.equal(s.t.entrances.length,2);});
test('legacy merge throw remains fatal after its actual partial write',()=>{const s=setup();s.p.publishPrivate();beforeMerge(s);fatal(()=>s.p.mergeDoorsOnce(()=>{s.t.entrances.push(s.t.generatedDoors[0]);throw Error('legacy merge failed');}),/legacy merge failed/);assert.equal(s.t.entrances.length,2);assert.equal(s.p.meta().fatal,true);});
test('mutated canonical values/owner refs during replay refuse at old merge barrier',()=>{for(const change of [s=>s.t.houses[0].lv=4,s=>s.t.buildings[2]={},s=>s.t.entrances[0][1]=1]){const s=setup();s.p.publishPrivate();beforeMerge(s);change(s);fatal(()=>merge(s));assert.equal(s.t.entrances.length,1);}});
test('spot acceptance is pure return before original push and respects order/minus zero',()=>{const s=setup();s.p.publishPrivate();beforeMerge(s);merge(s);const a=s.p.acceptSpot({...S[0]});assert.equal(s.t.spots.length,0);assert.equal(Object.isFrozen(a),false);s.t.spots.push(a);const b=s.p.acceptSpot({...S[1]});assert.equal(Object.is(b.x,-0),true);s.t.spots.push(b);assert.equal(s.p.sealSpots(),2);assert.notEqual(a,catalog.spots[0]);});
test('spot wrong order/negative-zero mismatch is fatal without insertion',()=>{const s=setup();s.p.publishPrivate();beforeMerge(s);merge(s);const row=s.p.acceptSpot({...S[0]});s.t.spots.push(row);fatal(()=>s.p.acceptSpot({x:0,z:4}),/SPOT_MISMATCH/);assert.equal(s.t.spots.length,1);});
test('missing/duplicated caller spot push refuses before next acceptance or seal',()=>{for(const pushKind of ['none','duplicate','clone']){const s=setup();s.p.publishPrivate();beforeMerge(s);merge(s);const row=s.p.acceptSpot({...S[0]});if(pushKind==='duplicate')s.t.spots.push(row,row);if(pushKind==='clone')s.t.spots.push({...row});if(pushKind==='clone'){s.t.spots.push(s.p.acceptSpot({...S[1]}));fatal(()=>s.p.sealSpots(),/SPOT_CHANGED/);}else fatal(()=>s.p.acceptSpot({...S[1]}),/LIVE_COUNTS/);}});
test('seal requires complete spots and preserves immutable scalar oracle after hydration',()=>{const s=setup();s.p.publishPrivate();beforeMerge(s);merge(s);fatal(()=>s.p.sealSpots(),/INCOMPLETE_SPOTS/);assert.equal(catalog.houses[0].lv,3);});
test('sealed live rows remain mutable, queries remain owned immutable data',()=>{const s=setup();s.p.publishPrivate();beforeMerge(s);merge(s);spots(s);s.p.sealSpots();s.t.houses[0].addr='live only';s.t.generatedDoors[0][0]=11;assert.equal(catalog.houses[0].addr,'Первый, 1');assert.equal(catalog.generatedDoors[0][0],10);assert.equal(s.p.queryAddress(0,0),'Первый, 1');assert.equal(s.p.meta().auditRetained,false);});
test('repeated raw-prefix aliases remain original aliases through recorder/codec/replay',()=>{const raw=[0,0,1,0],c=decodeAddressCatalog(encodeAddressCatalog(record([raw,raw]),ID),ID),t=arrays([raw,raw]),p=createPreparedAddressProvider({catalog:c,targets:t,doorRadius:1}),s={p,t};p.publishPrivate();beforeMerge(s);p.mergeDoorsOnce(()=>{t.entrances.push(t.generatedDoors[0]);return 2;});spots(s);p.sealSpots();assert.equal(t.entrances[0],raw);assert.equal(t.entrances[0],t.entrances[1]);assert.equal(t.entrances[2],t.generatedDoors[0]);});
console.log(JSON.stringify({ok:true,checks,realRecorderAndCodec:true,noScene:true,noRNGOrPhaseChange:true}));
