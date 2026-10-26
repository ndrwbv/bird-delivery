/* Упрощаем дуги, сохраняя каждое пересечение с общей стороной клетки.
   Обычная очистка могла удалить такую вершину лишь у одного соседа:
   вдоль шва оставались длинная тонкая щель и зелёная игла. */
export function simplifyRing(ring,core,tolerance=.01){
 if(ring.length<4)return ring;
 const onEdge=v=>Math.abs(v[0]-core[0])<1e-7||Math.abs(v[0]-core[2])<1e-7||Math.abs(v[1]-core[1])<1e-7||Math.abs(v[1]-core[3])<1e-7;
 const anchors=[];for(let i=0;i<ring.length;i++)if(onEdge(ring[i]))anchors.push(i);
 if(!anchors.length)anchors.push(0);
 if(anchors.length===1){const a=ring[anchors[0]];let far=0,d=-1;for(let i=0;i<ring.length;i++){const q=ring[i],v=(q[0]-a[0])**2+(q[1]-a[1])**2;if(v>d){d=v;far=i;}}anchors.push(far);anchors.sort((a,b)=>a-b);}
 const out=[];
 for(let k=0;k<anchors.length;k++){
  const a=anchors[k],b=anchors[(k+1)%anchors.length],chain=[];for(let i=a;;i=(i+1)%ring.length){chain.push(ring[i]);if(i===b)break;}
  const keep=new Set([0,chain.length-1]),stack=[[0,chain.length-1]];
  while(stack.length){const [i,j]=stack.pop(),u=chain[i],v=chain[j],dx=v[0]-u[0],dz=v[1]-u[1],len=dx*dx+dz*dz;let far=-1,best=tolerance*tolerance;
   for(let n=i+1;n<j;n++){const p=chain[n],t=Math.max(0,Math.min(1,((p[0]-u[0])*dx+(p[1]-u[1])*dz)/(len||1))),d=(p[0]-u[0]-dx*t)**2+(p[1]-u[1]-dz*t)**2;if(d>best){best=d;far=n;}}
   if(far!==-1){keep.add(far);stack.push([i,far],[far,j]);}}
  for(let i=0;i<chain.length-1;i++)if(keep.has(i))out.push(chain[i]);
 }
 return out;
}
