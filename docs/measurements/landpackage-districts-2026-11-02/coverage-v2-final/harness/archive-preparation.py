from pathlib import Path
import json,hashlib
base=Path('/tmp/bird-landcoverage-v2-final-1102');out=Path('/Users/andrewboev/Desktop/not-work/delivery/docs/measurements/landpackage-districts-2026-11-02/coverage-v2-final');a=json.load(open('/tmp/bird-landcoverage-v2-final-audit-1102.json'));records=[]
def copy(src,dest):
 b=Path(src).read_bytes();q=out/dest;assert not q.exists();q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(b);h=hashlib.sha256(b).hexdigest();records.append(dict(originalPath=str(Path(src).resolve()),archivePath=dest,bytes=len(b),sha256=h,compression='none'))
for c in a['cases']:
 name=c['label'];copy(base/(name+'.json'),'runs/'+name+'/raw.json');copy(base/(name+'-fixture.json'),'runs/'+name+'/fixture.json');copy(base/(name+'.stderr.log'),'runs/'+name+'/stderr.log')
 if not c['stdout']['deduplicated']:copy(base/(name+'.stdout.log'),'runs/'+name+'/stdout.log')
for src,dest in [(base/'preparation.json','preparation.json'),(base/'export-receipt.json','provenance/export-receipt.json'),(base/'build.stdout.log','provenance/prepare-build.stdout.log'),(base/'build.stderr.log','provenance/prepare-build.stderr.log'),(base/'package/catalog.json','package/catalog.json'),('/tmp/bird-landcoverage-v2-final-audit-1102.json','independent-offline-audit.json'),('/tmp/bird-landcoverage-v2-final-audit-1102.mjs','harness/original-external-payload-audit.mjs'),('/tmp/bird-landcoverage-v2-final-archive-1102.py','harness/archive-preparation.py')]:copy(src,dest)
(out/'copy-records.json').write_text(json.dumps(records,indent=2)+'\n');(out/'stdout-records.json').write_text(json.dumps([dict(label=c['label'],**c['stdout']) for c in a['cases']],indent=2)+'\n');(out/'payload-records.json').write_text(json.dumps(dict(rawCases=[dict(label=c['label'],**c['payload']) for c in a['cases']],gzip=a['gzipPayload']),indent=2)+'\n')
(out/'root-parent-result.json').write_text(json.dumps(dict(provenance='root task message; not independent child parent-process telemetry',toolSession=4744,exitCode=0,scope='completed final fresh preparation8; separate productionbuild34394 not included'),indent=2)+'\n')
print(json.dumps({'copiedSmallProofs':len(records),'stdoutDedup':sum(c['stdout']['deduplicated'] for c in a['cases']),'payloadsArchived':0,'productionBuildLogsExcluded':True}))
