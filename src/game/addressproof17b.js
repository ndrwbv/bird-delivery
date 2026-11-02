/* Bounded data-only diagnostic consumer. It never reads live houses or starts a shift. */
const need=(yes,code)=>{if(!yes)throw Error('address-proof17b:'+code);};
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const ID_KEYS=['mapId','mapHash','editsHash','sourceHash','inputHash'];
function checkIdentity(value){
  need(value&&typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null),'IDENTITY');
  const keys=Reflect.ownKeys(value);need(keys.length===ID_KEYS.length&&keys.every(k=>ID_KEYS.includes(k)),'IDENTITY_FIELDS');
  for(const key of ID_KEYS){const d=Object.getOwnPropertyDescriptor(value,key);need(d&&Object.hasOwn(d,'value')&&d.enumerable,'IDENTITY_DATA');}
  need(typeof value.mapId==='string'&&/^[a-z0-9_-]{1,64}$/.test(value.mapId)&&ID_KEYS.slice(1).every(k=>hash(value[k])),'IDENTITY_VALUE');
}
const number=n=>{need(Number.isFinite(n),'FINITE');const b=new Uint8Array(8);new DataView(b.buffer).setFloat64(0,n,true);return['number',Array.from(b,v=>v.toString(16).padStart(2,'0')).join('')];};
const exact=value=>{
  if(value===null)return['null'];
  if(typeof value==='number')return number(value);
  if(typeof value==='string'||typeof value==='boolean')return[typeof value,value];
  if(Array.isArray(value))return['array',value.map(exact)];
  return['object',Object.keys(value).map(key=>[key,exact(value[key])])];
};
function decodeQueries(encoded){
  let nodes=0;
  function read(row,depth=0){
    need(++nodes<=600000&&depth<=12&&Array.isArray(row),'QUERY_BUDGET');
    const[type,data]=row;
    if(type==='number'){
      need(row.length===2&&typeof data==='string'&&/^[a-f0-9]{16}$/.test(data),'NUMBER_ENCODING');
      const b=Uint8Array.from(data.match(/../g),s=>parseInt(s,16)),n=new DataView(b.buffer).getFloat64(0,true);need(Number.isFinite(n),'FINITE');return n;
    }
    if(type==='string'){need(row.length===2&&typeof data==='string'&&data.length<=1024,'STRING');return data;}
    if(type==='array'){need(row.length===2&&Array.isArray(data)&&data.length<=60000,'ARRAY');return data.map(v=>read(v,depth+1));}
    if(type==='object'){
      need(row.length===2&&Array.isArray(data)&&data.length===2,'OBJECT');
      need(data.every(pair=>Array.isArray(pair)&&pair.length===2&&['addresses','levels'].includes(pair[0]))&&new Set(data.map(p=>p[0])).size===2,'QUERY_FIELDS');
      return Object.fromEntries(data.map(([key,value])=>[key,read(value,depth+1)]));
    }
    throw Error('address-proof17b:TYPE');
  }
  const value=read(encoded);
  need(value&&Array.isArray(value.addresses)&&Array.isArray(value.levels)&&value.addresses.length+2*value.levels.length<=60000,'QUERY_COUNT');
  for(const row of [...value.addresses,...value.levels])need(Array.isArray(row)&&row.length===4&&typeof row[0]==='string'&&row[0].length<=64&&Number.isSafeInteger(row[1])&&Number.isFinite(row[2])&&Number.isFinite(row[3]),'QUERY_ROW');
  return value;
}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
export function captureEarlyAddressQueries17b({provider,identity,input}){
  need(input&&input.version===1&&hash(input.sourceRawSha256),'INPUT');
  checkIdentity(identity);checkIdentity(input.identity);
  need(ID_KEYS.every(k=>input.identity[k]===identity[k]),'IDENTITY');
  const queries=decodeQueries(input.fixedQueriesExact);
  // Six bytes per UTF-16 unit bounds both JSON escaping and UTF-8 expansion. Charge
  // each row BEFORE materializing exact output; never build a huge string to test its size.
  const ceiling=32*1024*1024;let chargedBytes=4096;
  const charge=n=>{need(Number.isSafeInteger(n)&&n>=0&&chargedBytes+n<=ceiling,'SNAPSHOT_BUDGET');chargedBytes+=n;};
  const addresses=[],levels=[];
  for(const[kind,index,x,z]of queries.addresses){
    charge(512+6*kind.length);const actual=provider.queryAddress(x,z);
    need(typeof actual==='string'&&actual.length<=16384,'ADDRESS_STRING');charge(actual.length*6);
    addresses.push({kind,index,x,z,actual});
  }
  for(const[kind,index,x,z]of queries.levels){
    charge(512+6*kind.length);const actual=provider.queryEntranceLevel(x,z);need(Number.isFinite(actual),'LEVEL_NUMBER');
    levels.push({kind,index,x,z,actual});
  }
  const queriesExact=exact({addresses,levels});
  return freeze({version:1,sourceRawSha256:input.sourceRawSha256,identity:{...identity},counts:{addresses:addresses.length,levels:levels.length},queriesExact,budget:{chargedBytes,ceiling,kind:'conservative JSON/UTF8 upper bound; not measured RAM'}});
}
