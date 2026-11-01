/* Host record for ONE root-authorized foreground npm command. Never retries or starts the next variant. */
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const ROOT='/tmp/bird-ordinary17b-memory',REPO='/Users/andrewboev/Desktop/not-work/delivery';
const variant=process.argv[2];
if(!['generated','cache'].includes(variant)||process.argv[3]!=='--go')throw Error('Explicit coordinator GO required: generated|cache --go');
const pins=JSON.parse(fs.readFileSync(path.join(ROOT,'pins.json'),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const files=()=>Object.fromEntries(Object.entries(pins.files).map(([key,row])=>{try{return[key,{path:row.path,sha256:hash(fs.readFileSync(row.path))}];}catch(error){return[key,{path:row.path,sha256:null,error:String(error)}];}}));
const output=file=>{try{return fs.existsSync(file)?{exists:true,sha256:hash(fs.readFileSync(file))}:{exists:false,sha256:null};}catch(error){return{exists:true,sha256:null,error:String(error)};}};
const raw=path.join(ROOT,variant+'.json'),stdoutFile=path.join(ROOT,variant+'.stdout.log'),stderrFile=path.join(ROOT,variant+'.stderr.log'),recordFile=path.join(ROOT,variant+'-run.json');
// Templates are not execution evidence. Derive actual invocation directly from reviewed pins.
if([raw,stdoutFile,stderrFile,recordFile].some(file=>fs.existsSync(file)))throw Error('Attempt evidence exists; never overwrite or resume');
if(variant==='cache'){
 const first=JSON.parse(fs.readFileSync(path.join(ROOT,'generated-run.json'),'utf8'));
 if(first.ok!==true||first.singleAdmission?.ok!==true||first.status!=='returned'||first.processStatus!==0||first.signal||first.spawnError)throw Error('Generated first attempt has not passed; cache not started');
}
const argv=[...pins.commands[variant]],before=files();
const record={version:1,variant,argv,cwd:REPO,sourceHash:pins.conditions.sourceHash,sourceHashIsGitCommit:false,buildDir:pins.conditions.dir,
  provenance:structuredClone(pins.files),observedBefore:before,observedAfter:null,provenanceUnchanged:false,
  startedEpochMs:null,finishedEpochMs:null,pid:null,processStatus:null,signal:null,status:'preflight',raw,
  rawSha256:null,stdoutSha256:null,stderrSha256:null,outputsBefore:{raw:output(raw),stdout:output(stdoutFile),stderr:output(stderrFile)},outputsAfter:null,
  wrapper:{path:process.argv[1],sha256:hash(fs.readFileSync(process.argv[1]))},attempts:1,ok:false};
const save=()=>fs.writeFileSync(recordFile,JSON.stringify(record,null,2)+'\n');
fs.writeFileSync(recordFile,JSON.stringify(record,null,2)+'\n',{flag:'wx'});
let stdout,stderr;
function singleAdmission(value){
 const reasons=[],need=(v,s)=>{if(!v)reasons.push(s);},r=value?.result,t=r?.trace;
 need(value?.ok===true&&r?.ok===true&&r.variant===variant&&!value.evalErr&&Array.isArray(value.errors)&&value.errors.length===0&&value.uncaught===0,'outer/result/errors');
 need(Array.isArray(r?.crash)&&r.crash.length===0,'crash');
 need(r?.gcAvailable===true&&Number.isFinite(r.gcCheckpointStarted?.epochMs)&&Number.isFinite(r.gcCheckpointEnded?.epochMs)&&r.gcCheckpointEnded.epochMs>=r.gcCheckpointStarted.epochMs&&r.provenanceReadStarted?.epochMs>=r.gcCheckpointEnded.epochMs,'2GC/metadata order');
 need(r?.watchUnavailable||Number.isFinite(r?.watchStopped?.epochMs)&&r.watchStopped.epochMs<=r.gcCheckpointStarted?.epochMs,'watch closed before GC');
 for(const x of[r?.beforeGC,r?.afterGC])need(x?.state?.state==='title'&&x.state.paused===false&&x.state.bootFull===true&&x.state.lateBusy===false&&x.state.supportReady===true&&x.state.ready640===true&&x.state.ready832===true&&x.state.ready?.failed===0&&x.state.ready?.ready===49&&Array.isArray(x.readyCellIds)&&x.readyCellIds.length===49&&new Set(x.readyCellIds).size===49,'ready49 menu checkpoint');
 need(JSON.stringify(r?.beforeGC?.readyCellIds)===JSON.stringify(r?.afterGC?.readyCellIds)&&JSON.stringify(r?.beforeGC?.state?.position)===JSON.stringify(r?.afterGC?.state?.position),'steady coverage/position');
 need(value?.memPeak?.n>0&&Number.isFinite(value.memPeak.page)&&Number.isFinite(value.memPeak.gpu),'process sampled peak');
 need(Number.isFinite(r?.steady?.heap)&&Number.isFinite(r?.steady?.gl?.total)&&Number.isFinite(r?.steady?.proc?.page)&&Number.isFinite(r?.steady?.proc?.gpu)&&Array.isArray(r?.memLate),'steady heap/GL/process/late');
 need(r?.host?.seed===null&&r.host.cpuThrottle===3&&r.host.bootcpu===true&&['rng','finalRng'].every(k=>r[k]?.provider==='edl-owned-fnv1a-mulberry32-v1'&&r[k].ordinaryAtImport===true&&r[k].hookOwned===true&&r[k].baseSeed===0x5EED),'ordinary EDL');
 need(r?.provenance?.sourceHash===pins.conditions.sourceHash&&r.provenance.catalogSha256===pins.conditions.catalogSha256&&r.provenance.buildDir===pins.conditions.dir,'source/catalog');
 need(r?.conditions?.settings?.preset==='high'&&r.conditions.settings.device==='deck'&&JSON.stringify(r.conditions.viewport)==='[1280,800]'&&r.conditions.readyRadius===832,'graphics/radius');
 need(t?.enabled===true&&t.dropped===0&&t.overflow&&Object.values(t.overflow).every(n=>n===0)&&t.resourceCapture?.truncatedCount===0&&t.flags&&Object.keys(t.flags).every(k=>!/error|fallback|rejected/i.test(k)),'trace');
 need(Array.isArray(r?.phaseMarks)&&r.phaseMarks.length>0&&r.phaseMarks.every(p=>p.proc&&p.completed?.epochMs>=p.requested?.epochMs&&p.completed.epochMs<=r.gcCheckpointStarted?.epochMs),'preGC phase markers');
 need(Array.isArray(t?.rows)&&Math.abs(t.rows.reduce((sum,row)=>sum+row.exclusiveWorkMs,0)-t.workUnionMs)<.001,'exclusive work reconciliation');
 need(['raisedland.activate','raisedland.alignObjects'].every(name=>t?.rows?.find(row=>row.name===name)?.steps===1),'activate/align1');
 const c=r?.cache;
 if(variant==='generated')need(c===null&&t?.counters?.['raisedland.cleanCalls']===1,'generated clean1');
 else{
  need(c?.source==='cache'&&c.phase==='restored'&&c.hit===true&&c.fatal===false&&c.cleaned===true&&c.bufferHeld===false&&!c.reason&&t?.counters?.['raisedland.cleanCalls']===0&&c.precleanHash===pins.conditions.precleanHash&&c.wireSha256===pins.conditions.wireSha256&&c.expectedWireSha256===pins.conditions.wireSha256&&c.rawSha256===pins.conditions.rawSha256&&c.expectedRawSha256===pins.conditions.rawSha256&&c.bytes===pins.conditions.wireBytes&&c.encoding==='gzip','cache clean0/wire/raw');
  need(t?.rows?.every(row=>row.workerWorkMs===0&&row.workerBatches===0&&!(/cleanContours/.test(row.name)&&row.steps>0)),'cache no clean/worker work');
 }
 return{ok:reasons.length===0,reasons};
}
try{
 if(!Object.entries(before).every(([key,row])=>row.sha256===pins.files[key].sha256))throw Error('Reviewed input pin changed before launch');
 const snapshots=path.join(ROOT,variant+'-measured-inputs');fs.mkdirSync(snapshots);
 for(const [key,row]of Object.entries(pins.files)){const bytes=fs.readFileSync(row.path);if(hash(bytes)!==before[key].sha256)throw Error('Input changed during snapshot: '+key);const copy=path.join(snapshots,key+path.extname(row.path));fs.writeFileSync(copy,bytes,{flag:'wx'});record.provenance[key].copy=copy;}
 stdout=fs.openSync(stdoutFile,'wx');stderr=fs.openSync(stderrFile,'wx');record.status='running';record.startedEpochMs=Date.now();save();
 const child=spawn(argv[0],argv.slice(1),{cwd:REPO,stdio:['ignore',stdout,stderr],env:{...process.env}});record.pid=child.pid??null;record.pidKind='Actual spawned npm launcher; renderer process epoch is separately in raw startupHost';save();
 const status=await new Promise(resolve=>{child.once('error',error=>{record.spawnError=String(error);save();});child.once('close',(code,signal)=>resolve({code,signal}));});
 record.finishedEpochMs=Date.now();record.processStatus=status.code;record.signal=status.signal;record.status=record.spawnError?'spawn-error':'returned';save();
 if(record.processStatus!==0||record.signal||record.spawnError)throw Error('Foreground process did not return cleanly');
 const bytes=fs.readFileSync(raw);record.rawSha256=hash(bytes);record.singleAdmission=singleAdmission(JSON.parse(bytes));
 if(!record.singleAdmission.ok)throw Error('First attempt admission failed: '+record.singleAdmission.reasons.join('; '));
 record.ok=true;
}catch(error){record.failure=String(error?.stack||error);record.ok=false;if(record.status!=='returned'&&record.status!=='spawn-error')record.status='failed-before-return';}
finally{
 if(stdout!==undefined)fs.closeSync(stdout);if(stderr!==undefined)fs.closeSync(stderr);
 record.finishedEpochMs??=Date.now();
 try{record.observedAfter=files();record.provenanceUnchanged=Object.entries(record.observedAfter).every(([key,row])=>row.sha256===before[key].sha256&&row.sha256===pins.files[key].sha256);}catch(error){record.provenanceError=String(error);record.provenanceUnchanged=false;}
 record.outputsAfter={raw:output(raw),stdout:output(stdoutFile),stderr:output(stderrFile)};
 record.rawSha256=record.outputsAfter.raw.sha256;record.stdoutSha256=record.outputsAfter.stdout.sha256;record.stderrSha256=record.outputsAfter.stderr.sha256;
 record.wrapper.afterSha256=hash(fs.readFileSync(record.wrapper.path));record.wrapper.unchanged=record.wrapper.sha256===record.wrapper.afterSha256;
 record.ok=record.ok&&record.provenanceUnchanged&&record.wrapper.unchanged;if(!record.provenanceUnchanged||!record.wrapper.unchanged)record.failure??='Input/wrapper provenance changed';save();
}
console.log(JSON.stringify({variant,ok:record.ok,record:recordFile,pid:record.pid,processStatus:record.processStatus,signal:record.signal,rawSha256:record.rawSha256,provenanceUnchanged:record.provenanceUnchanged,singleAdmission:record.singleAdmission,failure:record.failure}));
if(!record.ok)process.exitCode=1;
