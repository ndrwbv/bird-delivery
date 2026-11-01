/* Host-only bounded pull. Renderer has data accessors, never fs/Node/IPC write capabilities. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
exports.exportLandResult=async({js,file,manifestFile,dist,repo})=>{
 const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8')),expected=manifest.manifestHash,copy={...manifest};delete copy.manifestHash;
 if(crypto.createHash('sha256').update(JSON.stringify(copy)).digest('hex')!==expected||fs.realpathSync(manifest.buildDir)!==fs.realpathSync(dist))throw Error('land-export: manifest/build mismatch');
 const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
 if(digest(JSON.stringify(manifest.buildFiles))!==manifest.buildHash||digest(JSON.stringify(manifest.sourceFiles))!==manifest.sourceHash)throw Error('land-export: list digest');
 for(const[base,list]of [[dist,manifest.buildFiles],[repo,manifest.sourceFiles]])for(const row of list){const p=path.resolve(base,row.path),rel=path.relative(path.resolve(base),p);if(rel.startsWith('..')||path.isAbsolute(rel)||digest(fs.readFileSync(p))!==row.sha256)throw Error('land-export: source/build content changed');}
 const maps=manifest.sourceFiles.filter(v=>v.path.startsWith('src/maps/'+manifest.mapId+'/')&&!v.path.endsWith('/edits.json')),edit=manifest.sourceFiles.find(v=>v.path==='src/maps/'+manifest.mapId+'/edits.json');
 if(digest(JSON.stringify(maps))!==manifest.mapHash||edit?.sha256!==manifest.editsHash)throw Error('land-export: map/edits provenance');
 const meta=await js('window.__landExport17a?.meta()');if(meta?.phase!=='ready'||meta.error||!meta.summary?.byteExact||meta.summary.liveRestored!==false||meta.cleanCalls!==1||meta.randomCalls!==0||meta.identity?.sourceHash!==manifest.sourceHash||meta.manifestHash!==expected||['mapHash','editsHash','sourceHash','seed','mapId'].some(k=>meta.identity[k]!==manifest[k])||meta.identity.flags.buildHash!==manifest.buildHash)throw Error('land-export: not a verified generated result');
 const limit=manifest.limits?.maxPayloadBytes||128*1024*1024,header=manifest.limits?.maxHeaderBytes||4*1024*1024;if(!Number.isSafeInteger(meta.bytes)||meta.bytes<=0||meta.bytes>limit+header+20)throw Error('land-export: transport budget');
 const final=path.resolve(file),relative=path.relative(path.resolve(repo),final);if(!relative||!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative)||fs.existsSync(final))throw Error('land-export: choose a new external output file');
 fs.mkdirSync(path.dirname(final),{recursive:true});const temporary=final+'.part-'+process.pid;let fd,created=false;
 try{fd=fs.openSync(temporary,'wx');created=true;const hash=crypto.createHash('sha256');for(let offset=0;offset<meta.bytes;offset+=65536){const n=Math.min(65536,meta.bytes-offset),text=await js('window.__landExport17a.chunk('+offset+','+n+')');if(typeof text!=='string'||text.length>4*Math.ceil(n/3)||!/^[A-Za-z0-9+/]*={0,2}$/.test(text))throw Error('land-export: invalid chunk');const b=Buffer.from(text,'base64');if(b.length!==n)throw Error('land-export: short chunk');hash.update(b);let written=0;while(written<b.length){const count=fs.writeSync(fd,b,written,b.length-written);if(count<=0)throw Error('land-export: write stalled');written+=count;}}
 if(hash.digest('hex')!==meta.summary.fileSha256)throw Error('land-export: transfer digest');fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;if(fs.existsSync(final))throw Error('land-export: output appeared during pull');fs.linkSync(temporary,final);fs.unlinkSync(temporary);created=false;await js('window.__landExport17a.release()');return{path:final,bytes:meta.bytes,sha256:meta.summary.fileSha256,identity:meta.identity,acceptance:meta.summary};
 }finally{if(fd!==undefined)fs.closeSync(fd);if(created&&fs.existsSync(temporary))fs.unlinkSync(temporary);}
};

// Keep failed renderer evidence even when host publication is correctly refused. No geometry arrays.
exports.exportWithDiagnostics=async({js,priorEvalErr,uncaught,errors=[],allowed,args})=>{
 let landExport=null,landExportError=null,landExportDiagnostics;
 try{landExportDiagnostics=await js(`(()=>{let meta=null,trace=null,metaError=null,traceError=null;try{meta=window.__landExport17a?.meta()||null;}catch(e){metaError=String(e?.message||e);}try{trace=window.__startupTrace?.report()||null;}catch(e){traceError=String(e?.message||e);}return{meta,trace,metaError,traceError};})()`);}catch(e){landExportDiagnostics={readError:String(e?.message||e)};}
 try{
  if(priorEvalErr||uncaught||errors.length)throw Error('land-export refused after renderer/eval errors');
  if(!allowed)throw Error('land-export requires manifest/startup-trace and a separate non-timing/non-memory run');
  landExport=await exports.exportLandResult({js,...args});
 }catch(e){landExportError=String(e?.message||e);}
 return{landExport,landExportError,landExportDiagnostics,evalErr:priorEvalErr||(landExportError?(landExportDiagnostics?.meta?.error||landExportError):null)};
};
