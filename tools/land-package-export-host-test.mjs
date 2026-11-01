/* Transport and verified-receipt boundary only; source/build inventory itself belongs to land-package-files. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import host from './land-package-export-host.cjs';
import {fixture,receipt} from './land-package-export-fixture.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'land-package-export-host-')),repo=path.join(dir,'repo'),dist=path.join(dir,'build');
fs.mkdirSync(repo);fs.mkdirSync(dist);let checks=0;
const hash=b=>createHash('sha256').update(b).digest('hex');
const verified={version:1,kind:'land-package17b-export-receipt',...structuredClone(receipt),build:{dir:dist,hash:'e'.repeat(64),files:[]},source:{files:[],normalizedLockHash:'d'.repeat(64),buildConfig:{}}};
const args={manifestFile:path.join(dir,'receipt.json'),dist,repo};
function setup({mutate=()=>{},bytes=null,chunk,release,read}={}){
 const s=fixture();s.ready();const meta=s.endpoint.meta(),original=s.endpoint;
 // Large-enough bounded synthetic payload exercises 3 transport chunks; the renderer codec has its own real tiny round-trip test.
 if(bytes){meta.bytes=bytes.length;meta.summary.bytes=bytes.length;meta.summary.fileSha256=hash(bytes);}
 mutate(meta);let released=0,pulls=0,reads=0;
 const endpoint={meta:()=>structuredClone(meta),chunk:(offset,n)=>{pulls++;return chunk?chunk(offset,n):(bytes?Buffer.from(bytes.subarray(offset,offset+n)).toString('base64'):original.chunk(offset,n));},release:()=>{released++;if(release)release();else original.release();}};
 const js=async code=>Function('window','return '+code)({__landPackage17bExport:endpoint,__startupTrace:{report:()=>({version:1,rows:[]})}});
 const h=host.createLandPackageExportHost({readExportReceipt:async(file,options)=>{reads++;assert.equal(file,args.manifestFile);assert.deepEqual(options,{repo,dist});return read?read(reads):structuredClone(verified);}});
 return{h,js,meta,get released(){return released;},get pulls(){return pulls;},get reads(){return reads;}};
}
const file=name=>path.join(dir,name+'.land');
const noPartial=()=>assert.equal(fs.readdirSync(dir).some(name=>name.includes('.part-')),false);
try{
 const bytes=Uint8Array.from({length:131077},(_,i)=>i%251),s=setup({bytes}),out=await s.h.exportLandPackageResult({...args,file:file('good'),js:s.js});
 assert.equal(out.sha256,hash(bytes));assert.equal(hash(fs.readFileSync(out.path)),hash(bytes));assert.equal(s.pulls,3);assert.equal(s.reads,2);assert.equal(s.released,1);assert.equal(out.provenance.buildHash,verified.build.hash);assert.equal(Object.hasOwn(out.identity.flags,'buildHash'),false);checks++;
 {
  const next=setup();await assert.rejects(next.h.exportLandPackageResult({...args,file:out.path,js:next.js}),/NEW_EXTERNAL_OUTPUT/);assert.equal(hash(fs.readFileSync(out.path)),out.sha256);checks++;
 }
 for(const mutate of [m=>m.receiptHash='0'.repeat(64),m=>m.actualParams.terrainG=32,m=>m.identity.flags.buildHash='e'.repeat(64),m=>m.conditions.district=7,m=>m.conditions.quick=true,m=>m.conditions.descriptor.hookOwned=false,m=>m.summary.byteExact=false,m=>m.randomCalls=1,m=>m.cleanCalls=0,m=>m.bytes=Number.MAX_SAFE_INTEGER]){
  const s=setup({mutate}),target=file('invalid'+checks);await assert.rejects(s.h.exportLandPackageResult({...args,file:target,js:s.js}));assert.equal(s.pulls,0);assert.equal(fs.existsSync(target),false);checks++;
 }
 for(const chunk of [()=> 'AA==',()=> '_'.repeat(4),()=>{throw Error('original pull failure');}]){
  const s=setup({chunk}),target=file('pull'+checks);await assert.rejects(s.h.exportLandPackageResult({...args,file:target,js:s.js}));assert.equal(fs.existsSync(target),false);assert.equal(s.released,1);noPartial();checks++;
 }
 {
  const s=setup({read:n=>n===1?structuredClone(verified):{...verified,receiptHash:'0'.repeat(64)}}),target=file('changed');
  await assert.rejects(s.h.exportLandPackageResult({...args,file:target,js:s.js}),/RECEIPT_CHANGED/);assert.equal(fs.existsSync(target),false);noPartial();checks++;
 }
 {
  const s=setup({release:()=>{throw Error('release failure');}}),target=file('release');
  await assert.rejects(s.h.exportLandPackageResult({...args,file:target,js:s.js}),/release failure/);assert.equal(fs.existsSync(target),false);noPartial();checks++;
 }
 {
  fs.symlinkSync(repo,path.join(dir,'repo-link'),'dir');const s=setup();
  await assert.rejects(s.h.exportLandPackageResult({...args,file:path.join(dir,'repo-link','nested','forbidden.land'),js:s.js}),/NEW_EXTERNAL_OUTPUT/);
  assert.equal(fs.existsSync(path.join(repo,'nested')),false);checks++;
 }
 {
  const s=setup({chunk:()=>{throw Error('primary pull');},release:()=>{throw Error('secondary cleanup');}});
  try{await s.h.exportLandPackageResult({...args,file:file('cleanup'),js:s.js});assert.fail('must reject');}catch(e){assert.equal(e.message,'primary pull');assert.deepEqual(e.cleanupErrors,['secondary cleanup']);}noPartial();checks++;
 }
 {
  const s=setup(),error='original renderer evaluation failure';
  const result=await s.h.exportWithDiagnostics({js:s.js,priorEvalErr:error,uncaught:1,errors:['console'],allowed:true,args:{...args,file:file('prior')}});
  assert.equal(result.evalErr,error);assert.equal(result.landPackageExport,null);assert.match(result.landPackageExportError,/REFUSED/);assert.equal(result.landPackageExportDiagnostics.meta.summary.byteExact,true);assert.equal(s.reads,0);checks++;
 }
 {
  const s=setup(),result=await s.h.exportWithDiagnostics({js:async()=>({meta:{phase:'failed',error:'primary renderer clean'},trace:{rows:[]}}),allowed:false,args:{}});
  assert.equal(result.evalErr,'primary renderer clean');assert.equal(result.landPackageExport,null);assert.equal(result.landPackageExportDiagnostics.meta.phase,'failed');checks++;
 }
 {
  const s=setup(),result=await s.h.exportWithDiagnostics({js:async()=>{throw Error('diagnostic read failed');},priorEvalErr:'primary evaluation',allowed:true,args:{}});
  assert.equal(result.evalErr,'primary evaluation');assert.equal(result.landPackageExportDiagnostics.readError,'diagnostic read failed');checks++;
 }
 console.log(JSON.stringify({ok:true,checks,threeChunks:true,receiptReverified:true,atomicNoOverwrite:true,primaryFailurePreserved:true,noCity:true}));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
