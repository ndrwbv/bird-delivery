/* Общие вершины сезонной статики: сравниваем все биты позиции, RGB и aux.
   Первые keep вершин правятся игрой и никогда не объединяются — ни друг с другом,
   ни со статикой. Плоский свет считает нормаль по производным, атрибута normal нет. */
export function indexPile(p, c, a, keep) {
  const n=p.length/3, stat=n-keep;
  if(stat<64)return null;
  let size=128;while(size<stat*2)size*=2;
  const table=new Int32Array(size).fill(-1), mask=size-1, ix=new Uint32Array(n);
  const bits=new Uint32Array(p.buffer,p.byteOffset,p.length);
  const aux=new Uint32Array(a.buffer,a.byteOffset,n);
  const rgb=v=>c[v*3]|(c[v*3+1]<<8)|(c[v*3+2]<<16);
  for(let v=0;v<keep;v++)ix[v]=v;
  let count=keep;
  for(let v=keep;v<n;v++){
    const x=bits[v*3],y=bits[v*3+1],z=bits[v*3+2],col=rgb(v),tag=aux[v];
    let h=Math.imul(x,0x9e3779b1)^Math.imul(y,0x85ebca6b)^Math.imul(z,0xc2b2ae35)^Math.imul(col,0x27d4eb2f)^Math.imul(tag,0x165667b1);
    h^=h>>>16;
    let slot=h&mask;
    for(;;){
      const e=table[slot];
      if(e<0){table[slot]=v;ix[v]=count++;break;}
      if(bits[e*3]===x&&bits[e*3+1]===y&&bits[e*3+2]===z&&rgb(e)===col&&aux[e]===tag){ix[v]=ix[e];break;}
      slot=(slot+1)&mask;
    }
  }
  const bytes=count<=65535?2:4;
  // Индекс тоже занимает память; небольшой выигрыш не окупает дополнительный буфер.
  if((n-count)*19<=n*bytes*1.1)return null;
  const pp=new Float32Array(count*3),cc=new Uint8Array(count*3),aa=new Uint8Array(count*4);
  const outBits=new Uint32Array(pp.buffer),outAux=new Uint32Array(aa.buffer);
  for(let v=0;v<n;v++){
    const w=ix[v];
    for(let k=0;k<3;k++){outBits[w*3+k]=bits[v*3+k];cc[w*3+k]=c[v*3+k];}
    outAux[w]=aux[v];
  }
  return {p:pp,c:cc,a:aa,index:bytes===2?new Uint16Array(ix):ix};
}
