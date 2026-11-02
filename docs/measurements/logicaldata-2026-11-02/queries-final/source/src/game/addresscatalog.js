/* Records existing live emissions; does not choose addresses, create world objects or schedule work. */
const need=(yes,code)=>{if(!yes)throw Error('addresscatalog:'+code);};
const houseFields=['x','z','mx','mz','addr','name','lv'];
const sourceId=b=>{const id=b.id??null;need(id===null||typeof id==='string'||typeof id==='number'&&Number.isFinite(id),'SOURCE_ID');return id;};
const scalar=(row,key,string=false)=>{const d=Object.getOwnPropertyDescriptor(row,key);need(d&&Object.hasOwn(d,'value')&&(string?typeof d.value==='string':typeof d.value==='number'&&Number.isFinite(d.value)),'ROW_FIELD');return d.value;};
const houseData=row=>{need(row&&typeof row==='object'&&!Array.isArray(row),'HOUSE_ROW');for(const key of houseFields)scalar(row,key,key==='addr'||key==='name');return row;};
const doorData=row=>{need(Array.isArray(row)&&row.length===4,'DOOR_ROW');for(let i=0;i<4;i++)scalar(row,i);return row;};
const spotData=row=>{need(row&&typeof row==='object'&&!Array.isArray(row),'SPOT_ROW');scalar(row,'x');scalar(row,'z');return row;};

export function createAddressCatalogRecorder(targets){
  const names=['houses','generatedDoors','entrances','spots','buildings'];
  need(targets&&names.every(key=>Array.isArray(targets[key])),'TARGETS');
  const {houses,generatedDoors,entrances,spots,buildings}=targets;
  need(new Set(names.map(key=>targets[key])).size===names.length,'TARGET_ALIASES');
  need(!houses.length&&!generatedDoors.length&&!spots.length,'INITIAL_PHASE');
  const refs=names.map(key=>targets[key]),buildingCount=buildings.length,byBuilding=new Map(),prefix=[];
  for(let index=0;index<buildingCount;index++){
    const b=buildings[index];need(b&&typeof b==='object'&&!Array.isArray(b)&&!byBuilding.has(b),'BUILDINGS');
    byBuilding.set(b,{index,id:sourceId(b)});
  }
  for(const row of entrances){doorData(row);prefix.push(row);} // References only; raw rows remain untouched.
  const rawEntranceCount=prefix.length,houseRows=[],doorRows=[],houseBuildings=new Set(),seenHouses=new Set(),seenDoors=new Set(prefix);
  let phase='collecting',sealed=null,sealedSpotRows=null;
  function live(){
    need(phase!=='cancelled','CANCELLED');
    need(names.every((key,i)=>targets[key]===refs[i])&&buildings.length===buildingCount,'TARGET_CHANGED');
  }
  function building(b){
    live();const link=byBuilding.get(b);
    need(link&&buildings[link.index]===b&&Object.is(sourceId(b),link.id),'BUILDING_CHANGED');return link;
  }
  function collecting(){
    live();need(phase==='collecting','COLLECT_PHASE');
    need(houses.length===houseRows.length&&generatedDoors.length===doorRows.length&&entrances.length===rawEntranceCount&&!spots.length,'LIVE_COUNTS');
  }
  function checkLinks(){
    live();for(const b of buildings)building(b);
    need(houses.length===houseRows.length&&generatedDoors.length===doorRows.length,'LIVE_COUNTS');
    need(entrances.length===rawEntranceCount+(phase==='collecting'?0:doorRows.length),'ENTRANCE_COUNT');
    for(let i=0;i<prefix.length;i++)need(entrances[i]===prefix[i],'PREFIX_CHANGED');
    for(let i=0;i<houseRows.length;i++){const r=houseRows[i];need(houses[i]===r.row,'HOUSE_CHANGED');building(r.b);houseData(r.row);}
    for(let i=0;i<doorRows.length;i++){
      const r=doorRows[i];need(generatedDoors[i]===r.row,'DOOR_CHANGED');building(r.b);doorData(r.row);
      if(phase!=='collecting')need(entrances[rawEntranceCount+i]===r.row,'DOOR_ALIAS_CHANGED');
    }
    if(phase==='collecting')need(!spots.length,'SPOTS_BEFORE_MERGE');
    if(sealed){
      need(spots.length===sealedSpotRows.length,'SEALED_CHANGED');
      const equal=(a,b,keys)=>keys.every(key=>Object.is(a[key],b[key]));
      for(let i=0;i<houses.length;i++)need(equal(houseData(houses[i]),sealed.houses[i],houseFields),'SEALED_CHANGED');
      for(let i=0;i<entrances.length;i++)need(equal(doorData(entrances[i]),sealed.entrances[i],[0,1,2,3]),'SEALED_CHANGED');
      for(let i=0;i<spots.length;i++)need(spots[i]===sealedSpotRows[i]&&equal(spotData(spots[i]),sealed.spots[i],['x','z']),'SEALED_CHANGED');
    }
    return{phase,buildingCount,houses:houseRows.length,generatedDoors:doorRows.length,rawEntrances:rawEntranceCount,entrances:entrances.length,spots:spots.length};
  }
  function acceptHouse(b,row){
    collecting();const link=building(b);houseData(row);
    need(!seenHouses.has(row)&&!houseBuildings.has(b),'DUPLICATE_HOUSE');
    houses.push(row);houseRows.push({b,row,link});seenHouses.add(row);houseBuildings.add(b);return row;
  }
  function acceptDoor(b,row,grand){
    collecting();const link=building(b);doorData(row);need(typeof grand==='boolean','GRAND');
    need(!seenDoors.has(row),'DUPLICATE_DOOR');
    generatedDoors.push(row);doorRows.push({b,row,link,grand});seenDoors.add(row);return row;
  }
  function mergeDoorsOnce(){
    collecting();checkLinks();
    // Keep the exact old barrier and alias order; never spread, clone or render generated doors again.
    try{for(const e of generatedDoors)entrances.push(e);}catch(error){phase='cancelled';throw error;}
    phase='merged';return rawEntranceCount;
  }
  function sealSpots(){
    live();need(phase==='merged','SEAL_PHASE');checkLinks();
    const seen=new Set(),spotRows=[];
    for(const row of spots){spotData(row);need(!seen.has(row),'DUPLICATE_SPOT');seen.add(row);spotRows.push(row);}
    // Own scalar projections only. No original row/building is cloned, decorated or frozen.
    const doorTable=new Map(),projectDoor=row=>{let value=doorTable.get(row);if(!value){value=Object.freeze([0,1,2,3].map(key=>scalar(row,key)));doorTable.set(row,value);}return value;};
    const next=Object.freeze({version:1,buildingCount,rawEntranceCount,
      houses:Object.freeze(houseRows.map(r=>Object.freeze(Object.fromEntries(houseFields.map(key=>[key,scalar(r.row,key,key==='addr'||key==='name')]))))),
      houseLinks:Object.freeze(houseRows.map(r=>Object.freeze({building:r.link.index,sourceId:r.link.id}))),
      generatedDoors:Object.freeze(generatedDoors.map(projectDoor)),
      doorLinks:Object.freeze(doorRows.map(r=>Object.freeze({building:r.link.index,sourceId:r.link.id,grand:r.grand}))),
      entrances:Object.freeze(entrances.map(projectDoor)),
      spots:Object.freeze(spots.map(row=>Object.freeze({x:scalar(row,'x'),z:scalar(row,'z')})))});
    sealedSpotRows=spotRows;sealed=next;phase='sealed';return spots.length;
  }
  function snapshot(){live();need(phase==='sealed','SNAPSHOT_PHASE');checkLinks();return sealed;}
  function resolveBuilding(index){live();need(Number.isSafeInteger(index)&&index>=0&&index<buildingCount,'BUILDING_INDEX');const b=buildings[index];building(b);return b;}
  function cancel(){if(phase==='sealed'||phase==='cancelled')return false;phase='cancelled';return true;}
  // sealSpots is the caller's explicit old-generator completion barrier, not an inferred timer/array-length event.
  // Cancellation suppresses declarative publication and future writes; it never rolls back legacy live emissions.
  return{acceptHouse,acceptDoor,mergeDoorsOnce,sealSpots,snapshot,checkLinks,resolveBuilding,cancel,get phase(){return phase;}};
}
