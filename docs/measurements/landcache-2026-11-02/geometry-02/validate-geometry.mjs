/* Offline strict result classification. Never starts the game or rewrites raw reports. */
import fs from 'node:fs';import path from 'node:path';import{createHash}from'node:crypto';
const [mode,file]=process.argv.slice(2);if(!['generated','cache'].includes(mode)||!file)throw Error('generated|cache report.json required');
const dir=path.dirname(file),m=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8')),v=JSON.parse(fs.readFileSync(file,'utf8')),r=v.result,reasons=[];
const need=(ok,why)=>{if(!ok)reasons.push(why);};need(v.ok===true,'outer.ok');need(r?.ok===true,'result.ok');need(!v.evalErr,'evalErr');need(Array.isArray(v.errors)&&v.errors.length===0,'console errors');need(v.uncaught===0,'uncaught');need(r?.crash===0,'crash');
if(r?.ok){
 need(r.timing===false&&r.sampleMode===(mode==='cache'?'locked-cache':'generated-selection'),'geometry identity');
 need(r.alignCalls===1&&r.activateCalls===1&&r.localReady===true&&r.supportReady===true&&r.land?.failed===0,'readiness/align');
 need(r.poses?.length===3&&r.pavedPoses?.length===2&&r.driveRows?.length===6,'physical coverage');
 need(r.driveRows?.every(x=>x.distance>=8&&x.lateral<.75&&x.maxStep<.12&&x.bumps===0&&x.maxCbump===0&&x.hpBefore===x.hpAfter),'crossings');
 need(r.boundary?.bad===0&&r.boundary?.narrow===0&&r.boundary?.checked>=6,'boundary');need(r.seamHeights?.length===1&&r.seamHeights.every(x=>Math.abs(x.left-x.right)<=.03),'cell seam');
 need(r.selectedDrawInputs?.sha256===r.samples?.drawDigest,'draw inputs digest');need(r.startup?.protocolVersion===2&&r.startup.guardVersion===2,'startup protocol');
 need(r.props?.length>=2&&r.props.every(p=>Math.abs(p.actualY-p.y)<1e-6),'prop heights');
 if(mode==='generated')need(r.cache===null,'unexpected cache in generated');
 else{const g=JSON.parse(fs.readFileSync(path.join(dir,'generated.json'),'utf8')).result;need(g?.ok===true,'generated control');need(JSON.stringify(r.samples)===JSON.stringify(g.samples),'exact locked samples');need(r.cache?.source==='cache'&&r.cache.phase==='restored'&&r.cache.hit&&r.cache.cleanCalls===0&&r.cache.cleaned===true&&r.cache.bufferHeld===false,'cache lifecycle');need(r.cache?.fileSha256===m.trustedCacheSha256&&r.cache.expectedSha256===m.trustedCacheSha256,'trusted cache SHA');}
}
const hash=b=>createHash('sha256').update(b).digest('hex');need(hash(fs.readFileSync(m.eval))===m.evalSha256,'frozen eval changed');
const result={ok:reasons.length===0,reasons,stage:r?.stage||null,error:r?.error||v.evalErr||null,outerOk:v.ok,resultOk:r?.ok,errors:v.errors,uncaught:v.uncaught,crash:r?.crash,reportSha256:hash(fs.readFileSync(file)),coverage:r?.ok?{poses:r.poses.length,paved:r.pavedPoses.length,drives:r.driveRows.length,boundaries:r.boundary.checked,props:r.props.length,benches:r.benches.length,benchRepresentations:r.benches.map(b=>({representation:b.actual.representation,cpuRange:b.actual.cpuRange?.available??null,comparison:b.comparison})),drawDigest:r.samples.drawDigest,maxDriveStep:Math.max(...r.driveRows.map(x=>x.maxStep)),maxLateral:Math.max(...r.driveRows.map(x=>x.lateral))}:null};
fs.writeFileSync(path.join(dir,mode+'-validation.json'),JSON.stringify(result,null,2));m[mode+'Validation']=result;m.status=result.ok?(mode==='generated'?'strict generated PASS; cache pending':'both geometry PASS; no further gaming'):'FAILED '+mode+'; no retry or next process';fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(m,null,2));console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;
