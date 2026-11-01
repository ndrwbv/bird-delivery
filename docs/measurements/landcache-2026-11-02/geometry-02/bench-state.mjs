/* Actual BENCHES variants: addProp pivot, or smashAdd mesh/v0/nv. Read-only. */
export function benchState(b){
 if(!Number.isFinite(b.y))throw Error('benchY is not finite');
 const p=b.prop,pivot=p?.pivot;
 if(pivot){if(!Number.isFinite(pivot.position?.y))throw Error('pivotY is not finite');return{representation:'pivot',benchY:b.y,pivotY:pivot.position.y};}
 const mesh=p?.mesh,v0=p?.v0,nv=p?.nv,attr=mesh?.geometry?.attributes?.position;
 const state={representation:'smash',benchY:b.y,meshPresent:!!mesh,meshPositionY:Number.isFinite(mesh?.position?.y)?mesh.position.y:null,v0:Number.isInteger(v0)?v0:null,nv:Number.isInteger(nv)?nv:null,cpuRange:{available:false,reason:'CPU position storage unavailable; benchY only',gpuProof:false}};
 const storage=attr?.array||attr?.data?.array,stride=attr?.isInterleavedBufferAttribute?attr.data.stride:attr?.itemSize,offset=attr?.isInterleavedBufferAttribute?attr.offset:0;
 if(!ArrayBuffer.isView(storage)||!Number.isInteger(v0)||!Number.isInteger(nv)||v0<0||nv<=0||!Number.isInteger(stride)||stride<3||offset<0||(v0+nv-1)*stride+offset+1>=storage.length)return state;
 let minY=Infinity,maxY=-Infinity,sumY=0;const selected=[0,Math.floor(nv/2),nv-1],ys=[];
 for(let i=0;i<nv;i++){const y=storage[(v0+i)*stride+offset+1];if(!Number.isFinite(y))throw Error('SMASH bench range Y is not finite');minY=Math.min(minY,y);maxY=Math.max(maxY,y);sumY+=y;if(selected.includes(i))ys.push({vertex:i,y});}
 state.cpuRange={available:true,minY,maxY,meanY:sumY/nv,ys,gpuProof:false};return state;
}
export function compareBenchState(expected,actual){
 const close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-6;
 if(expected.representation!==actual.representation||!close(expected.benchY,actual.benchY))throw Error('bench representation or benchY differs');
 if(actual.representation==='pivot'){if(!close(expected.pivotY,actual.pivotY))throw Error('pivot bench alignment differs');return'pivotY+benchY';}
 if(expected.meshPresent!==actual.meshPresent||expected.v0!==actual.v0||expected.nv!==actual.nv||expected.meshPositionY!==actual.meshPositionY)throw Error('SMASH bench mesh/range identity differs');
 if(expected.cpuRange.available!==actual.cpuRange.available)throw Error('SMASH bench CPU range availability mismatch');
 if(!actual.cpuRange.available)return'benchY-only; CPU arrays unavailable in both processes; no GPU proof';
 for(const key of ['minY','maxY','meanY'])if(!close(expected.cpuRange[key],actual.cpuRange[key]))throw Error('SMASH bench range Y differs');
 if(expected.cpuRange.ys.length!==actual.cpuRange.ys.length||expected.cpuRange.ys.some((p,i)=>p.vertex!==actual.cpuRange.ys[i].vertex||!close(p.y,actual.cpuRange.ys[i].y)))throw Error('SMASH bench selected vertex Y differs');
 return'benchY+retained CPU range Y; no GPU proof';
}
