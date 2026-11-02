import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fixture,descriptor,parameters,runtime,base,receipt} from './land-package-export-fixture.mjs';
import {createLandPackageExporter} from '../src/game/landdata/land-package-export.js';
let checks=0;
for(const graphics of ['mid','high'])for(const district of [0,3,7]){
 const s=fixture({district});s.ctx.runtime.graphics=graphics;s.ready();const m=s.endpoint.meta();
 assert.equal(m.summary.byteExact,true);assert.equal(m.summary.repeated,true);assert.equal(m.summary.liveRestored,false);assert.equal(m.summary.ordinary,true);assert.equal(m.cleanCalls,1);assert.equal(m.randomCalls,0);
 assert.equal(m.conditions.graphics,graphics);assert.equal(m.conditions.district,district);assert.equal(s.ctx.runtime.district,district);assert.deepEqual(m.actualParams,parameters);assert.deepEqual(m.manifest.parameters,parameters);assert.equal(m.identity.seed,0x5EED);assert.equal(Object.hasOwn(m.identity.flags,'buildHash'),false);
 const bytes=Buffer.from(s.endpoint.chunk(0,m.bytes),'base64');assert.equal(createHash('sha256').update(bytes).digest('hex'),m.summary.fileSha256);
 m.manifest.parameters.minWidth=999;assert.equal(s.endpoint.meta().manifest.parameters.minWidth,.8);assert.equal(s.ctx.source.ST.built,false);assert.equal(s.ctx.source.ST.supportReady,false);
 assert.throws(()=>s.endpoint.chunk(0,65537),/CHUNK/);s.endpoint.release();s.endpoint.release();assert.throws(()=>s.endpoint.chunk(0,1),/CHUNK/);checks++;
}
for(const change of [s=>s.ctx.runtime.graphics='low',...[1,2,4,5,6,8,-1,3.5,'3',null,undefined].map(district=>s=>s.ctx.runtime.district=district),s=>s.ctx.runtime.quick=true,s=>delete s.ctx.runtime.quick,s=>s.ctx.runtime.externalSeed=true,s=>s.ctx.runtime.editor=true,s=>s.ctx.deferDraw=false,s=>s.ctx.prepared=false,s=>s.source.ST.minWidth=.8,s=>s.ctx.query+='&landcache=1',s=>s.ctx.parameters={...parameters,terrainNX:1}]){
 const s=fixture();change(s);assert.throws(()=>s.exporter.beforeClean(s.ctx));assert.equal(s.endpoint.meta().phase,'failed');assert.equal(s.endpoint.meta().cleanCalls,0);checks++;
}
{
 const s=fixture({descriptor:()=>({...descriptor(),hookOwned:false})});assert.throws(()=>s.exporter.beforeClean(s.ctx),/ORDINARY_EDL/);checks++;
}
{
 let owned=true;const s=fixture({descriptor:()=>({...descriptor(),hookOwned:owned})});s.exporter.beforeClean(s.ctx);owned=false;assert.throws(()=>s.exporter.watch((function*(){})()),/ORDINARY_EDL/);assert.equal(s.endpoint.meta().cleanCalls,0);checks++;
}
{
 const previous=Math.random,s=fixture();s.exporter.beforeClean(s.ctx);const it=s.exporter.watch((function*(){Math.random();s.finish();})());it.next();assert.equal(Math.random,previous);assert.throws(()=>s.exporter.afterClean({source:s.source}),/CLEAN_NOT_SUCCESSFUL_OR_RANDOM/);assert.equal(s.endpoint.meta().randomCalls,1);assert.equal(s.endpoint.meta().bytes,0);checks++;
}
{
 const s=fixture();s.exporter.beforeClean(s.ctx);let closed=0;const it=s.exporter.watch((function*(){try{yield;}finally{closed++;}})());it.next();it.return();assert.equal(closed,1);assert.equal(s.endpoint.meta().phase,'failed');assert.equal(s.endpoint.meta().bytes,0);checks++;
}
{
 const s=fixture({maxBytes:8,maxItems:1});const it=s.exporter.beforeCleanSteps(s.ctx);assert.equal(it.next().done,false);it.return();assert.equal(s.endpoint.meta().phase,'failed');assert.equal(s.endpoint.meta().cleanCalls,0);checks++;
}
{
 const s=fixture();s.exporter.beforeClean(s.ctx);s.exporter.watch((function*(){s.finish();})()).next();const it=s.exporter.afterCleanSteps({source:s.source});it.next();it.return();assert.equal(s.endpoint.meta().phase,'failed');assert.equal(s.endpoint.meta().bytes,0);checks++;
}
{
 const s=fixture({flag(){throw Error('secondary flag failure');}});const error=Error('primary clean failure');assert.equal(s.exporter.fail(error),error);assert.equal(s.exporter.fail(Error('secondary')),error);assert.equal(s.endpoint.meta().error,error.message);checks++;
}
{
 let endpoint;assert.throws(()=>createLandPackageExporter({receipt:{...receipt,base:{...base,version:1}},descriptor,expose:a=>endpoint=a}),/RECEIPT_FIELDS/);assert.equal(endpoint.meta().phase,'failed');checks++;
}
// Freshness includes the uncommitted mask state, which is intentionally absent from the preclean fingerprint.
for(const dirty of [s=>s.source.finalMask.reserve([96,96,128,128]),s=>s.source.finalMask.kept.triangle(0,0,2,0,0,2,.2),s=>s.source.finalMask.segments.push(0,0,2,2),s=>s.source.finalMask.removedRegions.push([[0,0],[1,0],[0,1]]),s=>s.source.ST.fillTriangles=1]){
 const s=fixture();dirty(s);assert.throws(()=>s.exporter.beforeClean(s.ctx),/SOURCE_NOT_FRESH/);assert.equal(s.endpoint.meta().cleanCalls,0);assert.equal(s.endpoint.meta().bytes,0);checks++;
}
{
 const s=fixture(),other=fixture();s.exporter.beforeClean(s.ctx);s.exporter.watch((function*(){other.finish();})()).next();
 assert.throws(()=>s.exporter.afterClean({source:other.source}),/SOURCE_CHANGED/);assert.equal(s.endpoint.meta().bytes,0);checks++;
}
for(const replacement of ['source','cover','green','finalMask','kept','ST']){
 const s=fixture({maxBytes:8,maxItems:1}),other=fixture(),it=s.exporter.beforeCleanSteps(s.ctx);assert.equal(it.next().done,false);
 if(replacement==='source')s.ctx.source=other.source;
 else if(replacement==='kept')s.source.finalMask.kept=other.source.finalMask.kept;
 else s.source[replacement]=other.source[replacement];
 assert.throws(()=>it.next(),/SOURCE_(?:REFERENCES_)?CHANGED/);assert.equal(s.endpoint.meta().phase,'failed');assert.equal(s.endpoint.meta().bytes,0);checks++;
}
{
 const s=fixture({maxBytes:8,maxItems:1}),it=s.exporter.beforeCleanSteps(s.ctx);assert.equal(it.next().done,false);s.source.finalMask.reserve([96,96,128,128]);
 assert.throws(()=>it.next(),/SOURCE_NOT_FRESH/);assert.equal(s.endpoint.meta().bytes,0);checks++;
}
{
 const s=fixture(),other=fixture();s.exporter.beforeClean(s.ctx);
 const it=s.exporter.watch((function*(){s.source.ST=other.source.ST;yield;})());assert.throws(()=>it.next(),/SOURCE_REFERENCES_CHANGED/);assert.equal(s.endpoint.meta().bytes,0);checks++;
}
for(const stage of ['capture','fileHash']){
 let current=true;const s=fixture({maxBytes:8,maxItems:1});s.ctx.isCurrent=()=>current;s.exporter.beforeClean(s.ctx);s.exporter.watch((function*(){s.finish();})()).next();
 const it=s.exporter.afterCleanSteps({source:s.source});let step;do{step=it.next();assert.equal(step.done,false);}while(step.value!=='land.package.export.'+stage);
 current=false;assert.throws(()=>it.next(),/SOURCE_LIFETIME_CHANGED/);assert.equal(s.endpoint.meta().phase,'failed');assert.equal(s.endpoint.meta().bytes,0);checks++;
}
// One actual small cleanContours path, not a second implementation of cleaning.
globalThis.window={};globalThis.location={href:'app://game/index.html',search:'?landworkers=0'};
const real=await import('../src/game/raisedland.js');
const {ShapeUtils,Vector2}=await import('../src/vendor/three.module.min.js');
real.record(0,0,10,0,0,10,.085,177,173,159,true);real.prepare([],()=>[]);
let endpoint;const e=createLandPackageExporter({receipt,descriptor,expose:a=>endpoint=a});
e.beforeClean({source:real,cores:real.cleanCorePlan(),parameters,runtime,prepared:true,deferDraw:true});
for(const _ of e.watch(real.cleanContours({M:{grad(){},up(){assert.fail('deferred draw');}},deferDraw:true,groundH:()=>1,terrain:{},triangulate:(outer,holes=[])=>({points:[...outer,...holes.flat()],triangles:ShapeUtils.triangulateShape(outer.map(p=>new Vector2(...p)),holes.map(h=>h.map(p=>new Vector2(...p))))})}))){}
e.afterClean({source:real});assert.equal(endpoint.meta().summary.byteExact,true);assert.equal(endpoint.meta().randomCalls,0);assert.equal(real.ST.built,false);checks++;
console.log(JSON.stringify({ok:true,checks,ordinary:true,actualTinyClean:true,midHighBothAccepted:true,exportDistricts:[0,3,7],externalSeedRejected:true,noCity:true}));
