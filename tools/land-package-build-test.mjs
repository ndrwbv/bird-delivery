import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {captureSource,sha256} from './land-package-files.mjs';
import {verifyLandPackage} from './land-package-build.mjs';
import {createCatalog} from '../src/game/landdata/land-package-catalog.js';
import {fixture} from './land-package-export-fixture.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'bird-package-unit-'));
const base=captureSource(repo).base,f=fixture({receipt:{base,limits:{},receiptHash:'f'.repeat(64)}});f.ctx.runtime.mapId=base.mapId;
const endpoint=f.ready(),meta=endpoint.meta(),raw=Buffer.from(endpoint.chunk(0,meta.bytes),'base64');
let cases=0;
const test=(name,fn)=>{fn();cases++;};
function packageCase(name,bytes=raw,encoding='identity'){
 const root=path.join(dir,name);fs.mkdirSync(path.join(root,'city-data'),{recursive:true});
 const wire=encoding==='gzip'?gzipSync(bytes):bytes,hash=sha256(wire),entry={precleanHash:meta.identity.precleanHash,path:'city-data/'+hash+'.land'+(encoding==='gzip'?'.gz':''),encoding,bytes:wire.length,sha256:hash,rawBytes:bytes.length,rawSha256:sha256(bytes)};
 const catalog=createCatalog(meta.manifest,[entry]);fs.writeFileSync(path.join(root,entry.path),wire);fs.writeFileSync(path.join(root,'catalog.json'),JSON.stringify(catalog));
 return{root,entry,catalog,file:path.join(root,entry.path)};
}
try{
 test('valid identity payload',()=>{const c=packageCase('plain');assert.equal(verifyLandPackage({repo,dir:c.root}).assets.length,1);});
 test('valid gzip payload',()=>{const c=packageCase('gzip',raw,'gzip');assert.equal(verifyLandPackage({repo,dir:c.root}).catalog.entries[0].rawSha256,sha256(raw));});
 test('missing asset',()=>{const c=packageCase('missing');fs.unlinkSync(c.file);assert.throws(()=>verifyLandPackage({repo,dir:c.root}));});
 test('wire mutation',()=>{const c=packageCase('wire');const b=fs.readFileSync(c.file);b[b.length-1]^=1;fs.writeFileSync(c.file,b);assert.throws(()=>verifyLandPackage({repo,dir:c.root}),/PACKAGE_WIRE_SHA/);});
 test('coherent outer hashes still reject invalid codec block',()=>{const b=Buffer.from(raw);b[b.length-1]^=1;const c=packageCase('coherent',b);assert.throws(()=>verifyLandPackage({repo,dir:c.root}),/CRC|CHECKSUM/);});
 test('stale source',()=>{const c=packageCase('stale');c.catalog.manifest.sourceHash='0'.repeat(64);fs.writeFileSync(path.join(c.root,'catalog.json'),JSON.stringify(c.catalog));assert.throws(()=>verifyLandPackage({repo,dir:c.root}),/PACKAGE_SOURCE_MISMATCH/);});
 test('bounded inflate',()=>{const c=packageCase('inflate',raw,'gzip');c.catalog.entries[0].rawBytes=1;fs.writeFileSync(path.join(c.root,'catalog.json'),JSON.stringify(c.catalog));assert.throws(()=>verifyLandPackage({repo,dir:c.root}));});
 if(process.platform!=='win32')test('symlink cannot redirect payload',()=>{const c=packageCase('symlink');const external=path.join(dir,'outside.land');fs.writeFileSync(external,raw);fs.unlinkSync(c.file);fs.symlinkSync(external,c.file);assert.throws(()=>verifyLandPackage({repo,dir:c.root}),/PACKAGE_FILE_PATH/);});
 console.log('Prepared package build verification: '+cases+' PASS');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
