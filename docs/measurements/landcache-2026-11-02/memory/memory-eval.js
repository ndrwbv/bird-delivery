/* Draft only: existing --mem helpers, one identical menu-ready checkpoint, no driving/state changes. */
if(!window.__glmem||typeof memProc!=='function')throw Error('--mem/PRELUDE helpers required');
const q=new URLSearchParams(location.search),variant=q.has('landcache')?'cache':'generated',host=window.__startupHost;
if(!host||host.seed!=='7'||host.cpuThrottle!==3||!host.bootcpu||q.get('startupdistrict')!=='0'||q.get('gfx')!=='high')throw Error('Unexpected memory conditions');
const expectedSHA='40d8f28821b28ed37330fb23485ca8306cab17931e2ecfd09093b293aa367e08';
const stream=d.LAND_STREAM,radius=832,PZ=d.PZ_CUR,MB=1048576,marks=[],observed=new Set();
if(!stream||!PZ||d.DIST.cur()!==0||d.S.state!=='title')throw Error('Expected untouched newbie menu/district0');
const stamp=()=>({pageMs:performance.now(),epochMs:Date.now()});
const cacheMeta=()=>window.__landCache17a?.meta?.()||null;
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
const manifest=window.__landExport17aManifest;
if(manifest?.sourceHash!=='fdb6923c13afc8f369b8c02931174fb953706d52fb5d3f347683dab0f2f6fcce'||manifest.buildHash!=='382750aa2e2bf4cbfc5943c08b05c1b333f65ac419668c6f5c0d3917ba17760a'||d.DIST.opened()!==1||d.DIST.city()||d.CITYOPEN.seen())throw Error('Wrong manifest/newbie state');
const out={variant,host,provenance:{sourceHash:manifest.sourceHash,buildHash:manifest.buildHash,manifestHash:manifest.manifestHash},clock:{pageTimeOrigin:performance.timeOrigin},conditions:{url:location.href,physicalDeck:false,startupTimingRun:false,readyRadius:radius,readyPoint:{x:PZ.bx,z:PZ.bz},viewport:[innerWidth,innerHeight],settings:{preset:d.GFX?.preset,device:d.GFX?.dev}},phaseMarks:marks,nominalPollMs:{probeProcessPeak:200,glmemHeapPeak:100,evalPhaseObservation:50},gcAvailable:typeof window.gc==='function'};
let watching=false;
try{
  if(host.platform==='darwin'){if(!await watch('menu-build-to-ready'))throw Error('Memory window did not open');watching=true;out.watchStarted=stamp();}
  else out.watchUnavailable='Existing footprint watch is macOS-only; process PEAK remains available';
  await mark('mainwork-menu');
  const deadline=performance.now()+300000;
  while(!ready()&&performance.now()<deadline){
    const meta=cacheMeta();if(meta?.reason)throw Error('Cache failure: '+meta.reason);
    const p=phase();if(['generated-clean','decoding','preparing'].includes(p))await mark(p);
    await wait(50);
  }
  if(!ready())throw Error('Full/local support did not become ready');
  // The menu naturally prepares radius832. Wait for a fixed short idle window at that same radius in both variants.
  const cells=stream.stats.ready;await wait(500);if(!ready()||stream.stats.ready!==cells)throw Error('Ready-cell set not steady');
  out.beforeGC={at:stamp(),state:state(),readyCellIds:Array.from(stream.ready, (v,i)=>v?i:-1).filter(i=>i>=0)};
  if(watching){out.watchStopRequested=stamp();out.startupWindow=await unwatch('menu-build-to-ready');out.watchStopped=stamp();watching=false;}
  // Only here does existing mem() request its two GC calls; do not use mem()/lategc in the startup window.
  out.gcCheckpointStarted=stamp();out.steady=await mem('steady-after-ready');out.gcCheckpointEnded=stamp();out.afterGC={state:state(),readyCellIds:Array.from(stream.ready,(v,i)=>v?i:-1).filter(i=>i>=0)};
  out.memLate=memLate();out.glmem=window.__glmem.get();out.cache=cacheMeta();out.trace=window.__startupTrace?.report();
  out.missedPhaseMarkers=(variant==='cache'?['decoding','preparing']:['generated-clean']).filter(p=>!observed.has(p));
  if(!ready()||d.S.state!=='title'||JSON.stringify(out.beforeGC.readyCellIds)!==JSON.stringify(out.afterGC.readyCellIds))throw Error('Readiness/state changed across steady checkpoint');
  const counters=out.trace?.counters||{};
  if(variant==='cache'){
    const c=out.cache;if(!c||c.source!=='cache'||c.phase!=='restored'||!c.hit||!c.cleaned||c.bufferHeld||c.reason||c.cleanCalls!==0||c.fileSha256!==expectedSHA||c.expectedSha256!==expectedSHA||counters['raisedland.cleanCalls']!==0)throw Error('Not a verified cleaned cache hit');
  }else if(out.cache||counters['raisedland.cleanCalls']!==1)throw Error('Not the generated path');
  out.crash=d.crashlog.entries();if(out.crash.length||out.trace?.dropped||Object.keys(out.trace?.flags||{}).some(k=>/error|fallback|rejected/i.test(k)))throw Error('Memory run has errors/incomplete trace');
  out.ok=true;return out;
}catch(error){
  if(watching){try{out.startupWindow=await unwatch('menu-build-to-ready');}catch{}watching=false;}
  out.failure=String(error?.message||error);out.cache=cacheMeta();out.finalState=state();log({memoryPartial:out});throw error;
}
