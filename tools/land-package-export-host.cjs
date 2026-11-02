/* Ordinary export host only. No renderer filesystem capability; existing 17a transport stays independent. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const need=(yes,code)=>{if(!yes)throw Error('land-package17b-export-host:'+code);};
const message=e=>String(e?.message||e).slice(0,1200);
// Admission target only: never injected into the renderer, saved progress or geometry identity.
function expectedDistrictFromArgs(argv){
 const prefix='--land-package-district=',options=argv.filter(a=>a==='--land-package-district'||a.startsWith(prefix));
 need(options.length<=1,'EXPECTED_DISTRICT_CLI');
 if(!options.length)return 0;
 const outputs=argv.filter(a=>a==='--land-package-export'||a.startsWith('--land-package-export='));
 need(outputs.length===1&&outputs[0].startsWith('--land-package-export=')&&outputs[0].length>'--land-package-export='.length,'EXPECTED_DISTRICT_REQUIRES_EXPORT');
 need(options[0].startsWith(prefix)&&/^(0|3|7)$/.test(options[0].slice(prefix.length)),'EXPECTED_DISTRICT_CLI');
 return Number(options[0].slice(prefix.length));
}
exports.expectedDistrictFromArgs=expectedDistrictFromArgs;
const inside=(root,file)=>{const rel=path.relative(root,file);return !rel||rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};
function outputPath(file,repo,dist){
 const final=path.resolve(file),roots=[fs.realpathSync(repo),fs.realpathSync(dist)];
 need(!roots.some(root=>inside(root,final))&&!fs.existsSync(final),'NEW_EXTERNAL_OUTPUT');
 // Resolve the existing ancestor before mkdir: a /tmp symlink must not redirect writes into the checkout/build.
 let parent=path.dirname(final),ancestor=parent;
 while(!fs.existsSync(ancestor)){const up=path.dirname(ancestor);need(up!==ancestor,'OUTPUT_PARENT');ancestor=up;}
 const realParent=path.resolve(fs.realpathSync(ancestor),path.relative(ancestor,parent));
 need(!roots.some(root=>inside(root,realParent)),'NEW_EXTERNAL_OUTPUT');
 fs.mkdirSync(parent,{recursive:true});parent=fs.realpathSync(parent);
 need(!roots.some(root=>inside(root,parent)),'NEW_EXTERNAL_OUTPUT');
 return path.join(parent,path.basename(final));
}

// Dependency injection is for tiny transport contracts; production always uses the filesystem receipt verifier.
exports.createLandPackageExportHost=({readExportReceipt}={})=>{
 const read=readExportReceipt||((file,options)=>import('./land-package-files.mjs').then(m=>m.readExportReceipt(file,options)));
 async function exportLandPackageResult({js,file,manifestFile,dist,repo,expectedDistrict=0}){
  need([0,3,7].includes(expectedDistrict)&&!Object.is(expectedDistrict,-0),'EXPECTED_DISTRICT');
  const {canonical,checkReceipt,makeManifest,makeIdentity,isHash,assertOrdinaryEDL}=await import('../src/game/landdata/land-package-key.js');
  const {limitsOf}=await import('../src/game/landcache17a/checkpoint-limits.js');
  const receipt=await read(manifestFile,{repo,dist}),receiptText=canonical(receipt);
  need(receipt?.version===1&&receipt.kind==='land-package17b-export-receipt'&&isHash(receipt.receiptHash)&&isHash(receipt.build?.hash),'RECEIPT');
  checkReceipt(receipt.base);need(fs.realpathSync(receipt.build.dir)===fs.realpathSync(dist),'BUILD_DIR');
  const limits=limitsOf(receipt.limits),meta=await js('window.__landPackage17bExport?.meta()');
  need(meta?.version===1&&meta.kind==='land-package17b-export'&&meta.phase==='ready'&&!meta.error&&meta.source==='generated'&&meta.cleanCalls===1&&meta.randomCalls===0,'GENERATED_RESULT');
  const s=meta.summary;
  need(s?.byteExact===true&&s.repeated===true&&s.ordinary===true&&s.source==='generated'&&s.liveRestored===false&&s.activated===false&&isHash(s.fileSha256),'ACCEPTANCE');
  need(meta.receiptHash===receipt.receiptHash&&canonical(meta.receipt)===canonical({base:receipt.base,limits:receipt.limits,receiptHash:receipt.receiptHash}),'RECEIPT_BINDING');
  const manifest=makeManifest(receipt.base,meta.actualParams);
  need(canonical(manifest)===canonical(meta.manifest)&&canonical(makeIdentity(manifest,meta.identity?.precleanHash))===canonical(meta.identity),'IDENTITY');
  const c=meta.conditions;
  need(c?.district===expectedDistrict,'DISTRICT_MISMATCH');
  need(c?.mapId===receipt.base.mapId&&c.mode==='steam'&&c.adult===true&&c.career===true&&c.intro===false&&c.editor===false&&c.streamed===true&&[0,3,7].includes(c.district)&&c.quick===false&&['mid','high'].includes(c.graphics),'CONDITIONS');
  assertOrdinaryEDL(c.descriptor);
  need(Number.isSafeInteger(meta.bytes)&&meta.bytes>0&&meta.bytes<=limits.maxPayloadBytes+limits.maxHeaderBytes+20&&s.bytes===meta.bytes,'TRANSPORT_BUDGET');
  const final=outputPath(file,repo,dist),temporary=final+'.part-'+process.pid;
  let fd,created=false,released=false,primary;
  try{
   fd=fs.openSync(temporary,'wx');created=true;const hash=crypto.createHash('sha256');
   for(let offset=0;offset<meta.bytes;offset+=65536){
    const n=Math.min(65536,meta.bytes-offset),text=await js('window.__landPackage17bExport.chunk('+offset+','+n+')');
    need(typeof text==='string'&&text.length===4*Math.ceil(n/3)&&/^[A-Za-z0-9+/]*={0,2}$/.test(text),'CHUNK');
    const bytes=Buffer.from(text,'base64');need(bytes.length===n&&bytes.toString('base64')===text,'CHUNK_LENGTH');hash.update(bytes);
    let written=0;while(written<bytes.length){const count=fs.writeSync(fd,bytes,written,bytes.length-written);need(count>0,'WRITE_STALLED');written+=count;}
   }
   need(hash.digest('hex')===s.fileSha256,'TRANSFER_SHA');
   // Detect a changed source/build/receipt during pull. This is outside all timing measurements.
   need(canonical(await read(manifestFile,{repo,dist}))===receiptText,'RECEIPT_CHANGED');
   fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
   await js('window.__landPackage17bExport.release()');released=true;
   // Hard-link publication never replaces a previous package, even if another producer won the race.
   fs.linkSync(temporary,final);fs.unlinkSync(temporary);created=false;
   return{path:final,bytes:meta.bytes,sha256:s.fileSha256,identity:meta.identity,manifest,receiptHash:receipt.receiptHash,acceptance:s,expectedDistrict,conditions:c,
    provenance:{sourceHash:receipt.base.sourceHash,buildHash:receipt.build.hash,buildDir:receipt.build.dir}};
  }catch(error){primary=error;throw error;}finally{
   const cleanup=[];
   try{if(fd!==undefined)fs.closeSync(fd);}catch(e){cleanup.push(message(e));}
   try{if(created)fs.unlinkSync(temporary);}catch(e){cleanup.push(message(e));}
   if(!released)try{await js('window.__landPackage17bExport.release()');}catch(e){cleanup.push(message(e));}
   if(primary&&cleanup.length)primary.cleanupErrors=cleanup;
  }
 }
 async function exportWithDiagnostics({js,priorEvalErr,uncaught,errors=[],allowed,args}){
  let landPackageExport=null,landPackageExportError=null,landPackageExportDiagnostics;
  try{landPackageExportDiagnostics=await js(`(()=>{let meta=null,trace=null,metaError=null,traceError=null;try{meta=window.__landPackage17bExport?.meta()||null;}catch(e){metaError=String(e?.message||e).slice(0,1200);}try{trace=window.__startupTrace?.report()||null;}catch(e){traceError=String(e?.message||e).slice(0,1200);}return{meta,trace,metaError,traceError};})()`);}catch(e){landPackageExportDiagnostics={readError:message(e)};}
  try{
   need(!priorEvalErr&&!uncaught&&!errors.length,'REFUSED_AFTER_RENDERER_ERROR');
   need(allowed,'REQUIRES_ORDINARY_SEPARATE_EXPORT');
   landPackageExport=await exportLandPackageResult({js,...args});
  }catch(e){landPackageExportError=message(e);if(e.cleanupErrors)landPackageExportDiagnostics.cleanupErrors=e.cleanupErrors;}
  return{landPackageExport,landPackageExportError,landPackageExportDiagnostics,
   evalErr:priorEvalErr||(landPackageExportError?(landPackageExportDiagnostics?.meta?.error||landPackageExportError):null)};
 }
 return{exportLandPackageResult,exportWithDiagnostics};
};
Object.assign(exports,exports.createLandPackageExportHost());
