// Offline archive audit only; no runtime source, game, build, probe, or test runner.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),read=p=>fs.readFileSync(path.join(dir,p));
const sha=b=>createHash('sha256').update(b).digest('hex'),load=p=>JSON.parse(p.endsWith('.gz')?gunzipSync(read(p)):read(p));
const names=['query1','query2','savedkeys'],raws=names.map(n=>load('runs/'+n+'/raw.json.gz')),results=raws.map(v=>v.result),fresh=results[0],summary={version:1,kind:'independent-raw-query-triple-audit',ok:false,checks:[],cases:[]};
const check=(label,fn)=>{fn();summary.checks.push(label);};
try{
 const source=load('provenance/source.json'),provenance=load('provenance/source-build.json');
 assert.equal(source.base.sourceHash,'b26caf3f59baa1bcf694fcd0336b4608b58e46447d5bd2d54c60beb746c41d85');
 assert.equal(provenance.build.hash,'db818ab44b1a87d9ad2c4fa1c0ee4a8939e682dd3f4df5d383355b428b35a634');
 assert.equal(sha(read('harness/query-eval.js')),'bee99bb14c491c347208a8aaedf97ffbc3894db63941f5da1d194bcb0c782cee');
 const wire=gunzipSync(read('artifacts/city.graph.gz'));
 for(let i=0;i<names.length;i++){
  const raw=raws[i],r=results[i],f=r.functionalQueries,c=r.report.marks['first.control'].data;
  check(names[i]+': actual startup and live eval assertions',()=>{
   assert.equal(raw.ok,true);assert.equal(r.ok,true);assert.equal(raw.evalErr,null);assert.deepEqual(raw.errors,[]);assert.equal(raw.uncaught,0);assert.deepEqual(r.crash,[]);
   assert.equal(r.conditions.lang,'ru');assert.equal(r.conditions.seed,null);assert.equal(r.conditions.physicalDeck,false);assert.deepEqual(r.conditions.graphics,{preset:'high',device:'deck',width:1280,height:800});assert.equal(raw.startupHost.cpuThrottle,3);assert.equal(raw.startupHost.bootcpu,true);
   assert.equal(c.guardVersion,2);assert.equal(c.state,'drive');for(const k of ['localReady','supportReady'])assert.equal(c[k],true);for(const k of ['paused','held','mapOpen'])assert.equal(c[k],false);assert.ok(r.moved>0.5);assert.equal(r.report.dropped,0);
   assert.equal(r.bootstrap.bootAbsentAtMarker,true);assert.equal(r.bootstrap.earlyBootSeen,false);assert.ok(r.bootstrap.markerWrites>=1);assert.equal(r.district.actual,0);assert.equal(r.district.before.opened,1);assert.equal(r.district.pickerClicks,0);
   assert.equal(f.actualQueries,true);assert.equal(f.outsideStartupTiming,true);assert.equal(f.oracleLanguage,'ru');assert.deepEqual(f.savedKeysBefore,f.savedKeysAfter);assert.equal(f.savedKeysBefore.length,12);for(const [k,v] of Object.entries(f.unchanged))assert.equal(v,true,k);
   assert.equal(f.addresses.length,5061);assert.equal(f.levels.length,7608);assert.equal(f.pool.length,1214);assert.equal(f.home.memoSameReference,true);assert.deepEqual(f.home.actual,f.home.expected);
   for(const a of f.addresses)assert.equal(a.actual,a.expected);for(const l of f.levels){assert.equal(l.actual,l.expected);assert.equal(l.viaDoor,l.actual);}for(const p of f.pool)assert.deepEqual(p.actual,p.expected);
  });
  check(names[i]+': actual graph packet/immutable source/owned rows',()=>{
   const g=r.graphExport;assert.equal(g.meta.identity.sourceHash,source.base.sourceHash);assert.equal(g.actualGameplayAliases,true);for(const k of ['byteExact','roadAliases','nodeIndexExact','liveRestored'])assert.equal(g.meta[k],true);assert.equal(g.meta.bufferHeld,false);
   assert.equal(sha(wire),g.wireSha256);assert.deepEqual(wire,Buffer.from(g.wireBase64,'base64'));assert.equal(g.meta.bytes,wire.length);
   assert.deepEqual(r.logical,fresh.logical);assert.deepEqual(r.addressCatalog,fresh.addressCatalog);
  });
  summary.cases.push({name:names[i],rawOriginalPath:load('raw-records.json')[i].rawOriginalPath,rawSha256:sha(gunzipSync(read('runs/'+names[i]+'/raw.json.gz'))),counts:f.counts,functionalElapsedMs:f.elapsedMs,moved:r.moved,graphSha256:r.graphExport.wireSha256,sourceFingerprint:gIdentity(r).sourceHash,unchanged:f.unchanged});
 }
 function gIdentity(r){return r.graphExport.meta.identity;}
 check('two actual independent fresh raws: full functional object exact except elapsedMs',()=>{
  const strip=f=>Object.fromEntries(Object.entries(f).filter(([k])=>k!=='elapsedMs'));
  assert.deepEqual(strip(results[0].functionalQueries),strip(results[1].functionalQueries));assert.deepEqual(results[0].graphExport,results[1].graphExport);
  assert.notEqual(raws[0].startupHost.processEpochMs,raws[1].startupHost.processEpochMs);assert.notEqual(raws[0].startupHost.navigateEpochMs,raws[1].startupHost.navigateEpochMs);
 });
 const a=fresh.logical.addresses,f=fresh.functionalQueries;
 const nearest=(x,z,limit=Infinity)=>{let distance=limit,index=-1;for(let i=0;i<a.houses.length;i++){const h=a.houses[i],v=(h[0]-x)**2+(h[1]-z)**2;if(v<distance){distance=v;index=i;}}return{index,distance};};
 const near=(x,z)=>a.entrances.some(e=>(e[0]-x)**2+(e[1]-z)**2<81);
 const key=(x,z)=>Math.round(x/4).toString(36)+'.'+Math.round(z/4).toString(36),quarter=(x,z)=>Math.round(x*4)+','+Math.round(z*4);
 check('independent scalar nearest/strict-radius/house60 oracles for actual tables, then exact same all3 cases',()=>{
  for(const q of f.addresses){const n=nearest(q.x,q.z);assert.equal(q.house,n.index);assert.equal(q.actual,a.houses[n.index][4]);}
  for(const q of f.levels){const n=nearest(q.x,q.z,3600),nearEntry=near(q.x,q.z),expected=nearEntry&&n.index>=0?(a.houses[n.index][6]||0):0;assert.equal(q.actual,expected);assert.equal(q.house,n.index);assert.equal(q.nearEntrance,nearEntry);}
  for(const r of results.slice(1))for(const k of ['addresses','levels','home','pool','witnesses'])assert.deepEqual(r.functionalQueries[k],f[k]);
 });
 check('witnesses prove non-vacuous first-wins/strict 9m/strict 60m over real rows',()=>{
  assert.equal(f.witnesses.ties.length,4);assert.equal(f.witnesses.radius.length,4);assert.equal(f.witnesses.house60.length,2);
  for(const t of f.witnesses.ties){const n=nearest(t.x,t.z),ties=a.houses.flatMap((h,i)=>(h[0]-t.x)**2+(h[1]-t.z)**2===n.distance?[i]:[]);assert.deepEqual(t.houses,ties);assert.ok(ties.length>1);assert.equal(t.winner,ties[0]);}
  for(const [i,t] of f.witnesses.radius.entries()){assert.equal(t.radius,9);const e=a.entrances[t.door];assert.equal((e[0]-t.x)**2+(e[1]-t.z)**2,81);assert.equal(near(t.x,t.z),false);assert.ok(f.levels.find(v=>v.kind==='radiusInside'&&v.index===i).actual>0);for(const kind of ['radiusExact','radiusOutside'])assert.equal(f.levels.find(v=>v.kind===kind&&v.index===i).actual,0);}
  for(const t of f.witnesses.house60){assert.equal(nearest(t.x,t.z).distance,3600);assert.equal(nearest(t.x,t.z,3600).index,-1);assert.equal(near(t.x,t.z),true);}
 });
 check('actual Gennady home at measured building/entrance/spot and nearest address',()=>{
  const h=f.home,v=h.actual,e=a.entrances[h.entrance],s=a.spots[h.spot],length=Math.hypot(e[2],e[3])||1;
  assert.equal(h.building,229);assert.equal(h.sourceId,118892081);assert.equal(h.entrance,477);assert.equal(h.spot,363);assert.equal(v.ex,e[0]);assert.equal(v.ez,e[1]);assert.equal(v.nx,e[2]/length);assert.equal(v.nz,e[3]/length);assert.equal(v.x,s[0]);assert.equal(v.z,s[1]);assert.equal(v.addr,a.houses[nearest(v.ex+v.nx*2,v.ez+v.nz*2).index][4]);
 });
 const doorKeys=new Set(a.entrances.map(e=>quarter(e[0]+e[2]*3,e[1]+e[3]*3)));
 check('all ordered actual POOL source indices/4m keys/quarter-metre entrance/distance',()=>{
  let last=-1;for(let i=0;i<f.pool.length;i++){const q=f.pool[i],p=q.actual,s=a.spots[q.sourceSPOTSindex];assert.ok(q.sourceSPOTSindex>last);last=q.sourceSPOTSindex;assert.equal(p.index,i);assert.equal(p.x,s[0]);assert.equal(p.z,s[1]);assert.equal(p.key,key(...s));assert.equal(p.entr,doorKeys.has(quarter(...s)));assert.equal(p.d,Math.hypot(p.x-fresh.district.pizza.x,p.z-fresh.district.pizza.z));}
 });
 const saved=results[2].functionalQueries,fixture=load('inputs/saved-keys-fixture.json'),keys=['ly.kd','kj.gx','nr.db','lu.bx','c4.7x'];
 check('saved fixture changes one input only and actual USED five rows retain ordered keys/mappings',()=>{
  const base=load('inputs/fresh-high-fixture.json'),without={...fixture};delete without['dlv-used-addr'];assert.deepEqual(without,base);assert.deepEqual(fixture['dlv-used-addr'],keys);
  assert.deepEqual(saved.used.map(v=>v.key),keys);assert.deepEqual(saved.used.map(v=>v.index),[0,1,2,3,4]);assert.deepEqual(saved.used.map(v=>v.poolIndices),[[0],[6],[389],[404],[]]);assert.deepEqual(saved.rawSavedUsed,keys);
  for(const rows of [saved.savedKeysBefore,saved.savedKeysAfter])assert.deepEqual(rows.find(([k])=>k==='dlv-used-addr')[1],keys);
  const usedKeySet=new Set(f.pool.map(p=>p.actual.key));assert.ok(!usedKeySet.has(keys[4]));assert.equal(key(...a.spots[1]),keys[4]);
  assert.deepEqual(results[0].functionalQueries.used,[]);assert.deepEqual(results[1].functionalQueries.used,[]);
 });
 const records=load('raw-records.json');
 check('root-transcribed actual argv/status and explicitly after-run harness pins',()=>{
  const protocol=load('provenance/root-protocol.json');assert.equal(protocol.build.exitCode,0);assert.equal(protocol.build.execSession,97694);
  const sessions=new Set();
  for(let i=0;i<names.length;i++){
   const row=protocol.runs[i],args=row.argvTranscribedFromExecutedRootToolCall;assert.equal(row.name,names[i]);assert.equal(row.exitCodeFromCompletedToolResult,0);assert.equal(row.signalProvidedByTool,false);assert.ok(!sessions.has(row.execSession));sessions.add(row.execSession);
   for(const arg of ['--mode=steam','--dir=/tmp/bird-logical17b-query-final-1102','--startup-cold','--fresh','--early','--size=deck','--cpu=3','--bootcpu','--init-script=/tmp/bird-logical17b-query-init-1102.js','--eval=/tmp/bird-logical17b-query-export-eval-1102.js','--q=gfxdev=deck&mute&startupdistrict=0&landpackage=0&logicalexport17b'])assert.ok(args.includes(arg),arg);
   assert.ok(args.includes('--startup-session=logical17b-'+names[i]+'-1102'));
   const fixturePath=i<2?'inputs/fresh-high-fixture.json':'inputs/saved-keys-fixture.json';assert.equal(sha(read(fixturePath)),row.fixtureSha256);
  }
  const pins={'tools/probe.cjs':'source/tools/probe.cjs','tools/probe-page.cjs':'source/tools/probe-page.cjs','/tmp/bird-logical17b-query-export-eval-1102.js':'harness/query-eval.js','/tmp/bird-logical17b-query-init-1102.js':'harness/init.js'};
  for(const pin of protocol.harnessPins){assert.equal(sha(read(pins[pin.file])),pin.sha256);assert.ok(pin.capture.startsWith('after-runs'));}
 });
 check('all stdout exact reconstruction and archive compression bytes/hashes',()=>{
  for(let i=0;i<names.length;i++){const rec=records[i];assert.equal(rec.rawSha256,summary.cases[i].rawSha256);if(rec.stdoutDeduplicated){const stdout=Buffer.from(JSON.stringify(results[i])+'\n');assert.equal(stdout.length,rec.stdoutBytes);assert.equal(sha(stdout),rec.stdoutSha256);}else{const stdout=gunzipSync(read('runs/'+names[i]+'/stdout.log.gz'));assert.equal(sha(stdout),rec.stdoutSha256);}}
  for(const row of load('copy-records.json')){const encoded=read(row.archivePath);assert.equal(sha(encoded),row.archiveSha256);const bytes=row.gzipLevel?gunzipSync(encoded):encoded;assert.equal(bytes.length,row.originalBytes);assert.equal(sha(bytes),row.originalSha256);}
 });
 summary.ok=true;summary.sourceFingerprint=source.base.sourceHash;summary.buildFingerprint=provenance.build.hash;summary.functionalSameFreshPair=true;summary.staticSameAll3=true;summary.actualAddressLevelHomePoolSameAll3=true;summary.savedKeysRetained=keys;summary.savedKeyMappings=saved.used;summary.graphSha256=sha(wire);summary.graphBytes=wire.length;
 summary.validatorCorrection=load('root-evidence/saved-key-summary.json').offlineCorrection;
 summary.limits=['This offline gate reads actual raws and recomputes value oracles; it cannot recreate JS reference identity after serialization. Ref assertions ran in captured eval.','RNG descriptor equality is not Math.random call-count instrumentation.','Functional query elapsed is diagnostic after first.control; no startup A/B or physical Deck claim.','Saved case proves loading/key compatibility, not delivery/markUsed/aging selection.','Exact process argv/status are separately transcribed by root protocol; raw alone does not prove argv or process signal.'];
}catch(error){summary.failure={name:error.name,message:error.message,stack:error.stack};}
fs.writeFileSync(path.join(dir,'independent-offline-audit.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary.ok?{ok:true,checks:summary.checks.length,source:summary.sourceFingerprint,cases:summary.cases.map(v=>({name:v.name,counts:v.counts,moved:v.moved}))}:summary));if(!summary.ok)process.exitCode=1;
