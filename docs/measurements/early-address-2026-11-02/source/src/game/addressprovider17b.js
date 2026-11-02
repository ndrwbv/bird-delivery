/* Private prepared queries + replay at legacy emissions. No scene, storage, RNG or scheduling. */
const HOUSE=['x','z','mx','mz','addr','name','lv'],DOOR=[0,1,2,3],SPOT=['x','z'];
const NAMES=['houses','generatedDoors','entrances','spots','buildings'];
const data=(row,key)=>{const d=Object.getOwnPropertyDescriptor(row,key);if(!d||!Object.hasOwn(d,'value'))throw Error('addressprovider17b:DATA_FIELD');return d.value;};
const idOf=building=>{if(!building||typeof building!=='object'||Array.isArray(building))throw Error('addressprovider17b:BUILDINGS');const d=Object.getOwnPropertyDescriptor(building,'id');if(d&&!Object.hasOwn(d,'value'))throw Error('addressprovider17b:SOURCE_ID');return d?.value??null;};
const same=(a,b,keys)=>keys.every(key=>Object.is(data(a,key),data(b,key)));
const keysAre=(row,keys)=>Object.keys(row).sort().join(',')===keys.map(String).sort().join(',');
const validId=id=>id===null||typeof id==='string'||typeof id==='number'&&Number.isFinite(id);
function scalarRow(row,keys,kind){
 if(!row||typeof row!=='object'||(kind==='door'? !Array.isArray(row)||row.length!==4:Object.getPrototypeOf(row)!==Object.prototype)||!keysAre(row,keys))throw Error('addressprovider17b:ROW_SHAPE');
 for(const key of keys){const value=data(row,key),text=kind==='house'&&(key==='addr'||key==='name');if(text?typeof value!=='string':typeof value!=='number'||!Number.isFinite(value))throw Error('addressprovider17b:ROW_SCALAR');}
}

/** catalog is the codec's deeply immutable owned snapshot; targets are the original live arrays. */
export function createPreparedAddressProvider({catalog,targets,isCurrent=()=>true,fallbackAddress='',formatAddress=value=>value,doorRadius}={}){
 let phase='prepared',published=false,failure=null,houseAt=0,doorAt=0,spotAt=0,hydrated=null;
 let refs,prefix,buildingRefs,buildingIds,buildingIndex;
 function reject(code){throw Error('addressprovider17b:'+code);}
 const need=(yes,code)=>{if(!yes)reject(code);};
 function failed(value){
  let error=value instanceof Error?value:new Error(String(value));
  if(published){try{error.addressPackageFatal=true;}catch{error=Object.assign(new Error(error.message,{cause:error}),{addressPackageFatal:true});}}
  if(!failure)failure=error;phase='failed';hydrated=null;throw error;
 }
 function operation(fn){try{return fn();}catch(error){return failed(error);}}
 function current(){need(isCurrent()===true,'LIFETIME_CHANGED');}
 function live(){
  current();need(NAMES.every((key,i)=>targets[key]===refs[i]),'TARGET_REFERENCES_CHANGED');
  need(targets.buildings.length===catalog.buildingCount,'BUILDING_COUNT_CHANGED');
 }
 function countState(){
  live();need(targets.houses.length===houseAt&&targets.generatedDoors.length===doorAt&&targets.spots.length===spotAt,'LIVE_COUNTS');
  need(targets.entrances.length===catalog.rawEntranceCount+(phase==='merged'||phase==='sealed'?doorAt:0),'ENTRANCE_COUNT');
 }
 function ready(){need(published&&!failure&&phase!=='cancelled','PRIVATE_NOT_READY');live();}
 function collecting(){need(published&&phase==='collecting'&&!failure,'COLLECT_PHASE');countState();}
 function checkBuilding(index,id){
  const b=targets.buildings[index];need(b===buildingRefs[index]&&Object.is(idOf(b),buildingIds[index])&&Object.is(idOf(b),id),'BUILDING_CHANGED');return b;
 }
 function sourceLink(building,link){
  const index=buildingIndex.get(building);need(index!==undefined&&index===link.building,'SOURCE_BUILDING_ORDER');checkBuilding(index,link.sourceId);
 }
 function auditPrefix(){
  need(targets.entrances.length>=catalog.rawEntranceCount,'PREFIX_COUNT');
  for(let i=0;i<prefix.length;i++)need(targets.entrances[i]===prefix[i]&&same(prefix[i],catalog.entrances[i],DOOR),'PREFIX_CHANGED');
 }
 function audit(){
  countState();auditPrefix();
  for(let i=0;i<catalog.buildingCount;i++)checkBuilding(i,buildingIds[i]);
  for(let i=0;i<houseAt;i++)need(targets.houses[i]===hydrated.houses[i]&&same(targets.houses[i],catalog.houses[i],HOUSE),'HOUSE_CHANGED');
  for(let i=0;i<doorAt;i++){
   need(targets.generatedDoors[i]===hydrated.doors[i]&&same(targets.generatedDoors[i],catalog.generatedDoors[i],DOOR),'DOOR_CHANGED');
   if(phase==='merged')need(targets.entrances[catalog.rawEntranceCount+i]===targets.generatedDoors[i],'DOOR_ALIAS_CHANGED');
  }
  for(let i=0;i<spotAt;i++)need(targets.spots[i]===hydrated.spots[i]&&same(targets.spots[i],catalog.spots[i],SPOT),'SPOT_CHANGED');
 }
 // Validation and hydration do not write to targets, freeze live data, or make private queries visible.
 try{
  need(typeof isCurrent==='function'&&typeof formatAddress==='function'&&typeof fallbackAddress==='string'&&Number.isFinite(doorRadius)&&doorRadius>0,'OPTIONS');
  need(catalog&&Object.isFrozen(catalog)&&catalog.version===1&&Number.isSafeInteger(catalog.buildingCount)&&catalog.buildingCount>=0&&Number.isSafeInteger(catalog.rawEntranceCount)&&catalog.rawEntranceCount>=0,'CATALOG');
  for(const key of ['houses','houseLinks','generatedDoors','doorLinks','entrances','spots'])need(Array.isArray(catalog[key])&&Object.isFrozen(catalog[key]),'IMMUTABLE_TABLE');
  need(catalog.houses.length===catalog.houseLinks.length&&catalog.generatedDoors.length===catalog.doorLinks.length&&catalog.entrances.length===catalog.rawEntranceCount+catalog.generatedDoors.length,'CATALOG_COUNTS');
  need(targets&&NAMES.every(key=>Array.isArray(targets[key]))&&new Set(NAMES.map(key=>targets[key])).size===NAMES.length,'TARGETS');
  refs=NAMES.map(key=>targets[key]);
  for(const key of NAMES.slice(0,4))need(Object.isExtensible(targets[key])&&Object.getOwnPropertyDescriptor(targets[key],'length')?.writable===true,'TARGET_NOT_APPENDABLE');
  need(!targets.houses.length&&!targets.generatedDoors.length&&!targets.spots.length&&targets.entrances.length===catalog.rawEntranceCount&&targets.buildings.length===catalog.buildingCount,'INITIAL_PHASE');
  buildingRefs=targets.buildings.slice();buildingIds=buildingRefs.map(idOf);buildingIndex=new Map();
  buildingRefs.forEach((b,i)=>{need(b&&typeof b==='object'&&validId(buildingIds[i])&&!buildingIndex.has(b),'BUILDINGS');buildingIndex.set(b,i);});
  const houseOwners=new Set();
  for(const [name,fields,kind]of [['houses',HOUSE,'house'],['generatedDoors',DOOR,'door'],['entrances',DOOR,'door'],['spots',SPOT,'spot']])for(const row of catalog[name]){need(Object.isFrozen(row),'IMMUTABLE_ROW');scalarRow(row,fields,kind);}
  for(const [name,grand]of [['houseLinks',false],['doorLinks',true]])for(const link of catalog[name]){
   need(link&&Object.isFrozen(link)&&keysAre(link,grand?['building','sourceId','grand']:['building','sourceId']),'IMMUTABLE_LINK');
   const index=data(link,'building'),id=data(link,'sourceId');need(Number.isSafeInteger(index)&&index>=0&&index<catalog.buildingCount&&validId(id)&&Object.is(buildingIds[index],id),'SOURCE_LINK');
   if(grand)need(typeof data(link,'grand')==='boolean','GRAND');else{need(!houseOwners.has(index),'DUPLICATE_HOUSE_BUILDING');houseOwners.add(index);}
  }
  for(let i=0;i<catalog.generatedDoors.length;i++)need(catalog.generatedDoors[i]===catalog.entrances[catalog.rawEntranceCount+i],'CATALOG_DOOR_ALIAS');
  prefix=targets.entrances.slice();for(const row of prefix)scalarRow(row,DOOR,'door');
  hydrated={houses:catalog.houses.map(row=>Object.fromEntries(HOUSE.map(key=>[key,row[key]]))),doors:catalog.generatedDoors.map(row=>row.slice()),spots:catalog.spots.map(row=>({x:row.x,z:row.z}))};
  audit();
 }catch(error){return failed(error);}
 const api={
  publishPrivate(){return operation(()=>{need(phase==='prepared'&&!published&&!failure,'PUBLISH_PHASE');audit();published=true;phase='collecting';return api;});},
  queryAddress(x,z){return operation(()=>{
   ready();let best=null,bd=Infinity;
   for(const h of catalog.houses){const d=(h.x-x)**2+(h.z-z)**2;if(d<bd){bd=d;best=h;}}
   const answer=formatAddress(best?best.addr:fallbackAddress);need(typeof answer==='string','ADDRESS_FORMAT');ready();return answer;
  });},
  queryEntranceLevel(x,z,r=doorRadius){return operation(()=>{
   ready();let near=null,bd=r*r;
   for(const e of catalog.entrances){const d=(e[0]-x)**2+(e[1]-z)**2;if(d<bd){bd=d;near=e;}}
   if(!near)return 0;
   let best=null;bd=60*60;
   for(const h of catalog.houses){const d=(h.x-x)**2+(h.z-z)**2;if(d<bd){bd=d;best=h;}}
   return best?best.lv||0:0;
  });},
  acceptHouse(building,candidate){return operation(()=>{
   collecting();need(houseAt<catalog.houses.length,'EXTRA_HOUSE');sourceLink(building,catalog.houseLinks[houseAt]);scalarRow(candidate,HOUSE,'house');
   need(same(candidate,catalog.houses[houseAt],HOUSE),'HOUSE_MISMATCH');return hydrated.houses[houseAt++];
  });},
  acceptDoor(building,candidate,grand){return operation(()=>{
   collecting();need(doorAt<catalog.generatedDoors.length,'EXTRA_DOOR');sourceLink(building,catalog.doorLinks[doorAt]);scalarRow(candidate,DOOR,'door');
   need(grand===catalog.doorLinks[doorAt].grand&&same(candidate,catalog.generatedDoors[doorAt],DOOR),'DOOR_MISMATCH');return hydrated.doors[doorAt++];
  });},
  mergeDoorsOnce(legacyMerge){return operation(()=>{
   collecting();need(houseAt===catalog.houses.length&&doorAt===catalog.generatedDoors.length,'INCOMPLETE_EMISSIONS');audit();
   need(typeof legacyMerge==='function','LEGACY_MERGE_REQUIRED');const result=legacyMerge();
   need(result===undefined||result===catalog.rawEntranceCount,'LEGACY_MERGE_RESULT');phase='merged';audit();return catalog.rawEntranceCount;
  });},
  // The caller performs its ORIGINAL push/grid insertion. This method must never push a spot.
  acceptSpot(candidate){return operation(()=>{
   need(published&&phase==='merged'&&!failure,'SPOT_PHASE');countState();need(spotAt<catalog.spots.length,'EXTRA_SPOT');scalarRow(candidate,SPOT,'spot');
   need(same(candidate,catalog.spots[spotAt],SPOT),'SPOT_MISMATCH');return hydrated.spots[spotAt++];
  });},
  sealSpots(){return operation(()=>{
   need(published&&phase==='merged'&&!failure,'SEAL_PHASE');need(spotAt===catalog.spots.length,'INCOMPLETE_SPOTS');audit();phase='sealed';
   // Queries retain immutable scalar data. Live arrays own canonical rows after reconciliation.
   hydrated=null;prefix=null;buildingIndex=null;buildingRefs=null;buildingIds=null;return catalog.spots.length;
  });},
  cancel(reason='CANCELLED'){
   if(phase==='cancelled')return false;
   if(published)return operation(()=>reject(String(reason)));
   phase='cancelled';failure=new Error('addressprovider17b:'+reason);hydrated=null;prefix=null;buildingIndex=null;buildingRefs=null;buildingIds=null;return true;
  },
  meta(){return{version:1,phase,privateReady:published&&!failure&&phase!=='cancelled',published,fatal:published&&!!failure,reason:failure?.message||null,counts:{houses:houseAt,generatedDoors:doorAt,spots:spotAt,rawEntrances:catalog.rawEntranceCount},auditRetained:hydrated!==null};},
 };
 return Object.freeze(api);
}
