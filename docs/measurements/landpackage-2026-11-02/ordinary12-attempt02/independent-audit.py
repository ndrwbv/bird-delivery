import json,hashlib,statistics,math,itertools,datetime
from pathlib import Path
B=Path('/tmp/bird-ordinary17b-comparison12-attempt2-1102'); O=Path('/tmp/bird-ordinary17b-attempt2-independent-audit.json')
def load(p):return json.loads(Path(p).read_text())
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def canonical(v):return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def digest(v):return hashlib.sha256(canonical(v).encode()).hexdigest()
m=load(B/'manifest.json');cfg=m['config'];catalog=m['catalogBody'];errors=[]
def ck(ok,why):
 if not ok:errors.append(why)
ck(m['state']=='complete' and m['ok'] is True and not m.get('failure') and not m['activeRun'],'series completion');ck(m['expectedRuns']==12 and len(m['runs'])==12,'exact12')
ck(sha(m['configFile'])==m['configSha256'],'config SHA');ck(load(m['configFile'])==cfg,'copied config body')
for key in ['fixture','catalog']:
 ck(sha(cfg[key]['file'])==cfg[key]['sha256'],key+' original SHA');ck(sha(B/(key+'.json'))==cfg[key]['sha256'],key+' copied SHA')
ck(load(B/'catalog.json')==catalog,'catalog object');ck(all(catalog['manifest'][k]==v for k,v in cfg['base'].items()),'catalog base');ck(load(B/'fixture.json')=={'dlv-lang':'ru','dlv-sound':False,'dlv-gfx':{'deck':{'p':'high','rv':2}}},'stored high exact newbie')
expectedSource='0fd44d87acaaefeef93da4ac376070cd5a22474af7c4ffbf7c75e557704ec07e';expectedBuild='2a4474c94d92bb413ed7dd132391044cef8ac89d671bc63e9c37d7be340d04b1'
ck(cfg['base']['sourceHash']==m['sourceHash']==expectedSource,'functional source0fd');ck(cfg['buildHash']==m['buildHash']==expectedBuild,'build2a447')
pf=m['preflight'];ck(pf['once'] is True and pf['sourceHash']==expectedSource and pf['buildHash']==expectedBuild,'one preflight declaration')
ck(sha(pf['sourceFile'])==pf['sourceFileSha256'] and sha(pf['buildFile'])==pf['buildFileSha256'],'preflight metadata SHA')
source=load(pf['sourceFile']);build=load(pf['buildFile']);ck(source['base']==cfg['base'],'source receipt base');ck(build['hash']==expectedBuild and digest(build['files'])==expectedBuild and len(build['files'])==95,'saved build inventory hash95')
ck(pf['completedAt']<=m['runs'][0]['startedAt'],'preflight before first measured process')
for e in catalog['entries']:
 f=next((r for r in build['files']if r['path']==e['path']),None);ck(f and f['bytes']==e['bytes']and f['sha256']==e['sha256'],'inventory/catalog content binding')
tools={}
for h in m['harness']:
 ck(sha(h['copy'])==h['sha256'],h['file']+' measured copy SHA');tools[h['file']]=h['sha256']
ck(digest([{k:h[k]for k in ['file','sha256','bytes']}for h in m['harness']])==m['harnessSha256'],'harness aggregate SHA')
for variant,p in m['pilots'].items():ck(sha(p['report'])==p['sha256']==cfg['pilots'][variant]['sha256'],'pilot SHA '+variant)
parsed={};per=[];pids=[];epochs=[];metrics={};snapshots=[]
roles={'probe':'tools/probe.cjs','eval':'tools/probe-checks/startup-ready.js','observer':'tools/probe-checks/startup-bootstrap-observe.js','gate':'tools/startup-report.mjs','admission':'tools/land-package-smoke.mjs'}
repo='/Users/andrewboev/Desktop/not-work/delivery'
def args(argv,start):
 opts={};flags=[];dup=False
 for a in argv[start:]:
  if not isinstance(a,str)or not a.startswith('--'):dup=True;continue
  if '='in a:
   k,v=a[2:].split('=',1);dup|=k in opts;opts[k]=v
  else:flags.append(a[2:])
 return opts,sorted(flags),dup
for idx,r in enumerate(m['runs']):
 tag=str(r['repeat'])+'/'+r['variant']+'/'+r['phase'];v=load(r['report']);s=load(r['smokeRecord']);d=v['result'];t=d['report'];rows=t['rows'];by={a['name']:a for a in rows};guard=t['marks']['first.control'];c=d['landPackage'];parsed[r['report']]=v
 ck(sha(r['report'])==r['reportSha256']==s['rawSha256'],tag+' raw SHA');ck(sha(r['smokeRecord'])==r['smokeRecordSha256'],tag+' smoke SHA')
 ck(sha(Path(r['runDir'])/'smoke.stdout.log')==r['stdoutSha256']and sha(Path(r['runDir'])/'smoke.stderr.log')==r['stderrSha256'],tag+' stdout/stderr SHA')
 ck(r['state']=='complete'and r['ok']is True and r['processStatus']==s['processStatus']==0 and not r['signal']and not r['spawnError']and not s['signal']and not s.get('spawnError')and s['ok']is True,tag+' two process statuses')
 ck(v['ok']is True and d['ok']is True and not v['evalErr']and v['errors']==[]and v['uncaught']==0 and d['crash']==[],tag+' engine statuses')
 ck(r['validation']=={'ok':True,'reasons':[]} and s['startupValidation']=={'ok':True,'reasons':[]},tag+' validations')
 for role,file in roles.items():ck(s[role]=={'file':file,'sha256':tools[file]},tag+' preserved '+role+' pin')
 ck(d['rng']=={'provider':'edl-owned-fnv1a-mulberry32-v1','ordinaryAtImport':True,'hookOwned':True,'baseSeed':0x5EED},tag+' ordinary rng')
 ck(d['host']['seed']is None and d['conditions']['seed']is None and d['host']['cpuThrottle']==3 and d['host']['bootcpu']is True,tag+' seednull CPU3')
 ck(d['conditions']['graphics']=={'preset':'high','device':'deck','width':1280,'height':800}and d['conditions']['lang']=='ru'and d['conditions']['physicalDeck']is False,tag+' actual high/viewport')
 ck(d['district']['before']=={'district':0,'opened':1,'city':False,'partySeen':False}and d['district']['pickerClicks']==0 and all(d['district'][k]==0 for k in ['actual','atControl','pizzaIndex']),tag+' actual newbie/district0')
 g=guard['data'];ck(g['guardVersion']==2 and g['state']=='drive' and all(g[k]is False for k in ['paused','mapOpen','held'])and g['localReady']is True and g['supportReady']is True,tag+' fresh guards/control')
 ck(math.isfinite(d['moved'])and d['moved']>.05,tag+' actual W movement')
 ck(d['bootstrap']['bootAbsentAtMarker']is True and d['bootstrap']['earlyBootSeen']is False and d['bootstrap']['markerWrites']>0,tag+' bootstrap semantics')
 ck(t['enabled']is True and t['dropped']==0 and all(t['overflow'][k]==0 for k in ['rows','marks','flags','counters'])and not t['flags']and t['resourceCapture']['truncatedCount']==0,tag+' complete trace')
 ck(abs(sum(row['exclusiveWorkMs']for row in rows)-t['workUnionMs'])<.001,tag+' exclusive reconciliation')
 ck(all(by[n]['steps']==1 for n in ['raisedland.activate','raisedland.alignObjects']),tag+' activate/align1')
 ck(all(all(math.isfinite(a[k])and a[k]>=0 for k in ['workMs','exclusiveWorkMs','maxWorkMs','windowMs','workerWorkMs','workerBatches'])for a in rows),tag+' finite stage metrics')
 ck(all(math.isfinite(x)and x>=0 for x in t['waitUnionMs'].values()),tag+' finite wait unions')
 if r['variant']=='generated':ck(c is None and t['counters']['raisedland.cleanCalls']==1,tag+' clean1')
 else:
  e=next((e for e in catalog['entries']if e['precleanHash']==c['precleanHash']),None)
  ck(e and c['source']=='cache'and c['phase']=='restored'and c['hit']is True and c['fatal']is False and not c['reason']and c['cleaned']is True and c['bufferHeld']is False and t['counters']['raisedland.cleanCalls']==0,tag+' hit clean0')
  ck(c['wireSha256']==c['expectedWireSha256']==e['sha256']and c['rawSha256']==c['expectedRawSha256']==e['rawSha256']and c['bytes']==e['bytes']and c['encoding']==e['encoding'],tag+' wire/raw binding')
  ck(all(a['workerWorkMs']==a['workerBatches']==0 and not('cleanContours'in a['name']and a['steps']>0)for a in rows)and all(d['raised'].get(k,0)==0 for k in ['workers','workerBatches','workerFallbacks']),tag+' no worker/clean work')
 for k,expect in [('configSha256',m['configSha256']),('harnessSha256',m['harnessSha256']),('sourceHash',expectedSource),('buildHash',expectedBuild),('fixtureSha256',cfg['fixture']['sha256']),('catalogSha256',cfg['catalog']['sha256'])]:ck(r[k]==expect,tag+' '+k)
 oo,ff,dd=args(r['command'],2);ck(not dd and r['command'][1]==repo+'/tools/land-package-smoke.mjs'and oo=={'dir':cfg['dir'],'catalog':cfg['catalog']['file'],'fixture':cfg['fixture']['file'],'out':r['runDir'],'preset':'high','variant':r['variant'],'phase':r['phase'],'cpu':'3','session':r['session']}and ff==[],tag+' outer actual argv')
 po,pfFlags,pdup=args(s['argv'],2);expected={'mode':'steam','dir':cfg['dir'],'startup-session':r['session'],'startup-fixture':cfg['fixture']['file'],'size':'deck','cpu':'3','init-script':repo+'/tools/probe-checks/startup-bootstrap-observe.js','q':'gfxdev=deck&mute&startupdistrict=0'+('&landpackage=0'if r['variant']=='generated'else ''),'eval':repo+'/tools/probe-checks/startup-ready.js','bootwait':'360','timeout':'480','max':'0','report':r['runDir']+'/raw.json'}
 ck(not pdup and s['argv'][:2]==[m['electron'],repo+'/tools/probe.cjs']and po==expected and pfFlags==sorted(['startup-trace','fresh','early','bootcpu','errors']+(['startup-cold']if r['phase']=='cold'else []))and r['probeCommand']==s['argv'],tag+' inner exact actual argv')
 ck(s['fixtureSha256']==cfg['fixture']['sha256']and s['catalogSha256']==cfg['catalog']['sha256']and s['fixtureFile']==cfg['fixture']['file']and s['catalogFile']==cfg['catalog']['file'],tag+' smoke input pins')
 times={'controlMs':guard['at'],'processToControlMs':t['clock']['timeOrigin']+guard['at']-d['host']['processEpochMs'],'fromClickMs':d['firstControlFromClickMs']};ck(all(r[k]==x and math.isfinite(x)and x>0 for k,x in times.items()),tag+' timings exactly from raw')
 pids.append(s['pid']);epochs.append(d['host']['processEpochMs']);metrics[(r['variant'],r['phase'],r['repeat'])]=times
 per.append({'id':tag,'reportSha256':r['reportSha256'],'smokeRecordSha256':r['smokeRecordSha256'],'moved':d['moved'],'guard':g,'times':times})
 if idx in [0,3,4,7,8,11]:snapshots.append({'id':tag,'control':guard,'moved':d['moved'],'rng':d['rng'],'cleanCalls':t['counters']['raisedland.cleanCalls'],'activate':by['raisedland.activate']['steps'],'align':by['raisedland.alignObjects']['steps'],'cache':c})
ck(len(set(pids))==len(set(epochs))==12,'twelve distinct Electron processes')
ck(len({(r['repeat'],r['variant'],r['phase'])for r in m['runs']})==12,'no duplicate slots');pairs=[]
for repeat in [1,2,3]:
 group=[r for r in m['runs']if r['repeat']==repeat];order=['generated','cache']if repeat%2 else ['cache','generated'];ck([(r['variant'],r['phase'])for r in group]==list(itertools.product(order,['cold','warm'])),'alternation '+str(repeat));ck(all(r['variantOrder']==order for r in group),'saved variant order')
 for variant in ['generated','cache']:
  pair=[r for r in group if r['variant']==variant];ck(len(pair)==2 and pair[0]['session']==pair[1]['session'],'matched cold/warm session');pairs.append({'repeat':repeat,'variant':variant,'session':pair[0]['session']})
ck(len({p['session']for p in pairs})==6,'six isolated pair sessions')
summary=m['summary'];summaryDisk=load(B/'summary.json');ck(summary==summaryDisk and summary['ok']is True and len(summary['groups'])==4,'complete summary file')
summaryChecks=0;tables=[]
def compareStats(declared,values,label):
 global summaryChecks
 summaryChecks+=1;ck(declared['n']==3 and declared['valuesMs']==values and declared['medianMs']==statistics.median(values)and declared['minMs']==min(values)and declared['maxMs']==max(values),'summary '+label)
for group in summary['groups']:
 variant,phase=group['variant'],group['phase'];runs=[r for r in m['runs']if(r['variant'],r['phase'])==(variant,phase)];traces=[parsed[r['report']]['result']['report']for r in runs];label=variant+'/'+phase;ck(len(runs)==group['n']==3,label+' n3')
 for k,s in group['timings'].items():compareStats(s,[metrics[(variant,phase,r['repeat'])][k]for r in runs],label+'/'+k)
 compareStats(group['workUnion'],[t['workUnionMs']for t in traces],label+'/workUnion')
 names=sorted({row['name']for t in traces for row in t['rows']});waits=sorted({k for t in traces for k in t['waitUnionMs']});ck([s['name']for s in group['stages']]==names and sorted(group['waitUnions'])==waits,label+' complete stages/waits')
 for k,s in group['waitUnions'].items():compareStats(s,[t['waitUnionMs'].get(k,0)for t in traces],label+'/wait/'+k)
 for s in group['stages']:
  for k,stat in s.items():
   if k!='name':compareStats(stat,[next((r[k]for r in t['rows']if r['name']==s['name']),0)for t in traces],label+'/'+s['name']+'/'+k)
 tables.append({'variant':variant,'phase':phase,'n':3,'timings':group['timings'],'workUnion':group['workUnion']})
ck(load('/tmp/bird-ordinary17b-attempt2-independent-pure-gate.json')['ok'],'independent pure shared revalidation')
limitations=['Only recorded metadata/raw/harness copies read; no build/source traversal or binary asset reads. Saved preflight authenticity remains root initial content verification, not a fresh audit of installed bytes.','Ordinary EDL/newbie/stored high/district0 only, n3 per cell on macOS arm64 Electron33/Chromium130 CPU3 emulation; not physical Steam Deck or a guarantee for other careers.','Cold/warm refer to owned Chromium session clearing/reuse; OS/driver caches uncontrolled.','Navigation/process/click origins differ. Individual stage and wait windows overlap and are never summed; import wall is not parse/CPU. app:// ResourceTiming is unavailable.','Failed attempt01 is excluded and remains retained as a metadata failure; this audit never rewrites or reclassifies it. Memory/geometry/release checks remain separate.']
result={'version':1,'ok':not errors,'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'manifest':str(B/'manifest.json'),'manifestSha256':sha(B/'manifest.json'),'sourceHash':expectedSource,'buildHash':expectedBuild,'runs':12,'pairs':pairs,'stageAndTimingAggregatesVerified':summaryChecks,'errors':errors,'perRun':per,'manualSamples':snapshots,'summary':tables,'limitations':limitations}
O.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
lines=['# Независимый ordinary12 attempt2 аудит','','GO:12/12 raw/process/provenance PASS; шесть собственных cold/warm пар, G-C/C-G/G-C, все n3 сводки пересчитаны из raw.','','| Фаза | Generated navigation, c | Cache navigation, c | Разница, c | % | Generated click, c | Cache click, c |','|---|---:|---:|---:|---:|---:|---:|']
for phase in ['cold','warm']:
 g=next(x for x in tables if(x['variant'],x['phase'])==('generated',phase));c=next(x for x in tables if(x['variant'],x['phase'])==('cache',phase));gv=g['timings']['controlMs']['medianMs'];cv=c['timings']['controlMs']['medianMs'];lines.append(f"| {phase} | {gv/1000:.3f} | {cv/1000:.3f} | {(gv-cv)/1000:.3f} | {(1-cv/gv)*100:.2f} | {g['timings']['fromClickMs']['medianMs']/1000:.3f} | {c['timings']['fromClickMs']['medianMs']/1000:.3f} |")
lines+=['',f'Проверено{summaryChecks} отдельных timing/work/stage/wait aggregates: исходные тройки, median/min/max/n3. Все12 — обычный owned EDL/seednull, high1280×800, fresh guard2 и реальный W; clean1 против clean0/no worker, activate+align1. Manifest и raw SHA/source/build/catalog/fixture/harness/actual argv совпали.','', 'Ошибки: '+('нет'if not errors else '; '.join(errors)), '', 'Ограничения:']+['- '+v for v in limitations]
Path('/tmp/bird-ordinary17b-attempt2-independent-audit.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({'ok':not errors,'runs':12,'pairs':6,'aggregates':summaryChecks,'errors':errors,'movementRange':[min(r['moved']for r in per),max(r['moved']for r in per)],'output':str(O),'summary':'/tmp/bird-ordinary17b-attempt2-independent-audit.md'},ensure_ascii=False))
