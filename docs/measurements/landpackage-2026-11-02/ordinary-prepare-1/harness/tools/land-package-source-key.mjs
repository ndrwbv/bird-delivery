/* Node-only pure key from already enumerated source records. No filesystem traversal. */
import {createHash} from 'node:crypto';
import {canonical,need} from '../src/game/landdata/land-package-key.js';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function makeSourceKey({files,lock,buildConfig}){
 need(Array.isArray(files)&&files.length>0,'SOURCE_FILES');const names=new Set();
 const records=files.map(({path,bytes,text})=>{
  need(typeof path==='string'&&/^(src\/|vite\.config\.)/.test(path)&&!path.includes('\\')&&!path.split('/').some(p=>p==='..'||p==='.'||p==='')&&!names.has(path),'SOURCE_PATH');names.add(path);
  need(bytes instanceof Uint8Array&&typeof text==='boolean','SOURCE_BYTES');
  // Build and hashing must consume these same LF bytes. Do not silently hash a normalized twin.
  if(text){const source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);need(!source.includes('\r'),'SOURCE_REQUIRES_LF');}
  return{path,bytes:bytes.length,sha256:digest(bytes)};
 }).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 const dependencies=JSON.parse(JSON.stringify(lock));need(dependencies&&dependencies.packages&&dependencies.packages[''],'LOCK');
 delete dependencies.version;delete dependencies.packages[''].version;
 return digest(canonical({contract:'land-package17b-source-v1',mode:'steam',files:records,dependencies,buildConfig}));
}
