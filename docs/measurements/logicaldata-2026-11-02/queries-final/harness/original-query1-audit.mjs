import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const file='/tmp/bird-logical17b-query1-1102.json',output='/tmp/bird-logical17b-query1-audit-1102.json',proposal='/tmp/bird-logical17b-saved-key-proposal-1102.json';
const rawBytes=fs.readFileSync(file),rawSha=createHash('sha256').update(rawBytes).digest('hex');
const report={version:1,kind:'query1-readonly-offline-audit',rawPath:file,rawBytes:rawBytes.length,rawSha256:rawSha,checks:[],ok:false};
const check=(name,fn)=>{fn();report.checks.push(name);};
try{
 const raw=JSON.parse(rawBytes),r=raw.result,f=r.functionalQueries,a=r.logical.addresses;
 check('actual process report/startup',()=>{assert.equal(raw.ok,true);assert.equal(r.ok,true);assert.equal(raw.evalErr,null);assert.deepEqual(raw.errors,[]);assert.equal(raw.uncaught,0);assert.deepEqual(r.crash,[]);assert.equal(f.actualQueries,true);assert.equal(f.oracleLanguage,'ru');assert.equal(f.outsideStartupTiming,true);assert.equal(r.conditions.seed,null);assert.ok(r.moved>0.5);assert.equal(r.report.marks['first.control'].data.guardVersion,2);});
 const nearest=(x,z,limit=Infinity)=>{let dist=limit,winner=-1;for(let i=0;i<a.houses.length;i++){const h=a.houses[i],value=(h[0]-x)**2+(h[1]-z)**2;if(value<dist){dist=value;winner=i;}}return{winner,dist};};
 const radius=f.witnesses.radius[0]?.radius;assert.equal(radius,9);
 const nearDoor=(x,z)=>a.entrances.some(e=>(e[0]-x)**2+(e[1]-z)**2<radius**2);
 check('all actual address rows independently recomputed',()=>{
  assert.equal(f.addresses.length,5061);
  for(const q of f.addresses){const n=nearest(q.x,q.z);assert.ok(n.winner>=0);assert.equal(q.actual,a.houses[n.winner][4]);assert.equal(q.expected,q.actual);assert.equal(q.house,n.winner);}
  assert.equal(f.addresses.filter(q=>q.kind==='house').length,a.houses.length);
  assert.equal(f.addresses.filter(q=>q.kind.endsWith('DoorFront')).length,a.entrances.length);
 });
 check('all actual level/DOOR wrapper rows independently recomputed',()=>{
  assert.equal(f.levels.length,7608);
  for(const q of f.levels){const near=nearDoor(q.x,q.z),n=nearest(q.x,q.z,3600),value=near&&n.winner>=0?(a.houses[n.winner][6]||0):0;assert.equal(q.actual,value);assert.equal(q.viaDoor,value);assert.equal(q.expected,value);assert.equal(q.nearEntrance,near);assert.equal(q.house,n.winner);}
  assert.equal(f.levels.filter(q=>q.kind==='rawDoor').length,12);assert.equal(f.levels.filter(q=>q.kind==='generatedDoor').length,3699);
 });
 check('real non-vacuous exact nearest tie/radius/house60 witnesses',()=>{
  assert.equal(f.witnesses.ties.length,4);assert.equal(f.witnesses.radius.length,4);assert.equal(f.witnesses.house60.length,2);
  for(const t of f.witnesses.ties){const n=nearest(t.x,t.z);const tied=a.houses.flatMap((h,i)=>(h[0]-t.x)**2+(h[1]-t.z)**2===n.dist?[i]:[]);assert.ok(tied.length>1);assert.deepEqual(t.houses,tied);assert.equal(t.winner,tied[0]);assert.equal(t.squaredDistance,n.dist);}
  for(const [i,t] of f.witnesses.radius.entries()){const e=a.entrances[t.door];assert.equal((e[0]-t.x)**2+(e[1]-t.z)**2,radius**2);assert.equal(nearDoor(t.x,t.z),false);const rows=f.levels.filter(q=>q.index===i&&q.kind.startsWith('radius'));assert.equal(rows.length,3);assert.ok(rows.find(q=>q.kind==='radiusInside').actual>0);assert.equal(rows.find(q=>q.kind==='radiusExact').actual,0);assert.equal(rows.find(q=>q.kind==='radiusOutside').actual,0);}
  for(const t of f.witnesses.house60){assert.equal(nearest(t.x,t.z).dist,3600);assert.equal(nearest(t.x,t.z,3600).winner,-1);assert.equal(nearDoor(t.x,t.z),true);}
  assert.equal(nearDoor(f.witnesses.far.x,f.witnesses.far.z),false);assert.deepEqual(f.witnesses.missingWitnesses,{ties:false,radius:false,house60:false});
 });
 check('actual fixed story home/reference proof and real ordered source values',()=>{
  const h=f.home;assert.equal(h.id,'gennady');assert.equal(h.memoSameReference,true);assert.equal(h.building,229);assert.equal(h.sourceId,118892081);assert.equal(h.actual.addr,'улица Царевского, 2');assert.deepEqual(h.actual,h.expected);
  const e=a.entrances[h.entrance],spot=a.spots[h.spot],v=h.actual,length=Math.hypot(e[2],e[3])||1;
  assert.equal(v.ex,e[0]);assert.equal(v.ez,e[1]);assert.equal(v.nx,e[2]/length);assert.equal(v.nz,e[3]/length);assert.equal(v.sx,-v.nz);assert.equal(v.sz,v.nx);assert.equal(v.x,spot[0]);assert.equal(v.z,spot[1]);
  const n=nearest(v.ex+v.nx*2,v.ez+v.nz*2);assert.equal(v.addr,a.houses[n.winner][4]);
 });
 const key=(x,z)=>Math.round(x/4).toString(36)+'.'+Math.round(z/4).toString(36);
 const quarter=(x,z)=>Math.round(x*4)+','+Math.round(z*4);
 const doors=new Set(a.entrances.map(e=>quarter(e[0]+e[2]*3,e[1]+e[3]*3)));
 const rawDoors=new Set(a.entrances.slice(0,12).map(e=>quarter(e[0]+e[2]*3,e[1]+e[3]*3)));
 const generatedDoors=new Set(a.entrances.slice(12).map(e=>quarter(e[0]+e[2]*3,e[1]+e[3]*3)));
 check('all ordered actual POOL coordinates/indices/4m keys/quarter entr/distances',()=>{
  assert.equal(f.pool.length,1214);let previous=-1;
  for(const q of f.pool){const p=q.actual,s=a.spots[q.sourceSPOTSindex];assert.ok(q.sourceSPOTSindex>previous);previous=q.sourceSPOTSindex;assert.equal(p.index,f.pool.indexOf(q));assert.equal(p.x,s[0]);assert.equal(p.z,s[1]);assert.equal(p.entr,doors.has(quarter(p.x,p.z)));assert.equal(p.key,key(p.x,p.z));assert.equal(p.d,Math.hypot(p.x-r.district.pizza.x,p.z-r.district.pizza.z));assert.deepEqual(p,q.expected);}
 });
 check('fresh actual USED plus 12 saved keys unchanged; captured reference invariants',()=>{
  assert.deepEqual(f.used,[]);assert.deepEqual(f.rawSavedUsed,[]);assert.deepEqual(f.savedKeysBefore,f.savedKeysAfter);assert.equal(f.savedKeysBefore.length,12);
  for(const [name,value] of Object.entries(f.unchanged))assert.equal(value,true,name);
  assert.equal(f.savedKeysBefore.find(([k])=>k==='dlv-used-addr')[1],null);
 });
 const selected=[],taken=new Set();
 const choose=(label,predicate)=>{const row=f.pool.find(q=>!taken.has(q.actual.key)&&predicate(q.actual));if(!row)return false;taken.add(row.actual.key);const v=row.actual;selected.push({selection:label,key:v.key,poolIndex:v.index,sourceSPOTSindex:row.sourceSPOTSindex,x:v.x,z:v.z,entr:v.entr,zone:v.zone,d:v.d,quarterKey:quarter(v.x,v.z),rawDoorWitness:rawDoors.has(quarter(v.x,v.z)),generatedDoorWitness:generatedDoors.has(quarter(v.x,v.z))});return true;};
 const available={rawDoor:choose('raw-door',p=>rawDoors.has(quarter(p.x,p.z))),generatedDoor:choose('generated-door',p=>generatedDoors.has(quarter(p.x,p.z))),path:choose('path',p=>!p.entr),negativeCoordinate:false};
 if(selected.length<4)available.negativeCoordinate=choose('negative-coordinate',p=>p.x<0||p.z<0);
 for(const i of [0,Math.floor(f.pool.length/3),Math.floor(2*f.pool.length/3),f.pool.length-1]){if(selected.length>=4)break;choose('ordered-fallback-'+i,p=>p.index===i);}
 for(let i=0;selected.length<4&&i<f.pool.length;i++)choose('remaining-source-order',()=>true);
 assert.equal(selected.length,4);assert.equal(new Set(selected.map(q=>q.key)).size,4);
 const poolKeys=new Set(f.pool.map(q=>q.actual.key));let outside=null;
 for(let i=0;i<a.spots.length;i++){const s=a.spots[i],k=key(...s);if(!poolKeys.has(k)){outside={key:k,sourceSPOTSindex:i,x:s[0],z:s[1],entr:doors.has(quarter(...s)),quarterKey:quarter(...s),poolIndices:[],district:'not observed offline; do not infer'};break;}}
 assert.ok(outside);assert.ok(!poolKeys.has(outside.key));
 const prop={version:1,status:'PROPOSAL ONLY; wait for independent query2 PASS before creating fixture',sourceRaw:file,sourceRawSha256:rawSha,sourceFingerprint:r.graphExport.meta.identity.sourceHash,buildFingerprint:'root frozen db818ab4 (full build hash must be pinned from provenance)',selectionAvailability:available,selectedPoolKeys:selected,legacyOutsidePool:outside,proposedDlvUsedAddr:[...selected.map(q=>q.key),outside.key],expectedLoad:{code:'orders.loadUsed: Store.get(key,[]) -> array string filter, or string split/filter; reindex UIDX. resetShift builds POOL but does not clear/rewrite USED; reloadUsed re-reads only if explicitly called (eval does not call it).',freshObservation:'USED=[] while raw saved dlv-used-addr is absent; no delivery performed.',thirdCaseExpected:'exact ordered five strings in actual USED and Store before/after queries; 4 map to existing POOL key sets, legacy outside key maps to none',notYetProved:['Third saved fixture not written or executed','No claim about selection/aging/markUsed','Geometry/noninput invariance under saved list must pass third case, not assumed']}};
 fs.writeFileSync(proposal,JSON.stringify(prop,null,2)+'\n',{flag:'wx'});
 report.ok=true;report.counts=f.counts;report.witnesses={ties:4,radius:4,house60:2};report.home=f.home;report.unchanged=f.unchanged;report.elapsedFunctionalMs=f.elapsedMs;report.proposal=proposal;report.limits=['Offline cannot re-prove JS object identity: references are captured eval assertions','Pool zone/eligibility expected values were evaluated via actual runtime ZN/DIST/nearestRoad; offline verifies recorded projection/order/key/entr/d, not a rewritten world','Fresh case does not prove saved fixture behavior before case3'];
}catch(e){report.failure={name:e.name,message:e.message,stack:e.stack};}
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report.ok?{ok:true,checks:report.checks.length,counts:report.counts,proposal}:report));
if(!report.ok)process.exitCode=1;
