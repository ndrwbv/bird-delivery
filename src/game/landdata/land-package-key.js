/* Pure production identity. The experimental 17a identity remains separate. */
export const CONTRACT='land-package17b-v1',RNG_PROVIDER='edl-owned-fnv1a-mulberry32-v1',BASE_SEED=0x5EED;
export const need=(yes,code)=>{if(!yes)throw Error('land-package17b:'+code);};
export const isHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const plain=value=>value&&Object.getPrototypeOf(value)===Object.prototype;
export function canonical(value){
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(Array.isArray(value))return '['+Array.from(value,canonical).join(',')+']';
 if(typeof value==='number'){need(Number.isFinite(value)&&!Object.is(value,-0),'CANONICAL_NUMBER');return JSON.stringify(value);}
 need(plain(value),'CANONICAL_OBJECT');return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
}
export function checkReceipt(receipt){
 need(plain(receipt)&&Object.keys(receipt).sort().join(',')==='editsHash,mapHash,mapId,sourceHash','RECEIPT_FIELDS');
 need(typeof receipt.mapId==='string'&&/^[a-z0-9_-]{1,64}$/.test(receipt.mapId),'RECEIPT_MAP');
 for(const key of ['mapHash','editsHash','sourceHash'])need(isHash(receipt[key]),'RECEIPT_HASH');
 return receipt;
}
function checkParameters(p){
 need(plain(p)&&Object.keys(p).sort().join(',')==='coverCell,indexCell,maskCell,minWidth,terrainG,terrainNX,terrainNZ,terrainX0,terrainZ0','PARAMETERS');
 for(const key of Object.keys(p))need(typeof p[key]==='number'&&Number.isFinite(p[key]),'PARAMETER_NUMBER');
 need(p.minWidth>0&&p.coverCell===32&&p.maskCell===32&&p.indexCell===8&&p.terrainG>0&&['terrainNX','terrainNZ'].every(k=>Number.isSafeInteger(p[k])&&p[k]>=2),'PARAMETER_VALUE');
 canonical(p);return p;
}
export function makeManifest(baseReceipt,actualParams){
 const r=checkReceipt(baseReceipt);checkParameters(actualParams);
 return{version:1,kind:'land-package17b',mapId:r.mapId,mapHash:r.mapHash,editsHash:r.editsHash,sourceHash:r.sourceHash,parameters:{...actualParams}};
}
export function checkManifest(m){
 need(plain(m)&&Object.keys(m).sort().join(',')==='editsHash,kind,mapHash,mapId,parameters,sourceHash,version','MANIFEST_FIELDS');
 need(m.kind==='land-package17b','MANIFEST_KIND');
 const {parameters,kind,version,...base}=m;need(version===1,'MANIFEST_VERSION');makeManifest(base,parameters);return m;
}
export function assertOrdinaryEDL(descriptor){need(descriptor?.provider===RNG_PROVIDER&&descriptor.ordinaryAtImport===true&&descriptor.hookOwned===true&&descriptor.baseSeed===BASE_SEED,'ORDINARY_EDL_REQUIRED');}
export function makeIdentity(manifest,precleanHash){
 const m=checkManifest(manifest);need(isHash(precleanHash),'PRECLEAN_HASH');
 return{mapId:m.mapId,mode:'streamed-deferred',mapHash:m.mapHash,editsHash:m.editsHash,sourceHash:m.sourceHash,precleanHash,seed:BASE_SEED,
 flags:{contract:CONTRACT,rngProvider:RNG_PROVIDER,parameters:canonical(m.parameters),deferDraw:true}};
}
