/* One ordinary packaged address admission. Not a timing series or a distribution installer proof. */
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {validateStartupReport} from './startup-report.mjs';
import {assertProductAddressCatalog} from '../src/game/addresspackage17b.js';
import {canonical,assertOrdinaryEDL} from '../src/game/landdata/land-package-key.js';
import {freshAddressPreparationFixture} from './address-package-prepare.mjs';
import {newExternalPath} from './land-package-files.mjs';
const {admissionSettings}=createRequire(import.meta.url)('./startup-admission.cjs');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),need=(ok,code)=>{if(!ok)throw Error('address-smoke:'+code);};
export function parseAddressSmokeArgs(argv){
 const allowed=['dir','out','catalog','preset','admission','variant','init'],values={};
 for(const token of argv){const m=/^--([^=]+)=(.+)$/.exec(token);need(m&&allowed.includes(m[1])&&!Object.hasOwn(values,m[1]),'CLI');values[m[1]]=m[2];}
 need(values.dir&&values.out,'DIR_OUT');const preset=values.preset??'high',variant=values.variant??'cache',admission=values.admission??'settled';
 need(['mid','high'].includes(preset)&&['cache','generated'].includes(variant),'CONDITIONS');admissionSettings(admission);
 return{...values,preset,variant,admission};
}
export function validateAddressRuntimeAdmission(value,{catalog,preset,variant='cache',admission='settled',requireQueries=false}={}){
 const base=validateStartupReport(value,{expectedDistrict:0,requireDistrict:true,requireGuardV2:true}),reasons=[...base.reasons],r=value?.result;
 const add=(ok,why)=>{if(!ok)reasons.push(why);};let checked,slot,schedule;
 const sameIdentity=(a,b)=>!!a&&!!b&&Object.keys(a).sort().join(',')==='editsHash,inputHash,mapHash,mapId,sourceHash'&&['mapId','mapHash','editsHash','sourceHash','inputHash'].every(k=>a[k]===b[k]);
 try{checked=assertProductAddressCatalog(catalog);slot=checked.slots.find(s=>s.graphics===preset);schedule=admissionSettings(admission);}catch(error){reasons.push('catalog/schedule:'+error.message);}
 add(!!slot&&['cache','generated'].includes(variant),'profile/variant');
 const h=r?.host,e=h?.environment,d=r?.address?.details,pre=d?.preVisual,early=d?.early;
 add(r?.protocolVersion===2&&r.noDebugNamespace===true&&r.acceptanceBefore?.testTools===false&&r.acceptanceAfter?.testTools===false,'production namespace/tools');
 add(h?.seed===null&&h.cpuThrottle===1&&h.bootcpu===true&&e?.productionQuery===true&&e.noLanguage===true&&e.deck===true&&typeof h.userAgent?.actual==='string'&&/steam deck/i.test(h.userAgent.actual),'ordinary host environment');
 add(r?.district?.before?.district===0&&r.district.before.opened===1&&r.district.before.city===false&&r.district.before.partySeen===false&&r.district.pickerClicks===0,'fresh first district');
 add(r?.acceptanceBefore?.state==='title'&&!r.acceptanceBefore.firstControl&&r.acceptanceAfter?.state==='drive','real title/control');
 add(r?.conditions?.graphics?.preset===preset&&r.conditions.graphics.device==='deck'&&r.conditions.graphics.width===1280&&r.conditions.graphics.height===800&&r.conditions.physicalDeck===false&&r.conditions.lang==='ru','actual graphics');
 try{const url=new URL(r?.conditions?.url);add(url.protocol==='app:'&&url.pathname==='/index.html'&&url.search===(variant==='cache'?'?mute&startuptrace':'?mute&startuptrace&addresspackage17b=0'),'exact ordinary query');}catch{add(false,'URL');}
 if(schedule?.mode==='settled')add(h?.admission?.mode==='settled'&&h.admission.controlWaitMs===420000&&r.startConditions?.state==='title'&&r.startConditions.bootFull&&Number.isFinite(r.startConditions.queueFullAt)&&r.startConditions.preexistingControl===false,'settled stage');
 try{assertOrdinaryEDL(d?.rng);}catch{add(false,'ordinary EDL');}
 if(variant==='cache'){
  add(d?.input?.eligible===true&&slot&&sameIdentity(d.input.identity,slot.identity)&&d.input.descriptor?.version===2&&d.input.descriptor.profile==='fresh-v1'&&d.input.descriptor.initial?.graphics?.preset===preset,'actual full input identity');
  add(d?.status?.phase==='private-ready'&&d.status.reason===null&&d.provider?.privateReady===true&&d.provider.phase==='sealed'&&d.provider.fatal===false&&d.provider.auditRetained===false,'private publication/replay');
  add(d?.preload?.phase==='consumed'&&d.preload.consumed===true&&d.preload.held===false&&d.preload.reason===null&&d.preload.catalogVersion===2&&d.preload.selectedGraphics===preset,'selected preload profile');
  add(slot&&d?.preload?.wireHash===slot.entry.sha256&&d.preload.wireBytes===slot.entry.bytes,'preload wire bytes/SHA');
  const phase=p=>p?.phase==='before-city-syncBuild'&&Number.isFinite(p.at)&&p.at>=0&&p.at<r?.report?.marks?.['city.syncBuilt']?.at&&['houses','generatedDoors','spots','rawEntrances'].every(k=>Number.isSafeInteger(p.before?.[k])&&p.before[k]>=0&&p.before[k]===p.after?.[k])&&['houses','generatedDoors','spots'].every(k=>p.before[k]===0);
  add(phase(pre)&&pre.lateWorkStarted===false&&pre.inputHash===slot?.identity.inputHash&&phase(early)&&early.provider?.privateReady===true,'previsual unchanged empty live arrays');
 }else add(d?.provider===null&&d.preload?.held===false&&d.preload.wireHash===null&&d.preload.wireBytes===0&&d.status?.phase==='generated','explicit generated off/no retained data');
 if(d?.preLate)add(d.preLate.phase==='city-pizzeria-before-late'&&d.preLate.district===0&&d.preLate.pizzaIndex===0&&d.preLate.lateWorkStarted===false&&['x','z','bx','bz'].every(k=>Number.isFinite(d.preLate.pizza?.[k])&&Object.is(d.preLate.pizza[k],r.district?.pizza?.[k])),'physical pre-late pizzeria');
 if(requireQueries)add(r?.address?.queryProof?.checked===true&&r.address.queryProof.matched===true&&early?.queries&&r.address.queryProof.sourceRawSha256===early.queries.sourceRawSha256,'exact early/legacy queries');
 return{ok:reasons.length===0,reasons};
}
async function main(){
 const options=parseAddressSmokeArgs(process.argv.slice(2)),repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.resolve(options.dir),out=newExternalPath(repo,options.out);
 fs.mkdirSync(out,{recursive:true});const schedule=admissionSettings(options.admission),catalogFile=path.resolve(options.catalog??path.join(dist,'address-data/catalog.json'));
 need(fs.statSync(catalogFile).size<=65536,'CATALOG_BUDGET');const catalogBytes=fs.readFileSync(catalogFile),catalog=assertProductAddressCatalog(JSON.parse(catalogBytes));
 const fixtureFile=path.join(out,'fixture.json');fs.writeFileSync(fixtureFile,JSON.stringify(freshAddressPreparationFixture(options.preset)),{flag:'wx'});
 const init=path.resolve(options.init??path.join(repo,'tools/probe-checks/startup-bootstrap-observe.js'));need(fs.statSync(init).size<=40*1024*1024,'INIT_BUDGET');
 const report=path.join(out,'raw.json'),electron=createRequire(path.join(repo,'package.json'))('electron'),session='addr17b-'+randomUUID();
 const args=[path.join(repo,'tools/probe.cjs'),...(process.platform==='linux'?['--no-sandbox','--disable-gpu-sandbox']:[]),'--mode=steam','--dir='+dist,'--startup-trace','--startup-session='+session,'--startup-cold','--startup-fixture='+fixtureFile,'--fresh','--startup-production-query','--startup-deck',...(schedule.early?['--early']:['--startup-admission=settled']),'--size=deck','--cpu=1','--bootcpu','--init-script='+init,...(options.variant==='generated'?['--q=addresspackage17b=0']:[]),'--eval='+path.join(repo,'tools/probe-checks/address-package-ready.js'),'--bootwait='+schedule.bootWaitSec,'--timeout='+schedule.probeTimeoutSec,'--max=0','--errors','--report='+report];
 const harnessFiles=['tools/address-package-smoke.mjs','tools/probe-checks/address-package-ready.js','tools/address-package-prepare.mjs','tools/probe.cjs','tools/probe-page.cjs','tools/startup-report.mjs','tools/startup-admission.cjs','tools/startup-environment.cjs','tools/probe-checks/startup-bootstrap-observe.js'];
 const harness=()=>harnessFiles.map(file=>({file,sha256:sha(fs.readFileSync(path.join(repo,file)))}));
 const record={version:1,kind:'ordinary-address-runtime-admission',variant:options.variant,preset:options.preset,session,schedule,scope:{kind:'supplied Steam directory/ASAR body; not installer/distribution or timing comparison',packagedAsarPath:/[\\/]app\.asar[\\/]/.test(dist)},argv:[electron,...args],dist,startedAt:new Date().toISOString(),status:'running',processStatus:null,signal:null,fixtureFile,fixtureSha256:sha(fs.readFileSync(fixtureFile)),catalogFile,catalogSha256:sha(catalogBytes),initFile:init,initSha256:sha(fs.readFileSync(init)),harness:harness()};
 const save=()=>fs.writeFileSync(path.join(out,'run.json'),JSON.stringify(record,null,2));save();
 const stdout=fs.openSync(path.join(out,'stdout.log'),'wx'),stderr=fs.openSync(path.join(out,'stderr.log'),'wx');let timer;
 try{
  const child=spawn(electron,args,{cwd:repo,env:{...process.env},stdio:['ignore',stdout,stderr]});record.pid=child.pid;save();timer=setTimeout(()=>child.kill('SIGKILL'),schedule.hardTimeoutMs);
  const status=await new Promise(resolve=>{child.once('error',error=>{record.spawnError=String(error);resolve({code:null,signal:null});});child.once('close',(code,signal)=>resolve({code,signal}));});
  record.processStatus=status.code;record.signal=status.signal;record.status='returned';record.finishedAt=new Date().toISOString();clearTimeout(timer);
  record.stdoutSha256=sha(fs.readFileSync(path.join(out,'stdout.log')));record.stderrSha256=sha(fs.readFileSync(path.join(out,'stderr.log')));save();
  let bytes;if(fs.existsSync(report)){record.reportBytes=fs.statSync(report).size;if(record.reportBytes<=64*1024*1024){bytes=fs.readFileSync(report);record.rawSha256=sha(bytes);}}save();
  need(status.code===0&&!status.signal&&!record.spawnError,'PROCESS');need(canonical(harness())===canonical(record.harness)&&sha(fs.readFileSync(init))===record.initSha256&&sha(fs.readFileSync(catalogFile))===record.catalogSha256,'HARNESS_OR_INPUT_CHANGED');
  need(bytes&&record.reportBytes<=64*1024*1024,'REPORT_BUDGET');const raw=JSON.parse(bytes);
  record.validation=validateAddressRuntimeAdmission(raw,{catalog,preset:options.preset,variant:options.variant,admission:options.admission,requireQueries:!!options.init});need(record.validation.ok,'ADMISSION_'+record.validation.reasons.join(','));
  record.ok=true;record.moved=raw.result.moved;save();console.log(JSON.stringify({ok:true,out,preset:options.preset,variant:options.variant,admission:options.admission,moved:record.moved}));
 }catch(error){record.ok=false;record.failure=String(error?.stack||error);save();console.error(record.failure);process.exitCode=1;}finally{clearTimeout(timer);fs.closeSync(stdout);fs.closeSync(stderr);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
