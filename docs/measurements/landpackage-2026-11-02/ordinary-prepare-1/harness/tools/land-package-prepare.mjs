/* Offline ordinary-EDL preparation. Sequential, fail closed, never retries a failed export. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {finished} from 'node:stream/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {captureSource,writeExportReceipt,sha256,newExternalPath} from './land-package-files.mjs';
import {createCatalog} from '../src/game/landdata/land-package-catalog.js';
import {canonical,need,makeIdentity} from '../src/game/landdata/land-package-key.js';
import {LAND_PACKAGE_LIMITS} from '../src/game/landdata/land-package-config.js';

const arg=key=>process.argv.slice(2).find(value=>value.startsWith('--'+key+'='))?.slice(key.length+3);
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=arg('out');need(output,'REQUIRED_OUT');const out=newExternalPath(repo,output);
fs.mkdirSync(out,{recursive:true});
const journal={version:1,kind:'ordinary-land-preparation',startedAt:new Date().toISOString(),out,runs:[]};
const harnessFiles=['tools/land-package-prepare.mjs','tools/probe.cjs','tools/probe-page.cjs','tools/land-package-export-host.cjs','tools/probe-checks/land-package-export.js'];
const harness=()=>harnessFiles.map(file=>{const bytes=fs.readFileSync(path.join(repo,file));return{file,bytes:bytes.length,sha256:sha256(bytes)};});
journal.harness=harness();
const save=()=>fs.writeFileSync(path.join(out,'preparation.json'),JSON.stringify(journal,null,2));
save();
const env={...process.env};delete env.BIRD_EDITOR;delete env.BIRD_LAND_DATA_DIR;
async function run(label,command,args,timeoutMs){
 need(canonical(harness())===canonical(journal.harness),'PREPARATION_HARNESS_CHANGED');
 const record={label,argv:[command,...args],cwd:repo,startedAt:new Date().toISOString(),status:'running',processStatus:null,signal:null};journal.runs.push(record);save();
 const stdout=fs.createWriteStream(path.join(out,label+'.stdout.log')),
  stderr=fs.createWriteStream(path.join(out,label+'.stderr.log'));
 const child=spawn(command,args,{cwd:repo,env,stdio:['ignore','pipe','pipe']});
 child.stdout.pipe(stdout);child.stderr.pipe(stderr);record.pid=child.pid;save();
 const timer=setTimeout(()=>child.kill('SIGKILL'),timeoutMs);
 try{
  const result=await new Promise(resolve=>{child.once('error',error=>{record.spawnError=String(error);resolve({code:null,signal:null});});child.once('close',(code,signal)=>resolve({code,signal}));});
  record.processStatus=result.code;record.signal=result.signal;record.status='returned';record.finishedAt=new Date().toISOString();
  await Promise.all([finished(stdout),finished(stderr)]);
  record.stdoutSha256=sha256(fs.readFileSync(path.join(out,label+'.stdout.log')));record.stderrSha256=sha256(fs.readFileSync(path.join(out,label+'.stderr.log')));save();
  need(canonical(harness())===canonical(journal.harness),'PREPARATION_HARNESS_CHANGED');
  need(result.code===0&&!result.signal&&!record.spawnError,'PROCESS_FAILED_'+label);
 }finally{clearTimeout(timer);}
}
try{
 const before=captureSource(repo);journal.source=before.base;save();
 const dist=path.join(out,'prepare-steam');
 await run('build',process.execPath,[path.join(repo,'node_modules/vite/bin/vite.js'),'build','--mode','steam','--outDir',dist],240000);
 need(canonical(captureSource(repo))===canonical(before),'SOURCE_CHANGED_DURING_PREPARE_BUILD');
 const receiptFile=path.join(out,'export-receipt.json');
 const receipt=writeExportReceipt({repo,dist,file:receiptFile,limits:LAND_PACKAGE_LIMITS});
 need(receipt.base.sourceHash===before.base.sourceHash,'SOURCE_CHANGED_BEFORE_RECEIPT');
 journal.receiptHash=receipt.receiptHash;save();
 const electron=createRequire(path.join(repo,'package.json'))('electron'),exports=[];
 for(const preset of ['mid','high'])for(const repeat of [1,2]){
  const label=preset+'-'+repeat,fixture={'dlv-lang':'ru','dlv-sound':false};
  if(preset==='high')fixture['dlv-gfx']={deck:{p:'high',rv:2}};
  const fixtureFile=path.join(out,label+'-fixture.json'),report=path.join(out,label+'.json'),file=path.join(out,label+'.land');
  fs.writeFileSync(fixtureFile,JSON.stringify(fixture),{flag:'wx'});
  const args=[path.join(repo,'tools/probe.cjs'),...(process.platform==='linux'?['--no-sandbox','--disable-gpu-sandbox']:[]),
   '--mode=steam','--dir='+dist,'--startup-trace','--startup-cold','--startup-session=lp17b-'+randomUUID(),
   '--startup-fixture='+fixtureFile,'--fresh','--early','--size=deck','--max=0','--errors',
   '--q=gfxdev=deck&mute&landexport17b','--eval='+path.join(repo,'tools/probe-checks/land-package-export.js'),
   '--bootwait=360','--timeout=600','--land-package-export='+file,'--land-package-manifest='+receiptFile,'--report='+report];
  await run(label,electron,args,650000);
  const raw=fs.readFileSync(report),value=JSON.parse(raw),result=value.landPackageExport;
  need(value.ok===true&&value.result?.ok===true&&!value.evalErr&&value.uncaught===0&&value.errors?.length===0&&value.result?.crash?.length===0,'EXPORT_REPORT_'+label);
  need(result&&result.acceptance?.byteExact===true&&result.acceptance.liveRestored===false&&value.result.meta?.cleanCalls===1&&value.result.meta.randomCalls===0,'EXPORT_ACCEPTANCE_'+label);
  const provider=value.result.descriptor;
  need(provider?.ordinaryAtImport===true&&provider.hookOwned===true&&provider.provider==='edl-owned-fnv1a-mulberry32-v1'&&value.startupHost?.seed===null,'EXPORT_ORDINARY_'+label);
  need(value.result.meta.conditions?.graphics===preset,'EXPORT_PRESET_'+label);
  const bytes=fs.readFileSync(file);need(bytes.length===result.bytes&&sha256(bytes)===result.sha256,'EXPORT_FILE_'+label);
  const row={label,preset,repeat,fixtureFile,fixtureSha256:sha256(fs.readFileSync(fixtureFile)),report,reportSha256:sha256(raw),file,...result};exports.push(row);journal.exports=exports;save();
 }
 for(const preset of ['mid','high']){
  const pair=exports.filter(row=>row.preset===preset);
  need(pair.length===2&&canonical(pair[0].manifest)===canonical(pair[1].manifest)&&canonical(pair[0].identity)===canonical(pair[1].identity)&&pair[0].sha256===pair[1].sha256&&pair[0].bytes===pair[1].bytes,'ORDINARY_NOT_REPEATABLE_'+preset);
 }
 const manifest=exports[0].manifest;need(exports.every(row=>canonical(row.manifest)===canonical(manifest)),'PRESET_PARAMETERS_DIFFER');
 const unique=new Map();for(const row of exports){const key=row.identity.precleanHash;if(unique.has(key))need(unique.get(key).sha256===row.sha256,'SAME_INPUT_DIFFERENT_RESULT');else unique.set(key,row);}
 const pkg=path.join(out,'package');fs.mkdirSync(path.join(pkg,'city-data'),{recursive:true});const entries=[];
 for(const row of unique.values()){
  need(canonical(row.identity)===canonical(makeIdentity(manifest,row.identity.precleanHash)),'EXPORTED_INPUT_IDENTITY');
  const raw=fs.readFileSync(row.file),start=performance.now(),wire=gzipSync(raw,{level:6,mtime:0}),encodeMs=performance.now()-start;
  const decodeStart=performance.now(),back=gunzipSync(wire,{maxOutputLength:raw.length});need(back.equals(raw),'GZIP_ROUNDTRIP');
  const sha=sha256(wire),entry={precleanHash:row.identity.precleanHash,path:'city-data/'+sha+'.land.gz',encoding:'gzip',bytes:wire.length,sha256:sha,rawBytes:raw.length,rawSha256:row.sha256};
  fs.writeFileSync(path.join(pkg,entry.path),wire,{flag:'wx'});entries.push(entry);
  (journal.compression||(journal.compression=[])).push({precleanHash:entry.precleanHash,rawBytes:raw.length,wireBytes:wire.length,encodeMs,decodeMs:performance.now()-decodeStart,level:6,scope:'Node host CPU1 component, not renderer startup or Deck',byteExact:true});
 }
 const catalog=createCatalog(manifest,entries);fs.writeFileSync(path.join(pkg,'catalog.json'),JSON.stringify(catalog,null,2),{flag:'wx'});
 journal.package={dir:pkg,uniqueInputs:entries.length,rawBytes:entries.reduce((n,e)=>n+e.rawBytes,0),wireBytes:entries.reduce((n,e)=>n+e.bytes,0),catalog};
 journal.ok=true;journal.finishedAt=new Date().toISOString();save();
 process.stdout.write(JSON.stringify({ok:true,package:pkg,uniqueInputs:entries.length,wireBytes:journal.package.wireBytes,sourceHash:manifest.sourceHash})+'\n');
}catch(error){journal.ok=false;journal.failure=String(error?.stack||error);journal.finishedAt=new Date().toISOString();save();process.stderr.write(journal.failure+'\n');process.exitCode=1;}
