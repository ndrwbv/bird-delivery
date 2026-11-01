/* Offline-only reclassification. Old18 never gets the optional 17a variant gate. No asset reads or game launches. */
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {validateStartupReport,validateStartupVariant,validateStartupComparisonConfig,validateStartupCommand,startupInputIdentityKey} from './startup-report.mjs';
const arg=(key,fallback)=>process.argv.slice(2).find(value=>value.startsWith('--'+key+'='))?.slice(key.length+3)??fallback;
const file=arg('manifest');if(!file)throw Error('--manifest=... is required');
const requireGuardV2=process.argv.includes('--guard-v2');
const root=path.dirname(path.resolve(file)),m=JSON.parse(fs.readFileSync(file,'utf8')),comparison=m.comparison||null;
const resolve=file=>path.isAbsolute(file)?file:path.join(root,file),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const result={version:comparison?2:1,checkedAt:new Date().toISOString(),manifestSha256:hash(fs.readFileSync(file)),gateSha256:hash(fs.readFileSync(new URL('./startup-report.mjs',import.meta.url))),expectedRuns:comparison?36:18,totalRuns:m.runs.length,errors:[],runs:[]};
let landManifest=null,comparisonConfig=null;
function checkedFile(file,expected,why){try{const bytes=fs.readFileSync(resolve(file));if(hash(bytes)!==expected)result.errors.push(why+' SHA256 mismatch');return bytes;}catch(error){result.errors.push(why+' unreadable: '+error.message);return null;}}
if(comparison){
 const configBytes=checkedFile(comparison.configFile,comparison.configSha256,'Comparison config');
 if(configBytes){try{const config=JSON.parse(configBytes);comparisonConfig=config;const gate=validateStartupComparisonConfig(config);if(!gate.ok)result.errors.push(...gate.reasons);
   if(config.manifestHash!==comparison.manifestHash||config.pilotCase!==comparison.pilotCase)result.errors.push('Comparison config manifest/pilot differs');
   for(const label of ['newbie','saved-near','saved-far'])if(config.assets?.[label]?.sha256!==comparison.assets?.[label]?.sha256||startupInputIdentityKey(config.assets?.[label]?.identity)!==startupInputIdentityKey(comparison.assets?.[label]?.identity))result.errors.push('Configured asset SHA/full identity differs '+label);
   for(const variant of ['generated','cache'])if(config.pilots?.[variant]?.sha256!==comparison.pilots?.[variant]?.sha256)result.errors.push('Configured pilot SHA differs '+variant);
  }catch(error){result.errors.push('Invalid comparison config: '+error.message);}}
 const bytes=checkedFile(comparison.manifestFile,comparison.manifestFileSha256,'Shared source/build manifest');
 if(bytes){try{landManifest=JSON.parse(bytes);const copy={...landManifest};delete copy.manifestHash;
   if(hash(JSON.stringify(copy))!==comparison.manifestHash||['sourceHash','buildHash','mapHash','editsHash','mapId','seed'].some(key=>landManifest[key]!==comparison[key]))result.errors.push('Shared manifest input hashes differ');
  }catch(error){result.errors.push('Invalid shared manifest: '+error.message);}}
 if(comparisonConfig&&landManifest){const gate=validateStartupComparisonConfig(comparisonConfig,{manifest:landManifest});if(!gate.ok)result.errors.push(...gate.reasons);}
 checkedFile(comparison.initFile,comparison.initSha256,'Combined init');
 checkedFile(comparison.harnessPatch?.file,comparison.harnessPatch?.sha256,'Exact measured harness patch');
 if(!Array.isArray(m.harness)||!m.harness.length)result.errors.push('Measured harness snapshots missing');
 else{for(const row of m.harness)checkedFile(row.copy,row.sha256,'Harness '+row.file);
  const digest=hash(JSON.stringify(m.harness.map(({file,sha256,bytes})=>({file,sha256,bytes}))));if(digest!==m.harnessSha256)result.errors.push('Measured harness aggregate differs');}
 if(comparison.expectedRuns!==36||comparison.fullPreflight?.once!==true||comparison.fullPreflight.cacheAssetsRead!==false||comparison.fullPreflight.sourceHash!==comparison.sourceHash||comparison.fullPreflight.buildHash!==comparison.buildHash)result.errors.push('One full immutable-build preflight not recorded');
 result.measuredHarnessSha256=m.harnessSha256;result.measuredHarnessPatchSha256=comparison.harnessPatch?.sha256;
}
const seen=new Set();
for(const r of m.runs){
 const id=r.label+'/'+r.repeat+'/'+(comparison?r.variant+'/':'')+r.phase,reasons=[];let value,bytes;
 try{bytes=fs.readFileSync(resolve(r.report));value=JSON.parse(bytes);}catch(error){reasons.push('Raw report unreadable: '+error.message);}
 if(seen.has(id))reasons.push('Duplicate scenario/repeat/variant/phase');seen.add(id);
 if(!['newbie','saved-near','saved-far'].includes(r.label)||!['cold','warm'].includes(r.phase)||![1,2,3].includes(r.repeat)||comparison&&!['generated','cache'].includes(r.variant))reasons.push('Unexpected run identity');
 if(r.status!==0||r.processStatus!==undefined&&r.processStatus!==0||r.signal||r.spawnError)reasons.push('Process did not exit successfully');
 if(value)reasons.push(...(comparison?validateStartupVariant(value,{variant:r.variant,label:r.label,manifest:landManifest,asset:comparison.assets?.[r.label]}):validateStartupReport(value,{requireDistrict:true,requireGuardV2,expectedDistrict:r.label==='saved-far'?7:0})).reasons);
 try{if(hash(fs.readFileSync(resolve(r.fixture)))!==r.fixtureSha256)reasons.push('Fixture SHA256 mismatch');}catch(error){reasons.push('Fixture unreadable: '+error.message);}
 if(comparison){
  if(r.state!=='complete'||r.ok!==true)reasons.push('Attempt incomplete/failed; no implicit retry');
  if(!bytes||hash(bytes)!==r.reportSha256)reasons.push('Raw report SHA differs');
  const asset=comparison.assets?.[r.label];
  if(r.cacheAsset!==asset?.file||r.cacheAssetBytes!==asset?.bytes||r.expectedCacheSha256!==asset?.sha256||r.expectedInputIdentitySha256!==asset?.identitySha256)reasons.push('Expected cache configuration differs');
  try{if(hash(startupInputIdentityKey(asset?.identity))!==asset.identitySha256)reasons.push('Expected input identity SHA differs');}catch{reasons.push('Expected input identity invalid');}
  if(['manifestHash','sourceHash','buildHash','configSha256','initSha256','manifestFileSha256'].some(key=>r[key]!==comparison[key])||r.sourceManifest!==comparison.manifestFile||r.initFile!==comparison.initFile||r.harnessSha256!==m.harnessSha256||r.harnessPatchSha256!==comparison.harnessPatch?.sha256)reasons.push('Run provenance differs from shared measured configuration');
  if(['generated','cache'].some(variant=>r.pilotHashes?.[variant]!==comparison.pilots?.[variant]?.sha256))reasons.push('Pilot provenance differs');
  reasons.push(...validateStartupCommand(r,{comparison,dir:m.dir}).reasons);
  if(value&&r.controlMs!==value.result?.report?.marks?.['first.control']?.at)reasons.push('Stored control timing differs from raw report');
 }
 result.runs.push({id,label:r.label,repeat:r.repeat,phase:r.phase,...(comparison?{variant:r.variant}:{}),report:r.report,ok:reasons.length===0,reasons,reportSha256:bytes&&hash(bytes),errors:value?.errors?.length,uncaught:value?.uncaught,flags:value?.result?.report?.flags,dropped:value?.result?.report?.dropped,resourceCapture:value?.result?.report?.resourceCapture,district:value?.result?.district,moved:value?.result?.moved,controlMs:value?.result?.report?.marks?.['first.control']?.at,processToControlMs:value?.result?.host?value.result.report?.clock?.timeOrigin+value.result.report?.marks?.['first.control']?.at-value.result.host.processEpochMs:null,fromClickMs:value?.result?.firstControlFromClickMs});
}
const sessions=new Set();
for(const label of ['newbie','saved-near','saved-far'])for(let repeat=1;repeat<=3;repeat++){
 const variants=comparison?['generated','cache']:[undefined];
 for(const variant of variants){const pair=m.runs.filter(row=>row.label===label&&row.repeat===repeat&&(!comparison||row.variant===variant));
  if(pair.length!==2||new Set(pair.map(row=>row.phase)).size!==2||pair[0].fixtureSha256!==pair[1].fixtureSha256||pair[0].session!==pair[1].session)result.errors.push('Invalid matched cold/warm pair '+label+'/'+repeat+(comparison?'/'+variant:''));
  if(comparison&&pair.length===2){if(pair[0].phase!=='cold'||pair[1].phase!=='warm'||sessions.has(pair[0].session))result.errors.push('Comparison process/profile ordering or isolation differs '+label+'/'+repeat+'/'+variant);sessions.add(pair[0].session);}
 }
 if(comparison){const group=m.runs.filter(row=>row.label===label&&row.repeat===repeat),order=repeat%2?['generated','cache']:['cache','generated'];
  if(group.map(row=>row.variant+':'+row.phase).join(',')!==order.flatMap(variant=>[variant+':cold',variant+':warm']).join(',')||new Set(group.map(row=>row.fixtureSha256)).size!==1||group.some(row=>JSON.stringify(row.variantOrder)!==JSON.stringify(order)))result.errors.push('Generated/cache matching or alternating order differs '+label+'/'+repeat);}
}
if(comparison){result.pilots={};for(const variant of ['generated','cache']){
 const pilot=comparison.pilots?.[variant],bytes=checkedFile(pilot?.report,pilot?.sha256,'Matched '+variant+' pilot');
 if(bytes){try{result.pilots[variant]=validateStartupVariant(JSON.parse(bytes),{variant,label:comparison.pilotCase,manifest:landManifest,asset:comparison.assets?.[comparison.pilotCase]});if(!result.pilots[variant].ok)result.errors.push('Invalid matched '+variant+' pilot');}catch(error){result.errors.push('Pilot invalid: '+error.message);}}
 }}else{try{const pilot=JSON.parse(fs.readFileSync(resolve(m.pilotReport),'utf8'));result.pilot=validateStartupReport(pilot,{requireGuardV2});if(!result.pilot.ok)result.errors.push('Invalid pilot');}catch(error){result.errors.push('Pilot unreadable: '+error.message);}}
if(m.runs.length!==result.expectedRuns)result.errors.push('Expected exactly '+result.expectedRuns+' runs');
if(comparison&&(m.failure||m.activeRun))result.errors.push('Series failure/interrupted attempt retained in manifest');
result.ok=result.errors.length===0&&result.runs.every(row=>row.ok);
if(comparison)result.summary=['newbie','saved-near','saved-far'].flatMap(label=>['generated','cache'].flatMap(variant=>['cold','warm'].map(phase=>{
 const completed=result.runs.filter(row=>row.ok&&row.label===label&&row.variant===variant&&row.phase===phase),values=completed.map(row=>row.controlMs).sort((a,b)=>a-b),processValues=completed.map(row=>row.processToControlMs).sort((a,b)=>a-b),clickValues=completed.map(row=>row.fromClickMs).sort((a,b)=>a-b);
 return{label,variant,phase,n:values.length,valuesMs:values,medianMs:result.ok&&values.length===3?values[1]:null,processToControlValuesMs:processValues,medianProcessToControlMs:result.ok&&processValues.length===3&&processValues.every(Number.isFinite)?processValues[1]:null,fromClickValuesMs:clickValues,medianFromClickMs:result.ok&&clickValues.length===3&&clickValues.every(Number.isFinite)?clickValues[1]:null};
})));
const output=arg('out',path.join(root,'revalidation.json'));fs.writeFileSync(output,JSON.stringify(result,null,2));
console.log(JSON.stringify({ok:result.ok,runs:result.runs.length,failed:result.runs.filter(row=>!row.ok),errors:result.errors,output}));
if(!result.ok)process.exitCode=1;
