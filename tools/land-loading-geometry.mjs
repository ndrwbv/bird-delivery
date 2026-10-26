import assert from 'node:assert/strict';
import {landLift} from '../src/game/landheight.js';

globalThis.location={search:'?curbtrace'};
const L=await import('../src/game/raisedland.js');
const C=await import('../src/game/curbs.js');

// До готовности области мощение определяет, перекрывает ли оно газон.
// После — готовая область уже решила это; повторный запрос запрещён.
let green=0,paving=0,queries=0;
L.green.height=()=>green;
L.cover.height=()=>{queries++;return paving;};
for(const [g,p,h,wanted] of [[.04,.1,3,.46],[.12,.1,3,.46+.12],[-Infinity,-Infinity,3,.46],[.04,.1,.4,.23]]){
  green=g;paving=p;
  assert.equal(L.topOffset(3,4,h),wanted,'До завершения контура сохраняется приоритет мощения');
}
assert.equal(queries,4);
L.finalMask.finish();
L.cover.height=()=>{throw Error('Лишний поиск мощения после готовности контура');};
for(const g of [-Infinity,0,.04,.12])for(const h of [-2,0,.4,3]){
  green=g;
  assert.equal(L.topOffset(3,4,h),landLift(h)+Math.max(0,g));
}

// Фактические торцы отрисованных камней должны остаться побитно теми же,
// в том числе на дальних координатах и после пропущенного низкого камня.
let checked=0;
for(const [a,b,lift,drop] of [
  [[0,0],[19.3,7.8],.085,false],
  [[-5100.13,4200.27],[-5070.77,4193.81],.12,false],
  [[0,0],[20,0],.085,true],
]){
  let heightCalls=0,topCalls=0;
  const height=(x,z)=>1+Math.sin(x*.11)*.03+z*.005;
  const offset=(x,z)=>drop&&x>6&&x<12?-.2:.46+Math.sin(z*.31)*.02;
  const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),n=Math.ceil(length/C.CURB.SEC);
  const oa=[a[0]+dz/length*C.CURB.W,a[1]-dx/length*C.CURB.W];
  const ob=[b[0]+dz/length*C.CURB.W,b[1]-dx/length*C.CURB.W];
  const mix=(u,v,t)=>t===0?u:t===1?v:[u[0]+(v[0]-u[0])*t,u[1]+(v[1]-u[1])*t];
  const expected=[];
  for(let i=0;i<n;i++){
    const u=mix(a,b,i/n),v=mix(a,b,(i+1)/n),ou=mix(oa,ob,i/n),ov=mix(oa,ob,(i+1)/n);
    const hu=height(...u)+offset(...u),hv=height(...v)+offset(...v);
    if(hu<=height(...ou)+lift-.035||hv<=height(...ov)+lift-.035)continue;
    expected.push(ou[0],ou[1],hu,u[0],u[1],hu,ov[0],ov[1],hv,v[0],v[1],hv,(u[0]+v[0])/2,(u[1]+v[1])/2,...u,...v);
  }
  for(const step of C.build({rebuild:true,contours:()=>[{a,b,lift}],
    groundH:(...p)=>{heightCalls++;return height(...p);},
    landTopAt:(...p)=>{topCalls++;return offset(...p);},
    LITM:{color(){},quad(){},up(){}}
  })){}
  assert.deepEqual(C.DEBUG.trace,expected,'Повторное использование торца не меняет геометрию и отбраковку');
  assert.equal(topCalls,n+1,'Высота общего торца вычисляется один раз');
  assert.equal(heightCalls,2*(n+1),'Внутренний и наружный торцы не вычисляются повторно');
  checked+=expected.length/18;
}
console.log(`land-loading: приоритет покрытия сохранён; ${checked} секций с прежними торцами, общие высоты вычисляются один раз`);
