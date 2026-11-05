/* Offline preparation/build verification only. Never imported by the renderer. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {canonical,need} from '../src/game/landdata/land-package-key.js';
import {makeSourceKey} from './land-package-source-key.mjs';
import {limitsOf} from '../src/game/landcache17a/checkpoint-limits.js';

export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

// Finish every started export before returning a failure. Never start another batch after one fails.
export async function runPreparationExports(slots,prepare,workers){
 const rows=[];
 for(let start=0;start<slots.length;start+=workers){
  const batch=await Promise.allSettled(slots.slice(start,start+workers).map(prepare));
  for(const result of batch){
   if(result.status==='rejected')throw result.reason;
   rows.push(result.value);
  }
 }
 return rows;
}

// Code only: no output/catalog/build-tree digest participates in source identity.
export const PREPARATION_HELPERS=Object.freeze(['tools/land-package-files.mjs','tools/land-package-source-key.mjs','tools/land-package-build.mjs','tools/land-package-prepare.mjs','tools/probe-checks/land-package-district-export.js','tools/address-package-build.mjs','tools/address-package-prepare.mjs','tools/probe-checks/address-package-export.js','tools/probe-checks/address-package-fresh-export.js','tools/startup-environment.cjs']);
const slash=value=>value.split(path.sep).join('/');
const textFile=file=>/\.(?:[cm]?js|json|css|svg|txt|glsl|vert|frag|html|md)$/.test(file);
function tree(root,dir=root){
 const files=[];
 for(const name of fs.readdirSync(dir).sort()){
  const file=path.join(dir,name),stat=fs.lstatSync(file);
  need(!stat.isSymbolicLink(),'SYMLINK');
  if(stat.isDirectory())files.push(...tree(root,file));
  else if(stat.isFile())files.push({path:slash(path.relative(root,file)),bytes:fs.readFileSync(file)});
 }
 return files;
}
const describe=files=>files.map(file=>({path:file.path,bytes:file.bytes.length,sha256:sha256(file.bytes)}));
const normalizedLock=lock=>{const copy=JSON.parse(JSON.stringify(lock));delete copy.version;if(copy.packages?.[''])delete copy.packages[''].version;return copy;};

export function newExternalPath(repo,file){
 repo=fs.realpathSync(repo);file=path.resolve(file);need(!fs.existsSync(file),'NEW_EXTERNAL_OUTPUT');
 let ancestor=path.dirname(file);
 while(!fs.existsSync(ancestor)){const up=path.dirname(ancestor);need(up!==ancestor,'OUTPUT_PARENT');ancestor=up;}
 const actual=path.resolve(fs.realpathSync(ancestor),path.relative(ancestor,file)),relative=path.relative(repo,actual);
 need(relative&&relative!=='..'&&relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative),'NEW_EXTERNAL_OUTPUT');
 return actual;
}

export function captureSource(repo){
 repo=path.resolve(repo);
 const req=createRequire(path.join(repo,'package.json')),clipper=req.resolve('clipper-lib');
 const clipperPackage=path.join(path.dirname(clipper),'package.json');
 const buildConfig={mode:'steam',adult:true,editor:false,resolvedDependencies:{clipper:{
  version:JSON.parse(fs.readFileSync(clipperPackage,'utf8')).version,
  sha256:sha256(fs.readFileSync(clipper)),packageSha256:sha256(fs.readFileSync(clipperPackage))
 }}};
 buildConfig.preparationHelpers=Object.fromEntries(PREPARATION_HELPERS.map(file=>[file,sha256(fs.readFileSync(path.join(repo,file)))]));
 const files=tree(repo,path.join(repo,'src'));
 files.push({path:'vite.config.js',bytes:fs.readFileSync(path.join(repo,'vite.config.js'))});
 files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 const lock=JSON.parse(fs.readFileSync(path.join(repo,'package-lock.json'),'utf8'));
 const sourceHash=makeSourceKey({files:files.map(file=>({...file,text:textFile(file.path)})),lock,buildConfig});
 const records=describe(files),mapId='seversk';
 const mapFiles=records.filter(file=>file.path.startsWith('src/maps/'+mapId+'/')&&!file.path.endsWith('/edits.json'));
 const edits=records.find(file=>file.path==='src/maps/'+mapId+'/edits.json');
 need(edits&&mapFiles.some(file=>file.path.endsWith('/city-data.js')),'MAP_FILES');
 return{base:{mapId,mapHash:sha256(canonical(mapFiles)),editsHash:edits.sha256,sourceHash},
  source:{files:records,normalizedLockHash:sha256(canonical(normalizedLock(lock))),buildConfig}};
}
export function captureBuild(dist){
 dist=fs.realpathSync(dist);need(fs.existsSync(path.join(dist,'index.html')),'BUILD_INDEX');
 const files=describe(tree(dist));return{dir:dist,files,hash:sha256(canonical(files))};
}
export function writeExportReceipt({repo,dist,file,limits={maxWorkingBytes:1024*1024*1024}}){
 repo=fs.realpathSync(repo);file=newExternalPath(repo,file);
 const receipt={version:1,kind:'land-package17b-export-receipt',...captureSource(repo),build:captureBuild(dist),limits:limitsOf(limits)};
 receipt.receiptHash=sha256(canonical(receipt));
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(receipt,null,2),{flag:'wx'});
 return receipt;
}
export function readExportReceipt(file,{repo,dist}){
 const receipt=JSON.parse(fs.readFileSync(file,'utf8')),copy={...receipt};delete copy.receiptHash;
 need(receipt.version===1&&receipt.kind==='land-package17b-export-receipt'&&sha256(canonical(copy))===receipt.receiptHash,'EXPORT_RECEIPT');
 const current=captureSource(repo);
 need(canonical(current.base)===canonical(receipt.base)&&canonical(current.source)===canonical(receipt.source),'EXPORT_SOURCE_CHANGED');
 const build=captureBuild(dist);
 need(canonical(build)===canonical(receipt.build),'EXPORT_BUILD_CHANGED');
 need(canonical(limitsOf(receipt.limits))===canonical(receipt.limits),'EXPORT_LIMITS');
 return receipt;
}
