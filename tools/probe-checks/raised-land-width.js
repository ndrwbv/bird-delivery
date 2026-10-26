/* 0п68: независимые поперечные лучи по окончательной области газона.
   Проверяем также границы у стен; готовность всех бордюров — отдельно. */
await until(()=>d.RLAND?.ST.built&&!d.LATE.busy(),180000);
const L=d.RLAND;if(!L?.finalMask?.ready)throw Error('Окончательная область газона не собрана');
const stats={},sample=[];let edges=0,points=0,narrow=0,min=2;
for(const edge of L.boundaries({includeWalls:true,stats,coalesce:false,accept:(x,z)=>d.RLAND_BASE(x,z)>.8})){
  if(!edge){await wait(0);continue;}
  for(const t of [.17,.5,.83]){
    const width=L.widthAt(edge,t);points++;min=Math.min(min,width);
    if(width+.001<L.ST.minWidth){
      narrow++;sample.push({a:edge.a,b:edge.b,t,width:+width.toFixed(5)});
      sample.sort((a,b)=>a.width-b.width);if(sample.length>12)sample.pop();
    }
  }
  if(++edges%1000===0)await wait(0);
}
return {complete:false,ok:edges>0&&!narrow&&!d.crashlog.count(),stats:L.ST,boundary:stats,edges,points,narrow,min:+min.toFixed(5),sample,crash:d.crashlog.count()};
