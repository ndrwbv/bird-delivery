from pathlib import Path
import json,hashlib,gzip
base=Path('/tmp/bird-landdistrict17b-1102');out=Path('/Users/andrewboev/Desktop/not-work/delivery/docs/measurements/landpackage-districts-2026-11-02/pilot-source2a');rows=[]
sha=lambda b:hashlib.sha256(b).hexdigest()
def copy(src,dest):
 p=Path(src);b=p.read_bytes();q=out/dest;assert not q.exists();q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(b)
 rows.append(dict(originalPath=str(p.resolve()),archivePath=dest,originalBytes=len(b),originalSha256=sha(b),archiveBytes=len(b),archiveSha256=sha(b),gzipLevel=None))
audit=json.load(open('/tmp/bird-landdistrict17b-pilot-audit-1102.json'))
for case in audit['cases']:
 name=case['name'];copy(base/(name+'.json'),'runs/'+name+'/raw.json');copy(base/(name+'.stderr.log'),'runs/'+name+'/stderr.log')
 if not case['stdout']['deduplicated']:copy(base/(name+'.stdout.log'),'runs/'+name+'/stdout.log')
for f in ['harness.json','source-before.json','export-receipt.json','district3-fixture.json','district7-fixture.json','build.stdout.log','build.stderr.log']:
 copy(base/f,('inputs/' if 'fixture' in f else 'provenance/')+f)
copy('/tmp/bird-landdistrict17b-pilot-audit-1102.json','independent-payload-audit.json')
copy('/tmp/bird-landdistrict17b-pilot-audit-1102.mjs','harness/original-external-payload-audit.mjs')
copy('/tmp/bird-landdistrict17b-archive-pilot-1102.py','harness/archive-pilot.py')
(out/'copy-records.json').write_text(json.dumps(rows,indent=2)+'\n')
(out/'stdout-records.json').write_text(json.dumps([dict(name=c['name'],**c['stdout']) for c in audit['cases']],indent=2)+'\n')
(out/'payload-records.json').write_text(json.dumps([dict(name=c['name'],**c['payload']) for c in audit['cases']],indent=2)+'\n')
print(json.dumps({'copied':len(rows),'stdoutDedup':sum(c['stdout']['deduplicated'] for c in audit['cases']),'landFilesArchived':0}))
