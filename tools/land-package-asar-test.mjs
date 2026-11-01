/* Packaging integrity contracts; synthetic wire data, not geometry acceptance. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createPackage,createPackageWithOptions} from '@electron/asar';
import {sha256} from './land-package-files.mjs';
import {createCatalog} from '../src/game/landdata/land-package-catalog.js';
import {makeManifest} from '../src/game/landdata/land-package-key.js';
import {verifyAsarLand} from './land-package-verify-asar.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'bird-asar-unit-')),wire=Buffer.from('synthetic packaged wire');
const manifest=makeManifest({mapId:'fixture',mapHash:'a'.repeat(64),editsHash:'b'.repeat(64),sourceHash:'c'.repeat(64)},
 {minWidth:.8,coverCell:32,maskCell:32,indexCell:8,terrainG:16,terrainNX:2,terrainNZ:2,terrainX0:0,terrainZ0:0});
const digest=sha256(wire),entry={precleanHash:'d'.repeat(64),path:'city-data/'+digest+'.land',encoding:'identity',bytes:wire.length,sha256:digest,rawBytes:wire.length,rawSha256:digest};
const expected=createCatalog(manifest,[entry]);let cases=0;
async function make(name,change=()=>{},options){
 const dir=path.join(root,name),stage=path.join(dir,'stage'),data=path.join(stage,'dist/steam');fs.mkdirSync(path.join(data,'city-data'),{recursive:true});
 fs.writeFileSync(path.join(data,'city-data/catalog.json'),JSON.stringify(expected));fs.writeFileSync(path.join(data,entry.path),wire);
 await change(data);const archive=path.join(dir,'app.asar');
 if(options)await createPackageWithOptions(stage,archive,options);else await createPackage(stage,archive);return archive;
}
try{
 let a=await make('valid');assert.equal(verifyAsarLand(a,expected).assets.length,1);cases++;
 assert.throws(()=>verifyAsarLand(a),/EXTERNAL_EXPECTED_CATALOG_REQUIRED/);cases++;
 a=await make('corrupt',dir=>{const b=Buffer.from(wire);b[0]^=1;fs.writeFileSync(path.join(dir,entry.path),b);});assert.throws(()=>verifyAsarLand(a,expected),/PACKAGED_SHA/);cases++;
 a=await make('missing',dir=>fs.unlinkSync(path.join(dir,entry.path)));assert.throws(()=>verifyAsarLand(a,expected));cases++;
 a=await make('catalog',dir=>{const c=structuredClone(expected);c.manifest.sourceHash='e'.repeat(64);fs.writeFileSync(path.join(dir,'city-data/catalog.json'),JSON.stringify(c));});assert.throws(()=>verifyAsarLand(a,expected),/PACKAGED_CATALOG_CHANGED/);cases++;
 a=await make('orphan',dir=>fs.writeFileSync(path.join(dir,'city-data/orphan.land'),wire));assert.throws(()=>verifyAsarLand(a,expected),/PACKAGED_DATA_INVENTORY/);cases++;
 a=await make('unpacked',()=>{},{unpack:'**/*.land'});assert.throws(()=>verifyAsarLand(a,expected),/PACKAGED_FILE/);cases++;
 console.log('Packaged ASAR data integrity: '+cases+' PASS');
}finally{fs.rmSync(root,{recursive:true,force:true});}
