/* Strict 17a experiment. Cooperative work uses LATE's existing generator/wait contract. */
import {decodeCheckpointSteps,prepareRestoreResultSteps} from './checkpoint-codec.js';
import {limitsOf} from './checkpoint-limits.js';
import {precleanHashSteps} from './preclean.js';
import {makeInputIdentity,preparationQuery} from './landcache-identity.js';

export const LAND_CACHE_ASSET='app://g/__landcache17a__/result.land';
const error=code=>new Error('land-cache17a:'+code);
const need=(value,code)=>{if(!value)throw error(code);};
const direct=(_name,fn)=>fn();
const nativeDigest=bytes=>{const subtle=globalThis.crypto?.subtle;need(typeof subtle?.digest==='function','NATIVE_CRYPTO_REQUIRED');return subtle.digest('SHA-256',bytes);};

export function createLandReader({query,manifest,host,expose=()=>{},work=direct,
  steps=(_name,iterator)=>iterator,awaited=(_name,_kind,fn)=>fn(),count=()=>{},flag=()=>{},mark=()=>{},onFailure=()=>{},
  fetchAsset=(url,options)=>fetch(url,options),digest=nativeDigest,timeoutMs=30000,maxBytes=65536,maxItems=2048}={}){
  let phase='idle',identity=null,failure=null,iterator=null,generator=null,running=false,closed=false;
  let fileSha256=null,summary=null,controller=null,activeWait=null,serial=0,readBytes=0,bufferHeld=false,cleaned=true,notified=false;
  const meta=()=>({version:1,source:'cache',phase,hit:phase==='restored',cleanCalls:0,
    reason:failure?.message||null,bytes:readBytes,bufferHeld,cleaned,fileSha256,expectedSha256:host?.landCacheSha256||null,
    identity:identity&&{...identity,flags:{...identity.flags}},summary:summary&&{...summary}});
  function notifyFailure(){if(failure&&cleaned&&!notified){notified=true;onFailure(meta());}}
  function cleanGlobals(){bufferHeld=false;activeWait=null;controller=null;cleaned=true;notifyFailure();}
  function close(){if(generator&&!running&&!closed){closed=true;try{generator.return();}finally{cleanGlobals();}}else if(!generator)notifyFailure();}
  function fail(value){
    if(phase==='restored')return failure||value;
    if(!failure){failure=value instanceof Error?value:error(String(value));phase='failed';serial++;
      controller?.abort();activeWait?.reject(failure);flag('landCacheRejected');
    }
    notifyFailure();
    return failure;
  }
  const cancel=(reason='CANCELLED')=>{if(phase!=='restored'){fail(error(reason));close();}};
  const assertReady=()=>{if(phase!=='restored'){const reason=fail(failure||error('NOT_RESTORED'));close();throw reason;}return summary;};
  const sync=()=>activeWait?activeWait.sync():assertReady();
  expose({meta,cancel});count('raisedland.cleanCalls',0);
  const initial=new URLSearchParams(query);
  if(initial.getAll('landcache').length!==1||initial.get('landcache')!=='1'||initial.has('landexport17a'))fail(error('EXPLICIT_FLAG_REQUIRED'));
  else if(['editor','mapcheck','fullterrain','oldland','nolate'].some(key=>initial.has(key)))fail(error('UNSUPPORTED_FLAG'));

  async function readBinary(signal,alive,limit){
    const response=await fetchAsset(LAND_CACHE_ASSET,{cache:'no-store',signal});alive();
    need(response?.ok,'READ_HTTP_'+(response?.status??'UNKNOWN'));
    const length=response.headers?.get('content-length');
    if(length!==null&&length!==undefined)need(/^\d+$/.test(length)&&Number.isSafeInteger(+length)&&+length>0&&+length<=limit,'CONTENT_LENGTH');
    need(typeof response.body?.getReader==='function','STREAM_REQUIRED');
    const reader=response.body.getReader(),chunks=[];let total=0;
    try{
      for(;;){alive();const part=await reader.read();alive();if(part.done)break;
        need(part.value instanceof Uint8Array,'READ_CHUNK');total+=part.value.length;
        need(Number.isSafeInteger(total)&&total<=limit,'READ_LIMIT');chunks.push(part.value);readBytes=total;}
      need(total>0,'EMPTY_FILE');if(length!==null&&length!==undefined)need(total===+length,'SHORT_FILE');
      return {chunks:chunks.splice(0),total};
    }finally{chunks.length=0;reader.releaseLock?.();}
  }
  function waitJob(name,kind,start){
    const job={ready:false,value:undefined,error:null,reject:null,traceKind:kind,traceName:kind==='cacheIO'?'queue.cacheReadWait':'queue.cacheHashWait'};
    const cancelled=new Promise((_resolve,reject)=>{job.reject=reject;});cancelled.catch(()=>{});
    activeWait=job;
    job.wait=awaited(name,kind,()=>{
      let raw;try{raw=work(name+'.dispatch',start);}catch(value){raw=Promise.reject(value);}
      return Promise.race([raw,cancelled]);
    });
    job.wait.then(value=>{job.ready=true;job.value=value;},value=>{job.ready=true;job.error=fail(value);close();});
    job.sync=()=>{if(failure||!job.ready||job.error){const reason=fail(failure||job.error||error('ASYNC_READ_NOT_READY'));close();throw reason;}return job.value;};
    job.label=name;return job;
  }
  function readSteps({source,cores,parameters,runtime,query:currentQuery=query}={}){
    if(iterator)return iterator;
    const token=serial;cleaned=false;
    const alive=()=>{if(token!==serial||failure)throw failure||error('STALE_READ');};
    function* checked(name,it){
      try{for(;;){alive();const result=it.next();if(result.done)return result.value;yield result.value;}}
      finally{it.return?.();}
    }
    generator=(function*(){
      let transport=null,input=null,snapshot=null,commit=null,timer=null;
      try{
        alive();need(manifest?.version===1&&manifest.mode==='steam'&&manifest.mapId===runtime?.mapId,'MANIFEST');
        need(runtime.mode==='steam'&&runtime.adult===true&&runtime.career===true&&runtime.intro===false&&runtime.streamed===true&&runtime.graphics==='high'&&runtime.editor===false,'UNSUPPORTED_MODE');
        need(host?.seed!==null&&host?.seed!==undefined&&Number(host.seed)===manifest.seed&&host.bootcpu===true&&runtime.externalSeed===true,'UNVERIFIED_RNG');
        need(host.landCacheManifestHash===manifest.manifestHash,'HOST_MANIFEST_BINDING');
        need(typeof host.landCacheSha256==='string'&&/^[a-f0-9]{64}$/.test(host.landCacheSha256),'FILE_HASH_REQUIRED');
        need(new URLSearchParams(currentQuery).get('landcache')==='1'&&!preparationQuery(currentQuery).some(([key])=>['editor','mapcheck','fullterrain','oldland','nolate'].includes(key)),'UNSUPPORTED_FLAG');
        need(Number.isSafeInteger(timeoutMs)&&timeoutMs>0,'TIMEOUT_CONFIG');
        const limits=limitsOf(manifest.limits||{}),options={limits,work,maxBytes,maxItems};
        phase='preclean';
        const preclean=yield* steps('raisedland.cache.precleanHash',checked('preclean',precleanHashSteps({cover:source.cover,green:source.green,cores,parameters,limits},options)));
        identity=makeInputIdentity({manifest,preclean,runtime,query:currentQuery,parameters});
        alive();phase='reading';controller=new AbortController();
        timer=setTimeout(()=>cancel('READ_TIMEOUT'),timeoutMs);
        transport=yield waitJob('raisedland.cache.read','cacheIO',()=>readBinary(controller.signal,alive,limits.maxHeaderBytes+limits.maxPayloadBytes+20));
        alive();activeWait=null;clearTimeout(timer);timer=null;
        need(transport&&Array.isArray(transport.chunks)&&Number.isSafeInteger(transport.total),'READ_RESULT');
        phase='inputCopy';input=new Uint8Array(transport.total);bufferHeld=true;
        let at=0;
        for(let i=0;i<transport.chunks.length;i++){
          const chunk=transport.chunks[i];
          for(let start=0;start<chunk.length;start+=maxBytes){alive();const piece=chunk.subarray(start,start+maxBytes);
            work('raisedland.cache.inputCopy',()=>input.set(piece,at));at+=piece.length;yield 'land-cache17a:inputCopy';}
          transport.chunks[i]=null;
        }
        transport=null;alive();
        phase='fileHash';timer=setTimeout(()=>cancel('HASH_TIMEOUT'),timeoutMs);
        const hash=yield waitJob('raisedland.cache.fileHash','cacheHash',()=>digest(input));
        alive();activeWait=null;clearTimeout(timer);timer=null;
        need(hash instanceof ArrayBuffer&&hash.byteLength===32,'DIGEST_RESULT');
        fileSha256=Array.from(new Uint8Array(hash),value=>value.toString(16).padStart(2,'0')).join('');
        need(fileSha256===host.landCacheSha256,'FILE_HASH_MISMATCH');
        phase='decoding';snapshot=yield* steps('raisedland.cache.decode',checked('decode',decodeCheckpointSteps(input,identity,options)));
        phase='preparing';commit=yield* steps('raisedland.cache.prepareRestore',checked('prepare',prepareRestoreResultSteps(source,snapshot,{...options,prepared:true})));
        alive();need(typeof commit==='function','PREPARED_COMMIT');
        work('raisedland.cache.commit',commit);
        summary={source:'cache',hit:true,cleanCalls:0,bytes:input.length,fileSha256};
        phase='restored';mark('raisedland.cache.restored',{bytes:input.length,fileSha256});return summary;
      }catch(value){throw fail(value);}
      finally{clearTimeout(timer);transport=null;input=null;snapshot=null;commit=null;cleanGlobals();}
    })();
    iterator={
      [Symbol.iterator](){return this;},
      next(value){running=true;try{const result=generator.next(value);if(result.done)closed=true;return result;}finally{running=false;}},
      return(value){cancel('GENERATOR_CANCELLED');closed=true;return generator.return(value);},
      throw(value){running=true;try{return generator.throw(value);}finally{running=false;}}
    };
    return iterator;
  }
  return {readSteps,sync,assertReady,cancel,meta,get failed(){return phase==='failed';},get ready(){return phase==='restored';}};
}
