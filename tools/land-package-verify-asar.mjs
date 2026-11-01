/* Verify the bytes actually placed in the Electron package, before publishing it. */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {sha256} from './land-package-files.mjs';
import {checkCatalog} from '../src/game/landdata/land-package-catalog.js';
import {canonical,need} from '../src/game/landdata/land-package-key.js';
import {LAND_PACKAGE_LIMITS} from '../src/game/landdata/land-package-config.js';

const asar=createRequire(import.meta.url)('@electron/asar'),prefix='dist/steam/';
// ASAR's Filesystem walks dirname by path.sep, even though catalog URLs use '/'.
export const toAsarInternalPath=(file,pathApi=path)=>file.split('/').join(pathApi.sep);
export function verifyAsarLand(archive,expected){
 need(expected,'EXTERNAL_EXPECTED_CATALOG_REQUIRED');
 archive=path.resolve(archive);
 const catalogPath=prefix+'city-data/catalog.json',stat=asar.statFile(archive,toAsarInternalPath(catalogPath),false);
 need(stat&&Number.isSafeInteger(stat.size)&&stat.size>0&&stat.size<=1024*1024&&!stat.link&&!stat.unpacked,'PACKAGED_CATALOG');
 const bytes=asar.extractFile(archive,toAsarInternalPath(catalogPath),false),catalog=checkCatalog(JSON.parse(bytes.toString('utf8')));
 need(canonical(catalog)===canonical(checkCatalog(expected)),'PACKAGED_CATALOG_CHANGED');
 const assets=[];
 for(const entry of catalog.entries){
  need(entry.bytes<=LAND_PACKAGE_LIMITS.maxPayloadBytes+LAND_PACKAGE_LIMITS.maxHeaderBytes+20,'PACKAGED_CONTENT_BUDGET');
  const file=prefix+entry.path,s=asar.statFile(archive,toAsarInternalPath(file),false);
  need(s?.size===entry.bytes&&!s.link&&!s.unpacked,'PACKAGED_FILE');
  const payload=asar.extractFile(archive,toAsarInternalPath(file),false);need(payload.length===entry.bytes&&sha256(payload)===entry.sha256,'PACKAGED_SHA');
  assets.push({path:file,bytes:payload.length,sha256:entry.sha256});
 }
 const actual=asar.listPackage(archive).map(file=>file.replaceAll('\\','/').replace(/^\//,''))
  .filter(file=>file.startsWith(prefix+'city-data/')&&!('files' in asar.statFile(archive,toAsarInternalPath(file),false))).sort();
 const wanted=[catalogPath,...new Set(assets.map(asset=>asset.path))].sort();
 need(canonical(actual)===canonical(wanted),'PACKAGED_DATA_INVENTORY');
 return{ok:true,archive,catalogSha256:sha256(bytes),sourceHash:catalog.manifest.sourceHash,assets};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=key=>process.argv.slice(2).find(v=>v.startsWith('--'+key+'='))?.slice(key.length+3);
 try{
  need(arg('asar')&&arg('dir'),'REQUIRED_ASAR_AND_DIR');const expected=JSON.parse(fs.readFileSync(path.join(arg('dir'),'city-data/catalog.json'),'utf8'));
  const result=verifyAsarLand(arg('asar'),expected);
  if(arg('report'))fs.writeFileSync(arg('report'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(error){console.error(String(error?.stack||error));process.exitCode=1;}
}
