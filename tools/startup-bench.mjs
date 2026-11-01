/* №17ж/17а. Existing sequential runner; --comparison-config opts into matched same-build generated/cache pairs.
   No build/export/retry is launched here. A comparison is a separate root-authorized invocation after acceptance. */
import fs from 'node:fs';
import { validateStartupReport,validateStartupVariant,validateStartupComparisonConfig,validateStartupCommand,startupInputIdentityKey } from './startup-report.mjs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const arg=(key,fallback)=>process.argv.slice(2).find(a=>a.startsWith('--'+key+'='))?.slice(key.length+3)??fallback;
if(arg('ordinary-config')){
 if(arg('comparison-config')||arg('dir')||arg('sha')||arg('pilot-report')||arg('harness-patch'))throw Error('Ordinary config cannot be combined with legacy runner options');
 const {runOrdinaryBench}=await import('./startup-ordinary.mjs');
 runOrdinaryBench({configFile:arg('ordinary-config'),out:arg('out')});
}else{
const dir=arg('dir'),sha=arg('sha'),out=path.resolve(arg('out','/tmp/bird-startup17-report'));
if(!dir||!sha)throw Error('--dir immutable build and --sha recorded source revision are required');
if(!fs.existsSync(path.join(dir,'index.html')))throw Error('Build directory has no index.html');
const hash=b=>createHash('sha256').update(b).digest('hex');
const comparisonFile=arg('comparison-config');
let comparison=null,landManifest=null,initFile='tools/probe-checks/startup-bootstrap-observe.js',initSha256=null;
let pilotFile=arg('pilot-report');
if(comparisonFile){
 if(fs.existsSync(path.join(out,'manifest.json')))throw Error('Comparison output already contains an attempt; use a new directory without retry');
 const configPath=path.resolve(comparisonFile),configBytes=fs.readFileSync(configPath),config=JSON.parse(configBytes);
 const gate=validateStartupComparisonConfig(config);if(!gate.ok)throw Error('Comparison config: '+gate.reasons.join('; '));
 const resolve=file=>path.resolve(path.dirname(configPath),file),manifestFile=resolve(config.manifestFile),manifestBytes=fs.readFileSync(manifestFile);
 const {verifyManifest}=createRequire(import.meta.url)('./land-cache-host.cjs');
 landManifest=verifyManifest({manifestFile,dist:path.resolve(dir),repo:process.cwd()});
 if(landManifest.manifestHash!==config.manifestHash||landManifest.seed!==7)throw Error('Shared comparison manifest/seed differs');
 const inputsGate=validateStartupComparisonConfig(config,{manifest:landManifest});if(!inputsGate.ok)throw Error('Case input metadata: '+inputsGate.reasons.join('; '));
 const assets=Object.fromEntries(Object.entries(config.assets).map(([label,asset])=>{
  const file=resolve(asset.file),stat=fs.statSync(file),limit=(landManifest.limits?.maxPayloadBytes||128*1024*1024)+(landManifest.limits?.maxHeaderBytes||4*1024*1024)+20;
  if(!stat.isFile()||stat.size<=0||stat.size>limit)throw Error('Invalid explicit cache asset metadata: '+label);
  return[label,{file,sha256:asset.sha256,bytes:stat.size,identity:asset.identity,identitySha256:hash(startupInputIdentityKey(asset.identity))}];
 }));
 const pilots={};
 for(const variant of ['generated','cache']){
  const expected=config.pilots[variant],file=resolve(expected.report),bytes=fs.readFileSync(file);
  if(hash(bytes)!==expected.sha256)throw Error('Pilot SHA mismatch: '+variant);
  const validation=validateStartupVariant(JSON.parse(bytes),{variant,label:config.pilotCase,manifest:landManifest,asset:assets[config.pilotCase]});
  if(!validation.ok)throw Error('Invalid matched '+variant+' pilot: '+validation.reasons.join('; '));
  pilots[variant]={report:file,sha256:expected.sha256,validation};
 }
 const patchFile=arg('harness-patch');if(!patchFile)throw Error('--harness-patch=exact applied comparison patch is required');
 const patchBytes=fs.readFileSync(path.resolve(patchFile));
 // One full content preflight before any measured process. Never read/hash cache assets here.
 verifyManifest({manifestFile,dist:path.resolve(dir),repo:process.cwd(),full:true});
 fs.mkdirSync(out,{recursive:true});
 const copiedManifest=path.join(out,'comparison-input-manifest.json');fs.writeFileSync(copiedManifest,manifestBytes);
 const copiedConfig=path.join(out,'comparison-config.json');fs.writeFileSync(copiedConfig,configBytes);
 const copiedPatch=path.join(out,'comparison-harness.patch');fs.writeFileSync(copiedPatch,patchBytes);
 const observer=fs.readFileSync('tools/probe-checks/startup-bootstrap-observe.js','utf8');
 const init='Object.defineProperty(window,"__landExport17aManifest",{value:'+JSON.stringify(landManifest)+',writable:false,configurable:false});\n'+observer;
 initFile=path.join(out,'comparison-init.js');fs.writeFileSync(initFile,init);initSha256=hash(init);
 for(const variant of ['generated','cache']){const copy=path.join(out,'comparison-pilot-'+variant+'.json');fs.copyFileSync(pilots[variant].report,copy);pilots[variant]={...pilots[variant],originalReport:pilots[variant].report,report:copy};}
 comparison={version:1,expectedRuns:36,pilotCase:config.pilotCase,assets,pilots,configFile:copiedConfig,originalConfigFile:configPath,configSha256:hash(configBytes),
  manifestFile:copiedManifest,originalManifestFile:manifestFile,manifestFileSha256:hash(manifestBytes),manifestHash:landManifest.manifestHash,sourceHash:landManifest.sourceHash,buildHash:landManifest.buildHash,
  mapHash:landManifest.mapHash,editsHash:landManifest.editsHash,mapId:landManifest.mapId,seed:landManifest.seed,initFile,initSha256,
  harnessPatch:{file:copiedPatch,sha256:hash(patchBytes)},fullPreflight:{once:true,sourceHash:landManifest.sourceHash,buildHash:landManifest.buildHash,cacheAssetsRead:false}};
 pilotFile=pilots.generated.report;
}else{
 if(!pilotFile)throw Error('--pilot-report from one valid pilot is required before the 18-run series');
 const pilot=JSON.parse(fs.readFileSync(path.resolve(pilotFile),'utf8'));
 if(!validateStartupReport(pilot,{requireGuardV2:true}).ok)throw Error('Pilot report is not complete/valid; series was not started');
}
fs.mkdirSync(out,{recursive:true});
const common={'dlv-lang':'ru','dlv-sound':false};
const mature={'dlv-msk-guide':1,'dlv-msk-tut':'1','dlv-msk-nostut':1,'dlv-shift-tut':1,'dlv-msk-wallet':30000,
 'dlv-shifts':40,'dlv-city-party':true,'dlv-city-mode':false,'dlv-dist-open':8,'dlv-dist-shifts':[4,5,5,6,6,7,7,0]};
const cases=[['newbie',{...common},0,true],['saved-near',{...common,...mature,'dlv-district':0},0,false],['saved-far',{...common,...mature,'dlv-district':7},7,false]];
const sourceFiles=['src/main.js','src/game/menu.js','src/game/progressboot.js','src/game/game.js','src/game/latebuild.js','src/game/landcleanpool.js','src/game/landclean.worker.js','src/game/landstream.js','src/game/startuptrace.js','tools/probe.cjs','tools/probe-checks/startup-ready.js','tools/probe-checks/startup-bootstrap-observe.js','tools/startup-bench.mjs','tools/startuptrace-test.mjs','tools/startup-report.mjs','tools/startup-revalidate.mjs',...(comparison?['tools/land-cache-host.cjs']:[])];
const copies=path.join(out,'source');
const source=sourceFiles.map(file=>{const bytes=fs.readFileSync(file),copy=path.join(copies,file);fs.mkdirSync(path.dirname(copy),{recursive:true});fs.writeFileSync(copy,bytes);return{file,sha256:hash(bytes),bytes:bytes.length,copy};});
const buildFiles=[];function tree(base,rel=''){for(const e of fs.readdirSync(path.join(base,rel),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const name=path.join(rel,e.name);if(e.isDirectory())tree(base,name);else{const bytes=fs.readFileSync(path.join(base,name));buildFiles.push({file:name,sha256:hash(bytes),bytes:bytes.length});}}}
if(comparison)buildFiles.push(...landManifest.buildFiles.map(row=>({file:row.path,sha256:row.sha256,bytes:row.bytes})));else tree(dir);
fs.writeFileSync(path.join(out,'build-tree.json'),JSON.stringify(buildFiles,null,2));
const harness=source.filter(row=>row.file.startsWith('tools/')).map(({file,sha256,bytes,copy})=>({file,sha256,bytes,copy}));
const harnessSha256=hash(JSON.stringify(harness.map(({file,sha256,bytes})=>({file,sha256,bytes}))));
const manifest={version:comparison?3:2,source,buildTree:{file:path.join(out,'build-tree.json'),sha256:hash(JSON.stringify(buildFiles))},indexSha256:comparison?buildFiles.find(row=>row.file==='index.html')?.sha256:hash(fs.readFileSync(path.join(dir,'index.html'))),sha,pilotReport:path.resolve(pilotFile),dir:path.resolve(dir),date:new Date().toISOString(),host:{os:os.release(),arch:os.arch(),cpu:os.cpus()[0]?.model,cores:os.cpus().length,memBytes:os.totalmem()},
 conditions:{mode:'steam',size:'1280x800',gfx:'high',cpuThrottle:3,seed:7,cache:'cold empty owned Chromium session; warm process restart on same session; OS/driver caches uncontrolled',physicalDeck:false},...(comparison?{comparison,harness,harnessSha256}:{}),runs:[]};
if(comparison)manifest.conditions.timing='controlMs uses renderer navigation origin; processToControlMs is recorded separately; full preflight occurs once outside measured processes';
const save=()=>fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
const median=a=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)];
save();
try{
 for(const[label,fixture,district,fresh]of cases)for(let repeat=1;repeat<=3;repeat++){
  const variants=comparison?(repeat%2?['generated','cache']:['cache','generated']):['generated'];
  const file=path.join(out,label+'-'+repeat+'-fixture.json'),fixtureBytes=JSON.stringify(fixture);fs.writeFileSync(file,fixtureBytes);const fixtureSha256=hash(fixtureBytes);
  for(const variant of variants){
   const session='b17-'+randomUUID();
   for(const phase of ['cold','warm']){
    const report=path.join(out,label+'-'+repeat+'-'+(comparison?variant+'-':'')+phase+'.json');
    const args=['run','probe','--','--mode=steam','--dir='+path.resolve(dir),'--startup-trace','--startup-session='+session,
     '--startup-fixture='+file,'--init-script='+initFile,'--early','--bootcpu','--cpu=3','--seed=7','--size=deck','--bootwait=300','--timeout=420',
     '--q=gfx=high&gfxdev=deck&mute&startupdistrict='+district+(comparison&&variant==='cache'?'&landcache=1':''),'--eval=tools/probe-checks/startup-ready.js','--max=0','--report='+report];
    if(fresh)args.push('--fresh');if(phase==='cold')args.push('--startup-cold');
    const asset=comparison?.assets[label];
    if(comparison){args.push('--land-export-manifest='+comparison.manifestFile);if(variant==='cache')args.push('--land-cache-file='+asset.file,'--land-cache-sha='+asset.sha256);}
    const record={label,repeat,phase,...(comparison?{variant,variantOrder:variants,initFile,initSha256,sourceManifest:comparison.manifestFile,manifestFileSha256:comparison.manifestFileSha256,manifestHash:comparison.manifestHash,sourceHash:comparison.sourceHash,buildHash:comparison.buildHash,configSha256:comparison.configSha256,harnessSha256,harnessPatchSha256:comparison.harnessPatch.sha256,cacheAsset:asset.file,cacheAssetBytes:asset.bytes,expectedInputIdentitySha256:asset.identitySha256,expectedCacheSha256:asset.sha256,pilotHashes:Object.fromEntries(Object.entries(comparison.pilots).map(([key,value])=>[key,value.sha256]))}:{}),command:['npm',...args],fixture:file,fixtureSha256,report,session,state:'running',reason:'Attempt has not completed; an interrupted runner never retries it automatically',startedAt:new Date().toISOString(),status:null,processStatus:null,signal:null};
    manifest.runs.push(record);manifest.activeRun={label,repeat,variant,phase};save();
    console.log('START '+label+' '+repeat+' '+(comparison?variant+' ':'')+phase);
    const started=Date.now(),result=spawnSync('npm',args,{encoding:'utf8',maxBuffer:32*1024*1024,env:process.env});
    Object.assign(record,{wallMs:Date.now()-started,status:result.status,processStatus:result.status,signal:result.signal||null,spawnError:result.error?.message||null});
    fs.writeFileSync(report+'.stdout.log',result.stdout||'');fs.writeFileSync(report+'.stderr.log',result.stderr||'');
    try{
     const raw=fs.readFileSync(report);record.reportSha256=hash(raw);const value=JSON.parse(raw);
     record.validation=comparison?validateStartupVariant(value,{variant,label,manifest:landManifest,asset}):validateStartupReport(value,{requireDistrict:true,expectedDistrict:district,requireGuardV2:true});
     if(comparison){const commandGate=validateStartupCommand(record,{comparison,dir:path.resolve(dir)});record.validation={ok:record.validation.ok&&commandGate.ok,reasons:[...record.validation.reasons,...commandGate.reasons]};}
     record.ok=result.status===0&&!result.signal&&!result.error&&record.validation.ok;
     const data=value.result,trace=data?.report,host=data?.host;
     record.controlMs=trace?.marks?.['first.control']?.at;record.processToControlMs=host?trace.clock.timeOrigin+record.controlMs-host.processEpochMs:null;record.fromClickMs=data?.firstControlFromClickMs;
     record.district=data?.district;record.resourceCapture=trace?.resourceCapture;record.resourceIO=trace?.resourceCapture?.totalCount?'available ResourceTiming; timings do not separate parse/evaluate':'unavailable for app://; zero records is not zero I/O';record.dropped=trace?.dropped;record.flags=trace?.flags;record.failed=!!Object.keys(trace?.flags||{}).some(key=>/error|fallback|rejected/i.test(key));
     if(comparison){record.cache=data?.cache||null;record.cacheFailure=value.landCacheFailure||null;}
     record.reason=record.ok?null:[result.error?.message,result.signal,value.landCacheFailure?.reason,value.evalErr,...record.validation.reasons].filter(Boolean).join('; ')||'Nonzero process status';
    }catch(error){record.ok=false;record.reason='Raw report missing/invalid: '+error.message;}
    record.state=record.ok?'complete':'failed';manifest.activeRun=null;save();
    console.log((record.ok?'PASS ':'FAIL ')+label+' '+repeat+' '+(comparison?variant+' ':'')+phase+' control='+record.controlMs+' click='+record.fromClickMs);
    if(result.status!==0||!record.ok||record.failed||record.dropped)throw Error('Failed startup run retained without retry: '+report+'; '+record.reason);
   }
   const owned=path.join(os.tmpdir(),'bird-probe','startup17-'+session),seal=path.join(owned,'.startup17-owned');
   if(fs.existsSync(seal)&&fs.readFileSync(seal,'utf8')==='bird-startup17-v1')fs.rmSync(owned,{recursive:true,force:true});
  }
 }
}catch(error){manifest.failure={reason:error.message,activeRun:manifest.activeRun,at:new Date().toISOString()};save();throw error;}
manifest.summary=cases.flatMap(([label])=>(comparison?['generated','cache']:[null]).flatMap(variant=>['cold','warm'].map(phase=>{
 const completed=manifest.runs.filter(row=>row.label===label&&row.phase===phase&&(!comparison||row.variant===variant)&&row.ok===true&&row.state==='complete'&&!row.failed),values=completed.map(row=>row.controlMs);
 const processValues=completed.map(row=>row.processToControlMs),clickValues=completed.map(row=>row.fromClickMs);
 return{label,...(comparison?{variant}:{}),phase,n:values.length,valuesMs:values,medianMs:values.length===3?median(values):null,...(comparison?{processToControlValuesMs:processValues,medianProcessToControlMs:processValues.length===3&&processValues.every(Number.isFinite)?median(processValues):null,fromClickValuesMs:clickValues,medianFromClickMs:clickValues.length===3&&clickValues.every(Number.isFinite)?median(clickValues):null}:{})};
})));
save();console.log(JSON.stringify(manifest.summary));
}
