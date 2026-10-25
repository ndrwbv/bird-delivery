/* 0п68: повторное раскрытие фактической земли ищет оставшиеся тонкие
   области. Диагностика формы, не закрытие всей задачи о бордюрах. */
await until(()=>d.RLAND?.ST.built&&!d.LATE.busy(),180000);
const L=d.RLAND,area=p=>Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-a[1]*b[0];},0))/2;
if(!L?.ST.built)throw Error('Поднятая земля не собралась');
let cells=0,residualArea=0,large=0,worst=0;const sample=[];
for(const core of L.cover.cells()){
  if(d.CURBS.api.inBounds&&![[core[0],core[1]],[core[2],core[3]],[(core[0]+core[2])/2,(core[1]+core[3])/2]].some(p=>d.CURBS.api.inBounds(...p,-40)))continue;
  for(const p of L.widthPatches(core)){
    const a=area(p.outer)-p.holes.reduce((s,h)=>s+area(h),0);if(a<1e-6)continue;
    residualArea+=a;worst=Math.max(worst,a);
    if(a>.02){large++;sample.push({core,area:+a.toFixed(4),outer:p.outer});sample.sort((a,b)=>b.area-a.area);if(sample.length>12)sample.pop();}
  }
  cells++;if(cells%10===0)await wait(0);
}
return {complete:false,stats:L.ST,cells,large,residualArea:+residualArea.toFixed(3),worst:+worst.toFixed(4),sample,crash:d.crashlog.count()};
