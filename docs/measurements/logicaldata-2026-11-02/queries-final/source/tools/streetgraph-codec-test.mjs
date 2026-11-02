/* Tiny real constructor snapshots plus independently resealed corruption; no city/build/probe. */
import assert from 'node:assert/strict';
import {createStreetGraph,applyStaticBoundary,edgeKey} from '../src/game/streetgraph.js';
import {encodeStreetGraph,decodeStreetGraph,STREET_GRAPH_LIMITS} from '../src/game/streetgraph-codec.js';
const identity={mapId:'fixture',mapHash:'a'.repeat(64),editsHash:'b'.repeat(64),sourceHash:'c'.repeat(64),inputHash:'d'.repeat(64)};
const W=[20,16,13.5,11,9,7,5,5.5],roadWidth=r=>r.w||W[r.c],drivable=r=>!r.x&&r.c!==6;
const road=(p,fields={})=>({c:4,p,...fields});
const roads=[road([[-0,-0],[.2,0],[3,0],[3,10]],{o:1,w:7,w0:6,l:2}),road([[3,10],[3,0],[.2,0]],{w:15}),road([[3,10],[13,10],[13,20]],{c:7}),road([[.12345678912345678,40],[10,40]]),road([[70,70]]),road([[90,90],[100,100]],{c:6})];
const make=(input=roads,open=false)=>applyStaticBoundary(createStreetGraph({roads:input,roadWidth,drivable}),{open,inBorder:x=>x>=0&&x<12});
const encode=(graph=make(),input=roads,id=identity)=>encodeStreetGraph({graph,roads:input,identity:id});
const decode=(bytes,input=roads,id=identity,limits={})=>decodeStreetGraph(bytes,{roads:input,identity:id,limits});
let checks=0;const test=(name,fn)=>{fn();checks++;};
function exact(a,b){
 assert.deepEqual(a.nodes,b.nodes);assert.deepEqual([...a.nodeIndex],[...b.nodeIndex]);assert.deepEqual([...a.edges.keys()],[...b.edges.keys()]);
 for(const [key,e]of a.edges){const other=b.edges.get(key);assert.deepEqual(e,other);assert.deepEqual(Reflect.ownKeys(e),Reflect.ownKeys(other));assert.equal(e.road,other.road);}
 for(let i=0;i<a.nodes.length;i++)assert.deepEqual(Reflect.ownKeys(a.nodes[i]),Reflect.ownKeys(b.nodes[i]));
}
// Bit-by-bit CRC implementation, independent of the codec's lookup table.
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function unpack(bytes){const p=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=p.getUint32(12,true);return{header:JSON.parse(new TextDecoder().decode(bytes.subarray(28,28+n))),body:bytes.slice(28+n)};}
function seal(header,body){const h=new TextEncoder().encode(JSON.stringify(header)),out=new Uint8Array(28+h.length+body.length),p=new DataView(out.buffer);out.set([66,49,55,82,79,65,68,0]);p.setUint32(8,1,true);p.setUint32(12,h.length,true);p.setUint32(16,body.length,true);p.setUint32(20,crc(h),true);p.setUint32(24,crc(body),true);out.set(h,28);out.set(body,28+h.length);return out;}
function alter(bytes,fn){const{header,body}=unpack(bytes),view=new DataView(body.buffer),block=name=>header.blocks.find(b=>b.name===name);fn(header,body,view,block);return seal(header,body);}
const graph=make(),wire=encode(graph),opened=make(roads,true),openWire=encode(opened);
test('fresh constructor roundtrip is exact and repeated wire is byte-identical',()=>{const restored=decode(wire);exact(graph,restored);assert.deepEqual(encode(restored),wire);assert.deepEqual(restored.nodes.map(n=>n.nb),graph.nodes.map(n=>n.nb));assert.equal(restored.nodes[0].nb.length,0);assert.equal(restored.edges.get(edgeKey(1,2)).road,roads[0]);});
test('LE Float64 preserves -0 and values which Float32 would change',()=>{const restored=decode(wire);assert.ok(Object.is(restored.nodes[0].x,-0));assert.ok(Object.is(restored.nodes[0].z,-0));const n=restored.nodeIndex.get('.12345678912345678,40')??restored.nodeIndex.get('0.12345678912345678,40');assert.equal(restored.nodes[n].x,.12345678912345678);assert.notEqual(Math.fround(restored.nodes[n].x),restored.nodes[n].x);const{header,body}=unpack(wire),xy=header.blocks.find(b=>b.name==='nodeXY');assert.ok(Object.is(new DataView(body.buffer).getFloat64(xy.offset,true),-0));});
test('static boundary preserves false/true presence and closed absence/1',()=>{const restored=decode(openWire);exact(opened,restored);assert.equal(restored.nodes[0].out,false);assert.equal(Object.hasOwn(restored.nodes[0],'out'),true);assert.equal(Object.hasOwn(decode(wire).nodes[0],'out'),false);assert.ok([...restored.edges.values()].some(e=>e.closed===1));assert.ok([...restored.edges.values()].some(e=>!Object.hasOwn(e,'closed')));});
test('decoded ownership is detached while road instances are borrowed from supplied roads',()=>{const bytes=wire.slice(),a=decode(bytes),b=decode(bytes);assert.notEqual(a.nodes,b.nodes);assert.notEqual(a.nodes[0],b.nodes[0]);assert.notEqual(a.nodes[0].nb,b.nodes[0].nb);assert.notEqual(a.edges.values().next().value,b.edges.values().next().value);bytes.fill(0);exact(a,graph);const copiedRoads=structuredClone(roads),withCopies=decode(wire,copiedRoads);assert.equal(withCopies.edges.values().next().value.road,copiedRoads[0]);assert.notEqual(withCopies.edges.values().next().value.road,roads[0]);});
test('wire output is owned; input mutation after encoding cannot rewrite it',()=>{const fresh=make(),bytes=encode(fresh);fresh.nodes[0].x=1234;assert.ok(Object.is(decode(bytes).nodes[0].x,-0));});
test('empty and isolated graphs have valid zero-edge CSR',()=>{for(const rs of [[],[road([[3,4]])]]){const g=make(rs),bytes=encode(g,rs);exact(g,decode(bytes,rs));}});
test('identity object order is immaterial but all exact fields are mandatory',()=>{const shuffled=Object.fromEntries(Object.entries(identity).reverse());assert.deepEqual(encode(graph,roads,shuffled),wire);for(const k of Object.keys(identity)){const bad={...identity};delete bad[k];assert.throws(()=>encode(graph,roads,bad),/IDENTITY/);}assert.throws(()=>encode(graph,roads,{...identity,buildHash:'f'.repeat(64)}),/IDENTITY/);assert.throws(()=>decode(wire,roads,{...identity,inputHash:'e'.repeat(64)}),/IDENTITY_MISMATCH/);});
for(const [name,change]of [['node lock',g=>g.nodes[0].lock=false],['node festival',g=>g.nodes[0].fx=new Set()],['signal',g=>g.edges.values().next().value.sig={}],['cut',g=>g.edges.values().next().value.tA=.1],['negative zero cut',g=>g.edges.values().next().value.tB=-0],['stop',g=>g.edges.values().next().value.stopAt=1],['edge lock',g=>g.edges.values().next().value.lock=0],['two',g=>g.edges.values().next().value.two=0],['trap',g=>g.edges.values().next().value.trap=0],['service cache',g=>g.edges.values().next().value.svcCut=0]])test('encode refuses live '+name,()=>{const g=make();change(g);assert.throws(()=>encode(g),/OVERLAY/);});
test('encoder rejects duplicate coordinate/node index/edge key and alien road refs',()=>{
 const coordinate=make();coordinate.nodes[1].x=coordinate.nodes[0].x;coordinate.nodes[1].z=coordinate.nodes[0].z;coordinate.nodeIndex=new Map(coordinate.nodes.map((n,i)=>[n.x+','+n.z,i]));assert.throws(()=>encode(coordinate),/NODE_INDEX|DUPLICATE_COORDINATE/);
 const index=make();index.nodeIndex.set('other',0);assert.throws(()=>encode(index),/NODE_INDEX/);
 const key=make(),[oldKey,e]=key.edges.entries().next().value;key.edges.delete(oldKey);key.edges.set(42,e);assert.throws(()=>encode(key),/EDGE_REFERENCE/);
 const ref=make();ref.edges.values().next().value.road={...roads[0]};assert.throws(()=>encode(ref),/EDGE_REFERENCE/);
});
test('encoder refuses implicit numeric coercion/nonfinite and false static-closed values',()=>{for(const mutate of [g=>g.nodes[0].x='0',g=>g.nodes[0].x=Infinity,g=>g.edges.values().next().value.len='3',g=>g.edges.values().next().value.ux=NaN,g=>g.edges.values().next().value.closed=0]){const g=make();mutate(g);assert.throws(()=>encode(g));}});
test('unsigned IDs cannot silently coerce a mutated -0 to +0',()=>{const rs=[road([[0,0],[10,0]])],a=make(rs),b=make(rs);a.nodes[1].nb[0]=-0;assert.throws(()=>encode(a,rs),/NEIGHBOR_RANGE/);b.nodeIndex.set('0,0',-0);assert.throws(()=>encode(b,rs),/NODE_INDEX/);});
for(const [name,change]of [['magic',b=>b[0]^=1],['version',b=>new DataView(b.buffer).setUint32(8,9,true)],['headerCRC',b=>b[30]^=1],['bodyCRC',b=>b[b.length-1]^=1],['header ceiling',b=>new DataView(b.buffer).setUint32(12,0xffffffff,true)],['payload ceiling',b=>new DataView(b.buffer).setUint32(16,0xffffffff,true)]])test('reject raw '+name,()=>{const b=wire.slice();change(b);assert.throws(()=>decode(b));});
test('truncation/trailing bytes and offset byte views are handled exactly',()=>{for(const n of [0,27,wire.length-1])assert.throws(()=>decode(wire.subarray(0,n)));const padded=new Uint8Array(wire.length+23);padded.set(wire,13);exact(decode(padded.subarray(13,13+wire.length)),graph);assert.throws(()=>decode(padded.subarray(13)));});
for(const [name,change]of [['type',h=>h.blocks[0].type='f32'],['overlap',h=>h.blocks[1].offset=0],['gap',h=>h.blocks[1].offset++],['length',h=>h.blocks[0].length++],['unknown block',h=>h.blocks[0].name='scene'],['duplicate block',h=>h.blocks[1]={...h.blocks[0]}],['version',h=>h.version=2],['identity',h=>h.identity.sourceHash='f'.repeat(64)]])test('valid-checksum header rejects '+name,()=>assert.throws(()=>decode(alter(wire,h=>change(h)))));
for(const [name,change]of [
 ['CSR first',(_h,_b,v,k)=>v.setUint32(k('nbOffsets').offset,1,true)],
 ['CSR last',(_h,_b,v,k)=>v.setUint32(k('nbOffsets').offset+k('nbOffsets').bytes-4,0,true)],
 ['CSR decreasing',(_h,_b,v,k)=>{v.setUint32(k('nbOffsets').offset+4,2,true);v.setUint32(k('nbOffsets').offset+8,1,true);}],
 ['neighbor range',(h,_b,v,k)=>v.setUint32(k('nbIDs').offset,h.counts.nodes,true)],
 ['edge node range',(h,_b,v,k)=>v.setUint32(k('edgeABRoad').offset,h.counts.nodes,true)],
 ['road range',(h,_b,v,k)=>v.setUint32(k('edgeABRoad').offset+8,h.counts.roads,true)],
 ['bad borrowed reverse road',(_h,_b,v,k)=>v.setUint32(k('edgeABRoad').offset+8,1,true)],
 ['duplicate edge',(_h,b,_v,k)=>{const p=k('edgeABRoad').offset;b.copyWithin(p+12,p,p+12);}],
 ['short edge',(_h,_b,v,k)=>v.setFloat64(k('edgeNumbers').offset,.29,true)],
 ['nonfinite edge',(_h,_b,v,k)=>v.setFloat64(k('edgeNumbers').offset,NaN,true)],
 ['nonfinite node',(_h,_b,v,k)=>v.setFloat64(k('nodeXY').offset,Infinity,true)],
 ['node value without presence',(_h,_b,v,k)=>v.setUint8(k('nodeFlags').offset,2)],
 ['unknown edge flags',(_h,_b,v,k)=>v.setUint8(k('edgeFlags').offset,128)],
 ['closed without out',(_h,_b,v,k)=>v.setUint8(k('edgeFlags').offset,7)]
])test('valid CRC does not bypass '+name,()=>assert.throws(()=>decode(alter(wire,change))));
test('valid CRC cannot hide duplicate coordinate keys or duplicate neighbors',()=>{
 const coords=alter(wire,(_h,b,_v,k)=>{const at=k('nodeXY').offset;b.copyWithin(at+16,at,at+16);});assert.throws(()=>decode(coords),/DUPLICATE_COORDINATE/);
 const nb=alter(wire,(h,_b,v,k)=>{for(let i=0;i<h.counts.nodes;i++){const at=k('nbOffsets').offset+i*4,begin=v.getUint32(at,true),end=v.getUint32(at+4,true);if(end-begin>=2){v.setUint32(k('nbIDs').offset+(begin+1)*4,v.getUint32(k('nbIDs').offset+begin*4,true),true);return;}}assert.fail('fixture needs a branch');});assert.throws(()=>decode(nb),/DUPLICATE_NEIGHBOR/);
});
test('valid CRC cannot hide reverse direction mismatch',()=>{const bad=alter(wire,(_h,_b,v,k)=>v.setFloat64(k('edgeNumbers').offset+8,.5,true));assert.throws(()=>decode(bad),/REVERSE_EDGE/);});
test('header CRC alone cannot admit malformed UTF8/JSON',()=>{const bad=wire.slice(),p=new DataView(bad.buffer),n=p.getUint32(12,true);bad[28]=255;p.setUint32(20,crc(bad.subarray(28,28+n)),true);assert.throws(()=>decode(bad),/HEADER_JSON/);});
test('bounded counts/working cap precede road visits and output hydration',()=>{
 const denied=new Proxy(roads,{get(target,key,receiver){if(key==='length')return target.length;throw Error('roads visited before count budget');}});
 const over=alter(wire,h=>h.counts.nodes=100000);assert.throws(()=>decode(over,denied),/COUNT_BUDGET/);
 assert.throws(()=>decode(wire,denied,identity,{maxWorkingBytes:1}),/WORKING_BUDGET/);
 for(const limits of [{maxNodes:0},{maxEdges:0},{maxNeighbors:0},{maxRoads:0},{maxHeaderBytes:1},{maxPayloadBytes:1}])assert.throws(()=>decode(wire,roads,identity,limits));
 assert.throws(()=>decode(wire,roads,identity,{maxPayloadBytes:STREET_GRAPH_LIMITS.maxPayloadBytes+1}),/LIMITS/);
});
test('wrong source road count/attributes reject even with unchanged identity',()=>{assert.throws(()=>decode(wire,roads.slice(1)),/ROAD_COUNT/);const bad=structuredClone(roads);bad[0].o=0;assert.throws(()=>decode(wire,bad),/ROAD_REFERENCE/);});
console.log(JSON.stringify({ok:true,checks,wireBytes:wire.length,openWireBytes:openWire.length,littleEndian:true,realConstructor:true,realCityMeasured:false,workingBudgetIsNotRAM:true}));
