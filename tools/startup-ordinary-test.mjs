/* Pure faults against reduced real pilot observations. No city, asset read or preflight. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ordinaryHash as hash,validateOrdinaryConfig,validateOrdinaryReport,validateOrdinaryAttempt,validateOrdinaryCommand,validateOrdinarySeries,summarizeOrdinary} from './startup-ordinary-gate.mjs';
const witness=JSON.parse(fs.readFileSync(new URL('./fixtures/startup-ordinary-witness.json',import.meta.url),'utf8'));
const copy=structuredClone,h=c=>c.repeat(64),repo='/fixture-repo',electron='/fixture-electron',catalog=witness.catalog;
const {parameters,kind,version,...base}=catalog.manifest;
const config={version:1,kind:'startup-ordinary',dir:'/immutable-build',base,buildHash:h('a'),fixture:{file:'/high-fixture.json',sha256:h('b')},catalog:{file:'/catalog.json',sha256:h('c')},pilots:{generated:{report:'/generated.json',sha256:h('d')},cache:{report:'/cache.json',sha256:h('e')}}};
let checks=0;const test=(name,fn)=>{fn();checks++;};
test('real ordinary generated and gzip-cache pilot observations admitted',()=>{assert.equal(validateOrdinaryConfig(config,catalog).ok,true);for(const variant of ['generated','cache'])assert.deepEqual(validateOrdinaryReport(witness.pilots[variant].raw,{variant,catalog}),{ok:true,reasons:[]});});
test('unbound source or missing pilot is rejected',()=>{const c=copy(config);c.base.sourceHash=h('f');assert.equal(validateOrdinaryConfig(c,catalog).ok,false);delete c.pilots.cache;assert.equal(validateOrdinaryConfig(c).ok,false);});
test('ordinary conditions cannot be silently overridden by extra config options',()=>{assert.equal(validateOrdinaryConfig({...config,cpu:1},catalog).ok,false);});
for(const[name,change]of [
 ['zero exit with false result',r=>r.result.ok=false],['console error',r=>r.errors.push('real error')],['mixed-case fallback flag',r=>r.result.report.flags['gpu.compileError']=true],
 ['missing trace overflow',r=>delete r.result.report.overflow],['NaN control',r=>r.result.report.marks['first.control'].at=NaN],['pause at control',r=>r.result.report.marks['first.control'].data.paused=true],
 ['external seed',r=>r.result.host.seed='7'],['replaced ordinary hook',r=>r.result.rng.hookOwned=false],['hidden quality override',r=>r.result.conditions.url+='&gfx=high'],
 ['mature career despite fixture claim',r=>r.result.district.before.opened=8],
 ['warm graphics mismatch',r=>r.result.conditions.graphics.preset='mid'],['clean after cache',r=>r.result.report.counters['raisedland.cleanCalls']=1],['wrong raw SHA',r=>r.result.landPackage.rawSha256=h('f')],
 ['fatal commit',r=>r.result.landPackage.fatal=true],['native buffer retained',r=>r.result.landPackage.bufferHeld=true],['worker used',r=>r.result.report.rows[0].workerWorkMs=1],['invalid stage field',r=>r.result.report.rows[0].windowMs=NaN]
])test('reject '+name,()=>{const raw=copy(witness.pilots.cache.raw);change(raw);assert.equal(validateOrdinaryReport(raw,{variant:'cache',catalog}).ok,false);});
const toolFiles={probe:'tools/probe.cjs',eval:'tools/probe-checks/startup-ready.js',observer:'tools/probe-checks/startup-bootstrap-observe.js',gate:'tools/startup-report.mjs',admission:'tools/land-package-smoke.mjs'};
const tools=Object.fromEntries(Object.values(toolFiles).map(f=>[f,h('f')]));
function commandRecord(variant='generated',phase='cold',session='own-session'){
 const runDir='/attempt/'+variant+'/'+phase;
 const argv=[electron,repo+'/tools/probe.cjs','--mode=steam','--dir='+config.dir,'--startup-trace','--startup-session='+session,...(phase==='cold'?['--startup-cold']:[]),'--startup-fixture='+config.fixture.file,'--fresh','--early','--size=deck','--cpu=3','--bootcpu','--init-script='+repo+'/tools/probe-checks/startup-bootstrap-observe.js','--q=gfxdev=deck&mute&startupdistrict=0'+(variant==='generated'?'&landpackage=0':''),'--eval='+repo+'/tools/probe-checks/startup-ready.js','--bootwait=360','--timeout=480','--max=0','--errors','--report='+runDir+'/raw.json'];
 const smoke={argv,variant,phase,preset:'high',cpu:3,fixtureFile:config.fixture.file,fixtureSha256:config.fixture.sha256,catalogFile:config.catalog.file,catalogSha256:config.catalog.sha256,processStatus:0,signal:null,ok:true,...Object.fromEntries(Object.entries(toolFiles).map(([k,file])=>[k,{file,sha256:tools[file]}]))};
 return{smoke,context:{variant,phase,session,config,repo,electron,runDir,tools,platform:'darwin'}};
}
test('actual cold/warm command binding rejects extra seed, wrong session and cold relabel',()=>{for(const phase of ['cold','warm']){const {smoke,context}=commandRecord('generated',phase);assert.equal(validateOrdinaryCommand(smoke,context).ok,true);for(const arg of ['--seed=0','--startup-session=other']){const bad=copy(smoke);bad.argv.push(arg);assert.equal(validateOrdinaryCommand(bad,context).ok,false);}assert.equal(validateOrdinaryCommand(smoke,{...context,phase:phase==='cold'?'warm':'cold'}).ok,false);}});
test('outer status, raw byte SHA and smoke record byte SHA independently enforced',()=>{const{smoke,context}=commandRecord(),text=JSON.stringify(witness.pilots.generated.raw);smoke.rawSha256=hash(text);const smokeText=JSON.stringify(smoke),record={runDir:context.runDir,phase:'cold',session:context.session,processStatus:0,signal:null,reportSha256:hash(text),smokeRecordSha256:hash(smokeText)};assert.equal(validateOrdinaryAttempt(record,text,smokeText,context).ok,true);for(const mutate of [r=>r.processStatus=1,r=>r.signal='SIGTERM',r=>r.reportSha256=h('0'),r=>r.smokeRecordSha256=h('0')]){const bad=copy(record);mutate(bad);assert.equal(validateOrdinaryAttempt(bad,text,smokeText,context).ok,false);}});
function series(){
 const m={version:1,kind:'startup-ordinary',state:'complete',expectedRuns:12,activeRun:null,config:copy(config),catalogBody:catalog,configSha256:h('1'),harnessSha256:h('2'),runs:[]},reports={};
 for(let repeat=1;repeat<=3;repeat++)for(const variant of repeat%2?['generated','cache']:['cache','generated'])for(const phase of ['cold','warm']){
  const raw=copy(witness.pilots[variant].raw),offset=[30,10,20][repeat-1];raw.result.report.marks['first.control'].at+=offset;raw.result.firstControlFromClickMs+=offset;
  const t=raw.result.report,r=raw.result,report=repeat+'/'+variant+'/'+phase;reports[report]=raw;
  m.runs.push({repeat,variant,phase,session:'session-'+repeat+'-'+variant,state:'complete',ok:true,processStatus:0,signal:null,configSha256:m.configSha256,harnessSha256:m.harnessSha256,sourceHash:config.base.sourceHash,buildHash:config.buildHash,fixtureSha256:config.fixture.sha256,catalogSha256:config.catalog.sha256,report,controlMs:t.marks['first.control'].at,processToControlMs:t.clock.timeOrigin+t.marks['first.control'].at-r.host.processEpochMs,fromClickMs:r.firstControlFromClickMs});
 }
 return{m,reports};
}
test('twelve exact slots yield n3 medians from unsorted raw values; waits remain separate',()=>{const{m,reports}=series();assert.equal(validateOrdinarySeries(m).ok,true);const s=summarizeOrdinary(m,reports);assert.equal(s.ok,true);assert.equal(s.groups.length,4);for(const g of s.groups){assert.equal(g.n,3);assert.equal(g.timings.controlMs.medianMs,witness.pilots[g.variant].raw.result.report.marks['first.control'].at+20);assert.ok(g.stages.length>0);assert.equal(Object.hasOwn(g,'summedWaits'),false);}});
for(const[name,change]of [['11 reports',m=>m.runs.pop()],['duplicate slot',m=>m.runs[1]=copy(m.runs[0])],['running sentinel',m=>{m.runs[11].state='running';m.runs[11].processStatus=null;m.activeRun={repeat:3};}],['reused cold session',m=>{for(const r of m.runs)r.session='one';}],['alternation changed',m=>{[m.runs[4],m.runs[6]]=[m.runs[6],m.runs[4]];}],['fixture drift',m=>m.runs[0].fixtureSha256=h('f')],['retained failure',m=>m.failure={reason:'failed'}]])test('no medians for '+name,()=>{const{m,reports}=series();change(m);assert.equal(validateOrdinarySeries(m).ok,false);assert.equal(summarizeOrdinary(m,reports).groups,null);});
test('stored finite timing cannot replace the actual raw timing',()=>{const{m,reports}=series();m.runs[0].controlMs+=1;assert.equal(summarizeOrdinary(m,reports).ok,false);});
test('raw stage NaN does not disappear into a zero summary',()=>{const{m,reports}=series();reports[m.runs[0].report].result.report.rows[0].windowMs=NaN;assert.equal(summarizeOrdinary(m,reports).ok,false);});
test('ACTUAL retained attempt01 gate-pin overwrite rejects; explicitly synthetic protocol correction accepts without changing runtime raw',()=>{
 const archive=new URL('../docs/measurements/landpackage-2026-11-02/ordinary12-attempt01/',import.meta.url);
 const read=file=>fs.readFileSync(new URL(file,archive),'utf8');
 const manifestText=read('manifest.json'),actualManifest=JSON.parse(manifestText),actualAttempt=actualManifest.runs[0];
 const rawText=read('runs/1-generated-cold/raw.json'),smokeText=read('runs/1-generated-cold/run.json'),actualSmoke=JSON.parse(smokeText);
 const gateBody=read('measured-harness/tools/startup-report.mjs'),gatePin=actualManifest.harness.find(row=>row.file==='tools/startup-report.mjs');
 assert.equal(actualManifest.state,'failed');assert.match(actualManifest.failure.message,/actual gate body differs/);
 assert.equal(actualAttempt.state,'failed');assert.equal(actualAttempt.ok,false);assert.equal(actualAttempt.processStatus,0);assert.equal(JSON.parse(rawText).ok,true);
 assert.equal(hash(rawText),actualAttempt.reportSha256);assert.equal(hash(smokeText),actualAttempt.smokeRecordSha256);assert.equal(hash(gateBody),gatePin.sha256);
 assert.deepEqual(actualSmoke.gate,{ok:true,reasons:[]});
 const context={variant:'generated',catalog:actualManifest.catalogBody,config:actualManifest.config,repo:actualAttempt.command[1].slice(0,-'/tools/land-package-smoke.mjs'.length),electron:actualManifest.electron,tools:Object.fromEntries(actualManifest.harness.map(row=>[row.file,row.sha256])),platform:actualManifest.host.platform};
 const old=validateOrdinaryAttempt(actualAttempt,rawText,smokeText,context);assert.deepEqual(old,{ok:false,reasons:['actual gate body differs']});
 // Counterfactual metadata ONLY. This is not a new observation or an attempt01 reclassification.
 const syntheticProtocolCorrect=copy(actualSmoke);syntheticProtocolCorrect.syntheticProtocolCorrect={notActualRun:true,reason:'Preserve measured gate pin separately from startup validation'};
 syntheticProtocolCorrect.startupValidation=copy(actualSmoke.gate);syntheticProtocolCorrect.gate={file:gatePin.file,sha256:gatePin.sha256};
 const syntheticText=JSON.stringify(syntheticProtocolCorrect),syntheticAttempt={...actualAttempt,smokeRecordSha256:hash(syntheticText),syntheticProtocolCorrect:true};
 assert.equal(validateOrdinaryAttempt(syntheticAttempt,rawText,syntheticText,context).ok,true);
 assert.equal(hash(rawText),actualAttempt.reportSha256);assert.equal(actualManifest.state,'failed');assert.equal(actualAttempt.state,'failed');
 assert.equal(validateOrdinarySeries(actualManifest).ok,false);assert.equal(summarizeOrdinary(actualManifest,{}).groups,null);
 assert.equal(read('manifest.json'),manifestText);assert.equal(read('runs/1-generated-cold/run.json'),smokeText);assert.equal(read('runs/1-generated-cold/raw.json'),rawText);
});
console.log(JSON.stringify({ok:true,checks,ordinaryOnly:true,realPilotWitness:true,noAssetReads:true,noProcesses:true}));
