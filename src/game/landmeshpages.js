/* Временные вершины новой земли: небольшие страницы вместо повторных
   копий растущей клетки. Перед существующей склейкой — прежние массивы. */
export function createLandMeshPages(cs,capacity=1536){
  if(!Number.isInteger(capacity)||capacity<3)throw Error('Неверная ёмкость страницы');
  const pages=[];let current=null,n=0;
  return {
    reserve(count){
      if(count<1||count>capacity)throw Error('Запись не помещается на страницу');
      if(!current||current.n+count>capacity){current={pos:new Float32Array(capacity*3),col:new Uint8Array(capacity*cs),n:0,offset:0};pages.push(current);}
      current.offset=current.n;current.n+=count;n+=count;return current;
    },
    materialize(){
      const pos=new Float32Array(n*3),col=new Uint8Array(n*cs);let at=0;
      for(const p of pages){pos.set(p.pos.subarray(0,p.n*3),at*3);col.set(p.col.subarray(0,p.n*cs),at*cs);at+=p.n;}
      pages.length=0;current=null;n=0;return {pos,col};
    },
    get bytes(){return pages.length*capacity*(12+cs);}
  };
}
