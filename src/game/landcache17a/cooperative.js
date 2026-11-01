/* Data-only scheduling units. These are size ceilings, never a wall-time/Deck guarantee. */
export function sliceOptions({maxBytes=65536,maxItems=2048}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<8||maxBytes>65536||maxBytes%8||!Number.isSafeInteger(maxItems)||maxItems<1||maxItems>2048)throw Error('land-cache17a:SLICE_OPTIONS');
 return{maxBytes,maxItems};
}
export function drainSteps(iterator){let step;do{step=iterator.next();}while(!step.done);return step.value;}
export function* phaseSteps(name,iterator,work=(_name,fn)=>fn()){
 // Every measured resume ends before yielding. Idle between resumes is never synchronous work.
 const resume=(kind,value)=>work(name,()=>{const step=iterator[kind](value);return step.done?step:{done:false,value:name};});
 const wrapped={[Symbol.iterator](){return this;},next:value=>resume('next',value)};
 if(typeof iterator.return==='function')wrapped.return=value=>resume('return',value);
 if(typeof iterator.throw==='function')wrapped.throw=value=>resume('throw',value);
 return yield* wrapped;
}
export function sliceBudget(options){
 const{maxBytes,maxItems}=sliceOptions(options);let bytes=0,items=0;
 return{maxBytes,maxItems,get room(){return maxBytes-bytes;},charge(n=0,count=1){bytes+=n;items+=count;if(bytes>=maxBytes||items>=maxItems){bytes=items=0;return true;}return false;}};
}
export function* copyTypedSteps(value,batch){
 const copy=new value.constructor(value.length),from=new Uint8Array(value.buffer,value.byteOffset,value.byteLength),to=new Uint8Array(copy.buffer,copy.byteOffset,copy.byteLength);
 if(batch.charge())yield 'allocate';
 for(let at=0;at<from.length;){const n=Math.min(batch.room,from.length-at);to.set(from.subarray(at,at+n),at);at+=n;if(batch.charge(n,0))yield 'copy';}
 return copy;
}
