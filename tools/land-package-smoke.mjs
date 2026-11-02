/* One ordinary startup admission, reused locally and before release. Not a timing-series aggregator. */
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {validateStartupReport} from './startup-report.mjs';
import {sha256,newExternalPath} from './land-package-files.mjs';
import {checkCatalog} from '../src/game/landdata/land-package-catalog.js';
import {need,assertOrdinaryEDL} from '../src/game/landdata/land-package-key.js';
import {smokeDistrictFromArgs,selectSmokeCoverage,assertSmokeDistrict} from './land-package-smoke-gate.mjs';

const arg=(key,fallback)=>process.argv.slice(2).find(v=>v.startsWith('--'+key+'='))?.slice(key.length+3)??fallback;
const {admissionSettings}=createRequire(import.meta.url)('./startup-admission.cjs');
const admission=admissionSettings(arg('admission','early'));
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.resolve(arg('dir','dist/steam'));
const variant=arg('variant','cache'),preset=arg('preset','high'),phase=arg('phase','cold'),cpu=Number(arg('cpu','1'));
const district=smokeDistrictFromArgs(process.argv.slice(2),{preset,fixture:arg('fixture')});
const out=newExternalPath(repo,arg('out',path.join(process.env.RUNNER_TEMP||'/tmp','bird-land-smoke-'+randomUUID())));
fs.mkdirSync(out,{recursive:true});
need(['cache','generated'].includes(variant)&&['mid','high'].includes(preset)&&['cold','warm'].includes(phase)&&Number.isFinite(cpu)&&cpu>=1,'SMOKE_CONDITIONS');
need(phase!=='warm'||arg('session'),'WARM_REQUIRES_EXPLICIT_SESSION');
const fixtureFile=arg('fixture',path.join(out,'fixture.json'));
if(!arg('fixture')){const fixture={'dlv-lang':'ru','dlv-sound':false};if(preset==='high')fixture['dlv-gfx']={deck:{p:'high',rv:2}};fs.writeFileSync(fixtureFile,JSON.stringify(fixture),{flag:'wx'});}
// Node admission reads the verified external catalog; Electron alone resolves a path inside app.asar.
const catalogFile=path.resolve(arg('catalog',path.join(dist,'city-data/catalog.json')));
const catalog=checkCatalog(JSON.parse(fs.readFileSync(catalogFile,'utf8')));
const selectedCoverage=variant==='cache'?selectSmokeCoverage(catalog,{district,preset}):null;
const report=path.join(out,'raw.json'),electron=createRequire(path.join(repo,'package.json'))('electron');
const args=[path.join(repo,'tools/probe.cjs'),...(process.platform==='linux'?['--no-sandbox','--disable-gpu-sandbox']:[]),
 '--mode=steam','--dir='+dist,'--startup-trace','--startup-session='+arg('session','lp17b-'+randomUUID()),
 ...(phase==='cold'?['--startup-cold']:[]),'--startup-fixture='+path.resolve(fixtureFile),'--fresh',...(admission.early?['--early']:['--startup-admission=settled']),'--size=deck','--cpu='+cpu,'--bootcpu',
 '--init-script='+path.join(repo,'tools/probe-checks/startup-bootstrap-observe.js'),
 '--q=gfxdev=deck&mute&startupdistrict='+district+(variant==='generated'?'&landpackage=0':''),
 '--eval='+path.join(repo,'tools/probe-checks/startup-ready.js'),'--bootwait='+admission.bootWaitSec,'--timeout='+admission.probeTimeoutSec,'--max=0','--errors','--report='+report];
const record={version:1,variant,preset,district,coverageSlot:selectedCoverage?.slot??null,phase,cpu,schedule:admission,argv:[electron,...args],startedAt:new Date().toISOString(),fixtureFile:path.resolve(fixtureFile),fixtureSha256:sha256(fs.readFileSync(fixtureFile)),catalogFile,catalogSha256:sha256(fs.readFileSync(catalogFile)),processStatus:null,signal:null};
for(const [label,file]of Object.entries({probe:'tools/probe.cjs',eval:'tools/probe-checks/startup-ready.js',observer:'tools/probe-checks/startup-bootstrap-observe.js',gate:'tools/startup-report.mjs',admission:'tools/land-package-smoke.mjs',admissionSettings:'tools/startup-admission.cjs',districtGate:'tools/land-package-smoke-gate.mjs'})){record[label]={file,sha256:sha256(fs.readFileSync(path.join(repo,file)))};}
need(record.schedule.mode===admission.mode&&typeof record.admission.sha256==='string','SMOKE_SCHEDULE_RECORD');
const save=()=>fs.writeFileSync(path.join(out,'run.json'),JSON.stringify(record,null,2));save();
const stdout=fs.openSync(path.join(out,'stdout.log'),'wx'),stderr=fs.openSync(path.join(out,'stderr.log'),'wx');
try{
 const child=spawn(electron,args,{cwd:repo,env:{...process.env},stdio:['ignore',stdout,stderr]});record.pid=child.pid;save();
 const timer=setTimeout(()=>child.kill('SIGKILL'),admission.hardTimeoutMs);
 const status=await new Promise(resolve=>{child.once('error',error=>{record.spawnError=String(error);resolve({code:null,signal:null});});child.once('close',(code,signal)=>resolve({code,signal}));});clearTimeout(timer);
 record.processStatus=status.code;record.signal=status.signal;record.finishedAt=new Date().toISOString();save();
 need(status.code===0&&!status.signal&&!record.spawnError,'SMOKE_PROCESS');
 const bytes=fs.readFileSync(report),value=JSON.parse(bytes),r=value.result;
 record.rawSha256=sha256(bytes);
 const gate=validateStartupReport(value,{expectedDistrict:district,requireDistrict:true,requireGuardV2:true});record.startupValidation=gate;need(gate.ok,'SMOKE_STARTUP_'+gate.reasons.join(','));
 assertOrdinaryEDL(r.rng);need(r.host?.seed===null&&r.host.cpuThrottle===cpu&&r.host.bootcpu===true,'SMOKE_ORDINARY_HOST');
 if(!admission.early)need(r.host?.admission?.mode==='settled'&&r.host.admission.controlWaitMs===admission.controlWaitMs&&r.startConditions?.state==='title'&&r.startConditions.queueBusy===false&&r.startConditions.bootFull&&Number.isFinite(r.startConditions.queueFullAt)&&r.startConditions.preexistingControl===false,'SMOKE_SETTLED_START');
 need(r.conditions?.graphics?.preset===preset&&r.conditions.graphics.device==='deck'&&r.conditions.graphics.width===1280&&r.conditions.graphics.height===800,'SMOKE_GRAPHICS');
 const matchedCoverage=assertSmokeDistrict(r,{district,preset,variant,catalog});
 const c=r.landPackage,count=r.report.counters['raisedland.cleanCalls'];
 if(variant==='cache'){
  const entry=matchedCoverage.entry;
  need(c?.source==='cache'&&c.hit===true&&c.phase==='restored'&&c.fatal===false&&!c.reason&&c.cleaned===true&&c.bufferHeld===false&&count===0&&entry,'SMOKE_CACHE_HIT');
  need(c.wireSha256===entry.sha256&&c.expectedWireSha256===entry.sha256&&c.rawSha256===entry.rawSha256&&c.expectedRawSha256===entry.rawSha256&&c.bytes===entry.bytes&&c.encoding===entry.encoding,'SMOKE_CACHE_CONTENT');
  need(r.report.rows.every(row=>row.workerWorkMs===0&&row.workerBatches===0)&&!r.report.rows.some(row=>/cleanContours/.test(row.name)&&row.steps>0),'SMOKE_NO_CLEAN_WORK');
 }else need(c===null&&count===1,'SMOKE_GENERATED');
 need(['raisedland.activate','raisedland.alignObjects'].every(name=>r.report.rows.find(row=>row.name===name)?.steps===1),'SMOKE_ACTIVATE_ALIGN');
 record.ok=true;record.controlMs=r.report.marks['first.control'].at;record.fromClickMs=r.firstControlFromClickMs;record.moved=r.moved;record.cache=c;save();
 console.log(JSON.stringify({ok:true,out,variant,preset,district,controlMs:record.controlMs,moved:r.moved,source:c?.source||'generated'}));
}catch(error){record.ok=false;record.failure=String(error?.stack||error);save();console.error(record.failure);process.exitCode=1;}
finally{fs.closeSync(stdout);fs.closeSync(stderr);}
