/* Appended after the unchanged startup-ready body has returned result. */
const negative=window.__landPackageNegative;
if(!negative||negative.error)throw Error('Negative observer failed: '+JSON.stringify(negative));
const meta=d.LAND_PACKAGE?.meta(),report=result.report;
const row=name=>report.rows.find(r=>r.name===name),steps=name=>row(name)?.steps||0;
if(!meta||meta.source!=='generated'||meta.hit!==false||meta.phase!=='fallback'||meta.fatal!==false||!meta.cleaned||meta.bufferHeld)throw Error('Fallback not clean: '+JSON.stringify(meta));
if(report.counters['raisedland.cleanCalls']!==1||steps('raisedland.activate')!==1||steps('raisedland.alignObjects')!==1)throw Error('Fallback clean/activate/align counts: '+JSON.stringify({counters:report.counters,activate:row('raisedland.activate'),align:row('raisedland.alignObjects')}));
if(steps('raisedland.cache.commit')||report.marks['raisedland.package.restored'])throw Error('Failed cache published a restore');
if(report.flags['queue.error']||report.flags['queue.workerRejected']||report.flags['landPackage.fatal'])throw Error('Unexpected scheduler failure: '+JSON.stringify(report.flags));
if(result.host?.seed!==null||result.rng?.ordinaryAtImport!==true||result.rng?.hookOwned!==true||result.rng?.provider!=='edl-owned-fnv1a-mulberry32-v1')throw Error('Not ordinary RNG: '+JSON.stringify(result.rng));
if(result.host.cpuThrottle!==3||result.host.bootcpu!==true||result.conditions.lang!=='ru'||result.conditions.graphics.preset!=='high'||result.conditions.graphics.device!=='deck'||innerWidth!==1280||innerHeight!==800)throw Error('Wrong Deck-high CPU3 conditions: '+JSON.stringify(result.conditions));
if(negative.kind==='missing-asset'){
 if(negative.injections!==1||negative.assetCalls!==1||!meta.reason.endsWith(':READ_HTTP_404'))throw Error('Missing injection/reason: '+JSON.stringify({negative,meta}));
}
if(negative.kind==='wrong-wire-sha'){
 if(negative.injections!==1||negative.assetCalls!==1||!negative.wrongFileChanged||!meta.reason.endsWith(':FILE_HASH_MISMATCH')||meta.wireSha256===meta.expectedWireSha256)throw Error('Wire SHA injection/reason: '+JSON.stringify({negative,meta}));
}
if(negative.kind==='cancel-preparing'){
 if(!negative.cancelled||negative.injections!==1||!negative.baselineCaptured||!negative.unchangedAtCancel||!meta.reason.endsWith(':ACCEPTANCE_CANCEL_PREPARING'))throw Error('Cancellation not proven: '+JSON.stringify({negative,meta}));
 for(const flags of [negative.cancelBefore,negative.cancelAfter])if(flags.built||flags.supportReady||flags.maskReady||flags.maskCells||flags.maskCount||flags.published||flags.cacheCommitSteps)throw Error('Partial readiness/publication at cancellation: '+JSON.stringify(flags));
 if(!negative.cancelAfter.meta.cleaned||negative.cancelAfter.meta.bufferHeld||negative.cancelAfter.meta.hit)throw Error('Cancellation cleanup did not precede return');
 if(!steps('raisedland.cache.decode')||!steps('raisedland.cache.prepareRestore'))throw Error('Cancel did not reach real decode/prepare');
}
if(negative.kind==='input-miss'){
 if(negative.assetCalls!==0||negative.injections!==0||meta.reason!=='input-miss'||meta.precleanHash===__SUPPORTED_PRECLEAN__||d.WIDEN.STATS.off!==true)throw Error('Real nowiden input miss not proven: '+JSON.stringify({negative,meta,widen:d.WIDEN.STATS}));
}
if(negative.kind!=='cancel-preparing'&&(steps('raisedland.cache.decode')||steps('raisedland.cache.prepareRestore')))throw Error('Rejected input reached decoder');
// Streaming can legitimately publish additional cells. Check cache-specific late writes, not a frozen global cell count.
const refs=()=>{const c=d.RLAND.cover.snapshot(),g=d.RLAND.green.snapshot();return[c.packed,c.grid,g.packed,g.grid,d.RLAND.finalMask.kept,d.RLAND.ST];};
const after=refs(),terminal=JSON.stringify(meta);await wait(300);
if(after.some((ref,i)=>ref!==refs()[i])||JSON.stringify(d.LAND_PACKAGE.meta())!==terminal||window.__startupTrace.report().rows.some(r=>r.name==='raisedland.cache.commit'&&r.steps>0)||window.__startupTrace.report().marks['raisedland.package.restored'])throw Error('Late cache publication after generated control');
return {...result,negative:{...negative,ok:true,partialPublication:0,lateCachePublication:0,expectedConsole404:0,cacheMeta:meta}};
