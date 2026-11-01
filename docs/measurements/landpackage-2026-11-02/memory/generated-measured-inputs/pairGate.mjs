/* Offline ordinary17b pair admission; existing memory helpers only, no FS/process/game. */
import {createHash} from 'node:crypto';
const EXPECTED={"version":1,"dir":"/tmp/bird-ordinary17b-final-1102","fixture":"/tmp/bird-ordinary17b-prepare-1102/high-1-fixture.json","sourceHash":"0fd44d87acaaefeef93da4ac376070cd5a22474af7c4ffbf7c75e557704ec07e","precleanHash":"c7ac523ca000f3baea4d6d0e94aa122a9bccd4cf813cdb0919ca459b3a1d4dd4","wireSha256":"2ecd942570b7955f82c20fe7e11bfbcfd006b00c382e5ab044e095a2834dc8bd","rawSha256":"13b2851eaeb32e49d3f2865448a87b191ec6ef3839d747a597365e2e689aa89c","wireBytes":34231591,"rawBytes":74952828,"catalogSha256":"ff1f17e967c7f11dcdc6a929d6ef9ffb423f6b0b7a90ed546e8fab52d2d356e5","expectedReadyIds":49,"radius":832,"cpu":3,"preset":"high"};
const ROOT='/tmp/bird-ordinary17b-memory',REPO='/Users/andrewboev/Desktop/not-work/delivery';
const hash=text=>createHash('sha256').update(text).digest('hex');
const normalize=value=>{try{const u=new URL(value);u.searchParams.delete('landpackage');return u.href;}catch{return null;}};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),finite=Number.isFinite;
const ordinary=r=>r?.provider==='edl-owned-fnv1a-mulberry32-v1'&&r.ordinaryAtImport===true&&r.hookOwned===true&&r.baseSeed===0x5EED;
export function validateMemoryPair(generatedRaw,cacheRaw,{generatedRun,cacheRun,observedHashes}={}){
 const reasons=[],unavailable=[],need=(v,why)=>{if(!v)reasons.push(why);};let generated,cache;
 try{need(typeof generatedRaw==='string'&&typeof cacheRaw==='string','raw report text required for byte SHA');generated=JSON.parse(generatedRaw);cache=JSON.parse(cacheRaw);}catch{return{ok:false,reasons:['raw report JSON unreadable'],unavailable};}
 for(const[variant,r,record,raw]of [['generated',generated,generatedRun,generatedRaw],['cache',cache,cacheRun,cacheRaw]]){
  const o=r?.result,a=o?.afterGC?.state,b=o?.beforeGC?.state,t=o?.trace,rows=Array.isArray(t?.rows)?t.rows:[];
  need(r?.ok===true&&o?.ok===true&&o.variant===variant&&!r.evalErr&&Array.isArray(r.errors)&&r.errors.length===0&&r.uncaught===0,variant+': report errors');
  need(o?.host?.seed===null&&o.host.cpuThrottle===3&&o.host.bootcpu===true&&ordinary(o.rng)&&ordinary(o.finalRng),variant+': ordinary conditions');
  need(o?.provenance?.sourceHash===EXPECTED.sourceHash&&o.provenance.catalogSha256===EXPECTED.catalogSha256&&o.provenance.buildDir===EXPECTED.dir,variant+': final-build/catalog provenance');
  need(same(o?.conditions?.viewport,[1280,800])&&o.conditions.settings?.preset==='high'&&o.conditions.settings.device==='deck'&&o.conditions.readyRadius===832&&o.conditions.physicalDeck===false&&o.conditions.startupTimingRun===false,variant+': viewport/preset/radius');
  for(const s of[a,b])need(s&&s.state==='title'&&s.paused===false&&s.bootFull===true&&s.lateBusy===false&&s.supportReady===true&&s.ready640===true&&s.ready832===true&&s.ready?.failed===0,variant+': not same ready stage');
  const ids=o?.afterGC?.readyCellIds;
  need(Array.isArray(ids)&&ids.length===49&&new Set(ids).size===49&&ids.every((v,i)=>Number.isSafeInteger(v)&&v>=0&&(!i||v>ids[i-1]))&&same(ids,o?.beforeGC?.readyCellIds)&&ids.length===a?.ready?.ready&&same(b?.position,a?.position),variant+':49 stable ready IDs');
  need(r?.memPeak&&finite(r.memPeak.page)&&finite(r.memPeak.gpu)&&r.memPeak.n>0&&finite(r.memPeak.pageT)&&finite(r.memPeak.gpuT),variant+': sampled process peak missing');
  need(o?.steady&&o.steady.proc&&finite(o.steady.proc.page)&&finite(o.steady.proc.gpu)&&finite(o.steady.heap)&&o.steady.gl&&finite(o.steady.gl.total)&&Array.isArray(o.memLate),variant+': steady/GL/late missing');
  need(o?.gcAvailable===true&&(o.watchUnavailable||finite(o?.watchStopped?.epochMs)&&o.watchStopped.epochMs<=o?.gcCheckpointStarted?.epochMs),variant+': startup watch not closed before2GC');
  need(Array.isArray(o?.phaseMarks)&&o.phaseMarks.length>0&&o.phaseMarks.every(mark=>finite(mark.requested?.epochMs)&&finite(mark.completed?.epochMs)&&mark.completed.epochMs>=mark.requested.epochMs&&mark.completed.epochMs<=o.gcCheckpointStarted?.epochMs&&mark.proc),variant+': no-GC phase markers missing');
  need(finite(o?.gcCheckpointEnded?.epochMs)&&o.gcCheckpointEnded.epochMs>=o.gcCheckpointStarted?.epochMs&&o.provenanceReadStarted?.epochMs>=o.gcCheckpointEnded.epochMs,variant+': GC/metadata chronology');
  const w=o?.startupWindow;if(!w||!finite(w.foot0)||!finite(w.foot1)||w.n<=0||!finite(w.ms))unavailable.push(variant+': footprint peak');
  need(t?.enabled===true&&t.dropped===0&&['rows','marks','flags','counters'].every(k=>t.overflow?.[k]===0)&&t.resourceCapture?.truncatedCount===0&&t.flags&&Object.keys(t.flags).every(k=>!/error|fallback|rejected/i.test(k))&&Array.isArray(o?.crash)&&o.crash.length===0,variant+': trace/crash');
  need(Array.isArray(t?.rows)&&finite(t?.workUnionMs)&&Math.abs(t.rows.reduce((n,row)=>n+row.exclusiveWorkMs,0)-t.workUnionMs)<.001,variant+': work accounting');
  need(['raisedland.activate','raisedland.alignObjects'].every(name=>rows.find(row=>row.name===name)?.steps===1),variant+': activate/align1');
  const count=t?.counters?.['raisedland.cleanCalls'];
  if(variant==='generated')need(o?.cache===null&&count===1,'generated: wrong path');
  else{const c=o?.cache;need(c?.source==='cache'&&c.phase==='restored'&&c.hit===true&&c.fatal===false&&c.cleaned===true&&c.bufferHeld===false&&!c.reason&&count===0&&c.precleanHash===EXPECTED.precleanHash&&c.wireSha256===EXPECTED.wireSha256&&c.expectedWireSha256===EXPECTED.wireSha256&&c.rawSha256===EXPECTED.rawSha256&&c.expectedRawSha256===EXPECTED.rawSha256&&c.bytes===EXPECTED.wireBytes&&c.encoding==='gzip','cache: wrong hit/cleanup/wire/raw');
   need(Array.isArray(t?.rows)&&t.rows.every(row=>row.workerWorkMs===0&&row.workerBatches===0&&!(/cleanContours/.test(row.name)&&row.steps>0))&&['workers','workerBatches','workerFallbacks'].every(k=>o.raised?.[k]===undefined||o.raised[k]===0),'cache: worker/clean work');}
  need(record?.variant===variant&&record.status==='returned'&&record.processStatus===0&&!record.signal&&!record.spawnError&&record.rawSha256===hash(raw)&&record.provenanceUnchanged===true&&record.sourceHash===EXPECTED.sourceHash&&record.buildDir===EXPECTED.dir&&record.cwd===REPO,variant+': run status/raw SHA/provenance');
  need(Number.isSafeInteger(record?.pid)&&record.pid>0&&finite(record.startedEpochMs)&&finite(record.finishedEpochMs)&&record.startedEpochMs<=o?.host?.processEpochMs&&record.finishedEpochMs>=o?.gcCheckpointEnded?.epochMs,variant+': process pid/clocks');
  need(['stdoutSha256','stderrSha256'].every(key=>typeof record?.[key]==='string'&&/^[a-f0-9]{64}$/.test(record[key])),variant+': output log SHA missing');
  for(const key of ['eval','pairGate','fixture','catalog','index','probe','probePage'])need(typeof observedHashes?.[key]==='string'&&/^[a-f0-9]{64}$/.test(observedHashes[key])&&record?.provenance?.[key]?.sha256===observedHashes[key],variant+': actual '+key+' SHA');
  need(record?.provenance?.catalog?.sha256===EXPECTED.catalogSha256,variant+': pinned catalog SHA');
  const argv=record?.argv||[],opts={},flags=[];let duplicate=false;
  for(const arg of argv.slice(4)){if(typeof arg!=='string'||!arg.startsWith('--')){duplicate=true;continue;}const at=arg.indexOf('=');if(at<0)flags.push(arg.slice(2));else{const key=arg.slice(2,at);if(Object.hasOwn(opts,key))duplicate=true;opts[key]=arg.slice(at+1);}}
  const expectedOpts={mode:'steam',dir:EXPECTED.dir,'startup-fixture':EXPECTED.fixture,size:'deck',cpu:'3',eval:ROOT+'/memory-eval.js',bootwait:'300',timeout:'600',max:'0','startup-session':opts['startup-session'],q:'gfxdev=deck&mute&startupdistrict=0'+(variant==='generated'?'&landpackage=0':''),report:ROOT+'/'+variant+'.json'};
  need(!duplicate&&same(argv.slice(0,4),['npm','run','probe','--'])&&same(Object.entries(opts).sort(),Object.entries(expectedOpts).sort())&&same(flags.sort(),['startup-trace','startup-cold','fresh','early','mem','bootcpu','errors'].sort())&&/^[a-zA-Z0-9_-]{1,64}$/.test(opts['startup-session']||''),variant+': actual argv');
 }
 const a=generated?.result,b=cache?.result;
 need(same(a?.provenance,b?.provenance)&&normalize(a?.conditions?.url)!==null&&normalize(a?.conditions?.url)===normalize(b?.conditions?.url),'pair: URL/provenance differ');
 need(a?.host?.processEpochMs!==b?.host?.processEpochMs&&generatedRun?.pid!==cacheRun?.pid,'pair: distinct processes');
 const session=record=>record?.argv?.find(arg=>arg.startsWith('--startup-session='));need(session(generatedRun)!==session(cacheRun),'pair: distinct cold sessions');
 need(same(a?.afterGC?.readyCellIds,b?.afterGC?.readyCellIds)&&same(a?.afterGC?.state?.position,b?.afterGC?.state?.position)&&a?.afterGC?.state?.ready?.total===b?.afterGC?.state?.ready?.total,'pair: coverage differs');
 return{ok:reasons.length===0,reasons,unavailable,observedSceneCounts:{geo:[a?.steady?.geo,b?.steady?.geo],tex:[a?.steady?.tex,b?.steady?.tex],programs:[a?.steady?.prog,b?.steady?.prog]},notes:'Ordinary17b n1 memory pair on emulated Deck. No physical Deck claim or exact saving claim; geo/tex differences disclosed; asynchronous component peaks never summed.'};
}
