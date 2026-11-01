/* Shared by export and future experimental reader; filenames/control flags are not geometry inputs. */
export function preparationQuery(query){return [...new URLSearchParams(query)].filter(([k])=>!['landexport17a','landcache','landcachefile','startuptrace','mute','debug','nolb'].includes(k)).sort(([a],[b])=>a<b?-1:a>b?1:0);}
export function makeInputIdentity({manifest,preclean,runtime,query,parameters}){
 for(const k of ['mapHash','editsHash','sourceHash','buildHash'])if(typeof manifest?.[k]!=='string'||!/^[a-f0-9]{64}$/.test(manifest[k]))throw Error('land-export17a:MANIFEST_HASH');
 if(!Number.isSafeInteger(manifest.seed)||!/^[a-f0-9]{64}$/.test(preclean))throw Error('land-export17a:MANIFEST_SEED');
 return{mapId:manifest.mapId,mode:'streamed-deferred',mapHash:manifest.mapHash,editsHash:manifest.editsHash,sourceHash:manifest.sourceHash,precleanHash:preclean,seed:manifest.seed,flags:{runtime:JSON.stringify(runtime),query:JSON.stringify(preparationQuery(query)),parameters:JSON.stringify(parameters),buildHash:manifest.buildHash,rngProvider:'probe-mulberry32-late-fnv1a-v1'}};
}
