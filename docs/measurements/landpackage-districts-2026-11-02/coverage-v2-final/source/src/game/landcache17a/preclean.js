import {drainSteps,phaseSteps,sliceBudget,sliceOptions} from './cooperative.js';
import {Sha256} from './sha256.js';
import {limitsOf,pageShape,budget} from './checkpoint-limits.js';
const enc=new TextEncoder(),little=new Uint8Array(new Uint16Array([1]).buffer)[0]===1;
const ok=(v,code)=>{if(!v)throw Error('land-export17a:'+code);};
const u32=n=>{ok(Number.isSafeInteger(n)&&n>=0&&n<=0xffffffff,'LENGTH');const a=new Uint8Array(4);new DataView(a.buffer).setUint32(0,n,true);return a;};
const f64=n=>{ok(Number.isFinite(n),'NUMBER');const a=new Uint8Array(8);new DataView(a.buffer).setFloat64(0,n,true);return a;};
function* value(v){if(v===null){yield u32(0);return;}if(typeof v==='boolean'){yield u32(v?2:1);return;}if(typeof v==='number'){yield u32(3);yield f64(v);return;}if(typeof v==='string'){const s=enc.encode(v);yield u32(4);yield u32(s.length);yield s;return;}ok(v&&Object.getPrototypeOf(v)===Object.prototype,'PARAMETER');yield u32(5);const keys=Object.keys(v).sort();yield u32(keys.length);for(const k of keys){yield* value(k);yield* value(v[k]);}}
function* typed(a){yield* value(a.constructor.name);yield u32(a.length);const b=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);for(let at=0;at<b.length;at+=65536){let part=b.subarray(at,at+65536);if(!little&&a.BYTES_PER_ELEMENT>1){part=part.slice();for(let i=0;i<part.length;i+=a.BYTES_PER_ELEMENT)part.subarray(i,i+a.BYTES_PER_ELEMENT).reverse();}yield part;}}
function* validateFieldsSteps(covers,L,batch){let bytes=0,pages=0,cells=0,ids=0;for(const c of covers){ok(c?.version===1&&c.cell===32&&c.grid instanceof Map,'COVER');cells+=c.grid.size;for(const list of c.grid.values()){ok(list instanceof Uint32Array&&list.length<=L.maxIdsPerCell,'GRID');ids+=list.length;bytes+=list.byteLength;if(batch.charge())yield;}if(c.packed){pages+=c.packed.blocks.length;for(const p of c.packed.blocks){pageShape(ok,p.n,k=>({type:p[k]?.constructor?.name,length:p[k]?.length}));for(const k of ['xy','heights','indices','heightIndex','meta','metaValues']){ok(p[k].byteLength<=L.maxBlockBytes,'BLOCK');bytes+=p[k].byteLength;if(batch.charge())yield;}}}}budget(ok,L,{bytes,pages,cells,ids});}
function* encodeFields(fields,cores,parameters,L){yield enc.encode('B17PRECLEAN-v1\0');yield* value(parameters);
 for(const c of fields){yield* value(c.version);yield* value(c.cell);yield* value(!!c.packed);if(c.packed){yield* value(c.packed.n);yield* value(c.packed.end);yield u32(c.packed.blocks.length);for(const p of c.packed.blocks){yield u32(p.n);for(const k of ['xy','heights','indices','heightIndex','meta','metaValues'])yield* typed(p[k]);}}yield u32(c.grid.size);for(const[k,list]of c.grid){yield* value(k);yield* typed(list);}}
 let count=0;for(const{core,skipped}of cores){ok(core.length===4&&typeof skipped==='boolean'&&++count<=L.maxMapCells,'CORES');yield u32(6);for(const n of core)yield f64(n);yield u32(skipped?1:0);}yield u32(7);yield u32(count);
}
export function* encodePreclean({cover,green,cores,parameters,limits={}}){const L=limitsOf(limits),fields=[cover.snapshot(),green.snapshot()];drainSteps(validateFieldsSteps(fields,L,sliceBudget()));yield* encodeFields(fields,cores,parameters,L);}
/* Prepared cover/green snapshots and the core iterator must remain unchanged until completion/cancel. */
export function* precleanHashSteps({cover,green,cores,parameters,limits:inputLimits}, {work,limits={},...options}={}){
 const L=limitsOf(inputLimits||limits),fields=[cover.snapshot(),green.snapshot()],slice=sliceOptions(options);
 yield* phaseSteps('raisedland.cache.preclean.validate',validateFieldsSteps(fields,L,sliceBudget(options)),work);
 return yield* phaseSteps('raisedland.cache.preclean.hash',(function*(){
  const hash=new Sha256(),buffer=new Uint8Array(slice.maxBytes);let used=0,records=0;
  for(const bytes of encodeFields(fields,cores,parameters,L)){
   for(let at=0;at<bytes.length;){const n=Math.min(buffer.length-used,bytes.length-at);buffer.set(bytes.subarray(at,at+n),used);used+=n;at+=n;if(used===buffer.length){hash.update(buffer);used=records=0;yield;}}
   if(++records>=slice.maxItems){if(used)hash.update(buffer.subarray(0,used));used=records=0;yield;}
  }
  if(used)hash.update(buffer.subarray(0,used));return hash.hex();
 })(),work);
}
export function precleanHash(input,options={}){return drainSteps(precleanHashSteps(input,options));}
