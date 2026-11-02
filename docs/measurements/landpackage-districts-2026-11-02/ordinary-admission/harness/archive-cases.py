from pathlib import Path
import json,hashlib,sys
out=Path('/Users/andrewboev/Desktop/not-work/delivery/docs/measurements/landpackage-districts-2026-11-02/ordinary-admission');records=json.load(open(out/'copy-records.json')) if (out/'copy-records.json').exists() else [];stdoutRecords=json.load(open(out/'stdout-records.json')) if (out/'stdout-records.json').exists() else []
def copy(src,dest):
 b=Path(src).read_bytes();q=out/dest;assert not q.exists();q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(b);records.append(dict(originalPath=str(Path(src).resolve()),archivePath=dest,bytes=len(b),sha256=hashlib.sha256(b).hexdigest()))
for label in sys.argv[1:]:
 base=Path('/tmp/bird-landcoverage-v2-'+label+'-1102');r=json.load(open(base/'run.json'));raw=json.load(open(base/'raw.json'));stdout=(base/'stdout.log').read_bytes();reconstructed=(json.dumps(raw['result'],ensure_ascii=False,separators=(',',':'))+'\n').encode()
 # Python number formatting is not assumed equivalent to JavaScript. Keep stdout physically here; JS gate verifies its record SHA.
 for f in ['raw.json','run.json','stderr.log','stdout.log']:copy(base/f,'runs/'+label+'/'+f)
 copy(r['fixtureFile'],'runs/'+label+'/fixture.json');stdoutRecords.append(dict(label=label,originalPath=str(base/'stdout.log'),bytes=len(stdout),sha256=hashlib.sha256(stdout).hexdigest(),physicallyCopied=True,deduplicated=False))
(out/'copy-records.json').write_text(json.dumps(records,indent=2)+'\n');(out/'stdout-records.json').write_text(json.dumps(stdoutRecords,indent=2)+'\n');print({'copiedCases':sys.argv[1:],'caseCount':len(stdoutRecords)})
