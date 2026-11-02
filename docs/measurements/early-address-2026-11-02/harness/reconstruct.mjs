import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),[what,output]=process.argv.slice(2);assert.ok(output,'explicit fresh output path required');const read=p=>fs.readFileSync(path.join(dir,p)),sha=b=>createHash('sha256').update(b).digest('hex');let bytes,expected;
if(what==='wire'){
 const raw=JSON.parse(gunzipSync(read('preparation/B1-1/raw.json.gz'))),wire=raw.result.addressExport.wire;bytes=Buffer.from(wire.base64,'base64');expected=wire.sha256;assert.equal(bytes.length,wire.bytes);
}else{
 const row=JSON.parse(read('stdout-records.json')).find(r=>r.case===what);assert.ok(row?.deduplicated,'reader/generated/asar stdout required');const raw=JSON.parse(gunzipSync(read(row.rawArchivePath)));bytes=Buffer.from(JSON.stringify(raw.result)+'\n');expected=row.sha256;assert.equal(bytes.length,row.bytes);
}
assert.equal(sha(bytes),expected);fs.writeFileSync(output,bytes,{flag:'wx'});console.error(JSON.stringify({output,bytes:bytes.length,sha256:expected}));
