/* Fresh logical graph only. CRC detects corruption; a trusted external wire SHA must bind the file. */
import {edgeKey} from './streetgraph.js';

const MAGIC=Uint8Array.from([66,49,55,82,79,65,68,0]),VERSION=1,PREFIX=28;
export const STREET_GRAPH_LIMITS=Object.freeze({maxHeaderBytes:65536,maxPayloadBytes:64*1024*1024,maxNodes:99999,maxEdges:500000,maxNeighbors:500000,maxRoads:100000,maxWorkingBytes:256*1024*1024});
const NUMBERS=['len','ux','uz','rx','rz','w','w0','c','lanes'];
const EDGE_FIELDS=['a','b',...NUMBERS,'ok','oneway','road','tA','tB','sig','stopAt'];
const BLOCKS=[['nodeXY','f64',8],['nodeFlags','u8',1],['nbOffsets','u32',4],['nbIDs','u32',4],['edgeABRoad','u32',4],['edgeNumbers','f64',8],['edgeFlags','u8',1]];
const TABLE=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0;});
const need=(yes,code)=>{if(!yes)throw Error('streetgraph-codec:'+code);};
const plain=v=>v&&Object.getPrototypeOf(v)===Object.prototype;
const integer=(v,max)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=0&&v<=max;
const crc=bytes=>{let c=0xffffffff;for(const b of bytes)c=(c>>>8)^TABLE[(c^b)&255];return(c^0xffffffff)>>>0;};
function fields(value,required,optional=[],code='FIELDS'){
 need(plain(value)&&Reflect.ownKeys(value).every(k=>typeof k==='string'&&(required.includes(k)||optional.includes(k)))&&required.every(k=>Object.hasOwn(value,k)),code);
 for(const k of Reflect.ownKeys(value))need(Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value'),code);
}
function identityOf(identity){
 const keys=['mapId','mapHash','editsHash','sourceHash','inputHash'];fields(identity,keys,[],'IDENTITY');
 need(typeof identity.mapId==='string'&&/^[a-z0-9_-]{1,64}$/.test(identity.mapId),'IDENTITY');
 for(const k of keys.slice(1))need(typeof identity[k]==='string'&&/^[a-f0-9]{64}$/.test(identity[k]),'IDENTITY');
 return Object.fromEntries(keys.map(k=>[k,identity[k]]));
}
function limitsOf(limits={}){
 need(plain(limits),'LIMITS');const out={...STREET_GRAPH_LIMITS};
 for(const [k,v]of Object.entries(limits)){need(Object.hasOwn(out,k)&&integer(v,out[k]),'LIMITS');out[k]=v;}
 return out;
}
function sizes(counts,L,wireBytes=0){
 fields(counts,['nodes','edges','neighbors','roads'],[],'COUNTS');
 for(const [k,max]of [['nodes',L.maxNodes],['edges',L.maxEdges],['neighbors',L.maxNeighbors],['roads',L.maxRoads]])need(integer(counts[k],max),'COUNT_BUDGET');
 need(counts.nodes<100000&&counts.edges===counts.neighbors,'COUNTS');
 // Conservative structural charge, including temporary validation sets; not measured JS/RSS/Deck RAM.
 const charge=wireBytes*2+counts.nodes*256+counts.edges*640+counts.neighbors*24+counts.roads*16;
 need(Number.isSafeInteger(charge)&&charge<=L.maxWorkingBytes,'WORKING_BUDGET');
 return[2*counts.nodes,counts.nodes,counts.nodes+1,counts.neighbors,3*counts.edges,9*counts.edges,counts.edges];
}
function layout(counts,L){
 const lengths=sizes(counts,L);let offset=0;
 const blocks=BLOCKS.map(([name,type,width],i)=>{const length=lengths[i],bytes=length*width,block={name,type,length,offset,bytes};offset+=bytes;return block;});
 need(Number.isSafeInteger(offset)&&offset<=L.maxPayloadBytes,'PAYLOAD_BUDGET');return{blocks,bodyBytes:offset};
}
function reader(body,blocks){
 const view=new DataView(body.buffer,body.byteOffset,body.byteLength),by=Object.fromEntries(blocks.map(b=>[b.name,b]));
 return(name,i)=>{const b=by[name],p=b.offset+i*(b.type==='f64'?8:b.type==='u32'?4:1);return b.type==='f64'?view.getFloat64(p,true):b.type==='u32'?view.getUint32(p,true):view.getUint8(p);};
}
function validateData(counts,get,roads,L,wireBytes){
 sizes(counts,L,wireBytes);need(Array.isArray(roads)&&roads.length===counts.roads,'ROAD_COUNT');
 const keys=[],nodeKeys=new Set(),neighbors=new Set(),edgeRows=new Map();let hasOut=null;
 for(let u=0;u<counts.nodes;u++){
  const x=get('nodeXY',u*2),z=get('nodeXY',u*2+1),f=get('nodeFlags',u);need(Number.isFinite(x)&&Number.isFinite(z),'NON_FINITE');
  need(f===0||f===1||f===3,'NODE_FLAGS');if(hasOut===null)hasOut=!!(f&1);need(hasOut===!!(f&1),'NODE_FLAGS');
  const key=x+','+z;need(!nodeKeys.has(key),'DUPLICATE_COORDINATE');nodeKeys.add(key);keys.push(key);
 }
 need(get('nbOffsets',0)===0&&get('nbOffsets',counts.nodes)===counts.neighbors,'CSR');
 for(let u=0;u<counts.nodes;u++){
  const begin=get('nbOffsets',u),end=get('nbOffsets',u+1);need(integer(begin,counts.neighbors)&&integer(end,counts.neighbors)&&end>=begin,'CSR');
  for(let j=begin;j<end;j++){const v=get('nbIDs',j);need(integer(v,counts.nodes-1)&&v!==u,'NEIGHBOR_RANGE');const key=edgeKey(u,v);need(!neighbors.has(key),'DUPLICATE_NEIGHBOR');neighbors.add(key);}
 }
 for(let i=0;i<counts.edges;i++){
  const a=get('edgeABRoad',i*3),b=get('edgeABRoad',i*3+1),r=get('edgeABRoad',i*3+2),f=get('edgeFlags',i);
  need(integer(a,counts.nodes-1)&&integer(b,counts.nodes-1)&&a!==b&&integer(r,roads.length-1)&&roads[r]&&typeof roads[r]==='object','EDGE_REFERENCE');
  const key=edgeKey(a,b);need(!edgeRows.has(key)&&neighbors.has(key),'EDGE_KEY');edgeRows.set(key,i);
  need(integer(f,7)&&!!(f&4)===!!((get('nodeFlags',a)&2)||(get('nodeFlags',b)&2)),'EDGE_FLAGS');
  for(let j=0;j<9;j++)need(Number.isFinite(get('edgeNumbers',i*9+j)),'NON_FINITE');
  need(get('edgeNumbers',i*9)>=.3,'EDGE_LENGTH');
  const road=roads[r];need(Object.is(get('edgeNumbers',i*9+7),road.c)&&Object.is(get('edgeNumbers',i*9+8),road.l||0)&&!!(f&2)===!!road.o,'ROAD_REFERENCE');
  need(Object.is(get('edgeNumbers',i*9+6),road.w0||get('edgeNumbers',i*9+5)),'ROAD_REFERENCE');
 }
 need(neighbors.size===edgeRows.size,'EDGE_NEIGHBORS');
 for(let i=0;i<counts.edges;i++){
  const a=get('edgeABRoad',i*3),b=get('edgeABRoad',i*3+1),other=edgeRows.get(edgeKey(b,a));need(other!==undefined,'REVERSE_EDGE');
  need(roads[get('edgeABRoad',i*3+2)]===roads[get('edgeABRoad',other*3+2)],'ROAD_REFERENCE');
  for(const j of [0,5,6,7,8])need(Object.is(get('edgeNumbers',i*9+j),get('edgeNumbers',other*9+j)),'REVERSE_EDGE');
  for(const j of [1,2,3,4])need(Object.is(get('edgeNumbers',i*9+j),-get('edgeNumbers',other*9+j)),'REVERSE_EDGE');
  const f=get('edgeFlags',i),back=get('edgeFlags',other);need((f&6)===(back&6)&&((f&2)?!!(f&1)!==!!(back&1):(f&1)&&(back&1)),'REVERSE_EDGE');
 }
 return{keys};
}

export function encodeStreetGraph({graph,roads,identity}){
 const id=identityOf(identity),L=STREET_GRAPH_LIMITS;
 fields(graph,['nodes','nodeIndex','edges'],[],'GRAPH');need(Array.isArray(graph.nodes)&&graph.nodeIndex instanceof Map&&graph.edges instanceof Map&&Array.isArray(roads),'GRAPH');
 const counts={nodes:graph.nodes.length,edges:graph.edges.size,neighbors:0,roads:roads.length};
 need(integer(counts.nodes,L.maxNodes)&&integer(counts.edges,L.maxEdges)&&integer(counts.roads,L.maxRoads),'COUNT_BUDGET');
 for(const n of graph.nodes){fields(n,['x','z','nb'],['out'],'NODE_OVERLAY');need(typeof n.x==='number'&&typeof n.z==='number'&&Number.isFinite(n.x)&&Number.isFinite(n.z),'NON_FINITE');need(Array.isArray(n.nb),'NEIGHBORS');counts.neighbors+=n.nb.length;need(integer(counts.neighbors,L.maxNeighbors),'COUNT_BUDGET');}
 const {blocks,bodyBytes}=layout(counts,L),roadIndex=new Map();
 for(let i=0;i<roads.length;i++)if(!roadIndex.has(roads[i]))roadIndex.set(roads[i],i);
 const ordered=[...graph.edges];
 need(graph.nodeIndex.size===counts.nodes,'NODE_INDEX');let ni=0;
 for(const [key,value]of graph.nodeIndex){const n=graph.nodes[ni];need(key===n.x+','+n.z&&Object.is(value,ni),'NODE_INDEX');ni++;}
 for(const [key,e]of ordered){fields(e,EDGE_FIELDS,['closed'],'EDGE_OVERLAY');need(key===edgeKey(e.a,e.b)&&roadIndex.has(e.road),'EDGE_REFERENCE');
  need(NUMBERS.every(k=>typeof e[k]==='number'&&Number.isFinite(e[k])),'NON_FINITE');
  need(Object.is(e.tA,0)&&Object.is(e.tB,0)&&Object.is(e.stopAt,0)&&e.sig===null,'EDGE_OVERLAY');need(typeof e.ok==='boolean'&&typeof e.oneway==='boolean'&&(!Object.hasOwn(e,'closed')||e.closed===1),'EDGE_FLAGS');}
 for(const n of graph.nodes)need(!Object.hasOwn(n,'out')||typeof n.out==='boolean','NODE_FLAGS');
 const header=new TextEncoder().encode(JSON.stringify({version:VERSION,kind:'streetgraph',identity:id,counts,blocks}));
 need(header.length<=L.maxHeaderBytes,'HEADER_BUDGET');const size=PREFIX+header.length+bodyBytes;sizes(counts,L,size);
 const wire=new Uint8Array(size),prefix=new DataView(wire.buffer);wire.set(MAGIC);wire.set(header,PREFIX);
 const body=wire.subarray(PREFIX+header.length),view=new DataView(body.buffer,body.byteOffset,body.byteLength),by=Object.fromEntries(blocks.map(b=>[b.name,b]));
 const set=(name,i,v)=>{const b=by[name],at=b.offset+i*(b.type==='f64'?8:b.type==='u32'?4:1);if(b.type==='f64')view.setFloat64(at,v,true);else if(b.type==='u32')view.setUint32(at,v,true);else view.setUint8(at,v);};
 let at=0;set('nbOffsets',0,0);
 for(let i=0;i<counts.nodes;i++){const n=graph.nodes[i];set('nodeXY',i*2,n.x);set('nodeXY',i*2+1,n.z);set('nodeFlags',i,Object.hasOwn(n,'out')?1|(n.out?2:0):0);
  for(const nb of n.nb){need(integer(nb,counts.nodes-1),'NEIGHBOR_RANGE');set('nbIDs',at++,nb);}set('nbOffsets',i+1,at);}
 for(let i=0;i<ordered.length;i++){const e=ordered[i][1];need(integer(e.a,counts.nodes-1)&&integer(e.b,counts.nodes-1),'EDGE_REFERENCE');
  set('edgeABRoad',i*3,e.a);set('edgeABRoad',i*3+1,e.b);set('edgeABRoad',i*3+2,roadIndex.get(e.road));for(let j=0;j<9;j++)set('edgeNumbers',i*9+j,e[NUMBERS[j]]);
  set('edgeFlags',i,(e.ok?1:0)|(e.oneway?2:0)|(Object.hasOwn(e,'closed')?4:0));}
 validateData(counts,reader(body,blocks),roads,L,size);
 prefix.setUint32(8,VERSION,true);prefix.setUint32(12,header.length,true);prefix.setUint32(16,bodyBytes,true);prefix.setUint32(20,crc(header),true);prefix.setUint32(24,crc(body),true);
 return wire;
}

export function decodeStreetGraph(bytes,{roads,identity,limits={}}){
 const expected=identityOf(identity),L=limitsOf(limits);need(bytes instanceof Uint8Array&&bytes.length>=PREFIX,'TRUNCATED');
 const p=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);for(let i=0;i<8;i++)need(bytes[i]===MAGIC[i],'MAGIC');need(p.getUint32(8,true)===VERSION,'VERSION');
 const headerBytes=p.getUint32(12,true),bodyBytes=p.getUint32(16,true);need(headerBytes>0&&headerBytes<=L.maxHeaderBytes,'HEADER_BUDGET');need(bodyBytes<=L.maxPayloadBytes,'PAYLOAD_BUDGET');need(PREFIX+headerBytes+bodyBytes===bytes.length,'WIRE_LENGTH');
 const header=bytes.subarray(PREFIX,PREFIX+headerBytes),body=bytes.subarray(PREFIX+headerBytes);need(crc(header)===p.getUint32(20,true),'HEADER_CRC');
 let h;try{h=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(header));}catch{need(false,'HEADER_JSON');}
 fields(h,['version','kind','identity','counts','blocks'],[],'HEADER');need(h.version===VERSION&&h.kind==='streetgraph','VERSION');
 const actual=identityOf(h.identity);need(Object.keys(expected).every(k=>actual[k]===expected[k]),'IDENTITY_MISMATCH');
 const plan=layout(h.counts,L);sizes(h.counts,L,bytes.length);need(Array.isArray(roads)&&roads.length===h.counts.roads,'ROAD_COUNT');
 need(Array.isArray(h.blocks)&&h.blocks.length===BLOCKS.length&&plan.bodyBytes===bodyBytes,'BLOCK_LAYOUT');
 for(let i=0;i<BLOCKS.length;i++){fields(h.blocks[i],['name','type','length','offset','bytes'],[],'BLOCK_LAYOUT');for(const k of ['name','type','length','offset','bytes'])need(h.blocks[i][k]===plan.blocks[i][k],'BLOCK_LAYOUT');}
 need(crc(body)===p.getUint32(24,true),'BODY_CRC');const get=reader(body,h.blocks),validated=validateData(h.counts,get,roads,L,bytes.length);
 // All structural checks and budgets precede output objects/neighbor arrays/Maps.
 const nodes=[],nodeIndex=new Map(),edges=new Map();
 for(let i=0;i<h.counts.nodes;i++){
  const n={x:get('nodeXY',i*2),z:get('nodeXY',i*2+1),nb:[]};for(let j=get('nbOffsets',i);j<get('nbOffsets',i+1);j++)n.nb.push(get('nbIDs',j));
  const f=get('nodeFlags',i);if(f&1)n.out=!!(f&2);nodes.push(n);nodeIndex.set(validated.keys[i],i);
 }
 for(let i=0;i<h.counts.edges;i++){
  const k=i*9,f=get('edgeFlags',i),e={a:get('edgeABRoad',i*3),b:get('edgeABRoad',i*3+1),
   len:get('edgeNumbers',k),ux:get('edgeNumbers',k+1),uz:get('edgeNumbers',k+2),rx:get('edgeNumbers',k+3),rz:get('edgeNumbers',k+4),
   w:get('edgeNumbers',k+5),w0:get('edgeNumbers',k+6),c:get('edgeNumbers',k+7),ok:!!(f&1),oneway:!!(f&2),lanes:get('edgeNumbers',k+8),road:roads[get('edgeABRoad',i*3+2)],tA:0,tB:0,sig:null,stopAt:0};if(f&4)e.closed=1;
  edges.set(edgeKey(e.a,e.b),e);
 }
 return{nodes,nodeIndex,edges};
}
