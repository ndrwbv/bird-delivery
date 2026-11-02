/* Optional local data preload; it never imports platform/game or publishes live rows. */
import {decodeAddressCatalog} from './addresscodec17b.js';

const MAX_FILE=16*1024*1024;
const need=(yes,code)=>{if(!yes)throw Error('address-package17b:'+code);};
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const fields=(value,names)=>value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).sort().join(',')===names.split(',').sort().join(',');
export function checkAddressPackageCatalog(value){
  need(fields(value,'version,kind,identity,entry')&&value.version===1&&value.kind==='address-package17b','CATALOG');
  const i=value.identity,e=value.entry;
  need(fields(i,'mapId,mapHash,editsHash,sourceHash,inputHash')&&typeof i.mapId==='string'&&i.mapId.length>0&&i.mapId.length<=64&&['mapHash','editsHash','sourceHash','inputHash'].every(k=>hash(i[k])),'IDENTITY');
  need(fields(e,'path,bytes,sha256')&&hash(e.sha256)&&Number.isSafeInteger(e.bytes)&&e.bytes>0&&e.bytes<=MAX_FILE&&e.path==='address-data/'+e.sha256+'.addr','ENTRY');
  return Object.freeze({version:1,kind:value.kind,identity:Object.freeze({...i}),entry:Object.freeze({...e})});
}
const identitySame=(a,b)=>a&&b&&['mapId','mapHash','editsHash','sourceHash','inputHash'].every(k=>a[k]===b[k]);
const digest=async bytes=>{
  need(typeof globalThis.crypto?.subtle?.digest==='function','NATIVE_CRYPTO_REQUIRED');
  return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
};
export function createAddressPackagePreloader({fetchAsset=(...args)=>fetch(...args),digestBytes=digest,timeoutMs=2000}={}){
  let phase='off',reason=null,task=null,candidate=null,wireHash=null,wireBytes=0,consumed=false;
  const meta=()=>({phase,reason,wireHash,wireBytes,held:!!candidate,consumed});
  async function preload({enabled=false,catalog,baseURL=globalThis.location?.href}={}){
    if(task)return task;
    if(!enabled||consumed)return meta();
    task=(async()=>{
      let controller=null,reader=null,timer=null,chunks=[],stopped=false;
      const alive=()=>need(!stopped&&!controller?.signal.aborted,'CANCELLED');
      try{
        need(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=30000,'TIMEOUT');
        const checked=checkAddressPackageCatalog(catalog),entry=checked.entry;
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
