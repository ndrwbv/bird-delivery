/* №17ж: one strict, offline-safe admission gate for pilot/runner/archive. */
export function validateStartupReport(value,{expectedDistrict=null,requireDistrict=false,requireGuardV2=false}={}){
 const reasons=[],r=value?.result,t=r?.report,c=t?.marks?.['first.control'];
 const need=(ok,why)=>{if(!ok)reasons.push(why);};
 need(value?.ok===true&&r?.ok===true,'report/result did not pass');
 need(!value?.evalErr,'evalErr reported by probe');
 need(Array.isArray(value?.errors)&&value.errors.length===0,'console errors missing or nonempty');
 need(value?.uncaught===0,'uncaught count missing or nonzero');
 need(Array.isArray(r?.crash)&&r.crash.length===0,'crash log missing or nonempty');
 need(t?.enabled===true&&t.dropped===0,'trace disabled, incomplete or missing');
 need(['rows','marks','flags','counters'].every(k=>t?.overflow?.[k]===0),'aggregate overflow missing or nonzero');
 need(t?.flags&&Object.keys(t.flags).every(k=>!/error|fallback|rejected/i.test(k)),'error/fallback/rejected flag');
 need(t?.resourceCapture&&t.resourceCapture.truncatedCount===0,'resource capture missing or truncated');
 need(c&&Number.isFinite(c.at)&&c.at>0&&c.data?.state==='drive'&&c.data?.held===false&&c.data?.localReady===true&&c.data?.supportReady===true,'invalid first control');
 if(requireGuardV2)need(c?.data?.guardVersion===2&&c.data.paused===false&&c.data.mapOpen===false,'fresh guardVersion2 control state not proven');
 need(Number.isFinite(r?.moved)&&r.moved>.05,'real W acceleration missing');
 need(r?.bootstrap?.markerWrites>0&&r.bootstrap.bootAbsentAtMarker===true&&r.bootstrap.earlyBootSeen===false,'legacy __boot bootstrap semantics not proven');
 if(requireDistrict){const d=r?.district;need(d&&d.actual===expectedDistrict&&d.atControl===expectedDistrict&&d.pizzaIndex===expectedDistrict,'physical district differs from fixture');need(Number.isFinite(d?.pizza?.bx)&&Number.isFinite(d?.pizza?.bz)&&Number.isFinite(d?.position?.x)&&Number.isFinite(d?.position?.z),'physical pizza/car coordinates missing');if(expectedDistrict===7)need(d?.before?.opened===8&&d.before.partySeen===true&&d.before.city===false&&d.pickerClicks>0,'far fixture/picker not proven');}
 const sum=Array.isArray(t?.rows)?t.rows.reduce((s,row)=>s+row?.exclusiveWorkMs,0):NaN;
 need(Number.isFinite(sum)&&Number.isFinite(t?.workUnionMs)&&Math.abs(sum-t.workUnionMs)<.001,'exclusive work does not reconcile');
 return{ok:reasons.length===0,reasons};
}

/* 17a same-build admission only. Legacy 18-run callers retain the gate above. */
const comparisonLabels=['newbie','saved-near','saved-far'];
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const normalizedQuery=query=>[...new URLSearchParams(query)].filter(([key])=>!['landexport17a','landcache','landcachefile','startuptrace','mute','debug','nolb'].includes(key)).sort(([a],[b])=>a<b?-1:a>b?1:0);
const caseDistrict=label=>label==='saved-far'?7:0;
const caseInputQuery=label=>normalizedQuery('gfx=high&gfxdev=deck&lang=ru&startupdistrict='+caseDistrict(label)+(label==='newbie'?'':'&nointro'));
function unpackIdentity(identity){
 if(!identity||!identity.flags)throw Error('identity missing');
 const flags={...identity.flags};for(const key of ['runtime','query','parameters']){if(typeof flags[key]!=='string')throw Error('identity '+key+' missing');flags[key]=JSON.parse(flags[key]);}
 return{...identity,flags};
}
export const startupInputIdentityKey=identity=>canonical(unpackIdentity(identity));
function inputProblems(identity,{label,manifest,query}={}){
 const reasons=[],need=(ok,why)=>{if(!ok)reasons.push(why);};let input;
 try{input=unpackIdentity(identity);}catch(error){return['full input identity invalid: '+error.message];}
 const {flags}=input,r=flags.runtime,p=flags.parameters,q=flags.query;
 need(Object.keys(input).sort().join(',')==='editsHash,flags,mapHash,mapId,mode,precleanHash,seed,sourceHash'&&input.mode==='streamed-deferred'&&input.seed===7&&typeof input.mapId==='string'&&input.mapId.length>0&&['mapHash','editsHash','sourceHash','precleanHash'].every(key=>hex(input[key])),'full identity fields invalid');
 need(Object.keys(flags).sort().join(',')==='buildHash,parameters,query,rngProvider,runtime'&&hex(flags.buildHash)&&flags.rngProvider==='probe-mulberry32-late-fnv1a-v1','full identity flags invalid');
 need(r&&Object.keys(r).sort().join(',')==='adult,career,district,donationTrash,editor,externalSeed,graphics,intro,mapId,mode,quick,season,seasonForced,streamed'&&r.mapId===input.mapId&&r.mode==='steam'&&r.adult===true&&r.career===true&&r.intro===false&&r.editor===false&&r.streamed===true&&r.graphics==='high'&&r.district===caseDistrict(label)&&r.quick===false&&r.externalSeed===true&&Number.isFinite(r.season)&&r.season>=0&&r.season<4&&(typeof r.seasonForced==='boolean'||r.seasonForced===null)&&Number.isFinite(r.donationTrash)&&r.donationTrash>=0&&r.donationTrash<=1,'runtime differs from known case/high Steam conditions');
 need(p&&Object.keys(p).sort().join(',')==='coverCell,indexCell,maskCell,minWidth,terrainG,terrainNX,terrainNZ,terrainX0,terrainZ0'&&p.coverCell===32&&p.maskCell===32&&p.indexCell===8&&Number.isFinite(p.minWidth)&&p.minWidth>0&&Number.isFinite(p.terrainG)&&p.terrainG>0&&['terrainNX','terrainNZ'].every(key=>Number.isSafeInteger(p[key])&&p[key]>=2)&&['terrainX0','terrainZ0'].every(key=>Number.isFinite(p[key])),'grid/terrain preparation parameters invalid');
 need(Array.isArray(q)&&q.every(pair=>Array.isArray(pair)&&pair.length===2&&pair.every(value=>typeof value==='string'))&&canonical(q)===canonical(caseInputQuery(label)),'identity query differs from known case');
 if(query)need(canonical(q)===canonical(normalizedQuery(query)),'identity query differs from actual URL');
 if(manifest)need(['mapId','mapHash','editsHash','sourceHash','seed'].every(key=>input[key]===manifest[key])&&flags.buildHash===manifest.buildHash,'identity differs from shared manifest');
 return reasons;
}
export function validateStartupComparisonConfig(config,{manifest}={}){
 const reasons=[],text=value=>typeof value==='string'&&value.length>0,need=(ok,why)=>{if(!ok)reasons.push(why);};
 need(config?.version===1,'comparison config version');need(text(config?.manifestFile)&&hex(config?.manifestHash),'shared manifest path/hash');need(comparisonLabels.includes(config?.pilotCase),'pilotCase must identify one known fixture');
 need(config?.assets&&Object.keys(config.assets).sort().join(',')===comparisonLabels.slice().sort().join(','),'exactly three known cache assets required');
 const parameters=[];
 for(const label of comparisonLabels){const asset=config?.assets?.[label];need(text(asset?.file)&&hex(asset?.sha256),'cache file/SHA missing for '+label);reasons.push(...inputProblems(asset?.identity,{label,manifest}).map(reason=>label+': '+reason));try{parameters.push(canonical(unpackIdentity(asset.identity).flags.parameters));}catch{}}
 need(parameters.length===3&&new Set(parameters).size===1,'three cases must use identical grid/terrain parameters');
 need(config?.pilots&&Object.keys(config.pilots).sort().join(',')==='cache,generated','both matched pilot reports required');
 for(const variant of ['generated','cache']){const pilot=config?.pilots?.[variant];need(text(pilot?.report)&&hex(pilot?.sha256),'pilot path/SHA missing for '+variant);}
 return{ok:reasons.length===0,reasons};
}
export function validateStartupVariant(value,{variant,label,manifest,asset}={}){
 const base=validateStartupReport(value,{requireDistrict:true,expectedDistrict:caseDistrict(label),requireGuardV2:true}),reasons=[...base.reasons];
 const need=(ok,why)=>{if(!ok)reasons.push(why);},r=value?.result,t=r?.report,c=r?.cache;
 const row=name=>Array.isArray(t?.rows)?t.rows.find(row=>row.name===name):undefined,zero=value=>value===undefined||value===0;
 need(comparisonLabels.includes(label)&&['generated','cache'].includes(variant),'unknown comparison variant/case');need(r?.protocolVersion===2,'protocol2 required');
 need(Number.isFinite(r?.host?.processEpochMs)&&Number.isFinite(t?.clock?.timeOrigin)&&Number.isFinite(t?.marks?.['first.control']?.at)&&t.clock.timeOrigin+t.marks['first.control'].at>r.host.processEpochMs&&Number.isFinite(r?.firstControlFromClickMs)&&r.firstControlFromClickMs>0,'process/click timing origin missing');
 need(r?.conditions?.lang==='ru'&&r.conditions.physicalDeck===false&&Number(r?.host?.seed)===7&&r?.host?.cpuThrottle===3&&r.host.bootcpu===true,'comparison seed/language/device/throttle differs');
 let query;try{const url=new URL(r?.conditions?.url);query=url.searchParams;need(url.protocol==='app:'&&url.hostname==='g'&&url.pathname==='/index.html','comparison entry URL differs');}catch{need(false,'comparison URL missing');}
 need(query?.get('gfx')==='high'&&query.get('gfxdev')==='deck'&&query.get('startupdistrict')===String(caseDistrict(label))&&query.has('mute'),'comparison graphics/district/mute differs');need(query?.has('nointro')===(label!=='newbie'),'fresh/nointro fixture differs');need(!query?.has('landexport17a'),'export cannot be a timing variant');
 reasons.push(...inputProblems(asset?.identity,{label,manifest,query}));
 need(row('raisedland.activate')?.steps===1&&row('raisedland.alignObjects')?.steps===1,'activate/align must occur exactly once');
 if(variant==='generated'){
  need(c===null||c===undefined,'generated variant has a reader result');need(!query?.has('landcache')&&t?.counters?.['raisedland.cleanCalls']===1,'generated cleanCalls must be one');
 }else if(variant==='cache'){
  need(query?.getAll('landcache').length===1&&query.get('landcache')==='1','explicit cache flag missing');
  need(c?.source==='cache'&&c.phase==='restored'&&c.hit===true&&c.cleaned===true&&c.bufferHeld===false&&!c.reason,'cache restore/cleanup not proven');need(c?.cleanCalls===0&&c?.summary?.cleanCalls===0&&t?.counters?.['raisedland.cleanCalls']===0,'cache cleanCalls must be zero');
  need(!Number.isSafeInteger(asset?.bytes)||c?.bytes===asset.bytes,'cache byte length differs');need(asset&&c?.fileSha256===asset.sha256&&c?.summary?.fileSha256===asset.sha256&&c?.expectedSha256===asset.sha256&&r?.host?.landCacheSha256===asset.sha256,'cache file SHA differs from trusted configuration');need(manifest&&r?.host?.landCacheManifestHash===manifest.manifestHash,'host manifest binding differs');
  reasons.push(...inputProblems(c?.identity,{label,manifest,query}));try{need(startupInputIdentityKey(c?.identity)===startupInputIdentityKey(asset?.identity),'full cache identity differs from case export metadata');}catch{need(false,'full cache identity cannot be compared');}
  need(r?.raised&&['workers','workerBatches','workerFallbacks'].every(key=>zero(r.raised[key])),'cache created/used/fell back from land workers');need(Array.isArray(t?.rows)&&t.rows.every(row=>row.workerWorkMs===0&&row.workerBatches===0)&&zero(t?.waitUnionMs?.worker)&&zero(row('queue.workerWait')?.windows),'cache reports worker work/waits');need(Array.isArray(t?.rows)&&!t.rows.some(row=>/cleanContours/.test(row.name)&&row.steps>0),'cache ran cleanContours work');
 }
 return{ok:reasons.length===0,reasons};
}
/* Bind forensic labels to the actual probe invocation, not only to other record fields. */
export function validateStartupCommand(record,{comparison,dir}={}){
 const reasons=[],need=(ok,why)=>{if(!ok)reasons.push(why);},command=record?.command;
 if(!Array.isArray(command)||command.slice(0,4).join(' ')!=='npm run probe --')return{ok:false,reasons:['actual probe command missing']};
 const values=key=>command.filter(value=>typeof value==='string'&&value.startsWith('--'+key+'=')).map(value=>value.slice(key.length+3));
 const one=(key,expected)=>{const found=values(key);need(found.length===1&&found[0]===String(expected)&&!command.includes('--'+key),'actual --'+key+' differs from record/config');};
 const flag=(key,expected)=>need(command.filter(value=>value==='--'+key).length===(expected?1:0)&&values(key).length===0,'actual --'+key+' differs from scenario');
 one('startup-session',record.session);need(typeof record.session==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(record.session),'record session invalid');flag('startup-cold',record.phase==='cold');flag('fresh',record.label==='newbie');
 for(const key of ['startup-trace','early','bootcpu'])flag(key,true);
 for(const[key,value]of Object.entries({mode:'steam',dir,'startup-fixture':record.fixture,'init-script':comparison?.initFile,cpu:3,seed:7,size:'deck',bootwait:300,timeout:420,eval:'tools/probe-checks/startup-ready.js',max:0,report:record.report,'land-export-manifest':comparison?.manifestFile}))one(key,value);
 one('q','gfx=high&gfxdev=deck&mute&startupdistrict='+caseDistrict(record.label)+(record.variant==='cache'?'&landcache=1':''));
 if(record.variant==='cache'){one('land-cache-file',comparison?.assets?.[record.label]?.file);one('land-cache-sha',comparison?.assets?.[record.label]?.sha256);}
 else for(const key of ['land-cache-file','land-cache-sha'])need(values(key).length===0&&!command.includes('--'+key),'generated command binds a cache asset');
 return{ok:reasons.length===0,reasons};
}
