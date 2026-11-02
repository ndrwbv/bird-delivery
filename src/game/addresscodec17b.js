/* Owned address scalars only. CRC is corruption detection; external provenance must bind a trusted file SHA. */
import {crc32} from './landcache17a/checkpoint-codec.js';
const MAGIC=Uint8Array.from([66,49,55,65,68,68,82,0]),VERSION=1,PREFIX=28,NONE=0xffffffff;
export const ADDRESS_CATALOG_LIMITS=Object.freeze({maxFileBytes:16*1024*1024,maxHeaderBytes:65536,maxPayloadBytes:16*1024*1024,maxBuildings:100000,maxHouses:50000,maxGeneratedDoors:200000,maxRawEntrances:100000,maxDoors:300000,maxSpots:200000,maxStrings:250000,maxStringBytes:16384,maxStringTableBytes:8*1024*1024,maxWorkingBytes:64*1024*1024});
const ROOT=['version','buildingCount','rawEntranceCount','houses','houseLinks','generatedDoors','doorLinks','entrances','spots'];
const HOUSE=['x','z','mx','mz','addr','name','lv'],HF=['x','z','mx','mz','lv'];
const COUNT_KEYS=['buildings','houses','generatedDoors','rawEntrances','doors','spots','strings','stringBytes'];
const BLOCKS=[['houses',65,'houses'],['doors',32,'doors'],['rawDoorIDs',4,'rawEntrances'],['generated',22,'generatedDoors'],['spots',16,'spots'],['stringOffsets',4,'strings'],['stringBytes',1,'stringBytes']];
const need=(ok,code)=>{if(!ok)throw Error('addresscodec17b:'+code);};
const plain=v=>v&&Object.getPrototypeOf(v)===Object.prototype;
const uint=(v,max)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=0&&v<=max;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
function fields(v,keys,code){need(plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)),'FIELDS_'+code);for(const k of keys)need(Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value'),'FIELDS_'+code);}
function array(v,max,code){need(Array.isArray(v)&&uint(v.length,max),'COUNT_'+code);need(Reflect.ownKeys(v).length===v.length+1,'ARRAY_'+code);for(let i=0;i<v.length;i++)need(Object.hasOwn(Object.getOwnPropertyDescriptor(v,i)||{},'value'),'ARRAY_'+code);}
function identityOf(v){const keys=['mapId','mapHash','editsHash','sourceHash','inputHash'];fields(v,keys,'IDENTITY');need(typeof v.mapId==='string'&&/^[a-z0-9_-]{1,64}$/.test(v.mapId),'IDENTITY');for(const k of keys.slice(1))need(typeof v[k]==='string'&&/^[a-f0-9]{64}$/.test(v[k]),'IDENTITY');return Object.fromEntries(keys.map(k=>[k,v[k]]));}
function limitsOf(value={}){need(plain(value),'LIMITS');const out={...ADDRESS_CATALOG_LIMITS};for(const k of Reflect.ownKeys(value)){need(typeof k==='string'&&Object.hasOwn(out,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value')&&uint(value[k],out[k]),'LIMITS');out[k]=value[k];}return out;}
function budget(c,L,wireBytes=0,complete=true){
 need(uint(wireBytes,L.maxFileBytes),'FILE_BUDGET');
 fields(c,COUNT_KEYS,'COUNTS');
 for(const [k,limit]of [['buildings','maxBuildings'],['houses','maxHouses'],['generatedDoors','maxGeneratedDoors'],['rawEntrances','maxRawEntrances'],['doors','maxDoors'],['spots','maxSpots'],['strings','maxStrings'],['stringBytes','maxStringTableBytes']])need(uint(c[k],L[limit]),'COUNT_BUDGET');
 need(c.houses<=c.buildings&&(!complete||c.doors>=c.generatedDoors&&c.doors<=c.rawEntrances+c.generatedDoors),'COUNTS');
 // Structural allocation charge, including validation maps/sets and owned output. Not measured JS heap/RSS/Deck RAM.
 const charge=wireBytes*2+c.buildings*16+c.houses*384+c.generatedDoors*256+c.rawEntrances*48+c.doors*192+c.spots*160+c.strings*96+c.stringBytes*4;
 need(Number.isSafeInteger(charge)&&charge<=L.maxWorkingBytes,'WORKING_BUDGET');
}
function layout(c,L){budget(c,L);let at=0;const blocks=BLOCKS.map(([name,rowBytes,key])=>{const count=c[key]+(name==='stringOffsets'?1:0),bytes=count*rowBytes,block={name,rowBytes,count,offset:at,bytes};at+=bytes;return block;});need(Number.isSafeInteger(at)&&at<=L.maxPayloadBytes,'PAYLOAD_BUDGET');return{blocks,bodyBytes:at};}
function access(body,blocks){const v=new DataView(body.buffer,body.byteOffset,body.byteLength),by=Object.fromEntries(blocks.map(b=>[b.name,b]));return{v,at:(name,row=0,offset=0)=>by[name].offset+row*by[name].rowBytes+offset};}
const decoder=()=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
function validate(body,c,blocks,L){
 const {v,at}=access(body,blocks),strings=[],seenStrings=new Set();let previous=0;
 need(v.getUint32(at('stringOffsets'),true)===0,'STRING_OFFSETS');
 for(let i=0;i<c.strings;i++){
  const end=v.getUint32(at('stringOffsets',i+1),true);need(end>=previous&&end<=c.stringBytes&&end-previous<=L.maxStringBytes,'STRING_OFFSETS');
  let text;try{text=decoder().decode(body.subarray(at('stringBytes')+previous,at('stringBytes')+end));}catch{need(false,'STRING_UTF8');}
  need(!seenStrings.has(text),'DUPLICATE_STRING');seenStrings.add(text);strings.push(text);previous=end;
 }
 need(previous===c.stringBytes,'STRING_OFFSETS');
 const usedStrings=new Set(),usedDoors=new Set(),houseBuildings=new Set(),sourceIDs=new Map();let nextString=0,nextDoor=0;
 function str(id){need(uint(id,c.strings-1),'STRING_REFERENCE');if(!usedStrings.has(id)){need(id===nextString++,'STRING_ORDER');usedStrings.add(id);}return strings[id];}
 function link(name,i,offset){
  const p=at(name,i,offset),building=v.getUint32(p,true),tag=v.getUint8(p+4),number=v.getFloat64(p+5,true),sid=v.getUint32(p+13,true);
  need(uint(building,c.buildings-1),'BUILDING_REFERENCE');need(tag<=2,'SOURCE_TAG');
  let sourceId=null;
  if(tag===1){need(finite(number)&&sid===NONE,'SOURCE_VALUE');sourceId=number;}
  else{need(Object.is(number,0),'SOURCE_VALUE');if(tag===2)sourceId=str(sid);else need(sid===NONE,'SOURCE_VALUE');}
  if(sourceIDs.has(building))need(Object.is(sourceIDs.get(building),sourceId),'SOURCE_ID_MISMATCH');else sourceIDs.set(building,sourceId);
  return{building,sourceId};
 }
 function door(id,generated){need(uint(id,c.doors-1),'DOOR_REFERENCE');if(usedDoors.has(id))need(!generated,'GENERATED_ALIAS');else{need(id===nextDoor++,'DOOR_ORDER');usedDoors.add(id);}}
 for(let i=0;i<c.houses;i++){
  for(let j=0;j<5;j++)need(finite(v.getFloat64(at('houses',i,j*8),true)),'NON_FINITE');
  str(v.getUint32(at('houses',i,40),true));str(v.getUint32(at('houses',i,44),true));
  const {building}=link('houses',i,48);need(!houseBuildings.has(building),'DUPLICATE_HOUSE_BUILDING');houseBuildings.add(building);
 }
 for(let i=0;i<c.doors;i++)for(let j=0;j<4;j++)need(finite(v.getFloat64(at('doors',i,j*8),true)),'NON_FINITE');
 for(let i=0;i<c.rawEntrances;i++)door(v.getUint32(at('rawDoorIDs',i),true),false);
 for(let i=0;i<c.generatedDoors;i++){door(v.getUint32(at('generated',i),true),true);link('generated',i,4);need(v.getUint8(at('generated',i,21))<=1,'GRAND_FLAG');}
 for(let i=0;i<c.spots;i++)for(let j=0;j<2;j++)need(finite(v.getFloat64(at('spots',i,j*8),true)),'NON_FINITE');
 need(nextString===c.strings&&nextDoor===c.doors,'UNUSED_TABLE');return{strings,v,at};
}

export function encodeAddressCatalog(catalog,identity,{limits={}}={}){
 const id=identityOf(identity),L=limitsOf(limits);fields(catalog,ROOT,'CATALOG');need(catalog.version===VERSION,'CATALOG_VERSION');
 need(uint(catalog.buildingCount,L.maxBuildings)&&uint(catalog.rawEntranceCount,L.maxRawEntrances),'COUNT_BUDGET');
 array(catalog.houses,L.maxHouses,'HOUSES');array(catalog.houseLinks,L.maxHouses,'HOUSE_LINKS');array(catalog.generatedDoors,L.maxGeneratedDoors,'GENERATED');array(catalog.doorLinks,L.maxGeneratedDoors,'DOOR_LINKS');array(catalog.entrances,L.maxRawEntrances+L.maxGeneratedDoors,'ENTRANCES');array(catalog.spots,L.maxSpots,'SPOTS');
 const c={buildings:catalog.buildingCount,houses:catalog.houses.length,generatedDoors:catalog.generatedDoors.length,rawEntrances:catalog.rawEntranceCount,doors:0,spots:catalog.spots.length,strings:0,stringBytes:0};
 need(catalog.houseLinks.length===c.houses&&catalog.doorLinks.length===c.generatedDoors&&catalog.entrances.length===c.rawEntrances+c.generatedDoors,'ROW_COUNTS');budget(c,L,0,false);
 const doors=[],doorIDs=new Map(),prefixIDs=[],generatedIDs=[];
 function addDoor(row){array(row,4,'DOOR');need(row.length===4&&row.every(finite),'DOOR_VALUES');if(!doorIDs.has(row)){need(doors.length<L.maxDoors,'COUNT_BUDGET');doorIDs.set(row,doors.length);doors.push(row);c.doors++;budget(c,L,0,false);}return doorIDs.get(row);}
 for(let i=0;i<c.rawEntrances;i++)prefixIDs.push(addDoor(catalog.entrances[i]));
 for(let i=0;i<c.generatedDoors;i++){const row=catalog.generatedDoors[i];need(catalog.entrances[c.rawEntrances+i]===row&&!doorIDs.has(row),'GENERATED_ALIAS');generatedIDs.push(addDoor(row));}
 const strings=new Map(),chunks=[],offsets=[0],encoder=new TextEncoder();
 function intern(text){
  need(typeof text==='string'&&text.length<=L.maxStringBytes,'STRING_BUDGET');if(strings.has(text))return strings.get(text);
  need(strings.size<L.maxStrings,'STRING_BUDGET');const bytes=encoder.encode(text);need(bytes.length<=L.maxStringBytes&&c.stringBytes+bytes.length<=L.maxStringTableBytes,'STRING_BUDGET');
  need(decoder().decode(bytes)===text,'STRING_UTF8');const index=strings.size;strings.set(text,index);chunks.push(bytes);c.strings++;c.stringBytes+=bytes.length;offsets.push(c.stringBytes);budget(c,L);return index;
 }
 function source(row,grand){fields(row,grand?['building','sourceId','grand']:['building','sourceId'],'LINK');need(uint(row.building,c.buildings-1),'BUILDING_REFERENCE');need(row.sourceId===null||finite(row.sourceId)||typeof row.sourceId==='string','SOURCE_VALUE');if(typeof row.sourceId==='string')intern(row.sourceId);if(grand)need(typeof row.grand==='boolean','GRAND_FLAG');}
 const houseRows=new Set(),spotRows=new Set();
 for(let i=0;i<c.houses;i++){const row=catalog.houses[i];fields(row,HOUSE,'HOUSE');need(HF.every(k=>finite(row[k]))&&!houseRows.has(row),'HOUSE_VALUES');houseRows.add(row);intern(row.addr);intern(row.name);source(catalog.houseLinks[i],false);}
 for(const row of catalog.doorLinks)source(row,true);
 for(const row of catalog.spots){fields(row,['x','z'],'SPOT');need(finite(row.x)&&finite(row.z)&&!spotRows.has(row),'SPOT_VALUES');spotRows.add(row);}
 const {blocks,bodyBytes}=layout(c,L),header=encoder.encode(JSON.stringify({version:VERSION,kind:'addresscatalog',identity:id,counts:c,blocks}));
 need(header.length>0&&header.length<=L.maxHeaderBytes,'HEADER_BUDGET');const size=PREFIX+header.length+bodyBytes;budget(c,L,size);
 const bytes=new Uint8Array(size),p=new DataView(bytes.buffer);bytes.set(MAGIC);bytes.set(header,PREFIX);const body=bytes.subarray(PREFIX+header.length),{v,at}=access(body,blocks);
 function putLink(name,i,offset,row){const p=at(name,i,offset),value=row.sourceId,tag=value===null?0:typeof value==='number'?1:2;v.setUint32(p,row.building,true);v.setUint8(p+4,tag);v.setFloat64(p+5,tag===1?value:0,true);v.setUint32(p+13,tag===2?strings.get(value):NONE,true);}
 for(let i=0;i<c.houses;i++){const row=catalog.houses[i];for(let j=0;j<5;j++)v.setFloat64(at('houses',i,j*8),row[HF[j]],true);v.setUint32(at('houses',i,40),strings.get(row.addr),true);v.setUint32(at('houses',i,44),strings.get(row.name),true);putLink('houses',i,48,catalog.houseLinks[i]);}
 for(let i=0;i<c.doors;i++)for(let j=0;j<4;j++)v.setFloat64(at('doors',i,j*8),doors[i][j],true);
 for(let i=0;i<c.rawEntrances;i++)v.setUint32(at('rawDoorIDs',i),prefixIDs[i],true);
 for(let i=0;i<c.generatedDoors;i++){v.setUint32(at('generated',i),generatedIDs[i],true);putLink('generated',i,4,catalog.doorLinks[i]);v.setUint8(at('generated',i,21),catalog.doorLinks[i].grand?1:0);}
 for(let i=0;i<c.spots;i++){v.setFloat64(at('spots',i),catalog.spots[i].x,true);v.setFloat64(at('spots',i,8),catalog.spots[i].z,true);}
 for(let i=0;i<offsets.length;i++)v.setUint32(at('stringOffsets',i),offsets[i],true);let offset=at('stringBytes');for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
 validate(body,c,blocks,L);p.setUint32(8,VERSION,true);p.setUint32(12,header.length,true);p.setUint32(16,bodyBytes,true);p.setUint32(20,crc32(header),true);p.setUint32(24,crc32(body),true);return bytes;
}

export function decodeAddressCatalog(bytes,identity,{limits={}}={}){
 const expected=identityOf(identity),L=limitsOf(limits);need(bytes instanceof Uint8Array&&bytes.length>=PREFIX,'TRUNCATED');need(bytes.length<=L.maxFileBytes,'FILE_BUDGET');
 need(!(typeof SharedArrayBuffer==='function'&&bytes.buffer instanceof SharedArrayBuffer)&&!bytes.buffer.resizable,'SHARED_OR_RESIZABLE_INPUT');
 const p=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);for(let i=0;i<8;i++)need(bytes[i]===MAGIC[i],'MAGIC');need(p.getUint32(8,true)===VERSION,'VERSION');
 const n=p.getUint32(12,true),m=p.getUint32(16,true);need(n>0&&n<=L.maxHeaderBytes,'HEADER_BUDGET');need(m<=L.maxPayloadBytes,'PAYLOAD_BUDGET');need(PREFIX+n+m===bytes.length,'WIRE_LENGTH');
 const hbytes=bytes.subarray(PREFIX,PREFIX+n),body=bytes.subarray(PREFIX+n);need(crc32(hbytes)===p.getUint32(20,true),'HEADER_CRC');let h;
 try{h=JSON.parse(decoder().decode(hbytes));}catch{need(false,'HEADER_JSON');}
 fields(h,['version','kind','identity','counts','blocks'],'HEADER');need(h.version===VERSION&&h.kind==='addresscatalog','VERSION');const actual=identityOf(h.identity);need(Object.keys(expected).every(k=>expected[k]===actual[k]),'IDENTITY_MISMATCH');
 const plan=layout(h.counts,L);budget(h.counts,L,bytes.length);need(plan.bodyBytes===m&&Array.isArray(h.blocks)&&h.blocks.length===BLOCKS.length,'BLOCK_LAYOUT');
 for(let i=0;i<BLOCKS.length;i++){fields(h.blocks[i],['name','rowBytes','count','offset','bytes'],'BLOCK');for(const k of ['name','rowBytes','count','offset','bytes'])need(Object.is(h.blocks[i][k],plan.blocks[i][k]),'BLOCK_LAYOUT');}
 need(crc32(body)===p.getUint32(24,true),'BODY_CRC');const c=h.counts,{strings,v,at}=validate(body,c,h.blocks,L);
 // All CRC, table, numeric, ordinal/sourceId and alias checks finish before output publication/hydration.
 const doors=[];for(let i=0;i<c.doors;i++)doors.push(Object.freeze([0,1,2,3].map(j=>v.getFloat64(at('doors',i,j*8),true))));
 function link(name,i,offset,grand=false){const p=at(name,i,offset),tag=v.getUint8(p+4),row={building:v.getUint32(p,true),sourceId:tag===0?null:tag===1?v.getFloat64(p+5,true):strings[v.getUint32(p+13,true)]};if(grand)row.grand=!!v.getUint8(at(name,i,21));return Object.freeze(row);}
 const houses=[],houseLinks=[],generatedDoors=[],doorLinks=[],entrances=[],spots=[];
 for(let i=0;i<c.houses;i++){houses.push(Object.freeze({x:v.getFloat64(at('houses',i),true),z:v.getFloat64(at('houses',i,8),true),mx:v.getFloat64(at('houses',i,16),true),mz:v.getFloat64(at('houses',i,24),true),addr:strings[v.getUint32(at('houses',i,40),true)],name:strings[v.getUint32(at('houses',i,44),true)],lv:v.getFloat64(at('houses',i,32),true)}));houseLinks.push(link('houses',i,48));}
 for(let i=0;i<c.rawEntrances;i++)entrances.push(doors[v.getUint32(at('rawDoorIDs',i),true)]);
 for(let i=0;i<c.generatedDoors;i++){const row=doors[v.getUint32(at('generated',i),true)];generatedDoors.push(row);entrances.push(row);doorLinks.push(link('generated',i,4,true));}
 for(let i=0;i<c.spots;i++)spots.push(Object.freeze({x:v.getFloat64(at('spots',i),true),z:v.getFloat64(at('spots',i,8),true)}));
 return Object.freeze({version:VERSION,buildingCount:c.buildings,rawEntranceCount:c.rawEntrances,houses:Object.freeze(houses),houseLinks:Object.freeze(houseLinks),generatedDoors:Object.freeze(generatedDoors),doorLinks:Object.freeze(doorLinks),entrances:Object.freeze(entrances),spots:Object.freeze(spots)});
}
