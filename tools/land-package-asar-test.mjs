/* Packaging integrity contracts; synthetic wire data, not geometry acceptance. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createPackage,createPackageWithOptions} from '@electron/asar';
import {sha256} from './land-package-files.mjs';
import {createCatalog,checkCatalog} from '../src/game/landdata/land-package-catalog.js';
import {makeManifest,canonical,need} from '../src/game/landdata/land-package-key.js';
import {LAND_PACKAGE_LIMITS} from '../src/game/landdata/land-package-config.js';
import {verifyAsarLand,toAsarInternalPath} from './land-package-verify-asar.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'bird-asar-unit-')),wire=Buffer.from('synthetic packaged wire');
const manifest=makeManifest({mapId:'fixture',mapHash:'a'.repeat(64),editsHash:'b'.repeat(64),sourceHash:'c'.repeat(64)},
 {minWidth:.8,coverCell:32,maskCell:32,indexCell:8,terrainG:16,terrainNX:2,terrainNZ:2,terrainX0:0,terrainZ0:0});
const digest=sha256(wire),entry={precleanHash:'d'.repeat(64),path:'city-data/'+digest+'.land',encoding:'identity',bytes:wire.length,sha256:digest,rawBytes:wire.length,rawSha256:digest};
const expected=createCatalog(manifest,[entry]);let cases=0;

// Execute the installed ASAR implementation with Windows path semantics on every host.
// Only imports/disk I/O are substituted; getNode/getFile/listFiles/stat/extract stay actual.
const require=createRequire(import.meta.url),asarFile=require.resolve('@electron/asar');
function winCjs(file,overrides={}){
 const localRequire=createRequire(file),module={exports:{}};
 const dependency=name=>Object.hasOwn(overrides,name)?overrides[name]:name==='path'?path.win32:localRequire(name);
 const compiled=vm.runInNewContext('(function(require,module,exports,__filename,__dirname){\n'+fs.readFileSync(file,'utf8')+'\n})',{Buffer,console,process});
 compiled(dependency,module,module.exports,file,path.dirname(file));return module.exports;
}
const {Filesystem:WinFilesystem}=winCjs(path.join(path.dirname(asarFile),'filesystem.js'));
const verifierSource=fs.readFileSync(new URL('./land-package-verify-asar.mjs',import.meta.url),'utf8');
function windowsVerifier(change=()=>{}){
 const contents=new Map([['dist/steam/city-data/catalog.json',Buffer.from(JSON.stringify(expected))],['dist/steam/'+entry.path,Buffer.from(wire)]]);
 change(contents);
 const header={files:{}};
 for(const [file,bytes]of contents){const parts=file.split('/');let at=header;for(const name of parts.slice(0,-1))at=at.files[name]||(at.files[name]={files:{}});at.files[parts.at(-1)]={size:bytes.length,offset:'0'};}
 const filesystem=new WinFilesystem('C:\\unit\\stage');filesystem.setHeader(header,0);
 const calls=[],getFile=filesystem.getFile.bind(filesystem);
 filesystem.getFile=(file,...args)=>{calls.push(file);assert.equal(file.includes('/'),false,'every ASAR stat/extract lookup must use native separators');return getFile(file,...args);};
 const disk={readFilesystemSync:()=>filesystem,readFileSync:(_fs,file)=>{const bytes=contents.get(file.replaceAll('\\','/'));assert.ok(bytes,'actual extract must find its unchanged POSIX content key');return bytes;}};
 const actualAsar=winCjs(asarFile,{'./filesystem':{Filesystem:WinFilesystem},'./disk':disk});
 const source=verifierSource.replace(/^import .*;\n/gm,'').replace(/^export /gm,'').replaceAll('import.meta.url',JSON.stringify(new URL('./land-package-verify-asar.mjs',import.meta.url).href));
 const api=vm.runInNewContext(source+'\n;({verifyAsarLand});',{fs,path:path.win32,createRequire:()=>name=>{assert.equal(name,'@electron/asar');return actualAsar;},fileURLToPath,sha256,checkCatalog,canonical,need,LAND_PACKAGE_LIMITS,JSON,process:{argv:[]}});
 return{verify:()=>api.verifyAsarLand('C:\\unit\\app.asar',expected),calls};
}
async function make(name,change=()=>{},options){
 const dir=path.join(root,name),stage=path.join(dir,'stage'),data=path.join(stage,'dist/steam');fs.mkdirSync(path.join(data,'city-data'),{recursive:true});
 fs.writeFileSync(path.join(data,'city-data/catalog.json'),JSON.stringify(expected));fs.writeFileSync(path.join(data,entry.path),wire);
 await change(data);const archive=path.join(dir,'app.asar');
 if(options)await createPackageWithOptions(stage,archive,options);else await createPackage(stage,archive);return archive;
}
try{
 assert.equal(toAsarInternalPath('dist/steam/city-data/catalog.json',path.win32),'dist\\steam\\city-data\\catalog.json');
 assert.equal(toAsarInternalPath('dist/steam/city-data/catalog.json',path.posix),'dist/steam/city-data/catalog.json');cases++;
 // The exact pre-fix call fails in the actual Windows getNode, despite a present header.
 {const f=new WinFilesystem('C:\\unit\\stage');f.setHeader({files:{dist:{files:{steam:{files:{'city-data':{files:{'catalog.json':{size:1}}}}}}}}},0);assert.throws(()=>f.getFile('dist/steam/city-data/catalog.json',false),/was not found/);assert.equal(f.getFile(toAsarInternalPath('dist/steam/city-data/catalog.json',path.win32),false).size,1);cases++;}
 {const w=windowsVerifier(),result=w.verify();assert.equal(result.ok,true);assert.equal(result.assets[0].path,'dist/steam/'+entry.path);assert.ok(w.calls.length>=6,'catalog, payload and inventory lookup paths all exercised');cases++;}
 {const w=windowsVerifier(files=>{const bad=Buffer.from(wire);bad[0]^=1;files.set('dist/steam/'+entry.path,bad);});assert.throws(w.verify,/PACKAGED_SHA/);cases++;}
 {const w=windowsVerifier(files=>files.delete('dist/steam/'+entry.path));assert.throws(w.verify,/was not found/);cases++;}
 {const w=windowsVerifier(files=>files.set('dist/steam/city-data/orphan.land',wire));assert.throws(w.verify,/PACKAGED_DATA_INVENTORY/);cases++;}
 let a=await make('valid');assert.equal(verifyAsarLand(a,expected).assets.length,1);cases++;
 assert.throws(()=>verifyAsarLand(a),/EXTERNAL_EXPECTED_CATALOG_REQUIRED/);cases++;
 a=await make('corrupt',dir=>{const b=Buffer.from(wire);b[0]^=1;fs.writeFileSync(path.join(dir,entry.path),b);});assert.throws(()=>verifyAsarLand(a,expected),/PACKAGED_SHA/);cases++;
 a=await make('missing',dir=>fs.unlinkSync(path.join(dir,entry.path)));assert.throws(()=>verifyAsarLand(a,expected));cases++;
 a=await make('catalog',dir=>{const c=structuredClone(expected);c.manifest.sourceHash='e'.repeat(64);fs.writeFileSync(path.join(dir,'city-data/catalog.json'),JSON.stringify(c));});assert.throws(()=>verifyAsarLand(a,expected),/PACKAGED_CATALOG_CHANGED/);cases++;
 a=await make('orphan',dir=>fs.writeFileSync(path.join(dir,'city-data/orphan.land'),wire));assert.throws(()=>verifyAsarLand(a,expected),/PACKAGED_DATA_INVENTORY/);cases++;
 a=await make('unpacked',()=>{},{unpack:'**/*.land'});assert.throws(()=>verifyAsarLand(a,expected),/PACKAGED_FILE/);cases++;
 console.log('Packaged ASAR data integrity: '+cases+' PASS');
}finally{fs.rmSync(root,{recursive:true,force:true});}
