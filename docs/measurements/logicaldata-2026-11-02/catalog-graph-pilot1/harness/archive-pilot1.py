from pathlib import Path
import json,hashlib,gzip,shutil
root=Path('/Users/andrewboev/Desktop/not-work/delivery');out=root/'docs/measurements/logicaldata-2026-11-02/catalog-graph-pilot1'
records=[]
def copy(src,dest,compress=False):
 p=Path(src);b=p.read_bytes();q=out/dest;q.parent.mkdir(parents=True,exist_ok=True)
 encoded=gzip.compress(b,compresslevel=6,mtime=0) if compress else b
 q.write_bytes(encoded)
 if compress:assert gzip.decompress(q.read_bytes())==b
 records.append({'originalPath':str(p.resolve()),'archivePath':dest,'originalBytes':len(b),'originalSha256':hashlib.sha256(b).hexdigest(),'archiveBytes':len(encoded),'archiveSha256':hashlib.sha256(encoded).hexdigest(),'gzipLevel':6 if compress else None,'byteExactRoundtrip':True})
copy('/tmp/bird-logical17b-export-1102.json','run/raw.json.gz',True)
copy('/tmp/bird-logical17b-export-1102.stdout.log','run/stdout.log.gz',True)
copy('/tmp/bird-logical17b-export-1102.stderr.log','run/stderr.log')
copy('/tmp/bird-logical17b-export-1102.graph','run/city.graph.gz',True)
for name,dest in [('source','provenance/source.json'),('provenance','provenance/source-build.json'),('protocol','run/protocol.json'),('init','harness/init.js'),('eval','harness/eval.js'),('build','run/build.log')]:
 ext='log' if name=='build' else 'js' if name in ['init','eval'] else 'json'
 copy(f'/tmp/bird-logical17b-export-{name}-1102.{ext}',dest)
copy('/tmp/bird-ordinary17b-prepare-1102/high-1-fixture.json','inputs/high-1-fixture.json')
copy(root/'tools/probe-checks/startup-bootstrap-observe.js','harness/startup-bootstrap-observe.js')
copy('/tmp/bird-logical17b-functional-acceptance-plan.md','notes/next-functional-acceptance-plan.md')
copy('/tmp/bird-logical17b-archive-pilot1.py','harness/archive-pilot1.py')
(out/'copy-records.json').write_text(json.dumps(records,indent=2)+'\n')
print(json.dumps({'copied':len(records),'copyBytes':sum(r['archiveBytes'] for r in records),'gzip':[{'path':r['archivePath'],'bytes':r['originalBytes'],'gzipBytes':r['archiveBytes']} for r in records if r['gzipLevel']]}))
