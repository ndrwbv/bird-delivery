/* Small production data contracts: no city, renderer, build or asset file. */
import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';
import {makeIdentity,makeManifest,checkReceipt,assertOrdinaryEDL,canonical} from '../src/game/landdata/land-package-key.js';
import {createCatalog,checkCatalog,lookupCatalog,PRODUCT_LAND_COVERAGE,assertProductCoverage} from '../src/game/landdata/land-package-catalog.js';
import {makeSourceKey} from './land-package-source-key.mjs';
import {createLandCover} from '../src/game/landcover.js';
import {createLandMask} from '../src/game/landmask.js';
import {captureResult,encodeCheckpoint,decodeCheckpoint} from '../src/game/landcache17a/checkpoint-codec.js';
let count=0;const test=(name,fn)=>{fn();count++;};
const h=c=>c.repeat(64),clone=x=>structuredClone(x);
const parameters={minWidth:.8,coverCell:32,maskCell:32,indexCell:8,terrainG:16,terrainNX:764,terrainNZ:581,terrainX0:-6097,terrainZ0:-4635};
const manifest={version:1,kind:'land-package17b',mapId:'seversk',mapHash:h('a'),editsHash:h('b'),sourceHash:h('c'),parameters};
const raw={precleanHash:h('d'),path:'city-data/'+h('e')+'.land',encoding:'identity',bytes:100,sha256:h('e'),rawBytes:100,rawSha256:h('e')};
const catalog=createCatalog(manifest,[raw]);
test('receipt has no guessed parameters; complete manifest owns actual prepare values',()=>{const {parameters,kind,version,...receipt}=manifest;checkReceipt(receipt);assert.deepEqual(makeManifest(receipt,parameters),manifest);assert.throws(()=>checkReceipt({...receipt,parameters}));assert.throws(()=>checkReceipt({...receipt,version:1}));assert.throws(()=>makeManifest(receipt,{...parameters,terrainNX:NaN}));const actual={...parameters},complete=makeManifest(receipt,actual);actual.minWidth=.9;assert.equal(complete.parameters.minWidth,.8);});
test('canonical refuses unsupported values and sparse arrays rather than key collisions',()=>{for(const value of [NaN,undefined,()=>{},-0,[,],new Date()])assert.throws(()=>canonical(value));});
test('exact input hit; a genuinely new preclean is a miss',()=>{assert.equal(lookupCatalog(catalog,{manifest,precleanHash:h('d')}).hit,true);assert.deepEqual(lookupCatalog(catalog,{manifest,precleanHash:h('f')}),{hit:false,reason:'input-miss'});});
test('same preclean cannot bypass actual prepare parameters or source/map edits',()=>{for(const change of [m=>m.parameters.minWidth=.9,m=>m.sourceHash=h('f'),m=>m.editsHash=h('f')]){const other=clone(manifest);change(other);assert.deepEqual(lookupCatalog(catalog,{manifest:other,precleanHash:h('d')}),{hit:false,reason:'input-mismatch'});}});
test('parameter key insertion order does not change codec identity',()=>{const other=clone(manifest);other.parameters=Object.fromEntries(Object.entries(other.parameters).reverse());assert.deepEqual(makeIdentity(other,h('d')),makeIdentity(manifest,h('d')));});
test('catalog owns records; caller mutation does not rewrite accepted configuration',()=>{const m=clone(manifest),e=clone(raw),c=createCatalog(m,[e]);m.parameters.minWidth=.9;e.bytes=999;assert.deepEqual(c,catalog);const hit=lookupCatalog(c,{manifest,precleanHash:h('d')});hit.entry.bytes=999;assert.deepEqual(c,catalog);});
test('duplicate inputs, traversal/absolute paths and plain SHA/size disagreement reject',()=>{assert.throws(()=>createCatalog(manifest,[raw,raw]));for(const path of ['../x','/city-data/x','https://x/y','city-data/%2e%2e/x'])assert.throws(()=>createCatalog(manifest,[{...raw,path}]));assert.throws(()=>createCatalog(manifest,[{...raw,rawBytes:101}]));assert.throws(()=>createCatalog(manifest,[{...raw,rawSha256:h('f')}]));});
test('gzip binds compressed transport and decoded content separately',()=>{const e={...raw,encoding:'gzip',path:'city-data/'+h('f')+'.land.gz',sha256:h('f'),bytes:40};assert.deepEqual(lookupCatalog(createCatalog(manifest,[e]),{manifest,precleanHash:h('d')}).entry,e);});
const productRows=()=>PRODUCT_LAND_COVERAGE.map(slot=>({...slot,precleanHash:raw.precleanHash}));
test('v2 exact product coverage owns rows, sorts slots and shares one exact entry',()=>{
 const rows=productRows().reverse(),v2=createCatalog(manifest,[raw],{coverage:rows});
 assert.equal(v2.version,2);assert.deepEqual(v2.coverage,productRows());assert.equal(v2.entries.length,1);
 assert.deepEqual(assertProductCoverage(v2),v2);assert.deepEqual(checkCatalog(v2),v2);
 rows[0].district=6;assert.deepEqual(v2.coverage,productRows());
 assert.equal(Object.isFrozen(PRODUCT_LAND_COVERAGE),true);assert.equal(PRODUCT_LAND_COVERAGE.every(Object.isFrozen),true);
 assert.equal(checkCatalog(catalog).version,1);assert.throws(()=>assertProductCoverage(catalog),/PRODUCT_COVERAGE/);
});
test('v2 missing, duplicate, malformed, foreign-reference and excessive coverage reject',()=>{
 for(const rows of [[],null,Array(17).fill(productRows()[0]),[...productRows(),productRows()[0]],productRows().map((r,i)=>i? r:{...r,precleanHash:h('f')}),productRows().map((r,i)=>i? r:{...r,extra:true})])assert.throws(()=>createCatalog(manifest,[raw],{coverage:rows}));
 for(const district of [-1,-0,8,3.5,'3',null,undefined])assert.throws(()=>createCatalog(manifest,[raw],{coverage:[{district,graphics:'high',precleanHash:raw.precleanHash}]}));
 for(const graphics of ['low','HIGH','',null])assert.throws(()=>createCatalog(manifest,[raw],{coverage:[{district:0,graphics,precleanHash:raw.precleanHash}]}));
 const full=createCatalog(manifest,[raw],{coverage:productRows()});
 const {coverage,...missing}=full;assert.throws(()=>checkCatalog(missing));
 assert.throws(()=>checkCatalog({...full,coverage:undefined}));assert.throws(()=>checkCatalog({...full,unexpected:0}));assert.throws(()=>checkCatalog({...catalog,coverage}));
});
test('generic known slots do not claim product support; product requires exactly four',()=>{
 for(const rows of [productRows().slice(0,3),[...productRows(),{district:3,graphics:'mid',precleanHash:raw.precleanHash}],productRows().map((row,i)=>i===3?{...row,district:6}:row)]){
  const c=createCatalog(manifest,[raw],{coverage:rows});assert.equal(c.version,2);assert.throws(()=>assertProductCoverage(c),/PRODUCT_COVERAGE/);
 }
});
test('build/file hashes cannot leak into header manifest',()=>{for(const k of ['buildHash','fileSha256','runtime','query'])assert.throws(()=>makeIdentity({...manifest,[k]:h('f')},h('d')));});
test('production identity is accepted by the unchanged real codec; different params fail decode',()=>{const cover=createLandCover(),green=createLandCover(),finalMask=createLandMask();finalMask.finish();const ST={built:false,supportReady:false,minWidth:.8,cleanedArea:0,fillTriangles:0,fillDraw:0,cleanTiles:0,maskTriangles:0,maskEdges:0};const state=captureResult({cover,green,finalMask,ST},{prepared:true,completed:true,deferDraw:true}),id=makeIdentity(manifest,h('d')),wire=encodeCheckpoint(state,id);assert.deepEqual(decodeCheckpoint(wire,id),state);const changed=clone(manifest);changed.parameters.minWidth=.9;assert.throws(()=>decodeCheckpoint(wire,makeIdentity(changed,h('d'))),/IDENTITY_MISMATCH/);});
const files=[{path:'src/a.js',bytes:new TextEncoder().encode('export const x=1;\n'),text:true},{path:'src/raw.bin',bytes:new Uint8Array([0,13,255]),text:false}];
const lock={name:'game',version:'1',lockfileVersion:3,packages:{'':{version:'1',dependencies:{clipper:'1'}},'node_modules/clipper':{version:'1',integrity:'sha512-a'}}};
const source=extra=>makeSourceKey({files,lock,buildConfig:{deferDraw:true},...extra});
test('root release version and enumeration order do not invalidate functional source key',()=>{const bumped=clone(lock);bumped.version='2';bumped.packages[''].version='2';assert.equal(source(),source({lock:bumped,files:[...files].reverse()}));});
test('dependency/content change invalidates key; CRLF/path/duplicate ambiguity rejects',()=>{const dep=clone(lock);dep.packages['node_modules/clipper'].integrity='sha512-b';assert.notEqual(source(),source({lock:dep}));assert.notEqual(source(),source({files:[{...files[0],bytes:new TextEncoder().encode('changed\n')},files[1]]}));assert.throws(()=>source({files:[{...files[0],bytes:new TextEncoder().encode('x\r\n')}]}),/REQUIRES_LF/);assert.throws(()=>source({files:[files[0],files[0]]}));assert.throws(()=>source({files:[{...files[0],path:'src\\a.js'}]}));});
const edlSource=fs.readFileSync(new URL('../src/game/editlayer.js',import.meta.url),'utf8');
const block=edlSource.slice(edlSource.indexOf('const SEEDED ='),edlSource.indexOf('/* ── поставить добавленное')).replaceAll('export ','');
const edl=external=>{const random=()=>.314159,math=Object.create(Math);math.random=random;const context=vm.createContext({Math:math,window:external?{__lateSeed:()=>{}}:{},queueMicrotask:()=>{}});vm.runInContext(block,context);return{descriptor:()=>vm.runInContext('rngDescriptor()',context),context,random,math};};
test('ordinary descriptor is readonly; external-at-import or later replacement refuses',()=>{const own=edl(false);assertOrdinaryEDL(own.descriptor());assert.equal(own.math.random,own.random);const desc=own.descriptor();desc.baseSeed=7;assertOrdinaryEDL(own.descriptor());const external=edl(true);assert.throws(()=>assertOrdinaryEDL(external.descriptor()));own.context.window.__lateSeed=()=>{};assert.throws(()=>assertOrdinaryEDL(own.descriptor()));assert.equal(own.math.random,own.random);});
console.log(JSON.stringify({ok:true,checks:count,scope:'pure key/catalog/source + unchanged codec + EDL descriptor only; no city/game'}));
