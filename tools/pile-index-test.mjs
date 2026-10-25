import assert from 'node:assert/strict';
import { indexPile } from '../src/game/pileindex.js';

function fixture(unique, repeat=4, keep=6) {
  const n=unique*repeat+keep,p=new Float32Array(n*3),c=new Uint8Array(n*3),a=new Uint8Array(n*4);
  for(let v=0;v<n;v++){
    const k=v<keep?0:(v-keep)%unique;
    p.set([k%300,Math.floor(k/300),k%7],v*3);
    c.set([k%256,70,30],v*3);a.set([1,k%256,2,0],v*4);
  }
  return {p,c,a,keep};
}
function verify(f) {
  const {p,c,a,keep}=f, copies=[p.slice(),c.slice(),a.slice()],r=indexPile(p,c,a,keep);
  assert.ok(r,'Ожидалась экономия памяти');
  assert.ok(r.p.byteLength+r.c.byteLength+r.a.byteLength+r.index.byteLength<p.byteLength+c.byteLength+a.byteLength);
  const inputBits=new Uint32Array(p.buffer),outputBits=new Uint32Array(r.p.buffer);
  for(let v=0;v<p.length/3;v++){
    const w=r.index[v];
    assert.ok(v<keep?w===v:w>=keep,'Живые вершины независимы от статики');
    for(let k=0;k<3;k++){assert.equal(outputBits[w*3+k],inputBits[v*3+k]);assert.equal(r.c[w*3+k],c[v*3+k]);}
    for(let k=0;k<4;k++)assert.equal(r.a[w*4+k],a[v*4+k]);
  }
  assert.deepEqual([p,c,a],copies,'Исходные данные не меняются');
  return r;
}
const small=fixture(100);
// Одинаковая позиция, но другие цвет, вид, зерно или палитра — разные вершины.
small.c[106*3]=255;small.a[206*4]=3;small.a[306*4+1]=255;
const s=verify(small);assert.ok(s.index instanceof Uint16Array);
const distinct=[6,106,206,306].map(v=>s.index[v]);assert.equal(new Set(distinct).size,4);
verify(fixture(100,4,120));
const large=verify(fixture(66000,3));assert.ok(large.index instanceof Uint32Array);
const noGain=fixture(100,1,0);assert.equal(indexPile(noGain.p,noGain.c,noGain.a,0),null);
const live=fixture(100);assert.equal(indexPile(live.p,live.c,live.a,live.p.length/3),null);
console.log('pile-index: геометрия и все атрибуты сохранены; живые вершины независимы; 16/32-битные индексы проверены');
