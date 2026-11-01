/* Pure offline admission only; no process sampling, game import or execution. */
export function validateMemoryPair(generated,cache){
 const reasons=[],unavailable=[];const need=(ok,why)=>{if(!ok)reasons.push(why);},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),finite=Number.isFinite;
 const fullSHA='40d8f28821b28ed37330fb23485ca8306cab17931e2ecfd09093b293aa367e08';
 const normalized=value=>{try{const u=new URL(value);u.searchParams.delete('landcache');return u.href;}catch{return null;}};
 for(const[variant,r]of [['generated',generated],['cache',cache]]){
  const o=r?.result,a=o?.afterGC?.state,b=o?.beforeGC?.state;
  need(r?.ok===true&&o?.ok===true&&o.variant===variant&&!r.evalErr&&Array.isArray(r.errors)&&r.errors.length===0&&r.uncaught===0,variant+': report errors');
  need(o?.host?.seed==='7'&&o.host.cpuThrottle===3&&o.host.bootcpu===true,variant+': conditions');
  need(o?.provenance?.sourceHash==='fdb6923c13afc8f369b8c02931174fb953706d52fb5d3f347683dab0f2f6fcce'&&o.provenance.buildHash==='382750aa2e2bf4cbfc5943c08b05c1b333f65ac419668c6f5c0d3917ba17760a',variant+': provenance');
  need(same(o?.conditions?.viewport,[1280,800])&&o?.conditions?.settings?.preset==='high'&&o?.conditions?.settings?.device==='deck'&&o?.conditions?.readyRadius===832,variant+': viewport/preset/radius');
  for(const s of[a,b])need(s&&s.state==='title'&&s.paused===false&&s.bootFull===true&&s.lateBusy===false&&s.supportReady===true&&s.ready640===true&&s.ready832===true&&s.ready?.failed===0,variant+': not same ready stage');
  const ids=o?.afterGC?.readyCellIds;
  need(Array.isArray(ids)&&ids.length>0&&same(ids,o?.beforeGC?.readyCellIds)&&ids.length===a?.ready?.ready&&same(b?.position,a?.position),variant+': cells not stable');
  need(r?.memPeak&&finite(r.memPeak.page)&&finite(r.memPeak.gpu)&&r.memPeak.n>0&&finite(r.memPeak.pageT)&&finite(r.memPeak.gpuT),variant+': missing sampled process peak/count/time');
  need(o?.steady&&o.steady.proc&&finite(o.steady.proc.page)&&finite(o.steady.proc.gpu)&&o.steady.gl&&finite(o.steady.gl.total)&&Array.isArray(o.memLate),variant+': missing steady/GL/late data');
  need(typeof o?.gcAvailable==='boolean'&&(o?.watchUnavailable||finite(o?.watchStopped?.epochMs)&&o.watchStopped.epochMs<=o?.gcCheckpointStarted?.epochMs),variant+': GC before startup window end');
  const w=o?.startupWindow;if(!w||!finite(w.foot0)||!finite(w.foot1)||w.n<=0||!finite(w.ms))unavailable.push(variant+': footprint peak');
  need(!o?.trace?.dropped&&Array.isArray(o?.crash)&&o.crash.length===0,variant+': trace/crash');
  const count=o?.trace?.counters?.['raisedland.cleanCalls'];
  if(variant==='generated')need(o?.cache===null&&count===1,'generated: wrong source');
  else{const c=o?.cache;need(c?.source==='cache'&&c.phase==='restored'&&c.hit===true&&c.cleaned===true&&c.bufferHeld===false&&!c.reason&&c.cleanCalls===0&&count===0&&c.fileSha256===fullSHA&&c.expectedSha256===fullSHA,'cache: wrong hit/cleanup/SHA');}
 }
 const a=generated?.result,b=cache?.result;
 need(same(a?.provenance,b?.provenance)&&normalized(a?.conditions?.url)!==null&&normalized(a?.conditions?.url)===normalized(b?.conditions?.url),'pair: input URL/provenance differ');
 need(a?.host?.processEpochMs!==b?.host?.processEpochMs,'pair: processes not distinct');
 need(same(a?.afterGC?.readyCellIds,b?.afterGC?.readyCellIds)&&same(a?.afterGC?.state?.position,b?.afterGC?.state?.position)&&a?.afterGC?.state?.ready?.total===b?.afterGC?.state?.ready?.total,'pair: ready coverage differs');
 need(a?.gcAvailable===b?.gcAvailable,'pair: GC availability differs');
 if(!a?.gcAvailable||!b?.gcAvailable)unavailable.push('after-forced-GC JS heap');
 return{ok:reasons.length===0,reasons,unavailable,notes:'Memory pair only. No physical Deck claim; peaks are different measures, do not sum asynchronous component maxima.'};
}
