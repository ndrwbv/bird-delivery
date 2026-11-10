import { drainSteps } from './landcache17a/cooperative.js';
/* Камень по окончательной границе: земля слева, мощение справа.
   Соседние секции используют одну точку торца, включая угол и высоту. */
const key=p=>Math.round(p[0]*1e5)+','+Math.round(p[1]*1e5);
export const joinLandCurbs = (edges, width) => drainSteps(joinLandCurbsSteps(edges, width));
export function* joinLandCurbsSteps(edges,width=.12){
  const nodes=new Map(),sections=[],joins=[];
  const node=p=>{const k=key(p);let n=nodes.get(k);if(!n)nodes.set(k,n={p,in:null,out:null});return n;};
  const add=(n,k,s)=>{if(!n[k])n[k]=s;else if(Array.isArray(n[k]))n[k].push(s);else n[k]=[n[k],s];};
  let work=0;
  for(const e of edges){
    if(++work%128===0)yield 'бордюры: узлы';
    const a=node(e.a),b=node(e.b),dx=b.p[0]-a.p[0],dz=b.p[1]-a.p[1],length=Math.hypot(dx,dz);
    if(length<1e-5||a===b)continue;
    const s={a:a.p,b:b.p,lift:e.lift,ux:dx/length,uz:dz/length};add(a,'out',s);add(b,'in',s);sections.push(s);
  }
  let open=0;
  for(const n of nodes.values()){
    if(++work%128===0)yield 'бордюры: связность';
    if(!Array.isArray(n.in)&&!Array.isArray(n.out)){
      if(n.in&&n.out){n.in.next=n.out;n.out.prev=n.in;}else if(n.in||n.out)open++;
      continue;
    }
    const free=new Set(Array.isArray(n.out)?n.out:n.out?[n.out]:[]);
    for(const prev of Array.isArray(n.in)?n.in:n.in?[n.in]:[]){
      let next=null,best=-Infinity;
      for(const s of free){const turn=Math.atan2(prev.ux*s.uz-prev.uz*s.ux,prev.ux*s.ux+prev.uz*s.uz);if(turn>best){best=turn;next=s;}}
      if(next){prev.next=next;next.prev=prev;free.delete(next);}else open++;
    }
    open+=free.size;
  }
  // Разбиение рёбер исходных покрытий не оставляет сотни коротких камней
  // на одном прямом краю; настоящие углы сохраняются.
  for(const s of sections){
    if(++work%128===0)yield 'бордюры: секции';
    if(s.removed)continue;
    while(s.next&&s.next!==s&&!s.next.removed){
      const t=s.next;
      if(Math.abs(s.ux*t.uz-s.uz*t.ux)>1e-7||s.ux*t.ux+s.uz*t.uz<.9999999||Math.abs(s.lift-t.lift)>.002)break;
      s.b=t.b;s.next=t.next;if(t.next)t.next.prev=s;t.removed=true;
      const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],length=Math.hypot(dx,dz);
      s.ux=dx/length;s.uz=dz/length;
      if(++work%128===0)yield 'бордюры: секции';
    }
  }
  const active=sections.filter(s=>!s.removed);
  for(const s of active){
    if(++work%128===0)yield 'бордюры: торцы';
    s.outA=[s.a[0]+s.uz*width,s.a[1]-s.ux*width];s.outB=[s.b[0]+s.uz*width,s.b[1]-s.ux*width];
  }
  for(const s of active){
    if(++work%128===0)yield 'бордюры: углы';
    const next=s.next;if(!next||next.removed)continue;
    const nx=s.uz+next.uz,nz=-s.ux-next.ux,den=1+s.ux*next.ux+s.uz*next.uz;
    if(den>1e-8&&Math.hypot(nx,nz)*width/den<=width*4){
      const p=[s.b[0]+nx*width/den,s.b[1]+nz*width/den];s.outB=next.outA=p;
    }else joins.push({p:s.b,a:s.outB,b:next.outA,lift:Math.min(s.lift,next.lift)});
  }
  return {sections:active,joins,open};
}
