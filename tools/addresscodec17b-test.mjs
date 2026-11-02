/* Actual small recorder snapshots and independently checksummed malformed binary tables. No world/build/probe. */
import assert from 'node:assert/strict';
import {createAddressCatalogRecorder} from '../src/game/addresscatalog.js';
import {encodeAddressCatalog,decodeAddressCatalog,ADDRESS_CATALOG_LIMITS} from '../src/game/addresscodec17b.js';
const identity={mapId:'fixture',mapHash:'a'.repeat(64),editsHash:'b'.repeat(64),sourceHash:'c'.repeat(64),inputHash:'d'.repeat(64)};
function fixture(){
 const prefix=[[-0,.12345678912345678,1,-0],[10,20,0,1]],buildings=[{id:2**45},{id:'\uFEFFдом😀'},{}, {id:-0}],targets={buildings,houses:[],generatedDoors:[],entrances:prefix,spots:[]};
 const r=createAddressCatalogRecorder(targets),house=(i,addr,name='')=>({x:i===0?-0:i+.1,z:i+2,mx:i+3,mz:i+4,addr,name,lv:i===0?-0:5});
 r.acceptHouse(buildings[0],house(0,'улица, 7','Здание😀'));r.acceptHouse(buildings[1],house(1,'улица, 7'));r.acceptHouse(buildings[2],house(2,''));r.acceptHouse(buildings[3],house(3,'-0 источник'));
 r.acceptDoor(buildings[0],[1,2,1,-0],true);r.acceptDoor(buildings[0],[3,4,0,1],false);r.acceptDoor(buildings[1],[5,6,-1,0],false);r.acceptDoor(buildings[2],[7,8,0,-1],true);r.acceptDoor(buildings[3],[9,10,0,1],false);
 r.mergeDoorsOnce();targets.spots.push({x:-0,z:.12345678912345678},{x:12,z:13});r.sealSpots();return r.snapshot();
}
const encode=(s=fixture(),id=identity,limits={})=>encodeAddressCatalog(s,id,{limits}),decode=(bytes,id=identity,limits={})=>decodeAddressCatalog(bytes,id,{limits});
let checks=0;const test=(name,fn)=>{fn();checks++;};
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function unpack(bytes){const p=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=p.getUint32(12,true);return{header:JSON.parse(new TextDecoder().decode(bytes.subarray(28,28+n))),body:bytes.slice(28+n)};}
function seal(header,body){const h=new TextEncoder().encode(JSON.stringify(header)),out=new Uint8Array(28+h.length+body.length),v=new DataView(out.buffer);out.set([66,49,55,65,68,68,82,0]);v.setUint32(8,1,true);v.setUint32(12,h.length,true);v.setUint32(16,body.length,true);v.setUint32(20,crc(h),true);v.setUint32(24,crc(body),true);out.set(h,28);out.set(body,28+h.length);return out;}
function alter(bytes,fn){const{header,body}=unpack(bytes),view=new DataView(body.buffer),block=name=>header.blocks.find(b=>b.name===name);fn(header,body,view,block);return seal(header,body);}
function frozen(v,seen=new Set()){if(v===null||typeof v!=='object'||seen.has(v))return;seen.add(v);assert.equal(Object.isFrozen(v),true);for(const child of Object.values(v))frozen(child,seen);}
const snapshot=fixture(),wire=encode(snapshot);
test('actual recorder exact roundtrip, canonical bytes and immutable original',()=>{const before=structuredClone(snapshot),out=decode(wire);assert.deepEqual(out,snapshot);assert.deepEqual(encode(out),wire);assert.deepEqual(snapshot,before);assert.equal(out.version,1);frozen(out);});
test('F64 little endian preserves signed zero, >32-bit source IDs and Unicode/BOM',()=>{const out=decode(wire);assert.equal(Object.is(out.houses[0].x,-0),true);assert.equal(Object.is(out.houses[0].lv,-0),true);assert.equal(Object.is(out.entrances[0][3],-0),true);assert.equal(Object.is(out.houseLinks[3].sourceId,-0),true);assert.equal(out.houseLinks[0].sourceId,2**45);assert.equal(out.houseLinks[1].sourceId,'\uFEFFдом😀');assert.equal(out.spots[0].z,.12345678912345678);assert.notEqual(Math.fround(out.spots[0].z),out.spots[0].z);const{header,body}=unpack(wire);assert.equal(Object.is(new DataView(body.buffer).getFloat64(header.blocks[0].offset,true),-0),true);});
test('one door tuple copy, shared generated suffix and detached independent decodes',()=>{const a=decode(wire),b=decode(wire);for(let i=0;i<a.generatedDoors.length;i++){assert.equal(a.generatedDoors[i],a.entrances[a.rawEntranceCount+i]);assert.notEqual(a.generatedDoors[i],snapshot.generatedDoors[i]);assert.notEqual(a.generatedDoors[i],b.generatedDoors[i]);}assert.notEqual(a.houses,b.houses);assert.notEqual(a.spots[0],b.spots[0]);assert.equal(unpack(wire).header.counts.doors,a.entrances.length);assert.throws(()=>a.generatedDoors[0].push(1),TypeError);});
test('mutable inputs never frozen/mutated and wire owns its data',()=>{const s=structuredClone(snapshot),bytes=encode(s);assert.equal(Object.isFrozen(s),false);assert.equal(Object.isFrozen(s.houses[0]),false);s.houses[0].addr='changed';s.generatedDoors[0][0]=999;assert.deepEqual(decode(bytes),snapshot);const out=decode(bytes);bytes.fill(0);assert.deepEqual(out,snapshot);});
test('empty catalog and empty strings roundtrip',()=>{const r=createAddressCatalogRecorder({buildings:[],houses:[],generatedDoors:[],entrances:[],spots:[]});r.mergeDoorsOnce();r.sealSpots();const empty=r.snapshot();assert.deepEqual(decode(encode(empty)),empty);});
test('raw prefix repeated aliases preserved without numeric tuple duplication',()=>{const e=[1,2,0,1],r=createAddressCatalogRecorder({buildings:[],houses:[],generatedDoors:[],entrances:[e,e],spots:[]});r.mergeDoorsOnce();r.sealSpots();const bytes=encode(r.snapshot()),out=decode(bytes);assert.equal(out.entrances[0],out.entrances[1]);assert.equal(unpack(bytes).header.counts.doors,1);assert.deepEqual(encode(out),bytes);});
test('identity order immaterial, missing/extra/invalid fields rejected',()=>{assert.deepEqual(encode(snapshot,Object.fromEntries(Object.entries(identity).reverse())),wire);for(const k of Object.keys(identity)){const id={...identity};delete id[k];assert.throws(()=>encode(snapshot,id),/IDENTITY/);}assert.throws(()=>decode(wire,{...identity,inputHash:'e'.repeat(64)}),/IDENTITY_MISMATCH/);assert.throws(()=>encode(snapshot,{...identity,buildHash:'e'.repeat(64)}),/IDENTITY/);assert.throws(()=>encode(snapshot,{...identity,mapId:'../alien'}),/IDENTITY/);});
for(const [name,mutate]of [
 ['live house field',s=>s.houses[0].mesh={}],['numeric string',s=>s.houses[0].x='0'],['nonfinite house',s=>s.houses[0].z=NaN],['nonfinite door',s=>s.generatedDoors[0][0]=Infinity],['nonfinite spot',s=>s.spots[0].x=-Infinity],['nonboolean grand',s=>s.doorLinks[0].grand=1],['source bigint',s=>s.houseLinks[0].sourceId=1n],['source boolean',s=>s.houseLinks[0].sourceId=true],['source infinite',s=>s.houseLinks[0].sourceId=Infinity],['source conflict',s=>s.doorLinks[0].sourceId='other'],['building negative zero',s=>s.houseLinks[0].building=-0],['building out of range',s=>s.houseLinks[0].building=s.buildingCount],['duplicate house building',s=>s.houseLinks[1]={...s.houseLinks[0]}],['generated alias lost',s=>s.entrances[s.rawEntranceCount]=[...s.generatedDoors[0]]],['generated alias prefix',s=>{s.generatedDoors[0]=s.entrances[0];s.entrances[s.rawEntranceCount]=s.entrances[0];}],['duplicate generated ref',s=>{s.generatedDoors[1]=s.generatedDoors[0];s.entrances[s.rawEntranceCount+1]=s.generatedDoors[0];}],['wrong link length',s=>s.doorLinks.pop()],['wrong entrance prefix count',s=>s.rawEntranceCount++],['unpaired UTF16 surrogate',s=>s.houses[0].name='\ud800'],['duplicate spot ref',s=>s.spots[1]=s.spots[0]],['unknown link field',s=>s.houseLinks[0].rawID=3]
])test('encoder rejects '+name,()=>{const s=structuredClone(snapshot);mutate(s);assert.throws(()=>encode(s));});
test('own accessors rejected without calling them',()=>{const s=structuredClone(snapshot);Object.defineProperty(s.houses[0],'x',{get(){assert.fail('getter called');},enumerable:true});assert.throws(()=>encode(s),/FIELDS/);});
for(const [name,mutate]of [['magic',b=>b[0]^=1],['version',b=>new DataView(b.buffer).setUint32(8,2,true)],['header crc',b=>b[28]^=1],['body crc',b=>b[b.length-1]^=1],['header huge',b=>new DataView(b.buffer).setUint32(12,0xffffffff,true)],['body huge',b=>new DataView(b.buffer).setUint32(16,0xffffffff,true)]])test('raw corruption '+name,()=>{const b=wire.slice();mutate(b);assert.throws(()=>decode(b));});
test('truncated/trailing bytes and nonzero byte offset views',()=>{for(const n of [0,27,wire.length-1])assert.throws(()=>decode(wire.subarray(0,n)));const padded=new Uint8Array(wire.length+20);padded.set(wire,7);assert.deepEqual(decode(padded.subarray(7,7+wire.length)),snapshot);assert.throws(()=>decode(padded.subarray(7)));});
for(const [name,change]of [['block overlap',h=>h.blocks[1].offset=0],['block gap',h=>h.blocks[1].offset++],['row width',h=>h.blocks[0].rowBytes=64],['block extra',h=>h.blocks.push(h.blocks[0])],['count negative zero',h=>h.counts.houses=-1],['count huge',h=>h.counts.houses=0xffffffff],['doors insufficient',h=>h.counts.doors=0],['foreign identity',h=>h.identity.editsHash='e'.repeat(64)],['extra header field',h=>h.scene={}],['extra count field',h=>h.counts.meshes=0]])test('resealed header rejects '+name,()=>assert.throws(()=>decode(alter(wire,h=>change(h)))));
for(const [name,mutate]of [
 ['nonfinite house',(_h,_b,v,k)=>v.setFloat64(k('houses').offset,NaN,true)],
 ['nonfinite door',(_h,_b,v,k)=>v.setFloat64(k('doors').offset,Infinity,true)],
 ['nonfinite spot',(_h,_b,v,k)=>v.setFloat64(k('spots').offset,Infinity,true)],
 ['house string index',(h,_b,v,k)=>v.setUint32(k('houses').offset+40,h.counts.strings,true)],
 ['house building index',(h,_b,v,k)=>v.setUint32(k('houses').offset+48,h.counts.buildings,true)],
 ['duplicate building',(_h,_b,v,k)=>{const b=k('houses');v.setUint32(b.offset+b.rowBytes+48,0,true);} ],
 ['source union tag',(_h,_b,v,k)=>v.setUint8(k('houses').offset+52,3)],
 ['null source hidden negative zero',(_h,_b,v,k)=>v.setFloat64(k('houses').offset+2*65+53,-0,true)],
 ['numeric source string slot',(_h,_b,v,k)=>v.setUint32(k('houses').offset+61,0,true)],
 ['inconsistent source ID',(_h,_b,v,k)=>v.setFloat64(k('generated').offset+9,4,true)],
 ['generated tuple ID',(h,_b,v,k)=>v.setUint32(k('generated').offset,h.counts.doors,true)],
 ['generated raw-prefix alias',(_h,_b,v,k)=>v.setUint32(k('generated').offset,0,true)],
 ['grand reserved flag',(_h,_b,v,k)=>v.setUint8(k('generated').offset+21,2)],
 ['raw tuple ID',(h,_b,v,k)=>v.setUint32(k('rawDoorIDs').offset,h.counts.doors,true)],
 ['raw tuple first-use order',(_h,_b,v,k)=>v.setUint32(k('rawDoorIDs').offset,1,true)],
 ['string offsets first',(_h,_b,v,k)=>v.setUint32(k('stringOffsets').offset,1,true)],
 ['string offsets final',(_h,_b,v,k)=>v.setUint32(k('stringOffsets').offset+k('stringOffsets').bytes-4,0,true)],
 ['malformed UTF8',(_h,b,_v,k)=>{b[k('stringBytes').offset]=255;}],
])test('resealed body rejects '+name,()=>assert.throws(()=>decode(alter(wire,mutate))));
test('header UTF8 fails even after its CRC is repaired',()=>{const b=wire.slice(),v=new DataView(b.buffer),n=v.getUint32(12,true);b[28]=255;v.setUint32(20,crc(b.subarray(28,28+n)),true);assert.throws(()=>decode(b),/HEADER_JSON/);});
test('lower ceilings fail both APIs; ceilings cannot be expanded or coerced',()=>{
 for(const limits of [{maxFileBytes:wire.length-1},{maxHeaderBytes:1},{maxPayloadBytes:1},{maxBuildings:0},{maxHouses:0},{maxGeneratedDoors:0},{maxRawEntrances:0},{maxDoors:0},{maxSpots:0},{maxStrings:0},{maxStringBytes:1},{maxStringTableBytes:1},{maxWorkingBytes:1}]){assert.throws(()=>decode(wire,identity,limits));assert.throws(()=>encode(snapshot,identity,limits));}
 for(const limits of [{maxFileBytes:ADDRESS_CATALOG_LIMITS.maxFileBytes+1},{unknown:1},{maxDoors:'3'},{maxDoors:-0}]){assert.throws(()=>encode(snapshot,identity,limits),/LIMITS/);assert.throws(()=>decode(wire,identity,limits),/LIMITS/);}
});
test('malicious counts are budgeted before hydration even with valid header/body CRC',()=>{const b=alter(wire,h=>h.counts.strings=250001);assert.throws(()=>decode(b),/COUNT_BUDGET/);assert.throws(()=>decode(wire,identity,{maxWorkingBytes:1}),/WORKING_BUDGET/);});
test('shared storage cannot race validation/publication',()=>{if(typeof SharedArrayBuffer!=='function')return;const b=new Uint8Array(new SharedArrayBuffer(wire.length));b.set(wire);assert.throws(()=>decode(b),/SHARED_OR_RESIZABLE_INPUT/);});
test('no RNG calls and exact public snapshot key order',()=>{const old=Math.random;try{Math.random=()=>assert.fail('codec used RNG');const out=decode(encode(snapshot));assert.deepEqual(Object.keys(out),Object.keys(snapshot));assert.deepEqual(Object.keys(out.houses[0]),Object.keys(snapshot.houses[0]));}finally{Math.random=old;}});
console.log(JSON.stringify({ok:true,checks,wireBytes:wire.length,realRecorder:true,littleEndian:true,immutableDetached:true,actualCity:false,structuralChargeIsNotRAM:true}));
