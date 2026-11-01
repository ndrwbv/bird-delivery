/* Opt-in export acceptance only. No imports from game/main/platform/i18n, no files, UUID or RNG creation. */
import {captureResult} from './checkpoint-codec.js';
import {precleanHash} from './preclean.js';
import {acceptCleanRoundtrip} from './landcache-accept.js';
import {Sha256} from './sha256.js';
import {makeInputIdentity,preparationQuery} from './landcache-identity.js';
const hash=text=>new Sha256().update(new TextEncoder().encode(text)).hex();
const ok=(v,c)=>{if(!v)throw Error('land-export17a:'+c);};
export function createLandExporter({manifest,host,expose,work=(_n,fn)=>fn(),mark=()=>{},flag=()=>{},base64=bytes=>{let text='';for(let i=0;i<bytes.length;i+=4096)text+=String.fromCharCode(...bytes.subarray(i,i+4096));return btoa(text);}}){
 let phase='new',stage='new',failure=null,identity=null,bytes=null,summary=null,completed=false,cleanCalls=0,randomCalls=0,error=null;
 const fail=e=>{failure={stage,message:String(e?.message||e),budget:e?.budget||null};phase='failed';bytes=null;summary=null;error=String(e?.message||e);flag('landExportRejected');};
 const metadata=()=>({version:1,phase,stage,failure,identity,manifestHash:manifest?.manifestHash,summary,error,cleanCalls,randomCalls,bytes:bytes?.length||0});
 const api={meta:metadata,chunk(offset,length){ok(phase==='ready'&&Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(length)&&length>0&&length<=65536&&offset+length<=bytes.length,'CHUNK');return base64(bytes.subarray(offset,offset+length));},release(){bytes=null;phase='released';}};
 expose(api);
 return {fail,beforeClean({source,cores,parameters,runtime,query}){try{
  ok(phase==='new'&&manifest?.version===1&&manifest.mode==='steam'&&manifest.mapId===runtime.mapId,'MANIFEST');
  ok(runtime.mode==='steam'&&runtime.adult===true&&runtime.career===true&&runtime.intro===false&&runtime.editor===false&&runtime.streamed===true&&runtime.graphics==='high','UNSUPPORTED_MODE');
  ok(host?.seed!==null&&host?.seed!==undefined&&Number(host.seed)===manifest.seed&&host.bootcpu===true&&runtime.externalSeed===true,'UNVERIFIED_RNG');
  const q=preparationQuery(query);
  ok(!new URLSearchParams(query).has('landcache')&&!q.some(([k])=>['editor','mapcheck','fullterrain','oldland','nolate'].includes(k)),'UNSUPPORTED_FLAG');
  stage='preclean';const preclean=work('raisedland.export.precleanHash',()=>precleanHash({cover:source.cover,green:source.green,cores,parameters,limits:manifest.limits||{}}));
  identity=makeInputIdentity({manifest,preclean,runtime,query,parameters});
  phase='prepared';stage='cleanContours';mark('raisedland.export.preclean',{hash:preclean});
 }catch(e){fail(e);throw e;}},watch(iterator){ok(phase==='prepared'&&cleanCalls===0,'GENERATOR_PHASE');cleanCalls++;const invoke=(kind,value)=>{const previous=Math.random;Math.random=()=>{randomCalls++;return previous();};try{const result=iterator[kind](value);if(kind==='next'&&result.done)completed=true;else if(kind==='return')fail(Error('GENERATOR_CANCELLED'));return result;}catch(e){fail(e);throw e;}finally{Math.random=previous;}};return{[Symbol.iterator](){return this;},next:v=>invoke('next',v),return:v=>invoke('return',v),throw:v=>invoke('throw',v)};},afterClean({source,skip}){try{
  ok(phase==='prepared'&&completed&&cleanCalls===1&&randomCalls===0,'GENERATOR_NOT_SUCCESSFUL_OR_RANDOM');
  stage='capture';const snapshot=work('raisedland.export.capture',()=>captureResult(source,{prepared:true,completed:true,deferDraw:true,limits:manifest.limits||{}}));
  stage='roundtrip';const result=work('raisedland.export.roundtrip',()=>acceptCleanRoundtrip(source,snapshot,identity,{limits:manifest.limits||{},skip}));
  stage='fileHash';bytes=result.bytes;summary={...result.summary,source:'generated',fileSha256:work('raisedland.export.fileHash',()=>new Sha256().update(bytes).hex()),runtimeInputHash:hash(identity.flags.runtime)};phase='ready';stage='ready';mark('raisedland.export.ready',{bytes:bytes.length,sha256:summary.fileSha256});return metadata();
 }catch(e){fail(e);throw e;}}};
}
