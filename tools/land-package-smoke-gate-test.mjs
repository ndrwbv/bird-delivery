import assert from 'node:assert/strict';
import {smokeDistrictFromArgs,selectSmokeCoverage,assertSmokeDistrict} from './land-package-smoke-gate.mjs';
import {createCatalog,PRODUCT_LAND_COVERAGE} from '../src/game/landdata/land-package-catalog.js';
import {makeManifest} from '../src/game/landdata/land-package-key.js';
import {base,parameters} from './land-package-export-fixture.mjs';
let checks=0;const test=(name,fn)=>{fn();checks++;};
const key='a'.repeat(64),other='b'.repeat(64),sha='c'.repeat(64);
const entry={precleanHash:key,path:'city-data/'+sha+'.land',encoding:'identity',bytes:4,sha256:sha,rawBytes:4,rawSha256:sha};
const manifest=makeManifest(base,parameters),catalog=createCatalog(manifest,[entry],{coverage:PRODUCT_LAND_COVERAGE.map(slot=>({...slot,precleanHash:key}))});
const result=district=>({district:{actual:district,atControl:district,pizzaIndex:district,before:{district,city:false,opened:district?8:1,partySeen:district>0},pickerClicks:district?1:0},landPackage:{precleanHash:key}});

test('existing default0 requires no explicit fixture',()=>assert.equal(smokeDistrictFromArgs([]),0));
for(const district of [0,3,7])test('canonical target '+district,()=>assert.equal(smokeDistrictFromArgs(['--district='+district],{preset:'high',fixture:'saved.json'}),district));
for(const value of ['','1','2','4','5','6','8','-1','-0','03','3.0','3.5',' 3','3 ','NaN','Infinity'])test('reject invalid target '+JSON.stringify(value),()=>assert.throws(()=>smokeDistrictFromArgs(['--district='+value],{fixture:'saved.json'}),/SMOKE_DISTRICT_OPTION/));
for(const argv of [['--district'],['--district=3','--district=7'],['--district=3','--district=3']])test('reject bare/duplicate target',()=>assert.throws(()=>smokeDistrictFromArgs(argv,{fixture:'saved.json'}),/SMOKE_DISTRICT_OPTION/));
for(const district of [3,7]){
 test('nonzero needs explicit fixture '+district,()=>assert.throws(()=>smokeDistrictFromArgs(['--district='+district]),/SMOKE_DISTRICT_FIXTURE_HIGH/));
 test('nonzero rejects empty fixture '+district,()=>assert.throws(()=>smokeDistrictFromArgs(['--district='+district],{fixture:''}),/SMOKE_DISTRICT_FIXTURE_HIGH/));
 test('nonzero rejects mid '+district,()=>assert.throws(()=>smokeDistrictFromArgs(['--district='+district],{preset:'mid',fixture:'saved.json'}),/SMOKE_DISTRICT_FIXTURE_HIGH/));
}
for(const district of [0,3,7]){
 test('generated physical district '+district,()=>assert.equal(assertSmokeDistrict(result(district),{district,preset:'high',variant:'generated',catalog}),null));
 test('cache selects exact v2 slot '+district,()=>{const selected=assertSmokeDistrict(result(district),{district,preset:'high',variant:'cache',catalog});assert.equal(selected.slot.district,district);assert.equal(selected.slot.graphics,'high');assert.equal(selected.entry.precleanHash,key);});
}
for(const district of [3,7])for(const mutate of [r=>r.district.pickerClicks=0,r=>r.district.pickerClicks=1.5,r=>r.district.before.opened=1,r=>r.district.before.partySeen=false])test('nonzero normal picker evidence required',()=>{const r=result(district);mutate(r);assert.throws(()=>assertSmokeDistrict(r,{district,preset:'high',variant:'generated',catalog}),/SMOKE_DISTRICT_PICKER/);});
for(const mutate of [r=>r.district.actual=0,r=>r.district.atControl=0,r=>r.district.pizzaIndex=0,r=>r.district.before.district=0,r=>r.district.before.city=true])test('actual target cannot be substituted',()=>{const r=result(3);mutate(r);assert.throws(()=>assertSmokeDistrict(r,{district:3,preset:'high',variant:'generated',catalog}),/SMOKE_ACTUAL_DISTRICT/);});
test('another existing entry does not substitute selected slot key',()=>{const second={...entry,precleanHash:other},two=createCatalog(manifest,[entry,second],{coverage:catalog.coverage}),r=result(3);r.landPackage.precleanHash=other;assert.throws(()=>assertSmokeDistrict(r,{district:3,preset:'high',variant:'cache',catalog:two}),/SMOKE_COVERAGE_INPUT/);});
test('unknown combination has no coverage',()=>assert.throws(()=>selectSmokeCoverage(catalog,{district:3,preset:'mid'}),/SMOKE_COVERAGE_SLOT/));
test('missing actual slot rejected even with valid entries',()=>{const partial=createCatalog(manifest,[entry],{coverage:catalog.coverage.filter(row=>row.district!==7)});assert.throws(()=>selectSmokeCoverage(partial,{district:7,preset:'high'}),/SMOKE_COVERAGE_SLOT/);});
test('historical catalog is not v2 smoke coverage proof',()=>assert.throws(()=>selectSmokeCoverage(createCatalog(manifest,[entry]),{district:0,preset:'high'}),/SMOKE_CATALOG_V2/));
console.log('District smoke admission: '+checks+' PASS');
