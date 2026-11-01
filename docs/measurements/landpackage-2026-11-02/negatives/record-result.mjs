/* Offline recording of ONE already-finished foreground attempt. Never launches or retries a process. */
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {validateStartupReport} from '/Users/andrewboev/Desktop/not-work/delivery/tools/startup-report.mjs';
const root='/tmp/bird-ordinary17b-negatives-1102-prepared',kind=process.argv[2],status=Number(process.argv[3]),signal=process.argv[4]||null;
const file=path.join(root,kind,'run.json'),record=JSON.parse(fs.readFileSync(file));if(record.finishedAt)throw Error('Attempt already recorded; never replace first result');
const hash=b=>createHash('sha256').update(b).digest('hex');record.processStatus=status;record.signal=signal;record.finishedAt=new Date().toISOString();record.state='complete';record.ok=false;
try{
 const bytes=fs.readFileSync(record.raw);record.rawSha256=hash(bytes);const value=JSON.parse(bytes),result=value.result;
 record.gate=validateStartupReport(value,{expectedDistrict:0,requireDistrict:true,requireGuardV2:true});
 const checks={process:status===0&&signal===null,raw:value.ok===true&&result?.ok===true,negative:result?.negative?.ok===true&&result.negative.kind===kind,gate:record.gate.ok};
 for(const key of ['probe','init','fixture','eval']){const row=record[key];checks[key+'Unchanged']=hash(fs.readFileSync(path.resolve(record.cwd,row.file)))===row.sha256;}
 record.checks=checks;record.ok=Object.values(checks).every(v=>v===true);record.result={negative:result?.negative,landPackage:result?.landPackage,moved:result?.moved,raised:result?.raised,land:result?.land,counters:result?.report?.counters,activate:result?.report?.rows.find(r=>r.name==='raisedland.activate'),align:result?.report?.rows.find(r=>r.name==='raisedland.alignObjects'),errors:value.errors,uncaught:value.uncaught,evalErr:value.evalErr};
 if(!record.ok)record.failure='First attempt failed admission: '+JSON.stringify(checks);
}catch(error){record.failure??=String(error?.stack||error);}
for(const key of ['stdout','stderr']){try{record[key+'Sha256']=hash(fs.readFileSync(record[key]));}catch{}}
record.initHarnessSha256=hash(JSON.stringify(['probe','init','eval'].map(key=>({file:record[key].file,sha256:record[key].sha256}))));
fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({kind,ok:record.ok,processStatus:status,signal,rawSha256:record.rawSha256,initHarnessSha256:record.initHarnessSha256,reason:record.result?.landPackage?.reason,moved:record.result?.moved,clean:record.result?.counters?.['raisedland.cleanCalls'],activate:record.result?.activate?.steps,align:record.result?.align?.steps,failure:record.failure,gate:record.gate}));if(!record.ok)process.exitCode=1;
