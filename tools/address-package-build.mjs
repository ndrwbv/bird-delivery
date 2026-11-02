/* Verify one opt-in prepared address asset before embedding its small catalog. */
import fs from 'node:fs';
import path from 'node:path';
import {checkAddressPackageCatalog} from '../src/game/addresspackage17b.js';
import {decodeAddressCatalog} from '../src/game/addresscodec17b.js';
import {captureSource,sha256} from './land-package-files.mjs';

const need=(yes,code)=>{if(!yes)throw Error('address-package-build:'+code);};
export function verifyAddressPackage({repo,dir}){
  dir=fs.realpathSync(dir);
  const catalogFile=path.join(dir,'catalog.json');
  need(fs.statSync(catalogFile).size<=65536,'CATALOG_SIZE');
  const catalog=checkAddressPackageCatalog(JSON.parse(fs.readFileSync(catalogFile,'utf8')));
  const base=captureSource(repo).base;
  need(['mapId','mapHash','editsHash','sourceHash'].every(k=>base[k]===catalog.identity[k]),'SOURCE_MISMATCH');
  const file=path.join(dir,catalog.entry.path),real=fs.realpathSync(file),relative=path.relative(dir,real);
  need(!relative.startsWith('..')&&!path.isAbsolute(relative)&&!fs.lstatSync(file).isSymbolicLink(),'LOCAL_FILE');
  need(fs.statSync(real).size===catalog.entry.bytes,'FILE_SIZE');
  const bytes=fs.readFileSync(real);need(sha256(bytes)===catalog.entry.sha256,'FILE_SHA');
  decodeAddressCatalog(bytes,catalog.identity);
  return{catalog,file:real};
}
export function addressPackagePlugin(checked){
  return{name:'prepared-address-package',generateBundle(){
    const bytes=fs.readFileSync(checked.file);
    need(bytes.length===checked.catalog.entry.bytes&&sha256(bytes)===checked.catalog.entry.sha256,'CHANGED_DURING_BUILD');
    this.emitFile({type:'asset',fileName:checked.catalog.entry.path,source:bytes});
    this.emitFile({type:'asset',fileName:'address-data/catalog.json',source:JSON.stringify(checked.catalog)});
  }};
}
