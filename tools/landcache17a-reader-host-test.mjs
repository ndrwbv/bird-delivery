import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createHash} from 'node:crypto';
import host from './land-cache-host.cjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'reader17-host-')),repo=path.join(root,'repo'),dist=path.join(root,'build');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
fs.mkdirSync(path.join(repo,'src/maps/fixture'),{recursive:true});fs.mkdirSync(dist);
for(const file of ['city-data.js','index.js','edits.json'])fs.writeFileSync(path.join(repo,'src/maps/fixture',file),file);
fs.writeFileSync(path.join(dist,'index.html'),'immutable');
const row=(base,file)=>{const bytes=fs.readFileSync(path.join(base,file));return{path:file,sha256:hash(bytes),bytes:bytes.length};};
const sourceFiles=['city-data.js','index.js','edits.json'].map(file=>row(repo,'src/maps/fixture/'+file)),buildFiles=[row(dist,'index.html')];
const manifest={version:1,mode:'steam',mapId:'fixture',seed:7,sourceFiles,buildFiles,sourceHash:hash(JSON.stringify(sourceFiles)),buildHash:hash(JSON.stringify(buildFiles)),mapHash:hash(JSON.stringify(sourceFiles.filter(row=>!row.path.endsWith('/edits.json')))),editsHash:sourceFiles.find(row=>row.path.endsWith('/edits.json')).sha256,buildDir:dist,limits:{}};
manifest.manifestHash=hash(JSON.stringify(manifest));
const manifestFile=path.join(root,'manifest.json'),file=path.join(root,'cache.land');fs.writeFileSync(manifestFile,JSON.stringify(manifest));fs.writeFileSync(file,'asset is read later by fixed protocol');
try{
  const reads=[],native=fs.readFileSync;fs.readFileSync=function(file,...args){reads.push(String(file));return native.call(this,file,...args);};
  try{host.verifyManifest({manifestFile,dist,repo,full:true});assert.ok(reads.includes(path.join(dist,'index.html')));assert.equal(reads.includes(file),false);reads.length=0;
    const bound=host.bindCacheAsset({file,sha256:hash('asset is read later by fixed protocol'),manifestFile,dist,repo});assert.equal(bound.manifestHash,manifest.manifestHash);assert.ok(bound.url.startsWith('file:'));
    assert.deepEqual(reads,[manifestFile],'per-process only reads small manifest; no asset/source/build content');
  }finally{fs.readFileSync=native;}
  assert.throws(()=>host.bindCacheAsset({file:'relative.land',sha256:'a'.repeat(64),manifestFile,dist,repo}),/HOST_EXPLICIT_FILE/);
  assert.throws(()=>host.verifyManifest({manifestFile,dist:repo,repo}),/HOST_MANIFEST/);
  const missing=path.join(root,'missing.land');assert.throws(()=>host.bindCacheAsset({file:missing,sha256:'a'.repeat(64),manifestFile,dist,repo}));
  fs.writeFileSync(path.join(dist,'index.html'),'changed');assert.throws(()=>host.verifyManifest({manifestFile,dist,repo,full:true}),/HOST_CONTENT_CHANGED/);
  const failure={phase:'failed',reason:'land-cache17a:CRC',cleanCalls:0,publishedCells:0,cleaned:true,bufferHeld:false};assert.deepEqual(host.parseFailure('__landcache17a:failed:'+JSON.stringify(failure)),failure);
  assert.equal(host.parseFailure('ordinary console line'),null);assert.equal(host.parseFailure('__landcache17a:failed:'+JSON.stringify({...failure,cleaned:false,bufferHeld:true})),null);assert.match(host.parseFailure('__landcache17a:failed:not json').reason,/HOST_BAD_FAILURE_SIGNAL/);
  console.log(JSON.stringify({ok:true,fullPreflightOnlyOnce:true,perProcessReadsOnlyManifest:true,cacheFilePreheated:false,dirBound:true,changedContentPreflightRejected:true,structuredFailure:true,gameRun:false}));
}finally{fs.rmSync(root,{recursive:true,force:true});}
