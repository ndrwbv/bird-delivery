/* Isolated early-input key. No world/Store/platform imports, scheduling, clocks, RNG or publication.
   The caller supplies a pre-buildCity data port and ALL native storage names after bootstrap.
   This is a conservative candidate key; only a separately verified catalog identity can be a hit. */
import {KNOWN,DEFAULT_KEEP,SHARED} from './singleprogress.js';
import {Sha256} from './landcache17a/sha256.js';

const MAX_BYTES=16*1024*1024,MAX_WORKING=64*1024*1024,MAX_ITEMS=1000000,MAX_DEPTH=32;
const SERVICES=new Set(['dlv-profiles','dlv-lb-local','dlv-__ts','dlv-crashlog','dlv-trans',
  'dlv-tel','dlv-tel-id','dlv-tel-q','dlv-tel-t0','dlv-tel-once','dlv-tel-last','dlv-tel-ver','dlv-tel-crash-at']);
const service=k=>SERVICES.has(k)||/^dlv-single-/.test(k)||/^dlv-p\d+-/.test(k);
const PROGRESS_KEYS=Object.freeze([...new Set([...KNOWN,...DEFAULT_KEEP,...SHARED])].filter(k=>!service(k)).sort());
const ALLOWED=new Set(PROGRESS_KEYS),CAR_KEYS=['dlv-car-owned','dlv-car-cur','dlv-car-up','dlv-car-L','dlv-car-paint','dlv-car-eng'];
const need=(yes,reason)=>{if(!yes)throw Error(reason);};
const miss=error=>({eligible:false,reason:String(error?.message||error)});
const plain=o=>!!o&&(Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);
function fields(o,nonenumerable=[]){need(plain(o),'plain-object');const keys=Reflect.ownKeys(o);need(keys.every(k=>typeof k==='string'),'symbol-field');for(const k of keys){const d=Object.getOwnPropertyDescriptor(o,k);need(d&&Object.hasOwn(d,'value'),'accessor-field');need(d.enumerable||nonenumerable.includes(k),'nonenumerable-field');}return keys;}
function shape(o,names){const keys=fields(o);need(keys.length===names.length&&names.every(k=>keys.includes(k)),'shape');return o;}
const data=(o,k)=>{const d=Object.getOwnPropertyDescriptor(o,k);need(d&&Object.hasOwn(d,'value'),'missing-data:'+k);return d.value;};
const ownSet=(o,k,v)=>Object.defineProperty(o,k,{value:v,enumerable:true,writable:true,configurable:true});
const indexKey=(k,length)=>/^(0|[1-9]\d*)$/.test(k)&&Number(k)<length;
function arrayFields(a){need(Array.isArray(a)&&Object.getPrototypeOf(a)===Array.prototype,'plain-array');const keys=Reflect.ownKeys(a);need(keys.every(k=>typeof k==='string'),'symbol-field');for(const k of keys){const d=Object.getOwnPropertyDescriptor(a,k);need(d&&Object.hasOwn(d,'value'),'accessor-field');need(k==='length'||d.enumerable,'nonenumerable-field');}return keys;}
function budget(){return{items:0,working:65536,node(n=1){this.items+=n;need(this.items<=MAX_ITEMS,'items-limit');},charge(n){this.working+=n;need(this.working<=MAX_WORKING,'working-limit');},temporary(n){need(this.working+n<=MAX_WORKING,'working-limit');}};}

// Preserve property enumeration order inside raw data: callers must not silently canonicalize
// an order that an unreviewed game consumer could observe. Only schema/progress/query order is fixed.
function clone(value,B,active=new WeakSet(),depth=0){
  need(depth<=MAX_DEPTH,'depth-limit');B.node();
  if(value===null||value===undefined||typeof value==='boolean')return value;
  if(typeof value==='number'){need(Number.isFinite(value),'nonfinite');B.charge(8);return value;}
  if(typeof value==='string'){need(value.length<=MAX_BYTES/2,'bytes-limit');B.charge(16+value.length*2);return value;}
  need(typeof value==='object'&&!ArrayBuffer.isView(value),'nondata');need(!active.has(value),'cycle');active.add(value);
  try{
    if(Array.isArray(value)){
      need(value.length<=MAX_ITEMS-B.items,'items-limit');B.charge(32+value.length*8);const out=[];
      const keys=arrayFields(value);
      for(let i=0;i<value.length;i++){need(Object.hasOwn(value,i),'array-hole');out.push(clone(data(value,String(i)),B,active,depth+1));}
      for(const k of keys)if(k!=='length'&&!indexKey(k,value.length)){B.charge(k.length*2+16);ownSet(out,k,clone(data(value,k),B,active,depth+1));}
      return out;
    }
    const keys=fields(value),out=Object.create(null);B.charge(64+keys.length*16);
    for(const k of keys){B.charge(k.length*2);ownSet(out,k,clone(data(value,k),B,active,depth+1));}return out;
  }finally{active.delete(value);}
}
function freeze(o){if(o&&typeof o==='object'){for(const k of Object.keys(o))freeze(o[k]);Object.freeze(o);}return o;}

/** get is Platform.store.get (decoded physical values), NOT game's null-coalescing Store wrapper.
    keys must enumerate every actual native key; filtering unknown dlv-* names upstream is unsafe. */
export function captureAddressProgress17b(args){
  try{
    shape(args,['get','keys']);const get=data(args,'get'),keys=data(args,'keys');need(typeof get==='function'&&Array.isArray(keys),'progress-port');
    const B=budget(),native=new Set();need(keys.length<=MAX_ITEMS,'items-limit');need(arrayFields(keys).length===keys.length+1,'progress-keys');
    for(let i=0;i<keys.length;i++){const k=data(keys,String(i));need(typeof k==='string'&&k.length<=1024,'progress-key');need(!native.has(k),'duplicate-progress-key');native.add(k);if(k.startsWith('dlv-')&&!service(k))need(ALLOWED.has(k),'unknown-progress-key:'+k);}
    const values=Object.create(null),presentKeys=[];
    for(const key of PROGRESS_KEYS){let value;try{value=get(key,undefined);}catch{throw Error('progress-read:'+key);}ownSet(values,key,clone(value,B));if(native.has(key))presentKeys.push(key);}
    return freeze({eligible:true,version:1,values,presentKeys});
  }catch(error){return miss(error);}
}

const typedPrototype=Object.getPrototypeOf(Uint8Array.prototype);
const typedLength=Object.getOwnPropertyDescriptor(typedPrototype,'length').get;
const typedBuffer=Object.getOwnPropertyDescriptor(typedPrototype,'buffer').get;
function typed(a,type,B){
  need(a&&Object.getPrototypeOf(a)===type.prototype,'typed-array');
  const n=typedLength.call(a),buffer=typedBuffer.call(a);need(buffer instanceof ArrayBuffer,'shared-or-detached-buffer');
  need(n<=MAX_BYTES,'bytes-limit');B.temporary(n*24);need(Reflect.ownKeys(a).length===n,'typed-extra-field');return n;
}
class Writer{
  constructor(){this.hash=new Sha256();this.a=new Uint8Array(65536);this.v=new DataView(this.a.buffer);this.at=0;this.total=0;}
  room(n){need(this.total+n<=MAX_BYTES,'bytes-limit');if(this.at+n>this.a.length)this.flush();this.total+=n;}
  flush(){if(this.at){this.hash.update(this.a.subarray(0,this.at));this.at=0;}}
  u8(n){this.room(1);this.a[this.at++]=n;}
  u32(n){need(Number.isSafeInteger(n)&&n>=0&&n<=0xffffffff,'count');this.room(4);this.v.setUint32(this.at,n,true);this.at+=4;}
  number(n){need(typeof n==='number'&&Number.isFinite(n),'nonfinite');this.room(8);this.v.setFloat64(this.at,n,true);this.at+=8;}
  string(s){this.u32(s.length);need(this.total+s.length*2<=MAX_BYTES,'bytes-limit');for(let i=0;i<s.length;i++){this.room(2);this.v.setUint16(this.at,s.charCodeAt(i),true);this.at+=2;}}
  value(x){
    if(x===undefined){this.u8(0);return;}if(x===null){this.u8(1);return;}
    if(typeof x==='boolean'){this.u8(x?3:2);return;}if(typeof x==='number'){this.u8(4);this.number(x);return;}
    if(typeof x==='string'){this.u8(5);this.string(x);return;}
    if(Array.isArray(x)){this.u8(6);this.u32(x.length);for(const v of x)this.value(v);const extra=Object.keys(x).filter(k=>!indexKey(k,x.length));this.u32(extra.length);for(const k of extra){this.string(k);this.value(x[k]);}return;}
    this.u8(7);const keys=Object.keys(x);this.u32(keys.length);for(const k of keys){this.string(k);this.value(x[k]);}
  }
  f32(a,n){this.u8(8);this.u32(n);for(let i=0;i<n;i++){need(Number.isFinite(a[i]),'nonfinite');this.room(4);this.v.setFloat32(this.at,a[i],true);this.at+=4;}}
  bytes(a,n){this.u8(9);this.u32(n);need(this.total+n<=MAX_BYTES,'bytes-limit');this.flush();this.hash.update(a);this.total+=n;}
  end(){this.flush();return this.hash.hex();}
}

function progressSnapshot(input,B){
  shape(input,['eligible','version','values','presentKeys']);need(input.eligible===true&&input.version===1,'progress-capture');
  const values=data(input,'values');shape(values,PROGRESS_KEYS);const present=clone(data(input,'presentKeys'),B);
  need(Array.isArray(present)&&new Set(present).size===present.length&&present.every((k,i)=>ALLOWED.has(k)&&(!i||present[i-1]<k)),'progress-presence');
  const own=Object.create(null);for(const k of PROGRESS_KEYS)ownSet(own,k,clone(data(values,k),B));return{values:own,presentKeys:present};
}
function roadRows(roads,B){
  need(Array.isArray(roads),'roads');const out=[];B.node(roads.length);B.charge(roads.length*8);need(arrayFields(roads).length===roads.length+1,'road-array-extra');
  for(let i=0;i<roads.length;i++){const road=data(roads,String(i)),row=Object.create(null);for(const k of fields(road,['nodes'])){if(k==='nodes')continue;ownSet(row,k,clone(data(road,k),B));}need(Array.isArray(row.p)&&row.p.length>=2&&Number.isFinite(row.c),'road-shape');out.push(row);}return out;
}
function points(rows,min){for(const row of rows){need(Array.isArray(row)&&row.length>=min,'points');for(const p of row)need(Array.isArray(p)&&p.length>=2&&typeof p[0]==='number'&&typeof p[1]==='number','point');}}

const FRESH_DIAGNOSTICS=new Set(['mute','debug','nolb','startuptrace','addressclosure17b','addressexport17b','addresspackage17b=1']);
const FRESH_ZERO=new Set(['dlv-msk-wallet','dlv-msk-best','dlv-msk-xp','dlv-msk-col','dlv-shifts','dlv-stars','dlv-don-trash','dlv-don-gang','dlv-district','dlv-delivered']);
const nil=value=>value===undefined||value===null;
function freshProgress(initial,progress){
  const v=progress.values;
  need(initial.district.current===0&&initial.district.opened===1&&initial.district.city===false,'unsupported-fresh-district');
  // cityopen.repair runs later and debug disables it. These exact states give it no work.
  for(const k of ['dlv-city-party','dlv-city-mode'])need(nil(v[k])||v[k]===false||v[k]===0,'unsupported-fresh-repair:'+k);
  need(v['dlv-dist-open']===undefined||v['dlv-dist-open']===1,'unsupported-fresh-open');
  need(initial.season.saved===null||initial.season.saved===undefined,'unsupported-fresh-season');
  need(CAR_KEYS.every(k=>nil(initial.car.inputs[k])&&nil(v[k])),'unsupported-fresh-car');
  need(v['dlv-money-x8']===1&&progress.presentKeys.includes('dlv-money-x8'),'unsupported-fresh-money-version');
  for(const k of KNOWN){
    if(CAR_KEYS.includes(k)||k==='dlv-city-party'||k==='dlv-city-mode'||k==='dlv-dist-open')continue;
    const value=v[k];
    if(k==='dlv-name'){need(value===undefined||value==='Женя','unsupported-fresh-progress:'+k);continue;}
    if(FRESH_ZERO.has(k)){need(value===undefined||value===0,'unsupported-fresh-progress:'+k);continue;}
    if(k==='dlv-season'){need(nil(value),'unsupported-fresh-progress:'+k);continue;}
    if(k==='dlv-dist-shifts'){need(value===undefined||Array.isArray(value)&&value.length<=8&&value.every(n=>n===0),'unsupported-fresh-progress:'+k);continue;}
    need(value===undefined,'unsupported-fresh-progress:'+k);
  }
}
function orderedEntries(raw){return[...new URLSearchParams(raw)].map((row,index)=>({row,index})).sort((a,b)=>a.row[0]<b.row[0]?-1:a.row[0]>b.row[0]?1:a.index-b.index).map(v=>v.row);}
function freshQuery(raw){
  // Match literal ASCII tokens BEFORE decoding. Encoded/case/value/world variants are retained.
  const body=raw.startsWith('?')?raw.slice(1):raw;
  const normalized=body.split('&').filter(token=>!FRESH_DIAGNOSTICS.has(token)).join('&');
  need(normalized==='','unsupported-fresh-query');
  return{normalization:'fresh-diagnostics-v1',raw:normalized,entries:orderedEntries(normalized)};
}

/** city is an explicit port, not a scene-bearing CITY clone:
    {roads,buildings,entrances,paths,lots,terrain:{g,nx,nz,x0,z0},roadFacts:{widths,drivable}}.
    width/drivable arrays MUST be computed by the actual game helpers, in original road order. */
export function captureAddressInput17b(args){
  try{
    shape(args,['base','city','terrainHeights','borderMask','initial','progress','query']);const B=budget();
    const rawBase=data(args,'base');shape(rawBase,['mapId','mapHash','editsHash','sourceHash']);
    const base={mapId:data(rawBase,'mapId'),mapHash:data(rawBase,'mapHash'),editsHash:data(rawBase,'editsHash'),sourceHash:data(rawBase,'sourceHash')};
    need(base.mapId==='seversk'&&['mapHash','editsHash','sourceHash'].every(k=>typeof base[k]==='string'&&/^[0-9a-f]{64}$/.test(base[k])),'base');
    const rawInitial=data(args,'initial');shape(rawInitial,['phase','at','mapId','mode','adult','career','intro','editor','language','season','donation','district','car','graphics','ordinary']);
    need(Number.isFinite(data(rawInitial,'at'))&&data(rawInitial,'at')>=0,'initial-at');
    const initial=Object.create(null);for(const k of Object.keys(rawInitial))if(k!=='at')ownSet(initial,k,clone(data(rawInitial,k),B));
    shape(initial.season,['value','forced','saved']);shape(initial.donation,['trashRaw','trashGoal','trashFraction']);shape(initial.district,['current','opened','city']);shape(initial.car,['id','inputs']);shape(initial.car.inputs,CAR_KEYS);shape(initial.graphics,['preset','device']);shape(initial.ordinary,['provider','ordinaryAtImport','hookOwned','baseSeed']);
    need(initial.phase==='before-city-syncBuild'&&initial.mapId===base.mapId&&initial.mode==='steam'&&initial.adult===true&&initial.career===true&&initial.intro===false&&initial.editor===false&&initial.language==='ru','unsupported-runtime');
    need(['mid','high'].includes(initial.graphics.preset)&&initial.graphics.device==='deck'&&initial.car.id==='semerka'&&initial.district.current===0&&initial.district.city===false,'unsupported-slot');
    need(initial.season.value===2.5&&initial.season.forced===false&&initial.donation.trashRaw===0&&initial.donation.trashFraction===0&&initial.donation.trashGoal===480000,'unsupported-initial-axis');
    need(initial.ordinary.provider==='edl-owned-fnv1a-mulberry32-v1'&&initial.ordinary.baseSeed===0x5EED&&initial.ordinary.ordinaryAtImport===true&&initial.ordinary.hookOwned===true,'unsupported-rng');
    const rawProgress=data(args,'progress');fields(rawProgress);if(data(rawProgress,'eligible')===false){const reason=data(rawProgress,'reason');need(typeof reason==='string'&&reason.length<=2048,'progress-capture');throw Error(reason);}const progress=progressSnapshot(rawProgress,B);
    const rawQuery=data(args,'query');need(typeof rawQuery==='string'&&rawQuery.length<=16384,'query');
    const mature=initial.district.opened===8&&initial.graphics.preset==='high';
    let query,diagnosticQuery;
    if(mature){
      need(progress.values['dlv-shifts']===40,'unsupported-maturity');
      const entries=[...new URLSearchParams(rawQuery)],opt=entries.filter(([k])=>k==='addresspackage17b');need(opt.length===1&&['0','1'].includes(opt[0][1]),'requires-opt-in');
      // Historical mature diagnostic mode keeps its entire raw query identity unchanged.
      query={raw:rawQuery,entries:orderedEntries(rawQuery)};
    }else{
      freshProgress(initial,progress);query=freshQuery(rawQuery);diagnosticQuery={raw:rawQuery,entries:orderedEntries(rawQuery)};
    }
    const port=data(args,'city');shape(port,['roads','buildings','entrances','paths','lots','terrain','roadFacts']);
    // First-slot key does not encode reference topology. Reject it before cloning erases it.
    need(new Set(['roads','buildings','entrances','paths','lots'].map(k=>data(port,k))).size===5,'unsupported-table-alias');
    for(const name of ['roads','buildings','entrances']){
      const rows=data(port,name);need(Array.isArray(rows)&&rows.length<=MAX_ITEMS,'city-array-limit');B.temporary(rows.length*32);
      const seen=new Set();for(let i=0;i<rows.length;i++){const row=data(rows,String(i));need(!seen.has(row),'unsupported-row-alias:'+name);seen.add(row);}
    }
    const roads=roadRows(data(port,'roads'),B),buildings=clone(data(port,'buildings'),B),entrances=clone(data(port,'entrances'),B),paths=clone(data(port,'paths'),B),lots=clone(data(port,'lots'),B),terrain=clone(data(port,'terrain'),B),facts=clone(data(port,'roadFacts'),B);
    need([buildings,entrances,paths,lots].every(Array.isArray),'city-arrays');shape(terrain,['g','nx','nz','x0','z0']);shape(facts,['widths','drivable']);
    need(Array.isArray(facts.widths)&&Array.isArray(facts.drivable)&&facts.widths.length===roads.length&&facts.drivable.length===roads.length&&facts.widths.every(w=>typeof w==='number'&&Number.isFinite(w)&&w>0)&&facts.drivable.every(v=>typeof v==='boolean'),'road-facts');
    points(roads.map(r=>r.p),2);points(buildings.map(b=>b.p),3);points(paths,0);points(lots.map(l=>l.p),3);need(entrances.every(e=>Array.isArray(e)&&e.length===4&&e.every(v=>typeof v==='number'&&Number.isFinite(v))),'raw-entrances');
    need(Number.isSafeInteger(terrain.nx)&&terrain.nx>0&&Number.isSafeInteger(terrain.nz)&&terrain.nz>0&&Number.isSafeInteger(terrain.nx*terrain.nz)&&typeof terrain.g==='number'&&terrain.g>0&&Number.isFinite(terrain.x0)&&Number.isFinite(terrain.z0),'terrain');
    const heights=data(args,'terrainHeights'),heightCount=typed(heights,Float32Array,B);need(heightCount===terrain.nx*terrain.nz,'terrain-length');B.node(heightCount);
    let mask=null,maskBytes=null,maskCount=0;const rawMask=data(args,'borderMask');
    if(rawMask!==null){shape(rawMask,['C','x0','z0','nx','nz','a']);mask={C:data(rawMask,'C'),x0:data(rawMask,'x0'),z0:data(rawMask,'z0'),nx:data(rawMask,'nx'),nz:data(rawMask,'nz')};need(Number.isFinite(mask.C)&&mask.C>0&&Number.isFinite(mask.x0)&&Number.isFinite(mask.z0)&&Number.isSafeInteger(mask.nx)&&mask.nx>0&&Number.isSafeInteger(mask.nz)&&mask.nz>0,'border-mask');maskBytes=data(rawMask,'a');maskCount=typed(maskBytes,Uint8Array,B);need(maskCount===mask.nx*mask.nz,'mask-length');}
    const counts={roads:roads.length,buildings:buildings.length,rawEntrances:entrances.length,paths:paths.length,lots:lots.length,terrainSamples:heightCount,maskBytes:maskCount};
    const descriptor=freeze(mature?{version:1,base,initial,progress,query,counts}:{version:2,profile:'fresh-v1',base,initial,progress,query,counts,diagnosticQuery});
    // diagnosticQuery is deliberately absent here. No removed raw token can leak back via descriptor.
    const writer=new Writer();writer.string(mature?'bird-address-input-17b-v1':'bird-address-input-17b-fresh-v1');writer.value({base,initial,progress,query,city:{roads,buildings,entrances,paths,lots,terrain,roadFacts:facts},mask});writer.f32(heights,heightCount);if(maskBytes)writer.bytes(maskBytes,maskCount);
    const identity=Object.freeze({...base,inputHash:writer.end()});return{eligible:true,identity,descriptor};
  }catch(error){return miss(error);}
}
