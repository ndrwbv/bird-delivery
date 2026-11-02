/* Tiny fake source tree + actual codec bytes. No real source traversal, Vite or renderer. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {captureSource,PREPARATION_HELPERS,sha256} from './land-package-files.mjs';
import {verifyAddressPackage,addressPackagePlugin} from './address-package-build.mjs';
import {createAddressCatalogRecorder} from '../src/game/addresscatalog.js';
import {encodeAddressCatalog} from '../src/game/addresscodec17b.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'bird-address-build-')),repo=path.join(root,'repo');let checks=0;
const write=(file,text)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);};
write(path.join(repo,'package.json'),'{"type":"module"}\n');write(path.join(repo,'package-lock.json'),'{"version":"0","lockfileVersion":3,"packages":{"":{"version":"0"}}}\n');
write(path.join(repo,'src/maps/seversk/city-data.js'),'export default {};\n');write(path.join(repo,'src/maps/seversk/edits.json'),'{}\n');write(path.join(repo,'vite.config.js'),'export default {};\n');
for(const file of PREPARATION_HELPERS)write(path.join(repo,file),'/* tiny source receipt fixture */\n');
const clipper=createRequire(import.meta.url).resolve('clipper-lib');write(path.join(repo,'node_modules/clipper-lib/package.json'),fs.readFileSync(path.join(path.dirname(clipper),'package.json')));write(path.join(repo,'node_modules/clipper-lib',path.basename(clipper)),fs.readFileSync(clipper));
const base=captureSource(repo).base,t={buildings:[],houses:[],generatedDoors:[],entrances:[],spots:[]},r=createAddressCatalogRecorder(t);r.mergeDoorsOnce();r.sealSpots();
const ids=['a','b'].map(c=>({...base,inputHash:c.repeat(64)})),wires=ids.map(id=>Buffer.from(encodeAddressCatalog(r.snapshot(),id)));
const slot=(graphics,i)=>({graphics,identity:ids[i],entry:{path:'address-data/'+sha256(wires[i])+'.addr',bytes:wires[i].length,sha256:sha256(wires[i])}});
const product={version:2,kind:'address-package17b',slots:[slot('mid',0),slot('high',1)]};
function make(name,catalog=structuredClone(product)){const dir=path.join(root,name);fs.mkdirSync(path.join(dir,'address-data'),{recursive:true});for(let i=0;i<2;i++)write(path.join(dir,product.slots[i].entry.path),wires[i]);write(path.join(dir,'catalog.json'),JSON.stringify(catalog));return{dir,catalog};}
function test(name,fn){try{fn();checks++;}catch(e){e.message=name+': '+e.message;throw e;}}
try{
 test('new product checks two independent actual codec header identities',()=>{const c=make('valid'),checked=verifyAddressPackage({repo,dir:c.dir});assert.equal(checked.catalog.version,2);assert.deepEqual(checked.assets.map(a=>a.graphics),['mid','high']);assert.equal(checked.assets.length,2);});
 test('legacy v1 requires explicit diagnostic option',()=>{const c=make('legacy',{version:1,kind:'address-package17b',identity:ids[0],entry:product.slots[0].entry});assert.throws(()=>verifyAddressPackage({repo,dir:c.dir}),/PRODUCT_CATALOG_V2/);const legacy=verifyAddressPackage({repo,dir:c.dir,legacy:true});assert.equal(legacy.catalog.version,1);assert.equal(legacy.assets.length,1);assert.equal(legacy.file,legacy.assets[0].file);});
 test('incomplete and duplicate product slots fail closed',()=>{for(const name of ['missing','duplicate']){const c=make(name);if(name==='missing')c.catalog.slots.pop();else c.catalog.slots[1].graphics='mid';write(path.join(c.dir,'catalog.json'),JSON.stringify(c.catalog));assert.throws(()=>verifyAddressPackage({repo,dir:c.dir}),/CATALOG_SLOTS|DUPLICATE_SLOT/);}});
 test('stale common source rejected against fake source receipt',()=>{const c=make('stale');for(const slot of c.catalog.slots)slot.identity.sourceHash='e'.repeat(64);write(path.join(c.dir,'catalog.json'),JSON.stringify(c.catalog));assert.throws(()=>verifyAddressPackage({repo,dir:c.dir}),/SOURCE_MISMATCH/);});
 test('second asset missing or changed fails',()=>{for(const name of ['missing-file','changed-file']){const c=make(name),file=path.join(c.dir,c.catalog.slots[1].entry.path);if(name==='missing-file')fs.unlinkSync(file);else{const b=fs.readFileSync(file);b[b.length-1]^=1;write(file,b);}assert.throws(()=>verifyAddressPackage({repo,dir:c.dir}));}});
 test('coherently rehashed second asset still needs codec CRC',()=>{const c=make('crc'),b=Buffer.from(wires[1]);b[b.length-1]^=1;const slot=c.catalog.slots[1];slot.entry={path:'address-data/'+sha256(b)+'.addr',bytes:b.length,sha256:sha256(b)};write(path.join(c.dir,slot.entry.path),b);write(path.join(c.dir,'catalog.json'),JSON.stringify(c.catalog));assert.throws(()=>verifyAddressPackage({repo,dir:c.dir}),/BODY_CRC/);});
 test('plugin emits both payloads plus product catalog',()=>{const c=make('plugin'),checked=verifyAddressPackage({repo,dir:c.dir}),emitted=[];addressPackagePlugin(checked).generateBundle.call({emitFile:value=>emitted.push(value)});assert.deepEqual(emitted.map(v=>v.fileName),[...product.slots.map(v=>v.entry.path),'address-data/catalog.json']);assert.equal(JSON.parse(emitted[2].source).version,2);});
 test('plugin rechecks changed second payload rather than trusting previous verification',()=>{const c=make('changed-emission'),checked=verifyAddressPackage({repo,dir:c.dir});const file=checked.assets[1].file,b=fs.readFileSync(file);b[0]^=1;write(file,b);assert.throws(()=>addressPackagePlugin(checked).generateBundle.call({emitFile(){}}),/CHANGED_DURING_BUILD/);});
 console.log(JSON.stringify({ok:true,checks,fakeSourceOnly:true,realCodec:true,profiles:2,noViteOrGame:true}));
}finally{fs.rmSync(root,{recursive:true,force:true});}
