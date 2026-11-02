// stdout is intentionally not physically copied: exact bytes are reconstructible from raw.result.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),[name,output]=process.argv.slice(2);
assert.ok(['query1','query2','savedkeys'].includes(name),'expected query1|query2|savedkeys');assert.ok(output,'explicit output path required');
const record=JSON.parse(fs.readFileSync(path.join(dir,'raw-records.json'))).find(v=>v.label===name);assert.equal(record.stdoutDeduplicated,true);
const raw=JSON.parse(gunzipSync(fs.readFileSync(path.join(dir,'runs',name,'raw.json.gz')))),bytes=Buffer.from(JSON.stringify(raw.result)+'\n','utf8');
assert.equal(bytes.length,record.stdoutBytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),record.stdoutSha256);
fs.writeFileSync(output,bytes,{flag:'wx'});console.error(JSON.stringify({output,bytes:bytes.length,sha256:record.stdoutSha256,originalPath:record.stdoutOriginalPath}));
