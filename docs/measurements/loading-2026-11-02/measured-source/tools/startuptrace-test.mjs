/* №17ж: fake monotonic clock verifies accounting, overlap, bounds and generator order; no game/build. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const source=await fs.readFile(new URL('../src/game/startuptrace.js',import.meta.url),'utf8');
const{createStartupTrace}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
let t=0;const s=createStartupTrace({enabled:true,now:()=>t,resources:()=>[]});
s.work('parent',()=>{t+=2;s.work('child',()=>{t+=3;});t+=5;});
let r=s.report();assert.equal(r.workUnionMs,10);assert.equal(r.rows.find(x=>x.name==='parent').exclusiveWorkMs,7);
const a=s.windowStart('waitA','worker');t+=2;const b=s.windowStart('waitB','worker');t+=4;a();t+=3;b();
r=s.report();assert.equal(r.waitUnionMs.worker,9);assert.equal(r.rows.filter(x=>/^wait/.test(x.name)).reduce((a,x)=>a+x.windowMs,0),13);
const order=[];function* g(){order.push(1);const x=yield 'wait';order.push(x);return 9;}
const it=s.steps('generator',g());assert.deepEqual(it.next(),{done:false,value:'wait'});assert.deepEqual(it.next(7),{done:true,value:9});assert.deepEqual(order,[1,7]);
s.mark('menu.visible');t+=3000;s.request();t+=10;s.control({localReady:true});assert.equal(s.firstControl.at,t);
const bounded=createStartupTrace({enabled:true,now:()=>t,resources:()=>[]});
for(let i=0;i<256;i++)bounded.work('row-'+i,()=>{});
bounded.work('row-0',()=>{});assert.equal(bounded.report().dropped,0);
bounded.work('new-row',()=>{});assert.equal(bounded.report().overflow.rows,1);
for(let i=0;i<64;i++)bounded.mark('mark-'+i);
bounded.mark('mark-0');assert.equal(bounded.report().overflow.marks,0);
bounded.mark('new-mark');assert.equal(bounded.report().overflow.marks,1);
for(let i=0;i<32;i++)bounded.flag('flag-'+i);
bounded.flag('flag-0');assert.equal(bounded.report().overflow.flags,0);assert.equal(bounded.report().flags['flag-0'],2);
bounded.flag('new-flag');assert.equal(bounded.report().overflow.flags,1);
for(let i=0;i<32;i++)bounded.count('counter-'+i);
bounded.count('counter-0');assert.equal(bounded.report().overflow.counters,0);assert.equal(bounded.report().counters['counter-0'],2);
bounded.count('new-counter');assert.equal(bounded.report().overflow.counters,1);
r=bounded.report();assert.equal(r.dropped,4);assert.equal(r.rows.length,256);assert.equal(Object.keys(r.marks).length,64);assert.equal(Object.keys(r.flags).length,32);assert.equal(Object.keys(r.counters).length,32);
const resourceTrace=createStartupTrace({enabled:true,resources:()=>Array.from({length:80},(_,i)=>({name:'https://test/'+i+'.js'}))});
const resourceReport=resourceTrace.report();assert.equal(resourceReport.resources.length,64);assert.deepEqual(resourceReport.resourceCapture,{totalCount:80,includedCount:64,truncatedCount:16,limit:64});
assert.equal(resourceReport.dropped,0,'Resource truncation is separate and explicitly reported');
// The early diagnostic module must not publish the legacy game-readiness object.
const beforeWindow=globalThis.window,beforeLocation=globalThis.location;
try{
 globalThis.window={};globalThis.location={search:'?startuptrace'};
 await import('data:text/javascript;base64,'+Buffer.from(source+'\n// independent bootstrap invariant').toString('base64'));
 assert(globalThis.window.__startupTrace);assert.equal(Object.hasOwn(globalThis.window,'__boot'),false);
}finally{
 if(beforeWindow===undefined)delete globalThis.window;else globalThis.window=beforeWindow;
 if(beforeLocation===undefined)delete globalThis.location;else globalThis.location=beforeLocation;
}
const off=createStartupTrace();let ran=false;off.work('off',()=>{ran=true;});assert(ran);assert.equal(off.report().rows.length,0);
console.log(JSON.stringify({ok:true,nestedWorkUnion:10,overlappingWorkerWaitUnion:9,boundedRows:r.rows.length,overflow:r.overflow,resourceTruncated:16,legacyBootUntouched:true}));
