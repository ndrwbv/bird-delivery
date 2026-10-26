/* Камень по окончательной границе: земля слева, мощение справа.
   Соседние секции используют одну точку торца, включая угол и высоту. */
const key=p=>Math.round(p[0]*1e5)+','+Math.round(p[1]*1e5);
export function joinLandCurbs(edges,width=.12){
  const nodes=new Map(),sections=[],joins=[];
  const node=p=>{const k=key(p);let n=nodes.get(k);if(!n)nodes.set(k,n={p,in:[],out:[]});return n;};
  for(const e of edges){
    const a=node(e.a),b=node(e.b),length=Math.hypot(b.p[0]-a.p[0],b.p[1]-a.p[1]);if(length<1e-5||a===b)continue;
    const s={a:a.p,b:b.p,lift:e.lift,an:a,bn:b};a.out.push(s);b.in.push(s);sections.push(s);
  }
  const unit=s=>{const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],l=Math.hypot(dx,dz);return [dx/l,dz/l];};
  let open=0;
  for(const n of nodes.values()){
    const free=new Set(n.out);
    for(const prev of n.in){
      const u=unit(prev);let next=null,best=-Infinity;
      for(const s of free){const v=unit(s),turn=Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]);if(turn>best){best=turn;next=s;}}
      if(next){prev.next=next;next.prev=prev;free.delete(next);}else open++;
    }
    open+=free.size;
  }
  // Разбиение рёбер исходных покрытий не оставляет сотни коротких камней
  // на одном прямом краю; настоящие углы сохраняются.
  for(const s of sections){
    if(s.removed)continue;
    while(s.next&&s.next!==s&&!s.next.removed){
      const t=s.next,u=unit(s),v=unit(t);
      if(Math.abs(u[0]*v[1]-u[1]*v[0])>1e-7||u[0]*v[0]+u[1]*v[1]<.9999999||Math.abs(s.lift-t.lift)>.002)break;
      s.b=t.b;s.bn=t.bn;s.next=t.next;if(t.next)t.next.prev=s;t.removed=true;
    }
  }
  const active=sections.filter(s=>!s.removed);
  for(const s of active){const u=unit(s);s.outA=[s.a[0]+u[1]*width,s.a[1]-u[0]*width];s.outB=[s.b[0]+u[1]*width,s.b[1]-u[0]*width];}
  for(const s of active){
    const next=s.next;if(!next||next.removed)continue;
    const u=unit(s),v=unit(next),nx=u[1]+v[1],nz=-u[0]-v[0],den=1+u[0]*v[0]+u[1]*v[1];
    if(den>1e-8&&Math.hypot(nx,nz)*width/den<=width*4){
      const p=[s.b[0]+nx*width/den,s.b[1]+nz*width/den];s.outB=next.outA=p;
    }else joins.push({p:s.b,a:s.outB,b:next.outA,lift:Math.min(s.lift,next.lift)});
  }
  return {sections:active,joins,open};
}
