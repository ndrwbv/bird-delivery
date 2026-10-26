/* Фактические соседние торцы нового камня. Очень короткая секция может
   целиком попасть в поисковые 2 см старой проверки; её разные концы
   не являются одним стыком. Допуск реального стыка остаётся 3 см. */
await until(()=>d.RLAND?.ST.built&&!d.LATE.busy(),180000);
const C=d.CURBS,T=C?.trace,Q=C?.traceTopology;
if(!T||!Q)throw Error('Нужны новый контур и curbtrace');
const N=T.length/18,vert=(s,e)=>{
  if(!Number.isInteger(s)||s<0||s>=N)throw Error('Неверная секция в связях бордюра');
  return T.slice(s*18+e*6,s*18+e*6+6);
};
const ends=new Uint8Array(N*2),mark=(s,e)=>{vert(s,e);ends[s*2+e]++;};
const out={ok:false,sections:N,joins:0,bridges:0,gap:0,step:0,open:0,pairedOpen:0,wall:0,shore:0,outside:0,unmatched:0,untracked:0,duplicates:0,worst:0,sample:[]};
const check=(a,b,where)=>{
  const gap=Math.max(Math.hypot(a[0]-b[0],a[1]-b[1]),Math.hypot(a[3]-b[3],a[4]-b[4])),step=Math.max(Math.abs(a[2]-b[2]),Math.abs(a[5]-b[5]));
  out.worst=Math.max(out.worst,gap);if(gap>.03)out.gap++;if(step>.03)out.step++;
  if((gap>.03||step>.03)&&out.sample.length<12)out.sample.push({where,a,b,gap,step});
};
for(let i=0;i<Q.links.length;i+=2){mark(Q.links[i],1);mark(Q.links[i+1],0);check(vert(Q.links[i],1),vert(Q.links[i+1],0),[Q.links[i],Q.links[i+1]]);out.joins++;if(i%8192===0)await wait(0);}
for(let i=0;i<Q.bridges.length;i+=9){
  const [a,b,x,z,ax,az,bx,bz,h]=Q.bridges.slice(i,i+9);
  mark(a,1);mark(b,0);
  check(vert(a,1),[ax,az,h,x,z,h],['фаска',a]);check(vert(b,0),[bx,bz,h,x,z,h],['фаска',b]);out.bridges++;
}
const open=[],grid=new Map(),key=(x,z)=>Math.floor(x)+','+Math.floor(z);
const nearWall=(x,z)=>{
  if(C.api.inHouse(x,z,.15))return true;
  // Полы зданий добавлены prepare без цвета. Проверяем их точные грани:
  // inHouse с запасом пропускал соседнюю клетку и диагональный угол.
  for(const t of d.RLAND.cover?.inBox([x-.15,z-.15,x+.15,z+.15])||[]){
    if(t.lift<.49||t.rgb)continue;
    let inside=true;
    for(let i=0;i<3;i++){
      const a=t.p[i],b=t.p[(i+1)%3],dx=b[0]-a[0],dz=b[1]-a[1],cross=dx*(z-a[1])-dz*(x-a[0]);if(cross < -1e-8)inside=false;
      const k=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
      if(Math.hypot(x-a[0]-dx*k,z-a[1]-dz*k)<=.15)return true;
    }
    if(inside)return true;
  }
  return false;
};
for(let i=0;i<Q.open.length;i+=2){
  const s=Q.open[i],end=Q.open[i+1],v=vert(s,end),x=v[3],z=v[4];out.open++;
  mark(s,end);
  if(nearWall(x,z)){out.wall++;continue;}
  if(d.RLAND_BASE(x,z)<=.8){out.shore++;continue;}
  if(C.api.inBounds&&!C.api.inBounds(x,z)){out.outside++;continue;}
  const item={s,end,v},id=open.length;open.push(item);let list=grid.get(key(x,z));if(!list)grid.set(key(x,z),list=[]);list.push(id);
}
for(let id=0;id<open.length;id++){
  const a=open[id],v=a.v;let found=false;
  for(let x=Math.floor(v[3]-.03);x<=Math.floor(v[3]+.03);x++)for(let z=Math.floor(v[4]-.03);z<=Math.floor(v[4]+.03);z++)for(const j of grid.get(x+','+z)||[]){
    const b=open[j],w=b.v;if(j===id||a.end===b.end)continue;
    if(Math.max(Math.hypot(v[0]-w[0],v[1]-w[1]),Math.hypot(v[3]-w[3],v[4]-w[4]),Math.abs(v[2]-w[2]),Math.abs(v[5]-w[5]))<=.03)found=true;
  }
  if(found)out.pairedOpen++;else{out.unmatched++;if(out.sample.length<12)out.sample.push({where:'открытый торец',section:a.s,end:a.end,v});}
}
for(const count of ends){if(!count)out.untracked++;else if(count>1)out.duplicates++;}
out.worst=+out.worst.toFixed(6);out.ok=N>0&&(out.joins>0||out.bridges>0)&&!out.gap&&!out.step&&!out.unmatched&&!out.untracked&&!out.duplicates&&!d.crashlog.count();return out;
