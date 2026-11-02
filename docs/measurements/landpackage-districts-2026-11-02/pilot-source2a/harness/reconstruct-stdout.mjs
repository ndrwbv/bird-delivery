import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),[name,output]=process.argv.slice(2),records=JSON.parse(fs.readFileSync(path.join(dir,'stdout-records.json'))),record=records.find(v=>v.name===name);
assert.ok(record?.deduplicated,'expected one of the five archived case names');assert.ok(output,'explicit fresh output path required');
const raw=JSON.parse(fs.readFileSync(path.join(dir,'runs',name,'raw.json'))),bytes=Buffer.from(JSON.stringify(raw.result)+'\n','utf8');
assert.equal(bytes.length,record.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);fs.writeFileSync(output,bytes,{flag:'wx'});
console.error(JSON.stringify({output,bytes:bytes.length,sha256:record.sha256,originalPath:record.originalPath}));
