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
const directPromise=Promise.resolve(7);
assert.equal(off.awaited('disabled','module',()=>directPromise),directPromise,'disabled preserves the original promise');
assert.equal(off.awaited('disabled','module',()=>3),3);
assert.throws(()=>off.awaited('disabled','module',()=>{throw Error('expected');}),/expected/);
async function awaitOrder(wrapped){const events=[],p=Promise.resolve();const done=(async()=>{await(wrapped?off.awaited('disabled','module',()=>p):p);events.push('after-await');})();queueMicrotask(()=>events.push('other-microtask'));await done;return events;}
assert.deepEqual(await awaitOrder(true),await awaitOrder(false),'disabled instrumentation preserves microtask order');
console.log(JSON.stringify({ok:true,nestedWorkUnion:10,overlappingWorkerWaitUnion:9,boundedRows:r.rows.length,overflow:r.overflow,resourceTruncated:16,legacyBootUntouched:true}));

// Console/uncaught faults and mixed-case flags must exclude a timing from success medians.
const {validateStartupReport}=await import('./startup-report.mjs');
const admissible={ok:true,errors:[],uncaught:0,result:{ok:true,crash:[],moved:1,bootstrap:{markerWrites:1,bootAbsentAtMarker:true,earlyBootSeen:false},report:{enabled:true,dropped:0,overflow:{rows:0,marks:0,flags:0,counters:0},flags:{},resourceCapture:{truncatedCount:0},marks:{'first.control':{at:1,data:{state:'drive',held:false,localReady:true,supportReady:true}}},rows:[{exclusiveWorkMs:1}],workUnionMs:1}}};
assert.equal(validateStartupReport(admissible).ok,true);
const rejectionCases=[v=>v.errors.push('console error'),v=>v.uncaught=1,v=>delete v.errors,v=>delete v.uncaught,v=>v.result.report.flags['gpu.compileError']=1,v=>v.result.report.flags['worker.FALLBACK']=1,v=>v.result.report.flags['module.Rejected']=1,v=>v.result.report.dropped=1,v=>v.result.report.resourceCapture.truncatedCount=1,v=>v.result.moved=0,v=>v.result.report.marks['first.control'].data.state='brief',v=>v.result.report.workUnionMs++,v=>v.evalErr='fixture evaluation failed',v=>v.result.report.marks['first.control'].at=NaN,v=>delete v.result.report.overflow,v=>v.result.report.rows={}];
for(const change of rejectionCases){const value=structuredClone(admissible);change(value);assert.equal(validateStartupReport(value).ok,false);}
console.log(JSON.stringify({startupReportGate:true,rejectedVariants:rejectionCases.length}));

// Legacy archives remain admissible; new pilots explicitly require the fresh gate payload.
assert.equal(validateStartupReport(admissible,{requireGuardV2:true}).ok,false);
const freshControl=structuredClone(admissible);Object.assign(freshControl.result.report.marks['first.control'].data,{guardVersion:2,paused:false,mapOpen:false});
assert.equal(validateStartupReport(freshControl,{requireGuardV2:true}).ok,true);
for(const [key,value]of [['guardVersion',1],['paused',true],['mapOpen',true],['held',true]]){const bad=structuredClone(freshControl);bad.result.report.marks['first.control'].data[key]=value;assert.equal(validateStartupReport(bad,{requireGuardV2:true}).ok,false);}
console.log(JSON.stringify({guardV2:true,legacyDefaultUnchanged:true,freshGateRejects:4}));
