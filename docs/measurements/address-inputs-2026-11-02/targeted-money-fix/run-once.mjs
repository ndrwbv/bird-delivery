/* Explicit future execution, one case only; NEVER invoked while preparing this draft. */
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
const arg=k=>process.argv.slice(2).find(v=>v.startsWith('--'+k+'='))?.slice(k.length+3),need=(v,s)=>{if(!v)throw Error(s);},hash=b=>createHash('sha256').update(b).digest('hex');
const configFile=path.resolve(arg('config')),config=JSON.parse(fs.readFileSync(configFile,'utf8')),label=arg('case'),order=['B1','B2','S','T'];
need(config.ready===true&&config.observerContractReviewed===true,'Prerequisites not reviewed');need(order.includes(label),'Invalid case');
for(const prior of order.slice(0,order.indexOf(label)))need(config.cases[prior].status==='complete','Earlier case did not pass: '+prior);
const row=config.cases[label],cmdFile=row.commandFile,cmd=JSON.parse(fs.readFileSync(cmdFile,'utf8'));
need(row.status==='planned'&&row.attempts===0&&cmd.status==='planned','No retry, resume or overwrite');
for(const key of ['tools/probe.cjs','tools/probe-page.cjs','tools/probe-checks/startup-ready.js','tools/probe-checks/startup-bootstrap-observe.js','tools/startup-report.mjs'])if(!/^[a-f0-9]{64}$/.test(config.harnessSha256?.[key]))throw Error('Missing harness pin '+key);
for(const [file,expected]of Object.entries(config.harnessSha256))need(hash(fs.readFileSync(path.join(config.repo,file)))===expected,'Harness changed '+file);
need(hash(fs.readFileSync(cmd.evalFile))===cmd.evalSha256&&hash(fs.readFileSync(cmd.fixture))===cmd.fixtureSha256,'Eval/fixture changed');
const save=()=>{fs.writeFileSync(configFile,JSON.stringify(config,null,2));fs.writeFileSync(cmdFile,JSON.stringify(cmd,null,2));};
row.status=cmd.status='running';row.attempts=1;row.processStatus=cmd.processStatus=null;row.signal=cmd.signal=null;row.startedAt=cmd.startedAt=new Date().toISOString();save();
const stdout=fs.openSync(path.join(path.dirname(cmdFile),'stdout.log'),'wx'),stderr=fs.openSync(path.join(path.dirname(cmdFile),'stderr.log'),'wx');
try{
 const child=spawn(cmd.argv[0],cmd.argv.slice(1),{cwd:config.repo,env:{...process.env},stdio:['ignore',stdout,stderr]});row.pid=cmd.pid=child.pid;save();
 const timer=setTimeout(()=>child.kill('SIGKILL'),950000);
 const status=await new Promise(resolve=>{child.once('error',error=>{row.spawnError=String(error);resolve({code:null,signal:null});});child.once('close',(code,signal)=>resolve({code,signal}));});clearTimeout(timer);
 row.processStatus=cmd.processStatus=status.code;row.signal=cmd.signal=status.signal;row.finishedAt=cmd.finishedAt=new Date().toISOString();save();
 need(status.code===0&&!status.signal&&!row.spawnError,'Actual child failed');
 const rawBytes=fs.readFileSync(row.rawFile),raw=JSON.parse(rawBytes),p=raw.result?.addressClosure;
 row.rawSha256=cmd.rawSha256=hash(rawBytes);save();
 const {validateStartupReport}=await import(pathToFileURL(path.join(config.repo,'tools/startup-report.mjs'))),gate=validateStartupReport(raw,{expectedDistrict:0,requireDistrict:true,requireGuardV2:true});
 need(gate.ok&&p?.case===label,'Actual startup/address envelope rejected '+gate.reasons.join(','));
 if(label==='B2'){
  const baseline=JSON.parse(fs.readFileSync(config.cases.B1.rawFile,'utf8')).result.addressClosure;
  for(const field of ['menuExact','fixedQueriesExact','exactQueryTables'])need(JSON.stringify(p[field])===JSON.stringify(baseline[field]),'B1/B2 mismatch '+field);
 }
 row.status=cmd.status='complete';save();
}catch(error){row.status=cmd.status='failed';row.failure=cmd.failure=String(error.stack||error);save();process.exitCode=1;}
finally{fs.closeSync(stdout);fs.closeSync(stderr);}
