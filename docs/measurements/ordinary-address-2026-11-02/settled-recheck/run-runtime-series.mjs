import fs from 'node:fs';import {spawnSync} from 'node:child_process';
const repo='/Users/andrewboev/Desktop/not-work/delivery',out='/tmp/bird-address-ordinary-final-1102';
if(JSON.parse(fs.readFileSync(out+'/runtime-high/run.json')).ok!==true)throw Error('High admission must finish first');
const journal={runs:[]};const save=()=>fs.writeFileSync(out+'/runtime-series.json',JSON.stringify(journal,null,2));
const base=[repo+'/tools/address-package-smoke.mjs','--dir='+out+'/candidate.asar/dist/steam','--catalog='+out+'/production-steam/address-data/catalog.json','--admission=settled'];
const jobs=[['mid',process.execPath,[...base,'--out='+out+'/runtime-mid','--preset=mid','--init='+out+'/early-queries-mid-init.js']],['generated',process.execPath,[...base,'--out='+out+'/runtime-generated','--preset=high','--variant=generated']],['notrace',process.execPath,[out+'/run-notrace.mjs']],['settled-failure-archive','python3',['/tmp/bird-address-ordinary-settled-1102/archive-settled-failure.py']],['archive',process.execPath,[out+'/archive-evidence.mjs']]];
for(const [label,command,args]of jobs){const row={label,argv:[command,...args],status:'running'};journal.runs.push(row);save();const result=spawnSync(command,args,{cwd:repo,stdio:'inherit',timeout:2000000});row.processStatus=result.status;row.signal=result.signal;row.status='returned';save();if(result.status!==0||result.signal||result.error){journal.ok=false;save();process.exit(1);}}
journal.ok=true;save();console.log(JSON.stringify({ok:true,out,runs:journal.runs.length}));
