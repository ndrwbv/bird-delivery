import {drainSteps,phaseSteps,sliceBudget} from './cooperative.js';
import {DEFAULT_LIMITS,limitsOf,budget,pageShape} from './checkpoint-limits.js';
export {DEFAULT_LIMITS};
/* 17а experiment only. Pure CPU/data, no fetch, game hooks, file access or cache activation. */
const VERSION=1,MAGIC=new Uint8Array([66,49,55,76,65,78,68,0]),PREFIX=20,PAGE=16384;
const TYPES={Float64Array,Uint8Array,Uint16Array,Uint32Array};
const RESULT_FIELDS=['minWidth','cleanedArea','fillTriangles','fillDraw','cleanTiles','maskTriangles','maskEdges'];
const textEncoder=new TextEncoder(),textDecoder=new TextDecoder('utf-8',{fatal:true});
const little=new Uint8Array(new Uint16Array([1]).buffer)[0]===1;
const fail=code=>{throw Error('land-cache17a:'+code);};
const ok=(v,code)=>{if(!v)fail(code);};
const uint=v=>Number.isSafeInteger(v)&&v>=0;
const integer=v=>Number.isSafeInteger(v);
const stable=v=>JSON.stringify(v,(_k,value)=>value&&Object.getPrototypeOf(value)===Object.prototype?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value);
const CRC_TABLE=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0;});
function crc32Update(crc,bytes){for(const x of bytes)crc=(crc>>>8)^CRC_TABLE[(crc^x)&255];return crc;}
export function* crc32Steps(bytes,options={}){const batch=sliceBudget(options);let crc=0xffffffff;for(let at=0;at<bytes.length;){const n=Math.min(batch.room,bytes.length-at);crc=crc32Update(crc,bytes.subarray(at,at+n));at+=n;if(batch.charge(n,0))yield 'crc';}return(crc^0xffffffff)>>>0;}
export function crc32(bytes){return drainSteps(crc32Steps(bytes));}
function identityValid(identity){
 ok(identity&&identity.mapId&&identity.mode==='streamed-deferred','IDENTITY_MODE');
 ok(Object.keys(identity).sort().join(',')==='editsHash,flags,mapHash,mapId,mode,precleanHash,seed,sourceHash','IDENTITY_FIELDS');
 for(const k of ['mapHash','editsHash','sourceHash','precleanHash'])ok(typeof identity[k]==='string'&&/^[a-f0-9]{64}$/.test(identity[k]),'IDENTITY_'+k);
 ok(identity.seed!==undefined&&identity.flags&&Object.getPrototypeOf(identity.flags)===Object.prototype,'IDENTITY_FLAGS');
 // Fail closed on unrecorded values/functions: no profile/scene objects enter a cache key.
 for(const v of [identity.mapId,identity.seed,...Object.values(identity.flags)])ok(v===null||['string','boolean'].includes(typeof v)||typeof v==='number'&&Number.isFinite(v),'IDENTITY_VALUE');
}
function* finiteSteps(a,batch){for(const n of a){ok(Number.isFinite(n),'NON_FINITE');if(batch.charge(0))yield;}}
function* coverValidSteps(s,L,batch){
 ok(s?.version===1&&Number.isFinite(s.cell)&&s.cell>0&&s.grid instanceof Map,'COVER_SCHEMA');
 if(s.packed===null){ok(s.grid.size===0,'EMPTY_GRID');return;}
 const p=s.packed;ok(p&&uint(p.n)&&uint(p.end)&&Array.isArray(p.blocks),'PACKED_SCHEMA');let count=0;
 for(const b of p.blocks){
  ok(b,'PAGE_SIZE');pageShape(ok,b.n,k=>({type:b[k]?.constructor?.name,length:b[k]?.length}));count+=b.n;
  ok(b.xy instanceof Float64Array&&b.xy.length%2===0&&b.heights instanceof Float64Array,'PAGE_FLOATS');yield* finiteSteps(b.xy,batch);yield* finiteSteps(b.heights,batch);
  ok(b.indices instanceof Uint16Array&&b.indices.length===b.n*3,'PAGE_INDICES');
  ok((b.heightIndex instanceof Uint8Array||b.heightIndex instanceof Uint16Array)&&b.heightIndex.length===b.n,'HEIGHT_INDEX');
  ok((b.meta instanceof Uint8Array||b.meta instanceof Uint16Array)&&b.meta.length===b.n&&b.metaValues instanceof Uint32Array,'META_INDEX');
  for(const i of b.indices){ok(i<b.xy.length/2,'VERTEX_RANGE');if(batch.charge(0))yield;}
  for(const i of b.heightIndex){ok(i<b.heights.length,'HEIGHT_RANGE');if(batch.charge(0))yield;}
  for(const i of b.meta){ok(i<b.metaValues.length,'META_RANGE');if(batch.charge(0))yield;}
 }
 ok(count===p.n&&p.end===(p.blocks.length?(p.blocks.length-1)*PAGE+p.blocks.at(-1).n:0),'PACKED_COUNT_END');
 for(const[k,list]of s.grid){
  ok(integer(k)&&k>=-2147483648&&k<=2147483647||typeof k==='string'&&/^-?\d+,-?\d+$/.test(k),'GRID_KEY');
  ok(list instanceof Uint32Array&&list.length<=L.maxIdsPerCell,'GRID_LIST_TYPE');const seen=new Set();
  for(const id of list){const b=p.blocks[Math.floor(id/PAGE)];ok(b&&id%PAGE<b.n&&!seen.has(id),'GRID_ID');seen.add(id);if(batch.charge(0))yield;}
  if(batch.charge(0))yield;
 }
}
function* footprintSteps(s,L,batch){
 let bytes=0,pages=0,cells=0,ids=0;
 const add=a=>{ok(ArrayBuffer.isView(a)&&Object.hasOwn(TYPES,a.constructor.name),'ARRAY_TYPE');ok(a.byteLength<=L.maxBlockBytes,'BLOCK_BUDGET');bytes+=a.byteLength;};
 for(const c of [s?.cover,s?.green,s?.mask?.kept]){
  ok(c&&c.grid instanceof Map,'COVER_SCHEMA');cells+=c.grid.size;ok(cells<=L.maxMapCells,'CELL_BUDGET');
  if(c.packed!==null){ok(c.packed&&Array.isArray(c.packed.blocks),'PACKED_SCHEMA');pages+=c.packed.blocks.length;ok(pages<=L.maxPages,'PAGE_BUDGET');for(const b of c.packed.blocks)for(const k of ['xy','heights','indices','heightIndex','meta','metaValues']){add(b?.[k]);if(batch.charge(0))yield;}}
  for(const list of c.grid.values()){ok(list instanceof Uint32Array&&list.length<=L.maxIdsPerCell,'GRID_LIST_TYPE');ids+=list.length;ok(ids<=L.maxIndexIds,'INDEX_BUDGET');add(list);if(batch.charge(0))yield;}
 }
 const m=s.mask;ok(m.domain instanceof Map&&m.domain.size<=L.maxDomainRows,'DOMAIN_BUDGET');let domainCells=0;
 for(const row of m.domain.values()){ok(row instanceof Map,'DOMAIN_ROW');domainCells+=row.size;ok(domainCells<=L.maxDomainCells,'DOMAIN_BUDGET');if(batch.charge(0))yield;}
 add(m.segments);budget(ok,L,{bytes,pages,cells,ids,domainCells,domainRows:m.domain.size});return{bytes,pages,cells,ids,domainCells,domainRows:m.domain.size};
}
function copyCover(s){return {...s,packed:s.packed?{n:s.packed.n,end:s.packed.end,blocks:s.packed.blocks.map(b=>Object.fromEntries(Object.entries(b).map(([k,v])=>[k,ArrayBuffer.isView(v)?v.slice():v])))}:null,grid:new Map([...s.grid].map(([k,v])=>[k,v.slice()]))};}
function ownedCheckpoint(s){return {...s,cover:copyCover(s.cover),green:copyCover(s.green),mask:{...s.mask,kept:copyCover(s.mask.kept),domain:new Map([...s.mask.domain].map(([i,row])=>[i,new Map(row)])),segments:s.mask.segments.slice()},resultStats:{...s.resultStats}};}
function* validateSteps(s,L,batch){
 yield* footprintSteps(s,L,batch);
 ok(s?.version===1&&s.mode==='streamed-deferred'&&s.stage==='post-clean-pre-activate','CHECKPOINT_PHASE');
 yield* coverValidSteps(s.cover,L,batch);yield* coverValidSteps(s.green,L,batch);const m=s.mask;
 ok(s.cover.cell===32&&s.green.cell===32&&m?.version===1&&m.cell===32&&m.indexCell===8&&m.ready===true,'GRID_PARAMETERS');
 yield* coverValidSteps(m.kept,L,batch);ok(m.kept.cell===m.indexCell&&m.domain instanceof Map&&uint(m.domainCells),'MASK_SCHEMA');
 let cells=0;
 for(const[i,row]of m.domain){ok(integer(i)&&row instanceof Map,'DOMAIN_ROW');for(const[j,state]of row){ok(integer(j)&&typeof state==='boolean','DOMAIN_STATE');cells++;if(batch.charge(0))yield;}}
 ok(cells===m.domainCells,'DOMAIN_COUNT');
 ok(m.segments instanceof Float64Array&&m.segments.length%4===0,'SEGMENTS');yield* finiteSteps(m.segments,batch);
 const st=s.resultStats;
 ok(st&&Object.getPrototypeOf(st)===Object.prototype&&Object.keys(st).sort().join(',')===[...RESULT_FIELDS].sort().join(','),'RESULT_STATS_KEYS');
 for(const k of RESULT_FIELDS)ok(Number.isFinite(st?.[k])&&st[k]>=0,'RESULT_STATS');
 for(const k of ['fillTriangles','fillDraw','cleanTiles','maskTriangles','maskEdges'])ok(uint(st[k]),'RESULT_INTEGER');
 ok(st.maskTriangles===(m.kept.packed?.n||0)&&st.maskEdges===m.segments.length/4&&st.fillDraw===0,'RESULT_COUNTS');return s;
}
export function* validateCheckpointSteps(s,{limits={},work,...options}={}){return yield* phaseSteps('raisedland.cache.validate',validateSteps(s,limitsOf(limits),sliceBudget(options)),work);}
export function validateCheckpoint(s,options={}){return drainSteps(validateCheckpointSteps(s,options));}
/* A cache checkpoint owns its arrays/maps. The original worker snapshot remains borrowed. */
export function captureResult({cover,green,finalMask,ST},{deferDraw,prepared,completed,limits={}}){
 ok(deferDraw===true&&prepared===true&&completed===true&&!ST.built&&!ST.supportReady,'CAPTURE_UNSUPPORTED_PHASE');
 const names=RESULT_FIELDS;
 const value={version:1,mode:'streamed-deferred',stage:'post-clean-pre-activate',cover:cover.snapshot(),green:green.snapshot(),mask:finalMask.snapshot(),resultStats:Object.fromEntries(names.map(k=>[k,ST[k]]))};
 validateCheckpoint(value,{limits});return ownedCheckpoint(value);
}
/* Many tiny Map cells become a handful of blocks, not one JSON descriptor per cell. */
function packCover(s){
 const keys=new Float64Array(s.grid.size),keyTypes=new Uint8Array(s.grid.size),strings=[],offsets=new Uint32Array(s.grid.size+1);
 let i=0,n=0;for(const[k,list]of s.grid){if(typeof k==='number')keys[i]=k;else{keyTypes[i]=1;strings.push([i,k]);}offsets[i++]=n;n+=list.length;ok(uint(n)&&n<=0xffffffff,'GRID_OVERFLOW');}offsets[i]=n;
 const ids=new Uint32Array(n);i=0;for(const list of s.grid.values()){ids.set(list,i);i+=list.length;}
 return {...s,grid:{keys,keyTypes,strings,offsets,ids}};
}
function* unpackCoverSteps(s,batch){
 const g=s.grid;ok(g?.keys instanceof Float64Array&&g.keyTypes instanceof Uint8Array&&g.offsets instanceof Uint32Array&&g.ids instanceof Uint32Array&&Array.isArray(g.strings),'GRID_PACKET');
 ok(g.keyTypes.length===g.keys.length&&g.offsets.length===g.keys.length+1&&g.offsets[0]===0&&g.offsets.at(-1)===g.ids.length,'GRID_PACKET_LENGTH');
 const strings=new Map();for(const pair of g.strings){ok(Array.isArray(pair)&&pair.length===2&&uint(pair[0])&&pair[0]<g.keys.length&&typeof pair[1]==='string'&&!strings.has(pair[0]),'GRID_STRING');strings.set(pair[0],pair[1]);if(batch.charge(0))yield;}
 const grid=new Map();for(let i=0;i<g.keys.length;i++){
  ok(g.keyTypes[i]===0||g.keyTypes[i]===1,'GRID_KEY_TYPE');ok(g.offsets[i]<=g.offsets[i+1],'GRID_OFFSETS');
  const k=g.keyTypes[i]===1?strings.get(i):g.keys[i];ok(k!==undefined&&!grid.has(k),'GRID_KEYS');
  if(g.keyTypes[i]===1)strings.delete(i);grid.set(k,g.ids.subarray(g.offsets[i],g.offsets[i+1]));if(batch.charge(0))yield;
 }ok(strings.size===0,'GRID_UNUSED_STRING');return {...s,grid};
}
function packSnapshot(s){
 const m=s.mask,rowKeys=new Float64Array(m.domain.size),offsets=new Uint32Array(m.domain.size+1),columns=new Float64Array(m.domainCells),states=new Uint8Array(m.domainCells);
 let i=0,n=0;for(const[k,row]of m.domain){rowKeys[i]=k;offsets[i++]=n;for(const[j,state]of row){columns[n]=j;states[n++]=state?1:0;}}offsets[i]=n;
 return {...s,cover:packCover(s.cover),green:packCover(s.green),mask:{...m,kept:packCover(m.kept),domain:{rowKeys,offsets,columns,states}}};
}
function* unpackSnapshotSteps(s,batch){
 const m=s.mask,d=m.domain;ok(d?.rowKeys instanceof Float64Array&&d.offsets instanceof Uint32Array&&d.columns instanceof Float64Array&&d.states instanceof Uint8Array,'DOMAIN_PACKET');
 ok(d.offsets.length===d.rowKeys.length+1&&d.columns.length===d.states.length&&d.offsets[0]===0&&d.offsets.at(-1)===d.columns.length,'DOMAIN_PACKET_LENGTH');
 const domain=new Map();for(let i=0;i<d.rowKeys.length;i++){
  ok(d.offsets[i]<=d.offsets[i+1]&&!domain.has(d.rowKeys[i]),'DOMAIN_PACKET_ORDER');const row=new Map();
  for(let n=d.offsets[i];n<d.offsets[i+1];n++){ok(!row.has(d.columns[n])&&(d.states[n]===0||d.states[n]===1),'DOMAIN_PACKET_STATE');row.set(d.columns[n],!!d.states[n]);if(batch.charge(0))yield;}domain.set(d.rowKeys[i],row);if(batch.charge(0))yield;
 }
 return {...s,cover:yield* unpackCoverSteps(s.cover,batch),green:yield* unpackCoverSteps(s.green,batch),mask:{...m,kept:yield* unpackCoverSteps(m.kept,batch),domain}};
}
function treeEncode(value,blocks){
 if(value===null||typeof value==='boolean'||typeof value==='string')return value;
 if(typeof value==='number'){ok(Number.isFinite(value),'NON_FINITE_SCALAR');return Object.is(value,-0)?{t:'minus-zero'}:value;}
 if(ArrayBuffer.isView(value)){
  const type=value.constructor.name;ok(Object.hasOwn(TYPES,type),'ARRAY_TYPE');
  let raw=new Uint8Array(value.buffer,value.byteOffset,value.byteLength);if(!little)raw=raw.slice();
  if(!little&&value.BYTES_PER_ELEMENT>1)for(let i=0;i<raw.length;i+=value.BYTES_PER_ELEMENT)raw.subarray(i,i+value.BYTES_PER_ELEMENT).reverse();
  const id=blocks.length;blocks.push({type,length:value.length,raw});return{t:'block',id};
 }
 if(value instanceof Map)return{t:'map',v:[...value].map(([k,v])=>[treeEncode(k,blocks),treeEncode(v,blocks)])};
 if(Array.isArray(value))return{t:'array',v:value.map(v=>treeEncode(v,blocks))};
 ok(value&&[Object.prototype,null].includes(Object.getPrototypeOf(value)),'OBJECT_TYPE');
 return{t:'object',v:Object.entries(value).map(([k,v])=>[k,treeEncode(v,blocks)])};
}
export function encodeCheckpoint(snapshot,identity,{limits={}}={}){
 const L=limitsOf(limits);validateCheckpoint(snapshot,{limits});identityValid(identity);
 const blocks=[],tree=treeEncode(packSnapshot(snapshot),blocks);let offset=0;
 const descriptors=blocks.map(b=>{const entry={type:b.type,length:b.length,offset,bytes:b.raw.length,crc32:crc32(b.raw)};offset+=b.raw.length;return entry;});
 const header=textEncoder.encode(JSON.stringify({version:VERSION,kind:'cleanContours',endian:'LE',identity,tree,blocks:descriptors,dataBytes:offset}));
 ok(header.length<=L.maxHeaderBytes,'HEADER_BUDGET');budget(ok,L,{bytes:offset,headerBytes:header.length});
 const bytes=new Uint8Array(PREFIX+header.length+offset),view=new DataView(bytes.buffer);
 bytes.set(MAGIC);view.setUint32(8,VERSION,true);view.setUint32(12,header.length,true);view.setUint32(16,crc32(header),true);bytes.set(header,PREFIX);
 for(let i=0;i<blocks.length;i++)bytes.set(blocks[i].raw,PREFIX+header.length+descriptors[i].offset);
 return bytes;
}
function* headerPacketSteps(node,blocks,L,batch){
 let count=0;const used=new Set();
 function* visit(v,depth=0){
  ok(++count<=L.maxTreeNodes&&depth<L.maxDepth,'TREE_LIMIT');if(batch.charge(0))yield;
  if(v===null||['boolean','string'].includes(typeof v))return v;
  if(typeof v==='number'){ok(Number.isFinite(v),'TREE_NUMBER');return v;}
  ok(v&&typeof v==='object','TREE_NODE');if(v.t==='minus-zero')return -0;
  if(v.t==='block'){ok(uint(v.id)&&v.id<blocks.length&&!used.has(v.id),'BLOCK_REF');used.add(v.id);return{wireBlock:blocks[v.id]};}
  ok(Array.isArray(v.v)&&v.v.length<=L.maxTreeNodes,'TREE_ENTRIES');
  if(v.t==='array'){const out=[];for(const x of v.v)out.push(yield* visit(x,depth+1));return out;}
  ok(v.t==='object','TREE_TAG');const out={};for(const pair of v.v){ok(Array.isArray(pair)&&pair.length===2&&typeof pair[0]==='string'&&!Object.hasOwn(out,pair[0]),'OBJECT_PAIR');Object.defineProperty(out,pair[0],{value:yield* visit(pair[1],depth+1),enumerable:true});}return out;
 }
 const packet=yield* visit(node);ok(used.size===blocks.length,'UNUSED_BLOCK');return packet;
}
function* packetBudgetSteps(p,h,size,inputBytes,L,batch){
 let pages=0,cells=0,ids=0;
 const get=(a,types)=>{const d=a?.wireBlock;ok(d&&types.includes(d.type),'PACKET_ARRAY_TYPE');return d;};
 for(const c of [p?.cover,p?.green,p?.mask?.kept]){
  ok(c&&c.grid,'PACKET_COVER');const g=c.grid,keys=get(g.keys,['Float64Array']),kt=get(g.keyTypes,['Uint8Array']),o=get(g.offsets,['Uint32Array']),list=get(g.ids,['Uint32Array']);
  ok(kt.length===keys.length&&o.length===keys.length+1&&Array.isArray(g.strings)&&g.strings.length<=keys.length,'GRID_PACKET_LENGTH');cells+=keys.length;ids+=list.length;
  if(c.packed!==null){const packed=c.packed;ok(packed&&Array.isArray(packed.blocks)&&uint(packed.n)&&uint(packed.end),'PACKED_SCHEMA');pages+=packed.blocks.length;let n=0;
   for(const b of packed.blocks){ok(b,'PAGE_SIZE');pageShape(ok,b.n,k=>get(b[k],Object.keys(TYPES)));n+=b.n;if(batch.charge(0))yield;}
   ok(n===packed.n&&packed.end===(packed.blocks.length?(packed.blocks.length-1)*PAGE+packed.blocks.at(-1).n:0),'PACKED_COUNT_END');
  }else ok(keys.length===0&&list.length===0,'EMPTY_GRID');
 }
 const d=p.mask.domain,rows=get(d?.rowKeys,['Float64Array']),offsets=get(d?.offsets,['Uint32Array']),columns=get(d?.columns,['Float64Array']),states=get(d?.states,['Uint8Array']);
 ok(offsets.length===rows.length+1&&columns.length===states.length&&p.mask.domainCells===columns.length,'DOMAIN_PACKET_LENGTH');
 const segments=get(p.mask.segments,['Float64Array']);ok(segments.length%4===0,'SEGMENTS');
 budget(ok,L,{bytes:h.dataBytes,pages,cells,ids,domainCells:columns.length,domainRows:rows.length,inputBytes,headerBytes:size});
}
export function* decodeCheckpointSteps(input,expectedIdentity,{work,limits={},...options}={}){
 const L=limitsOf(limits),batch=sliceBudget(options);
 identityValid(expectedIdentity);ok(input instanceof Uint8Array&&input.length>=PREFIX,'TRUNCATED_PREFIX');ok(input.length<=PREFIX+L.maxHeaderBytes+L.maxPayloadBytes,'INPUT_BUDGET');
 const{h,size}=yield* phaseSteps('raisedland.cache.header',(function*(){
  const view=new DataView(input.buffer,input.byteOffset,input.byteLength);
  ok(MAGIC.every((v,i)=>input[i]===v),'MAGIC');ok(view.getUint32(8,true)===VERSION,'VERSION');
  const size=view.getUint32(12,true);ok(size<=L.maxHeaderBytes&&PREFIX+size<=input.length,'HEADER_SIZE');const rawHeader=input.subarray(PREFIX,PREFIX+size);
  ok((yield* crc32Steps(rawHeader,options))===view.getUint32(16,true),'HEADER_CRC');yield;
  // JSON.parse is one native operation, bounded by maxHeaderBytes; not a 4ms guarantee.
  const h=JSON.parse(textDecoder.decode(rawHeader));
  ok(h.version===VERSION&&h.kind==='cleanContours'&&h.endian==='LE','HEADER_SCHEMA');identityValid(h.identity);ok(stable(h.identity)===stable(expectedIdentity),'IDENTITY_MISMATCH');
  ok(uint(h.dataBytes)&&h.dataBytes===input.length-PREFIX-size&&Array.isArray(h.blocks)&&h.blocks.length<=L.maxBlocks&&h.dataBytes<=L.maxPayloadBytes,'PAYLOAD_LENGTH');yield;return{h,size};
 })(),work);
 yield* phaseSteps('raisedland.cache.preflight',(function*(){
  let total=0;for(const b of h.blocks){ok(b&&Object.hasOwn(TYPES,b.type)&&uint(b.length)&&uint(b.bytes)&&b.bytes===b.length*TYPES[b.type].BYTES_PER_ELEMENT&&b.offset===total,'BLOCK_SHAPE');ok(b.bytes<=L.maxBlockBytes,'BLOCK_BUDGET');total+=b.bytes;ok(total<=h.dataBytes,'BLOCK_BOUNDS');if(batch.charge(0))yield;}
  ok(total===h.dataBytes,'UNUSED_PAYLOAD');const packet=yield* headerPacketSteps(h.tree,h.blocks,L,batch);yield* packetBudgetSteps(packet,h,size,input.length,L,batch);
 })(),work);
 const arrays=yield* phaseSteps('raisedland.cache.blocks',(function*(){
  const result=[];let offset=0;
  for(const b of h.blocks){
   ok(b&&Object.hasOwn(TYPES,b.type)&&uint(b.length)&&b.offset===offset&&uint(b.bytes)&&b.bytes===b.length*TYPES[b.type].BYTES_PER_ELEMENT,'BLOCK_SHAPE');ok(offset+b.bytes<=h.dataBytes,'BLOCK_BOUNDS');
   const copy=new Uint8Array(b.bytes);if(batch.charge())yield;let crc=0xffffffff;
   for(let at=0;at<b.bytes;){const n=Math.min(batch.room,b.bytes-at),raw=input.subarray(PREFIX+size+offset+at,PREFIX+size+offset+at+n);crc=crc32Update(crc,raw);copy.set(raw,at);at+=n;if(batch.charge(n,0))yield;}
   ok(((crc^0xffffffff)>>>0)===b.crc32,'BLOCK_CRC');
   if(!little&&TYPES[b.type].BYTES_PER_ELEMENT>1){const width=TYPES[b.type].BYTES_PER_ELEMENT;for(let at=0;at<copy.length;){const end=Math.min(at+batch.maxBytes,copy.length);for(let i=at;i<end;i+=width)copy.subarray(i,i+width).reverse();at=end;yield;}}
   result.push(new TYPES[b.type](copy.buffer,copy.byteOffset,b.length));offset+=b.bytes;
  }
  ok(offset===h.dataBytes,'UNUSED_PAYLOAD');return result;
 })(),work);
 const used=new Set();let nodes=0;
 function* restore(node,depth=0){
  ok(++nodes<=L.maxTreeNodes&&depth<L.maxDepth,'TREE_LIMIT');if(batch.charge(0))yield;
  if(node===null||['boolean','string'].includes(typeof node))return node;
  if(typeof node==='number'){ok(Number.isFinite(node),'TREE_NUMBER');return node;}
  ok(node&&typeof node==='object','TREE_NODE');if(node.t==='minus-zero')return -0;
  if(node.t==='block'){ok(uint(node.id)&&node.id<arrays.length&&!used.has(node.id),'BLOCK_REF');used.add(node.id);return arrays[node.id];}
  ok(Array.isArray(node.v),'TREE_ENTRIES');
  if(node.t==='array'){const result=[];for(const v of node.v)result.push(yield* restore(v,depth+1));return result;}
  if(node.t==='map'){const result=new Map();for(const pair of node.v){ok(Array.isArray(pair)&&pair.length===2,'MAP_PAIR');const key=yield* restore(pair[0],depth+1);ok(!result.has(key),'MAP_DUP');result.set(key,yield* restore(pair[1],depth+1));}return result;}
  ok(node.t==='object','TREE_TAG');const result={};for(const pair of node.v){ok(Array.isArray(pair)&&pair.length===2&&typeof pair[0]==='string'&&!Object.hasOwn(result,pair[0]),'OBJECT_PAIR');Object.defineProperty(result,pair[0],{value:yield* restore(pair[1],depth+1),enumerable:true,writable:true,configurable:true});}return result;
 }
 const tree=yield* phaseSteps('raisedland.cache.tree',restore(h.tree),work);
 const unpacked=yield* phaseSteps('raisedland.cache.index',unpackSnapshotSteps(tree,batch),work);
 const result=yield* validateCheckpointSteps(unpacked,{limits,work,...options});ok(used.size===arrays.length,'UNUSED_BLOCK');return result;
}
export function decodeCheckpoint(input,identity,options={}){return drainSteps(decodeCheckpointSteps(input,identity,options));}
/* Trusted geometry adapters allocate independent state during prepare; all commits are synchronous. */
function targetValid(target,snapshot){
 ok(target&&target.cover&&target.green&&target.finalMask&&target.ST,'RESTORE_PHASE');const C=[target.cover,target.green,target.finalMask.kept];
 ok(new Set([...C,target.finalMask]).size===4&&C.every(c=>c&&typeof c.restore==='function'&&typeof c.prepareRestore==='function'&&typeof c.prepareRestoreSteps==='function')&&typeof target.finalMask.restore==='function'&&typeof target.finalMask.prepareRestore==='function'&&typeof target.finalMask.prepareRestoreSteps==='function','TARGET_CAPABILITIES');
 ok(target.cover.cell===snapshot.cover.cell&&target.green.cell===snapshot.green.cell&&target.finalMask.kept.cell===snapshot.mask.indexCell&&target.finalMask.indexCell===snapshot.mask.indexCell,'TARGET_GRID');
 const st=target.ST;ok([Object.prototype,null].includes(Object.getPrototypeOf(st)),'TARGET_STATS');
 for(const key of ['built','supportReady']){const d=Object.getOwnPropertyDescriptor(st,key);ok(d&&Object.hasOwn(d,'value')&&d.value===false,'RESTORE_PHASE');}
 for(const key of RESULT_FIELDS){const d=Object.getOwnPropertyDescriptor(st,key);ok(d?Object.hasOwn(d,'value')&&d.writable:Object.isExtensible(st),'TARGET_STATS');}
 return st;
}
export function* prepareRestoreResultSteps(target,snapshot,{prepared=false,limits={},work,...options}={}){
 yield* validateCheckpointSteps(snapshot,{limits,work,...options});ok(prepared===true,'RESTORE_PHASE');const st=targetValid(target,snapshot),refs=[target.cover,target.green,target.finalMask,target.finalMask.kept,target.ST];
 const resultStats=Object.fromEntries(RESULT_FIELDS.map(k=>[k,snapshot.resultStats[k]]));
 const commits=[];
 for(const[name,model,value]of [['cover',target.cover,snapshot.cover],['green',target.green,snapshot.green],['mask',target.finalMask,snapshot.mask]])commits.push(yield* phaseSteps('raisedland.cache.restore.'+name,model.prepareRestoreSteps(value,options),work));
 const currentRefs=[target.cover,target.green,target.finalMask,target.finalMask.kept,target.ST];ok(refs.every((v,i)=>v===currentRefs[i]),'TARGET_CHANGED');
 ok(commits.every(fn=>typeof fn==='function'),'TARGET_PREPARED');for(const commit of commits)commit.preflight?.();targetValid(target,snapshot);
 // Caller must commit immediately, without yielding or mutating target/snapshot after prepare returns.
 // All large validation/copy/allocation is finished; commit owns the seven scalar stats too.
 let committed=false;return()=>{if(committed)return target;committed=true;for(const commit of commits)commit();for(const key of RESULT_FIELDS)st[key]=resultStats[key];return target;};
}
export function* restoreResultSteps(target,snapshot,options={}){const commit=yield* prepareRestoreResultSteps(target,snapshot,options);return commit();}
export function restoreResult(target,snapshot,options={}){return drainSteps(restoreResultSteps(target,snapshot,options));}
