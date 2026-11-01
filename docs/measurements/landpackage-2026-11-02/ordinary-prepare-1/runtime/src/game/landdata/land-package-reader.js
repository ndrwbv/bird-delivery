/* Ordinary local package reader. Strict landcache17a stays a separate terminal experiment. */
import {lookupCatalog} from './land-package-catalog.js';
import {assertOrdinaryEDL,checkManifest,canonical} from './land-package-key.js';
import {precleanHashSteps} from '../landcache17a/preclean.js';
import {decodeCheckpointSteps,prepareRestoreResultSteps} from '../landcache17a/checkpoint-codec.js';
import {limitsOf} from '../landcache17a/checkpoint-limits.js';
import {sliceOptions} from '../landcache17a/cooperative.js';

const direct=(_name,fn)=>fn();
const fault=code=>new Error('land-package-reader:'+code);
const need=(yes,code)=>{if(!yes)throw fault(code);};
const nativeDigest=bytes=>{need(typeof globalThis.crypto?.subtle?.digest==='function','NATIVE_CRYPTO_REQUIRED');return globalThis.crypto.subtle.digest('SHA-256',bytes);};
const envelope=Symbol('land-package-wait');

export function createLandPackageReader({catalog,manifest,descriptor,query='',trustedLimits,assetBase,
  fetchAsset=(url,options)=>fetch(url,options),digest=nativeDigest,timeoutMs=30000,maxBytes=65536,maxItems=2048,
  work=direct,steps=(_name,it)=>it,awaited=(_name,_kind,fn)=>fn(),mark=()=>{},flag=()=>{},count=()=>{},onResult=()=>{}}={}){
  let phase='idle',reason=null,iterator=null,gen=null,ctx=null,refs=null,running=false,closed=false,serial=0;
  let controller=null,stream=null,wait=null,timer=null,transport=null,input=null,snapshot=null,commit=null;
  let cleaned=true,committed=false,fatal=false,notified=false,precleanHash=null,wireSha256=null,rawSha256=null,entry=null,bytes=0;
  const meta=()=>({version:1,source:committed?'cache':'generated',phase,hit:committed,fatal,reason,
    cleaned,bufferHeld:!!(transport||input||snapshot||commit),precleanHash,wireSha256,
    expectedWireSha256:entry?.sha256||null,rawSha256,expectedRawSha256:entry?.rawSha256||null,bytes,encoding:entry?.encoding||null});
  const diagnostic=(fn,...args)=>{try{fn(...args);}catch{/* Diagnostics cannot change a committed result. */}};
  function notify(){if(cleaned&&!notified){notified=true;diagnostic(onResult,meta());}}
  function cleanup(){clearTimeout(timer);timer=null;controller?.abort();controller=null;
    if(stream){try{Promise.resolve(stream.cancel()).catch(()=>{});}catch{}stream=null;}
    transport=null;input=null;snapshot=null;commit=null;wait=null;cleaned=true;}
  function setFailure(value,isFatal=false){if(committed&&!isFatal)return;
    if(!reason||isFatal)reason=String(value?.message||value).slice(0,240);fatal||=isFatal;phase=fatal?'fatal':'fallback';serial++;
    controller?.abort();wait?.settle(false,fault(reason));}
  function cancel(why='CANCELLED'){
    if(committed||closed)return;
    try{if(refs)fresh();setFailure(fault(why));}catch(error){setFailure(error,true);}
    if(gen&&!running){try{gen.return(false);}finally{closed=true;cleanup();notify();}}
    else if(!gen){closed=true;cleanup();notify();}
  }
  function badTarget(code){const error=fault(code);error.landPackageFatal=true;throw error;}
  function fresh(){
    const s=ctx?.source;if(!s?.cover||!s.green||!s.finalMask||!s.ST)badTarget('TARGET_REQUIRED');
    if(ctx.isCurrent&&ctx.isCurrent()!==true)badTarget('TARGET_LIFETIME_CHANGED');
    if(refs&&!refs.every((v,i)=>v===[s.cover,s.green,s.finalMask,s.finalMask.kept,s.ST][i]))badTarget('TARGET_REFERENCES_CHANGED');
    const m=s.finalMask;
    if(s.ST.built!==false||s.ST.supportReady!==false||m.ready!==false||m.cells!==0||m.count!==0||m.segments?.length!==0||m.removedRegions?.length!==0)badTarget('TARGET_NOT_FRESH');
  }
  function alive(token){if(token!==serial||reason)throw fault(reason||'CANCELLED');fresh();}
  function localURL(path){
    const current=new URL(globalThis.location?.href||assetBase||'app://birdpizza/');
    const base=new URL(assetBase||'./',current),url=new URL(path,base);
    const local=base.protocol==='app:'&&base.protocol===current.protocol&&base.host===current.host;
    const dev=['http:','https:'].includes(base.protocol)&&globalThis.location?.href&&base.origin===new URL(globalThis.location.href).origin;
    need((local||dev)&&base.pathname==='/'&&!base.search&&!base.hash&&url.protocol===base.protocol&&url.host===base.host&&!url.search&&!url.hash,'LOCAL_URL');
    return url.href;
  }
  async function inflate(token,limit){
    need(typeof globalThis.DecompressionStream==='function','GZIP_UNSUPPORTED');
    const wire=input,body=new ReadableStream({start(c){c.enqueue(wire);c.close();}}).pipeThrough(new DecompressionStream('gzip'));
    const reader=body.getReader(),chunks=[];stream=reader;let total=0,complete=false;
    try{for(;;){alive(token);const part=await reader.read();alive(token);if(part.done)break;
        need(part.value instanceof Uint8Array,'GZIP_CHUNK');total+=part.value.length;
        need(Number.isSafeInteger(total)&&total<=entry.rawBytes&&total<=limit,'GZIP_LIMIT');chunks.push(part.value);}
      need(total===entry.rawBytes,'GZIP_LENGTH');complete=true;return{chunks:chunks.splice(0),total};
    }finally{chunks.length=0;if(!complete){try{Promise.resolve(reader.cancel()).catch(()=>{});}catch{}}try{reader.releaseLock();}catch{}if(stream===reader)stream=null;}
  }
  function* copyInput(token,name){
    input=new Uint8Array(transport.total);let at=0;
    for(let i=0;i<transport.chunks.length;i++){
      const chunk=transport.chunks[i];for(let start=0;start<chunk.length;start+=maxBytes){alive(token);const part=chunk.subarray(start,start+maxBytes);work(name,()=>input.set(part,at));at+=part.length;yield name;}transport.chunks[i]=null;
    }
    transport=null;
  }
  const hashString=hash=>{need(hash instanceof ArrayBuffer&&hash.byteLength===32,'DIGEST_RESULT');return Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');};
  async function read(url,signal,token,limit){
    const response=await fetchAsset(url,{cache:'default',signal});alive(token);
    need(response?.ok,'READ_HTTP_'+(response?.status??'UNKNOWN'));
    const length=response.headers?.get('content-length');
    if(length!=null)need(/^\d+$/.test(length)&&Number.isSafeInteger(+length)&&+length===entry.bytes&&+length<=limit,'CONTENT_LENGTH');
    need(typeof response.body?.getReader==='function','STREAM_REQUIRED');
    const reader=response.body.getReader(),chunks=[];stream=reader;let total=0,complete=false;
    try{for(;;){alive(token);const part=await reader.read();alive(token);if(part.done)break;
        need(part.value instanceof Uint8Array,'READ_CHUNK');total+=part.value.length;
        need(Number.isSafeInteger(total)&&total<=entry.bytes&&total<=limit,'READ_LIMIT');chunks.push(part.value);bytes=total;}
      need(total===entry.bytes,'SHORT_FILE');complete=true;return{chunks:chunks.splice(0),total};
    }finally{chunks.length=0;if(!complete){try{Promise.resolve(reader.cancel()).catch(()=>{});}catch{}}try{reader.releaseLock?.();}catch{}if(stream===reader)stream=null;}
  }
  // LATE invokes sync before generator.next. Failure must cross that boundary as a value.
  function waiting(name,kind,start){
    let settled=false,resolve;const job={traceKind:kind,traceName:kind==='cacheIO'?'queue.cacheReadWait':'queue.cacheHashWait',label:name};
    job.wait=awaited(name,kind,()=>new Promise(done=>{resolve=done;}));
    job.settle=(ok,value)=>{if(settled)return;settled=true;clearTimeout(timer);timer=null;job.result={tag:envelope,ok,...(ok?{value}:{error:value})};resolve(job.result);};
    job.sync=()=>{if(!settled){cancel('SYNC_PENDING');job.settle(false,fault('SYNC_PENDING'));}return job.result;};
    wait=job;timer=setTimeout(()=>{setFailure(fault(kind==='cacheIO'?'READ_TIMEOUT':'HASH_TIMEOUT'));job.settle(false,fault(reason));},timeoutMs);
    try{Promise.resolve(work(name+'.dispatch',start)).then(value=>job.settle(true,value),value=>job.settle(false,value));}
    catch(value){job.settle(false,value);}
    return job;
  }
  function valueOf(result){need(result?.tag===envelope,'WAIT_RESULT');if(!result.ok)throw result.error;wait=null;return result.value;}
  function* checked(it,token){try{for(;;){alive(token);const r=it.next();if(r.done)return r.value;yield r.value;}}finally{it.return?.();}}
  function tryReadSteps(context){
    if(iterator)return iterator;
    ctx=context;const token=serial;
    gen=(function*(){
      cleaned=false;
      try{
        if(reason)return false;
        fresh();refs=[ctx.source.cover,ctx.source.green,ctx.source.finalMask,ctx.source.finalMask.kept,ctx.source.ST];
        need(ctx.prepared===true&&ctx.deferDraw===true,'PREPARED_DEFERRED_REQUIRED');
        const r=ctx.runtime;need(r?.mode==='steam'&&r.adult===true&&r.career===true&&r.streamed===true&&r.intro===false&&r.editor===false&&r.quick===false&&['mid','high'].includes(r.graphics)&&r.mapId===manifest?.mapId,'UNSUPPORTED_MODE');
        if(r.district!==0){reason='unsupported-district';phase='fallback';return false;}
        const q=new URLSearchParams(query);need(!['landcache','landexport17a','landexport17b','editor','mapcheck','fullterrain','oldland','nolate'].some(k=>q.has(k)),'UNSUPPORTED_QUERY');
        assertOrdinaryEDL(descriptor?.());
        need(trustedLimits&&typeof trustedLimits==='object','TRUSTED_LIMITS_REQUIRED');
        need(Number.isSafeInteger(timeoutMs)&&timeoutMs>0,'TIMEOUT_CONFIG');sliceOptions({maxBytes,maxItems});
        const limits=limitsOf(trustedLimits),options={limits,work,maxBytes,maxItems};
        const expected=checkManifest({...manifest,parameters:ctx.parameters});
        if(canonical(expected.parameters)!==canonical(manifest.parameters)){reason='input-mismatch';phase='fallback';return false;}
        phase='preclean';precleanHash=yield* steps('raisedland.cache.precleanHash',checked(precleanHashSteps({cover:ctx.source.cover,green:ctx.source.green,cores:ctx.cores,parameters:ctx.parameters},options),token));
        const found=lookupCatalog(catalog,{manifest:expected,precleanHash});
        if(!found.hit){reason=found.reason;phase='fallback';return false;}
        entry=found.entry;
        const limit=limits.maxHeaderBytes+limits.maxPayloadBytes+20;need(entry.bytes<=limit&&entry.rawBytes<=limit,'WIRE_LIMIT');
        const url=localURL(entry.path);alive(token);controller=new AbortController();phase='reading';
        transport=valueOf(yield waiting('raisedland.cache.read','cacheIO',()=>read(url,controller.signal,token,limit)));
        alive(token);phase='inputCopy';yield* copyInput(token,'raisedland.cache.inputCopy');phase='fileHash';
        const hash=valueOf(yield waiting('raisedland.cache.fileHash','cacheHash',()=>digest(input)));alive(token);
        wireSha256=hashString(hash);need(wireSha256===entry.sha256,'FILE_HASH_MISMATCH');
        if(entry.encoding==='gzip'){
          phase='decompressing';transport=valueOf(yield waiting('raisedland.cache.decompress','cacheIO',()=>inflate(token,limit)));alive(token);input=null;
          phase='rawCopy';yield* copyInput(token,'raisedland.cache.rawCopy');phase='rawHash';
          rawSha256=hashString(valueOf(yield waiting('raisedland.cache.rawHash','cacheHash',()=>digest(input))));alive(token);
        }else rawSha256=wireSha256;
        need(input.length===entry.rawBytes&&rawSha256===entry.rawSha256,'RAW_HASH_MISMATCH');
        phase='decoding';snapshot=yield* steps('raisedland.cache.decode',checked(decodeCheckpointSteps(input,found.identity,options),token));
        phase='preparing';commit=yield* steps('raisedland.cache.prepareRestore',checked(prepareRestoreResultSteps(ctx.source,snapshot,{...options,prepared:true}),token));
        alive(token);assertOrdinaryEDL(descriptor?.());need(typeof commit==='function','PREPARED_COMMIT');
        // Once entered, a commit exception is fatal: never clean over potentially installed state.
        phase='committing';try{work('raisedland.cache.commit',commit);}catch(error){error.landPackageFatal=true;throw error;}
        committed=true;phase='restored';diagnostic(mark,'raisedland.package.restored',{bytes,wireSha256});return true;
      }catch(error){try{fresh();}catch(changed){error=changed;}setFailure(error,!!error?.landPackageFatal||phase==='committing');if(fatal)throw error;return false;}
      finally{cleanup();closed=true;if(!committed)diagnostic(flag,fatal?'landPackage.fatal':'landPackage.generated');notify();}
    })();
    iterator={
      [Symbol.iterator](){return this;},
      next(value){if(closed){if(!committed&&refs){try{fresh();}catch(error){setFailure(error,true);}}if(fatal){const error=fault(reason);error.landPackageFatal=true;throw error;}return{done:true,value:committed};}running=true;try{return gen.next(value);}finally{running=false;}},
      return(){cancel('GENERATOR_CANCELLED');return{done:true,value:committed};},
      throw(error){if(closed)throw error;running=true;try{return gen.throw(error);}finally{running=false;}}
    };
    return iterator;
  }
  count('raisedland.cleanCalls',0);
  return{tryReadSteps,cancel,meta,get fatal(){return fatal;}};
}
