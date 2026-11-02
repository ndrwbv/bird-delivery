/* New products require both fresh graphics profiles; v1 is an explicit historical diagnostic only. */
import fs from 'node:fs';
import path from 'node:path';
import {checkAddressPackageCatalog,assertProductAddressCatalog} from '../src/game/addresspackage17b.js';
import {decodeAddressCatalog} from '../src/game/addresscodec17b.js';
import {captureSource,sha256} from './land-package-files.mjs';
const need=(yes,code)=>{if(!yes)throw Error('address-package-build:'+code);};
export function verifyAddressPackage({repo,dir,legacy=false}){
  need(typeof legacy==='boolean','LEGACY_OPTION');dir=fs.realpathSync(dir);
  const catalogFile=path.join(dir,'catalog.json'),stat=fs.lstatSync(catalogFile);
  need(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=65536,'CATALOG_SIZE');
  const raw=JSON.parse(fs.readFileSync(catalogFile,'utf8')),catalog=legacy?checkAddressPackageCatalog(raw):assertProductAddressCatalog(raw);
  const slots=catalog.version===1?[{graphics:null,identity:catalog.identity,entry:catalog.entry}]:catalog.slots,base=captureSource(repo).base,assets=[];
  for(const slot of slots){
    need(['mapId','mapHash','editsHash','sourceHash'].every(k=>base[k]===slot.identity[k]),'SOURCE_MISMATCH');
    const file=path.join(dir,slot.entry.path),real=fs.realpathSync(file),relative=path.relative(dir,real);
    need(!relative.startsWith('..')&&!path.isAbsolute(relative)&&!fs.lstatSync(file).isSymbolicLink(),'LOCAL_FILE');
    need(fs.statSync(real).isFile()&&fs.statSync(real).size===slot.entry.bytes,'FILE_SIZE');
    const bytes=fs.readFileSync(real);need(sha256(bytes)===slot.entry.sha256,'FILE_SHA');decodeAddressCatalog(bytes,slot.identity);
    assets.push({file:real,path:slot.entry.path,bytes:slot.entry.bytes,sha256:slot.entry.sha256,graphics:slot.graphics,inputHash:slot.identity.inputHash});
  }
  return{catalog,assets,...(catalog.version===1?{file:assets[0].file}:{})};
}
export function addressPackagePlugin(checked){
  return{name:'prepared-address-package',generateBundle(){
    for(const asset of checked.assets){
      const bytes=fs.readFileSync(asset.file);need(bytes.length===asset.bytes&&sha256(bytes)===asset.sha256,'CHANGED_DURING_BUILD');
      this.emitFile({type:'asset',fileName:asset.path,source:bytes});
    }
    this.emitFile({type:'asset',fileName:'address-data/catalog.json',source:JSON.stringify(checked.catalog)});
  }};
}
