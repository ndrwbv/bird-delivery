/* Freeze generated geometry sample points for the cache eval. No process or benchmark launch. */
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const arg=k=>process.argv.slice(2).find(a=>a.startsWith('--'+k+'='))?.slice(k.length+3);
const source=arg('generated-report'),init=arg('base-init'),output=arg('out');assert(source&&init&&output,'--generated-report --base-init --out required');
const raw=JSON.parse(fs.readFileSync(source,'utf8')),r=raw.result;assert.equal(raw.ok,true);assert.equal(r?.ok,true);assert.equal(r.timing,false);assert.equal(r.sampleMode,'generated-selection');
assert.equal(raw.errors.length,0);assert.equal(raw.uncaught,0);assert.equal(r.crash,0);assert.equal(r.alignCalls,1);assert.equal(r.activateCalls,1);
assert.equal(r.startup.protocolVersion,2);assert.equal(r.startup.guardVersion,2);assert.match(r.samples.drawDigest,/^[a-f0-9]{64}$/);
const content=fs.readFileSync(init,'utf8')+'\nObject.defineProperty(window,"__landGeometry17aSamples",{value:'+JSON.stringify(r.samples)+',writable:false,configurable:false});\n';
fs.writeFileSync(output,content,{flag:'wx'});console.log(JSON.stringify({ok:true,out:output,sha256:createHash('sha256').update(content).digest('hex'),sampleDigest:r.samples.drawDigest,landPoses:r.samples.landPoses.length,pavedPoses:r.samples.pavedPoses.length,driveEdges:r.samples.driveEdges.length,boundaries:r.samples.boundaries.length,props:r.samples.props.length,benches:r.samples.benches.length}));
