/* Ordinary17b draft: existing --mem helpers, one identical menu-ready checkpoint, no driving/state changes. */
if(!window.__glmem||typeof memProc!=='function')throw Error('--mem/PRELUDE helpers required');
const q=new URLSearchParams(location.search),variant=q.get('landpackage')==='0'?'generated':'cache',host=window.__startupHost;
if(!host||host.seed!==null||host.cpuThrottle!==3||!host.bootcpu||q.get('startupdistrict')!=='0'||q.has('gfx')||q.has('landcache')||q.has('landexport17b'))throw Error('Unexpected memory conditions');
const expected={"version":1,"dir":"/tmp/bird-ordinary17b-final-1102","fixture":"/tmp/bird-ordinary17b-prepare-1102/high-1-fixture.json","sourceHash":"0fd44d87acaaefeef93da4ac376070cd5a22474af7c4ffbf7c75e557704ec07e","precleanHash":"c7ac523ca000f3baea4d6d0e94aa122a9bccd4cf813cdb0919ca459b3a1d4dd4","wireSha256":"2ecd942570b7955f82c20fe7e11bfbcfd006b00c382e5ab044e095a2834dc8bd","rawSha256":"13b2851eaeb32e49d3f2865448a87b191ec6ef3839d747a597365e2e689aa89c","wireBytes":34231591,"rawBytes":74952828,"catalogSha256":"ff1f17e967c7f11dcdc6a929d6ef9ffb423f6b0b7a90ed546e8fab52d2d356e5","expectedReadyIds":49,"radius":832,"cpu":3,"preset":"high"};
const ordinary=()=>{const r=d.LAND_RNG?.();return r?.provider==='edl-owned-fnv1a-mulberry32-v1'&&r.ordinaryAtImport===true&&r.hookOwned===true&&r.baseSeed===0x5EED;};
if(!ordinary()||d.GFX?.preset!=='high'||d.GFX?.dev!=='deck')throw Error('Expected actual stored-high ordinary EDL');
const stream=d.LAND_STREAM,radius=832,PZ=d.PZ_CUR,MB=1048576,marks=[],observed=new Set();
if(!stream||!PZ||d.DIST.cur()!==0||d.S.state!=='title')throw Error('Expected untouched newbie menu/district0');
const stamp=()=>({pageMs:performance.now(),epochMs:Date.now()});
const cacheMeta=()=>d.LAND_PACKAGE?.meta?.()||null;
const state=()=>({state:d.S.state,paused:!!d.S.paused,bootFull:!!window.__boot?.full,lateBusy:d.LATE.busy(),supportReady:!!d.RLAND.ST.supportReady,
  ready:{...stream.stats},ready640:stream.readyAt(PZ.bx,PZ.bz,640),ready832:stream.readyAt(PZ.bx,PZ.bz,radius),position:{x:PZ.bx,z:PZ.bz}});
const phase=()=>variant==='cache'?cacheMeta()?.phase:(d.RLAND.ST.supportReady?'activated':d.RLAND.ST.minWidth!==undefined?'generated-clean':'mainwork');
const ready=()=>window.__boot?.full&&!d.LATE.busy()&&d.RLAND.ST.supportReady&&stream.readyAt(PZ.bx,PZ.bz,radius)&&stream.stats.failed===0;
async function mark(label){
  if(observed.has(label))return;observed.add(label);
  const before=stamp(),phaseBefore=phase(),s=state(),heapRawMiB=performance.memory?performance.memory.usedJSHeapSize/MB:null;
  const proc=await memProc(label,false); // Existing process marker: NO forced GC during startup.
  marks.push({label,requested:before,completed:stamp(),phaseBefore,phaseAfter:phase(),state:s,heapRawMiB,proc});
  if(!proc)throw Error('Process memory marker did not return: '+label);
}
if(d.DIST.opened()!==1||d.DIST.city()||d.CITYOPEN.seen())throw Error('Wrong newbie state');
const out={variant,host,rng:d.LAND_RNG(),expectedProvenance:expected,clock:{pageTimeOrigin:performance.timeOrigin},conditions:{url:location.href,physicalDeck:false,startupTimingRun:false,readyRadius:radius,readyPoint:{x:PZ.bx,z:PZ.bz},viewport:[innerWidth,innerHeight],settings:{preset:d.GFX?.preset,device:d.GFX?.dev}},phaseMarks:marks,nominalPollMs:{probeProcessPeak:200,glmemHeapPeak:100,evalPhaseObservation:50},gcAvailable:typeof window.gc==='function'};
if(!out.gcAvailable)throw Error('Existing mem() two-GC checkpoint unavailable');
const ids=()=>Array.from(stream.ready,(v,i)=>v?i:-1).filter(i=>i>=0);
let watching=false;
try{
  if(host.platform==='darwin'){if(!await watch('ordinary-menu-build-to-ready'))throw Error('Memory window did not open');watching=true;out.watchStarted=stamp();}
  else out.watchUnavailable='Existing footprint watch is macOS-only; process PEAK remains available';
  await mark('mainwork-menu');
  const deadline=performance.now()+300000;
  while(!ready()&&performance.now()<deadline){
    const meta=cacheMeta();if(meta?.reason)throw Error('Cache failure: '+meta.reason);
    const p=phase();if(['generated-clean','reading','inputCopy','fileHash','decompressing','rawCopy','rawHash','decoding','preparing'].includes(p))await mark(p);
    await wait(50);
  }
  if(!ready())throw Error('Full/local support did not become ready');
  // The menu naturally prepares radius832. Wait for a fixed short idle window at that same radius in both variants.
  const cells=stream.stats.ready,stableIds=ids();await wait(500);if(!ready()||cells!==49||stream.stats.ready!==cells||JSON.stringify(stableIds)!==JSON.stringify(ids()))throw Error('Ready-cell set not steady');
  out.beforeGC={at:stamp(),state:state(),readyCellIds:ids()};
  if(watching){out.watchStopRequested=stamp();out.startupWindow=await unwatch('ordinary-menu-build-to-ready');out.watchStopped=stamp();watching=false;}
  // Only here does existing mem() request its two GC calls; do not use mem()/lategc in the startup window.
  out.gcCheckpointStarted=stamp();out.steady=await mem('steady-after-ready');out.gcCheckpointEnded=stamp();out.afterGC={state:state(),readyCellIds:ids()};
  out.memLate=memLate();out.glmem=window.__glmem.get();out.cache=cacheMeta();out.trace=window.__startupTrace?.report();out.raised={...d.RLAND.ST};out.finalRng=d.LAND_RNG();
  out.missedPhaseMarkers=(variant==='cache'?['reading','inputCopy','fileHash','decompressing','rawCopy','rawHash','decoding','preparing']:['generated-clean']).filter(p=>!observed.has(p));
  if(!ready()||d.S.state!=='title'||JSON.stringify(out.beforeGC.readyCellIds)!==JSON.stringify(out.afterGC.readyCellIds))throw Error('Readiness/state changed across steady checkpoint');
  const counters=out.trace?.counters||{};
  if(variant==='cache'){
    const c=out.cache;if(!c||c.source!=='cache'||c.phase!=='restored'||!c.hit||!c.cleaned||c.bufferHeld||c.reason||c.fatal!==false||c.precleanHash!==expected.precleanHash||c.wireSha256!==expected.wireSha256||c.expectedWireSha256!==expected.wireSha256||c.rawSha256!==expected.rawSha256||c.expectedRawSha256!==expected.rawSha256||c.bytes!==expected.wireBytes||c.encoding!=='gzip'||counters['raisedland.cleanCalls']!==0)throw Error('Not a verified cleaned cache hit');
  }else if(out.cache||counters['raisedland.cleanCalls']!==1)throw Error('Not the generated path');
  out.crash=d.crashlog.entries();if(out.crash.length||out.trace?.dropped||Object.keys(out.trace?.flags||{}).some(k=>/error|fallback|rejected/i.test(k)))throw Error('Memory run has errors/incomplete trace');
  if(!ordinary())throw Error('Ordinary EDL changed during memory checkpoint');
  if(!['raisedland.activate','raisedland.alignObjects'].every(name=>out.trace.rows.find(row=>row.name===name)?.steps===1))throw Error('Expected one activate/align');
  if(variant==='cache'&&(out.trace.rows.some(row=>row.workerWorkMs!==0||row.workerBatches!==0||/cleanContours/.test(row.name)&&row.steps>0)||['workers','workerBatches','workerFallbacks'].some(key=>out.raised[key]!==undefined&&out.raised[key]!==0)))throw Error('Cache performed worker/clean work');
  if(out.trace.overflow&&Object.values(out.trace.overflow).some(n=>n!==0))throw Error('Trace overflow');
  // Metadata fetch is AFTER startup watch and steady GC measurement. Never read the large payload again.
  out.provenanceReadStarted=stamp();
  const response=await fetch('./city-data/catalog.json');if(!response.ok)throw Error('Catalog metadata unavailable');
  const text=await response.text(),hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  const catalogSha256=Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join(''),catalog=JSON.parse(text),entry=catalog.entries?.find(e=>e.precleanHash===expected.precleanHash);
  if(catalogSha256!==expected.catalogSha256||catalog.manifest?.sourceHash!==expected.sourceHash||entry?.sha256!==expected.wireSha256||entry?.rawSha256!==expected.rawSha256||entry.bytes!==expected.wireBytes||entry.rawBytes!==expected.rawBytes)throw Error('Final-build catalog binding changed');
  out.provenance={sourceHash:catalog.manifest.sourceHash,catalogSha256,buildDir:expected.dir};out.provenanceReadEnded=stamp();
  if(!ready()||d.S.state!=='title'||JSON.stringify(out.afterGC.readyCellIds)!==JSON.stringify(ids()))throw Error('Metadata observation changed ready stage');
  out.ok=true;return out;
}catch(error){
  if(watching){try{out.startupWindow=await unwatch('ordinary-menu-build-to-ready');}catch{}watching=false;}
  out.failure=String(error?.message||error);out.cache=cacheMeta();out.finalState=state();log({memoryPartial:out});throw error;
}
