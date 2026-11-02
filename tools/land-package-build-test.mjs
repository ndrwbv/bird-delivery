import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {captureSource,sha256,PREPARATION_HELPERS} from './land-package-files.mjs';
import {verifyLandPackage} from './land-package-build.mjs';
import {preparationFixture,checkPreparationExport,checkPreparationRepeats} from './land-package-prepare.mjs';
import {createCatalog,checkCatalog,PRODUCT_LAND_COVERAGE} from '../src/game/landdata/land-package-catalog.js';
import {makeIdentity} from '../src/game/landdata/land-package-key.js';
import {fixture,descriptor} from './land-package-export-fixture.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'bird-package-unit-'));
const captured=captureSource(repo),base=captured.base,f=fixture({receipt:{base,limits:{},receiptHash:'f'.repeat(64)}});f.ctx.runtime.mapId=base.mapId;
const endpoint=f.ready(),meta=endpoint.meta(),raw=Buffer.from(endpoint.chunk(0,meta.bytes),'base64');
let cases=0;
const test=(name,fn)=>{fn();cases++;};
const coverage=precleanHash=>PRODUCT_LAND_COVERAGE.map(slot=>({...slot,precleanHash}));
function packageCase(name,bytes=raw,encoding='identity'){
 const root=path.join(dir,name);fs.mkdirSync(path.join(root,'city-data'),{recursive:true});
 const wire=encoding==='gzip'?gzipSync(bytes):bytes,hash=sha256(wire),entry={precleanHash:meta.identity.precleanHash,path:'city-data/'+hash+'.land'+(encoding==='gzip'?'.gz':''),encoding,bytes:wire.length,sha256:hash,rawBytes:bytes.length,rawSha256:sha256(bytes)};
 const catalog=createCatalog(meta.manifest,[entry],{coverage:coverage(entry.precleanHash)});fs.writeFileSync(path.join(root,entry.path),wire);fs.writeFileSync(path.join(root,'catalog.json'),JSON.stringify(catalog));
 return{root,entry,catalog,file:path.join(root,entry.path)};
}
function writeCatalog(c){fs.writeFileSync(path.join(c.root,'catalog.json'),JSON.stringify(c.catalog));}
function repeatRows(name){
 const root=path.join(dir,name);fs.mkdirSync(root);const rows=[];
 for(const slot of PRODUCT_LAND_COVERAGE)for(const repeat of [1,2]){
  const file=path.join(root,slot.district+'-'+slot.graphics+'-'+repeat+'.land'),bytes=Buffer.from('small verified transport stand-in');fs.writeFileSync(file,bytes);
  rows.push({district:slot.district,preset:slot.graphics,repeat,session:name+'-'+rows.length,file,bytes:bytes.length,sha256:sha256(bytes),manifest:structuredClone(meta.manifest),identity:structuredClone(meta.identity)});
 }
 return rows;
}
function replaceRowsBytes(rows,slot,bytes){for(const row of rows.filter(row=>row.district===slot.district&&row.preset===slot.graphics)){fs.writeFileSync(row.file,bytes);row.bytes=bytes.length;row.sha256=sha256(bytes);}}
// Explicit synthetic report: exercises the Node admission contract, never reclassifies a game observation.
function syntheticReport(slot){
 const x=fixture({receipt:{base,limits:{},receiptHash:'f'.repeat(64)}});x.ctx.runtime.mapId=base.mapId;x.ctx.runtime.district=slot.district;x.ctx.runtime.graphics=slot.graphics;x.ready();
 const m=x.endpoint.meta(),pizza={x:11,z:12,bx:13,bz:14},receipt={base,receiptHash:'f'.repeat(64),build:{hash:'a'.repeat(64)}};
 const result={ok:true,state:'title',meta:m,target:slot.district,preLate:{phase:'city-pizzeria-before-late',at:1,district:slot.district,pizzaIndex:slot.district,pizza,lateWorkStarted:false},current:{district:slot.district,pizzaIndex:slot.district,pizza:{...pizza},samePizzeriaReference:true},graphics:{preset:slot.graphics,device:'deck',width:1280,height:800},descriptor:descriptor(),crash:[]};
 const value={ok:true,evalErr:null,uncaught:0,errors:[],startupHost:{seed:null},result,landPackageExport:{acceptance:structuredClone(m.summary),expectedDistrict:slot.district,conditions:structuredClone(m.conditions),receiptHash:receipt.receiptHash,provenance:{sourceHash:base.sourceHash,buildHash:receipt.build.hash},manifest:structuredClone(m.manifest),identity:structuredClone(m.identity)}};
 return{value,receipt};
}
try{
 test('valid identity payload with all four product slots',()=>{const c=packageCase('plain');assert.equal(verifyLandPackage({repo,dir:c.root}).assets.length,1);});
 test('valid gzip product payload',()=>{const c=packageCase('gzip',raw,'gzip');assert.equal(verifyLandPackage({repo,dir:c.root}).catalog.entries[0].rawSha256,sha256(raw));});
 test('historical v1 parsed but not admitted to new product build',()=>{const c=packageCase('legacy');c.catalog=createCatalog(c.catalog.manifest,c.catalog.entries);assert.equal(checkCatalog(c.catalog).version,1);writeCatalog(c);assert.throws(()=>verifyLandPackage({repo,dir:c.root}),/PRODUCT_COVERAGE/);});
 test('missing far slot blocks product despite valid present asset',()=>{const c=packageCase('partial');c.catalog.coverage.pop();writeCatalog(c);assert.throws(()=>verifyLandPackage({repo,dir:c.root}),/PRODUCT_COVERAGE/);});
 test('another valid district cannot substitute required slot',()=>{const c=packageCase('substitute');c.catalog.coverage.at(-1).district=6;writeCatalog(c);assert.throws(()=>verifyLandPackage({repo,dir:c.root}),/PRODUCT_COVERAGE/);});
 test('coverage cannot reference absent input',()=>{const c=packageCase('bad-ref');c.catalog.coverage.at(-1).precleanHash='a'.repeat(64);writeCatalog(c);assert.throws(()=>verifyLandPackage({repo,dir:c.root}),/COVERAGE_REFERENCE/);});
 test('missing asset',()=>{const c=packageCase('missing');fs.unlinkSync(c.file);assert.throws(()=>verifyLandPackage({repo,dir:c.root}));});
 test('wire mutation',()=>{const c=packageCase('wire');const b=fs.readFileSync(c.file);b[b.length-1]^=1;fs.writeFileSync(c.file,b);assert.throws(()=>verifyLandPackage({repo,dir:c.root}),/PACKAGE_WIRE_SHA/);});
 test('coherent outer hashes still reject invalid codec block',()=>{const b=Buffer.from(raw);b[b.length-1]^=1;const c=packageCase('coherent',b);assert.throws(()=>verifyLandPackage({repo,dir:c.root}),/CRC|CHECKSUM/);});
 test('stale source',()=>{const c=packageCase('stale');c.catalog.manifest.sourceHash='0'.repeat(64);writeCatalog(c);assert.throws(()=>verifyLandPackage({repo,dir:c.root}),/PACKAGE_SOURCE_MISMATCH/);});
 test('bounded inflate',()=>{const c=packageCase('inflate',raw,'gzip');c.catalog.entries[0].rawBytes=1;writeCatalog(c);assert.throws(()=>verifyLandPackage({repo,dir:c.root}));});
 if(process.platform!=='win32')test('symlink cannot redirect payload',()=>{const c=packageCase('symlink');const external=path.join(dir,'outside.land');fs.writeFileSync(external,raw);fs.unlinkSync(c.file);fs.symlinkSync(external,c.file);assert.throws(()=>verifyLandPackage({repo,dir:c.root}),/PACKAGE_FILE_PATH/);});
 test('preparation code and actual district eval are bound in source provenance',()=>{
  for(const file of ['tools/land-package-prepare.mjs','tools/probe-checks/land-package-district-export.js']){
   assert.ok(PREPARATION_HELPERS.includes(file));assert.equal(captured.source.buildConfig.preparationHelpers[file],sha256(fs.readFileSync(path.join(repo,file))));
  }
 });
 for(const slot of PRODUCT_LAND_COVERAGE)test('progress descriptor '+slot.district+'/'+slot.graphics,()=>{
  const p=preparationFixture(slot);assert.equal(p['dlv-lang'],'ru');assert.equal(p['dlv-sound'],false);assert.equal(p['dlv-gfx']?.deck.p??'mid',slot.graphics);
  assert.equal(Object.keys(p).some(key=>key.startsWith('dlv-single-')||key==='dlv-profiles'),false);
  if(slot.district){assert.equal(p['dlv-district'],slot.district);assert.equal(p['dlv-shifts'],40);assert.equal(p['dlv-dist-open'],8);assert.deepEqual(p['dlv-dist-shifts'],[4,5,5,6,6,7,7,0]);assert.equal(p['dlv-dist-shifts'].reduce((a,b)=>a+b,0),40);assert.equal(p['dlv-city-party'],true);assert.equal(p['dlv-city-mode'],false);}
  else assert.equal(p['dlv-shifts'],undefined);
  p['dlv-dist-shifts']?.push(99);assert.notDeepEqual(preparationFixture(slot)['dlv-dist-shifts'],p['dlv-dist-shifts']??[]);
 });
 test('no new unsupported product descriptor',()=>assert.throws(()=>preparationFixture({district:3,graphics:'mid'}),/PREPARATION_SLOT/));
 for(const slot of PRODUCT_LAND_COVERAGE)test('synthetic exact export admission '+slot.district+'/'+slot.graphics,()=>{const {value,receipt}=syntheticReport(slot);assert.equal(checkPreparationExport(value,slot,receipt),value.landPackageExport);});
 for(const [name,mutate,reason] of [
  ['wrong expected target',v=>v.landPackageExport.expectedDistrict=7,/EXPORT_SLOT/],
  ['external seed',v=>v.startupHost.seed='24301',/EXPORT_ORDINARY/],
  ['lost owned hook',v=>v.result.descriptor.hookOwned=false,/ORDINARY_EDL/],
  ['wrong pizzeria before late',v=>v.result.preLate.pizzaIndex=7,/EXPORT_PRE_LATE_DISTRICT/],
  ['late work had started',v=>v.result.preLate.lateWorkStarted=true,/EXPORT_PRE_LATE_DISTRICT/],
  ['moved pizzeria',v=>v.result.current.pizza.x+=1,/EXPORT_PRE_LATE_PIZZA/],
  ['left menu',v=>v.result.state='drive',/EXPORT_PRE_LATE_DISTRICT/],
  ['build provenance mismatch',v=>v.landPackageExport.provenance.buildHash='b'.repeat(64),/EXPORT_PROVENANCE/],
  ['second clean',v=>v.result.meta.cleanCalls=2,/EXPORT_ACCEPTANCE/],
  ['random consumed during clean',v=>v.result.meta.randomCalls=1,/EXPORT_ACCEPTANCE/],
 ])test('synthetic reject '+name,()=>{const slot={district:3,graphics:'high'},{value,receipt}=syntheticReport(slot);mutate(value);assert.throws(()=>checkPreparationExport(value,slot,receipt),reason);});
 test('eight independent repeats dedup only their equal exact key/bytes',()=>{const rows=repeatRows('all-repeat'),checked=checkPreparationRepeats(rows);assert.equal(checked.coverage.length,4);assert.equal(checked.unique.length,1);});
 test('incomplete export set rejected',()=>assert.throws(()=>checkPreparationRepeats(repeatRows('incomplete').slice(1)),/PREPARATION_EXPORT_COUNT/));
 test('same session not independent',()=>{const rows=repeatRows('same-session');rows[1].session=rows[0].session;assert.throws(()=>checkPreparationRepeats(rows),/PREPARATION_INDEPENDENT_SESSIONS/);});
 test('same output not independent',()=>{const rows=repeatRows('same-output');rows[1].file=rows[0].file;assert.throws(()=>checkPreparationRepeats(rows),/PREPARATION_INDEPENDENT_OUTPUTS/);});
 test('same repeat number twice rejected',()=>{const rows=repeatRows('same-repeat');rows[1].repeat=1;assert.throws(()=>checkPreparationRepeats(rows),/PREPARATION_SLOT_REPEATS/);});
 test('changed file not accepted by stale raw SHA',()=>{const rows=repeatRows('changed-file');fs.writeFileSync(rows[1].file,Buffer.alloc(rows[1].bytes));assert.throws(()=>checkPreparationRepeats(rows),/EXPORT_FILE_SHA/);});
 test('same input cannot hide a different consistent result',()=>{const rows=repeatRows('different-same-key');replaceRowsBytes(rows,{district:3,graphics:'high'},Buffer.from('another consistent tiny output'));assert.throws(()=>checkPreparationRepeats(rows),/SAME_INPUT_DIFFERENT_RESULT/);});
 test('different exact key/result retained as separate entry',()=>{const rows=repeatRows('different-key'),slot={district:3,graphics:'high'},key='d'.repeat(64);replaceRowsBytes(rows,slot,Buffer.from('separate tiny output'));for(const row of rows.filter(row=>row.district===3))row.identity=makeIdentity(row.manifest,key);const result=checkPreparationRepeats(rows);assert.equal(result.unique.length,2);assert.equal(result.coverage.find(row=>row.district===3).precleanHash,key);});
 console.log('Prepared package v2 build/preparation verification: '+cases+' PASS');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
