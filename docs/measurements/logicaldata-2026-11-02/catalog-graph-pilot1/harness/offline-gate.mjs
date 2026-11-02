// Offline revalidation only. No game, build, source traversal, or renderer execution.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.resolve(dir,p));
const load=p=>JSON.parse(p.endsWith('.gz')?gunzipSync(read(p)):read(p));
const sha=b=>createHash('sha256').update(b).digest('hex');
const raw=load('run/raw.json.gz'),r=raw.result,baseline=load('../pair/baseline.json.gz');
assert.equal(raw.ok,true);assert.equal(r.ok,true);assert.equal(raw.evalErr,null);
assert.deepEqual(raw.errors,[]);assert.equal(raw.uncaught,0);assert.deepEqual(r.crash,[]);
assert.equal(raw.landExportError,null);assert.equal(raw.landPackageExportError,null);
assert.equal(r.conditions.lang,'ru');assert.equal(r.conditions.seed,null);assert.equal(r.conditions.physicalDeck,false);
assert.deepEqual(r.conditions.graphics,{preset:'high',device:'deck',width:1280,height:800});
assert.equal(raw.startupHost.cpuThrottle,3);assert.equal(raw.startupHost.bootcpu,true);
assert.equal(r.bootstrap.bootAbsentAtMarker,true);assert.equal(r.bootstrap.earlyBootSeen,false);assert.ok(r.bootstrap.markerWrites>=1);
assert.deepEqual(r.district.before,{district:0,opened:1,city:false,partySeen:false});
assert.equal(r.district.actual,0);assert.equal(r.district.pickerClicks,0);assert.ok(r.moved>0.5);
const c=r.report.marks['first.control'];assert.ok(c);assert.equal(c.data.guardVersion,2);
for(const k of ['localReady','supportReady'])assert.equal(c.data[k],true);
for(const k of ['held','paused','mapOpen'])assert.equal(c.data[k],false);
assert.equal(c.data.state,'drive');assert.equal(r.report.dropped,0);
const protocol=load('run/protocol.json'),args=protocol.probe.argvTranscribedFromExecutedRootToolCall;
for(const v of ['--fresh','--early','--cpu=3','--bootcpu','--size=deck','--startup-cold'])assert.ok(args.includes(v));
assert.ok(args.some(v=>v==='--q=gfxdev=deck&mute&startupdistrict=0&landpackage=0&logicalexport17b'));
assert.equal(protocol.probe.exitCode,0);assert.equal(protocol.probe.execSession,7193);assert.equal(protocol.probe.signalProvidedByTool,false);
const sections={};
for(const name of ['graph','addresses','aliases','roadQueries']){
 const expected=JSON.stringify(baseline.result.logical[name]),actual=JSON.stringify(r.logical[name]);
 assert.equal(actual,expected,'legacy '+name+' differs');sections[name]={byteExact:true,bytes:Buffer.byteLength(actual),sha256:sha(actual)};
}
const wire=gunzipSync(read('run/city.graph.gz')),g=r.graphExport,meta=g.meta;
assert.equal(wire.length,3143227);assert.equal(sha(wire),g.wireSha256);
assert.deepEqual(wire,Buffer.from(g.wireBase64,'base64'));
for(const k of ['byteExact','roadAliases','nodeIndexExact','liveRestored'])assert.equal(meta[k],true);
assert.equal(meta.bufferHeld,false);assert.equal(g.actualGameplayAliases,true);
assert.equal(meta.nodes,15009);assert.equal(meta.edges,31764);assert.equal(meta.roads,2047);
const prov=load('provenance/source-build.json'),source=load('provenance/source.json');
assert.equal(meta.identity.sourceHash,source.base.sourceHash);assert.equal(prov.source.base.sourceHash,source.base.sourceHash);
assert.equal(source.base.sourceHash,'ebe1c7a1cf3cb5c8479039d71e478657f1972fc6532b6a69043de9cf1b28538c');
assert.equal(prov.build.hash,'de6c06cb29ea1adb6fb06aaf663931b315ffeff3e65d67c5177640bfd2fa0d4a');
const {owned:o,links:l}=r.addressCatalog;
assert.deepEqual(l,{phase:'sealed',buildingCount:2481,houses:1174,generatedDoors:3699,rawEntrances:12,entrances:3711,spots:5283});
assert.equal(o.houseLinks.length,o.houses.length);assert.equal(o.doorLinks.length,o.generatedDoors.length);
assert.equal(new Set(o.houseLinks.map(v=>v.building)).size,o.houses.length);
for(const v of [...o.houseLinks,...o.doorLinks]){
 assert.ok(Number.isInteger(v.building)&&v.building>=0&&v.building<o.buildingCount);
 assert.ok(v.sourceId===null||typeof v.sourceId==='number'||typeof v.sourceId==='string');
}
for(const v of o.doorLinks)assert.equal(typeof v.grand,'boolean');
assert.deepEqual(o.houses.map(h=>[h.x,h.z,h.mx,h.mz,h.addr,h.name,h.lv]),r.logical.addresses.houses);
assert.deepEqual(o.generatedDoors,r.logical.addresses.generated);assert.deepEqual(o.entrances,r.logical.addresses.entrances);
assert.deepEqual(o.spots.map(s=>[s.x,s.z]),r.logical.addresses.spots);
assert.deepEqual(o.entrances.slice(o.rawEntranceCount),o.generatedDoors);
assert.deepEqual(o.entrances.slice(0,12),baseline.result.logical.addresses.entrances.slice(0,12));
const snapshot=load('source-snapshot.json');
for(const v of snapshot){const b=v.compressed?gunzipSync(read(v.archivePath)):read(v.archivePath);assert.equal(b.length,v.bytes);assert.equal(sha(b),v.sha256);}
const stages=r.report.rows.filter(v=>['roads.graphInput','roads.graphExport.encode','roads.graphExport.decode','roads.graphExport.exact','addresses.sealCatalog'].includes(v.name));
const summary={ok:true,kind:'offline-catalog-graph-pilot1',gateVersion:1,sourceFingerprint:source.base.sourceHash,buildFingerprint:prov.build.hash,processEvidence:'root tool transcription: session7193 exit0; signal not provided; not child process telemetry',rawSha256:sha(gunzipSync(read('run/raw.json.gz'))),baselineReference:'../pair/baseline.json.gz',sections,graph:{bytes:wire.length,sha256:sha(wire),...meta},catalog:l,actualStartup:{guardVersion:c.data.guardVersion,moved:r.moved,errors:raw.errors.length,uncaught:raw.uncaught},stages,limits:['Profiled diagnostic, not startup A/B','195.8ms sync decode is not a nonblocking or speedup proof','Live reference/source building/owned alias assertions were executed in archived eval; JSON replay verifies values only','No actual direct realAddress/entranceLv/story-home/POOL/USED query transcript in this pilot']};
fs.writeFileSync(path.join(dir,'offline-gate.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({ok:true,sections:Object.keys(sections),graphBytes:wire.length,catalog:l,sourceSnapshots:snapshot.length}));
