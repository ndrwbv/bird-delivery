/* Frozen pre-transfer buildSpots reference. Runs no game or world; independent callers/counters test observable behavior. */
import assert from 'node:assert/strict';
import {buildAddressSpotsSteps} from '../src/game/addresslayout.js';
// Original body SHA256: 473325b9000b240a28d1ec3b98896b8174777f03757879940566c46c96117a3e. Do not update it when changing the extracted implementation.
function oldReference({entrances,paths,lots,spots,lerp,inPoly,inBounds,groundH,inHouse,nearestRoad,blocks}){
 const CITY={entrances,paths,lots},SPOTS=spots,JUMPS={blocks};
 return (function* buildSpots () {
  const cand = [];
  for (const [x, z, nx, nz] of CITY.entrances) cand.push([x + nx * 3, z + nz * 3]);
  for (const q of CITY.paths) {
    if (q.far) continue;                           // длинный выход двора через газон к улице (yards.js farLinks) — не адрес
    let acc = 0;
    for (let i = 1; i < q.length; i++) {
      const l = Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]);
      for (let d = 12 - acc; d < l; d += 25) cand.push([lerp(q[i - 1][0], q[i][0], d / l), lerp(q[i - 1][1], q[i][1], d / l)]);
      acc = (acc + l) % 25;
    }
  }
  for (const lot of CITY.lots) {
    if (lot.k !== 'park') continue;
    let x = 0, z = 0;
    for (const q of lot.p) { x += q[0] / lot.p.length; z += q[1] / lot.p.length; }
    if (inPoly(x, z, lot.p)) cand.push([x, z]);
  }
  yield 'cand';
  const G = new Map(), gk6 = (i, j) => i * 100003 + j;
  for (const s of SPOTS) { const k = gk6(Math.floor(s.x / 6), Math.floor(s.z / 6)); const a = G.get(k); if (a) a.push(s); else G.set(k, [s]); }
  const near = (x, z) => {
    const ci = Math.floor(x / 6), cj = Math.floor(z / 6);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const a = G.get(gk6(i, j));
      if (a) for (const s of a) if (Math.abs(s.x - x) < 6 && Math.abs(s.z - z) < 6) return true;
    }
    return false;
  };
  let n = 0;
  for (const [x, z] of cand) {
    if (++n % 1500 === 0) yield 'spots';
    if (!inBounds(x, z, 20) || groundH(x, z) < 0.3 || inHouse(x, z, 1.4)) continue;
    const any = nearestRoad(x, z, 7, 1);
    if (any && any.d < any.seg.w / 2 + 1.2) continue;           // на асфальте не стоим
    const street = nearestRoad(x, z, 5, 1);
    if (street && street.d < street.seg.w / 2 + 12) continue;   // у самой улицы — не вглубь
    if (near(x, z)) continue;
    if (JUMPS.blocks(x, z, 4)) continue;                       // не на горке, разгоне и полёте большого трамплина (jumps.js)
    const s = { x, z };
    SPOTS.push(s);
    const k = gk6(Math.floor(x / 6), Math.floor(z / 6)); const a = G.get(k); if (a) a.push(s); else G.set(k, [s]);
  }
})();
}

const lerp=(a,b,t)=>a+(b-a)*t;
function inPolygon(x,z,p){let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
function setup({entrances=[],paths=[],lots=[],spots=[],answers={}}={}){
 const calls=[],defaults={lerp,inPoly:inPolygon,inBounds:()=>true,groundH:()=>1,inHouse:()=>false,nearestRoad:()=>null,blocks:()=>false};
 const ctx={entrances,paths,lots,spots};
 for(const [name,fn] of Object.entries(defaults))ctx[name]=(...args)=>{calls.push([name,...args]);return(answers[name]||fn)(...args);};
 return{ctx,calls};
}
let checks=0;
function test(name,fn){fn();checks++;}
function compare(make,onYield=()=>{}){
 const old=make(),actual=make(),a=oldReference(old.ctx),b=buildAddressSpotsSteps(actual.ctx);
 const immutable=s=>structuredClone({entrances:s.ctx.entrances,paths:s.ctx.paths,lots:s.ctx.lots});
 const beforeOld=immutable(old),beforeActual=immutable(actual),initialOld=[...old.ctx.spots],initialActual=[...actual.ctx.spots];
 const steps=[];let i=0;
 for(;;){
  const ar=a.next(),br=b.next();assert.deepEqual(br,ar,'generator protocol differs');assert.deepEqual(actual.ctx.spots,old.ctx.spots,'ordered live points differ');assert.deepEqual(actual.calls,old.calls,'callback order/arguments differ');
  initialOld.forEach((row,n)=>assert.equal(old.ctx.spots[n],row));initialActual.forEach((row,n)=>assert.equal(actual.ctx.spots[n],row));
  steps.push({value:br.value,done:br.done,spots:actual.ctx.spots.map(s=>[s.x,s.z]),calls:actual.calls.length});
  if(br.done)break;
  onYield(old,ar,i);onYield(actual,br,i);i++;
 }
 assert.deepEqual(immutable(old),beforeOld);assert.deepEqual(immutable(actual),beforeActual);
 return{...actual,steps};
}
const entries=xs=>xs.map(x=>[x,0,0,0]);
const realRandom=Math.random;
Math.random=()=>assert.fail('address layout must never consume RNG');
try{
 test('empty input retains its one cand yield and implicit undefined return',()=>{
  const s=compare(()=>setup());assert.deepEqual(s.steps.map(({value,done})=>({value,done})),[{value:'cand',done:false},{value:undefined,done:true}]);assert.deepEqual(s.calls,[]);
 });
 test('entrance offset is normal times3 without normalization or Float32 quantization',()=>{
  const rows=[[1.25,-2.5,2,-.5],[100000000.125,100000000.25,.123456789,-.987654321]];
  const s=compare(()=>setup({entrances:structuredClone(rows)}));
  assert.deepEqual(s.ctx.spots,[{x:7.25,z:-4},{x:100000000.125+.123456789*3,z:100000000.25-.987654321*3}]);
  assert.notEqual(s.ctx.spots[1].x,Math.fround(s.ctx.spots[1].x));
 });
 test('path accumulator crosses segments at12/25 and far paths are excluded; hw survives',()=>{
  const make=()=>{const q=[[0,0],[10,0],[40,0],[80,0]],far=[[0,100],[100,100]];q.hw=.75;far.far=1;far.hw=1.5;return setup({paths:[q,far,[[200,200]]]});};
  const s=compare(make);assert.deepEqual(s.ctx.spots.map(q=>[q.x,q.z]),[[12,0],[37,0],[62,0]]);assert.equal(s.ctx.paths[0].hw,.75);assert.equal(s.ctx.paths[1].far,1);
 });
 test('park vertex mean is accepted only inside polygon, including concave exclusion',()=>{
  const s=compare(()=>setup({lots:[{k:'park',p:[[0,0],[6,0],[6,6],[4,6],[4,2],[2,2],[2,6],[0,6]]},{k:'park',p:[[100,100],[110,100],[110,110],[100,110]]},{k:'other',p:[[200,200],[220,200],[220,220],[200,220]]}]}));
  assert.deepEqual(s.ctx.spots,[{x:105,z:105}]);assert.equal(s.calls.filter(c=>c[0]==='inPoly').length,2);
 });
 test('entrance candidates win stable dedup ties over paths and park centers',()=>{
  const s=compare(()=>setup({entrances:[[12,0,0,0]],paths:[[[0,0],[40,0]]],lots:[{k:'park',p:[[9,-3],[15,-3],[15,3],[9,3]]}]}));
  assert.deepEqual(s.ctx.spots,[{x:12,z:0},{x:37,z:0}]);
 });
 test('strict square exclusion keeps exactly6m but rejects either-side sub6 and negative-cell neighbors',()=>{
  const s=compare(()=>setup({spots:[{x:-6,z:0,tag:'keep'}],entrances:[[0,0,0,0],[5.999,0,0,0],[6,0,0,0],[6,6,0,0],[5.999,5.999,0,0],[-12,0,0,0],[-11.999,0,0,0],[-18,-6,0,0]]}));
  assert.deepEqual(s.ctx.spots.map(q=>[q.x,q.z]),[[-6,0],[0,0],[6,0],[6,6],[-12,0],[-18,-6]]);
 });
 test('preexisting objects are never replaced; additions after cand yield are seen by grid initialization',()=>{
  const s=compare(()=>setup({spots:[{x:0,z:0,token:{keep:true}}],entrances:entries([0,20,40])}),(s,step)=>{if(step.value==='cand')s.ctx.spots.push({x:20,z:0,token:'inserted between resumes'});});
  assert.deepEqual(s.ctx.spots.map(q=>[q.x,q.z]),[[0,0],[20,0],[40,0]]);assert.equal(s.ctx.spots[0].token.keep,true);assert.equal(s.ctx.spots[1].token,'inserted between resumes');
 });
 test('default filter thresholds and short circuit retain exact callback order/arguments',()=>{
  const s=compare(()=>setup({spots:[{x:140,z:0}],entrances:entries([0,20,40,60,80,100,120,140]),answers:{
   inBounds:(x,z,m)=>{assert.equal(m,20);return x!==0;},
   groundH:x=>x===20?.299999999: x===120?.3:1,
   inHouse:(x,z,m)=>{assert.equal(m,1.4);return x===40;},
   nearestRoad:(x,z,kind,n)=>{assert.equal(n,1);assert([7,5].includes(kind));if(x===60&&kind===7)return{d:6.199999,seg:{w:10}};if([80,100].includes(x))return{d:kind===7?6.2:(x===80?16.999999:17),seg:{w:10}};return null;},
   blocks:(x,z,r)=>{assert.equal(r,4);return x===100;}
  }}));
  assert.deepEqual(s.ctx.spots,[{x:140,z:0},{x:120,z:0}]);
  const names=x=>s.calls.filter(c=>c[1]===x).map(c=>c[0]);
  assert.deepEqual(names(0),['inBounds']);assert.deepEqual(names(20),['inBounds','groundH']);assert.deepEqual(names(40),['inBounds','groundH','inHouse']);
  assert.deepEqual(names(60),['inBounds','groundH','inHouse','nearestRoad']);
  assert.deepEqual(names(80),['inBounds','groundH','inHouse','nearestRoad','nearestRoad']);
  assert.deepEqual(names(100),['inBounds','groundH','inHouse','nearestRoad','nearestRoad','blocks']);
  assert.deepEqual(names(140),['inBounds','groundH','inHouse','nearestRoad','nearestRoad']);
 });
 test('1500th candidate yields before filtering/push; exact old step boundaries include rejected candidates',()=>{
  const s=compare(()=>setup({entrances:entries(Array.from({length:3001},(_,i)=>i*20))}));
  assert.deepEqual(s.steps.map(q=>[q.value,q.done,q.spots.length]),[['cand',false,0],['spots',false,1499],['spots',false,2999],[undefined,true,3001]]);
  const blocked=compare(()=>setup({entrances:entries(Array.from({length:1500},(_,i)=>i*20)),answers:{inBounds:()=>false}}));
  assert.deepEqual(blocked.steps.map(q=>[q.value,q.done,q.spots.length,q.calls]),[['cand',false,0,0],['spots',false,0,1499],[undefined,true,0,1500]]);
 });
 test('closed generator after cand does not mutate live list or invoke filters',()=>{
  for(const create of [oldReference,buildAddressSpotsSteps]){const row={x:0,z:0},s=setup({spots:[row],entrances:entries([20])}),it=create(s.ctx);assert.equal(it.next().value,'cand');it.return();assert.equal(s.ctx.spots.length,1);assert.equal(s.ctx.spots[0],row);assert.deepEqual(s.calls,[]);}
 });
 console.log(JSON.stringify({ok:true,checks,independentFrozenOldReference:true,noRng:true,noThree:true,noGame:true,exactYields:true,liveReferences:true}));
}finally{Math.random=realRandom;}
