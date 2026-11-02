/* Genuine tiny codec payload in real ASAR archives, no renderer/build/probe. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createPackage,createPackageWithOptions} from '@electron/asar';
import {createAddressCatalogRecorder} from '../src/game/addresscatalog.js';
import {encodeAddressCatalog} from '../src/game/addresscodec17b.js';
import {verifyAsarAddresses} from './address-package-verify-asar.mjs';
import {toAsarInternalPath} from './land-package-verify-asar.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'bird-address-asar-')),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const identity={mapId:'fixture',mapHash:'a'.repeat(64),editsHash:'b'.repeat(64),sourceHash:'c'.repeat(64),inputHash:'d'.repeat(64)};
const t={buildings:[{id:-0}],houses:[],generatedDoors:[],entrances:[[1,2,0,1]],spots:[]},r=createAddressCatalogRecorder(t);
r.acceptHouse(t.buildings[0],{x:-0,z:2,mx:3,mz:4,addr:'Дом, 1',name:'',lv:5});r.acceptDoor(t.buildings[0],[5,6,-0,1],true);r.mergeDoorsOnce();t.spots.push({x:7,z:8});r.sealSpots();
const wire=Buffer.from(encodeAddressCatalog(r.snapshot(),identity)),sha=hash(wire),expected={version:1,kind:'address-package17b',identity,entry:{path:'address-data/'+sha+'.addr',bytes:wire.length,sha256:sha}};
let checks=0;const test=async(name,fn)=>{try{await fn();checks++;}catch(e){e.message=name+': '+e.message;throw e;}};
async function make(name,change=()=>{},options){
 const dir=path.join(root,name),stage=path.join(dir,'stage'),steam=path.join(stage,'dist/steam');fs.mkdirSync(path.join(steam,'address-data'),{recursive:true});
 fs.writeFileSync(path.join(steam,'address-data/catalog.json'),JSON.stringify(expected));fs.writeFileSync(path.join(steam,expected.entry.path),wire);
 await change(steam);const archive=path.join(dir,'app.asar');if(options)await createPackageWithOptions(stage,archive,options);else await createPackage(stage,archive);return archive;
}
try{
 await test('native separator helper is reused for Windows and POSIX',()=>{assert.equal(toAsarInternalPath('dist/steam/address-data/catalog.json',path.win32),'dist\\steam\\address-data\\catalog.json');assert.equal(toAsarInternalPath('dist/steam/address-data/catalog.json',path.posix),'dist/steam/address-data/catalog.json');});
 const good=await make('valid');
 await test('genuine codec ASAR payload and identity verified',()=>{const result=verifyAsarAddresses(good,expected);assert.equal(result.ok,true);assert.equal(result.sourceHash,identity.sourceHash);assert.equal(result.inputHash,identity.inputHash);assert.deepEqual(result.assets,[{path:'dist/steam/'+expected.entry.path,bytes:wire.length,sha256:sha}]);});
 await test('external expected catalog mandatory',()=>assert.throws(()=>verifyAsarAddresses(good),/EXTERNAL_EXPECTED_CATALOG_REQUIRED/));
 await test('equivalent pretty catalog accepted by semantic canonical comparison',async()=>{const pretty=await make('pretty',dir=>fs.writeFileSync(path.join(dir,'address-data/catalog.json'),JSON.stringify(expected,null,2)));const result=verifyAsarAddresses(pretty,expected);assert.notEqual(result.catalogSha256,verifyAsarAddresses(good,expected).catalogSha256);assert.equal(result.assets[0].sha256,sha);});
 await test('equivalent external field order is not a false mismatch',()=>{const reordered={entry:{sha256:sha,bytes:wire.length,path:expected.entry.path},identity:Object.fromEntries(Object.entries(identity).reverse()),kind:expected.kind,version:1};assert.equal(verifyAsarAddresses(good,reordered).ok,true);});
 await test('changed actual catalog rejected',async()=>{const a=await make('changed-catalog',dir=>{const c=structuredClone(expected);c.identity.inputHash='e'.repeat(64);fs.writeFileSync(path.join(dir,'address-data/catalog.json'),JSON.stringify(c));});assert.throws(()=>verifyAsarAddresses(a,expected),/PACKAGED_CATALOG_CHANGED/);});
 await test('changed external expected rejected',()=>{const c=structuredClone(expected);c.identity.sourceHash='e'.repeat(64);assert.throws(()=>verifyAsarAddresses(good,c),/PACKAGED_CATALOG_CHANGED/);});
 await test('catalog size bounded before extraction',async()=>{const a=await make('large-catalog',dir=>fs.writeFileSync(path.join(dir,'address-data/catalog.json'),' '.repeat(65537)));assert.throws(()=>verifyAsarAddresses(a,expected),/PACKAGED_CATALOG/);});
 await test('invalid catalog JSON rejected',async()=>{const a=await make('json',dir=>fs.writeFileSync(path.join(dir,'address-data/catalog.json'),'{'));assert.throws(()=>verifyAsarAddresses(a,expected),/CATALOG_JSON/);});
 await test('wire mutation rejected',async()=>{const a=await make('corrupt',dir=>{const b=Buffer.from(wire);b[b.length-1]^=1;fs.writeFileSync(path.join(dir,expected.entry.path),b);});assert.throws(()=>verifyAsarAddresses(a,expected),/PACKAGED_SHA/);});
 await test('coherently rehashed invalid codec is still refused',async()=>{const broken=Buffer.from(wire);broken[broken.length-1]^=1;const digest=hash(broken),c={...expected,entry:{path:'address-data/'+digest+'.addr',sha256:digest,bytes:broken.length}};const a=await make('coherent',dir=>{fs.unlinkSync(path.join(dir,expected.entry.path));fs.writeFileSync(path.join(dir,c.entry.path),broken);fs.writeFileSync(path.join(dir,'address-data/catalog.json'),JSON.stringify(c));});assert.throws(()=>verifyAsarAddresses(a,c),/BODY_CRC/);});
 await test('coherent outer identity cannot bypass binary header identity',async()=>{const c=structuredClone(expected);c.identity.inputHash='e'.repeat(64);const a=await make('header-id',dir=>fs.writeFileSync(path.join(dir,'address-data/catalog.json'),JSON.stringify(c)));assert.throws(()=>verifyAsarAddresses(a,c),/IDENTITY_MISMATCH/);});
 await test('missing payload refused',async()=>{const a=await make('missing',dir=>fs.unlinkSync(path.join(dir,expected.entry.path)));assert.throws(()=>verifyAsarAddresses(a,expected),/PACKAGED_DATA_INVENTORY/);});
 await test('extra payload refused',async()=>{const a=await make('extra',dir=>fs.writeFileSync(path.join(dir,'address-data/orphan.addr'),wire));assert.throws(()=>verifyAsarAddresses(a,expected),/PACKAGED_DATA_INVENTORY/);});
 await test('extra unrelated data file is not ignored',async()=>{const a=await make('extra-text',dir=>fs.writeFileSync(path.join(dir,'address-data/notes.txt'),'x'));assert.throws(()=>verifyAsarAddresses(a,expected),/PACKAGED_DATA_INVENTORY/);});
 await test('nested file and directory cannot hide in inventory',async()=>{const a=await make('nested',dir=>{fs.mkdirSync(path.join(dir,'address-data/nested'));fs.writeFileSync(path.join(dir,'address-data/nested/file.json'),'{}');});assert.throws(()=>verifyAsarAddresses(a,expected),/PACKAGED_DATA_INVENTORY/);});
 await test('unpacked address file refused',async()=>{const a=await make('unpacked',()=>{},{unpack:'**/*.addr'});assert.throws(()=>verifyAsarAddresses(a,expected),/PACKAGED_FILE/);});
 await test('unpacked catalog refused',async()=>{const a=await make('unpacked-catalog',()=>{},{unpack:'**/catalog.json'});assert.throws(()=>verifyAsarAddresses(a,expected),/PACKAGED_CATALOG/);});
 if(process.platform!=='win32'){
  await test('payload symlink refused',async()=>{const a=await make('link',dir=>{fs.writeFileSync(path.join(dir,'outside.addr'),wire);fs.unlinkSync(path.join(dir,expected.entry.path));fs.symlinkSync('../outside.addr',path.join(dir,expected.entry.path));});assert.throws(()=>verifyAsarAddresses(a,expected),/PACKAGED_FILE/);});
  await test('catalog symlink refused',async()=>{const a=await make('catalog-link',dir=>{fs.writeFileSync(path.join(dir,'outside.json'),JSON.stringify(expected));fs.unlinkSync(path.join(dir,'address-data/catalog.json'));fs.symlinkSync('../outside.json',path.join(dir,'address-data/catalog.json'));});assert.throws(()=>verifyAsarAddresses(a,expected),/PACKAGED_CATALOG/);});
 }
 await test('declared payload ceiling rejects without allocating a large file',()=>{const c=structuredClone(expected);c.entry.bytes=16*1024*1024+1;assert.throws(()=>verifyAsarAddresses(good,c),/ENTRY/);});
 console.log(JSON.stringify({ok:true,checks,wireBytes:wire.length,actualTinyAsar:true,realCodec:true,canonicalCatalog:true,gameOrBuild:false}));
}finally{fs.rmSync(root,{recursive:true,force:true});}
