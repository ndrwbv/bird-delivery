import assert from 'node:assert/strict';
import {createLandMeshPages} from '../src/game/landmeshpages.js';
for(const cs of[3,4])for(const capacity of[9,192,1536]){
  const pages=createLandMeshPages(cs,capacity),n=4005,pos=new Float32Array(n*3),col=new Uint8Array(n*cs);
  for(let i=0;i<n;i+=3){
    const page=pages.reserve(3);
    for(let v=0;v<3;v++){
      const p=i+v;
      for(let k=0;k<3;k++){const x=p===0?-0:Math.sin(p+k)*10000;pos[p*3+k]=x;page.pos[(page.offset+v)*3+k]=x;}
      for(let k=0;k<cs;k++){const c=(p*17+k)&255;col[p*cs+k]=c;page.col[(page.offset+v)*cs+k]=c;}
    }
  }
  assert.ok(pages.bytes<=n*(12+cs)+capacity*(12+cs),'Резерв ограничен одной страницей, без удвоенных копий клетки');
  const result=pages.materialize();assert.deepEqual(result.pos,pos);assert.deepEqual(result.col,col);assert.ok(Object.is(result.pos[0],-0));
  assert.equal(pages.bytes,0);assert.equal(pages.materialize().pos.length,0);
  const next=pages.reserve(3);next.pos[0]=7;assert.equal(pages.materialize().pos[0],7,'Буферы допускают повторное использование');
}
console.log('landmeshpages: позиции Float32 и RGB/RGBA совпадают до бита; границы страниц, резерв и освобождение — OK');
