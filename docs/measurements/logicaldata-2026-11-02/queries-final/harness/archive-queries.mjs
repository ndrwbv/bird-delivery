import fs from 'node:fs';import path from 'node:path';import {gzipSync,gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const root='/Users/andrewboev/Desktop/not-work/delivery',out=path.join(root,'docs/measurements/logicaldata-2026-11-02/queries-final'),rows=[];
const sha=b=>createHash('sha256').update(b).digest('hex');
const emit=(bytes,archivePath,metadata={},compress=false)=>{const encoded=compress?gzipSync(bytes,{level:6,mtime:0}):bytes,p=path.join(out,archivePath);fs.mkdirSync(path.dirname(p),{recursive:true});assert.ok(!fs.existsSync(p),'already exists '+p);fs.writeFileSync(p,encoded);if(compress)assert.deepEqual(gunzipSync(encoded),bytes);rows.push({archivePath,archiveBytes:encoded.length,archiveSha256:sha(encoded),originalBytes:bytes.length,originalSha256:sha(bytes),gzipLevel:compress?6:null,byteExactRoundtrip:true,...metadata});};
const copy=(originalPath,archivePath,compress=false)=>emit(fs.readFileSync(originalPath),archivePath,{originalPath},compress);
const rawSummaries=[];
for(const label of ['query1','query2','savedkeys']){
 const stem='/tmp/bird-logical17b-'+label+'-1102',b=fs.readFileSync(stem+'.json'),raw=JSON.parse(b),stdout=fs.readFileSync(stem+'.stdout.log'),reconstructed=Buffer.from(JSON.stringify(raw.result)+'\n'),identical=stdout.equals(reconstructed);
 emit(b,'runs/'+label+'/raw.json.gz',{originalPath:stem+'.json'},true);
 if(!identical)emit(stdout,'runs/'+label+'/stdout.log.gz',{originalPath:stem+'.stdout.log'},true);
 copy(stem+'.stderr.log','runs/'+label+'/stderr.log');
 const record={label,rawOriginalPath:stem+'.json',rawBytes:b.length,rawSha256:sha(b),stdoutOriginalPath:stem+'.stdout.log',stdoutBytes:stdout.length,stdoutSha256:sha(stdout),stdoutDeduplicated:identical,stdoutReconstruction:identical?"UTF-8 JSON.stringify(raw.result)+'\\n'":null};
 rawSummaries.push(record);
 const wire=Buffer.from(raw.result.graphExport.wireBase64,'base64');assert.equal(sha(wire),raw.result.graphExport.wireSha256);
 if(label==='query1')emit(wire,'artifacts/city.graph.gz',{origin:'extracted from measured query1 raw.result.graphExport.wireBase64',sourceRawSha256:sha(b)},true);
}
for(const [src,dest] of [
 ['/tmp/bird-logical17b-query-export-eval-1102.js','harness/query-eval.js'],['/tmp/bird-logical17b-query-init-1102.js','harness/init.js'],['/tmp/bird-logical17b-query-source-1102.json','provenance/source.json'],['/tmp/bird-logical17b-query-provenance-1102.json','provenance/source-build.json'],['/tmp/bird-logical17b-query-build-1102.log','provenance/build.log'],['/tmp/bird-logical17b-query-pair-summary-1102.json','root-evidence/query-pair-summary.json'],['/tmp/bird-logical17b-saved-key-summary-1102.json','root-evidence/saved-key-summary.json'],['/tmp/bird-logical17b-saved-key-gate-1102.mjs','harness/root-saved-key-gate.mjs'],['/tmp/bird-logical17b-saved-keys-fixture-1102.json','inputs/saved-keys-fixture.json'],['/tmp/bird-ordinary17b-prepare-1102/high-1-fixture.json','inputs/fresh-high-fixture.json'],['/tmp/bird-logical17b-query1-audit-1102.mjs','harness/original-query1-audit.mjs'],['/tmp/bird-logical17b-query1-audit-1102.json','root-evidence/independent-query1-audit.json'],['/tmp/bird-logical17b-saved-key-proposal-1102.json','notes/original-saved-key-proposal.json'],['/tmp/bird-logical17b-saved-key-fixture-plan-1102.md','notes/saved-key-fixture-plan.md'],['/tmp/bird-logical17b-archive-queries-1102.mjs','harness/archive-queries.mjs']])copy(src,dest);
fs.writeFileSync(path.join(out,'copy-records.json'),JSON.stringify(rows,null,2)+'\n');
fs.writeFileSync(path.join(out,'raw-records.json'),JSON.stringify(rawSummaries,null,2)+'\n');
console.log(JSON.stringify({copied:rows.length,raws:rawSummaries.map(v=>({label:v.label,stdoutDeduplicated:v.stdoutDeduplicated,rawSha256:v.rawSha256}))}));
