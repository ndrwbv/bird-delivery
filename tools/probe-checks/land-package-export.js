/* Host export run only; stays in the ordinary menu and never changes RNG/world state. */
if(!await until(()=>['ready','failed'].includes(window.__landPackage17bExport?.meta()?.phase),300000))throw Error('Ordinary land export did not finish');
const meta=window.__landPackage17bExport.meta();
if(meta.phase!=='ready'||meta.error||meta.cleanCalls!==1||meta.randomCalls!==0||!meta.summary?.byteExact)throw Error('Ordinary land export rejected: '+JSON.stringify(meta));
return{ok:true,meta,state:d.S.state,descriptor:d.LAND_RNG?.()||null,crash:d.crashlog.entries()};
