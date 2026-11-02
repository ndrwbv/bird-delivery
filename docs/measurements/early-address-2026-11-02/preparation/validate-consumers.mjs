import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateStartupReport} from '/Users/andrewboev/Desktop/not-work/delivery/tools/startup-report.mjs';
const folder='/tmp/bird-address-package17b-prepare-1102';
const sha=b=>createHash('sha256').update(b).digest('hex');
const decode=e=>{const[t,v]=e;if(t==='number'){const b=Buffer.from(v,'hex');return new DataView(b.buffer,b.byteOffset,b.byteLength).getFloat64(0,true);}if(t==='undefined')return undefined;if(t==='null')return null;if(t==='array')return v.map(decode);if(t==='object')return Object.fromEntries(v.map(([k,x])=>[k,decode(x)]));return v;};
const exact=x=>{if(x===null)return['null'];if(x===undefined)return['undefined'];if(typeof x==='number'){assert(Number.isFinite(x));const b=Buffer.alloc(8);b.writeDoubleLE(x);return['number',b.toString('hex')];}if(Array.isArray(x))return['array',x.map(exact)];if(typeof x==='object')return['object',Object.keys(x).map(k=>[k,exact(x[k])])];return[typeof x,x];};
const journal=JSON.parse(fs.readFileSync(folder+'/preparation.json')),expected=journal.package.catalog;
const rows=[];
for(const mode of ['reader','generated']){
 const bytes=fs.readFileSync(folder+'/consumer-'+mode+'.json'),value=JSON.parse(bytes),r=value.result,a=r?.preparedAddress;
 assert.equal(value.ok,true);assert.equal(value.uncaught,0);assert.deepEqual(value.errors,[]);
 assert.deepEqual(validateStartupReport(value,{expectedDistrict:0,requireDistrict:true,requireGuardV2:true}),{ok:true,reasons:[]});
 assert.equal(r.host.seed,null);assert.equal(r.host.cpuThrottle,1);assert.equal(r.host.bootcpu,true);assert.equal(r.district.pickerClicks,1);
 assert.equal(r.conditions.graphics.preset,'high');assert.equal(r.conditions.graphics.device,'deck');assert.equal(r.conditions.graphics.width,1280);assert.equal(r.conditions.graphics.height,800);
 assert.equal(a.input.eligible,true);assert.equal(a.input.identity.sourceHash,expected.identity.sourceHash);assert.equal(a.preload.held,false);
 assert.deepEqual(a.preVisual.before,a.preVisual.after);assert.equal(a.preVisual.lateWorkStarted,false);assert.equal(a.preVisual.before.houses,0);assert.equal(a.preVisual.before.generatedDoors,0);assert.equal(a.preVisual.before.spots,0);
 if(mode==='reader'){
  assert.deepEqual(a.input.identity,expected.identity);assert.equal(a.status.phase,'private-ready');assert.equal(a.provider.phase,'sealed');assert.equal(a.provider.fatal,false);assert.equal(a.provider.auditRetained,false);assert.equal(a.earlyQueriesMatchLegacy,true);
  assert.equal(a.preload.wireBytes,expected.entry.bytes);assert.equal(a.preload.wireHash,expected.entry.sha256);assert.equal(a.preload.phase,'consumed');assert(a.early.at<r.report.marks['city.syncBuilt'].at);
  assert.deepEqual(a.early.before,a.early.after);assert.equal(a.early.before.houses,0);assert.equal(a.early.before.generatedDoors,0);assert.equal(a.early.before.spots,0);
  const tables=decode(r.addressClosure.exactQueryTables),p={addresses:tables.addresses.map(({kind,index,x,z,actual})=>({kind,index,x,z,actual})),levels:tables.levels.map(({kind,index,x,z,actual})=>({kind,index,x,z,actual}))};
  assert.deepEqual(a.early.queries.queriesExact,exact(p));assert(a.early.queries.budget.chargedBytes<=a.early.queries.budget.ceiling);
 }else {assert.equal(a.mode,'0');assert.equal(a.provider,null);assert.equal(a.early,null);assert.notEqual(a.input.identity.inputHash,expected.identity.inputHash);}
 rows.push({mode,rawSha256:sha(bytes),result:r});
}
for(const field of ['menuExact','fixedQueriesExact','exactQueryTables'])assert.deepEqual(rows[0].result.addressClosure[field],rows[1].result.addressClosure[field]);
const query=r=>[...new URL(r.conditions.url).searchParams].filter(([k])=>k!=='addresspackage17b');assert.deepEqual(query(rows[0].result),query(rows[1].result));
console.log(JSON.stringify({ok:true,cases:rows.map(({mode,rawSha256,result:r})=>({mode,rawSha256,moved:r.moved,inputHash:r.preparedAddress.input.identity.inputHash,provider:r.preparedAddress.provider})),sameOrderedMenuAndQueries:true,earlyQueriesExactMatchLegacy:true,scope:'One exact B1 input, private early data before city; no early control/all axes/speed/physical Deck claim'},null,2));
