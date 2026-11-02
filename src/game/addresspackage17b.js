/* Optional local data preload; it never imports platform/game or publishes live rows. */
import {decodeAddressCatalog} from './addresscodec17b.js';

const MAX_FILE=16*1024*1024;
const need=(yes,code)=>{if(!yes)throw Error('address-package17b:'+code);};
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const fields=(value,names)=>{
  if(!value||Object.getPrototypeOf(value)!==Object.prototype)return false;
  const keys=Reflect.ownKeys(value),required=names.split(',');
  return keys.length===required.length&&required.every(k=>{const d=Object.getOwnPropertyDescriptor(value,k);return d&&Object.hasOwn(d,'value')&&d.enumerable;});
};
function ownSlot(identity,entry){
  need(fields(identity,'mapId,mapHash,editsHash,sourceHash,inputHash')&&typeof identity.mapId==='string'&&/^[a-z0-9_-]{1,64}$/.test(identity.mapId)&&['mapHash','editsHash','sourceHash','inputHash'].every(k=>hash(identity[k])),'IDENTITY');
  need(fields(entry,'path,bytes,sha256')&&hash(entry.sha256)&&Number.isSafeInteger(entry.bytes)&&entry.bytes>0&&entry.bytes<=MAX_FILE&&entry.path==='address-data/'+entry.sha256+'.addr','ENTRY');
  return {identity:Object.freeze({...identity}),entry:Object.freeze({...entry})};
}
export function checkAddressPackageCatalog(value){
  const version=value&&Object.getOwnPropertyDescriptor(value,'version');
  need(version&&Object.hasOwn(version,'value')&&[1,2].includes(version.value),'CATALOG');
  if(version.value===1){
    need(fields(value,'version,kind,identity,entry')&&value.kind==='address-package17b','CATALOG');
    return Object.freeze({version:1,kind:value.kind,...ownSlot(value.identity,value.entry)});
  }
  need(fields(value,'version,kind,slots')&&value.kind==='address-package17b'&&Array.isArray(value.slots)&&Object.getPrototypeOf(value.slots)===Array.prototype&&value.slots.length===2&&Reflect.ownKeys(value.slots).length===3,'CATALOG_SLOTS');
  for(let index=0;index<2;index++)need(Object.hasOwn(Object.getOwnPropertyDescriptor(value.slots,index)||{},'value'),'CATALOG_SLOTS');
  const slots=value.slots.map(slot=>{need(fields(slot,'graphics,identity,entry')&&['mid','high'].includes(slot.graphics),'SLOT');return Object.freeze({graphics:slot.graphics,...ownSlot(slot.identity,slot.entry)});});
  need(new Set(slots.map(slot=>slot.graphics)).size===2&&new Set(slots.map(slot=>slot.entry.path)).size===2&&new Set(slots.map(slot=>slot.identity.inputHash)).size===2,'DUPLICATE_SLOT');
  need(slots.every(slot=>['mapId','mapHash','editsHash','sourceHash'].every(k=>slot.identity[k]===slots[0].identity[k])),'SLOT_BASE');
  need(slots.reduce((sum,slot)=>sum+slot.entry.bytes,0)<=MAX_FILE,'AGGREGATE_BUDGET');
  slots.sort((a,b)=>['mid','high'].indexOf(a.graphics)-['mid','high'].indexOf(b.graphics));
  return Object.freeze({version:2,kind:value.kind,slots:Object.freeze(slots)});
}
export function assertProductAddressCatalog(value){const checked=checkAddressPackageCatalog(value);need(checked.version===2,'PRODUCT_CATALOG_V2');return checked;}
export function selectAddressPackageCatalog(value,graphics){
  const checked=checkAddressPackageCatalog(value);
  if(checked.version===1)return graphics===undefined||['mid','high'].includes(graphics)?checked:null;
  const slot=checked.slots.find(slot=>slot.graphics===graphics);
  return slot?Object.freeze({version:1,kind:checked.kind,identity:slot.identity,entry:slot.entry}):null;
}
const identitySame=(a,b)=>a&&b&&['mapId','mapHash','editsHash','sourceHash','inputHash'].every(k=>a[k]===b[k]);
const digest=async bytes=>{
  need(typeof globalThis.crypto?.subtle?.digest==='function','NATIVE_CRYPTO_REQUIRED');
  return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
};
export function createAddressPackagePreloader({fetchAsset=(...args)=>fetch(...args),digestBytes=digest,timeoutMs=2000}={}){
  let phase='off',reason=null,task=null,candidate=null,wireHash=null,wireBytes=0,consumed=false,selectedGraphics=null,catalogVersion=null;
  const meta=()=>({phase,reason,wireHash,wireBytes,held:!!candidate,consumed,selectedGraphics,catalogVersion});
  async function preload({enabled=false,catalog,graphics,baseURL=globalThis.location?.href}={}){
    if(task)return task;
    if(!enabled||consumed)return meta();
    task=(async()=>{
      let controller=null,reader=null,timer=null,chunks=[],stopped=false;
      const alive=()=>need(!stopped&&!controller?.signal.aborted,'CANCELLED');
      try{
        need(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=30000,'TIMEOUT');
        const complete=checkAddressPackageCatalog(catalog);catalogVersion=complete.version;
        const checked=selectAddressPackageCatalog(complete,graphics);need(checked,'UNSUPPORTED_GRAPHICS');
        selectedGraphics=graphics??null;const entry=checked.entry;
        const here=new URL(baseURL),url=new URL(entry.path,new URL('./',here));
        need(['app:','http:','https:'].includes(here.protocol)&&url.protocol===here.protocol&&url.host===here.host&&url.pathname==='/'+entry.path&&!url.search&&!url.hash,'LOCAL_URL');
        phase='reading';controller=new AbortController();
        let rejectTimeout;
        const expired=new Promise((_,reject)=>{rejectTimeout=reject;});
        timer=setTimeout(()=>{controller.abort();rejectTimeout(Error('address-package17b:TIMEOUT'));},timeoutMs);
        const operation=(async()=>{
          const response=await fetchAsset(url.href,{signal:controller.signal,cache:'default'});
          alive();
          need(response?.ok,'HTTP_'+response?.status);
          const length=response.headers?.get('content-length');
          if(length!==null&&length!==undefined)need(/^\d+$/.test(length)&&+length===entry.bytes,'CONTENT_LENGTH');
          need(typeof response.body?.getReader==='function','STREAM');reader=response.body.getReader();
          let size=0;
          for(;;){const part=await reader.read();alive();if(part.done)break;need(part.value instanceof Uint8Array,'CHUNK');size+=part.value.length;need(size<=entry.bytes&&size<=MAX_FILE,'SIZE');chunks.push(part.value);}
          need(size===entry.bytes,'SHORT_FILE');
          const bytes=new Uint8Array(size);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.length;}chunks=[];
          phase='verifying';const actualHash=await digestBytes(bytes);alive();wireHash=actualHash;need(wireHash===entry.sha256,'FILE_SHA');
          const snapshot=decodeAddressCatalog(bytes,checked.identity);
          return Object.freeze({catalog:checked,snapshot});
        })();
        const prepared=await Promise.race([operation,expired]);
        alive();need(!consumed,'CONSUMED_EARLY');
        candidate=prepared;wireBytes=entry.bytes;phase='prepared';return meta();
      }catch(error){reason=String(error?.message||error).slice(0,240);phase='generated';candidate=null;return meta();}
      finally{stopped=true;clearTimeout(timer);controller?.abort();chunks=[];if(reader){try{Promise.resolve(reader.cancel()).catch(()=>{});}catch{}try{reader.releaseLock();}catch{}}}
    })();
    return task;
  }
  function take(identity){
    if(consumed)return null;
    consumed=true;
    const ready=candidate;candidate=null;
    if(!ready)return null;
    if(!identitySame(identity,ready.catalog.identity)){phase='generated';reason='input-mismatch';return null;}
    phase='consumed';return ready;
  }
  return Object.freeze({preload,take,meta});
}
export const ADDRESS_PACKAGE_PRELOAD17B=createAddressPackagePreloader();
