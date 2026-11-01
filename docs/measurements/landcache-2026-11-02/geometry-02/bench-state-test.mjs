import assert from 'node:assert/strict';import{benchState,compareBenchState}from'./bench-state.mjs';
const pivot={y:4,prop:{pivot:{position:{y:4.2}}}},p=benchState(pivot);assert.equal(p.representation,'pivot');assert.equal(compareBenchState(p,benchState(pivot)),'pivotY+benchY');
const attr={array:new Float32Array([0,-100,0,0,7,0,0,8,0,0,200,0]),itemSize:3,count:4},smash={y:6,prop:{kind:'bench',mesh:{position:{y:0},geometry:{attributes:{position:attr}}},v0:1,nv:2}},s=benchState(smash);
assert.equal(s.representation,'smash');assert.equal(s.cpuRange.minY,7);assert.equal(s.cpuRange.maxY,8);assert.equal(s.cpuRange.meanY,7.5);assert.match(compareBenchState(s,benchState(smash)),/retained CPU/);
attr.array=null;const released=benchState(smash);assert.equal(released.cpuRange.available,false);assert.equal(released.cpuRange.gpuProof,false);assert.throws(()=>compareBenchState(s,released),/availability mismatch/);assert.match(compareBenchState(released,benchState(smash)),/benchY-only/);
assert.throws(()=>compareBenchState(p,{...p,pivotY:4.4}),/alignment/);assert.throws(()=>compareBenchState(s,{...s,benchY:6.2}),/benchY/);
console.log(JSON.stringify({ok:true,actualVariants:['pivot','SMASH'],retainedRange:true,releasedCPUExplicit:true,alignmentMismatchRejected:true}));
