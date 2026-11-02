import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {streetGraphInputHash} from '../src/game/streetgraph-input.js';
const roadWidth=r=>r.w||[0,12,8,6,4,3,2,4][r.c],drivable=r=>!r.x&&r.c!==6;
const fixture=()=>({roads:[{c:1,w0:9,l:2,o:1,p:[[-0,2.25],[3.125,-7]]},{c:6,p:[[1,2],[4,5]]}],roadWidth,drivable,open:true,borderMask:{C:4,x0:-8,z0:-4,nx:2,nz:2,a:Uint8Array.of(1,0,0,1)}});
let cases=0;
// Independent explicit transcript for this one fixture: native Node SHA is the digest oracle.
const parts=[Buffer.from('bird-streetgraph-input-v1\0')];
const u8=n=>parts.push(Buffer.from([n]));
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);parts.push(b);};
const f64=n=>{const b=Buffer.alloc(8);b.writeDoubleLE(n);parts.push(b);};
u32(2);u8(1);u8(1);[1,12,9,2].forEach(f64);u32(2);[-0,2.25,3.125,-7].forEach(f64);
u8(0);u8(0);[6,2,2,0].forEach(f64);u32(2);[1,2,4,5].forEach(f64);
u8(1);u8(1);[4,-8,-4].forEach(f64);[2,2,4].forEach(u32);parts.push(Buffer.from([1,0,0,1]));
const expected=createHash('sha256').update(Buffer.concat(parts)).digest('hex');
assert.equal(streetGraphInputHash(fixture()),expected);cases++;
assert.equal(streetGraphInputHash(fixture()),streetGraphInputHash(fixture()));cases++;
for(const change of [x=>x.roads.reverse(),x=>x.roads[0].p.reverse(),x=>x.roads[0].p[0][0]=0,x=>x.roads[0].p[0][1]+=Number.EPSILON*4,
 x=>x.roads[0].w=13,x=>x.roads[0].w0=8,x=>x.roads[0].l=3,x=>x.roads[0].o=0,x=>x.roads[1].c=7,
 x=>x.roads[0].x=1,x=>x.borderMask.a[0]=0,x=>x.borderMask.C=2,x=>x.borderMask.x0=-4,x=>x.open=false]){
 const x=fixture();change(x);assert.notEqual(streetGraphInputHash(x),expected);cases++;
}
let x=fixture();x.roads[0].n='new borrowed road name';x.roads[0].irrelevant={};assert.equal(streetGraphInputHash(x),expected);cases++;
x=fixture();x.roads[0].o=true;assert.equal(streetGraphInputHash(x),expected);cases++;
x=fixture();x.open=false;const h=streetGraphInputHash(x);x.borderMask.a[0]=0;assert.equal(streetGraphInputHash(x),h);cases++;
for(const [change,code]of [[x=>x.roads[0].p[0][0]=NaN,'NUMBER'],[x=>x.roads[0].p[0]=[],'POINT'],[x=>x.borderMask.a=new Uint8Array(3),'MASK_BYTES']]){
 x=fixture();change(x);assert.throws(()=>streetGraphInputHash(x),new RegExp(code));cases++;
}
assert.throws(()=>streetGraphInputHash(fixture(),{maxRoads:1}),/ROADS_BUDGET/);cases++;
assert.throws(()=>streetGraphInputHash(fixture(),{maxPoints:3}),/POINTS_BUDGET/);cases++;
assert.throws(()=>streetGraphInputHash(fixture(),{maxMaskBytes:3}),/MASK_BUDGET/);cases++;
assert.throws(()=>streetGraphInputHash(fixture(),{maxRoads:50001}),/LIMITS/);cases++;
assert.throws(()=>streetGraphInputHash(fixture(),{unexpected:1}),/LIMITS/);cases++;
const alias=fixture();alias.roads=[alias.roads[0],alias.roads[0]];
assert.throws(()=>streetGraphInputHash(alias),/ROAD_ALIAS/);cases++;
const distinct=fixture();distinct.roads=[distinct.roads[0],structuredClone(distinct.roads[0])];
assert.match(streetGraphInputHash(distinct),/^[a-f0-9]{64}$/);cases++;
// Crossing multiple SHA/scratch blocks must equal the independent byte stream.
const long=fixture();long.roads=[{c:1,p:Array.from({length:9000},(_,i)=>[i*.125,-i*.25])}];long.open=false;
const stream=[Buffer.from('bird-streetgraph-input-v1\0')];
const scalar=(n,kind)=>{const b=Buffer.alloc(kind==='u32'?4:8);kind==='u32'?b.writeUInt32LE(n):b.writeDoubleLE(n);stream.push(b);};
scalar(1,'u32');stream.push(Buffer.from([1,0]));[1,12,12,0].forEach(n=>scalar(n));scalar(9000,'u32');for(const p of long.roads[0].p)for(const n of p)scalar(n);stream.push(Buffer.from([0,0]));
assert.equal(streetGraphInputHash(long),createHash('sha256').update(Buffer.concat(stream)).digest('hex'));cases++;
const random=Math.random;Math.random=()=>{throw Error('RNG forbidden');};try{assert.equal(streetGraphInputHash(fixture()),expected);}finally{Math.random=random;}cases++;
console.log('Street graph functional input: '+cases+' PASS');
