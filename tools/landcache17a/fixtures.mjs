import assert from 'node:assert/strict';
import {createLandCover} from '../../src/game/landcover.js';
import {createLandMask} from '../../src/game/landmask.js';
import {ShapeUtils,Vector2} from '../../src/vendor/three.module.min.js';
import {captureResult,encodeCheckpoint,decodeCheckpoint,restoreResult,validateCheckpoint,crc32} from '../../src/game/landcache17a/checkpoint-codec.js';
const identity={mapId:'fixture-only',mode:'streamed-deferred',mapHash:'a'.repeat(64),editsHash:'b'.repeat(64),sourceHash:'c'.repeat(64),precleanHash:'d'.repeat(64),seed:7,flags:{landstream:true,landworkers:0,deferDraw:true}};
const tri=(outer,holes=[])=>({points:[...outer,...holes.flat()],triangles:ShapeUtils.triangulateShape(outer.map(p=>new Vector2(...p)),holes.map(h=>h.map(p=>new Vector2(...p))))});
const stats=mask=>({built:false,supportReady:false,minWidth:.8,cleanedArea:0,fillTriangles:0,fillDraw:0,cleanTiles:3,maskTriangles:mask.count,maskEdges:mask.segments.length/4});
function target(){const cover=createLandCover(),green=createLandCover(),fallback=(x,z)=>green.height(x,z)>cover.height(x,z)||!cover.covered(x,z);const finalMask=createLandMask(fallback,(...v)=>[...cover.breaks(...v),...green.breaks(...v)]);return{cover,green,finalMask,ST:{built:false,supportReady:false}};}
const snapshot=t=>captureResult(t,{deferDraw:true,prepared:true,completed:true});
const bytes=t=>encodeCheckpoint(snapshot(t),identity);
let checks=0;const test=(name,fn)=>{fn();checks++;};
const t=target();
let p=t.cover.triangle(-0,-0,2,0,0,2,.085);p.rgb=[0,127,255];p.initial=true;
const absorbed=createLandCover();p=absorbed.triangle(3,0,5,0,3,2,.101);p.rgb=[123,9,90];t.cover.absorb(absorbed);
p=t.cover.triangle(2000000,2000000,2000002,2000000,2000000,2000002,.13);p.initial=true;
//257 palette entries trigger Uint16 (not an invented all-Float32 representation).
for(let i=0;i<257;i++){p=t.green.triangle(.1,.1,1.5,.1,.1,1.5,.2+i/1e7);p.rgb=[i&255,i>>8,21];}
t.cover.triangle(40,20,44,20,40,24,.085);
t.cover.compact();t.green.compact();
t.finalMask.reserve([32,0,64,32]);t.finalMask.reserve([-32,-32,0,0]);
t.finalMask.add([0,0,32,32],[{outer:[[1,1],[28,1],[28,28],[1,28]],holes:[[[8,8],[8,12],[12,12],[12,8]]]}],tri);
t.finalMask.add([-64,0,-32,32],[],tri);t.finalMask.finish();Object.assign(t.ST,stats(t.finalMask));
const sample=target=>{
 const {cover,green,finalMask:m}=target,points=[[0,0],[1,1],[9,9],[20,20],[40.1,20.1],[-40,1],[-10,-10],[100,100],[2000000.2,2000000.2]];
 return{points:points.map(([x,z])=>[cover.height(x,z),green.height(x,z),m.cellState(x,z),m.contains(x,z)]),
  inside:[...m.parts([[0,0],[29,0],[29,29],[0,29]])],breaks:m.breaks(0,10,31,10),sides:m.sides(8,10,1,0),
  boundaries:[...m.boundaries()].filter(Boolean),bounded:[...m.boundaries({bounds:[0,0,32,32]})].filter(Boolean),
  colors:[...cover.triangles].map(q=>[q.id,q.p,q.lift,q.rgb,q.initial]),initial:[...cover.initialTriangles].map(q=>q.id)};
};
const expected=sample(t),original=bytes(t),refs=[t.cover,t.green,t.finalMask,t.finalMask.kept];
const parsed=decodeCheckpoint(original,identity);
t.cover.triangle(-20,-20,-19,-20,-20,-19,.4);t.green.triangle(25,25,26,25,25,26,.5);
restoreResult(t,parsed,{prepared:true});
test('exact binary snapshot round-trip',()=>assert.deepEqual(bytes(t),original));
test('full query/geometry/color/initial/domain equality',()=>assert.deepEqual(sample(t),expected));
test('false/true/undefined domain stay distinct',()=>{assert.equal(t.finalMask.cellState(40.1,20.1),false);assert.equal(t.finalMask.cellState(9,9),true);assert.equal(t.finalMask.cellState(100,100),undefined);assert.equal(t.finalMask.contains(9,9),false);assert.equal(t.finalMask.contains(40.1,20.1),false);assert.equal(t.finalMask.contains(-10,-10),true);assert.equal(t.finalMask.contains(-40,1),false);assert.equal(t.finalMask.contains(100,100),true);});
restoreResult(t,parsed,{prepared:true});
test('repeat restore clears old state; no duplicate pages/IDs',()=>assert.deepEqual(bytes(t),original));
test('exported singleton identities survive',()=>assert.deepEqual([t.cover,t.green,t.finalMask,t.finalMask.kept],refs));
test('no support/surface flag forged by restore',()=>{assert.equal(t.ST.supportReady,false);assert.equal(t.ST.built,false);});
test('17ж work hook preserves output and exposes bounded phases',()=>{const phases=[];const result=decodeCheckpoint(original,identity,{work:(name,fn)=>{phases.push(name);return fn();}});assert.deepEqual(encodeCheckpoint(result,identity),original);assert.deepEqual([...new Set(phases)],['raisedland.cache.header','raisedland.cache.preflight','raisedland.cache.blocks','raisedland.cache.tree','raisedland.cache.index','raisedland.cache.validate']);});
test('numeric/string Map keys and insertion order',()=>assert.deepEqual([...snapshot(t).cover.grid.keys()],[...parsed.cover.grid.keys()]));
test('page holes and source precision survive',()=>{const s=snapshot(t).cover;assert.equal(s.packed.blocks.length,2);assert.equal(s.packed.n,4);assert.equal(s.packed.end,16387);assert.equal(Object.is(s.packed.blocks[0].xy[0],-0),true);assert.equal(s.packed.blocks[0].heights[0],.085);});
test('adaptive uint16 palettes survive',()=>{assert.equal(parsed.green.packed.blocks[0].heightIndex.constructor,Uint16Array);assert.equal(parsed.green.packed.blocks[0].meta.constructor,Uint16Array);assert.equal(parsed.cover.packed.blocks[0].heightIndex.constructor,Uint8Array);});
test('input buffer can be released/overwritten',()=>{const input=original.slice(),state=decodeCheckpoint(input,identity);input.fill(0);restoreResult(t,state,{prepared:true});assert.deepEqual(bytes(t),original);});
for(const [name,mutate]of[['magic',b=>b[0]^=1],['version',b=>b[8]=9],['header integrity',b=>b[21]^=1],['payload integrity',b=>b[b.length-1]^=1]])test('reject '+name,()=>{const b=original.slice();mutate(b);assert.throws(()=>decodeCheckpoint(b,identity));});
for(const length of [0,19,original.length-1])test('reject truncated '+length,()=>assert.throws(()=>decodeCheckpoint(original.subarray(0,length),identity)));
test('reject wrong data/edits/seed/flags identity',()=>{for(const mismatch of [{seed:8},{editsHash:'e'.repeat(64)},{flags:{...identity.flags,landstream:false}}])assert.throws(()=>decodeCheckpoint(original,{...identity,...mismatch}),/IDENTITY_MISMATCH/);});
test('reject non-finite precision values',()=>{const bad=decodeCheckpoint(original,identity);bad.cover.packed.blocks[0].xy[0]=NaN;assert.throws(()=>encodeCheckpoint(bad,identity),/NON_FINITE/);});
test('reject unknown identity fields',()=>assert.throws(()=>decodeCheckpoint(original,{...identity,unrecorded:1}),/IDENTITY_FIELDS/));
test('reject corruption before mutation',()=>{const bad=decodeCheckpoint(original,identity);bad.mask.domainCells++;const before=bytes(t);assert.throws(()=>restoreResult(t,bad,{prepared:true}));assert.deepEqual(bytes(t),before);});
test('reject invalid ID without rebuilding it silently',()=>{const bad=decodeCheckpoint(original,identity);bad.cover.grid.values().next().value[0]=700000;assert.throws(()=>validateCheckpoint(bad),/GRID_ID/);});
test('wrong target index cell stays untouched',()=>{const bad=target();bad.finalMask=createLandMask(()=>true,()=>[],16);assert.throws(()=>restoreResult(bad,parsed,{prepared:true}),/TARGET_GRID/);assert.equal(bad.cover.count,0);});
test('require prepare and correct phase',()=>{assert.throws(()=>captureResult(t,{prepared:true,deferDraw:true}),/CAPTURE_UNSUPPORTED_PHASE/);assert.throws(()=>restoreResult(t,parsed),/RESTORE_PHASE/);assert.throws(()=>captureResult(t,{prepared:true,completed:true,deferDraw:false}),/CAPTURE_UNSUPPORTED_PHASE/);t.ST.supportReady=true;assert.throws(()=>restoreResult(t,parsed,{prepared:true}),/RESTORE_PHASE/);t.ST.supportReady=false;});
test('empty completed fields round-trip',()=>{const empty=target();empty.finalMask.finish();Object.assign(empty.ST,stats(empty.finalMask));assert.deepEqual(encodeCheckpoint(decodeCheckpoint(bytes(empty),identity),identity),bytes(empty));});
const simple=()=>{const x=target();x.cover.triangle(0,0,2,0,0,2,.1);x.finalMask.finish();Object.assign(x.ST,stats(x.finalMask));return x;};
test('owned capture survives source append/compact and buffer writes',()=>{const source=simple(),saved=snapshot(source),before=encodeCheckpoint(saved,identity);source.cover.triangle(40,40,42,40,40,42,.2);source.cover.compact();source.cover.snapshot().packed.blocks[0].xy[0]=999;assert.deepEqual(encodeCheckpoint(saved,identity),before);});
test('snapshot survives mutated first target and second restore',()=>{const saved=snapshot(simple()),before=encodeCheckpoint(saved,identity),a=target(),b=target();restoreResult(a,saved,{prepared:true});a.cover.triangle(50,50,52,50,50,52,.3);a.cover.compact();a.cover.snapshot().packed.blocks[0].xy[0]=777;assert.deepEqual(encodeCheckpoint(saved,identity),before);restoreResult(b,saved,{prepared:true});assert.equal(b.cover.count,1);assert.equal(b.cover.height(50.2,50.2),-Infinity);assert.equal(b.cover.height(.2,.2),.1);});
test('mutating checkpoint after restore does not mutate target',()=>{const saved=snapshot(simple()),a=target();restoreResult(a,saved,{prepared:true});saved.cover.packed.blocks[0].xy[0]=900;assert.equal(a.cover.height(.2,.2),.1);});
test('unknown resultStats cannot forge lifecycle or prototype',()=>{for(const key of ['built','supportReady','__proto__']){const saved=snapshot(simple()),x=simple(),before=bytes(x);Object.defineProperty(saved.resultStats,key,{value:true,enumerable:true});assert.throws(()=>restoreResult(x,saved,{prepared:true}),/RESULT_STATS_KEYS/);assert.equal(x.ST.built,false);assert.equal(x.ST.supportReady,false);assert.deepEqual(bytes(x),before);}});
test('missing late target capability rejects before any live change',()=>{const x=simple();x.cover.triangle(90,90,92,90,90,92,.4);x.finalMask={indexCell:8};assert.throws(()=>restoreResult(x,parsed,{prepared:true}),/TARGET_CAPABILITIES/);assert.equal(x.cover.height(90.2,90.2),.4);assert.equal(x.cover.count,2);});
test('late allocation/prepare failure leaves every singleton untouched',()=>{const x=simple(),before=bytes(x);x.finalMask.prepareRestoreSteps=function*(){throw Error('fixture prepare failure');};assert.throws(()=>restoreResult(x,parsed,{prepared:true}),/fixture prepare/);assert.deepEqual(bytes(x),before);});
test('frozen/accessor statistics reject before commit',()=>{for(const kind of ['frozen','setter']){const x=simple(),before=bytes(x);if(kind==='frozen')Object.freeze(x.ST);else Object.defineProperty(x.ST,'cleanedArea',{get:()=>0,set:()=>assert.fail('setter must never run')});assert.throws(()=>restoreResult(x,parsed,{prepared:true}),/TARGET_STATS/);assert.deepEqual(bytes(x),before);}});
test('oversized vertex/palette arrays reject by page format',()=>{for(const [field,value]of [['xy',new Float64Array(200000)],['heights',new Float64Array(300)],['metaValues',new Uint32Array(300)]]){const bad=decodeCheckpoint(original,identity);bad.cover.packed.blocks[0][field]=value;assert.throws(()=>validateCheckpoint(bad),/PAGE_(VERTEX|HEIGHT|META)_BUDGET/);}});
function wireWithOversizedXY(){const view=new DataView(original.buffer),size=view.getUint32(12,true),h=JSON.parse(new TextDecoder().decode(original.subarray(20,20+size)));const chunks=h.blocks.map(b=>original.slice(20+size+b.offset,20+size+b.offset+b.bytes));chunks[0]=new Uint8Array(new Float64Array(200000).buffer);h.blocks[0].length=200000;let n=0;for(let i=0;i<h.blocks.length;i++){h.blocks[i].offset=n;h.blocks[i].bytes=chunks[i].length;h.blocks[i].crc32=crc32(chunks[i]);n+=chunks[i].length;}h.dataBytes=n;const header=new TextEncoder().encode(JSON.stringify(h)),b=new Uint8Array(20+header.length+n),v=new DataView(b.buffer);b.set(original.subarray(0,12));v.setUint32(12,header.length,true);v.setUint32(16,crc32(header),true);b.set(header,20);for(let i=0;i<chunks.length;i++)b.set(chunks[i],20+header.length+h.blocks[i].offset);return b;}
test('valid-checksum oversized wire page rejected before typed copies',()=>{let blocks=false;assert.throws(()=>decodeCheckpoint(wireWithOversizedXY(),identity,{work:(name,fn)=>{if(name==='raisedland.cache.blocks')blocks=true;return fn();}}),/PAGE_VERTEX_BUDGET/);assert.equal(blocks,false);});
test('all configurable ceilings reject before typed copies/Map rebuild',()=>{for(const limits of [{maxPayloadBytes:1},{maxBlockBytes:1},{maxWorkingBytes:1},{maxMapCells:1},{maxDomainCells:1},{maxIndexIds:1},{maxPages:1},{maxBlocks:1},{maxHeaderBytes:1},{maxTreeNodes:1}]){let blocks=false,index=false;assert.throws(()=>decodeCheckpoint(original,identity,{limits,work:(name,fn)=>{blocks ||=name==='raisedland.cache.blocks';index ||=name==='raisedland.cache.index';return fn();}}));assert.equal(blocks,false,JSON.stringify(limits));assert.equal(index,false,JSON.stringify(limits));}});
test('capture/restore budgets also precede own copies and live changes',()=>{const x=simple(),saved=snapshot(x),before=bytes(x);assert.throws(()=>captureResult(x,{prepared:true,completed:true,deferDraw:true,limits:{maxPayloadBytes:1}}),/BUDGET/);assert.throws(()=>restoreResult(x,saved,{prepared:true,limits:{maxWorkingBytes:1}}),/WORKING_BUDGET/);assert.deepEqual(bytes(x),before);});

// Tiny real cleanContours path, one city cell, Worker disabled. No real city/map/build/browser.
globalThis.location={search:'?landworkers=0'};
const real=await import('../../src/game/raisedland.js');
for(const[a,b,c]of[[[0,0],[10,0],[0,10]],[[10,0],[10,10],[0,10]]])real.record(...a,...b,...c,.085,177,173,159,true);
for(const[a,b,c]of[[[4,0],[4.2,0],[4,8]],[[4.2,0],[4.2,8],[4,8]]])real.record(...a,...b,...c,.12,50,150,40,false);
real.prepare([],()=>[]);const gradient=[];
for(const step of real.cleanContours({M:{grad:f=>gradient.push(f),up:()=>assert.fail('deferDraw must not emit mesh')},triangulate:tri,deferDraw:true,groundH:()=>1,terrain:{}}))assert.equal(typeof step,'string');
const realBytes=bytes(real),realSample=sample(real),realRefs=[real.cover,real.green,real.finalMask,real.finalMask.kept];
real.cover.triangle(100,100,102,100,100,102,.3);restoreResult(real,decodeCheckpoint(realBytes,identity),{prepared:true});
test('one-cell actual cleanContours output round-trips',()=>{assert.deepEqual(bytes(real),realBytes);assert.deepEqual(sample(real),realSample);assert.deepEqual([real.cover,real.green,real.finalMask,real.finalMask.kept],realRefs);assert.ok(real.ST.fillTriangles>0);assert.equal(real.ST.fillDraw,0);assert.equal(gradient.at(-1),null);assert.equal(real.ST.supportReady,false);});
const summary={ok:true,checks,fixtureBytes:original.length,actualOneCellBytes:realBytes.length,oneCell:{fillTriangles:real.ST.fillTriangles,maskTriangles:real.ST.maskTriangles,cleanTiles:real.ST.cleanTiles},realCityMeasured:false};
console.log(JSON.stringify(summary));
