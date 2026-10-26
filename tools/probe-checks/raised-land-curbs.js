/* Камень вдоль фактической очищенной границы, без привязки к старым осям. */
await until(()=>d.RLAND?.ST.built&&!d.LATE.busy(),180000);
const L=d.RLAND;if(!L?.finalMask?.ready)throw Error('Окончательная область газона не собрана');
let edges=0,points=0,missing=0;const sample=[],stats={};
for(const edge of L.boundaries({stats,coalesce:false,accept:(x,z)=>d.RLAND_BASE(x,z)>.8})){
  if(!edge){await wait(0);continue;}
  const dx=edge.b[0]-edge.a[0],dz=edge.b[1]-edge.a[1],n=Math.max(3,Math.ceil(Math.hypot(dx,dz)));
  for(let i=0;i<n;i++){
    const t=(i+.5)/n,x=edge.a[0]+dx*t,z=edge.a[1]+dz*t;points++;
    if(!d.CURBS.near(x,z,.02)){missing++;if(sample.length<12)sample.push({x,z,a:edge.a,b:edge.b});}
  }
  if(++edges%1000===0)await wait(0);
}
return {complete:false,ok:edges>0&&!missing&&!d.crashlog.count(),edges,points,missing,stats,sample,crash:d.crashlog.count()};
