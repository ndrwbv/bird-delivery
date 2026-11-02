/* File preparation only. This tool never spawns Electron, builds, or reads large assets. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const home=path.dirname(fileURLToPath(import.meta.url));
const arg=k=>process.argv.slice(2).find(v=>v.startsWith('--'+k+'='))?.slice(k.length+3);
const fail=(ok,why)=>{if(!ok)throw Error(why);},hash=b=>createHash('sha256').update(b).digest('hex');
const config=JSON.parse(fs.readFileSync(arg('config')||path.join(home,'config.template.json'),'utf8'));
fail(config.ready===true&&config.observerContractReviewed===true,'BLOCKED: readonly observer/address-only flag and new build provenance must be reviewed first');
for(const k of ['sourceHash','buildHash'])fail(/^[a-f0-9]{64}$/.test(config[k]),'Pin '+k+' from the NEW immutable build');
const label=arg('case');fail(['B1','B2','S','T'].includes(label),'--case=B1|B2|S|T');
const repo=path.resolve(config.repo),dist=path.resolve(config.dist),folder=path.join(home,'cases',label);
for(const key of ['tools/probe.cjs','tools/probe-page.cjs','tools/probe-checks/startup-ready.js','tools/probe-checks/startup-bootstrap-observe.js','tools/startup-report.mjs'])if(!/^[a-f0-9]{64}$/.test(config.harnessSha256?.[key]))throw Error('Missing harness pin '+key);
for(const [file,expected]of Object.entries(config.harnessSha256||{}))fail(hash(fs.readFileSync(path.join(repo,file)))===expected,'Changed harness '+file);
fail(config.harnessSha256['tools/probe-checks/startup-ready.js']===JSON.parse(fs.readFileSync(path.join(home,'source-provenance.json'),'utf8')).startupSha256,'Frozen startup body differs: review/regenerate all evals first');
const fixture=path.join(folder,'fixture.json'),fixtureBytes=fs.readFileSync(fixture),expected=JSON.parse(fs.readFileSync(path.join(folder,'expected.json'),'utf8'));
fail(hash(fixtureBytes)===expected.fixtureSha256,'Fixture changed');
let locked=null,baselineRawSha256=null;
if(label!=='B1'){
 const baseFile=path.resolve(config.cases.B1.rawFile),bytes=fs.readFileSync(baseFile),raw=JSON.parse(bytes);
 fail(raw.ok===true&&raw.result?.addressClosure?.case==='B1','B1 actual raw is not a passing baseline');
 fail(config.cases.B1.processStatus===0&&!config.cases.B1.signal,'Pin B1 actual terminal process status first');
 locked=raw.result.addressClosure.fixedQueriesExact;fail(Array.isArray(locked),'B1 fixed queries missing');baselineRawSha256=hash(bytes);
}
const template=fs.readFileSync(path.join(folder,'eval.template.js'),'utf8'),body=template.replace('__LOCKED_JSON__',JSON.stringify(locked));
fail(!body.includes('__LOCKED_JSON__'),'Unresolved lock');
const evalFile=path.join(folder,label==='B1'?'eval.js':'eval.locked.js');
if(label!=='B1')fs.writeFileSync(evalFile,body,{flag:'wx'});else fail(fs.readFileSync(evalFile,'utf8')===body,'B1 eval changed');
const session='address17b-'+randomUUID(),report=path.resolve(config.cases[label].rawFile);
fail(!fs.existsSync(report),'Never overwrite a previous raw report');
const args=[path.join(repo,'tools/probe.cjs'),...(process.platform==='linux'?['--no-sandbox','--disable-gpu-sandbox']:[]),'--mode=steam','--dir='+dist,'--startup-trace','--startup-cold','--startup-session='+session,'--startup-fixture='+fixture,'--fresh','--early','--size=deck','--cpu=1','--bootcpu','--init-script='+path.join(repo,'tools/probe-checks/startup-bootstrap-observe.js'),'--q=gfxdev=deck&mute&startupdistrict=0&addressclosure17b','--eval='+evalFile,'--bootwait=360','--timeout=900','--max=0','--errors','--report='+report];
const record={version:1,case:label,status:'planned',processStatus:null,signal:null,sourceHash:config.sourceHash,buildHash:config.buildHash,session,argv:[config.electron,...args],fixture,fixtureSha256:hash(fixtureBytes),evalFile,evalSha256:hash(Buffer.from(body)),rawFile:report,baselineRawSha256,observerContract:'HOOK-CONTRACT.md'};
fs.writeFileSync(path.join(folder,'command.json'),JSON.stringify(record,null,2),{flag:'wx'});
console.log(JSON.stringify({plannedOnly:true,commandFile:path.join(folder,'command.json'),argv:record.argv}));
