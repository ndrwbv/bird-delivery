/* Offline ordinary-EDL preparation. Fail closed, never retry a failed export. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {finished} from 'node:stream/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {captureSource,writeExportReceipt,readExportReceipt,sha256,newExternalPath,runPreparationExports,PREPARATION_HELPERS} from './land-package-files.mjs';
import {createCatalog,PRODUCT_LAND_COVERAGE,assertProductCoverage} from '../src/game/landdata/land-package-catalog.js';
import {canonical,need,makeIdentity,makeManifest,assertOrdinaryEDL} from '../src/game/landdata/land-package-key.js';
import {LAND_PACKAGE_LIMITS} from '../src/game/landdata/land-package-config.js';

const slotKey=slot=>slot.district+':'+slot.graphics;
const rawCeiling=LAND_PACKAGE_LIMITS.maxPayloadBytes+LAND_PACKAGE_LIMITS.maxHeaderBytes+20;
export function preparationFixture(slot){
 need(PRODUCT_LAND_COVERAGE.some(row=>slotKey(row)===slotKey(slot)),'PREPARATION_SLOT');
 const fixture={'dlv-lang':'ru','dlv-sound':false};
 if(slot.graphics==='high')fixture['dlv-gfx']={deck:{p:'high',rv:2}};
 if(slot.district!==0)Object.assign(fixture,{
  'dlv-msk-guide':1,'dlv-msk-tut':'1','dlv-msk-nostut':1,'dlv-shift-tut':1,
  'dlv-msk-wallet':30000,'dlv-shifts':40,'dlv-city-party':true,'dlv-city-mode':false,
  'dlv-dist-open':8,'dlv-dist-shifts':[4,5,5,6,6,7,7,0],'dlv-district':slot.district,
 });
 // Raw canonical progress only: normal bootstrap creates its own verified singleprogress owner/marker.
 return fixture;
}
export function checkPreparationExport(value,slot,receipt){
 const r=value.result,result=value.landPackageExport,m=r?.meta;
 need(value.ok===true&&r?.ok===true&&!value.evalErr&&!value.landPackageExportError&&value.uncaught===0&&value.errors?.length===0&&r.crash?.length===0,'EXPORT_REPORT');
 need(result&&result.acceptance?.byteExact===true&&result.acceptance.repeated===true&&result.acceptance.ordinary===true&&result.acceptance.source==='generated'&&result.acceptance.liveRestored===false&&result.acceptance.activated===false&&m?.phase==='ready'&&!m.error&&m.cleanCalls===1&&m.randomCalls===0,'EXPORT_ACCEPTANCE');
 assertOrdinaryEDL(r.descriptor);assertOrdinaryEDL(m.conditions?.descriptor);
 need(value.startupHost?.seed===null,'EXPORT_ORDINARY');
 need(result.expectedDistrict===slot.district&&m.conditions?.district===slot.district&&m.conditions.graphics===slot.graphics&&canonical(result.conditions)===canonical(m.conditions),'EXPORT_SLOT');
 need(result.receiptHash===receipt.receiptHash&&result.provenance?.sourceHash===receipt.base.sourceHash&&result.provenance?.buildHash===receipt.build.hash&&canonical(result.manifest)===canonical(m.manifest)&&canonical(result.identity)===canonical(m.identity)&&canonical(result.acceptance)===canonical(m.summary),'EXPORT_PROVENANCE');
 need(canonical(result.manifest)===canonical(makeManifest(receipt.base,m.actualParams))&&canonical(result.identity)===canonical(makeIdentity(result.manifest,result.identity.precleanHash)),'EXPORT_IDENTITY');
 const before=r.preLate,now=r.current;
 need(r.state==='title'&&r.target===slot.district&&before?.phase==='city-pizzeria-before-late'&&Number.isFinite(before.at)&&before.at>=0&&before.lateWorkStarted===false&&before.district===slot.district&&before.pizzaIndex===slot.district&&now?.district===slot.district&&now.pizzaIndex===slot.district&&now.samePizzeriaReference===true,'EXPORT_PRE_LATE_DISTRICT');
 need(['x','z','bx','bz'].every(key=>Number.isFinite(before.pizza?.[key])&&Object.is(before.pizza[key],now.pizza?.[key])),'EXPORT_PRE_LATE_PIZZA');
 need(r.graphics?.preset===slot.graphics&&r.graphics.device==='deck'&&r.graphics.width===1280&&r.graphics.height===800,'EXPORT_GRAPHICS');
 return result;
}
function readRaw(row){
 const size=fs.statSync(row.file).size;need(size>0&&size<=rawCeiling&&size===row.bytes,'EXPORT_FILE_BUDGET');
 const bytes=fs.readFileSync(row.file);need(bytes.length===row.bytes&&sha256(bytes)===row.sha256,'EXPORT_FILE_SHA');return bytes;
}
// Always check coverage and deduplication. An audit also compares independent exports byte for byte.
export function checkPreparationRepeats(rows,repeats=[1,2]){
 need(Array.isArray(rows)&&rows.length===PRODUCT_LAND_COVERAGE.length*repeats.length,'PREPARATION_EXPORT_COUNT');
 need(rows.every(row=>typeof row.session==='string'&&row.session.length>0)&&new Set(rows.map(row=>row.session)).size===rows.length,'PREPARATION_INDEPENDENT_SESSIONS');
 need(new Set(rows.map(row=>path.resolve(row.file))).size===rows.length,'PREPARATION_INDEPENDENT_OUTPUTS');
 const manifest=rows[0].manifest,coverage=[],unique=new Map();
 for(const slot of PRODUCT_LAND_COVERAGE){
  const pair=rows.filter(row=>row.district===slot.district&&row.preset===slot.graphics);
  need(pair.length===repeats.length&&repeats.every(repeat=>pair.some(row=>row.repeat===repeat)),'PREPARATION_SLOT_REPEATS');
  const [first,second]=pair;
  if(second){
   need(canonical(first.manifest)===canonical(second.manifest)&&canonical(first.identity)===canonical(second.identity)&&first.sha256===second.sha256&&first.bytes===second.bytes,'ORDINARY_NOT_REPEATABLE');
   need(readRaw(first).equals(readRaw(second)),'ORDINARY_REPEAT_BYTES');
  }
  for(const row of pair){
   need(canonical(row.manifest)===canonical(manifest),'PRESET_PARAMETERS_DIFFER');
   need(canonical(row.identity)===canonical(makeIdentity(manifest,row.identity.precleanHash)),'EXPORTED_INPUT_IDENTITY');
   const key=row.identity.precleanHash,prior=unique.get(key);
   if(prior)need(prior.sha256===row.sha256&&prior.bytes===row.bytes&&readRaw(prior).equals(readRaw(row)),'SAME_INPUT_DIFFERENT_RESULT');
   else unique.set(key,row);
  }
  coverage.push({...slot,precleanHash:first.identity.precleanHash});
 }
 return{manifest,coverage,unique:[...unique.values()]};
}

async function main(){
 const arg=key=>process.argv.slice(2).find(value=>value.startsWith('--'+key+'='))?.slice(key.length+3);
 const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const output=arg('out');need(output,'REQUIRED_OUT');const out=newExternalPath(repo,output);
 const single=process.argv.includes('--single-export'),repeats=single?[1]:[1,2],workers=single?2:1;
 const slots=PRODUCT_LAND_COVERAGE.flatMap(slot=>repeats.map(repeat=>({...slot,repeat})));
 fs.mkdirSync(out,{recursive:true});
 const journal={version:2,kind:'ordinary-land-preparation',startedAt:new Date().toISOString(),out,
  protocol:{coverage:PRODUCT_LAND_COVERAGE,independentRepeats:repeats.length,exports:slots.length,workers,fresh:true,seed:null,externalInit:false},runs:[]};
 const harnessFiles=[...new Set([...PREPARATION_HELPERS,'tools/probe.cjs','tools/probe-page.cjs','tools/land-package-export-host.cjs'])];
 const harness=()=>harnessFiles.map(file=>{const bytes=fs.readFileSync(path.join(repo,file));return{file,bytes:bytes.length,sha256:sha256(bytes)};});
 journal.harness=harness();
 const save=()=>fs.writeFileSync(path.join(out,'preparation.json'),JSON.stringify(journal,null,2));save();
 const env={...process.env};delete env.BIRD_EDITOR;delete env.BIRD_LAND_DATA_DIR;
 async function run(label,command,args,timeoutMs){
  need(canonical(harness())===canonical(journal.harness),'PREPARATION_HARNESS_CHANGED');
  const record={label,argv:[command,...args],cwd:repo,startedAt:new Date().toISOString(),status:'running',processStatus:null,signal:null};journal.runs.push(record);save();
  const stdout=fs.createWriteStream(path.join(out,label+'.stdout.log')),stderr=fs.createWriteStream(path.join(out,label+'.stderr.log'));
  const child=spawn(command,args,{cwd:repo,env,stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(stdout);child.stderr.pipe(stderr);record.pid=child.pid;save();
  const timer=setTimeout(()=>child.kill('SIGKILL'),timeoutMs);
  try{
   const result=await new Promise(resolve=>{child.once('error',error=>{record.spawnError=String(error);resolve({code:null,signal:null});});child.once('close',(code,signal)=>resolve({code,signal}));});
   record.processStatus=result.code;record.signal=result.signal;record.status='returned';record.finishedAt=new Date().toISOString();
   await Promise.all([finished(stdout),finished(stderr)]);
   record.stdoutSha256=sha256(fs.readFileSync(path.join(out,label+'.stdout.log')));record.stderrSha256=sha256(fs.readFileSync(path.join(out,label+'.stderr.log')));save();
   need(canonical(harness())===canonical(journal.harness),'PREPARATION_HARNESS_CHANGED');
   need(result.code===0&&!result.signal&&!record.spawnError,'PROCESS_FAILED_'+label);return record;
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
  const electron=createRequire(path.join(repo,'package.json'))('electron');journal.exports=[];
  const exports=await runPreparationExports(slots,async slot=>{
   const {district,graphics:preset,repeat}=slot,label=(district?'district'+district+'-':'')+preset+'-'+repeat,fixture=preparationFixture(slot);
   const fixtureFile=path.join(out,label+'-fixture.json'),report=path.join(out,label+'.json'),file=path.join(out,label+'.land'),session='lp17b-'+randomUUID();
   fs.writeFileSync(fixtureFile,JSON.stringify(fixture),{flag:'wx'});
   const args=[path.join(repo,'tools/probe.cjs'),...(process.platform==='linux'?['--no-sandbox','--disable-gpu-sandbox']:[]),
    '--mode=steam','--dir='+dist,'--startup-trace','--startup-cold','--startup-session='+session,
    '--startup-fixture='+fixtureFile,'--fresh','--early','--size=deck','--max=0','--errors',
    '--q=gfxdev=deck&mute&startupdistrict='+district+'&landexport17b','--eval='+path.join(repo,'tools/probe-checks/land-package-district-export.js'),
    '--bootwait=360','--timeout=600','--land-package-district='+district,'--land-package-export='+file,'--land-package-manifest='+receiptFile,'--report='+report];
   await run(label,electron,args,650000);
   const raw=fs.readFileSync(report),value=JSON.parse(raw),result=checkPreparationExport(value,slot,receipt);
   need(path.resolve(result.path)===path.resolve(file),'EXPORT_OUTPUT_PATH');
   readRaw({...result,file});
   const row={label,district,preset,repeat,session,fixtureFile,fixtureSha256:sha256(fs.readFileSync(fixtureFile)),report,reportSha256:sha256(raw),file,...result};journal.exports.push(row);save();return row;
  },workers);
  const {manifest,coverage,unique}=checkPreparationRepeats(exports,repeats);
  readExportReceipt(receiptFile,{repo,dist});
  const pkg=path.join(out,'package'),staging=path.join(out,'package.part');
  fs.mkdirSync(path.join(staging,'city-data'),{recursive:true});const entries=[];
  for(const row of unique){
   const raw=readRaw(row),start=performance.now(),wire=gzipSync(raw,{level:6,mtime:0}),encodeMs=performance.now()-start;
   need(wire.length<=rawCeiling+65536,'PACKAGE_CONTENT_BUDGET');
   const decodeStart=performance.now(),back=gunzipSync(wire,{maxOutputLength:raw.length});need(back.equals(raw),'GZIP_ROUNDTRIP');
   const sha=sha256(wire),entry={precleanHash:row.identity.precleanHash,path:'city-data/'+sha+'.land.gz',encoding:'gzip',bytes:wire.length,sha256:sha,rawBytes:raw.length,rawSha256:row.sha256};
   fs.writeFileSync(path.join(staging,entry.path),wire,{flag:'wx'});entries.push(entry);
   (journal.compression||(journal.compression=[])).push({precleanHash:entry.precleanHash,rawBytes:raw.length,wireBytes:wire.length,encodeMs,decodeVerifyHashWriteMs:performance.now()-decodeStart,level:6,scope:'Node host CPU1 component; decode/verify/hash/write span, not renderer startup or Deck',byteExact:true});
  }
  const catalog=assertProductCoverage(createCatalog(manifest,entries,{coverage}));
  need(canonical(harness())===canonical(journal.harness),'PREPARATION_HARNESS_CHANGED');readExportReceipt(receiptFile,{repo,dist});
  fs.writeFileSync(path.join(staging,'catalog.json'),JSON.stringify(catalog,null,2),{flag:'wx'});
  need(!fs.existsSync(pkg),'NEW_EXTERNAL_OUTPUT');fs.renameSync(staging,pkg);
  journal.package={dir:pkg,uniqueInputs:entries.length,coverage:catalog.coverage,rawBytes:entries.reduce((n,e)=>n+e.rawBytes,0),wireBytes:entries.reduce((n,e)=>n+e.bytes,0),catalog};
  journal.ok=true;journal.finishedAt=new Date().toISOString();save();
  process.stdout.write(JSON.stringify({ok:true,package:pkg,coverage:catalog.coverage.length,exports:exports.length,uniqueInputs:entries.length,wireBytes:journal.package.wireBytes,sourceHash:manifest.sourceHash})+'\n');
 }catch(error){journal.ok=false;journal.failure=String(error?.stack||error);journal.finishedAt=new Date().toISOString();save();process.stderr.write(journal.failure+'\n');process.exitCode=1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
