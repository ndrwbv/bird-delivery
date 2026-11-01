/* Small local catalog; no fetch, decompression, scene or global singleton. */
import {need,isHash,canonical,checkManifest,makeIdentity} from './land-package-key.js';
const clone=value=>JSON.parse(JSON.stringify(value));
function entry(e){
 need(e&&Object.getPrototypeOf(e)===Object.prototype&&Object.keys(e).sort().join(',')==='bytes,encoding,path,precleanHash,rawBytes,rawSha256,sha256','ENTRY_FIELDS');
 need(['precleanHash','sha256','rawSha256'].every(k=>isHash(e[k])),'ENTRY_HASH');
 need(['identity','gzip'].includes(e.encoding)&&['bytes','rawBytes'].every(k=>Number.isSafeInteger(e[k])&&e[k]>0),'ENTRY_SIZE_ENCODING');
 need(e.path==='city-data/'+e.sha256+'.land'+(e.encoding==='gzip'?'.gz':''),'LOCAL_CONTENT_PATH');
 if(e.encoding==='identity')need(e.bytes===e.rawBytes&&e.sha256===e.rawSha256,'IDENTITY_CONTENT');
 return clone(e);
}
export function createCatalog(manifest,entries){
 checkManifest(manifest);need(Array.isArray(entries)&&entries.length>0&&entries.length<=64,'CATALOG_COUNT');
 const owned=entries.map(entry).sort((a,b)=>a.precleanHash<b.precleanHash?-1:a.precleanHash>b.precleanHash?1:0);
 need(new Set(owned.map(e=>e.precleanHash)).size===owned.length,'DUPLICATE_INPUT');
 return{version:1,kind:'land-package17b-catalog',manifest:clone(manifest),entries:owned};
}
export function checkCatalog(catalog){
 need(catalog&&Object.getPrototypeOf(catalog)===Object.prototype&&Object.keys(catalog).sort().join(',')==='entries,kind,manifest,version'&&catalog.version===1&&catalog.kind==='land-package17b-catalog','CATALOG_VERSION');
 return createCatalog(catalog.manifest,catalog.entries);
}
export function lookupCatalog(catalog,{manifest,precleanHash}){
 checkManifest(manifest);need(isHash(precleanHash),'PRECLEAN_HASH');const checked=checkCatalog(catalog);
 if(canonical(checked.manifest)!==canonical(manifest))return{hit:false,reason:'input-mismatch'};
 const found=checked.entries.find(e=>e.precleanHash===precleanHash);
 return found?{hit:true,entry:found,identity:makeIdentity(manifest,precleanHash)}:{hit:false,reason:'input-miss'};
}
