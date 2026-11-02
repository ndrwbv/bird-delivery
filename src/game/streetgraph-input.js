/* Exact functional input for the ordered base graph; never hashes a scene or runtime overlays. */
import {Sha256} from './landcache17a/sha256.js';

const need=(ok,code)=>{if(!ok)throw Error('streetgraph-input:'+code);};
const DEFAULTS=Object.freeze({maxRoads:50000,maxPoints:1000000,maxMaskBytes:16*1024*1024});
export function streetGraphInputHash({roads,roadWidth,drivable,open,borderMask},limits={}){
  const L={...DEFAULTS,...limits};
  for(const key of Object.keys(L))need(Object.hasOwn(DEFAULTS,key)&&Number.isSafeInteger(L[key])&&L[key]>=0&&L[key]<=DEFAULTS[key],'LIMITS');
  need(Array.isArray(roads)&&roads.length<=L.maxRoads,'ROADS_BUDGET');
  need(typeof roadWidth==='function'&&typeof drivable==='function','FUNCTIONS');
  let points=0;const seenRoads=new Set();
  for(const r of roads){need(r&&Array.isArray(r.p),'ROAD_POINTS');need(!seenRoads.has(r),'ROAD_ALIAS');seenRoads.add(r);points+=r.p.length;need(points<=L.maxPoints,'POINTS_BUDGET');}
  const mask=open?borderMask:null;
  if(mask){
    need(Number.isSafeInteger(mask.nx)&&Number.isSafeInteger(mask.nz)&&mask.nx>0&&mask.nz>0,'MASK_SHAPE');
    need(mask.nx<=L.maxMaskBytes&&mask.nz<=L.maxMaskBytes&&mask.nx*mask.nz<=L.maxMaskBytes,'MASK_BUDGET');
    need(mask.a instanceof Uint8Array&&mask.a.length===mask.nx*mask.nz,'MASK_BYTES');
  }
  const hash=new Sha256(),scratch=new Uint8Array(65536),view=new DataView(scratch.buffer);
  let at=0;
  const flush=()=>{if(at){hash.update(scratch.subarray(0,at));at=0;}};
  const room=n=>{if(at+n>scratch.length)flush();};
  const u8=n=>{room(1);scratch[at++]=n;};
  const u32=n=>{need(Number.isSafeInteger(n)&&n>=0&&n<=0xffffffff,'COUNT');room(4);view.setUint32(at,n,true);at+=4;};
  const f64=n=>{need(typeof n==='number'&&Number.isFinite(n),'NUMBER');room(8);view.setFloat64(at,n,true);at+=8;};
  hash.update(new TextEncoder().encode('bird-streetgraph-input-v1\0'));
  u32(roads.length);
  for(const r of roads){
    // The production callbacks are pure roadWidth/drivable. Capture their actual results, not a class guess.
    const w=roadWidth(r);u8(drivable(r)?1:0);u8(r.o?1:0);
    f64(r.c);f64(w);f64(r.w0||w);f64(r.l||0);u32(r.p.length);
    for(const p of r.p){need(Array.isArray(p)&&p.length>=2,'POINT');f64(p[0]);f64(p[1]);}
  }
  u8(open?1:0);u8(mask?1:0);
  if(mask){
    f64(mask.C);f64(mask.x0);f64(mask.z0);u32(mask.nx);u32(mask.nz);u32(mask.a.length);flush();
    for(let i=0;i<mask.a.length;i+=65536)hash.update(mask.a.subarray(i,i+65536));
  }
  flush();return hash.hex();
}
