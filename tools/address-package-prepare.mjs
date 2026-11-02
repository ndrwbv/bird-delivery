/* Two ordinary independent B1 exports; no retry, no timing claim, no scene serialization. */
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {finished} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {randomUUID,webcrypto} from 'node:crypto';
import {captureSource,captureBuild,newExternalPath,sha256} from './land-package-files.mjs';
import {validateStartupReport} from './startup-report.mjs';
import {assertOrdinaryEDL} from '../src/game/landdata/land-package-key.js';
import {encodeAddressCatalog,decodeAddressCatalog} from '../src/game/addresscodec17b.js';
import * as AddressPackages from '../src/game/addresspackage17b.js';
const {checkAddressPackageCatalog}=AddressPackages;

export const FRESH_ADDRESS_EXPORT_QUERY='addressexport17b&addressclosure17b';
export const ADDRESS_EXPORT_QUERY='gfxdev=deck&mute&startupdistrict=0&addresspackage17b=1&addressexport17b&addressclosure17b';
const WIRE_LIMIT=16*1024*1024,REPORT_LIMIT=64*1024*1024;
const ID_FIELDS=['mapId','mapHash','editsHash','sourceHash','inputHash'];
const HARNESS=['tools/address-package-prepare.mjs','tools/probe-checks/address-package-export.js','tools/probe-checks/address-package-fresh-export.js','tools/probe.cjs','tools/probe-page.cjs','tools/startup-environment.cjs','tools/startup-report.mjs','tools/probe-checks/startup-bootstrap-observe.js'];
const need=(ok,why)=>{if(!ok)throw Error('address-package-prepare:'+why);};
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function exact(value){
 if(value===null)return['null'];if(value===undefined)return['undefined'];
 if(typeof value==='number'){need(Number.isFinite(value),'EXACT_FINITE');const b=new Uint8Array(8);new DataView(b.buffer).setFloat64(0,value,true);return['number',Buffer.from(b).toString('hex')];}
 if(['string','boolean'].includes(typeof value))return[typeof value,value];
 if(Array.isArray(value))return['array',value.map(exact)];
 need(value&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null),'EXACT_OBJECT');return['object',Object.keys(value).map(key=>[key,exact(value[key])])];
}
function fromExact(value){
 need(Array.isArray(value),'EXACT_ENCODED');const[type,data]=value;
 if(type==='null')return null;if(type==='undefined')return undefined;
 if(type==='number'){need(typeof data==='string'&&/^[a-f0-9]{16}$/.test(data),'EXACT_NUMBER');const b=Buffer.from(data,'hex');return new DataView(b.buffer,b.byteOffset,b.byteLength).getFloat64(0,true);}
 if(type==='string'||type==='boolean')return data;
 if(type==='array')return data.map(fromExact);if(type==='object')return Object.fromEntries(data.map(([key,row])=>[key,fromExact(row)]));need(false,'EXACT_TYPE');
}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function addressPreparationFixture(){
 return{'dlv-lang':'ru','dlv-sound':false,'dlv-gfx':{deck:{p:'high',rv:2}},
  'dlv-msk-guide':1,'dlv-msk-tut':'1','dlv-msk-nostut':1,'dlv-shift-tut':1,'dlv-msk-wallet':30000,'dlv-shifts':40,
  'dlv-city-party':true,'dlv-city-mode':false,'dlv-dist-open':8,'dlv-dist-shifts':[4,5,5,6,6,7,7,0],'dlv-district':0,
  'dlv-season':2.5,'dlv-don-trash':0,'dlv-don-gang':0,'dlv-car-owned':['semerka'],'dlv-car-cur':'semerka','dlv-car-up':{},'dlv-car-L':{},
  'dlv-car-paint':{_v:2},'dlv-car-eng':{semerka:{c:100,r:100,km:0,n:0}},'dlv-used-addr':[]};
}
export function freshAddressPreparationFixture(graphics){
 need(['mid','high'].includes(graphics),'FRESH_PRESET');
 return{'dlv-lang':'ru',...(graphics==='high'?{'dlv-gfx':{deck:{p:'high',rv:2}}}:{})};
}
export function parseAddressPreparationArgs(argv){
 const outputs=argv.filter(v=>v.startsWith('--out=')),ordinary=argv.includes('--ordinary');
 need(outputs.length===1&&outputs[0].length>6&&argv.length===(ordinary?2:1)&&argv.filter(v=>v==='--ordinary').length===(ordinary?1:0),'CLI_OUT');
 return{ordinary,out:outputs[0].slice(6)};
}
const nativeSHA=async bytes=>Buffer.from(await webcrypto.subtle.digest('SHA-256',bytes)).toString('hex');
function checkIdentity(identity,base){
 need(identity&&Object.keys(identity).sort().join(',')===ID_FIELDS.slice().sort().join(',')&&/^[a-z0-9_-]{1,64}$/.test(identity.mapId)&&ID_FIELDS.slice(1).every(k=>hash(identity[k])),'IDENTITY');
 need(['mapId','mapHash','editsHash','sourceHash'].every(k=>identity[k]===base[k]),'SOURCE_BASE');
}
export async function checkAddressExport(value,{base,ordinary=false,graphics='high'}={}){
 need(['mid','high'].includes(graphics)&&(ordinary||graphics==='high'),'EXPORT_PRESET');
 const gate=validateStartupReport(value,{expectedDistrict:0,requireDistrict:true,requireGuardV2:true});need(gate.ok,'STARTUP_'+gate.reasons.join(','));
 const r=value.result,p=r.addressClosure,a=r.addressExport,m=a?.meta,input=m?.input;
 need(r.protocolVersion===2&&r.district.pickerClicks===(ordinary?0:1)&&r.district.before?.opened===(ordinary?1:8)&&r.district.before.city===false,ordinary?'ACTUAL_FRESH_START':'ACTUAL_MATURE_PICKER');
 need(r.host?.seed===null&&value.startupHost?.seed===null&&r.host.cpuThrottle===1&&r.host.bootcpu===true,'ORDINARY_HOST');
 assertOrdinaryEDL(r.rng);need(r.conditions?.lang==='ru'&&r.conditions.graphics?.preset===graphics&&r.conditions.graphics.device==='deck'&&r.conditions.graphics.width===1280&&r.conditions.graphics.height===800,'GRAPHICS');
 need(r.landPackage===null&&r.cache===null&&r.report.counters?.['raisedland.cleanCalls']===1,'UNBUNDLED_GENERATED_LAND');
 const actualQuery=[...new URL(r.conditions.url).searchParams].sort(([a],[b])=>a<b?-1:a>b?1:0);
 const expectedQuery=[...new URLSearchParams(ordinary?'debug&mute&nolb&startuptrace&'+FRESH_ADDRESS_EXPORT_QUERY:'debug&mute&nolb&lang=ru&startuptrace&'+ADDRESS_EXPORT_QUERY)].sort(([a],[b])=>a<b?-1:a>b?1:0);
 need(same(actualQuery,expectedQuery),'ACTUAL_QUERY');
 need(a?.version===1&&m?.phase==='sealed'&&input?.eligible===true&&!input.reason&&a.preparedReplay===false&&!m.preload?.held&&!['prepared','consumed'].includes(m.preload?.phase),'GENERATED_EXPORT');
 checkIdentity(input.identity,base);const descriptor=fromExact(a.inputDescriptorExact);
 need(descriptor&&same(exact(descriptor),a.inputDescriptorExact)&&descriptor.base&&['mapId','mapHash','editsHash','sourceHash'].every(k=>descriptor.base[k]===base[k]),'DESCRIPTOR_BASE');
 const observed={...p?.initial};delete observed.at;
 need(same(exact(descriptor.initial),exact(observed)),'ACTUAL_PREVISUAL_DESCRIPTOR');
 if(ordinary){
  need(descriptor.version===2&&descriptor.profile==='fresh-v1'&&descriptor.query?.normalization==='fresh-diagnostics-v1'&&descriptor.query.raw===''&&same(descriptor.query.entries,[])&&descriptor.diagnosticQuery?.raw===new URL(r.conditions.url).search&&same(descriptor.diagnosticQuery.entries,actualQuery),'FRESH_NORMALIZED_QUERY');
  need(new URL(r.conditions.url).search==='?debug&mute&nolb&startuptrace&'+FRESH_ADDRESS_EXPORT_QUERY,'FRESH_RAW_QUERY');
  need(typeof r.freshEnvironment?.userAgent==='string'&&/steam deck|steamos/i.test(r.freshEnvironment.userAgent)&&r.freshEnvironment.rawQuery===new URL(r.conditions.url).search,'ACTUAL_DECK_ENVIRONMENT');
 }else need(descriptor.query?.raw===new URL(r.conditions.url).search&&same(descriptor.query.entries,actualQuery),'ACTUAL_PREVISUAL_DESCRIPTOR');
 need(descriptor.progress&&descriptor.progress.values&&Array.isArray(descriptor.progress.presentKeys),'PROGRESS_DESCRIPTOR');
 if(ordinary){
  const v=descriptor.progress.values,zeroOrAbsent=x=>x===undefined||Object.is(x,0),falseOrAbsent=x=>x===undefined||x===false;
  need(v['dlv-money-x8']===1&&['dlv-shifts','dlv-msk-wallet','dlv-msk-xp','dlv-stars','dlv-delivered','dlv-don-trash','dlv-don-gang'].every(k=>zeroOrAbsent(v[k])),'ACTUAL_FRESH_PROGRESS');
  need(['dlv-msk-guide','dlv-msk-tut','dlv-msk-nostut','dlv-shift-tut','dlv-car-owned','dlv-car-cur','dlv-car-up','dlv-car-L','dlv-car-paint','dlv-car-eng','dlv-story','dlv-cycle','dlv-wx-last'].every(k=>v[k]===undefined)&&['dlv-city-party','dlv-city-mode'].every(k=>falseOrAbsent(v[k])),'NO_FAKE_FRESH_MARKERS');
 }else need(descriptor.progress.values['dlv-money-x8']===1&&descriptor.progress.values['dlv-msk-wallet']===240000,'POST_MIGRATION_B1_PROGRESS');
 const pre=m.preVisual,fields=['houses','generatedDoors','spots','rawEntrances'];
 need(pre?.phase==='before-city-syncBuild'&&Number.isFinite(pre.at)&&pre.at>=0&&Number.isFinite(r.report.marks['city.syncBuilt']?.at)&&pre.at<r.report.marks['city.syncBuilt'].at&&pre.lateWorkStarted===false&&pre.inputHash===input.identity.inputHash,'PREVISUAL_PHASE');
 need(pre.before&&pre.after&&fields.every(k=>Number.isSafeInteger(pre.before[k])&&pre.before[k]>=0&&pre.before[k]===pre.after[k])&&['houses','generatedDoors','spots'].every(k=>pre.before[k]===0),'PREVISUAL_UNCHANGED_COUNTS');
 need(p?.version===1&&p.case===(ordinary?'fresh-'+graphics:'B1')&&p.ownedAliases===true&&p.unchanged?.menuOwnerSnapshot===true&&p.unchanged.arrayReferencesThroughGo===true,'MENU_OWNER_PROOF');
 need(p.initial?.season?.value===2.5&&p.initial.season.forced===false&&p.initial.donation?.trashRaw===0&&p.initial.donation.trashFraction===0&&p.initial.car?.id==='semerka','B1_INITIAL');
 if(ordinary){
  need(p.profile==='ordinary-first-career'&&p.initial.season.saved===null&&p.initial.graphics?.preset===graphics&&['dlv-car-owned','dlv-car-cur','dlv-car-up','dlv-car-L','dlv-car-paint','dlv-car-eng'].every(k=>p.initial.car.inputs?.[k]===null),'ACTUAL_NATIVE_FRESH_DEFAULTS');
  need(p.repairNoop?.district===0&&p.repairNoop.opened===1&&p.repairNoop.city===false&&p.repairNoop.partySeen===false,'FRESH_REPAIR_NOOP');
 }
 need(p.functionalQueries?.actualQueries===true&&p.functionalQueries.unchanged?.arrayAndRowReferences===true&&p.functionalQueries.unchanged.savedKeys===true&&p.functionalQueries.unchanged.rngDescriptor===true,'ACTUAL_FUNCTIONAL_QUERIES');
 const w=a.wire;need(Number.isSafeInteger(w?.bytes)&&w.bytes>0&&w.bytes<=WIRE_LIMIT&&hash(w.sha256)&&typeof w.base64==='string'&&w.base64.length===4*Math.ceil(w.bytes/3)&&/^[A-Za-z0-9+/]*={0,2}$/.test(w.base64),'WIRE_BUDGET');
 const bytes=Buffer.from(w.base64,'base64');need(bytes.length===w.bytes&&bytes.toString('base64')===w.base64,'WIRE_BASE64');
 need(sha256(bytes)===w.sha256&&await nativeSHA(bytes)===w.sha256,'WIRE_SHA');
 const snapshot=decodeAddressCatalog(new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength),input.identity);
 need(same(exact(snapshot),p.menuExact),'MENU_WIRE_SNAPSHOT');need(Buffer.from(encodeAddressCatalog(snapshot,input.identity)).equals(bytes),'CODEC_REENCODE');
 need(a.oracleBody?.kind===(ordinary?'fresh-proof-with-original-functional-oracles':'historical-oracle-body-not-runtime-identity')&&hash(a.oracleBody.sha256),'ORACLE_BODY_LABEL');
 return{identity:{...input.identity},descriptorExact:a.inputDescriptorExact,bytes,snapshot,proof:p,wireSha256:w.sha256};
}
export function checkAddressRepeats(a,b){
 need(same(exact(a.identity),exact(b.identity))&&same(a.descriptorExact,b.descriptorExact),'INDEPENDENT_INPUT_DIFFERENCE');
 need(a.wireSha256===b.wireSha256&&a.bytes.equals(b.bytes),'INDEPENDENT_WIRE_DIFFERENCE');
 for(const key of ['menuExact','fixedQueriesExact','exactQueryTables'])need(same(a.proof[key],b.proof[key]),'INDEPENDENT_QUERY_'+key);
}
export function addressProductCatalog(rows){
 need(Array.isArray(rows)&&rows.length===4&&new Set(rows.map(r=>r.session)).size===4&&rows.every(r=>typeof r.session==='string'&&r.session.length>0),'PRODUCT_FOUR_INDEPENDENT_EXPORTS');
 const slots=[];
 for(const graphics of ['mid','high']){
  const pair=rows.filter(row=>row.graphics===graphics);need(pair.length===2&&new Set(pair.map(r=>r.repeat)).size===2&&pair.every(r=>[1,2].includes(r.repeat)),'PRODUCT_PRESET_REPEATS');
  checkAddressRepeats(pair[0].checked,pair[1].checked);const first=pair[0].checked;
  slots.push({graphics,identity:first.identity,entry:{path:'address-data/'+first.wireSha256+'.addr',bytes:first.bytes.length,sha256:first.wireSha256}});
 }
 need(typeof AddressPackages.assertProductAddressCatalog==='function','PRODUCT_CATALOG_API');
 return AddressPackages.assertProductAddressCatalog({version:2,kind:'address-package17b',slots});
}
export function earlyQueryArtifact(checked,sourceRawSha256){
 need(hash(sourceRawSha256),'QUERY_SOURCE_RAW_SHA');const points=checked.proof.fixedQueriesExact,decoded=fromExact(points);
 need(decoded&&Array.isArray(decoded.addresses)&&Array.isArray(decoded.levels)&&decoded.addresses.length+2*decoded.levels.length<=60000,'QUERY_POINTS');
 for(const rows of [decoded.addresses,decoded.levels])for(const row of rows)need(Array.isArray(row)&&row.length===4&&typeof row[0]==='string'&&Number.isSafeInteger(row[1])&&Number.isFinite(row[2])&&Number.isFinite(row[3]),'QUERY_POINT');
 return{version:1,identity:{...checked.identity},sourceRawSha256,fixedQueriesExact:points};
}
export function earlyQueryInit(artifact,observerSource){
 const observerSha256=sha256(Buffer.from(observerSource));
 return'/* Host proof points only: not a source/key input. Observer SHA256 '+observerSha256+' */\n'+observerSource+'\n(()=>{const freeze=v=>{if(v&&typeof v==="object"){for(const item of Object.values(v))freeze(item);Object.freeze(v);}return v;};Object.defineProperty(window,"__addressPackage17bEarlyQueryInput",{value:freeze('+JSON.stringify(artifact)+'),writable:false,configurable:false});Object.defineProperty(window,"__addressPackage17bEarlyQueryObserver",{value:Object.freeze({file:"tools/probe-checks/startup-bootstrap-observe.js",sha256:"'+observerSha256+'"}),writable:false,configurable:false});})();\n';
}
async function main(){
 const {ordinary,out:requestedOut}=parseAddressPreparationArgs(process.argv.slice(2));
 const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=newExternalPath(repo,requestedOut);fs.mkdirSync(out,{recursive:true});
 const journal={version:1,kind:'ordinary-address-preparation',out,startedAt:new Date().toISOString(),protocol:{exports:ordinary?4:2,fixture:ordinary?'ordinary-first-career-mid-high-ru':'exact-B1-mature0-high-semerka-ru',query:ordinary?FRESH_ADDRESS_EXPORT_QUERY:ADDRESS_EXPORT_QUERY,seed:null,cpu:1,fresh:true,maxWireBytes:WIRE_LIMIT,maxReportBytes:REPORT_LIMIT},runs:[]};
 const harness=()=>HARNESS.map(file=>{const bytes=fs.readFileSync(path.join(repo,file));return{file,bytes:bytes.length,sha256:sha256(bytes)};});journal.harness=harness();
 const save=()=>fs.writeFileSync(path.join(out,'preparation.json'),JSON.stringify(journal,null,2));save();
 const env={...process.env};for(const key of ['BIRD_EDITOR','BIRD_LAND_DATA_DIR','BIRD_ADDRESS_DATA_DIR'])delete env[key];
 async function run(label,command,args,timeoutMs){
  need(same(harness(),journal.harness),'HARNESS_CHANGED');
  const row={label,argv:[command,...args],cwd:repo,status:'running',processStatus:null,signal:null,startedAt:new Date().toISOString()};journal.runs.push(row);save();
  const stdout=fs.createWriteStream(path.join(out,label+'.stdout.log'),{flags:'wx'}),stderr=fs.createWriteStream(path.join(out,label+'.stderr.log'),{flags:'wx'}),child=spawn(command,args,{cwd:repo,env,stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(stdout);child.stderr.pipe(stderr);row.pid=child.pid;save();const timer=setTimeout(()=>child.kill('SIGKILL'),timeoutMs);
  try{const result=await new Promise(resolve=>{child.once('error',error=>{row.spawnError=String(error);resolve({code:null,signal:null});});child.once('close',(code,signal)=>resolve({code,signal}));});
   row.processStatus=result.code;row.signal=result.signal;row.status='returned';row.finishedAt=new Date().toISOString();await Promise.all([finished(stdout),finished(stderr)]);
   row.stdoutSha256=sha256(fs.readFileSync(path.join(out,label+'.stdout.log')));row.stderrSha256=sha256(fs.readFileSync(path.join(out,label+'.stderr.log')));save();
   need(same(harness(),journal.harness),'HARNESS_CHANGED');need(result.code===0&&!result.signal&&!row.spawnError,'PROCESS_'+label);return row;
  }finally{clearTimeout(timer);}
 }
 try{
  const source=captureSource(repo);journal.source=source;save();
  const dist=path.join(out,'prepare-steam');await run('build',process.execPath,[path.join(repo,'node_modules/vite/bin/vite.js'),'build','--mode','steam','--outDir',dist],300000);
  need(same(captureSource(repo),source),'SOURCE_CHANGED_DURING_BUILD');const build=captureBuild(dist);journal.build=build;save();
  const electron=createRequire(path.join(repo,'package.json'))('electron'),checked=[];journal.exports=[];
  for(const graphics of ordinary?['mid','high']:['high'])for(const repeat of [1,2]){
   const label=ordinary?'fresh-'+graphics+'-'+repeat:'B1-'+repeat,folder=path.join(out,label);fs.mkdirSync(folder);const fixtureFile=path.join(folder,'fixture.json'),report=path.join(folder,'raw.json'),wireFile=path.join(folder,'catalog.addr'),session='address17b-'+randomUUID();
   const fixtureText=JSON.stringify(ordinary?freshAddressPreparationFixture(graphics):addressPreparationFixture(),null,2)+'\n';fs.writeFileSync(fixtureFile,fixtureText,{flag:'wx'});
   const args=[path.join(repo,'tools/probe.cjs'),...(process.platform==='linux'?['--no-sandbox','--disable-gpu-sandbox']:[]),'--mode=steam','--dir='+dist,'--startup-trace','--startup-cold','--startup-session='+session,'--startup-fixture='+fixtureFile,...(ordinary?['--startup-no-lang','--startup-deck']:[]),'--fresh','--early','--size=deck','--cpu=1','--bootcpu','--init-script='+path.join(repo,'tools/probe-checks/startup-bootstrap-observe.js'),'--q='+(ordinary?FRESH_ADDRESS_EXPORT_QUERY:ADDRESS_EXPORT_QUERY),'--eval='+path.join(repo,ordinary?'tools/probe-checks/address-package-fresh-export.js':'tools/probe-checks/address-package-export.js'),'--bootwait=360','--timeout=900','--max=0','--errors','--report='+report];
   const child=await run(label,electron,args,950000);need(fs.statSync(report).size>0&&fs.statSync(report).size<=REPORT_LIMIT,'REPORT_BUDGET');const raw=fs.readFileSync(report),value=JSON.parse(raw),accepted=await checkAddressExport(value,{base:source.base,ordinary,graphics});
   fs.writeFileSync(wireFile,accepted.bytes,{flag:'wx'});checked.push({graphics,repeat,session,checked:accepted});journal.exports.push({label,graphics,repeat,session,report,reportSha256:sha256(raw),fixtureFile,fixtureSha256:sha256(Buffer.from(fixtureText)),wireFile,bytes:accepted.bytes.length,sha256:accepted.wireSha256,identity:accepted.identity,inputDescriptorExact:accepted.descriptorExact,processStatus:child.processStatus,signal:child.signal});save();
  }
  need(new Set(journal.exports.map(row=>row.session)).size===journal.exports.length,'INDEPENDENT_SESSIONS');if(!ordinary)checkAddressRepeats(checked[0].checked,checked[1].checked);
  need(same(captureSource(repo),source)&&same(captureBuild(dist),build)&&same(harness(),journal.harness),'FINAL_PROVENANCE_CHANGED');
  const packet=ordinary?addressProductCatalog(checked):checkAddressPackageCatalog({version:1,kind:'address-package17b',identity:checked[0].checked.identity,entry:{path:'address-data/'+checked[0].checked.wireSha256+'.addr',bytes:checked[0].checked.bytes.length,sha256:checked[0].checked.wireSha256}});
  const observer=fs.readFileSync(path.join(repo,'tools/probe-checks/startup-bootstrap-observe.js'),'utf8'),sidecars=[];
  for(const graphics of ordinary?['mid','high']:['high']){
   const row=checked.find(row=>row.graphics===graphics),record=journal.exports.find(row=>row.graphics===graphics),artifact=earlyQueryArtifact(row.checked,record.reportSha256),prefix=ordinary?'early-queries-'+graphics:'early-queries';
   const json=path.join(out,prefix+'.json'),init=path.join(out,prefix+'-init.js');fs.writeFileSync(json,JSON.stringify(artifact,null,2),{flag:'wx'});fs.writeFileSync(init,earlyQueryInit(artifact,observer),{flag:'wx'});sidecars.push({graphics,json,init,initSha256:sha256(fs.readFileSync(init))});
  }
  const staging=path.join(out,'package.part'),final=path.join(out,'package');fs.mkdirSync(path.join(staging,'address-data'),{recursive:true});
  for(const slot of ordinary?packet.slots:[packet]){const row=checked.find(row=>row.checked.wireSha256===slot.entry.sha256);need(row,'PACKAGE_SLOT_BYTES');fs.writeFileSync(path.join(staging,slot.entry.path),row.checked.bytes,{flag:'wx'});}
  fs.writeFileSync(path.join(staging,'catalog.json'),JSON.stringify(packet,null,2),{flag:'wx'});need(!fs.existsSync(final),'NEW_PACKAGE_OUTPUT');fs.renameSync(staging,final);
  journal.package={dir:final,catalog:packet,sidecars,...(!ordinary?{earlyQueries:sidecars[0].json,earlyQueriesInit:sidecars[0].init,earlyQueriesInitSha256:sidecars[0].initSha256}:{}),scope:ordinary?'ordinary first-career mid/high only; no early-control or startup-speed claim':'exact observed B1 only; no early-control or startup-speed claim'};journal.ok=true;journal.finishedAt=new Date().toISOString();save();
  console.log(JSON.stringify({ok:true,out,package:final,sourceHash:source.base.sourceHash,buildHash:build.hash,exports:journal.exports.length,catalogVersion:packet.version,...(!ordinary?{inputHash:checked[0].checked.identity.inputHash,bytes:checked[0].checked.bytes.length,sha256:checked[0].checked.wireSha256}:{})}));
 }catch(error){journal.ok=false;journal.failure=String(error?.stack||error);journal.finishedAt=new Date().toISOString();save();console.error(journal.failure);process.exitCode=1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
