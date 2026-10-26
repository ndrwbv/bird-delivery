import assert from 'node:assert/strict';
import {simplifyRing} from '../src/game/landsimplify.js';
const area=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0);
const ring=[[0,0],[32,0],[32,10],[31.999,10.001],[31,11],[0,11]];
for(const shift of [0,5000,-5000]){
  const p=ring.map(v=>[v[0]+shift,v[1]+shift]),core=[shift,shift,shift+32,shift+32],out=simplifyRing(p,core);
  assert.ok(out.includes(p[2]),'Конец общего края сохраняется, даже если соседняя вершина почти совпадает');
  for(const q of p.filter(v=>v[0]===core[0]||v[0]===core[2]||v[1]===core[1]||v[1]===core[3]))assert.ok(out.includes(q),'Все общие опорные точки сохранены');
  assert.equal(Math.sign(area(out)),Math.sign(area(p)),'Обход контура не перевёрнут');
}
const tangent=[[10,4],[32,4.001],[31.999,4.002],[10,5]],out=simplifyRing(tangent,[0,0,32,32]);
assert.ok(out.includes(tangent[1]),'Одиночное касание общей стороны не теряется');
const burr=[[0,0],[5,0],[5.0264,.1061],[5.032,.1049],[5.1903,2.7745],[0,3]],clean=simplifyRing(burr,[-10,-10,32,32]);
assert.ok(!clean.includes(burr[2])||!clean.includes(burr[3]),'Миллиметровый обратный зубец убран');
for(const p of burr){
  const distance=Math.min(...clean.map((a,i)=>{const b=clean[(i+1)%clean.length],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t);}));
  assert.ok(distance<=.010001,'Упрощение не сдвигает очертание больше сантиметра');
}
console.log('landsimplify: общие опорные точки, касание, направление, обратный зубец и ограничение изменения формы — OK');
