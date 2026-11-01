/* Probe ceilings, NOT measured Steam Deck memory requirements. Explicit overrides must be recorded. */
export const DEFAULT_LIMITS=Object.freeze({maxHeaderBytes:4*1024*1024,maxPayloadBytes:128*1024*1024,maxBlockBytes:32*1024*1024,maxWorkingBytes:512*1024*1024,maxBlocks:8192,maxPages:1024,maxMapCells:500000,maxDomainCells:250000,maxDomainRows:10000,maxIndexIds:8000000,maxIdsPerCell:65536,maxTreeNodes:500000,maxDepth:24});
export function limitsOf(overrides={}){const out={...DEFAULT_LIMITS};for(const[k,v]of Object.entries(overrides)){if(!Object.hasOwn(out,k)||!Number.isSafeInteger(v)||v<=0||v>0x7fffffff)throw Error('land-cache17a:LIMIT_CONFIG');out[k]=v;}return out;}
export function budget(ok,L,{bytes=0,pages=0,cells=0,domainCells=0,domainRows=0,ids=0,inputBytes=0,headerBytes=0}={}){
 ok(bytes<=L.maxPayloadBytes,'PAYLOAD_BUDGET');ok(pages<=L.maxPages,'PAGE_BUDGET');ok(cells<=L.maxMapCells,'CELL_BUDGET');ok(domainCells<=L.maxDomainCells&&domainRows<=L.maxDomainRows,'DOMAIN_BUDGET');ok(ids<=L.maxIndexIds,'INDEX_BUDGET');
 // Charged headroom for input + decoded/owned target copies and per-cell/row metadata.
 // Counts/bytes are hard limits; object charges are conservative accounting, not a measured heap guarantee.
 const required=inputBytes+3*bytes+4*headerBytes+cells*192+domainCells*96+domainRows*128;
 try{ok(required<=L.maxWorkingBytes,'WORKING_BUDGET');}catch(error){error.budget={required,limit:L.maxWorkingBytes,bytes,pages,cells,domainCells,domainRows,ids,inputBytes,headerBytes};error.message+=' required='+required+' limit='+L.maxWorkingBytes;throw error;}
}
export function pageShape(ok,n,get){
 ok(Number.isSafeInteger(n)&&n>0&&n<=16384,'PAGE_SIZE');
 const xy=get('xy'),heights=get('heights'),indices=get('indices'),hi=get('heightIndex'),meta=get('meta'),mv=get('metaValues');
 ok(xy.type==='Float64Array'&&xy.length%2===0&&xy.length>=6&&xy.length/2<=Math.min(3*n,65536),'PAGE_VERTEX_BUDGET');
 ok(heights.type==='Float64Array'&&heights.length>0&&heights.length<=n,'PAGE_HEIGHT_BUDGET');
 ok(indices.type==='Uint16Array'&&indices.length===3*n,'PAGE_INDICES');
 ok(['Uint8Array','Uint16Array'].includes(hi.type)&&hi.length===n,'HEIGHT_INDEX');
 ok(['Uint8Array','Uint16Array'].includes(meta.type)&&meta.length===n&&mv.type==='Uint32Array'&&mv.length>0&&mv.length<=n,'PAGE_META_BUDGET');
}
