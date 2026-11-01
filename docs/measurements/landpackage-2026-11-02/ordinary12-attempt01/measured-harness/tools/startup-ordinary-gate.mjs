/* Ordinary-only admission. No files, processes, assets or changes to legacy18/36 gates. */
import {createHash} from 'node:crypto';
import {validateStartupReport} from './startup-report.mjs';
import {assertOrdinaryEDL,checkReceipt,canonical,isHash} from '../src/game/landdata/land-package-key.js';
import {checkCatalog} from '../src/game/landdata/land-package-catalog.js';
export const ordinaryHash=bytes=>createHash('sha256').update(bytes).digest('hex');
const same=(a,b)=>canonical(a)===canonical(b),text=v=>typeof v==='string'&&v.length>0;
export function validateOrdinaryConfig(c,catalog){
 const reasons=[],need=(ok,why)=>{if(!ok)reasons.push(why);};
 need(c?.version===1&&c.kind==='startup-ordinary','ordinary config version');
 need(c&&Object.keys(c).sort().join(',')==='base,buildHash,catalog,dir,fixture,kind,pilots,version','unknown ordinary config fields');
 need(text(c?.dir)&&isHash(c?.buildHash),'immutable build path/hash');
 try{checkReceipt(c?.base);}catch{need(false,'functional source base invalid');}
 for(const key of ['fixture','catalog'])need(text(c?.[key]?.file)&&isHash(c?.[key]?.sha256),key+' file/SHA');
 need(c?.pilots&&Object.keys(c.pilots).sort().join(',')==='cache,generated','both matched pilots required');
 for(const variant of ['generated','cache'])need(text(c?.pilots?.[variant]?.report)&&isHash(c?.pilots?.[variant]?.sha256),'pilot '+variant+' file/SHA');
 if(catalog)try{checkCatalog(catalog);need(['mapId','mapHash','editsHash','sourceHash'].every(k=>catalog.manifest[k]===c.base[k]),'catalog/source base differs');}catch{need(false,'invalid catalog/source');}
 return{ok:reasons.length===0,reasons};
}
export function validateOrdinaryReport(raw,{variant,catalog}){
 const base=validateStartupReport(raw,{requireDistrict:true,expectedDistrict:0,requireGuardV2:true}),reasons=[...base.reasons],need=(ok,why)=>{if(!ok)reasons.push(why);};
 const r=raw?.result,t=r?.report,rows=Array.isArray(t?.rows)?t.rows:[],c=r?.landPackage;
 need(['generated','cache'].includes(variant)&&r?.protocolVersion===2,'ordinary variant/protocol');
 try{assertOrdinaryEDL(r?.rng);}catch{need(false,'ordinary EDL provenance');}
 need(r?.host?.seed===null&&r.host.cpuThrottle===3&&r.host.bootcpu===true&&r?.conditions?.seed===null,'ordinary host seed/CPU');
 need(r?.district?.before?.district===0&&r.district.before.opened===1&&r.district.before.city===false&&r.district.before.partySeen===false&&r.district.pickerClicks===0,'ordinary newbie state');
 need(r?.conditions?.lang==='ru'&&r.conditions.physicalDeck===false&&r.conditions.graphics?.preset==='high'&&r.conditions.graphics.device==='deck'&&r.conditions.graphics.width===1280&&r.conditions.graphics.height===800,'stored high Deck emulation');
 try{
  const u=new URL(r?.conditions?.url),q=[...u.searchParams].sort(([a,v],[b,w])=>a<b?-1:a>b?1:v<w?-1:v>w?1:0);
  const expected=[['debug',''],['mute',''],['nolb',''],['lang','ru'],['startuptrace',''],['gfxdev','deck'],['mute',''],['startupdistrict','0'],...(variant==='generated'?[['landpackage','0']]:[])].sort(([a,v],[b,w])=>a<b?-1:a>b?1:v<w?-1:v>w?1:0);
  need(u.protocol==='app:'&&u.host==='g'&&u.pathname==='/index.html'&&same(q,expected),'ordinary URL/quality/world flags');
 }catch{need(false,'ordinary URL absent');}
 need(Number.isFinite(r?.host?.processEpochMs)&&Number.isFinite(t?.clock?.timeOrigin)&&Number.isFinite(t?.marks?.['first.control']?.at)&&t.clock.timeOrigin+t.marks['first.control'].at>r.host.processEpochMs&&Number.isFinite(r?.firstControlFromClickMs)&&r.firstControlFromClickMs>0,'ordinary process/click clocks');
 need(rows.every(row=>['workMs','exclusiveWorkMs','maxWorkMs','windowMs','workerWorkMs','workerBatches'].every(k=>Number.isFinite(row[k])&&row[k]>=0)),'stage work/wait fields invalid');
 need(['raisedland.activate','raisedland.alignObjects'].every(name=>rows.find(row=>row.name===name)?.steps===1),'ordinary activate/align1');
 if(variant==='generated')need(c===null&&t?.counters?.['raisedland.cleanCalls']===1,'ordinary generated clean1');
 else{
  const e=catalog?.entries?.find(e=>e.precleanHash===c?.precleanHash);
  need(e&&c?.source==='cache'&&c.hit===true&&c.phase==='restored'&&c.fatal===false&&!c.reason&&c.cleaned===true&&c.bufferHeld===false&&t?.counters?.['raisedland.cleanCalls']===0,'ordinary restored clean0');
  need(e&&c.wireSha256===e.sha256&&c.expectedWireSha256===e.sha256&&c.rawSha256===e.rawSha256&&c.expectedRawSha256===e.rawSha256&&c.bytes===e.bytes&&c.encoding===e.encoding,'ordinary catalog wire/raw binding');
  need(rows.every(row=>row.workerWorkMs===0&&row.workerBatches===0&&!(/cleanContours/.test(row.name)&&row.steps>0))&&['workers','workerBatches','workerFallbacks'].every(k=>r?.raised?.[k]===undefined||r.raised[k]===0),'ordinary cache worker/clean work');
 }
 return{ok:reasons.length===0,reasons};
}
export function validateOrdinaryCommand(s,{variant,phase,session,config,repo,electron,runDir,tools,platform}){
 const reasons=[],need=(ok,why)=>{if(!ok)reasons.push(why);},argv=s?.argv;
 if(!Array.isArray(argv))return{ok:false,reasons:['actual smoke probe argv missing']};
 need(argv[0]===electron&&argv[1]===repo+'/tools/probe.cjs','actual Electron/probe path');
 const flags=[],opts={};let duplicate=false;
 for(const a of argv.slice(2)){
  if(typeof a!=='string'||!a.startsWith('--')){duplicate=true;continue;}
  const at=a.indexOf('=');if(at<0)flags.push(a.slice(2));else{const k=a.slice(2,at);if(Object.hasOwn(opts,k))duplicate=true;opts[k]=a.slice(at+1);}
 }
 const expected={mode:'steam',dir:config.dir,'startup-session':session,'startup-fixture':config.fixture.file,size:'deck',cpu:'3','init-script':repo+'/tools/probe-checks/startup-bootstrap-observe.js',q:'gfxdev=deck&mute&startupdistrict=0'+(variant==='generated'?'&landpackage=0':''),eval:repo+'/tools/probe-checks/startup-ready.js',bootwait:'360',timeout:'480',max:'0',report:runDir+'/raw.json'};
 const expectedFlags=['startup-trace','fresh','early','bootcpu','errors',...(phase==='cold'?['startup-cold']:[]),...(platform==='linux'?['no-sandbox','disable-gpu-sandbox']:[])];
 need(!duplicate&&same(opts,expected)&&same(flags.sort(),expectedFlags.sort()),'actual ordinary argv differs');
 need(s?.variant===variant&&s.phase===phase&&s.preset==='high'&&s.cpu===3&&s.fixtureFile===config.fixture.file&&s.fixtureSha256===config.fixture.sha256&&s.catalogFile===config.catalog.file&&s.catalogSha256===config.catalog.sha256,'smoke fixture/catalog/conditions differ');
 for(const[key,file]of Object.entries({probe:'tools/probe.cjs',eval:'tools/probe-checks/startup-ready.js',observer:'tools/probe-checks/startup-bootstrap-observe.js',gate:'tools/startup-report.mjs',admission:'tools/land-package-smoke.mjs'}))need(s?.[key]?.file===file&&s[key].sha256===tools[file],'actual '+key+' body differs');
 return{ok:reasons.length===0,reasons};
}
export function validateOrdinaryAttempt(record,rawText,smokeText,context){
 let raw,smoke;try{raw=JSON.parse(rawText);smoke=JSON.parse(smokeText);}catch{return{ok:false,reasons:['raw/smoke JSON unreadable']};}
 const report=validateOrdinaryReport(raw,context),command=validateOrdinaryCommand(smoke,{...context,runDir:record.runDir,phase:record.phase,session:record.session});
 const reasons=[...report.reasons,...command.reasons];
 if(record.processStatus!==0||record.signal||record.spawnError||smoke.processStatus!==0||smoke.signal||smoke.spawnError||smoke.ok!==true)reasons.push('ordinary outer/smoke process failure');
 if(record.reportSha256!==ordinaryHash(rawText)||smoke.rawSha256!==record.reportSha256||record.smokeRecordSha256!==ordinaryHash(smokeText))reasons.push('ordinary raw/record SHA differs');
 return{ok:reasons.length===0,reasons};
}
export function validateOrdinarySeries(m){
 const reasons=[],need=(ok,why)=>{if(!ok)reasons.push(why);},runs=Array.isArray(m?.runs)?m.runs:[];
 reasons.push(...validateOrdinaryConfig(m?.config,m?.catalogBody).reasons);
 need(m?.kind==='startup-ordinary'&&m.version===1&&m.expectedRuns===12&&m.state==='complete'&&!m.failure&&!m.activeRun,'ordinary series incomplete/failed');
 need(runs.length===12,'exactly12 attempts required');const ids=new Set(),sessions=new Set();
 for(const r of runs){const id=r.repeat+'/'+r.variant+'/'+r.phase;need(!ids.has(id),'duplicate attempt');ids.add(id);
  need([1,2,3].includes(r.repeat)&&['generated','cache'].includes(r.variant)&&['cold','warm'].includes(r.phase),'unexpected slot');
  need(r.state==='complete'&&r.ok===true&&r.processStatus===0&&!r.signal&&!r.spawnError,'failed/running attempt');
  need(['controlMs','processToControlMs','fromClickMs'].every(k=>Number.isFinite(r[k])&&r[k]>0),'missing timing');
  need(r.configSha256===m.configSha256&&r.harnessSha256===m.harnessSha256&&r.sourceHash===m.config?.base?.sourceHash&&r.buildHash===m.config?.buildHash&&r.fixtureSha256===m.config?.fixture?.sha256&&r.catalogSha256===m.config?.catalog?.sha256,'attempt provenance differs');
 }
 for(let repeat=1;repeat<=3;repeat++){
  const order=repeat%2?['generated','cache']:['cache','generated'],group=runs.filter(r=>r.repeat===repeat);
  need(same(group.map(r=>[r.variant,r.phase]),order.flatMap(v=>[[v,'cold'],[v,'warm']])),'alternating variant/phase order differs');
  for(const variant of ['generated','cache']){const pair=group.filter(r=>r.variant===variant);need(pair.length===2&&pair[0].session===pair[1].session&&!sessions.has(pair[0].session),'cold/warm session mismatch/reuse');if(pair[0])sessions.add(pair[0].session);}
 }
 need(sessions.size===6,'six owned sessions required');return{ok:reasons.length===0,reasons};
}
const stats=values=>{if(values.length!==3||!values.every(Number.isFinite))throw Error('ordinary n3 finite values required');const sorted=[...values].sort((a,b)=>a-b);return{n:3,valuesMs:values,medianMs:sorted[1],minMs:sorted[0],maxMs:sorted[2]};};
export function summarizeOrdinary(m,reports){
 const gate=validateOrdinarySeries(m);if(!gate.ok)return{ok:false,reasons:gate.reasons,groups:null};
 for(const run of m.runs){const raw=reports[run.report],checked=validateOrdinaryReport(raw,{variant:run.variant,catalog:m.catalogBody});if(!checked.ok)return{ok:false,reasons:checked.reasons,groups:null};
  const r=raw.result,t=r.report,control=t.marks['first.control'].at;
  if(run.controlMs!==control||run.processToControlMs!==t.clock.timeOrigin+control-r.host.processEpochMs||run.fromClickMs!==r.firstControlFromClickMs)return{ok:false,reasons:['stored timing differs from raw'],groups:null};
 }
 const groups=[];
 for(const variant of ['generated','cache'])for(const phase of ['cold','warm']){
  const runs=m.runs.filter(r=>r.variant===variant&&r.phase===phase),traces=runs.map(r=>reports[r.report]?.result?.report);
  if(traces.some(t=>!Array.isArray(t?.rows)))return{ok:false,reasons:['missing raw trace'],groups:null};
  const names=[...new Set(traces.flatMap(t=>t.rows.map(r=>r.name)))].sort(),waits=[...new Set(traces.flatMap(t=>Object.keys(t.waitUnionMs||{})))].sort();
  groups.push({variant,phase,n:3,timings:Object.fromEntries(['controlMs','processToControlMs','fromClickMs'].map(k=>[k,stats(runs.map(r=>r[k]))])),workUnion:stats(traces.map(t=>t.workUnionMs)),waitUnions:Object.fromEntries(waits.map(k=>[k,stats(traces.map(t=>t.waitUnionMs?.[k]??0))])),stages:names.map(name=>({name,...Object.fromEntries(['workMs','exclusiveWorkMs','maxWorkMs','windowMs','workerWorkMs'].map(k=>[k,stats(traces.map(t=>t.rows.find(r=>r.name===name)?.[k]??0))]))}))});
 }
 return{ok:true,groups,notes:'n3 ordinary/high/newbie CPU3 emulation. Work spans are elapsed main-thread measurements, not OS CPU time. Stage/windows/wait unions overlap; never add their totals. OS/driver caches uncontrolled.'};
}
