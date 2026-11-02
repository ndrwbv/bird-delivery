/* A prepared package is optional for development, mandatory when a package directory is supplied. */
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {assertProductCoverage} from '../src/game/landdata/land-package-catalog.js';
import {canonical,need,makeIdentity} from '../src/game/landdata/land-package-key.js';
import {captureSource,sha256} from './land-package-files.mjs';
import {DEFAULT_LIMITS} from '../src/game/landcache17a/checkpoint-limits.js';
import {LAND_PACKAGE_LIMITS} from '../src/game/landdata/land-package-config.js';
import {decodeCheckpoint} from '../src/game/landcache17a/checkpoint-codec.js';

const rawCeiling=DEFAULT_LIMITS.maxPayloadBytes+DEFAULT_LIMITS.maxHeaderBytes+20;
export function verifyLandPackage({repo,dir,catalogFile='catalog.json'}){
 dir=fs.realpathSync(dir);
 // Historical v1 remains parseable by checkCatalog; a NEW product build requires all four v2 slots.
 const catalog=assertProductCoverage(JSON.parse(fs.readFileSync(path.join(dir,catalogFile),'utf8')));
 const current=captureSource(repo).base,declared=catalog.manifest;
 need(['mapId','mapHash','editsHash','sourceHash'].every(key=>declared[key]===current[key]),'PACKAGE_SOURCE_MISMATCH');
 const assets=[];
 for(const entry of catalog.entries){
  need(entry.rawBytes<=rawCeiling&&entry.bytes<=rawCeiling+65536,'PACKAGE_CONTENT_BUDGET');
  const file=path.join(dir,entry.path),real=fs.realpathSync(file);
  need(!path.relative(dir,real).startsWith('..')&&!fs.lstatSync(file).isSymbolicLink(),'PACKAGE_FILE_PATH');
  const wire=fs.readFileSync(real);need(wire.length===entry.bytes&&sha256(wire)===entry.sha256,'PACKAGE_WIRE_SHA');
  const raw=entry.encoding==='gzip'?gunzipSync(wire,{maxOutputLength:entry.rawBytes}):wire;
  need(raw.length===entry.rawBytes&&sha256(raw)===entry.rawSha256,'PACKAGE_RAW_SHA');
  need(raw.length>=20&&raw.subarray(0,8).equals(Buffer.from([66,49,55,76,65,78,68,0])),'PACKAGE_MAGIC');
  const headerBytes=raw.readUInt32LE(12);need(headerBytes>0&&headerBytes<=DEFAULT_LIMITS.maxHeaderBytes&&20+headerBytes<=raw.length,'PACKAGE_HEADER');
  const header=JSON.parse(raw.subarray(20,20+headerBytes).toString('utf8'));
  need(canonical(header.identity)===canonical(makeIdentity(catalog.manifest,entry.precleanHash)),'PACKAGE_INPUT_IDENTITY');
  // A matching outer SHA alone must not admit a coherently rehashed but invalid codec payload.
  decodeCheckpoint(new Uint8Array(raw.buffer,raw.byteOffset,raw.byteLength),makeIdentity(catalog.manifest,entry.precleanHash),{limits:LAND_PACKAGE_LIMITS});
  assets.push({path:entry.path,file:real,bytes:entry.bytes,sha256:entry.sha256});
 }
 return{catalog,assets};
}
export function landPackagePlugin(checked){
 return{name:'prepared-land-package',generateBundle(){
  for(const asset of checked.assets){const bytes=fs.readFileSync(asset.file);need(bytes.length===asset.bytes&&sha256(bytes)===asset.sha256,'PACKAGE_CHANGED_DURING_BUILD');this.emitFile({type:'asset',fileName:asset.path,source:bytes});}
  this.emitFile({type:'asset',fileName:'city-data/catalog.json',source:JSON.stringify(checked.catalog)});
 }};
}
