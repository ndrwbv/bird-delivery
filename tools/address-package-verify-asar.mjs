/* Inspect actual packaged address bytes, never the current world/source or the old land inventory. */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {toAsarInternalPath} from './land-package-verify-asar.mjs';
import {checkAddressPackageCatalog} from '../src/game/addresspackage17b.js';
import {decodeAddressCatalog} from '../src/game/addresscodec17b.js';
import {canonical} from '../src/game/landdata/land-package-key.js';

const asar=createRequire(import.meta.url)('@electron/asar'),prefix='dist/steam/',dataPrefix=prefix+'address-data/';
const need=(yes,code)=>{if(!yes)throw Error('address-package-asar:'+code);};
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function verifyAsarAddresses(archive,expectedExternalCatalog){
 need(expectedExternalCatalog,'EXTERNAL_EXPECTED_CATALOG_REQUIRED');
 const expected=checkAddressPackageCatalog(expectedExternalCatalog);archive=path.resolve(archive);
 const catalogPath=dataPrefix+'catalog.json',stat=asar.statFile(archive,toAsarInternalPath(catalogPath),false);
 need(stat&&Number.isSafeInteger(stat.size)&&stat.size>0&&stat.size<=65536&&!stat.link&&!stat.unpacked&&!('files'in stat),'PACKAGED_CATALOG');
 const bytes=asar.extractFile(archive,toAsarInternalPath(catalogPath),false);need(bytes.length===stat.size,'PACKAGED_CATALOG');
 let parsed;try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{need(false,'CATALOG_JSON');}
 const catalog=checkAddressPackageCatalog(parsed);need(canonical(catalog)===canonical(expected),'PACKAGED_CATALOG_CHANGED');
 const entry=catalog.entry,file=prefix+entry.path;
 need(Number.isSafeInteger(entry.bytes)&&entry.bytes>0&&entry.bytes<=16*1024*1024,'PACKAGED_CONTENT_BUDGET');
 // Every address-data entry is accounted for. No extra nested directory, link or payload is silently ignored.
 const actual=asar.listPackage(archive).map(name=>name.replaceAll('\\','/').replace(/^\/+/,''))
  .filter(name=>name.startsWith(dataPrefix)).sort();
 need(canonical(actual)===canonical([catalogPath,file].sort()),'PACKAGED_DATA_INVENTORY');
 const s=asar.statFile(archive,toAsarInternalPath(file),false);
 need(s&&s.size===entry.bytes&&!s.link&&!s.unpacked&&!('files'in s),'PACKAGED_FILE');
 const payload=asar.extractFile(archive,toAsarInternalPath(file),false);
 need(payload.length===entry.bytes&&sha256(payload)===entry.sha256,'PACKAGED_SHA');
 decodeAddressCatalog(payload,catalog.identity);
 return{ok:true,archive,catalogSha256:sha256(bytes),sourceHash:catalog.identity.sourceHash,inputHash:catalog.identity.inputHash,
  assets:[{path:file,bytes:payload.length,sha256:entry.sha256}]};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=key=>process.argv.slice(2).find(v=>v.startsWith('--'+key+'='))?.slice(key.length+3);
 try{
  need(arg('asar')&&arg('dir'),'REQUIRED_ASAR_AND_DIR');
  const external=path.join(arg('dir'),'address-data/catalog.json'),size=fs.statSync(external).size;
  need(Number.isSafeInteger(size)&&size>0&&size<=65536,'EXTERNAL_CATALOG_BUDGET');
  const expected=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(external)));
  const result=verifyAsarAddresses(arg('asar'),expected);
  if(arg('report'))fs.writeFileSync(arg('report'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(error){console.error(String(error?.stack||error));process.exitCode=1;}
}
