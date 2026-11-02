/* Pure admission boundaries for the existing smoke runner; no process, storage or world mutation. */
import {checkCatalog} from '../src/game/landdata/land-package-catalog.js';
import {need} from '../src/game/landdata/land-package-key.js';

export function smokeDistrictFromArgs(argv,{preset='high',fixture}={}){
 const prefix='--district=',options=argv.filter(arg=>arg==='--district'||arg.startsWith(prefix));
 need(options.length<=1,'SMOKE_DISTRICT_OPTION');
 need(!options.length||options[0].startsWith(prefix)&&/^(0|3|7)$/.test(options[0].slice(prefix.length)),'SMOKE_DISTRICT_OPTION');
 const district=options.length?Number(options[0].slice(prefix.length)):0;
 need(district===0||typeof fixture==='string'&&fixture.length>0&&preset==='high','SMOKE_DISTRICT_FIXTURE_HIGH');
 return district;
}
export function selectSmokeCoverage(catalog,{district,preset}){
 const checked=checkCatalog(catalog);
 need(checked.version===2,'SMOKE_CATALOG_V2');
 const slot=checked.coverage.find(row=>row.district===district&&row.graphics===preset);
 const entry=slot&&checked.entries.find(row=>row.precleanHash===slot.precleanHash);
 need(slot&&entry,'SMOKE_COVERAGE_SLOT');return{slot,entry};
}
export function assertSmokeDistrict(result,{district,preset,variant,catalog}){
 const d=result?.district;
 need(d?.actual===district&&d.atControl===district&&d.pizzaIndex===district&&d.before?.district===district&&d.before.city===false,'SMOKE_ACTUAL_DISTRICT');
 if(district>0)need(d.before.opened===8&&d.before.partySeen===true&&Number.isSafeInteger(d.pickerClicks)&&d.pickerClicks>0,'SMOKE_DISTRICT_PICKER');
 if(variant==='cache'){
  const selected=selectSmokeCoverage(catalog,{district,preset});
  need(result.landPackage?.precleanHash===selected.slot.precleanHash,'SMOKE_COVERAGE_INPUT');return selected;
 }
 return null;
}
