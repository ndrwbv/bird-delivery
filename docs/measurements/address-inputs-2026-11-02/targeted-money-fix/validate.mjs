/* Offline only: reads named small config/command/raw files; never traverses source/build or reads city-data payloads. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const home=path.dirname(fileURLToPath(import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
const configFile=process.argv.slice(2).find(v=>v.startsWith('--config='))?.slice(9)||path.join(home,'config.template.json');
const config=JSON.parse(fs.readFileSync(configFile,'utf8'));
const {validateStartupReport}=await import(pathToFileURL(path.join(config.repo,'tools/startup-report.mjs')));
const reasons=[],need=(ok,why)=>{if(!ok)reasons.push(why);},rows=[],cap=32*1024*1024;
need(config.ready===true&&config.observerContractReviewed===true,'observer/new source prerequisites not reviewed');
need(Object.keys(config.cases||{}).sort().join(',')==='B1,B2,S,T','Exactly four cases required');
for(const k of ['sourceHash','buildHash'])need(/^[a-f0-9]{64}$/.test(config[k]),'Invalid '+k+' pin');
const differs=(a,b)=>JSON.stringify(a)!==JSON.stringify(b);
for(const label of ['B1','B2','S','T']){
 try{
  const c=config.cases[label],commandFile=c.commandFile||path.join(home,'cases',label,'command.json'),cmd=JSON.parse(fs.readFileSync(commandFile,'utf8'));
  need(c.status==='complete'&&c.processStatus===0&&!c.signal,label+' terminal process did not pass');
  need(c.attempts===1,label+' retry/attempt count not one');
  need(cmd.case===label&&cmd.sourceHash===config.sourceHash&&cmd.buildHash===config.buildHash,label+' provenance');
  const bytes=fs.readFileSync(c.rawFile);need(bytes.length>0&&bytes.length<=4*cap,label+' raw report budget');
  const digest=hash(bytes);need(c.rawSha256===digest,label+' raw SHA');const value=JSON.parse(bytes),r=value.result,p=r?.addressClosure;
  const gate=validateStartupReport(value,{expectedDistrict:0,requireDistrict:true,requireGuardV2:true});for(const reason of gate.reasons)reasons.push(label+': '+reason);
  need(value.startupHost?.seed===null&&r.host?.seed===null&&r.host.cpuThrottle===1&&r.host.bootcpu===true,label+' actual ordinary host/CPU');
  need(r.conditions?.graphics?.preset==='high'&&r.conditions.graphics.device==='deck'&&r.conditions.graphics.width===1280&&r.conditions.graphics.height===800&&r.conditions.lang==='ru',label+' pinned actual graphics/language');
  need(p?.version===1&&p.case===label&&p.expected.case===label,label+' proof envelope');
  need(p?.claims?.earlyReady===false&&p.claims.readerEnabled===false&&p.claims.allAxesClosed===false,label+' limited claims');
  need(p?.ownedAliases===true&&p.unchanged.menuOwnerSnapshot===true&&p.unchanged.arrayReferencesThroughGo===true,label+' actual owner references');
  need(p?.functionalQueries?.actualQueries===true&&p.functionalQueries.unchanged?.savedKeys===true&&p.functionalQueries.unchanged.arrayAndRowReferences===true&&p.functionalQueries.unchanged.rngDescriptor===true,label+' original actual query checks');
  need(p?.initial?.season?.value===(label==='S'?.5:2.5)&&p.initial.season.forced===false&&p.initial.donation?.trashFraction===(label==='T'?1:0)&&p.initial.donation.trashRaw===(label==='T'?480000:0),label+' actual initial axis');
  need(p?.initial?.car?.id==='semerka'&&p.initial.graphics?.preset==='high'&&p.initial.district?.current===0&&p.initial.district.opened===8&&p.initial.district.city===false,label+' other axes pinned');
  const q=p?.functionalQueries?.counts;need(q&&q.realAddress+q.entranceLv+q.doorWrapper<=60000,label+' bounded actual query count');
  for(const field of ['menuExact','fixedQueriesExact','exactQueryTables'])need(p?.[field]&&Buffer.byteLength(JSON.stringify(p[field]))<=cap,label+' missing/large '+field);
  const expected=JSON.parse(fs.readFileSync(path.join(home,'cases',label,'expected.json'),'utf8'));
  need(hash(fs.readFileSync(cmd.fixture))===expected.fixtureSha256&&cmd.fixtureSha256===expected.fixtureSha256,label+' fixture SHA');
  need(hash(fs.readFileSync(cmd.evalFile))===cmd.evalSha256,label+' eval SHA');
  const args=cmd.argv||[],one=(key,expected)=>need(args.filter(v=>v.startsWith('--'+key+'=')).join('\n')==='--'+key+'='+expected,label+' actual '+key),flag=key=>need(args.filter(v=>v==='--'+key).length===1,label+' actual '+key);
  for(const key of ['startup-trace','startup-cold','fresh','early','bootcpu','errors'])flag(key);
  for(const [key,expected]of Object.entries({mode:'steam',dir:path.resolve(config.dist),size:'deck',cpu:1,'startup-session':cmd.session,'startup-fixture':cmd.fixture,'init-script':path.join(config.repo,'tools/probe-checks/startup-bootstrap-observe.js'),q:'gfxdev=deck&mute&startupdistrict=0&addressclosure17b',eval:cmd.evalFile,report:path.resolve(c.rawFile),timeout:900,bootwait:360,max:0}))one(key,expected);
  need(!args.some(v=>v==='--seed'||v.startsWith('--seed=')||v.startsWith('--land-package-export')||v.startsWith('--land-export')||v.startsWith('--startup-admission=')),label+' forbidden seed/export/settled override');
  need(p?.provenance?.originalFunctionalSha256===config.originalFunctionalSha256&&p.provenance.adaptedFunctionalSha256===config.adaptedFunctionalSha256,label+' frozen oracle provenance');
  rows.push({label,rawSha256:digest,session:cmd.session,proof:p,command:cmd});
 }catch(error){reasons.push(label+': '+String(error?.message||error));}
}
need(rows.length===4,'Four complete named raw reports required');need(new Set(rows.map(r=>r.session)).size===4,'Independent process sessions required');
const baseline=rows.find(r=>r.label==='B1'),repeat=rows.find(r=>r.label==='B2');
if(baseline){
 const baselineFixture=JSON.parse(fs.readFileSync(baseline.command.fixture,'utf8'));
 const descriptorWithout=(p,label)=>{const v=structuredClone(p.initial);delete v.at;if(label==='S')v.season=structuredClone(baseline.proof.initial.season);if(label==='T')v.donation=structuredClone(baseline.proof.initial.donation);return v;};
 for(const row of rows.filter(r=>r.label!=='B1')){
  const fixture=JSON.parse(fs.readFileSync(row.command.fixture,'utf8')),keys=new Set([...Object.keys(fixture),...Object.keys(baselineFixture)]);
  const changed=[...keys].filter(k=>differs(fixture[k],baselineFixture[k])).sort();
  need(changed.join(',')===(row.label==='S'?'dlv-season':row.label==='T'?'dlv-don-trash':''),row.label+' fixture is not exactly one-axis');
  need(!differs(descriptorWithout(row.proof,row.label),descriptorWithout(baseline.proof,'B1')),row.label+' unexpected actual initial input change');
 }
}
if(baseline&&repeat){for(const field of ['menuExact','fixedQueriesExact','exactQueryTables'])need(!differs(baseline.proof[field],repeat.proof[field]),'B1/B2 nonrepeatable '+field);}
if(baseline)for(const row of rows.filter(row=>row.label!=='B1')){
 need(row.command.baselineRawSha256===baseline.rawSha256,row.label+' actual B1 lock raw SHA');
 need(!differs(row.proof.fixedQueriesExact,baseline.proof.fixedQueriesExact),row.label+' fixed B1 coordinates');
}
const comparisons=baseline?rows.filter(row=>['S','T'].includes(row.label)).map(row=>({case:row.label,menuExactSame:!differs(row.proof.menuExact,baseline.proof.menuExact),queryTablesSame:!differs(row.proof.exactQueryTables,baseline.proof.exactQueryTables),menuSha256:hash(Buffer.from(JSON.stringify(row.proof.menuExact))),queriesSha256:hash(Buffer.from(JSON.stringify(row.proof.exactQueryTables))),meaning:'Observed one-axis comparison; equality does not prove all functional inputs closed'})):[];
const result={version:1,ok:reasons.length===0,reasons,raw:rows.map(({label,rawSha256,session})=>({label,rawSha256,session})),comparisons,claims:{allAxesClosed:false,earlyReady:false,readerEnabled:false},limitations:['USED/first randomly selected order are checked within each process, not equated across processes','Only initial season2.5→0.5 and trash0→goal varied; DIST/car/gfx/lang fixed','Readonly observed later arrays do not constitute an early cache key','Ordinary RNG descriptor identity is not a count of Math.random calls','Source/build pins must come from an independent immutable-build receipt; this offline tool does not traverse assets']};
console.log(JSON.stringify(result,null,2));process.exitCode=result.ok?0:1;
