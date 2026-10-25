/* Обход всех уникальных секций бордюров curbs.js относительно фактической
   границы покрытий. Диагностика для 0п68, не критерий автоматического закрытия. */
await onShift();await wait(300);
const L=d.RLAND,a=d.CURBS.segs,home=[d.V.x,d.V.z],seen=new Set(),counts={},strictCounts={},examples={};
if(!L?.ST.built||!a?.length)throw new Error('Нужны ?raisedland и собранные бордюры');
let checked=0;
for(let i=0;i<a.length;i+=4){
  const ax=a[i],az=a[i+1],bx=a[i+2],bz=a[i+3],key=[ax,az,bx,bz].join(',');
  if(seen.has(key))continue;seen.add(key);
  const dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);if(len<.02)continue;
  const nx=-dz/len,nz=dx/len;
  const states=[];
  for(const t of len>.5?[.1,.5,.9]:[.5]){
    const x=ax+dx*t,z=az+dz*t;
    const side=[.12,.25,.5].map(r=>[L.onLand(x+nx*r,z+nz*r),L.onLand(x-nx*r,z-nz*r)]);
    let state=side.some(([left,right])=>left&&!right)?'boundary':side.some(([left,right])=>!left&&right)?'reversed':side.some(([left,right])=>left||right)?'insideLand':'insidePaving';
    const strict=side[0][0]&&!side[0][1]?'boundary':side[0][0]&&side[0][1]?'insideLand':!side[0][0]&&side[0][1]?'reversed':'insidePaving';
    strictCounts[strict]=(strictCounts[strict]||0)+1;
    states.push(state);
    if(state!=='boundary'){
      const row={x:+x.toFixed(3),z:+z.toFixed(3),length:+len.toFixed(3),side,dist:+Math.hypot(x-home[0],z-home[1]).toFixed(1)};
      const out=examples[state]||(examples[state]=[]);out.push(row);out.sort((p,q)=>p.dist-q.dist);if(out.length>12)out.pop();
    }
  }
  const state=states.every(s=>s==='boundary')?'boundary':states.every(s=>s===states[0])?states[0]:'partial';
  counts[state]=(counts[state]||0)+1;checked++;
  if(checked%2000===0)await wait(0);
}
return {complete:false,checked,counts,strictCounts,examples,crash:d.crashlog.count()};
