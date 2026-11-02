import fs from 'node:fs';import path from 'node:path';import {gzipSync,gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const root='/Users/andrewboev/Desktop/not-work/delivery',out=path.join(root,'docs/measurements/address-inputs-2026-11-02'),original='/tmp/bird-address-closure17b-1102',fixed='/tmp/bird-address-closure17b-money-fix-1102',records=[],stdouts=[],cases=[];
const sha=b=>createHash('sha256').update(b).digest('hex');
const emit=(b,from,to,compression=false)=>{const dest=to+(compression?'.gz':''),p=path.join(out,dest);assert.ok(!fs.existsSync(p),dest+' exists');fs.mkdirSync(path.dirname(p),{recursive:true});const encoded=compression?gzipSync(b,{level:6,mtime:0}):b;fs.writeFileSync(p,encoded);if(compression)assert.deepEqual(gunzipSync(encoded),b);records.push({originalPath:from,realOriginalPath:fs.realpathSync(from),archivePath:dest,originalBytes:b.length,originalSha256:sha(b),archiveBytes:encoded.length,archiveSha256:sha(encoded),gzipLevel:compression?6:null,byteExactRoundtrip:true});return dest;};
const copy=(from,to)=>{const b=fs.readFileSync(from);return emit(b,from,to,b.length>131072);};
// Exactly four successful raw JSON files, one at a time; stdout is deduplicated only after actual byte equality.
for(const [tree,folder,labels] of [['original-series',original,['B1','B2','S','T']],['targeted-money-fix',fixed,['T']]]){
 for(const label of labels){
  const home=path.join(folder,'cases',label),rawPath=path.join(home,'raw.json'),rawBytes=fs.readFileSync(rawPath),raw=JSON.parse(rawBytes),rawDest=emit(rawBytes,rawPath,tree+'/cases/'+label+'/raw.json',rawBytes.length>131072),stdoutPath=path.join(home,'stdout.log'),stdout=fs.readFileSync(stdoutPath),reconstruction=Buffer.from(JSON.stringify(raw.result)+'\n'),deduplicated=stdout.equals(reconstruction);
  if(!deduplicated)emit(stdout,stdoutPath,tree+'/cases/'+label+'/stdout.log',false);
  stdouts.push({processCase:tree+':'+label,originalPath:stdoutPath,originalBytes:stdout.length,originalSha256:sha(stdout),deduplicated,reconstruction:deduplicated?"UTF-8 JSON.stringify(raw.result)+'\\n'":null,rawArchivePath:rawDest});
  cases.push({processCase:tree+':'+label,label,tree,rawOriginalPath:rawPath,rawArchivePath:rawDest,rawReportSha256:sha(rawBytes),rawBytes:rawBytes.length,rawPassed:raw.ok===true,evalErr:raw.evalErr??null});
 }
}
// Every other original file is preserved; build directory is excluded, inherited B1/B2/S raw are not manufactured.
for(const [tree,folder] of [['original-series',original],['targeted-money-fix',fixed]]){
 for(const entry of fs.readdirSync(folder,{withFileTypes:true}))if(entry.isFile())copy(path.join(folder,entry.name),tree+'/'+entry.name);
 for(const label of ['B1','B2','S','T']){
  const home=path.join(folder,'cases',label);if(!fs.existsSync(home))continue;
  for(const entry of fs.readdirSync(home,{withFileTypes:true})){
   if(!entry.isFile()||['raw.json','stdout.log'].includes(entry.name))continue;
   copy(path.join(home,entry.name),tree+'/cases/'+label+'/'+entry.name);
  }
 }
}
copy('/tmp/bird-logical17b-query-export-eval-1102.js','lineage/original-query-export-eval.js');
copy(path.join(root,'docs/measurements/landpackage-districts-2026-11-02/coverage-v2-final/source/tools/land-package-prepare.mjs'),'lineage/preparation-fixture-source.mjs');
copy('/tmp/bird-address-closure17b-check-1102.log','validation/maincheck-40084.log');
copy('/tmp/bird-address-inputs-archive-1102.mjs','harness/archive-inputs.mjs');
fs.writeFileSync(path.join(out,'copy-records.json'),JSON.stringify(records,null,2)+'\n');fs.writeFileSync(path.join(out,'stdout-records.json'),JSON.stringify(stdouts,null,2)+'\n');fs.writeFileSync(path.join(out,'actual-processes.json'),JSON.stringify(cases,null,2)+'\n');
fs.writeFileSync(path.join(out,'root-parent-sessions.json'),JSON.stringify({provenance:'root task messages, not independent child-captured parent tool telemetry',sessions:[{case:'B1',toolSession:24379,exitCode:0},{case:'B2',toolSession:64470,exitCode:0},{case:'S',toolSession:1288,exitCode:0},{case:'T-original-failed',toolSession:22001,exitCode:1},{case:'T-targeted-money-fix',toolSession:44583,exitCode:0}],maincheck:{toolSession:40084,exitCode:0,scope:'root reported completed broad check; exact log archived'}},null,2)+'\n');
console.log(JSON.stringify({files:records.length,actualProcesses:cases.length,passingRaw:cases.filter(c=>c.rawPassed).length,failedRaw:cases.filter(c=>!c.rawPassed).length,stdoutDedup:stdouts.filter(c=>c.deduplicated).length,compressedFiles:records.filter(r=>r.gzipLevel).length}));
