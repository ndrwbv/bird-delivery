/* Host preparation only, outside startup timing. Writes only a new external directory; no builds/git. */
import {limitsOf} from '../src/game/landcache17a/checkpoint-limits.js';
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
const arg=k=>process.argv.slice(2).find(v=>v.startsWith('--'+k+'='))?.slice(k.length+3),root=path.resolve(arg('root')||process.cwd()),build=path.resolve(arg('build')||''),out=arg('out'),sha=arg('sha'),mapId=arg('map')||'seversk',seed=Number(arg('seed'));
if(!out||!sha||!arg('build')||!arg('seed')||!Number.isSafeInteger(seed)||!/^[-\w]+$/.test(mapId))throw Error('Required: --root --build immutable --out NEW_EXTERNAL_DIR --sha RECORDED_SHA --map=seversk --seed=7');
const dest=path.resolve(out),inside=p=>{const r=path.relative(root,p);return !r||!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);};if(inside(dest)||inside(build)||fs.existsSync(dest))throw Error('Output must be a new external directory, immutable build outside checkout');
const hash=b=>createHash('sha256').update(b).digest('hex');
const files=[];function visit(base,dir){for(const name of fs.readdirSync(dir).sort()){const p=path.join(dir,name),st=fs.lstatSync(p);if(st.isSymbolicLink())throw Error('Manifest refuses symlink '+p);if(st.isDirectory())visit(base,p);else if(st.isFile())files.push({path:path.relative(base,p).replaceAll(path.sep,'/'),sha256:hash(fs.readFileSync(p)),bytes:st.size});}}
visit(root,path.join(root,'src'));
for(const name of ['package.json','package-lock.json','vite.config.js','index.html','tools/probe.cjs','tools/probe-build.cjs'])if(fs.existsSync(path.join(root,name))){const b=fs.readFileSync(path.join(root,name));files.push({path:name,sha256:hash(b),bytes:b.length});}
const req=createRequire(path.join(root,'package.json')),clipper=req.resolve('clipper-lib');for(const p of [clipper,path.join(path.dirname(clipper),'package.json')])if(fs.existsSync(p)){const b=fs.readFileSync(p);files.push({path:path.relative(root,p).replaceAll(path.sep,'/'),sha256:hash(b),bytes:b.length});}
files.sort((a,b)=>a.path.localeCompare(b.path));const sourceHash=hash(JSON.stringify(files)),mapFiles=files.filter(v=>v.path.startsWith('src/maps/'+mapId+'/')&&!v.path.endsWith('/edits.json'));
if(!mapFiles.some(v=>v.path.endsWith('/city-data.js'))||!mapFiles.some(v=>v.path.endsWith('/index.js')))throw Error('Full map bundle missing');
const edits=files.find(v=>v.path==='src/maps/'+mapId+'/edits.json');if(!edits)throw Error('Edits missing');
const old=files.splice(0);visit(build,build);const buildFiles=files.splice(0),buildHash=hash(JSON.stringify(buildFiles));
const manifest={version:1,mode:'steam',mapId,seed,sha,sourceHash,mapHash:hash(JSON.stringify(mapFiles)),editsHash:edits.sha256,buildHash,buildDir:build,sourceFiles:old,buildFiles,externalAssetsPolicy:'Map data embedded under src/maps; complete build files also hashed; external dynamic assets unsupported',limits:limitsOf(arg('limits')?JSON.parse(fs.readFileSync(arg('limits'),'utf8')):{})};
manifest.manifestHash=hash(JSON.stringify(manifest));fs.mkdirSync(dest,{recursive:false});fs.writeFileSync(path.join(dest,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
fs.writeFileSync(path.join(dest,'init.js'),'Object.defineProperty(window,"__landExport17aManifest",{value:'+JSON.stringify(manifest)+',writable:false,configurable:false});\n',{flag:'wx'});
console.log(JSON.stringify({manifest:path.join(dest,'manifest.json'),init:path.join(dest,'init.js'),sourceHash,buildHash,realCityRun:false}));
