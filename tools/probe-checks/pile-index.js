/* Общие вершины сезонной статики: реальные сугробы после загрузки буферов в GPU. */
await onShift();await wait(500);
const sea=d.season, stats=d.SEASMEM().index;
if(!sea||!stats.length)throw new Error('Нет сезонных склеек');
const sum=k=>stats.reduce((s,r)=>s+r[k],0), old=sea.value;
const checks=[];
try {
  sea.set(2.4);await wait(300);
  const drifts=[...sea.DRIFTS.values()].flat().filter(q=>q.mesh?.geometry.userData.pileIndex);
  const seen=new Set();
  for(const drift of drifts){
    const g=drift.mesh.geometry;if(seen.has(g)||!g.index)continue;
    seen.add(g);
    tp(drift.x+6,drift.z+6);await wait(200);
    const attr=g.attributes.position, before=attr.array?.slice();
    if(!before)throw new Error('У сугроба потеряны живые вершины');
    const start=drift.v0*3,end=(drift.v0+drift.nv)*3;
    if(end>before.length)throw new Error('Сугроб вне живого префикса');
    sea.burstDrift(drift,30);
    let changed=0,outside=0;
    for(let k=0;k<before.length;k++)if(before[k]!==attr.array[k]){if(k>=start&&k<end)changed++;else outside++;}
    checks.push({changed,outside,retained:before.length,keep:g.userData.pileIndex.keep*3});
    if(!changed||outside)throw new Error('Разрушение изменило чужую геометрию');
    // После настоящей загрузки изменённого диапазона — никаких WebGL-ошибок размера буфера.
    await wait(250);
    if(checks.length===6)break;
  }
  if(checks.length<3)throw new Error('Недостаточно проверенных склеек');
  for(const value of [0.5,1.6,2.4,3.4]){sea.set(value);await wait(300);}
  return {ok:true,cells:stats.length,before:sum('before'),after:sum('after'),mbBefore:+(sum('bytesBefore')/1048576).toFixed(2),mbAfter:+(sum('bytesAfter')/1048576).toFixed(2),indexMs:+sum('ms').toFixed(1),maxCellMs:+Math.max(...stats.map(r=>r.ms)).toFixed(1),checks,crash:d.crashlog.count()};
}finally{sea.set(old);}
