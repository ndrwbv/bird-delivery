import assert from 'node:assert/strict';
import {ShapeUtils,Vector2} from '../src/vendor/three.module.min.js';
import {createLandCover} from '../src/game/landcover.js';
import {createLandMask} from '../src/game/landmask.js';
import {landCleanTileRegion} from '../src/game/landclean.js';
const rect=(x0,z0,x1,z1)=>[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
const triangulate=(outer,holes=[])=>({points:[...outer,...holes.flat()],triangles:ShapeUtils.triangulateShape(outer.map(p=>new Vector2(...p)),holes.map(h=>h.map(p=>new Vector2(...p))))});
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0))/2;
const tessellated=createLandCover();
for(let x=0;x<10;x++)for(let z=0;z<10;z++){
  tessellated.triangle(x,z,x+1,z,x,z+1);tessellated.triangle(x+1,z+1,x,z+1,x+1,z);
}
assert.equal(tessellated.inside(rect(1.1,1.1,8.9,8.9)).length,1,'Внутренние диагонали маски не дробят сплошную землю');
const mask=createLandMask();mask.reserve([0,0,32,32]);
mask.add([0,0,32,32],[{outer:rect(2,2,10,10),holes:[rect(4,4,8,8).reverse()]}],triangulate);mask.finish();
assert.equal(mask.contains(3,3),true);assert.equal(mask.contains(5,5),false);assert.equal(mask.contains(20,20),false);assert.equal(mask.contains(50,5),true);
const parts=[...mask.parts(rect(0,0,16,16))];assert.ok(Math.abs(parts.reduce((s,p)=>s+area(p),0)-48)<1e-6,'Отверстие и видимая площадь сохранены');
assert.deepEqual(mask.sides(3,2.00005,0,1),[true,true],'Внутренняя линия в 0,05 мм от края не становится границей');
assert.deepEqual(mask.sides(3,2,0,1),[true,false],'Стороны настоящего края определяются без отступа');
const wall=createLandCover();wall.triangle(5,1,6,1,5,2.005,.5);wall.triangle(6,2.005,5,2.005,6,1,.5);
const wallEdges=[...mask.boundaries({floorAt:(x,z)=>Number.isFinite(wall.height(x,z))?wall.height(x,z):.085,floorBreaks:(...a)=>wall.breaks(...a,.49)})].filter(Boolean);
const bottom=wallEdges.filter(e=>Math.abs(e.a[1]-2)<1e-8&&Math.abs(e.b[1]-2)<1e-8);
assert.ok(Math.abs(bottom.reduce((s,e)=>s+Math.hypot(e.b[0]-e.a[0],e.b[1]-e.a[1]),0)-7)<1e-7,'Стена скрывает только свой метр края, а не весь длинный отрезок');
assert.ok(bottom.some(e=>Math.abs(e.b[0]-5)<1e-7)&&bottom.some(e=>Math.abs(e.a[0]-6)<1e-7),'Оба торца заканчиваются у точных краёв стены');
const covers=(edge,others)=>{
  const dx=edge.b[0]-edge.a[0],dz=edge.b[1]-edge.a[1],l2=dx*dx+dz*dz,intervals=[];
  for(const e of others){
    if(e.lift!==edge.lift||[e.a,e.b].some(p=>Math.abs(dx*(p[1]-edge.a[1])-dz*(p[0]-edge.a[0]))>1e-8*Math.sqrt(l2)))continue;
    const t=[e.a,e.b].map(p=>((p[0]-edge.a[0])*dx+(p[1]-edge.a[1])*dz)/l2).sort((a,b)=>a-b);
    if(t[1]>0&&t[0]<1)intervals.push([Math.max(0,t[0]),Math.min(1,t[1])]);
  }
  intervals.sort((a,b)=>a[0]-b[0]);let end=0;
  for(const[a,b]of intervals){assert.ok(a<=end+1e-8,'Не перекрываем отсутствующий камень или пол другой высоты');end=Math.max(end,b);}
  assert.ok(end>=1-1e-8,'Вся исходная граница сохранена');
};
for(const includeWalls of[false,true]){
  const options={includeWalls,floorAt:(x,z)=>Number.isFinite(wall.height(x,z))?.5:x<8?.085:.11,floorBreaks:(ax,az,bx,bz)=>[...wall.breaks(ax,az,bx,bz,.49),...(bx!==ax&&8>Math.min(ax,bx)&&8<Math.max(ax,bx)?[(8-ax)/(bx-ax)]:[])]};
  const original=[...mask.boundaries({...options,coalesce:false})].filter(Boolean),merged=[...mask.boundaries(options)].filter(Boolean);
  assert.ok(merged.length<=original.length);
  for(const e of original)covers(e,merged);for(const e of merged)covers(e,original);
}
assert.ok(Math.abs([...mask.parts(rect(28,12,36,16))].reduce((s,p)=>s+area(p),0)-16)<1e-6,'Вне очищенной области открытая земля сохраняется');
const joined=createLandMask();
joined.add([0,0,32,32],[{outer:rect(20,4,32.005,12),holes:[]}],triangulate);
joined.add([32,0,64,32],[{outer:rect(31.995,4,40,12),holes:[]}],triangulate);joined.finish();
const total=[...joined.parts(rect(0,0,64,16))].reduce((s,p)=>s+area(p),0);
assert.ok(Math.abs(total-160)<1e-5,'Перекрытие соседних клеток не дублирует землю');
for(const x of [31.99999,32,32.00001])assert.ok(joined.contains(x,8),'Нет щели на стыке клеток');
const edges=[...joined.boundaries({accept:(x,z)=>x>1&&x<63&&z>1&&z<31})].filter(Boolean);
assert.ok(Math.abs(edges.reduce((s,e)=>s+Math.hypot(e.b[0]-e.a[0],e.b[1]-e.a[1]),0)-56)<1e-5,'Бордюр использует внешний контур, без внутренних швов');
const seam=createLandMask();
seam.add([0,0,32,32],[{outer:rect(20,4,32,12),holes:[]}],triangulate);
seam.add([32,0,64,32],[{outer:rect(32,4.0215,40,12),holes:[]}],triangulate);seam.finish();
const seamEdges=[...seam.boundaries({accept:(x,z)=>x>1&&x<63&&z>1&&z<31})].filter(Boolean);
assert.ok(!seamEdges.some(e=>Math.abs(e.a[0]-32)<1e-8&&Math.abs(e.b[0]-32)<1e-8),'Погрешность дуг соседних клеток не оставляет поперечный обрубок');
const corner=createLandMask();
corner.add([0,0,32,32],[{outer:rect(20,20,32,32),holes:[]}],triangulate);
corner.add([32,0,64,32],[{outer:rect(32,31.985,40,32),holes:[]}],triangulate);corner.finish();
assert.ok(corner.contains(31.999,31.999),'Подгонка соседнего пересечения не сдвигает угол клетки');
const crumb=createLandMask();
crumb.add([0,0,32,32],[{outer:rect(2,2,2.02,2.02),holes:[]}],triangulate);crumb.finish();
assert.equal(crumb.contains(2.01,2.01),false,'Изолированный микроскопический газон не остаётся опорой');
assert.ok(Math.abs(crumb.removedRegions.reduce((s,p)=>s+area(p.outer)-p.holes.reduce((a,h)=>a+area(h),0),0)-.0004)<1e-8,'Удалённая земля возвращается строителю серого пола, без отверстия');
const c=createLandCover(),g=createLandCover();
const pave=p=>{c.triangle(...p[0],...p[1],...p[3],.1);c.triangle(...p[2],...p[3],...p[1],.1);};
pave(rect(0,0,15.9,32));pave(rect(16.1,0,32,32));
const raw=(x,z)=>g.height(x,z)>c.height(x,z)||!c.covered(x,z),clean=createLandMask(raw);
clean.add([0,0,32,32],landCleanTileRegion(c,g,[0,0,32,32]).kept,triangulate);clean.finish();
assert.equal(clean.contains(16,16),false,'Тонкая земля удалена');
g.triangle(15.99,15.99,16.02,15.99,16,16.02,.2);
assert.equal(raw(16,16),true,'В промежуточной геометрии появился зелёный обрывок');
assert.equal(clean.contains(16,16),false,'Обрывок не возвращается в физическую землю');
assert.equal([...clean.parts(rect(15.99,15.99,16.01,16.01))].length,0,'Обрывок не возвращается в нарисованную землю');
for(const offset of[-5120,5120]){
  const m=createLandMask(),core=[offset,offset,offset+32,offset+32];
  m.reserve(core);assert.equal(m.cellState(offset+1,offset+1),false);
  m.add(core,[{outer:rect(offset+4,offset+4,offset+20,offset+20),holes:[]}],triangulate);
  assert.equal(m.cells,1,'Запись очищенной области не добавляет повторную клетку');m.finish();
  assert.equal(m.contains(offset+10,offset+10),true);assert.equal(m.contains(offset+1,offset+1),false);
  assert.equal(m.cellState(offset+40,offset+1),undefined);
  const original=[...m.boundaries({coalesce:false})].filter(Boolean),merged=[...m.boundaries()].filter(Boolean);
  for(const e of original)covers(e,merged);for(const e of merged)covers(e,original);
}
console.log('landmask: общая область опоры и рисунка, отверстия, стыки клеток и защита от зелёных обрывков — OK');
