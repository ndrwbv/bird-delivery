/* Ordinary12 orchestration only. Explicit invocation; no build/export/retry/resume. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {captureSource,captureBuild,newExternalPath} from './land-package-files.mjs';
import {canonical} from '../src/game/landdata/land-package-key.js';
import {ordinaryHash as hash,validateOrdinaryConfig,validateOrdinaryReport,validateOrdinaryAttempt,validateOrdinarySeries,summarizeOrdinary} from './startup-ordinary-gate.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const need=(v,why)=>{if(!v)throw Error('startup-ordinary:'+why);};
const harnessFiles=['tools/startup-bench.mjs','tools/startup-ordinary.mjs','tools/startup-ordinary-gate.mjs','tools/startup-report.mjs','tools/land-package-smoke.mjs','tools/land-package-files.mjs','tools/land-package-source-key.mjs','tools/land-package-build.mjs','tools/probe.cjs','tools/probe-page.cjs','tools/probe-build.cjs','tools/probe-checks/startup-ready.js','tools/probe-checks/startup-bootstrap-observe.js'];
export function runOrdinaryBench({configFile,out}){
 need(configFile&&out,'--ordinary-config and explicit --out required');
 const configPath=path.resolve(configFile),configBytes=fs.readFileSync(configPath),config=JSON.parse(configBytes),resolve=file=>path.resolve(path.dirname(configPath),file);
 const basic=validateOrdinaryConfig(config);need(basic.ok,basic.reasons.join('; '));
 config.dir=resolve(config.dir);for(const key of ['fixture','catalog'])config[key].file=resolve(config[key].file);
 for(const v of ['generated','cache'])config.pilots[v].report=resolve(config.pilots[v].report);
 const output=newExternalPath(repo,path.resolve(out));fs.mkdirSync(output,{recursive:true});
 const manifest={version:1,kind:'startup-ordinary',expectedRuns:12,state:'preflight',ok:false,config,configFile:path.join(output,'ordinary-config.json'),configSha256:hash(configBytes),dir:config.dir,sourceHash:config.base.sourceHash,buildHash:config.buildHash,createdAt:new Date().toISOString(),host:{platform:os.platform(),arch:os.arch(),os:os.release(),cpu:os.cpus()[0]?.model,cores:os.cpus().length,memBytes:os.totalmem()},conditions:{case:'newbie',preset:'high',district:0,seed:null,cpuThrottle:3,size:'1280x800',physicalDeck:false,cache:'cold cleared owned Chromium session; warm new process reusing that pair session; OS/driver caches uncontrolled'},runs:[],activeRun:null,summary:null};
 fs.writeFileSync(manifest.configFile,configBytes,{flag:'wx'});
 const save=()=>fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));save();
 const reports={};
 try{
  const catalogBytes=fs.readFileSync(config.catalog.file),fixtureBytes=fs.readFileSync(config.fixture.file);
  need(hash(catalogBytes)===config.catalog.sha256&&hash(fixtureBytes)===config.fixture.sha256,'catalog/fixture SHA mismatch');
  const catalog=JSON.parse(catalogBytes),checked=validateOrdinaryConfig(config,catalog);need(checked.ok,checked.reasons.join('; '));
  const fixture=JSON.parse(fixtureBytes);
  need(canonical(fixture)===canonical({'dlv-lang':'ru','dlv-sound':false,'dlv-gfx':{deck:{p:'high',rv:2}}}),'exact stored-high newbie fixture required');
  manifest.catalogBody=catalog;
  fs.writeFileSync(path.join(output,'catalog.json'),catalogBytes,{flag:'wx'});fs.writeFileSync(path.join(output,'fixture.json'),fixtureBytes,{flag:'wx'});
  manifest.pilots={};
  for(const variant of ['generated','cache']){
   const pin=config.pilots[variant],bytes=fs.readFileSync(pin.report);need(hash(bytes)===pin.sha256,'pilot SHA '+variant);
   const validation=validateOrdinaryReport(JSON.parse(bytes),{variant,catalog});need(validation.ok,'pilot '+variant+': '+validation.reasons.join('; '));
   const copy=path.join(output,'pilot-'+variant+'.json');fs.writeFileSync(copy,bytes,{flag:'wx'});manifest.pilots[variant]={originalReport:pin.report,report:copy,sha256:pin.sha256,validation};
  }
  // Exactly one full source/build body pass, before every measured process. No asset rereads between runs.
  const source=captureSource(repo),build=captureBuild(config.dir);
  need(canonical(source.base)===canonical(config.base),'functional source key differs');need(build.hash===config.buildHash,'immutable build content differs');
  for(const entry of catalog.entries){const file=build.files.find(row=>row.path===entry.path);need(file?.bytes===entry.bytes&&file.sha256===entry.sha256,'build/catalog asset content differs');}
  const sourceFile=path.join(output,'source-receipt.json'),buildFile=path.join(output,'build-tree.json');
  const sourceText=JSON.stringify(source,null,2),buildText=JSON.stringify(build,null,2);fs.writeFileSync(sourceFile,sourceText,{flag:'wx'});fs.writeFileSync(buildFile,buildText,{flag:'wx'});
  manifest.preflight={once:true,sourceHash:source.base.sourceHash,buildHash:build.hash,sourceFile,sourceFileSha256:hash(sourceText),buildFile,buildFileSha256:hash(buildText),completedAt:new Date().toISOString(),assetContentRead:'once, in initial build inventory only; no per-process asset hashes'};
  manifest.harness=harnessFiles.map(file=>{const bytes=fs.readFileSync(path.join(repo,file)),copy=path.join(output,'measured-harness',file);fs.mkdirSync(path.dirname(copy),{recursive:true});fs.writeFileSync(copy,bytes,{flag:'wx'});return{file,sha256:hash(bytes),bytes:bytes.length,copy};});
  manifest.harnessSha256=hash(canonical(manifest.harness.map(({file,sha256,bytes})=>({file,sha256,bytes}))));
  const tools=Object.fromEntries(manifest.harness.map(r=>[r.file,r.sha256]));
  const checkSmallPins=()=>{
   need(hash(fs.readFileSync(configPath))===manifest.configSha256,'config changed during attempt');
   need(hash(fs.readFileSync(config.fixture.file))===config.fixture.sha256&&hash(fs.readFileSync(config.catalog.file))===config.catalog.sha256,'fixture/catalog changed during attempt');
   for(const row of manifest.harness)need(hash(fs.readFileSync(path.join(repo,row.file)))===row.sha256,'harness changed: '+row.file);
  };
  const electron=createRequire(import.meta.url)('electron');manifest.electron=electron;manifest.state='running';save();
  for(let repeat=1;repeat<=3;repeat++){
   const variants=repeat%2?['generated','cache']:['cache','generated'];
   for(const variant of variants){const session='ordinary17-'+randomUUID();
    for(const phase of ['cold','warm']){
     checkSmallPins();
     const runDir=path.join(output,'runs',repeat+'-'+variant+'-'+phase),report=path.join(runDir,'raw.json'),smokeRecord=path.join(runDir,'run.json');
     const args=[path.join(repo,'tools/land-package-smoke.mjs'),'--dir='+config.dir,'--catalog='+config.catalog.file,'--fixture='+config.fixture.file,'--out='+runDir,'--preset=high','--variant='+variant,'--phase='+phase,'--cpu=3','--session='+session];
     const record={label:'newbie',repeat,variant,phase,variantOrder:variants,session,runDir,report,smokeRecord,command:[process.execPath,...args],fixture:config.fixture.file,fixtureSha256:config.fixture.sha256,catalogSha256:config.catalog.sha256,configSha256:manifest.configSha256,harnessSha256:manifest.harnessSha256,sourceHash:config.base.sourceHash,buildHash:config.buildHash,state:'running',ok:null,processStatus:null,signal:null,startedAt:new Date().toISOString(),reason:'Unfinished attempt; no automatic retry/resume'};
     manifest.runs.push(record);manifest.activeRun={repeat,variant,phase};save();console.log('START ordinary '+repeat+' '+variant+' '+phase);
     const started=Date.now(),result=spawnSync(process.execPath,args,{cwd:repo,env:process.env,encoding:'utf8',maxBuffer:32*1024*1024,timeout:560000});
     Object.assign(record,{wallMs:Date.now()-started,finishedAt:new Date().toISOString(),processStatus:result.status,signal:result.signal||null,spawnError:result.error?.message||null});
     const stdout=result.stdout||'',stderr=result.stderr||'';fs.mkdirSync(runDir,{recursive:true});fs.writeFileSync(path.join(runDir,'smoke.stdout.log'),stdout);fs.writeFileSync(path.join(runDir,'smoke.stderr.log'),stderr);record.stdoutSha256=hash(stdout);record.stderrSha256=hash(stderr);
     try{
      const rawText=fs.readFileSync(report,'utf8'),smokeText=fs.readFileSync(smokeRecord,'utf8');record.reportSha256=hash(rawText);record.smokeRecordSha256=hash(smokeText);
      const context={variant,catalog,config,repo,electron,tools,platform:os.platform()};record.validation=validateOrdinaryAttempt(record,rawText,smokeText,context);
      const raw=JSON.parse(rawText),r=raw.result,t=r?.report;reports[report]=raw;record.probeCommand=JSON.parse(smokeText).argv;
      record.controlMs=t?.marks?.['first.control']?.at;record.processToControlMs=t?.clock?.timeOrigin+record.controlMs-r?.host?.processEpochMs;record.fromClickMs=r?.firstControlFromClickMs;
      record.resourceCapture=t?.resourceCapture;record.resourceIO=t?.resourceCapture?.totalCount?'available ResourceTiming; import wall is not parse/CPU':'app:// ResourceTiming unavailable; zero records is not zero I/O';
      record.ok=record.validation.ok;record.reason=record.ok?null:record.validation.reasons.join('; ');
     }catch(error){record.ok=false;record.reason='Unreadable/invalid run evidence: '+error.message;}
     record.state=record.ok?'complete':'failed';manifest.activeRun=null;save();
     need(record.ok,'failed attempt retained: '+report+'; '+record.reason);checkSmallPins();console.log('PASS ordinary '+repeat+' '+variant+' '+phase);
    }
   }
  }
  manifest.state='complete';const complete=validateOrdinarySeries(manifest);need(complete.ok,complete.reasons.join('; '));
  const summary=summarizeOrdinary(manifest,reports);need(summary.ok,summary.reasons?.join('; '));manifest.summary=summary;manifest.ok=true;manifest.finishedAt=new Date().toISOString();save();
  fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2),{flag:'wx'});console.log(JSON.stringify({ok:true,runs:12,out:output,sourceHash:config.base.sourceHash,buildHash:config.buildHash}));
  return manifest;
 }catch(error){manifest.ok=false;manifest.state='failed';manifest.summary=null;manifest.failure={message:String(error?.stack||error),at:new Date().toISOString(),activeRun:manifest.activeRun};save();throw error;}
}
