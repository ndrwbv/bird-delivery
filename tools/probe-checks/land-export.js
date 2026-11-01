/* Export-only acceptance, not startup timing. No startRun/tp/restore/live game state modifications. */
const meta=window.__landExport17a?.meta()||null;
const ok=!!(meta&&meta.phase==='ready'&&!meta.error&&meta.summary?.byteExact&&meta.summary.liveRestored===false&&meta.cleanCalls===1&&meta.randomCalls===0);
return{ok,meta,trace:window.__startupTrace?.report(),export:meta?.summary,identity:meta?.identity,cleanCalls:meta?.cleanCalls,randomCalls:meta?.randomCalls,liveSupportAfterNormalPipeline:d.RLAND.ST.supportReady,liveBuiltAfterNormalPipeline:d.RLAND.ST.built};
