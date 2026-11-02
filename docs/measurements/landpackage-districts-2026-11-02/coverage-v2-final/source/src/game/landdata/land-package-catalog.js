/* Small local catalog; no fetch, decompression, scene or global singleton. */
import {need,isHash,canonical,checkManifest,makeIdentity} from './land-package-key.js';
const clone=value=>JSON.parse(JSON.stringify(value));
export const PRODUCT_LAND_COVERAGE=Object.freeze([
 {district:0,graphics:'mid'},{district:0,graphics:'high'},{district:3,graphics:'high'},{district:7,graphics:'high'},
].map(slot=>Object.freeze(slot)));
const slotKey=slot=>slot.district+':'+slot.graphics;
function coverageRows(rows,entries){
 need(Array.isArray(rows)&&rows.length>0&&rows.length<=16,'COVERAGE_COUNT');
 const hashes=new Set(entries.map(e=>e.precleanHash)),seen=new Set();
 const owned=rows.map(row=>{
  need(row&&Object.getPrototypeOf(row)===Object.prototype&&Object.keys(row).sort().join(',')==='district,graphics,precleanHash','COVERAGE_FIELDS');
  need(Number.isSafeInteger(row.district)&&!Object.is(row.district,-0)&&row.district>=0&&row.district<=7&&['mid','high'].includes(row.graphics),'COVERAGE_SLOT');
  need(isHash(row.precleanHash)&&hashes.has(row.precleanHash),'COVERAGE_REFERENCE');
  const key=slotKey(row);need(!seen.has(key),'DUPLICATE_COVERAGE');seen.add(key);
  return{district:row.district,graphics:row.graphics,precleanHash:row.precleanHash};
 });
 return owned.sort((a,b)=>a.district-b.district||(['mid','high'].indexOf(a.graphics)-['mid','high'].indexOf(b.graphics)));
}
function entry(e){
 need(e&&Object.getPrototypeOf(e)===Object.prototype&&Object.keys(e).sort().join(',')==='bytes,encoding,path,precleanHash,rawBytes,rawSha256,sha256','ENTRY_FIELDS');
 need(['precleanHash','sha256','rawSha256'].every(k=>isHash(e[k])),'ENTRY_HASH');
 need(['identity','gzip'].includes(e.encoding)&&['bytes','rawBytes'].every(k=>Number.isSafeInteger(e[k])&&e[k]>0),'ENTRY_SIZE_ENCODING');
 need(e.path==='city-data/'+e.sha256+'.land'+(e.encoding==='gzip'?'.gz':''),'LOCAL_CONTENT_PATH');
 if(e.encoding==='identity')need(e.bytes===e.rawBytes&&e.sha256===e.rawSha256,'IDENTITY_CONTENT');
 return clone(e);
}
export function createCatalog(manifest,entries,{coverage}={}){
 checkManifest(manifest);need(Array.isArray(entries)&&entries.length>0&&entries.length<=64,'CATALOG_COUNT');
 const owned=entries.map(entry).sort((a,b)=>a.precleanHash<b.precleanHash?-1:a.precleanHash>b.precleanHash?1:0);
 need(new Set(owned.map(e=>e.precleanHash)).size===owned.length,'DUPLICATE_INPUT');
 return{version:coverage===undefined?1:2,kind:'land-package17b-catalog',manifest:clone(manifest),entries:owned,...(coverage===undefined?{}:{coverage:coverageRows(coverage,owned)})};
}
export function checkCatalog(catalog){
 need(catalog&&Object.getPrototypeOf(catalog)===Object.prototype&&[1,2].includes(catalog.version)&&catalog.kind==='land-package17b-catalog','CATALOG_VERSION');
 need(Object.keys(catalog).sort().join(',')===(catalog.version===1?'entries,kind,manifest,version':'coverage,entries,kind,manifest,version'),'CATALOG_FIELDS');
 if(catalog.version===2)need(Array.isArray(catalog.coverage),'COVERAGE_COUNT');
 return createCatalog(catalog.manifest,catalog.entries,catalog.version===2?{coverage:catalog.coverage}:{});
}
export function assertProductCoverage(catalog){
 const checked=checkCatalog(catalog),required=new Set(PRODUCT_LAND_COVERAGE.map(slotKey));
 need(checked.version===2&&checked.coverage.length===required.size&&checked.coverage.every(slot=>required.has(slotKey(slot))),'PRODUCT_COVERAGE');
 return checked;
}
export function lookupCatalog(catalog,{manifest,precleanHash}){
 checkManifest(manifest);need(isHash(precleanHash),'PRECLEAN_HASH');const checked=checkCatalog(catalog);
 if(canonical(checked.manifest)!==canonical(manifest))return{hit:false,reason:'input-mismatch'};
 const found=checked.entries.find(e=>e.precleanHash===precleanHash);
 return found?{hit:true,entry:found,identity:makeIdentity(manifest,precleanHash)}:{hit:false,reason:'input-miss'};
}
