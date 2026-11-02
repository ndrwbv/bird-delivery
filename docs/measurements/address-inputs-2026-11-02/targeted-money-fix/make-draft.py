from pathlib import Path
import json,hashlib,difflib
out=Path('/tmp/bird-address-closure17b-1102');repo=Path('/Users/andrewboev/Desktop/not-work/delivery')
old=Path('/tmp/bird-logical17b-query-export-eval-1102.js').read_text()
start=old.index('const functionalQueries=(()=>{');end=old.index('\n})();',start)+len('\n})();')
original=old[start:end];(out/'functional-queries.original.js').write_text(original)
startup=(repo/'tools/probe-checks/startup-ready.js').read_text();(out/'startup-ready.frozen.js').write_text(startup)
# Same independent oracles and actual realAddress/entranceLv/DOOR.lv/homeOf/POOL/USED calls.
# Only accept externally locked coordinates immediately before the two existing query loops.
adapted=original.replace(' const addressRows=inputs.map('," if(LOCKED)inputs.splice(0,inputs.length,...LOCKED.addresses.map(row=>row.slice()));\n need(inputs.length<=60000,'address query ceiling');\n const addressRows=inputs.map(")
adapted=adapted.replace(' const levelRows=lvInputs.map('," if(LOCKED)lvInputs.splice(0,lvInputs.length,...LOCKED.levels.map(row=>row.slice()));\n need(inputs.length+2*lvInputs.length<=60000,'total real query ceiling');\n const levelRows=lvInputs.map(")
assert adapted!=original and adapted.count('if(LOCKED)')==2
(out/'functional-queries.adapted.js').write_text(adapted)
(out/'functional-adapter.patch').write_text(''.join(difflib.unified_diff(original.splitlines(True),adapted.splitlines(True),fromfile='functional-queries.original.js',tofile='functional-queries.adapted.js')))
numeric="""function toExact(value){
 if(value===null)return['null'];
 if(typeof value==='number'){if(!Number.isFinite(value))throw Error('Nonfinite exact scalar');const bytes=new Uint8Array(8),view=new DataView(bytes.buffer);view.setFloat64(0,value,true);return['number',[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('')];}
 if(typeof value==='undefined')return['undefined'];
 if(typeof value==='string'||typeof value==='boolean')return[typeof value,value];
 if(Array.isArray(value))return['array',value.map(toExact)];
 if(value&&Object.getPrototypeOf(value)===Object.prototype)return['object',Object.keys(value).map(key=>[key,toExact(value[key])])];
 throw Error('Unsupported exact value');
}
function fromExact(value){
 const [type,data]=value;if(type==='null')return null;if(type==='undefined')return undefined;
 if(type==='number'){if(!/^[a-f0-9]{16}$/.test(data))throw Error('Bad exact number');const bytes=Uint8Array.from(data.match(/../g),s=>parseInt(s,16));return new DataView(bytes.buffer).getFloat64(0,true);}
 if(type==='string'||type==='boolean')return data;
 if(type==='array')return data.map(fromExact);if(type==='object')return Object.fromEntries(data.map(([key,row])=>[key,fromExact(row)]));throw Error('Bad exact type');
}
"""
(out/'exact-values.js').write_text(numeric+'\nexport {toExact,fromExact};\n')
base={'dlv-lang':'ru','dlv-sound':False,'dlv-gfx':{'deck':{'p':'high','rv':2}},'dlv-msk-guide':1,'dlv-msk-tut':'1','dlv-msk-nostut':1,'dlv-shift-tut':1,'dlv-msk-wallet':30000,'dlv-shifts':40,'dlv-city-party':True,'dlv-city-mode':False,'dlv-dist-open':8,'dlv-dist-shifts':[4,5,5,6,6,7,7,0],'dlv-district':0,'dlv-season':2.5,'dlv-don-trash':0,'dlv-don-gang':0,'dlv-car-owned':['semerka'],'dlv-car-cur':'semerka','dlv-car-up':{},'dlv-car-L':{},'dlv-car-paint':{'_v':2},'dlv-car-eng':{'semerka':{'c':100,'r':100,'km':0,'n':0}},'dlv-used-addr':[]}
sha=lambda s:hashlib.sha256(s.encode()).hexdigest()
provenance={'originalFile':'/tmp/bird-logical17b-query-export-eval-1102.js','originalFileSha256':sha(old),'originalFunctionalSha256':sha(original),'adaptedFunctionalSha256':sha(adapted),'startupFile':'tools/probe-checks/startup-ready.js','startupSha256':sha(startup),'preparationFixtureSource':'tools/land-package-prepare.mjs','preparationFixtureSourceSha256':sha((repo/'tools/land-package-prepare.mjs').read_text()),'adapterChanges':['Optional B1 fixed address coordinates before actual addressRows loop','Optional B1 fixed level coordinates before actual levelRows loop','Fail closed at 60000 actual query calls; no truncation'],'scope':'No graph packet, graph codec, seed override, or runtime phase substitution'}
(out/'source-provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
for name in ['B1','B2','S','T']:
 folder=out/'cases'/name;folder.mkdir(parents=True,exist_ok=True)
 fixture=json.loads(json.dumps(base))
 if name=='S':fixture['dlv-season']=.5
 if name=='T':fixture['dlv-don-trash']=480000
 (folder/'fixture.json').write_text(json.dumps(fixture,ensure_ascii=False,indent=2)+'\n')
 expected={'case':name,'season':fixture['dlv-season'],'trashRaw':fixture['dlv-don-trash'],'trashFraction':1 if name=='T' else 0,'trashGoal':480000,'district':0,'graphics':'high','car':'semerka','language':'ru','fixtureSha256':sha((folder/'fixture.json').read_text())}
 (folder/'expected.json').write_text(json.dumps(expected,indent=2)+'\n')
 preamble="""/* DRAFT: requires the reviewed address-only observer/flag in a NEW immutable build. */
const EXPECTED=__EXPECTED__,PROVENANCE=__PROVENANCE__;
__NUMERIC__
const LOCKED_EXACT=__LOCKED_JSON__,LOCKED=LOCKED_EXACT===null?null:fromExact(LOCKED_EXACT);
const need=(ok,why)=>{if(!ok)throw Error('addressClosure:'+why);};
const snapshotLimit=32*1024*1024;
const bounded=(value,label)=>{need(new TextEncoder().encode(JSON.stringify(value)).length<=snapshotLimit,label+' 32MiB ceiling');return value;};
need(EXPECTED.case==='B1'||LOCKED,'B2/S/T require B1 locked queries');
const q=new URLSearchParams(location.search);
need(q.has('addressclosure17b')&&!['logicalexport17b','landexport17b','landexport17a','landcache','season','weather'].some(k=>q.has(k)),'address-only query contract');
const initial=window.__addressClosure17bInitial,initialProperty=Object.getOwnPropertyDescriptor(window,'__addressClosure17bInitial');
const frozenData=value=>!value||typeof value!=='object'||Object.isFrozen(value)&&Object.values(value).every(frozenData);
need(initial&&initialProperty?.value===initial&&!initialProperty.writable&&!initialProperty.configurable&&frozenData(initial),'required readonly initial observer missing');
need(initial.phase==='before-city-syncBuild'&&initial.mapId===d.MAP.id&&initial.mode==='steam'&&initial.adult===true&&initial.career===true&&initial.intro===false&&initial.editor===false,'initial runtime');
need(initial.season?.value===EXPECTED.season&&initial.season.forced===false&&initial.season.saved===EXPECTED.season,'actual initial season');
need(initial.donation?.trashRaw===EXPECTED.trashRaw&&initial.donation.trashGoal===EXPECTED.trashGoal&&initial.donation.trashFraction===EXPECTED.trashFraction,'actual trash input');
need(initial.district?.current===0&&initial.district.opened===8&&initial.district.city===false,'actual initial district');
need(initial.car?.id===EXPECTED.car&&initial.graphics?.preset==='high'&&initial.graphics.device==='deck'&&initial.language==='ru','pinned car/graphics/language');
need(initial.ordinary?.ordinaryAtImport===true&&initial.ordinary.hookOwned===true,'initial ordinary EDL ownership');
const preLate=window.__landPackage17bPreLate;
need(preLate&&Object.isFrozen(preLate)&&Object.isFrozen(preLate.pizza)&&preLate.phase==='city-pizzeria-before-late'&&preLate.district===0&&preLate.pizzaIndex===0&&preLate.lateWorkStarted===false,'pre-late actual pizzeria observation');
need(d.S.state==='title'&&!window.__startupTrace?.firstControl,'menu-only before capture');
const catalog=d.ADDRESS_CATALOG;
need(catalog,'required address-only recorder missing');
need(await until(()=>catalog.phase==='sealed',300000),'address recorder did not reach original sealSpots');
need(d.S.state==='title'&&!window.__startupTrace.firstControl,'menu barrier must precede actual Go');
const owned=catalog.snapshot(),links=catalog.checkLinks();
const menuExact=bounded(toExact(owned),'owned menu snapshot'),initialExact=toExact(initial);
need(owned.spots.length>0&&links.phase==='sealed','real menu catalog completion');
const menuPizza=d.PZ_CUR,menuArrayRefs={houses:d.HOUSES,generated:d.GEN_ENTR,entrances:d.CITY.entrances,spots:d.SPOTS,buildings:d.CITY.buildings};
for(let i=0;i<owned.generatedDoors.length;i++)need(owned.generatedDoors[i]===owned.entrances[owned.rawEntranceCount+i],'owned generated-door alias');
for(const row of owned.houseLinks.concat(owned.doorLinks)){const b=catalog.resolveBuilding(row.building);need(b===d.CITY.buildings[row.building]&&Object.is(b.id??null,row.sourceId),'actual owner link');}
const startup=await(async()=>{
__STARTUP__
})();
need(JSON.stringify(toExact(initial))===JSON.stringify(initialExact),'initial observation changed through Go');
need(d.PZ_CUR===menuPizza,'same selected pizzeria through real Go');
for(const [key,ref]of Object.entries(menuArrayRefs))need(ref===({houses:d.HOUSES,generated:d.GEN_ENTR,entrances:d.CITY.entrances,spots:d.SPOTS,buildings:d.CITY.buildings})[key],'same live arrays through Go '+key);
need(JSON.stringify(toExact(catalog.snapshot()))===JSON.stringify(menuExact),'menu owned data changed through Go');
__FUNCTIONAL__
const exactSame=(actual,expected,why)=>need(JSON.stringify(toExact(actual))===JSON.stringify(toExact(expected)),why);
for(const row of functionalQueries.addresses)exactSame(row.actual,row.expected,'exact actual address oracle');
for(const row of functionalQueries.levels){exactSame(row.actual,row.expected,'exact entrance level oracle');exactSame(row.viaDoor,row.actual,'exact door wrapper');}
exactSame(functionalQueries.home.actual,functionalQueries.home.expected,'exact Float64 home oracle');
for(const row of functionalQueries.pool)exactSame(row.actual,row.expected,'exact ordered POOL oracle');
const fixedQueries={addresses:functionalQueries.addresses.map(r=>[r.kind,r.index,r.x,r.z]),levels:functionalQueries.levels.map(r=>[r.kind,r.index,r.x,r.z])};
need(fixedQueries.addresses.length+2*fixedQueries.levels.length<=60000,'60000 actual query ceiling');
if(LOCKED)need(JSON.stringify(toExact(fixedQueries))===JSON.stringify(LOCKED_EXACT),'query coordinates not byte-exact B1 lock');
const exactQueryTables=bounded(toExact({addresses:functionalQueries.addresses,levels:functionalQueries.levels,home:functionalQueries.home,pool:functionalQueries.pool}),'exact query tables');
const after={seasonStored:d.Store.get('dlv-season',null),district:d.DIST.cur(),carId:d.CARSM.current().id,graphics:d.GFX.preset};
return {...startup,addressClosure:{version:1,case:EXPECTED.case,expected:EXPECTED,provenance:PROVENANCE,initial,initialExact,preLate,menuExact,links,after,fixedQueriesExact:bounded(toExact(fixedQueries),'fixed query list'),exactQueryTables,functionalQueries,ownedAliases:true,ordinaryDescriptorIsNotRandomCallCount:true,limits:{maxActualQueries:60000,maxScalarSnapshotBytes:snapshotLimit},claims:{earlyReady:false,readerEnabled:false,allAxesClosed:false},unchanged:{menuOwnerSnapshot:true,arrayReferencesThroughGo:true}}};
"""
 template=preamble.replace('__EXPECTED__',json.dumps(expected)).replace('__PROVENANCE__',json.dumps(provenance)).replace('__NUMERIC__',numeric).replace('__STARTUP__',startup).replace('__FUNCTIONAL__',adapted)
 (folder/'eval.template.js').write_text(template)
 if name=='B1':(folder/'eval.js').write_text(template.replace('__LOCKED_JSON__','null'))
print('Prepared external draft only: 4 fixtures, exact oracle source+adapter, eval templates; no game/build run')
