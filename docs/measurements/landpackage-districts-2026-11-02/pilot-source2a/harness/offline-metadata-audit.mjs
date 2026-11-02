// Only archived metadata/source snapshots: never reads external .land or a build/source tree.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {gunzipSync} from 'node:zlib';import assert from 'node:assert/strict';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),read=p=>fs.readFileSync(path.join(dir,p)),load=p=>JSON.parse(read(p)),sha=b=>createHash('sha256').update(b).digest('hex');
const audit=load('independent-payload-audit.json'),receipt=load('provenance/export-receipt.json'),source=load('provenance/source-before.json'),harness=load('provenance/harness.json'),epochs=new Set();
assert.equal(audit.ok,true);assert.equal(audit.cases.length,5);assert.equal(audit.sourceFingerprint,source.base.sourceHash);assert.deepEqual(receipt.base,source.base);assert.equal(receipt.build.hash,harness.build);assert.equal(receipt.receiptHash,harness.receiptHash);
for(const c of audit.cases){
 const raw=load('runs/'+c.name+'/raw.json'),r=raw.result,m=r.meta,h=raw.landPackageExport;
 assert.equal(sha(read('runs/'+c.name+'/raw.json')),c.rawSha256);assert.equal(raw.ok,true);assert.equal(raw.evalErr,null);assert.deepEqual(raw.errors,[]);assert.equal(raw.uncaught,0);assert.deepEqual(r.crash,[]);assert.equal(r.ok,true);assert.equal(r.state,'title');assert.equal(r.target,c.target);
 assert.deepEqual(r.preLate,c.preLate);assert.equal(r.preLate.lateWorkStarted,false);assert.equal(r.preLate.district,c.target);assert.equal(r.preLate.pizzaIndex,c.target);assert.deepEqual(r.preLate.pizza,r.current.pizza);assert.equal(r.current.samePizzeriaReference,true);
 assert.equal(m.phase,'ready');assert.equal(m.source,'generated');assert.equal(m.cleanCalls,1);assert.equal(m.randomCalls,0);assert.equal(m.error,null);assert.equal(m.summary.byteExact,true);assert.equal(m.summary.liveRestored,false);assert.equal(m.summary.rendered,false);assert.equal(m.summary.workerRngInstrumented,false);assert.equal(m.conditions.district,c.target);assert.equal(m.summary.repeated,true);assert.equal(m.summary.queryPoints,27);
 assert.deepEqual(r.descriptor,{provider:'edl-owned-fnv1a-mulberry32-v1',ordinaryAtImport:true,hookOwned:true,baseSeed:24301});assert.equal(raw.startupHost.seed,null);assert.equal(raw.startupHost.cpuThrottle,1);assert.equal(raw.startupHost.bootcpu,false);assert.ok(!epochs.has(raw.startupHost.processEpochMs));epochs.add(raw.startupHost.processEpochMs);
 assert.equal(typeof h.expectedDistrict,'number');assert.equal(h.expectedDistrict,c.target);assert.deepEqual(h.conditions,m.conditions);assert.deepEqual(h.identity,m.identity);assert.deepEqual(h.manifest,m.manifest);assert.equal(h.provenance.sourceHash,source.base.sourceHash);assert.equal(h.provenance.buildHash,receipt.build.hash);
 assert.equal(h.sha256,c.payload.sha256);assert.equal(h.bytes,c.payload.bytes);assert.equal(m.summary.fileSha256,c.payload.sha256);assert.equal(m.bytes,c.payload.bytes);assert.equal(c.payload.archived,false);assert.equal(c.payload.actuallyStreamed,true);
 const stdout=load('stdout-records.json').find(v=>v.name===c.name),bytes=Buffer.from(JSON.stringify(r)+'\n');assert.equal(stdout.deduplicated,true);assert.equal(sha(bytes),stdout.sha256);assert.equal(bytes.length,stdout.bytes);
}
const protocol=load('provenance/root-protocol.json');assert.equal(protocol.sourceHash,audit.sourceFingerprint);assert.equal(protocol.buildHash,audit.buildFingerprint);assert.equal(protocol.receiptHash,receipt.receiptHash);assert.equal(protocol.build.exitCode,0);assert.equal(protocol.build.toolSession,73056);
const sessions=new Set(),fixturePaths={0:'inputs/district0-control-fixture.json',3:'inputs/district3-fixture.json',7:'inputs/district7-fixture.json'};
for(const run of protocol.runs){
 const item=audit.cases.find(c=>c.name===run.label);assert.ok(item);assert.equal(run.district,item.target);assert.equal(run.exitCode,0);assert.equal(run.signal,null);assert.ok(run.signalNote.includes('not provided'));assert.ok(!sessions.has(run.toolSession));sessions.add(run.toolSession);
 for(const a of ['--mode=steam','--dir=/tmp/bird-landdistrict17b-1102/steam','--startup-cold','--fresh','--early','--size=deck','--eval=tools/probe-checks/land-package-district-export.js','--land-package-district='+run.district,'--q=gfxdev=deck&mute&landexport17b&startupdistrict='+run.district,'--startup-fixture='+run.fixture])assert.ok(run.argv.includes(a),a);
 const fixture=load(fixturePaths[run.district]);assert.deepEqual(fixture['dlv-gfx'],{deck:{p:'high',rv:2}});if(run.district!==0)assert.equal(fixture['dlv-district'],run.district);
}
assert.equal(sessions.size,5);
const measuredPins=load('source-pins.json');
for(const pin of harness.files){const file=measuredPins.find(p=>p.originalPath.endsWith('/'+pin.file));assert.ok(file?.archivePath);assert.equal(sha(read(file.archivePath)),pin.sha256);}
const known=new Map(source.source.files.map(r=>[r.path,r.sha256]));
for(const pin of load('source-pins.json')){
 if(!pin.archivePath)continue;
 const b=read(pin.archivePath),original=pin.gzipLevel?gunzipSync(b):b;assert.equal(sha(original),pin.expectedMeasuredSha256);assert.equal(original.length,pin.originalBytes);
}
for(const record of load('copy-records.json')){const b=read(record.archivePath);assert.equal(sha(b),record.archiveSha256);assert.equal(b.length,record.archiveBytes);}
console.log(JSON.stringify({ok:true,cases:audit.cases.length,source:audit.sourceFingerprint,build:audit.buildFingerprint,externalPayloadsRead:false,physicalPayloadCopies:false}));
