import assert from 'node:assert/strict';
import {joinLandCurbs} from '../src/game/landcurb.js';
const ring=p=>p.map((a,i)=>({a,b:p[(i+1)%p.length],lift:.1}));
const box=ring([[0,0],[2,0],[4,0],[4,4],[0,4]]);
const mesh=joinLandCurbs([box[3],box[0],box[4],box[2],box[1]]);
assert.equal(mesh.open,0,'Замкнутая граница не имеет открытых концов');
assert.equal(mesh.sections.length,4,'Прямые части объединены без потери углов');
for(const s of mesh.sections){
  assert.strictEqual(s.b,s.next.a,'Соседние камни делят точку у газона');
  assert.strictEqual(s.outB,s.next.outA,'Соседние камни делят наружный торец');
  const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],l=Math.hypot(dx,dz);
  assert.ok(Math.abs(((s.outA[0]-s.a[0])*dz-(s.outA[1]-s.a[1])*dx)/l-.12)<1e-8,'Камень лежит со стороны мощения');
}
const hole=joinLandCurbs(ring([[0,0],[0,4],[4,4],[4,0]]));
assert.equal(hole.open,0);
for(const s of hole.sections)assert.strictEqual(s.outB,s.next.outA,'Торцы внутреннего кольца тоже совпадают');
const sharp=joinLandCurbs(ring([[0,0],[5,0],[.01,.01],[0,5]]));
assert.ok(sharp.joins.length>0,'Очень острый угол закрывается фаской вместо длинного шипа');
for(const j of sharp.joins)assert.ok(Math.hypot(j.a[0]-j.p[0],j.a[1]-j.p[1])<.5&&Math.hypot(j.b[0]-j.p[0],j.b[1]-j.p[1])<.5,'На остром углу нет длинного обрубка');
const open=joinLandCurbs([{a:[0,0],b:[2,0],lift:.1}]);assert.equal(open.open,2,'Отсечение у стены отражается в диагностике');
console.log('landcurb: общий торец, внешний и внутренний контуры, прямые стыки и фаска острого угла — OK');
