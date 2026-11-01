/* Pure classification of the two ordinary reports. No game/build/asset read. */
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const [mode,file]=process.argv.slice(2);if(!['generated','cache'].includes(mode)||!file)throw Error('generated|cache report.json required');
const dir=path.dirname(file),m=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8')),v=JSON.parse(fs.readFileSync(file,'utf8')),r=v.result,reasons=[];
const hash=b=>createHash('sha256').update(b).digest('hex'),need=(ok,why)=>{if(!ok)reasons.push(why);};
need(v.ok===true&&r?.ok===true,'outer/result ok');need(!v.evalErr&&v.errors?.length===0&&v.uncaught===0&&r?.crash===0,'errors');
need(hash(fs.readFileSync(m.eval))===m.evalSha256,'frozen eval');need(hash(fs.readFileSync(m.fixture))===m.fixtureSha256,'frozen fixture');
if(r?.ok){
 need(r.timing===false&&r.sampleMode===(mode==='cache'?'locked-cache':'generated-selection'),'non-timing geometry mode');
 need(r.alignCalls===1&&r.activateCalls===1&&r.localReady===true&&r.supportReady===true&&r.land.failed===0,'readiness/align');
 need(r.poses?.length===3&&r.pavedPoses?.length===2&&r.driveRows?.length===6,'wheel/drive coverage');
 need(r.driveRows?.every(x=>x.distance>=8&&x.lateral<.75&&x.maxStep<.12&&x.bumps===0&&x.maxCbump===0&&x.hpBefore===x.hpAfter),'crossings');
 need(r.boundary?.bad===0&&r.boundary.narrow===0&&r.boundary.checked>=6,'contour/width');need(r.seamHeights?.length===1&&r.seamHeights.every(x=>Math.abs(x.left-x.right)<=.03),'cell seam');
 need(r.selectedDrawInputs?.sha256===r.samples?.drawDigest&&r.selectedDrawInputs.rendered===false,'selected CPU query digest');
 need(r.props?.length>=2&&r.props.every(p=>Math.abs(p.actualY-p.y)<1e-6)&&r.benches?.length>=2,'prop/bench coverage');
 need(r.startup?.protocolVersion===2&&r.startup.guardVersion===2,'startup protocol2');
 const rng=r.ordinary?.rng;need(rng?.provider==='edl-owned-fnv1a-mulberry32-v1'&&rng.ordinaryAtImport===true&&rng.hookOwned===true&&rng.baseSeed===0x5EED,'ordinary EDL');
 need(r.ordinary?.cleanCalls===(mode==='cache'?0:1)&&r.ordinary.initialReadyIds.length>0,'one generated / zero cache clean');
 const c=r.startup?.conditions;need(c?.seed===null&&c.physicalDeck===false&&c.graphics?.preset==='high'&&c.graphics.device==='deck'&&c.graphics.width===1280&&c.graphics.height===800,'ordinary high Deck conditions');
 const q=new URL(c.url).searchParams;need(!q.has('seed')&&!q.has('landcache')&&!q.has('landexport17a')&&!q.has('landexport17b')&&(mode==='generated'?q.get('landpackage')==='0':!q.has('landpackage')),'branch query');
 if(mode==='generated')need(r.cache===null,'generated cache absent');
 else{
  const g=JSON.parse(fs.readFileSync(path.join(dir,'generated.json'),'utf8')).result,c=r.cache,e=m.packageEntry;
  need(g?.ok===true&&JSON.stringify(r.samples)===JSON.stringify(g.samples),'exact generated sample lock');
  need(c?.source==='cache'&&c.phase==='restored'&&c.hit===true&&c.fatal===false&&c.reason===null&&c.cleaned===true&&c.bufferHeld===false,'cache lifecycle');
  need(c?.precleanHash===e.precleanHash&&c.wireSha256===e.sha256&&c.expectedWireSha256===e.sha256&&c.rawSha256===e.rawSha256&&c.expectedRawSha256===e.rawSha256&&c.bytes===e.bytes&&c.encoding===e.encoding,'trusted package content');
  need(JSON.stringify(r.props)===JSON.stringify(g.props)&&JSON.stringify(r.benches)===JSON.stringify(g.benches),'aligned object equality');
 }
}
const result={ok:reasons.length===0,reasons,mode,reportSha256:hash(fs.readFileSync(file)),stage:r?.stage||null,error:r?.error||v.evalErr||null,coverage:r?.ok?{poses:r.poses.length,paved:r.pavedPoses.length,crossings:r.driveRows.length,boundaries:r.boundary.checked,props:r.props.length,benches:r.benches.length,drawDigest:r.samples.drawDigest,maxDriveStep:Math.max(...r.driveRows.map(x=>x.maxStep)),maxLateral:Math.max(...r.driveRows.map(x=>x.lateral)),benchProof:r.benches.map(b=>b.comparison)}:null};
fs.writeFileSync(path.join(dir,mode+'-validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;
