/* №17ж. Sequential cold/warm pairs on one immutable already-built Steam directory.
   node tools/startup-bench.mjs --dir=/tmp/control --sha=<recorded-sha> --out=/tmp/report
   Each pair owns an isolated probe session; identical fixture is restored while its browser cache is retained.
   No builds, git, background workers or real user saves are touched by this runner. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
const arg=(key,fallback)=>process.argv.slice(2).find(a=>a.startsWith('--'+key+'='))?.slice(key.length+3)??fallback;
const dir=arg('dir'),sha=arg('sha'),out=path.resolve(arg('out','/tmp/bird-startup17-report'));
if(!dir||!sha)throw Error('--dir immutable build and --sha recorded source revision are required');
if(!fs.existsSync(path.join(dir,'index.html')))throw Error('Build directory has no index.html');
const pilotFile=arg('pilot-report');
if(!pilotFile)throw Error('--pilot-report from one valid pilot is required before the 18-run series');
const pilot=JSON.parse(fs.readFileSync(path.resolve(pilotFile),'utf8')),trace=pilot.result?.report;
if(!pilot.ok||!pilot.result?.ok||!trace?.enabled||trace.dropped||!trace.resourceCapture||trace.resourceCapture.truncatedCount||!trace.marks?.['first.control']||!(pilot.result.moved>.05)||pilot.uncaught||pilot.errors?.length)throw Error('Pilot report is not complete/valid; series was not started');
fs.mkdirSync(out,{recursive:true});
const common={'dlv-lang':'ru','dlv-sound':false}; // Quality is fixed by the same gfx=high&gfxdev=deck query in every process.
const mature={'dlv-msk-guide':1,'dlv-msk-tut':'1','dlv-msk-nostut':1,'dlv-shift-tut':1,'dlv-msk-wallet':30000,
 'dlv-shifts':40,'dlv-city-party':true,'dlv-city-mode':false,'dlv-dist-open':8,'dlv-dist-shifts':[4,5,5,6,6,7,7,0]};
const cases=[['newbie',{...common},0,true],['saved-near',{...common,...mature,'dlv-district':0},0,false],
 ['saved-far',{...common,...mature,'dlv-district':7},7,false]];
const hash=b=>createHash('sha256').update(b).digest('hex');
const sourceFiles=['src/main.js','src/game/menu.js','src/game/progressboot.js','src/game/game.js','src/game/latebuild.js','src/game/landcleanpool.js','src/game/landclean.worker.js','src/game/landstream.js','src/game/startuptrace.js','tools/probe.cjs','tools/probe-checks/startup-ready.js','tools/probe-checks/startup-bootstrap-observe.js','tools/startup-bench.mjs','tools/startuptrace-test.mjs'];
const copies=path.join(out,'source');
const source=sourceFiles.map(file=>{const bytes=fs.readFileSync(file),copy=path.join(copies,file);fs.mkdirSync(path.dirname(copy),{recursive:true});fs.writeFileSync(copy,bytes);return{file,sha256:hash(bytes),bytes:bytes.length,copy};});
const buildFiles=[];function tree(base,rel=''){for(const e of fs.readdirSync(path.join(base,rel),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const name=path.join(rel,e.name);if(e.isDirectory())tree(base,name);else{const bytes=fs.readFileSync(path.join(base,name));buildFiles.push({file:name,sha256:hash(bytes),bytes:bytes.length});}}}tree(dir);
fs.writeFileSync(path.join(out,'build-tree.json'),JSON.stringify(buildFiles,null,2));
const manifest={version:2,source,buildTree:{file:path.join(out,'build-tree.json'),sha256:hash(JSON.stringify(buildFiles))},indexSha256:hash(fs.readFileSync(path.join(dir,'index.html'))),sha,pilotReport:path.resolve(pilotFile),dir:path.resolve(dir),date:new Date().toISOString(),host:{os:os.release(),arch:os.arch(),cpu:os.cpus()[0]?.model,cores:os.cpus().length,memBytes:os.totalmem()},
 conditions:{mode:'steam',size:'1280x800',gfx:'high',cpuThrottle:3,seed:7,cache:'cold empty owned Chromium session; warm process restart on same session; OS/driver caches uncontrolled',physicalDeck:false},runs:[]};
const median=a=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)];
for(const[label,fixture,district,fresh]of cases)for(let repeat=1;repeat<=3;repeat++){
 const session='b17-'+randomUUID(),file=path.join(out,label+'-'+repeat+'-fixture.json');fs.writeFileSync(file,JSON.stringify(fixture));
 for(const phase of ['cold','warm']){
  const report=path.join(out,label+'-'+repeat+'-'+phase+'.json');
  const args=['run','probe','--','--mode=steam','--dir='+path.resolve(dir),'--startup-trace','--startup-session='+session,
   '--startup-fixture='+file,'--init-script=tools/probe-checks/startup-bootstrap-observe.js','--early','--bootcpu','--cpu=3','--seed=7','--size=deck','--bootwait=300','--timeout=420',
   '--q=gfx=high&gfxdev=deck&mute&startupdistrict='+district,'--eval=tools/probe-checks/startup-ready.js','--max=0','--report='+report];
  if(fresh)args.push('--fresh');if(phase==='cold')args.push('--startup-cold');
  console.log('START '+label+' '+repeat+' '+phase);
  const started=Date.now(),result=spawnSync('npm',args,{encoding:'utf8',maxBuffer:32*1024*1024,env:process.env});
  fs.writeFileSync(report+'.stdout.log',result.stdout||'');fs.writeFileSync(report+'.stderr.log',result.stderr||'');
  const record={label,repeat,phase,command:['npm',...args],fixture:file,fixtureSha256:hash(fs.readFileSync(file)),report,session,wallMs:Date.now()-started,status:result.status};
  if(result.status===0&&fs.existsSync(report)){
   const value=JSON.parse(fs.readFileSync(report,'utf8'));record.ok=!!value.ok&&!!value.result?.ok;
   const data=value.result,trace=data?.report,host=data?.host;
   record.controlMs=trace?.marks?.['first.control']?.at;
   record.processToControlMs=host?trace.clock.timeOrigin+record.controlMs-host.processEpochMs:null;
   record.fromClickMs=data?.firstControlFromClickMs;
   record.district=data?.district;record.resourceCapture=trace?.resourceCapture;record.resourceIO=trace?.resourceCapture?.totalCount?'available ResourceTiming; timings do not separate parse/evaluate':'unavailable for app://; zero records is not zero I/O';record.dropped=trace?.dropped;
   record.flags=trace?.flags;record.failed=!!Object.keys(trace?.flags||{}).some(k=>/error|Fallback|Rejected/.test(k));
  }
  manifest.runs.push(record);fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
  console.log((record.ok?'PASS ':'FAIL ')+label+' '+repeat+' '+phase+' control='+record.controlMs+' click='+record.fromClickMs);
  if(result.status!==0||!record.ok||record.failed||record.dropped)throw Error('Failed startup run retained for diagnosis: '+report);
 }
 const owned=path.join(os.tmpdir(),'bird-probe','startup17-'+session),seal=path.join(owned,'.startup17-owned');
 if(fs.existsSync(seal)&&fs.readFileSync(seal,'utf8')==='bird-startup17-v1')fs.rmSync(owned,{recursive:true,force:true});
}
manifest.summary=cases.flatMap(([label])=>['cold','warm'].map(phase=>{
 const values=manifest.runs.filter(r=>r.label===label&&r.phase===phase&&!r.failed).map(r=>r.controlMs);
 return{label,phase,n:values.length,valuesMs:values,medianMs:values.length===3?median(values):null};
}));
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest.summary));
