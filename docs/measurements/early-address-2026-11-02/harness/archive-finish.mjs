import fs from 'node:fs';import path from 'node:path';import {gzipSync,gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const repo='/Users/andrewboev/Desktop/not-work/delivery',out=path.join(repo,'docs/measurements/early-address-2026-11-02'),base='/tmp/bird-address-package17b-prepare-1102',sha=b=>createHash('sha256').update(b).digest('hex'),read=p=>fs.readFileSync(p),j=JSON.parse(read(base+'/preparation.json'));
const records=JSON.parse(read(out+'/copy-records.json')),stdouts=[],sourcePins=[];
function copy(from,to,compression=false,extra={}){const b=read(from),dest=to+(compression?'.gz':''),q=path.join(out,dest);assert.ok(!fs.existsSync(q),'existing '+dest);fs.mkdirSync(path.dirname(q),{recursive:true});const encoded=compression?gzipSync(b,{level:6,mtime:0}):b;fs.writeFileSync(q,encoded);if(compression)assert.deepEqual(gunzipSync(encoded),b);records.push({originalPath:from,archivePath:dest,originalBytes:b.length,originalSha256:sha(b),archiveBytes:encoded.length,archiveSha256:sha(encoded),gzipLevel:compression?6:null,byteExactRoundtrip:true,...extra});return b;}
// Four consumer/export reports are never retained together in memory.
for(const label of ['B1-1','B1-2']){
 const b=copy(base+'/'+label+'/raw.json','preparation/'+label+'/raw.json',true),raw=JSON.parse(b);assert.equal(sha(b),j.exports.find(e=>e.label===label).reportSha256);
 const w=raw.result.addressExport.wire,wire=Buffer.from(w.base64,'base64');assert.equal(wire.length,413028);assert.equal(sha(wire),w.sha256);assert.equal(w.sha256,j.package.catalog.entry.sha256);
}
for(const label of ['reader','generated','asar']){
 const b=copy(base+'/consumer-'+label+'.json','preparation/consumer-'+label+'.json',true),raw=JSON.parse(b),stdout=read(base+'/consumer-'+label+'.stdout.log'),reconstructed=Buffer.from(JSON.stringify(raw.result)+'\n');
 const deduplicated=stdout.equals(reconstructed);if(!deduplicated)copy(base+'/consumer-'+label+'.stdout.log','preparation/consumer-'+label+'.stdout.log',true);
 stdouts.push({case:label,originalPath:base+'/consumer-'+label+'.stdout.log',bytes:stdout.length,sha256:sha(stdout),deduplicated,reconstruction:deduplicated?"UTF-8 JSON.stringify(raw.result)+'\\n'":null,rawArchivePath:'preparation/consumer-'+label+'.json.gz'});
}
for(const name of ['early-queries.json','early-queries-init.js'])copy(base+'/'+name,'preparation/'+name,true);
copy('/tmp/bird-address-package17b-final-check-1102.log','validation/maincheck-96676.log',fs.statSync('/tmp/bird-address-package17b-final-check-1102.log').size>131072);
const known=new Map(j.source.source.files.map(r=>[r.path,r.sha256]));for(const h of j.harness)known.set(h.file,h.sha256);for(const [f,h]of Object.entries(j.source.source.buildConfig.preparationHelpers||{}))known.set(f,h);
const sources=[...j.source.source.files.filter(r=>r.path.startsWith('src/game/address')||['src/game/game.js','src/game/singleprogress.js','src/game/landcache17a/sha256.js'].includes(r.path)).map(r=>r.path),...j.harness.map(r=>r.file),...Object.keys(j.source.source.buildConfig.preparationHelpers||{})];
for(const f of [...new Set(sources)]){const b=read(path.join(repo,f));assert.equal(sha(b),known.get(f),f+' no longer matches measured source/harness');copy(path.join(repo,f),'source/'+f,b.length>65536,{measuredPin:'preparation source inventory/harness/helper pins'});sourcePins.push({file:f,sha256:sha(b),measured:true});}
for(const f of fs.readdirSync(path.join(repo,'tools')).filter(f=>/^address(codec17b|key17b|provider17b|proof17b|package).*test\.mjs$/.test(f))){const relative='tools/'+f;if(sources.includes(relative))continue;const b=copy(path.join(repo,relative),'source/'+relative,false,{measuredPin:'frozen archive-phase unit body; not a pre-run harness pin'});sourcePins.push({file:relative,sha256:sha(b),measured:false,capture:'archive phase under root freeze; maincheck exact log retained'});}
copy('/tmp/bird-address-closure17b-1102/cases/B1/eval.js','lineage/historical-oracle-body.js',false,{role:'historical-oracle-body-not-runtime-identity'});
copy('/tmp/bird-early-address-archive-finish-1102.mjs','harness/archive-finish.mjs');
fs.writeFileSync(out+'/copy-records.json',JSON.stringify(records,null,2)+'\n');fs.writeFileSync(out+'/stdout-records.json',JSON.stringify(stdouts,null,2)+'\n');fs.writeFileSync(out+'/source-pins.json',JSON.stringify(sourcePins,null,2)+'\n');
const deferred=JSON.parse(read(out+'/deferred-plan.json'));deferred.pendingRootCompressionGO=false;deferred.completed=true;deferred.excludedBinaryFiles=['candidate.asar','B1-1/catalog.addr','B1-2/catalog.addr','package/address-data/*.addr','whole builds'];fs.writeFileSync(out+'/deferred-plan.json',JSON.stringify(deferred,null,2)+'\n');
console.log(JSON.stringify({ok:true,records:records.length,pinnedSourceAndHelpers:sourcePins.length,consumerStdoutDedup:stdouts.filter(v=>v.deduplicated).length,rawReportsCompressed:5,ASARBinaryRead:false,extraWireBinaryCopies:0}));
