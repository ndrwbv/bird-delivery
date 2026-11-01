/* Ordinary export only. Pure data: no platform/main/i18n, filesystem, geometry UUID or RNG seed. */
import {captureResult} from '../landcache17a/checkpoint-codec.js';
import {acceptCleanRoundtrip} from '../landcache17a/landcache-accept.js';
import {precleanHashSteps} from '../landcache17a/preclean.js';
import {Sha256} from '../landcache17a/sha256.js';
import {limitsOf} from '../landcache17a/checkpoint-limits.js';
import {drainSteps,sliceOptions} from '../landcache17a/cooperative.js';
import {canonical,checkReceipt,makeManifest,makeIdentity,assertOrdinaryEDL,isHash} from './land-package-key.js';

const need=(yes,code)=>{if(!yes)throw Error('land-package17b-export:'+code);};
const own=value=>JSON.parse(canonical(value));
const textError=value=>{try{return String(value?.message??value).slice(0,1200);}catch{return 'Unknown export failure';}};
const plain=value=>value&&Object.getPrototypeOf(value)===Object.prototype;
const budgetError=value=>{
 const out={};for(const key of ['required','limit','bytes','pages','cells','domainCells','domainRows','ids','inputBytes','headerBytes'])if(Number.isSafeInteger(value?.[key])&&value[key]>=0)out[key]=value[key];
 return Object.keys(out).length?out:null;
};
const toBase64=bytes=>{let text='';for(let i=0;i<bytes.length;i+=4096)text+=String.fromCharCode(...bytes.subarray(i,i+4096));return btoa(text);};

/** receipt is the readonly init wrapper {base,limits,receiptHash}; descriptor must read EDL's live private ownership. */
export function createLandPackageExporter({receipt,descriptor,expose,work=(_name,fn)=>fn(),mark=()=>{},flag=()=>{},base64=toBase64,maxBytes=65536,maxItems=2048}={}){
 let input=null,limits=null,manifest=null,identity=null,conditions=null,bytes=null,summary=null;
 let phase='new',stage='new',failure=null,primary=null,cleanCalls=0,randomCalls=0,completed=false;
 let ownerContext=null,ownerSource=null,ownerRefs=null,ownerCurrent=null;
 function fail(error){
  if(!primary){primary=error instanceof Error?error:new Error(textError(error));failure={stage,message:textError(primary),budget:budgetError(error?.budget)};}
  phase='failed';bytes=null;summary=null;try{flag('landPackageExportRejected');}catch{}return primary;
 }
 const meta=()=>({version:1,kind:'land-package17b-export',source:'generated',phase,stage,
  receiptHash:input?.receiptHash||null,receipt:input&&own(input),manifest:manifest&&own(manifest),actualParams:manifest&&own(manifest.parameters),
  identity:identity&&own(identity),conditions:conditions&&own(conditions),summary:summary&&own(summary),
  failure:failure&&own(failure),error:primary?textError(primary):null,cleanCalls,randomCalls,bytes:bytes?.length||0});
 const api=Object.freeze({meta,chunk(offset,length){
  need(phase==='ready'&&Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(length)&&length>0&&length<=65536&&offset+length<=bytes.length,'CHUNK');
  return base64(bytes.subarray(offset,offset+length));
 },release(){need(phase==='ready'||phase==='released','RELEASE_PHASE');bytes=null;phase='released';}});
 expose?.(api);
 try{
  need(plain(receipt)&&Object.keys(receipt).sort().join(',')==='base,limits,receiptHash','RECEIPT_WRAPPER');
  checkReceipt(receipt.base);need(isHash(receipt.receiptHash)&&plain(receipt.limits),'RECEIPT_BINDING');
  input=own(receipt);limits=limitsOf(input.limits);sliceOptions({maxBytes,maxItems});need(typeof descriptor==='function','DESCRIPTOR_READER');
 }catch(error){throw fail(error);}
 function ordinary(){const d=descriptor();assertOrdinaryEDL(d);return{provider:d.provider,ordinaryAtImport:d.ordinaryAtImport,hookOwned:d.hookOwned,baseSeed:d.baseSeed};}
 function fresh(source){
  const m=source?.finalMask,s=source?.ST;
  need(source?.cover&&source.green&&m?.kept&&s&&s.built===false&&s.supportReady===false&&m.ready===false&&m.cells===0&&m.count===0&&m.segments?.length===0&&m.removedRegions?.length===0&&
   ['minWidth','cleanedArea','fillTriangles','fillDraw','cleanTiles','maskTriangles','maskEdges'].every(key=>s[key]===undefined),'SOURCE_NOT_FRESH');
 }
 function bound(source=ownerSource){
  need(ownerContext&&ownerContext.source===ownerSource&&source===ownerSource,'SOURCE_CHANGED');
  need(ownerRefs.every((ref,i)=>ref===[source.cover,source.green,source.finalMask,source.finalMask?.kept,source.ST][i]),'SOURCE_REFERENCES_CHANGED');
  need(ownerContext.isCurrent===ownerCurrent&&(!ownerCurrent||ownerCurrent()===true),'SOURCE_LIFETIME_CHANGED');
  need(source.ST.built===false&&source.ST.supportReady===false,'SOURCE_ALREADY_ACTIVATED');
 }
 function precleanBound(){bound();fresh(ownerSource);ordinary();}
 // Guard both sides of each resume, including return/throw. Never retain a work measurement across a yield.
 function* checked(iterator,check){
  const invoke=(kind,value)=>{check();const result=iterator[kind](value);check();return result;};
  const wrapped={[Symbol.iterator](){return this;},next:value=>invoke('next',value)};
  if(typeof iterator.return==='function')wrapped.return=value=>invoke('return',value);
  if(typeof iterator.throw==='function')wrapped.throw=value=>invoke('throw',value);
  return yield* wrapped;
 }
 function checkBefore({source,runtime,prepared,deferDraw,query=''}){
  need(runtime?.mapId===input.base.mapId&&runtime.mode==='steam'&&runtime.adult===true&&runtime.career===true&&runtime.intro===false&&runtime.editor===false&&runtime.streamed===true&&runtime.district===0&&runtime.quick===false&&runtime.externalSeed!==true&&['mid','high'].includes(runtime.graphics),'UNSUPPORTED_MODE');
  need(prepared===true&&deferDraw===true,'PREPARE_DEFER_BARRIER');
  fresh(source);
  const q=new URLSearchParams(query);need(!['landcache','landexport17a','editor','mapcheck','oldland','fullterrain','nolate'].some(k=>q.has(k)),'UNSUPPORTED_QUERY');
  conditions={mapId:runtime.mapId,mode:runtime.mode,adult:true,career:true,intro:false,editor:false,streamed:true,district:0,quick:false,graphics:runtime.graphics,descriptor:ordinary()};
 }
 function* beforeCleanSteps(context){
  let finished=false;
  try{
   need(phase==='new','BEFORE_PHASE');checkBefore(context);manifest=makeManifest(input.base,context.parameters);
   ownerContext=context;ownerSource=context.source;ownerRefs=[ownerSource.cover,ownerSource.green,ownerSource.finalMask,ownerSource.finalMask.kept,ownerSource.ST];ownerCurrent=context.isCurrent;
   need(ownerCurrent===undefined||typeof ownerCurrent==='function','SOURCE_LIFETIME_READER');precleanBound();
   phase='fingerprinting';stage='preclean';
   const precleanHash=yield* checked(precleanHashSteps({cover:ownerSource.cover,green:ownerSource.green,cores:context.cores,parameters:manifest.parameters,limits},{work,maxBytes,maxItems}),precleanBound);
   ordinary();identity=makeIdentity(manifest,precleanHash);phase='prepared';stage='cleanContours';finished=true;
   mark('land.package.export.preclean',{precleanHash});return meta();
  }catch(error){throw fail(error);}finally{if(!finished&&!primary)fail(Error('land-package17b-export:PRECLEAN_CANCELLED'));}
 }
 function watch(iterator){
  try{need(phase==='prepared'&&cleanCalls===0&&typeof iterator?.next==='function','GENERATOR_PHASE');precleanBound();cleanCalls++;}catch(error){throw fail(error);}
  const invoke=(kind,value)=>{
   try{need(phase==='prepared'&&typeof iterator[kind]==='function','GENERATOR_STATE');bound();ordinary();}catch(error){throw fail(error);}
   const previous=Math.random;
   // Count only synchronous clean resumes and preserve each returned RNG value; this does not seed the world.
   Math.random=()=>{randomCalls++;return previous();};
   try{
    const result=iterator[kind](value);bound();need(result&&typeof result.done==='boolean','GENERATOR_RESULT');
    if(kind==='next'&&result.done)completed=true;
    if(kind==='return')fail(Error('land-package17b-export:CLEAN_CANCELLED'));
    return result;
   }catch(error){throw fail(error);}finally{Math.random=previous;}
  };
  const wrapped={[Symbol.iterator](){return this;},next:value=>invoke('next',value)};
  if(typeof iterator.return==='function')wrapped.return=value=>invoke('return',value);
  if(typeof iterator.throw==='function')wrapped.throw=value=>invoke('throw',value);
  return wrapped;
 }
 function* afterCleanSteps({source,skip=null}){
  let finished=false;
  try{
   need(phase==='prepared'&&completed&&cleanCalls===1&&randomCalls===0,'CLEAN_NOT_SUCCESSFUL_OR_RANDOM');bound(source);ordinary();
   need(source?.ST?.built===false&&source.ST.supportReady===false&&source.finalMask?.ready===true,'AFTER_PHASE');
   phase='capturing';stage='capture';
   // These existing acceptance operations have format/memory ceilings, not a frame-time guarantee. Export is outside startup timing.
   const snapshot=work('land.package.export.capture',()=>captureResult(source,{prepared:true,completed:true,deferDraw:true,limits}));bound(source);yield 'land.package.export.capture';
   bound(source);ordinary();stage='roundtrip';const result=work('land.package.export.roundtrip',()=>acceptCleanRoundtrip(source,snapshot,identity,{limits,skip}));bound(source);yield 'land.package.export.roundtrip';
   stage='fileHash';const hash=new Sha256();
   for(let at=0;at<result.bytes.length;at+=maxBytes){bound(source);ordinary();work('land.package.export.fileHash',()=>hash.update(result.bytes.subarray(at,at+maxBytes)));bound(source);yield 'land.package.export.fileHash';}
   bound(source);ordinary();bytes=result.bytes;summary={...result.summary,source:'generated',ordinary:true,fileSha256:hash.hex(),workerRngInstrumented:false};
   phase='ready';stage='ready';finished=true;mark('land.package.export.ready',{bytes:bytes.length,sha256:summary.fileSha256});return meta();
  }catch(error){throw fail(error);}finally{if(!finished&&!primary)fail(Error('land-package17b-export:CAPTURE_CANCELLED'));}
 }
 return{beforeCleanSteps,beforeClean:context=>drainSteps(beforeCleanSteps(context)),watch,afterCleanSteps,afterClean:context=>drainSteps(afterCleanSteps(context)),fail};
}
